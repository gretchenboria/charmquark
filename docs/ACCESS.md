# Cloudflare Access

**Enforcing as of 2026-09-10.** charmquark.app is behind Access; an unauthenticated
request is redirected to the team login instead of being served.

| | |
|---|---|
| Team domain | `blue-frost-0444.cloudflareaccess.com` |
| App "CharmQuark" | `charmquark.app` — Allow policy on the team's emails |
| App "CharmQuark — Stripe webhook (public)" | `charmquark.app/api/billing/webhook` — **Bypass** |

### Why the bypass exists, and why it is safe

Stripe cannot authenticate through Access, so a webhook delivery to a protected
path would be bounced to a login page and the payment would never grant credits.
Access matches the most specific path first, so the bypass app carves that single
endpoint out of the protected app.

That endpoint is not unprotected — its credential is the Stripe signature. The
Worker verifies the HMAC with `constructEventAsync` before trusting anything in
the body, and rejects a bad or missing signature with 400. Verified live.

If you add more machine-to-machine endpoints, they need the same treatment: a
bypass app **and** their own cryptographic check. A bypass without one is just a
hole.

## Two modes, chosen by configuration alone

`api/src/auth.ts` resolves a caller one of two ways:

- **ENFORCED** — both `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are set. The
  signed Access assertion is the *sole* source of identity: verified
  cryptographically, its email matched to an active `users` row. The
  `X-CharmQuark-*` headers are ignored entirely. A bad assertion is a hard 403 —
  there is deliberately **no fallback**, because falling back on a bad token
  would make the check theatre.
- **SHIM** — either value missing. The `X-CharmQuark-*` headers are trusted,
  which authenticates nobody. Development default.

Flipping modes is a config change, not a code change.

## What is verified

`api/src/access.ts`, and each check earns its place:

| Check | Why |
|---|---|
| RS256 signature against the team JWKS | authenticity |
| `iss` equals the team domain | a token from someone else's Access org must not work |
| `aud` contains this app's AUD tag | **the one people forget** — a token minted for a *different app in the same org* must not work here, which is why AUD is required config rather than optional |
| `exp` / `nbf`, 60s skew | freshness |

JWKS is cached in KV for an hour; an unknown `kid` forces one refetch, so key
rotation does not lock everyone out until the TTL expires. Service tokens
(`common_name` instead of `email`) are accepted, so machine callers work.

## Enabling it

1. **Dashboard → Zero Trust → Enable Access.** Choose a team name; that becomes
   `<team>.cloudflareaccess.com`.
2. Add an identity provider (Google, GitHub, or One-time PIN to start).
3. **Add an Access application**, self-hosted:
   - Application domain: `charmquark.app`
   - Add a policy — e.g. Allow / Emails / your team's addresses. Start narrow.
4. Copy the application's **AUD tag** from its Overview tab.
5. Set both values as Worker secrets and redeploy:

```bash
cd api
wrangler secret put CF_ACCESS_TEAM_DOMAIN   # e.g. yourteam.cloudflareaccess.com
wrangler secret put CF_ACCESS_AUD           # the AUD tag from step 4
wrangler deploy
```

6. **Add the users.** Access proves *who* someone is; the `users` table decides
   *what they may do*. Match on `users.email` (lowercased) or `users.subject`. An
   email that authenticates but has no active row gets a 403 naming itself, which
   is the correct failure — it tells you to add them rather than silently
   granting a default role.

## Verifying it took

```bash
# Direct to the Worker, no Access in front: must be 403, not 200.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'X-CharmQuark-Role: PM' https://charmquark.app/api/labs
```

If that still returns 200 with a forged role header, Access is not enforcing —
check that **both** secrets are set on the deployed Worker.

## A caveat worth understanding

Access protects requests that arrive **through** it. Both are needed:

- the Access application must cover `charmquark.app` (including `/api/*`), and
- the Worker must verify the assertion, which is what `access.ts` does.

The second is what stops someone bypassing the first. Together they close the
gap; either alone does not.

Until this is enabled, treat the API as public. `docs/BILLING.md` and
`docs/HANDOFF.md` say the same thing: the credit meter is a billing control, not
a security boundary.
