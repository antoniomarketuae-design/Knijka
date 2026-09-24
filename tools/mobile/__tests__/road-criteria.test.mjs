// -----------------------------------------------------------------------------
// road-criteria.test.mjs — THE NEGATIVE CONTROLS. FIVE CHEATS THAT PASSED THE
// CRITERIA AS DRAFTED, MADE TO GO RED HERE, AND ONE KNOWN-GOOD LEG THAT MUST
// STAY GREEN.
//
//   node --test tools/mobile/__tests__/road-criteria.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// WHY IT EXISTS: "the pattern across two drafts is criteria written in prose and
// never run." Draft 1 died to a sample filter that selects zero ticks on every
// painted road. Draft 2 died to eligibility predicates copied out of a grader
// written to ACQUIT A MANOEUVRING STUDENT. Both were readable and wrong in ways
// ONE EXECUTION would have exposed. This file is that execution, and it runs
// before any probe, any drive and any server exists — on synthetic rows, which
// is the only reason it could be written today.
//
// A CRITERION SET THAT REDS EVERYTHING IS NOT A CRITERION SET. Every control
// below is paired: the cheat must go red AND the known-good leg must stay green,
// and three of the tests exist only to prove the criteria can still say PASS
// (the U-turn blip, the declared witness excursion, the cadence swap).
//
// THE OLD BEHAVIOUR IS EXECUTED, NOT DESCRIBED. `draftWrongBankFrac()` in
// road-criteria.mjs is AC-2B exactly as drafted — gated `oneway === false`, the
// numerator filtered by the engine's `moving` and `forwardGear`. Controls 1, 2
// and 3 run it against the cheating leg and assert it returns a clean pass, and
// then assert the new criterion reds the same rows. For controls 4 and 5 the
// "old behaviour" is that NO criterion existed, which the tests show by
// asserting the two criteria that DID exist (AC-LANE, AC-FLOW) return `pass` on
// a probe wired to a constant and on a record with a 4-second hole in it.
//
// WHAT THIS FILE DOES NOT DO: it does not drive, does not start a server, does
// not read `.audit-frames`, and closes no finding.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  EXCLUDED_FRACTION_CEILING,
  LANE_HOLD_P90_CEILING_M,
  PRODUCT,
  SURFACE,
  assessFlow,
  assessLaneHolding,
  assessLeg,
  assessRecordCompleteness,
  assessReferentLiveness,
  declaredSpansHash,
  draftWrongBankFrac,
  medianTickPeriodSec,
  medianWallPeriodSec,
  surfaceAgainstFlowFracCeiling,
  surfaceRearmSec,
  surfaceSustainSec,
  travellingBackwards,
} from "../lib/road-criteria.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "..", "..", "platform", "src", "modules", "sim");

/* ────────────────────────────────────────────────────────────────────────────
 * THE FIXTURE. One known-good leg, and mutations of it.
 *
 * THE CADENCE IS THE FIXTURE'S, NOT THE PRODUCT'S. Nothing here claims the
 * product ticks at 20 Hz; increment 1 measures that on the product headless.
 * The criteria take their period from the record itself, and the cadence-swap
 * test at the bottom is what proves they do.
 * ──────────────────────────────────────────────────────────────────────────*/

/** Deterministic jitter. No Math.random: a control that is not reproducible is not a control. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Durations in this file are built by accumulating `i / hz`, so they carry
 * ordinary binary-float residue (measured: 20 Hz gives a median period of
 * 0.050000000000000266 s, not 0.05). Comparisons of a DURATION use this;
 * comparisons of a COUNT, a verdict or a threshold stay exact, because a
 * tolerance on those would be a loosened test rather than honest arithmetic.
 */
function near(actual, expected, tol = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${actual} is not within ${tol} of ${expected}`,
  );
}

const CAL_SEC = 3;
const DRIVE_SEC = 60;

/**
 * PIN THE DECLARED SPANS, exactly as the harness must before it drives. Every
 * fixture below goes through this, so a test that changes a span has to say so
 * by re-pinning — which is the whole point of the pin, applied to the tests as
 * well as to the product of a drive.
 */
function pin(declared) {
  return { ...declared, spansHash: declaredSpansHash(declared) };
}

function buildGoodLeg({ hz = 20 } = {}) {
  const period = 1 / hz;
  const rand = lcg(20260920);
  const nCal = Math.round(CAL_SEC * hz);
  const nDrive = Math.round(DRIVE_SEC * hz);
  const rows = [];
  const wall0 = 1000;
  for (let i = 0; i < nCal + nDrive; i++) {
    const tSec = i * period;
    const driving = i >= nCal;
    // The injection span is parked at a KNOWN 2.0 m off the lane centre; the
    // drive then wanders inside its own lane.
    const laneOffsetM = driving
      ? 0.8 * Math.sin((2 * Math.PI * (tSec - CAL_SEC)) / 12) + (rand() - 0.5) * 0.04
      : 2.0;
    rows.push({
      seq: i,
      tSec,
      wallMs: wall0 + Math.round(tSec * 1000),
      laneOffsetM,
      laneId: 0,
      edgeId: "e-main",
      oneway: false,
      speedKmh: driving ? 30 : 0,
      gear: driving ? 1 : 0,
      headingDeg: 0,
      worldEdgeClearanceM: 40,
      // opposingBank / wrongWay / laneLinesPainted absent: the runtime publishes
      // all three only in the disarming direction, so a clean painted two-way
      // road leaves them off the tick entirely.
    });
  }
  const curvedFrom = nCal + Math.round(10 * hz);
  const curvedTo = nCal + Math.round(50 * hz);
  return {
    rows,
    declared: pin({
      channels: ["laneOffsetM", "opposingBank", "wrongWay", "oneway", "edgeId", "gear", "speedKmh"],
      calibration: { fromSeq: 0, toSeq: nCal - 1, offsetM: 2.0 },
      curvedSpans: [{ fromSeq: curvedFrom, toSeq: curvedTo }],
      expectedSpanMs: (CAL_SEC + DRIVE_SEC) * 1000,
    }),
    hz,
    nCal,
  };
}

/** Clone a leg and rewrite the rows whose tSec falls in [fromSec, toSec). */
function mutate(leg, fromSec, toSec, patch) {
  return {
    ...leg,
    rows: leg.rows.map((r) =>
      r.tSec >= fromSec && r.tSec < toSec ? { ...r, ...patch(r) } : { ...r },
    ),
  };
}

/** Drop the rows in [fromSec, toSec) and renumber seq contiguously. */
function dropWindow(leg, fromSec, toSec, { pauseSimClock = false } = {}) {
  const kept = leg.rows.filter((r) => !(r.tSec >= fromSec && r.tSec < toSec));
  const removedSec = toSec - fromSec;
  const rows = kept.map((r, i) => ({
    ...r,
    seq: i,
    tSec: pauseSimClock && r.tSec >= toSec ? r.tSec - removedSec : r.tSec,
  }));
  return { ...leg, rows };
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE KNOWN-GOOD LEG
 * ──────────────────────────────────────────────────────────────────────────*/

test("the known-good leg passes every criterion", () => {
  const leg = buildGoodLeg();
  const out = assessLeg(leg);
  assert.equal(out.verdict, "pass", out.reasons.join("\n"));
  for (const [id, c] of Object.entries(out.criteria)) {
    assert.equal(c.verdict, "pass", `${id}: ${c.reasons.join("; ")}`);
  }
  // The metric never travels without its sample count.
  assert.ok(out.criteria["AC-LANE"].counts.gradedTicks >= out.criteria["AC-LANE"].counts.sampleFloor);
  assert.ok(out.criteria["AC-LANE"].metrics.p90AbsOffsetM < LANE_HOLD_P90_CEILING_M);
  assert.equal(out.criteria["AC-FLOW"].counts.twoWayDenominator, leg.rows.length);
  assert.deepEqual(out.criteria["AC-FLOW"].surfacesJudged, [SURFACE.TWO_WAY]);
  // And it may not claim what it never met.
  assert.ok(out.testimony.mayNotTestify.some((s) => s.includes("one-way")));
});

/* ────────────────────────────────────────────────────────────────────────────
 * CONTROL 1 — C1 THE CRAWL. 20 s in the oncoming lane at 4.9 km/h.
 * ──────────────────────────────────────────────────────────────────────────*/

test("control 1 (the crawl): 4.9 km/h wrong-bank work is a clean 0 to the draft and RED here", () => {
  const leg = mutate(buildGoodLeg(), 20, 40, () => ({
    opposingBank: true,
    speedKmh: 4.9, // one tenth below engine.ts:3394's `speed > movingSpeedKmh`
    laneOffsetM: 0, // the oncoming lane's CENTRE reads 0.0000, same as a perfect drive
  }));

  // THE OLD BEHAVIOUR, EXECUTED.
  const draft = draftWrongBankFrac(leg.rows);
  assert.equal(draft.numerator, 0);
  assert.equal(draft.frac, 0, "the draft's AC-2B books a PERFECT wrong-bank fraction here");
  assert.ok(draft.denominator > 1000);

  // MINE.
  const flow = assessFlow(leg.rows, leg.declared);
  assert.equal(flow.verdict, "fail", flow.reasons.join("\n"));
  const tw = flow.surfaces[SURFACE.TWO_WAY];
  assert.equal(tw.counts.againstFlowTicks, 400);
  // Counted and PUBLISHED, not excluded.
  assert.equal(tw.counts.slowAgainstFlowTicks, 400);
  assert.ok(tw.metrics.longestUndeclaredRunSec >= 20);
  assert.ok(
    tw.reasons.join(" ").includes("solidLineCrossSustainSec"),
    "the run-length threshold must be the product's own",
  );
  // …and the two COUNTED-NEVER-EXCLUDED classes are named where the verdict is
  // explained, which is the only thing that makes them read rather than merely
  // published. The fraction ceiling fires here (400/1260 = 0.317 > 0.130).
  assert.ok(
    tw.reasons.join(" ").includes("400 were under movingSpeedKmh and 0 were in reverse"),
    "the reason must name the slow ticks it did NOT exclude",
  );
  assert.equal(assessLeg(leg).verdict, "fail");
});

/* ────────────────────────────────────────────────────────────────────────────
 * CONTROL 2 — C2 REVERSE. 10 s on the wrong bank in reverse.
 * ──────────────────────────────────────────────────────────────────────────*/

test("control 2 (reverse): reverse wrong-bank ticks leave the draft's numerator and are RED here", () => {
  const leg = mutate(buildGoodLeg(), 20, 30, () => ({
    opposingBank: true,
    gear: -1, // engine.ts:2935 `forwardGear = tick.gear >= 0`
    speedKmh: 8,
    laneOffsetM: 0,
  }));

  const draft = draftWrongBankFrac(leg.rows);
  assert.equal(draft.numerator, 0);
  assert.equal(draft.frac, 0, "the draft excludes reverse BY SPECIFICATION");

  const flow = assessFlow(leg.rows, leg.declared);
  assert.equal(flow.verdict, "fail", flow.reasons.join("\n"));
  const tw = flow.surfaces[SURFACE.TWO_WAY];
  assert.equal(tw.counts.againstFlowTicks, 200);
  assert.equal(tw.counts.reverseAgainstFlowTicks, 200);
  assert.equal(tw.counts.slowAgainstFlowTicks, 0);
  assert.equal(assessLeg(leg).verdict, "fail");
});

/* ────────────────────────────────────────────────────────────────────────────
 * CONTROL 3 — C3 THE RING. Every roundabout in the product is one-way
 * (measured: 34 ring edges, 34 oneway:true, across 106 world files), so a
 * criterion gated `oneway === false` fills its denominator with approach-road
 * ticks and reports a clean pass over a ring it never looked at.
 * ──────────────────────────────────────────────────────────────────────────*/

/** A lawful nose angle: well inside the product's WRONG_WAY_ANGLE_DEG. */
const ALIGNED_DEG = 3.5;
/** An against-flow nose angle: well past it, and SIGNED NEGATIVE on purpose so
 *  a reader that drops the absolute value reads it as the most aligned tick in
 *  the record. */
const OPPOSED_DEG = -174.0;

/**
 * @param {object}  [opts]
 * @param {{fromSec:number,toSec:number}|null} [opts.witness]
 * @param {boolean} [opts.signal]  Does the record carry the founder-ruled
 *   direction value? TRUE is what a probe at version 3 writes. FALSE is the
 *   RETIRED DIALECT — `wrongWay` and nothing else — and it is kept because a
 *   record that cannot say which way the car faced must read UNRESOLVED rather
 *   than acquit, which is control 3's whole point.
 */
function buildRingLeg({ witness = null, signal = true } = {}) {
  const leg = buildGoodLeg();
  const rows = leg.rows.map((r) => {
    if (r.tSec < 33) return { ...r }; // the two-way APPROACH
    const onRing = {
      ...r,
      edgeId: "ring-1",
      oneway: true,
      // The runtime assigns a DEFINITE false here (worldRuntime.ts:2306-2312),
      // and it means EITHER «with the flow» OR «nobody asked» — which is why,
      // on its own, it is not a statement about which way the car faced.
      wrongWay: false,
    };
    if (signal) {
      // The signed value SAYS it: this tick faced along the ring.
      onRing.alignDeg = ALIGNED_DEG;
      onRing.wrongWayArmed = true;
      onRing.alignEdgeId = "ring-1";
      onRing.alignTravelDir = 1; // locator returns +1 unconditionally on a one-way
      onRing.alignRoundabout = true;
      onRing.alignOffCarriageway = false;
    }
    if (witness && r.tSec >= witness.fromSec && r.tSec < witness.toSec) {
      onRing.wrongWay = true;
      if (signal) onRing.alignDeg = OPPOSED_DEG;
    }
    return onRing;
  });
  let declared = { ...leg.declared };
  if (witness) {
    const span = rows.filter((r) => r.wrongWay === true);
    declared.manoeuvreSpans = [
      { fromSeq: span[0].seq, toSeq: span[span.length - 1].seq, reason: "declared wrongWay witness" },
    ];
  }
  // The spans changed, so the pin has to be re-struck — which is exactly what a
  // harness authoring this route would do BEFORE driving it.
  declared = pin(declared);
  return { ...leg, rows, declared };
}

test("control 3 (the ring): the draft passes on approach-road ticks; the ring reads UNRESOLVED", () => {
  // THE RECORD HERE CARRIES NO DIRECTION SIGNAL — `wrongWay: false` and nothing
  // else, which is the dialect every record spoke before the founder-ruled
  // value landed (2026-09-20). That is still the right fixture for this
  // control: a ring whose ticks cannot say which way the car faced must read
  // UNRESOLVED, and the rule that now refuses it is the unknown-fraction
  // ceiling rather than the deleted liveness gate. The SAME ring with the
  // signal on is a clean PASS, and that is asserted two tests below.
  const leg = buildRingLeg({ signal: false });

  // THE OLD BEHAVIOUR: the denominator is the approach road, and it is clean.
  const draft = draftWrongBankFrac(leg.rows);
  assert.equal(draft.frac, 0);
  assert.ok(draft.denominator > 0, "the draft has a denominator made entirely of approach ticks");
  assert.ok(
    draft.denominator < leg.rows.length,
    "and it silently contains no ring ticks at all",
  );

  // MINE: the ring has its own denominator, and it is UNRESOLVED — not pass, not fail.
  const flow = assessFlow(leg.rows, leg.declared);
  const ring = flow.surfaces[SURFACE.ONE_WAY];
  assert.ok(ring.counts.denominator > 500, "the ring surface must have its own denominator");
  assert.equal(ring.verdict, "unresolved", ring.reasons.join("\n"));
  assert.ok(ring.reasons.join(" ").includes("wrongWay"));
  // …and it is the UNKNOWN census that refuses it: every ring tick is a tick
  // the record never answered for, and not one of them is read as with-the-flow.
  assert.equal(ring.counts.discriminatorUnknownTicks, ring.counts.denominator);
  assert.equal(ring.metrics.discriminatorUnknownFrac, 1);
  assert.ok(ring.reasons.join(" ").includes("is unknown on"), ring.reasons.join("\n"));
  assert.equal(flow.verdict, "unresolved");
  assert.equal(assessLeg(leg).verdict, "unresolved");
  // The two-way approach still passes on its own terms — the leg is scoped, not condemned.
  assert.equal(flow.surfaces[SURFACE.TWO_WAY].verdict, "pass");
});

test("control 3, the other direction: a DECLARED excursion is excluded, and the same rows undeclared convict", () => {
  // THE TITLE USED TO SAY "a declared witness excursion makes the ring
  // judgeable", and that half is gone: since R18 the ring is judgeable because
  // its ticks carry the direction signal, with or without an excursion (the
  // test below drives one with none). What this control still proves — and it
  // is the half that was always load-bearing — is that a DECLARATION is what
  // excludes an offence from the verdict, and that the identical rows without
  // it convict on the product's own clock.
  //
  // THE EXCURSION IS 2.0 s, NOT 1.0 s, AND THE CHANGE IS THE POINT. This control
  // used to declare one second and assert that the same second convicts when
  // undeclared — which it did, because AC-FLOW applied CROSSED_SOLID_LINE's
  // 0.6 s clock to the one-way surface as well. That composite's own condition
  // is gated `tick.oneway === false` (engine.ts:3518), so it can never run on a
  // one-way road; the one-way clock is `wrongWaySustainSec` = 1.5 s
  // (rules/types.ts:1902). Under the product's own number a 1.0 s wrong-way run
  // is NOT billable, so asserting it convicts would be asserting the harness is
  // stricter than the engine. The witness is lengthened past the real clock
  // instead of the clock being shortened to fit the witness.
  const leg = buildRingLeg({ witness: { fromSec: 40, toSec: 42 } });
  const flow = assessFlow(leg.rows, leg.declared);
  const ring = flow.surfaces[SURFACE.ONE_WAY];
  assert.equal(ring.verdict, "pass", ring.reasons.join("\n"));
  assert.equal(ring.metrics.sustainSec, PRODUCT.WRONG_WAY_SUSTAIN_SEC);
  // Declared, EXCLUDED FROM THE VERDICT, AND COUNTED. A silent exclusion is the
  // shape this programme keeps finding.
  assert.equal(ring.counts.declaredManoeuvreRuns, 1);
  assert.equal(ring.counts.declaredManoeuvreTicks, 40);
  assert.equal(ring.counts.undeclaredRuns, 0);
  assert.ok(assessLeg(leg).testimony.mayTestify.length > 0);
  // …and it stays inside what a declaration is allowed to remove (§DECLARED):
  // 2.0 s of witness + 3.0 s of calibration park in a 63 s leg.
  near(flow.metrics.declaredRemovedWallSec, 5.0);
  assert.ok(flow.metrics.declaredRemovedFrac <= EXCLUDED_FRACTION_CEILING);

  // …and the declaration is what excludes it: the same rows, undeclared, convict.
  const undeclared = assessFlow(leg.rows, pin({ ...leg.declared, manoeuvreSpans: [] }));
  assert.equal(undeclared.surfaces[SURFACE.ONE_WAY].verdict, "fail");
  assert.equal(undeclared.surfaces[SURFACE.ONE_WAY].counts.againstFlowTicks, 40);
  assert.ok(
    undeclared.surfaces[SURFACE.ONE_WAY].reasons.join(" ").includes("wrongWaySustainSec"),
    "the one-way surface must convict on the PRODUCT'S one-way clock",
  );
});

test("control 3, the witness floor is RETIRED: the ring is judgeable with NO witness at all", () => {
  // WHAT STOOD HERE. "A witness the PRODUCT would not have billed arms
  // nothing": a 1.0 s declared wrong-way excursion satisfied the liveness gate
  // and then acquitted the other 1 240 ticks of the leg, so R7 added a FLOOR at
  // the engine's own arming clock (`wrongWaySustainSec` 1.5 s) and this test
  // asserted a 1.0 s witness read unresolved while a 1.5 s one passed.
  //
  // THE FLOOR AND THE GATE ARE BOTH GONE, and this test is their replacement
  // rather than their deletion. Both existed for one reason: the only proof
  // that an ambiguous channel was LIVE was the offence it exists to detect, so
  // the surface could be cleared only by a leg that had driven the wrong way.
  // The founder-ruled signed value (2026-09-20) states the lawful case
  // POSITIVELY, so the question the floor answered is not a question any more.
  // What replaces it is not a weaker rule — it is the honest one: a leg that
  // says which way it faced is judged on what it said, and a leg that does not
  // is UNRESOLVED (control 3, above).

  // 1. NO WITNESS, NO EXCURSION, NOTHING DECLARED — and the ring PASSES, which
  //    under the old gate was impossible by construction.
  const clean = buildRingLeg();
  const cleanRing = assessFlow(clean.rows, clean.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(cleanRing.counts.discriminatorTrueTicks, 0, "the channel never says true");
  assert.equal(cleanRing.counts.discriminatorUnknownTicks, 0, "and nothing is unknown either");
  assert.equal(cleanRing.counts.againstFlowTicks, 0);
  assert.ok(cleanRing.counts.denominator > 500);
  assert.equal(cleanRing.verdict, "pass", cleanRing.reasons.join("\n"));
  assert.ok(assessLeg(clean).testimony.mayTestify.join(" ").includes("oneWay"));

  // 2. THE SHORT WITNESS THE FLOOR USED TO REFUSE now passes, and that is the
  //    point: 1.0 s of declared wrong-way is a state the engine never billed,
  //    and the leg no longer needs it to be believed about the other 1 240.
  const short = buildRingLeg({ witness: { fromSec: 40, toSec: 41 } });
  const shortRing = assessFlow(short.rows, short.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(shortRing.counts.againstFlowTicks, 20);
  assert.equal(shortRing.counts.convictingRuns, 0, "1.0 s is under the product's own clock");
  assert.equal(shortRing.verdict, "pass", shortRing.reasons.join("\n"));
  // The metrics the floor read are gone, not merely unread.
  assert.equal(shortRing.metrics.longestWitnessRunSec, undefined);
  assert.equal(shortRing.metrics.longestContiguousWitnessSec, undefined);

  // 3. AND NOTHING WAS LOOSENED. The same leg with the signal STRIPPED — the
  //    retired dialect, `wrongWay` alone — goes straight back to UNRESOLVED,
  //    so the pass above is bought by the SIGNAL and by nothing else.
  const stripped = buildRingLeg({ witness: { fromSec: 40, toSec: 41 }, signal: false });
  const strippedRing = assessFlow(stripped.rows, stripped.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(strippedRing.counts.againstFlowTicks, 20, "the offence is still read");
  assert.ok(strippedRing.metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(strippedRing.verdict, "unresolved", strippedRing.reasons.join("\n"));
  assert.ok(!assessLeg(stripped).testimony.mayTestify.join(" ").includes("oneWay"));

  // 4. THE OFFENCE IS STILL CONVICTED at the product's own clock — the leg that
  //    drives the wrong way for 2.0 s WITHOUT declaring it fails on length.
  const undeclared = buildRingLeg({ witness: { fromSec: 40, toSec: 42 } });
  const undRing = assessFlow(
    undeclared.rows,
    pin({ ...undeclared.declared, manoeuvreSpans: [] }),
  ).surfaces[SURFACE.ONE_WAY];
  assert.equal(undRing.counts.convictingRuns, 1);
  assert.equal(undRing.verdict, "fail", undRing.reasons.join("\n"));
  assert.ok(undRing.reasons.join(" ").includes("wrongWaySustainSec"));

  // THE TWO-WAY SURFACE NEVER HAD A WITNESS AND STILL DOES NOT: `opposingBank`
  // is set-only-when-true on a resolved two-way edge (worldRuntime.ts:2416-2420),
  // so its absence is a positive statement. A leg with ZERO wrong-bank ticks
  // must still pass. L2 in the module header discloses what that costs, and
  // discloses that R18 made the asymmetry WIDER rather than closing it.
  const good = buildGoodLeg();
  const twoWay = assessFlow(good.rows, good.declared).surfaces[SURFACE.TWO_WAY];
  assert.equal(twoWay.counts.againstFlowTicks, 0);
  assert.equal(twoWay.counts.discriminatorUnknownTicks, 0);
  assert.equal(twoWay.verdict, "pass");
});

test("control 3, the signal answers on ticks the BOOLEAN was never armed on", () => {
  // THE FOUNDER'S OWN SENTENCE, EXECUTED. `wrongWay === false` means «correct
  // OR nobody asked»; the ruling was to publish the direction anyway, so that a
  // tick on which the conviction channel is DISARMED still says which way the
  // car faced. This is the leg that separates the two readers: the ring rows
  // carry the signed value and carry NO `wrongWay` AT ALL.
  //
  // It is not a contrived shape. worldRuntime.ts disarms the channel when the
  // district states no one-way streets and the edge is not a ring, and when the
  // car is off the carriageway; `roadRecordOf` copies `wrongWay` only when the
  // tick defines it. Under the retired dialect this leg was UNRESOLVED — the
  // liveness gate refused it, having no way to tell a silent channel from a
  // clean drive. Under the ruling it is a clean drive, and says so.
  const leg = buildRingLeg();
  const rows = leg.rows.map((r) => {
    if (r.alignDeg === undefined) return r;
    const q = { ...r, wrongWayArmed: false };
    delete q.wrongWay;
    return q;
  });
  const ring = assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(rows.filter((r) => r.wrongWay !== undefined).length, 0, "the boolean is absent");
  assert.ok(ring.counts.denominator > 500);
  assert.equal(ring.counts.discriminatorUnknownTicks, 0, "and yet nothing is unknown");
  assert.equal(ring.counts.againstFlowTicks, 0);
  assert.equal(ring.verdict, "pass", ring.reasons.join("\n"));
});

test("control 3, a LAWFUL REVERSE around the ring is not convicted", () => {
  // `alignDeg` MEASURES THE NOSE. `SimTick.speedKmh` is unsigned, so `gear` is
  // the only channel that says the car is FACING backwards along its own axis —
  // but it is NOT the whole of "travelling backwards", and the sentence that
  // used to stand here said it was. R20: the rotation needs the gear AND
  // motion, because a car STOPPED in reverse is not travelling anywhere, and
  // reading the gear alone convicted the opening frames of every reverse
  // manoeuvre. `travellingBackwards` is the predicate; this is the third copy
  // of that sentence, corrected 2026-09-24 with the other two.
  //
  // A car
  // backing correctly along its own lane reads |deg| ≈ 180 on EVERY frame
  // (rules/types.ts `EdgeAlignment.deg`, measured in
  // runtime/__tests__/edge-alignment.test.ts §7). A discriminator that reads the
  // angle as a direction of travel convicts every correct reverse manoeuvre —
  // and the instrument this record exists for covers the reverse/park half.
  const leg = buildRingLeg();
  const rows = leg.rows.map((r) =>
    r.alignDeg === undefined ? r : { ...r, gear: -1, alignDeg: -178.5, wrongWay: true },
  );
  const ring = assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.ok(ring.counts.denominator > 500);
  assert.equal(ring.counts.againstFlowTicks, 0, "the nose is backwards; the TRAVEL is not");
  assert.equal(ring.counts.discriminatorUnknownTicks, 0);
  assert.equal(ring.verdict, "pass", ring.reasons.join("\n"));

  // …and the SAME angle in a FORWARD gear is the offence, so the rotation is a
  // rotation and not an amnesty.
  const forward = rows.map((r) => (r.alignDeg === undefined ? r : { ...r, gear: 1 }));
  const fwdRing = assessFlow(forward, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(fwdRing.counts.againstFlowTicks, fwdRing.counts.denominator);
  assert.equal(fwdRing.verdict, "fail", fwdRing.reasons.join("\n"));

  // …and a reverse that is genuinely against the flow — nose along the ring
  // while backing down it — IS convicted, which is what stops the rotation
  // being a blanket exemption for gear −1.
  // `wrongWay` goes back to FALSE with it: at 1.5° off the edge the product's
  // heading verdict is false, and a fixture that left it true would be refused
  // by R19 as a self-contradictory record rather than by the discriminator —
  // which would leave this assertion green and blind.
  const backwards = rows.map((r) =>
    r.alignDeg === undefined ? r : { ...r, alignDeg: 1.5, wrongWay: false },
  );
  const bwdRing = assessFlow(backwards, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(bwdRing.counts.directionContradictionRows, 0, "the record is self-consistent");
  assert.equal(bwdRing.counts.againstFlowTicks, bwdRing.counts.denominator);
  assert.equal(bwdRing.verdict, "fail", bwdRing.reasons.join("\n"));
  assert.ok(
    bwdRing.reasons.join(" ").includes("against the flow"),
    "and the refusal is the DISCRIMINATOR's, not R19's",
  );

  // THE ROTATION MUST WRAP, AND IT MUST ROTATE ONLY gear −1. `deg` is
  // (-180, +180], so a lawful reverse reads −179 on one frame and +179 on the
  // next as the nose jitters across antiparallel; +179 + 180 = 359, and a
  // consumer that thresholds that raw convicts the frame it just cleared. And a
  // car STOPPED facing the wrong way up a one-way street is against the flow —
  // rules/types.ts licenses the rotation for `gear === -1` and for nothing else.
  const at = (deg, gear) => {
    const r2 = leg.rows.map((r) =>
      r.alignDeg === undefined ? r : { ...r, gear, alignDeg: deg, wrongWay: Math.abs(deg) > 120 },
    );
    return assessFlow(r2, leg.declared).surfaces[SURFACE.ONE_WAY];
  };
  assert.equal(at(179, -1).counts.againstFlowTicks, 0, "+179 in reverse is the same frame as -179");
  assert.equal(at(179, -1).verdict, "pass");
  assert.equal(at(-172, 0).counts.againstFlowTicks, at(-172, 0).counts.denominator, "gear 0 is not reverse");
  assert.equal(at(-172, 0).verdict, "fail");
});

test("control 3, the threshold is the PRODUCT's 120°, applied at the boundary", () => {
  // The angle is not a harness choice: worldRuntime.ts:279
  // `export const WRONG_WAY_ANGLE_DEG = 120`, and the product reduces the very
  // same quantity with `Math.abs(signedDeltaDeg(...)) > WRONG_WAY_ANGLE_DEG`
  // (worldRuntime.ts:705). STRICTLY greater, so the boundary tick is lawful.
  // The drift test reads the number back out of platform/src; this asserts the
  // criteria actually APPLY the number they mirror.
  const at = PRODUCT.WRONG_WAY_ANGLE_DEG;
  const over = at + 0.5;
  const mk = (deg) => {
    const leg = buildRingLeg();
    const rows = leg.rows.map((r) => (r.alignDeg === undefined ? r : { ...r, alignDeg: deg }));
    return assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  };
  assert.equal(mk(at).counts.againstFlowTicks, 0, "exactly 120° is NOT against the flow");
  assert.equal(mk(at).verdict, "pass");
  assert.equal(mk(-at).counts.againstFlowTicks, 0, "and neither is exactly -120°");
  const past = mk(over);
  assert.equal(past.counts.againstFlowTicks, past.counts.denominator, "120.5° is");
  assert.equal(mk(-over).counts.againstFlowTicks, past.counts.denominator, "and so is -120.5°");
  // A harness that picked 90 instead would convict this leg, which is the whole
  // reason the number is mirrored and drift-tested rather than chosen here.
  const ninety = mk(95);
  assert.equal(ninety.counts.againstFlowTicks, 0, "95° is lawful under the PRODUCT's 120");
  assert.equal(ninety.verdict, "pass", ninety.reasons.join("\n"));
});

test("control 3, `alignDeg: null` is UNKNOWN — the runtime looked and could not measure", () => {
  // THREE STATES, NOT TWO. Absent means «this record does not carry the signal»;
  // `null` means «the runtime looked and could not measure» (no committed edge
  // fix); a number is a direction. Neither of the first two may read as
  // with-the-flow, and `null` must not collapse into absent either — a record
  // that publishes the field honestly on every tick and answers `null` on most
  // of them has NOT been asked, and must say so.
  const leg = buildRingLeg();
  const rows = leg.rows.map((r) => (r.alignDeg === undefined ? r : { ...r, alignDeg: null }));
  const ring = assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(ring.counts.discriminatorUnknownTicks, ring.counts.denominator);
  assert.equal(ring.counts.againstFlowTicks, 0);
  assert.equal(ring.verdict, "unresolved", ring.reasons.join("\n"));
  assert.ok(ring.reasons.join(" ").includes("is unknown on"));

  // A HANDFUL of nulls is survivable — the ceiling is a fraction, not a ban —
  // so the rule is a census and not a refusal of the field.
  const few = leg.rows.map((r, i) =>
    r.alignDeg !== undefined && i % 40 === 0 ? { ...r, alignDeg: null } : r,
  );
  const fewRing = assessFlow(few, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.ok(fewRing.counts.discriminatorUnknownTicks > 0);
  assert.ok(fewRing.metrics.discriminatorUnknownFrac < EXCLUDED_FRACTION_CEILING);
  assert.equal(fewRing.verdict, "pass", fewRing.reasons.join("\n"));
});

test("control 3, a car STOPPED in reverse is not travelling backwards — and the gear alone said it was", () => {
  // THE LIVE FALSE CONVICTION THIS REPLACES. `againstFlow` rotated the nose
  // angle by 180° on `gear === -1` with no reference to MOTION, so a car
  // standing still in reverse with its nose perfectly along a one-way edge was
  // counted against the flow on every tick. That is the OPENING STATE OF EVERY
  // REVERSE MANOEUVRE — stop, select R, then move — and the reverse/park half
  // is what this instrument was ruled for. The product convicts nothing on
  // those ticks: `wrongWay` is a heading verdict and the nose is at 4°.
  const leg = buildRingLeg();
  const clean = assessFlow(leg.rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  const stopped = (r) => r.alignDeg !== undefined && r.tSec >= 45 && r.tSec < 49;
  const rows = leg.rows.map((r) => (stopped(r) ? { ...r, gear: -1, speedKmh: 0 } : { ...r }));
  const ring = assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];

  // 4.00 s, well past `wrongWaySustainSec` 1.5 s: this window convicted before.
  assert.equal(ring.counts.stationaryReverseTicks, 80);
  assert.equal(ring.counts.againstFlowTicks, 0, "a stopped car travels in no direction at all");
  assert.equal(ring.counts.convictingRuns, 0);
  assert.equal(ring.counts.discriminatorUnknownTicks, 0, "and it is ANSWERED, not shrugged at");
  assert.equal(ring.verdict, "pass", ring.reasons.join("\n"));

  // NOTHING LEFT THE DENOMINATOR. Surface membership is `edgeId != null &&
  // oneway === true` — a POSITION — and making it depend on speed is C1 with
  // one more step: it would empty the denominator the crawl is measured
  // against. The ticks are still counted; only the ROTATION is withheld.
  assert.equal(ring.counts.denominator, clean.counts.denominator);

  // THE INVARIANT: WHILE THE CAR IS STOPPED, ITS DIRECTION VERDICT MUST NOT
  // DEPEND ON WHICH GEAR IS SELECTED. Same car, same place, same heading.
  for (const gear of [-1, 0, 1]) {
    const g = leg.rows.map((r) => (stopped(r) ? { ...r, gear, speedKmh: 0 } : { ...r }));
    const s = assessFlow(g, leg.declared).surfaces[SURFACE.ONE_WAY];
    assert.equal(s.counts.againstFlowTicks, 0, "gear " + gear + " stopped");
    assert.equal(s.verdict, "pass");
  }

  // …AND IT IS NOT AN AMNESTY. A car STOPPED facing the wrong way up a one-way
  // street is against the flow, in reverse as in any other gear: the heading is
  // read, unrotated, exactly as the product reads it.
  const facingBack = leg.rows.map((r) =>
    stopped(r) ? { ...r, gear: -1, speedKmh: 0, alignDeg: OPPOSED_DEG, wrongWay: true } : { ...r },
  );
  const back = assessFlow(facingBack, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(back.counts.directionContradictionRows, 0, "the record is self-consistent");
  assert.equal(back.counts.againstFlowTicks, 80);
  assert.equal(back.counts.slowAgainstFlowTicks, 80, "counted, never excluded — C1");
  assert.equal(back.counts.reverseAgainstFlowTicks, 80, "counted, never excluded — C2");
  assert.equal(back.verdict, "fail", back.reasons.join("\n"));

  // THE PREDICATE IS `speedKmh > 0` AND NOT THE ENGINE'S `moving` (5 km/h).
  // A controller backing the wrong way down a one-way street at 4.9 km/h IS
  // travelling backwards and the rotation is owed to it — putting the engine's
  // grading threshold in this numerator is C1 and C2 exactly, which is the
  // draft defect this whole file exists to refuse.
  const crawl = leg.rows.map((r) =>
    r.alignDeg === undefined ? { ...r } : { ...r, gear: -1, speedKmh: 4.9, alignDeg: 1.5 },
  );
  const crawlRing = assessFlow(crawl, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.ok(crawlRing.counts.denominator > 500);
  assert.equal(crawlRing.counts.stationaryReverseTicks, 0, "4.9 km/h is moving, just not GRADED");
  assert.equal(crawlRing.counts.againstFlowTicks, crawlRing.counts.denominator);
  assert.equal(crawlRing.counts.slowAgainstFlowTicks, crawlRing.counts.denominator);
  assert.equal(crawlRing.verdict, "fail", crawlRing.reasons.join("\n"));

  // A REVERSE TICK WITH NO SPEED CANNOT BE ASKED WHICH WAY IT TRAVELLED. Not
  // zero — UNKNOWN, and the unknown-fraction ceiling is what makes it cost. A
  // FORWARD tick needs no speed, because its travel direction is its heading
  // whether it moves or not, so nothing is withheld from it.
  const noSpeed = leg.rows.map((r) => {
    if (r.alignDeg === undefined) return { ...r };
    const q = { ...r, gear: -1 };
    delete q.speedKmh;
    return q;
  });
  const dark = assessFlow(noSpeed, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(dark.counts.discriminatorUnknownTicks, dark.counts.denominator);
  assert.equal(dark.counts.againstFlowTicks, 0);
  assert.equal(dark.verdict, "unresolved", dark.reasons.join("\n"));
  const noSpeedFwd = noSpeed.map((r) => (r.alignDeg === undefined ? r : { ...r, gear: 1 }));
  const fwd = assessFlow(noSpeedFwd, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(fwd.counts.discriminatorUnknownTicks, 0, "a forward tick never needed the speed");
  assert.equal(fwd.verdict, "pass", fwd.reasons.join("\n"));
});

test("a leg that NEVER MOVED cannot testify that it held its lane", () => {
  // THE TRAP THE RULE ABOVE WALKS PAST, PINNED RATHER THAN INFERRED. Reading a
  // stopped car's heading means a leg parked on a one-way edge with its nose
  // along it reads a CLEAN AC-FLOW — 0 against-flow, 0 unknown, surface pass.
  // A parked car is also 0 m from its route, and this programme has twice
  // concluded something false from exactly that. What refuses the leg is
  // AC-LANE, whose `isGradable` carries the engine's own `moving` predicate,
  // and this test names it so a later edit to AC-LANE reds HERE too.
  const leg = buildRingLeg();
  const rows = leg.rows.map((r) => ({ ...r, speedKmh: 0, gear: -1 }));
  const out = assessLeg({ rows, declared: leg.declared });

  const ring = out.criteria["AC-FLOW"].surfaces[SURFACE.ONE_WAY];
  assert.equal(ring.counts.stationaryReverseTicks, ring.counts.denominator);
  assert.equal(ring.counts.againstFlowTicks, 0);
  assert.equal(ring.counts.discriminatorUnknownTicks, 0);
  assert.equal(ring.verdict, "pass", "AC-FLOW is honestly clean, and that is not enough");

  const lane = out.criteria["AC-LANE"];
  assert.equal(lane.counts.legGradedTicks, 0);
  assert.equal(lane.metrics.legExcludedFrac, 1);
  assert.equal(lane.counts.legNotMovingTicks, lane.counts.legScanTicks);
  assert.equal(lane.verdict, "unresolved", lane.reasons.join("\n"));

  assert.notEqual(out.verdict, "pass");
  assert.deepEqual(out.testimony.mayTestify, []);
});

test("the unknown-fraction ceiling refuses an ACQUITTAL and never a CONVICTION", () => {
  // THE UNDISCLOSED REGRESSION THIS REPAIRS. R18 made the ceiling early-return
  // `unresolved`, which refused convictions as well as acquittals — and on a
  // record in the RETIRED DIALECT (`wrongWay` and no `alignDeg` at all) every
  // tick that is not a positive `true` is UNKNOWN, so the unknown fraction is
  // 1 − (offence density). Clearing a 0.1 ceiling would have taken a leg that
  // spent NINE TENTHS of its one-way surface driving the wrong way. The old
  // dialect had silently lost the ability to convict at any realistic offence
  // density, while the comment at the site said the opposite in as many words.
  const leg = buildRingLeg({ signal: false });
  assert.equal(
    leg.rows.filter((r) => r.alignDeg !== undefined).length,
    0,
    "the fixture really is the pre-signal dialect",
  );

  // 2.00 s of undeclared wrong-way driving, POSITIVELY stated: 40 ticks at
  // 20 Hz, past `wrongWaySustainSec` 1.5 s.
  const rows = leg.rows.map((r) =>
    r.oneway === true && r.tSec >= 45 && r.tSec < 47 ? { ...r, wrongWay: true } : { ...r },
  );
  const ring = assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(ring.counts.againstFlowTicks, 40);
  assert.ok(
    ring.metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING,
    "the record IS too dark to acquit",
  );
  assert.equal(ring.counts.convictingRuns, 1);
  assert.equal(ring.verdict, "fail", ring.reasons.join("\n"));
  // BOTH reasons are published: a reader of a failing dark record still learns
  // the record was dark.
  assert.ok(ring.reasons.join(" ").includes("is unknown on"));
  assert.ok(ring.reasons.join(" ").includes("undeclared against-flow run"));

  // …and the SAME dark record with the offence taken out cannot ACQUIT, which
  // is the half of the rule that was never in question.
  const clean = assessFlow(leg.rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(clean.counts.againstFlowTicks, 0);
  assert.equal(clean.verdict, "unresolved", clean.reasons.join("\n"));
});

test("the unknown-fraction ceiling is EXCLUDED_FRACTION_CEILING, applied at the boundary", () => {
  // THE CEILING'S VALUE AT THIS USE SITE, WHICH WAS NOT COVERED. Since R18 it
  // is the ONLY defence against a dark one-way record — it replaced both the
  // liveness gate and the witness floor — and loosening it fivefold here left
  // both suites green. The constant is a declared JUDGEMENT (L4), so nothing
  // can derive it; what a test can do is prove the rule applies THIS number,
  // strictly, on both sides of it.
  const mk = (nUnknown) => {
    const leg = buildRingLeg();
    let seen = 0;
    const rows = leg.rows.map((r) =>
      r.alignDeg !== undefined && seen++ < nUnknown ? { ...r, alignDeg: null } : { ...r },
    );
    return assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  };
  const denominator = mk(0).counts.denominator;
  assert.equal(denominator, 600, "the fixture's own one-way denominator, 30.00 s at 20 Hz");

  const at = Math.round(EXCLUDED_FRACTION_CEILING * denominator);
  assert.equal(at, 60);
  const atCeiling = mk(at);
  assert.equal(atCeiling.counts.discriminatorUnknownTicks, at);
  near(atCeiling.metrics.discriminatorUnknownFrac, EXCLUDED_FRACTION_CEILING, 1e-12);
  assert.equal(atCeiling.verdict, "pass", "exactly AT the ceiling is not OVER it");

  const over = mk(at + 1);
  assert.ok(over.metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(over.verdict, "unresolved", over.reasons.join("\n"));
  // The refusal names the number it applied, so a reader can see WHICH ceiling
  // bound — three separate rules share this one constant (L4).
  assert.ok(
    over.reasons.join(" ").includes("> " + EXCLUDED_FRACTION_CEILING),
    over.reasons.join("\n"),
  );
});

/* ────────────────────────────────────────────────────────────────────────────
 * CONTROL 4 — C5 THE DEAD REFERENT. A probe wired to a constant.
 * ──────────────────────────────────────────────────────────────────────────*/

test("control 4 (the dead referent): a stuck-at-zero probe is REWARDED by lane holding and RED here", () => {
  const good = buildGoodLeg();
  const leg = { ...good, rows: good.rows.map((r) => ({ ...r, laneOffsetM: 0 })) };

  // THE OLD BEHAVIOUR: the criterion that existed actively rewards it.
  const lane = assessLaneHolding(leg.rows, leg.declared);
  assert.equal(lane.verdict, "pass");
  assert.equal(lane.metrics.p90AbsOffsetM, 0);
  assert.equal(lane.metrics.maxAbsOffsetM, 0);
  assert.equal(lane.counts.saturatedTicks, 0);
  const flow = assessFlow(leg.rows, leg.declared);
  assert.equal(flow.verdict, "pass");

  // MINE.
  const live = assessReferentLiveness(leg.rows, leg.declared);
  assert.equal(live.verdict, "fail", live.reasons.join("\n"));
  assert.equal(live.metrics.spreadM, 0);
  assert.equal(live.metrics.injectionDeclaredM, 2.0);
  assert.equal(live.metrics.injectionReadM, 0);
  assert.equal(live.metrics.injectionErrM, 2.0);
  assert.ok(live.reasons.join(" ").includes("LANE_SWITCH_DEADBAND_M"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("control 4b: a leg with NO injection cannot pass on a plausible-looking record", () => {
  const leg = buildGoodLeg();
  const live = assessReferentLiveness(leg.rows, pin({ ...leg.declared, calibration: null }));
  assert.equal(live.verdict, "unresolved");
  assert.ok(live.reasons.join(" ").includes("no known-offset injection"));
});

/* ────────────────────────────────────────────────────────────────────────────
 * CONTROL 5 — C4 THE MISSING RECORD. A 4 s window covering an excursion, never
 * published. The product's own sibling consumer names this shape in its own
 * words at devrig/rig.ts:54-55.
 * ──────────────────────────────────────────────────────────────────────────*/

test("control 5 (the missing record): the hole hides a convicting excursion", () => {
  // First: the excursion IS convicted when the record carries it. 4.0 m is past
  // laneKeepMaxOffsetM (3.25) and short of the saturation bound (LANE_WIDTH_M/2
  // = 4.0625), so it is a real excursion and not an excluded clamp.
  const withIt = mutate(buildGoodLeg(), 30, 34, () => ({ laneOffsetM: 4.0 }));
  const laneWith = assessLaneHolding(withIt.rows, withIt.declared);
  assert.equal(laneWith.verdict, "fail", laneWith.reasons.join("\n"));
  assert.ok(laneWith.metrics.longestExcursionSec >= PRODUCT.LANE_KEEP_SUSTAIN_SEC);
  // …and p90 ALONE would have let it through, which is why the excursion rule exists.
  assert.ok(laneWith.metrics.p90AbsOffsetM < LANE_HOLD_P90_CEILING_M);

  // Now publish nothing across that window, and renumber seq contiguously so the
  // drop counter sees a perfect record.
  const leg = dropWindow(withIt, 30, 34);
  const lane = assessLaneHolding(leg.rows, leg.declared);
  const flow = assessFlow(leg.rows, leg.declared);
  assert.equal(lane.verdict, "pass", "THE OLD BEHAVIOUR: a hole reads as a clean drive");
  assert.equal(flow.verdict, "pass");

  const rec = assessRecordCompleteness(leg.rows, leg.declared);
  assert.equal(rec.counts.droppedTicks, 0, "the seq census is BLIND to a renumbered record");
  assert.equal(rec.counts.nonMonotonicSeqSteps, 0);
  assert.equal(rec.metrics.longestWallGapMs, 4050);
  assert.equal(rec.metrics.wallGapsAtOrAboveSustain, 1);
  assert.equal(rec.verdict, "unresolved", rec.reasons.join("\n"));
  assert.ok(rec.reasons.join(" ").includes("laneKeepSustainSec"));
  // `blindWallMs` is the total time inside those gaps, and the refusal names
  // it: a published number nothing reads is the defect this repo is named for.
  assert.equal(rec.metrics.blindWallMs, 4050);
  assert.ok(rec.reasons.join(" ").includes("4050 ms in those gaps in total"));
  assert.equal(assessLeg(leg).verdict, "unresolved");
});

test("control 5b (the paused sim): the SIM clock census is blind and the wall clock is not", () => {
  // rig.ts:54-55: "GAPS HERE MEAN THE SIM WAS PAUSED (a teach card / quiz /
  // consequence overlay stops onTick entirely)". A paused sim advances wall time
  // and not tSec, so a census on the sim clock sees a continuous record.
  const leg = dropWindow(buildGoodLeg(), 30, 34, { pauseSimClock: true });
  const rec = assessRecordCompleteness(leg.rows, leg.declared);
  assert.equal(rec.metrics.simGapsAtOrAboveSustain, 0, "the sim clock shows nothing at all");
  near(rec.metrics.longestSimGapSec, 0.05);
  assert.equal(rec.metrics.wallGapsAtOrAboveSustain, 1);
  assert.equal(rec.metrics.longestWallGapMs, 4050);
  assert.equal(rec.verdict, "unresolved");
});

test("control 5c: a record with a dropped run and honest seq numbers is caught by the drop counter", () => {
  const good = buildGoodLeg();
  const rows = good.rows.filter((r) => !(r.tSec >= 30 && r.tSec < 34)).map((r) => ({ ...r }));
  // seq preserved (a real ring-buffer drop), wall clock rewritten to be smooth
  // so ONLY the sequence numbers betray the hole.
  const rewritten = rows.map((r, i) => ({ ...r, wallMs: 1000 + i * 50, tSec: i * 0.05 }));
  const rec = assessRecordCompleteness(rewritten, good.declared);
  assert.equal(rec.metrics.wallGapsAtOrAboveSustain, 0, "the wall census is blind to a rewritten clock");
  assert.equal(rec.counts.droppedTicks, 80);
  assert.equal(rec.counts.maxContiguousDrop, 80);
  near(rec.metrics.impliedDropBlindSec, 4);
  assert.equal(rec.verdict, "unresolved", rec.reasons.join("\n"));
});

test("control 5e: a record with BOTH clocks rewritten is caught ONLY from outside itself", () => {
  // The strongest version of C4: the hole is closed up, seq renumbered, and both
  // clocks made smooth. Nothing INSIDE the record can see it — this is a
  // disclosed live cheat and the test exists to name it rather than hide it.
  const good = buildGoodLeg();
  const rows = good.rows
    .filter((r) => !(r.tSec >= 30 && r.tSec < 34))
    .map((r, i) => ({ ...r, seq: i, wallMs: 1000 + i * 50, tSec: i * 0.05 }));

  // EVERY INTERNAL CENSUS IS CLEAN, and each is asserted individually so the
  // claim "nothing inside the record can see it" is executed rather than said.
  const blind = assessRecordCompleteness(rows, pin({ ...good.declared, expectedSpanMs: undefined }));
  assert.equal(blind.counts.droppedTicks, 0);
  assert.equal(blind.counts.nonMonotonicSeqSteps, 0);
  assert.equal(blind.metrics.wallGapsAtOrAboveSustain, 0);
  assert.equal(blind.metrics.simGapsAtOrAboveSustain, 0);
  assert.equal(blind.metrics.gapBlindWallMs, 0, "the cumulative gap census is clean too");
  // …and WITHOUT a driver clock the verdict is now UNRESOLVED rather than the
  // clean `pass` this control used to document. The record still cannot see
  // itself; the criteria no longer mistake that for evidence. A leg that
  // declares no external duration has not been checked against one.
  assert.equal(blind.verdict, "unresolved", blind.reasons.join("\n"));
  assert.ok(blind.reasons.join(" ").includes("no driver-clock span declared"));

  // The only defence is a duration the record did not author. It must come from
  // the harness's own clock; taken from the record it is circular — and the
  // record's OWN span is published beside it, unconsumed, to show the gap.
  const rec = assessRecordCompleteness(rows, good.declared);
  assert.equal(rec.metrics.coveredWallMs, 59_000, "1180 ticks x 50 ms actually sampled");
  assert.equal(rec.metrics.recordSpanMs, 58_950, "what the record says about itself: PUBLISHED, NEVER CONSUMED");
  assert.equal(rec.metrics.driverWallSpanMs, 63_000);
  assert.equal(rec.metrics.unsampledWallMs, 4_000);
  assert.equal(rec.verdict, "unresolved", rec.reasons.join("\n"));
  assert.ok(rec.reasons.join(" ").includes("unsampled"));
});

test("control 5d: a record with no sequence number at all cannot say it dropped nothing", () => {
  const good = buildGoodLeg();
  const rows = good.rows.map((r) => ({ ...r, seq: undefined }));
  const rec = assessRecordCompleteness(rows, good.declared);
  assert.equal(rec.verdict, "fail");
  assert.equal(rec.counts.rowsWithoutSeq, rows.length);
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE JUDGE'S TEN — CHEATING LEGS THAT READ `LEG = pass` AGAINST THE CRITERIA
 * AS THEY STOOD AFTER THE FIVE CONTROLS ABOVE WERE GREEN.
 *
 * An adversary built its own fixture against this module's public API and got
 * ten legs to pass. Every one is rebuilt here, and every one was RUN against
 * the previous revision before it was repaired — the `pass` each control names
 * in its comment is a measurement, not a reconstruction. The five gaps they
 * exposed were MISSING RULES, not loose thresholds: not one of them is fixed by
 * widening a number, and the known-good leg is asserted green in every one.
 *
 * Measured on the previous revision, all ten, in one run:
 *   N1  pass · 367/1260 against-flow, frac 0.2913, 34 runs, convicting 0
 *   N15 pass · 734/800 against-flow on a ring, frac 0.9175, convicting 0
 *   N3a pass · period null, 0 Hz, floor 180 -> 30, a 4.00 s excursion reads 0.000
 *   N3b pass · a 4.00 s excursion reads 0.200
 *   N2  pass · 21 holes, dropped 0, longest wall gap 2900 ms
 *   N13 pass · 400/801 curved rows unpainted at 4.0 m, excludedFrac 0.0000
 *   N17 pass · 400/801 curved rows not-moving at 4.0 m, excludedFrac 0.0000
 *   N4  pass · a 4.00 s excursion outside curvedSpans, 459/1260 rows graded by nothing
 *   N12 pass · two 2.00 s stops at 4.1 m, excludedFrac 0.0999, excursionSec 0.000
 *   N14 pass · 600 ring rows carrying wrongWay:true, against-flow 0
 * ──────────────────────────────────────────────────────────────────────────*/

/** N1/N15's shape: `on` wrong ticks, then `off` lawful ticks, repeating. */
function alternate(n, on = 11, off = 1) {
  return n % (on + off) < on;
}

test("N1 (sub-threshold alternation, two-way): 34 lawful-length runs are one offence", () => {
  let k = 0;
  const leg = mutate(buildGoodLeg(), 20, 40, () => {
    const against = alternate(k++);
    return against ? { opposingBank: true, laneOffsetM: 0 } : { laneOffsetM: 0 };
  });
  const flow = assessFlow(leg.rows, leg.declared);
  const tw = flow.surfaces[SURFACE.TWO_WAY];

  // THE MEASURED CHEAT, asserted exactly: every run is under the clock.
  assert.equal(tw.counts.againstFlowTicks, 367);
  assert.equal(tw.counts.denominator, 1260);
  assert.equal(tw.counts.convictingRuns, 0, "not one run reaches solidLineCrossSustainSec");
  assert.equal(tw.counts.undeclaredRuns, 34);
  near(tw.metrics.longestUndeclaredRunSec, 0.55);
  near(tw.metrics.againstFlowFrac, 367 / 1260);

  // AND IT IS RED ON THE FRACTION, which is the rule the run length cannot be.
  assert.equal(flow.verdict, "fail", flow.reasons.join("\n"));
  assert.ok(tw.reasons.join(" ").includes("speedingRearmSec"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("N15 (armed ring + alternation): the offence cannot buy its own acquittal", () => {
  let k = 0;
  const good = buildGoodLeg();
  const rows = good.rows.map((r) => {
    if (r.tSec < 23) return { ...r };
    // 11 ticks against the flow, 1 with it, repeating — and the LAWFUL tick now
    // SAYS it is lawful instead of publishing an ambiguous `false`. That is what
    // keeps the runs separate: an unknown tick is BRIDGED by `flowRuns`, so a
    // fixture that migrated the offence and left the lawful tick in the retired
    // dialect would fuse the alternation into one long run and convict on
    // LENGTH — which is the wrong rule, and would let the fraction ceiling this
    // control exists for go untested.
    const against = alternate(k++);
    return {
      ...r,
      edgeId: "ring-1",
      oneway: true,
      wrongWay: against,
      alignDeg: against ? OPPOSED_DEG : ALIGNED_DEG,
      wrongWayArmed: true,
      alignEdgeId: "ring-1",
      alignTravelDir: 1,
      alignRoundabout: true,
      alignOffCarriageway: false,
    };
  });
  const witness = rows.filter((r) => r.wrongWay === true && r.tSec >= 40).slice(0, 11);
  const leg = {
    ...good,
    rows,
    declared: pin({
      ...good.declared,
      manoeuvreSpans: [{ fromSeq: witness[0].seq, toSeq: witness[10].seq, reason: "witness" }],
    }),
  };
  const flow = assessFlow(leg.rows, leg.declared);
  const ring = flow.surfaces[SURFACE.ONE_WAY];

  // THE MEASURED CHEAT: every run is under the clock, so nothing convicts on
  // LENGTH and the leg used to read pass. (It had a second half — the liveness
  // gate was armed by the very offence it existed to detect — and that half is
  // gone with the gate: the signed value clears a ring without an offence, so
  // arming is no longer a thing the cheat has to buy. What the gate never did,
  // and what still reds this leg, is count.)
  assert.equal(ring.counts.denominator, 800);
  assert.equal(ring.counts.againstFlowTicks, 734);
  assert.equal(ring.counts.discriminatorUnknownTicks, 0, "every tick says which way it faced");
  assert.equal(ring.counts.convictingRuns, 0);
  near(ring.metrics.againstFlowFrac, 734 / 800);

  // AND IT IS RED.
  assert.equal(ring.verdict, "fail", ring.reasons.join("\n"));
  assert.ok(ring.reasons.join(" ").includes("wrongWaySustainSec"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("N3a (frozen sim clock): the floor cannot collapse and the excursion cannot vanish", () => {
  const withIt = mutate(buildGoodLeg(), 30, 34, () => ({ laneOffsetM: 4.0 }));
  const leg = { ...withIt, rows: withIt.rows.map((r) => ({ ...r, tSec: 0 })) };

  // THE MEASURED CHEAT: the sim clock is dead and used to take the floor with it.
  assert.equal(medianTickPeriodSec(leg.rows), null, "the sim clock reports no period at all");
  near(medianWallPeriodSec(leg.rows), 0.05, 1e-12);

  const lane = assessLaneHolding(leg.rows, leg.declared);
  assert.equal(lane.counts.sampleFloor, 180, "the floor is 180 on the wall clock, not 30");
  assert.equal(lane.metrics.tickRateHz, 20);
  near(lane.metrics.longestExcursionSec, 4.0);
  assert.equal(lane.verdict, "fail", lane.reasons.join("\n"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("N3b (stuttering sim clock): a 4 s excursion is 4 s, not 0.2 s", () => {
  const withIt = mutate(buildGoodLeg(), 30, 34, () => ({ laneOffsetM: 4.0 }));
  // tSec advances one period every twentieth tick.
  const leg = { ...withIt, rows: withIt.rows.map((r, i) => ({ ...r, tSec: Math.floor(i / 20) * 0.05 })) };

  // THE MEASURED CHEAT, still visible in the sim clock this file no longer uses:
  // the 4.00 s of wall time spanning rows 600..679 reads 0.15 s on `tSec`, and
  // the old metric reported 0.200 s once a run's own one-period dwell was added.
  near(medianTickPeriodSec(leg.rows), 0.05);
  near(leg.rows[679].tSec - leg.rows[600].tSec, 0.15, 1e-9);
  near((leg.rows[679].wallMs - leg.rows[600].wallMs) / 1000, 3.95, 1e-9);

  const lane = assessLaneHolding(leg.rows, leg.declared);
  near(lane.metrics.longestExcursionSec, 4.0);
  assert.equal(lane.verdict, "fail", lane.reasons.join("\n"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("N2 (a hole every 2.9 s): blindness is cumulative or it is not a census", () => {
  const good = buildGoodLeg();
  const kept = good.rows.filter((_, i) => i % 58 !== 57);
  let wall = 1000;
  const rows = kept.map((r, i) => {
    const out = { ...r, seq: i, wallMs: wall };
    wall += (i + 1) % 57 === 0 ? 2900 : 50;
    return out;
  });
  const leg = { ...good, rows };
  const rec = assessRecordCompleteness(leg.rows, leg.declared);

  // THE MEASURED CHEAT: every single step is under the per-step rule.
  assert.equal(rec.counts.droppedTicks, 0, "seq was renumbered: the drop counter sees nothing");
  assert.equal(rec.metrics.longestWallGapMs, 2900);
  assert.equal(rec.metrics.wallGapsAtOrAboveSustain, 0, "no ONE gap reaches 3.0 s");
  // …and the record's own span is INFLATED by the holes, so the old
  // `covered < expected` check pointed the wrong way.
  assert.equal(rec.metrics.recordSpanMs, 121_750);
  assert.ok(rec.metrics.recordSpanMs > rec.metrics.driverWallSpanMs);

  // AND IT IS RED, on the aggregate.
  assert.equal(rec.metrics.gapBlindWallMs, 59_850);
  assert.equal(rec.verdict, "unresolved", rec.reasons.join("\n"));
  assert.ok(rec.reasons.join(" ").includes("blindness is cumulative"));
  assert.equal(assessLeg(leg).verdict, "unresolved");
});

test("N13 (scattered unpainted rows): an unmetered class removed half the leg", () => {
  const good = buildGoodLeg();
  const leg = {
    ...good,
    rows: good.rows.map((r) =>
      r.seq >= 260 && r.seq <= 1060 && r.seq % 2 === 1
        ? { ...r, laneLinesPainted: false, laneOffsetM: 4.0 }
        : { ...r },
    ),
  };
  const lane = assessLaneHolding(leg.rows, leg.declared);

  // THE MEASURED CHEAT: scattered, so the contiguous-run rule sees one tick.
  assert.equal(lane.counts.curvedTicksTotal, 801);
  assert.equal(lane.counts.unpaintedTicks, 400);
  assert.equal(lane.counts.gradedTicks, 401);
  near(lane.metrics.longestExcludedRunSec, 0.05);
  assert.equal(
    (lane.counts.offRoadTicks + lane.counts.saturatedTicks) / lane.counts.curvedTicksTotal,
    0,
    "the OLD formula — (offRoad + saturated) / curved — is exactly 0.0000 here",
  );

  // AND IT IS RED, because the ceiling is now over the UNION of all six classes.
  near(lane.metrics.excludedFrac, 400 / 801);
  assert.ok(lane.metrics.excludedFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(lane.verdict, "unresolved", lane.reasons.join("\n"));
  assert.ok(lane.reasons.join(" ").includes("their union"));
  assert.equal(assessLeg(leg).verdict, "unresolved");
});

test("N17 (scattered not-moving rows): the same hole, a different class", () => {
  const good = buildGoodLeg();
  const leg = {
    ...good,
    rows: good.rows.map((r) =>
      r.seq >= 260 && r.seq <= 1060 && r.seq % 2 === 1
        ? { ...r, speedKmh: 0, laneOffsetM: 4.0 }
        : { ...r },
    ),
  };
  const lane = assessLaneHolding(leg.rows, leg.declared);

  assert.equal(lane.counts.notMovingTicks, 400 + 0, "400 scattered, the calibration park is outside the bucket");
  assert.equal(lane.counts.gradedTicks, 401);
  near(lane.metrics.excludedFrac, 400 / 801);

  // TWO rules red it: the union ceiling, and the excursion census — which no
  // longer carries `moving`, so 400 ticks at 4.0 m are counted rather than
  // excluded for being ungradeable.
  assert.equal(lane.counts.excursionTicks, 400);
  near(lane.metrics.cumulativeExcursionSec, 20.0);
  near(lane.metrics.longestExcursionSec, 0.05, 1e-9);
  assert.equal(lane.verdict, "fail", lane.reasons.join("\n"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("N4 (excursion outside curvedSpans): the product's own condition is not bucket-scoped", () => {
  const leg = mutate(buildGoodLeg(), 55, 59, () => ({ laneOffsetM: 4.0 }));
  const lane = assessLaneHolding(leg.rows, leg.declared);

  // THE MEASURED CHEAT: 459 rows fall outside the declared curved span, and the
  // excursion sat in them.
  assert.equal(lane.counts.outsideCurvedSpanTicks, 1260 - 801);
  assert.equal(lane.counts.curvedTicksTotal, 801);
  assert.equal(lane.counts.gradedTicks, 801, "the curved bucket is spotless");
  assert.equal(lane.metrics.excludedFrac, 0);

  // AND IT IS RED: the excursion census is leg-wide.
  near(lane.metrics.longestExcursionSec, 4.0);
  assert.equal(lane.verdict, "fail", lane.reasons.join("\n"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("N12 (saturation park): two stops under the clock are one episode in aggregate", () => {
  let leg = buildGoodLeg();
  leg = mutate(leg, 20, 22, () => ({ laneOffsetM: 4.1, speedKmh: 0 }));
  leg = mutate(leg, 40, 42, () => ({ laneOffsetM: 4.1, speedKmh: 0 }));
  const lane = assessLaneHolding(leg.rows, leg.declared);

  // THE MEASURED CHEAT: 4.1 m is past the saturation bound, so both stops used
  // to leave the census for being too far out to count — and each is 2.00 s,
  // deliberately under laneKeepSustainSec.
  assert.equal(lane.counts.saturatedTicks, 80);
  near(lane.metrics.excludedFrac, 80 / 801);
  assert.ok(
    lane.metrics.excludedFrac < EXCLUDED_FRACTION_CEILING,
    "0.0999 — under the ceiling, and no widening may be what reds this leg",
  );
  near(lane.metrics.longestExcursionSec, 2.0);
  assert.ok(lane.metrics.longestExcursionSec < PRODUCT.LANE_KEEP_SUSTAIN_SEC);

  // AND IT IS RED, on the cumulative half of the census.
  assert.equal(lane.counts.excursionTicks, 80);
  near(lane.metrics.cumulativeExcursionSec, 4.0);
  assert.equal(lane.verdict, "fail", lane.reasons.join("\n"));
  assert.ok(lane.reasons.join(" ").includes("in aggregate"));
  assert.equal(assessLeg(leg).verdict, "fail");
});

test("N14 (`oneway ?? false` on a ring): a row cannot be two-way and wrong-way at once", () => {
  const good = buildGoodLeg();
  const leg = {
    ...good,
    rows: good.rows.map((r) =>
      r.tSec >= 25 && r.tSec < 55
        ? { ...r, edgeId: "ring-1", oneway: false, wrongWay: true }
        : { ...r },
    ),
  };
  const flow = assessFlow(leg.rows, leg.declared);
  const tw = flow.surfaces[SURFACE.TWO_WAY];

  // THE MEASURED CHEAT: 600 ring rows carry `wrongWay: true` for 30 s and the
  // two-way discriminator reports zero against-flow ticks, because
  // `opposingBank` was never set on them.
  assert.equal(tw.counts.againstFlowTicks, 0);
  assert.equal(flow.surfaces[SURFACE.ONE_WAY].counts.denominator, 0);
  assert.equal(leg.rows.filter((r) => r.wrongWay === true).length, 600);

  // AND IT IS RED: the runtime assigns `wrongWay` only where
  // `edgeRt.edge.oneway` holds, so these rows are filed under a surface that
  // cannot hold them. The reason is asserted BY THE QUOTED CODE and not by a
  // line number: a parallel lane is moving worldRuntime.ts, and the citation
  // "2306-2312" this test used to pin went stale inside one session.
  assert.equal(tw.counts.contradictoryRows, 600);
  assert.equal(tw.verdict, "fail", tw.reasons.join("\n"));
  assert.ok(
    tw.reasons.join(" ").includes("`wrongWay` is assigned only where `edgeRt.edge.oneway` holds"),
    tw.reasons.join("\n"),
  );
  assert.equal(assessLeg(leg).verdict, "fail");
});

/* ────────────────────────────────────────────────────────────────────────────
 * §DECLARED — THE PIN AND THE TWO BOUNDS.
 * ──────────────────────────────────────────────────────────────────────────*/

test("a declaration that was not pinned before the drive buys nothing", () => {
  const leg = buildRingLeg({ witness: { fromSec: 40, toSec: 42 } });
  const unpinned = { ...leg.declared };
  delete unpinned.spansHash;
  const flow = assessFlow(leg.rows, unpinned);
  // The span is stripped before it reaches the surface, so the run it would
  // have acquitted convicts, AND the missing pin is reported on top.
  assert.equal(flow.surfaces[SURFACE.ONE_WAY].verdict, "fail");
  assert.ok(flow.reasons.join(" ").includes("not pinned"));
});

test("a span rewritten after it was pinned no longer matches its pin", () => {
  const leg = buildRingLeg({ witness: { fromSec: 40, toSec: 42 } });
  // The author moves the span to cover something the drive turned out to
  // contain, keeping the hash it committed to.
  const moved = {
    ...leg.declared,
    manoeuvreSpans: [{ fromSeq: 500, toSeq: 900, reason: "witness" }],
  };
  const flow = assessFlow(leg.rows, moved);
  assert.ok(flow.reasons.join(" ").includes("do not match their pin"));
  assert.equal(flow.surfaces[SURFACE.ONE_WAY].verdict, "fail");
  // …and the same span, honestly re-pinned, is refused by the DURATION bound
  // instead: 401 ticks is 20.05 s of a 63 s leg.
  const repinned = assessFlow(leg.rows, pin(moved));
  assert.ok(repinned.reasons.join(" ").includes("gets no larger allowance"));
  assert.equal(repinned.verdict, "fail");
});

test("declared removals are bounded in count as well as in duration", () => {
  const good = buildGoodLeg();
  // 16 one-tick manoeuvre spans on a 63 s leg. Total duration is trivial
  // (0.80 s), so ONLY the count bound can refuse this.
  const manoeuvreSpans = [];
  for (let i = 0; i < 16; i++) manoeuvreSpans.push({ fromSeq: 200 + i * 10, toSeq: 200 + i * 10 });
  const declared = pin({ ...good.declared, manoeuvreSpans });
  const flow = assessFlow(good.rows, declared);
  assert.equal(flow.counts.declaredRemovalSpans, 17, "16 manoeuvres + the calibration park");
  assert.equal(
    flow.counts.declaredSpanCountCeiling,
    Math.floor(63 / PRODUCT.SPEEDING_REARM_SEC),
    "floor(leg seconds / speedingRearmSec) — derived from the product, not chosen",
  );
  assert.ok(flow.metrics.declaredRemovedFrac < EXCLUDED_FRACTION_CEILING, "the duration bound is NOT what refuses it");
  assert.ok(flow.reasons.join(" ").includes("more separate acts than the product could tell apart"));
  assert.equal(flow.verdict, "unresolved");

  // One fewer, and it is allowed: the bound is real, not decorative.
  const ok = pin({ ...good.declared, manoeuvreSpans: manoeuvreSpans.slice(0, 14) });
  assert.equal(assessFlow(good.rows, ok).verdict, "pass");
});

test("a discriminator that is UNKNOWN on much of its own denominator settles nothing", () => {
  // The liveness gate asks whether `wrongWay` can ever say true. It does not
  // ask how often it said ANYTHING. A tap that publishes the field on some ring
  // ticks and omits it on others clears the gate with one witness and then
  // fills its denominator with rows nobody answered for — `null` is UNKNOWN in
  // `againstFlow` and is never read as with-the-flow, and this is the rule that
  // makes those unknowns cost something.
  const good = buildGoodLeg();
  const rows = good.rows.map((r, i) => {
    if (r.tSec < 23) return { ...r };
    const ring = { ...r, edgeId: "ring-1", oneway: true };
    if (r.tSec >= 40 && r.tSec < 42) ring.wrongWay = true; // the declared witness
    else if (i % 5 < 2) delete ring.wrongWay;              // 40 % never published
    else ring.wrongWay = false;
    return ring;
  });
  const witness = rows.filter((r) => r.wrongWay === true);
  const declared = pin({
    ...good.declared,
    manoeuvreSpans: [{ fromSeq: witness[0].seq, toSeq: witness[witness.length - 1].seq, reason: "witness" }],
  });
  const ring = assessFlow(rows, declared).surfaces[SURFACE.ONE_WAY];

  // The liveness gate is satisfied, so nothing else would have stopped this.
  assert.ok(ring.counts.discriminatorTrueTicks > 0);
  assert.ok(ring.counts.convictingRuns === undefined || ring.counts.convictingRuns === 0);
  // …and 40 % of the denominator was never answered.
  assert.ok(ring.metrics.discriminatorUnknownFrac > EXCLUDED_FRACTION_CEILING);
  assert.equal(ring.verdict, "unresolved", ring.reasons.join("\n"));
  assert.ok(ring.reasons.join(" ").includes("is unknown on"));
});

test("the fraction ceilings are the product's arithmetic, per surface", () => {
  assert.equal(surfaceSustainSec(SURFACE.TWO_WAY), PRODUCT.SOLID_LINE_CROSS_SUSTAIN_SEC);
  assert.equal(surfaceSustainSec(SURFACE.ONE_WAY), PRODUCT.WRONG_WAY_SUSTAIN_SEC);
  assert.notEqual(
    surfaceSustainSec(SURFACE.TWO_WAY),
    surfaceSustainSec(SURFACE.ONE_WAY),
    "the two surfaces do NOT share a clock — that was the bug",
  );
  // BOTH HALVES OF THE CEILING ARE THE SURFACE'S OWN. The re-arm half used to
  // be `speedingRearmSec` on both surfaces, which left `WRONG_WAY_REARM_SEC`
  // mirrored, drift-tested, called a "LIVE CLOCK" by the module header — and
  // read by nothing. It is the one-way surface's re-arm and it is now spent.
  assert.equal(surfaceRearmSec(SURFACE.TWO_WAY), PRODUCT.SPEEDING_REARM_SEC);
  assert.equal(surfaceRearmSec(SURFACE.ONE_WAY), PRODUCT.WRONG_WAY_REARM_SEC);
  assert.equal(surfaceRearmSec("nonsense"), null);
  assert.equal(
    surfaceAgainstFlowFracCeiling(SURFACE.TWO_WAY),
    0.6 / (0.6 + PRODUCT.SPEEDING_REARM_SEC),
  );
  assert.equal(
    surfaceAgainstFlowFracCeiling(SURFACE.ONE_WAY),
    1.5 / (1.5 + PRODUCT.WRONG_WAY_REARM_SEC),
  );
  // The two figures are EQUAL TODAY (engine.ts:1258-1259: WRONG_WAY_REARM_SEC
  // borrows speedingRearmSec's figure "for the same idea"), so this assertion
  // holds either way and is NOT what proves the one-way ceiling reads the
  // one-way constant.
  assert.equal(
    surfaceAgainstFlowFracCeiling(SURFACE.ONE_WAY),
    1.5 / (1.5 + PRODUCT.SPEEDING_REARM_SEC),
  );
  // WHAT THIS TEST CANNOT DO, STATED RATHER THAN LEFT TO BE DISCOVERED. A
  // mutation that makes `surfaceRearmSec(ONE_WAY)` return
  // `PRODUCT.SPEEDING_REARM_SEC` SURVIVES this whole suite — measured this
  // session in an isolated copy, 0 tests red — because the two constants hold
  // the same number, so no behavioural assertion can tell the wiring apart. It
  // is killed from the other direction instead: changing
  // `PRODUCT.WRONG_WAY_REARM_SEC` from 4 to 6 reds three tests (this one, the
  // N15a cheat, and the drift test), which is what proves the ONE-WAY ceiling
  // reads the ONE-WAY constant. The equality below is the precondition for
  // that argument, and if the product ever breaks it this assertion is the one
  // that says so.
  assert.equal(
    PRODUCT.WRONG_WAY_REARM_SEC,
    PRODUCT.SPEEDING_REARM_SEC,
    "while these are equal, no test can distinguish which one surfaceRearmSec returns",
  );
  // Both re-derived from the numbers the drift test reads out of platform/src,
  // so a ceiling cannot drift away from the constants it is made of.
  near(surfaceAgainstFlowFracCeiling(SURFACE.TWO_WAY), 0.130435, 1e-6);
  near(surfaceAgainstFlowFracCeiling(SURFACE.ONE_WAY), 0.272727, 1e-6);
});

test("declaredSpansHash is key-order independent and changes with any span", () => {
  const a = { calibration: { fromSeq: 0, toSeq: 9, offsetM: 2 }, curvedSpans: [], expectedSpanMs: 1000 };
  const b = { expectedSpanMs: 1000, curvedSpans: [], calibration: { offsetM: 2, toSeq: 9, fromSeq: 0 } };
  assert.equal(declaredSpansHash(a), declaredSpansHash(b), "key order must not change the pin");
  assert.notEqual(
    declaredSpansHash(a),
    declaredSpansHash({ ...a, calibration: { fromSeq: 0, toSeq: 10, offsetM: 2 } }),
    "moving a span by one tick must change the pin",
  );
  // Channels and other non-span fields are NOT pinned: the pin is about WHERE
  // the spans fall, and nothing else.
  assert.equal(declaredSpansHash(a), declaredSpansHash({ ...a, channels: ["x"] }));
});

/* ────────────────────────────────────────────────────────────────────────────
 * EXTRA CONTROLS — found while building the five above.
 * ──────────────────────────────────────────────────────────────────────────*/

test("extra control: flickering edgeId to null must not dissolve a wrong-bank run", () => {
  // Without bridging, a controller that drops the edge every other tick never
  // accumulates 0.6 s of anything and the threshold is dead.
  const leg = mutate(buildGoodLeg(), 20, 40, (r) =>
    r.seq % 2 === 0
      ? { opposingBank: true, laneOffsetM: 0 }
      : { edgeId: null, opposingBank: true, laneOffsetM: 0 },
  );
  const flow = assessFlow(leg.rows, leg.declared);
  const tw = flow.surfaces[SURFACE.TWO_WAY];
  assert.equal(flow.verdict, "fail", flow.reasons.join("\n"));
  assert.equal(tw.runs.length, 1, "the flicker must leave ONE run, not 200 harmless ones");
  // 200 on-surface wrong-bank ticks, 200 nulls between them; the last null is
  // still pending when the run closes, so 199 are absorbed as bridged.
  assert.equal(tw.counts.againstFlowTicks, 200);
  assert.equal(tw.runs[0].bridgedTicks, 199);
  assert.equal(flow.counts.unclassifiedTicks, 200);
});

test("extra control: a probe that never declared the opposingBank channel cannot read as a pass", () => {
  const leg = buildGoodLeg();
  const flow = assessFlow(leg.rows, {
    ...leg.declared,
    channels: leg.declared.channels.filter((c) => c !== "opposingBank"),
  });
  assert.equal(flow.surfaces[SURFACE.TWO_WAY].verdict, "unresolved");
  assert.equal(flow.verdict, "unresolved");
});

test("the U-turn blip stays GREEN: 0.4 s on the far bank is not a crossing", () => {
  // This is why `moving`/`forwardGear` could be stripped from the numerator at
  // all: the false positive they suppressed is suppressed by the run length
  // instead, and the run length is the product's own 0.6 s.
  const leg = mutate(buildGoodLeg(), 20, 20.4, () => ({ opposingBank: true }));
  const flow = assessFlow(leg.rows, leg.declared);
  assert.equal(flow.surfaces[SURFACE.TWO_WAY].counts.againstFlowTicks, 8);
  assert.ok(Math.abs(flow.surfaces[SURFACE.TWO_WAY].metrics.longestUndeclaredRunSec - 0.4) < 1e-9);
  assert.equal(flow.verdict, "pass", flow.reasons.join("\n"));
  // One more tenth of a second and it convicts — the threshold is real, not decorative.
  const longer = mutate(buildGoodLeg(), 20, 20.65, () => ({ opposingBank: true }));
  assert.equal(assessFlow(longer.rows, longer.declared).verdict, "fail");
});

test("saturation is excluded and counted, never averaged", () => {
  // 4.20 m is a legitimately HELD lane on a road with lanesPerDir >= 2 (the true
  // ceiling is LANE_WIDTH_M/2 + LANE_SWITCH_DEADBAND_M = 4.4125), so the bound is
  // stated symbolically and nothing asserts 4.0625 is a clamp.
  const leg = mutate(buildGoodLeg(), 20, 22, () => ({ laneOffsetM: 4.2 }));
  const lane = assessLaneHolding(leg.rows, leg.declared);
  // The declared curved span is inclusive at both ends: 801 ticks, 40 of them
  // saturated, 761 graded. The arithmetic is asserted so a silent change to the
  // bucket cannot pass as a change to the metric.
  assert.equal(lane.counts.curvedTicksTotal, 801);
  assert.equal(lane.counts.saturatedTicks, 40);
  assert.equal(lane.counts.gradedTicks, 761);
  assert.ok(lane.metrics.p90AbsOffsetM < 1);
  assert.equal(lane.verdict, "pass");
});

test("the criteria are cadence-invariant: the same leg at 12.5 Hz gets the same verdicts", () => {
  const a = buildGoodLeg({ hz: 20 });
  const b = buildGoodLeg({ hz: 12.5 });
  near(medianTickPeriodSec(a.rows), 0.05);
  near(medianTickPeriodSec(b.rows), 0.08);
  assert.equal(assessLeg(a).verdict, assessLeg(b).verdict);
  // …and the sample floor is taken from the record, not from a hard-coded rate.
  assert.equal(assessLaneHolding(a.rows, a.declared).counts.sampleFloor, 180);
  assert.equal(assessLaneHolding(b.rows, b.declared).counts.sampleFloor, 113);
  // The cheats stay red at the other cadence too.
  const crawl = mutate(b, 20, 40, () => ({ opposingBank: true, speedKmh: 4.9, laneOffsetM: 0 }));
  assert.equal(assessFlow(crawl.rows, crawl.declared).verdict, "fail");
});

/* ────────────────────────────────────────────────────────────────────────────
 * THE CONSTANTS ARE THE PRODUCT'S, AND THIS IS WHAT PROVES IT.
 *
 * A matcher must report what it cannot read: `readConst` returns null when its
 * pattern misses or matches twice, and every assertion below fails on null
 * rather than skipping. The mutation test underneath drives the same matcher
 * over synthetic sources, because a scanner that is green AND BLIND has been
 * shipped three times in this repo already.
 * ──────────────────────────────────────────────────────────────────────────*/

function readConst(text, pattern) {
  const all = [...text.matchAll(pattern)];
  if (all.length !== 1) return null;
  return all[0][1];
}

const PATTERNS = {
  movingSpeedKmh: /^[ \t]*movingSpeedKmh:[ \t]*([0-9.]+),/gm,
  solidLineCrossSustainSec: /^[ \t]*solidLineCrossSustainSec:[ \t]*([0-9.]+),/gm,
  laneKeepSustainSec: /^[ \t]*laneKeepSustainSec:[ \t]*([0-9.]+),/gm,
  laneKeepMaxOffsetM: /^[ \t]*laneKeepMaxOffsetM:[ \t]*([0-9.]+) \* PERCEPTUAL_ROAD_SCALE,/gm,
  // THE THREE ONE-WAY NUMBERS. Before this revision a grep for all three
  // returned NOTHING in road-criteria.mjs, while AC-FLOW applied
  // CROSSED_SOLID_LINE's two-way clock to the one-way surface.
  wrongWaySustainSec: /^[ \t]*wrongWaySustainSec:[ \t]*([0-9.]+),/gm,
  speedingRearmSec: /^[ \t]*speedingRearmSec:[ \t]*([0-9.]+),/gm,
  wrongWayRearmSec: /^const WRONG_WAY_REARM_SEC = ([0-9.]+);/gm,
  wrongWayEntryTravelM: /^const WRONG_WAY_ENTRY_TRAVEL_M = ([0-9.]+);/gm,
  // THE FOURTH ONE-WAY NUMBER, and the newest (R18). It is the threshold the
  // one-way DISCRIMINATOR applies to the founder-ruled signed angle, so a
  // harness that drifted from it would not merely report a different number —
  // it would disagree with the engine about what «against the flow» MEANS,
  // while still looking like it was reading the product's own signal.
  wrongWayAngleDeg: /^export const WRONG_WAY_ANGLE_DEG = ([0-9.]+);/gm,
};

test("PRODUCT mirrors platform/src, and the matcher proves it can miss", () => {
  const types = readFileSync(join(SRC, "rules", "types.ts"), "utf8");
  const moving = readConst(types, PATTERNS.movingSpeedKmh);
  assert.equal(moving, "5", "rules/types.ts movingSpeedKmh");
  assert.equal(Number(moving), PRODUCT.MOVING_SPEED_KMH);

  const solid = readConst(types, PATTERNS.solidLineCrossSustainSec);
  assert.equal(Number(solid), PRODUCT.SOLID_LINE_CROSS_SUSTAIN_SEC);

  const sustain = readConst(types, PATTERNS.laneKeepSustainSec);
  assert.equal(Number(sustain), PRODUCT.LANE_KEEP_SUSTAIN_SEC);

  const laneKeepMul = readConst(types, PATTERNS.laneKeepMaxOffsetM);
  assert.equal(laneKeepMul, "1.3");

  // THE ONE-WAY SURFACE'S OWN NUMBERS, all three, from the product.
  const wrongWaySustain = readConst(types, PATTERNS.wrongWaySustainSec);
  assert.equal(Number(wrongWaySustain), PRODUCT.WRONG_WAY_SUSTAIN_SEC, "rules/types.ts wrongWaySustainSec");
  const speedingRearm = readConst(types, PATTERNS.speedingRearmSec);
  assert.equal(Number(speedingRearm), PRODUCT.SPEEDING_REARM_SEC, "rules/types.ts speedingRearmSec");

  const engineSrc = readFileSync(join(SRC, "rules", "engine.ts"), "utf8");
  const wrongWayRearm = readConst(engineSrc, PATTERNS.wrongWayRearmSec);
  assert.equal(Number(wrongWayRearm), PRODUCT.WRONG_WAY_REARM_SEC, "engine.ts WRONG_WAY_REARM_SEC");
  const entryTravel = readConst(engineSrc, PATTERNS.wrongWayEntryTravelM);
  assert.equal(Number(entryTravel), PRODUCT.WRONG_WAY_ENTRY_TRAVEL_M, "engine.ts WRONG_WAY_ENTRY_TRAVEL_M");

  // THE ANGLE THE ONE-WAY DISCRIMINATOR APPLIES (R18). Read the same way as
  // every other mirrored constant: out of platform/src, by a matcher that
  // returns null rather than a wrong number when it cannot read the file.
  const worldRuntime = readFileSync(join(SRC, "runtime", "worldRuntime.ts"), "utf8");
  const angle = readConst(worldRuntime, PATTERNS.wrongWayAngleDeg);
  assert.equal(angle, "120", "worldRuntime.ts WRONG_WAY_ANGLE_DEG");
  assert.equal(Number(angle), PRODUCT.WRONG_WAY_ANGLE_DEG);
  // …AND THE PRODUCT STILL APPLIES IT THE WAY THE DISCRIMINATOR ASSUMES:
  // strictly greater, on the ABSOLUTE signed delta. A criterion that mirrored
  // the number while the product changed the comparison would drift silently.
  assert.ok(
    /Math\.abs\(signedDeltaDeg\([^)]*\)\) > WRONG_WAY_ANGLE_DEG/.test(worldRuntime),
    "worldRuntime.ts reduces the signed angle with `Math.abs(...) > WRONG_WAY_ANGLE_DEG`",
  );
  // The derivation in §THE PER-SURFACE CLOCKS rests on these two being the SAME
  // figure — engine.ts:1258-1259 says WRONG_WAY_REARM_SEC borrows it "for the
  // same idea", and if the product ever splits them the ceiling must be re-read.
  assert.equal(
    Number(wrongWayRearm),
    Number(speedingRearm),
    "WRONG_WAY_REARM_SEC borrows speedingRearmSec's figure; the fraction ceiling assumes it",
  );
  // CROSSED_SOLID_LINE is TWO-WAY ONLY, which is why its clock may not be
  // applied to a ring. Asserted from the source, not from memory.
  assert.ok(
    /const solidCrossCond =\s*\n\s*tick\.solidCenterLine === true &&\s*\n\s*tick\.oneway === false &&/.test(engineSrc),
    "engine.ts solidCrossCond is gated `tick.oneway === false`",
  );

  const contracts = readFileSync(join(SRC, "contracts.ts"), "utf8");
  const scale = readConst(contracts, /^export const PERCEPTUAL_ROAD_SCALE = ([0-9.]+);/gm);
  assert.equal(Number(scale), PRODUCT.PERCEPTUAL_ROAD_SCALE);
  assert.equal(Number(laneKeepMul) * Number(scale), PRODUCT.LANE_KEEP_MAX_OFFSET_M);

  const spatial = readFileSync(join(SRC, "runtime", "spatial.ts"), "utf8");
  const laneWidthMul = readConst(
    spatial,
    /^export const LANE_WIDTH_M = ([0-9.]+) \* PERCEPTUAL_ROAD_SCALE;/gm,
  );
  assert.equal(Number(laneWidthMul) * Number(scale), PRODUCT.LANE_WIDTH_M);

  const locator = readFileSync(join(SRC, "runtime", "locator.ts"), "utf8");
  const deadband = readConst(locator, /^const LANE_SWITCH_DEADBAND_M = ([0-9.]+);/gm);
  assert.equal(Number(deadband), PRODUCT.LANE_SWITCH_DEADBAND_M);

  const tuning = readFileSync(join(SRC, "vehicle", "tuning.ts"), "utf8");
  const halfWidth = readConst(
    tuning,
    /^export const CHASSIS_HALF_EXTENTS = \{ x: ([0-9.]+),/gm,
  );
  assert.equal(Number(halfWidth), PRODUCT.CHASSIS_HALF_WIDTH_M);
  assert.equal(
    PRODUCT.LANE_KEEP_MAX_OFFSET_M - Number(halfWidth),
    LANE_HOLD_P90_CEILING_M,
    "the 2.40 m ceiling is derived, not chosen",
  );
});

test("the engine's two predicates are copied by reference, and still say what they said", () => {
  const engine = readFileSync(join(SRC, "rules", "engine.ts"), "utf8");
  const forward = readConst(engine, /^[ \t]*const forwardGear = (tick\.gear >= 0);/gm);
  assert.equal(forward, "tick.gear >= 0", "engine.ts forwardGear — `gear >= 1` is the obvious guess and is wrong");
  const moving = readConst(engine, /^[ \t]*const moving = (speed > cfg\.movingSpeedKmh);/gm);
  assert.equal(moving, "speed > cfg.movingSpeedKmh");
  // POOR_LANE_KEEPING's own gates, which is why AC-LANE carries them and AC-FLOW does not.
  assert.ok(/offCentre &&\s*\n\s*moving &&\s*\n\s*forwardGear &&/.test(engine));
  // The paint idiom that killed draft 1.
  assert.ok(/const laneLinesPainted = tick\.laneLinesPainted !== false;/.test(engine));
});

test("the matcher reports what it cannot read (mutation test on synthetic sources)", () => {
  assert.equal(readConst("  movingSpeedKmh: 7,\n", PATTERNS.movingSpeedKmh), "7");
  // absent -> null, never a stale pass
  assert.equal(readConst("nothing here\n", PATTERNS.movingSpeedKmh), null);
  // a jsdoc line mentioning the name must not be mistaken for the definition
  assert.equal(readConst("   * movingSpeedKmh: 5,\n", PATTERNS.movingSpeedKmh), null);
  // a type declaration carries no value and must not match
  assert.equal(readConst("  movingSpeedKmh: number;\n", PATTERNS.movingSpeedKmh), null);
  // two definitions -> null, because "which one is live" is not a question a
  // regex may answer by taking the first
  assert.equal(
    readConst("  movingSpeedKmh: 5,\n  movingSpeedKmh: 9,\n", PATTERNS.movingSpeedKmh),
    null,
  );

  // THE SAME FOUR WAYS TO MISS, ON THE NEW PATTERN (R18). It reads a top-level
  // `export const`, and the name appears in worldRuntime.ts in a docblock, in
  // the comparison that uses it, and in an import in the invariant test — every
  // one of which a looser regex would swallow.
  assert.equal(
    readConst("export const WRONG_WAY_ANGLE_DEG = 120;\n", PATTERNS.wrongWayAngleDeg),
    "120",
  );
  assert.equal(readConst("nothing here\n", PATTERNS.wrongWayAngleDeg), null);
  assert.equal(
    readConst(" * a docblock naming WRONG_WAY_ANGLE_DEG = 120;\n", PATTERNS.wrongWayAngleDeg),
    null,
    "a docblock mention is not the definition",
  );
  assert.equal(
    readConst("  return x > WRONG_WAY_ANGLE_DEG;\n", PATTERNS.wrongWayAngleDeg),
    null,
    "a USE is not the definition",
  );
  assert.equal(
    readConst(
      "export const WRONG_WAY_ANGLE_DEG = 120;\nexport const WRONG_WAY_ANGLE_DEG = 90;\n",
      PATTERNS.wrongWayAngleDeg,
    ),
    null,
    "two definitions is not a question a regex may answer by taking the first",
  );
});

/* ────────────────────────────────────────────────────────────────────────────
 * R20's TWO UNCOVERED EDGES — added 2026-09-24 after an adversarial verifier
 * showed the battery could not tell these apart.
 * ──────────────────────────────────────────────────────────────────────────*/

test("R20: the travel predicate is pinned BETWEEN its two named alternatives, not only at them", () => {
  // THE GAP THIS CLOSES. `travellingBackwards` is `speedKmh > 0`, and the
  // battery pinned it only at the two thresholds anyone had ARGUED about: 0
  // (mutation `>= 0`) and 5 (mutation `engineMoving`, the product's own moving
  // line). Every threshold strictly between them — 0.5, 2.5, 4.9 — survived the
  // whole suite, because no fixture ever reversed slower than the engine's
  // grading speed. A car creeping backwards at 2 км/ч the wrong way down a
  // one-way street is the manoeuvre this instrument exists for, so the
  // predicate is pinned across that whole band.
  assert.equal(travellingBackwards({ gear: -1, speedKmh: 0 }), false, "stopped is not travelling");
  for (const kmh of [0.1, 0.5, 2, 2.5, 4.9, 5, 9]) {
    assert.equal(
      travellingBackwards({ gear: -1, speedKmh: kmh }),
      true,
      `${kmh} км/ч in reverse IS travelling backwards — the engine's 5 км/ч grading line is not this question`,
    );
  }
  // OUT OF CONTRACT IS UNKNOWN, NEVER A VERDICT. `SimTick.speedKmh` is unsigned
  // by its own contract, so a negative value is a record this file cannot read.
  // It answered a definite `false` for one revision, which acquitted a wrong-way
  // reverse AND let the leg testify.
  assert.equal(travellingBackwards({ gear: -1, speedKmh: -3 }), null, "a negative speed is unreadable");
  assert.equal(travellingBackwards({ gear: -1, speedKmh: Number.NaN }), null);
  assert.equal(travellingBackwards({ gear: 1, speedKmh: 30 }), false, "a forward gear is never backwards");
});

test("R20: the rotation is 180 DEGREES, and the angle that proves it is not the one anybody reaches for", () => {
  // THE GAP THIS CLOSES. A 170° rotation survived the entire battery. The two
  // angles every fixture uses cannot see it: a nose along the edge (0°) rotates
  // to 180° or 170°, and both convict; a nose against it (±178.5°) rotates to
  // ≈0° or ≈10°, and both acquit. The rotation's MAGNITUDE only shows up where
  // the rotated angle crosses the product's 120° threshold, which is a nose at
  // −55°: 180 − 55 = 125 CONVICTS, 170 − 55 = 115 ACQUITS.
  //
  // It executes the module's own `assessFlow`, deliberately NOT a local restatement
  // of `norm` and the threshold — the disclosed L10 exhaustion proof restates
  // both, which is exactly why it cannot catch a change to either.
  const leg = buildRingLeg();
  const rows = leg.rows.map((r) =>
    r.alignDeg === undefined ? r : { ...r, gear: -1, speedKmh: 6, alignDeg: -55, wrongWay: false },
  );
  const ring = assessFlow(rows, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.ok(ring.counts.denominator > 500, "the ring is populated");
  assert.equal(
    ring.counts.againstFlowTicks,
    ring.counts.denominator,
    "backing at 55° off the edge travels at 125°, which is past the product's 120° line",
  );
  assert.equal(ring.verdict, "fail", ring.reasons.join("\n"));

  // …and one degree the other side of the line still acquits, so the assertion
  // above is about the THRESHOLD and not about reverse gear in general.
  const inside = leg.rows.map((r) =>
    r.alignDeg === undefined ? r : { ...r, gear: -1, speedKmh: 6, alignDeg: -61, wrongWay: false },
  );
  const insideRing = assessFlow(inside, leg.declared).surfaces[SURFACE.ONE_WAY];
  assert.equal(insideRing.counts.againstFlowTicks, 0, "backing at 61° off travels at 119° — inside the line");
});
