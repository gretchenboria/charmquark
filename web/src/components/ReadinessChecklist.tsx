"use client";

import type { ChecklistItem } from "@/lib/types";

/** Readiness checklist with provenance.
 *  - auto items: system-derived; checkbox is pre-populated (read-only here; toggle/override
 *    happens by changing the underlying data, e.g. inventory status).
 *  - manual items: external/not-integrated (safety sign-off, calibration docs, QA check) — a PM/Robot Operator
 *    ticks them; `onToggle` fires the update. Disabled when the caller can't write. */
export function ReadinessChecklist({
  items,
  canEdit,
  onToggle,
}: {
  items: ChecklistItem[];
  canEdit: boolean;
  onToggle?: (key: string, done: boolean) => void;
}) {
  if (!items?.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((it) => {
        const manual = it.source === "manual";
        const interactive = manual && canEdit && !!onToggle;
        return (
          <li key={it.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={it.done}
              disabled={!interactive}
              onChange={(e) => onToggle?.(it.key, e.target.checked)}
              className="h-4 w-4 accent-green-600"
            />
            <span className={it.done ? "text-neutral-800" : "text-neutral-500"}>{it.label}</span>
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
                manual ? "bg-amber-50 text-amber-700" : "bg-neutral-100 text-neutral-500"
              }`}
              title={manual ? "Marked manually (external app not integrated)" : "Detected automatically by the system"}
            >
              {manual ? "manual" : "auto"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
