/**
 * reverse-plan.test.mjs — the reverse control law, and the refusals that keep
 * a leg it could not drive from reading as a lesson that cannot be parked.
 *
 * Run: node --test tools/mobile/__tests__/reverse-plan.test.mjs
 *
 * EVERY ASSERTION IN THIS FILE HAS BEEN WATCHED TO FAIL, and the mutation that
 * reddens it is named beside it. That is this programme's rule; the assertions
 * that matter most here are the ones about SIGN and about BLINDNESS, because
 * both have a wrong answer that looks like a working drive:
 *
 *   · a mirrored steering sign digs confidently away from the bay, and every
 *     number the leg publishes stays small and plausible;
 *   · a controller that cannot see and reports 0° of error certifies itself as
 *     the best-aimed drive in the sweep.
 *
 * The neighbouring guidance.test.mjs was written after this project paid for
 * the second one. This file is the same lesson, applied to the wheel while the
 * car is going backwards.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  advanceAlong,
  buildReversePlan,
  checkSteerSign,
  createSignAudit,
  foldSignAudit,
  lookaheadPoint,
  median,
  pathTurnRad,
  reverseCommand,
  reverseSteerLine,
  REVERSE_TUNE,
  steerForBearingError,
  tapeToProbe,
  wrapRad,
} from "../lib/reverse-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const DEG = Math.PI / 180;

/** A straight reverse path running -z, i.e. tape +y, from (0,0). */
const straight = (n = 10, step = 1) =>
  Array.from({ length: n }, (_, i) => ({ x: 0, z: -i * step }));

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 THE FRAME — the flip that would have mirrored every decision
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§1 the tape frame maps onto the pose probe's frame", () => {
  it("flips y into z, which is what the live probe measured", () => {
    // MEASURED 2026-09-12 against next dev on :3000: sc-park-wall's tape
    // sample 0 is (4.06, -105) and __camProbe at spawn read
    // (chassisX 4.06, chassisZ +104.997).
    // MUTATION WATCHED: drop the minus in `tapeToProbe` -> z comes back -105
    // and this goes red. That mutation is the whole bug this test exists for:
    // it mirrors the path about the x axis and the car reverses away from the
    // bay while every error number stays small.
    assert.deepEqual(tapeToProbe({ x: 4.06, y: -105 }), { x: 4.06, z: 105 });
    assert.deepEqual(tapeToProbe({ x: 5.03, y: 5.4 }), { x: 5.03, z: -5.4 });
  });

  it("agrees with the real sc-park-wall tape and the real bay", () => {
    // Not a synthetic fixture: the committed content, and the bay coordinates
    // the objective actually grades against (LOT_WALL_BAY x 5.03 y 5.4).
    // MUTATION WATCHED: change the expected x to 5.5 -> red.
    const tape = JSON.parse(
      readFileSync(resolve(REPO, "content", "traces", "sc-park-wall", "shadow-correct.trace.json"), "utf8"),
    );
    const plan = buildReversePlan(tape);
    assert.equal(plan.legs.length, 1, "sc-park-wall's demonstration has exactly one reverse leg");
    const end = plan.legs[0].end;
    assert.ok(Math.abs(end.x - 5.03) < 0.2, `authored reverse ends at x=${end.x}, the bay is at x=5.03`);
    assert.ok(Math.abs(end.z - -5.4) < 0.2, `authored reverse ends at z=${end.z}, the bay is at z=-5.4`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 THE SIGN — one function, because one wrong bit ruins the whole leg
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§2 steerForBearingError inverts between forward and reverse", () => {
  it("reversing: a bearing that must INCREASE is a LEFT wheel", () => {
    // MEASURED + bicycle model, see §2 of reverse-plan.mjs.
    // MUTATION WATCHED: flip `leftIncreases` to `reversing !== true` -> red.
    assert.equal(steerForBearingError(+30 * DEG, { reversing: true }), "left");
    assert.equal(steerForBearingError(-30 * DEG, { reversing: true }), "right");
  });

  it("forward: the same error takes the OPPOSITE wheel", () => {
    // The inversion is the point. MUTATION WATCHED: make the function ignore
    // `reversing` (always treat as reverse) -> these two go red while the pair
    // above stay green, which is exactly the asymmetry that catches it.
    assert.equal(steerForBearingError(+30 * DEG, { reversing: false }), "right");
    assert.equal(steerForBearingError(-30 * DEG, { reversing: false }), "left");
  });

  it("holds the wheel still inside the deadband", () => {
    // MUTATION WATCHED: delete the deadband clause -> returns "left" and red.
    assert.equal(steerForBearingError(2 * DEG, { reversing: true }), null);
    assert.equal(steerForBearingError(-2 * DEG, { reversing: true }), null);
    // …and the deadband is a band, not a floor on everything.
    assert.equal(steerForBearingError(7 * DEG, { reversing: true }), "left");
  });

  it("a non-finite error commands nothing at all", () => {
    // MUTATION WATCHED: drop the isFinite guard -> NaN > 0 is false, so it
    // silently returns "right" and the car steers on a reading that does not
    // exist. Red here.
    assert.equal(steerForBearingError(NaN, { reversing: true }), null);
    assert.equal(steerForBearingError(undefined, { reversing: true }), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 THE PLAN
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§3 buildReversePlan cuts the reverse legs out of an authored tape", () => {
  const tape = (gears) => ({
    samples: gears.map((g, i) => ({ tSec: i * 0.5, x: 0, y: i * 0.8, gear: g })),
  });

  it("finds a contiguous run of gear -1 and ignores the forward samples", () => {
    // MUTATION WATCHED: change `s?.gear === -1` to `s?.gear !== 1` -> the
    // neutral/zero samples join the leg and the length assertion goes red.
    const plan = buildReversePlan(tape([1, 1, -1, -1, -1, -1, 1, 1]));
    assert.equal(plan.legs.length, 1);
    assert.equal(plan.legs[0].waypoints.length, 4);
    assert.equal(plan.why, null);
  });

  it("keeps two separate reverse legs separate", () => {
    // sc-park-bay-exit-rev's shape: reverse out, drive off. A single merged
    // leg would draw a straight line across the middle of the lot.
    // MUTATION WATCHED: never reset `cur` on a forward sample -> 1 leg, red.
    const plan = buildReversePlan(tape([-1, -1, -1, 1, 1, 1, -1, -1, -1]));
    assert.equal(plan.legs.length, 2);
  });

  it("REFUSES a tape with no reverse in it, and says so", () => {
    // The anti-neutralisation case: a lesson that demands reverse whose
    // demonstration has none must produce a REASON the drive can print, not an
    // empty path the controller treats as "nothing to do".
    // MUTATION WATCHED: return `why: null` unconditionally -> red.
    const plan = buildReversePlan(tape([1, 1, 1, 1]));
    assert.equal(plan.legs.length, 0);
    assert.match(plan.why, /never selects R/);
  });

  it("REFUSES a two-sample flicker into R", () => {
    // MUTATION WATCHED: drop the `length < minLegM` discard -> a 0.8 m
    // twitch becomes a "manoeuvre" with no direction in it. Red.
    const plan = buildReversePlan(tape([1, -1, -1, 1]));
    assert.equal(plan.legs.length, 0);
    assert.match(plan.why, /shorter than/);
  });

  it("refuses a malformed tape instead of throwing at the drive", () => {
    // MUTATION WATCHED: remove the `samples` guard -> TypeError, which reaches
    // the crash guard and kills a LESSON lane over a missing content file.
    assert.equal(buildReversePlan(null).legs.length, 0);
    assert.match(buildReversePlan({}).why, /no `samples`/);
  });

  it("pathTurnRad accumulates across the ±PI branch cut", () => {
    // A PATH THAT CROSSES THE CUT. Sampled round most of a circle, consecutive
    // bearings differ by a few degrees everywhere — except at atan2's
    // discontinuity, where a raw subtraction reads ~-360° instead of ~0°.
    // The real sc-park-wall path happens not to cross it, so the assertion
    // below on real content does NOT catch this; measured, the unwrapped
    // mutation survived until this case was added.
    // MUTATION WATCHED: drop `wrapRad` in pathTurnRad -> off by ~360°, red.
    const circle = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i * 10 * Math.PI) / 180;
      circle.push({ x: Math.cos(a), z: Math.sin(a) });
    }
    const deg = (pathTurnRad(circle) * 180) / Math.PI;
    assert.ok(Math.abs(deg - 350) < 15, `a full circle turned ${deg.toFixed(1)}°, expected ~350`);
  });

  it("measures the turn of the real sc-park-wall reverse as a ~90° swing", () => {
    // The authored heading runs 0 -> 270, which is a wrapped -90, and the
    // plan must agree with the geometry rather than with the raw field.
    // MUTATION WATCHED: drop the `wrapRad` in pathTurnRad -> the sum jumps by
    // a whole turn and this goes red.
    const tapeReal = JSON.parse(
      readFileSync(resolve(REPO, "content", "traces", "sc-park-wall", "shadow-correct.trace.json"), "utf8"),
    );
    const leg = buildReversePlan(tapeReal).legs[0];
    assert.ok(Math.abs(Math.abs(leg.turnDeg) - 90) < 25, `turn measured ${leg.turnDeg}°, expected ~±90`);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 PROGRESS — a path that doubles back must not be chased backwards
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§4 advanceAlong only walks forward", () => {
  it("advances to the nearest waypoint ahead", () => {
    // MUTATION WATCHED: start the loop at 0 instead of `from` -> the U-turn
    // test below goes red.
    const wp = straight(10);
    assert.equal(advanceAlong(wp, { x: 0, z: -3.1 }, 0).index, 3);
  });

  it("allows a SMALL step back, for a noisy pose reading", () => {
    // The tick is ~2 s on this box and the pose jitters; one index of slack is
    // deliberate. MUTATION WATCHED: delete the whole backward loop -> index
    // stays 3, red.
    const wp = [
      { x: 0, z: 0 },
      { x: 0, z: -0.3 },
      { x: 0, z: -0.6 },
      { x: 0, z: -0.9 },
      { x: 0, z: -1.2 },
    ];
    assert.equal(advanceAlong(wp, { x: 0, z: -0.55 }, 3).index, 2);
  });

  it("REFUSES a large step back, even when that waypoint is nearer", () => {
    // A REVERSE PARK DOUBLES BACK, so the nearest waypoint to a car mid-swing
    // is often one it passed. Here waypoint 2 is 0.1 m away and waypoint 3 —
    // the one the car is working on — is 0.9 m away, but the step between
    // them is 1.0 m, well over `maxSnapBackM`.
    // MUTATION WATCHED: drop the `dist(...) <= tune.maxSnapBackM` clause ->
    // index 2, red. Without it a controller re-targets ground it has covered
    // and drives the manoeuvre in a circle while reporting a small error.
    const wp = [
      { x: 0, z: 0 },
      { x: 0, z: -1 },
      { x: 0, z: -2 },
      { x: 1, z: -2 },
      { x: 2, z: -2 },
    ];
    const got = advanceAlong(wp, { x: 0.1, z: -2 }, 3);
    assert.equal(got.index, 3, "the 1.0 m step back is refused");
    assert.ok(got.offPathM > 0.8, `offPathM was ${got.offPathM} — it must report the real distance to wp3`);
  });

  it("REFUSES to jump forward across a path that doubles back on itself", () => {
    // The other half of the same failure. The car is at the start of a path
    // whose FAR END passes within 0.2 m of it. An unwindowed nearest-point
    // search picks the far end, the controller declares the manoeuvre nearly
    // finished and the leg stops before reversing.
    // MUTATION WATCHED: remove the `arc > tune.searchAheadM` break -> index
    // jumps to 8, red.
    const wp = [
      { x: 0, z: 0 },
      { x: 0, z: -1 },
      { x: 0, z: -2 },
      { x: 0, z: -3 },
      { x: 0, z: -4 },
      { x: 0.2, z: -4 },
      { x: 0.2, z: -3 },
      { x: 0.2, z: -2 },
      { x: 0.2, z: -1 },
      { x: 0.2, z: 0 },
    ];
    // The car sits BETWEEN the two arms and slightly nearer the returning one:
    // waypoint 9 is 0.071 m away, waypoint 0 is 0.158 m away. Without the
    // window the nearest-point search picks 9.
    const pose = { x: 0.15, z: -0.05 };
    const got = advanceAlong(wp, pose, 0, { ...REVERSE_TUNE, searchAheadM: 3 });
    assert.equal(got.index, 0, "the far end of the path is 9 m along it and must not be selected");
    // Positive control: the fixture really is a trap, i.e. the far end IS the
    // nearest point. A fixture that had stopped being a trap would make the
    // assertion above vacuous — which is exactly what the first version of
    // this test did, and the mutation survived it.
    const wide = advanceAlong(wp, pose, 0, { ...REVERSE_TUNE, searchAheadM: 999 });
    assert.equal(wide.index, 9, "fixture check: unwindowed, the search does jump to the far end");
  });

  it("reports how far off the path the car actually is", () => {
    // MUTATION WATCHED: return a fixed 0 -> red. An off-path number that is
    // always 0 is the "confident zero" this suite exists to refuse.
    const got = advanceAlong(straight(5), { x: 1.5, z: -2 }, 0);
    assert.equal(got.index, 2);
    assert.ok(Math.abs(got.offPathM - 1.5) < 1e-6, `offPathM was ${got.offPathM}`);
  });
});

describe("§4b lookaheadPoint walks the polyline by arc length", () => {
  it("interpolates inside a segment, in BOTH axes", () => {
    // A DIAGONAL PATH ON PURPOSE. On a path with a constant x, a mutation that
    // returns `waypoints[i+1].x` instead of interpolating x is invisible —
    // measured, it survived the first version of this test.
    // MUTATION WATCHED: replace either interpolated axis with the raw next
    // waypoint -> red.
    const diag = [
      { x: 0, z: 0 },
      { x: 3, z: -4 }, // length 5
      { x: 6, z: -8 },
    ];
    const p = lookaheadPoint(diag, 0, 2.5);
    assert.ok(Math.abs(p.x - 1.5) < 1e-9, `x was ${p.x}`);
    assert.ok(Math.abs(p.z - -2) < 1e-9, `z was ${p.z}`);
    assert.equal(p.atEnd, false);
    // …and across a segment boundary.
    const q = lookaheadPoint(diag, 0, 7.5);
    assert.ok(Math.abs(q.x - 4.5) < 1e-9, `x was ${q.x}`);
    assert.ok(Math.abs(q.z - -6) < 1e-9, `z was ${q.z}`);
  });

  it("clamps to the final waypoint and SAYS it is at the end", () => {
    // MUTATION WATCHED: drop `atEnd` -> the drive cannot tell "aiming at the
    // bay" from "aiming past it", red.
    const p = lookaheadPoint(straight(4), 0, 99);
    assert.equal(p.atEnd, true);
    assert.ok(Math.abs(p.z - -3) < 1e-9);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 THE TICK — and the blindness that must never read as zero
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§5 reverseCommand", () => {
  const wp = straight(12);
  // Reversing down -z, so the motion bearing is atan2(-1, 0) = -90°.
  const alongBearing = Math.atan2(-1, 0);

  it("holds the wheel straight when the car is on the path", () => {
    // MUTATION WATCHED: negate `err` -> a steer is commanded on a straight
    // path, red.
    const c = reverseCommand({ pose: { x: 0, z: -2 }, bearingRad: alongBearing, waypoints: wp });
    assert.equal(c.steer, null);
    assert.equal(c.blind, false);
    assert.ok(Math.abs(c.errDeg) < REVERSE_TUNE.deadbandDeg);
  });

  it("steers to rejoin a path the car has drifted off", () => {
    // The car is 2 m to +x of a path running down -z, still pointing down -z.
    // The lookahead point is off to -x, so the motion bearing must rotate from
    // -90° toward -90-something... in probe terms the error is negative, which
    // §2 says is a RIGHT wheel while reversing.
    // MUTATION WATCHED: pass `reversing: false` in reverseCommand -> "left",
    // red. That single word is the mirrored-drive bug.
    const c = reverseCommand({ pose: { x: 2, z: -2 }, bearingRad: alongBearing, waypoints: wp });
    assert.equal(c.blind, false);
    assert.equal(c.steer, "right");
    assert.ok(c.offPathM > 1.9, `offPathM was ${c.offPathM}`);
  });

  it("mirrors that for a drift the other way", () => {
    // MUTATION WATCHED: hard-code "right" -> red.
    const c = reverseCommand({ pose: { x: -2, z: -2 }, bearingRad: alongBearing, waypoints: wp });
    assert.equal(c.steer, "left");
  });

  it("is DONE inside the stop tolerance, and stops the car", () => {
    // MUTATION WATCHED: compare against `>=` the wrong way -> never done, the
    // car reverses through the back of the bay. Red.
    const c = reverseCommand({ pose: { x: 0, z: -11.1 }, bearingRad: alongBearing, waypoints: wp });
    assert.equal(c.done, true);
    assert.equal(c.targetKmh, 0);
  });

  it("crawls near the end and cruises far from it", () => {
    // The objective's box is ±0.5 m and a tick on this box is ~2 s; at cruise
    // that is metres of travel between decisions.
    // MUTATION WATCHED: return `cruiseKmh` unconditionally -> red.
    const near = reverseCommand({ pose: { x: 0, z: -9 }, bearingRad: alongBearing, waypoints: wp });
    const far = reverseCommand({ pose: { x: 0, z: -1 }, bearingRad: alongBearing, waypoints: wp });
    assert.equal(near.targetKmh, REVERSE_TUNE.crawlKmh);
    assert.equal(far.targetKmh, REVERSE_TUNE.cruiseKmh);
  });

  it("A CONTROLLER WITH NO POSE REPORTS BLIND, NOT ZERO", () => {
    // THE ONE THAT MATTERS. A tick that averaged its blindness in as 0° would
    // certify the leg as perfectly aimed.
    // MUTATION WATCHED: return `errDeg: 0` instead of null -> red.
    for (const pose of [null, undefined, { x: NaN, z: 0 }, {}]) {
      const c = reverseCommand({ pose, bearingRad: alongBearing, waypoints: wp });
      assert.equal(c.blind, true, `pose ${JSON.stringify(pose)} should be blind`);
      assert.equal(c.steer, null);
      assert.equal(c.errDeg, null, "a blind tick may not publish an error number");
      assert.match(c.why, /pose probe|reference path/);
    }
  });

  it("a car that has not moved yet is blind, and creeps rather than steering", () => {
    // The bearing is undefined until there is motion. It must NOT be guessed:
    // the car is allowed to move (that is how the bearing is learned) but the
    // wheel is left alone and the tick says why.
    // MUTATION WATCHED: default bearingRad to 0 -> steer is commanded off a
    // fabricated heading, red.
    const c = reverseCommand({ pose: { x: 0, z: -2 }, bearingRad: null, waypoints: wp });
    assert.equal(c.blind, true);
    assert.equal(c.steer, null);
    assert.equal(c.errDeg, null);
    assert.ok(c.targetKmh > 0, "it may creep to learn the bearing");
  });

  it("no path at all is blind and commands no motion either", () => {
    // MUTATION WATCHED: return targetKmh cruise here -> the car reverses at
    // speed with no reference. Red.
    const c = reverseCommand({ pose: { x: 0, z: 0 }, bearingRad: alongBearing, waypoints: [] });
    assert.equal(c.blind, true);
    assert.equal(c.targetKmh, 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 THE WRONG-WAY CHECK
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§6 checkSteerSign audits §2 against the world", () => {
  it("agrees when a left wheel increased the bearing while reversing", () => {
    // MUTATION WATCHED: flip `expectIncrease` -> "contradicts", red.
    assert.equal(checkSteerSign({ dir: "left", travelledM: 3, bearingDeltaDeg: 20 }).verdict, "agrees");
    assert.equal(checkSteerSign({ dir: "right", travelledM: 3, bearingDeltaDeg: -20 }).verdict, "agrees");
  });

  it("CONTRADICTS when the world turned the other way, and blames the harness", () => {
    // The sentence matters as much as the verdict: this must read as the
    // instrument being wrong, never as the lesson being unparkable.
    // MUTATION WATCHED: soften the message to "the car did not turn" -> red.
    const got = checkSteerSign({ dir: "left", travelledM: 3, bearingDeltaDeg: -20 });
    assert.equal(got.verdict, "contradicts");
    assert.match(got.why, /mirrored/);
    assert.match(got.why, /this harness steers by/);
  });

  it("is UNDETERMINED on too little travel or too little rotation", () => {
    // Undetermined is an answer. MUTATION WATCHED: return "agrees" when the
    // rotation is below the floor -> a straight line certifies the sign, red.
    assert.equal(checkSteerSign({ dir: "left", travelledM: 0.2, bearingDeltaDeg: 20 }).verdict, "undetermined");
    assert.equal(checkSteerSign({ dir: "left", travelledM: 3, bearingDeltaDeg: 1 }).verdict, "undetermined");
    assert.equal(checkSteerSign({ dir: null, travelledM: 3, bearingDeltaDeg: 20 }).verdict, "undetermined");
  });
});

describe("§6b foldSignAudit — the state machine, including the cases that hid a dead check", () => {
  const run = (steps) => {
    let st = createSignAudit();
    const verdicts = [];
    for (const s of steps) {
      const out = foldSignAudit(st, s);
      st = out.state;
      if (out.verdict) verdicts.push(out.verdict);
    }
    return { state: st, verdicts };
  };

  it("ADOPTS THE FIRST BEARING when the hold began before there was one", () => {
    // THE ONE THAT SURVIVED. The wheel is commanded on the first steered tick
    // — before the car has moved the 0.12 m that defines a bearing — so the
    // baseline is null when the hold opens. A version that gave up there
    // reported "undetermined" for the whole drive while looking exactly like
    // one that had checked, and this suite could not tell the difference
    // until the state machine moved out of the drive script and into here.
    // MUTATION WATCHED: `if (s.fromBearingRad === null) return {state:s,
    // verdict:null};` (never adopt) -> no verdict is ever produced, red.
    const { verdicts } = run([
      { dir: "left", bearingRad: null, stepM: 0 }, // hold opens, blind
      { dir: "left", bearingRad: 0, stepM: 0.3 }, // first bearing -> adopted
      { dir: "left", bearingRad: 0.4, stepM: 2.0 }, // +22.9° over 2.0 m
    ]);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].verdict, "agrees");
  });

  it("restarts the ruler when the wheel changes direction", () => {
    // Otherwise a right-hand hold is graded with a left-hand hold's rotation.
    // MUTATION WATCHED: carry `travelledM` across a direction change -> the
    // verdict fires on the first tick of the new hold, red.
    const { state } = run([
      { dir: "left", bearingRad: 0, stepM: 0 },
      { dir: "left", bearingRad: 0.2, stepM: 3 },
      { dir: "right", bearingRad: 0.2, stepM: 0 },
    ]);
    assert.equal(state.dir, "right");
    assert.equal(state.travelledM, 0);
  });

  it("settles ONCE and does not re-open on a later hold", () => {
    // MUTATION WATCHED: drop the `s.settled !== null` short-circuit -> a
    // second verdict appears and the drive prints the loud line twice.
    const { verdicts, state } = run([
      { dir: "left", bearingRad: 0, stepM: 0 },
      { dir: "left", bearingRad: 0.4, stepM: 2 },
      { dir: "right", bearingRad: 0.4, stepM: 0 },
      { dir: "right", bearingRad: 0.0, stepM: 2 },
    ]);
    assert.equal(verdicts.length, 1);
    assert.ok(state.settled);
  });

  it("CONTRADICTS when the world turns the other way, and reports it once", () => {
    // MUTATION WATCHED: swap the sign in checkSteerSign -> "agrees", red.
    //
    // stepM 2 -> 3 on 2026-09-13. A conviction voids the leg, so it now needs
    // SIGN_CONVICT_AFTER_M (2.5 m) and SIGN_CONVICT_MIN_DEG (10 deg); 2 m no
    // longer carries one. The claim is unchanged — a wrong-way bearing under a
    // held wheel is still a conviction — only the sample is now one that can
    // support it. -0.4 rad is -22.9 deg, well clear of the 10 deg bar.
    const { verdicts } = run([
      { dir: "left", bearingRad: 0, stepM: 0 },
      { dir: "left", bearingRad: -0.4, stepM: 3 },
    ]);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0].verdict, "contradicts");
  });

  it("A CONVICTION NEEDS A SAMPLE THAT CAN CARRY IT — the noise band acquits nobody and convicts nobody", () => {
    // THE DEFECT THIS CLOSES, measured over w41+w42's recorded reverse holds:
    // `settled` is sticky, so the FIRST hold to clear the floors decides the
    // whole leg. Six of the eight live convictions settled under 2.0 m travelled
    // and four on a bearing delta of 4.1-7.3 deg against a 4.0 deg floor — while
    // all nineteen acquittals settled at 2.43 m or more. Eight lanes across two
    // sweeps were voided by that, printing «the wheel was mirrored for the whole
    // manoeuvre» about a convention that agrees 82% of the time.
    //
    // Under the bar the verdict is UNDETERMINED, not "contradicts", so the audit
    // does not settle and later, longer holds still get to speak.

    // too short: wrong way, 22.9 deg, but only 1.8 m
    const short = run([
      { dir: "left", bearingRad: 0, stepM: 0 },
      { dir: "left", bearingRad: -0.4, stepM: 1.8 },
    ]);
    assert.equal(short.verdicts.length, 0, "1.8 m must not convict — six of eight real ones settled under 2.0 m");

    // far enough, but the bearing barely moved: 5.7 deg
    const smallDelta = run([
      { dir: "left", bearingRad: 0, stepM: 0 },
      { dir: "left", bearingRad: -0.1, stepM: 4 },
    ]);
    assert.equal(smallDelta.verdicts.length, 0, "5.7 deg must not convict — four of eight real ones settled on 4.1-7.3 deg");

    // AND THE ACQUITTAL KEEPS ITS ORIGINAL FLOORS. Raising the bar on the
    // harmless verdict would be the reassuring-direction change: it is the
    // conviction that destroys evidence, so it is the conviction that must be sure.
    const agrees = run([
      { dir: "left", bearingRad: 0, stepM: 0 },
      { dir: "left", bearingRad: 0.12, stepM: 1.6 },
    ]);
    assert.equal(agrees.verdicts.length, 1, "an acquittal at 1.6 m / 6.9 deg must still settle");
    assert.equal(agrees.verdicts[0].verdict, "agrees");
  });

  it("never settles while the wheel is straight or the bearing unknown", () => {
    // Holding nothing proves nothing.
    //
    // WHERE THIS IS ENFORCED, stated because a reader should not have to
    // guess: `foldSignAudit` short-circuits on `dir === null`, but that line
    // is DEFENCE IN DEPTH — deleting it leaves this test green, measured.
    // The refusal that actually holds is `checkSteerSign`'s own ("the wheel
    // was not held"), which §6 mutation-tests directly. This is therefore a
    // BEHAVIOUR test on the pair, not a line test on the short-circuit, and
    // it is kept because the behaviour is what a drive depends on.
    // MUTATION WATCHED: remove the dir guard from checkSteerSign -> red.
    const { verdicts } = run([
      { dir: null, bearingRad: 0, stepM: 3 },
      { dir: null, bearingRad: 1.5, stepM: 3 },
      { dir: "left", bearingRad: null, stepM: 3 },
    ]);
    assert.equal(verdicts.length, 0);
  });

  it("tolerates a missing prior state", () => {
    // MUTATION WATCHED: drop the `state ?? createSignAudit()` guard ->
    // TypeError inside a drive tick, which reaches the crash guard and kills
    // a lesson lane over a bookkeeping slip. Red.
    assert.doesNotThrow(() => foldSignAudit(undefined, { dir: "left", bearingRad: 0 }));
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 THE DISCLOSURE — the half a judge reads
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("§7 reverseSteerLine blames the right party", () => {
  it("an unplanned leg reads as the HARNESS's failure, explicitly", () => {
    // ANTI-NEUTRALISATION. Getting this backwards is how eleven critical rows
    // spent weeks looking like product defects.
    // MUTATION WATCHED: remove the "not the product's" clause -> red.
    const line = reverseSteerLine({ planned: false, why: "no tape" });
    assert.match(line, /NOT ATTEMPTED/);
    assert.match(line, /THIS HARNESS's result and not the product's/);
    assert.match(line, /no finding about the reversing half/);
  });

  it("a steered leg carries the authored-path caveat every time", () => {
    // The instrument's remit, on the artefact rather than in a comment.
    // MUTATION WATCHED: drop the caveat -> red. Without it a legibility
    // finding could cite a drive that was aimed from a demonstration the
    // student never sees.
    const line = reverseSteerLine({
      planned: true,
      ticks: 12,
      commands: 5,
      offPathMedianM: 0.31,
      blindTicks: 1,
      legLengthM: 9.4,
      turnDeg: -90,
      reachedEnd: true,
      finalToEndM: 0.22,
      sign: { verdict: "agrees", why: "…" },
    });
    assert.match(line, /FOLLOWED the lesson's authored reverse path/);
    assert.match(line, /NOT evidence that a student/);
    assert.match(line, /REACHED the end/);
  });

  it("surfaces a contradicting sign check in the line itself", () => {
    // MUTATION WATCHED: only print the sign when it agrees -> the loudest
    // failure this instrument can have becomes invisible. Red.
    const line = reverseSteerLine({
      planned: true,
      ticks: 12,
      commands: 5,
      offPathMedianM: 4.1,
      blindTicks: 0,
      legLengthM: 9.4,
      turnDeg: -90,
      reachedEnd: false,
      finalToEndM: 7.2,
      sign: { verdict: "contradicts", why: "wheel left moved it -20°" },
    });
    assert.match(line, /SIGN CHECK CONTRADICTS/);
    assert.match(line, /did NOT reach the end/);
  });
});

describe("§8 median refuses to invent a zero", () => {
  it("returns null for an empty sample rather than 0", () => {
    // MUTATION WATCHED: `return 0` for the empty case -> a leg that measured
    // nothing publishes a perfect 0.000 m off-path. Red.
    assert.equal(median([]), null);
    assert.equal(median([Number.NaN]), null);
    assert.equal(median([1, 2, 3]), 2);
  });
});

describe("§9 wrapRad", () => {
  it("wraps into (-PI, PI]", () => {
    // MUTATION WATCHED: use `<` instead of `<=` in the lower bound -> the
    // -PI case loops forever or lands wrong. Red.
    assert.ok(Math.abs(wrapRad(3 * Math.PI) - Math.PI) < 1e-9);
    assert.ok(Math.abs(wrapRad(-3 * Math.PI) - Math.PI) < 1e-9);
    assert.ok(Math.abs(wrapRad(0.5) - 0.5) < 1e-9);
  });
});
