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
 *
 * ADR-017 — THE RIG IS REFERENCED TO THE PHYSICS STEP (2026-10-10).
 * ---------------------------------------------------------------------------
 * Until ADR-017 the controller DECIDED at every graded grid point (onTick,
 * called from inside the grade loop) and its command was APPLIED per display
 * frame: rapier had already run the frame's n steps before the grade loop, so
 * the n decisions overwrote one another on the pad and only the last point's
 * survived, from the NEXT frame. On the headless phone lens (2–4 fps, frames
 * of 269–792 ms) that delayed a rig pedal change by up to a frame, and moved
 * two roundabout drives across a rule edge (sc-rb-busy-gap:7bbdd45e,
 * sc-roundabout-entry:08a0b701) — a split of the INSTRUMENT, not the product.
 *
 * Now the pad is STEP-KEYED and LAZY. The synthetic pad is a live object that
 * `SimInput.read()` polls on every read, physics steps included, so no
 * production seam is needed: when `navigator.getGamepads()` is called and the
 * step track's `stepCount` differs from the last count evaluated, the rig runs
 * `stepDriveScript` ONCE per new count c, on the car the step track holds
 * after step c (`stateAtStep(c)`) at session time `timeOf(c)`, and caches the
 * command. Repeated reads at the same count return the cache, so read order
 * and the render-rate reads cannot move it. Step c+1's before-step therefore
 * applies the decision taken from the state after step c — at one step per
 * frame exactly what the rig did before ADR-017 (the regression anchor), and
 * on every cadence the same command at the same step.
 *
 * The command still travels the WHOLE product input path: SimInput's merge →
 * GatedSimInput (reverse remap, raw capture, pre-drive gate, blocked-throttle
 * latch) → applyDifficulty → VehicleSim. Nothing replaces SimInput.
 *
 * `onTick` only RECORDS (and re-keys the held keys — see D-3 below). A
 * sample's pedal columns are the command the pad handed the physics step that
 * produced that grid point.
 *
 * D-3, STATED, NOT FIXED: script KEY edges (indicators, looks, gear, holds)
 * stay frame-timed. They are still dispatched from `onTick`, inside the grade
 * loop, at the point whose decision changed the step, and the grade reads the
 * cabin through the frame's sample and the look FIFO (ADR-014). The
 * cadence-invariance claim covers PEDALS AND STEER ONLY.
 *
 * The step reference is a DEV-ONLY read handle (`RigStepSource`) that
 * LessonScene publishes on `window.__rigStepSource` inside a
 * `NODE_ENV === "production"` early return; a production bundle carries
 * neither it nor this pad (devrig/__tests__/rig-production-absence.test.ts).
 */

import type { EdgeAlignment, SimTick } from "../rules";
import type { LessonStepResult } from "../lessons";
import type { PhysicsStepSource, PhysicsStepState } from "../traffic";
import {
  createDriveScript,
  stepDriveScript,
  stepLabel,
  type DriveCommand,
  type DriveScriptState,
  type DriveStep,
  type DriveStepLogEntry,
} from "./driveScript";

/**
 * Bumped whenever the published shape changes, so a stale script fails loudly.
 *
 * 2 (2026-09-20) — the ROAD REFERENCE. `DriveRigSample` gained three REQUIRED
 * members (`seq`, `edgeId`, `laneId`) alongside the optional `oneway`,
 * `wrongWay`, `opposingBank` and `edgeAlignment`, so „a dump without
 * `edgeAlignment`" stopped being one thing. This counter is the only
 * discriminator a reader has between „this run predates the road reference"
 * and „the runtime published nothing on those frames" — which is the same
 * absent-means-what ambiguity `edgeAlignment` itself exists to remove, one
 * layer up, and the harness prints it into every evidence log
 * (`tools/clips/headless/drive-rig.mjs`, „rig v${meta.version}"). Nothing in
 * `platform/src` or `tools/` branches on the value, so moving it breaks
 * nothing and leaving it stale would cost a reader the one fact that says
 * which shape they are holding.
 *
 * 3 (2026-10-10, ADR-017) — THE PEDAL COLUMNS CHANGED MEANING. `throttle`,
 * `brake` and `steer` were „the command decided at the previous grid point";
 * they are now the command the pad handed the physics step that produced this
 * point. At one step per frame the two are the same number; on a long frame
 * they are not, and phone-lens evidence from before ADR-017 is not comparable
 * step for step with evidence after it. The version is how a reader tells.
 */
export const DRIVE_RIG_VERSION = 3;
/** Default ring-buffer depth: ~5.5 minutes of drive at 60 Hz. */
export const DEFAULT_BUFFER = 20_000;

/** One frame of the drive, as the shell saw it. */
export interface DriveRigSample {
  /**
   * Monotonic frame counter, from 0 at rig construction, one per `onTick`.
   *
   * WHY A RECORD NEEDS ONE. The buffer is a RING and `dump(everyNth)`
   * decimates, so „the samples I read back" and „the frames the drive had" are
   * different sets, and `wallMs` gaps are ambiguous between a dropped window
   * and a paused sim (a teach card / quiz / consequence overlay stops `onTick`
   * entirely — see `wallMs` below). With `seq` a consumer can tell decimation
   * (a constant step) from eviction (a step that changes) from a pause (a
   * `wallMs` jump at a `seq` step of 1), instead of reading an absent window as
   * an excluded one. NOT reset by `clear()`, deliberately: a reset would hide
   * the discontinuity it exists to show.
   */
  seq: number;
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
  // -- ROAD REFERENCE (the steering instrument, 2026-09-20). Everything below
  // is a straight copy of a SimTick field. A drive record that carries a
  // position and no road cannot say whether the car was where it should be:
  // every road-referenced criterion has to join a frame to an EDGE and a BANK,
  // and until now it had neither. `edgeId` and `laneId` are REQUIRED here —
  // the runtime publishes both on every tick and a record that may omit them
  // cannot be joined to a road — so this is NOT the additive-optional case the
  // `leadGapM` note above describes, and DRIVE_RIG_VERSION moves to 2 with it.
  /** `SimTick.edgeId` — the committed edge, or null. NULL PAST THE KERB by the
   *  tick's own contract („this car is nowhere"), which is not the same thing
   *  as having no lane fix — see `edgeAlignment.edgeId`. */
  edgeId: string | null;
  /** `SimTick.laneId` — 0 = rightmost of the vehicle's bank, increasing left. */
  laneId: number;
  /** `SimTick.oneway` — surface context for the committed edge; absent = no
   *  edge resolved. The discriminator that picks which flow criterion applies. */
  oneway?: boolean;
  /** `SimTick.wrongWay` — the CONVICTION. `false` is ambiguous on its own
   *  (see `edgeAlignment.wrongWayArmed`, which says whether it was asked). */
  wrongWay?: boolean;
  /** `SimTick.opposingBank` — set only when true, on TWO-WAY edges only. */
  opposingBank?: boolean;
  /**
   * `SimTick.edgeAlignment` — WHICH WAY THE CAR FACED, in signed degrees from
   * the edge's geometry direction, published on every runtime tick with an
   * explicit „not measurable here" case. This is the field the rig exists to
   * carry: without it a recorded drive can be convicted of driving against the
   * flow but can never be cleared of it, because the conviction channel is the
   * only thing that speaks. It grades nothing (see the type's docblock).
   */
  edgeAlignment?: EdgeAlignment;
  /** Lesson phase: preDrive | driving | completed | aborted. */
  phase: string;
  /** 0-based index of the ACTIVE objective (=== count once all are done). */
  activeObjective: number;
  objectivesDone: number;
  objectiveCount: number;
  /** Cumulative scorable events at this frame — a step in this column IS a fault. */
  eventCount: number;
  /**
   * The command the synthetic pad handed the physics step that PRODUCED this
   * grid point (step k, which read the pad at step count k−1) — the input the
   * product applied, before its own gate and shaping (0/0/0 when not
   * scripted). ADR-017; before version 3 this was the previous point's
   * decision, which on a long frame was not what physics consumed.
   */
  throttle: number;
  brake: number;
  steer: number;
  /** Which scripted step that command came from (-1: none), and its label. */
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
  // -- ADR-017: the step reference. Additive; every field below is a count or
  // a step index on the physics step track, never a wall time.
  /** A script is armed and waiting for its start step. */
  armed: boolean;
  /** The step the running (or armed) script is referenced to: its session
   *  time origin is `timeOf(startStep)`. Null when none is known yet. */
  startStep: number | null;
  /** The newest step count the controller has been evaluated for. */
  evaluatedStep: number;
  /** Decisions evaluated for a step that had ALREADY been taken (a „drive"
   *  start learned from the grade, or a step source that attached late) —
   *  computed for the script's state, never applied. 0 on a named start. */
  lateDecisions: number;
  /** Counts whose car state the step track no longer held (never in a live
   *  drive: the ring holds 64 steps and a frame brings at most 30). */
  blindSteps: number;
  /** The scene's step source was replaced (a remount): the run spans two
   *  step tracks and is not one drive. */
  sourceResets: number;
  /** Errors thrown inside the pad's lazy read, swallowed so the product's
   *  physics step never sees them — and COUNTED, so a run can be refused. */
  readErrors: number;
  /** Why an armed script was refused after arming, or null. */
  armError: string | null;
}

/**
 * ADR-017 — WHERE A SCRIPT STARTS, referenced to the physics step:
 *   number   — a NAMED STEP index: the script's time origin is `timeOf(N)`,
 *              its first decision is taken on the car after step N and
 *              applied from step N+1. Refused if step N+1 has already read
 *              the pad (the decision could no longer be applied).
 *   "drive"  — the first grid point of the lesson's driving phase (for a
 *              lesson with no pre-drive procedure that is step 1). Learned
 *              from the grade, so where the phase flips inside a long frame
 *              the decisions for the steps already taken are evaluated for
 *              the script's state and counted in `lateDecisions`; the
 *              product's own pre-drive gate is frame-timed there anyway
 *              (GatedSimInput.driveLocked follows a React commit).
 *   "next"   — the step count at the call (the pre-ADR-017 behaviour of
 *              `run()`): time origin `timeOf(S)`, first decision on the car
 *              after step S+1. WHICH step that is depends on when the call
 *              lands, so it is not a step-referenced start; kept for the
 *              existing callers.
 */
export type DriveRigStart = number | "drive" | "next";

export interface DriveRigRunOptions {
  /** Default "next" (the pre-ADR-017 behaviour). */
  startAt?: DriveRigStart;
}

/** What `run()` armed — returned so a harness can print it beside the drive. */
export interface DriveRigArm {
  startAt: DriveRigStart;
  /** The step the script is referenced to, when already known. */
  startStep: number | null;
  /** The step count when the call landed (null: no step source yet). */
  stepCountAtCall: number | null;
}

/** The physics step clock as the rig sees it (`stepNow()`). */
export interface DriveRigStepNow {
  /** Physics steps recorded so far (= the newest grid point). */
  step: number;
  /** Session time of that step, s. */
  tSec: number;
  /** One step, s. */
  stepSec: number;
}

/** The object published on `window.__driveRig`. */
export interface DriveRigHandle {
  version: number;
  /** True once the first tick has arrived (the scene is live). */
  ready: boolean;
  /** The most recent frame — for a poll that only needs "where is it now". */
  last: DriveRigSample | null;
  /** Arm a scripted drive (replaces any running one). See DriveRigStart. */
  run: (steps: readonly DriveStep[], opts?: DriveRigRunOptions) => DriveRigArm;
  /** The physics step clock now, or null before the scene publishes it. */
  stepNow: () => DriveRigStepNow | null;
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
// The step reference (ADR-017) — a DEV-ONLY read handle
// ---------------------------------------------------------------------------

/**
 * What LessonScene publishes for the rig in dev builds: a READ view of the
 * physics step track (VehicleRig records one state after every rapier step)
 * and of the session grid clock the grade runs on. Read-only on purpose: it
 * carries no `record`, so the rig can see the steps and never write one.
 */
export interface RigStepSource {
  readonly steps: PhysicsStepSource;
  readonly clock: {
    /** Session time of grid point (= physics step) k — a product, never a sum. */
    timeOf(k: number): number;
    /** The newest grid point at or before session time `tSec`. */
    indexAt(tSec: number): number;
    readonly stepSec: number;
  };
}

/** The window property LessonScene publishes the source on (dev builds only;
 *  the production-absence census pins both ends to this spelling). */
export const RIG_STEP_SOURCE_GLOBAL = "__rigStepSource";

export interface RigStepSourceHost {
  __rigStepSource?: RigStepSource;
}

/** The scene's step source, or null (no scene yet, or no window at all). */
export function readRigStepSource(): RigStepSource | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as RigStepSourceHost).__rigStepSource ?? null;
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
//
// ADR-017: the shim calls `onRead` BEFORE it hands the pad over, so every read
// — a physics step's or a render read's — first brings the command up to the
// step track's current count (lazily, once per count; see DriveRig.syncToStep).

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

  /** @param onRead runs on EVERY getGamepads() call, before the pad is handed
   *  over; it must not throw (DriveRig wraps it). */
  constructor(private readonly onRead: () => void) {}

  get isInstalled(): boolean {
    return this.installed;
  }

  install(): void {
    if (this.installed) return;
    this.original = navigator.getGamepads.bind(navigator);
    const pad = this.pad as unknown as Gamepad;
    const onRead = this.onRead;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      writable: true,
      value: (): (Gamepad | null)[] => {
        onRead();
        return [pad];
      },
    });
    this.installed = true;
  }

  uninstall(): void {
    if (!this.installed) return;
    this.set(IDLE_COMMAND);
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
    this.pad.timestamp = typeof performance === "undefined" ? 0 : performance.now();
  }
}

// ---------------------------------------------------------------------------
// Held keys — glances and any other keyboard-only control
// ---------------------------------------------------------------------------
// SimInput listens on window keydown/keyup and matches e.code, so a synthetic
// KeyboardEvent with the right `code` is indistinguishable from a real press.
// Edge-driven (one keydown per step, one keyup on handover) rather than
// repeated per frame — a hold that depends on the frame rate is not a hold.
//
// ADR-017 D-3: these edges stay FRAME-TIMED. They are dispatched from
// `onTick`, i.e. inside the grade loop, at the grid point whose decision
// changed the script step — never from inside a physics step's read.

function fireKey(type: "keydown" | "keyup", code: string): void {
  window.dispatchEvent(
    new KeyboardEvent(type, { code, key: code.replace(/^Key/, "").toLowerCase(), bubbles: true }),
  );
}

// ---------------------------------------------------------------------------
// The per-count record
// ---------------------------------------------------------------------------

const IDLE_COMMAND: DriveCommand = { throttle: 0, brake: 0, steer: 0 };

/** How many step counts of decisions / applied commands are kept: four 0.5 s
 *  frames — the grade never asks for one older than the frame it grades. */
const COUNT_RING = 128;
/** The step track's own ring (traffic/playerTrack.ts STEP_RING): a catch-up
 *  never reaches further back than the states it can still read. */
const STEP_TRACK_RING = 64;

interface CountEntry {
  /** The step count this entry is for; -1 = empty slot. */
  count: number;
  throttle: number;
  brake: number;
  steer: number;
  /** Script step index after the decision (-1: no script running). */
  index: number;
}

class CountRing {
  private readonly slots: CountEntry[] = Array.from({ length: COUNT_RING }, () => ({
    count: -1,
    throttle: 0,
    brake: 0,
    steer: 0,
    index: -1,
  }));

  put(count: number, cmd: DriveCommand, index: number): void {
    const s = this.slots[count % COUNT_RING]!;
    s.count = count;
    s.throttle = cmd.throttle;
    s.brake = cmd.brake;
    s.steer = cmd.steer;
    s.index = index;
  }

  get(count: number): CountEntry | null {
    if (!(count >= 0)) return null;
    const s = this.slots[count % COUNT_RING]!;
    return s.count === count ? s : null;
  }

  clear(): void {
    for (const s of this.slots) s.count = -1;
  }
}

/** A script waiting for its start step. */
interface PendingStart {
  steps: readonly DriveStep[];
  startAt: DriveRigStart;
  /** The step whose session time is the script's origin (null: not known yet). */
  t0Count: number | null;
  /** The first step count the controller decides at (null: not known yet). */
  firstCount: number | null;
}

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

export interface DriveRigOptions {
  lessonId: string;
  lessonTitleBg: string;
  /** Ring-buffer depth in samples. */
  buffer?: number;
  /** Steps to arm as soon as the rig is published (?script= on the URL). */
  autorun?: readonly DriveStep[];
  /** Where the autorun script starts (ADR-017). Default "drive". */
  autorunStart?: DriveRigStart;
  /** The scene's step source — injectable for tests; defaults to the
   *  dev-only `window.__rigStepSource` handle LessonScene publishes. */
  stepSource?: () => RigStepSource | null;
}

export class DriveRig {
  private readonly samples: DriveRigSample[] = [];
  private readonly events: DriveRigEvent[] = [];
  private readonly capacity: number;
  private dropped = 0;
  /** Next `DriveRigSample.seq`. Never reset — see the field's docblock. */
  private seq = 0;
  private readonly armedAt = Date.now();
  private readonly pad = new SyntheticPad(() => this.onPadRead());
  private readonly stepSource: () => RigStepSource | null;
  private script: DriveScriptState | null = null;
  /** The cached command: the decision for `evaluated` (what a read gets). */
  private command: DriveCommand = { ...IDLE_COMMAND };
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
  private autorunArmed = false;
  readonly handle: DriveRigHandle;

  // -- ADR-017: the step reference -------------------------------------------
  /** The step source the bookkeeping below belongs to. */
  private source: RigStepSource | null = null;
  /** The newest step count the controller has been evaluated for. */
  private evaluated = 0;
  /** The decision taken at each count (the state after step c). */
  private readonly decisions = new CountRing();
  /** The command each count's LAST read handed out — what the physics step
   *  that read at count c (step c+1) applied, before the product's gate. */
  private readonly applied = new CountRing();
  private pending: PendingStart | null = null;
  /** The step the running script is referenced to. */
  private startStep: number | null = null;
  /** After the lesson ended at grid point k: decisions stop at k (pre-ADR-017
   *  parity — the shell stops calling onTick, so the old rig froze there). */
  private freezeAt: number | null = null;
  /** The script step whose keys are held (-1: none keyed yet). */
  private keysIndex = -1;
  private lateDecisions = 0;
  private blindSteps = 0;
  private sourceResets = 0;
  private readErrors = 0;
  private armError: string | null = null;
  private readonly stepState: PhysicsStepState = { x: 0, y: 0, speedKmh: 0, headingDeg: 0 };

  constructor(private readonly opts: DriveRigOptions) {
    this.capacity = Math.max(100, opts.buffer ?? DEFAULT_BUFFER);
    this.pendingAutorun = opts.autorun ?? null;
    this.stepSource = opts.stepSource ?? readRigStepSource;
    this.handle = {
      version: DRIVE_RIG_VERSION,
      ready: false,
      last: null,
      run: (steps, runOpts) => this.run(steps, runOpts?.startAt ?? "next"),
      stepNow: () => this.stepNow(),
      stop: () => this.stop(),
      status: () => this.status(),
      dump: (everyNth) => this.dump(everyNth),
      clear: () => this.clearBuffers(),
      press: (code) => this.press(code),
      release: (code) => this.release(code),
    };
  }

  /** Publish on `window.__driveRig`, and arm the `?script=` autorun — BEFORE
   *  the scene's first physics step, so a named start step can still be met. */
  publish(): void {
    (window as unknown as { __driveRig?: DriveRigHandle }).__driveRig = this.handle;
    this.armAutorun();
  }

  dispose(): void {
    this.stop();
    // A StrictMode remount publishes again: the autorun must arm again then.
    this.autorunArmed = false;
    delete (window as unknown as { __driveRig?: DriveRigHandle }).__driveRig;
  }

  private armAutorun(): void {
    if (this.pendingAutorun === null || this.autorunArmed) return;
    this.autorunArmed = true;
    try {
      this.run(this.pendingAutorun, this.opts.autorunStart ?? "drive");
    } catch (e) {
      this.armError = e instanceof Error ? e.message : String(e);
      console.error(`[drive-rig] autorun refused: ${this.armError}`);
    }
  }

  // -- the per-tick tap ------------------------------------------------------
  /**
   * Called from LessonPlayShell's handleTick with the SAME tick the rules saw
   * and the step result they produced. Records the frame and anything new the
   * student would have seen. It no longer DRIVES (ADR-017): the controller is
   * evaluated lazily from the pad's reads, per physics step. What it still
   * does besides recording is the frame-timed part — starting a „drive"
   * script at the phase flip, freezing at the lesson's end, and re-keying the
   * held keys at the point whose decision changed the script step (D-3).
   */
  onTick = (tick: SimTick, step: LessonStepResult): void => {
    const wallMs = Date.now() - this.armedAt;
    const state = step.state;
    if (this.pendingAutorun !== null && !this.autorunArmed) this.armAutorun();
    const src = this.currentSource();
    const k = src === null ? null : src.clock.indexAt(tick.t);
    // The command step k applied: the one its before-step read at count k−1.
    const appliedEntry = k === null ? null : this.applied.get(k - 1);

    // 1. the frame
    const sample: DriveRigSample = {
      seq: this.seq++,
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
      edgeId: tick.edgeId ?? null,
      laneId: tick.laneId,
      oneway: tick.oneway,
      wrongWay: tick.wrongWay,
      opposingBank: tick.opposingBank,
      edgeAlignment: tick.edgeAlignment,
      phase: state.phase,
      activeObjective: state.currentObjectiveIndex,
      objectivesDone: state.objectives.filter((o) => o.status === "done").length,
      objectiveCount: state.objectives.length,
      eventCount: state.events.length,
      throttle: appliedEntry?.throttle ?? 0,
      brake: appliedEntry?.brake ?? 0,
      steer: appliedEntry?.steer ?? 0,
      stepIndex: appliedEntry?.index ?? -1,
      stepLabel: this.labelOf(appliedEntry?.index ?? -1),
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

    if (src === null || k === null) return;

    // 3. the frame-timed part of driving (D-3)
    // 3a. a „drive" start: the first grid point of the driving phase.
    const p = this.pending;
    if (p !== null && p.startAt === "drive" && p.firstCount === null && state.phase === "driving") {
      p.t0Count = k;
      p.firstCount = k;
      this.startStep = k;
    }
    // 3b. bring the controller up to the step track (idempotent: the counts
    // already evaluated by the pad's reads are not evaluated again).
    this.syncToStep();
    // 3c. the lesson ended at this point: the shell stops calling onTick from
    // the next point on, and the pre-ADR-017 rig froze its command HERE.
    if (this.freezeAt === null && (state.phase === "completed" || state.phase === "aborted")) {
      this.freezeAt = k;
      const d = this.decisions.get(k);
      if (d !== null) {
        this.command = { throttle: d.throttle, brake: d.brake, steer: d.steer };
        this.pad.set(this.command);
      }
    }
    // 3d. the held keys follow the script step decided AT this point.
    const d = this.decisions.get(k);
    if (d !== null && d.index >= 0 && d.index !== this.keysIndex) this.syncKeysTo(d.index, this.script?.steps ?? []);
  };

  // -- ADR-017: the lazy, step-keyed controller -------------------------------

  /** The pad's read hook. Never throws into the product's physics step. */
  private onPadRead(): void {
    try {
      this.syncToStep();
    } catch (e) {
      this.readErrors += 1;
      if (this.readErrors === 1) console.error("[drive-rig] the step-keyed pad failed on a read:", e);
    }
  }

  /** The current step source; a NEW one (a scene remount) restarts the
   *  bookkeeping — the step numbering restarts with it. */
  private currentSource(): RigStepSource | null {
    const src = this.stepSource();
    if (src !== null && src !== this.source) this.attachSource(src);
    return src;
  }

  private attachSource(src: RigStepSource): void {
    if (this.source !== null) this.sourceResets += 1;
    this.source = src;
    this.evaluated = 0;
    this.decisions.clear();
    this.applied.clear();
    const p = this.pending;
    if (p !== null && p.startAt === "next" && p.firstCount === null) {
      // Armed before any scene existed: „the step count at the call" is the
      // count the source arrives with.
      const s = src.steps.stepCount;
      p.t0Count = s;
      p.firstCount = s + 1;
      this.startStep = s;
    }
  }

  /**
   * Bring the cached command up to the step track's current count: evaluate
   * the controller ONCE for every count not yet evaluated, oldest first, on
   * the car after that step at that step's session time. A count already
   * evaluated is never evaluated again, so every reader at one count — the
   * physics step's read and every render read — gets the same command.
   */
  private syncToStep(): void {
    const src = this.currentSource();
    if (src === null) return;
    const count = src.steps.stepCount;
    if (count > this.evaluated) {
      const from = Math.max(this.evaluated + 1, count - STEP_TRACK_RING + 1, 1);
      // A „drive" start learned from the grade can lie at or before counts the
      // pad has already evaluated (idle, pending): rewind to it — the script's
      // state is then the same on every cadence; the decisions for steps
      // already taken are counted as late (computed, never applied).
      this.evaluateRange(src, from, count);
    } else {
      this.rewindToPendingStart(src);
    }
    // Every read at this count hands out the cached command, and the LAST one
    // is the one the next physics step applies.
    this.applied.put(count, this.command, this.script === null ? -1 : this.script.index);
    this.pad.set(this.command);
  }

  /** A start whose first count is at or behind what was already evaluated. */
  private rewindToPendingStart(src: RigStepSource): void {
    const p = this.pending;
    if (p === null || p.firstCount === null || p.firstCount > this.evaluated) return;
    const upTo = this.evaluated;
    this.evaluateRange(src, Math.max(p.firstCount, upTo - STEP_TRACK_RING + 1, 1), upTo);
  }

  private evaluateRange(src: RigStepSource, from: number, to: number): void {
    // A pending start inside the range is taken at its own count.
    const p = this.pending;
    if (p !== null && p.firstCount !== null && p.firstCount < from && p.firstCount <= to) {
      from = Math.max(p.firstCount, to - STEP_TRACK_RING + 1, 1);
    }
    const now = src.steps.stepCount;
    for (let c = from; c <= to; c++) this.evaluateAt(src, c, c < now);
    this.evaluated = Math.max(this.evaluated, to);
  }

  /** The controller's decision for count `c`: the car after step c. */
  private evaluateAt(src: RigStepSource, c: number, late: boolean): void {
    if (this.freezeAt !== null && c > this.freezeAt) return;
    const p = this.pending;
    if (p !== null && p.firstCount !== null && c >= p.firstCount) {
      this.script = createDriveScript(p.steps, src.clock.timeOf(p.t0Count ?? p.firstCount));
      this.startStep = p.t0Count ?? p.firstCount;
      this.pending = null;
    }
    if (this.script === null) {
      this.command = { ...IDLE_COMMAND };
      this.decisions.put(c, this.command, -1);
      return;
    }
    if (!src.steps.stateAtStep(c, this.stepState)) {
      this.blindSteps += 1;
      this.decisions.put(c, this.command, this.script.index);
      return;
    }
    const res = stepDriveScript(this.script, {
      t: src.clock.timeOf(c),
      speedKmh: this.stepState.speedKmh,
      x: this.stepState.x,
      y: this.stepState.y,
    });
    this.script = res.state;
    // Finished scripts release the pedals but keep the buffers and the log,
    // so the drive can still be read back after the last step ends.
    this.command = res.state.finished ? { ...IDLE_COMMAND } : res.command;
    this.decisions.put(c, this.command, res.state.index);
    if (late) this.lateDecisions += 1;
  }

  private labelOf(index: number): string {
    if (index < 0) return "";
    const steps = this.script?.steps;
    if (steps === undefined) return "";
    const s = steps[index];
    if (s === undefined) return "(finished)";
    return s.label ?? `${s.speedKmh} km/h`;
  }

  /** The held keys for script step `index` of `steps` (none past the end). */
  private syncKeysTo(index: number, steps: readonly DriveStep[]): void {
    this.keysIndex = index;
    this.setHeld(steps[index]?.keys ?? []);
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
  /**
   * Arm `steps` (replacing any running script). THROWS on a script the rig
   * cannot honour (`createDriveScript`'s gate) and on a named start step that
   * can no longer be met — never substitutes another start.
   */
  private run(steps: readonly DriveStep[], startAt: DriveRigStart): DriveRigArm {
    createDriveScript(steps, 0); // the gate: throws a RangeError on a bad script
    if (startAt !== "drive" && startAt !== "next" && !(Number.isInteger(startAt) && startAt >= 0)) {
      throw new RangeError(`drive script refused — startAt=${String(startAt)} is not a step index, "drive" or "next"`);
    }
    const src = this.currentSource();
    const now = src === null ? null : src.steps.stepCount;
    if (typeof startAt === "number" && now !== null && startAt < now) {
      // Step startAt+1 has already read the pad: its decision can no longer be
      // applied, and starting later instead would be a DIFFERENT drive.
      throw new RangeError(
        `drive script refused — start step ${startAt} has passed (the physics step count is already ${now})`,
      );
    }
    if (startAt === "drive" && this.handle.last !== null && this.handle.last.phase !== "preDrive") {
      throw new RangeError(
        `drive script refused — the drive phase began before this script was armed (phase ${this.handle.last.phase}); name a start step instead`,
      );
    }
    this.pad.install();
    this.script = null;
    this.freezeAt = null;
    this.armError = null;
    this.command = { ...IDLE_COMMAND };
    this.pad.set(this.command);
    const pending: PendingStart = { steps, startAt, t0Count: null, firstCount: null };
    if (typeof startAt === "number") {
      pending.t0Count = startAt;
      pending.firstCount = startAt;
    } else if (startAt === "next" && now !== null) {
      // The pre-ADR-017 `run()`: origin at the newest step, first decision on
      // the car after the NEXT one.
      pending.t0Count = now;
      pending.firstCount = now + 1;
    }
    this.pending = pending;
    this.startStep = pending.t0Count;
    if (src !== null && now !== null) {
      // The cache for the current count was the old command: the next read
      // at this count must hand out idle (as the old run() did), and a named
      // start at this very count is evaluated now.
      this.applied.put(now, this.command, -1);
      if (pending.firstCount !== null && pending.firstCount <= this.evaluated) this.rewindToPendingStart(src);
    }
    // The pre-ADR-017 run() held step 0's keys at once; a „next" start keeps
    // that (it starts now). A delayed start keys them at its first decision.
    // A re-arm releases the replaced script's keys at once (manual holds stay).
    this.keysIndex = -1;
    if (startAt === "next") this.syncKeysTo(0, steps);
    else this.setHeld([]);
    return { startAt, startStep: this.startStep, stepCountAtCall: now };
  }

  private stepNow(): DriveRigStepNow | null {
    const src = this.currentSource();
    if (src === null) return null;
    const step = src.steps.stepCount;
    return { step, tSec: src.clock.timeOf(step), stepSec: src.clock.stepSec };
  }

  private stop(): void {
    this.script = null;
    this.pending = null;
    this.startStep = null;
    this.freezeAt = null;
    this.command = { ...IDLE_COMMAND };
    this.keysIndex = -1;
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
      stepCount: s?.steps.length ?? this.pending?.steps.length ?? 0,
      elapsedSec: s === null ? 0 : (this.handle.last?.tSec ?? 0) - s.startedAtSec,
      heldKeys: [...this.held],
      log: s === null ? [] : [...s.log],
      armed: this.pending !== null,
      startStep: this.startStep,
      evaluatedStep: this.evaluated,
      lateDecisions: this.lateDecisions,
      blindSteps: this.blindSteps,
      sourceResets: this.sourceResets,
      readErrors: this.readErrors,
      armError: this.armError,
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
