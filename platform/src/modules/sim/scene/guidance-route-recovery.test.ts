/**
 * THE STUDENT LOSES THE LINE AND NEVER GETS IT BACK — the route-loss repair.
 *
 * THE FRAMES. Sweep w41, `.audit-frames/w41/frames/sc-ed-d2-city-run__mobile-right`,
 * attested against 1f39940567d2, drive ended naturally. A whole-canvas census
 * for the ribbon colour (the harness's own `isRibbonPixel`, applied to the
 * ENTIRE 2556 × 1179 canvas rather than to the guidance band) reads 3,232 px on
 * `04-t018s.png` and **ZERO on all 24 later drive frames**, `04-t042s` through
 * `04-t216s`. The car was still driving — 42 км/ч, gear D, task card up — and
 * the lesson kept asking it to follow a line that was on no part of the glass
 * for another three minutes. Two other legs carry the same shape:
 * `sc-pk-driveway__mobile-right` 9 of 14 drive frames with zero ribbon
 * anywhere, `sc-park-judge__mobile-right` 7 of 12.
 *
 * NOT the camera, NOT the band (the census is whole-canvas), NOT frustum
 * culling (`frustumCulled={false}` plus a 1e6 bounding sphere in
 * `ribbonStrip.ts`), NOT the route ending (676 m driven, tasks still live), NOT
 * material disposal and NOT `uOpacity` (a literal 0.42, never written).
 *
 * WHAT IT IS. `deriveGuidanceRoute` has one production call site — the layout
 * effect in `components/sim/RouteGuidance.tsx` — and that effect is keyed on
 * OBJECTIVE CHANGE. A student who leaves the corridor cannot complete the
 * objective, so the one event that would re-derive their guidance from where
 * they now are is the one event they have locked themselves out of. The ribbon
 * is still drawn, at full alpha, on a quarter-kilometre-distant road.
 *
 * THIS FILE replays that drive's own recorded poses against the real d2-v1
 * graph and the real compiled lesson, under both derivation schedules:
 *
 *   `objective-only`  what shipped — derive on objective change and never again
 *   `route-loss`      the repair    — plus `rerouteDue` / `noteRouteDerived`
 *
 * It then replays the committed SHADOW TRACES — the recorded drives that
 * commit zero violations — to prove the repair cannot fire on a student who is
 * following the line: this lesson's own (2,218 poses over the clean 971 m run)
 * and 24 more chosen to cover every world shape that fired or came close when
 * the rule was measured against all 167 of them. The wiring assertions at the
 * bottom are what stop the policy from becoming another predicate nothing
 * reads.
 *
 * THEO-4 NOTE. This repair never withdraws the ribbon; it restores it. Where a
 * line genuinely cannot exist — the car is off the road NETWORK, measured at
 * 86-100 m from the nearest edge at the two poses where the derivation returns
 * null in this very drive — the student is already told why by the shipped
 * off-road banner («Колата е извън пътя — върни се на платното, за да
 * продължиш», LessonPlayShell, armed by advisor.ts `routeHold === "offRoad"`
 * after ROUTE_HOLD_S). The null-retry branch below is what hands the line back
 * on the first frame a road is reachable again, instead of never.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scenarioLessonById } from "@/modules/sim/lessons/scenario/resolve";
import {
  LOOKAHEAD_MAX_LEGS,
  ROUTE_DIVERGED_LAT_M,
  buildRouteGraph,
  createRouteFollowWatch,
  deriveGuidanceRoute,
  guidanceGoalFor,
  nearestOnRoute,
  noteRouteDerived,
  rerouteDue,
  routeLossApplies,
  stopLinesForGuidance,
  type DerivedRoute,
  type GuidanceGoal,
  type RouteDistrictLike,
  type RouteGraph,
  type RouteHead,
} from "./guidanceRoute";

const LESSON_ID = "sc-ed-d2-city-run@L1";
/** The segment authors its own pose (templates-exam.ts `start`). */
const SPAWN = { x: 795.08, y: -359.73, headingDeg: 327.6 };

/**
 * THE RECORDED WRONG DRIVE — [tSec, districtX, districtY, kmh].
 *
 * Transcribed from `_audit-status.json` → `guidance.samples[]` of the leg named
 * in the header (district y = −wz; consecutive duplicate poses dropped, 132 of
 * 141 kept). `.audit-frames/` is gitignored on purpose — drives certify against
 * the worktree hash — so the evidence is committed here rather than read.
 *
 * The turn that loses the line is at t=24-26 s: «sustained turn: 34.9°
 * confirmed over 2 consecutive same-sign samples». Everything after it is the
 * student driving somewhere else while the ribbon stays on the boulevard.
 */
const WRONG_DRIVE: readonly (readonly [number, number, number, number])[] = [
  [0, 793.71, -357.58, 9],  [3, 791.47, -354.04, 7],  [4, 789.16, -350.4, 15],
  [6, 784.7, -343.38, 27],  [11, 767.45, -316.19, 48],  [14, 762.37, -308.19, 14],
  [16, 761.1, -306.59, 9],  [18, 758.29, -302.93, 17],  [22, 745.2, -295.31, 32],
  [24, 733.77, -289.35, 34],  [26, 729.02, -274.32, 28],  [27, 731.66, -267.11, 26],
  [29, 733.01, -263.41, 26],  [30, 737.19, -251.8, 37],  [31, 740.48, -242.25, 37],
  [33, 742.08, -237.62, 36],  [35, 744.43, -230.11, 32],  [37, 747.52, -220.04, 30],
  [42, 749.67, -213.01, 29],  [49, 761.63, -173.89, 19],  [50, 762.15, -172.1, 0],
  [53, 762.21, -171.9, 3],  [54, 762.99, -169.34, 11],  [57, 765.13, -162.65, 12],
  [58, 766.06, -159.71, 11],  [60, 766.93, -156.97, 10],  [62, 768.05, -153.41, 8],
  [63, 768.71, -151.33, 7],  [64, 769.44, -149.01, 15],  [66, 769.81, -147.85, 0],
  [68, 770.27, -146.38, 7],  [69, 771.42, -142.8, 19],  [71, 772.02, -141.01, 0],
  [74, 772.06, -140.96, 0],  [75, 772.11, -140.91, 0],  [75, 772.15, -140.87, 1],
  [76, 772.23, -140.8, 1],  [79, 772.41, -140.64, 1],  [80, 772.52, -140.53, 0],
  [81, 772.57, -140.49, 1],  [82, 772.68, -140.39, 0],  [84, 772.79, -140.28, 1],
  [85, 772.9, -140.2, 0],  [86, 772.94, -140.16, 0],  [86, 773, -140.1, 0],
  [87, 773.05, -140.05, 1],  [88, 773.15, -139.97, 0],  [90, 773.24, -139.9, 0],
  [91, 773.31, -139.82, 0],  [91, 773.35, -139.78, 0],  [92, 773.41, -139.72, 0],
  [92, 773.45, -139.69, 1],  [94, 773.55, -139.62, 1],  [97, 773.74, -139.43, 0],
  [97, 773.76, -139.44, 0],  [98, 773.75, -139.44, 0],  [99, 773.8, -139.38, 0],
  [99, 773.84, -139.35, 1],  [100, 773.94, -139.24, 1],  [103, 774.09, -139.11, 1],
  [106, 774.15, -139.06, 0],  [111, 785.94, -135.41, 37],  [112, 798.17, -126.01, 31],
  [116, 799.95, -122.01, 0],  [116, 800.03, -121.82, 3],  [117, 800.97, -119.74, 13],
  [119, 802.75, -115.79, 12],  [120, 803.95, -113.11, 11],  [121, 805.04, -110.68, 10],
  [122, 806.08, -108.37, 9],  [123, 806.96, -106.42, 8],  [125, 807.88, -104.37, 6],
  [126, 809.05, -101.78, 14],  [127, 811.43, -96.47, 23],  [128, 814.73, -89.13, 33],
  [129, 818.61, -80.51, 34],  [131, 824.15, -68.18, 42],  [133, 829.04, -57.31, 44],
  [135, 833.8, -46.71, 42],  [137, 842.84, -26.63, 38],  [139, 847.02, -17.33, 36],
  [140, 851.75, -6.8, 43],  [143, 861.17, 14.15, 42],  [145, 865.75, 24.34, 40],
  [146, 869.44, 32.55, 38],  [150, 878.93, 53.65, 35],  [151, 882.63, 61.88, 42],
  [153, 887.3, 72.26, 41],  [154, 889.12, 76.32, 40],  [154, 890.01, 78.29, 23],
  [155, 890.2, 78.71, 0],  [155, 890.19, 78.7, 0],  [156, 890.34, 79.03, 2],
  [157, 891.28, 81.13, 8],  [159, 893.28, 85.55, 18],  [160, 897.14, 94.14, 35],
  [162, 902.78, 106.68, 43],  [163, 907.53, 117.25, 44],  [165, 912.39, 128.07, 43],
  [167, 915.24, 134.41, 25],  [169, 916.3, 136.76, 9],  [170, 917.83, 140.16, 13],
  [171, 919.83, 144.6, 24],  [174, 925.03, 156.18, 24],  [175, 928.4, 163.66, 22],
  [176, 929.28, 165.64, 14],  [178, 929.37, 165.83, 0],  [179, 929.46, 166.04, 3],
  [180, 930.67, 168.71, 12],  [182, 932.3, 172.35, 14],  [184, 934.14, 176.44, 12],
  [185, 935.48, 179.42, 11],  [187, 936.77, 182.29, 10],  [188, 937.88, 184.77, 9],
  [190, 939.31, 187.94, 7],  [191, 940.27, 190.07, 12],  [193, 942.02, 193.96, 14],
  [194, 943.55, 197.37, 13],  [196, 943.92, 198.19, 0],  [197, 944.07, 198.52, 2],
  [199, 945.18, 200.99, 11],  [200, 946.93, 204.9, 14],  [203, 949.12, 209.75, 11],
  [204, 950.44, 212.69, 10],  [205, 951.32, 214.66, 10],  [208, 952.95, 218.28, 8],
  [209, 953.83, 220.23, 7],  [210, 954.75, 222.28, 15],  [213, 957.53, 228.46, 13],
  [214, 959.59, 233.04, 20],  [216, 960.63, 235.35, 0],  [218, 960.73, 235.59, 2],
];

/**
 * Lateral distance past which a ground-hugging 1.4 m strip is not the student's
 * guidance any more, whatever the renderer is doing with it. Deliberately
 * generous: 60 m is more than twice ROUTE_DIVERGED_LAT_M and seven times the
 * 8.125 m perceptual lane, so nothing here turns on where exactly the line
 * stops being readable — only on the difference between "beside the car" and
 * "on another street".
 */
const OFF_CORRIDOR_M = 60;

/**
 * "The line is under me." One perceptual lane of the perceptual carriageway is
 * 8.125 m (runtime/spatial.ts), so 15 m is the car's own lane plus its
 * neighbour — a ribbon that close is on the asphalt in front of the bonnet.
 */
const LINE_UNDER_CAR_M = 15;

interface World {
  graph: RouteGraph;
  objectives: { x: number; y: number; radiusM: number }[];
  goalAt: (i: number, from: { x: number; y: number }) => GuidanceGoal | null;
  chainFor: (
    i: number,
    goal: GuidanceGoal | null,
    from: { x: number; y: number },
  ) => GuidanceGoal[];
}

function loadWorld(): World {
  const district = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../../../public/world/d2-v1.json"),
      "utf8",
    ),
  ) as RouteDistrictLike;
  const graph = buildRouteGraph(district);
  const stopLines = stopLinesForGuidance(district);
  const lesson = scenarioLessonById(LESSON_ID);
  if (!lesson) throw new Error(`missing lesson ${LESSON_ID}`);

  const goalAt = (i: number, from: { x: number; y: number }) =>
    guidanceGoalFor(lesson, i, { stopLines, from });

  // The component's own look-ahead chain (RouteGuidance's `lookahead` memo).
  const chainFor = (
    i: number,
    goal: GuidanceGoal | null,
    from: { x: number; y: number },
  ): GuidanceGoal[] => {
    if (!goal) return [];
    const out: GuidanceGoal[] = [];
    let f = goal.kind === "point" ? { x: goal.x, y: goal.y } : from;
    for (let k = 1; k <= LOOKAHEAD_MAX_LEGS; k += 1) {
      const next = goalAt(i + k, f);
      if (!next || next.kind !== "point") break;
      out.push(next);
      f = { x: next.x, y: next.y };
    }
    return out;
  };

  const objectives = lesson.objectives.map((o) => {
    const p = o.params as { x?: number; y?: number; radiusM?: number };
    if (p.x === undefined || p.y === undefined) {
      throw new Error("this replay assumes coordinate objectives");
    }
    return { x: p.x, y: p.y, radiusM: p.radiusM ?? 12 };
  });

  return { graph, objectives, goalAt, chainFor };
}

interface ReplayResult {
  /** Worst distance from the car to any point of the route it was given. */
  maxLatM: number;
  /** Longest unbroken stretch, in seconds, spent further than OFF_CORRIDOR_M. */
  longestOffCorridorS: number;
  /**
   * Share of the drive spent further than OFF_CORRIDOR_M from the route — the
   * product-side twin of the harness's own «TRACKING: BLIND — ribbon seen on 10
   * of 89 moving samples (11 %)» on this very leg.
   */
  offCorridorFrac: number;
  objectiveDerivations: number;
  lossDerivations: number;
  /** Derivations that produced no route at all. */
  nullDerivations: number;
  /** Derivations that produced a route while the previous state had none. */
  recoveriesFromNull: number;
  /**
   * Derivations whose new route lands UNDER THE CAR (within LINE_UNDER_CAR_M).
   *
   * This is the assertion that connects "a route was re-derived" to "there is
   * teal on the glass", which nothing in a node test can render. A route that
   * starts under the car puts `headS` under the car, and the shader paints
   * `headS − 16 … headS + 120` — the same state that produced a measured
   * 17,509 ribbon px on `sc-pk-driveway/04-t000s.png` and 1,092 px on this
   * lesson's own `04-t000s.png`. A route that starts 140 m away does not.
   */
  derivationsUnderTheCar: number;
  /** Samples on which no route existed at all. */
  noRouteSamples: number;
}

/**
 * Replay a drive through the component's derivation schedule.
 *
 * `withRouteLoss` is the ONLY difference between the two runs, and it calls the
 * shipped `rerouteDue` / `noteRouteDerived` — neuter either of them and the
 * repaired numbers below collapse back onto the broken ones.
 */
function replay(
  world: World,
  poses: readonly (readonly [number, number, number, number])[],
  withRouteLoss: boolean,
): ReplayResult {
  const { graph, objectives, goalAt, chainFor } = world;
  const head: RouteHead = { s: 0, latM: 0 };
  const watch = createRouteFollowWatch();

  let oi = 0;
  let goal = goalAt(0, SPAWN);
  let route: DerivedRoute | null = deriveGuidanceRoute(graph, SPAWN, goal, {
    lookahead: chainFor(0, goal, SPAWN),
  });
  noteRouteDerived(
    watch,
    route ? nearestOnRoute(route, SPAWN.x, SPAWN.y, head).latM : null,
    SPAWN.x,
    SPAWN.y,
    0,
  );

  const out: ReplayResult = {
    maxLatM: 0,
    longestOffCorridorS: 0,
    offCorridorFrac: 0,
    objectiveDerivations: 0,
    lossDerivations: 0,
    nullDerivations: 0,
    recoveriesFromNull: 0,
    derivationsUnderTheCar: 0,
    noRouteSamples: 0,
  };

  let offSinceT: number | null = null;
  let scored = 0;
  let offCorridor = 0;

  // The layout effect's derivation, from the car's own pose (`firstBuildRef`
  // is false for every build after the first). A fresh route starts under the
  // car, so every "how long has this been wrong for" accumulator restarts here
  // — otherwise the repair's own recoveries would be counted as part of the
  // stretch they ended.
  const derive = (x: number, y: number, t: number) => {
    const hadNoRoute = route === null;
    const from = { x, y };
    goal = goalAt(oi, from);
    route = deriveGuidanceRoute(graph, { x, y, headingDeg: 0 }, goal, {
      lookahead: chainFor(oi, goal, from),
    });
    const landedLatM = route ? nearestOnRoute(route, x, y, head).latM : null;
    if (landedLatM === null) out.nullDerivations += 1;
    else {
      if (hadNoRoute) out.recoveriesFromNull += 1;
      if (landedLatM <= LINE_UNDER_CAR_M) out.derivationsUnderTheCar += 1;
    }
    noteRouteDerived(watch, landedLatM, x, y, t);
    offSinceT = null;
  };

  for (const [t, x, y, kmh] of poses) {
    const target = objectives[oi];
    if (target && Math.hypot(x - target.x, y - target.y) <= target.radiusM) {
      oi += 1;
      out.objectiveDerivations += 1;
      derive(x, y, t);
      continue;
    }
    if (oi >= objectives.length) break; // lesson finished — the ribbon stands down by design

    if (withRouteLoss && routeLossApplies(goal)) {
      const latNow = route ? nearestOnRoute(route, x, y, head).latM : null;
      if (rerouteDue(watch, latNow, x, y, kmh, t)) {
        out.lossDerivations += 1;
        derive(x, y, t);
        continue;
      }
    }

    if (!route) {
      out.noRouteSamples += 1;
      scored += 1;
      offCorridor += 1;
      continue;
    }
    nearestOnRoute(route, x, y, head);
    out.maxLatM = Math.max(out.maxLatM, head.latM);
    scored += 1;

    if (head.latM > OFF_CORRIDOR_M) {
      offCorridor += 1;
      if (offSinceT === null) offSinceT = t;
      out.longestOffCorridorS = Math.max(out.longestOffCorridorS, t - offSinceT);
    } else offSinceT = null;
  }
  out.offCorridorFrac = scored === 0 ? 0 : offCorridor / scored;
  return out;
}

// ---------------------------------------------------------------------------

describe("route loss — the recorded drive that lost its line", () => {
  const world = loadWorld();

  it("REPRODUCES the defect: objective-only derivation strands the ribbon", () => {
    const r = replay(world, WRONG_DRIVE, false);

    // Exactly one derivation happens after the spawn: objective 0 completes at
    // t=26 s. Objective 1 is never reached, so nothing derives again — for 190
    // seconds and 583 m of driving.
    expect(r.objectiveDerivations).toBe(1);
    expect(r.lossDerivations).toBe(0);

    // …and the line the student is told to follow ends up half a kilometre away.
    expect(r.maxLatM).toBeGreaterThan(500);
    // Continuously off-corridor for over three minutes.
    expect(r.longestOffCorridorS).toBeGreaterThan(150);
    // Most of the drive is spent with no line anywhere near the car.
    expect(r.offCorridorFrac).toBeGreaterThan(0.7);
  });

  it("REPAIRS it: route loss re-derives from where the student actually is", () => {
    const broken = replay(world, WRONG_DRIVE, false);
    const fixed = replay(world, WRONG_DRIVE, true);

    // The repair fires — and only through the loss path; the objective schedule
    // is untouched (the same single objective completion in both runs).
    expect(fixed.objectiveDerivations).toBe(broken.objectiveDerivations);
    expect(fixed.lossDerivations).toBeGreaterThanOrEqual(6);

    // The student is never again stranded for minutes beside a line on another
    // street. Both bars are far inside what the repair measures (11 loss
    // derivations, worst lateral 167 m, longest off-corridor stretch 21 s) and
    // far outside what the defect produces (0, 555 m, 191 s).
    expect(fixed.maxLatM).toBeLessThan(250);
    expect(broken.maxLatM / Math.max(1, fixed.maxLatM)).toBeGreaterThan(2);
    expect(fixed.longestOffCorridorS).toBeLessThan(45);
    // …and the share of the drive with no line near the car collapses.
    expect(fixed.offCorridorFrac).toBeLessThan(broken.offCorridorFrac / 2);

    // AND THE LINE ARRIVES WHERE THE STUDENT IS, which is the part that puts
    // pixels back on the glass. Measured: of the loss derivations on this
    // drive, four land 0.0-8.3 m from the car — the student is on a road and
    // the ribbon opens under the bonnet. The rest land 29-142 m out, because
    // by then the car is in a field 100 m from the nearest edge and the
    // nearest road IS the honest answer to "which way back". That second kind
    // is not oversold here: the bar counts only the first.
    expect(fixed.derivationsUnderTheCar).toBeGreaterThanOrEqual(3);
    expect(broken.derivationsUnderTheCar).toBeLessThanOrEqual(1);
  });

  it("hands the line back after a stretch where no route could be derived", () => {
    // At t=139 s and t=143 s the car is 100 m and 86 m from the nearest road
    // edge and `deriveGuidanceRoute` returns null — there is no lawful line
    // from out there. The null-retry branch is what stops that from being
    // permanent: without it the FIRST null ends the student's guidance for the
    // rest of the lesson, exactly like the divergence it just fixed.
    const fixed = replay(world, WRONG_DRIVE, true);
    // The stretch is real: at least one derivation genuinely comes back empty…
    expect(fixed.nullDerivations).toBeGreaterThanOrEqual(1);
    // …and the retry is what ends it, rather than the drive ending it.
    expect(fixed.recoveriesFromNull).toBeGreaterThanOrEqual(1);
    // It is a stretch, not a state: the student is not left there.
    expect(fixed.noRouteSamples).toBeLessThan(10);
  });
});

describe("route loss — it must not fire on a student who is following the line", () => {
  const world = loadWorld();

  it("the committed shadow trace never triggers a divergence re-derivation", () => {
    const trace = JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../../../../content/traces/sc-ed-d2-city-run/shadow-correct.trace.json",
        ),
        "utf8",
      ),
    ) as { samples: { tSec: number; x: number; y: number; speedKmh: number }[] };

    const poses = trace.samples.map(
      (s) => [s.tSec, s.x, s.y, s.speedKmh] as [number, number, number, number],
    );
    expect(poses.length).toBeGreaterThan(2000);

    const clean = replay(world, poses, true);
    // THE no-false-positive bar. 2,218 poses over the whole clean 971 m run.
    expect(clean.lossDerivations).toBe(0);
    // And the margin it clears it by: the correct drive peaks at 12.8 m of
    // lateral — that is the boulevard's own lane offset, not a wobble — against
    // a trigger that sits at roughly 12 + ROUTE_DIVERGED_LAT_M.
    expect(clean.maxLatM).toBeLessThan(ROUTE_DIVERGED_LAT_M);
    expect(clean.longestOffCorridorS).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("route loss — the latch itself", () => {
  it("a STATIONARY car never arms it, however far off it is", () => {
    // THE FRAME-ZERO POSE. `scene/vehicleSample.ts` `createVehicleSample()`
    // returns position (0, 0) at 0 km/h and the scene ticks with it before the
    // chassis publishes. On a district whose extent is ~1 km that pose is
    // hundreds of metres "off route" — and `finish.ts`'s B-NEW-1 block is the
    // standing proof of what happens when a gate reads it (one placeholder
    // frame armed the roundabout finish and ended untouched sessions at 40 s).
    // The speed floor is what makes that pose harmless here: it reports 0 km/h
    // and it never moves, so it can never accumulate the sustain.
    const w = createRouteFollowWatch();
    noteRouteDerived(w, 0, 800, -360, 0);
    for (let t = 0; t <= 120; t += 0.5) {
      expect(rerouteDue(w, 500, 0, 0, 0, t)).toBe(false);
    }
  });

  it("needs the divergence SUSTAINED, then re-arms behind a cooldown", () => {
    const w = createRouteFollowWatch();
    noteRouteDerived(w, 2, 0, 0, 0);
    // Inside the trigger: never.
    expect(rerouteDue(w, 2 + ROUTE_DIVERGED_LAT_M - 1, 0, 0, 30, 10)).toBe(false);
    // Past it, but not yet sustained.
    expect(rerouteDue(w, 100, 0, 0, 30, 20)).toBe(false);
    expect(rerouteDue(w, 100, 0, 0, 30, 20.5)).toBe(false);
    // Sustained → fires exactly once…
    expect(rerouteDue(w, 100, 0, 0, 30, 21.5)).toBe(true);
    // …and the same frame's answer is not repeatable: the cooldown is stamped
    // by the call itself, so a caller cannot double-fire before the new route
    // lands.
    expect(rerouteDue(w, 100, 0, 0, 30, 21.6)).toBe(false);
    expect(rerouteDue(w, 100, 0, 0, 30, 23)).toBe(false);
    // Past the cooldown, still lost and still moving → fires again IMMEDIATELY:
    // the sustain clock keeps running during the cooldown on purpose, so an
    // excursion that began inside it does not have to start counting over.
    expect(rerouteDue(w, 100, 0, 0, 30, 25)).toBe(true);
    // Back on the line clears the latch outright.
    expect(rerouteDue(w, 3, 0, 0, 30, 40)).toBe(false);
    expect(w.offSinceS).toBeNull();
  });

  it("retries a null route only for a car that has actually moved", () => {
    const w = createRouteFollowWatch();
    noteRouteDerived(w, null, 100, 100, 0);
    // Parked on a lot with no derivable route (every `sc-park-*` correct drive
    // spends most of its poses here): creeping about does not re-run the graph
    // search over and over.
    expect(rerouteDue(w, null, 102, 100, 4, 10)).toBe(false);
    expect(rerouteDue(w, null, 104, 101, 4, 20)).toBe(false);
    // Driving back toward the network does.
    expect(rerouteDue(w, null, 130, 100, 40, 30)).toBe(true);
  });

  it("stands down where it must not act", () => {
    // Nothing to route to — the ribbon is standing down by design. This is
    // also the clause that keeps the repair out of an EXAM: A13 makes
    // LessonPlayShell pass the all-done objective index unconditionally in
    // exam mode, so the goal is null and no route loss can resurrect a ghost
    // route the examiner's student is not supposed to have.
    expect(routeLossApplies(null)).toBe(false);
    // An odometer corridor is ordinary: it re-derives like any other.
    expect(routeLossApplies({ kind: "ahead", meters: 80 })).toBe(true);

    // …and the exemption is checked against the REAL shipped roundabout goal,
    // not a hand-built stand-in: `sc-roundabout-entry` objective 1 is the
    // «Кръгово движение» maneuver, whose `leaveRadiusM` is what tells route
    // derivation that (x, y) is an ISLAND. Build it the way the component does.
    const rb = scenarioLessonById("sc-roundabout-entry@L1");
    expect(rb).toBeTruthy();
    const rbDistrict = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../../../../public/world/rb-mini-v1.json"),
        "utf8",
      ),
    ) as RouteDistrictLike;
    const approach = guidanceGoalFor(rb!, 0, {
      stopLines: stopLinesForGuidance(rbDistrict),
      from: { x: 0, y: -60 },
    });
    const ring = guidanceGoalFor(rb!, 1, {
      stopLines: stopLinesForGuidance(rbDistrict),
      from: { x: 0, y: -30 },
    });
    // The approach leg is an ordinary reachZone and stays covered…
    expect(approach?.kind).toBe("point");
    expect(routeLossApplies(approach)).toBe(true);
    // …the ring itself is the one that must not be re-derived from inside it.
    expect(ring?.kind).toBe("point");
    expect(ring !== null && ring.kind === "point" ? ring.leaveRadiusM : undefined).toBeGreaterThan(
      0,
    );
    expect(routeLossApplies(ring)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE WHOLE CORPUS OF RECORDED CORRECT DRIVES
// ---------------------------------------------------------------------------
//
// One lesson proves the repair; it does not prove the repair is safe. This
// block replays the committed `shadow-correct` traces — the recorded drives
// that commit ZERO violations — through the same rule, and requires the rule to
// stay silent on all of them bar a named, counted list.
//
// It was RUN OVER ALL 167 first, which is how the exemptions above were chosen
// rather than guessed. The scenarios below are the subset that matters: every
// one that fired, every one that came within 9 m of firing, one per world
// shape, and a spread of ordinary lessons. Running all 167 costs ~40 MB of JSON
// on a 7200 rpm disk and belongs in a sweep, not in the unit suite.
const CORRECT_DRIVE_BUDGET: Record<string, number> = {
  // THE ONE REAL FIRING, and it is not sloppy driving. `sc-ed-poligon-chain`
  // gets 126.5 m from its own guidance line on its CORRECT drive, because a
  // manoeuvring ground's 20 graph edges are not where the exercise happens.
  // That is a defect of this same family which this repair does NOT fix; the
  // three firings each move the line closer to the student. Pinned so it
  // cannot grow quietly.
  "sc-ed-poligon-chain": 3,
  // The two motorway merges reach the NULL branch, not the divergence one —
  // their max lateral is only 8.2 m. `deriveGuidanceRoute` returns null on 282
  // and 368 poses of their CORRECT drives, and on `sc-merge-accel-lane` it
  // returns null for ALL THREE objectives straight from the spawn: that lesson
  // ships with no guidance line at any point, which is a separate pre-existing
  // hole this change does not close. The retries here are therefore fruitless;
  // they are also 0.01 ms each on a 5-edge graph, and the move gate holds them
  // to one per 8 m travelled.
  "sc-merge-accel-lane": 4,
  "sc-merge-motorway-exit": 2,
};

/** Every shape that fired or came close, plus ordinary lessons for contrast. */
const CORPUS = [
  // roundabouts — the ring exemption's whole reason for existing
  "sc-roundabout-entry", "sc-rb-circulate-priority", "sc-rb-exit-signal",
  "sc-rb-lane-choice", "sc-rb-ped-exit", "sc-rb-busy-gap",
  // the named exceptions
  "sc-ed-poligon-chain", "sc-merge-accel-lane", "sc-merge-motorway-exit",
  // parking: null routes are normal there, and the move gate must hold them.
  // `sc-pk-driveway` and `sc-park-judge` are the two OTHER legs the sweep found
  // blind (9 of 14 and 7 of 12 drive frames with zero ribbon anywhere), and
  // they are here to show that the divergence rule is NOT their fix: neither
  // ever triggers it, because `sc-pk-driveway`'s correct drive never gets
  // further than 6.5 m from its own route. Their zeros come from
  // `deriveGuidanceRoute` returning null (267 of its poses) as the car closes
  // on the bay — a different defect, in a different part of this file, that
  // this change deliberately does not touch.
  "sc-park-left", "sc-park-parallel", "sc-pk-driveway", "sc-park-45-rev",
  "sc-park-judge",
  // the real OSM cuts, and the widest ordinary lateral in the corpus
  "sc-ed-d2-city-run", "sc-ed-d2-priority-run", "sc-ln-turn-lane-arrows",
  "sc-maneuver-uturn", "sc-mv-uturn-ban",
  // ordinary lessons across families
  "sc-turn-left-oncoming", "sc-junction-stop", "sc-zebra-approach",
  "sc-vu-cyclist-hook", "sc-ov-oncoming-gap", "sc-follow-distance",
] as const;

describe("route loss — every recorded correct drive in the corpus", () => {
  const WORLD_DIR = path.resolve(__dirname, "../../../../public/world");
  const TRACE_DIR = path.resolve(__dirname, "../../../../../content/traces");
  const graphs = new Map<string, RouteGraph>();
  const stops = new Map<string, ReturnType<typeof stopLinesForGuidance>>();

  for (const scen of CORPUS) {
    it(`${scen} stays within its budget`, () => {
      const lesson = scenarioLessonById(`${scen}@L1`);
      expect(lesson, `no L1 lesson for ${scen}`).toBeTruthy();
      const districtId = (lesson as { world?: { districtId?: string } }).world?.districtId;
      expect(districtId, `no districtId for ${scen}`).toBeTruthy();

      if (!graphs.has(districtId!)) {
        const district = JSON.parse(
          fs.readFileSync(path.join(WORLD_DIR, `${districtId}.json`), "utf8"),
        ) as RouteDistrictLike;
        graphs.set(districtId!, buildRouteGraph(district));
        stops.set(districtId!, stopLinesForGuidance(district));
      }
      const graph = graphs.get(districtId!)!;
      const stopLines = stops.get(districtId!)!;
      const trace = JSON.parse(
        fs.readFileSync(path.join(TRACE_DIR, scen, "shadow-correct.trace.json"), "utf8"),
      ) as { samples: { tSec: number; x: number; y: number; headingDeg: number; speedKmh: number }[] };
      expect(trace.samples.length).toBeGreaterThan(50);

      // The trace's own first pose IS the spawn the component would be handed.
      const s0 = trace.samples[0];
      const spawn = { x: s0.x, y: s0.y, headingDeg: s0.headingDeg };
      const goalAt = (i: number, from: { x: number; y: number }) =>
        guidanceGoalFor(lesson!, i, { stopLines, from });
      const chainFor = (i: number, goal: GuidanceGoal | null, from: { x: number; y: number }) => {
        if (!goal) return [];
        const out: GuidanceGoal[] = [];
        let f = goal.kind === "point" ? { x: goal.x, y: goal.y } : from;
        for (let k = 1; k <= LOOKAHEAD_MAX_LEGS; k += 1) {
          const next = goalAt(i + k, f);
          if (!next || next.kind !== "point") break;
          out.push(next);
          f = { x: next.x, y: next.y };
        }
        return out;
      };

      const head: RouteHead = { s: 0, latM: 0 };
      const watch = createRouteFollowWatch();
      let oi = 0;
      let goal = goalAt(0, spawn);
      let route: DerivedRoute | null = deriveGuidanceRoute(graph, spawn, goal, {
        lookahead: chainFor(0, goal, spawn),
      });
      const stamp = (x: number, y: number, t: number) =>
        noteRouteDerived(
          watch,
          route ? nearestOnRoute(route, x, y, head).latM : null,
          x,
          y,
          t,
        );
      stamp(spawn.x, spawn.y, 0);

      const objs = lesson!.objectives.map(
        (o) => o.params as { x?: number; y?: number; radiusM?: number },
      );
      let fired = 0;
      for (const s of trace.samples) {
        const p = objs[oi];
        if (p?.x !== undefined && p.y !== undefined) {
          if (Math.hypot(s.x - p.x, s.y - p.y) <= (p.radiusM ?? 12)) {
            oi += 1;
            goal = goalAt(oi, { x: s.x, y: s.y });
            route = deriveGuidanceRoute(graph, { x: s.x, y: s.y, headingDeg: 0 }, goal, {
              lookahead: chainFor(oi, goal, { x: s.x, y: s.y }),
            });
            stamp(s.x, s.y, s.tSec);
            continue;
          }
        }
        if (oi >= objs.length) break;
        if (!routeLossApplies(goal)) continue;
        const lat = route ? nearestOnRoute(route, s.x, s.y, head).latM : null;
        if (rerouteDue(watch, lat, s.x, s.y, s.speedKmh, s.tSec)) {
          fired += 1;
          goal = goalAt(oi, { x: s.x, y: s.y });
          route = deriveGuidanceRoute(graph, { x: s.x, y: s.y, headingDeg: 0 }, goal, {
            lookahead: chainFor(oi, goal, { x: s.x, y: s.y }),
          });
          stamp(s.x, s.y, s.tSec);
        }
      }
      expect(fired).toBeLessThanOrEqual(CORRECT_DRIVE_BUDGET[scen] ?? 0);
    });
  }
});

// ---------------------------------------------------------------------------
// THE CONSUMER
// ---------------------------------------------------------------------------
//
// 51 of 82 audited repairs in this tree shipped a predicate NOTHING live reads.
// A route-loss policy that RouteGuidance never calls, or a `rerouteSeq` that is
// not in the layout effect's dependency array, is that failure exactly: the
// numbers above would still be green and the student would still lose the line.
// Same file-reading shape as `routeGuidanceSignLegibility.test.ts` next door.

describe("the route-loss policy is wired to the renderer", () => {
  // CRLF-normalised: this worktree checks out with \r\n and the tree stores \n,
  // and a multi-line source pin that forgets that fails as if the code were
  // wrong. (Same trap that has bitten source-pinned tests in this repo before.)
  const src = fs
    .readFileSync(path.resolve(__dirname, "../../../components/sim/RouteGuidance.tsx"), "utf8")
    .replace(/\r\n/g, "\n");

  const frameBody = (() => {
    const start = src.indexOf("useFrame((state) => {");
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("\n  return (\n    <group>", start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  })();

  it("useFrame asks whether the route still serves the car, and acts on the answer", () => {
    // Pinned as a STRUCTURE, not as a token. `toContain("rerouteDue(")` alone
    // is satisfied by `false && rerouteDue(…)` — a mutant that unhooks the
    // consumer while leaving the word in place, which is the exact shape of
    // the dead-predicate failure this block exists to prevent.
    expect(frameBody).toMatch(
      /\n {4}if \(\n {6}routeLossApplies\(goalNow\) &&\n {6}rerouteDue\(\n {8}watchRef\.current,\n/,
    );
    expect(frameBody).toMatch(/\n {6}\)\n {4}\) \{\n {6}setRerouteSeq\(\(n\) => n \+ 1\);\n {4}\}\n/);
    // It must measure the LIVE pose, not the route's own geometry.
    expect(frameBody).toContain(
      "nearestOnRoute(route, sample.position.x, sample.position.y, head)",
    );
    // …and hand the policy the live pose and speed, not the route's.
    expect(frameBody).toMatch(/\n {8}sample\.position\.x,\n {8}sample\.position\.y,\n {8}sample\.speedKmh,\n/);
  });

  it("the no-route branch runs BEFORE the frame gives up on a null route", () => {
    // `if (!route || !ribbonMat) return;` used to be the first thing this loop
    // did, which is why a single null derivation was permanent.
    const askedAt = frameBody.indexOf("rerouteDue(");
    const bailedAt = frameBody.indexOf("if (!route || !ribbonMat) return;");
    expect(askedAt).toBeGreaterThan(0);
    expect(bailedAt).toBeGreaterThan(0);
    expect(askedAt).toBeLessThan(bailedAt);
    // …and it must be allowed to answer with "there is no route at all".
    expect(frameBody).toContain("route ? head.latM : null");
  });

  it("the derivation effect re-runs on route loss and re-arms the latch", () => {
    const effectStart = src.indexOf("useLayoutEffect(() => {");
    expect(effectStart).toBeGreaterThan(0);
    const effectEnd = src.indexOf("useFrame((state) => {", effectStart);
    const effect = src.slice(effectStart, effectEnd);
    expect(effect).toContain("deriveGuidanceRoute(graph, start, goal, { lookahead })");
    expect(effect).toContain("noteRouteDerived(");
    // The property the whole replay above assumes, and the one that makes a
    // re-derivation worth anything: every build after the first starts from the
    // CAR, not from the spawn. Re-deriving to the same abandoned corridor would
    // satisfy every count in this file and change nothing on the glass.
    expect(effect).toContain(
      "firstBuildRef.current || !sample\n        ? spawnStart\n        : { x: sample.position.x, y: sample.position.y, headingDeg: sample.headingDeg }",
    );
    // The dependency that makes the whole repair executable.
    expect(effect).toMatch(/\n {4}rerouteSeq,\n {2}\]\);/);
  });
});
