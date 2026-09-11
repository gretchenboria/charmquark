/**
 * RS256 JWT verification against a published JWKS.
 *
 * Shared by Firebase ID-token verification (identity.ts) and Cloudflare Access
 * (access.ts). This module owns only what every issuer has in common — the
 * signature, the key lookup, and freshness. Issuer and audience are checked by
 * the caller, because they are what make a token *ours* rather than merely
 * genuine, and each issuer spells them differently.
 *
 * The JWKS is cached in KV so a network round trip does not sit in front of
 * every API call. An unknown `kid` forces one refetch: issuers rotate keys, and a
 * stale cache would otherwise lock everyone out until the TTL expired.
 */

export interface Jwk { kid?: string; kty?: string; alg?: string; use?: string; n?: string; e?: string }

export interface JwksSource {
  /** Where the issuer publishes its signing keys as `{ keys: Jwk[] }`. */
  url: string;
  /** KV key the fetched set is cached under. */
  cacheKey: string;
}

export interface JwtClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  [claim: string]: unknown;
}

/** The slice of KVNamespace used here, so tests can pass an in-memory cache. */
export interface KvLike {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

const JWKS_TTL_SECONDS = 3600;
/** Clocks drift; a minute of leeway avoids spurious rejections at the edges. */
export const CLOCK_SKEW_SECONDS = 60;

// ---------------------------------------------------------------- base64url
export function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const b64urlToString = (s: string): string => new TextDecoder().decode(b64urlToBytes(s));

// ---------------------------------------------------------------- JWKS
async function fetchJwks(kv: KvLike | undefined, source: JwksSource, force = false): Promise<Jwk[]> {
  if (kv && !force) {
    const cached = await kv.get(source.cacheKey, "json").catch(() => null);
    if (cached && Array.isArray((cached as { keys?: Jwk[] }).keys)) {
      return (cached as { keys: Jwk[] }).keys;
    }
  }
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`signing keys unavailable (${res.status})`);
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  if (kv) {
    await kv.put(source.cacheKey, JSON.stringify({ keys }), { expirationTtl: JWKS_TTL_SECONDS })
      .catch(() => { /* cache write is best-effort; verification must not depend on it */ });
  }
  return keys;
}

const importKey = (jwk: Jwk): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

// ---------------------------------------------------------------- verification
/**
 * Verify signature and freshness, and return the claims. Throws on anything that
 * does not verify — callers must treat a throw as a hard denial, never as a cue
 * to fall back to a weaker check.
 */
export async function verifyRs256Jwt(kv: KvLike | undefined, source: JwksSource, token: string): Promise<JwtClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [rawHeader, rawPayload, rawSig] = parts as [string, string, string];

  let header: { alg?: string; kid?: string };
  let claims: JwtClaims;
  try {
    header = JSON.parse(b64urlToString(rawHeader));
    claims = JSON.parse(b64urlToString(rawPayload));
  } catch {
    throw new Error("malformed token");
  }
  // Pinning the algorithm is what stops `alg: none` and HS256-with-the-public-key.
  if (header.alg !== "RS256") throw new Error(`unexpected alg: ${header.alg}`);
  if (!header.kid) throw new Error("token has no kid");

  let jwk = (await fetchJwks(kv, source)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await fetchJwks(kv, source, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("no signing key matches the token");

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await importKey(jwk),
    b64urlToBytes(rawSig),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!ok) throw new Error("token signature is invalid");

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number") throw new Error("token has no expiry");
  if (now > claims.exp + CLOCK_SKEW_SECONDS) throw new Error("token has expired");
  if (typeof claims.nbf === "number" && now + CLOCK_SKEW_SECONDS < claims.nbf) {
    throw new Error("token is not yet valid");
  }
  return claims;
}
