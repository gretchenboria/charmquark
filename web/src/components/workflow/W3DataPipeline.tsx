"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { QARun, Run, Campaign } from "@/lib/types";
import type { LogFn } from "./types";
import { Field, GhostButton, Panel, PrimaryButton, selectClass } from "./ui";
import { Stepper } from "../Stepper";
import { DATA_PIPELINE, STAGE_LABEL } from "@/lib/metrics";

// Runs that live on (or can enter) the data pipeline.
const PIPELINE_STATES = ["CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"];
const QA_PASS = "PASS";

/** Workflow 3 — Run the data pipeline.
 *  Pick a confirmed run and advance() it stage by stage. At Manual QA the runner
 *  creates the QA run (createQA) and passes every check (updateQACheck) so the backend
 *  gate opens and the run can proceed to Validated → Uploaded → Done. */
export function W3DataPipeline({
  canWrite,
  log,
  onProgress,
}: {
  canWrite: boolean;
  log: LogFn;
  onProgress: (currentIndex: number, doneIndex: number) => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [qa, setQa] = useState<QARun | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listCampaigns().then((s) => {
      setCampaigns(s);
      if (s[0]) setCampaignId((c) => c || s[0].id);
    }).catch(() => log("error", "Backend unreachable — start it on :8000."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRuns = useCallback(async (sid: string) => {
    const list = await api.listRunsBy({ campaign_id: sid });
    setRuns(list.filter((s) => PIPELINE_STATES.includes(s.state)));
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    loadRuns(campaignId).catch(() => setRuns([]));
    setRunId("");
    setRun(null);
    setQa(null);
  }, [campaignId, loadRuns]);

  const progress = useCallback(
    (s: Run | null) => {
      // step 0 pick, step 1 advance loop, step 2 done
      if (!s) return onProgress(0, -1);
      if (s.state === "DONE") return onProgress(2, 2);
      return onProgress(1, 0);
    },
    [onProgress],
  );

  const selectRun = async (id: string) => {
    setRunId(id);
    if (!id) { setRun(null); setQa(null); return; }
    const s = await api.getRun(id);
    setRun(s);
    progress(s);
    log("action", `Selected run ${s.encoded_code ?? s.provisional_code ?? id.slice(0, 8)} — state ${s.state}.`);
    try {
      setQa(await api.getQA(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setQa(null);
    }
  };

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { log("error", e instanceof ApiError ? e.friendly : "Action failed."); }
    finally { setBusy(false); }
  };

  const advance = () =>
    guard(async () => {
      if (!run) return;
      const from = run.state;
      log("action", `Advancing from ${STAGE_LABEL[from] ?? from}…`);
      const s = await api.advanceRun(run.id);
      setRun(s);
      progress(s);
      await loadRuns(campaignId);
      log("success", `Now at ${STAGE_LABEL[s.state] ?? s.state}.`);
      if (s.state === "MANUAL_QA") log("warn", "Manual QA gate: create the QA run and pass every check before you can advance to Validated.");
    });

  const startQa = () =>
    guard(async () => {
      if (!run) return;
      log("action", "Creating QA run…");
      const qaRun = await api.createQA(run.id);
      setQa(qaRun);
      const checks = qaRun.gates.reduce((n, g) => n + g.check_items.length, 0);
      log("success", `QA run created — ${qaRun.gates.length} gate(s), ${checks} check(s).`);
    });

  // Pass every check on the run (real updateQACheck calls, one per check), narrating each.
  const passAllChecks = () =>
    guard(async () => {
      if (!run || !qa) return;
      let qaRun = qa;
      for (let gi = 0; gi < qaRun.gates.length; gi++) {
        const gate = qaRun.gates[gi];
        for (let ci = 0; ci < gate.check_items.length; ci++) {
          if (gate.check_items[ci].result === QA_PASS) continue;
          qaRun = await api.updateQACheck(run.id, gi, ci, QA_PASS);
        }
        log("info", `Gate "${qaRun.gates[gi].name}" → ${qaRun.gates[gi].status.replace("_", " ")}.`);
      }
      setQa(qaRun);
      log(qaRun.overall_status === QA_PASS ? "success" : "warn", `QA verdict: ${qaRun.overall_status.replace("_", " ")}.`);
    });

  const setCheck = (gi: number, ci: number, result: string) =>
    guard(async () => {
      if (!run) return;
      const qaRun = await api.updateQACheck(run.id, gi, ci, result);
      setQa(qaRun);
      log("info", `Set "${qaRun.gates[gi].check_items[ci].name}" = ${result.toLowerCase()} → QA ${qaRun.overall_status.replace("_", " ")}.`);
    });

  const state = run?.state;
  const atQa = state === "MANUAL_QA";
  const qaBlocking = atQa && (!qa || qa.overall_status !== QA_PASS);
  const done = state === "DONE";

  return (
    <div className="space-y-4">
      <Panel title="Step 1 · Pick a run on the pipeline">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Campaign">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectClass()}>
              {campaigns.length === 0 && <option value="">No campaigns</option>}
              {campaigns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Run (confirmed or later)">
            <select value={runId} onChange={(e) => void selectRun(e.target.value)} className={selectClass()}>
              <option value="">— select —</option>
              {runs.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8))} · {STAGE_LABEL[s.state] ?? s.state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {runs.length === 0 && campaignId && (
          <p className="mt-2 text-xs text-neutral-400">No confirmed runs yet — confirm one in Workflow 2 first.</p>
        )}
      </Panel>

      {run && (
        <Panel title="Step 2 · Advance the pipeline">
          <div className="rounded-xl bg-neutral-50 p-3">
            <Stepper
              stages={PIPELINE_STAGES.map((k) => ({ key: k, label: STAGE_LABEL[k] }))}
              current={run.state}
            />
          </div>
          {canWrite ? (
            <div className="mt-3 flex items-center gap-3">
              <PrimaryButton onClick={advance} disabled={busy || done || qaBlocking}>
                {done ? "Pipeline complete" : `Advance from ${STAGE_LABEL[run.state] ?? run.state} →`}
              </PrimaryButton>
              <GhostButton onClick={() => run && void selectRun(run.id)} disabled={busy}>Refresh</GhostButton>
            </div>
          ) : (
            <p className="mt-3 text-xs text-neutral-400">Your role can’t advance the pipeline.</p>
          )}
          {qaBlocking && (
            <p className="mt-2 text-xs text-amber-600">Blocked at Manual QA — complete the QA gate below to unlock the next stage.</p>
          )}
        </Panel>
      )}

      {atQa && (
        <Panel title="Manual QA gate">
          {!qa ? (
            <PrimaryButton onClick={startQa} disabled={!canWrite || busy}>Create QA run</PrimaryButton>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-500">
                  {qa.gates.reduce((n, g) => n + g.check_items.length, 0)} checks across {qa.gates.length} gates
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${qa.overall_status === QA_PASS ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-600"}`}>
                  {qa.overall_status.replace("_", " ")}
                </span>
              </div>
              {canWrite && (
                <GhostButton onClick={passAllChecks} disabled={busy}>Pass all checks</GhostButton>
              )}
              <div className="space-y-2">
                {qa.gates.map((g, gi) => (
                  <div key={gi}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-neutral-700">{g.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${g.status === QA_PASS ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"}`}>
                        {g.status.replace("_", " ")}
                      </span>
                    </div>
                    {g.check_items.map((ci, cidx) => (
                      <div key={cidx} className="flex items-center justify-between gap-2 py-0.5 text-xs">
                        <span className="truncate text-neutral-600">{ci.name}</span>
                        <select
                          value={ci.result}
                          disabled={!canWrite || busy}
                          onChange={(e) => void setCheck(gi, cidx, e.target.value)}
                          className="rounded border border-neutral-300 px-1 py-0.5 text-[11px]"
                        >
                          {["NOT_CHECKED", "PASS", "ACCEPTABLE", "FAIL", "SKIP", "NOT_APPLICABLE", "RED_FLAG"].map((r) => (
                            <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {done && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Pipeline complete — run{" "}
          <span className="font-mono font-semibold">{run?.encoded_code ?? run?.provisional_code}</span> is
          DONE.
        </div>
      )}
    </div>
  );
}

// Confirmed onward, in pipeline order (for the horizontal stepper).
const PIPELINE_STAGES = ["CONFIRMED", "IN_EXECUTION", ...DATA_PIPELINE] as const;
