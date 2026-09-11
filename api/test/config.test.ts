/**
 * Config bundles: planning a bundle against a deployment's state, and the JSON
 * Schemas generated from the registry. Run with `npm --prefix api test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONFIG_FORMAT, CONFIG_RESOURCES, LAB_TYPES, SETTING_DEFAULTS, SETTING_KEYS, configSchemas,
  type ConfigResource,
} from "../../packages/contracts/src/index.ts";
import { planConfig, planDigest, type ConfigState } from "../src/config.ts";

const empty = () => Object.fromEntries(CONFIG_RESOURCES.map((r) => [r, []])) as unknown as Record<ConfigResource, Record<string, unknown>[]>;

const state = (): ConfigState => {
  const records = empty();
  records.labs = [
    { id: "L1", version: 3, name: "Bay", type: "LAB_BAY", is_available: true, capacity: 2, code_number: 1 },
    { id: "L2", version: 1, name: "Yard", type: "OUTDOORS", is_available: true, capacity: 1, code_number: 2 },
  ];
  records["lab-blackouts"] = [{ id: "B1", version: 1, lab_id: "L1", blackout_date: "2030-01-01", slot_time: null, reason: null }];
  return {
    records,
    settings: structuredClone(SETTING_DEFAULTS),
    workflows: [{ id: "w1", name: "Flow", xml: "<x/>", version: 2 }],
  };
};

const exported = (s: ConfigState) =>
  structuredClone({ format: CONFIG_FORMAT, settings: s.settings, records: s.records, workflows: s.workflows });

test("an unchanged export plans no changes", () => {
  const s = state();
  const plan = planConfig(exported(s), s);
  assert.deepEqual(plan, { problems: [], records: [], settings: [], workflows: [] });
});

test("the format is required", () => {
  assert.match(planConfig({ records: {} }, state()).problems[0]!, /format must be/);
  assert.match(planConfig([], state()).problems[0]!, /JSON object/);
});

test("updates carry only changed fields, pinned to the exported version", () => {
  const s = state();
  const b = exported(s);
  b.records.labs[0]!["capacity"] = 5;
  b.records.labs[0]!["name"] = "Bay"; // unchanged
  const plan = planConfig(b, s);
  assert.deepEqual(plan.records, [{ resource: "labs", op: "update", id: "L1", data: { capacity: 5 }, if_match: 3 }]);
});

test("object key order does not count as a change", () => {
  const s = state();
  s.records.missions = [{ id: "M1", version: 1, campaign_id: "C1", mission_code: "M-1", instructions: [{ a: 1, b: 2 }] }];
  const b = exported(s);
  b.records.missions[0]!["instructions"] = [{ b: 2, a: 1 }];
  assert.deepEqual(planConfig(b, s).records, []);
});

test("creates keep refs, parents come first, and natural keys stop duplicates", () => {
  const s = state();
  const b = exported(s);
  b.records["lab-blackouts"].push({ lab_id: "$ref:dock", blackout_date: "2030-02-02" });
  b.records.labs.push({ ref: "dock", name: "Dock", type: "LAB_BAY" });
  const plan = planConfig(b, s);
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.records.map((r) => `${r.op} ${r.resource} ${r.ref ?? ""}`.trim()), ["create labs dock", "create lab-blackouts"]);

  const dup = exported(s);
  dup.records.labs.push({ name: "Yard", type: "OUTDOORS" }, { name: "New", type: "LAB_BAY" }, { name: "New" });
  const problems = planConfig(dup, s).problems.join("\n");
  assert.match(problems, /labs\[2\]: a labs record with name "Yard" already exists \(id L2\)/);
  assert.match(problems, /labs\[4\]: two new labs records have name "New"/);
});

test("unknown ids, repeated ids and unknown record types are named", () => {
  const s = state();
  const b = exported(s) as Record<string, unknown> & ReturnType<typeof exported>;
  b.records.labs.push({ id: "L9", name: "Ghost" }, { id: "L1", name: "Again" });
  (b.records as Record<string, unknown>)["spaceships"] = [];
  const problems = planConfig(b, s).problems.join("\n");
  assert.match(problems, /L9 does not exist here/);
  assert.match(problems, /labs L1 appears twice/);
  assert.match(problems, /records\.spaceships is not a record type/);
});

test("nothing is deleted without prune; prune deletes children before parents", () => {
  const s = state();
  const b = exported(s);
  b.records.labs = [];
  b.records["lab-blackouts"] = [];
  assert.deepEqual(planConfig(b, s).records, []);
  const pruned = planConfig(b, s, { prune: true }).records;
  assert.deepEqual(pruned.map((r) => `${r.op} ${r.resource} ${r.id} ${r.if_match}`), [
    "delete lab-blackouts B1 1", "delete labs L1 3", "delete labs L2 1",
  ]);
});

test("record types left out of a bundle are not pruned", () => {
  const s = state();
  const b = { format: CONFIG_FORMAT, records: { labs: s.records.labs } };
  assert.deepEqual(planConfig(b, s, { prune: true }).records, []);
});

test("settings: diffs are listed and validated together", () => {
  const s = state();
  const b = exported(s);
  b.settings["scheduling.run_effort_budget"] = 6;
  assert.deepEqual(planConfig(b, s).settings, [{ key: "scheduling.run_effort_budget", from: 4, to: 6 }]);

  b.settings["scheduling.run_effort_floor"] = 9;
  assert.match(planConfig(b, s).problems.join(), /run_effort_floor cannot exceed the run effort budget/);
  assert.match(planConfig({ format: CONFIG_FORMAT, settings: { "nope.key": 1 } }, s).problems.join(), /settings\.nope\.key is not a setting/);
});

test("workflows: rename and diagram changes, stale versions, creates and prune", () => {
  const s = state();
  const b = exported(s);
  b.workflows[0]!.name = "Renamed";
  b.workflows.push({ name: "New", xml: "<y/>" } as never);
  const plan = planConfig(b, s);
  assert.deepEqual(plan.workflows, [
    { op: "update", id: "w1", name: "Renamed", xml_changed: false, name_changed: true, if_match: 2 },
    { op: "create", id: null, name: "New", xml: "<y/>", xml_changed: true, name_changed: true },
  ]);

  const stale = exported(s);
  stale.workflows[0]!.version = 1;
  stale.workflows[0]!.xml = "<z/>";
  assert.match(planConfig(stale, s).problems.join(), /now at version 2, not 1/);

  assert.deepEqual(planConfig({ format: CONFIG_FORMAT, workflows: [] }, s, { prune: true }).workflows.map((w) => w.op), ["delete"]);
});

test("the digest follows the changes", async () => {
  const s = state();
  const b = exported(s);
  b.records.labs[0]!["capacity"] = 5;
  const one = await planDigest(planConfig(b, s));
  assert.equal(one, await planDigest(planConfig(structuredClone(b), s)));
  b.records.labs[0]!["capacity"] = 6;
  assert.notEqual(one, await planDigest(planConfig(b, s)));
  assert.match(one, /^[0-9a-f]{64}$/);
});

test("schemas cover every file and follow the registry", () => {
  const schemas = configSchemas();
  for (const r of CONFIG_RESOURCES) assert.ok(schemas[`records/${r}.json`], r);
  assert.ok(schemas["settings.json"] && schemas["workflows/index.json"] && schemas["bundle.json"]);

  const lab = (schemas["records/labs.json"] as { items: { properties: Record<string, Record<string, unknown>>; additionalProperties: boolean } }).items;
  assert.deepEqual(lab.properties["type"]!["enum"], [...LAB_TYPES]);
  assert.deepEqual(lab.properties["code_number"]!["type"], ["integer", "null"]);
  assert.equal(lab.additionalProperties, false);

  const mission = (schemas["records/missions.json"] as { items: { properties: Record<string, unknown> } }).items.properties;
  assert.ok("campaign_id" in mission, "parents are settable on create");
  assert.ok(!("is_ready" in mission), "derived fields are not in the files");

  const settings = (schemas["settings.json"] as { properties: Record<string, unknown> }).properties;
  assert.deepEqual(Object.keys(settings), SETTING_KEYS);
});
