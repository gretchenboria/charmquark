/** Worker bindings. Mirrors wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  VAULT: R2Bucket;
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
