import type { Run } from "@/lib/types";
import { formatDay } from "@/lib/dates";
import { RunCard } from "./RunCard";

export interface CardLabels {
  robot?: string;
  operator?: string;
  lab?: string;
  missionGroup?: string;
}

export function DayColumn({
  date,
  runs,
  labelsFor,
  canAdd,
  onAdd,
  onOpen,
}: {
  date: Date;
  runs: Run[];
  labelsFor: (s: Run) => CardLabels;
  canAdd: boolean;
  onAdd: (date: Date) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex min-h-[60vh] w-56 shrink-0 flex-col rounded-lg bg-neutral-100/60">
      <div className="sticky top-0 z-[1] rounded-t-lg border-b border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-700">
        {formatDay(date)}
        <span className="ml-1 font-normal text-neutral-400">({runs.length})</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {runs.map((s) => (
          <RunCard key={s.id} run={s} labels={labelsFor(s)} onClick={() => onOpen(s.id)} />
        ))}
        {canAdd && (
          <button
            onClick={() => onAdd(date)}
            className="mt-1 rounded-md border border-dashed border-neutral-300 py-1.5 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
          >
            + Run
          </button>
        )}
      </div>
    </div>
  );
}
