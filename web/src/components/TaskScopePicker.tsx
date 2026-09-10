"use client";

import { useState } from "react";
import type { Task, TaskGroup } from "@/lib/types";

/** Choose the session's task scope: a whole Task Group (default) OR individual task(s).
 *  Mirrors the design requirement — group preferred, single-task supported. */
export function TaskScopePicker({
  groups,
  tasks,
  currentScope,
  currentGroupId,
  currentTaskIds,
  onApply,
  onClose,
}: {
  groups: TaskGroup[];
  tasks: Task[];
  currentScope: "GROUP" | "SINGLE";
  currentGroupId: string | null;
  currentTaskIds: string[];
  onApply: (patch: { task_scope: "GROUP"; task_group_id: string } | { task_scope: "SINGLE"; task_ids: string[] }) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"GROUP" | "SINGLE">(currentScope);
  const [groupId, setGroupId] = useState<string | null>(currentGroupId ?? groups[0]?.id ?? null);
  const [taskIds, setTaskIds] = useState<string[]>(currentTaskIds ?? []);

  const toggleTask = (id: string) =>
    setTaskIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Plain-language reason a task isn't schedulable yet (mirrors the backend is_ready rule:
  // instructions complete AND risk cleared AND variants defined).
  const notReadyReason = (t: Task): string => {
    if (!t.instructions_complete) return "instructions incomplete";
    if (t.risk_level !== "LOW" && t.legal_approval !== "APPROVED") return "needs legal clearance";
    return "no variants defined";
  };
  // Ready tasks float to the top so eligibility reads at a glance.
  const sortedTasks = [...tasks].sort((a, b) => Number(b.is_ready) - Number(a.is_ready));

  const canApply = scope === "GROUP" ? !!groupId : taskIds.length > 0;

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-lg border border-neutral-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span className="text-sm font-semibold">Set tasks</span>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
      </div>

      <div className="border-b border-neutral-100 px-3 py-2">
        <label className="mr-4 text-sm">
          <input type="radio" checked={scope === "GROUP"} onChange={() => setScope("GROUP")} className="mr-1.5" />
          Whole task group
        </label>
        <label className="text-sm">
          <input type="radio" checked={scope === "SINGLE"} onChange={() => setScope("SINGLE")} className="mr-1.5" />
          Individual task(s)
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {scope === "GROUP" ? (
          groups.length === 0 ? (
            <p className="px-1 py-2 text-xs text-neutral-400">No task groups.</p>
          ) : (
            groups.map((g) => {
              const inGroup = tasks.filter((t) => t.task_group_id === g.id);
              const ready = inGroup.filter((t) => t.is_ready).length;
              const allReady = inGroup.length > 0 && ready === inGroup.length;
              return (
                <button
                  key={g.id}
                  onClick={() => setGroupId(g.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    groupId === g.id ? "bg-neutral-100 font-medium" : "hover:bg-neutral-50"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${groupId === g.id ? "bg-neutral-900" : "bg-neutral-300"}`} />
                  <span className="flex-1">{g.name}</span>
                  <span className={`text-[11px] ${allReady ? "text-green-600" : "text-neutral-400"}`}>
                    {ready}/{inGroup.length} ready
                  </span>
                </button>
              );
            })
          )
        ) : tasks.length === 0 ? (
          <p className="px-1 py-2 text-xs text-neutral-400">No tasks.</p>
        ) : (
          sortedTasks.map((t) => (
            <label
              key={t.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                t.is_ready ? "hover:bg-green-50" : "hover:bg-neutral-50"
              }`}
              title={t.is_ready ? "Ready to schedule" : notReadyReason(t)}
            >
              <input type="checkbox" checked={taskIds.includes(t.id)} onChange={() => toggleTask(t.id)} className="h-4 w-4" />
              <span className={`flex-1 ${t.is_ready ? "text-green-700" : "text-neutral-400"}`}>
                {t.task_code} · {t.name}
              </span>
              <span className={`text-[11px] ${t.is_ready ? "text-green-600" : "text-red-500"}`}>
                {t.is_ready ? "ready" : notReadyReason(t)}
              </span>
            </label>
          ))
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-neutral-100 px-3 py-2">
        <button onClick={onClose} className="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">Cancel</button>
        <button
          disabled={!canApply}
          onClick={() =>
            scope === "GROUP"
              ? onApply({ task_scope: "GROUP", task_group_id: groupId as string })
              : onApply({ task_scope: "SINGLE", task_ids: taskIds })
          }
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
