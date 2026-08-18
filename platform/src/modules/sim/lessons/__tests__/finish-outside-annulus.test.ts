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
import type { LessonObjective, LessonSpec } from "../../contracts";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  FINISH_DWELL_S,
  FINISH_LEAVE_S,
  FINISH_OUTSIDE_ANNULUS_M,
  FINISH_OUTSIDE_STUCK_S,
  FINISH_STANDSTILL_KMH,
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

// ---------------------------------------------------------------------------
// THE BAND'S OWN DEFECT — a margin a car could stop in and never leave
// ---------------------------------------------------------------------------
//
// The band above costs a car that is leaving „eight more metres (~1 s at drill
// speed)", which is true of every car that is still moving and false of the
// only one that matters. Driving the compiled `sc-sig-green-wave` L1 through
// `applyTick` and holding the car 200 s wherever it stopped:
//
//     stop 0–47 m past tl3  → NEVER ends (phase still "driving" at 200 s)
//     stop 48 m past tl3    → ends at 95.3 s
//
// With the band at zero the same drive ended twenty seconds after it stopped,
// anywhere past 40 m. So the band converted a working ending into a trap for
// every rest inside it, and the shape that had no standstill face at all was
// the one shape in this module where „not moving" is not a way out.
//
// The first test below FAILS on the shipped behaviour — it hangs at
// `reachedAtSec === null` forever. The four after it are the opposite
// direction, one per thing the fix must NOT have cost.

/** The band of the shipped shape: 40 m arm, 48 m departure circle. */
const BAND_Y = -44; // 44 m from the node: past the arm, short of the departure

/** Hold a pose for `seconds` at 1 Hz, starting from an armed gate. */
function armedThenHold(
  zone: ReturnType<typeof routeFinishZone>,
  holdY: number,
  seconds: number,
  speedKmh = 0,
): ReturnType<typeof stepFinishGate> {
  const poses: { t: number; y: number; speedKmh: number }[] = [];
  let t = 0;
  for (; t < 5; t++) poses.push({ t, y: -120, speedKmh: 30 });
  for (; t < 10; t++) poses.push({ t, y: -STOP_LINE_M, speedKmh: 0 });
  for (; t < 10 + seconds; t++) poses.push({ t, y: holdY, speedKmh });
  return run(zone, poses);
}

describe("a car that STOPS in the band is stranded, and the band must let it out", () => {
  it("ends the drive after FINISH_OUTSIDE_STUCK_S — it used to hang forever", () => {
    // Armed at the paint, then at rest 44 m out: past the arming circle (40),
    // short of the departure circle (48). Before this face existed the gate
    // returned null here at any duration — that is the 173 s of standstill
    // ticks the sweep audit recorded with the session still live.
    const zone = routeFinishZone([SPAWN, TERMINAL_LIGHT]);
    expect(armedThenHold(zone, BAND_Y, FINISH_OUTSIDE_STUCK_S - 2).reachedAtSec).toBeNull();
    const out = armedThenHold(zone, BAND_Y, FINISH_OUTSIDE_STUCK_S + 2);
    expect(out.armed).toBe(true);
    expect(out.reachedAtSec).toBe(10 + FINISH_OUTSIDE_STUCK_S);

    // The terminal rescue is the SAME zone (it is the only gate the engine
    // consults once the chain is on its last objective), so it must carry the
    // same exit or the fix misses the student it was written for.
    const rescue = terminalRescueZone([SPAWN, TERMINAL_LIGHT]);
    expect(armedThenHold(rescue, BAND_Y, FINISH_OUTSIDE_STUCK_S + 2).reachedAtSec).toBe(
      10 + FINISH_OUTSIDE_STUCK_S,
    );
  });

  it("but a car still MOVING in the band is never touched, however long", () => {
    // The band exists for the shuffle at the box corner, the hover at the
    // junction mouth, the nudge back in a queue. All of those move. Four times
    // the bar at walking pace, and the gate says nothing.
    const zone = routeFinishZone([SPAWN, TERMINAL_LIGHT]);
    const rolling = armedThenHold(
      zone,
      BAND_Y,
      FINISH_OUTSIDE_STUCK_S * 4,
      FINISH_STANDSTILL_KMH + 1,
    );
    expect(rolling.armed).toBe(true);
    expect(rolling.reachedAtSec).toBeNull();
  });

  it("and standing still INSIDE the work site still cannot end a drive (B1)", () => {
    // The arming circle's interior is not the band and is not being amended:
    // B1 ruled that a car stopped on the ring, in the turn box or at the
    // junction is working the lesson. Four times the bar, motionless, on the
    // paint the objective itself accepts — nothing.
    const zone = routeFinishZone([SPAWN, TERMINAL_LIGHT]);
    const inWork = armedThenHold(zone, -STOP_LINE_M, FINISH_OUTSIDE_STUCK_S * 4);
    expect(inWork.armed).toBe(true);
    expect(inWork.reachedAtSec).toBeNull();

    // Same for the ring, whose whole 26 m arm is the work: two hundred seconds
    // parked on the island is still a student in the middle of the maneuver.
    const rb = routeFinishZone([
      SPAWN,
      { kind: "completeManeuver", maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 26, exitRadiusM: 45 },
    ])!;
    let gate = createFinishGate();
    for (let t = 0; t <= 200; t++) {
      gate = stepFinishGate(gate, rb, makeTick({ t, speedKmh: 0, position: { x: 0, y: 0 } }));
    }
    expect(gate.armed).toBe(true);
    expect(gate.reachedAtSec).toBeNull();
  });

  it("leaves the departure ending on the same second it always fired", () => {
    // The other direction of the same coin: a car that really drives away must
    // still finish on FINISH_LEAVE_S, not on the stranded bar, and not one
    // frame earlier for having paused at the line on its way out.
    const zone = routeFinishZone([SPAWN, TERMINAL_LIGHT])!;
    const poses: { t: number; y: number; speedKmh: number }[] = [];
    let t = 0;
    for (; t < 5; t++) poses.push({ t, y: -120, speedKmh: 30 });
    for (; t < 10; t++) poses.push({ t, y: -STOP_LINE_M, speedKmh: 0 });
    for (; t < 12 + FINISH_LEAVE_S; t++) poses.push({ t, y: 90, speedKmh: 40 });
    expect(run(zone, poses).reachedAtSec).toBe(10 + FINISH_LEAVE_S);
  });

  it("and never fires on an INSIDE zone — the face is a property of the shape", () => {
    // Every "inside" anchor already has its own standstill face and its own
    // measured bar (FINISH_STUCK_S, FINISH_BAY_STUCK_S). This one must not
    // reach them: a waypoint finish is a CROSSING, tripped by FINISH_DWELL_S of
    // presence at any speed, and four times the stranded bar spent OUTSIDE it
    // must still leave it untripped.
    const wp = routeFinishZone([
      SPAWN,
      { kind: "reachZone", x: 0, y: 0, radiusM: 12 },
    ])!;
    expect(wp.mode).toBeUndefined();
    let gate = createFinishGate();
    for (let t = 0; t <= FINISH_OUTSIDE_STUCK_S * 4; t++) {
      gate = stepFinishGate(gate, wp, makeTick({ t, speedKmh: 0, position: { x: 0, y: 200 } }));
    }
    expect(gate.armed).toBe(true); // observed outside — the arming side
    expect(gate.reachedAtSec).toBeNull();
    // …and it still trips on plain presence, on its own dwell.
    gate = stepFinishGate(
      gate,
      wp,
      makeTick({ t: FINISH_OUTSIDE_STUCK_S * 4 + 1, speedKmh: 20, position: { x: 0, y: 0 } }),
    );
    gate = stepFinishGate(
      gate,
      wp,
      makeTick({ t: FINISH_OUTSIDE_STUCK_S * 4 + 1 + FINISH_DWELL_S, speedKmh: 20, position: { x: 0, y: 0 } }),
    );
    expect(gate.reachedAtSec).toBe(FINISH_OUTSIDE_STUCK_S * 4 + 1 + FINISH_DWELL_S);
  });
});

// ---------------------------------------------------------------------------
// THE SAME CAR, DRIVEN — end to end through the engine
// ---------------------------------------------------------------------------
//
// The unit tests above pin the gate. This one pins the SESSION, because the
// sweep's finding is about a session that would not close: the terminal
// `passSignal` never ticks (it needs a `stopLineCrossed` event the synthetic
// stream does not carry, which is exactly the student's case — he drove
// through and the objective stayed open), so the finish gate is the only exit
// there is.

const GREEN_WAVE_LIKE: LessonObjective[] = [
  {
    id: "t-gw-mid",
    titleBg: "Дръж 50 между светофарите",
    kind: "reachZone",
    params: { x: 4.0625, y: 132, radiusM: 10 },
  },
  {
    id: "t-gw-tl3",
    titleBg: "Излез и от третия светофар",
    kind: "passSignal",
    params: { nodeId: "sw-n-tl3", x: 0, y: 528, radiusM: 40, control: "trafficLight" },
  },
];

const GREEN_WAVE_LESSON: LessonSpec = {
  id: "t-green-wave-like",
  order: 99,
  titleBg: "Зелена вълна (тест)",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 4.0625, y: -289 }, headingDeg: 0 },
  preDrive: false,
  objectives: GREEN_WAVE_LIKE,
};

/** North up the avenue at 43 km/h, then rest `restSec` at `stopY`. */
function driveThenRest(stopY: number, restSec: number): SimTick[] {
  const ticks: SimTick[] = [];
  const DT = 0.25;
  const MPS = 12;
  let t = 0;
  for (let y = -289; y < stopY; y += MPS * DT) {
    ticks.push(makeTick({ t, speedKmh: 43, maxSpeedKmh: 50, position: { x: 4.0625, y } }));
    t += DT;
  }
  for (let s = 0; s < restSec; s += DT) {
    ticks.push(makeTick({ t, speedKmh: 0, maxSpeedKmh: 50, position: { x: 4.0625, y: stopY } }));
    t += DT;
  }
  return ticks;
}

function driveOut(ticks: SimTick[]): { ended: boolean; endedAtSec: number | null } {
  let s = createLessonSession(GREEN_WAVE_LESSON);
  for (const tick of ticks) {
    s = applyTick(s, tick).state;
    if (s.phase !== "driving") break;
  }
  return { ended: s.phase !== "driving", endedAtSec: s.endedAtSec ?? null };
}

describe("the drive the sweep could not close", () => {
  it("a car that stops 44 m past the terminal node now reaches its debrief", () => {
    // 572 = 528 + 44: in the band. Two hundred seconds of standstill ticks —
    // more than the 173 s the audit recorded — and before this face the phase
    // was still "driving" on the last one.
    const r = driveOut(driveThenRest(572, 200));
    expect(r.ended).toBe(true);
    expect(r.endedAtSec).not.toBeNull();
  });

  it("…and the car that drove clear still ends on exactly the second it did", () => {
    // 140 m past: outside the departure circle, so this is the pre-existing
    // path and it must be untouched — the leave window, and nothing else.
    const clear = driveOut(driveThenRest(668, 200));
    const stranded = driveOut(driveThenRest(572, 200));
    expect(clear.ended).toBe(true);
    // The stranded car waits out the longer bar; the departed one does not.
    expect(clear.endedAtSec!).toBeLessThan(stranded.endedAtSec!);
    expect(stranded.endedAtSec! - clear.endedAtSec!).toBeGreaterThan(
      FINISH_OUTSIDE_STUCK_S - FINISH_LEAVE_S - 10,
    );
  });
});
