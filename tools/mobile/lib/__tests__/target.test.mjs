// -----------------------------------------------------------------------------
// target.test.mjs — THE INSTRUMENT THAT COULD NOT SAY WHAT IT WAS MEASURING.
//
//   node --test tools/mobile/lib/__tests__/target.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// THE DEFECT. `lesson-audit.mjs:189` was
//
//     export const BASE =
//       process.env.KNIJKA_BASE ?? "https://icon-undertaken-earliest-zope.trycloudflare.com";
//
// so a lane invoked without the variable — how nearly every lane was invoked —
// drove STAGING and returned EXIT_JUDGEABLE with real frames and a real verdict
// for a build that was not the one under test.
//
// MEASURED 2026-08-19 against that literal URL, which is why this is a live
// trap and not a dead one:
//     GET .../api/health -> 200 in 961 ms
//     {"ok":true,"probe":"readiness","commit":"unknown","uptimeSec":116, …}
// It still answers, AND it reports its own commit as "unknown", so even a
// reader who thought to ask which build the frames came from could not be told.
//
// ── THE TWO DIRECTIONS ─────────────────────────────────────────────────────
//
// A guard that fires on everything is worth what one that fires on nothing is
// worth, and this project's own complaint is a FALSE FAILURE. So half these
// tests prove the refusals fire and half prove they DO NOT:
//
//   REFUSE  unset base · unreachable · commit "unknown" · a different commit ·
//           nothing to check against · a "match" shorter than git's own 7 chars
//   DRIVE   the exact sha · a legitimately abbreviated sha · a server that is
//           503 because the local DB is down but still names its build ·
//           a DIRTY worktree, which is what every fix lane has
//
// ── HOW EACH ASSERTION WAS PROVED REAL ─────────────────────────────────────
//
// By mutation, run and recorded, never by writing the test and watching green:
//
//   M1  restore the `??` fallback in `resolveBase`
//         -> "an unset KNIJKA_BASE refuses to run" FAILS (it returns the tunnel)
//   M2  `if (health.commit === "unknown")` -> `if (false)` in `attestTarget`
//         -> "a server that cannot name its build is refused" FAILS (attested)
//   M3  `commitsAgree` -> `return true`
//         -> "a different commit is refused" FAILS
//   M4  MIN_SHA_CHARS 7 -> 1
//         -> "a 4-character coincidence is not a match" FAILS
//   M5  `!health.reachable` branch deleted
//         -> "an unreachable target is refused" FAILS (falls through to unstamped)
//   M6  `treeIdentity` digest over porcelain only, dropping the diff
//         -> "editing a tracked file changes the worktree id" FAILS
// The exact commands and their output are recorded in the lane report.
//
// NO NETWORK. Every probe here runs against an injected `fetchImpl` or a
// node:http server on 127.0.0.1, so this file behaves the same on a CI runner
// with no route out.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  TARGET_ATTESTED,
  TARGET_MISMATCH,
  TARGET_UNREACHABLE,
  TARGET_UNSET,
  TARGET_UNSTAMPED,
  attestTarget,
  commitsAgree,
  describeTarget,
  isLoopback,
  probeHealth,
  resolveBase,
  treeIdentity,
} from "../target.mjs";

/** A 40-char sha that is not any real commit, and a second that shares no
 *  prefix with it — the two builds a mismatch is between. */
const SHA_A = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const SHA_B = "0f1e2d3c4b5a69788796a5b4c3d2e1f098765432";

/** A `fetch` that answers /api/health with `body` and nothing else. */
const healthStub = (body, { status = 200, text = null } = {}) =>
  async (url) => {
    assert.match(String(url), /\/api\/health$/, "attestTarget must ask /api/health and nothing else");
    return { status, text: async () => text ?? JSON.stringify(body) };
  };

/** The tree half of an attestation, without touching git. */
const treeAt = (head, { dirty = false } = {}) => ({
  head,
  dirty,
  dirtyCount: dirty ? 3 : 0,
  dirtyPaths: dirty ? ["M platform/src/a.ts", "M platform/src/b.ts", "?? c.ts"] : [],
  worktree: dirty ? "sha256:0123456789ab" : null,
  gitAvailable: true,
});

// ── REFUSE: THE FOUR STATES THAT ARE NOT EVIDENCE ──────────────────────────

test("an unset KNIJKA_BASE refuses to run instead of defaulting to a tunnel", () => {
  // M1. OLD BEHAVIOUR: this returned "https://icon-undertaken-earliest-zope
  // .trycloudflare.com" and the lane drove staging without a word.
  assert.throws(
    () => resolveBase({}),
    (error) => {
      assert.equal(error.kind, TARGET_UNSET);
      // The message has to be actionable: the agent that hits this reads stderr
      // and nothing else.
      assert.match(error.message, /KNIJKA_BASE is not set/);
      assert.match(error.message, /KNIJKA_EXPECT_COMMIT/);
      return true;
    },
  );
  // A variable set to whitespace is not set. `??` would have accepted "".
  assert.throws(() => resolveBase({ KNIJKA_BASE: "   " }), /KNIJKA_BASE is not set/);
  assert.throws(() => resolveBase({ KNIJKA_BASE: "" }), /KNIJKA_BASE is not set/);
});

test("no hardcoded hostname survives anywhere in the resolver", () => {
  // The literal is the defect. If anyone reintroduces one as a "sensible
  // default", this fails before it can drive 644 lanes at it.
  assert.throws(() => resolveBase({}), (error) => {
    assert.ok(
      !/trycloudflare\.com|https?:\/\/[a-z0-9-]+\.[a-z]{2,}/i.test(
        error.message.replace(/https:\/\/<host>/g, ""),
      ),
      `the refusal itself names a host that could be copy-pasted into service: ${error.message}`,
    );
    return true;
  });
});

test("an unreachable target is refused, and named as unreachable", async () => {
  // M5. Distinct from "unstamped" on purpose: "your dev server is not running"
  // and "your dev server cannot say what it is" have different remedies, and
  // collapsing them is the class of confusion this whole file exists to end.
  const stamp = await attestTarget({
    base: "http://127.0.0.1:1",
    tree: treeAt(SHA_A),
    env: {},
    fetchImpl: async () => {
      const e = new Error("connect ECONNREFUSED 127.0.0.1:1");
      e.cause = { code: "ECONNREFUSED" };
      throw e;
    },
  });
  assert.equal(stamp.attested, false);
  assert.equal(stamp.kind, TARGET_UNREACHABLE);
  assert.match(stamp.why, /could not be reached/);
});

test("a server that cannot name its build is refused — the live staging case", async () => {
  // M2, and the exact body measured off the hardcoded tunnel on 2026-08-19.
  // This is the one that matters most: it answers 200, it is healthy, it serves
  // the real product, and its frames are still not evidence.
  const stamp = await attestTarget({
    base: "https://icon-undertaken-earliest-zope.trycloudflare.com",
    tree: treeAt(SHA_A),
    env: {},
    fetchImpl: healthStub({ ok: true, probe: "readiness", commit: "unknown", uptimeSec: 116 }),
  });
  assert.equal(stamp.attested, false);
  assert.equal(stamp.kind, TARGET_UNSTAMPED);
  assert.match(stamp.why, /cannot say which build it is/);
  // And the refusal carries the evidence of itself, because the status file is
  // what a re-drive queue reads.
  assert.equal(stamp.commit, "unknown");
  assert.equal(stamp.expected, SHA_A);
  assert.equal(stamp.health.httpStatus, 200);
});

test("a missing commit field is refused exactly like \"unknown\"", async () => {
  // A tunnel's own 200 page, a different app on the port, a future health
  // shape that drops the field: all of them must land in the same refusal
  // rather than reading as "no objection".
  for (const body of [{ ok: true }, { ok: true, commit: "" }, { ok: true, commit: null }]) {
    const stamp = await attestTarget({
      base: "http://localhost:3000",
      tree: treeAt(SHA_A),
      env: {},
      fetchImpl: healthStub(body),
    });
    assert.equal(stamp.attested, false, `${JSON.stringify(body)} was credited`);
    assert.equal(stamp.kind, TARGET_UNSTAMPED);
  }
});

test("a target serving a DIFFERENT commit is refused, and both shas are named", async () => {
  // M3. The founder-facing version of this failure: a proof phase graded a
  // build whose fixes had never been deployed.
  const stamp = await attestTarget({
    base: "http://localhost:3000",
    tree: treeAt(SHA_A),
    env: {},
    fetchImpl: healthStub({ ok: true, commit: SHA_B }),
  });
  assert.equal(stamp.attested, false);
  assert.equal(stamp.kind, TARGET_MISMATCH);
  assert.match(stamp.why, new RegExp(SHA_B));
  assert.match(stamp.why, new RegExp(SHA_A));
});

test("with no HEAD and no declared expectation, there is nothing to check against", async () => {
  // Not a checkout, or no git. Refusing is right; silently crediting whatever
  // the server says would be the `??` defect with extra steps.
  const stamp = await attestTarget({
    base: "http://localhost:3000",
    tree: { head: null, dirty: false, dirtyCount: 0, dirtyPaths: [], worktree: null, gitAvailable: false },
    env: {},
    fetchImpl: healthStub({ ok: true, commit: SHA_B }),
  });
  assert.equal(stamp.attested, false);
  assert.equal(stamp.kind, TARGET_UNSTAMPED);
  assert.match(stamp.why, /KNIJKA_EXPECT_COMMIT/);
});

test("a body that is not this endpoint's JSON is refused, and quoted", async () => {
  // A tunnel error page, a login redirect, a 502 from the front. "invalid
  // JSON" would send someone to the wrong file; the first 160 characters send
  // them to the right one.
  const stamp = await attestTarget({
    base: "http://localhost:3000",
    tree: treeAt(SHA_A),
    env: {},
    fetchImpl: healthStub(null, { status: 502, text: "<html><title>Error 1033</title>" }),
  });
  assert.equal(stamp.attested, false);
  assert.equal(stamp.kind, TARGET_UNSTAMPED);
  assert.match(stamp.why, /Error 1033/);
});

// ── DRIVE: THE CASES A LOOSER CHECK WOULD REFUSE ───────────────────────────

test("the exact commit is attested", async () => {
  const stamp = await attestTarget({
    base: "http://localhost:3000",
    tree: treeAt(SHA_A),
    env: {},
    fetchImpl: healthStub({ ok: true, probe: "readiness", commit: SHA_A, uptimeSec: 503 }),
  });
  assert.equal(stamp.attested, true);
  assert.equal(stamp.kind, TARGET_ATTESTED);
  assert.equal(stamp.why, null);
  assert.equal(stamp.loopback, true);
  assert.equal(stamp.expectedFrom, "git HEAD");
});

test("a 503 because the local database is down still names its build, and is driven", async () => {
  // MEASURED on this box: with `prisma dev` stopped, localhost:3000 answered
  //   503 {"ok":false,…,"commit":"c72bcc27…","checks":{"db":{"ok":false,…}}}
  // Refusing on the status code would turn "start your database" into "I
  // cannot tell what build this is" — a false refusal, and a diagnosis pointing
  // at the wrong file. The DB's state is recorded and left to the drive to fail
  // on honestly, which it will.
  const stamp = await attestTarget({
    base: "http://localhost:3000",
    tree: treeAt(SHA_A),
    env: {},
    fetchImpl: healthStub(
      { ok: false, probe: "readiness", commit: SHA_A, checks: { db: { ok: false, error: "PrismaClientKnownRequestError" } } },
      { status: 503 },
    ),
  });
  assert.equal(stamp.attested, true);
  assert.equal(stamp.health.httpStatus, 503);
  assert.equal(stamp.health.checks.db.ok, false, "the DB failure must survive into the evidence");
});

test("a legitimately abbreviated sha is attested, not refused", async () => {
  // `git rev-parse --short HEAD` is 7-10 characters and a deploy may bake that.
  // Refusing it would be a false failure about a build that IS the right one.
  for (const short of [SHA_A.slice(0, 7), SHA_A.slice(0, 10), SHA_A.slice(0, 12)]) {
    const stamp = await attestTarget({
      base: "http://localhost:3000",
      tree: treeAt(SHA_A),
      env: {},
      fetchImpl: healthStub({ ok: true, commit: short }),
    });
    assert.equal(stamp.attested, true, `the deploy's ${short.length}-char sha was refused`);
  }
});

test("a DIRTY worktree is recorded, never refused — it is what every fix lane has", async () => {
  // The false-refusal direction that would have made this whole guard useless:
  // a lane's entire job is to drive an uncommitted fix. What is owed is a
  // stamp that does not pretend the tree is HEAD, not a refusal.
  const stamp = await attestTarget({
    base: "http://localhost:3000",
    tree: treeAt(SHA_A, { dirty: true }),
    env: {},
    fetchImpl: healthStub({ ok: true, commit: SHA_A }),
  });
  assert.equal(stamp.attested, true);
  assert.equal(stamp.dirty, true);
  assert.equal(stamp.dirtyCount, 3);
  assert.equal(stamp.worktree, "sha256:0123456789ab");
  // And the one-liner a human reads must not claim a clean tree.
  assert.match(describeTarget(stamp), /uncommitted path\(s\)/);
  assert.match(describeTarget(stamp), /sha256:0123456789ab/);
});

test("KNIJKA_EXPECT_COMMIT names a deployment deliberately, and outranks HEAD", async () => {
  // The ONLY escape hatch, and it is not a bypass: it swaps one named build for
  // another. There is no "whatever it says" setting, because that is the `??`.
  const stamp = await attestTarget({
    base: "https://staging.example",
    tree: treeAt(SHA_A),
    env: { KNIJKA_EXPECT_COMMIT: SHA_B },
    fetchImpl: healthStub({ ok: true, commit: SHA_B }),
  });
  assert.equal(stamp.attested, true);
  assert.equal(stamp.expected, SHA_B);
  assert.equal(stamp.expectedFrom, "KNIJKA_EXPECT_COMMIT");
  assert.equal(stamp.head, SHA_A, "the tree's own HEAD is still recorded beside it");
  assert.equal(stamp.loopback, false);

  // …and it cannot be used to wave through a host serving something else.
  const wrong = await attestTarget({
    base: "https://staging.example",
    tree: treeAt(SHA_A),
    env: { KNIJKA_EXPECT_COMMIT: SHA_B },
    fetchImpl: healthStub({ ok: true, commit: SHA_A }),
  });
  assert.equal(wrong.attested, false);
  assert.equal(wrong.kind, TARGET_MISMATCH);
});

// ── THE COMPARISON ITSELF ──────────────────────────────────────────────────

test("a 4-character coincidence is not a match", () => {
  // M4. Git's own uniqueness threshold is 7; anything shorter is a collision
  // waiting to be reported as a verified build.
  assert.equal(commitsAgree("a1b2", "a1b2c3d4e5f6"), false);
  assert.equal(commitsAgree("a1b2c3", SHA_A), false);
  assert.equal(commitsAgree("a1b2c3d", SHA_A), true, "7 characters is git's own threshold and must pass");
});

test("\"unknown\" is never equal to anything, including itself", () => {
  assert.equal(commitsAgree("unknown", "unknown"), false);
  assert.equal(commitsAgree("unknown", SHA_A), false);
  assert.equal(commitsAgree(null, null), false);
  assert.equal(commitsAgree("", ""), false);
  // Non-hex strings cannot name a commit, so "dev"/"dev" must not agree either.
  assert.equal(commitsAgree("dev", "dev"), false);
});

test("loopback is recognised, and recognising it relaxes nothing", async () => {
  assert.equal(isLoopback("http://localhost:3000"), true);
  assert.equal(isLoopback("http://127.0.0.1:3460"), true);
  assert.equal(isLoopback("https://icon-undertaken-earliest-zope.trycloudflare.com"), false);
  assert.equal(isLoopback("not a url"), false);
  // The point: a LOCAL server that says "unknown" is refused exactly like a
  // remote one. Being on this machine is not evidence about which build it is.
  const stamp = await attestTarget({
    base: "http://localhost:3000",
    tree: treeAt(SHA_A),
    env: {},
    fetchImpl: healthStub({ ok: true, commit: "unknown" }),
  });
  assert.equal(stamp.loopback, true);
  assert.equal(stamp.attested, false);
});

// ── THE PROBE ITSELF, AGAINST A REAL SOCKET ────────────────────────────────

test("probeHealth reads a real server, and times out rather than hanging", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    if (req.url === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, probe: "readiness", commit: SHA_A, uptimeSec: 7 }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const good = await probeHealth(`http://127.0.0.1:${port}`);
    assert.equal(good.reachable, true);
    assert.equal(good.commit, SHA_A);
    assert.equal(good.uptimeSec, 7);

    // A budget that expires is a refusal with a reason, never a hang — the
    // harness sits in front of a `next dev` whose first compile was MEASURED at
    // 258.8 s, so this path is reachable in normal use.
    const slow = createServer(() => {});
    await new Promise((r) => slow.listen(0, "127.0.0.1", r));
    const slowPort = slow.address().port;
    const t0 = Date.now();
    const timedOut = await probeHealth(`http://127.0.0.1:${slowPort}`, { timeoutMs: 300 });
    const spent = Date.now() - t0;
    slow.close();
    assert.equal(timedOut.reachable, false);
    assert.match(timedOut.why, /did not answer within/);
    assert.ok(spent < 5000, `the timeout did not bound the wait: ${spent}ms`);
  } finally {
    server.close();
  }
});

// ── THE TREE HALF ──────────────────────────────────────────────────────────

test("treeIdentity distinguishes a clean tree, a tracked edit and an untracked file", () => {
  // M6. A real throwaway repo, because the digest's whole job is to CHANGE when
  // the served source changes, and a stub cannot prove that.
  const repo = mkdtempSync(join(tmpdir(), "knijka-target-git-"));
  const g = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true });
  try {
    g("init", "-q");
    g("config", "user.email", "t@t.invalid");
    g("config", "user.name", "t");
    writeFileSync(join(repo, "a.txt"), "one\n");
    g("add", "-A");
    g("commit", "-qm", "one");

    const clean = treeIdentity(repo);
    assert.equal(clean.gitAvailable, true);
    assert.match(clean.head, /^[0-9a-f]{40}$/);
    assert.equal(clean.dirty, false);
    assert.equal(clean.worktree, null, "a clean tree has no worktree id — HEAD is the whole truth");
    assert.equal(clean.dirtyCount, 0);

    // A TRACKED EDIT MOVES THE DIGEST. This is the assertion M6 kills: a digest
    // over `git status --porcelain` alone cannot see a second edit to a file
    // that was already modified, so two different builds would share one id.
    writeFileSync(join(repo, "a.txt"), "two\n");
    const edited = treeIdentity(repo);
    assert.equal(edited.dirty, true);
    assert.equal(edited.head, clean.head, "an edit is not a commit");
    assert.match(edited.worktree, /^sha256:[0-9a-f]{12}$/);

    writeFileSync(join(repo, "a.txt"), "three\n");
    const editedAgain = treeIdentity(repo);
    assert.notEqual(
      editedAgain.worktree,
      edited.worktree,
      "two different edits to the same file share a worktree id — the digest is not reading content",
    );

    // An untracked file moves it too, by name.
    writeFileSync(join(repo, "b.txt"), "new\n");
    const withUntracked = treeIdentity(repo);
    assert.notEqual(withUntracked.worktree, editedAgain.worktree);
    assert.equal(withUntracked.dirtyCount, 2);

    // And going back to the committed state comes back to a clean id, so the
    // digest is a function of the tree and not of history.
    writeFileSync(join(repo, "a.txt"), "one\n");
    rmSync(join(repo, "b.txt"));
    assert.equal(treeIdentity(repo).worktree, null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("treeIdentity reports a directory that is not a checkout instead of throwing", () => {
  // A helper that throws here would turn a NAMED refusal into a stack trace out
  // of `lesson-audit.mjs` and cost the lane its diagnosis.
  const empty = mkdtempSync(join(tmpdir(), "knijka-target-nogit-"));
  try {
    const id = treeIdentity(empty);
    assert.equal(id.gitAvailable, false);
    assert.equal(id.head, null);
    assert.equal(id.worktree, null);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
