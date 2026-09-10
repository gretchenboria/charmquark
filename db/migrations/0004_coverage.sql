-- Coverage space — what a campaign needs, instead of a rep counter.
--
-- "Collect 60" cannot distinguish 60 variations from the same run 60 times. A
-- campaign declares the state space it must visit (lighting x surface x payload
-- ...), every recorded run reports the cell it ran in, and progress becomes
-- which cells are still empty.

-- The space itself: a JSON document on the campaign. Null/absent means this
-- campaign does not use coverage, and everything falls back to rep counting.
ALTER TABLE campaigns ADD COLUMN coverage_space TEXT;

-- The cell a run was executed in, as JSON {dimension_key: level}. Set when the
-- run is assembled or accepted; required before a run can be recorded against
-- coverage, but never required to schedule one.
ALTER TABLE runs ADD COLUMN coverage_cell TEXT;

-- Append-only observation ledger.
--
-- Coverage is derived, never stored as a running total: a total drifts the
-- moment a run is corrected or a space is redefined, and there would be no way
-- to tell. Keeping the observations means coverage can always be recomputed
-- from what actually happened, and a changed space re-buckets history for free.
CREATE TABLE coverage_observations (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  -- Canonical cell key (dimensions sorted), so equality is string equality.
  cell_key    TEXT NOT NULL,
  -- Repetitions this run contributed to the cell.
  count       INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  mission_id  TEXT REFERENCES missions(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A run contributes to a mission's cell at most once. Re-recording a run
-- replaces its rows rather than stacking a second set on top, so an operator
-- correcting an upload cannot inflate coverage.
CREATE UNIQUE INDEX idx_coverage_run_mission
  ON coverage_observations(run_id, COALESCE(mission_id, ''));

CREATE INDEX idx_coverage_campaign ON coverage_observations(campaign_id, cell_key);
