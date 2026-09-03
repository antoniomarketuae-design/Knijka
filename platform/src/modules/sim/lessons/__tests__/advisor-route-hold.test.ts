/**
 * sc-roundabout-entry:4ab693eb (critical) — THE COACH ORDERED A MANOEUVRE INTO
 * A HEDGE.
 *
 * THE FRAME. `.audit-frames/sweep161/sc-roundabout-entry/pc-right/04-t141s.png`
 * on «Кръгово движение · Ниво 1 — Пълна помощ»: the whole windscreen is the
 * roundabout's grass island and a planted crown at point-blank range, the
 * cluster reads 0 км/ч, the drive is about to close with −10
 * «Пътнотранспортно произшествие» — and the advisor card reads «Излез от
 * кръговото с десен мигач». There is no ring under that car to leave.
 *
 * WHAT WAS ALREADY FIXED BEFORE THIS ROW, so it is not re-litigated here:
 *   · the runtime publishes `edgeId: null` past the kerb (worldRuntime.ts,
 *     2026-08-26) and `surfaceAt` reads the painter's own asphalt;
 *   · `OFF_CARRIAGEWAY` is a catalogued, billed, cited fault (2026-08-30), so
 *     the debrief no longer lists a collision and says nothing about the car
 *     having left the road;
 *   · `objectiveTitleUnderHold` (sc-junction-blind:c5ba8f17) qualifies the two
 *     surfaces that PRINT the objective — the banner and the phone task line.
 *
 * WHAT WAS NOT. The advisor is the THIRD surface, and it is the one whose whole
 * contract is „what do I do now": `advisorPromptForSession` had no reading of
 * the car's position at all, so for the 75 s between the excursion and
 * `OFF_NETWORK_STUCK_S` it kept issuing the objective. Doc 64 THEO-4 forbids a
 * bare verdict; an order given to a student who physically cannot obey it is
 * the same crime pointing the other way.
 *
 * BOTH DIRECTIONS ARE PINNED BELOW, because a card that simply went quiet, or
 * one that never came back, would each pass a one-sided test.
 */

import { describe, expect, it } from "vitest";

import { VIOLATIONS, type SimTick } from "../../rules";
import {
  ROUTE_HOLD_S,
  advisorPromptForObjective,
  advisorPromptForSession,
  routeHoldAdvisorPrompt,
  routeHoldForSession,
} from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

/** The lesson the frame was shot on — the template's own L1, not a double. */
const LESSON = compileScenario(SC_ROUNDABOUT_ENTRY, 1);
const EXAM_LESSON = { ...LESSON, examMode: true };

/** rb-mini's shipped approach lane (spawnPoints[0].x). */
const LANE_X = 4.06;
/** The card the frame photographs — `advisorPromptForObjective`'s ring phase. */
const RING_CARD_BG = "Излез от кръговото с десен мигач";

const RING_EDGE = "rbm-e-ring-se";

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

/**
 * A point on rb-mini's circulatory carriageway at azimuth `phiDeg` about the
 * island, in `stepRoundabout`'s own convention (south mouth 0°, east 90°,
 * counter-clockwise = the direction Bulgarian traffic circulates). r = 20 m is
 * mid-band: the drivable ring is 18 ± 4.06.
 */
function ring(phiDeg: number, r = 20): { x: number; y: number } {
  const rad = (phiDeg * Math.PI) / 180;
  return { x: r * Math.sin(rad), y: -r * Math.cos(rad) };
}

/**
 * A car that has done the drill's first rung and has GONE ROUND — 58.5° of
 * measured arc about the island, from the south mouth to φ = 70°, i.e. the
 * state the photographed drive was in one second before it left the asphalt if
 * it had actually circulated. `entered` has latched (d ≤ enterRadiusM 24) AND
 * the passage is real, so the coach is saying the ring-exit sentence,
 * correctly.
 *
 * THE ARC IS PART OF THE FIXTURE, not decoration (sc-roundabout-entry:4ab693eb,
 * second pass). This helper used to stop at (4.06, −20) — one tick inside the
 * entry circle with 0° of arc behind it — and assert the exit card there. That
 * car has crossed the give-way line and nothing else, and the card it was
 * asserted to receive is the same one the frame photographs against the island.
 * `advisorPromptForObjective` now gates the sentence on the same passage
 * `stepRoundabout` demands before it will credit an exit, so the fixture has to
 * be the drive its own docstring always claimed it was.
 */
function onTheRing(): { state: LessonSessionState; t: number } {
  let s = createLessonSession(LESSON);
  // Frame 1 describes the vehicle at its spawn (the engine's pose guard).
  s = step(s, 0, LANE_X, -93, 0);
  s = step(s, 0.5, LANE_X, -60, 15, { edgeId: "rbm-e-arm-s" });
  s = step(s, 1.0, LANE_X, -40, 12, { edgeId: "rbm-e-arm-s" });
  // …the give-way approach zone (x 4.06, y −34, r 9, ≤ 25 км/ч).
  s = step(s, 1.5, LANE_X, -36, 8, { edgeId: "rbm-e-arm-s" });
  s = step(s, 2.0, LANE_X, -20, 10, { edgeId: RING_EDGE });
  // …and round it, counter-clockwise, past the first (east) mouth.
  let t = 2.0;
  for (const phi of [30, 50, 70]) {
    t += 0.5;
    const p = ring(phi);
    s = step(s, t, p.x, p.y, 15, { edgeId: RING_EDGE });
  }
  return { state: s, t };
}

describe("the drill the frame was shot on, driven to the moment before the excursion", () => {
  it("the first rung is behind him and the coach is on the ring sentence", () => {
    const { state } = onTheRing();
    expect(state.phase).toBe("driving");
    expect(state.currentObjectiveIndex, "the ring objective must be active").toBe(1);
    expect(state.objectives[1]?.spec.id).toBe("sc-rb-ring");
    expect(state.evalStates[1]).toMatchObject({ type: "roundabout", entered: true });
    const arc = state.evalStates[1];
    expect(arc?.type === "roundabout" ? Math.abs(arc.traversalArcDeg ?? 0) : 0).toBeGreaterThan(
      ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG,
    );
    // The sentence in the frame — and after a real passage it is the right one.
    expect(advisorPromptForSession(state)?.textBg).toBe(RING_CARD_BG);
    expect(routeHoldForSession(state)).toBeNull();
  });
});

describe("on the central island the coach stops ordering the ring exit", () => {
  /** Roll onto the island (r = 8.5 m, inside the kerb) and sit there. The
   *  point is where a car leaving the ring at φ = 70° lands, so the excursion
   *  does not silently unwind the arc it has already travelled. */
  const ISLAND = ring(70, 8.5);

  function ontoTheIsland(sec: number): LessonSessionState {
    const { state, t } = onTheRing();
    let s = state;
    for (let i = 1; i * 0.5 <= sec; i++) {
      s = step(s, t + i * 0.5, ISLAND.x, ISLAND.y, 3, { edgeId: null });
    }
    return s;
  }

  it("holds `offRoad` once the excursion has stood for ROUTE_HOLD_S", () => {
    const s = ontoTheIsland(ROUTE_HOLD_S + 1);
    expect(s.phase, "nothing else may have closed the drive by now").toBe("driving");
    expect(s.offNetworkSinceSec, "the engine's own fold, not a second reading").not.toBeNull();
    expect(routeHoldForSession(s)).toBe("offRoad");
  });

  it("…and the card is the recovery, not «Излез от кръговото с десен мигач»", () => {
    const said = advisorPromptForSession(ontoTheIsland(ROUTE_HOLD_S + 1));
    expect(said).not.toBeNull();
    expect(said!.textBg).not.toBe(RING_CARD_BG);
    expect(said!.textBg).toBe(routeHoldAdvisorPrompt("offRoad").textBg);
  });

  it("BEFORE the hold matures the authored objective still stands", () => {
    // The qualification may not fire on a wheel that clipped a kerb for a
    // frame: the ladder is the same five seconds the banner already waits.
    const s = ontoTheIsland(ROUTE_HOLD_S - 2);
    expect(routeHoldForSession(s)).toBeNull();
    expect(advisorPromptForSession(s)?.textBg).toBe(RING_CARD_BG);
  });

  it("and it ENDS the frame he is back on tarmac — the drill is not retired", () => {
    // A card that never came back would trade one wrong instruction for a
    // student who is told nothing for the rest of the drive.
    let s = ontoTheIsland(ROUTE_HOLD_S + 1);
    expect(routeHoldForSession(s)).toBe("offRoad");
    const back = ring(70);
    s = step(s, s.lastT + 0.5, back.x, back.y, 10, { edgeId: RING_EDGE });
    expect(routeHoldForSession(s)).toBeNull();
    expect(advisorPromptForSession(s)?.textBg).toBe(RING_CARD_BG);
  });
});

describe("pinned in what he just hit — the same silence, the other clause", () => {
  function pinned(sec: number): LessonSessionState {
    const { state, t } = onTheRing();
    const island = ring(70, 8.5);
    let s = applyTick(
      state,
      makeTick({
        t: t + 0.5,
        position: { x: island.x, y: island.y },
        speedKmh: 6,
        edgeId: null,
        events: [{ kind: "collision", withWhat: "staticObject" }],
      }),
    ).state;
    expect(s.crashPin, "the collision must arm the pin").toBeDefined();
    for (let i = 1; i * 0.5 <= sec; i++) {
      s = step(s, t + 0.5 + i * 0.5, island.x, island.y, 0, { edgeId: null });
    }
    return s;
  }

  it("the pin OUTRANKS the excursion, exactly as the banner reads it", () => {
    // The photographed drive is both at once (it left the road AND hit the
    // planting). `routeHoldForSession` tests the pin first so the coach and
    // `objectiveTitleUnderHold` cannot name two different obstacles.
    const s = pinned(ROUTE_HOLD_S + 1);
    expect(s.phase).toBe("driving");
    expect(s.offNetworkSinceSec).not.toBeNull();
    expect(routeHoldForSession(s)).toBe("crashPinned");
    expect(advisorPromptForSession(s)?.textBg).toBe(routeHoldAdvisorPrompt("crashPinned").textBg);
  });

  it("its chip names the key that really walks the selector — the advisor's honesty rule", () => {
    const reverse = advisorPromptForObjective("t", {
      kind: "completeManeuver",
      maneuver: "parkInBay",
      // The bay rect is NESTED, not flattened — ParkInBayParams carries a
      // ParkingBaySpec (contracts.ts:653) plus the tolerances the grader needs.
      // Written flat, this compiled to nothing and TS2353'd on `x`.
      holdSec: 1.5,
      bay: { x: 0, y: 0, headingDeg: 0, widthM: 2.7, lengthM: 5 },
      centerTolM: 0.6,
      headingTolDeg: 12,
      entry: "reverse",
    });
    expect(routeHoldAdvisorPrompt("crashPinned").keys).toEqual(reverse.keys);
  });

  it("the off-road card promises no key at all", () => {
    // Which way the road lies depends on where the car is, and this module
    // cannot read it — the withdrawal `yieldWaitAdvisorPrompt` and
    // `controllerWaitAdvisorPrompt` already make.
    expect(routeHoldAdvisorPrompt("offRoad").keys).toEqual([]);
  });
});

describe("the copy — retrieved, explained, and not a second copy of the banner", () => {
  const cards = (["offRoad", "crashPinned"] as const).map((h) => ({
    hold: h,
    textBg: routeHoldAdvisorPrompt(h).textBg,
  }));

  it("both fit the 240 px column the rest of this module's cards are held to", () => {
    for (const { hold, textBg } of cards) {
      expect(textBg.length, hold).toBeGreaterThan(40);
      expect(textBg.length, hold).toBeLessThan(150);
    }
  });

  it("the off-road act and its reason are RETRIEVED from the row that bills it (ADR-002)", () => {
    const row = VIOLATIONS.OFF_CARRIAGEWAY;
    const act = "отпусни газта, изправи колелата и се върни под малък ъгъл";
    expect(row.correctiveBg, "the catalogue is the source of the act").toContain(act);
    expect(routeHoldAdvisorPrompt("offRoad").textBg).toContain(act);
    // …and the WHY is that row's own explanation, so the coach and the toast
    // that charges him cannot give a student two accounts of the same verge.
    for (const because of ["сцеплението е друго", "спирачният път е по-дълъг"]) {
      expect(row.explanationBg, because).toContain(because);
      expect(routeHoldAdvisorPrompt("offRoad").textBg, because).toContain(because);
    }
  });

  it("neither card is a bare verdict — each says the act AND why (THEO-4)", () => {
    for (const { hold, textBg } of cards) {
      expect(textBg, hold).toMatch(/ — |: /u);
    }
  });

  it("neither card re-reads the banner's qualification aloud", () => {
    // `objectiveTitleUnderHold` prints «Колата е … — … , за да продължиш:
    // <задачата>» directly above this card. The advisor's job is the half that
    // sentence structurally cannot carry: how to get out, and why it matters.
    for (const { hold, textBg } of cards) {
      expect(textBg.startsWith("Колата е"), hold).toBe(false);
      expect(textBg.includes("за да продължиш"), hold).toBe(false);
      expect(textBg.includes(RING_CARD_BG), hold).toBe(false);
    }
  });

  it("an exam session is still silent — the hold may not become a coaching side door", () => {
    const { state, t } = onTheRing();
    let s = { ...state, lesson: EXAM_LESSON } as LessonSessionState;
    for (let i = 1; i * 0.5 <= ROUTE_HOLD_S + 1; i++) {
      s = step(s, t + i * 0.5, 3, -8, 3, { edgeId: null });
    }
    expect(routeHoldForSession(s)).toBe("offRoad");
    expect(advisorPromptForSession(s)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE CARD MAY NOT ORDER AN EXIT THE EVALUATOR WOULD REFUSE TO COUNT
// ---------------------------------------------------------------------------
//
// The route hold above answers the frame five seconds late, and only because
// the car had left the carriageway. What put the sentence on the glass in the
// first place is upstream of both: `advisorPromptForObjective` keyed the ring
// phase on `entered` alone, and `stepRoundabout` latches that at
// d ≤ enterRadiusM — 24 m on rb-mini, against a drivable band that ends at
// 22.06. So the card was already saying «Излез от кръговото с десен мигач» to a
// car sitting AT the give-way line, and went on saying it while that car drove
// the 20 m straight across the middle into the island (9° of arc, measured).
//
// The gate is now the same passage the objective itself demands before it will
// tick an exit, so the coach cannot promise a manoeuvre the grader would void.

describe("the frame's drive — straight at the island, no passage — is never told to exit", () => {
  /** The photographed line: over the give-way line and on into the middle,
   *  which sweeps almost no arc about the island. */
  function straightAtTheIsland(): LessonSessionState {
    let s = createLessonSession(LESSON);
    s = step(s, 0, LANE_X, -93, 0);
    s = step(s, 0.5, LANE_X, -60, 15, { edgeId: "rbm-e-arm-s" });
    s = step(s, 1.0, LANE_X, -40, 12, { edgeId: "rbm-e-arm-s" });
    s = step(s, 1.5, LANE_X, -36, 8, { edgeId: "rbm-e-arm-s" });
    return s;
  }

  it("at the give-way line `entered` has latched — and the exit card has not", () => {
    // d = 20.4 on rb-mini's enterRadiusM of 24: inside the latch, still one
    // tick into the ring, nothing travelled.
    const s = step(straightAtTheIsland(), 2.0, LANE_X, -20, 10, { edgeId: RING_EDGE });
    expect(s.evalStates[1]).toMatchObject({ type: "roundabout", entered: true });
    expect(advisorPromptForSession(s)?.textBg).not.toBe(RING_CARD_BG);
  });

  it("and it is still not said with the car nose-deep in the grass (the frame)", () => {
    // Before ROUTE_HOLD_S matures, so this is the advisor's own reading and not
    // the off-road hold answering for it.
    let s = step(straightAtTheIsland(), 2.0, LANE_X, -20, 10, { edgeId: RING_EDGE });
    s = step(s, 2.5, 3, -8, 5, { edgeId: null });
    s = step(s, 3.0, 2, -6, 0, { edgeId: null });
    expect(routeHoldForSession(s), "the hold has not matured — this is the card's own gate").toBeNull();
    const arc = s.evalStates[1];
    expect(arc?.type === "roundabout" ? Math.abs(arc.traversalArcDeg ?? 0) : 999).toBeLessThan(
      ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG,
    );
    expect(advisorPromptForSession(s)?.textBg).not.toBe(RING_CARD_BG);
  });

  it("a ring the objective never watched approach still gets the sentence at once", () => {
    // Four of the five shipped roundabout rungs are handed a car already on the
    // ring (roundabout-traversal.test.ts's census), where `traversalArcDeg` is
    // null — „unmeasurable, do not ask". Gating on arc there would silence the
    // coach for a whole traversal he did drive.
    const said = advisorPromptForObjective(
      "t",
      { kind: "completeManeuver", maneuver: "roundabout", x: 0, y: 0, enterRadiusM: 24, exitRadiusM: 34 },
      {
        type: "roundabout",
        entered: true,
        exitSignaled: false,
        ringSignalArcDeg: null,
        prevAzimuthDeg: 10,
        traversalArcDeg: null,
        insideAzimuthDeg: 10,
        voidedExits: 0,
      },
    );
    expect(said.textBg).toBe(RING_CARD_BG);
    expect(said.keys).toEqual(["."]);
  });

  it("the invariant: whenever the card says «излез», obeying it is credited", () => {
    // The one property worth having. Drive the whole drill under a right stalk
    // from the first frame the card appears, and the objective ticks — so the
    // sentence is never an order the grader is about to void.
    const { state, t } = onTheRing();
    expect(advisorPromptForSession(state)?.textBg).toBe(RING_CARD_BG);
    let s = state;
    let tt = t;
    // …round to the north mouth and out of it, right stalk lit, as the card says.
    for (const phi of [110, 150, 175]) {
      tt += 0.5;
      const p = ring(phi);
      s = step(s, tt, p.x, p.y, 15, { edgeId: RING_EDGE, indicator: "right" });
    }
    for (const y of [26, 36]) {
      tt += 0.5;
      s = step(s, tt, LANE_X, y, 20, { edgeId: "rbm-e-arm-n", indicator: "right" });
    }
    expect(s.objectives[1]?.status, "the exit the card ordered is the exit that counts").toBe(
      "done",
    );
  });
});
