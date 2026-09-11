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

## Configuration as code

A deployment's configuration is exported as one bundle. It holds records (with `id` and `version`), settings and workflows.

| Route | Who | What |
|---|---|---|
| `GET /api/config/export` | everyone | The bundle (`format: "charmquark.config/1"`) |
| `POST /api/config/plan {bundle, prune?}` | PM, Fleet Lead | Every change (per-field diffs), every problem, and a `digest`. Writes nothing |
| `POST /api/config/apply {bundle, prune?, digest?}` | PM, Fleet Lead | Apply. A `digest` from plan makes it refuse (409) if anything changed since |
| `GET /api/config/schema[/<file>]` | everyone | JSON Schemas for `settings.json`, `records/<type>.json`, `workflows/index.json` and `bundle.json`, generated from the registry |

| Rule | How |
|---|---|
| Updates | Only changed fields, pinned to the bundle's `version`. A stale export is refused, not applied over a newer edit |
| Creates | A record without `id`. `ref` and `"$ref:<name>"` link new records. A new record whose natural key (name or code) already exists is refused, so re-applying cannot duplicate |
| Deletes | Only with `prune: true`, and only for record types the bundle includes. Children are deleted first |
| Records | Through the change-set engine: validation, per-edit permissions and role-gated fields, one atomic batch, audited, and listed in `GET /api/changesets` |
| Settings, workflows | Applied after the records, through the settings write path and the workflow routes as the caller. A workflow failure returns `status: "PARTIAL"` |
| Size | At most 100 record changes per apply (the change-set limit); apply larger bundles in parts |

`templates/customer-config/` is the starter repository customers edit with Claude
Code or Gemini CLI:
- `cq.mjs`: dependency-free `pull | validate | plan | apply` commands.
- `AGENTS.md`, plus `CLAUDE.md` and `GEMINI.md` pointing to it.
- `.mcp.json` and `.gemini/settings.json`.
- A GitHub Actions workflow that plans on PRs, and applies on merge then commits ids back.

The same flow is on **Settings → Configuration bundle**, and for agents as the
tools `export_config`, `plan_config` and `apply_config` (apply requires the digest).

## Workflows (BPMN)

A workflow task is bound to a CharmQuark service with `cq:service` on a
`bpmn:serviceTask` (the system does it) or a `bpmn:userTask` (a person does it),
using `xmlns:cq="https://charmquark.app/schema/bpmn/cq/1.0"`. The catalogue is
`WORKFLOW_SERVICES` in `packages/contracts/src/workflows.ts`, served at
`GET /api/workflows/services`. Diagrams are not executed yet.

| Route | Who | What |
|---|---|---|
| `GET /api/workflows/:id/validate` | everyone | Check a saved diagram |
| `POST /api/workflows/validate {xml}` | PM, Fleet Lead | Check a draft without saving |
| `POST /api/workflows/generate {graph \| description, name?, workflow_id?}` | PM, Fleet Lead | Build a laid-out diagram from a JSON graph, or have the deployment's model design the graph from a description. Creates a workflow, or saves a new version of `workflow_id` (send `If-Match`) |
| `PUT`/`PATCH /api/workflows/:id` | PM, Fleet Lead | Save; the replaced diagram is kept in `GET /api/workflows/:id/versions` |

The check returns `errors`, `warnings` and the service `bindings`.

- **Errors:** XML that isn't BPMN, an unknown service, an element type outside the supported set, a binding on the wrong element, a missing start event, or a node unreachable from a start.
- **Warnings:** an unbound service task, a human service on a service task, a missing end event, or a node that leads nowhere.

A save refuses only XML that isn't BPMN and unknown services, so a half-drawn
diagram still saves.

Generation from a description follows `agents.charmy_enabled` and
`agents.llm_provider`. The model must answer with a graph, which is checked
against the catalogue, with one retry, before any XML is built. Sending a graph
needs no model and always works. MCP clients get the same routes as the tools
`list_service_tasks`, `validate_bpmn` and `generate_workflow`.

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
