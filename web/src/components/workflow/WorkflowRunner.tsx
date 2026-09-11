"use client";

import { useCallback, useState } from "react";
import { useUser } from "@/lib/useUser";
import { canCreate, canUpdate } from "@/lib/session";
import { ActivityLog } from "./ActivityLog";
import { StepList } from "./StepList";
import { useActivityLog } from "./useActivityLog";
import type { WorkflowDef } from "./types";
import { W1MissionReady } from "./W1MissionReady";
import { W2ComposeConfirm } from "./W2ComposeConfirm";
import { W3DataPipeline } from "./W3DataPipeline";
import { W4Blocker } from "./W4Blocker";

/** The runner shell: left = ordered step list (current highlighted), center = the active
 *  workflow body (real backend actions), right = the live activity log. Each workflow body
 *  reports its current/done step indices up via onProgress so the step list stays in sync
 *  with real state. */
export function WorkflowRunner({ def, onExit }: { def: WorkflowDef; onExit: () => void }) {
  const user = useUser();
  const { entries, log } = useActivityLog();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [doneIndex, setDoneIndex] = useState(-1);

  const onProgress = useCallback((ci: number, di: number) => {
    setCurrentIndex(ci);
    setDoneIndex(di);
  }, []);

  // Permission per workflow: composing runs needs create (PM); the rest need update.
  const canWrite = def.id === "w2_compose_confirm_session" ? canCreate(user?.role) : canUpdate(user?.role);

  const body = () => {
    switch (def.id) {
      case "w1_task_ready":
        return <W1MissionReady role={user?.role} canWrite={canUpdate(user?.role)} log={log} onProgress={onProgress} />;
      case "w2_compose_confirm_session":
        return <W2ComposeConfirm canWrite={canWrite} log={log} onProgress={onProgress} />;
      case "w3_data_pipeline":
        return <W3DataPipeline canWrite={canUpdate(user?.role)} log={log} onProgress={onProgress} />;
      case "w4_blocker_reassign":
        return <W4Blocker canWrite={canUpdate(user?.role)} log={log} onProgress={onProgress} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3">
        <button onClick={onExit} className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50">
          ← Workflows
        </button>
        <div>
          <h1 className="text-base font-semibold text-neutral-800">{def.name}</h1>
          <p className="text-xs text-neutral-500">{def.desc}</p>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_320px] overflow-y-auto lg:overflow-hidden">
        {/* Step list */}
        <div className="overflow-y-auto border-r border-neutral-200 bg-white p-3">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Steps</div>
          <StepList steps={def.steps} currentIndex={currentIndex} doneIndex={doneIndex} />
        </div>

        {/* Active step body */}
        <div className="overflow-y-auto bg-neutral-50 p-6">
          <div className="mx-auto w-full max-w-xl">{body()}</div>
        </div>

        {/* Live activity log */}
        <div className="overflow-hidden border-l border-neutral-200 bg-white">
          <ActivityLog entries={entries} />
        </div>
      </div>
    </div>
  );
}
