"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, api } from "@/lib/api";
import type {
  DeviceFleet,
  Lab,
  Operator,
  Robot,
  Readiness,
  Session,
  SessionAssign,
  Task,
  TaskGroup,
} from "@/lib/types";
import { StatusDot } from "./StatusDot";
import { RoleRow } from "./RoleRow";
import { Stepper } from "./Stepper";
import { QAPanel } from "./QAPanel";
import { useToast } from "./Toast";
import { DATA_PIPELINE, STAGE_LABEL } from "@/lib/metrics";
import { EligiblePicker, type Candidate } from "./EligiblePicker";
import { TaskScopePicker } from "./TaskScopePicker";
import { ExecuteSession } from "./ExecuteSession";

type Role = "robot" | "operator" | "lab" | "device_fleet";

// Pre-confirm states where the PM/Fleet Lead can still confirm the plan.
const PRE_CONFIRM = ["DRAFT", "ASSEMBLING", "READY", "BLOCKED"];
// Post-collection stages the PM/Fleet Lead advances by hand (Collected → … → Uploaded).
// Confirmed → In Execution → Collected is driven by execute/finish, not this button.
const POST_COLLECTION_ADVANCE = ["COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED"];
const NEXT_STAGE: Record<string, string> = {
  COLLECTED: "EXTRACTED",
  EXTRACTED: "MANUAL_QA",
  MANUAL_QA: "VALIDATED",
  VALIDATED: "UPLOADED",
  UPLOADED: "DONE",
};

export function SessionInspector({
  sessionId,
  studyId,
  canWrite,
  canConfirm,
  onClose,
  onChanged,
}: {
  sessionId: string;
  studyId: string;
  canWrite: boolean;
  canConfirm: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fleets, setFleets] = useState<DeviceFleet[]>([]);
  const [picker, setPicker] = useState<Role | null>(null);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const [s, r, p, o, l, tg, tk, f] = await Promise.all([
      api.getSession(sessionId),
      api.getReadiness(sessionId),
      api.listRobots(),
      api.listOperators(),
      api.listLabs(),
      api.listTaskGroups(studyId),
      api.listTasks(studyId),
      api.listDeviceFleets(studyId),
    ]);
    setSession(s);
    setReadiness(r);
    setRobots(p);
    setOperators(o);
    setLabs(l);
    setTaskGroups(tg);
    setTasks(tk);
    setFleets(f);
  }, [sessionId, studyId]);

  useEffect(() => {
    load();
  }, [load]);

  const issueFor = (member: string): string | undefined =>
    readiness?.issues.find((i) => i.member === member)?.reason;

  const applySwap = async (patch: SessionAssign) => {
    setError(null);
    setPicker(null);
    setTaskPickerOpen(false);
    try {
      await api.assignSession(sessionId, patch);
      await load();
      onChanged();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Update failed");
    }
  };

  const confirm = async () => {
    setError(null);
    try {
      await api.confirmSession(sessionId);
      toast("success", "Session confirmed");
      await load();
      onChanged();
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Confirm failed";
      setError(msg);
      toast("error", msg);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this session?")) return;
    try {
      await api.deleteSession(sessionId);
      toast("success", "Session deleted");
      onChanged();
      onClose();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Delete failed");
    }
  };

  const advance = async () => {
    try {
      const s = await api.advanceSession(sessionId);
      toast("success", `Advanced to ${s.state.replace("_", " ").toLowerCase()}`);
      await load();
      onChanged();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Advance failed");
    }
  };

  const swapStandby = async () => {
    try {
      const r = await api.robotCancel(sessionId);
      toast(r.swapped_in ? "success" : "info", r.message);
      await load();
      onChanged();
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Swap failed");
    }
  };

  if (!session) {
    return (
      <aside className="w-[380px] shrink-0 border-l border-neutral-200 bg-white p-4">Loading…</aside>
    );
  }

  const nameOf = <T extends { id: string }>(list: T[], id: string | null, fmt: (x: T) => string) => {
    if (!id) return null;
    const found = list.find((x) => x.id === id);
    return found ? fmt(found) : null;
  };

  const pickerCandidates = (role: Role): Candidate[] => {
    switch (role) {
      case "robot":
        return robots.map((p) => ({
          id: p.id,
          label: p.is_standby ? `${p.robot_code} · standby` : p.robot_code,
          eligible: p.is_cleared,
          reason: p.is_cleared ? undefined : "not cleared (consent/booking/Ask)",
        }));
      case "operator":
        return operators.map((o) => ({
          id: o.id,
          label: `${o.operator_code} (${o.role})`,
          eligible: o.is_active,
          reason: o.is_active ? undefined : "inactive",
        }));
      case "lab":
        return labs.map((l) => ({
          id: l.id,
          label: `${l.name} · cap ${l.capacity}`,
          eligible: l.is_available,
          reason: l.is_available ? undefined : "unavailable",
        }));
      case "device_fleet":
        return fleets.map((f) => ({ id: f.id, label: f.name, eligible: true }));
    }
  };

  const pickerTitle: Record<Role, string> = {
    robot: "Swap Robot",
    operator: "Swap Robot Operator",
    lab: "Swap Lab",
    device_fleet: "Swap Device Fleet",
  };

  const onPick = (role: Role) => (id: string) => {
    const patch: SessionAssign =
      role === "robot"
        ? { robot_id: id }
        : role === "operator"
        ? { operator_id: id }
        : role === "lab"
        ? { lab_id: id }
        : { device_fleet_id: id };
    void applySwap(patch);
  };

  // Task-row value + label reflect group-vs-single scope.
  const taskValue =
    session.task_scope === "SINGLE"
      ? session.task_ids.length
        ? `${session.task_ids.length} task(s): ` +
          session.task_ids.map((id) => tasks.find((t) => t.id === id)?.task_code ?? "?").join(", ")
        : null
      : nameOf(taskGroups, session.task_group_id, (t) => `${t.name} (group)`);

  const code = session.encoded_code ?? session.provisional_code ?? "—";

  return (
    <aside className="relative w-[380px] shrink-0 overflow-y-auto border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <div>
          <div className="font-mono text-sm text-neutral-800">{code}</div>
          <div className="mt-0.5">
            <StatusDot state={session.state} />
          </div>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
          ✕
        </button>
      </div>

      <div className="px-4 pb-2 pt-1 text-xs text-neutral-500">
        {session.slot_date ?? "unscheduled"}
      </div>

      <div className="px-4">
        <RoleRow
          label="Tasks"
          value={taskValue}
          issue={issueFor("task")}
          canSwap={canConfirm}
          onSwap={() => setTaskPickerOpen(true)}
        />
        <RoleRow
          label="Robot"
          value={nameOf(robots, session.robot_id, (p) => p.robot_code)}
          issue={issueFor("robot")}
          canSwap={canConfirm}
          onSwap={() => setPicker("robot")}
        />
        <RoleRow
          label="Robot Operator"
          value={nameOf(operators, session.operator_id, (o) => o.operator_code)}
          issue={issueFor("operator")}
          canSwap={canConfirm}
          onSwap={() => setPicker("operator")}
        />
        <RoleRow
          label="Lab"
          value={nameOf(labs, session.lab_id, (l) => l.name)}
          issue={issueFor("lab")}
          canSwap={canConfirm}
          onSwap={() => setPicker("lab")}
        />
        <RoleRow
          label="Device Fleet"
          value={nameOf(fleets, session.device_fleet_id, (f) => f.name)}
          issue={issueFor("device_fleet")}
          canSwap={canConfirm}
          onSwap={() => setPicker("device_fleet")}
        />
      </div>

      {issueFor("inventory") && (
        <div className="mx-4 mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
          Inventory: {issueFor("inventory")}
        </div>
      )}

      {/* Run entry — the robot operator's one verb. Opens the field view in place (no page jump). */}
      {(session.state === "CONFIRMED" || session.state === "IN_EXECUTION") && canWrite && (
        <button
          onClick={() => setExecuting(true)}
          className="mx-4 mt-4 block w-[calc(100%-2rem)] rounded-md bg-teal-600 py-2 text-center text-sm font-medium text-white hover:bg-teal-700"
        >
          {session.state === "IN_EXECUTION" ? "Continue execution →" : "Open & execute →"}
        </button>
      )}

      {/* Data pipeline stepper — shown once the session is on the pipeline (Confirmed+). */}
      {DATA_PIPELINE.includes(session.state as (typeof DATA_PIPELINE)[number]) || session.state === "CONFIRMED" || session.state === "IN_EXECUTION" ? (
        <div className="mx-4 mt-4 rounded-xl bg-neutral-50 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Data pipeline</div>
          <Stepper
            stages={(["IN_EXECUTION", ...DATA_PIPELINE] as string[]).map((k) => ({ key: k, label: STAGE_LABEL[k] }))}
            current={session.state}
          />
          {/* Progression to Collected happens automatically when the robot operator finishes.
              Post-collection stages are advanced by the PM/Fleet Lead. */}
          {canConfirm && POST_COLLECTION_ADVANCE.includes(session.state) && (
            <button onClick={advance} className="mt-3 w-full rounded-md border border-neutral-300 py-1.5 text-xs font-medium text-neutral-700 hover:bg-white">
              Advance to {STAGE_LABEL[NEXT_STAGE[session.state]] ?? "next stage"} →
            </button>
          )}
        </div>
      ) : null}

      {/* QA panel — available once data has been collected (runs alongside the pipeline). */}
      {["COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"].includes(session.state) && (
        <QAPanel sessionId={sessionId} canWrite={canWrite} />
      )}

      {session.collected_rows && session.collected_rows.length > 0 && (
        <div className="mx-4 mt-3 text-xs text-neutral-500">
          {session.collected_rows.length} row{session.collected_rows.length === 1 ? "" : "s"} collected
        </div>
      )}

      {canWrite ? (
        <div className="sticky bottom-0 mt-3 border-t border-neutral-100 bg-white px-4 py-3">
          {error && <div className="mb-2 text-xs text-red-600">{error}</div>}
          {canConfirm && PRE_CONFIRM.includes(session.state) && (
            <button
              onClick={confirm}
              disabled={!readiness?.can_confirm}
              className="w-full rounded-md bg-teal-600 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {readiness?.can_confirm ? "Confirm session" : "Not ready to confirm"}
            </button>
          )}
          {canConfirm && (
            <button onClick={remove} className="mt-2 w-full rounded-md py-1.5 text-xs text-red-600 hover:bg-red-50">
              Delete session
            </button>
          )}
          {canConfirm && session.robot_id && (
            <button
              onClick={swapStandby}
              className="mt-2 w-full rounded-md border border-neutral-300 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Robot cancelled — swap in standby
            </button>
          )}
          {!canConfirm && (
            <p className="text-xs text-neutral-500">
              Planning is managed by the PM / Fleet Lead. Use <b>Open &amp; execute</b> to run this session.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500">
          Read-only — your role can’t edit sessions.
        </div>
      )}

      {picker && canConfirm && (
        <EligiblePicker
          title={pickerTitle[picker]}
          candidates={pickerCandidates(picker)}
          onPick={onPick(picker)}
          onClose={() => setPicker(null)}
        />
      )}

      {taskPickerOpen && canConfirm && (
        <TaskScopePicker
          groups={taskGroups}
          tasks={tasks}
          currentScope={session.task_scope}
          currentGroupId={session.task_group_id}
          currentTaskIds={session.task_ids}
          onApply={(patch) => void applySwap(patch)}
          onClose={() => setTaskPickerOpen(false)}
        />
      )}

      {executing && (
        <ExecuteSession
          session={session}
          code={code}
          canEdit={canWrite}
          onClose={() => setExecuting(false)}
          onSaved={(s) => {
            setSession(s);
            onChanged();
          }}
        />
      )}
    </aside>
  );
}
