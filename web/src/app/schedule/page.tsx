"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { addDays, formatDay, isoDate, isoWeek, startOfWeekMonday, weekDays } from "@/lib/dates";
import { canWriteRun, canConfirmRun } from "@/lib/session";
import { useUser } from "@/lib/useUser";
import type { Lab, Operator, Robot, Run, Campaign, MissionGroup } from "@/lib/types";
import { RunInspector } from "@/components/RunInspector";
import { StatusDot } from "@/components/StatusDot";
import { useToast } from "@/components/Toast";

// Pre-generated hourly grid (weekday 08:00–18:00, last start 17:00).
const HOURS = Array.from({ length: 10 }, (_, i) => `${(8 + i).toString().padStart(2, "0")}:00`);

export default function SchedulePage() {
  const user = useUser();
  const toast = useToast();
  const canWrite = canWriteRun(user?.role);
  const canConfirm = canConfirmRun(user?.role);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [monday, setMonday] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [runs, setRuns] = useState<Run[]>([]);
  const [robots, setRobots] = useState<Robot[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [, setMissionGroups] = useState<MissionGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => weekDays(monday, 5), [monday]);

  useEffect(() => {
    api
      .listCampaigns()
      .then((s) => {
        setCampaigns(s);
        if (s.length > 0) setCampaignId((cur) => cur ?? s[0].id);
      })
      .catch(() => setError("Could not reach backend. Is it running on :8000?"));
  }, []);

  const loadWeek = useCallback(async () => {
    if (!campaignId) return;
    const start = isoDate(days[0]);
    const end = isoDate(days[days.length - 1]);
    const [ss, p, o, l, tg] = await Promise.all([
      api.listRuns(campaignId, start, end),
      api.listRobots(),
      api.listOperators(),
      api.listLabs(),
      api.listMissionGroups(campaignId),
    ]);
    setRuns(ss);
    setRobots(p);
    setOperators(o);
    setLabs(l);
    setMissionGroups(tg);
  }, [campaignId, days]);

  useEffect(() => {
    loadWeek().catch(() => setError("Failed to load week."));
  }, [loadWeek]);

  useEffect(() => {
    const t = setInterval(() => loadWeek().catch(() => undefined), 4000);
    return () => clearInterval(t);
  }, [loadWeek]);

  const codeOf = (s: Run) => s.encoded_code ?? s.provisional_code ?? "—";
  const sub = (s: Run) =>
    robots.find((p) => p.id === s.robot_id)?.robot_code ??
    operators.find((o) => o.id === s.operator_id)?.operator_code ??
    labs.find((l) => l.id === s.lab_id)?.name ??
    "unassigned";

  const cellRuns = (date: Date, time: string) =>
    runs.filter((s) => s.slot_date === isoDate(date) && s.slot_time === time && s.state !== "CANCELLED");
  const unscheduled = runs.filter((s) => (!s.slot_time || !HOURS.includes(s.slot_time)) && s.state !== "CANCELLED");

  const addRunAt = async (date: Date, time: string) => {
    if (!campaignId) return;
    try {
      const s = await api.createRun({ campaign_id: campaignId, slot_date: isoDate(date), slot_time: time });
      await loadWeek();
      setSelected(s.id);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not create run");
    }
  };

  const autoFill = async () => {
    if (!campaignId) return;
    setFilling(true);
    try {
      const r = await api.autoFill(campaignId, { start: isoDate(days[0]), end: isoDate(days[days.length - 1]) });
      await loadWeek();
      const tail = r.reps_remaining > 0 ? ` · ${r.reps_remaining} reps still unscheduled` : "";
      toast(r.created > 0 ? "success" : "info", `Auto-fill: ${r.created} run(s) placed${tail}`);
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Auto-fill failed");
    } finally {
      setFilling(false);
    }
  };

  const chip = (s: Run) => (
    <button
      key={s.id}
      onClick={() => setSelected(s.id)}
      className="mb-1 block w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-left text-[11px] hover:border-violet-300 hover:bg-violet-50"
    >
      <span className="flex items-center gap-1">
        <StatusDot state={s.state} />
        <span className="truncate font-medium text-neutral-700">{codeOf(s)}</span>
      </span>
      <span className="block truncate text-neutral-400">{sub(s)}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-5 py-3">
        <h1 className="text-lg font-semibold">Schedule</h1>
        <select
          value={campaignId ?? ""}
          onChange={(e) => setCampaignId(e.target.value || null)}
          className="cq-select"
        >
          {campaigns.length === 0 && <option value="">No campaigns</option>}
          {campaigns.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="ml-2 flex items-center gap-1">
          <button onClick={() => setMonday(addDays(monday, -7))} className="rounded border px-2 py-1 text-sm">◀</button>
          <button onClick={() => setMonday(startOfWeekMonday(new Date()))} className="rounded border px-2 py-1 text-sm">Today</button>
          <button onClick={() => setMonday(addDays(monday, 7))} className="rounded border px-2 py-1 text-sm">▶</button>
        </div>
        <div className="text-sm text-neutral-500">
          Week {isoWeek(monday)} · {formatDay(days[0])} – {formatDay(days[days.length - 1])}
        </div>

        {canConfirm && (
          <button
            onClick={autoFill}
            disabled={filling || !campaignId}
            className="ml-auto cq-btn-primary rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            {filling ? "Filling…" : "Auto-fill week"}
          </button>
        )}
        {!canWrite && (
          <span className="ml-auto rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">Read-only</span>
        )}
      </header>

      {error && <div className="bg-red-50 px-5 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          {/* day header */}
          <div className="grid" style={{ gridTemplateColumns: "60px repeat(5, minmax(120px, 1fr))" }}>
            <div />
            {days.map((d) => (
              <div key={isoDate(d)} className="border-b border-neutral-200 px-2 pb-2 text-sm font-semibold text-neutral-700">
                {formatDay(d)}
              </div>
            ))}
            {/* hourly rows */}
            {HOURS.map((time) => (
              <div key={time} className="contents">
                <div className="border-r border-neutral-100 py-2 pr-2 text-right text-xs text-neutral-400">{time}</div>
                {days.map((d) => {
                  const items = cellRuns(d, time);
                  return (
                    <div key={isoDate(d) + time} className="min-h-[52px] border-b border-l border-neutral-100 p-1">
                      {items.map(chip)}
                      {canWrite && (
                        <button
                          onClick={() => addRunAt(d, time)}
                          className="w-full rounded border border-dashed border-neutral-200 py-0.5 text-[11px] text-neutral-300 hover:border-violet-300 hover:text-[color:var(--cq-iris)]"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {unscheduled.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Unscheduled</div>
              <div className="flex flex-wrap gap-2">
                {unscheduled.map((s) => (
                  <div key={s.id} className="w-40">{chip(s)}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {selected && campaignId && (
          <RunInspector
            runId={selected}
            campaignId={campaignId}
            canWrite={canWrite}
            canConfirm={canConfirm}
            onClose={() => setSelected(null)}
            onChanged={loadWeek}
          />
        )}
      </div>
    </div>
  );
}
