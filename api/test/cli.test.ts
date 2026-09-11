/**
 * The customer config CLI (templates/customer-config/cq.mjs): files round-trip a
 * bundle, the local validator catches what the API would refuse, and plans print.
 * Run with `npm --prefix api test`.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { CONFIG_FORMAT, configSchemas } from "../../packages/contracts/src/index.ts";
// @ts-expect-error: plain JavaScript shipped to customers
import { formatPlan, readBundle, slug, validateDir, validateValue, writeBundle } from "../../templates/customer-config/cq.mjs";

const bundle = {
  format: CONFIG_FORMAT,
  settings: { "scheduling.run_effort_budget": 4 },
  records: {
    labs: [{ id: "L1", version: 2, name: "Bay", type: "LAB_BAY", is_available: true, capacity: 2, code_number: null }],
    robots: [],
  },
  workflows: [
    { id: "w1", version: 1, name: "Handle a blocker", xml: "<a/>" },
    { id: "w2", version: 3, name: "Handle a blocker", xml: "<b/>" },
  ],
};

test("files round-trip a bundle, with unique workflow file names", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cq-"));
  try {
    await writeBundle(dir, bundle, configSchemas());
    const index = JSON.parse(await readFile(join(dir, "workflows", "index.json"), "utf8"));
    assert.deepEqual(index.map((w: { file: string }) => w.file), ["handle-a-blocker.bpmn", "handle-a-blocker-2.bpmn"]);
    assert.deepEqual(await readBundle(dir), bundle);
    const editor = JSON.parse(await readFile(join(dir, ".vscode", "settings.json"), "utf8"));
    assert.ok(editor["json.schemas"].some((s: { url: string }) => s.url === "./schemas/records/labs.json"));
    assert.deepEqual(await validateDir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("local validation catches bad values and fields you cannot set", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cq-"));
  try {
    await writeBundle(dir, bundle, configSchemas());
    const labs = [{ id: "L1", name: "Bay", type: "BASEMENT", capacity: -1, is_ready: true }];
    await writeFile(join(dir, "records", "labs.json"), JSON.stringify(labs));
    await writeFile(join(dir, "records", "spaceships.json"), "[]");
    const problems = (await validateDir(dir)).join("\n");
    assert.match(problems, /records\/labs\.json \[0\]\.type: must be one of/);
    assert.match(problems, /\[0\]\.capacity: must be at least 0/);
    assert.match(problems, /is_ready is not a field you can set here/);
    assert.match(problems, /records\/spaceships\.json: no schema/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the validator handles nullable, integer and nested types", () => {
  assert.deepEqual(validateValue({ type: ["integer", "null"] }, null), []);
  assert.deepEqual(validateValue({ type: ["integer", "null"] }, 2.5), ["$: must be integer or null"]);
  assert.deepEqual(validateValue({ type: "array", items: { type: "string" } }, ["a", 1]), ["$[1]: must be string"]);
  assert.equal(slug("  Mission / Ready!! "), "mission-ready");
});

test("plans print as a readable diff", () => {
  const text = formatPlan({
    ok: false, problem_count: 1,
    summary: { create: 1, update: 1, delete: 0, settings: 1, workflows: 1 },
    records: [
      { resource: "labs", op: "create", ref: "dock", diff: { name: { from: null, to: "Dock" } }, problems: [] },
      { resource: "labs", op: "update", id: "L1", diff: { capacity: { from: 2, to: 3 } }, problems: ["version conflict"] },
    ],
    settings: [{ key: "scheduling.run_effort_budget", from: 4, to: 6 }],
    workflows: [{ op: "update", id: "w1", name: "Flow", xml_changed: true, name_changed: false }],
    problems: [],
  });
  assert.match(text, /\+ labs \(new, ref dock\)\n {4}name: "Dock"/);
  assert.match(text, /~ labs L1\n {4}capacity: 2 → 3\n {4}! version conflict/);
  assert.match(text, /~ setting scheduling\.run_effort_budget: 4 → 6/);
  assert.match(text, /~ workflow "Flow" w1 \(diagram changed\)/);
  assert.match(text, /Not applicable/);
});
