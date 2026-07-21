"use client";

/**
 * CaptureScene v2 — the clip-capture rig's 3D mount (DEV ONLY), rebuilt to
 * docs/development/66 after the pilot-v1 19/20 failure. Fixes, by rule:
 *
 * R1 (actors re-enacted): the compiled lesson's stagedEvents mount through
 * the SAME production path LessonScene uses — createScenarioDirector +
 * TrafficLayer — and the traffic/director machinery is fed the GHOST's
 * interpolated trace pose as "the player" (GhostWorldDriver: runtime.update →
 * traffic.update → runtime.sample → director.step, the recorder's exact frame
 * order). Seed 7 + ambient 0/0 = recordScriptedDrive's staging parity, so the
 * lead cars / conflict cars / pedestrians / ambulances re-enact their
 * recorded-era behavior around the replayed mistake. The feed is the SHARED
 * captureGhostFeed stepper (node-tested per pilot clip for arming parity in
 * captureFeedParity.test.ts), the recording's signal pins re-apply through
 * the signalOffsets prop (captureSignalDials — the pilot-v2 CAUSE-4 seam),
 * and the presence log (capturePlan.ActorPresenceLog) records staging truth
 * AND the honest R1 channel: what was actually IN the planned frame during
 * the fault beat. HONEST LIMIT: no rule engine runs here (nothing is graded) and
 * script-authored collision beats are not re-pushed — runner ADJUDICATION
 * outcomes may differ from the recorded run, actor MOTION does not.
 *
 * R5 (world parity): the world core is buildLessonWorldCore — the byte-exact
 * recipe LessonScene itself runs (lessonWorldRecipe.ts) — and the render
 * quality is the FOUNDER'S OWN stored drill preset (loadQualityPreset), so
 * exposure/tone-mapping/AO/bloom match what the founder sees in the drill.
 * Canvas gl flags mirror LessonScene's; dpr stays pinned at 1 — the one
 * deliberate divergence (fixed 1280×720 output across machines).
 *
 * R5 EXPOSURE AUDIT (pilot-v2 „too bright", CAUSE-6): the tone path here is
 * pixel-identical to the drill at EQUAL preset — SimEnvironment applies the
 * per-preset exposure on frame 1 (damp snaps), the HDRI files/intensities/
 * rotations are LessonScene's own lines, and the chase grazing profile
 * matches the drill's (≈8.4° vs ≈7.6° depression). Two real findings:
 * (1) loadQualityPreset() reads the RECORDING browser's localStorage — an
 *     automated batch in a fresh profile silently records "medium" whatever
 *     the founder drills on; the level now travels with every POST and lands
 *     in the manifest (`quality`) so R0 can machine-check the preset used.
 * (2) The measured blowouts were bright-sky speculars on low-roughness
 *     surfaces, worst on the WET road (R0 pixel probe, rain-lights k2 far
 *     road ≈ [213,206,194] vs dry follow-distance [117,117,120]) — retuned
 *     at the material truth (world StaticWorld wet-gloss note), never by a
 *     capture-only exposure fork, so drill and clip stay one look.
 *
 * R5 (no hop): the camera is a PURE function of playback time
 * (plannedChasePose / plannedCockpitPose — zero damping state, nothing to
 * settle), the clock is pre-seeked BEFORE mount, and the client's window end
 * is hop-guarded off the trace end (WINDOW_END_GUARD_S).
 *
 * R2 (control in frame): the exterior camera runs the two-keyframe plan —
 * wider + oriented toward the governing control until the ghost passes it
 * (controlPassTimeSec), then a smooth deterministic blend to the chase
 * framing. Continuous by construction — no cuts.
 *
 * R4 (view per card): "exterior" = chase; "exterior+dashboard" = chase + the
 * canvas dashboard strip (a CanvasTexture quad INSIDE the WebGL frame — DOM
 * never reaches captureStream, so the strip is drawn into the recording
 * honestly); "cockpit" = the drill's interior GLB (VitokCockpit — wheel,
 * cluster, RTT mirrors) mounted on the ghost pose, driven by trace channels
 * (steer/speed/gear/indicator) + the mistake's graded cabin channels
 * (capturePlan.cabinChannelsFor — the honest belt/lights derivation), plus
 * the dashboard strip.
 */

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import {
  CanvasTexture,
  Euler,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import {
  CHASE_FOV,
  cockpitVFovForAspect,
  FIXED_DT,
  GRAVITY,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import type { LessonSpec } from "@/modules/sim/lessons";
import { lessonDistrictId } from "@/modules/sim/contracts";
import {
  QUALITY_PRESETS,
  resetWeather,
  setWeatherTarget,
  SimEnvironment,
  stepWeather,
  type QualityLevel,
} from "@/modules/sim/environment";
import { DistrictWorld } from "@/modules/sim/world";
import {
  createTracePoint,
  sampleAt,
  type ScenarioTrace,
  type TraceClock,
} from "@/modules/sim/traces";
import {
  createTrafficSystem,
  TrafficLayer,
  type TrafficDistrict,
  type TrafficSystem,
} from "@/modules/sim/traffic";
import { createScenarioDirector, type ScenarioDirector } from "@/modules/sim/orchestrator";
import {
  applySignalModes,
  buildLessonWorldCore,
  wireTrafficQueries,
  type LessonWorldCore,
} from "@/components/sim/lessonWorldRecipe";
import { ScenarioObstacles } from "@/components/sim/ScenarioObstacles";
import { emojiTexture, ShadowCar } from "@/components/sim/ShadowCar";
import { VitokCockpit } from "@/components/sim/vitok/VitokCockpit";
import { CockpitInteractionContext } from "@/components/sim/vitok/hotspots";
import type { CabinControls } from "@/components/sim/cabin";
import { loadQualityPreset } from "@/components/sim/lesson-ui/QualityPresetSelector";
import {
  blinkOnAt,
  createCaptureDashModel,
  createChaseCamPose,
  createCockpitCamPose,
  dashModelFor,
  dashModelHash,
  faultMarkerAlphaAt,
  faultMarkerPose,
  gearLabelFor,
  GHOST_CHASSIS_REST_Y,
  laneHighlightAlphaAt,
  plannedChasePose,
  plannedCockpitPose,
  plannedRearAwarePose,
  type ActorPresenceLog,
  type CameraProfile,
  type CaptureCabinChannels,
} from "@/lib/clips/capturePlan";
import {
  createCaptureFeedStepper,
  type CaptureFeedStepper,
} from "@/lib/clips/captureGhostFeed";

/** Fixed capture size — consistent clips across machines/windows. */
export const CAPTURE_W = 1280;
export const CAPTURE_H = 720;

/** Doc 66 R4 camera requirement (mirrors learning ClipView — string union,
 *  kept structural so this dev scene never imports the learning barrel). */
export type CaptureView = "exterior" | "cockpit" | "exterior+dashboard";

/** R2 control-framing input (client-precomputed, pure over the trace). */
export interface CaptureControlFraming {
  x: number;
  y: number;
  passTSec: number;
}

/** The PLAN card's positional lane band (mirrors learning ClipLaneHighlight —
 *  structural, no learning import): tinted green ~2 s at the fault. */
export interface CaptureLaneHighlight {
  xM: number;
  yM: number;
  widthM: number;
}

/** Ground ❌ anchor (district m) — the ENGINE fault position on lot maps. */
export interface CaptureGroundMarker {
  x: number;
  y: number;
}

/** LessonScene's HDRI constants (doc 71 §4.2 — keep in sync). */
const DAY_ENV_ROTATION = new Euler(0, (119 * Math.PI) / 180, 0);
const NIGHT_ENV_ROTATION = new Euler(0, 0, 0);

/** The house recording seed — recordScriptedDrive's default; the staged
 *  actors were recorded with it, so the capture re-stages with it. */
const RECORDER_SEED = 7;
/** Frames rendered after Suspense resolves before onReady (texture warmup). */
const READY_WARMUP_FRAMES = 30;
/** A "dt→∞" weather step (s) — snaps the shared weather channels to their
 *  targets on the capture's first frame (the drill's settled steady state),
 *  the same first-frame-snap contract SimEnvironment's lighting damp uses. */
const WEATHER_PRIME_DT_S = 1000;

const DEG2RAD = Math.PI / 180;
/** 180° about +Y — cameras look down −Z, the car drives along +Z
 *  (CameraRig's FLIP_Y, duplicated here to keep the rig self-contained). */
const FLIP_Y = new Quaternion(0, 1, 0, 0);

/** The drill's preset → environment level map (LessonScene's toLevel). */
function capturedQualityLevel(): QualityLevel {
  const preset = loadQualityPreset();
  return preset === "medium" ? "med" : preset;
}

interface Built {
  core: LessonWorldCore;
  traffic: TrafficSystem;
  director: ScenarioDirector | null;
  stepper: CaptureFeedStepper;
  level: QualityLevel;
}

export interface CaptureSceneProps {
  /** Compiled entry rung of the clip's template (environment + district). */
  lesson: LessonSpec;
  /** The committed mistake trace the red ghost replays. */
  trace: ScenarioTrace;
  /** Shared playback clock — the client seeks/starts/stops through it. */
  clockRef: RefObject<TraceClock>;
  /** Trim-window start — the world stack pre-rolls here (ghost-as-player). */
  startSec: number;
  /** The PLAN's engine fault time — centers the R1 presence beat. */
  faultTimeSec: number;
  /** The RECORDING's signal-cluster pins (captureSignalDials), or null when
   *  the recording ran on the map's natural offsets (CAUSE-4 seam). */
  signalOffsets: Readonly<Record<string, number>> | null;
  /** Doc 66 R4 camera for THIS clip (the PLAN card's view). */
  view: CaptureView;
  /** The PLAN card's exterior camera profile — "rearAware" holds a side
   *  three-quarter frame so an actor closing from BEHIND is visible (R1). */
  cameraProfile: CameraProfile;
  /** R2 governing-control framing, or null (no positioned control). */
  controlFraming: CaptureControlFraming | null;
  /** The PLAN card's lane highlight, or null (non-positional faults). */
  laneHighlight: CaptureLaneHighlight | null;
  /** Ground ❌ at the ENGINE fault position (lot maps), or null — when set,
   *  ShadowCar's roof badge is hidden (its 2.9 m float parallax-reads as a
   *  detached marker against near backgrounds; pilot v2 "X on the grass"). */
  groundMarker: CaptureGroundMarker | null;
  /** Honest R4 cabin channels (capturePlan.cabinChannelsFor). */
  cabin: CaptureCabinChannels;
  /** R1 presence log — the scene fills it; the client builds the checklist. */
  presenceRef: RefObject<ActorPresenceLog>;
  /** Rendered-frame counter — the client's settle gate (2-3 fresh frames
   *  after the seek before MediaRecorder starts). */
  frameCountRef: RefObject<number>;
  /** The live WebGL canvas (captureStream target). */
  onCanvas: (canvas: HTMLCanvasElement) => void;
  /** World + ghost mounted and warm — safe to settle + record. */
  onReady: () => void;
  onError: (message: string) => void;
}

export function CaptureScene({
  lesson,
  trace,
  clockRef,
  startSec,
  faultTimeSec,
  signalOffsets,
  view,
  cameraProfile,
  controlFraming,
  laneHighlight,
  groundMarker,
  cabin,
  presenceRef,
  frameCountRef,
  onCanvas,
  onReady,
  onError,
}: CaptureSceneProps) {
  const [built, setBuilt] = useState<Built | null>(null);
  /** L5 hazard channel (TrafficLayer's ball dart-out) — director-owned. */
  const hazardActiveRef = useRef(false);

  // Build the drill's EXACT world (lessonWorldRecipe — R5) + the recorded-era
  // staging (traffic seed 7, ambient 0/0, director seed 7 — R1), then
  // pre-roll the whole stack to the trim-window start with the ghost pose
  // walking the trace as "the player".
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const districtId = lessonDistrictId(lesson);
        const res = await fetch(`/world/${districtId}.json`);
        if (!res.ok) throw new Error(`district ${districtId} ${res.status}`);
        const raw: unknown = await res.json();
        // THE drill's world recipe — the same call LessonScene runs, so the
        // two scenes cannot drift apart (doc 66 R5, the v1 root cause).
        const core = buildLessonWorldCore(lesson, raw);
        applySignalModes(core.runtime, lesson);
        // The RECORDING's signal pins (CAUSE-4 seam, pilot v2): recorder-side
        // signalOffsets do NOT flow through the compiled lesson — the client
        // resolves them per recording via captureSignalDials and the capture
        // re-applies them EXACTLY as recordScriptedDrive does: sorted-key
        // order, through the runtime's PUBLIC setSignalClusterOffset, BEFORE
        // the first frame. null = the map's natural FNV-1a offsets (most
        // templates, incl. the whole pilot) — apply nothing.
        // (lesson.signalPlan stays un-armed — a LIVE-session dial the
        // recorder never runs; lesson.signalModes applied above are the
        // template-authored dial both sides already share.)
        for (const [nodeId, offsetSec] of Object.entries(signalOffsets ?? {}).sort((a, b) =>
          a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
        )) {
          core.runtime.setSignalClusterOffset(nodeId, offsetSec);
        }
        // Recorder parity (traces/recorder.ts): seed 7, ZERO ambient traffic
        // — the committed encounter is staged actors only; ambient agents
        // would be actors the recorded era never had.
        const traffic = createTrafficSystem(raw as Parameters<typeof createTrafficSystem>[0], {
          seed: RECORDER_SEED,
          vehicleCount: 0,
          pedestrianCount: 0,
        });
        wireTrafficQueries(core.runtime, traffic);
        // The compiled lesson's staged encounters through the PRODUCTION
        // director — created BEFORE TrafficLayer mounts (instanced buffers
        // size at mount), seeded like the recorder, signals wired.
        const stagedEvents = lesson.stagedEvents ?? [];
        const director =
          stagedEvents.length > 0
            ? createScenarioDirector(stagedEvents, traffic, {
                seed: RECORDER_SEED,
                signals: core.runtime,
              })
            : null;
        // The ghost-as-player feed — the SHARED stepper (captureGhostFeed),
        // node-tested for arming parity per clip (captureFeedParity.test.ts).
        const stepper = createCaptureFeedStepper({
          runtime: core.runtime,
          traffic,
          director,
          trace,
          cabin,
          env: {
            night: (lesson.environment?.timeOfDay ?? "day") === "night",
            rain: lesson.environment?.rain ?? false,
            fog: lesson.environment?.fog ?? false,
            snow: lesson.environment?.snow ?? false,
          },
          obstacleVehicles: core.scenarioObstacles
            .filter((o) => o.kind === "vehicle")
            .map((o) => ({ x: o.x, y: o.y })),
          windowStartSec: startSec,
          faultTimeSec,
          // The presence law measures the frame the card's camera shows.
          cameraProfile,
          getLog: () => presenceRef.current,
        });
        // WEATHER PARITY (doc 66 R5 — founder round-3 „rain road too bright,
        // can't tell rain from dry"): the wet-road look is driven by the SHARED
        // weather WETNESS channel, which RAMPS 0→1 over ~4 s of rain
        // (WETNESS_IN_PER_SEC) and PERSISTS across the batch (no per-clip
        // reset). The drill runs for minutes, so its rain road is FULLY SOAKED
        // (the value StaticWorld's wet-gloss retune targets); the capture only
        // settles ~0.6 s, so without this it records a TRANSIENT, batch-order-
        // dependent wetness — a "parallel value", not the drill's settled look.
        // Snap the store to THIS clip's steady state so frame 1 already renders
        // the drill's soaked road (and a dry clip after a rain clip is bone-dry,
        // not left damp) — the same "settle on frame 1" contract the lighting
        // damp uses (dt→∞). SimEnvironment's own per-frame stepWeather then
        // holds it, already at target.
        resetWeather();
        setWeatherTarget(
          lesson.environment?.rain ?? false,
          lesson.environment?.fog ?? false,
          lesson.environment?.snow ?? false,
        );
        stepWeather(WEATHER_PRIME_DT_S);
        // Pre-roll: lamps, barrier arms AND staged actors reach their
        // recorded-era state at the window start (v1 pre-rolled lamps only —
        // actors then never moved: the R1 failure class).
        stepper.advanceTo(startSec);
        if (alive) setBuilt({ core, traffic, director, stepper, level: capturedQualityLevel() });
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

  const isCockpit = view === "cockpit";
  const viewFov = isCockpit ? cockpitVFovForAspect(CAPTURE_W / CAPTURE_H) : CHASE_FOV;
  const withDashStrip = view !== "exterior";

  // Initial camera pose from the trace at the window start (no first-frame
  // jump from three's default camera) — the PLANNED pose, per view.
  const initialCam = useMemo(() => {
    const pt = createTracePoint();
    sampleAt(trace, startSec, pt);
    if (isCockpit) {
      const pose = plannedCockpitPose(pt, createCockpitCamPose());
      return new Vector3(pose.camX, pose.camY, pose.camZ);
    }
    if (cameraProfile === "rearAware") {
      const pose = plannedRearAwarePose(pt, createChaseCamPose());
      return new Vector3(pose.camX, pose.camY, pose.camZ);
    }
    const pose = plannedChasePose(
      startSec,
      pt,
      controlFraming ? { passTSec: controlFraming.passTSec, x: controlFraming.x, y: controlFraming.y } : null,
      createChaseCamPose(),
    );
    return new Vector3(pose.camX, pose.camY, pose.camZ);
  }, [trace, startSec, isCockpit, cameraProfile, controlFraming]);

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

  const { core, traffic, director, stepper, level } = built;

  return (
    <div style={{ width: CAPTURE_W, height: CAPTURE_H }} className="bg-surface">
      <Canvas
        shadows="percentage"
        // Pinned dpr 1 — the ONE deliberate divergence from the drill's
        // dpr=[1, maxDpr]: the recording must be exactly 1280×720 everywhere.
        dpr={1}
        camera={{
          fov: viewFov,
          near: 0.1,
          far: 900,
          position: [initialCam.x, initialCam.y, initialCam.z],
        }}
        gl={{
          // LessonScene's exact flags at the founder's level (R5 parity).
          antialias: !QUALITY_PRESETS[level].postprocessing,
          powerPreference: "high-performance",
          stencil: false,
          // The recorder + keyframe copies read the canvas between frames.
          preserveDrawingBuffer: true,
        }}
        onCreated={(state) => onCanvas(state.gl.domElement)}
      >
        {/* The founder's OWN drill preset (loadQualityPreset) — same
            exposure/tone-mapping/composer chain as the drills (R5). */}
        <SimEnvironment timeOfDay={timeOfDay} rain={rain} fog={fog} snow={snow} quality={level} />
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
              district={core.district}
              prebuilt={core.geometry}
              quality={level}
              night={isNight}
              getSignalPhase={(id, bearing) => core.runtime.signalLampState(id, bearing)}
              getRailBarrierDown={(x, y) => core.runtime.railBarrierDownAt(x, y)}
              signSvgBaseUrl={null}
            />
            {core.scenarioObstacles.length > 0 ? (
              <ScenarioObstacles obstacles={core.scenarioObstacles} clearcoat={level === "high"} />
            ) : null}
            {/* The staged actors render through the SAME layer the drill
                uses — never a parallel re-implementation (R1). */}
            <TrafficLayer
              system={traffic}
              maxDrawDistanceM={420}
              night={isNight}
              district={core.district as TrafficDistrict}
              // Doc 66 R5 (founder v1 №9 / R0 k3): the recipe's authored
              // junction-corner clear zones — the drill mounts the SAME list,
              // so the corner the ghost sweeps stays car-free in both scenes.
              parkedClearZones={core.parkedClearZones}
              hazard={lesson.hazard ?? null}
              hazardActiveRef={hazardActiveRef}
              clearcoat={level === "high"}
              controllerFigure={core.runtime}
            />
          </Physics>
          {/* The production playback path: red mistake ghost + ribbon + ❌.
              Cockpit clips hide the shell/ribbon (the camera sits inside the
              car) — the ghost group still drives the shared clock. The roof
              badge yields to the ground ❌ where one is mounted (lot maps). */}
          <ShadowCar
            trace={trace}
            clockRef={clockRef}
            showGhost={!isCockpit}
            showRibbon={!isCockpit}
            showBadge={groundMarker === null}
          />
          {/* Ghost-as-player world feed: lamps + barrier arms + staged
              actors advance by PLAYBACK time, in the recorder's frame order. */}
          <GhostWorldDriver
            stepper={stepper}
            director={director}
            clockRef={clockRef}
            frameCountRef={frameCountRef}
            hazardActiveRef={hazardActiveRef}
          />
          {isCockpit ? (
            <GhostCabin trace={trace} clockRef={clockRef} cabin={cabin} />
          ) : null}
          <PlannedCameraRig
            view={view}
            cameraProfile={cameraProfile}
            trace={trace}
            clockRef={clockRef}
            controlFraming={controlFraming}
            viewFov={viewFov}
          />
          {laneHighlight && !isCockpit ? (
            <LaneHighlightBand
              highlight={laneHighlight}
              faultTimeSec={faultTimeSec}
              clockRef={clockRef}
            />
          ) : null}
          {groundMarker && !isCockpit ? (
            <GroundFaultMarker
              marker={groundMarker}
              faultTimeSec={faultTimeSec}
              clockRef={clockRef}
            />
          ) : null}
          {withDashStrip ? (
            <DashStripOverlay trace={trace} clockRef={clockRef} cabin={cabin} viewFov={viewFov} />
          ) : null}
          <ReadyProbe onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ghost-as-player world driver (R1) — playback time → the shared feed stepper
// ---------------------------------------------------------------------------

/** Advances the whole world stack by PLAYBACK time — LessonScene's
 *  RuntimeDriver twin, with the ghost pose as the player and no grading.
 *  Also the rendered-frame counter behind the client's settle gate. */
function GhostWorldDriver({
  stepper,
  director,
  clockRef,
  frameCountRef,
  hazardActiveRef,
}: {
  stepper: CaptureFeedStepper;
  director: ScenarioDirector | null;
  clockRef: RefObject<TraceClock>;
  frameCountRef: RefObject<number>;
  hazardActiveRef: RefObject<boolean>;
}) {
  useFrame(() => {
    frameCountRef.current += 1;
    const clock = clockRef.current;
    if (!clock) return;
    const target = clock.tSec;
    const dt = target - stepper.tSec;
    // Forward only, sane bites. Backward seek: the world cannot rewind —
    // re-recording remounts the scene fresh (the v1 law, kept).
    if (dt > 0 && dt < 2) stepper.advanceTo(target);
    hazardActiveRef.current = director?.hazardActive ?? false;
  });
  return null;
}

// ---------------------------------------------------------------------------
// The planned camera rig (R2/R4/R5) — pure pose per frame, zero damping state
// ---------------------------------------------------------------------------

function PlannedCameraRig({
  view,
  cameraProfile,
  trace,
  clockRef,
  controlFraming,
  viewFov,
}: {
  view: CaptureView;
  cameraProfile: CameraProfile;
  trace: ScenarioTrace;
  clockRef: RefObject<TraceClock>;
  controlFraming: CaptureControlFraming | null;
  viewFov: number;
}) {
  const scratch = useRef({
    pt: createTracePoint(),
    chase: createChaseCamPose(),
    cockpit: createCockpitCamPose(),
    look: new Vector3(),
    quat: new Quaternion(),
    pitch: new Quaternion(),
    euler: new Euler(),
  });
  const framing = useMemo(
    () =>
      controlFraming
        ? { passTSec: controlFraming.passTSec, x: controlFraming.x, y: controlFraming.y }
        : null,
    [controlFraming],
  );
  useFrame((state) => {
    const clock = clockRef.current;
    if (!clock) return;
    const cam = state.camera;
    // Fixed per-view FOV (no speed widen — the pose must be a pure function
    // of playback time; a widen would add hidden per-frame state).
    if ("fov" in cam && cam.fov !== viewFov) {
      cam.fov = viewFov;
      cam.updateProjectionMatrix();
    }
    const s = scratch.current;
    sampleAt(trace, clock.tSec, s.pt);
    if (view === "cockpit") {
      const pose = plannedCockpitPose(s.pt, s.cockpit);
      cam.position.set(pose.camX, pose.camY, pose.camZ);
      // CameraRig's orientation law: yaw about Y · FLIP_Y · base pitch.
      s.euler.set(0, pose.yawRad, 0);
      s.quat.setFromEuler(s.euler).multiply(FLIP_Y);
      s.euler.set(pose.pitchRad, 0, 0);
      s.pitch.setFromEuler(s.euler);
      cam.quaternion.copy(s.quat.multiply(s.pitch));
      return;
    }
    // Exterior: the card's profile — rearAware holds the side three-quarter
    // frame for the WHOLE clip (nothing blends, nothing pops — R5).
    const pose =
      cameraProfile === "rearAware"
        ? plannedRearAwarePose(s.pt, s.chase)
        : plannedChasePose(clock.tSec, s.pt, framing, s.chase);
    cam.position.set(pose.camX, pose.camY, pose.camZ);
    cam.up.set(0, 1, 0);
    cam.lookAt(s.look.set(pose.lookX, pose.lookY, pose.lookZ));
  });
  return null;
}

// ---------------------------------------------------------------------------
// Fault readability chrome (doc 66 — the fault must be visually identifiable)
// ---------------------------------------------------------------------------

/** Lane-band length along the road, m — long enough to read as THE LANE. */
const LANE_BAND_LENGTH_M = 46;
const LANE_BAND_COLOR = "#35c07e";
const LANE_BAND_MAX_OPACITY = 0.3;

/** The PLAN card's positional highlight: the REQUIRED lane tints green for
 *  ~2 s at the fault (laneHighlightAlphaAt) — flat quad just above the road,
 *  additive-free, toneMapped off so the green stays literal. */
function LaneHighlightBand({
  highlight,
  faultTimeSec,
  clockRef,
}: {
  highlight: CaptureLaneHighlight;
  faultTimeSec: number;
  clockRef: RefObject<TraceClock>;
}) {
  const materialRef = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const clock = clockRef.current;
    const material = materialRef.current;
    if (!clock || !material) return;
    const alpha = laneHighlightAlphaAt(clock.tSec, faultTimeSec) * LANE_BAND_MAX_OPACITY;
    material.opacity = alpha;
    material.visible = alpha > 0.001;
  });
  return (
    <mesh
      position={[highlight.xM, 0.05, -highlight.yM]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={18}
      frustumCulled={false}
    >
      <planeGeometry args={[highlight.widthM, LANE_BAND_LENGTH_M]} />
      <meshBasicMaterial
        ref={materialRef}
        color={LANE_BAND_COLOR}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Ground-anchored ❌ at the ENGINE fault position (faultMarkerPose): fades
 *  in over the fault beat's last 0.25 s and stays — replaces the roof badge
 *  on lot maps, where the floating sprite mis-reads (pilot v2 cause 5). */
const GROUND_MARKER_SIZE_M = 2.2;

function GroundFaultMarker({
  marker,
  faultTimeSec,
  clockRef,
}: {
  marker: CaptureGroundMarker;
  faultTimeSec: number;
  clockRef: RefObject<TraceClock>;
}) {
  const materialRef = useRef<MeshBasicMaterial>(null);
  const texArgs = useMemo(() => [emojiTexture("❌")] as const, []);
  useEffect(() => () => texArgs[0].dispose(), [texArgs]);
  const pose = useMemo(() => faultMarkerPose(marker), [marker]);
  useFrame(() => {
    const clock = clockRef.current;
    const material = materialRef.current;
    if (!clock || !material) return;
    const alpha = faultMarkerAlphaAt(clock.tSec, faultTimeSec);
    material.opacity = alpha;
    material.visible = alpha > 0.001;
  });
  return (
    <mesh
      position={[pose.x, pose.y, pose.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={20}
      frustumCulled={false}
    >
      <planeGeometry args={[GROUND_MARKER_SIZE_M, GROUND_MARKER_SIZE_M]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texArgs[0]}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Ghost cabin (R4 cockpit view) — the drill's interior on the ghost pose
// ---------------------------------------------------------------------------

/** Minimal structural fakes for VitokCockpit's per-frame reads. The cockpit
 *  reads sim.steerRad/speedKmh and cabin.{blinkOn,hazardBlinkOn,indicator,
 *  seatbeltOn,headlights,driveline.gearLabel,driveline.parkingBrakeOn}; the
 *  hotspot handlers (never fired in capture — no pointer) get no-ops. */
interface GhostSim {
  steerRad: number;
  speedKmh: number;
  gear: number;
}

interface GhostCabinState {
  blinkOn: boolean;
  hazardBlinkOn: boolean;
  indicator: "off" | "left" | "right";
  seatbeltOn: boolean;
  headlights: CaptureCabinChannels["headlights"];
  glanceMirror: null;
  glanceStrength: () => number;
  glanceStart: () => void;
  glanceEnd: () => void;
  driveline: {
    gearLabel: string;
    selector: string;
    parkingBrakeOn: boolean;
    engineOn: boolean;
    transmission: string;
    toggleEngine: () => void;
    gearUp: () => boolean;
    gearDown: () => boolean;
    setHorn: () => void;
  };
}

function makeGhostCabin(cabin: CaptureCabinChannels): GhostCabinState {
  return {
    blinkOn: false,
    hazardBlinkOn: false,
    indicator: "off",
    seatbeltOn: cabin.seatbeltOn,
    headlights: cabin.headlights,
    glanceMirror: null,
    glanceStrength: () => 0,
    glanceStart: () => undefined,
    glanceEnd: () => undefined,
    driveline: {
      gearLabel: "D",
      selector: "D",
      parkingBrakeOn: false,
      engineOn: true,
      transmission: "automatic",
      toggleEngine: () => undefined,
      gearUp: () => false,
      gearDown: () => false,
      setHorn: () => undefined,
    },
  };
}

/** Capture renders the cabin unconditionally (context.enabled gates the
 *  interior's `visible`); hotspot pulses stay off (no highlight step). */
const COCKPIT_INTERACTION_CAPTURE = { enabled: true, highlightStepId: null };

function GhostCabin({
  trace,
  clockRef,
  cabin,
}: {
  trace: ScenarioTrace;
  clockRef: RefObject<TraceClock>;
  cabin: CaptureCabinChannels;
}) {
  const groupRef = useRef<Group>(null);
  const ptRef = useRef(createTracePoint());
  // The fakes live in refs and are LAZILY built on the first frame (the
  // cluster-runtime pattern — per-frame mutation is only legal on ref
  // contents). They cross VitokCockpit's nominal ref types with one honest
  // cast each; the cockpit reads only the fields the fakes carry. Until the
  // first frame fills them VitokCockpit's own `if (!sim) return` guards.
  const simRef = useRef<VehicleSim | null>(null);
  const cabinRef = useRef<CabinControls | null>(null);
  const inputRef = useRef<SimInput | null>(null);

  useFrame(() => {
    const clock = clockRef.current;
    const group = groupRef.current;
    if (!clock || !group) return;
    let sim = simRef.current as unknown as GhostSim | null;
    if (!sim) {
      sim = { steerRad: 0, speedKmh: 0, gear: 1 };
      simRef.current = sim as unknown as VehicleSim;
    }
    let ghostCabin = cabinRef.current as unknown as GhostCabinState | null;
    if (!ghostCabin) {
      ghostCabin = makeGhostCabin(cabin);
      cabinRef.current = ghostCabin as unknown as CabinControls;
    }
    const pt = ptRef.current;
    sampleAt(trace, clock.tSec, pt);
    // Ghost pose at the resting chassis height — the same frame
    // plannedCockpitPose computes the eye in.
    group.position.set(pt.x, GHOST_CHASSIS_REST_Y, -pt.y);
    group.rotation.y = Math.PI - pt.headingDeg * DEG2RAD;
    // Trace channels → the cockpit's live reads.
    sim.steerRad = pt.steerRad;
    sim.speedKmh = Math.abs(pt.speedKmh);
    sim.gear = pt.gear;
    ghostCabin.indicator = pt.indicator;
    ghostCabin.blinkOn = blinkOnAt(clock.tSec);
    ghostCabin.driveline.gearLabel = gearLabelFor(pt.gear);
  });

  return (
    <CockpitInteractionContext.Provider value={COCKPIT_INTERACTION_CAPTURE}>
      <group ref={groupRef}>
        <VitokCockpit simRef={simRef} inputRef={inputRef} cabinRef={cabinRef} />
      </group>
    </CockpitInteractionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Canvas dashboard strip (R4) — the DOM StatusDashboard's essential telltales
// drawn INTO the WebGL frame (captureStream never sees DOM overlays)
// ---------------------------------------------------------------------------

const STRIP_PX_W = 1024;
const STRIP_PX_H = 128;
/** Quad distance from the camera + width as a fraction of the frame. */
const STRIP_DIST_M = 2;
const STRIP_FRAME_FRACTION = 0.56;
/** Bottom margin as a fraction of the frame height. */
const STRIP_MARGIN_FRACTION = 0.05;

/** StatusDashboard's palette, resolved to literals (canvas has no CSS vars). */
const STRIP_BG = "rgba(13, 18, 26, 0.86)";
const STRIP_BORDER = "#33415a";
const STRIP_DIM = "#3a4556";
const STRIP_TEXT = "#e8eef7";
const STRIP_MUTED = "#8b98ab";
const STRIP_SUCCESS = "#35c07e";
const STRIP_DANGER = "#e5484d";
const STRIP_HIGH_BEAM = "#7db8ff";

const HEADLIGHT_WORD: Record<CaptureCabinChannels["headlights"], string> = {
  off: "СВЕТЛИНИ",
  low: "КЪСИ",
  high: "ДЪЛГИ",
};

function drawStripLabel(ctx: CanvasRenderingContext2D, text: string, cx: number) {
  ctx.font = "bold 17px system-ui, sans-serif";
  ctx.fillStyle = STRIP_MUTED;
  ctx.textAlign = "center";
  ctx.fillText(text, cx, 112);
}

/** Simplified BeltIcon: head circle + diagonal strap (green on / red off). */
function drawBelt(ctx: CanvasRenderingContext2D, cx: number, on: boolean) {
  ctx.strokeStyle = on ? STRIP_SUCCESS : STRIP_DANGER;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, 34, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 18, 88);
  ctx.lineTo(cx + 18, 54);
  ctx.stroke();
}

/** Simplified HeadlightIcon: lamp housing + three beams (tilt = къси). */
function drawHeadlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  state: CaptureCabinChannels["headlights"],
) {
  const color = state === "off" ? STRIP_DIM : state === "high" ? STRIP_HIGH_BEAM : STRIP_SUCCESS;
  const tilt = state === "high" ? 0 : 5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx - 6, 58, 24, Math.PI * 0.5, Math.PI * 1.5);
  ctx.closePath();
  ctx.stroke();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + 4, 58 + i * 16 + tilt);
    ctx.lineTo(cx + 30, 58 + i * 16 - tilt);
    ctx.stroke();
  }
}

function drawDashStrip(
  ctx: CanvasRenderingContext2D,
  m: ReturnType<typeof createCaptureDashModel>,
) {
  ctx.clearRect(0, 0, STRIP_PX_W, STRIP_PX_H);
  // Bar
  ctx.beginPath();
  ctx.roundRect(3, 3, STRIP_PX_W - 6, STRIP_PX_H - 6, 26);
  ctx.fillStyle = STRIP_BG;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = STRIP_BORDER;
  ctx.stroke();
  ctx.textBaseline = "middle";

  // Blinker arrows — lit green on the trace blink clock (ShadowCar parity).
  ctx.textAlign = "center";
  ctx.font = "900 60px system-ui, sans-serif";
  ctx.fillStyle = m.leftLampLit ? STRIP_SUCCESS : STRIP_DIM;
  ctx.fillText("◀", 70, 62);
  ctx.fillStyle = m.rightLampLit ? STRIP_SUCCESS : STRIP_DIM;
  ctx.fillText("▶", STRIP_PX_W - 70, 62);

  // Gear letter (driveline truth: R/N/D from the trace gear channel).
  ctx.font = "900 54px system-ui, sans-serif";
  ctx.fillStyle = STRIP_TEXT;
  ctx.fillText(m.gearLabel, 210, 52);
  drawStripLabel(ctx, "ПРЕДАВКА", 210);

  // Speed — THE readout.
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.fillStyle = STRIP_TEXT;
  ctx.textAlign = "right";
  ctx.fillText(String(Math.max(0, Math.round(Math.abs(m.speedKmh)))), 480, 58);
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillStyle = STRIP_MUTED;
  ctx.textAlign = "left";
  ctx.fillText("км/ч", 494, 66);

  // Belt + headlights (the honest cabin channels).
  drawBelt(ctx, 660, m.seatbeltOn);
  drawStripLabel(ctx, "КОЛАН", 660);
  drawHeadlight(ctx, 800, m.headlights);
  drawStripLabel(ctx, HEADLIGHT_WORD[m.headlights], 806);
}

/** Per-frame strip runtime — lazily built on the first frame and owned by a
 *  ref (the cluster-runtime pattern: mutation is only legal on ref contents). */
interface StripRuntime {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  lastHash: string;
}

function DashStripOverlay({
  trace,
  clockRef,
  cabin,
  viewFov,
}: {
  trace: ScenarioTrace;
  clockRef: RefObject<TraceClock>;
  cabin: CaptureCabinChannels;
  viewFov: number;
}) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const runtimeRef = useRef<StripRuntime | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);

  // Quad size/offset from the view frustum at STRIP_DIST_M (constant per fov).
  const layout = useMemo(() => {
    const frameH = 2 * STRIP_DIST_M * Math.tan((viewFov * Math.PI) / 360);
    const frameW = frameH * (CAPTURE_W / CAPTURE_H);
    const w = frameW * STRIP_FRAME_FRACTION;
    const h = w * (STRIP_PX_H / STRIP_PX_W);
    const yOff = -frameH / 2 + frameH * STRIP_MARGIN_FRACTION + h / 2;
    return { w, h, yOff };
  }, [viewFov]);

  const scratch = useRef({
    pt: createTracePoint(),
    model: createCaptureDashModel(),
    offset: new Vector3(),
  });

  useFrame((state) => {
    const clock = clockRef.current;
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!clock || !mesh || !material) return;
    // Lazy strip runtime + texture, wired into the material once.
    let rt = runtimeRef.current;
    if (!rt) {
      const canvas = document.createElement("canvas");
      canvas.width = STRIP_PX_W;
      canvas.height = STRIP_PX_H;
      rt = { canvas, ctx: canvas.getContext("2d"), lastHash: "" };
      runtimeRef.current = rt;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      textureRef.current = texture;
      material.map = texture;
      material.needsUpdate = true;
    }
    const s = scratch.current;
    sampleAt(trace, clock.tSec, s.pt);
    dashModelFor(s.pt, cabin, clock.tSec, s.model);
    const hash = dashModelHash(s.model);
    if (rt.ctx && hash !== rt.lastHash) {
      rt.lastHash = hash;
      drawDashStrip(rt.ctx, s.model);
      const texture = textureRef.current;
      if (texture) texture.needsUpdate = true;
    }
    // Pin the quad to the camera (pure follow — the camera itself is pure).
    const cam = state.camera;
    s.offset.set(0, layout.yOff, -STRIP_DIST_M).applyQuaternion(cam.quaternion);
    mesh.position.copy(cam.position).add(s.offset);
    mesh.quaternion.copy(cam.quaternion);
  });

  // Dispose the lazily created texture with the overlay.
  useEffect(
    () => () => {
      textureRef.current?.dispose();
      textureRef.current = null;
    },
    [],
  );

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={40}>
      <planeGeometry args={[layout.w, layout.h]} />
      {/* toneMapped=false: UI colors stay literal through AgX/composer. */}
      <meshBasicMaterial
        ref={materialRef}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Fires onReady once, READY_WARMUP_FRAMES after (a) the Suspense subtree
 *  (HDRI + ghost GLB + interior GLB) resolved AND (b) the world PROPS are
 *  actually mounted — usePropModels does NOT suspend (it returns null while
 *  the sign/tree/lamp GLBs bake), and pilot v2 recorded whole clips into that
 *  gap: rx-unguarded shipped with NO rail signs, no crossbuck, no trees (the
 *  frames prove it) because the recorder started before the props landed.
 *  The <group name="signs"> node mounts only once assets are non-null
 *  (WorldPropsGroup), so its presence IS the props-ready signal; the warmup
 *  count restarts from it so the recorded frames are prop-complete (R5/R2). */
function ReadyProbe({ onReady }: { onReady: () => void }) {
  const framesRef = useRef(0);
  const firedRef = useRef(false);
  useFrame(({ scene }) => {
    if (firedRef.current) return;
    if (!scene.getObjectByName("signs")) {
      framesRef.current = 0;
      return;
    }
    framesRef.current += 1;
    if (framesRef.current >= READY_WARMUP_FRAMES) {
      firedRef.current = true;
      onReady();
    }
  });
  return null;
}
