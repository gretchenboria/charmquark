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
