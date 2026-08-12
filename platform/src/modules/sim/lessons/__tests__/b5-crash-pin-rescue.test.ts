/**
 * FR-B5-JAM (doc 87, the 2026-08-05 gate's open list, item 4, second half) —
 * „and then the car is JAMMED AT FULL THROTTLE FOR 40 s, third objective
 * unreachable, lesson unfinishable."
 *
 * The obstacle that caused that particular collision is fixed in
 * `traffic/__tests__/b5-junction-mouth-clear.test.ts`. This is the other half,
 * and it is the dangerous one, because it needs no particular obstacle: pin a
 * car against any solid thing anywhere on a route and the same nothing happens
 * for as long as the student is willing to sit there.
 *
 * The three finish gates now read:
 *   Gate 1 `routeFinishZone`   — the stalled chain, at the END of the route.
 *   Gate 2 `terminalRescueZone`— simply stuck, at the END of the route.
 *   Gate 3 `crashPin`          — pinned against what you just hit, ANYWHERE.
 *
 * Gate 3 must be narrow enough that nothing lawful reaches it, which is why it
 * needs all three of: a graded COLLISION, no escape from the impact pose, and a
 * sustained full standstill.
 */

import { describe, expect, it } from "vitest";

import type { LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import { CRASH_PIN_RADIUS_M, CRASH_PIN_STUCK_S, FINISH_STANDSTILL_KMH } from "../finish";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

/** A two-leg route whose end is 300 m away — nowhere near the impact. */
const LEG_1: LessonObjective = {
  id: "cp-leg1",
  titleBg: "Продължи по улицата",
  kind: "reachZone",
  params: { x: 0, y: 150, radiusM: 10 },
};
const LEG_2: LessonObjective = {
  id: "cp-leg2",
  titleBg: "Спри в края на маршрута",
  kind: "reachZone",
  params: { x: 0, y: 300, radiusM: 10 },
};

const LESSON: LessonSpec = {
  id: "t-crash-pin",
  order: 99,
  titleBg: "Тестов маршрут",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [LEG_1, LEG_2],
};

function session(): LessonSessionState {
  return createLessonSession(LESSON);
}

/** A frame at (0, y) — moving unless `speedKmh` says otherwise. */
function frame(t: number, y: number, speedKmh: number, events: SimTick["events"] = []): SimTick {
  return makeTick({ t, speedKmh, position: { x: 0, y }, events });
}

/** Run frames at 2 Hz from `t0` for `sec`, holding pose and speed. */
function hold(
  s: LessonSessionState,
  t0: number,
  sec: number,
  y: number,
  speedKmh: number,
): { state: LessonSessionState; endT: number; ended: boolean; explain: string | null } {
  let state = s;
  let explain: string | null = null;
  let t = t0;
  for (; t <= t0 + sec; t += 0.5) {
    const step = applyTick(state, frame(t, y, speedKmh));
    state = step.state;
    for (const h of step.hudEvents) {
      if (h.kind === "lesson" && /удар/i.test(h.titleBg)) explain = h.explanationBg ?? "";
    }
    if (state.phase !== "driving") break;
  }
  return { state, endT: t, ended: state.phase !== "driving", explain };
}

/** Get a session past the frame-zero pose guard and into a real drive. */
function underWay(y = 40): { state: LessonSessionState; t: number } {
  let state = session();
  let t = 0;
  for (let i = 0; i < 6; i++, t += 0.5) {
    state = applyTick(state, frame(t, y - 6 + i, 20)).state;
  }
  return { state, t };
}

/** The collision frame — the only event that carries `terminateSession`. */
function collide(state: LessonSessionState, t: number, y: number): LessonSessionState {
  return applyTick(
    state,
    frame(t, y, 18, [{ kind: "collision", withWhat: "vehicle" }]),
  ).state;
}

describe("FR-B5-JAM — a car pinned against what it hit is not left there", () => {
  it("closes the drive after CRASH_PIN_STUCK_S motionless at the impact, with an explanation", () => {
    const { state: s0, t } = underWay();
    const hit = collide(s0, t, 40);
    expect(hit.crashPin, "the collision must arm the pin").toBeDefined();
    expect(hit.phase).toBe("driving");

    // Held still against it — the founder's forty seconds, in ten.
    const r = hold(hit, t + 0.5, CRASH_PIN_STUCK_S + 3, 40, 0);
    expect(r.ended, "the drive must end instead of holding him there").toBe(true);
    expect(r.state.phase).toBe("completed");
    expect(r.state.endedAtSec).not.toBeNull();
    // THEO-4: never a bare verdict — the toast says what happened and why the
    // lesson is closing, and points at the corrective.
    expect(r.explain, "a lesson HUD event must explain the ending").not.toBeNull();
    expect(r.explain!.length).toBeGreaterThan(80);
    expect(r.explain!).toMatch(/дистанц/i);
    // It grades nothing: the collision keeps its own points and the route's
    // unreached objectives stay honestly unreached.
    expect(r.state.objectives.every((o) => o.completedAtSec === null)).toBe(true);
    const codes = r.state.events.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toEqual(["COLLISION"]);
  });

  it("a contact that keeps being REPORTED still bills once, and the rescue still fires", () => {
    // THE OTHER HALF OF THIS RESCUE, found by the DEDUPE wave and measured on
    // the shipped code. Gate 3 re-arms on every graded collision — the pose
    // that matters is the last one — so while the rule engine billed a
    // continuing contact every 3 s, every bill reset the 10 s stillness clock.
    // The car pinned against a bumper was therefore charged 10 points every
    // three seconds AND could never reach the rescue: measured over 40 s,
    // 14 «Пътнотранспортно произшествие», 140 наказателни точки, phase still
    // „driving". The reducer now bills the encounter once, so the clock runs.
    //
    // 2 Hz is not an arbitrary rate: NpcColliders rebinds its shell pool every
    // REASSIGN_INTERVAL_SEC = 0.5 s and teleports a rebound shell, which
    // re-fires rapier's collisionEnter at exactly that cadence.
    const { state: s0, t } = underWay();
    let s = collide(s0, t, 40);
    let tt = t + 0.5;
    let ended: number | null = null;
    for (let i = 0; i < 80; i++, tt += 0.5) {
      s = applyTick(s, frame(tt, 40, 0, [{ kind: "collision", withWhat: "vehicle" }])).state;
      if (s.phase !== "driving") {
        ended = tt;
        break;
      }
    }
    expect(ended, "the pinned drive must still be closed for him").not.toBeNull();
    expect(ended! - t).toBeLessThanOrEqual(CRASH_PIN_STUCK_S + 4);
    const collisions = s.events.filter((e) => e.kind === "violation" && e.code === "COLLISION");
    expect(collisions.length, "one encounter is one accident").toBe(1);
    expect(collisions[0].kind === "violation" ? collisions[0].points : 0).toBe(10);
  });

  it("never fires without a collision — a standstill alone is not evidence", () => {
    // The B15 lesson, restated: a car standing still is doing the most
    // important thing a learner does at a junction. Twice the pin's dwell.
    const { state, t } = underWay();
    const r = hold(state, t, CRASH_PIN_STUCK_S * 2 + 5, 40, 0);
    expect(r.state.crashPin).toBeUndefined();
    expect(r.ended).toBe(false);
    expect(r.state.phase).toBe("driving");
  });

  it("disarms the moment the student reverses out and drives away", () => {
    const { state: s0, t } = underWay();
    let s = collide(s0, t, 40);
    expect(s.crashPin).toBeDefined();
    // Back off past the radius — this is a student recovering, not a student
    // stuck, and closing the lesson under him would be the worse bug.
    let tt = t + 0.5;
    for (let d = 1; d <= CRASH_PIN_RADIUS_M + 3; d++, tt += 0.5) {
      s = applyTick(s, frame(tt, 40 - d, 8)).state;
    }
    expect(s.crashPin, "driving away must clear the pin").toBeUndefined();
    // …and then standing still for ages is once again just standing still.
    const r = hold(s, tt, CRASH_PIN_STUCK_S * 2, 40 - (CRASH_PIN_RADIUS_M + 3), 0);
    expect(r.ended).toBe(false);
  });

  it("a shunt that keeps moving never spends the clock", () => {
    // Rocking back and forth inside the radius is trying to get out. Only a
    // FULL standstill, held, is evidence — the same bar the terminal rescue uses.
    const { state: s0, t } = underWay();
    let s = collide(s0, t, 40);
    let tt = t + 0.5;
    for (let i = 0; i < Math.ceil((CRASH_PIN_STUCK_S * 2) / 0.5); i++, tt += 0.5) {
      // 2 km/h — above FINISH_STANDSTILL_KMH, inside the radius.
      s = applyTick(s, frame(tt, 40 + (i % 2 === 0 ? 1 : -1), FINISH_STANDSTILL_KMH + 1)).state;
      expect(s.phase).toBe("driving");
    }
    expect(s.crashPin?.stillSinceSec ?? null).toBeNull();
  });
});
