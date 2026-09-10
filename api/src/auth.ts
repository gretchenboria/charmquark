/**
 * Authorization shim.
 *
 * The caller's role arrives in the `X-CharmQuark-Role` header (and optional
 * `X-CharmQuark-User`). Policy, carried over from the predecessor system: FULL
 * CRUD for every signed-in role — no hard-coded read-only. The only role-specific
 * action is the legal-review verdict, which stays a Fleet-Lead approval.
 *
 * The matrix below is the single wiring point, so policy can be tightened later
 * in one place. Swap `resolvePrincipal` for a real IdP (Cloudflare Access JWT)
 * without touching any route.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { Env, Principal, Role, Vars } from "./types";
import { badRequest, forbidden } from "./errors";
import { accessConfig, readAssertion, verifyAccessJwt } from "./access";

const ROLES: readonly Role[] = ["PM", "FLEET_LEAD", "ROBOT_OPERATOR"] as const;

const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);

/**
 * Resolve the caller to a role.
 *
 * Two modes, and which one is active depends only on configuration:
 *
 *   ENFORCED — Cloudflare Access is configured (`CF_ACCESS_TEAM_DOMAIN` and
 *   `CF_ACCESS_AUD`). The signed assertion is the sole source of identity: it
 *   is verified cryptographically, its email is matched to an active `users`
 *   row, and the X-CharmQuark-* headers are ignored entirely. An unverifiable
 *   assertion, or an email with no active user row, is a hard 403. There is
 *   deliberately no fallback here — falling back on a bad token would make the
 *   whole check theatre.
 *
 *   SHIM — Access is not configured. The X-CharmQuark-* headers are trusted,
 *   which authenticates nobody. This is the development default and it is
 *   reported as such by GET /api/cloud/status so it cannot be mistaken for
 *   security.
 */
async function resolveFromUsersTable(db: D1Database, subject: string): Promise<Principal | null> {
  const row = await db
    .prepare(`SELECT name, subject, role FROM users WHERE subject = ? AND is_active = 1`)
    .bind(subject)
    .first<{ name: string; subject: string; role: string }>();
  if (row && isRole(row.role)) return { role: row.role, name: row.name || row.subject };
  return null;
}

async function resolvePrincipal(
  env: Env,
  req: Request,
  roleHeader: string | undefined,
  userHeader: string,
): Promise<Principal> {
  const cfg = accessConfig(env);

  if (cfg) {
    const token = readAssertion(req);
    if (!token) {
      throw forbidden(
        "Cloudflare Access assertion missing. Requests must arrive through Access; " +
        "a direct call to the Worker origin cannot authenticate.",
      );
    }
    let identity;
    try {
      identity = await verifyAccessJwt(env, cfg, token);
    } catch (e) {
      throw forbidden(`Cloudflare Access assertion rejected: ${e instanceof Error ? e.message : "invalid"}`);
    }
    // Access proves who they are; the users table decides what they may do.
    const byEmail = await env.DB
      .prepare(`SELECT name, subject, role FROM users WHERE lower(email) = ? AND is_active = 1`)
      .bind(identity.email)
      .first<{ name: string; subject: string; role: string }>();
    if (byEmail && isRole(byEmail.role)) {
      return { role: byEmail.role, name: byEmail.name || byEmail.subject };
    }
    const bySubject = await resolveFromUsersTable(env.DB, identity.email);
    if (bySubject) return bySubject;
    throw forbidden(
      `${identity.email} authenticated with Cloudflare Access but has no active CharmQuark user. ` +
      "Add them under Users & Roles.",
    );
  }

  // --- shim mode ---
  if (userHeader && userHeader !== "dev") {
    const p = await resolveFromUsersTable(env.DB, userHeader);
    if (p) return p;
  }
  const raw = (roleHeader || "PM").toUpperCase();
  if (!isRole(raw)) throw badRequest(`unknown role: ${roleHeader}`);
  return { role: raw, name: userHeader || "dev" };
}

/** True when Access is enforcing identity rather than the header shim. */
export const isAccessEnforced = (env: Env): boolean => accessConfig(env) !== null;

/** Attach the principal to the request context. Mounted once, app-wide. */
export const principal: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = await resolvePrincipal(
    c.env,
    c.req.raw,
    c.req.header("X-CharmQuark-Role") ?? undefined,
    c.req.header("X-CharmQuark-User") ?? "dev",
  );
  c.set("principal", p);
  await next();
};

/**
 * CRUD-by-HTTP-method matrix. Every signed-in role currently gets full CRUD;
 * narrow a method's role set here to tighten policy app-wide.
 */
const CRUD_ROLES: Record<string, readonly Role[]> = {
  GET: ROLES,
  HEAD: ROLES,
  OPTIONS: ROLES,
  POST: ROLES,
  PUT: ROLES,
  PATCH: ROLES,
  DELETE: ROLES,
};

/** Router-level guard. New endpoints inherit the policy automatically. */
export const crudGuard: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = c.get("principal");
  const allowed = CRUD_ROLES[c.req.method] ?? ROLES;
  if (!allowed.includes(p.role)) {
    throw forbidden(
      `role ${p.role} may not ${c.req.method} this resource (allowed: ${[...allowed].sort().join(", ")})`,
    );
  }
  await next();
};

/**
 * Gate for administering the `users` table.
 *
 * That table IS the authorization source of record — resolvePrincipal reads
 * `role` from it — so leaving it under the open CRUD matrix meant any signed-in
 * operator could PATCH their own row to FLEET_LEAD and grant themselves the one
 * privilege the app actually gates. The RBAC system must not be writable by the
 * subjects it governs.
 */
export async function requireUserAdmin(c: Context<{ Bindings: Env; Variables: Vars }>): Promise<void> {
  const p = c.get("principal");
  if (p.role !== "FLEET_LEAD") {
    throw forbidden(`role ${p.role} may not administer users (requires: FLEET_LEAD)`);
  }
  // A Fleet Lead may manage the roster but not quietly escalate or lock out
  // peers by editing themselves — self-service role changes are the exact
  // escalation path being closed, and demoting yourself is how you lock the
  // last admin out of the account.
  const targetId = c.req.param("id");
  if (targetId && (c.req.method === "PATCH" || c.req.method === "DELETE")) {
    const row = await c.env.DB
      .prepare(`SELECT subject, lower(email) AS email FROM users WHERE id = ?`)
      .bind(targetId).first<{ subject: string; email: string | null }>();
    const me = p.name.toLowerCase();
    if (row && (row.subject?.toLowerCase() === me || (row.email ?? "") === me)) {
      throw forbidden("you cannot change your own role or status; ask another Fleet Lead");
    }
  }
}

/** Explicit gate for the legal-review verdict. */
export const requireLegalReviewer: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = c.get("principal");
  if (p.role !== "FLEET_LEAD") {
    throw forbidden(`role ${p.role} may not perform this action (requires: FLEET_LEAD)`);
  }
  await next();
};
