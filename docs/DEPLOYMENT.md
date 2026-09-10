# Deployment

## Secrets

The Cloudflare API token lives in **`.env` at the repo root** — gitignored, mode
`600`, never committed. `.env.example` documents the shape.

```bash
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env | cut -d= -f2-)
wrangler whoami   # confirms the token works
```

> **Rotate the token.** The one currently in `.env` was transmitted in plaintext
> during setup, so treat it as compromised. Create a replacement at
> <https://dash.cloudflare.com/profile/api-tokens>, paste it into `.env`, and
> revoke the old one.

Token scopes needed:

| Scope | Why |
|---|---|
| Account → Workers Scripts → Edit | deploy both Workers |
| Account → D1 → Edit | create the database, run migrations |
| Account → Workers R2 Storage → Edit | create and write the vault bucket |
| Account → Workers KV Storage → Edit | fleet-status namespace |
| Zone → DNS → Edit (on `charmquark.app`) | bind the hostname |

Never put the token in `wrangler.jsonc`, a `vars` block, or CI logs. For CI, use
a repository secret and let `wrangler` read `CLOUDFLARE_API_TOKEN` from the env.

## First deploy

```bash
cd api

# 1. Provision the bindings
wrangler d1 create charmquark            # -> paste database_id into wrangler.jsonc
wrangler r2 bucket create charmquark-vault
wrangler kv namespace create FLEET_STATUS # -> paste id into wrangler.jsonc

# 2. Schema and data
npm run db:migrate                       # applies db/migrations to remote D1
npm run db:seed                          # loads the fictional dataset

# 3. Ship
wrangler deploy
curl https://charmquark-api.<subdomain>.workers.dev/health
```

```bash
cd ../web
npm run cf:deploy                        # OpenNext build + wrangler deploy
```

## Binding charmquark.app

Add the zone to the Cloudflare account, then uncomment `routes` in both configs:

```jsonc
// api/wrangler.jsonc
"routes": [{ "pattern": "charmquark.app/api/*", "zone_name": "charmquark.app" }]

// web/wrangler.jsonc
"routes": [{ "pattern": "charmquark.app/*", "zone_name": "charmquark.app" }]
```

Order matters: the more specific `/api/*` pattern wins, so API calls reach the
API Worker directly and everything else falls through to the app. This is why
`web/next.config.mjs` emits its `/api/*` rewrite **only** in development.

Redeploy both after changing routes.

## Production hardening

Before real fleet data goes in:

1. **Disable seeding.** Deploy the API with `--env production`, which sets
   `ENVIRONMENT=production` and makes `/api/dev/seed/*` return 403.
2. **Put a real identity in front of it.** Auth today is a role header
   (`X-CharmQuark-Role`) — a development shim, not a credential check. Anyone who
   can reach the Worker can claim any role. Put **Cloudflare Access** in front of
   `charmquark.app` and swap `resolvePrincipal` in `api/src/auth.ts` to read the
   verified Access JWT. The RBAC matrix in that file is already the single wiring
   point; nothing else needs to change.
3. **Back up D1.** `wrangler d1 export charmquark --remote --output backup.sql`
   on a schedule.

## Rollback

```bash
wrangler deployments list
wrangler rollback [deployment-id]
```

D1 migrations do not roll back automatically — write a compensating migration.
