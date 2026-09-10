import type { ReactNode } from "react";

/**
 * Base surface for the consolidated dashboard and (optionally) list/detail pages.
 * Generous rounding, subtle border, restrained shadow, calm white bg.
 */
export function Card({
  title,
  subtitle,
  actions,
  className = "",
  bodyClassName = "",
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}) {
  const hasHeader = title || subtitle || actions;
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${className}`}
    >
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-neutral-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={`${hasHeader ? "px-4 pb-4" : "p-4"} ${bodyClassName}`}>{children}</div>
    </div>
  );
}
