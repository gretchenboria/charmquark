/**
 * CharmQuark API — Cloudflare Worker.
 *
 * Serves the whole `/api/*` surface the web app consumes, backed by D1
 * (relational state), R2 (recordings, run sheets, instruction files) and KV
 * (hot fleet status). Errors are shaped as `{detail: "..."}` so the client's
 * ApiError.friendly getter renders them directly in a toast.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Env, Vars } from "./types";
import { crudGuard, isDevelopment, principal } from "./auth";
import { mountResources } from "./routes/resources";
import { mountCatalog } from "./routes/catalog";
import { mountRuns } from "./routes/runs";
import { mountAutoschedule } from "./routes/autoschedule";
import { mountMisc } from "./routes/misc";
import { mountCoverage } from "./routes/coverage";
import { mountDev } from "./routes/dev";
import { mountBilling, mountBillingWebhook } from "./routes/billing";
import { mountRoboflow } from "./routes/roboflow";
import { chat } from "./routes/chat";
import { mountIntegrations } from "./routes/integrations";
import { mountTokens } from "./routes/tokens";
import { mountAudit } from "./routes/audit";
import { mountSettings } from "./routes/settings";
import { mountChangesets } from "./routes/changesets";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const allowedOrigins = (env: Env): string[] =>
  (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);

app.use(
  "*",
  cors({
    // Listed origins only. In production the web app and API share a host, so
    // no cross-origin caller is needed; development reflects any origin so
    // `next dev` on whatever port works.
    origin: (origin, c) =>
      allowedOrigins(c.env).includes(origin) || isDevelopment(c.env) ? origin : null,
    allowHeaders: ["Content-Type", "Authorization", "X-CharmQuark-Role", "X-CharmQuark-User"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

/**
 * The Stripe webhook is registered before the guarded router so it matches
 * first. It carries no user credential — its credential is the
 * `stripe-signature` it is verified against.
 */
mountBillingWebhook(app);

/** Everything under /api is authenticated and policy-guarded. */
const api = new Hono<{ Bindings: Env; Variables: Vars }>();
api.use("*", principal);
api.use("*", crudGuard);

/** Who the server thinks you are. The web app takes its role from here, never from itself. */
api.get("/me", (c) => {
  const p = c.get("principal");
  return c.json({ name: p.name, role: p.role, subject: p.subject, email: p.email, auth: p.via });
});

mountCatalog(api);
mountResources(api);
mountRuns(api);
mountAutoschedule(api);
mountMisc(api);
mountCoverage(api);
mountBilling(api);
mountRoboflow(api);
mountIntegrations(api);
mountTokens(api);
mountAudit(api);
mountSettings(api);
mountChangesets(api);
mountDev(api);
api.route("/chat", chat);

app.route("/api", api);

app.get("/health", (c) => c.json({ ok: true, service: "charmquark-api", env: c.env.ENVIRONMENT }));

/** FastAPI-compatible error envelope: the client reads `detail`. */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // A prepared response (e.g. a 409 carrying the current record) goes out as built.
    if (err.res) return err.getResponse();
    return c.json({ detail: err.message }, err.status);
  }
  console.error("unhandled", err);
  return c.json({ detail: "internal error" }, 500);
});

app.notFound((c) => c.json({ detail: `no route for ${c.req.method} ${c.req.path}` }, 404));

export default app;
