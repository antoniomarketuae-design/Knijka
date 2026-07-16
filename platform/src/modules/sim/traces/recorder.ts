/**
 * Trace recorders (doc 76 §5) — the two ways a ScenarioTrace is born:
 *
 * 1. `recordScriptedDrive` — HEADLESS: drives an authored script through the
 *    PRODUCTION stack (createWorldRuntime + createTrafficSystem + scenario
 *    director + rule engine — the same wiring LessonScene and the C1
 *    driver-bot harness use) and returns the trace PLUS the rule-engine
 *    event log, so every shadow demo can be gated on "replays with zero
 *    violations" (doc 76 §5 validation rule). Kinematic, deterministic,
 *    node-safe: usable from vitest, tools/ pipelines and the browser.
 *
 * 2. `createTraceRecorder` — LIVE: a ring recorder the scene's frame loop
 *    pushes into (student attempts). Columnar typed-array storage, scheduled
 *    ~20 Hz decimation, ZERO allocation per push — the LessonScene frame-loop
 *    law. Events (glances/signals/driveline) are sparse and may allocate.
 */

import type { StagedEventOutcome, StagedEventSpec, VehicleSample } from "../contracts";
import { createScenarioDirector } from "../orchestrator";
import {
  createRuleEngine,
  reduceTick,
  type HeadlightState,
  type RuleEngineConfig,
  type RuleEvent,
  type SimTick,
} from "../rules";
import { createWorldRuntime, type SignalClusterMode } from "../runtime";
import { createTrafficSystem } from "../traffic/system";
import type { TrafficDistrict } from "../traffic/types";
import { CHASSIS_HALF_EXTENTS, ESTIMATE_WHEELBASE } from "../vehicle";
import {
  TRACE_SAMPLE_HZ,
  TRACE_VERSION,
  type ScenarioTrace,
  type TraceEvent,
  type TraceEventKind,
  type TraceIndicator,
  type TraceKind,
  type TraceSample,
} from "./types";

// ---------------------------------------------------------------------------
// Live ring recorder (student attempts — LessonScene frame hook)
// ---------------------------------------------------------------------------

export interface LiveTraceSampleInput {
  tSec: number;
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

export interface LiveRecorderOptions {
  scenarioId: string;
  kind: TraceKind;
  /** Sampling cadence, Hz (default TRACE_SAMPLE_HZ = 20). */
  hz?: number;
  /** Ring capacity in seconds — older samples are overwritten (default 300 s). */
  maxDurationSec?: number;
  /** Sparse-event cap; further events are dropped (default 512). */
  maxEvents?: number;
}

export interface LiveTraceRecorder {
  /** Feed the CURRENT frame; the recorder decimates to its cadence. Zero-alloc. */
  push(s: LiveTraceSampleInput): void;
  /** Record a sparse event at `tSec` (glance/signal/driveline/annotation). */
  addEvent(kind: TraceEventKind, tSec: number, textBg?: string, detail?: string): void;
  /** Drop everything and start over (retry). */
  reset(): void;
  /** Assemble the trace (rebased so the first retained sample is t = 0);
   *  null while fewer than two samples exist. Allocates — end-of-run only. */
  finish(): ScenarioTrace | null;
  readonly sampleCount: number;
}

const IND_TO_CODE: Record<TraceIndicator, number> = { off: 0, left: 1, right: 2 };
const CODE_TO_IND: readonly TraceIndicator[] = ["off", "left", "right"];

export function createTraceRecorder(options: LiveRecorderOptions): LiveTraceRecorder {
  const hz = options.hz ?? TRACE_SAMPLE_HZ;
  const period = 1 / hz;
  const capacity = Math.max(16, Math.ceil((options.maxDurationSec ?? 300) * hz));
  const maxEvents = options.maxEvents ?? 512;

  // Columnar ring storage — one typed array per channel, mutated in place.
  const colT = new Float64Array(capacity);
  const colX = new Float64Array(capacity);
  const colY = new Float64Array(capacity);
  const colH = new Float64Array(capacity);
  const colSteer = new Float64Array(capacity);
  const colSpeed = new Float64Array(capacity);
  const colGear = new Int8Array(capacity);
  const colInd = new Uint8Array(capacity);
  const colFlags = new Uint8Array(capacity); // bit0 = brake, bit1 = throttle

  let head = 0; // next write slot
  let count = 0;
  let nextT = -Infinity; // first push is always accepted
  let events: TraceEvent[] = [];

  return {
    get sampleCount() {
      return count;
    },

    push(s: LiveTraceSampleInput): void {
      if (s.tSec + 1e-6 < nextT) return;
      // Scheduled cadence: march the grid forward; re-anchor after stalls
      // (pause menus) so the next sample lands promptly, not in the past.
      nextT = nextT === -Infinity || s.tSec > nextT + period ? s.tSec + period : nextT + period;
      colT[head] = s.tSec;
      colX[head] = s.x;
      colY[head] = s.y;
      colH[head] = s.headingDeg;
      colSteer[head] = s.steerRad;
      colSpeed[head] = s.speedKmh;
      colGear[head] = s.gear;
      colInd[head] = IND_TO_CODE[s.indicator] ?? 0;
      colFlags[head] = (s.brakeOn ? 1 : 0) | (s.throttleOn ? 2 : 0);
      head = (head + 1) % capacity;
      if (count < capacity) count++;
    },

    addEvent(kind, tSec, textBg, detail) {
      if (events.length >= maxEvents) return;
      const e: TraceEvent = { tSec, kind };
      if (textBg !== undefined) e.textBg = textBg;
      if (detail !== undefined) e.detail = detail;
      events.push(e);
    },

    reset() {
      head = 0;
      count = 0;
      nextT = -Infinity;
      events = [];
    },

    finish(): ScenarioTrace | null {
      if (count < 2) return null;
      const start = (head - count + capacity) % capacity;
      const t0 = colT[start];
      const samples: TraceSample[] = new Array(count);
      for (let i = 0; i < count; i++) {
        const j = (start + i) % capacity;
        samples[i] = {
          tSec: colT[j] - t0,
          x: colX[j],
          y: colY[j],
          headingDeg: colH[j],
          steerRad: colSteer[j],
          speedKmh: colSpeed[j],
          gear: colGear[j],
          indicator: CODE_TO_IND[colInd[j]] ?? "off",
          brakeOn: (colFlags[j] & 1) !== 0,
          throttleOn: (colFlags[j] & 2) !== 0,
        };
      }
      const durationSec = samples[count - 1].tSec;
      const outEvents = events
        .filter((e) => e.tSec >= t0)
        .map((e) => ({ ...e, tSec: e.tSec - t0 }))
        .sort((a, b) => a.tSec - b.tSec);
      return {
        meta: {
          scenarioId: options.scenarioId,
          kind: options.kind,
          version: TRACE_VERSION,
          durationSec,
        },
        samples,
        events: outEvents,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Scripted headless recorder (shadow / mistake demos — the C1 bot's mold)
// ---------------------------------------------------------------------------

/** What a synthesized contact hit — mirrors the runtime's CollisionWith
 *  vocabulary (worldRuntime.pushCollision → COLLISION detail). */
export type TraceCollisionWith = "vehicle" | "pedestrian" | "cyclist" | "staticObject";

/** One authored instruction of a drive script. `drive`/`pause` consume time;
 *  the rest are instantaneous markers applied at the current clock. */
export type DriveStep =
  | {
      kind: "drive";
      /** District-space polyline the car follows (lane-positioned by the
       *  author — the recorder does NOT lane-offset). */
      points: ReadonlyArray<readonly [number, number]>;
      targetKmh: number;
      /** Reverse gear: travel along the polyline facing AWAY from travel. */
      reverse?: boolean;
      /** Come to rest at the polyline end (default: stop only when the next
       *  timed step is not a same-direction drive). */
      stopAtEnd?: boolean;
      /**
       * Braking-rate override for THIS step, m/s² (capability phase — the
       * SP-11/VP-09 unlock). The default SCRIPT_DECEL (4.6, the C1 comfortable
       * rate) caps every stop below the HARSH_BRAKING_NO_CAUSE threshold
       * (harshBrakeDecelMps2 = 7), which structurally blocked authoring the
       * „рязко спиране без причина" mistake. A slam demo passes ≥ 10 here: the
       * stop envelope tracks 0.7 × this value, so 12 ⇒ a sustained ~8.4 m/s²
       * stab the detector grades. ABSENT = the former hardcode, byte-identical.
       */
      maxDecelMps2?: number;
    }
  | { kind: "pause"; sec: number; brake?: boolean }
  | { kind: "indicator"; setting: TraceIndicator }
  | { kind: "glance"; mirror: "left" | "right" | "rear" }
  | { kind: "annotation"; textBg: string }
  /**
   * S1 mistake-demo seam: an AUTHORED consequence at the current clock — the
   * scripted „пешеходец зад колата" of a no-observation demo. Pushed into the
   * production runtime (pushCollision), so the rule engine grades it exactly
   * like a physics contact would; it is a scripted narrative beat, never a
   * geometric check (those are `obstacles` below).
   */
  | { kind: "collision"; withWhat: TraceCollisionWith }
  /**
   * Cockpit-state channels (capability phase — the AC/VP unlock). Each sets a
   * discrete telemetry channel the rule engine reads, at the current clock,
   * held until the next same-kind step. DEFAULTS match the recorder's former
   * hardcodes exactly (headlights = isNight ? "low" : "off"; seatbelt on;
   * handbrake off), so a script that never emits these records BYTE-IDENTICAL
   * to before — every shipped trace is unaffected. A mistake demo flips one
   * (lights off at night, belt off while moving, handbrake left on) to grade
   * the matching code; a shadow sets the correct state.
   */
  | { kind: "headlights"; setting: HeadlightState }
  | { kind: "seatbelt"; on: boolean }
  | { kind: "handbrake"; on: boolean }
  /**
   * Front fog lamps (the FOG unlock — doc 72 AC-03; the cockpit V key /
   * driveline fogLightsOn channel). Same cockpit-channel discipline as
   * headlights above: DEFAULT OFF = the recorder's former hardcode (no
   * channel), so every script that never emits this records BYTE-IDENTICAL
   * to before. A fog shadow sets {on:true}; the fog-lamp mistake demo leaves
   * it off and grades FOG_LIGHTS_OFF_IN_FOG.
   */
  | { kind: "fogLights"; on: boolean }
  /**
   * Stall channel (capability phase — the VP-04 unlock). Mirrors the
   * driveline's LATCHED stall flag (VehicleSample.stalled: set by a stall,
   * cleared by the next successful restart), held until the next stall step —
   * exactly the cockpit-channel discipline above. The rule engine grades the
   * RISING EDGE as one официална второстепенна „загасване" (ENGINE_STALLED);
   * emitting {on:false} is the restart that re-arms the episode. DEFAULT
   * false = the recorder's former hardcode, so any script that never emits it
   * records BYTE-IDENTICAL to before.
   */
  | { kind: "stall"; on: boolean };

/**
 * One flat obstacle rect in district space (S1) — the headless twin of the
 * scene's ScenarioObstacles colliders: while a drive script runs, the hero
 * footprint (CHASSIS_HALF_EXTENTS) is SAT-tested against these every frame,
 * and an overlap at/above `collisionMinKmh` pushes a runtime collision the
 * rules engine grades (COLLISION, detail = withWhat). This is what arms the
 * doc 76 §5/§9 gates: a shadow demo proves it NEVER touches the parked cars;
 * a clipping mistake demo proves it grades COLLISION at walking speed.
 */
export interface ObstacleRect2D {
  x: number;
  y: number;
  /** District heading of the rect's LENGTH axis (0 = north, cw). */
  headingDeg: number;
  halfWidthM: number;
  halfLengthM: number;
  withWhat: TraceCollisionWith;
  /**
   * TIMED-OBSTACLE activation (doc 72 VU-04 „Вратата" — the door-swing
   * unlock): the rect is INERT until the PLAYER first comes within
   * `trigger.distM` of `trigger` (x, y), then LATCHES armed for the rest of
   * the drive — the telltale position-trigger discipline (deterministic per
   * script pace, robust across shadow/mistake speeds; a time-based arm would
   * silently drift with authored pacing). ABSENT = always active — the S1
   * behavior, byte-identical for every shipped obstacle set.
   */
  trigger?: { x: number; y: number; distM: number };
}

/**
 * 2D OBB overlap (separating-axis test over both rects' axes). Pure —
 * exported for the trace-gate tests. Headings: 0 = north, cw-positive
 * (district convention); length runs along the heading.
 */
export function obstacleRectsOverlap(
  a: { x: number; y: number; headingDeg: number; halfWidthM: number; halfLengthM: number },
  b: { x: number; y: number; headingDeg: number; halfWidthM: number; halfLengthM: number },
): boolean {
  const rects = [a, b];
  for (let r = 0; r < 2; r++) {
    const h = (rects[r].headingDeg * Math.PI) / 180;
    // Axis along the length (sin h, cos h) and across it (cos h, −sin h).
    const axes: Array<readonly [number, number]> = [
      [Math.sin(h), Math.cos(h)],
      [Math.cos(h), -Math.sin(h)],
    ];
    for (const [ux, uy] of axes) {
      let min0 = Infinity;
      let max0 = -Infinity;
      let min1 = Infinity;
      let max1 = -Infinity;
      for (let i = 0; i < 2; i++) {
        const rect = rects[i];
        const hh = (rect.headingDeg * Math.PI) / 180;
        const axX = Math.sin(hh);
        const axY = Math.cos(hh);
        const latX = Math.cos(hh);
        const latY = -Math.sin(hh);
        const c = rect.x * ux + rect.y * uy;
        const ext =
          rect.halfLengthM * Math.abs(axX * ux + axY * uy) +
          rect.halfWidthM * Math.abs(latX * ux + latY * uy);
        if (i === 0) {
          min0 = c - ext;
          max0 = c + ext;
        } else {
          min1 = c - ext;
          max1 = c + ext;
        }
      }
      if (max0 < min1 || max1 < min0) return false; // separating axis found
    }
  }
  return true;
}

export interface DriveScript {
  steps: DriveStep[];
}

export interface RecordScriptedDriveOptions {
  scenarioId: string;
  kind: TraceKind;
  /** Deterministic seed for traffic + director (default 7). */
  seed?: number;
  stagedEvents?: StagedEventSpec[];
  /** Ambient traffic (default 0/0 — staged actors only, the harness law). */
  vehicleCount?: number;
  pedestrianCount?: number;
  isNight?: boolean;
  rain?: boolean;
  /** FOG condition flag (doc 72 AC-03) — reaches every tick through
   *  runtime.sample exactly like `rain`. Default false = today. */
  fog?: boolean;
  /** SNOW condition flag (doc 72 AC-08 winter grip) — the same seam again
   *  (tick.snow). Default false = today, byte-identical. The recorder stays
   *  KINEMATIC: snow-grip ghost envelopes are AUTHORED per script
   *  (SCRIPT_DECEL × SNOW_GRIP_FACTOR — the wet dual-channel honesty). */
  snow?: boolean;
  /** Hard cap on scripted-drive length (default 900 s). */
  maxDurationSec?: number;
  /**
   * S1: precise scenario obstacles (parked cars from the district's
   * meta.scenario.bays, cones, …) — SAT-tested against the hero footprint
   * every frame; an overlap pushes a runtime collision (rising edge per
   * obstacle). Absent = no geometric contacts (the S0 behavior).
   */
  obstacles?: readonly ObstacleRect2D[];
  /**
   * Contact-grading threshold, km/h, for `obstacles` (the VehicleRig seam):
   * default 10 = the street nudge tolerance; parking scenarios pass 0 so a
   * 2 km/h bumper touch IS the graded mistake (doc 76 §0).
   */
  collisionMinKmh?: number;
  /**
   * S2 (junction/signal family): deterministic session-start signal pinning —
   * the same doc 72 N2 dial the director exposes as
   * ScenarioDirectorOptions.signalOffsets, applied through the runtime's
   * PUBLIC setSignalClusterOffset before the first frame (sorted-key order,
   * the director's own convention). Authored demos on signalized micro-maps
   * pin the phase their story needs („arrive on red") instead of leaning on
   * the map's natural FNV-1a offset. Absent = natural offsets.
   */
  signalOffsets?: Readonly<Record<string, number>>;
  /**
   * S2 (signals family): deterministic session-start signal CONTROL MODE — the
   * sibling of signalOffsets. Sets a junction DARK / on FLASHING AMBER before
   * the first frame (sorted-key order) through the runtime's PUBLIC
   * setSignalClusterMode, so a dead-signal / flashing-amber drill grades the
   * junction as UNCONTROLLED (right-hand rule; doc 72 JU-09/JU-20). Absent =
   * every cluster live (today's behavior, byte-identical).
   */
  signalModes?: Readonly<Record<string, SignalClusterMode>>;
  /**
   * S1 full-pipeline hook: every production tick of the drive, AFTER the
   * scenario director appended its events — the SAME object the internal
   * rule engine reduces. The bot-completion proof feeds these into a REAL
   * lesson session (createLessonSession + applyTick), so a scripted attempt
   * exercises objectives/coach/wire exactly like a live drive.
   */
  onTick?: (tick: SimTick) => void;
  /**
   * Rule-engine config override for the recorder's INTERNAL grader (the
   * `ruleEvents` innocence/§9 channel only — the serialized trace bytes never
   * depend on it). A lesson that DRILLS a config-gated detector
   * (moveOffObservation, junctionScanObservation, followRainAware…) passes the
   * enabling override here so its shadow/mistake demos grade through exactly
   * the config the live lesson would run. Absent = DEFAULT_RULE_CONFIG.
   */
  ruleConfig?: Partial<RuleEngineConfig>;
}

export interface RecordedDrive {
  trace: ScenarioTrace;
  /** Full chronological rule-engine log of the drive — the zero-violation
   *  CI gate for shadow demos reads this. */
  ruleEvents: RuleEvent[];
  /** Staged-encounter resolutions (empty without stagedEvents). */
  outcomes: StagedEventOutcome[];
}

/** Simulation rate of the scripted recorder; 3:1 against TRACE_SAMPLE_HZ so
 *  decimation lands exactly on the 20 Hz grid. */
const SCRIPT_DT = 1 / 60;
const SCRIPT_ACCEL = 2.2; // m/s² — the C1 bot's comfortable rates
/**
 * Default comfortable braking rate of the kinematic recorder, m/s² (the C1
 * bot's dry rate; per-step override via DriveStep.maxDecelMps2). EXPORTED
 * (4a) so wet-surface trace scripts can author their demo envelope from the
 * same constant the dry demos implicitly use (e.g. SCRIPT_DECEL ×
 * WET_GRIP_FACTOR) — the recorder itself is kinematic and NEVER reads the
 * live physics gripFactor; the ghost's honesty is authored.
 */
export const SCRIPT_DECEL = 4.6;

function wrap180(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Internal arclength walker over one drive step's polyline. */
class StepPath {
  readonly px: number[] = [];
  readonly py: number[] = [];
  readonly cum: number[] = [0];
  readonly length: number;
  /** 2 m-sampled headings for the curve-speed cap. */
  private readonly hArc: number[] = [];
  private readonly hDeg: number[] = [];

  constructor(points: ReadonlyArray<readonly [number, number]>) {
    for (const [x, y] of points) {
      const n = this.px.length;
      if (n > 0 && Math.hypot(x - this.px[n - 1], y - this.py[n - 1]) < 1e-6) continue;
      this.px.push(x);
      this.py.push(y);
      if (this.px.length > 1) {
        const i = this.px.length - 1;
        this.cum.push(
          this.cum[i - 1] + Math.hypot(this.px[i] - this.px[i - 1], this.py[i] - this.py[i - 1]),
        );
      }
    }
    this.length = this.cum[this.cum.length - 1] ?? 0;
    let acc = 0;
    for (let i = 0; i < this.px.length - 1; i++) {
      const dx = this.px[i + 1] - this.px[i];
      const dy = this.py[i + 1] - this.py[i];
      const segLen = Math.hypot(dx, dy);
      const h = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      for (let q = 0; q < segLen; q += 2) {
        this.hArc.push(acc + q);
        this.hDeg.push(h);
      }
      acc += segLen;
    }
  }

  poseAt(s: number): { x: number; y: number; headingDeg: number } {
    const ss = Math.max(0, Math.min(this.length, s));
    let i = 0;
    while (i < this.cum.length - 2 && this.cum[i + 1] < ss) i++;
    const segLen = this.cum[i + 1] - this.cum[i];
    const t = segLen > 0 ? (ss - this.cum[i]) / segLen : 0;
    const dx = this.px[i + 1] - this.px[i];
    const dy = this.py[i + 1] - this.py[i];
    return {
      x: this.px[i] + dx * t,
      y: this.py[i] + dy * t,
      headingDeg: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360,
    };
  }

  /** |Σ heading deltas| over (s, s+aheadM] — the C1 curve-speed input. */
  curvatureAhead(s: number, aheadM: number): number {
    const { hArc, hDeg } = this;
    let lo = 0;
    let hi = hArc.length - 1;
    if (hi < 1) return 0;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (hArc[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    let sum = 0;
    for (let i = lo; i + 1 < hArc.length && hArc[i + 1] <= s + aheadM; i++) {
      sum += wrap180(hDeg[i + 1] - hDeg[i]);
    }
    return Math.abs(sum);
  }
}

/**
 * Drive an authored script through the production stack and record it.
 *
 * The movement model is the C1 driver-bot's kinematic core (accel/decel
 * limits + curve-speed caps over the authored polyline) — NOT physics, by
 * design (doc 76 trap 3). The production runtime + rule engine grade every
 * frame exactly as LessonScene would, so the returned `ruleEvents` log is
 * the authoritative innocence check for shadow demos.
 */
export function recordScriptedDrive(
  districtRaw: unknown,
  script: DriveScript,
  options: RecordScriptedDriveOptions,
): RecordedDrive {
  // --- production stack (the orchestrator-harness wiring, LessonScene's) ---
  const runtime = createWorldRuntime(districtRaw);
  // Session-start phase pinning (S2) — sorted for deterministic application
  // order regardless of object shape (the director's applySignalOffsets law).
  for (const [nodeId, offsetSec] of Object.entries(options.signalOffsets ?? {}).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    runtime.setSignalClusterOffset(nodeId, offsetSec);
  }
  // Session-start control-mode pinning (S2) — same sorted-key discipline as
  // signalOffsets, applied through the runtime's PUBLIC setSignalClusterMode.
  for (const [nodeId, mode] of Object.entries(options.signalModes ?? {}).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  )) {
    runtime.setSignalClusterMode(nodeId, mode);
  }
  const traffic = createTrafficSystem(districtRaw as TrafficDistrict, {
    seed: options.seed ?? 7,
    vehicleCount: options.vehicleCount ?? 0,
    pedestrianCount: options.pedestrianCount ?? 0,
  });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  runtime.setCyclistQuery((px, py, h, r) => traffic.cyclistNear(px, py, h, r));
  const staged = options.stagedEvents ?? [];
  const director =
    staged.length > 0
      ? createScenarioDirector(staged, traffic, { seed: options.seed ?? 7, signals: runtime })
      : null;
  let rules = createRuleEngine(options.ruleConfig);
  const ruleEvents: RuleEvent[] = [];
  const outcomes: StagedEventOutcome[] = [];

  // --- recording state -----------------------------------------------------
  const samples: TraceSample[] = [];
  const events: TraceEvent[] = [];
  let t = 0;
  let frame = 0;
  let indicator: TraceIndicator = "off";
  let pendingGlance: "left" | "right" | "rear" | null = null;
  let pose = { x: 0, y: 0, headingDeg: 0 };
  let prevHeading: number | null = null;
  let speedMps = 0;

  const isNight = options.isNight ?? false;
  const rain = options.rain ?? false;
  const fog = options.fog ?? false;
  const snow = options.snow ?? false;
  const maxFrames = Math.ceil((options.maxDurationSec ?? 900) / SCRIPT_DT);

  // Cockpit-state channels (see the DriveStep doc): initial values are the
  // recorder's former hardcodes, so scripts that never touch them are
  // byte-identical to before.
  let headlights: HeadlightState = isNight ? "low" : "off";
  let seatbeltOn = true;
  let handbrakeOn = false;
  let stalledOn = false;
  let fogLightsOn = false;

  const emitEvent = (kind: TraceEventKind, textBg?: string, detail?: string) => {
    const e: TraceEvent = { tSec: t, kind };
    if (textBg !== undefined) e.textBg = textBg;
    if (detail !== undefined) e.detail = detail;
    events.push(e);
  };

  // Last-known discrete state — the closing sample repeats it verbatim.
  let lastGear = 1;
  let lastBrake = false;
  let lastThrottle = false;
  let lastReverse = false;

  const record = (gear: number, brakeOn: boolean, throttleOn: boolean, reverse: boolean) => {
    lastGear = gear;
    lastBrake = brakeOn;
    lastThrottle = throttleOn;
    lastReverse = reverse;
    // Front-wheel steer estimate (bicycle model) for the ghost's wheel visual.
    let steerRad = 0;
    if (prevHeading !== null && Math.abs(speedMps) > 0.4) {
      const yawRate = (wrap180(pose.headingDeg - prevHeading) * Math.PI) / 180 / SCRIPT_DT;
      // headingDeg is cw-positive; steer is POSITIVE-LEFT (ccw) → negate.
      steerRad = Math.atan((ESTIMATE_WHEELBASE * -yawRate) / Math.max(Math.abs(speedMps), 0.4));
      if (reverse) steerRad = -steerRad;
      steerRad = Math.max(-0.6, Math.min(0.6, steerRad));
    }
    if (frame % 3 === 0) {
      const speedKmh = (reverse ? -1 : 1) * speedMps * 3.6;
      samples.push({
        tSec: t,
        x: pose.x,
        y: pose.y,
        headingDeg: pose.headingDeg,
        // Normalize -0 (atan/product artifacts) — JSON drops the sign and the
        // determinism law compares serialized forms.
        steerRad: steerRad === 0 ? 0 : steerRad,
        speedKmh: speedKmh === 0 ? 0 : speedKmh,
        gear,
        indicator,
        brakeOn,
        throttleOn,
      });
    }
  };

  // S1 obstacle contacts: rising-edge SAT overlap of the hero footprint vs
  // each authored rect (the ScenarioObstacles twin). Latched per obstacle so
  // a continuing contact pushes once; separating re-arms it. A rect with a
  // `trigger` starts INERT and latches ARMED on the player's first approach
  // (the VU-04 door swing — see the ObstacleRect2D doc); trigger-less rects
  // start armed, byte-identical to the S1 behavior.
  const obstacles = options.obstacles ?? [];
  const obstacleContact = new Array<boolean>(obstacles.length).fill(false);
  const obstacleArmed = obstacles.map((o) => o.trigger === undefined);
  const collisionMinKmh = options.collisionMinKmh ?? 10;
  const heroRect = {
    x: 0,
    y: 0,
    headingDeg: 0,
    halfWidthM: CHASSIS_HALF_EXTENTS.x,
    halfLengthM: CHASSIS_HALF_EXTENTS.z,
  };

  /** One production-ordered frame: runtime → traffic → sample → director → rules. */
  const stepStack = () => {
    // Obstacle contacts push BEFORE sample() — the pushCollision contract
    // (events drain into the next tick, exactly like a physics handler).
    if (obstacles.length > 0) {
      heroRect.x = pose.x;
      heroRect.y = pose.y;
      heroRect.headingDeg = pose.headingDeg;
      const speedKmh = Math.abs(speedMps) * 3.6;
      for (let i = 0; i < obstacles.length; i++) {
        // Timed activation: latch the arm on the player's first approach to
        // the authored trigger point; an unarmed rect is fully inert (no
        // contact, no latched state — driving "through" it before the arm
        // never bills, exactly the door-still-closed reality).
        if (!obstacleArmed[i]) {
          const trig = obstacles[i].trigger!;
          if (Math.hypot(pose.x - trig.x, pose.y - trig.y) <= trig.distM) {
            obstacleArmed[i] = true;
          } else {
            obstacleContact[i] = false;
            continue;
          }
        }
        const hit = obstacleRectsOverlap(heroRect, obstacles[i]);
        if (hit && !obstacleContact[i] && speedKmh >= collisionMinKmh) {
          runtime.pushCollision(obstacles[i].withWhat);
        }
        obstacleContact[i] = hit;
      }
    }
    runtime.update(SCRIPT_DT);
    traffic.update(SCRIPT_DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: pose.x, y: pose.y },
      playerSpeedKmh: Math.abs(speedMps) * 3.6,
      playerHeadingDeg: pose.headingDeg,
    });
    const leadGap = traffic.leadGapMeters(pose.x, pose.y, pose.headingDeg);
    const vehicleSample: VehicleSample = {
      position: { x: pose.x, y: pose.y },
      headingDeg: pose.headingDeg,
      // Live parity (vehicleSample.ts): SIGNED speed (negative in reverse)
      // and the CONTRACT gear (−1 = R) — the parkInBay usedReverse credit
      // and the A12 reverse exemptions read exactly these channels.
      speedKmh: (lastReverse ? -1 : 1) * Math.abs(speedMps) * 3.6,
      indicator,
      headlights,
      seatbeltOn,
      handbrakeOn,
      gear: lastGear,
      mirrorGlance: pendingGlance,
      stalled: stalledOn,
      fogLightsOn,
    };
    pendingGlance = null;
    const tick = runtime.sample(vehicleSample, t, isNight, rain, leadGap, fog, snow);
    if (director) {
      const res = director.step({
        tSec: t,
        dtSec: SCRIPT_DT,
        x: pose.x,
        y: pose.y,
        speedKmh: speedMps * 3.6,
        headingDeg: pose.headingDeg,
        brakePedal: 0,
        tickEvents: tick.events,
      });
      for (const e of res.events) tick.events.push(e);
      outcomes.push(...res.outcomes);
    }
    options.onTick?.(tick);
    const reduced = reduceTick(rules, tick);
    rules = reduced.state;
    ruleEvents.push(...reduced.events);
  };

  const advanceFrame = () => {
    stepStack();
    t += SCRIPT_DT;
    frame++;
  };

  // Seed the pose from the first drive step so the t=0 sample is placed.
  const firstDrive = script.steps.find((s) => s.kind === "drive");
  if (firstDrive && firstDrive.kind === "drive" && firstDrive.points.length >= 2) {
    const path = new StepPath(firstDrive.points);
    const p = path.poseAt(0);
    pose = firstDrive.reverse
      ? { x: p.x, y: p.y, headingDeg: (p.headingDeg + 180) % 360 }
      : p;
  }

  const steps = script.steps;
  for (let si = 0; si < steps.length && frame < maxFrames; si++) {
    const step = steps[si];
    if (step.kind === "indicator") {
      if (step.setting !== indicator) {
        indicator = step.setting;
        if (indicator === "off") emitEvent("signal-off");
        else emitEvent("signal-on", undefined, indicator);
      }
      continue;
    }
    if (step.kind === "glance") {
      pendingGlance = step.mirror;
      emitEvent(`glance-${step.mirror}` as TraceEventKind);
      continue;
    }
    if (step.kind === "annotation") {
      emitEvent("annotation", step.textBg);
      continue;
    }
    if (step.kind === "collision") {
      // Authored consequence — drains into the NEXT frame's tick (a pause or
      // drive step must follow so a frame exists to grade it).
      runtime.pushCollision(step.withWhat);
      continue;
    }
    if (step.kind === "headlights") {
      headlights = step.setting;
      continue;
    }
    if (step.kind === "seatbelt") {
      seatbeltOn = step.on;
      continue;
    }
    if (step.kind === "handbrake") {
      handbrakeOn = step.on;
      continue;
    }
    if (step.kind === "stall") {
      stalledOn = step.on;
      continue;
    }
    if (step.kind === "fogLights") {
      fogLightsOn = step.on;
      continue;
    }
    if (step.kind === "pause") {
      const until = t + step.sec;
      speedMps = 0;
      while (t < until && frame < maxFrames) {
        record(lastGear, step.brake ?? false, false, false);
        advanceFrame();
      }
      continue;
    }

    // --- drive step ---------------------------------------------------------
    if (step.points.length < 2) continue;
    const path = new StepPath(step.points);
    const reverse = step.reverse ?? false;
    // Stop at the end unless the NEXT timed step is a same-direction drive.
    let stopAtEnd = step.stopAtEnd ?? true;
    if (step.stopAtEnd === undefined) {
      for (let sj = si + 1; sj < steps.length; sj++) {
        const nxt = steps[sj];
        if (nxt.kind === "drive") {
          stopAtEnd = (nxt.reverse ?? false) !== reverse;
          break;
        }
        if (nxt.kind === "pause") break; // a pause means: arrive at rest
      }
    }
    let s = 0;
    const targetBase = step.targetKmh / 3.6;
    // Per-step braking rate (see the DriveStep doc) — default is the former
    // hardcode, so scripts without the override are byte-identical.
    const decel = step.maxDecelMps2 ?? SCRIPT_DECEL;
    while (s < path.length - 0.05 && frame < maxFrames) {
      let target = targetBase;
      // Curve-speed cap (the C1 windows) so heading changes stay drivable.
      for (const aheadM of [10, 18, 30]) {
        const dh = path.curvatureAhead(s, aheadM);
        if (dh > 8) {
          const radius = aheadM / ((dh * Math.PI) / 180);
          target = Math.min(target, Math.max(1.6, Math.sqrt(2.4 * radius)));
        }
      }
      if (stopAtEnd) {
        const dEnd = path.length - s;
        target = Math.min(target, Math.sqrt(2 * (decel * 0.7) * Math.max(0, dEnd)));
      }
      const braking = target < speedMps - 0.05;
      const accelerating = target > speedMps + 0.05;
      if (accelerating) speedMps = Math.min(target, speedMps + SCRIPT_ACCEL * SCRIPT_DT);
      else if (braking) speedMps = Math.max(target, speedMps - decel * SCRIPT_DT);
      s = Math.min(path.length, s + speedMps * SCRIPT_DT);
      prevHeading = pose.headingDeg;
      const p = path.poseAt(s);
      pose = reverse ? { x: p.x, y: p.y, headingDeg: (p.headingDeg + 180) % 360 } : p;
      record(reverse ? -1 : 1, braking, accelerating, reverse);
      advanceFrame();
    }
    if (stopAtEnd) speedMps = 0;
    prevHeading = pose.headingDeg;
  }

  // Closing sample so the last pose is always captured exactly — with the
  // last-known discrete state (a brake-hold pause ends still on the brake).
  const lastT = samples.length > 0 ? samples[samples.length - 1].tSec : -1;
  if (t > lastT + 1e-6) {
    frame = 0; // force-record
    record(lastGear, lastBrake, lastThrottle, lastReverse);
  }

  const durationSec = samples.length > 0 ? samples[samples.length - 1].tSec : 0;
  return {
    trace: {
      meta: {
        scenarioId: options.scenarioId,
        kind: options.kind,
        version: TRACE_VERSION,
        durationSec,
      },
      samples,
      events,
    },
    ruleEvents,
    outcomes,
  };
}
