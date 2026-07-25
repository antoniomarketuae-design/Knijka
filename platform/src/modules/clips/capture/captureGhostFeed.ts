/**
 * captureGhostFeed — the ghost-as-player world feed (doc 66 R1), extracted
 * from CaptureScene so the capture mount and the node-side parity tests run
 * ONE implementation (the pilot-v2 lesson applied to the stepper itself:
 * a re-implementation is a place for divergence to hide).
 *
 * The stepper advances the production stack in the scripted recorder's exact
 * frame order (recordScriptedDrive.stepStack: runtime → traffic → leadGap →
 * sample → director) with the GHOST's interpolated trace pose as "the
 * player", supplying EVERY channel the director consumes exactly as the
 * recorder did: pose/speed/heading from the trace, brakePedal 0 (the
 * recorder's own hardcode — staged actors were recorded against it), and the
 * runtime's tick events (the trigger channel runners like roundaboutEntry
 * and amberDilemma adjudicate on). Proven per failed pilot-v2 clip in
 * captureFeedParity.test.ts: every staged actor arms and moves in this feed
 * exactly as it did in the recording.
 *
 * It also OWNS the R1 presence log honesty: staging-truth counters over the
 * whole walk, plus framedKinds — actor kinds inside the PLANNED frame during
 * the fault beat (capturePlan.actorInPlannedFrame), the channel the POSTed
 * actor checklist reads.
 */

import type { ScenarioDirector } from "@/modules/sim/orchestrator";
import { createWorldRuntime } from "@/modules/sim/runtime";
import type { TrafficSystem } from "@/modules/sim/traffic";
import { createTracePoint, sampleAt, type ScenarioTrace } from "@/modules/sim/traces";
import { createVehicleSample } from "@/modules/sim/scene/vehicleSample";
import {
  actorInPlannedFrameFor,
  FAULT_PRESENCE_SPAN_S,
  markFramedKind,
  type ActorPresenceLog,
  type CameraProfile,
  type CaptureCabinChannels,
} from "./capturePlan";

/** World-stack sub-step, s — SCRIPT_DT parity (the recorder ran 1/60). */
export const STACK_STEP_S = 1 / 60;

export interface CaptureFeedStepper {
  readonly tSec: number;
  /** Step the production stack forward to `target` in ≤ STACK_STEP_S bites. */
  advanceTo(target: number): void;
}

export interface CaptureFeedArgs {
  runtime: ReturnType<typeof createWorldRuntime>;
  traffic: TrafficSystem;
  director: ScenarioDirector | null;
  trace: ScenarioTrace;
  cabin: CaptureCabinChannels;
  env: { night: boolean; rain: boolean; fog: boolean; snow: boolean };
  /** Parked-car scenario obstacles (occupied bays) — static frame candidates. */
  obstacleVehicles: ReadonlyArray<{ x: number; y: number }>;
  /** Trim-window start — frame sampling never counts the pre-roll. */
  windowStartSec: number;
  /** The PLAN's engine fault time — center of the R1 presence beat. */
  faultTimeSec: number;
  /** The PLAN card's exterior camera profile — the presence law measures the
   *  frame the viewer actually gets (rearAware clips look BACKWARD; grading
   *  them with the chase cone would call a framed ambulance absent).
   *  Default "chase". */
  cameraProfile?: CameraProfile;
  /** The live presence log (the rig swaps it per clip — read fresh). */
  getLog: () => ActorPresenceLog | null;
}

export function createCaptureFeedStepper(args: CaptureFeedArgs): CaptureFeedStepper {
  const {
    runtime,
    traffic,
    director,
    trace,
    cabin,
    env,
    obstacleVehicles,
    windowStartSec,
    faultTimeSec,
    cameraProfile = "chase",
    getLog,
  } = args;
  const pt = createTracePoint();
  const sample = createVehicleSample();
  // The R1 presence band — AT the fault (founder pilot-v2 ruling: an actor
  // in frame two seconds early but gone from the fault frame is ABSENT).
  const beatStart = Math.max(windowStartSec, faultTimeSec - FAULT_PRESENCE_SPAN_S);
  const beatEnd = faultTimeSec + FAULT_PRESENCE_SPAN_S;
  let t = 0;

  /** Staging truth — peak pool counts over pre-roll + window (debug channel). */
  const notePresence = () => {
    const log = getLog();
    if (!log) return;
    if (traffic.vehicles.length > log.vehicles) log.vehicles = traffic.vehicles.length;
    if (traffic.pedestrians.length > log.pedestrians) log.pedestrians = traffic.pedestrians.length;
    for (const v of traffic.vehicles) {
      const p = v.profile ?? "car";
      if (!log.profiles.includes(p)) log.profiles.push(p);
    }
    log.obstacleVehicles = obstacleVehicles.length;
  };

  /** R1 honesty — kinds inside the planned frame during the fault beat. */
  const noteFramed = () => {
    const log = getLog();
    if (!log) return;
    for (const v of traffic.vehicles) {
      if (!actorInPlannedFrameFor(cameraProfile, pt, v.x, v.y)) continue;
      markFramedKind(log, "vehicle");
      if (v.profile !== undefined) markFramedKind(log, v.profile);
    }
    for (const p of traffic.pedestrians) {
      if (actorInPlannedFrameFor(cameraProfile, pt, p.x, p.y)) markFramedKind(log, "pedestrian");
    }
    for (const o of obstacleVehicles) {
      if (actorInPlannedFrameFor(cameraProfile, pt, o.x, o.y)) markFramedKind(log, "parkedvehicle");
    }
  };

  return {
    get tSec() {
      return t;
    },
    advanceTo(target: number): void {
      while (t < target - 1e-6) {
        const dt = Math.min(STACK_STEP_S, target - t);
        t += dt;
        sampleAt(trace, t, pt);
        // The recorder's frame order (recordScriptedDrive.stepStack):
        // runtime → traffic → leadGap → sample → director.
        runtime.update(dt);
        traffic.update(dt, {
          signalPhase: (id) => runtime.signalPhase(id),
          playerPos: { x: pt.x, y: pt.y },
          playerSpeedKmh: Math.abs(pt.speedKmh),
          playerHeadingDeg: pt.headingDeg,
        });
        const leadGap = traffic.leadGapMeters(pt.x, pt.y, pt.headingDeg);
        sample.position.x = pt.x;
        sample.position.y = pt.y;
        sample.headingDeg = pt.headingDeg;
        sample.speedKmh = pt.speedKmh; // signed — the recorder's convention
        sample.indicator = pt.indicator;
        sample.headlights = cabin.headlights;
        sample.seatbeltOn = cabin.seatbeltOn;
        sample.handbrakeOn = false;
        sample.gear = pt.gear;
        sample.mirrorGlance = null;
        sample.stalled = false;
        sample.fogLightsOn = false;
        const tick = runtime.sample(sample, t, env.night, env.rain, leadGap, env.fog, env.snow);
        if (director) {
          // brakePedal 0 + unsigned speed — recordScriptedDrive's exact feed
          // (the staged actors were recorded against these values).
          director.step({
            tSec: t,
            dtSec: dt,
            x: pt.x,
            y: pt.y,
            speedKmh: Math.abs(pt.speedKmh),
            headingDeg: pt.headingDeg,
            brakePedal: 0,
            tickEvents: tick.events,
          });
        }
        if (t >= beatStart && t <= beatEnd) noteFramed();
      }
      notePresence();
    },
  };
}
