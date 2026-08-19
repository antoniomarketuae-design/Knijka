/**
 * WHY THE SWEEP'S REVERSE DRILLS ARE NOT EVIDENCE ABOUT THIS MACHINE.
 *
 * THE FRAMES: `sc-ed-reverse-line/pc-right/04-t108s.png` — the gear readout is
 * D at 3 км/ч while the task chip reads «Дръж права линия по средата на заден
 * ход» — and `sc-ed-poligon-chain/pc-right/01-arrival.png`, whose toast orders
 * «Премести лоста на R» over a D that never changes for 210 s. The findings
 * routed both here with the same disjunction: „either the sim never engages R
 * or the objective was written for a gear the drive never enters".
 *
 * NEITHER HALF IS WHAT HAPPENED, and the third possibility is the instrument.
 * `tools/mobile/lesson-audit.mjs` has no route into R at all:
 *
 *   · the only keys it ever sends are KeyW, KeyS and Escape (§1). There is no
 *     `[` / `]`, no touch gear sheet, no cockpit lever — every hand-worked
 *     route into the gate is absent from the harness;
 *   · and the one remaining route, this file's own assist, is refused by
 *     construction: `brake(on, kmh)` returns early for any press at kmh ≤ 1
 *     (lesson-audit.mjs:983-991), which is EXACTLY the standstill press LAW 1
 *     requires. The refusal is deliberate and was right to add — a teach card
 *     that lifted the pedal at rest once turned the next stop into a 16.8 км/ч
 *     reverse into traffic — but its side effect is that no drive in the sweep
 *     could enter reverse in any lesson, so no frame from it can say whether
 *     this machine works.
 *
 * The debriefs agree, and the debrief is where credit is read: sc-ed-reverse-
 * line's own run.log ends «27 full stops · 0 lawful waits», three objectives
 * with only the non-reverse one ticked, and MISTAKES (0). The drive was not
 * mis-graded; it was never driven.
 *
 * SO THIS FILE PROVES THREE THINGS AND NOT ONE.
 *   §1 the grammar, READ OUT OF THE HARNESS FILE rather than remembered — the
 *      day it gains a gear key or drops the refusal, this fails and the two
 *      findings become admissible again instead of quietly staying refuted;
 *   §2 the refutation: the most reverse-shaped sequence the harness can
 *      produce — including the pause-recovery that lifts BOTH pedals at a
 *      standstill, which is the gesture the refusal exists to catch — never
 *      moves this machine off D;
 *   §3 the mutation that makes §2 mean something: the identical frames with
 *      the refusal lifted DO reach R. A test that passed equally either way
 *      would be asserting that the machine is dead, which is the opposite
 *      claim and a far worse one to ship;
 *   §4 the other direction, because a lane that answered a missing manoeuvre
 *      by declaring it unreachable would be the false-refusal crime: the
 *      founder's real gesture (roll in, stop, LIFT, press ↓) takes R and the
 *      pressed channel really becomes reverse throttle.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REVERSE_ASSIST_LIFT_S,
  REVERSE_ASSIST_STANDSTILL_KMH,
  ReverseAssist,
  ReversePedalMapper,
  type ReverseAssistCommand,
} from "../reverseAssist";
import type { VehicleInput } from "../../vehicle";

const HARNESS = path.resolve(__dirname, "../../../../../../tools/mobile/lesson-audit.mjs");
const SRC = fs.readFileSync(HARNESS, "utf8");

// The harness's own control-law constants (lesson-audit.mjs:1069, 1109), read
// here so §2's trace is the shape the real drive takes rather than a guess.
const CRUISE_KMH = 12;
const BRAKE_CAP_OVER_KMH = 2;

// ---------------------------------------------------------------------------
// §1 — the grammar, read out of the instrument
// ---------------------------------------------------------------------------

describe("§1 the audit harness's gesture grammar", () => {
  it("sends only KeyW, KeyS and Escape — there is no hand-worked route into R", () => {
    const keys = [...SRC.matchAll(/keyboard(?:\.(?:down|up|press)|\[[^\]]*\])\("([^"]+)"/g)].map(
      (m) => m[1],
    );
    // Positive control first: a matcher that stopped matching would make the
    // set empty and every claim below vacuously true.
    expect(keys.length, "no keyboard calls found — the matcher is broken").toBeGreaterThan(3);
    expect([...new Set(keys)].sort()).toEqual(["Escape", "KeyS", "KeyW"]);
  });

  it("every brake PRESS is speed-gated, and the gate refuses the standstill press", () => {
    const presses = [...SRC.matchAll(/await brake\(([^;]*?)\);/g)].map((m) => m[1]);
    expect(presses.length, "no brake() call sites found").toBeGreaterThanOrEqual(3);
    // Every call that can press passes a speed; only the teardown release does not.
    const pressing = presses.filter((a) => !a.startsWith("false"));
    expect(pressing.length).toBeGreaterThanOrEqual(2);
    for (const a of pressing) expect(a, `brake(${a}) has no speed argument`).toContain("p.kmh");
    // …and the refusal itself, verbatim enough that loosening it fails here.
    expect(SRC).toMatch(/if \(on && kmh !== null && kmh >= 0 && kmh <= 1\)/);
    expect(SRC).toMatch(/refusedReversePress \+= 1;\s*\n\s*return;/);
  });

  it("the refused band covers the assist's whole standstill window", () => {
    // The refusal is stated in км/ч against a machine whose standstill test is
    // |v| < 0.6. 1 ≥ 0.6, so there is no sliver of speed at which the harness
    // would press AND this machine would call the car stopped.
    expect(REVERSE_ASSIST_STANDSTILL_KMH).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// §2/§3 — the harness's control law, replayed against the real machine
// ---------------------------------------------------------------------------

/** One rendered frame as the assist sees it. */
interface Frame {
  kmh: number;
  /** What the harness's control law asks of the S key this tick. */
  wantBrake: boolean;
}

/**
 * THE MOST REVERSE-SHAPED SEQUENCE THE HARNESS CAN PRODUCE.
 *
 * Read off the drive loop (lesson-audit.mjs:1414-1452): the `roll` phase calls
 * `brake(kmh > CRUISE + CAP, kmh)` and the `stop` phase calls `brake(true,
 * kmh)` every tick; a pause drain lifts BOTH pedals outright (:1366-1367) and
 * clears the harness's belief about them. The sequence below is the worst
 * case for LAW 1 — a car brought to REST, then a teach card that lifts the
 * pedal at that standstill and holds the lift far longer than
 * REVERSE_ASSIST_LIFT_S, then the stop phase pressing again — which is
 * verbatim the gesture `brake()`'s own header says it exists to refuse.
 *
 * Speed is scripted rather than simulated: a second physics model would be a
 * second thing to be wrong about, and what is being proved is a property of
 * the PEDAL grammar, which holds whatever the car does.
 */
const DT = 1 / 60;

function pauseRecoveryTrace(): Frame[] {
  const f: Frame[] = [];
  const push = (n: number, kmh: number, wantBrake: boolean) => {
    for (let i = 0; i < n; i++) f.push({ kmh, wantBrake });
  };
  // roll: cruising, above the cap → the control law presses the brake while
  // the car is unambiguously MOVING. This is the only press it ever makes.
  push(30, CRUISE_KMH + BRAKE_CAP_OVER_KMH + 6, true);
  // …and holds it down through the whole deceleration to rest.
  push(20, 6, true);
  push(20, 0, true);
  // A teach card drains: both pedals lifted, at a standstill, for two whole
  // seconds — eight times REVERSE_ASSIST_LIFT_S.
  push(120, 0, false);
  // stop phase resumes and asks for the brake again, at rest. THIS is the
  // press that would select R, and it is the one the harness refuses.
  push(120, 0, true);
  return f;
}

/** Run a trace through the real machine. `refuseStandstillPress` models the
 *  harness's `brake()` guard; turning it off is §3's mutation. */
function drive(frames: Frame[], refuseStandstillPress: boolean) {
  const assist = new ReverseAssist();
  const out: { i: number; cmd: ReverseAssistCommand }[] = [];
  let held = false;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    // `brake(on, kmh)`: a press is refused at kmh ≤ 1; a RELEASE never is.
    if (f.wantBrake !== held) {
      if (!f.wantBrake || !refuseStandstillPress || f.kmh > 1) held = f.wantBrake;
    }
    const cmd = assist.update({
      speedKmh: f.kmh,
      selector: "D",
      // Functional pedals in D: the S channel is the brake. Modelled as a step
      // rather than the keyboard ramp on purpose — an instant pedal is the
      // ADVERSARIAL choice, since it maximises both the measured lift and the
      // detected press, so a machine that stays in D here stays in D on ramps.
      brakePedal: held ? 1 : 0,
      throttlePedal: 0,
      dtSec: DT,
    });
    if (cmd) out.push({ i, cmd });
  }
  return out;
}

describe("§2 the sweep's reverse drives could not enter reverse", () => {
  it("the harness's own control law never moves the selector off D", () => {
    expect(drive(pauseRecoveryTrace(), true)).toEqual([]);
  });

  it("nor does the plain roll/stop cycle, repeated", () => {
    const f: Frame[] = [];
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let i = 0; i < 40; i++) f.push({ kmh: CRUISE_KMH, wantBrake: false });
      for (let i = 0; i < 10; i++) f.push({ kmh: CRUISE_KMH + 5, wantBrake: true });
      for (let i = 0; i < 40; i++) f.push({ kmh: 0, wantBrake: true });
      // the roll phase's `brake(kmh > CRUISE + CAP)` releases at rest…
      for (let i = 0; i < 10; i++) f.push({ kmh: 0, wantBrake: false });
      // …and the next press only ever comes back once the car is moving.
    }
    expect(drive(f, true)).toEqual([]);
  });
});

describe("§3 the mutation — it is the refusal that blocks it, not a dead machine", () => {
  it("the identical frames reach R the moment the standstill press is allowed", () => {
    const got = drive(pauseRecoveryTrace(), false);
    expect(got.map((g) => g.cmd)).toEqual(["shiftToR"]);
    // and it arrives one HOLD window into the press that follows the lift,
    // i.e. it is LAW 1 firing correctly rather than some other path.
    const firstPressFrame = 30 + 20 + 20 + 120;
    expect(got[0].i).toBeGreaterThan(firstPressFrame);
    expect(got[0].i).toBeLessThan(firstPressFrame + 0.35 / DT + 2);
  });

  it("…and the lift really is what arms it — shorten it below LAW 1 and R is gone", () => {
    const f = pauseRecoveryTrace();
    // Replace the 2 s lift with one shorter than REVERSE_ASSIST_LIFT_S.
    const shortLift = Math.max(1, Math.floor((REVERSE_ASSIST_LIFT_S / DT) * 0.5));
    const trimmed = [...f.slice(0, 70), ...f.slice(70, 70 + shortLift), ...f.slice(190)];
    expect(drive(trimmed, false)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §4 — the other direction
// ---------------------------------------------------------------------------

describe("§4 a real student's gesture still reaches reverse", () => {
  it("stop, lift, press ↓ → R, and that same press drives the car backwards", () => {
    // The founder's gesture, at 60 Hz: rolling brake to rest, a deliberate
    // quarter-second lift, then a fresh press.
    const f: Frame[] = [];
    for (let i = 0; i < 30; i++) f.push({ kmh: 20 - i * 0.6, wantBrake: true });
    for (let i = 0; i < 30; i++) f.push({ kmh: 0, wantBrake: false }); // 0.5 s lifted
    for (let i = 0; i < 40; i++) f.push({ kmh: 0, wantBrake: true });
    const got = drive(f, false);
    expect(got.map((g) => g.cmd)).toEqual(["shiftToR"]);

    // …and LAW 2's scope: an ASSIST flip is not disowned, so the pedal the
    // student is standing on becomes the reverse accelerator on that one press
    // (founder ruling 2026-08-11, „thats automatic transmition"). Without this
    // half, "reverse is reachable" would be true and useless.
    const mapper = new ReversePedalMapper();
    const input = { throttle: 0, brake: 1, steer: 0, handbrake: false } as VehicleInput;
    mapper.apply(input, true, "assist");
    expect(input.throttle).toBe(1); // the S channel now accelerates backwards
    expect(mapper.isDisowned).toBe(false);

    // The hand-worked route stays guarded, which is the half that keeps the
    // 16.8 км/ч reverse-into-traffic unreachable.
    const hand = new ReversePedalMapper();
    const held = { throttle: 0, brake: 1, steer: 0, handbrake: false } as VehicleInput;
    hand.apply(held, true, "manual");
    expect(held.throttle).toBe(0);
    expect(held.brake).toBe(1);
    expect(hand.isDisowned).toBe(true);
  });
});
