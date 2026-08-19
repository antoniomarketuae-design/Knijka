// -----------------------------------------------------------------------------
// target.mjs — WHAT AM I MEASURING? The question the drive harness never asked.
//
// THE DEFECT, verbatim from `lesson-audit.mjs:189` before this file existed:
//
//     export const BASE =
//       process.env.KNIJKA_BASE ?? "https://icon-undertaken-earliest-zope.trycloudflare.com";
//
// With `KNIJKA_BASE` unset — how nearly every lane has invoked it — a drive
// measured STAGING, at whatever commit was last deployed there, over a tunnel
// hostname baked into source. It did not error. It returned EXIT_JUDGEABLE,
// real frames, a real debrief and a real verdict FOR A DIFFERENT BUILD.
//
// MEASURED 2026-08-19, before the fix, by fetching that literal URL:
//
//     GET https://icon-undertaken-earliest-zope.trycloudflare.com/api/health
//       -> 200 in 961 ms
//       {"ok":true,"probe":"readiness","commit":"unknown","uptimeSec":116, …}
//
// Two separate facts in one response, and the second is worse than the first:
//
//   1. THE HOST IS STILL ANSWERING. The trap is not stale — it is live, so a
//      lane that forgets the variable gets frames back rather than a connection
//      error, which is the only failure mode that would have been safe.
//   2. IT REPORTS ITS COMMIT AS "unknown". `/api/health` reads
//      `process.env.NEXT_PUBLIC_COMMIT_SHA || "unknown"` (see the route's own
//      header: "baked in at build time by the deploy"), so that deployment was
//      built without the stamp. Even a reader who thought to check WHICH build
//      the frames came from could not have been told.
//
// This is the failure this project keeps naming: an instrument that lies in the
// REASSURING direction. It has already been caught twice by accident — a gate
// drove sc-zebra-approach, passed both legs, and only then noticed `/api/health`
// saying "unknown" while the seven files it was gating were uncommitted.
//
// SO THE HARNESS NOW ANSWERS THE QUESTION BEFORE IT OPENS A BROWSER, and there
// are exactly two ways it can be answered:
//
//   · the server states its commit and it matches the tree under test  -> drive
//   · anything else                                                    -> REFUSE
//
// There is no third branch and no override that skips the check, because a
// skip flag is the hardcoded default wearing a different hat.
//
// ── THE OTHER DIRECTION, WHICH THIS FILE IS ALSO ACCOUNTABLE FOR ────────────
//
// A false refusal is as bad as a false certificate. A check that refused every
// local dev server would end the audit just as effectively as one that credits
// staging, so the local path is not merely permitted — it is MADE TO WORK, and
// the cost is written down:
//
//   `next dev` inherits `NEXT_PUBLIC_COMMIT_SHA` from its parent and serves it
//   back out of /api/health. MEASURED on this box, `next dev --port 3000`
//   spawned with NEXT_PUBLIC_COMMIT_SHA=$(git rev-parse HEAD):
//     "✓ Ready in 9.2s"  — and the first GET /api/health answered at t+258.8 s
//     {"commit":"c72bcc27cd90cb0ff810eeee113c2e86c2b792ea", …}
//   i.e. the stamp survives, and "Ready" is 250 seconds ahead of "can serve".
//   `lib/server.mjs` therefore sets the variable on every server it spawns, and
//   the timeout below is sized for that compile rather than for a warm host.
//
// ── WHAT A DEV SERVER ACTUALLY SERVES, AND THE HOLE THAT LEAVES ─────────────
//
// A commit sha is the whole truth for a BUILT deployment and only half of it
// for `next dev`, which serves the WORKING TREE. So the stamp carries the
// worktree state beside the sha: dirty or not, how many paths, and a digest
// over `git diff HEAD` + `git status --porcelain`.
//
// The digest is deliberately WHOLE-TREE rather than scoped to `platform/`.
// Scoping it would need me to be right about exactly which paths reach a served
// page, and being wrong there produces "same build" for two different builds —
// the reassuring direction. A whole-tree digest can only err the other way: it
// says "the tree moved" when an unrelated file changed, and doubt is the safe
// error for an instrument whose product is evidence.
//
// IT IS NOT A CONTENT HASH OF THE TREE, and the residue is stated rather than
// papered over: `git diff HEAD` covers TRACKED changes exactly, and untracked
// files appear in `git status --porcelain` BY NAME ONLY. Editing an untracked
// file between two drives leaves the digest unchanged. Closing that would mean
// reading arbitrary untracked content on a box where `.audit-frames/` holds
// 16,605 PNGs (it is gitignored, so `--porcelain` does not walk it, and that is
// exactly the walk a content hash would have to do).
//
// COST, measured on this 7200 rpm HDD at repo root, medians of five:
//   git rev-parse HEAD          60 ms
//   git status --porcelain     109 ms
//   git diff HEAD              109 ms
// ~280 ms once per lane, against a mobile drive measured in minutes.
// -----------------------------------------------------------------------------
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";

/** `KNIJKA_BASE` was not set. Nothing was measured and nothing should be. */
export const TARGET_UNSET = "unset";
/** The base answered nothing at all — wrong host, dead tunnel, server down. */
export const TARGET_UNREACHABLE = "unreachable";
/** It answered, but cannot say which build it is (`commit: "unknown"`). */
export const TARGET_UNSTAMPED = "unstamped";
/** It named a build, and that build is not the one under test. */
export const TARGET_MISMATCH = "mismatch";
/** We know what this is, and it is what we meant to measure. */
export const TARGET_ATTESTED = "attested";

/**
 * SIZED FOR A COLD `next dev`, NOT FOR A WARM HOST.
 *
 * 258.8 s was the measured wall-clock from spawn to the first answered
 * /api/health on this disk (see the header). A 30 s probe would refuse a
 * perfectly good local server for being slow, which is a false refusal — and
 * this project has already paid for one of those: `isUp()` in lib/server.mjs
 * used 2 s, declared a healthy server dead, and killed a whole sweep on
 * EADDRINUSE. Only the FIRST lane against a cold server pays this; the route is
 * compiled after that.
 */
export const HEALTH_TIMEOUT_MS = Number(process.env.KNIJKA_HEALTH_TIMEOUT_MS || 300_000);

/** How long before the probe says out loud that it is still waiting, so a
 *  four-minute compile does not read as a hang. */
const HEALTH_PATIENCE_MS = 30_000;

/** Git's own uniqueness threshold, and therefore the shortest abbreviation this
 *  file will accept as naming a commit. `git rev-parse --short` gives 7. */
const MIN_SHA_CHARS = 7;

/**
 * A base URL that was NAMED, or nothing.
 *
 * Throws rather than returning a fallback, because a fallback is the defect.
 * The message names the two ways to answer it, since the lane that hits this is
 * an agent reading stderr and nothing else.
 */
export function resolveBase(env = process.env) {
  const raw = (env.KNIJKA_BASE ?? "").trim();
  if (!raw) {
    const error = new Error(
      "KNIJKA_BASE is not set, so this run has no idea what it would be measuring.\n" +
        "  There is no default on purpose: the old one was a hardcoded quick-tunnel\n" +
        "  hostname, which both ROTATES and points at STAGING — a drive against it\n" +
        "  returns real frames and a real verdict for a build that is not yours.\n" +
        "  Set one of:\n" +
        "    KNIJKA_BASE=http://localhost:3000   (a dev server started from THIS tree;\n" +
        "                                         lib/server.mjs stamps the ones it spawns)\n" +
        "    KNIJKA_BASE=https://<host>          (a deployment — and then also set\n" +
        "                                         KNIJKA_EXPECT_COMMIT=<sha> to say which\n" +
        "                                         build you believe is on it)",
    );
    error.kind = TARGET_UNSET;
    throw error;
  }
  // A trailing slash makes `${BASE}/simulator` into `//simulator`, which WebKit
  // resolves as a protocol-relative URL to the host "simulator". Costs nothing
  // to strip and it is not the kind of failure anybody enjoys diagnosing.
  return raw.replace(/\/+$/, "");
}

/** Run git and hand back stdout, or null if git is absent / the call failed.
 *  Never throws: a box without git must produce a NAMED refusal further down,
 *  not a stack trace out of a helper. */
function git(args, cwd) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    // The whole tree's diff, not a truncated one — a digest over a clipped
    // buffer is a digest of the clip.
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

/**
 * WHICH TREE IS THIS, AS A THING THAT CAN BE COMPARED?
 *
 * Returns `{ head, dirty, dirtyCount, dirtyPaths, worktree, gitAvailable }`.
 * `worktree` is null on a clean tree and `"sha256:<12 hex>"` otherwise — see
 * the header for exactly what it covers and what it does not.
 *
 * `dirtyPaths` is capped at 20. The status file is read by a human at 3am and
 * a 400-path list is not information; the COUNT is always exact.
 */
export function treeIdentity(cwd = process.cwd()) {
  const head = git(["rev-parse", "HEAD"], cwd)?.trim() || null;
  if (head === null) {
    return { head: null, dirty: false, dirtyCount: 0, dirtyPaths: [], worktree: null, gitAvailable: false };
  }
  const porcelain = git(["status", "--porcelain"], cwd) ?? "";
  const diff = git(["diff", "HEAD"], cwd) ?? "";
  const lines = porcelain.split("\n").filter((l) => l.trim());
  const worktree =
    lines.length === 0 && diff.length === 0
      ? null
      : `sha256:${createHash("sha256").update(porcelain).update("\0").update(diff).digest("hex").slice(0, 12)}`;
  return {
    head,
    dirty: worktree !== null,
    dirtyCount: lines.length,
    dirtyPaths: lines.slice(0, 20).map((l) => l.trim()),
    worktree,
    gitAvailable: true,
  };
}

/**
 * Do these two strings name the same commit?
 *
 * Prefix-tolerant in one direction only: a deploy that bakes
 * `git rev-parse --short HEAD` publishes 7–10 chars, and refusing that would be
 * a false refusal about a build that IS the right one. Below 7 chars nothing is
 * accepted, because a 4-character "match" is a coincidence waiting to happen.
 * `"unknown"` is never equal to anything, including itself.
 */
export function commitsAgree(a, b) {
  if (!a || !b) return false;
  const x = String(a).trim().toLowerCase();
  const y = String(b).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(x) || !/^[0-9a-f]+$/.test(y)) return false;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  if (short.length < MIN_SHA_CHARS) return false;
  return long.startsWith(short);
}

/**
 * ONE GET, ON `node:http`, AND DELIBERATELY NOT ON GLOBAL `fetch`.
 *
 * THE MEASUREMENT THAT DECIDED THIS. The first version used global `fetch`, and
 * the refusal it exists to produce came out with the WRONG EXIT CODE — which is
 * the exact defect class this file was opened to end. Reproduced on this box,
 * node v24.18.0, Windows:
 *
 *     node -e "(async()=>{const r=await fetch(URL);await r.text();
 *              process.exit(6);})()"
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 *       file src\win\async.c, line 94
 *     EXIT=127
 *
 * A SUCCESSFUL global fetch leaves an undici client whose async handle is
 * mid-teardown, and `process.exit()` on top of it aborts the process — so
 * EXIT_TARGET_UNVERIFIED (6) reached the dispatcher as 127. Measured variants:
 *   · `connection: close` on the request      -> still 127
 *   · a FAILED fetch (host does not resolve)  -> exits 6 correctly, which is
 *     why every existing test of this harness's exit codes passed: they all use
 *     an `.invalid` host and never open a socket
 *   · `process.exitCode = 6` with no exit()   -> 6, correctly, in 204 ms
 *   · node:http/node:https with `agent:false` -> 6, correctly
 *
 * The last of those is the only one that is both correct AND lets the caller
 * stop where it decided to stop, so that is what this uses. It also removes any
 * dependence on the global dispatcher's keep-alive pool, which is shared with
 * whatever else the process has fetched.
 */
function requestJson(url, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      // `agent: false` — one socket, opened for this request and closed with
      // it. No pool to outlive the process's decision to end.
      { agent: false, headers: { "cache-control": "no-cache" }, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
          // A health endpoint answers a few hundred bytes. Anything past this
          // is a tunnel error page or the wrong service, and reading it whole
          // is how a probe turns into a download.
          if (body.length > 64 * 1024) {
            req.destroy();
            resolve({ status: res.statusCode, text: async () => body });
          }
        });
        res.on("end", () => resolve({ status: res.statusCode, text: async () => body }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => {
      const error = new Error("timeout");
      error.name = "AbortError";
      req.destroy(error);
    });
    req.on("error", reject);
  });
}

/** Is this base a server on this machine? Recorded, never used to relax a
 *  check — a local server that cannot name its build is refused exactly like a
 *  remote one. */
export function isLoopback(base) {
  try {
    const host = new URL(base).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * ASK THE SERVER WHAT IT IS.
 *
 * Returns `{ reachable, httpStatus, commit, ok, probe, uptimeSec, checks, why }`.
 * Never throws — every failure becomes a `why` a refusal can print.
 *
 * A NON-200 IS NOT A REASON TO STOP READING. `/api/health` answers 503 with a
 * FULL body when the database is down, and that body still names the commit.
 * Refusing to read it would turn "your dev DB is not running" into "I cannot
 * tell what build this is", which are two different problems with two different
 * remedies — and this file exists because those got conflated.
 */
export async function probeHealth(
  base,
  { fetchImpl = requestJson, timeoutMs = HEALTH_TIMEOUT_MS, note = () => {} } = {},
) {
  const url = `${base}/api/health`;
  const patience = setTimeout(() => {
    note(
      `  still waiting on ${url} after ${Math.round(HEALTH_PATIENCE_MS / 1000)}s — ` +
        `a cold \`next dev\` on this disk was MEASURED at 258.8 s to first answer, so this is not a hang yet ` +
        `(budget ${Math.round(timeoutMs / 1000)}s)`,
    );
  }, HEALTH_PATIENCE_MS);
  const started = Date.now();
  try {
    const res = await fetchImpl(url, { timeoutMs, headers: { "cache-control": "no-cache" } });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // An HTML error page, a tunnel's own 502, a login redirect. Whatever it
      // is, it is not this endpoint, and quoting it is more use than "invalid
      // JSON" — that is how the "unknown" incident was finally recognised.
      return {
        reachable: true,
        httpStatus: res.status,
        commit: null,
        ok: false,
        probe: null,
        uptimeSec: null,
        checks: null,
        latencyMs: Date.now() - started,
        why: `${url} answered ${res.status} with something that is not this endpoint's JSON: ${text.slice(0, 160).replace(/\s+/g, " ")}`,
      };
    }
    return {
      reachable: true,
      httpStatus: res.status,
      // `|| null`: the route already turns an empty stamp into "unknown", and
      // an absent field must not read as a commit either.
      commit: body?.commit || null,
      ok: body?.ok === true,
      probe: body?.probe ?? null,
      uptimeSec: body?.uptimeSec ?? null,
      checks: body?.checks ?? null,
      latencyMs: Date.now() - started,
      why: null,
    };
  } catch (error) {
    const aborted = error?.name === "AbortError" || /timeout|ETIMEDOUT/i.test(String(error?.message ?? ""));
    return {
      reachable: false,
      httpStatus: null,
      commit: null,
      ok: false,
      probe: null,
      uptimeSec: null,
      checks: null,
      latencyMs: Date.now() - started,
      why: aborted
        ? `${url} did not answer within ${Math.round(timeoutMs / 1000)}s`
        : `${url} could not be reached: ${String(error?.cause?.code ?? error?.message ?? error)}`,
    };
  } finally {
    clearTimeout(patience);
  }
}

/**
 * THE STAMP THAT GOES BESIDE THE FRAMES.
 *
 * `expected` is what this run REQUIRES the server to be:
 *   · `KNIJKA_EXPECT_COMMIT`, when a lane is deliberately driving a deployment
 *     and knows which build is on it, or
 *   · this tree's HEAD otherwise.
 * There is no "whatever it says" option. Naming the build you believe you are
 * measuring is the entire content of the check.
 *
 * Returns a plain object that is written into `_audit-status.json` as-is, so a
 * re-drive lane reading the folder eight weeks later can answer "what did these
 * pixels photograph?" without asking anybody.
 */
export async function attestTarget({
  base,
  tree,
  env = process.env,
  // `requestJson`, NOT global `fetch` — and this default is load-bearing, not
  // stylistic. It was `fetch` for one iteration and the live-tunnel self-check
  // came back EXIT=127 instead of EXIT=6 with the refusal printed correctly
  // above it: the message was right and the exit code, which is the only part a
  // dispatcher reads, was a lie. See `requestJson` for the measurement.
  fetchImpl = requestJson,
  timeoutMs = HEALTH_TIMEOUT_MS,
  note = () => {},
} = {}) {
  const declared = (env.KNIJKA_EXPECT_COMMIT ?? "").trim();
  const expected = declared || tree.head;
  const expectedFrom = declared ? "KNIJKA_EXPECT_COMMIT" : "git HEAD";
  const health = await probeHealth(base, { fetchImpl, timeoutMs, note });

  const stamp = {
    base,
    loopback: isLoopback(base),
    probedAt: new Date().toISOString(),
    commit: health.commit,
    expected: expected ?? null,
    expectedFrom,
    head: tree.head,
    dirty: tree.dirty,
    dirtyCount: tree.dirtyCount,
    dirtyPaths: tree.dirtyPaths,
    worktree: tree.worktree,
    health: {
      reachable: health.reachable,
      httpStatus: health.httpStatus,
      ok: health.ok,
      probe: health.probe,
      uptimeSec: health.uptimeSec,
      latencyMs: health.latencyMs,
      checks: health.checks,
    },
    attested: false,
    kind: null,
    why: null,
  };

  if (!health.reachable) {
    return { ...stamp, kind: TARGET_UNREACHABLE, why: health.why };
  }
  if (!expected) {
    // git is missing or this is not a checkout, and nobody said what to expect.
    return {
      ...stamp,
      kind: TARGET_UNSTAMPED,
      why:
        `there is no commit to check ${base} against: \`git rev-parse HEAD\` produced nothing here` +
        ` and KNIJKA_EXPECT_COMMIT is not set. Set KNIJKA_EXPECT_COMMIT=<sha> to name the build you mean.`,
    };
  }
  if (!health.commit || health.commit === "unknown") {
    return {
      ...stamp,
      kind: TARGET_UNSTAMPED,
      why:
        `${base}/api/health reports commit ${JSON.stringify(health.commit ?? null)}` +
        `${health.why ? ` (${health.why})` : ""} — this server cannot say which build it is, so its frames` +
        ` cannot say what they photographed. Build it with NEXT_PUBLIC_COMMIT_SHA set` +
        ` (lib/server.mjs does this for servers it spawns).`,
    };
  }
  if (!commitsAgree(health.commit, expected)) {
    return {
      ...stamp,
      kind: TARGET_MISMATCH,
      why:
        `${base} is serving commit ${health.commit}, and this run requires ${expected} (${expectedFrom}).` +
        ` Frames from it would be evidence about a different build.`,
    };
  }
  return { ...stamp, attested: true, kind: TARGET_ATTESTED, why: null };
}

/** One line a human can read, for the log and for the loud refusal. */
export function describeTarget(stamp) {
  const where = `${stamp.base}${stamp.loopback ? " (this machine)" : ""}`;
  const build = stamp.commit ? stamp.commit.slice(0, 12) : "UNNAMED";
  const tree = stamp.dirty
    ? `HEAD ${String(stamp.head ?? "?").slice(0, 12)} + ${stamp.dirtyCount} uncommitted path(s), worktree ${stamp.worktree}`
    : `HEAD ${String(stamp.head ?? "?").slice(0, 12)}, clean`;
  return `${where} · serving ${build} · tree ${tree}`;
}
