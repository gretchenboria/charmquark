-- CharmQuark — signed credit grants from the central store.
--
-- Credits (and unlimited use) now reach a deployment only as grants the store
-- signs with its Ed25519 key; the deployment verifies them against
-- STORE_PUBLIC_KEY (packages/contracts/src/grants.ts). Every accepted grant is
-- kept here, and its id is the primary key, so a redelivered grant fails the
-- whole batch and credits nothing twice. No BEGIN/COMMIT: D1 supplies the
-- transaction.

CREATE TABLE billing_grants (
  id          TEXT PRIMARY KEY,                -- the grant id, as signed
  account_id  TEXT NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  credits     INTEGER NOT NULL CHECK (credits >= 0),
  unlimited   INTEGER,                         -- NULL: left unchanged; 0/1: set
  reason      TEXT NOT NULL CHECK (reason IN ('PURCHASE','GRANT')),
  note        TEXT,
  token       TEXT NOT NULL,                   -- the signed grant, for audit
  issued_at   TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_grants_account ON billing_grants(account_id, received_at DESC);

-- Which grant a ledger row came from. Grants that only change unlimited write an
-- ADJUSTMENT row with delta 0, so is_unlimited finally has an audit trail.
ALTER TABLE credit_ledger ADD COLUMN grant_id TEXT;
CREATE UNIQUE INDEX idx_ledger_grant ON credit_ledger(grant_id) WHERE grant_id IS NOT NULL;
