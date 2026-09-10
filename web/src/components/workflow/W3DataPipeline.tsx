"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { QARun, Session, Study } from "@/lib/types";
import type { LogFn } from "./types";
import { Field, GhostButton, Panel, PrimaryButton, selectClass } from "./ui";
import { Stepper } from "../Stepper";
import { DATA_PIPELINE, STAGE_LABEL } from "@/lib/metrics";

// Sessions that live on (or can enter) the data pipeline.
const PIPELINE_STATES = ["CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"];
const QA_PASS = "PASS";

/** Workflow 3 — Run the data pipeline.
 *  Pick a confirmed session and advance() it stage by stage. At Manual QA the runner
 *  creates the QA run (createQA) and passes every check (updateQACheck) so the backend
 *  gate opens and the session can proceed to Validated → Uploaded → Done. */
export function W3DataPipeline({
  canWrite,
  log,
  onProgress,
}: {
  canWrite: boolean;
  log: LogFn;
  onProgress: (currentIndex: number, doneIndex: number) => void;
}) {
  const [studies, setStudies] = useState<Study[]>([]);
  const [studyId, setStudyId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [qa, setQa] = useState<QARun | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listStudies().then((s) => {
      setStudies(s);
      if (s[0]) setStudyId((c) => c || s[0].id);
    }).catch(() => log("error", "Backend unreachable — start it on :8000."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSessions = useCallback(async (sid: string) => {
    const list = await api.listSessionsBy({ study_id: sid });
    setSessions(list.filter((s) => PIPELINE_STATES.includes(s.state)));
  }, []);

  useEffect(() => {
    if (!studyId) return;
    loadSessions(studyId).catch(() => setSessions([]));
    setSessionId("");
    setSession(null);
    setQa(null);
  }, [studyId, loadSessions]);

  const progress = useCallback(
    (s: Session | null) => {
      // step 0 pick, step 1 advance loop, step 2 done
      if (!s) return onProgress(0, -1);
      if (s.state === "DONE") return onProgress(2, 2);
      return onProgress(1, 0);
    },
    [onProgress],
  );

  const selectSession = async (id: string) => {
    setSessionId(id);
    if (!id) { setSession(null); setQa(null); return; }
    const s = await api.getSession(id);
    setSession(s);
    progress(s);
    log("action", `Selected session ${s.encoded_code ?? s.provisional_code ?? id.slice(0, 8)} — state ${s.state}.`);
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
      if (!session) return;
      const from = session.state;
      log("action", `Advancing from ${STAGE_LABEL[from] ?? from}…`);
      const s = await api.advanceSession(session.id);
      setSession(s);
      progress(s);
      await loadSessions(studyId);
      log("success", `Now at ${STAGE_LABEL[s.state] ?? s.state}.`);
      if (s.state === "MANUAL_QA") log("warn", "Manual QA gate: create the QA run and pass every check before you can advance to Validated.");
    });

  const startQa = () =>
    guard(async () => {
      if (!session) return;
      log("action", "Creating QA run…");
      const run = await api.createQA(session.id);
      setQa(run);
      const checks = run.gates.reduce((n, g) => n + g.check_items.length, 0);
      log("success", `QA run created — ${run.gates.length} gate(s), ${checks} check(s).`);
    });

  // Pass every check on the run (real updateQACheck calls, one per check), narrating each.
  const passAllChecks = () =>
    guard(async () => {
      if (!session || !qa) return;
      let run = qa;
      for (let gi = 0; gi < run.gates.length; gi++) {
        const gate = run.gates[gi];
        for (let ci = 0; ci < gate.check_items.length; ci++) {
          if (gate.check_items[ci].result === QA_PASS) continue;
          run = await api.updateQACheck(session.id, gi, ci, QA_PASS);
        }
        log("info", `Gate "${run.gates[gi].name}" → ${run.gates[gi].status.replace("_", " ")}.`);
      }
      setQa(run);
      log(run.overall_status === QA_PASS ? "success" : "warn", `QA verdict: ${run.overall_status.replace("_", " ")}.`);
    });

  const setCheck = (gi: number, ci: number, result: string) =>
    guard(async () => {
      if (!session) return;
      const run = await api.updateQACheck(session.id, gi, ci, result);
      setQa(run);
      log("info", `Set "${run.gates[gi].check_items[ci].name}" = ${result.toLowerCase()} → run ${run.overall_status.replace("_", " ")}.`);
    });

  const state = session?.state;
  const atQa = state === "MANUAL_QA";
  const qaBlocking = atQa && (!qa || qa.overall_status !== QA_PASS);
  const done = state === "DONE";

  return (
    <div className="space-y-4">
      <Panel title="Step 1 · Pick a session on the pipeline">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Study">
            <select value={studyId} onChange={(e) => setStudyId(e.target.value)} className={selectClass()}>
              {studies.length === 0 && <option value="">No studies</option>}
              {studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Session (confirmed or later)">
            <select value={sessionId} onChange={(e) => void selectSession(e.target.value)} className={selectClass()}>
              <option value="">— select —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8))} · {STAGE_LABEL[s.state] ?? s.state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {sessions.length === 0 && studyId && (
          <p className="mt-2 text-xs text-neutral-400">No confirmed sessions yet — confirm one in Workflow 2 first.</p>
        )}
      </Panel>

      {session && (
        <Panel title="Step 2 · Advance the pipeline">
          <div className="rounded-xl bg-neutral-50 p-3">
            <Stepper
              stages={PIPELINE_STAGES.map((k) => ({ key: k, label: STAGE_LABEL[k] }))}
              current={session.state}
            />
          </div>
          {canWrite ? (
            <div className="mt-3 flex items-center gap-3">
              <PrimaryButton onClick={advance} disabled={busy || done || qaBlocking}>
                {done ? "Pipeline complete" : `Advance from ${STAGE_LABEL[session.state] ?? session.state} →`}
              </PrimaryButton>
              <GhostButton onClick={() => session && void selectSession(session.id)} disabled={busy}>Refresh</GhostButton>
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
          Pipeline complete — session{" "}
          <span className="font-mono font-semibold">{session?.encoded_code ?? session?.provisional_code}</span> is
          DONE.
        </div>
      )}
    </div>
  );
}

// Confirmed onward, in pipeline order (for the horizontal stepper).
const PIPELINE_STAGES = ["CONFIRMED", "IN_EXECUTION", ...DATA_PIPELINE] as const;
