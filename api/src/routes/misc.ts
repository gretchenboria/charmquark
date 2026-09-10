/** QA runs, the document vault, BPMN workflows, cloud status, and dev seeding. */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { jsonCol, num, parseJson, str, uuid, requireVault, type Row } from "../db";
import { badRequest, notFound } from "../errors";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

/**
 * The default QA gate set for a run. Field checks are what the operator can see
 * on site; lab checks are what the data pipeline verifies afterwards.
 */
const DEFAULT_GATES = [
  {
    level: "FIELD",
    name: "Capture integrity",
    status: "NOT_STARTED",
    check_items: [
      { name: "All planned repetitions recorded", result: "PENDING" },
      { name: "No sensor dropped out mid-run", result: "PENDING" },
      { name: "Recording opened and closed cleanly", result: "PENDING" },
    ],
  },
  {
    level: "FIELD",
    name: "Scene and safety",
    status: "NOT_STARTED",
    check_items: [
      { name: "Lab bay matched the mission instructions", result: "PENDING" },
      { name: "No safety stop triggered", result: "PENDING" },
    ],
  },
  {
    level: "LAB",
    name: "Multisensor fusion",
    status: "NOT_STARTED",
    check_items: [
      { name: "Time sync held for the whole run", result: "PENDING" },
      { name: "Calibration still valid at run end", result: "PENDING" },
      { name: "Per-topic frame drop within tolerance", result: "PENDING" },
    ],
  },
] as const;

export function mountMisc(app: App): void {
  // ------------------------------------------------------------ QA
  app.get("/runs/:id/qa", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE run_id = ?`)
      .bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("QA run");
    return c.json(S.qaRun(row));
  });

  app.post("/runs/:id/qa", async (c) => {
    const runId = c.req.param("id");
    const existing = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE run_id = ?`)
      .bind(runId).first<Row>();
    if (existing) return c.json(S.qaRun(existing));

    const run = await c.env.DB.prepare(`SELECT id FROM runs WHERE id = ?`).bind(runId).first<Row>();
    if (!run) throw notFound("run");

    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO qa_pipeline_runs (id, run_id, level, overall_status, gates)
       VALUES (?, ?, 'FIELD', 'IN_PROGRESS', ?)`,
    ).bind(id, runId, jsonCol(DEFAULT_GATES)).run();
    const row = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.qaRun(row!), 201);
  });

  /** Tick one check item; the gate and overall status roll up from the items. */
  app.patch("/runs/:id/qa/check", async (c) => {
    const runId = c.req.param("id");
    const b = await c.req.json<{ gate_index: number; check_index: number; result: string }>();
    const row = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE run_id = ?`)
      .bind(runId).first<Row>();
    if (!row) throw notFound("QA run");

    type Gate = { level: string; name: string; status: string; check_items: { name: string; result: string }[] };
    const gates = parseJson<Gate[]>(row["gates"], []);
    const gate = gates[b.gate_index];
    if (!gate) throw badRequest(`gate_index ${b.gate_index} out of range`);
    const check = gate.check_items[b.check_index];
    if (!check) throw badRequest(`check_index ${b.check_index} out of range`);

    check.result = b.result;

    // Roll up: a gate fails if any item failed, passes once all items pass.
    for (const g of gates) {
      const items = g.check_items;
      if (items.some((i) => i.result === "FAIL")) g.status = "FAIL";
      else if (items.every((i) => i.result === "PASS")) g.status = "PASS";
      else if (items.some((i) => i.result !== "PENDING")) g.status = "IN_PROGRESS";
      else g.status = "NOT_STARTED";
    }
    const overall = gates.some((g) => g.status === "FAIL")
      ? "FAIL"
      : gates.every((g) => g.status === "PASS") ? "PASS" : "IN_PROGRESS";

    await c.env.DB.prepare(
      `UPDATE qa_pipeline_runs SET gates = ?, overall_status = ?, updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol(gates), overall, str(row, "id")).run();
    const updated = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE id = ?`)
      .bind(str(row, "id")).first<Row>();
    return c.json(S.qaRun(updated!));
  });

  // ------------------------------------------------------------ document vault
  app.get("/documents", async (c) => {
    const where: string[] = [];
    const params: unknown[] = [];
    for (const col of ["linked_entity_type", "linked_entity_id", "vault_category"]) {
      const v = c.req.query(col);
      if (v) { where.push(`${col} = ?`); params.push(v); }
    }
    const sql = `SELECT * FROM documents${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
    const { results } = await c.env.DB.prepare(sql).bind(...params).all<Row>();
    return c.json(results.map(S.doc));
  });

  /** Upload stores the bytes in R2 and the metadata row in D1. */
  app.post("/documents", async (c) => {
    const b = await c.req.json<{
      filename: string; content_b64: string; mime_type?: string;
      vault_category?: string; linked_entity_type?: string; linked_entity_id?: string;
    }>();
    if (!b.filename) throw badRequest("filename is required");

    const bytes = Uint8Array.from(atob(b.content_b64 ?? ""), (ch) => ch.charCodeAt(0));
    const id = uuid();
    const key = `vault/${id}/${b.filename}`;
    await requireVault(c.env).put(key, bytes, {
      httpMetadata: { contentType: b.mime_type ?? "application/octet-stream" },
    });

    await c.env.DB.prepare(
      `INSERT INTO documents (id, filename, mime_type, file_path, vault_category,
                              linked_entity_type, linked_entity_id, doc_metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, b.filename, b.mime_type ?? "application/octet-stream", key,
      b.vault_category ?? "OTHER", b.linked_entity_type ?? null, b.linked_entity_id ?? null,
      jsonCol([{ size_bytes: bytes.length, storage: "r2" }]),
    ).run();
    const row = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.doc(row!), 201);
  });

  app.get("/documents/:id/content", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ?`)
      .bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("document");
    const obj = await requireVault(c.env).get(str(row, "file_path"));
    if (!obj) throw notFound("document content");
    return new Response(obj.body, {
      headers: {
        "Content-Type": str(row, "mime_type"),
        "Content-Disposition": `inline; filename="${str(row, "filename")}"`,
      },
    });
  });

  app.delete("/documents/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ?`)
      .bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("document");
    await requireVault(c.env).delete(str(row, "file_path"));
    await c.env.DB.prepare(`DELETE FROM documents WHERE id = ?`).bind(str(row, "id")).run();
    return c.body(null, 204);
  });

  // ------------------------------------------------------------ workflows (BPMN)
  app.get("/workflows", async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT id, name FROM workflows ORDER BY name`).all<Row>();
    return c.json(results.map((r) => ({ id: str(r, "id"), name: str(r, "name") })));
  });

  app.get("/workflows/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM workflows WHERE id = ?`)
      .bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("workflow");
    return c.json(S.workflow(row));
  });

  app.post("/workflows", async (c) => {
    const b = await c.req.json<{ name: string }>();
    if (!b.name) throw badRequest("name is required");
    const id = uuid();
    await c.env.DB.prepare(`INSERT INTO workflows (id, name, xml) VALUES (?, ?, ?)`)
      .bind(id, b.name, EMPTY_BPMN).run();
    const row = await c.env.DB.prepare(`SELECT * FROM workflows WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.workflow(row!), 201);
  });

  app.put("/workflows/:id", async (c) => {
    const id = c.req.param("id");
    const b = await c.req.json<{ xml: string }>();
    const res = await c.env.DB
      .prepare(`UPDATE workflows SET xml = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(b.xml ?? "", id).run();
    if (!res.meta.changes) throw notFound("workflow");
    const row = await c.env.DB.prepare(`SELECT * FROM workflows WHERE id = ?`).bind(id).first<Row>();
    return c.json(S.workflow(row!));
  });

  // ------------------------------------------------------------ cloud status
  /** Backing-store health, surfaced as a connectivity chip in the sidebar. */
  app.get("/cloud/status", async (c) => {
    try {
      const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM campaigns`).first<Row>();
      return c.json({
        database: "sqlite",
        provider: "Cloudflare D1",
        reachable: true,
        detail: `D1 reachable — ${num(r ?? {}, "n")} program(s)`,
      });
    } catch (e) {
      return c.json({
        database: "sqlite",
        provider: "Cloudflare D1",
        reachable: false,
        detail: e instanceof Error ? e.message : "unreachable",
      });
    }
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
