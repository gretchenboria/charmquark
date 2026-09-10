/** D1 helpers: id generation, JSON column (de)serialization, row shaping. */
import { storageUnavailable } from "./errors";

export const uuid = (): string => crypto.randomUUID();

export const nowIso = (): string => new Date().toISOString().replace("T", " ").slice(0, 19);

/** SQLite has no boolean type; the schema stores 0/1. */
export const toBool = (v: unknown): boolean => v === 1 || v === true || v === "1";
export const fromBool = (v: unknown): number => (v ? 1 : 0);

/** Parse a JSON text column, falling back to `fallback` on null/garbage. */
export function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const jsonCol = (v: unknown): string => JSON.stringify(v ?? null);

/** Row type coming back from D1 — every column is a JS primitive or null. */
export type Row = Record<string, unknown>;

export const str = (r: Row, k: string): string => String(r[k] ?? "");
export const strOrNull = (r: Row, k: string): string | null =>
  r[k] === null || r[k] === undefined ? null : String(r[k]);
export const num = (r: Row, k: string, d = 0): number => {
  const v = r[k];
  return v === null || v === undefined ? d : Number(v);
};
export const numOrNull = (r: Row, k: string): number | null =>
  r[k] === null || r[k] === undefined ? null : Number(r[k]);

/**
 * Build a partial UPDATE from a whitelist of columns present in `body`.
 * Returns null when the body touches none of them, so callers can skip the write.
 */
export function buildUpdate(
  table: string,
  id: string,
  body: Record<string, unknown>,
  columns: readonly string[],
  transform: Record<string, (v: unknown) => unknown> = {},
): { sql: string; params: unknown[] } | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const col of columns) {
    if (!(col in body)) continue;
    const raw = body[col];
    sets.push(`"${col}" = ?`);
    params.push(transform[col] ? transform[col]!(raw) : raw);
  }
  if (sets.length === 0) return null;
  sets.push(`updated_at = datetime('now')`);
  params.push(id);
  return { sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, params };
}

/** Narrow the optional VAULT binding, or fail with a 503 that says why. */
export function requireVault(env: { VAULT?: R2Bucket }): R2Bucket {
  if (!env.VAULT) {
    // Imported lazily to keep this module free of route-layer deps.
    throw storageUnavailable();
  }
  return env.VAULT;
}
