-- Phase 2: optimistic concurrency, an audit trail, API tokens for agents, and
-- workflow version history.
--
-- Why each piece exists:
--   * version  — humans in the UI and agents over MCP now edit the same records.
--                Without a version check the later save silently overwrites the
--                earlier one. Clients send If-Match: <version>; a stale write is a
--                409 carrying the current record.
--   * audit    — "who changed this, and was it a person or an agent?" must have
--                an answer that is not a guess.
--   * tokens   — agents cannot do a browser sign-in; a scoped, revocable token
--                acting as its user is how they authenticate.

-- ---------------------------------------------------------------- version columns
-- A trigger bumps `version` on EVERY update, not only the ones that go through
-- the generic PATCH helper — confirm, advance, auto-schedule and QA writes all
-- change a record too, and an If-Match that ignored them would be a lie.
-- SQLite does not recurse into triggers by default, so the trigger's own UPDATE
-- does not fire it again.
ALTER TABLE campaigns       ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE mission_groups  ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE missions        ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE inventory_items ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE robots          ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE operators       ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE labs            ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE lab_blackouts   ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sensors         ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sensor_rigs     ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE runs            ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users           ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE documents       ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE workflows       ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

CREATE TRIGGER trg_campaigns_version AFTER UPDATE ON campaigns FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE campaigns SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_mission_groups_version AFTER UPDATE ON mission_groups FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE mission_groups SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_missions_version AFTER UPDATE ON missions FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE missions SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_inventory_items_version AFTER UPDATE ON inventory_items FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE inventory_items SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_robots_version AFTER UPDATE ON robots FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE robots SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_operators_version AFTER UPDATE ON operators FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE operators SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_labs_version AFTER UPDATE ON labs FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE labs SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_lab_blackouts_version AFTER UPDATE ON lab_blackouts FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE lab_blackouts SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_sensors_version AFTER UPDATE ON sensors FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE sensors SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_sensor_rigs_version AFTER UPDATE ON sensor_rigs FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE sensor_rigs SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_runs_version AFTER UPDATE ON runs FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE runs SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_users_version AFTER UPDATE ON users FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE users SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_documents_version AFTER UPDATE ON documents FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE documents SET version = OLD.version + 1 WHERE id = NEW.id; END;
CREATE TRIGGER trg_workflows_version AFTER UPDATE ON workflows FOR EACH ROW WHEN NEW.version = OLD.version
BEGIN UPDATE workflows SET version = OLD.version + 1 WHERE id = NEW.id; END;

-- ---------------------------------------------------------------- audit trail
-- Append-only. before/after are the serialized records, so the Activity view can
-- show a field-level diff and a change can be reverted by hand.
CREATE TABLE audit_events (
  id            TEXT PRIMARY KEY,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  actor_subject TEXT NOT NULL,
  actor_name    TEXT,
  via           TEXT NOT NULL CHECK (via IN ('firebase','pat','dev-shim','system')),
  resource      TEXT NOT NULL,              -- registry path, e.g. "labs"
  entity_id     TEXT,
  action        TEXT NOT NULL,              -- create | update | delete | a named action
  before_json   TEXT,
  after_json    TEXT
);
CREATE INDEX idx_audit_entity ON audit_events(resource, entity_id, at);
CREATE INDEX idx_audit_at ON audit_events(at);

-- ---------------------------------------------------------------- API tokens
-- The token itself is shown once at creation and never stored — only its
-- SHA-256. A token acts as its user (never more), narrowed further by scopes.
CREATE TABLE personal_access_tokens (
  id           TEXT PRIMARY KEY,
  user_subject TEXT NOT NULL,
  name         TEXT NOT NULL,
  token_prefix TEXT NOT NULL,               -- first characters, to recognise it in a list
  token_hash   TEXT NOT NULL UNIQUE,
  scopes       TEXT NOT NULL DEFAULT '["read"]',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  expires_at   TEXT,
  revoked_at   TEXT
);
CREATE INDEX idx_pat_user ON personal_access_tokens(user_subject);

-- ---------------------------------------------------------------- workflow history
-- Each save keeps the diagram it replaced, so an agent-generated or hand edit
-- can be compared and rolled back.
CREATE TABLE workflow_versions (
  id          TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  xml         TEXT NOT NULL,
  saved_by    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workflow_id, version)
);

-- ---------------------------------------------------------------- dead table
-- Never read or written by any code; per-mission execution lives in runs.execution_log.
DROP TABLE mission_executions;
