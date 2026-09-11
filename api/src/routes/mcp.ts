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
import { dispatchAs } from "../dispatch";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

export function mountMcp(app: App): void {
  app.post("/api/mcp", async (c) => {
    if (!(await loadSettings(c.env.DB))["agents.mcp_enabled"]) {
      return c.json({ detail: "The MCP server is turned off for this deployment (setting agents.mcp_enabled)." }, 404);
    }
    const message = await c.req.json().catch(() => undefined);

    const execute = (call: ToolCall) => dispatchAs(c, call);

    const reply = await handleMcpMessage(message, { execute, serverVersion: "1" });
    if (reply === null) return c.body(null, 202);
    return c.json(reply);
  });

  // Stateless server: no server-initiated stream.
  app.get("/api/mcp", (c) => c.json({ detail: "This MCP endpoint is stateless: POST JSON-RPC messages; there is no SSE stream." }, 405));
}
