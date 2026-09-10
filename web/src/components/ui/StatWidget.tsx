import type { ReactNode } from "react";
import { CQ } from "@/lib/palette";

/**
 * Compact metric card. Label on top, large tabular value, optional sublabel and a
 * small "trend/among" note. Accent color drives the value; defaults to system blue.
 */
export function StatWidget({
  label,
  value,
  sub,
  among,
  accent = CQ.blue,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  among?: string;
  accent?: string;
  href?: string;
}) {
  const body = (
    <div className="h-full rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-colors hover:border-neutral-300">
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold leading-none tabular-nums" style={{ color: accent }}>
          {value}
        </span>
        {among && <span className="text-sm text-neutral-400 tabular-nums">{among}</span>}
      </div>
      {sub && <div className="mt-1.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block">
        {body}
      </a>
    );
  }
  return body;
}
