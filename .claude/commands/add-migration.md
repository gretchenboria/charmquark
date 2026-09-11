---
description: Add a D1 schema change safely
argument-hint: <what the schema change is for>
---

Add a migration for: $ARGUMENTS

1. **Never edit a committed migration.** Create the next number in `db/migrations/`, e.g. `0009_<name>.sql`, and start it with a comment explaining why the change exists.
2. SQLite/D1 constraints:
   - No `BEGIN`/`COMMIT`.
   - `ALTER TABLE` can add a column but can't change a CHECK or drop constraints. Widening an enum means a table rebuild (create new table, copy, drop, rename). Plan it and ask the user first, because it touches live data.
   - A new mutable table gets `version` plus the version trigger (see `0007`).
3. New enum CHECKs need matching lists in `packages/contracts/src/enums.ts` + `DB_ENUMS` (protected, so ask). `api/test/contracts.test.ts` fails otherwise.
4. If seed data must change, edit `api/src/seedData.ts`, then run `npm --prefix api run db:seed:generate`. Add new tables to its wipe list.
5. Apply locally with `npm --prefix api run db:reset:local`. Then run `npm --prefix api test` and, with the API running, `npm --prefix api run smoke`.
6. **Do not** run remote migrations. CI applies them on deploy after merge.
