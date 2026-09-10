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
