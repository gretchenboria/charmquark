/**
 * Resource CRUD — robots, operators, labs, sensors, sensor fleets, inventory, users.
 *
 * These are all the same shape (list / get / create / update / delete over one
 * table), so they are built from one factory. Anything with real domain rules
 * lives in runs.ts or autoschedule.ts instead.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, Vars } from "../types";
import { buildUpdate, fromBool, jsonCol, uuid, type Row } from "../db";
import { badRequest, notFound } from "../errors";
import { requireUserAdmin } from "../auth";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

interface CrudSpec {
  /**
   * Authorization check run before create/update/delete. Throws to deny.
   * Reads are left open; only writes are gated, which is what the `users`
   * table needs — everyone may see the roster, only an admin may change it.
   */
  writeGuard?: (c: Context<{ Bindings: Env; Variables: Vars }>) => Promise<void>;
  /** URL segment, e.g. "robots". */
  path: string;
  table: string;
  /** Human name used in 404 messages. */
  label: string;
  serialize: (r: Row) => unknown;
  /** Columns accepted on create. */
  createColumns: readonly string[];
  /** Columns accepted on PATCH. */
  updateColumns: readonly string[];
  /** Per-column coercion (booleans -> 0/1, arrays -> JSON text). */
  transform?: Record<string, (v: unknown) => unknown>;
  /** Required keys on create. */
  required?: readonly string[];
  /** Default ORDER BY clause. */
  orderBy?: string;
}

/** Mount list/get/create/update/delete for one table. */
function crud(app: App, spec: CrudSpec): void {
  const { path, table, label, serialize, transform = {} } = spec;
  const order = spec.orderBy ?? "created_at";

  app.get(`/${path}`, async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all<Row>();
    return c.json(results.map(serialize));
  });

  app.get(`/${path}/:id`, async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound(label);
    return c.json(serialize(row));
  });

  const guard = async (c: Context<{ Bindings: Env; Variables: Vars }>) => {
    if (spec.writeGuard) await spec.writeGuard(c);
  };

  app.post(`/${path}`, async (c) => {
    await guard(c);
    const body = await c.req.json<Record<string, unknown>>();
    for (const key of spec.required ?? []) {
      if (body[key] === undefined || body[key] === null || body[key] === "") {
        throw badRequest(`${key} is required`);
      }
    }
    const id = uuid();
    const cols = ["id"];
    const vals: unknown[] = [id];
    for (const col of spec.createColumns) {
      if (!(col in body)) continue;
      cols.push(`"${col}"`);
      vals.push(transform[col] ? transform[col]!(body[col]) : body[col]);
    }
    await c.env.DB.prepare(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    ).bind(...vals).run();
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Row>();
    return c.json(serialize(row!), 201);
  });

  app.patch(`/${path}/:id`, async (c) => {
    await guard(c);
    const id = c.req.param("id");
    const body = await c.req.json<Record<string, unknown>>();
    const upd = buildUpdate(table, id, body, spec.updateColumns, transform);
    if (upd) await c.env.DB.prepare(upd.sql).bind(...upd.params).run();
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Row>();
    if (!row) throw notFound(label);
    return c.json(serialize(row));
  });

  app.delete(`/${path}/:id`, async (c) => {
    await guard(c);
    const res = await c.env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(c.req.param("id")).run();
    if (!res.meta.changes) throw notFound(label);
    return c.body(null, 204);
  });
}

const bool = (v: unknown) => fromBool(v);
const json = (v: unknown) => jsonCol(v ?? []);

export function mountResources(app: App): void {
  crud(app, {
    path: "robots",
    table: "robots",
    label: "robot",
    serialize: S.robot,
    required: ["robot_code"],
    orderBy: "robot_code",
    createColumns: ["robot_code", "name", "platform", "serial_number", "status",
      "safety_certified", "calibration_valid", "commissioned", "commissioned_date", "is_standby"],
    updateColumns: ["robot_code", "name", "platform", "serial_number", "status",
      "safety_certified", "calibration_valid", "commissioned", "commissioned_date", "is_standby"],
    transform: {
      safety_certified: bool, calibration_valid: bool, commissioned: bool, is_standby: bool,
    },
  });

  crud(app, {
    path: "operators",
    table: "operators",
    label: "operator",
    serialize: S.operator,
    required: ["operator_code", "name"],
    orderBy: "operator_code",
    createColumns: ["operator_code", "name", "role", "is_active", "code_number"],
    updateColumns: ["operator_code", "name", "role", "is_active", "code_number"],
    transform: { is_active: bool },
  });

  crud(app, {
    path: "labs",
    table: "labs",
    label: "lab",
    serialize: S.lab,
    required: ["name"],
    orderBy: "name",
    createColumns: ["name", "type", "is_available", "capacity", "code_number"],
    updateColumns: ["name", "type", "is_available", "capacity", "code_number"],
    transform: { is_available: bool },
  });

  crud(app, {
    path: "sensors",
    table: "sensors",
    label: "sensor",
    serialize: S.sensor,
    required: ["asset_name", "sensor_type"],
    orderBy: "asset_name",
    createColumns: ["asset_name", "sensor_type", "status", "current_campaign_id"],
    updateColumns: ["asset_name", "sensor_type", "status", "current_campaign_id"],
  });

  crud(app, {
    path: "sensor-rigs",
    table: "sensor_rigs",
    label: "sensor fleet",
    serialize: S.sensorRig,
    required: ["campaign_id", "name"],
    orderBy: "name",
    createColumns: ["campaign_id", "name", "sensor_ids"],
    updateColumns: ["name", "sensor_ids"],
    transform: { sensor_ids: json },
  });

  crud(app, {
    path: "inventory-items",
    table: "inventory_items",
    label: "inventory item",
    serialize: S.inventoryItem,
    required: ["campaign_id", "name", "kind"],
    orderBy: "name",
    createColumns: ["campaign_id", "name", "kind", "quantity", "unit", "status"],
    updateColumns: ["name", "kind", "quantity", "unit", "status"],
  });

  crud(app, {
    path: "users",
    table: "users",
    label: "user",
    writeGuard: requireUserAdmin,
    serialize: S.user,
    required: ["subject", "name"],
    orderBy: "name",
    createColumns: ["subject", "name", "email", "role", "is_active"],
    updateColumns: ["subject", "name", "email", "role", "is_active"],
    transform: { is_active: bool },
  });

  // --- campaign-scoped collection listings -------------------------------------
  app.get("/campaigns/:id/sensor-rigs", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM sensor_rigs WHERE campaign_id = ? ORDER BY name`)
      .bind(c.req.param("id")).all<Row>();
    return c.json(results.map(S.sensorRig));
  });

  app.get("/campaigns/:id/inventory-items", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM inventory_items WHERE campaign_id = ? ORDER BY name`)
      .bind(c.req.param("id")).all<Row>();
    return c.json(results.map(S.inventoryItem));
  });
}
