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
  terminalRescueZone,
  FINISH_BAY_RADIUS_M,
  FINISH_BAY_STUCK_S,
  FINISH_DWELL_S,
  FINISH_LANE_FLOOR_M,
  FINISH_LEAVE_S,
  FINISH_REST_KMH,
  FINISH_REST_S,
  FINISH_STANDSTILL_KMH,
  FINISH_STUCK_S,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { EXAM_LESSON, L7_PARKING_BAY, lessonById, LESSONS } from "../specs";
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
    // And it explains why the route itself did not count. STRENGTHENED
    // 2026-08-17: the verdict used to end at the bare „остана неизпълнена
    // задача от маршрута", which the 2026-08-16 sweep caught being useless —
    // sc-ov-keep-right's student was told a task was open and never which one.
    // It now quotes the open rows by title (debrief.ts `unfinishedTaskPhrase`),
    // so this asserts the NAME and not just the excuse. This drive skips both
    // side waypoints, so the plural head is the one that prints.
    expect(text).toContain("останаха неизпълнени задачите");
    expect(text).toContain(`«${WAYPOINT_1.titleBg}»`);
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
// 3a. B-NEW-1 — „it ends itself ~40 s after load while the car is parked"
// ---------------------------------------------------------------------------

/**
 * The defect, verbatim from doc 87:229: „A scenario session ENDS ITSELF ~40 s
 * after load while the car is parked at spawn, untouched … a student who
 * pauses to look around the roundabout for half a minute is handed a резултат
 * he never drove."
 *
 * The cause was not the rubric's parTimeSec (that stayed informational, as
 * documented). It was the PLACEHOLDER POSE: scene/vehicleSample.ts publishes
 * the district origin at zero speed for the frames before the chassis writes
 * its first pose, `rb-mini-v1` centres its ring on exactly (0, 0), and the
 * finish gates — unlike the objective chain — were not behind the frame-zero
 * pose guard. One placeholder frame armed „you have left the ring"; the car
 * then dwelt outside the ring at its own spawn and the drive „finished"
 * FINISH_LEAVE_S later.
 *
 * These two tests are the before/after of that exact sequence, at the exact
 * shipped geometry (ring centre (0,0) / enter 24 / exit 34, spawn
 * rbm-spawn-south at (4.06, −93)).
 */
describe("B-NEW-1 — a drive that has not begun cannot end", () => {
  const RB_OBJECTIVES: LessonObjective[] = [
    {
      id: "rb-approach",
      titleBg: "Приближи кръга",
      kind: "reachZone",
      params: { x: 4.06, y: -34, radiusM: 9, maxSpeedKmh: 25 },
    },
    {
      id: "rb-ring",
      titleBg: "Премини кръговото",
      kind: "completeManeuver",
      params: { maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 24, exitRadiusM: 34 },
    },
  ];
  const RB_LESSON: LessonSpec = {
    ...baseLesson,
    id: "t-rb-parked",
    titleBg: "Кръгово — паркирана кола",
    objectives: RB_OBJECTIVES,
  };
  const SPAWN = { x: 4.06, y: -93 };

  /** Tick the session `sec` seconds at 30 Hz, standing still at `pos`. */
  function idle(state: LessonSessionState, pos: { x: number; y: number }, sec: number) {
    let s = state;
    for (let i = 1; i <= sec * 30; i++) {
      s = applyTick(s, makeTick({ t: i / 30, speedKmh: 0, position: { ...pos } })).state;
      if (s.phase !== "driving") return { state: s, endedAtSec: i / 30 };
    }
    return { state: s, endedAtSec: null as number | null };
  }

  it("the placeholder pose at the district origin no longer arms the finish", () => {
    let s = createLessonSession(RB_LESSON);
    // Frame 1: exactly what createVehicleSample() publishes — origin, 0 km/h.
    // This is the frame that used to arm the roundabout's leave-the-ring gate.
    s = applyTick(s, makeTick({ t: 0, speedKmh: 0, position: { x: 0, y: 0 } })).state;
    expect(s.posedAtSec).toBeUndefined(); // not a described vehicle
    expect(s.finishGate?.armed ?? false).toBe(false);
    expect(s.finishRescueGate?.armed ?? false).toBe(false);

    // Now the chassis publishes and the student does nothing for two minutes.
    const { state, endedAtSec } = idle(s, SPAWN, 120);
    expect(endedAtSec).toBeNull();
    expect(state.phase).toBe("driving");
  });

  it("…and it took exactly one such frame to end the drive before the guard", () => {
    // The pre-fix arithmetic, pinned on the raw gate so the regression is
    // visible even if the engine wiring moves: one frame inside the arming
    // circle, then a parked car outside the ring, and FINISH_LEAVE_S later
    // the gate says the route is behind him.
    const rb = routeFinishZone(RB_OBJECTIVES.map(parseObjectiveParams))!;
    expect(rb.mode).toBe("outside");
    let gate = createFinishGate();
    gate = stepFinishGate(gate, rb, makeTick({ t: 0, speedKmh: 0, position: { x: 0, y: 0 } }));
    expect(gate.armed).toBe(true); // the placeholder is inside enterRadiusM 24
    for (let i = 1; i <= FINISH_LEAVE_S * 30 + 2; i++) {
      gate = stepFinishGate(gate, rb, makeTick({ t: i / 30, speedKmh: 0, position: SPAWN }));
    }
    expect(gate.reachedAtSec).not.toBeNull();
    expect(gate.reachedAtSec!).toBeLessThan(FINISH_LEAVE_S + 1);
  });

  it("a real drive still finishes: the guard costs one frame, not the gate", () => {
    let s = createLessonSession(RB_LESSON);
    s = applyTick(s, makeTick({ t: 0, speedKmh: 0, position: { x: 0, y: 0 } })).state;
    // Drive to the ring, circulate, then leave northwards and keep going.
    let t = 0;
    const drive = (pos: { x: number; y: number }, sec: number, kmh = 25) => {
      for (let i = 0; i < sec * 30; i++) {
        t += 1 / 30;
        s = applyTick(s, makeTick({ t, speedKmh: kmh, position: pos })).state;
      }
    };
    drive({ x: 4.06, y: -34 }, 1, 20); // the give-way checkpoint, slow enough
    drive({ x: 0, y: -18 }, 2, 20); // on the ring
    drive({ x: 4.06, y: 60 }, FINISH_LEAVE_S + 1, 30); // gone, and staying gone
    expect(s.phase).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// 3b. B2 — the rescue on the FINAL objective, and the two runs it must NOT eat
// ---------------------------------------------------------------------------

describe("B2 — a student stuck ON the last gate can get out", () => {
  /** A route whose last gate is a lane-exclusive radius-4 circle: the shape
   *  50 of 154 templates ship, and the one the founder's left-lane hog lands
   *  8.13 m away from after performing the mistake the lesson taught him. */
  const tightFinal: LessonSpec = {
    ...baseLesson,
    id: "t-route-tight-final",
    objectives: [
      WAYPOINT_1,
      { id: "t-final", titleBg: "Спри в дясната лента", kind: "reachZone", params: { x: 0, y: 500, radiusM: 4 } },
    ],
  };

  it("the rescue exists on the terminal objective and is floored to a lane", () => {
    const rescue = terminalRescueZone(tightFinal.objectives.map(parseObjectiveParams))!;
    expect(rescue.radiusM).toBe(FINISH_LANE_FLOOR_M);
    // Standstill-gated, unlike the stalled-chain zone.
    expect(rescue.maxSpeedKmh).toBe(FINISH_STANDSTILL_KMH);
    expect(rescue.dwellSec).toBe(FINISH_STUCK_S);
  });

  it("a car stopped ONE LANE OVER at the route's end is released", () => {
    const ticks: SimTick[] = [];
    let t = 0;
    // Complete waypoint 1 so the chain really is on the terminal objective.
    for (let i = 0; i <= 30; i++) {
      ticks.push(makeTick({ t: t++, speedKmh: 30, position: { x: 120 * (i / 30), y: 150 * (i / 30) } }));
    }
    // Drive to the end of the route but in the ADJACENT lane — 8.13 m from
    // the radius-4 gate, the exact offset doc 86 B3 measures — and stop.
    for (let i = 0; i <= 40; i++) {
      ticks.push(makeTick({ t: t++, speedKmh: 30, position: { x: 120 - 112 * (i / 40), y: 150 + 350 * (i / 40) } }));
    }
    for (let i = 0; i < 40; i++) {
      ticks.push(makeTick({ t: t++, speedKmh: 0, position: { x: 8.13, y: 500 } }));
    }

    const r = run(createLessonSession(tightFinal), ticks);
    expect(r.state.currentObjectiveIndex).toBe(1); // on the last gate, stuck
    expect(r.state.phase).toBe("completed");
    const result = buildLessonResult(r.state);
    expect(result.completedAll).toBe(false); // released, never faked
    expect(result.objectives[1].done).toBe(false);
    // …and it said why, at the moment it happened.
    expect(
      r.hud.some((e) => e.kind === "lesson" && e.titleBg === "Край на маршрута"),
    ).toBe(true);
  });

  /**
   * doc 86's own prescription for B2 reads: „drop the `currentIndex <
   * objectives.length - 1` guard … safe by construction, because
   * stepFinishGate refuses to trip until the car has been observed OUTSIDE the
   * zone once and then dwells." Measured against the shipped exam, it is not
   * safe by construction, and this is the counter-example.
   *
   * EXAM_LESSON's terminal objective is the park. Its stalled-chain zone is a
   * 14 m circle at ≤3 km/h held 3 s. A candidate who rolls up 10 m short of
   * the bay at walking pace to plan the reverse — the correct thing to do — is
   * inside that circle, under that cap, for far longer than that dwell. The
   * naive fix would have ended his exam, unparked, while he was doing it
   * right: a worse bug than the one being fixed.
   *
   * Hence the separate `terminalRescueZone`, and hence FINISH_BAY_STUCK_S.
   */
  it("COUNTER-PROOF: it does NOT eat the exam candidate lining up for the bay", () => {
    const params = EXAM_LESSON.objectives.map(parseObjectiveParams);
    const stalled = routeFinishZone(params)!;
    const rescue = terminalRescueZone(params)!;

    // What the naive fix would have used, and what it would have done.
    expect(stalled.maxSpeedKmh).toBe(FINISH_REST_KMH);
    expect(stalled.dwellSec).toBe(FINISH_REST_S);

    const lineUp: SimTick[] = [];
    // Approach from far away (arms the gate), then creep the last stretch at
    // 2 km/h for twenty seconds — inside the 14 m circle the whole time.
    lineUp.push(makeTick({ t: 0, speedKmh: 30, position: { x: stalled.x + 200, y: stalled.y } }));
    for (let i = 1; i <= 80; i++) {
      lineUp.push(
        makeTick({ t: i * 0.25, speedKmh: 2, position: { x: stalled.x + 10, y: stalled.y } }),
      );
    }
    let naive = createFinishGate();
    for (const tick of lineUp) naive = stepFinishGate(naive, stalled, tick);
    expect(naive.reachedAtSec, "the stalled-chain zone WOULD have ended it").not.toBeNull();

    // The rescue that actually ships does not: it wants a full standstill.
    let real = createFinishGate();
    for (const tick of lineUp) real = stepFinishGate(real, rescue, tick);
    expect(real.reachedAtSec).toBeNull();
    expect(rescue.maxSpeedKmh).toBe(FINISH_STANDSTILL_KMH);
    expect(rescue.dwellSec).toBe(FINISH_BAY_STUCK_S);
  });

  it("…but a candidate who has genuinely stopped trying IS released", () => {
    const params = EXAM_LESSON.objectives.map(parseObjectiveParams);
    const rescue = terminalRescueZone(params)!;
    let gate = createFinishGate();
    gate = stepFinishGate(
      gate,
      rescue,
      makeTick({ t: 0, speedKmh: 30, position: { x: rescue.x + 200, y: rescue.y } }),
    );
    for (let i = 1; i <= 4 * (FINISH_BAY_STUCK_S + 2); i++) {
      gate = stepFinishGate(
        gate,
        rescue,
        makeTick({ t: i * 0.25, speedKmh: 0, position: { x: rescue.x + 10, y: rescue.y } }),
      );
    }
    // The dwell starts on the first standstill frame (t = 0.25), not at t = 0.
    expect(gate.reachedAtSec).toBe(0.25 + FINISH_BAY_STUCK_S);
  });

  it("COUNTER-PROOF: it does NOT eat a driver waiting out a red he must wait out", () => {
    // l2-intersections ends on a requireRedMet junction whose retry is
    // designed and feasible (every light shows red 26 s of every 50 s). An
    // inside-zone rescue there would close the lesson on a stationary car
    // doing exactly the right thing.
    const l2 = lessonById("l2-intersections")!;
    const params = l2.objectives.map(parseObjectiveParams);
    expect(terminalRescueZone(params)).toBeNull();
    // The stalled-chain anchor is an "outside" zone for the same reason: a
    // junction is passed THROUGH, so the end of the route is its far side.
    expect(routeFinishZone(params)!.mode).toBe("outside");
  });
});

// ---------------------------------------------------------------------------
// 3c. The two silences (B4 / B6) — states that used to produce NOTHING
// ---------------------------------------------------------------------------

describe("a task that will not complete says why, once", () => {
  it("B4: on the mark and over the cap → one card naming both numbers", () => {
    const capped: LessonSpec = {
      ...baseLesson,
      id: "t-route-capped",
      objectives: [
        {
          id: "t-slow",
          titleBg: "Мини бавно през стеснението",
          kind: "reachZone",
          params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: 20 },
        },
        FINISH_WAYPOINT,
      ],
    };
    const ticks: SimTick[] = [];
    for (let y = 0; y <= 130; y++) {
      ticks.push(makeTick({ t: y, speedKmh: 34, position: { x: 0, y } }));
    }
    const r = run(createLessonSession(capped), ticks);
    const cards = r.hud.filter(
      (e) => e.kind === "lesson" && e.titleBg === "Стигна точката, но твърде бързо",
    ) as Array<Extract<HudEvent, { kind: "lesson" }>>;

    // Said once — not on all eleven frames inside the zone.
    expect(cards).toHaveLength(1);
    // THEO-4: the measured number, the required number, and what to do.
    expect(cards[0].explanationBg).toContain("20 км/ч");
    expect(cards[0].explanationBg).toContain("34 км/ч");
    expect(cards[0].explanationBg).toContain("Намали");
  });

  it("B4: the blown waypoint no longer HANGS the lesson — the drive still ends", () => {
    // The overshoot is not forgiven (see objectives.test.ts for why: on a stop
    // drill the overshoot IS the graded failure). What changes is that it is
    // no longer a dead end: the chain stalls on task 1, the student drives on,
    // and the route-finish gate delivers him to the debrief.
    const capped: LessonSpec = {
      ...baseLesson,
      id: "t-route-capped-recover",
      objectives: [
        {
          id: "t-slow",
          titleBg: "Мини бавно през стеснението",
          kind: "reachZone",
          params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: 20 },
        },
        FINISH_WAYPOINT,
      ],
    };
    const ticks: SimTick[] = [];
    for (let y = 0; y <= 510; y++) ticks.push(makeTick({ t: y, speedKmh: 34, position: { x: 0, y } }));

    const r = run(createLessonSession(capped), ticks);
    expect(r.state.objectives[0].status).toBe("active"); // still stalled on task 1
    expect(r.state.phase).toBe("completed"); // …and the drive still ended
    const result = buildLessonResult(r.state);
    expect(result.completedAll).toBe(false);
  });

  it("B4: and slowing down on the APPROACH is credited, so the discipline pays", () => {
    const capped: LessonSpec = {
      ...baseLesson,
      id: "t-route-capped-approach",
      objectives: [
        {
          id: "t-slow",
          titleBg: "Мини бавно през стеснението",
          kind: "reachZone",
          params: { x: 0, y: 100, radiusM: 6, maxSpeedKmh: 20 },
        },
        FINISH_WAYPOINT,
      ],
    };
    const ticks: SimTick[] = [];
    for (let y = 0; y <= 90; y++) ticks.push(makeTick({ t: y, speedKmh: 34, position: { x: 0, y } }));
    // Brakes to 16 km/h 6 m BEFORE the circle, then rolls through a shade over.
    ticks.push(makeTick({ t: 91, speedKmh: 16, position: { x: 0, y: 94 } }));
    ticks.push(makeTick({ t: 92, speedKmh: 24, position: { x: 0, y: 100 } }));

    const r = run(createLessonSession(capped), ticks);
    expect(r.state.objectives[0].status).toBe("done");
    expect(r.state.currentObjectiveIndex).toBe(1);
  });

  it("B6: an unsignalled roundabout exit explains itself and cites the article", () => {
    const rbLesson: LessonSpec = {
      ...baseLesson,
      id: "t-route-rb",
      objectives: [
        WAYPOINT_1,
        {
          id: "t-rb",
          titleBg: "Излез от кръговото с десен мигач",
          kind: "completeManeuver",
          params: {
            maneuver: "roundabout",
            x: 0,
            y: 400,
            enterRadiusM: 24,
            exitRadiusM: 34,
          },
        },
      ],
    };
    // The RIDE matters as of 2026-08-17: the void card belongs to a student who
    // drove the roundabout and left it silently, so the drive has to contain a
    // roundabout. These three poses are on the ring (r = 18 about (0, 400)) at
    // 20° / 70° / 120° about the island — a first-exit passage. A car that only
    // touched the entry circle and turned away is a different student, gets no
    // card, and is the false pass ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG refuses.
    const onRing = (t: number, azDeg: number, speedKmh = 20): SimTick =>
      makeTick({
        t,
        speedKmh,
        position: {
          x: 18 * Math.sin((azDeg * Math.PI) / 180),
          y: 400 - 18 * Math.cos((azDeg * Math.PI) / 180),
        },
      });
    const ticks: SimTick[] = [
      makeTick({ t: 0, speedKmh: 30, position: { x: 120, y: 150 } }), // waypoint 1
      makeTick({ t: 1, speedKmh: 30, position: { x: 0, y: 340 } }), // approaching
      onRing(2, 20), // in at the south-east mouth…
      onRing(2.5, 70),
      onRing(3, 120), // …round past the east exit
      makeTick({ t: 4, speedKmh: 25, position: { x: 0, y: 440 } }), // out, no indicator
    ];
    const r = run(createLessonSession(rbLesson), ticks);
    const cards = r.hud.filter(
      (e) => e.kind === "lesson" && e.titleBg === "Излезе от кръговото без десен мигач",
    ) as Array<Extract<HudEvent, { kind: "lesson" }>>;
    expect(cards).toHaveLength(1);
    expect(cards[0].lawRef).toBe("ЗДвП чл. 25");
    // …and it says what to do next, not just what went wrong.
    expect(cards[0].explanationBg).toContain("върни се в кръговото");
  });

  it("B6: and driving on from there ENDS the lesson instead of hanging it", () => {
    const rbLesson: LessonSpec = {
      ...baseLesson,
      id: "t-route-rb-leave",
      objectives: [
        WAYPOINT_1,
        {
          id: "t-rb",
          titleBg: "Излез от кръговото с десен мигач",
          kind: "completeManeuver",
          params: {
            maneuver: "roundabout",
            x: 0,
            y: 400,
            enterRadiusM: 24,
            exitRadiusM: 34,
          },
        },
      ],
    };
    const ticks: SimTick[] = [
      makeTick({ t: 0, speedKmh: 30, position: { x: 120, y: 150 } }),
      makeTick({ t: 1, speedKmh: 30, position: { x: 0, y: 390 } }), // enters the ring
    ];
    for (let t = 2; t <= 2 + FINISH_LEAVE_S + 2; t++) {
      ticks.push(makeTick({ t, speedKmh: 30, position: { x: 0, y: 500 } })); // 100 m out
    }
    const r = run(createLessonSession(rbLesson), ticks);
    expect(r.state.phase).toBe("completed");
    const result = buildLessonResult(r.state);
    expect(result.completedAll).toBe(false);
    expect(result.objectives[1].done).toBe(false);
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
    // „Drive 300 m" and „stop smoothly" happen wherever the road puts them —
    // there is no coordinate to end at, and inventing one would end drives at
    // an arbitrary point.
    expect(
      routeFinishZone([first, { kind: "driveDistance", meters: 300 }]),
    ).toBeNull();
    expect(
      routeFinishZone([
        first,
        { kind: "completeManeuver", maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 },
      ]),
    ).toBeNull();
  });

  /**
   * B1 (doc 86 §3) — RE-BASELINED 2026-07-30. This block used to assert that a
   * terminal roundabout yields NO finish zone, on the reasoning that „the
   * island is where the WORK is, not where the route ends". The premise is
   * right and the conclusion was wrong: ten routes (six roundabout drills,
   * four turn drills) consequently had no termination path AT ALL, and the
   * founder's most repeated complaint — «the only solution was refreshing the
   * entire webpage» — is exactly this.
   *
   * The route does not end at the island. It ends when the island is BEHIND
   * you. That is an "outside" zone: armed by entering, tripped by leaving.
   */
  it("B1: a maneuver worked THROUGH anchors on LEAVING it, not on arriving", () => {
    const rb = routeFinishZone([
      zone(0, 0, 10),
      {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 200,
        y: 0,
        enterRadiusM: 26,
        exitRadiusM: 45,
      },
    ]);
    expect(rb).not.toBeNull();
    expect(rb!.mode).toBe("outside");
    // Armed by the objective's own entry threshold; tripped clear of its exit.
    expect(rb!.armWithinM).toBe(26);
    expect(rb!.radiusM).toBe(45);
    expect(rb!.dwellSec).toBe(FINISH_LEAVE_S);

    const turn = routeFinishZone([
      zone(0, 0, 10),
      {
        kind: "completeManeuver",
        maneuver: "threePointTurn",
        corridor: { x: 0, y: 60, halfWidthM: 8, halfLengthM: 12 },
        startHeadingDeg: 0,
        toleranceDeg: 20,
        holdSec: 0.6,
      },
    ]);
    expect(turn).not.toBeNull();
    expect(turn!.mode).toBe("outside");
    // Circumradius of the box + the corner margin: leaving in ANY direction.
    expect(turn!.radiusM).toBeCloseTo(Math.hypot(8, 12) + 8, 6);
    expect(turn!.armWithinM).toBe(8);
  });

  it("an outside finish is NOT tripped by standing still in the middle of the work", () => {
    const rb = routeFinishZone([
      zone(0, 0, 10),
      {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 200,
        y: 0,
        enterRadiusM: 26,
        exitRadiusM: 45,
      },
    ])!;
    let gate = createFinishGate();
    // Approach from 200 m out (in the finish region — but not armed: the ring
    // has never been reached, so there is nothing to have left).
    for (let t = 0; t < 60; t++) {
      gate = stepFinishGate(gate, rb, makeTick({ t, speedKmh: 30, position: { x: 0, y: 0 } }));
    }
    expect(gate.armed).toBe(false);
    expect(gate.reachedAtSec).toBeNull();

    // Enter the ring and sit on it, stalled, for two minutes.
    for (let t = 60; t < 180; t++) {
      gate = stepFinishGate(gate, rb, makeTick({ t, speedKmh: 0, position: { x: 200, y: 0 } }));
    }
    expect(gate.armed).toBe(true);
    expect(gate.reachedAtSec).toBeNull();

    // Drive away: the finish trips after the leave window, and not before it.
    for (let t = 180; t < 180 + FINISH_LEAVE_S - 1; t++) {
      gate = stepFinishGate(gate, rb, makeTick({ t, speedKmh: 30, position: { x: 300, y: 0 } }));
    }
    expect(gate.reachedAtSec).toBeNull();
    for (let t = 180 + FINISH_LEAVE_S - 1; t <= 180 + FINISH_LEAVE_S + 1; t++) {
      gate = stepFinishGate(gate, rb, makeTick({ t, speedKmh: 30, position: { x: 300, y: 0 } }));
    }
    expect(gate.reachedAtSec).toBe(180 + FINISH_LEAVE_S);
  });

  it("clamps to half the gap so a finish can never swallow the leg before it", () => {
    // 60 m apart → the 40 m terminal zone is cut to 30 m.
    expect(routeFinishZone([zone(0, 0, 10), zone(60, 0, 40)])).toEqual({
      x: 60,
      y: 0,
      radiusM: 30,
      dwellSec: FINISH_DWELL_S,
      terminalRescue: true,
    });
    // Comfortably spaced → the authored radius survives untouched.
    expect(routeFinishZone([zone(0, 0, 10), zone(400, 0, 20)])).toEqual({
      x: 400,
      y: 0,
      radiusM: 20,
      dwellSec: FINISH_DWELL_S,
      terminalRescue: true,
    });
  });

  /**
   * B3 (doc 86 §3) — the rescue used to copy the terminal objective's
   * deliberately lane-exclusive radius. Templates author 4–6 m precisely so
   * the gate is satisfiable only from the correct lane; the escape inherited
   * that exclusivity, so a car ONE LANE OVER at the end of the route (8.13 m
   * on every shipped map) missed the way out by centimetres.
   */
  it("B3: the rescue radius is floored at a lane pitch — before the clamp", () => {
    // Room to spare: a radius-4 terminal gate yields a 9 m escape.
    const roomy = routeFinishZone([zone(0, 0, 10), zone(400, 0, 4)])!;
    expect(roomy.radiusM).toBe(FINISH_LANE_FLOOR_M);
    expect(roomy.radiusM).toBeGreaterThan(8.125); // the shipped lane pitch

    // The clamp still wins where the previous leg is genuinely close — the
    // floor may never let a finish swallow the waypoint before it.
    const tight = routeFinishZone([zone(0, 0, 10), zone(12, 0, 4)])!;
    expect(tight.radiusM).toBe(6);
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
    ...LESSONS,
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
      // The invariant is about ARRIVAL zones swallowing an earlier leg. An
      // "outside" zone is the opposite shape — it is satisfied by being AWAY
      // from the route's end, so an earlier waypoint sitting inside the ring
      // (l3-roundabout's approach is 0 m from the island centre) is not
      // swallowed by anything: the car has to leave to trip it.
      if (finish.mode === "outside") continue;
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
