/**
 * ScenarioTrace v1 — the recorded-kinematics format of the Scenario Studio
 * (doc 76 §5): the Shadow Car, mistake demos and student-attempt recordings
 * all share this ONE shape, so ghost playback, attempt-compare, the A15
 * replay map and the future LLM debrief consume the same artifact.
 *
 * Design law (doc 76 §0 trap 3 — the re-simulation trap): a trace is a
 * RECORDED kinematic series, never re-simulated physics. Playback is
 * bit-stable, scrubbable and slowable on every device because it only ever
 * interpolates stored numbers (sample.ts).
 *
 * Pure TS, no three.js, no React — safe for node tests, tools and workers.
 */

/** Format version — bump on any breaking shape change; parse.ts rejects
 *  versions it does not understand (never trust stored JSON). */
export const TRACE_VERSION = 1;

/** Nominal kinematic sample rate, Hz (doc 76 §5). Samples carry their own
 *  tSec, so playback never assumes exact spacing — this is the AUTHORING
 *  cadence recorders aim for (~25 KB / 60 s). */
export const TRACE_SAMPLE_HZ = 20;

/** What a trace demonstrates — drives the ghost's visual identity
 *  (doc 76 §5: blue = correct shadow, RED + ❌ = mistake demo, yellow =
 *  the student's own attempt). */
export type TraceKind = "shadow" | "mistake" | "attempt";

export type TraceIndicator = "off" | "left" | "right";

/** One 20 Hz kinematic sample (district space: x east, y north, heading
 *  0 = north cw-positive — the VehicleSample conventions). */
export interface TraceSample {
  tSec: number;
  x: number;
  y: number;
  headingDeg: number;
  /** Front-wheel steer angle, rad, positive = left (VehicleSim.steerRad). */
  steerRad: number;
  /** Signed: negative while reversing (matches VehicleSim.speedKmh). */
  speedKmh: number;
  /** Contract gear: -1 = R, 0 = N/P, 1.. = forward. */
  gear: number;
  indicator: TraceIndicator;
  brakeOn: boolean;
  throttleOn: boolean;
}

/** Sparse event kinds riding beside the kinematic stream. */
export type TraceEventKind =
  | "glance-left"
  | "glance-right"
  | "glance-rear"
  /** The blind-spot check over the LEFT shoulder — a look, not a mirror
   *  (rules/types.ts `GlanceKind`). Added 2026-09-01 with the control that
   *  performs it; older traces simply never carry one. */
  | "glance-shoulder"
  | "signal-on"
  | "signal-off"
  | "driveline"
  | "annotation";

export interface TraceEvent {
  tSec: number;
  kind: TraceEventKind;
  /** Authored teach copy (annotation cards; the timeline shows it). */
  textBg?: string;
  /** Machine detail (e.g. the DrivelineEvent kind, or "left" on signal-on). */
  detail?: string;
}

export interface TraceMeta {
  /** Owning scenario/lesson id (e.g. "sc-park-perp-rev", "l0p-poligon-free"). */
  scenarioId: string;
  kind: TraceKind;
  version: number;
  durationSec: number;
}

export interface ScenarioTrace {
  meta: TraceMeta;
  /** tSec strictly ascending, starting at 0. */
  samples: TraceSample[];
  /** tSec ascending (independently of samples). */
  events: TraceEvent[];
}

/** Mutable playback point — preallocate once (createTracePoint) and let
 *  sampleAt write into it every frame; zero allocation on the hot path. */
export interface TracePoint {
  x: number;
  y: number;
  headingDeg: number;
  steerRad: number;
  speedKmh: number;
  gear: number;
  indicator: TraceIndicator;
  brakeOn: boolean;
  throttleOn: boolean;
}

export function createTracePoint(): TracePoint {
  return {
    x: 0,
    y: 0,
    headingDeg: 0,
    steerRad: 0,
    speedKmh: 0,
    gear: 0,
    indicator: "off",
    brakeOn: false,
    throttleOn: false,
  };
}

/**
 * Shared playback clock — the seam between the DOM timeline (controls) and
 * the in-canvas ghost (advances tSec inside useFrame while `playing`). Lives
 * in a ref on both sides: mutating it never re-renders React.
 */
export interface TraceClock {
  tSec: number;
  playing: boolean;
  /** Playback rate: 0.25 | 0.5 | 1 (free-valued by design). */
  speed: number;
  /** Loop section [startSec, endSec); null = loop the whole trace. */
  loop: { startSec: number; endSec: number } | null;
}

export function createTraceClock(): TraceClock {
  return { tSec: 0, playing: true, speed: 1, loop: null };
}
