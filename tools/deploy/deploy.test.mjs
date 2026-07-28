/**
 * Tests for the staging deploy scripts (audit 2026-07-24, finding H-17).
 * Run: node --test tools/deploy/deploy.test.mjs
 *
 * These run the REAL scripts, with a real git repository, against a sandbox
 * whose `npm`, `npx`, `pm2`, `curl` and `pg_dump` are recording fakes on PATH.
 * That matters: the bugs H-17 describes are not logic errors inside a function
 * — they are the ORDER of shell operations against a live directory. A test
 * that re-implemented the ordering would have passed on the old script too.
 *
 * The fakes model the one thing that made the outage possible:
 *   - `npm run build` writes down what the LIVE `.next` looked like while it
 *     was building. The old script had deleted it by then.
 *   - `pm2 restart` makes the fake server "serve" whatever `.next` holds right
 *     then — so a restart with no build serves nothing, and `curl` fails,
 *     exactly as staging did.
 *
 * Requires bash + git (Git Bash on Windows is fine).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Windows drive paths (`C:\x`) are not valid inside MSYS bash; `/c/x` is. */
function toBashPath(p) {
  const posix = p.replace(/\\/g, "/");
  return process.platform === "win32"
    ? posix.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
    : posix;
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function writeExec(file, body) {
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
}

// ---------------------------------------------------------------------------
// The sandbox
// ---------------------------------------------------------------------------

const FAKE_NPM = `#!/usr/bin/env bash
echo "npm $*" >> "$T/calls.log"
if [ "$1" = "ci" ]; then
  rm -rf node_modules; mkdir -p node_modules; echo installed > node_modules/.stamp
fi
if [ "$1" = "run" ] && [ "$2" = "build" ]; then
  # The H-17 witness: what did the LIVE build look like while we were building?
  if [ -f "$T/app/platform/.next/BUILD_SHA" ]; then
    echo "live-next-during-build=$(cat "$T/app/platform/.next/BUILD_SHA")" >> "$T/calls.log"
  else
    echo "live-next-during-build=MISSING" >> "$T/calls.log"
  fi
  if [ -f "$T/control/build_fails" ]; then echo "build blew up" >&2; exit 1; fi
  mkdir -p .next/cache
  echo "$NEXT_PUBLIC_COMMIT_SHA" > .next/BUILD_SHA
  echo "workspace-only" > .next/cache/marker
fi
exit 0
`;

const FAKE_NPX = `#!/usr/bin/env bash
echo "npx $*" >> "$T/calls.log"
if [ "$1" = "prisma" ] && [ "$2" = "generate" ]; then
  mkdir -p src/generated/prisma; echo client > src/generated/prisma/client.ts
fi
if [ "$1" = "prisma" ] && [ "$2" = "migrate" ]; then
  if [ -f "$T/control/migrate_fails" ]; then exit 1; fi
fi
exit 0
`;

// A restart is the moment the server picks up whatever `.next` currently is.
const FAKE_PM2 = `#!/usr/bin/env bash
echo "pm2 $*" >> "$T/calls.log"
if [ "$1" = "restart" ]; then
  if [ -f "$T/app/platform/.next/BUILD_SHA" ]; then
    cat "$T/app/platform/.next/BUILD_SHA" > "$T/control/serving_sha"
  else
    : > "$T/control/serving_sha"   # nothing to serve — the ENOENT outage
  fi
fi
exit 0
`;

// -f means "fail with a non-zero exit on an HTTP error", which is how the
// scripts read a 503. 22 is curl's code for exactly that.
const FAKE_CURL = `#!/usr/bin/env bash
for url in "$@"; do :; done
sha=$(cat "$T/control/serving_sha" 2>/dev/null || true)
bad=$(cat "$T/control/bad_sha" 2>/dev/null || true)
mode=$(cat "$T/control/health" 2>/dev/null || echo ok)
echo "curl $url" >> "$T/calls.log"
case "$url" in *hooks.example*) exit 0 ;; esac
if [ -z "$sha" ]; then exit 22; fi
if [ -n "$bad" ] && [ "$sha" = "$bad" ]; then exit 22; fi
case "$url" in
  *probe=liveness*) echo "{\\"ok\\":true,\\"probe\\":\\"liveness\\",\\"commit\\":\\"$sha\\"}" ;;
  *)
    if [ "$mode" = "db-down" ]; then exit 22; fi
    echo "{\\"ok\\":true,\\"probe\\":\\"readiness\\",\\"commit\\":\\"$sha\\",\\"checks\\":{\\"db\\":{\\"ok\\":true}}}"
    ;;
esac
exit 0
`;

const FAKE_BACKUP = `#!/usr/bin/env bash
echo "backup $*" >> "$T/calls.log"
if [ -f "$T/control/backup_fails" ]; then exit 1; fi
exit 0
`;

/**
 * Builds an origin repo with two commits, `staging-green` on the second, and
 * an app tree + build workspace cloned at the first — i.e. one deploy behind.
 */
function makeSandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "knijka-deploy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const at = (...p) => path.join(root, ...p);
  fs.mkdirSync(at("control"), { recursive: true });
  fs.mkdirSync(at("state"), { recursive: true });
  fs.mkdirSync(at("bin"), { recursive: true });

  writeExec(at("bin", "npm"), FAKE_NPM);
  writeExec(at("bin", "npx"), FAKE_NPX);
  writeExec(at("bin", "pm2"), FAKE_PM2);
  writeExec(at("bin", "curl"), FAKE_CURL);
  writeExec(at("bin", "fake-backup"), FAKE_BACKUP);

  // --- origin -------------------------------------------------------------
  const origin = at("origin");
  fs.mkdirSync(path.join(origin, "platform", "public"), { recursive: true });
  git(root, "init", "--quiet", "-b", "scenario-engine", origin);
  git(origin, "config", "user.email", "test@example.com");
  git(origin, "config", "user.name", "test");
  fs.writeFileSync(
    path.join(origin, ".gitignore"),
    "platform/.next/\nplatform/node_modules/\nplatform/src/generated/\n",
  );
  fs.writeFileSync(path.join(origin, "platform", "package.json"), "{}\n");
  fs.writeFileSync(path.join(origin, "platform", "package-lock.json"), '{"v":1}\n');
  fs.writeFileSync(path.join(origin, "platform", "public", "old.txt"), "old\n");
  git(origin, "add", "-A");
  git(origin, "commit", "--quiet", "-m", "one");
  const sha1 = git(origin, "rev-parse", "HEAD");

  fs.writeFileSync(path.join(origin, "platform", "public", "new.txt"), "new\n");
  git(origin, "add", "-A");
  git(origin, "commit", "--quiet", "-m", "two");
  const sha2 = git(origin, "rev-parse", "HEAD");
  git(origin, "tag", "-f", "staging-green", sha2);

  // --- live tree + build workspace, both one commit behind -----------------
  git(root, "clone", "--quiet", origin, at("app"));
  git(root, "clone", "--quiet", origin, at("build"));
  for (const tree of ["app", "build"]) {
    git(at(tree), "checkout", "--quiet", sha1);
  }
  // Artefacts of the deploy that is currently live.
  const livePlatform = at("app", "platform");
  fs.mkdirSync(path.join(livePlatform, ".next", "cache"), { recursive: true });
  fs.writeFileSync(path.join(livePlatform, ".next", "BUILD_SHA"), sha1);
  fs.mkdirSync(path.join(livePlatform, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(livePlatform, "src", "generated"), { recursive: true });
  fs.writeFileSync(at("state", "deployed_sha"), sha1);
  fs.writeFileSync(at("control", "serving_sha"), sha1);

  const env = {
    T: toBashPath(root),
    KNIJKA_APP_ROOT: toBashPath(at("app")),
    KNIJKA_BUILD_ROOT: toBashPath(at("build")),
    KNIJKA_STATE_DIR: toBashPath(at("state")),
    KNIJKA_BACKUP_SCRIPT: toBashPath(at("bin", "fake-backup")),
    KNIJKA_HEALTH_URL: "http://127.0.0.1:3100/api/health",
    KNIJKA_HEALTH_TIMEOUT_SEC: "2",
    KNIJKA_HEALTH_INTERVAL_SEC: "0.2",
    KNIJKA_MIN_FREE_MB: "1",
    KNIJKA_BACKOFF_BASE_SEC: "0",
    HOME: toBashPath(root),
  };

  /** Runs one of the real scripts with the sandbox's fakes on PATH. */
  const run = (script, args = [], extraEnv = {}) => {
    const exports = Object.entries({ ...env, ...extraEnv })
      .map(([k, v]) => `export ${k}="${v}";`)
      .join(" ");
    const cmd =
      `export PATH="${toBashPath(at("bin"))}:$PATH"; ${exports} ` +
      `bash "${toBashPath(path.join(HERE, script))}" ${args.map((a) => `"${a}"`).join(" ")}`;
    try {
      const stdout = execFileSync("bash", ["-c", cmd], { encoding: "utf8" });
      return { code: 0, stdout };
    } catch (err) {
      return { code: err.status, stdout: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  return {
    root,
    at,
    sha1,
    sha2,
    origin,
    run,
    control: (name, value = "") => fs.writeFileSync(at("control", name), value),
    clearControl: (name) => fs.rmSync(at("control", name), { force: true }),
    read: (...p) => (fs.existsSync(at(...p)) ? fs.readFileSync(at(...p), "utf8").trim() : null),
    calls: () => (fs.existsSync(at("calls.log")) ? fs.readFileSync(at("calls.log"), "utf8") : ""),
    liveSha: () => {
      const f = at("app", "platform", ".next", "BUILD_SHA");
      return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : null;
    },
  };
}

// ---------------------------------------------------------------------------
// deploy.sh
// ---------------------------------------------------------------------------

test("deploy.sh: the live build is never removed while the new one is being built", (t) => {
  const s = makeSandbox(t);
  const { code } = s.run("deploy.sh");
  assert.equal(code, 0);
  // THE regression assertion for H-17. The old script ran `rm -rf .next` before
  // `npm run build`, so this line would read MISSING — which is exactly what
  // the six ENOENT entries in knijka-error.log were.
  assert.match(s.calls(), new RegExp(`live-next-during-build=${s.sha1}`));
});

test("deploy.sh: a healthy deploy swaps the build in and records it", (t) => {
  const s = makeSandbox(t);
  const { code } = s.run("deploy.sh");
  assert.equal(code, 0);
  assert.equal(s.liveSha(), s.sha2);
  assert.equal(s.read("state", "deployed_sha"), s.sha2);
  // public/ has to follow the build, or new assets 404 against the new HTML.
  assert.ok(fs.existsSync(s.at("app", "platform", "public", "new.txt")));
  // The previous artefacts are only dropped once health is proven.
  assert.ok(!fs.existsSync(s.at("app", "platform", ".next.prev")));
});

test("deploy.sh: the live server's .next/cache is its own, not the workspace's", (t) => {
  const s = makeSandbox(t);
  s.run("deploy.sh");
  // Hardlinked, the live process's ISR writes would land in the build
  // workspace and corrupt the next build's cache.
  assert.ok(fs.existsSync(s.at("app", "platform", ".next", "cache")));
  assert.ok(!fs.existsSync(s.at("app", "platform", ".next", "cache", "marker")));
  assert.ok(fs.existsSync(s.at("build", "platform", ".next", "cache", "marker")));
});

test("deploy.sh: a failed build never touches the live tree at all", (t) => {
  const s = makeSandbox(t);
  s.control("build_fails");
  const { code } = s.run("deploy.sh");
  assert.notEqual(code, 0);
  assert.equal(s.liveSha(), s.sha1);
  assert.equal(s.read("state", "deployed_sha"), s.sha1);
  assert.ok(!/pm2 restart/.test(s.calls()), "staging must not be restarted for a build that failed");
});

test("deploy.sh: a build that comes up unhealthy is rolled back automatically", (t) => {
  const s = makeSandbox(t);
  s.control("bad_sha", s.sha2); // the new build cannot serve
  const { code, stdout } = s.run("deploy.sh");
  assert.equal(code, 1);
  assert.equal(s.liveSha(), s.sha1, "the previous build must be serving again");
  assert.equal(s.read("state", "deployed_sha"), s.sha1);
  assert.equal(s.read("control", "serving_sha"), s.sha1);
  assert.match(stdout, /ROLLING BACK/);
  assert.match(stdout, /rollback verified/);
  // The broken artefacts are kept — H-17 hid for 11.5 h partly because the
  // evidence had been deleted.
  assert.ok(fs.existsSync(s.at("app", "platform", ".next.failed")));
});

test("deploy.sh: a restart that serves nothing is caught, not reported as success", (t) => {
  const s = makeSandbox(t);
  // The exact old-script scenario: the process comes back with no build.
  s.control("bad_sha", s.sha2);
  const { code } = s.run("deploy.sh");
  assert.equal(code, 1);
  assert.notEqual(s.read("state", "deployed_sha"), s.sha2);
});

test("deploy.sh: a database outage does NOT trigger a code rollback", (t) => {
  const s = makeSandbox(t);
  s.control("health", "db-down"); // readiness 503, liveness fine
  const { code, stdout } = s.run("deploy.sh");
  assert.equal(code, 3, "distinct exit code so autodeploy does not burn its retry budget");
  assert.equal(s.liveSha(), s.sha2, "rolling back cannot fix Postgres — it would only add downtime");
  assert.equal(s.read("state", "deployed_sha"), s.sha2);
  assert.match(stdout, /NOT rolling back/);
});

test("deploy.sh: the database is backed up BEFORE migrations run", (t) => {
  const s = makeSandbox(t);
  s.run("deploy.sh");
  const log = s.calls();
  assert.ok(log.indexOf("backup ") >= 0, "a migration must never run unprotected");
  assert.ok(
    log.indexOf("backup ") < log.indexOf("npx prisma migrate deploy"),
    "a backup taken after the migration is worthless",
  );
});

test("deploy.sh: a failed backup aborts before the migration and before the swap", (t) => {
  const s = makeSandbox(t);
  s.control("backup_fails");
  const { code } = s.run("deploy.sh");
  assert.notEqual(code, 0);
  assert.ok(!/migrate deploy/.test(s.calls()));
  assert.equal(s.liveSha(), s.sha1);
});

test("deploy.sh: redeploying what is already live is a no-op", (t) => {
  const s = makeSandbox(t);
  fs.writeFileSync(s.at("state", "deployed_sha"), s.sha2);
  const { code, stdout } = s.run("deploy.sh");
  assert.equal(code, 0);
  assert.match(stdout, /already live/);
  assert.ok(!/npm run build/.test(s.calls()));
});

// ---------------------------------------------------------------------------
// autodeploy.sh
// ---------------------------------------------------------------------------

test("autodeploy.sh: a failed deploy is RETRIED on the next tick", (t) => {
  const s = makeSandbox(t);
  s.control("bad_sha", s.sha2);
  const first = s.run("autodeploy.sh");
  assert.equal(first.code, 0, "the tick itself succeeds; the deploy inside it did not");
  assert.equal(s.read("state", "deployed_sha"), s.sha1, "a failure must not be recorded as deployed");
  assert.equal(s.read("state", "fail_count"), "1");

  // This is the 11.5-hour bug. The old script compared HEAD *after* moving it,
  // so the second tick saw "nothing to do" and staging stayed broken until a
  // human pushed unrelated code.
  const buildsBefore = s.calls().match(/npm run build/g).length;
  s.clearControl("bad_sha"); // whatever was flaky has passed
  s.run("autodeploy.sh");
  const buildsAfter = s.calls().match(/npm run build/g).length;
  assert.ok(buildsAfter > buildsBefore, "the next tick must try again by itself");
  assert.equal(s.read("state", "deployed_sha"), s.sha2, "and recover without a human");
});

test("autodeploy.sh: deploys the CI-green tag, not whatever is on the branch", (t) => {
  const s = makeSandbox(t);
  // A third commit lands but the gate has not gone green, so the tag stays put.
  fs.writeFileSync(path.join(s.origin, "platform", "public", "ungated.txt"), "x\n");
  git(s.origin, "add", "-A");
  git(s.origin, "commit", "--quiet", "-m", "three (red)");
  const sha3 = git(s.origin, "rev-parse", "HEAD");

  s.run("autodeploy.sh");
  assert.equal(s.read("state", "deployed_sha"), s.sha2);
  assert.notEqual(s.read("state", "deployed_sha"), sha3);
  assert.ok(!fs.existsSync(s.at("app", "platform", "public", "ungated.txt")));
});

test("autodeploy.sh: nothing to do when the tag is already live", (t) => {
  const s = makeSandbox(t);
  fs.writeFileSync(s.at("state", "deployed_sha"), s.sha2);
  const { code } = s.run("autodeploy.sh");
  assert.equal(code, 0);
  assert.equal(s.calls(), "", "the normal case, 288 times a day, must be completely silent");
});

test("autodeploy.sh: gives up after the retry budget, but takes a NEW green commit at once", (t) => {
  const s = makeSandbox(t);
  s.control("bad_sha", s.sha2);
  const env = { KNIJKA_MAX_ATTEMPTS: "2" };
  s.run("autodeploy.sh", [], env);
  s.run("autodeploy.sh", [], env);
  assert.equal(s.read("state", "fail_count"), "2");

  const buildsAtGiveUp = s.calls().match(/npm run build/g).length;
  const gaveUp = s.run("autodeploy.sh", [], env);
  assert.match(gaveUp.stdout, /GIVING UP/);
  assert.equal(
    s.calls().match(/npm run build/g).length,
    buildsAtGiveUp,
    "a broken commit must stop rebuilding every 5 min on the box that serves staging",
  );

  // Pushing a fix is how a human clears this — so a new green commit must not
  // inherit the old commit's exhausted budget.
  fs.writeFileSync(path.join(s.origin, "platform", "public", "fix.txt"), "fixed\n");
  git(s.origin, "add", "-A");
  git(s.origin, "commit", "--quiet", "-m", "four (fixed)");
  const sha4 = git(s.origin, "rev-parse", "HEAD");
  git(s.origin, "tag", "-f", "staging-green", sha4);

  s.run("autodeploy.sh", [], env);
  assert.equal(s.read("state", "deployed_sha"), sha4);
});

test("autodeploy.sh: a running deploy is never raced by the next tick", (t) => {
  const s = makeSandbox(t);
  fs.mkdirSync(s.at("state", "lock"));
  const { code, stdout } = s.run("autodeploy.sh");
  assert.equal(code, 0);
  assert.match(stdout, /another deploy is running/);
  assert.ok(!/npm run build/.test(s.calls()));
});

test("autodeploy.sh: a database outage does not consume the retry budget", (t) => {
  const s = makeSandbox(t);
  s.control("health", "db-down");
  s.run("autodeploy.sh");
  assert.equal(s.read("state", "fail_count"), null, "exit 3 is 'page a human', not 'try again'");
  assert.equal(s.read("state", "deployed_sha"), s.sha2);
});

// ---------------------------------------------------------------------------
// backup-db.sh
// ---------------------------------------------------------------------------

const FAKE_PG_DUMP = `#!/usr/bin/env bash
out=""
for a in "$@"; do case "$a" in --file=*) out="\${a#--file=}" ;; esac; done
if [ -f "$T/control/dump_fails" ]; then exit 1; fi
if [ -f "$T/control/dump_truncated" ]; then printf 'PGDMP-trunc' > "$out"; else printf 'PGDMP-GOOD' > "$out"; fi
exit 0
`;

const FAKE_PG_RESTORE = `#!/usr/bin/env bash
for f in "$@"; do :; done
grep -q GOOD "$f" || exit 1
if [ -f "$T/control/dump_empty" ]; then echo "; comment only"; else
  echo "1; 0 0 TABLE DATA public User postgres"
  echo "2; 0 0 TABLE DATA public ExamAttempt postgres"
fi
exit 0
`;

function makeBackupSandbox(t) {
  const s = makeSandbox(t);
  writeExec(s.at("bin", "pg_dump"), FAKE_PG_DUMP);
  writeExec(s.at("bin", "pg_restore"), FAKE_PG_RESTORE);
  fs.mkdirSync(s.at("backups"), { recursive: true });
  const env = {
    KNIJKA_BACKUP_DIR: toBashPath(s.at("backups")),
    KNIJKA_BACKUP_MIN_FREE_MB: "1",
    DATABASE_URL: "postgresql://knijka:hunter2@127.0.0.1:5432/knijka",
  };
  const dumps = () =>
    fs.readdirSync(s.at("backups")).filter((f) => f.endsWith(".dump"));
  return { ...s, backupEnv: env, dumps };
}

test("backup-db.sh: writes a dump and records its checksum", (t) => {
  const s = makeBackupSandbox(t);
  const { code } = s.run("backup-db.sh", ["scheduled"], s.backupEnv);
  assert.equal(code, 0);
  assert.equal(s.dumps().length, 1);
  assert.match(fs.readFileSync(s.at("backups", "checksums.txt"), "utf8"), /knijka-.*\.dump/);
});

test("backup-db.sh: a dump that does not read back is discarded, not kept", (t) => {
  const s = makeBackupSandbox(t);
  s.control("dump_truncated"); // disk filled mid-dump — the silent killer
  const { code, stdout } = s.run("backup-db.sh", ["scheduled"], s.backupEnv);
  assert.notEqual(code, 0);
  assert.equal(s.dumps().length, 0, "an unverified file must never look like a backup");
  assert.match(stdout, /did not verify/);
  assert.equal(
    fs.readdirSync(s.at("backups")).filter((f) => f.includes("partial")).length,
    0,
    "the partial file must be cleaned up",
  );
});

test("backup-db.sh: an empty dump is a failure — it verifies but restores nothing", (t) => {
  const s = makeBackupSandbox(t);
  s.control("dump_empty");
  const { code } = s.run("backup-db.sh", ["scheduled"], s.backupEnv);
  assert.notEqual(code, 0);
  assert.equal(s.dumps().length, 0);
});

test("backup-db.sh: pg_dump failing produces no backup and a non-zero exit", (t) => {
  const s = makeBackupSandbox(t);
  s.control("dump_fails");
  const { code } = s.run("backup-db.sh", ["scheduled"], s.backupEnv);
  assert.notEqual(code, 0, "deploy.sh must be able to refuse to migrate on this");
  assert.equal(s.dumps().length, 0);
});

test("backup-db.sh: prunes old daily dumps but keeps the weekly ones", (t) => {
  const s = makeBackupSandbox(t);
  const old = (name) => {
    const f = s.at("backups", name);
    fs.writeFileSync(f, "x");
    execFileSync("bash", ["-c", `touch -d "30 days ago" "${toBashPath(f)}"`]);
  };
  old("knijka-20260601T000000Z-daily-scheduled.dump");
  old("knijka-20260601T000000Z-weekly-scheduled.dump");

  s.run("backup-db.sh", ["scheduled"], s.backupEnv);
  const kept = s.dumps();
  assert.ok(!kept.includes("knijka-20260601T000000Z-daily-scheduled.dump"));
  assert.ok(kept.includes("knijka-20260601T000000Z-weekly-scheduled.dump"));
});

test("backup-db.sh: retention only runs after a good dump exists", (t) => {
  const s = makeBackupSandbox(t);
  const f = s.at("backups", "knijka-20260601T000000Z-daily-scheduled.dump");
  fs.writeFileSync(f, "x");
  execFileSync("bash", ["-c", `touch -d "30 days ago" "${toBashPath(f)}"`]);

  s.control("dump_fails");
  s.run("backup-db.sh", ["scheduled"], s.backupEnv);
  assert.equal(
    s.dumps().length,
    1,
    "a run of failures must never leave the box with nothing at all",
  );
});

test("backup-db.sh: the label is sanitised before it reaches a filename", (t) => {
  const s = makeBackupSandbox(t);
  s.run("backup-db.sh", ["../../etc/pre deploy;rm"], s.backupEnv);
  assert.equal(s.dumps().length, 1);
  assert.match(s.dumps()[0], /^knijka-[0-9TZ]+-daily-[A-Za-z0-9._-]+\.dump$/);
});

// ---------------------------------------------------------------------------
// The bit that is invisible from Windows
// ---------------------------------------------------------------------------

test("every shell script is committed executable", () => {
  // 2026-07-28: the gate had been red since 2026-07-25 and nobody could see why,
  // because on Windows it is GREEN. All five .sh files were committed as 100644.
  // Windows does not enforce the mode — bash happily runs a non-executable file
  // — and `core.filemode=false` there means git never notices the local rwxr-xr-x
  // and never records it. On Linux the same checkout gives autodeploy.sh an
  // unrunnable deploy.sh: `Permission denied`, exit 126.
  //
  // That is not merely a CI failure. autodeploy.sh runs on the VPS from a git
  // checkout, so a fresh clone there produces a deploy pipeline that cannot
  // deploy — the failure mode is "staging silently stops updating", which is
  // exactly the class of bug the H-17 battery above exists to prevent.
  //
  // The mode is the thing under test, so read it from the INDEX, not from the
  // filesystem: on Windows the filesystem always claims 0755 and would pass.
  const repoRoot = path.resolve(HERE, "..", "..");
  const listed = execFileSync("git", ["ls-files", "-s", "--", "*.sh"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  assert.ok(listed.length > 0, "no .sh files found — the guard would pass vacuously");

  const notExecutable = listed
    .split("\n")
    .map((line) => {
      const [mode, , , file] = line.split(/\s+/);
      return { mode, file };
    })
    .filter((e) => e.mode !== "100755");

  assert.deepEqual(
    notExecutable,
    [],
    `committed non-executable:\n${notExecutable.map((e) => `  ${e.mode} ${e.file}`).join("\n")}\n` +
      `Fix with: git update-index --chmod=+x <file>`,
  );
});
