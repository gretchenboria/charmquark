/**
 * Integration credentials (bring your own key).
 *
 * A key belongs to the deployment — one CharmQuark deployment serves one
 * customer — and is sealed at rest (secrets.ts). The API never returns a key,
 * only which providers have one.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { badRequest } from "../errors";
import { seal, unseal } from "../secrets";
import { HTTPException } from "hono/http-exception";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

export const PROVIDERS = ["roboflow"] as const;
export type Provider = (typeof PROVIDERS)[number];
const isProvider = (v: string): v is Provider => (PROVIDERS as readonly string[]).includes(v);

const sealingUnavailable = (): HTTPException =>
  new HTTPException(503, {
    message:
      "Credential storage is not configured: set the INTEGRATION_KEY_SECRET Worker secret " +
      "(`openssl rand -base64 32 | wrangler secret put INTEGRATION_KEY_SECRET`) and redeploy.",
  });

export async function hasIntegration(env: Env, provider: Provider): Promise<boolean> {
  return !!(await env.DB.prepare(`SELECT 1 FROM integration_secrets WHERE provider = ?`).bind(provider).first());
}

/** The stored key for a provider, or null when none is set. */
export async function integrationKey(env: Env, provider: Provider): Promise<string | null> {
  const row = await env.DB
    .prepare(`SELECT sealed FROM integration_secrets WHERE provider = ?`)
    .bind(provider).first<{ sealed: string }>();
  if (!row) return null;
  if (!env.INTEGRATION_KEY_SECRET) throw sealingUnavailable();
  try {
    return await unseal(env.INTEGRATION_KEY_SECRET, row.sealed);
  } catch {
    throw new HTTPException(503, {
      message: `The stored ${provider} key cannot be opened (INTEGRATION_KEY_SECRET changed?). Re-enter it on the Integrations page.`,
    });
  }
}

export function mountIntegrations(app: App): void {
  app.get("/integrations", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT provider FROM integration_secrets ORDER BY provider`)
      .all<{ provider: string }>();
    return c.json({
      configured: results.map((r) => r.provider),
      has_global_roboflow: Boolean(c.env.ROBOFLOW_API_KEY),
    });
  });

  app.post("/integrations", async (c) => {
    const b = await c.req.json<{ provider?: string; api_key?: string }>().catch(() => ({} as { provider?: string; api_key?: string }));
    const provider = (b.provider ?? "").trim().toLowerCase();
    const apiKey = (b.api_key ?? "").trim();
    if (!provider || !apiKey) throw badRequest("provider and api_key are required");
    if (!isProvider(provider)) throw badRequest(`unsupported provider (supported: ${PROVIDERS.join(", ")})`);
    if (!c.env.INTEGRATION_KEY_SECRET) throw sealingUnavailable();

    await c.env.DB.prepare(
      `INSERT INTO integration_secrets (provider, sealed, updated_by)
       VALUES (?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         sealed = excluded.sealed,
         updated_by = excluded.updated_by,
         updated_at = datetime('now')`,
    ).bind(provider, await seal(c.env.INTEGRATION_KEY_SECRET, apiKey), c.get("principal").subject).run();

    return c.json({ success: true, provider });
  });

  app.delete("/integrations/:provider", async (c) => {
    await c.env.DB.prepare(`DELETE FROM integration_secrets WHERE provider = ?`)
      .bind(c.req.param("provider").toLowerCase()).run();
    return c.json({ success: true });
  });
}
