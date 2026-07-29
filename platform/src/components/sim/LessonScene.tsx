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
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { Euler, type Group } from "three";
import {
  applyReversePedalRemap,
  createTelemetry,
  hasTouchScreen,
  isTouchOnlyDevice,
  ReverseAssist,
  shouldRemapReversePedals,
  SimInput,
  TouchInputSource,
  useReverseViewEnabled,
} from "@/modules/sim/engine";
import {
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_GUST_PERIOD_SEC,
  FIXED_DT,
  GRAVITY,
  SPAWN,
  CHASE_FOV,
  DIFFICULTY_ORDER,
  DIFFICULTY_PRESETS,
  DEFAULT_DIFFICULTY,
  storeDifficulty,
  SNOW_GRIP_FACTOR,
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
  type NearMissEvent,
  type NearMissStats,
  type StagedEventOutcome,
  type VehicleSample,
} from "@/modules/sim/contracts";
import {
  isScenarioLessonId,
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
import {
  createDashboardStatus,
  RearProximityCue,
  TelltaleEdgePings,
  type DashboardStatus,
  type MinimapFrame,
} from "@/modules/sim/hud";
import {
  SimEnvironment,
  WindshieldDroplets,
  mapKindHasSkyline,
  QUALITY_PRESETS,
  RAIN_IBL_DIM,
  PerfProbe,
  GlContextGuard,
} from "@/modules/sim/environment";
import {
  DistrictWorld,
  LaneSignalGantry,
  TEXTURE_BUDGETS,
  assertDistrict,
  type WorldGeometry,
} from "@/modules/sim/world";
import { createWorldRuntime, type SurfaceGripPatch } from "@/modules/sim/runtime";
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
import { CabinControls, type MirrorGlanceKind } from "@/modules/sim/scene/cabin";
import { TouchControls } from "./TouchControls";
import { CockpitInteractionContext } from "@/modules/sim/scene/vitok/hotspots";
import { SimAudio } from "@/modules/sim/scene/simAudio";
import { AudioLessonPrompt } from "./AudioLessonPrompt";
import { CameraRig, type CameraMode } from "./CameraRig";
import { VehicleRig, type CollisionWithWhat, type VehicleSpawn } from "./VehicleRig";
import { NpcColliders } from "./NpcColliders";
import { createVehicleSample } from "@/modules/sim/scene/vehicleSample";
import { buildMinimapPolylines } from "@/modules/sim/scene/lessonMinimap";
import {
  applySignalModes,
  buildLessonWorldCore,
  wireTrafficQueries,
  type LessonWorldCore,
} from "@/modules/sim/scene/lessonWorldRecipe";
import { RouteGuidance } from "./RouteGuidance";
import { ScenarioObstacles, type ScenarioObstacleSpec } from "./ScenarioObstacles";
import { ShadowCar } from "./ShadowCar";
// [glance-pings] the look-left/right teaching overlay (see the wiring block).
import { GlanceEdgePings, type GlancePingTap } from "./lesson-ui/GlanceEdgePings";
import { TraceTimeline } from "./lesson-ui/TraceTimeline";
import { worldNameBg } from "@/modules/sim/scene/worldNames";
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

/**
 * Perf readout opt-in: `?simPerf=1` on the URL, or `localStorage["sim.perfLog"]
 * ="1"` in a dev build. Read once at scene mount.
 *
 * THE URL FLAG WORKS IN PRODUCTION, ON PURPOSE (doc 82 §6.2). The A16
 * measurement that gates every later phase has to be taken on a PRODUCTION
 * build — a dev build runs unminified React with no chunk splitting, so it
 * would report a load time and a parse cost that describe no student's
 * session. Refusing to instrument production would mean the gate could only
 * ever be closed with a number that is wrong in the pessimistic direction,
 * which is not honest either.
 *
 * What it costs a real user who never types the flag: nothing — the probe is
 * not mounted. What it costs one who does: console output only. Nothing is
 * transmitted (ADR-004); see PerfProbe's header. The localStorage path stays
 * dev-only so a stray key cannot make a student's session log forever.
 */
function shouldLogPerf(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has("simPerf")) return true;
    if (process.env.NODE_ENV === "production") return false;
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
  /** Auto-reverse assist rule b (engine/reverseAssist.ts): while true —
   *  selector R × automatic box × non-exam lesson, kept current by the
   *  driveline subscription in the input lifecycle effect — read() swaps the
   *  pedals so S/↓ accelerates backward and W/↑ brakes ("down = backwards"
   *  is literally true in R). Applied BEFORE the raw capture below, so the
   *  A2 observer, the scenario director and the recorder all see the
   *  FUNCTIONAL pedals. */
  reversePedalRemap = false;
  /** Raw (pre-gate) pedal values from the last read — the A2 procedure
   *  observer edge-detects these: a real brake press performs "press-brake",
   *  a throttle press on a ready driveline performs "move-off". */
  rawThrottle = 0;
  rawBrake = 0;
  private blockedThrottleAttempt = false;

  override read(): VehicleInput {
    const out = super.read();
    if (this.reversePedalRemap) applyReversePedalRemap(out);
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
  /** Authored clear zones for the parked-car curb decoration (doc 66 R5,
   *  founder v1 №9 — recipe-supplied, template-scoped, visual-only). */
  parkedClearZones: LessonWorldCore["parkedClearZones"];
  /** SURFACE-PATCH slice: waterPatch/icePatch rects resolved from the
   *  district's zone spans — [] on every pre-slice map, so VehicleRig's
   *  patch branch (and VehicleSim's grip setter) never runs there. */
  gripPatches: SurfaceGripPatch[];
  /** S1: the template's recorded shadow trace — fetched only when the
   *  lesson's aids ask for the ghost or the ribbon; null otherwise. */
  shadowTrace: ScenarioTrace | null;
  /** SPD (founder review R3 #37): the lesson's speed DOMAIN — max edge
   *  maxspeed of the loaded map, km/h — scales the difficulty governor
   *  (VehicleRig → applyDifficulty). undefined = no edges (never in
   *  practice) → the legacy static caps. */
  lessonMaxLegalKmh: number | undefined;
}

/** Max legal speed anywhere on the loaded map (km/h); undefined = unknown. */
function maxLegalSpeedOf(district: ReturnType<typeof assertDistrict>): number | undefined {
  let max = 0;
  for (const e of district.roads.edges) {
    if (Number.isFinite(e.maxspeed) && e.maxspeed > max) max = e.maxspeed;
  }
  return max > 0 ? max : undefined;
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
  /** Status-dashboard channel (additive): mutated once per frame with the
   *  live cabin/driveline/sample state — the shell's StatusDashboard bar
   *  samples it low-Hz (hud/dashboardStatus.ts). Absent = no writes. */
  dashboardStatusRef?: React.RefObject<DashboardStatus>;
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
        // THE drill's world recipe — extracted verbatim to lessonWorldRecipe
        // (doc 66 R5: the clip-capture rig mounts the SAME core, so the two
        // scenes cannot drift apart): runtime, validated district, bay paint,
        // buildWorldGeometry, occupied-bay obstacles + held scenery, grip
        // patches, spawn points.
        const core = buildLessonWorldCore(props.lesson, raw);
        const { runtime, district, geometry, scenarioObstacles, gripPatches } = core;
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
        const spawnPoints = core.spawnPoints;
        // Anchor traffic at the lesson spawn so cars + pedestrians are where the
        // driver actually is — routes otherwise scatter across the ~1.6 km map
        // and every agent gets distance-culled (nearest car was ~340 m away).
        // Counts are per-lesson data since the полигон (doc 74 §5.5); the
        // defaults are the pre-seam city values.
        const anchorPose = spawnPose(props.lesson, spawnPoints);
        // SIGNAL-PLAN (founder bug 2026-07-17: wall-clock phases made the
        // arrival phase arbitrary after the 20–40 s pre-drive): arm the
        // lesson's approach-relative ONE-SHOT pin — the runtime rebases the
        // cluster's cycle when the player first comes within triggerM, so
        // the taught arrival phase is deterministic. LIVE sessions only:
        // the trace recorder never arms a plan (recorded traces pin via
        // authored signalOffsets — the byte-identity contract). The spawn
        // anchor resolves the default cluster (nearest) when the plan
        // names none; district y = −world z (the traffic-anchor convention).
        if (props.lesson.signalPlan) {
          runtime.armSignalPlan(props.lesson.signalPlan, {
            x: anchorPose.x,
            y: -anchorPose.z,
          });
        }
        // SIGNAL MODES (doc 62 S1 — the live half of the recorder's
        // signalModes dial): a „загаснал светофар"/„мигащо жълто" lesson
        // dials its cluster DARK / FLASHING AMBER at session start, so LIVE
        // play matches the recorded traces — grading falls back to the
        // uncontrolled-junction rules AND the lamps render unlit/blinking
        // from the same mode state (signalLampState). A staged
        // trafficController armed later overrides the mode (its own law).
        applySignalModes(runtime, props.lesson);
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
        // Telemetry queries (pedestrian/junction/oncoming/right/circulating/
        // cyclist/overtaken) — the shared seven-hookup set (lessonWorldRecipe).
        wireTrafficQueries(runtime, traffic);
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
            parkedClearZones: core.parkedClearZones,
            gripPatches,
            shadowTrace,
            // #37: the map's own speed domain drives the governor cap — the
            // АМ-140 map lets Нормален reach the flow, the 50-city keeps
            // governing just above the limit.
            lessonMaxLegalKmh: maxLegalSpeedOf(district),
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
  const worldName = worldNameBg(lessonDistrictId(props.lesson));
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
  dashboardStatusRef,
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
  // SNOW weather (doc 72 AC-08): the lighter cold haze + tick.snow — the
  // same seam as fog; the snow-grip PHYSICS rides lesson.physics, never this.
  const snowWeather = lesson.environment?.snow ?? false;
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
  // Difficulty: EVERY SCENE OPENS AT DEFAULT_DIFFICULTY ("normal" since the
  // 2026-07-19 founder ruling — beginner's 40 km/h governor made speeding
  // mistakes impossible to commit; see vehicle/difficulty.ts).
  //
  // It used to restore the last persisted click, which meant one press of
  // „Напреднал" silently pinned every subsequent scenario to the manual tier —
  // the founder hit that reviewing the 150 and could not tell why every scene
  // behaved differently from the one before. A tier is a choice about THIS
  // drive, not a setting that follows you around; the picker still switches it
  // mid-scene, and storeDifficulty still records the click for anything that
  // wants to know the preference.
  const [difficulty, setDifficultyState] = useState<DifficultyMode>(DEFAULT_DIFFICULTY);
  const difficultyRef = useRef<DifficultyMode>(difficulty);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);
  // Selector click path ONLY — never called with the default (the storage
  // contract: absent key = no explicit choice, follows future default flips).
  const setDifficulty = useCallback((mode: DifficultyMode) => {
    setDifficultyState(mode);
    storeDifficulty(mode);
  }, []);

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

  // Auto-reverse assist (founder 2026-07-17: „стрелката надолу не кара
  // назад"): the pure timing machine (engine/reverseAssist.ts) plus the flag
  // that marks assist-driven selector steps, so the driveline subscription
  // below can tell them from MANUAL shifts ([ / ], touch gear sheet, cockpit
  // hotspots) — manual shifts silence the assist for 2 s (never fight
  // explicit input). DISABLED for the whole session on examMode lessons:
  // the exam grades the real selector procedure (D↔R via the gate).
  const [reverseAssist] = useState(() => new ReverseAssist());
  const assistShiftingRef = useRef(false);
  const reverseAssistEnabled = lesson.examMode !== true;
  const dismissTouchHint = useCallback(() => {
    setShowTouchHint(false);
    try {
      window.localStorage.setItem(TOUCH_HINT_STORAGE_KEY, "1");
    } catch {
      // Private mode — the hint just shows again next session.
    }
  }, []);

  // Camera toggle + car reset, shared by the key callbacks (C/R) and the
  // touch overlay buttons — one code path per action. S0-View: C CYCLES three
  // views — cockpit → chase → top-down (doc 76 §4, view-only concern: grading
  // never reads the camera). Curriculum lessons and the exam bank always carry
  // the full cycle. SCENARIO rungs read their compiled aids — which since the
  // 2026-07-17 founder ruling grant top-down on EVERY level (compile.ts
  // DEFAULT_LEVEL_AIDS): a POV is not an aid, and reverse-park is unreadable
  // without G. The read stays instead of collapsing to `true` because a rung
  // may still opt OUT explicitly (aids: { topdownAllowed: false }) — that rung
  // must really lose G.
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
  // #24 wiper visual channel: VehicleRig writes the live blade sweep +
  // wiped-arc clearing level per frame; WindshieldDroplets reads it (render-
  // free ref, the hazardActiveRef pattern).
  const wiperVisualRef = useRef({ sweep01: 0, clearing: 0 });

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

  // -- [glance-pings] look-left/right teaching affordances (founder
  // 2026-07-20) — ISOLATED ADDITIVE WIRING, nothing else in this file.
  // GlanceEdgePings (mounted in the overlay below) installs a read-only
  // observer into this ref; the wrapper feeds every tick through it BEFORE
  // the shell's handler. No new engine channel, grading untouched — the
  // overlay only consumes the junction-proximity + mirrorGlance data the
  // HUD tick stream already carries.
  const glancePingTapRef = useRef<GlancePingTap | null>(null);
  const onTickWithGlancePings = useCallback(
    (t: SimTick) => {
      glancePingTapRef.current?.(t);
      onTickCb(t);
    },
    [onTickCb],
  );

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
      // Spawn policy. An explicit `vehicleStart` always wins. Otherwise the
      // question is whether THIS lesson is teaching the pre-drive or merely
      // requiring it before the real lesson can begin.
      //
      // It used to default to "cold" everywhere (A1 policy), which meant every
      // one of the 150 scenarios opened with the engine off in P. The founder
      // reviewing them hit ignition + selector on all 150 before reaching the
      // thing he wanted to look at, and asked for exactly one item left
      // outstanding at spawn: the seatbelt. That is the right call — an unbelted
      // start still teaches the habit that matters, because the belt is the one
      // pre-drive step whose omission the rule engine goes on grading for the
      // whole session.
      //
      // `preDriveMode: "assess"` is the marker for a lesson that is GRADING the
      // pre-drive — the exams. Those keep the cold start, because performing it
      // is the thing being measured; handing them a running engine would delete
      // the assessment. Everything else spawns ready-to-drive.
      lesson.vehicleStart ?? (lesson.preDriveMode === "assess" ? "cold" : "ready"),
    );
    cabinRef.current = cabin;
    // A2: observe every driveline transition (ignition/selector/parking
    // brake/…) — RuntimeDriver drains the queue and resolves steps from it.
    const unsubscribeDriveline = cabin.driveline.subscribe((event) => {
      drivelineEventsRef.current.push(event);
      // Auto-reverse assist bookkeeping: a selector change NOT initiated by
      // the assist itself is an explicit driver shift → 2 s of silence; and
      // the rule-b pedal remap tracks the live selector × transmission on
      // every event (selectorChanged, transmissionChanged — recomputing on
      // the rest is a cheap no-op).
      if (event.kind === "selectorChanged" && !assistShiftingRef.current) {
        reverseAssist.noteManualShift();
      }
      input.reversePedalRemap =
        reverseAssistEnabled &&
        shouldRemapReversePedals(cabin.driveline.selector, cabin.driveline.transmission);
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

  // S1 (doc 62): the lamp render callback consumes the GRADED signal state —
  // runtime.signalLampState is mode-aware (dark → unlit, flashingAmber → the
  // blink pair on the runtime clock) and approach-aware (each head lights its
  // own arm's axis-group, including any signalPlan/staged pin rebase). Never
  // wire runtime.signalPhase here: it ignores cluster modes by contract.
  const getSignalPhase = useCallback(
    (id: string, approachBearingDeg: number) => runtime.signalLampState(id, approachBearingDeg),
    [runtime],
  );

  // Rail-barrier arm sync (agent R): the guarded-crossing arm follows the
  // SAME validated timetable runtime.sample() grades, at the last graded
  // clock — one truth, never a render-side second clock (rx-guarded/rx-drop).
  const getRailBarrierDown = useCallback(
    (x: number, y: number) => runtime.railBarrierDownAt(x, y),
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
        {/* Always on (doc 82 §2.3 fix 4): on a 4 GB phone an OOM presents as a
            silent black canvas. Costs two DOM listeners and renders nothing;
            everything it records stays on the device (ADR-004). */}
        <GlContextGuard level={level} />
        {/* `skyline` comes from the MAP, not from this component: the fenced
            полигон and the parking lots have no far horizon, so the Vitosha
            ridge is gated off there (doc 82 §3.2 V3). Everything else is a
            Sofia street and keeps it. */}
        <SimEnvironment
          timeOfDay={timeOfDay}
          rain={rain}
          fog={fogWeather}
          snow={snowWeather}
          skyline={mapKindHasSkyline(district.meta.mapKind)}
          quality={level}
        />
        {/* HDRI image-based lighting — real sky reflections/ambient for PBR
            materials, glass, mirrors and car paint. background=false keeps
            SimEnvironment's animated sky dome. Day uses the golden-hour
            shanghai_riverside (rotated so its baked sun matches the preset
            sun azimuth — see DAY_ENV_ROTATION); night uses a dim dusk/urban
            PMREM so metal/glass/mirrors sample a faint skyline instead of
            black (a graded mirror feature needs *something* to reflect at
            night). Intensities stay modest so the IBL complements the
            sun/hemisphere rig rather than flattening it.

            NOT MOUNTED AT `low` (audit H-11): one 1.5 MB HDR is more than twice
            the entire low-tier texture budget, and the tier it serves already
            has no composer, no shadows and no clearcoat — the reflections it
            feeds are the least visible they will ever be. The ruling lives in
            TEXTURE_BUDGETS (sim/world), which the texture loaders read too, so
            the download tier cannot drift from the render tier again. */}
        {TEXTURE_BUDGETS[level].hdrEnvironment ? (
          <Suspense fallback={null}>
            <Environment
              files={
                isNight ? "/sim/env/sky_urban_1k.hdr" : "/sim/env/shanghai_riverside_1k.hdr"
              }
              background={false}
              environmentIntensity={isNight ? 0.12 : rain ? 0.5 * (1 - RAIN_IBL_DIM) : 0.5}
              environmentRotation={isNight ? NIGHT_ENV_ROTATION : DAY_ENV_ROTATION}
            />
          </Suspense>
        ) : null}
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
              getRailBarrierDown={getRailBarrierDown}
              signSvgBaseUrl={null}
            />
            {/* LC gantry — render-only, inert unless the district authors
                meta.scenario.laneGantry (the WRONG_WAY lane-control drill). */}
            <LaneSignalGantry district={district} />
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
                // #37: the loaded map's speed domain scales the governor.
                lessonMaxLegalKmh={built.lessonMaxLegalKmh}
                onCollision={handleCollision}
                // S1: scenario drills grade ANY contact (compile writes 0);
                // absent = the street nudge tolerance (default 10).
                collisionMinKmh={lesson.collisionMinKmh}
                night={isNight}
                // #41: rain lessons mount the (dimmed) beam throw + tail glow
                // so switching the lights on is VISIBLE. Render-only — the
                // graded headlight state still flows cabin → sample → tick.
                rain={rain}
                // #24: the rig writes the live wiper sweep/clearing here; the
                // cockpit droplet layer below reads it to clear the wiped arc.
                wiperVisualRef={wiperVisualRef}
                // 4a + snow: the OPT-IN reduced-grip physics. Read from the
                // AUTHORED physics field only — never derived from
                // environment.rain/snow (shipped weather lessons were tuned
                // against dry physics). Both authored = the MOST RESTRICTIVE
                // factor wins (min — the condition-factor discipline).
                gripFactor={Math.min(
                  lesson.physics?.wetGrip ? WET_GRIP_FACTOR : 1,
                  lesson.physics?.snowGrip ? SNOW_GRIP_FACTOR : 1,
                )}
                // SURFACE-PATCH slice: waterPatch/icePatch rects from the
                // DISTRICT's authored zone spans (the map is the opt-in) —
                // VehicleRig modulates the live grip as the chassis crosses
                // them, MIN-composed with the base gripFactor above. [] on
                // every pre-slice map.
                gripPatches={built.gripPatches}
                // AC-12: the OPT-IN crosswind, same authored-field-only law.
                // NEGATIVE = the wind blows WEST (world −X = district west,
                // vehicleSample.ts axis map): on the northbound drill street
                // it shoves the car toward the center line — the taught
                // danger. Constants stay in tuning.ts (the single truth the
                // authored ghost story is written against).
                windLateralN={lesson.physics?.crosswind ? -CROSSWIND_BRIDGE_N : 0}
                windGustAmplitudeN={lesson.physics?.crosswind ? -CROSSWIND_GUST_AMPLITUDE_N : 0}
                windGustPeriodSec={lesson.physics?.crosswind ? CROSSWIND_GUST_PERIOD_SEC : 0}
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
              dashboardStatusRef={dashboardStatusRef}
              reverseAssist={reverseAssist}
              reverseAssistEnabled={reverseAssistEnabled}
              assistShiftingRef={assistShiftingRef}
              driveLocked={driveLocked}
              drivelineEventsRef={drivelineEventsRef}
              glanceQueueRef={glanceQueueRef}
              onPreDriveStep={onPreDriveStep}
              onBlockedDriveAttempt={onBlockedDriveAttempt}
              onTick={onTickWithGlancePings} // [glance-pings] read-only tap → shell
              onMinimap={onMinimap}
              onDriveline={onDriveline}
              onDrivelineRejection={onDrivelineRejection}
              onStagedOutcome={onStagedOutcome}
              minimapPolylines={minimapPolylines}
              isNight={isNight}
              rain={rain}
              fog={fogWeather}
              snow={snowWeather}
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
              // Doc 66 R5 (founder v1 №9): recipe-authored junction-corner
              // clear zones for the curb decoration — same list capture mounts.
              parkedClearZones={built.parkedClearZones}
              hazard={lesson.hazard ?? null}
              hazardActiveRef={hazardActiveRef}
              // Perf tier (doc 71): SUV clearcoat on the high tier only.
              clearcoat={level === "high"}
              // Perf tier (doc 82 §2.3): at `low` the 22,672-tri / 16-material
              // hero SUV leaves the pool entirely — ~54k triangles and 16 draw
              // calls against a ≤250k / ≤70 phone budget. The picks fall back
              // to the kolos, so the traffic population is unchanged.
              dropHeavyFleetModels={level === "low"}
              // JU-18: the officer FIGURE reads the controller schedule
              // through the runtime — the same channel + clock the stop-line
              // adjudication uses — so the posture turns exactly when the
              // grading flips (render-only; inert without a posted controller).
              controllerFigure={runtime}
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
          driveLocked={driveLocked}
        />
        {cockpit && rain ? <WindshieldDroplets wiperRef={wiperVisualRef} /> : null}
      </Canvas>

      {/* Controls legend — collapsible, top-left of the canvas (clear of the
          bottom cards + minimap). Collapsed by default on touch-only devices
          (the keys are real but secondary there). */}
      <ControlsHelp defaultOpen={!touchOnly} topdownAllowed={topdownInCycle} />

      {/* PROX rear-proximity cue (isolated additive block): „Кола отзад · X м"
          above the dashboard while a REAL vehicle is within ~15 m behind —
          the every-POV/every-preset rear-awareness fallback. Self-contained:
          polls traffic.rearGapMeters off sampleRef at ~5 Hz internally (no
          frame-loop wiring, no grading read/write). hidden while any pause/
          quiz/teach/end overlay is up (physicsPaused ∪ shell paused). */}
      <RearProximityCue traffic={traffic} sampleRef={sampleRef} hidden={physicsPaused} />

      {/* „Звукът е част от урока" (doc 82 §4.4, isolated additive block).
          A muted session teaches a systematically FASTER car than the student
          will really drive (~3.2 km/h over-production without audio, ~10% in
          visual-only sims) — so audio is stated as pedagogy, once, at the
          same gesture that unlocks the AudioContext above. Self-polling off
          audioRef; dismissible and then permanently silent. */}
      <AudioLessonPrompt audioRef={audioRef} hidden={physicsPaused} />

      {/* S0-View ?ghost=demo: playback deck for the Shadow Car — scrub bar,
          speeds, annotation ticks, step-by-step, loop-section. */}
      {ghostDemo ? <DemoDeck trace={ghostDemo.trace} clockRef={ghostClockRef} /> : null}

      {/* S1 L1 aid: the same playback deck for the scenario's shadow demo. */}
      {shadowTrace && aids?.shadowCar ? (
        <DemoDeck trace={shadowTrace} clockRef={aidClockRef} />
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

      {/* [glance-pings] edge pings („◄ огледай") + the desktop glance-button
          cluster. Gating lives in the component (glancePingsEligible: JU-23
          drills, L1–L2, „Съветник" ON, never exams); on touch devices the
          buttons stay with TouchControls' mirror row, so only the pings show. */}
      <GlanceEdgePings
        lesson={lesson}
        cabinRef={cabinRef}
        tapRef={glancePingTapRef}
        hidden={physicsPaused}
        showButtons={!touchCapable}
      />

      {/* [telltale-pings] founder 2026-07-28: „from the POV behind the car …
          Belt is not on and for example if needed Lights are not on, a ping
          where the user can see what is missing, currently he only sees in the
          dashboard." Outside the cockpit the 3D cluster is not in frame at
          all, so the armed cabin faults get quiet chips on the left/right
          rails. Cockpit view is exempt — the real cluster lights them there.
          Purely a consumer of the status channel the bar already polls. */}
      {dashboardStatusRef ? (
        <TelltaleEdgePings
          statusRef={dashboardStatusRef}
          active={!cockpit && !physicsPaused}
          showKeyHints={!touchCapable}
        />
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

      {/* Difficulty selector — top right. `data-hud` so the play shell's
          compact layout can move it clear of a landscape notch without this
          file knowing anything about phones (PlayAreaStyles). */}
      <div
        data-hud="difficulty"
        className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-border bg-background/70 p-1 backdrop-blur"
      >
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
            {/* The ONE thing this card has to teach, because it is the founder's
                own complaint („very hard to switch to reverse") and because the
                gesture is invisible by design: down is the brake, and holding it
                at a standstill puts the car in R — after which down keeps
                meaning backwards. Everything else on this screen can be found by
                touching it; that cannot. */}
            <p className="text-sm text-muted">
              Завърти телефона хоризонтално. Палецът вляво завърта волана,
              палецът вдясно кара: нагоре — газ, в средата — нищо, надолу —
              спирачка. Задръж надолу, докато колата стои — тя минава на заден
              ход и надолу вече е назад. „⚙“ отваря двигател, скорости и
              светлини; в кабината можеш да докосваш контролите направо.
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

/**
 * Demonstration playback deck wrapper — founder ruling 2026-07-17: the demo
 * deck must not dominate the frame; the car STATUS dashboard (the shell's
 * bottom-center bar) is the visual anchor. So the deck is ~40 % smaller
 * (26 rem vs 36 rem width + TraceTimeline `compact` controls), sits ABOVE
 * the status bar (bottom-[6.75rem] clears the bar's ~100 px strip), and
 * collapses to a small pill via the toggle.
 *
 * ON A PHONE IT STARTS COLLAPSED (2026-07-29, measured). The same ruling read
 * on the founder's own device: open, this deck laid out 21.5 % of an 852 × 393
 * landscape iPhone — a caption card, a scrub bar and a transport row parked
 * dead centre, on the screen where he said „approximately half … is occupied by
 * controls, information panels, popups". After the touch controls and the
 * instrument band were cut to 1.7 % and 0.9 %, this ONE panel was over half of
 * all remaining chrome, and twelve of the nineteen sub-44 px touch targets on
 * the screen were its 20 × 28 annotation ticks and 32 × 32 transport buttons.
 *
 * Nothing is removed: the pill is still there, one tap opens it, the shadow
 * car's blue ribbon still draws in the world, and on any roomy screen the deck
 * opens exactly as it always did. What changes is which one the phone starts
 * on — and on a phone the demonstration is the thing happening on the ROAD, not
 * the scrub bar in front of it.
 *
 * The threshold is immersive.ts's compact test, inlined rather than imported:
 * this file is the scene, that one belongs to the play shell, and the number is
 * a device fact (every phone in landscape is under 560 px tall; every tablet is
 * over) rather than a shared decision.
 */
function DemoDeck({
  trace,
  clockRef,
}: {
  trace: ScenarioTrace;
  clockRef: React.RefObject<TraceClock>;
}) {
  const [open, setOpen] = useState(
    () =>
      typeof window === "undefined" ||
      !(window.innerHeight <= 560 || window.innerWidth <= 640),
  );
  return (
    // `bottom-[6.75rem]` is ROOMY_HUD_FLOOR_PX and it is the ROOMY number. On a
    // phone this deck has to clear the touch pads instead, which reach 68px
    // higher — PlayAreaStyles moves it, keyed on the shell's own compact
    // attribute, for the same reason it moves the difficulty picker: one
    // definition of "compact" in the codebase, and the scene keeps its desktop
    // layout in its own file. `data-hud` is the stable handle that rule needs.
    <div
      data-hud="demo-deck"
      className="absolute bottom-[6.75rem] left-1/2 z-10 flex w-[min(88%,26rem)] -translate-x-1/2 flex-col items-center gap-1"
    >
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted backdrop-blur transition hover:text-foreground"
      >
        <span aria-hidden>🎬</span>
        Демонстрация {open ? "▾" : "▸"}
      </button>
      {open ? <TraceTimeline trace={trace} clockRef={clockRef} compact /> : null}
    </div>
  );
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
  dashboardStatusRef,
  reverseAssist,
  reverseAssistEnabled,
  assistShiftingRef,
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
  snow,
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
  /** Status-dashboard channel — mutated in place per frame (no allocation);
   *  the shell's bar polls it low-Hz. Absent = no writes. */
  dashboardStatusRef?: React.RefObject<DashboardStatus>;
  /** Auto-reverse assist machine (engine/reverseAssist.ts) — stepped once
   *  per live frame; emitted commands are executed through the SAME
   *  DrivelineState gear gate as the [ / ] keys. */
  reverseAssist: ReverseAssist;
  /** Lesson-static gate: false on examMode lessons (the exam grades the
   *  real selector procedure — the assist stays completely silent). */
  reverseAssistEnabled: boolean;
  /** True only for the microtask of executing an assist shift, so the
   *  driveline subscription can tell assist steps from MANUAL ones. */
  assistShiftingRef: React.RefObject<boolean>;
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
  /** SNOW weather flag — the same seam (tick.snow, doc 72 AC-08). */
  snow: boolean;
  paused: boolean;
}) {
  const tRef = useRef(0);
  const lastMinimapRef = useRef(0);
  // Scene-owned status-dashboard scratch (created on the first frame; the
  // shell's dashboardStatusRef is pointed at it — see the useFrame block).
  const dashScratchRef = useRef<DashboardStatus | null>(null);

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

    // Status-dashboard channel: fill a scene-owned scratch object (local-ref
    // contents — the pollRef mutation grammar) from the REAL cabin state each
    // frame — including the live blink-lamp levels off CabinControls' 600 ms
    // clock, so the DOM bar flashes in phase with the 3D cluster — then
    // publish it by pointing the shell's ref at it (the hazardActiveRef write
    // grammar). Zero allocation after the first frame. Runs BEFORE the paused
    // early-out: cabin keys still work during a pause and the dashboard must
    // mirror them.
    const dashCabin = cabinRef.current;
    if (dashboardStatusRef && dashCabin) {
      const dash = (dashScratchRef.current ??= createDashboardStatus());
      const dl = dashCabin.driveline;
      dash.leftLampLit =
        (dashCabin.blinkOn && dashCabin.indicator === "left") || dashCabin.hazardBlinkOn;
      dash.rightLampLit =
        (dashCabin.blinkOn && dashCabin.indicator === "right") || dashCabin.hazardBlinkOn;
      dash.indicator = dashCabin.indicator;
      dash.hazardsOn = dl.hazardsOn;
      dash.engineOn = dl.engineOn;
      dash.stalled = dl.stalled;
      dash.gearLabel = dl.gearLabel;
      dash.parkingBrakeOn = dl.parkingBrakeOn;
      dash.seatbeltOn = dashCabin.seatbeltOn;
      dash.headlights = dashCabin.headlights;
      dash.fogLightsOn = dl.fogLightsOn;
      dash.wipersOn = dl.wipersOn;
      dash.speedKmh = sampleRef.current.speedKmh;
      // Founder 2026-07-28 (chase-view telltales): whether the CONDITIONS
      // demand the lamps, mirrored from the same weather/time flags the rule
      // engine grades on (HEADLIGHTS_OFF_AT_NIGHT / _IN_RAIN, чл. 74 fog) —
      // so an edge ping can only ever name a real, gradeable fault.
      dash.headlightsRequired = isNight || rain;
      dash.fogLightsRequired = fog;
      dashboardStatusRef.current = dash;
    }

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

    // Auto-reverse assist (founder 2026-07-17): hold the brake at a
    // standstill in D → the assist works the SAME selector gate as the
    // [ / ] keys (two gearDown steps, D→N→R); in R the pedals are already
    // remapped by GatedSimInput (S/↓ = reverse throttle, W/↑ = brake), so
    // holding the remapped brake at a standstill walks the gate back up
    // (R→N→D). Interlocks, DrivelineEvents, HUD telltales and the recorder
    // all see canonical transitions. Hard gates: never on examMode lessons
    // (prop), never during the pre-drive procedure (a held brake there IS a
    // step), automatic box only (the manual tier keeps the real gearbox),
    // engine running only.
    if (reverseAssistEnabled && !driveLocked && cabin) {
      const dl = cabin.driveline;
      if (dl.transmission === "automatic" && dl.engineOn) {
        const cmd = reverseAssist.update({
          speedKmh: sample.speedKmh,
          selector: dl.selector,
          brakePedal: input?.rawBrake ?? 0,
          throttlePedal: input?.rawThrottle ?? 0,
          dtSec: dt,
        });
        if (cmd) {
          // Mark the steps assist-driven so the driveline subscription does
          // not count them as manual (which would self-suppress for 2 s).
          assistShiftingRef.current = true;
          try {
            const step = cmd === "shiftToR" ? () => dl.gearDown() : () => dl.gearUp();
            if (step()) step(); // second gate step only if the first engaged
          } finally {
            assistShiftingRef.current = false;
          }
        }
      }
    }

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
    // Siren channel (VU-09): nearest ACTIVE (moving) emergency actor off the
    // published traffic state — render-only scan, Infinity = no siren. A
    // guard-stalled actor (speed 0) fades out; honest limit for now.
    let sirenM = Infinity;
    const tvs = traffic.vehicles;
    for (let i = 0; i < tvs.length; i++) {
      const tv = tvs[i];
      if (tv.profile !== "emergency" || tv.speedMps < 0.5) continue;
      const d = Math.hypot(tv.x - sample.position.x, tv.y - sample.position.y);
      if (d < sirenM) sirenM = d;
    }
    audioRef.current?.setEnvironment({ rain, nearestNpcM: leadGap, sirenM });
    const tick = runtime.sample(sample, tRef.current, isNight, rain, leadGap, fog, snow);

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

/**
 * One row of the key legend. `essential` marks the short default set — the
 * keys a student needs to get the car moving and look around; everything else
 * is reference material behind „Всички клавиши".
 */
interface ControlsHelpRow {
  keys: string;
  what: string;
  essential?: boolean;
}

/**
 * Bottom inset the legend must never cross: the glance-button cluster
 * (GlanceEdgePings) is pinned at `bottom-3` and stands 50 px tall, so the
 * legend's scroll box stops 4.5 rem above the scene floor. Anything shorter
 * and the two overlap — which is exactly what happened before: in the shell
 * the scene box is `aspect-video`, so at a 1100 px column it is only ~619 px
 * tall and the 20-row sheet ran straight through the Л / З / Д chips and off
 * the bottom edge.
 */
const CONTROLS_HELP_BOTTOM_INSET = "4.5rem";

/**
 * Collapsible key legend, top-left of the canvas.
 *
 * Layout law (do not regress): the root is a bounded flex column pinned
 * top-3 → bottom-[4.5rem], and the row list is a `min-h-0 overflow-y-auto`
 * flex child. The default flex-shrink then clamps the list to whatever height
 * the scene box actually has, at EVERY viewport — a short scene scrolls the
 * list instead of spilling it over the HUD below. The root is
 * pointer-events-none so the reserved column never swallows canvas drags.
 *
 * Default state (considered, founder-facing): open, but showing the ~10
 * ESSENTIAL rows only. Collapsing it outright would hide the keyboard from a
 * first-time student who has no other way to discover the controls; showing
 * all 20 rows ate ~22 % of the windscreen. The full sheet is one click away
 * and stays open for the rest of the session. Touch-only devices still start
 * fully collapsed — the touch overlay is the primary input there.
 */
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
  const [showAll, setShowAll] = useState(false);
  // The reversing-POV setting is persisted and toggled by K inside the canvas
  // (CameraRig owns the key, with G/N) — the row shows its live state so the
  // legend never lies about which way the view will turn.
  const reverseViewOn = useReverseViewEnabled();
  const rows: ControlsHelpRow[] = [
    { keys: "W A S D", what: "кормуване (или стрелки)", essential: true },
    { keys: "I", what: "двигател: старт / стоп", essential: true },
    { keys: "[ ]", what: "скорости: към P / към D", essential: true },
    { keys: "S / ↓", what: "задръж на място → задна / напред" },
    { keys: "Space", what: "ръчна спирачка", essential: true },
    { keys: "Z", what: "съединител — задръж („Напреднал“)" },
    { keys: "B", what: "предпазен колан", essential: true },
    { keys: ", .", what: "мигач ляво / дясно", essential: true },
    { keys: "L", what: "светлини" },
    { keys: "V", what: "фарове за мъгла" },
    { keys: "J", what: "аварийни светлини" },
    { keys: "T", what: "чистачки" },
    { keys: "H", what: "клаксон — задръж" },
    {
      keys: "Q E F",
      what: "огледала — задръж (ляво / дясно / назад)",
      essential: true,
    },
    { keys: "Клик", what: "контролите в кабината (изглед кокпит)", essential: true },
    {
      keys: "C",
      what: topdownAllowed ? "изглед: кокпит / отвън / отгоре" : "изглед: кокпит / отвън",
      essential: true,
    },
    {
      keys: "K",
      what: `автоматичен поглед назад при заден ход: ${reverseViewOn ? "вкл." : "изкл."}`,
    },
    // Founder 2026-07-28: the minimap is off by default and comes back on
    // demand — the key has to be discoverable or the map is simply gone.
    { keys: "P", what: "мини карта (вкл./изкл.)", essential: true },
    ...(topdownAllowed
      ? [
          { keys: "G", what: "мащаб отгоре: 20 / 40 / 80 м (влиза в изглед отгоре)" },
          { keys: "N", what: "отгоре: север горе / посока горе" },
        ]
      : []),
    { keys: "X", what: "цял екран" },
    { keys: "R  ·  Esc", what: "рестарт · пауза", essential: true },
  ];
  const essentials = rows.filter((r) => r.essential);
  const visible = showAll ? rows : essentials;
  const hiddenCount = rows.length - essentials.length;
  return (
    <div
      data-hud="controls-help"
      className="pointer-events-none absolute left-3 top-3 z-10 flex w-[min(15rem,45%)] flex-col items-start"
      style={{ bottom: CONTROLS_HELP_BOTTOM_INSET }}
    >
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-muted backdrop-blur transition hover:text-foreground"
      >
        <span aria-hidden>⌨</span>
        Клавиши {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="pointer-events-auto mt-1 flex min-h-0 w-full flex-col rounded-xl border border-border bg-background/80 backdrop-blur">
          {/* Only the ROW LIST scrolls; the expander below stays pinned, so
              the way back to the short list is never scrolled out of reach.
              `scrollbar-width: thin` matters: on a short scene box a classic
              17 px Windows scrollbar would eat 7 % of the 15 rem panel and
              reflow every row. */}
          <div className="flex min-h-0 flex-col gap-1 overflow-y-auto p-2.5 pb-1 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]">
            {visible.map((row) => (
              <div key={row.keys} className="flex shrink-0 items-center gap-2 text-[11px]">
                <kbd className="min-w-[3.75rem] shrink-0 rounded bg-surface px-1.5 py-0.5 text-center font-mono text-[10px] font-bold text-accent">
                  {row.keys}
                </kbd>
                <span className="text-muted">{row.what}</span>
              </div>
            ))}
          </div>
          {/* Reversible on purpose: the full sheet has to scroll on a short
              scene box, and a student who opened it must be able to get the
              short list back without collapsing the whole legend. */}
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="shrink-0 self-start rounded px-2.5 pb-2 pt-1 text-[11px] font-semibold text-accent transition hover:text-foreground"
          >
            {showAll ? "Само основните ▴" : `Всички клавиши (+${hiddenCount}) ▾`}
          </button>
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
