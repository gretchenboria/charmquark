/**
 * Domain rules — the parts of CharmQuark that are policy rather than plumbing.
 *
 * Everything here is PURE: functions take already-resolved records and return
 * plain data, so they are trivially unit-testable and there is exactly one
 * definition of "eligible", evaluated per slot.
 */

// Type-only: erased at runtime, so the seed generator (plain node) is unaffected.
import type { MissionDuration, RiskLevel } from "../../packages/contracts/src/index.ts";
export type { MissionDuration, RiskLevel };

// ---------------------------------------------------------------- effort budget

/**
 * Effort weight in run-budget units. UNSPECIFIED defaults to 1 so un-sized
 * legacy missions are never retroactively blocked.
 */
export const EFFORT_UNITS: Record<MissionDuration, number> = {
  SHORT: 1,
  MEDIUM: 2,
  LONG: 4,
  UNSPECIFIED: 1,
};

/** A run holds 4 effort units: 1 long = 2 medium = 4 short (~1 hour). */
export const RUN_EFFORT_BUDGET = 4;

export const effortUnits = (d: string | null | undefined): number =>
  EFFORT_UNITS[(d ?? "UNSPECIFIED") as MissionDuration] ?? 1;

// ---------------------------------------------------------------- time slots
/** Default slot starts (one-hour runs). */
export const DEFAULT_SLOTS = ["09:00", "11:00", "13:00", "15:00"] as const;

/** The pre-generated grid: hourly starts across the weekday working window. */
export const HOURLY_SLOTS = Array.from({ length: 10 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`);

const MIN_MINUTES = 8 * 60;  // 08:00
const MAX_MINUTES = 18 * 60; // 18:00 (last start)

/** True Mon–Fri. `d` is an ISO yyyy-mm-dd date. */
export function isWeekday(d: string): boolean {
  const day = new Date(`${d}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

/** True if t is null (unscheduled) or a valid HH:MM on the 30-min grid in-window. */
export function isValidSlotTime(t: string | null | undefined): boolean {
  if (t === null || t === undefined) return true;
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return false;
  const [, hh, mm] = m;
  if (mm !== "00" && mm !== "30") return false;
  const minutes = Number(hh) * 60 + Number(mm);
  return minutes >= MIN_MINUTES && minutes <= MAX_MINUTES;
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
 * Lexicons are tuned for robot field operations rather than a kitchen.
 */
const HIGH_HAZARD = [
  "high voltage", "voltage", "electr", "lithium", "battery fire", "thermal runaway",
  "laser", "class 3", "class 4", "radiation", "pinch point", "crush", "pinch",
  "amputation", "hydraulic", "pneumatic", "pressurized", "chemical", "solvent",
  "overhead load", "suspended load", "height", "ladder", "roof", "confined space",
  "public road", "traffic", "moving vehicle", "forklift", "unguarded",
];
const POTENTIAL_HAZARD = [
  "teleop", "autonomous", "untethered", "outdoor", "wet", "water", "slip", "incline",
  "ramp", "stairs", "payload", "gripper", "manipulator", "arm", "actuator", "collision",
  "obstacle", "crowd", "bystander", "human-in-the-loop", "handover", "lift", "carry",
  "tool change", "spinning", "rotating", "heat", "hot",
];

/** Risk levels that require a Fleet-Lead legal approval before scheduling. */
export const NEEDS_LEGAL_REVIEW: readonly RiskLevel[] = ["HIGH", "POTENTIAL", "UNKNOWN"];

export interface RiskAssessment {
  risk_level: RiskLevel;
  rationale: string;
  matched_terms: string[];
  needs_legal_review: boolean;
}

export function assessRisk(mission: { name: string; instructions: unknown[] }): RiskAssessment {
  const parts: string[] = [mission.name ?? ""];
  for (const step of mission.instructions ?? []) {
    if (step && typeof step === "object" && "text" in step) parts.push(String((step as { text: unknown }).text ?? ""));
    else parts.push(String(step));
  }
  const text = parts.join(" ").toLowerCase();

  const high = HIGH_HAZARD.filter((w) => text.includes(w));
  if (high.length) {
    return {
      risk_level: "HIGH",
      rationale: `High-hazard terms found: ${high.join(", ")}. Requires legal review.`,
      matched_terms: high,
      needs_legal_review: true,
    };
  }
  const pot = POTENTIAL_HAZARD.filter((w) => text.includes(w));
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
 * Effort-budget rule (1 long = 2 medium = 4 short):
 *   - an empty run fails;
 *   - FLOOR: a valid run needs at least 2 units ("two short missions or one long");
 *   - CEILING: at most RUN_EFFORT_BUDGET (4) units.
 * The floor is skipped when every mission is un-sized, so legacy/single-mission flows
 * are not retroactively blocked until an effort level is set.
 */
export function sessionCompositionIssues(missions: MissionLike[]): ReadinessIssue[] {
  if (missions.length === 0) return [{ member: "mission", reason: "no missions assigned" }];
  const units = missions.reduce((sum, t) => sum + effortUnits(t.duration_type), 0);
  const sized = missions.some((t) => (t.duration_type ?? "UNSPECIFIED") !== "UNSPECIFIED");
  if (units > RUN_EFFORT_BUDGET) {
    return [{
      member: "mission",
      reason: `over effort budget: ${units}/${RUN_EFFORT_BUDGET} units (1 long = 2 medium = 4 short)`,
    }];
  }
  if (sized && units < 2) {
    return [{
      member: "mission",
      reason: `under minimum: needs at least 2 effort units (two short missions or one long); has ${units}`,
    }];
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
}): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  issues.push(...sessionCompositionIssues(args.missions));
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
