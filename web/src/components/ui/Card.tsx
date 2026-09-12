import type { ReactNode, CSSProperties } from "react";

/**
 * Base surface for the consolidated dashboard and (optionally) list/detail pages.
 * Generous rounding, a violet-tinted hairline and a violet-tinted shadow, so
 * surfaces lift off the ground without the gray cast a neutral shadow gives.
 */
export function Card({
  title,
  subtitle,
  actions,
  className = "",
  bodyClassName = "",
  style,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const hasHeader = title || subtitle || actions;
  return (
    <div
      className={`cq-card ${className}`}
      style={style}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div className="min-w-0">
            {title && <h2 className="cq-display text-sm font-semibold text-[color:var(--cq-ink)]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-[color:var(--cq-ink-faint)]">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`${hasHeader ? "px-4 pb-4" : "p-4"} ${bodyClassName}`}>{children}</div>
    </div>
  );
}
