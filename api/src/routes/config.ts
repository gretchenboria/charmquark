/**
 * Config as code: a deployment's configuration as one JSON bundle.
 *
 *   GET  /config/export                              records (with id and version), settings, workflows
 *   POST /config/plan    {bundle, prune?}             what applying would change, every problem, and a digest
 *   POST /config/apply   {bundle, prune?, digest?}    apply; a digest from plan refuses a deployment that moved on
 *   GET  /config/schema, /config/schema/<file>       JSON Schemas for the bundle and the CLI's files
 *
 * Records go through the change-set engine: validation, per-edit permissions,
 * version pins and one atomic batch. Settings follow through the settings write
 * path, then workflows through their own routes as the caller. See api/src/config.ts.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env, Vars } from "../types";
import { num, str, uuid, type Row } from "../db";
import { notFound } from "../errors";
import * as S from "../serialize";
import { canPerform } from "../auth";
import { CHANGESET_RESOURCES, ChangesetConflict, MAX_CHANGES, analyze, applyPlan, type ChangePreview } from "../changesets";
import { CONFIG_FORMAT, CONFIG_RESOURCES, RESOURCES, configSchemas, projectRecord, type ResourceSpec } from "../contracts";
import { loadSettings } from "../settings";
import { applySettings } from "./settings";
import { planConfig, planDigest, type ConfigPlan, type ConfigState } from "../config";
import { SAVE_BLOCKING, validateBpmn } from "../workflow";
import { dispatchAs, type InternalCall } from "../dispatch";

type App = Hono<{ Bindings: Env; Variables: Vars }>;
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const jsonError = (status: 409 | 422, detail: string, extra: Record<string, unknown>) =>
  new HTTPException(status, {
    res: new Response(JSON.stringify({ detail, ...extra }), { status, headers: { "Content-Type": "application/json" } }),
  });

async function currentState(db: D1Database): Promise<ConfigState> {
  const records = {} as ConfigState["records"];
  for (const resource of CONFIG_RESOURCES) {
    const spec = RESOURCES[resource] as ResourceSpec;
    const { results } = await db.prepare(`SELECT * FROM ${spec.table} ORDER BY rowid`).all<Row>();
    // Missions need the detail view: the list view leaves out variants and instructions.
    const serialize = resource === "missions" ? S.taskDetail : CHANGESET_RESOURCES[resource]!;
    records[resource] = results.map((row) => projectRecord(resource, serialize(row)));
  }
  const { results } = await db.prepare(`SELECT id, name, xml, version FROM workflows ORDER BY rowid`).all<Row>();
  return {
    records,
    settings: await loadSettings(db),
    workflows: results.map((w) => ({ id: str(w, "id"), name: str(w, "name"), xml: str(w, "xml"), version: num(w, "version", 1) })),
  };
}

interface Analysis {
  plan: ConfigPlan;
  digest: string;
  ok: boolean;
  problems: string[];
  previews: ChangePreview[];
  checked: Awaited<ReturnType<typeof analyze>> | null;
}

async function analyzeBundle(c: Ctx, body: Record<string, unknown>): Promise<Analysis> {
  const plan = planConfig(body["bundle"], await currentState(c.env.DB), { prune: body["prune"] === true });
  const problems = [...plan.problems];
  const p = c.get("principal");

  let checked: Analysis["checked"] = null;
  if (plan.records.length > MAX_CHANGES) {
    problems.push(`this bundle changes ${plan.records.length} records and one apply takes at most ${MAX_CHANGES}; apply it in parts, e.g. one records file at a time`);
  } else if (plan.records.length) {
    checked = await analyze(c, plan.records);
  }
  if (plan.settings.length) {
    const denied = canPerform(p, "settings", "write");
    if (denied) problems.push(`settings: ${denied}`);
  }
  for (const w of plan.workflows) {
    const denied = canPerform(p, "workflows", w.op === "delete" ? "delete" : "write");
    if (denied) problems.push(`workflow "${w.name}": ${denied}`);
    if (w.xml !== undefined) {
      const report = await validateBpmn(w.xml);
      for (const e of report.errors) if (SAVE_BLOCKING.has(e.code)) problems.push(`workflow "${w.name}": ${e.message}`);
    }
  }
  return {
    plan, problems, checked,
    previews: checked?.previews ?? [],
    digest: await planDigest(plan),
    ok: problems.length === 0 && (checked?.ok ?? true),
  };
}

function report(a: Analysis) {
  const count = (op: string) => a.plan.records.filter((r) => r.op === op).length;
  const problemCount = a.problems.length + a.previews.reduce((n, p) => n + p.problems.length, 0);
  return {
    ok: a.ok,
    digest: a.digest,
    problem_count: problemCount,
    summary: {
      create: count("create"), update: count("update"), delete: count("delete"),
      settings: a.plan.settings.length, workflows: a.plan.workflows.length,
    },
    problems: a.problems,
    // Per-record diff and problems from the change-set engine; without them (too
    // many changes to check) the planned edits alone.
    records: a.previews.length
      ? a.previews
      : a.plan.records.map((r, index) => ({ index, resource: r.resource, op: r.op, id: r.id ?? null, ref: r.ref ?? null, ok: false, problems: [], version: r.if_match ?? null, diff: {} })),
    settings: a.plan.settings,
    workflows: a.plan.workflows.map(({ xml: _xml, ...w }) => w),
  };
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "send {\"bundle\": <exported bundle>, \"prune\"?: boolean}" });
  }
  return body;
}

export function mountConfig(app: App): void {
  app.get("/config/export", async (c) => {
    const state = await currentState(c.env.DB);
    return c.json({ format: CONFIG_FORMAT, exported_at: new Date().toISOString(), settings: state.settings, records: state.records, workflows: state.workflows });
  });

  app.get("/config/schema", (c) => c.json(Object.keys(configSchemas())));
  app.get("/config/schema/*", (c) => {
    const file = c.req.path.replace(/^.*\/config\/schema\//, "");
    const schema = configSchemas()[file];
    if (!schema) throw notFound(`schema ${file}`);
    return c.json(schema);
  });

  app.post("/config/plan", async (c) => c.json(report(await analyzeBundle(c, await readBody(c)))));

  app.post("/config/apply", async (c) => {
    const body = await readBody(c);
    const a = await analyzeBundle(c, body);
    if (!a.ok) throw jsonError(422, `the bundle has ${report(a).problem_count} problem(s); nothing was applied`, report(a));
    if (body["digest"] !== undefined && body["digest"] !== a.digest) {
      throw jsonError(409, "the deployment changed since this bundle was planned; plan again and review the new diff", report(a));
    }

    const p = c.get("principal");
    let created: Record<string, string> = {};
    let changesetId: string | null = null;
    if (a.checked && a.plan.records.length) {
      try {
        ({ created } = await applyPlan(c, a.checked.plan));
      } catch (err) {
        if (err instanceof ChangesetConflict) throw jsonError(409, err.message, report(a));
        throw err;
      }
      changesetId = uuid();
      await c.env.DB.prepare(
        `INSERT INTO changesets (id, created_by, via, status, summary, changes, preview, applied_at, applied_by)
         VALUES (?, ?, ?, 'APPLIED', ?, ?, ?, datetime('now'), ?)`,
      ).bind(changesetId, p.subject, p.via, "config bundle", JSON.stringify(a.plan.records), JSON.stringify(a.previews), p.subject).run();
    }

    if (a.plan.settings.length) await applySettings(c, Object.fromEntries(a.plan.settings.map((s) => [s.key, s.to])));

    // Workflows through their own routes: BPMN validation, version history, If-Match, audit.
    const workflows: Record<string, unknown>[] = [];
    for (const w of a.plan.workflows) {
      const headers = w.if_match !== undefined ? { "If-Match": String(w.if_match) } : undefined;
      const path = `/workflows/${encodeURIComponent(w.id ?? "")}`;
      const call: InternalCall =
        w.op === "create" ? { method: "POST", path: "/workflows", body: { name: w.name, xml: w.xml } }
          : w.op === "update"
            ? { method: "PATCH", path, headers, body: { ...(w.name_changed ? { name: w.name } : {}), ...(w.xml_changed ? { xml: w.xml } : {}) } }
            : { method: "DELETE", path, headers };
      const res = await dispatchAs(c, call);
      const id = w.id ?? ((res.body as { id?: string } | null)?.id ?? null);
      workflows.push({ op: w.op, id, name: w.name, status: res.status, ...(res.status >= 400 ? { detail: res.body } : {}) });
    }
    const failed = workflows.some((w) => Number(w["status"]) >= 400);

    return c.json({
      status: failed ? "PARTIAL" : "APPLIED",
      digest: a.digest,
      summary: report(a).summary,
      changeset_id: changesetId,
      created,
      workflows,
    });
  });
}
