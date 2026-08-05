/**
 * THE DRIVE RIG — DOM half. Dev builds only (mounted from /dev/drive-rig).
 *
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------
 * Until now the two login-free harnesses each held HALF of what a review row
 * needs and neither held both:
 *   /dev/gw-shell    — the real LessonPlayShell, so the fault cards render;
 *                      publishes NO position and NO speed.
 *   /dev/ghost-demo  — publishes `window.__ghostDemo`; mounts a bare
 *                      LessonScene, so no fault card exists to photograph.
 * So „was that conviction correct?" was unanswerable: you could see the CARD or
 * the car's STATE, never both at the same instant. Row B15 died on exactly
 * that, and row B29 needs a frame that no route could produce at all.
 *
 * This module is the missing instrument. It rides the real shell (cards and
 * all) and publishes, PER TICK: position, heading, speed, the objective state,
 * and every rule event / HUD card / teach moment with its code and timestamp —
 * into a RING BUFFER, so a capture script reads the WHOLE DRIVE afterwards
 * instead of whatever the last frame happened to hold.
 *
 * It also DRIVES. `window.__driveRig.run([...])` runs the closed-loop
 * controller in `driveScript.ts` through a synthetic standard-mapping gamepad,
 * which is a real SimInput channel (`SimInput.mergeGamepad`) — so the injected
 * pedals pass through the same pre-drive gate, the same difficulty shaping and
 * the same recorder as a human's, and nothing in the sim knows the difference.
 *
 * NOT SHIPPED: /dev/drive-rig calls notFound() under NODE_ENV=production, and
 * nothing outside that route imports this file.
 */

import type { SimTick } from "../rules";
import type { LessonStepResult } from "../lessons";
import {
  createDriveScript,
  currentStep,
  stepDriveScript,
  stepLabel,
  type DriveCommand,
  type DriveScriptState,
  type DriveStep,
  type DriveStepLogEntry,
} from "./driveScript";

/** Bumped whenever the published shape changes, so a stale script fails loudly. */
export const DRIVE_RIG_VERSION = 1;
/** Default ring-buffer depth: ~5.5 minutes of drive at 60 Hz. */
export const DEFAULT_BUFFER = 20_000;

/** One frame of the drive, as the shell saw it. */
export interface DriveRigSample {
  /** Session seconds (SimTick.t) — the clock every rule event is stamped in. */
  tSec: number;
  /** Wall clock (ms since the rig armed) — GAPS HERE MEAN THE SIM WAS PAUSED
   *  (a teach card / quiz / consequence overlay stops onTick entirely). */
  wallMs: number;
  speedKmh: number;
  x: number;
  y: number;
  headingDeg: number;
  gear: number;
  laneOffsetM: number;
  indicator: SimTick["indicator"];
  seatbeltOn: boolean;
  handbrakeOn: boolean;
  /**
   * `SimTick.leadGapM` — BUMPER gap, m, to the nearest vehicle ahead in the
   * player's own lane (`traffic.leadGapMeters`), or undefined when there is
   * none. Additive and optional, so no existing rig script is invalidated and
   * DRIVE_RIG_VERSION does not move.
   *
   * WHY IT IS HERE (doc 87 B69). A following drill is graded in SECONDS and
   * staged in METRES, and the only reason its own instruction («дръж поне 2
   * секунди») could contradict its own demonstration for months is that
   * nothing outside the rule engine could read the gap the student is being
   * SHOWN. This is the same class of miss as the wave's other two: a shared
   * instrument no single row justified. gap_seconds = leadGapM / (speedKmh/3.6).
   */
  leadGapM?: number;
  /** Lesson phase: preDrive | driving | completed | aborted. */
  phase: string;
  /** 0-based index of the ACTIVE objective (=== count once all are done). */
  activeObjective: number;
  objectivesDone: number;
  objectiveCount: number;
  /** Cumulative scorable events at this frame — a step in this column IS a fault. */
  eventCount: number;
  /** The command the rig injected on this frame (0/0/0 when not scripted). */
  throttle: number;
  brake: number;
  steer: number;
  /** Which scripted step was running, and its label. */
  stepIndex: number;
  stepLabel: string;
}

/**
 * One thing the student would have SEEN or been graded on.
 *
 * Three channels, deliberately kept apart, because they answer different
 * questions and two of them are not the same event:
 *   rule  — a scored event in the session (`state.events`): the conviction.
 *   card  — a HUD toast the shell pushed this frame: what is ON SCREEN. The
 *           „lesson" kind is a COACHED first mistake — a fault card that is
 *           deliberately NOT scored, which is precisely the distinction a
 *           „wrongful conviction?" row turns on.
 *   teach — an A9 teach moment / THEO-3 consequence: the modal that PAUSES.
 */
export interface DriveRigEvent {
  tSec: number;
  wallMs: number;
  channel: "rule" | "card" | "teach";
  kind: string;
  code?: string;
  titleBg?: string;
  severity?: string;
  points?: number;
  lawRef?: string;
  /**
   * `ViolationEvent.detail` — the machine-readable context the reducer already
   * carries and nothing could read. For a FAILED_TO_YIELD it is the
   * `prioritySituation.situation` that produced it („roundabout" /
   * „right-hand-rule" / „give-way" / „left-turn-oncoming"), which is the
   * difference between two DIFFERENT adjudicators wearing the same code and
   * the same Bulgarian title. Row B15 turns on exactly that distinction: the
   * roundabout tracker and the right-hand-rule tracker both guard the same ring
   * mouth, and without this column a conviction there is unattributable.
   */
  detail?: string;
  /** Where and how fast the car was when it fired — the „37 km/h" column. */
  x: number;
  y: number;
  speedKmh: number;
}

/**
 * WHERE THE LESSON'S WAYPOINTS ACTUALLY ARE, snapshotted off the first tick.
 *
 * Without this a capture script has to GUESS the coordinates it stops at, which
 * is how the previous wave ended up braking at the wrong place and calling the
 * result a defect. `stopAt: { x, y }` should be copied from here, not eyeballed.
 */
export interface DriveRigObjective {
  index: number;
  id: string;
  titleBg: string;
  kind: string;
  /** reachZone geometry, district metres (absent on other objective kinds). */
  x?: number;
  y?: number;
  radiusM?: number;
  maxSpeedKmh?: number;
}

export interface DriveRigDump {
  meta: {
    version: number;
    lessonId: string;
    lessonTitleBg: string;
    armedAtIso: string;
    sampleCount: number;
    dropped: number;
    everyNth: number;
    objectives: DriveRigObjective[];
  };
  samples: DriveRigSample[];
  events: DriveRigEvent[];
  script: DriveRigStatus;
}

export interface DriveRigStatus {
  running: boolean;
  finished: boolean;
  stepIndex: number;
  stepLabel: string;
  stepCount: number;
  elapsedSec: number;
  heldKeys: string[];
  log: DriveStepLogEntry[];
}

/** The object published on `window.__driveRig`. */
export interface DriveRigHandle {
  version: number;
  /** True once the first tick has arrived (the scene is live). */
  ready: boolean;
  /** The most recent frame — for a poll that only needs "where is it now". */
  last: DriveRigSample | null;
  /** Start a scripted drive (replaces any running one). */
  run: (steps: readonly DriveStep[]) => void;
  /** Stop scripting and release every injected axis and key. */
  stop: () => void;
  status: () => DriveRigStatus;
  /** The whole drive. `everyNth` decimates the samples (events are never cut). */
  dump: (everyNth?: number) => DriveRigDump;
  /** Empty the buffers (keeps a running script). */
  clear: () => void;
  /** Manual key hold — e.g. press("KeyE") for a held right glance. */
  press: (code: string) => void;
  release: (code: string) => void;
}

// ---------------------------------------------------------------------------
// Synthetic gamepad — the injection point
// ---------------------------------------------------------------------------
// SimInput.read() merges keyboard ∪ gamepad ∪ touch, strongest signal per axis.
// A standard-mapping pad is therefore a first-class input channel that needs no
// change anywhere in the scene: axes[0] = steer (pad +1 = RIGHT, the sim's
// steer is +1 = LEFT, so it is negated by SimInput), buttons[7] = throttle,
// buttons[6] = brake, buttons[0] = handbrake (never pressed here).
//
// Chosen over the touch source because that one is created INSIDE LessonScene
// (`useState(() => new TouchInputSource())`) and has no handle outside it, and
// over synthetic key events because keys are binary and ramped — a controller
// needs analog pedals to hold 20 km/h instead of oscillating around it.

const DEADZONE_SAFE = 0.13; // SimInput's GAMEPAD_DEADZONE is 0.12

interface PadButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}

class SyntheticPad {
  private readonly buttons: PadButton[] = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0,
  }));
  private readonly axes = [0, 0, 0, 0];
  private original: typeof navigator.getGamepads | null = null;
  private installed = false;

  private readonly pad = {
    id: "aidrive drive-rig (STANDARD GAMEPAD)",
    index: 0,
    connected: true,
    mapping: "standard" as const,
    timestamp: 0,
    axes: this.axes,
    buttons: this.buttons,
    vibrationActuator: null,
  };

  install(): void {
    if (this.installed) return;
    this.original = navigator.getGamepads.bind(navigator);
    const pad = this.pad as unknown as Gamepad;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      writable: true,
      value: (): (Gamepad | null)[] => [pad],
    });
    this.installed = true;
  }

  uninstall(): void {
    if (!this.installed) return;
    this.set({ throttle: 0, brake: 0, steer: 0 });
    if (this.original !== null) {
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        writable: true,
        value: this.original,
      });
    }
    this.original = null;
    this.installed = false;
  }

  set(cmd: DriveCommand): void {
    const t = this.buttons[7]!;
    const b = this.buttons[6]!;
    t.value = cmd.throttle;
    t.pressed = cmd.throttle > 0.05;
    b.value = cmd.brake;
    b.pressed = cmd.brake > 0.05;
    // Pad axis convention is the inverse of VehicleInput's, and anything inside
    // SimInput's deadzone is discarded — so a real command is pushed clear of it.
    const steer = cmd.steer === 0 ? 0 : -Math.sign(cmd.steer) * Math.max(DEADZONE_SAFE, Math.abs(cmd.steer));
    this.axes[0] = steer;
    this.pad.timestamp = performance.now();
  }
}

// ---------------------------------------------------------------------------
// Held keys — glances and any other keyboard-only control
// ---------------------------------------------------------------------------
// SimInput listens on window keydown/keyup and matches e.code, so a synthetic
// KeyboardEvent with the right `code` is indistinguishable from a real press.
// Edge-driven (one keydown per step, one keyup on handover) rather than
// repeated per frame — a hold that depends on the frame rate is not a hold.

function fireKey(type: "keydown" | "keyup", code: string): void {
  window.dispatchEvent(
    new KeyboardEvent(type, { code, key: code.replace(/^Key/, "").toLowerCase(), bubbles: true }),
  );
}

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

export interface DriveRigOptions {
  lessonId: string;
  lessonTitleBg: string;
  /** Ring-buffer depth in samples. */
  buffer?: number;
  /** Steps to run as soon as the first tick arrives (?script= on the URL). */
  autorun?: readonly DriveStep[];
}

export class DriveRig {
  private readonly samples: DriveRigSample[] = [];
  private readonly events: DriveRigEvent[] = [];
  private readonly capacity: number;
  private dropped = 0;
  private readonly armedAt = Date.now();
  private readonly pad = new SyntheticPad();
  private script: DriveScriptState | null = null;
  private command: DriveCommand = { throttle: 0, brake: 0, steer: 0 };
  private held = new Set<string>();
  /**
   * Keys held by `press()` rather than by the running step, kept APART from
   * `held` so a script step boundary cannot silently drop them.
   *
   * Measured 2026-08-04 on row B29. `syncKeys()` runs on every step advance and
   * called `setHeld(step.keys ?? [])`, which fires `keyup` on everything not in
   * the NEW step's list — a manual `press("KeyE")` included. A right glance
   * held across the „approach → stand" boundary therefore ended at the
   * boundary, and the burst that followed came back with the head already swung
   * home: eight frames of an empty windscreen that look exactly like „the car
   * is not there". That is the one failure mode this instrument exists to
   * prevent, and it was silent — `status().heldKeys` reported the truth but the
   * frames were already shot. Manual holds now survive step changes and are
   * released only by `release()` or `stop()`.
   */
  private manual = new Set<string>();
  private seenEvents = 0;
  private objectives: DriveRigObjective[] = [];
  private pendingAutorun: readonly DriveStep[] | null;
  readonly handle: DriveRigHandle;

  constructor(private readonly opts: DriveRigOptions) {
    this.capacity = Math.max(100, opts.buffer ?? DEFAULT_BUFFER);
    this.pendingAutorun = opts.autorun ?? null;
    this.handle = {
      version: DRIVE_RIG_VERSION,
      ready: false,
      last: null,
      run: (steps) => this.run(steps),
      stop: () => this.stop(),
      status: () => this.status(),
      dump: (everyNth) => this.dump(everyNth),
      clear: () => this.clearBuffers(),
      press: (code) => this.press(code),
      release: (code) => this.release(code),
    };
  }

  /** Publish on `window.__driveRig`. */
  publish(): void {
    (window as unknown as { __driveRig?: DriveRigHandle }).__driveRig = this.handle;
  }

  dispose(): void {
    this.stop();
    delete (window as unknown as { __driveRig?: DriveRigHandle }).__driveRig;
  }

  // -- the per-tick tap ------------------------------------------------------
  /**
   * Called from LessonPlayShell's handleTick with the SAME tick the rules saw
   * and the step result they produced. Records the frame, records anything new
   * the student would have seen, then advances the scripted drive.
   */
  onTick = (tick: SimTick, step: LessonStepResult): void => {
    const wallMs = Date.now() - this.armedAt;
    const state = step.state;

    // 1. the frame
    const sample: DriveRigSample = {
      tSec: tick.t,
      wallMs,
      speedKmh: tick.speedKmh,
      x: tick.position.x,
      y: tick.position.y,
      headingDeg: tick.headingDeg,
      gear: tick.gear,
      laneOffsetM: tick.laneOffsetM,
      indicator: tick.indicator,
      seatbeltOn: tick.seatbeltOn,
      handbrakeOn: tick.handbrakeOn,
      leadGapM: tick.leadGapM,
      phase: state.phase,
      activeObjective: state.currentObjectiveIndex,
      objectivesDone: state.objectives.filter((o) => o.status === "done").length,
      objectiveCount: state.objectives.length,
      eventCount: state.events.length,
      throttle: this.command.throttle,
      brake: this.command.brake,
      steer: this.command.steer,
      stepIndex: this.script === null ? -1 : this.script.index,
      stepLabel: this.script === null ? "" : stepLabel(this.script),
    };
    this.pushSample(sample);
    this.handle.last = sample;
    if (!this.handle.ready) {
      this.objectives = state.objectives.map((o, index) => {
        const p = o.params as { kind: string; x?: number; y?: number; radiusM?: number; maxSpeedKmh?: number };
        return {
          index,
          id: o.spec.id,
          titleBg: o.spec.titleBg,
          kind: o.spec.kind,
          ...(typeof p.x === "number" ? { x: p.x } : {}),
          ...(typeof p.y === "number" ? { y: p.y } : {}),
          ...(typeof p.radiusM === "number" ? { radiusM: p.radiusM } : {}),
          ...(typeof p.maxSpeedKmh === "number" ? { maxSpeedKmh: p.maxSpeedKmh } : {}),
        };
      });
    }
    this.handle.ready = true;

    // 2. everything that fired on this frame, on its own channel
    const at = { wallMs, x: sample.x, y: sample.y, speedKmh: sample.speedKmh };
    for (let i = this.seenEvents; i < state.events.length; i++) {
      const e = state.events[i]!;
      this.events.push({
        ...at,
        tSec: e.t,
        channel: "rule",
        kind: e.kind,
        code: e.code,
        titleBg: e.titleBg,
        ...(e.kind === "violation"
          ? {
              severity: e.severityClass,
              points: e.points,
              lawRef: e.lawRef,
              ...(e.detail !== undefined ? { detail: e.detail } : {}),
            }
          : {}),
      });
    }
    this.seenEvents = state.events.length;

    for (const h of step.hudEvents) {
      this.events.push({
        ...at,
        tSec: tick.t,
        channel: "card",
        kind: h.kind,
        ...("titleBg" in h ? { titleBg: h.titleBg } : {}),
        ...(h.kind === "violation"
          ? { severity: h.severity, points: h.points, ...(h.lawRef !== undefined ? { lawRef: h.lawRef } : {}) }
          : {}),
        ...(h.kind === "lesson" && h.lawRef !== undefined ? { lawRef: h.lawRef } : {}),
      });
    }

    for (const m of step.teachMoments ?? []) {
      this.events.push({ ...at, tSec: tick.t, channel: "teach", kind: "teachMoment", code: m.code, titleBg: m.titleBg });
    }
    if (step.mistakeMoment !== undefined) {
      this.events.push({
        ...at,
        tSec: tick.t,
        channel: "teach",
        kind: "mistakeMoment",
        code: step.mistakeMoment.code,
        titleBg: step.mistakeMoment.titleBg,
      });
    }

    // 3. drive
    if (this.pendingAutorun !== null) {
      const steps = this.pendingAutorun;
      this.pendingAutorun = null;
      this.run(steps, tick.t);
    }
    this.advance(tick);
  };

  private advance(tick: SimTick): void {
    if (this.script === null) return;
    const before = this.script;
    const res = stepDriveScript(before, {
      t: tick.t,
      speedKmh: tick.speedKmh,
      x: tick.position.x,
      y: tick.position.y,
    });
    this.script = res.state;
    this.command = res.command;
    if (res.transitioned || before.index !== res.state.index) this.syncKeys();
    if (res.state.finished) {
      // Finished scripts release the pedals but keep the buffers and the log,
      // so the drive can still be read back after the last step ends.
      this.command = { throttle: 0, brake: 0, steer: 0 };
      this.setHeld([]);
    }
    this.pad.set(this.command);
  }

  private syncKeys(): void {
    const step = this.script === null ? null : currentStep(this.script);
    this.setHeld(step?.keys ?? []);
  }

  /** Script-held keys ∪ manual holds — the manual set is never scripted away. */
  private setHeld(codes: readonly string[]): void {
    const next = new Set([...codes, ...this.manual]);
    for (const c of this.held) if (!next.has(c)) fireKey("keyup", c);
    for (const c of next) if (!this.held.has(c)) fireKey("keydown", c);
    this.held = next;
  }

  private pushSample(s: DriveRigSample): void {
    this.samples.push(s);
    if (this.samples.length > this.capacity) {
      this.samples.shift();
      this.dropped += 1;
    }
  }

  // -- control API -----------------------------------------------------------
  private run(steps: readonly DriveStep[], tSec?: number): void {
    this.pad.install();
    const t = tSec ?? this.handle.last?.tSec ?? 0;
    this.script = createDriveScript(steps, t);
    this.command = { throttle: 0, brake: 0, steer: 0 };
    this.pad.set(this.command);
    this.syncKeys();
  }

  private stop(): void {
    this.script = null;
    this.command = { throttle: 0, brake: 0, steer: 0 };
    this.manual.clear();
    this.setHeld([]);
    this.pad.uninstall();
  }

  private press(code: string): void {
    this.manual.add(code);
    if (this.held.has(code)) return;
    this.held.add(code);
    fireKey("keydown", code);
  }

  private release(code: string): void {
    this.manual.delete(code);
    if (!this.held.delete(code)) return;
    fireKey("keyup", code);
  }

  private status(): DriveRigStatus {
    const s = this.script;
    return {
      running: s !== null && !s.finished,
      finished: s?.finished ?? false,
      stepIndex: s?.index ?? -1,
      stepLabel: s === null ? "" : stepLabel(s),
      stepCount: s?.steps.length ?? 0,
      elapsedSec: s === null ? 0 : (this.handle.last?.tSec ?? 0) - s.startedAtSec,
      heldKeys: [...this.held],
      log: s === null ? [] : [...s.log],
    };
  }

  private clearBuffers(): void {
    this.samples.length = 0;
    this.events.length = 0;
    this.dropped = 0;
  }

  private dump(everyNth = 1): DriveRigDump {
    const n = Math.max(1, Math.floor(everyNth));
    return {
      meta: {
        version: DRIVE_RIG_VERSION,
        lessonId: this.opts.lessonId,
        lessonTitleBg: this.opts.lessonTitleBg,
        armedAtIso: new Date(this.armedAt).toISOString(),
        sampleCount: this.samples.length,
        dropped: this.dropped,
        everyNth: n,
        objectives: [...this.objectives],
      },
      samples: n === 1 ? [...this.samples] : this.samples.filter((_, i) => i % n === 0),
      events: [...this.events],
      script: this.status(),
    };
  }
}
