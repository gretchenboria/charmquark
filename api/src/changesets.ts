/**
 * Change sets — a batch of edits that is previewed first and applied atomically.
 *
 * This is how an agent changes CharmQuark safely: it proposes a change set,
 * reads back a field-by-field diff with every problem named (validation,
 * permissions, read-only fields, stale versions), and only then applies it. A
 * person can apply what an agent proposed; permissions are always those of
 * whoever applies. Config-as-code imports land the same way.
 *
 * Guarantees:
 *   - Strict. Unknown fields and read-only fields are problems, not silently
 *     dropped, so an agent learns the rules instead of guessing.
 *   - All or nothing. Every edit runs in one D1 batch (a transaction).
 *   - No lost updates. Each update/delete is guarded by the version it was
 *     previewed against; if anyone changed that record since, the whole batch
 *     rolls back (see the changeset_guards table in migration 0008).
 *   - References. A create may carry `ref`, and later edits in the same set may
 *     use "$ref:<name>" wherever that record's id is needed.
 */
import type { Context } from "hono";
import type { Env, Principal, Vars } from "./types";
import { buildUpdate, num, uuid, type Row } from "./db";
import { canPerform } from "./auth";
import { auditStatement, getRow, storageTransforms } from "./changes";
import { RESOURCES, validateBody, writableFields, type ResourceSpec } from "./contracts";
import * as S from "./serialize";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/** Record types a change set may touch, with how each is shown in a diff. */
export const CHANGESET_RESOURCES: Record<string, (r: Row) => Record<string, unknown>> = {
  campaigns: S.campaign,
  "mission-groups": S.missionGroup,
  missions: S.mission,
  robots: S.robot,
  operators: S.operator,
  labs: S.lab,
  "lab-blackouts": S.labBlackout,
  sensors: S.sensor,
  "sensor-rigs": S.sensorRig,
  "inventory-items": S.inventoryItem,
};

export const MAX_CHANGES = 100;
const OPS = ["create", "update", "delete"] as const;
type Op = (typeof OPS)[number];
const REF_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const REF_VALUE = /^\$ref:([A-Za-z0-9_-]{1,64})$/;

export interface ChangePreview {
  index: number;
  resource: string;
  op: string;
  id: string | null;
  ref: string | null;
  ok: boolean;
  problems: string[];
  /** The record version this preview was computed against (update/delete). */
  version: number | null;
  /** field -> from/to. For a create, `from` is null. */
  diff: Record<string, { from: unknown; to: unknown }>;
}

interface Planned {
  preview: ChangePreview;
  spec: ResourceSpec;
  op: Op;
  id: string;
  data: Record<string, unknown>;
  before: Row | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Replace "$ref:name" strings (top level, or inside lists) with the id the ref resolved to. */
function resolveRefs(data: Record<string, unknown>, refs: Map<string, string>): { data: Record<string, unknown>; missing: string[] } {
  const missing: string[] = [];
  const one = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    const m = REF_VALUE.exec(v);
    if (!m) return v;
    const id = refs.get(m[1]!);
    if (!id) missing.push(v);
    return id ?? v;
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = Array.isArray(v) ? v.map(one) : one(v);
  return { data: out, missing };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Check every edit and compute its diff. Nothing is written. `pinned` supplies
 * the versions a stored preview was made against, so applying it later refuses
 * records that changed in between.
 */
export async function analyze(c: Ctx, rawChanges: unknown, pinned: (number | null)[] = []): Promise<{ ok: boolean; plan: Planned[]; previews: ChangePreview[] }> {
  const p: Principal = c.get("principal");
  const previews: ChangePreview[] = [];
  const plan: Planned[] = [];

  if (!Array.isArray(rawChanges) || rawChanges.length === 0 || rawChanges.length > MAX_CHANGES) {
    const preview: ChangePreview = {
      index: -1, resource: "", op: "", id: null, ref: null, ok: false, version: null, diff: {},
      problems: [`changes must be a list of 1–${MAX_CHANGES} edits`],
    };
    return { ok: false, plan: [], previews: [preview] };
  }

  const refs = new Map<string, string>();
  for (const [index, raw] of rawChanges.entries()) {
    const ch = isObject(raw) ? raw : {};
    const problems: string[] = [];
    const resource = typeof ch.resource === "string" ? ch.resource : "";
    const op = (OPS as readonly string[]).includes(String(ch.op)) ? (ch.op as Op) : null;
    const ref = typeof ch.ref === "string" ? ch.ref : null;
    const preview: ChangePreview = {
      index, resource, op: String(ch.op ?? ""), id: typeof ch.id === "string" ? ch.id : null,
      ref, ok: true, problems, version: null, diff: {},
    };
    previews.push(preview);

    const serialize = CHANGESET_RESOURCES[resource];
    if (!serialize) {
      problems.push(`resource must be one of ${Object.keys(CHANGESET_RESOURCES).join(", ")}`);
      preview.ok = false;
      continue;
    }
    if (!op) {
      problems.push(`op must be one of ${OPS.join(", ")}`);
      preview.ok = false;
      continue;
    }
    const spec = RESOURCES[resource as keyof typeof RESOURCES] as ResourceSpec;

    const denied = canPerform(p, spec.path, op === "delete" ? "delete" : "write");
    if (denied) problems.push(denied);

    // --- identity ---
    let id: string;
    if (op === "create") {
      id = uuid();
      if (ch.id !== undefined) problems.push("id is assigned by the server on create; use ref to refer to this record later in the set");
      if (ref !== null) {
        if (!REF_NAME.test(ref)) problems.push("ref must be 1–64 letters, digits, _ or -");
        else if (refs.has(ref)) problems.push(`ref ${ref} is used twice`);
        else refs.set(ref, id);
      }
    } else {
      if (typeof ch.id !== "string" || !ch.id) {
        problems.push(`id is required for ${op}`);
        preview.ok = false;
        continue;
      }
      id = refs.get(REF_VALUE.exec(ch.id)?.[1] ?? "") ?? ch.id;
      if (ref !== null) problems.push("ref only applies to create");
    }

    // --- data ---
    let data: Record<string, unknown> = {};
    if (op !== "delete") {
      if (!isObject(ch.data) || Object.keys(ch.data).length === 0) {
        problems.push("data must be an object with at least one field");
      } else {
        const resolved = resolveRefs(ch.data, refs);
        data = resolved.data;
        for (const m of resolved.missing) problems.push(`${m} does not match a ref created earlier in this set`);
      }
    } else if (ch.data !== undefined) {
      problems.push("delete takes no data");
    }

    const mode = op === "create" ? "create" : "update";
    const writable = new Set(writableFields(spec.fields, mode));
    for (const key of Object.keys(data)) {
      const f = spec.fields[key];
      if (!f) problems.push(`unknown field ${key}`);
      else if (!writable.has(key)) problems.push(`${key} is read-only: ${f.readonly}`);
    }
    if (op !== "delete") {
      for (const e of validateBody(spec.fields, data, mode)) problems.push(`${e.field} ${e.message}`);
    }

    // --- the record as it is now ---
    let before: Row | null = null;
    if (op !== "create") {
      before = await getRow(c.env.DB, spec.table, id);
      if (!before) {
        problems.push(`${spec.label} ${id} not found`);
      } else {
        const current = num(before, "version", 1);
        preview.version = current;
        const expected = ch.if_match !== undefined ? ch.if_match : pinned[index] ?? undefined;
        if (expected !== undefined && expected !== null) {
          if (!Number.isInteger(expected)) problems.push("if_match must be a version number");
          else if (expected !== current) problems.push(`version conflict: expected ${expected}, the ${spec.label} is now at ${current} — preview again`);
          else preview.version = expected as number;
        }
      }
    }

    // --- fields only certain roles may set ---
    for (const [key, f] of Object.entries(spec.fields)) {
      if (!f.writeRoles || !(key in data) || f.writeRoles.includes(p.role)) continue;
      const changed = op === "create"
        ? data[key] !== null && data[key] !== "" && data[key] !== (f.default ?? null)
        : before !== null && String(data[key]) !== String(before[key]);
      if (changed) problems.push(`${key}: ${f.writeRolesReason ?? "restricted"} (requires ${f.writeRoles.join(", ")})`);
    }

    // --- diff ---
    const shown = before ? serialize(before) : null;
    for (const [key, to] of Object.entries(data)) {
      if (!writable.has(key)) continue;
      const f = spec.fields[key]!;
      const normalized = f.type === "boolean" ? to === true || to === 1 : to;
      const from = shown ? (shown[key] ?? before?.[key] ?? null) : null;
      if (op === "create" || !same(from, normalized)) preview.diff[key] = { from, to: normalized };
    }
    if (op === "delete" && shown) preview.diff = Object.fromEntries(Object.entries(shown).map(([k, v]) => [k, { from: v, to: null }]));

    preview.id = op === "create" ? null : id;
    preview.ok = problems.length === 0;
    plan.push({ preview, spec, op, id, data, before });
  }

  return { ok: previews.every((x) => x.ok), plan, previews };
}

export class ChangesetConflict extends Error {}

/**
 * Apply an analyzed plan in one batch. Throws ChangesetConflict when a guarded
 * record changed after analysis (the batch rolled back).
 */
export async function applyPlan(c: Ctx, plan: Planned[]): Promise<{ created: Record<string, string> }> {
  const db = c.env.DB;
  const p = c.get("principal");
  const stmts: D1PreparedStatement[] = [];
  const created: Record<string, string> = {};

  for (const step of plan) {
    const { spec, op, id, data, before, preview } = step;
    const transform = storageTransforms(spec.fields);
    const serialize = CHANGESET_RESOURCES[spec.path]!;

    if (op === "create") {
      const cols = ["id"];
      const vals: unknown[] = [id];
      for (const col of writableFields(spec.fields, "create")) {
        if (!(col in data)) continue;
        cols.push(`"${col}"`);
        vals.push(transform[col] ? transform[col]!(data[col]) : data[col]);
      }
      stmts.push(db.prepare(`INSERT INTO ${spec.table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...vals));
      stmts.push(auditStatement(db, p, { resource: spec.path, entityId: id, action: "create", after: data }));
      if (preview.ref) created[preview.ref] = id;
      continue;
    }

    // Abort the whole batch if this record moved since it was analyzed.
    stmts.push(
      db.prepare(`INSERT INTO changeset_guards (ok) SELECT COALESCE((SELECT version FROM ${spec.table} WHERE id = ?), -1) = ?`)
        .bind(id, preview.version),
    );
    const shownBefore = before ? serialize(before) : undefined;
    if (op === "update") {
      const upd = buildUpdate(spec.table, id, data, writableFields(spec.fields, "update"), transform);
      if (upd) stmts.push(db.prepare(upd.sql).bind(...upd.params));
      const after = { ...shownBefore, ...Object.fromEntries(Object.entries(preview.diff).map(([k, v]) => [k, v.to])) };
      stmts.push(auditStatement(db, p, { resource: spec.path, entityId: id, action: "update", before: shownBefore, after }));
    } else {
      stmts.push(db.prepare(`DELETE FROM ${spec.table} WHERE id = ?`).bind(id));
      stmts.push(auditStatement(db, p, { resource: spec.path, entityId: id, action: "delete", before: shownBefore }));
    }
  }
  stmts.push(db.prepare(`DELETE FROM changeset_guards`));

  try {
    await db.batch(stmts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/CHECK constraint failed/i.test(message)) {
      throw new ChangesetConflict("a record in this change set was changed by someone else after it was previewed — nothing was applied; preview again");
    }
    throw err;
  }
  return { created };
}
