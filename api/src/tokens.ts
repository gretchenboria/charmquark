/**
 * Personal access tokens — how an agent (Claude Code, Gemini CLI, a script)
 * authenticates without a browser sign-in.
 *
 * A token is 32 random bytes behind a recognisable prefix, so it is obvious in a
 * leaked log and secret scanners can match it. Only its SHA-256 is stored: a
 * database dump yields nothing that authenticates. Pure functions, unit-tested.
 */

export const TOKEN_PREFIX = "cq_pat_";

/** What a token may do. `read` is GET only; `write` adds changes. Never more than its user. */
export const TOKEN_SCOPES = ["read", "write"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

export const isPatToken = (token: string): boolean => token.startsWith(TOKEN_PREFIX);

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64url = btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${TOKEN_PREFIX}${b64url}`;
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Enough to recognise a token in a list; far too little to use one. */
export const displayPrefix = (token: string): string => token.slice(0, TOKEN_PREFIX.length + 6);

/** Parse a stored scopes column, keeping only known scopes. */
export function parseScopes(raw: unknown): TokenScope[] {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((s): s is TokenScope => (TOKEN_SCOPES as readonly string[]).includes(s)) : [];
  } catch {
    return [];
  }
}
