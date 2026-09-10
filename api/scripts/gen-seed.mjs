// Emits db/seed/0001_dummy.sql from src/seedData.ts so the CLI seed file and the
// in-app seed endpoint can never drift. Run: npm run db:seed:generate
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seedStatements } from "../src/seedData.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "db", "seed", "0001_dummy.sql");

// NOTE: no BEGIN TRANSACTION / COMMIT here. D1's remote executor rejects explicit
// transaction control ("please use the state.storage.transaction() APIs instead"),
// because it wraps a file's statements in its own transaction. A local SQLite run
// accepts them, so this only surfaces against the real database — keep it out.
const header = `-- CharmQuark — dummy dataset.
--
-- GENERATED FILE. Source of truth: api/src/seedData.ts.
-- Regenerate with:  npm run --prefix api db:seed:generate
--
-- Every value here is fictional. Loading this replaces all existing rows.
-- No explicit transaction: D1 supplies one and rejects BEGIN/COMMIT.
`;

writeFileSync(out, `${header}\n${seedStatements().map((s) => `${s};`).join("\n")}\n`);
console.log(`wrote ${out}`);
