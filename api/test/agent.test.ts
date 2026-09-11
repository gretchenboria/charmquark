/**
 * The agent layer: tool registry rules, the MCP protocol, and the assistant loop
 * with both provider adapters (model responses faked). Run with `npm --prefix api test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AGENT_TOOLS, ToolArgError, toolByName } from "../src/agent/tools.ts";
import { SUPPORTED_PROTOCOL_VERSIONS, handleMcpMessage } from "../src/agent/mcp.ts";
import { anthropicProvider, geminiProvider, runChat, type LlmProvider } from "../src/agent/llm.ts";
import { WORKFLOW_SERVICES } from "../../packages/contracts/src/workflows.ts";

// ---------------------------------------------------------------- registry
test("tool names are unique and every tool has a schema", () => {
  const names = AGENT_TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of AGENT_TOOLS) assert.equal(t.inputSchema.type, "object", t.name);
});

test("parity: every tool that changes data has a manual UI path", () => {
  for (const t of AGENT_TOOLS.filter((x) => x.mutates)) assert.ok(t.uiPath.startsWith("/"), `${t.name} has no uiPath`);
});

test("the in-app assistant only gets tools that do not change data", () => {
  for (const t of AGENT_TOOLS.filter((x) => x.inApp)) assert.equal(t.mutates, false, t.name);
  assert.ok(toolByName("propose_changes")!.inApp);
  assert.ok(!toolByName("apply_changes")!.inApp);
  assert.ok(!toolByName("confirm_run")!.inApp);
});

test("tools build API calls and reject bad input", () => {
  assert.deepEqual(toolByName("get_record")!.plan({ resource: "labs", id: "a/b" }), { method: "GET", path: "/labs/a%2Fb" });
  assert.throws(() => toolByName("get_record")!.plan({ resource: "users; drop", id: "x" }), ToolArgError);
  assert.throws(() => toolByName("apply_changes")!.plan({}), ToolArgError);
  assert.deepEqual(toolByName("save_workflow")!.plan({ id: "w1", xml: "<x/>", if_match: 3 }), {
    method: "PATCH", path: "/workflows/w1", body: { xml: "<x/>" }, headers: { "If-Match": "3" },
  });
  const schema = toolByName("describe_schema")!.plan({ resource: "labs" }) as { local: { resources: Record<string, unknown> } };
  assert.deepEqual(Object.keys(schema.local.resources), ["labs"]);
});

test("workflow tools: validate by id or xml, generate from graph or description", () => {
  assert.deepEqual(toolByName("validate_bpmn")!.plan({ id: "w1" }), { method: "GET", path: "/workflows/w1/validate" });
  assert.deepEqual(toolByName("validate_bpmn")!.plan({ xml: "<x/>" }), { method: "POST", path: "/workflows/validate", body: { xml: "<x/>" } });
  assert.throws(() => toolByName("validate_bpmn")!.plan({}), ToolArgError);
  const graph = { nodes: [], flows: [] };
  assert.deepEqual(toolByName("generate_workflow")!.plan({ graph, workflow_id: "w1", if_match: 2 }), {
    method: "POST", path: "/workflows/generate", body: { graph, workflow_id: "w1" }, headers: { "If-Match": "2" },
  });
  assert.throws(() => toolByName("generate_workflow")!.plan({}), ToolArgError);
  assert.throws(() => toolByName("generate_workflow")!.plan({ graph, description: "both" }), ToolArgError);
});

test("every workflow service that names a tool names a real one", () => {
  for (const s of WORKFLOW_SERVICES) if (s.tool) assert.ok(toolByName(s.tool), `${s.id} → ${s.tool}`);
});

// ---------------------------------------------------------------- MCP
const noExec = async () => { throw new Error("should not execute"); };

test("MCP initialize negotiates the protocol version", async () => {
  const r = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, { execute: noExec });
  assert.equal((r!["result"] as { protocolVersion: string }).protocolVersion, "2025-03-26");
  const r2 = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, { execute: noExec });
  assert.equal((r2!["result"] as { protocolVersion: string }).protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
});

test("MCP notifications get no response; unknown methods and batches are errors", async () => {
  assert.equal(await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, { execute: noExec }), null);
  const r = await handleMcpMessage({ jsonrpc: "2.0", id: 3, method: "resources/list" }, { execute: noExec });
  assert.equal((r!["error"] as { code: number }).code, -32601);
  const b = await handleMcpMessage([{ jsonrpc: "2.0", id: 1, method: "ping" }], { execute: noExec });
  assert.equal((b!["error"] as { code: number }).code, -32600);
});

test("MCP tools/list exposes read-only hints", async () => {
  const r = await handleMcpMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" }, { execute: noExec });
  const tools = (r!["result"] as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
  assert.equal(tools.length, AGENT_TOOLS.length);
  assert.equal(tools.find((t) => t.name === "apply_changes")!.annotations.readOnlyHint, false);
  assert.equal(tools.find((t) => t.name === "get_record")!.annotations.readOnlyHint, true);
});

test("MCP tools/call executes the planned call and reports API errors as tool errors", async () => {
  const calls: unknown[] = [];
  const ok = await handleMcpMessage(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_record", arguments: { resource: "labs", id: "L1" } } },
    { execute: async (call) => { calls.push(call); return { status: 200, body: { id: "L1", name: "Bay" } }; } },
  );
  assert.deepEqual(calls, [{ method: "GET", path: "/labs/L1" }]);
  assert.equal((ok!["result"] as { isError: boolean }).isError, false);

  const denied = await handleMcpMessage(
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "confirm_run", arguments: { run_id: "R1" } } },
    { execute: async () => ({ status: 403, body: { detail: "role ROBOT_OPERATOR may not confirm a run" } }) },
  );
  const res = denied!["result"] as { isError: boolean; content: { text: string }[] };
  assert.equal(res.isError, true);
  assert.match(res.content[0]!.text, /HTTP 403/);

  const bad = await handleMcpMessage({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_record", arguments: {} } }, { execute: noExec });
  assert.equal((bad!["result"] as { isError: boolean }).isError, true);
});

// ---------------------------------------------------------------- assistant loop
test("the assistant proposes a change set and never applies it", async () => {
  const steps = [
    { text: "", toolUses: [{ id: "c1", name: "propose_changes", args: { changes: [{ resource: "labs", op: "update", id: "L1", data: { capacity: 3 } }] } }] },
    { text: "", toolUses: [{ id: "c2", name: "apply_changes", args: { changeset_id: "cs1" } }] },
    { text: "Review the proposed change and press Apply.", toolUses: [] },
  ];
  const provider: LlmProvider = { name: "gemini", step: async () => steps.shift()! };
  const executed: string[] = [];
  const out = await runChat({
    provider, system: "s", transcript: [{ kind: "user", text: "set capacity 3" }], tools: AGENT_TOOLS,
    execute: async (call) => { executed.push(`${call.method} ${call.path}`); return { status: 200, body: { id: "cs1", ok: true } }; },
  });
  assert.deepEqual(executed, ["POST /changesets/preview"]);
  assert.deepEqual(out.changeset, { id: "cs1", ok: true });
  assert.deepEqual(out.tool_calls, [{ name: "propose_changes", ok: true }, { name: "apply_changes", ok: false }]);
  assert.match(out.text, /press Apply/);
});

test("the assistant loop is bounded", async () => {
  const provider: LlmProvider = { name: "anthropic", step: async () => ({ text: "", toolUses: [{ id: "x", name: "get_settings", args: {} }] }) };
  const out = await runChat({ provider, system: "s", transcript: [{ kind: "user", text: "loop" }], tools: AGENT_TOOLS, execute: async () => ({ status: 200, body: {} }) });
  assert.match(out.text, /stopped/);
  assert.equal(out.tool_calls.length, 6);
});

const fakeFetch = (reply: unknown, seen: { url?: string; body?: Record<string, unknown>; headers?: Record<string, string> }) =>
  async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.body = JSON.parse(String(init.body));
    seen.headers = init.headers as Record<string, string>;
    return new Response(JSON.stringify(reply), { status: 200 });
  };

test("Gemini adapter: key in header, function declarations, function calls parsed", async () => {
  const seen: { url?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {};
  const p = geminiProvider("g-key", "gemini-test", fakeFetch({
    candidates: [{ content: { parts: [{ text: "Checking." }, { functionCall: { name: "get_settings", args: {} } }] } }],
  }, seen));
  const out = await p.step("sys", [{ kind: "user", text: "hi" }], AGENT_TOOLS.filter((t) => t.inApp));
  assert.ok(!seen.url!.includes("g-key"));
  assert.equal(seen.headers!["x-goog-api-key"], "g-key");
  const decls = (seen.body!["tools"] as { functionDeclarations: { parameters: Record<string, unknown> }[] }[])[0]!.functionDeclarations;
  assert.ok(decls.every((d) => !("additionalProperties" in d.parameters)));
  assert.deepEqual(out, { text: "Checking.", toolUses: [{ id: "call_0", name: "get_settings", args: {} }] });
});

test("Anthropic adapter: tool_use blocks round-trip as tool_result", async () => {
  const seen: { url?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {};
  const p = anthropicProvider("a-key", "claude-test", fakeFetch({
    content: [{ type: "tool_use", id: "tu_1", name: "get_record", input: { resource: "labs", id: "L1" } }],
  }, seen));
  const out = await p.step("sys", [
    { kind: "user", text: "lab?" },
    { kind: "assistant", text: "", toolUses: [{ id: "tu_0", name: "get_settings", args: {} }] },
    { kind: "tool_results", results: [{ id: "tu_0", name: "get_settings", content: { ok: 1 } }] },
  ], AGENT_TOOLS.filter((t) => t.inApp));
  assert.equal(seen.headers!["x-api-key"], "a-key");
  const msgs = seen.body!["messages"] as { role: string; content: unknown }[];
  assert.equal((msgs[2]!.content as { type: string; tool_use_id: string }[])[0]!.tool_use_id, "tu_0");
  assert.deepEqual(out.toolUses, [{ id: "tu_1", name: "get_record", args: { resource: "labs", id: "L1" } }]);
});
