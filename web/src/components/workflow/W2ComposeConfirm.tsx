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
  Task,
  TaskGroup,
} from "@/lib/types";
import type { LogFn } from "./types";
import { Field, GhostButton, IssueLine, Panel, PrimaryButton, selectClass } from "./ui";

/** Workflow 2 — Compose & confirm a session.
 *  Create a DRAFT session, then assign the assembly one item at a time. Every pick calls
 *  assignSession() and then re-reads getReadiness(); both are narrated so the log
 *  explains the running readiness after each action. Confirm calls confirmSession()
 *  and surfaces the encoded code. */
export function W2ComposeConfirm({
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
  const [slotDate, setSlotDate] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
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

  useEffect(() => {
    if (!studyId) return;
    Promise.all([
      api.listTaskGroups(studyId),
      api.listTasks(studyId),
      api.listRobots(),
      api.listOperators(),
      api.listLabs(),
      api.listDeviceFleets(studyId),
    ]).then(([g, t, p, o, l, f]) => {
      setGroups(g); setTasks(t); setRobots(p); setOperators(o); setLabs(l); setFleets(f);
    }).catch(() => undefined);
  }, [studyId]);

  const progress = useCallback(
    (s: Session | null, r: Readiness | null) => {
      if (!s) return onProgress(0, -1);
      if (s.state === "CONFIRMED") return onProgress(3, 3);
      const anyMember = !!(s.robot_id && s.operator_id && s.lab_id && s.device_fleet_id &&
        (s.task_group_id || s.task_ids.length));
      if (r?.can_confirm) return onProgress(2, 2);
      if (anyMember) return onProgress(2, 1);
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
        if (r.issues.length === 0) log("success", "Readiness: no issues remaining — ready to confirm.");
        else {
          log("warn", `Readiness: ${r.issues.length} issue(s) remaining.`);
          for (const i of r.issues) log("info", `  · ${i.member}: ${i.reason}`);
        }
      }
      return r;
    },
    [log, progress],
  );

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      log("error", e instanceof ApiError ? e.friendly : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const createDraft = () =>
    guard(async () => {
      log("action", `Creating a draft session for ${studies.find((s) => s.id === studyId)?.name ?? studyId}${slotDate ? ` on ${slotDate}` : ""}…`);
      const s = await api.createSession({ study_id: studyId, slot_date: slotDate || undefined });
      setSession(s);
      log("success", `Draft session created (${s.provisional_code ?? s.id.slice(0, 8)}), state ${s.state}.`);
      await refreshReadiness(s, true);
    });

  const assign = (patch: SessionAssign, narrate: string) =>
    guard(async () => {
      if (!session) return;
      log("action", narrate);
      const s = await api.assignSession(session.id, patch);
      setSession(s);
      await refreshReadiness(s, true);
    });

  const confirm = () =>
    guard(async () => {
      if (!session) return;
      log("action", "Confirming session…");
      const s = await api.confirmSession(session.id);
      setSession(s);
      setReadiness(await api.getReadiness(s.id));
      progress(s, null);
      log("success", `Confirmed as ${s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8)} — state ${s.state}.`);
    });

  const issueFor = (member: string) => readiness?.issues.find((i) => i.member === member)?.reason;
  const confirmed = session?.state === "CONFIRMED";

  return (
    <div className="space-y-4">
      <Panel title="Step 1 · Start a session">
        {!session ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Study">
                <select value={studyId} onChange={(e) => setStudyId(e.target.value)} className={selectClass()}>
                  {studies.length === 0 && <option value="">No studies</option>}
                  {studies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Session date (optional)">
                <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className={selectClass()} />
              </Field>
            </div>
            {canWrite ? (
              <PrimaryButton onClick={createDraft} disabled={!studyId || busy}>Create draft session</PrimaryButton>
            ) : (
              <p className="text-xs text-neutral-400">Only a PM can create sessions.</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-neutral-700">{session.encoded_code ?? session.provisional_code ?? session.id.slice(0, 8)}</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{session.state}</span>
          </div>
        )}
      </Panel>

      {session && !confirmed && (
        <Panel title="Step 2 · Build assembly (each pick re-runs readiness)">
          <div className="space-y-3">
            <MemberSelect
              label="Tasks"
              value={session.task_scope === "SINGLE" ? (session.task_ids[0] ?? "") : (session.task_group_id ?? "")}
              options={
                session.task_scope === "SINGLE"
                  ? tasks.map((t) => ({ id: t.id, label: `${t.task_code} · ${t.name}${t.is_ready ? "" : " (not ready)"}` }))
                  : groups.map((g) => ({ id: g.id, label: `${g.name} (group)` }))
              }
              scopeToggle={
                <select
                  value={session.task_scope}
                  disabled={!canWrite || busy}
                  onChange={(e) =>
                    assign({ task_scope: e.target.value as "GROUP" | "SINGLE" }, `Switching task scope to ${e.target.value.toLowerCase()}…`)
                  }
                  className="rounded border border-neutral-300 px-1 py-1 text-xs"
                >
                  <option value="GROUP">group</option>
                  <option value="SINGLE">single</option>
                </select>
              }
              issue={issueFor("task")}
              disabled={!canWrite || busy}
              onPick={(id) => {
                const label =
                  session.task_scope === "SINGLE"
                    ? tasks.find((t) => t.id === id)?.task_code ?? id
                    : groups.find((g) => g.id === id)?.name ?? id;
                assign(
                  session.task_scope === "SINGLE" ? { task_ids: [id] } : { task_group_id: id },
                  `Set tasks to ${label}…`,
                );
              }}
            />
            <MemberSelect
              label="Robot"
              value={session.robot_id ?? ""}
              options={robots.map((p) => ({ id: p.id, label: `${p.robot_code}${p.is_cleared ? "" : " (not cleared)"}` }))}
              issue={issueFor("robot")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ robot_id: id }, `Assigned robot ${robots.find((p) => p.id === id)?.robot_code ?? id}…`)}
            />
            <MemberSelect
              label="Robot Operator"
              value={session.operator_id ?? ""}
              options={operators.map((o) => ({ id: o.id, label: `${o.operator_code} (${o.role})${o.is_active ? "" : " (inactive)"}` }))}
              issue={issueFor("operator")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ operator_id: id }, `Assigned robot operator ${operators.find((o) => o.id === id)?.operator_code ?? id}…`)}
            />
            <MemberSelect
              label="Lab"
              value={session.lab_id ?? ""}
              options={labs.map((l) => ({ id: l.id, label: `${l.name} · cap ${l.capacity}${l.is_available ? "" : " (unavailable)"}` }))}
              issue={issueFor("lab")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ lab_id: id }, `Assigned lab ${labs.find((l) => l.id === id)?.name ?? id}…`)}
            />
            <MemberSelect
              label="Device fleet"
              value={session.device_fleet_id ?? ""}
              options={fleets.map((f) => ({ id: f.id, label: f.name }))}
              issue={issueFor("device_fleet")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ device_fleet_id: id }, `Assigned device fleet ${fleets.find((f) => f.id === id)?.name ?? id}…`)}
            />
            {issueFor("inventory") && <IssueLine label="Inventory" reason={issueFor("inventory")} />}
          </div>
        </Panel>
      )}

      {session && (
        <Panel title="Step 3 · Readiness & confirm">
          {readiness && (
            <div className="mb-3 space-y-1.5">
              {readiness.issues.length === 0 ? (
                <IssueLine label="All assembly items eligible" />
              ) : (
                readiness.issues.map((i, idx) => <IssueLine key={idx} label={i.member} reason={i.reason} />)
              )}
            </div>
          )}
          {confirmed ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
              Confirmed. Encoded code:{" "}
              <span className="font-mono font-semibold">{session.encoded_code ?? "—"}</span>. This session is now on
              the data pipeline (Workflow 3).
            </div>
          ) : canWrite ? (
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={confirm} disabled={busy || !readiness?.can_confirm}>
                {readiness?.can_confirm ? "Confirm session" : "Not ready to confirm"}
              </PrimaryButton>
              <GhostButton onClick={() => session && void refreshReadiness(session, true)} disabled={busy}>
                Re-check
              </GhostButton>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Your role can’t confirm sessions.</p>
          )}
        </Panel>
      )}
    </div>
  );
}

function MemberSelect({
  label,
  value,
  options,
  issue,
  disabled,
  onPick,
  scopeToggle,
}: {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  issue?: string;
  disabled?: boolean;
  onPick: (id: string) => void;
  scopeToggle?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-500">{label}</span>
        {scopeToggle}
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${issue ? "bg-red-500" : value ? "bg-green-500" : "bg-neutral-300"}`} />
      </div>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className={selectClass()}
      >
        <option value="">— select —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {issue && <div className="mt-1 text-[11px] text-red-600">{issue}</div>}
    </div>
  );
}
