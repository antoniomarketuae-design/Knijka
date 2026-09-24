// -----------------------------------------------------------------------------
// road-criteria-cheats.test.mjs — THE TWELVE CHEATING LEGS, REBUILT AS AN
// INDEPENDENT FIXTURE AND MEASURED AGAINST THE MODULE AS IT IS ON DISK.
//
//   node --test tools/mobile/__tests__/road-criteria-cheats.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// WHY IT EXISTS, AND WHY IT IS A SECOND FILE RATHER THAN MORE CASES IN THE
// FIRST. Lane B of the road-criteria wave got ten synthetic legs to read
// `LEG = pass` against an earlier revision of tools/mobile/lib/road-criteria.mjs
// and filed them as rows 62-71 of .audit-frames/findings/chunk-wavec-new.jsonl
// (bucket INSTRUMENT — defects in the AUDIT TOOL, never in the product, and
// correctly absent from the open product list). Those fixtures then DIED: they
// lived in a session temp directory that did not survive an account switch, and
// the only surviving executable controls for the same ten cheats live inside
// road-criteria.test.mjs — the module's OWN suite.
//
// Row 70 says why that is not enough, in its own words: "A NEXT WAVE SHOULD
// REBUILD AN INDEPENDENT KNOWN-GOOD FIXTURE OUTSIDE THAT SUITE before treating
// these ten as settled, because every number above except the ten refusals now
// comes from the same file that is being judged." This file is that outside.
// It shares no builder, no constant and no helper with road-criteria.test.mjs;
// it imports only the module's public API and rebuilds every row from the
// recipe written into the ledger rows, so a rewrite of the module's own suite
// cannot quietly take these controls with it.
//
// WHAT IT PINS. EVERY leg here is RED at the revision measured below, and each
// test asserts the red verdict AND the number that produced it, so a later
// "fix" that reds a cheat by widening a threshold fails here: N12 is asserted
// to be convicted while its excluded fraction stays UNDER the ceiling, N1 and
// N15a are asserted to be convicted while `convictingRuns` stays 0, N15b is
// asserted to be refused while BOTH pre-existing ceilings are asserted NOT to
// bind, and the known-good leg is asserted green in the same file. A criterion
// set that reds everything is not a criterion set — so a one-way leg carrying a
// witness the product would have billed is asserted to PASS, beside the ones
// that do not.
//
// WHAT IT DOES NOT DO. It does not drive, does not start a server, does not
// read .audit-frames, does not touch platform/src, and CLOSES NO FINDING. The
// open list read 94 / 38 critical before it was written and reads 94 after.
//
// MEASURED AGAINST the module as it stands beside this file. Every number here
// was produced by running these exact fixtures against it; the sha is
// deliberately NOT pinned in this comment, because the two previous revisions
// each pinned one and each was stale within the session that wrote it (rows
// 62-69 were measured at 2b8601c4a21b069d / 915 lines, rows 70-71 at
// 2e31e3dfe924c8fc / 1548 lines, this file's first version at 1494fb47… / 1549
// lines, its second at 7f257128… / 1872 lines). NO LINE NUMBER IN THOSE ROWS
// DESCRIBES THIS FILE'S SUBJECT — the rows say so themselves ("Re-find each
// anchor by the quoted code, never by the number"). What this file rebuilds is
// the MECHANISM descriptions and the fixture recipe; nothing here trusts one of
// their line numbers, and `node --test` is what says whether it is current.
//
// ONE CHEAT IN THIS FILE IS STILL LIVE, AND IT IS ASSERTED AT THE VERDICT IT
// GETS. An earlier header said "NO CHEAT IN THIS FILE IS STILL LIVE" and it was
// not true even of the legs already in the file: a third adversarial pass
// rebuilt them from outside and got FOURTEEN more to read `LEG = pass`. Twelve
// were closed then; the two that were not were pinned as L8 and L9, with a
// `pass` asserted on purpose so that a later repair REDS THIS FILE and makes
// whoever writes it come back and rewrite the disclosure. That is exactly what
// happened to L9.
//
//   L9 IS RETIRED (2026-09-24, module R18). It was ROW 71 REOPENED: the witness
//   floor was defeated by SHORTENING THE CALIBRATION PARK, because the floor
//   and the declared-removal budget met only at that leg's own 5.00 s figure.
//   The founder-ruled signed travel-direction value retired the floor itself,
//   and with it the thing the trade bought — an acquittal of 1230 ticks nobody
//   had measured. The four measured lines are still RUN, in the test that now
//   records the retirement, together with the arithmetic that makes the trade
//   zero-sum. L7 in the module header went the same way.
//
//   L8 IS STILL LIVE: a leg can spend two surfaces' budgets and stay under the
//   ceiling its own surface mix affords. It is disclosed rather than closed
//   because the arithmetic is honest — every run really is separately lawful —
//   and redding it would take a chosen number wearing a derivation.
//
// AND N15b IS NOT "FIXED", IT IS RE-MEASURED. Its leg — 1240 ambiguous ticks
// bought by one declared wrong-way second — now PASSES, and that is the right
// answer, because with the signed value those 1240 ticks state their own
// direction and the leg is honest. The test asserts the re-measurement in BOTH
// directions: with the signal they count as with-the-flow positively, and with
// the signal STRIPPED the very same rows go UNKNOWN and the leg cannot testify.
// A cheat that stops being a cheat because the evidence arrived is not a
// loosened rule, but it looks exactly like one from a diff, which is why the
// stripped half is in the same test rather than somewhere else.
//
// WHAT ELSE IS STILL LIVE IS DISCLOSED IN THE MODULE: L1-L9 of
// road-criteria.mjs, of which L6, L7 and L9 are now marked retired. The SEAM
// test at the bottom of this file has been rewritten as the record of what the
// signal replaced — it was written to fail when the value landed, and it did.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import test from "node:test";

import {
  EXCLUDED_FRACTION_CEILING,
  PRODUCT,
  SURFACE,
  assessLeg,
  declaredSpansHash,
  surfaceAgainstFlowFracCeiling,
} from "../lib/road-criteria.mjs";

/* ────────────────────────────────────────────────────────────────────────────
 * THE FIXTURE — LANE B's KNOWN-GOOD LEG, REBUILT FROM THE LEDGER ROW.
 *
 * Verbatim from rows 62-67, which all carry the same recipe: "1260 rows at
 * 20 Hz — seq i, tSec i/20, wallMs 50i, edgeId \"e1\", oneway false,
 * laneLinesPainted true, speedKmh 30, gear 1, worldEdgeClearanceM 2,
 * laneOffsetM 1.00 for seq 0..99 then 0.35 + 0.55·|sin(0.037·i)|; declared {
 * channels:[\"opposingBank\"], calibration:{fromSeq:0,toSeq:99,offsetM:1.0},
 * curvedSpans:[{fromSeq:400,toSeq:1200}], expectedSpanMs:62950 }."
 *
 * ONE THING IS ADDED THAT THE ROWS DO NOT CARRY, and row 71 is why: the
 * rewritten module makes `declared.spansHash` REQUIRED, and lane B's fixture
 * predated it, which made lane B's own known-good leg read `unresolved` and
 * made it mis-read N15b's refusal as the criteria catching the cheat. Every
 * declaration here goes through `pin()`.
 *
 * NO Math.random ANYWHERE. The wander is a closed-form sine of the row index,
 * so every number below is reproducible from this file alone.
 * ──────────────────────────────────────────────────────────────────────────*/

const HZ = 20;
const ROWS = 1260;
const PERIOD_MS = 1000 / HZ; // 50

/** `laneOffsetM` — the 100-tick calibration park at 1.00 m, then the wander. */
function laneOffsetAt(i) {
  return i < 100 ? 1.0 : 0.35 + 0.55 * Math.abs(Math.sin(0.037 * i));
}

/** A fresh copy every call: a fixture shared between tests is a fixture one test can edit. */
function goodRows() {
  return Array.from({ length: ROWS }, (_, i) => ({
    seq: i,
    tSec: i / HZ,
    wallMs: PERIOD_MS * i,
    edgeId: "e1",
    oneway: false,
    laneLinesPainted: true,
    speedKmh: 30,
    gear: 1,
    worldEdgeClearanceM: 2,
    laneOffsetM: laneOffsetAt(i),
  }));
}

/* ── THE FOUNDER-RULED DIRECTION SIGNAL, IN FIXTURE FORM (ruling 2026-09-20,
 *    read by the criteria since R18). Every one-way fixture below states which
 *    way the car faced with a SIGNED nose-vs-edge angle instead of leaning on
 *    `wrongWay: false`, which means «with the flow» OR «nobody asked» and is
 *    therefore not a statement at all. ─────────────────────────────────────*/

/** Well inside the product's WRONG_WAY_ANGLE_DEG (120°): facing along the edge. */
const ALIGNED_DEG = 4.0;
/** Well past it — and NEGATIVE on purpose, so a reader that loses the sign by
 *  taking a raw magnitude somewhere reads it as the most aligned tick there is. */
const OPPOSED_DEG = -172.0;

/**
 * Stamp the direction record onto a one-way row, IN PLACE.
 *
 * `wrongWay` is set beside it because a real probe publishes both and they
 * agree where the channel is armed (`wrongWay === (armed && |deg| > 120)`,
 * rules/types.ts `EdgeAlignment.deg`). Tests that need them to DISAGREE — the
 * whole point of the ruling — say so themselves.
 */
function faceRow(row, against) {
  row.wrongWay = against;
  row.alignDeg = against ? OPPOSED_DEG : ALIGNED_DEG;
  row.wrongWayArmed = true;
  row.alignEdgeId = row.edgeId;
  row.alignTravelDir = 1; // locator returns +1 unconditionally on a one-way
  row.alignRoundabout = true;
  row.alignOffCarriageway = false;
  return row;
}

/** Strip the signal back out, leaving the RETIRED DIALECT: `wrongWay` alone. */
function unfaceRow(row) {
  delete row.alignDeg;
  delete row.wrongWayArmed;
  delete row.alignEdgeId;
  delete row.alignTravelDir;
  delete row.alignRoundabout;
  delete row.alignOffCarriageway;
  return row;
}

/**
 * `expectedSpanMs` 62950 is the DRIVER'S clock, not the record's: 1259 steps ×
 * 50 ms. AC-RECORD compares it against `rows.length × wallPeriodMs` = 63000 ms,
 * so the known-good leg is 50 ms short of its own declaration and passes — the
 * refusal needs `laneKeepSustainSec` (3000 ms) of unsampled time.
 */
const GOOD_DECLARED = {
  channels: ["opposingBank"],
  calibration: { fromSeq: 0, toSeq: 99, offsetM: 1.0 },
  curvedSpans: [{ fromSeq: 400, toSeq: 1200 }],
  expectedSpanMs: 62950,
};

/** The content pin the harness must compute BEFORE it drives (§DECLARED). */
function pin(declared) {
  return { ...declared, spansHash: declaredSpansHash(declared) };
}

/**
 * Durations here accumulate binary-float residue (measured: the fixture's own
 * median TICK period is 0.050000000000000266 s, while its WALL period is
 * exactly 0.05 because `wallMs` is integral). A DURATION is compared with this;
 * a count, a verdict or a threshold is compared exactly, because a tolerance on
 * those would be a loosened test rather than honest arithmetic.
 */
function near(actual, expected, tol = 1e-6) {
  assert.ok(
    typeof actual === "number" && Math.abs(actual - expected) <= tol,
    `${actual} is not within ${tol} of ${expected}`,
  );
}

/** Unpacks one leg into the four criteria plus the two surfaces, named. */
function judge(rows, declared) {
  const leg = assessLeg({ rows, declared: pin(declared) });
  const flow = leg.criteria["AC-FLOW"];
  return {
    leg,
    verdict: leg.verdict,
    record: leg.criteria["AC-RECORD"],
    referent: leg.criteria["AC-REFERENT"],
    flow,
    lane: leg.criteria["AC-LANE"],
    twoWay: flow.surfaces[SURFACE.TWO_WAY],
    oneWay: flow.surfaces[SURFACE.ONE_WAY],
    reasons: leg.reasons,
  };
}

/** Asserts at least one reason mentions `needle`, and says what it saw if not. */
function reasonMentioning(reasons, needle) {
  const hit = reasons.find((r) => r.includes(needle));
  assert.ok(hit, `no reason contained ${JSON.stringify(needle)}; reasons were:\n  ${reasons.join("\n  ")}`);
  return hit;
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE CONTROL. It runs FIRST and it must stay green: it is the only thing
 * standing between "the cheats are red" and "everything is red".
 * ──────────────────────────────────────────────────────────────────────────*/

test("KNOWN-GOOD LEG (lane B's, rebuilt outside the module's own suite): every criterion passes", () => {
  const j = judge(goodRows(), GOOD_DECLARED);

  assert.equal(j.verdict, "pass");
  assert.equal(j.record.verdict, "pass");
  assert.equal(j.referent.verdict, "pass");
  assert.equal(j.flow.verdict, "pass");
  assert.equal(j.lane.verdict, "pass");

  // The numbers rows 62-67 all quote for this leg, re-measured here.
  assert.equal(j.lane.counts.curvedTicksTotal, 801);
  assert.equal(j.lane.counts.gradedTicks, 801);
  assert.equal(j.lane.counts.sampleFloor, 180);
  near(j.lane.metrics.tickRateHz, 20);
  near(j.lane.metrics.p90AbsOffsetM, 0.8925050383594872, 1e-12);
  assert.equal(j.lane.metrics.excludedFrac, 0);
  assert.equal(j.lane.metrics.longestExcursionSec, 0);
  assert.equal(j.lane.metrics.cumulativeExcursionSec, 0);
  assert.equal(j.twoWay.counts.denominator, 1260);
  assert.equal(j.twoWay.counts.againstFlowTicks, 0);
  near(j.referent.metrics.spreadM, 0.6018654965448778, 1e-12);

  // The declaration is inside its own budget: one removal span, 5.00 s of a
  // 62.95 s leg = 0.0794 of it, against a ceiling of 0.1 and a count ceiling of
  // floor(62.95 / speedingRearmSec 4) = 15.
  assert.equal(j.flow.counts.declaredRemovalSpans, 1);
  assert.equal(j.flow.counts.declaredSpanCountCeiling, 15);
  near(j.flow.metrics.declaredRemovedWallSec, 5.0, 1e-9);
  near(j.flow.metrics.declaredRemovedFrac, 0.07942811755361398, 1e-12);

  // AC-RECORD's two clocks, both clean, and the coverage arithmetic.
  assert.equal(j.record.counts.droppedTicks, 0);
  assert.equal(j.record.metrics.longestWallGapMs, 50);
  assert.equal(j.record.metrics.gapBlindWallMs, 0);
  assert.equal(j.record.metrics.coveredWallMs, 63000);
  assert.equal(j.record.metrics.driverWallSpanMs, 62950);
  assert.equal(j.record.metrics.unsampledWallMs, 0);
  // …and the two clocks agree, which is the control for the rule that reds
  // CLOCK-ONLY-a and CLOCK-ONLY-b below.
  near(j.record.metrics.simAdvanceSec, 62.95, 1e-9);
  near(j.record.metrics.wallAdvanceSec, 62.95, 1e-9);
  assert.ok(j.record.metrics.clockDisagreementSec < 1e-9);

  // A leg that passes may testify, and only about the surface it drove on.
  assert.deepEqual(j.flow.surfacesJudged, [SURFACE.TWO_WAY]);
  assert.deepEqual(j.leg.testimony.mayTestify, ["lane position on twoWay"]);
});

/* ────────────────────────────────────────────────────────────────────────────
 * MECHANISM 1 — SUB-THRESHOLD ALTERNATION (rows 62 and 68).
 * ──────────────────────────────────────────────────────────────────────────*/

test("N1 (row 62, two-way): 11-on/1-off alternation is convicted by the FRACTION rule, not the run rule", () => {
  const rows = goodRows();
  // Row 62: "set opposingBank true on seq 0..399 except every 12th row —
  // deliberately OUTSIDE the declared curved span so AC-LANE is untouched".
  let marked = 0;
  for (let i = 0; i < 400; i++) {
    if (i % 12 !== 11) {
      rows[i].opposingBank = true;
      marked++;
    }
  }
  assert.equal(marked, 367);

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "fail");
  assert.equal(j.flow.verdict, "fail");
  assert.equal(j.twoWay.verdict, "fail");

  assert.equal(j.twoWay.counts.denominator, 1260);
  assert.equal(j.twoWay.counts.againstFlowTicks, 367);
  near(j.twoWay.metrics.againstFlowFrac, 0.2912698412698413, 1e-12);
  near(j.twoWay.metrics.againstFlowFracCeiling, 0.13043478260869565, 1e-12);

  // THE WIDENING-PROOF HALF. The run rule still does not fire — every run is
  // 0.550 s against a 0.6 s clock — so this conviction cannot be undone by
  // moving `solidLineCrossSustainSec`, and re-deriving the ceiling from a
  // different constant would show up as a changed number right here.
  assert.equal(j.twoWay.counts.undeclaredRuns, 34);
  near(j.twoWay.metrics.longestUndeclaredRunSec, 0.55, 1e-9);
  assert.equal(j.twoWay.counts.convictingRuns, 0);
  near(
    j.twoWay.metrics.againstFlowFracCeiling,
    surfaceAgainstFlowFracCeiling(SURFACE.TWO_WAY),
    0,
  );
  reasonMentioning(j.reasons, "the highest duty cycle reachable with runs that are each separately lawful");

  // The cheat was placed outside the curved span on purpose, so that the
  // conviction is provably the FLOW rule's. The isolation is asserted by what
  // AC-LANE says rather than by its verdict, because from the revision that
  // made the exclusion ceiling leg-wide AC-LANE sees these rows too: 275 of the
  // 367 wrong-bank ticks fall outside the declared calibration span, and an
  // `opposingBank: true` tick is an excluded tick wherever it lands.
  assert.equal(j.lane.counts.gradedTicks, 801, "the curved BUCKET is untouched");
  assert.equal(j.lane.metrics.excludedFrac, 0, "and nothing was excluded inside it");
  assert.equal(
    j.lane.metrics.p90AbsOffsetM,
    judge(goodRows(), GOOD_DECLARED).lane.metrics.p90AbsOffsetM,
    "the lane-holding STATISTIC is byte-identical to the known-good leg's",
  );
  // AC-LANE's only complaint is the leg-wide exclusion count — never a
  // lane-holding claim, which is what would have made the conviction ambiguous.
  assert.deepEqual(
    j.lane.reasons.map((r) => r.split(" ")[0]),
    ["(leg"],
    j.lane.reasons.join("\n"),
  );
  reasonMentioning(j.lane.reasons, "over the WHOLE leg");
});

test("N15a (rows 62 and 68, one-way ring): the same alternation is convicted against the ONE-WAY clock", () => {
  const rows = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  // Row 62: "every row oneway true, wrongWay chopped 11-on/1-off across seq
  // 400..1199, declared channels [\"wrongWay\"]".
  //
  // THE LAWFUL TICK IN EACH BLOCK SAYS SO, and must. `flowRuns` bridges UNKNOWN
  // ticks on purpose, so a fixture that gave the offending ticks a signed angle
  // and left the lawful one speaking the retired dialect would fuse 67 lawful
  // runs into one bridged run and convict on LENGTH — retiring the fraction
  // ceiling this control exists to exercise without anyone noticing.
  let marked = 0;
  for (let i = 400; i < 1200; i++) {
    if (i % 12 !== 11) {
      faceRow(rows[i], true);
      marked++;
    }
  }
  // 733, not lane B's 734: the exclusion phase differs by one tick because
  // 400 % 12 === 4, so the first excluded index inside the span is 407 and the
  // last is 1199 — 67 excluded of 800. The run count (67) and the run length
  // (0.550 s) are lane B's exactly; only the phase moved.
  assert.equal(marked, 733);

  const j = judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] });

  assert.equal(j.verdict, "fail");
  assert.equal(j.oneWay.verdict, "fail");
  assert.equal(j.oneWay.counts.denominator, 1260);
  assert.equal(j.oneWay.counts.againstFlowTicks, 733);
  near(j.oneWay.metrics.againstFlowFrac, 0.5817460317460318, 1e-12);
  near(j.oneWay.metrics.againstFlowFracCeiling, 0.2727272727272727, 1e-12);

  // The one-way clock is `wrongWaySustainSec` 1.5 s, NOT the two-way 0.6 s, so
  // this surface's ceiling must differ from N1's. If a future edit collapses
  // the two surfaces back onto one clock, these two lines disagree.
  near(j.oneWay.metrics.sustainSec, PRODUCT.WRONG_WAY_SUSTAIN_SEC, 0);
  assert.notEqual(
    surfaceAgainstFlowFracCeiling(SURFACE.ONE_WAY),
    surfaceAgainstFlowFracCeiling(SURFACE.TWO_WAY),
  );

  assert.equal(j.oneWay.counts.undeclaredRuns, 67);
  near(j.oneWay.metrics.longestUndeclaredRunSec, 0.55, 1e-9);
  assert.equal(j.oneWay.counts.convictingRuns, 0);

  // ROW 68 IS CLOSED HERE, and this is what it looks like closed. It read: the
  // predicate that ARMS the one-way channel and the predicate that COUNTS the
  // offence are the same filter, so the channel can only ever be armed by the
  // offence it exists to detect. Under the ruling every tick states its own
  // direction, so the arming question is gone — NOTHING on this surface is
  // unknown, and the 67 lawful ticks are lawful POSITIVELY rather than by
  // failing to be an offence.
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(j.oneWay.counts.denominator - j.oneWay.counts.againstFlowTicks, 527);

  assert.deepEqual(j.flow.surfacesJudged, []);
  assert.deepEqual(j.leg.testimony.mayTestify, []);
});

/* ────────────────────────────────────────────────────────────────────────────
 * N15b — THE ONE CHEAT THAT IS STILL LIVE (row 71).
 * ──────────────────────────────────────────────────────────────────────────*/

/**
 * N15b's leg: every row one-way, `wrongWay: false` everywhere except a witness
 * of `witnessTicks` ticks starting at seq 200, declared as one manoeuvre span.
 *
 * `calTo` is the calibration park's last seq, and it is a PARAMETER because the
 * squeeze below is arithmetic between two budgets: the calibration park and the
 * witness are both declared REMOVALS, and they share one ceiling.
 */
function ringLeg(witnessTicks, calTo = 99, { signal = true } = {}) {
  const rows = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  // Row 71's REPAIRED fixture: the witness is moved clear of the calibration
  // park (lane B's first attempt overlapped it at seq 0..19 and the module
  // refused the overlap, which row 70 mis-read as the criteria catching this).
  for (let i = 200; i < 200 + witnessTicks; i++) faceRow(rows[i], true);
  // `signal: false` is the RETIRED DIALECT — `wrongWay` and nothing else, which
  // is every record written before probe version 3. It is kept so the same leg
  // can be judged both ways, which is what shows the pass is bought by the
  // SIGNAL and not by a rule that was loosened.
  if (!signal) for (const r of rows) unfaceRow(r);
  return {
    rows,
    declared: {
      ...GOOD_DECLARED,
      channels: ["wrongWay"],
      calibration: { fromSeq: 0, toSeq: calTo, offsetM: 1.0 },
      manoeuvreSpans: [{ fromSeq: 200, toSeq: 200 + witnessTicks - 1 }],
    },
  };
}

test("N15b (row 71) RE-MEASURED: the 1240 ticks are with-the-flow POSITIVELY, and the leg is HONESTLY a pass", () => {
  // WHAT ROW 71 WAS. 1260 one-way ticks, 20 of them (1.0 s) declared wrong-way
  // at seq 200..219, the other 1240 carrying `wrongWay: false`. It read
  // LEG = pass and certified mayTestify ["lane position on oneWay"], and that
  // WAS a cheat: `false` meant «with the flow» OR «nobody asked»
  // (worldRuntime.ts:2306-2312), so one declared second of the offence bought
  // 62 s nobody had measured.
  //
  // WHAT IT IS NOW, AND WHY THE ANSWER CHANGED WITHOUT THE RULE BEING LOOSENED.
  // The founder ruled the signed value on 2026-09-20; the probe carries it and
  // R18 reads it. The same 1240 ticks now SAY they faced along the edge, so the
  // leg is honest and pass is the correct verdict. The old defences — the
  // liveness gate and R7/R12's witness floor — refused it only because nobody
  // could tell those ticks from unmeasured ones, and every one of them could be
  // satisfied by the offence itself (N15a's row-68 identity).
  //
  // THIS TEST IS THEREFORE NOT "N15b DELETED". It is N15b RE-MEASURED, and it
  // asserts the re-measurement IN BOTH DIRECTIONS: with the signal the 1240
  // count as with-the-flow POSITIVELY, and with the signal STRIPPED the very
  // same rows go UNKNOWN and the leg cannot testify. The second half is what
  // keeps the first from being a fixture edited until it passed.
  const { rows, declared } = ringLeg(20);
  const j = judge(rows, declared);

  // ── THE 1240, COUNTED. Not one of them is unknown, and not one is against
  // the flow — which is a statement the record MAKES, not one it fails to deny.
  assert.equal(rows.filter((r) => r.wrongWay === false).length, 1240);
  assert.equal(
    rows.filter((r) => r.wrongWay === false && Math.abs(r.alignDeg) <= PRODUCT.WRONG_WAY_ANGLE_DEG)
      .length,
    1240,
    "every one of the 1240 carries a signed angle inside the product's own threshold",
  );
  assert.equal(j.oneWay.counts.denominator, 1260);
  assert.equal(j.oneWay.counts.againstFlowTicks, 20);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(j.oneWay.metrics.discriminatorUnknownFrac, 0);
  assert.equal(
    j.oneWay.counts.denominator - j.oneWay.counts.againstFlowTicks,
    1240,
    "the 1240 are IN the denominator and OUT of the numerator, positively",
  );

  // ── THE VERDICT: pass, on the one-way surface and on the leg.
  assert.equal(j.oneWay.verdict, "pass", j.oneWay.reasons.join("\n"));
  assert.equal(j.verdict, "pass", j.reasons.join("\n"));
  assert.deepEqual(j.flow.surfacesJudged, [SURFACE.ONE_WAY]);
  assert.deepEqual(j.leg.testimony.mayTestify, ["lane position on oneWay"]);

  // ── AND EVERY NUMBER ROW 71 MEASURED IS UNCHANGED, so this is the same leg
  // and not a fixture that quietly moved. The declaration still acquits the
  // offence; nothing convicts on length; both standing ceilings are still slack
  // and are asserted slack, so a later edit that reds this by widening one of
  // them fails here rather than passing quietly.
  near(j.oneWay.metrics.againstFlowFrac, 0.015873015873015872, 1e-12);
  assert.equal(j.oneWay.counts.declaredManoeuvreRuns, 1);
  assert.equal(j.oneWay.counts.declaredManoeuvreTicks, 20);
  assert.equal(j.oneWay.counts.undeclaredRuns, 0);
  assert.equal(j.oneWay.counts.convictingRuns, 0);
  assert.ok(j.oneWay.metrics.againstFlowFrac < j.oneWay.metrics.againstFlowFracCeiling);
  near(j.flow.metrics.declaredRemovedWallSec, 6.0, 1e-9);
  near(j.flow.metrics.declaredRemovedFrac, 0.09531374106433677, 1e-12);
  assert.ok(j.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);

  // ── THE METRICS THE FLOOR READ ARE GONE, not merely unread. A published
  // number with no consumer is the defect this whole programme is named for.
  assert.equal(j.oneWay.metrics.longestWitnessRunSec, undefined);
  assert.equal(j.oneWay.metrics.longestContiguousWitnessSec, undefined);

  // ── STRIP THE SIGNAL AND THE SAME LEG CANNOT TESTIFY. This is the half that
  // makes the pass above mean something: the rows are identical except for the
  // direction record, and without it 1240 of 1260 ticks are UNKNOWN.
  const stripped = ringLeg(20, 99, { signal: false });
  const k = judge(stripped.rows, stripped.declared);
  assert.equal(
    stripped.rows.filter((r) => r.alignDeg !== undefined).length,
    0,
    "the retired dialect: the boolean and nothing else",
  );
  assert.equal(k.oneWay.counts.denominator, 1260);
  assert.equal(
    k.oneWay.counts.againstFlowTicks,
    20,
    "`true` is still unambiguous and still convicts",
  );
  assert.equal(k.oneWay.counts.discriminatorUnknownTicks, 1240);
  near(k.oneWay.metrics.discriminatorUnknownFrac, 1240 / 1260, 1e-12);
  assert.ok(k.oneWay.metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(k.oneWay.verdict, "unresolved");
  assert.equal(k.verdict, "unresolved");
  assert.deepEqual(k.flow.surfacesJudged, []);
  assert.deepEqual(k.leg.testimony.mayTestify, []);
  reasonMentioning(k.reasons, "the discriminator was not answered often enough");
});

test("N15b's squeeze is RETIRED, and what is left is the budget and the product's clock", () => {
  // WHAT STOOD HERE: "NO witness length passes this leg — the floor and the
  // budget meet with no gap". It swept 1..40 witness ticks and asserted not one
  // of them passed. That was true, and it was the RIGHT answer only while the
  // surrounding 1240 ticks were unreadable. With the signal the leg is honest,
  // so most of that sweep must now pass — and the sweep is kept, run and
  // asserted TICK BY TICK rather than deleted, because two rules do still bound
  // the declaration and the boundary between them is worth pinning.
  //
  // EVERY LINE BELOW WAS RUN, not reasoned about. The calibration park spends
  // 5.00 s of the 6.295 s declared-removal budget (0.1 × 62.95 s), so:
  //
  //   1..25  (≤1.25 s)     the declaration holds                    → pass
  //   26..29 (1.30-1.45 s) budget broken, spans STRIPPED, but the exposed run
  //                        is under wrongWaySustainSec, so the SURFACE passes
  //                        and §DECLARED refuses the LEG          → unresolved
  //   30..40 (≥1.50 s)     stripped AND at or above the product's clock → fail
  const at = (n) => {
    const { rows, declared } = ringLeg(n);
    return judge(rows, declared);
  };

  // 25 ticks = 1.25 s. Inside the budget (6.25/62.95 = 0.0993 < 0.1), declared,
  // acquitted — and the leg PASSES, which under the floor it could not.
  const w25 = at(25);
  near(w25.flow.metrics.declaredRemovedFrac, 0.09928514694201747, 1e-12);
  assert.ok(w25.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);
  assert.equal(w25.oneWay.counts.declaredManoeuvreRuns, 1, "the declaration still stands");
  assert.equal(w25.oneWay.verdict, "pass", w25.oneWay.reasons.join("\n"));
  assert.equal(w25.verdict, "pass", w25.reasons.join("\n"));

  // 26 ticks = 1.30 s. The first length PAST the budget (6.30/62.95 = 0.10008),
  // so §DECLARED strips the spans. THE BUDGET STILL BITES — that rule was never
  // about the direction signal, and if a later edit lets an over-budget
  // declaration through, this is where it is caught.
  const w26 = at(26);
  near(w26.flow.metrics.declaredRemovedFrac, 0.1000794281175536, 1e-12);
  assert.ok(w26.flow.metrics.declaredRemovedFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(w26.oneWay.counts.declaredManoeuvreRuns, 0, "the declaration is stripped");
  assert.equal(w26.oneWay.counts.undeclaredRuns, 1);
  assert.equal(w26.oneWay.counts.convictingRuns, 0, "1.30 s is under the product's clock");
  assert.notEqual(w26.verdict, "pass");
  reasonMentioning(w26.reasons, "gets no larger allowance");

  // 30 ticks = 1.50 s. Stripped AND at the product's own arming clock, so it
  // convicts as an undeclared run. The conviction rule is untouched by R18.
  const w30 = at(30);
  assert.equal(w30.oneWay.verdict, "fail");
  assert.equal(w30.oneWay.counts.convictingRuns, 1);
  near(w30.oneWay.metrics.longestUndeclaredRunSec, 1.5, 1e-9);
  assert.equal(w30.verdict, "fail");

  // THE WHOLE RANGE, executed, at the verdict each one GETS.
  for (let n = 1; n <= 40; n++) {
    const j = at(n);
    const expected = n <= 25 ? "pass" : n <= 29 ? "unresolved" : "fail";
    assert.equal(j.verdict, expected, `witness of ${n} tick(s): ${j.reasons.join(" | ")}`);
  }

  // …AND THE SAME SWEEP WITH THE SIGNAL STRIPPED CANNOT CLEAR THE LEG AT ANY
  // LENGTH, which is the pre-ruling answer and is still the right one for a
  // record that cannot say which way the car faced.
  for (let n = 1; n <= 40; n++) {
    const { rows, declared } = ringLeg(n, 99, { signal: false });
    assert.notEqual(
      judge(rows, declared).verdict,
      "pass",
      `a ${n}-tick witness must not buy a leg that never states its direction`,
    );
  }
});

test("…AND THE ONE-WAY SURFACE CAN STILL BE CONVICTED: the offence is read off the SIGNAL", () => {
  // A criterion set that passes everything is not a criterion set either. The
  // same fixture with the witness UNDECLARED and long enough to reach the
  // engine's own arming clock is a conviction, and the numerator it is
  // convicted on comes from `alignDeg` — 30 ticks whose nose is 172° off the
  // edge, in a forward gear.
  const { rows, declared } = ringLeg(30, 59);
  const bare = { ...declared, manoeuvreSpans: [] };
  const j = judge(rows, bare);

  assert.equal(j.oneWay.counts.againstFlowTicks, 30);
  assert.equal(j.oneWay.counts.declaredManoeuvreRuns, 0);
  assert.equal(j.oneWay.counts.convictingRuns, 1);
  near(j.oneWay.metrics.longestUndeclaredRunSec, 1.5, 1e-9);
  assert.equal(j.oneWay.verdict, "fail", j.oneWay.reasons.join("\n"));
  assert.equal(j.verdict, "fail");
  reasonMentioning(j.reasons, "wrongWaySustainSec");

  // …and DECLARED, the same 30 ticks are acquitted and the leg passes, so the
  // declaration is what excludes them and not the discriminator going quiet.
  const k = judge(rows, declared);
  assert.equal(k.verdict, "pass", k.reasons.join("\n"));
  assert.equal(k.oneWay.counts.declaredManoeuvreRuns, 1);
  assert.equal(k.oneWay.counts.declaredManoeuvreTicks, 30);
  assert.equal(k.oneWay.counts.convictingRuns, 0);
  near(k.flow.metrics.declaredRemovedWallSec, 4.5, 1e-9);
  near(k.flow.metrics.declaredRemovedFrac, 0.07148530579825257, 1e-12);
  assert.deepEqual(k.flow.surfacesJudged, [SURFACE.ONE_WAY]);
  assert.deepEqual(k.leg.testimony.mayTestify, ["lane position on oneWay"]);
});

test("THE PRODUCT'S 120° IS THE THRESHOLD, AND A LAWFUL REVERSE IS NOT AN OFFENCE", () => {
  // Two things the boolean could never have been asked, both now load-bearing.
  //
  // 1. THE ANGLE IS THE PRODUCT'S. worldRuntime.ts:279
  //    `export const WRONG_WAY_ANGLE_DEG = 120`, applied at worldRuntime.ts:705
  //    as `Math.abs(signedDeltaDeg(…)) > WRONG_WAY_ANGLE_DEG` — STRICTLY
  //    greater, so the boundary tick is lawful. A harness that picked 90 would
  //    convict a leg the engine clears, while still looking like it was reading
  //    the product's own signal. The drift test reads the number back out of
  //    platform/src; this asserts the criteria APPLY the number they mirror.
  const face = (deg, gear = 1) => {
    const rows = goodRows().map((r) => faceRow({ ...r, oneway: true, gear }, false));
    for (const r of rows) r.alignDeg = deg;
    return judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  };
  const at = PRODUCT.WRONG_WAY_ANGLE_DEG;
  assert.equal(face(at).oneWay.counts.againstFlowTicks, 0, "exactly 120° is not against the flow");
  assert.equal(face(-at).oneWay.counts.againstFlowTicks, 0);
  assert.equal(face(95).oneWay.counts.againstFlowTicks, 0, "and 95° is lawful under 120");
  assert.equal(face(95).oneWay.verdict, "pass");
  assert.equal(face(at + 0.5).oneWay.counts.againstFlowTicks, 1260);
  assert.equal(face(-(at + 0.5)).oneWay.counts.againstFlowTicks, 1260);
  assert.equal(face(at + 0.5).oneWay.verdict, "fail");

  // 2. IT MEASURES THE NOSE. `SimTick.speedKmh` is unsigned, so `gear` is the
  //    only channel that says WHICH WAY along its own axis the car is going —
  //    and `speedKmh` is the only one that says whether it is going anywhere at
  //    all. Both are needed: reading the gear without the speed convicted every
  //    stopped-in-reverse tick, which is N18 below. A car backing
  //    lawfully along its own lane reads |deg| ≈ 180 on EVERY frame
  //    (rules/types.ts `EdgeAlignment.deg`, measured in edge-alignment.test.ts
  //    §7). A criterion that reads the angle as a direction of travel convicts
  //    every correct reverse manoeuvre — and the instrument this record exists
  //    for covers the reverse/park half.
  const rev = face(-179.0, -1);
  assert.equal(rev.oneWay.counts.againstFlowTicks, 0, "the NOSE is backwards; the TRAVEL is not");
  assert.equal(rev.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(rev.oneWay.verdict, "pass", rev.oneWay.reasons.join("\n"));
  // …the same angle in a forward gear IS the offence…
  assert.equal(face(-179.0, 1).oneWay.counts.againstFlowTicks, 1260);
  // …and a reverse that is genuinely against the flow — nose along the edge
  // while backing down it — is convicted, so the rotation is a rotation and not
  // a blanket amnesty for gear −1.
  assert.equal(face(2.0, -1).oneWay.counts.againstFlowTicks, 1260);
  assert.equal(face(2.0, -1).oneWay.verdict, "fail");

  // 3. THE ROTATION MUST WRAP, and BOTH SIGNS of a lawful reverse must survive
  //    it. `deg` is (-180, +180], so a car backing along its lane reads −179 on
  //    one frame and +179 on the next as the nose jitters across antiparallel.
  //    `+179 + 180 = 359`, and a consumer that thresholds that raw — no modulo —
  //    convicts the frame it just cleared, from a half-degree of steering. This
  //    line is why the normalisation is there and not an ornament.
  const revPlus = face(179.0, -1);
  assert.equal(revPlus.oneWay.counts.againstFlowTicks, 0, "+179 in reverse is the SAME frame");
  assert.equal(revPlus.oneWay.verdict, "pass", revPlus.oneWay.reasons.join("\n"));
  assert.equal(face(140.0, -1).oneWay.counts.againstFlowTicks, 0, "140 in reverse travels at −40");
  assert.equal(face(-140.0, -1).oneWay.counts.againstFlowTicks, 0);

  // 4. ONLY `gear === -1` ROTATES. `rules/types.ts` says it in one line —
  //    „`gear === -1` ⇒ the car TRAVELS at `deg ± 180`" — and says nothing about
  //    any other gear, so nothing else may rotate. A car STOPPED facing the
  //    wrong way up a one-way street is against the flow, and this file counts
  //    slow and stationary against-flow ticks rather than excluding them (C1,
  //    C2). A consumer that rotated on `gear !== 1` would acquit it silently,
  //    and the acquittal would look exactly like the lawful reverse above.
  const parked = face(-172.0, 0);
  assert.equal(parked.oneWay.counts.againstFlowTicks, 1260, "gear 0 is not reverse");
  assert.equal(parked.oneWay.counts.slowAgainstFlowTicks, 0, "…and the fixture is still moving");
  assert.equal(parked.oneWay.verdict, "fail", parked.oneWay.reasons.join("\n"));
  const neutralish = face(-172.0, 2);
  assert.equal(neutralish.oneWay.counts.againstFlowTicks, 1260, "nor is any forward gear");
});

/**
 * N18's leg: the whole record one-way and lawful, with a window in the middle
 * where the car is STOPPED WITH REVERSE SELECTED and its nose still along the
 * edge. That is the opening state of every reverse manoeuvre — stop, select R,
 * then move — and nothing else about the leg changes.
 *
 * 40 ticks = 2.00 s, chosen between two clocks so the window cannot be excused
 * by either: it is past `wrongWaySustainSec` 1.5 s, so a discriminator that
 * convicts it produces a REAL conviction rather than a sub-threshold blip, and
 * it is under `laneKeepSustainSec` 3.0 s, so AC-LANE's contiguous-excluded-run
 * rule does not fire and the leg's verdict is AC-FLOW's to give.
 */
function stoppedInReverseLeg(fromSeq = 600, ticks = 40) {
  const rows = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  for (let i = fromSeq; i < fromSeq + ticks; i++) {
    rows[i].gear = -1;
    rows[i].speedKmh = 0;
  }
  return { rows, declared: { ...GOOD_DECLARED, channels: ["wrongWay"] } };
}

test("N18: a car STOPPED in reverse was convicted of driving against the flow", () => {
  // THE DEFECT, REBUILT FROM OUTSIDE THE MODULE. The one-way discriminator
  // rotated the nose angle by 180° whenever `gear === -1`, with no reference to
  // MOTION. A car standing still in reverse with its nose 4° off the edge
  // therefore read |travel| = 176° > 120° on every tick, and 2.00 s of it
  // convicted the surface at the product's own 1.5 s clock — while the run's
  // own census sat there saying all 40 ticks were slow and all 40 in reverse,
  // read by nothing.
  //
  // THE PRODUCT CONVICTS NOTHING ON THOSE TICKS. `wrongWay` is a heading
  // verdict (`armed && |deg| > 120`), and the heading is 4°.
  const { rows, declared } = stoppedInReverseLeg();
  const j = judge(rows, declared);

  assert.equal(j.oneWay.counts.stationaryReverseTicks, 40);
  assert.equal(j.oneWay.counts.againstFlowTicks, 0, "a stopped car travels in no direction");
  assert.equal(j.oneWay.counts.convictingRuns, 0);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0, "ANSWERED, not shrugged at");
  assert.equal(j.oneWay.verdict, "pass", j.oneWay.reasons.join("\n"));
  assert.equal(j.verdict, "pass", j.reasons.join("\n"));

  // THE DENOMINATOR IS UNTOUCHED. Surface membership is `edgeId != null &&
  // oneway === true`, a POSITION, and it is true of a stopped car; making it
  // depend on speed would be C1 with one more step, emptying the very
  // denominator the crawl has to be measured against.
  assert.equal(j.oneWay.counts.denominator, 1260);

  // WHILE THE CAR IS STOPPED, THE VERDICT MUST NOT MOVE WITH THE GEAR LEVER.
  for (const gear of [-1, 0, 1]) {
    const g = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
    for (let i = 600; i < 640; i++) {
      g[i].gear = gear;
      g[i].speedKmh = 0;
    }
    const k = judge(g, declared);
    assert.equal(k.oneWay.counts.againstFlowTicks, 0, "gear " + gear + " stopped");
    assert.equal(k.oneWay.verdict, "pass");
  }

  // AND IT IS NOT AN AMNESTY FOR gear −1. A car stopped FACING the wrong way up
  // a one-way street is against the flow: the heading is read unrotated, which
  // is what the product reads too. Slow and reverse ticks are COUNTED (C1, C2).
  const back = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  for (let i = 600; i < 640; i++) {
    faceRow(back[i], true); // nose 172° off the edge, and `wrongWay` agrees
    back[i].gear = -1;
    back[i].speedKmh = 0;
  }
  const b = judge(back, declared);
  assert.equal(b.oneWay.counts.directionContradictionRows, 0, "the record is self-consistent");
  assert.equal(b.oneWay.counts.againstFlowTicks, 40);
  assert.equal(b.oneWay.counts.slowAgainstFlowTicks, 40);
  assert.equal(b.oneWay.counts.reverseAgainstFlowTicks, 40);
  assert.equal(b.oneWay.counts.convictingRuns, 1);
  assert.equal(b.oneWay.verdict, "fail", b.oneWay.reasons.join("\n"));

  // THE PREDICATE IS `speedKmh > 0`, NOT THE ENGINE'S `moving` (5 km/h). A
  // controller backing the wrong way down a one-way street at 4.9 km/h IS
  // travelling backwards and the rotation is owed to it — a 5 km/h floor in
  // this numerator is C1 and C2 exactly, the draft defect this file exists for.
  const crawl = goodRows().map((r) => {
    const q = faceRow({ ...r, oneway: true }, false);
    q.gear = -1;
    q.speedKmh = 4.9;
    q.alignDeg = 1.5;
    return q;
  });
  const c = judge(crawl, declared);
  assert.equal(c.oneWay.counts.stationaryReverseTicks, 0, "4.9 km/h is moving, just not GRADED");
  assert.equal(c.oneWay.counts.againstFlowTicks, 1260);
  assert.equal(c.oneWay.counts.slowAgainstFlowTicks, 1260);
  assert.equal(c.oneWay.verdict, "fail", c.oneWay.reasons.join("\n"));

  // A REVERSE TICK WITH NO SPEED IS UNKNOWN, NOT ZERO — the record cannot be
  // asked which way it travelled. A FORWARD tick never needed the speed.
  const noSpeed = goodRows().map((r) => {
    const q = faceRow({ ...r, oneway: true }, false);
    q.gear = -1;
    delete q.speedKmh;
    return q;
  });
  const n = judge(noSpeed, declared);
  assert.equal(n.oneWay.counts.discriminatorUnknownTicks, 1260);
  assert.equal(n.oneWay.counts.againstFlowTicks, 0);
  assert.equal(n.oneWay.verdict, "unresolved", n.oneWay.reasons.join("\n"));
  reasonMentioning(n.oneWay.reasons, "is unknown on");
});

test("N18b: a leg that NEVER MOVED still may not testify, and AC-LANE is what says so", () => {
  // The rule above reads a stopped car's HEADING, so a leg parked on a one-way
  // edge with its nose along it reads a genuinely clean AC-FLOW. A parked car
  // is also 0 m from its route, and this programme has twice drawn a false
  // conclusion from exactly that. The refusal is AC-LANE's — `isGradable`
  // carries the engine's own `moving` — and it is asserted here so a later edit
  // to AC-LANE reds this file too.
  const rows = goodRows().map((r) => {
    const q = faceRow({ ...r, oneway: true }, false);
    q.speedKmh = 0;
    q.gear = -1;
    return q;
  });
  const j = judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] });

  assert.equal(j.oneWay.counts.stationaryReverseTicks, 1260);
  assert.equal(j.oneWay.counts.againstFlowTicks, 0);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(j.oneWay.verdict, "pass", "AC-FLOW is honestly clean, and that is not enough");

  assert.equal(j.lane.counts.legGradedTicks, 0);
  assert.equal(j.lane.metrics.legExcludedFrac, 1);
  assert.equal(j.lane.verdict, "unresolved", j.lane.reasons.join("\n"));
  assert.notEqual(j.verdict, "pass");
  assert.deepEqual(j.leg.testimony.mayTestify, []);
});

test("N19: the RETIRED DIALECT can still convict — the ceiling refuses an acquittal, not a conviction", () => {
  // THE UNDISCLOSED REGRESSION R18 SHIPPED. The unknown-fraction ceiling
  // early-returned `unresolved`, so it refused CONVICTIONS as well as
  // acquittals. On a pre-signal record — `wrongWay` and no `alignDeg` at all —
  // every tick that is not a positive `true` is UNKNOWN, so the unknown
  // fraction is 1 − (offence density), and clearing a 0.1 ceiling would have
  // taken a leg that spent NINE TENTHS of its one-way surface driving the wrong
  // way. The old dialect had lost the ability to convict at any realistic
  // offence density, while the comment at the site said the opposite.
  //
  // The asymmetry is this file's own doctrine: the claim that needs evidence is
  // that the car was FINE in the dark. A conviction is read off ticks that
  // POSITIVELY say `true`, and the fraction rule can only be DILUTED by
  // unknowns, never inflated by them, because they land in its denominator.
  const { rows, declared } = ringLeg(30, 99, { signal: false });
  const bare = { ...declared, manoeuvreSpans: [] };
  const j = judge(rows, bare);

  assert.equal(rows.filter((r) => r.alignDeg !== undefined).length, 0, "the pre-signal dialect");
  assert.equal(j.oneWay.counts.againstFlowTicks, 30, "1.50 s, at the product's own clock");
  assert.ok(j.oneWay.metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(j.oneWay.counts.convictingRuns, 1);
  assert.equal(j.oneWay.verdict, "fail", j.oneWay.reasons.join("\n"));
  // BOTH reasons are published: a reader of a failing dark record still learns
  // the record was dark.
  reasonMentioning(j.oneWay.reasons, "is unknown on");
  reasonMentioning(j.oneWay.reasons, "undeclared against-flow run");

  // …and the SAME dark record with the offence taken out cannot ACQUIT, which
  // is the half of the rule that was never in question.
  const lawful = rows.map((r) => ({ ...r, wrongWay: false }));
  const k = judge(lawful, bare);
  assert.equal(k.oneWay.counts.againstFlowTicks, 0);
  assert.equal(k.oneWay.counts.discriminatorUnknownTicks, 1260);
  assert.equal(k.oneWay.verdict, "unresolved", k.oneWay.reasons.join("\n"));
  assert.deepEqual(k.flow.surfacesJudged, []);
  assert.deepEqual(k.leg.testimony.mayTestify, []);
});

test("N20: the unknown-fraction ceiling applies EXCLUDED_FRACTION_CEILING, at the boundary", () => {
  // THE CEILING'S VALUE AT THIS USE SITE. Since R18 deleted the liveness gate
  // and the witness floor this rule is the ONLY defence against a dark one-way
  // record, and loosening it fivefold here left both suites green. The constant
  // is a declared JUDGEMENT (module L4) and nothing can derive it; what a test
  // can do is prove the rule applies THIS number, strictly, on both sides.
  const mk = (nUnknown) => {
    const rows = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
    for (let i = 0; i < nUnknown; i++) rows[i].alignDeg = null;
    return judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] }).oneWay;
  };
  const denominator = mk(0).counts.denominator;
  assert.equal(denominator, ROWS);

  const at = Math.round(EXCLUDED_FRACTION_CEILING * denominator);
  assert.equal(at, 126);
  const atCeiling = mk(at);
  assert.equal(atCeiling.counts.discriminatorUnknownTicks, at);
  near(atCeiling.metrics.discriminatorUnknownFrac, EXCLUDED_FRACTION_CEILING, 1e-12);
  assert.equal(atCeiling.verdict, "pass", "exactly AT the ceiling is not OVER it");

  const over = mk(at + 1);
  assert.ok(over.metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(over.verdict, "unresolved", over.reasons.join("\n"));
  reasonMentioning(over.reasons, "> " + EXCLUDED_FRACTION_CEILING);
});

test("THE SIGNAL ANSWERS WHERE THE BOOLEAN WAS NEVER ARMED — the founder's own sentence, executed", () => {
  // `wrongWay === false` means «correct OR nobody asked», and the ruling was to
  // publish the direction ANYWAY so that a tick on which the conviction channel
  // is DISARMED still says which way the car faced. This leg carries the signed
  // value and carries NO `wrongWay` at all — which is not contrived:
  // worldRuntime.ts disarms the channel when the district states no one-way
  // streets and the edge is not a ring, and when the car is off the
  // carriageway, and `roadRecordOf` copies the boolean only when the tick
  // defines it.
  //
  // UNDER THE RETIRED DIALECT THIS LEG WAS UNRESOLVED and could never be
  // anything else: the liveness gate had no way to tell a silent channel from a
  // clean drive, so the only leg it could clear was one that had driven the
  // wrong way. THIS is the test that dies if someone puts the boolean back as
  // the discriminator.
  const rows = goodRows().map((r) => {
    const q = faceRow({ ...r, oneway: true }, false);
    q.wrongWayArmed = false;
    delete q.wrongWay;
    return q;
  });
  const j = judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] });

  assert.equal(rows.filter((r) => r.wrongWay !== undefined).length, 0, "the boolean is absent");
  assert.equal(j.oneWay.counts.denominator, 1260);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0, "and yet nothing is unknown");
  assert.equal(j.oneWay.counts.againstFlowTicks, 0);
  assert.equal(j.oneWay.counts.discriminatorTrueTicks, 0, "the channel never says true");
  assert.equal(j.oneWay.verdict, "pass", j.oneWay.reasons.join("\n"));
  assert.deepEqual(j.flow.surfacesJudged, [SURFACE.ONE_WAY]);

  // …AND THE SAME LEG WITH THE ANGLE `null` — «the runtime looked and could not
  // measure» — is UNRESOLVED, because that is a THIRD state and must not
  // collapse into either of the others.
  const blind = rows.map((r) => ({ ...r, alignDeg: null }));
  const k = judge(blind, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(k.oneWay.counts.discriminatorUnknownTicks, 1260);
  assert.equal(k.oneWay.verdict, "unresolved");
  reasonMentioning(k.reasons, "the discriminator was not answered often enough");

  // …AND A FOURTH STATE NOBODY MEANT TO PUBLISH. `NaN` is not JSON, so it
  // cannot reach here from a written record — but it CAN reach here from a
  // hand-built row, a parse that produced `Number(undefined)`, or an arithmetic
  // slip upstream, and `NaN > 120` is `false`, which is the fail-open direction.
  // It is UNKNOWN, like every other angle the record cannot state.
  const nan = rows.map((r) => ({ ...r, alignDeg: Number.NaN }));
  const q = judge(nan, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(q.oneWay.counts.discriminatorUnknownTicks, 1260, "NaN is not with-the-flow");
  assert.equal(q.oneWay.counts.againstFlowTicks, 0);
  assert.equal(q.oneWay.verdict, "unresolved");
  // …and a handful of them, under the ceiling, is survivable and still not
  // counted as lawful — the census is what makes them cost, not a refusal.
  const few = rows.map((r, i) => (i % 40 === 0 ? { ...r, alignDeg: Number.NaN } : r));
  const f = judge(few, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(f.oneWay.counts.discriminatorUnknownTicks, 32);
  assert.ok(f.oneWay.metrics.discriminatorUnknownFrac < EXCLUDED_FRACTION_CEILING);
  assert.equal(f.oneWay.verdict, "pass", f.oneWay.reasons.join("\n"));
});

/* ────────────────────────────────────────────────────────────────────────────
 * MECHANISM 2 — THE RECORD'S OWN CLOCK (row 63).
 * ──────────────────────────────────────────────────────────────────────────*/

test("N3a (row 63, frozen sim clock): a 4.00 s excursion is still measured, because the durations moved to `wallMs`", () => {
  const rows = goodRows();
  for (const r of rows) r.tSec = 0; // the whole of the cheat
  // Row 63's excursion: 80 ticks held at 4.00 m — 0.75 m past
  // laneKeepMaxOffsetM 3.25 m — inside the declared curved span.
  for (let i = 600; i < 680; i++) rows[i].laneOffsetM = 4.0;

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "fail");
  assert.equal(j.lane.verdict, "fail");

  // The sim clock IS dead — and the criteria no longer ride on it.
  assert.equal(j.record.metrics.medianTickPeriodSec, null);
  assert.equal(j.record.metrics.medianWallPeriodSec, 0.05);
  near(j.lane.metrics.tickRateHz, 20);
  assert.equal(j.lane.counts.sampleFloor, 180); // row 63 measured 180 -> 30 here

  assert.equal(j.lane.counts.excursionTicks, 80);
  near(j.lane.metrics.longestExcursionSec, 4.0, 1e-9); // row 63 measured 0.00
  near(j.lane.metrics.cumulativeExcursionSec, 4.0, 1e-9);
  near(j.lane.metrics.maxAbsOffsetM, 4.0, 1e-12);
  reasonMentioning(j.reasons, "the product's own POOR_LANE_KEEPING condition");
});

test("N3b (row 63, stuttering sim clock): slowing `tSec` across the excursion no longer shortens it", () => {
  const rows = goodRows();
  for (let i = 600; i < 680; i++) rows[i].laneOffsetM = 4.0;
  // Row 63: "tSec advancing 0.0019 s per tick across it and 0.05 s everywhere
  // else" — chosen so the MEDIAN of 1259 deltas survives untouched.
  let t = 0;
  for (let i = 0; i < rows.length; i++) {
    rows[i].tSec = t;
    t += i >= 600 && i < 680 ? 0.0019 : 0.05;
  }

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "fail");
  assert.equal(j.lane.verdict, "fail");
  // The median does survive — which is exactly why a criterion that consulted
  // it would have read 20.000 Hz and believed the leg.
  near(j.record.metrics.medianTickPeriodSec, 0.05, 1e-9);
  assert.equal(j.record.metrics.medianWallPeriodSec, 0.05);
  near(j.lane.metrics.longestExcursionSec, 4.0, 1e-9); // row 63 measured 0.2001
  assert.equal(j.lane.counts.excursionTicks, 80);
});

test("CLOCK-ONLY-a (row 63's third remedy, now executed): a frozen `tSec` ALONE is refused", () => {
  // Row 63's "WHAT WOULD SETTLE IT" has three clauses. Two were already
  // executed (every duration on `wallMs`; the rate off the wall clock). THE
  // THIRD WAS NOT, while the module's own header said it was — "add a two-clock
  // agreement criterion that reds when the summed tSec deltas and the summed
  // wallMs deltas disagree by more than one laneKeepSustainSec over the leg".
  // Measured before the repair: `grep -n medianTickPeriodSec
  // tools/mobile/lib/road-criteria.mjs` returned four hits — the header
  // sentence, the definition, ONE call and ONE publication, and no comparison.
  // The value was computed, published and read by no verdict, which is this
  // programme's dead-predicate class sitting inside the file that names it.
  //
  // N3a and N3b above are red because of the EXCURSION they happen to carry.
  // THIS leg carries no excursion at all — it is the known-good leg with `tSec`
  // pinned to 0 and nothing else touched — so it is the proof that the clock
  // fraud itself is now what raises the refusal.
  const rows = goodRows();
  for (const r of rows) r.tSec = 0;

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "unresolved"); // ← was `pass`; unresolved is RED at the gate
  assert.equal(j.record.verdict, "unresolved");
  assert.equal(j.record.metrics.medianTickPeriodSec, null);
  assert.equal(j.record.metrics.medianWallPeriodSec, 0.05);

  // 62.95 s of wall time against 0.00 s of sim time, and the rule reads both.
  assert.equal(j.record.metrics.simAdvanceSec, 0);
  near(j.record.metrics.wallAdvanceSec, 62.95, 1e-9);
  near(j.record.metrics.clockDisagreementSec, 62.95, 1e-9);
  assert.ok(j.record.metrics.clockDisagreementSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC);

  // NOTHING ELSE IN AC-RECORD SEES IT — asserted one counter at a time, because
  // "the wall census would have caught it anyway" is the claim under test.
  assert.equal(j.record.counts.droppedTicks, 0);
  assert.equal(j.record.metrics.wallGapsAtOrAboveSustain, 0);
  assert.equal(j.record.metrics.gapBlindWallMs, 0);
  assert.equal(j.record.metrics.unsampledWallMs, 0);
  assert.equal(j.record.metrics.simGapsAtOrAboveSustain, 0);
  // ONLY THE TWO-CLOCK RULES STAND BETWEEN THIS LEG AND A PASS, and they are
  // named rather than counted — a count breaks every time a rule is added, and
  // it was never the claim. The claim is that no census over the WALL clock
  // sees this leg, which the five assertions above make one counter at a time.
  //
  // There are two of them because the cumulative sim census (added the revision
  // after this test was written) sees the same fraud from the other side: 62.95
  // s of wall time with the sim not advancing. That is the rule that closes the
  // COMPENSATED freeze, which the summed-difference rule cannot see at all.
  assert.equal(j.record.reasons.length, 2, j.record.reasons.join("\n"));
  reasonMentioning(j.reasons, "the record's two clocks disagree by 62.95 s over the leg");
  reasonMentioning(j.reasons, "none — the sim clock never advanced");
  reasonMentioning(j.reasons, "the sim clock did not advance for 62.95 s of wall time in total");
  near(j.record.metrics.simLostWallSec, 62.95, 1e-9);
  assert.equal(j.record.metrics.simGainedWallSec, 0);
  assert.deepEqual(j.leg.testimony.mayTestify, []);
});

test("CLOCK-ONLY-b, second shape: a `tSec` running 26x slow than `wallMs` is refused too", () => {
  // Same hole, without the null that a future null-refusal might otherwise
  // catch: every tick advances the sim clock 0.0019 s while the wall advances
  // 0.05 s. Sim span 2.392 s, wall span 62.95 s, and no excursion anywhere.
  const rows = goodRows();
  let t = 0;
  for (let i = 0; i < rows.length; i++) {
    rows[i].tSec = t;
    t += 0.0019;
  }

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "unresolved"); // ← was `pass`
  assert.equal(j.record.verdict, "unresolved");
  near(j.record.metrics.medianTickPeriodSec, 0.0019, 1e-9);
  assert.equal(j.record.metrics.medianWallPeriodSec, 0.05);
  near(rows[rows.length - 1].tSec - rows[0].tSec, 2.3921, 1e-4);
  near((rows[rows.length - 1].wallMs - rows[0].wallMs) / 1000, 62.95, 1e-9);

  near(j.record.metrics.simAdvanceSec, 2.3921, 1e-4);
  near(j.record.metrics.wallAdvanceSec, 62.95, 1e-9);
  near(j.record.metrics.clockDisagreementSec, 60.5579, 1e-4);
  assert.equal(j.record.reasons.length, 2, j.record.reasons.join("\n"));
  reasonMentioning(j.reasons, "or one of the two clocks was rewritten");
  reasonMentioning(j.reasons, "the sim clock did not advance for 60.56 s of wall time in total");
  near(j.record.metrics.simLostWallSec, 60.5579, 1e-4);
  assert.equal(j.record.metrics.simGainedWallSec, 0);
  assert.deepEqual(j.leg.testimony.mayTestify, []);
});

test("the two-clock rule does NOT red an honest leg, and the bound is the product's", () => {
  // The other half of every rule in this file: the control it must not touch.
  const j = judge(goodRows(), GOOD_DECLARED);
  assert.equal(j.record.verdict, "pass");
  near(j.record.metrics.simAdvanceSec, 62.95, 1e-9);
  near(j.record.metrics.wallAdvanceSec, 62.95, 1e-9);
  assert.ok(j.record.metrics.clockDisagreementSec < 1e-9);

  // A leg whose sim clock lags by JUST UNDER laneKeepSustainSec is still clean,
  // and one at the bound is not: the rule is the product's 3 s, not a margin.
  const lag = (sec) => {
    const rows = goodRows();
    // Hold `tSec` still for `sec` of wall time in the middle of the leg, then
    // carry the deficit to the end. `wallMs` is untouched, so no gap census
    // above can see it.
    const held = Math.round(sec * 20);
    const base = rows.map((r) => r.tSec);
    for (let i = 600; i < rows.length; i++) {
      rows[i].tSec = i < 600 + held ? base[600] : base[i - held];
    }
    return judge(rows, GOOD_DECLARED).record;
  };
  const under = lag(2.95);
  near(under.metrics.clockDisagreementSec, 2.95, 1e-9);
  assert.equal(under.verdict, "pass", under.reasons.join("\n"));
  const at = lag(3.0);
  near(at.metrics.clockDisagreementSec, 3.0, 1e-9);
  assert.equal(at.verdict, "unresolved", "at laneKeepSustainSec exactly, it refuses");
  assert.equal(at.metrics.wallGapsAtOrAboveSustain, 0, "and the wall census still sees nothing");
});

/* ────────────────────────────────────────────────────────────────────────────
 * MECHANISM 3 — CUMULATIVE BLINDNESS (row 64).
 * ──────────────────────────────────────────────────────────────────────────*/

test("N2 (row 64): 2900 ms holes under a 3000 ms per-step rule are convicted in AGGREGATE", () => {
  // Row 64's recipe: "`seq` renumbered contiguously (so the drop counter cannot
  // see anything) and a 2900 ms wall hole punched after every 2000 ms of
  // ticks". 40 ticks = 2000 ms at this cadence.
  const rows = goodRows();
  let wall = 0;
  let holes = 0;
  for (let i = 0; i < rows.length; i++) {
    rows[i].seq = i;
    rows[i].wallMs = wall;
    wall += PERIOD_MS;
    if (i > 0 && (i + 1) % 40 === 0 && i < rows.length - 1) {
      wall += 2900 - PERIOD_MS;
      holes++;
    }
  }
  assert.equal(holes, 31); // lane B measured 31 holes
  assert.equal(rows[rows.length - 1].wallMs, 151300); // lane B measured coveredWallMs 151,300

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "unresolved"); // unresolved is RED at the gate
  assert.equal(j.record.verdict, "unresolved");

  // EVERY COUNTER LANE B QUOTED IS STILL CLEAN — that is the cheat, intact.
  assert.equal(j.record.counts.droppedTicks, 0);
  assert.equal(j.record.counts.maxContiguousDrop, 0);
  assert.equal(j.record.metrics.wallGapsAtOrAboveSustain, 0);
  assert.equal(j.record.metrics.blindWallMs, 0);
  assert.equal(j.record.metrics.longestWallGapMs, 2900);

  // …and the CUMULATIVE census is what convicts. 31 × (2900 − 50) = 88,350 ms
  // of dark, against a rule of 3000 ms. Lane B quoted 89,900 ms = 31 × 2900,
  // the RAW gap sum; the module correctly charges each gap only the time past
  // one tick period.
  assert.equal(j.record.metrics.gapBlindWallMs, 88350);
  assert.equal(31 * (2900 - PERIOD_MS), 88350);
  reasonMentioning(j.reasons, "blindness is cumulative");

  // AND THE INFLATED SPAN IS PUBLISHED BUT NOT CONSUMED: the record claims
  // 151,300 ms while it actually sampled 63,000 ms.
  assert.equal(j.record.metrics.recordSpanMs, 151300);
  assert.equal(j.record.metrics.coveredWallMs, 63000);
});

test("N2 isolated: the gap census alone convicts, with the declared budget left clean", () => {
  // The literal recipe above punches its first holes INSIDE the calibration
  // span, which inflates that span's wall duration to 10.70 s and trips the
  // declared-removal ceiling as well — a second, unrelated refusal. Moving the
  // holes past seq 100 leaves the declaration at its known-good 5.00 s, so the
  // cumulative gap census is the only thing on trial.
  const rows = goodRows();
  let wall = 0;
  let holes = 0;
  let sinceHole = 0;
  for (let i = 0; i < rows.length; i++) {
    rows[i].seq = i;
    rows[i].wallMs = wall;
    wall += PERIOD_MS;
    if (i >= 100 && i < rows.length - 1) {
      sinceHole++;
      if (sinceHole === 40) {
        wall += 2900 - PERIOD_MS;
        holes++;
        sinceHole = 0;
      }
    }
  }
  assert.equal(holes, 28);

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "unresolved");
  assert.equal(j.record.verdict, "unresolved");
  assert.equal(j.referent.verdict, "pass");
  assert.equal(j.flow.verdict, "pass");
  assert.equal(j.lane.verdict, "pass");
  assert.equal(j.record.metrics.gapBlindWallMs, 79800);
  assert.equal(28 * (2900 - PERIOD_MS), 79800);
  near(j.flow.metrics.declaredRemovedWallSec, 5.0, 1e-9);
  assert.equal(
    j.record.reasons.filter((r) => r.includes("blindness is cumulative")).length,
    1,
  );
});

/* ────────────────────────────────────────────────────────────────────────────
 * MECHANISM 4 — THE EXCLUSION CEILING'S NUMERATOR (row 65).
 * ──────────────────────────────────────────────────────────────────────────*/

test("N13 (row 65): 400 interleaved UNPAINTED ticks at 4.00 m are now inside the ceiling's numerator", () => {
  const rows = goodRows();
  let marked = 0;
  for (let i = 400; i <= 1200 && marked < 400; i += 2) {
    rows[i].laneLinesPainted = false;
    rows[i].laneOffsetM = 4.0;
    marked++;
  }
  assert.equal(marked, 400);

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "unresolved");
  assert.equal(j.lane.verdict, "unresolved");
  assert.equal(j.lane.counts.gradedTicks, 401); // lane B measured 401 too
  assert.equal(j.lane.counts.unpaintedTicks, 400);
  // Lane B measured excludedFrac 0.0000 here: the old ceiling divided only
  // (offRoad + saturated) and `unpainted` reached no denominator at all.
  near(j.lane.metrics.excludedFrac, 0.4993757802746567, 1e-12);
  assert.ok(j.lane.metrics.excludedFrac > EXCLUDED_FRACTION_CEILING);
  // The contiguous-run rule is STILL defeated by the interleave — this is not
  // what convicts, and a later edit must not be allowed to think it was.
  near(j.lane.metrics.longestExcludedRunSec, 0.05, 1e-9);
  reasonMentioning(j.reasons, "the ceiling is over their union");
});

test("N17 (row 65): 400 interleaved NOT-MOVING ticks at 4.00 m are convicted twice over", () => {
  const rows = goodRows();
  let marked = 0;
  for (let i = 400; i <= 1200 && marked < 400; i += 2) {
    rows[i].speedKmh = 4.9; // movingSpeedKmh is 5
    rows[i].laneOffsetM = 4.0;
    marked++;
  }
  assert.equal(marked, 400);
  assert.ok(4.9 < PRODUCT.MOVING_SPEED_KMH);

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "fail");
  assert.equal(j.lane.verdict, "fail");
  assert.equal(j.lane.counts.notMovingTicks, 400);
  assert.equal(j.lane.counts.gradedTicks, 401);
  near(j.lane.metrics.excludedFrac, 0.4993757802746567, 1e-12);

  // AND THE EXCURSION CENSUS SEES THEM, because it does NOT carry `moving`:
  // 400 ticks × 0.05 s = 20.00 s past laneKeepMaxOffsetM, while the longest
  // single run is one tick. Row 65 measured longestExcursionSec 0.00 for these.
  assert.equal(j.lane.counts.excursionTicks, 400);
  near(j.lane.metrics.longestExcursionSec, 0.05, 1e-9);
  near(j.lane.metrics.cumulativeExcursionSec, 20.0, 1e-9);
  reasonMentioning(j.reasons, "one episode's worth of time outside the band");
});

test("N12 (row 65): two 2.00 s parks at 4.10 m are convicted WITHOUT the excluded fraction ever binding", () => {
  // 4.10 m is just past the saturation bound LANE_WIDTH_M/2 = 4.0625 m, so
  // these ticks leave `graded` — which used to be how they escaped the census.
  const rows = goodRows();
  for (let i = 500; i < 540; i++) rows[i].laneOffsetM = 4.1;
  for (let i = 800; i < 840; i++) rows[i].laneOffsetM = 4.1;
  assert.ok(4.1 > PRODUCT.LANE_WIDTH_M / 2);
  assert.ok(4.1 > PRODUCT.LANE_KEEP_MAX_OFFSET_M);

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "fail");
  assert.equal(j.lane.verdict, "fail");
  assert.equal(j.lane.counts.saturatedTicks, 80);

  // THE WIDENING-PROOF HALF, and the reason this test exists in this shape:
  // row 65 says "DO NOT LOWER EXCLUDED_FRACTION_CEILING … N12 is engineered to
  // sit one thousandth under whatever the number is". It still does — 80/801 =
  // 0.09988 against 0.1 — and the leg is convicted anyway. If a later edit
  // starts convicting this leg through the ceiling instead, this assertion
  // fails and says so.
  near(j.lane.metrics.excludedFrac, 0.09987515605493133, 1e-12);
  assert.ok(j.lane.metrics.excludedFrac < EXCLUDED_FRACTION_CEILING);
  // Each park is deliberately under the 3.0 s contiguous rule, too.
  near(j.lane.metrics.longestExcludedRunSec, 2.0, 1e-9);
  near(j.lane.metrics.longestExcursionSec, 2.0, 1e-9);
  assert.ok(j.lane.metrics.longestExcursionSec < PRODUCT.LANE_KEEP_SUSTAIN_SEC);
  // What convicts is the CUMULATIVE census: 80 × 0.05 = 4.00 s.
  assert.equal(j.lane.counts.excursionTicks, 80);
  near(j.lane.metrics.cumulativeExcursionSec, 4.0, 1e-9);
  reasonMentioning(j.reasons, "one episode's worth of time outside the band");
});

/* ────────────────────────────────────────────────────────────────────────────
 * MECHANISM 5 — WHAT A DECLARATION MAY REMOVE (row 66).
 * ──────────────────────────────────────────────────────────────────────────*/

test("N4 (row 66): 359 rows OUTSIDE the declared curved span, held at 10.00 m, are judged by the leg-wide census", () => {
  const rows = goodRows();
  let marked = 0;
  for (let i = 100; i < 400; i++) {
    rows[i].laneOffsetM = 10.0;
    marked++;
  }
  for (let i = 1201; i < 1260; i++) {
    rows[i].laneOffsetM = 10.0;
    marked++;
  }
  assert.equal(marked, 359); // lane B's number exactly
  assert.ok(10.0 > 3 * PRODUCT.LANE_KEEP_MAX_OFFSET_M);

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "fail");
  assert.equal(j.lane.verdict, "fail");

  // THE CURVED BUCKET IS STILL BLIND TO ALL OF IT — 459 rows sit outside it and
  // the p90 statistic is byte-identical to the known-good leg's. The excursion
  // census is leg-wide, and that is the whole repair.
  assert.equal(j.lane.counts.outsideCurvedSpanTicks, 459);
  assert.equal(j.lane.counts.curvedTicksTotal, 801);
  near(j.lane.metrics.p90AbsOffsetM, 0.8925050383594872, 1e-12);
  assert.equal(j.lane.metrics.excludedFrac, 0);

  assert.equal(j.lane.counts.excursionTicks, 359);
  near(j.lane.metrics.longestExcursionSec, 15.0, 1e-9); // rows 100..399, contiguous
  near(j.lane.metrics.cumulativeExcursionSec, 17.95, 1e-9);
  // The 100-tick calibration park is a declared removal and is correctly NOT in
  // the census: 359 eligible, not 459.
  assert.equal(j.lane.counts.excursionScanTicks, 1160);
  // …and the refusal NAMES the count that says where the blindness was, which
  // is what makes `outsideCurvedSpanTicks` a read number rather than a
  // published one. Both halves of the sentence are asserted, because the
  // numbers are what a reader acts on.
  const why = reasonMentioning(j.reasons, "the product's own POOR_LANE_KEEPING condition");
  assert.ok(why.includes("scanned leg-wide over 1160 eligible tick(s)"));
  assert.ok(why.includes("459 fall OUTSIDE the declared curved spans"));
});

test("M5b (row 66): 400 contiguous wrong-bank ticks inside ONE declared span — the declaration is now over budget and is stripped", () => {
  const rows = goodRows();
  for (let i = 700; i < 1100; i++) rows[i].opposingBank = true;
  const declared = {
    ...GOOD_DECLARED,
    manoeuvreSpans: [{ fromSeq: 700, toSeq: 1099 }],
  };

  const j = judge(rows, declared);

  assert.equal(j.verdict, "fail");
  assert.equal(j.flow.verdict, "fail");

  // 20.00 s of manoeuvre + 5.00 s of calibration = 25.00 s of a 62.95 s leg =
  // 0.3971, four times the 0.1 ceiling. Row 66 measured declaredManoeuvreTicks
  // 400 and convictingRuns 0: one declaration bought twenty seconds.
  near(j.flow.metrics.declaredRemovedWallSec, 25.0, 1e-9);
  near(j.flow.metrics.declaredRemovedFrac, 0.3971405877680699, 1e-12);
  assert.ok(j.flow.metrics.declaredRemovedFrac > EXCLUDED_FRACTION_CEILING);

  // Because the declaration is refused, its spans are STRIPPED before the
  // surfaces see them — so the run is undeclared and is convicted on length as
  // well as on fraction.
  assert.equal(j.twoWay.counts.declaredManoeuvreRuns, 0);
  assert.equal(j.twoWay.counts.undeclaredRuns, 1);
  assert.equal(j.twoWay.counts.convictingRuns, 1);
  near(j.twoWay.metrics.longestUndeclaredRunSec, 20.0, 1e-9);
  assert.equal(j.twoWay.counts.againstFlowTicks, 400);
  near(j.twoWay.metrics.againstFlowFrac, 0.31746031746031744, 1e-12);
  reasonMentioning(j.reasons, "gets no larger allowance for being written down");
});

/* ────────────────────────────────────────────────────────────────────────────
 * MECHANISM 6 — THE SELF-CONTRADICTING ROW (row 67).
 * ──────────────────────────────────────────────────────────────────────────*/

test("N14 (row 67): `wrongWay: true` on a row classified TWO-WAY refuses the leg instead of vanishing", () => {
  // Row 67: "600 rows — 30.0 s at 20 Hz — carrying wrongWay:true with
  // oneway:false, which is exactly the shape a probe tap produces if it writes
  // `edge.oneway ?? false`".
  const rows = goodRows();
  for (let i = 300; i < 900; i++) rows[i].wrongWay = true;

  const j = judge(rows, GOOD_DECLARED);

  assert.equal(j.verdict, "fail");
  assert.equal(j.flow.verdict, "fail");
  assert.equal(j.twoWay.verdict, "fail");
  assert.equal(j.twoWay.counts.contradictoryRows, 600);

  // The rows still reach NO numerator — `againstFlow` on a two-way surface
  // reads `opposingBank`, never `wrongWay` — and the one-way denominator is
  // still zero. That is the cheat; what changed is that the CONTRADICTION is
  // now the verdict rather than the silence.
  assert.equal(j.twoWay.counts.againstFlowTicks, 0);
  assert.equal(j.oneWay.counts.denominator, 0);
  reasonMentioning(j.reasons, "contradicts the runtime's own contract");

  assert.deepEqual(j.flow.surfacesJudged, []);
  assert.deepEqual(j.leg.testimony.mayTestify, []);
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE SEAM, CLOSED. The product signal landed and this is what it replaced.
 * ──────────────────────────────────────────────────────────────────────────*/

test("R19: a tap that writes a LAWFUL angle over a convicting boolean is refused, not believed", () => {
  // THE HOLE R18 WOULD HAVE OPENED. Before R18 a `wrongWay: true` tick always
  // convicted. Now the signed angle is read FIRST and the boolean only where
  // the angle is absent — so a probe tap that writes `alignDeg: 0` on every
  // tick acquits the whole surface while the record's own conviction channel is
  // shouting. That is control 4's dead referent one field over, it would have
  // been INTRODUCED by this revision, and R19 is what closes it.
  //
  // MEASURED WITHOUT THE RULE: 1260 one-way ticks, 600 of them carrying
  // `wrongWay: true`, every one carrying `alignDeg: 0` — againstFlowTicks 0,
  // discriminatorUnknownTicks 0, oneWay = pass, LEG = pass, mayTestify
  // ["lane position on oneWay"].
  const rows = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  for (let i = 300; i < 900; i++) {
    rows[i].wrongWay = true; // the engine convicted
    rows[i].alignDeg = 0; // …and the tap says the nose was perfectly aligned
  }
  const j = judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] });

  assert.equal(j.oneWay.counts.directionContradictionRows, 600);
  assert.equal(j.oneWay.verdict, "fail", j.oneWay.reasons.join("\n"));
  assert.equal(j.verdict, "fail");
  assert.deepEqual(j.flow.surfacesJudged, []);
  assert.deepEqual(j.leg.testimony.mayTestify, []);
  reasonMentioning(j.reasons, "cannot have produced it");

  // THE THRESHOLD IT COMPARES AGAINST IS THE PRODUCT'S. At exactly 120 the
  // product's own `>` is false, so `wrongWay: true` there is still impossible;
  // half a degree past it the two channels agree and the record stands.
  const at = (deg) => {
    const r2 = goodRows().map((q) => faceRow({ ...q, oneway: true }, false));
    for (let i = 300; i < 900; i++) {
      r2[i].wrongWay = true;
      r2[i].alignDeg = deg;
    }
    return judge(r2, { ...GOOD_DECLARED, channels: ["wrongWay"] }).oneWay;
  };
  assert.equal(at(PRODUCT.WRONG_WAY_ANGLE_DEG).counts.directionContradictionRows, 600);
  assert.equal(at(PRODUCT.WRONG_WAY_ANGLE_DEG + 0.5).counts.directionContradictionRows, 0);
  assert.equal(at(-(PRODUCT.WRONG_WAY_ANGLE_DEG + 0.5)).counts.directionContradictionRows, 0);

  // IT COMPARES THE NOSE, UNROTATED. A LAWFUL REVERSE IS NOT A BROKEN RECORD:
  // the product's boolean is a heading verdict and DOES fire on a lawful
  // reverse around a ring (docs/simulation/93, GAP-2), while this file's
  // discriminator rotates by 180° because it wants TRAVEL. That divergence is
  // designed. A rule that compared the ROTATED value would file every correct
  // reverse-park as a contradiction — which is the single most likely way to
  // get this rule wrong, and the reverse/park half is what the instrument this
  // record exists for is FOR.
  const reverse = goodRows().map((q) => faceRow({ ...q, oneway: true, gear: -1 }, true));
  for (const q of reverse) q.alignDeg = -178.0; // nose backwards, travel forwards
  const rev = judge(reverse, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(reverse.filter((q) => q.wrongWay === true).length, 1260);
  assert.equal(rev.oneWay.counts.directionContradictionRows, 0, "a lawful reverse is not a lie");
  assert.equal(rev.oneWay.counts.againstFlowTicks, 0);
  assert.equal(rev.oneWay.verdict, "pass", rev.oneWay.reasons.join("\n"));

  // THE OTHER TWO SHAPES OF THE SAME LIE. `wrongWay: true` requires
  // `wrongWayArmed` and a measurable angle; neither can be absent under it.
  const disarmed = goodRows().map((q) => faceRow({ ...q, oneway: true }, true));
  for (const q of disarmed) q.wrongWayArmed = false;
  assert.equal(
    judge(disarmed, { ...GOOD_DECLARED, channels: ["wrongWay"] }).oneWay.counts
      .directionContradictionRows,
    1260,
    "convicted while the channel was never asked",
  );
  const blind = goodRows().map((q) => faceRow({ ...q, oneway: true }, true));
  for (const q of blind) q.alignDeg = null;
  assert.equal(
    judge(blind, { ...GOOD_DECLARED, channels: ["wrongWay"] }).oneWay.counts
      .directionContradictionRows,
    1260,
    "convicted off an angle the runtime says it could not measure",
  );

  // AND A RECORD THAT PREDATES THE SIGNAL IS NOT ACCUSED OF ANYTHING. There is
  // nothing to compare `wrongWay` against, so R19 says nothing and the tick
  // convicts on the boolean exactly as it did before R18.
  const old = goodRows().map((q) => unfaceRow(faceRow({ ...q, oneway: true }, true)));
  const o = judge(old, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(o.oneWay.counts.directionContradictionRows, 0);
  assert.equal(o.oneWay.counts.againstFlowTicks, 1260, "`true` still convicts without the signal");
  assert.equal(o.oneWay.verdict, "fail");

  // …AND THE HONEST VERSION OF THE CHEAT LEG PASSES, so R19 is a contradiction
  // rule and not a ban on `wrongWay` appearing beside an angle.
  const honest = goodRows().map((q) => faceRow({ ...q, oneway: true }, false));
  for (let i = 300; i < 320; i++) faceRow(honest[i], true);
  const h = judge(honest, {
    ...GOOD_DECLARED,
    channels: ["wrongWay"],
    manoeuvreSpans: [{ fromSeq: 300, toSeq: 319 }],
  });
  assert.equal(h.oneWay.counts.directionContradictionRows, 0);
  assert.equal(h.oneWay.counts.againstFlowTicks, 20);
  assert.equal(h.oneWay.verdict, "pass", h.oneWay.reasons.join("\n"));
});

test("THE SEAM IS CLOSED: the signed travel-direction-vs-edge value replaced `wrongWay === false`", () => {
  // THIS TEST USED TO BE THE SEAM. It pinned, executably, the behaviour the
  // founder-ruled signal had to REPLACE, so that when the signed value landed
  // this would be the test that failed and named what to rewrite. It did
  // exactly that on 2026-09-24, and this is the rewrite. What it pinned, in its
  // own words, and what each line became:
  //
  //   · "`wrongWay: false` is currently read as a POSITIVE with-the-flow
  //     statement: 1240 such rows produce againstFlowTicks 20, not 1260."
  //     → GONE. `false` alone is UNKNOWN. The count only stays 20 when the
  //       record SAYS the other 1240 faced along the edge, which is asserted
  //       both ways below.
  //   · "the only things standing between that and a fail-open acquittal are
  //     the liveness GATE and the witness FLOOR — and both are satisfied by the
  //     offence itself."
  //     → BOTH DELETED (module R18), with `longestWitnessRunSec`,
  //       `longestContiguousWitnessSec`, L7's dilution note and L9.
  //   · "the replacement is: `againstFlow` on the one-way surface reads the
  //     sign instead of `wrongWay`, a tick with no signed value is `null`
  //     (unknown) rather than `false`."
  //     → BUILT. `PRODUCT.WRONG_WAY_ANGLE_DEG` is mirrored from
  //       worldRuntime.ts:279 and read back out of platform/src by the drift
  //       test; `gear === -1` rotates the nose angle by 180° so a lawful
  //       reverse is not convicted.
  //   · "What does NOT go: the one-way surface still needs a NON-ZERO
  //     denominator and the contradiction rule (R13) still applies."
  //     → KEPT, and asserted here rather than left to be assumed.
  //
  // The leg is the seam's own leg, unchanged in shape: 1260 one-way ticks, 20
  // of them declared wrong-way at seq 200..219.
  const rows = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  for (let i = 200; i <= 219; i++) faceRow(rows[i], true);
  const declared = {
    ...GOOD_DECLARED,
    channels: ["wrongWay"],
    manoeuvreSpans: [{ fromSeq: 200, toSeq: 219 }],
  };
  const j = judge(rows, declared);

  // 1. THE 1240 ARE WITH THE FLOW POSITIVELY. The seam asserted the same three
  //    numbers; what changed is WHY they hold.
  assert.equal(rows.filter((r) => r.wrongWay === false).length, 1240);
  assert.equal(j.oneWay.counts.denominator, 1260);
  assert.equal(j.oneWay.counts.againstFlowTicks, 20);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(j.oneWay.metrics.discriminatorUnknownFrac, 0);
  assert.equal(j.oneWay.verdict, "pass", j.oneWay.reasons.join("\n"));

  // 2. THE SAME 1240 WITHOUT THE SIGNAL ARE UNKNOWN — every one of them. The
  //    seam's own sentence («not one of the 1240 ambiguous rows is counted as
  //    UNKNOWN today») is now false in exactly the way it asked to be.
  const bare = rows.map((r) => unfaceRow({ ...r }));
  const k = judge(bare, declared);
  assert.equal(k.oneWay.counts.denominator, 1260);
  assert.equal(k.oneWay.counts.againstFlowTicks, 20);
  assert.equal(k.oneWay.counts.discriminatorUnknownTicks, 1240);
  assert.equal(k.oneWay.verdict, "unresolved");
  assert.equal(k.verdict, "unresolved");

  // 3. THE GATE AND THE FLOOR ARE GONE. The seam's leg with NO witness at all
  //    used to read UNRESOLVED and name "needs its own declared witness
  //    excursion"; it now passes, and that phrase appears nowhere in the leg's
  //    reasons — nor does the floor's.
  const noWitness = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  const m = judge(noWitness, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(m.oneWay.counts.discriminatorTrueTicks, 0);
  assert.equal(m.oneWay.verdict, "pass", m.oneWay.reasons.join("\n"));
  assert.equal(m.verdict, "pass", m.reasons.join("\n"));
  const allReasons = [...m.reasons, ...j.reasons].join(" ");
  assert.ok(
    !allReasons.includes("needs its own declared witness excursion"),
    "the liveness gate's refusal must not exist any more",
  );
  assert.ok(
    !allReasons.includes("is a state the product never believed either"),
    "nor the witness floor's",
  );
  assert.equal(m.oneWay.metrics.longestWitnessRunSec, undefined);
  assert.equal(m.oneWay.metrics.longestContiguousWitnessSec, undefined);

  // 4. …AND THE SAME LEG WITHOUT THE SIGNAL IS STILL REFUSED, which is the
  //    seam's `k` case with its reason rewritten: it is UNRESOLVED on the
  //    unknown census rather than on a missing demonstration of the offence.
  const noWitnessBare = noWitness.map((r) => unfaceRow({ ...r }));
  const n = judge(noWitnessBare, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(n.oneWay.verdict, "unresolved");
  assert.equal(n.oneWay.counts.discriminatorTrueTicks, 0);
  assert.equal(n.oneWay.counts.discriminatorUnknownTicks, 1260);
  assert.equal(n.verdict, "unresolved");
  reasonMentioning(n.reasons, "the discriminator was not answered often enough");

  // 5. WHAT THE SEAM SAID MUST NOT GO, AND DID NOT. A zero denominator is
  //    UNRESOLVED, never a clean pass…
  const twoWayOnly = goodRows();
  const z = judge(twoWayOnly, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(z.oneWay.counts.denominator, 0);
  assert.equal(z.oneWay.verdict, "unresolved");
  reasonMentioning(z.oneWay.reasons, "zero denominator is UNRESOLVED");

  // …and R13 still refuses a row filed under a surface that cannot hold it,
  // whatever the discriminator says. These rows carry a PERFECTLY LAWFUL signed
  // angle, so the only thing that can red them is the contradiction rule.
  const contradictory = rows.map((r, i) =>
    i >= 300 && i < 900 ? { ...r, opposingBank: true } : r,
  );
  const c = judge(contradictory, declared);
  assert.equal(c.oneWay.counts.contradictoryRows, 600);
  assert.equal(c.oneWay.verdict, "fail", c.oneWay.reasons.join("\n"));
  assert.equal(c.verdict, "fail");
  reasonMentioning(c.reasons, "contradicts the runtime's own contract");
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE FOURTEEN LEGS THE NEXT ADVERSARY FOUND, AND WHY THEY ARE HERE.
 *
 * Everything above this line was written against a revision that had already
 * been attacked once. An adversarial pass then rebuilt the cheats from the
 * OUTSIDE again and got FOURTEEN MORE legs to read `LEG = pass`, against a
 * module whose own header said "NO CHEAT IN THIS FILE IS STILL LIVE". Every one
 * is below, at the verdict it gets now, with the number that produced it.
 *
 * THE SHAPES, because the individual legs matter less than the four mechanisms
 * they share:
 *
 *   1. A CLOCK THE RULES TRUST AND NOBODY CHECKS. `seq` had a monotonicity
 *      refusal from the first revision; `wallMs` — the clock EVERY duration in
 *      the module is measured on — had none at all, and the sim clock's own
 *      census was computed, published and read by no verdict.
 *   2. A NET SUM WHERE A CENSUS WAS OWED. The two-clock rule compared SUMS, so
 *      a freeze repaid by a catch-up jump cancelled to zero. That is N2's own
 *      lesson (2900 ms holes under a 3000 ms per-step rule) on the other clock.
 *   3. A STATISTIC MEASURED AGAINST A QUANTITY THE RECORD AUTHORS. The gap
 *      census subtracts the record's own MEDIAN period from every gap, so a
 *      record whose majority of steps ARE the holes has, by construction, no
 *      holes.
 *   4. A RULE SCOPED TO A BUCKET THE RECORD DECLARES. The p90 ceiling, the
 *      exclusion ceiling and the only hard geometric refusal were all scoped by
 *      `declared.curvedSpans` — a claim about BENDS — so everything outside it
 *      was judged by nothing.
 *
 * TWO OF THE FOURTEEN ARE STILL LIVE and are asserted below AT THE VERDICT THEY
 * GET, not the one they deserve, so a future repair reds this file and makes
 * someone come back and rewrite the disclosure. They are L8 and L9 in the
 * module header.
 * ──────────────────────────────────────────────────────────────────────────*/

/* ── 1. THE BRIDGED WITNESS — it defeated R7, the rule the last revision was
 *      written for. ────────────────────────────────────────────────────────*/

/**
 * A one-way leg whose two against-flow ticks are `gap` ticks apart, with the
 * ticks between them carrying `fill`.
 *
 *   "null"    the runtime LOOKED AND COULD NOT MEASURE — `alignDeg: null`
 *   "noEdge"  no edge fix at all, so the tick is not on this surface and is
 *             billed to no census here
 *   "lawful"  the car faced along the edge, and says so
 *
 * `declare: false` leaves the two ticks undeclared, which is the direction the
 * bridge was BUILT for: an offence interrupted by ticks nobody could measure is
 * still one offence, and the run's SPAN is what the conviction clock reads.
 */
function bridgedWitnessLeg(gap, fill, { declare = true } = {}) {
  const rows = goodRows().map((r) => faceRow({ ...r, oneway: true }, false));
  const span = gap + 2;
  for (let k = 0; k < span; k++) {
    const i = 200 + k;
    if (k === 0 || k === span - 1) faceRow(rows[i], true);
    else if (fill === "null") {
      rows[i].alignDeg = null;
      rows[i].wrongWay = null;
      delete rows[i].alignTravelDir;
      delete rows[i].alignRoundabout;
    } else if (fill === "noEdge") {
      unfaceRow(rows[i]);
      rows[i].edgeId = null;
      delete rows[i].wrongWay;
    } else faceRow(rows[i], false);
  }
  return {
    rows,
    declared: {
      ...GOOD_DECLARED,
      channels: ["wrongWay"],
      calibration: { fromSeq: 0, toSeq: 89, offsetM: 1.0 },
      ...(declare ? { manoeuvreSpans: [{ fromSeq: 200, toSeq: 200 + span - 1 }] } : {}),
    },
  };
}

test("BRIDGE: the leg that defeated R7 is now judged on what its ticks SAY", () => {
  // WHAT THIS LEG WAS FOR. Two against-flow ticks 1.45 s apart with 28 ticks
  // between them that nobody could measure. `flowRuns` BRIDGES those, on
  // purpose, so the run's SPAN read 1.50 s — exactly the witness R7 asked for —
  // on 0.10 s of channel evidence, and the leg read pass. R12 repaired the
  // floor to count CONTIGUOUS ticks instead, and this test asserted the repair.
  //
  // R7 AND R12 ARE BOTH GONE (module R18), so the question "is this a witness?"
  // is not asked any more. The fixture is kept because the BRIDGE is not gone,
  // and it is worth pinning what it does now, in both directions.
  //
  // DECLARED, this leg is a PASS, and it should be: the car faced along the
  // edge on 1230 ticks and says so, the runtime could not measure 28, and the
  // two against-flow ticks are inside a pinned manoeuvre span.
  const { rows, declared } = bridgedWitnessLeg(28, "null");
  const j = judge(rows, declared);
  assert.equal(j.oneWay.counts.denominator, 1260);
  assert.equal(j.oneWay.counts.againstFlowTicks, 2);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 28, "the unmeasurable ticks are COUNTED");
  assert.ok(j.oneWay.metrics.discriminatorUnknownFrac < EXCLUDED_FRACTION_CEILING);
  assert.equal(j.oneWay.counts.declaredManoeuvreRuns, 1);
  assert.equal(j.oneWay.counts.convictingRuns, 0);
  assert.equal(j.oneWay.verdict, "pass", j.oneWay.reasons.join("\n"));

  // UNDECLARED, THE BRIDGE DOES THE JOB IT WAS BUILT FOR: an offence
  // interrupted by ticks nobody could measure is still ONE offence, its span
  // reaches wrongWaySustainSec, and it convicts. This is the direction the old
  // floor inverted — it read the same span as evidence of INNOCENCE elsewhere.
  const bare = bridgedWitnessLeg(28, "null", { declare: false });
  const k = judge(bare.rows, bare.declared);
  assert.equal(k.oneWay.counts.undeclaredRuns, 1, "two ticks and a blind patch are ONE run");
  assert.equal(k.oneWay.counts.convictingRuns, 1);
  near(k.oneWay.runs[0].sec, 1.5, 1e-9);
  assert.equal(k.oneWay.runs[0].ticks, 2);
  assert.equal(k.oneWay.runs[0].bridgedTicks, 28, "and the bridge is REPORTED, not hidden");
  assert.equal(k.oneWay.verdict, "fail", k.oneWay.reasons.join("\n"));

  // AND THE BRIDGE ONLY SPANS SILENCE. Fill the same 28 ticks with ticks that
  // SAY the car faced along the edge and the run breaks in two — 0.05 s each,
  // neither convicting. Under the retired dialect those 28 ticks would have
  // carried `wrongWay: false`, which is the same value an unasked channel
  // publishes, so the record could not tell this leg from the one above.
  const spoken = bridgedWitnessLeg(28, "lawful", { declare: false });
  const m = judge(spoken.rows, spoken.declared);
  assert.equal(m.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(m.oneWay.counts.undeclaredRuns, 2, "a tick that SPEAKS breaks the run");
  assert.equal(m.oneWay.counts.convictingRuns, 0);
  near(m.oneWay.runs[0].sec, 0.05, 1e-9);
  assert.equal(m.oneWay.verdict, "pass", m.oneWay.reasons.join("\n"));
});

test("BRIDGE, second filling: off-surface rows are bridged too, and are billed to NO census", () => {
  // The same leg with the 28 intervening rows carrying no edge fix at all.
  // They leave the one-way denominator entirely — 1232, not 1260 — so unlike
  // the `null` filling they are not even counted as unknowns. THE BRIDGE IS
  // FREE, and that was true before this revision and is still true: nothing in
  // this file bills off-surface ticks to any ceiling. It is harmless now only
  // because no rule reads a bridged span as evidence of innocence; if one is
  // ever written again, this is the shape that defeats it.
  const { rows, declared } = bridgedWitnessLeg(28, "noEdge");
  const j = judge(rows, declared);
  assert.equal(j.oneWay.counts.denominator, 1232, "28 ticks left the surface");
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0, "and cost the unknown census nothing");
  assert.equal(j.oneWay.verdict, "pass", j.oneWay.reasons.join("\n"));

  // …and the offence still convicts through them when it is not declared.
  const bare = bridgedWitnessLeg(28, "noEdge", { declare: false });
  const k = judge(bare.rows, bare.declared);
  assert.equal(k.oneWay.counts.convictingRuns, 1);
  near(k.oneWay.runs[0].sec, 1.5, 1e-9);
  assert.equal(k.oneWay.runs[0].bridgedTicks, 28);
  assert.equal(k.oneWay.verdict, "fail");
});

test("BRIDGE, THE WHOLE BRIDGE AXIS: the span convicts at the product's clock, and the bridge ends", () => {
  // THE CONTROL THE SUITE DID NOT HAVE, and its absence is why the R7 hole
  // lived: the 1..40 sweep varied CONTIGUOUS witness length, and nothing
  // anywhere varied what the ticks BETWEEN two against-flow ticks carry.
  //
  // IT IS KEPT, AND IT ASSERTS THE VERDICT EACH GAP GETS rather than asserting
  // that none of them passes. Undeclared, two against-flow ticks `gap` apart:
  //
  //   gap ≤ 27   the bridged span is under wrongWaySustainSec  → pass
  //   28..59     the span reaches the product's clock          → fail
  //   60         the bridge is longer than laneKeepSustainSec (3.00 s = 60
  //              ticks), so it is NOT bridged and the run is two ticks → pass
  //
  // The last line is the one worth having: the bridge has an end, it is the
  // product's own constant, and a test that only asserted "nothing passes"
  // could not have seen it.
  for (const fill of ["null", "noEdge"]) {
    for (let gap = 0; gap <= 60; gap++) {
      const { rows, declared } = bridgedWitnessLeg(gap, fill, { declare: false });
      const j = judge(rows, declared);
      const expected = gap >= 28 && gap <= 59 ? "fail" : "pass";
      assert.equal(
        j.oneWay.verdict,
        expected,
        `a ${gap}-tick ${fill} bridge: ${j.oneWay.reasons.join(" | ")}`,
      );
      assert.equal(j.oneWay.counts.convictingRuns, expected === "fail" ? 1 : 0);
    }
  }
  // The boundary, stated as the product's arithmetic rather than as 28: the
  // span is (gap + 2) ticks at the record's median period.
  const boundary = Math.round(PRODUCT.WRONG_WAY_SUSTAIN_SEC / 0.05) - 2;
  assert.equal(boundary, 28);
});

test("BRIDGE CONTROL: a CONTIGUOUS declared excursion of the same length still passes", () => {
  // The other half of every rule in this file. 30 contiguous against-flow ticks
  // = 1.50 s = wrongWaySustainSec exactly, declared, on a calibration short
  // enough to keep the declaration inside its budget — this leg MUST pass.
  const { rows, declared } = ringLeg(30, 89);
  const j = judge(rows, declared);
  assert.equal(j.oneWay.counts.againstFlowTicks, 30);
  assert.equal(j.oneWay.counts.declaredManoeuvreRuns, 1);
  assert.equal(j.oneWay.counts.convictingRuns, 0);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(j.verdict, "pass", j.reasons.join("\n"));
  assert.deepEqual(j.leg.testimony.mayTestify, ["lane position on oneWay"]);
});

/* ── 2. THE COMPENSATED SIM FREEZE — it defeats R6, and it is N2's own
 *      mechanism turned on the other clock. ───────────────────────────────*/

test("SIM-FREEZE 1 (defeats R6): a 30.00 s freeze repaid by ONE catch-up jump", () => {
  // MEASURED AGAINST THE PREVIOUS REVISION: clockDisagreementSec 0.000e+0 —
  // the two sums match to the bit — AC-RECORD = pass with ZERO reasons,
  // LEG = pass, mayTestify ["lane position on twoWay"], while longestSimGapSec
  // 30.05 and simGapsAtOrAboveSustain 1 were computed, published and gated
  // nothing. This is the literal shape the rule's own comment names
  // (devrig/rig.ts:54-55, "a teach card / quiz / consequence overlay stops
  // onTick entirely").
  const rows = goodRows();
  for (let i = 0; i < rows.length; i++) {
    if (i <= 300) rows[i].tSec = i / 20;
    else if (i <= 900) rows[i].tSec = 300 / 20;
    else rows[i].tSec = (i - 600) / 20 + 30;
  }
  const j = judge(rows, GOOD_DECLARED);

  // The summed rule is still blind, and that is asserted rather than assumed.
  assert.ok(j.record.metrics.clockDisagreementSec < 1e-9);
  near(j.record.metrics.simAdvanceSec, 62.95, 1e-9);
  near(j.record.metrics.wallAdvanceSec, 62.95, 1e-9);
  // The cumulative census is not: 30.00 s lost and 30.00 s repaid, and paying
  // one direction spends the other.
  near(j.record.metrics.simLostWallSec, 30.0, 1e-9);
  near(j.record.metrics.simGainedWallSec, 30.0, 1e-9);
  // …and the single-gap gate, which reads the counter that used to decorate.
  assert.equal(j.record.metrics.simGapsAtOrAboveSustain, 1);
  near(j.record.metrics.longestSimGapSec, 30.05, 1e-9);

  assert.equal(j.record.verdict, "unresolved");
  assert.equal(j.verdict, "unresolved");
  assert.deepEqual(j.leg.testimony.mayTestify, []);
  reasonMentioning(j.reasons, "the sim clock did not advance for 30.00 s of wall time in total");
  reasonMentioning(j.reasons, "1 sim-clock gap(s) at or above laneKeepSustainSec");
});

test("SIM-FREEZE 2, the stronger one: 21 freezes of 2.90 s, each under every per-step rule", () => {
  // MEASURED AGAINST THE PREVIOUS REVISION: 57.05 s of a 62.95 s leg with the
  // sim clock frozen, longestSimGapSec 2.95 (under the 3 s idea),
  // simGapsAtOrAboveSustain 0, wallGapsAtOrAboveSustain 0, droppedTicks 0,
  // clockDisagreementSec 1.95 s (under the 3 s bound) — AC-RECORD = pass,
  // LEG = pass, mayTestify certified. Not one per-step rule in the file could
  // see it, which is N2 exactly.
  const rows = goodRows();
  let t = 0;
  let i = 0;
  let frozen = 0;
  while (i < rows.length) {
    if (frozen < 21 && i >= 2) {
      const hold = t;
      for (let k = 0; k < 58 && i < rows.length; k++, i++) rows[i].tSec = hold;
      t = hold + 2.95;
      frozen++;
    }
    if (i < rows.length) {
      rows[i].tSec = t;
      t += 0.05;
      i++;
    }
  }
  const j = judge(rows, GOOD_DECLARED);

  // Every per-step census reads clean, one at a time — the claim under test is
  // that a cumulative rule was owed, so each contiguous one is asserted quiet.
  assert.equal(j.record.metrics.simGapsAtOrAboveSustain, 0);
  assert.equal(j.record.metrics.wallGapsAtOrAboveSustain, 0);
  assert.equal(j.record.counts.droppedTicks, 0);
  assert.equal(j.record.metrics.gapBlindWallMs, 0);
  assert.ok(j.record.metrics.longestSimGapSec < PRODUCT.LANE_KEEP_SUSTAIN_SEC);
  assert.ok(j.record.metrics.clockDisagreementSec < PRODUCT.LANE_KEEP_SUSTAIN_SEC);

  // And the cumulative one does not.
  assert.ok(
    j.record.metrics.simLostWallSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC,
    `simLostWallSec ${j.record.metrics.simLostWallSec}`,
  );
  assert.equal(j.record.verdict, "unresolved");
  assert.equal(j.verdict, "unresolved");
  reasonMentioning(j.reasons, "the sim clock did not advance for");
});

test("SIM-FREEZE 3: the sim pinned at 0 with one catch-up jump on the LAST tick", () => {
  // The degenerate case, and the one that shows the summed rule cannot be
  // patched by lowering its bound: the disagreement is EXACTLY zero on a leg
  // whose sim never advanced. Measured: LEG = pass, longestSimGapSec 62.95,
  // simGapsAtOrAboveSustain 1, medianTickPeriodSec 62.95 against a
  // medianWallPeriodSec of 0.05.
  const rows = goodRows();
  for (let i = 0; i < rows.length - 1; i++) rows[i].tSec = 0;
  rows[rows.length - 1].tSec = 62.95;
  const j = judge(rows, GOOD_DECLARED);
  assert.ok(j.record.metrics.clockDisagreementSec < 1e-9);
  near(j.record.metrics.medianTickPeriodSec, 62.95, 1e-9);
  assert.equal(j.record.metrics.medianWallPeriodSec, 0.05);
  near(j.record.metrics.simLostWallSec, 62.9, 1e-9);
  assert.equal(j.record.metrics.simGapsAtOrAboveSustain, 1);
  assert.notEqual(j.verdict, "pass");
});

test("SIM-FREEZE 4: the catch-up split into jumps too small to name", () => {
  // 30 jumps of 2.09 s, every one under laneKeepSustainSec, so not one sim gap
  // is even nameable: simGapsAtOrAboveSustain 0, clockDisagreementSec 0.00.
  // Measured LEG = pass before the cumulative census.
  const rows = goodRows();
  let t = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && i % 42 === 0 && t < 62.95) t = Math.min(62.95, t + 2.09);
    rows[i].tSec = t;
  }
  rows[rows.length - 1].tSec = 62.95;
  const j = judge(rows, GOOD_DECLARED);
  assert.equal(j.record.metrics.simGapsAtOrAboveSustain, 0);
  assert.ok(j.record.metrics.clockDisagreementSec < 1e-9);
  assert.ok(j.record.metrics.simLostWallSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC);
  assert.notEqual(j.verdict, "pass");
});

test("SIM-CENSUS CONTROL: an honest leg spends neither direction", () => {
  const j = judge(goodRows(), GOOD_DECLARED);
  assert.equal(j.record.verdict, "pass");
  assert.ok(j.record.metrics.simLostWallSec < 1e-9);
  assert.ok(j.record.metrics.simGainedWallSec < 1e-9);
  assert.equal(j.record.metrics.simGapsAtOrAboveSustain, 0);
});

/* ── 3. THE WALL CLOCK NOBODY CHECKED. ─────────────────────────────────────*/

test("WALL-COMPRESSION: 8.00 s of wrong-bank driving billed as 0.0659 s", () => {
  // 160 contiguous wrong-bank ticks — 8.00 s at the leg's own 20 Hz median —
  // with `wallMs` advancing 0.1 ms per tick inside the run, and BOTH clocks
  // following it so the two-clock rule stays quiet. MEASURED AGAINST THE
  // PREVIOUS REVISION: longestUndeclaredRunSec 0.0659 s under
  // solidLineCrossSustainSec 0.6, convictingRuns 0, againstFlowFrac 0.12698
  // under the 0.130434 ceiling, medianWallPeriodSec 0.05, gapBlindWallMs ~0,
  // clockDisagreementSec 0.00, LEG = pass.
  const rows = goodRows();
  for (let i = 200; i < 360; i++) rows[i].opposingBank = true;
  let w = rows[200].wallMs;
  for (let i = 200; i < 360; i++) {
    rows[i].wallMs = w;
    w += 0.1;
  }
  const shift = rows[359].wallMs - PERIOD_MS * 359;
  for (let i = 360; i < rows.length; i++) rows[i].wallMs += shift;
  for (const r of rows) r.tSec = r.wallMs / 1000;

  const j = judge(rows, GOOD_DECLARED);

  // The run really is still billed at 0.0659 s — the offence is not what is
  // caught, the CLOCK is, and that distinction is the point of the rule.
  assert.ok(j.twoWay.metrics.longestUndeclaredRunSec < PRODUCT.SOLID_LINE_CROSS_SUSTAIN_SEC);
  assert.equal(j.twoWay.counts.convictingRuns, 0);
  assert.ok(j.twoWay.metrics.againstFlowFrac < j.twoWay.metrics.againstFlowFracCeiling);
  // The gap census cannot see compression by construction: it only sums the
  // amount by which a step EXCEEDS the median.
  assert.ok(j.record.metrics.gapBlindWallMs < 1);
  // The mirror census can. The 160-tick run has 159 steps INSIDE it, each
  // short of the 0.05 s median by 0.0499 s: 159 × 0.0499 = 7.9341 s.
  near(j.record.metrics.cadenceLostWallSec, 7.9341, 1e-6);
  assert.equal(j.record.verdict, "unresolved");
  assert.notEqual(j.verdict, "pass");
  reasonMentioning(j.reasons, "falls short of the record's OWN median cadence");
});

test("WALL-ROLLBACK: the clock every duration is measured on gets `seq`'s refusal", () => {
  // The same 160-tick run with `wallMs` held at its own start, so the run
  // occupies zero wall time and the record's span comes up 8.00 s short with no
  // forward gap anywhere. MEASURED AGAINST THE PREVIOUS REVISION:
  // longestUndeclaredRunSec 0.050 s, convictingRuns 0, nonMonotonicSeqSteps 0,
  // gapBlindWallMs 0, recordSpanMs 54950 against a coveredWallMs of 63000,
  // LEG = pass. `seq` was checked for strict monotonicity from the first
  // revision; `wallMs` was never checked at all.
  const rows = goodRows();
  for (let i = 200; i < 360; i++) rows[i].opposingBank = true;
  const base = rows[200].wallMs;
  for (let i = 200; i < 360; i++) rows[i].wallMs = base;
  for (let i = 360; i < rows.length; i++) rows[i].wallMs -= 160 * PERIOD_MS;
  for (const r of rows) r.tSec = r.wallMs / 1000;

  const j = judge(rows, { ...GOOD_DECLARED, expectedSpanMs: 54950 });

  assert.equal(j.record.counts.nonMonotonicSeqSteps, 0, "seq is untouched — that is the point");
  // 159 zero-deltas inside the run, plus the step OUT of it: rows 200..359 all
  // carry wallMs 10000, and row 360 carries 50×360 − 8000 = 10000 as well.
  assert.equal(j.record.counts.nonMonotonicWallSteps, 160);
  assert.equal(j.record.verdict, "fail");
  assert.equal(j.verdict, "fail");
  reasonMentioning(j.reasons, "`wallMs` is not strictly increasing at 160 step(s)");
});

test("THE MEDIAN IS THE HOLE: a cadence of 50 ms / 2900 ms has no gaps by construction", () => {
  // MEASURED AGAINST THE PREVIOUS REVISION: medianWallPeriodSec 2.9, so
  // gapBlindWallMs reads 0 and wallGapsAtOrAboveSustain reads 0 while
  // 1 795 500 ms of the leg sits between samples; coveredWallMs 3 654 000 for a
  // record whose own span is 1 858 450; the AC-LANE sample floor collapsed
  // 180 → 30; LEG = pass. The gap census is measured against a quantity the
  // record authors, and this leg authors it to BE the hole.
  const rows = goodRows();
  let w = 0;
  for (let i = 0; i < rows.length; i++) {
    rows[i].wallMs = w;
    w += i % 2 === 0 ? 2900 : 50;
    rows[i].tSec = rows[i].wallMs / 1000;
  }
  const declared = {
    ...GOOD_DECLARED,
    calibration: { fromSeq: 0, toSeq: 39, offsetM: 1.0 },
    expectedSpanMs: rows[rows.length - 1].wallMs,
  };
  const j = judge(rows, declared);

  // The gap census is still blind — asserted, because "the other rule would
  // have caught it" is the claim under test.
  assert.equal(j.record.metrics.medianWallPeriodSec, 2.9);
  assert.equal(j.record.metrics.gapBlindWallMs, 0);
  assert.equal(j.record.metrics.wallGapsAtOrAboveSustain, 0);
  assert.equal(j.lane.counts.sampleFloor, 30);
  // The mirror census reads the same time from the other side. Of the 1259
  // steps, 630 are 2900 ms (so the median IS 2900) and 629 are 50 ms, each
  // short of that median by 2.85 s: 629 × 2.85 = 1792.65 s.
  near(j.record.metrics.cadenceLostWallSec, 1792.65, 1e-6);
  assert.equal(j.record.verdict, "unresolved");
  assert.notEqual(j.verdict, "pass");
  reasonMentioning(j.reasons, "or the median is the hole");
});

test("CADENCE-CENSUS CONTROL: ordinary jitter is not charged, and the gate is why", () => {
  // THE CENSUS THIS CONTROLS IS NOT SYMMETRIC WITH ITS SIBLING, and the naive
  // version was unusable. `gapBlindWallMs` sums how far each step EXCEEDS the
  // record's median period; on an alternating cadence the median lands at the
  // TOP of the jitter band, so that census reads 0 at every jitter level. The
  // mirror (`cadenceLostWallSec`) sums the shortfall, so without a gate it
  // charged the entire band and refused an honest record at 4.8 % jitter.
  //
  // MEASURED on this leg, ungated: ±2.4 ms → 3.019 s → unresolved; ±5 ms →
  // 6.290 s; ±20 ms → 25.160 s. gapBlindWallMs 0 throughout.
  //
  // The gate charges only steps under HALF the median period — see the module
  // for the derivation from `seq` being an integer — which on this leg
  // tolerates jitter up to ±16.67 ms (solve 50 − j < (50 + j)/2).
  const jittered = (jMs) => {
    const rows = goodRows();
    let w = 0;
    for (let i = 0; i < rows.length; i++) {
      rows[i].wallMs = w;
      w += PERIOD_MS + (i % 2 === 0 ? jMs : -jMs);
      rows[i].tSec = rows[i].wallMs / 1000;
    }
    return rows;
  };

  for (const j of [0, 1, 2, 2.4, 5, 10, 16]) {
    const r = judge(jittered(j), GOOD_DECLARED);
    // A DURATION, so it takes this file's tolerance: the alternating cadence
    // leaves binary-float residue (measured: 8.65e-10 ms at ±2.4 ms). The
    // cadence census below is compared EXACTLY, because the gate means nothing
    // is added to it at all rather than nearly nothing.
    near(r.record.metrics.gapBlindWallMs, 0, 1e-6);
    assert.equal(
      r.record.metrics.cadenceLostWallSec,
      0,
      `±${j} ms is inside the gate and must cost nothing`,
    );
    assert.equal(r.record.verdict, "pass", `±${j} ms: ${r.record.reasons.join("\n")}`);
  }

  // …and past the gate it is charged, so the rule is not decoration.
  const past = judge(jittered(20), GOOD_DECLARED);
  near(past.record.metrics.cadenceLostWallSec, 25.16, 1e-6);
  assert.equal(past.record.verdict, "unresolved");
});

test("DROPPED TICKS THAT OCCUPIED NO TIME: `droppedTicks` gets a consumer", () => {
  // `seq` strides 60 while `wallMs` advances 50 ms. MEASURED AGAINST THE
  // PREVIOUS REVISION: droppedTicks 74 281 claimed inside a 63 s leg — an
  // implied 1 200 Hz against a 20 Hz median — maxContiguousDrop 59,
  // impliedDropBlindSec 2.95 s (just under the clock), LEG = pass. Only
  // `maxContiguousDrop` was consumed, so spreading the drops walked through it.
  const rows = goodRows();
  for (let i = 0; i < rows.length; i++) rows[i].seq = i * 60;
  const declared = {
    ...GOOD_DECLARED,
    calibration: { fromSeq: 0, toSeq: 99 * 60, offsetM: 1.0 },
    curvedSpans: [{ fromSeq: 400 * 60, toSeq: 1200 * 60 }],
  };
  const j = judge(rows, declared);

  assert.equal(j.record.counts.droppedTicks, 74281);
  assert.equal(j.record.counts.maxContiguousDrop, 59);
  near(j.record.metrics.impliedDropBlindSec, 2.95, 1e-9);
  assert.ok(
    j.record.metrics.impliedDropBlindSec < PRODUCT.LANE_KEEP_SUSTAIN_SEC,
    "the CONTIGUOUS drop rule must NOT be what convicts this leg",
  );
  near(j.record.metrics.dropBlindWallSec, 74281 * 0.05, 1e-6);
  assert.equal(j.record.verdict, "unresolved");
  assert.notEqual(j.verdict, "pass");
  reasonMentioning(j.reasons, "dropped tick(s) in total");
});

/* ── 4. THE RULES THAT WERE SCOPED TO A BUCKET THE RECORD DECLARES. ────────*/

/** The known-good leg with a NARROW declared curved bucket at the end. */
const NARROW_BUCKET = { ...GOOD_DECLARED, curvedSpans: [{ fromSeq: 1000, toSeq: 1259 }] };

test("LEG-WIDE p90: 900 ticks at 3.00 m outside the bucket are past the ceiling the leg is certified against", () => {
  // 3.00 m is UNDER laneKeepMaxOffsetM 3.25, so the excursion census never
  // fires, and 25 % PAST the p90 ceiling of 2.40 m — a band that was judged
  // inside the declared bucket and nowhere else. MEASURED AGAINST THE PREVIOUS
  // REVISION: p90AbsOffsetM 0.8929 (the bucket is clean), excludedFrac 0,
  // longestExcursionSec 0, cumulativeExcursionSec 0, LEG = pass, mayTestify
  // ["lane position on twoWay"].
  const rows = goodRows();
  for (let i = 100; i < 1000; i++) rows[i].laneOffsetM = 3.0;
  const j = judge(rows, NARROW_BUCKET);

  assert.ok(j.lane.metrics.p90AbsOffsetM < 2.4, "the BUCKET statistic is still clean");
  assert.equal(j.lane.metrics.longestExcursionSec, 0);
  assert.equal(j.lane.metrics.cumulativeExcursionSec, 0);
  assert.equal(j.lane.metrics.excludedFrac, 0);
  near(j.lane.metrics.legP90AbsOffsetM, 3.0, 1e-9);
  assert.equal(j.lane.verdict, "fail");
  assert.equal(j.verdict, "fail");
  reasonMentioning(j.reasons, "leg-wide p90 |laneOffsetM| 3.000 m > ceiling 2.40 m");
});

test("LEG-WIDE EXCLUSION: `laneLinesPainted: false` is metered outside the bucket too", () => {
  // The same 900 ticks at 40.00 m flagged unpainted. Inside the bucket that
  // flag is charged against EXCLUDED_FRACTION_CEILING; outside it was charged
  // against nothing AND it drops the row from `excursionEligible`. MEASURED
  // AGAINST THE PREVIOUS REVISION: excursionScanTicks 260 of 1260,
  // excursionTicks 0, excludedFrac 0, unpaintedTicks 0, LEG = pass.
  const rows = goodRows();
  for (let i = 100; i < 1000; i++) {
    rows[i].laneOffsetM = 40.0;
    rows[i].laneLinesPainted = false;
  }
  const j = judge(rows, NARROW_BUCKET);

  assert.equal(j.lane.counts.unpaintedTicks, 0, "the bucket sees none of them");
  assert.equal(j.lane.metrics.excludedFrac, 0);
  assert.equal(j.lane.counts.legUnpaintedTicks, 900);
  assert.ok(j.lane.metrics.legExcludedFrac > EXCLUDED_FRACTION_CEILING);
  assert.notEqual(j.verdict, "pass");
  reasonMentioning(j.reasons, "over the WHOLE leg");
});

test("LEG-WIDE GEOMETRY: `worldEdgeClearanceM < 0` is not a claim about a bend", () => {
  // The only unconditional FAIL in AC-LANE was scanned with `curved.some(...)`.
  // MEASURED AGAINST THE PREVIOUS REVISION: 900 ticks at −12 m outside the
  // declared span → LEG = pass and AC-LANE raised no reason at all.
  const rows = goodRows();
  for (let i = 100; i < 1000; i++) rows[i].worldEdgeClearanceM = -12;
  const j = judge(rows, NARROW_BUCKET);
  assert.equal(j.lane.counts.offWorldTicks, 900);
  assert.equal(j.lane.counts.offWorldTicksInCurvedSpans, 0);
  assert.equal(j.lane.verdict, "fail");
  assert.equal(j.verdict, "fail");
  reasonMentioning(j.reasons, "the car left the authored world");
});

test("UNCLASSIFIED IS CUMULATIVE: 754 ticks with no edge, in runs of 2.90 s each", () => {
  // AC-RECORD's gap census and AC-LANE's excursion census were both made
  // cumulative; AC-FLOW's unclassified census was left contiguous-only and
  // `unclassifiedTicks` was compared to nothing. MEASURED AGAINST THE PREVIOUS
  // REVISION: longestUnclassifiedRunSec 2.90 (under the 3 s rule), a two-way
  // denominator of 506, unclassifiedTicks 754, LEG = pass certifying
  // mayTestify ["lane position on twoWay"].
  const rows = goodRows();
  let n = 0;
  for (let block = 0; n < 812; block++) {
    const start = 100 + block * 70;
    if (start + 58 > 1000) break;
    for (let k = 0; k < 58 && n < 812; k++, n++) rows[start + k].edgeId = null;
  }
  const j = judge(rows, NARROW_BUCKET);

  assert.equal(j.flow.counts.unclassifiedTicks, 754);
  assert.ok(
    j.flow.counts.longestUnclassifiedRunSec < PRODUCT.LANE_KEEP_SUSTAIN_SEC,
    "the CONTIGUOUS rule must NOT be what convicts this leg",
  );
  near(j.flow.counts.unclassifiedWallSec, 37.7, 1e-9);
  assert.equal(j.flow.verdict, "unresolved");
  assert.notEqual(j.verdict, "pass");
  reasonMentioning(j.reasons, "the flow question is unanswered for one complete episode's worth");
});

test("THE CALIBRATION MUST BE SOMEWHERE THE REFERENT CAN STILL ANSWER FROM", () => {
  // A 6.25 s park declared at 40.00 m and read back at 40.00 m. MEASURED
  // AGAINST THE PREVIOUS REVISION: injectionErrM 0.0000, so AC-REFERENT
  // congratulated it; `removalSpansOf` made the span exempt from the excursion
  // census; declaredRemovedFrac 0.0993 stayed under the 0.1 ceiling; LEG =
  // pass. The check certified AGREEMENT and said nothing about WHERE.
  const rows = goodRows();
  for (let i = 0; i < 125; i++) rows[i].laneOffsetM = 40.0;
  const j = judge(rows, {
    ...GOOD_DECLARED,
    calibration: { fromSeq: 0, toSeq: 124, offsetM: 40.0 },
  });

  assert.equal(j.referent.metrics.injectionErrM, 0, "the record and the declaration AGREE");
  assert.ok(j.lane.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);
  assert.equal(j.lane.counts.excursionTicks, 0);
  assert.equal(j.referent.verdict, "fail");
  assert.equal(j.verdict, "fail");
  reasonMentioning(j.reasons, "at or past the saturation bound LANE_WIDTH_M/2 = 4.0625 m");

  // CONTROL: the known-good leg's own 1.00 m injection is nowhere near it.
  const good = judge(goodRows(), GOOD_DECLARED);
  assert.equal(good.referent.verdict, "pass");
  assert.equal(good.referent.metrics.injectionSaturationM, 4.0625);
});

test("N14 IN THE OTHER DIRECTION: `opposingBank: true` on a row filed ONE-WAY", () => {
  // N14 refuses `wrongWay: true` on a two-way row. The mirror is exactly as
  // impossible — `opposingBank` is set only inside `if (!edgeRt.edge.oneway)` —
  // and had no rule, so a tap that mis-files wrong-bank ticks as one-way put
  // them in a denominator whose discriminator (`wrongWay`) reads a clean false.
  // MEASURED AGAINST THE PREVIOUS REVISION: oneWayContradictoryRows 0,
  // oneWayFrac 0.0238 over 600 wrong-bank ticks (30.00 s), LEG = pass
  // certifying mayTestify ["lane position on oneWay"].
  const rows = goodRows().map((r) => ({ ...r, oneway: true, wrongWay: false }));
  for (let i = 300; i < 900; i++) rows[i].opposingBank = true;
  for (let k = 0; k < 30; k++) rows[100 + k].wrongWay = true;
  const j = judge(rows, {
    ...GOOD_DECLARED,
    channels: ["wrongWay"],
    calibration: { fromSeq: 0, toSeq: 89, offsetM: 1.0 },
    curvedSpans: [{ fromSeq: 1000, toSeq: 1259 }],
    manoeuvreSpans: [{ fromSeq: 100, toSeq: 129 }],
  });

  assert.equal(j.oneWay.counts.contradictoryRows, 600);
  assert.equal(j.oneWay.metrics.againstFlowFrac, 30 / 1260, "the discriminator still reads clean");
  assert.equal(j.oneWay.verdict, "fail");
  assert.equal(j.verdict, "fail");
  assert.deepEqual(j.flow.surfacesJudged, []);
  reasonMentioning(j.reasons, "`opposingBank` is set only inside `if (!edgeRt.edge.oneway)`");
});

/* ── 5. THE TWO THAT ARE STILL LIVE, pinned at the verdict they GET. ───────*/

test("L8 (STILL LIVE, disclosed): a leg can spend two surfaces' budgets and stay under its own mix", () => {
  // 630 two-way ticks carrying 77 against-flow in honest 0.55 s runs
  // (0.1222 < 0.130434) plus 630 one-way ticks carrying 146 in honest 1.45 s
  // runs (0.2317 < 0.272727), the one-way witness supplied by a 1.50 s declared
  // manoeuvre. 223 against-flow ticks = 11.15 s = 17.70 % of the leg, and
  // LEG = pass with mayTestify ["lane position on twoWay, oneWay"].
  //
  // THIS TEST ASSERTS THE PASS ON PURPOSE. The leg-wide bound added this
  // revision is the mix ceiling — (630 × 0.130434 + 630 × 0.272727) / 1260 =
  // 0.201581 — and 0.1770 is genuinely under it, because every run really is
  // separately lawful and the duty-cycle derivation really does allow that
  // much. Redding it would take a chosen number wearing a derivation, which is
  // the thing this file refuses to do. If a later revision CAN red it honestly,
  // this test goes red and L8 in the module header must be rewritten.
  const rows = goodRows();
  for (let i = 630; i < rows.length; i++) {
    rows[i].oneway = true;
    faceRow(rows[i], false);
  }
  let tw = 0;
  for (let b = 0; b < 7; b++) for (let k = 0; k < 11; k++, tw++) rows[100 + b * 70 + k].opposingBank = true;
  let ow = 0;
  for (let k = 0; k < 30; k++, ow++) faceRow(rows[640 + k], true);
  for (let b = 0; b < 4 && ow < 146; b++) {
    for (let k = 0; k < 29 && ow < 146; k++, ow++) faceRow(rows[700 + b * 120 + k], true);
  }
  assert.equal(tw, 77);
  assert.equal(ow, 146);

  const j = judge(rows, {
    ...GOOD_DECLARED,
    channels: ["opposingBank", "wrongWay"],
    calibration: { fromSeq: 0, toSeq: 89, offsetM: 1.0 },
    curvedSpans: [{ fromSeq: 1000, toSeq: 1259 }],
    manoeuvreSpans: [{ fromSeq: 640, toSeq: 669 }],
  });

  assert.ok(j.twoWay.metrics.againstFlowFrac < j.twoWay.metrics.againstFlowFracCeiling);
  assert.ok(j.oneWay.metrics.againstFlowFrac < j.oneWay.metrics.againstFlowFracCeiling);
  assert.equal(j.flow.counts.legAgainstFlowTicks, 223);
  assert.equal(j.flow.counts.legClassifiedTicks, 1260);
  near(j.flow.metrics.legAgainstFlowFrac, 223 / 1260, 1e-12);
  near(j.flow.metrics.legAgainstFlowFracCeiling, 0.20158102766798417, 1e-12);
  assert.ok(
    j.flow.metrics.legAgainstFlowFrac < j.flow.metrics.legAgainstFlowFracCeiling,
    "L8: the leg is under the ceiling its own surface mix affords",
  );
  assert.equal(j.verdict, "pass", j.reasons.join("\n"));
  assert.deepEqual(j.leg.testimony.mayTestify, ["lane position on twoWay, oneWay"]);
});

test("L8 CONTROL: the leg-wide bound DOES bite when the mix cannot afford the total", () => {
  // The rule is not decoration. Same 1260 ticks, all two-way, with 300 against
  // the flow in runs that are each separately lawful on that surface's clock:
  // 300/1260 = 0.2381 against a mix ceiling of 0.130434 — the two-way ceiling,
  // because that is the only surface in the mix.
  const rows = goodRows();
  for (let b = 0; b < 30; b++) for (let k = 0; k < 10; k++) rows[100 + b * 30 + k].opposingBank = true;
  const j = judge(rows, NARROW_BUCKET);
  assert.equal(j.flow.counts.legAgainstFlowTicks, 300);
  near(j.flow.metrics.legAgainstFlowFracCeiling, surfaceAgainstFlowFracCeiling(SURFACE.TWO_WAY), 1e-12);
  assert.ok(j.flow.metrics.legAgainstFlowFrac > j.flow.metrics.legAgainstFlowFracCeiling);
  reasonMentioning(j.reasons, "classified tick(s) across the whole leg are against the flow");
  assert.notEqual(j.verdict, "pass");
});

test("L9 IS RETIRED: the calibration/witness trade is zero-sum inside one ceiling", () => {
  // WHAT L9 WAS. "The witness floor is defeated by SHRINKING the calibration."
  // R7's argument for not being widenable was that lengthening the witness
  // spends declared-removal budget, and that on row 71's leg the floor and the
  // budget met with nothing between them. THEY MET ONLY BECAUSE THAT LEG'S
  // CALIBRATION PARK HAPPENS TO BE 5.00 s: the budget is
  // (calibration + witness) / leg, and no product constant fixes the park's
  // length and no rule here bounded it from below. Four measured lines, which
  // this test ran and asserted at their CHEATING verdict on purpose:
  //
  //   calibration 5.00 s → LEG=fail    (6.50/62.95 = 0.10326 > 0.1)
  //   calibration 4.50 s → LEG=pass    (6.00/62.95 = 0.09531)
  //   calibration 4.00 s → LEG=pass    (5.50/62.95 = 0.08737)
  //   calibration 3.00 s → LEG=pass    (4.50/62.95 = 0.07149)
  //
  // THE SAME FOUR LINES STILL HOLD, and they are still run below — but they are
  // no longer a cheat, and the reason is not that a number moved. What the
  // trade used to BUY was an acquittal of 1230 ticks nobody had measured: the
  // witness was the only thing that could arm an ambiguous channel, so a park
  // shortened by half a second bought the whole rest of the leg. With the
  // signed value those ticks state their own direction, so the trade buys
  // exactly one thing — the removal of the DECLARED ticks themselves — and that
  // is bounded, because the budget is a FRACTION of the leg and the park and
  // the witness spend the same one. Moving budget between them cannot increase
  // the total, and the total is what §DECLARED caps.
  //
  // THIS TEST IS THEREFORE THE DISCLOSURE'S FUNERAL, kept executable so that a
  // later revision which re-introduces a witness-like rule reds here.
  const at = (calTo) => {
    const { rows, declared } = ringLeg(30, calTo);
    return judge(rows, declared);
  };

  // 5.00 s park: the declaration is over budget, so it is STRIPPED, and the
  // 1.50 s run it would have covered convicts on the product's own clock. The
  // budget rule is untouched by R18 and is what refuses this.
  const five = at(99);
  near(five.flow.metrics.declaredRemovedFrac, 0.10325655281969817, 1e-12);
  assert.ok(five.flow.metrics.declaredRemovedFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(five.oneWay.counts.declaredManoeuvreRuns, 0, "stripped");
  assert.equal(five.oneWay.counts.convictingRuns, 1);
  assert.equal(five.verdict, "fail");

  // The three shorter parks buy the declaration room, exactly as L9 measured —
  // and a pass is now the RIGHT answer, because every tick outside the declared
  // span says it faced along the edge.
  for (const [calTo, frac] of [
    [89, 0.09531374106433677],
    [79, 0.08737092930897537],
    [59, 0.07148530579825257],
  ]) {
    const j = at(calTo);
    near(j.flow.metrics.declaredRemovedFrac, frac, 1e-12);
    assert.ok(j.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);
    assert.equal(j.oneWay.counts.declaredManoeuvreTicks, 30);
    assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0, "nothing is bought on trust");
    assert.equal(j.verdict, "pass", j.reasons.join("\n"));
    assert.deepEqual(j.leg.testimony.mayTestify, ["lane position on oneWay"]);
  }

  // AND THE TRADE IS ZERO-SUM, which is the sentence that retires L9. Shrink
  // the park to nothing and the declared-removal budget does not grow: the
  // ceiling is a fraction of the LEG, so the most a declaration can ever remove
  // is EXCLUDED_FRACTION_CEILING of it, park and excursions together. A witness
  // long enough to matter is still paid for out of the same purse.
  const short = ringLeg(30, 19); // a 1.00 s park
  const s = judge(short.rows, short.declared);
  near(s.flow.metrics.declaredRemovedWallSec, 2.5, 1e-9);
  assert.ok(s.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);
  const huge = ringLeg(200, 19); // 10.00 s of declared excursion on a 1.00 s park
  const h = judge(huge.rows, huge.declared);
  assert.ok(
    h.flow.metrics.declaredRemovedFrac > EXCLUDED_FRACTION_CEILING,
    "the freed budget does not buy an unbounded declaration",
  );
  assert.equal(h.oneWay.counts.declaredManoeuvreRuns, 0, "stripped, and it convicts");
  assert.equal(h.oneWay.counts.convictingRuns, 1);
  assert.equal(h.verdict, "fail");

  // …AND WITH THE SIGNAL STRIPPED, NONE OF THE FOUR CAN CLEAR THE LEG, which is
  // what shows the passes above are bought by the record and not by the park.
  for (const calTo of [99, 89, 79, 59]) {
    const { rows, declared } = ringLeg(30, calTo, { signal: false });
    assert.notEqual(judge(rows, declared).verdict, "pass", `calTo ${calTo}`);
  }
});

test("L10 (DISCLOSED): the sign is carried and NOT read by the one-way surface — proved, not asserted", () => {
  // THE MUTATION THAT SURVIVES, AND WHY IT ALWAYS WILL. The founder ruled a
  // SIGNED value; the tick publishes it signed, the probe forwards it signed
  // and the record carries it signed. But the ONE-WAY DISCRIMINATOR cannot be
  // made to depend on the sign: its threshold is symmetric (|deg| > 120) and
  // its reverse rotation is exactly 180°, so replacing `alignDeg` with
  // `|alignDeg|` changes no verdict anywhere. That is an EQUIVALENT MUTANT —
  // not an untested line — and this test exists so nobody spends a session
  // hunting for the fixture that would kill it.
  //
  // PROVED BY EXHAUSTION over the published range, both gears, at a step far
  // finer than any angle the runtime produces. `norm` and the threshold are
  // restated here deliberately: this is a claim about the ARITHMETIC, and a
  // version of it that imported the module's own helper would only prove the
  // module agrees with itself. The model below rotates on `gear === -1`; the
  // module additionally requires the record to say the car MOVES (R20), and the
  // stationary case is checked separately at the bottom of this test — it reads
  // the UNROTATED nose, against the same symmetric threshold, so the sign
  // cannot matter there either.
  const T = PRODUCT.WRONG_WAY_ANGLE_DEG;
  const norm = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
  const verdict = (deg, gear) => Math.abs(norm(gear === -1 ? deg + 180 : deg)) > T;
  const signBlind = (deg, gear) =>
    Math.abs(norm(gear === -1 ? Math.abs(deg) + 180 : Math.abs(deg))) > T;

  let pairs = 0;
  for (let i = -360000; i <= 360000; i++) {
    const deg = i / 2000;
    if (deg <= -180 || deg > 180) continue; // the published range, exactly
    for (const gear of [1, -1, 0, 2, 3]) {
      pairs++;
      if (verdict(deg, gear) !== signBlind(deg, gear)) {
        assert.fail(`the sign changes the verdict at deg=${deg} gear=${gear}`);
      }
    }
  }
  assert.equal(pairs, 3600000, "720 001 angles × five gears");

  // …AND THE CLOSED FORM, so the arithmetic above is not just self-consistent:
  // forwards it is |deg| > 120, in reverse it is (180 − |deg|) > 120.
  for (let i = -3600; i <= 3600; i++) {
    const deg = i / 20;
    if (deg <= -180 || deg > 180) continue;
    assert.equal(verdict(deg, 1), Math.abs(deg) > T, `forward at ${deg}`);
    assert.equal(verdict(deg, -1), 180 - Math.abs(deg) > T, `reverse at ${deg}`);
  }

  // WHAT THE MODULE ACTUALLY DOES AGREES WITH THAT CLOSED FORM. Sampled through
  // the public API at the points where a sign error would show if one existed.
  const face = (deg, gear) => {
    const rows = goodRows().map((r) => faceRow({ ...r, oneway: true, gear }, false));
    for (const r of rows) r.alignDeg = deg;
    return judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] }).oneWay.counts
      .againstFlowTicks;
  };
  for (const deg of [-179, -140, -120.5, -120, -4, 0, 4, 120, 120.5, 140, 179, 180]) {
    for (const gear of [1, -1]) {
      assert.equal(
        face(deg, gear) > 0,
        verdict(deg, gear),
        `the module disagrees with the closed form at deg=${deg} gear=${gear}`,
      );
    }
  }

  // …AND R20 DOES NOT MOVE THE EQUIVALENCE. The rotation is additionally gated
  // on the record saying the car is MOVING, so a stationary reverse tick reads
  // the UNROTATED nose — and `|deg| > 120` is symmetric, so taking the absolute
  // value cannot change that reading either. Sampled where it would show, and
  // beside it the R20 invariant itself: while the car is stopped the verdict
  // does not move with the gear lever.
  const faceStopped = (deg, gear) => {
    const rows = goodRows().map((r) =>
      faceRow({ ...r, oneway: true, gear, speedKmh: 0 }, false),
    );
    for (const r of rows) r.alignDeg = deg;
    return judge(rows, { ...GOOD_DECLARED, channels: ["wrongWay"] }).oneWay.counts
      .againstFlowTicks;
  };
  for (const deg of [-179, -140, -120.5, -120, -4, 4, 120, 120.5, 140, 179]) {
    assert.equal(faceStopped(deg, -1) > 0, Math.abs(deg) > T, "stopped in reverse at " + deg);
    assert.equal(
      faceStopped(deg, -1),
      faceStopped(deg, 1),
      "the gear lever is not a direction of travel while stopped, at " + deg,
    );
  }

  // WHERE THE SIGN WOULD BE READ, AND IS NOT: the TWO-WAY surface, via
  // `alignTravelDir`. Rotating `deg` by 180° on the bank the car occupies turns
  // it into a bank-relative angle, which is the only thing in the record that
  // could tell an opposing-bank car from a correctly-placed one — `laneOffsetM`
  // is "+ = left of TRAVEL" on both banks and carries no bank at all. This file
  // does NOT do that (module L2): the two-way discriminator is still
  // `opposingBank`, and a two-way row's `alignTravelDir` is read by nothing.
  const twoWay = goodRows().map((r) => ({
    ...r,
    alignDeg: 178,
    alignTravelDir: -1,
    wrongWayArmed: false,
  }));
  const j = judge(twoWay, GOOD_DECLARED);
  assert.equal(j.twoWay.counts.denominator, 1260);
  assert.equal(
    j.twoWay.counts.againstFlowTicks,
    0,
    "a two-way row facing 178° off the geometry on the −1 bank is NOT read as against the flow",
  );
  assert.equal(j.twoWay.verdict, "pass", "and the surface passes — that is L2, disclosed");
});


/* ────────────────────────────────────────────────────────────────────────────
 * THE SUITE'S OWN CONTROL. A fixture that has drifted from the recipe in the
 * ledger rows proves nothing about the rows, so the recipe is asserted too.
 * ──────────────────────────────────────────────────────────────────────────*/

test("the fixture still matches the recipe rows 62-67 carry", () => {
  const rows = goodRows();
  assert.equal(rows.length, 1260);
  assert.equal(rows[0].seq, 0);
  assert.equal(rows[1259].seq, 1259);
  assert.equal(rows[1259].wallMs, 62950);
  near(rows[1259].tSec, 62.95, 1e-9);
  assert.equal(rows[0].laneOffsetM, 1.0);
  assert.equal(rows[99].laneOffsetM, 1.0);
  assert.notEqual(rows[100].laneOffsetM, 1.0);
  assert.equal(rows.filter((r) => r.edgeId === "e1").length, 1260);
  assert.equal(rows.filter((r) => r.oneway === false).length, 1260);
  assert.equal(rows.filter((r) => r.speedKmh === 30).length, 1260);
  assert.equal(rows.filter((r) => r.gear === 1).length, 1260);
  assert.equal(rows.filter((r) => r.worldEdgeClearanceM === 2).length, 1260);
  assert.equal(GOOD_DECLARED.expectedSpanMs, 1259 * PERIOD_MS);

  // The pin is a pure function of the declaration and nothing else: adding a
  // manoeuvre span MUST move it, or a span could be rewritten after the drive.
  const a = declaredSpansHash(GOOD_DECLARED);
  const b = declaredSpansHash({ ...GOOD_DECLARED, manoeuvreSpans: [{ fromSeq: 1, toSeq: 2 }] });
  assert.equal(a, declaredSpansHash({ ...GOOD_DECLARED }));
  assert.notEqual(a, b);
});

test("the direction-signal fixture helpers say what they claim, in both directions", () => {
  // THE FAILURE MODE THIS STAGE IS MOST EXPOSED TO IS A FIXTURE EDITED UNTIL IT
  // PASSES, and every one-way fixture above now runs through two helpers. So
  // the helpers get a control of their own: `faceRow` must write an angle the
  // PRODUCT'S OWN THRESHOLD agrees with, and `unfaceRow` must remove the whole
  // record and nothing else.
  const lawful = faceRow({ edgeId: "e1", gear: 1 }, false);
  assert.ok(Math.abs(lawful.alignDeg) <= PRODUCT.WRONG_WAY_ANGLE_DEG, "aligned is inside 120°");
  assert.equal(lawful.wrongWay, false);
  const against = faceRow({ edgeId: "e1", gear: 1 }, true);
  assert.ok(Math.abs(against.alignDeg) > PRODUCT.WRONG_WAY_ANGLE_DEG, "opposed is past 120°");
  assert.equal(against.wrongWay, true);
  // The opposed angle is SIGNED NEGATIVE on purpose: a reader that loses the
  // sign somewhere must not be able to mistake it for the most aligned tick in
  // the record, so the fixture makes the mistake visible rather than benign.
  assert.ok(against.alignDeg < 0);

  // `unfaceRow` removes the direction record and leaves the rest untouched —
  // including `wrongWay`, because the retired dialect IS the boolean alone.
  const stripped = unfaceRow({ ...against });
  assert.deepEqual(Object.keys(stripped).sort(), ["edgeId", "gear", "wrongWay"]);
  assert.equal(stripped.wrongWay, true);
  assert.equal(stripped.alignDeg, undefined);
});
