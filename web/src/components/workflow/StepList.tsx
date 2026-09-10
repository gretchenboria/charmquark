"use client";

import type { WorkflowStep } from "./types";

/** Vertical ordered step list with the current step highlighted and completed steps
 *  checked. Purely presentational — the workflow body owns which steps are done and
 *  which is current. */
export function StepList({
  steps,
  currentIndex,
  doneIndex,
}: {
  steps: WorkflowStep[];
  currentIndex: number;
  /** Highest index that is fully complete (its real condition was met). */
  doneIndex: number;
}) {
  return (
    <ol className="flex flex-col gap-1">
      {steps.map((s, i) => {
        const done = i <= doneIndex;
        const active = i === currentIndex;
        return (
          <li
            key={s.key}
            className={`rounded-lg px-3 py-2 ${active ? "bg-violet-50 ring-1 ring-violet-200" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done
                    ? "bg-green-600 text-white"
                    : active
                    ? "bg-[color:var(--cq-iris)] text-white"
                    : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-sm ${active ? "font-semibold text-neutral-800" : done ? "text-neutral-700" : "text-neutral-500"}`}
              >
                {s.label}
              </span>
            </div>
            {active && <div className="mt-1 pl-7 text-xs text-neutral-500">{s.hint}</div>}
          </li>
        );
      })}
    </ol>
  );
}
