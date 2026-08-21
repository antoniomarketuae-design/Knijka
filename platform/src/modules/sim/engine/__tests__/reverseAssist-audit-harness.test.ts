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
 * ===========================================================================
 * 2026-08-21 — THE INSTRUMENT WAS REPAIRED. READ THIS BEFORE §1–§4.
 * ===========================================================================
 * Everything below §1 describes `lesson-audit.mjs` AS IT WAS UNTIL
 * 2026-08-21, and it is kept because it is the account of why 19 reversing
 * lessons carry findings drawn from drives that never reversed. It is no
 * longer a description of the harness.
 *
 * The harness now has the deliberate gesture this file's own conclusion asked
 * for — „stop, lift for > REVERSE_ASSIST_LIFT_S, press — issued only where the
 * lesson asks for R". §5 asserts it, and §5 exists because the four sections
 * below went on passing WITHOUT NOTICING: they census the keyboard calls and
 * the `brake()` guard, and the repair adds neither a new key nor a loosened
 * guard. A file whose prose says „there is no route into R" while a route into
 * R exists, and whose assertions cannot tell, is the reassuring-direction
 * failure this whole programme is about — in the instrument that measures the
 * instrument.
 *
 * MEASURED THE DAY IT LANDED, sc-ed-reverse-line/mobile/right against a dev
 * server stamped 4611160afb1e:
 *   THE TASK ASKS FOR REVERSE («на заден ход») — the cluster reads «D». Arming R.
 *   REVERSE ARMED on attempt 1: the cluster reads «R».
 *   [04-t012s] 10 км/ч  gear=R
 *   ✓ Потегли с оглед…  ✓ Дръж права линия по средата на заден ход  ✓ Спри след 25 метра заден ход
 *   VERDICT: ИЗДЪРЖАН · 0 наказателни точки · 3 от 3 звезди
 * The same lane before the repair: D at every frame, one objective, НЕЗАВЪРШЕН.
 *
 * SO THE TWO FINDINGS §1 REFUTED ARE ADMISSIBLE AGAIN — not because they were
 * right, but because the instrument can now answer them either way, and a
 * refutation that rests on „no drive could have entered R" no longer rests on
 * anything. Re-drive sc-ed-reverse-line and sc-ed-poligon-chain before judging.
 *
 * ── the historical account ─────────────────────────────────────────────────
 * NEITHER HALF IS WHAT HAPPENED, and the third possibility is the instrument.
 * `tools/mobile/lesson-audit.mjs` had no route into R at all:
 *
 *   · the only keys it ever sent were KeyW, KeyS and Escape (§1; the wheel
 *     arrived 2026-08-21 and is §6). There is no
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
  it("sends no GEAR key — the pedals and the wheel are the whole keyboard", () => {
    const literal = [...SRC.matchAll(/keyboard(?:\.(?:down|up|press)|\[[^\]]*\])\("([^"]+)"/g)].map(
      (m) => m[1],
    );
    // Positive control first: a matcher that stopped matching would make the
    // set empty and every claim below vacuously true.
    expect(literal.length, "no keyboard calls found — the matcher is broken").toBeGreaterThan(3);
    // ── THIS TEST'S OWN CLAIM WAS TRUE AND STOPPED BEING TRUE — 2026-08-21 ──
    //
    // It read „sends only KeyW, KeyS and Escape" and it went on passing after
    // the harness gained a steering channel, because the wheel actuates through
    // `STEER_KEYS[dir]` — a variable — and this matcher only sees string
    // literals. A green test whose NAME is false is the reassuring-direction
    // failure this suite exists to catch, arriving inside the suite. The census
    // is therefore taken over BOTH forms, and what it pins is the thing that
    // actually matters here: there is no key that works the GEAR by hand.
    const viaConst = [...SRC.matchAll(/const STEER_KEYS = \{ left: "([^"]+)", right: "([^"]+)" \}/g)]
      .flatMap((m) => [m[1], m[2]]);
    expect(viaConst, "the steering channel is gone").toHaveLength(2);
    const all = [...new Set([...literal, ...viaConst])].sort();
    expect(all).toEqual(["Escape", "KeyA", "KeyD", "KeyS", "KeyW"]);
    // `[` and `]` are the cockpit's own gear keys (StatusDashboard's title says
    // so: „Скоростен лост ([ към P · ] към D)"). The harness must not have them:
    // its only route into R is the deliberate assist gesture, which §5 pins.
    expect(all).not.toContain("BracketLeft");
    expect(all).not.toContain("BracketRight");
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

// ---------------------------------------------------------------------------
// §5 — THE REPAIR, ASSERTED, so §1–§4 cannot go on passing over a dead claim
// ---------------------------------------------------------------------------
//
// Read out of the harness source for the same reason §1 is: the claim is about
// what that file DOES, and a claim about another file that nothing reads is
// the failure mode this suite was written to catch. Every assertion here goes
// RED if the deliberate reverse gesture is deleted, un-gated, or stops reading
// the cluster — which are the three ways it could quietly become decoration.

describe("§5 the harness has a deliberate, gated, cluster-asserted route into R", () => {
  it("presses the standstill brake through its OWN helper, never by weakening brake()", () => {
    // The refusal §1 pins must still be verbatim — this is not a loophole, it
    // is a second door with its own lock.
    expect(SRC).toMatch(/if \(on && kmh !== null && kmh >= 0 && kmh <= 1\)/);
    // …and the deliberate press exists, sends the same literal key (so §1's
    // census keeps seeing every keyboard call), and carries no speed gate.
    const helper = SRC.match(/const sChannel = async \(on\) => \{[\s\S]*?\n\};/);
    expect(helper, "the deliberate reverse press helper is gone").not.toBeNull();
    expect(helper![0]).toContain('"KeyS"');
    expect(helper![0]).not.toMatch(/kmh/);
  });

  it("arms R only where the PRODUCT asks for it — never on every lesson", () => {
    // The two mechanisms, verbatim from the product: deriveGearDemand's act
    // matcher (lessons/objectives.ts) and advisor.ts's parkInBay stem.
    expect(SRC).toContain("(?<![\\p{L}])на заден ход(?![\\p{L}])");
    expect(SRC).toContain("Премести лоста на R");
    // …and its companion exclusion, without which «позиция ЗА заден ход»
    // (sc-edpc-setup, a gate reached FACING FORWARD) would demand reverse and
    // refuse a correct drive.
    expect(SRC).toMatch(/REVERSE_DEMAND_PURPOSE_RE\s*=\s*\/за заден ход\//);
    // The arm is guarded on that demand and on a true standstill.
    const arm = SRC.match(/if \(\s*\n\s*phase !== "reverse",?[\s\S]*?\n\s*\) \{/);
    expect(arm, "the arm is no longer gated by a guarded if-block").not.toBeNull();
    expect(arm![0]).toContain("p.reverseWant !== null");
    expect(arm![0]).toContain("p.lawfulWait === null");
  });

  it("believes the CLUSTER and not its own keystrokes", () => {
    // StatusDashboard's handle, and `gearLabel` is `driveline.selector`.
    expect(SRC).toContain('[aria-label^="Скоростен лост: "]');
    const armFn = SRC.match(/async function armReverse\([\s\S]*?\n\}/);
    expect(armFn, "armReverse is gone").not.toBeNull();
    // The ONLY path that sets `armed` is the one that read an R off the glass.
    expect(armFn![0]).toMatch(/if \(g\[0\] === "R"\) \{\s*\n\s*reverse\.armed = true;/);
    // …AND NEITHER DOES ANY OTHER — 2026-08-21, restated.
    //
    // This used to assert `reverse.armed = true` appears EXACTLY ONCE, which
    // was a proxy for the real rule and stopped being true the moment the
    // harness learned to notice an R that arrives late (the toggle is a state
    // machine on the sim's clock and a CDP round trip is ~2 s, so „the answer
    // came after the last press" is the ordinary case — it is what produced
    // `05r-reverse-REFUSED.png` with R lit on the glass). Counting the sites
    // would now force a real fix to be reverted to keep a test green.
    //
    // The RULE is what is asserted instead: every single site that arms is
    // guarded by a letter read off the cluster. Write `reverse.armed = true`
    // anywhere without an `=== "R"` in front of it and this goes red.
    const armSites = [...SRC.matchAll(/reverse\.armed = true/g)];
    expect(armSites.length).toBeGreaterThan(0);
    for (const site of armSites) {
      const before = SRC.slice(Math.max(0, site.index! - 220), site.index!);
      expect(before, `an arm site with no cluster read in front of it:\n${before}`).toMatch(
        /\[0\] === "R"/,
      );
    }
  });

  it("does not LATCH a failed burst into a verdict on the whole session", () => {
    // THE BUG: the arm gate read `reverse.failure === null` and
    // `reverse.failure` was written by the first burst that ran out of presses.
    // On sc-park-bay-exit-rev/mobile/right that latch was thrown by three
    // presses that had ALREADY SUCCEEDED, and the drive graded ~190 s of a car
    // in R believing it was in D. There must be no single latching field left.
    expect(SRC).not.toMatch(/reverse\.failure\s*(\?\?=|=[^=])/);
    expect(SRC).toMatch(/failures: \[\]/);
    // Only a HARD block closes the gate, and it is a different field.
    const arm = SRC.match(/if \(\s*\n\s*phase !== "reverse",?[\s\S]*?\n\s*\) \{/);
    expect(arm![0]).toContain("reverse.blocked === null");
    expect(arm![0]).toMatch(/reverse\.attempted < REVERSE_ARM_BUDGET/);
    // …and the budget is bigger than one burst, or „retry" means nothing.
    const budget = SRC.match(/const REVERSE_ARM_BUDGET = (\d+);/);
    const attempts = SRC.match(/const REVERSE_ARM_ATTEMPTS = (\d+);/);
    expect(Number(budget![1])).toBeGreaterThan(Number(attempts![1]));
  });

  it("never names a frame REFUSED while the cluster reads R", () => {
    // The frame taken to PROVE the car never reached R had R lit on it. The
    // name is now decided by a cluster read taken immediately before the
    // shutter, and it carries the letter that read.
    expect(SRC).toMatch(/await shot\("05r-reverse-R-late"\)/);
    expect(SRC).toMatch(/await shot\(`05r-reverse-REFUSED-\$\{g\.replace\(/);
    // There must be no unqualified REFUSED frame left anywhere.
    expect(SRC).not.toMatch(/shot\("05r-reverse-REFUSED"\)/);
  });

  it("disarms afterwards, so the stop phase is not left with swapped pedals", () => {
    expect(SRC).toMatch(/async function disarmReverse\(\)/);
    // Rule b: in R the functional brake is the W channel, so the disarm works
    // `throttle()`. If this ever became `sChannel` the car would be handed the
    // accelerator at the moment it left R.
    const dis = SRC.match(/async function disarmReverse\(\)[\s\S]*?\n\}/);
    expect(dis![0]).toMatch(/await throttle\(true\); \/\/ …and press it again/);
    expect(dis![0]).toMatch(/reverse\.disarmed = true/);
  });

  /* ── §5b — AND THE WATCHDOG MAY NOT NAME A CULPRIT IT CANNOT SEE ──────────
   *
   * Round 2 added a watchdog for „the cluster reads R and this drive did not
   * arm it" and gave it a diagnosis: „The engine's own reverse assist has taken
   * the gate." That sentence blames the PRODUCT for something the HARNESS is at
   * least as likely to have done — `reverseAssist` arms R on a standstill brake
   * press, this harness presses the brake at every stop, `brake()` gates that
   * press on the speed the LAST probe read, and the CDP round trip was measured
   * at ~2.0 s median, so a press let through at 2 км/ч can land at rest. The
   * refusal bounds the harness's INTENT and cannot bound its EFFECT.
   *
   * A finding that names the wrong culprit is worse than no finding: it sends a
   * repair round at innocent code. These assertions pin the three attributions
   * and, more importantly, pin the fact that the middle one EXISTS — that the
   * harness is allowed to say it cannot tell instead of picking.
   *
   * WATCHED TO FAIL, 2026-08-21, by forcing the trigger on an ORDINARY lane
   * (sc-junction-scan/mobile/right, dev server 4611160afb1e) and varying only
   * the evidence. Same code, three sentences, three frame names:
   *   no S press yet     → "no-harness-gesture"  05r-R-no-harness-gesture.png
   *   1 S press at 20 км/ч → "undetermined"      05r-R-attribution-UNDETERMINED.png
   *   disarm reported false → "harness-disarm-failed"  05r-stuck-in-R.png
   */
  it("does not blame the engine for an R it cannot attribute", () => {
    // The old unconditional diagnosis must be gone as an ASSERTION. The phrase
    // may still appear in the prose that explains why it was wrong — what may
    // not survive is a `loud()` that states it as the cause.
    expect(SRC).not.toMatch(/AND THIS DRIVE DID NOT PUT IT THERE \(phase «\$\{phase\}»\)\. The engine's own/);
    // Three attributions, and the honest majority case is the middle one.
    expect(SRC).toMatch(/reverse\.unarmedRWho = disarmFailed \? "harness-disarm-failed" : last === null \? "no-harness-gesture" : "undetermined"/);
    expect(SRC).toMatch(/THIS HARNESS CANNOT TELL WHO PUT IT THERE/);
    expect(SRC).toMatch(/does not name a cause/);
    // …and it is read off EVIDENCE, which is published so a reader can disagree.
    expect(SRC).toMatch(/reverse\.unarmedREvidence = \{/);
    expect(SRC).toMatch(/^\s*unarmedRWho: null,$/m);
    expect(SRC).toMatch(/^\s*unarmedREvidence: null,$/m);
  });

  it("keeps the S presses that make that attribution possible", () => {
    // Without this list the watchdog has nothing to be honest WITH: „the
    // harness did not intend a standstill press" and „no standstill press
    // happened" are different statements and only the first is knowable.
    expect(SRC).toMatch(/const sPresses = \[\];/);
    const brakeHelper = SRC.match(/const brake = async \(on, kmh = null\) => \{[\s\S]*?\n\};/);
    expect(brakeHelper, "the brake helper is gone").not.toBeNull();
    expect(brakeHelper![0]).toMatch(/sPresses\.push\(\{ at: Date\.now\(\), kmhAtIssue: kmh, via: "brake" \}\)/);
    // The refusal it does NOT replace — intent is still bounded.
    expect(brakeHelper![0]).toMatch(/refusedReversePress \+= 1/);
    const sChannelHelper = SRC.match(/const sChannel = async \(on\) => \{[\s\S]*?\n\};/);
    expect(sChannelHelper![0]).toMatch(/sPresses\.push\(/);
  });

  /* ── §5c — AND IT MAY NOT EXONERATE ITSELF EITHER ─────────────────────────
   *
   * ADVERSARIAL RE-VERIFICATION OF THE ATTRIBUTION, 2026-08-21. §5b stopped the
   * watchdog naming the PRODUCT under uncertainty. It did not stop it making
   * three other unobserved claims, all of them about the HARNESS and all of
   * them in the direction that makes the instrument look clean — which is the
   * same reassuring direction, pointed at the other party.
   *
   * REPRODUCED by executing the shipping watchdog block — sliced out of
   * lesson-audit.mjs by brace-matching, not paraphrased — over a matrix of
   * records. The three defects, each printed verbatim by the code as it stood:
   *
   *  1. „This drive did not deliberately arm it" was UNCONDITIONAL. On a
   *     reversing lane the same block published `deliberatePresses: 8`,
   *     `lastSPressVia: "sChannel"` and `disarmed: true` one line above it. The
   *     sentence contradicted its own evidence, and it did so on exactly the 19
   *     lanes where the harness is the likeliest cause.
   *  2. `lastSPressKmhAtIssue === null` was rendered „a deliberate standstill
   *     press". `null` is TWO facts: `sChannel` keeps no speed by construction,
   *     and `brake(true)` with no argument keeps none because the refusal never
   *     judged it. Reading the second as the first turns a harness DEFECT into a
   *     harness INTENTION. `via` was already in the record; use it.
   *  3. The „~2.0 s of CDP latency" hedge was recited over a press of ANY age —
   *     measured printing it over one 170 s old, which the round trip does not
   *     reach. Asserting a mechanism nobody measured is the fault one level
   *     down, inside the repair for it.
   *
   * …and a fourth that is not a claim but a silence: `p.gear.includes("R")` has
   * no length test, so a cluster reading «D/R» — the ONE shape armReverse and
   * disarmReverse both refuse to believe — produced a full attribution with the
   * disagreement nowhere in it. The alarm stays (an R may be real); what
   * changed is that the reading now travels with it.
   */
  it("does not assert the drive was innocent of arming R either", () => {
    // The unconditional exoneration is gone AS AN ASSERTION — same rule §5b
    // set for the engine-blaming sentence: the phrase may survive in the prose
    // that explains why it was wrong, never in the string that is published.
    const published = SRC.match(/const ownGesture =[\s\S]*?await shot\(/);
    expect(published, "the watchdog's loud() block is gone").not.toBeNull();
    expect(published![0]).not.toMatch(/This drive did not deliberately arm it/);
    // …and what replaced it is READ off the count the same block publishes,
    // and the READING is what reaches the sentence. `> 0`, not `>= 0`: the
    // always-true form would accuse the harness on every lane instead.
    expect(SRC).toMatch(/standstillPresses > 0/);
    expect(published![0]).toMatch(/\$\{ownGesture\} it pressed S/);
    expect(SRC).toMatch(/THIS DRIVE DID ARM R DELIBERATELY ON THIS LANE/);
    expect(SRC).toMatch(/This drive made no deliberate arming press of its own, but/);
  });

  it("tells a deliberate press from an ungated one by `via`, never by the null speed", () => {
    // The conflation, verbatim, must not come back.
    expect(SRC).not.toMatch(/lastSPressKmhAtIssue === null \? "a deliberate standstill press"/);
    expect(SRC).toMatch(/ev\.lastSPressVia === "sChannel"/);
    // …and the third fact has its own words instead of borrowing the first's.
    expect(SRC).toMatch(/NO READING AT ALL/);
    // THE DISCRIMINATOR MUST REACH THE SENTENCE, not merely be computed beside
    // it — a value that is derived correctly and then not used is the shape the
    // count-agreement battery caught passing its own tests.
    const published = SRC.match(/const ownGesture =[\s\S]*?await shot\(/);
    expect(published![0]).toMatch(/gated on \$\{gateSaw\}/);
  });

  it("recites the latency hedge only where the latency reaches", () => {
    expect(SRC).toMatch(/const S_PRESS_NEAR_MS = \d+;/);
    expect(SRC).toMatch(/lastSPressNear: last === null \? null : now - last\.at <= S_PRESS_NEAR_MS/);
    // THE BRANCH ITSELF, and this line is why. The first draft of this test
    // asserted only the field and the two strings — and `const fit = true`
    // passed it, because both arms' words stay in the file while the code
    // recites one of them unconditionally. Watched RED under exactly that
    // mutation, 2026-08-21.
    expect(SRC).toMatch(/const fit = ev\.lastSPressNear\b/);
    // The hedge is now a branch, not a recital, and the other arm says so.
    expect(SRC).toMatch(/DOES NOT APPLY here/);
    expect(SRC).toMatch(/That still convicts nobody/);
  });

  it("carries the cluster reading, because includes(\"R\") hides a disagreement", () => {
    expect(SRC).toMatch(/cluster: gearLine\(p\.gear\)/);
    expect(SRC).toMatch(/clusterAmbiguous: p\.gear\.length > 1/);
    expect(SRC).toMatch(/AND THE CLUSTER ITSELF IS AMBIGUOUS/);
    expect(SRC).toMatch(/TWO OWNERS DISAGREE/);
    // …and it reaches the loud line rather than sitting in the status file.
    expect(SRC).toMatch(/point is admissible\.\$\{ambiguity\}/);
  });

  it("shouts, and writes it down, when a reversing lesson never reversed", () => {
    // The silence that produced this whole task: „never asked" and „asked and
    // never got it" must not be the same absence of a line again.
    expect(SRC).toMatch(/THIS LESSON ASKED FOR REVERSE/);
    expect(SRC).toMatch(/THIS RUN NEVER REVERSED ON A LESSON THAT ASKED FOR REVERSE/);
    expect(SRC).toMatch(/REVERSE: not demanded by this lesson at any sampled tick/);
    // …and the machine-readable half, which is what a re-drive queue reads.
    expect(SRC).toMatch(/saveStatus\(\{ reverse \}\)/);
    expect(SRC).toMatch(/^\s*reverse,$/m);
  });
});

// ---------------------------------------------------------------------------
// §6 — AND THE OTHER CONTROL THE HARNESS DID NOT HAVE: THE WHEEL
// ---------------------------------------------------------------------------
//
// §1 censused this file's keyboard calls and found KeyW, KeyS and Escape. It
// drew the right conclusion about REVERSE and missed the larger one standing
// next to it: the product takes steering from KeyA/ArrowLeft and
// KeyD/ArrowRight (`input.ts`: `const left = on("KeyA") || on("ArrowLeft")`),
// there is no auto-steer anywhere under `modules/sim`, and so EVERY drive this
// audit has ever taken — 376 in Wave C, and every drive behind the original
// 1,712 findings — was a car that could accelerate and brake and could not
// turn. That is the mechanism behind «the ego left the carriageway and stood
// still for 175 s» and behind a large share of the 92 of 145 lessons recorded
// as having no drivable success path.
//
// These assertions pin the CHANNEL and its accounting. They deliberately do
// NOT pin a driving line: the scripted traces still do not steer, because how
// a correct drive should steer is a design question owned by
// `devrig/driveScript.ts`, and a drive that steers badly manufactures
// confident wrong findings where one that cannot steer leaves honest silence.

describe("§6 the harness has a steering channel, and says so on every lane", () => {
  it("sends the keys the product actually reads", () => {
    expect(SRC).toMatch(/const STEER_KEYS = \{ left: "KeyA", right: "KeyD" \};/);
  });

  it("holds ONE direction at a time — both keys down is straight ahead, not a turn", () => {
    // `input.ts` computes `out.steer = (left ? 1 : 0) - (right ? 1 : 0)`, so a
    // harness holding both believes it is turning while the car goes straight —
    // the reverse bug's exact shape, in the other control. The helper releases
    // the opposite key BEFORE pressing the new one.
    // The signature grew a third argument on 2026-08-21 (`by`), which is the
    // liveness check's way of keeping its commands out of the trace's books.
    // The guard this test enforces is unchanged: release BEFORE press.
    const helper = SRC.match(/const steer = async \(dir, kmh = null, by = "trace"\) => \{[\s\S]*?\n\};/);
    expect(helper, "the steering helper is gone").not.toBeNull();
    expect(helper![0]).toMatch(/await page\.keyboard\.up\(STEER_KEYS\[steerHeld\]\)/);
    expect(helper![0]).toMatch(/await page\.keyboard\.down\(STEER_KEYS\[dir\]\)/);
    expect(helper![0].indexOf("keyboard.up")).toBeLessThan(helper![0].indexOf("keyboard.down"));
  });

  it("counts the steers that move the CAMERA and not the car", () => {
    // Measured on the live rig: at 0 км/ч a held steer key moves the world
    // ±5.3° and puts it back on release — `CameraRig`'s COCKPIT_LOOK_INTO_TURN
    // (0.09 rad = 5.16°), not a heading change. Those commands are inert, so
    // they are counted and named rather than refused.
    expect(SRC).toMatch(/const STEER_MIN_KMH = 2;/);
    expect(SRC).toMatch(/steering\.atStandstill \+= 1/);
  });

  it("comes off the wheel when a pause drain resynchronises the pedals", () => {
    const drain = SRC.match(/await page\.keyboard\.up\("KeyW"\)[\s\S]{0,900}?steerRelease\("pause drain"\)/);
    expect(drain, "a steer key can now survive a pause drain untracked").not.toBeNull();
  });

  it("publishes steering state on EVERY lane, demanded or not", () => {
    // The silence this closes: „this lesson never needed to steer" and „this
    // lesson needed to and the instrument could not" were the same nothing.
    expect(SRC).toMatch(/^\s*steering,$/m);
    expect(SRC).toMatch(/STEERING: \$\{steering\.everSteered/);
    expect(SRC).toMatch(/is therefore NOT a claim that steering was unnecessary/);
    // …and the place it actually bites: an uncredited objective on a drive that
    // could not turn is not evidence about the lesson in either direction.
    //
    // THE NOUN PHRASE MOVED ON 2026-08-21 AND THE GUARD GOT STRICTER, NOT
    // LOOSER. It read „on a drive that never turned the wheel", which was true
    // while nothing on the lane could turn it. The liveness check now turns the
    // wheel at the spawn mark on EVERY lane and publishes `channel.commands: 2`
    // — so that sentence had become a status file arguing with itself in the
    // loudest line on the lane, the same defect as the „0 trace commands"
    // beside `commands: 2` that round 3 fixed one line above it. Both halves
    // are pinned: the sentence that must be there, and the one that must not.
    expect(SRC).toMatch(/objective\(s\) went UNCREDITED on a drive whose scripted traces never turned the wheel/);
    expect(SRC).not.toMatch(/went UNCREDITED on a drive that never turned the wheel/);
  });

  it("proves the channel by measuring a HEADING change, never a keystroke", () => {
    expect(SRC).toMatch(/const STEER_PROOF = process\.env\.KNIJKA_STEER_PROOF === "1";/);
    const proof = SRC.match(/async function steerProof\(\)[\s\S]*?\n\}/);
    expect(proof, "the steering proof is gone").not.toBeNull();
    // The claim is signed and it is made on A→C (both ends with the key
    // released and the camera home), never on A→B, which is where the
    // look-into-turn offset lives.
    expect(proof![0]).toMatch(/KeyA turns the car LEFT/);
    expect(proof![0]).toMatch(/KeyD turns the car RIGHT/);
    expect(proof![0]).toMatch(/a standstill steer leaves the heading where it found it/);
    // And it never runs beside a scripted drive — a lane that steers badly is
    // worse than one that cannot steer.
    expect(SRC).toMatch(/if \(STEER_PROOF\) \{/);
    expect(SRC).toMatch(/phase: "steer-proof"/);
  });

  /* ── AND THE PROOF ABOVE RUNS IN A MODE NO WAVE RUNS ──────────────────────
   *
   * THE DEFECT THESE ASSERTIONS CLOSE, and it is this programme's own shape one
   * level up. `KNIJKA_STEER_PROOF=1` runs INSTEAD of the drive, so the channel
   * was proven in a mode nobody dispatches during a wave and left UNPROVEN in
   * the mode all 376 drives use — and on an ordinary lane a channel that had
   * been broken said NOTHING AT ALL. A capability that fails quietly is
   * indistinguishable from a capability that was never needed, which is the
   * exact conflation that hid the missing wheel behind 1,712 findings.
   *
   * MEASURED ON ORDINARY LANES, 2026-08-21, sc-junction-scan/mobile/right
   * against a dev server stamped 4611160afb1e — two runs differing only in
   * `STEER_KEYS`:
   *   KeyA/KeyD  left +154 px ≈ +5.3°   right −152 px ≈ −5.3°   → LIVE
   *   KeyJ/KeyL  left    0 px ≈  0.0°   right    0 px ≈  0.0°   → DEAD, refused
   * Reproduced to the pixel on a re-run (+154/−152) and on a second scenario
   * (sc-park-bay-exit-rev: +151/−151). ±5.3° is the product's own
   * COCKPIT_LOOK_INTO_TURN (0.09 rad = 5.16°) read off the photographs.
   */
  it("tests the channel on the ORDINARY drive path, not only in the opt-in mode", () => {
    expect(SRC).toMatch(/async function steerLiveness\(\)/);
    // Called on the drive path itself, and BEFORE the positive control — the
    // last instant at which the car is on the spawn mark with no pedal down.
    // A first draft called it after, measured „15 км/ч, throttle DOWN" and
    // correctly refused to run at all.
    const call = SRC.match(/await timed\("steer", steerLiveness\);[\s\S]{0,600}?POSITIVE CONTROL/);
    expect(call, "the liveness check no longer runs before the positive control").not.toBeNull();
    // It must NOT be gated on the proof mode.
    expect(SRC).not.toMatch(/if \(STEER_PROOF\)[\s\S]{0,200}steerLiveness/);
  });

  it("publishes THREE states, and never a silence", () => {
    // „steered and the world moved", „steered and NOTHING moved", and „never
    // turned the wheel" were one absence. They are three values now.
    expect(SRC).toMatch(/channel: \{\s*\n\s*state: "untested"/);
    expect(SRC).toMatch(/settle\(\s*"live",/);
    expect(SRC).toMatch(/settle\(\s*"dead",/);
    expect(SRC).toMatch(/settle\(\s*"untested",/);
    // …in the status file and in the log line, on every lane.
    expect(SRC).toMatch(/liveness \$\{chState\.toUpperCase\(\)\}/);
    expect(SRC).toMatch(/CHANNEL: \$\{chState\.toUpperCase\(\)\}/);
  });

  it("refuses in the same register as the tree-moved refusal when the wheel is dead", () => {
    // A drive whose wheel is dead cannot support ANY finding about position,
    // lane, turning or manoeuvre — the same shape as „the frames span two
    // states of the code and must NOT be used to certify a closure".
    expect(SRC).toMatch(/THE STEERING CHANNEL IS DEAD ON THIS DRIVE/);
    expect(SRC).toMatch(/keeping, turning, manoeuvring or „no drivable success path" is admissible: they describe the instrument/);
    expect(SRC).toMatch(/await shot\("03s-steer-DEAD"\)/);
    // …and „untested" is loud too: it is the state in which nobody knows.
    expect(SRC).toMatch(/THE STEERING CHANNEL WAS NOT TESTED ON THIS DRIVE/);
  });

  it("cannot report a frozen sim, or a non-cockpit camera, as a dead channel", () => {
    // Every way of declining to answer reports "untested". A check that cannot
    // run is not evidence that the channel is broken — that is this
    // programme's favourite bug pointed the other way.
    expect(SRC).toMatch(/ch\.legs\.some\(\(l\) => l\.identical\)/);
    expect(SRC).toMatch(/cam\.camera !== "cockpit"/);
    expect(SRC).toMatch(/moved <= 0 && steering\.channel\.state === "dead"/);
    expect(SRC).toMatch(/overruledBy = "positive-control"/);
  });

  /* ── §6b — AND THE THREE WAYS IT COULD STILL CONVICT A LIVE CHANNEL ───────
   *
   * Round 3's liveness check came back PARTIAL on adversarial verification:
   * every lane it was measured on was `mobile`, and three of its refusals could
   * fire on a channel that was working perfectly. A false refusal is as
   * damaging as a false certificate — it voids every position, lane and turning
   * finding on the lane, which is the same silence the check exists to end,
   * pointed the other way.
   */
  it("judges the LEAN, not the pixels, so the pc leg is held to the same test", () => {
    /* MEASURED 2026-08-21, the same gesture on both legs of the sweep:
     *   sc-junction-scan/mobile/right   +154 / −152 px   = ±5.3°
     *   sc-junction-scan/pc/right        +70 /  −69 px   = ±5.3°
     * Identical lean, different ruler — 682 CSS px at dpr 3 against 933 px at
     * dpr 1. A floor of 40 DEVICE PIXELS therefore meant 1.39° on the phone and
     * 3.04° on the desktop: 59 % of the product's whole ±5.16°
     * COCKPIT_LOOK_INTO_TURN, demanded of 196 of the 376 lanes before the
     * channel would be called live. The floor is an angle now, and the pixel
     * figure a verdict quotes is computed for the band it is judging.
     */
    expect(SRC).toMatch(/const LIVE_MIN_DEG = /);
    expect(SRC).toMatch(/Math\.abs\(px \* band\.degPerPx\) >= LIVE_MIN_DEG/);
    // The old device-pixel floor may not come back, in the code or in a verdict.
    expect(SRC).not.toMatch(/LIVE_MIN_PX/);
    expect(SRC).not.toMatch(/a live channel measured ~155 px on this same gesture/);
    // The sign test survives it: a cross-wired channel moves the world and must
    // still fail, which is the one thing a bare magnitude test cannot catch.
    expect(SRC).toMatch(/dir === "left" \? px > 0 : px < 0/);
  });

  it("does not convict on one leg, or die trying to photograph one", () => {
    // `every` meant a SINGLE failed correlation fell through to "dead" — a
    // conviction on half the evidence, and one of the errors it falls through
    // on is „the best match is at the ±600px search limit", i.e. the world moved
    // MORE than the window could measure. That is the loudest possible sign of a
    // LIVE channel, scored as a leg that did not move.
    expect(SRC).toMatch(/const failed = ch\.legs\.filter\(\(l\) => l\.error !== null\);/);
    expect(SRC).not.toMatch(/ch\.legs\.every\(\(l\) => l\.error !== null\)/);
    // …and `proofGrab` is a raw `page.screenshot`. On the opt-in proof path a
    // throw ended a lane that was only about the instrument; on the ordinary
    // drive path it reaches the crash guard and ends a LESSON lane before it has
    // driven a metre.
    expect(SRC).toMatch(/ch\.legs\.push\(await livenessLeg\(band, "left"\)\);/);
    expect(SRC).toMatch(/the check itself failed after/);
  });

  it("does not report a check that ran as a check that never applied", () => {
    /* `.audit-frames/r3/proof-check/_audit-status.json` — round 3's own artifact
     * — carries two measured legs (+154 px and −152 px, `moved: true`) directly
     * under a `why` reading „the drive-path liveness check never applied". The
     * proof branch overwrote a real reading with a claim that no reading
     * existed, and it would have erased a DEAD verdict exactly as happily. */
    expect(SRC).toMatch(/if \(steering\.channel\.legs\.length === 0\) \{/);
    expect(SRC).not.toMatch(/so the drive-path liveness check never applied/);
    expect(SRC).toMatch(/supersedes the reading/);
  });

  it("keeps the liveness books separate from the trace's", () => {
    // MEASURED: the first working run printed „0 trace commands" beside
    // `commands: 2` and `heldMs.left: 1129` on a lane whose traces never
    // touched the wheel — a status file arguing with itself, in the field a
    // reader would quote. `everSteered` still means THE TRACE steered.
    expect(SRC).toMatch(/if \(by === "trace"\) \{\s*\n\s*steering\.commands \+= 1;\s*\n\s*steering\.everSteered = true;/);
    expect(SRC).toMatch(/steering\.channel\.commands \+= 1;/);
    expect(SRC).toMatch(/steerHeldBy === "trace" \? steering\.heldMs : steering\.channel\.heldMs/);
  });
});

// ---------------------------------------------------------------------------
// §7 — THE LOG MUST NOT DROP A HUD SURFACE IN SILENCE
// ---------------------------------------------------------------------------
//
// `read()`'s HUD-string census skipped anything whose box was under 4 px and
// said nothing about it, so „the objective banner is in the DOM and is NOT on
// the glass" — a real fact about the phone shell, measured on every sampled
// frame of a drive — was indistinguishable from „the harness never looked".
// A `continue` is a silence, and every instrument bug in this programme has
// hidden in one.

describe("§7 the HUD census names what it drops", () => {
  it("tests VISIBILITY rather than the size of a box", () => {
    // `display: contents` and baseline-aligned inline boxes report a degenerate
    // rect while painting; the ancestor chain is the reason, not a proxy for it.
    expect(SRC).not.toMatch(/if \(r\.width < 4 \|\| r\.height < 4\) continue;/);
    const painted = SRC.match(/const painted = \(el\) => \{[\s\S]*?\n {4}\};/);
    expect(painted, "the visibility test is gone").not.toBeNull();
    expect(painted![0]).toMatch(/cs\.display === "none"/);
    expect(painted![0]).toMatch(/cs\.visibility === "hidden"/);
    expect(painted![0]).toMatch(/getClientRects\(\)/);
  });

  it("carries the dropped surfaces out of the page and prints them", () => {
    expect(SRC).toMatch(/unpainted\.push/);
    expect(SRC).toMatch(/^\s*unpainted,$/m);
    expect(SRC).toMatch(/NOT ON THE GLASS/);
  });

  it("reads the SELECTOR off its label and never off its box", () => {
    // On the cockpit camera `PlayAreaStyles` folds `[data-hud="speed-block"]`
    // away — the cabin's 3D cluster is showing the letter instead — so the
    // labelled span is 0 × 0 AND unpainted while a legible D is in the frame.
    // The attribute is still `driveline.selector`. A visibility test here would
    // answer „this car has no gear" about a car whose gear is photographed.
    const gearRead = SRC.match(/gear: \[\.\.\.\(document\.querySelector\("\[data-sim-shell\]"\)[\s\S]*?\.filter\(\(v, i, a\) => v && a\.indexOf\(v\) === i\),/);
    expect(gearRead, "the beat's gear read is gone").not.toBeNull();
    expect(gearRead![0]).not.toMatch(/getBoundingClientRect|painted\(/);
  });
});
