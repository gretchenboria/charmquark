/**
 * Automated session scheduling.
 *
 * The headline feature: given a program, propose a set of tasks (and how many
 * repetitions of each) that fills — without exceeding — a session's effort
 * budget, then emit the run sheet as CSV, then reconcile what actually got
 * recorded back into the task repetition counts.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { jsonCol, num, parseJson, str, uuid, type Row } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import {
  DEFAULT_SLOTS,
  SESSION_EFFORT_BUDGET,
  effortUnits,
  isSchedulable,
  isWeekday,
  provisionalCode,
  repsGap,
} from "../domain";
import * as S from "../serialize";
import { parseCsv } from "./catalog";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

type TaskRec = ReturnType<typeof S.taskLike> & { group: string | null };

interface Allocation { task: TaskRec; reps: number }

// ---------------------------------------------------------------- packing
/**
 * Allocate schedulable tasks *and their repetitions* to fill (without exceeding)
 * the budget.
 *
 * A task may be recorded several times in one session. Each repetition costs the
 * task's effort units, and a task contributes at most its remaining gap. Greedy
 * and deterministic: largest tasks first (a single Long fills the slot), tie-broken
 * by task_code. `remaining` overrides the static gap so auto-fill can spread
 * repetitions across many slots without over-planning.
 *
 * An under-filled result is returned as-is so the caller can report the shortfall.
 */
function packTasks(
  tasks: TaskRec[],
  opts: { budget?: number; excludeIds?: Set<string>; remaining?: Record<string, number> } = {},
): { allocations: Allocation[]; used: number } {
  const budget = opts.budget ?? SESSION_EFFORT_BUDGET;
  const exclude = opts.excludeIds ?? new Set<string>();
  const remaining = opts.remaining;

  const eligible = tasks
    .filter((t) => (remaining ? (remaining[t.id] ?? 0) > 0 : isSchedulable(t)) && !exclude.has(t.id))
    .sort((a, b) => effortUnits(b.duration_type) - effortUnits(a.duration_type)
      || a.task_code.localeCompare(b.task_code));

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
    allocations.push({ task: t, reps });
    used += reps * u;
    if (used >= budget) break;
  }
  return { allocations, used };
}

// ---------------------------------------------------------------- session CSV contract
/**
 * SINGLE SOURCE OF TRUTH for the session-CSV contract. The generated run sheet
 * and the upload parser both derive from this list, so they cannot drift.
 * `source` says who fills each column:
 *   "task" -> auto-filled from the task catalog when the CSV is generated
 *   "user" -> entered by the operator at accept time (robot / payload / lab)
 *   "post" -> left blank; filled by the collection tooling AFTER recording
 */
export const SESSION_CSV_SPEC = [
  { name: "recording_folder", source: "post", desc: "Folder holding the captured bag/recording; filled after collection." },
  { name: "odr", source: "post", desc: "On-device recording identifier; filled after collection." },
  { name: "session_id", source: "post", desc: "Collection session identifier; filled after collection." },
  { name: "robot_id", source: "user", desc: "Robot code, entered when the session is accepted." },
  { name: "task_id", source: "task", desc: "Task identifier (join key back to the app on upload)." },
  { name: "group", source: "task", desc: "Task group / category, from the task catalog." },
  { name: "task", source: "task", desc: "Task name, from the task catalog." },
  { name: "variant", source: "task", desc: "Task variant used, from the task catalog." },
  { name: "error", source: "task", desc: "Injected error scenario for the variant, if any." },
  { name: "device_name", source: "post", desc: "Capture device / sensor name; filled after collection." },
  { name: "file_name", source: "post", desc: "Recorded file name; filled after collection." },
  { name: "relative_path", source: "post", desc: "Path to the recording within the folder; filled after collection." },
  { name: "payload", source: "user", desc: "Sensor payload configuration, entered when the session is accepted." },
  { name: "instructions_changed", source: "post", desc: "Whether instructions changed during collection; filled after." },
  { name: "payload_changed", source: "post", desc: "Whether the payload changed during collection; filled after." },
  { name: "session_lab", source: "user", desc: "Lab the run took place in, entered when the session is accepted." },
  { name: "recording_duration", source: "post", desc: "Recording duration; filled after collection." },
] as const;

export const SESSION_CSV_COLUMNS = SESSION_CSV_SPEC.map((c) => c.name);

const csvCell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

const firstVariant = (t: TaskRec): Record<string, unknown> => {
  const v = t.variants[0];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
};

/** One CSV row per planned repetition — a task with 3 reps emits 3 rows. */
function generateSessionCsv(
  allocations: Allocation[],
  ctx: { robotCode: string; payload: string; sessionLab: string },
): string {
  const lines = [SESSION_CSV_COLUMNS.join(",")];
  for (const { task, reps } of allocations) {
    const v = firstVariant(task);
    for (let i = 0; i < reps; i++) {
      const row: Record<string, unknown> = {
        robot_id: ctx.robotCode,
        task_id: task.id,
        group: task.group ?? "",
        task: task.name,
        variant: v.name ?? "Standard",
        error: "",
        payload: ctx.payload,
        session_lab: ctx.sessionLab,
      };
      lines.push(SESSION_CSV_COLUMNS.map((col) => csvCell(row[col] ?? "")).join(","));
    }
  }
  return lines.join("\n");
}

/** task_id -> number of recorded rows, from an uploaded run sheet. */
function parseCompletedCounts(csvText: string): Record<string, number> {
  const rows = parseCsv(csvText ?? "");
  if (rows.length < 2) return {};
  const header = rows[0]!.map((h) => h.trim());
  const idIdx = header.indexOf("task_id");
  if (idIdx === -1) return {};
  const counts: Record<string, number> = {};
  for (let i = 1; i < rows.length; i++) {
    const id = (rows[i]![idIdx] ?? "").trim();
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------- helpers
async function loadTasks(db: D1Database, studyId: string): Promise<TaskRec[]> {
  const { results } = await db
    .prepare(`SELECT * FROM tasks WHERE study_id = ? ORDER BY task_code`)
    .bind(studyId).all<Row>();
  return results.map((r) => ({ ...S.taskLike(r), group: r["group"] === null ? null : String(r["group"]) }));
}

const proposalPayload = (
  sessionId: string,
  allocations: Allocation[],
  used: number,
  budget: number,
) => ({
  session_id: sessionId,
  tasks: allocations.map(({ task, reps }) => ({
    id: task.id,
    task_code: task.task_code,
    name: task.name,
    group: task.group,
    duration_type: task.duration_type,
    effort_units: effortUnits(task.duration_type),
    reps_gap: repsGap(task),
    reps,
    row_units: effortUnits(task.duration_type) * reps,
  })),
  total_units: used,
  total_reps: allocations.reduce((n, a) => n + a.reps, 0),
  budget,
  meets_floor: used >= 2,
  fully_packed: used === budget,
});

export function mountAutoschedule(app: App): void {
  // ------------------------------------------------------------ propose
  /** Build a draft session and fill it with a proposed task/rep allocation. */
  app.post("/session-proposals", async (c) => {
    const b = await c.req.json<{ study_id: string; slot_date?: string | null; slot_time?: string | null; budget?: number }>();
    if (!b.study_id) throw badRequest("study_id is required");
    const budget = b.budget ?? SESSION_EFFORT_BUDGET;

    const tasks = await loadTasks(c.env.DB, b.study_id);
    const { allocations, used } = packTasks(tasks, { budget });
    if (allocations.length === 0) {
      throw conflict("no schedulable tasks: every task is either not ready, unavailable, or has met its repetition goal");
    }

    const id = uuid();
    const slotDate = b.slot_date ?? null;
    const taskReps = Object.fromEntries(allocations.map((a) => [a.task.id, a.reps]));
    await c.env.DB.prepare(
      `INSERT INTO sessions (id, study_id, slot_date, slot_time, state, task_scope, task_ids, task_reps, provisional_code)
       VALUES (?, ?, ?, ?, 'ASSEMBLING', 'SINGLE', ?, ?, ?)`,
    ).bind(
      id, b.study_id, slotDate, b.slot_time ?? null,
      jsonCol(allocations.map((a) => a.task.id)), jsonCol(taskReps), provisionalCode(slotDate),
    ).run();

    return c.json(proposalPayload(id, allocations, used, budget), 201);
  });

  /** Re-roll: propose a different set, excluding whatever was just rejected. */
  app.post("/sessions/:id/reject-proposal", async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("session");
    const s = S.session(row);

    const tasks = await loadTasks(c.env.DB, s.study_id);
    const { allocations, used } = packTasks(tasks, { excludeIds: new Set(s.task_ids) });
    const taskReps = Object.fromEntries(allocations.map((a) => [a.task.id, a.reps]));
    await c.env.DB.prepare(
      `UPDATE sessions SET task_ids = ?, task_reps = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol(allocations.map((a) => a.task.id)), jsonCol(taskReps), id).run();

    return c.json(proposalPayload(id, allocations, used, SESSION_EFFORT_BUDGET));
  });

  // ------------------------------------------------------------ accept
  /**
   * Accept the proposal: record the operator's run inputs, mark the tasks
   * IN_PROGRESS, and emit the run-sheet CSV (also stored in the vault).
   */
  app.post("/sessions/:id/accept-proposal", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<{ robot_id?: string | null; payload?: string | null; session_lab?: string | null }>();

    const row = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("session");
    const s = S.session(row);
    if (s.task_ids.length === 0) throw conflict("session has no proposed tasks to accept");

    const robotId = b.robot_id ?? s.robot_id;
    let robotCode = "";
    if (robotId) {
      const r = await c.env.DB.prepare(`SELECT robot_code FROM robots WHERE id = ?`).bind(robotId).first<Row>();
      robotCode = r ? str(r, "robot_code") : "";
    }

    const all = await loadTasks(c.env.DB, s.study_id);
    const byId = new Map(all.map((t) => [t.id, t]));
    const allocations: Allocation[] = s.task_ids
      .map((tid) => {
        const task = byId.get(tid);
        return task ? { task, reps: s.task_reps[tid] ?? 1 } : null;
      })
      .filter((a): a is Allocation => a !== null);

    const csv = generateSessionCsv(allocations, {
      robotCode,
      payload: b.payload ?? s.payload ?? "",
      sessionLab: b.session_lab ?? s.session_lab ?? "",
    });

    const key = `run-sheets/${s.provisional_code ?? id}_${id.slice(0, 8)}.csv`;
    await c.env.VAULT.put(key, csv, { httpMetadata: { contentType: "text/csv" } });

    const stmts: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `UPDATE sessions SET robot_id = ?, payload = ?, session_lab = ?, state = 'READY',
                             updated_at = datetime('now') WHERE id = ?`,
      ).bind(robotId ?? null, b.payload ?? s.payload, b.session_lab ?? s.session_lab, id),
    ];
    for (const a of allocations) {
      stmts.push(c.env.DB
        .prepare(`UPDATE tasks SET schedule_status = 'IN_PROGRESS', updated_at = datetime('now') WHERE id = ?`)
        .bind(a.task.id));
    }
    await c.env.DB.batch(stmts);

    const updated = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?`).bind(id).first<Row>();
    return c.json({
      session: S.session(updated!),
      task_count: allocations.length,
      session_csv: csv,
      saved_path: key,
    });
  });

  // ------------------------------------------------------------ upload / reconcile
  /**
   * Reconcile what actually got recorded. Tasks present in the uploaded sheet
   * (or explicitly ticked) have their repetition counts advanced; anything the
   * operator dropped goes back to AVAILABLE so the next session picks it up.
   */
  app.post("/sessions/:id/upload-csv", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<{ completed_task_ids?: string[]; csv_text?: string }>();

    const row = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound("session");
    const s = S.session(row);

    const counts = b.csv_text ? parseCompletedCounts(b.csv_text) : {};
    const explicit = new Set(b.completed_task_ids ?? []);
    const completedIds = new Set<string>([...Object.keys(counts), ...explicit]);

    const all = await loadTasks(c.env.DB, s.study_id);
    const byId = new Map(all.map((t) => [t.id, t]));

    const recorded: string[] = [];
    const reverted: string[] = [];
    const changes: { task_id: string; schedule_status: string; reps_actual: number; reps_gap: number }[] = [];
    const stmts: D1PreparedStatement[] = [];

    for (const tid of s.task_ids) {
      const t = byId.get(tid);
      if (!t) continue;
      if (completedIds.has(tid)) {
        // Prefer the real recorded row count; fall back to the planned reps.
        const got = counts[tid] ?? s.task_reps[tid] ?? 1;
        const repsActual = Math.min(t.reps_target, t.reps_actual + got);
        const gap = Math.max(0, t.reps_target - repsActual);
        const status = gap === 0 ? "RECORDED" : "AVAILABLE";
        stmts.push(c.env.DB.prepare(
          `UPDATE tasks SET reps_actual = ?, schedule_status = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(repsActual, status, tid));
        recorded.push(t.task_code);
        changes.push({ task_id: tid, schedule_status: status, reps_actual: repsActual, reps_gap: gap });
      } else {
        stmts.push(c.env.DB.prepare(
          `UPDATE tasks SET schedule_status = 'AVAILABLE', updated_at = datetime('now') WHERE id = ?`,
        ).bind(tid));
        reverted.push(t.task_code);
        changes.push({
          task_id: tid, schedule_status: "AVAILABLE",
          reps_actual: t.reps_actual, reps_gap: repsGap(t),
        });
      }
    }

    const rows = b.csv_text ? parseSessionRows(b.csv_text) : [];
    stmts.push(c.env.DB.prepare(
      `UPDATE sessions SET state = 'COLLECTED', completed_task_ids = ?, collected_rows = ?,
                           updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol([...completedIds]), jsonCol(rows), id));

    await c.env.DB.batch(stmts);
    return c.json({ recorded, reverted, tasks: changes });
  });

  // ------------------------------------------------------------ auto-fill a date range
  /**
   * Spread every outstanding repetition across the open weekday slots in a range,
   * creating one confirmed-ready session per filled slot. Stops when the
   * repetitions run out or the slots do.
   */
  app.post("/studies/:id/auto-fill", async (c) => {
    const studyId = c.req.param("id");
    const b = await c.req.json<{ start: string; end: string; budget?: number }>();
    if (!b.start || !b.end) throw badRequest("start and end are required");
    const budget = b.budget ?? SESSION_EFFORT_BUDGET;

    const tasks = await loadTasks(c.env.DB, studyId);
    const remaining: Record<string, number> = {};
    for (const t of tasks) {
      if (isSchedulable(t)) remaining[t.id] = repsGap(t);
    }

    // Enumerate the weekday slot grid across the range.
    const slots: { date: string; time: string }[] = [];
    for (let d = new Date(`${b.start}T00:00:00Z`); d <= new Date(`${b.end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (!isWeekday(iso)) continue;
      for (const time of DEFAULT_SLOTS) slots.push({ date: iso, time });
    }

    const sessionIds: string[] = [];
    const stmts: D1PreparedStatement[] = [];
    let slotsUsed = 0;

    for (const slot of slots) {
      if (Object.values(remaining).every((n) => n <= 0)) break;
      const { allocations } = packTasks(tasks, { budget, remaining });
      if (allocations.length === 0) break;

      const id = uuid();
      const taskReps = Object.fromEntries(allocations.map((a) => [a.task.id, a.reps]));
      stmts.push(c.env.DB.prepare(
        `INSERT INTO sessions (id, study_id, slot_date, slot_time, state, task_scope, task_ids, task_reps, provisional_code)
         VALUES (?, ?, ?, ?, 'ASSEMBLING', 'SINGLE', ?, ?, ?)`,
      ).bind(id, studyId, slot.date, slot.time, jsonCol(allocations.map((a) => a.task.id)),
        jsonCol(taskReps), provisionalCode(slot.date)));

      for (const a of allocations) remaining[a.task.id] = (remaining[a.task.id] ?? 0) - a.reps;
      sessionIds.push(id);
      slotsUsed += 1;
    }

    if (stmts.length) await c.env.DB.batch(stmts);
    const repsRemaining = Object.values(remaining).reduce((n, v) => n + Math.max(0, v), 0);
    return c.json({
      created: sessionIds.length,
      slots_used: slotsUsed,
      reps_remaining: repsRemaining,
      session_ids: sessionIds,
    });
  });
}

/** Every uploaded row, kept verbatim so QA can inspect what was actually captured. */
function parseSessionRows(csvText: string): Record<string, string>[] {
  const rows = parseCsv(csvText ?? "");
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = (cells[i] ?? "").trim(); });
    return rec;
  });
}
