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

// ---------------------------------------------------------------------------
// THE DEFECTS THE PIN'S OWN SPEC HAD FILED AGAINST ITS FOLD — AND THE ONE
// PRESCRIPTION THAT MUST NOT BE FILLED
// ---------------------------------------------------------------------------
//
// `finish.ts` specifies the pin's evidence model and `lessons/engine.ts` folds
// it, and on 2026-08-16/17 the spec side wrote three defects in the fold into
// its own comment block and closed none of them, each time because the fold is
// „another lane's file". This is that lane. Two of the three are repaired here
// (P1, P2) and each gate below was watched RED against the shipped fold before
// the fix — the exact mutation is named in the block above it.
//
// THE THIRD IS REFUTED, NOT REPAIRED, and the last two tests exist to keep it
// refuted. `finish.ts:532-545` asks for the lawful-wait freeze to be lifted for
// a pinned car; the obvious spelling — exempt a car whose
// `|laneOffsetM| > laneKeepMaxOffsetM` — closes the drive of a car sitting on
// the ОСЕВА, because `runtime/locator.ts` clamps the lateral distance before
// computing the offset (locator.ts:278, :297) so the largest magnitude it can
// emit is LANE_WIDTH_M / 2 = 4.0625 against a bar of 3.25. That is the straddle
// test, not carriageway membership, and `templates-parking.ts:626-632` records
// that `lot-spawn-approach` reads laneOffsetM 4.06 with „Thirty-one shipped
// scenarios" starting there. The engine.ts block carries the full derivation.
//
// The frames that made the round worth spending, all the same picture: a car
// pressed into a building with the clock running and nothing said.
// `.audit-frames/w10-4/frames/sc-signal-dead__mobile-right/` — collision card
// at 04-t106s.png, «0 км/ч · D» against a wall at 04-t144s.png and at the last
// frame: ~70 s (sc-signal-dead:4ef8baf7). `.audit-frames/w10-2/frames/
// sc-park-gap-short__mobile-right/` — the same from 04-t130s.png through
// 04-t177s.png (3b981a51). NEITHER IS THIS GATE: both run.logs record the car
// moving away after the impact (7 км/ч at 04-t117s, 10 км/ч at t109s) past
// CRASH_PIN_RADIUS_M = 6 m, so the pin was already dropped and no freeze was
// postponing anything. Those rows stay OPEN against `stepOffNetwork`'s 75 s bar
// and the missing in-flight „you have left the road" state.

/**
 * A car on the centreline of a two-way street reads exactly this — it is
 * `LANE_WIDTH_M / 2 = 3.25 × PERCEPTUAL_ROAD_SCALE / 2`, the largest magnitude
 * `runtime/locator.ts` can emit, and the pose 31 shipped scenarios spawn at
 * (`lot-spawn-approach`, templates-parking.ts:626-632). It is ALSO what a car
 * shoved into a building reads, which is the whole point of the last test.
 */
const CENTRELINE_OFFSET_M = 4.0625;

/**
 * A frame with a controlled line inside YIELD_STOP_LINE_REACH_M ahead — which
 * is all `yieldReasonAt` needs to publish `giveWayLine` and latch B15's freeze.
 * `laneOffsetM` is the only thing that varies between the two freeze tests.
 */
function atLine(
  t: number,
  y: number,
  speedKmh: number,
  laneOffsetM: number,
  events: SimTick["events"] = [],
): SimTick {
  return makeTick({
    t,
    speedKmh,
    position: { x: 0, y },
    laneOffsetM,
    nextStopLineM: 10,
    nextStopLineControl: "giveWay",
    events,
  });
}

describe("the crash pin's fold — the defects its own spec had filed", () => {
  it("P2 — a student REVERSING out of what he hit never banks the rescue's clock", () => {
    // MUTATION: put `tick.speedKmh > FINISH_STANDSTILL_KMH` back in place of
    // the magnitude test and this goes red at the second-to-last assertion —
    // −20 > 1 is false, the reverse frame reads as a STANDSTILL, the dwell
    // banked at t+0.5 is never dropped and the drive is closed at t+10.5 on a
    // student who was in the middle of the one manoeuvre this gate promises
    // never to punish.
    const { state: s0, t } = underWay();
    let s = collide(s0, t, 40);
    let tt = t + 0.5;
    for (; tt <= t + 9; tt += 0.5) s = applyTick(s, frame(tt, 40, 0)).state;
    expect(s.phase, "nine seconds is one short of the bar").toBe("driving");
    expect(s.crashPin?.stillSinceSec ?? null, "…and the clock is running").not.toBeNull();

    // He backs off half a metre at 20 км/ч. Reverse reads NEGATIVE.
    s = applyTick(s, frame(tt, 39.5, -20)).state;
    tt += 0.5;
    expect(s.crashPin, "half a metre is the radius' business, not the clock's").toBeDefined();
    expect(
      s.crashPin?.stillSinceSec ?? null,
      "a reverse frame is MOVEMENT — the dwell restarts from here",
    ).toBeNull();

    // Settling again restarts the ten seconds, so nothing may end inside the
    // window the unsigned test would have closed him in.
    for (; tt <= t + 19; tt += 0.5) s = applyTick(s, frame(tt, 39.5, 0)).state;
    expect(s.phase, "the drive is still his").toBe("driving");
  });

  it("P1 — a SECOND body striking the pinned car re-arms the pose, not the clock", () => {
    // MUTATION: put `stillSinceSec: null` back into the re-arm and this goes
    // red at the last assertion — the nine seconds already served are thrown
    // away and the rescue slides another ten seconds down the road for a car
    // that has not moved at all. `rules/engine.ts` keys contact episodes per
    // body, so a different `withWhat` always bills: that is the instrument in
    // the middle of this test, and it is asserted rather than assumed.
    const { state: s0, t } = underWay();
    let s = collide(s0, t, 40); // vehicle
    let tt = t + 0.5;
    for (; tt <= t + 9; tt += 0.5) s = applyTick(s, frame(tt, 40, 0)).state;
    expect(s.phase).toBe("driving");

    s = applyTick(s, frame(tt, 40, 0, [{ kind: "collision", withWhat: "staticObject" }])).state;
    tt += 0.5;
    expect(
      s.events.filter((e) => e.kind === "violation" && e.code === "COLLISION").length,
      "the instrument: a body never touched before always bills",
    ).toBe(2);

    for (; tt <= t + 12; tt += 0.5) {
      s = applyTick(s, frame(tt, 40, 0)).state;
      if (s.phase !== "driving") break;
    }
    expect(s.phase, "eleven motionless seconds is eleven motionless seconds").toBe("completed");
  });

  it("P1 — …but a re-arm more than CRASH_PIN_RADIUS_M away spends the clock it inherited", () => {
    // The hole the inheritance opens, closed with the branch below's own bar.
    // Frames are 2 Hz here; the harness measured a WORST TICK OF 3562 ms on the
    // drive this pin is filed from, and inside one of those a car crosses metres
    // while both sampled endpoints read 0 км/ч. Without this the nine seconds
    // banked against a bumper would be spent against a wall 8 m away.
    // MUTATION: drop `|| rearmMovedM > CRASH_PIN_RADIUS_M` from the re-arm and
    // this goes red — «the dwell was banked somewhere else — it cannot be spent
    // here: expected 3.5 to be null» — the inherited clock survives the jump and
    // the drive is closed one second after an impact it never sat at.
    const { state: s0, t } = underWay();
    let s = collide(s0, t, 40);
    let tt = t + 0.5;
    for (; tt <= t + 9; tt += 0.5) s = applyTick(s, frame(tt, 40, 0)).state;
    expect(s.crashPin?.stillSinceSec ?? null, "nine seconds banked at the bumper").not.toBeNull();

    // One long frame later he is 8 m up the road and hits something else. Both
    // endpoints read 0 км/ч, so speed says nothing; the pose says everything.
    const far = 40 + CRASH_PIN_RADIUS_M + 2;
    s = applyTick(s, frame(tt, far, 0, [{ kind: "collision", withWhat: "staticObject" }])).state;
    tt += 0.5;
    expect(s.crashPin?.y, "the pin re-arms at the NEW pose").toBe(far);
    expect(
      s.crashPin?.stillSinceSec ?? null,
      "the dwell was banked somewhere else — it cannot be spent here",
    ).toBeNull();

    for (; tt <= t + 14; tt += 0.5) {
      s = applyTick(s, frame(tt, far, 0)).state;
      if (s.phase !== "driving") break;
    }
    expect(s.phase, "the ten seconds start again at the new wall").toBe("driving");
  });

  it("the lawful-wait freeze stays UNCONDITIONAL — a shunt at the line keeps driving", () => {
    // A rear-ender into the back of a queue at a red is a car that CAN move the
    // moment the queue does; closing that drive at ten seconds takes away the
    // very thing the collision card promises — «В симулатора продължаваме, за да
    // се учиш» (rules/catalog.ts COLLISION). `finish.ts:532-545` prescribes
    // exempting the pin from this freeze; this is the bill that prescription
    // pays, and it is why the exemption is not landed.
    // MUTATION: this is the BLANKET removal, i.e. delete
    // `yieldWait?.holding === true ||` from `dwellUnspendable` — the drive is
    // then closed at t+10.5 on a student doing the right thing.
    const { state: s0, t } = underWay();
    let s = applyTick(s0, atLine(t, 40, 18, 0, [{ kind: "collision", withWhat: "vehicle" }])).state;
    expect(s.crashPin, "the impact must arm the pin").toBeDefined();
    let tt = t + 0.5;
    for (; tt <= t + CRASH_PIN_STUCK_S * 2; tt += 0.5) {
      s = applyTick(s, atLine(tt, 40, 0, 0)).state;
    }
    // The instrument: the freeze really is latched, so this test measures the
    // freeze and not a hold that never happened.
    expect(s.yieldWait?.holding, "he is lawfully stopped at the line").toBe(true);
    expect(s.yieldWait?.reason, "…and the freeze's own reason is live").toBe("giveWayLine");
    expect(s.phase, "twice the bar, and the drive is still his").toBe("driving");
  });

  it("…and it keeps it for a car ON THE CENTRELINE, which reads the same offset as a wall", () => {
    // THE GUARD AGAINST THE PRESCRIPTION. `runtime/locator.ts` CLAMPS the
    // lateral distance (locator.ts:278, :297), so the largest magnitude it can
    // emit is LANE_WIDTH_M / 2 = 4.0625 — which is what a car pressed into a
    // building reads AND what a car sitting on the осева reads. Against
    // `laneKeepMaxOffsetM` = 1.3 × 2.5 = 3.25 the truthy band is 0.8125 m wide
    // and it contains the middle of the road; `rules/engine.ts:1748` calls the
    // identical expression `offCentre` and grades POOR_LANE_KEEPING off it.
    // `templates-parking.ts:626-632`: `lot-spawn-approach` reads 4.06 there and
    // „Thirty-one shipped scenarios do that".
    // MUTATION: add `&& Math.abs(tick.laneOffsetM) <= prev.rules.config
    // .laneKeepMaxOffsetM` to the freeze — the prescription's own spelling — and
    // this goes red: the drive is closed at t+10.5 on a student who is lawfully
    // stopped at a give-way line, on 31 shipped spawns' worth of geometry.
    const { state: s0, t } = underWay();
    let s = applyTick(
      s0,
      atLine(t, 40, 18, CENTRELINE_OFFSET_M, [{ kind: "collision", withWhat: "vehicle" }]),
    ).state;
    expect(s.crashPin, "the impact must arm the pin").toBeDefined();
    let tt = t + 0.5;
    for (; tt <= t + CRASH_PIN_STUCK_S * 2; tt += 0.5) {
      s = applyTick(s, atLine(tt, 40, 0, CENTRELINE_OFFSET_M)).state;
    }
    expect(s.yieldWait?.holding, "he is lawfully stopped at the line").toBe(true);
    expect(
      s.phase,
      "a lane-keeping number may not decide whether a drive is closed under him",
    ).toBe("driving");
  });
});
