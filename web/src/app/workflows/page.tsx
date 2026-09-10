"use client";

// Workflows — a real, guided step-by-step runner. Pick a workflow, then the runner walks
// you through its ordered steps, performing the actual backend operations at each step and
// narrating every action in a live activity log. Nothing here is a mock: each "next" unlocks
// only when the step's real backend condition is met.
import { useState } from "react";
import { WorkflowRunner } from "@/components/workflow/WorkflowRunner";
import type { WorkflowDef } from "@/components/workflow/types";

const WORKFLOWS: WorkflowDef[] = [
  {
    id: "w1_task_ready",
    name: "Get a mission schedulable",
    desc: "Instructions → risk/legal → READY",
    steps: [
      { key: "pick", label: "Pick a mission", hint: "Choose a campaign and mission to make schedulable." },
      { key: "instructions", label: "Instructions complete", hint: "Mark the robot operator instructions complete (updateMission)." },
      { key: "risk", label: "Risk & legal review", hint: "Assess risk and record the legal verdict until risk is cleared." },
      { key: "ready", label: "Mission is READY", hint: "The backend reports is_ready — the mission is schedulable." },
    ],
  },
  {
    id: "w2_compose_confirm_session",
    name: "Compose & confirm a run",
    desc: "Draft → build assembly → readiness → confirm (encoded code)",
    steps: [
      { key: "start", label: "Start a run", hint: "Create a DRAFT run (createRun)." },
      { key: "fill", label: "Build assembly", hint: "Assign missions, robot, robot operator, lab, fleet — each re-runs readiness." },
      { key: "confirm", label: "Readiness & confirm", hint: "When readiness is clear, confirm to mint the encoded code." },
      { key: "done", label: "Confirmed", hint: "Run confirmed and on the pipeline." },
    ],
  },
  {
    id: "w3_data_pipeline",
    name: "Run the data pipeline",
    desc: "Confirmed → … → Manual QA → Validated → Uploaded → Done",
    steps: [
      { key: "pick", label: "Pick a run", hint: "Choose a confirmed (or later) run." },
      { key: "advance", label: "Advance the pipeline", hint: "Advance stage by stage; clear the Manual QA gate when reached." },
      { key: "done", label: "Done", hint: "Run reaches DONE." },
    ],
  },
  {
    id: "w4_blocker_reassign",
    name: "Handle a blocker",
    desc: "Blocked / unready → swap offending member → re-confirm",
    steps: [
      { key: "pick", label: "Pick a run", hint: "Choose a blocked or unready run." },
      { key: "resolve", label: "Resolve each issue", hint: "Swap each offending member for an eligible one (assignRun)." },
      { key: "reconfirm", label: "Re-confirm", hint: "Re-confirm once readiness is clear." },
      { key: "done", label: "Confirmed", hint: "Blocker resolved." },
    ],
  },
];

export default function WorkflowsPage() {
  const [active, setActive] = useState<WorkflowDef | null>(null);

  if (active) {
    return (
      <div className="h-full bg-neutral-50">
        <WorkflowRunner def={active} onExit={() => setActive(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <header className="flex items-start justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">Workflows</h1>
          <p className="text-sm text-neutral-500">
            Guided, step-by-step runners. Pick one — the runner performs the real backend
            operations and narrates each action as it goes.
          </p>
        </div>
        <a
          href="/workflows/designer"
          className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Open BPMN designer
        </a>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {WORKFLOWS.map((w) => (
            <div key={w.id} className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="text-sm font-semibold text-neutral-800">{w.name}</div>
              <div className="mt-1 text-sm text-neutral-500">{w.desc}</div>
              <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-neutral-400">
                {w.steps.map((s, i) => (
                  <li key={s.key}>
                    {i + 1}. {s.label}
                    {i < w.steps.length - 1 ? " →" : ""}
                  </li>
                ))}
              </ol>
              <div className="mt-4">
                <button
                  onClick={() => setActive(w)}
                  className="rounded-md bg-[color:var(--cq-iris)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--cq-violet)]"
                >
                  Start guided run
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
