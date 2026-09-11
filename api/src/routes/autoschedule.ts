/**
 * Automated run scheduling.
 *
 * The headline feature: given a program, propose a set of missions (and how many
 * repetitions of each) that fills — without exceeding — a run's effort
 * budget, then emit the run sheet as CSV, then reconcile what actually got
 * recorded back into the mission repetition counts.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { jsonCol, num, parseJson, str, uuid, requireVault, type Row } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import {
  DEFAULT_SLOTS,
  RUN_EFFORT_BUDGET,
  effortUnits,
  isSchedulable,
  isWeekday,
  provisionalCode,
  repsGap,
} from "../domain";
import * as S from "../serialize";
import { parseCsv } from "./catalog";
import { recordCoverage } from "./coverage";
import { requirePlanner } from "../auth";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

type MissionRec = ReturnType<typeof S.taskLike> & { group: string | null };

interface Allocation { mission: MissionRec; reps: number }

// ---------------------------------------------------------------- packing
/**
 * Allocate schedulable missions *and their repetitions* to fill (without exceeding)
 * the budget.
 *
 * A mission may be recorded several times in one run. Each repetition costs the
 * mission's effort units, and a mission contributes at most its remaining gap. Greedy
 * and deterministic: largest missions first (a single Long fills the slot), tie-broken
 * by mission_code. `remaining` overrides the static gap so auto-fill can spread
 * repetitions across many slots without over-planning.
 *
 * An under-filled result is returned as-is so the caller can report the shortfall.
 */
function packMissions(
  missions: MissionRec[],
  opts: { budget?: number; excludeIds?: Set<string>; remaining?: Record<string, number> } = {},
): { allocations: Allocation[]; used: number } {
  const budget = opts.budget ?? RUN_EFFORT_BUDGET;
  const exclude = opts.excludeIds ?? new Set<string>();
  const remaining = opts.remaining;

  const eligible = missions
    .filter((t) => (remaining ? (remaining[t.id] ?? 0) > 0 : isSchedulable(t)) && !exclude.has(t.id))
    .sort((a, b) => effortUnits(b.duration_type) - effortUnits(a.duration_type)
      || a.mission_code.localeCompare(b.mission_code));

  const allocations: Allocation[] = [];
  let used = 0;
  for (const t of eligible) {
    const u = effortUnits(t.duration_type);
    if (u <= 0) continue;
    const room = Math.floor((budget - used) / u); // how many reps still fit
    if (room <= 0) continue;
    const want = remaining ? (remaining[t.id] ?? 0) : repsGap(t);
    const reps = Math.min(want, room);           // never over-record past the goal
    if (reps <= 0) continue;
    allocations.push({ mission: t, reps });
    used += reps * u;
    if (used >= budget) break;
  }
  return { allocations, used };
}

// ---------------------------------------------------------------- run CSV contract
/**
 * SINGLE SOURCE OF TRUTH for the run-CSV contract. The generated run sheet
 * and the upload parser both derive from this list, so they cannot drift.
 * `source` says who fills each column:
 *   "mission" -> auto-filled from the mission catalog when the CSV is generated
 *   "user" -> entered by the operator at accept time (robot / payload / lab)
 *   "post" -> left blank; filled by the collection tooling AFTER recording
 */
export const RUN_CSV_SPEC = [
  { name: "recording_folder", source: "post", desc: "Folder holding the captured bag/recording; filled after collection." },
  { name: "odr", source: "post", desc: "On-sensor recording identifier; filled after collection." },
  { name: "run_id", source: "post", desc: "Collection run identifier; filled after collection." },
  { name: "robot_id", source: "user", desc: "Robot code, entered when the run is accepted." },
  { name: "mission_id", source: "mission", desc: "Mission identifier (join key back to the app on upload)." },
  { name: "group", source: "mission", desc: "Mission group / category, from the mission catalog." },
  { name: "mission", source: "mission", desc: "Mission name, from the mission catalog." },
  { name: "variant", source: "mission", desc: "Mission variant used, from the mission catalog." },
  { name: "error", source: "mission", desc: "Injected error scenario for the variant, if any." },
  { name: "device_name", source: "post", desc: "Capture sensor / sensor name; filled after collection." },
  { name: "file_name", source: "post", desc: "Recorded file name; filled after collection." },
  { name: "relative_path", source: "post", desc: "Path to the recording within the folder; filled after collection." },
  { name: "payload", source: "user", desc: "Sensor payload configuration, entered when the run is accepted." },
  { name: "instructions_changed", source: "post", desc: "Whether instructions changed during collection; filled after." },
  { name: "payload_changed", source: "post", desc: "Whether the payload changed during collection; filled after." },
  { name: "run_lab", source: "user", desc: "Lab the run took place in, entered when the run is accepted." },
  { name: "recording_duration", source: "post", desc: "Recording duration; filled after collection." },
] as const;

export const RUN_CSV_COLUMNS = RUN_CSV_SPEC.map((c) => c.name);

const csvCell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const firstVariant = (t: MissionRec): Record<string, unknown> => {
  const v = t.variants[0];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
};

/** One CSV row per planned repetition — a mission with 3 reps emits 3 rows. */
function generateRunCsv(
  allocations: Allocation[],
  ctx: { robotCode: string; payload: string; runLab: string },
): string {
  const lines = [RUN_CSV_COLUMNS.join(",")];
  for (const { mission, reps } of allocations) {
    const v = firstVariant(mission);
    for (let i = 0; i < reps; i++) {
      const row: Record<string, unknown> = {
        robot_id: ctx.robotCode,
        mission_id: mission.id,
        group: mission.group ?? "",
        mission: mission.name,
        variant: v.name ?? "Standard",
        error: "",
        payload: ctx.payload,
        run_lab: ctx.runLab,
      };
      lines.push(RUN_CSV_COLUMNS.map((col) => csvCell(row[col] ?? "")).join(","));
    }
  }
  return lines.join("\n");
}

/** mission_id -> number of recorded rows, from an uploaded run sheet. */
function parseCompletedCounts(csvText: string): Record<string, number> {
  const rows = parseCsv(csvText ?? "");
  if (rows.length < 2) return {};
  const header = rows[0]!.map((h) => h.trim());
  const idIdx = header.indexOf("mission_id");
  if (idIdx === -1) return {};
  const counts: Record<string, number> = {};
  for (let i = 1; i < rows.length; i++) {
    const id = (rows[i]![idIdx] ?? "").trim();
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------- helpers
async function loadMissions(db: D1Database, campaignId: string): Promise<MissionRec[]> {
  const { results } = await db
    .prepare(`SELECT * FROM missions WHERE campaign_id = ? ORDER BY mission_code`)
    .bind(campaignId).all<Row>();
  return results.map((r) => ({ ...S.taskLike(r), group: r["group"] === null ? null : String(r["group"]) }));
}

const proposalPayload = (
  runId: string,
  allocations: Allocation[],
  used: number,
  budget: number,
) => ({
  run_id: runId,
  missions: allocations.map(({ mission, reps }) => ({
    id: mission.id,
    mission_code: mission.mission_code,
    name: mission.name,
    group: mission.group,
    duration_type: mission.duration_type,
    effort_units: effortUnits(mission.duration_type),
    reps_gap: repsGap(mission),
    reps,
    row_units: effortUnits(mission.duration_type) * reps,
  })),
  total_units: used,
  total_reps: allocations.reduce((n, a) => n + a.reps, 0),
  budget,
  meets_floor: used >= 2,
  fully_packed: used === budget,
});

export function mountAutoschedule(app: App): void {
  // ------------------------------------------------------------ propose
  /** Build a draft run and fill it with a proposed mission/rep allocation. */
  app.post("/run-proposals", async (c) => {
    const b = await c.req.json<{ campaign_id: string; slot_date?: string | null; slot_time?: string | null; budget?: number }>();
    if (!b.campaign_id) throw badRequest("campaign_id is required");
    const budget = b.budget ?? RUN_EFFORT_BUDGET;

    const missions = await loadMissions(c.env.DB, b.campaign_id);
    const { allocations, used } = packMissions(missions, { budget });
    if (allocations.length === 0) {
      throw conflict("no schedulable missions: every mission is either not ready, unavailable, or has met its repetition goal");
    }

    const id = uuid();
    const slotDate = b.slot_date ?? null;
    const taskReps = Object.fromEntries(allocations.map((a) => [a.mission.id, a.reps]));
    await c.env.DB.prepare(
      `INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, provisional_code)
       VALUES (?, ?, ?, ?, 'ASSEMBLING', 'SINGLE', ?, ?, ?)`,
    ).bind(
      id, b.campaign_id, slotDate, b.slot_time ?? null,
      jsonCol(allocations.map((a) => a.mission.id)), jsonCol(taskReps), provisionalCode(slotDate),
    ).run();

    return c.json(proposalPayload(id, allocations, used, budget), 201);
  });

  /** Re-roll: propose a different set, excluding whatever was just rejected. */
  app.post("/runs/:id/reject-proposal", requirePlanner, async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("run");
    const s = S.run(row);

    const missions = await loadMissions(c.env.DB, s.campaign_id);
    const { allocations, used } = packMissions(missions, { excludeIds: new Set(s.mission_ids) });
    const taskReps = Object.fromEntries(allocations.map((a) => [a.mission.id, a.reps]));
    await c.env.DB.prepare(
      `UPDATE runs SET mission_ids = ?, mission_reps = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol(allocations.map((a) => a.mission.id)), jsonCol(taskReps), id).run();

    return c.json(proposalPayload(id, allocations, used, RUN_EFFORT_BUDGET));
  });

  // ------------------------------------------------------------ accept
  /**
   * Accept the proposal: record the operator's run inputs, mark the missions
   * IN_PROGRESS, and emit the run-sheet CSV (also stored in the vault).
   */
  app.post("/runs/:id/accept-proposal", requirePlanner, async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<{ robot_id?: string | null; payload?: string | null; run_lab?: string | null }>();

    const row = await c.env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("run");
    const s = S.run(row);
    if (s.mission_ids.length === 0) throw conflict("run has no proposed missions to accept");

    const robotId = b.robot_id ?? s.robot_id;
    let robotCode = "";
    if (robotId) {
      const r = await c.env.DB.prepare(`SELECT robot_code FROM robots WHERE id = ?`).bind(robotId).first<Row>();
      robotCode = r ? str(r, "robot_code") : "";
    }

    const all = await loadMissions(c.env.DB, s.campaign_id);
    const byId = new Map(all.map((t) => [t.id, t]));
    const allocations: Allocation[] = s.mission_ids
      .map((tid) => {
        const mission = byId.get(tid);
        return mission ? { mission, reps: s.mission_reps[tid] ?? 1 } : null;
      })
      .filter((a): a is Allocation => a !== null);

    const csv = generateRunCsv(allocations, {
      robotCode,
      payload: b.payload ?? s.payload ?? "",
      runLab: b.run_lab ?? s.run_lab ?? "",
    });

    const key = `run-sheets/${s.provisional_code ?? id}_${id.slice(0, 8)}.csv`;
    await requireVault(c.env).put(key, csv, { httpMetadata: { contentType: "text/csv" } });

    const stmts: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `UPDATE runs SET robot_id = ?, payload = ?, run_lab = ?, state = 'READY',
                             updated_at = datetime('now') WHERE id = ?`,
      ).bind(robotId ?? null, b.payload ?? s.payload, b.run_lab ?? s.run_lab, id),
    ];
    for (const a of allocations) {
      stmts.push(c.env.DB
        .prepare(`UPDATE missions SET schedule_status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?`)
        .bind(a.mission.id));
    }
    await c.env.DB.batch(stmts);

    const updated = await c.env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first<Row>();
    return c.json({
      run: S.run(updated!),
      task_count: allocations.length,
      run_csv: csv,
      saved_path: key,
    });
  });

  // ------------------------------------------------------------ upload / reconcile
  /**
   * Reconcile what actually got recorded. Missions present in the uploaded sheet
   * (or explicitly ticked) have their repetition counts advanced; anything the
   * operator dropped goes back to AVAILABLE so the next run picks it up.
   */
  app.post("/runs/:id/upload-csv", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<{ completed_mission_ids?: string[]; csv_text?: string }>();

    const row = await c.env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("run");
    const s = S.run(row);

    const counts = b.csv_text ? parseCompletedCounts(b.csv_text) : {};
    const explicit = new Set(b.completed_mission_ids ?? []);
    const completedIds = new Set<string>([...Object.keys(counts), ...explicit]);

    const all = await loadMissions(c.env.DB, s.campaign_id);
    const byId = new Map(all.map((t) => [t.id, t]));

    const recorded: string[] = [];
    const reverted: string[] = [];
    const changes: { mission_id: string; schedule_status: string; reps_actual: number; reps_gap: number }[] = [];
    const stmts: D1PreparedStatement[] = [];

    for (const tid of s.mission_ids) {
      const t = byId.get(tid);
      if (!t) continue;
      if (completedIds.has(tid)) {
        // Prefer the real recorded row count; fall back to the planned reps.
        const got = counts[tid] ?? s.mission_reps[tid] ?? 1;
        const repsActual = Math.min(t.reps_target, t.reps_actual + got);
        const gap = Math.max(0, t.reps_target - repsActual);
        const status = gap === 0 ? "RECORDED" : "AVAILABLE";
        stmts.push(c.env.DB.prepare(
          `UPDATE missions SET reps_actual = ?, schedule_status = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(repsActual, status, tid));
        recorded.push(t.mission_code);
        changes.push({ mission_id: tid, schedule_status: status, reps_actual: repsActual, reps_gap: gap });
      } else {
        stmts.push(c.env.DB.prepare(
          `UPDATE missions SET schedule_status = 'AVAILABLE', updated_at = datetime('now') WHERE id = ?`,
        ).bind(tid));
        reverted.push(t.mission_code);
        changes.push({
          mission_id: tid, schedule_status: "AVAILABLE",
          reps_actual: t.reps_actual, reps_gap: repsGap(t),
        });
      }
    }

    const rows = b.csv_text ? parseRunRows(b.csv_text) : [];
    stmts.push(c.env.DB.prepare(
      `UPDATE runs SET state = 'COLLECTED', completed_mission_ids = ?, collected_rows = ?,
                           updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol([...completedIds]), jsonCol(rows), id));

    await c.env.DB.batch(stmts);

    // Coverage moves on evidence of collection, so it is recorded here — after
    // the repetitions are reconciled — rather than when a run was scheduled.
    const missionCounts: Record<string, number> = {};
    for (const mid of completedIds) {
      missionCounts[mid] = counts[mid] ?? s.mission_reps[mid] ?? 1;
    }
    const coverage = await recordCoverage(c.env.DB, {
      runId: id,
      campaignId: s.campaign_id,
      missionCounts,
    });

    return c.json({ recorded, reverted, missions: changes, coverage });
  });

  // ------------------------------------------------------------ auto-fill a date range
  /**
   * Spread every outstanding repetition across the open weekday slots in a range,
   * creating one confirmed-ready run per filled slot. Stops when the
   * repetitions run out or the slots do.
   */
  app.post("/campaigns/:id/auto-fill", async (c) => {
    const campaignId = c.req.param("id");
    const b = await c.req.json<{ start: string; end: string; budget?: number }>();
    if (!b.start || !b.end) throw badRequest("start and end are required");
    const budget = b.budget ?? RUN_EFFORT_BUDGET;

    const missions = await loadMissions(c.env.DB, campaignId);
    const remaining: Record<string, number> = {};
    for (const t of missions) {
      if (isSchedulable(t)) remaining[t.id] = repsGap(t);
    }

    // Enumerate the weekday slot grid across the range.
    const slots: { date: string; time: string }[] = [];
    for (let d = new Date(`${b.start}T00:00:00Z`); d <= new Date(`${b.end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!isWeekday(iso)) continue;
      for (const time of DEFAULT_SLOTS) slots.push({ date: iso, time });
    }

    const runIds: string[] = [];
    const stmts: D1PreparedStatement[] = [];
    let slotsUsed = 0;

    for (const slot of slots) {
      if (Object.values(remaining).every((n) => n <= 0)) break;
      const { allocations } = packMissions(missions, { budget, remaining });
      if (allocations.length === 0) break;

      const id = uuid();
      const taskReps = Object.fromEntries(allocations.map((a) => [a.mission.id, a.reps]));
      stmts.push(c.env.DB.prepare(
        `INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, mission_scope, mission_ids, mission_reps, provisional_code)
         VALUES (?, ?, ?, ?, 'ASSEMBLING', 'SINGLE', ?, ?, ?)`,
      ).bind(id, campaignId, slot.date, slot.time, jsonCol(allocations.map((a) => a.mission.id)),
        jsonCol(taskReps), provisionalCode(slot.date)));

      for (const a of allocations) remaining[a.mission.id] = (remaining[a.mission.id] ?? 0) - a.reps;
      runIds.push(id);
      slotsUsed += 1;
    }

    if (stmts.length) await c.env.DB.batch(stmts);
    const repsRemaining = Object.values(remaining).reduce((n, v) => n + Math.max(0, v), 0);
    return c.json({
      created: runIds.length,
      slots_used: slotsUsed,
      reps_remaining: repsRemaining,
      run_ids: runIds,
    });
  });
}

/** Every uploaded row, kept verbatim so QA can inspect what was actually captured. */
function parseRunRows(csvText: string): Record<string, string>[] {
  const rows = parseCsv(csvText ?? "");
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = (cells[i] ?? "").trim(); });
    return rec;
  });
}
