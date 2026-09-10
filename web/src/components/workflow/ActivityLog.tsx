"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "./types";

const DOT: Record<LogEntry["kind"], string> = {
  info: "bg-neutral-300",
  action: "bg-blue-500",
  success: "bg-green-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

const TEXT: Record<LogEntry["kind"], string> = {
  info: "text-neutral-600",
  action: "text-neutral-800",
  success: "text-green-700",
  warn: "text-amber-700",
  error: "text-red-700",
};

/** Live activity log — narrates what the runner is doing as it works. Auto-scrolls to
 *  the newest entry. This is a first-class panel: every real backend call the workflow
 *  performs is announced here so the operator can follow the reasoning, not just the result. */
export function ActivityLog({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-100 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          Activity log
        </div>
        <div className="mt-0.5 text-xs text-neutral-500">Live narration of each backend action.</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <div className="text-xs text-neutral-400">Nothing yet. Actions you take will be narrated here.</div>
        ) : (
          <ol className="flex flex-col gap-2">
            {entries.map((e) => (
              <li key={e.id} className="flex gap-2 text-xs leading-snug">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[e.kind]}`} />
                <span className="shrink-0 font-mono text-[10px] text-neutral-400">{e.at}</span>
                <span className={TEXT[e.kind]}>{e.text}</span>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
