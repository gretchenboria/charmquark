# Authentication and access

How the API decides who is calling. The code is `api/src/auth.ts` (resolution
and policy) and `api/src/identity.ts` (token verification).

> History: an earlier version verified Cloudflare Access assertions in the
> Worker. Commit `a995caa` removed that check without replacing it, which left
> the API trusting a forgeable `X-CharmQuark-Role` header in production. Firebase
> ID-token verification replaced it. `api/src/access.ts` remains only for a
> deployment that wants to verify an Access assertion in front of the Worker.

## Two modes, chosen by configuration

| Mode | When | Identity comes from |
|---|---|---|
| **firebase** | `Authorization: Bearer <Firebase ID token>` is sent and `FIREBASE_PROJECT_ID` is set | the verified token, matched to an active `users` row |
| **dev-shim** | `ENVIRONMENT=development` and no token | the `X-CharmQuark-Role` / `X-CharmQuark-User` headers — authenticates nobody |

Outside development the headers are **ignored**. A request with no token is a
401. A token that doesn't verify is a 401, with no fallback. If
`FIREBASE_PROJECT_ID` is missing in production, every request is a 503 that
names it (fail closed). `GET /api/cloud/status` reports the mode in `auth`.

## What is verified (`identity.ts`)

| Check | Why |
|---|---|
| RS256 signature against Google's securetoken JWKS | authenticity |
| `alg` pinned to RS256 | stops `alg: none` and key-confusion forgeries |
| `iss` = `https://securetoken.google.com/<project>` | a token from another Firebase project must not work |
| `aud` = the project id | same reason; the check people forget |
| `exp` (required), `iat`/`auth_time` not in the future, 60s skew | freshness |
| `sub` non-empty | it is the uid |

The JWKS is cached in KV for an hour. An unknown `kid` forces one refetch, so key
rotation doesn't lock anyone out. All of this is unit-tested with a throwaway
RSA key (`api/test/identity.test.ts`).

## Identity → role (`auth.ts`)

Firebase proves *who*. The `users` table decides *what they may do*.

1. **The email must be verified** (`email_verified: true`). Otherwise anyone
   could sign up with a colleague's address and inherit their row. The login
   page sends the verification email and asks the person to sign in again after
   verifying. Google sign-in emails arrive already verified.
2. **Matching:** an active `users` row whose `subject` equals the Firebase uid,
   or whose lowercased `email` matches. No match gives a 403 naming the email,
   telling the person to ask a Fleet Lead to add them.
3. **The role comes from that row.** The web app reads it from `GET /api/me` and
   never decides a role itself.

**First admin on a fresh deployment:** set the `BOOTSTRAP_ADMIN_EMAILS` secret.
A listed, verified email with **no** users row at all is created as
`FLEET_LEAD` on first sign-in. A deactivated row is never revived this way.
Remove the secret once the roster exists.

## API tokens (agents, scripts, Claude Code, Gemini CLI)

Agents can't do a browser sign-in. A signed-in person creates a token, and the
token then **acts as that person**. It always has their current role, never
more, and only while their account is active.

```bash
# Create one while signed in (or from the UI once it exists). The token is shown ONCE.
curl -X POST https://charmquark.app/api/tokens -H "Authorization: Bearer <firebase token>" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Claude Code on my laptop","scopes":["read","write"],"expires_in_days":90}'

# Use it
curl https://charmquark.app/api/labs -H "Authorization: Bearer cq_pat_…"
```

| Rule | Why |
|---|---|
| `read` scope is GET only; `write` adds changes | Give an exploring agent read and nothing else |
| Only the SHA-256 is stored; the token is shown once | A database dump contains nothing that authenticates |
| Expires (default 90 days, max 365) and is revocable (`DELETE /api/tokens/:id`) | A leaked token has a bounded life |
| A token cannot create tokens | Otherwise a leaked token could outlive its own revocation |
| Every change records `via: "pat"` in `GET /api/audit` | You can tell which changes an agent made |

A Fleet Lead can list every token (`GET /api/tokens?all=1`) and revoke any of them.

## Concurrent edits: `version` and `If-Match`

Every record carries `version`, and a database trigger bumps it on every update.
Send it back as `If-Match: <version>` on `PATCH`/`PUT`/`DELETE`. If someone else
changed the record in the meantime, you get **409** with `current` (the record
as it is now) instead of silently overwriting their edit. Agents should always
send it. Requests without `If-Match` keep last-write-wins, so existing screens
keep working.

## Change sets: preview, then apply

Agents (and config imports) should change several records through a **change
set** rather than many single calls:

```bash
# 1. Preview. Nothing is written; you get a per-field diff and every problem named.
curl -X POST https://charmquark.app/api/changesets/preview -H "Authorization: Bearer cq_pat_…" \
  -H 'Content-Type: application/json' -d '{
    "summary": "Add outdoor bay with its first blackout",
    "changes": [
      {"resource":"labs","op":"create","ref":"bay","data":{"name":"Yard","type":"OUTDOORS","capacity":2}},
      {"resource":"lab-blackouts","op":"create","data":{"lab_id":"$ref:bay","blackout_date":"2026-10-02"}}
    ]}'
# 2. Apply the previewed set by id (as yourself, or as a person reviewing it).
curl -X POST https://charmquark.app/api/changesets/<id>/apply -H "Authorization: Bearer …"
```

| Guarantee | How |
|---|---|
| Strict | Unknown or read-only fields are listed as problems (with the reason), never silently dropped |
| Permissions per edit | Each change is checked against its resource's policy, and fields like `legal_approval` against their role rule, as whoever applies |
| All or nothing | One D1 batch (a transaction) |
| No lost updates | Each update or delete is pinned to the version it was previewed against. If anyone changed that record since, the apply is refused and nothing lands |

Resources: `campaigns`, `mission-groups`, `missions`, `robots`, `operators`,
`labs`, `lab-blackouts`, `sensors`, `sensor-rigs`, `inventory-items`.

## Settings

`GET /api/settings` lists every tunable rule with its value, default,
description and who last changed it. These rules cover the effort units and run
budget and floor, the start-time window and grid, working days, the hazard word
lists, and export and coverage limits. A Fleet Lead changes them with
`PATCH /api/settings {"key": value}`, and `null` resets a key to its default.
Changes are validated together (a floor above the budget is refused) and
audited.

## Going live checklist

```bash
cd api
# 1. var (already in wrangler.jsonc): FIREBASE_PROJECT_ID
# 2. secrets
openssl rand -base64 32 | wrangler secret put INTEGRATION_KEY_SECRET
wrangler secret put BOOTSTRAP_ADMIN_EMAILS      # your email, comma-separated for more
```

3. **GitHub repository variables** (not secrets; they're public in the bundle)
   for the web build in `deploy.yml`: `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`,
   `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`.
   Without them the login page refuses to sign anyone in.
4. **Firebase console → Authentication:**
   - enable Google and Email/Password
   - add `charmquark.app` to *Authorized domains*
5. **Users page:** every person needs a row **with their email**.

## Verifying it took

```bash
# A forged role header must NOT authenticate: expect 401.
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-CharmQuark-Role: FLEET_LEAD' https://charmquark.app/api/labs
# cloud/status (signed in) reports "auth": "firebase".
```

## Cloudflare Access at the edge

As of 2026-09-10 an Access application also gates `charmquark.app` to the
team's emails, with a **Bypass** app for `/api/billing/webhook`. That's a
separate outer layer: it stops strangers reaching the site at all, and the
Worker no longer depends on it.

- **While the product is internal**, keeping it is reasonable defence in depth.
- **Before customers sign in with Firebase**, remove it or widen its policy, or
  they will hit the Access login instead of the app.

Any machine-to-machine endpoint still needs its own cryptographic check (as the
Stripe webhook verifies its signature). A bypass without one is just a hole.
