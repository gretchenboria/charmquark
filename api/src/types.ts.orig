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
  AI: any;

  /**
   * Cloudflare Access. Both must be set for Access to be enforced — a team
   * domain alone proves the org, not which application the token was for.
   *   CF_ACCESS_TEAM_DOMAIN  e.g. "yourteam.cloudflareaccess.com"
   *   CF_ACCESS_AUD          the Access application's AUD tag
   * While unset the API falls back to the development header shim and says so
   * loudly via GET /api/cloud/status.
   */
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  /**
   * Stripe credentials for metered run credits. Optional for the same reason
   * VAULT is: a deployment without them still runs — it just reports that
   * payments are unconfigured instead of throwing. Both are Worker *secrets*
   * (`wrangler secret put`), never `vars`, and never in a tracked file.
   */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /**
   * Where Stripe sends the buyer back. Set it when the API and the web app do
   * not share an origin and the browser's Origin header cannot be trusted to
   * name the app; otherwise the request's own Origin is used.
   */
  APP_ORIGIN?: string;
  /**
   * Roboflow annotation handoff. Optional for the same reason as the two above:
   * a deployment without it still runs and says the integration is unconfigured
   * rather than half-working. A Worker *secret* (`wrangler secret put`), never a
   * var and never in a tracked file. See docs/ROBOFLOW.md.
   */
  ROBOFLOW_API_KEY?: string;
  /**
   * Roboflow workspace url slug. Only needed for the lineage record and the
   * project link the UI shows — uploads address the project directly.
   */
  ROBOFLOW_WORKSPACE?: string;
}

/** The RBAC principal for a request, derived from the X-CharmQuark-* headers. */
export type Role = "PM" | "FLEET_LEAD" | "ROBOT_OPERATOR";

export interface Principal {
  role: Role;
  name: string;
}

export type Vars = { principal: Principal };
