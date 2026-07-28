/**
 * ROUTE FINISH — „стигнах до края, а изпитът не спира" (founder, 2026-07-28).
 *
 * The reported defect, verbatim: „did alot of mistakes and went to the end
 * line and the exam did not stop I had to continue go back trough the whole
 * blue line and do all correct and only than the exam stopped so I could see
 * my mistakes."
 *
 * The termination condition was „every objective satisfied", so an objective
 * the student drove past stalled the sequential chain forever and the drive
 * never ended. These tests pin the corrected rule and its two halves:
 *
 *   1. Reaching the end of the route ENDS the drive — with faults, with tasks
 *      skipped, in an exam or in a lesson — and the debrief that comes out of
 *      it names every mistake with its law citation and its corrective
 *      (THEO-4: no bare verdicts).
 *   2. FINISHING IS NOT PASSING. Such a drive is reported failed, and the
 *      gate never fires on a healthy run — the shipped curriculum still has
 *      to actually park, actually clear the roundabout, actually pass the
 *      last light.
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { PRE_DRIVE_STEP_ORDER } from "../../procedures";
import { buildDebrief } from "../debrief";
import {
  applyPreDriveStep,
  applyTick,
  buildLessonResult,
  createLessonSession,
} from "../engine";
import {
  createFinishGate,
  routeFinishZone,
  stepFinishGate,
  FINISH_BAY_RADIUS_M,
  FINISH_DWELL_S,
  FINISH_REST_KMH,
  FINISH_REST_S,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { EXAM_LESSON, L7_PARKING_BAY, lessonById, lessonsInOrder } from "../specs";
import type { LessonSessionState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// A three-leg test route: two waypoints beside the road (easily skipped by
// driving straight past them) and a finish waypoint on the road itself.
// ---------------------------------------------------------------------------

const WAYPOINT_1: LessonObjective = {
  id: "t-wp1",
  titleBg: "Отбий надясно към първата пресечка",
  kind: "reachZone",
  params: { x: 120, y: 150, radiusM: 15 },
};
const WAYPOINT_2: LessonObjective = {
  id: "t-wp2",
  titleBg: "Продължи до втората пресечка",
  kind: "reachZone",
  params: { x: 120, y: 320, radiusM: 15 },
};
const FINISH_WAYPOINT: LessonObjective = {
  id: "t-finish",
  titleBg: "Спри в края на маршрута",
  kind: "reachZone",
  params: { x: 0, y: 500, radiusM: 15 },
};

const baseLesson: Omit<LessonSpec, "id"> = {
  order: 99,
  titleBg: "Тестов маршрут",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [WAYPOINT_1, WAYPOINT_2, FINISH_WAYPOINT],
};

const routeLesson: LessonSpec = { ...baseLesson, id: "t-route" };
const examRouteLesson: LessonSpec = { ...baseLesson, id: "t-route-exam", examMode: true };

/**
 * Straight north up x = 0 — never within 15 m of either waypoint (both sit
 * 120 m east) — with TWO speeding episodes at 56 km/h in a 50 zone. Two,
 * because a training lesson coaches the first encounter and grades the repeat
 * (teach-first-then-grade); the point of the test is a drive that carries a
 * scored fault to the finish. 1 metre of northing per tick keeps the
 * arithmetic readable.
 */
function badDriveToTheFinish(): SimTick[] {
  const speeding = (y: number) => (y < 6) || (y >= 200 && y < 206);
  const ticks: SimTick[] = [];
  for (let y = 0; y <= 510; y++) {
    ticks.push(
      makeTick({ t: y, speedKmh: speeding(y) ? 56 : 40, position: { x: 0, y }, maxSpeedKmh: 50 }),
    );
  }
  return ticks;
}

function run(
  state: LessonSessionState,
  ticks: SimTick[],
): { state: LessonSessionState; hud: HudEvent[] } {
  let s = state;
  const hud: HudEvent[] = [];
  for (const tick of ticks) {
    const r = applyTick(s, tick);
    s = r.state;
    hud.push(...r.hudEvents);
  }
  return { state: s, hud };
}

// ---------------------------------------------------------------------------
// 1. The founder's drive: mistakes, skipped tasks — and it still ENDS
// ---------------------------------------------------------------------------

describe("the drive ends at the finish even when it was driven badly", () => {
  it("a lesson with faults and skipped waypoints terminates on arrival", () => {
    const r = run(createLessonSession(routeLesson), badDriveToTheFinish());

    expect(r.state.phase).toBe("completed");
    expect(r.state.endedAtSec).not.toBeNull();
    expect(r.state.finishGate?.reachedAtSec).not.toBeNull();
    // It ended AT the finish, not somewhere along the way: the zone spans
    // y = 485…515, plus the half-second glitch dwell.
    expect(r.state.endedAtSec!).toBeGreaterThanOrEqual(485 + FINISH_DWELL_S);
    expect(r.state.endedAtSec!).toBeLessThanOrEqual(515);
  });

  it("the debrief it produces LISTS the mistakes, with law and corrective", () => {
    const r = run(createLessonSession(routeLesson), badDriveToTheFinish());
    const result = buildLessonResult(r.state);

    // The fault is on the record and was never suppressed by the early end.
    expect(result.summary.mistakes.map((m) => m.code)).toContain("SPEEDING_OVER_LIMIT");

    const { text } = buildDebrief(routeLesson, result);
    expect(text).toContain("Най-важните грешки");
    expect(text).toContain(result.summary.mistakes[0].titleBg);
    // THEO-4: never a bare verdict — the law citation and the authored
    // corrective ride along with every listed mistake.
    expect(text).toContain(result.summary.mistakes[0].lawRef!);
    expect(text).toContain("Правилното действие:");
    // And it explains why the route itself did not count.
    expect(text).toContain("остана неизпълнена задача от маршрута");
  });

  it("FINISHING IS NOT PASSING — the ended drive is reported as failed", () => {
    const r = run(createLessonSession(routeLesson), badDriveToTheFinish());
    const result = buildLessonResult(r.state);

    expect(result.passed).toBe(false);
    expect(result.completedAll).toBe(false);
    expect(result.aborted).toBe(false); // it FINISHED — it was not a quit
    // The skipped waypoints stay skipped, and the finish objective is ARRIVED
    // AT, not performed: the gate never fakes an objective completion.
    expect(result.objectives.map((o) => o.done)).toEqual([false, false, false]);
  });

  it("explains at the moment it happens, instead of just cutting to black", () => {
    const r = run(createLessonSession(routeLesson), badDriveToTheFinish());
    const closing = r.hud.filter((e) => e.kind === "lesson" && e.titleBg.includes("Край на"));
    expect(closing).toHaveLength(1);
    const [event] = closing as Array<Extract<HudEvent, { kind: "lesson" }>>;
    expect(event.explanationBg).toContain("разборът");
  });

  it("holds for an EXAM route too — a finished exam is not a terminated one", () => {
    const r = run(createLessonSession(examRouteLesson), badDriveToTheFinish());
    const result = buildLessonResult(r.state);

    expect(r.state.phase).toBe("completed");
    expect(result.passed).toBe(false);
    // 1 т. never crossed an official limit, so this is a FINISH, not an A13
    // termination — the two endings stay distinguishable in the record.
    expect(result.examTermination).toBeUndefined();
    expect(r.hud.some((e) => e.kind === "lesson" && e.titleBg.includes("изпитния"))).toBe(true);
  });

  it("without the gate the same drive would never stop (control)", () => {
    // Same route, but the terminal objective is a smooth stop — nowhere to
    // arrive, so no automatic finish exists and the chain remains the only
    // termination path. This is the OLD behavior, pinned as the contrast.
    const noFinish: LessonSpec = {
      ...baseLesson,
      id: "t-route-no-finish",
      objectives: [
        WAYPOINT_1,
        WAYPOINT_2,
        {
          id: "t-stop",
          titleBg: "Спри плавно",
          kind: "completeManeuver",
          params: { maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 },
        },
      ],
    };
    const r = run(createLessonSession(noFinish), badDriveToTheFinish());
    expect(r.state.phase).toBe("driving");
    expect(r.state.finishGate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. The real exam route
// ---------------------------------------------------------------------------

describe("the shipped exam route (EXAM_LESSON)", () => {
  /** Straight-line hop from the spawn area to the bay, 5 m per tick, then the
   *  car stands there — the candidate at the end line, wondering why nothing
   *  happened. That standstill is the arrival. */
  function driveToTheBay(): SimTick[] {
    const from = { x: 383, y: 66 }; // the Б2 stop the exam opens on
    const to = { x: L7_PARKING_BAY.x, y: L7_PARKING_BAY.y };
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 5);
    const ticks: SimTick[] = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      ticks.push(
        makeTick({
          t: i,
          speedKmh: 30,
          position: { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f },
        }),
      );
    }
    for (let i = 1; i <= 6; i++) {
      ticks.push(makeTick({ t: steps + i, speedKmh: 0, position: { ...to } }));
    }
    return ticks;
  }

  /** The exam opens with the 13-step pre-drive; walk it in order to `driving`. */
  function readyToDrive(): LessonSessionState {
    let s = createLessonSession(EXAM_LESSON);
    PRE_DRIVE_STEP_ORDER.forEach((id, i) => {
      s = applyPreDriveStep(s, id, i).state;
    });
    expect(s.phase).toBe("driving");
    return s;
  }

  it("ends at the bay with the objective chain still stalled on task one", () => {
    // Nothing about this drive satisfies ex-stop-b2 — no stop line is ever
    // crossed — so the chain cannot advance, exactly as the founder hit it.
    const r = run(readyToDrive(), driveToTheBay());

    expect(r.state.currentObjectiveIndex).toBe(0);
    expect(r.state.phase).toBe("completed");

    const result = buildLessonResult(r.state);
    expect(result.passed).toBe(false);
    expect(result.completedAll).toBe(false);
    expect(result.objectives.every((o) => !o.done)).toBe(true);
  });

  it("its finish zone is the painted bay and nothing else", () => {
    const zone = routeFinishZone(EXAM_LESSON.objectives.map(parseObjectiveParams));
    expect(zone).not.toBeNull();
    expect(zone!.x).toBe(L7_PARKING_BAY.x);
    expect(zone!.y).toBe(L7_PARKING_BAY.y);
    // The clamp does not bind on a 2.5 km street route (nearest earlier
    // waypoint is 62 m away), so the full bay radius survives.
    expect(zone!.radiusM).toBe(FINISH_BAY_RADIUS_M);
    // A bay is arrived at, not crossed.
    expect(zone!.maxSpeedKmh).toBe(FINISH_REST_KMH);
    expect(zone!.dwellSec).toBe(FINISH_REST_S);
  });

  it("does NOT end while the candidate is still rolling past the bay", () => {
    // The parallel-park precedent: a route can drive through its own bay on
    // the way to the pose it parks from. Presence is not arrival.
    const zone = routeFinishZone(EXAM_LESSON.objectives.map(parseObjectiveParams))!;
    let gate = createFinishGate();
    gate = stepFinishGate(gate, zone, makeTick({ t: 0, position: { x: zone.x + 200, y: zone.y } }));
    for (let i = 1; i <= 20; i++) {
      gate = stepFinishGate(
        gate,
        zone,
        makeTick({ t: i, speedKmh: 20, position: { x: zone.x, y: zone.y } }),
      );
    }
    expect(gate.reachedAtSec).toBeNull();
    // Coming to a stop there IS arrival.
    for (let i = 21; i <= 26; i++) {
      gate = stepFinishGate(
        gate,
        zone,
        makeTick({ t: i, speedKmh: 0, position: { x: zone.x, y: zone.y } }),
      );
    }
    expect(gate.reachedAtSec).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// 3. Healthy runs are untouched
// ---------------------------------------------------------------------------

describe("the gate never fires on a run that is progressing", () => {
  it("arriving at the finish with the chain ON it completes it normally", () => {
    // Drive through both waypoints first, then to the finish: the chain is on
    // the last objective when the car arrives, so the ORIGINAL path ends the
    // session — objectives all done, lesson passed.
    const ticks: SimTick[] = [];
    let t = 0;
    const leg = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 5);
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        ticks.push(
          makeTick({
            t: t++,
            speedKmh: 30,
            position: { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f },
          }),
        );
      }
    };
    leg({ x: 0, y: 0 }, { x: 120, y: 150 });
    leg({ x: 120, y: 150 }, { x: 120, y: 320 });
    leg({ x: 120, y: 320 }, { x: 0, y: 500 });

    const r = run(createLessonSession(routeLesson), ticks);
    const result = buildLessonResult(r.state);
    expect(r.state.phase).toBe("completed");
    expect(result.completedAll).toBe(true);
    expect(result.passed).toBe(true);
    // Ended through the chain, not the gate.
    expect(r.state.finishGate?.reachedAtSec ?? null).toBeNull();
  });

  it("a car that SPAWNS inside its own finish zone never trips the gate", () => {
    const zone = { x: 0, y: 0, radiusM: 20, dwellSec: FINISH_DWELL_S };
    let gate = createFinishGate();
    for (let t = 0; t < 30; t++) {
      gate = stepFinishGate(gate, zone, makeTick({ t, position: { x: 0, y: t / 10 } }));
    }
    expect(gate.armed).toBe(false);
    expect(gate.reachedAtSec).toBeNull();
  });

  it("one stray frame inside the zone is not an arrival", () => {
    const zone = { x: 100, y: 0, radiusM: 10, dwellSec: FINISH_DWELL_S };
    let gate = createFinishGate();
    gate = stepFinishGate(gate, zone, makeTick({ t: 0, position: { x: 0, y: 0 } }));
    expect(gate.armed).toBe(true);
    gate = stepFinishGate(gate, zone, makeTick({ t: 1, position: { x: 100, y: 0 } }));
    expect(gate.reachedAtSec).toBeNull(); // dwell not yet met
    gate = stepFinishGate(gate, zone, makeTick({ t: 1.2, position: { x: 0, y: 0 } }));
    expect(gate.insideSinceSec).toBeNull(); // left again → dwell cleared
    expect(gate.reachedAtSec).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. The derivation itself
// ---------------------------------------------------------------------------

describe("routeFinishZone", () => {
  const zone = (x: number, y: number, radiusM: number): ObjectiveParams => ({
    kind: "reachZone",
    x,
    y,
    radiusM,
  });

  it("a single-objective route has no separate finish", () => {
    expect(routeFinishZone([zone(0, 0, 20)])).toBeNull();
  });

  it("terminal objectives with nowhere to arrive get no finish", () => {
    const first = zone(0, 0, 10);
    expect(
      routeFinishZone([first, { kind: "driveDistance", meters: 300 }]),
    ).toBeNull();
    expect(
      routeFinishZone([
        first,
        { kind: "completeManeuver", maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 },
      ]),
    ).toBeNull();
    // The roundabout island is where the WORK is, not where the route ends.
    expect(
      routeFinishZone([
        first,
        {
          kind: "completeManeuver",
          maneuver: "roundabout",
          x: 200,
          y: 0,
          enterRadiusM: 26,
          exitRadiusM: 45,
        },
      ]),
    ).toBeNull();
  });

  it("clamps to half the gap so a finish can never swallow the leg before it", () => {
    // 60 m apart → the 40 m terminal zone is cut to 30 m.
    expect(routeFinishZone([zone(0, 0, 10), zone(60, 0, 40)])).toEqual({
      x: 60,
      y: 0,
      radiusM: 30,
      dwellSec: FINISH_DWELL_S,
    });
    // Comfortably spaced → the authored radius survives untouched.
    expect(routeFinishZone([zone(0, 0, 10), zone(400, 0, 20)])).toEqual({
      x: 400,
      y: 0,
      radiusM: 20,
      dwellSec: FINISH_DWELL_S,
    });
  });

  it("a route too compact to hold a finish zone simply has none", () => {
    expect(routeFinishZone([zone(0, 0, 10), zone(4, 0, 10)])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Shipped-curriculum invariant
// ---------------------------------------------------------------------------

describe("every shipped lesson keeps a workable finish", () => {
  const shipped: LessonSpec[] = [
    ...lessonsInOrder(),
    EXAM_LESSON,
    ...["l8-poligon-basics"].flatMap((id) => {
      const l = lessonById(id);
      return l ? [l] : [];
    }),
  ];

  it("no derived finish zone contains an earlier waypoint of the same route", () => {
    for (const lesson of shipped) {
      const params = lesson.objectives.map(parseObjectiveParams);
      const finish = routeFinishZone(params);
      if (finish === null) continue;
      for (let i = 0; i < params.length - 1; i++) {
        const p = params[i];
        const point =
          p.kind === "reachZone" || p.kind === "passSignal"
            ? { x: p.x, y: p.y }
            : p.kind === "completeManeuver" && p.maneuver === "parkInBay"
              ? { x: p.bay.x, y: p.bay.y }
              : null;
        if (point === null) continue;
        const d = Math.hypot(point.x - finish.x, point.y - finish.y);
        expect(
          d,
          `${lesson.id}: waypoint ${lesson.objectives[i].id} sits inside the finish zone`,
        ).toBeGreaterThan(finish.radiusM);
      }
    }
  });
});
