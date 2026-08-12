/**
 * StuckStartWatch — the OTHER silence: nothing guarded the pedal, the car
 * simply cannot move.
 *
 * Measured on /dev/drive-rig (`sc-junction-stop@L4`, real shell, real keyboard,
 * 2026-08-11): phase "driving", engine off, selector P, parking brake on, ten
 * seconds of floored throttle → 0.00 km/h, zero toasts, zero events. The QW10
 * explanation exists and is unreachable there, because it is keyed on the
 * pre-drive phase and no compiled scenario rung has one.
 *
 * The two opposite failure modes are both pinned here: it must NOT speak on a
 * car that can move (nor on the manual tier's clutch exercise, nor over LAW 2's
 * own sentence), and it MUST speak — and keep speaking — when a student is
 * standing on a pedal that cannot do anything.
 */

import { describe, expect, it } from "vitest";
import type { DrivelinePhysicsInput } from "@/modules/sim/vehicle";
import {
  STUCK_START_HINT_S,
  STUCK_START_PEDAL_ON,
  STUCK_START_REPEAT_S,
  STUCK_START_SETTLE_S,
  StuckStartWatch,
  stuckStartReason,
  type StuckStartReason,
} from "../stuckStart";
import {
  REVERSE_ASSIST_LIFT_S,
  REVERSE_ASSIST_STANDSTILL_KMH,
  ReversePedalMapper,
  THROTTLE_ATTACK_S,
  stepPedal,
} from "..";

const DT = 1 / 60; // the shipped render cadence

const READY: DrivelinePhysicsInput = {
  engineOn: true,
  selector: "D",
  manualGear: 1,
  clutchDown: false,
  parkingBrakeOn: false,
};

/** Run `sec` seconds of frames and collect every reason the watch emitted. */
function run(
  w: StuckStartWatch,
  sec: number,
  frame: {
    throttlePedal?: number;
    brakePedal?: number;
    speedKmh?: number;
    stalled?: boolean;
  } & {
    driveline?: Partial<DrivelinePhysicsInput>;
  } = {},
): StuckStartReason[] {
  const out: StuckStartReason[] = [];
  const steps = Math.round(sec / DT);
  for (let i = 0; i < steps; i++) {
    const r = w.update({
      throttlePedal: frame.throttlePedal ?? 1,
      brakePedal: frame.brakePedal ?? 0,
      speedKmh: frame.speedKmh ?? 0,
      driveline: { ...READY, ...(frame.driveline ?? {}) },
      stalled: frame.stalled ?? false,
      dtSec: DT,
    });
    if (r !== null) out.push(r);
  }
  return out;
}

/** The brake channel's own runner: foot OFF the throttle, ON the brake. */
function brake(
  w: StuckStartWatch,
  sec: number,
  frame: {
    brakePedal?: number;
    speedKmh?: number;
    driveline?: Partial<DrivelinePhysicsInput>;
  } = {},
): StuckStartReason[] {
  return run(w, sec, {
    throttlePedal: 0,
    brakePedal: frame.brakePedal ?? 1,
    ...(frame.speedKmh !== undefined ? { speedKmh: frame.speedKmh } : {}),
    ...(frame.driveline !== undefined ? { driveline: frame.driveline } : {}),
  });
}

/** Lift the brake at a standstill for long enough to ARM the next press. */
function liftBrake(w: StuckStartWatch, driveline: Partial<DrivelinePhysicsInput>): void {
  run(w, REVERSE_ASSIST_LIFT_S + 0.1, { throttlePedal: 0, brakePedal: 0, driveline });
}

describe("stuckStartReason — what is in the way, in fix order", () => {
  it("says nothing about a car that can move", () => {
    expect(stuckStartReason(READY, false)).toBeNull();
    expect(stuckStartReason({ ...READY, selector: "R" }, false)).toBeNull();
    expect(stuckStartReason({ ...READY, selector: "M" }, false)).toBeNull();
  });

  it("names the engine before anything else — the rest is moot without it", () => {
    const cold: DrivelinePhysicsInput = {
      ...READY,
      engineOn: false,
      selector: "P",
      parkingBrakeOn: true,
    };
    expect(stuckStartReason(cold, false)).toBe("engineOff");
    expect(stuckStartReason(cold, true)).toBe("stalled");
  });

  it("then the selector, then the parking brake", () => {
    expect(stuckStartReason({ ...READY, selector: "P", parkingBrakeOn: true }, false)).toBe(
      "parked",
    );
    expect(stuckStartReason({ ...READY, selector: "N", parkingBrakeOn: true }, false)).toBe(
      "neutral",
    );
    expect(stuckStartReason({ ...READY, parkingBrakeOn: true }, false)).toBe("parkingBrake");
  });

  it("NEVER blames the clutch — a held clutch is the manual tier's own drill", () => {
    // In gear, clutch down: hasDriveTraction() is false and the car will not
    // move, but this is clutch control being practised, not a stuck student.
    expect(stuckStartReason({ ...READY, selector: "M", clutchDown: true }, false)).toBeNull();
    expect(stuckStartReason({ ...READY, selector: "R", clutchDown: true }, false)).toBeNull();
  });
});

describe("StuckStartWatch — when the cockpit speaks", () => {
  it("stays silent for the first STUCK_START_HINT_S, then says it once", () => {
    const w = new StuckStartWatch();
    expect(run(w, STUCK_START_HINT_S - 0.05, { driveline: { selector: "P" } })).toEqual([]);
    const after = run(w, 0.2, { driveline: { selector: "P" } });
    expect(after).toEqual(["parked"]);
  });

  it("does not fire at all on a car that can move, however long the pedal is down", () => {
    const w = new StuckStartWatch();
    expect(run(w, 30)).toEqual([]);
  });

  it("does not fire on a brush of the pedal — a full keyboard ramp is not enough", () => {
    // The keyboard reaches full throttle in THROTTLE_ATTACK_S; a press that
    // short must never produce a lecture.
    const w = new StuckStartWatch();
    let pedal = 0;
    const steps = Math.round(THROTTLE_ATTACK_S / DT);
    const said: StuckStartReason[] = [];
    for (let i = 0; i < steps; i++) {
      pedal = stepPedal(pedal, true, DT, THROTTLE_ATTACK_S, 0.25);
      const r = w.update({
        throttlePedal: pedal,
        speedKmh: 0,
        driveline: { ...READY, engineOn: false },
        stalled: false,
        dtSec: DT,
      });
      if (r !== null) said.push(r);
    }
    expect(pedal).toBeCloseTo(1, 5); // the ramp really did reach the floor
    expect(said).toEqual([]);
  });

  it("repeats no faster than STUCK_START_REPEAT_S while the student keeps pressing", () => {
    const w = new StuckStartWatch();
    const said = run(w, STUCK_START_HINT_S + STUCK_START_REPEAT_S * 2 + 0.1, {
      driveline: { engineOn: false },
    });
    expect(said).toEqual(["engineOff", "engineOff", "engineOff"]);
  });

  it("answers a CLEARED blocker with the next one, without waiting out the cooldown", () => {
    const w = new StuckStartWatch();
    expect(run(w, STUCK_START_HINT_S + 0.1, { driveline: { engineOn: false, selector: "P" } })).toEqual(
      ["engineOff"],
    );
    // He starts the engine and keeps pressing — P is now what is in the way,
    // and it is answered after the settle beat, not after STUCK_START_REPEAT_S.
    expect(run(w, STUCK_START_SETTLE_S + 0.1, { driveline: { selector: "P" } })).toEqual(["parked"]);
    // …and clearing that reaches the parking brake, still with no cooldown.
    expect(run(w, STUCK_START_SETTLE_S + 0.1, { driveline: { parkingBrakeOn: true } })).toEqual([
      "parkingBrake",
    ]);
  });

  it("does not narrate a gate walk — only the position the student settles on", () => {
    // Measured on the drive rig before STUCK_START_SETTLE_S existed: flooring
    // the throttle and stepping P → R → N → D produced three cards in 2.5 s.
    const w = new StuckStartWatch();
    expect(run(w, STUCK_START_HINT_S + 0.1, { driveline: { engineOn: false, selector: "P" } })).toEqual(
      ["engineOff"],
    );
    const walk: StuckStartReason[] = [
      // engine on now; one gate step every 0.3 s, none of them settled
      ...run(w, 0.3, { driveline: { selector: "P", parkingBrakeOn: true } }),
      ...run(w, 0.3, { driveline: { selector: "R", parkingBrakeOn: true } }),
      ...run(w, 0.3, { driveline: { selector: "N", parkingBrakeOn: true } }),
    ];
    expect(walk).toEqual([]);
    // He stops on D with the handbrake still up — THAT is worth saying.
    expect(run(w, STUCK_START_SETTLE_S + 0.1, { driveline: { parkingBrakeOn: true } })).toEqual([
      "parkingBrake",
    ]);
  });

  it("ends the episode the moment the foot lifts, and counts from zero next time", () => {
    const w = new StuckStartWatch();
    run(w, STUCK_START_HINT_S - 0.05, { driveline: { engineOn: false } });
    expect(run(w, 0.5, { throttlePedal: 0, driveline: { engineOn: false } })).toEqual([]);
    expect(w.heldSec).toBe(0);
    // A fresh press must serve the full silence again.
    expect(run(w, STUCK_START_HINT_S - 0.05, { driveline: { engineOn: false } })).toEqual([]);
  });

  it("stays quiet once the car is genuinely rolling", () => {
    const w = new StuckStartWatch();
    const said = run(w, 5, {
      speedKmh: REVERSE_ASSIST_STANDSTILL_KMH + 0.01,
      driveline: { parkingBrakeOn: true },
    });
    expect(said).toEqual([]);
  });

  it("still speaks at the creep the parking brake actually allows (measured 0.32 km/h)", () => {
    // Drive rig, 8 s of full throttle against PARKING_BRAKE_FORCE_N: the car
    // reached 0.32 km/h and no more. The standstill window has to cover it or
    // the one blocker that lets the car twitch is the one that stays silent.
    expect(0.32).toBeLessThan(REVERSE_ASSIST_STANDSTILL_KMH);
    const w = new StuckStartWatch();
    expect(
      run(w, STUCK_START_HINT_S + 0.1, { speedKmh: 0.32, driveline: { parkingBrakeOn: true } }),
    ).toEqual(["parkingBrake"]);
  });

  it("cannot talk over LAW 2: a disowned channel presents ZERO functional throttle", () => {
    // The two machines share one input path. `ReversePedalMapper` zeroes the
    // throttle of a channel it has disowned, so the value this watch reads is
    // already 0 and `ReverseStuckWatch` owns the episode alone.
    const m = new ReversePedalMapper();
    const input = { throttle: 0, brake: 1, steer: 0, handbrake: false };
    m.apply(input, true); // flip into R with the pedal held → disowned
    expect(m.isDisowned).toBe(true);
    expect(input.throttle).toBe(0);
    expect(input.throttle).toBeLessThanOrEqual(STUCK_START_PEDAL_ON);

    const w = new StuckStartWatch();
    expect(
      run(w, 5, {
        throttlePedal: input.throttle,
        driveline: { selector: "R", parkingBrakeOn: true },
      }),
    ).toEqual([]);
  });

  it("reset() ends an episode outright", () => {
    const w = new StuckStartWatch();
    run(w, STUCK_START_HINT_S - 0.05, { driveline: { engineOn: false } });
    w.reset();
    expect(w.heldSec).toBe(0);
    expect(run(w, STUCK_START_HINT_S - 0.05, { driveline: { engineOn: false } })).toEqual([]);
  });
});

/**
 * THE BRAKE CHANNEL — the founder's own defect on the tier that opted out of
 * the reverse assist.
 *
 * Measured on /dev/drive-rig (`sc-junction-stop@L1`, real shell, a real click
 * on the „Напреднал" pill, 2026-08-11): the selector went D → N and twelve and
 * a half seconds of held ↓ produced 0.00 km/h and not one word — because on the
 * manual box ↓ is the BRAKE, and nothing in this engine listened to it.
 *
 * The whole risk of listening to it is NAGGING A CORRECT DRIVER, so that is
 * what most of this block pins: the Б2 hold, the red light and the roll-to-N
 * must stay exactly as silent as they were.
 */
describe("StuckStartWatch — the brake, in the two positions that transmit nothing", () => {
  const NEUTRAL: Partial<DrivelinePhysicsInput> = { selector: "N" };

  it("answers a held ↓ in the neutral the tier switch put the student in", () => {
    const w = new StuckStartWatch();
    liftBrake(w, NEUTRAL);
    expect(brake(w, STUCK_START_HINT_S - 0.05, { driveline: NEUTRAL })).toEqual([]);
    expect(brake(w, 0.2, { driveline: NEUTRAL })).toEqual(["neutral"]);
  });

  it("…and in P, with the same sentence the throttle would have got", () => {
    const w = new StuckStartWatch();
    const parked: Partial<DrivelinePhysicsInput> = { selector: "P" };
    liftBrake(w, parked);
    expect(brake(w, STUCK_START_HINT_S + 0.1, { driveline: parked })).toEqual(["parked"]);
  });

  it("NEVER reads the brake in D, M or R — the Б2 hold stays silent forever", () => {
    // This is the guard the whole product is built around (reverseAssist.ts
    // LAW 1): a foot standing on the brake at a stop line is the single most
    // correct thing a learner does. Thirty seconds of it, in every position
    // where the gearbox transmits something.
    for (const selector of ["D", "M", "R"] as const) {
      const w = new StuckStartWatch();
      liftBrake(w, { selector });
      expect(brake(w, 30, { driveline: { selector } })).toEqual([]);
    }
  });

  it("stays silent for a brake CARRIED IN through the shift into neutral", () => {
    // Roll to a stop in D on the pedal, then shift to N without lifting — the
    // red light, and the most likely way a correct driver ends up standing on
    // the brake in neutral. The gate opening is not a rising edge, so the
    // press can never arm.
    const w = new StuckStartWatch();
    expect(brake(w, 2, { speedKmh: 8, driveline: { selector: "D" } })).toEqual([]);
    expect(brake(w, 2, { driveline: { selector: "D" } })).toEqual([]);
    expect(brake(w, 60, { driveline: NEUTRAL })).toEqual([]);
  });

  it("stays silent for an UNARMED press — a foot that never left the pedal", () => {
    const w = new StuckStartWatch();
    // No lift at all before the press: the watch has just been constructed.
    expect(brake(w, 30, { driveline: NEUTRAL })).toEqual([]);
  });

  it("needs a FULL REVERSE_ASSIST_LIFT_S of lifted pedal, not a bounce", () => {
    const w = new StuckStartWatch();
    liftBrake(w, NEUTRAL);
    // Arm it, use it up, then bounce the pedal for less than the lift window.
    expect(brake(w, STUCK_START_HINT_S + 0.1, { driveline: NEUTRAL })).toEqual(["neutral"]);
    run(w, REVERSE_ASSIST_LIFT_S - 0.05, { throttlePedal: 0, brakePedal: 0, driveline: NEUTRAL });
    expect(brake(w, STUCK_START_HINT_S + 0.1, { driveline: NEUTRAL })).toEqual([]);
  });

  it("never reaches the engine-off copy, which names the throttle", () => {
    // «Двигателят е изключен — затова ГАЗТА не движи колата» would be a lie
    // about a brake press, so the brake channel is gated on a running engine.
    const w = new StuckStartWatch();
    const dead: Partial<DrivelinePhysicsInput> = { engineOn: false, selector: "P" };
    liftBrake(w, dead);
    expect(brake(w, 30, { driveline: dead })).toEqual([]);
    // The throttle still covers that car, unchanged.
    expect(run(w, STUCK_START_HINT_S + 0.1, { driveline: dead })).toEqual(["engineOff"]);
  });

  it("stays silent while the car is still rolling in neutral", () => {
    const w = new StuckStartWatch();
    liftBrake(w, NEUTRAL);
    expect(
      brake(w, 10, { speedKmh: REVERSE_ASSIST_STANDSTILL_KMH + 0.01, driveline: NEUTRAL }),
    ).toEqual([]);
  });

  it("cannot fire where LAW 2 speaks: it is not read in D or R at all", () => {
    // ReverseStuckWatch owns the disowned-pedal episode, and that can only
    // happen in D or R (the two selectors the remap flips between). The brake
    // channel is deaf there, so the two can never say two things at once.
    const w = new StuckStartWatch();
    for (const selector of ["D", "R"] as const) {
      liftBrake(w, { selector, parkingBrakeOn: true });
      expect(brake(w, 20, { driveline: { selector, parkingBrakeOn: true } })).toEqual([]);
    }
  });

  it("repeats on the same cadence as the throttle while the foot stays down", () => {
    const w = new StuckStartWatch();
    liftBrake(w, NEUTRAL);
    expect(
      brake(w, STUCK_START_HINT_S + STUCK_START_REPEAT_S + 0.1, { driveline: NEUTRAL }),
    ).toEqual(["neutral", "neutral"]);
  });

  it("an absent brakePedal is a lifted brake — every legacy caller is unchanged", () => {
    const w = new StuckStartWatch();
    const said: StuckStartReason[] = [];
    for (let i = 0; i < Math.round(30 / DT); i++) {
      const r = w.update({
        throttlePedal: 0,
        speedKmh: 0,
        driveline: { ...READY, selector: "N" },
        stalled: false,
        dtSec: DT,
      });
      if (r !== null) said.push(r);
    }
    expect(said).toEqual([]);
  });
});
