/**
 * DETERMINISTIC SCRIPTED DRIVING — the closed-loop half of the drive rig.
 *
 * WHY THIS EXISTS (register wave 2026-08-03, blocker behind row B15)
 * ---------------------------------------------------------------------------
 * The rig used in the previous wave was OPEN-LOOP: it held `W` for N seconds
 * and screenshotted. The founder's sequence for B15 calls for a car that comes
 * to a STOP at the give-way line and waits forty seconds; the open-loop rig
 * arrived at that line at 37 km/h. A fault card then appeared, and nobody could
 * say whether it was a wrongful conviction or an honest barge — because the
 * drive that produced it was never the drive that was specified.
 *
 * A scripted drive has to be able to say „hold 20 km/h, brake to 0 at x, wait
 * N seconds, then go" and ACTUALLY DO IT. That is a controller, not a key hold:
 * the target speed is a function of the measured speed and the measured
 * distance to the stop point, so the car arrives at 0 whatever the surface, the
 * tier top-speed or the frame rate happen to be.
 *
 * PURE ON PURPOSE. No DOM, no three.js, no React — the whole controller is a
 * (state, sample) → (state, command) function so its behaviour is unit-tested
 * in Node rather than argued about from a video. The DOM half (synthetic
 * gamepad + held keys) lives in `rig.ts` and does nothing but apply the command
 * this file computes.
 */

/** m/s ↔ km/h. */
const KMH = 3.6;

/** At or below this the car counts as STOPPED (≈1 km/h — physics noise floor). */
export const STOP_SPEED_MS = 0.28;
/** Default arrival tolerance for `stopAt` / `untilNear`, metres. */
export const DEFAULT_WITHIN_M = 2;
/** Default comfortable deceleration used to shape a `stopAt` ramp, m/s². */
export const DEFAULT_DECEL_MS2 = 2;
/**
 * Speed error (m/s) inside which neither pedal is applied — stops pedal chatter.
 * It is also the controller's steady-state band: measured on tj-stop-v1 a „hold
 * 20 km/h" step settles at 19.3 km/h with a 0.2 band and 19.7 with this one.
 */
export const SPEED_DEADBAND_MS = 0.1;
/** How long the car must sit under STOP_SPEED_MS before a `stopAt` step closes. */
export const STOP_HOLD_S = 0.4;

// ---------------------------------------------------------------------------
// THE STANDSTILL PULSE — measured 2026-08-04, and the reason a „wait" step is
// not simply `brake = 1`.
// ---------------------------------------------------------------------------
// The first scripted forty-second wait on sc-junction-stop held full brake at
// the stop line and the car DROVE ITSELF BACKWARDS at 16.8 km/h into a
// collision. Cause, straight off the telemetry: `gear` flipped 1 → -1 at
// t=40.363 s, 0.35 s after the wheels stopped. That is the auto-reverse assist
// (engine/reverseAssist.ts): hold the brake at a standstill in D and the car
// shifts itself to R, whereupon the pedals SWAP and the held brake becomes a
// floored reverse accelerator.
//
// So the rig pulses instead: brake on for less than REVERSE_ASSIST_HOLD_S, off
// briefly (which resets the assist's hold timer), repeat. A rig that held the
// pedal would photograph a reversing car and a collision card and call it a
// wait — precisely the class of false evidence this instrument exists to end.
//
// 2026-08-04, ROW B15 — AND THE DUTY CYCLE MUST SURVIVE A STEP HANDOVER.
// The pulse above was written, and then every step transition below reset
// `standstillPhaseS` to 0 with `standstillBraking` true. A wait expressed as
// ONE 40 s step never noticed. B15's wait is expressed as SIXTEEN steps,
// because the row is closed by photographs at 4/8/40/60 s and the rig shoots
// on handover — and a handover that lands mid-ON-phase restarts the pulse
// without lifting the pedal, so the two half-pulses fuse into one hold of up
// to ON+ON = 0.44 s. Measured on sc-roundabout-entry@L1: brake continuously
// 1.00 from t=41.31, handover at 41.49, `gear` 1 → -1 at t=41.670 (0.36 s),
// and the car then accelerated BACKWARDS to 25 km/h down the whole approach
// arm and respawned — three times in one drive. Forty seconds of standing
// still is the entire evidence B15 asks for, so a rig that cannot stand still
// across a handover cannot close it.
//
// The duty cycle is a property of A CAR THAT IS STANDING STILL, not of the
// step that happens to be running, so it now carries across the transition.
//
// 2026-08-05 — THE ROOT CAUSE IS FIXED, AND THE PULSE STAYS ANYWAY.
// The assist no longer reads a held brake as a request to reverse (LAW 1) and
// the input path can no longer turn a held brake into throttle at all (LAW 2)
// — see engine/reverseAssist.ts. So a continuous hold is now safe, and a step
// can ask for one with `holdBrake: true`; that is how the fix was PROVEN, by
// standing on the pedal at a Б2 line for thirty seconds and photographing a
// car that did not move and a gear that did not change.
// The default stays pulsed on purpose: several review rows were measured with
// this exact duty cycle in flight, and silently changing what „wait" injects
// would silently change what those rows photographed. Delete the pulse when
// the rows that used it are closed, not before.
/** Brake-on part of the standstill duty cycle, s. MUST stay under the assist's
 *  REVERSE_ASSIST_HOLD_S (0.35 s) — a test pins the relationship. */
export const STANDSTILL_BRAKE_ON_S = 0.22;
/** Brake-off part, s: long enough that the assist's hold timer resets. */
export const STANDSTILL_BRAKE_OFF_S = 0.12;
/** Hard cap on any single step (s) so a script can never hang a render forever. */
export const DEFAULT_STEP_TIMEOUT_S = 90;

const KP_THROTTLE = 0.55;
const KI_THROTTLE = 0.25;
const INTEGRAL_CLAMP = 4;
const KP_BRAKE = 0.45;
/** Largest dt the controller will integrate over — a stalled tab must not slam a pedal. */
const MAX_DT_S = 0.25;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface WorldPoint {
  x: number;
  y: number;
}

/**
 * ONE INSTRUCTION of a scripted drive.
 *
 * Every step names a target speed; the terminators decide when it hands over.
 * If more than one terminator is given, the FIRST one satisfied ends the step
 * (`forSec` therefore doubles as a safety cap on a positional terminator).
 * A step with no terminator runs until the script is stopped — legal, and the
 * normal way to end a script („…then go").
 */
export interface DriveStep {
  /** Shown in the telemetry table and the transition log. */
  label?: string;
  /** Cruise target in km/h. 0 ⇒ come to a full stop and HOLD the brake. */
  speedKmh: number;
  /**
   * Bring the car to a standstill AT this world point. The target speed becomes
   * `min(speedKmh, sqrt(2·decel·distance))`, so the car decelerates on a real
   * ramp and arrives at zero instead of arriving at 37 km/h.
   */
  stopAt?: WorldPoint;
  /** End the step once the car is within `withinM` of this point (no braking). */
  untilNear?: WorldPoint;
  /** Arrival tolerance for `stopAt` / `untilNear`, metres. Default 2. */
  withinM?: number;
  /** Deceleration the `stopAt` ramp is shaped with, m/s². Default 2. */
  decelMs2?: number;
  /** Constant steer for the whole step, -1..1, POSITIVE = LEFT (VehicleInput). */
  steer?: number;
  /** End the step after this many seconds inside it. */
  forSec?: number;
  /** Safety cap, seconds. Default 90. A step that hits it is logged as "timeout". */
  timeoutSec?: number;
  /**
   * Keyboard codes HELD for the duration of the step — e.g. `["KeyE"]` for a
   * held right glance (row B29 needs a frame under exactly that), `["KeyQ"]`
   * left, `["KeyF"]` rear. Applied by the DOM half on the step transition, so
   * the hold is edge-driven and does not depend on the frame rate.
   */
  keys?: string[];
  /**
   * Stand on the brake CONTINUOUSLY once stopped, instead of running the
   * standstill duty cycle. What a student at a Б2 sign actually does — and,
   * until 2026-08-05, the input that drove the car backwards into traffic.
   * Use it to drive that behaviour deliberately; leave it off for review rows
   * whose evidence was captured with the pulse.
   */
  holdBrake?: boolean;
}

/** Pedal/steer command for one frame — the VehicleInput axes the rig injects. */
export interface DriveCommand {
  throttle: number;
  brake: number;
  steer: number;
}

/** The measurements the controller closes the loop on. */
export interface DriveSample {
  /** Session seconds (SimTick.t). */
  t: number;
  speedKmh: number;
  x: number;
  y: number;
}

/** One line of the transition log — why each step ended and where. */
export interface DriveStepLogEntry {
  index: number;
  label: string;
  /** Session seconds the step began / ended. */
  startedAtSec: number;
  endedAtSec: number;
  reason: "forSec" | "stopped" | "near" | "timeout";
  /** Speed and position AT THE HANDOVER — the numbers a review row argues over. */
  speedKmh: number;
  x: number;
  y: number;
}

export interface DriveScriptState {
  readonly steps: readonly DriveStep[];
  /** Index of the running step; === steps.length once the script is finished. */
  readonly index: number;
  readonly startedAtSec: number;
  readonly stepStartedAtSec: number;
  readonly lastT: number;
  readonly integral: number;
  /** Consecutive seconds under STOP_SPEED_MS inside the current step. */
  readonly stoppedForSec: number;
  /** Seconds spent in the current half of the standstill brake duty cycle. */
  readonly standstillPhaseS: number;
  /** Which half: true = pedal down. See STANDSTILL_BRAKE_ON_S. */
  readonly standstillBraking: boolean;
  readonly finished: boolean;
  readonly log: readonly DriveStepLogEntry[];
}

export function createDriveScript(steps: readonly DriveStep[], tSec = 0): DriveScriptState {
  return {
    steps,
    index: 0,
    startedAtSec: tSec,
    stepStartedAtSec: tSec,
    lastT: tSec,
    integral: 0,
    stoppedForSec: 0,
    standstillPhaseS: 0,
    standstillBraking: true,
    finished: steps.length === 0,
    log: [],
  };
}

export function currentStep(state: DriveScriptState): DriveStep | null {
  return state.steps[state.index] ?? null;
}

export function stepLabel(state: DriveScriptState): string {
  const s = currentStep(state);
  if (s === null) return state.finished ? "(finished)" : "(idle)";
  return s.label ?? `${s.speedKmh} km/h`;
}

const IDLE: DriveCommand = { throttle: 0, brake: 0, steer: 0 };

function distanceTo(sample: DriveSample, p: WorldPoint): number {
  return Math.hypot(sample.x - p.x, sample.y - p.y);
}

/**
 * Target speed (m/s) for this step at this sample: the cruise cap, lowered by
 * the braking ramp when the step names a `stopAt` point.
 */
export function targetSpeedMs(step: DriveStep, sample: DriveSample): number {
  const cruise = Math.max(0, step.speedKmh) / KMH;
  if (step.stopAt === undefined) return cruise;
  const within = step.withinM ?? DEFAULT_WITHIN_M;
  const decel = step.decelMs2 ?? DEFAULT_DECEL_MS2;
  // Aim at the NEAR edge of the tolerance ring, so the ramp reaches zero just
  // as the car enters it rather than at its far side.
  const d = Math.max(0, distanceTo(sample, step.stopAt) - within * 0.5);
  return Math.min(cruise, Math.sqrt(2 * decel * d));
}

/**
 * Advance the controller one frame.
 *
 * Returns a NEW state (never mutates) plus the command to inject this frame.
 * `transitioned` is true on the frame a step handed over — the DOM half uses it
 * to re-key the held keys, and a capture script uses it to know when to shoot.
 */
export function stepDriveScript(
  state: DriveScriptState,
  sample: DriveSample,
): { state: DriveScriptState; command: DriveCommand; transitioned: boolean } {
  const step = currentStep(state);
  if (step === null) {
    return {
      state: { ...state, lastT: sample.t, finished: true },
      command: IDLE,
      transitioned: false,
    };
  }

  const dt = clamp(sample.t - state.lastT, 0, MAX_DT_S);
  // MAGNITUDE, not signed: the scene publishes a signed speed, and a car
  // rolling BACKWARDS at 16 km/h must read as „16 km/h too fast for a stop",
  // not as zero. (max(0, v) was the first spelling and it left a reversing car
  // with no pedal at all.)
  const vMs = Math.abs(sample.speedKmh) / KMH;
  const target = targetSpeedMs(step, sample);
  const err = target - vMs;

  // -- pedals ---------------------------------------------------------------
  let throttle = 0;
  let brake = 0;
  let integral = state.integral;
  let standstillPhaseS = 0;
  let standstillBraking = true;
  if (target <= 0.01 && vMs <= STOP_SPEED_MS) {
    // Standstill: PULSE the brake by default — see the STANDSTILL_BRAKE_ON_S
    // note. `holdBrake` opts into the continuous hold a real student applies.
    if (step.holdBrake === true) {
      brake = 1;
    } else {
      standstillPhaseS = state.standstillPhaseS + dt;
      standstillBraking = state.standstillBraking;
      if (standstillBraking && standstillPhaseS >= STANDSTILL_BRAKE_ON_S) {
        standstillBraking = false;
        standstillPhaseS = 0;
      } else if (!standstillBraking && standstillPhaseS >= STANDSTILL_BRAKE_OFF_S) {
        standstillBraking = true;
        standstillPhaseS = 0;
      }
      brake = standstillBraking ? 1 : 0;
    }
    integral = 0;
  } else if (err > SPEED_DEADBAND_MS) {
    const next = integral + err * dt;
    throttle = clamp(KP_THROTTLE * err + KI_THROTTLE * next, 0, 1);
    // Anti-windup: the integrator only grows while the throttle has headroom.
    integral = throttle < 1 ? clamp(next, 0, INTEGRAL_CLAMP) : integral;
  } else if (err < -SPEED_DEADBAND_MS) {
    brake = clamp(KP_BRAKE * -err, 0, 1);
    integral = 0;
  } else {
    integral = integral * 0.9;
  }

  // -- terminators ----------------------------------------------------------
  const elapsed = sample.t - state.stepStartedAtSec;
  const within = step.withinM ?? DEFAULT_WITHIN_M;
  const stoppedForSec = vMs <= STOP_SPEED_MS ? state.stoppedForSec + dt : 0;

  let reason: DriveStepLogEntry["reason"] | null = null;
  if (step.forSec !== undefined && elapsed >= step.forSec) reason = "forSec";
  else if (
    step.stopAt !== undefined &&
    stoppedForSec >= STOP_HOLD_S &&
    distanceTo(sample, step.stopAt) <= within
  )
    reason = "stopped";
  else if (step.untilNear !== undefined && distanceTo(sample, step.untilNear) <= within)
    reason = "near";
  else if (elapsed >= (step.timeoutSec ?? DEFAULT_STEP_TIMEOUT_S)) reason = "timeout";

  const command: DriveCommand = { throttle, brake, steer: step.steer ?? 0 };

  if (reason === null) {
    return {
      state: { ...state, lastT: sample.t, integral, stoppedForSec, standstillPhaseS, standstillBraking },
      command,
      transitioned: false,
    };
  }

  const entry: DriveStepLogEntry = {
    index: state.index,
    label: step.label ?? `${step.speedKmh} km/h`,
    startedAtSec: state.stepStartedAtSec,
    endedAtSec: sample.t,
    reason,
    speedKmh: sample.speedKmh,
    x: sample.x,
    y: sample.y,
  };
  const index = state.index + 1;
  return {
    state: {
      ...state,
      index,
      stepStartedAtSec: sample.t,
      lastT: sample.t,
      integral: 0,
      stoppedForSec: 0,
      // NOT reset — see the STANDSTILL_BRAKE_ON_S note. Restarting the pulse
      // here without lifting the pedal fuses two ON phases into one hold long
      // enough to trip the auto-reverse assist.
      standstillPhaseS,
      standstillBraking,
      finished: index >= state.steps.length,
      log: [...state.log, entry],
    },
    command,
    transitioned: true,
  };
}

// ---------------------------------------------------------------------------
// URL / JSON parsing
// ---------------------------------------------------------------------------

const isPoint = (v: unknown): v is WorldPoint =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as WorldPoint).x === "number" &&
  typeof (v as WorldPoint).y === "number";

/**
 * Parse a `?script=` payload (URL-decoded JSON array of DriveStep) into steps.
 *
 * Deliberately strict and silent-free: an unparseable or malformed script
 * returns null and the caller reports it, because a rig that quietly drives a
 * DIFFERENT script than the one asked for is exactly the failure this whole
 * instrument exists to end.
 */
export function parseDriveScript(raw: string): DriveStep[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: DriveStep[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.speedKmh !== "number" || !Number.isFinite(o.speedKmh)) return null;
    const step: DriveStep = { speedKmh: o.speedKmh };
    if (typeof o.label === "string") step.label = o.label;
    if (isPoint(o.stopAt)) step.stopAt = { x: o.stopAt.x, y: o.stopAt.y };
    if (isPoint(o.untilNear)) step.untilNear = { x: o.untilNear.x, y: o.untilNear.y };
    if (typeof o.withinM === "number") step.withinM = o.withinM;
    if (typeof o.decelMs2 === "number") step.decelMs2 = o.decelMs2;
    if (typeof o.steer === "number") step.steer = o.steer;
    if (typeof o.forSec === "number") step.forSec = o.forSec;
    if (typeof o.timeoutSec === "number") step.timeoutSec = o.timeoutSec;
    if (Array.isArray(o.keys) && o.keys.every((k) => typeof k === "string")) {
      step.keys = o.keys as string[];
    }
    out.push(step);
  }
  return out;
}
