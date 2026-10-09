/**
 * sc-roundabout-entry:4ab693eb [critical], clause 2 — THE COACH ORDERED AN EXIT
 * THE CAR COULD NOT MAKE, BESIDE THE CARD THAT SAID IT HAD JUST CRASHED.
 *
 * THE FRAMES. rig-w2 (43b4109), `pc-L3-island-b-22/-25`: Level 3, advisor on,
 * the car steered into the central island at 14.5 км/ч with the left lamp on.
 * The product cut to the chase view on the contact tick and put up the −10
 * «Удар в неподвижно препятствие» card (ЗДвП чл. 20, ал. 2) — and the coach
 * card directly under the banner went on reading «Излез от кръговото с десен
 * мигач» at +0.05, +1.2, +1.9 and +3.2 s, the car standing at 0 км/ч against
 * the kerb. The recovery card replaced it at +5.2 s (`ROUTE_HOLD_S`).
 *
 * THE MEASURED POSE, used verbatim below: the COLLISION was booked at
 * t = 61.74 s at (14.81, −4.13), r 15.37, on `rbm-e-ring-se`, with the tick
 * reading 2.27 км/ч; the car came to rest by itself at 62.98 s (0.42 км/ч).
 *
 * WHAT IS PINNED. From the collision tick until the car is DRIVING again the
 * advisor does not issue the objective line; the five-second ladder after it
 * is untouched (the recovery card still lands at exactly ROUTE_HOLD_S); the
 * banner's predicate is untouched; and a drive with no collision says what it
 * always said. Both directions, because a card that went quiet for good would
 * pass a one-sided test.
 */

import { describe, expect, it } from "vitest";

import type { SimTick } from "../../rules";
import {
  ROUTE_HOLD_S,
  advisorPromptForSession,
  objectiveWithheldAfterImpact,
  routeHoldAdvisorPrompt,
  routeHoldForSession,
} from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { CRASH_PIN_DRIVING_KMH, CRASH_PIN_RADIUS_M } from "../finish";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

/** The rung the frames were shot on. */
const LESSON = compileScenario(SC_ROUNDABOUT_ENTRY, 3);
const LANE_X = 4.06;
const RING_EDGE = "rbm-e-ring-se";
const RING_CARD_BG = "Излез от кръговото с десен мигач";
/** The measured contact (pc-L3-island-b sidecar, events[COLLISION]). */
const HIT = { x: 14.81, y: -4.13, speedKmh: 2.27 };

function step(
  s: LessonSessionState,
  t: number,
  x: number,
  y: number,
  speedKmh: number,
  extra: Partial<SimTick> = {},
): LessonSessionState {
  return applyTick(s, makeTick({ t, position: { x, y }, speedKmh, ...extra })).state;
}

function ring(phiDeg: number, r = 20): { x: number; y: number } {
  const rad = (phiDeg * Math.PI) / 180;
  return { x: r * Math.sin(rad), y: -r * Math.cos(rad) };
}

/** First rung done, 58° of ring behind him: the coach is on the exit sentence. */
function onTheRing(): { state: LessonSessionState; t: number } {
  let s = createLessonSession(LESSON);
  s = step(s, 0, LANE_X, -93, 0);
  s = step(s, 0.5, LANE_X, -60, 15, { edgeId: "rbm-e-arm-s" });
  s = step(s, 1.0, LANE_X, -40, 12, { edgeId: "rbm-e-arm-s" });
  s = step(s, 1.5, LANE_X, -36, 8, { edgeId: "rbm-e-arm-s" });
  s = step(s, 2.0, LANE_X, -20, 10, { edgeId: RING_EDGE });
  let t = 2.0;
  for (const phi of [30, 50, 64]) {
    t += 0.5;
    const p = ring(phi, 17.2);
    s = step(s, t, p.x, p.y, 14.5, { edgeId: RING_EDGE });
  }
  return { state: s, t };
}

function hit(
  s: LessonSessionState,
  t: number,
  speedKmh = HIT.speedKmh,
  at: { x: number; y: number } = HIT,
  other?: { withWhat: "vehicle"; actorId: string },
): LessonSessionState {
  return applyTick(
    s,
    makeTick({
      t,
      position: { x: at.x, y: at.y },
      speedKmh,
      edgeId: RING_EDGE,
      events: [other ? { kind: "collision", ...other } : { kind: "collision", withWhat: "staticObject" }],
    }),
  ).state;
}

const DT = 1 / 60;

describe("the drive the frames were shot on (L3), up to the contact", () => {
  it("on the ring, before the hit, the coach is on the exit sentence and nothing withholds it", () => {
    const { state } = onTheRing();
    expect(state.currentObjectiveIndex).toBe(1);
    expect(advisorPromptForSession(state)?.textBg).toBe(RING_CARD_BG);
    expect(objectiveWithheldAfterImpact(state)).toBe(false);
  });
});

describe("from the collision tick until the car drives again, the coach does not order the exit", () => {
  function standing(sec: number): { s: LessonSessionState; tHit: number; seen: Array<[number, string | null]> } {
    const { state, t } = onTheRing();
    const tHit = t + 0.5;
    let s = hit(state, tHit);
    const seen: Array<[number, string | null]> = [[tHit, advisorPromptForSession(s)?.textBg ?? null]];
    // The car creeps the last 0.4 m along the kerb (as measured) and stands.
    for (let k = 1; k * DT <= sec + 1e-9; k++) {
      const tk = tHit + k * DT;
      const v = tk - tHit < 1.24 ? 1.2 : 0;
      s = step(s, tk, HIT.x + 0.04 * Math.min(1, (tk - tHit) / 1.24), HIT.y + 0.09 * Math.min(1, (tk - tHit) / 1.24), v, { edgeId: RING_EDGE });
      seen.push([tk, advisorPromptForSession(s)?.textBg ?? null]);
    }
    return { s, tHit, seen };
  }

  it("the crash is on the sheet from the contact tick: COLLISION, опасна, 10 т., ЗДвП чл. 20, ал. 2", () => {
    const { s, tHit } = standing(0.5);
    const c = s.events.find((e) => e.kind === "violation" && e.code === "COLLISION");
    expect(c, "the crash card's event").toBeDefined();
    expect(c!.t).toBeCloseTo(tHit, 9);
    expect(c!.kind === "violation" ? c!.severityClass : null).toBe("opasna");
    expect(c!.kind === "violation" ? c!.titleBg : null).toBe("Удар в неподвижно препятствие");
    expect(c!.kind === "violation" ? c!.points : null).toBe(10);
    expect(c!.kind === "violation" ? c!.lawRef : null).toBe("ЗДвП чл. 20, ал. 2");
    expect(s.crashPin?.atSec).toBeCloseTo(tHit, 9);
  });

  it("no frame between the contact tick and ROUTE_HOLD_S carries «Излез от кръговото с десен мигач» — or any card", () => {
    const { seen, tHit } = standing(ROUTE_HOLD_S - 0.05);
    expect(seen[0][0]).toBe(tHit);
    for (const [t, line] of seen) expect(line, `+${(t - tHit).toFixed(3)} s`).toBeNull();
  });

  it("the banner's predicate is untouched in that window (no hold before ROUTE_HOLD_S), so the task line stays the authored task", () => {
    const { s } = standing(ROUTE_HOLD_S - 0.05);
    expect(routeHoldForSession(s)).toBeNull();
    expect(s.objectives[s.currentObjectiveIndex]?.spec.titleBg).toBe("Премини през кръговото и излез с десен мигач");
  });

  it("…and the recovery card still lands at exactly ROUTE_HOLD_S — the ladder after the window is not moved", () => {
    const { seen, tHit } = standing(ROUTE_HOLD_S + 0.5);
    const first = seen.find(([, line]) => line !== null);
    expect(first, "the recovery card must come").toBeDefined();
    expect(first![1]).toBe(routeHoldAdvisorPrompt("crashPinned").textBg);
    expect(first![0] - tHit).toBeGreaterThanOrEqual(ROUTE_HOLD_S - 1e-9);
    expect(first![0] - tHit).toBeLessThanOrEqual(ROUTE_HOLD_S + DT + 1e-9);
  });
});

describe("the car is driving again → the objective line is back (the drill is not retired)", () => {
  it("rest, then away at a driving speed inside the window: the exit sentence returns on that tick", () => {
    const { state, t } = onTheRing();
    let s = hit(state, t + 0.5);
    s = step(s, t + 1.0, HIT.x, HIT.y, 0, { edgeId: RING_EDGE });
    expect(advisorPromptForSession(s)).toBeNull();
    // Reversing out at −6 км/ч — driving, by the floor ROUTE_HOLD_S was derived from.
    s = step(s, t + 1.5, HIT.x - 0.3, HIT.y - 0.8, -(CRASH_PIN_DRIVING_KMH + 1), { edgeId: RING_EDGE });
    expect(s.crashPin, "still inside the pin's radius").toBeDefined();
    expect(objectiveWithheldAfterImpact(s)).toBe(false);
    expect(advisorPromptForSession(s)?.textBg).toBe(RING_CARD_BG);
  });

  it("a crawl at or under the floor is not driving: the line stays withdrawn", () => {
    const { state, t } = onTheRing();
    let s = hit(state, t + 0.5);
    s = step(s, t + 1.0, HIT.x, HIT.y, 0, { edgeId: RING_EDGE });
    s = step(s, t + 1.5, HIT.x - 0.1, HIT.y - 0.2, -CRASH_PIN_DRIVING_KMH, { edgeId: RING_EDGE });
    expect(advisorPromptForSession(s)).toBeNull();
  });

  it("a hit at speed: still slowing after the contact is NOT driving again — withdrawn on every tick until it has come to rest", () => {
    const { state, t } = onTheRing();
    let s = hit(state, t + 0.5, 20);
    expect(advisorPromptForSession(s), "the contact tick itself").toBeNull();
    for (const [i, v] of [12, 7, 3, 0].entries()) {
      s = step(s, t + 0.5 + (i + 1) * DT, HIT.x, HIT.y, v, { edgeId: RING_EDGE });
      expect(advisorPromptForSession(s), `slowing, ${v} км/ч`).toBeNull();
    }
  });

  it("…and the same backing into it: reverse speed is speed, so still sliding at −12 км/ч is not at rest", () => {
    const { state, t } = onTheRing();
    let s = hit(state, t + 0.5, -20);
    expect(advisorPromptForSession(s), "the contact tick itself").toBeNull();
    for (const [i, v] of [-12, -7, -3, 0].entries()) {
      s = step(s, t + 0.5 + (i + 1) * DT, HIT.x, HIT.y, v, { edgeId: RING_EDGE });
      expect(advisorPromptForSession(s), `slowing, ${v} км/ч`).toBeNull();
    }
  });

  it("a SECOND impact is a fresh question: rest, drive again, hit again at speed → withdrawn from the second contact tick", () => {
    const { state, t } = onTheRing();
    let s = hit(state, t + 0.5);
    s = step(s, t + 1.0, HIT.x, HIT.y, 0, { edgeId: RING_EDGE });
    s = step(s, t + 1.5, HIT.x - 0.3, HIT.y - 0.8, -(CRASH_PIN_DRIVING_KMH + 3), { edgeId: RING_EDGE });
    expect(advisorPromptForSession(s)?.textBg, "driving again after the first").toBe(RING_CARD_BG);
    // Forward again and into a second body — a circulating car: its own
    // contact episode, so the grader bills it at once — at 12 км/ч.
    s = hit(s, t + 3.0, 12, { x: HIT.x + 1.0, y: HIT.y + 2.8 }, { withWhat: "vehicle", actorId: "ring-car-2" });
    expect(s.crashPin?.atSec, "the pin re-armed").toBeCloseTo(t + 3.0, 9);
    expect(advisorPromptForSession(s), "the second contact tick").toBeNull();
  });

  it("driving away past the pin's radius drops the pin, and the line is back", () => {
    const { state, t } = onTheRing();
    let s = hit(state, t + 0.5, 20);
    const away = ring(110, 18);
    expect(Math.hypot(away.x - HIT.x, away.y - HIT.y)).toBeGreaterThan(CRASH_PIN_RADIUS_M);
    s = step(s, t + 1.6, away.x, away.y, 20, { edgeId: RING_EDGE });
    expect(s.crashPin).toBeUndefined();
    expect(objectiveWithheldAfterImpact(s)).toBe(false);
    expect(advisorPromptForSession(s)?.textBg).not.toBeNull();
  });
});

describe("no collision → no change", () => {
  it("a car that stops on the ring without hitting anything keeps the exit sentence on every tick", () => {
    const { state, t } = onTheRing();
    let s = state;
    const p = ring(70, 17.2);
    for (let k = 1; k * 0.25 <= ROUTE_HOLD_S + 1; k++) {
      s = step(s, t + k * 0.25, p.x, p.y, 0, { edgeId: RING_EDGE });
      expect(s.crashPin).toBeUndefined();
      expect(objectiveWithheldAfterImpact(s)).toBe(false);
      expect(advisorPromptForSession(s)?.textBg).toBe(RING_CARD_BG);
    }
  });
});

describe("the floor is the one ROUTE_HOLD_S was derived from", () => {
  it("CRASH_PIN_DRIVING_KMH is 5 км/ч and a car driving at it clears the pin's radius inside ROUTE_HOLD_S", () => {
    expect(CRASH_PIN_DRIVING_KMH).toBe(5);
    expect(CRASH_PIN_RADIUS_M / (CRASH_PIN_DRIVING_KMH / 3.6)).toBeCloseTo(4.32, 2);
    expect(CRASH_PIN_RADIUS_M / (CRASH_PIN_DRIVING_KMH / 3.6)).toBeLessThan(ROUTE_HOLD_S);
  });
});
