import { STATUS_COLOR } from "@/lib/palette";

/** Horizontal pipeline stepper: shows stages, marks the current one, and (optionally)
 *  a count per stage. `notWired` stages are shown muted to signal "not yet connected
 *  to the live S3/extraction pipeline". */
export function Stepper({
  stages,
  current,
  counts,
}: {
  stages: { key: string; label: string }[];
  current?: string;
  counts?: Record<string, number>;
}) {
  const currentIdx = current ? stages.findIndex((s) => s.key === current) : -1;
  return (
    <ol className="flex items-center gap-0 overflow-x-auto">
      {stages.map((s, i) => {
        const done = currentIdx >= 0 && i < currentIdx;
        const active = i === currentIdx;
        const color = active ? STATUS_COLOR.confirmed : done ? STATUS_COLOR.done : "#D8D8DC";
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center">
            <div className="flex flex-col items-center">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: color }}
                title={s.label}
              >
                {counts ? (counts[s.key] ?? 0) : i + 1}
              </div>
              <span className={`mt-1 w-14 text-center text-[10px] leading-tight ${active ? "font-semibold text-neutral-800" : "text-neutral-400"}`}>
                {s.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className="mx-1 h-0.5 flex-1" style={{ background: i < currentIdx ? STATUS_COLOR.done : "#E8E8EA" }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
