/**
 * The gate must actually gate.
 * Run: node --test tools/deploy/ci-workflow.test.mjs
 *
 * WHY A TEST ABOUT A YAML FILE. Because the thing that failed here was not a
 * bug in a function — it was an absence. `.github/workflows/ci.yml` declared
 * `DATABASE_URL: postgresql://ci:ci@localhost:5432/ci` with no postgres
 * anywhere in the file, and the only Prisma step was `generate`, which reads
 * schema.prisma and never looks at prisma/migrations. So a schema change with
 * no migration passed typecheck, tests, build and the whole gate, then 500ed
 * every request in production. Nothing in the repo could notice, because
 * nothing in the repo asserted the gate contained the checks it claimed to.
 *
 * Deliberately assertions about CONTENT, not a YAML parse: js-yaml is only in
 * this repo as somebody's transitive dependency, and a gate test that breaks
 * when an unrelated package is pruned is a gate test people delete.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CI = path.resolve(HERE, "..", "..", ".github", "workflows", "ci.yml");
const yml = fs.readFileSync(CI, "utf8");

test("there is a real postgres for the migrations to be applied to", () => {
  assert.match(yml, /services:/);
  // Pinned to the major the VPS runs. "postgres:latest" would mean the gate
  // and production disagree about the database on a day nobody chose.
  assert.match(yml, /image:\s*postgres:17/);
  // A migrate step that races a booting database fails intermittently, which
  // is the worst kind of red because everybody learns to re-run it.
  assert.match(yml, /--health-cmd\s+"pg_isready/);
});

test("migrations are APPLIED, not merely generated from", () => {
  // `prisma generate` reads schema.prisma. It has never once opened
  // prisma/migrations, which is the entire reason a missing migration was
  // invisible here.
  assert.match(yml, /npx prisma migrate deploy/);
});

test("the applied database is diffed against the schema", () => {
  // THE check that catches "added a column, wrote code against it, forgot the
  // migration": schema.prisma has it, the migrations do not, the diff is
  // non-empty, --exit-code returns 2.
  assert.match(yml, /npx prisma migrate diff/);
  assert.match(yml, /--exit-code/);
});

test("the schema gate runs BEFORE the five-minute build", () => {
  const migrateAt = yml.indexOf("npx prisma migrate deploy");
  const buildAt = yml.indexOf("npm run build");
  assert.ok(migrateAt !== -1 && buildAt !== -1);
  assert.ok(
    migrateAt < buildAt,
    "a migration that does not apply is a fact you want in forty seconds",
  );
});

test("a destructive migration is refused", () => {
  // The deploy's rollback restores the CODE and deliberately does not revert
  // the schema, so the previous build has to keep working against the new one.
  assert.match(yml, /check-migrations\.mjs/);
});

test("the destructive check runs over every migration, not a git diff", () => {
  // `--all` needs no history: the default checkout is shallow, and on a
  // pull_request it is a merge commit, so a base-ref diff silently finds
  // nothing — a guard that quietly checks zero files is worse than none.
  assert.match(yml, /check-migrations\.mjs\s+--all/);
});
