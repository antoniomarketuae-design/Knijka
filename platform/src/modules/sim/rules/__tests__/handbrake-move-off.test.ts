/**
 * =============================================================================
 * THE LEVER THAT COST NOTHING — sc-vp-handbrake:1f2f7463 (critical).
 * =============================================================================
 *
 * THE FRAME. `.audit-frames/sweep161/sc-vp-handbrake/pc-wrong/08-debrief.png`,
 * on the lesson TITLED „Потегляне с вдигната ръчна": «Опасни 0 0 · Основни
 * 0 0 · Второстепенни 0 0 · Общо 0», НЕИЗДЪРЖАН only because a route objective
 * was unmet, and an instructor debrief that praises «чисто каране без нито едно
 * нарушение». The lesson's own named failure was free.
 *
 * WHY IT WAS FREE, AND WHY THE SPAWN FIX DID NOT END IT. `HANDBRAKE_LEFT_ON`
 * fires on `tick.handbrakeOn && moving`, and `moving` is `speed >
 * movingSpeedKmh` = 5 км/ч. In the live car `PARKING_BRAKE_FORCE_N` (13 000 N
 * across the rear axle) beats the 4 800 N peak engine force outright — eight
 * seconds of floored throttle reached 0.32 км/ч on the drive rig — so the lever
 * does not make the car DRAG, it makes the car STOP. Wave 2's
 * `initialParkingBrakeOnFor` then handed this drill its car with the lever
 * PULLED, which is what makes the briefing's lamp sentence true; it also means
 * the student who ignores step 2 sits at a fifteenth of the detector's
 * threshold for the whole lesson. `spawnParkingBrakeSeam.test.tsx` says so in
 * its own third case and leaves this row open on purpose: „this is an
 * explanation, not a conviction."
 *
 * WHAT IS MEASURED HERE. The conviction. The discriminator is the ACCELERATOR
 * (`SimTick.throttlePedal`), because speed alone cannot separate a student
 * asking the car to move from one who has not started yet — and both
 * directions are asserted, because an arm that convicted every stationary car
 * with the lever up would pass a test that only drove the guilty case.
 * =============================================================================
 */

import { describe, expect, it } from "vitest";
import { drive, tick } from "./fixtures";
import { HANDBRAKE_ACT_MOVE_OFF_ATTEMPT, VIOLATIONS } from "../catalog";
import { DEFAULT_RULE_CONFIG, type RuleEvent, type SimTick } from "../types";
import { compileScenario, SCENARIO_TEMPLATES } from "@/modules/sim/lessons/scenario";

/** The gate this drill opts into; everything else in the product stays OFF. */
const ARMED = { handbrakeMoveOffEnabled: true };

/** Frames every 100 ms from 0 to `untilSec`, all with the same cockpit. */
function held(untilSec: number, over: Partial<SimTick>): SimTick[] {
  const out: SimTick[] = [];
  for (let i = 0; i * 0.1 <= untilSec + 1e-9; i++) out.push(tick(+(i * 0.1).toFixed(2), over));
  return out;
}

function violations(events: RuleEvent[]) {
  return events.filter((e): e is Extract<RuleEvent, { kind: "violation" }> => e.kind === "violation");
}

/**
 * The car the audit photographed: engine running, a gear engaged, lever up,
 * pedal floored, going nowhere. Engine and gear are part of the fixture rather
 * than defaults because they are what makes the LEVER the blocker — see the
 * blocker-order block below.
 */
const PRESSING_AGAINST_THE_LEVER: Partial<SimTick> = {
  handbrakeOn: true,
  throttlePedal: 1,
  speedKmh: 0,
  engineOn: true,
  gear: 1,
};

describe("HANDBRAKE_LEFT_ON — the standstill arm", () => {
  it("ships OFF: the product at large books nothing for a pedal against the lever", () => {
    // The A12 reason for the gate: 130 exam rungs and 31 templates hand over a
    // COLD car (engine off, selector P, parking brake on), and a student who
    // presses the pedal there is being walked through the start-up procedure,
    // not committing an offence. DEFAULT_RULE_CONFIG is the assertion, not a
    // literal `false` — a default flipped in types.ts must turn this red.
    expect(DEFAULT_RULE_CONFIG.handbrakeMoveOffEnabled).toBe(false);
    const { events } = drive(held(8, PRESSING_AGAINST_THE_LEVER));
    expect(violations(events)).toEqual([]);
  });

  it("armed: the pedal held against the engaged lever is convicted", () => {
    const { events } = drive(held(4, PRESSING_AGAINST_THE_LEVER), ARMED);
    const v = violations(events);
    expect(v.map((e) => e.code)).toEqual(["HANDBRAKE_LEFT_ON"]);
    // Teach first, then grade: the cockpit says «Ръчната спирачка е вдигната»
    // at STUCK_START_HINT_S = 1.2 s, and the bill lands more than a second
    // later — so nothing is charged to a student who had not been told.
    expect(v[0]!.t).toBeGreaterThanOrEqual(DEFAULT_RULE_CONFIG.handbrakeMoveOffSustainSec);
    expect(DEFAULT_RULE_CONFIG.handbrakeMoveOffSustainSec).toBeGreaterThan(1.2);
    // It reaches the официален изпитен лист at the price the catalogue sets.
    expect(v[0]!.severityClass).toBe("vtorostepenna");
    expect(v[0]!.points).toBe(VIOLATIONS.HANDBRAKE_LEFT_ON.points);
  });

  it("…and the card describes THIS act, not a drag the windscreen never showed", () => {
    const v = violations(drive(held(4, PRESSING_AGAINST_THE_LEVER), ARMED).events);
    const card = v[0]!;
    expect(card.detail).toBe(HANDBRAKE_ACT_MOVE_OFF_ATTEMPT);
    // The pooled row opens «Потегли с вдигната ръчна спирачка. Колата се влачи»
    // — two claims about a car that never moved. THEO-4 forbids a bare verdict;
    // a verdict that narrates the wrong picture is that failure with a costume.
    expect(card.explanationBg).not.toBe(VIOLATIONS.HANDBRAKE_LEFT_ON.explanationBg);
    expect(card.explanationBg).not.toContain("Колата се влачи");
    // It says WHY — the mechanism and the cost, not just the verdict…
    expect(card.explanationBg).toContain("прегряват");
    // …and it names the check the briefing calls the sole instrument.
    expect(card.explanationBg).toContain("лампа");
    // ADR-002: the citation is the catalogue's own, not a new one.
    expect(card.lawRef).toBe(VIOLATIONS.HANDBRAKE_LEFT_ON.lawRef);
  });

  it("a student who has not started yet is never convicted — no pedal, no act", () => {
    // The whole reason the discriminator is the accelerator. This car sits with
    // the lever up for eight seconds, which is the ordinary opening of every
    // cockpit lesson: reading the briefing, finding the controls.
    const { events } = drive(held(8, { handbrakeOn: true, throttlePedal: 0, speedKmh: 0 }), ARMED);
    expect(violations(events)).toEqual([]);
  });

  it("a released lever with the pedal floored is never convicted", () => {
    const { events } = drive(held(8, { handbrakeOn: false, throttlePedal: 1, speedKmh: 0 }), ARMED);
    expect(violations(events)).toEqual([]);
  });

  // ── THE BLOCKER ORDER ──────────────────────────────────────────────────────
  // `engine/stuckStart.ts stuckStartReason` clears the blockers in the order a
  // driver has to: engine off → P → N → parking brake, and the cockpit says
  // aloud which one it is. Two of those cars have the lever up too, and neither
  // is being held by it — so a lever bill there charges a fault the student was
  // never told about (doc 64 THEO-4: teach first, then grade) and hands him a
  // card whose «затова колата не тръгва» is simply false.

  it("the COLD hand-over is never billed for the lever — the cockpit says «запали двигателя»", () => {
    // `vehicleStart: "cold"` — DrivelineState("cold") is engine OFF, selector
    // P, parking brake ON, and it is what THIS drill hands over at L4. A
    // student pressing the pedal there is hunting for the ignition.
    const cold = { handbrakeOn: true, throttlePedal: 1, speedKmh: 0, engineOn: false, gear: 0 };
    expect(violations(drive(held(8, cold), ARMED).events)).toEqual([]);
    // …and the engine alone settles it: even shifted into D before starting up,
    // the blocker `stuckStartReason` names is still the engine.
    const coldInGear = { ...cold, gear: 1 };
    expect(violations(drive(held(8, coldInGear), ARMED).events)).toEqual([]);
  });

  it("a running car in P or N is held by the SELECTOR, and is not billed for the lever", () => {
    // contractGear (scene/vehicleSample.ts) maps both P and N to 0. The manual
    // tier's „ready" car spawns in N with the engine running, so this is not a
    // hypothetical frame.
    const parked = { handbrakeOn: true, throttlePedal: 1, speedKmh: 0, engineOn: true, gear: 0 };
    expect(violations(drive(held(8, parked), ARMED).events)).toEqual([]);
  });

  it("a rig with no ignition channel stays innocent — absence acquits here too", () => {
    const noChannel = held(8, { handbrakeOn: true, throttlePedal: 1, speedKmh: 0, gear: 1 });
    expect(noChannel[0]!.engineOn).toBeUndefined();
    expect(violations(drive(noChannel, ARMED).events)).toEqual([]);
  });

  it("a rig with no pedal channel stays innocent — absence acquits", () => {
    // Every recorded trace, every replay and every hand-built fixture omits the
    // field (`traces/recorder.ts` builds its VehicleSample without one), so the
    // shipped shadows and the §5 trace gate cannot be moved by this arm.
    const noChannel = held(8, { handbrakeOn: true, speedKmh: 0 });
    expect(noChannel[0]!.throttlePedal).toBeUndefined();
    expect(violations(drive(noChannel, ARMED).events)).toEqual([]);
  });

  it("releasing the lever inside the teach window costs nothing", () => {
    const frames = [
      ...held(1.5, PRESSING_AGAINST_THE_LEVER),
      ...held(4, { handbrakeOn: false, throttlePedal: 1, speedKmh: 0 }).map((f) => ({
        ...f,
        t: f.t + 1.6,
      })),
    ];
    expect(violations(drive(frames, ARMED).events)).toEqual([]);
  });

  it("the two arms never double-bill: a moving car books the pooled row alone", () => {
    // `moving` / `!moving` partition the lever's two acts. Yanking the lever at
    // speed is the arm that always shipped, and it must keep its own card.
    const { events } = drive(held(5, { handbrakeOn: true, throttlePedal: 1, speedKmh: 20 }), ARMED);
    const v = violations(events);
    expect(v.map((e) => e.code)).toEqual(["HANDBRAKE_LEFT_ON"]);
    expect(v[0]!.detail).toBeUndefined();
    expect(v[0]!.explanationBg).toBe(VIOLATIONS.HANDBRAKE_LEFT_ON.explanationBg);
  });

  it("a lever never released re-grades once and then stops — two bills, not fifteen", () => {
    // The standing-duty discipline: the first bill is spent by the teach-first
    // free mini-lesson, the second is the charge Наредба № 38 prices the
    // offence at, and a third would only add a row (the «Грешки (48)» shape).
    const v = violations(drive(held(40, PRESSING_AGAINST_THE_LEVER), ARMED).events);
    expect(v).toHaveLength(2);
    expect(v[0]!.regrade).toBeUndefined();
    expect(v[1]!.regrade).toBe(true);
  });
});

describe("the wire — the shipped drill actually arms it", () => {
  it("sc-vp-handbrake carries the flag onto the compiled lesson at every level", () => {
    // `lessons/engine.ts` builds the session's engine with
    // `createRuleEngine({ ...lesson.ruleConfig })`, so this IS the live
    // student's grader. A gate nothing sets is a predicate nothing reads.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-vp-handbrake");
    expect(spec, "sc-vp-handbrake is a shipped template").toBeDefined();
    for (const level of [1, 2, 3, 4, 5] as const) {
      const lesson = compileScenario(spec!, level);
      expect(lesson.ruleConfig?.handbrakeMoveOffEnabled, `L${level}`).toBe(true);
    }
  });

  it("…and no other shipped template arms it by accident", () => {
    const armed = SCENARIO_TEMPLATES.filter(
      (s) => compileScenario(s, 1).ruleConfig?.handbrakeMoveOffEnabled === true,
    ).map((s) => s.id);
    expect(armed).toEqual(["sc-vp-handbrake"]);
  });
});
