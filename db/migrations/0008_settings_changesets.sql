-- Phase 2b: deployment settings and change sets.
--
--   * settings   — the scheduling, risk and limit rules that were constants in
--                  code. Only overrides are stored; a missing key means the
--                  default in packages/contracts/src/settings.ts, so an empty
--                  table behaves exactly as before.
--   * changesets — a batch of edits previewed first and applied atomically. How
--                  an agent proposes a change a human (or the agent) then applies,
--                  and how config-as-code imports land.

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                 -- JSON
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  version    INTEGER NOT NULL DEFAULT 1
);
CREATE TRIGGER trg_settings_version AFTER UPDATE ON settings FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE settings SET version = OLD.version + 1 WHERE key = NEW.key; END;

CREATE TABLE changesets (
  id          TEXT PRIMARY KEY,
  created_by  TEXT NOT NULL,                -- subject
  via         TEXT NOT NULL,                -- firebase | pat | dev-shim
  status      TEXT NOT NULL DEFAULT 'PREVIEWED'
              CHECK (status IN ('PREVIEWED','APPLIED','REJECTED')),
  summary     TEXT,
  changes     TEXT NOT NULL,                -- JSON: the requested edits
  preview     TEXT NOT NULL,                -- JSON: per-change diff and problems at preview time
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at  TEXT,
  applied_by  TEXT                          -- subject; may differ from created_by (an agent proposes, a person applies)
);
CREATE INDEX idx_changesets_created ON changesets(created_at);

-- Apply runs every edit in one D1 batch (a transaction). A version-guarded
-- UPDATE that matches no row does not fail on its own, so each guarded edit
-- first inserts `ok = (version is still what was previewed)` here: a stale row
-- makes the CHECK fail, which aborts and rolls back the whole batch. The table
-- is emptied at the end of every successful batch.
CREATE TABLE changeset_guards (
  ok INTEGER NOT NULL CHECK (ok = 1)
);
