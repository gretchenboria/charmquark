/**
 * Signed credit grants: the only way run credits (or unlimited use) reach a
 * customer deployment.
 *
 * The central store (store/) takes payment and signs a grant with its Ed25519
 * private key. A deployment holds only the matching public key
 * (STORE_PUBLIC_KEY), so it can verify grants but never mint one, and it holds no
 * Stripe keys at all. A grant names the deployment it is for, and each grant id
 * is applied once.
 *
 * Token: `cqg1.<base64url(JSON payload)>.<base64url(Ed25519 signature over the
 * payload segment)>`. WebCrypto only, so the same code runs in Workers, Node and
 * tests.
 */

import { GRANT_REASONS, type GrantReason } from "./enums.ts";

export const GRANT_PREFIX = "cqg1";
export const MAX_GRANT_CREDITS = 1_000_000;

export interface CreditGrant {
  v: 1;
  /** Unique per grant; a deployment applies each id once. */
  id: string;
  /** The store's deployment id this grant is for. */
  deployment: string;
  /** Credits to add. 0 is allowed when the grant only changes `unlimited`. */
  credits: number;
  /** When present, sets whether the account is never debited. */
  unlimited?: boolean;
  reason: GrantReason;
  /** Ledger note, e.g. "Pilot — 25 runs (order o_123)". */
  note: string;
  issued_at: string;
}

const ID = /^[A-Za-z0-9_-]{8,80}$/;

/** Every problem with a grant payload, or null. */
export function checkGrant(g: unknown): string | null {
  if (!g || typeof g !== "object" || Array.isArray(g)) return "grant must be an object";
  const r = g as Record<string, unknown>;
  if (r["v"] !== 1) return "unsupported grant version";
  if (typeof r["id"] !== "string" || !ID.test(r["id"])) return "grant id must be 8–80 letters, digits, _ or -";
  if (typeof r["deployment"] !== "string" || !r["deployment"] || r["deployment"].length > 100) return "grant must name a deployment";
  const credits = r["credits"];
  if (typeof credits !== "number" || !Number.isInteger(credits) || credits < 0 || credits > MAX_GRANT_CREDITS) {
    return `credits must be a whole number from 0 to ${MAX_GRANT_CREDITS}`;
  }
  if (r["unlimited"] !== undefined && typeof r["unlimited"] !== "boolean") return "unlimited must be true or false";
  if (credits === 0 && r["unlimited"] === undefined) return "a grant must add credits or set unlimited";
  if (!(GRANT_REASONS as readonly unknown[]).includes(r["reason"])) return `reason must be one of ${GRANT_REASONS.join(", ")}`;
  if (typeof r["note"] !== "string" || r["note"].length > 200) return "note must be text of at most 200 characters";
  if (typeof r["issued_at"] !== "string" || Number.isNaN(Date.parse(r["issued_at"]))) return "issued_at must be an ISO timestamp";
  return null;
}

// ---------------------------------------------------------------- encoding

const utf8 = (s: string) => new TextEncoder().encode(s);

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Accepts base64 or base64url, padded or not. */
export function fromBase64(s: string): Uint8Array {
  const std = s.trim().replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const ED25519 = { name: "Ed25519" };

/** A new signing key pair: `private_key` (PKCS#8) for the store, `public_key` (raw) for deployments. Both base64. */
export async function generateGrantKeys(): Promise<{ private_key: string; public_key: string }> {
  const pair = (await crypto.subtle.generateKey(ED25519, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer);
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return { private_key: b64(pkcs8), public_key: b64(raw) };
}

export async function signGrant(grant: CreditGrant, privateKey: string): Promise<string> {
  const problem = checkGrant(grant);
  if (problem) throw new Error(`invalid grant: ${problem}`);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("pkcs8", fromBase64(privateKey), ED25519, false, ["sign"]);
  } catch {
    throw new Error("the signing key is not a base64 PKCS#8 Ed25519 private key");
  }
  const payload = toBase64Url(utf8(JSON.stringify(grant)));
  const signature = new Uint8Array(await crypto.subtle.sign(ED25519, key, utf8(payload)));
  return `${GRANT_PREFIX}.${payload}.${toBase64Url(signature)}`;
}

export type GrantVerdict =
  | { ok: true; grant: CreditGrant }
  | { ok: false; status: 400 | 401 | 403; error: string };

/** Verify a token against the store's public key and this deployment's id. */
export async function verifyGrant(token: unknown, publicKey: string, deploymentId: string): Promise<GrantVerdict> {
  if (typeof token !== "string") return { ok: false, status: 400, error: "send {\"grant\": \"cqg1.…\"}" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== GRANT_PREFIX || !parts[1] || !parts[2]) {
    return { ok: false, status: 400, error: "not a CharmQuark credit grant" };
  }
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", fromBase64(publicKey), ED25519, false, ["verify"]);
  } catch {
    throw new Error("STORE_PUBLIC_KEY is not a base64 raw Ed25519 public key");
  }
  let valid = false;
  try {
    valid = await crypto.subtle.verify(ED25519, key, fromBase64(parts[2]), utf8(parts[1]));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, status: 401, error: "the grant's signature does not verify against this deployment's store key" };

  let grant: unknown;
  try {
    grant = JSON.parse(new TextDecoder().decode(fromBase64(parts[1])));
  } catch {
    return { ok: false, status: 400, error: "the grant payload is not JSON" };
  }
  const problem = checkGrant(grant);
  if (problem) return { ok: false, status: 400, error: problem };
  const g = grant as CreditGrant;
  if (g.deployment !== deploymentId) {
    return { ok: false, status: 403, error: `this grant is for deployment ${g.deployment}, not ${deploymentId}` };
  }
  return { ok: true, grant: g };
}
