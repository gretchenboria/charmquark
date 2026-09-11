/**
 * Send a request through the guarded /api router as the current caller, so policy,
 * token scopes, validation, If-Match and audit apply exactly as if the caller had
 * made it. Used by the MCP server, Charmy and config apply.
 */
import type { Context } from "hono";
import type { Env, Vars } from "./types";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

export interface InternalCall {
  method: string;
  /** Path under /api, e.g. "/labs/123". */
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

const FORWARDED = ["Authorization", "X-CharmQuark-Role", "X-CharmQuark-User"];

export async function dispatchAs(c: Ctx, call: InternalCall): Promise<{ status: number; body: unknown }> {
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const h of FORWARDED) {
    const v = c.req.header(h);
    if (v) headers.set(h, v);
  }
  for (const [k, v] of Object.entries(call.headers ?? {})) headers.set(k, v);
  const { default: app } = await import("./index");
  const res = await app.fetch(
    new Request(new URL(`/api${call.path}`, c.req.url), {
      method: call.method,
      headers,
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
    }),
    c.env,
    c.executionCtx,
  );
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, body };
}
