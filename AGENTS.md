# AGENTS.md — working in the CharmQuark repo

Instructions for any coding agent (Claude Code, Gemini CLI, Codex, …) and for
humans. `CLAUDE.md` and `GEMINI.md` point here. Read this before changing code.

CharmQuark plans and runs robot data-collection **runs**. It has two Cloudflare
Workers: `api/` (Hono + D1/R2/KV) and `web/` (Next 15 via OpenNext). They share
`packages/contracts/`. The product docs are `README.md`, then `docs/HANDOFF.md`.

## Layout

| Path | What |
|---|---|
| `packages/contracts/src/` | **Single source of truth.** Enums (`enums.ts`), field specs and validation (`fields.ts`), the resource registry of writable fields, read-only reasons and roles (`resources.ts`), and deployment settings (`settings.ts`). |
| `api/src/routes/` | HTTP routes. `resources.ts` is the generic CRUD factory driven by the registry. |
| `api/src/changes.ts` | The write path: `versionedUpdate`/`versionedDelete` (If-Match → 409) and `audit`. |
| `api/src/changesets.ts` | Batched edits: preview, then atomic apply. |
| `api/src/domain.ts` | Pure readiness and scheduling rules; they take `Settings` as input. |
| `api/src/auth.ts` | Identity (Firebase tokens, API tokens, dev shim) and the role `POLICY`. |
| `db/migrations/` | D1 schema, append-only. |
| `api/src/seedData.ts` | Source of the demo dataset; `db/seed/` is generated from it. |
| `web/src/lib/api.ts` | Typed API client. |
| `docs/` | `ACCESS.md` (auth, tokens, change sets, settings), `BILLING.md`, `BRAND.md`, `ROADMAP.md`. |

## Commands

```bash
npm --prefix api ci && npm --prefix web ci
npm --prefix api run db:reset:local        # local D1: migrate + seed
npm --prefix api run dev                   # API on :8787, ENVIRONMENT=development
npm --prefix web run dev -- -p 3100        # web (port 3000 is taken on the maintainer's machine)

npm --prefix api run typecheck && npm --prefix api test
npm --prefix api run smoke                 # needs the API running; end-to-end route checks
npm --prefix web run typecheck && npm --prefix web run lint && npm --prefix web run build
(cd web && npx playwright test)            # browser e2e; boots both servers
```

## Definition of done

1. `api` typecheck and unit tests pass.
2. `smoke` passes against a freshly reset local D1. Add checks for any new behaviour.
3. `web` typecheck, lint and build pass, and Playwright passes if you touched UI or API shapes it uses.
4. Docs updated where behaviour changed (`docs/ACCESS.md` for API rules, `docs/HANDOFF.md` map).
5. Work goes on a branch and a PR. CI (`.github/workflows/ci.yml`) must be green, and merging to `main` deploys.

## Rules that keep one change from breaking another

1. **Never hand-copy an enum, field list or role list.** Import it from `@contracts` (web) or `api/src/contracts.ts` (api). A new enum value needs a migration that widens the CHECK *and* the contracts change; `api/test/contracts.test.ts` fails if they differ.
2. **Every mutation goes through `api/src/changes.ts`.** Use `versionedUpdate`/`versionedDelete` so `If-Match` works, and `audit()` so the change is attributed. Don't write `UPDATE`/`DELETE` in a route without both.
3. **Validate with the registry** (`assertValid(RESOURCES.x, body, mode)`) and take writable columns from `writableFields`. A read-only field needs a `readonly` reason string.
4. **Tunable numbers are settings, not constants.** Add them to `packages/contracts/src/settings.ts` (default = current behaviour, plus a validator and description) and pass `Settings` into pure functions.
5. **Authorization.** Registry resources get roles from `resources.ts`; other routes get them from `POLICY` in `auth.ts`. Money, safety and user admin have explicit gates (`requireRunConfirmer`, `requireLegalReviewer`, `requirePlanner`, field `writeRoles`). Never trust `X-CharmQuark-*` headers outside `ENVIRONMENT=development`.
6. **Migrations are append-only.** Add `db/migrations/NNNN_name.sql`, never edit a committed one (CI enforces this).
7. **D1 traps.** No `BEGIN`/`COMMIT` in files run by `wrangler d1 execute` (D1 wraps its own transaction). A batch is atomic, but an `UPDATE` matching zero rows doesn't fail on its own.
8. **The seed is generated.** Edit `api/src/seedData.ts`, run `npm --prefix api run db:seed:generate`, and keep the data valid under the readiness rules.
9. **Brand.** No cyan, teal or sky classes (`docs/BRAND.md`); CI greps for them.
10. **Shell.** zsh doesn't word-split unquoted variables, and BSD `xargs` has no `-a`. Quote globs such as `'--include=*.ts'`.

## Protected zones

Editing these is blocked for agents by `.claude/hooks/guard-core.sh`. They need
code-owner review in PRs (`.github/CODEOWNERS`).

| Files | Why |
|---|---|
| `api/src/{auth,identity,access,jwt,tokens,secrets}.ts` | Authentication and authorization |
| `api/src/billing.ts`, `api/src/routes/billing.ts` | Money |
| `api/src/{changes,changesets}.ts` | The write path every mutation relies on |
| `api/src/domain.ts` | Readiness rules (prefer settings) |
| `packages/contracts/src/enums.ts` | Must match SQL CHECKs |
| committed `db/migrations/*.sql`, `db/seed/*` | Append-only / generated |
| `.github/*`, `*/wrangler.jsonc` | CI, deploy, infrastructure |
| `.claude/*`, `.gemini/*`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | The guardrails themselves |

If a task needs one of these, **stop and ask the user**. With their agreement
they run `touch .claude/core-unlock` (gitignored) and delete it afterwards.
Don't create that file without their explicit go-ahead, and don't route around
the hook by other means (e.g. `sed` or heredocs in a shell).

**Never:** deploy (`wrangler deploy`, `cf:deploy`), run remote D1 migrations or
`--remote` executes, set secrets, force-push, push to `main`, or read `.env` /
`.dev.vars` / `web/.env.local`. Deploys happen only through CI after merge.

## Changing customer data vs changing code

Editing a customer's configuration (labs, robots, missions, settings, workflows)
is **not** a code change. It goes through the running app's API, with an API
token and change sets (`docs/ACCESS.md`), never through seed files or SQL.
