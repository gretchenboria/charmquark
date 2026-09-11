-- BYOK Multi-Tenant Integrations
CREATE TABLE integration_keys (
  subject    TEXT NOT NULL,
  provider   TEXT NOT NULL,
  api_key    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subject, provider)
);
