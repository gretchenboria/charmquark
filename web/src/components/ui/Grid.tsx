import type { ReactNode } from "react";

/** Responsive grid helper. `cols` is the max column count at the widest breakpoint. */
export function Grid({
  cols = 3,
  className = "",
  children,
}: {
  cols?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  const map: Record<number, string> = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  };
  return <div className={`grid gap-3 ${map[cols]} ${className}`}>{children}</div>;
}

/** A vertical stack with consistent spacing between dashboard sections. */
export function Section({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`flex flex-col gap-3 ${className}`}>{children}</div>;
}
