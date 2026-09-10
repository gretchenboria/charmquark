"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import type {
  DeviceFleet,
  Lab,
  Operator,
  Robot,
  Readiness,
  Session,
  SessionState,
  Study,
  TaskGroup,
} from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { ExecuteSession } from "@/components/ExecuteSession";
import { SessionFiles } from "@/components/SessionFiles";
import { STATE_META } from "@/components/StatusDot";
import { canWriteSession } from "@/lib/session";
import { useUser } from "@/lib/useUser";

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const canEdit = canWriteSession(user?.role);
  const [session, setSession] = useState<Session | null>(null);
  const [executing, setExecuting] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [study, setStudy] = useState<Study | null>(null);
  const [group, setGroup] = useState<TaskGroup | null>(null);
  const [robot, setRobot] = useState<Robot | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [lab, setLab] = useState<Lab | null>(null);
  const [fleet, setFleet] = useState<DeviceFleet | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await api.getSession(id);
        setSession(s);
        setReadiness(await api.getReadiness(id));
        const [st, tg, p, o, l, f] = await Promise.all([
          api.getStudy(s.study_id),
          s.task_group_id ? api.getTaskGroup(s.task_group_id) : Promise.resolve(null),
          s.robot_id ? api.getRobot(s.robot_id) : Promise.resolve(null),
          s.operator_id ? api.getOperator(s.operator_id) : Promise.resolve(null),
          s.lab_id ? api.getLab(s.lab_id) : Promise.resolve(null),
          s.device_fleet_id ? api.getDeviceFleet(s.device_fleet_id) : Promise.resolve(null),
        ]);
        setStudy(st);
        setGroup(tg);
        setRobot(p);
        setOperator(o);
        setLab(l);
        setFleet(f);
      } catch {
        setErr("Failed to load session.");
      }
    })();
  }, [id]);

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!session) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const code = session.encoded_code ?? session.provisional_code ?? session.id;
  // Execute is only meaningful once a session is confirmed (or already underway/collected).
  // Before that, members may be missing or ineligible, so stop it at the door.
  const EXECUTABLE_STATES: SessionState[] = [
    "CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE",
  ];
  const canExecute = EXECUTABLE_STATES.includes(session.state);
  const executeReason = canExecute
    ? ""
    : session.state === "BLOCKED"
      ? "Resolve readiness issues first"
      : "Confirm the session first";
  const rows = session.collected_rows ?? [];
  // Columns worth showing, in order; only render those with at least one non-empty value.
  const COLLECTED_COLS: { key: string; label: string }[] = [
    { key: "task", label: "Task" },
    { key: "variant", label: "Variant" },
    { key: "robot_id", label: "Robot" },
    { key: "payload", label: "Payload" },
    { key: "session_lab", label: "Lab" },
    { key: "device_name", label: "Device" },
    { key: "file_name", label: "File" },
    { key: "video_duration", label: "Duration" },
  ];
  const collectedCols = COLLECTED_COLS.filter((c) =>
    rows.some((r) => (r[c.key] ?? "").trim() !== ""),
  );
  const assembly = [
    { href: study ? `/studies/${study.id}` : undefined, label: `Study: ${study?.name ?? "—"}` },
    { label: `Task Group: ${group?.name ?? "—"}` },
    {
      href: robot ? `/robots/${robot.id}` : undefined,
      label: `Robot: ${robot?.robot_code ?? "—"}`,
    },
    {
      href: operator ? `/operators/${operator.id}` : undefined,
      label: `Robot Operator: ${operator?.operator_code ?? "—"}`,
    },
    {
      href: lab ? `/labs/${lab.id}` : undefined,
      label: `Lab: ${lab?.name ?? "—"}`,
    },
    { label: `Device Fleet: ${fleet?.name ?? "—"}` },
  ];

  return (
    <>
    <DetailPage
      title={code}
      subtitle={STATE_META[session.state].label}
      backHref="/schedule"
      backLabel="Schedule"
      actions={
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setExecuting(true)}
            disabled={!canExecute}
            title={executeReason}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            Execute
          </button>
          {!canExecute && <span className="text-xs text-neutral-400">{executeReason}</span>}
        </div>
      }
      fields={[
        { label: "State", value: STATE_META[session.state].label },
        { label: "Slot date", value: session.slot_date ?? "unscheduled" },
        { label: "Task scope", value: session.task_scope },
        { label: "Provisional code", value: session.provisional_code ?? "—" },
        { label: "Encoded code", value: session.encoded_code ?? "—" },
      ]}
    >
      <Section title="Assembly">
        <LinkList items={assembly} />
      </Section>
      <Section title="Readiness">
        {readiness?.ready ? (
          <p className="text-sm text-green-700">✓ All assembly items eligible — ready to confirm.</p>
        ) : (
          <LinkList
            items={(readiness?.issues ?? []).map((i) => ({ label: `${i.member}: ${i.reason}` }))}
            empty="No issues."
          />
        )}
      </Section>
      <Section title="Collected data">
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-400">No collected data uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-200 bg-white">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs text-neutral-400">
                  {collectedCols.map((c) => (
                    <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r, i) => (
                  <tr key={i}>
                    {collectedCols.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-3 py-2 text-neutral-800">
                        {r[c.key] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Files">
        <SessionFiles sessionId={session.id} canEdit={canEdit} />
      </Section>
    </DetailPage>
    {executing && (
      <ExecuteSession
        session={session}
        code={code}
        canEdit={canEdit}
        onClose={() => setExecuting(false)}
        onSaved={setSession}
      />
    )}
    </>
  );
}
