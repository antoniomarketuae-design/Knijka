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
  ROUTE_NEAR_M,
  ROUTE_OFF_M,
  authoredLinePolyline,
  distanceToPolyline,
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
