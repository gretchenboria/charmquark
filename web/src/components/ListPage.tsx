"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card } from "./ui/Card";
import { fuzzyFilter } from "@/lib/fuzzy";

export interface Column {
  key: string;
  header: string;
}

export type Row = Record<string, ReactNode>;

/** A dropdown filter. `value` of "" means "All" (no filtering on this facet). */
export interface FilterConfig<T> {
  /** Stable id, used as the React key. */
  id: string;
  /** Placeholder shown for the "All" option, e.g. "All statuses". */
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  /** Given an item, return the value to compare against `value`. */
  accessor: (item: T) => string;
}

/** A sortable field. `compare` orders two items ascending. */
export interface SortField<T> {
  id: string;
  label: string;
  compare: (a: T, b: T) => number;
}

export interface SearchConfig<T> {
  /** Text extracted from each item for the fuzzy match. */
  toText: (item: T) => string;
  placeholder?: string;
}

interface ListPageBaseProps {
  title: string;
  toolbar?: ReactNode;
  columns: Column[];
  empty?: string;
}

/** Legacy shape: caller pre-computes rows. No built-in controls. */
interface ListPageRowsProps extends ListPageBaseProps {
  rows: Row[];
  items?: undefined;
}

/** Data shape: caller passes raw items + a row mapper; ListPage owns search/filter/sort. */
interface ListPageItemsProps<T> extends ListPageBaseProps {
  items: T[];
  toRow: (item: T) => Row;
  search?: SearchConfig<T>;
  filters?: FilterConfig<T>[];
  sort?: SortField<T>[];
  rows?: undefined;
}

type ListPageProps<T> = ListPageRowsProps | ListPageItemsProps<T>;

const controlClass =
  "rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none";

function hasItems<T>(p: ListPageProps<T>): p is ListPageItemsProps<T> {
  return Array.isArray((p as ListPageItemsProps<T>).items);
}

/** Simple list-page shell: title, optional toolbar, optional controls, and a table in a card. */
export function ListPage<T>(props: ListPageProps<T>) {
  const { title, toolbar, columns, empty = "Nothing yet." } = props;

  // Control state lives here so callers get search/sort for free.
  const [query, setQuery] = useState("");
  const [sortId, setSortId] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const dataMode = hasItems(props);
  const search = dataMode ? props.search : undefined;
  const filters = dataMode ? props.filters : undefined;
  const sortFields = dataMode ? props.sort : undefined;

  const rows: Row[] = useMemo(() => {
    if (!dataMode) return props.rows;

    let list = props.items;

    // Dropdown facet filters (exact value match; "" = All).
    if (filters) {
      for (const f of filters) {
        if (f.value) list = list.filter((it) => f.accessor(it) === f.value);
      }
    }

    // Fuzzy text search (also orders by relevance while a query is active).
    const searching = !!(search && query.trim());
    if (search && searching) {
      list = fuzzyFilter(list, query, search.toText);
    }

    // Explicit sort overrides fuzzy relevance order when chosen.
    if (sortFields && sortId) {
      const field = sortFields.find((s) => s.id === sortId);
      if (field) {
        list = [...list].sort(field.compare);
        if (sortDir === "desc") list.reverse();
      }
    }

    return list.map(props.toRow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataMode, dataMode ? props.items : undefined, dataMode ? props.rows : undefined, filters, search, query, sortFields, sortId, sortDir]);

  const showControls = dataMode && (!!search || (filters?.length ?? 0) > 0 || (sortFields?.length ?? 0) > 0);

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </header>

      {showControls && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-6 py-2">
          {search && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={search.placeholder ?? "Search"}
              className={`${controlClass} w-56`}
              aria-label="Search"
            />
          )}
          {filters?.map((f) => (
            <select
              key={f.id}
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              className={controlClass}
              aria-label={f.label}
            >
              <option value="">{f.label}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {sortFields && sortFields.length > 0 && (
            <>
              <select
                value={sortId}
                onChange={(e) => setSortId(e.target.value)}
                className={controlClass}
                aria-label="Sort by"
              >
                <option value="">Sort by</option>
                {sortFields.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                disabled={!sortId}
                className={`${controlClass} disabled:cursor-not-allowed disabled:text-neutral-300`}
                aria-label={sortDir === "asc" ? "Ascending" : "Descending"}
                title={sortDir === "asc" ? "Ascending" : "Descending"}
              >
                {sortDir === "asc" ? "Asc" : "Desc"}
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {rows.length === 0 ? (
          <Card>
            <p className="text-sm text-neutral-400">{dataMode && isFiltered(query, filters) ? "No results match your filters." : empty}</p>
          </Card>
        ) : (
          <Card bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-neutral-500">
                    {columns.map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-4 py-2.5 font-medium">
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                      {columns.map((c) => (
                        <td key={c.key} className="whitespace-nowrap px-4 py-2.5 text-neutral-800">
                          {r[c.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function isFiltered<T>(query: string, filters?: FilterConfig<T>[]): boolean {
  return !!query.trim() || (filters?.some((f) => !!f.value) ?? false);
}
