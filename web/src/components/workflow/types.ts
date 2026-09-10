"use client";

// Shared types for the guided Workflow Runner. Each workflow is a fixed, ordered list
// of steps; the runner shell renders the step list (with the current one highlighted),
// a main panel for the active step, and a live activity log that the workflow body
// appends to as it performs real backend calls.

export type LogKind = "info" | "action" | "success" | "warn" | "error";

export interface LogEntry {
  id: number;
  at: string; // HH:MM:SS
  kind: LogKind;
  text: string;
}

/** Append-to-log function handed to each workflow body. */
export type LogFn = (kind: LogKind, text: string) => void;

export interface WorkflowStep {
  key: string;
  label: string;
  hint: string;
}

export interface WorkflowDef {
  id: string;
  name: string;
  desc: string;
  steps: WorkflowStep[];
  /** Roles that can drive this workflow end-to-end (informational banner only). */
}
