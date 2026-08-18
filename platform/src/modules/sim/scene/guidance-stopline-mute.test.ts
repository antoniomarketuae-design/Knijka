/**
 * THE GUIDANCE RIBBON DOES NOT PAINT OVER THE STOP LINE EITHER.
 *
 * THE FRAME (catalogue sweep 2026-08-17, `sc-sig-controller-live`, mobile/right
 * — the only one of that lesson's 24 platform × direction combinations that
 * produced evidence). `05-stopped.png`, crop [1080, 400 320×160] × 6: a
 * регулировчик stands in the junction with both arms out, the callout reads
 * «СПРИ» — and the guidance ribbon runs UNBROKEN across the stop line and
 * straight through the junction he is closing, chevrons forward, with no change
 * of state at the line. Same unbroken ribbon in `04-t012s.png` and
 * `01-arrival.png`.
 *
 * It is the zebra defect (`guidance-crossing-mute.test.ts`) on a second
 * surface, and by the identical mechanism: RIBBON_FRAG blends ADDITIVELY at
 * RIBBON_Y = 0.045 while the М7 bar and the М8 give-way triangles are painted
 * at MARKING_Y = 0.032, so where the two meet the paint the lesson exists to
 * teach the student to READ is washed out by the HUD.
 *
 * WHAT IS NOT BEING FIXED HERE, deliberately. The ribbon is a ROUTE, not a
 * signal state — it must not go dark because a controller has his arms out, and
 * the look-ahead leg past the line stays drawn (register B24: the turn is
 * announced BEFORE the junction, never after the nose is in it). What changes
 * is the drawing over the mouth's own paint, so the change of state at the line
 * is the line's own paint.
 *
 * AND „THE MOUTH'S OWN PAINT" IS NOT ONE NUMBER — corrected 2026-08-18. The
 * first version of this row took 9.4 m off the ribbon in front of EVERY line,
 * because that is the depth of the М18 give-way triangles. `markings.ts` paints
 * those in its `giveWayEdges` branch alone: a signalised arm — including the
 * one this whole file is written about — and a Б2 „Стоп" arm carry 0.8 m of М7
 * bar and no symbol, so 8.0 m of that span was ribbon removed from bare
 * asphalt. Both depths are asserted below, on shipped maps, in both directions.
 *
 * MEASURED ON THE SHIPPED MAP, both directions:
 *   · the northbound leg over sx-v1's signalized crossroads gains exactly ONE
 *     quiet span, over the approach line it drives across;
 *   · the other THREE lines at the same node — the opposing arm's, and the two
 *     cross arms' — gain none. A mute that fires for those would be a gap with
 *     no cause, which is the same crime as the ribbon over the bars pointing
 *     the other way.
 */

import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SCENARIO_TEMPLATES, compileScenario, type LessonSpec } from "@/modules/sim/lessons";
import { parseDistrict, type District } from "@/modules/sim/runtime";
import {
  CROSSING_MUTE_HALF_M,
  CROSSING_MUTE_MAX_SPANS,
  STOP_LINE_MUTE_AFTER_M,
  STOP_LINE_MUTE_BEFORE_BAR_M,
  STOP_LINE_MUTE_BEFORE_GIVE_WAY_M,
  stopLineMuteBeforeM,
  buildRouteGraph,
  crossingMuteSpans,
  deriveGuidanceRoute,
  guidanceGoalFor,
  nearestArcOnRoute,
  routePointAt,
  stopLinesForGuidance,
  type DerivedRoute,
  type GuidanceStopLine,
  type RouteGraph,
} from "./guidanceRoute";

// ---------------------------------------------------------------------------
// Fixtures — the SHIPPED maps, never a hand-built stand-in. The whole claim is
// about paint the world actually lays, so a synthetic district would be
// testing the test.
// ---------------------------------------------------------------------------

const WORLD_DIRS = [
  path.join(process.cwd(), "content", "world"),
  path.resolve(process.cwd(), "..", "content", "world"),
];
const WORLD_DIR = WORLD_DIRS.find((d) => fs.existsSync(d))!;

function worldFor(districtId: string): {
  district: District;
  graph: RouteGraph;
  lines: readonly GuidanceStopLine[];
} {
  const raw = JSON.parse(
    fs.readFileSync(path.join(WORLD_DIR, `${districtId}.json`), "utf8"),
  ) as unknown;
  const district = parseDistrict(raw);
  return {
    district,
    graph: buildRouteGraph(district as never),
    lines: stopLinesForGuidance(district),
  };
}

/** `sx-v1` is the map `sc-sig-controller-live` runs on: ONE signalized
 *  crossroads at the origin, four two-way arms, no pedestrian crossings — so
 *  every span this file sees is a stop-line span and nothing else. */
let sx: ReturnType<typeof worldFor>;
/** The 150 m northbound leg from the south spawn, over the junction — the same
 *  corridor the lesson's own objectives are strung along. */
let northbound: DerivedRoute;

beforeAll(() => {
  sx = worldFor("sx-v1");
  northbound = deriveGuidanceRoute(
    sx.graph,
    { x: 4.06, y: -105, headingDeg: 0 },
    { kind: "ahead", meters: 150 },
  )!;
});

describe("the shipped map really has four lines at that node", () => {
  it("sx-v1 grades one approach line per arm, all four of them", () => {
    expect(sx.district.crossings).toHaveLength(0); // no zebra can explain any span here
    const graded = sx.lines.filter((l) => l.junctionNodeId === "sx-n-c" && l.graded);
    expect(graded).toHaveLength(4);
    expect(new Set(graded.map((l) => l.control))).toEqual(new Set(["trafficLight"]));
    expect(northbound).not.toBeNull();
    expect(northbound.totalLen).toBeCloseTo(155, 0);
  });
});

describe("STOP-LINE MUTE — the ribbon goes quiet over the paint it crosses", () => {
  it("puts exactly ONE quiet span on the northbound leg, over the line it drives across", () => {
    const spans = crossingMuteSpans(northbound, sx.district as never);
    // ON THE OLD BEHAVIOUR THIS WAS []: crossingMuteSpans only ever looked at
    // district.crossings, and sx-v1 has none. This assertion is the one that
    // reds on the pre-2026-08-17 file.
    expect(spans).toHaveLength(1);

    // …and it is over the SOUTH approach's line — the one the northbound
    // student meets — not one of the other three.
    const south = sx.lines.find(
      (l) => l.junctionNodeId === "sx-n-c" && l.graded && l.edgeId === "sx-e-s",
    )!;
    expect(south.dirY).toBeGreaterThan(0.99); // travel = northward, into the box
    const s = nearestArcOnRoute(northbound, south.x, south.y);
    const [a, b] = spans[0]!;
    expect(a).toBeLessThan(s);
    expect(b).toBeGreaterThan(s);

    // ── THE SPAN IS THE PAINT'S OWN FOOTPRINT, AND ON THIS ARM THE PAINT IS
    //    ONE BAR — corrected 2026-08-18.
    //
    // It used to read 10.8 m here, because the mute took the GIVE-WAY depth
    // (the М8 triangles' 8.4 m + 1) off every line whatever its control. This
    // node is `signalized`; `markings.ts` paints its triangles in the
    // `giveWayEdges` branch only, so there is nothing on this approach but
    // 0.8 m of М7 bar — and 9.4 − 1.4 = 8.0 m of the old span was ribbon
    // removed from bare asphalt, which is the „gap with no cause" this
    // function's own guards are written against.
    expect(sx.lines.find((l) => l.edgeId === "sx-e-s" && l.graded)!.control).toBe("trafficLight");
    expect(b - a).toBeCloseTo(STOP_LINE_MUTE_BEFORE_BAR_M + STOP_LINE_MUTE_AFTER_M, 6);
    expect(b - a).toBeCloseTo(2.8, 6);
    // …and the 8 m it stopped taking is exactly the symbol it was measuring.
    expect(STOP_LINE_MUTE_BEFORE_GIVE_WAY_M - STOP_LINE_MUTE_BEFORE_BAR_M).toBeCloseTo(8, 6);
  });

  it("a Б1 give-way arm keeps the deep span — the М18 triangles are really there", () => {
    // THE OTHER DIRECTION, and the one that stops this becoming „mute less
    // everywhere". `jxg-giveway-v1` is the map `sc-jx-giveway-b1` runs on: a
    // junction whose minor arms are give-way controlled, so `markings.ts` DOES
    // paint the symbol and the ribbon must clear all 8.4 m of it.
    const jxg = worldFor("jxg-giveway-v1");
    const giveWay = jxg.lines.filter((l) => l.control === "giveWay");
    expect(giveWay.length, "jxg-giveway-v1 must carry a Б1 arm").toBeGreaterThan(0);
    expect(stopLineMuteBeforeM("giveWay")).toBeCloseTo(9.4, 6);
    expect(stopLineMuteBeforeM("trafficLight")).toBeCloseTo(1.4, 6);
    expect(stopLineMuteBeforeM("stopSign")).toBeCloseTo(1.4, 6);

    // Driven across, on the shipped geometry: the span over that arm's own bar
    // is the give-way one, and it is the only span on the leg.
    const line = giveWay[0]!;
    const route = deriveGuidanceRoute(
      jxg.graph,
      { x: line.x - line.dirX * 60, y: line.y - line.dirY * 60, headingDeg: 0 },
      { kind: "point", x: line.x + line.dirX * 40, y: line.y + line.dirY * 40 },
    );
    expect(route).not.toBeNull();
    const spans = crossingMuteSpans(route!, jxg.district as never);
    const s = nearestArcOnRoute(route!, line.x, line.y);
    const covering = spans.filter(([a, b]) => s >= a && s <= b);
    expect(covering, `no quiet span over the Б1 line at ${line.id}`).toHaveLength(1);
    expect(covering[0]![1] - covering[0]![0]).toBeCloseTo(
      STOP_LINE_MUTE_BEFORE_GIVE_WAY_M + STOP_LINE_MUTE_AFTER_M,
      1,
    );
  });

  it("the leg BEYOND the junction is still drawn — register B24 is not undone", () => {
    // The turn announcement lives past the line. A "fix" that ended the ribbon
    // at the paint would trade the founder's item 11 for his item 9.
    const [, end] = crossingMuteSpans(northbound, sx.district as never)[0]!;
    expect(northbound.totalLen - end).toBeGreaterThan(60);
  });

  it("does not mute for the three lines the student does not drive across", () => {
    // THE OTHER DIRECTION, and the reason each guard exists:
    //  · the OPPOSING arm's line sits on this very corridor (offset ≈ 0 from
    //    the ribbon) but faces the other way — its bars are painted in the
    //    oncoming lane, so a mute there is a gap with no cause. Dropping the
    //    direction test alone turns this file's first assertion into 2 spans.
    //  · the two CROSS arms' lines are a junction's width away laterally.
    const north = sx.lines.find(
      (l) => l.junctionNodeId === "sx-n-c" && l.graded && l.edgeId === "sx-e-n",
    )!;
    expect(north.dirY).toBeLessThan(-0.99); // faces south — the oncoming lane
    // It really is ON the corridor: this is not passing for want of geometry.
    const at = { x: 0, y: 0 };
    const s = nearestArcOnRoute(northbound, north.x, north.y);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(northbound.totalLen);
    routePointAt(northbound, s, at);
    expect(Math.hypot(at.x - north.x, at.y - north.y)).toBeLessThan(1);
    // …and still nothing is muted for it.
    const spans = crossingMuteSpans(northbound, sx.district as never);
    expect(spans.filter(([a, b]) => s >= a && s <= b)).toEqual([]);
  });

  it("leaves a street with no junction alone, and leaves the zebra path exactly as it was", () => {
    // `zb-v1` is one 220 m residential street with two marked crossings and no
    // node of degree ≥ 3 anywhere — so the stop-line pass must contribute
    // nothing and the crossing spans must come back at their old width.
    const zb = worldFor("zb-v1");
    expect(zb.lines).toHaveLength(0);
    const route = deriveGuidanceRoute(
      zb.graph,
      { x: 4.06, y: 5, headingDeg: 0 },
      { kind: "ahead", meters: 200 },
    )!;
    const spans = crossingMuteSpans(route, zb.district as never);
    expect(spans.length).toBeGreaterThan(0);
    for (const [a, b] of spans) {
      expect(b - a).toBeCloseTo(2 * CROSSING_MUTE_HALF_M, 6);
    }
  });

  it("never returns more spans than the shader carries", () => {
    // d2-v1 is the real city map: `sc-ed-d2-priority-run`'s 540 m leg runs
    // through several junctions AND several zebras, which is exactly the case
    // the fixed-size uniform exists for.
    const d2 = worldFor("d2-v1");
    // `sc-edpr-signal`'s own leg: from the Б2 the lesson stops at, 540 m across
    // the district to the signalized junction.
    const route = deriveGuidanceRoute(
      d2.graph,
      { x: -266.12, y: 123.56, headingDeg: 215.3 },
      { kind: "point", x: -516.35, y: -128.17 },
    )!;
    expect(route.totalLen).toBeGreaterThan(300);
    const spans = crossingMuteSpans(route, d2.district as never);
    expect(spans.length).toBeGreaterThan(1);
    expect(spans.length).toBeLessThanOrEqual(CROSSING_MUTE_MAX_SPANS);
    // Sorted, so the consumer can write them straight into the uniform.
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![0]);
    }
  });
});

describe("THE FOUNDER'S FRAME — sc-sig-controller-live's crossing leg", () => {
  it("the leg through the controller's junction now breaks at the line", () => {
    // Reproduced from the lesson itself, at the pose the recorded correct drive
    // is in when `sc-sctl-cross` goes live (t = 10.75 s, y = −39.31): the
    // 84.31 m route whose goalS is 10.00 — three quarters of it the look-ahead
    // leg the founder photographed running through the closed junction.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-sig-controller-live")!;
    const lesson: LessonSpec = compileScenario(spec, 1);
    expect(lesson.world!.districtId).toBe("sx-v1");
    const from = { x: 4.06, y: -39.31 };
    const goal = guidanceGoalFor(lesson, 1, { stopLines: sx.lines, from })!;
    if (goal.kind !== "point") throw new Error("unreachable");
    expect(goal.shape.kind).toBe("gate"); // the passSignal resolved onto the graded line
    const next = guidanceGoalFor(lesson, 2, { stopLines: sx.lines, from: goal })!;
    const route = deriveGuidanceRoute(
      sx.graph,
      { ...from, headingDeg: 0 },
      goal,
      { lookahead: [next] },
    )!;
    expect(route.totalLen).toBeCloseTo(84.31, 1);
    expect(route.goalS).toBeCloseTo(10, 1);

    const spans = crossingMuteSpans(route, sx.district as never);
    expect(spans).toHaveLength(1); // was [] before this fix
    const line = sx.lines.find((l) => l.id === goal.stopLineId)!;
    // The bar's own arclength on this leg, measured rather than assumed.
    // Measured ALONG the corridor (the pose is a lane offset off the
    // centreline the line is anchored on, and that 4.06 m is not arclength).
    const s = line.y - from.y;
    expect(s).toBeCloseTo(11.59, 1);
    const [a, b] = spans[0]!;
    // sx-n-c is signalized, so the mute is the BAR's own footprint — 1.4 m
    // back, 1.4 m past. See the corrected assertion in the first block.
    expect(line.control).toBe("trafficLight");
    expect(a).toBeCloseTo(s - stopLineMuteBeforeM(line.control), 1);
    expect(b).toBeCloseTo(s + STOP_LINE_MUTE_AFTER_M, 1);
    // The 70 m of announcement past the junction survives the change.
    expect(route.totalLen - b).toBeGreaterThan(60);
  });
});
