/**
 * Coverage routes — declaring a campaign's state space, reporting where runs
 * happened, and reading back what is still missing.
 *
 * The arithmetic lives in `coverage.ts` and is pure; this file is only I/O.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { jsonCol, num, parseJson, str, uuid, type Row } from "../db";
import { badRequest, notFound } from "../errors";
import {
  computeCoverage,
  hasSpace,
  isComplete,
  nextBestCells,
  normaliseCell,
  cellKey,
  validateSpace,
  type CoverageSpace,
} from "../coverage";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

async function loadSpace(db: D1Database, campaignId: string): Promise<CoverageSpace | null> {
  const row = await db.prepare(`SELECT coverage_space FROM campaigns WHERE id = ?`)
    .bind(campaignId).first<Row>();
  if (!row) throw notFound("campaign");
  const space = parseJson<CoverageSpace | null>(row["coverage_space"], null);
  return hasSpace(space) ? space : null;
}

async function loadObservations(db: D1Database, campaignId: string) {
  const { results } = await db
    .prepare(`SELECT cell_key, SUM(count) AS n FROM coverage_observations
              WHERE campaign_id = ? GROUP BY cell_key`)
    .bind(campaignId).all<Row>();
  return results.map((r) => ({ cell_key: str(r, "cell_key"), count: num(r, "n") }));
}

export function mountCoverage(app: App): void {
  // ------------------------------------------------------------ the space
  app.get("/campaigns/:id/coverage", async (c) => {
    const id = c.req.param("id");
    const space = await loadSpace(c.env.DB, id);
    if (!space) {
      // Not an error: a campaign without a space simply is not using coverage.
      return c.json({ configured: false, space: null, state: null, next: [] });
    }
    const state = computeCoverage(space, await loadObservations(c.env.DB, id));
    return c.json({ configured: true, space, state, next: nextBestCells(state, 8) });
  });

  /** Declare or replace the space. Rejected loudly rather than stored broken. */
  app.put("/campaigns/:id/coverage-space", async (c) => {
    const id = c.req.param("id");
    const space = await c.req.json<CoverageSpace>();
    const problems = validateSpace(space);
    if (problems.length) {
      throw badRequest(problems.map((p) => `${p.field}: ${p.reason}`).join("; "));
    }
    const res = await c.env.DB
      .prepare(`UPDATE campaigns SET coverage_space = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(jsonCol(space), id).run();
    if (!res.meta.changes) throw notFound("campaign");
    // Observations are kept: they are raw history, and re-bucketing them against
    // the new space is exactly why they are stored per-cell rather than summed.
    const state = computeCoverage(space, await loadObservations(c.env.DB, id));
    return c.json({ configured: true, space, state, next: nextBestCells(state, 8) });
  });

  // ------------------------------------------------------------ a run's cell
  /**
   * Tag a run with the conditions it ran under. Levels off the campaign's menu
   * are refused rather than silently dropped — a typo that quietly created a
   * phantom cell would leave a gap nothing ever targets.
   */
  app.put("/runs/:id/coverage-cell", async (c) => {
    const runId = c.req.param("id");
    const run = await c.env.DB.prepare(`SELECT campaign_id FROM runs WHERE id = ?`)
      .bind(runId).first<Row>();
    if (!run) throw notFound("run");

    const campaignId = str(run, "campaign_id");
    const space = await loadSpace(c.env.DB, campaignId);
    if (!space) throw badRequest("this campaign has no coverage space defined");

    const body = await c.req.json<Record<string, unknown>>();
    const { cell, dropped } = normaliseCell(space, body.cell ?? body);
    if (dropped.length) {
      throw badRequest(
        `unknown dimension or level: ${dropped.join(", ")}. ` +
        `Expected ${space.dimensions.map((d) => `${d.key} (${d.levels.join("|")})`).join(", ")}`,
      );
    }
    if (!isComplete(space, cell)) throw badRequest("every dimension must be given a level");

    await c.env.DB
      .prepare(`UPDATE runs SET coverage_cell = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(jsonCol(cell), runId).run();
    return c.json({ run_id: runId, cell, cell_key: cellKey(cell) });
  });

  // ------------------------------------------------------------ what next
  app.get("/campaigns/:id/coverage/next", async (c) => {
    const id = c.req.param("id");
    const space = await loadSpace(c.env.DB, id);
    if (!space) return c.json([]);
    const state = computeCoverage(space, await loadObservations(c.env.DB, id));
    const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 8)));
    return c.json(nextBestCells(state, limit));
  });
}

/**
 * Record a run's contribution to coverage. Called when a run's recordings are
 * reconciled, so coverage moves on evidence of collection rather than on a run
 * merely being scheduled.
 *
 * Idempotent by (run, mission): re-uploading a corrected sheet replaces the
 * run's rows instead of stacking a second set on top.
 */
export async function recordCoverage(
  db: D1Database,
  args: { runId: string; campaignId: string; missionCounts: Record<string, number> },
): Promise<{ recorded: number; cell_key: string | null; skipped: string | null }> {
  const run = await db.prepare(`SELECT coverage_cell FROM runs WHERE id = ?`)
    .bind(args.runId).first<Row>();
  const campaign = await db.prepare(`SELECT coverage_space FROM campaigns WHERE id = ?`)
    .bind(args.campaignId).first<Row>();

  const space = parseJson<CoverageSpace | null>(campaign?.["coverage_space"], null);
  if (!hasSpace(space)) return { recorded: 0, cell_key: null, skipped: "campaign has no coverage space" };

  const cell = parseJson<Record<string, string> | null>(run?.["coverage_cell"], null);
  if (!cell || !isComplete(space!, cell)) {
    // Deliberately not an error. The run still collected data; it just cannot be
    // attributed, and the UI surfaces that as an untagged run to fix.
    return { recorded: 0, cell_key: null, skipped: "run has no complete coverage cell" };
  }

  const key = cellKey(cell);
  const stmts: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM coverage_observations WHERE run_id = ?`).bind(args.runId),
  ];
  for (const [missionId, count] of Object.entries(args.missionCounts)) {
    if (!Number.isFinite(count) || count <= 0) continue;
    stmts.push(db.prepare(
      `INSERT INTO coverage_observations (id, campaign_id, run_id, cell_key, count, mission_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), args.campaignId, args.runId, key, Math.round(count), missionId));
  }
  if (stmts.length > 1) await db.batch(stmts);
  return { recorded: stmts.length - 1, cell_key: key, skipped: null };
}
