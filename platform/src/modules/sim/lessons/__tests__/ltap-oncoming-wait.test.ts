/**
 * THE WAIT THIS DRILL IS MADE OF — `sc-turn-left-oncoming:7974670c` (critical),
 * frame `.audit-frames/sweep161/sc-turn-left-oncoming/pc-right/04-t043s.png`:
 * *„the skill the briefing names — judging an oncoming gap in seconds — is
 * never exercised."*
 *
 * WHAT WAS STILL TRUE AT HEAD 85495fd, after the gate had been given the norm.
 * Wave 20 (`b8b1ce4`) made the drill MEASURE the interval — `reportOncomingGapSec`
 * on `sc-ltap-turn`, reported on the debrief row — and refuse the gate on a
 * billed cut (`requireYieldClean`). Both act AFTER the manoeuvre. The exercise
 * itself is the ten seconds the student stands at the mouth counting, and for
 * the whole of those seconds the product still saw nothing:
 *
 *   · `worldRuntime` computes the seconds to the most urgent oncoming EVERY
 *     frame and threw the number away unless the player committed a turn. Only
 *     a RAIL vehicle's copy of it was ever published (`oncomingRailGapSec`,
 *     RX-05) — and this drill stages cars.
 *   · so `yieldReasonAt` had no clause that could see the car being let
 *     through. This junction is SIGNALIZED, so the only reason it could ever
 *     return was `redLight` — a wait that ends when the lamp turns, while the
 *     oncoming is still coming.
 *   · so from the green onward: no hold, the finish gates live under a
 *     stationary car, ZERO seconds credited against the par time, and
 *     `advisorPromptForSession` back on the waypoint 50 m past the car he was
 *     yielding to. The one drill whose whole subject is the interval said
 *     nothing at all while the interval was being judged.
 *
 * THE MUTATIONS THAT MUST TURN THESE RED: drop the `else` that publishes
 * `oncomingVehicleGapSec` in `worldRuntime`; delete clause 4b from
 * `yieldReasonAt`; arm that clause on presence instead of on the authored
 * `reportOncomingGapSec`; give `oncomingVehicle` a `longCardBg`.
 */

import { describe, expect, it } from "vitest";
import {
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_SETTLE_S,
  advisorPromptForSession,
  yieldCardCopyCoversLongWait,
  yieldWaitAdvisorPrompt,
} from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { createYieldWait, stepYieldWait, yieldReasonAt, type YieldWaitContext } from "../finish";
import { parseObjectiveParams, type WitnessedReachZoneParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_TURN_LEFT_ONCOMING } from "../scenario/templates-junctions";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { HudEvent } from "../../contracts";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

/** The rung a student actually receives, through `compileScenario`. */
const LESSON = compileScenario(SC_TURN_LEFT_ONCOMING, 3);
const PARAMS = LESSON.objectives.map(parseObjectiveParams);
const CTX: YieldWaitContext = { params: PARAMS, currentIndex: 0 };

/** The drill's OWN published norm — never a constant recalled here. */
const NORM_SEC = (
  parseObjectiveParams(
    LESSON.objectives.find((o) => o.id === "sc-ltap-turn")!,
  ) as WitnessedReachZoneParams
).reportOncomingGapSec!;

/** sx-v1's east arm, westbound lane centre; the junction node is the origin. */
const LANE_Y = 4.06;
/** The mouth — where briefing steps 6–7 tell him to stand and count. */
const MOUTH = { x: 12, y: LANE_Y };

type LessonNotice = Extract<HudEvent, { kind: "lesson" }>;
const lessonNotices = (events: readonly HudEvent[]): LessonNotice[] =>
  events.filter((e): e is LessonNotice => e.kind === "lesson");

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE CLAUSE — and the scope that keeps it off every other lesson
   ══════════════════════════════════════════════════════════════════════════ */

describe("yieldReasonAt sees the oncoming car", () => {
  const at = (overrides: Parameters<typeof makeTick>[0], ctx: YieldWaitContext = CTX) =>
    yieldReasonAt(makeTick({ position: MOUTH, ...overrides }), ctx, []);

  it("the norm it arms on is the drill's own published figure", () => {
    // Asserted against the briefing rather than against a number typed here:
    // a copy pass that softened the norm in words would fail on this row
    // instead of leaving the coach quoting a standard nobody was given.
    expect(NORM_SEC).toBe(4);
    const briefing = SC_TURN_LEFT_ONCOMING.instructionsBg.map((s) => s.textBg).join(" ");
    expect(briefing).toContain("4 секунди");
    expect(yieldWaitAdvisorPrompt("oncomingVehicle").textBg).toContain("4 секунди");
  });

  it("names the oncoming car while it is inside that norm", () => {
    expect(at({ oncomingVehicleGapSec: 1.4 })).toBe("oncomingVehicle");
    expect(at({ oncomingVehicleGapSec: NORM_SEC })).toBe("oncomingVehicle");
    expect(at({ oncomingVehicleGapSec: 0 })).toBe("oncomingVehicle");
  });

  it("…and lets go the moment the interval is takeable", () => {
    // The wait must END at the norm, or the coach would be holding a student
    // at a gap the same drill grades as correct to turn into.
    expect(at({ oncomingVehicleGapSec: NORM_SEC + 0.01 })).toBeNull();
    expect(at({ oncomingVehicleGapSec: 18 })).toBeNull();
  });

  it("ABSENT is unknown, not «the lane is clear» — and it holds nobody", () => {
    expect(at({})).toBeNull();
    expect(makeTick({}).oncomingVehicleGapSec).toBeUndefined();
  });

  it("refuses a nonsense gap rather than converting it into a hold", () => {
    expect(at({ oncomingVehicleGapSec: -1 })).toBeNull();
    expect(at({ oncomingVehicleGapSec: Number.NaN })).toBeNull();
  });

  it("is SCOPED to a route that still has a gate declaring the norm", () => {
    // The whole difference from the rail clause. A tram is a duty wherever one
    // exists; an oncoming car is at every junction in the catalogue, so arming
    // on presence would freeze the finish gates under any student who stopped
    // with traffic coming the other way. Once the turn is ticked, the oncoming
    // lane is somebody else's problem again.
    const done: YieldWaitContext = { params: PARAMS, currentIndex: PARAMS.length };
    expect(at({ oncomingVehicleGapSec: 1.4 }, done)).toBeNull();
  });

  it("…and every other lesson in the catalogue is byte-identical", () => {
    // Measured over the shipped catalogue rather than argued: exactly one gate
    // authors the norm, so exactly one route can raise this reason.
    const declaring = SCENARIO_TEMPLATES.flatMap((spec) =>
      (spec.success ?? []).filter(
        (o) =>
          o.params.kind === "reachZone" &&
          (o.params as { reportOncomingGapSec?: number }).reportOncomingGapSec !== undefined,
      ).map((o) => `${spec.id}/${o.id}`),
    );
    expect(declaring).toEqual(["sc-turn-left-oncoming/sc-ltap-turn"]);

    const other = compileScenario(
      SCENARIO_TEMPLATES.find((s) => s.id === "sc-junction-stop")!,
      1,
    );
    const otherCtx: YieldWaitContext = {
      params: other.objectives.map(parseObjectiveParams),
      currentIndex: 0,
    };
    expect(at({ oncomingVehicleGapSec: 1.4 }, otherCtx)).toBeNull();
  });

  it("the LAMP still wins at the stop line — the red is a different wait", () => {
    // He is stopped AT the line for the red; the oncoming duty begins where the
    // red one ends, which is the whole argument for the clause existing.
    expect(
      at({
        oncomingVehicleGapSec: 1.4,
        nextStopLineM: 4,
        nextStopLineControl: "trafficLight",
        nextStopLineState: "red",
      }),
    ).toBe("redLight");
  });

  it("a tram is still the tram — the two channels never cross", () => {
    expect(at({ oncomingRailGapSec: 1.5 })).toBe("railVehicle");
    // And a person on the zebra outranks both.
    expect(
      yieldReasonAt(makeTick({ position: MOUTH, oncomingVehicleGapSec: 1.4 }), CTX, ["sx-x-1"]),
    ).toBe("pedestrian");
  });
});

describe("the hold itself", () => {
  it("standing still for a closing oncoming IS holding, with the reason named", () => {
    const tick = makeTick({ t: 1, position: MOUTH, speedKmh: 0, oncomingVehicleGapSec: 1.4 });
    const wait = stepYieldWait(createYieldWait(), tick, CTX);
    expect(wait.holding).toBe(true);
    expect(wait.reason).toBe("oncomingVehicle");
    expect(wait.sinceSec).toBe(1);
  });

  it("but CREEPING into it is not a wait — the caller owns the standstill bar", () => {
    const rolling = makeTick({ t: 1, position: MOUTH, speedKmh: 9, oncomingVehicleGapSec: 1.4 });
    expect(stepYieldWait(createYieldWait(), rolling, CTX).holding).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2 · WHAT THE STUDENT IS TOLD — requirement zero on the frame that was filed
   ══════════════════════════════════════════════════════════════════════════ */

describe("the live card counts seconds, and never hints him across", () => {
  const card = yieldWaitAdvisorPrompt("oncomingVehicle").textBg;

  it("says the oncoming goes first and that the interval is counted", () => {
    expect(card).toContain("Чакаш правилно");
    expect(card).toContain("насрещните");
    expect(card).toContain("секунди");
  });

  it("never becomes a «go now» card, however long the wait runs", () => {
    // The safety line this reason shares with redLight / pedestrian /
    // railVehicle: what ends this wait is a car passing the mouth, and a second
    // card nudging a seventeen-year-old into a left turn across live oncoming
    // traffic is the exact misjudgement the drill exists to break.
    expect(yieldCardCopyCoversLongWait("oncomingVehicle")).toBe(false);
    for (const held of [0, 30, 120]) {
      expect(yieldWaitAdvisorPrompt("oncomingVehicle", held).textBg, `${held}s`).toBe(card);
    }
    expect(yieldWaitAdvisorPrompt("oncomingVehicle").keys).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE LIVE CONSUMER — a real session, driven through `applyTick`
   ══════════════════════════════════════════════════════════════════════════ */

describe("on a real sc-turn-left-oncoming session", () => {
  /** Approach the junction, then stand at the mouth with the oncoming closing. */
  function waitAtTheMouth(gapSec: number | undefined): LessonSessionState {
    let s = createLessonSession(LESSON);
    s = applyTick(s, makeTick({ t: 0, position: { x: 90, y: LANE_Y }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: 45, y: LANE_Y }, speedKmh: 30 })).state;
    let t = 0.1;
    for (let i = 0; i < 60; i++) {
      t = +(t + 0.1).toFixed(1);
      s = applyTick(
        s,
        makeTick({
          t,
          position: MOUTH,
          speedKmh: 0,
          ...(gapSec === undefined ? {} : { oncomingVehicleGapSec: gapSec }),
        }),
      ).state;
    }
    return s;
  }

  it("the wait is a WAIT: held, named, and credited against the par time", () => {
    const state = waitAtTheMouth(1.4);
    expect(state.phase).toBe("driving");
    expect(state.yieldWait?.holding).toBe(true);
    expect(state.yieldWait?.reason).toBe("oncomingVehicle");
    // The seconds he stood are subtracted from ориентировъчното време — the
    // measure the settled card promises him («не ти струват нищо»).
    expect(state.yieldWaitSec ?? 0).toBeGreaterThan(5);
  });

  it("…and the same standstill with no oncoming is credited nothing", () => {
    // The polarity that keeps every other drive in the catalogue unchanged:
    // absence is unknown, and unknown never manufactures a hold.
    const state = waitAtTheMouth(undefined);
    expect(state.yieldWait?.holding).toBe(false);
    expect(state.yieldWaitSec ?? 0).toBe(0);
  });

  it("and the coach's answer to «what now» is the oncoming, not the waypoint", () => {
    // THE ROW'S OWN FRAME. Before this, `advisorPromptForSession` fell through
    // to the objective prompt and pointed at the reach zone 50 m down the south
    // arm while the car he was letting through was still crossing in front.
    const prompt = advisorPromptForSession(waitAtTheMouth(1.4));
    expect(prompt).not.toBeNull();
    expect(prompt!.textBg).toBe(yieldWaitAdvisorPrompt("oncomingVehicle").textBg);
  });

  it("…and the НАУЧИ lines about the interval actually reach the HUD", () => {
    // The engine, not the pure fold: `applyTick` is what pushes the voice's
    // notices onto `hudEvents`, and a repair that never reached that push would
    // satisfy every row above and still say nothing to a student.
    let s = createLessonSession(LESSON);
    s = applyTick(s, makeTick({ t: 0, position: { x: 90, y: LANE_Y }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: 45, y: LANE_Y }, speedKmh: 30 })).state;
    const said: LessonNotice[] = [];
    let t = 0.1;
    for (let i = 0; i < (YIELD_VOICE_SETTLE_S + 2) * 10; i++) {
      t = +(t + 0.1).toFixed(1);
      const out = applyTick(
        s,
        makeTick({ t, position: MOUTH, speedKmh: 0, oncomingVehicleGapSec: 1.4 }),
      );
      s = out.state;
      said.push(...lessonNotices(out.hudEvents));
    }
    expect(t).toBeGreaterThan(YIELD_VOICE_NAME_S);
    // Both stages, and each exactly once — the „why" and then the reassurance
    // that the seconds cost him nothing.
    const titles = said.map((n) => n.titleBg);
    expect(titles).toContain("Защо чакаш: завиващият наляво пропуска");
    expect(titles.filter((x) => x.startsWith("Чакането Е маневрата"))).toHaveLength(1);
    // ADR-002: every legal claim in the wait is the retrieved чл. 37, ал. 1.
    for (const n of said) expect(n.lawRef).toBe("ЗДвП чл. 37, ал. 1");
  });
});
