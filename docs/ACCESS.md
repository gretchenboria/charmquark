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
