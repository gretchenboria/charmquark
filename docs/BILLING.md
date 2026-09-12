# Enterprise Licensing — Hard Paywall

CharmQuark operates on a Single-Tenant Enterprise Licensing model. We have moved entirely away from SaaS, pay-per-run, or metered billing. The product is deployed natively on your infrastructure (or managed single-tenant) and protected by a strict software license.

---

## The Hard Paywall

When a new customer deploys CharmQuark, they are provisioned with a limited number of "Demo Mode" run credits (typically 40). These credits allow the prospective team to evaluate the Auto-Scheduler, ROS2 Edge Client, and C2 Dashboard.

The moment the balance of credits hits exactly 0, a **Hard Paywall** engages.
- The UI locks entirely.
- API endpoints for scheduling, telemetry, and runs return `402 Payment Required`.
- The `is_unlimited` flag on the `billing_accounts` table remains `0`.

Unlike standard SaaS products where users can simply top up via a self-serve Stripe checkout, CharmQuark restricts access until an **Enterprise Perpetual License** is procured.

---

## The Enterprise Perpetual License

To remove the Hard Paywall, the customer must purchase a Software License. This is an upfront, perpetual license fee negotiated through sales.

Once the license fee is paid, an administrator runs a raw SQL update against the single-tenant D1 database to flip the master switch:

```sql
UPDATE billing_accounts SET is_unlimited = 1 WHERE id = 'cccccccc-cccc-4ccc-8ccc-000000000001';
```

Setting `is_unlimited = 1` permanently disables the debit mechanics. 
- The UI unlocks immediately.
- The concept of "credits" disappears from the dashboard.
- Operators have unrestricted access to fleet orchestration and telemetry.

There is no API route that flips this flag. It is a secure, backend-only operation performed upon contract execution.

---

## Where the state lives

**D1 (Cloudflare)**.

CharmQuark is single-tenant per deployment, so there is exactly one `billing_accounts` row (`cccccccc-cccc-4ccc-8ccc-000000000001`, created by the database migration).

`db/migrations/0002_billing.sql`:

| Table | What it holds |
|---|---|
| `billing_accounts` | One row per paying organisation: `balance`, `is_unlimited`. |
| `credit_ledger` | Append-only. Every `DEBIT` until `is_unlimited` is engaged. |

## Removing legacy Stripe

Because we have transitioned away from SaaS, the Stripe integration endpoints (`POST /api/billing/checkout` and `POST /api/billing/webhook`) are deprecated. Customers no longer purchase packs of 100 or 300 runs via a browser flow. They purchase the single Enterprise License.

## Testing locally

To force the paywall locally and see the UI lock:

```bash
npx wrangler d1 execute charmquark --local --command "UPDATE billing_accounts SET balance = 0, is_unlimited = 0"
```

To simulate a purchased Enterprise License and unlock the dashboard:

```bash
npx wrangler d1 execute charmquark --local --command "UPDATE billing_accounts SET is_unlimited = 1"
```
