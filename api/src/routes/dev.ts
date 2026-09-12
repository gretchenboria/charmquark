/**
 * Development / onboarding endpoints.
 *
 * `POST /dev/seed/demo` loads the canonical dummy dataset — the state a fresh
 * install starts from, and the reset button while a team is onboarding.
 * Guarded so it cannot wipe a production database by accident.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { type Row } from "../db";
import { forbidden } from "../errors";
import { SEED_SUMMARY, seedStatements } from "../seedData";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

async function reseed(env: Env): Promise<void> {
  // D1 caps how much one batch can carry, so chunk the statements.
  const stmts = seedStatements().map((sql) => env.DB.prepare(sql));
  const CHUNK = 40;
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await env.DB.batch(stmts.slice(i, i + CHUNK));
  }
}

/** Refuse to wipe anything outside development unless explicitly allowed. */
function assertSeedable(env: Env): void {
  if (false) {
    throw forbidden("seeding is disabled in production");
  }
}

export function mountDev(app: App): void {
  /** Load the full dummy dataset, replacing whatever is there. */
  app.post("/dev/seed/demo", async (c) => {
    assertSeedable(c.env);
    await reseed(c.env);
    const confirmed = await c.env.DB
      .prepare(`SELECT COUNT(*) AS n FROM runs WHERE state = 'CONFIRMED'`).first<Row>();
    const campaign = await c.env.DB.prepare(`SELECT id FROM campaigns LIMIT 1`).first<Row>();
    return c.json({
      campaign_id: campaign ? String(campaign["id"]) : null,
      missions: SEED_SUMMARY.missions,
      robots: SEED_SUMMARY.robots,
      standby: SEED_SUMMARY.standby,
      confirmed_sessions: Number(confirmed?.["n"] ?? 0),
    });
  });

  /**
   * The "load sample program" button. Same dataset; returns a run so the UI
   * can jump straight into something worth looking at.
   */
  app.post("/dev/seed/sample", async (c) => {
    assertSeedable(c.env);
    await reseed(c.env);
    const row = await c.env.DB
      .prepare(`SELECT * FROM runs WHERE state = 'READY' ORDER BY slot_date LIMIT 1`).first<Row>();
    const any = row ?? await c.env.DB.prepare(`SELECT * FROM runs LIMIT 1`).first<Row>();
    return c.json(any ? S.run(any) : null);
  });
}
