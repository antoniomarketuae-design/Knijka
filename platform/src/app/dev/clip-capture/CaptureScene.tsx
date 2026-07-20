"use client";

/**
 * CaptureScene — the clip-capture rig's 3D mount (DEV ONLY, the why-panel
 * video pilot): the REAL simulator world of a scenario drill with the
 * template's RED mistake ghost replaying its committed trace, framed by a
 * demo follow-camera, on a FIXED 1280×720 canvas (dpr 1) that the client
 * records via canvas.captureStream + MediaRecorder.
 *
 * REUSE, not a second replay engine: playback is the production path —
 * ShadowCar + the shared TraceClock + traces.sampleAt (the „Демонстрация —
 * следвай сянката" machinery); the world is the production components with
 * LessonScene's exact recipes (bay paint, scenario obstacles, held scenery,
 * HDRI/night constants, signal-lamp wiring). What LessonScene adds and this
 * scene deliberately does NOT mount: the player VehicleRig (a parked hero
 * car would sit inside the ghost's start pose), every DOM overlay
 * (ControlsHelp / difficulty / DemoDeck / touch layers — the built-in
 * "clean" mode: nothing to suppress because nothing mounts; DOM never
 * reaches captureStream anyway), and the ambient TrafficLayer (no player to
 * anchor it — keeps clips deterministic: same trace → same pixels, modulo
 * frame timing).
 *
 * Determinism: the ghost is pure recorded kinematics; the signal lamps run
 * off the runtime clock DRIVEN BY PLAYBACK TIME (pre-rolled to the trim
 * window's start, advanced per playback delta) — never wall clock, no
 * randomness introduced.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { Euler, Vector3 } from "three";
import { CHASE_FOV, FIXED_DT, GRAVITY } from "@/modules/sim/vehicle";
import {
  lessonDistrictId,
  scenarioBaysOf,
  type ParkingBaySpec,
} from "@/modules/sim/contracts";
import {
  isScenarioLessonId,
  lessonParkingBaysFor,
  type LessonSpec,
} from "@/modules/sim/lessons";
import { QUALITY_PRESETS, SimEnvironment } from "@/modules/sim/environment";
import {
  DistrictWorld,
  assertDistrict,
  buildWorldGeometry,
  type WorldGeometry,
} from "@/modules/sim/world";
import { createWorldRuntime } from "@/modules/sim/runtime";
import {
  createTracePoint,
  sampleAt,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import { ScenarioObstacles, type ScenarioObstacleSpec } from "@/components/sim/ScenarioObstacles";
import { heldSceneryFor } from "@/components/sim/scenarioSceneryProps";
import { ShadowCar } from "@/components/sim/ShadowCar";

/** Fixed capture size — consistent clips across machines/windows. */
export const CAPTURE_W = 1280;
export const CAPTURE_H = 720;

/** LessonScene's HDRI constants (doc 71 §4.2 — keep in sync). */
const DAY_ENV_ROTATION = new Euler(0, (119 * Math.PI) / 180, 0);
const NIGHT_ENV_ROTATION = new Euler(0, 0, 0);

const DEG2RAD = Math.PI / 180;
/** Follow-camera framing: behind/above the ghost, looking down its heading. */
const CAM_BACK_M = 8.5;
const CAM_UP_M = 3.4;
const CAM_LOOK_AHEAD_M = 7;
const CAM_LOOK_UP_M = 1.1;
/** Position smoothing rate (1/s); jumps beyond SNAP_M teleport (seeks). */
const CAM_DAMP = 4;
const CAM_SNAP_M = 25;
/** Frames rendered after Suspense resolves before onReady (texture warmup). */
const READY_WARMUP_FRAMES = 30;

interface Built {
  runtime: ReturnType<typeof createWorldRuntime>;
  district: ReturnType<typeof assertDistrict>;
  geometry: WorldGeometry;
  obstacles: ScenarioObstacleSpec[];
}

export interface CaptureSceneProps {
  /** Compiled entry rung of the clip's template (environment + district). */
  lesson: LessonSpec;
  /** The committed mistake trace the red ghost replays. */
  trace: ScenarioTrace;
  /** Shared playback clock — the client seeks/starts/stops through it. */
  clockRef: React.RefObject<TraceClock>;
  /** Trim-window start — the runtime lamp clock pre-rolls here. */
  startSec: number;
  /** The live WebGL canvas (captureStream target). */
  onCanvas: (canvas: HTMLCanvasElement) => void;
  /** World + ghost mounted and warm — safe to seek + record. */
  onReady: () => void;
  onError: (message: string) => void;
}

export function CaptureScene({
  lesson,
  trace,
  clockRef,
  startSec,
  onCanvas,
  onReady,
  onError,
}: CaptureSceneProps) {
  const [built, setBuilt] = useState<Built | null>(null);

  // Load + build the drill's world — LessonScene's recipe, minus traffic.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const districtId = lessonDistrictId(lesson);
        const res = await fetch(`/world/${districtId}.json`);
        if (!res.ok) throw new Error(`district ${districtId} ${res.status}`);
        const raw: unknown = await res.json();
        const runtime = createWorldRuntime(raw);
        const district = assertDistrict(raw);
        // Signal modes (dark / flashing amber) — the drill's authored dial.
        for (const [nodeId, mode] of Object.entries(lesson.signalModes ?? {}).sort(
          (a, b) => (a[0] < b[0] ? -1 : 1),
        )) {
          runtime.setSignalClusterMode(nodeId, mode);
        }
        // Pre-roll the lamp clock to the trim window start (determinism:
        // lamp state is a function of playback time, never wall clock).
        for (let t = 0; t < startSec; t += 0.25) {
          runtime.update(Math.min(0.25, startSec - t));
        }
        // Bay paint recipe (LessonScene): per-district curriculum bays +
        // scenario meta bays + the lesson's graded rect, deduped.
        const scenarioBays = scenarioBaysOf(raw);
        const paintBays: ParkingBaySpec[] = [
          ...lessonParkingBaysFor(districtId),
          ...scenarioBays.map((b) => ({
            x: b.x,
            y: b.y,
            headingDeg: b.headingDeg,
            widthM: b.widthM,
            lengthM: b.lengthM,
          })),
        ];
        if (
          lesson.parkingBay &&
          !paintBays.some((b) => b.x === lesson.parkingBay!.x && b.y === lesson.parkingBay!.y)
        ) {
          paintBays.push({ ...lesson.parkingBay });
        }
        const geometry = buildWorldGeometry(district, { parkingBays: paintBays });
        // Occupied bays → parked cars + the template's held scenery.
        const obstacles: ScenarioObstacleSpec[] = isScenarioLessonId(lesson.id)
          ? [
              ...scenarioBays
                .filter((b) => b.occupied)
                .map((b, i) => ({
                  kind: "vehicle" as const,
                  x: b.x,
                  y: b.y,
                  headingDeg: b.headingDeg,
                  seed: i,
                })),
              ...heldSceneryFor(lesson.id, raw),
            ]
          : [];
        if (alive) setBuilt({ runtime, district, geometry, obstacles });
      } catch (err) {
        console.error("CaptureScene: failed to build world", err);
        if (alive) onError("Светът не се зареди");
      }
    })();
    return () => {
      alive = false;
    };
    // Mounted once per clip (the client remounts by key) — deps are static.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const timeOfDay = lesson.environment?.timeOfDay ?? "day";
  const isNight = timeOfDay === "night";
  const rain = lesson.environment?.rain ?? false;
  const fog = lesson.environment?.fog ?? false;
  const snow = lesson.environment?.snow ?? false;

  // Initial camera pose from the trace at the window start (no first-frame
  // jump from three's default camera).
  const initialCam = useMemo(() => {
    const pt = createTracePoint();
    sampleAt(trace, startSec, pt);
    const yaw = Math.PI - pt.headingDeg * DEG2RAD;
    return new Vector3(
      pt.x - Math.sin(yaw) * CAM_BACK_M,
      CAM_UP_M,
      -pt.y - Math.cos(yaw) * CAM_BACK_M,
    );
  }, [trace, startSec]);

  if (!built) {
    return (
      <div
        style={{ width: CAPTURE_W, height: CAPTURE_H }}
        className="flex items-center justify-center bg-surface text-sm text-muted"
      >
        Зареждане на света…
      </div>
    );
  }

  return (
    <div style={{ width: CAPTURE_W, height: CAPTURE_H }} className="bg-surface">
      <Canvas
        shadows="percentage"
        dpr={1}
        camera={{
          fov: CHASE_FOV,
          near: 0.1,
          far: 900,
          position: [initialCam.x, initialCam.y, initialCam.z],
        }}
        gl={{
          antialias: !QUALITY_PRESETS.med.postprocessing,
          powerPreference: "high-performance",
          stencil: false,
          // The recorder reads the canvas between frames — keep the buffer.
          preserveDrawingBuffer: true,
        }}
        onCreated={(state) => onCanvas(state.gl.domElement)}
      >
        <SimEnvironment timeOfDay={timeOfDay} rain={rain} fog={fog} snow={snow} quality="med" />
        <Suspense fallback={null}>
          <Environment
            files={isNight ? "/sim/env/sky_urban_1k.hdr" : "/sim/env/shanghai_riverside_1k.hdr"}
            background={false}
            environmentIntensity={isNight ? 0.12 : 0.5}
            environmentRotation={isNight ? NIGHT_ENV_ROTATION : DAY_ENV_ROTATION}
          />
          {/* Physics context for the world/obstacle colliders; paused — the
              ghost is kinematic, nothing simulates. */}
          <Physics gravity={[0, GRAVITY, 0]} timeStep={FIXED_DT} paused>
            <DistrictWorld
              district={built.district}
              prebuilt={built.geometry}
              quality="med"
              night={isNight}
              getSignalPhase={(id, bearing) => built.runtime.signalLampState(id, bearing)}
              getRailBarrierDown={(x, y) => built.runtime.railBarrierDownAt(x, y)}
              signSvgBaseUrl={null}
            />
            {built.obstacles.length > 0 ? (
              <ScenarioObstacles obstacles={built.obstacles} clearcoat={false} />
            ) : null}
          </Physics>
          {/* The production playback path: red mistake ghost + ribbon + ❌. */}
          <ShadowCar trace={trace} clockRef={clockRef} />
          <LampClockDriver runtime={built.runtime} clockRef={clockRef} />
          <GhostFollowCamera trace={trace} clockRef={clockRef} />
          <ReadyProbe onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}

/** Advances the world runtime (signal lamps, barrier arms) by PLAYBACK time —
 *  the render-side twin of LessonScene's RuntimeDriver, minus grading. */
function LampClockDriver({
  runtime,
  clockRef,
}: {
  runtime: ReturnType<typeof createWorldRuntime>;
  clockRef: React.RefObject<TraceClock>;
}) {
  const lastRef = useRef<number | null>(null);
  useFrame(() => {
    const clock = clockRef.current;
    if (!clock) return;
    const last = lastRef.current;
    lastRef.current = clock.tSec;
    if (last === null) return;
    const dt = clock.tSec - last;
    if (dt > 0 && dt < 2) runtime.update(dt);
    // Backward seek: the lamp cycle cannot rewind — accept the phase shift
    // (re-recording remounts the scene fresh, which is the recording path).
  });
  return null;
}

/** Chase camera locked on the GHOST's trace pose (the demo follow-camera). */
function GhostFollowCamera({
  trace,
  clockRef,
}: {
  trace: ScenarioTrace;
  clockRef: React.RefObject<TraceClock>;
}) {
  const ptRef = useRef(createTracePoint());
  const desiredRef = useRef(new Vector3());
  const lookRef = useRef(new Vector3());
  useFrame((state, delta) => {
    const clock = clockRef.current;
    if (!clock) return;
    const pt = ptRef.current;
    sampleAt(trace, clock.tSec, pt);
    // District (x, y, heading cw-from-north) → three (x, _, −y); the ghost's
    // forward is +Z in car-local space (ShadowCar's pose law).
    const yaw = Math.PI - pt.headingDeg * DEG2RAD;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const desired = desiredRef.current.set(
      pt.x - fx * CAM_BACK_M,
      CAM_UP_M,
      -pt.y - fz * CAM_BACK_M,
    );
    const cam = state.camera;
    if (cam.position.distanceTo(desired) > CAM_SNAP_M) {
      cam.position.copy(desired); // seek/remount — teleport, no swoop
    } else {
      cam.position.lerp(desired, 1 - Math.exp(-CAM_DAMP * delta));
    }
    const look = lookRef.current.set(
      pt.x + fx * CAM_LOOK_AHEAD_M,
      CAM_LOOK_UP_M,
      -pt.y + fz * CAM_LOOK_AHEAD_M,
    );
    cam.lookAt(look);
  });
  return null;
}

/** Fires onReady once, READY_WARMUP_FRAMES after the Suspense subtree
 *  (HDRI + ghost GLB) resolved — textures/shaders are warm by then. */
function ReadyProbe({ onReady }: { onReady: () => void }) {
  const framesRef = useRef(0);
  const firedRef = useRef(false);
  useFrame(() => {
    if (firedRef.current) return;
    framesRef.current += 1;
    if (framesRef.current >= READY_WARMUP_FRAMES) {
      firedRef.current = true;
      onReady();
    }
  });
  return null;
}
