/**
 * Change set endpoints.
 *
 *   POST /changesets/preview      { summary?, changes: [...] }  -> stored, diff + problems, nothing written
 *   POST /changesets/:id/apply                                  -> re-checked as the caller, applied atomically
 *   POST /changesets/apply        { summary?, changes: [...] }  -> preview and apply in one step
 *   GET  /changesets, /changesets/:id
 *
 * Each change is { resource, op: create|update|delete, id?, ref?, data?, if_match? }.
 * See api/src/changesets.ts for the guarantees.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env, Vars } from "../types";
import { parseJson, str, strOrNull, uuid, type Row } from "../db";
import { notFound } from "../errors";
import { ChangesetConflict, analyze, applyPlan, type ChangePreview } from "../changesets";

type App = Hono<{ Bindings: Env; Variables: Vars }>;
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const jsonError = (status: 409 | 422, detail: string, extra: Record<string, unknown>) =>
  new HTTPException(status, {
    res: new Response(JSON.stringify({ detail, ...extra }), { status, headers: { "Content-Type": "application/json" } }),
  });

const problemCount = (previews: ChangePreview[]) => previews.reduce((n, p) => n + p.problems.length, 0);

const view = (r: Row) => ({
  id: str(r, "id"),
  status: str(r, "status"),
  summary: strOrNull(r, "summary"),
  created_by: str(r, "created_by"),
  via: str(r, "via"),
  created_at: str(r, "created_at"),
  applied_at: strOrNull(r, "applied_at"),
  applied_by: strOrNull(r, "applied_by"),
  error: strOrNull(r, "error"),
  changes: parseJson<unknown[]>(r["changes"], []),
  preview: parseJson<ChangePreview[]>(r["preview"], []),
});

async function readBody(c: Ctx): Promise<{ summary: string | null; changes: unknown }> {
  const b = await c.req.json<{ summary?: unknown; changes?: unknown }>().catch(() => ({} as { summary?: unknown; changes?: unknown }));
  return { summary: typeof b.summary === "string" ? b.summary.slice(0, 500) : null, changes: b.changes };
}

export function mountChangesets(app: App): void {
  app.get("/changesets", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM changesets ORDER BY created_at DESC LIMIT 50`).all<Row>();
    return c.json(results.map((r) => {
      const { changes, preview, ...rest } = view(r);
      return { ...rest, change_count: changes.length, ok: preview.every((p) => p.ok) };
    }));
  });

  app.get("/changesets/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM changesets WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("change set");
    return c.json(view(row));
  });

  app.post("/changesets/preview", async (c) => {
    const { summary, changes } = await readBody(c);
    const { ok, previews } = await analyze(c, changes);
    const p = c.get("principal");
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO changesets (id, created_by, via, status, summary, changes, preview) VALUES (?, ?, ?, 'PREVIEWED', ?, ?, ?)`,
    ).bind(id, p.subject, p.via, summary, JSON.stringify(Array.isArray(changes) ? changes : []), JSON.stringify(previews)).run();
    return c.json({ id, status: "PREVIEWED", ok, problems: problemCount(previews), summary, changes: previews });
  });

  app.post("/changesets/:id/apply", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM changesets WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("change set");
    const stored = view(row);
    if (stored.status !== "PREVIEWED") {
      throw jsonError(409, `change set is already ${stored.status.toLowerCase()}`, { id: stored.id, status: stored.status });
    }
    // Re-check as the person applying, pinned to the versions that were previewed.
    const pinned = stored.changes.map((_, i) => stored.preview[i]?.version ?? null);
    const { ok, plan, previews } = await analyze(c, stored.changes, pinned);
    if (!ok) {
      throw jsonError(422, `change set has ${problemCount(previews)} problem(s) — nothing was applied`, { id: stored.id, changes: previews });
    }
    let created: Record<string, string>;
    try {
      ({ created } = await applyPlan(c, plan));
    } catch (err) {
      if (err instanceof ChangesetConflict) throw jsonError(409, err.message, { id: stored.id });
      throw err;
    }
    await c.env.DB.prepare(
      `UPDATE changesets SET status = 'APPLIED', preview = ?, applied_at = datetime('now'), applied_by = ? WHERE id = ?`,
    ).bind(JSON.stringify(previews), c.get("principal").subject, stored.id).run();
    return c.json({ id: stored.id, status: "APPLIED", created, changes: previews });
  });

  app.post("/changesets/apply", async (c) => {
    const { summary, changes } = await readBody(c);
    const { ok, plan, previews } = await analyze(c, changes);
    if (!ok) throw jsonError(422, `change set has ${problemCount(previews)} problem(s) — nothing was applied`, { changes: previews });
    let created: Record<string, string>;
    try {
      ({ created } = await applyPlan(c, plan));
    } catch (err) {
      if (err instanceof ChangesetConflict) throw jsonError(409, err.message, {});
      throw err;
    }
    const p = c.get("principal");
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO changesets (id, created_by, via, status, summary, changes, preview, applied_at, applied_by)
       VALUES (?, ?, ?, 'APPLIED', ?, ?, ?, datetime('now'), ?)`,
    ).bind(id, p.subject, p.via, summary, JSON.stringify(changes), JSON.stringify(previews), p.subject).run();
    return c.json({ id, status: "APPLIED", created, changes: previews });
  });
}
