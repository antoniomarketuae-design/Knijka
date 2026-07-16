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
  WET_GRIP_FACTOR,
  type DifficultyMode,
  type DrivelineEvent,
  type DrivelineRejection,
  type DrivelineSnapshot,
  type VehicleInput,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import {
  DEFAULT_LESSON_TRAFFIC,
  lessonDistrictId,
  scenarioBaysOf,
  type NearMissEvent,
  type NearMissStats,
  type ParkingBaySpec,
  type StagedEventOutcome,
  type VehicleSample,
} from "@/modules/sim/contracts";
import {
  isScenarioLessonId,
  lessonParkingBaysFor,
  parseScenarioLessonId,
  scenarioById,
  type LessonSpec,
} from "@/modules/sim/lessons";
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
import {
  buildPoligonGhostDemo,
  createTraceClock,
  parseScenarioTrace,
  tracePathForRibbon,
  type LiveTraceRecorder,
  type RecordedDrive,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
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
import { ScenarioObstacles, type ScenarioObstacleSpec } from "./ScenarioObstacles";
import { ShadowCar } from "./ShadowCar";
import { TraceTimeline } from "./lesson-ui/TraceTimeline";
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

/** BG display names of the shipped worlds (loading/error copy). Unknown
 *  district ids fall back to a generic „света". */
const WORLD_NAME_BG: Record<string, string> = {
  "district-v1": "Студентски град",
  "poligon-v1": "учебния полигон",
  "lot-perp-v1": "учебния паркинг",
};

/**
 * S1: public URL of a committed trace (content/traces/… is published to
 * platform/public/traces/… byte-identically — the world-JSON pattern).
 */
function traceUrlFor(repoPath: string): string {
  return `/${repoPath.replace(/^content\//, "")}`;
}

/** S1 followHints tuning: sustained lateral deviation → „Следвай синята линия". */
const FOLLOW_HINT_DEVIATION_M = 1.2;
const FOLLOW_HINT_SUSTAIN_S = 2;
const FOLLOW_HINT_POLL_S = 0.25;

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

/**
 * S0-View demo flag (doc 76 §10 P0 proof-of-form; never in production
 * builds): `?ghost=demo` on полигон FREE DRIVE mounts the Shadow Car demo —
 * a scripted correct drive recorded at load through the production stack
 * (traces/demo.ts), played back as the translucent ghost + path ribbon +
 * scrub timeline, for the founder to judge the form factor.
 */
function isGhostDemoEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  try {
    return new URLSearchParams(window.location.search).get("ghost") === "demo";
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
  /** S0-View: raw district doc for the ?ghost=demo recorder — null unless
   *  the dev flag is on AND this is полигон free drive. */
  ghostDemoRaw: unknown | null;
  /** S1: precise hittable parked cars from the district's meta.scenario
   *  occupancy (scenario lessons only; [] everywhere else). */
  scenarioObstacles: ScenarioObstacleSpec[];
  /** S1: the template's recorded shadow trace — fetched only when the
   *  lesson's aids ask for the ghost or the ribbon; null otherwise. */
  shadowTrace: ScenarioTrace | null;
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
  /**
   * S0-View (additive, doc 76 §5 attempt recording): a live trace recorder
   * created via traces.createTraceRecorder — when provided, the frame loop
   * streams the STUDENT's drive into it (20 Hz kinematics + glance/signal/
   * driveline events). OFF by default (prop absent); the owner calls
   * finish() at session end for compare-vs-shadow / replay.
   */
  attemptRecorderRef?: React.RefObject<LiveTraceRecorder | null>;
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
        // THE multi-map seam (doc 74 §5.2): the lesson spec names its world;
        // everything below is parameterized by the parsed document.
        const districtId = lessonDistrictId(props.lesson);
        const res = await fetch(`/world/${districtId}.json`);
        if (!res.ok) throw new Error(`district ${districtId} ${res.status}`);
        const raw: unknown = await res.json();
        const runtime = createWorldRuntime(raw);
        const district = assertDistrict(raw);
        // Bay paint is CURRICULUM data, per district (doc 74 §5.4): pass the
        // loaded map's bays explicitly so city bays never paint onto the
        // полигон (and vice versa) — the builder's default is district-v1's.
        // S1: scenario-lot districts ADD their meta.scenario bay rects (the
        // generator's single geometric truth — the compiled lesson's
        // parkingBay IS one of them by the templates contract test), plus
        // the lesson's own graded rect defensively deduped — the L7
        // painted-rect-equals-graded-rect law survives the generated maps.
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
          props.lesson.parkingBay &&
          !paintBays.some(
            (b) => b.x === props.lesson.parkingBay!.x && b.y === props.lesson.parkingBay!.y,
          )
        ) {
          paintBays.push({ ...props.lesson.parkingBay });
        }
        const geometry = buildWorldGeometry(district, {
          parkingBays: paintBays,
        });
        // S1: occupied bays become PRECISE hittable parked cars (doc 76 §0)
        // — scenario lessons only; curriculum districts carry no scenario
        // meta, so this stays [] and nothing mounts.
        const scenarioObstacles: ScenarioObstacleSpec[] = isScenarioLessonId(props.lesson.id)
          ? scenarioBays
              .filter((b) => b.occupied)
              .map((b, i) => ({
                kind: "vehicle" as const,
                x: b.x,
                y: b.y,
                headingDeg: b.headingDeg,
                seed: i,
              }))
          : [];
        // S1: the shadow/ribbon aids need the template's recorded trace.
        let shadowTrace: ScenarioTrace | null = null;
        if (props.lesson.aids?.shadowCar || props.lesson.aids?.pathRibbon) {
          const parsedId = parseScenarioLessonId(props.lesson.id);
          const template = parsedId ? scenarioById(parsedId.templateId) : undefined;
          if (template && template.shadow.pending !== true) {
            try {
              const traceRes = await fetch(traceUrlFor(template.shadow.path));
              if (traceRes.ok) {
                shadowTrace = parseScenarioTrace(await traceRes.json());
              }
            } catch {
              // Trace unavailable — the drill still plays, just without the
              // ghost/ribbon (never block the lesson on an aid).
            }
          }
        }
        const spawnPoints = (
          (raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? []
        );
        // Anchor traffic at the lesson spawn so cars + pedestrians are where the
        // driver actually is — routes otherwise scatter across the ~1.6 km map
        // and every agent gets distance-culled (nearest car was ~340 m away).
        // Counts are per-lesson data since the полигон (doc 74 §5.5); the
        // defaults are the pre-seam city values.
        const anchorPose = spawnPose(props.lesson, spawnPoints);
        const trafficSpec = props.lesson.traffic;
        const traffic = createTrafficSystem(
          raw as Parameters<typeof createTrafficSystem>[0],
          {
            anchor: { x: anchorPose.x, y: -anchorPose.z },
            anchorRadiusM: trafficSpec?.anchorRadiusM ?? DEFAULT_LESSON_TRAFFIC.anchorRadiusM,
            vehicleCount: trafficSpec?.vehicleCount ?? DEFAULT_LESSON_TRAFFIC.vehicleCount,
            pedestrianCount:
              trafficSpec?.pedestrianCount ?? DEFAULT_LESSON_TRAFFIC.pedestrianCount,
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
                // B1a N2 / JU-18: the runtime IS the SignalDirectorPort — the
                // same production wiring the recorder and the orchestrator
                // harness use, so phase-driven runners (amberDilemma pins,
                // trafficController mode + timetable) work in LIVE play too.
                signals: runtime,
              })
            : null;
        // S0-View: the ghost demo needs the raw doc for its headless recorder.
        const ghostDemoRaw =
          isGhostDemoEnabled() &&
          districtId === "poligon-v1" &&
          props.lesson.objectives.length === 0
            ? raw
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
            ghostDemoRaw,
            scenarioObstacles,
            shadowTrace,
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
  const worldName = WORLD_NAME_BG[lessonDistrictId(props.lesson)] ?? "света";
  if (loadError) {
    return (
      <GateCard
        icon="⚠️"
        title="Светът не се зареди"
        body={`Данните за ${worldName} не успяха да се заредят. Провери връзката и опитай пак.`}
      />
    );
  }
  if (!built) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm">Зареждане на {worldName}…</p>
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
  attemptRecorderRef,
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

  // S0-View ?ghost=demo: record the scripted shadow drive ONCE per scene
  // (deterministic, <100 ms — the same recorder the vitest suite gates) and
  // play it through ShadowCar + TraceTimeline via a shared clock ref.
  const ghostDemo = useMemo<RecordedDrive | null>(() => {
    if (!built.ghostDemoRaw) return null;
    try {
      return buildPoligonGhostDemo(built.ghostDemoRaw);
    } catch (err) {
      console.warn("LessonScene: ghost demo recording failed", err);
      return null;
    }
  }, [built.ghostDemoRaw]);
  const ghostClockRef = useRef<TraceClock>(createTraceClock());

  // S1 scenario aids (doc 76 §7): the compiled lesson's aids drive the
  // consumers below. Absent aids (every curriculum lesson) = everything
  // inert, byte-identical behavior.
  const aids = lesson.aids;
  const shadowTrace = built.shadowTrace;
  const aidClockRef = useRef<TraceClock>(createTraceClock());
  // followHints: sustained deviation from the shadow path → one hint chip.
  const [followHintOn, setFollowHintOn] = useState(false);

  const timeOfDay = lesson.environment?.timeOfDay ?? "day";
  const rain = lesson.environment?.rain ?? false;
  // FOG weather (doc 72 AC-03): dense FogExp2 + dimmed rig in SimEnvironment,
  // and tick.fog through RuntimeDriver → runtime.sample (the rain seam).
  const fogWeather = lesson.environment?.fog ?? false;
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
  // touch overlay buttons — one code path per action. S0-View: C now CYCLES
  // three views — cockpit → chase → top-down (doc 76 §4, view-only concern:
  // grading never reads the camera). S1: on SCENARIO lessons top-down joins
  // the driving cycle only when the level's aids allow it (L1 „Воден опит");
  // L2–L4 lock to cockpit/chase like the doc 76 §4 ladder. Curriculum
  // lessons keep the full three-view cycle unchanged.
  const topdownInCycle = !isScenarioLessonId(lesson.id) || aids?.topdownAllowed === true;
  const toggleCamera = useCallback(() => {
    const order: CameraMode[] = topdownInCycle
      ? ["cockpit", "chase", "topdown"]
      : ["cockpit", "chase"];
    const idx = order.indexOf(cameraModeRef.current);
    const next = order[(idx + 1) % order.length]; // idx −1 (stale topdown) → cockpit
    cameraModeRef.current = next;
    setCockpit(next === "cockpit");
  }, [topdownInCycle]);

  // Enter top-down directly (used by the G/N top-down hotkeys so they work
  // from any view instead of silently no-op'ing outside top-down). Guarded by
  // topdownInCycle at the call site — exam rungs, where top-down is disallowed,
  // never enter it.
  const enterTopdown = useCallback(() => {
    if (cameraModeRef.current === "topdown") return;
    cameraModeRef.current = "topdown";
    setCockpit(false);
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
  // N11 (VP-06): the cockpit-lamp twin of hazardActiveRef — RuntimeDriver
  // copies director.telltaleLit here each frame; VitokCockpit's cluster lights
  // the red temperature telltale off it (render-free). The edge additionally
  // flips the L1/L2 HUD cue state below (state changes only on edges).
  const telltaleLitRef = useRef(false);
  const [telltaleCueOn, setTelltaleCueOn] = useState(false);

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
        // "percentage" = PCFShadowMap. Bare `shadows` requests PCFSoftShadowMap,
        // which three r185 deprecated — it falls back to PCFShadowMap anyway but
        // logs a deprecation warning on every shadow render (hundreds/session).
        // Explicit type: identical output, silent console.
        shadows="percentage"
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
        <SimEnvironment timeOfDay={timeOfDay} rain={rain} fog={fogWeather} quality={level} />
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
                // S1: scenario drills grade ANY contact (compile writes 0);
                // absent = the street nudge tolerance (default 10).
                collisionMinKmh={lesson.collisionMinKmh}
                night={isNight}
                // 4a: the OPT-IN wet-grip physics. Read from the AUTHORED
                // physics field only — never derived from environment.rain
                // (shipped rain lessons were tuned against dry physics).
                gripFactor={lesson.physics?.wetGrip ? WET_GRIP_FACTOR : 1}
                // N11 (VP-06): director→cluster warning-lamp channel.
                telltaleLitRef={telltaleLitRef}
              />
            </CockpitInteractionContext.Provider>
            {/* S1: precise hittable parked cars from the lot's occupancy —
                fixed tight cuboids tagged "vehicle" (doc 76 §0). Mounted
                only on scenario lessons (empty list everywhere else). */}
            {built.scenarioObstacles.length > 0 ? (
              <Suspense fallback={null}>
                <ScenarioObstacles
                  obstacles={built.scenarioObstacles}
                  clearcoat={level === "high"}
                />
              </Suspense>
            ) : null}
            <RuntimeDriver
              runtime={runtime}
              traffic={traffic}
              director={director}
              hazardActiveRef={hazardActiveRef}
              telltaleLitRef={telltaleLitRef}
              onTelltale={setTelltaleCueOn}
              sampleRef={sampleRef}
              simRef={simRef}
              inputRef={inputRef}
              cabinRef={cabinRef}
              audioRef={audioRef}
              attemptRecorderRef={attemptRecorderRef}
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
              fog={fogWeather}
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
        {/* S0-View ?ghost=demo: the Shadow Car (translucent ghost + blue path
            ribbon) plays the recorded trace kinematically — no physics. */}
        {ghostDemo ? (
          <Suspense fallback={null}>
            <ShadowCar trace={ghostDemo.trace} clockRef={ghostClockRef} />
          </Suspense>
        ) : null}
        {/* S1 aids (doc 76 §7): L1 shadowCar = ghost + ribbon + timeline;
            L2 pathRibbon = the correct-path ribbon ALONE. */}
        {shadowTrace && (aids?.shadowCar || aids?.pathRibbon) ? (
          <Suspense fallback={null}>
            <ShadowCar
              trace={shadowTrace}
              clockRef={aidClockRef}
              showGhost={aids?.shadowCar === true}
            />
          </Suspense>
        ) : null}
        {/* S1 followHints: sustained lateral deviation from the shadow path
            flips the hint chip below (probe runs in-canvas, ~4 Hz). */}
        {shadowTrace && aids?.followHints ? (
          <FollowHintProbe
            trace={shadowTrace}
            sampleRef={sampleRef}
            paused={physicsPaused}
            onChange={setFollowHintOn}
          />
        ) : null}
        <CameraRig
          chassisGroupRef={chassisGroupRef}
          simRef={simRef}
          cameraModeRef={cameraModeRef}
          cabinRef={cabinRef}
          telemetryRef={telemetryRef}
          topdownAllowed={topdownInCycle}
          enterTopdown={enterTopdown}
        />
        {cockpit && rain ? <WindshieldDroplets /> : null}
      </Canvas>

      {/* Controls legend — collapsible, top-left of the canvas (clear of the
          bottom cards + minimap). Collapsed by default on touch-only devices
          (the keys are real but secondary there). */}
      <ControlsHelp defaultOpen={!touchOnly} topdownAllowed={topdownInCycle} />

      {/* S0-View ?ghost=demo: playback deck for the Shadow Car — scrub bar,
          speeds, annotation ticks, step-by-step, loop-section. */}
      {ghostDemo ? (
        <div className="absolute bottom-3 left-1/2 z-10 w-[min(92%,36rem)] -translate-x-1/2">
          <TraceTimeline trace={ghostDemo.trace} clockRef={ghostClockRef} />
        </div>
      ) : null}

      {/* S1 L1 aid: the same playback deck for the scenario's shadow demo. */}
      {shadowTrace && aids?.shadowCar ? (
        <div className="absolute bottom-3 left-1/2 z-10 w-[min(92%,36rem)] -translate-x-1/2">
          <TraceTimeline trace={shadowTrace} clockRef={aidClockRef} />
        </div>
      ) : null}

      {/* S1 followHints chip — „you are off the demonstrated line". */}
      {followHintOn && aids?.followHints ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2">
          <div className="rounded-full border border-accent/60 bg-background/85 px-3.5 py-1.5 text-xs font-bold text-accent shadow-glow-sm backdrop-blur">
            Следвай синята линия
          </div>
        </div>
      ) : null}

      {/* N11 (VP-06) telltale cue — the L1/L2 aid twin of the followHints
          chip: while the staged dashboard lamp is lit, name it and the taught
          response. L3+ strips it — noticing the CLUSTER is the drill. */}
      {telltaleCueOn && aids?.pathRibbon ? (
        <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2">
          <div className="rounded-full border border-danger/60 bg-background/85 px-3.5 py-1.5 text-xs font-bold text-danger shadow-glow-sm backdrop-blur">
            Контролна лампа: температура! Спри спокойно вдясно
          </div>
        </div>
      ) : null}

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

/**
 * S1 followHints probe (doc 76 §7 L1): watches the student's lateral
 * deviation from the shadow trace's ground path and flips `onChange(true)`
 * after FOLLOW_HINT_DEVIATION_M is exceeded for FOLLOW_HINT_SUSTAIN_S
 * continuous seconds (back within → immediately off). In-canvas because it
 * needs the frame clock; work is a ~4 Hz nearest-point scan over the
 * decimated path (≤ 2048 points — trivial), state changes only on edges.
 */
function FollowHintProbe({
  trace,
  sampleRef,
  paused,
  onChange,
}: {
  trace: ScenarioTrace;
  sampleRef: React.RefObject<VehicleSample>;
  paused: boolean;
  onChange: (on: boolean) => void;
}) {
  const path = useMemo(() => tracePathForRibbon(trace, 1.0, 2048), [trace]);
  const stateRef = useRef({ nextPollT: 0, offSince: null as number | null, on: false });
  useFrame((state) => {
    if (paused) return;
    const s = stateRef.current;
    const now = state.clock.elapsedTime;
    if (now < s.nextPollT) return;
    s.nextPollT = now + FOLLOW_HINT_POLL_S;
    const pos = sampleRef.current.position;
    let best = Infinity;
    for (let i = 0; i < path.count; i++) {
      const dx = pos.x - path.pts[i * 2];
      const dy = pos.y - path.pts[i * 2 + 1];
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    const deviated = Math.sqrt(best) > FOLLOW_HINT_DEVIATION_M;
    if (!deviated) {
      s.offSince = null;
      if (s.on) {
        s.on = false;
        onChange(false);
      }
      return;
    }
    if (s.offSince === null) s.offSince = now;
    if (!s.on && now - s.offSince >= FOLLOW_HINT_SUSTAIN_S) {
      s.on = true;
      onChange(true);
    }
  });
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
  telltaleLitRef,
  onTelltale,
  sampleRef,
  simRef,
  inputRef,
  cabinRef,
  audioRef,
  attemptRecorderRef,
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
  fog,
  paused,
}: {
  runtime: ReturnType<typeof createWorldRuntime>;
  traffic: ReturnType<typeof createTrafficSystem>;
  /** A8 scenario director (null = lesson stages nothing). */
  director: ScenarioDirector | null;
  /** A8 → TrafficLayer: animate the lesson hazard visual while true. */
  hazardActiveRef: React.RefObject<boolean>;
  /** N11 (VP-06) → VitokCockpit: the staged dashboard lamp is lit while true
   *  (the hazardActiveRef twin for the cockpit cluster). */
  telltaleLitRef: React.RefObject<boolean>;
  /** Edge callback for the L1/L2 HUD cue (state flips only on lamp edges). */
  onTelltale?: (on: boolean) => void;
  sampleRef: React.RefObject<VehicleSample>;
  /** S0-View: live steer angle for the attempt recorder (visual channel). */
  simRef: React.RefObject<VehicleSim | null>;
  inputRef: React.RefObject<GatedSimInput | null>;
  cabinRef: React.RefObject<CabinControls | null>;
  audioRef: React.RefObject<SimAudio | null>;
  /** S0-View attempt recording — absent/null = off (default). */
  attemptRecorderRef?: React.RefObject<LiveTraceRecorder | null>;
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
  /** FOG weather flag — reaches every tick via runtime.sample (the rain seam). */
  fog: boolean;
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
  // S0-View attempt recorder: last indicator setting → signal-on/off edges.
  const recIndicatorRef = useRef<"off" | "left" | "right">("off");

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
    // S0-View: stream driveline transitions into the attempt trace before
    // the queues drain (sparse events — allocation is allowed there).
    const recorder = attemptRecorderRef?.current;
    if (recorder) {
      for (const event of drivelineEvents) {
        recorder.addEvent("driveline", tRef.current, undefined, event.kind);
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
    const tick = runtime.sample(sample, tRef.current, isNight, rain, leadGap, fog);

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
      // N11 (VP-06): the cockpit-lamp channel — the cluster reads the ref per
      // frame; the HUD cue + the attempt trace react on EDGES only. The
      // rising-edge annotation marks the stimulus moment for the ghost story
      // of the student's own attempt (the recorder never renders).
      const lit = director.telltaleLit;
      if (lit !== telltaleLitRef.current) {
        telltaleLitRef.current = lit;
        onTelltale?.(lit);
        if (lit) {
          recorder?.addEvent(
            "annotation",
            tRef.current,
            "Светна контролна лампа — температура на двигателя.",
          );
        }
      }
      if (onStagedOutcome) {
        for (const o of staged.outcomes) onStagedOutcome(o);
      }
    }
    onTick(tick);

    // S0-View attempt recording (doc 76 §5): the ring recorder decimates the
    // frame feed to ~20 Hz itself — push() is zero-alloc, so this stays free
    // when the prop is absent and cheap when it isn't.
    if (recorder) {
      recorder.push({
        tSec: tRef.current,
        x: sample.position.x,
        y: sample.position.y,
        headingDeg: sample.headingDeg,
        steerRad: simRef.current?.steerRad ?? 0,
        speedKmh: sample.speedKmh,
        gear: sample.gear,
        indicator: sample.indicator,
        brakeOn: (inputRef.current?.rawBrake ?? 0) > 0.15,
        throttleOn: (inputRef.current?.rawThrottle ?? 0) > 0.15,
      });
      // Sparse events: glances arrive as one-frame sample values; indicator
      // edges become signal-on/off.
      if (sample.mirrorGlance) {
        recorder.addEvent(`glance-${sample.mirrorGlance}`, tRef.current);
      }
      if (sample.indicator !== recIndicatorRef.current) {
        recIndicatorRef.current = sample.indicator;
        if (sample.indicator === "off") recorder.addEvent("signal-off", tRef.current);
        else recorder.addEvent("signal-on", tRef.current, undefined, sample.indicator);
      }
    }

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
function ControlsHelp({
  defaultOpen = true,
  topdownAllowed = true,
}: {
  defaultOpen?: boolean;
  /** Only advertise the top-down view + its G/N controls when it's reachable
   *  (curriculum lessons + scenario L1; exam rungs lock it out). */
  topdownAllowed?: boolean;
}) {
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
    ["C", topdownAllowed ? "изглед: кокпит / отвън / отгоре" : "изглед: кокпит / отвън"],
    ...(topdownAllowed
      ? ([
          ["G", "мащаб отгоре: 20 / 40 / 80 м (влиза в изглед отгоре)"],
          ["N", "отгоре: север горе / посока горе"],
        ] as Array<[string, string]>)
      : []),
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
