-- Integration credentials, sealed and scoped to the deployment.
--
-- Replaces integration_keys (0005), which stored API keys in plaintext keyed by
-- the caller's display name — a value any request could forge, so any caller
-- could use or overwrite anyone's key. Each CharmQuark deployment serves one
-- customer, so a credential belongs to the deployment, not to a person.
--
-- The old rows are deliberately NOT carried over: they were plaintext and their
-- ownership was unverifiable. Re-enter keys on the Integrations page after
-- setting the INTEGRATION_KEY_SECRET Worker secret.

CREATE TABLE integration_secrets (
  provider   TEXT PRIMARY KEY,
  sealed     TEXT NOT NULL,              -- v1.<iv>.<ciphertext>, see api/src/secrets.ts
  updated_by TEXT,                       -- verified subject of whoever last set it
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

DROP TABLE integration_keys;
