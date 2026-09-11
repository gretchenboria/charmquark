"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  SensorRig,
  Lab,
  Operator,
  Robot,
  Readiness,
  Run,
  RunAssign,
  Campaign,
  Mission,
  MissionGroup,
} from "@/lib/types";
import type { LogFn } from "./types";
import { Field, GhostButton, IssueLine, Panel, PrimaryButton, selectClass } from "./ui";

/** Workflow 2 — Compose & confirm a run.
 *  Create a DRAFT run, then assign the assembly one item at a time. Every pick calls
 *  assignRun() and then re-reads getReadiness(); both are narrated so the log
 *  explains the running readiness after each action. Confirm calls confirmRun()
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [slotDate, setSlotDate] = useState("");

  const [run, setRun] = useState<Run | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const [groups, setGroups] = useState<MissionGroup[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [fleets, setFleets] = useState<SensorRig[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listCampaigns().then((s) => {
      setCampaigns(s);
      if (s[0]) setCampaignId((c) => c || s[0].id);
    }).catch(() => log("error", "Backend unreachable — start it on :8787."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    Promise.all([
      api.listMissionGroups(campaignId),
      api.listMissions(campaignId),
      api.listRobots(),
      api.listOperators(),
      api.listLabs(),
      api.listSensorRigs(campaignId),
    ]).then(([g, t, p, o, l, f]) => {
      setGroups(g); setMissions(t); setRobots(p); setOperators(o); setLabs(l); setFleets(f);
    }).catch(() => undefined);
  }, [campaignId]);

  const progress = useCallback(
    (s: Run | null, r: Readiness | null) => {
      if (!s) return onProgress(0, -1);
      if (s.state === "CONFIRMED") return onProgress(3, 3);
      const anyMember = !!(s.robot_id && s.operator_id && s.lab_id && s.sensor_rig_id &&
        (s.mission_group_id || s.mission_ids.length));
      if (r?.can_confirm) return onProgress(2, 2);
      if (anyMember) return onProgress(2, 1);
      return onProgress(1, 1);
    },
    [onProgress],
  );

  const refreshReadiness = useCallback(
    async (s: Run, announce: boolean) => {
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
      log("action", `Creating a draft run for ${campaigns.find((s) => s.id === campaignId)?.name ?? campaignId}${slotDate ? ` on ${slotDate}` : ""}…`);
      const s = await api.createRun({ campaign_id: campaignId, slot_date: slotDate || undefined });
      setRun(s);
      log("success", `Draft run created (${s.provisional_code ?? s.id.slice(0, 8)}), state ${s.state}.`);
      await refreshReadiness(s, true);
    });

  const assign = (patch: RunAssign, narrate: string) =>
    guard(async () => {
      if (!run) return;
      log("action", narrate);
      const s = await api.assignRun(run.id, patch);
      setRun(s);
      await refreshReadiness(s, true);
    });

  const confirm = () =>
    guard(async () => {
      if (!run) return;
      log("action", "Confirming run…");
      const s = await api.confirmRun(run.id);
      setRun(s);
      setReadiness(await api.getReadiness(s.id));
      progress(s, null);
      log("success", `Confirmed as ${s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8)} — state ${s.state}.`);
    });

  const issueFor = (member: string) => readiness?.issues.find((i) => i.member === member)?.reason;
  const confirmed = run?.state === "CONFIRMED";

  return (
    <div className="space-y-4">
      <Panel title="Step 1 · Start a run">
        {!run ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Campaign">
                <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectClass()}>
                  {campaigns.length === 0 && <option value="">No campaigns</option>}
                  {campaigns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Run date (optional)">
                <input type="date" value={slotDate} onChange={(e) => setSlotDate(e.target.value)} className={selectClass()} />
              </Field>
            </div>
            {canWrite ? (
              <PrimaryButton onClick={createDraft} disabled={!campaignId || busy}>Create draft run</PrimaryButton>
            ) : (
              <p className="text-xs text-neutral-400">Only a PM can create runs.</p>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-neutral-700">{run.encoded_code ?? run.provisional_code ?? run.id.slice(0, 8)}</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{run.state}</span>
          </div>
        )}
      </Panel>

      {run && !confirmed && (
        <Panel title="Step 2 · Build assembly (each pick re-runs readiness)">
          <div className="space-y-3">
            <MemberSelect
              label="Missions"
              value={run.mission_scope === "SINGLE" ? (run.mission_ids[0] ?? "") : (run.mission_group_id ?? "")}
              options={
                run.mission_scope === "SINGLE"
                  ? missions.map((t) => ({ id: t.id, label: `${t.mission_code} · ${t.name}${t.is_ready ? "" : " (not ready)"}` }))
                  : groups.map((g) => ({ id: g.id, label: `${g.name} (group)` }))
              }
              scopeToggle={
                <select
                  value={run.mission_scope}
                  disabled={!canWrite || busy}
                  onChange={(e) =>
                    assign({ mission_scope: e.target.value as "GROUP" | "SINGLE" }, `Switching mission scope to ${e.target.value.toLowerCase()}…`)
                  }
                  className="rounded border border-neutral-300 px-1 py-1 text-xs"
                >
                  <option value="GROUP">group</option>
                  <option value="SINGLE">single</option>
                </select>
              }
              issue={issueFor("mission")}
              disabled={!canWrite || busy}
              onPick={(id) => {
                const label =
                  run.mission_scope === "SINGLE"
                    ? missions.find((t) => t.id === id)?.mission_code ?? id
                    : groups.find((g) => g.id === id)?.name ?? id;
                assign(
                  run.mission_scope === "SINGLE" ? { mission_ids: [id] } : { mission_group_id: id },
                  `Set missions to ${label}…`,
                );
              }}
            />
            <MemberSelect
              label="Robot"
              value={run.robot_id ?? ""}
              options={robots.map((p) => ({ id: p.id, label: `${p.robot_code}${p.is_cleared ? "" : " (not cleared)"}` }))}
              issue={issueFor("robot")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ robot_id: id }, `Assigned robot ${robots.find((p) => p.id === id)?.robot_code ?? id}…`)}
            />
            <MemberSelect
              label="Robot Operator"
              value={run.operator_id ?? ""}
              options={operators.map((o) => ({ id: o.id, label: `${o.operator_code} (${o.role})${o.is_active ? "" : " (inactive)"}` }))}
              issue={issueFor("operator")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ operator_id: id }, `Assigned robot operator ${operators.find((o) => o.id === id)?.operator_code ?? id}…`)}
            />
            <MemberSelect
              label="Lab"
              value={run.lab_id ?? ""}
              options={labs.map((l) => ({ id: l.id, label: `${l.name} · cap ${l.capacity}${l.is_available ? "" : " (unavailable)"}` }))}
              issue={issueFor("lab")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ lab_id: id }, `Assigned lab ${labs.find((l) => l.id === id)?.name ?? id}…`)}
            />
            <MemberSelect
              label="Sensor fleet"
              value={run.sensor_rig_id ?? ""}
              options={fleets.map((f) => ({ id: f.id, label: f.name }))}
              issue={issueFor("sensor_rig")}
              disabled={!canWrite || busy}
              onPick={(id) => assign({ sensor_rig_id: id }, `Assigned sensor rig ${fleets.find((f) => f.id === id)?.name ?? id}…`)}
            />
            {issueFor("inventory") && <IssueLine label="Inventory" reason={issueFor("inventory")} />}
          </div>
        </Panel>
      )}

      {run && (
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
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-[color:var(--cq-plum)]">
              Confirmed. Encoded code:{" "}
              <span className="font-mono font-semibold">{run.encoded_code ?? "—"}</span>. This run is now on
              the data pipeline (Workflow 3).
            </div>
          ) : canWrite ? (
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={confirm} disabled={busy || !readiness?.can_confirm}>
                {readiness?.can_confirm ? "Confirm run" : "Not ready to confirm"}
              </PrimaryButton>
              <GhostButton onClick={() => run && void refreshReadiness(run, true)} disabled={busy}>
                Re-check
              </GhostButton>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Your role can’t confirm runs.</p>
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
