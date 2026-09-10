# Coverage space

## Why

A campaign target of "collect 60" cannot distinguish 60 varied runs from the
same run 60 times. For a physical-AI dataset the second is nearly worthless, and
the rep counter reports both as 100%.

A coverage space replaces the counter with the thing that actually matters: the
**state space** the fleet has visited. A campaign declares the conditions it must
cover, every recorded run reports the cell it ran in, and progress becomes "which
combinations are still empty".

## The model

```jsonc
{
  "target_per_cell": 3,
  "dimensions": [
    { "key": "lighting", "label": "Lighting",      "levels": ["bright","normal","low"] },
    { "key": "surface",  "label": "Floor surface", "levels": ["concrete","epoxy","grating"] },
    { "key": "payload",  "label": "Payload",       "levels": ["empty","loaded"] }
  ]
}
```

3 × 3 × 2 = 18 cells, 3 runs each = 54 observations. Continuous quantities are
bucketed deliberately: `0.4 m/s` is not a cell, `slow` is, and where the bucket
boundary falls is a decision the campaign owner should make on purpose.

**Cell count is capped at 512** (`MAX_CELLS`). Six dimensions of four levels is
4096 cells, which is not a plan anyone can execute — the validator refuses it and
says to bucket more coarsely or split the campaign.

## Three decisions worth knowing

**Coverage is the fraction of *cells* complete, not observations collected.**
`total_observed / total_target` would let an over-collected easy cell mask an
empty hard one — precisely the failure this feature exists to catch. The headline
number cannot be moved by repetition.

**Observations are an append-only ledger, never a running total.** A stored total
drifts the moment a run is corrected or a space is redefined, with no way to tell.
Keeping the raw observations means coverage is always recomputable, and changing
the space re-buckets history for free.

**Recording is idempotent per (run, mission).** Re-uploading a corrected sheet
replaces that run's rows rather than stacking a second set, so an operator fixing
an upload cannot inflate coverage. Verified: three uploads of the same run leave
the count unchanged.

## What to collect next

`nextBestCells` ranks gaps by `gap × starvation`, where starvation is the mean
unmet fraction of the levels a cell sits at. Ranking on gap alone sends the fleet
to whichever empty cell sorts first; weighting by how starved each *axis* is
spreads collection across the space instead of finishing one corner. Each
recommendation names the thinnest axis, so the reason is legible:

> `low · grating · loaded` — 3 runs needed, never collected; lighting is the
> thinnest axis here

## Lifecycle

1. `PUT /api/campaigns/:id/coverage-space` — declare it (validated, rejected loudly).
2. `PUT /api/runs/:id/coverage-cell` — tag a run with the conditions it ran under.
   Off-menu levels are **refused**, not dropped: a typo that quietly created a
   phantom cell would leave a gap nothing ever targets.
3. Reconcile the run's recordings (`upload-csv`) — coverage is recorded then, on
   evidence of collection rather than on a run merely being scheduled.
4. `GET /api/campaigns/:id/coverage` — space, per-cell state, per-dimension
   marginals and the ranked next-best cells.

A run collected without a complete cell is **not an error** — it still gathered
data, it just cannot be attributed, and it is reported as `skipped` so the gap is
visible rather than silent.

## The UI

`/coverage`. Two dimensions form the heatmap axes — defaulting to the two with
the largest gaps, since those are the ones worth looking at — and any remaining
dimensions become facets you can hold fixed or sum across.

The colour encoding is deliberate: fill runs along a single-hue ramp toward the
brand violet, but **"never collected" is not the palest step on that ramp**. It
gets a dashed outline instead, because it is a different kind of thing — an
action to take, not a low number — and encoding it as very-light-violet lets the
eye slide past exactly the cells that matter most.

## Not built

- The auto-scheduler does not yet optimise for coverage; it still packs by effort
  budget and repetition gap. Wiring `nextBestCells` into proposal generation is
  the obvious next step and the reason this exists.
- Cells are tagged by hand. Lighting and surface could be derived from the lab and
  a sensor reading rather than an operator dropdown.
- No per-mission coverage: a cell is currently campaign-wide, so "which missions
  have we run in low light" is not answerable yet.
