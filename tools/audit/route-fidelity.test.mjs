// -----------------------------------------------------------------------------
// route-fidelity.test.mjs — CAN THIS TOOL TELL A GOOD DRIVE FROM A BAD ONE?
//
//   node --test tools/audit/route-fidelity.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it by
//   its `node:test` import.)
//
// WHY SYNTHETIC POLYLINES AND NOT THE REAL CORPUS. The neighbouring
// finding-reader.test.mjs runs against `.audit-frames/` because the property it
// guards IS a property of the real corpus. The property here is arithmetic:
// distance from a point to a polyline, and how far along that polyline a car
// got. On a synthetic line every expected number can be computed by hand — the
// corner cut below is exactly 25 m because the midpoint of the hypotenuse of a
// 50×50 right angle is 25 m from both legs — so a test that goes green cannot
// have been fitted to whatever the code happened to print.
//
// THE TWO CONTROLS, REPRODUCED HERE ON PURPOSE. A metric that only ever reports
// badness is exactly as uninformative as one that only ever reports good, and
// this one reports plenty of badness (median 13.8 m over w30–w33). So:
//
//   CONTROL A — a lesson whose correct line is dead straight and a car that
//     held it must read EXACTLY 0.00 m. `sc-mw-emergency-lane/mobile-right` is
//     the real one: straight at x = 0, car at x = 0.00, four waves running.
//     Real, just easy.
//   CONTROL B — a good lane reads high-but-not-perfect coverage, because the
//     drive ends at its verdict card while the shadow trace runs on to a full
//     stop. On the 2026-09-10 sweep the best lanes cluster at 0.00–0.5 m with
//     coverage from 72% to 100%, median 91%; a car that ends at 88% of the
//     route must still come out `on-line`.
//   CONTROL C — the saddle guard must refuse a lane whose coverage came from a
//     projection jump AND clear an honest drive of the very same hairpin. One
//     without the other is not a guard, it is a preference.
//
// If a control cannot be reproduced, the tool is measuring something else.
//
// EVERY ASSERTION IN THIS FILE HAS BEEN WATCHED TO FAIL. The mutation used is
// named above each block. An assertion nobody has seen go red is a decoration,
// and this repo has caught three instrument bugs with exactly that discipline.
//
// THE WATCHING IS MECHANICAL, NOT REMEMBERED. Each mutation below was applied
// to a COPY of the module, this suite was run against the copy, and the result
// recorded — with the harness REFUSING any mutation whose anchor did not match
// exactly once, because a build report once quoted an anchor with the wrong
// indentation and reported a kill that never happened. 34 mutations, 34 kills,
// 0 survivors. The sixteen in the second half of this file are there because
// they SURVIVED the suite as it stood, and every one of them made the tool
// report a better number than the truth.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MIN_POSES,
  DEFAULT_BANDS,
  ARC_PER_DRIVEN_SLOPE,
  polylineFrom,
  projectToPolyline,
  percentile,
  routeFidelity,
  posesFromStatus,
  findStatusFiles,
  laneFidelity,
  findRepoRoot,
} from "./route-fidelity.mjs";

/* ── FIXTURES ──────────────────────────────────────────────────────────────*/

/** Dead straight, 200 m, at x = 0 — the shape of sc-mw-emergency-lane. */
function straightLine({ lengthM = 200, stepM = 5 } = {}) {
  const pts = [];
  for (let y = 0; y <= lengthM; y += stepM) pts.push({ x: 0, y });
  return polylineFrom(pts);
}

/** (0,0) → (50,0) → (50,50). Total 100 m, one right angle at the corner. */
function rightAngleLine() {
  return polylineFrom([
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
  ]);
}

/** A 40 × 40 square that returns to its start. Total 160 m. */
function closedLoopLine() {
  return polylineFrom([
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 0, y: 40 },
    { x: 0, y: 0 },
  ]);
}

/** Poses straight up the y axis, `count` of them, held at `x` metres across. */
function posesUpTheLine({ x = 0, fromY = 0, toY = 190, count = 20 } = {}) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const y = fromY + ((toY - fromY) * i) / (count - 1);
    out.push({ x, y, tSec: i });
  }
  return out;
}

/* ── CONTROL A + the straight case ─────────────────────────────────────────*/

// MUTATION WATCHED: in `projectToPolyline`, pin `t = 0` (project to the segment
// START VERTEX instead of onto the segment). The poses below sit between
// vertices, so every distance becomes non-zero and this block goes red.
test("CONTROL A — a dead-straight correct line and a car that held it reads exactly 0.00 m", () => {
  const line = straightLine();
  const r = routeFidelity(posesUpTheLine({ x: 0, count: 20 }), line);

  assert.equal(r.maxCrossTrackM, 0, "a car sitting on the line is 0 m off it — if this is not 0, nothing below means anything");
  assert.equal(r.p90CrossTrackM, 0);
  assert.equal(r.verdict, "on-line");
  assert.equal(r.posesUsed, 20);
  assert.equal(r.routeLengthM, 200, "40 samples 5 m apart is 200 m of route, not 40 of anything");
});

// MUTATION WATCHED: in `projectToPolyline`, `Math.hypot(pt.x - px, pt.y - py)`
// → `Math.abs(pt.y - py)`. The cross-track of a car held 4 m to the SIDE of a
// line running up the y axis is entirely in x, so it collapses to 0 and the
// verdict flips to on-line.
test("a car held 4 m off a straight line reads 4 m, and 4 m is «drifted», not «on-line»", () => {
  const line = straightLine();
  const r = routeFidelity(posesUpTheLine({ x: 4, count: 20 }), line);

  assert.equal(r.maxCrossTrackM, 4);
  assert.equal(r.p90CrossTrackM, 4, "held means held — the p90 and the max are the same number");
  assert.equal(r.verdict, "drifted");
  assert.ok(r.maxCrossTrackM > DEFAULT_BANDS.onLineM && r.maxCrossTrackM <= DEFAULT_BANDS.offRouteM);
});

// MUTATION WATCHED: `percentile` → `return sorted[sorted.length - 1]`.
// One excursion is then indistinguishable from a lane that spent its whole
// drive out there, which is the difference between "clipped something once"
// and "drove somewhere else".
test("p90 is a percentile and not a second copy of the max — one excursion does not move it", () => {
  const line = straightLine();
  const poses = posesUpTheLine({ x: 0, count: 10 });
  poses[5] = { ...poses[5], x: 9 }; // one tick, 9 m out

  const r = routeFidelity(poses, line);
  assert.equal(r.maxCrossTrackM, 9, "the excursion must still show up in the max");
  assert.equal(r.p90CrossTrackM, 0, "…and must NOT dominate the p90 of ten samples");
  assert.equal(r.verdict, "drifted");
  // MUTATION WATCHED: `worst = { tSec: p.tSec ?? null, … }` → `tSec: null`.
  // "37.5 m off" is a complaint; "37.5 m off at t=5s, 26% into the route" is a
  // frame somebody can open the matching PNG against.
  assert.equal(r.worstAtSec, 5, "the worst moment has to say WHEN, or nobody can go and look at it");
});

/* ── COVERAGE ──────────────────────────────────────────────────────────────*/

// MUTATION WATCHED: in `routeFidelity`, `if (proj.s > furthestS) furthestS =
// proj.s;` → `furthestS = line.lengthM;`. Every lane then claims the whole
// route, and a car that stopped at 40% is certified on-line — the exact
// reassuring failure this field exists to prevent.
test("a car that stops at 40% of the route reports 40% and is NOT on-line, however neatly it sat on the line", () => {
  const line = straightLine();
  const r = routeFidelity(posesUpTheLine({ x: 0, fromY: 0, toY: 80, count: 20 }), line);

  assert.equal(r.maxCrossTrackM, 0, "this car never left the correct line — cross-track alone would call it perfect");
  assert.ok(Math.abs(r.routeCoveredFrac - 0.4) < 1e-9, `expected 0.40, got ${r.routeCoveredFrac}`);
  assert.equal(r.verdict, "off-route");
  assert.match(r.why, /reached only 40%/);
});

// MUTATION WATCHED: in `routeFidelity`, drop the coverage clause from the
// verdict — `if (off || short)` → `if (off)`. CONTROL B still passes (it is a
// good lane); the 40% block above goes red. The pair is the point: the clause
// has to fire on the short lane and stay silent on this one.
test("CONTROL B — a good lane ends short of the shadow's full stop and is still on-line", () => {
  // The real best-tracked lanes end at 83–91% of the shadow trace, because the
  // drive stops at its verdict card while the shadow rolls on to a standstill.
  const line = straightLine();
  const r = routeFidelity(posesUpTheLine({ x: 0.2, fromY: 0, toY: 176, count: 24 }), line);

  assert.ok(r.routeCoveredFrac >= 0.83 && r.routeCoveredFrac <= 0.91, `expected 83–91%, got ${r.routeCoveredFrac}`);
  assert.ok(r.maxCrossTrackM <= 0.5, `the best lanes sit inside half a metre, got ${r.maxCrossTrackM}`);
  assert.equal(r.verdict, "on-line", "the loop demonstrably CAN do this where the road is straight");
});

// MUTATION WATCHED: in `projectToPolyline`, delete the clamp
// `if (t < 0) t = 0; else if (t > 1) t = 1;`. Every segment then becomes an
// INFINITE LINE, and a car that has run 60 m past the end of the route — or
// 30 m back behind its start — sits on the extension of the last segment at
// 0.00 m and is certified on-line with 100% coverage.
test("running off the end of the route is cross-track, not a free pass", () => {
  const line = straightLine(); // 200 m up the y axis

  const overshoot = posesUpTheLine({ x: 0, fromY: 0, toY: 200, count: 11 })
    .concat([{ x: 0, y: 220, tSec: 11 }, { x: 0, y: 240, tSec: 12 }, { x: 0, y: 260, tSec: 13 }]);
  const over = routeFidelity(overshoot, line);
  assert.equal(over.maxCrossTrackM, 60, "the route ends at 200 m; a car at 260 m is 60 m from it");
  assert.equal(over.routeCoveredFrac, 1, "…and coverage saturates at 1, it does not keep counting");
  assert.equal(over.verdict, "off-route");

  const behind = posesUpTheLine({ x: 0, fromY: -30, toY: -1, count: 12 });
  const back = routeFidelity(behind, line);
  assert.equal(back.maxCrossTrackM, 30, "a car parked 30 m behind the start never joined the route");
  assert.equal(back.verdict, "off-route");
});

/* ── SPEC CORRECTION 1: ARC LENGTH, NEVER SAMPLE INDEX ─────────────────────*/

// MUTATION WATCHED: in `polylineFrom`, `s += step` → `s += 1` (cumulative
// length becomes a cumulative COUNT, i.e. the index metric the prototype used).
// `routeCoveredFrac` then reads 0.67 on a car that drove 97% of the route, and
// the verdict flips from on-line to off-route on a lane that did the lesson.
test("coverage is a fraction of ARC LENGTH — the case that caught the prototype", () => {
  // 20 Hz sampling is dense where the shadow car was slow and sparse where it
  // was fast, so sample index and distance travelled are different quantities.
  // Here: 10 segments of 10 m (the fast stretch, sparsely sampled) followed by
  // 90 segments of 0.1 m (the slow stretch, densely sampled). 109 m total,
  // 101 samples — and the two fractions disagree by 30 points.
  const pts = [];
  for (let i = 0; i <= 10; i += 1) pts.push({ x: i * 10, y: 0 });
  for (let i = 1; i <= 90; i += 1) pts.push({ x: 100 + i * 0.1, y: 0 });
  const line = polylineFrom(pts);
  assert.equal(pts.length, 101);
  assert.ok(Math.abs(line.lengthM - 109) < 1e-9, `expected 109 m, got ${line.lengthM}`);

  // The car drives the fast stretch and most of the slow one, ending at 105.7 m.
  const poses = [];
  for (let i = 0; i <= 20; i += 1) poses.push({ x: (105.7 * i) / 20, y: 0, tSec: i });
  const r = routeFidelity(poses, line);

  // What the prototype computed: nearest SAMPLE INDEX over sample count.
  const nearestIdx = pts.reduce(
    (best, p, i) => (Math.abs(p.x - 105.7) < Math.abs(pts[best].x - 105.7) ? i : best),
    0,
  );
  const indexFrac = nearestIdx / (pts.length - 1);
  assert.ok(Math.abs(indexFrac - 0.67) < 0.01, `the index metric should read ~0.67 here, got ${indexFrac}`);

  // What is true: 105.7 of 109 metres.
  assert.ok(Math.abs(r.routeCoveredFrac - 105.7 / 109) < 0.002, `expected ~0.9697, got ${r.routeCoveredFrac}`);
  assert.ok(
    r.routeCoveredFrac - indexFrac > 0.2,
    "the two fractions must visibly disagree, or this fixture is not reproducing the defect",
  );
  // And the disagreement is not cosmetic: it decides the verdict.
  assert.equal(r.verdict, "on-line");
  assert.ok(indexFrac < DEFAULT_BANDS.coverageMin, "the index metric would have filed this lane as short");
});

/* ── SHAPES THAT ARE NOT A STRAIGHT LINE ───────────────────────────────────*/

// MUTATION WATCHED: in `projectToPolyline`, loop `i < pts.length - 2` (drop the
// last segment). The vertical leg of the L stops existing, the on-line car is
// suddenly up to 50 m from the only remaining leg, and both assertions go red.
test("a right angle: a car on the L reads 0 m, a car cutting the corner reads exactly 25 m", () => {
  const line = rightAngleLine();
  assert.equal(line.lengthM, 100);

  const onTheL = [
    { x: 5, y: 0 }, { x: 12, y: 0 }, { x: 19, y: 0 }, { x: 26, y: 0 },
    { x: 33, y: 0 }, { x: 40, y: 0 }, { x: 47, y: 0 },
    { x: 50, y: 6 }, { x: 50, y: 13 }, { x: 50, y: 20 },
    { x: 50, y: 27 }, { x: 50, y: 34 },
  ].map((p, i) => ({ ...p, tSec: i }));
  const good = routeFidelity(onTheL, line);
  assert.equal(good.maxCrossTrackM, 0, "poses deliberately placed between vertices — a vertex-only projection cannot pass this");

  // The hypotenuse. Its midpoint (25,25) is 25 m from each leg, and that is
  // the worst point on it: dist = min(x, 50 − x).
  const cutting = [];
  for (let x = 0; x <= 50; x += 5) cutting.push({ x, y: x, tSec: x });
  assert.ok(cutting.length >= MIN_POSES);
  const bad = routeFidelity(cutting, line);
  assert.equal(bad.maxCrossTrackM, 25);
  assert.equal(bad.verdict, "off-route");
});

// MUTATION WATCHED: in `projectToPolyline`, the tie-break `distM < best.distM`
// → `distM <= best.distM` (keep the LAST minimum instead of the first). The
// pose at the loop's origin is 0 m from both metre 0 and metre 160, the tie
// resolves forward, and a car that drove a sixth of the loop is certified as
// having driven all of it.
test("a closed loop: the start point does not hand a car the whole route", () => {
  const line = closedLoopLine();
  assert.equal(line.lengthM, 160);

  const quarter = [{ x: 0, y: 0, tSec: 0 }];
  for (let x = 2; x <= 24; x += 2) quarter.push({ x, y: 0, tSec: x });
  assert.ok(quarter.length >= MIN_POSES);
  const r = routeFidelity(quarter, line);

  assert.equal(r.maxCrossTrackM, 0, "it is on the line the whole way — it just did not go far");
  assert.ok(Math.abs(r.routeCoveredFrac - 24 / 160) < 1e-9, `expected 0.15, got ${r.routeCoveredFrac}`);
  assert.equal(r.verdict, "off-route");
});

// MUTATION WATCHED: same tie-break mutation as above — this one holds the
// other direction, so the two together say the loop is measured and not merely
// tolerated.
test("a closed loop: a car that goes all the way round reads the whole route and 0 m", () => {
  const line = closedLoopLine();
  const full = [
    { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 },
    { x: 40, y: 10 }, { x: 40, y: 20 }, { x: 40, y: 30 },
    { x: 30, y: 40 }, { x: 20, y: 40 }, { x: 10, y: 40 },
    { x: 0, y: 30 }, { x: 0, y: 20 }, { x: 0, y: 10 },
  ].map((p, i) => ({ ...p, tSec: i }));
  const r = routeFidelity(full, line);

  assert.equal(r.maxCrossTrackM, 0);
  assert.ok(Math.abs(r.routeCoveredFrac - 150 / 160) < 1e-9, `expected 0.9375, got ${r.routeCoveredFrac}`);
  assert.equal(r.verdict, "on-line");
});

/* ── SPEC CORRECTION 2: THE POSE FLOOR ─────────────────────────────────────*/

// MUTATION WATCHED: in `routeFidelity`, `used.length < MIN_POSES` →
// `used.length < 1`. Nine ticks at the spawn then report 0.00 m and «on-line»,
// which is a measurement of nine ticks wearing a lane's clothes — and it fails
// SMALL, in the reassuring direction, exactly like the witness that once
// published "path 3 m" for a 90 m drive.
test("fewer than ten posed samples returns no-witness and NEVER a number", () => {
  const line = straightLine();
  const nine = posesUpTheLine({ x: 0, fromY: 0, toY: 4, count: 9 });
  assert.equal(nine.length, 9);

  const r = routeFidelity(nine, line);
  assert.equal(r.verdict, "no-witness");
  assert.equal(r.maxCrossTrackM, null, "a number here would be believed");
  assert.equal(r.p90CrossTrackM, null);
  assert.equal(r.routeCoveredFrac, null);
  assert.equal(r.posesUsed, 9, "the count still gets reported — the reader needs to know how close it came");
  assert.match(r.why, /floor 10/);
});

// MUTATION WATCHED: `used.length < MIN_POSES` → `used.length <= MIN_POSES`.
// A guard that fires on everything is worth exactly as much as one that fires
// on nothing, so the floor is pinned from both sides.
test("exactly ten posed samples is a measurement", () => {
  const line = straightLine();
  const r = routeFidelity(posesUpTheLine({ x: 0, fromY: 0, toY: 190, count: MIN_POSES }), line);
  assert.equal(r.posesUsed, 10);
  assert.equal(r.verdict, "on-line");
  assert.equal(r.maxCrossTrackM, 0);
});

/* ── THE JOIN ──────────────────────────────────────────────────────────────*/

// MUTATION WATCHED: in `posesFromStatus`, `y: -s.wz` → `y: s.wz`. The trace
// frame is the district's (`y = −z`, LessonScene.tsx:597) and a sign error
// mirrors every drive about the x axis — which on a symmetric lesson still
// looks plausible, and on this fixture puts the car 24 m from a line it is
// sitting on.
test("posesFromStatus flips z into the trace frame and drops the ticks with no witness", () => {
  const status = {
    guidance: {
      samples: [
        { tSec: 0, wx: 1.5, wz: -12 },
        { tSec: 1, wx: null, wz: null }, // the __camProbe read failed; the tick is still recorded
        { tSec: 2, wx: 1.5, wz: -13 },
        { tSec: 3, wx: 1.5 }, // half a pose is not a pose
      ],
    },
  };
  const poses = posesFromStatus(status);
  assert.deepEqual(poses, [
    { x: 1.5, y: 12, tSec: 0 },
    { x: 1.5, y: 13, tSec: 2 },
  ]);
});

// MUTATION WATCHED: in `polylineFrom`, delete `if (step === 0) continue;`.
// A 20 Hz trace holds the car stationary at both ends of most lessons, so the
// duplicate runs come back as zero-length segments — harmless for arc length,
// and precisely the sample-density skew that makes an index fraction lie.
test("stationary runs in a 20 Hz trace do not become polyline vertices", () => {
  const line = polylineFrom([
    { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
    { x: 0, y: 10 },
    { x: 0, y: 10 }, { x: 0, y: 10 },
  ]);
  assert.equal(line.pts.length, 2, "six samples, two distinct places");
  assert.equal(line.lengthM, 10);
});

test("percentile is nearest-rank, so every value it returns was actually measured", () => {
  // MUTATION WATCHED: `Math.ceil(p * sorted.length)` → `Math.floor(...)`,
  // which returns the 8th of ten instead of the 9th and quietly flatters every
  // p90 in the corpus.
  const ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 100];
  assert.equal(percentile(ten, 0.9), 8);
  assert.equal(percentile(ten, 1), 100);
  assert.equal(percentile(ten, 0.5), 4);
  assert.equal(percentile([], 0.9), null);
  // p × n must be NON-INTEGER here or ceil and floor agree and the assertion
  // above is decoration: 0.9 × 10 = 9 exactly, and both roundings return the
  // 9th value. 0.85 × 10 = 8.5 is where they part company.
  assert.equal(percentile(ten, 0.85), 8, "nearest-rank rounds the rank UP — flooring it flatters every p90 in the corpus");
});

test("an empty or degenerate shadow polyline is no-witness, not zero metres off", () => {
  // MUTATION WATCHED: drop the `line.pts.length < 2` guard — a single-point
  // polyline then measures every pose as a distance to that point and divides
  // coverage by zero, publishing `null`-free nonsense with an on-line verdict.
  const poses = posesUpTheLine({ x: 0, count: 20 });
  const degenerate = polylineFrom([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
  const r = routeFidelity(poses, degenerate);
  assert.equal(r.verdict, "no-witness");
  assert.equal(r.maxCrossTrackM, null);
  assert.match(r.why, /zero length/);
});

test("projectToPolyline reports the arc length of the foot, not of the nearest vertex", () => {
  // MUTATION WATCHED: `s: cum[i] + t * Math.sqrt(segLen2)` → `s: cum[i]`.
  // Coverage then rounds down to whole segments, which on the sparse fast
  // stretch of a trace is tens of metres of route silently unclaimed.
  const line = polylineFrom([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const p = projectToPolyline({ x: 37.5, y: 2 }, line);
  assert.equal(p.distM, 2);
  assert.ok(Math.abs(p.s - 37.5) < 1e-9, `expected s = 37.5, got ${p.s}`);
});

/* ── SPEC CORRECTION 3: COVERAGE MUST BE EARNED, NOT PROJECTED ─────────────*/

/**
 * THE HAIRPIN. A synthetic `sc-pk-driveway`: north 50 m at x = 0, a 0.4 m step
 * east, then back south to y = 26. Total 50 + 0.4 + 24 = 74.4 m. The two legs
 * are 0.4 m apart, so ANY car near them is nearly equidistant from both and the
 * projection can jump 20 m of arc on a 25 cm sideways move — which is what
 * `rebase/sc-pk-driveway__pc-right` did on the real corpus, at 2.95 m of
 * cross-track, well inside the 3 m on-line band. The saddle never needed the
 * car to be far off the line; it needed the ROUTE to come back near itself.
 */
function hairpinLine() {
  return polylineFrom([
    { x: 0, y: 0 },
    { x: 0, y: 50 },
    { x: 0.4, y: 50 },
    { x: 0.4, y: 26 },
  ]);
}

// MUTATION WATCHED: in `routeFidelity`, `const unearned = arcPerDriven >
// arcPerDrivenCap;` → `const unearned = false;`. Also watched: raising
// ARC_PER_DRIVEN_SLOPE from 0.05 to 0.5 (the ceiling becomes 2.83 here and the
// jump sails through), and deleting the guard's branch outright. Each of those
// puts this lane back where the real one was: "on-line, 0.10 m, 81% covered".
test("the saddle: a 25 cm sideways step must not buy 20 m of route", () => {
  const line = hairpinLine();
  assert.equal(line.lengthM, 74.4);

  // Eleven poses up the outbound leg to y = 40, then ONE pose 25 cm east —
  // which is 0.05 m from the return leg and 0.35 m from the outbound one, so
  // the projection jumps from s = 40 to s = 50 + 0.4 + (50 − 40) = 60.4.
  const poses = [];
  let t = 0;
  for (let y = 0; y <= 40; y += 4) poses.push({ x: 0.1, y, tSec: t++ });
  poses.push({ x: 0.35, y: 40, tSec: t++ });
  assert.equal(poses.length, 12, "twelve poses — over MIN_POSES, so the old floor cannot be what saves us");

  const r = routeFidelity(poses, line);
  // Without the guard this reads on-line at 0.10 m across 60.4/74.4 = 81% of
  // the route: both bands cleared by a projection rather than by a drive.
  assert.equal(r.verdict, "no-witness", "the drive cannot have covered 60 m of route in 40 m of driving");
  assert.equal(r.maxCrossTrackM, null, "and the cross-track is measured to a foot that may be on the wrong leg, so it is withheld too");
  assert.equal(r.routeCoveredFrac, null);
  assert.equal(r.witnessPathM, 40.25, "ten 4 m steps is 40 m, plus the 0.25 m sidestep");
  assert.equal(r.arcPerDriven, 1.5006, "60.4 m of arc claimed per 40.25 m driven");
  assert.equal(r.arcPerDrivenCap, 1.183, "the ceiling at this lane's 3.66 m per pose: 1 + 0.05 x 3.6591");
  assert.match(r.why, /not earned/);
});

// MUTATION WATCHED: ARC_PER_DRIVEN_SLOPE → 0 (a flat ceiling of 1.00). This
// control then goes red, which is the whole reason the ceiling is not 1.00: a
// car that CORNERS cuts inside the route, so its chord sum is shorter than the
// arc it legitimately covered. This honest drive of the same hairpin reads
// 1.07 — above 1.00 and nowhere near the 1.50 the saddle produced.
test("CONTROL C — an honest drive of the same hairpin still reads on-line, at 1.07 arc per metre", () => {
  const line = hairpinLine();
  const poses = [];
  let t = 0;
  // Joins the route 8 m in (spawns late, as real lanes do), drives to the top,
  // steps across onto the return leg and drives it back down.
  for (let y = 8; y <= 48; y += 4) poses.push({ x: 0.1, y, tSec: t++ });
  for (let y = 48; y >= 28; y -= 4) poses.push({ x: 0.3, y, tSec: t++ });

  const r = routeFidelity(poses, line);
  assert.equal(r.verdict, "on-line", "it drove the hairpin; refusing this lane would make the guard useless");
  assert.equal(r.maxCrossTrackM, 0.1);
  assert.equal(r.arcPerDriven, 1.0698, "cornering alone puts an honest drive above 1.00 — that is why the ceiling is a slope");
  assert.ok(r.arcPerDriven < r.arcPerDrivenCap, `${r.arcPerDriven} must clear the ${r.arcPerDrivenCap} ceiling`);
  assert.ok(r.routeCoveredFrac > 0.97);

  // MUTATION WATCHED: `const arcSpanM = furthestS - nearestS;` → `furthestS`.
  // This car joined the route 8 m in, so ignoring where it STARTED credits it
  // with 8 m it never drove: 72.4/60.2 = 1.203, over the 1.188 ceiling, and
  // this honest lane is refused. Also watched: dropping the `witnessPathM`
  // accumulation, which makes the ratio infinite and refuses everything.
  assert.equal(r.witnessPathM, 60.2, "ten 4 m steps up, 0.2 m across, five 4 m steps down");
});

// MUTATION WATCHED: move the `unearned` branch ABOVE the `off || short` branch.
// A lane that is short is short A FORTIORI — a saddle only ever moves coverage
// UP — so refusing it as no-witness converts a real finding into a shrug. The
// guard must bite in exactly one place: where an unearned coverage would
// otherwise have bought a certification.
test("an unearned coverage that is STILL short stays a finding, not a shrug", () => {
  const line = hairpinLine();
  const poses = [];
  let t = 0;
  for (let y = 0; y <= 40; y += 4) poses.push({ x: 0.1, y, tSec: t++ });
  poses.push({ x: 0.35, y: 40, tSec: t++ });

  const r = routeFidelity(poses, line, { coverageMin: 0.9 });
  assert.equal(r.verdict, "off-route", "81% is under a 90% floor even with the inflation, so the short clause is safe to keep");
  assert.match(r.why, /reached only 81%/);
});

test("the arc-per-driven ceiling is a published slope, not a hidden constant", () => {
  // MUTATION WATCHED: ARC_PER_DRIVEN_SLOPE → 0.5, or → 1. Either widens the
  // ceiling until no drive in the corpus can fail it. The value is derived in
  // the module header from a perfect-student resample of all 167 shadow routes;
  // pinning it here means a change has to argue with that table.
  assert.equal(ARC_PER_DRIVEN_SLOPE, 0.05);

  // The ceiling must actually SCALE with pose spacing. Two straight-line lanes,
  // same shape, different sampling density: the sparser one gets more headroom.
  const line = polylineFrom([{ x: 0, y: 0 }, { x: 0, y: 400 }]);
  const dense = [];
  const sparse = [];
  for (let i = 0; i < 20; i += 1) {
    dense.push({ x: 0, y: i * 2, tSec: i });
    sparse.push({ x: 0, y: i * 20, tSec: i });
  }
  assert.equal(routeFidelity(dense, line).arcPerDrivenCap, 1.1, "2 m per pose → 1 + 0.05 × 2");
  assert.equal(routeFidelity(sparse, line).arcPerDrivenCap, 2, "20 m per pose → 1 + 0.05 × 20");
});

/* ── THE FLATTERING MUTATIONS THAT USED TO SURVIVE THIS SUITE ──────────────*/

// Three mutations at once, all of which made the tool report a p90 LOWER than
// the truth and all of which used to pass, because every p90 fixture above used
// single-digit distances:
//   · `[...dists].sort((a, b) => a - b)` → `[...dists].sort()` — the DEFAULT
//     comparator is lexicographic, so 11 sorts before 2 and this lane's p90
//     reads 8 instead of 9. Invisible until a distance reaches 10 m, which
//     2,192 lanes of the corpus do.
//   · `percentile(sorted, 0.9)` → `percentile(sorted, 0.75)` — reads 8.
//   · `dists.push(proj.distM)` → `dists.push(Math.min(proj.distM, 5))` — reads 5.
test("the p90 is computed on NUMBERS, at the ninetieth percentile, unclipped", () => {
  const line = straightLine();
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11]; // straddles 10 on purpose
  const poses = xs.map((x, i) => ({ x, y: i * 10, tSec: i }));

  const r = routeFidelity(poses, line);
  assert.equal(r.maxCrossTrackM, 11, "the max is unaffected by any of the three — only the p90 moves");
  assert.equal(r.p90CrossTrackM, 9, "nearest-rank p90 of ten values is the ninth: 9 m, not 8 and not 5");
  assert.equal(r.verdict, "off-route");
});

// MUTATION WATCHED: `const used = (poses ?? []).filter(finite)` → `poses ?? []`.
// `posesFromStatus` already drops the ticks where `__camProbe` failed, but this
// filter is the second line of that defence and a caller can reach
// `routeFidelity` directly. Without it, three failed reads pad a nine-pose lane
// over the floor and it publishes a number computed from nine.
test("non-finite poses are not evidence, and do not count toward the floor", () => {
  const line = straightLine();
  const poses = posesUpTheLine({ x: 0, fromY: 0, toY: 4, count: 9 }).concat([
    { x: Number.NaN, y: Number.NaN, tSec: 9 },
    { x: 0, y: Number.POSITIVE_INFINITY, tSec: 10 },
    { x: undefined, y: undefined, tSec: 11 },
  ]);
  assert.equal(poses.length, 12);

  const r = routeFidelity(poses, line);
  assert.equal(r.verdict, "no-witness");
  assert.equal(r.posesUsed, 9, "twelve entries, nine of them poses");
  assert.equal(r.maxCrossTrackM, null);
});

// MUTATIONS WATCHED, four of them, all widening a band so a worse drive passes:
//   · `maxCrossTrackM > B.onLineM`   → `> B.onLineM + 0.5`
//   · `DEFAULT_BANDS.onLineM`  3.0   → 3.4
//   · `maxCrossTrackM > B.offRouteM` → `> B.offRouteM + 5`
//   · `DEFAULT_BANDS.offRouteM 10.0` → 15.0
// Every band fixture above sat well inside its band (4 m, 25 m, 60 m), so all
// four survived. A band is a policy: it has to be pinned AT ITS EDGE, from both
// sides, or it is not a band, it is a suggestion.
test("the verdict bands are pinned at their edges, from both sides", () => {
  const line = straightLine();
  const at = (x) => routeFidelity(posesUpTheLine({ x, count: 20 }), line);

  assert.equal(DEFAULT_BANDS.onLineM, 3, "the published policy is one lane width");
  assert.equal(DEFAULT_BANDS.offRouteM, 10, "…and three of them");

  assert.equal(at(3).verdict, "on-line", "exactly 3.00 m is INSIDE the on-line band — the comparison is strict");
  assert.equal(at(3.05).verdict, "drifted", "3.05 m is not");
  assert.equal(at(10).verdict, "drifted", "exactly 10.00 m is still on the carriageway");
  assert.equal(at(10.05).verdict, "off-route", "10.05 m is not");
});

// MUTATIONS WATCHED: `routeCoveredFrac < B.coverageMin` → `< B.coverageMin - 0.2`,
// and `DEFAULT_BANDS.coverageMin 0.7` → 0.5. The 40% fixture above is so far
// under the floor that both survived it; a floor needs its own edge.
test("the coverage floor is pinned at its edge, from both sides", () => {
  const line = straightLine(); // 200 m
  assert.equal(DEFAULT_BANDS.coverageMin, 0.7);

  const at140 = routeFidelity(posesUpTheLine({ x: 0, fromY: 0, toY: 140, count: 20 }), line);
  assert.equal(at140.routeCoveredFrac, 0.7, "140 of 200 m is exactly the floor");
  assert.equal(at140.verdict, "on-line", "…and exactly the floor is not short — the comparison is strict");

  const at138 = routeFidelity(posesUpTheLine({ x: 0, fromY: 0, toY: 138, count: 20 }), line);
  assert.equal(at138.routeCoveredFrac, 0.69);
  assert.equal(at138.verdict, "off-route", "one point under it is");
});

// MUTATION WATCHED: `const segLen = Math.hypot(dx, dy);` →
// `Math.sqrt(dx * dx + dy * dy)`. The header claims these agree EXACTLY, and
// rests the ABSENCE of a coverage clamp on that agreement. They do not agree in
// general: for the segments below sqrt returns 0.4123105625617661 where hypot
// returns 0.41231056256176607, so the foot of the final point lands PAST the
// end of the route and coverage exceeds 1. Every existing assertion rounded
// that away, which is precisely how a claim about dead code goes unchecked.
test("every vertex projects to its own cumulative arc length, to the last bit", () => {
  // hypot(0.1, 0.4) = 0.41231056256176607, sqrt(0.1² + 0.4²) = 0.4123105625617661.
  // One ULP apart, and `cum` is built from the first of them.
  assert.notEqual(Math.hypot(0.1, 0.4), Math.sqrt(0.1 * 0.1 + 0.4 * 0.4), "the fixture only bites if these really differ");

  const line = polylineFrom([
    { x: 0, y: 0 },
    { x: 0.1, y: 0.4 },
    { x: 0.5, y: 0.5 },
    { x: 0.6, y: 0.9 },
  ]);
  for (let i = 1; i < line.pts.length; i += 1) {
    const at = projectToPolyline(line.pts[i], line);
    assert.equal(at.distM, 0, `vertex ${i} is on its own polyline`);
    assert.equal(at.s, line.cum[i], `vertex ${i}: s must be cum[${i}] EXACTLY, not within an epsilon`);
    assert.ok(at.s <= line.lengthM, "the invariant the header rests the absent coverage clamp on");
  }
});

// MUTATION WATCHED: `round2` → `Math.floor(v * 100) / 100`. Every published
// metre then reads up to a centimetre LOWER than it was measured — in the
// reassuring direction, on every number this file prints.
test("published metres are rounded, never floored — a rounding may not flatter", () => {
  const line = straightLine();
  const r = routeFidelity(posesUpTheLine({ x: 0.125, count: 20 }), line);
  assert.equal(r.maxCrossTrackM, 0.13, "0.125 rounds to 0.13; flooring publishes 0.12 for a car that was further out");
});

// MUTATION WATCHED: `worst = { tSec: p.tSec ?? null, frac: proj.s / line.lengthM }`
// → `frac: 0`. The `tSec` half was already pinned; the `frac` half was not, and
// it is the half that says WHERE on the route to look.
test("the worst moment says where on the route it happened, not just when", () => {
  const line = straightLine(); // 200 m
  const poses = [];
  for (let i = 0; i < 10; i += 1) poses.push({ x: 0, y: i * 10, tSec: i });
  poses[5] = { x: 9, y: 50, tSec: 5 };

  const r = routeFidelity(poses, line);
  assert.equal(r.maxCrossTrackM, 9);
  assert.equal(r.worstAtSec, 5);
  assert.equal(r.worstAtFrac, 0.25, "50 m into a 200 m route");
});

/* ── THE JOIN AND THE WALK, WHICH NOTHING USED TO TEST ─────────────────────*/

// MUTATIONS WATCHED: in `laneFidelity`, the `verdict: "no-witness"` of the
// no-shadow-trace branch → `"on-line"`, and the same in the unreadable-status
// branch. Neither branch carried a single assertion, so a lesson with no
// recorded correct drive — or a status file that will not parse — could have
// been certified as a good drive by a one-word edit.
test("a lane with no shadow trace, or an unreadable status file, is refused and not certified", () => {
  const noTrace = laneFidelity({
    status: { guidance: { samples: [{ tSec: 0, wx: 1, wz: 1 }] } },
    lessonId: "sc-there-is-no-such-lesson",
  });
  assert.equal(noTrace.verdict, "no-witness");
  assert.match(noTrace.why, /no shadow trace/);

  const unreadable = laneFidelity({
    statusPath: path.join(os.tmpdir(), "route-fidelity-no-such-dir-12345", "_audit-status.json"),
  });
  assert.equal(unreadable.verdict, "no-witness");
  assert.match(unreadable.why, /unreadable/);
});

// MUTATIONS WATCHED: `{ maxDepth = 8 }` → `{ maxDepth = 3 }`, and adding a name
// to the skip list (`|| e.name.startsWith("w1")`). Either silently shrinks the
// census — the exact shape of the counting bugs this audit has already had —
// and nothing tested the walk at all. The corpus really does hold lanes at
// depth 3 (`.audit-frames/<wave>/frames/<lane>/`) and deeper.
test("the corpus walk finds deep lanes, does not descend into one, and skips only what it says", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-fidelity-walk-"));
  try {
    const lane = (...rel) => {
      const dir = path.join(root, ...rel);
      fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
      fs.writeFileSync(path.join(dir, "_audit-status.json"), "{}");
      // a lane holds frame directories; the walk must stop at the lane
      fs.writeFileSync(path.join(dir, "shots", "_audit-status.json"), "{}");
      return path.join(dir, "_audit-status.json");
    };
    const shallow = lane("w1x", "frames", "sc-a__pc-right");
    const deep = lane("a", "b", "c", "d", "e", "sc-b__pc-right");
    fs.mkdirSync(path.join(root, "raw", "sc-c__pc-right"), { recursive: true });
    fs.writeFileSync(path.join(root, "raw", "sc-c__pc-right", "_audit-status.json"), "{}");

    const found = [...findStatusFiles(root)].sort();
    assert.deepEqual(found, [deep, shallow].sort(), "both lanes, no frame directory, nothing under raw/");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// MUTATION WATCHED: in `findRepoRoot`, `const key = `${from} ${process.cwd()}`;`
// → a constant key. The memoisation added for `--corpus` (5,444 lookups, 0.76 s
// of pure `existsSync`) then answers every caller with whatever the FIRST caller
// asked, which is how a cache turns a speed-up into a wrong answer. The one
// staleness this cache does accept is deliberate and stated: the repo root
// cannot move while the process runs.
test("the repo-root cache is keyed on what was asked, not on what was asked first", () => {
  const fake = fs.mkdtempSync(path.join(os.tmpdir(), "route-fidelity-root-"));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "route-fidelity-nowhere-"));
  try {
    fs.mkdirSync(path.join(fake, "content", "traces"), { recursive: true });

    assert.equal(findRepoRoot(fake), fake, "a directory that HAS content/traces is its own repo root");
    assert.notEqual(
      findRepoRoot(elsewhere),
      fake,
      "…and a directory that does not must not inherit the previous caller's answer",
    );
  } finally {
    fs.rmSync(fake, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});
