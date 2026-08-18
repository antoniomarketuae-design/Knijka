/**
 * TITLE-TRUTH AND GATE GEOMETRY — the ROUNDABOUT shelf 2
 * (templates-roundabout2.ts, `sc-rb-ped-exit`).
 *
 * `roundabout-title-truth.test.ts` carries D3 („an objective title may not
 * promise what its gate cannot see") for shelf 1. This file is the same law for
 * shelf 2, plus the half shelf 1 never had to face: this drill's gates are
 * PHYSICAL GAPS — „past the first exit", „between the ring and the paint" — so
 * a title here is true or false by ARITHMETIC, and the arithmetic has to hold
 * on every rung the ladder compiles, not only on the one that was authored.
 *
 * The two defects it pins, both found in sweep 161's frames
 * (.audit-frames/sweep161/sc-rb-ped-exit/) and both measured here rather than
 * argued:
 *
 *  1. THE FIRST-EXIT TAKER COLLECTED «Подмини първия изход и остани в кръга».
 *     The gate was a disc ON the east mouth (18, 0) — the mouth the sentence
 *     forbids taking — and `stepReachZone` credits a PATH THAT CROSSES the disc
 *     (the swept test), so the car that peels off east crosses it on its way
 *     out at exactly the ring pace the correct car does. Both clauses of the
 *     title were false for that drive and it was ticked anyway. Driven below.
 *  2. AT L1 AND L2 THE POCKET GATE WAS NOT IN THE POCKET. `sc-rbp-pocket` is
 *     the whole lesson — 7.94 m of clear tarmac between the circulatory
 *     carriageway (r = 22.06) and the exit zebra (y = 30), one car long — and
 *     the L1/L2 ladder multiplies an authored radius by 1.5 / 1.25
 *     (`DEFAULT_LEVEL_TOLERANCE`, `params.ts widenRadius`) with a budget that
 *     only knows about the NEXT ZONE, never about kerbs or paint. The authored
 *     3.6 became 5.4 at L1, and the disc then reached 1.14 m INTO the ring band
 *     and 1.72 m PAST the zebra: on the beginner rung, a car stopped in the
 *     ring (the fault this template's own teach and examiner notes name) and a
 *     car stopped beyond the crossing (the fault its mistake demo bills as
 *     PEDESTRIAN_NOT_YIELDED) both collected «Спри в джоба между кръга и
 *     пътеката». Driven below, at L1.
 *
 * WHAT THIS FILE DOES NOT CLOSE, so its silence is deliberate. Sweep 161's
 * headline on this lesson — „not one of the three tasks is ticked in any of the
 * four legs; the careful drive is stamped НЕИЗДЪРЖАН 10 т. exactly like the
 * 49 км/ч one" — is not a template defect and no assertion here would move it:
 * the sweep's driver has no steering (`tools/mobile/lesson-audit.mjs` actuates
 * `KeyW` and `KeyS`, and a census of the file returns zero KeyA/KeyD/Arrow
 * tokens), so it leaves the south arm and drives onto the central island, which
 * is where mobile-right/04-t065s photographs it — grass filling the windscreen,
 * the coach card reading «Интервалът беше добър · Изчака 24 с и влезе», and the
 * collision billed five seconds later. Same signature on all three roundabout
 * template files. `s-w6-bot-completion.test.ts` is what says this drill grades:
 * the authored drive completes all three objectives with zero violations at 3★.
 */

import { describe, expect, it } from "vitest";
import { makeTick } from "../../__tests__/fixtures";
import { applyTick, createLessonSession } from "../../engine";
import { REACH_ZONE_HALT_CAP_KMH } from "../../objectives";
import type { LessonSpec } from "../../../contracts";
import { compileScenario } from "../compile";
import { SC_RB_PED_EXIT } from "../templates-roundabout2";
import type { ScenarioLevel } from "../types";

// ---------------------------------------------------------------------------
// rb-ped-v1, by value — the same pins the template and
// world/__tests__/rb-ped-district.test.ts already carry
// ---------------------------------------------------------------------------

/** Ring centerline radius (rb-ped-v1 meta.scenario.params.ringRadiusM). */
const RING_R = 18;
/** Half the drawn ring lane, 8.125 / 2 — the ring band's own half-width. */
const RING_LANE_HALF_M = 8.125 / 2;
/** Outer edge of the circulatory carriageway. (world/__tests__/
 *  rb-ped-district.test.ts pins the same edge to 2 dp as 22.06.) */
const RING_OUTER_EDGE_M = RING_R + RING_LANE_HALF_M;
/** Inner edge — the central island's kerb. */
const RING_INNER_EDGE_M = RING_R - RING_LANE_HALF_M;
/** The exit zebra (rbp-x-n) is a line ACROSS the north arm at y = 30. */
const ZEBRA_Y = 30;
/** The north arm's outbound lane centre. */
const X_ARM_LANE = 4.06;
/** The east mouth on the ring centerline (rbp-n-e) — the exit that is skipped. */
const EAST_MOUTH = { x: RING_R, y: 0 };
/** The north mouth (rbp-n-n) — the exit that is taken. */
const NORTH_MOUTH = { x: 0, y: RING_R };

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

/** A point on the ring at radius `r` and ring angle `deg` (0 = east, CCW). */
function ringPoint(deg: number, r = RING_R): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

interface Zone {
  x: number;
  y: number;
  radiusM: number;
  maxSpeedKmh: number;
  acceptBeforeMarkM?: number;
}

/** The compiled reachZone gate of one objective, after the rung's ladder. */
function gate(lesson: LessonSpec, objectiveId: string): Zone {
  const o = lesson.objectives.find((x) => x.id === objectiveId)!;
  const p = o.params as unknown as Zone;
  return {
    x: p.x,
    y: p.y,
    radiusM: p.radiusM,
    maxSpeedKmh: p.maxSpeedKmh,
    acceptBeforeMarkM: p.acceptBeforeMarkM,
  };
}

const statusOf = (
  s: ReturnType<typeof createLessonSession>,
  objectiveId: string,
): string => s.objectives.find((o) => o.spec.id === objectiveId)!.status;

/** Apply one tick per waypoint, 1 s apart, at the given speed. */
function drive(
  s: ReturnType<typeof createLessonSession>,
  points: ReadonlyArray<readonly [number, number, number]>,
  t0 = 0,
): ReturnType<typeof createLessonSession> {
  let out = s;
  points.forEach(([x, y, speedKmh], i) => {
    out = applyTick(out, makeTick({ t: t0 + i, position: { x, y }, speedKmh })).state;
  });
  return out;
}

/**
 * The approach every drive below shares: spawn on the south arm
 * (rbp-spawn-south, 4.06, −93), ease to the give-way line, and take the ring at
 * lesson pace. The first tick is at the real spawn so `everOutside` latches and
 * nothing is conceded for standing still at the start.
 */
const APPROACH: ReadonlyArray<readonly [number, number, number]> = [
  [X_ARM_LANE, -93, 0],
  [X_ARM_LANE, -60, 14],
  [X_ARM_LANE, -40, 14],
  [X_ARM_LANE, -30, 10],
  [X_ARM_LANE, -24, 4],
  [7.0, -17.5, 10],
  [12.5, -13.5, 12],
  [16.0, -8.0, 12],
];

/** From the east mouth OUT along the east arm — the exit the drill forbids. */
const TAKE_EAST_EXIT: ReadonlyArray<readonly [number, number, number]> = [
  [17.9, -2.0, 12],
  [18.0, 0.0, 12],
  [19.5, 1.0, 12],
  [22.0, 0.5, 12],
  [26.0, -2.0, 12],
  [31.0, -X_ARM_LANE, 14],
  [38.0, -X_ARM_LANE, 16],
];

/** Past the east mouth, round the north-east arc, out to the pocket. */
function stayOnRing(r: number): ReadonlyArray<readonly [number, number, number]> {
  const arc: Array<readonly [number, number, number]> = [];
  for (let deg = -10; deg <= 100; deg += 5) {
    const p = ringPoint(deg, r);
    arc.push([p.x, p.y, 12]);
  }
  return arc;
}

// ---------------------------------------------------------------------------
// 1. «Подмини първия изход и остани в кръга» — the drive that did neither
// ---------------------------------------------------------------------------

describe("the first exit taker does not collect the rung that forbids taking it", () => {
  for (const level of LEVELS) {
    it(`sc-rb-ped-exit @L${level}`, () => {
      const lesson = compileScenario(SC_RB_PED_EXIT, level);
      let s = createLessonSession(lesson);
      s = drive(s, [...APPROACH, ...TAKE_EAST_EXIT]);
      const g = gate(lesson, "sc-rbp-past-east");
      expect(
        statusOf(s, "sc-rbp-past-east"),
        `the drive entered the ring and left by the FIRST (east) exit — it neither ` +
          `passed that exit by nor stayed in the ring — yet the disc at ` +
          `(${g.x}, ${g.y}) r${g.radiusM} credited it. A gate ON the mouth cannot ` +
          `refuse the car that uses the mouth: stepReachZone credits a path that ` +
          `CROSSES the disc, and the peel-off crosses it at the same ring pace the ` +
          `correct car does.`,
      ).not.toBe("done");
    });
  }
});

describe("…and the ring drive still collects it, on every line the carriageway allows", () => {
  // The disc must span the WHOLE circulatory carriageway at its angle, or it
  // manufactures a false failure out of a lane position that is legal: a
  // learner hugging the outer edge (r = 21) and one cutting the island kerb
  // (r = 15) are both still in the ring, and both must be credited.
  for (const r of [RING_R, 21, 15]) {
    it(`sc-rb-ped-exit @L3 · ring line r = ${r}`, () => {
      const lesson = compileScenario(SC_RB_PED_EXIT, 3);
      let s = createLessonSession(lesson);
      s = drive(s, [...APPROACH, ...stayOnRing(r)]);
      expect(statusOf(s, "sc-rbp-past-east")).toBe("done");
    });
  }
});

/**
 * Half the angular width of a disc of radius `r` sitting ON the ring
 * centerline, in degrees — asin(r / R). What the mouth-clearance test needs is
 * the WHOLE disc's span, not its centre's bearing.
 */
const halfSpanDeg = (r: number): number => (Math.asin(r / RING_R) * 180) / Math.PI;

/**
 * Where each mouth's opening in the ring's outer edge ends, in ring angle:
 * atan2(8.125, √(22.06² − 8.125²)) = 21.61°. Inside that wedge a car may be
 * leaving; outside it, it can only be circulating.
 */
const MOUTH_HALF_OPENING_DEG =
  (Math.atan2(8.125, Math.sqrt(RING_OUTER_EDGE_M ** 2 - 8.125 ** 2)) * 180) / Math.PI;

describe("the east gate's geometry says what the title says", () => {
  for (const level of LEVELS) {
    it(`sc-rb-ped-exit @L${level}`, () => {
      const g = gate(compileScenario(SC_RB_PED_EXIT, level), "sc-rbp-past-east");
      // On the ring centerline — the disc is a piece of the circulatory
      // carriageway, not of a mouth.
      expect(Math.hypot(g.x, g.y)).toBeCloseTo(RING_R, 1);
      // …and clear of BOTH openings, disc edge to mouth edge. A gate that
      // overlaps the east opening cannot tell «подмина» from «излезе».
      const centreDeg = (Math.atan2(g.y, g.x) * 180) / Math.PI;
      const span = halfSpanDeg(g.radiusM);
      expect(
        centreDeg - span,
        `L${level}: the disc reaches down to ${(centreDeg - span).toFixed(1)}° of ring ` +
          `angle, inside the east mouth's opening (±${MOUTH_HALF_OPENING_DEG.toFixed(2)}°) — ` +
          `the car that TAKES the first exit crosses it.`,
      ).toBeGreaterThan(MOUTH_HALF_OPENING_DEG);
      expect(centreDeg + span).toBeLessThan(90 - MOUTH_HALF_OPENING_DEG);
      // Both mouths further away than the disc is wide, stated the other way.
      expect(Math.hypot(g.x - EAST_MOUTH.x, g.y - EAST_MOUTH.y)).toBeGreaterThan(g.radiusM);
      expect(Math.hypot(g.x - NORTH_MOUTH.x, g.y - NORTH_MOUTH.y)).toBeGreaterThan(g.radiusM);
    });
  }
});

describe("«остани в кръга» is inscribed in the ring at the rungs that grade it", () => {
  /**
   * At L3-L5 the ladder compiles the authored radius unchanged, and there the
   * disc is exactly a slice of the circulatory carriageway: R ± the ring lane's
   * own half-width = [13.94, 22.06], both kerbs touched, no line favoured. (L1
   * and L2 multiply it by 1.5 / 1.25 and spill onto verge and island kerb —
   * where there is no exit and no lane, which is why the mouth-clearance test
   * above is the one that runs on every rung.)
   */
  for (const level of [3, 4, 5] as const) {
    it(`sc-rb-ped-exit @L${level}`, () => {
      const g = gate(compileScenario(SC_RB_PED_EXIT, level), "sc-rbp-past-east");
      expect(Math.hypot(g.x, g.y) - g.radiusM).toBeGreaterThanOrEqual(RING_INNER_EDGE_M);
      expect(Math.hypot(g.x, g.y) + g.radiusM).toBeLessThanOrEqual(RING_OUTER_EDGE_M);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. «Спри в джоба между кръга и пътеката» — the gate has to BE in the pocket
// ---------------------------------------------------------------------------

describe("the pocket gate fits inside the pocket on every rung the ladder compiles", () => {
  for (const level of LEVELS) {
    it(`sc-rb-ped-exit @L${level}`, () => {
      const g = gate(compileScenario(SC_RB_PED_EXIT, level), "sc-rbp-pocket");
      const rCentre = Math.hypot(g.x, g.y);
      expect(
        rCentre - g.radiusM,
        `L${level}: the disc reaches r = ${(rCentre - g.radiusM).toFixed(2)}, inside the ` +
          `circulatory carriageway's outer edge (${RING_OUTER_EDGE_M}) — «Спри в джоба» ` +
          `would be collected by a car stopped IN THE RING, which is the fault this ` +
          `template's teach and examiner notes exist to name.`,
      ).toBeGreaterThanOrEqual(RING_OUTER_EDGE_M);
      // The far side is cut AT THE PAINT rather than left to the radius
      // arithmetic — at L1 the widened disc stops 0.4 m short of the zebra, a
      // margin the next radius change could spend without noticing. Declaring
      // the boundary also shortens the halt capsule's rear reach from
      // radius + 5 to radius + 1, which is the half that keeps a stop IN THE
      // RING out of the acceptance. `acceptBeforeMarkM` is the signed offset
      // from paint to mark, so it must place the paint exactly on the zebra.
      expect(
        g.acceptBeforeMarkM,
        `L${level}: no paint boundary is declared, so nothing stops the acceptance ` +
          `at the zebra — a car stopped BEYOND the crossing (the drive the mistake ` +
          `demo bills as PEDESTRIAN_NOT_YIELDED) is credited with «Спри в джоба».`,
      ).toBeDefined();
      expect(g.y - g.acceptBeforeMarkM!).toBeCloseTo(ZEBRA_Y, 6);
    });
  }
});

describe("driven: the two stops the pocket rung must refuse", () => {
  /**
   * THE TAUGHT EXIT LINE, taken off the committed shadow itself
   * (content/traces/sc-rb-ped-exit/shadow-correct.trace.json, t 35.9→38.9 s):
   * (7.9, 18.0) → (6.4, 20.7) → (4.9, 23.7) and then the stop. It matters that
   * this is the real line and not a convenient one, because `stepReachGrace`
   * builds its capsule axis from where the car was when it entered the grace
   * ring — so the approach IS an input to the verdict, not scenery.
   */
  const TAUGHT_BLEND: ReadonlyArray<readonly [number, number, number]> = [
    [7.9, 18.0, 12],
    [6.4, 20.7, 10],
    [4.9, 23.7, 8],
  ];
  /**
   * A wider peel — off the ring one exit-width later, at ring angle ~100°.
   * Legal, and it tilts the capsule axis ~41° off the lane, which is what lets
   * a short stop reach further back up the lane than the axis length suggests.
   */
  const WIDE_BLEND: ReadonlyArray<readonly [number, number, number]> = [
    [2.0, 19.0, 10],
    [X_ARM_LANE, 21.0, 8],
  ];

  function driveToPocketThen(
    level: ScenarioLevel,
    blend: ReadonlyArray<readonly [number, number, number]>,
    stop: readonly [number, number],
  ): ReturnType<typeof createLessonSession> {
    const lesson = compileScenario(SC_RB_PED_EXIT, level);
    let s = createLessonSession(lesson);
    s = drive(s, [...APPROACH, ...stayOnRing(RING_R)]);
    s = drive(
      s,
      [...blend, [stop[0], stop[1], 4], [stop[0], stop[1], 0], [stop[0], stop[1], 0]],
      200,
    );
    return s;
  }

  // y = 20.6 on the outbound lane is r = 21.0 — still ON the circulatory
  // carriageway (its outer edge crosses this lane at y = 21.68), i.e. the car
  // is blocking the ring for everyone behind it. That is the act instruction 4,
  // the teach text and the examiner note all name in the student's own words,
  // and it collected «Спри в джоба между кръга и пътеката» on the shipped gate.
  for (const level of LEVELS) {
    it(`a car stopped IN THE RING collects nothing @L${level}`, () => {
      const s = driveToPocketThen(level, TAUGHT_BLEND, [X_ARM_LANE, 20.6]);
      expect(statusOf(s, "sc-rbp-past-east")).toBe("done"); // the ring half WAS driven
      expect(statusOf(s, "sc-rbp-pocket")).not.toBe("done");
    });
  }

  /**
   * THE RESIDUAL, stated rather than hidden. The halt grace is a capsule
   * radius + REACH_ZONE_GRACE_M (5 m) long — against a pocket 7.94 m deep — so
   * on a tilted approach the worst-case reach behind the mark is
   * √(r² + (r + 1)²): 4.16 m at the graded rungs (clear of the ring) but 5.84 m
   * once L1 multiplies the radius by 1.5, which is 1.5 m inside the band. No
   * authored radius closes that without also refusing a car that stopped
   * correctly but 2 m off the lane centre, so the L1/L2 remainder is reported
   * as an objectives.ts row (the capsule cannot see the kerb it is reaching
   * over) rather than papered over here.
   */
  for (const level of [3, 4, 5] as const) {
    it(`…off the taught line too, at the graded rungs @L${level}`, () => {
      const s = driveToPocketThen(level, WIDE_BLEND, [X_ARM_LANE, 20.6]);
      expect(statusOf(s, "sc-rbp-pocket")).not.toBe("done");
    });
  }

  for (const level of LEVELS) {
    it(`a car stopped BEYOND the zebra collects nothing @L${level}`, () => {
      const s = driveToPocketThen(level, TAUGHT_BLEND, [X_ARM_LANE, 31.4]);
      expect(statusOf(s, "sc-rbp-past-east")).toBe("done");
      expect(statusOf(s, "sc-rbp-pocket")).not.toBe("done");
    });
  }

  it("…and the authored pocket stop collects it on every rung, on both lines", () => {
    // Where the committed shadow actually comes to rest (t ≈ 39.9 s): (4.1,
    // 27.0) — nose ~3 m short of the paint, tail ~1.9 m clear of the ring.
    for (const level of LEVELS) {
      for (const blend of [TAUGHT_BLEND, WIDE_BLEND]) {
        const s = driveToPocketThen(level, blend, [4.1, 27.0]);
        expect(statusOf(s, "sc-rbp-pocket"), `L${level}`).toBe("done");
      }
    }
  });

  it("…and so does a correct stop two metres off the lane centre", () => {
    // The false-failure direction of the radius change: the outbound lane is
    // 8.125 m wide, so a car resting at x = 6.0 is untidy but inside its own
    // lane and inside the pocket. Shrinking the disc below ~2 m to chase the
    // L1 residual above would start refusing exactly this.
    for (const level of LEVELS) {
      const s = driveToPocketThen(level, TAUGHT_BLEND, [6.0, 26.0]);
      expect(statusOf(s, "sc-rbp-pocket"), `L${level}`).toBe("done");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The claims that were already true, pinned so they stay true
// ---------------------------------------------------------------------------

describe("«Спри …» keeps the cap that makes it a stop demand", () => {
  /**
   * A halt demand is a cap at or under REACH_ZONE_HALT_CAP_KMH (8) — the band
   * `params.ts widenSpeedCap` refuses to widen on any rung. Raise it above 8
   * and «Спри» starts accepting a rolling car on the one rung where rolling on
   * is how the pedestrian gets hit.
   */
  for (const level of LEVELS) {
    it(`sc-rbp-pocket @L${level}`, () => {
      const objective = SC_RB_PED_EXIT.success.find((o) => o.id === "sc-rbp-pocket")!;
      expect(objective.titleBg).toContain("Спри");
      expect(gate(compileScenario(SC_RB_PED_EXIT, level), "sc-rbp-pocket").maxSpeedKmh)
        .toBeLessThanOrEqual(REACH_ZONE_HALT_CAP_KMH);
    });
  }
});

describe("the exit rung is untouched — its indicator claim is graded by stepRoundabout", () => {
  it("params byte-identical", () => {
    const objective = SC_RB_PED_EXIT.success.find((o) => o.id === "sc-rbp-exit")!;
    expect(objective.params).toEqual({
      kind: "completeManeuver",
      maneuver: "roundabout",
      x: 0,
      y: 0,
      enterRadiusM: 29,
      exitRadiusM: 34,
    });
    // The one title on this shelf that certifies a lever: it is measured, by
    // the ring-signal arm of `stepRoundabout` (objectives.ts B21-RB), which is
    // why it survives the D3 sweep untouched.
    expect(objective.titleBg).toContain("десен мигач");
  });
});
