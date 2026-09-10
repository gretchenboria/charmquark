# Handoff

State of CharmQuark as of 2026-09-10. Written so another agent or engineer can
pick this up cold. Read this first, then `README.md`.

---

## 1. What this is

A fleet-orchestration and physical-AI resource-management app for `charmquark.app`,
ported from a predecessor research-orchestration system ("Gala") whose data was
fully stripped. Two Cloudflare Workers plus D1. See `README.md` for the domain
model and `docs/DATA_STRIPPING.md` for provenance.

## 2. Live Cloudflare state

The account is `Me@gretchenboria.com's Account`, id `6c415c903ba42618ddadb9175a6255b8`.

| Resource | State | Identifier |
|---|---|---|
| D1 `charmquark` | **created, migrated, seeded** | `817b5862-28b3-489c-a57a-b010f1844e4b` |
| KV `FLEET_STATUS` | **created** | `634e3230fd224dadbc7546b9535b8a80` |
| R2 `charmquark-vault` | **created** (R2 enabled 2026-09-10) | Standard storage class |
| Zone `charmquark.app` | active | `7b85c4188317eecf2885944390901599` |
| Worker `charmquark-api` | **not deployed yet** | route `charmquark.app/api/*` configured |
| Worker `charmquark-web` | **not deployed yet** | route `charmquark.app/*` configured |

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

## 5. Deploying

Not yet done — deliberately. See §9: the paywall must ship in the first
deploy so the app is never publicly reachable unmetered. Everything else is
ready.

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

Before production traffic, read `docs/DEPLOYMENT.md` §"Production hardening" —
in particular auth is still a header shim (§8 below).

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

- **Auth is a development shim.** `api/src/auth.ts` trusts the
  `X-CharmQuark-Role` header. Anyone who can reach the Worker can claim any role.
  The fix is Cloudflare Access in front of `charmquark.app` plus swapping
  `resolvePrincipal` to read the verified Access JWT; the RBAC matrix in that
  file is already the single wiring point. **Do not describe the app as secured
  until this is done.**
- **R2 features are 503** until R2 is enabled (§4).
- The `ROBOTOPS_SPEC.md` capability set is largely unbuilt — see
  `docs/ROADMAP.md` for the honest built-vs-specified line. Its highest-value gap
  is calibration and time-sync as real readiness gates; without them a run can be
  recorded that is silently useless for sensor fusion.

## 9. In flight

A subagent is implementing **metered payments**, mirroring the user's existing
Sim2Rad mechanism (Stripe Checkout with inline `price_data`, credit packs carried
in session metadata, a webhook that mints the entitlement, claim-on-return). The
reference implementation is at `/Users/dr.gretchenboria/ROS/sim2rad/ui.html` and
`/Users/dr.gretchenboria/gretchenboria.com/functions/api/`.

Adaptation brief given: 1 credit = 1 **confirmed run** (CharmQuark's billable unit
is already called a Run, mapping onto Sim2Rad's 1 Bq = 1 simulation); ledger in
**D1, not Supabase**; atomic decrement via guarded `UPDATE ... WHERE balance >= ?`
checking `meta.changes`; Stripe signature verified with
`constructEventAsync` (Workers has no sync crypto) and an idempotent webhook;
B2B pricing. Expected artifacts: `db/migrations/0002_billing.sql`,
`api/src/routes/billing.ts`, frontend balance + purchase modal, `docs/BILLING.md`.

**If that work is not present, it did not finish** — check `docs/BILLING.md` and
`git status`. It was told not to commit, so review the working tree.

## 10. Map

| Path | What |
|---|---|
| `api/src/domain.ts` | All pure domain rules — readiness gates, effort budget, risk lexicon, run codes. Start here to understand the product. |
| `api/src/routes/runs.ts` | Run lifecycle: assembly, readiness, confirm, pipeline, standby swap. |
| `api/src/routes/autoschedule.ts` | Proposal packing, run-sheet CSV, upload reconcile. |
| `api/src/auth.ts` | RBAC — the single wiring point for tightening policy. |
| `api/src/seedData.ts` | The fictional dataset (generates the seed SQL). |
| `db/migrations/` | D1 schema. |
| `web/src/lib/api.ts` | Typed API client — the wire contract. |
| `web/src/app/globals.css` | Brand tokens. |
| `docs/BRAND.md` | Design system. Read before touching UI. |
| `docs/ROBOTOPS_SPEC.md` | The full capability spec (mostly unbuilt). |
| `docs/ROADMAP.md` | Built vs specified; the naming decision and its reasoning. |
| `CQ Logo.png` | Source artwork the palette was sampled from. |
