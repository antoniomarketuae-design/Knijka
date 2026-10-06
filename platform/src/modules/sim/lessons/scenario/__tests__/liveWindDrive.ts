/**
 * LIVE WIND DRIVE — the product's own car, on the product's own lesson stack,
 * in process. Test support only; nothing in the product imports it.
 *
 * WHY IT EXISTS — founder ruling 2026-10-04 («Stronger wind»,
 * sc-ac-crosswind:a9db1738). Every committed demo of the two crosswind lessons
 * is KINEMATIC (`traces/recorder.ts` never runs `VehicleSim`), and
 * `liveChainReplay.ts` — the witness harness next door — says so about itself:
 * „the one part of the live stack that is not in process is rapier". That is
 * exactly the part a wind retune changes. A claim like „a correct drive that
 * holds the lane with the correction stays at 0 т." cannot be made on a pose
 * source the wind never touches, so this harness supplies the missing half:
 *
 *   RAPIER world (flat ground) + `createHeadlessChassis` + `VehicleSim`,
 *     constructed with the options `LessonScene` hands `VehicleRig` for the
 *     compiled rung — `physics.crosswind` → −CROSSWIND_BRIDGE_N with the
 *     −CROSSWIND_GUST_AMPLITUDE_N sine, `physics.wetGrip` → WET_GRIP_FACTOR —
 *     spawned at the rung's own spawn point, stepped at FIXED_DT with a
 *     driveline (the honest machine every cabin session runs);
 *   the driver's RAW input shaped by `applyDifficulty` exactly as
 *     `VehicleRig` shapes it before `sim.update` — the learner tier's
 *     steering sensitivity and low-pass, its throttle curve and its governor
 *     scaled to the district's own speed domain. That is not a detail here:
 *     on the default tier a student's hand is worth 0.8 of the wheel, so „how
 *     much input holds the lane" has two honest answers and this harness
 *     reports both (`steerInput` = his hand, `steerRad` = the wheel);
 *   the chassis pose mapped to district space the way `scene/vehicleSample.ts`
 *     maps it (district x = world x, district y = −world z, heading 0 = north,
 *     clockwise);
 *   then `liveChainReplay`'s stack, frame for frame: createWorldRuntime +
 *     createTrafficSystem (the rung's live options) + wireTrafficQueries +
 *     createScenarioDirector(lesson.stagedEvents) → runtime.update →
 *     traffic.update → runtime.sample → director.step → applyTick →
 *     buildLessonResult.
 *
 * THE DRIVER IS A CONTROLLER, NOT A REPLAY. It follows the PATH of the lesson's
 * committed shadow demo (the line the product itself calls correct), at that
 * demo's speeds, signalling and glancing where the demo does — but the wheel is
 * its own, closed on where the real car actually is:
 *
 *   · "analog"   — a proportional wheel (a thumb on the touch pad, a stick):
 *                  pure pursuit on the path plus a slow integral, the way a
 *                  driver settles onto a held correction.
 *   · "keyboard" — the PC wheel is DIGITAL (`engine/input.ts`:
 *                  `out.steer = (left ? 1 : 0) - (right ? 1 : 0)`), so this
 *                  driver may only press or release: it taps toward the analog
 *                  driver's wish, a press never shorter than
 *                  `KEY_MIN_PRESS_FRAMES`, and the tier's low-pass is what
 *                  turns those taps into a wheel movement — as in the product.
 *   · "gamepad"  — a stick with the product's dead zone (`engine/input.ts`:
 *                  `GAMEPAD_DEADZONE` 0.12, no rescale): the smallest hand it
 *                  can hold is 13 %, three times what this wind asks for, so
 *                  below that it PULSES — a sigma-delta on the analog
 *                  driver's hand, a pulse never shorter than a key press.
 *   · "handsOff" — pedals only; the wheel is never touched.
 *   · "late"     — hands off until the car has been carried `lateAfterM` off
 *                  the line, then the analog driver takes over (the «reacts a
 *                  beat late» student; what must stay a correction, not a
 *                  crash).
 *
 * A LAPSE (`lapse`) is any of those drivers with the wheel let go for a
 * stated stretch of session time — the „reaction time" a sentence about
 * displacement is talking about, measured on the lesson's own stack.
 *
 * THE CAR IS BUILT BY THE PRODUCT'S OWN MAPPING. `productSimOptions` is
 * `rigSimOptions(lessonRigPhysics(lesson.physics))` — the two functions
 * `LessonScene` and `VehicleRig` call (`vehicle/lessonWind.ts`). Round 1 of
 * this harness retyped the sign, the amplitude and the period by hand, and its
 * verifier (V-08) pointed out that nothing would have noticed the copy going
 * stale; `vehicle/lessonWind.test.ts` now holds both component sources to the
 * shared call.
 *
 * WHAT IT DOES NOT MODEL. Static world geometry (kerbs, parked cars, façades)
 * has no collider here, so a car that leaves the road is graded by the lane /
 * carriageway / wrong-way channels of the runtime and never by a contact. The
 * staged cast IS covered (the director's own sentinel). Every witness that uses
 * a hands-off drive asserts on those channels and on the measured excursion.
 */

import RAPIER from "@dimforge/rapier3d-compat";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../../traffic/types";
import { ambientSidewalkBudget } from "../../../traffic/pedestrians";
import { createScenarioDirector, lessonSeed } from "../../../orchestrator/director";
import { applySignalModes, wireTrafficQueries } from "../../../scene/lessonWorldRecipe";
import { DEFAULT_LESSON_TRAFFIC } from "../../../contracts";
import type { LessonSpec, StagedEventSpec } from "../../../contracts";
import type { ScenarioTrace } from "../../../traces/types";
import { lessonRequiredSpeedKmh } from "../../../scene/lessonSpeedContract";
import {
  applyDifficulty,
  cockpitLeanFromSim,
  createDriveAssistState,
  createHeadlessChassis,
  createSecondSwingState,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  FIXED_DT,
  GRAVITY,
  IDLE_INPUT,
  lessonRigPhysics,
  READY_DRIVELINE,
  rigSimOptions,
  SPAWN,
  STEER_FULL_SPEED_KMH,
  STEER_MAX_ANGLE,
  STEER_MIN_ANGLE,
  STEER_MIN_SPEED_KMH,
  stepSecondSwing,
  VehicleSim,
  WHEEL_POSITIONS,
  type DifficultyMode,
  type VehicleSimOptions,
} from "../../../vehicle";
import { applyTick, buildLessonResult, createLessonSession } from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";

export type WindDriver = "analog" | "keyboard" | "keyboardRationed" | "gamepad" | "handsOff" | "late";

/** The stick's dead zone (`engine/input.ts` `GAMEPAD_DEADZONE`, not exported)
 *  and the smallest deflection safely outside it (`devrig/rig.ts`
 *  `DEADZONE_SAFE`). */
export const GAMEPAD_DEADZONE = 0.12;
export const GAMEPAD_MIN_HAND = 0.13;

/** Axle-to-axle distance, m — read off the attachment points, so this harness
 *  also runs against a tree that predates `tuning.WHEELBASE_M` (the BEFORE
 *  column of the 2026-10-04 measurement was taken with it, on the base tree). */
const WHEELBASE_M = WHEEL_POSITIONS[0].z - WHEEL_POSITIONS[2].z;

/** A keyboard press can not be shorter than this many 60 Hz frames (50 ms). */
export const KEY_MIN_PRESS_FRAMES = 3;

export interface LiveWindDriveOptions {
  lesson: LessonSpec;
  districtRaw: unknown;
  /** The lesson's committed shadow demo — the PATH and the speeds to follow. */
  trace: ScenarioTrace;
  driver: WindDriver;
  /** "late" only: metres off the line before the hands come back. */
  lateAfterM?: number;
  /** "keyboard" / "gamepad": the shortest press, in 60 Hz frames. Default
   *  `KEY_MIN_PRESS_FRAMES` (50 ms); 6 = 100 ms, 9 = 150 ms, 12 = 200 ms. */
  keyMinPressFrames?: number;
  /** Let the wheel go for `forSec` of session time, whatever the driver — then
   *  he takes it back. It starts at session time `atSec`, or (for a comparison
   *  across speeds, where the same PLACE is what must match) once the car has
   *  covered `atPathM` metres of the followed path. */
  lapse?: { atSec?: number; atPathM?: number; forSec: number };
  /**
   * A SCRIPTED HAND (round 3): from session time `atSec`, or once `atPathM`
   * metres of the path are covered, the driver's raw input is replaced by
   * `steps` in order — each held at `input` for `forSec`, or ramped linearly
   * from `input` to `to` over it — and then the driver takes the wheel back
   * from where the hand was left. It is how a sentence about a MOVEMENT of the
   * hand («рязката корекция срещу порива», «втори замах», «отпускай
   * корекцията плавно») is driven on the lesson's own stack. The scripted hand
   * goes to the second-swing detector exactly as a real one would.
   */
  handScript?: {
    atSec?: number;
    atPathM?: number;
    steps: ReadonlyArray<{ forSec: number; input: number; to?: number }>;
  };
  /**
   * Override the speed to hold on the move, km/h (the demo's own speed profile
   * by default). The «50 км/ч, отпусната ръка» mistake is this plus "handsOff".
   */
  cruiseKmh?: number;
  /**
   * Override the physics options the rung would get — for the BEFORE column of
   * a base-vs-tree measurement and for mutation controls. Default: exactly
   * what `LessonScene` passes for `lesson.physics`.
   */
  simOptions?: VehicleSimOptions;
  /** Stop after this many session seconds whatever happened. Default 150. */
  maxSec?: number;
  /** The learner tier whose input shaping applies. Default: the product's. */
  difficulty?: DifficultyMode;
}

export interface LiveWindSample {
  t: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKmh: number;
  /** The driver's HAND: his raw input, −1..1 (+ = left), before the tier's
   *  shaping — the stick, the thumb on the pad, the key. */
  steerInput: number;
  /** What reached the car: the shaped input `VehicleSim.update` was given. */
  shapedSteer: number;
  /** The driver's wheel as a road-wheel angle, rad (`VehicleSim.steerRad`) —
   *  what the cockpit rim turns with. */
  steerRad: number;
  /** Signed distance from the followed path, m (+ = left of it). */
  offPathM: number;
  /** The wind's force on the chassis, N along world +X (`windLateralNow`). */
  windN: number;
  /** Road-wheel angle the wind is adding, rad (`windSteerPullRad`). */
  windPullRad: number;
  /** What `CameraRig` feeds the head lean, m/s² (+ = pushed left) —
   *  `cockpitLeanFromSim` on this frame's car. */
  leanMs2: number;
  /** The nearest same-direction vehicle (the staged truck, when there is one):
   *  metres AHEAD of the car along its heading (negative = behind) and metres
   *  to its RIGHT. `null` when none is within 300 m. */
  truckAheadM: number | null;
  truckRightM: number | null;
}

export interface LiveWindDriveOutcome {
  lesson: LessonSpec;
  session: LessonSessionState;
  result: LessonResult;
  violationCodes: string[];
  commendationCodes: string[];
  samples: LiveWindSample[];
  /** Largest |distance from the followed path|, m, over the whole drive. */
  maxOffPathM: number;
  /** How many times `secondSwing.ts` fired on this driver's own wheel. */
  secondSwingFires: number;
  /** Session seconds driven. */
  durationSec: number;
  /** When the `lapse` began, session seconds (`null` = it never did). */
  lapseStartedAtSec: number | null;
  /** When the `handScript` began, session seconds (`null` = it never did). */
  handScriptStartedAtSec: number | null;
  /** Session seconds of every `secondSwing.ts` fire, in order. */
  secondSwingFiredAtSec: number[];
}

/** What `LessonScene` hands `VehicleRig` for this rung's `physics`. */
export function productSimOptions(lesson: LessonSpec): VehicleSimOptions {
  // The scene's mapping, then the rig's packing — the product's two calls.
  return rigSimOptions(lessonRigPhysics(lesson.physics));
}

/** `tuning.ts`'s speed-sensitive lock: the road-wheel angle full input gives. */
export function maxSteerRadAt(speedKmh: number): number {
  const f = Math.min(
    1,
    Math.max(
      0,
      (Math.abs(speedKmh) - STEER_FULL_SPEED_KMH) / (STEER_MIN_SPEED_KMH - STEER_FULL_SPEED_KMH),
    ),
  );
  return STEER_MAX_ANGLE + (STEER_MIN_ANGLE - STEER_MAX_ANGLE) * f;
}

interface SpawnPointLike {
  id: string;
  x: number;
  y: number;
  heading?: number;
}

function liveSpawn(lesson: LessonSpec, raw: unknown): { x: number; y: number; headingDeg: number } {
  const pts = ((raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? []) as SpawnPointLike[];
  const explicit = lesson.spawn.position;
  const p = lesson.spawn.pointId ? pts.find((s) => s.id === lesson.spawn.pointId) : undefined;
  return {
    x: p?.x ?? explicit?.x ?? 0,
    y: p?.y ?? explicit?.y ?? 0,
    headingDeg: p?.heading ?? lesson.spawn.headingDeg ?? 0,
  };
}

/** The followed path: the demo's samples, thinned to moving points, with arc length. */
interface PathPoint {
  x: number;
  y: number;
  s: number;
  /** Index of the demo sample this point came from. */
  i: number;
}

function buildPath(trace: ScenarioTrace): PathPoint[] {
  const pts: PathPoint[] = [];
  let s = 0;
  for (let i = 0; i < trace.samples.length; i++) {
    const p = trace.samples[i]!;
    const last = pts[pts.length - 1];
    if (last !== undefined) {
      const d = Math.hypot(p.x - last.x, p.y - last.y);
      if (d < 0.25) continue;
      s += d;
    }
    pts.push({ x: p.x, y: p.y, s, i });
  }
  return pts;
}

let rapierReady: Promise<void> | null = null;
/** Await once before the first drive (vitest `beforeAll`). */
export function initLiveWindDrive(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

export function liveWindDrive(opts: LiveWindDriveOptions): LiveWindDriveOutcome {
  const { lesson, districtRaw: raw, trace } = opts;

  // --- the lesson stack, as liveChainReplay builds it ------------------------
  const runtime = createWorldRuntime(raw);
  const spawn = liveSpawn(lesson, raw);
  if (lesson.signalPlan) runtime.armSignalPlan(lesson.signalPlan, spawn);
  applySignalModes(runtime, lesson);
  const trafficSpec = lesson.traffic;
  const traffic = createTrafficSystem(raw as TrafficDistrict, {
    anchor: spawn,
    anchorRadiusM: trafficSpec?.anchorRadiusM ?? DEFAULT_LESSON_TRAFFIC.anchorRadiusM,
    anchorPath: trafficSpec?.anchorPath,
    vehicleCount: trafficSpec?.vehicleCount ?? DEFAULT_LESSON_TRAFFIC.vehicleCount,
    pedestrianCount: trafficSpec?.pedestrianCount ?? DEFAULT_LESSON_TRAFFIC.pedestrianCount,
    sidewalkPedestrianCount:
      trafficSpec?.sidewalkPedestrianCount ??
      ambientSidewalkBudget(
        raw as TrafficDistrict,
        DEFAULT_TRAFFIC_CONFIG.footwaylessRoadClasses,
        DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      ),
  });
  wireTrafficQueries(runtime, traffic);
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const director =
    staged.length > 0
      ? createScenarioDirector(staged, traffic, { seed: lessonSeed(lesson.id), signals: runtime })
      : null;
  let session = createLessonSession(lesson);

  // --- the car: rapier + VehicleSim, the product's options for this rung ------
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
  world.timestep = FIXED_DT;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000).setTranslation(0, -1, 0).setFriction(1),
  );
  const body = createHeadlessChassis(RAPIER, world);
  const sim = new VehicleSim(
    world,
    body,
    // district (x, yNorth) → three.js (x, _, −yNorth); yaw = π − heading
    // (LessonScene's own spawn mapping).
    { x: spawn.x, y: SPAWN.y, z: -spawn.y, yawRad: Math.PI - (spawn.headingDeg * Math.PI) / 180 },
    opts.simOptions ?? productSimOptions(lesson),
  );
  sim.reset();

  const env = lesson.environment;
  const isNight = env?.timeOfDay === "night";
  const rain = env?.rain === true;
  const fog = env?.fog === true;
  const snow = env?.snow === true;
  const headlights = isNight || rain || fog || snow ? "low" : "off";

  const path = buildPath(trace);
  const endS = path[path.length - 1]!.s;
  const glances = trace.events.filter((e) => e.kind.startsWith("glance-"));
  let glanceIdx = 0;
  let seg = 0; // index of the path segment the car is on
  let integ = 0;
  let handsBack = opts.driver !== "late";
  let hand = 0; // the analog driver's raw input, −1..1
  let keyHeld = 0; // −1 / 0 / +1: the key currently down
  let keyFrames = 0; // frames the current key state has been held
  const minPress = opts.keyMinPressFrames ?? KEY_MIN_PRESS_FRAMES;
  let keyDebt = 0; // "keyboardRationed": wheel still owed, in lock-share·frames
  let lapseStartedAtSec: number | null = null;
  let handScriptStartedAtSec: number | null = null;
  const secondSwingFiredAtSec: number[] = [];
  let stick = 0; // the gamepad's output: 0 or beyond the dead zone
  let stickFrames = 0;
  let stickDebt = 0; // sigma-delta accumulator, in hand·frames
  const swing = createSecondSwingState();
  let secondSwingFires = 0;
  // VehicleRig's shaping, with LessonScene's own speed-domain arguments.
  const mode = opts.difficulty ?? DEFAULT_DIFFICULTY;
  const assist = createDriveAssistState();
  const edges = ((raw as { roads?: { edges?: Array<{ maxspeed?: number }> } }).roads?.edges ?? []);
  let maxLegal = 0;
  for (const e of edges) {
    if (typeof e.maxspeed === "number" && Number.isFinite(e.maxspeed) && e.maxspeed > maxLegal) {
      maxLegal = e.maxspeed;
    }
  }
  const lessonMaxLegalKmh = maxLegal > 0 ? maxLegal : undefined;
  const lessonRequiredKmh = lessonRequiredSpeedKmh(
    raw as Parameters<typeof lessonRequiredSpeedKmh>[0],
  );

  const samples: LiveWindSample[] = [];
  let maxOffPathM = 0;
  let t = 0;
  let frames = 0;
  const maxSec = opts.maxSec ?? 150;

  while (t <= maxSec && session.phase !== "completed" && session.phase !== "aborted") {
    if (frames > 0) t += FIXED_DT;
    frames++;

    // --- where the real car is, in district space (vehicleSample.ts) ---------
    const st = sim.debugState();
    const q = st.rotation;
    // local forward (0,0,1) rotated by q
    const fwdX = 2 * (q.x * q.z + q.w * q.y);
    const fwdZ = 1 - 2 * (q.x * q.x + q.y * q.y);
    const x = st.position.x;
    const y = -st.position.z;
    const headingDeg = ((Math.atan2(fwdX, -fwdZ) * 180) / Math.PI + 360) % 360;
    const speedKmh = sim.speedKmh;
    const vMs = Math.abs(speedKmh) / 3.6;

    // --- project onto the followed path --------------------------------------
    while (seg < path.length - 2) {
      const a = path[seg + 1]!;
      const b = path[seg + 2]!;
      const ux = b.x - a.x;
      const uy = b.y - a.y;
      if ((x - a.x) * ux + (y - a.y) * uy < 0) break;
      seg++;
    }
    const a = path[seg]!;
    const b = path[seg + 1]!;
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const len = Math.hypot(ux, uy);
    const along = Math.min(len, Math.max(0, ((x - a.x) * ux + (y - a.y) * uy) / len));
    const sNow = a.s + along;
    // + = the car is LEFT of the path (path direction × offset, z up).
    const offPathM = (ux * (y - a.y) - uy * (x - a.x)) / len;
    maxOffPathM = Math.max(maxOffPathM, Math.abs(offPathM));
    const demoIdx = a.i;
    const demo = trace.samples[demoIdx]!;

    // --- the demo's own signals and looks, where the demo makes them ----------
    type Glance = "left" | "right" | "rear" | "shoulder";
    let glance: Glance | null = null;
    while (glanceIdx < glances.length && glances[glanceIdx]!.tSec <= demo.tSec + 1e-9) {
      glance = glances[glanceIdx]!.kind.slice("glance-".length) as Glance;
      glanceIdx++;
    }

    // --- pedals: hold the demo's speed (or the override) ----------------------
    const atEnd = endS - sNow < 1.5;
    const lookIdx = Math.min(trace.samples.length - 1, demoIdx + 12);
    const targetKmh = atEnd
      ? 0
      : Math.max(8, opts.cruiseKmh ?? Math.abs(trace.samples[lookIdx]!.speedKmh));
    const err = targetKmh - Math.abs(speedKmh);
    const throttle = atEnd ? 0 : Math.min(1, Math.max(0, 0.1 + 0.2 * err));
    const brake = atEnd ? 0.45 : err < -3 ? Math.min(0.45, -err * 0.05) : 0;

    // --- the wheel ------------------------------------------------------------
    // Pure pursuit: aim at the path point a speed-scaled distance ahead.
    const lookM = Math.max(6, 0.9 * vMs);
    let k = seg;
    while (k < path.length - 1 && path[k]!.s < sNow + lookM) k++;
    const aim = path[k]!;
    const bearing = Math.atan2(aim.x - x, aim.y - y); // 0 = north, cw+
    let alpha = bearing - (headingDeg * Math.PI) / 180;
    while (alpha > Math.PI) alpha -= 2 * Math.PI;
    while (alpha < -Math.PI) alpha += 2 * Math.PI;
    const aimDist = Math.max(2, Math.hypot(aim.x - x, aim.y - y));
    // alpha > 0 = the aim is to the RIGHT; steer is + = LEFT.
    const pursuitRad = -Math.atan((2 * WHEELBASE_M * Math.sin(alpha)) / aimDist);
    if (vMs > 2) integ = Math.min(4, Math.max(-4, integ + offPathM * FIXED_DT));
    // The WHEEL the driver wants, as a share of the lock available right now.
    const wish = Math.min(
      1,
      Math.max(-1, pursuitRad / maxSteerRadAt(speedKmh) - 0.035 * offPathM - 0.03 * integ),
    );

    if (!handsBack && Math.abs(offPathM) >= (opts.lateAfterM ?? 1)) handsBack = true;
    if (opts.lapse !== undefined && lapseStartedAtSec === null) {
      const due =
        opts.lapse.atPathM !== undefined ? sNow >= opts.lapse.atPathM : t >= (opts.lapse.atSec ?? Infinity);
      if (due) lapseStartedAtSec = t;
    }
    const lapsed =
      opts.lapse !== undefined && lapseStartedAtSec !== null && t < lapseStartedAtSec + opts.lapse.forSec;
    if (opts.handScript !== undefined && handScriptStartedAtSec === null) {
      const due =
        opts.handScript.atPathM !== undefined
          ? sNow >= opts.handScript.atPathM
          : t >= (opts.handScript.atSec ?? Infinity);
      if (due) handScriptStartedAtSec = t;
    }
    let scripted: number | null = null;
    if (opts.handScript !== undefined && handScriptStartedAtSec !== null) {
      let tau = t - handScriptStartedAtSec;
      for (const st of opts.handScript.steps) {
        if (tau < st.forSec) {
          scripted = st.to === undefined ? st.input : st.input + (st.to - st.input) * (tau / st.forSec);
          break;
        }
        tau -= st.forSec;
      }
    }

    let steerInput = 0;
    if (scripted !== null) {
      // The scripted hand; the driver resumes from where it leaves his hand.
      steerInput = scripted;
      hand = scripted;
      keyHeld = 0;
      keyFrames = 0;
      keyDebt = 0;
      stick = 0;
      stickFrames = 0;
      stickDebt = 0;
    } else if (opts.driver === "handsOff" || !handsBack || lapsed) {
      steerInput = 0;
      hand = 0;
      keyHeld = 0;
      keyFrames = 0;
      keyDebt = 0;
      stick = 0;
      stickFrames = 0;
      stickDebt = 0;
    } else if (opts.driver === "keyboard") {
      // A key is down or it is not. Tap toward the analog wish: press when the
      // wheel is short of it, release when it has caught up; never a press
      // shorter than a finger can make.
      const wheelNow = sim.steerRad / maxSteerRadAt(speedKmh);
      const short = wish - wheelNow;
      const want = short > 0.015 ? 1 : short < -0.015 ? -1 : 0;
      if (want !== keyHeld && (keyHeld === 0 || keyFrames >= minPress)) {
        keyHeld = want;
        keyFrames = 0;
      }
      keyFrames++;
      steerInput = keyHeld;
    } else if (opts.driver === "keyboardRationed") {
      // The same keys, pressed by someone who RATIONS them: he does not chase
      // the wheel with the opposite key, he lets it fall back by itself and
      // presses again only when the car has not had enough. A sigma-delta on
      // the analog driver's wish: a held key is worth the tier's sensitivity
      // (the low-pass keeps a pulse's area), so the debt is what the wheel
      // still owes the wish; a press starts when half a shortest press is
      // owed, lasts at least `minPress`, and ends when the debt is paid.
      const sens = DIFFICULTY_PRESETS[mode].steerSens;
      keyDebt += wish - sens * keyHeld;
      const quantum = sens * minPress;
      keyDebt = Math.min(2 * quantum, Math.max(-2 * quantum, keyDebt));
      if (keyHeld !== 0) {
        if (keyFrames >= minPress && (Math.sign(keyDebt) !== keyHeld || Math.abs(keyDebt) < sens)) {
          keyHeld = 0;
          keyFrames = 0;
        }
      } else if (keyFrames >= 2 && Math.abs(keyDebt) >= quantum / 2) {
        keyHeld = Math.sign(keyDebt);
        keyFrames = 0;
      }
      keyFrames++;
      steerInput = keyHeld;
    } else if (opts.driver === "gamepad") {
      // The analog driver's hand, through a stick that cannot report anything
      // under its dead zone: outside it the stick IS the hand; inside it the
      // hand is delivered as pulses of the smallest deflection the product
      // will read, their duty cycle the hand (a sigma-delta), no pulse and no
      // rest shorter than `minPress`.
      const wheelNow = sim.steerRad / maxSteerRadAt(speedKmh);
      hand = Math.min(1, Math.max(-1, hand + 0.25 * (wish - wheelNow)));
      if (Math.abs(hand) >= GAMEPAD_MIN_HAND) {
        stick = hand;
        stickFrames = 0;
        stickDebt = 0;
      } else {
        stickDebt += hand;
        const want =
          Math.abs(stickDebt) >= GAMEPAD_MIN_HAND * minPress ? Math.sign(stickDebt) * GAMEPAD_MIN_HAND : 0;
        if (want !== stick && stickFrames >= minPress) {
          stick = want;
          stickFrames = 0;
        }
        stickDebt -= stick;
        stickFrames++;
      }
      // `SimInput` zeroes anything inside the dead zone.
      steerInput = Math.abs(stick) < GAMEPAD_DEADZONE ? 0 : stick;
    } else {
      // A proportional control: he moves his hand until the WHEEL is where he
      // wants it, so his hand carries the tier's sensitivity (wish / sens at
      // speed). Closed on the wheel he can see, like the keyboard driver.
      const wheelNow = sim.steerRad / maxSteerRadAt(speedKmh);
      hand = Math.min(1, Math.max(-1, hand + 0.25 * (wish - wheelNow)));
      steerInput = hand;
    }

    // --- step the product's car, through the product's input shaping ----------
    const shaped = applyDifficulty(
      { ...IDLE_INPUT, throttle, brake, steer: steerInput },
      mode,
      speedKmh,
      FIXED_DT,
      assist,
      lessonMaxLegalKmh,
      lessonRequiredKmh,
    );
    const shapedSteer = shaped.steer;
    sim.update(shaped, FIXED_DT, READY_DRIVELINE);
    world.step();
    // The head lean's input, as `CameraRig` computes it on this frame's car.
    const windPullRad = sim.windSteerPullRad;
    // The SAME function `CameraRig` calls, handed the whole live car (round 3,
    // verifier V2-04): this sample cannot read a field the camera does not.
    const leanMs2 = cockpitLeanFromSim(sim);

    const read = stepSecondSwing(
      swing,
      // The hand goes in beside the wheel, as `LessonScene` passes it
      // (`GatedSimInput.rawSteer`).
      { tSec: t, steerRad: sim.steerRad, steerInput, speedKmh, windLatAccelMs2: sim.windLatAccelMs2 },
      FIXED_DT,
    );
    if (read.fired) {
      secondSwingFires++;
      secondSwingFiredAtSec.push(t);
    }

    samples.push({
      t,
      x,
      y,
      headingDeg,
      speedKmh,
      steerInput,
      shapedSteer,
      steerRad: sim.steerRad,
      offPathM,
      windN: sim.windLateralNow,
      windPullRad,
      leanMs2,
      truckAheadM: null,
      truckRightM: null,
    });

    // --- the lesson stack, LessonScene's order --------------------------------
    runtime.update(FIXED_DT);
    traffic.update(FIXED_DT, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x, y },
      playerSpeedKmh: Math.abs(speedKmh),
      playerHeadingDeg: headingDeg,
    });
    // Where the staged truck is, in the car's own frame (a read; it grades
    // nothing) — what a sentence about „its lee" has to be held against.
    {
      const hRad = (headingDeg * Math.PI) / 180;
      const fx = Math.sin(hRad);
      const fy = Math.cos(hRad);
      let best = Infinity;
      const last = samples[samples.length - 1]!;
      for (const v of traffic.sameDirVehiclesNear(x, y, headingDeg, 300)) {
        const dx = v.x - x;
        const dy = v.y - y;
        const d = Math.hypot(dx, dy);
        if (d < best) {
          best = d;
          last.truckAheadM = dx * fx + dy * fy;
          last.truckRightM = dx * fy - dy * fx;
        }
      }
    }
    const leadGap = traffic.leadGapMeters(x, y, headingDeg);
    const tick = runtime.sample(
      {
        position: { x, y },
        headingDeg,
        speedKmh,
        indicator: demo.indicator,
        headlights,
        seatbeltOn: true,
        handbrakeOn: false,
        gear: Math.max(1, Number(sim.gear) || 0),
        mirrorGlance: glance,
        stalled: false,
        fogLightsOn: fog,
        throttlePedal: throttle,
        engineOn: true,
      },
      t,
      isNight,
      rain,
      leadGap,
      fog,
      snow,
    );
    if (director) {
      const res = director.step({
        tSec: t,
        dtSec: FIXED_DT,
        x,
        y,
        speedKmh,
        headingDeg,
        brakePedal: brake,
        tickEvents: tick.events,
      });
      for (const e of res.events) tick.events.push(e);
    }
    session = applyTick(session, tick).state;
  }

  const result = buildLessonResult(session);
  sim.dispose();
  world.free();
  return {
    lesson,
    session,
    result,
    violationCodes: session.events.filter((e) => e.kind === "violation").map((e) => e.code),
    commendationCodes: session.events.filter((e) => e.kind === "commendation").map((e) => e.code),
    samples,
    maxOffPathM,
    secondSwingFires,
    durationSec: t,
    lapseStartedAtSec,
    handScriptStartedAtSec,
    secondSwingFiredAtSec,
  };
}

/** Mean / min / max of the driver's input over the samples a predicate keeps. */
export function steerStats(
  samples: readonly LiveWindSample[],
  keep: (s: LiveWindSample) => boolean,
): { n: number; mean: number; min: number; max: number } {
  let n = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    if (!keep(s)) continue;
    n++;
    sum += s.steerInput;
    min = Math.min(min, s.steerInput);
    max = Math.max(max, s.steerInput);
  }
  return { n, mean: n > 0 ? sum / n : 0, min, max };
}
