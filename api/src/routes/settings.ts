/**
 * Deployment settings — the scheduling, risk and limit rules, editable without a
 * deploy. Read by everyone (they explain why the scheduler did what it did);
 * written by a Fleet Lead, because the hazard lexicon and the effort budget
 * decide what counts as safe and ready.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env, Vars } from "../types";
import { badRequest } from "../errors";
import { audit } from "../changes";
import { SETTING_DEFAULTS, SETTING_KEYS, SETTING_SPECS, isSettingKey, validateSettings, type Settings } from "../contracts";
import { loadSettings } from "../settings";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

async function describe(db: D1Database) {
  const values = await loadSettings(db);
  const { results } = await db.prepare(`SELECT key, updated_by, updated_at FROM settings`)
    .all<{ key: string; updated_by: string | null; updated_at: string }>();
  const stored = new Map(results.map((r) => [r.key, r]));
  return SETTING_KEYS.map((key) => ({
    key,
    group: SETTING_SPECS[key].group,
    label: SETTING_SPECS[key].label,
    description: SETTING_SPECS[key].description,
    value: values[key],
    default: SETTING_DEFAULTS[key],
    overridden: stored.has(key),
    updated_by: stored.get(key)?.updated_by ?? null,
    updated_at: stored.get(key)?.updated_at ?? null,
  }));
}

export function mountSettings(app: App): void {
  app.get("/settings", async (c) => c.json(await describe(c.env.DB)));

  /**
   * Set any number of settings at once: `{ "scheduling.run_effort_budget": 6 }`.
   * `null` resets a key to its default. The merged result is validated as a
   * whole, so a change that only makes sense alongside another (raising the
   * floor and the budget together) must be sent together.
   */
  app.patch("/settings", async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length === 0) {
      throw badRequest("send an object of setting keys to new values (null resets a key)");
    }
    const unknown = Object.keys(body).filter((k) => !isSettingKey(k));
    if (unknown.length) throw badRequest(`unknown settings: ${unknown.join(", ")} (see GET /api/settings)`);

    const before = await loadSettings(c.env.DB);
    const merged: Settings = structuredClone(before);
    for (const [key, value] of Object.entries(body)) {
      (merged as unknown as Record<string, unknown>)[key] = value === null ? SETTING_DEFAULTS[key as keyof Settings] : value;
    }
    const errors = validateSettings(merged);
    if (errors.length) {
      throw new HTTPException(400, { message: `invalid settings: ${errors.map((e) => `${e.field} ${e.message}`).join("; ")}` });
    }

    const subject = c.get("principal").subject;
    const stmts = Object.entries(body).map(([key, value]) =>
      value === null
        ? c.env.DB.prepare(`DELETE FROM settings WHERE key = ?`).bind(key)
        : c.env.DB.prepare(
            `INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = datetime('now')`,
          ).bind(key, JSON.stringify(value), subject),
    );
    await c.env.DB.batch(stmts);

    for (const key of Object.keys(body) as (keyof Settings)[]) {
      await audit(c, {
        resource: "settings", entityId: key, action: body[key] === null ? "reset" : "update",
        before: before[key], after: merged[key],
      });
    }
    return c.json(await describe(c.env.DB));
  });
}
