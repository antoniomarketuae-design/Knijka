/**
 * ReverseAssist on EVERY frame length, through the scene's own input path —
 * sc-turn-left-oncoming:d0017a65 (triage 2026-10-17, rig-w3d's pulsed
 * standstill on the phone: gear 1 → −1 at rest, the car driven backwards by
 * the re-pressed brake).
 *
 * THE DEFECT, MEASURED AT 219ac1e. `ReverseAssist.update` ran once per render
 * frame on the frame's last `rawBrake` and credited the WHOLE frame delta to
 * the one state it sampled, the rising-edge frame included. So on a frame of
 * 0.25 s or longer one sample of a 0.05–0.24 s lift at rest armed LAW 1 and one
 * sample of the re-press counted 0.35 s of hold: D → N → R, labelled «assist»,
 * and the still-held brake became the reverse accelerator. Touch, a 0.12 s
 * lift: 0/40 R at 60/30/13/10/5 fps, 20/40 at 4 fps, 13/40 at 0.37 s frames,
 * 10/40 at 0.5 s.
 *
 * ROUND 1 (2026-10-18) credited the span between two updates that both saw a
 * state, and was refuted: a frame's reads see only its end state, so the rig's
 * 0.22 s on / 0.12 s off pulse still reached R on every frame from 0.26 to
 * 0.45 s, random pumping with every press and lift under 0.24 s reached R in
 * 460–627 of 960 drives, and the ruled gesture's shift landed a frame late —
 * the car stood in R under a press that ended before the next frame's reads.
 *
 * ROUND 2 (integrator rulings R4–R6, 2026-10-19), what this file pins:
 *  R4 — every brake transition is timed AT THE INPUT by the source that made
 *       it (touch: a press / release event's timeStamp; keyboard: the RAW
 *       key's; a gamepad: the poll, bounded by the poll before; the drive
 *       rig's step-keyed pad: the physics step it applies at), so a lift
 *       shorter than LIFT_S never arms and a press shorter than HOLD_S never
 *       shifts — on ANY frame length, jittered or stalling, for the three that
 *       stamp their own transitions (the gamepad is polled: its limit is
 *       pinned below);
 *  R5 — the assist decides at the START of the frame, before the frame's
 *       physics reads, so the ruled gesture (a lift of LIFT_S + 2 frames, then
 *       a press of HOLD_S + 2 frames) reaches R AND is handed reverse
 *       throttle on that press in 40 of 40 phases on every cadence.
 *
 * ROUND 3 (integrator rulings R7–R10, 2026-11-01): the phone's drive pad is
 * a joystick worked by SLIDING the thumb, and a slide reaches the page as a
 * frame-aligned, coalesced pointermove — one sample per frame unless the
 * handler reads getCoalescedEvents(). So the pad now applies every coalesced
 * sample at its own time (R7) and stamps a transition a sample makes as the
 * interval since the previous sample (R8); channel «slide» drives the REAL
 * TouchControls that way and carries the full R4 / R5 guarantee, and
 * «slideBare» (no getCoalescedEvents) is pinned as a polled source (R9).
 *
 * ROUND 4 (integrator rulings R11–R14, 2026-11-01): a digitizer sends a
 * sample only when a scan sees a change, so a thumb RESTING still sends
 * nothing, and round 3's interval (the previous sample) credited a real 0.3 s
 * lift ending in a rest ≈ 0 s — the ruled gesture slid with the thumb resting
 * 2 px inside the middle reached R in 9–10 of 40 phases (round-3 verifier F1).
 * The pad now learns the scan period P from its own coalesced lists and
 * bounds a crossing after silence by T − P (touch.ts PadSampleClock).
 * Channel «slideRest» is that thumb: samples only while it moves (1 px/ms),
 * resting 2 px inside the neutral side of the brake boundary, its 120 Hz
 * digitizer at a different phase in every phase of a sweep. It carries the
 * R4 guarantee and the ruled +2-frame gesture; the +1-frame cell is bounded by
 * one scan and is not a stop-rule target (integrator ruling on F3).
 *
 * WHAT A DISPLAY NOW NEEDS (stated as the brief asks): a lift of LIFT_S
 * (0.25 s) on every display — the true lift, a stall only shortening it — and a
 * press that lasts until the first frame that starts HOLD_S after it began:
 * HOLD_S + one frame is always enough (60 Hz 0.367 s, 0.37 s frames 0.72 s,
 * 0.5 s frames 0.85 s).
 *
 * THE DRIVE: the REAL GatedSimInput (LessonScene.tsx — SimInput's merge and
 * keyboard ramp, the touch source, ReversePedalMapper, the functional brake's
 * log), each timeline transition handed to its source with ITS OWN
 * timeStamp but heard only when the frame begins (the worst case: a main
 * thread so busy that every event of a frame waits for the next one),
 * then per frame the product's order: `reverseAssistFrameStart` (the scene's
 * own function — ReverseAssistDriver calls it before rapier's stepper), the
 * physics burst (one read per FIXED_DT step out of a clamped accumulator,
 * VehicleRig's before-step read), the render read. The driveline stub walks
 * D → N → R and transcribes LessonScene's driveline subscription (the remap
 * and its «assist» / «manual» source; a shift the assist did not make is
 * noted as manual).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { GatedSimInput, reverseAssistFrameStart } from "@/components/sim/LessonScene";
import { FIXED_DT } from "../../vehicle/tuning";
import { PedalEdgeLog, TimedPedal } from "../pedalTiming";
import {
  REVERSE_ASSIST_HOLD_S,
  REVERSE_ASSIST_LIFT_S,
  REVERSE_ASSIST_PEDAL_ON,
  REVERSE_ASSIST_STANDSTILL_KMH,
  ReverseAssist,
} from "../reverseAssist";
import { driveAxisFromPadY, TouchInputSource } from "../touch";
import { browserStubs, mountDrivePad, PAD_BRAKE_Y, PAD_MIDDLE_Y } from "@/components/sim/__tests__/overlayMount";

type Handler = (e: unknown) => void;
function stubWindow() {
  const handlers = new Map<string, Handler[]>();
  // …plus what TouchControls' effects touch (the slide channels mount it).
  for (const [name, value] of Object.entries(
    browserStubs({
      addEventListener: (type: string, fn: Handler) => handlers.set(type, [...(handlers.get(type) ?? []), fn]),
      removeEventListener: (type: string, fn: Handler) =>
        handlers.set(type, (handlers.get(type) ?? []).filter((h) => h !== fn)),
    }),
  ))
    vi.stubGlobal(name, value);
  return {
    fire(type: string, code: string, timeStamp: number) {
      for (const h of handlers.get(type) ?? []) h({ code, key: "", repeat: false, timeStamp, preventDefault: () => {} });
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

/** touch / keyboard: events with timeStamps; gamepad: a human's pad, seen only
 *  at polls; rig: the drive rig's step-keyed pad (`stepKeyed: true`).
 *  slide (round 3, R7 / R8): the phone's REAL drive pad (TouchControls, via
 *  overlayMount.ts) worked by SLIDING the thumb between the brake and the
 *  middle — one frame-aligned pointermove per frame carrying the frame's
 *  120 Hz digitizer samples in getCoalescedEvents(); slideBare: the same from a
 *  browser with no getCoalescedEvents (the event = the last sample — the R9
 *  limit, bounded like a gamepad).
 *  slideRest (round 4, R11): the same pad slid by a thumb that sends samples
 *  only while it MOVES — at REST_THUMB_PX_PER_MS, resting REST_GAP_PX inside
 *  the neutral side of the brake boundary or deep in the brake — on a 120 Hz
 *  digitizer whose phase differs per sweep phase.
 *  slideParent (round 4, R12): «slide» on a browser that gives every
 *  coalesced sample the PARENT event's timeStamp (the Pointer Events tests
 *  ask only that coalesced stamps never decrease). */
type Channel = "touch" | "keyboard" | "gamepad" | "rig" | "slide" | "slideBare" | "slideRest" | "slideParent";
const CHANNELS: readonly Channel[] = ["touch", "keyboard", "gamepad", "rig", "slide", "slideBare", "slideRest"];
/** The sources that STAMP their own transitions — the full guarantee. */
const STAMPED: readonly Channel[] = ["touch", "keyboard", "rig", "slide", "slideRest"];
/** The digitizer rate of the slide channels' samples, Hz. */
const DIGITIZER_HZ = 120;
/** slideRest: where the resting thumb waits, px inside the neutral side of
 *  the PEDAL_ON boundary (round-3 verifier F1's worst case, GAP 2). */
const REST_GAP_PX = 2;
/** slideRest: the thumb's speed while it slides, px per ms. */
const REST_THUMB_PX_PER_MS = 1;
/** px below the pad's middle where the brake crosses PEDAL_ON (bisected off
 *  the product's own driveAxisFromPadY). */
const BRAKE_BOUNDARY_DY = (() => {
  let lo = 0;
  let hi = PAD_BRAKE_Y - PAD_MIDDLE_Y;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (-driveAxisFromPadY(PAD_MIDDLE_Y + m, PAD_MIDDLE_Y) > REVERSE_ASSIST_PEDAL_ON) hi = m;
    else lo = m;
  }
  return hi;
})();

interface Timeline {
  /** Is the brake held at time t (wall time; for the rig, its step time)? */
  held: (t: number) => boolean;
  speedKmh: (t: number) => number;
  end: number;
  /** The transitions, in order (the first turns `held(0)` over). */
  edges: number[];
}

/** A timeline from its transitions; `startHeld` = the state at t = 0. */
function timeline(startHeld: boolean, edges: number[], end: number, speedKmh: (t: number) => number): Timeline {
  const held = (t: number) => {
    let s = startHeld;
    for (const e of edges) {
      if (t < e) break;
      s = !s;
    }
    return s;
  };
  return { held, speedKmh, end, edges };
}

const roll = (t: number) => (t < 3 ? 30 * (1 - t / 3) : 0);
const rest = () => 0;
function pulse(end: number, on = 0.22, off = 0.12): Timeline {
  const edges: number[] = [];
  for (let k = 0; k * (on + off) < end; k++) edges.push(k * (on + off) + on, (k + 1) * (on + off));
  return timeline(true, edges, end, rest);
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** After one ≥ 1 s lift at rest, every press and every lift in [lo, hi). */
function pumping(seed: number, lo: number, hi: number): Timeline {
  const r = rng(seed * 7919);
  const edges: number[] = [];
  let t = 1;
  while (t < 20) {
    t += lo + (hi - lo) * r();
    edges.push(t);
  }
  return timeline(false, edges, 20, rest);
}

type FrameGen = () => number;
const fixed = (f: number): FrameGen => () => f;
const NAMED: ReadonlyArray<readonly [string, number]> = [
  ["60Hz", 1 / 60],
  ["30Hz", 1 / 30],
  ["13fps", 1 / 13],
  ["10fps", 0.1],
  ["5fps", 0.2],
  ["4fps", 0.25],
  ["0.37s", 0.37],
  ["0.5s", 0.5],
];
/** Every fixed frame from 0.02 to 0.50 s in 0.03 s steps — the fine sweep. */
const FINE: number[] = Array.from({ length: 17 }, (_, i) => +(0.02 + 0.03 * i).toFixed(3));
const IRREGULAR: ReadonlyArray<readonly [string, (seed: number) => FrameGen]> = [
  ["jitter 0.1-0.5", (s) => { const r = rng(s); return () => 0.1 + 0.4 * r(); }],
  ["60Hz + 10% stalls 0.3-0.5", (s) => { const r = rng(s); return () => (r() < 0.1 ? 0.3 + 0.2 * r() : 1 / 60); }],
  ["phone 0.10-0.16 + 3% stalls to 3.45 s", (s) => { const r = rng(s); return () => (r() < 0.03 ? 0.3 + 3.15 * r() : 0.1 + 0.06 * r()); }],
];

interface Drive {
  rAt: number | null;
  /** Largest throttle the physics reads were handed in R while the press was held. */
  throttleOnThatPress: number;
}

/** `latencyS`: how long after its own time each touch / key event is
 *  dispatched (0 = heard at the first frame start at or after it). */
/** `digiPhase` (0..1): where the slideRest digitizer's scans fall inside its period. */
function drive(tl: Timeline, gen: FrameGen, firstT: number, ch: Channel, latencyS = 0, digiPhase = 0.5): Drive {
  const win = stubWindow();
  let tMs = 0;
  let stepCount = 0;
  // The pads: a human's (its trigger is wherever the timeline is at the poll's
  // wall instant) and the rig's (a function of the physics step being read).
  const brakeButton = {
    get value(): number {
      // The rig decides per physics step: step c carries the timeline at the
      // step's middle, so a lift of L s is ⌊L / FIXED_DT⌋ whole steps.
      if (ch === "rig") return tl.held((stepCount + 0.5) * FIXED_DT) ? 1 : 0;
      return tl.held(tMs / 1000) ? 1 : 0;
    },
    get pressed(): boolean {
      return this.value > 0.05;
    },
  };
  const idle = { value: 0, pressed: false };
  const pad = {
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => (i === 6 ? brakeButton : idle)),
    ...(ch === "rig" ? { stepKeyed: true } : {}),
  };
  if (ch === "gamepad" || ch === "rig") vi.stubGlobal("navigator", { getGamepads: () => [pad] });
  const input = new GatedSimInput({}, () => tMs);
  input.stepClockS = () => stepCount * FIXED_DT;
  const touch = new TouchInputSource();
  const sparse = ch === "slideRest";
  const sliding = ch === "slide" || ch === "slideBare" || ch === "slideParent" || sparse;
  if (ch === "touch" || sliding) input.attachTouch(touch);
  const drivePad = sliding ? mountDrivePad(touch) : null;
  // slideRest: the thumb crosses the boundary AT each transition, sliding at
  // REST_THUMB_PX_PER_MS from one rest to the other (brake / just inside the
  // middle), and is still between slides.
  const brakeDy = PAD_BRAKE_Y - PAD_MIDDLE_Y;
  const restDy = (held: boolean) => (held ? brakeDy : BRAKE_BOUNDARY_DY - REST_GAP_PX);
  const sparseDy = (t: number): number => {
    let best: number | null = null;
    let bestD = Infinity;
    let s = tl.held(0);
    for (const e of tl.edges) {
      s = !s;
      const ms = (t - e) * 1000;
      const lo = s ? -REST_GAP_PX / REST_THUMB_PX_PER_MS : -(brakeDy - BRAKE_BOUNDARY_DY) / REST_THUMB_PX_PER_MS;
      const hi = s ? (brakeDy - BRAKE_BOUNDARY_DY) / REST_THUMB_PX_PER_MS : REST_GAP_PX / REST_THUMB_PX_PER_MS;
      if (ms >= lo && ms <= hi && Math.abs(ms) < bestD) {
        bestD = Math.abs(ms);
        best = s ? BRAKE_BOUNDARY_DY + REST_THUMB_PX_PER_MS * ms : BRAKE_BOUNDARY_DY - REST_THUMB_PX_PER_MS * ms;
      }
    }
    return best ?? restDy(tl.held(t));
  };
  const padY = (t: number) => (sparse ? PAD_MIDDLE_Y + sparseDy(t) : tl.held(t) ? PAD_BRAKE_Y : PAD_MIDDLE_Y);
  let lastSparseY = padY(0);
  // The thumb lands on the pad at t = 0 (brake or middle), then slides.
  if (drivePad) drivePad.down({ clientY: padY(0), timeStamp: 0 });
  const assist = new ReverseAssist();
  const shifting = { current: false };
  const dl = {
    transmission: "automatic",
    engineOn: true,
    selector: "D" as "D" | "N" | "R",
    gearDown(): boolean {
      if (this.selector === "R") return false;
      this.selector = this.selector === "D" ? "N" : "R";
      subscription();
      return true;
    },
    gearUp(): boolean {
      if (this.selector === "D") return false;
      this.selector = this.selector === "R" ? "N" : "D";
      subscription();
      return true;
    },
  };
  // LessonScene's driveline subscription, transcribed.
  const subscription = () => {
    if (!shifting.current) assist.noteManualShift();
    const remap = dl.selector === "R";
    if (remap !== input.reversePedalRemap) input.reversePedalRemapSource = shifting.current ? "assist" : "manual";
    input.reversePedalRemap = remap;
  };
  let keyDown = false;
  // An input event is DISPATCHED when the main thread gets to it — here the
  // worst case, every event of a frame queued until that frame begins — but
  // carries its own timeStamp: `atMs` is when it happened, `handlerMs` when
  // the page hears it.
  const deliver = (on: boolean, atMs: number, handlerMs: number) => {
    tMs = handlerMs;
    if (ch === "touch") {
      if (on) touch.setBrake(1, atMs);
      else touch.releaseBrake(atMs);
    } else if (ch === "keyboard" && on !== keyDown) {
      keyDown = on;
      win.fire(on ? "keydown" : "keyup", "KeyS", atMs);
    }
  };
  const evented = ch === "touch" || ch === "keyboard";
  if (evented && tl.held(0)) deliver(true, 0, 0);
  tMs = 0;
  input.read();
  let ei = 0;
  let last = 0;
  let acc = 0;
  let t = firstT;
  let rAt: number | null = null;
  let thr = 0;
  const truthT = () => (ch === "rig" ? (stepCount + 0.5) * FIXED_DT : tMs / 1000);
  let speedSample = tl.speedKmh(0);
  const readAll = (n: number) => {
    for (let i = 0; i < n; i++) {
      const out = input.read();
      if (dl.selector === "R" && tl.held(truthT())) thr = Math.max(thr, out.throttle);
      stepCount++;
    }
  };
  let stopAt = Infinity;
  while (t <= Math.min(tl.end, stopAt)) {
    const dt = Math.min(t - last, 0.5);
    const previousFrame = last;
    last = t;
    if (drivePad) {
      // One coalesced move per frame, heard when the frame begins: every
      // digitizer sample since the previous frame, each at its own time.
      const samples: Array<{ clientY: number; timeStamp: number }> = [];
      const k0 = Math.floor(previousFrame * DIGITIZER_HZ + 1e-9);
      const k1 = Math.floor(t * DIGITIZER_HZ + 1e-9);
      if (sparse) {
        // A scan is sent only when it saw a change: a resting thumb is silent.
        const s0 = Math.floor(previousFrame * DIGITIZER_HZ - digiPhase + 1e-9);
        const s1 = Math.floor(t * DIGITIZER_HZ - digiPhase + 1e-9);
        for (let k = s0 + 1; k <= s1; k++) {
          const ts = (k + digiPhase) / DIGITIZER_HZ;
          if (ts <= 0) continue;
          const y = padY(ts);
          if (Math.abs(y - lastSparseY) > 1e-9) samples.push({ clientY: y, timeStamp: ts * 1000 });
          lastSparseY = y;
        }
      } else for (let k = k0 + 1; k <= k1; k++) samples.push({ clientY: padY(k / DIGITIZER_HZ), timeStamp: (k / DIGITIZER_HZ) * 1000 });
      if (sparse) {
        // (nothing sent this frame: the thumb was still)
      } else if (samples.length === 0) {
        const ts = Math.max(previousFrame, k1 / DIGITIZER_HZ);
        samples.push({ clientY: padY(ts), timeStamp: ts * 1000 });
      }
      tMs = t * 1000;
      if (ch === "slideParent") {
        const parent = samples[samples.length - 1]!.timeStamp;
        drivePad.move(samples.map((s) => ({ clientY: s.clientY, timeStamp: parent })));
      } else if (ch === "slide" || (sparse && samples.length > 0)) drivePad.move(samples);
      else if (!sparse) drivePad.move([samples[samples.length - 1]!], 1, "absent");
    }
    if (evented) {
      while (ei < tl.edges.length && tl.edges[ei]! + latencyS <= t) {
        deliver(ei % 2 === 0 ? !tl.held(0) : tl.held(0), tl.edges[ei]! * 1000, t * 1000);
        ei++;
      }
    }
    tMs = t * 1000;
    // THE PRODUCT'S ORDER: the assist's turn first (ReverseAssistDriver) …
    const cmd = reverseAssistFrameStart({
      assist,
      enabled: true,
      driveLocked: false,
      driveline: dl,
      input,
      speedKmh: speedSample,
      dtSec: dt,
      shifting,
    });
    if (cmd === "shiftToR" && rAt === null) {
      rAt = ch === "rig" ? stepCount * FIXED_DT : t;
      stopAt = t + 1;
    }
    // … then rapier's burst (VehicleRig's before-step read per step) …
    acc += dt;
    let n = 0;
    while (acc >= FIXED_DT - 1e-12) {
      acc -= FIXED_DT;
      n++;
    }
    readAll(n);
    // … then the render read (VehicleRig's useFrame), which takes no step.
    const out = input.read();
    if (dl.selector === "R" && tl.held(truthT())) thr = Math.max(thr, out.throttle);
    speedSample = tl.speedKmh(truthT());
    if (rAt !== null && !tl.held(truthT())) break;
    t += gen();
  }
  input.dispose();
  return { rAt, throttleOnThatPress: thr };
}

/** slideRest: a different digitizer phase in every sweep phase (golden-ratio
 *  steps, so 40 phases cover the scan period evenly). */
const digitizerPhase = (i: number) => (i * 0.6180339887 + 0.1) % 1;

/** R count over phases of a fixed frame, with the first R named. */
function sweep(tl: Timeline, ch: Channel, frames: readonly number[], phases: number) {
  const out: Record<string, number> = {};
  let example: string | null = null;
  for (const f of frames) {
    let r = 0;
    for (let p = 0; p < phases; p++) {
      const d = drive(tl, fixed(f), (p / phases) * f + 1e-4, ch, 0, digitizerPhase(p));
      if (d.rAt !== null) {
        r++;
        example ??= `${f.toFixed(3)} s frames, phase ${p}: R at ${d.rAt.toFixed(3)}`;
      }
    }
    out[f.toFixed(3)] = r;
  }
  return { out, example };
}
const allZero = (o: Record<string, number>) => Object.fromEntries(Object.keys(o).map((k) => [k, 0]));
const named = NAMED.map(([, f]) => f);

describe.each(STAMPED)("R4 — no short lift arms and no short press shifts, on any frame — %s", (ch) => {
  it("a brake held from a roll through the stop, 15 s, is never R (LAW 1)", () => {
    const tl = timeline(true, [], 18, roll);
    const { out, example } = sweep(tl, ch, [...named, ...FINE], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it.each([0.05, 0.12, 0.2, 0.24])("held from a roll, a %s s lift at rest, the brake re-pressed and held: never R", (lift) => {
    const tl = timeline(true, [6, 6 + lift], 13, roll);
    const { out, example } = sweep(tl, ch, [...named, ...FINE], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it.each([0.2, 0.3])("a %s s press at rest after a 2 s lift never shifts", (press) => {
    const tl = timeline(false, [2, 2 + press], 5, rest);
    const { out, example } = sweep(tl, ch, [...named, ...FINE], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it("the rig's standstill pulse (0.22 s on / 0.12 s off) is never R — the stop rule's own pulse", () => {
    const { out, example } = sweep(pulse(20), ch, [...named, ...FINE], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it("jittered frames, 60 Hz with stalls, a stalling phone: none of the timelines above is ever R", () => {
    const tls: Array<[string, Timeline]> = [
      ["held from a roll", timeline(true, [], 18, roll)],
      ["lift 0.12", timeline(true, [6, 6.12], 13, roll)],
      ["lift 0.24", timeline(true, [6, 6.24], 13, roll)],
      ["press 0.3 after 2 s", timeline(false, [2, 2.3], 5, rest)],
      ["rig pulse 60 s", pulse(60)],
    ];
    const rs: string[] = [];
    for (const [label, mk] of IRREGULAR) {
      for (const [name, tl] of tls) {
        for (let s = 1; s <= 12; s++) {
          const g = mk(s * 104729);
          const d = drive(tl, g, g(), ch, 0, digitizerPhase(s));
          if (d.rAt !== null) rs.push(`${label} · ${name} · seed ${s}: R at ${d.rAt.toFixed(2)}`);
        }
      }
    }
    expect(rs).toEqual([]);
  });

  it("random pumping at rest, every press and every lift under 0.24 s after one ≥ 1 s lift: never R", () => {
    const rs: string[] = [];
    for (const [lo, hi] of [[0.03, 0.12], [0.05, 0.24], [0.1, 0.24]] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const tl = pumping(seed, lo, hi);
        for (const f of [1 / 60, 0.1, 0.25, 0.37, 0.5]) {
          for (let p = 0; p < 4; p++) {
            const d = drive(tl, fixed(f), (p / 4) * f + 1e-4, ch, 0, digitizerPhase(p + seed));
            if (d.rAt !== null) rs.push(`[${lo},${hi}) seed ${seed} f ${f.toFixed(3)} phase ${p}: R at ${d.rAt.toFixed(2)}`);
          }
        }
      }
    }
    expect(rs).toEqual([]);
  });
});

/**
 * NEAR THE THRESHOLDS — the verifier's round-2 probe (r2-slide-near-out.txt):
 * with the coalesced samples applied but each stamped at its own sample only,
 * a 0.245 / 0.249 s slide lift armed in 980 of 980 sweeps, because the press
 * that ends it was stamped at the first sample after the crossing. Lifts and
 * presses a few ms short of LIFT_S / HOLD_S, for the sources whose
 * transitions are wall-clock events (the rig's are whole physics steps: a
 * 0.249 s lift is 15 steps = 0.25 s on its own clock).
 */
describe.each(["touch", "keyboard", "slide"] as const)("R4 near the thresholds — a lift or a press a few ms short never arms or shifts — %s", (ch) => {
  it.each([0.245, 0.249])("held from a roll, a %s s lift at rest, then a 1 s press: never R", (lift) => {
    const tl = timeline(true, [6, 6 + lift, 7.2 + lift], 9, roll);
    const { out, example } = sweep(tl, ch, [...named, ...FINE], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it.each([0.345, 0.349])("a %s s press at rest after a 2 s lift never shifts", (press) => {
    const tl = timeline(false, [2, 2 + press], 5, rest);
    const { out, example } = sweep(tl, ch, [...named, ...FINE], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });
});

describe.each(CHANNELS)("R5 — the ruled gesture (founder 2026-08-11) still takes R AND moves the car on that ONE press — %s", (ch) => {
  it("a lift of LIFT_S + 2 frames, then a press of HOLD_S + 2 frames: R and reverse throttle on that press, 40 of 40 phases, every cadence", () => {
    const res: Record<string, string> = {};
    const want: Record<string, string> = {};
    for (const [name, f] of NAMED) {
      const lift = REVERSE_ASSIST_LIFT_S + 2 * f + 0.005;
      const press = REVERSE_ASSIST_HOLD_S + 2 * f + 0.005;
      const tl = timeline(true, [4, 4 + lift, 4 + lift + press], 4 + lift + press + 0.5, roll);
      let r = 0;
      let moving = 0;
      let early = 0;
      for (let p = 0; p < 40; p++) {
        const d = drive(tl, fixed(f), (p / 40) * f + 1e-4, ch, 0, digitizerPhase(p));
        if (d.rAt === null) continue;
        r++;
        // The car moves on that press: full reverse throttle — except for the
        // resting slide, whose thumb is still sliding home at the press's two
        // ends (48 ms each at 1 px/ms), so at 60 Hz the frame of the shift can
        // fall in the release slide: there any reverse throttle on that press
        // (past PEDAL_ON, which a held press always is) is the car moving.
        const full = ch === "slideRest" ? REVERSE_ASSIST_PEDAL_ON : 0.999;
        if (d.throttleOnThatPress >= full) moving++;
        // never before the press has lasted HOLD_S (on the source's own clock)
        // (the rig's press begins on a whole step: up to half a step sooner)
        if (d.rAt < 4 + lift + REVERSE_ASSIST_HOLD_S - (ch === "rig" ? FIXED_DT : 1e-6)) early++;
      }
      res[name] = `R ${r}/40, moving ${moving}/40, early ${early}`;
      want[name] = "R 40/40, moving 40/40, early 0";
    }
    expect(res).toEqual(want);
  });
});

/** The +1-frame cell, for the sources whose transitions are seen when they
 *  happen. A resting slide is seen up to one digitizer scan late (the
 *  integrator ruling on the round-3 F3: bounded by one sample, not a stop-rule
 *  target) — its ruled gesture is the +2-frame one, in the block above. */
describe.each(STAMPED.filter((c) => c !== "slideRest"))("what a press needs — HOLD_S + ONE frame is enough for a source that stamps its transitions — %s", (ch) => {
  it("a lift of LIFT_S + 1 frame, then a press of HOLD_S + 1 frame: R and reverse throttle on that press, 40 of 40, every cadence", () => {
    const res: Record<string, string> = {};
    const want: Record<string, string> = {};
    for (const [name, f] of NAMED) {
      const lift = REVERSE_ASSIST_LIFT_S + f + 0.005;
      const press = REVERSE_ASSIST_HOLD_S + f + 0.005;
      const tl = timeline(true, [4, 4 + lift, 4 + lift + press], 4 + lift + press + 0.5, roll);
      let r = 0;
      let moving = 0;
      for (let p = 0; p < 40; p++) {
        const d = drive(tl, fixed(f), (p / 40) * f + 1e-4, ch, 0, digitizerPhase(p));
        if (d.rAt === null) continue;
        r++;
        if (d.throttleOnThatPress >= 0.999) moving++;
      }
      res[name] = `R ${r}/40, moving ${moving}/40`;
      want[name] = "R 40/40, moving 40/40";
    }
    expect(res).toEqual(want);
  });
});

/**
 * R12 — A BROWSER THAT STAMPS EVERY COALESCED SAMPLE WITH THE PARENT'S TIME.
 * Round-3 verifier F2: on such a browser a later sample of the list was given
 * the exact interval [T, T], which over-credits the lift before it by up to a
 * frame — lifts of 0.05–0.249 s at rest armed the assist (NAMED 15 / 40 / 67 /
 * 102 bad, NEARHOLD 405–482). A stamp that does not advance is now bounded by
 * the last EARLIER distinct stamp, and such a list never teaches P. The ruled
 * gesture still works: the dense slide's crossings are bounded by the frame.
 */
describe("R12 — coalesced samples that all carry the parent event's stamp — slideParent", () => {
  it.each([0.05, 0.12, 0.2, 0.24, 0.245, 0.249])("held from a roll, a %s s lift at rest, then a 1 s press: never R", (lift) => {
    const tl = timeline(true, [6, 6 + lift, 7.2 + lift], 9, roll);
    const { out, example } = sweep(tl, "slideParent", [...named, ...FINE], 10);
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it("a lift of LIFT_S + 2 frames, then a press of HOLD_S + 2 frames: R and reverse throttle on that press, 40 of 40, every cadence", () => {
    const res: Record<string, string> = {};
    const want: Record<string, string> = {};
    for (const [name, f] of NAMED) {
      const lift = REVERSE_ASSIST_LIFT_S + 2 * f + 0.005;
      const press = REVERSE_ASSIST_HOLD_S + 2 * f + 0.005;
      const tl = timeline(true, [4, 4 + lift, 4 + lift + press], 4 + lift + press + 0.5, roll);
      let r = 0;
      let moving = 0;
      for (let p = 0; p < 40; p++) {
        const d = drive(tl, fixed(f), (p / 40) * f + 1e-4, "slideParent");
        if (d.rAt === null) continue;
        r++;
        if (d.throttleOnThatPress >= 0.999) moving++;
      }
      res[name] = `R ${r}/40, moving ${moving}/40`;
      want[name] = "R 40/40, moving 40/40";
    }
    expect(res).toEqual(want);
  });
});

/**
 * THE STATED LIMIT — a human's gamepad is a POLLED device. The browser hands
 * the page the pad's state at each poll (once per frame) and nothing about the
 * time between, so a lift and a re-press both made between two polls are
 * invisible, and a trigger pumped near the frame period can show «up» at two
 * polls in a row with a press unseen between them — one long lift to anything
 * that reads the pad. No rule over polls can tell the two apart. What IS true,
 * and pinned here: a single lift or press is never credited more than the
 * polls prove (the lift from the poll that saw the release to the poll BEFORE
 * the one that saw the press; the press from the poll that saw it, the pads
 * polled again at the frame's start), so any one short lift or press never
 * arms or shifts on any frame; frames shorter than the pumping's shortest
 * phase never alias it; and the ruled gesture works on every cadence (R5
 * block). The drive rig's pad is NOT this: it is step-keyed and stamped at the
 * step (the full guarantee, above).
 *
 * THE SAME LIMIT, round 3 (R9): the phone's drive pad worked by SLIDING on a
 * browser with no getCoalescedEvents hands the page one sample per frame —
 * the event's own, the last — so it is polled too. The interval stamp (R8)
 * keeps each transition between the sample before and the sample that saw it,
 * which is exactly a poll's bound, and the same three things hold. Where the
 * list exists (channel «slide») every digitizer sample is applied and the
 * full guarantee holds (the R4 block above).
 */
describe.each(["gamepad", "slideBare"] as const)("R4 for a polled source (a human's gamepad; the drive pad slid on a browser with no getCoalescedEvents) — the guarantee of a polled device — %s", (ch) => {
  it("held from a roll, one short lift (0.05–0.24 s) at rest, one short press (0.2 / 0.3 s): never R, on any frame", () => {
    const tls: Timeline[] = [
      timeline(true, [], 18, roll),
      ...[0.05, 0.12, 0.2, 0.24].map((l) => timeline(true, [6, 6 + l], 13, roll)),
      timeline(false, [2, 2.2], 5, rest),
      timeline(false, [2, 2.3], 5, rest),
    ];
    for (const tl of tls) {
      const { out, example } = sweep(tl, ch, [...named, ...FINE], 20);
      expect(out, example ?? "").toEqual(allZero(out));
    }
  });

  it("the standstill pulse on frames shorter than its 0.12 s off phase: never R", () => {
    const { out, example } = sweep(pulse(20), ch, [1 / 60, 1 / 30, 1 / 13, 0.1, 0.11], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it("…and on 0.37 s frames the pulse aliases into one long lift and one long press at the polls — the limit, executed so it cannot be forgotten", () => {
    const { out } = sweep(pulse(20), ch, [0.37], 20);
    expect(out["0.370"]).toBeGreaterThan(0);
  });
});

/**
 * THE OTHER STATED LIMIT — DISPATCH LATENCY (found in round 3 on the round-2
 * verifier's probe, «NEARHOLD latency»; identical on the round-2 tree). A
 * press is credited up to the update that steps the machine, on the evidence
 * the page has: no release dispatched yet. A release the browser has stamped
 * but not yet dispatched when a frame begins is not known, so a press that
 * ended within that dispatch latency of HOLD_S can still be shifted — on the
 * first frame after its release, never later than the latency allows. No
 * rule over dispatched events can see an undispatched one; a margin on the
 * hold would be a change to REVERSE_ASSIST_HOLD_S, which is not this lane's.
 * Executed so it cannot be forgotten, and bounded: with no latency it never
 * happens; with 25 ms it lands at most 25 ms + one frame after the release.
 */
describe.each(["touch", "keyboard"] as const)("the dispatch-latency limit — a press within the latency of HOLD_S — %s", (ch) => {
  const press = 0.345;
  const tl = timeline(false, [2, 2 + press], 5, rest);
  it("events heard by the frame that follows them: a 0.345 s press never shifts", () => {
    const { out, example } = sweep(tl, ch, [1 / 60, 1 / 30, 0.1], 20);
    expect(out, example ?? "").toEqual(allZero(out));
  });
  it("its release dispatched 25 ms late: the shift can land, only within 25 ms + one frame of the release", () => {
    const late: string[] = [];
    let r = 0;
    for (const f of [1 / 60, 1 / 30, 0.1]) {
      for (let p = 0; p < 20; p++) {
        const d = drive(tl, fixed(f), (p / 20) * f + 1e-4, ch, 0.025);
        if (d.rAt === null) continue;
        r++;
        if (d.rAt > 2 + press + 0.025 + f + 1e-6) late.push(`${f.toFixed(3)} s frames, phase ${p}: R at ${d.rAt.toFixed(3)}`);
      }
    }
    expect(r, "the limit is real: some phase shifts").toBeGreaterThan(0);
    expect(late).toEqual([]);
  });
});

describe("the conservative bounds — a gamepad poll and a stall never lengthen a span", () => {
  it("an event dispatched after a read, stamped before it: the press counts from the later, the lift ends at its own time", () => {
    const win = stubWindow();
    let tMs = 0;
    const input = new GatedSimInput({}, () => tMs);
    tMs = 500;
    input.read(); // a read at 500 ms…
    tMs = 520;
    win.fire("keydown", "KeyS", 450); // …then a key that went down at 450 ms
    const { edges } = input.brakeLog.since(0);
    input.dispose();
    expect(edges).toHaveLength(1);
    expect(edges[0]!.down).toBe(true);
    expect(edges[0]!.earliestMs).toBe(450); // the lift before it ends at 450, not later
    expect(edges[0]!.atMs).toBeGreaterThanOrEqual(500); // the press counts from no earlier than the read
  });

  it("a polled pad: a 0.24 s lift seen across two polls is credited at most what the polls prove", () => {
    // Polls 0.37 s apart. The release is seen by the poll at 470 ms, the
    // press by the poll at 840 ms: all the polls PROVE is that the pedal was up
    // at 470 and that the press came after it — so the lift is credited from
    // the poll that saw the release to the poll BEFORE the one that saw the
    // press: 0 s, however long it really was.
    const p = new TimedPedal();
    const log = new PedalEdgeLog();
    let nowMs = 0;
    const step = (dt: number) => p.step({ dtSec: dt, stopped: true, sampledDown: false, timing: { log, nowMs } });
    log.push({ down: true, atMs: 0, earliestMs: 0 });
    nowMs = 100;
    step(0.1);
    // released, seen by a poll at 470 (the poll before was at 100)
    log.push({ down: false, atMs: 470, earliestMs: 100 });
    nowMs = 470;
    step(0.37);
    // pressed again, seen by a poll at 840 (the poll before at 470)
    log.push({ down: true, atMs: 840, earliestMs: 470 });
    nowMs = 840;
    step(0.37);
    expect(p.pressedThisUpdate).toBe(true);
    expect(p.pressLiftS).toBe(0); // press.earliest (470) − release.at (470)
  });

  it("a stall credits at most the clamped 0.5 s, and only to the edges inside it", () => {
    const p = new TimedPedal();
    const log = new PedalEdgeLog();
    let nowMs = 0;
    const step = (dt: number) => p.step({ dtSec: dt, stopped: true, sampledDown: false, timing: { log, nowMs } });
    nowMs = 100;
    step(0.1);
    // a 0.4 s lift inside a 3 s stall, 1 s and 1.4 s after the stall began
    log.push({ down: true, atMs: 150, earliestMs: 150 });
    log.push({ down: false, atMs: 1100, earliestMs: 1100 });
    log.push({ down: true, atMs: 1500, earliestMs: 1500 });
    nowMs = 3100;
    step(0.5);
    // both ends lie more than 0.5 s before the update: both placed at its start
    expect(p.pressLiftS).toBe(0);
  });

  it("a pause steps nothing, so a press held through it accrues nothing", () => {
    const ra = new ReverseAssist();
    const log = new PedalEdgeLog();
    let nowMs = 0;
    const frame = (dt: number) =>
      ra.update({ speedKmh: 0, selector: "D", brakePedal: 0, throttlePedal: 0, dtSec: dt, brakeTiming: { log, nowMs } });
    for (let i = 1; i <= 30; i++) {
      nowMs = i * 1000 / 60;
      expect(frame(1 / 60)).toBeNull(); // 0.5 s lifted at rest
    }
    log.push({ down: true, atMs: nowMs + 1, earliestMs: nowMs + 1 }); // press
    for (let i = 1; i <= 6; i++) {
      nowMs += 1000 / 60;
      expect(frame(1 / 60)).toBeNull(); // 0.1 s held
    }
    nowMs += 10_000; // a 10 s pause: the scene does not step the assist
    const held: number[] = [];
    let at: number | null = null;
    for (let i = 1; i <= 30 && at === null; i++) {
      nowMs += 1000 / 60;
      if (frame(1 / 60) !== null) at = i;
      held.push(ra.holdS);
    }
    // 0.1 s before + the resumed frame's credited delta: the shift comes only
    // once 0.35 s of STEPPED time has passed (≈ 15 frames after the pause).
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(14);
  });
});

describe("without a log the machine is a polled source polled by its own updates (round 1's observed span, kept as the degenerate case)", () => {
  const frame = (o: { brake: number; dt: number }) => ({ speedKmh: 0, selector: "D" as const, brakePedal: o.brake, throttlePedal: 0, dtSec: o.dt });

  it("one 0.5 s frame of a lifted pedal arms nothing: a lift seen once is a lift of 0 s", () => {
    const ra = new ReverseAssist();
    ra.update(frame({ brake: 1, dt: 0.5 }));
    ra.update(frame({ brake: 0, dt: 0.5 }));
    for (let i = 0; i < 6; i++) expect(ra.update(frame({ brake: 1, dt: 0.5 }))).toBeNull();
  });

  it("the rising-edge frame credits no hold: an armed press seen once does not shift", () => {
    const ra = new ReverseAssist();
    for (let i = 0; i < 4; i++) ra.update(frame({ brake: 0, dt: 0.5 }));
    expect(ra.update(frame({ brake: 1, dt: 0.5 }))).toBeNull();
    expect(ra.holdS).toBe(0);
    expect(ra.update(frame({ brake: 1, dt: 0.5 }))).toBe("shiftToR");
  });

  it("tools read `holdS` and `armed` off the machine (tools/mobile/lib/disarm-sim.mjs): a number and a boolean", () => {
    const ra = new ReverseAssist();
    for (let i = 0; i < 20; i++) ra.update(frame({ brake: 0, dt: 1 / 60 }));
    ra.update(frame({ brake: 1, dt: 1 / 60 }));
    ra.update(frame({ brake: 1, dt: 1 / 60 }));
    expect(typeof ra.holdS).toBe("number");
    expect(ra.holdS).toBeCloseTo(1 / 60, 9);
    expect((ra as unknown as { armed: unknown }).armed).toBe(true);
  });
});

describe("the standstill the lift needs is the one OBSERVED", () => {
  it("a lift that begins while the car still rolls counts only from the first update that saw it stopped", () => {
    const ra = new ReverseAssist();
    const log = new PedalEdgeLog();
    let nowMs = 0;
    const frame = (speed: number) =>
      ra.update({ speedKmh: speed, selector: "D", brakePedal: 0, throttlePedal: 0, dtSec: 0.1, brakeTiming: { log, nowMs } });
    nowMs = 100;
    frame(5);
    log.push({ down: false, atMs: 150, earliestMs: 150 }); // (already up: a no-op edge)
    log.push({ down: true, atMs: 160, earliestMs: 160 });
    log.push({ down: false, atMs: 170, earliestMs: 170 }); // lifted while rolling at 5 km/h
    nowMs = 200;
    frame(5);
    nowMs = 300;
    frame(0); // first update that sees the standstill
    log.push({ down: true, atMs: 520, earliestMs: 520 }); // 0.35 s after the lift began, 0.22 s after the standstill was seen
    nowMs = 600;
    frame(0);
    expect(ra.liftS).toBe(0);
    expect((ra as unknown as { armed: boolean }).armed).toBe(false);
    expect(REVERSE_ASSIST_STANDSTILL_KMH).toBe(0.6);
  });
});

/**
 * R15 / R19 (round 5, 2026-11-01) — WHY NO T − P BOUND IS TAKEN RIGHT AFTER A
 * POINTERDOWN, pinned at the system level. The thumb comes OFF the brake
 * (pointerup: the release, exact), is put back down just inside the neutral
 * side of the brake boundary, rests, and SLIDES into the brake. A platform's
 * touch slop may hold back a touch's first moves (here: every move within
 * SLOP_PX of the pointerdown), so the first move it delivers is already past
 * the boundary and late; were the press stamped [T − P, T] there, the held-back
 * moves would be credited as lift, and lifts the student held shorter than
 * LIFT_S would arm (the round-4 verifier's model of that cure under an 8 px
 * slop: lifts of 0.24–0.2495 s armed in 245–980 of 980 sweeps at 0.5 px/ms).
 * The exemption keeps the press stamped from the pointerdown, so such a lift
 * is credited only pointerdown − pointerup. The integrator KEPT it (R15) until
 * the phone shows whether it holds a touch's first moves back; its cost — the
 * ruled gesture made this way is under-credited and may not reach R, even
 * with P learned — is a stated limit (ADR-017 «Update 2026-11-01, round 5»).
 * A change that drops the exemption without that device fact fails here.
 * And (R17 b) a thumb put back down INSIDE the brake zone makes the press
 * with the pointerdown itself: exact, both ways.
 */
const SLOP_PX = 8;
interface RetouchDrive {
  liftS: number;
  pressS: number;
  /** Put back down inside the brake zone (the pointerdown is the press). */
  downInBrake: boolean;
  /** How long after the lift-off the thumb is put back down (neutral case). */
  retouchS: number;
  gapPx: number;
  vPxPerMs: number;
  slopPx: number;
}
function retouchDrive(o: RetouchDrive, frame: number, firstT: number, digiPhase: number): Drive {
  stubWindow();
  let tMs = 0;
  const input = new GatedSimInput({}, () => tMs);
  const touch = new TouchInputSource();
  input.attachTouch(touch);
  const drivePad = mountDrivePad(touch);
  const upT = 6;
  const pressT = upT + o.liftS;
  const relT = pressT + o.pressS;
  const downT = o.downInBrake ? pressT : upT + o.retouchS;
  const end = relT + 0.5;
  const held = (t: number) => t < upT || (t >= pressT && t < relT);
  const brakeDy = PAD_BRAKE_Y - PAD_MIDDLE_Y;
  const restDy = BRAKE_BOUNDARY_DY - o.gapPx;
  const downDy = o.downInBrake ? brakeDy : restDy;
  // After a re-touch in neutral: resting at restDy, crossing PEDAL_ON at
  // pressT on the way in and at relT on the way out, at vPxPerMs, resting
  // in the brake in between.
  const slidDy = (t: number) => {
    const ms = (t - pressT) * 1000;
    const msOut = (t - relT) * 1000;
    const dy = Math.min(BRAKE_BOUNDARY_DY + o.vPxPerMs * ms, BRAKE_BOUNDARY_DY - o.vPxPerMs * msOut);
    return Math.max(restDy, Math.min(brakeDy, dy));
  };
  // P = one 120 Hz scan, learned beforehand from one neutral slide whose
  // coalesced list held two samples; then the brake held from the roll.
  drivePad.down({ clientY: PAD_MIDDLE_Y, timeStamp: 0 });
  drivePad.move([
    { clientY: PAD_MIDDLE_Y + 1, timeStamp: 1 },
    { clientY: PAD_MIDDLE_Y + 2, timeStamp: 1 + 1000 / DIGITIZER_HZ },
  ]);
  drivePad.up({ clientY: PAD_MIDDLE_Y + 2, timeStamp: 10 });
  drivePad.down({ clientY: PAD_BRAKE_Y, timeStamp: 11 });
  input.read();
  const assist = new ReverseAssist();
  const shifting = { current: false };
  const dl = {
    transmission: "automatic",
    engineOn: true,
    selector: "D" as "D" | "N" | "R",
    gearDown(): boolean {
      if (this.selector === "R") return false;
      this.selector = this.selector === "D" ? "N" : "R";
      subscription();
      return true;
    },
    gearUp(): boolean {
      if (this.selector === "D") return false;
      this.selector = this.selector === "R" ? "N" : "D";
      subscription();
      return true;
    },
  };
  // LessonScene's driveline subscription, transcribed (as in `drive`).
  const subscription = () => {
    if (!shifting.current) assist.noteManualShift();
    const remap = dl.selector === "R";
    if (remap !== input.reversePedalRemap) input.reversePedalRemapSource = shifting.current ? "assist" : "manual";
    input.reversePedalRemap = remap;
  };
  let upDone = false;
  let downDone = false;
  let releaseDone = false;
  let slopOut = false;
  let lastDy = downDy;
  let k = 1;
  const scanAt = (i: number) => (i + digiPhase) / DIGITIZER_HZ;
  let last = 0;
  let acc = 0;
  let t = firstT;
  let rAt: number | null = null;
  let thr = 0;
  let speedSample = roll(0);
  while (t <= end) {
    const dt = Math.min(t - last, 0.5);
    last = t;
    tMs = t * 1000;
    // Every event of the frame, heard when it begins, in time order: the
    // lift-off, the re-touch, one coalesced move per run of digitizer samples
    // (a scan is sent only when it saw a change, and not while the slop holds
    // the touch's first moves back), and in the brake case the pointerup that
    // ends the press.
    let run: Array<{ clientY: number; timeStamp: number }> = [];
    const flush = () => {
      if (run.length > 0) drivePad.move(run);
      run = [];
    };
    const scansBefore = (atS: number) => {
      while (scanAt(k) < atS && scanAt(k) <= t) {
        const ts = scanAt(k++);
        if (!downDone || o.downInBrake || ts <= downT) continue;
        const dy = slidDy(ts);
        if (o.slopPx > 0 && !slopOut) {
          if (Math.abs(dy - downDy) <= o.slopPx) {
            lastDy = dy;
            continue;
          }
          slopOut = true;
        }
        if (Math.abs(dy - lastDy) > 1e-9) run.push({ clientY: PAD_MIDDLE_Y + dy, timeStamp: ts * 1000 });
        lastDy = dy;
      }
    };
    if (!upDone && upT <= t) {
      scansBefore(upT);
      flush();
      drivePad.up({ clientY: PAD_BRAKE_Y, timeStamp: upT * 1000 });
      upDone = true;
    }
    if (upDone && !downDone && downT <= t) {
      scansBefore(downT);
      flush();
      drivePad.down({ clientY: PAD_MIDDLE_Y + downDy, timeStamp: downT * 1000 });
      downDone = true;
    }
    if (o.downInBrake && downDone && !releaseDone && relT <= t) {
      drivePad.up({ clientY: PAD_BRAKE_Y, timeStamp: relT * 1000 });
      releaseDone = true;
    }
    scansBefore(Infinity);
    flush();
    tMs = t * 1000;
    // THE PRODUCT'S ORDER: the assist first, then the physics reads, then the
    // render read.
    const cmd = reverseAssistFrameStart({
      assist,
      enabled: true,
      driveLocked: false,
      driveline: dl,
      input,
      speedKmh: speedSample,
      dtSec: dt,
      shifting,
    });
    if (cmd === "shiftToR" && rAt === null) rAt = t;
    acc += dt;
    let n = 0;
    while (acc >= FIXED_DT - 1e-12) {
      acc -= FIXED_DT;
      n++;
    }
    for (let i = 0; i <= n; i++) {
      const out = input.read();
      if (dl.selector === "R" && held(t)) thr = Math.max(thr, out.throttle);
    }
    speedSample = roll(t);
    if (rAt !== null && !held(t)) break;
    t += frame;
  }
  input.dispose();
  return { rAt, throttleOnThatPress: thr };
}

describe("R15 / R19 — the pointerdown exemption is KEPT: a lift-off, a re-touch in neutral under touch slop, a slide in", () => {
  it.each([
    [0.5, 0.24],
    [0.5, 0.245],
    [0.5, 0.249],
    [1, 0.249],
  ])("at %s px/ms, a %s s lift made by lifting the thumb off, re-touching 2 px inside the neutral side and sliding in under an 8 px slop, with P learned: never arms", (v, lift) => {
    const out: Record<string, number> = {};
    let example: string | null = null;
    for (const f of [...named, ...FINE]) {
      let r = 0;
      for (let p = 0; p < 20; p++) {
        const d = retouchDrive(
          { liftS: lift, pressS: 1, downInBrake: false, retouchS: 0.02, gapPx: 2, vPxPerMs: v, slopPx: SLOP_PX },
          f,
          (p / 20) * f + 1e-4,
          digitizerPhase(p),
        );
        if (d.rAt !== null) {
          r++;
          example ??= `${f.toFixed(3)} s frames, phase ${p}: R at ${d.rAt.toFixed(3)}`;
        }
      }
      out[f.toFixed(3)] = r;
    }
    expect(out, example ?? "").toEqual(allZero(out));
  });

  it("R17 b: put back down INSIDE the brake zone, the pointerdown is the press and exact — a 0.249 s lift never arms, and the ruled gesture (LIFT_S + 2 frames, HOLD_S + 2 frames) takes R and moves the car on that press, 40 of 40, every cadence", () => {
    const res: Record<string, string> = {};
    const want: Record<string, string> = {};
    for (const [name, f] of NAMED) {
      let short = 0;
      let r = 0;
      let moving = 0;
      for (let p = 0; p < 40; p++) {
        const first = (p / 40) * f + 1e-4;
        const base = { downInBrake: true, retouchS: 0, gapPx: 2, vPxPerMs: 1, slopPx: SLOP_PX };
        if (retouchDrive({ ...base, liftS: 0.249, pressS: 1 }, f, first, digitizerPhase(p)).rAt !== null) short++;
        const lift = REVERSE_ASSIST_LIFT_S + 2 * f + 0.005;
        const press = REVERSE_ASSIST_HOLD_S + 2 * f + 0.005;
        const d = retouchDrive({ ...base, liftS: lift, pressS: press }, f, first, digitizerPhase(p));
        if (d.rAt === null) continue;
        r++;
        if (d.throttleOnThatPress >= 0.999) moving++;
      }
      res[name] = `0.249 s lift R ${short}/40; gesture R ${r}/40, moving ${moving}/40`;
      want[name] = "0.249 s lift R 0/40; gesture R 40/40, moving 40/40";
    }
    expect(res).toEqual(want);
  });
});
