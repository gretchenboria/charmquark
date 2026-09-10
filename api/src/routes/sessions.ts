/**
 * Sessions — assembly, readiness, confirmation, the data pipeline, and the
 * operator field log.
 *
 * A session is the unit of work: one lab slot in which one robot, driven by one
 * operator with one sensor fleet, runs a set of tasks. Everything here is about
 * getting a session to READY (all gates green) and then walking it down the
 * pipeline to DONE.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { buildUpdate, jsonCol, num, parseJson, str, strOrNull, uuid, type Row } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import {
  canConfirm,
  encodedCode,
  isValidSlotTime,
  provisionalCode,
  sessionReadiness,
  type InventoryLike,
  type ReadinessIssue,
} from "../domain";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

/**
 * The canonical data pipeline. `advance` walks a session one step along it;
 * everything before COLLECTED is driven by assembly and confirmation instead.
 */
const PIPELINE = [
  "CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED",
  "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE",
] as const;

const ASSIGN_COLS = [
  "task_scope", "task_group_id", "task_ids", "robot_id", "operator_id",
  "lab_id", "device_fleet_id", "slot_date", "slot_time", "notes",
  "payload", "session_lab",
] as const;

// ---------------------------------------------------------------- readiness assembly
/**
 * Resolve every member of a session and reduce them to a readiness verdict.
 * Kept in one place so the readiness endpoint, the confirm gate and the
 * auto-scheduler all agree on what "ready" means.
 */
async function readinessFor(db: D1Database, sessionRow: Row): Promise<ReadinessIssue[]> {
  const s = S.session(sessionRow);

  // --- tasks in scope ---
  let taskRows: Row[] = [];
  if (s.task_scope === "GROUP" && s.task_group_id) {
    const { results } = await db
      .prepare(`SELECT * FROM tasks WHERE task_group_id = ? ORDER BY task_code`)
      .bind(s.task_group_id).all<Row>();
    taskRows = results;
  } else if (s.task_ids.length) {
    const { results } = await db
      .prepare(`SELECT * FROM tasks WHERE id IN (${s.task_ids.map(() => "?").join(",")}) ORDER BY task_code`)
      .bind(...s.task_ids).all<Row>();
    taskRows = results;
  }
  const tasks = taskRows.map(S.taskLike);

  // --- per-task inventory, so the gate is attributed to the task that needs it ---
  const taskInventory: Record<string, InventoryLike[]> = {};
  const allInvIds = new Set<string>();
  for (const r of taskRows) {
    const ids = parseJson<string[]>(r["inventory_item_ids"], []);
    ids.forEach((i) => allInvIds.add(i));
  }
  let invById = new Map<string, InventoryLike>();
  if (allInvIds.size) {
    const ids = [...allInvIds];
    const { results } = await db
      .prepare(`SELECT id, name, status FROM inventory_items WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all<Row>();
    invById = new Map(results.map((r) => [str(r, "id"), { name: str(r, "name"), status: str(r, "status") }]));
  }
  for (const r of taskRows) {
    const ids = parseJson<string[]>(r["inventory_item_ids"], []);
    taskInventory[str(r, "id")] = ids.map((i) => invById.get(i)).filter((x): x is InventoryLike => Boolean(x));
  }

  // --- the assigned members ---
  const robotRow = s.robot_id
    ? await db.prepare(`SELECT * FROM robots WHERE id = ?`).bind(s.robot_id).first<Row>() : null;
  const opRow = s.operator_id
    ? await db.prepare(`SELECT * FROM operators WHERE id = ?`).bind(s.operator_id).first<Row>() : null;
  const labRow = s.lab_id
    ? await db.prepare(`SELECT * FROM labs WHERE id = ?`).bind(s.lab_id).first<Row>() : null;
  const fleetRow = s.device_fleet_id
    ? await db.prepare(`SELECT * FROM device_fleets WHERE id = ?`).bind(s.device_fleet_id).first<Row>() : null;

  let fleetDevices: { asset_name: string; status: string }[] = [];
  if (fleetRow) {
    const ids = parseJson<string[]>(fleetRow["device_ids"], []);
    if (ids.length) {
      const { results } = await db
        .prepare(`SELECT asset_name, status FROM devices WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids).all<Row>();
      fleetDevices = results.map((r) => ({ asset_name: str(r, "asset_name"), status: str(r, "status") }));
    }
  }

  // --- slot contention: lab capacity, operator double-booking, blackouts ---
  let labUsed = 0;
  let operatorConflicts = 0;
  let labBlackedOut = false;
  if (s.slot_date) {
    if (s.lab_id) {
      const r = await db.prepare(
        `SELECT COUNT(*) AS n FROM sessions
         WHERE lab_id = ? AND slot_date = ? AND id != ? AND state NOT IN ('CANCELLED','DRAFT')`,
      ).bind(s.lab_id, s.slot_date, s.id).first<Row>();
      labUsed = num(r ?? {}, "n");

      const b = await db.prepare(
        `SELECT COUNT(*) AS n FROM lab_blackouts
         WHERE lab_id = ? AND blackout_date = ? AND (slot_time IS NULL OR slot_time = ?)`,
      ).bind(s.lab_id, s.slot_date, s.slot_time).first<Row>();
      labBlackedOut = num(b ?? {}, "n") > 0;
    }
    if (s.operator_id && s.slot_time) {
      const r = await db.prepare(
        `SELECT COUNT(*) AS n FROM sessions
         WHERE operator_id = ? AND slot_date = ? AND slot_time = ? AND id != ?
           AND state NOT IN ('CANCELLED','DRAFT')`,
      ).bind(s.operator_id, s.slot_date, s.slot_time, s.id).first<Row>();
      operatorConflicts = num(r ?? {}, "n");
    }
  }

  return sessionReadiness({
    tasks,
    robot: robotRow ? S.robot(robotRow) : null,
    operator: opRow ? S.operator(opRow) : null,
    lab: labRow ? S.lab(labRow) : null,
    deviceFleet: fleetRow ? S.deviceFleet(fleetRow) : null,
    fleetDevices,
    inventoryItems: [],
    taskInventory,
    labUsed,
    operatorConflicts,
    labBlackedOut,
  });
}

/** DRAFT -> ASSEMBLING once anything is assigned; -> READY once every gate is green. */
function derivedState(current: string, s: ReturnType<typeof S.session>, issues: ReadinessIssue[]): string {
  // Once a session is confirmed or further along, assembly no longer drives state.
  if (PIPELINE.includes(current as (typeof PIPELINE)[number])) return current;
  if (current === "CANCELLED" || current === "BLOCKED") return current;
  const touched = Boolean(
    s.robot_id || s.operator_id || s.lab_id || s.device_fleet_id || s.task_group_id || s.task_ids.length,
  );
  if (!touched) return "DRAFT";
  return issues.length === 0 ? "READY" : "ASSEMBLING";
}

const getSession = async (db: D1Database, id: string): Promise<Row> => {
  const row = await db.prepare(`SELECT * FROM sessions WHERE id = ?`).bind(id).first<Row>();
  if (!row) throw notFound("session");
  return row;
};

export function mountSessions(app: App): void {
  // ------------------------------------------------------------ listing
  app.get("/studies/:id/sessions", async (c) => {
    const start = c.req.query("start");
    const end = c.req.query("end");
    let sql = `SELECT * FROM sessions WHERE study_id = ?`;
    const params: unknown[] = [c.req.param("id")];
    if (start && end) {
      sql += ` AND (slot_date IS NULL OR (slot_date >= ? AND slot_date <= ?))`;
      params.push(start, end);
    }
    sql += ` ORDER BY slot_date, slot_time, session_seq`;
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<Row>();
    return c.json(results.map(S.session));
  });

  /** Free-form filtered listing (state, robot, operator, lab, date range). */
  app.get("/sessions", async (c) => {
    const filters: [string, string | undefined][] = [
      ["study_id", c.req.query("study_id")],
      ["state", c.req.query("state")],
      ["robot_id", c.req.query("robot_id")],
      ["operator_id", c.req.query("operator_id")],
      ["lab_id", c.req.query("lab_id")],
      ["slot_date", c.req.query("slot_date")],
    ];
    const where: string[] = [];
    const params: unknown[] = [];
    for (const [col, val] of filters) {
      if (val) { where.push(`${col} = ?`); params.push(val); }
    }
    const start = c.req.query("start");
    const end = c.req.query("end");
    if (start && end) { where.push(`slot_date >= ? AND slot_date <= ?`); params.push(start, end); }
    const sql = `SELECT * FROM sessions${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
                 ORDER BY slot_date, slot_time, session_seq`;
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<Row>();
    return c.json(results.map(S.session));
  });

  app.get("/sessions/:id", async (c) => c.json(S.session(await getSession(c.env.DB, c.req.param("id")))));

  // ------------------------------------------------------------ create / assign
  app.post("/sessions", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.study_id) throw badRequest("study_id is required");
    const slotDate = (b.slot_date as string | null) ?? null;
    const slotTime = (b.slot_time as string | null) ?? null;
    if (!isValidSlotTime(slotTime)) throw badRequest(`invalid slot_time: ${slotTime}`);
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO sessions (id, study_id, slot_date, slot_time, state, provisional_code)
       VALUES (?, ?, ?, ?, 'DRAFT', ?)`,
    ).bind(id, b.study_id, slotDate, slotTime, provisionalCode(slotDate)).run();
    return c.json(S.session(await getSession(c.env.DB, id)), 201);
  });

  /** Assign members. Every assignment re-runs readiness and re-derives the state. */
  app.patch("/sessions/:id", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>();
    if ("slot_time" in b && !isValidSlotTime(b.slot_time as string | null)) {
      throw badRequest(`invalid slot_time: ${b.slot_time}`);
    }
    const upd = buildUpdate("sessions", id, b, ASSIGN_COLS, {
      task_ids: (v) => jsonCol(v ?? []),
    });
    if (upd) await c.env.DB.prepare(upd.sql).bind(...upd.params).run();

    let row = await getSession(c.env.DB, id);
    // Keep the provisional code in step with the date while still assembling.
    if ("slot_date" in b) {
      await c.env.DB.prepare(`UPDATE sessions SET provisional_code = ? WHERE id = ?`)
        .bind(provisionalCode(strOrNull(row, "slot_date")), id).run();
      row = await getSession(c.env.DB, id);
    }
    const issues = await readinessFor(c.env.DB, row);
    const next = derivedState(str(row, "state"), S.session(row), issues);
    if (next !== str(row, "state")) {
      await c.env.DB.prepare(`UPDATE sessions SET state = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(next, id).run();
      row = await getSession(c.env.DB, id);
    }
    return c.json(S.session(row));
  });

  app.delete("/sessions/:id", async (c) => {
    const res = await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(c.req.param("id")).run();
    if (!res.meta.changes) throw notFound("session");
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ readiness
  app.get("/sessions/:id/readiness", async (c) => {
    const row = await getSession(c.env.DB, c.req.param("id"));
    const issues = await readinessFor(c.env.DB, row);
    return c.json({ ready: issues.length === 0, can_confirm: canConfirm(issues), issues });
  });

  // ------------------------------------------------------------ confirm
  /**
   * Confirmation is the hard gate: zero readiness issues, or 409. On success the
   * session gets its day sequence number and its encoded code (phase B).
   */
  app.post("/sessions/:id/confirm", async (c) => {
    const id = c.req.param("id");
    const row = await getSession(c.env.DB, id);
    const s = S.session(row);
    if (s.state === "CONFIRMED") return c.json(s);

    const issues = await readinessFor(c.env.DB, row);
    if (!canConfirm(issues)) {
      throw conflict(`session is not ready: ${issues.map((i) => i.reason).join("; ")}`);
    }
    if (!s.slot_date) throw conflict("session has no date");

    // Day sequence: the next S# for this lab-day.
    const seqRow = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(session_seq), 0) AS n FROM sessions WHERE slot_date = ? AND lab_id = ?`,
    ).bind(s.slot_date, s.lab_id).first<Row>();
    const seq = num(seqRow ?? {}, "n") + 1;

    const op = s.operator_id
      ? await c.env.DB.prepare(`SELECT code_number FROM operators WHERE id = ?`).bind(s.operator_id).first<Row>()
      : null;
    const lab = s.lab_id
      ? await c.env.DB.prepare(`SELECT code_number FROM labs WHERE id = ?`).bind(s.lab_id).first<Row>()
      : null;

    const code = encodedCode({
      slotDate: s.slot_date,
      operatorNumber: num(op ?? {}, "code_number", 0),
      labNumber: num(lab ?? {}, "code_number", 0),
      sessionSeq: seq,
    });

    await c.env.DB.prepare(
      `UPDATE sessions SET state = 'CONFIRMED', session_seq = ?, encoded_code = ?,
                           updated_at = datetime('now') WHERE id = ?`,
    ).bind(seq, code, id).run();
    return c.json(S.session(await getSession(c.env.DB, id)));
  });

  // ------------------------------------------------------------ pipeline
  /** Walk the session one step down the canonical pipeline. */
  app.post("/sessions/:id/advance", async (c) => {
    const id = c.req.param("id");
    const row = await getSession(c.env.DB, id);
    const state = str(row, "state");
    const idx = PIPELINE.indexOf(state as (typeof PIPELINE)[number]);
    if (idx === -1) throw conflict(`session in state ${state} is not on the data pipeline — confirm it first`);
    if (idx === PIPELINE.length - 1) throw conflict("session is already DONE");
    const next = PIPELINE[idx + 1]!;
    await c.env.DB.prepare(`UPDATE sessions SET state = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(next, id).run();
    return c.json(S.session(await getSession(c.env.DB, id)));
  });

  // ------------------------------------------------------------ robot cancellation
  /**
   * A booked robot went down. Swap in a cleared standby if one is free for this
   * slot; otherwise drop the assignment and send the session back to ASSEMBLING
   * so the gap is visible rather than silently unready.
   */
  app.post("/sessions/:id/robot-cancel", async (c) => {
    const id = c.req.param("id");
    const row = await getSession(c.env.DB, id);
    const s = S.session(row);

    const prevRow = s.robot_id
      ? await c.env.DB.prepare(`SELECT * FROM robots WHERE id = ?`).bind(s.robot_id).first<Row>() : null;
    const previous = prevRow ? str(prevRow, "robot_code") : null;

    // Mark the failed robot as needing maintenance — it just failed a mission.
    if (s.robot_id) {
      await c.env.DB.prepare(`UPDATE robots SET status = 'MAINTENANCE', updated_at = datetime('now') WHERE id = ?`)
        .bind(s.robot_id).run();
    }

    // A standby is eligible when it is cleared and not already booked in this slot.
    // Platform matters: a quadruped cannot stand in for a mobile manipulator, so
    // same-platform candidates are strongly preferred and a cross-platform swap is
    // only offered as a last resort (the operator still sees which one was chosen).
    const prevPlatform = prevRow ? strOrNull(prevRow, "platform") : null;
    const standby = await c.env.DB.prepare(
      `SELECT * FROM robots r
       WHERE r.is_standby = 1 AND r.safety_certified = 1 AND r.calibration_valid = 1
         AND r.commissioned = 1 AND r.status IN ('POOL','ACTIVE') AND r.id != COALESCE(?, '')
         AND NOT EXISTS (
           SELECT 1 FROM sessions s2
           WHERE s2.robot_id = r.id AND s2.slot_date = ? AND s2.slot_time IS ?
             AND s2.id != ? AND s2.state NOT IN ('CANCELLED','DRAFT')
         )
       ORDER BY (r.platform IS NOT ?) , r.robot_code LIMIT 1`,
    ).bind(s.robot_id, s.slot_date, s.slot_time, id, prevPlatform).first<Row>();

    const swappedIn = standby ? str(standby, "robot_code") : null;
    await c.env.DB.prepare(
      `UPDATE sessions SET robot_id = ?, state = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(standby ? str(standby, "id") : null, standby ? str(row, "state") : "ASSEMBLING", id).run();

    const updated = await getSession(c.env.DB, id);
    const samePlatform = standby ? strOrNull(standby, "platform") === prevPlatform : false;
    const message = !standby
      ? `No cleared standby available — ${previous ?? "the robot"} was unassigned and the session is back in assembly.`
      : samePlatform
        ? `Swapped in standby ${swappedIn} for ${previous ?? "the previous robot"}.`
        : `Swapped in standby ${swappedIn} for ${previous ?? "the previous robot"} — note this is a `
          + `${strOrNull(standby, "platform") ?? "different"} platform, not ${prevPlatform ?? "the original"}; `
          + `confirm the task set is still valid.`;
    return c.json({ session: S.session(updated), swapped_in: swappedIn, previous, message });
  });

  // ------------------------------------------------------------ operator field log
  /**
   * The operator's per-task field log during execution. Marking the first task
   * moves the session into IN_EXECUTION so the board reflects live work.
   */
  app.put("/sessions/:id/execution/:taskId", async (c) => {
    const id = c.req.param("id");
    const taskId = c.req.param("taskId");
    const b = await c.req.json<{ done?: boolean | null; note?: string | null; variant_code?: string | null }>();

    const row = await getSession(c.env.DB, id);
    const log = parseJson<Record<string, Record<string, unknown>>>(row["execution_log"], {});
    const entry = { ...(log[taskId] ?? {}) };
    if (b.done !== undefined) entry.done = b.done;
    if (b.note !== undefined) entry.note = b.note;
    if (b.variant_code !== undefined) entry.variant_code = b.variant_code;
    entry.updated_at = new Date().toISOString();
    log[taskId] = entry;

    const completed = Object.entries(log).filter(([, v]) => v.done).map(([k]) => k);
    const state = str(row, "state") === "CONFIRMED" ? "IN_EXECUTION" : str(row, "state");

    await c.env.DB.prepare(
      `UPDATE sessions SET execution_log = ?, completed_task_ids = ?, state = ?,
                           updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol(log), jsonCol(completed), state, id).run();
    return c.json(S.session(await getSession(c.env.DB, id)));
  });
}

export { readinessFor };
