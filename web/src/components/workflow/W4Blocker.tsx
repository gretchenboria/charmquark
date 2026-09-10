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
} from "@/lib/types";
import type { LogFn } from "./types";
import { Field, GhostButton, IssueLine, Panel, PrimaryButton, selectClass } from "./ui";

/** Workflow 4 — Handle a blocker.
 *  Find a run carrying a readiness issue (BLOCKED, or has issues), swap the offending
 *  member for an eligible one via assignRun(), re-check getReadiness(), and re-confirm. */
export function W4Blocker({
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
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [fleets, setFleets] = useState<SensorRig[]>([]);
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
    // Candidates for "handle a blocker": blocked, or still assembling/draft with issues.
    setRuns(list.filter((s) => ["BLOCKED", "ASSEMBLING", "DRAFT", "READY"].includes(s.state)));
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    Promise.all([
      loadRuns(campaignId),
      api.listRobots().then(setRobots),
      api.listOperators().then(setOperators),
      api.listLabs().then(setLabs),
      api.listSensorRigs(campaignId).then(setFleets),
    ]).catch(() => undefined);
    setRunId("");
    setRun(null);
    setReadiness(null);
  }, [campaignId, loadRuns]);

  const progress = useCallback(
    (s: Run | null, r: Readiness | null) => {
      if (!s) return onProgress(0, -1);
      if (s.state === "CONFIRMED") return onProgress(3, 3);
      if (r && r.issues.length === 0) return onProgress(2, 2);
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

  const selectRun = async (id: string) => {
    setRunId(id);
    if (!id) { setRun(null); setReadiness(null); return; }
    const s = await api.getRun(id);
    setRun(s);
    log("action", `Selected ${s.encoded_code ?? s.provisional_code ?? id.slice(0, 8)} — state ${s.state}.`);
    await refreshReadiness(s, true);
  };

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e) { log("error", e instanceof ApiError ? e.friendly : "Action failed."); }
    finally { setBusy(false); }
  };

  const swap = (member: string, patch: RunAssign, narrate: string) =>
    guard(async () => {
      if (!run) return;
      log("action", narrate);
      const s = await api.assignRun(run.id, patch);
      setRun(s);
      await loadRuns(campaignId);
      await refreshReadiness(s, true);
    });

  const reconfirm = () =>
    guard(async () => {
      if (!run) return;
      log("action", "Re-confirming run…");
      const s = await api.confirmRun(run.id);
      setRun(s);
      setReadiness(await api.getReadiness(s.id));
      progress(s, null);
      log("success", `Re-confirmed as ${s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8)} — state ${s.state}.`);
    });

  const issues = readiness?.issues ?? [];
  const confirmed = run?.state === "CONFIRMED";

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
      case "sensor_rig":
        return (
          <SwapRow
            reason={reason}
            options={fleets.map((f) => ({ id: f.id, label: f.name }))}
            disabled={!canWrite || busy}
            onPick={(id) => swap(member, { sensor_rig_id: id }, `Swapping sensor rig → ${fleets.find((f) => f.id === id)?.name ?? id}…`)}
          />
        );
      default:
        return (
          <p className="text-[11px] text-neutral-500">
            Fix this member in its own workflow (e.g. Workflow 1 for mission readiness), then re-check.
          </p>
        );
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Step 1 · Pick a blocked / unready run">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Campaign">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectClass()}>
              {campaigns.length === 0 && <option value="">No campaigns</option>}
              {campaigns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Run">
            <select value={runId} onChange={(e) => void selectRun(e.target.value)} className={selectClass()}>
              <option value="">— select —</option>
              {runs.map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.encoded_code ?? s.provisional_code ?? s.id.slice(0, 8))} · {s.state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {runs.length === 0 && campaignId && (
          <p className="mt-2 text-xs text-neutral-400">No blocked or unready runs for this campaign.</p>
        )}
      </Panel>

      {run && (
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
                <GhostButton onClick={() => run && void refreshReadiness(run, true)} disabled={busy}>
                  Re-check readiness
                </GhostButton>
              )}
            </div>
          )}
        </Panel>
      )}

      {run && (
        <Panel title="Step 3 · Re-confirm">
          {confirmed ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-[color:var(--cq-plum)]">
              Resolved and re-confirmed as{" "}
              <span className="font-mono font-semibold">{run.encoded_code ?? "—"}</span>.
            </div>
          ) : canWrite ? (
            <PrimaryButton onClick={reconfirm} disabled={busy || !readiness?.can_confirm}>
              {readiness?.can_confirm ? "Re-confirm run" : "Resolve all issues to re-confirm"}
            </PrimaryButton>
          ) : (
            <p className="text-xs text-neutral-400">Your role can’t confirm runs.</p>
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
