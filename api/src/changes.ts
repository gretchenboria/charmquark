/**
 * The write path mutations share: optimistic concurrency and the audit trail.
 *
 * A human in the UI and an agent over MCP can now edit the same record. Every
 * record carries a `version` that a database trigger bumps on any update
 * (migration 0007). A client that sends `If-Match: <version>` gets its write
 * applied only if nobody changed the record since it was read; otherwise a 409
 * carrying the current record, so it can reload and reapply instead of silently
 * overwriting. Clients that send no If-Match keep last-write-wins, so existing
 * screens keep working while they adopt it.
 */
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env, Vars } from "./types";
import { buildUpdate, num, uuid, type Row } from "./db";
import { badRequest, notFound } from "./errors";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/** The version the client expects, from `If-Match: 3`, `"3"` or `W/"3"`; null when absent. */
export function ifMatch(c: Ctx): number | null {
  const raw = c.req.header("If-Match")?.trim();
  if (!raw || raw === "*") return null;
  const v = Number(raw.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(v) || v < 1) throw badRequest(`If-Match must be a record version number (got ${raw})`);
  return v;
}

/** 409 with the record as it is now, so the client can reload without another round trip. */
export function versionConflict(label: string, expected: number, current: unknown): HTTPException {
  const body = {
    detail: `this ${label} was changed by someone else since you loaded it (you had version ${expected}) — reload and reapply your edit`,
    current,
  };
  return new HTTPException(409, {
    res: new Response(JSON.stringify(body), { status: 409, headers: { "Content-Type": "application/json" } }),
  });
}

export const getRow = (db: D1Database, table: string, id: string): Promise<Row | null> =>
  db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Row>();

export interface VersionedUpdate {
  table: string;
  label: string;
  id: string;
  body: Record<string, unknown>;
  columns: readonly string[];
  transform?: Record<string, (v: unknown) => unknown>;
  serialize: (r: Row) => unknown;
}

/**
 * Apply a PATCH honouring If-Match. Returns the row before and after, for the
 * audit event and the response. Sets `ETag` to the new version.
 */
export async function versionedUpdate(c: Ctx, u: VersionedUpdate): Promise<{ before: Row; after: Row }> {
  const expected = ifMatch(c);
  const before = await getRow(c.env.DB, u.table, u.id);
  if (!before) throw notFound(u.label);
  if (expected !== null && num(before, "version", 1) !== expected) {
    throw versionConflict(u.label, expected, u.serialize(before));
  }

  const upd = buildUpdate(u.table, u.id, u.body, u.columns, u.transform ?? {}, expected);
  if (upd) {
    const res = await c.env.DB.prepare(upd.sql).bind(...upd.params).run();
    if (!res.meta.changes) {
      // Lost a race between the check above and the write, or the row was deleted.
      const now = await getRow(c.env.DB, u.table, u.id);
      if (!now) throw notFound(u.label);
      throw versionConflict(u.label, expected ?? num(before, "version", 1), u.serialize(now));
    }
  }
  const after = (await getRow(c.env.DB, u.table, u.id))!;
  c.header("ETag", `"${num(after, "version", 1)}"`);
  return { before, after };
}

/** Delete honouring If-Match. Returns the deleted row for the audit event. */
export async function versionedDelete(
  c: Ctx,
  d: { table: string; label: string; id: string; serialize: (r: Row) => unknown },
): Promise<Row> {
  const expected = ifMatch(c);
  const before = await getRow(c.env.DB, d.table, d.id);
  if (!before) throw notFound(d.label);
  if (expected !== null && num(before, "version", 1) !== expected) {
    throw versionConflict(d.label, expected, d.serialize(before));
  }
  const res = expected === null
    ? await c.env.DB.prepare(`DELETE FROM ${d.table} WHERE id = ?`).bind(d.id).run()
    : await c.env.DB.prepare(`DELETE FROM ${d.table} WHERE id = ? AND version = ?`).bind(d.id, expected).run();
  if (!res.meta.changes) {
    const now = await getRow(c.env.DB, d.table, d.id);
    if (!now) throw notFound(d.label);
    throw versionConflict(d.label, expected ?? num(before, "version", 1), d.serialize(now));
  }
  return before;
}

export interface AuditEvent {
  /** Registry path, e.g. "labs". */
  resource: string;
  entityId: string | null;
  /** create | update | delete | a named action such as "confirm". */
  action: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Record who changed what. Written after the change; a failure is logged, not
 * thrown, because the change has already happened and reporting it as failed
 * would be the worse lie.
 */
export async function audit(c: Ctx, e: AuditEvent): Promise<void> {
  const p = c.get("principal");
  try {
    await c.env.DB.prepare(
      `INSERT INTO audit_events (id, actor_subject, actor_name, via, resource, entity_id, action, before_json, after_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      uuid(), p.subject, p.name, p.via, e.resource, e.entityId, e.action,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
    ).run();
  } catch (err) {
    console.error("audit write failed", e.resource, e.entityId, e.action, err);
  }
}
