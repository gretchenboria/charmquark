"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api";
import { isoDate, startOfWeekMonday, weekDays } from "@/lib/dates";
import { fuzzyFilter } from "@/lib/fuzzy";
import type {
  Device,
  InventoryItem,
  Lab,
  Operator,
  Robot,
  Session,
  Study,
  Task,
} from "@/lib/types";

// One searchable object, flattened to what the palette needs to render + link.
type Kind =
  | "Study"
  | "Task"
  | "Robot"
  | "Operator"
  | "Lab"
  | "Device"
  | "Inventory"
  | "Session";

interface Hit {
  kind: Kind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  text: string; // haystack for fuzzy matching
}

// Render order for grouped results.
const GROUP_ORDER: Kind[] = [
  "Study",
  "Task",
  "Robot",
  "Operator",
  "Lab",
  "Device",
  "Inventory",
  "Session",
];

const sessionTitle = (s: Session) =>
  s.provisional_code || s.encoded_code || `Session ${s.id.slice(0, 8)}`;

/**
 * Command-palette-style global search for the dashboard. Loads the main object
 * lists once (studies + resources, plus tasks/inventory/this-week sessions for the
 * selected study), then fuzzy-filters entirely in memory so typing stays snappy.
 * All API failures are swallowed — search degrades to whatever loaded.
 */
export function GlobalSearch({ studyId }: { studyId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the searchable corpus once per study selection. Each call fails silently
  // and contributes nothing rather than breaking the whole search.
  useEffect(() => {
    let alive = true;
    const collected: Hit[] = [];
    const add = (hits: Hit[]) => {
      if (!alive) return;
      collected.push(...hits);
      setItems([...collected]);
    };

    const monday = startOfWeekMonday(new Date());
    const days = weekDays(monday, 5);

    api
      .listStudies()
      .then((rows: Study[]) =>
        add(
          rows.map((s) => ({
            kind: "Study" as const,
            id: s.id,
            title: s.name,
            subtitle: s.study_type,
            href: `/studies/${s.id}`,
            text: `${s.name} ${s.study_type} ${s.status}`,
          })),
        ),
      )
      .catch(() => {});

    api
      .listRobots()
      .then((rows: Robot[]) =>
        add(
          rows.map((p) => ({
            kind: "Robot" as const,
            id: p.id,
            title: p.robot_code,
            subtitle: p.status,
            href: `/robots/${p.id}`,
            text: `${p.robot_code} ${p.status}`,
          })),
        ),
      )
      .catch(() => {});

    api
      .listOperators()
      .then((rows: Operator[]) =>
        add(
          rows.map((o) => ({
            kind: "Operator" as const,
            id: o.id,
            title: o.operator_code,
            subtitle: o.role,
            href: `/operators/${o.id}`,
            text: `${o.operator_code} ${o.role}`,
          })),
        ),
      )
      .catch(() => {});

    api
      .listLabs()
      .then((rows: Lab[]) =>
        add(
          rows.map((l) => ({
            kind: "Lab" as const,
            id: l.id,
            title: l.name,
            subtitle: l.type,
            href: `/labs/${l.id}`,
            text: `${l.name} ${l.type}`,
          })),
        ),
      )
      .catch(() => {});

    api
      .listDevices()
      .then((rows: Device[]) =>
        add(
          rows.map((d) => ({
            kind: "Device" as const,
            id: d.id,
            title: d.asset_name,
            subtitle: d.device_type,
            href: `/devices/${d.id}`,
            text: `${d.asset_name} ${d.device_type} ${d.status}`,
          })),
        ),
      )
      .catch(() => {});

    // Per-study collections.
    if (studyId) {
      api
        .listTasks(studyId)
        .then((rows: Task[]) =>
          add(
            rows.map((t) => ({
              kind: "Task" as const,
              id: t.id,
              title: t.name,
              subtitle: t.task_code,
              href: `/tasks/${t.id}`,
              text: `${t.name} ${t.task_code}`,
            })),
          ),
        )
        .catch(() => {});

      api
        .listInventoryItems(studyId)
        .then((rows: InventoryItem[]) =>
          add(
            rows.map((it) => ({
              kind: "Inventory" as const,
              id: it.id,
              title: it.name,
              subtitle: it.kind,
              href: `/inventory/${it.id}`,
              text: `${it.name} ${it.kind} ${it.status}`,
            })),
          ),
        )
        .catch(() => {});

      api
        .listSessions(studyId, isoDate(days[0]), isoDate(days[days.length - 1]))
        .then((rows: Session[]) =>
          add(
            rows.map((s) => ({
              kind: "Session" as const,
              id: s.id,
              title: sessionTitle(s),
              subtitle: s.slot_date ?? "Unscheduled",
              href: `/sessions/${s.id}`,
              text: `${sessionTitle(s)} ${s.state} ${s.slot_date ?? ""}`,
            })),
          ),
        )
        .catch(() => {});
    }

    return () => {
      alive = false;
    };
  }, [studyId]);

  // Global shortcut: Cmd/Ctrl+K opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      // Focus after the overlay mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  // Fuzzy-filter in memory, cap total, then group by kind for rendering.
  const grouped = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as { kind: Kind; hits: Hit[] }[];
    const matched = fuzzyFilter(items, q, (h) => h.text).slice(0, 40);
    return GROUP_ORDER.map((kind) => ({
      kind,
      hits: matched.filter((h) => h.kind === kind),
    })).filter((g) => g.hits.length > 0);
  }, [items, query]);

  const hasQuery = query.trim().length > 0;
  const hasResults = grouped.length > 0;

  return (
    <>
      {/* Trigger — sits on the dashboard, opens the overlay. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left text-sm text-neutral-400 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-colors hover:border-neutral-300"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-neutral-400">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="flex-1">Search studies, tasks, robots…</span>
        <kbd className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/20 px-4 pt-24 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-neutral-100 px-4 py-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-neutral-400">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search studies, tasks, robots, sessions…"
                className="flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
              />
            </div>

            <div className="max-h-96 overflow-y-auto py-1">
              {!hasQuery && (
                <p className="px-4 py-6 text-center text-sm text-neutral-400">
                  Type to search across the study.
                </p>
              )}
              {hasQuery && !hasResults && (
                <p className="px-4 py-6 text-center text-sm text-neutral-400">No matches</p>
              )}
              {grouped.map((group) => (
                <div key={group.kind} className="py-1">
                  <div className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {group.kind}
                  </div>
                  {group.hits.map((h) => (
                    <Link
                      key={`${h.kind}:${h.id}`}
                      href={h.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-neutral-800">{h.title}</span>
                      {h.subtitle && (
                        <span className="shrink-0 truncate text-xs text-neutral-400">{h.subtitle}</span>
                      )}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
