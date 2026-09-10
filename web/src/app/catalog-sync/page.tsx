"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { CatalogApplyResult, CatalogDiff, Study } from "@/lib/types";
import { useToast } from "@/components/Toast";

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CatalogSyncPage() {
  const toast = useToast();

  const [studies, setStudies] = useState<Study[]>([]);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [diff, setDiff] = useState<CatalogDiff | null>(null);
  const [applied, setApplied] = useState<CatalogApplyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .listStudies()
      .then((s) => {
        setStudies(s);
        if (s.length > 0) setStudyId((cur) => cur ?? s[0].id);
      })
      .catch(() => setErr("Backend unreachable (start it on :8000)."));
  }, []);

  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Something went wrong";
      setErr(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  };

  const studyName = studies.find((s) => s.id === studyId)?.name ?? "";

  const download = () =>
    guarded(async () => {
      if (!studyId) return;
      const text = await api.exportCatalogCsv(studyId);
      downloadCsv(`${studyName || "study"}-catalog.csv`, text);
      toast("success", "Catalog CSV downloaded");
    });

  const preview = () =>
    guarded(async () => {
      if (!studyId) return;
      const d = await api.previewCatalog(studyId, csvText);
      setDiff(d);
      setApplied(null);
    });

  const apply = () =>
    guarded(async () => {
      if (!studyId) return;
      const r = await api.applyCatalog(studyId, csvText);
      setApplied(r);
      setDiff(null);
      toast("success", `Applied: ${r.created} created · ${r.updated} updated · ${r.unchanged} unchanged`);
    });

  const onFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setDiff(null);
      setApplied(null);
    };
    reader.readAsText(file);
  };

  const canApply = !!diff && diff.errors.length === 0 && (diff.creates.length > 0 || diff.updates.length > 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-5 py-3">
        <h1 className="text-lg font-semibold">Catalog Sync</h1>
        <span className="text-sm text-neutral-500">One master spreadsheet for the whole task catalog</span>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        {err && <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        {/* what this is */}
        <section className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">The master task list for the whole team, in one spreadsheet.</p>
          <p className="mt-1 text-blue-800">
            Download it, edit tasks and rep targets in Excel or Numbers, then upload it back —
            CharmQuark shows you exactly what will change before anything is saved. Matching is by{" "}
            <span className="font-mono">task_code</span>: existing rows update, blank codes create new tasks.
          </p>
          <p className="mt-2 text-xs text-blue-700">
            Not the same as the per-session CSV you get when you accept a scheduled session — that one is for
            one collection session; this is the whole catalog.
          </p>
        </section>

        {/* study picker + export */}
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-800">1 · Export current catalog</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Download every task as a CSV, edit it in a spreadsheet, then re-upload below to upsert.
          </p>
          <div className="mt-4 flex items-end gap-4">
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-500">Study</span>
              <select
                value={studyId ?? ""}
                onChange={(e) => {
                  setStudyId(e.target.value || null);
                  setDiff(null);
                  setApplied(null);
                }}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              >
                {studies.length === 0 && <option value="">No studies</option>}
                {studies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={download}
              disabled={!studyId || busy}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              Download catalog CSV
            </button>
          </div>
        </section>

        {/* upload + preview */}
        <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-800">2 · Upload &amp; preview, then apply</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Paste the edited CSV, or choose a file. Keep the <span className="font-mono">task_code</span>{" "}
            column for existing rows; leave it blank for brand-new tasks. <b>Preview</b> shows the diff;
            nothing is saved until you press <b>Apply</b>.
          </p>
          <div className="mt-3">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="text-xs text-neutral-500 file:mr-3 file:rounded file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700"
            />
          </div>
          <textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setDiff(null);
              setApplied(null);
            }}
            rows={8}
            spellCheck={false}
            placeholder="task_code,group,name,reps_target,reps_actual,risk_level,legal_approval,duration_type,instructions_complete"
            className="mt-3 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={preview}
              disabled={!studyId || !csvText.trim() || busy}
              className="flex-1 rounded-md bg-teal-600 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {busy ? "Working…" : "Preview changes"}
            </button>
            <button
              onClick={apply}
              disabled={!canApply || busy}
              className="flex-1 rounded-md bg-neutral-900 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              Apply
            </button>
          </div>
        </section>

        {/* diff */}
        {diff && (
          <section className="mt-4 space-y-3">
            <div className="flex gap-3">
              <Stat label="Create" n={diff.creates.length} tone="green" />
              <Stat label="Update" n={diff.updates.length} tone="blue" />
              <Stat label="Unchanged" n={diff.unchanged} tone="neutral" />
              <Stat label="Errors" n={diff.errors.length} tone="red" />
            </div>

            {diff.errors.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <h3 className="text-sm font-semibold text-red-700">Errors — fix these before applying</h3>
                <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                  {diff.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            {diff.creates.length > 0 && (
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-neutral-800">New tasks</h3>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-400">
                      <th className="py-1 font-medium">Code</th>
                      <th className="py-1 font-medium">Name</th>
                      <th className="py-1 font-medium">Group</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {diff.creates.map((c, i) => (
                      <tr key={i}>
                        <td className="py-1.5 font-mono text-neutral-500">{c.task_code}</td>
                        <td className="py-1.5 text-neutral-800">{c.name}</td>
                        <td className="py-1.5 text-neutral-500">{c.group || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {diff.updates.length > 0 && (
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-neutral-800">Updated tasks</h3>
                <ul className="mt-2 divide-y divide-neutral-100">
                  {diff.updates.map((u) => (
                    <li key={u.task_code} className="py-2">
                      <span className="font-mono text-sm text-neutral-500">{u.task_code}</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {Object.entries(u.changes).map(([field, ch]) => (
                          <span
                            key={field}
                            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                          >
                            <span className="font-medium">{field}</span>: {ch.from} → {ch.to}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {applied && (
          <section className="mt-4 rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-neutral-800">Applied</h2>
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-green-700">{applied.created} created</span>
              <span className="text-blue-700">{applied.updated} updated</span>
              <span className="text-neutral-500">{applied.unchanged} unchanged</span>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Stat({ label, n, tone }: { label: string; n: number; tone: "green" | "blue" | "neutral" | "red" }) {
  const cls = {
    green: "bg-green-50 text-green-700",
    blue: "bg-blue-50 text-blue-700",
    neutral: "bg-neutral-100 text-neutral-600",
    red: "bg-red-50 text-red-700",
  }[tone];
  return (
    <div className={`flex-1 rounded-xl px-4 py-3 ${cls}`}>
      <div className="text-2xl font-semibold">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
