/**
 * The runbook has to still say the things the scripts depend on it saying.
 * Run: node --test tools/deploy/ops-docs.test.mjs
 *
 * WHY DOCUMENTATION GETS A TEST HERE, WHEN IT USUALLY SHOULD NOT. Three of the
 * facts below are not commentary — they are the operator's half of a mechanism
 * that only works if both halves exist:
 *
 *   1. The deploy's rollback restores the CODE and leaves the schema where the
 *      migration left it. A human reading `ROLLING BACK` at 3am who does not
 *      know that will assume the database went back too and act on it.
 *   2. The pre-deploy dump path is the restore point for exactly that moment.
 *      A path nobody can find is not a restore point.
 *   3. The override marker is a literal string shared between the CI guard and
 *      the instructions for getting past it. Rename it in one place and the
 *      documented escape hatch silently stops working.
 *
 * The rest guard the two snippets that were written down and never installed —
 * which is the precise failure mode this file exists to notice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OVERRIDE_MARKER } from "./check-migrations.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const README = fs.readFileSync(path.join(HERE, "README.md"), "utf8");

test("the README says plainly that the schema is NOT reverted", () => {
  assert.match(README, /schema is deliberately NOT reverted/i);
});

test("the README names the pre-deploy dump — the restore point for that moment", () => {
  assert.match(README, /\/var\/backups\/knijka/);
  assert.match(README, /pre-deploy/);
  // The command that finds the newest one, so it is not a path to reconstruct
  // from a naming convention while the site is down.
  assert.match(README, /ls -t \/var\/backups\/knijka\/\*pre-deploy\*/);
});

test("expand/contract is documented, and next to the rollback", () => {
  const rollbackAt = README.indexOf("Roll back deliberately");
  // The HEADING, not the table row that cross-references it.
  const expandAt = README.indexOf("## Expand / contract");
  assert.ok(expandAt !== -1, "README needs an `## Expand / contract` section");
  assert.ok(rollbackAt !== -1 && expandAt !== -1);
  assert.ok(
    expandAt > rollbackAt && expandAt - rollbackAt < 1500,
    "it answers a question the rollback section raises — it has to be beside it",
  );
});

test("the documented override marker is the one the guard actually accepts", () => {
  // A rename in check-migrations.mjs that missed the README would leave the
  // documented way out of a red gate silently broken.
  assert.ok(
    README.includes(OVERRIDE_MARKER),
    `README must document the marker "${OVERRIDE_MARKER}"`,
  );
});

test("all three destructive statements are named, with what each breaks", () => {
  for (const stmt of ["DROP COLUMN", "DROP TABLE", "SET NOT NULL"]) {
    assert.ok(README.includes(stmt), `README must name ${stmt}`);
  }
});

test("the logrotate snippet is now an installable file, not prose", () => {
  // It sat in this README as four lines of config for weeks and was never
  // installed, so nothing rotates and the logs — the only forensics that
  // exist — have no ceiling.
  const file = path.join(HERE, "logrotate.knijka");
  assert.ok(fs.existsSync(file), "tools/deploy/logrotate.knijka must exist");
  const conf = fs.readFileSync(file, "utf8");
  assert.match(conf, /\/var\/log\/knijka-autodeploy\.log/);
  assert.match(conf, /\/var\/log\/knijka-backup\.log/);
  assert.match(conf, /\brotate\s+8\b/);
  assert.match(README, /install -m 644 tools\/deploy\/logrotate\.knijka/);
});

test("pm2's own logs are covered too, and by pm2-logrotate", () => {
  // logrotate cannot rotate them safely: pm2 holds the descriptors open, so a
  // rename leaves pm2 writing into a deleted inode and the new file empty —
  // which looks fixed and is not.
  assert.match(README, /pm2 install pm2-logrotate/);
  assert.match(README, /pm2 set pm2-logrotate:max_size/);
  assert.match(README, /pm2 set pm2-logrotate:retain/);
});

test("the backup runbook admits the pull has never run, and how to check", () => {
  assert.match(README, /pull-backups\.sh --check/);
  assert.match(README, /8 days/);
  // The sentence that stops "we have backups" from being said out loud.
  assert.match(README, /recovery position is zero/i);
});

test("the kill switch is documented with the restart it needs", () => {
  assert.match(README, /DISABLED_FEATURES/);
  assert.match(README, /pm2 restart knijka --update-env/);
  // The trap: a typo disables nothing and looks identical to success.
  assert.match(README, /simulater/);
});
