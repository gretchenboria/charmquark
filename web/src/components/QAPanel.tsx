"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { QACheckItem, QARun, QAVerdict } from "@/lib/types";
import { useToast } from "./Toast";

const RESULTS = ["NOT_CHECKED", "PASS", "ACCEPTABLE", "FAIL", "SKIP", "NOT_APPLICABLE", "RED_FLAG"];

/**
 * Status colours come from the brand's warm accent set, never the cool brand
 * ramp: sage = pass, apricot = attention, rose = fault, slate = idle. No cyan or
 * teal — see docs/BRAND.md. Inline styles rather than utility classes because
 * these are token-derived tints, and a tint is a value, not a class.
 */
const TONE: Record<string, string> = {
  pass: "var(--cq-sage)",
  warn: "var(--cq-apricot)",
  fail: "var(--cq-rose)",
  info: "var(--cq-slate)",
};

/** A chip painted in one accent: the accent for text, a wash of it behind. */
const chip = (tone: string, strength = 14) => ({
  color: tone,
  backgroundColor: `color-mix(in srgb, ${tone} ${strength}%, transparent)`,
});

const STATUS_TONE: Record<string, string> = {
  PASS: TONE.pass,
  IN_PROGRESS: TONE.warn,
  FAIL: TONE.fail,
  NOT_STARTED: TONE.info,
  WAIVED: TONE.info,
};

const VERDICT_COPY: Record<QAVerdict, { label: string; blurb: string; tone: string }> = {
  ACCEPT: {
    label: "Accept",
    blurb: "Every check passed. This run is clear to upload.",
    tone: TONE.pass,
  },
  ACCEPT_WITH_WARNINGS: {
    label: "Accept with warnings",
    blurb: "No hard failures, but flagged items need a human decision before upload.",
    tone: TONE.warn,
  },
  REJECT: {
    label: "Reject",
    blurb: "One or more hard failures. Fix or re-record before this run goes anywhere.",
    tone: TONE.fail,
  },
};

/** A human has moved a machine verdict. Worth saying out loud, in both directions. */
const isOverridden = (ci: QACheckItem): boolean =>
  Boolean(ci.machine_result) && ci.machine_result !== ci.result;

/**
 * QA panel for a run.
 *
 * Two modes share one shape. AUTOCHECK renders the six protocol steps a machine
 * evaluated against the run's manifest — each finding naming the sensor and file
 * it is about, and step 6's accept/reject verdict leading the panel. MANUAL is
 * the old hand-ticked checklist, still there for runs with nothing to read.
 *
 * In both modes a human can override any item, and an overridden item says so.
 */
export function QAPanel({ runId, canWrite }: { runId: string; canWrite: boolean }) {
  const toast = useToast();
  const [run, setRun] = useState<QARun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRun(await api.getQA(runId));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setRun(null);
    } finally {
      setLoading(false);
    }
  }, [runId]);
  useEffect(() => {
    load();
  }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      setRun(await api.createQA(runId));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not start QA");
    } finally {
      setBusy(false);
    }
  };

  /** Re-derive the manifest from the vault and re-run the six steps over it. */
  const recheck = async () => {
    setBusy(true);
    try {
      const next = await api.recheckQA(runId);
      setRun(next);
      toast("success", `Autocheck complete — ${next.verdict ? VERDICT_COPY[next.verdict].label : next.overall_status}`);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Autocheck failed");
    } finally {
      setBusy(false);
    }
  };

  const setResult = async (gi: number, ci: number, result: string) => {
    try {
      setRun(await api.updateQACheck(runId, gi, ci, result));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Update failed");
    }
  };

  if (loading) return null;

  const auto = run?.mode === "AUTOCHECK";
  const verdict = run?.verdict ? VERDICT_COPY[run.verdict] : null;

  return (
    <div className="mx-4 mt-4 rounded-xl bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          QA pipeline{auto ? " · autochecked" : ""}
        </span>
        {run && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={chip(STATUS_TONE[run.overall_status] ?? TONE.info)}
          >
            {run.overall_status.replace("_", " ")}
          </span>
        )}
      </div>

      {!run ? (
        <button
          onClick={start}
          disabled={!canWrite || busy}
          className="w-full rounded-md border border-neutral-300 py-1.5 text-xs font-medium text-neutral-700 hover:bg-white disabled:opacity-40"
        >
          {busy ? "Checking…" : "Start QA review"}
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Step 6 first: the accept/reject call is the actionable output, so it
              leads the panel rather than sitting at the bottom of six gates. */}
          {verdict && (
            <div
              className="rounded-lg border px-3 py-2"
              style={{ ...chip(verdict.tone, 10), borderColor: verdict.tone }}
            >
              <div className="text-xs font-semibold uppercase tracking-wide">{verdict.label}</div>
              <p className="mt-0.5 text-[11px] leading-snug text-[color:var(--cq-ink-soft)]">{verdict.blurb}</p>
            </div>
          )}

          {auto && (
            <div className="flex items-center justify-between gap-2 text-[10px] text-neutral-500">
              <span className="truncate">
                {run.profile_name ?? "default profile"}
                {run.autochecked_at ? ` · ${run.autochecked_at}` : ""}
              </span>
              <button
                onClick={recheck}
                disabled={!canWrite || busy}
                className="shrink-0 rounded border border-neutral-300 px-1.5 py-0.5 font-medium text-neutral-700 hover:bg-white disabled:opacity-40"
              >
                {busy ? "Re-checking…" : "Re-check"}
              </button>
            </div>
          )}

          {run.gates.map((g, gi) => (
            <div key={gi}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-neutral-700">
                  {g.step ? `${g.step}. ` : ""}
                  {g.name}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                  style={chip(STATUS_TONE[g.status] ?? TONE.info)}
                >
                  {g.status.replace("_", " ")}
                </span>
              </div>
              {g.check_items.map((ci, cidx) => (
                <div key={cidx} className="flex items-start justify-between gap-2 py-0.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {ci.level && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: TONE[ci.level] }}
                        />
                      )}
                      <span className="truncate text-neutral-600">{ci.name}</span>
                      {isOverridden(ci) && (
                        <span
                          className="shrink-0 rounded px-1 text-[9px] font-medium uppercase tracking-wide"
                          style={chip("var(--cq-iris)")}
                        >
                          overridden
                        </span>
                      )}
                    </div>
                    {/* The detail names the file or sensor. Without it a failure
                        is a mood; with it, it is a thing an operator can go fix. */}
                    {ci.detail && <p className="mt-0.5 pl-3 text-[10px] leading-snug text-neutral-500">{ci.detail}</p>}
                    {isOverridden(ci) && (
                      <p className="mt-0.5 pl-3 text-[10px] text-neutral-400">
                        machine said {ci.machine_result?.replace(/_/g, " ").toLowerCase()}
                      </p>
                    )}
                  </div>
                  <select
                    value={ci.result}
                    disabled={!canWrite}
                    onChange={(e) => setResult(gi, cidx, e.target.value)}
                    className="mt-0.5 shrink-0 rounded border border-neutral-300 px-1 py-0.5 text-[11px] disabled:opacity-60"
                  >
                    {RESULTS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, " ").toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
