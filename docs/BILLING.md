# Billing — metered run credits

CharmQuark is metered on the one thing it actually produces: a **confirmed run**.
One credit buys one confirmed run. Everything else in the app is free.

---

## The billable moment, and why

The debit happens in `POST /api/runs/:id/confirm`, after the readiness gate and
before the state write (`api/src/routes/runs.ts`).

Confirmation is the only irreversible commitment in the run lifecycle. It is
where a run:

- passes **every** readiness gate (zero issues, or 409),
- takes its day sequence number for the lab-day,
- mints its **encoded code** — the identifier the collected data is filed under,
- and books the lab slot, which then counts against lab capacity and the
  operator's availability for everyone else.

Nothing before that point costs the customer anything, so nothing before that
point costs them a credit.

### What is deliberately *not* charged

| Action | Charged? | Why |
|---|---|---|
| Creating a draft run, assigning members | no | Planning. A team should be able to lay out a month before spending. |
| `POST /run-proposals`, reject / re-roll | no | The auto-scheduler is the reason to use the product; charging per proposal would make people avoid it. |
| `POST /campaigns/:id/auto-fill` | no — **not even per run created** | Auto-fill creates runs in `ASSEMBLING`, never `CONFIRMED`. Each of those runs costs its credit later, individually, when a human confirms it. This is the single most important consequence of picking confirm as the billable moment: a mis-aimed auto-fill across a quarter cannot silently drain a balance. |
| `accept-proposal`, `advance`, `upload-csv`, QA, execution log | no | All downstream of a run that has already been paid for. |
| Re-confirming an already-`CONFIRMED` run | no | The route returns early; and the ledger is uniquely indexed per run, so it could not double-charge even if it did not. |

### Cancellation is not refunded

A cancelled or deleted run does **not** return its credit. The charge bought the
commitment — the slot was held, the code was minted, other runs were excluded
from that capacity — and that consumption is real whether or not the robot ever
moved. Auto-refunding would also make the meter gameable: confirm, cancel,
confirm elsewhere, indefinitely.

Goodwill refunds are a deliberate manual act, and the ledger supports them:
insert a `REFUND` row and bump the balance in the same batch (see
`grantPurchase` for the shape). There is intentionally no API route that does
it, because "the customer can refund themselves" is not a feature.

---

## Where the balance lives

**D1**, not Supabase, not a browser-held code.

Sim2Rad is anonymous, so a `localStorage` access code was the right carrier
there. CharmQuark is a team tool with `users`, roles and shared campaigns:
several operators work one organisation's program, and the balance they draw
down is the organisation's. So the balance is an **account row**, and no token
ever reaches the browser. There is nothing in `localStorage` to edit.

`db/migrations/0002_billing.sql`:

| Table | What it holds |
|---|---|
| `billing_accounts` | One row per paying organisation: `balance`, `lifetime_granted`, `lifetime_spent`, `is_unlimited`. `CHECK (balance >= 0)` is the last line of defence behind the guarded decrement. |
| `credit_ledger` | Append-only. Every `PURCHASE`, `GRANT`, `DEBIT`, `REFUND`, `ADJUSTMENT`, with `balance_after`, the `run_id` that spent it and the principal name that confirmed it. Nothing ever updates or deletes a row here — a fleet ops customer *will* ask "what did we pay for". |
| `billing_checkout_sessions` | One row per Stripe Checkout Session: written `PENDING` at checkout, flipped `COMPLETED` by the webhook. This is what the browser polls after returning from Stripe. |

CharmQuark is single-tenant per deployment, so there is exactly one
`billing_accounts` row (`cccccccc-cccc-4ccc-8ccc-000000000001`, created by the
migration). Multi-tenant would add an `account_id` to `campaigns` and resolve it
from the run; the schema is already shaped for that.

`is_unlimited = 1` is the equivalent of Sim2Rad's `ALPHA-DEV-MODE`: the account
is never debited. It is settable **only by SQL** — no API route flips it.

---

## Atomicity: how the decrement cannot double-spend

Sim2Rad used a Postgres `SECURITY DEFINER` RPC. D1 has no stored procedures, so
the guarantee comes from a **guarded conditional write inside a `batch()`**,
which D1 runs as a single transaction (`debitRunCredit` in
`api/src/routes/billing.ts`):

```sql
-- 1. the ledger row, conditional on the same predicate as the update
INSERT INTO credit_ledger (...)
SELECT ?, id, -1, 'DEBIT', balance - 1, ?, ?, ?
FROM billing_accounts
WHERE id = ? AND is_unlimited = 0 AND balance >= 1;

-- 2. the balance, guarded identically
UPDATE billing_accounts SET balance = balance - 1, lifetime_spent = lifetime_spent + 1
WHERE id = ? AND is_unlimited = 0 AND balance >= 1;
```

- Both statements carry the **same** guard, so they cannot disagree: either the
  balance was there and both wrote, or it was not and neither did. No ledger row
  for a debit that did not happen.
- The INSERT is first because it needs the *pre*-update balance for
  `balance_after`.
- `meta.changes` on the UPDATE is the verdict. Zero changes → **HTTP 402**.
- `idx_ledger_run_debit` is `UNIQUE(run_id) WHERE reason = 'DEBIT'`: a run can be
  charged at most once, forever. A duplicate aborts the whole batch, so the
  loser of a race is not charged rather than being charged twice.

### How it was verified

Against `wrangler dev` on a local D1: eight runs brought to `READY`, the balance
forced to **3**, then all eight confirms fired concurrently.

```
3 × 200   5 × 402   balance 0   DEBIT rows 3   runs CONFIRMED 3
```

Exactly three charges, exactly three confirmed runs, balance landed on zero and
never below. Re-confirm of a charged run: 200, no second debit. Unlimited
account: 200, run confirmed, zero ledger rows.

---

## Stripe

### Flow

1. `POST /api/billing/checkout {pack_id, return_path}` → builds a Checkout
   Session with **inline `price_data`** (no pre-created Stripe Prices, so a tier
   change is a code change and the dashboard cannot drift), `mode: 'payment'`,
   and `metadata: {packId, credits, accountId}`. Writes the `PENDING` session row
   and returns `{success, url}`. The browser navigates to `url`.
2. Stripe returns the buyer to
   `{origin}{return_path}?payment=success&session_id={CHECKOUT_SESSION_ID}`.
3. Stripe posts `checkout.session.completed` to
   `POST /api/billing/webhook`, which credits the account.
4. The browser polls `GET /api/billing/claim?session_id=…` until it reports
   `COMPLETED` (up to 8 tries, 1.5s apart), then shows the new balance and
   scrubs the query string. Unlike Sim2Rad, the claim returns **no token** —
   there is nothing for a browser to hold.

### Webhook integrity

- **Signature.** `stripe.webhooks.constructEventAsync(raw, sig, secret,
  undefined, Stripe.createSubtleCryptoProvider())`. Workers has no synchronous
  crypto, so the async/WebCrypto path is mandatory — the sync `constructEvent`
  will throw at runtime. The body is read with `c.req.text()` and verified byte
  for byte; any reserialization breaks the signature. Missing or bad signature →
  400, nothing written.
- **Auth exemption.** The webhook is mounted on the **root** Hono app
  (`mountBillingWebhook(app)` in `api/src/index.ts`), registered *before*
  `app.route("/api", api)` so it matches first. Stripe sends no `X-CharmQuark-*`
  headers, so `principal` / `crudGuard` would reject every delivery. It is not
  unauthenticated — its credential is the HMAC signature, which is strictly
  stronger than the header shim it skips.
- **Idempotency, three ways.** `credit_ledger` has a unique
  `stripe_event_id` (stops a redelivered event), a unique
  `checkout_session_id WHERE reason='PURCHASE'` (stops a *different* event type
  for the same purchase), and the session row only leaves `PENDING` once. Any
  violation aborts the batch, which is the success path for a replay: nothing
  moves and Stripe still gets a 200 so it stops retrying.
- Credits and the account come from the **session metadata we set at checkout**,
  never from the request body. A `checkout.session.completed` without CharmQuark
  metadata (someone else's product on the same Stripe account) is acknowledged
  and ignored.

---

## Pricing

A CharmQuark run is a booked lab slot: one robot, one operator, one lab bay, one
sensor rig, four effort units — roughly half a working day of fleet time, several
hundred dollars fully loaded before anyone opens this app. Credits are priced as
a fraction of the slot they orchestrate, and the discount curve rewards
committing a program rather than a slot at a time. Defined in
`api/src/billing.ts`; changing a tier is a one-line edit.

| Pack | Runs | Price | Per run |
|---|---:|---:|---:|
| Trial | 5 | $595 | $119 |
| Pilot | 25 | $2,450 | $98 |
| Program *(most teams)* | 100 | $8,500 | $85 |
| Fleet *(best value)* | 300 | $21,000 | $70 |
| Enterprise | 1,000 | $55,000 | $55 |

Enterprise is listed as a SKU for completeness; a $55k card payment is unusual
and that tier is normally invoiced. The seeded demo organisation starts with
**40 credits** (`SEED_CREDITS` in `api/src/seedData.ts`) so a fresh install works
out of the box — the paywall is a thing to demonstrate, not a wall the sample
program hits on its first click.

---

## Setup — what you must do to go live

Nothing here is in the repo. **No Stripe key is ever written to a tracked file.**

### 1. Worker secrets

```bash
cd api
wrangler secret put STRIPE_SECRET_KEY      # sk_live_… (sk_test_… while testing)
wrangler secret put STRIPE_WEBHOOK_SECRET  # whsec_… from step 2
```

Both are read from `c.env` and are optional in `Env`: without them the API stays
up and reports "payments are not configured" (503) instead of throwing, exactly
like the absent R2 binding.

Optional: `APP_ORIGIN` (a plain `var` in `wrangler.jsonc`, not a secret) pins
where Stripe returns the buyer when the web app and the API do not share an
origin. Without it the request's `Origin` header is used, which is correct for
`charmquark.app`.

### 2. Register the webhook endpoint

Stripe dashboard → **Developers → Webhooks → Add endpoint**:

- Endpoint URL: `https://charmquark.app/api/billing/webhook`
- Events to send: **`checkout.session.completed`** (that is the only one handled)
- Create it, then reveal **Signing secret** (`whsec_…`) and feed it to
  `wrangler secret put STRIPE_WEBHOOK_SECRET`.

### 3. Apply the migration

```bash
npm --prefix api run db:migrate          # remote D1
```

The migration creates the account row with a **zero** balance. Grant an opening
balance explicitly if you want one:

```bash
wrangler d1 execute charmquark --remote --command \
  "UPDATE billing_accounts SET balance = 50, lifetime_granted = 50 WHERE id='cccccccc-cccc-4ccc-8ccc-000000000001'"
```

(and add the matching `credit_ledger` `GRANT` row, so the audit trail stays
complete — see the seed for the exact statement.)

---

## Testing locally

```bash
cp api/.dev.vars.example api/.dev.vars     # gitignored; fill in TEST-mode values
npm --prefix api run db:reset:local
npm --prefix api run dev                   # http://127.0.0.1:8787
```

Forward real Stripe events to the local Worker:

```bash
stripe login
stripe listen --forward-to http://127.0.0.1:8787/api/billing/webhook
# copy the whsec_… it prints into api/.dev.vars, then restart wrangler dev
```

Buy a pack in the UI and pay with a Stripe **test card**:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0000 0000 9995` | declined (insufficient funds) |
| `4000 0025 0000 3155` | requires 3-D Secure authentication |

Any future expiry, any CVC, any postcode.

Trigger a purchase without a browser:

```bash
stripe trigger checkout.session.completed
```

— note this sends Stripe's canned session, which has no CharmQuark metadata, so
the handler will (correctly) acknowledge and ignore it. To exercise the grant
path, complete a real test checkout started from the app.

Useful checks:

```bash
# balance + packs
curl -s -H 'X-CharmQuark-Role: PM' -H 'X-CharmQuark-User: s.okafor' \
  http://127.0.0.1:8787/api/billing/account

# the audit trail
curl -s -H 'X-CharmQuark-Role: PM' -H 'X-CharmQuark-User: s.okafor' \
  'http://127.0.0.1:8787/api/billing/ledger?limit=20'

# force the paywall
npx wrangler d1 execute charmquark --local --command "UPDATE billing_accounts SET balance = 0"
```

---

## What is **not** secured yet

Read this before treating the meter as revenue protection.

1. **There is no real authentication.** Auth is a header shim
   (`api/src/auth.ts`): `X-CharmQuark-Role` / `X-CharmQuark-User` are trusted as
   sent, and the login screen is a role picker, not a credential check. Anyone
   who can reach the API can therefore confirm runs and spend the
   organisation's credits, and can attribute the spend to any name they like.
   Making the balance account-scoped rather than `localStorage`-scoped removes
   the *trivial* client-side forgery (there is no token to edit, and no header
   value changes whose credits are spent — only whose name lands in the ledger's
   `actor` column), but it does not authenticate anyone. **The meter is a
   billing control, not a security boundary, until Cloudflare Access or a real
   IdP replaces `resolvePrincipal`.**
2. **The API is not rate-limited.** A loop of `POST /runs/:id/confirm` across
   many runs will spend a balance as fast as D1 will take the writes. The
   decrement is correct under that load — it will never overdraw — but nothing
   throttles it.
3. **Anyone signed in can start a checkout.** There is no billing-admin role;
   `crudGuard` gives every role full CRUD. A `ROBOT_OPERATOR` can put a $21,000
   pack in front of themselves. They still have to pay for it, so the exposure is
   confusion rather than loss — but it is not the policy a real deployment wants.
4. **No CSRF protection on state-changing routes.** They are same-origin JSON
   calls with no cookie auth, so there is no ambient credential to ride, but
   nothing enforces that either.
5. **Refunds and Stripe disputes are not wired back.** `charge.refunded`,
   `charge.dispute.created` and `checkout.session.async_payment_failed` are
   ignored: a refunded purchase keeps its credits. For card payments that
   complete synchronously this is a small window, but it is a real one.
6. **The claim endpoint scopes to the single account, not to a user.** Any
   signed-in user can poll any session id belonging to the organisation. It
   returns only pack, credit count and balance — no payment details — but it is
   not per-user private.
7. **`is_unlimited` has no audit trail.** Flipping it is a raw SQL act with
   nothing recorded in the ledger.
