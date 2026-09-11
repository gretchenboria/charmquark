---
description: Add a new editable record type end to end (schema, contracts, API, audit, tests)
argument-hint: <resource name, e.g. "maintenance-windows">
---

Add the resource `$ARGUMENTS` following the CharmQuark pattern. Do every step. Stop and ask if a step needs a protected file (see AGENTS.md).

1. **Migration.** Create the next `db/migrations/NNNN_<name>.sql`: a table with `id TEXT PRIMARY KEY`, `created_at`, `updated_at`, `version INTEGER NOT NULL DEFAULT 1`, the version trigger (copy the pattern from `0007_versions_audit_tokens.sql`), and CHECKs for enums.
2. **Contracts.**
   - Add enum lists to `packages/contracts/src/enums.ts` plus their `DB_ENUMS` entries. This file is protected, so ask first.
   - Add a registry entry in `packages/contracts/src/resources.ts`: `path`, `table`, `label`, `roles`, and `fields` including `id` (SERVER_ID), `version` (VERSION), parent ids via `parent()`, and a `readonly` reason for derived fields.
3. **Serializer.** Add a function to `api/src/serialize.ts` that includes `version`.
4. **Routes.**
   - A plain table: mount it in `mountResources` (`api/src/routes/resources.ts`) with `crud(app, { resource: RESOURCES["$ARGUMENTS"], serialize, orderBy })`.
   - Domain rules: write explicit routes that use `assertValid`, `versionedUpdate`/`versionedDelete` and `audit` from `api/src/changes.ts`.
5. **Change sets.** If agents should batch-edit it, add it to `CHANGESET_RESOURCES` in `api/src/changesets.ts`. This file is protected, so ask first.
6. **Tests.**
   - Update the pinned lists in `api/test/contracts.test.ts` (writable fields, roles).
   - Add smoke checks in `api/scripts/smoke.sh`: create, update with If-Match, stale 409, delete, and role denial.
7. **Web.** Add client functions in `web/src/lib/api.ts` and types; dropdowns use `optionsFor(...)` from `@contracts`.
8. **Verify** with the Definition of done in AGENTS.md, including `db:reset:local` + `smoke`.
