/**
 * Roboflow annotation handoff.
 *
 * The DataOps seam: once a run passes QA, its imagery should be able to leave
 * CharmQuark for annotation and come back as a versioned dataset. This is the
 * outbound half — deliberately thin, and deliberately honest about where it
 * stops.
 *
 * What is implemented, against endpoints verified in Roboflow's current docs
 * (cited in docs/ROBOFLOW.md):
 *   - key check      GET  https://api.roboflow.com/
 *   - project info   GET  https://api.roboflow.com/:workspace/:project
 *   - image upload   POST https://api.roboflow.com/dataset/:project/upload
 *
 * What is NOT implemented, because Roboflow documents no REST endpoint for it:
 *   - generating a dataset version. `roboflow_exports.dataset_version` exists so
 *     the linkage can be recorded once a version is cut in the Roboflow UI or
 *     via their Python SDK; nothing here invents an endpoint to create one.
 *
 * The guard mirrors billing exactly: no key -> 503 naming the missing secret,
 * and `annotation_configured` on the status endpoint so the UI can grey the
 * action out instead of offering something that will fail.
 */
import { Hono } from "hono";
import type { Env, Vars } from "../types";
import { jsonCol, str, strOrNull, uuid, requireVault, type Row } from "../db";
import { annotationUnavailable, badRequest, conflict, notFound } from "../errors";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

const ROBOFLOW_API = "https://api.roboflow.com";

/**
 * A Worker's subrequest budget is finite and an export is one request per image,
 * so a run with hundreds of frames is capped rather than silently truncated: the
 * response reports how many were left, and the caller exports again.
 */
const MAX_IMAGES_PER_EXPORT = 25;

type Split = "train" | "valid" | "test";
const isSplit = (v: string): v is Split => v === "train" || v === "valid" || v === "test";

/** Narrow the optional key, or fail with the 503 that says which secret is absent. */
function requireKey(env: Env): string {
  if (!env.ROBOFLOW_API_KEY) throw annotationUnavailable();
  return env.ROBOFLOW_API_KEY;
}

/** One image's fate, as Roboflow reported it. Stored verbatim as the export receipt. */
interface UploadOutcome {
  document_id: string;
  filename: string;
  roboflow_id: string | null;
  duplicate: boolean;
  error: string | null;
}

/**
 * Upload one image as a base64 body.
 *
 * Base64 rather than a hosted URL because the vault is private: Roboflow's
 * `image=<url>` form needs a URL their servers can fetch, and handing out a
 * public link to run imagery to make an upload work would be the wrong trade.
 * Base64-in-the-body is the documented alternative and keeps the bytes on our
 * side of the wire until they reach Roboflow.
 *
 * The API key goes in the query string here rather than a bearer header: the
 * upload endpoint is documented with `?api_key=`, and this call is Worker ->
 * Roboflow over TLS with no intermediary logging the URL.
 */
async function uploadImage(
  apiKey: string,
  project: string,
  params: { name: string; split: Split; batch?: string },
  bytes: ArrayBuffer,
): Promise<{ id: string | null; duplicate: boolean; error: string | null }> {
  const qs = new URLSearchParams({ api_key: apiKey, name: params.name, split: params.split });
  if (params.batch) qs.set("batch", params.batch);

  const res = await fetch(`${ROBOFLOW_API}/dataset/${encodeURIComponent(project)}/upload?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: base64(bytes),
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // A non-JSON body from Roboflow is itself the error message.
    return { id: null, duplicate: false, error: res.ok ? "unreadable response" : text.slice(0, 300) };
  }
  if (!res.ok) {
    const err = body["error"];
    const message = typeof err === "string" ? err : JSON.stringify(err ?? body).slice(0, 300);
    return { id: null, duplicate: false, error: message };
  }
  // Documented response fields: `id`, `success`, `duplicate`. Anything absent is
  // read as "not reported" rather than defaulted to a success.
  const id = typeof body["id"] === "string" ? body["id"] : null;
  const duplicate = body["duplicate"] === true;
  const success = body["success"] === true || id !== null || duplicate;
  return { id, duplicate, error: success ? null : `upload rejected: ${text.slice(0, 300)}` };
}

/** Base64 for an ArrayBuffer, chunked so a large frame cannot blow the call stack. */
function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function mountRoboflow(app: App): void {
  /**
   * Whether the handoff is usable, and what has already been sent for this run.
   * `annotation_configured` mirrors billing's `payments_configured`: the UI asks
   * before offering the action.
   */
  app.get("/runs/:id/roboflow", async (c) => {
    const runId = c.req.param("id");
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM roboflow_exports WHERE run_id = ? ORDER BY created_at DESC`)
      .bind(runId).all<Row>();
    return c.json({
      annotation_configured: Boolean(c.env.ROBOFLOW_API_KEY),
      workspace: c.env.ROBOFLOW_WORKSPACE ?? null,
      max_images_per_export: MAX_IMAGES_PER_EXPORT,
      exports: results.map(S.roboflowExport),
    });
  });

  /**
   * Push a QA-passed run's images to a Roboflow project.
   *
   * The QA gate is the point of the feature: annotation time is expensive and
   * labelling a run that failed capture QA wastes it. `force` exists for the
   * case where a human has adjudicated the QA record outside the app, and it is
   * recorded in the note rather than hidden.
   */
  app.post("/runs/:id/roboflow/export", async (c) => {
    const apiKey = requireKey(c.env);
    const runId = c.req.param("id");
    const b = await c.req.json<{ project?: string; workspace?: string; batch?: string; split?: string; force?: boolean }>()
      .catch(() => ({} as Record<string, never>));

    const project = (b.project ?? "").trim();
    if (!project) throw badRequest("project is required (the Roboflow project id or url slug)");
    const split = b.split ? String(b.split) : "train";
    if (!isSplit(split)) throw badRequest(`split must be one of train, valid, test (got "${split}")`);

    const run = await c.env.DB.prepare(`SELECT * FROM runs WHERE id = ?`).bind(runId).first<Row>();
    if (!run) throw notFound("run");

    const qa = await c.env.DB.prepare(`SELECT overall_status, verdict FROM qa_pipeline_runs WHERE run_id = ?`)
      .bind(runId).first<Row>();
    if (!b.force) {
      if (!qa) throw conflict("this run has no QA record — run QA before exporting for annotation");
      const passed = str(qa, "overall_status") === "PASS" || str(qa, "verdict") === "ACCEPT";
      if (!passed) {
        throw conflict(
          `QA has not passed for this run (status ${str(qa, "overall_status")}` +
          `${strOrNull(qa, "verdict") ? `, verdict ${str(qa, "verdict")}` : ""}). ` +
          "Resolve the QA findings first, or re-send with force:true to override.",
        );
      }
    }

    const { results: docs } = await c.env.DB
      .prepare(
        `SELECT * FROM documents
         WHERE linked_entity_type = 'run' AND linked_entity_id = ? AND mime_type LIKE 'image/%'
         ORDER BY created_at`,
      )
      .bind(runId).all<Row>();
    if (docs.length === 0) throw badRequest("no image documents are attached to this run");

    const vault = requireVault(c.env);
    const batch = b.batch ?? `charmquark-${str(run, "encoded_code") || str(run, "provisional_code") || runId.slice(0, 8)}`;
    const selected = docs.slice(0, MAX_IMAGES_PER_EXPORT);
    const outcomes: UploadOutcome[] = [];

    for (const doc of selected) {
      const filename = str(doc, "filename");
      const object = await vault.get(str(doc, "file_path"));
      if (!object) {
        outcomes.push({ document_id: str(doc, "id"), filename, roboflow_id: null, duplicate: false, error: "object missing from the vault" });
        continue;
      }
      const r = await uploadImage(apiKey, project, { name: filename, split, batch }, await object.arrayBuffer());
      outcomes.push({ document_id: str(doc, "id"), filename, roboflow_id: r.id, duplicate: r.duplicate, error: r.error });
    }

    const failed = outcomes.filter((o) => o.error !== null).length;
    const duplicates = outcomes.filter((o) => o.duplicate).length;
    const accepted = outcomes.length - failed;
    // PARTIAL is its own state rather than a rounded-up COMPLETE: an export that
    // dropped three frames is a different thing to one that dropped none, and
    // the difference matters when someone asks what the dataset contains.
    const status = failed === 0 ? "COMPLETE" : accepted === 0 ? "FAILED" : "PARTIAL";

    const id = uuid();
    await c.env.DB.prepare(
      `INSERT INTO roboflow_exports (id, run_id, workspace, project, batch, split, status,
                                     image_count, duplicate_count, failed_count, results, error, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, runId, b.workspace ?? c.env.ROBOFLOW_WORKSPACE ?? null, project, batch, split, status,
      accepted, duplicates, failed, jsonCol(outcomes),
      failed > 0 ? (outcomes.find((o) => o.error)?.error ?? null) : null,
      c.get("principal").name,
    ).run();

    const row = await c.env.DB.prepare(`SELECT * FROM roboflow_exports WHERE id = ?`).bind(id).first<Row>();
    return c.json(
      { ...S.roboflowExport(row!), remaining: Math.max(0, docs.length - selected.length) },
      status === "FAILED" ? 502 : 201,
    );
  });

  /**
   * Record which Roboflow dataset version was cut from an export.
   *
   * Manual because version generation has no documented REST endpoint — see the
   * module header. Recording the number by hand keeps lineage traceable without
   * guessing at an API.
   */
  app.patch("/roboflow/exports/:id", async (c) => {
    const b = await c.req.json<{ dataset_version?: string }>();
    const version = (b.dataset_version ?? "").trim();
    if (!version) throw badRequest("dataset_version is required");
    const res = await c.env.DB
      .prepare(`UPDATE roboflow_exports SET dataset_version = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(version, c.req.param("id")).run();
    if (!res.meta.changes) throw notFound("roboflow export");
    const row = await c.env.DB.prepare(`SELECT * FROM roboflow_exports WHERE id = ?`)
      .bind(c.req.param("id")).first<Row>();
    return c.json(S.roboflowExport(row!));
  });

  /**
   * Roboflow's view of the project: image counts, classes and existing versions.
   * Proxied so the panel can show where a run's frames landed without the
   * browser ever holding the API key.
   */
  app.get("/roboflow/projects/:project", async (c) => {
    const apiKey = requireKey(c.env);
    const workspace = c.req.query("workspace") ?? c.env.ROBOFLOW_WORKSPACE;
    if (!workspace) throw badRequest("workspace is required (set ROBOFLOW_WORKSPACE or pass ?workspace=)");
    const res = await fetch(
      `${ROBOFLOW_API}/${encodeURIComponent(workspace)}/${encodeURIComponent(c.req.param("project"))}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const body = await res.json().catch(() => ({ error: "unreadable response from Roboflow" }));
    return c.json(body as Record<string, unknown>, res.ok ? 200 : 502);
  });
}
