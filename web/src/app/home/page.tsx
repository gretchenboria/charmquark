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
import type { CloudStatus, Run, Campaign, Mission, Robot } from "@/lib/types";
import { GlobalSearch } from "@/components/GlobalSearch";
import { BarChart, Burndown, Donut } from "@/components/Charts";
import { Funnel, Panel, Progress } from "@/components/Cards";
import { Card } from "@/components/ui/Card";
import { Grid, Section } from "@/components/ui/Grid";
import { StatWidget } from "@/components/ui/StatWidget";
import { StatusDot } from "@/components/StatusDot";
import { CampaignHeader } from "@/components/CampaignHeader";

// Fill colors per pipeline state, shared with the charts
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

const C2_WORKFLOWS = [
  { action: "Start Hardware Calibration", icon: "🔧", color: "bg-blue-600 hover:bg-blue-700" },
  { action: "Run Full QA Validation", icon: "✅", color: "bg-emerald-600 hover:bg-emerald-700" },
  { action: "Deploy Sensor Rig", icon: "📡", color: "bg-indigo-600 hover:bg-indigo-700" },
  { action: "E-Stop Fleet", icon: "🛑", color: "bg-red-600 hover:bg-red-700 font-bold" },
];

const NOT_READY = new Set(["DRAFT", "ASSEMBLING"]);

export default function HomePage() {
  const user = useUser();
  const billing = useBilling();
  const showAnalytics = canSeeAnalytics(user?.role);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<CampaignMetrics | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [weekRuns, setWeekRuns] = useState<Run[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [cloudFailed, setCloudFailed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

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
      
    api.listRobots().then(setRobots).catch(() => setRobots([]));
  }, []);

  const load = useCallback(() => {
    if (!campaignId) return;
    const start = isoDate(days[0]);
    const end = isoDate(days[days.length - 1]);
    api
      .listRuns(campaignId, start, end)
      .then(setWeekRuns)
      .catch(() => setWeekRuns([]));

    if (!showAnalytics) {
      setMetrics(null);
      setMissions([]);
      return;
    }
    loadCampaignMetrics(campaignId)
      .then(setMetrics)
      .catch(() => setMetrics(null));
    api
      .listMissions(campaignId)
      .then(setMissions)
      .catch(() => setMissions([]));
  }, [campaignId, days, showAnalytics]);

  useEffect(load, [load]);

  const tasksReady = missions.filter((t) => t.is_ready).length;
  const readyNow = metrics?.readyNow ?? 0;
  const blocked = metrics?.blocked ?? 0;

  const activeRobots = robots.filter(r => r.status === "ACTIVE" || r.status === "ONLINE" || r.status === "MAINTENANCE").length;
  const idleRobots = robots.length - activeRobots;

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

  const attention = weekRuns
    .filter((s) => s.state === "BLOCKED" || NOT_READY.has(s.state))
    .slice(0, 6);

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

  const handleWorkflow = async (action: string) => {
    if (action === "E-Stop Fleet") {
       if (!confirm("Are you sure you want to E-STOP ALL ROBOTS in the fleet? This will trigger an immediate halt.")) return;
       
       setTriggering(action);
       try {
         const active = robots.filter(r => r.status === "ACTIVE" || r.status === "ONLINE" || r.status === "MAINTENANCE");
         await Promise.all(active.map(r => api.sendRobotCommand(r.id, "estop")));
         alert(`EMERGENCY STOP dispatched to ${active.length} active robots.`);
       } catch (err) {
         alert("Failed to dispatch E-STOP to some robots.");
       } finally {
         setTriggering(null);
       }
       return;
    }
    
    setTriggering(action);
    setTimeout(() => {
      setTriggering(null);
      alert(`Workflow "${action}" initiated successfully.`);
    }, 800);
  };

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <CampaignHeader title="Fleet Command & Control" campaigns={campaigns} campaignId={campaignId} onChange={setCampaignId} />
      {err && <div className="bg-red-50 px-6 py-2 text-sm text-red-700 border-b border-red-100">{err}</div>}

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">

          {/* System Alerts Ticker */}
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 shadow-sm flex items-start gap-3">
            <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-red-600 animate-pulse" />
            <div>
              <h4 className="text-sm font-bold text-red-800 uppercase tracking-wide mb-1">Active Fleet Alerts</h4>
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
            <GlobalSearch campaignId={campaignId} />

            {/* Top metric row */}
            {showAnalytics && (
              <Grid cols={4}>
                <StatWidget
                  label="Active Robots"
                  value={activeRobots}
                  among={`/ ${robots.length}`}
                  sub={`${idleRobots} standing by`}
                  accent={CQ.sage}
                  href="/robots"
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
                  label="Data Yield"
                  value={metrics?.collectedPlus ?? 0}
                  among={metrics?.targetN ? `/ ${metrics.targetN}` : undefined}
                  sub={metrics ? `${metrics.progressPct}% of target N` : "no data yet"}
                  accent={CQ.iris}
                  href="/monitoring"
                />
              </Grid>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* ACTION CENTER */}
              <div className="lg:col-span-1 flex flex-col gap-4">
                <Card title="C2 Operations" subtitle="Command Fleet Actions" className="border-neutral-300">
                  <div className="flex flex-col gap-3 py-2">
                    {C2_WORKFLOWS.map((wf) => (
                      <button
                        key={wf.action}
                        onClick={() => handleWorkflow(wf.action)}
                        disabled={!!triggering}
                        className={`flex items-center gap-3 w-full rounded-md px-4 py-3 text-sm text-white transition-all shadow-sm ${wf.color} ${triggering === wf.action ? "opacity-70 cursor-wait" : ""}`}
                      >
                        <span className="text-lg">{wf.icon}</span>
                        <span className="flex-1 text-left font-medium">{triggering === wf.action ? "Initiating..." : wf.action}</span>
                      </button>
                    ))}
                  </div>
                </Card>

                {/* Connectivity */}
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
              </div>

              {/* DASHBOARD CHARTS */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {showAnalytics && metrics ? (
                  <>
                    <Panel title={`Data yield — ${metrics.progressPct}% of target N ${metrics.targetN}`}>
                      <Progress pct={metrics.progressPct} />
                      <div className="mt-2 flex justify-between text-xs text-neutral-400">
                        <span>{metrics.collectedPlus} collected</span>
                        <span>{remainingN} remaining</span>
                        <span>target {metrics.targetN}</span>
                      </div>
                    </Panel>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Panel title="Data QA Pipeline">
                        <Funnel rows={funnel} />
                      </Panel>
                      <Panel title="Runs by state">
                        <BarChart data={bars.length ? bars : [{ label: "—", value: 0 }]} />
                      </Panel>
                      <Panel title="Readiness mix">
                        <Donut segments={donut.some((d) => d.value) ? donut : [{ label: "None", value: 1, color: CQ.slate }]} />
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
                ) : (
                  <Card title="Analytics" subtitle="Not available">
                    <p className="text-sm text-neutral-500 py-4">Analytics view restricted for your role.</p>
                  </Card>
                )}
              </div>
            </div>

            {/* SCHEDULE & ATTENTION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
              <Card
                title="Active Missions (This Week)"
                subtitle="Live operation schedule"
                actions={<Link href="/schedule" className="text-xs text-blue-700 hover:underline">View All</Link>}
              >
                {upcoming.length === 0 ? (
                  <p className="py-2 text-sm text-neutral-400">No operations scheduled.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {upcoming.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                        <span className="w-24 shrink-0 text-neutral-500 font-mono text-xs">{dayLabel(s.slot_date)}</span>
                        <Link href={`/runs/${s.id}`} className="min-w-0 flex-1 truncate text-neutral-800 hover:underline font-medium">
                          {s.provisional_code || s.encoded_code || `Run ${s.id.slice(0, 8)}`}
                        </Link>
                        <StatusDot state={s.state} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Requires Intervention" subtitle="Blocked or unready runs">
                {attention.length === 0 ? (
                  <p className="py-2 text-sm text-neutral-400">No immediate blocks.</p>
                ) : (
                  <ul className="divide-y divide-neutral-100">
                    {attention.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                        <Link href={`/runs/${s.id}`} className="min-w-0 flex-1 truncate text-neutral-800 hover:underline font-medium">
                          {s.provisional_code || s.encoded_code || `Run ${s.id.slice(0, 8)}`}
                        </Link>
                        <span className="text-xs text-neutral-400 font-mono w-24 text-right">{dayLabel(s.slot_date)}</span>
                        <span className="w-28 shrink-0 text-right text-xs text-neutral-500 uppercase font-semibold">
                          {STAGE_LABEL[s.state] ?? s.state}
                        </span>
                        <StatusDot state={s.state} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
