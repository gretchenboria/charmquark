/**
 * Workflows: the service catalogue a BPMN diagram binds its tasks to, the `cq:`
 * BPMN extension that records the binding, the JSON graph an agent or a template
 * describes a workflow with, and the builder that lays that graph out as BPMN 2.0.
 *
 * A task is bound with `cq:service="confirm_run"` on a bpmn:serviceTask (the
 * system does it) or a bpmn:userTask (a person does it). The API checks diagrams
 * against this catalogue (api/src/workflow.ts). Executing them is a later step.
 *
 * Dependency-free like the rest of contracts: the API, the seed generator and the
 * web designer all import it.
 */

export const CQ_BPMN_NAMESPACE = "https://charmquark.app/schema/bpmn/cq/1.0";

/** moddle descriptor: registers cq:service on service and user tasks (bpmn-js and bpmn-moddle). */
export const CQ_MODDLE = {
  name: "CharmQuark",
  prefix: "cq",
  uri: CQ_BPMN_NAMESPACE,
  xml: { tagAlias: "lowerCase" },
  associations: [],
  types: [
    {
      name: "ServiceBinding",
      extends: ["bpmn:ServiceTask", "bpmn:UserTask"],
      properties: [{ name: "service", isAttr: true, type: "String" }],
    },
  ],
};

export type WorkflowServiceKind = "system" | "human";

export interface WorkflowService {
  id: string;
  /** system → bpmn:serviceTask, human → bpmn:userTask. */
  kind: WorkflowServiceKind;
  label: string;
  description: string;
  /** The agent tool that performs it, when there is one (api/src/agent/tools.ts). */
  tool: string | null;
  /** The API call it corresponds to, or null for a purely human step. */
  api: string | null;
}

export const WORKFLOW_SERVICES: readonly WorkflowService[] = [
  { id: "propose_runs", kind: "system", label: "Draft a packed run", tool: "propose_runs", api: "POST /run-proposals",
    description: "Create a draft run filled with schedulable missions up to the effort budget." },
  { id: "check_readiness", kind: "system", label: "Check run readiness", tool: "get_run_readiness", api: "GET /runs/:id/readiness",
    description: "List every issue blocking a run from being confirmed." },
  { id: "confirm_run", kind: "system", label: "Confirm a run", tool: "confirm_run", api: "POST /runs/:id/confirm",
    description: "Book the lab slot and spend one run credit. PM or Fleet Lead." },
  { id: "assess_risk", kind: "system", label: "Assess mission risk", tool: "assess_risk", api: "POST /missions/:id/assess-risk",
    description: "Classify a mission's hazard level; POTENTIAL or HIGH routes it to legal review." },
  { id: "advance_run", kind: "system", label: "Advance the run pipeline", tool: null, api: "POST /runs/:id/advance",
    description: "Move a confirmed run to its next pipeline stage." },
  { id: "run_qa_autocheck", kind: "system", label: "Run QA autocheck", tool: null, api: "POST /runs/:id/qa",
    description: "Check the run's captured files against its rig's QA profile." },
  { id: "roboflow_export", kind: "system", label: "Export to Roboflow", tool: null, api: "POST /runs/:id/roboflow/export",
    description: "Upload the run's frames to the Roboflow project. PM or Fleet Lead." },
  { id: "complete_instructions", kind: "human", label: "Complete operator instructions", tool: null, api: "PUT /missions/:id/instructions",
    description: "Write the robot operator instructions and mark them complete." },
  { id: "legal_review", kind: "human", label: "Legal review", tool: null, api: "POST /missions/:id/legal-review",
    description: "A Fleet Lead records the legal verdict on a risky mission." },
  { id: "assign_run_members", kind: "human", label: "Assign run members", tool: null, api: "PATCH /runs/:id",
    description: "Choose or swap the run's robot, operator, lab and sensor rig." },
  { id: "human_approval", kind: "human", label: "Human approval", tool: null, api: null,
    description: "A person reviews and approves before the workflow continues." },
];

export const serviceById = (id: string): WorkflowService | undefined => WORKFLOW_SERVICES.find((s) => s.id === id);

/** What `POST /workflows/validate` returns. */
export interface BpmnProblem { code: string; message: string; element_id?: string }
export interface BpmnBinding { element_id: string; name: string | null; service: string }
export interface BpmnReport { ok: boolean; errors: BpmnProblem[]; warnings: BpmnProblem[]; bindings: BpmnBinding[] }

// ---------------------------------------------------------------- graph

export const WORKFLOW_NODE_TYPES = [
  "start", "end", "task", "service_task", "user_task", "exclusive_gateway", "parallel_gateway",
] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

const BPMN_TAG: Record<WorkflowNodeType, string> = {
  start: "startEvent", end: "endEvent", task: "task", service_task: "serviceTask", user_task: "userTask",
  exclusive_gateway: "exclusiveGateway", parallel_gateway: "parallelGateway",
};

/** The BPMN element types a CharmQuark diagram may contain; the designer offers only these. */
export const SUPPORTED_BPMN_TYPES: readonly string[] = [
  "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:Task", "bpmn:ServiceTask", "bpmn:UserTask",
  "bpmn:ExclusiveGateway", "bpmn:ParallelGateway", "bpmn:SequenceFlow",
];

export interface WorkflowNode { id: string; type: WorkflowNodeType; name?: string; service?: string }
export interface WorkflowFlow { from: string; to: string; name?: string }
export interface WorkflowGraph { name?: string; nodes: WorkflowNode[]; flows: WorkflowFlow[] }

export const WORKFLOW_LIMITS = { nodes: 60, flows: 120, name: 200 };

/** JSON Schema of a WorkflowGraph, for LLM function calling and MCP clients. */
export const WORKFLOW_GRAPH_SCHEMA: { type: "object"; properties: Record<string, unknown>; required: string[] } = {
  type: "object",
  properties: {
    name: { type: "string", description: "Workflow name." },
    nodes: {
      type: "array",
      description: "Steps. Exactly the node types listed; at least one start and one end.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique id: a letter, then letters, digits or underscores." },
          type: { type: "string", enum: [...WORKFLOW_NODE_TYPES] },
          name: { type: "string", description: "Short label shown on the diagram." },
          service: {
            type: "string",
            enum: WORKFLOW_SERVICES.map((s) => s.id),
            description: "The CharmQuark service this task performs: a system service on a service_task, a human one on a user_task.",
          },
        },
        required: ["id", "type"],
      },
    },
    flows: {
      type: "array",
      description: "Arrows between nodes. Label the branches that leave a gateway.",
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "Source node id." },
          to: { type: "string", description: "Target node id." },
          name: { type: "string", description: "Label, e.g. the answer on a gateway branch." },
        },
        required: ["from", "to"],
      },
    },
  },
  required: ["nodes", "flows"],
};

const ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
/** Ids the builder generates for the process, diagram, flows and shapes. */
const RESERVED_ID = /^(Definitions|Process|Diagram|Plane|Flow)_|_di$/;

const optString = (v: unknown, field: string, errors: string[]): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") { errors.push(`${field} must be a string`); return undefined; }
  const s = v.trim();
  if (s.length > WORKFLOW_LIMITS.name) errors.push(`${field} is longer than ${WORKFLOW_LIMITS.name} characters`);
  return s || undefined;
};

/**
 * Check a graph from an untrusted source (an LLM, an agent, a request body) and
 * return it normalised, or every problem at once.
 */
export function checkGraph(raw: unknown): { ok: true; graph: WorkflowGraph } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["graph must be an object with nodes and flows"] };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r["nodes"])) errors.push("nodes must be a list");
  if (!Array.isArray(r["flows"])) errors.push("flows must be a list");
  if (errors.length) return { ok: false, errors };
  const rawNodes = r["nodes"] as unknown[];
  const rawFlows = r["flows"] as unknown[];
  if (rawNodes.length > WORKFLOW_LIMITS.nodes) errors.push(`at most ${WORKFLOW_LIMITS.nodes} nodes`);
  if (rawFlows.length > WORKFLOW_LIMITS.flows) errors.push(`at most ${WORKFLOW_LIMITS.flows} flows`);
  if (errors.length) return { ok: false, errors };

  const name = optString(r["name"], "name", errors);
  const nodes: WorkflowNode[] = [];
  const ids = new Set<string>();
  rawNodes.forEach((n, i) => {
    const at = `nodes[${i}]`;
    if (!n || typeof n !== "object") { errors.push(`${at} must be an object`); return; }
    const o = n as Record<string, unknown>;
    const id = typeof o["id"] === "string" ? o["id"].trim() : "";
    if (!ID_RE.test(id)) { errors.push(`${at}.id must start with a letter and use only letters, digits and underscores`); return; }
    if (RESERVED_ID.test(id)) { errors.push(`${at}.id "${id}" is reserved`); return; }
    if (ids.has(id)) { errors.push(`node id "${id}" is used twice`); return; }
    ids.add(id);
    const type = o["type"] as WorkflowNodeType;
    if (!WORKFLOW_NODE_TYPES.includes(type)) { errors.push(`node ${id}: type must be one of ${WORKFLOW_NODE_TYPES.join(", ")}`); return; }
    const node: WorkflowNode = { id, type };
    const label = optString(o["name"], `node ${id} name`, errors);
    if (label) node.name = label;
    const service = optString(o["service"], `node ${id} service`, errors);
    if (service) {
      const svc = serviceById(service);
      if (!svc) errors.push(`node ${id}: unknown service "${service}"`);
      else if (type === "service_task" && svc.kind !== "system") errors.push(`node ${id}: ${service} is a human step, so use a user_task`);
      else if (type === "user_task" && svc.kind !== "human") errors.push(`node ${id}: ${service} is a system step, so use a service_task`);
      else if (type !== "service_task" && type !== "user_task") errors.push(`node ${id}: only service_task and user_task nodes take a service`);
      node.service = service;
    }
    nodes.push(node);
  });

  const flows: WorkflowFlow[] = [];
  const seen = new Set<string>();
  rawFlows.forEach((f, i) => {
    const at = `flows[${i}]`;
    if (!f || typeof f !== "object") { errors.push(`${at} must be an object`); return; }
    const o = f as Record<string, unknown>;
    const from = typeof o["from"] === "string" ? o["from"].trim() : "";
    const to = typeof o["to"] === "string" ? o["to"].trim() : "";
    if (!ids.has(from)) { errors.push(`${at}.from "${from}" is not a node`); return; }
    if (!ids.has(to)) { errors.push(`${at}.to "${to}" is not a node`); return; }
    if (from === to) { errors.push(`${at} connects ${from} to itself`); return; }
    if (seen.has(`${from}>${to}`)) { errors.push(`${at} repeats the flow ${from} → ${to}`); return; }
    seen.add(`${from}>${to}`);
    const flow: WorkflowFlow = { from, to };
    const label = optString(o["name"], `${at}.name`, errors);
    if (label) flow.name = label;
    flows.push(flow);
  });
  if (errors.length) return { ok: false, errors };

  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const starts = nodes.filter((n) => n.type === "start");
  if (!starts.length) errors.push("add a start node");
  if (!nodes.some((n) => n.type === "end")) errors.push("add an end node");
  for (const f of flows) {
    if (typeOf.get(f.to) === "start") errors.push(`start node ${f.to} cannot have incoming flows`);
    if (typeOf.get(f.from) === "end") errors.push(`end node ${f.from} cannot have outgoing flows`);
  }
  for (const n of nodes) {
    if (n.type !== "end" && !flows.some((f) => f.from === n.id)) errors.push(`node ${n.id} leads nowhere: connect it onward or to an end node`);
  }
  const reached = reachable(starts.map((s) => s.id), flows);
  for (const n of nodes) if (!reached.has(n.id)) errors.push(`node ${n.id} cannot be reached from a start node`);
  return errors.length ? { ok: false, errors } : { ok: true, graph: { ...(name ? { name } : {}), nodes, flows } };
}

export function reachable(from: string[], edges: { from: string; to: string }[]): Set<string> {
  const seen = new Set(from);
  const queue = [...from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) if (e.from === cur && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  }
  return seen;
}

// ---------------------------------------------------------------- layout + XML

const SIZE: Record<WorkflowNodeType, [number, number]> = {
  start: [36, 36], end: [36, 36], task: [100, 80], service_task: [100, 80], user_task: [100, 80],
  exclusive_gateway: [50, 50], parallel_gateway: [50, 50],
};
const COL = 170;
const ROW = 130;
const X0 = 120;
const Y0 = 120;

interface Placed { cx: number; cy: number; w: number; h: number; row: number }

/**
 * Layered left-to-right layout: flows that loop back are found by depth-first
 * search, every other flow pushes its target one column right of its source, and
 * each node takes the free row nearest its predecessors'. Deterministic, so the
 * same graph always draws the same diagram.
 */
function layout(graph: WorkflowGraph): { at: Map<string, Placed>; back: Set<number> } {
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const out = graph.nodes.map(() => [] as number[]);
  graph.flows.forEach((f, i) => out[index.get(f.from)!]!.push(i));

  const back = new Set<number>();
  const state = graph.nodes.map(() => 0); // 0 new, 1 on the stack, 2 done
  const visit = (v: number) => {
    state[v] = 1;
    for (const fi of out[v]!) {
      const t = index.get(graph.flows[fi]!.to)!;
      if (state[t] === 1) back.add(fi);
      else if (state[t] === 0) visit(t);
    }
    state[v] = 2;
  };
  graph.nodes.forEach((n, i) => { if (n.type === "start" && state[i] === 0) visit(i); });
  graph.nodes.forEach((_, i) => { if (state[i] === 0) visit(i); });

  const forward = graph.flows.map((f, i) => ({ ...f, i })).filter((f) => !back.has(f.i));
  const layer = graph.nodes.map(() => 0);
  const indegree = graph.nodes.map(() => 0);
  for (const f of forward) indegree[index.get(f.to)!]! += 1;
  const order: number[] = [];
  const ready = graph.nodes.map((_, i) => i).filter((i) => indegree[i] === 0);
  while (ready.length) {
    const v = ready.shift()!;
    order.push(v);
    for (const f of forward.filter((x) => index.get(x.from) === v)) {
      const t = index.get(f.to)!;
      layer[t] = Math.max(layer[t]!, layer[v]! + 1);
      if (--indegree[t]! === 0) ready.push(t);
    }
  }

  const row = graph.nodes.map(() => 0);
  const taken = new Map<number, Set<number>>();
  const byLayer = [...order].sort((a, b) => layer[a]! - layer[b]! || a - b);
  for (const v of byLayer) {
    const preds = forward.filter((f) => index.get(f.to) === v).map((f) => row[index.get(f.from)!]!);
    let r = preds.length ? Math.max(0, Math.round(preds.reduce((s, x) => s + x, 0) / preds.length)) : 0;
    const used = taken.get(layer[v]!) ?? new Set<number>();
    while (used.has(r)) r += 1;
    used.add(r);
    taken.set(layer[v]!, used);
    row[v] = r;
  }

  const at = new Map<string, Placed>();
  graph.nodes.forEach((n, i) => {
    const [w, h] = SIZE[n.type];
    at.set(n.id, { cx: X0 + layer[i]! * COL, cy: Y0 + row[i]! * ROW, w, h, row: row[i]! });
  });
  return { at, back };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Build laid-out BPMN 2.0 XML, with cq:service bindings, from a checked graph. */
export function graphToBpmn(graph: WorkflowGraph): string {
  const { at, back } = layout(graph);
  const flowId = (i: number) => `Flow_${i + 1}`;
  const lines: string[] = [];
  const nameAttr = (n?: string) => (n ? ` name="${esc(n)}"` : "");

  lines.push(
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ` +
      `xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ` +
      `xmlns:cq="${CQ_BPMN_NAMESPACE}" id="Definitions_1" targetNamespace="https://charmquark.app/workflows">`,
    `  <bpmn:process id="Process_1"${nameAttr(graph.name)} isExecutable="false">`,
  );
  for (const n of graph.nodes) {
    const tag = `bpmn:${BPMN_TAG[n.type]}`;
    const svc = n.service ? ` cq:service="${esc(n.service)}"` : "";
    lines.push(`    <${tag} id="${n.id}"${nameAttr(n.name)}${svc}>`);
    graph.flows.forEach((f, i) => { if (f.to === n.id) lines.push(`      <bpmn:incoming>${flowId(i)}</bpmn:incoming>`); });
    graph.flows.forEach((f, i) => { if (f.from === n.id) lines.push(`      <bpmn:outgoing>${flowId(i)}</bpmn:outgoing>`); });
    lines.push(`    </${tag}>`);
  }
  graph.flows.forEach((f, i) => {
    lines.push(`    <bpmn:sequenceFlow id="${flowId(i)}"${nameAttr(f.name)} sourceRef="${f.from}" targetRef="${f.to}" />`);
  });
  lines.push(`  </bpmn:process>`, `  <bpmndi:BPMNDiagram id="Diagram_1">`, `    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Process_1">`);

  for (const n of graph.nodes) {
    const p = at.get(n.id)!;
    const marker = n.type === "exclusive_gateway" ? ` isMarkerVisible="true"` : "";
    lines.push(
      `      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${marker}>`,
      `        <dc:Bounds x="${p.cx - p.w / 2}" y="${p.cy - p.h / 2}" width="${p.w}" height="${p.h}" />`,
      `      </bpmndi:BPMNShape>`,
    );
  }
  const maxRow = Math.max(0, ...[...at.values()].map((p) => p.row));
  let loop = 0;
  graph.flows.forEach((f, i) => {
    const s = at.get(f.from)!;
    const t = at.get(f.to)!;
    let pts: [number, number][];
    if (back.has(i)) {
      // Loop back underneath everything, one lane per loop.
      const lane = Y0 + maxRow * ROW + 70 + 20 * loop++;
      pts = [[s.cx, s.cy + s.h / 2], [s.cx, lane], [t.cx, lane], [t.cx, t.cy + t.h / 2]];
    } else if (s.row === t.row) {
      pts = [[s.cx + s.w / 2, s.cy], [t.cx - t.w / 2, t.cy]];
    } else if (t.row > s.row) {
      // Branch down: leave from the bottom, enter from the left.
      pts = [[s.cx, s.cy + s.h / 2], [s.cx, t.cy], [t.cx - t.w / 2, t.cy]];
    } else {
      // Merge up: leave from the right, enter from below.
      pts = [[s.cx + s.w / 2, s.cy], [t.cx, s.cy], [t.cx, t.cy + t.h / 2]];
    }
    lines.push(`      <bpmndi:BPMNEdge id="${flowId(i)}_di" bpmnElement="${flowId(i)}">`);
    for (const [x, y] of pts) lines.push(`        <di:waypoint x="${x}" y="${y}" />`);
    lines.push(`      </bpmndi:BPMNEdge>`);
  });
  lines.push(`    </bpmndi:BPMNPlane>`, `  </bpmndi:BPMNDiagram>`, `</bpmn:definitions>`, ``);
  return lines.join("\n");
}

// ---------------------------------------------------------------- templates

export interface WorkflowTemplate { id: string; name: string; description: string; graph: WorkflowGraph }

/**
 * The four guided workflows (web/src/app/workflows) as diagrams bound to the
 * catalogue. The seed loads them with these ids, and the designer offers them as
 * starting points.
 */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: "w1_task_ready", name: "Get a mission schedulable", description: "Instructions → risk/legal → READY",
    graph: {
      nodes: [
        { id: "picked", type: "start", name: "Mission picked" },
        { id: "instructions", type: "user_task", name: "Complete operator instructions", service: "complete_instructions" },
        { id: "risk", type: "service_task", name: "Assess risk", service: "assess_risk" },
        { id: "risk_level", type: "exclusive_gateway", name: "Risk?" },
        { id: "legal", type: "user_task", name: "Legal review", service: "legal_review" },
        { id: "approved", type: "exclusive_gateway", name: "Approved?" },
        { id: "ready", type: "end", name: "Mission READY" },
        { id: "rejected", type: "end", name: "Not approved" },
      ],
      flows: [
        { from: "picked", to: "instructions" },
        { from: "instructions", to: "risk" },
        { from: "risk", to: "risk_level" },
        { from: "risk_level", to: "ready", name: "Low" },
        { from: "risk_level", to: "legal", name: "Potential or high" },
        { from: "legal", to: "approved" },
        { from: "approved", to: "ready", name: "Yes" },
        { from: "approved", to: "rejected", name: "No" },
      ],
    },
  },
  {
    id: "w2_compose_confirm_session", name: "Compose & confirm a run", description: "Draft → build assembly → readiness → confirm",
    graph: {
      nodes: [
        { id: "start", type: "start", name: "Missions to schedule" },
        { id: "draft", type: "service_task", name: "Draft a packed run", service: "propose_runs" },
        { id: "assign", type: "user_task", name: "Assign robot, operator, lab and rig", service: "assign_run_members" },
        { id: "readiness", type: "service_task", name: "Check readiness", service: "check_readiness" },
        { id: "is_ready", type: "exclusive_gateway", name: "Ready?" },
        { id: "confirm", type: "service_task", name: "Confirm run", service: "confirm_run" },
        { id: "confirmed", type: "end", name: "Run confirmed" },
      ],
      flows: [
        { from: "start", to: "draft" },
        { from: "draft", to: "assign" },
        { from: "assign", to: "readiness" },
        { from: "readiness", to: "is_ready" },
        { from: "is_ready", to: "confirm", name: "Yes" },
        { from: "is_ready", to: "assign", name: "No" },
        { from: "confirm", to: "confirmed" },
      ],
    },
  },
  {
    id: "w3_data_pipeline", name: "Run the data pipeline", description: "Confirmed → capture → QA → export → done",
    graph: {
      nodes: [
        { id: "confirmed", type: "start", name: "Run confirmed" },
        { id: "capture", type: "service_task", name: "Advance to capture", service: "advance_run" },
        { id: "qa", type: "service_task", name: "QA autocheck", service: "run_qa_autocheck" },
        { id: "qa_result", type: "exclusive_gateway", name: "QA passed?" },
        { id: "manual_qa", type: "user_task", name: "Manual QA review", service: "human_approval" },
        { id: "export", type: "service_task", name: "Export to Roboflow", service: "roboflow_export" },
        { id: "finish", type: "service_task", name: "Mark done", service: "advance_run" },
        { id: "done", type: "end", name: "Done" },
      ],
      flows: [
        { from: "confirmed", to: "capture" },
        { from: "capture", to: "qa" },
        { from: "qa", to: "qa_result" },
        { from: "qa_result", to: "export", name: "Pass" },
        { from: "qa_result", to: "manual_qa", name: "Needs review" },
        { from: "manual_qa", to: "export" },
        { from: "export", to: "finish" },
        { from: "finish", to: "done" },
      ],
    },
  },
  {
    id: "w4_blocker_reassign", name: "Handle a blocker", description: "Blocked → swap offending member → re-confirm",
    graph: {
      nodes: [
        { id: "blocked", type: "start", name: "Run blocked" },
        { id: "issues", type: "service_task", name: "List readiness issues", service: "check_readiness" },
        { id: "swap", type: "user_task", name: "Swap offending member", service: "assign_run_members" },
        { id: "recheck", type: "service_task", name: "Re-check readiness", service: "check_readiness" },
        { id: "clear", type: "exclusive_gateway", name: "Clear?" },
        { id: "reconfirm", type: "service_task", name: "Re-confirm run", service: "confirm_run" },
        { id: "resolved", type: "end", name: "Blocker resolved" },
      ],
      flows: [
        { from: "blocked", to: "issues" },
        { from: "issues", to: "swap" },
        { from: "swap", to: "recheck" },
        { from: "recheck", to: "clear" },
        { from: "clear", to: "reconfirm", name: "Yes" },
        { from: "clear", to: "swap", name: "No" },
        { from: "reconfirm", to: "resolved" },
      ],
    },
  },
];
