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
// TWO CHEATS IN THIS FILE ARE STILL LIVE, AND THEY ARE ASSERTED AT THE VERDICT
// THEY GET. The previous revision of this header said "NO CHEAT IN THIS FILE IS
// STILL LIVE" and it was not true even of the legs already in the file: a third
// adversarial pass rebuilt them from outside and got FOURTEEN more to read
// `LEG = pass`, including one on the very leg L7's "not widenable" argument is
// made on. Twelve are closed and are below; the two that are not are pinned as
// L8 and L9 — a `pass` is asserted on purpose, so a later repair REDS THIS
// FILE and makes whoever writes it come back and rewrite the disclosure. A
// suite that quietly starts passing a cheat is how the last claim survived.
//
//   L9, the one that matters most here, is ROW 71 REOPENED. The previous
//   revision retired N15b on the strength of "the floor and the budget meet
//   with no gap" — which is true only for a 5.00 s calibration park. Shorten
//   the park to 4.50 s and the same 1.50 s witness passes the same leg. Row 71
//   must NOT be retired on the N15b tests above.
//
// WHAT ELSE IS STILL LIVE IS DISCLOSED IN THE MODULE: L1-L9 of
// road-criteria.mjs. The founder-ruled signed travel-direction value is what
// closes L7 and L9 together, and the SEAM test at the bottom of this file names
// what it replaces.
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
  const rows = goodRows().map((r) => ({ ...r, oneway: true, wrongWay: false }));
  // Row 62: "every row oneway true, wrongWay chopped 11-on/1-off across seq
  // 400..1199, declared channels [\"wrongWay\"]".
  let marked = 0;
  for (let i = 400; i < 1200; i++) {
    if (i % 12 !== 11) {
      rows[i].wrongWay = true;
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

  // ROW 68's IDENTITY, ASSERTED RATHER THAN DESCRIBED: the predicate that ARMS
  // the one-way channel and the predicate that COUNTS the offence are the same
  // filter, so the channel can only ever be armed by the offence it exists to
  // detect. This is what the founder ruling is about.
  assert.equal(j.oneWay.counts.discriminatorTrueTicks, j.oneWay.counts.againstFlowTicks);

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
function ringLeg(witnessTicks, calTo = 99) {
  const rows = goodRows().map((r) => ({ ...r, oneway: true, wrongWay: false }));
  // Row 71's REPAIRED fixture: the witness is moved clear of the calibration
  // park (lane B's first attempt overlapped it at seq 0..19 and the module
  // refused the overlap, which row 70 mis-read as the criteria catching this).
  for (let i = 200; i < 200 + witnessTicks; i++) rows[i].wrongWay = true;
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

test("N15b (row 71): ONE DECLARED WRONG-WAY SECOND NO LONGER BUYS THE LEG — the WITNESS FLOOR refuses it", () => {
  const { rows, declared } = ringLeg(20);
  const j = judge(rows, declared);

  // ── THE VERDICT ROW 71 ASKED FOR. It used to read `pass` here, and this
  // file used to assert that on purpose with the acceptance test parked in a
  // `{ todo: true }` case beside it. Both are now one assertion.
  assert.equal(j.verdict, "unresolved");
  assert.equal(j.flow.verdict, "unresolved");
  assert.equal(j.oneWay.verdict, "unresolved");
  assert.deepEqual(j.flow.surfacesJudged, []);
  assert.deepEqual(j.leg.testimony.mayTestify, []);

  // THE CHEAT IS INTACT — every number row 71 measured is still exactly what it
  // was. What changed is that a rule now reads them.
  assert.equal(j.oneWay.counts.denominator, 1260);
  assert.equal(j.oneWay.counts.againstFlowTicks, 20);
  assert.equal(j.oneWay.counts.discriminatorTrueTicks, 20);
  near(j.oneWay.metrics.againstFlowFrac, 0.015873015873015872, 1e-12);
  assert.equal(j.oneWay.counts.declaredManoeuvreRuns, 1);
  assert.equal(j.oneWay.counts.declaredManoeuvreTicks, 20);
  assert.equal(j.oneWay.counts.convictingRuns, 0);
  assert.equal(rows.filter((r) => r.wrongWay === false).length, 1240);

  // ── WIDENING-PROOF, THE SAME SHAPE N12 CARRIES. Neither pre-existing ceiling
  // binds on this leg, and both are asserted NOT to bind, so a later edit that
  // reds N15b by moving one of them fails here instead of passing quietly.
  //  · the FRACTION ceiling does not: 20/1260 = 0.0159 is two orders under
  //    0.2727, and it is under it BECAUSE the offence is one second long.
  assert.ok(
    j.oneWay.metrics.againstFlowFrac < j.oneWay.metrics.againstFlowFracCeiling,
    "the fraction ceiling must NOT be what convicts N15b",
  );
  //  · the DECLARED-REMOVAL ceiling does not: 6.00 s of a 62.95 s leg = 0.0953,
  //    0.0047 under the 0.1 ceiling.
  near(j.flow.metrics.declaredRemovedWallSec, 6.0, 1e-9);
  near(j.flow.metrics.declaredRemovedFrac, 0.09531374106433677, 1e-12);
  assert.ok(
    j.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING,
    "the declared-removal ceiling must NOT be what convicts N15b",
  );
  assert.equal(j.oneWay.counts.undeclaredRuns, 0, "and no run is convicted on length either");

  // ── WHAT DOES CONVICT: the witness is 1.000 s of a channel the engine only
  // believes after wrongWaySustainSec 1.5 s (rules/types.ts `wrongWaySustainSec: 1.5`).
  near(j.oneWay.metrics.longestWitnessRunSec, 1.0, 1e-9);
  assert.ok(j.oneWay.metrics.longestWitnessRunSec < PRODUCT.WRONG_WAY_SUSTAIN_SEC);
  const why = reasonMentioning(j.reasons, "is a state the product never believed either");
  assert.ok(
    why.includes("20 tick(s), longest CONTIGUOUS run 1.000 s (bridged span 1.000 s) < wrongWaySustainSec 1.5 s"),
    why,
  );
  // The two measures agree HERE because this witness is contiguous, and that is
  // the control for the bridged-witness cheat below: the floor reads the second
  // number, and on this leg the first would have done just as well.
  near(j.oneWay.metrics.longestContiguousWitnessSec, 1.0, 1e-9);
  // …and the reason NAMES the declared acquittal, which is the counter that had
  // no consumer before this revision.
  assert.ok(why.includes("20 of those ticks were acquitted by a declared manoeuvre"));
});

test("N15b MUST be refused: NO witness length passes this leg — the floor and the budget meet with no gap", () => {
  // THE OBJECTION ROW 71 RAISED, ANSWERED BY ARITHMETIC RATHER THAN BY A
  // PROMISE: "lowering the removal ceiling only shortens the witness, which
  // needs one tick to arm the channel." The witness floor pushes the other way,
  // and on this leg the two meet. The calibration park already spends 5.00 s of
  // a 6.295 s declared-removal budget (0.1 × 62.95 s), so the witness may be at
  // most 1.295 s — and the floor will not accept one under 1.5 s.
  //
  // Every row below was RUN, not reasoned about.
  const at = (n) => {
    const { rows, declared } = ringLeg(n);
    return judge(rows, declared);
  };

  // 25 ticks = 1.25 s. INSIDE the budget (6.25/62.95 = 0.0993 < 0.1) and under
  // the floor: the witness floor alone refuses it.
  const w25 = at(25);
  near(w25.flow.metrics.declaredRemovedFrac, 0.09928514694201747, 1e-12);
  assert.ok(w25.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);
  assert.equal(w25.oneWay.counts.declaredManoeuvreRuns, 1, "the declaration still stands");
  assert.equal(w25.oneWay.verdict, "unresolved");
  assert.notEqual(w25.verdict, "pass");
  reasonMentioning(w25.reasons, "longest CONTIGUOUS run 1.250 s (bridged span 1.250 s) < wrongWaySustainSec 1.5 s");

  // 26 ticks = 1.30 s. The first length PAST the budget (6.30/62.95 = 0.10008),
  // so §DECLARED strips the spans — and the witness is still under the floor.
  const w26 = at(26);
  near(w26.flow.metrics.declaredRemovedFrac, 0.1000794281175536, 1e-12);
  assert.ok(w26.flow.metrics.declaredRemovedFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(w26.oneWay.counts.declaredManoeuvreRuns, 0, "the declaration is stripped");
  assert.equal(w26.oneWay.counts.undeclaredRuns, 1);
  assert.notEqual(w26.verdict, "pass");

  // 30 ticks = 1.50 s. Long enough to clear the floor, and therefore long
  // enough to be an UNDECLARED run at or above wrongWaySustainSec — it
  // convicts. This is the top of the squeeze.
  const w30 = at(30);
  assert.equal(w30.oneWay.verdict, "fail");
  assert.equal(w30.oneWay.counts.convictingRuns, 1);
  near(w30.oneWay.metrics.longestUndeclaredRunSec, 1.5, 1e-9);
  assert.equal(w30.verdict, "fail");

  // THE WHOLE RANGE, executed: 1..40 ticks, and not one of them passes.
  //
  // AND HERE IS THE AXIS THIS SWEEP DOES NOT VARY, said out loud because its
  // absence cost a revision. Every leg here has a CONTIGUOUS witness, and
  // contiguous length is the one axis the declared-removal budget already
  // squeezes — which is exactly why the sweep was convincing. Nothing in this
  // file varied what the ticks BETWEEN two true ticks carry until the BRIDGE
  // block below, and until it did, changing the module's witness measure from
  // the bridged span to the contiguous one redded 0 of 58 tests: the rule the
  // module CLAIMED to have shipped and the rule it HAD shipped were
  // indistinguishable to this entire suite.
  //
  // It also does not vary the calibration length — see L9 at the bottom, which
  // is this same leg passing at a 4.50 s park.
  for (let n = 1; n <= 40; n++) {
    assert.notEqual(at(n).verdict, "pass", `witness of ${n} tick(s) must not buy this leg`);
  }
});

test("…AND THE ONE-WAY SURFACE CAN STILL BE ACQUITTED: a 1.5 s witness inside budget passes", () => {
  // A criterion set that reds everything is not a criterion set. The same leg
  // with the calibration park shortened from 5.00 s to 3.00 s leaves room for a
  // witness that clears wrongWaySustainSec inside the declared-removal ceiling:
  // 3.00 + 1.50 = 4.50 s of 62.95 = 0.0715 < 0.1.
  const { rows, declared } = ringLeg(30, 59);
  const j = judge(rows, declared);

  assert.equal(j.verdict, "pass", j.reasons.join("\n"));
  assert.equal(j.oneWay.verdict, "pass", j.oneWay.reasons.join("\n"));
  near(j.oneWay.metrics.longestWitnessRunSec, 1.5, 1e-9);
  assert.equal(j.oneWay.metrics.longestWitnessRunSec >= PRODUCT.WRONG_WAY_SUSTAIN_SEC, true);
  assert.equal(j.oneWay.counts.declaredManoeuvreRuns, 1);
  assert.equal(j.oneWay.counts.declaredManoeuvreTicks, 30);
  assert.equal(j.oneWay.counts.convictingRuns, 0);
  near(j.flow.metrics.declaredRemovedWallSec, 4.5, 1e-9);
  near(j.flow.metrics.declaredRemovedFrac, 0.07148530579825257, 1e-12);
  assert.deepEqual(j.flow.surfacesJudged, [SURFACE.ONE_WAY]);
  assert.deepEqual(j.leg.testimony.mayTestify, ["lane position on oneWay"]);
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
 * THE SEAM FOR THE PRODUCT SIGNAL THAT IS BEING BUILT IN PARALLEL.
 * ──────────────────────────────────────────────────────────────────────────*/

test("SEAM: what a signed travel-direction-vs-edge value will replace — today's `wrongWay === false` is read as with-the-flow", () => {
  // THE FOUNDER RULED (2026-09-20) that the PRODUCT will publish a per-tick
  // SIGNED travel-direction-vs-edge-direction value, because `wrongWay ===
  // false` means «correct OR nobody asked» (worldRuntime.ts:2306-2312, quoted
  // in row 68). THAT CHANGE IS BEING IMPLEMENTED BY ANOTHER RUN. Nothing here
  // implements it and nothing here depends on its field name.
  //
  // This test is the seam: it pins, executably, the behaviour the new signal
  // must REPLACE, so that when the signed value lands this is the test that
  // fails and names what to rewrite. Two things are pinned:
  //
  //   1. `wrongWay: false` is currently read as a POSITIVE with-the-flow
  //      statement: 1240 such rows produce againstFlowTicks 20, not 1260.
  //   2. The only things standing between that and a fail-open acquittal are
  //      the liveness GATE and the witness FLOOR — and both are satisfied by
  //      the offence itself, which N15a asserts by byte-identity. The floor
  //      bounds how short that self-arming witness may be; it does not make the
  //      value unambiguous, and only the product can do that.
  //
  // WHEN THE SIGNED VALUE ARRIVES, the replacement is: `againstFlow` on the
  // one-way surface reads the sign instead of `wrongWay`, a tick with no signed
  // value is `null` (unknown) rather than `false`, and the liveness gate at
  // "`wrongWay` never reads true anywhere in this record" is DELETED because
  // absence stops being ambiguous. Until then, do not weaken the gate.
  //
  // THREE MORE THINGS GO WITH IT, added after the third adversarial pass, so
  // that whoever lands the signed value knows the full extent of what it
  // retires rather than deleting the gate and leaving its scaffolding behind:
  //
  //   · THE WITNESS FLOOR (module R7, repaired to read CONTIGUOUS ticks as R12)
  //     exists only to stop a blip arming an ambiguous channel. An unambiguous
  //     channel needs no witness at all, so the floor, `longestWitnessRunSec`
  //     and `longestContiguousWitnessSec` all go.
  //   · L9 GOES WITH IT, and L9 is the reason this matters: the floor is
  //     currently bounded from the other side only by the declared-removal
  //     budget, and that budget is defeated by shortening the calibration park.
  //     The signed value removes the need for the witness, which removes the
  //     declaration that buys it, which removes the cheat.
  //   · L7's DILUTION WITH LEG LENGTH goes too, for the same reason.
  //
  // What does NOT go: the one-way surface still needs a NON-ZERO denominator
  // and the contradiction rule (R13) still applies, because a row filed under
  // the wrong surface is wrong whatever the discriminator says.
  const rows = goodRows().map((r) => ({ ...r, oneway: true, wrongWay: false }));
  for (let i = 200; i <= 219; i++) rows[i].wrongWay = true;
  const j = judge(rows, {
    ...GOOD_DECLARED,
    channels: ["wrongWay"],
    manoeuvreSpans: [{ fromSeq: 200, toSeq: 219 }],
  });

  assert.equal(rows.filter((r) => r.wrongWay === false).length, 1240);
  assert.equal(j.oneWay.counts.denominator, 1260);
  assert.equal(j.oneWay.counts.againstFlowTicks, 20);
  // Not one of the 1240 ambiguous rows is counted as UNKNOWN today.
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(j.oneWay.metrics.discriminatorUnknownFrac, 0);

  // And the gate does still refuse a leg that never saw the offence: strip the
  // witness and the same record reads UNRESOLVED rather than pass.
  const noWitness = goodRows().map((r) => ({ ...r, oneway: true, wrongWay: false }));
  const k = judge(noWitness, { ...GOOD_DECLARED, channels: ["wrongWay"] });
  assert.equal(k.oneWay.verdict, "unresolved");
  assert.equal(k.oneWay.counts.discriminatorTrueTicks, 0);
  assert.equal(k.verdict, "unresolved");
  reasonMentioning(k.reasons, "needs its own declared witness excursion");
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

/** A one-way leg whose witness is TWO true ticks with `gap` ticks between them. */
function bridgedWitnessLeg(gap, fill) {
  const rows = goodRows().map((r) => ({ ...r, oneway: true, wrongWay: false }));
  const span = gap + 2;
  for (let k = 0; k < span; k++) {
    const i = 200 + k;
    if (k === 0 || k === span - 1) rows[i].wrongWay = true;
    else if (fill === "null") rows[i].wrongWay = null;
    else if (fill === "noEdge") {
      rows[i].edgeId = null;
      delete rows[i].wrongWay;
    } else rows[i].wrongWay = false;
  }
  return {
    rows,
    declared: {
      ...GOOD_DECLARED,
      channels: ["wrongWay"],
      calibration: { fromSeq: 0, toSeq: 89, offsetM: 1.0 },
      manoeuvreSpans: [{ fromSeq: 200, toSeq: 200 + span - 1 }],
    },
  };
}

test("BRIDGE (defeats R7): two true ticks 1.45 s apart with UNKNOWN between them are not a 1.5 s witness", () => {
  // MEASURED AGAINST THE PREVIOUS REVISION: LEG = pass, mayTestify
  // ["lane position on oneWay"], longestWitnessRunSec 1.500 s,
  // discriminatorTrueTicks 2 (0.10 s of channel evidence), convictingRuns 0,
  // discriminatorUnknownFrac 0.0222 of a 0.1 ceiling, declaredRemovedFrac
  // 0.0953 of a 0.1 ceiling. `flowRuns` BRIDGES unknown ticks up to
  // laneKeepSustainSec on purpose, and the floor tested the BRIDGED SPAN.
  //
  // THE BRIDGE COSTS NOTHING, which is why the header's "lengthening the
  // witness spends declared-removal budget" argument did not bound it: unknown
  // and off-surface ticks are billed to no ceiling in this file at all.
  const { rows, declared } = bridgedWitnessLeg(28, "null");
  const j = judge(rows, declared);

  // The bridged span is still 1.50 s — the quantity the floor used to read.
  near(j.oneWay.metrics.longestWitnessRunSec, 1.5, 1e-9);
  assert.ok(j.oneWay.metrics.longestWitnessRunSec >= PRODUCT.WRONG_WAY_SUSTAIN_SEC);
  // The CONTIGUOUS witness is one tick, which is what the channel actually said.
  near(j.oneWay.metrics.longestContiguousWitnessSec, 0.05, 1e-9);
  assert.equal(j.oneWay.counts.discriminatorTrueTicks, 2);

  // Neither pre-existing ceiling binds — asserted, so a later "fix" that reds
  // this by widening one of them fails here.
  assert.ok(j.oneWay.metrics.discriminatorUnknownFrac < EXCLUDED_FRACTION_CEILING);
  assert.ok(j.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);
  assert.equal(j.oneWay.counts.convictingRuns, 0);

  assert.equal(j.oneWay.verdict, "unresolved");
  assert.equal(j.verdict, "unresolved");
  assert.deepEqual(j.leg.testimony.mayTestify, []);
  reasonMentioning(j.reasons, "longest CONTIGUOUS run 0.050 s (bridged span 1.500 s)");
});

test("BRIDGE, second filling: a bridge made of `edgeId: null` rows reads identically", () => {
  // The same leg with the 28 intervening rows off-surface instead of unknown,
  // which is the filling that does not even register as a discriminator
  // unknown: discriminatorUnknownTicks 0.
  const { rows, declared } = bridgedWitnessLeg(28, "noEdge");
  const j = judge(rows, declared);
  assert.equal(j.oneWay.counts.discriminatorUnknownTicks, 0);
  near(j.oneWay.metrics.longestWitnessRunSec, 1.5, 1e-9);
  near(j.oneWay.metrics.longestContiguousWitnessSec, 0.05, 1e-9);
  assert.notEqual(j.verdict, "pass");
});

test("BRIDGE, THE WHOLE BRIDGE AXIS: no gap length turns two ticks into a witness", () => {
  // THE CONTROL THE SUITE DID NOT HAVE, and its absence is why the hole lived.
  // The 1..40 sweep above varies CONTIGUOUS witness length, which is the one
  // axis the declared-removal budget already squeezes. Nothing anywhere varied
  // what the ticks BETWEEN two true ticks carry — so the suite could not tell
  // the rule it claimed to have shipped from the one it actually shipped, and
  // changing the witness measure to the contiguous one redded 0 of 58 tests.
  for (let gap = 0; gap <= 60; gap++) {
    for (const fill of ["null", "noEdge"]) {
      const { rows, declared } = bridgedWitnessLeg(gap, fill);
      assert.notEqual(
        judge(rows, declared).verdict,
        "pass",
        `a ${gap}-tick ${fill} bridge between two true ticks must not buy this leg`,
      );
    }
  }
});

test("BRIDGE CONTROL: a CONTIGUOUS witness of the same length still passes", () => {
  // The other half of every rule in this file. 30 contiguous true ticks =
  // 1.50 s = wrongWaySustainSec exactly, on a calibration short enough to keep
  // the declaration inside its budget — this leg MUST pass, or the floor has
  // stopped being a floor and started being a wall.
  const { rows, declared } = ringLeg(30, 89);
  const j = judge(rows, declared);
  near(j.oneWay.metrics.longestContiguousWitnessSec, 1.5, 1e-9);
  near(j.oneWay.metrics.longestWitnessRunSec, 1.5, 1e-9);
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
    rows[i].wrongWay = false;
  }
  let tw = 0;
  for (let b = 0; b < 7; b++) for (let k = 0; k < 11; k++, tw++) rows[100 + b * 70 + k].opposingBank = true;
  let ow = 0;
  for (let k = 0; k < 30; k++, ow++) rows[640 + k].wrongWay = true;
  for (let b = 0; b < 4 && ow < 146; b++) {
    for (let k = 0; k < 29 && ow < 146; k++, ow++) rows[700 + b * 120 + k].wrongWay = true;
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

test("L9 (STILL LIVE, disclosed): the witness floor is defeated by SHRINKING the calibration", () => {
  // ROW 71 IS NOT RETIRED BY R7, and this suite said it was. The floor and the
  // declared-removal budget meet on row 71's leg only because that leg's
  // calibration park happens to be 5.00 s: the budget is
  // (calibration + witness) / leg, so shortening the calibration — which no
  // product constant fixes and no rule in this file bounds from below — buys
  // the witness room again. Every line below was RUN.
  //
  //   calibration 5.00 s → LEG=fail    (6.50/62.95 = 0.10326 > 0.1)
  //   calibration 4.50 s → LEG=pass    (6.00/62.95 = 0.09531)
  //   calibration 4.00 s → LEG=pass    (5.50/62.95 = 0.08737)
  //   calibration 3.00 s → LEG=pass    (4.50/62.95 = 0.07149)
  //
  // The 1.50 s witness is CONTIGUOUS, so R7 as repaired this revision does not
  // touch it either. What closes this is the founder-ruled signed
  // travel-direction-vs-edge value: once `wrongWay: false` stops meaning
  // "nobody asked", the liveness gate and the floor are both deleted and the
  // budget stops being the only thing bounding the witness.
  const at = (calTo) => {
    const { rows, declared } = ringLeg(30, calTo);
    return judge(rows, declared);
  };

  const five = at(99);
  near(five.flow.metrics.declaredRemovedFrac, 0.10325655281969817, 1e-12);
  assert.ok(five.flow.metrics.declaredRemovedFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(five.verdict, "fail");

  for (const [calTo, frac] of [
    [89, 0.09531374106433677],
    [79, 0.08737092930897537],
    [59, 0.07148530579825257],
  ]) {
    const j = at(calTo);
    near(j.flow.metrics.declaredRemovedFrac, frac, 1e-12);
    assert.ok(j.flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING);
    near(j.oneWay.metrics.longestContiguousWitnessSec, 1.5, 1e-9);
    assert.equal(j.oneWay.counts.discriminatorTrueTicks, 30);
    assert.equal(
      j.verdict,
      "pass",
      "L9 is a DISCLOSED LIVE CHEAT: if this goes red the module header must be rewritten",
    );
    assert.deepEqual(j.leg.testimony.mayTestify, ["lane position on oneWay"]);
  }
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
