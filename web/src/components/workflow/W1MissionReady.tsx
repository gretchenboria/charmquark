"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Campaign, Mission, MissionDetail } from "@/lib/types";
import type { LogFn } from "./types";
import { Field, GhostButton, IssueLine, Panel, PrimaryButton, RISK_COLOR, selectClass } from "./ui";
import { ReadinessChecklist } from "../ReadinessChecklist";
import { RiskLegalPanel } from "../RiskLegalPanel";
import type { Role } from "@/lib/session";

/** Workflow 1 — Get a mission schedulable.
 *  Steps: pick mission -> instructions complete -> risk & legal -> READY.
 *  Every step performs the real backend call; the runner unlocks READY only when
 *  getMission() reports is_ready === true. */
export function W1MissionReady({
  role,
  canWrite,
  log,
  onProgress,
}: {
  role: Role | undefined;
  canWrite: boolean;
  log: LogFn;
  onProgress: (currentIndex: number, doneIndex: number) => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionId, setMissionId] = useState("");
  const [detail, setDetail] = useState<MissionDetail | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listCampaigns().then((s) => {
      setCampaigns(s);
      if (s[0]) setCampaignId((c) => c || s[0].id);
    }).catch(() => log("error", "Backend unreachable — start it on :8000."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    api.listMissions(campaignId).then(setMissions).catch(() => setMissions([]));
    setMissionId("");
    setDetail(null);
  }, [campaignId]);

  const loadDetail = useCallback(
    async (id: string, announce: boolean) => {
      const d = await api.getMission(id);
      setDetail(d);
      if (announce) {
        log("info", `Loaded ${d.mission_code} — risk ${d.risk_level}, legal ${d.legal_approval}, ${d.variants.length} variant(s).`);
        const open = (d.checklist ?? []).filter((c) => !c.done);
        if (open.length) log("warn", `${open.length} readiness item(s) outstanding: ${open.map((c) => c.label).join(", ")}.`);
      }
      return d;
    },
    [log],
  );

  // Report step progress up to the shell whenever the detail changes.
  useEffect(() => {
    if (!detail) {
      onProgress(0, -1);
      return;
    }
    if (detail.is_ready) {
      onProgress(3, 3);
    } else if (detail.instructions_complete) {
      onProgress(2, 1);
    } else {
      onProgress(1, 0);
    }
  }, [detail, onProgress]);

  const pickMission = async (id: string) => {
    setMissionId(id);
    if (!id) {
      setDetail(null);
      return;
    }
    const t = missions.find((x) => x.id === id);
    log("action", `Selected mission ${t?.mission_code ?? id} (${t?.duration_type?.toLowerCase() ?? "?"}).`);
    await loadDetail(id, true);
  };

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

  const markInstructions = () =>
    guard(async () => {
      if (!detail) return;
      log("action", `Marking instructions complete for ${detail.mission_code}…`);
      await api.updateMission(detail.id, { instructions_complete: true });
      const d = await loadDetail(detail.id, false);
      log("success", `Instructions complete. ${d.is_ready ? "Mission is now READY." : "Continue to risk & legal."}`);
    });

  const refreshAfterRiskLegal = () =>
    guard(async () => {
      if (!detail) return;
      const d = await loadDetail(detail.id, false);
      if (d.is_ready) log("success", `${d.mission_code} is READY — risk ${d.risk_level}, legal ${d.legal_approval}.`);
      else {
        const riskOk = d.risk_level === "LOW" || d.legal_approval === "APPROVED";
        log(riskOk ? "info" : "warn", `Risk ${d.risk_level} / legal ${d.legal_approval}${riskOk ? "" : " — still needs clearance."}`);
      }
    });

  const selectedMission = missions.find((t) => t.id === missionId);

  return (
    <div className="space-y-4">
      <Panel title="Pick a mission">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Campaign">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={selectClass()}>
              {campaigns.length === 0 && <option value="">No campaigns</option>}
              {campaigns.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Mission">
            <select value={missionId} onChange={(e) => void pickMission(e.target.value)} className={selectClass()}>
              <option value="">— select —</option>
              {missions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.mission_code} · {t.name}{t.is_ready ? " (ready)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {selectedMission && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-medium ${RISK_COLOR[selectedMission.risk_level] ?? ""}`}>Risk {selectedMission.risk_level}</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">Legal {selectedMission.legal_approval}</span>
            <span className={`rounded-full px-2 py-0.5 font-medium ${detail?.is_ready ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {detail?.is_ready ? "READY" : "Not ready"}
            </span>
          </div>
        )}
      </Panel>

      {detail && (
        <>
          <Panel title="Readiness checklist">
            <ReadinessChecklist items={detail.checklist ?? []} canEdit={false} />
            {!detail.is_ready && (
              <p className="mt-3 text-xs text-neutral-500">
                Clear each item below. The mission becomes schedulable only when the backend reports it ready.
              </p>
            )}
          </Panel>

          <Panel title="Step 1 · Instructions">
            {detail.instructions_complete ? (
              <IssueLine label="Instructions complete" />
            ) : (
              <div className="space-y-3">
                <IssueLine label="Instructions" reason="not marked complete" />
                {canWrite ? (
                  <PrimaryButton onClick={markInstructions} disabled={busy}>
                    Mark instructions complete
                  </PrimaryButton>
                ) : (
                  <p className="text-xs text-neutral-400">Your role can’t edit missions.</p>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Step 2 · Risk & legal review">
            <RiskLegalPanel
              mission={detail}
              role={role}
              onChanged={() => void refreshAfterRiskLegal()}
            />
            <div className="mt-3">
              <GhostButton onClick={() => void refreshAfterRiskLegal()} disabled={busy}>
                Re-check readiness
              </GhostButton>
            </div>
          </Panel>

          {detail.is_ready && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              {detail.mission_code} is <b>READY</b> and schedulable. It can now be pulled into a run
              (Workflow 2 or Auto-Schedule).
            </div>
          )}
        </>
      )}
    </div>
  );
}
