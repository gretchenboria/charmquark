-- CharmQuark — core schema (D1 / SQLite).
--
-- Ported from the predecessor research-orchestration schema and reshaped for
-- fleet orchestration: research subjects became robots, apartments became labs.
-- Conventions:
--   * ids are TEXT uuidv4
--   * enums are TEXT with CHECK constraints (SQLite has no native enum)
--   * booleans are INTEGER 0/1
--   * JSON value objects are TEXT holding a JSON document
--   * timestamps are TEXT ISO-8601 UTC

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- users (RBAC principal)
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL UNIQUE,   -- login identity
  name        TEXT NOT NULL,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT 'ROBOT_OPERATOR'
              CHECK (role IN ('PM','FLEET_LEAD','ROBOT_OPERATOR')),
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_subject ON users(subject);

-- ---------------------------------------------------------------- studies (fleet programs)
CREATE TABLE studies (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL UNIQUE,
  study_type              TEXT NOT NULL
                          CHECK (study_type IN ('PERCEPTION','MANIPULATION','NAVIGATION')),
  target_n                INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','ACTIVE','PAUSED','COMPLETED','ARCHIVED')),
  default_device_fleet_id TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- task groups
CREATE TABLE task_groups (
  id         TEXT PRIMARY KEY,
  study_id   TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  "order"    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_task_groups_study ON task_groups(study_id);

-- ---------------------------------------------------------------- tasks
CREATE TABLE tasks (
  id                    TEXT PRIMARY KEY,
  study_id              TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  task_group_id         TEXT REFERENCES task_groups(id) ON DELETE SET NULL,
  task_code             TEXT NOT NULL,
  name                  TEXT NOT NULL,
  "group"               TEXT,                       -- legacy free-text group label
  status                TEXT NOT NULL DEFAULT 'NEW'
                        CHECK (status IN ('NEW','SELECTED','IN_PREP','COLLECTABLE')),
  review_status         TEXT NOT NULL DEFAULT 'DRAFT'
                        CHECK (review_status IN ('DRAFT','PENDING_PM_REVIEW','APPROVED','UNAVAILABLE')),
  duration_type         TEXT NOT NULL DEFAULT 'UNSPECIFIED'
                        CHECK (duration_type IN ('SHORT','MEDIUM','LONG','UNSPECIFIED')),
  reps_target           INTEGER NOT NULL DEFAULT 1,
  reps_actual           INTEGER NOT NULL DEFAULT 0,
  schedule_status       TEXT NOT NULL DEFAULT 'AVAILABLE'
                        CHECK (schedule_status IN ('AVAILABLE','IN_PROGRESS','RECORDED')),
  -- readiness gate
  instructions_complete INTEGER NOT NULL DEFAULT 0,
  risk_level            TEXT NOT NULL DEFAULT 'UNKNOWN'
                        CHECK (risk_level IN ('LOW','POTENTIAL','HIGH','UNKNOWN')),
  legal_approval        TEXT NOT NULL DEFAULT 'NONE'
                        CHECK (legal_approval IN ('NONE','PENDING','APPROVED')),
  -- embedded JSON value objects
  variants              TEXT NOT NULL DEFAULT '[]',
  inventory_item_ids    TEXT NOT NULL DEFAULT '[]',
  instructions          TEXT NOT NULL DEFAULT '[]',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_study ON tasks(study_id);
CREATE INDEX idx_tasks_group ON tasks(task_group_id);
CREATE UNIQUE INDEX idx_tasks_study_code ON tasks(study_id, task_code);

-- ---------------------------------------------------------------- task instruction versions
CREATE TABLE task_instruction_versions (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  file_path      TEXT NOT NULL,
  uploaded_by    TEXT,
  notes          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tiv_task ON task_instruction_versions(task_id);

-- ---------------------------------------------------------------- inventory
CREATE TABLE inventory_items (
  id         TEXT PRIMARY KEY,
  study_id   TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('CONSUMABLE','TOOL','PAYLOAD','SPARE_PART')),
  quantity   REAL NOT NULL DEFAULT 1,
  unit       TEXT NOT NULL DEFAULT 'ea',
  status     TEXT NOT NULL DEFAULT 'NEEDED'
             CHECK (status IN ('NEEDED','ORDERED','AVAILABLE','DEPLETED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_inventory_study ON inventory_items(study_id);

-- ---------------------------------------------------------------- robots (the fleet asset)
-- Replaces the predecessor's human research-subject table. The three clearance
-- booleans are the robot's mission-readiness gates; is_cleared is their conjunction.
CREATE TABLE robots (
  id                TEXT PRIMARY KEY,
  robot_code        TEXT NOT NULL UNIQUE,
  name              TEXT,
  platform          TEXT,                        -- platform / morphology family
  serial_number     TEXT,
  status            TEXT NOT NULL DEFAULT 'POOL'
                    CHECK (status IN ('POOL','ACTIVE','MAINTENANCE','RETIRED')),
  -- mission clearance gates
  safety_certified  INTEGER NOT NULL DEFAULT 0,
  calibration_valid INTEGER NOT NULL DEFAULT 0,
  commissioned      INTEGER NOT NULL DEFAULT 0,
  commissioned_date TEXT,
  -- a standby robot is pre-cleared to swap in when a booked robot goes down
  is_standby        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_robots_status ON robots(status);

-- ---------------------------------------------------------------- operators (human staff)
CREATE TABLE operators (
  id            TEXT PRIMARY KEY,
  operator_code TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'ROBOT_OPERATOR'
                CHECK (role IN ('ROBOT_OPERATOR','QA_REVIEWER','FIELD_LEAD','DATA_ENGINEER')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  code_number   INTEGER,                        -- small int used in the session code (m3)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- labs (was: apartments)
CREATE TABLE labs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'LAB_BAY'
               CHECK (type IN ('LAB_BAY','OFFICE','OUTDOORS')),
  is_available INTEGER NOT NULL DEFAULT 1,
  capacity     INTEGER NOT NULL DEFAULT 4,      -- max sessions per day
  code_number  INTEGER,                          -- L1, L2 ...
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lab_blackouts (
  id            TEXT PRIMARY KEY,
  lab_id        TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  blackout_date TEXT NOT NULL,
  slot_time     TEXT,                            -- NULL = whole day
  reason        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_blackouts_lab ON lab_blackouts(lab_id);
CREATE INDEX idx_blackouts_date ON lab_blackouts(blackout_date);

-- ---------------------------------------------------------------- devices (sensor payloads)
CREATE TABLE devices (
  id               TEXT PRIMARY KEY,
  asset_name       TEXT NOT NULL UNIQUE,
  device_type      TEXT NOT NULL,               -- sensor modality; see 0002 for the rig model
  status           TEXT NOT NULL DEFAULT 'OPERATIONAL'
                   CHECK (status IN ('OPERATIONAL','DEGRADED','DOWN','MAINTENANCE','RETIRED')),
  current_study_id TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE device_fleets (
  id         TEXT PRIMARY KEY,
  study_id   TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  device_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_fleets_study ON device_fleets(study_id);

-- ---------------------------------------------------------------- sessions (runs)
CREATE TABLE sessions (
  id                 TEXT PRIMARY KEY,
  study_id           TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  slot_date          TEXT,
  slot_time          TEXT,                       -- "HH:MM", 30-min increments
  state              TEXT NOT NULL DEFAULT 'DRAFT'
                     CHECK (state IN ('DRAFT','ASSEMBLING','READY','CONFIRMED','IN_EXECUTION',
                                      'COLLECTED','EXTRACTED','MANUAL_QA','VALIDATED','UPLOADED',
                                      'DONE','BLOCKED','CANCELLED')),
  -- assembly
  task_scope         TEXT NOT NULL DEFAULT 'GROUP' CHECK (task_scope IN ('GROUP','SINGLE')),
  task_group_id      TEXT REFERENCES task_groups(id) ON DELETE SET NULL,
  task_ids           TEXT NOT NULL DEFAULT '[]',
  task_reps          TEXT NOT NULL DEFAULT '{}',  -- task_id -> planned reps this session
  completed_task_ids TEXT NOT NULL DEFAULT '[]',
  collected_rows     TEXT NOT NULL DEFAULT '[]',
  execution_log      TEXT NOT NULL DEFAULT '{}',  -- task_id -> {done,note,variant_code,updated_at}
  robot_id           TEXT REFERENCES robots(id),
  operator_id        TEXT REFERENCES operators(id),
  lab_id             TEXT REFERENCES labs(id),
  device_fleet_id    TEXT REFERENCES device_fleets(id),
  -- codes (two-phase: provisional -> encoded on confirm)
  provisional_code   TEXT,
  encoded_code       TEXT,
  session_seq        INTEGER,
  -- free-text run inputs captured at accept-proposal time
  payload            TEXT,
  session_lab        TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_study ON sessions(study_id);
CREATE INDEX idx_sessions_date ON sessions(slot_date);
CREATE INDEX idx_sessions_state ON sessions(state);

-- ---------------------------------------------------------------- task executions
CREATE TABLE task_executions (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  variant_id        TEXT NOT NULL,
  execution_spec_id TEXT NOT NULL,
  rep_index         INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'PLANNED'
                    CHECK (status IN ('PLANNED','IN_PROGRESS','DONE','FAILED','SKIPPED')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_texec_session ON task_executions(session_id);
CREATE INDEX idx_texec_task ON task_executions(task_id);

-- ---------------------------------------------------------------- QA pipeline
CREATE TABLE qa_pipeline_runs (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  level          TEXT NOT NULL DEFAULT 'FIELD' CHECK (level IN ('FIELD','LAB','FINAL')),
  overall_status TEXT NOT NULL DEFAULT 'NOT_STARTED'
                 CHECK (overall_status IN ('NOT_STARTED','IN_PROGRESS','PASS','FAIL','WAIVED')),
  gates          TEXT NOT NULL DEFAULT '[]',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- document vault
CREATE TABLE documents (
  id                 TEXT PRIMARY KEY,
  filename           TEXT NOT NULL,
  mime_type          TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_path          TEXT NOT NULL DEFAULT '',   -- R2 object key
  vault_category     TEXT NOT NULL DEFAULT 'OTHER'
                     CHECK (vault_category IN ('RECORDING','INSTRUCTION','REPORT','LEGAL','OTHER')),
  status             TEXT NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','FINAL','ARCHIVED')),
  linked_entity_type TEXT,
  linked_entity_id   TEXT,
  doc_metadata       TEXT NOT NULL DEFAULT '[]',
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_link ON documents(linked_entity_type, linked_entity_id);

-- ---------------------------------------------------------------- workflows (BPMN)
CREATE TABLE workflows (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  xml        TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
