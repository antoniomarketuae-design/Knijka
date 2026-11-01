/**
 * LANE ENDINGS (2026-10-18) — three rows that end a drive on the same block of
 * `engine.ts`, built as one design (integrator rulings E1 / E2 / E3):
 *
 *   · sc-crossing-dart:1c7a07d8 («rescueladder») — gate 1 (`routeFinishZone`)
 *     ended a stalled chain half a second inside the ladder-widened ring, up to
 *     11 m short of the mark and still rolling, on «Стигна края на маршрута».
 *     Now gate 1 ARMS the ending and the stalled run-out decides it: the arrival
 *     sentence only on an arrival (ROUTE_RUNOUT_ARRIVE_M, or past the mark),
 *     otherwise one non-arrival sentence (`openTasksEndingCopy`) at rest or when
 *     the run-out is spent. Both of gate 1's arms (an earlier task open; the
 *     terminal unearnable).
 *   · sc-hz-brake-dont-swerve:870904d4 — a car standing still with an
 *     UNEARNABLE terminal outside gate 1's disc had no ending at all. Now a full
 *     standstill there ends the drive after FINISH_STUCK_S, on the same
 *     non-arrival sentence.
 *   · sc-pk-driveway:7fa8b79e («pinfree») — the crash pin's ending said the car
 *     was «притисната… и не може да продължи» of a car standing free. Now one
 *     wording true of a pressed and a free car (`crashPinEndingCopy`), and the
 *     route hold's banner lead / card / peek are conditional (no chip).
 *
 * Engine-level here (applyTick on synthetic and compiled lessons); the product
 * chassis drives are `scenario/__tests__/endings-chassis.test.ts`, and the
 * catalogue census of stalled chains is in `route-runout.test.ts`.
 */
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { objectiveTitleUnderHold } from "../../../../components/sim/lesson-ui/LessonPlayShell";
import { advisorPromptForSession, routeHoldAdvisorPrompt, routeHoldForSession, routeHoldWayOutForSession } from "../advisor";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  CRASH_PIN_STUCK_S,
  FINISH_STANDSTILL_KMH,
  FINISH_STUCK_S,
  ROUTE_RUNOUT_ARRIVE_M,
  ROUTE_RUNOUT_MAX_S,
  UNEARNABLE_STANDSTILL_S,
  armRouteFinishRunOut,
  CRASH_PIN_END_TOUCH_M,
  CRASH_PIN_WAY_CLEAR_M,
  crashPinClearEnds,
  crashPinContactEnd,
  crashPinCorrective,
  crashPinEndingCopy,
  crashPinImpact,
  crashPinWayOut,
  openTasksEndingCopy,
  routeApproachFrom,
  routeEndMark,
  routeFinishZone,
  stepRouteFinishRunOut,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M, SWEEP_RESOLUTION_M } from "../../collision";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../scenario/templates-hazards2";
import type { LessonSessionState } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

const ARRIVAL = "Стигна края на маршрута";
const STOPPED_AT_END = "Спря в края на маршрута";
const LESSON_END = "Край на маршрута";
const EXAM_END = "Край на изпитния маршрут";

interface Said {
  t: number;
  titleBg: string;
  text: string;
}
interface Drive {
  s: LessonSessionState;
  said: Said[];
  endedAtX: number | null;
}

/** Feed ticks; collect every `lesson` card. */
function feed(start: LessonSessionState, ticks: SimTick[]): Drive {
  let s = start;
  const said: Said[] = [];
  let endedAtX: number | null = null;
  for (const tick of ticks) {
    const before = s.phase;
    const r = applyTick(s, tick);
    s = r.state;
    for (const h of r.hudEvents) {
      // Endings only: the coach's objective notices ride the same `lesson` kind.
      if (h.kind === "lesson" && /^Край/u.test(h.titleBg ?? "")) said.push({ t: tick.t, titleBg: h.titleBg ?? "", text: (h as { explanationBg?: string }).explanationBg ?? "" });
    }
    if (before === "driving" && s.phase !== "driving" && endedAtX === null) endedAtX = tick.position.x;
  }
  return { s, said, endedAtX };
}

// ───────────────────────────────────────────────────────────────────────────
// §1 · E1 on a hand-built route: the earlier task is OPEN (the stalled chain)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Task 1 sits 30 m off the road, so a car on y = 0 never reaches it and the
 * chain stalls on it. The route ends at (100, 0), ring 10 (the clamp — half of
 * 67 m to task 1 — does not bind), so gate 1 is armed from x = 90 and latches
 * half a second later.
 */
const STALL: LessonSpec = {
  id: "t-endings-stall",
  order: 99,
  titleBg: "Тест на края",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 90 },
  preDrive: false,
  objectives: [
    { id: "o-1", titleBg: "Първа точка", kind: "reachZone", params: { x: 40, y: 30, radiusM: 4 } },
    { id: "o-2", titleBg: "Край", kind: "reachZone", params: { x: 100, y: 0, radiusM: 10 } },
  ],
};
const STALL_EXAM: LessonSpec = { ...STALL, id: "t-endings-stall-exam", examMode: true };

/** Along y = 0 at `kmh`, 0.1 s ticks, from `x0` until `x1` (inclusive-ish). */
function along(x0: number, x1: number, kmh: number, t0: number, dt = 0.1): SimTick[] {
  const out: SimTick[] = [];
  const step = (kmh / 3.6) * dt;
  let t = t0;
  for (let x = x0; x <= x1 + 1e-9; x += step) {
    out.push(makeTick({ t, speedKmh: kmh, maxSpeedKmh: 130, position: { x, y: 0 }, headingDeg: 90 }));
    t += dt;
  }
  return out;
}
const lastT = (ticks: SimTick[]) => ticks[ticks.length - 1].t;
const still = (x: number, t0: number, n: number, dt = 0.1, speedKmh = 0): SimTick[] =>
  Array.from({ length: n }, (_, i) =>
    makeTick({ t: t0 + i * dt, speedKmh, maxSpeedKmh: 130, position: { x, y: 0 }, headingDeg: 90 }),
  );

describe("E1 — a stalled chain (an earlier task open) ends AT its end, or says it did not", () => {
  it("THE FIXTURE: gate 1's ring is the terminal's 10 m, and the chain is stalled on task 1", () => {
    const zone = routeFinishZone(STALL.objectives.map(parseObjectiveParams));
    expect(zone?.radiusM).toBe(10);
    const d = feed(createLessonSession(STALL), along(0, 80, 40, 0));
    expect(d.s.objectives.map((o) => o.status)).toEqual(["active", "pending"]);
  });

  it("DRIVING THROUGH: the latch no longer ends the drive in the ring — it ends at the mark, on the arrival sentence", () => {
    const d = feed(createLessonSession(STALL), along(0, 130, 40, 0));
    expect(d.s.phase).toBe("completed");
    // BASE: ended at the latch, x ≈ 95.6 (4.4 m short, rolling at 40 km/h).
    expect(d.endedAtX!).toBeGreaterThanOrEqual(100 - ROUTE_RUNOUT_ARRIVE_M);
    const end = d.said.filter((x) => x.titleBg === LESSON_END);
    expect(end).toHaveLength(1);
    expect(end[0].text).toContain(ARRIVAL);
    expect(d.s.routeFinishRunOut?.arm).toBe("earlierTaskOpen");
    // Graded nothing: the open task is still open and the drive failed.
    const r = buildLessonResult(d.s);
    expect(r.objectives.map((o) => o.done)).toEqual([false, false]);
    expect(r.completedAll).toBe(false);
  });

  it("AT REST 6 m SHORT: ends where it stopped, on the non-arrival sentence — never «Стигна края»", () => {
    const a = along(0, 94, 40, 0);
    const d = feed(createLessonSession(STALL), [...a, ...still(94, lastT(a) + 0.1, 20)]);
    expect(d.s.phase).toBe("completed");
    expect(d.endedAtX).toBe(94);
    expect(d.said).toEqual([{ t: d.s.endedAtSec, titleBg: LESSON_END, text: openTasksEndingCopy(false).explanationBg }]);
    expect(d.said[0].text).not.toContain(ARRIVAL);
    expect(d.said[0].text).not.toContain(STOPPED_AT_END);
  });

  it("…and on an exam rung, under the exam's own title", () => {
    const a = along(0, 94, 40, 0);
    const d = feed(createLessonSession(STALL_EXAM), [...a, ...still(94, lastT(a) + 0.1, 20)]);
    expect(d.s.phase).toBe("completed");
    const end = d.said.filter((x) => x.titleBg === EXAM_END);
    expect(end).toHaveLength(1);
    expect(end[0].text).toBe(openTasksEndingCopy(true).explanationBg);
    expect(end[0].text).not.toContain(ARRIVAL);
  });

  it("SPENT: a car that rolls on and never gets there is let out at ROUTE_RUNOUT_MAX_S, on the non-arrival sentence", () => {
    const a = along(0, 97, 40, 0);
    let d = feed(createLessonSession(STALL), a);
    expect(d.s.phase).toBe("driving");
    expect(d.s.routeFinishRunOut).toBeDefined();
    const armedAt = d.s.finishGate!.reachedAtSec!;
    // Rolling at 6 km/h with the pose not advancing: neither arrival nor rest.
    d = feed(d.s, still(97, lastT(a) + 0.1, 400, 0.1, 6));
    expect(d.s.phase).toBe("completed");
    expect(d.s.endedAtSec! - armedAt).toBeGreaterThanOrEqual(ROUTE_RUNOUT_MAX_S - 0.11);
    expect(d.s.endedAtSec! - armedAt).toBeLessThanOrEqual(ROUTE_RUNOUT_MAX_S + 0.11);
    expect(d.said.map((x) => x.text)).toEqual([openTasksEndingCopy(false).explanationBg]);
  });

  it("FROZEN: a lawful wait inside the run-out does not end the drive; the same standstill does once the walker is off the paint", () => {
    const a = along(0, 97, 40, 0);
    let d = feed(createLessonSession(STALL), a);
    expect(d.s.routeFinishRunOut).toBeDefined();
    let t = lastT(a) + 0.1;
    const ped: SimTick["events"] = [{ kind: "crossingZoneEntered", crossingId: "x-1", pedestrianOnCrossing: true }];
    const wait: SimTick[] = [];
    for (let i = 0; i < 300; i++, t += 0.1) {
      wait.push(tickWithEvents(t, i === 0 ? ped : [], { speedKmh: 0, maxSpeedKmh: 130, position: { x: 97, y: 0 }, headingDeg: 90 }));
    }
    d = feed(d.s, wait);
    expect(d.s.yieldWait?.holding).toBe(true);
    expect(d.s.phase).toBe("driving");
    d = feed(d.s, [tickWithEvents(t, [{ kind: "crossingZoneExited", crossingId: "x-1" }], { speedKmh: 0, maxSpeedKmh: 130, position: { x: 97, y: 0 }, headingDeg: 90 })]);
    expect(d.s.phase).toBe("completed");
    expect(d.said.map((x) => x.text)).toEqual([openTasksEndingCopy(false).explanationBg]);
  });

  it("THE CHAIN IS FROZEN on the latch frame: a task that would complete on the added road is not ticked, and nothing passes", () => {
    // Task 1 is placeless (97 m of driving), so on base the drive ended at the
    // latch with it open at ~95.6 m; driven on, it would fall due at 97 m and
    // the terminal — the car is inside its ring — would tick on the same frame.
    const lesson: LessonSpec = {
      ...STALL,
      id: "t-endings-frozen",
      objectives: [
        { id: "o-1", titleBg: "Измини 97 метра", kind: "driveDistance", params: { meters: 97 } },
        { id: "o-2", titleBg: "Край", kind: "reachZone", params: { x: 100, y: 0, radiusM: 10 } },
      ],
    };
    const d = feed(createLessonSession(lesson), along(0, 130, 40, 0));
    expect(d.s.phase).toBe("completed");
    expect(d.s.routeFinishRunOut?.arm).toBe("earlierTaskOpen");
    const r = buildLessonResult(d.s);
    expect(r.objectives.map((o) => o.done), "a task ticked on the run-out's added road").toEqual([false, false]);
    expect(r.completedAll).toBe(false);
    expect(d.said.filter((x) => x.titleBg === LESSON_END).map((x) => x.text.startsWith(ARRIVAL))).toEqual([true]);
  });

  it("no frame of any of these drives shows «Стигна края» more than ROUTE_RUNOUT_ARRIVE_M short of the mark", () => {
    for (const stopAt of [91, 92.5, 94, 96, 97.4, 97.6, 99, 100, 104]) {
      const a = along(0, stopAt, 40, 0);
      const d = feed(createLessonSession(STALL), [...a, ...still(stopAt, lastT(a) + 0.1, 20)]);
      expect(d.s.phase, `stop at ${stopAt}`).toBe("completed");
      const arrived = d.said.some((x) => x.text.includes(ARRIVAL));
      const shortM = 100 - d.endedAtX!;
      expect(arrived, `stop at ${stopAt}: ${shortM.toFixed(2)} m short`).toBe(shortM <= ROUTE_RUNOUT_ARRIVE_M);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §2 · sc-hz-brake-dont-swerve — the TERMINAL made unearnable (E1's other arm, E2)
// ───────────────────────────────────────────────────────────────────────────

const LANE_X = 4.06;
const MARK = { x: 4.06, y: 184 };
/** The car centre with its nose on the debris block's near face (stop-short-of-named-body.test.ts). */
const NOSE_ON_Y = 186.78;
const at = (y: number, speedKmh: number, t: number, hit?: "staticObject", x = LANE_X, extra: Partial<SimTick> = {}): SimTick =>
  makeTick({
    t,
    position: { x, y },
    headingDeg: 0,
    speedKmh,
    ...(hit ? { events: [{ kind: "collision" as const, withWhat: hit }] } : {}),
    ...extra,
  });
/** 45 км/ч up the lane, through task 1, to `toY`. */
const approach = (toY: number): SimTick[] => {
  const out: SimTick[] = [];
  let t = 0;
  for (let y = 60; y <= toY; y += 3) out.push(at(y, 45, (t += 0.24)));
  return out;
};
const hz = (level: 1 | 3) => compileScenario(SC_HZ_BRAKE_DONT_SWERVE, level);
const LEVELS = [1, 3] as const;

describe("E1, the terminal-unearnable arm — sc-hz-brake-dont-swerve after the block is touched", () => {
  for (const level of LEVELS) {
    it(`L${level}: nose on the block (past the mark, within 2.8 m) — still ends half a second after the contact, on «Стигна края» (unchanged)`, () => {
      const a = approach(183);
      const t0 = lastT(a);
      const ticks = [
        ...a,
        at(NOSE_ON_Y, -3.8, t0 + 1 / 60, "staticObject"),
        ...Array.from({ length: 120 }, (_, i) => at(NOSE_ON_Y - 0.017 * (i + 1), Math.min(0, -3.8 + 0.04 * i), t0 + (i + 2) / 60)),
      ];
      const d = feed(createLessonSession(hz(level)), ticks);
      expect(d.s.phase).toBe("completed");
      expect(d.s.endedAtSec! - (t0 + 1 / 60)).toBeCloseTo(0.5, 6);
      expect(d.said.map((x) => x.titleBg)).toEqual([LESSON_END]);
      expect(d.said[0].text).toContain(ARRIVAL);
    });

    it(`L${level}: touched, then BACK down the road and at rest inside the 9 m disc, 5 m short and not past — ends AT REST on the non-arrival sentence`, () => {
      const a = approach(183);
      const t0 = lastT(a);
      const ticks = [
        ...a,
        at(NOSE_ON_Y, -3.8, t0 + 1 / 60, "staticObject"),
        // Reversing at 12 km/h — above the gate's 6 km/h cap, so its dwell cannot run.
        ...Array.from({ length: 70 }, (_, i) => at(NOSE_ON_Y - (12 / 3.6) * ((i + 1) / 30), -12, t0 + (i + 2) / 30)),
      ];
      const yRest = ticks[ticks.length - 1].position.y;
      expect(yRest).toBeLessThan(MARK.y - ROUTE_RUNOUT_ARRIVE_M);
      expect(MARK.y - yRest).toBeLessThan(9);
      const tRest = lastT(ticks) + 1 / 30;
      const d = feed(createLessonSession(hz(level)), [...ticks, ...Array.from({ length: 120 }, (_, i) => at(yRest, 0, tRest + i / 60))]);
      expect(d.s.touchedNamedBodies).toEqual(["sc-hzbds-stop"]);
      expect(d.s.phase).toBe("completed");
      expect(d.s.routeFinishRunOut?.arm).toBe("terminalUnearnable");
      expect(d.said.map((x) => x.titleBg)).toEqual([LESSON_END]);
      expect(d.said[0].text).toBe(openTasksEndingCopy(false).explanationBg);
      // Within the gate's own half second plus one frame of coming to rest.
      expect(d.s.endedAtSec! - tRest).toBeLessThanOrEqual(0.5 + 1 / 60 + 1e-9);
      expect(buildLessonResult(d.s).objectives[1].done).toBe(false);
    });
  }
});

/** The chassis swerve's rest (scenario/__tests__/endings-chassis.test.ts): 9.852 m from the mark. */
const SWERVE_REST = { x: 0.28, y: 193.098 };

/** Touch, slide on out of the disc at speed, then whatever `after` brings. */
function swerveTicks(after: (t0: number) => SimTick[]): { ticks: SimTick[]; tRest: number } {
  const a = approach(183);
  const t0 = lastT(a);
  const slide: SimTick[] = [at(NOSE_ON_Y, 30, t0 + 1 / 60, "staticObject", 3.03)];
  for (let i = 1; i <= 30; i++) {
    const f = i / 30;
    slide.push(at(NOSE_ON_Y + (SWERVE_REST.y - NOSE_ON_Y) * f, 30 * (1 - f) + 2, t0 + (i + 1) / 60, undefined, 3.03 + (SWERVE_REST.x - 3.03) * f));
  }
  const tRest = lastT(slide) + 1 / 60;
  return { ticks: [...a, ...slide, ...after(tRest)], tRest };
}
const restAt = (t0: number, n: number, extra: Partial<SimTick> = {}, speedKmh = 0): SimTick[] =>
  Array.from({ length: n }, (_, i) => at(SWERVE_REST.y, speedKmh, t0 + i / 60, undefined, SWERVE_REST.x, extra));

describe("E2 — an unearnable terminal and a car standing still OUTSIDE gate 1's disc ends the drive", () => {
  it("THE FIXTURE: the swerve's rest is outside the 9 m disc and more than CRASH_PIN_RADIUS_M from the impact", () => {
    const zone = routeFinishZone(hz(1).objectives.map(parseObjectiveParams))!;
    expect(Math.hypot(SWERVE_REST.x - zone.x, SWERVE_REST.y - zone.y)).toBeGreaterThan(zone.radiusM);
    expect(Math.hypot(SWERVE_REST.x - 3.03, SWERVE_REST.y - NOSE_ON_Y)).toBeGreaterThan(6);
  });

  for (const level of LEVELS) {
    it(`L${level}: held at rest, the drive ends FINISH_STUCK_S after it came to rest, on the non-arrival sentence — not on any other ending`, () => {
      const { ticks, tRest } = swerveTicks((t) => restAt(t, 60 * 20));
      const d = feed(createLessonSession(hz(level)), ticks);
      expect(d.s.phase).toBe("completed");
      expect(UNEARNABLE_STANDSTILL_S).toBe(FINISH_STUCK_S);
      expect(d.s.endedAtSec! - tRest).toBeGreaterThanOrEqual(FINISH_STUCK_S - 1e-9);
      expect(d.s.endedAtSec! - tRest).toBeLessThanOrEqual(FINISH_STUCK_S + 1 / 60 + 1e-9);
      expect(d.said).toHaveLength(1);
      expect(d.said[0]).toEqual({ t: d.s.endedAtSec, titleBg: LESSON_END, text: openTasksEndingCopy(false).explanationBg });
      expect(d.said[0].text).not.toContain(ARRIVAL);
      expect(d.said[0].text).not.toContain(STOPPED_AT_END);
      expect(d.said[0].text).not.toContain("притисната");
      // Graded nothing.
      expect(d.s.objectives[1].status).toBe("active");
      expect(buildLessonResult(d.s).completedAll).toBe(false);
    });
  }

  it("a car REVERSING at walking pace out there never accrues — the standstill is a magnitude (reverse reads negative)", () => {
    const { ticks } = swerveTicks((t) => restAt(t, 60 * 30, {}, -3));
    const d = feed(createLessonSession(hz(1)), ticks);
    expect(d.s.phase).toBe("driving");
    expect(d.s.unearnableStillSinceSec).toBeUndefined();
  });

  it("a car rolling forward at walking pace out there never accrues either — it is not a duration cap", () => {
    const { ticks } = swerveTicks((t) => restAt(t, 60 * 30, {}, 3));
    const d = feed(createLessonSession(hz(1)), ticks);
    expect(d.s.phase).toBe("driving");
  });

  it("B15: a lawful wait out there spends nothing; the same standstill ends the drive FINISH_STUCK_S after the walker leaves", () => {
    const ped: SimTick["events"] = [{ kind: "crossingZoneEntered", crossingId: "x-1", pedestrianOnCrossing: true }];
    let tFree = 0;
    const { ticks } = swerveTicks((t) => {
      const wait = restAt(t, 60 * 30).map((k, i) => (i === 0 ? { ...k, events: ped } : k));
      tFree = t + 30;
      const release = { ...restAt(tFree, 1)[0], events: [{ kind: "crossingZoneExited" as const, crossingId: "x-1" }] };
      return [...wait, release, ...restAt(tFree + 1 / 60, 60 * 14)];
    });
    let s = createLessonSession(hz(1));
    let holdingSeen = false;
    let endedAt: number | null = null;
    for (const k of ticks) {
      s = applyTick(s, k).state;
      if (s.yieldWait?.holding === true) {
        holdingSeen = true;
        expect(s.unearnableStillSinceSec, "the clock ran during a lawful wait").toBeUndefined();
      }
      if (endedAt === null && s.phase !== "driving") endedAt = k.t;
    }
    expect(holdingSeen).toBe(true);
    expect(endedAt).not.toBeNull();
    expect(endedAt! - tFree).toBeGreaterThanOrEqual(FINISH_STUCK_S - 1e-9);
  });

  it("B15, the other order: at rest FIRST, then a walker steps out — the wait drops the clock, it does not pause it", () => {
    const ped: SimTick["events"] = [{ kind: "crossingZoneEntered", crossingId: "x-1", pedestrianOnCrossing: true }];
    let tFree = 0;
    const { ticks, tRest } = swerveTicks((t) => {
      const before = restAt(t, 60 * 5); // 5 s of the clock running
      const wait = restAt(t + 5, 60 * 30).map((k, i) => (i === 0 ? { ...k, events: ped } : k));
      tFree = t + 35;
      const release = { ...restAt(tFree, 1)[0], events: [{ kind: "crossingZoneExited" as const, crossingId: "x-1" }] };
      return [...before, ...wait, release, ...restAt(tFree + 1 / 60, 60 * 14)];
    });
    let s = createLessonSession(hz(1));
    let endedAt: number | null = null;
    let ranBefore = false;
    for (const k of ticks) {
      s = applyTick(s, k).state;
      if (k.t < tRest + 5 && s.unearnableStillSinceSec !== undefined) ranBefore = true;
      if (endedAt === null && s.phase !== "driving") endedAt = k.t;
    }
    expect(ranBefore, "the fixture: the clock ran before the walker").toBe(true);
    expect(endedAt).not.toBeNull();
    // Not during the wait (5 s banked + 30 s waiting would be 35 s) — a full bar after the walker left.
    expect(endedAt! - tFree).toBeGreaterThanOrEqual(FINISH_STUCK_S - 1e-9);
  });

  it("OFF the network (edgeId null) the clock does not run — `stepOffNetwork` owns that car, with its own sentence", () => {
    const { ticks } = swerveTicks((t) => restAt(t, 60 * 20, { edgeId: null }));
    let s = createLessonSession(hz(1));
    for (const k of ticks) s = applyTick(s, k).state;
    expect(s.phase).toBe("driving");
    expect(s.unearnableStillSinceSec).toBeUndefined();
  });

  it("INSIDE gate 1's disc the clock never runs — gate 1 owns that ending", () => {
    const a = approach(183);
    const t0 = lastT(a);
    const ticks = [
      ...a,
      at(NOSE_ON_Y, -3.8, t0 + 1 / 60, "staticObject"),
      ...Array.from({ length: 20 }, (_, i) => at(NOSE_ON_Y, 0, t0 + (i + 2) / 60)),
    ];
    let s = createLessonSession(hz(1));
    for (const k of ticks) {
      s = applyTick(s, k).state;
      expect(s.unearnableStillSinceSec, `t ${k.t.toFixed(3)}`).toBeUndefined();
    }
    expect(s.phase).toBe("driving"); // 20 frames: the gate's half second has not run out yet
  });

  it("OFF the terminal (an EARLIER task open) a standstill anywhere is not this ending — the chain is not unearnable", () => {
    const a = along(0, 50, 40, 0);
    const d = feed(createLessonSession(STALL), [...a, ...still(50, lastT(a) + 0.1, 400)]);
    expect(d.s.phase).toBe("driving");
    expect(d.s.unearnableStillSinceSec).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §3 · E3 — the crash pin's words, true of a pressed car and a free one
// ───────────────────────────────────────────────────────────────────────────

const PINNED_WORDS = /притисн|не може да продължи|блокиран/u;

describe("E3 — the crash pin's ending and its route hold claim only what was measured", () => {
  it("the ending, lesson and exam: says the car stopped by the place it struck and stayed still, and the drive closes there; never «притисната»", () => {
    for (const exam of [false, true]) {
      const c = crashPinEndingCopy(exam);
      expect(c.titleBg).toBe(exam ? "Край на изпита след удара" : "Край на упражнението след удара");
      expect(c.explanationBg).not.toMatch(PINNED_WORDS);
      expect(c.explanationBg).toMatch(/^След удара колата спря до мястото на удара и остана неподвижна, затова (урокът|изпитът) приключва тук\./u);
      expect(c.explanationBg).toContain("Разборът показва");
    }
  });

  it("the hold card is CONDITIONAL — ease away first only if the car touches what it hit, otherwise look and move off — and carries no key chip", () => {
    // Rounds 2–3 (E5 / E9): the FRONT half touched a stationary body — it eases BACK.
    const p = routeHoldAdvisorPrompt("crashPinned", "back");
    expect(p.textBg).toMatch(/^Ако колата опира в удареното, първо съвсем леко назад/u);
    expect(p.textBg).toContain("газта напред само я притиска");
    expect(p.textBg).toContain("Ако не опира, огледай се и тогава потегли");
    expect(p.peekBg).toBe("Ако опира — първо назад: напред я притиска.");
    expect(p.keys).toEqual([]);
    expect(p.textBg).not.toMatch(/притисната|притисн[ае]т/u);
  });

  it("the banner lead is conditional too, and no longer than the lead it replaced (66 characters) — every way out", () => {
    for (const w of ["back", "forward", "away"] as const) {
      const line = objectiveTitleUnderHold("ЗАДАЧА", "crashPinned", w)!;
      const lead = line.slice(0, line.length - ": ЗАДАЧА".length);
      expect(lead.startsWith("След удара — ако колата опира в удареното, първо леко")).toBe(true);
      expect(lead.length).toBeLessThanOrEqual("Колата е притисната след удара — измъкни се назад, за да продължиш".length);
      expect(line).not.toMatch(/притисната|измъкни се назад/u);
    }
    expect(objectiveTitleUnderHold("ЗАДАЧА", "crashPinned", "back")).toBe("След удара — ако колата опира в удареното, първо леко назад: ЗАДАЧА");
  });

  /**
   * The engine reach (pinfree evidence, re-measured at 219ac1e): ONE collision,
   * then the car stands 3.1–3.3 m further along its own demo line with nothing
   * touching it. Base ended every one at t 14 on «…остана притисната на място и
   * не може да продължи…». Same t now, on the new sentence.
   */
  const REACH: Array<[string, "staticObject" | "vehicle"]> = [
    ["sc-park-wall", "staticObject"],
    ["sc-pk-driveway", "staticObject"],
    ["sc-ln-obstacle-meeting", "vehicle"],
    ["sc-follow-tailgater", "vehicle"],
  ];
  for (const [id, withWhat] of REACH) {
    it(`${id}: a ${withWhat} collision, then a free standstill 3 m on — ends at the same t (14) on the true sentence`, () => {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
      const lesson = compileScenario(spec, 1);
      // A straight 20 km/h line from the spawn's heading: the reach needs only
      // a pose, a collision and a stillness — the pin reads nothing else.
      const sp = lesson.spawn.position ?? { x: 0, y: 0 };
      const hdg = lesson.spawn.headingDeg ?? 0;
      const h = (hdg * Math.PI) / 180;
      const p = (d: number) => ({ x: sp.x + Math.sin(h) * d, y: sp.y + Math.cos(h) * d });
      const ticks: SimTick[] = [];
      let t = 0;
      for (let i = 0; i < 6; i++, t += 0.5) ticks.push(makeTick({ t, speedKmh: 20, headingDeg: hdg, position: p(2 * i) }));
      ticks.push(makeTick({ t, speedKmh: 18, headingDeg: hdg, position: p(12), events: [{ kind: "collision", withWhat }] }));
      t += 0.5;
      ticks.push(makeTick({ t, speedKmh: 6, headingDeg: hdg, position: p(13.5) }));
      t += 0.5;
      for (; t < 30; t += 0.5) ticks.push(makeTick({ t, speedKmh: 0, headingDeg: hdg, position: p(15) }));
      const d = feed(createLessonSession(lesson), ticks);
      expect(d.s.phase).toBe("completed");
      expect(d.s.endedAtSec).toBe(4 + CRASH_PIN_STUCK_S);
      const end = d.said.filter((x) => x.t === d.s.endedAtSec);
      expect(end.map((x) => x.titleBg)).toEqual([crashPinEndingCopy(false).titleBg]);
      // Rounds 2–3 (E6 / E10): struck travelling forward at 20 km/h, and — this
      // session was created without the scenery's boxes — no END known: the
      // corrective of THAT crash as far as it is known.
      expect(d.s.crashPin?.impact).toEqual({ travel: "forward", body: withWhat, end: "unknown" });
      expect(end[0].text).toBe(crashPinEndingCopy(false, { travel: "forward", body: withWhat, end: "unknown" }).explanationBg);
      expect(d.said.some((x) => PINNED_WORDS.test(x.text))).toBe(false);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// §5 · ROUND 2 — the conditions the round-1 verifier left (E7: C2, C3, C4, C5)
// ───────────────────────────────────────────────────────────────────────────
//
// Each test below pins one mutant the round-1 suite let live
// (D:/knijka-lanes/scratch/endings-verify/mut/V*.log, 65/65 passed under each).

describe("E7 — the run-out's own rules, each pinned on what it decides", () => {
  // V1 (C2): «past the mark» is measured from the route's earlier waypoint, not the latch pose.
  it("C2 · the approach axis comes from the last earlier located objective more than ROUTE_RUNOUT_ARRIVE_M from the mark — never the latch pose", () => {
    const ps = STALL.objectives.map(parseObjectiveParams);
    // A latch pose PAST the mark (as sc-hz-brake-dont-swerve's is): an axis from it would point backwards.
    expect(routeApproachFrom(ps, { x: 103, y: 0 })).toEqual({ x: 40, y: 30 });
    const hzPs = hz(1).objectives.map(parseObjectiveParams);
    expect(routeApproachFrom(hzPs, { x: LANE_X, y: NOSE_ON_Y })).toEqual({ x: 4.06, y: 110 });
    // A route whose only earlier objective sits ON the mark falls back to `here`.
    const onMark = [
      parseObjectiveParams({ id: "a", titleBg: "a", kind: "reachZone", params: { x: 100, y: 1, radiusM: 4 } }),
      ...STALL.objectives.slice(1).map(parseObjectiveParams),
    ];
    expect(routeApproachFrom(onMark, { x: 95, y: 0 })).toEqual({ x: 95, y: 0 });
  });

  it("C2 · on the live chain: sc-hz-brake-dont-swerve's stalled run-out is armed with the approach from (4.06, 110), not its latch pose", () => {
    const d = feed(createLessonSession(hz(1)), latchShortThenLeave());
    expect(d.s.routeFinishRunOut).toBeDefined();
    expect([d.s.routeFinishRunOut!.fromX, d.s.routeFinishRunOut!.fromY]).toEqual([4.06, 110]);
  });

  // V2 (C4): arrival is checked BEFORE the B15 freeze, as on the completed path.
  it("C4 · an arrival during a lawful wait still ends the run-out: «arrived» outranks the B15 freeze", () => {
    const ro = armRouteFinishRunOut({ x: 100, y: 0 }, { x: 40, y: 30 }, "earlierTaskOpen");
    const atMark = makeTick({ t: 5, speedKmh: 0, position: { x: 99, y: 0 } });
    expect(stepRouteFinishRunOut(ro, atMark, 4.9, true).exit).toBe("arrived");
    // …and short of the mark the freeze holds: nothing ends, nothing accrues.
    const short = makeTick({ t: 5, speedKmh: 0, position: { x: 92, y: 0 } });
    const held = stepRouteFinishRunOut(ro, short, 4.9, true);
    expect(held.exit).toBeNull();
    expect(held.runOut.elapsedSec).toBe(0);
  });

  // V3 (C3): AT REST is a magnitude — a reversing car is not at rest.
  it("C3 · the run-out's AT REST reads the magnitude: −8 km/h (reversing) is travelling, ±0.5 km/h is at rest", () => {
    const ro = armRouteFinishRunOut({ x: 100, y: 0 }, { x: 40, y: 30 }, "earlierTaskOpen");
    const short = (speedKmh: number) => makeTick({ t: 5, speedKmh, position: { x: 92, y: 0 } });
    expect(stepRouteFinishRunOut(ro, short(-8), 4.9, false).exit).toBeNull();
    expect(stepRouteFinishRunOut(ro, short(-8), 4.9, false).runOut.elapsedSec).toBeCloseTo(0.1, 9);
    expect(stepRouteFinishRunOut(ro, short(0.5), 4.9, false).exit).toBe("atRest");
    expect(stepRouteFinishRunOut(ro, short(-0.5), 4.9, false).exit).toBe("atRest");
  });

  it("C3 · on the live chain: a stalled car backing away from the mark at 8 km/h is let out at ROUTE_RUNOUT_MAX_S, not at once as «at rest»", () => {
    const a = along(0, 92, 40, 0);
    const t0 = lastT(a);
    // Settle inside the ring at 2 km/h until the latch (gate 1's dwell has no cap on STALL), then reverse.
    const creep = Array.from({ length: 8 }, (_, i) => makeTick({ t: t0 + 0.1 * (i + 1), speedKmh: 2, maxSpeedKmh: 130, position: { x: 92 + 0.05 * (i + 1), y: 0 }, headingDeg: 90 }));
    const t1 = lastT(creep);
    const back: SimTick[] = [];
    for (let i = 1; i <= 260; i++) back.push(makeTick({ t: t1 + 0.1 * i, speedKmh: -8, maxSpeedKmh: 130, position: { x: 92.4 - (8 / 3.6) * 0.1 * i, y: 0 }, headingDeg: 90 }));
    let s = createLessonSession(STALL);
    let latchedAt: number | null = null;
    let endedAt: number | null = null;
    let text = "";
    for (const k of [...a, ...creep, ...back]) {
      const r = applyTick(s, k);
      s = r.state;
      if (latchedAt === null && s.routeFinishRunOut !== undefined) latchedAt = k.t;
      for (const h of r.hudEvents) if (h.kind === "lesson" && /^Край/u.test(h.titleBg ?? "")) text = (h as { explanationBg?: string }).explanationBg ?? "";
      if (endedAt === null && s.phase !== "driving") endedAt = k.t;
    }
    expect(latchedAt).not.toBeNull();
    expect(endedAt).not.toBeNull();
    expect(endedAt! - latchedAt!).toBeGreaterThanOrEqual(ROUTE_RUNOUT_MAX_S - 0.1 - 1e-9);
    expect(text).toBe(openTasksEndingCopy(false).explanationBg);
  });

  // V10 (C5): a route with NO arrival mark ends on the latch frame, on the sentence it always had.
  it("C5 · no arrival mark (a parkInBay terminal): the latch ends the drive on its own frame, on «Стигна края» as on base — never the open-tasks sentence", () => {
    const a = along(0, 95, 20, 0);
    const t0 = lastT(a);
    const rest = Array.from({ length: 80 }, (_, i) => makeTick({ t: t0 + 0.1 * (i + 1), speedKmh: 0, maxSpeedKmh: 130, position: { x: 95, y: 0 }, headingDeg: 90 }));
    const e = feed(createLessonSession(STALL_BAY), [...a, ...rest]);
    expect(routeEndMark(STALL_BAY.objectives.map(parseObjectiveParams))).toBeNull();
    expect(e.s.phase).toBe("completed");
    expect(e.s.routeFinishRunOut).toBeUndefined();
    expect(e.said).toHaveLength(1);
    expect(e.said[0].titleBg).toBe(LESSON_END);
    expect(e.said[0].text).toContain(ARRIVAL);
    expect(e.said[0].text).not.toBe(openTasksEndingCopy(false).explanationBg);
    expect(e.s.objectives[0].status).toBe("active");
  });

  // V9 (C5): E2 never accrues once gate 1 has latched — the run-out owns that car.
  it("C5 · once gate 1 has latched, the E2 clock never runs — even when the run-out ends the drive at rest OUTSIDE the disc", () => {
    let s = createLessonSession(hz(1));
    let latched = false;
    for (const k of latchShortThenLeave()) {
      s = applyTick(s, k).state;
      if (s.routeFinishRunOut !== undefined) latched = true;
      if (latched) expect(s.unearnableStillSinceSec, `t ${k.t.toFixed(3)}`).toBeUndefined();
    }
    expect(latched).toBe(true);
    expect(s.phase).toBe("completed");
    expect(s.routeFinishRunOut?.arm).toBe("terminalUnearnable");
    const zone = routeFinishZone(hz(1).objectives.map(parseObjectiveParams))!;
    const lt = s.lastTick!;
    expect(Math.hypot(lt.position.x - zone.x, lt.position.y - zone.y)).toBeGreaterThan(zone.radiusM);
  });
});

/**
 * sc-hz-brake-dont-swerve: the block touched, then BACK down the road at
 * 12 km/h (over the gate's 6 km/h cap: no dwell) to 5.5 m short of the mark, a
 * 3 km/h crawl there until gate 1 latches (not past, more than 2.5 m short:
 * no arrival), then on back out of the 9 m disc at 12 km/h and to rest 12 m
 * short of the mark — more than CRASH_PIN_RADIUS_M from the impact.
 */
function latchShortThenLeave(): SimTick[] {
  const a = approach(183);
  let t = lastT(a) + 1 / 60;
  const out: SimTick[] = [...a, at(NOSE_ON_Y, -3.8, t, "staticObject")];
  let y = NOSE_ON_Y;
  const push = (v: number, n: number) => {
    for (let i = 0; i < n; i++) {
      t += 1 / 60;
      y += (v / 3.6) / 60;
      out.push(at(y, v, t));
    }
  };
  push(-12, Math.round(((NOSE_ON_Y - 178.5) / (12 / 3.6)) * 60));
  push(-3, 45);
  push(-12, Math.round(((y - 172) / (12 / 3.6)) * 60));
  push(0, 30);
  return out;
}

/** STALL with a parkInBay terminal: gate 1 is the bay's 14 m ring, and there is no arrival mark. */
const STALL_BAY: LessonSpec = {
  ...STALL,
  id: "t-endings-stall-bay",
  objectives: [
    STALL.objectives[0],
    {
      id: "o-2",
      titleBg: "Паркирай",
      kind: "completeManeuver",
      params: { maneuver: "parkInBay", holdSec: 1.5, bay: { x: 100, y: 0, headingDeg: 90, widthM: 3, lengthM: 6.6 } },
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// §6 · ROUNDS 2–3 — E5 / E6, re-keyed by E9 / E10: the way out is AWAY from
// what it hit, keyed on which END of the car touched it at the bill, and the
// ending's corrective is the one true of the crash it closes
// ───────────────────────────────────────────────────────────────────────────

const STEM = "След удара — ако колата опира в удареното, първо леко";
const CARD = {
  back: "Ако колата опира в удареното, първо съвсем леко назад с прави колела — газта напред само я притиска. Ако не опира, огледай се и тогава потегли.",
  forward:
    "Ако колата опира в удареното, първо съвсем леко напред с прави колела — задният ход само я притиска. Ако не опира, огледай се и тогава потегли.",
  away: "Ако колата опира в удареното, първо съвсем леко я отдръпни от него — натискът към него само я притиска. Ако не опира, огледай се и тогава потегли.",
} as const;
const PEEK = {
  back: "Ако опира — първо назад: напред я притиска.",
  forward: "Ако опира — напред: назад я притиска.",
  away: "Ако опира — отдръпни я: към него я притиска.",
} as const;
const LEAD = {
  back: `${STEM} назад`,
  forward: `${STEM} напред`,
  away: `${STEM} я отдръпни`,
} as const;
const OPENER = "След удара колата спря до мястото на удара и остана неподвижна, затова урокът приключва тук. Разборът показва как се стига до такъв удар и какво го предотвратява: ";
const CORRECTIVE = {
  staticAhead: "по-ранно намаляване и достатъчна дистанция до всичко неподвижно напред.",
  reversing: "на заден ход — съвсем бавно, с поглед назад и в огледалата, и спиране навреме преди всичко зад колата.",
  frontSwing: "при заден ход със завъртян волан предницата излиза встрани — затова следи и предния ъгъл, а не само това зад колата.",
  vulnerable: "по-ранно намаляване и готовност да спреш, щом до пътя ти има пешеходец или велосипедист.",
  vehicle: "достатъчно място около колата — скорост, дистанция и пролука, избрани навреме, преди другата кола да е твърде близо.",
  general: "по-ранно намаляване и достатъчно място около колата.",
} as const;

type Box = { x: number; y: number; headingDeg: number; halfLengthM: number; halfWidthM: number };
const HL = PLAYER_HALF_LENGTH_M;
const HW = PLAYER_HALF_WIDTH_M;

/**
 * A stationary box placed relative to a car pose, `gapM` clear of the half it
 * is put against:
 *  · "ahead"  — a wall across the car's path, `gapM` off its nose;
 *  · "behind" — the same, `gapM` off its tail;
 *  · "frontSide" — a short wall BESIDE THE FRONT HALF only (its near end
 *    0.21 m ahead of the car's centre), `gapM` off the car's right flank: the
 *    front corner a reverse on a lock swings into;
 *  · "alongside" — a long wall beside the whole car, `gapM` off its flank.
 */
function boxAt(pose: { x: number; y: number; headingDeg: number }, where: "ahead" | "behind" | "frontSide" | "alongside", gapM = 0.01): Box {
  const h = (pose.headingDeg * Math.PI) / 180;
  const fx = Math.sin(h);
  const fy = Math.cos(h);
  const rx = Math.cos(h); // the car's right, in district space
  const ry = -Math.sin(h);
  const T = 0.15; // half-thickness
  const at = (along: number, across: number) => ({ x: pose.x + fx * along + rx * across, y: pose.y + fy * along + ry * across });
  switch (where) {
    case "ahead":
      return { ...at(HL + T + gapM, 0), headingDeg: pose.headingDeg + 90, halfLengthM: 2, halfWidthM: T };
    case "behind":
      return { ...at(-(HL + T + gapM), 0), headingDeg: pose.headingDeg + 90, halfLengthM: 2, halfWidthM: T };
    case "frontSide":
      return { ...at(HL / 2, HW + T + gapM), headingDeg: pose.headingDeg, halfLengthM: 0.8, halfWidthM: T };
    case "alongside":
      return { ...at(0, HW + T + gapM), headingDeg: pose.headingDeg, halfLengthM: 4, halfWidthM: T };
  }
}

/**
 * A straight line at `kmh` (signed: < 0 reverses), a collision, then still for
 * 30 s. `wall` places a stationary box against the car's pose ON THE BILL'S
 * TICK and hands it to the session as `staticContactBodies` (the shell hands
 * the held scenery's boxes the same way); `bodies: "none"` creates the session
 * without any — no fact.
 */
function pinDrive(
  lesson: LessonSpec,
  kmh: number,
  withWhat: "staticObject" | "vehicle" | "pedestrian" | "cyclist",
  opts: {
    impactTickKmh?: number;
    wall?: "ahead" | "behind" | "frontSide" | "alongside" | "elsewhere";
    gapM?: number;
    bodies?: "none";
    second?: { kmh: number; withWhat: "staticObject" | "vehicle" | "pedestrian" | "cyclist" };
  } = {},
) {
  const sp = lesson.spawn.position ?? { x: 0, y: 0 };
  const hdg = lesson.spawn.headingDeg ?? 0;
  const h = (hdg * Math.PI) / 180;
  const p = (d: number) => ({ x: sp.x + Math.sin(h) * d, y: sp.y + Math.cos(h) * d });
  const dir = Math.sign(kmh) || 1;
  const contact = { ...p(dir * 12), headingDeg: hdg };
  const bodies: Box[] | undefined =
    opts.bodies === "none"
      ? undefined
      : opts.wall === undefined || opts.wall === "elsewhere"
        ? [{ x: contact.x + 40, y: contact.y + 40, headingDeg: 0, halfLengthM: 2, halfWidthM: 0.15 }]
        : [boxAt(contact, opts.wall, opts.gapM)];
  const ticks: SimTick[] = [];
  let t = 0;
  for (let i = 0; i < 6; i++, t += 0.5) ticks.push(makeTick({ t, speedKmh: kmh, headingDeg: hdg, position: p(dir * 2 * i) }));
  // The contact tick's own speed is AFTER the solve that stopped the car (and may have
  // bounced it): by default the opposite sign of the travel, to prove it is not the source.
  ticks.push(makeTick({ t, speedKmh: opts.impactTickKmh ?? -dir * 2, headingDeg: hdg, position: p(dir * 12), events: [{ kind: "collision", withWhat }] }));
  t += 0.5;
  if (opts.second) {
    ticks.push(makeTick({ t, speedKmh: opts.second.kmh, headingDeg: hdg, position: p(dir * 12.2) }));
    t += 0.5;
    ticks.push(makeTick({ t, speedKmh: 0, headingDeg: hdg, position: p(dir * 12.3), events: [{ kind: "collision", withWhat: opts.second.withWhat }] }));
    t += 0.5;
  }
  for (; t < 40; t += 0.5) ticks.push(makeTick({ t, speedKmh: 0, headingDeg: hdg, position: p(dir * 12.3) }));
  let s = createLessonSession(lesson, bodies === undefined ? {} : { staticContactBodies: bodies });
  const holds: Array<{ t: number; card: string; peek: string | undefined; lead: string | null }> = [];
  const said: Said[] = [];
  for (const k of ticks) {
    const r = applyTick(s, k);
    s = r.state;
    for (const hh of r.hudEvents) if (hh.kind === "lesson" && /^Край/u.test(hh.titleBg ?? "")) said.push({ t: k.t, titleBg: hh.titleBg ?? "", text: (hh as { explanationBg?: string }).explanationBg ?? "" });
    if (s.phase === "driving" && routeHoldForSession(s) === "crashPinned") {
      const pr = advisorPromptForSession(s)!;
      holds.push({ t: k.t, card: pr.textBg, peek: pr.peekBg, lead: objectiveTitleUnderHold("ЗАДАЧА", "crashPinned", routeHoldWayOutForSession(s)) });
    }
  }
  return { s, holds, said, contact };
}

describe("E9 / E10 — the pin records the impact; the hold names the way away from the END that touched; the ending's corrective fits the crash", () => {
  const park = () => compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === "sc-pk-driveway")!, 1);
  const P = { x: 10, y: 20, headingDeg: 35 };

  it("THE FACT · `crashPinImpact`: travel off the PREVIOUS grid point's signed speed (|v| > FINISH_STANDSTILL_KMH), body off the bill's detail, most vulnerable first; the END only for a stationary body", () => {
    expect(crashPinImpact(20, ["staticObject"], [])).toEqual({ travel: "forward", body: "staticObject", end: "unknown" });
    expect(crashPinImpact(-8, ["staticObject"], [], () => "front")).toEqual({ travel: "reverse", body: "staticObject", end: "front" });
    expect(crashPinImpact(FINISH_STANDSTILL_KMH, ["vehicle"], [])).toEqual({ travel: "unknown", body: "vehicle", end: "unknown" });
    expect(crashPinImpact(-FINISH_STANDSTILL_KMH, ["vehicle"], [])).toEqual({ travel: "unknown", body: "vehicle", end: "unknown" });
    expect(crashPinImpact(undefined, ["vehicle"], [])).toEqual({ travel: "unknown", body: "vehicle", end: "unknown" });
    expect(crashPinImpact(Number.NaN, [], [])).toEqual({ travel: "unknown", body: null, end: "unknown" });
    expect(crashPinImpact(30, ["vehicleCutIn"], [])).toEqual({ travel: "forward", body: "vehicle", end: "unknown" });
    expect(crashPinImpact(30, ["staticObject", "pedestrian", "vehicle"], [])).toEqual({ travel: "forward", body: "pedestrian", end: "unknown" });
    expect(crashPinImpact(30, ["staticObject", "cyclist"], [])).toEqual({ travel: "forward", body: "cyclist", end: "unknown" });
    // A bill with no detail falls back to the tick's contacts.
    expect(crashPinImpact(30, [undefined], ["staticObject"], () => "rear")).toEqual({ travel: "forward", body: "staticObject", end: "rear" });
    // A road user is never measured against the scenery: the nearest wall says nothing about a person.
    for (const body of ["vehicle", "pedestrian", "cyclist"] as const) {
      expect(crashPinImpact(-8, [body], [], () => "rear").end).toBe("unknown");
    }
  });

  it("THE END · `crashPinContactEnd`: the car's box cut at its centre; a half within CRASH_PIN_END_TOUCH_M (0.05 m) of a listed body touched it", () => {
    expect(CRASH_PIN_END_TOUCH_M).toBe(0.05);
    expect(crashPinContactEnd(P, undefined)).toBe("unknown");
    expect(crashPinContactEnd(P, [])).toBe("neither");
    expect(crashPinContactEnd(P, [boxAt(P, "ahead")])).toBe("front");
    expect(crashPinContactEnd(P, [boxAt(P, "behind")])).toBe("rear");
    expect(crashPinContactEnd(P, [boxAt(P, "frontSide")])).toBe("front");
    expect(crashPinContactEnd(P, [boxAt(P, "alongside")])).toBe("both");
    expect(crashPinContactEnd(P, [boxAt(P, "ahead"), boxAt(P, "behind")])).toBe("both");
    expect(crashPinContactEnd(P, [boxAt(P, "ahead", -0.03)])).toBe("front"); // overlapping
    // The band's edges: 0.05 m touches, 0.07 m does not; 0.10 m (inside the 0.15 m touched band) does not.
    expect(crashPinContactEnd(P, [boxAt(P, "ahead", 0.049)])).toBe("front");
    expect(crashPinContactEnd(P, [boxAt(P, "ahead", 0.07)])).toBe("neither");
    expect(crashPinContactEnd(P, [boxAt(P, "behind", 0.1)])).toBe("neither");
    expect(crashPinContactEnd(P, [boxAt(P, "frontSide", 0.1)])).toBe("neither");
    // The halves are the car's own box: a wall 0.04 m off the side of the FRONT half only.
    const fs = boxAt(P, "frontSide", 0.04);
    expect(crashPinContactEnd(P, [fs])).toBe("front");
    expect(crashPinContactEnd({ ...P, headingDeg: P.headingDeg + 180 }, [fs])).toBe("rear");
  });

  it("THE WAY OUT · keyed on the END, never the travel: front → back, rear → forward; both, neither, unknown, a road user → direction-free", () => {
    const ALL_CLEAR = { front: true, rear: true };
    for (const travel of ["forward", "reverse", "unknown"] as const) {
      expect(crashPinWayOut({ travel, body: "staticObject", end: "front" }, ALL_CLEAR)).toBe("back");
      expect(crashPinWayOut({ travel, body: "staticObject", end: "rear" }, ALL_CLEAR)).toBe("forward");
      for (const end of ["both", "neither", "unknown", undefined] as const) {
        expect(crashPinWayOut({ travel, body: "staticObject", end }, ALL_CLEAR)).toBe("away");
      }
      for (const body of ["vehicle", "pedestrian", "cyclist", null] as const) {
        for (const end of ["front", "rear", "both", "neither", "unknown"] as const) expect(crashPinWayOut({ travel, body, end }, ALL_CLEAR)).toBe("away");
      }
    }
    expect(crashPinWayOut(undefined, ALL_CLEAR)).toBe("away");
  });

  it("THE SURFACES · card, peek and lead per way out — conditional, the FREE branch whole, no chip, each lead ≤ 66 characters and sharing one stem", () => {
    for (const w of ["back", "forward", "away"] as const) {
      const p = routeHoldAdvisorPrompt("crashPinned", w);
      expect(p.textBg).toBe(CARD[w]);
      expect(p.peekBg).toBe(PEEK[w]);
      expect(p.keys).toEqual([]);
      expect(p.textBg).toMatch(/^Ако колата опира в удареното, /u);
      expect(p.textBg.endsWith("Ако не опира, огледай се и тогава потегли.")).toBe(true);
      const line = objectiveTitleUnderHold("ЗАДАЧА", "crashPinned", w)!;
      expect(line).toBe(`${LEAD[w]}: ЗАДАЧА`);
      expect(LEAD[w].startsWith(STEM)).toBe(true);
      expect(LEAD[w].length).toBeLessThanOrEqual(66);
    }
    // Defaults are the direction-free advice — true whichever side the body is on.
    expect(routeHoldAdvisorPrompt("crashPinned").textBg).toBe(CARD.away);
    expect(objectiveTitleUnderHold("ЗАДАЧА", "crashPinned")).toBe(`${LEAD.away}: ЗАДАЧА`);
    expect(CARD.forward).not.toMatch(/леко назад/u);
    expect(CARD.back).not.toMatch(/леко напред/u);
    expect(CARD.away).not.toMatch(/леко (назад|напред)/u);
  });

  it("THE ENDING · end × travel × body: front+forward keeps base's sentence VERBATIM, rear+reverse the reversing one, FRONT+REVERSE the front-swing one; the exam sentence the same for all", () => {
    const cases: Array<[Parameters<typeof crashPinEndingCopy>[1], keyof typeof CORRECTIVE]> = [
      [{ travel: "forward", body: "staticObject", end: "front" }, "staticAhead"],
      [{ travel: "reverse", body: "staticObject", end: "rear" }, "reversing"],
      [{ travel: "reverse", body: "staticObject", end: "front" }, "frontSwing"],
      [{ travel: "forward", body: "staticObject", end: "rear" }, "general"],
      [{ travel: "forward", body: "staticObject", end: "both" }, "general"],
      [{ travel: "reverse", body: "staticObject", end: "both" }, "general"],
      [{ travel: "forward", body: "staticObject", end: "neither" }, "general"],
      [{ travel: "reverse", body: "staticObject", end: "unknown" }, "general"],
      [{ travel: "forward", body: "staticObject" }, "general"],
      [{ travel: "unknown", body: "staticObject", end: "front" }, "general"],
      [{ travel: "reverse", body: "vehicle", end: "unknown" }, "vehicle"],
      [{ travel: "reverse", body: "pedestrian", end: "unknown" }, "vulnerable"],
      [{ travel: "forward", body: "pedestrian", end: "unknown" }, "vulnerable"],
      [{ travel: "unknown", body: "cyclist", end: "unknown" }, "vulnerable"],
      [{ travel: "forward", body: "vehicle", end: "unknown" }, "vehicle"],
      [{ travel: "forward", body: null, end: "unknown" }, "general"],
      [undefined, "general"],
    ];
    const exam = crashPinEndingCopy(true).explanationBg;
    for (const [impact, key] of cases) {
      expect(crashPinCorrective(impact)).toBe(key);
      expect(crashPinEndingCopy(false, impact).explanationBg).toBe(OPENER + CORRECTIVE[key]);
      expect(crashPinEndingCopy(true, impact).explanationBg).toBe(exam);
    }
    expect(crashPinEndingCopy(false, { travel: "forward", body: "staticObject", end: "front" }).explanationBg).toContain("дистанц");
    // The front-swing corrective names the swing and the front corner, and never «what is behind» as the thing to stop for.
    expect(CORRECTIVE.frontSwing).toMatch(/предницата/u);
    expect(CORRECTIVE.frontSwing).not.toMatch(/спиране навреме преди всичко зад колата/u);
    expect(exam).toBe("След удара колата спря до мястото на удара и остана неподвижна, затова изпитът приключва тук. Разборът показва удара, всяка останала задача и какво трябваше да се направи преди него.");
  });

  it("ENGINE · a straight REVERSE into a wall behind (the REAR half touches; the contact tick itself reads +2 after the solve): «напред», the reversing corrective", () => {
    const d = pinDrive(park(), -8, "staticObject", { wall: "behind" });
    expect(d.s.crashPin?.impact).toEqual({ travel: "reverse", body: "staticObject", end: "rear" });
    expect(d.holds.length).toBeGreaterThan(0);
    for (const h of d.holds) {
      expect(h.card).toBe(CARD.forward);
      expect(h.peek).toBe(PEEK.forward);
      expect(h.lead).toBe(`${LEAD.forward}: ЗАДАЧА`);
    }
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.reversing]);
  });

  it("ENGINE · the FRONT-SWING: reversing, the FRONT half touches a wall beside it — «назад» (away from the wall), the front-swing corrective, never «напред»", () => {
    const d = pinDrive(park(), -8, "staticObject", { wall: "frontSide" });
    expect(d.s.crashPin?.impact).toEqual({ travel: "reverse", body: "staticObject", end: "front" });
    expect(d.holds.length).toBeGreaterThan(0);
    for (const h of d.holds) {
      expect(h.card).toBe(CARD.back);
      expect(h.peek).toBe(PEEK.back);
      expect(h.lead).toBe(`${LEAD.back}: ЗАДАЧА`);
    }
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.frontSwing]);
  });

  it("ENGINE · a FORWARD strike of a wall ahead (the FRONT half; the contact tick reads −2 after the bounce): «назад», and base's corrective verbatim", () => {
    const d = pinDrive(park(), 20, "staticObject", { wall: "ahead" });
    expect(d.s.crashPin?.impact).toEqual({ travel: "forward", body: "staticObject", end: "front" });
    for (const h of d.holds) {
      expect(h.card).toBe(CARD.back);
      expect(h.lead).toBe(`${LEAD.back}: ЗАДАЧА`);
    }
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.staticAhead]);
  });

  it("ENGINE · no fact settles the side — no bodies handed in, a body that is not listed, a side-on wall: direction-free hold, the corrective that names no direction", () => {
    for (const [o, end] of [
      [{ bodies: "none" as const }, "unknown"],
      [{ wall: "elsewhere" as const }, "neither"],
      [{ wall: "alongside" as const }, "both"],
    ] as const) {
      for (const kmh of [-8, 20]) {
        const d = pinDrive(park(), kmh, "staticObject", o);
        expect(d.s.crashPin?.impact?.end).toBe(end);
        expect(d.holds.length).toBeGreaterThan(0);
        for (const h of d.holds) expect([h.card, h.peek, h.lead]).toEqual([CARD.away, PEEK.away, `${LEAD.away}: ЗАДАЧА`]);
        expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.general]);
      }
    }
  });

  it("ENGINE · a person struck (sc-pe-jaywalker's shape): direction-free hold, the people corrective — reversing too; a vehicle: direction-free, the room corrective", () => {
    for (const kmh of [25, -6]) {
      const ped = pinDrive(park(), kmh, "pedestrian", { wall: kmh > 0 ? "ahead" : "behind" });
      expect(ped.s.crashPin?.impact).toEqual({ travel: kmh > 0 ? "forward" : "reverse", body: "pedestrian", end: "unknown" });
      for (const h of ped.holds) expect([h.card, h.peek, h.lead]).toEqual([CARD.away, PEEK.away, `${LEAD.away}: ЗАДАЧА`]);
      expect(ped.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.vulnerable]);
    }
    const veh = pinDrive(park(), 25, "vehicle", { wall: "ahead" });
    expect(veh.s.crashPin?.impact).toEqual({ travel: "forward", body: "vehicle", end: "unknown" });
    for (const h of veh.holds) expect(h.card).toBe(CARD.away);
    expect(veh.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.vehicle]);
  });

  it("ENGINE · struck while AT REST (|v| ≤ 1 before the contact) with the front half on the wall: the way out still follows the END («назад»); the corrective names no direction", () => {
    const d = pinDrive(park(), 0.5, "staticObject", { impactTickKmh: 0, wall: "ahead" });
    expect(d.s.crashPin?.impact).toEqual({ travel: "unknown", body: "staticObject", end: "front" });
    for (const h of d.holds) expect(h.card).toBe(CARD.back);
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.general]);
  });

  it("ENGINE · a re-arm re-records the impact: a forward wall strike then a pedestrian contact at rest — the LAST impact speaks", () => {
    const d = pinDrive(park(), 20, "staticObject", { wall: "ahead", second: { kmh: 0, withWhat: "pedestrian" } });
    expect(d.s.crashPin?.impact).toEqual({ travel: "unknown", body: "pedestrian", end: "unknown" });
    for (const h of d.holds) expect(h.card).toBe(CARD.away);
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.vulnerable]);
  });

  it("ENGINE · the session keeps the bodies it was handed on every tick, and a session created without them carries no field", () => {
    const d = pinDrive(park(), 20, "staticObject", { wall: "ahead" });
    expect(d.s.staticContactBodies).toEqual([boxAt(d.contact, "ahead")]);
    expect("staticContactBodies" in createLessonSession(park())).toBe(false);
  });

  it("ENGINE · nothing graded moves: the pin's timing and the bill are the same for every impact kind and every end", () => {
    const ends = [
      pinDrive(park(), -8, "staticObject", { wall: "behind" }),
      pinDrive(park(), -8, "staticObject", { wall: "frontSide" }),
      pinDrive(park(), -8, "staticObject", { bodies: "none" }),
      pinDrive(park(), 20, "staticObject", { wall: "ahead" }),
      pinDrive(park(), 25, "pedestrian"),
    ].map((d) => [
      d.s.endedAtSec,
      JSON.stringify(d.s.events.filter((e) => e.kind === "violation").map((e) => [e.code, (e as { points?: number }).points])),
    ]);
    expect(ends.map((e) => e[0])).toEqual(Array(5).fill(3 + CRASH_PIN_STUCK_S + 0.5));
    for (const e of ends) expect(e[1]).not.toBe("[]");
    expect(new Set(ends.slice(0, 4).map((e) => e[1])).size).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §7 · ROUND 4 — E11 / E13: a direction is named only while the way it points
// is FREE — the end the move heads toward more than SWEEP_RESOLUTION_M clear of
// EVERY listed body, on the pose the advice is shown on
// ───────────────────────────────────────────────────────────────────────────
//
// The round-3 verifier (`endings-verify/r3/replay-n26.json`, `replay-n14.json`):
// after the billed strike the car's OTHER end touched a SECOND listed wall
// inside the same open contact episode — unbilled, so the pin never re-armed
// and the bill's end was never re-measured — and the card's direction pressed
// it into that wall. The bill's end still picks the direction (E9) and the
// corrective (E10); the clearance on the shown pose may only withdraw it.

/**
 * A forward strike of a wall ahead (the FRONT half — «назад» by the bill's end),
 * held still at the contact pose until t `rollAt` (9), then (`rollBackM` > 0) rolled
 * straight back at 1 m/s WITHOUT any new contact event, and still again.
 * `second` places a second listed body against the REST pose (behind it: the
 * rear half's way; `gapM` its clearance). `reverse: true` mirrors it: a reverse
 * strike of a wall behind (the REAR half — «напред»), then rolled FORWARD
 * toward a body ahead.
 */
function wedgeDrive(
  lesson: LessonSpec,
  opts: { rollBackM: number; rollAt?: number; second?: { gapM: number }; reverse?: boolean; bodies?: "none" },
) {
  const sp = lesson.spawn.position ?? { x: 0, y: 0 };
  const hdg = lesson.spawn.headingDeg ?? 0;
  const h = (hdg * Math.PI) / 180;
  const dir = opts.reverse === true ? -1 : 1;
  const p = (d: number) => ({ x: sp.x + Math.sin(h) * d, y: sp.y + Math.cos(h) * d });
  const contact = { ...p(dir * 12), headingDeg: hdg };
  const rest = { ...p(dir * (12 - opts.rollBackM)), headingDeg: hdg };
  const bodies: Box[] = [boxAt(contact, dir > 0 ? "ahead" : "behind")];
  if (opts.second) bodies.push(boxAt(rest, dir > 0 ? "behind" : "ahead", opts.second.gapM));
  const ticks: SimTick[] = [];
  let t = 0;
  for (let i = 0; i < 6; i++, t += 0.5) ticks.push(makeTick({ t, speedKmh: dir * 20, headingDeg: hdg, position: p(dir * 2 * i) }));
  ticks.push(makeTick({ t, speedKmh: -dir * 2, headingDeg: hdg, position: p(dir * 12), events: [{ kind: "collision", withWhat: "staticObject" }] }));
  t += 0.5;
  for (; t < (opts.rollAt ?? 9) + 0.01; t += 0.5) ticks.push(makeTick({ t, speedKmh: 0, headingDeg: hdg, position: p(dir * 12) }));
  // Roll back (or forward, mirrored) at 1 m/s, 0.5 m per tick: no contact event.
  for (let d = 0.5; d <= opts.rollBackM + 1e-9; d += 0.5, t += 0.5) {
    ticks.push(makeTick({ t, speedKmh: -dir * 3.6, headingDeg: hdg, position: p(dir * (12 - d)) }));
  }
  for (; t < 40; t += 0.5) ticks.push(makeTick({ t, speedKmh: 0, headingDeg: hdg, position: p(dir * (12 - opts.rollBackM)) }));
  let s = createLessonSession(lesson, opts.bodies === "none" ? {} : { staticContactBodies: bodies });
  const holds: Array<{ t: number; way: string; card: string; peek: string | undefined; lead: string | null }> = [];
  const said: Said[] = [];
  const clears: Array<{ t: number; clear: unknown }> = [];
  for (const k of ticks) {
    const r = applyTick(s, k);
    s = r.state;
    clears.push({ t: k.t, clear: s.crashPin?.clear });
    for (const hh of r.hudEvents) if (hh.kind === "lesson" && /^Край/u.test(hh.titleBg ?? "")) said.push({ t: k.t, titleBg: hh.titleBg ?? "", text: (hh as { explanationBg?: string }).explanationBg ?? "" });
    if (s.phase === "driving" && routeHoldForSession(s) === "crashPinned") {
      const pr = advisorPromptForSession(s)!;
      const way = routeHoldWayOutForSession(s);
      holds.push({ t: k.t, way, card: pr.textBg, peek: pr.peekBg, lead: objectiveTitleUnderHold("ЗАДАЧА", "crashPinned", way) });
    }
  }
  return { s, holds, said, clears, contact, rest, bodies };
}

describe("E11 — the way out names a direction only while the end it heads toward is clear of EVERY listed body, on the pose it is shown on", () => {
  const park = () => compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === "sc-pk-driveway")!, 1);
  const P = { x: 10, y: 20, headingDeg: 35 };

  it("THE FACT · `crashPinClearEnds`: each half more than CRASH_PIN_WAY_CLEAR_M (= SWEEP_RESOLUTION_M, 0.15 m) from every listed body; no bodies → no fact", () => {
    expect(CRASH_PIN_WAY_CLEAR_M).toBe(SWEEP_RESOLUTION_M);
    expect(CRASH_PIN_WAY_CLEAR_M).toBe(0.15);
    expect(crashPinClearEnds(P, undefined)).toBeUndefined();
    expect(crashPinClearEnds(P, [])).toEqual({ front: true, rear: true });
    expect(crashPinClearEnds(P, [boxAt(P, "ahead")])).toEqual({ front: false, rear: true });
    expect(crashPinClearEnds(P, [boxAt(P, "behind")])).toEqual({ front: true, rear: false });
    // EVERY body: the one ahead is not the only one that counts.
    expect(crashPinClearEnds(P, [boxAt(P, "ahead"), boxAt(P, "behind", 0.002)])).toEqual({ front: false, rear: false });
    expect(crashPinClearEnds(P, [boxAt(P, "behind", 0.002), boxAt(P, "ahead")])).toEqual({ front: false, rear: false });
    expect(crashPinClearEnds(P, [boxAt(P, "alongside", 0.1)])).toEqual({ front: false, rear: false });
    expect(crashPinClearEnds(P, [boxAt(P, "frontSide", 0.1)])).toEqual({ front: false, rear: true });
    // The band's edge, both sides of 0.15 m — never wider.
    expect(crashPinClearEnds(P, [boxAt(P, "behind", 0.149)])!.rear).toBe(false);
    expect(crashPinClearEnds(P, [boxAt(P, "behind", 0.151)])!.rear).toBe(true);
    expect(crashPinClearEnds(P, [boxAt(P, "ahead", 0.149)])!.front).toBe(false);
    expect(crashPinClearEnds(P, [boxAt(P, "ahead", 0.151)])!.front).toBe(true);
  });

  it("THE WAY OUT · front → back only with the REAR clear, rear → forward only with the FRONT clear; otherwise, or with no clearance fact, direction-free", () => {
    for (const travel of ["forward", "reverse", "unknown"] as const) {
      const front = { travel, body: "staticObject" as const, end: "front" as const };
      const rear = { travel, body: "staticObject" as const, end: "rear" as const };
      expect(crashPinWayOut(front, { front: false, rear: true })).toBe("back");
      expect(crashPinWayOut(front, { front: true, rear: false })).toBe("away");
      expect(crashPinWayOut(front, { front: false, rear: false })).toBe("away");
      expect(crashPinWayOut(front)).toBe("away");
      expect(crashPinWayOut(rear, { front: true, rear: false })).toBe("forward");
      expect(crashPinWayOut(rear, { front: false, rear: true })).toBe("away");
      expect(crashPinWayOut(rear, { front: false, rear: false })).toBe("away");
      expect(crashPinWayOut(rear)).toBe("away");
    }
  });

  it("ENGINE · THE WEDGE (pk26's shape): struck by the FRONT, rests with its REAR 0.002 m from a SECOND listed wall — direction-free from the first hold frame; the corrective keeps the bill's end", () => {
    // The second wall is 0.102 m off the rear at the bill (the end reads FRONT) and is
    // reached 0.1 m later, before the hold — unbilled, no re-arm, as on pk26 — and the
    // front rests 0.11 m off the struck wall: pressed at BOTH ends.
    const d = wedgeDrive(park(), { rollBackM: 0.1, rollAt: 4, second: { gapM: 0.002 } });
    expect(d.s.crashPin?.impact).toEqual({ travel: "forward", body: "staticObject", end: "front" });
    expect(d.s.crashPin?.clear).toEqual({ front: false, rear: false });
    expect(d.holds.length).toBeGreaterThan(0);
    for (const h of d.holds) expect([h.way, h.card, h.peek, h.lead]).toEqual(["away", CARD.away, PEEK.away, `${LEAD.away}: ЗАДАЧА`]);
    // E10: the corrective describes the BILLED crash — a forward strike of the wall ahead.
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.staticAhead]);
  });

  it("ENGINE · RE-EVALUATED WHILE THE HOLD IS UP: «назад» while the rear is clear; the car rolls back (no new contact, no re-arm) to 0.05 m of a second wall — direction-free from then on", () => {
    const d = wedgeDrive(park(), { rollBackM: 1, second: { gapM: 0.05 } });
    expect(d.s.crashPin?.impact).toEqual({ travel: "forward", body: "staticObject", end: "front" });
    // At the bill the rear had 1.05 m of room; on the rest pose 0.05 m.
    expect(d.clears.find((c) => c.t === 3)!.clear).toEqual({ front: false, rear: true });
    expect(d.s.crashPin?.clear).toEqual({ front: true, rear: false });
    const before = d.holds.filter((h) => h.t <= 9);
    const after = d.holds.filter((h) => h.t >= 10);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    for (const h of before) expect([h.way, h.card, h.peek, h.lead]).toEqual(["back", CARD.back, PEEK.back, `${LEAD.back}: ЗАДАЧА`]);
    for (const h of after) expect([h.way, h.card, h.peek, h.lead]).toEqual(["away", CARD.away, PEEK.away, `${LEAD.away}: ЗАДАЧА`]);
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.staticAhead]);
  });

  it("ENGINE · the mirror: struck by the REAR in reverse, rolled forward to 0.05 m of a body ahead — «напред» withdrawn to direction-free; the reversing corrective stays", () => {
    const d = wedgeDrive(park(), { rollBackM: 1, second: { gapM: 0.05 }, reverse: true });
    expect(d.s.crashPin?.impact).toEqual({ travel: "reverse", body: "staticObject", end: "rear" });
    const before = d.holds.filter((h) => h.t <= 9);
    expect(before.length).toBeGreaterThan(0);
    for (const h of before) expect(h.way).toBe("forward");
    const after = d.holds.filter((h) => h.t >= 10);
    expect(after.length).toBeGreaterThan(0);
    for (const h of after) expect([h.way, h.card, h.peek, h.lead]).toEqual(["away", CARD.away, PEEK.away, `${LEAD.away}: ЗАДАЧА`]);
    expect(d.said.map((x) => x.text)).toEqual([OPENER + CORRECTIVE.reversing]);
  });

  it("ENGINE · the band on the rest pose: a second wall 0.149 m off the rear withdraws «назад»; 0.151 m keeps it", () => {
    for (const [gapM, way] of [
      [0.149, "away"],
      [0.151, "back"],
    ] as const) {
      const d = wedgeDrive(park(), { rollBackM: 0, second: { gapM } });
      expect(d.holds.length).toBeGreaterThan(0);
      for (const h of d.holds) expect(h.way).toBe(way);
    }
  });

  it("ENGINE · nothing graded moves: the pin's timing, the bill and the ending are those of the same drive without the second wall; a session handed no bodies carries no clearance field", () => {
    const one = wedgeDrive(park(), { rollBackM: 1 });
    const two = wedgeDrive(park(), { rollBackM: 1, second: { gapM: 0.05 } });
    expect(two.s.endedAtSec).toBe(one.s.endedAtSec);
    expect(two.s.endedAtSec).toBe(10.5 + CRASH_PIN_STUCK_S); // still again from t 10.5
    const viol = (x: typeof one) => JSON.stringify(x.s.events.filter((e) => e.kind === "violation").map((e) => [e.code, (e as { points?: number }).points, e.t]));
    expect(viol(two)).toBe(viol(one));
    expect(two.said).toEqual(one.said);
    expect(one.holds.length).toBeGreaterThan(0);
    for (const h of one.holds) expect(h.way).toBe("back");
    const none = wedgeDrive(park(), { rollBackM: 1, bodies: "none" });
    expect(none.s.crashPin !== undefined && "clear" in none.s.crashPin).toBe(false);
    expect(none.holds.length).toBeGreaterThan(0);
    for (const h of none.holds) expect(h.way).toBe("away");
  });
});
