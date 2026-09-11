/**
 * Model Context Protocol, server side — the JSON-RPC messages over the
 * Streamable HTTP transport, in its stateless form: every POST carries one
 * message and gets one JSON response (or 202 for a notification). No session,
 * no SSE stream; each request authenticates on its own.
 *
 * Pure: the HTTP layer passes in how to execute a tool call.
 */
import { AGENT_TOOLS, ToolArgError, toolByName, type AgentTool, type ToolCall } from "./tools.ts";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_TEXT = 100_000;

export interface McpDeps {
  execute: (call: ToolCall) => Promise<{ status: number; body: unknown }>;
  tools?: AgentTool[];
  serverVersion?: string;
}

type Json = Record<string, unknown>;
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });

const asText = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n… truncated (${s.length} characters)` : s;
};

/** Handle one JSON-RPC message. Returns null for notifications (HTTP 202). */
export async function handleMcpMessage(msg: unknown, deps: McpDeps): Promise<Json | null> {
  const tools = deps.tools ?? AGENT_TOOLS;
  if (Array.isArray(msg)) return rpcError(null, -32600, "batched requests are not supported");
  if (!msg || typeof msg !== "object" || (msg as Json)["jsonrpc"] !== "2.0" || typeof (msg as Json)["method"] !== "string") {
    return rpcError((msg as Json | null)?.["id"], -32600, "invalid JSON-RPC request");
  }
  const { id, method } = msg as { id?: unknown; method: string };
  const params = ((msg as Json)["params"] ?? {}) as Json;
  if (id === undefined) return null; // notification, e.g. notifications/initialized

  switch (method) {
    case "initialize": {
      const requested = String(params["protocolVersion"] ?? "");
      return rpcResult(id, {
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "charmquark", title: "CharmQuark", version: deps.serverVersion ?? "1" },
        instructions:
          "CharmQuark fleet data. Start with describe_schema. Read with list_records/get_record. " +
          "Change things with propose_changes, review the diff, then apply_changes. You act as the token's user and cannot exceed their role.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: !t.mutates, destructiveHint: t.mutates, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = String(params["name"] ?? "");
      const tool = tools.find((t) => t.name === name) ?? (tools === AGENT_TOOLS ? toolByName(name) : undefined);
      if (!tool) return rpcError(id, -32602, `unknown tool: ${name}`);
      const args = (params["arguments"] && typeof params["arguments"] === "object" ? params["arguments"] : {}) as Json;
      try {
        const planned = tool.plan(args);
        if ("local" in planned) return rpcResult(id, { content: [{ type: "text", text: asText(planned.local) }], isError: false });
        const { status, body } = await deps.execute(planned);
        const failed = status >= 400;
        return rpcResult(id, {
          content: [{ type: "text", text: failed ? `HTTP ${status}: ${asText(body)}` : asText(body) }],
          isError: failed,
        });
      } catch (err) {
        const message = err instanceof ToolArgError ? err.message : `tool failed: ${err instanceof Error ? err.message : String(err)}`;
        return rpcResult(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return rpcError(id, -32601, `method not found: ${method}`);
  }
}
