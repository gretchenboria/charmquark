/** QA runs, the document vault, BPMN workflows, cloud status, and dev seeding. */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { jsonCol, num, parseJson, str, strOrNull, uuid, requireVault, type Row } from "../db";
import { badRequest, notFound } from "../errors";
import * as S from "../serialize";
import { authMode } from "../auth";
import {
  DEFAULT_ROBOTICS_PROFILE,
  autocheck,
  manifestFromObjects,
  parseManifest,
  parseProfile,
  rollUpGate,
  rollUpOverall,
  verdictFor,
  type RunManifest,
  type StoredObject,
} from "../qaAutocheck";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

/**
 * The fallback QA gate set: what a human ticks when there is nothing for the
 * machine to read. Field checks are what the operator can see on site; lab
 * checks are what the data pipeline verifies afterwards.
 *
 * This is the *degraded* path now, not the normal one. A run whose capture
 * landed in the vault gets `autocheck()` instead — see `POST /runs/:id/qa`.
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

/**
 * Where a run's capture lives in the vault. The autocheck reads
 * `runs/<run id>/<sensor>/<segment>/<filename>`, which is the layout the
 * manifest derivation in `qaAutocheck.ts` parses. One constant so the writer and
 * the reader cannot drift.
 */
const runPrefix = (runId: string): string => `runs/${runId}/`;

/**
 * Resolve the expectation profile for a run: the rig's, else the campaign's,
 * else the built-in robotics default.
 *
 * Rig first because the rig is what physically carries the sensors — two
 * campaigns sharing a rig should not have to agree on its file sizes, and a
 * campaign that swaps rigs mid-programme should not silently keep the old
 * expectations.
 */
async function resolveProfile(db: D1Database, run: Row) {
  const rigId = strOrNull(run, "sensor_rig_id");
  if (rigId) {
    const rig = await db.prepare(`SELECT qa_profile FROM sensor_rigs WHERE id = ?`).bind(rigId).first<Row>();
    const raw = rig ? parseJson<unknown>(rig["qa_profile"], null) : null;
    if (raw) return parseProfile(raw);
  }
  const campaign = await db.prepare(`SELECT qa_profile FROM campaigns WHERE id = ?`)
    .bind(str(run, "campaign_id")).first<Row>();
  const raw = campaign ? parseJson<unknown>(campaign["qa_profile"], null) : null;
  return raw ? parseProfile(raw) : DEFAULT_ROBOTICS_PROFILE;
}

/**
 * Derive a manifest by listing the run's vault prefix — the object-storage
 * equivalent of walking the session folder on disk.
 *
 * Returns null when the vault is unbound or the prefix is empty, which is the
 * signal to fall back to the manual checklist rather than to fail: a run whose
 * capture has not been uploaded yet is not a run that failed QA.
 */
async function deriveManifest(env: Env, runId: string): Promise<RunManifest | null> {
  if (!env.VAULT) return null;
  const prefix = runPrefix(runId);
  const objects: StoredObject[] = [];
  let cursor: string | undefined;

  // R2 pages at 1000 keys; a five-segment, six-sensor run is well inside one
  // page, but a re-take-heavy run is not, so follow the cursor.
  //
  // `include: ["customMetadata"]` is how a listing carries per-object metadata —
  // the duration the uploader stamped on each asset. The pinned
  // @cloudflare/workers-types does not yet declare the option, hence the cast;
  // the runtime has supported it since R2 shipped, and without it every object
  // comes back with `customMetadata` undefined and step 3 warns on every segment.
  do {
    const page = await env.VAULT.list({ prefix, cursor, include: ["customMetadata"] } as R2ListOptions);
    for (const o of page.objects) {
      objects.push({ key: o.key, size: o.size, customMetadata: o.customMetadata });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (objects.length === 0) return null;
  const manifest = manifestFromObjects(prefix, objects);
  return manifest.files.length > 0 ? manifest : null;
}

export function mountMisc(app: App): void {
  // ------------------------------------------------------------ QA
  app.get("/runs/:id/qa", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE run_id = ?`)
      .bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("QA run");
    return c.json(S.qaRun(row));
  });

  /**
   * Start (or re-run) QA for a run.
   *
   * Three inputs, in priority order:
   *   1. a manifest posted in the body — what the extraction tooling saw;
   *   2. the run's vault prefix, listed and turned into a manifest (`derive_from_r2`);
   *   3. nothing, in which case the manual checklist is created as before.
   *
   * Posting a manifest to a run that already has QA re-runs the machine over it
   * and *replaces* the gates — a second capture pass deserves a second verdict.
   * Without a manifest an existing row is returned untouched, so the old
   * create-once behaviour is preserved for the manual path and a human's
   * overrides are never silently discarded.
   */
  app.post("/runs/:id/qa", async (c) => {
    const runId = c.req.param("id");
    const run = await c.env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(runId).first<Row>();
    if (!run) throw notFound("run");

    type QaBody = { manifest?: unknown; derive_from_r2?: boolean };
    // An empty body is the ordinary "just start QA" case, not an error.
    const body: QaBody = await c.req.json<QaBody>().catch(() => ({}));
    const existing = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE run_id = ?`)
      .bind(runId).first<Row>();

    let manifest = parseManifest(body.manifest);
    if (!manifest && body.derive_from_r2) {
      manifest = await deriveManifest(c.env, runId);
      if (!manifest) {
        throw badRequest(
          `nothing to check: no objects under ${runPrefix(runId)} in the vault. ` +
          "Upload the run's capture first, or post a manifest in the request body.",
        );
      }
    }
    // Only reach for storage on a first run; re-running over an existing row is
    // an explicit act, not something a page refresh should trigger.
    if (!manifest && !existing) manifest = await deriveManifest(c.env, runId);

    if (!manifest) {
      if (existing) return c.json(S.qaRun(existing));
      const id = uuid();
      await c.env.DB.prepare(
        `INSERT INTO qa_pipeline_runs (id, run_id, level, overall_status, gates, mode)
         VALUES (?, ?, 'FIELD', 'IN_PROGRESS', ?, 'MANUAL')`,
      ).bind(id, runId, jsonCol(DEFAULT_GATES)).run();
      const row = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE id = ?`).bind(id).first<Row>();
      return c.json(S.qaRun(row!), 201);
    }

    const profile = await resolveProfile(c.env.DB, run);
    const result = autocheck(profile, manifest);
    const id = str(existing ?? {}, "id") || uuid();

    // One statement for both paths: the run_id unique index makes the upsert the
    // honest expression of "this run has exactly one QA record".
    await c.env.DB.prepare(
      `INSERT INTO qa_pipeline_runs (id, run_id, level, overall_status, gates, mode, verdict,
                                     manifest, profile_name, autochecked_at)
       VALUES (?, ?, 'FINAL', ?, ?, 'AUTOCHECK', ?, ?, ?, datetime('now'))
       ON CONFLICT(run_id) DO UPDATE SET
         level = 'FINAL', overall_status = excluded.overall_status, gates = excluded.gates,
         mode = 'AUTOCHECK', verdict = excluded.verdict, manifest = excluded.manifest,
         profile_name = excluded.profile_name, autochecked_at = excluded.autochecked_at,
         updated_at = datetime('now')`,
    ).bind(
      id, runId, result.overall_status, jsonCol(result.gates), result.verdict,
      jsonCol(manifest), result.profile_name,
    ).run();

    const row = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE run_id = ?`).bind(runId).first<Row>();
    return c.json(S.qaRun(row!), existing ? 200 : 201);
  });

  /**
   * Override one check item. The gate, the overall status and step 6's verdict
   * all roll up from the items afterwards.
   *
   * `machine_result` is deliberately left alone: the human writes `result`, the
   * machine's original stays on the record, and the difference between the two
   * is what the panel renders as "overridden". Adjudicating a red flag is the
   * expected way an autochecked run reaches PASS — a machine warning cannot be
   * cleared by anything else, which is the point.
   */
  app.patch("/runs/:id/qa/check", async (c) => {
    const runId = c.req.param("id");
    const b = await c.req.json<{ gate_index: number; check_index: number; result: string }>()
      .catch(() => { throw badRequest("body must be JSON: {gate_index, check_index, result}"); });
    const row = await c.env.DB.prepare(`SELECT * FROM qa_pipeline_runs WHERE run_id = ?`)
      .bind(runId).first<Row>();
    if (!row) throw notFound("QA run");

    type Gate = { status: string; check_items: { name: string; result: string; machine_result?: string }[] };
    const gates = parseJson<Gate[]>(row["gates"], []);
    const gate = gates[b.gate_index];
    if (!gate) throw badRequest(`gate_index ${b.gate_index} out of range`);
    const check = gate.check_items[b.check_index];
    if (!check) throw badRequest(`check_index ${b.check_index} out of range`);

    check.result = b.result;

    for (const g of gates) g.status = rollUpGate(g.check_items);
    const overall = rollUpOverall(gates);
    const verdict = str(row, "mode") === "AUTOCHECK" ? verdictFor(gates) : null;

    await c.env.DB.prepare(
      `UPDATE qa_pipeline_runs SET gates = ?, overall_status = ?, verdict = COALESCE(?, verdict),
                                   updated_at = datetime('now') WHERE id = ?`,
    ).bind(jsonCol(gates), overall, verdict, str(row, "id")).run();
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

  /**
   * Vault content.
   *
   * This Worker is routed at charmquark.app/api/*, i.e. the SAME ORIGIN as the
   * app. Anything served here executes in the app's origin with access to its
   * DOM and the viewer's Access session — so replaying a caller-supplied
   * Content-Type inline would turn the vault into a stored-XSS primitive: upload
   * text/html, send a Fleet Lead the link, run script as them.
   *
   * Three defences, all required:
   *   - `attachment`, so the browser downloads rather than renders;
   *   - a narrow render allowlist, everything else demoted to octet-stream;
   *   - `nosniff`, so a demoted type is not sniffed back into HTML.
   * The filename is quote-stripped: it lands inside a quoted header parameter
   * and a `"` would let the caller append their own directives.
   */
  const INLINE_SAFE = new Set([
    "application/pdf", "text/csv", "text/plain",
    "image/png", "image/jpeg", "image/gif", "image/webp",
  ]);

  app.get("/documents/:id/content", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ?`)
      .bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound("document");
    const obj = await requireVault(c.env).get(str(row, "file_path"));
    if (!obj) throw notFound("document content");

    const declared = str(row, "mime_type");
    const type = INLINE_SAFE.has(declared) ? declared : "application/octet-stream";
    const safeName = str(row, "filename").replace(/["\\\r\n]/g, "_") || "download";

    return new Response(obj.body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
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
        auth: authMode(c.env),
      });
    } catch (e) {
      return c.json({
        database: "sqlite",
        provider: "Cloudflare D1",
        reachable: false,
        detail: e instanceof Error ? e.message : "unreachable",
        auth: authMode(c.env),
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
