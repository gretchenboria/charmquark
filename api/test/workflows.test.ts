/**
 * Workflows: the graph checker and BPMN builder (contracts), the server-side
 * diagram validator, and description → graph generation with a faked model.
 * Run with `npm --prefix api test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CQ_BPMN_NAMESPACE, WORKFLOW_SERVICES, WORKFLOW_TEMPLATES, checkGraph, graphToBpmn, type WorkflowGraph,
} from "../../packages/contracts/src/workflows.ts";
import { SAVE_BLOCKING, validateBpmn } from "../src/workflow.ts";
import { EMIT_WORKFLOW, GENERATE_ATTEMPTS, generateGraph } from "../src/agent/workflowGen.ts";
import type { LlmProvider } from "../src/agent/llm.ts";

const bpmn = (body: string) =>
  `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:cq="${CQ_BPMN_NAMESPACE}" id="D">` +
  `<bpmn:process id="P">${body}</bpmn:process></bpmn:definitions>`;

const codes = (xs: { code: string }[]) => xs.map((x) => x.code).sort();

const SIMPLE: WorkflowGraph = {
  name: "Confirm",
  nodes: [
    { id: "s", type: "start" },
    { id: "confirm", type: "service_task", name: "Confirm", service: "confirm_run" },
    { id: "e", type: "end" },
  ],
  flows: [{ from: "s", to: "confirm" }, { from: "confirm", to: "e" }],
};

// ---------------------------------------------------------------- catalogue
test("service ids are unique", () => {
  const ids = WORKFLOW_SERVICES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ---------------------------------------------------------------- graph checker
test("a good graph passes and is normalised", () => {
  const r = checkGraph({ ...SIMPLE, nodes: SIMPLE.nodes.map((n) => ({ ...n, name: n.name ? ` ${n.name} ` : undefined })) });
  assert.ok(r.ok);
  assert.equal(r.graph.nodes[1]!.name, "Confirm");
});

test("the graph checker names every problem", () => {
  const r = checkGraph({
    nodes: [
      { id: "s", type: "start" },
      { id: "s", type: "start" },
      { id: "1bad", type: "task" },
      { id: "Flow_1", type: "task" },
      { id: "risk", type: "user_task", service: "assess_risk" },
      { id: "nope", type: "service_task", service: "teleport" },
      { id: "gw", type: "diamond" },
    ],
    flows: [{ from: "s", to: "ghost" }],
  });
  assert.ok(!r.ok);
  const text = r.errors.join("\n");
  assert.match(text, /used twice/);
  assert.match(text, /must start with a letter/);
  assert.match(text, /reserved/);
  assert.match(text, /assess_risk is a system step/);
  assert.match(text, /unknown service "teleport"/);
  assert.match(text, /type must be one of/);
  assert.match(text, /"ghost" is not a node/);
});

test("the graph checker rejects structure an engine could not run", () => {
  const r = checkGraph({
    nodes: [{ id: "s", type: "start" }, { id: "a", type: "task" }, { id: "orphan", type: "task" }, { id: "e", type: "end" }],
    flows: [{ from: "s", to: "a" }, { from: "a", to: "e" }, { from: "e", to: "a" }, { from: "orphan", to: "e" }],
  });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /end node e cannot have outgoing/.test(e)));
  assert.ok(r.errors.some((e) => /orphan cannot be reached/.test(e)));
  assert.ok(!checkGraph({ nodes: [], flows: [] }).ok);
  assert.ok(!checkGraph("<xml/>").ok);
});

// ---------------------------------------------------------------- builder + validator
test("a built diagram validates cleanly and keeps its bindings", async () => {
  const xml = graphToBpmn(SIMPLE);
  const report = await validateBpmn(xml);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.deepEqual(report.bindings, [{ element_id: "confirm", name: "Confirm", service: "confirm_run" }]);
  assert.match(xml, /<bpmndi:BPMNEdge id="Flow_2_di"/);
});

test("names are escaped in the XML", async () => {
  const xml = graphToBpmn({ ...SIMPLE, name: `R&D "flow" <1>` });
  assert.match(xml, /name="R&amp;D &quot;flow&quot; &lt;1&gt;"/);
  assert.ok((await validateBpmn(xml)).ok);
});

test("every template is a valid graph that builds a clean, deterministic diagram", async () => {
  for (const t of WORKFLOW_TEMPLATES) {
    const checked = checkGraph(t.graph);
    assert.ok(checked.ok, `${t.id}: ${checked.ok ? "" : checked.errors.join("; ")}`);
    const xml = graphToBpmn({ ...t.graph, name: t.name });
    assert.equal(xml, graphToBpmn({ ...t.graph, name: t.name }));
    const report = await validateBpmn(xml);
    assert.deepEqual(report.errors, [], t.id);
    assert.deepEqual(report.warnings, [], t.id);
    assert.equal(report.bindings.length, t.graph.nodes.filter((n) => n.service).length, t.id);
  }
});

test("loops are drawn underneath the diagram", () => {
  const w2 = WORKFLOW_TEMPLATES.find((t) => t.id === "w2_compose_confirm_session")!;
  const xml = graphToBpmn(w2.graph);
  const loop = w2.graph.flows.findIndex((f) => f.from === "is_ready" && f.to === "assign");
  const edge = xml.split(`<bpmndi:BPMNEdge id="Flow_${loop + 1}_di"`)[1]!.split("</bpmndi:BPMNEdge>")[0]!;
  assert.equal((edge.match(/di:waypoint/g) ?? []).length, 4);
});

test("not BPMN and unknown services block a save", async () => {
  for (const xml of ["", "not xml", `<definitions id="smoke"/>`]) {
    const r = await validateBpmn(xml);
    assert.deepEqual(codes(r.errors), ["not_bpmn"], xml);
  }
  const r = await validateBpmn(bpmn(`<bpmn:startEvent id="s"/><bpmn:serviceTask id="t" cq:service="teleport"/>`));
  assert.ok(r.errors.some((e) => e.code === "unknown_service" && e.element_id === "t"));
  assert.ok(r.errors.every((e) => SAVE_BLOCKING.has(e.code) || e.code === "unreachable"));
});

test("structure problems are errors; unfinished work is a warning", async () => {
  const r = await validateBpmn(bpmn(
    `<bpmn:startEvent id="s"/>` +
    `<bpmn:serviceTask id="unbound" name="Do it"/>` +
    `<bpmn:userTask id="human" cq:service="confirm_run"/>` +
    `<bpmn:task id="stray" cq:service="confirm_run" cq:colour="red"/>` +
    `<bpmn:subProcess id="sub"/>` +
    `<bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="unbound"/>` +
    `<bpmn:sequenceFlow id="f2" sourceRef="unbound" targetRef="human"/>`,
  ));
  assert.deepEqual(codes(r.errors), ["misplaced_binding", "unreachable", "unreachable", "unsupported_element"]);
  assert.deepEqual(codes(r.warnings), ["dead_end", "dead_end", "dead_end", "no_end", "task_kind_mismatch", "unbound_task", "unknown_extension"]);
  assert.ok(!SAVE_BLOCKING.has("unreachable"));
});

test("a diagram with a different cq prefix still binds", async () => {
  const xml = graphToBpmn(SIMPLE).replaceAll("xmlns:cq=", "xmlns:charm=").replaceAll("cq:service=", "charm:service=");
  const r = await validateBpmn(xml);
  assert.ok(r.ok);
  assert.equal(r.bindings[0]!.service, "confirm_run");
});

test("the empty designer diagram is savable", async () => {
  const r = await validateBpmn(bpmn(`<bpmn:startEvent id="s"/>`));
  assert.deepEqual(r.errors, []);
});

// ---------------------------------------------------------------- generation
const scripted = (steps: { text: string; toolUses: { id: string; name: string; args: Record<string, unknown> }[] }[]) => {
  const seen: unknown[] = [];
  const provider: LlmProvider = {
    name: "anthropic",
    step: async (_system, transcript, tools) => {
      seen.push({ transcript: structuredClone(transcript), tools: tools.map((t) => t.name) });
      return steps.shift()!;
    },
  };
  return { provider, seen };
};

test("generation returns a checked graph", async () => {
  const { provider, seen } = scripted([{ text: "", toolUses: [{ id: "u1", name: "emit_workflow", args: SIMPLE as unknown as Record<string, unknown> }] }]);
  const out = await generateGraph(provider, "confirm a run");
  assert.ok(out.ok);
  assert.equal(out.graph.nodes.length, 3);
  assert.deepEqual((seen[0] as { tools: string[] }).tools, [EMIT_WORKFLOW.name]);
});

test("generation feeds problems back once, then gives up", async () => {
  const bad = { nodes: [{ id: "s", type: "start" }], flows: [] };
  const { provider, seen } = scripted([
    { text: "", toolUses: [{ id: "u1", name: "emit_workflow", args: bad }] },
    { text: "", toolUses: [{ id: "u2", name: "emit_workflow", args: SIMPLE as unknown as Record<string, unknown> }] },
  ]);
  const out = await generateGraph(provider, "confirm a run");
  assert.ok(out.ok);
  const retry = (seen[1] as { transcript: { kind: string; results?: { content: { problems: string[] } }[] }[] }).transcript;
  assert.equal(retry.at(-1)!.kind, "tool_results");
  assert.ok(retry.at(-1)!.results![0]!.content.problems.some((p) => /add an end node/.test(p)));

  const never = scripted(Array.from({ length: GENERATE_ATTEMPTS }, () => ({ text: "Here is some XML: <bpmn/>", toolUses: [] })));
  const failed = await generateGraph(never.provider, "anything");
  assert.ok(!failed.ok);
  assert.equal(never.seen.length, GENERATE_ATTEMPTS);
});
