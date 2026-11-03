/**
 * ===========================================================================
 * THE BOTH-PEDALS DISARM READS THE THROTTLE AS OF ITS DECISION (R20 / R21,
 * 2026-11-01 round 6, sc-turn-left-oncoming:d0017a65).
 * ===========================================================================
 *
 * What failed. Since R5 the assist decides at the START of a frame
 * (LessonScene `reverseAssistFrameStart`, before the frame's physics reads),
 * and since R4 its brake is read from the functional brake's source-timed log —
 * current at that instant. Its throttle was not: the both-pedals disarm read
 * `rawThrottle`, which only `read()` writes, so at the frame's start it was the
 * PREVIOUS frame's last read. After a render stall that value is a whole stall
 * old. W held one frame before a 0.45 s stall read 0.02 (one frame of the
 * keyboard ramp, under PEDAL_ON), S pressed 0.05 s into the stall had reached
 * HOLD_S on its own key time by the first update after it, and the car shifted
 * to R with both pedals down — at 60 Hz and 144 Hz alike (merge verifier and
 * landing integrator, 2026-11-01; tools path-follow T6.7b (a) 19185 conditions,
 * (b) an armed press held 83 ms against the 35 ms bound).
 *
 * What this pins. Through the REAL GatedSimInput (time-stamped raw keyboard
 * events through SimInput's listeners), the REAL `reverseAssistFrameStart` and
 * the REAL ReverseAssist, in the product's frame order — the events handled
 * before the frame, the assist first, then the physics steps' reads, then the
 * render read — with a driveline stub that transcribes LessonScene's
 * subscription: W held and S pressed into a render stall of 0.3 / 0.45 / 0.5 /
 * 0.6 / 1.0 s at 30, 60, 144 Hz and 0.37 s frames leaves the gear in D, and no
 * update ever leaves a press ARMED while both pedals are down, so an armed
 * both-pedals press lasts 0 s — within PEDAL_ON × THROTTLE_ATTACK_S, the 35 ms
 * bound path-follow T6.7b ARM_POLL_MS derives (the ramp's time from W's key-down
 * to PEDAL_ON). The same stalls with S alone still shift to R and hand the
 * held S reverse throttle on that frame (the founder's 2026-08-11 gesture).
 *
 * ROUND 7 (R24 / R25, 2026-11-02). Round 6 gated the disarm's throttle by
 * LAW 2's disown — the LAST read()'s verdict, decided on the keyboard RAMP. So
 * in R holding W (its brake there), a hand-worked R → D shift with W held
 * (LAW 2 disowns W in D), then W up, S down after a real lift of 0.26–0.4 s and
 * W down again 0.01–0.1 s later, both held, still counted W as «disowned, a
 * brake» whenever no read had seen W's ramp fall to PEDAL_ON in between: the
 * press armed and shifted D → N → R with both keys down — 60 Hz with a
 * 0.15–0.3 s stall 20 of 20 phases, fixed 5 fps 13 of 20, 0.5 s frames 9
 * (round-6 verifier, F1; base 219ac1e 0). The last describe pins that path:
 * the disarm's control is the student's other pedal control as he holds it,
 * whatever LAW 2 says of it — and LAW 2 itself still hands physics zero
 * throttle from the disowned W.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GatedSimInput, reverseAssistFrameStart } from "@/components/sim/LessonScene";
import { browserStubs } from "@/components/sim/__tests__/overlayMount";
import { FIXED_DT } from "../../vehicle/tuning";
import { THROTTLE_ATTACK_S } from "../input";
import { REVERSE_ASSIST_HOLD_S, REVERSE_ASSIST_PEDAL_ON, ReverseAssist } from "../reverseAssist";

type Handler = (e: unknown) => void;
afterEach(() => vi.unstubAllGlobals());

/** The derived bound of path-follow T6.7b ARM_POLL_MS: W's ramp from key-down to PEDAL_ON. */
const ARM_BOUND_S = REVERSE_ASSIST_PEDAL_ON * THROTTLE_ATTACK_S;

interface KeyEvent {
  /** Wall time of the key event, s after the drive's start (its own timeStamp). */
  at: number;
  type: "keydown" | "keyup";
  code: "KeyW" | "KeyS";
}
/** A HAND-WORKED selector step at a frame instant (the [ / ] keys, the gear sheet): a «manual» flip for LAW 2. */
interface HandShift {
  at: number;
  type: "manual";
  dir: "up" | "down";
}

interface Run {
  /** When the assist emitted shiftToR (frame instant, s), or null. */
  rAt: number | null;
  /** …and the first shiftToD after it, or null. */
  dAt: number | null;
  /** The first shiftToD of the drive, after a shiftToR or not (a drive that starts in, or is hand-shifted to, R), or null. */
  firstDAt: number | null;
  /** The functional throttle handed to the FIRST physics step at or after the shift (at 144 Hz a frame may take
   *  no step: the accumulator carries it to the next frame). */
  thrOnShift: number;
  selector: "D" | "N" | "R";
  /** Updates after which both raw pedal channels were down AND the press was still armed. */
  armedWithBoth: number;
  /** The longest hold an armed press had reached while both pedals were down, s. */
  maxArmedBothHoldS: number;
  /** The largest throttle any physics read handed while LAW 2 disowned a pedal (it must be 0). */
  maxThrottleWhileDisowned: number;
  /** Physics reads made while LAW 2 disowned a pedal. */
  disownedReads: number;
}

/**
 * One drive: 1 s at rest in D with both pedals up, then the frames the caller
 * lays out. Events are handled at the first frame instant at or after their own
 * time, carrying that time as their timeStamp (a browser handles input before
 * the next animation frame).
 */
function drive(
  frames: number[],
  events: Array<KeyEvent | HandShift>,
  mutateFrameStart?: (input: GatedSimInput) => void,
  startSel: "D" | "R" = "D",
): Run {
  const handlers = new Map<string, Handler[]>();
  for (const [n, v] of Object.entries(
    browserStubs({
      addEventListener: (t: string, fn: Handler) => handlers.set(t, [...(handlers.get(t) ?? []), fn]),
      removeEventListener: (t: string, fn: Handler) =>
        handlers.set(t, (handlers.get(t) ?? []).filter((h) => h !== fn)),
    }),
  ))
    vi.stubGlobal(n, v);
  const fire = (type: string, code: string, tsMs: number) => {
    for (const h of handlers.get(type) ?? []) h({ code, key: "", repeat: false, timeStamp: tsMs, preventDefault: () => {} });
  };
  let tMs = 0;
  let stepCount = 0;
  const input = new GatedSimInput({}, () => tMs);
  input.stepClockS = () => stepCount * FIXED_DT;
  const assist = new ReverseAssist();
  const shifting = { current: false };
  const dl = {
    transmission: "automatic",
    engineOn: true,
    selector: startSel as "D" | "N" | "R",
    gearDown(): boolean {
      if (this.selector === "R") return false;
      this.selector = this.selector === "D" ? "N" : "R";
      sub();
      return true;
    },
    gearUp(): boolean {
      if (this.selector === "D") return false;
      this.selector = this.selector === "R" ? "N" : "D";
      sub();
      return true;
    },
  };
  // LessonScene's driveline subscription: a non-assist shift silences the
  // assist; the remap follows R with the route that changed it.
  const sub = () => {
    if (!shifting.current) assist.noteManualShift();
    const r = dl.selector === "R";
    if (r !== input.reversePedalRemap) input.reversePedalRemapSource = shifting.current ? "assist" : "manual";
    input.reversePedalRemap = r;
  };
  const pending = [...events].sort((a, b) => a.at - b.at);
  const run: Run = {
    rAt: null,
    dAt: null,
    firstDAt: null,
    thrOnShift: -1,
    selector: "D",
    armedWithBoth: 0,
    maxArmedBothHoldS: 0,
    maxThrottleWhileDisowned: 0,
    disownedReads: 0,
  };
  const ra = assist as unknown as { armed: boolean; holdS: number };
  if (startSel === "R") {
    input.reversePedalRemapSource = "manual";
    input.reversePedalRemap = true;
  }
  input.read();
  let t = 0;
  let acc = 0;
  for (const dt of frames) {
    t += dt;
    tMs = t * 1000;
    while (pending.length && pending[0]!.at <= t + 1e-12) {
      const e = pending.shift()!;
      if (e.type === "manual") {
        shifting.current = false;
        if (e.dir === "up") dl.gearUp();
        else dl.gearDown();
      } else fire(e.type, e.code, e.at * 1000);
    }
    mutateFrameStart?.(input);
    const cmd = reverseAssistFrameStart({
      assist,
      enabled: true,
      driveLocked: false,
      driveline: dl,
      input,
      speedKmh: 0,
      dtSec: Math.min(dt, 0.5),
      shifting,
    });
    if (input.brakeChannelDown && input.throttleChannelDown && ra.armed) {
      run.armedWithBoth += 1;
      run.maxArmedBothHoldS = Math.max(run.maxArmedBothHoldS, ra.holdS);
    }
    acc += Math.min(dt, 0.5);
    let n = 0;
    while (acc >= FIXED_DT - 1e-12) {
      acc -= FIXED_DT;
      n++;
    }
    if (cmd === "shiftToR" && run.rAt === null) run.rAt = t;
    if (cmd === "shiftToD" && run.rAt !== null && run.dAt === null) run.dAt = t;
    if (cmd === "shiftToD" && run.firstDAt === null) run.firstDAt = t;
    for (let i = 0; i < n; i++) {
      const thr = input.read().throttle;
      if (run.rAt !== null && run.thrOnShift < 0) run.thrOnShift = thr;
      if (input.reversePedalDisowned) {
        run.disownedReads += 1;
        run.maxThrottleWhileDisowned = Math.max(run.maxThrottleWhileDisowned, thr);
      }
      stepCount++;
    }
    input.read();
  }
  input.dispose();
  run.selector = dl.selector;
  return run;
}

/** The cadences R21 names: frame length, s. */
const CADENCES: Array<[string, number]> = [
  ["30Hz", 1 / 30],
  ["60Hz", 1 / 60],
  ["144Hz", 1 / 144],
  ["0.37s", 0.37],
];
const STALLS = [0.3, 0.45, 0.5, 0.6, 1.0];

/** 1 s at rest, `pre` more frames, the stall, then 2 s of frames; returns the frame list and the stall's start. */
function layout(f: number, stallS: number, pre = 1): { frames: number[]; stallStart: number } {
  const frames: number[] = [];
  let t = 0;
  while (t < 1 - 1e-9) {
    frames.push(f);
    t += f;
  }
  for (let i = 0; i < pre; i++) {
    frames.push(f);
    t += f;
  }
  const stallStart = t;
  frames.push(stallS);
  for (let k = 0; k < Math.ceil(2 / f); k++) frames.push(f);
  return { frames, stallStart };
}

type Case = (stallStart: number, f: number) => KeyEvent[];
const press = (at: number, code: KeyEvent["code"]): KeyEvent => ({ at, type: "keydown", code });
const release = (at: number, code: KeyEvent["code"]): KeyEvent => ({ at, type: "keyup", code });

/** W pressed just inside the frame before the stall (heard by it: one ramp frame), S 0.05 s into the stall. */
const W_THEN_S: Case = (s, f) => [press(s - f + 0.001, "KeyW"), press(s + 0.05, "KeyS")];
/** S 0.05 s into the stall, W 0.10 s into it: both held. */
const S_THEN_W: Case = (s) => [press(s + 0.05, "KeyS"), press(s + 0.1, "KeyW")];
/** W held from before the stall and lifted 0.10 s into it; S pressed 0.05 s into it — 0.05 s of both. */
const W_LIFTED_AFTER_S: Case = (s, f) => [press(s - f + 0.001, "KeyW"), press(s + 0.05, "KeyS"), release(s + 0.1, "KeyW")];
/** S 0.05 s into the stall; W tapped 0.10–0.15 s into it, never seen by any read. */
const W_TAPPED_IN_STALL: Case = (s) => [press(s + 0.05, "KeyS"), press(s + 0.1, "KeyW"), release(s + 0.15, "KeyW")];

function grid(c: Case, mutate?: (input: GatedSimInput) => void): { bad: string[]; armed: string[]; worstHoldS: number } {
  const bad: string[] = [];
  const armed: string[] = [];
  let worstHoldS = 0;
  for (const [name, f] of CADENCES)
    for (const stallS of STALLS) {
      const { frames, stallStart } = layout(f, stallS);
      const r = drive(frames, c(stallStart, f), mutate);
      if (r.rAt !== null || r.selector !== "D") bad.push(`${name} stall ${stallS}: R at ${r.rAt?.toFixed(3)}`);
      if (r.armedWithBoth > 0) armed.push(`${name} stall ${stallS}: armed with both down ×${r.armedWithBoth}`);
      worstHoldS = Math.max(worstHoldS, r.maxArmedBothHoldS);
    }
  return { bad, armed, worstHoldS };
}

describe("R21 — W held and S pressed into a render stall: the gear stays D (the throttle is read as of the decision)", () => {
  it("the bound is the one path-follow T6.7b ARM_POLL_MS derives: PEDAL_ON × THROTTLE_ATTACK_S = 35 ms", () => {
    expect(ARM_BOUND_S).toBeCloseTo(0.035, 12);
  });

  for (const [title, c] of [
    ["W pressed one frame before the stall, S 0.05 s into it (the merge verifier's shape)", W_THEN_S],
    ["S 0.05 s into the stall, W 0.10 s into it", S_THEN_W],
    ["W held, S pressed 0.05 s into the stall, W lifted 0.10 s into it (0.05 s of both, unseen by any read)", W_LIFTED_AFTER_S],
    ["S 0.05 s into the stall, W tapped 0.10–0.15 s into it (unseen by any read)", W_TAPPED_IN_STALL],
  ] as Array<[string, Case]>) {
    it(`${title}: never R, at 30 / 60 / 144 Hz and 0.37 s frames × stalls 0.3 / 0.45 / 0.5 / 0.6 / 1.0 s; no update leaves a press armed with both pedals down`, () => {
      const g = grid(c);
      expect(g.bad, `the gear went to R with both pedals down: ${g.bad.join(" | ")}`).toEqual([]);
      expect(g.armed, `a press stayed armed with both pedals down: ${g.armed.join(" | ")}`).toEqual([]);
      expect(g.worstHoldS, "an armed both-pedals press outlasted PEDAL_ON × THROTTLE_ATTACK_S").toBeLessThanOrEqual(ARM_BOUND_S);
    });
  }

  it("no stall: W held, then S — never R at any cadence", () => {
    const bad: string[] = [];
    for (const [name, f] of CADENCES) {
      const frames = Array.from({ length: Math.ceil(4 / f) }, () => f);
      const r = drive(frames, [press(1.2, "KeyW"), press(1.2 + f + 0.001, "KeyS")]);
      if (r.rAt !== null || r.armedWithBoth > 0) bad.push(`${name}: R at ${r.rAt} armed×${r.armedWithBoth}`);
    }
    expect(bad).toEqual([]);
  });

  it("the founder's gesture survives every stall: S ALONE pressed 0.05 s into it shifts to R once its own press reaches HOLD_S, and the held S is handed reverse throttle by the first physics step after it", () => {
    const bad: string[] = [];
    for (const [name, f] of CADENCES)
      for (const stallS of STALLS) {
        const { frames, stallStart } = layout(f, stallS);
        const sAt = stallStart + 0.05;
        const r = drive(frames, [press(sAt, "KeyS")]);
        const early = r.rAt !== null && r.rAt < sAt + REVERSE_ASSIST_HOLD_S - 1e-9;
        if (r.rAt === null || r.selector !== "R" || early || r.thrOnShift <= REVERSE_ASSIST_PEDAL_ON)
          bad.push(`${name} stall ${stallS}: R at ${r.rAt?.toFixed(3)} (S at ${sAt.toFixed(3)}), throttle at the next step ${r.thrOnShift.toFixed(2)}`);
      }
    expect(bad).toEqual([]);
  });
});

describe("R20 in R: the roles swap with the remap — W is the brake, S the throttle — and the disarm follows them", () => {
  /** The ruled gesture to R (S alone, held 1 s), S lifted; then at rest in R the caller's events. */
  const inR = (f: number, stallS: number, tail: (stallStart: number) => KeyEvent[]) => {
    const frames: number[] = [];
    for (let k = 0; k < Math.ceil(3 / f); k++) frames.push(f);
    const stallStart = frames.reduce((a, b) => a + b, 0);
    frames.push(stallS);
    for (let k = 0; k < Math.ceil(2 / f); k++) frames.push(f);
    return drive(frames, [press(1.0, "KeyS"), release(2.0, "KeyS"), ...tail(stallStart)]);
  };

  it("W ALONE pressed 0.05 s into a stall, at rest in R after a real lift, walks the gate back to D (rule c)", () => {
    const bad: string[] = [];
    for (const [name, f] of CADENCES)
      for (const stallS of STALLS) {
        const r = inR(f, stallS, (s0) => [press(s0 + 0.05, "KeyW")]);
        if (r.rAt === null || r.dAt === null || r.selector !== "D") bad.push(`${name} stall ${stallS}: R at ${r.rAt} D at ${r.dAt}`);
      }
    expect(bad, "the R-brake (W) gesture no longer reaches D").toEqual([]);
  });

  it("S (the R throttle) pressed before W and held: W pressed 0.05 s into a stall leaves the gear in R, and no update leaves the press armed with both down", () => {
    const bad: string[] = [];
    for (const [name, f] of CADENCES)
      for (const stallS of STALLS) {
        const r = inR(f, stallS, (s0) => [press(s0 - 0.001, "KeyS"), press(s0 + 0.05, "KeyW")]);
        if (r.rAt === null || r.dAt !== null || r.selector !== "R" || r.armedWithBoth > 0)
          bad.push(`${name} stall ${stallS}: R at ${r.rAt} D at ${r.dAt} armed×${r.armedWithBoth}`);
      }
    expect(bad, "both pedals down in R shifted the gear back to D").toEqual([]);
  });
});

describe("R24 / R25 — after a hand-worked R → D shift with W held, W lifted, S pressed after a real lift and W pressed again: two keys down is never the reverse gesture, whatever LAW 2 says of W", () => {
  /** The round-6 verifier's lifts L and re-press delays d (s). */
  const LD: Array<[number, number]> = [
    [0.26, 0.01],
    [0.27, 0.02],
    [0.3, 0.02],
    [0.3, 0.1],
    [0.4, 0.05],
  ];
  /** The fixed frame lengths R25 names. */
  const FIXED: Array<[string, number]> = [
    ["60Hz", 1 / 60],
    ["30Hz", 1 / 30],
    ["13fps", 1 / 13],
    ["10fps", 0.1],
    ["5fps", 0.2],
    ["4fps", 0.25],
    ["0.37s", 0.37],
    ["0.5s", 0.5],
  ];
  const PHASES = 20;
  /** In R holding W from 0.1 s, the hand-worked R → N → D at 1.0 s (W disowned in D), W up at t1, S down at t1 + L,
   *  and — unless `rePressW` is false — W down again at t1 + L + d; whatever is down stays held to the end. */
  const disownPath = (t1: number, L: number, d: number, rePressW = true): Array<KeyEvent | HandShift> => [
    press(0.1, "KeyW"),
    { at: 1.0, type: "manual", dir: "up" },
    { at: 1.0, type: "manual", dir: "up" },
    release(t1, "KeyW"),
    press(t1 + L, "KeyS"),
    ...(rePressW ? [press(t1 + L + d, "KeyW")] : []),
  ];
  /** A 1 ms first frame, then frames of `f` to `totalS` (the verifier's layout). */
  const fixedFrames = (f: number, totalS: number): number[] => {
    const out = [0.001];
    let t = 0.001;
    while (t < totalS) {
      out.push(f);
      t += f;
    }
    return out;
  };
  /** 60 Hz with one render stall of `stallS` starting at `at`. */
  const stalled60 = (totalS: number, at: number, stallS: number): number[] => {
    const f = 1 / 60;
    const out = [0.001];
    let t = 0.001;
    let done = false;
    while (t < totalS) {
      if (!done && t + f > at) {
        const dd = at + stallS - t;
        out.push(dd);
        t += dd;
        done = true;
        continue;
      }
      out.push(f);
      t += f;
    }
    return out;
  };
  const judge = (r: Run, label: string, bad: string[], armed: string[]): number => {
    if (r.rAt !== null || r.selector !== "D") bad.push(`${label}: R at ${r.rAt?.toFixed(3)} (sel ${r.selector})`);
    if (r.armedWithBoth > 0) armed.push(`${label}: armed with both down ×${r.armedWithBoth}`);
    return r.maxArmedBothHoldS;
  };

  it("fixed frames 60 / 30 / 13 / 10 / 5 / 4 fps, 0.37 s and 0.5 s × the five lifts × 20 phases: the gear stays D, and no update leaves the press armed with both keys down", () => {
    const bad: string[] = [];
    const armed: string[] = [];
    let worst = 0;
    for (const [name, f] of FIXED)
      for (const [L, d] of LD)
        for (let ph = 0; ph < PHASES; ph++) {
          const t1 = 4.0 + (ph * f) / PHASES;
          const r = drive(fixedFrames(f, t1 + L + 2.5), disownPath(t1, L, d), undefined, "R");
          worst = Math.max(worst, judge(r, `${name} lift ${L} W again +${d} phase ${ph}`, bad, armed));
        }
    expect(bad, `the car went to R with both keys down: ${bad.slice(0, 6).join(" | ")} (×${bad.length})`).toEqual([]);
    expect(armed, `a press stayed armed with both keys down: ${armed.slice(0, 6).join(" | ")}`).toEqual([]);
    expect(worst, "an armed both-keys press outlasted PEDAL_ON × THROTTLE_ATTACK_S").toBeLessThanOrEqual(ARM_BOUND_S);
  });

  it("60 Hz with one render stall of 0.1 / 0.15 / 0.2 / 0.3 / 0.5 s from 0.15 s after the release (lift 0.26 s, W again 0.01 s later) × 20 phases: the gear stays D, never armed with both down", () => {
    const bad: string[] = [];
    const armed: string[] = [];
    let worst = 0;
    for (const stallS of [0.1, 0.15, 0.2, 0.3, 0.5])
      for (let ph = 0; ph < PHASES; ph++) {
        const t1 = 4.0 + ph / 60 / PHASES;
        const r = drive(stalled60(t1 + 3, t1 + 0.15, stallS), disownPath(t1, 0.26, 0.01), undefined, "R");
        worst = Math.max(worst, judge(r, `60Hz stall ${stallS} phase ${ph}`, bad, armed));
      }
    expect(bad, `the car went to R with both keys down: ${bad.slice(0, 6).join(" | ")} (×${bad.length})`).toEqual([]);
    expect(armed, `a press stayed armed with both keys down: ${armed.slice(0, 6).join(" | ")}`).toEqual([]);
    expect(worst, "an armed both-keys press outlasted PEDAL_ON × THROTTLE_ATTACK_S").toBeLessThanOrEqual(ARM_BOUND_S);
  });

  it("the same flip, W lifted and pressed AGAIN ALONE after a real lift inside a render stall that hid its ramp's fall (no read saw W at or below PEDAL_ON, so LAW 2 still calls it disowned, a brake): the gear stays D — W is the throttle control whatever LAW 2 says of it", () => {
    const bad: string[] = [];
    const armed: string[] = [];
    for (const stallS of [0.3, 0.4, 0.5])
      for (const L of [0.26, 0.28, 0.3])
        for (let ph = 0; ph < PHASES; ph++) {
          const t1 = 4.0 + ph / 60 / PHASES;
          if (L >= stallS - 0.01) continue;
          const ev: Array<KeyEvent | HandShift> = [
            press(0.1, "KeyW"),
            { at: 1.0, type: "manual", dir: "up" },
            { at: 1.0, type: "manual", dir: "up" },
            release(t1, "KeyW"),
            press(t1 + L, "KeyW"),
          ];
          const r = drive(stalled60(t1 + 3, t1 + 0.005, stallS), ev, undefined, "R");
          if (r.rAt !== null || r.selector !== "D") bad.push(`stall ${stallS} lift ${L} phase ${ph}: R at ${r.rAt?.toFixed(3)}`);
          if (r.armedWithBoth > 0) armed.push(`stall ${stallS} lift ${L} phase ${ph}: armed ×${r.armedWithBoth}`);
        }
    expect(bad, `W alone shifted the car to R: ${bad.slice(0, 6).join(" | ")} (×${bad.length})`).toEqual([]);
    expect(armed).toEqual([]);
  });

  it("LAW 2 is untouched: while W is held through the hand-worked flip it is disowned and hands physics zero throttle", () => {
    const r = drive(
      fixedFrames(1 / 60, 3.5),
      [press(0.1, "KeyW"), { at: 1.0, type: "manual", dir: "up" }, { at: 1.0, type: "manual", dir: "up" }],
      undefined,
      "R",
    );
    expect(r.selector).toBe("D");
    expect(r.disownedReads, "W held through the R → D flip was never disowned").toBeGreaterThan(60);
    expect(r.maxThrottleWhileDisowned, "a disowned W drove the car").toBe(0);
  });

  it("…and the ruled gesture still works after it: W lifted, S ALONE pressed LIFT_S + 2 frames later and held: R, and the held S is handed reverse throttle (every fixed cadence × 20 phases)", () => {
    const bad: string[] = [];
    for (const [name, f] of FIXED)
      for (let ph = 0; ph < PHASES; ph++) {
        const t1 = 4.0 + (ph * f) / PHASES;
        const L = 0.25 + 2 * f + 0.005;
        const sAt = t1 + L;
        const r = drive(fixedFrames(f, sAt + REVERSE_ASSIST_HOLD_S + 4 * f + 1), disownPath(t1, L, 0, false), undefined, "R");
        const early = r.rAt !== null && r.rAt < sAt + REVERSE_ASSIST_HOLD_S - 1e-9;
        if (r.rAt === null || r.selector !== "R" || early || r.thrOnShift <= REVERSE_ASSIST_PEDAL_ON)
          bad.push(`${name} phase ${ph}: R at ${r.rAt?.toFixed(3)} (S at ${sAt.toFixed(3)}), throttle at the next step ${r.thrOnShift.toFixed(2)}`);
      }
    expect(bad, `the gesture after a disowned W no longer reverses the car: ${bad.slice(0, 6).join(" | ")}`).toEqual([]);
  });

  /** THE MIRROR (integration pin, 2026-11-02; the r7 verifier's VM1). In D holding S (its brake there), the hand-worked
   *  D → N → R at 1.0 s (LAW 2 disowns S in R, where S is the reverse accelerator), S up at t1, W (the brake in R)
   *  down at t1 + L and S down again at t1 + L + d; whatever is down stays held to the end. */
  const mirrorPath = (t1: number, L: number, d: number, rePressS = true): Array<KeyEvent | HandShift> => [
    press(0.1, "KeyS"),
    { at: 1.0, type: "manual", dir: "down" },
    { at: 1.0, type: "manual", dir: "down" },
    release(t1, "KeyS"),
    press(t1 + L, "KeyW"),
    ...(rePressS ? [press(t1 + L + d, "KeyS")] : []),
  ];

  it("THE MIRROR in R — after a hand-worked D → R shift with S held, S lifted, W pressed after a real lift and S pressed again, both held: the gear stays R at every fixed cadence and 60 Hz stall, and no update leaves the press armed with both keys down; W ALONE after the same flip still walks the gate to D", () => {
    const bad: string[] = [];
    const armed: string[] = [];
    let worst = 0;
    const judgeR = (r: Run, label: string) => {
      if (r.firstDAt !== null || r.selector !== "R") bad.push(`${label}: D at ${r.firstDAt?.toFixed(3)} (sel ${r.selector})`);
      if (r.armedWithBoth > 0) armed.push(`${label}: armed with both down ×${r.armedWithBoth}`);
      worst = Math.max(worst, r.maxArmedBothHoldS);
    };
    for (const [name, f] of FIXED)
      for (const [L, d] of LD)
        for (let ph = 0; ph < PHASES; ph++) {
          const t1 = 4.0 + (ph * f) / PHASES;
          judgeR(drive(fixedFrames(f, t1 + L + 2.5), mirrorPath(t1, L, d)), `${name} lift ${L} S again +${d} phase ${ph}`);
        }
    for (const stallS of [0.1, 0.15, 0.2, 0.3, 0.5, 1.0])
      for (const [L, d] of LD)
        for (let ph = 0; ph < PHASES; ph++) {
          const t1 = 4.0 + ph / 60 / PHASES;
          judgeR(drive(stalled60(t1 + 3.5, t1 + 0.15, stallS), mirrorPath(t1, L, d)), `60Hz stall ${stallS} lift ${L} S again +${d} phase ${ph}`);
        }
    expect(bad, `the car went R → D with both keys down: ${bad.slice(0, 6).join(" | ")} (×${bad.length})`).toEqual([]);
    expect(armed, `a press stayed armed with both keys down: ${armed.slice(0, 6).join(" | ")}`).toEqual([]);
    expect(worst, "an armed both-keys press outlasted PEDAL_ON × THROTTLE_ATTACK_S").toBeLessThanOrEqual(ARM_BOUND_S);
    // The positive control: the harness sees a shiftToD — W ALONE, LIFT_S + 2 frames after S's lift, held.
    const gone: string[] = [];
    for (const [name, f] of FIXED)
      for (let ph = 0; ph < 5; ph++) {
        const t1 = 4.0 + (ph * f) / 5;
        const L = 0.25 + 2 * f + 0.005;
        const wAt = t1 + L;
        const r = drive(fixedFrames(f, wAt + REVERSE_ASSIST_HOLD_S + 4 * f + 1), mirrorPath(t1, L, 0, false));
        if (r.firstDAt === null || r.selector !== "D" || r.firstDAt < wAt + REVERSE_ASSIST_HOLD_S - 1e-9)
          gone.push(`${name} phase ${ph}: D at ${r.firstDAt?.toFixed(3)} (W at ${wAt.toFixed(3)}, sel ${r.selector})`);
      }
    expect(gone, `W alone after a disowned S no longer walks the gate to D: ${gone.slice(0, 6).join(" | ")}`).toEqual([]);
  });
});
