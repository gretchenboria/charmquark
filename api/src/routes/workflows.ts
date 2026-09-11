/**
 * BPMN workflows: CRUD with version history, validation against the service
 * catalogue (packages/contracts/src/workflows.ts), and generation from a graph or
 * a description. Designer, MCP agents and Charmy all come through here.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, Vars } from "../types";
import { num, str, strOrNull, uuid, type Row } from "../db";
import { badRequest, notFound } from "../errors";
import * as S from "../serialize";
import { audit, versionedDelete, versionedUpdate } from "../changes";
import {
  CQ_MODDLE, RESOURCES, WORKFLOW_GRAPH_SCHEMA, WORKFLOW_NODE_TYPES, WORKFLOW_SERVICES, WORKFLOW_TEMPLATES,
  assertValid, checkGraph, graphToBpmn, writableFields, type WorkflowGraph,
} from "../contracts";
import { SAVE_BLOCKING, validateBpmn } from "../workflow";
import { generateGraph } from "../agent/workflowGen";
import { providerFor } from "../llmProvider";
import { loadSettings } from "../settings";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;
type App = Hono<{ Bindings: Env; Variables: Vars }>;

const MAX_DESCRIPTION = 4000;

/** Audit snapshots of a workflow carry its size, not the whole diagram. */
const workflowSummary = (r: Row) => ({
  id: str(r, "id"), name: str(r, "name"), version: num(r, "version", 1), xml_chars: str(r, "xml").length,
});

/** Refuse XML that is not BPMN or binds an unknown service. Half-drawn diagrams still save. */
async function assertSavable(xml: unknown): Promise<void> {
  const report = await validateBpmn(xml);
  const blocking = report.errors.filter((e) => SAVE_BLOCKING.has(e.code));
  if (blocking.length) throw badRequest(`invalid workflow: ${blocking.map((e) => e.message).join("; ")}`);
}

async function insertWorkflow(c: Ctx, name: string, xml: string): Promise<Row> {
  const id = uuid();
  await c.env.DB.prepare(`INSERT INTO workflows (id, name, xml) VALUES (?, ?, ?)`).bind(id, name, xml).run();
  const row = await c.env.DB.prepare(`SELECT * FROM workflows WHERE id = ?`).bind(id).first<Row>();
  await audit(c, { resource: "workflows", entityId: id, action: "create", after: workflowSummary(row!) });
  return row!;
}

/**
 * Save a workflow's name and/or diagram, honouring If-Match. The diagram it
 * replaces is kept in workflow_versions, so an edit by hand or by an agent can
 * always be compared and rolled back.
 */
async function saveWorkflow(c: Ctx, id: string, body: Record<string, unknown>): Promise<Row> {
  assertValid(RESOURCES.workflows, body, "update");
  if (body["xml"] !== undefined) await assertSavable(body["xml"]);
  const { before, after } = await versionedUpdate(c, {
    table: "workflows", label: "workflow", id, body,
    columns: writableFields(RESOURCES.workflows.fields, "update"), serialize: S.workflow,
  });
  if (num(before, "version", 1) !== num(after, "version", 1)) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO workflow_versions (id, workflow_id, version, name, xml, saved_by) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), id, num(before, "version", 1), str(before, "name"), str(before, "xml"), c.get("principal").subject).run();
  }
  await audit(c, { resource: "workflows", entityId: id, action: "update", before: workflowSummary(before), after: workflowSummary(after) });
  return after;
}

export function mountWorkflows(app: App): void {
  // Static paths first: Hono tries handlers in registration order.
  /** What a diagram can bind to, and the graph shape generation accepts. */
  app.get("/workflows/services", (c) => c.json({
    services: WORKFLOW_SERVICES,
    node_types: WORKFLOW_NODE_TYPES,
    graph_schema: WORKFLOW_GRAPH_SCHEMA,
    moddle: CQ_MODDLE,
    templates: WORKFLOW_TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
  }));

  /** Check a draft diagram without saving it. */
  app.post("/workflows/validate", async (c) => {
    const b = await c.req.json<{ xml?: unknown }>().catch(() => ({} as { xml?: unknown }));
    return c.json(await validateBpmn(b.xml));
  });

  /**
   * Build a laid-out diagram from a graph, or have the deployment's model design
   * the graph from a description. Without workflow_id it creates a workflow; with
   * one it saves a new version (If-Match honoured).
   */
  app.post("/workflows/generate", async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const description = typeof b["description"] === "string" ? b["description"].trim() : "";
    if ((b["graph"] !== undefined) === Boolean(description)) {
      throw badRequest("send either graph (nodes and flows) or description (what the workflow should do)");
    }
    if (description.length > MAX_DESCRIPTION) throw badRequest(`description is longer than ${MAX_DESCRIPTION} characters`);
    if (b["name"] !== undefined && typeof b["name"] !== "string") throw badRequest("name must be a string");
    if (b["workflow_id"] !== undefined && typeof b["workflow_id"] !== "string") throw badRequest("workflow_id must be a string");

    let graph: WorkflowGraph;
    if (description) {
      if (!(await loadSettings(c.env.DB))["agents.charmy_enabled"]) {
        return c.json({ detail: "AI generation is turned off for this deployment (setting agents.charmy_enabled). Send a graph instead." }, 404);
      }
      const provider = await providerFor(c.env);
      if (typeof provider === "string") return c.json({ detail: provider }, 503);
      let out: Awaited<ReturnType<typeof generateGraph>>;
      try {
        out = await generateGraph(provider, description);
      } catch (err) {
        console.error("workflow generation failed", err);
        return c.json({ detail: "The model provider could not be reached. Try again shortly." }, 502);
      }
      if (!out.ok) return c.json({ detail: `the generated workflow was not valid: ${out.errors.join("; ")}`, problems: out.errors }, 422);
      graph = out.graph;
    } else {
      const checked = checkGraph(b["graph"]);
      if (!checked.ok) throw badRequest(`invalid workflow graph: ${checked.errors.join("; ")}`);
      graph = checked.graph;
    }

    const explicitName = typeof b["name"] === "string" ? b["name"].trim() : "";
    const name = explicitName || graph.name || "Generated workflow";
    const xml = graphToBpmn({ ...graph, name });
    const report = await validateBpmn(xml);
    const workflowId = typeof b["workflow_id"] === "string" ? b["workflow_id"] : "";
    if (workflowId) {
      const after = await saveWorkflow(c, workflowId, explicitName ? { name, xml } : { xml });
      return c.json({ workflow: S.workflow(after), report, graph });
    }
    assertValid(RESOURCES.workflows, { name, xml }, "create");
    return c.json({ workflow: S.workflow(await insertWorkflow(c, name, xml)), report, graph }, 201);
  });

  app.get("/workflows", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT id, name FROM workflows ORDER BY name`).all<Row>();
    return c.json(results.map((r) => ({ id: str(r, "id"), name: str(r, "name") })));
  });

  app.get("/workflows/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM workflows WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("workflow");
    return c.json(S.workflow(row));
  });

  app.get("/workflows/:id/validate", async (c) => {
    const row = await c.env.DB.prepare(`SELECT xml FROM workflows WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("workflow");
    return c.json(await validateBpmn(str(row, "xml")));
  });

  app.post("/workflows", async (c) => {
    const b = await c.req.json<{ name: string; xml?: string }>();
    assertValid(RESOURCES.workflows, b, "create");
    if (b.xml) await assertSavable(b.xml);
    const row = await insertWorkflow(c, b.name, b.xml || EMPTY_BPMN);
    return c.json(S.workflow(row), 201);
  });

  /** The designer's save: the whole diagram. */
  app.put("/workflows/:id", async (c) => {
    const b = await c.req.json<{ xml?: string }>();
    return c.json(S.workflow(await saveWorkflow(c, c.req.param("id"), { xml: b.xml ?? "" })));
  });

  /** Rename and/or replace the diagram. */
  app.patch("/workflows/:id", async (c) => {
    return c.json(S.workflow(await saveWorkflow(c, c.req.param("id"), await c.req.json<Record<string, unknown>>())));
  });

  app.delete("/workflows/:id", async (c) => {
    const id = c.req.param("id");
    const before = await versionedDelete(c, { table: "workflows", label: "workflow", id, serialize: S.workflow });
    await audit(c, { resource: "workflows", entityId: id, action: "delete", before: workflowSummary(before) });
    return c.body(null, 204);
  });

  /** Earlier diagrams, newest first (without the XML; fetch one version for that). */
  app.get("/workflows/:id/versions", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT id, version, name, saved_by, created_at, length(xml) AS xml_chars
       FROM workflow_versions WHERE workflow_id = ? ORDER BY version DESC`,
    ).bind(c.req.param("id")).all<Row>();
    return c.json(results.map((r) => ({
      id: str(r, "id"), version: num(r, "version"), name: str(r, "name"),
      saved_by: strOrNull(r, "saved_by"), created_at: str(r, "created_at"), xml_chars: num(r, "xml_chars"),
    })));
  });

  app.get("/workflows/:id/versions/:version", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM workflow_versions WHERE workflow_id = ? AND version = ?`)
      .bind(c.req.param("id"), Number(c.req.param("version"))).first<Row>();
    if (!row) throw notFound("workflow version");
    return c.json({
      workflow_id: str(row, "workflow_id"), version: num(row, "version"), name: str(row, "name"),
      xml: str(row, "xml"), saved_by: strOrNull(row, "saved_by"), created_at: str(row, "created_at"),
    });
  });
}

const EMPTY_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="100" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
