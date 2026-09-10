"use client";

import { useState } from "react";
import type { Mission, MissionGroup } from "@/lib/types";

/** Choose the run's mission scope: a whole Mission Group (default) OR individual mission(s).
 *  Mirrors the design requirement — group preferred, single-mission supported. */
export function MissionScopePicker({
  groups,
  missions,
  currentScope,
  currentGroupId,
  currentMissionIds,
  onApply,
  onClose,
}: {
  groups: MissionGroup[];
  missions: Mission[];
  currentScope: "GROUP" | "SINGLE";
  currentGroupId: string | null;
  currentMissionIds: string[];
  onApply: (patch: { mission_scope: "GROUP"; mission_group_id: string } | { mission_scope: "SINGLE"; mission_ids: string[] }) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"GROUP" | "SINGLE">(currentScope);
  const [groupId, setGroupId] = useState<string | null>(currentGroupId ?? groups[0]?.id ?? null);
  const [missionIds, setMissionIds] = useState<string[]>(currentMissionIds ?? []);

  const toggleMission = (id: string) =>
    setMissionIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Plain-language reason a mission isn't schedulable yet (mirrors the backend is_ready rule:
  // instructions complete AND risk cleared AND variants defined).
  const notReadyReason = (t: Mission): string => {
    if (!t.instructions_complete) return "instructions incomplete";
    if (t.risk_level !== "LOW" && t.legal_approval !== "APPROVED") return "needs legal clearance";
    return "no variants defined";
  };
  // Ready missions float to the top so eligibility reads at a glance.
  const sortedMissions = [...missions].sort((a, b) => Number(b.is_ready) - Number(a.is_ready));

  const canApply = scope === "GROUP" ? !!groupId : missionIds.length > 0;

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-lg border border-neutral-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span className="text-sm font-semibold">Set missions</span>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">✕</button>
      </div>

      <div className="border-b border-neutral-100 px-3 py-2">
        <label className="mr-4 text-sm">
          <input type="radio" checked={scope === "GROUP"} onChange={() => setScope("GROUP")} className="mr-1.5" />
          Whole mission group
        </label>
        <label className="text-sm">
          <input type="radio" checked={scope === "SINGLE"} onChange={() => setScope("SINGLE")} className="mr-1.5" />
          Individual mission(s)
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {scope === "GROUP" ? (
          groups.length === 0 ? (
            <p className="px-1 py-2 text-xs text-neutral-400">No mission groups.</p>
          ) : (
            groups.map((g) => {
              const inGroup = missions.filter((t) => t.mission_group_id === g.id);
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
        ) : missions.length === 0 ? (
          <p className="px-1 py-2 text-xs text-neutral-400">No missions.</p>
        ) : (
          sortedMissions.map((t) => (
            <label
              key={t.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                t.is_ready ? "hover:bg-green-50" : "hover:bg-neutral-50"
              }`}
              title={t.is_ready ? "Ready to schedule" : notReadyReason(t)}
            >
              <input type="checkbox" checked={missionIds.includes(t.id)} onChange={() => toggleMission(t.id)} className="h-4 w-4" />
              <span className={`flex-1 ${t.is_ready ? "text-green-700" : "text-neutral-400"}`}>
                {t.mission_code} · {t.name}
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
              ? onApply({ mission_scope: "GROUP", mission_group_id: groupId as string })
              : onApply({ mission_scope: "SINGLE", mission_ids: missionIds })
          }
          className="cq-btn-primary rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
