"use client";

/**
 * Coverage — where the fleet has and has not been.
 *
 * The design question here is "what do I collect next?", and the page is built
 * to answer it in one glance and one click:
 *
 *   1. a headline that cannot be gamed (fraction of CELLS complete, not
 *      observations, so over-collecting the easy corner never reads as done);
 *   2. a heatmap you can scan for holes without reading a number;
 *   3. the ranked next-best cells sitting directly beside it, because a gap you
 *      cannot act on is just a chart.
 *
 * With more than two dimensions a flat grid is a lie, so two are chosen as axes
 * (defaulting to the two with the largest gaps — the ones worth looking at) and
 * the rest become facets you can hold fixed or sum across.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useUser } from "@/lib/useUser";
import { CampaignHeader } from "@/components/CampaignHeader";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/Toast";
import type { Campaign, CellState, CoverageReport, CoverageSpace } from "@/lib/types";

const ALL = "__all__";

/** A starter space, so a new campaign is one click from useful rather than a blank form. */
const STARTER: CoverageSpace = {
  target_per_cell: 3,
  dimensions: [
    { key: "lighting", label: "Lighting", levels: ["bright", "normal", "low"] },
    { key: "surface", label: "Floor surface", levels: ["concrete", "epoxy", "grating"] },
    { key: "payload", label: "Payload", levels: ["empty", "loaded"] },
  ],
};

/**
 * Sequential ramp along the brand's own axis: the fuller a cell, the deeper the
 * violet. "Never collected" is deliberately NOT the palest step on that ramp —
 * it gets an outline instead, because it is a different kind of thing (an action
 * to take, not a low number) and encoding it as "very light violet" would let
 * the eye slide past exactly the cells that matter most.
 */
function cellStyle(c: CellState): React.CSSProperties {
  if (c.observed === 0) {
    return {
      background: "repeating-linear-gradient(135deg, transparent, transparent 5px, rgba(109,40,168,.07) 5px, rgba(109,40,168,.07) 10px)",
      border: "1.5px dashed rgba(109,40,168,.35)",
      color: "var(--cq-ink-faint)",
    };
  }
  // 0 < fill <= 1 mapped onto lilac -> brand violet.
  const t = Math.min(1, c.fill);
  const bg = `color-mix(in srgb, var(--cq-violet) ${Math.round(18 + t * 82)}%, #ffffff)`;
  return {
    background: bg,
    border: "1px solid transparent",
    color: t > 0.55 ? "#fff" : "var(--cq-ink)",
  };
}

export default function CoveragePage() {
  const user = useUser();
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowKey, setRowKey] = useState<string>("");
  const [colKey, setColKey] = useState<string>("");
  const [facets, setFacets] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<CellState | null>(null);

  useEffect(() => {
    api.listCampaigns()
      .then((cs) => {
        setCampaigns(cs);
        setCampaignId((prev) => prev ?? cs[0]?.id ?? null);
      })
      .catch(() => setCampaigns([]));
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setReport(await api.getCoverage(id));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not load coverage");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (campaignId) void load(campaignId); }, [campaignId, load]);

  const space = report?.space ?? null;
  const state = report?.state ?? null;

  // Default the axes to the two dimensions carrying the most unmet need — the
  // pair most worth looking at — rather than whichever happen to be declared first.
  useEffect(() => {
    if (!space || !state || rowKey) return;
    const byGap = [...state.marginals]
      .map((m) => ({ key: m.key, gap: m.levels.reduce((n, l) => n + l.gap, 0) }))
      .sort((a, b) => b.gap - a.gap);
    setRowKey(byGap[0]?.key ?? space.dimensions[0]?.key ?? "");
    setColKey(byGap[1]?.key ?? space.dimensions[1]?.key ?? space.dimensions[0]?.key ?? "");
    const rest = space.dimensions.filter((d) => d.key !== byGap[0]?.key && d.key !== byGap[1]?.key);
    setFacets(Object.fromEntries(rest.map((d) => [d.key, ALL])));
  }, [space, state, rowKey]);

  const rowDim = space?.dimensions.find((d) => d.key === rowKey) ?? null;
  const colDim = space?.dimensions.find((d) => d.key === colKey) ?? null;
  const facetDims = useMemo(
    () => (space?.dimensions ?? []).filter((d) => d.key !== rowKey && d.key !== colKey),
    [space, rowKey, colKey],
  );

  /**
   * Cells for one square of the grid. When a facet is held at "all" the squares
   * aggregate across it, so the grid always shows the whole space rather than an
   * arbitrary slice — the alternative silently hides gaps.
   */
  const squareFor = useCallback((rowLevel: string, colLevel: string): CellState[] => {
    if (!state || !rowDim || !colDim) return [];
    return state.cells.filter((c) => {
      if (c.cell[rowDim.key] !== rowLevel || c.cell[colDim.key] !== colLevel) return false;
      return facetDims.every((d) => facets[d.key] === ALL || c.cell[d.key] === facets[d.key]);
    });
  }, [state, rowDim, colDim, facetDims, facets]);

  const aggregate = (cells: CellState[]) => {
    const observed = cells.reduce((n, c) => n + c.observed, 0);
    const target = cells.reduce((n, c) => n + c.target, 0);
    return { observed, target, gap: Math.max(0, target - observed), fill: target ? Math.min(1, observed / target) : 0 };
  };

  const applyStarter = async () => {
    if (!campaignId) return;
    try {
      setReport(await api.setCoverageSpace(campaignId, STARTER));
      toast("success", "Coverage space created — edit the dimensions to match your campaign.");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not create the space");
    }
  };

  const header = (
    <CampaignHeader title="Coverage" campaigns={campaigns} campaignId={campaignId} onChange={setCampaignId} />
  );

  if (loading) {
    return <div className="flex h-full flex-col">{header}<div className="p-6 text-sm text-[color:var(--cq-ink-faint)]">Loading coverage…</div></div>;
  }

  // --- not configured: offer the one-click path, never a blank JSON form ---
  if (!report?.configured || !space || !state) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="max-w-xl">
            <div className="p-2">
              <h2 className="cq-display text-lg font-semibold">Measure coverage, not repetitions</h2>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--cq-ink-soft)]">
                A target of “60 runs” cannot tell 60 varied runs from the same run 60 times.
                Declare the conditions this campaign needs to visit — lighting, floor surface,
                payload — and CharmQuark tracks which combinations the fleet has actually seen,
                then tells you which to collect next.
              </p>
              <button onClick={applyStarter} className="cq-btn-primary mt-4 rounded-lg px-4 py-2 text-sm font-medium">
                Start with a warehouse template
              </button>
              <p className="mt-2 text-xs text-[color:var(--cq-ink-faint)]">
                3 × 3 × 2 = 18 combinations, 3 runs each. You can change the dimensions afterwards.
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const pct = Math.round(state.coverage * 100);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {header}
      <div className="flex-1 overflow-y-auto p-6">
        {/* --- headline --- */}
        <Card className="mb-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 p-2">
            <div>
              <div className="text-xs font-medium text-[color:var(--cq-ink-soft)]">Coverage</div>
              <div className="cq-display cq-gradient-text text-4xl font-semibold leading-none tabular-nums">{pct}%</div>
            </div>
            <div className="min-w-[220px] flex-1">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--cq-line)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: "var(--cq-gradient)" }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-[color:var(--cq-ink-faint)]">
                <span><b className="text-[color:var(--cq-ink)]">{state.complete_cells}</b> of {state.total_cells} combinations complete</span>
                <span>{state.total_observed} of {state.total_target} runs</span>
              </div>
            </div>
            {state.total_cells - state.touched_cells > 0 && (
              <div className="rounded-lg px-3 py-2 text-xs"
                   style={{ background: "color-mix(in srgb, var(--cq-apricot) 12%, #fff)", color: "#7a4a10" }}>
                <b>{state.total_cells - state.touched_cells}</b> combinations never collected
              </div>
            )}
          </div>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* --- the map --- */}
          <Card title="Where the gaps are" subtitle="Darker means better covered. Dashed means never collected.">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-[color:var(--cq-ink-faint)]">Rows</span>
                <select className="cq-select" value={rowKey} onChange={(e) => { setRowKey(e.target.value); setSelected(null); }}>
                  {space.dimensions.map((d) => <option key={d.key} value={d.key} disabled={d.key === colKey}>{d.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-[color:var(--cq-ink-faint)]">Columns</span>
                <select className="cq-select" value={colKey} onChange={(e) => { setColKey(e.target.value); setSelected(null); }}>
                  {space.dimensions.map((d) => <option key={d.key} value={d.key} disabled={d.key === rowKey}>{d.label}</option>)}
                </select>
              </label>
              {facetDims.map((d) => (
                <label key={d.key} className="flex items-center gap-1.5">
                  <span className="text-[color:var(--cq-ink-faint)]">{d.label}</span>
                  <select
                    className="cq-select"
                    value={facets[d.key] ?? ALL}
                    onChange={(e) => { setFacets({ ...facets, [d.key]: e.target.value }); setSelected(null); }}
                  >
                    <option value={ALL}>All</option>
                    {d.levels.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              ))}
            </div>

            {rowDim && colDim && (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-1">
                  <thead>
                    <tr>
                      <th className="w-24" />
                      {colDim.levels.map((cl) => (
                        <th key={cl} className="pb-1 text-center text-xs font-medium capitalize text-[color:var(--cq-ink-soft)]">{cl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowDim.levels.map((rl) => (
                      <tr key={rl}>
                        <th className="pr-2 text-right text-xs font-medium capitalize text-[color:var(--cq-ink-soft)]">{rl}</th>
                        {colDim.levels.map((cl) => {
                          const cells = squareFor(rl, cl);
                          const agg = aggregate(cells);
                          const single = cells.length === 1 ? cells[0]! : null;
                          const style = single
                            ? cellStyle(single)
                            : cellStyle({ ...agg, key: "", cell: {} } as CellState);
                          const isSel = selected && cells.some((c) => c.key === selected.key);
                          return (
                            <td key={cl}>
                              <button
                                onClick={() => setSelected(single ?? cells[0] ?? null)}
                                title={`${rowDim.label} ${rl} · ${colDim.label} ${cl} — ${agg.observed} of ${agg.target}`}
                                className="flex h-14 w-full flex-col items-center justify-center rounded-lg text-sm font-semibold tabular-nums transition-transform hover:scale-[1.04] focus-visible:scale-[1.04]"
                                style={{ ...style, outline: isSel ? "2px solid var(--cq-iris)" : undefined, outlineOffset: 2 }}
                              >
                                <span>{agg.observed}</span>
                                <span className="text-[10px] font-normal opacity-70">of {agg.target}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend. The dashed swatch is called out separately because "never
                collected" is an action, not just a low number. */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-[color:var(--cq-ink-faint)]">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-3.5 w-6 rounded"
                   style={{ background: "repeating-linear-gradient(135deg,transparent,transparent 5px,rgba(109,40,168,.07) 5px,rgba(109,40,168,.07) 10px)", border: "1.5px dashed rgba(109,40,168,.35)" }} />
                never collected
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-3.5 w-6 rounded" style={{ background: "color-mix(in srgb, var(--cq-violet) 30%, #fff)" }} />
                partial
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-3.5 w-6 rounded" style={{ background: "var(--cq-violet)" }} />
                target met
              </span>
              <span className="ml-auto">
                Each square shows runs collected of runs needed
                {facetDims.some((d) => (facets[d.key] ?? ALL) === ALL) ? ", summed across “All” filters" : ""}.
              </span>
            </div>

            {selected && (
              <div className="mt-3 rounded-lg border border-[color:var(--cq-line)] bg-[color:var(--cq-ground)] p-3 text-xs">
                <div className="font-medium text-[color:var(--cq-ink)]">
                  {Object.entries(selected.cell).map(([k, v]) => (
                    <span key={k} className="mr-2 capitalize">{v}</span>
                  ))}
                </div>
                <div className="mt-1 text-[color:var(--cq-ink-soft)]">
                  {selected.observed} of {selected.target} runs collected
                  {selected.gap > 0 ? ` — ${selected.gap} still needed.` : " — complete."}
                </div>
              </div>
            )}
          </Card>

          {/* --- the action --- */}
          <div className="space-y-4">
            <Card title="Collect next" subtitle="Ranked by how much each fills the map.">
              {report.next.length === 0 ? (
                <p className="text-sm text-[color:var(--cq-sage)]">Every combination has met its target.</p>
              ) : (
                <ol className="space-y-2">
                  {report.next.slice(0, 6).map((n, i) => (
                    <li key={n.key} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                            style={{ background: "color-mix(in srgb, var(--cq-violet) 12%, #fff)", color: "var(--cq-violet)" }}>
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium capitalize text-[color:var(--cq-ink)]">
                          {Object.values(n.cell).join(" · ")}
                        </div>
                        <div className="text-xs text-[color:var(--cq-ink-faint)]">
                          {n.gap} run{n.gap === 1 ? "" : "s"} needed — {n.reason}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card title="By condition" subtitle="Which axis is starving.">
              <div className="space-y-3">
                {state.marginals.map((m) => (
                  <div key={m.key}>
                    <div className="mb-1 text-xs font-medium text-[color:var(--cq-ink-soft)]">{m.label}</div>
                    {m.levels.map((l) => {
                      const p = l.target ? Math.min(100, Math.round((l.observed / l.target) * 100)) : 0;
                      return (
                        <div key={l.level} className="mb-1 flex items-center gap-2">
                          <span className="w-20 shrink-0 truncate text-xs capitalize text-[color:var(--cq-ink-faint)]">{l.level}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--cq-line)]">
                            <div className="h-full rounded-full"
                                 style={{ width: `${p}%`, background: p < 34 ? "var(--cq-apricot)" : "var(--cq-violet)" }} />
                          </div>
                          <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-[color:var(--cq-ink-faint)]">
                            {l.observed}/{l.target}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
