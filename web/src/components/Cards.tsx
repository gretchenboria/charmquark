import type { ReactNode } from "react";
import { CQ } from "@/lib/palette";

/** A rounded metric card: big number, label, optional delta/subtext. */
export function StatCard({
  label,
  value,
  sub,
  accent = CQ.blue,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-[13px] font-medium text-neutral-500">{label}</div>
      <div className="mt-1 text-[32px] font-semibold leading-none tabular-nums" style={{ color: accent }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

/** A titled content card for charts/tables. */
export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Progress bar (rounded). */
export function Progress({ pct, color = CQ.sage }: { pct: number; color?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: color }} />
    </div>
  );
}

/** Horizontal funnel: labeled rows with proportional bars. */
export function Funnel({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <div className="w-24 shrink-0 text-neutral-500">{r.label}</div>
          <div className="h-6 flex-1 overflow-hidden rounded-md bg-neutral-100">
            <div
              className="flex h-full items-center justify-end rounded-md px-2 text-xs font-medium text-white"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color, minWidth: r.value ? 28 : 0 }}
            >
              {r.value > 0 ? r.value : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
