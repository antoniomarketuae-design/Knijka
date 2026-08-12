/**
 * ReverseStuckWatch — the sentence LAW 2 never had.
 *
 * `ReversePedalMapper.isDisowned` is correct and stays untouched: a pedal held
 * through a selector flip keeps braking and produces zero throttle. What was
 * missing is that NOTHING read it, so the founder held ↓, watched the cluster
 * turn to R, and asked „did it break or ?“. This machine decides WHEN that
 * state has lasted long enough to be confusion rather than the ordinary
 * held-brake shift every correct reverse begins with.
 *
 * The two properties that matter are opposite failure modes and both are
 * pinned here: it must NOT talk over an ordinary shift, and it MUST talk when
 * the driver is genuinely stuck.
 */

import { describe, expect, it } from "vitest";
import type { SelectorPosition } from "@/modules/sim/vehicle";
import {
  REVERSE_STUCK_HINT_S,
  REVERSE_STUCK_REPEAT_S,
  ReverseStuckWatch,
  type ReverseStuckDirection,
} from "../reverseStuck";
import {
  BRAKE_RELEASE_S,
  REVERSE_ASSIST_PEDAL_ON,
  REVERSE_ASSIST_STANDSTILL_KMH,
  ReversePedalMapper,
  stepPedal,
  THROTTLE_ATTACK_S,
} from "..";

const DT = 1 / 60; // the shipped render cadence

interface FrameOverrides {
  disowned?: boolean;
  selector?: SelectorPosition;
  speedKmh?: number;
  dtSec?: number;
}

function frame(o: FrameOverrides = {}) {
  return {
    disowned: o.disowned ?? true,
    selector: o.selector ?? ("R" as SelectorPosition),
    speedKmh: o.speedKmh ?? 0,
    dtSec: o.dtSec ?? DT,
  };
}

/** Run `n` identical frames; returns every frame index that spoke. */
function run(
  w: ReverseStuckWatch,
  n: number,
  o: FrameOverrides = {},
): { at: number; direction: ReverseStuckDirection }[] {
  const out: { at: number; direction: ReverseStuckDirection }[] = [];
  for (let i = 0; i < n; i++) {
    const d = w.update(frame(o));
    if (d !== null) out.push({ at: i, direction: d });
  }
  return out;
}

const frames = (sec: number) => Math.ceil(sec / DT);

describe("ReverseStuckWatch — it must not talk over an ordinary shift", () => {
  it("says nothing for the first REVERSE_STUCK_HINT_S of a disowned pedal", () => {
    const w = new ReverseStuckWatch();
    // One frame short of the threshold, whatever the threshold is.
    expect(run(w, frames(REVERSE_STUCK_HINT_S) - 1)).toEqual([]);
    expect(w.heldSec).toBeLessThan(REVERSE_STUCK_HINT_S);
  });

  it("stays silent through the pedal RAMP a driver who lifts instantly produces", () => {
    // THE FLOOR, from the shipped constants rather than from a guess: the
    // guard clears on VALUE (REVERSE_ASSIST_PEDAL_ON), and SimInput releases
    // the brake channel over BRAKE_RELEASE_S. A driver whose foot comes off in
    // the very frame the selector flips is STILL disowned for this long.
    const mapper = new ReversePedalMapper();
    mapper.apply({ throttle: 0, brake: 1, steer: 0, handbrake: false }, false);
    const w = new ReverseStuckWatch();
    let pedal = 1; // fully pressed at the flip
    let remap = true;
    let disownedSec = 0;
    const spoke: ReverseStuckDirection[] = [];
    for (let i = 0; i < frames(2); i++) {
      const input = { throttle: 0, brake: pedal, steer: 0, handbrake: false };
      mapper.apply(input, remap);
      remap = true;
      if (mapper.isDisowned) disownedSec += DT;
      const d = w.update(frame({ disowned: mapper.isDisowned }));
      if (d !== null) spoke.push(d);
      pedal = stepPedal(pedal, false, DT, 0, BRAKE_RELEASE_S); // key released
    }
    // 1 → 0 over 0.2 s crosses 0.1 at 0.18 s. Nothing is said.
    expect(disownedSec).toBeGreaterThan(BRAKE_RELEASE_S * (1 - REVERSE_ASSIST_PEDAL_ON) - DT);
    expect(disownedSec).toBeLessThan(BRAKE_RELEASE_S + DT);
    expect(spoke).toEqual([]);
    expect(mapper.isDisowned).toBe(false);
  });

  it("stays silent for a „бавен“ but perfectly correct driver", () => {
    // The product's own slowest ACCEPTABLE reaction (lessons/objectives.ts
    // REACTION_BAND_GOOD_MAX_S = 1.2 s) plus the release ramp above.
    const w = new ReverseStuckWatch();
    expect(run(w, frames(1.2 + BRAKE_RELEASE_S))).toEqual([]);
  });

  it("forgets the whole episode the moment the foot lifts", () => {
    const w = new ReverseStuckWatch();
    run(w, frames(REVERSE_STUCK_HINT_S) - 2);
    expect(w.update(frame({ disowned: false }))).toBeNull();
    expect(w.heldSec).toBe(0);
    // …and the next episode counts from zero, not from where the last stopped.
    expect(run(w, frames(REVERSE_STUCK_HINT_S) - 1)).toEqual([]);
  });

  it("never speaks while the car is moving, or outside D and R", () => {
    const long = frames(REVERSE_STUCK_HINT_S * 3);
    expect(run(new ReverseStuckWatch(), long, { speedKmh: REVERSE_ASSIST_STANDSTILL_KMH })).toEqual([]);
    expect(run(new ReverseStuckWatch(), long, { speedKmh: -5 })).toEqual([]);
    for (const selector of ["P", "N", "M"] as SelectorPosition[]) {
      expect(run(new ReverseStuckWatch(), long, { selector })).toEqual([]);
    }
  });

  it("never speaks when nothing is disowned, however long the drive", () => {
    expect(run(new ReverseStuckWatch(), frames(60), { disowned: false })).toEqual([]);
  });
});

describe("ReverseStuckWatch — it must talk when the driver IS stuck", () => {
  it("speaks once, at the threshold, and names the direction the car will not go", () => {
    const w = new ReverseStuckWatch();
    const spoke = run(w, frames(REVERSE_STUCK_HINT_S) + 1);
    expect(spoke).toHaveLength(1);
    expect(spoke[0]!.direction).toBe("backward");
    expect(spoke[0]!.at * DT).toBeGreaterThanOrEqual(REVERSE_STUCK_HINT_S - DT);
  });

  it("says „напред“ when the flip that disowned the pedal was the way OUT of R", () => {
    const w = new ReverseStuckWatch();
    const spoke = run(w, frames(REVERSE_STUCK_HINT_S) + 1, { selector: "D" });
    expect(spoke.map((s) => s.direction)).toEqual(["forward"]);
  });

  it("repeats while the driver stays stuck, at REVERSE_STUCK_REPEAT_S", () => {
    // The founder's own gesture: hold the key down and wait. A single toast
    // expires long before he lets go, so the cockpit says it again.
    const w = new ReverseStuckWatch();
    const spoke = run(w, frames(REVERSE_STUCK_HINT_S + REVERSE_STUCK_REPEAT_S * 2) + 2);
    expect(spoke).toHaveLength(3);
    const gaps = spoke.slice(1).map((s, i) => (s.at - spoke[i]!.at) * DT);
    for (const gap of gaps) expect(gap).toBeCloseTo(REVERSE_STUCK_REPEAT_S, 1);
  });

  it("a driver who lifts is never told twice", () => {
    const w = new ReverseStuckWatch();
    expect(run(w, frames(REVERSE_STUCK_HINT_S) + 1)).toHaveLength(1);
    w.update(frame({ disowned: false })); // the foot comes off
    // A fresh press that reverses normally must be silent for the full budget.
    expect(run(w, frames(REVERSE_STUCK_HINT_S) - 1)).toEqual([]);
  });

  it("reset() ends the episode the way the scene ends it", () => {
    const w = new ReverseStuckWatch();
    run(w, frames(REVERSE_STUCK_HINT_S) + 1);
    w.reset();
    expect(w.heldSec).toBe(0);
    expect(run(w, frames(REVERSE_STUCK_HINT_S) - 1)).toEqual([]);
  });

  it("is frame-rate independent — the same wall time on a 20 Hz box", () => {
    const w = new ReverseStuckWatch();
    const slow = 0.05;
    const spoke = run(w, Math.ceil(REVERSE_STUCK_HINT_S / slow) + 1, { dtSec: slow });
    expect(spoke).toHaveLength(1);
    expect(spoke[0]!.at * slow).toBeGreaterThanOrEqual(REVERSE_STUCK_HINT_S - slow);
  });
});

describe("the threshold clears every ordinary shift with room to spare", () => {
  it("is above the slowest ordinary shift and far above the ramp floor", () => {
    const rampFloor = BRAKE_RELEASE_S * (1 - REVERSE_ASSIST_PEDAL_ON); // 0.18 s
    const slowestOrdinary = 1.2 + rampFloor; // „добър“ reaction + the ramp
    expect(REVERSE_STUCK_HINT_S).toBeGreaterThan(slowestOrdinary);
    expect(REVERSE_STUCK_HINT_S / rampFloor).toBeGreaterThan(8);
    // …and it is not so late that the car sits dead for longer than it takes
    // to floor the accelerator from rest four times over.
    expect(REVERSE_STUCK_HINT_S).toBeLessThan(THROTTLE_ATTACK_S * 5);
  });

  it("repeats no faster than the shell's own „still stuck“ cadence", () => {
    // LessonPlayShell.BLOCKED_DRIVE_TOAST_COOLDOWN_S — the same shape of
    // problem (an input refused for a reason the student cannot see) already
    // repeats at this cadence, and two different answers would be a defect.
    expect(REVERSE_STUCK_REPEAT_S).toBe(10);
    expect(REVERSE_STUCK_REPEAT_S).toBeGreaterThan(REVERSE_STUCK_HINT_S);
  });
});

describe("wired to the real mapper, end to end", () => {
  /**
   * THE FOUNDER'S OWN GESTURE, through the SHIPPED guard: ↓ held at a
   * standstill, the selector flips to R under the motionless foot, and the
   * pedal is never lifted. Nothing about LAW 2 changes — zero throttle, full
   * brake, every frame — but the cockpit now says so.
   */
  it("the held pedal produces zero throttle AND a sentence", () => {
    const mapper = new ReversePedalMapper();
    const w = new ReverseStuckWatch();
    const held = () => ({ throttle: 0, brake: 1, steer: 0, handbrake: false });
    mapper.apply(held(), false); // in D, ↓ is the brake
    const spoke: ReverseStuckDirection[] = [];
    for (let i = 0; i < frames(5); i++) {
      const f = held();
      mapper.apply(f, true); // …the selector went to R under the foot
      expect(f.throttle).toBe(0); // the 16.8 km/h reverse: still impossible
      expect(f.brake).toBe(1); // and still braked, not coasting
      const d = w.update(frame({ disowned: mapper.isDisowned }));
      if (d !== null) spoke.push(d);
    }
    expect(spoke[0]).toBe("backward");
    expect(spoke.length).toBeGreaterThanOrEqual(1);
  });

  it("an ordinary reverse — press, flip, lift, press — is driven in silence", () => {
    const mapper = new ReversePedalMapper();
    const w = new ReverseStuckWatch();
    let pedal = 0;
    let remap = false;
    let held = true; // the driver's key/finger
    const spoke: ReverseStuckDirection[] = [];
    let reverseThrottle = 0;
    for (let i = 0; i < frames(3); i++) {
      const t = i * DT;
      if (t >= 0.6) remap = true; // the assist shifts to R at 0.6 s
      if (t >= 0.6 && t < 1.1) held = false; // …and the driver lifts, then
      else if (t >= 1.1) held = true; //        presses again to reverse
      pedal = stepPedal(pedal, held, DT, 0.25, BRAKE_RELEASE_S);
      const input = { throttle: 0, brake: pedal, steer: 0, handbrake: false };
      mapper.apply(input, remap);
      reverseThrottle = Math.max(reverseThrottle, input.throttle);
      const d = w.update(frame({ disowned: mapper.isDisowned }));
      if (d !== null) spoke.push(d);
    }
    expect(spoke).toEqual([]); // not one word
    expect(reverseThrottle).toBeGreaterThan(0.9); // and the car reverses
  });
});
