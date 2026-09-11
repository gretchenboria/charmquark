/**
 * Domain rules — the parts of CharmQuark that are policy rather than plumbing.
 *
 * Everything here is PURE: functions take already-resolved records and return
 * plain data, so they are trivially unit-testable and there is exactly one
 * definition of "eligible", evaluated per slot.
 *
 * The tunable numbers (effort units, run budget and floor, the working window,
 * the hazard lexicon) are deployment settings (packages/contracts/src/settings.ts).
 * Functions take them as an argument and default to the stock values, so a
 * caller that passes nothing gets exactly the original behaviour.
 */
import type { MissionDuration, RiskLevel, Settings } from "../../packages/contracts/src/index.ts";
import { SETTING_DEFAULTS } from "../../packages/contracts/src/settings.ts";

export type { MissionDuration, RiskLevel, Settings };

// ---------------------------------------------------------------- effort budget
/**
 * Stock effort weights in run-budget units. UNSPECIFIED defaults to 1 so un-sized
 * legacy missions are never retroactively blocked.
 */
export const EFFORT_UNITS: Record<MissionDuration, number> = SETTING_DEFAULTS["scheduling.effort_units"];

/** Stock budget: a run holds 4 effort units — 1 long = 2 medium = 4 short (~1 hour). */
export const RUN_EFFORT_BUDGET = SETTING_DEFAULTS["scheduling.run_effort_budget"];

export const effortUnits = (d: string | null | undefined, rules: Settings = SETTING_DEFAULTS): number =>
  rules["scheduling.effort_units"][(d ?? "UNSPECIFIED") as MissionDuration] ?? 1;

// ---------------------------------------------------------------- time slots
/** Stock slot starts (one-hour runs). */
export const DEFAULT_SLOTS = SETTING_DEFAULTS["scheduling.default_slots"];

/** The pre-generated grid: hourly starts across the weekday working window. */
export const HOURLY_SLOTS = Array.from({ length: 10 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`);

const toMinutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** True when `d` (ISO yyyy-mm-dd) falls on a configured working day, in UTC. */
export function isWorkDay(d: string, rules: Settings = SETTING_DEFAULTS): boolean {
  const iso = new Date(`${d}T00:00:00Z`).getUTCDay() || 7; // Mon=1 … Sun=7
  return rules["scheduling.work_days"].includes(iso);
}

/** True Mon–Fri. Kept for callers that mean the calendar week, not the configured one. */
export const isWeekday = (d: string): boolean => isWorkDay(d, SETTING_DEFAULTS);

/** True if t is null (unscheduled) or a valid HH:MM on the configured grid, inside the working window. */
export function isValidSlotTime(t: string | null | undefined, rules: Settings = SETTING_DEFAULTS): boolean {
  if (t === null || t === undefined) return true;
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const minutes = toMinutes(t);
  if (Number(t.slice(3, 5)) > 59) return false;
  if (minutes % rules["scheduling.slot_step_minutes"] !== 0) return false;
  return minutes >= toMinutes(rules["scheduling.first_start"]) && minutes <= toMinutes(rules["scheduling.last_start"]);
}

// ---------------------------------------------------------------- run codes
/**
 * Two-phase run code.
 *   Phase A — provisional: a date-to-the-day stub used while a slot is assembled.
 *   Phase B — encoded: on confirmation, encodes year/week/operator/lab/sequence.
 * Pure functions so the convention lives in one place.
 */
export function provisionalCode(slotDate: string | null): string {
  if (!slotDate) return "S-unscheduled";
  return `S-${slotDate.replaceAll("-", "")}`;
}

/** ISO-8601 week number for an ISO date string. */
export function isoWeek(slotDate: string): number {
  const d = new Date(`${slotDate}T00:00:00Z`);
  // Shift to the Thursday of this ISO week, then count weeks from Jan 4.
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

/** e.g. 26W17m3L1S1 — year(2), ISO week, operator, lab, run sequence. */
export function encodedCode(args: {
  slotDate: string;
  operatorNumber: number;
  labNumber: number;
  runSeq: number;
}): string {
  const yy = args.slotDate.slice(2, 4);
  return `${yy}W${isoWeek(args.slotDate)}m${args.operatorNumber}L${args.labNumber}S${args.runSeq}`;
}

// ---------------------------------------------------------------- risk calculator
/**
 * A lean, explainable heuristic that flags potentially hazardous missions. No ML:
 * it scans the mission name + instruction text for hazard signals and suggests a
 * RiskLevel with a human-readable rationale. POTENTIAL/HIGH route to Fleet-Lead
 * legal review. It never auto-approves — a person always gives the verdict.
 *
 * The lexicons are deployment settings (risk.high_hazard_terms,
 * risk.potential_hazard_terms), tuned by default for robot field operations.
 */

/** Risk levels that require a Fleet-Lead legal approval before scheduling. */
export const NEEDS_LEGAL_REVIEW: readonly RiskLevel[] = ["HIGH", "POTENTIAL", "UNKNOWN"];

export interface RiskAssessment {
  risk_level: RiskLevel;
  rationale: string;
  matched_terms: string[];
  needs_legal_review: boolean;
}

export function assessRisk(
  mission: { name: string; instructions: unknown[] },
  rules: Settings = SETTING_DEFAULTS,
): RiskAssessment {
  const parts: string[] = [mission.name ?? ""];
  for (const step of mission.instructions ?? []) {
    if (step && typeof step === "object" && "text" in step) parts.push(String((step as { text: unknown }).text ?? ""));
    else parts.push(String(step));
  }
  const text = parts.join(" ").toLowerCase();

  const high = rules["risk.high_hazard_terms"].filter((w) => text.includes(w.toLowerCase()));
  if (high.length) {
    return {
      risk_level: "HIGH",
      rationale: `High-hazard terms found: ${high.join(", ")}. Requires legal review.`,
      matched_terms: high,
      needs_legal_review: true,
    };
  }
  const pot = rules["risk.potential_hazard_terms"].filter((w) => text.includes(w.toLowerCase()));
  if (pot.length) {
    return {
      risk_level: "POTENTIAL",
      rationale: `Potential-hazard terms found: ${pot.join(", ")}. Flag for legal review.`,
      matched_terms: pot,
      needs_legal_review: true,
    };
  }
  return {
    risk_level: "LOW",
    rationale: "No hazard signals detected in mission name or instructions.",
    matched_terms: [],
    needs_legal_review: false,
  };
}

// ---------------------------------------------------------------- readiness
export interface ReadinessIssue {
  /** "mission" | "robot" | "operator" | "lab" | "sensor_rig" | "inventory" */
  member: string;
  reason: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** "auto" = system-derived (pre-populated); "manual" = a person must tick it. */
  source: "auto" | "manual";
}

const item = (key: string, label: string, done: boolean, source: "auto" | "manual"): ChecklistItem => ({
  key,
  label,
  done: Boolean(done),
  source,
});

const INVENTORY_READY = ["AVAILABLE"];

// --- shapes the readiness engine consumes (structural, not ORM-bound) ---
export interface MissionLike {
  id: string;
  mission_code: string;
  name: string;
  instructions_complete: boolean;
  risk_level: RiskLevel;
  legal_approval: "NONE" | "PENDING" | "APPROVED";
  review_status: "DRAFT" | "PENDING_PM_REVIEW" | "APPROVED" | "UNAVAILABLE";
  duration_type: MissionDuration;
  variants: unknown[];
}
export interface RobotLike {
  robot_code: string;
  safety_certified: boolean;
  calibration_valid: boolean;
  commissioned: boolean;
}
export interface OperatorLike { operator_code: string; is_active: boolean }
export interface LabLike { name: string; is_available: boolean; capacity: number }
export interface FleetLike { name: string; sensor_ids: string[] }
export interface SensorLike { asset_name: string; status: string }
export interface InventoryLike { name: string; status: string }

const riskOk = (t: MissionLike): boolean => t.risk_level === "LOW" || t.legal_approval === "APPROVED";

/**
 * Robot mission clearance. All three gates are MANUAL today: safety certification,
 * calibration validity and commissioning live in systems that are not yet
 * integrated, so an operator marks each one by hand.
 */
export function robotChecklist(r: RobotLike): ChecklistItem[] {
  return [
    item("safety_certified", "Safety certification current", r.safety_certified, "manual"),
    item("calibration_valid", "Sensor calibration valid", r.calibration_valid, "manual"),
    item("commissioned", "Commissioned (in service)", r.commissioned, "manual"),
  ];
}

/** Mission readiness. Variants / risk / inventory are auto-derived; the rest are ticked. */
export function taskChecklist(t: MissionLike, inventory: InventoryLike[] | null = null): ChecklistItem[] {
  const items: ChecklistItem[] = [
    item("instructions_complete", "Instructions complete", t.instructions_complete, "manual"),
    item("variants", "Variants defined", t.variants.length > 0, "auto"),
    item("risk_cleared", "Risk cleared (low or legal-approved)", riskOk(t), "auto"),
  ];
  if (inventory !== null) {
    const ready = inventory.every((i) => INVENTORY_READY.includes(i.status));
    items.push(item("inventory_ready", "All tools/parts/consumables ready", ready, "auto"));
  }
  items.push(item("available", "Not marked unavailable", t.review_status !== "UNAVAILABLE", "manual"));
  return items;
}

// ------------------------------------------------------------------ per-member
export function taskIssues(t: MissionLike, inventory: InventoryLike[] | null = null): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const code = t.mission_code || "mission";

  if (!t.instructions_complete) issues.push({ member: "mission", reason: `${code}: instructions incomplete` });

  if (!riskOk(t)) {
    const needs = NEEDS_LEGAL_REVIEW.includes(t.risk_level);
    const detail = needs ? "needs legal approval (Fleet Lead)" : "needs legal approval";
    issues.push({ member: "mission", reason: `${code}: ${t.risk_level.toLowerCase()} risk ${detail}` });
  }

  if (t.variants.length === 0) issues.push({ member: "mission", reason: `${code}: no variants defined` });

  if (t.review_status === "UNAVAILABLE") issues.push({ member: "mission", reason: `${code}: marked unavailable` });

  if (inventory !== null) {
    for (const i of inventory) {
      if (!INVENTORY_READY.includes(i.status)) {
        issues.push({ member: "inventory", reason: `${code} needs ${i.name}: ${i.status.toLowerCase()} (not ready)` });
      }
    }
  }
  return issues;
}

export function robotIssues(r: RobotLike | null): ReadinessIssue[] {
  if (!r) return [{ member: "robot", reason: "no robot assigned" }];
  const reasons: string[] = [];
  if (!r.safety_certified) reasons.push("safety certification not current");
  if (!r.commissioned) reasons.push("not commissioned (out of service)");
  if (!r.calibration_valid) reasons.push("sensor calibration invalid or expired");
  return reasons.map((reason) => ({ member: "robot", reason: `${r.robot_code}: ${reason}` }));
}

export function operatorIssues(op: OperatorLike | null, conflictCount = 0): ReadinessIssue[] {
  if (!op) return [{ member: "operator", reason: "no operator assigned" }];
  const issues: ReadinessIssue[] = [];
  if (!op.is_active) issues.push({ member: "operator", reason: `${op.operator_code}: inactive` });
  if (conflictCount > 0) {
    issues.push({ member: "operator", reason: `${op.operator_code}: double-booked for this slot` });
  }
  return issues;
}

export function labIssues(lab: LabLike | null, used = 0, blackedOut = false): ReadinessIssue[] {
  if (!lab) return [{ member: "lab", reason: "no lab assigned" }];
  const issues: ReadinessIssue[] = [];
  if (!lab.is_available) issues.push({ member: "lab", reason: `${lab.name}: unavailable` });
  if (blackedOut) {
    issues.push({ member: "lab", reason: `${lab.name}: blocked for this day/slot (maintenance or closure)` });
  }
  if (used >= lab.capacity) {
    issues.push({ member: "lab", reason: `${lab.name}: at capacity (${used}/${lab.capacity})` });
  }
  return issues;
}

export function sensorRigIssues(fleet: FleetLike | null, sensors: SensorLike[]): ReadinessIssue[] {
  if (!fleet) return [{ member: "sensor_rig", reason: "no sensor fleet assigned" }];
  if (fleet.sensor_ids.length === 0) return [{ member: "sensor_rig", reason: `${fleet.name}: empty fleet` }];
  const down = sensors.filter((d) => d.status !== "OPERATIONAL").map((d) => d.asset_name);
  return down.length
    ? [{ member: "sensor_rig", reason: `${fleet.name}: not operational: ${down.join(", ")}` }]
    : [];
}

export function inventoryIssues(items: InventoryLike[]): ReadinessIssue[] {
  return items
    .filter((i) => !INVENTORY_READY.includes(i.status))
    .map((i) => ({ member: "inventory", reason: `${i.name}: ${i.status.toLowerCase()} (not ready)` }));
}

/**
 * Effort-budget rule (stock: 1 long = 2 medium = 4 short):
 *   - an empty run fails;
 *   - FLOOR: a run with sized missions needs at least `run_effort_floor` units;
 *   - CEILING: at most `run_effort_budget` units.
 * The floor is skipped when every mission is un-sized, so legacy/single-mission flows
 * are not retroactively blocked until an effort level is set.
 */
export function sessionCompositionIssues(missions: MissionLike[], rules: Settings = SETTING_DEFAULTS): ReadinessIssue[] {
  if (missions.length === 0) return [{ member: "mission", reason: "no missions assigned" }];
  const budget = rules["scheduling.run_effort_budget"];
  const floor = rules["scheduling.run_effort_floor"];
  const units = missions.reduce((sum, t) => sum + effortUnits(t.duration_type, rules), 0);
  const sized = missions.some((t) => (t.duration_type ?? "UNSPECIFIED") !== "UNSPECIFIED");
  if (units > budget) {
    return [{ member: "mission", reason: `over effort budget: ${units}/${budget} units` }];
  }
  if (sized && floor > 0 && units < floor) {
    return [{ member: "mission", reason: `under minimum: needs at least ${floor} effort units; has ${units}` }];
  }
  return [];
}

// ------------------------------------------------------------------ composite
/** Reduce every member's readiness for a specific slot into one issue list. */
export function sessionReadiness(args: {
  missions: MissionLike[];
  robot: RobotLike | null;
  operator: OperatorLike | null;
  lab: LabLike | null;
  sensorRig: FleetLike | null;
  rigSensors: SensorLike[];
  inventoryItems: InventoryLike[];
  /** mission.id -> that mission's resolved inventory, so the gate is attributed per mission. */
  missionInventory?: Record<string, InventoryLike[]> | null;
  labUsed?: number;
  operatorConflicts?: number;
  labBlackedOut?: boolean;
  rules?: Settings;
}): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  issues.push(...sessionCompositionIssues(args.missions, args.rules ?? SETTING_DEFAULTS));
  for (const t of args.missions) {
    const perMission = args.missionInventory == null ? null : (args.missionInventory[t.id] ?? []);
    issues.push(...taskIssues(t, perMission));
  }
  issues.push(...robotIssues(args.robot));
  issues.push(...operatorIssues(args.operator, args.operatorConflicts ?? 0));
  issues.push(...labIssues(args.lab, args.labUsed ?? 0, args.labBlackedOut ?? false));
  issues.push(...sensorRigIssues(args.sensorRig, args.rigSensors));
  if (args.missionInventory == null) issues.push(...inventoryIssues(args.inventoryItems));
  return issues;
}

/**
 * Hard invariant behind the Confirm button: a run may be confirmed only when
 * it has zero readiness issues (missing roles produce issues, so this implies
 * every required role is filled).
 */
export const canConfirm = (issues: ReadinessIssue[]): boolean => issues.length === 0;

// ------------------------------------------------------------------ derived mission fields
export const repsGap = (t: { reps_target: number; reps_actual: number }): number =>
  Math.max(0, (t.reps_target ?? 0) - (t.reps_actual ?? 0));

export const isMissionReady = (t: MissionLike): boolean =>
  Boolean(t.instructions_complete) && riskOk(t) && t.variants.length > 0;

/** Eligible for an automated proposal: ready, still owes reps, AVAILABLE, not unavailable. */
export const isSchedulable = (
  t: MissionLike & { reps_target: number; reps_actual: number; schedule_status: string },
): boolean =>
  isMissionReady(t) &&
  repsGap(t) > 0 &&
  t.schedule_status === "AVAILABLE" &&
  t.review_status !== "UNAVAILABLE";

/**
 * Numbered variant/error picker options carrying T#V#E# execution codes
 * (E0 = correct, E1.. = planned errors), so the UI can offer selection with no typing.
 */
export function variantOptions(missionCode: string, variants: unknown[]): unknown[] {
  const opts: unknown[] = [];
  variants.forEach((v, i) => {
    if (!v || typeof v !== "object") return;
    const vv = v as Record<string, unknown>;
    const vi = i + 1;
    const correct = (vv.correct && typeof vv.correct === "object" ? vv.correct : {}) as Record<string, unknown>;
    const errors: unknown[] = [
      { error_number: 0, label: "Correct (no error)", code: `${missionCode}V${vi}E0`, reps: correct.reps ?? null },
    ];
    const errList = Array.isArray(vv.errors) ? vv.errors : [];
    errList.forEach((e, j) => {
      const ei = j + 1;
      const eo = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      errors.push({
        error_number: ei,
        label: eo.label ?? eo.errorClass ?? `Error ${ei}`,
        code: `${missionCode}V${vi}E${ei}`,
        reps: eo.reps ?? null,
      });
    });
    opts.push({ variant_number: vi, name: vv.name ?? `Variant ${vi}`, errors });
  });
  return opts;
}
