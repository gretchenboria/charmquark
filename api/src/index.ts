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
import { crudGuard, principal } from "./auth";
import { mountResources } from "./routes/resources";
import { mountCatalog } from "./routes/catalog";
import { mountSessions } from "./routes/sessions";
import { mountAutoschedule } from "./routes/autoschedule";
import { mountMisc } from "./routes/misc";
import { mountDev } from "./routes/dev";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use(
  "*",
  cors({
    origin: (o) => o,
    allowHeaders: ["Content-Type", "X-CharmQuark-Role", "X-CharmQuark-User"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

/** Everything under /api is authenticated and policy-guarded. */
const api = new Hono<{ Bindings: Env; Variables: Vars }>();
api.use("*", principal);
api.use("*", crudGuard);

mountCatalog(api);
mountResources(api);
mountSessions(api);
mountAutoschedule(api);
mountMisc(api);
mountDev(api);

app.route("/api", api);

app.get("/health", (c) => c.json({ ok: true, service: "charmquark-api", env: c.env.ENVIRONMENT }));

/** FastAPI-compatible error envelope: the client reads `detail`. */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ detail: err.message }, err.status);
  }
  console.error("unhandled", err);
  return c.json({ detail: "internal error" }, 500);
});

app.notFound((c) => c.json({ detail: `no route for ${c.req.method} ${c.req.path}` }, 404));

export default app;
