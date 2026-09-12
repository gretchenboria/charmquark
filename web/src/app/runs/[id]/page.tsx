"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import type {
  SensorRig,
  Lab,
  Operator,
  Robot,
  Readiness,
  Run,
  RunState,
  Campaign,
  MissionGroup,
} from "@/lib/types";
import { DetailPage, LinkList, Section } from "@/components/DetailPage";
import { FieldGrid } from "@/components/FieldGrid";
import { ActivityPanel } from "@/components/ActivityPanel";
import { ExecuteRun } from "@/components/ExecuteRun";
import { EntityFiles } from "@/components/EntityFiles";
import { STATE_META } from "@/components/StatusDot";
import { canWriteRun } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import { LifecycleChevrons } from "@/components/LifecycleChevrons";

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useUser();
  const canEdit = canWriteRun(user?.role);
  const [run, setRun] = useState<Run | null>(null);
  const [executing, setExecuting] = useState(false);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [group, setGroup] = useState<MissionGroup | null>(null);
  const [robot, setRobot] = useState<Robot | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [lab, setLab] = useState<Lab | null>(null);
  const [fleet, setFleet] = useState<SensorRig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await api.getRun(id);
        setRun(s);
        setReadiness(await api.getReadiness(id));
        const [st, tg, p, o, l, f] = await Promise.all([
          api.getCampaign(s.campaign_id),
          s.mission_group_id ? api.getMissionGroup(s.mission_group_id) : Promise.resolve(null),
          s.robot_id ? api.getRobot(s.robot_id) : Promise.resolve(null),
          s.operator_id ? api.getOperator(s.operator_id) : Promise.resolve(null),
          s.lab_id ? api.getLab(s.lab_id) : Promise.resolve(null),
          s.sensor_rig_id ? api.getSensorRig(s.sensor_rig_id) : Promise.resolve(null),
        ]);
        setCampaign(st);
        setGroup(tg);
        setRobot(p);
        setOperator(o);
        setLab(l);
        setFleet(f);
      } catch {
        setErr("Failed to load run.");
      }
    })();
  }, [id]);

  if (err) return <div className="p-6 text-sm text-red-600">{err}</div>;
  if (!run) return <div className="p-6 text-sm text-neutral-400">Loading…</div>;

  const code = run.encoded_code ?? run.provisional_code ?? run.id;
  // Execute is only meaningful once a run is confirmed (or already underway/collected).
  // Before that, members may be missing or ineligible, so stop it at the door.
  const EXECUTABLE_STATES: RunState[] = [
    "CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE",
  ];
  const canExecute = EXECUTABLE_STATES.includes(run.state);
  const executeReason = canExecute
    ? ""
    : run.state === "BLOCKED"
      ? "Resolve readiness issues first"
      : "Confirm the run first";
  const rows = run.collected_rows ?? [];
  // Columns worth showing, in order; only render those with at least one non-empty value.
  const COLLECTED_COLS: { key: string; label: string }[] = [
    { key: "mission", label: "Mission" },
    { key: "variant", label: "Variant" },
    { key: "robot_id", label: "Robot" },
    { key: "payload", label: "Payload" },
    { key: "run_lab", label: "Lab" },
    { key: "device_name", label: "Sensor" },
    { key: "file_name", label: "File" },
    { key: "video_duration", label: "Duration" },
  ];
  const collectedCols = COLLECTED_COLS.filter((c) =>
    rows.some((r) => (r[c.key] ?? "").trim() !== ""),
  );
  const assembly = [
    { href: campaign ? `/campaigns/${campaign.id}` : undefined, label: `Campaign: ${campaign?.name ?? "—"}` },
    { label: `Mission Group: ${group?.name ?? "—"}` },
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
    { label: `Sensor Rig: ${fleet?.name ?? "—"}` },
  ];

  return (
    <>
    <DetailPage
      editor={<FieldGrid resource="runs" record={run} onSaved={(u) => setRun((prev) => (prev ? { ...prev, ...u } : u))} />}
      title={code}
      subtitle={STATE_META[run.state].label}
      backHref="/schedule"
      backLabel="Schedule"
      actions={
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => setExecuting(true)}
            disabled={!canExecute}
            title={executeReason}
            className="rounded-md bg-[color:var(--cq-iris)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--cq-violet)] disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            Execute
          </button>
          {!canExecute && <span className="text-xs text-neutral-400">{executeReason}</span>}
        </div>
      }
      fields={[
        { label: "State", value: STATE_META[run.state].label },
        { label: "Slot date", value: run.slot_date ?? "unscheduled" },
        { label: "Mission scope", value: run.mission_scope },
        { label: "Provisional code", value: run.provisional_code ?? "—" },
        { label: "Encoded code", value: run.encoded_code ?? "—" },
      ]}
    >
      <LifecycleChevrons 
        steps={["DRAFT", "SCHEDULED", "CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXPORTED"]} 
        currentStep={run.state} 
      />
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
        <EntityFiles entityType="run" entityId={run.id} emptyMessage="No files attached to this run yet." canEdit={canEdit} />
      </Section>
      <Section title="Activity">
        <ActivityPanel resource="runs" entityId={run.id} refreshKey={(run as { version?: number }).version} />
      </Section>
    </DetailPage>
    {executing && (
      <ExecuteRun
        run={run}
        code={code}
        canEdit={canEdit}
        onClose={() => setExecuting(false)}
        onSaved={setRun}
      />
    )}
    </>
  );
}
