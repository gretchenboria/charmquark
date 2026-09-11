/**
 * Cloudflare Access — JWT verification.
 *
 * NOT wired into request authentication: CharmQuark authenticates with Firebase
 * ID tokens (identity.ts, auth.ts). This remains for a deployment that puts
 * Cloudflare Access in front of the Worker and wants to verify the assertion it
 * forwards — verifying it is what stops the header being a claim anyone can type.
 *
 * What is verified beyond the signature and freshness checks in jwt.ts:
 *   - `iss` equals the team domain   (a token minted for someone else's Access
 *     org must not work here)
 *   - `aud` contains this app's AUD  (a token minted for a *different app in the
 *     same org* must not work here — the one people forget, and why AUD is
 *     required config, not optional)
 */
import type { Env } from "./types";
import { verifyRs256Jwt } from "./jwt";

/** Cloudflare Access forwards the assertion in this header; the cookie is the fallback. */
const ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const ASSERTION_COOKIE = "CF_Authorization";

export interface AccessIdentity {
  /** The verified end-user email (or service-token common name). */
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
 * Configured only when BOTH values are present. A team domain without an AUD
 * would prove a token came from the right org while saying nothing about which
 * application it was minted for.
 */
export function accessConfig(env: Env): AccessConfig | null {
  const teamDomain = (env.CF_ACCESS_TEAM_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const aud = (env.CF_ACCESS_AUD ?? "").trim();
  if (!teamDomain || !aud) return null;
  return { teamDomain, aud };
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

/** Verify an Access assertion. Throws on anything that does not verify. */
export async function verifyAccessJwt(env: Env, cfg: AccessConfig, token: string): Promise<AccessIdentity> {
  const claims = await verifyRs256Jwt(
    env.FLEET_STATUS,
    { url: `https://${cfg.teamDomain}/cdn-cgi/access/certs`, cacheKey: `access:jwks:${cfg.teamDomain}` },
    token,
  );

  if (claims.iss !== `https://${cfg.teamDomain}`) throw new Error(`unexpected issuer: ${claims.iss}`);
  const auds = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!auds.includes(cfg.aud)) throw new Error("assertion was not minted for this application");

  // Service tokens authenticate a machine, not a person, and carry common_name.
  const raw = claims["email"] ?? claims["common_name"];
  const email = typeof raw === "string" ? raw.toLowerCase() : "";
  if (!email) throw new Error("assertion carries no identity");

  return { email, sub: claims.sub ?? email };
}
