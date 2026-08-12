/**
 * ReverseAssist — the auto-reverse state machine (founder 2026-07-17:
 * „стрелката надолу не кара колата назад") and the pedal mapper that guards it.
 *
 * The trigger used to be a brake HOLD, and that is how a student doing the
 * correct thing at a Б2 stop line ended up reversing into traffic at 16.8 km/h
 * (measured on sc-junction-stop, gear 1 → −1 with brake input 1.00). Two laws
 * replace it, and this file is where they are pinned:
 *
 *  LAW 1 (ReverseAssist) — only a press that BEGINS at a standstill, after the
 *    pedal was genuinely lifted, can toggle direction. The press that stops the
 *    car never does, no matter how long it is held.
 *  LAW 2 (ReversePedalMapper) — whichever channel inherits the throttle role
 *    when the pedals swap keeps BRAKING until the foot comes off it, on every
 *    HAND-WORKED route into R: the [ / ] keys, the touch gear sheet, the
 *    cockpit lever. A held brake can never become throttle there.
 *
 * 2026-08-11 — LAW 2 IS SCOPED, LAW 1 IS NOT. The founder: „before when
 * pressing S or Arrow Down it automatically went to R and moved backwards and
 * it has to stay like that because thats automatic transmition." Disowning the
 * assist's OWN trigger press never prevented that reverse — it charged a second
 * press for it — because LAW 1 already refuses to arm a press that was not made
 * at a standstill after a genuine lift. So an "assist" flip carries the press
 * through; a "manual" flip is guarded exactly as before, and "manual" is the
 * default so a caller that forgets gets the guard. LAW 1 does not move: the
 * pedal held from a ROLL is the input that reversed a car into traffic at
 * 16.8 km/h, and the cases below still pin it shut.
 */

import { describe, expect, it } from "vitest";
import type { SelectorPosition, VehicleInput } from "@/modules/sim/vehicle";
import {
  applyReversePedalRemap,
  REVERSE_ASSIST_HOLD_S,
  REVERSE_ASSIST_LIFT_S,
  REVERSE_ASSIST_SUPPRESS_S,
  ReverseAssist,
  ReversePedalMapper,
  shouldRemapReversePedals,
  type ReverseAssistCommand,
  type ReverseShiftSource,
} from "../reverseAssist";

const DT = 0.05; // 20 Hz frames — HOLD_S (0.35) is exactly 7 frames
/** Frames of lifted pedal that arm the next press (0.25 s → 5 frames). */
const LIFT_FRAMES = Math.ceil(REVERSE_ASSIST_LIFT_S / DT);

interface FrameOverrides {
  speedKmh?: number;
  selector?: SelectorPosition;
  brakePedal?: number;
  throttlePedal?: number;
  dtSec?: number;
}

function frame(o: FrameOverrides = {}) {
  return {
    speedKmh: o.speedKmh ?? 0,
    selector: o.selector ?? ("D" as SelectorPosition),
    brakePedal: o.brakePedal ?? 1,
    throttlePedal: o.throttlePedal ?? 0,
    dtSec: o.dtSec ?? DT,
  };
}

/** Run `n` identical frames; returns every non-null command emitted. */
function run(assist: ReverseAssist, n: number, o: FrameOverrides = {}): ReverseAssistCommand[] {
  const out: ReverseAssistCommand[] = [];
  for (let i = 0; i < n; i++) {
    const cmd = assist.update(frame(o));
    if (cmd) out.push(cmd);
  }
  return out;
}

/** The deliberate gesture: stationary car, foot OFF the pedal long enough to
 *  arm the next press. Every rule-a / rule-c case starts from here. */
function lift(assist: ReverseAssist, o: FrameOverrides = {}): void {
  run(assist, LIFT_FRAMES, { ...o, brakePedal: 0 });
}

describe("ReverseAssist rule a (D → R)", () => {
  it("emits shiftToR 0.35 s into an ARMED press (stopped car, foot lifted first)", () => {
    const a = new ReverseAssist();
    lift(a);
    expect(run(a, 6)).toEqual([]); // 0.30 s — not yet
    expect(a.update(frame())).toBe("shiftToR"); // 0.35 s exactly
  });

  it("emits at most once per press — a fresh lift is required", () => {
    const a = new ReverseAssist();
    lift(a);
    expect(run(a, 7)).toEqual(["shiftToR"]);
    // Still standing on the pedal (in D, hypothetically — or in R, where this
    // is the very frame the remapped brake would otherwise fire rule c and
    // start the car oscillating D↔R under one motionless foot).
    expect(run(a, 60)).toEqual([]);
    expect(run(a, 60, { selector: "R" })).toEqual([]);
    // Lift, press again: the gesture is complete and the toggle is available.
    lift(a, { selector: "R" });
    expect(run(a, 7, { selector: "R" })).toEqual(["shiftToD"]);
  });

  it("releasing the pedal mid-hold resets the timer (and re-arms)", () => {
    const a = new ReverseAssist();
    lift(a);
    run(a, 5); // 0.25 s in
    lift(a); // foot off long enough to arm the next press
    expect(run(a, 6)).toEqual([]); // fresh hold — 0.30 s is not enough
    expect(run(a, 1)).toEqual(["shiftToR"]);
  });

  it("does nothing while the car is moving (|speed| ≥ 0.6 km/h)", () => {
    const a = new ReverseAssist();
    lift(a);
    expect(run(a, 40, { speedKmh: 0.6 })).toEqual([]);
    expect(run(a, 40, { speedKmh: -5 })).toEqual([]);
  });

  it("held throttle vetoes the toggle (both pedals down is ambiguous)", () => {
    const a = new ReverseAssist();
    lift(a);
    expect(run(a, 40, { throttlePedal: 0.5 })).toEqual([]);
  });

  it.each(["P", "N", "M"] as const)("stays silent in selector %s", (selector) => {
    const a = new ReverseAssist();
    lift(a, { selector });
    expect(run(a, 40, { selector })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LAW 1 — the defect itself. These are the cases that produced the collision.
// ---------------------------------------------------------------------------
describe("LAW 1: the brake that stops the car never asks for reverse", () => {
  it("a student holding the brake at a Б2 stop for 30 s stays in D", () => {
    const a = new ReverseAssist();
    // Rolling up to the line with the pedal already down — the press begins
    // at 18 km/h, which is what braking to a stop IS.
    for (let v = 18; v > 0.6; v -= 0.6) run(a, 1, { speedKmh: v });
    // …and then thirty seconds of standing on it, the correct thing to do.
    expect(run(a, Math.round(30 / DT))).toEqual([]);
  });

  it("a press that begins while rolling can never arm, however long it lasts", () => {
    const a = new ReverseAssist();
    run(a, 1, { speedKmh: 5 }); // rising edge at 5 km/h
    expect(run(a, 400)).toEqual([]); // 20 s stopped, pedal never lifted
  });

  it("a press that begins at a standstill but with no lift before it is inert", () => {
    const a = new ReverseAssist();
    // Pedal off for less than REVERSE_ASSIST_LIFT_S — a momentary ease-off
    // while settling at the line, or the drive rig's 0.12 s duty-cycle gap.
    run(a, LIFT_FRAMES - 2, { brakePedal: 0 });
    expect(run(a, 400)).toEqual([]);
  });

  it("lifting while still rolling does not count — the lift must be at rest", () => {
    const a = new ReverseAssist();
    run(a, 20, { brakePedal: 0, speedKmh: 12 }); // coasting, foot off
    expect(run(a, 400)).toEqual([]); // stops under the press, never arms
  });

  it("a moving frame mid-press disarms it for good", () => {
    const a = new ReverseAssist();
    lift(a);
    run(a, 3); // armed press, 0.15 s in
    run(a, 1, { speedKmh: 4 }); // the car was rolling after all (kerb, slope)
    expect(run(a, 400)).toEqual([]);
  });

  it("a car handed over with the brake ALREADY down does not arm on frame one", () => {
    // Not hypothetical: the pre-drive procedure's own instruction is „Натисни
    // спирачния педал и задръж" — press the brake and HOLD it. The assist is
    // suspended for the whole checklist and starts stepping the instant the
    // gate opens, with the student's foot already planted exactly where the
    // lesson told them to plant it. A machine that armed on its first frame
    // would put every one of them into reverse 0.35 s after their first lesson
    // ended. It cannot: an unlifted pedal has earned no lift time.
    const a = new ReverseAssist();
    expect(run(a, 600)).toEqual([]); // 30 s, pedal down from the very first frame
  });

  it("still fires for the founder's actual gesture: stop, lift, press ↓", () => {
    const a = new ReverseAssist();
    for (let v = 18; v > 0.6; v -= 0.6) run(a, 1, { speedKmh: v }); // brake to a stop
    expect(run(a, 40)).toEqual([]); // …hold it a while — nothing happens
    lift(a); // take the foot off
    expect(run(a, 7)).toEqual(["shiftToR"]); // press ↓ again → R
  });
});

describe("ReverseAssist rule c (R → D)", () => {
  it("emits shiftToD after an armed press of the remapped brake in R", () => {
    const a = new ReverseAssist();
    lift(a, { selector: "R" });
    expect(run(a, 6, { selector: "R" })).toEqual([]);
    expect(a.update(frame({ selector: "R" }))).toBe("shiftToD");
  });

  it("reverse-throttling (functional throttle held) never toggles", () => {
    const a = new ReverseAssist();
    lift(a, { selector: "R" });
    expect(
      run(a, 40, { selector: "R", brakePedal: 0, throttlePedal: 1 }),
    ).toEqual([]);
  });

  it("braking to a stop MID-MANOEUVRE does not pop the car out of R", () => {
    // The mirror of the Б2 defect, and a bug in its own right: a student
    // reversing into a bay who brakes to a halt held the pedal for 0.35 s and
    // was silently put back in D — so the next ↓ drove them FORWARD.
    const a = new ReverseAssist();
    for (let v = 6; v > 0.6; v -= 0.3) run(a, 1, { selector: "R", speedKmh: -v });
    expect(run(a, 200, { selector: "R" })).toEqual([]);
  });
});

describe("ReverseAssist manual-shift suppression", () => {
  it("stays silent for 2 s after a manual shift, then works again", () => {
    const a = new ReverseAssist();
    a.noteManualShift();
    const silentFrames = Math.ceil(REVERSE_ASSIST_SUPPRESS_S / DT); // 40
    expect(run(a, silentFrames, {})).toEqual([]); // eligible the whole time
    // Suppression consumed — a fresh lift + full hold now fires.
    lift(a);
    const holdFrames = Math.ceil(REVERSE_ASSIST_HOLD_S / DT); // 7
    expect(run(a, holdFrames, {})).toEqual(["shiftToR"]);
  });

  it("a press spanning the whole silence stays unarmed after it ends", () => {
    const a = new ReverseAssist();
    lift(a);
    run(a, 2); // press down, armed
    a.noteManualShift(); // driver worked the lever instead
    expect(run(a, 400)).toEqual([]); // 2 s silence + 18 s of held pedal
  });

  it("a manual shift mid-hold drops the accumulated hold time", () => {
    const a = new ReverseAssist();
    lift(a);
    run(a, 6); // 0.30 s in
    a.noteManualShift();
    run(a, 40, { brakePedal: 0 }); // burn the 2 s silence with the foot off
    lift(a);
    expect(run(a, 6)).toEqual([]); // needs the FULL 0.35 s again
    expect(run(a, 1)).toEqual(["shiftToR"]);
  });
});

describe("applyReversePedalRemap (rule b)", () => {
  it("swaps throttle and brake in place, leaving steer/handbrake alone", () => {
    const input: VehicleInput = { throttle: 0.8, brake: 0.2, steer: -1, handbrake: true };
    applyReversePedalRemap(input);
    expect(input).toEqual({ throttle: 0.2, brake: 0.8, steer: -1, handbrake: true });
  });
});

// ---------------------------------------------------------------------------
// LAW 2 — the invariant, independent of what triggered the shift.
// ---------------------------------------------------------------------------
describe("LAW 2: a pedal that means stop never means go", () => {
  const held = (): VehicleInput => ({ throttle: 0, brake: 1, steer: 0, handbrake: false });

  it("a brake held into R keeps braking and produces ZERO throttle", () => {
    const m = new ReversePedalMapper();
    const a = held();
    m.apply(a, false); // in D: ↓ = brake
    expect(a).toEqual({ throttle: 0, brake: 1, steer: 0, handbrake: false });

    // …the selector goes to R under the motionless foot (assist, [ / ], touch
    // gear sheet or cockpit lever — the mapper cannot tell and does not care).
    for (let i = 0; i < 600; i++) {
      const f = held();
      m.apply(f, true);
      expect(f.throttle).toBe(0); // ← the 16.8 km/h reverse, gone
      expect(f.brake).toBe(1); // ← and the car is still BRAKED, not coasting
    }
  });

  it("the channel comes back the moment the foot genuinely lifts", () => {
    const m = new ReversePedalMapper();
    m.apply(held(), false);
    const f = held();
    m.apply(f, true);
    expect(f.throttle).toBe(0);
    expect(m.isDisowned).toBe(true);

    // Keyboard release ramp: 1 → 0 over BRAKE_RELEASE_S. Values are what the
    // guard judges on, so it re-arms as the pedal passes the ON threshold.
    for (const v of [0.8, 0.5, 0.2, 0.05]) {
      m.apply({ throttle: 0, brake: v, steer: 0, handbrake: false }, true);
    }
    expect(m.isDisowned).toBe(false);

    // A fresh press is now the reverse accelerator, exactly as designed.
    const go: VehicleInput = { throttle: 0, brake: 1, steer: 0, handbrake: false };
    m.apply(go, true);
    expect(go.throttle).toBe(1);
    expect(go.brake).toBe(0);
  });

  it("guards the way OUT of R too (↑ was the brake there)", () => {
    const m = new ReversePedalMapper();
    // Reversing driver presses ↑ to stop; in R that is the brake.
    const inR: VehicleInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    m.apply(inR, true);
    expect(inR.brake).toBe(1);
    // R → D under the same held foot: ↑ is now the throttle. It must not be.
    const inD: VehicleInput = { throttle: 1, brake: 0, steer: 0, handbrake: false };
    m.apply(inD, false);
    expect(inD.throttle).toBe(0);
    expect(inD.brake).toBe(1);
  });

  it("a pedal may always GAIN the brake role — stop is never withheld", () => {
    const m = new ReversePedalMapper();
    // Reverse-throttling with ↓ held, then R → D: ↓ becomes the brake and is
    // applied immediately. Only "go" is guarded, never "stop".
    m.apply({ throttle: 0, brake: 1, steer: 0, handbrake: false }, true);
    const f: VehicleInput = { throttle: 0, brake: 1, steer: 0, handbrake: false };
    m.apply(f, false);
    expect(f.brake).toBe(1);
    expect(f.throttle).toBe(0);
  });

  it("is idempotent — read() runs several times per frame", () => {
    const m = new ReversePedalMapper();
    m.apply(held(), false);
    const results = [0, 1, 2].map(() => {
      const f = held();
      m.apply(f, true);
      return { throttle: f.throttle, brake: f.brake };
    });
    expect(results).toEqual([
      { throttle: 0, brake: 1 },
      { throttle: 0, brake: 1 },
      { throttle: 0, brake: 1 },
    ]);
  });

  it("does not lock out a driver whose foot was already off at the shift", () => {
    const m = new ReversePedalMapper();
    m.apply({ throttle: 0, brake: 0, steer: 0, handbrake: false }, false);
    const f: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    m.apply(f, true); // flip with no foot anywhere
    expect(m.isDisowned).toBe(false);
    const go: VehicleInput = { throttle: 0, brake: 1, steer: 0, handbrake: false };
    m.apply(go, true);
    expect(go.throttle).toBe(1); // ↓ reverses on the very next press
  });

  it("passes everything through untouched while the box is not remapped", () => {
    const m = new ReversePedalMapper();
    const f: VehicleInput = { throttle: 0.7, brake: 0.3, steer: 0.5, handbrake: true };
    m.apply(f, false);
    expect(f).toEqual({ throttle: 0.7, brake: 0.3, steer: 0.5, handbrake: true });
  });
});

// ---------------------------------------------------------------------------
// LAW 2's SCOPE — the two laws wired together, because the founder's ruling is
// about what the SYSTEM does to one press, and neither class can answer it
// alone. This box is `GatedSimInput.read()` + the frame loop in miniature:
// merge → rule b → LAW 2 → step the assist on the FUNCTIONAL pedals → execute
// the command on the selector, in that order, one frame at a time.
// ---------------------------------------------------------------------------
class Box {
  readonly assist = new ReverseAssist();
  readonly mapper = new ReversePedalMapper();
  selector: SelectorPosition = "D";
  private source: ReverseShiftSource = "manual";
  /** Commands the assist emitted, newest last — for asserting the gate moved. */
  readonly commands: ReverseAssistCommand[] = [];

  /** One frame of RAW pedals: `up` = ↑/W, `down` = ↓/S. Returns what the
   *  physics would be handed — i.e. the FUNCTIONAL pedals after both laws. */
  step(up: number, down: number, speedKmh: number, dtSec = DT): VehicleInput {
    const input: VehicleInput = { throttle: up, brake: down, steer: 0, handbrake: false };
    this.mapper.apply(input, this.selector === "R", this.source);
    const cmd = this.assist.update({
      speedKmh,
      selector: this.selector,
      brakePedal: input.brake,
      throttlePedal: input.throttle,
      dtSec,
    });
    if (cmd !== null) {
      this.commands.push(cmd);
      this.selector = cmd === "shiftToR" ? "R" : "D";
      this.source = "assist";
    }
    return input;
  }

  /** The [ / ] keys, the touch gear sheet, the cockpit lever — a HAND on the
   *  selector, which is also what `noteManualShift()` marks in the scene. */
  shiftByHand(to: SelectorPosition): void {
    this.selector = to;
    this.source = "manual";
    this.assist.noteManualShift();
  }

  /** Run n frames of the same pedals; returns the LAST functional input. */
  run(n: number, up: number, down: number, speedKmh: number): VehicleInput {
    let last = this.step(up, down, speedKmh);
    for (let i = 1; i < n; i++) last = this.step(up, down, speedKmh);
    return last;
  }
}

describe("LAW 2's scope: the assist's own armed press is not a stop press", () => {
  it("the founder's gesture reverses the car on ONE press", () => {
    // „before when pressing S or Arrow Down it automatically went to R and
    // moved backwards and it has to stay like that because thats automatic
    // transmition." Stationary car, foot off the pedals, then ↓ and hold.
    const b = new Box();
    b.run(LIFT_FRAMES, 0, 0, 0); // foot off, at rest — this is what arms it
    b.run(7, 0, 1, 0); // ↓ held: 0.35 s → shiftToR on the 7th frame
    expect(b.commands).toEqual(["shiftToR"]);
    expect(b.selector).toBe("R");
    // …and the VERY NEXT frame, with the same unbroken press, is reverse
    // throttle. No second press, no lift, nothing to explain.
    const f = b.step(0, 1, 0);
    expect(f.throttle).toBe(1);
    expect(f.brake).toBe(0);
    expect(b.mapper.isDisowned).toBe(false);
    // and it stays that way for as long as the foot is down
    expect(b.run(40, 0, 1, -8).throttle).toBe(1);
  });

  it("the SAME held pedal through a hand-worked selector is still refused", () => {
    // The [ / ] keys, the touch sheet, the cockpit lever: this foot may be
    // holding the car still, so its press really was a stop press.
    const b = new Box();
    for (let v = 22; v > 0.6; v -= 0.6) b.step(0, 1, v); // braking to rest on ↓
    b.run(40, 0, 1, 0); // …and standing on it at the line
    expect(b.selector).toBe("D"); // LAW 1: the assist never moved
    b.shiftByHand("R"); // the driver's hand, not the assist
    const f = b.run(600, 0, 1, 0); // 30 s of held pedal in R
    expect(f.throttle).toBe(0); // ← the 16.8 km/h reverse, still gone
    expect(f.brake).toBe(1); // ← and the car is still BRAKED
    expect(b.mapper.isDisowned).toBe(true); // ← so the cockpit still explains it
  });

  it("no press begun in motion can ever be labelled 'assist'", () => {
    // The exemption is not a flag anyone can set — it is only ever produced by
    // a command, and a command requires an armed press. This is the whole
    // safety argument, so it is asserted rather than reasoned about.
    const b = new Box();
    for (let v = 22; v > 0.6; v -= 0.3) b.step(0, 1, v); // press begins at 22 km/h
    b.run(600, 0, 1, 0); // 30 s at the line, foot never lifts
    expect(b.commands).toEqual([]);
    expect(b.selector).toBe("D");
    expect(b.mapper.isDisowned).toBe(false); // nothing ever flipped
  });

  it("is symmetric coming OUT of R — ↑ takes D and drives forward", () => {
    const b = new Box();
    b.run(LIFT_FRAMES, 0, 0, 0);
    b.run(7, 0, 1, 0); // ↓ → R
    b.run(20, 0, 1, -10); // reversing on ↓
    b.run(LIFT_FRAMES, 0, 0, 0); // stop, foot off — arms the next press
    b.run(7, 1, 0, 0); // ↑ (the brake in R) held → shiftToD
    expect(b.commands).toEqual(["shiftToR", "shiftToD"]);
    const f = b.step(1, 0, 0);
    expect(f.throttle).toBe(1);
    expect(f.brake).toBe(0);
  });

  it("the exemption is not sticky — the next hand-worked flip is guarded", () => {
    const b = new Box();
    b.run(LIFT_FRAMES, 0, 0, 0);
    b.run(7, 0, 1, 0); // assist → R, exempt
    expect(b.step(0, 1, 0).throttle).toBe(1);
    b.run(4, 1, 1, 0); // ↑ (the brake in R) comes down to stop the car
    b.shiftByHand("D"); // …and the hand moves the lever while it is held
    const f = b.run(200, 1, 0, 0);
    expect(f.throttle).toBe(0);
    expect(f.brake).toBe(1);
  });

  it("an UNLABELLED flip is a guarded flip (the default is 'manual')", () => {
    // A future caller that forgets the argument must get the guard, never the
    // exemption — the mistake has to fail safe.
    const m = new ReversePedalMapper();
    m.apply({ throttle: 0, brake: 1, steer: 0, handbrake: false }, false);
    const f: VehicleInput = { throttle: 0, brake: 1, steer: 0, handbrake: false };
    m.apply(f, true);
    expect(f.throttle).toBe(0);
    expect(m.isDisowned).toBe(true);
  });

  it("an assist flip with the foot ALREADY off changes nothing", () => {
    const m = new ReversePedalMapper();
    m.apply({ throttle: 0, brake: 0, steer: 0, handbrake: false }, false, "assist");
    const f: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    m.apply(f, true, "assist");
    expect(m.isDisowned).toBe(false);
    expect(f).toEqual({ throttle: 0, brake: 0, steer: 0, handbrake: false });
  });
});

describe("shouldRemapReversePedals", () => {
  it("remaps only in R on the automatic box", () => {
    expect(shouldRemapReversePedals("R", "automatic")).toBe(true);
    expect(shouldRemapReversePedals("R", "manual")).toBe(false); // real R semantics
    expect(shouldRemapReversePedals("D", "automatic")).toBe(false);
    expect(shouldRemapReversePedals("P", "automatic")).toBe(false);
    expect(shouldRemapReversePedals("N", "automatic")).toBe(false);
  });
});
