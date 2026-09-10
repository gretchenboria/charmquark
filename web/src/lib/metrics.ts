// Derived study metrics for the dashboard + reports. Computed from the API — single
// source of truth, mirroring the desktop DashboardViewModel (sessions, pipeline, clearance).
import { api } from "./api";
import type { Device, Lab, Operator, Robot, Session, Study } from "./types";

export interface StudyMetrics {
  study: Study;
  sessions: Session[];
  robots: Robot[];
  operators: Operator[];
  labs: Lab[];
  devices: Device[];
  byState: Record<string, number>;
  confirmedPlus: number; // scheduled and beyond
  collectedPlus: number; // data collected and beyond
  readyNow: number;
  blocked: number;
  inProgress: number; // draft + assembling
  targetN: number;
  progressPct: number; // collectedPlus / targetN
  clearedRobots: number;
  operationalDevices: number;
}

const CONFIRMED_PLUS = ["CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"];
const COLLECTED_PLUS = ["COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"];

export async function loadStudyMetrics(
  studyId: string,
  range?: { start: string; end: string },
): Promise<StudyMetrics> {
  const sessionParams: Record<string, string> = { study_id: studyId };
  if (range) {
    sessionParams.start = range.start;
    sessionParams.end = range.end;
  }
  const [study, sessions, robots, operators, labs, devices] = await Promise.all([
    api.getStudy(studyId),
    api.listSessionsBy(sessionParams),
    api.listRobots(),
    api.listOperators(),
    api.listLabs(),
    api.listDevices(),
  ]);

  const byState: Record<string, number> = {};
  for (const s of sessions) byState[s.state] = (byState[s.state] ?? 0) + 1;

  const count = (states: string[]) => sessions.filter((s) => states.includes(s.state)).length;
  const collectedPlus = count(COLLECTED_PLUS);
  const targetN = study.target_n || 0;

  return {
    study,
    sessions,
    robots,
    operators,
    labs,
    devices,
    byState,
    confirmedPlus: count(CONFIRMED_PLUS),
    collectedPlus,
    readyNow: byState["READY"] ?? 0,
    blocked: byState["BLOCKED"] ?? 0,
    inProgress: (byState["DRAFT"] ?? 0) + (byState["ASSEMBLING"] ?? 0),
    targetN,
    progressPct: targetN > 0 ? Math.round((collectedPlus / targetN) * 100) : 0,
    clearedRobots: robots.filter((p) => p.is_cleared).length,
    operationalDevices: devices.filter((d) => d.status === "OPERATIONAL").length,
  };
}

// Ordered pipeline stages for the funnel widget.
export const PIPELINE_STAGES = ["DRAFT", "ASSEMBLING", "READY", "CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"] as const;
export const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ASSEMBLING: "Assembling",
  READY: "Ready",
  CONFIRMED: "Confirmed",
  IN_EXECUTION: "In exec",
  COLLECTED: "Collected",
  EXTRACTED: "Extracted",
  MANUAL_QA: "Manual QA",
  VALIDATED: "Validated",
  UPLOADED: "Uploaded",
  DONE: "Done",
  BLOCKED: "Blocked",
};

// Data-pipeline stages only (post-execution), for the Daily Execution stepper.
export const DATA_PIPELINE = ["COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"] as const;

/** Daily Execution buckets — auto-derived from session state (system-tracked). */
export function dailyExecution(sessions: Session[]) {
  const inState = (s: string) => sessions.filter((x) => x.state === s).length;
  const uploaded = inState("UPLOADED") + inState("DONE");
  const extractedQAd = inState("EXTRACTED") + inState("MANUAL_QA") + inState("VALIDATED");
  const pending = inState("COLLECTED"); // collected but not yet extracted/QA'd
  const inExecution = inState("IN_EXECUTION");
  return { uploaded, extractedQAd, pending, inExecution };
}
