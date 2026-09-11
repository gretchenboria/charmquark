/**
 * Resource CRUD — robots, operators, labs, lab blackouts, sensors, sensor rigs,
 * inventory, mission groups, users.
 *
 * These are all the same shape (list / get / create / update / delete over one
 * table), so they are built from one factory driven by the contract registry
 * (packages/contracts/src/resources.ts): which columns are writable, which are
 * required, how each is validated and stored. Every write honours If-Match and
 * lands in the audit trail. Anything with real domain rules lives in runs.ts or
 * autoschedule.ts instead.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, Vars } from "../types";
import { num, uuid, type Row } from "../db";
import { notFound } from "../errors";
import { requireUserAdmin } from "../auth";
import { audit, storageTransforms, versionedDelete, versionedUpdate } from "../changes";
import { RESOURCES, assertValid, writableFields, type ResourceSpec } from "../contracts";
import * as S from "../serialize";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

interface CrudSpec {
  resource: ResourceSpec;
  serialize: (r: Row) => unknown;
  /**
   * Authorization check run before create/update/delete. Throws to deny.
   * Reads are left open; only writes are gated, which is what the `users`
   * table needs — everyone may see the roster, only an admin may change it.
   */
  writeGuard?: (c: Context<{ Bindings: Env; Variables: Vars }>) => Promise<void>;
  /** Default ORDER BY clause. */
  orderBy?: string;
}

/** Mount list/get/create/update/delete for one table. */
function crud(app: App, spec: CrudSpec): void {
  const { resource, serialize } = spec;
  const { path, table, label, fields } = resource;
  const order = spec.orderBy ?? "created_at";
  const createColumns = writableFields(fields, "create");
  const updateColumns = writableFields(fields, "update");
  const transform = storageTransforms(fields);

  app.get(`/${path}`, async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all<Row>();
    return c.json(results.map(serialize));
  });

  app.get(`/${path}/:id`, async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(c.req.param("id")).first<Row>();
    if (!row) throw notFound(label);
    c.header("ETag", `"${num(row, "version", 1)}"`);
    return c.json(serialize(row));
  });

  const guard = async (c: Context<{ Bindings: Env; Variables: Vars }>) => {
    if (spec.writeGuard) await spec.writeGuard(c);
  };

  app.post(`/${path}`, async (c) => {
    await guard(c);
    const body = await c.req.json<Record<string, unknown>>();
    assertValid(resource, body, "create");
    const id = uuid();
    const cols = ["id"];
    const vals: unknown[] = [id];
    for (const col of createColumns) {
      if (!(col in body)) continue;
      cols.push(`"${col}"`);
      vals.push(transform[col] ? transform[col]!(body[col]) : body[col]);
    }
    await c.env.DB.prepare(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    ).bind(...vals).run();
    const row = (await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Row>())!;
    await audit(c, { resource: path, entityId: id, action: "create", after: serialize(row) });
    c.header("ETag", `"${num(row, "version", 1)}"`);
    return c.json(serialize(row), 201);
  });

  app.patch(`/${path}/:id`, async (c) => {
    await guard(c);
    const id = c.req.param("id");
    const body = await c.req.json<Record<string, unknown>>();
    assertValid(resource, body, "update");
    const { before, after } = await versionedUpdate(c, {
      table, label, id, body, columns: updateColumns, transform, serialize,
    });
    await audit(c, { resource: path, entityId: id, action: "update", before: serialize(before), after: serialize(after) });
    return c.json(serialize(after));
  });

  app.delete(`/${path}/:id`, async (c) => {
    await guard(c);
    const id = c.req.param("id");
    const before = await versionedDelete(c, { table, label, id, serialize });
    await audit(c, { resource: path, entityId: id, action: "delete", before: serialize(before) });
    return c.body(null, 204);
  });
}

export function mountResources(app: App): void {
  crud(app, { resource: RESOURCES.robots, serialize: S.robot, orderBy: "robot_code" });
  crud(app, { resource: RESOURCES.operators, serialize: S.operator, orderBy: "operator_code" });
  crud(app, { resource: RESOURCES.labs, serialize: S.lab, orderBy: "name" });
  crud(app, { resource: RESOURCES["lab-blackouts"], serialize: S.labBlackout, orderBy: "blackout_date, slot_time" });
  crud(app, { resource: RESOURCES.sensors, serialize: S.sensor, orderBy: "asset_name" });
  crud(app, { resource: RESOURCES["sensor-rigs"], serialize: S.sensorRig, orderBy: "name" });
  crud(app, { resource: RESOURCES["inventory-items"], serialize: S.inventoryItem, orderBy: "name" });
  crud(app, { resource: RESOURCES["mission-groups"], serialize: S.missionGroup, orderBy: `"order", name` });
  crud(app, { resource: RESOURCES.users, serialize: S.user, orderBy: "name", writeGuard: requireUserAdmin });

  // --- scoped collection listings ----------------------------------------------
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

  app.get("/labs/:id/blackouts", async (c) => {
    const { results } = await c.env.DB
      .prepare(`SELECT * FROM lab_blackouts WHERE lab_id = ? ORDER BY blackout_date, slot_time`)
      .bind(c.req.param("id")).all<Row>();
    return c.json(results.map(S.labBlackout));
  });
}
