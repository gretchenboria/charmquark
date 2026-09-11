"use client";

// Configuration bundle: download this deployment's configuration as one JSON file, or
// plan and apply an edited one. The same endpoints the cq CLI and the plan_config /
// apply_config agent tools use, so doing it by hand is never second-class.
import { useState } from "react";

import { api, ApiError } from "@/lib/api";
import type { ConfigPlanReport } from "@/lib/types";
import { useToast } from "@/components/Toast";

const show = (v: unknown) => {
  const s = JSON.stringify(v ?? null);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
};

const SIGN = { create: "+", update: "~", delete: "−" } as const;

export function ConfigBundlePanel({ canPlan, onApplied }: { canPlan: boolean; onApplied: () => void }) {
  const toast = useToast();
  const [bundle, setBundle] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [prune, setPrune] = useState(false);
  const [plan, setPlan] = useState<ConfigPlanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    try {
      const b = await api.exportConfig();
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(b, null, 2)}\n`], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `charmquark-config-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not export the configuration");
    }
  };

  const runPlan = async (b: unknown, withPrune: boolean) => {
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      setPlan(await api.planConfig(b, withPrune));
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not plan the bundle");
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setBundle(parsed);
      await runPlan(parsed, prune);
    } catch {
      setBundle(null);
      setPlan(null);
      setError(`${file.name} is not valid JSON`);
    }
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const result = await api.applyConfig(bundle, prune, plan.digest);
      const s = result.summary;
      toast(
        result.status === "APPLIED" ? "success" : "error",
        `${result.status === "APPLIED" ? "Applied" : "Partly applied"}: ${s.create} created, ${s.update} updated, ${s.delete} deleted, ${s.settings} setting(s), ${s.workflows} workflow(s)`,
      );
      setPlan(null);
      setBundle(null);
      setFileName("");
      onApplied();
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Apply failed");
    } finally {
      setBusy(false);
    }
  };

  const changes = plan ? plan.summary.create + plan.summary.update + plan.summary.delete + plan.summary.settings + plan.summary.workflows : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        The whole configuration (records, settings and workflows) as one file. Edit it, then plan it here to see every change before
        applying. Records you leave out are kept unless you choose to delete them. The <code>cq</code> command-line tool does the same with
        one file per record type.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50" onClick={download}>
          Download bundle
        </button>
        {canPlan && (
          <>
            <label className="cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
              Plan a bundle file…
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Bundle file"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="inline-flex items-center gap-1 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={prune}
                onChange={(e) => {
                  setPrune(e.target.checked);
                  if (bundle) void runPlan(bundle, e.target.checked);
                }}
              />
              Delete records the bundle leaves out
            </label>
          </>
        )}
      </div>

      {busy && <p className="text-sm text-neutral-400">Working…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {plan && (
        <div className="space-y-3 rounded border border-neutral-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-neutral-800">
              Plan for {fileName}: {plan.summary.create} to create, {plan.summary.update} to update, {plan.summary.delete} to delete,{" "}
              {plan.summary.settings} setting(s), {plan.summary.workflows} workflow(s)
            </div>
            <button
              className="cq-btn-primary px-3 py-1.5 text-sm"
              disabled={busy || !plan.ok || changes === 0}
              onClick={apply}
            >
              Apply
            </button>
          </div>
          {!plan.ok && <p className="text-red-700">{plan.problem_count} problem(s): nothing can be applied until they are fixed.</p>}
          {plan.ok && changes === 0 && <p className="text-neutral-500">Nothing to change: the bundle matches this deployment.</p>}
          {plan.problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-red-700">
              {plan.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          <ul className="divide-y divide-neutral-100 font-mono text-xs">
            {plan.records.map((r) => (
              <li key={r.index} className="py-1.5">
                <div className={r.op === "delete" ? "text-red-700" : "text-neutral-800"}>
                  {SIGN[r.op]} {r.resource} {r.op === "create" ? `(new${r.ref ? `, ref ${r.ref}` : ""})` : r.id}
                </div>
                {r.op !== "delete" &&
                  Object.entries(r.diff).map(([k, d]) => (
                    <div key={k} className="pl-4 text-neutral-500">
                      {k}: {r.op === "create" ? show(d.to) : `${show(d.from)} → ${show(d.to)}`}
                    </div>
                  ))}
                {r.problems.map((p, i) => <div key={i} className="pl-4 text-red-700">! {p}</div>)}
              </li>
            ))}
            {plan.settings.map((s) => (
              <li key={s.key} className="py-1.5 text-neutral-800">
                ~ setting {s.key}: {show(s.from)} → {show(s.to)}
              </li>
            ))}
            {plan.workflows.map((w, i) => (
              <li key={`wf-${i}`} className={`py-1.5 ${w.op === "delete" ? "text-red-700" : "text-neutral-800"}`}>
                {SIGN[w.op]} workflow &quot;{w.name}&quot;
                {w.op === "update" && ` (${[w.name_changed && "renamed", w.xml_changed && "diagram changed"].filter(Boolean).join(", ")})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
