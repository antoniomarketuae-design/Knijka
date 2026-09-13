/**
 * route-fidelity.test.mjs — where the car actually went, in the product's frame.
 *
 * WHAT THIS DEFENDS. Twenty-one open rows, eleven of them critical, are
 * UNJUDGED because nobody could say where the car was RELATIVE TO THE ROAD. The
 * first attempt at answering that was reverted for measuring displacement from
 * the car's own prior chord — a line through its own last 25 m — while every
 * positional detector in the product measures from the road. This one measures
 * against `content/traces/<lesson>/shadow-correct.trace.json`, a drive the
 * PRODUCT authored under «must replay with ZERO violations».
 *
 * EVERY ASSERTION HERE HAS BEEN WATCHED TO FAIL, and the mutation is named
 * beside it — the same rule as guidance.test.mjs, for the same reason.
 *
 * THE ONE THAT MATTERS MOST is section 2. The trace is authored in DISTRICT
 * coordinates and the pose probe reports WORLD; they differ by `z = -y`. Get
 * that wrong and every figure this module produces is a confident,
 * plausible-looking measurement of a MIRRORED road — the worst failure
 * available here, because it does not look like a failure.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECOVERY_MAX_EPISODES,
  RECOVERY_MAX_M,
  RECOVERY_MAX_MS,
  ROUTE_MIN_COVERED_FRAC,
  ROUTE_NEAR_M,
  ROUTE_OFF_M,
  authoredLinePolyline,
  distanceToPolyline,
  projectOnPolyline,
  recoveryAim,
  recoveryBudget,
  routeDeviation,
  routeDeviationRefusal,
} from "../lib/guidance.mjs";

/** A straight authored line up the world-z axis at x = 4. */
const STRAIGHT = Array.from({ length: 50 }, (_, i) => [4, i * 2]);
const move = (wx, wz, kmh = 20) => ({ wx, wz, kmh });

describe("1 · distance to a polyline", () => {
  it("is zero on the line and the perpendicular offset beside it", () => {
    assert.equal(distanceToPolyline(4, 50, STRAIGHT), 0);
    assert.equal(distanceToPolyline(7, 50, STRAIGHT), 3);
    // MUTATION WATCHED: returning the distance to the nearest VERTEX instead of
    // the nearest point ON the segment reads 3.16 here, and inflates every
    // sample taken between two authored points.
    assert.equal(distanceToPolyline(7, 51, STRAIGHT), 3);
  });

  it("clamps to the ends rather than extending the line to infinity", () => {
    // 10 m past the last vertex (4, 98) — the true distance is 10, not 0.
    // MUTATION WATCHED: dropping the 0..1 clamp on `t` projects onto the
    // infinite line and reports 0, which would certify a car that drove
    // straight off the end of its route as perfectly on it.
    assert.equal(distanceToPolyline(4, 108, STRAIGHT), 10);
  });

  it("refuses a degenerate line instead of returning a number", () => {
    assert.equal(distanceToPolyline(0, 0, []), null);
    assert.equal(distanceToPolyline(0, 0, [[1, 1]]), null);
  });
});

describe("2 · the district-to-world sign, which is the whole of it", () => {
  const trace = { samples: [{ x: 4, y: 0 }, { x: 4, y: 10 }, { x: 4, y: 20 }] };

  it("negates y to get z", () => {
    assert.deepEqual(authoredLinePolyline(trace), [[4, -0], [4, -10], [4, -20]]);
  });

  it("a car ON the authored line reads ~0, and the mirrored reading is far", () => {
    const poly = authoredLinePolyline(trace);
    // The car at the far end of the route — district y = 20 — is at world
    // z = -20, and sits exactly on the line.
    assert.equal(distanceToPolyline(4, -20, poly), 0);
    // MUTATION WATCHED: drop the negation in authoredLinePolyline and that same
    // on-line car reads 20 m off — the length of the whole route. A clean drive
    // would be certified as a departure and every real departure as clean, and
    // nothing about either number would look wrong.
    assert.equal(distanceToPolyline(4, 20, poly), 20);
  });

  it("refuses a trace with nothing usable in it", () => {
    assert.equal(authoredLinePolyline(null), null);
    assert.equal(authoredLinePolyline({ samples: [] }), null);
    assert.equal(authoredLinePolyline({ samples: [{ x: 1, y: 2 }] }), null);
    assert.equal(authoredLinePolyline({ samples: [{ x: "a", y: 2 }, { x: 1, y: null }] }), null);
  });
});

describe("3 · folding a drive", () => {
  it("reports a clean drive as on-route", () => {
    const s = Array.from({ length: 20 }, (_, i) => move(4.2, i * 4));
    const d = routeDeviation(s, STRAIGHT);
    assert.equal(d.n, 20);
    assert.ok(d.maxM < 0.5, `maxM ${d.maxM}`);
    assert.equal(d.onRoute, true);
    assert.equal(d.pctOverOff, 0);
    assert.equal(routeDeviationRefusal(d), null);
  });

  it("catches the drive that is fine until it is not", () => {
    // 18 samples on the line, 2 samples 40 m away — the sc-rb-busy-gap shape:
    // a good median and a car that ends up against a building.
    const s = [
      ...Array.from({ length: 18 }, (_, i) => move(4, i * 4)),
      move(44, 72),
      move(44, 76),
    ];
    const d = routeDeviation(s, STRAIGHT);
    // MUTATION WATCHED: reporting only the median (2 of 20 samples are off, so
    // the median is 0) certifies this drive as perfect. The median is exactly
    // what a departure hides behind, which is why maxM is what the refusal reads.
    assert.equal(d.medianM, 0);
    assert.equal(d.maxM, 40);
    assert.equal(d.onRoute, false);
    assert.equal(d.pctOverOff, 10);
    assert.match(routeDeviationRefusal(d), /LEFT ITS OWN LESSON/);
  });

  it("ignores samples taken while the car was not moving", () => {
    // A car parked 40 m from the line before it is allowed to start must not
    // describe the drive. MUTATION WATCHED: drop the kmh filter and this reads
    // maxM 40 on a drive that never left the line once it moved.
    const s = [
      ...Array.from({ length: 10 }, () => move(44, 0, 0)),
      ...Array.from({ length: 10 }, (_, i) => move(4, i * 4)),
    ];
    const d = routeDeviation(s, STRAIGHT);
    assert.equal(d.n, 10);
    assert.equal(d.maxM, 0);
    assert.equal(d.onRoute, true);
  });

  it("returns null — never a zero — when it cannot measure", () => {
    // MUTATION WATCHED: returning a zeroed object here is the single most
    // dangerous change available in this file. "the car never left the line"
    // and "nobody looked" would become the same artefact, and the second one
    // would start closing rows.
    assert.equal(routeDeviation([], STRAIGHT), null);
    assert.equal(routeDeviation([move(4, 0)], STRAIGHT), null);
    assert.equal(routeDeviation(Array.from({ length: 20 }, () => move(4, 0, 0)), STRAIGHT), null);
    assert.equal(routeDeviation(Array.from({ length: 20 }, (_, i) => move(4, i)), []), null);
    assert.equal(routeDeviation(null, STRAIGHT), null);
  });

  it("skips poses the probe did not supply rather than treating them as origin", () => {
    // A null pose read as (0,0) is 4 m off this line and would manufacture a
    // departure out of a probe hiccup.
    const s = [
      ...Array.from({ length: 10 }, (_, i) => move(4, i * 4)),
      { wx: null, wz: null, kmh: 20 },
      { wx: undefined, wz: 5, kmh: 20 },
    ];
    const d = routeDeviation(s, STRAIGHT);
    assert.equal(d.n, 10);
    assert.equal(d.maxM, 0);
  });
});

describe("4 · the refusal says the narrow thing, not the broad one", () => {
  it("names the metres, the share and the reference file", () => {
    const d = routeDeviation(
      [...Array.from({ length: 9 }, (_, i) => move(4, i * 4)), move(24, 40)],
      STRAIGHT,
    );
    const why = routeDeviationRefusal(d);
    assert.match(why, /20 m at worst/);
    assert.match(why, /shadow-correct\.trace\.json/);
    // It must scope itself. A blanket "this drive proves nothing" would throw
    // away HUD and debrief findings that the departure cannot touch.
    assert.match(why, /Findings about the HUD, the debrief or a card that never mounted are unaffected/);
    // And it must name the class it DOES kill, in the words the rows use.
    assert.match(why, /a task that never ticked/);
    assert.match(why, /an offence that never fired/);
  });

  it("distinguishes «no line to measure against» from «on route»", () => {
    // MUTATION WATCHED: returning null for a missing measurement would read as
    // "this drive was fine" everywhere the caller treats null as no-refusal.
    const why = routeDeviationRefusal(null);
    assert.match(why, /UNKNOWN, not zero/);
    assert.notEqual(why, null);
  });

  it("holds the thresholds the refusal quotes", () => {
    assert.equal(ROUTE_NEAR_M, 3);
    assert.equal(ROUTE_OFF_M, 8);
    // A car exactly at the threshold is not yet off it.
    const at = routeDeviation(Array.from({ length: 10 }, () => move(4 + ROUTE_OFF_M, 20)), STRAIGHT);
    assert.equal(at.onRoute, true);
    const past = routeDeviation(Array.from({ length: 10 }, () => move(4 + ROUTE_OFF_M + 0.01, 20)), STRAIGHT);
    assert.equal(past.onRoute, false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5 · THE PRODUCT'S OWN «THE CAR IS NOT ON THE ROAD»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The harness reads two authored Bulgarian sentences out of the objective
 * banner to learn what the PRODUCT thinks about where the car is. Those
 * sentences live in `LessonPlayShell.tsx` and nothing but this test stops them
 * drifting apart — and a drifted matcher does not fail loudly, it reports every
 * drive as on the road, which is the reassuring direction.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const read = (p) => readFileSync(resolve(REPO, p), "utf8");

describe("5 · the route-hold leads are the product's own, verbatim", () => {
  const harness = read("tools/mobile/lesson-audit.mjs");
  const shell = read("platform/src/components/sim/lesson-ui/LessonPlayShell.tsx");
  const leadOf = (name) => {
    const m = new RegExp(`const ${name} = "([^"]+)"`, "u").exec(harness);
    assert.ok(m, `${name} is not declared as a plain string literal in lesson-audit.mjs`);
    return m[1];
  };

  it("the off-road lead exists in the product, character for character", () => {
    const lead = leadOf("ROUTE_HOLD_OFF_ROAD_BG");
    // MUTATION WATCHED: change one word of the product sentence and this goes
    // red. Without it the harness reads a sentence nobody prints and every
    // drive reports «the product never declared the car off the road».
    assert.ok(shell.includes(lead), `LessonPlayShell.tsx no longer contains «${lead}»`);
  });

  it("the crash-pinned lead exists in the product, character for character", () => {
    const lead = leadOf("ROUTE_HOLD_CRASH_PINNED_BG");
    assert.ok(shell.includes(lead), `LessonPlayShell.tsx no longer contains «${lead}»`);
  });

  it("the two leads are distinguishable — neither contains the other", () => {
    const off = leadOf("ROUTE_HOLD_OFF_ROAD_BG");
    const pinned = leadOf("ROUTE_HOLD_CRASH_PINNED_BG");
    assert.notEqual(off, pinned);
    assert.ok(!off.includes(pinned) && !pinned.includes(off));
  });

  it("the match is on the WHOLE sentence, not the fragment «извън пътя»", () => {
    // That fragment also appears in rules/catalog.ts explaining a bend taken
    // too fast, and in lessons/finish.ts's ending title. A loose match would
    // report a car as off the road because the DEBRIEF was explaining what off
    // the road means — and the debrief is on screen at the end of every drive.
    const lead = leadOf("ROUTE_HOLD_OFF_ROAD_BG");
    assert.ok(lead.length > 30, "the lead has been shortened toward a fragment");
    assert.ok(lead.includes("върни се на платното"), "the lead no longer carries its imperative half");
    const elsewhere = read("platform/src/modules/sim/rules/catalog.ts") + read("platform/src/modules/sim/lessons/finish.ts");
    assert.ok(elsewhere.includes("извън пътя"), "the fragment this test guards against no longer appears elsewhere — re-derive the risk before relaxing the matcher");
    assert.ok(!elsewhere.includes(lead), "the whole lead now appears outside the banner too — the matcher needs a scope, not just a longer string");
  });

  it("an unread probe is counted apart from a clear one", () => {
    // `routeHold: undefined` on the probe's catch path, and a fold that keeps
    // `unread` separate from `clearTicks`. MUTATION WATCHED: default the catch
    // to `null` and a page that threw on every tick certifies the drive as
    // having stayed on the road all the way.
    assert.match(harness, /routeHold: undefined/u);
    assert.match(harness, /if \(p\.routeHold === undefined\) routeHold\.unread \+= 1;/u);
    assert.match(harness, /agreesWithGeometry:\s*dev === null \|\| routeHold\.unread > 0 \? null :/u);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 6 · GETTING BACK ON THE ROAD
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("6 · recoveryAim, in the product's own frame", () => {
  /* THE FRAME IS THE PRODUCT'S AND IS QUOTED, NOT INFERRED.
   * scene/vehicleSample.ts:70 — "District-space mapping … three.js +X =
   * district x (east), three.js −Z = district y (north) … headingDeg is
   * 0 = north, clockwise positive (facing +X/east = 90°)".
   *
   * TWO CONSEQUENCES THAT ARE EASY TO GET BACKWARDS, AND BOTH WERE, ONCE:
   *   · WORLD +z IS SOUTH. A car whose pose is increasing in z is driving
   *     south, not north.
   *   · heading is CLOCKWISE-positive, so "turn right" means "increase
   *     heading", which is what makes errDeg > 0 mean right in steerCommand.
   *
   * Working the bearing difference through in that frame gives exactly
   * atan2(hx·vz − hz·vx, h·v), which is what recoveryAim computes. These cases
   * pin the RESULT rather than the derivation, so a later reader can check the
   * sign without redoing the algebra. */
  const LINE = Array.from({ length: 40 }, (_, i) => [0, i * 2]); // due SOUTH at x = 0

  it("driving south, off to the EAST of the line, is told to steer RIGHT", () => {
    // Facing south (+z), east (+x) is on the driver's LEFT, so a line to the
    // west of him is on his RIGHT.
    const a = recoveryAim({ x: 10, z: 20, prevX: 10, prevZ: 18, poly: LINE });
    assert.ok(a.errDeg > 0, `expected a right demand, got ${a.errDeg}`);
    assert.equal(a.offRouteM, 10);
  });

  it("…and mirrored, off to the WEST of it, is told to steer LEFT", () => {
    // MUTATION WATCHED: swap the cross-product operands and both of these point
    // the wrong way — the car would be steered further off the road at exactly
    // the moment it is already off it, and the drive would look recovered
    // because metres were spent trying.
    const a = recoveryAim({ x: -10, z: 20, prevX: -10, prevZ: 18, poly: LINE });
    assert.ok(a.errDeg < 0, `expected a left demand, got ${a.errDeg}`);
  });

  it("a car already on the line and pointing along it is told to go straight", () => {
    const a = recoveryAim({ x: 0, z: 20, prevX: 0, prevZ: 18, poly: LINE });
    assert.ok(Math.abs(a.errDeg) < 1, `expected ~0, got ${a.errDeg}`);
    assert.equal(a.offRouteM, 0);
  });

  it("a car pointing the WRONG WAY down the line is told to turn about", () => {
    // Driving north (−z) along a line that runs south. The demand must be near
    // ±180°, not near 0 — a controller that reads this as "on line, carry on"
    // drives the length of the route backwards.
    const a = recoveryAim({ x: 0, z: 20, prevX: 0, prevZ: 22, poly: LINE });
    assert.ok(Math.abs(a.errDeg) > 150, `expected a turn-about, got ${a.errDeg}`);
  });

  it("REFUSES a heading derived from jitter instead of inventing one", () => {
    // MUTATION WATCHED: drop the step floor and a stationary car's heading is
    // whatever the last two floating-point poses happened to differ by. The
    // wheel would then be turned confidently at right angles to the truth.
    const a = recoveryAim({ x: 10, z: 20, prevX: 10.01, prevZ: 20.01, poly: LINE });
    assert.equal(a.errDeg, null);
    assert.match(a.why, /noise, not a direction/);
  });

  it("refuses without a line, and without a pose pair", () => {
    assert.equal(recoveryAim({ x: 1, z: 1, prevX: 0, prevZ: 0, poly: [] }).errDeg, null);
    assert.equal(recoveryAim({ x: 1, z: 1, prevX: null, prevZ: 0, poly: LINE }).errDeg, null);
    assert.equal(recoveryAim({ x: NaN, z: 1, prevX: 0, prevZ: 0, poly: LINE }).errDeg, null);
  });

  it("aims along the ARC of the line, not across the chord of a bend", () => {
    // South for 20 m, then east. A car at the corner must be aimed round it.
    const BEND = [
      ...Array.from({ length: 11 }, (_, i) => [0, i * 2]),
      ...Array.from({ length: 10 }, (_, i) => [(i + 1) * 2, 20]),
    ];
    const a = recoveryAim({ x: 0, z: 20, prevX: 0, prevZ: 18, poly: BEND, lookaheadM: 8 });
    assert.equal(a.targetX, 8);
    assert.equal(a.targetZ, 20);
    assert.equal(a.arcM, 8);
    // Facing south, east (+x) is a LEFT turn.
    assert.ok(a.errDeg < -45, `expected a hard left round the bend, got ${a.errDeg}`);
    // MUTATION WATCHED: taking the nearest vertex within a straight-line RADIUS
    // instead of walking the arc picks a point on the incoming leg and steers
    // the car straight on through the corner — the exact shape that puts a car
    // on the grass at a roundabout.
  });

  it("clamps to the end of the line rather than running off it", () => {
    const a = recoveryAim({ x: 5, z: 76, prevX: 5, prevZ: 74, poly: LINE, lookaheadM: 500 });
    assert.notEqual(a.errDeg, null);
    assert.equal(a.targetZ, 78);
  });

  it("the frame it assumes is still the frame the product documents", () => {
    // MUTATION WATCHED: the product changing its district mapping without this
    // module noticing is the one failure that produces confident, plausible
    // numbers about a mirrored road. If this goes red, re-derive the sign — do
    // not adjust the expectations above to match.
    const vs = read("platform/src/modules/sim/scene/vehicleSample.ts");
    assert.match(vs, /district y = −worldZ/u);
    assert.match(vs, /headingDeg is 0 = north, clockwise positive/u);
  });
});

describe("7 · the recovery ceilings", () => {
  it("passes inside all three", () => {
    assert.deepEqual(recoveryBudget({ metresSpent: 10, msSpent: 5000, episode: 1 }), { ok: true });
  });

  it("stops on distance, on time, and on repetition — each with its own sentence", () => {
    const d = recoveryBudget({ metresSpent: RECOVERY_MAX_M + 1, msSpent: 0, episode: 1 });
    assert.equal(d.ok, false);
    assert.match(d.why, /m spent rejoining the route/);

    const t = recoveryBudget({ metresSpent: 0, msSpent: RECOVERY_MAX_MS + 1, episode: 1 });
    assert.equal(t.ok, false);
    assert.match(t.why, /s spent rejoining the route/);

    const e = recoveryBudget({ metresSpent: 0, msSpent: 0, episode: RECOVERY_MAX_EPISODES + 1 });
    assert.equal(e.ok, false);
    assert.match(e.why, /left the road [0-9]+ times in one drive/);
    // The episode ceiling must say the drive is unusable, not merely that
    // recovery stopped. A reader who sees only "recovery abandoned" will still
    // file a route finding off the leg.
    assert.match(e.why, /no route-position finding may be filed from it/);
  });

  it("every refusal refuses «we tried» explicitly", () => {
    // MUTATION WATCHED: soften these to "recovery ended" and a drive that spent
    // 60 m failing to rejoin reads the same as one that never left.
    for (const args of [
      { metresSpent: RECOVERY_MAX_M + 1, msSpent: 0, episode: 1 },
      { metresSpent: 0, msSpent: RECOVERY_MAX_MS + 1, episode: 1 },
    ]) {
      assert.match(recoveryBudget(args).why, /«we tried» is not evidence/);
    }
  });

  it("the ceilings are bounded in SHAPE as well as time", () => {
    // The reverted lane-departure build could spin the car three times while
    // reporting success because it bounded only duration. A distance ceiling is
    // the shape bound: an arc costs metres even when it goes nowhere.
    assert.ok(RECOVERY_MAX_M > 0 && Number.isFinite(RECOVERY_MAX_M));
    assert.ok(RECOVERY_MAX_MS > 0 && Number.isFinite(RECOVERY_MAX_MS));
    assert.ok(RECOVERY_MAX_EPISODES >= 1);
    // A recovery may not out-drive the departure it is undoing by an order of
    // magnitude — 60 m against an 8 m off-route threshold.
    assert.ok(RECOVERY_MAX_M <= 10 * ROUTE_OFF_M);
  });
});

describe("8 · reverse, where a travel-derived heading is inverted", () => {
  const LINE = Array.from({ length: 40 }, (_, i) => [0, i * 2]);

  it("refuses outright rather than issuing a demand that is 180 degrees wrong", () => {
    // MUTATION WATCHED: drop the gate and every parking lesson's recovery turns
    // the wheel the opposite way while the car is already off the road. This is
    // not hypothetical — it is what the w43 comparison found: outside the
    // parking lessons every disagreement with the ribbon was the ribbon
    // drifting; inside them, every one was this.
    const a = recoveryAim({ x: 10, z: 20, prevX: 10, prevZ: 18, poly: LINE, reversing: true });
    assert.equal(a.errDeg, null);
    assert.match(a.why, /in reverse/);
  });

  it("and the same pose forward still produces a demand", () => {
    assert.notEqual(recoveryAim({ x: 10, z: 20, prevX: 10, prevZ: 18, poly: LINE }).errDeg, null);
  });

  it("the gate is a parameter, not a caller's discipline", () => {
    // A default of `false` is the safe one ONLY because every call site is
    // required to pass the real value; this pins that the parameter exists at
    // all, so a refactor cannot quietly drop it back to caller discipline.
    const src = read("tools/mobile/lib/guidance.mjs");
    assert.match(src, /export function recoveryAim\(\{[^}]*reversing = false/u);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 9 · PROGRESS ALONG THE ROUTE — the half that lateral distance hides
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WRITTEN AFTER THE MEASUREMENT CORRECTED ITS OWN AUTHOR. The first cut of
 * `routeDeviation` reported only lateral distance, and on that basis 65 of the
 * 101 open rows were said to have a leg good enough to judge from. Six w43 legs
 * then turned out to be sitting ON their authored line having covered 4–47 % of
 * it — four of them roundabouts that stop halfway — and the honest figure was
 * 54. This programme has been caught by exactly this shape once before, when
 * «1 cm of lateral spread over 289 m» was offered as proof a car held its lane
 * and in fact proved it drove STRAIGHT.
 */

describe("9 · a car parked on its route has not driven it", () => {
  const LINE = Array.from({ length: 51 }, (_, i) => [0, i * 2]); // 100 m long

  it("projectOnPolyline reports how far along the foot of the perpendicular lies", () => {
    const pr = projectOnPolyline(3, 40, LINE);
    assert.equal(Math.round(pr.distanceM), 3);
    assert.equal(Math.round(pr.alongM), 40);
    assert.equal(Math.round(pr.totalM), 100);
  });

  it("a car that shuttles inside 5 m of a 100 m route is NOT counted as having driven it", () => {
    // Dead on the line the whole time — `onRoute` is true and says nothing.
    const s = Array.from({ length: 20 }, (_, i) => move(0, (i % 3) * 2));
    const d = routeDeviation(s, LINE);
    assert.equal(d.onRoute, true);
    assert.equal(d.maxM, 0);
    // MUTATION WATCHED: report `onRoute` alone and this drive certifies as
    // evidence about what the product credits along 100 m the car never saw.
    assert.equal(d.droveIt, false);
    assert.ok(d.coveredFrac < 0.1, `coveredFrac ${d.coveredFrac}`);
    assert.match(routeDeviationRefusal(d), /STAYED ON ITS LINE AND NEVER DROVE IT/);
    assert.match(routeDeviationRefusal(d), /NO FINDING ABOUT WHAT THE PRODUCT DID ALONG THIS ROUTE/);
  });

  it("a car that drives the whole thing passes both halves and draws no refusal", () => {
    const s = Array.from({ length: 40 }, (_, i) => move(0.2, i * 2.5));
    const d = routeDeviation(s, LINE);
    assert.equal(d.onRoute, true);
    assert.equal(d.droveIt, true);
    assert.ok(d.coveredFrac > 0.9, `coveredFrac ${d.coveredFrac}`);
    assert.equal(routeDeviationRefusal(d), null);
  });

  it("covered and reached are different questions, and both are reported", () => {
    // A car that appears at the far end and drives the last 10 m has a high
    // `reachedFrac` on almost no driving. MUTATION WATCHED: report only
    // `reachedFrac` and a drive that starts at the finish line reads complete.
    const s = Array.from({ length: 10 }, (_, i) => move(0, 90 + i));
    const d = routeDeviation(s, LINE);
    assert.ok(d.reachedFrac > 0.95, `reachedFrac ${d.reachedFrac}`);
    assert.ok(d.coveredFrac < 0.2, `coveredFrac ${d.coveredFrac}`);
    assert.equal(d.droveIt, false);
  });

  it("a car far off the line is still refused for THAT, not for coverage", () => {
    const s = Array.from({ length: 40 }, (_, i) => move(40, i * 2.5));
    const d = routeDeviation(s, LINE);
    assert.equal(d.onRoute, false);
    assert.equal(d.droveIt, false);
    // The departure sentence, not the never-drove-it one — the two want
    // different follow-ups and must stay distinguishable.
    assert.match(routeDeviationRefusal(d), /LEFT ITS OWN LESSON/);
  });

  it("the coverage floor is stated, low, and not a quality bar", () => {
    // It asks «was this car ever on enough of the road to witness anything»,
    // not «did the student drive well». A high floor would start refusing legs
    // that legitimately end early on a lesson that ends early.
    assert.equal(ROUTE_MIN_COVERED_FRAC, 0.5);
  });
});
