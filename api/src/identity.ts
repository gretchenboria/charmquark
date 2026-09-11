/**
 * Firebase ID-token verification.
 *
 * The web app signs people in with Firebase and sends the ID token as
 * `Authorization: Bearer <token>`. This module is what makes that header mean
 * something: without it the token is just a string anyone can paste.
 *
 * What is verified, following Firebase's documented checks for third-party
 * verification:
 *   - RS256 signature against Google's securetoken JWKS      (authenticity)
 *   - `iss` is https://securetoken.google.com/<project>       (issued for our
 *     Firebase project, not someone else's)
 *   - `aud` is exactly the project id                         (same reason — the
 *     check people forget)
 *   - `exp`, and `iat` / `auth_time` not in the future        (freshness)
 *   - `sub` is non-empty                                      (it is the uid)
 *
 * Whether the email is *verified* is reported, not enforced, here; auth.ts
 * refuses unverified emails, because matching an unverified address to a users
 * row would let anyone who signs up with a colleague's email become them.
 */
import { CLOCK_SKEW_SECONDS, verifyRs256Jwt, type KvLike } from "./jwt.ts";

export const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface FirebaseIdentity {
  /** Firebase uid — stable per user per project. */
  uid: string;
  /** Lowercased, or null for sign-in methods that carry no email. */
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** The bearer token from `Authorization`, or null when there is none. */
export function readBearer(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1]! : null;
}

export async function verifyFirebaseIdToken(
  kv: KvLike | undefined,
  projectId: string,
  token: string,
): Promise<FirebaseIdentity> {
  const claims = await verifyRs256Jwt(kv, { url: FIREBASE_JWKS_URL, cacheKey: "firebase:jwks" }, token);

  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error(`token was issued for another project (${claims.iss})`);
  }
  if (claims.aud !== projectId) throw new Error("token was not minted for this project");
  if (typeof claims.sub !== "string" || !claims.sub) throw new Error("token carries no subject");

  const now = Math.floor(Date.now() / 1000);
  for (const k of ["iat", "auth_time"] as const) {
    const v = claims[k];
    if (typeof v === "number" && v > now + CLOCK_SKEW_SECONDS) throw new Error(`token ${k} is in the future`);
  }

  const email = typeof claims["email"] === "string" ? claims["email"].toLowerCase() : null;
  return {
    uid: claims.sub,
    email,
    emailVerified: claims["email_verified"] === true,
    name: typeof claims["name"] === "string" ? claims["name"] : null,
  };
}
