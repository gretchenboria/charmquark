"use client";

/**
 * Who changed this record, when, and what — from the audit trail. Changes made
 * with an API token (an agent or script) are marked, so a person can tell their
 * own edits from an agent's.
 */
import { useEffect, useState } from "react";
import { api, type AuditEvent } from "@/lib/api";

const fmt = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? (Array.isArray(v) ? `${v.length} item(s)` : "…") : String(v);

function describe(e: AuditEvent): string[] {
  if (e.action === "create") return ["created"];
  if (e.action === "delete") return ["deleted"];
  const before = e.before ?? {};
  const after = e.after ?? {};
  const changed = Object.keys(after)
    .filter((k) => k !== "version" && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map((k) => `${k}: ${fmt(before[k])} → ${fmt(after[k])}`);
  return changed.length ? changed.slice(0, 8) : [e.action];
}

const VIA: Record<AuditEvent["via"], string> = {
  firebase: "",
  pat: "agent / API token",
  "dev-shim": "dev",
  system: "system",
};

export function ActivityPanel({ resource, entityId, refreshKey }: { resource: string; entityId: string; refreshKey?: unknown }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    api.listAudit({ resource, entity_id: entityId, limit: 25 }).then(setEvents).catch(() => setEvents([]));
  }, [resource, entityId, refreshKey]);

  if (events === null) return <p className="text-sm text-neutral-400">Loading activity…</p>;
  if (events.length === 0) {
    return <p className="text-sm text-neutral-400">No recorded changes yet. Changes made before activity tracking was added are not listed.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-white text-sm">
      {events.map((e) => (
        <li key={e.id} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-neutral-500">{e.at} UTC</span>
            <span className="font-medium text-neutral-800">{e.actor_name ?? e.actor_subject}</span>
            {VIA[e.via] && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{VIA[e.via]}</span>}
            <span className="text-xs text-neutral-400">{e.action}</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
            {describe(e).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  );
}
