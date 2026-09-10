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
import type { MiddlewareHandler } from "hono";
import type { Env, Principal, Role, Vars } from "./types";
import { badRequest, forbidden } from "./errors";

const ROLES: readonly Role[] = ["PM", "FLEET_LEAD", "ROBOT_OPERATOR"] as const;

const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);

/**
 * Resolve the caller to a role.
 *   1. If X-CharmQuark-User maps to an active `users` row, use that row's role.
 *   2. Otherwise fall back to the X-CharmQuark-Role header shim.
 */
async function resolvePrincipal(db: D1Database, roleHeader: string | undefined, userHeader: string): Promise<Principal> {
  if (userHeader && userHeader !== "dev") {
    const row = await db
      .prepare(`SELECT name, subject, role FROM users WHERE subject = ? AND is_active = 1`)
      .bind(userHeader)
      .first<{ name: string; subject: string; role: string }>();
    if (row && isRole(row.role)) {
      return { role: row.role, name: row.name || row.subject };
    }
  }
  const raw = (roleHeader || "PM").toUpperCase();
  if (!isRole(raw)) throw badRequest(`unknown role: ${roleHeader}`);
  return { role: raw, name: userHeader || "dev" };
}

/** Attach the principal to the request context. Mounted once, app-wide. */
export const principal: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = await resolvePrincipal(
    c.env.DB,
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

/** Explicit gate for the legal-review verdict. */
export const requireLegalReviewer: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = c.get("principal");
  if (p.role !== "FLEET_LEAD") {
    throw forbidden(`role ${p.role} may not perform this action (requires: FLEET_LEAD)`);
  }
  await next();
};
