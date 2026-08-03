#!/usr/bin/env node
/**
 * =============================================================================
 * The destructive-migration guard.  (audit 2026-07-24 follow-up, H-17 family)
 *
 *   node tools/deploy/check-migrations.mjs [--base <git-ref>] [--all]
 *
 * WHY THIS EXISTS. `tools/deploy/deploy.sh` builds the new release in a
 * separate workspace, swaps it in, health-checks it and — when the health gate
 * fails — puts the previous build back. That rollback is real and it works.
 * But it only ever rolls back the CODE. The migration has already run and the
 * schema is NOT reverted, deliberately (see the README: a down-migration run by
 * a cron job at 03:00 against the only copy of every student's progress is a
 * worse idea than the outage it is trying to fix).
 *
 * Which means the rollback's usefulness depends entirely on one property:
 *
 *      THE PREVIOUS BUILD MUST STILL RUN AGAINST THE NEW SCHEMA.
 *
 * Every statement this script rejects breaks exactly that property.
 *
 *   DROP COLUMN     the old build still SELECTs it → every query 500s, and the
 *                   rollback restores a build that cannot serve either.
 *   DROP TABLE      same, wholesale. Plus the data is gone; the only copy is
 *                   the pre-deploy dump, and only if it verified.
 *   SET NOT NULL    the old build still INSERTs rows without that column →
 *                   every write fails while reads look fine, which is the
 *                   hardest version of this to diagnose at 3am.
 *   DROP CONSTRAINT / DROP INDEX  quieter, but the same class: something the
 *                   running build's queries or writes rely on stops existing.
 *
 * THE ANSWER IS NOT "NEVER DROP A COLUMN". It is expand/contract, spelled out
 * in tools/deploy/README.md: ship the additive half, deploy it, let it soak,
 * and drop the old thing in a LATER migration once no running build refers to
 * it. This script is what makes that a rule rather than a good intention.
 *
 * THE OVERRIDE IS DELIBERATE AND CHEAP. Put the marker in the migration's own
 * SQL, as a comment:
 *
 *      -- knijka:allow-destructive  <one line saying which deploy expanded first>
 *
 * That is the whole gate. It is not there to be hard; it is there so the drop
 * is a sentence someone wrote on purpose, in the file, next to the statement —
 * visible in the diff, in `git blame`, and to whoever is reading the migration
 * at 3am wondering why the site is down.
 *
 * SCOPE. By default only migrations that are NEW on this branch are checked
 * (`git diff --name-only <base>...HEAD`), because the ones already merged are
 * already applied everywhere and re-litigating them would make the gate
 * permanently red. `--all` checks every migration in the tree, which is what
 * you want when adding the guard to a repo for the first time.
 *
 * Run: node --test tools/deploy/check-migrations.test.mjs
 * =============================================================================
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "platform", "prisma", "migrations");

/** The marker that turns a rejection into a deliberate, recorded decision. */
export const OVERRIDE_MARKER = "knijka:allow-destructive";

/**
 * Statements that can break the build that is currently running.
 *
 * Written against SQL with comments and string literals already stripped (see
 * `stripNoise`), so a column called `drop_column_notes` or a comment that
 * merely MENTIONS `DROP COLUMN` cannot trip the gate. `\s+` between words
 * because Prisma's generated SQL wraps and indents freely.
 */
const DESTRUCTIVE_PATTERNS = [
  {
    code: "DROP_COLUMN",
    re: /\bDROP\s+COLUMN\b/i,
    why: "the build that is running still selects it — a rollback restores a build that cannot serve either",
  },
  {
    code: "DROP_TABLE",
    re: /\bDROP\s+TABLE\b/i,
    why: "the rows are gone; the only copy left is the pre-deploy dump",
  },
  {
    code: "SET_NOT_NULL",
    re: /\bSET\s+NOT\s+NULL\b/i,
    why: "the build that is running still inserts rows without it — writes start failing while reads look fine",
  },
  {
    code: "DROP_CONSTRAINT",
    re: /\bDROP\s+CONSTRAINT\b/i,
    why: "something the running build's writes rely on stops existing",
  },
  {
    code: "DROP_INDEX",
    re: /\bDROP\s+INDEX\b/i,
    why: "a query the running build issues loses the index it was planned for",
  },
  {
    code: "DROP_NOT_NULL_DEFAULT",
    re: /\bALTER\s+COLUMN\b[\s\S]{0,80}?\bDROP\s+DEFAULT\b/i,
    why: "the running build relies on the database to fill that column",
  },
];

/**
 * Remove line comments, block comments and single-quoted literals.
 *
 * Two reasons, and the second is the one that matters: a migration that
 * EXPLAINS in a comment why it is not dropping a column must not be rejected
 * for containing the words, and the override marker itself lives in a comment
 * — so the marker is looked for in the RAW text and the statements are matched
 * in the stripped text. Getting that backwards would let any migration
 * self-authorise by mentioning the marker inside a string literal.
 */
export function stripNoise(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* block */
    .replace(/--[^\n]*/g, " ") //        -- line
    .replace(/'(?:[^']|'')*'/g, "''"); //  'literal'
}

/** Every destructive statement in one migration's SQL. */
export function findDestructive(sql) {
  const cleaned = stripNoise(sql);
  return DESTRUCTIVE_PATTERNS.filter((p) => p.re.test(cleaned)).map((p) => ({
    code: p.code,
    why: p.why,
  }));
}

/** Is the override marker present — in a COMMENT, where a human wrote it? */
export function hasOverride(sql) {
  const comments = [
    ...(sql.match(/--[^\n]*/g) ?? []),
    ...(sql.match(/\/\*[\s\S]*?\*\//g) ?? []),
  ].join("\n");
  return comments.includes(OVERRIDE_MARKER);
}

/**
 * The whole decision for one file. Exported so the tests drive the real rule
 * rather than a re-implementation of it.
 */
export function checkMigrationSql(file, sql) {
  const findings = findDestructive(sql);
  if (findings.length === 0) return { file, ok: true, findings: [], overridden: false };
  if (hasOverride(sql)) return { file, ok: true, findings, overridden: true };
  return { file, ok: false, findings, overridden: false };
}

// ---------------------------------------------------------------------------
// Which files to check
// ---------------------------------------------------------------------------

const MIGRATION_PATH_RE =
  /(^|[\\/])platform[\\/]prisma[\\/]migrations[\\/][^\\/]+[\\/]migration\.sql$/;

export function isMigrationPath(p) {
  return MIGRATION_PATH_RE.test(p.replace(/\\/g, "/"));
}

function allMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(MIGRATIONS_DIR, e.name, "migration.sql"))
    .filter((f) => fs.existsSync(f));
}

/**
 * Migrations added or changed on this branch.
 *
 * `<base>...HEAD` (three dots) diffs against the MERGE BASE, so a branch that
 * is simply behind main does not inherit main's migrations as "new". Falls
 * back to checking everything when git cannot answer — a guard that silently
 * checks nothing is worse than one that occasionally checks too much.
 */
function changedMigrationFiles(base) {
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && isMigrationPath(l))
      .map((l) => path.join(REPO_ROOT, l))
      .filter((f) => fs.existsSync(f));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const all = argv.includes("--all");
  const baseIdx = argv.indexOf("--base");
  const base = baseIdx !== -1 ? argv[baseIdx + 1] : "origin/scenario-engine";

  let files;
  if (all) {
    files = allMigrationFiles();
  } else {
    const changed = changedMigrationFiles(base);
    if (changed === null) {
      console.log(
        `[check-migrations] could not diff against ${base} — checking every migration instead`,
      );
      files = allMigrationFiles();
    } else {
      files = changed;
    }
  }

  if (files.length === 0) {
    console.log("[check-migrations] no new migration SQL to check");
    return 0;
  }

  const results = files.map((f) =>
    checkMigrationSql(path.relative(REPO_ROOT, f), fs.readFileSync(f, "utf8")),
  );

  let failed = 0;
  for (const r of results) {
    if (r.ok && r.findings.length === 0) {
      console.log(`  ok        ${r.file}`);
    } else if (r.overridden) {
      console.log(
        `  ALLOWED   ${r.file} — ${r.findings.map((f) => f.code).join(", ")} (${OVERRIDE_MARKER})`,
      );
    } else {
      failed += 1;
      console.error(`  REJECTED  ${r.file}`);
      for (const f of r.findings) console.error(`              ${f.code}: ${f.why}`);
    }
  }

  if (failed === 0) {
    console.log(`[check-migrations] ${results.length} migration(s) checked, all fine`);
    return 0;
  }

  console.error(
    `\n[check-migrations] ${failed} migration(s) would break the build that is currently running.\n` +
      `\n` +
      `The deploy's rollback restores the CODE and deliberately does NOT revert the\n` +
      `schema (tools/deploy/README.md). So the previous build has to keep working\n` +
      `against the new schema — and none of the statements above allow that.\n` +
      `\n` +
      `Split it into expand/contract:\n` +
      `  1. this deploy: ADD the new thing, write to both, read from the new one\n` +
      `  2. a later deploy, once nothing running refers to the old thing: drop it\n` +
      `\n` +
      `If you have already done step 1 and this IS step 2, say so in the migration:\n` +
      `  -- ${OVERRIDE_MARKER}  <which deploy expanded first>\n`,
  );
  return 1;
}

// Only when run as a script, so the tests can import the rules above.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
