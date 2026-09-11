/**
 * Authentication and authorization.
 *
 * Identity — who is calling — is resolved once per request by `principal`:
 *
 *   FIREBASE — the normal path. The web app signs people in with Firebase and
 *   sends the ID token as `Authorization: Bearer <token>`. The token is verified
 *   cryptographically (identity.ts), its *verified* email is matched to an
 *   active `users` row, and the role comes from that row — never from anything
 *   the request says about itself. A token that does not verify is a hard 401;
 *   there is deliberately no fallback, because falling back on a bad token
 *   would make the check theatre.
 *
 *   DEV SHIM — only when ENVIRONMENT=development and no token is presented. The
 *   X-CharmQuark-Role / X-CharmQuark-User headers are trusted, which
 *   authenticates nobody; it exists so local dev and the e2e suite can act as
 *   any role. In every other environment those headers are ignored.
 *
 * GET /api/cloud/status reports which mode is active, so the shim cannot be
 * mistaken for security.
 *
 * Authorization — what the caller may do — is the POLICY matrix below, plus a
 * few explicit gates for money, safety and the users table itself.
 */
import type { Context, MiddlewareHandler } from "hono";
import type { Env, Principal, Role, Vars } from "./types";
import { authUnavailable, badRequest, forbidden, unauthorized } from "./errors";
import { readBearer, verifyFirebaseIdToken, type FirebaseIdentity } from "./identity";
import { RESOURCES } from "./contracts";

const ROLES: readonly Role[] = ["PM", "FLEET_LEAD", "ROBOT_OPERATOR"] as const;

const isRole = (v: string): v is Role => (ROLES as readonly string[]).includes(v);

export const isDevelopment = (env: Env): boolean => env.ENVIRONMENT === "development";

const firebaseProjectId = (env: Env): string | null => (env.FIREBASE_PROJECT_ID ?? "").trim() || null;

export type AuthMode = "firebase" | "dev-shim" | "unconfigured";

/** How this deployment authenticates callers. Surfaced by GET /api/cloud/status. */
export function authMode(env: Env): AuthMode {
  if (firebaseProjectId(env)) return "firebase";
  return isDevelopment(env) ? "dev-shim" : "unconfigured";
}

/**
 * Emails allowed to self-provision as FLEET_LEAD on first sign-in, so a fresh
 * deployment has a way in. Only applies when no users row exists for that
 * login at all — a deactivated account stays deactivated.
 */
const bootstrapAdmins = (env: Env): string[] =>
  (env.BOOTSTRAP_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

interface UserRow { subject: string; name: string; email: string | null; role: string }

async function principalForIdentity(env: Env, id: FirebaseIdentity): Promise<Principal> {
  if (!id.email) {
    throw forbidden("this sign-in carries no email address, so it cannot be matched to a CharmQuark user");
  }
  if (!id.emailVerified) {
    throw forbidden(`${id.email} is not verified yet — open the verification link we emailed you, then sign in again`);
  }

  const find = () => env.DB
    .prepare(
      `SELECT subject, name, email, role FROM users
       WHERE is_active = 1 AND (subject = ? OR lower(email) = ?)
       ORDER BY (subject = ?) DESC LIMIT 1`,
    )
    .bind(id.uid, id.email, id.uid)
    .first<UserRow>();

  let row = await find();
  if (!row && bootstrapAdmins(env).includes(id.email)) {
    const exists = await env.DB
      .prepare(`SELECT 1 FROM users WHERE subject = ? OR lower(email) = ?`)
      .bind(id.uid, id.email).first();
    if (!exists) {
      await env.DB
        .prepare(`INSERT INTO users (id, subject, name, email, role) VALUES (?, ?, ?, ?, 'FLEET_LEAD')`)
        .bind(crypto.randomUUID(), id.uid, id.name || id.email, id.email).run();
      row = await find();
    }
  }
  if (!row || !isRole(row.role)) {
    throw forbidden(`no active CharmQuark account for ${id.email} — ask a Fleet Lead to add this email on the Users page`);
  }
  return {
    role: row.role,
    name: row.name || row.subject,
    subject: row.subject,
    email: (row.email ?? id.email).toLowerCase(),
    via: "firebase",
  };
}

/** Development only: trust the X-CharmQuark-* headers. */
async function shimPrincipal(env: Env, roleHeader: string | undefined, userHeader: string): Promise<Principal> {
  if (userHeader && userHeader !== "dev") {
    const row = await env.DB
      .prepare(`SELECT subject, name, email, role FROM users WHERE subject = ? AND is_active = 1`)
      .bind(userHeader).first<UserRow>();
    if (row && isRole(row.role)) {
      return { role: row.role, name: row.name || row.subject, subject: row.subject, email: row.email, via: "dev-shim" };
    }
  }
  const raw = (roleHeader || "PM").toUpperCase();
  if (!isRole(raw)) throw badRequest(`unknown role: ${roleHeader}`);
  return { role: raw, name: userHeader || "dev", subject: userHeader || "dev", email: null, via: "dev-shim" };
}

async function resolvePrincipal(c: Context<{ Bindings: Env; Variables: Vars }>): Promise<Principal> {
  const env = c.env;
  const projectId = firebaseProjectId(env);
  const token = readBearer(c.req.raw);

  if (token && projectId) {
    let id: FirebaseIdentity;
    try {
      id = await verifyFirebaseIdToken(env.FLEET_STATUS, projectId, token);
    } catch (e) {
      throw unauthorized(`sign-in token rejected: ${e instanceof Error ? e.message : "invalid token"}`);
    }
    return principalForIdentity(env, id);
  }

  if (isDevelopment(env)) {
    return shimPrincipal(env, c.req.header("X-CharmQuark-Role"), c.req.header("X-CharmQuark-User") ?? "dev");
  }
  if (!projectId) throw authUnavailable();
  throw unauthorized("sign in required");
}

/** Attach the principal to the request context. Mounted once, app-wide. */
export const principal: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  c.set("principal", await resolvePrincipal(c));
  await next();
};

/**
 * Authorization policy.
 *
 * This replaces the predecessor's matrix, which granted every signed-in role
 * full CRUD on everything — so a Robot Operator and a Fleet Lead had identical
 * power, and the role was decoration. Permissions are now per resource and per
 * action, with three principles:
 *
 *   - **Reads are open.** Everyone on a fleet needs to see the fleet. Hiding
 *     the roster from the people operating it creates workarounds, not security.
 *   - **Writes follow the job.** A Robot Operator executes runs: they log
 *     execution, tick QA, tag coverage. They do not author the catalogue or
 *     change what the fleet is made of.
 *   - **Money and safety are narrower still.** Confirming a run spends a credit;
 *     legal review signs off a hazard; user admin rewrites the authorization
 *     table itself. Each of those has its own explicit gate below.
 *
 * Deletes are separated from writes deliberately: editing a robot and removing
 * it from the fleet are different-sized mistakes.
 */
type Action = "read" | "write" | "delete";

const PM_UP: readonly Role[] = ["PM", "FLEET_LEAD"];
const LEAD: readonly Role[] = ["FLEET_LEAD"];

/**
 * Resource -> action -> roles. The key is the first path segment after /api.
 * A resource absent from this table falls back to DEFAULT_POLICY, so a new
 * endpoint is governed rather than silently open.
 */
const POLICY: Record<string, Partial<Record<Action, readonly Role[]>>> = {
  // --- record types in the contract registry carry their own roles
  //     (packages/contracts/src/resources.ts, pinned by api/test/contracts.test.ts):
  //     planners author the catalogue and fleet, operators write runs, Fleet Leads
  //     delete fleet records and administer users. The planning actions nested
  //     under /runs carry `requirePlanner` on the route. ---
  ...Object.fromEntries(Object.values(RESOURCES).map((r) => [r.path, r.roles])),

  // --- everything else ---
  "run-proposals":  { read: ROLES, write: PM_UP, delete: PM_UP },
  documents:        { read: ROLES, write: ROLES, delete: PM_UP },
  workflows:        { read: ROLES, write: PM_UP, delete: PM_UP },
  billing:          { read: ROLES, write: PM_UP, delete: LEAD },
  roboflow:         { read: ROLES, write: PM_UP, delete: PM_UP },
  integrations:     { read: ROLES, write: PM_UP, delete: PM_UP },
  chat:             { read: ROLES, write: ROLES, delete: LEAD },
  me:               { read: ROLES },
  cloud:            { read: ROLES, write: LEAD,  delete: LEAD },
  dev:              { read: LEAD,  write: LEAD,  delete: LEAD },
};

/** Unknown resources: readable by all, mutable only by planners. */
const DEFAULT_POLICY: Required<Record<Action, readonly Role[]>> = {
  read: ROLES,
  write: PM_UP,
  delete: LEAD,
};

const actionFor = (method: string): Action =>
  method === "DELETE" ? "delete" : method === "GET" || method === "HEAD" || method === "OPTIONS" ? "read" : "write";

/** First path segment after /api — the resource being addressed. */
export function resourceOf(path: string): string {
  const parts = path.split("?")[0]!.split("/").filter(Boolean);
  const i = parts.indexOf("api");
  return (i >= 0 ? parts[i + 1] : parts[0]) ?? "";
}

/**
 * Router-level guard. New endpoints inherit the policy automatically, and an
 * unrecognised resource is governed by DEFAULT_POLICY rather than left open.
 */
export const crudGuard: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = c.get("principal");
  const action = actionFor(c.req.method);
  const resource = resourceOf(c.req.path);
  const allowed = POLICY[resource]?.[action] ?? DEFAULT_POLICY[action];
  if (!allowed.includes(p.role)) {
    throw forbidden(
      `role ${p.role} may not ${action} ${resource || "this resource"} ` +
      `(allowed: ${[...allowed].sort().join(", ")})`,
    );
  }
  await next();
};

/** PM or Fleet Lead — the roles that commit the fleet's plan. */
export const isPlanner = (role: Role): boolean => PM_UP.includes(role);

/**
 * Confirming a run spends a credit and books a lab slot against everyone else's
 * capacity. That is a planning commitment, not a field action, so it is gated
 * above the open write policy on `runs` that lets operators log execution.
 */
export const requireRunConfirmer: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = c.get("principal");
  if (!isPlanner(p.role)) {
    throw forbidden(`role ${p.role} may not confirm a run — confirming spends a credit (requires: FLEET_LEAD, PM)`);
  }
  await next();
};

/**
 * Planning actions that live under /runs — accepting or re-rolling a proposal,
 * the standby robot swap. They change the plan (and robot status), not the
 * field log, so the open `runs.write` policy is not enough.
 */
export const requirePlanner: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const p = c.get("principal");
  if (!isPlanner(p.role)) {
    throw forbidden(`role ${p.role} may not perform this planning action (requires: FLEET_LEAD, PM)`);
  }
  await next();
};

/**
 * Mission fields that decide whether a hazard is cleared for scheduling: a
 * mission is schedulable when risk is LOW or legal is APPROVED. Setting either
 * directly would skip the Fleet-Lead legal review, so only a Fleet Lead may —
 * everyone else goes through "Assess risk" and the legal-review action.
 */
export const CLEARANCE_FIELDS = ["risk_level", "legal_approval"] as const;

/** Throw unless the caller may change the given clearance fields. */
export function requireClearanceAuthority(p: Principal, changed: readonly string[]): void {
  if (changed.length === 0 || p.role === "FLEET_LEAD") return;
  throw forbidden(
    `role ${p.role} may not set ${changed.join(", ")} directly — use Assess risk and the ` +
    "Fleet Lead legal review (requires: FLEET_LEAD)",
  );
}

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
  // last admin out of the account. Compared on the verified subject and email,
  // never the display name.
  const targetId = c.req.param("id");
  if (targetId && (c.req.method === "PATCH" || c.req.method === "DELETE")) {
    const row = await c.env.DB
      .prepare(`SELECT subject, lower(email) AS email FROM users WHERE id = ?`)
      .bind(targetId).first<{ subject: string; email: string | null }>();
    const isSelf = !!row && (row.subject === p.subject || (!!p.email && row.email === p.email));
    if (isSelf) throw forbidden("you cannot change your own role or status; ask another Fleet Lead");
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
