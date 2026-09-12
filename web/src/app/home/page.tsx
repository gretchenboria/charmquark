"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { formatDay, isoDate, isoWeek, startOfWeekMonday, weekDays } from "@/lib/dates";
import { loadCampaignMetrics, PIPELINE_STAGES, STAGE_LABEL, type CampaignMetrics } from "@/lib/metrics";
import { CQ, STATUS_COLOR } from "@/lib/palette";
import { canSeeAnalytics } from "@/lib/roleViews";
import { useUser } from "@/lib/useUser";
import { useBilling } from "@/components/Billing";
import type { CloudStatus, Run, Campaign, Mission } from "@/lib/types";
import { GlobalSearch } from "@/components/GlobalSearch";
import { BarChart, Burndown, Donut } from "@/components/Charts";
import { Funnel, Panel, Progress } from "@/components/Cards";
import { Card } from "@/components/ui/Card";
import { Grid, Section } from "@/components/ui/Grid";
import { StatWidget } from "@/components/ui/StatWidget";
import { StatusDot } from "@/components/StatusDot";
import { CampaignHeader } from "@/components/CampaignHeader";

// Fill colors per pipeline state, shared with the charts (mirrors /monitoring).
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

const QUICK_ACTIONS = [
  { href: "/auto-schedule", label: "Auto-Schedule" },
  { href: "/schedule", label: "Schedule" },
  { href: "/missions", label: "Missions" },
  { href: "/workflows", label: "Workflows" },
  { href: "/robots", label: "Robots" },
];

// States that still need work before a run can run.
const NOT_READY = new Set(["DRAFT", "ASSEMBLING"]);

export default function HomePage() {
  const user = useUser();
  const billing = useBilling();
  // Robot operators get the operational view; PM / Fleet Lead (and unknown/loading
  // roles, as a safe fuller default) get the full analytics dashboard.
  const showAnalytics = canSeeAnalytics(user?.role);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [weekRuns, setWeekRuns] = useState<Run[]>([]);
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [cloudFailed, setCloudFailed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const monday = useMemo(() => startOfWeekMonday(new Date()), []);
  const days = useMemo(() => weekDays(monday, 5), [monday]);

  useEffect(() => {
    api
      .listCampaigns()
      .then((s) => {
        setCampaigns(s);
        if (s.length > 0) setCampaignId((cur) => cur ?? s[0].id);
      })
      .catch(() => setErr("Backend unreachable. Start it on :8787."));
  }, []);

  useEffect(() => {
    api
      .getCloudStatus()
      .then((s) => {
        setCloud(s);
        setCloudFailed(false);
      })
      .catch(() => setCloudFailed(true));
  }, []);

  const load = useCallback(() => {
    if (!campaignId) return;
    // Runs for the current week only — needed by both views.
    const start = isoDate(days[0]);
    const end = isoDate(days[days.length - 1]);
    api
      .listRuns(campaignId, start, end)
      .then(setWeekRuns)
      .catch(() => setWeekRuns([]));

    // Analytics-only data: skip entirely for the operational (robot operator) view.
    if (!showAnalytics) {
      setMetrics(null);
      setMissions([]);
      return;
    }
    // Full-campaign metrics (pipeline, readiness, blocked) — degrade gracefully on error.
    loadCampaignMetrics(campaignId)
      .then(setMetrics)
      .catch(() => setMetrics(null));
    // Missions catalog for the ready/total widget.
    api
      .listMissions(campaignId)
      .then(setMissions)
      .catch(() => setMissions([]));
  }, [campaignId, days, showAnalytics]);

  useEffect(load, [load]);

  const tasksReady = missions.filter((t) => t.is_ready).length;
  const readyNow = metrics?.readyNow ?? 0;
  const blocked = metrics?.blocked ?? 0;

  // ---- chart data (analytics view) — same derivations as the Dashboard/monitoring page ----
  const bars = metrics
    ? PIPELINE_STAGES.filter((st) => metrics.byState[st]).map((st) => ({
        label: STAGE_LABEL[st].slice(0, 4),
        value: metrics.byState[st],
        color: STATE_FILL[st],
      }))
    : [];
  const funnel = metrics
    ? PIPELINE_STAGES.map((st) => ({ label: STAGE_LABEL[st], value: metrics.byState[st] ?? 0, color: STATE_FILL[st] }))
    : [];
  const donut = metrics
    ? [
        { label: "Ready+", value: metrics.confirmedPlus + metrics.readyNow, color: CQ.sage },
        { label: "In progress", value: metrics.inProgress, color: CQ.apricot },
        { label: "Blocked", value: metrics.blocked, color: CQ.rose },
      ]
    : [];
  const target = metrics?.targetN ?? 0;
  const idealLine = Array.from({ length: 5 }, (_, i) => target - (target / 4) * i);
  const remainingN = Math.max(0, target - (metrics?.collectedPlus ?? 0));
  const actualLine = [target, target, Math.max(0, target - (metrics?.confirmedPlus ?? 0)), remainingN, remainingN];

  // "Needs attention": blocked or not-ready runs this week.
  const attention = weekRuns
    .filter((s) => s.state === "BLOCKED" || NOT_READY.has(s.state))
    .slice(0, 6);

  // "This week": runs ordered by slot date, with the day shown.
  const upcoming = [...weekRuns]
    .sort((a, b) => (a.slot_date ?? "").localeCompare(b.slot_date ?? ""))
    .slice(0, 8);

  const dayLabel = (iso: string | null) => {
    if (!iso) return "Unscheduled";
    const d = new Date(`${iso}T00:00:00Z`);
    return formatDay(d);
  };

  const cloudReachable = !!cloud?.reachable && !cloudFailed;
  const cloudLabel = cloudFailed || !cloud
    ? "Backend unreachable"
    : cloud.database === "postgresql"
      ? `PostgreSQL@${cloud.provider}`
      : "Local SQLite";

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <CampaignHeader title="Command & Control Center" campaigns={campaigns} campaignId={campaignId} onChange={setCampaignId} />
      {err && <div className="bg-red-50 px-6 py-2 text-sm text-red-700">{err}</div>}

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl">

          {/* System Alerts Ticker */}
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3 shadow-sm flex items-start gap-3">
            <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-600 animate-pulse" />
            <div>
              <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide mb-1">Active Fleet Alerts</h4>
              <ul className="text-sm text-red-700 space-y-1">
                {attention.length > 0 ? (
                  attention.map(r => (
                    <li key={r.id}>
                      <span className="font-semibold">Run {r.provisional_code || r.encoded_code || r.id.slice(0, 8)}:</span> {STAGE_LABEL[r.state] ?? r.state} - Attention Required
                    </li>
                  ))
                ) : (
                  <li className="text-green-700 font-medium">All systems nominal. No active alerts.</li>
                )}
                {cloud && !cloud.reachable && (
                  <li className="font-semibold">CRITICAL: Backend Cloud Connection Offline</li>
                )}
              </ul>
            </div>
          </div>

          <Section>
            {/* Global fuzzy search — prominent entry to jump to any object. */}
            <GlobalSearch campaignId={campaignId} />

            {/* Top metric row — analytics dashboard only (hidden for robot operators). */}
            {showAnalytics && (
              <Grid cols={4}>
                <StatWidget
                  label="Runs this week"
                  value={weekRuns.length}
                  sub={`Week ${isoWeek(monday)} · ${formatDay(days[0])} – ${formatDay(days[days.length - 1])}`}
                  accent={CQ.blue}
                  href="/schedule"
                />
                <StatWidget
                  label="Ready to confirm"
                  value={readyNow}
                  among={blocked ? `· ${blocked} blocked` : undefined}
                  sub={blocked ? "blocked runs need attention" : "no blockers"}
                  accent={readyNow ? CQ.sage : CQ.slate}
                />
                <StatWidget
                  label="Missions ready"
                  value={tasksReady}
                  among={`/ ${missions.length}`}
                  sub="schedulable in this campaign"
                  accent={CQ.violet}
                  href="/missions"
                />
                <StatWidget
                  label="Collected"
                  value={metrics?.collectedPlus ?? 0}
                  among={metrics?.targetN ? `/ ${metrics.targetN}` : undefined}
                  sub={metrics ? `${metrics.progressPct}% of target N` : "no data yet"}
                  accent={CQ.iris}
                  href="/monitoring"
                />
              </Grid>
            )}

            {/* Metrics & charts — the full command-center dashboard for PM / Fleet Lead. */}
            {showAnalytics && metrics && (
              <>
                <Panel title={`Data yield — ${metrics.progressPct}% of target N ${metrics.targetN}`}>
                  <Progress pct={metrics.progressPct} />
                  <div className="mt-2 flex justify-between text-xs text-neutral-400">
                    <span>{metrics.collectedPlus} collected</span>
                    <span>{remainingN} remaining</span>
                    <span>target {metrics.targetN}</span>
                  </div>
                </Panel>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <Panel title="Data QA Pipeline">
                    <Funnel rows={funnel} />
                  </Panel>
                  <Panel title="Readiness mix">
                    <Donut segments={donut.some((d) => d.value) ? donut : [{ label: "None", value: 1, color: CQ.slate }]} />
                  </Panel>
                  <Panel title="Runs by state">
                    <BarChart data={bars.length ? bars : [{ label: "—", value: 0 }]} />
                  </Panel>
                  <Panel title={`Burndown — target N ${metrics.targetN}`}>
                    <Burndown ideal={idealLine} actual={actualLine} />
                    <div className="mt-2 flex gap-4 text-xs text-neutral-400">
                      <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded" style={{ background: CQ.slate }} /> ideal</span>
                      <span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded" style={{ background: CQ.blue }} /> actual</span>
                    </div>
                  </Panel>
                </div>
              </>
            )}

            {/* Operational summary — robot operator view (no aggregate analytics, just
                actionable counts for this week). */}
            {!showAnalytics && (
              <Grid cols={2}>
                <StatWidget
                  label="Runs this week"
                  value={weekRuns.length}
                  sub={`Week ${isoWeek(monday)} · ${formatDay(days[0])} – ${formatDay(days[days.length - 1])}`}
                  accent={CQ.blue}
                  href="/schedule"
                />
                <StatWidget
                  label="Needs attention"
                  value={attention.length}
                  sub={attention.length ? "blocked or not-yet-ready" : "all clear this week"}
                  accent={attention.length ? CQ.apricot : CQ.sage}
                />
              </Grid>
            )}

            {/* Connectivity chip */}
            <Card>
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${cloudReachable ? "bg-green-500" : "bg-red-500"}`}
                  aria-hidden
                />
                <span className="font-medium text-neutral-800">Backend</span>
                <span className="text-neutral-400">·</span>
                <span>{cloudLabel}</span>
                {cloud?.detail && <span className="ml-auto truncate text-xs text-neutral-400">{cloud.detail}</span>}
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {/* Quick actions */}
              <Card title="Quick actions" subtitle="Jump into a flow" className="lg:col-span-1">
                <div className="flex flex-col gap-2">
                  {QUICK_ACTIONS.map((a) => (
                    <Link
                      key={a.href}
                      href={a.href}
                      className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
                    >
                      <span>{a.label}</span>
                      <span className="text-neutral-300">›</span>
                    </Link>
                  ))}
                </div>
              </Card>

              {/* This week */}
              <Card
                title="This week"
                subtitle="Runs in the current week"
                actions={
                  <Link href="/schedule" className="text-xs text-blue-700 hover:underline">
                    Open schedule
                  </Link>
                }
                className="lg:col-span-2"
              >
                {upcoming.length === 0 ? (
                  <p className="py-2 text-sm text-neutral-400">No runs scheduled this week.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {upcoming.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="w-32 shrink-0 text-neutral-500">{dayLabel(s.slot_date)}</span>
                        <Link
                          href={`/runs/${s.id}`}
                          className="min-w-0 flex-1 truncate text-neutral-800 hover:underline"
                        >
                          {s.provisional_code || s.encoded_code || `Run ${s.id.slice(0, 8)}`}
                        </Link>
                        <StatusDot state={s.state} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {/* Needs attention */}
            <Card
              title="Needs attention"
              subtitle="Blocked or not-yet-ready runs this week"
            >
              {attention.length === 0 ? (
                <p className="py-2 text-sm text-neutral-400">Nothing needs attention this week.</p>
              ) : (
                <ul className="divide-y divide-neutral-100">
                  {attention.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                      <Link
                        href={`/runs/${s.id}`}
                        className="min-w-0 flex-1 truncate text-neutral-800 hover:underline"
                      >
                        {s.provisional_code || s.encoded_code || `Run ${s.id.slice(0, 8)}`}
                      </Link>
                      <span className="text-xs text-neutral-400">{dayLabel(s.slot_date)}</span>
                      <span className="w-28 shrink-0 text-right text-xs text-neutral-500">
                        {STAGE_LABEL[s.state] ?? s.state}
                      </span>
                      <StatusDot state={s.state} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}
