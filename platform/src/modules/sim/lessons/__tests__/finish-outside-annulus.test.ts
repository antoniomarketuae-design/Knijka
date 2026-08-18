/**
 * THE ANNULUS OF AN "OUTSIDE" FINISH — sweep161 (the 174-scenario audit,
 * 2026-08-18), the 22 findings routed at `lessons/finish.ts`.
 *
 * WHAT THE SWEEP SHOWED, AND WHAT THIS FILE IS ABOUT. Thirteen of those
 * findings are one sentence — the lesson would not end, the harness had to
 * press «Прекрати урока», and the debrief then printed „Урокът беше прекъснат
 * преди края" over a scoreboard the student had not earned. Almost none of
 * that band is closeable inside this module: every gate finish.ts owns is
 * anchored at the END of the route, and a car 900 m short of it cannot trip
 * one however long it sits there. That hole is written up for the engine lane.
 *
 * THE HALF THAT *IS* HERE IS THE OPPOSITE FAILURE, and it is the one B1's
 * shape was built to make impossible: an "outside" gate closing a lesson on a
 * student who has not left anything. An "outside" gate has two circles —
 * `armWithinM` („you were here") and `radiusM` („you have left") — and the
 * band between them is what stops one pose sample counting as a departure.
 * The `passSignal` anchor published a single radius, so `normalizeOutside`
 * defaulted the arm to it and the band was zero.
 *
 * MEASURED over the compiled catalogue (808 rungs = all 167 templates × their
 * authored levels; 108 "outside" zones handed out by `routeFinishZone` +
 * `terminalRescueZone`): exactly five zones had a band under one lane pitch,
 * and all five were the same lesson — `sc-sig-green-wave` L1–L5, arm 40 m,
 * radius 40 m, the catalogue's only `passSignal` TERMINAL. A signalized
 * approach's graded line is derived at the junction MOUTH, 17–43 m out at the
 * 2.5× road scale (runtime/stoplines.ts; the shipped micro-districts measure
 * 27.7 m) — every value in that band is INSIDE the 40 m arming circle. So the
 * gate is armed by stopping legally at the paint, and hesitating a few metres
 * further back — 41 m from the node, still short of a line it has not crossed
 * — is „left the junction"; FINISH_LEAVE_S later the drive is over with the
 * third lamp never passed. It is a GREEN wave, so B15's lawful-wait freeze
 * withholds nothing and the gate spends every one of those seconds.
 *
 * The first test below FAILS on the shipped behaviour. The second and third
 * pin the direction the fix must NOT go: an outside gate that has stopped
 * ending drives is a worse bug than the one being fixed, so a car that
 * genuinely drives away still finishes, and the two anchors that already had a
 * band are byte-identical.
 */

import { describe, expect, it } from "vitest";
import {
  FINISH_LEAVE_S,
  FINISH_OUTSIDE_ANNULUS_M,
  createFinishGate,
  routeFinishZone,
  stepFinishGate,
  terminalRescueZone,
} from "../finish";
import type { ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

/** The shipped `sc-sig-green-wave` shape: a waypoint, then a terminal light. */
const SPAWN: ObjectiveParams = { kind: "reachZone", x: 0, y: -200, radiusM: 10 };
const TERMINAL_LIGHT: ObjectiveParams = {
  kind: "passSignal",
  nodeId: "n-green-wave-terminal",
  x: 0,
  y: 0,
  radiusM: 40,
  control: "trafficLight",
};

/**
 * A representative graded stop line for that junction: the shipped
 * micro-districts' 27.7 m (JUNCTION_STOP_LINE_M). The exact value does not
 * matter to these tests — every mouth in the runtime's 17–43 m band is inside
 * the 40 m acceptance ring, which is the whole point.
 */
const STOP_LINE_M = 27.725;

function run(
  zone: ReturnType<typeof routeFinishZone>,
  poses: readonly { t: number; y: number; speedKmh: number }[],
): ReturnType<typeof stepFinishGate> {
  let gate = createFinishGate();
  for (const p of poses) {
    gate = stepFinishGate(
      gate,
      zone!,
      makeTick({ t: p.t, speedKmh: p.speedKmh, position: { x: 0, y: p.y } }),
    );
  }
  return gate;
}

/** Approach → stop at the paint → hold at `holdY`, for `seconds`. */
function approachThenHold(
  zone: ReturnType<typeof routeFinishZone>,
  holdY: number,
  seconds: number,
): ReturnType<typeof stepFinishGate> {
  const poses: { t: number; y: number; speedKmh: number }[] = [];
  let t = 0;
  // Out on the approach, 120 m short: already OUTSIDE the departure circle,
  // and correctly unarmed — nothing has been left that was never reached.
  for (; t < 5; t++) poses.push({ t, y: -120, speedKmh: 30 });
  // Stopped legally AT the painted line. 27.725 m from the node is inside the
  // objective's own 40 m acceptance ring, so this is where the gate arms.
  for (; t < 10; t++) poses.push({ t, y: -STOP_LINE_M, speedKmh: 0 });
  for (; t < 10 + seconds; t++) poses.push({ t, y: holdY, speedKmh: 0 });
  return run(zone, poses);
}

describe("an outside finish needs a BAND, not a boundary", () => {
  it("does not end the lesson on a car hesitating one metre outside the ring", () => {
    // 41 m from the node — one metre past the acceptance ring, 13.3 m short of
    // the paint he was just stopped on. He has left nothing; he has not even
    // reached the line. Held twice the leave window to prove it is not a race.
    const zone = routeFinishZone([SPAWN, TERMINAL_LIGHT]);
    const gate = approachThenHold(zone, -41, FINISH_LEAVE_S * 2);
    expect(gate.armed).toBe(true);
    expect(gate.reachedAtSec).toBeNull();

    // The same pose against the TERMINAL rescue, which the engine steps on
    // every frame regardless of which objective is active — so the hesitation
    // has to be innocent there too, or the fix only moves the defect.
    const rescue = terminalRescueZone([SPAWN, TERMINAL_LIGHT]);
    expect(approachThenHold(rescue, -41, FINISH_LEAVE_S * 2).reachedAtSec).toBeNull();
  });

  it("still ends the lesson on a car that has actually driven away", () => {
    // Through the junction and out the far side, well clear of the band. This
    // is the ending the gate exists for and it must survive the fix — an
    // outside gate that stopped ending drives would be the worse bug.
    const zone = routeFinishZone([SPAWN, TERMINAL_LIGHT])!;
    const poses: { t: number; y: number; speedKmh: number }[] = [];
    let t = 0;
    for (; t < 5; t++) poses.push({ t, y: -120, speedKmh: 30 });
    for (; t < 10; t++) poses.push({ t, y: -STOP_LINE_M, speedKmh: 0 });
    for (; t < 12 + FINISH_LEAVE_S; t++) poses.push({ t, y: 90, speedKmh: 40 });
    const gate = run(zone, poses);
    expect(gate.armed).toBe(true);
    expect(gate.reachedAtSec).toBe(10 + FINISH_LEAVE_S);
  });

  it("leaves the two anchors that already had a band bit-identical", () => {
    // The roundabout's band is its own enter/exit pair (26 → 45 m) and the
    // turn box's is the margin already added to its circumradius. Neither may
    // move: the floor is a floor, not a re-derivation.
    const rb = routeFinishZone([
      SPAWN,
      {
        kind: "completeManeuver",
        maneuver: "roundabout",
        x: 200,
        y: 0,
        enterRadiusM: 26,
        exitRadiusM: 45,
      },
    ])!;
    expect(rb.armWithinM).toBe(26);
    expect(rb.radiusM).toBe(45);

    const turn = routeFinishZone([
      SPAWN,
      {
        kind: "completeManeuver",
        maneuver: "threePointTurn",
        corridor: { x: 0, y: 60, halfWidthM: 8, halfLengthM: 12 },
        startHeadingDeg: 0,
        toleranceDeg: 20,
        holdSec: 0.6,
      },
    ])!;
    expect(turn.armWithinM).toBe(8);
    expect(turn.radiusM).toBeCloseTo(Math.hypot(8, 12) + FINISH_OUTSIDE_ANNULUS_M, 6);
  });

  it("guarantees the band on the SHAPE, so the next anchor cannot lose it", () => {
    // The defect was not that one anchor forgot a number — it was that the
    // shape allowed the two circles to coincide. An anchor that publishes only
    // a radius must come back with a band anyway.
    const zone = routeFinishZone([SPAWN, TERMINAL_LIGHT])!;
    expect(zone.mode).toBe("outside");
    expect(zone.armWithinM).toBe(TERMINAL_LIGHT.kind === "passSignal" ? 40 : 0);
    expect(zone.radiusM - (zone.armWithinM ?? zone.radiusM)).toBeGreaterThanOrEqual(
      FINISH_OUTSIDE_ANNULUS_M,
    );
    // And the arm is still the objective's own acceptance ring — the fix
    // widens the way OUT, never the way a junction is recognised as reached.
    expect(zone.armWithinM).toBe(40);
  });
});
