"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  DeviceFleet,
  Lab,
  Operator,
  Robot,
  Readiness,
  Session,
  SessionAssign,
  Study,
} from "@/lib/types";
import type { LogFn } from "./types";
import { Field, GhostButton, IssueLine, Panel, PrimaryButton, selectClass } from "./ui";

/** Workflow 4 — Handle a blocker.
 *  Find a session carrying a readiness issue (BLOCKED, or has issues), swap the offending
 *  member for an eligible one via assignSession(), re-check getReadiness(), and re-confirm. */
export function W4Blocker({
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
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [fleets, setFleets] = useState<DeviceFleet[]>([]);
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
    // Candidates for "handle a blocker": blocked, or still assembling/draft with issues.
    setSessions(list.filter((s) => ["BLOCKED", "ASSEMBLING", "DRAFT", "READY"].includes(s.state)));
  }, []);

  useEffect(() => {
    if (!studyId) return;
    Promise.all([
      loadSessions(studyId),
      api.listRobots().then(setRobots),
      api.listOperators().then(setOperators),
      api.listLabs().then(setLabs),
      api.listDeviceFleets(studyId).then(setFleets),
    ]).catch(() => undefined);
    setSessionId("");
    setSession(null);
    setReadiness(null);
  }, [studyId, loadSessions]);

  const progress = useCallback(
    (s: Session | null, r: Readiness | null) => {
      if (!s) return onProgress(0, -1);
      if (s.state === "CONFIRMED") return onProgress(3, 3);
      if (r && r.issues.length === 0) return onProgress(2, 2);
      return onProgress(1, 1);
    },
    [onProgress],
  );

  const refreshReadiness = useCallback(
    async (s: Session, announce: boolean) => {
      const r = await api.getReadiness(s.id);
      setReadiness(r);
      progress(s, r);
      if (announce) {
        if (r.issues.length === 0) log("success", "Readiness re-checked: no issues remaining.");
        else {
          log("warn", `Readiness: ${r.issues.length} issue(s) remaining.`);
          for (const i of r.issues) log("info", `  · ${i.member}: ${i.reason}`);
        }
      }
      return r;
    },
    [log, progress],
  );

  const selectSession = async (id: string) => {
    setSessionId(id);
    if (!id) { setSession(null); setReadiness(null); return; }
    const s = await api.getSession(id);
    setSession(s);
    log("action", `Selected ${s.encoded_code ?? s.provisional_code ?? id.slice(0, 8)} — state ${s.state}.`);
    await refreshReadiness(s, true);
  };

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { log("error", e instanceof ApiError ? e.friendly : "Action failed."); }
    finally { setBusy(false); }
  };

  const swap = (member: string, patch: SessionAssign, narrate: string) =>
    guard(async () => {
      if (!session) return;
      log("action", narrate);
      const s = await api.assignSession(session.id, patch);
      setSession(s);
      await loadSessions(studyId);
      await refreshReadiness(s, true);
    });

  const reconfirm = () =>
    guard(async () => {
      if (!session) return;
      log("action", "Re-confirming session…");
      const s = await api.confirmSession(session.id);
      setSession(s);
      setReadiness(await api.getReadiness(s.id));
      progress(s, null);
      log("success", `Re-confirmed as ${s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8)} — state ${s.state}.`);
    });

  const issues = readiness?.issues ?? [];
  const confirmed = session?.state === "CONFIRMED";

  // For each offending member, offer an eligible replacement dropdown.
  const swapControl = (member: string, reason: string) => {
    switch (member) {
      case "robot":
        return (
          <SwapRow
            reason={reason}
            options={robots.filter((p) => p.is_cleared).map((p) => ({ id: p.id, label: p.robot_code }))}
            disabled={!canWrite || busy}
            onPick={(id) => swap(member, { robot_id: id }, `Swapping robot → ${robots.find((p) => p.id === id)?.robot_code ?? id} (eligible)…`)}
          />
        );
      case "operator":
        return (
          <SwapRow
            reason={reason}
            options={operators.filter((o) => o.is_active).map((o) => ({ id: o.id, label: `${o.operator_code} (${o.role})` }))}
            disabled={!canWrite || busy}
            onPick={(id) => swap(member, { operator_id: id }, `Swapping robot operator → ${operators.find((o) => o.id === id)?.operator_code ?? id} (active)…`)}
          />
        );
      case "lab":
        return (
          <SwapRow
            reason={reason}
            options={labs.filter((l) => l.is_available).map((l) => ({ id: l.id, label: `${l.name} · cap ${l.capacity}` }))}
            disabled={!canWrite || busy}
            onPick={(id) => swap(member, { lab_id: id }, `Swapping lab → ${labs.find((l) => l.id === id)?.name ?? id} (available)…`)}
          />
        );
      case "device_fleet":
        return (
          <SwapRow
            reason={reason}
            options={fleets.map((f) => ({ id: f.id, label: f.name }))}
            disabled={!canWrite || busy}
            onPick={(id) => swap(member, { device_fleet_id: id }, `Swapping device fleet → ${fleets.find((f) => f.id === id)?.name ?? id}…`)}
          />
        );
      default:
        return (
          <p className="text-[11px] text-neutral-500">
            Fix this member in its own workflow (e.g. Workflow 1 for task readiness), then re-check.
          </p>
        );
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Step 1 · Pick a blocked / unready session">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Study">
            <select value={studyId} onChange={(e) => setStudyId(e.target.value)} className={selectClass()}>
              {studies.length === 0 && <option value="">No studies</option>}
              {studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Session">
            <select value={sessionId} onChange={(e) => void selectSession(e.target.value)} className={selectClass()}>
              <option value="">— select —</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8))} · {s.state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {sessions.length === 0 && studyId && (
          <p className="mt-2 text-xs text-neutral-400">No blocked or unready sessions for this study.</p>
        )}
      </Panel>

      {session && (
        <Panel title="Step 2 · Resolve each issue">
          {issues.length === 0 ? (
            <IssueLine label="No readiness issues" />
          ) : (
            <div className="space-y-4">
              {issues.map((i, idx) => (
                <div key={idx} className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                  <IssueLine label={i.member} reason={i.reason} />
                  <div className="mt-2">{swapControl(i.member, i.reason)}</div>
                </div>
              ))}
              {canWrite && (
                <GhostButton onClick={() => session && void refreshReadiness(session, true)} disabled={busy}>
                  Re-check readiness
                </GhostButton>
              )}
            </div>
          )}
        </Panel>
      )}

      {session && (
        <Panel title="Step 3 · Re-confirm">
          {confirmed ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
              Resolved and re-confirmed as{" "}
              <span className="font-mono font-semibold">{session.encoded_code ?? "—"}</span>.
            </div>
          ) : canWrite ? (
            <PrimaryButton onClick={reconfirm} disabled={busy || !readiness?.can_confirm}>
              {readiness?.can_confirm ? "Re-confirm session" : "Resolve all issues to re-confirm"}
            </PrimaryButton>
          ) : (
            <p className="text-xs text-neutral-400">Your role can’t confirm sessions.</p>
          )}
        </Panel>
      )}
    </div>
  );
}

function SwapRow({
  reason,
  options,
  disabled,
  onPick,
}: {
  reason: string;
  options: { id: string; label: string }[];
  disabled?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <select
        disabled={disabled || options.length === 0}
        defaultValue=""
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className={selectClass()}
      >
        <option value="">{options.length ? "— swap to an eligible option —" : "no eligible replacement available"}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <span className="sr-only">{reason}</span>
    </div>
  );
}
