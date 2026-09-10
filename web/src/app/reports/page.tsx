"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";

import { api } from "@/lib/api";
import { CQ, STATUS_COLOR } from "@/lib/palette";
import { DATA_PIPELINE, dailyExecution, loadCampaignMetrics, PIPELINE_STAGES, STAGE_LABEL, type CampaignMetrics } from "@/lib/metrics";
import type { Campaign } from "@/lib/types";
import { useUser } from "@/lib/useUser";
import { Funnel, Progress } from "@/components/Cards";
import { Stepper } from "@/components/Stepper";
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

// Toggleable report sections (mirrors the desktop weekly-status report).
const SECTIONS = [
  { key: "execution", label: "Execution Numbers" },
  { key: "status", label: "Overall Status" },
  { key: "daily", label: "Daily Execution" },
  { key: "pipeline", label: "Pipeline Status" },
  { key: "recruiting", label: "Recruiting & Readiness" },
  { key: "risk", label: "Risk & Mitigation" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export default function ReportsPage() {
  const user = useUser();
  const [campaigns, setStudies] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [m, setM] = useState<CampaignMetrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [enabled, setEnabled] = useState<Record<SectionKey, boolean>>({
    execution: true,
    status: true,
    daily: true,
    pipeline: true,
    recruiting: true,
    risk: true,
  });
  const [scoped, setScoped] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  // Daily Execution annotations (free-form, editable by the report author).
  const [blocker, setBlocker] = useState("Not yet extracted due to memory constraints — currently being addressed.");
  const [expectedUpload, setExpectedUpload] = useState("2026-06-15");

  useEffect(() => {
    api
      .listStudies()
      .then((s) => {
        setStudies(s);
        if (s.length > 0) setCampaignId(s[0].id);
      })
      .catch(() => setErr("Backend unreachable (start it on :8000)."));
  }, []);

  const load = useCallback(() => {
    if (!campaignId) return;
    const range = scoped && start && end ? { start, end } : undefined;
    loadCampaignMetrics(campaignId, range).then(setM).catch(() => setErr("Failed to load report."));
  }, [campaignId, scoped, start, end]);
  useEffect(load, [load]);

  const funnel = m
    ? PIPELINE_STAGES.map((st) => ({ label: STAGE_LABEL[st], value: m.byState[st] ?? 0, color: STATE_FILL[st] }))
    : [];

  const controls = (
    <div className="flex items-center gap-3 print:hidden">
      <button
        onClick={() => window.print()}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        Print / PDF
      </button>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <CampaignHeader title="Reports" campaigns={campaigns} campaignId={campaignId} onChange={setCampaignId} right={controls} />
      {err && <div className="bg-red-50 px-6 py-2 text-sm text-red-700">{err}</div>}

      <div className="flex flex-1 overflow-hidden">
        {/* configurator (hidden when printing) */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-4 print:hidden">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Sections</h3>
          <div className="flex flex-col gap-1.5">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled[s.key]}
                  onChange={(e) => setEnabled((v) => ({ ...v, [s.key]: e.target.checked }))}
                  className="h-4 w-4"
                />
                {s.label}
              </label>
            ))}
          </div>

          <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Date scope</h3>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={scoped} onChange={(e) => setScoped(e.target.checked)} className="h-4 w-4" />
            Limit to date range
          </label>
          {scoped && (
            <div className="flex flex-col gap-2 text-sm">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-neutral-300 px-2 py-1" />
            </div>
          )}
        </aside>

        <div className="flex-1 overflow-auto p-6">
          {!m ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : (
            <article className="mx-auto max-w-4xl rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="mb-6 flex items-start justify-between border-b border-neutral-200 pb-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Weekly Status Report</div>
                  <h1 className="cq-display mt-1 text-2xl font-semibold">{m.campaign.name}</h1>
                  <p className="text-sm text-neutral-500">
                    {m.campaign.campaign_type} campaign · prepared by {user?.name ?? "—"} · status {m.campaign.status}
                    {scoped && start && end ? ` · ${start} → ${end}` : ""}
                  </p>
                </div>
                <Image src="/charmquark-wordmark.svg" alt="CharmQuark" width={92} height={34} priority />
              </div>

              {enabled.execution && (
                <Section title="Execution Numbers">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Kpi label="Runs" value={m.runs.length} />
                    <Kpi label="Confirmed" value={m.confirmedPlus} color={CQ.iris} />
                    <Kpi label="Collected" value={m.collectedPlus} color={CQ.sage} />
                    <Kpi label="Blocked" value={m.blocked} color={m.blocked ? CQ.rose : CQ.slate} />
                  </div>
                </Section>
              )}

              {enabled.status && (
                <Section title="Overall Status">
                  <p className="mb-2 text-sm text-neutral-600">
                    {m.collectedPlus} of {m.targetN} target collected — <b>{m.progressPct}%</b> complete.
                  </p>
                  <Progress pct={m.progressPct} />
                </Section>
              )}

              {enabled.daily && (
                <Section title="Daily Execution">
                  <p className="mb-3 flex items-center gap-2 text-xs text-neutral-400">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-300" />
                    Auto-populated from run state (system-tracked). Not yet wired to the live
                    S3 ingestion / extraction pipeline — those stages will sync automatically once connected.
                  </p>
                  {(() => {
                    const de = dailyExecution(m.runs);
                    return (
                      <>
                        <ul className="mb-4 space-y-1 text-sm text-neutral-700">
                          <li><b>{de.uploaded}</b> robots’ runs uploaded</li>
                          <li><b>{de.extractedQAd}</b> extracted and QA’d</li>
                          <li>
                            <b>{de.pending}</b> pending extraction / QA
                            {blocker.trim() && <div className="ml-5 text-neutral-500">— {blocker}</div>}
                          </li>
                          {de.inExecution > 0 && <li><b>{de.inExecution}</b> in execution</li>}
                        </ul>
                        <div className="mb-4 rounded-xl bg-neutral-50 p-4">
                          <Stepper
                            stages={DATA_PIPELINE.map((k) => ({ key: k, label: STAGE_LABEL[k] }))}
                            counts={Object.fromEntries(DATA_PIPELINE.map((k) => [k, m.byState[k] ?? 0]))}
                          />
                        </div>
                        <p className="text-sm text-neutral-600">
                          Upload of full cohort expected <b>{formatExpected(expectedUpload)}</b>.
                        </p>
                        {/* author controls — hidden when printing */}
                        <div className="mt-3 flex flex-col gap-2 print:hidden">
                          <label className="text-xs text-neutral-500">
                            Blocker note (pending items)
                            <input
                              value={blocker}
                              onChange={(e) => setBlocker(e.target.value)}
                              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="text-xs text-neutral-500">
                            Expected full-cohort upload
                            <input
                              type="date"
                              value={expectedUpload}
                              onChange={(e) => setExpectedUpload(e.target.value)}
                              className="mt-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                            />
                          </label>
                        </div>
                      </>
                    );
                  })()}
                </Section>
              )}

              {enabled.pipeline && (
                <Section title="Pipeline Status">
                  <Funnel rows={funnel} />
                </Section>
              )}

              {enabled.recruiting && (
                <Section title="Recruiting & Readiness">
                  <table className="w-full text-sm">
                    <tbody>
                      <Row k="Robots (total)" v={m.robots.length} />
                      <Row k="Cleared to participate" v={`${m.clearedRobots} (consent · booking · Ask)`} />
                      <Row k="Operators" v={m.operators.length} />
                      <Row k="Labs" v={m.labs.length} />
                      <Row k="Sensors operational" v={`${m.operationalSensors} of ${m.sensors.length}`} />
                    </tbody>
                  </table>
                </Section>
              )}

              {enabled.risk && (
                <Section title="Risk & Mitigation">
                  {m.blocked > 0 ? (
                    <p className="text-sm text-red-700">
                      {m.blocked} run(s) blocked — open each in the Schedule to see the failing member and swap it.
                    </p>
                  ) : (
                    <p className="text-sm text-green-700">No blocked runs. Pipeline healthy.</p>
                  )}
                </Section>
              )}

              <p className="mt-8 text-xs text-neutral-400">
                Generated by CharmQuark · {m.campaign.name} · figures reflect live data at time of viewing.
              </p>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, color = CQ.blue }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <tr className="border-b border-neutral-100">
      <td className="py-1.5 text-neutral-500">{k}</td>
      <td className="py-1.5 text-right font-medium text-neutral-800">{v}</td>
    </tr>
  );
}

/** Format an ISO date (YYYY-MM-DD) as e.g. "Monday June 15, 2026" without timezone drift. */
function formatExpected(iso: string): string {
  if (!iso) return "TBD";
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
