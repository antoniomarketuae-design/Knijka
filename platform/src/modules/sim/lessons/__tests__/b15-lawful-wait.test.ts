/**
 * B15 — „the roundabout convicts me the instant the wheels turn after I have
 * waited properly at the give-way line. I waited about 40 seconds."
 *
 * THIS FILE EXISTS BECAUSE THAT ROW WAS UNPHOTOGRAPHABLE. Three separate runs
 * tried to hold the frame and could not: at roughly twenty seconds of standing
 * still the lesson engine handed itself a result screen —
 * «0 наказателни точки · НЕИЗДЪРЖАН · Ориентировъчно време 20 с — в ориентира
 * от 70 с» — and the keyboard stopped mattering. Twenty seconds is
 * FINISH_LEAVE_S: the leave-the-work-site finish, firing on a student who was
 * doing the single most important thing a learner does at a junction.
 *
 * THE GEOMETRY, measured against the SHIPPED drill (not invented here):
 *   ring centre (0, 0) · enterRadiusM 24 · exitRadiusM 34   (templates-flow.ts)
 *   the painted М8 give-way bars: y = −35.725                (guidance-geometry)
 *   the approach lane: x = 4.06                              (rb-mini-v1.json)
 *   ⇒ a car stopped ON THE PAINT sits 35.96 m from the centre — 1.96 m INSIDE
 *     the „you have left the roundabout" region, which begins at 34 m.
 * The gate arms at 24 m, so any student who has been at the ring and is then
 * stationary at the paint is inside an armed finish, counting down.
 *
 * The fix is a DISTINCTION, not a longer timeout: while the scenario is
 * expecting a yield, a standstill is not evidence of an abandoned session and
 * must not count toward the idle finish at all. Both halves are pinned below —
 * the wait that must survive, and the abandonment that must still end.
 */

import { describe, expect, it } from "vitest";
import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import {
  FINISH_LEAVE_S,
  YIELD_ROUNDABOUT_APPROACH_M,
  YIELD_STOP_LINE_REACH_M,
  YIELD_WAIT_MAX_S,
  createFinishGate,
  stepFinishGate,
  stepYieldWait,
  terminalRescueZone,
  yieldReasonAt,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import { scoreRubric } from "../scenario/rubric";
import type { LessonResult, LessonSessionState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

// --- The founder's drill, exactly as it compiles for a student -------------
const LESSON_L3 = compileScenario(SC_ROUNDABOUT_ENTRY, 3);
const PARAMS: ObjectiveParams[] = LESSON_L3.objectives.map(parseObjectiveParams);

/** The approach lane on rb-mini-v1 (spawnPoints[0].x) and the painted М8 bars. */
const LANE_X = 4.06;
const PAINT_Y = -35.725;
/** A pose inside the ring's arming circle — the „nosed out for a look" pose. */
const NOSED_OUT_Y = -21.7;

const dist = (x: number, y: number): number => Math.hypot(x, y);

describe("B15 geometry — the give-way paint is inside the finish region", () => {
  it("the drill's own numbers put a lawful stop 1.96 m inside an armed finish", () => {
    const ring = PARAMS[1];
    expect(ring.kind).toBe("completeManeuver");
    if (ring.kind !== "completeManeuver" || ring.maneuver !== "roundabout") throw new Error("shape");
    expect(ring.enterRadiusM).toBe(24);
    expect(ring.exitRadiusM).toBe(34);

    const atPaint = dist(LANE_X, PAINT_Y);
    expect(atPaint).toBeCloseTo(35.955, 3);
    // Inside the „you have left the ring" region…
    expect(atPaint).toBeGreaterThan(ring.exitRadiusM);
    // …and the nose-out pose is inside the arming circle, so the gate arms.
    expect(dist(LANE_X, NOSED_OUT_Y)).toBeLessThan(ring.enterRadiusM);
  });

  it("WITHOUT the hold the gate really does end the drive at exactly 20 s", () => {
    // The raw gate, driven directly — this is what the engine used to hand it.
    const zone = terminalRescueZone(PARAMS);
    expect(zone).not.toBeNull();
    if (zone === null) return;

    let gate = createFinishGate();
    // One frame at the nose-out pose arms it (geometry only, any speed).
    gate = stepFinishGate(gate, zone, makeTick({ t: 0, position: { x: LANE_X, y: NOSED_OUT_Y } }));
    expect(gate.armed).toBe(true);

    // Then the founder's wait, on the paint, at a standstill.
    const firstPaintT = 0.1;
    let trippedAt: number | null = null;
    for (let i = 1; i <= 60 * 10; i++) {
      const t = i / 10;
      gate = stepFinishGate(gate, zone, makeTick({ t, position: { x: LANE_X, y: PAINT_Y }, speedKmh: 0 }));
      if (gate.reachedAtSec !== null && trippedAt === null) trippedAt = gate.reachedAtSec;
    }
    expect(trippedAt).not.toBeNull();
    // Exactly FINISH_LEAVE_S of standing on the paint — his „about 40 seconds"
    // never had a chance; the result screen arrived at twenty.
    expect((trippedAt ?? 0) - firstPaintT).toBeCloseTo(FINISH_LEAVE_S, 5);
  });
});

// ---------------------------------------------------------------------------
// The engine, end to end: his sequence, with the fix in place.
// ---------------------------------------------------------------------------

/** Feed one stationary frame at a pose. */
function hold(
  s: LessonSessionState,
  fromT: number,
  seconds: number,
  x: number,
  y: number,
  extra: Parameters<typeof makeTick>[0] = {},
): { state: LessonSessionState; t: number } {
  let state = s;
  let t = fromT;
  for (let i = 0; i < seconds * 10; i++) {
    t = +(t + 0.1).toFixed(1);
    state = applyTick(state, makeTick({ t, position: { x, y }, speedKmh: 0, ...extra })).state;
  }
  return { state, t };
}

describe("B15 — sixty seconds at the give-way line keeps the session live", () => {
  it("arms the gate, waits 120 s on the paint, and is still driving", () => {
    let s = createLessonSession(LESSON_L3);
    // Frame 1 describes the vehicle at its spawn (pose guard).
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
    // Approach, nose out far enough to arm the finish, then settle on the paint.
    s = applyTick(s, makeTick({ t: 0.1, position: { x: LANE_X, y: -40 }, speedKmh: 18 })).state;
    s = applyTick(s, makeTick({ t: 0.2, position: { x: LANE_X, y: NOSED_OUT_Y }, speedKmh: 9 })).state;
    expect(s.finishRescueGate?.armed).toBe(true);

    const waited = hold(s, 0.2, 120, LANE_X, PAINT_Y);
    s = waited.state;

    // The whole point of the row: he is still in the lesson.
    expect(s.phase).toBe("driving");
    expect(s.finishRescueGate?.reachedAtSec).toBeNull();
    expect(s.yieldWait?.holding).toBe(true);
    // …and the wait was measured, for the par-time line.
    expect(s.yieldWaitSec ?? 0).toBeGreaterThan(110);

    // Controls still matter: he moves off and the engine keeps grading him.
    const moved = applyTick(s, makeTick({ t: waited.t + 0.1, position: { x: LANE_X, y: -34 }, speedKmh: 8 }));
    expect(moved.state.phase).toBe("driving");
    expect(moved.state.yieldWait?.holding).toBe(false);
  });

  it("the frozen seconds are never credited back when the wait ends", () => {
    // Freezing alone would only DEFER the same verdict to the instant the gap
    // appears. The dwell has to restart, so the leave-clock measures time spent
    // away from the ring rather than time spent waiting to reach it.
    let s = createLessonSession(LESSON_L3);
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: LANE_X, y: NOSED_OUT_Y }, speedKmh: 9 })).state;
    const waited = hold(s, 0.1, 60, LANE_X, PAINT_Y);
    s = waited.state;
    expect(s.phase).toBe("driving");

    // He rolls one metre — no longer stationary, so the hold releases — and the
    // gate must start its twenty seconds from HERE, not from a minute ago.
    const rolling = applyTick(
      s,
      makeTick({ t: waited.t + 0.1, position: { x: LANE_X, y: PAINT_Y }, speedKmh: 4 }),
    ).state;
    expect(rolling.phase).toBe("driving");
    expect(rolling.finishRescueGate?.insideSinceSec).toBeCloseTo(waited.t + 0.1, 1);
  });
});

describe("B15 — what must still end", () => {
  it("stationary in the middle of nowhere with the route unfinished still finishes", () => {
    // 90 m north of the ring: past the approach window, nothing pending here,
    // nobody to yield to. This is the abandoned tab the gate exists for.
    const FAR_Y = 90;
    let s = createLessonSession(LESSON_L3);
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: LANE_X, y: NOSED_OUT_Y }, speedKmh: 9 })).state;
    const parked = hold(s, 0.1, 40, LANE_X, FAR_Y);
    expect(parked.state.phase).toBe("completed");
    expect(parked.state.yieldWait?.holding).toBe(false);
  });

  it("the hold expires at YIELD_WAIT_MAX_S so an idle tab cannot hold a lesson open", () => {
    let s = createLessonSession(LESSON_L3);
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: LANE_X, y: NOSED_OUT_Y }, speedKmh: 9 })).state;
    // Well past the ceiling AND past the leave dwell that follows it.
    const parked = hold(s, 0.1, YIELD_WAIT_MAX_S + FINISH_LEAVE_S + 5, LANE_X, PAINT_Y);
    expect(parked.state.phase).toBe("completed");
    expect(parked.state.endedAtSec ?? 0).toBeGreaterThan(YIELD_WAIT_MAX_S);
  });
});

// ---------------------------------------------------------------------------
// The other four ways a scenario asks you to wait. rb-mini publishes no
// stop-line context at all (stoplines.ts skips roundabout junctions), which is
// why the roundabout case above had to be derived from the route — these are
// the channels every other junction drill rides.
// ---------------------------------------------------------------------------

const NOWHERE: ObjectiveParams[] = [
  { kind: "reachZone", x: 0, y: 400, radiusM: 9 },
  { kind: "reachZone", x: 0, y: 800, radiusM: 9 },
];
const CTX = { params: NOWHERE, currentIndex: 0 };

describe("B15 — the stop-line and pedestrian channels", () => {
  it("a Б1 give-way line within reach is a lawful wait", () => {
    const tick = makeTick({
      position: { x: 0, y: 0 },
      nextStopLineM: 1.2,
      nextStopLineControl: "giveWay",
    });
    expect(yieldReasonAt(tick, CTX, [])).toBe("giveWayLine");
  });

  it("a Б2 stop sign within reach is a lawful wait", () => {
    const tick = makeTick({ nextStopLineM: 0.4, nextStopLineControl: "stopSign" });
    expect(yieldReasonAt(tick, CTX, [])).toBe("stopSign");
  });

  it("a red — and a red-amber, and an amber — is a lawful wait; green is not", () => {
    const at = (state: "red" | "redYellow" | "yellow" | "green") =>
      yieldReasonAt(
        makeTick({ nextStopLineM: 2, nextStopLineControl: "trafficLight", nextStopLineState: state }),
        CTX,
        [],
      );
    expect(at("red")).toBe("redLight");
    expect(at("redYellow")).toBe("redLight");
    expect(at("yellow")).toBe("redLight");
    expect(at("green")).toBeNull();
  });

  it("a line further away than the reach window is open road, not a wait", () => {
    const tick = makeTick({
      nextStopLineM: YIELD_STOP_LINE_REACH_M + 0.1,
      nextStopLineControl: "giveWay",
    });
    expect(yieldReasonAt(tick, CTX, [])).toBeNull();
  });

  it("a pedestrian on a crossing latches across frames and releases on the pass", () => {
    let w = stepYieldWait(
      undefined,
      makeTick({
        t: 1,
        speedKmh: 0,
        events: [{ kind: "crossingZoneEntered", crossingId: "c1", pedestrianOnCrossing: true }],
      }),
      CTX,
    );
    expect(w.holding).toBe(true);
    // A frame with no events at all keeps the latch — the pedestrian is still
    // there; the tick only reports the CHANGE.
    w = stepYieldWait(w, makeTick({ t: 2, speedKmh: 0 }), CTX);
    expect(w.holding).toBe(true);
    w = stepYieldWait(
      w,
      makeTick({
        t: 3,
        speedKmh: 0,
        events: [{ kind: "crossingPassed", crossingId: "c1", pedestrianOnCrossing: false }],
      }),
      CTX,
    );
    expect(w.holding).toBe(false);
  });

  it("a MOVING car is never holding, however good its reason", () => {
    const tick = makeTick({ speedKmh: 12, nextStopLineM: 1, nextStopLineControl: "giveWay" });
    expect(stepYieldWait(undefined, tick, CTX).holding).toBe(false);
  });

  it("the roundabout window ends where the approach ends", () => {
    const ring = PARAMS[1];
    if (ring.kind !== "completeManeuver" || ring.maneuver !== "roundabout") throw new Error("shape");
    const ctx = { params: PARAMS, currentIndex: 1 };
    const at = (d: number) => yieldReasonAt(makeTick({ position: { x: 0, y: -d } }), ctx, []);
    expect(at(ring.enterRadiusM + 0.1)).toBe("roundaboutEntry");
    expect(at(ring.enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M - 0.1)).toBe("roundaboutEntry");
    expect(at(ring.enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M + 0.1)).toBeNull();
    // Inside the ring is the WORK, not a wait — the leave gate owns that.
    expect(at(ring.enterRadiusM - 0.1)).toBeNull();
    // And once the chain is past the ring, leaving is a real finish again.
    expect(
      yieldReasonAt(makeTick({ position: { x: 0, y: -30 } }), { params: PARAMS, currentIndex: 2 }, []),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// „Ориентировъчно време" — the second half of the founder's sentence.
// ---------------------------------------------------------------------------

describe("B15 — the 70-second ориентир does not bill a lawful wait", () => {
  const base: LessonResult = {
    lessonId: "sc-roundabout-entry@L3",
    summary: {
      mistakes: [],
      commendations: [],
      score: { totalPoints: 0, byClass: { opasna: 0, osnovna: 0, vtorostepenna: 0 }, hasDangerous: false },
      passed: true,
      terminated: false,
      conceptIds: [],
    } as unknown as LessonResult["summary"],
    objectives: [],
    completedAll: true,
    aborted: false,
    passed: true,
    score: 0,
    effectiveScore: 0,
    escalations: [],
    durationSec: 95,
  };
  const parLine = (r: LessonResult) =>
    scoreRubric(r, { parTimeSec: 70 }).breakdownBg.find((l) => l.id === "parTime")?.detailBg ?? "";

  it("a 95 s drive that included a 40 s wait reads as 55 s — inside the ориентир", () => {
    const line = parLine({ ...base, yieldWaitSec: 40 });
    expect(line).toContain("55 с");
    expect(line).toContain("в ориентира от 70 с");
    // THEO-4: never a bare number — the student is told WHY it reads that way.
    expect(line).toContain("40 с чакане на предимство не се броят");
  });

  it("without a wait the line is byte-identical to what shipped", () => {
    expect(parLine(base)).toBe("95 с при ориентир 70 с — спокойно, точността е преди скоростта.");
    expect(parLine({ ...base, yieldWaitSec: 0 })).toBe(
      "95 с при ориентир 70 с — спокойно, точността е преди скоростта.",
    );
  });

  it("the wait never touches a star, a point or the verdict", () => {
    const withWait = scoreRubric({ ...base, yieldWaitSec: 40 }, { parTimeSec: 70 });
    const without = scoreRubric(base, { parTimeSec: 70 });
    expect(withWait.stars).toBe(without.stars);
    expect(withWait.breakdownBg.find((l) => l.id === "parTime")?.points).toBeNull();
  });

  it("buildLessonResult carries the measured wait onto the result", () => {
    let s = createLessonSession(LESSON_L3);
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
    const waited = hold(s, 0, 30, LANE_X, PAINT_Y);
    const r = buildLessonResult(waited.state);
    expect(r.yieldWaitSec ?? 0).toBeGreaterThan(25);
  });
});
