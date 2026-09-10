// Emits db/seed/0001_dummy.sql from src/seedData.ts so the CLI seed file and the
// in-app seed endpoint can never drift. Run: npm run db:seed:generate
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seedStatements } from "../src/seedData.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "db", "seed", "0001_dummy.sql");

const header = `-- CharmQuark — dummy dataset.
--
-- GENERATED FILE. Source of truth: api/src/seedData.ts.
-- Regenerate with:  npm run --prefix api db:seed:generate
--
-- Every value here is fictional. Loading this replaces all existing rows.

PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;
`;

writeFileSync(out, `${header}\n${seedStatements().map((s) => `${s};`).join("\n")}\n\nCOMMIT;\n`);
console.log(`wrote ${out}`);
