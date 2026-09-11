/**
 * Deployment settings: validation, and that the domain rules honour them.
 * Run with `npm --prefix api test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { SETTING_DEFAULTS, validateSettings, type Settings } from "../../packages/contracts/src/index.ts";
import {
  assessRisk, effortUnits, isValidSlotTime, isWorkDay, sessionCompositionIssues, type MissionLike,
} from "../src/domain.ts";

const withRules = (patch: Partial<Settings>): Settings => ({ ...structuredClone(SETTING_DEFAULTS), ...patch });
const fields = (s: Settings) => validateSettings(s).map((e) => e.field);

test("the stock defaults are valid", () => {
  assert.deepEqual(validateSettings(SETTING_DEFAULTS), []);
});

test("per-value validation", () => {
  assert.deepEqual(fields(withRules({ "scheduling.run_effort_budget": 0 })), ["scheduling.run_effort_budget"]);
  assert.deepEqual(fields(withRules({ "scheduling.slot_step_minutes": 7 })), ["scheduling.slot_step_minutes"]);
  assert.deepEqual(fields(withRules({ "scheduling.work_days": [] })), ["scheduling.work_days"]);
  assert.deepEqual(fields(withRules({ "scheduling.work_days": [1, 8] })), ["scheduling.work_days"]);
  assert.deepEqual(fields(withRules({ "scheduling.first_start": "25:00" })), ["scheduling.first_start"]);
  assert.deepEqual(
    fields(withRules({ "scheduling.effort_units": { SHORT: 1, MEDIUM: 2, LONG: 4 } as Settings["scheduling.effort_units"] })),
    ["scheduling.effort_units"],
  );
  assert.deepEqual(fields(withRules({ "risk.high_hazard_terms": ["ok", ""] })), ["risk.high_hazard_terms"]);
});

test("cross-field validation", () => {
  assert.deepEqual(fields(withRules({ "scheduling.run_effort_floor": 5 })), ["scheduling.run_effort_floor"]);
  assert.deepEqual(fields(withRules({ "scheduling.first_start": "19:00" })), ["scheduling.first_start", "scheduling.default_slots", "scheduling.default_slots", "scheduling.default_slots", "scheduling.default_slots"]);
  assert.deepEqual(fields(withRules({ "scheduling.default_slots": ["07:00"] })), ["scheduling.default_slots"]);
  assert.deepEqual(fields(withRules({ "scheduling.default_slots": ["09:15"] })), ["scheduling.default_slots"]);
  assert.deepEqual(fields(withRules({ "scheduling.default_slots": ["09:15"], "scheduling.slot_step_minutes": 15 })), []);
});

test("stock rules reproduce the original behaviour", () => {
  assert.equal(effortUnits("LONG"), 4);
  assert.equal(effortUnits(null), 1);
  assert.ok(isValidSlotTime("08:00") && isValidSlotTime("18:00") && isValidSlotTime("09:30"));
  assert.ok(!isValidSlotTime("07:30") && !isValidSlotTime("18:30") && !isValidSlotTime("09:15"));
  assert.ok(isWorkDay("2026-09-11"));   // Friday
  assert.ok(!isWorkDay("2026-09-13"));  // Sunday
  assert.equal(assessRisk({ name: "Forklift pick", instructions: [] }).risk_level, "HIGH");
});

const mission = (duration: MissionLike["duration_type"]): MissionLike => ({
  id: duration, mission_code: duration, name: duration, instructions_complete: true,
  risk_level: "LOW", legal_approval: "NONE", review_status: "APPROVED", duration_type: duration, variants: [{}],
});

test("custom rules change the answers", () => {
  const rules = withRules({
    "scheduling.effort_units": { SHORT: 1, MEDIUM: 3, LONG: 6, UNSPECIFIED: 1 },
    "scheduling.run_effort_budget": 6,
    "scheduling.run_effort_floor": 3,
    "scheduling.slot_step_minutes": 15,
    "scheduling.first_start": "06:00",
    "scheduling.work_days": [6, 7],
    "risk.high_hazard_terms": ["welding"],
    "risk.potential_hazard_terms": [],
  });
  assert.equal(effortUnits("LONG", rules), 6);
  assert.ok(isValidSlotTime("06:15", rules));
  assert.ok(isWorkDay("2026-09-13", rules));
  assert.ok(!isWorkDay("2026-09-11", rules));

  // Five SHORT missions are 5 units: over the stock budget of 4, inside a budget of 6.
  const fiveShort = Array.from({ length: 5 }, () => mission("SHORT"));
  assert.deepEqual(sessionCompositionIssues(fiveShort, rules), []);
  assert.match(sessionCompositionIssues(fiveShort)[0]!.reason, /over effort budget: 5\/4/);
  // A LONG weighs 6 under these rules and still fits.
  assert.deepEqual(sessionCompositionIssues([mission("LONG")], rules), []);
  // The floor follows the setting.
  assert.match(sessionCompositionIssues([mission("SHORT")], rules)[0]!.reason, /at least 3/);

  assert.equal(assessRisk({ name: "Forklift pick", instructions: [] }, rules).risk_level, "LOW");
  assert.equal(assessRisk({ name: "Welding cell", instructions: [] }, rules).risk_level, "HIGH");
});
