// Derived campaign metrics for the dashboard + reports. Computed from the API — single
// source of truth, mirroring the desktop DashboardViewModel (runs, pipeline, clearance).
import { api } from "./api";
import type { Sensor, Lab, Operator, Robot, Run, Campaign } from "./types";

export interface CampaignMetrics {
  campaign: Campaign;
  runs: Run[];
  robots: Robot[];
  operators: Operator[];
  labs: Lab[];
  sensors: Sensor[];
  byState: Record<string, number>;
  confirmedPlus: number; // scheduled and beyond
  collectedPlus: number; // data collected and beyond
  readyNow: number;
  blocked: number;
  inProgress: number; // draft + assembling
  targetN: number;
  progressPct: number; // collectedPlus / targetN
  clearedRobots: number;
  operationalSensors: number;
}

const CONFIRMED_PLUS = ["CONFIRMED", "IN_EXECUTION", "COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"];
const COLLECTED_PLUS = ["COLLECTED", "EXTRACTED", "MANUAL_QA", "VALIDATED", "UPLOADED", "DONE"];

export async function loadCampaignMetrics(
  campaignId: string,
  range?: { start: string; end: string },
): Promise<CampaignMetrics> {
  const sessionParams: Record<string, string> = { campaign_id: campaignId };
  if (range) {
    sessionParams.start = range.start;
    sessionParams.end = range.end;
  }
  const [campaign, runs, robots, operators, labs, sensors] = await Promise.all([
    api.getCampaign(campaignId),
    api.listRunsBy(sessionParams),
    api.listRobots(),
    api.listOperators(),
    api.listLabs(),
    api.listSensors(),
  ]);

  const byState: Record<string, number> = {};
  for (const s of runs) byState[s.state] = (byState[s.state] ?? 0) + 1;

  const count = (states: string[]) => runs.filter((s) => states.includes(s.state)).length;
  const collectedPlus = count(COLLECTED_PLUS);
  const targetN = campaign.target_n || 0;

  return {
    campaign,
    runs,
    robots,
    operators,
    labs,
    sensors,
    byState,
    confirmedPlus: count(CONFIRMED_PLUS),
    collectedPlus,
    readyNow: byState["READY"] ?? 0,
    blocked: byState["BLOCKED"] ?? 0,
    inProgress: (byState["DRAFT"] ?? 0) + (byState["ASSEMBLING"] ?? 0),
    targetN,
    progressPct: targetN > 0 ? Math.round((collectedPlus / targetN) * 100) : 0,
    clearedRobots: robots.filter((p) => p.is_cleared).length,
    operationalSensors: sensors.filter((d) => d.status === "OPERATIONAL").length,
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

/** Daily Execution buckets — auto-derived from run state (system-tracked). */
export function dailyExecution(runs: Run[]) {
  const inState = (s: string) => runs.filter((x) => x.state === s).length;
  const uploaded = inState("UPLOADED") + inState("DONE");
  const extractedQAd = inState("EXTRACTED") + inState("MANUAL_QA") + inState("VALIDATED");
  const pending = inState("COLLECTED"); // collected but not yet extracted/QA'd
  const inExecution = inState("IN_EXECUTION");
  return { uploaded, extractedQAd, pending, inExecution };
}
