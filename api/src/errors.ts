import { HTTPException } from "hono/http-exception";

/** 404 with the FastAPI-compatible `{detail: "..."}` body the frontend expects. */
export const notFound = (what: string): HTTPException =>
  new HTTPException(404, { message: `${what} not found` });

export const badRequest = (msg: string): HTTPException =>
  new HTTPException(400, { message: msg });

/** 409 — the request is well-formed but a domain gate rejects it (readiness, state). */
export const conflict = (msg: string): HTTPException =>
  new HTTPException(409, { message: msg });

export const forbidden = (msg: string): HTTPException =>
  new HTTPException(403, { message: msg });

/**
 * Object storage is not configured (R2 not enabled on the account). Returned by
 * the vault-backed routes so the UI shows a cause rather than a 500.
 */
export const storageUnavailable = (): HTTPException =>
  new HTTPException(503, {
    message:
      "Object storage is not configured: R2 is not enabled for this Cloudflare account. " +
      "Enable R2 in the dashboard, create the bucket, restore the VAULT binding in " +
      "api/wrangler.jsonc, and redeploy.",
  });

/**
 * 402 — the request is valid but the account has no run credits left. The web
 * client keys off this status to open the purchase modal instead of toasting a
 * raw error, so the status matters as much as the message.
 */
export const paymentRequired = (msg: string): HTTPException =>
  new HTTPException(402, { message: msg });

/**
 * Stripe is not configured (no STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET on the
 * Worker). Mirrors `storageUnavailable`: say what is missing rather than 500.
 */
export const billingUnavailable = (): HTTPException =>
  new HTTPException(503, {
    message:
      "Payments are not configured: this Worker has no Stripe credentials. " +
      "Set them with `wrangler secret put STRIPE_SECRET_KEY` and " +
      "`wrangler secret put STRIPE_WEBHOOK_SECRET` (see docs/BILLING.md).",
  });

/**
 * Roboflow is not configured (no ROBOFLOW_API_KEY on the Worker). Same shape as
 * `billingUnavailable`: an unconfigured integration is a 503 that names the
 * missing credential, never a half-completed export.
 */
export const annotationUnavailable = (): HTTPException =>
  new HTTPException(503, {
    message:
      "Annotation export is not configured: this Worker has no Roboflow API key. " +
      "Set it with `wrangler secret put ROBOFLOW_API_KEY` (see docs/ROBOFLOW.md).",
  });
