/**
 * Deployment settings: the rules that were constants in code and differ from one
 * customer's operation to the next — how big a run is, when labs work, which
 * words flag a hazard.
 *
 * Only overrides are stored (the `settings` table); an absent key means the
 * default below. Defaults are today's behaviour exactly, so a deployment that
 * never touches settings runs unchanged. Validation is per value here and
 * across values in `validateSettings`, so an agent or a form cannot leave the
 * scheduler in an impossible state (a floor above the budget, slots outside
 * the working window).
 */
import { MISSION_DURATIONS, type MissionDuration } from "./enums.ts";
import type { FieldError } from "./fields.ts";

export interface Settings {
  "scheduling.effort_units": Record<MissionDuration, number>;
  "scheduling.run_effort_budget": number;
  "scheduling.run_effort_floor": number;
  "scheduling.default_slots": string[];
  "scheduling.first_start": string;
  "scheduling.last_start": string;
  "scheduling.slot_step_minutes": number;
  "scheduling.work_days": number[];
  "risk.high_hazard_terms": string[];
  "risk.potential_hazard_terms": string[];
  "limits.roboflow_max_images_per_export": number;
  "limits.coverage_max_cells": number;
  "agents.mcp_enabled": boolean;
  "agents.charmy_enabled": boolean;
  "agents.llm_provider": "gemini" | "anthropic";
}

export type SettingKey = keyof Settings;

export const SETTING_DEFAULTS: Settings = {
  "scheduling.effort_units": { SHORT: 1, MEDIUM: 2, LONG: 4, UNSPECIFIED: 1 },
  "scheduling.run_effort_budget": 4,
  "scheduling.run_effort_floor": 2,
  "scheduling.default_slots": ["09:00", "11:00", "13:00", "15:00"],
  "scheduling.first_start": "08:00",
  "scheduling.last_start": "18:00",
  "scheduling.slot_step_minutes": 30,
  "scheduling.work_days": [1, 2, 3, 4, 5],
  "risk.high_hazard_terms": [
    "high voltage", "voltage", "electr", "lithium", "battery fire", "thermal runaway",
    "laser", "class 3", "class 4", "radiation", "pinch point", "crush", "pinch",
    "amputation", "hydraulic", "pneumatic", "pressurized", "chemical", "solvent",
    "overhead load", "suspended load", "height", "ladder", "roof", "confined space",
    "public road", "traffic", "moving vehicle", "forklift", "unguarded",
  ],
  "risk.potential_hazard_terms": [
    "teleop", "autonomous", "untethered", "outdoor", "wet", "water", "slip", "incline",
    "ramp", "stairs", "payload", "gripper", "manipulator", "arm", "actuator", "collision",
    "obstacle", "crowd", "bystander", "human-in-the-loop", "handover", "lift", "carry",
    "tool change", "spinning", "rotating", "heat", "hot",
  ],
  "limits.roboflow_max_images_per_export": 25,
  "limits.coverage_max_cells": 512,
  "agents.mcp_enabled": true,
  "agents.charmy_enabled": true,
  "agents.llm_provider": "gemini",
};

export interface SettingSpec {
  group: "Scheduling" | "Risk" | "Limits" | "Agents";
  label: string;
  description: string;
  validate: (v: unknown) => string | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const intIn = (min: number, max: number) => (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? null : `must be a whole number from ${min} to ${max}`;
const time = (v: unknown) => (typeof v === "string" && TIME.test(v) ? null : "must be a time HH:MM (24h)");
const terms = (v: unknown) =>
  Array.isArray(v) && v.length <= 500 && v.every((t) => typeof t === "string" && t.trim().length > 0 && t.length <= 80)
    ? null
    : "must be a list of up to 500 non-empty phrases (80 characters max each)";

export const SETTING_SPECS: Record<SettingKey, SettingSpec> = {
  "scheduling.effort_units": {
    group: "Scheduling", label: "Effort units per mission size",
    description: "How much of a run's budget one repetition of each mission size uses. Defaults: short 1, medium 2, long 4, unsized 1.",
    validate: (v) =>
      v && typeof v === "object" && !Array.isArray(v) &&
      MISSION_DURATIONS.every((d) => Number.isInteger((v as Record<string, unknown>)[d]) && ((v as Record<string, number>)[d]!) >= 1 && ((v as Record<string, number>)[d]!) <= 100) &&
      Object.keys(v).every((k) => (MISSION_DURATIONS as readonly string[]).includes(k))
        ? null
        : `must give a whole number from 1 to 100 for each of ${MISSION_DURATIONS.join(", ")}`,
  },
  "scheduling.run_effort_budget": {
    group: "Scheduling", label: "Run effort budget",
    description: "Effort units one run holds. The auto-scheduler packs to it; readiness refuses a run over it.",
    validate: intIn(1, 100),
  },
  "scheduling.run_effort_floor": {
    group: "Scheduling", label: "Minimum run effort",
    description: "A run with sized missions must reach at least this many units to be ready. 0 disables the floor.",
    validate: intIn(0, 100),
  },
  "scheduling.default_slots": {
    group: "Scheduling", label: "Default slot starts",
    description: "Start times auto-fill books on each working day.",
    validate: (v) =>
      Array.isArray(v) && v.length >= 1 && v.length <= 48 && v.every((t) => time(t) === null) && new Set(v).size === v.length
        ? null
        : "must be 1–48 distinct times HH:MM",
  },
  "scheduling.first_start": {
    group: "Scheduling", label: "Earliest start", description: "No run may start before this time.", validate: time,
  },
  "scheduling.last_start": {
    group: "Scheduling", label: "Latest start", description: "No run may start after this time.", validate: time,
  },
  "scheduling.slot_step_minutes": {
    group: "Scheduling", label: "Start-time grid (minutes)",
    description: "Run start times must fall on this grid, e.g. 30 allows 09:00 and 09:30.",
    validate: (v) => ([5, 10, 15, 20, 30, 60] as unknown[]).includes(v) ? null : "must be one of 5, 10, 15, 20, 30, 60",
  },
  "scheduling.work_days": {
    group: "Scheduling", label: "Working days",
    description: "ISO weekdays auto-fill schedules on: 1 = Monday … 7 = Sunday. Evaluated in UTC.",
    validate: (v) =>
      Array.isArray(v) && v.length >= 1 && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) && new Set(v).size === v.length
        ? null
        : "must be a non-empty list of distinct weekdays 1–7",
  },
  "risk.high_hazard_terms": {
    group: "Risk", label: "High-hazard terms",
    description: "Words in a mission's name or instructions that make the heuristic assessment HIGH (legal review required).",
    validate: terms,
  },
  "risk.potential_hazard_terms": {
    group: "Risk", label: "Potential-hazard terms",
    description: "Words that make the heuristic assessment POTENTIAL (legal review required).",
    validate: terms,
  },
  "limits.roboflow_max_images_per_export": {
    group: "Limits", label: "Images per Roboflow export",
    description: "Each image is one request; larger runs export in several passes.",
    validate: intIn(1, 45),
  },
  "limits.coverage_max_cells": {
    group: "Limits", label: "Coverage cells per campaign",
    description: "Upper bound on a campaign's coverage state space.",
    validate: intIn(1, 4096),
  },
  "agents.mcp_enabled": {
    group: "Agents", label: "MCP server for coding agents",
    description: "Lets Claude Code, Gemini CLI and other MCP clients use /api/mcp with an API token. Off: the endpoint returns 404 and everything stays manual.",
    validate: (v) => (typeof v === "boolean" ? null : "must be true or false"),
  },
  "agents.charmy_enabled": {
    group: "Agents", label: "In-app assistant (Charmy)",
    description: "Shows the assistant, which can read data and propose change sets for you to apply. Off: the assistant is hidden.",
    validate: (v) => (typeof v === "boolean" ? null : "must be true or false"),
  },
  "agents.llm_provider": {
    group: "Agents", label: "Assistant model provider",
    description: "Which model provider Charmy uses. Its API key comes from the Integrations page or the Worker secret.",
    validate: (v) => (v === "gemini" || v === "anthropic" ? null : "must be gemini or anthropic"),
  },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export const isSettingKey = (k: string): k is SettingKey => k in SETTING_DEFAULTS;

const minutes = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Rules that span several settings. Run on the merged result of defaults, stored values and a proposed change. */
export function validateSettings(s: Settings): FieldError[] {
  const errors: FieldError[] = [];
  for (const key of SETTING_KEYS) {
    const problem = SETTING_SPECS[key].validate(s[key]);
    if (problem) errors.push({ field: key, message: problem });
  }
  if (errors.length) return errors;

  if (s["scheduling.run_effort_floor"] > s["scheduling.run_effort_budget"]) {
    errors.push({ field: "scheduling.run_effort_floor", message: "cannot exceed the run effort budget" });
  }
  const first = minutes(s["scheduling.first_start"]);
  const last = minutes(s["scheduling.last_start"]);
  if (first > last) errors.push({ field: "scheduling.first_start", message: "must not be after the latest start" });
  const step = s["scheduling.slot_step_minutes"];
  for (const t of s["scheduling.default_slots"]) {
    const m = minutes(t);
    if (m < first || m > last) errors.push({ field: "scheduling.default_slots", message: `${t} is outside ${s["scheduling.first_start"]}–${s["scheduling.last_start"]}` });
    else if (m % step !== 0) errors.push({ field: "scheduling.default_slots", message: `${t} is not on the ${step}-minute grid` });
  }
  return errors;
}
