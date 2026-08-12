import { describe, expect, it } from "vitest";
import {
  driveAxisFromPadY,
  ReverseAssist,
  REVERSE_ASSIST_HOLD_S,
  REVERSE_ASSIST_LIFT_S,
  REVERSE_ASSIST_PEDAL_ON,
  TOUCH_DRIVE_ABSOLUTE_RANGE_PX,
  TOUCH_DRIVE_NEUTRAL_HALF_PX,
} from "..";

/**
 * =============================================================================
 * THE GAS PAD IS ABSOLUTE — founder ruling 2026-08-11, „up is forward, middle
 * is stop, down is backwards", and the reverse behaviour it lands next to.
 *
 * WHAT WAS MEASURED BEFORE THE RULING (doc 91 §T4, WebKit, iPhone 16
 * landscape): the pad was a RELATIVE drag axis, so 3 taps and 3 × 1500 ms
 * MOTIONLESS holds each produced EXACTLY ZERO — `translateY(0px)`, neutral
 * border, 0.00 km/h — with the sim clock running, i.e. nothing paused and
 * nothing broken. A student who plants a thumb and waits got nothing, which is
 * a large part of „the forward GAS and Backwards is not working most of the
 * times". The pad answered exactly as designed and the design was the defect.
 *
 * §1 and §2 below are that ruling, stated as arithmetic. §3 is the part that
 * was NOT ordered and must not be changed silently: what an absolute pad does
 * to ReverseAssist's two laws.
 * =============================================================================
 */

/** The pad's centre in client coords — an arbitrary but concrete box. */
const CENTRE = 300;
/** Where a thumb sits when it is „just below the middle": inside the lower
 *  band, but nowhere near the bottom of the pad. */
const JUST_BELOW = CENTRE + TOUCH_DRIVE_NEUTRAL_HALF_PX + 8;
const JUST_ABOVE = CENTRE - TOUCH_DRIVE_NEUTRAL_HALF_PX - 8;

describe("§1 THE RULING — where the thumb IS, is the axis", () => {
  it("a MOTIONLESS press above centre accelerates (this returned 0 before)", () => {
    // No drag: one sample, one position. That is the whole ruling.
    expect(driveAxisFromPadY(JUST_ABOVE, CENTRE)).toBeGreaterThan(0);
  });

  it("a MOTIONLESS press below centre brakes / reverses", () => {
    expect(driveAxisFromPadY(JUST_BELOW, CENTRE)).toBeLessThan(0);
  });

  it("„middle is stop“ is a 44 px target, not a knife edge", () => {
    // The neutral band is the touch floor this project enforces everywhere
    // else, because a thumb has to be able to find „stop" on purpose.
    expect(TOUCH_DRIVE_NEUTRAL_HALF_PX * 2).toBe(44);
    expect(driveAxisFromPadY(CENTRE, CENTRE)).toBe(0);
    expect(driveAxisFromPadY(CENTRE - TOUCH_DRIVE_NEUTRAL_HALF_PX, CENTRE)).toBe(0);
    expect(driveAxisFromPadY(CENTRE + TOUCH_DRIVE_NEUTRAL_HALF_PX, CENTRE)).toBe(0);
  });

  it("full travel is reached at ±TOUCH_DRIVE_ABSOLUTE_RANGE_PX from the centre", () => {
    expect(driveAxisFromPadY(CENTRE - TOUCH_DRIVE_ABSOLUTE_RANGE_PX, CENTRE)).toBe(1);
    expect(driveAxisFromPadY(CENTRE + TOUCH_DRIVE_ABSOLUTE_RANGE_PX, CENTRE)).toBe(-1);
  });

  it("clamps beyond the pad instead of running away", () => {
    expect(driveAxisFromPadY(CENTRE - 900, CENTRE)).toBe(1);
    expect(driveAxisFromPadY(CENTRE + 900, CENTRE)).toBe(-1);
  });

  it("screen y grows downward, so UP is forward — the sign the ruling names", () => {
    const up = driveAxisFromPadY(CENTRE - 50, CENTRE);
    const down = driveAxisFromPadY(CENTRE + 50, CENTRE);
    expect(up).toBeGreaterThan(0);
    expect(down).toBeLessThan(0);
    expect(up).toBeCloseTo(-down, 10);
  });

  it("follows the pad's own centre, so rotation / URL bar / fullscreen cannot stale it", () => {
    // Same thumb position, a pad that has moved 120 px down the screen: the
    // axis must be read against the NEW centre, not the old one.
    expect(driveAxisFromPadY(CENTRE, CENTRE + 120)).toBeGreaterThan(0);
  });
});

describe("§2 WHAT IT COSTS — the forgiveness that is gone, stated so it can be overturned", () => {
  it("the landing point now MEANS something (the relative pad's forgiveness is gone)", () => {
    // The old comment defended this property: „the gesture starts wherever the
    // thumb landed, so the student never has to find a 26 px dot". Under the
    // relative pad BOTH of these landings produced 0 until the thumb moved.
    // Now they differ, and that difference is the ruling — and the cost.
    const highLanding = driveAxisFromPadY(JUST_ABOVE, CENTRE);
    const lowLanding = driveAxisFromPadY(JUST_BELOW, CENTRE);
    expect(highLanding).not.toBe(lowLanding);
    expect(Math.sign(highLanding)).toBe(1);
    expect(Math.sign(lowLanding)).toBe(-1);
  });

  it("the 44 px stop band is what buys most of it back", () => {
    // An imprecise first contact anywhere in the middle still commands nothing,
    // which is the mitigation for the property lost above.
    for (let dy = -TOUCH_DRIVE_NEUTRAL_HALF_PX; dy <= TOUCH_DRIVE_NEUTRAL_HALF_PX; dy += 2) {
      expect(driveAxisFromPadY(CENTRE + dy, CENTRE)).toBe(0);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * §3 THE INTERACTION WITH REVERSE — NOT ordered, NOT changed, and pinned here
 * because an absolute pad changes WHEN a brake press begins.
 *
 * ReverseAssist's LAW 1: a brake press may only ARM a direction toggle if the
 * car is ALREADY stationary AND the pedal was fully lifted for
 * REVERSE_ASSIST_LIFT_S first. LAW 2 (scoped to the manual routes since
 * 2026-08-11) keeps a held brake from becoming throttle on the [ / ], sheet and
 * cockpit routes.
 *
 * The absolute pad does not touch either law. What it changes is the INPUT
 * those laws see: under the relative pad a thumb landing on the glass produced
 * 0, so there was NO brake rising edge until the thumb travelled 6 px. Under
 * the absolute pad, a thumb landing below the neutral band is a brake rising
 * edge immediately. Both consequences are asserted below.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe("§3 REVERSE — the laws are undisturbed, and the pad reaches them sooner", () => {
  const DT = 1 / 60;
  /** The functional brake value a motionless thumb just below the band makes. */
  const brakeFromThumb = (yBelowCentre: number): number =>
    Math.max(0, -driveAxisFromPadY(CENTRE + yBelowCentre, CENTRE));

  it("LAW 1 STILL HOLDS: a thumb held from a ROLL through the stop never shifts", () => {
    // The Б2 hold — the single most correct thing a learner does. This is the
    // input that once drove the car backwards into traffic.
    const ra = new ReverseAssist();
    const brake = brakeFromThumb(40);
    expect(brake).toBeGreaterThan(REVERSE_ASSIST_PEDAL_ON);

    let cmd: string | null = null;
    // rolling in, thumb already down
    for (let t = 0; t < 1; t += DT) {
      cmd = ra.update({ speedKmh: 20, selector: "D", brakePedal: brake, throttlePedal: 0, dtSec: DT }) ?? cmd;
    }
    // now stopped, SAME thumb, never lifted, held a long time
    for (let t = 0; t < 5; t += DT) {
      cmd = ra.update({ speedKmh: 0, selector: "D", brakePedal: brake, throttlePedal: 0, dtSec: DT }) ?? cmd;
    }
    expect(cmd, "a pedal held from motion through the stop must never select R").toBeNull();
  });

  it("the deliberate act still works: stop, LIFT, press → R (the founder's „down is backwards“)", () => {
    const ra = new ReverseAssist();
    const brake = brakeFromThumb(40);
    // stationary, thumb off the glass for longer than the lift window
    for (let t = 0; t < REVERSE_ASSIST_LIFT_S + 0.2; t += DT) {
      ra.update({ speedKmh: 0, selector: "D", brakePedal: 0, throttlePedal: 0, dtSec: DT });
    }
    // a MOTIONLESS press below the middle — under the relative pad this was 0
    let cmd: string | null = null;
    for (let t = 0; t < REVERSE_ASSIST_HOLD_S + 0.1 && cmd === null; t += DT) {
      cmd = ra.update({ speedKmh: 0, selector: "D", brakePedal: brake, throttlePedal: 0, dtSec: DT });
    }
    expect(cmd).toBe("shiftToR");
  });

  it("THE MITIGATION, MEASURED: the reverse-arming dead zone is 32 px, not the 22 px band", () => {
    // This assertion was written the other way round first — „a thumb just past
    // the band now arms reverse" — and it FAILED, which is the useful result.
    //
    // Three things compound and the sum is not obvious from any one of them:
    // the neutral half-band (22 px), the expo curve (magnitude is raised to
    // TOUCH_STEER_EXPO = 1.5 after the dead zone is re-normalised), and
    // REVERSE_ASSIST_PEDAL_ON = 0.1, below which the assist does not consider
    // the pedal down at all. A thumb 2 px past the visual band makes a brake of
    // 0.0097 — a hundredth of a pedal, and a tenth of what arming needs.
    //
    // So the pad is materially safer than „below the middle is reverse" sounds:
    // an unintended reverse needs the thumb a further 10 px down, not a hair.
    const justPast = brakeFromThumb(TOUCH_DRIVE_NEUTRAL_HALF_PX + 2);
    expect(justPast).toBeGreaterThan(0); // it IS braking, gently
    expect(justPast).toBeLessThan(REVERSE_ASSIST_PEDAL_ON); // …but not to the assist

    const armsAt = (() => {
      for (let dy = TOUCH_DRIVE_NEUTRAL_HALF_PX; dy <= TOUCH_DRIVE_ABSOLUTE_RANGE_PX; dy++) {
        if (brakeFromThumb(dy) > REVERSE_ASSIST_PEDAL_ON) return dy;
      }
      return -1;
    })();
    expect(armsAt).toBe(32);

    // And below that threshold, a motionless thumb held for seconds selects
    // nothing — the case the first draft of this test got wrong.
    const ra = new ReverseAssist();
    for (let t = 0; t < REVERSE_ASSIST_LIFT_S + 0.2; t += DT) {
      ra.update({ speedKmh: 0, selector: "D", brakePedal: 0, throttlePedal: 0, dtSec: DT });
    }
    let cmd: string | null = null;
    for (let t = 0; t < 3; t += DT) {
      cmd =
        ra.update({ speedKmh: 0, selector: "D", brakePedal: justPast, throttlePedal: 0, dtSec: DT }) ??
        cmd;
    }
    expect(cmd).toBeNull();
  });

  it("past 32 px it DOES arm on a motionless thumb — the change, stated so it can be overturned", () => {
    // Under the RELATIVE pad this same motionless thumb produced 0: no brake,
    // no rising edge, no arming, so reaching R always took a deliberate drag.
    // Under the absolute pad a press that lands past the threshold is itself
    // the deliberate act. This is the founder's own specification („down is
    // backwards"), and LAW 1 still requires the stop-and-lift first — but the
    // cost of an unintended reverse did fall, and this pins where to.
    const past = brakeFromThumb(34);
    expect(past).toBeGreaterThan(REVERSE_ASSIST_PEDAL_ON);

    const ra = new ReverseAssist();
    for (let t = 0; t < REVERSE_ASSIST_LIFT_S + 0.2; t += DT) {
      ra.update({ speedKmh: 0, selector: "D", brakePedal: 0, throttlePedal: 0, dtSec: DT });
    }
    let cmd: string | null = null;
    for (let t = 0; t < REVERSE_ASSIST_HOLD_S + 0.2 && cmd === null; t += DT) {
      cmd = ra.update({ speedKmh: 0, selector: "D", brakePedal: past, throttlePedal: 0, dtSec: DT });
    }
    expect(cmd).toBe("shiftToR");
  });

  it("a thumb resting INSIDE the stop band arms nothing at all", () => {
    // The mitigation that is already in place: „middle is stop" is a 44 px
    // target, and a thumb parked there is not a brake press.
    const parked = brakeFromThumb(TOUCH_DRIVE_NEUTRAL_HALF_PX - 2);
    expect(parked).toBe(0);

    const ra = new ReverseAssist();
    for (let t = 0; t < REVERSE_ASSIST_LIFT_S + 0.2; t += DT) {
      ra.update({ speedKmh: 0, selector: "D", brakePedal: 0, throttlePedal: 0, dtSec: DT });
    }
    let cmd: string | null = null;
    for (let t = 0; t < 3; t += DT) {
      cmd = ra.update({ speedKmh: 0, selector: "D", brakePedal: parked, throttlePedal: 0, dtSec: DT }) ?? cmd;
    }
    expect(cmd).toBeNull();
  });
});
