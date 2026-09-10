-- CharmQuark — QA autocheck and the Roboflow annotation handoff (D1 / SQLite).
--
-- Two things land here. First, QA stops being a hand-ticked checklist: a run
-- manifest (what actually got captured, per sensor, per segment) is evaluated
-- against an *expectation profile* (what should have been captured) and the gate
-- results are produced by machine. Second, the far end of that pipeline — a
-- QA-passed run's imagery going out for annotation — gets a lineage table.
--
-- Same conventions as 0001 and 0002: TEXT uuid ids, TEXT enums, TEXT JSON,
-- INTEGER 0/1 booleans, TEXT ISO timestamps. No BEGIN/COMMIT — D1 supplies the
-- transaction and rejects explicit transaction control.

-- ---------------------------------------------------------------- expectation profiles
-- The profile is JSON rather than a table because it is *configuration for one
-- deployment's capture stack*, not a shared domain concept: sensor keys, file
-- extensions, per-minute size budgets and tolerance bands change per study and
-- would otherwise be six join tables nobody queries. Its shape and defaults are
-- in api/src/qaAutocheck.ts; docs/QA_AUTOCHECK.md carries a worked example.
--
-- Resolution order at check time is rig -> campaign -> the built-in robotics
-- default, so a rig can specialise without every campaign having to define one.
ALTER TABLE sensor_rigs ADD COLUMN qa_profile TEXT;
ALTER TABLE campaigns   ADD COLUMN qa_profile TEXT;

-- ---------------------------------------------------------------- QA autocheck state
-- `mode` records how the gates were produced. It matters because the two modes
-- mean different things: MANUAL gates are a human's opinion of a run, AUTOCHECK
-- gates are a machine's reading of a manifest that a human may then override.
ALTER TABLE qa_pipeline_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'MANUAL';

-- Step 6's verdict: ACCEPT | ACCEPT_WITH_WARNINGS | REJECT. Stored rather than
-- recomputed on read so the answer that was acted on is the answer on record,
-- and recomputed on every override so it never goes stale.
ALTER TABLE qa_pipeline_runs ADD COLUMN verdict TEXT;

-- The manifest the verdict was computed from, kept verbatim. Without it a FAIL
-- is unreproducible: the object it named may already have been deleted, which is
-- exactly what the operator was told to do about it.
ALTER TABLE qa_pipeline_runs ADD COLUMN manifest TEXT;

-- Which profile was in force, by name, and when the machine last ran. Both are
-- displayed, so a stale result is visibly stale.
ALTER TABLE qa_pipeline_runs ADD COLUMN profile_name TEXT;
ALTER TABLE qa_pipeline_runs ADD COLUMN autochecked_at TEXT;

-- ---------------------------------------------------------------- Roboflow export lineage
-- One row per push of a run's imagery into a Roboflow project. This is a lineage
-- record, not a job queue: it answers "which run did these annotations come
-- from", which is the question that gets asked six months later when a model
-- misbehaves and nobody remembers which collection fed it.
--
-- No FK to any Roboflow id — those live in someone else's database and we only
-- record what their API told us.
CREATE TABLE roboflow_exports (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  workspace      TEXT,                          -- Roboflow workspace url slug, when known
  project        TEXT NOT NULL,                 -- Roboflow project id / url slug
  batch          TEXT,                          -- upload batch name, groups the images for labelling
  split          TEXT NOT NULL DEFAULT 'train'
                 CHECK (split IN ('train','valid','test')),
  status         TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','COMPLETE','PARTIAL','FAILED')),
  image_count    INTEGER NOT NULL DEFAULT 0,    -- images accepted by Roboflow
  duplicate_count INTEGER NOT NULL DEFAULT 0,   -- images Roboflow reported as already present
  failed_count   INTEGER NOT NULL DEFAULT 0,
  -- [{document_id, filename, roboflow_id, duplicate, error}] — the per-image
  -- receipt. JSON because it is read as a block and never queried across rows.
  results        TEXT NOT NULL DEFAULT '[]',
  -- Set once a dataset version is cut from these images. Nullable and left null
  -- by the export path: version generation has no documented REST endpoint, so
  -- CharmQuark records the linkage rather than pretending to create it.
  dataset_version TEXT,
  error          TEXT,
  created_by     TEXT,                          -- principal name, for audit
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_roboflow_exports_run ON roboflow_exports(run_id, created_at DESC);
