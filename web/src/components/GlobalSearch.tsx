"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/lib/api";
import { isoDate, startOfWeekMonday, weekDays } from "@/lib/dates";
import { fuzzyFilter } from "@/lib/fuzzy";
import type {
  Sensor,
  InventoryItem,
  Lab,
  Operator,
  Robot,
  Run,
  Campaign,
  Mission,
} from "@/lib/types";

// One searchable object, flattened to what the palette needs to render + link.
type Kind =
  | "Campaign"
  | "Mission"
  | "Robot"
  | "Operator"
  | "Lab"
  | "Sensor"
  | "Inventory"
  | "Run";

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
  "Campaign",
  "Mission",
  "Robot",
  "Operator",
  "Lab",
  "Sensor",
  "Inventory",
  "Run",
];

const sessionTitle = (s: Run) =>
  s.provisional_code || s.encoded_code || `Run ${s.id.slice(0, 8)}`;

/**
 * Command-palette-style global search for the dashboard. Loads the main object
 * lists once (campaigns + resources, plus missions/inventory/this-week runs for the
 * selected campaign), then fuzzy-filters entirely in memory so typing stays snappy.
 * All API failures are swallowed — search degrades to whatever loaded.
 */
export function GlobalSearch({ campaignId }: { campaignId: string | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Hit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the searchable corpus once per campaign selection. Each call fails silently
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
      .listCampaigns()
      .then((rows: Campaign[]) =>
        add(
          rows.map((s) => ({
            kind: "Campaign" as const,
            id: s.id,
            title: s.name,
            subtitle: s.campaign_type,
            href: `/campaigns/${s.id}`,
            text: `${s.name} ${s.campaign_type} ${s.status}`,
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
      .listSensors()
      .then((rows: Sensor[]) =>
        add(
          rows.map((d) => ({
            kind: "Sensor" as const,
            id: d.id,
            title: d.asset_name,
            subtitle: d.sensor_type,
            href: `/sensors/${d.id}`,
            text: `${d.asset_name} ${d.sensor_type} ${d.status}`,
          })),
        ),
      )
      .catch(() => {});

    // Per-campaign collections.
    if (campaignId) {
      api
        .listMissions(campaignId)
        .then((rows: Mission[]) =>
          add(
            rows.map((t) => ({
              kind: "Mission" as const,
              id: t.id,
              title: t.name,
              subtitle: t.mission_code,
              href: `/missions/${t.id}`,
              text: `${t.name} ${t.mission_code}`,
            })),
          ),
        )
        .catch(() => {});

      api
        .listInventoryItems(campaignId)
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
        .listRuns(campaignId, isoDate(days[0]), isoDate(days[days.length - 1]))
        .then((rows: Run[]) =>
          add(
            rows.map((s) => ({
              kind: "Run" as const,
              id: s.id,
              title: sessionTitle(s),
              subtitle: s.slot_date ?? "Unscheduled",
              href: `/runs/${s.id}`,
              text: `${sessionTitle(s)} ${s.state} ${s.slot_date ?? ""}`,
            })),
          ),
        )
        .catch(() => {});
    }

    return () => {
      alive = false;
    };
  }, [campaignId]);

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
        <span className="flex-1">Search campaigns, missions, robots…</span>
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
                placeholder="Search campaigns, missions, robots, runs…"
                className="flex-1 bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
              />
            </div>

            <div className="max-h-96 overflow-y-auto py-1">
              {!hasQuery && (
                <p className="px-4 py-6 text-center text-sm text-neutral-400">
                  Type to search across the campaign.
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
