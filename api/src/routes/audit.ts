/**
 * The audit trail, read side. Every change made through the API — by a person in
 * the UI or an agent with a token — lands here with before/after snapshots.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import type { Row } from "../db";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

export function mountAudit(app: App): void {
  /** Newest first. Filter by `resource`, `entity_id`, `actor_subject`, `via`; `limit` up to 200. */
  app.get("/audit", async (c) => {
    const where: string[] = [];
    const params: unknown[] = [];
    for (const col of ["resource", "entity_id", "actor_subject", "via"] as const) {
      const v = c.req.query(col);
      if (v) { where.push(`${col} = ?`); params.push(v); }
    }
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 50, 1), 200);
    const sql = `SELECT * FROM audit_events${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
                 ORDER BY at DESC, rowid DESC LIMIT ${limit}`;
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<Row>();
    return c.json(results.map(S.auditEvent));
  });
}
