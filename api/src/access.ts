/**
 * Cloudflare Access — JWT verification.
 *
 * When Access sits in front of charmquark.app it terminates identity at the
 * edge and forwards a signed assertion. This module is the part that makes that
 * assertion *mean* something: without verifying it, the header is still just a
 * claim anyone can type, and the whole point is lost.
 *
 * What we verify, and why each matters:
 *   - the RS256 signature against the team's published JWKS  (authenticity)
 *   - `iss` equals the team domain                            (a token minted
 *     for someone else's Access org must not work here)
 *   - `aud` contains this application's AUD tag               (a token minted
 *     for a *different app in the same org* must not work here — this is the
 *     one people forget, and it is why AUD is required config, not optional)
 *   - `exp` / `nbf` with a small skew allowance               (freshness)
 *
 * The JWKS is cached in KV, because fetching it per request would put a network
 * round trip in front of every API call.
 */
import type { Env } from "./types";

/** Cloudflare Access forwards the assertion in this header; the cookie is the fallback. */
const ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const ASSERTION_COOKIE = "CF_Authorization";

const JWKS_KV_PREFIX = "access:jwks:";
const JWKS_TTL_SECONDS = 3600;
/** Clocks drift; a minute of leeway avoids spurious rejections at the edges. */
const CLOCK_SKEW_SECONDS = 60;

export interface AccessIdentity {
  /** The verified end-user email from the Access token. */
  email: string;
  /** Access's own subject id. Stable per user per org. */
  sub: string;
}

export interface AccessConfig {
  /** e.g. "yourteam.cloudflareaccess.com" — no scheme. */
  teamDomain: string;
  /** The Application Audience (AUD) tag of the Access app protecting this API. */
  aud: string;
}

/**
 * Access is considered configured only when BOTH values are present. A team
 * domain without an AUD would verify that a token came from the right org while
 * saying nothing about which application it was minted for.
 */
export function accessConfig(env: Env): AccessConfig | null {
  const teamDomain = (env.CF_ACCESS_TEAM_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const aud = (env.CF_ACCESS_AUD ?? "").trim();
  if (!teamDomain || !aud) return null;
  return { teamDomain, aud };
}

// ---------------------------------------------------------------- base64url
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const b64urlToString = (s: string): string => new TextDecoder().decode(b64urlToBytes(s));

// ---------------------------------------------------------------- JWKS
interface Jwk { kid?: string; kty?: string; alg?: string; use?: string; n?: string; e?: string }

/**
 * Fetch the team's signing keys, cached in KV. A cache miss on an unknown `kid`
 * forces a refetch: Cloudflare rotates these, and a stale cache would otherwise
 * lock every user out until the TTL expired.
 */
async function fetchJwks(env: Env, cfg: AccessConfig, force = false): Promise<Jwk[]> {
  const cacheKey = `${JWKS_KV_PREFIX}${cfg.teamDomain}`;
  if (!force) {
    const cached = await env.FLEET_STATUS.get(cacheKey, "json").catch(() => null);
    if (cached && Array.isArray((cached as { keys?: Jwk[] }).keys)) {
      return (cached as { keys: Jwk[] }).keys;
    }
  }
  const res = await fetch(`https://${cfg.teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  await env.FLEET_STATUS.put(cacheKey, JSON.stringify({ keys }), { expirationTtl: JWKS_TTL_SECONDS })
    .catch(() => { /* cache write is best-effort; verification must not depend on it */ });
  return keys;
}

async function importKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

// ---------------------------------------------------------------- verification
interface JwtHeader { alg?: string; kid?: string }
interface JwtPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  email?: string;
  sub?: string;
  /** Service tokens carry this instead of an email. */
  common_name?: string;
}

/** Read the assertion from the header, falling back to the cookie Access also sets. */
export function readAssertion(req: Request): string | null {
  const header = req.headers.get(ASSERTION_HEADER);
  if (header) return header.trim();
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === ASSERTION_COOKIE) return rest.join("=").trim() || null;
  }
  return null;
}

/**
 * Verify an Access assertion and return the identity it carries.
 * Throws on anything that does not verify — callers must treat a throw as a
 * hard denial, never as "fall back to the header shim".
 */
export async function verifyAccessJwt(env: Env, cfg: AccessConfig, token: string): Promise<AccessIdentity> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed assertion");
  const [rawHeader, rawPayload, rawSig] = parts as [string, string, string];

  const header = JSON.parse(b64urlToString(rawHeader)) as JwtHeader;
  if (header.alg !== "RS256") throw new Error(`unexpected alg: ${header.alg}`);
  if (!header.kid) throw new Error("assertion has no kid");

  // Resolve the signing key, refetching once if the kid is unknown (rotation).
  let keys = await fetchJwks(env, cfg);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await fetchJwks(env, cfg, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("no signing key matches the assertion");

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await importKey(jwk),
    b64urlToBytes(rawSig),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!ok) throw new Error("assertion signature is invalid");

  const payload = JSON.parse(b64urlToString(rawPayload)) as JwtPayload;

  const expectedIss = `https://${cfg.teamDomain}`;
  if (payload.iss !== expectedIss) throw new Error(`unexpected issuer: ${payload.iss}`);

  const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!auds.includes(cfg.aud)) throw new Error("assertion was not minted for this application");

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now > payload.exp + CLOCK_SKEW_SECONDS) {
    throw new Error("assertion has expired");
  }
  if (typeof payload.nbf === "number" && now + CLOCK_SKEW_SECONDS < payload.nbf) {
    throw new Error("assertion is not yet valid");
  }

  // Service tokens authenticate a machine, not a person, and carry common_name.
  const email = (payload.email ?? payload.common_name ?? "").toLowerCase();
  if (!email) throw new Error("assertion carries no identity");

  return { email, sub: payload.sub ?? email };
}
