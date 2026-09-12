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
  ROBOT_ACTOR: DurableObjectNamespace;
  ENVIRONMENT: string;
  AI: any;
  GEMINI_API_KEY?: string;
  /** Assistant model overrides; defaults live in routes/chat.ts. */
  GEMINI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;

  /**
   * The Firebase project whose ID tokens this API accepts (a var, not a secret —
   * it is public in the web bundle too). Required outside development: without
   * it every request is a 503 naming this variable. See auth.ts.
   */
  FIREBASE_PROJECT_ID?: string;
  /**
   * Comma-separated emails that may self-provision as FLEET_LEAD on first
   * sign-in when they have no users row — how a fresh deployment gets its first
   * admin. Set as a secret; remove once the roster exists.
   */
  BOOTSTRAP_ADMIN_EMAILS?: string;
  /**
   * Comma-separated origins allowed to call the API cross-origin. Unset in
   * production means same-origin only (the web app and API share a host).
   */
  ALLOWED_ORIGINS?: string;
  /**
   * Seals third-party credentials at rest (secrets.ts). A Worker secret:
   * `openssl rand -base64 32 | wrangler secret put INTEGRATION_KEY_SECRET`.
   */
  INTEGRATION_KEY_SECRET?: string;

  /**
   * Cloudflare Access — only for a deployment that puts Access in front of the
   * Worker. Not used for request authentication; see access.ts.
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
   * The central store (store/). STORE_PUBLIC_KEY is the base64 raw Ed25519 key
   * grants are verified with; DEPLOYMENT_ID is this deployment's id in the store,
   * which every grant must name. Both are public vars. STORE_URL, once set, sends
   * buyers to the store and turns off this Worker's own Stripe checkout.
   */
  STORE_PUBLIC_KEY?: string;
  DEPLOYMENT_ID?: string;
  STORE_URL?: string;
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

export type Role = "PM" | "FLEET_LEAD" | "ROBOT_OPERATOR";

/** The authenticated caller, resolved once per request by auth.ts. */
export interface Principal {
  role: Role;
  /** Display name — for messages and audit text only, never for identity checks. */
  name: string;
  /** users.subject — the stable identity. */
  subject: string;
  /** Verified, lowercased email; null only under the development shim. */
  email: string | null;
  /** How the caller authenticated: a browser sign-in, an API token, or the dev shim. */
  via: "firebase" | "pat" | "dev-shim";
  /** API tokens only: what the token may do on top of its user's role. */
  scopes?: readonly ("read" | "write")[];
  /** API tokens only: which token, so it can be revoked from the audit trail. */
  tokenId?: string;
}

export type Vars = { principal: Principal };
