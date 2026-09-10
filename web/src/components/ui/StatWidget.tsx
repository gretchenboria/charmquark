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
    <div className="cq-card h-full p-4 transition-shadow hover:shadow-[var(--cq-shadow-lift)]">
      <div className="text-xs font-medium text-[color:var(--cq-ink-soft)]">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="cq-display text-3xl font-semibold leading-none tabular-nums" style={{ color: accent }}>
          {value}
        </span>
        {among && <span className="text-sm text-[color:var(--cq-ink-faint)] tabular-nums">{among}</span>}
      </div>
      {sub && <div className="mt-1.5 text-xs text-[color:var(--cq-ink-faint)]">{sub}</div>}
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
