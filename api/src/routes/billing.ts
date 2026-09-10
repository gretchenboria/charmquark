/**
 * Metered run credits: balance, checkout, the post-purchase claim, and the
 * Stripe webhook.
 *
 * The model in one line: **one credit buys one confirmed run**. Everything
 * before confirmation — drafting, assembling, proposing, auto-filling a whole
 * month of slots — is free, because planning is not what costs anyone anything.
 * Confirmation is the irreversible commitment: it passes the readiness gate,
 * takes the day sequence number, mints the encoded code and books the lab slot.
 * That is the moment the debit lands. See docs/BILLING.md.
 *
 * Every write that moves credits goes through a D1 `batch()`, which is one
 * transaction: the conditional ledger INSERT and the guarded balance UPDATE
 * share a predicate and therefore cannot disagree, and a unique-index violation
 * anywhere in the batch rolls the whole thing back rather than half-charging.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import Stripe from "stripe";
import type { Env, Vars } from "../types";
import { num, str, strOrNull, uuid, type Row } from "../db";
import { badRequest, billingUnavailable, notFound, paymentRequired } from "../errors";
import {
  CREDIT_PACKS,
  DEFAULT_ACCOUNT_ID,
  RUN_CREDIT_COST,
  centsPerCredit,
  outOfCreditsMessage,
  packById,
  safeReturnPath,
} from "../billing";

type App = Hono<{ Bindings: Env; Variables: Vars }>;

interface Account {
  id: string;
  name: string;
  balance: number;
  lifetime_granted: number;
  lifetime_spent: number;
  is_unlimited: boolean;
}

// ---------------------------------------------------------------- account access
/**
 * The account credits are spent from. CharmQuark is single-tenant — one fleet
 * ops team per deployment — so this is deliberately *not* derived from the
 * caller: every signed-in user shares one team wallet, and a user who edits
 * their headers changes who is blamed in the ledger, not whose credits are
 * spent. The row is created by migration 0002 and topped up by the demo seed.
 */
async function loadAccount(db: D1Database): Promise<Account> {
  const row =
    (await db.prepare(`SELECT * FROM billing_accounts WHERE id = ?`).bind(DEFAULT_ACCOUNT_ID).first<Row>()) ??
    (await db.prepare(`SELECT * FROM billing_accounts ORDER BY created_at LIMIT 1`).first<Row>());
  if (!row) throw notFound("billing account");
  return {
    id: str(row, "id"),
    name: str(row, "name"),
    balance: num(row, "balance"),
    lifetime_granted: num(row, "lifetime_granted"),
    lifetime_spent: num(row, "lifetime_spent"),
    is_unlimited: num(row, "is_unlimited") === 1,
  };
}

/** D1 surfaces constraint failures as a plain Error; the text is the only signal. */
const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Error && /UNIQUE constraint failed/i.test(`${e.message} ${String(e.cause ?? "")}`);

// ---------------------------------------------------------------- the debit
export interface DebitResult {
  /** False when nothing moved: an unlimited account, or a run already charged. */
  charged: boolean;
  balance: number;
  unlimited: boolean;
}

/**
 * Spend one credit against a run, atomically, or throw 402.
 *
 * The two statements below carry the *same* guard (`is_unlimited = 0 AND balance
 * >= cost`) and run in one D1 transaction, so a concurrent confirm either sees
 * enough balance and wins both, or sees too little and writes neither — no
 * double-spend, no ledger row for a debit that did not happen. The INSERT reads
 * the pre-update balance, which is why it comes first.
 *
 * Re-charging a run is impossible even if a caller gets past the "already
 * CONFIRMED" early return: `idx_ledger_run_debit` is unique per run, and its
 * violation aborts the batch.
 */
export async function debitRunCredit(
  db: D1Database,
  opts: { runId: string; actor: string; note?: string },
): Promise<DebitResult> {
  const account = await loadAccount(db);
  if (account.is_unlimited) {
    return { charged: false, balance: account.balance, unlimited: true };
  }

  try {
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO credit_ledger (id, account_id, delta, reason, balance_after, run_id, actor, note)
           SELECT ?, id, ?, 'DEBIT', balance - ?, ?, ?, ?
           FROM billing_accounts
           WHERE id = ? AND is_unlimited = 0 AND balance >= ?`,
        )
        .bind(
          uuid(), -RUN_CREDIT_COST, RUN_CREDIT_COST, opts.runId, opts.actor,
          opts.note ?? "run confirmed", account.id, RUN_CREDIT_COST,
        ),
      db
        .prepare(
          `UPDATE billing_accounts
           SET balance = balance - ?, lifetime_spent = lifetime_spent + ?, updated_at = datetime('now')
           WHERE id = ? AND is_unlimited = 0 AND balance >= ?`,
        )
        .bind(RUN_CREDIT_COST, RUN_CREDIT_COST, account.id, RUN_CREDIT_COST),
    ]);

    if ((results[1]?.meta.changes ?? 0) === 0) {
      throw paymentRequired(outOfCreditsMessage(account.balance));
    }
    return { charged: true, balance: account.balance - RUN_CREDIT_COST, unlimited: false };
  } catch (e) {
    // This run has already been paid for — a retried confirm, not a new charge.
    if (isUniqueViolation(e)) {
      const after = await loadAccount(db);
      return { charged: false, balance: after.balance, unlimited: after.is_unlimited };
    }
    throw e;
  }
}

// ---------------------------------------------------------------- the grant
/**
 * Credit a completed checkout. Idempotent three ways: the ledger's unique
 * `stripe_event_id` stops a redelivered event, its unique purchase
 * `checkout_session_id` stops a *different* event type for the same purchase,
 * and the session row only leaves PENDING once. Any of those aborts the batch,
 * which is the success path for a replay — nothing moves, and the caller
 * answers Stripe 200 so it stops retrying.
 */
async function grantPurchase(
  db: D1Database,
  opts: { accountId: string; credits: number; sessionId: string; eventId: string; note: string },
): Promise<{ granted: boolean }> {
  try {
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO credit_ledger
             (id, account_id, delta, reason, balance_after, checkout_session_id, stripe_event_id, note)
           SELECT ?, id, ?, 'PURCHASE', balance + ?, ?, ?, ?
           FROM billing_accounts WHERE id = ?`,
        )
        .bind(uuid(), opts.credits, opts.credits, opts.sessionId, opts.eventId, opts.note, opts.accountId),
      db
        .prepare(
          `UPDATE billing_accounts
           SET balance = balance + ?, lifetime_granted = lifetime_granted + ?, updated_at = datetime('now')
           WHERE id = ?`,
        )
        .bind(opts.credits, opts.credits, opts.accountId),
      db
        .prepare(
          `UPDATE billing_checkout_sessions
           SET status = 'COMPLETED', stripe_event_id = ?, completed_at = datetime('now')
           WHERE id = ? AND status = 'PENDING'`,
        )
        .bind(opts.eventId, opts.sessionId),
    ]);
    return { granted: (results[1]?.meta.changes ?? 0) > 0 };
  } catch (e) {
    if (isUniqueViolation(e)) return { granted: false };
    throw e;
  }
}

// ---------------------------------------------------------------- Stripe client
function stripeClient(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw billingUnavailable();
  // Workers has fetch and SubtleCrypto but no Node http/crypto, so the SDK is
  // given the fetch transport explicitly and signatures are verified async.
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-02-24.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/** The app's origin, for Stripe's return URLs. The web app and API may differ. */
function appOrigin(env: Env, requestOrigin: string | undefined, requestUrl: string): string {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/$/, "");
  if (requestOrigin && /^https?:\/\//.test(requestOrigin)) return requestOrigin.replace(/\/$/, "");
  return new URL(requestUrl).origin;
}

const packPayload = () =>
  CREDIT_PACKS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    credits: p.credits,
    amount_cents: p.amount_cents,
    currency: p.currency,
    cents_per_credit: centsPerCredit(p),
    tag: p.tag ?? null,
  }));

/**
 * Stripe's own failures (a revoked key, a network blip) are its problem, not the
 * caller's — but a bare 500 tells an operator nothing. Surface the reason.
 */
async function createCheckoutSession(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  try {
    return await stripe.checkout.sessions.create(params);
  } catch (e) {
    console.error("stripe checkout.sessions.create failed", e);
    throw new HTTPException(502, {
      message: `Stripe could not start checkout: ${e instanceof Error ? e.message : "unknown error"}`,
    });
  }
}

// ---------------------------------------------------------------- routes
/** Authenticated billing surface. Mounted under the guarded /api router. */
export function mountBilling(app: App): void {
  /** Balance + catalog in one call — everything the sidebar meter and the modal need. */
  app.get("/billing/account", async (c) => {
    const a = await loadAccount(c.env.DB);
    return c.json({
      account_id: a.id,
      name: a.name,
      balance: a.balance,
      unlimited: a.is_unlimited,
      lifetime_granted: a.lifetime_granted,
      lifetime_spent: a.lifetime_spent,
      credit_cost_per_run: RUN_CREDIT_COST,
      payments_configured: Boolean(c.env.STRIPE_SECRET_KEY),
      packs: packPayload(),
    });
  });

  /** The audit trail: what was bought, what spent it, and who confirmed it. */
  app.get("/billing/ledger", async (c) => {
    const a = await loadAccount(c.env.DB);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 200);
    const { results } = await c.env.DB
      .prepare(
        `SELECT id, delta, reason, balance_after, run_id, checkout_session_id, actor, note, created_at
         FROM credit_ledger WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .bind(a.id, limit)
      .all<Row>();
    return c.json(
      results.map((r) => ({
        id: str(r, "id"),
        delta: num(r, "delta"),
        reason: str(r, "reason"),
        balance_after: num(r, "balance_after"),
        run_id: strOrNull(r, "run_id"),
        checkout_session_id: strOrNull(r, "checkout_session_id"),
        actor: strOrNull(r, "actor"),
        note: strOrNull(r, "note"),
        created_at: str(r, "created_at"),
      })),
    );
  });

  /**
   * Start a purchase. Prices are built inline from the pack catalog rather than
   * from pre-created Stripe Prices, so a tier change is a code change and the
   * dashboard never drifts from the app. The PENDING session row written here
   * is what the claim endpoint polls afterwards.
   */
  app.post("/billing/checkout", async (c) => {
    const b = await c.req.json<{ pack_id?: string; return_path?: string }>();
    const pack = packById(String(b.pack_id ?? ""));
    if (!pack) throw badRequest(`unknown credit pack: ${b.pack_id}`);

    const account = await loadAccount(c.env.DB);
    const stripe = stripeClient(c.env);
    const origin = appOrigin(c.env, c.req.header("Origin") ?? undefined, c.req.url);
    const returnPath = safeReturnPath(b.return_path);

    const session = await createCheckoutSession(stripe, {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: pack.currency,
            product_data: { name: `CharmQuark — ${pack.name}`, description: pack.description },
            unit_amount: pack.amount_cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}${returnPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}?payment=cancelled`,
      // The webhook trusts this metadata, not the client, for who gets credited.
      metadata: {
        packId: pack.id,
        credits: String(pack.credits),
        accountId: account.id,
      },
    });

    if (!session.url) throw badRequest("Stripe returned a checkout session with no URL");

    await c.env.DB
      .prepare(
        `INSERT INTO billing_checkout_sessions
           (id, account_id, pack_id, credits, amount_cents, currency, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(session.id, account.id, pack.id, pack.credits, pack.amount_cents, pack.currency, c.get("principal").name)
      .run();

    return c.json({ success: true, url: session.url, session_id: session.id });
  });

  /**
   * Post-checkout: has the webhook landed yet? Returns PENDING while it is in
   * flight (the browser retries) and COMPLETED with the new balance once the
   * credits are on the account. Unlike Sim2Rad this hands back no token — the
   * balance lives on the account, so there is nothing for a browser to hold.
   */
  app.get("/billing/claim", async (c) => {
    const sessionId = c.req.query("session_id");
    if (!sessionId) throw badRequest("session_id is required");
    const account = await loadAccount(c.env.DB);
    const row = await c.env.DB
      .prepare(`SELECT * FROM billing_checkout_sessions WHERE id = ? AND account_id = ?`)
      .bind(sessionId, account.id)
      .first<Row>();
    // An unknown id is not an error: the row is written before the redirect, but
    // a buyer can land here with a stale or foreign session id.
    if (!row) return c.json({ status: "UNKNOWN", credits: 0, balance: account.balance });
    return c.json({
      status: str(row, "status"),
      pack_id: str(row, "pack_id"),
      credits: num(row, "credits"),
      balance: account.balance,
      unlimited: account.is_unlimited,
    });
  });
}

/**
 * The Stripe webhook, mounted on the *root* app rather than the guarded /api
 * router: Stripe sends no X-CharmQuark-* headers, so `principal` and `crudGuard`
 * would reject every delivery. Its authentication is the signature check below,
 * which is strictly stronger than the header shim it is skipping.
 */
export function mountBillingWebhook(app: App): void {
  app.post("/api/billing/webhook", async (c) => {
    const secret = c.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw billingUnavailable();

    const signature = c.req.header("stripe-signature");
    if (!signature) return c.json({ detail: "missing stripe-signature header" }, 400);

    // The raw body, byte for byte — any reserialization breaks the signature.
    const raw = await c.req.text();

    let event: Stripe.Event;
    try {
      event = await stripeClient(c.env).webhooks.constructEventAsync(
        raw,
        signature,
        secret,
        undefined,
        // Workers has no synchronous crypto; verification runs on SubtleCrypto.
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (e) {
      console.error("stripe signature verification failed", e);
      return c.json({ detail: "invalid signature" }, 400);
    }

    if (event.type !== "checkout.session.completed") {
      return c.json({ received: true, ignored: event.type });
    }

    const session = event.data.object;
    const credits = Number(session.metadata?.credits ?? NaN);
    const accountId = session.metadata?.accountId;
    if (!Number.isFinite(credits) || credits <= 0 || !accountId) {
      // Someone else's checkout on the same Stripe account. Acknowledge it —
      // retrying will not make it ours.
      console.warn("checkout.session.completed without CharmQuark credit metadata", session.id);
      return c.json({ received: true, ignored: "not a credit pack" });
    }
    if (session.payment_status !== "paid") {
      return c.json({ received: true, ignored: `payment_status=${session.payment_status}` });
    }

    // Record sessions created outside this app (a dashboard-made link, a replay
    // after a database reset) so the claim endpoint and the audit trail agree.
    await c.env.DB
      .prepare(
        `INSERT OR IGNORE INTO billing_checkout_sessions
           (id, account_id, pack_id, credits, amount_cents, currency, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'stripe-webhook')`,
      )
      .bind(
        session.id, accountId, session.metadata?.packId ?? "unknown", credits,
        session.amount_total ?? 0, session.currency ?? "usd",
      )
      .run();

    const { granted } = await grantPurchase(c.env.DB, {
      accountId,
      credits,
      sessionId: session.id,
      eventId: event.id,
      note: `purchase: ${session.metadata?.packId ?? "unknown"} (${credits} credits)`,
    });

    console.log(granted ? `granted ${credits} credits for ${session.id}` : `replayed event ${event.id}, no-op`);
    return c.json({ received: true, granted });
  });
}
