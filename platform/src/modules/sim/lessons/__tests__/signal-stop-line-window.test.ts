/**
 * THE CLIFF AT A METRE AND A HALF — `sc-signal-response`, three runs of the
 * SAME junction on staging (founder, 2026-08-16):
 *
 *   · stopped 10.6 m short of the paint (PC)   → the whole red-wait arc: the
 *     «Чакаш правилно на червено» card, «Защо чакаш: червен сигнал»,
 *     «Чакането Е маневрата», green at 28 s, «Изчака сигнала и тръгна чисто».
 *     Three tasks ✓, 0 points, 3★.
 *   · stopped 12.5 m short (phone)             → NOTHING, for seventy-five
 *     seconds. The only thing on the screen for the entire wait was
 *     «Кола отзад · 2 м». The debrief then praised him: «чисто каране без нито
 *     едно нарушение».
 *   · stopped 8.5 m PAST the line (PC)         → the same silence from the
 *     other side, and the same praise.
 *
 * 1.9 m decided the first two, and the MORE cautious drive is the one that got
 * silence. `YIELD_STOP_LINE_REACH_M` was 12.
 *
 * THIS FILE PINS BOTH DIRECTIONS, because widening a window is exactly how a
 * false pass ships:
 *   ▸ the cautious stop must now be recognised and narrated;
 *   ▸ the stop 40 m short must STILL not be — the founder's own bar: „a student
 *     who stops 40 m short has NOT stopped at the line and must not be told he
 *     did";
 *   ▸ the stop past the line must still get no hold and no reason, so the
 *     widening cannot be the thing that swallows an overshoot;
 *   ▸ and standing still at a GREEN light must stay outside the window
 *     entirely, or the hold would start freezing the finish gates for a
 *     dawdler — HESITATION_AT_GREEN's whole subject.
 */

import { describe, expect, it } from "vitest";
import { advisorPromptForSession } from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { YIELD_STOP_LINE_REACH_M, YIELD_WAIT_MAX_S, stepYieldWait, yieldReasonAt } from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import {
  JUNCTION_LANE_CENTER_M,
  JUNCTION_STOP_LINE_M,
  SC_JUNCTION_STOP,
  SC_JUNCTION_SCAN,
  SC_SIGNAL_RESPONSE,
  SC_TURN_LEFT_ONCOMING,
} from "../scenario/templates-junctions";
import {
  SC_SIGNAL_CONTROLLER,
  SC_SIGNAL_DEAD,
  SC_SIGNAL_FLASHING,
  SC_SIGNAL_HESITATION,
  SC_SIGNAL_REDYELLOW,
} from "../scenario/templates-signals";
import {
  SC_SIG_CONTROLLER_LIVE,
  SC_SIG_CONTROLLER_POSTURES,
} from "../scenario/templates-signals2";
import type { ScenarioSpec } from "../scenario/types";
import type { HudEvent } from "../../contracts";
import type { LessonSessionState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

// --- The drill, exactly as it compiles for a student -----------------------
const LESSON = compileScenario(SC_SIGNAL_RESPONSE, 1);
const PARAMS: ObjectiveParams[] = LESSON.objectives.map(parseObjectiveParams);
const CTX = { params: PARAMS, currentIndex: 1 };

/** sx-v1's northbound lane centre and its south-approach stop line (y). */
const LANE_X = JUNCTION_LANE_CENTER_M;
const LINE_Y = -JUNCTION_STOP_LINE_M;

/** The three measured poses, as the y the founder's car actually rested at. */
const POSE_CREDITED_Y = LINE_Y - 10.6; // −38.325  (PC: the full arc)
const POSE_SILENCED_Y = LINE_Y - 12.5; // −40.225  (phone: nothing, 75 s)
const POSE_PAST_LINE_Y = LINE_Y + 8.5; //  −19.225 (PC: inside the junction)

/**
 * One frame of the founder's phone run: stationary on the approach, with the
 * world reporting the red he is waiting for. `shortM` is his distance to the
 * paint — the same quantity `nextStopLineM` carries.
 */
function waitingFrame(
  shortM: number,
  opts: { t?: number; state?: "red" | "redYellow" | "yellow" | "green"; speedKmh?: number } = {},
) {
  return makeTick({
    t: opts.t ?? 0,
    speedKmh: opts.speedKmh ?? 0,
    position: { x: LANE_X, y: LINE_Y - shortM },
    nextStopLineM: shortM,
    nextStopLineControl: "trafficLight",
    nextStopLineState: opts.state ?? "red",
  });
}

// ---------------------------------------------------------------------------
// The geometry that forced the number.
// ---------------------------------------------------------------------------

/**
 * Every drill in the three template files of this lane that stands its student
 * on a map whose derived line is JUNCTION_STOP_LINE_M out (sx-v1, tj-stop-v1 —
 * the „primary/secondary mouth" family; tj-rhr-v1's 18 m line and the pe-jay /
 * sig-wave maps have their own geometry and are excluded rather than guessed
 * at), paired with the FIRST objective of each — the approach checkpoint.
 */
const APPROACH_GATES: ReadonlyArray<readonly [ScenarioSpec, string]> = [
  [SC_SIGNAL_RESPONSE, "sc-sig-approach"],
  [SC_JUNCTION_STOP, "sc-jstop-approach"],
  [SC_JUNCTION_SCAN, "sc-jscan-approach"],
  [SC_TURN_LEFT_ONCOMING, "sc-ltap-approach"],
  [SC_SIGNAL_DEAD, "sc-sdead-approach"],
  [SC_SIGNAL_FLASHING, "sc-sflash-approach"],
  [SC_SIGNAL_HESITATION, "sc-shes-approach"],
  [SC_SIGNAL_CONTROLLER, "sc-sctrl-approach"],
  [SC_SIGNAL_REDYELLOW, "sc-sry-approach"],
  [SC_SIG_CONTROLLER_LIVE, "sc-sctl-read"],
  [SC_SIG_CONTROLLER_POSTURES, "sc-sctp-read"],
];

describe("the window has to contain the pose the lesson's own gate sends him to", () => {
  it("no approach gate in this lane parks the student outside the lawful-wait window", () => {
    const measured: Array<[string, number]> = [];
    for (const [spec, id] of APPROACH_GATES) {
      const gate = spec.success.find((o) => o.id === id)?.params;
      expect(gate?.kind, id).toBe("reachZone");
      if (gate?.kind !== "reachZone") continue;
      // Far edge of the zone measured from the node, then from that map's
      // paint. Radial rather than along-axis, so it is the conservative read
      // for the gates that approach along x (`sc-ltap-approach`).
      const farEdgeFromLine =
        Math.hypot(gate.x, gate.y) + gate.radiusM - JUNCTION_STOP_LINE_M;
      measured.push([id, +farEdgeFromLine.toFixed(2)]);
      // A lesson may not refuse to recognise the pose it sends the student to.
      // Break this and the choice is real: move the gate, or re-derive
      // YIELD_STOP_LINE_REACH_M — never leave the student in the gap.
      expect(farEdgeFromLine, id).toBeLessThanOrEqual(YIELD_STOP_LINE_REACH_M);
    }
    // The deepest three — the ones that forced 12 → 26, one светофар drill, two
    // Б2 drills and a left-turn drill, so this was never a traffic-light quirk.
    expect(measured).toEqual(
      expect.arrayContaining([
        ["sc-sig-approach", 25.46],
        ["sc-jstop-approach", 25.46],
        ["sc-jscan-approach", 25.46],
        ["sc-ltap-approach", 25.46],
      ]),
    );
    expect(measured).toHaveLength(APPROACH_GATES.length);
  });

  it("the window still ends well short of „not at the line at all“", () => {
    // The founder's own bar. If this ever inverts, the card starts certifying
    // a car stopped in open road.
    expect(YIELD_STOP_LINE_REACH_M).toBeLessThan(40);
  });
});

// ---------------------------------------------------------------------------
// DIRECTION 1 — the cautious stop must be recognised. Fails on the old 12 m.
// ---------------------------------------------------------------------------

describe("the 1.9 m that decided whether the lesson spoke", () => {
  it("12.5 m short of the paint at a red is a lawful wait (was silence at 12 m)", () => {
    expect(yieldReasonAt(waitingFrame(12.5), CTX, [])).toBe("redLight");
    expect(stepYieldWait(undefined, waitingFrame(12.5), CTX).holding).toBe(true);
  });

  it("the 10.6 m run that already worked is untouched", () => {
    expect(yieldReasonAt(waitingFrame(10.6), CTX, [])).toBe("redLight");
  });

  it("both poses sit inside the drill's own approach gate — that is the point", () => {
    const gate = PARAMS[0];
    if (gate.kind !== "reachZone") throw new Error("shape");
    const inGate = (y: number) => Math.hypot(LANE_X - gate.x, y - gate.y) <= gate.radiusM;
    expect(inGate(POSE_CREDITED_Y)).toBe(true);
    expect(inGate(POSE_SILENCED_Y)).toBe(true);
  });

  it("end to end: the phone run now gets the whole arc it waited 75 s for", () => {
    let s: LessonSessionState = createLessonSession(LESSON);
    const notices: HudEvent[] = [];
    // Frame 1 describes the car at its spawn (the engine's pose guard), then
    // the approach, then the pose he actually rested at.
    s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -105 } })).state;
    s = applyTick(
      s,
      makeTick({ t: 0.1, position: { x: LANE_X, y: -60 }, speedKmh: 30, nextStopLineM: 32.3 }),
    ).state;
    for (let i = 1; i <= 750; i++) {
      const step = applyTick(s, waitingFrame(12.5, { t: +(0.1 + i / 10).toFixed(1) }));
      s = step.state;
      notices.push(...step.hudEvents);
    }

    // The card, live, for the whole wait.
    expect(advisorPromptForSession(s)?.textBg).toContain("Чакаш правилно на червено");
    // The staged teach lines — named once, settled once, never on every frame.
    const titles = notices.filter((e) => e.kind === "lesson").map((e) => e.titleBg);
    expect(titles).toContain("Защо чакаш: червен сигнал");
    expect(titles).toContain("Чакането Е маневрата");
    expect(titles.filter((t) => t === "Защо чакаш: червен сигнал")).toHaveLength(1);
    // And the 75 s belong to the light, not to his ориентировъчно време.
    expect(s.yieldWaitSec ?? 0).toBeGreaterThan(70);
    expect(s.phase).toBe("driving");
  });
});

// ---------------------------------------------------------------------------
// DIRECTION 2 — the sloppy drive is still convicted. A one-directional test is
// how a false pass ships.
// ---------------------------------------------------------------------------

describe("the drives that must STILL get nothing", () => {
  it("40 m short of the line is stopped in open road, not at the line", () => {
    expect(yieldReasonAt(waitingFrame(40), CTX, [])).toBeNull();
    expect(stepYieldWait(undefined, waitingFrame(40), CTX).holding).toBe(false);
  });

  it("the boundary is the constant, and it is exclusive on the far side", () => {
    expect(yieldReasonAt(waitingFrame(YIELD_STOP_LINE_REACH_M), CTX, [])).toBe("redLight");
    expect(yieldReasonAt(waitingFrame(YIELD_STOP_LINE_REACH_M + 0.1), CTX, [])).toBeNull();
  });

  it("standing still at a GREEN light is never a lawful wait, at any distance", () => {
    // HESITATION_AT_GREEN's whole subject. If the hold ever covered this, it
    // would freeze the finish gates for the one standstill that IS a fault.
    for (const shortM of [1, 10.6, 12.5, 25]) {
      expect(yieldReasonAt(waitingFrame(shortM, { state: "green" }), CTX, []), `${shortM} m`).toBeNull();
    }
  });

  it("stopped 8.5 m PAST the line gets no hold and no reason", () => {
    // The third run. Past the paint the runtime publishes no line at all
    // (`d >= 0` only), so the widening cannot reach him from this side — and
    // must not: every word of the redLight copy opens «Спрял си ПРЕД
    // стоп-линията», which is the one thing that is not true of him.
    const inJunction = makeTick({
      t: 5,
      speedKmh: 0,
      position: { x: LANE_X, y: POSE_PAST_LINE_Y },
    });
    expect(yieldReasonAt(inJunction, CTX, [])).toBeNull();
    const held = stepYieldWait(undefined, inJunction, CTX);
    expect(held.holding).toBe(false);
    expect(held.reason).toBeNull();
    // And the session may not bank his standstill as a lawful wait.
    expect(held.sinceSec).toBeNull();
  });

  it("a car still ROLLING toward the line is not waiting, however good the reason", () => {
    expect(stepYieldWait(undefined, waitingFrame(12.5, { speedKmh: 9 }), CTX).holding).toBe(false);
  });

  it("the widened window is still bounded — an abandoned tab ends", () => {
    let w = stepYieldWait(undefined, waitingFrame(12.5, { t: 0 }), CTX);
    expect(w.holding).toBe(true);
    w = stepYieldWait(w, waitingFrame(12.5, { t: YIELD_WAIT_MAX_S + 1 }), CTX);
    expect(w.holding).toBe(false);
    // The reason is still published past the ceiling — the world does not
    // change because a timer expired; only the freeze is spent.
    expect(w.reason).toBe("redLight");
  });
});
