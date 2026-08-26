// -----------------------------------------------------------------------------
// wave-c-resume.test.mjs — A SWEEP MUST NOT REPORT COVERAGE OVER HOLES.
//
//   node --test tools/mobile/__tests__/wave-c-resume.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// WHAT THIS DEFENDS. `wave-c.mjs` resumes an interrupted sweep by skipping the
// (lesson, leg) pairs a previous run measured. For fifteen rounds the predicate
// was `j.head === HEAD` — the exit code was never read. So a drive that died at
// «loading-lesson» with zero frames counted as measured, permanently, and the
// only record that it had produced nothing was a line in a run.log nobody
// re-reads:
//
//     !! this lane produced no verdict of its own; RE-DRIVE it.
//
// On 2026-08-26 three drives of the 204-leg fill sweep crashed exactly that
// way. The sweep would have reported 204/204 with three holes in it, and two of
// the three carried findings that judges were adjudicating that hour — so the
// holes would have returned as UNJUDGED «no frame» and been recorded against
// the LESSON rather than against the harness.
//
// §1 is the line between a measurement and an absence of one.
// §2 is the regression exhibit: the three real rows, verbatim.
// §3 is the tail behaviour — an interrupted append must not re-drive the world.
// -----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import test from "node:test";

import { countsAsMeasured, measuredLegs } from "../lib/resume.mjs";

const HEAD = "2706813d7ebdd3f6102b1b709af97821baa4d8b2";
const OTHER = "ae4a4995c0a1b2c3d4e5f60718293a4b5c6d7e8f";
const row = (o) => ({ lesson: "sc-x", leg: "pc-right", head: HEAD, exit: 0, ...o });

test("§1 exit 0 and 1 are measurements; 2 and above never reached the lesson", () => {
  assert.equal(countsAsMeasured(row({ exit: 0 }), HEAD), true, "0 = judgeable");
  assert.equal(countsAsMeasured(row({ exit: 1 }), HEAD), true, "1 = drove, lost some evidence — still drove");

  for (const exit of [2, 3, 4, 5, 6]) {
    assert.equal(
      countsAsMeasured(row({ exit }), HEAD),
      false,
      `exit ${exit} never reached the lesson and must be re-driven`,
    );
  }
});

test("§1 a row from another build is not a measurement of this one", () => {
  assert.equal(countsAsMeasured(row({ head: OTHER }), HEAD), false);
  assert.equal(countsAsMeasured(row({ head: undefined }), HEAD), false);
  assert.equal(countsAsMeasured(null, HEAD), false);
});

test("§1 a missing exit field is not a measurement", () => {
  // Every row in the corpus carries a numeric exit (3,014 checked on
  // 2026-08-26), so nothing legacy is re-driven by this — but a row with no
  // exit at all cannot testify that it reached the lesson.
  assert.equal(countsAsMeasured(row({ exit: undefined }), HEAD), false);
  assert.equal(countsAsMeasured(row({ exit: "0" }), HEAD), false, "a string is not an exit code");
});

test("§2 the three drives that crashed on 2026-08-26 are re-driven, not skipped", () => {
  // Verbatim shape of the rows wave-c wrote for them.
  const ledger = [
    JSON.stringify({ lesson: "sc-vp-stall", leg: "mobile-wrong", head: HEAD, exit: 4, frames: 0, verdict: null }),
    JSON.stringify({ lesson: "sc-rx-tram-left", leg: "mobile-wrong", head: HEAD, exit: 4, frames: 0, verdict: null }),
    JSON.stringify({ lesson: "sc-follow-brake", leg: "mobile-right", head: HEAD, exit: 4, frames: 0, verdict: null }),
    JSON.stringify({ lesson: "sc-sp-curve", leg: "pc-wrong", head: HEAD, exit: 0, frames: 52, verdict: "НЕИЗДЪРЖАН" }),
  ].join("\n");

  const done = measuredLegs(ledger, HEAD);

  assert.equal(done.has("sc-vp-stall/mobile-wrong"), false);
  assert.equal(done.has("sc-rx-tram-left/mobile-wrong"), false);
  assert.equal(done.has("sc-follow-brake/mobile-right"), false);
  assert.equal(done.has("sc-sp-curve/pc-wrong"), true, "the drive that DID happen is still skipped");
  assert.equal(done.size, 1);
});

test("§3 a torn tail line is skipped, and does not cost the rows above it", () => {
  const good = JSON.stringify({ lesson: "sc-a", leg: "pc-right", head: HEAD, exit: 0 });
  const alsoGood = JSON.stringify({ lesson: "sc-b", leg: "pc-wrong", head: HEAD, exit: 0 });
  const torn = '{"lesson":"sc-c","leg":"pc-ri';

  const done = measuredLegs([good, alsoGood, torn].join("\n"), HEAD);

  assert.equal(done.has("sc-a/pc-right"), true);
  assert.equal(done.has("sc-b/pc-wrong"), true);
  assert.equal(done.size, 2, "an interrupted append is not a reason to re-drive the world");
});

test("§3 empty and absent input yield an empty set rather than throwing", () => {
  assert.equal(measuredLegs("", HEAD).size, 0);
  assert.equal(measuredLegs(null, HEAD).size, 0);
  assert.equal(measuredLegs(undefined, HEAD).size, 0);
  assert.equal(measuredLegs("\n\n  \n", HEAD).size, 0);
});
