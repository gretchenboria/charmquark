"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { QARun } from "@/lib/types";
import { useToast } from "./Toast";

const RESULTS = ["NOT_CHECKED", "PASS", "ACCEPTABLE", "FAIL", "SKIP", "NOT_APPLICABLE", "RED_FLAG"];

const verdictColor: Record<string, string> = {
  PASS: "text-green-700 bg-green-50",
  NOT_STARTED: "text-neutral-500 bg-neutral-100",
  FAIL: "text-red-700 bg-red-50",
  FLAGGED: "text-red-700 bg-red-100",
};

/** QA panel for a run: gates + check items with per-item result; verdicts roll up live. */
export function QAPanel({ runId, canWrite }: { runId: string; canWrite: boolean }) {
  const toast = useToast();
  const [run, setRun] = useState<QARun | null>(null);
  const [loading, setLoading] = useState(true);

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
    try {
      setRun(await api.createQA(runId));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not start QA");
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

  return (
    <div className="mx-4 mt-4 rounded-xl bg-neutral-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">QA pipeline</span>
        {run && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${verdictColor[run.overall_status] ?? "bg-neutral-100 text-neutral-500"}`}>
            {run.overall_status.replace("_", " ")}
          </span>
        )}
      </div>

      {!run ? (
        <button
          onClick={start}
          disabled={!canWrite}
          className="w-full rounded-md border border-neutral-300 py-1.5 text-xs font-medium text-neutral-700 hover:bg-white disabled:opacity-40"
        >
          Start QA review
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          {run.gates.map((g, gi) => (
            <div key={gi}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-700">{g.name}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${verdictColor[g.status] ?? "bg-neutral-100 text-neutral-500"}`}>
                  {g.status.replace("_", " ")}
                </span>
              </div>
              {g.check_items.map((ci, cidx) => (
                <div key={cidx} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                  <span className="truncate text-neutral-600">{ci.name}</span>
                  <select
                    value={ci.result}
                    disabled={!canWrite}
                    onChange={(e) => setResult(gi, cidx, e.target.value)}
                    className="rounded border border-neutral-300 px-1 py-0.5 text-[11px] disabled:opacity-60"
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
