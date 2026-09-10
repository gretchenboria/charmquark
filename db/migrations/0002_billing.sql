-- CharmQuark — metered run credits (D1 / SQLite).
--
-- One credit buys one CONFIRMED run: the moment a run passes every readiness
-- gate, takes its day sequence number, mints its encoded code and books the lab
-- slot. Drafts, proposals and auto-filled ASSEMBLING runs are free — planning is
-- not the product, committed lab time is. See docs/BILLING.md.
--
-- Same conventions as 0001: TEXT uuid ids, INTEGER 0/1 booleans, TEXT ISO
-- timestamps. No BEGIN/COMMIT — D1 supplies the transaction and rejects
-- explicit transaction control.

-- ---------------------------------------------------------------- the account that holds credits
-- One row per paying organisation. CharmQuark is single-tenant today (one fleet
-- ops team per deployment), so there is exactly one row and every user of the
-- deployment spends from it — a shared team wallet, not a per-browser code.
CREATE TABLE billing_accounts (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  -- Spendable run credits. The CHECK is the last line of defence behind the
  -- guarded decrement in api/src/routes/billing.ts: a balance can never go
  -- negative, so a lost race fails the write rather than overdrawing.
  balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_granted INTEGER NOT NULL DEFAULT 0,
  lifetime_spent   INTEGER NOT NULL DEFAULT 0,
  -- House/dev accounts that are never debited (the equivalent of a comp grant).
  -- Deliberately settable only by SQL — there is no API route that flips it.
  is_unlimited     INTEGER NOT NULL DEFAULT 0,
  contact_email    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- the immutable ledger
-- Append-only. Nothing updates or deletes a row here, because "what did we pay
-- for, and what spent it" is the question a fleet ops customer asks at renewal.
-- `balance_after` is recorded at write time so the history reconciles without
-- replaying every row.
CREATE TABLE credit_ledger (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  delta               INTEGER NOT NULL,           -- +granted / -spent
  reason              TEXT NOT NULL
                      CHECK (reason IN ('PURCHASE','GRANT','DEBIT','REFUND','ADJUSTMENT')),
  balance_after       INTEGER NOT NULL,
  run_id              TEXT,                       -- set on DEBIT / REFUND
  checkout_session_id TEXT,                       -- set on PURCHASE
  stripe_event_id     TEXT,                       -- set on PURCHASE
  actor               TEXT,                       -- principal name, for audit
  note                TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A run can be charged at most once, forever. This is the hard backstop behind
-- the "already CONFIRMED" early return: two concurrent confirms of the same run
-- race here, one insert wins, the loser's whole batch rolls back uncharged.
CREATE UNIQUE INDEX idx_ledger_run_debit
  ON credit_ledger(run_id) WHERE reason = 'DEBIT' AND run_id IS NOT NULL;

-- Webhook idempotency, twice over: Stripe retries deliver the same event id, and
-- a different event type for the same purchase still carries the same session id.
CREATE UNIQUE INDEX idx_ledger_stripe_event
  ON credit_ledger(stripe_event_id) WHERE stripe_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ledger_purchase_session
  ON credit_ledger(checkout_session_id) WHERE reason = 'PURCHASE' AND checkout_session_id IS NOT NULL;

CREATE INDEX idx_ledger_account ON credit_ledger(account_id, created_at DESC);

-- ---------------------------------------------------------------- Stripe checkout sessions
-- Written when checkout starts (PENDING) and completed by the webhook. The
-- browser polls this row after returning from Stripe, which is what makes the
-- post-purchase balance appear without a page reload.
CREATE TABLE billing_checkout_sessions (
  id              TEXT PRIMARY KEY,               -- Stripe checkout session id (cs_...)
  account_id      TEXT NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  pack_id         TEXT NOT NULL,
  credits         INTEGER NOT NULL CHECK (credits > 0),
  amount_cents    INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'usd',
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','COMPLETED')),
  stripe_event_id TEXT,
  created_by      TEXT,                           -- principal name that started checkout
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT
);
CREATE INDEX idx_checkout_account ON billing_checkout_sessions(account_id, created_at DESC);

-- ---------------------------------------------------------------- the deployment's account
-- A fresh install starts at zero credits and buys its first pack; the demo seed
-- (api/src/seedData.ts) tops this same row up so the sample program is usable
-- out of the box. Id is fixed so migrations, seed and code all name one row.
INSERT INTO billing_accounts (id, name, balance)
VALUES ('cccccccc-cccc-4ccc-8ccc-000000000001', 'CharmQuark Fleet Ops', 0);
