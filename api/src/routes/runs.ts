/**
 * Runs — assembly, readiness, confirmation, the data pipeline, and the
 * operator field log.
 *
 * A run is the unit of work: one lab slot in which one robot, driven by one
 * operator with one sensor fleet, runs a set of missions. Everything here is about
 * getting a run to READY (all gates green) and then walking it down the
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
import { debitRunCredit } from "./billing";
import * as S from "../serialize";
import { requirePlanner, requireRunConfirmer } from "../auth";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

/**
 * The canonical data pipeline. `advance` walks a run one step along it;
 * everything before COLLECTED is driven by assembly and confirmation instead.
 */
const PIPELINE = [
  "CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED",
  "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE",
] as const;

const ASSIGN_COLS = [
  "mission_scope", "mission_group_id", "mission_ids", "robot_id", "operator_id",
  "lab_id", "sensor_rig_id", "slot_date", "slot_time", "notes",
  "payload", "run_lab",
] as const;

// ---------------------------------------------------------------- readiness assembly
/**
 * Resolve every member of a run and reduce them to a readiness verdict.
 * Kept in one place so the readiness endpoint, the confirm gate and the
 * auto-scheduler all agree on what "ready" means.
 */
async function readinessFor(db: D1Database, sessionRow: Row): Promise<ReadinessIssue[]> {
  const s = S.run(sessionRow);

  // --- missions in scope ---
  let taskRows: Row[] = [];
  if (s.mission_scope === "GROUP" && s.mission_group_id) {
    const { results } = await db
      .prepare(`SELECT * FROM missions WHERE mission_group_id = ? ORDER BY mission_code`)
      .bind(s.mission_group_id).all<Row>();
    taskRows = results;
  } else if (s.mission_ids.length) {
    const { results } = await db
      .prepare(`SELECT * FROM missions WHERE id IN (${s.mission_ids.map(() => "?").join(",")}) ORDER BY mission_code`)
      .bind(...s.mission_ids).all<Row>();
    taskRows = results;
  }
  const missions = taskRows.map(S.taskLike);

  // --- per-mission inventory, so the gate is attributed to the mission that needs it ---
  const missionInventory: Record<string, InventoryLike[]> = {};
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
    missionInventory[str(r, "id")] = ids.map((i) => invById.get(i)).filter((x): x is InventoryLike => Boolean(x));
  }

  // --- the assigned members ---
  const robotRow = s.robot_id
    ? await db.prepare(`SELECT * FROM robots WHERE id = ?`).bind(s.robot_id).first<Row>() : null;
  const opRow = s.operator_id
    ? await db.prepare(`SELECT * FROM operators WHERE id = ?`).bind(s.operator_id).first<Row>() : null;
  const labRow = s.lab_id
    ? await db.prepare(`SELECT * FROM labs WHERE id = ?`).bind(s.lab_id).first<Row>() : null;
  const rigRow = s.sensor_rig_id
    ? await db.prepare(`SELECT * FROM sensor_rigs WHERE id = ?`).bind(s.sensor_rig_id).first<Row>() : null;

  let rigSensors: { asset_name: string; status: string }[] = [];
  if (rigRow) {
    const ids = parseJson<string[]>(rigRow["sensor_ids"], []);
    if (ids.length) {
      const { results } = await db
        .prepare(`SELECT asset_name, status FROM sensors WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids).all<Row>();
      rigSensors = results.map((r) => ({ asset_name: str(r, "asset_name"), status: str(r, "status") }));
    }
  }

  // --- slot contention: lab capacity, operator double-booking, blackouts ---
  let labUsed = 0;
  let operatorConflicts = 0;
  let labBlackedOut = false;
  if (s.slot_date) {
    if (s.lab_id) {
      const r = await db.prepare(
        `SELECT COUNT(*) AS n FROM runs
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
        `SELECT COUNT(*) AS n FROM runs
         WHERE operator_id = ? AND slot_date = ? AND slot_time = ? AND id != ?
           AND state NOT IN ('CANCELLED','DRAFT')`,
      ).bind(s.operator_id, s.slot_date, s.slot_time, s.id).first<Row>();
      operatorConflicts = num(r ?? {}, "n");
    }
  }

  return sessionReadiness({
    missions,
    robot: robotRow ? S.robot(robotRow) : null,
    operator: opRow ? S.operator(opRow) : null,
    lab: labRow ? S.lab(labRow) : null,
    sensorRig: rigRow ? S.sensorRig(rigRow) : null,
    rigSensors,
    inventoryItems: [],
    missionInventory,
    labUsed,
    operatorConflicts,
    labBlackedOut,
  });
}

/** DRAFT -> ASSEMBLING once anything is assigned; -> READY once every gate is green. */
function derivedState(current: string, s: ReturnType<typeof S.run>, issues: ReadinessIssue[]): string {
  // Once a run is confirmed or further along, assembly no longer drives state.
  if (PIPELINE.includes(current as (typeof PIPELINE)[number])) return current;
  if (current === "CANCELLED" || current === "BLOCKED") return current;
  const touched = Boolean(
    s.robot_id || s.operator_id || s.lab_id || s.sensor_rig_id || s.mission_group_id || s.mission_ids.length,
  );
  if (!touched) return "DRAFT";
  return issues.length === 0 ? "READY" : "ASSEMBLING";
}

const getRun = async (db: D1Database, id: string): Promise<Row> => {
  const row = await db.prepare(`SELECT * FROM runs WHERE id = ?`).bind(id).first<Row>();
  if (!row) throw notFound("run");
  return row;
};

export function mountRuns(app: App): void {
  // ------------------------------------------------------------ listing
  app.get("/campaigns/:id/runs", async (c) => {
    const start = c.req.query("start");
    const end = c.req.query("end");
    let sql = `SELECT * FROM runs WHERE campaign_id = ?`;
    const params: unknown[] = [c.req.param("id")];
    if (start && end) {
      sql += ` AND (slot_date IS NULL OR (slot_date >= ? AND slot_date <= ?))`;
      params.push(start, end);
    }
    sql += ` ORDER BY slot_date, slot_time, run_seq`;
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<Row>();
    return c.json(results.map(S.run));
  });

  /** Free-form filtered listing (state, robot, operator, lab, date range). */
  app.get("/runs", async (c) => {
    const filters: [string, string | undefined][] = [
      ["campaign_id", c.req.query("campaign_id")],
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
    const sql = `SELECT * FROM runs${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
                 ORDER BY slot_date, slot_time, run_seq`;
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<Row>();
    return c.json(results.map(S.run));
  });

  app.get("/runs/:id", async (c) => c.json(S.run(await getRun(c.env.DB, c.req.param("id")))));

  // ------------------------------------------------------------ create / assign
  app.post("/runs", async (c) => {
    const b = await c.req.json<Record<string, unknown>>();
    if (!b.campaign_id) throw badRequest("campaign_id is required");
    const slotDate = (b.slot_date as string | null) ?? null;
    const slotTime = (b.slot_time as string | null) ?? null;
    if (!isValidSlotTime(slotTime)) throw badRequest(`invalid slot_time: ${slotTime}`);
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO runs (id, campaign_id, slot_date, slot_time, state, provisional_code)
       VALUES (?, ?, ?, ?, 'DRAFT', ?)`,
    ).bind(id, b.campaign_id, slotDate, slotTime, provisionalCode(slotDate)).run();
    return c.json(S.run(await getRun(c.env.DB, id)), 201);
  });

  /** Assign members. Every assignment re-runs readiness and re-derives the state. */
  app.patch("/runs/:id", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<Record<string, unknown>>();
    if ("slot_time" in b && !isValidSlotTime(b.slot_time as string | null)) {
      throw badRequest(`invalid slot_time: ${b.slot_time}`);
    }
    const upd = buildUpdate("runs", id, b, ASSIGN_COLS, {
      mission_ids: (v) => jsonCol(v ?? []),
    });
    if (upd) await c.env.DB.prepare(upd.sql).bind(...upd.params).run();

    let row = await getRun(c.env.DB, id);
    // Keep the provisional code in step with the date while still assembling.
    if ("slot_date" in b) {
      await c.env.DB.prepare(`UPDATE runs SET provisional_code = ? WHERE id = ?`)
        .bind(provisionalCode(strOrNull(row, "slot_date")), id).run();
      row = await getRun(c.env.DB, id);
    }
    const issues = await readinessFor(c.env.DB, row);
    const next = derivedState(str(row, "state"), S.run(row), issues);
    if (next !== str(row, "state")) {
      await c.env.DB.prepare(`UPDATE runs SET state = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(next, id).run();
      row = await getRun(c.env.DB, id);
    }
    return c.json(S.run(row));
  });

  app.delete("/runs/:id", async (c) => {
    const res = await c.env.DB.prepare(`DELETE FROM runs WHERE id = ?`).bind(c.req.param("id")).run();
    if (!res.meta.changes) throw notFound("run");
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ readiness
  app.get("/runs/:id/readiness", async (c) => {
    const row = await getRun(c.env.DB, c.req.param("id"));
    const issues = await readinessFor(c.env.DB, row);
    return c.json({ ready: issues.length === 0, can_confirm: canConfirm(issues), issues });
  });

  // ------------------------------------------------------------ confirm
  /**
   * Confirmation is the hard gate: zero readiness issues, or 409. On success the
   * run gets its day sequence number and its encoded code (phase B).
   *
   * It is also the billable moment — one run credit, debited here and nowhere
   * else. Confirmation is the only irreversible commitment in the lifecycle: it
   * books the lab slot, locks the operator's time and mints the code the
   * collected data is filed under. Assembling, proposing and auto-filling are
   * all free, so a team can plan a whole month before spending anything, and a
   * re-confirm of an already-CONFIRMED run returns above without charging.
   *
   * The debit comes *after* the readiness gate — an unready run costs nothing —
   * and before the state write, so a run can never reach CONFIRMED unpaid.
   */
  app.post("/runs/:id/confirm", requireRunConfirmer, async (c) => {
    const id = c.req.param("id");
    const row = await getRun(c.env.DB, id);
    const s = S.run(row);
    if (s.state === "CONFIRMED") return c.json(s);

    const issues = await readinessFor(c.env.DB, row);
    if (!canConfirm(issues)) {
      throw conflict(`run is not ready: ${issues.map((i) => i.reason).join("; ")}`);
    }
    if (!s.slot_date) throw conflict("run has no date");

    // Throws 402 when the account is out of credits; the web client opens the
    // purchase modal on that status rather than toasting the message raw.
    await debitRunCredit(c.env.DB, {
      runId: id,
      actor: c.get("principal").name,
      note: `confirmed run ${s.provisional_code ?? id} on ${s.slot_date}`,
    });

    // Day sequence: the next S# for this lab-day.
    const seqRow = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(run_seq), 0) AS n FROM runs WHERE slot_date = ? AND lab_id = ?`,
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
      runSeq: seq,
    });

    await c.env.DB.prepare(
      `UPDATE runs SET state = 'CONFIRMED', run_seq = ?, encoded_code = ?,
                           updated_at = datetime('now') WHERE id = ?`,
    ).bind(seq, code, id).run();
    return c.json(S.run(await getRun(c.env.DB, id)));
  });

  // ------------------------------------------------------------ pipeline
  /** Walk the run one step down the canonical pipeline. */
  app.post("/runs/:id/advance", async (c) => {
    const id = c.req.param("id");
    const row = await getRun(c.env.DB, id);
    const state = str(row, "state");
    const idx = PIPELINE.indexOf(state as (typeof PIPELINE)[number]);
    if (idx === -1) throw conflict(`run in state ${state} is not on the data pipeline — confirm it first`);
    if (idx === PIPELINE.length - 1) throw conflict("run is already DONE");
    const next = PIPELINE[idx + 1]!;
    await c.env.DB.prepare(`UPDATE runs SET state = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(next, id).run();
    return c.json(S.run(await getRun(c.env.DB, id)));
  });

  // ------------------------------------------------------------ robot cancellation
  /**
   * A booked robot went down. Swap in a cleared standby if one is free for this
   * slot; otherwise drop the assignment and send the run back to ASSEMBLING
   * so the gap is visible rather than silently unready.
   */
  app.post("/runs/:id/robot-cancel", requirePlanner, async (c) => {
    const id = c.req.param("id");
    const row = await getRun(c.env.DB, id);
    const s = S.run(row);

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
           SELECT 1 FROM runs s2
           WHERE s2.robot_id = r.id AND s2.slot_date = ? AND s2.slot_time IS ?
             AND s2.id != ? AND s2.state NOT IN ('CANCELLED','DRAFT')
         )
       ORDER BY (r.platform IS NOT ?) , r.robot_code LIMIT 1`,
    ).bind(s.robot_id, s.slot_date, s.slot_time, id, prevPlatform).first<Row>();

    const swappedIn = standby ? str(standby, "robot_code") : null;
    await c.env.DB.prepare(
      `UPDATE runs SET robot_id = ?, state = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(standby ? str(standby, "id") : null, standby ? str(row, "state") : "ASSEMBLING", id).run();

    const updated = await getRun(c.env.DB, id);
    const samePlatform = standby ? strOrNull(standby, "platform") === prevPlatform : false;
    const message = !standby
      ? `No cleared standby available — ${previous ?? "the robot"} was unassigned and the run is back in assembly.`
      : samePlatform
        ? `Swapped in standby ${swappedIn} for ${previous ?? "the previous robot"}.`
        : `Swapped in standby ${swappedIn} for ${previous ?? "the previous robot"} — note this is a `
          + `${strOrNull(standby, "platform") ?? "different"} platform, not ${prevPlatform ?? "the original"}; `
          + `confirm the mission set is still valid.`;
    return c.json({ run: S.run(updated), swapped_in: swappedIn, previous, message });
  });

  // ------------------------------------------------------------ operator field log
  /**
   * The operator's per-mission field log during execution. Marking the first mission
   * moves the run into IN_EXECUTION so the board reflects live work.
   */
  app.put("/runs/:id/execution/:missionId", async (c) => {
    const id = c.req.param("id");
    const missionId = c.req.param("missionId");
    const b = await c.req.json<{ done?: boolean | null; note?: string | null; variant_code?: string | null }>();

    const row = await getRun(c.env.DB, id);
    const log = parseJson<Record<string, Record<string, unknown>>>(row["execution_log"], {});
    const entry = { ...(log[missionId] ?? {}) };
    if (b.done !== undefined) entry.done = b.done;
    if (b.note !== undefined) entry.note = b.note;
    if (b.variant_code !== undefined) entry.variant_code = b.variant_code;
    entry.updated_at = new Date().toISOString();
    log[missionId] = entry;

    const completed = Object.entries(log).filter(([, v]) => v.done).map(([k]) => k);
    const state = str(row, "state") === "CONFIRMED" ? "IN_EXECUTION" : str(row, "state");

    await c.env.DB.prepare(
      `UPDATE runs SET execution_log = ?, completed_mission_ids = ?, state = ?,
                           updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol(log), jsonCol(completed), state, id).run();
    return c.json(S.run(await getRun(c.env.DB, id)));
  });
}

export { readinessFor };
