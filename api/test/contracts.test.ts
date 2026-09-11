/**
 * Contract tests: the shared definitions must agree with the database and must
 * not change by accident.
 *
 * Run with `npm --prefix api test`. The migrations are read as text, so a CHECK
 * constraint widened without updating packages/contracts (or the reverse) fails
 * here instead of surfacing as a 500 in production.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DB_ENUMS, RESOURCES, RUN_PIPELINE, RUN_STATES, labelFor, validateBody, writableFields,
} from "../../packages/contracts/src/index.ts";

const MIGRATIONS = new URL("../../db/migrations/", import.meta.url);
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, MIGRATIONS), "utf8"))
  .join("\n");

/** Tables dropped or never used; their CHECKs are not part of the contract. */
const IGNORED = new Set(["mission_executions.status"]);

/** Every `column ... CHECK (column IN (...))`, attributed to its table. */
function checkConstraints(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const blocks = sql.split(/(?=CREATE TABLE|ALTER TABLE)/);
  for (const block of blocks) {
    const table = /^(?:CREATE|ALTER) TABLE\s+(\w+)/.exec(block)?.[1];
    if (!table) continue;
    for (const m of block.matchAll(/CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/g)) {
      const values = [...m[2]!.matchAll(/'([^']*)'/g)].map((v) => v[1]!);
      out.set(`${table}.${m[1]}`, values);
    }
  }
  return out;
}

test("every enum in the contracts equals its SQL CHECK constraint", () => {
  const checks = checkConstraints();
  for (const [key, values] of Object.entries(DB_ENUMS)) {
    assert.deepEqual([...values].sort(), [...(checks.get(key) ?? [])].sort(), `${key} drifted from the migrations`);
  }
});

test("every SQL CHECK ... IN constraint has a contract", () => {
  const missing = [...checkConstraints().keys()].filter((k) => !(k in DB_ENUMS) && !IGNORED.has(k));
  assert.deepEqual(missing, [], "add these to DB_ENUMS in packages/contracts/src/enums.ts");
});

test("registry enum fields use the same lists as DB_ENUMS", () => {
  for (const spec of Object.values(RESOURCES)) {
    for (const [name, f] of Object.entries(spec.fields)) {
      const db = DB_ENUMS[`${spec.table}.${name}`];
      if (f.type === "enum" && db) assert.equal(f.values, db, `${spec.path}.${name}`);
    }
  }
});

test("the run pipeline is an ordered subset of run states", () => {
  for (const s of RUN_PIPELINE) assert.ok((RUN_STATES as readonly string[]).includes(s), s);
});

/**
 * Pinned writable columns. These were the hand-kept lists in the routes before
 * the registry existed; a change here widens or narrows what clients may write,
 * which deserves a deliberate edit to this test.
 */
const WRITABLE_ON_UPDATE: Record<string, string[]> = {
  campaigns: ["name", "campaign_type", "target_n", "status", "default_sensor_rig_id"],
  "mission-groups": ["name", "order"],
  missions: ["mission_group_id", "mission_code", "name", "group", "status", "review_status",
    "duration_type", "reps_target", "reps_actual", "schedule_status", "instructions_complete",
    "risk_level", "legal_approval", "variants", "inventory_item_ids", "instructions"],
  robots: ["robot_code", "name", "platform", "serial_number", "status", "safety_certified",
    "calibration_valid", "commissioned", "commissioned_date", "is_standby"],
  operators: ["operator_code", "name", "role", "is_active", "code_number"],
  labs: ["name", "type", "is_available", "capacity", "code_number"],
  sensors: ["asset_name", "sensor_type", "status", "current_campaign_id"],
  "sensor-rigs": ["name", "sensor_ids"],
  "inventory-items": ["name", "kind", "quantity", "unit", "status"],
  users: ["subject", "name", "email", "role", "is_active"],
  runs: ["slot_date", "slot_time", "mission_scope", "mission_group_id", "mission_ids", "robot_id",
    "operator_id", "lab_id", "sensor_rig_id", "notes", "payload", "run_lab"],
  "lab-blackouts": ["blackout_date", "slot_time", "reason"],
  documents: ["filename", "vault_category", "status", "linked_entity_type", "linked_entity_id"],
  workflows: ["name", "xml"],
};

test("writable fields per resource are pinned", () => {
  for (const [path, expected] of Object.entries(WRITABLE_ON_UPDATE)) {
    const spec = RESOURCES[path as keyof typeof RESOURCES];
    assert.deepEqual(writableFields(spec.fields, "update").sort(), [...expected].sort(), path);
  }
  assert.deepEqual(Object.keys(WRITABLE_ON_UPDATE).sort(), Object.keys(RESOURCES).sort());
});

test("parent ids are accepted on create but never on update", () => {
  for (const path of ["missions", "sensor-rigs", "inventory-items", "runs", "mission-groups"] as const) {
    const f = RESOURCES[path].fields;
    assert.ok(writableFields(f, "create").includes("campaign_id"), path);
    assert.ok(!writableFields(f, "update").includes("campaign_id"), path);
  }
});

test("every resource exposes a read-only version for If-Match", () => {
  for (const spec of Object.values(RESOURCES)) {
    const v = (spec.fields as Record<string, { type: string; readonly?: string }>)["version"];
    assert.ok(v && v.type === "integer" && v.readonly, `${spec.path} has no version field`);
  }
});

test("every read-only field says why", () => {
  for (const spec of Object.values(RESOURCES)) {
    for (const [name, f] of Object.entries(spec.fields)) {
      if ("readonly" in f) assert.ok(typeof f.readonly === "string" && f.readonly.length > 8, `${spec.path}.${name}`);
    }
  }
});

test("role policy per resource is pinned", () => {
  const P = ["FLEET_LEAD", "PM"], L = ["FLEET_LEAD"], A = ["FLEET_LEAD", "PM", "ROBOT_OPERATOR"];
  const expected: Record<string, [string[], string[], string[]]> = {
    campaigns: [A, P, L], "mission-groups": [A, P, P], missions: [A, P, P],
    robots: [A, P, L], operators: [A, P, L], labs: [A, P, L], sensors: [A, P, L],
    "sensor-rigs": [A, P, L], "inventory-items": [A, P, P], users: [A, L, L], runs: [A, A, P],
    "lab-blackouts": [A, P, P], documents: [A, A, P], workflows: [A, P, P],
  };
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(RESOURCES).sort());
  for (const [path, [read, write, del]] of Object.entries(expected)) {
    const r = RESOURCES[path as keyof typeof RESOURCES].roles;
    assert.deepEqual([[...r.read].sort(), [...r.write].sort(), [...r.delete].sort()], [read, write, del], path);
  }
});

// ---------------------------------------------------------------- validation
const labs = RESOURCES.labs.fields;

test("validation: a bad enum value is named with the allowed values", () => {
  assert.deepEqual(validateBody(labs, { type: "BASEMENT" }, "update"), [
    { field: "type", message: "must be one of LAB_BAY, OFFICE, OUTDOORS" },
  ]);
});

test("validation: required fields on create, not on update", () => {
  assert.deepEqual(validateBody(labs, {}, "create").map((e) => e.field), ["name"]);
  assert.deepEqual(validateBody(labs, {}, "update"), []);
  assert.deepEqual(validateBody(labs, { name: "" }, "create").map((e) => e.field), ["name"]);
});

test("validation: numbers, booleans, dates, lists", () => {
  assert.equal(validateBody(labs, { capacity: 4 }, "update").length, 0);
  assert.equal(validateBody(labs, { capacity: "4" }, "update").length, 0, "form fields send numeric strings");
  assert.deepEqual(validateBody(labs, { capacity: 2.5 }, "update").map((e) => e.message), ["must be a whole number"]);
  assert.deepEqual(validateBody(labs, { capacity: -1 }, "update").map((e) => e.message), ["must be at least 0"]);
  assert.equal(validateBody(labs, { is_available: false }, "update").length, 0);
  assert.equal(validateBody(labs, { is_available: "yes" }, "update").length, 1);
  const robots = RESOURCES.robots.fields;
  assert.equal(validateBody(robots, { commissioned_date: "2026-09-11" }, "update").length, 0);
  assert.equal(validateBody(robots, { commissioned_date: null }, "update").length, 0);
  assert.equal(validateBody(robots, { commissioned_date: "" }, "update").length, 0, "blank form date clears it");
  assert.equal(validateBody(robots, { commissioned_date: "11/09/2026" }, "update").length, 1);
  assert.equal(validateBody(RESOURCES.runs.fields, { mission_ids: ["a", "b"] }, "update").length, 0);
  assert.equal(validateBody(RESOURCES.runs.fields, { mission_ids: "a" }, "update").length, 1);
});

test("validation: read-only and unknown keys are ignored, so echoing a record back still works", () => {
  assert.deepEqual(validateBody(RESOURCES.runs.fields, { state: "NOT_A_STATE", whatever: 1 }, "update"), []);
});

test("validation: non-nullable fields reject null", () => {
  assert.deepEqual(validateBody(labs, { capacity: null }, "update").map((e) => e.message), ["may not be null"]);
});

test("labels read naturally", () => {
  assert.equal(labelFor("LAB_BAY"), "Lab bay");
  assert.equal(labelFor("PM"), "PM");
  assert.equal(labelFor("LIDAR_3D"), "3D LiDAR");
});
