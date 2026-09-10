"use client";

export interface Candidate {
  id: string;
  label: string;
  eligible: boolean;
  reason?: string;
}

export function EligiblePicker({
  title,
  candidates,
  onPick,
  onClose,
}: {
  title: string;
  candidates: Candidate[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const eligible = candidates.filter((c) => c.eligible);
  const ineligible = candidates.filter((c) => !c.eligible);

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-lg border border-neutral-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
        <span className="text-sm font-semibold">{title}</span>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {eligible.length === 0 && (
          <p className="px-1 py-2 text-xs text-neutral-400">No eligible candidates.</p>
        )}
        {eligible.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-green-50"
          >
            <span className="h-2 w-2 rounded-full bg-green-600" />
            {c.label}
          </button>
        ))}
        {ineligible.length > 0 && (
          <div className="mt-2 border-t border-neutral-100 pt-2">
            <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-neutral-400">
              Not eligible
            </p>
            {ineligible.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm text-neutral-400"
                title={c.reason}
              >
                <span>{c.label}</span>
                {c.reason && <span className="text-[11px] text-red-400">{c.reason}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
