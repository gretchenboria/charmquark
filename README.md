# CharmQuark

Fleet orchestration and physical-AI resource management for robot operations.

CharmQuark plans and runs **data-collection runs** for a robot fleet: which
robot, in which lab, with which sensor rig, driven by which operator, running
which missions — and whether every gate is green before anyone presses record.

It merges two predecessor systems: a research data-collection orchestrator (the
scheduling canvas, readiness engine, auto-scheduler and QA pipeline) and a lab
operations toolkit (sensor inventory, operator roster, maintenance, stock).

---

## Architecture

```
                    charmquark.app
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
  charmquark-web                     charmquark-api
  Next.js 15 on Workers              Hono on Workers
  (OpenNext adapter)                        │
                                    ┌───────┼───────┐
                                    │       │       │
                                   D1      R2      KV
                              relational  vault   hot
                                 state   objects  status
```

- **`web/`** — Next.js 15 App Router, Tailwind, Recharts, deployed to Cloudflare
  Workers via the OpenNext adapter.
- **`api/`** — Hono Worker serving the whole `/api/*` surface, backed by D1.
- **`db/`** — D1 migrations and the generated dummy-data seed.
- **`docs/`** — the RobotOps/DataOps capability specification.

`charmquark.app/api/*` is bound directly to the API Worker at the edge, so API
calls never transit the web Worker. The Next rewrite in `web/next.config.mjs`
exists only for `next dev`.

---

## Quick start

```bash
# 1. API — create the local D1 database, migrate and seed
cd api
npm install
npm run db:reset:local        # migrate + load the dummy dataset
npm run dev                   # Worker API on http://127.0.0.1:8787

# 2. Web — in a second terminal
cd web
npm install
npm run dev                   # app on http://127.0.0.1:3000
```

Open the app and pick a user — the login is a role picker (`PM`, `Fleet Lead`,
`Robot Operator`), not a credential check. Everything is seeded, so the
scheduling board has real content immediately.

To exercise the Cloudflare runtime rather than the Next dev server:

```bash
cd web && npm run cf:preview   # builds with OpenNext, serves via wrangler dev
```

---

## Domain model

| Entity | What it is |
|---|---|
| **Campaign** | A body of data to collect (e.g. *Warehouse Perception Baseline*). |
| **Mission group / Mission** | One thing to capture, with variants and injected-error scenarios. |
| **Run** | One lab slot: one robot + one operator + one sensor rig executing a set of missions. |
| **Robot** | The fleet asset a run collects data from. Carries the mission clearance gates. |
| **Operator** | The human running the run. |
| **Lab** | Where a run happens. Has a daily capacity and blackout days. |
| **Sensor / Sensor rig** | The payloads (LiDAR, stereo, IMU, RTK, thermal, F/T…) and the rigs they form. |
| **QA pipeline run** | The gated review of what a run captured. |

### The two rules that drive everything

**Effort budget.** A run holds **4 effort units**: `1 LONG = 2 MEDIUM = 4 SHORT`
(about an hour). A valid run needs at least 2 units. The auto-scheduler packs
against this; readiness enforces it.

**Readiness.** A run may only be confirmed with **zero** readiness issues.
Issues come from every member — missions (instructions, risk clearance, variants,
inventory), robot (safety certification, calibration, commissioning), operator
(active, not double-booked), lab (available, not blacked out, under capacity)
and sensor fleet (all devices operational). The logic is pure and lives in
`api/src/domain.ts`.

### The collection loop

```
propose → accept → run sheet (CSV) → collect → upload → reps reconciled
   ↑                                                          │
   └──────────────── next proposal picks up the gap ──────────┘
```

`POST /api/run-proposals` packs a run; accepting emits a CSV run sheet
(one row per planned repetition) into R2; uploading the completed sheet advances
each mission's repetition count and returns anything the operator dropped back to
`AVAILABLE`.

---

## Deploying to Cloudflare

The API token lives in `.env` (gitignored, never committed). See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full walkthrough.

```bash
export CLOUDFLARE_API_TOKEN=$(grep CLOUDFLARE_API_TOKEN .env | cut -d= -f2)

cd api
wrangler d1 create charmquark          # paste database_id into wrangler.jsonc
wrangler r2 bucket create charmquark-vault
wrangler kv namespace create FLEET_STATUS   # paste id into wrangler.jsonc
npm run db:migrate                     # apply migrations to remote D1
npm run db:seed                        # load the dummy dataset
wrangler deploy

cd ../web
npm run cf:deploy
```

Then bind the hostname: uncomment `routes` in both `wrangler.jsonc` files.

---

## Onboarding a RobotOps team

The seed is a **fictional** dataset, safe to demo and safe to throw away.

1. `POST /api/dev/seed/demo` (or the *Load sample program* button) resets to it.
2. Replace it with real fleet data via the UI or the API: create labs, robots,
   operators, devices and sensor fleets, then a campaign and its mission catalog.
3. Set `ENVIRONMENT=production` — this disables the seed endpoints so nobody can
   wipe a live database.

Real work starts at **Robots** and **Labs**; the scheduling board fills itself
once missions are approved and a robot is cleared.

---

## Where the depth is

[`docs/ROBOTOPS_SPEC.md`](docs/ROBOTOPS_SPEC.md) is the capability specification
for full multisensor-fusion fleet orchestration: sensor rigs and extrinsics,
calibration and time-sync as first-class gates, telemetry ingest, MCAP artifacts
and dataset lineage, duty-cycle maintenance, and a per-robot Durable Object model.
It goes well beyond what is implemented here — treat it as the roadmap. See
[docs/ROADMAP.md](docs/ROADMAP.md) for what is built versus what is specified, and
[docs/BRAND.md](docs/BRAND.md) for the design system.

## Testing

```bash
cd api && npm run typecheck
cd web && npm run typecheck && npm run build
cd web && npx playwright test          # boots both Workers, drives the UI
```
