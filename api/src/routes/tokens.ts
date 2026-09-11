/**
 * API tokens — create, list, revoke.
 *
 * How an agent authenticates: a person signed in to the app creates a token,
 * pastes it into Claude Code / Gemini CLI / a script, and the token then acts as
 * that person (never more), narrowed to `read` or `read`+`write`. The token is
 * shown exactly once; only its hash is stored.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { uuid, type Row } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { audit } from "../changes";
import { TOKEN_SCOPES, displayPrefix, generateToken, hashToken, type TokenScope } from "../tokens";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const DEFAULT_TTL_DAYS = 90;
const MAX_TTL_DAYS = 365;

export function mountTokens(app: App): void {
  /** Your tokens. A Fleet Lead may pass `?all=1` to see every token, to revoke a leaked one. */
  app.get("/tokens", async (c) => {
    const p = c.get("principal");
    const all = c.req.query("all") === "1" && p.role === "FLEET_LEAD";
    const { results } = all
      ? await c.env.DB.prepare(`SELECT * FROM personal_access_tokens ORDER BY created_at DESC`).all<Row>()
      : await c.env.DB.prepare(`SELECT * FROM personal_access_tokens WHERE user_subject = ? ORDER BY created_at DESC`)
          .bind(p.subject).all<Row>();
    return c.json(results.map(S.apiToken));
  });

  app.post("/tokens", async (c) => {
    const p = c.get("principal");
    // A token must not be able to mint more tokens — a leaked one would otherwise
    // be able to outlive its own revocation.
    if (p.via === "pat") throw forbidden("API tokens cannot create tokens; sign in to the app to create one");

    const b = await c.req.json<{ name?: string; scopes?: string[]; expires_in_days?: number }>()
      .catch(() => ({} as { name?: string; scopes?: string[]; expires_in_days?: number }));
    const name = (b.name ?? "").trim();
    if (!name) throw badRequest("name is required (e.g. \"Claude Code on my laptop\")");

    const scopes = (b.scopes ?? ["read"]) as string[];
    if (!scopes.length || !scopes.every((s) => (TOKEN_SCOPES as readonly string[]).includes(s))) {
      throw badRequest(`scopes must be a non-empty subset of ${TOKEN_SCOPES.join(", ")}`);
    }
    const normalized: TokenScope[] = scopes.includes("write") ? ["read", "write"] : ["read"];

    const days = b.expires_in_days ?? DEFAULT_TTL_DAYS;
    if (!Number.isInteger(days) || days < 1 || days > MAX_TTL_DAYS) {
      throw badRequest(`expires_in_days must be a whole number from 1 to ${MAX_TTL_DAYS}`);
    }

    const token = generateToken();
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO personal_access_tokens (id, user_subject, name, token_prefix, token_hash, scopes, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))`,
    ).bind(id, p.subject, name, displayPrefix(token), await hashToken(token), JSON.stringify(normalized), `+${days} days`).run();

    const row = (await c.env.DB.prepare(`SELECT * FROM personal_access_tokens WHERE id = ?`).bind(id).first<Row>())!;
    await audit(c, { resource: "tokens", entityId: id, action: "create", after: S.apiToken(row) });
    // The only time the token is ever returned.
    return c.json({ ...S.apiToken(row), token }, 201);
  });

  /** Revoke. Your own token, or any token if you are a Fleet Lead. */
  app.delete("/tokens/:id", async (c) => {
    const p = c.get("principal");
    const row = await c.env.DB.prepare(`SELECT * FROM personal_access_tokens WHERE id = ?`)
      .bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("token");
    if (row["user_subject"] !== p.subject && p.role !== "FLEET_LEAD") {
      throw forbidden("you can only revoke your own tokens (a Fleet Lead can revoke any)");
    }
    await c.env.DB.prepare(
      `UPDATE personal_access_tokens SET revoked_at = COALESCE(revoked_at, datetime('now')) WHERE id = ?`,
    ).bind(row["id"]).run();
    const after = (await c.env.DB.prepare(`SELECT * FROM personal_access_tokens WHERE id = ?`).bind(row["id"]).first<Row>())!;
    await audit(c, { resource: "tokens", entityId: String(row["id"]), action: "revoke", before: S.apiToken(row), after: S.apiToken(after) });
    return c.body(null, 204);
  });
}
