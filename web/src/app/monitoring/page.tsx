"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { CQ, STATUS_COLOR } from "@/lib/palette";
import { loadCampaignMetrics, PIPELINE_STAGES, STAGE_LABEL, type CampaignMetrics } from "@/lib/metrics";
import type { Campaign } from "@/lib/types";
import { BarChart, Burndown, Donut } from "@/components/Charts";
import { Funnel, Panel, Progress, StatCard } from "@/components/Cards";
import { CampaignHeader } from "@/components/CampaignHeader";

const STATE_FILL: Record<string, string> = {
  DRAFT: STATUS_COLOR.draft,
  ASSEMBLING: STATUS_COLOR.assembling,
  READY: STATUS_COLOR.ready,
  CONFIRMED: STATUS_COLOR.confirmed,
  IN_EXECUTION: CQ.iris,
  COLLECTED: CQ.blue,
  UPLOADED: CQ.violet,
  DONE: CQ.lilac,
  BLOCKED: STATUS_COLOR.blocked,
};

export default function MonitoringPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [m, setM] = useState<CampaignMetrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCampaigns()
      .then((s) => {
        setCampaigns(s);
        if (s.length > 0) setCampaignId(s[0].id);
      })
      .catch(() => setErr("Backend unreachable (start it on :8000)."));
  }, []);

  const load = useCallback(() => {
    if (campaignId) loadCampaignMetrics(campaignId).then(setM).catch(() => setErr("Failed to load metrics."));
  }, [campaignId]);
  useEffect(load, [load]);
  // live refresh for simultaneous users
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const bars = m
    ? PIPELINE_STAGES.filter((st) => m.byState[st]).map((st) => ({
        label: STAGE_LABEL[st].slice(0, 4),
        value: m.byState[st],
        color: STATE_FILL[st],
      }))
    : [];

  const funnel = m
    ? PIPELINE_STAGES.map((st) => ({ label: STAGE_LABEL[st], value: m.byState[st] ?? 0, color: STATE_FILL[st] }))
    : [];

  const donut = m
    ? [
        { label: "Ready+", value: m.confirmedPlus + m.readyNow, color: CQ.sage },
        { label: "In progress", value: m.inProgress, color: CQ.apricot },
        { label: "Blocked", value: m.blocked, color: CQ.rose },
      ]
    : [];

  // Illustrative burndown across a 5-point window.
  const target = m?.targetN ?? 0;
  const ideal = Array.from({ length: 5 }, (_, i) => target - (target / 4) * i);
  const remaining = Math.max(0, target - (m?.collectedPlus ?? 0));
  const actual = [target, target, Math.max(0, target - (m?.confirmedPlus ?? 0)), remaining, remaining];

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <CampaignHeader title="Dashboard" campaigns={campaigns} campaignId={campaignId} onChange={setCampaignId} />
      {err && <div className="bg-red-50 px-6 py-2 text-sm text-red-700">{err}</div>}

      <div className="flex-1 overflow-auto p-6">
        {!m ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="mx-auto max-w-6xl">
            {/* KPI row */}
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Runs" value={m.runs.length} sub={`${m.campaign.campaign_type} campaign`} accent={CQ.blue} />
              <StatCard label="Confirmed" value={m.confirmedPlus} sub="scheduled + locked" accent={CQ.iris} />
              <StatCard label="Collected" value={m.collectedPlus} sub={`of target N ${m.targetN}`} accent={CQ.sage} />
              <StatCard label="Blocked" value={m.blocked} sub="need attention" accent={m.blocked ? CQ.rose : CQ.slate} />
            </div>

            {/* progress to target */}
            <div className="mb-5">
              <Panel title={`Collection progress — ${m.progressPct}% of target`}>
                <Progress pct={m.progressPct} />
                <div className="mt-2 flex justify-between text-xs text-neutral-400">
                  <span>{m.collectedPlus} collected</span>
                  <span>{remaining} remaining</span>
                  <span>target {m.targetN}</span>
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Panel title="Pipeline funnel">
                <Funnel rows={funnel} />
              </Panel>
              <Panel title="Readiness mix">
                <Donut segments={donut.length ? donut : [{ label: "None", value: 1, color: CQ.slate }]} />
              </Panel>
              <Panel title="Runs by state">
                <BarChart data={bars.length ? bars : [{ label: "—", value: 0 }]} />
              </Panel>
              <Panel title={`Burndown — target N ${m.targetN}`}>
                <Burndown ideal={ideal} actual={actual} />
                <div className="mt-2 flex gap-4 text-xs text-neutral-400">
                  <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded" style={{ background: CQ.slate }} /> ideal</span>
                  <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded" style={{ background: CQ.blue }} /> actual</span>
                </div>
              </Panel>
            </div>

            {/* readiness health row */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Cleared robots" value={m.clearedRobots} sub={`of ${m.robots.length} total`} accent={CQ.sage} />
              <StatCard label="Operational sensors" value={m.operationalSensors} sub={`of ${m.sensors.length} total`} accent={CQ.blue} />
              <StatCard label="Labs" value={m.labs.length} sub="collection sites" accent={CQ.violet} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
