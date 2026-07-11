"use client";

/**
 * LessonScene — THE integrated 3D world (client-only; mounted by SceneSlot via
 * next/dynamic ssr:false so rapier wasm never runs during SSR/build).
 *
 * Fuses every P5 subsystem into one canvas:
 *   SimEnvironment (sky/light/rain) · DistrictWorld (real Sofia) ·
 *   VehicleRig („Виток" physics car) · TrafficLayer (cars + pedestrians) ·
 *   CameraRig (chase/cockpit) · WorldRuntime (signals + SimTick emission).
 *
 * Per frame: runtime.update → traffic.update → runtime.sample → onTick, which
 * feeds the lesson engine (rules + objectives + HUD) owned by LessonPlayShell.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { Euler, type Group } from "three";
import {
  createTelemetry,
  hasTouchScreen,
  isTouchOnlyDevice,
  SimInput,
  TouchInputSource,
} from "@/modules/sim/engine";
import {
  FIXED_DT,
  GRAVITY,
  SPAWN,
  CHASE_FOV,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  type DifficultyMode,
  type DrivelineEvent,
  type DrivelineRejection,
  type DrivelineSnapshot,
  type VehicleInput,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import type {
  NearMissEvent,
  NearMissStats,
  StagedEventOutcome,
  VehicleSample,
} from "@/modules/sim/contracts";
import type { LessonSpec } from "@/modules/sim/lessons";
import {
  createScenarioDirector,
  lessonSeed,
  type ScenarioDirector,
} from "@/modules/sim/orchestrator";
import {
  createPreDriveSignalTracker,
  observeControlSignal,
  readyToMoveOff,
  type PreDriveSignalTracker,
  type PreDriveStepId,
} from "@/modules/sim/procedures";
import type { SimTick } from "@/modules/sim/rules";
import type { MinimapFrame } from "@/modules/sim/hud";
import {
  SimEnvironment,
  WindshieldDroplets,
  QUALITY_PRESETS,
  type QualityLevel,
} from "@/modules/sim/environment";
import {
  DistrictWorld,
  buildWorldGeometry,
  assertDistrict,
  type WorldGeometry,
} from "@/modules/sim/world";
import { createWorldRuntime } from "@/modules/sim/runtime";
import { createTrafficSystem, TrafficLayer, type TrafficDistrict } from "@/modules/sim/traffic";
import { CabinControls, type MirrorGlanceKind } from "./cabin";
import { TouchControls } from "./TouchControls";
import { CockpitInteractionContext } from "./vitok/hotspots";
import { SimAudio } from "./simAudio";
import { CameraRig, type CameraMode } from "./CameraRig";
import { VehicleRig, type CollisionWithWhat, type VehicleSpawn } from "./VehicleRig";
import { NpcColliders } from "./NpcColliders";
import { createVehicleSample } from "./vehicleSample";
import { buildMinimapPolylines } from "./lessonMinimap";
import { RouteGuidance } from "./RouteGuidance";
import type { QualityPreset } from "./lesson-ui/types";

// Minimal structural mirrors of the district shapes we read here — the runtime
// and world modules each validate the full document.
interface SpawnPointLike {
  id: string;
  x: number;
  y: number;
  heading: number;
}

const MINIMAP_MS = 200;
const MINIMAP_PX_PER_M = 0.5;

/**
 * Day IBL: Poly Haven `shanghai_riverside` (CC0) — a true-unclipped-sun (25 EV)
 * golden-hour riverside, so paint/glass/wet-asphalt speculars come free from
 * the env map (doc 71 §4.2). Its baked sun sits at equirect u=0.600, elevation
 * ≈20° (measured from the 1k pixels), which lands at in-scene compass azimuth
 * 126°; the preset sun is at azimuth 245°, so rotate the environment by
 * 245° − 126° = +119° around Y — otherwise glass towers show a double sun.
 */
const DAY_ENV_ROTATION = new Euler(0, (119 * Math.PI) / 180, 0);
const NIGHT_ENV_ROTATION = new Euler(0, 0, 0);

/** P1: localStorage key marking the one-time touch orientation hint as seen. */
const TOUCH_HINT_STORAGE_KEY = "sim.touchHintSeen";

/** Dev perf readout opt-in (never in production builds): `?simPerf=1` on the
 *  URL or `localStorage["sim.perfLog"]="1"`. Read once at scene mount. */
function shouldLogPerf(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    if (new URLSearchParams(window.location.search).has("simPerf")) return true;
    return window.localStorage.getItem("sim.perfLog") === "1";
  } catch {
    return false;
  }
}

/** The hint replaces the old refusal GateCard: touch-only devices get ONE
 *  orientation/expectation card, then drive. Fail-open on storage errors. */
function shouldShowTouchHint(): boolean {
  if (!isTouchOnlyDevice()) return false;
  try {
    return window.localStorage.getItem(TOUCH_HINT_STORAGE_KEY) === null;
  } catch {
    return true;
  }
}

/**
 * QW10 (doc 68 Phase 0): SimInput with a pre-drive gate. While `driveLocked`
 * (lesson phase === "preDrive") the drive axes read zero — throttle, brake
 * (whose standstill overload is reverse) and handbrake — so the physics can
 * never move the car mid-checklist; steering stays live (harmless while
 * stationary, keeps the wheel responsive). A throttle press while locked is
 * latched so the scene can surface the "завърши подготовката" explanation
 * exactly once per attempt. Interim seam until real ignition/handbrake state
 * lands (Phase 1 A1) — the physics core and VehicleRig stay untouched.
 */
class GatedSimInput extends SimInput {
  driveLocked = false;
  /** Raw (pre-gate) pedal values from the last read — the A2 procedure
   *  observer edge-detects these: a real brake press performs "press-brake",
   *  a throttle press on a ready driveline performs "move-off". */
  rawThrottle = 0;
  rawBrake = 0;
  private blockedThrottleAttempt = false;

  override read(): VehicleInput {
    const out = super.read();
    this.rawThrottle = out.throttle;
    this.rawBrake = out.brake;
    if (this.driveLocked) {
      if (out.throttle > 0) this.blockedThrottleAttempt = true;
      out.throttle = 0;
      out.brake = 0;
      out.handbrake = false;
    }
    return out;
  }

  /** True once after a throttle press while locked (one-shot latch). */
  consumeBlockedDriveAttempt(): boolean {
    const b = this.blockedThrottleAttempt;
    this.blockedThrottleAttempt = false;
    return b;
  }
}

/** lesson-ui preset ("medium") → world/environment level ("med"). */
function toLevel(q: QualityPreset): "low" | "med" | "high" {
  return q === "medium" ? "med" : q;
}

/** Convert a district spawn (x east, y north, heading cw-from-north) to a
 *  three.js chassis pose. Vertical drop reuses the tested SPAWN.y. */
function spawnPose(
  lesson: LessonSpec,
  spawnPoints: SpawnPointLike[],
): VehicleSpawn {
  const explicit = lesson.spawn.position;
  let x: number;
  let yNorth: number;
  let headingDeg: number;
  if (lesson.spawn.pointId) {
    const p = spawnPoints.find((s) => s.id === lesson.spawn.pointId);
    x = p?.x ?? explicit?.x ?? 0;
    yNorth = p?.y ?? explicit?.y ?? 0;
    headingDeg = p?.heading ?? lesson.spawn.headingDeg ?? 0;
  } else {
    x = explicit?.x ?? 0;
    yNorth = explicit?.y ?? 0;
    headingDeg = lesson.spawn.headingDeg ?? 0;
  }
  // district (x, yNorth) → three.js (x, _, −yNorth); yaw = π − heading.
  return {
    x,
    y: SPAWN.y,
    z: -yNorth,
    yawRad: Math.PI - (headingDeg * Math.PI) / 180,
  };
}

interface Built {
  runtime: ReturnType<typeof createWorldRuntime>;
  geometry: WorldGeometry;
  district: ReturnType<typeof assertDistrict>;
  traffic: ReturnType<typeof createTrafficSystem>;
  /** A8 scenario director — null when the lesson stages no events. */
  director: ScenarioDirector | null;
  minimapPolylines: MinimapFrame["polylines"];
  spawnPoints: SpawnPointLike[];
}

export interface LessonSceneProps {
  lesson: LessonSpec;
  quality: QualityPreset;
  paused: boolean;
  /** QW10: pre-drive phase — zero the drive inputs, the car must not move. */
  driveLocked: boolean;
  /** A2 instruction mode: pending step whose cockpit hotspot(s) pulse. */
  preDriveHighlightStepId: PreDriveStepId | null;
  /** A7 route guidance: 0-based index of the active objective (from the
   *  lesson engine); ≥ objectives.length once all are done. Drives the
   *  in-world ghost route / turn arrow / objective marker. */
  activeObjectiveIndex: number;
  onTick: (tick: SimTick) => void;
  /** A2: a step was PERFORMED on a real control (observer-resolved). */
  onPreDriveStep: (stepId: PreDriveStepId, tSec: number) => void;
  /** QW10: throttle pressed while driveLocked (shell rate-limits the toast). */
  onBlockedDriveAttempt: () => void;
  onMinimapFrame: (frame: MinimapFrame) => void;
  /** A1: low-frequency driveline state (selector/ignition/parking brake/…)
   *  → HUD telltales. Emitted on the minimap cadence, not per frame. */
  onDriveline?: (snap: DrivelineSnapshot) => void;
  /** A rejected driveline action (start interlock / selector gate) — the
   *  shell turns it into a visible HUD hint + gear-telltale flash. Carries a
   *  fresh snapshot so the message can name the blocking state (founder bug
   *  2026-07-10: refusals must never be silent). */
  onDrivelineRejection?: (rejection: DrivelineRejection, snap: DrivelineSnapshot) => void;
  /** A8 (additive): a staged encounter resolved — carries the measurement
   *  record (reaction time, stop gap, …). The graded consequences already
   *  arrived through onTick; the shell folds this via applyStagedOutcome. */
  onStagedOutcome?: (outcome: StagedEventOutcome) => void;
  /** A11 (additive): a near-miss encounter resolved — the player squeezed
   *  past a moving NPC with almost no clearance. Session STAT only (A15's
   *  feedback map); nothing is graded. Carries the running aggregate. */
  onNearMiss?: (event: NearMissEvent, stats: NearMissStats) => void;
  /** P1: shell-owned fullscreen toggle (QW1 — the shell root is the
   *  fullscreen element) so the touch overlay can offer the ⛶ button. */
  onToggleFullscreen?: () => void;
}

export default function LessonScene(props: LessonSceneProps) {
  const { paused, onTick, onMinimapFrame } = props;

  const [built, setBuilt] = useState<Built | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [menuPaused, setMenuPaused] = useState(false);

  // Load the district once, build runtime + geometry + traffic client-side.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/world/district-v1.json");
        if (!res.ok) throw new Error(`district ${res.status}`);
        const raw: unknown = await res.json();
        const runtime = createWorldRuntime(raw);
        const district = assertDistrict(raw);
        const geometry = buildWorldGeometry(district);
        const spawnPoints = (
          (raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? []
        );
        // Anchor traffic at the lesson spawn so cars + pedestrians are where the
        // driver actually is — routes otherwise scatter across the ~1.6 km map
        // and every agent gets distance-culled (nearest car was ~340 m away).
        const anchorPose = spawnPose(props.lesson, spawnPoints);
        const traffic = createTrafficSystem(
          raw as Parameters<typeof createTrafficSystem>[0],
          {
            anchor: { x: anchorPose.x, y: -anchorPose.z },
            anchorRadiusM: 280,
            vehicleCount: 26,
            pedestrianCount: 20,
          },
        );
        runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
        runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
        runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
        runtime.setRightConflictQuery((jx, jy, px, py, h, r) =>
          traffic.conflictFromRight(jx, jy, px, py, h, r),
        );
        runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
          traffic.circulatingConflict(cx, cy, px, py, h, r),
        );
        // A8: stage the lesson's scripted encounters NOW — before TrafficLayer
        // mounts — so staged actors land inside the instanced buffers. The
        // director is deterministic per (lesson seed, attempt).
        const stagedEvents = props.lesson.stagedEvents ?? [];
        const director =
          stagedEvents.length > 0
            ? createScenarioDirector(stagedEvents, traffic, {
                seed: lessonSeed(props.lesson.id),
              })
            : null;
        if (alive) {
          setBuilt({
            runtime,
            geometry,
            district,
            traffic,
            director,
            minimapPolylines: buildMinimapPolylines(district),
            spawnPoints,
          });
        }
      } catch (err) {
        console.error("LessonScene: failed to build world", err);
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.lesson]);

  // P1: the old touch refusal GateCard is GONE — touch-only devices now get
  // the TouchControls overlay (ReadyScene) and a one-time orientation hint.
  if (loadError) {
    return (
      <GateCard
        icon="⚠️"
        title="Светът не се зареди"
        body="Данните за Студентски град не успяха да се заредят. Провери връзката и опитай пак."
      />
    );
  }
  if (!built) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm">Зареждане на Студентски град…</p>
        </div>
      </div>
    );
  }

  return (
    <ReadyScene
      {...props}
      built={built}
      menuPaused={menuPaused}
      setMenuPaused={setMenuPaused}
      physicsPaused={paused || menuPaused}
      onMinimap={onMinimapFrame}
      onTickCb={onTick}
    />
  );
}

function ReadyScene({
  lesson,
  quality,
  built,
  menuPaused,
  setMenuPaused,
  physicsPaused,
  driveLocked,
  preDriveHighlightStepId,
  activeObjectiveIndex,
  onBlockedDriveAttempt,
  onPreDriveStep,
  onMinimap,
  onTickCb,
  onDriveline,
  onDrivelineRejection,
  onStagedOutcome,
  onNearMiss,
  onToggleFullscreen,
}: LessonSceneProps & {
  built: Built;
  menuPaused: boolean;
  setMenuPaused: (v: boolean) => void;
  physicsPaused: boolean;
  onMinimap: (f: MinimapFrame) => void;
  onTickCb: (t: SimTick) => void;
}) {
  const { runtime, geometry, district, traffic, director, minimapPolylines, spawnPoints } =
    built;

  const timeOfDay = lesson.environment?.timeOfDay ?? "day";
  const rain = lesson.environment?.rain ?? false;
  const isNight = timeOfDay === "night";
  const level = toLevel(quality);
  const spawn = useMemo(() => spawnPose(lesson, spawnPoints), [lesson, spawnPoints]);
  // A7: district-space spawn pose — the start of the FIRST guidance route
  // (before the physics sample goes live). Inverse of the spawnPose mapping.
  const guidanceSpawnStart = useMemo(
    () => ({
      x: spawn.x,
      y: -spawn.z,
      headingDeg: 180 - (spawn.yawRad * 180) / Math.PI,
    }),
    [spawn],
  );

  // Shared mutable channels (refs → zero re-renders at frame rate).
  const telemetryRef = useRef(createTelemetry());
  const simRef = useRef<VehicleSim | null>(null);
  const chassisGroupRef = useRef<Group | null>(null);
  const cameraModeRef = useRef<CameraMode>("cockpit");
  const inputRef = useRef<GatedSimInput | null>(null);
  const cabinRef = useRef<CabinControls | null>(null);
  const audioRef = useRef<SimAudio | null>(null);
  const sampleRef = useRef<VehicleSample>(createVehicleSample());
  const [cockpit, setCockpit] = useState(true);
  const [difficulty, setDifficulty] = useState<DifficultyMode>(DEFAULT_DIFFICULTY);
  const difficultyRef = useRef<DifficultyMode>(DEFAULT_DIFFICULTY);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  // P1 touch layer: capability decides the overlay mount (touch laptops
  // included — the overlay auto-hides while the keyboard is in use, so
  // keyboard devices see zero change); touch-ONLY devices additionally get
  // the one-time orientation hint and a collapsed keyboard legend.
  const [touchCapable] = useState(() => hasTouchScreen());
  const [touchOnly] = useState(() => isTouchOnlyDevice());
  // Dev-only renderer stats logger (draws/tris/fps per frame, all passes).
  const [perfLog] = useState(() => shouldLogPerf());
  const [touchSource] = useState(() => new TouchInputSource());
  const [showTouchHint, setShowTouchHint] = useState(shouldShowTouchHint);
  const dismissTouchHint = useCallback(() => {
    setShowTouchHint(false);
    try {
      window.localStorage.setItem(TOUCH_HINT_STORAGE_KEY, "1");
    } catch {
      // Private mode — the hint just shows again next session.
    }
  }, []);

  // Camera toggle + car reset, shared by the key callbacks (C/R) and the
  // touch overlay buttons — one code path per action.
  const toggleCamera = useCallback(() => {
    cameraModeRef.current =
      cameraModeRef.current === "chase" ? "cockpit" : "chase";
    setCockpit(cameraModeRef.current === "cockpit");
  }, []);

  // Mirror of the driveLocked prop so the input lifecycle effect (which runs
  // once) can seed a freshly created input with the current gate state.
  const driveLockedRef = useRef(driveLocked);

  // A8: the scenario director rides in a ref (created in the load path, used
  // by the frame loop + the R-key reset) and drives the L5 hazard visual via
  // this render-free flag ref (TrafficLayer reads it per frame).
  const directorRef = useRef<ScenarioDirector | null>(director);
  useEffect(() => {
    directorRef.current = director;
  }, [director]);
  const hazardActiveRef = useRef(false);

  /** Respawn (key R and the touch sheet's „Рестарт") — same code path. */
  const resetCar = useCallback(() => {
    simRef.current?.reset();
    // A8: retry re-stages every staged encounter (fresh attempt seed).
    directorRef.current?.reset();
  }, []);

  // A2 performed pre-drive: raw transition queues, drained by RuntimeDriver's
  // frame loop and resolved to procedure steps (performedSteps.ts). Driveline
  // events arrive via subscribe (below); glances via the cabin callback (both
  // Q/E/F keys AND mirror-hotspot clicks land there — one graded path).
  const drivelineEventsRef = useRef<DrivelineEvent[]>([]);
  const glanceQueueRef = useRef<MirrorGlanceKind[]>([]);

  // Input + cabin + audio lifecycle.
  useEffect(() => {
    const input = new GatedSimInput({
      onToggleCamera: toggleCamera,
      onReset: resetCar,
      onTogglePause: () => setMenuPaused(!menuPaused),
    });
    input.driveLocked = driveLockedRef.current;
    // P1: the touch overlay's axis source joins the SAME read() pipeline
    // (merged before the QW10 gate + difficulty shaping).
    if (touchCapable) input.attachTouch(touchSource);
    inputRef.current = input;
    const audio = new SimAudio();
    audioRef.current = audio;
    const cabin = new CabinControls(
      {
        onSeatbeltToggle: () => audio.click(),
        onToggleMute: () => audio.toggleMute(),
        onParkingBrakeToggle: () => audio.click(),
        // A2: every glance (keys Q/E/F or a mirror hotspot click) feeds the
        // procedure observer — the same event the rule engine already grades.
        onGlance: (mirror) => glanceQueueRef.current.push(mirror),
      },
      // A1 spawn policy: cold start (engine off, P, parking brake on) unless
      // the lesson opts into ready-to-drive (L0). Read once at mount — the
      // lesson identity is fixed for the life of this scene.
      lesson.vehicleStart ?? "cold",
    );
    cabinRef.current = cabin;
    // A2: observe every driveline transition (ignition/selector/parking
    // brake/…) — RuntimeDriver drains the queue and resolves steps from it.
    const unsubscribeDriveline = cabin.driveline.subscribe((event) => {
      drivelineEventsRef.current.push(event);
    });
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      unsubscribeDriveline();
      touchSource.releaseAll();
      input.dispose();
      inputRef.current = null;
      cabin.dispose();
      cabinRef.current = null;
      audio.dispose();
      audioRef.current = null;
    };
    // menuPaused intentionally excluded — the handler reads it via closure at
    // toggle time; re-subscribing every toggle would drop key state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMenuPaused]);

  // QW10: keep the input gate in lockstep with the lesson phase.
  useEffect(() => {
    driveLockedRef.current = driveLocked;
    if (inputRef.current) inputRef.current.driveLocked = driveLocked;
  }, [driveLocked]);

  // A2: cockpit hotspot interaction — pointer-active only in the cockpit
  // camera view; instruction mode pulses the pending step's hotspot(s).
  // (The old QW5 "checklist click forces cabin state" effect is gone: state
  // transitions now COMPLETE steps, never the reverse.)
  const cockpitInteraction = useMemo(
    () => ({ enabled: cockpit, highlightStepId: preDriveHighlightStepId }),
    [cockpit, preDriveHighlightStepId],
  );

  const getSignalPhase = useCallback(
    (id: string) => runtime.signalPhase(id),
    [runtime],
  );

  // A real impact (VehicleRig gates by relative speed) → queue a collision for
  // the rule engine, which grades it опасна and terminates the session. A11:
  // `withWhat` now reflects what was actually hit — NPC shells classify as
  // vehicle/pedestrian/cyclist; untagged world geometry stays staticObject.
  const handleCollision = useCallback(
    (_impactKmh: number, withWhat: CollisionWithWhat) => {
      runtime.pushCollision(withWhat);
    },
    [runtime],
  );

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows
        dpr={[1, QUALITY_PRESETS[level].maxDpr]}
        camera={{
          fov: CHASE_FOV,
          near: 0.1,
          far: 900,
          position: [spawn.x - 6, spawn.y + 2.4, spawn.z],
        }}
        gl={{
          // Canvas MSAA only on `low` (no composer). At med/high the composer
          // renders offscreen and antialiases with SMAA, so a multisampled
          // backbuffer here is wasted VRAM/fill — turn it off, SMAA owns AA.
          antialias: !QUALITY_PRESETS[level].postprocessing,
          powerPreference: "high-performance",
          stencil: false,
        }}
      >
        {perfLog ? <PerfProbe level={level} /> : null}
        <SimEnvironment timeOfDay={timeOfDay} rain={rain} quality={level} />
        {/* HDRI image-based lighting — real sky reflections/ambient for PBR
            materials, glass, mirrors and car paint. background=false keeps
            SimEnvironment's animated sky dome. Day uses the golden-hour
            shanghai_riverside (rotated so its baked sun matches the preset
            sun azimuth — see DAY_ENV_ROTATION); night uses a dim dusk/urban
            PMREM so metal/glass/mirrors sample a faint skyline instead of
            black (a graded mirror feature needs *something* to reflect at
            night). Intensities stay modest so the IBL complements the
            sun/hemisphere rig rather than flattening it. */}
        <Suspense fallback={null}>
          <Environment
            files={
              isNight ? "/sim/env/sky_urban_1k.hdr" : "/sim/env/shanghai_riverside_1k.hdr"
            }
            background={false}
            environmentIntensity={isNight ? 0.12 : 0.5}
            environmentRotation={isNight ? NIGHT_ENV_ROTATION : DAY_ENV_ROTATION}
          />
        </Suspense>
        <Suspense fallback={null}>
          <Physics
            gravity={[0, GRAVITY, 0]}
            timeStep={FIXED_DT}
            interpolate
            paused={physicsPaused}
            updateLoop="follow"
          >
            <DistrictWorld
              district={district}
              prebuilt={geometry}
              quality={level}
              night={isNight}
              getSignalPhase={getSignalPhase}
              signSvgBaseUrl={null}
            />
            {/* A2: the provider gives VitokCockpit's hotspot layer its
                enable/highlight state without threading props through
                VehicleRig (context crosses the R3F tree). */}
            <CockpitInteractionContext.Provider value={cockpitInteraction}>
              <VehicleRig
                simRef={simRef}
                chassisGroupRef={chassisGroupRef}
                inputRef={inputRef}
                cabinRef={cabinRef}
                audioRef={audioRef}
                sampleRef={sampleRef}
                paused={physicsPaused}
                spawn={spawn}
                difficultyRef={difficultyRef}
                onCollision={handleCollision}
                night={isNight}
              />
            </CockpitInteractionContext.Provider>
            <RuntimeDriver
              runtime={runtime}
              traffic={traffic}
              director={director}
              hazardActiveRef={hazardActiveRef}
              sampleRef={sampleRef}
              inputRef={inputRef}
              cabinRef={cabinRef}
              audioRef={audioRef}
              driveLocked={driveLocked}
              drivelineEventsRef={drivelineEventsRef}
              glanceQueueRef={glanceQueueRef}
              onPreDriveStep={onPreDriveStep}
              onBlockedDriveAttempt={onBlockedDriveAttempt}
              onTick={onTickCb}
              onMinimap={onMinimap}
              onDriveline={onDriveline}
              onDrivelineRejection={onDrivelineRejection}
              onStagedOutcome={onStagedOutcome}
              minimapPolylines={minimapPolylines}
              isNight={isNight}
              rain={rain}
              paused={physicsPaused}
            />
            {/* A11 hittable traffic: a fixed pool of kinematic collider
                shells (8 vehicles + 4 pedestrians) follows the NPCs nearest
                the player, so driving into traffic is a real contact the
                rule engine grades by kind. Mounted AFTER RuntimeDriver —
                its frame callback then reads this frame's fresh traffic
                poses. Also runs the near-miss session stat (no grading). */}
            <NpcColliders
              traffic={traffic}
              sampleRef={sampleRef}
              paused={physicsPaused}
              onNearMiss={onNearMiss}
            />
            {/* Ambient life — cars + pedestrians. Render-only: RuntimeDriver
                already steps traffic.update each frame (so it stays in lockstep
                with the rule engine), so we do NOT pass `runtime` here. Draw
                distance covers the anchored cluster (fog fades the far edge).
                A8: the lesson hazard (L5 ball dart-out) renders here too — the
                scenario director owns hazardActiveRef (A5's prepared seam). */}
            <TrafficLayer
              system={traffic}
              maxDrawDistanceM={420}
              night={isNight}
              // world `District` ⊇ `TrafficDistrict` (only differs on a field
              // TrafficLayer doesn't read — crossings.edgeId nullability).
              district={district as TrafficDistrict}
              hazard={lesson.hazard ?? null}
              hazardActiveRef={hazardActiveRef}
              // Perf tier (doc 71): SUV clearcoat on the high tier only.
              clearcoat={level === "high"}
            />
          </Physics>
        </Suspense>
        {/* A7 in-world route guidance: ghost route ribbon + turn chevron +
            objective marker. Free drive (no objectives) has nothing to
            follow, so the layer never mounts there (doc 68 A7 / audit B9). */}
        {lesson.objectives.length > 0 ? (
          <RouteGuidance
            district={district}
            lesson={lesson}
            activeObjectiveIndex={activeObjectiveIndex}
            sampleRef={sampleRef}
            spawnStart={guidanceSpawnStart}
          />
        ) : null}
        <CameraRig
          chassisGroupRef={chassisGroupRef}
          simRef={simRef}
          cameraModeRef={cameraModeRef}
          cabinRef={cabinRef}
          telemetryRef={telemetryRef}
        />
        {cockpit && rain ? <WindshieldDroplets /> : null}
      </Canvas>

      {/* Controls legend — collapsible, top-left of the canvas (clear of the
          bottom cards + minimap). Collapsed by default on touch-only devices
          (the keys are real but secondary there). */}
      <ControlsHelp defaultOpen={!touchOnly} />

      {/* P1: touch input overlay — mounts on any touch-capable device, hides
          itself during keyboard use and while paused/quiz/teach/end overlays
          are up (physicsPaused covers menu pause; props.paused covers the
          shell's quiz/teach/end states). */}
      {touchCapable ? (
        <TouchControls
          touch={touchSource}
          cabinRef={cabinRef}
          hidden={physicsPaused}
          onToggleCamera={toggleCamera}
          onPause={() => setMenuPaused(true)}
          onReset={resetCar}
          onToggleFullscreen={onToggleFullscreen ?? null}
        />
      ) : null}

      {/* Difficulty selector — top right */}
      <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-border bg-background/70 p-1 backdrop-blur">
        {DIFFICULTY_ORDER.map((mode) => {
          const active = mode === difficulty;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setDifficulty(mode)}
              aria-pressed={active}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                active
                  ? "bg-accent text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {DIFFICULTY_PRESETS[mode].labelBg}
            </button>
          );
        })}
      </div>

      {/* P1: one-time touch expectation hint — the refusal GateCard's
          replacement. Landscape + slider guidance, then never again. */}
      {showTouchHint ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Съвети за игра на телефон"
        >
          <div className="card flex max-w-sm flex-col gap-3 p-6 text-center">
            <p className="text-3xl" aria-hidden>
              📱
            </p>
            <h2 className="text-lg font-bold">Караш направо от телефона</h2>
            <p className="text-sm text-muted">
              Завърти телефона хоризонтално за най-добър изглед. Управлявай с
              плъзгачите: воланът е вляво, газта и спирачката — вдясно.
              Контролите в кабината се докосват направо, а „⚙“ отваря
              останалите (двигател, скорости, светлини…).
            </p>
            <button type="button" autoFocus className="btn-accent" onClick={dismissTouchHint}>
              Разбрах
            </button>
          </div>
        </div>
      ) : null}

      {menuPaused ? (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Пауза"
        >
          <div className="card flex w-64 flex-col gap-3 p-6 text-center">
            <h2 className="text-xl font-bold">Пауза</h2>
            <button
              type="button"
              autoFocus
              className="btn-accent"
              onClick={() => setMenuPaused(false)}
            >
              Продължи
            </button>
            <Link href="/dashboard" className="btn-ghost">
              Изход
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dev-only whole-frame renderer stats (opt-in via shouldLogPerf), logged to
 * the console once per second: fps, draw calls and triangles PER FRAME —
 * including the A4 mirror RTT passes and the composer's internal passes.
 * That's why `gl.info.autoReset` is turned off (three would otherwise zero
 * the counters after EVERY gl.render, leaving only the last pass visible)
 * and the counters are read + reset manually at the START of each frame
 * (useFrame priority -100 — before MirrorRig's pass at 0 and the composer's
 * render at 1), so each read captures the full previous frame.
 * Budget lines to compare against: doc quality-gap/13 §1 — ≤150 draws
 * (laptop iGPU) / ≤75 (phone), ≤750k/300k tris.
 */
function PerfProbe({ level }: { level: QualityLevel }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
      gl.info.reset();
    };
  }, [gl]);
  // One-line readout of the active tier + the feature gates it selected, so the
  // founder's probe shows which facade/clearcoat path this run is on.
  useEffect(() => {
    const p = QUALITY_PRESETS[level];
    console.info(
      `[sim-perf] tier=${level} facadeMaps=${p.facadeMaps} clearcoat=${p.clearcoat}`,
    );
  }, [level]);
  const accRef = useRef({ frames: 0, calls: 0, tris: 0, windowStart: -1 });
  useFrame((state) => {
    const acc = accRef.current;
    acc.frames += 1;
    acc.calls += gl.info.render.calls;
    acc.tris += gl.info.render.triangles;
    gl.info.reset();
    const now = state.clock.elapsedTime;
    if (acc.windowStart < 0) acc.windowStart = now;
    const span = now - acc.windowStart;
    if (span >= 1) {
      console.info(
        `[sim-perf] fps=${(acc.frames / span).toFixed(0)}` +
          ` draws/frame=${Math.round(acc.calls / acc.frames)}` +
          ` tris/frame=${Math.round(acc.tris / acc.frames / 1000)}k` +
          ` programs=${gl.info.programs?.length ?? 0}`,
      );
      acc.frames = 0;
      acc.calls = 0;
      acc.tris = 0;
      acc.windowStart = now;
    }
  }, -100);
  return null;
}

// A2 pedal-edge thresholds on the RAW (pre-gate) ramped keyboard/gamepad
// pedals: crossing PRESS upward performs the step; re-arms below RELEASE.
const BRAKE_PRESS_THRESHOLD = 0.4;
const BRAKE_REARM_THRESHOLD = 0.1;

/** Poll baseline for the cabin-electrics edge detection (A2 observer). */
interface CabinPollState {
  seatbeltOn: boolean;
  headlights: "off" | "low" | "high";
  indicator: "off" | "left" | "right";
  brakeArmed: boolean;
}

function cabinPollBaseline(cabin: CabinControls | null, rawBrake: number): CabinPollState {
  return {
    seatbeltOn: cabin?.seatbeltOn ?? false,
    headlights: cabin?.headlights ?? "off",
    indicator: cabin?.indicator ?? "off",
    brakeArmed: rawBrake > BRAKE_PRESS_THRESHOLD,
  };
}

/** In-canvas per-frame driver: signals → traffic → sample → onTick + minimap
 *  + the A2 pre-drive transition observer. */
function RuntimeDriver({
  runtime,
  traffic,
  director,
  hazardActiveRef,
  sampleRef,
  inputRef,
  cabinRef,
  audioRef,
  driveLocked,
  drivelineEventsRef,
  glanceQueueRef,
  onPreDriveStep,
  onBlockedDriveAttempt,
  onTick,
  onMinimap,
  onDriveline,
  onDrivelineRejection,
  onStagedOutcome,
  minimapPolylines,
  isNight,
  rain,
  paused,
}: {
  runtime: ReturnType<typeof createWorldRuntime>;
  traffic: ReturnType<typeof createTrafficSystem>;
  /** A8 scenario director (null = lesson stages nothing). */
  director: ScenarioDirector | null;
  /** A8 → TrafficLayer: animate the lesson hazard visual while true. */
  hazardActiveRef: React.RefObject<boolean>;
  sampleRef: React.RefObject<VehicleSample>;
  inputRef: React.RefObject<GatedSimInput | null>;
  cabinRef: React.RefObject<CabinControls | null>;
  audioRef: React.RefObject<SimAudio | null>;
  /** True while the procedure runs — the observer only listens then. */
  driveLocked: boolean;
  drivelineEventsRef: React.RefObject<DrivelineEvent[]>;
  glanceQueueRef: React.RefObject<MirrorGlanceKind[]>;
  onPreDriveStep: (stepId: PreDriveStepId, tSec: number) => void;
  onBlockedDriveAttempt: () => void;
  onTick: (t: SimTick) => void;
  onMinimap: (f: MinimapFrame) => void;
  onDriveline?: (snap: DrivelineSnapshot) => void;
  onDrivelineRejection?: (rejection: DrivelineRejection, snap: DrivelineSnapshot) => void;
  onStagedOutcome?: (outcome: StagedEventOutcome) => void;
  minimapPolylines: MinimapFrame["polylines"];
  isNight: boolean;
  rain: boolean;
  paused: boolean;
}) {
  const tRef = useRef(0);
  const lastMinimapRef = useRef(0);

  // A2 observer state: the signal tracker + polled-edge baseline reset on
  // every RISING edge of driveLocked (lesson start AND retry), re-baselined
  // to the cabin's CURRENT state so a car left belted/running by a previous
  // run never auto-completes steps — the student re-performs transitions.
  const trackerRef = useRef<PreDriveSignalTracker>(createPreDriveSignalTracker());
  const pollRef = useRef<CabinPollState>(cabinPollBaseline(null, 0));
  const prevLockedRef = useRef(false);

  useFrame((_, delta) => {
    // QW10: consume the throttle-while-locked latch every frame (so attempts
    // during a pause never queue up), surface it only on live frames.
    const blockedAttempt = inputRef.current?.consumeBlockedDriveAttempt() ?? false;
    if (paused) return;

    // ---- A2: performed pre-drive — real transitions drive the machine ----
    const cabin = cabinRef.current;
    const input = inputRef.current;
    const drivelineEvents = drivelineEventsRef.current;
    const glances = glanceQueueRef.current;
    if (driveLocked && !prevLockedRef.current) {
      trackerRef.current = createPreDriveSignalTracker();
      pollRef.current = cabinPollBaseline(cabin, input?.rawBrake ?? 0);
      drivelineEvents.length = 0;
      glances.length = 0;
    }
    prevLockedRef.current = driveLocked;

    if (driveLocked && cabin) {
      const tracker = trackerRef.current;
      const emit = (stepId: PreDriveStepId | null) => {
        if (stepId) onPreDriveStep(stepId, tRef.current);
      };
      // 1. Driveline transitions (ignition / selector / parking brake).
      for (const event of drivelineEvents) {
        emit(observeControlSignal(tracker, { kind: "driveline", event }));
      }
      // 2. Mirror glances (keys Q/E/F and mirror hotspots — one graded path).
      for (const mirror of glances) {
        emit(observeControlSignal(tracker, { kind: "glance", mirror }));
      }
      // 3. Cabin electrics — polled edges (belt / lights / indicator).
      const poll = pollRef.current;
      if (cabin.seatbeltOn !== poll.seatbeltOn) {
        poll.seatbeltOn = cabin.seatbeltOn;
        emit(observeControlSignal(tracker, { kind: "seatbelt", on: cabin.seatbeltOn }));
      }
      if (cabin.headlights !== poll.headlights) {
        poll.headlights = cabin.headlights;
        emit(observeControlSignal(tracker, { kind: "headlights", setting: cabin.headlights }));
      }
      if (cabin.indicator !== poll.indicator) {
        poll.indicator = cabin.indicator;
        emit(observeControlSignal(tracker, { kind: "indicator", setting: cabin.indicator }));
      }
      // 4. Brake pedal — raw (pre-gate) press edge performs "press-brake".
      const rawBrake = input?.rawBrake ?? 0;
      if (!poll.brakeArmed && rawBrake > BRAKE_PRESS_THRESHOLD) {
        poll.brakeArmed = true;
        emit(observeControlSignal(tracker, { kind: "brakePressed" }));
      } else if (poll.brakeArmed && rawBrake < BRAKE_REARM_THRESHOLD) {
        poll.brakeArmed = false;
      }
      // 5. Throttle — on a genuinely ready driveline it IS "move-off"
      //    (completes the procedure → shell unlocks the QW10 gate → the same
      //    held pedal rolls the car); earlier it stays the teaching moment.
      if (blockedAttempt) {
        if (readyToMoveOff(cabin.driveline.physicsInput)) {
          emit(observeControlSignal(tracker, { kind: "moveOffAttempt" }));
        } else {
          onBlockedDriveAttempt();
        }
      }
    } else if (blockedAttempt) {
      onBlockedDriveAttempt();
    }
    // Rejected driveline actions must be VISIBLE (founder bug 2026-07-10:
    // start interlock + selector gate refused silently). Forward them with a
    // fresh snapshot — the selector cannot have changed by the rejection
    // itself, so the snapshot names the state that blocked the action.
    if (onDrivelineRejection && cabin) {
      for (const event of drivelineEvents) {
        if (event.kind === "startRejected" || event.kind === "shiftRejected") {
          onDrivelineRejection(event, cabin.driveline.snapshot());
        }
      }
    }
    // Drain both queues even outside the pre-drive phase (driveline events
    // keep flowing while driving — wipers, gears, stalls — and must not pile).
    drivelineEvents.length = 0;
    glances.length = 0;

    const dt = Math.min(delta, 0.1);
    tRef.current += dt;
    const sample = sampleRef.current;

    runtime.update(dt);
    traffic.update(dt, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: sample.position.x, y: sample.position.y },
      playerSpeedKmh: sample.speedKmh,
      playerHeadingDeg: sample.headingDeg,
    });
    const leadGap = traffic.leadGapMeters(
      sample.position.x,
      sample.position.y,
      sample.headingDeg,
    );
    // A6 audio pass: sticky scene state for the audio layer (rain patter +
    // NPC proximity hum) — consumed by VehicleRig's per-frame audio update.
    audioRef.current?.setEnvironment({ rain, nearestNpcM: leadGap });
    const tick = runtime.sample(sample, tRef.current, isNight, rain, leadGap);

    // A8: the scenario director steps AFTER traffic.update + runtime.sample —
    // it watches the player, commands staged actors (effective next frame)
    // and appends its outcome events into the SAME tick the rule engine
    // grades. The hazard flag drives TrafficLayer's L5 ball animation.
    if (director) {
      const staged = director.step({
        tSec: tRef.current,
        dtSec: dt,
        x: sample.position.x,
        y: sample.position.y,
        speedKmh: sample.speedKmh,
        headingDeg: sample.headingDeg,
        brakePedal: inputRef.current?.rawBrake ?? 0,
        tickEvents: tick.events,
      });
      for (const e of staged.events) tick.events.push(e);
      hazardActiveRef.current = director.hazardActive;
      if (onStagedOutcome) {
        for (const o of staged.outcomes) onStagedOutcome(o);
      }
    }
    onTick(tick);

    const nowMs = tRef.current * 1000;
    if (nowMs - lastMinimapRef.current >= MINIMAP_MS) {
      lastMinimapRef.current = nowMs;
      onMinimap({
        polylines: minimapPolylines,
        transform: {
          centerX: sample.position.x,
          centerY: sample.position.y,
          pxPerMeter: MINIMAP_PX_PER_M,
        },
      });
      // A1: driveline telltales share the low-frequency cadence — the shell
      // stores the snapshot in a ref and folds it into its own HUD poll.
      const cabin = cabinRef.current;
      if (cabin) onDriveline?.(cabin.driveline.snapshot());
    }
  });

  return null;
}

/** Collapsible key legend, top-left of the canvas — clear of the bottom HUD
 *  cards and the minimap. Default open so the keys are visible (collapsed on
 *  touch-only devices, where the touch overlay is the primary input). */
function ControlsHelp({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const rows: Array<[string, string]> = [
    ["W A S D", "кормуване (или стрелки)"],
    ["I", "двигател: старт / стоп"],
    ["[ ]", "скорости: към P / към D"],
    ["Space", "ръчна спирачка"],
    ["Z", "съединител — задръж („Напреднал“)"],
    ["B", "предпазен колан"],
    [", .", "мигач ляво / дясно"],
    ["L", "светлини"],
    ["V", "фарове за мъгла"],
    ["J", "аварийни светлини"],
    ["T", "чистачки"],
    ["H", "клаксон — задръж"],
    ["Q E F", "огледала — задръж (ляво / дясно / назад)"],
    ["Клик", "контролите в кабината (изглед кокпит)"],
    ["C", "смяна на изглед"],
    ["X", "цял екран"],
    ["R  ·  Esc", "рестарт · пауза"],
  ];
  return (
    <div className="absolute left-3 top-3 z-10 max-w-[15rem]">
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted backdrop-blur transition hover:text-foreground"
      >
        <span aria-hidden>⌨</span>
        Клавиши {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-1 rounded-xl border border-border bg-background/80 p-2.5 backdrop-blur">
          {rows.map(([k, d]) => (
            <div key={k} className="flex items-center gap-2 text-[11px]">
              <kbd className="min-w-[3.75rem] rounded bg-surface px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-accent">
                {k}
              </kbd>
              <span className="text-muted">{d}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GateCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface p-6">
      <div className="max-w-md text-center">
        <p className="text-4xl" aria-hidden>
          {icon}
        </p>
        <h2 className="mt-4 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <Link href="/dashboard" className="btn-ghost mt-6">
          Обратно към началото
        </Link>
      </div>
    </div>
  );
}
