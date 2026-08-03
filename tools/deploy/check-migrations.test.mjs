/**
 * The destructive-migration guard.
 * Run: node --test tools/deploy/check-migrations.test.mjs
 *
 * The property under test is not "does the regex fire". It is the reason the
 * regex exists: the deploy's rollback restores the CODE and deliberately does
 * NOT revert the schema, so the PREVIOUS build has to keep working against the
 * NEW schema. Every statement rejected below breaks exactly that, and every
 * statement allowed below does not.
 *
 * The real repo's own migrations are checked at the end — a guard that has
 * never been run against the thing it guards is a guard nobody has tested.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OVERRIDE_MARKER,
  checkMigrationSql,
  findDestructive,
  hasOverride,
  isMigrationPath,
  stripNoise,
} from "./check-migrations.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(HERE, "..", "..", "platform", "prisma", "migrations");

const codes = (sql) => findDestructive(sql).map((f) => f.code);

// ---------------------------------------------------------------------------
// What must be rejected
// ---------------------------------------------------------------------------

test("DROP COLUMN is rejected — the running build still selects it", () => {
  const sql = `ALTER TABLE "User" DROP COLUMN "birthYear";`;
  assert.deepEqual(codes(sql), ["DROP_COLUMN"]);
  assert.equal(checkMigrationSql("m", sql).ok, false);
});

test("DROP TABLE is rejected — and the rows are gone with it", () => {
  assert.deepEqual(codes(`DROP TABLE "ConsentEvent";`), ["DROP_TABLE"]);
});

test("SET NOT NULL is rejected — the running build still inserts without it", () => {
  // The nastiest of the three: reads keep working, writes start failing, and
  // nothing in the health gate notices.
  assert.deepEqual(codes(`ALTER TABLE "Payment" ALTER COLUMN "userId" SET NOT NULL;`), [
    "SET_NOT_NULL",
  ]);
});

test("DROP CONSTRAINT and DROP INDEX are rejected too", () => {
  assert.deepEqual(codes(`ALTER TABLE "Entitlement" DROP CONSTRAINT "Entitlement_pkey";`), [
    "DROP_CONSTRAINT",
  ]);
  assert.deepEqual(codes(`DROP INDEX "QuestionAttempt_userId_answeredAt_idx";`), [
    "DROP_INDEX",
  ]);
});

test("Prisma's own wrapping and casing do not hide a drop", () => {
  // Prisma generates unpredictable whitespace and sometimes lowercase.
  const sql = `ALTER TABLE "User"\n  drop\n  column   "locale";`;
  assert.deepEqual(codes(sql), ["DROP_COLUMN"]);
});

test("several destructive statements are all reported, not just the first", () => {
  const sql = `
    ALTER TABLE "A" DROP COLUMN "x";
    DROP TABLE "B";
    ALTER TABLE "C" ALTER COLUMN "y" SET NOT NULL;
  `;
  assert.deepEqual(codes(sql).sort(), ["DROP_COLUMN", "DROP_TABLE", "SET_NOT_NULL"]);
});

// ---------------------------------------------------------------------------
// What must NOT be rejected
// ---------------------------------------------------------------------------

test("an expand-only migration passes", () => {
  const sql = `
    ALTER TABLE "User" ADD COLUMN "freeExamGrants" INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE "AdminAction" ("id" TEXT NOT NULL);
    CREATE INDEX "AdminAction_actorId_createdAt_idx" ON "AdminAction"("actorId", "createdAt");
  `;
  assert.deepEqual(codes(sql), []);
  assert.equal(checkMigrationSql("m", sql).ok, true);
});

test("ADD COLUMN ... NOT NULL DEFAULT is not SET NOT NULL", () => {
  // Catalogue-only on Postgres 11+, safe at any row count, and the single most
  // common additive change in this repo. Rejecting it would make the guard
  // useless within a week.
  assert.deepEqual(
    codes(`ALTER TABLE "User" ADD COLUMN "sessionEpoch" INTEGER NOT NULL DEFAULT 0;`),
    [],
  );
});

test("a COMMENT explaining why nothing is dropped does not trip the gate", () => {
  // This is not hypothetical: the migrations in this repo carry long headers,
  // and one of them would have to avoid saying the words "DROP COLUMN" forever.
  const sql = `
    -- Deliberately NOT a DROP COLUMN: the old build still reads it. We expand
    -- now and contract in a later deploy (see the README).
    /* DROP TABLE "Old" would also break the rollback. */
    ALTER TABLE "User" ADD COLUMN "examDate" DATE;
  `;
  assert.deepEqual(codes(sql), []);
});

test("a string literal that merely contains the words does not trip the gate", () => {
  const sql = `INSERT INTO "Note" ("body") VALUES ('remember to DROP COLUMN later');`;
  assert.deepEqual(codes(sql), []);
});

test("a column named like a keyword does not trip the gate", () => {
  assert.deepEqual(codes(`ALTER TABLE "T" ADD COLUMN "drop_column_notes" TEXT;`), []);
});

test("stripNoise removes comments and literals but keeps the statements", () => {
  const cleaned = stripNoise(`-- DROP TABLE "X"\nSELECT 'DROP TABLE' ; DROP TABLE "Y";`);
  assert.equal(/"X"/.test(cleaned), false);
  assert.match(cleaned, /DROP TABLE "Y"/);
});

// ---------------------------------------------------------------------------
// The override
// ---------------------------------------------------------------------------

test("the override marker allows a deliberate contract step", () => {
  const sql = `
    -- ${OVERRIDE_MARKER}  expanded in 20260803150000_admin_action_audit, soaked two weeks
    ALTER TABLE "User" DROP COLUMN "legacyFlag";
  `;
  const result = checkMigrationSql("m", sql);
  assert.equal(result.ok, true);
  assert.equal(result.overridden, true);
  // Still REPORTED — an allowed drop is a thing to notice in the log, not a
  // thing to hide.
  assert.deepEqual(
    result.findings.map((f) => f.code),
    ["DROP_COLUMN"],
  );
});

test("the marker only counts inside a COMMENT, never inside SQL", () => {
  // Otherwise any migration could self-authorise by inserting the marker as
  // data, which is the same class of bug as trusting a client-side flag.
  const sql = `
    INSERT INTO "Note" ("body") VALUES ('${OVERRIDE_MARKER}');
    ALTER TABLE "User" DROP COLUMN "legacyFlag";
  `;
  assert.equal(hasOverride(sql), false);
  assert.equal(checkMigrationSql("m", sql).ok, false);
});

// ---------------------------------------------------------------------------
// Path selection
// ---------------------------------------------------------------------------

test("only prisma migration SQL is claimed", () => {
  assert.equal(
    isMigrationPath("platform/prisma/migrations/20260803150000_x/migration.sql"),
    true,
  );
  assert.equal(
    isMigrationPath("platform\\prisma\\migrations\\20260803150000_x\\migration.sql"),
    true,
  );
  assert.equal(isMigrationPath("platform/prisma/schema.prisma"), false);
  assert.equal(isMigrationPath("tools/deploy/deploy.sh"), false);
  assert.equal(isMigrationPath("docs/migration.sql"), false);
});

// ---------------------------------------------------------------------------
// The repo itself
// ---------------------------------------------------------------------------

test("every migration already in this repo passes the guard", () => {
  // A guard that has never been run against the thing it guards is a guard
  // nobody has tested. If this ever fails, the migration is either genuinely
  // dangerous or genuinely a contract step that needs the marker — both of
  // which are conversations worth having before a deploy, not after.
  const dirs = fs
    .readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory());
  assert.ok(dirs.length > 0, "no migrations found — the path is wrong");

  for (const dir of dirs) {
    const file = path.join(MIGRATIONS, dir.name, "migration.sql");
    if (!fs.existsSync(file)) continue;
    const result = checkMigrationSql(dir.name, fs.readFileSync(file, "utf8"));
    assert.ok(
      result.ok,
      `${dir.name}: ${result.findings.map((f) => f.code).join(", ")}`,
    );
  }
});
