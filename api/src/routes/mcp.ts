/**
 * POST /api/mcp — the MCP server for coding agents.
 *
 *   claude mcp add --transport http charmquark https://<host>/api/mcp \
 *     --header "Authorization: Bearer cq_pat_…"
 *
 * The endpoint is only a transport. Every tool call is re-dispatched through the
 * guarded /api router with the caller's own credentials, so policy, scopes,
 * validation, If-Match and audit apply per call exactly as for a person.
 */
import type { Hono } from "hono";
import type { Env, Vars } from "../types";
import { handleMcpMessage } from "../agent/mcp";
import type { ToolCall } from "../agent/tools";
import { loadSettings } from "../settings";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const FORWARDED = ["Authorization", "X-CharmQuark-Role", "X-CharmQuark-User"];

export function mountMcp(app: App): void {
  app.post("/api/mcp", async (c) => {
    if (!(await loadSettings(c.env.DB))["agents.mcp_enabled"]) {
      return c.json({ detail: "The MCP server is turned off for this deployment (setting agents.mcp_enabled)." }, 404);
    }
    const message = await c.req.json().catch(() => undefined);

    const execute = async (call: ToolCall) => {
      const headers = new Headers({ "Content-Type": "application/json" });
      for (const h of FORWARDED) {
        const v = c.req.header(h);
        if (v) headers.set(h, v);
      }
      for (const [k, v] of Object.entries(call.headers ?? {})) headers.set(k, v);
      const req = new Request(new URL(`/api${call.path}`, c.req.url), {
        method: call.method,
        headers,
        body: call.body === undefined ? undefined : JSON.stringify(call.body),
      });
      const res = await app.fetch(req, c.env, c.executionCtx);
      const text = await res.text();
      let body: unknown = text;
      try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
      return { status: res.status, body };
    };

    const reply = await handleMcpMessage(message, { execute, serverVersion: "1" });
    if (reply === null) return c.body(null, 202);
    return c.json(reply);
  });

  // Stateless server: no server-initiated stream.
  app.get("/api/mcp", (c) => c.json({ detail: "This MCP endpoint is stateless: POST JSON-RPC messages; there is no SSE stream." }, 405));
}
