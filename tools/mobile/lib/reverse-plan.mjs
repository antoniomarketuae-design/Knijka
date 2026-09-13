// -----------------------------------------------------------------------------
// reverse-plan.mjs — THE WHEEL, WHILE THE CAR IS GOING BACKWARDS.
//
// Same contract as guidance.mjs and hazard.mjs above it: the control law is
// PURE and lives here, the page side (reading `__camProbe`, pressing the keys)
// lives in lesson-audit.mjs. Nothing in this file touches a browser, so every
// claim it makes can be watched to fail in `node --test`.
//
// ═══ WHY THIS FILE EXISTS ═════════════════════════════════════════════════
//
// Eleven critical rows said some version of «no LEG has ever completed this
// reverse-park lesson», and for weeks they read as product defects. They were
// not. An in-process run of the real production grading chain completes every
// one of them — sc-park-wall's Задача 2 ticks at 43.88 s — and completes them
// at c7e8ca3 too, the commit the sweep was filed from. So the grader was never
// the problem.
//
// THE HARNESS WAS. It gained a reverse GESTURE on 2026-08-21 (`armReverse`), so
// the cluster reads «R» and there is a photograph of it. What it never gained
// was a way to AIM while in R: the reverse phase pressed exactly two channels,
// the functional throttle and the functional brake, and let go of the wheel on
// the way in (`guideLeaveRoll`). A car that reverses in a straight line cannot
// park in a bay, and the product's OWN authored answer says so — read below.
//
//   sc-park-wall/shadow-correct.trace.json, the reverse leg (t=33.1 s → 44.6 s):
//     straight back ~2.5 m, then a 90° swing, ending (4.98, 5.40) heading 270.
//     `LOT_WALL_BAY` is x 5.03, y 5.4, heading 90, and the objective's
//     tolerance is centerTolM 0.5 / headingTolDeg 10.
//
// A straight-line reverse misses that bay by metres, every time, on a product
// that is working. That is the whole of the eleven rows.
//
// ═══ THE TWO CONVENTIONS, MEASURED AND NOT REASONED ABOUT ═════════════════
//
// Both of these were measured live against `next dev` on :3000 with a WebKit
// page, sc-park-wall at level 1, on 2026-09-12. Both would have been guessed
// WRONG, and either one guessed wrong mirrors every steering decision this
// file makes — which is the failure mode where a drive looks like it tried.
//
//  1. THE FRAME IS FLIPPED.  The authored tapes are (x, y); `window.__camProbe`
//     publishes (chassisX, chassisZ). They are NOT the same axis pair:
//
//       tape sc-park-wall sample 0   x =  4.06   y = -105
//       __camProbe at spawn          x =  4.06   z = +104.997
//
//     so `probe.z === -tape.y`, exactly, and `probe.x === tape.x`. `tapeToProbe`
//     is the only place that flip is written down.
//
//  2. THE STEERING SIGN.  Driving FORWARD with the wheel held LEFT (KeyA), the
//     motion bearing `atan2(dz, dx)` measured -319.92° over 17 samples — it
//     DECREASES. (The car drove a full circle at full lock, which is also why
//     the number is a whole turn.)
//
//     The reverse half of that needs no second measurement, because it is a
//     property of a car and not of this product. In the bicycle model
//     `dψ/dt = (v / L)·tan δ`, and `v` is SIGNED. Hold the same wheel, put the
//     car in R, and the heading rotates the OTHER WAY. The motion bearing is
//     `ψ + 180°` while reversing — a constant offset, so it has the same
//     derivative. Hence, in probe space:
//
//       forward:  LEFT -> atan2(dz,dx) decreases   RIGHT -> increases
//       reverse:  LEFT -> atan2(dz,dx) INCREASES   RIGHT -> decreases
//
//     That inversion is the single most dangerous line in this file, so it is
//     `steerForBearingError` — one function, four lines, its own test, and a
//     runtime check in the drive that shouts if the world disagrees with it.
//
// ═══ WHAT THIS INSTRUMENT MAY AND MAY NOT TESTIFY ABOUT ═══════════════════
//
// The reference path is the lesson's OWN authored correct demonstration, read
// from `content/traces/<id>/shadow-correct.trace.json`. That is a deliberate
// choice and it has a cost that must be declared on every leg that uses it:
//
//   IT MAY testify that the product CREDITS a competent reverse park — the
//   physics, the collision model, the rule engine and the grader are all real
//   and untouched, and a drive that follows this path still has to be graded.
//   That is exactly the proposition the eleven rows make.
//
//   IT MAY NOT testify that a STUDENT could find the manoeuvre from what is on
//   the glass. The harness is following a demonstration the student never sees.
//   Any «is this lesson learnable / is the aid legible» claim is a picture
//   claim and this instrument is blind to it, the same way the in-process
//   driver is blind to layout.
//
// The drive prints that qualification on every leg it steers. An instrument
// that quietly widened its own remit is the failure this programme has shipped
// twice, and the reverse leg is not going to be the third.
// -----------------------------------------------------------------------------

/** The tuning, in one object so a drive can print what it drove with. */
export const REVERSE_TUNE = {
  /** How far along the reference path to aim. Bigger = smoother and lazier. */
  lookaheadM: 2.4,
  /** Bearing error below which the wheel is left alone, in degrees. */
  deadbandDeg: 6,
  /** Two poses closer than this do not define a bearing — they define noise. */
  minBearingStepM: 0.12,
  /** Cruise while the end of the path is further away than `crawlWithinM`. */
  cruiseKmh: 4,
  /** …and crawl below it, because the objective's box is ±0.5 m wide. */
  crawlKmh: 2,
  crawlWithinM: 4,
  /** Inside this of the final waypoint the manoeuvre is done and the car holds. */
  stopTolM: 0.45,
  /** Progress may never walk backwards by more than this (see `advanceAlong`). */
  maxSnapBackM: 0.5,
  /** …nor jump forwards by more than this much arc length in one tick. */
  searchAheadM: 6,
  /** The wrong-way check: after this much travel in one held direction, a
   *  bearing that moved the opposite way to the commanded one is reported. */
  signCheckAfterM: 1.5,
  /** …and it needs at least this much rotation to count as "moved" at all. */
  signCheckMinDeg: 4,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * §1 THE FRAME
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A tape sample's world position in `__camProbe`'s axes.
 *
 * MEASURED, see the header: `probe.z = -tape.y`. This is the only place the
 * flip is written, so a future frame change is a one-line edit here and a red
 * test rather than a mirrored drive nobody notices.
 */
export function tapeToProbe(sample) {
  return { x: sample.x, z: -sample.y };
}

/** Wrap to (-PI, PI]. */
export function wrapRad(a) {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

const DEG = 180 / Math.PI;
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

/* ═══════════════════════════════════════════════════════════════════════════
 * §2 THE SIGN — the one inversion, alone, where it can be watched
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Which way to hold the wheel to drive the motion bearing toward the target.
 *
 * `errRad` is `wrap(targetBearing - motionBearing)` in PROBE space, i.e. the
 * rotation the motion vector still has to make. `reversing` selects which of
 * the two measured laws in the header applies. Returns "left", "right", or
 * null for inside the deadband.
 *
 * Everything else in this file is arithmetic that a wrong answer here would
 * carry faithfully into the ditch.
 */
export function steerForBearingError(errRad, { reversing, deadbandDeg = REVERSE_TUNE.deadbandDeg } = {}) {
  if (!Number.isFinite(errRad)) return null;
  if (Math.abs(errRad) * DEG < deadbandDeg) return null;
  // Reverse: LEFT increases atan2(dz,dx). Forward: LEFT decreases it.
  const leftIncreases = reversing === true;
  const wantIncrease = errRad > 0;
  return wantIncrease === leftIncreases ? "left" : "right";
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §3 THE PLAN — cut out of the lesson's own authored answer
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Every contiguous run of `gear === -1` in a tape, as a path in probe space.
 *
 * A lesson can have more than one (sc-park-bay-exit-rev reverses out of a bay
 * at t=0 and then drives away), so they are returned in order and consumed one
 * per entry into the reverse phase.
 *
 * Samples where the car is not actually moving are dropped from the middle of
 * a leg but the FINAL resting pose is kept, because that pose is the thing the
 * objective measures. Legs shorter than `minLegM` are discarded: a two-sample
 * flicker into R is not a manoeuvre, and treating it as one would hand the
 * drive a path with no direction in it.
 */
export function buildReversePlan(tape, { minLegM = 1.0 } = {}) {
  const samples = Array.isArray(tape?.samples) ? tape.samples : null;
  if (samples === null) {
    return { legs: [], why: "the tape has no `samples` array — nothing to follow" };
  }
  const runs = [];
  let cur = null;
  for (const s of samples) {
    if (s?.gear === -1) {
      if (cur === null) cur = [];
      cur.push(s);
    } else if (cur !== null) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur !== null) runs.push(cur);

  const legs = [];
  for (const run of runs) {
    const pts = [];
    for (const s of run) {
      const p = tapeToProbe(s);
      // Thin the path: consecutive duplicates carry no direction.
      if (pts.length === 0 || dist(pts[pts.length - 1], p) >= 0.05) pts.push(p);
    }
    // …and always keep where it came to rest, even if the thinning ate it.
    const rest = tapeToProbe(run[run.length - 1]);
    if (pts.length === 0 || dist(pts[pts.length - 1], rest) > 1e-9) pts.push(rest);
    if (pts.length < 2) continue;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
    if (length < minLegM) continue;
    legs.push({
      waypoints: pts,
      lengthM: Number(length.toFixed(2)),
      end: pts[pts.length - 1],
      startedAtSec: run[0]?.tSec ?? null,
      endedAtSec: run[run.length - 1]?.tSec ?? null,
      /** Total turn along the path, degrees, signed in PROBE space. */
      turnDeg: Number((pathTurnRad(pts) * DEG).toFixed(1)),
    });
  }
  return {
    legs,
    why:
      legs.length > 0
        ? null
        : runs.length === 0
          ? "this lesson's authored demonstration never selects R — it has no reverse leg to follow"
          : `every reverse run in the tape was shorter than ${minLegM} m — none of them is a manoeuvre`,
  };
}

/** Signed total rotation of a polyline, radians, probe space. */
export function pathTurnRad(pts) {
  let total = 0;
  let prev = null;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dz = pts[i].z - pts[i - 1].z;
    if (Math.hypot(dx, dz) < 1e-6) continue;
    const b = Math.atan2(dz, dx);
    if (prev !== null) total += wrapRad(b - prev);
    prev = b;
  }
  return total;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §4 PROGRESS — forward only
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The index of the waypoint the car is currently level with.
 *
 * IT MAY NOT WALK BACKWARDS, and that is not tidiness. A reverse park doubles
 * back on itself in plan view: the nearest waypoint to a car halfway through
 * the swing can easily be one it passed eight metres ago, and a controller that
 * re-targeted it would drive the manoeuvre in a circle and report a small
 * tracking error the whole way round. `maxSnapBackM` allows the small negative
 * correction that a noisy pose reading produces and refuses the large one that
 * means "you are looking at the wrong end of the path".
 */
export function advanceAlong(waypoints, pose, from = 0, tune = REVERSE_TUNE) {
  let best = from;
  let bestD = Infinity;
  // THE FORWARD SEARCH IS WINDOWED, for the same reason the backward one is
  // clamped. On a path that doubles back, the waypoint spatially nearest a car
  // at the START can be one near the END — five metres away along the ground
  // and eight metres away along the path. An unwindowed scan would jump the
  // index straight to it, the controller would declare itself nearly finished,
  // and the leg would stop before it had reversed at all.
  let arc = 0;
  for (let i = from; i < waypoints.length; i++) {
    if (i > from) arc += dist(waypoints[i - 1], waypoints[i]);
    if (arc > tune.searchAheadM) break;
    const d = dist(waypoints[i], pose);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  // A pose that is closer to something BEHIND `from` is allowed to pull the
  // index back only a little; see the note above.
  for (let i = Math.max(0, from - 1); i < from; i++) {
    const d = dist(waypoints[i], pose);
    if (d < bestD - 1e-9 && dist(waypoints[i], waypoints[from]) <= tune.maxSnapBackM) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, offPathM: Number(bestD.toFixed(3)) };
}

/** The point `lookaheadM` further along the path from `index`. */
export function lookaheadPoint(waypoints, index, lookaheadM) {
  let remaining = lookaheadM;
  for (let i = index; i + 1 < waypoints.length; i++) {
    const seg = dist(waypoints[i], waypoints[i + 1]);
    if (seg >= remaining) {
      const t = seg === 0 ? 0 : remaining / seg;
      return {
        x: waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * t,
        z: waypoints[i].z + (waypoints[i + 1].z - waypoints[i].z) * t,
        atEnd: false,
      };
    }
    remaining -= seg;
  }
  return { ...waypoints[waypoints.length - 1], atEnd: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §5 THE CONTROL LAW
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ONE TICK.
 *
 * `pose` and `bearingRad` come off `__camProbe`; `bearingRad` is null until the
 * car has actually moved `minBearingStepM`, which is the honest state and not a
 * zero. A tick with no pose returns `blind: true` and commands NOTHING —
 * a controller that cannot see must not report that it is on course. That rule
 * is guidance.mjs's, learned the expensive way, and it is repeated here.
 */
export function reverseCommand({
  pose,
  bearingRad,
  waypoints,
  index = 0,
  tune = REVERSE_TUNE,
}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return {
      blind: true,
      steer: null,
      targetKmh: 0,
      done: false,
      index,
      errDeg: null,
      offPathM: null,
      why: "there is no reference path for this leg",
    };
  }
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) {
    return {
      blind: true,
      steer: null,
      targetKmh: 0,
      done: false,
      index,
      errDeg: null,
      offPathM: null,
      why: "the pose probe read nothing — the wheel is not being commanded on a guess",
    };
  }

  const { index: at, offPathM } = advanceAlong(waypoints, pose, index, tune);
  const end = waypoints[waypoints.length - 1];
  const toEnd = dist(pose, end);
  if (toEnd <= tune.stopTolM) {
    return {
      blind: false,
      steer: null,
      targetKmh: 0,
      done: true,
      index: at,
      errDeg: 0,
      offPathM,
      toEndM: Number(toEnd.toFixed(2)),
      why: `the car is ${toEnd.toFixed(2)} m from the end of the authored path (tolerance ${tune.stopTolM} m)`,
    };
  }

  const targetKmh = toEnd <= tune.crawlWithinM ? tune.crawlKmh : tune.cruiseKmh;

  if (!Number.isFinite(bearingRad)) {
    // MOVING IS HOW THE BEARING IS LEARNED, so the car is allowed to creep —
    // but the wheel is NOT commanded, and the tick says why rather than
    // reporting a zero error it did not measure.
    return {
      blind: true,
      steer: null,
      targetKmh,
      done: false,
      index: at,
      errDeg: null,
      offPathM,
      toEndM: Number(toEnd.toFixed(2)),
      why: "the car has not moved far enough to define a motion bearing yet",
    };
  }

  const look = lookaheadPoint(waypoints, at, tune.lookaheadM);
  const desired = Math.atan2(look.z - pose.z, look.x - pose.x);
  const err = wrapRad(desired - bearingRad);
  const steer = steerForBearingError(err, { reversing: true, deadbandDeg: tune.deadbandDeg });
  return {
    blind: false,
    steer,
    targetKmh,
    done: false,
    index: at,
    errDeg: Number((err * DEG).toFixed(1)),
    offPathM,
    toEndM: Number(toEnd.toFixed(2)),
    look,
    why: steer === null ? "inside the deadband — holding the wheel where it is" : `aiming ${steer}`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §6 THE WRONG-WAY CHECK — the header's sign law, audited by the world
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Did holding the wheel `dir` actually rotate the motion bearing the way §2
 * says it does?
 *
 * This exists because the sign in §2 is a measurement, and a measurement can
 * go stale — the product could re-hand its axes, or a future camera change
 * could re-sign `chassisZ`. If that happens, EVERY steering decision inverts
 * and the drive digs away from the bay with perfect confidence. The check
 * cannot repair that, and it does not try to: it returns a verdict the drive
 * prints LOUDLY, so the leg is read as an instrument failure rather than as a
 * lesson that cannot be parked.
 *
 * Returns "agrees", "contradicts", or "undetermined" — and undetermined is a
 * real answer, not a gap in one.
 */
/**
 * WHAT IT TAKES TO CONVICT THE WHEEL, as opposed to acquit it.
 *
 * `contradicts` VOIDS THE LEG — lesson-audit.mjs:9104 prints «the wheel was
 * mirrored for the whole manoeuvre» and no reverse finding may be filed off it.
 * `agrees` costs nothing. So the two verdicts must not share an evidential bar,
 * and until 2026-09-13 they did.
 *
 * Measured over every recorded reverse hold of w41+w42, replayed offline through
 * the live controller: all holds agree 50/61 = 82.0%, and at travelled >= 6 m it
 * is 93.5%. The convention is RIGHT. But `settled` is sticky, so the first hold
 * to clear the floors decides the leg — and of the eight live convictions, SIX
 * settled under 2.0 m travelled and four on a bearing delta of 4.1-7.3 deg
 * against a 4.0 deg floor, while all nineteen acquittals settled at >= 2.43 m.
 * Eight lanes across two sweeps were voided on that.
 *
 * These two numbers are the gap the data already shows, not a fit: 2.5 m sits in
 * the empty band between 2.0 and 2.43, and 10 deg is well clear of the 4-7 deg
 * noise floor. Below them the verdict is UNDETERMINED and the audit keeps
 * looking — which is where the 82% lives.
 */
export const SIGN_CONVICT_AFTER_M = 2.5;
export const SIGN_CONVICT_MIN_DEG = 10;

export function checkSteerSign({ dir, travelledM, bearingDeltaDeg, tune = REVERSE_TUNE }) {
  if (dir !== "left" && dir !== "right") return { verdict: "undetermined", why: "the wheel was not held" };
  if (!Number.isFinite(travelledM) || travelledM < tune.signCheckAfterM) {
    return {
      verdict: "undetermined",
      why: `only ${Number.isFinite(travelledM) ? travelledM.toFixed(2) : "?"} m travelled under a held wheel — the floor is ${tune.signCheckAfterM} m`,
    };
  }
  if (!Number.isFinite(bearingDeltaDeg) || Math.abs(bearingDeltaDeg) < tune.signCheckMinDeg) {
    return {
      verdict: "undetermined",
      why: `the bearing moved ${Number.isFinite(bearingDeltaDeg) ? bearingDeltaDeg.toFixed(1) : "?"}° under a held wheel — below the ${tune.signCheckMinDeg}° floor this cannot tell a wrong sign from a straight line`,
    };
  }
  // §2: reversing, LEFT increases the bearing.
  const expectIncrease = dir === "left";
  const didIncrease = bearingDeltaDeg > 0;
  // A CONVICTION NEEDS MORE THAN AN ACQUITTAL, because it destroys the leg.
  // Under the conviction bar we return UNDETERMINED rather than `contradicts`,
  // so `foldSignAudit` does not settle and later, longer holds still get to
  // speak. An acquittal keeps the original floors — raising the bar on the
  // harmless verdict would be the reassuring-direction change.
  if (expectIncrease !== didIncrease) {
    if (travelledM < SIGN_CONVICT_AFTER_M || Math.abs(bearingDeltaDeg) < SIGN_CONVICT_MIN_DEG) {
      return {
        verdict: "undetermined",
        why:
          `the wheel ${dir} moved the bearing ${bearingDeltaDeg.toFixed(1)}° over ` +
          `${travelledM.toFixed(2)} m, which is the WRONG WAY — but a conviction voids this ` +
          `leg's reverse findings and needs ${SIGN_CONVICT_AFTER_M} m and ${SIGN_CONVICT_MIN_DEG}°. ` +
          `Measured on w41+w42, six of eight convictions settled under 2.0 m and four on a ` +
          `4.1-7.3° delta, while every acquittal settled at 2.43 m or more. Still looking.`,
      };
    }
  }
  return expectIncrease === didIncrease
    ? {
        verdict: "agrees",
        why: `wheel ${dir} over ${travelledM.toFixed(2)} m moved the bearing ${bearingDeltaDeg.toFixed(1)}°, the way §2 of reverse-plan.mjs says it should`,
      }
    : {
        verdict: "contradicts",
        why:
          `wheel ${dir} over ${travelledM.toFixed(2)} m moved the motion bearing ${bearingDeltaDeg.toFixed(1)}° — ` +
          `§2 of reverse-plan.mjs says ${dir} should ${expectIncrease ? "INCREASE" : "DECREASE"} it while reversing. ` +
          `The measured convention this harness steers by is wrong for this build, so every reverse steering ` +
          `decision on this leg is mirrored.`,
      };
}

/** The audit's running state. One hold at a time, one verdict per leg. */
export function createSignAudit() {
  return { dir: null, fromBearingRad: null, travelledM: 0, settled: null };
}

/**
 * ONE TICK OF THE WRONG-WAY AUDIT — pure, so the awkward cases can be tested.
 *
 * It lived in the drive script for one iteration and a mutation that made the
 * check STRUCTURALLY UNABLE TO FIRE survived every gate in the repository:
 * the wheel is commanded on the first steered tick, before the car has moved
 * the 0.12 m that defines a bearing, so the baseline was `null` at the start
 * of the hold — and a version that gave up there would report "undetermined"
 * for the rest of the drive while looking exactly like one that had checked.
 * A check that cannot fire is worse than no check, because it reads as one.
 *
 * Returns the new state and, ONCE per leg, the verdict.
 */
export function foldSignAudit(state, { dir, bearingRad, stepM = 0, tune = REVERSE_TUNE }) {
  const prior = state ?? createSignAudit();
  if (dir !== prior.dir) {
    // A NEW HOLD: the ruler starts here, and a settled verdict is not re-opened.
    return {
      state: {
        dir,
        fromBearingRad: Number.isFinite(bearingRad) ? bearingRad : null,
        travelledM: 0,
        settled: prior.settled,
      },
      verdict: null,
    };
  }
  const s = { ...prior };
  if (Number.isFinite(stepM) && stepM > 0) s.travelledM += stepM;
  if (s.settled !== null) return { state: s, verdict: null };
  if (dir === null || !Number.isFinite(bearingRad)) return { state: s, verdict: null };
  if (s.fromBearingRad === null) {
    // The hold began before there was a bearing. Adopt the first one that
    // appears and start the ruler there — see the note above.
    s.fromBearingRad = bearingRad;
    s.travelledM = 0;
    return { state: s, verdict: null };
  }
  const deltaDeg = wrapRad(bearingRad - s.fromBearingRad) * DEG;
  const got = checkSteerSign({ dir, travelledM: s.travelledM, bearingDeltaDeg: deltaDeg, tune });
  if (got.verdict === "undetermined") return { state: s, verdict: null };
  s.settled = got;
  return { state: s, verdict: got };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §7 THE LINE A JUDGE READS
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The one sentence that has to let a reader tell «the product refused a good
 * reverse» from «the driver never reversed».
 *
 * Every branch names WHO failed. The rule the whole file is built around: a
 * reverse the harness could not perform is an INSTRUMENT result and must never
 * be readable as a lesson that cannot be completed.
 */
export function reverseSteerLine(book) {
  if (!book || book.planned === false) {
    return (
      `  REVERSE AIM: NOT ATTEMPTED — ${book?.why ?? "no reference path was loaded"}. ` +
      `The car reversed in a straight line, so a missed parking objective on this leg is THIS HARNESS's ` +
      `result and not the product's; no finding about the reversing half may be drawn from it.`
    );
  }
  const bits = [
    `${book.ticks} steered tick(s)`,
    `${book.commands} wheel command(s)`,
    `off-path ${book.offPathMedianM === null ? "unmeasured" : `${book.offPathMedianM} m median`}`,
    `${book.blindTicks} blind tick(s)`,
  ];
  const head = `  REVERSE AIM: FOLLOWED the lesson's authored reverse path (${book.legLengthM} m, ${book.turnDeg}° of turn) · ${bits.join(" · ")}`;
  const sign =
    book.sign?.verdict === "contradicts"
      ? ` · SIGN CHECK CONTRADICTS: ${book.sign.why}`
      : book.sign?.verdict === "agrees"
        ? " · sign check agrees"
        : ` · sign check undetermined (${book.sign?.why ?? "not run"})`;
  const ended =
    book.reachedEnd === true
      ? ` · REACHED the end of the authored path (${book.finalToEndM} m from it)`
      : ` · did NOT reach the end of the authored path (stopped ${book.finalToEndM ?? "?"} m from it)`;
  const caveat =
    `\n      THIS LEG WAS AIMED FROM THE LESSON'S OWN AUTHORED DEMONSTRATION, not from anything on the glass. ` +
    `It is evidence about whether the product CREDITS a competent reverse park; it is NOT evidence that a student ` +
    `could find the manoeuvre from the screen, and no legibility or teaching finding may cite it.`;
  return head + sign + ended + caveat;
}

/** Median, or null for an empty sample — never 0, which is a measurement. */
export function median(xs) {
  const v = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return Number((v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2).toFixed(3));
}
