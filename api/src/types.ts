/** Worker bindings. Mirrors wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  /**
   * Object storage for recordings, run sheets and instruction files.
   *
   * Optional because R2 must be switched on for a Cloudflare account before a
   * bucket can exist; until then the binding is absent and the vault-backed
   * routes report that clearly rather than throwing on `undefined`. Everything
   * that only needs D1 works normally. See `requireVault`.
   */
  VAULT?: R2Bucket;
  FLEET_STATUS: KVNamespace;
  ENVIRONMENT: string;
}

/** The RBAC principal for a request, derived from the X-CharmQuark-* headers. */
export type Role = "PM" | "FLEET_LEAD" | "ROBOT_OPERATOR";

export interface Principal {
  role: Role;
  name: string;
}

export type Vars = { principal: Principal };
