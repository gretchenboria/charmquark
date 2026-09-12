# Handoff

State of CharmQuark as of 2026-09-10. Written so another agent or engineer can
pick this up cold. Read this first, then `README.md`.

---

## 1. What this is

A Single-Tenant ROS2 Command & Control Center and fleet-orchestration app for `charmquark.app`. It includes a native ROS2 Python edge client (`packages/edge_client`) that streams live WebSocket telemetry and executes immediate hardware commands (like E-Stops). Built on two Cloudflare Workers plus D1. See `README.md` for the domain model and `docs/DATA_STRIPPING.md` for provenance of the predecessor research system.

## 2. Live Cloudflare state

The Cloudflare account is the one `CLOUDFLARE_ACCOUNT_ID` in `/.env` names
(account identifiers are kept out of tracked docs).

| Resource | State | Identifier |
|---|---|---|
| D1 `charmquark` | **created, migrated, seeded** | `database_id` in `api/wrangler.jsonc` |
| KV `FLEET_STATUS` | **created** | `id` in `api/wrangler.jsonc` |
| R2 `charmquark-vault` | **created** (R2 enabled 2026-09-10) | Standard storage class |
| Zone `charmquark.app` | active, **DNS created** | AAAA apex -> `100::` proxied, CNAME www |
| Worker `charmquark-api` | **DEPLOYED**, `ENVIRONMENT=production` | route `charmquark.app/api/*` live |
| Worker `charmquark-web` | **DEPLOYED** | route `charmquark.app/*` live |

Remote D1 verified holding: 11 robots, 10 missions, 7 runs, 14 sensors, 3 labs.

Both ids are already written into `api/wrangler.jsonc`.

## 3. Credentials

`/.env` at the repo root — **gitignored, mode 600, never commit it**. Holds
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Hard-won lesson, do not repeat it: **`wrangler whoami` succeeding proves only
that a token authenticates, not that it may do anything.** Two different tokens
were tried; the first was a *zone* token whose `#worker:edit` binds Worker routes
but cannot upload a script or create D1/KV/R2. Verify scopes directly:

```bash
set -a; . ./.env; set +a
for r in d1/database storage/kv/namespaces r2/buckets workers/scripts; do
  printf '%-24s ' "$r"
  curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/$r" |
    python3 -c "import json,sys;print(json.load(sys.stdin)['success'])"
done
```

The token now in `.env` returns `True` for D1, KV and Workers Scripts. R2 returns
`False` — but that is **not** a permission problem, see below.

## 4. R2 — resolved

R2 was not enabled on the account (`code 10042`), which blocked bucket creation.
The user enabled it on 2026-09-10 and `charmquark-vault` now exists. All three
bindings in `api/wrangler.jsonc` are live.

No code change was needed to switch back on: the `VAULT` binding is declared
optional in `api/src/types.ts` and every vault-backed route calls
`requireVault(env)` (`api/src/db.ts`), which throws a 503 naming the cause only
while the binding is absent. With the bucket present it simply stops firing.
Keep that guard — it is what makes a missing bucket a legible error rather than
a `TypeError` on `undefined`.

## 5. Deploying — DONE, and one trap to know

**https://charmquark.app is live**, both Workers deployed, metered from the
first deploy so it was never reachable unpaywalled.

Two things bit during the first deploy, both now fixed but worth knowing:

1. **A new zone has no DNS records**, so a Worker route never fires and
   Cloudflare returns 522. An apex `AAAA -> 100::` (the reserved discard
   prefix) with `proxied: true` is the fix — the origin is never contacted and
   the Worker serves the route. Allow ~30s for route propagation; a fresh
   deploy can 522 on some paths and 200 on others in the meantime.
2. **`ENVIRONMENT` shipped as `development`**, which left `/api/dev/seed/*` —
   the endpoints that wipe the database — returning 200 on the live site. The
   committed default in `api/wrangler.jsonc` is now `production`, and local dev
   opts *down* via the dev script's `--var ENVIRONMENT:development`. Never
   invert that: the fail-safe direction is locked-down-by-default. Verify after
   any deploy:
   `curl -X POST https://charmquark.app/api/dev/seed/demo -H 'X-CharmQuark-Role: PM'`
   must return **401** (the header no longer authenticates in production). A
   signed-in Fleet Lead must still get **403** there.

If your machine cached an NXDOMAIN for charmquark.app before DNS existed,
curl needs `--resolve charmquark.app:443:$(dig +short charmquark.app @1.1.1.1 | head -1)`
and Chromium needs `--host-resolver-rules`.

Redeploy:

```bash
set -a; . ./.env; set +a
cd api && wrangler deploy          # then curl https://charmquark.app/api/labs
cd ../web && npm run cf:deploy     # OpenNext build + deploy
```

Routes are already declared in both `wrangler.jsonc` files. The API's
`charmquark.app/api/*` is more specific than the web Worker's `charmquark.app/*`,
so it wins — which is why `web/next.config.mjs` emits its `/api` rewrite in
**development only** (see the comment there; the OpenNext adapter parses rewrite
destinations with path-to-regexp and throws on a `host:port` destination).

Before production traffic, read `docs/DEPLOYMENT.md` §"Production hardening"
and the going-live checklist in `docs/ACCESS.md`.

Pushes to `main` now deploy only after `.github/workflows/ci.yml` passes
(typecheck, tests, lint, build, brand grep, append-only migrations), and D1
migrations are applied before the API deploys.

## 6. Running locally

```bash
cd api && npm i && npm run db:reset:local && npm run dev   # Worker API on :8787
cd web && npm i && npm run dev                             # app on :3000
```

Port 3000 is occupied by an unrelated Express app on this machine — use
`npm run dev -- -p 3100` and `E2E_BASE_URL=http://127.0.0.1:3100` for tests.

Verification gates, all currently passing:

```bash
cd api && npx tsc --noEmit
cd web && npx tsc --noEmit && npm run build && npm run cf:build
cd web && E2E_NO_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test
```

The e2e (`web/e2e/operator-finish.spec.ts`) builds an assembly through the API,
confirms it, then drives the operator Finish flow through the real UI to
COLLECTED. It has already caught two genuine bugs — trust it.

## 7. Traps that already bit, do not repeat

1. **D1 rejects `BEGIN TRANSACTION`/`COMMIT`** in files run via
   `wrangler d1 execute --file`. Local SQLite accepts them, so this only fails
   against the real database. `api/scripts/gen-seed.mjs` now omits them.
2. **The seed is generated.** Source of truth is `api/src/seedData.ts`; run
   `npm run --prefix api db:seed:generate`. Never hand-edit
   `db/seed/0001_dummy.sql`.
3. **Seed data must satisfy the domain rules.** An early seed marked runs `READY`
   whose mission sets blew the 4-unit effort budget, so they were not actually
   ready. Runs are `SINGLE`-scope with deliberately budget-sized mission sets;
   run 7 keeps one real blocker on purpose.
4. **zsh does not word-split unquoted variables.** A bulk `perl -pi -e ... $FILES`
   silently did nothing. Use `find -print0 | xargs -0`.
5. **BSD xargs has no `-a`.** Use `xargs -0 ... < file`.
6. **`cd` leaks across `(...)` subshells** in a compound command — two
   `wrangler dev` invocations both ran from `api/`. Be explicit.
7. **No cyan or teal, ever** — see `docs/BRAND.md`. `grep -rE
   '(bg|text|border|ring)-(teal|cyan|sky)-' web/src` must stay empty.

## 8. Known gaps, stated plainly

- **Auth is Firebase ID tokens verified in the Worker**, mapped to `users` rows by
  verified email; the header shim works only with `ENVIRONMENT=development`. See
  `docs/ACCESS.md`, including the going-live checklist: `INTEGRATION_KEY_SECRET`,
  `BOOTSTRAP_ADMIN_EMAILS`, GitHub `NEXT_PUBLIC_FIREBASE_*` variables, and a users
  row with an email for every person. Agents use API tokens (`cq_pat_…`).
- **Integration keys were reset** by migration `0006`: the old plaintext rows are
  dropped, so re-enter the Roboflow key on the Integrations page.
- The `ROBOTOPS_SPEC.md` capability set is largely unbuilt — see
  `docs/ROADMAP.md` for the honest built-vs-specified line. Its highest-value gap
  is calibration and time-sync as real readiness gates; without them a run can be
  recorded that is silently useless for sensor fusion.

## 9. In flight

Single-Tenant Enterprise Licensing with a Hard Paywall has landed. Once Demo Mode credits run out, the UI locks until `is_unlimited = 1` is set. Stripe has been removed. See `docs/BILLING.md`.

The agentic-configuration roadmap is in progress. These have landed:
- real auth and CI gates
- the contracts package
- CRUD with audit and `If-Match`
- settings and change sets
- agent guardrails
- the editable UI
- the MCP server and tool-using Charmy

Phase 5 makes workflows meaningful:
- BPMN tasks bind to a service catalogue (`cq:service`) and diagrams are validated on the server.
- The designer has a binding panel and a restricted palette.
- Diagrams can be generated from a graph or a description.
- W1–W4 are seeded as diagrams.

Phase 6 is customer config-as-code: export, plan and apply bundles, schemas, the
`cq` CLI and a starter repo in `templates/customer-config/`, plus Settings →
Configuration bundle. Still to come are running diagrams, and the central store
with per-customer provisioning.

## 10. Map

| Path | What |
|---|---|
| `api/src/domain.ts` | All pure domain rules — readiness gates, effort budget, risk lexicon, run codes. Start here to understand the product. |
| `api/src/routes/runs.ts` | Run lifecycle: assembly, readiness, confirm, pipeline, standby swap. |
| `api/src/routes/autoschedule.ts` | Proposal packing, run-sheet CSV, upload reconcile. |
| `api/src/auth.ts` | RBAC — the single wiring point for tightening policy. |
| `api/src/seedData.ts` | The fictional dataset (generates the seed SQL). |
| `db/migrations/` | D1 schema. |
| `packages/contracts/src/` | **Single source of truth** for enums (`enums.ts`), field specs and validation (`fields.ts`), and the resource registry — writable fields, read-only reasons, roles (`resources.ts`). Used by API and web; pinned against the migrations by `api/test/contracts.test.ts`. |
| `api/src/auth.ts` + `api/src/identity.ts` + `api/src/tokens.ts` | Firebase sign-in, API tokens for agents, and the role policy. See `docs/ACCESS.md`. |
| `api/src/changes.ts` | The shared write path: `If-Match`/`version` checks (409 on conflict) and the audit trail (`GET /api/audit`). |
| `api/src/changesets.ts` | Change sets: batched edits previewed (diff + problems) and applied atomically, version-pinned. How agents should change things. |
| `packages/contracts/src/settings.ts` + `api/src/settings.ts` | Deployment settings (effort budget, slot window, working days, hazard lexicon, limits). Defaults = the old constants; overrides in D1. |
| `packages/contracts/src/workflows.ts` | Workflow service catalogue, the `cq:` BPMN extension, the JSON graph schema, the graph → laid-out BPMN builder, and the W1–W4 templates. |
| `api/src/workflow.ts` + `api/src/routes/workflows.ts` | Server-side BPMN validation (bpmn-moddle) and the workflow routes: CRUD, versions, validate, generate. See `docs/ACCESS.md`. |
| `api/src/agent/` | The agent tool registry (`tools.ts`), MCP protocol (`mcp.ts`), model-neutral assistant loop (`llm.ts`) and workflow generation (`workflowGen.ts`). |
| `packages/contracts/src/config.ts` + `api/src/config.ts` + `api/src/routes/config.ts` | Config bundles: format, natural keys and JSON Schemas; the pure bundle planner; export/plan/apply routes. See `docs/ACCESS.md`. |
| `templates/customer-config/` | The customer starter repo: `cq.mjs` CLI, `AGENTS.md`, MCP configs, CI example. Tested by `api/test/cli.test.ts` and smoke. |
| `web/src/components/BpmnDesigner.tsx` | bpmn-js designer: restricted palette, service binding panel, live checks, If-Match saves, version history. |
| `api/scripts/smoke.sh` | End-to-end API checks against a local Worker; CI runs it on every PR. `npm --prefix api run smoke`. |
| `web/src/lib/api.ts` | Typed API client — the wire contract. |
| `web/src/app/globals.css` | Brand tokens. |
| `docs/BRAND.md` | Design system. Read before touching UI. |
| `docs/ROBOTOPS_SPEC.md` | The full capability spec (mostly unbuilt). |
| `docs/ROADMAP.md` | Built vs specified; the naming decision and its reasoning. |
| `CQ Logo.png` | Source artwork the palette was sampled from. |
