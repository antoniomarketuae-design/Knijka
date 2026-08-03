/**
 * The off-box backup pull.
 * Run: node --test tools/deploy/pull-backups.test.mjs
 *
 * THE DEFECT THESE TESTS EXIST FOR IS THAT THE SCRIPT HAD NEVER RUN. Its old
 * line 25 `mkdir -p "$DEST"` fires unconditionally, before any network call —
 * and $HOME/knijka-backups does not exist on the dev machine. That is proof
 * the script was never invoked, not even unsuccessfully. Every dump the
 * company owns lives on the VPS, and only on the VPS: safe from a bad
 * migration, and one dead box away from being the whole history of every
 * student's progress, gone.
 *
 * So the tests below are not about rsync flags. They are about the three
 * things that make it runnable and honest:
 *   - it works on a box with NO rsync (Git Bash on Windows — the dev machine)
 *   - a failed run leaves NOTHING behind that looks like a backup directory
 *   - it fails loudly when the newest local dump is older than 8 days
 *
 * The real script is executed, against a sandbox whose ssh/scp/rsync are
 * recording fakes on PATH. Requires bash (Git Bash on Windows is fine).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "pull-backups.sh");

/** Windows drive paths (`C:\x`) are not valid inside MSYS bash; `/c/x` is. */
function toBashPath(p) {
  const posix = p.replace(/\\/g, "/");
  return process.platform === "win32"
    ? posix.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
    : posix;
}

function writeExec(file, body) {
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
}

/**
 * `ssh` answers three things: the reachability probe (`true`), the remote
 * listing, and — when the sandbox says so — nothing at all, because the box is
 * gone. `$T/control/unreachable` is that switch.
 */
const FAKE_SSH = `#!/usr/bin/env bash
echo "ssh $*" >> "$T/calls.log"
if [ -f "$T/control/unreachable" ]; then exit 255; fi
for last in "$@"; do :; done
case "$last" in
  true) exit 0 ;;
  ls*) ls -1 "$T/remote"/knijka-*.dump 2>/dev/null | sed "s|.*/|/var/backups/knijka/|" ; exit 0 ;;
esac
exit 0
`;

const FAKE_SCP = `#!/usr/bin/env bash
echo "scp $*" >> "$T/calls.log"
if [ -f "$T/control/unreachable" ]; then exit 255; fi
for a in "$@"; do prev="$cur"; cur="$a"; done
src="$prev"; dst="$cur"
base="\${src##*/}"
if [ -f "$T/remote/$base" ]; then cp "$T/remote/$base" "$dst"; exit 0; fi
exit 1
`;

const FAKE_RSYNC = `#!/usr/bin/env bash
echo "rsync $*" >> "$T/calls.log"
exit 0
`;

function makeSandbox(t, { withRsync = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "knijka-pull-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const at = (...p) => path.join(root, ...p);
  fs.mkdirSync(at("control"), { recursive: true });
  fs.mkdirSync(at("remote"), { recursive: true });
  fs.mkdirSync(at("bin"), { recursive: true });
  fs.writeFileSync(at("key"), "not-a-real-key\n");

  writeExec(at("bin", "ssh"), FAKE_SSH);
  writeExec(at("bin", "scp"), FAKE_SCP);
  if (withRsync) writeExec(at("bin", "rsync"), FAKE_RSYNC);

  const env = {
    T: toBashPath(root),
    KNIJKA_VPS: "root@vps.example",
    KNIJKA_SSH_KEY: toBashPath(at("key")),
    KNIJKA_LOCAL_BACKUP_DIR: toBashPath(at("local")),
  };

  /**
   * PATH is the sandbox bin FIRST and then a minimal set of real tool
   * directories — never the caller's whole PATH, or a machine that happens to
   * have rsync installed would silently take the other branch.
   */
  const run = (args = [], extraEnv = {}) => {
    const exports = Object.entries({ ...env, ...extraEnv })
      .map(([k, v]) => `export ${k}="${v}";`)
      .join(" ");
    const cmd =
      `export PATH="${toBashPath(at("bin"))}:/usr/bin:/bin"; ${exports} ` +
      `bash "${toBashPath(SCRIPT)}" ${args.map((a) => `"${a}"`).join(" ")}`;
    try {
      return { code: 0, out: execFileSync("bash", ["-c", cmd], { encoding: "utf8" }) };
    } catch (err) {
      return { code: err.status, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  return {
    root,
    at,
    run,
    control: (name) => fs.writeFileSync(at("control", name), ""),
    /** Put a dump on the "VPS". */
    remoteDump: (name, body = "dump") =>
      fs.writeFileSync(at("remote", name), body),
    /**
     * The VPS's checksums.txt, in real `sha256sum` format. Written from the
     * content each file is expected to have LOCALLY once the pull is done —
     * which is the whole point of the verification step: a transfer that
     * truncated a dump must fail here, not at 03:00 during a restore.
     */
    remoteChecksums: (entries) => {
      const lines = entries.map(
        ([name, body]) =>
          `${crypto.createHash("sha256").update(body).digest("hex")}  ${name}`,
      );
      fs.writeFileSync(at("remote", "checksums.txt"), `${lines.join("\n")}\n`);
    },
    localDump: (name, ageDays = 0) => {
      fs.mkdirSync(at("local"), { recursive: true });
      const f = at("local", name);
      fs.writeFileSync(f, "dump");
      const when = new Date(Date.now() - ageDays * 86400_000);
      fs.utimesSync(f, when, when);
      return f;
    },
    localFiles: () =>
      fs.existsSync(at("local")) ? fs.readdirSync(at("local")).sort() : null,
    calls: () =>
      fs.existsSync(at("calls.log")) ? fs.readFileSync(at("calls.log"), "utf8") : "",
  };
}

// ---------------------------------------------------------------------------
// --check: the honest answer about where we actually stand
// ---------------------------------------------------------------------------

test("--check fails when there is no backup directory at all", (t) => {
  // THE STATE OF THE DEV MACHINE TODAY. It has to be a loud failure, not a
  // silent zero — a company whose only copy is on the VPS should find that out
  // from this script, not from the day the VPS dies.
  const s = makeSandbox(t);
  const { code, out } = s.run(["--check"]);
  assert.notEqual(code, 0);
  assert.match(out, /NO copy of the database/);
});

test("--check fails when the directory exists but holds no dumps", (t) => {
  // An empty directory with a plausible name is worse than no directory: it is
  // exactly what "we have backups" looks like from the outside.
  const s = makeSandbox(t);
  fs.mkdirSync(s.at("local"), { recursive: true });
  const { code, out } = s.run(["--check"]);
  assert.notEqual(code, 0);
  assert.match(out, /no knijka-\*\.dump/);
});

test("--check fails when the newest dump is older than 8 days", (t) => {
  const s = makeSandbox(t);
  s.localDump("knijka-20260701T031500Z-daily-scheduled.dump", 21);
  const { code, out } = s.run(["--check"]);
  assert.notEqual(code, 0);
  assert.match(out, /21 days old/);
});

test("--check passes on a dump from within the window", (t) => {
  const s = makeSandbox(t);
  s.localDump("knijka-20260801T031500Z-daily-scheduled.dump", 3);
  const { code, out } = s.run(["--check"]);
  assert.equal(code, 0);
  assert.match(out, /3 day\(s\) old/);
});

test("--check never claims a backup is a plan", (t) => {
  // Until a dump has been RESTORED the recovery position is zero. The script
  // says so on every green run, because that is the run where it is easy to
  // believe otherwise.
  const s = makeSandbox(t);
  s.localDump("knijka-20260801T031500Z-daily-scheduled.dump", 1);
  assert.match(s.run(["--check"]).out, /never been restored is a belief/);
});

test("the window is configurable, and the boundary is not off by one", (t) => {
  const s = makeSandbox(t);
  s.localDump("knijka-x-daily-scheduled.dump", 8);
  // Exactly at the limit is still fine — the limit is "older than".
  assert.equal(s.run(["--check"]).code, 0);
  assert.notEqual(s.run(["--check"], { KNIJKA_BACKUP_MAX_AGE_DAYS: "7" }).code, 0);
});

// ---------------------------------------------------------------------------
// Pulling: it must work on the box it is meant to be run from
// ---------------------------------------------------------------------------

test("pulls with scp when the box has no rsync — the dev box, i.e. always", (t) => {
  // Git Bash on Windows ships ssh and scp and no rsync. Under `set -e` the old
  // script's single rsync line died with `command not found`, which is the
  // whole reason this had never run.
  const s = makeSandbox(t); // no rsync in the sandbox bin
  const name = "knijka-20260802T031500Z-daily-scheduled.dump";
  s.remoteDump(name);
  s.remoteChecksums([[name, "dump"]]);

  const { code, out } = s.run([]);
  assert.equal(code, 0, out);
  assert.match(out, /no rsync/);
  assert.deepEqual(s.localFiles(), ["checksums.txt", name]);
  // Verified, not merely transferred: a silently truncated copy is exactly as
  // useless as no copy, and twice as reassuring.
  assert.match(out, /checksums verified/);
});

test("a truncated transfer is caught here, not during a restore", (t) => {
  const s = makeSandbox(t);
  const name = "knijka-20260802T031500Z-daily-scheduled.dump";
  s.remoteDump(name, "half a dum");
  s.remoteChecksums([[name, "the whole dump"]]);

  const { code, out } = s.run([]);
  assert.notEqual(code, 0);
  assert.match(out, /CHECKSUM MISMATCH/);
});

test("uses rsync when it is there", (t) => {
  const s = makeSandbox(t, { withRsync: true });
  s.localDump("knijka-20260802T031500Z-daily-scheduled.dump", 1);
  const { code } = s.run([]);
  assert.equal(code, 0);
  assert.match(s.calls(), /rsync .*--ignore-existing/);
});

test("never re-downloads a dump it already has", (t) => {
  // Same guarantee rsync's --ignore-existing gives: the local copy must
  // survive the VPS deleting its own retention window, and must never be
  // overwritten by a remote decision.
  const s = makeSandbox(t);
  const name = "knijka-20260802T031500Z-daily-scheduled.dump";
  s.localDump(name, 1);
  fs.writeFileSync(s.at("local", name), "the good local copy");
  s.remoteDump(name, "whatever the VPS holds today");
  s.remoteChecksums([[name, "the good local copy"]]);

  const { code, out } = s.run([]);
  assert.equal(code, 0, out);
  assert.equal(fs.readFileSync(s.at("local", name), "utf8"), "the good local copy");
});

test("a run against a dead VPS creates NOTHING", (t) => {
  // The bug in one assertion. `mkdir -p "$DEST"` before any network call left
  // an empty $HOME/knijka-backups behind — a directory that reads as "backups
  // exist" to every human who looks and to no tool at all.
  const s = makeSandbox(t);
  s.control("unreachable");

  const { code, out } = s.run([]);
  assert.equal(code, 2, "refusing before touching anything is exit 2");
  assert.match(out, /cannot reach/);
  assert.equal(s.localFiles(), null, "no directory may be left behind");
});

test("refuses, before anything, when the ssh key is missing", (t) => {
  const s = makeSandbox(t);
  const { code, out } = s.run([], { KNIJKA_SSH_KEY: "/nope/id_ed25519" });
  assert.equal(code, 2);
  assert.match(out, /no ssh key/);
  assert.equal(s.localFiles(), null);
});

test("a successful pull ends by asking whether that is good enough", (t) => {
  // Pulling and then not checking is how "it ran, so we are fine" survives a
  // run that copied nothing.
  const s = makeSandbox(t);
  const name = "knijka-20260802T031500Z-daily-scheduled.dump";
  s.remoteDump(name);
  s.remoteChecksums([[name, "dump"]]);
  const { out } = s.run([]);
  assert.match(out, /newest local dump is 0 day\(s\) old/);
});

test("a pull that copies nothing new still fails when everything local is stale", (t) => {
  const s = makeSandbox(t);
  const name = "knijka-20260701T031500Z-daily-scheduled.dump";
  s.localDump(name, 30);
  s.remoteDump(name);
  s.remoteChecksums([[name, "dump"]]);

  const { code, out } = s.run([]);
  assert.notEqual(code, 0, "a green transfer over a stale set is not a green backup");
  assert.match(out, /30 days old/);
});
