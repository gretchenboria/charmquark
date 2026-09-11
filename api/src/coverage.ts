/**
 * Coverage space — what a campaign actually needs, instead of a rep counter.
 *
 * "Collect 60" says nothing about whether those 60 runs are 60 variations or the
 * same run 60 times. What matters for a physical-AI dataset is the *state space*
 * the fleet has actually visited: lighting x surface x payload x occlusion, and
 * so on. A campaign declares that space; every recorded run reports the cell it
 * was executed in; progress becomes "which cells are still empty" rather than a
 * percentage that can be 100% and still useless.
 *
 * Everything here is PURE — functions from (space, observations) to a coverage
 * state, with no I/O. That keeps the arithmetic testable in isolation and means
 * the scheduler, the API and the UI all score coverage by one definition.
 */

// ---------------------------------------------------------------- the space
export interface CoverageDimension {
  /** Stable identifier used in cell keys. Never shown to a user. */
  key: string;
  /** What an operator sees. */
  label: string;
  /**
   * The discrete levels this dimension can take. Continuous quantities are
   * bucketed deliberately: "0.4 m/s" is not a coverage cell, "slow" is, and the
   * bucket boundaries are a decision the campaign owner should make explicitly.
   */
  levels: string[];
}

export interface CoverageSpace {
  dimensions: CoverageDimension[];
  /** Observations wanted in every cell before the space is considered covered. */
  target_per_cell: number;
}

/**
 * A point in the space: dimension key -> level. A run is executed at exactly one
 * point; a campaign wants `target_per_cell` observations at every point.
 */
export type CoverageCell = Record<string, string>;

/**
 * Guard rail. The cell count is the product of every dimension's levels, so it
 * explodes fast: six dimensions of four levels is 4096 cells, which is not a
 * plan anyone can execute. Refusing to enumerate past this is a kindness — it
 * forces the campaign owner to bucket more coarsely or split the campaign.
 */
export const MAX_CELLS = 512;

export interface SpaceProblem { field: string; reason: string }

/**
 * Validate a space before it is stored. Returns [] when it is usable.
 * `maxCells` is the deployment setting `limits.coverage_max_cells` (stock MAX_CELLS).
 */
export function validateSpace(space: CoverageSpace, maxCells: number = MAX_CELLS): SpaceProblem[] {
  const problems: SpaceProblem[] = [];
  const dims = space.dimensions ?? [];

  if (dims.length === 0) problems.push({ field: "dimensions", reason: "a space needs at least one dimension" });

  const seen = new Set<string>();
  for (const d of dims) {
    if (!d.key || !/^[a-z0-9_]+$/.test(d.key)) {
      problems.push({ field: `dimension.${d.key || "?"}`, reason: "key must be lowercase letters, digits or underscore" });
    }
    if (seen.has(d.key)) problems.push({ field: `dimension.${d.key}`, reason: "duplicate dimension key" });
    seen.add(d.key);
    if (!d.levels || d.levels.length < 2) {
      // A one-level dimension partitions nothing — it is a constant, not a
      // dimension, and it silently doubles the cell count for no information.
      problems.push({ field: `dimension.${d.key}`, reason: "a dimension needs at least two levels" });
    }
    if (new Set(d.levels ?? []).size !== (d.levels ?? []).length) {
      problems.push({ field: `dimension.${d.key}`, reason: "duplicate level" });
    }
  }

  if (!Number.isInteger(space.target_per_cell) || space.target_per_cell < 1) {
    problems.push({ field: "target_per_cell", reason: "must be a positive integer" });
  }

  const total = countCells(space);
  if (total > maxCells) {
    problems.push({
      field: "dimensions",
      reason: `${total} cells exceeds the ${maxCells} limit — bucket a dimension more coarsely, or split the campaign`,
    });
  }
  return problems;
}

export function countCells(space: CoverageSpace): number {
  return (space.dimensions ?? []).reduce((n, d) => n * Math.max(1, (d.levels ?? []).length), 1);
}

// ---------------------------------------------------------------- cell keys
/**
 * Canonical string form of a cell, used as the storage key and for equality.
 * Dimensions are sorted by key so `{a,b}` and `{b,a}` are the same cell — an
 * observation must not be able to miss its own bucket because of key order.
 */
export function cellKey(cell: CoverageCell): string {
  return Object.keys(cell)
    .sort()
    .map((k) => `${k}=${cell[k]}`)
    .join("|");
}

export function parseCellKey(key: string): CoverageCell {
  const cell: CoverageCell = {};
  if (!key) return cell;
  for (const part of key.split("|")) {
    const i = part.indexOf("=");
    if (i > 0) cell[part.slice(0, i)] = part.slice(i + 1);
  }
  return cell;
}

/**
 * Normalise a reported cell against the space: keep only known dimensions with
 * known levels. An unknown dimension or an off-menu level is dropped rather than
 * silently creating a phantom cell that nothing will ever target.
 */
export function normaliseCell(space: CoverageSpace, raw: unknown): { cell: CoverageCell; dropped: string[] } {
  const cell: CoverageCell = {};
  const dropped: string[] = [];
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const d of space.dimensions ?? []) {
    const v = input[d.key];
    if (typeof v === "string" && d.levels.includes(v)) cell[d.key] = v;
    else dropped.push(d.key);
  }
  for (const k of Object.keys(input)) {
    if (!(space.dimensions ?? []).some((d) => d.key === k)) dropped.push(k);
  }
  return { cell, dropped };
}

/** True when the cell names every dimension — only then can it be counted. */
export const isComplete = (space: CoverageSpace, cell: CoverageCell): boolean =>
  (space.dimensions ?? []).every((d) => typeof cell[d.key] === "string");

/** Every cell in the space, in a stable order (first dimension varies slowest). */
export function enumerateCells(space: CoverageSpace): CoverageCell[] {
  let acc: CoverageCell[] = [{}];
  for (const d of space.dimensions ?? []) {
    const next: CoverageCell[] = [];
    for (const partial of acc) {
      for (const level of d.levels) next.push({ ...partial, [d.key]: level });
    }
    acc = next;
  }
  return acc;
}

// ---------------------------------------------------------------- state
export interface CoverageObservation {
  cell_key: string;
  /** Recorded repetitions contributed by one run. */
  count: number;
}

export interface CellState {
  key: string;
  cell: CoverageCell;
  observed: number;
  target: number;
  gap: number;
  /** observed / target, capped at 1 — for colouring, not arithmetic. */
  fill: number;
}

export interface DimensionMarginal {
  key: string;
  label: string;
  levels: { level: string; observed: number; target: number; gap: number }[];
}

export interface CoverageState {
  target_per_cell: number;
  total_cells: number;
  /** Cells with at least one observation. */
  touched_cells: number;
  /** Cells that have reached target. */
  complete_cells: number;
  total_observed: number;
  total_target: number;
  /**
   * The headline number, and deliberately NOT total_observed/total_target:
   * over-collecting one cell must not mask an empty one. This is the fraction of
   * *cells* that have reached target, which cannot be gamed by repetition.
   */
  coverage: number;
  cells: CellState[];
  marginals: DimensionMarginal[];
}

export function computeCoverage(space: CoverageSpace, observations: CoverageObservation[]): CoverageState {
  const target = Math.max(1, space.target_per_cell || 1);

  const observedByKey = new Map<string, number>();
  for (const o of observations) {
    observedByKey.set(o.cell_key, (observedByKey.get(o.cell_key) ?? 0) + Math.max(0, o.count));
  }

  const cells: CellState[] = enumerateCells(space).map((cell) => {
    const key = cellKey(cell);
    const observed = observedByKey.get(key) ?? 0;
    return {
      key,
      cell,
      observed,
      target,
      gap: Math.max(0, target - observed),
      fill: Math.min(1, observed / target),
    };
  });

  const marginals: DimensionMarginal[] = (space.dimensions ?? []).map((d) => ({
    key: d.key,
    label: d.label,
    levels: d.levels.map((level) => {
      const inLevel = cells.filter((c) => c.cell[d.key] === level);
      const observed = inLevel.reduce((n, c) => n + c.observed, 0);
      const t = inLevel.length * target;
      return { level, observed, target: t, gap: Math.max(0, t - observed) };
    }),
  }));

  const complete = cells.filter((c) => c.gap === 0).length;
  return {
    target_per_cell: target,
    total_cells: cells.length,
    touched_cells: cells.filter((c) => c.observed > 0).length,
    complete_cells: complete,
    total_observed: cells.reduce((n, c) => n + c.observed, 0),
    total_target: cells.length * target,
    coverage: cells.length === 0 ? 0 : complete / cells.length,
    cells,
    marginals,
  };
}

// ---------------------------------------------------------------- what next
export interface CellRecommendation {
  key: string;
  cell: CoverageCell;
  gap: number;
  /**
   * Why this cell is worth a run now. Ranking on gap alone sends the fleet to
   * whichever arbitrary cell sorts first among equals; weighting by how starved
   * the cell's *dimension levels* are spreads collection across the space
   * instead of finishing one corner of it.
   */
  priority: number;
  reason: string;
}

/**
 * Rank the cells worth collecting next.
 *
 * Score = gap x starvation, where starvation is the mean gap-fraction of the
 * level each coordinate sits at. A cell that is empty AND sits at levels the
 * campaign has barely touched (say low-light AND grating) outranks an equally
 * empty cell whose levels are otherwise well covered — because it buys more
 * information per run.
 */
export function nextBestCells(state: CoverageState, limit = 10): CellRecommendation[] {
  const starvation = new Map<string, number>();
  for (const m of state.marginals) {
    for (const l of m.levels) {
      starvation.set(`${m.key}=${l.level}`, l.target === 0 ? 0 : l.gap / l.target);
    }
  }

  return state.cells
    .filter((c) => c.gap > 0)
    .map((c) => {
      const coords = Object.keys(c.cell).map((k) => starvation.get(`${k}=${c.cell[k]}`) ?? 0);
      const starved = coords.length ? coords.reduce((a, b) => a + b, 0) / coords.length : 0;
      const thinnest = Object.keys(c.cell)
        .map((k) => ({ k, s: starvation.get(`${k}=${c.cell[k]}`) ?? 0 }))
        .sort((a, b) => b.s - a.s)[0];
      const dim = state.marginals.find((m) => m.key === thinnest?.k);
      return {
        key: c.key,
        cell: c.cell,
        gap: c.gap,
        priority: Number((c.gap * (0.25 + starved)).toFixed(4)),
        reason: c.observed === 0
          ? `never collected${dim ? `; ${dim.label.toLowerCase()} is the thinnest axis here` : ""}`
          : `${c.observed} of ${c.target} collected`,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/** A campaign with no space declared. Coverage is simply not in use. */
export const EMPTY_SPACE: CoverageSpace = { dimensions: [], target_per_cell: 1 };

export const hasSpace = (s: CoverageSpace | null | undefined): boolean =>
  Boolean(s && (s.dimensions ?? []).length > 0);
