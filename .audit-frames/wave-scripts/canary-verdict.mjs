// What the canary must show before a 211-drive fleet is dispatched.
//
// Reads only fields that are actually recorded. See the block in
// sweep-preflight.sh for why the previous condition (`reachedVerdictCard` out of
// wave-c-results.jsonl) could never be true.
//
// ── THE PILL LIST IS NOT WRITTEN HERE ANY MORE — 2026-09-19 ────────────────
//
// This file held its own array of THREE verdict pills and rejected anything
// else. ADR-009 (founder Ruling A) added a FOURTH, «НЕ Е ВЗЕТ»: in a practice
// scenario lesson, committing the mistake the lesson exists to teach refuses
// the lesson while the изпитен лист stays clean, so the product needed a word
// that is neither «Издържан» nor «Неиздържан». `driveline.mjs classifyVerdict`
// learned it and `lesson-audit.mjs:567` says "Four pills since ADR-009" — one
// copy of the list knew and this one did not, because nothing compared them.
//
// WHAT THAT COST, MEASURED TODAY, not argued:
//   · `.audit-frames/w51/wave-c-results.jsonl` — 11 rows, of which
//     «НЕ Е ВЗЕТ» x5, «ИЗДЪРЖАН» x3, «НЕИЗДЪРЖАН» x3. Five of eleven legs read
//     the pill this file called impossible.
//   · Re-running sweep-preflight.sh's own canary picker over
//     waveC-redrive.json + .audit-frames/w*/ resolves TODAY to
//     sc-follow-tailgater / mobile-wrong, last recorded in w51 as
//     verdict «НЕ Е ВЗЕТ», exit 0 — precisely a leg the old list rejected.
//   · Fed that row, the old file printed:
//       FAIL — verdict=НЕ Е ВЗЕТ is not one of the three pills | …
//     and sweep-preflight.sh turns that into «do NOT dispatch». A healthy
//     server, a healthy database and a correctly graded drive, refused.
//
// So the list is no longer copied. `classifyVerdict` is the harness's one
// classifier for this field — the same function `lesson-audit.mjs` buckets
// every sweep row with — and a verdict is a pill here exactly when that
// function does not call it "unknown". A fifth product state therefore cannot
// be known to the sweep and unknown to its canary: there is one place to teach.
// `canary-pills.test.mjs` keys BOTH of them to the product's own
// SESSION_VERDICT_LABEL_BG so the pair cannot drift from the thing they
// describe either.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyVerdict } from "../../tools/mobile/lib/driveline.mjs";

/**
 * True when `verdict` is one of the product's end-of-session pills.
 *
 * NOT a widening of the old whole-string equality: `classifyVerdict` also
 * matches WHOLE strings (the file's own comment explains why — «НЕИЗДЪРЖАН»
 * contains «ИЗДЪРЖАН», so a substring test scores every failure as a pass, in
 * the reassuring direction). It differs only by trimming and collapsing runs of
 * whitespace first, which is the same normalisation `lesson-audit.mjs` `t()`
 * has already applied to the pill text before it is recorded. Anything outside
 * the four — null, "", "(none)", the catalogue's «взето», a paywall — is still
 * "unknown", and is still rejected.
 */
export function isPill(verdict) {
  return classifyVerdict(verdict) !== "unknown";
}

function main() {
  const DIR = process.env.CANARY_DIR;
  if (!DIR) { console.log("NO-DIR"); return; }
  const results = path.join(DIR, "wave-c-results.jsonl");
  if (!fs.existsSync(results)) { console.log("NO-RESULTS — the canary wrote nothing, so it did not drive"); return; }
  const lines = fs.readFileSync(results, "utf8").trim().split("\n").filter(Boolean);
  if (lines.length !== 1) { console.log("EXPECTED-ONE-ROW-GOT-" + lines.length); return; }

  const r = JSON.parse(lines[0]);
  const why = [];
  if (r.exit !== 0) why.push("exit=" + r.exit);
  // The message names the CLASSIFIER rather than a count of pills, because the
  // old text ("is not one of the three pills") is what a reader trusted while
  // there were four.
  if (!isPill(r.verdict)) why.push("verdict=" + r.verdict + " is not a product verdict pill (driveline classifyVerdict says «unknown») — not a graded drive");
  if (!(r.frames > 0)) why.push("frames=" + r.frames);
  if (r.treeMoved) why.push("the worktree moved during the drive");

  // Stronger, when the lane wrote a status file: this is the original intent.
  const lane = path.join(DIR, "frames", r.lesson + "__" + r.leg, "_audit-status.json");
  let card = "(no status file)";
  if (fs.existsSync(lane)) {
    try {
      const st = JSON.parse(fs.readFileSync(lane, "utf8"));
      card = String(st.reachedVerdictCard);
      if (st.reachedVerdictCard !== true) why.push("reachedVerdictCard=" + st.reachedVerdictCard + " in _audit-status.json");
    } catch { why.push("_audit-status.json did not parse"); }
  }

  const summary = r.verdict + " | exit=" + r.exit + " | frames=" + r.frames + " | reachedVerdictCard=" + card;
  console.log((why.length ? "FAIL — " + why.join("; ") + " | " : "OK — ") + summary);
}

// RUN ONLY WHEN RUN, so that importing this module has no side effect.
//
// The previous file had no guard: its body ran at import time and reached
// `process.exit(0)` when CANARY_DIR was unset. MEASURED 2026-09-19 — a test
// that imported it was torn down mid-collection and printed «ℹ pass 1 ℹ fail 0»,
// green, over the very drift it was written to catch. `canary-pills.test.mjs`
// now SPAWNS this file rather than importing it, which is the stronger test
// anyway (it is what sweep-preflight.sh does), and this guard is what keeps an
// import harmless for whoever reaches for `isPill` next.
//
// Compared as RESOLVED PATHS, not as URLs: sweep-preflight.sh
// invokes this with the absolute path "E:/AI driver/.audit-frames/…", whose
// space encodes to %20 in one form and not the other, and a guard that fails to
// match here prints NOTHING — which sweep-preflight.sh reads as a refusal (its
// `case "$V" in OK*)` falls through to fail), so it would be fail-CLOSED but it
// would also stop every sweep. Proven by executing the preflight's own command
// line, not by reading this comment.
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs && invokedAs === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
