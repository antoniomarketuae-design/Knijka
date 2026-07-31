"use client";

/**
 * SceneStillScene — the R3F mount for the scene-still pilot (DEV ONLY).
 *
 * Draws a question's `media.sceneStill` as a single, static, angled-overhead
 * 3/4 frame of the REAL committed district:
 *   - DistrictWorld (physics off — nothing is simulated, this is a screenshot),
 *   - the question's cars through ScenarioObstacles (the same instanced fleet
 *     the sim uses; every pose is `visual: true`, so NO rapier body mounts and
 *     the scene needs no <Physics> parent),
 *   - the ego car carries a distinct HERO tint (a saturated azure-teal body)
 *     on top of its cyan ground ring, so "your car" reads at a glance,
 *   - VULNERABLE road users (bike / ped) as small code-mesh figures — the
 *     instanced fleet has no rig for them and TrafficLayer's articulated
 *     pedestrians need a live TrafficSystem, which a still has no business
 *     spinning up. Without these a cyclist question renders an empty road
 *     (founder review 2026-07-27: the picture must show what the text asks),
 *   - code-mesh attention marks:
 *       target  → a bright GREEN arrow diving from the ego toward the spot,
 *       danger  → a RED ring on the road,
 *       proceed → a GREEN forward arrow ahead of the ego ("you may go"),
 *       yield    → a RED give-way bar across the road ahead of the ego,
 *       ego     → a cyan "this is you" ground ring.
 *
 * The image-based reflection is dialled down (STILL_ENV_INTENSITY) so the
 * tarmac reads like a calm instructor diagram, not a glary noon photo.
 *
 * Everything is a pure function of the spec — no clock, no animation. A
 * ReadyProbe fires onReady once the world + fleet GLBs have mounted and a few
 * warmup frames have rendered; the headless driver then screenshots the canvas.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { DoubleSide, Euler, Quaternion, Vector3 } from "three";
import {
  mapKindHasSkyline,
  QUALITY_PRESETS,
  resetWeather,
  setWeatherTarget,
  SimEnvironment,
  stepWeather,
  type QualityLevel,
} from "@/modules/sim/environment";
import { assertDistrict, DistrictWorld, type District } from "@/modules/sim/world";
import {
  obstacleYawRad,
  ScenarioObstacles,
  type ScenarioObstacleSpec,
} from "@/components/sim/ScenarioObstacles";
import type {
  SceneStillFocus,
  SceneStillMark,
  SceneStillMedia,
  SceneStillPose,
} from "@/lib/content/types";
import type { EyeCam } from "./eyeCam";
import { STILL_H, STILL_W } from "./scene-still-client";
import { isVulnerablePoseKind } from "./stillActors";

/** Render quality — "high" for a crisp still (matches the clip rig's preset). */
const LEVEL: QualityLevel = "high";

/** Hero body tint for the learner's own car — a distinct saturated azure-teal
 *  so the ego reads at a glance (on top of the cyan "this is you" ring). Fed to
 *  the fleet paint shell via ScenarioVehicleObstacle.heroColor; civilians keep
 *  their neutral seed→palette pick. */
const HERO_EGO_COLOR = "#14b6d6";

/** Image-based (HDRI) reflection strength for the still. Lower than the sim's
 *  0.5 to kill the blown-out bright-sky specular on the tarmac/sidewalk — the
 *  scene should read like a calm instructor diagram, not a glary noon photo. */
const STILL_ENV_INTENSITY = 0.3;

/** LessonScene's day HDRI rotation (doc 71 §4.2) — kept in sync with the sim. */
const DAY_ENV_ROTATION = new Euler(0, (119 * Math.PI) / 180, 0);

// --- Camera: angled-overhead 3/4 "instructor's diagram in 3D" ---------------

/** Depression angle below horizontal — high enough to read the whole layout,
 *  low enough that it still looks like our 3D world (not a flat top-down). */
const CAM_PITCH_DEG = 46;
/** Perspective FOV — narrow-ish so the diagram reads flat, not fish-eyed. */
const CAM_FOV = 42;
/** Distance from focus as a multiple of the focus window (zoomM). Tuned so
 *  ~zoomM metres fill the frame at CAM_FOV/CAM_PITCH. */
const CAM_DIST_PER_ZOOM = 1.2;

interface StillCam {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** The dev driver-eye override (eyeCam.ts) as a camera pose. Eye at the given
 *  district point, looking along the heading with a slight downward tilt — the
 *  driver's own line of sight onto the carriageway ahead. */
function eyeCamera(eye: EyeCam): StillCam {
  const a = (eye.yawDeg * Math.PI) / 180;
  // heading 0 = north = district +y = three −z; clockwise.
  const fx = Math.sin(a);
  const fy = Math.cos(a);
  return {
    position: [eye.x, eye.height, -eye.y],
    target: [eye.x + fx * 50, eye.height - 4, -(eye.y + fy * 50)],
    fov: eye.fov,
  };
}

/** District focus → an above-and-slightly-south camera looking down at it.
 *  District (x east, y north) → three (x, height, −y); south (−y) → three +z,
 *  so the camera sits behind the ego (which approaches from the south). */
export function stillCamera(focus: SceneStillFocus): StillCam {
  const R = Math.max(20, focus.zoomM * CAM_DIST_PER_ZOOM);
  const pitch = (CAM_PITCH_DEG * Math.PI) / 180;
  const height = R * Math.sin(pitch);
  const horiz = R * Math.cos(pitch);
  const fx = focus.x;
  const fz = -focus.y;
  return {
    position: [fx, height, fz + horiz],
    target: [fx, 0, fz],
    fov: CAM_FOV,
  };
}

/** Pins the camera to the planned pose every frame (pure — no state to settle). */
function StillCamera({ cam }: { cam: StillCam }) {
  useFrame((state) => {
    const c = state.camera;
    if ("fov" in c && c.fov !== cam.fov) {
      c.fov = cam.fov;
      c.updateProjectionMatrix();
    }
    c.position.set(cam.position[0], cam.position[1], cam.position[2]);
    c.up.set(0, 1, 0);
    c.lookAt(cam.target[0], cam.target[1], cam.target[2]);
  });
  return null;
}

// --- Poses → fleet obstacles -------------------------------------------------

/** Map a still pose to a fleet obstacle (visual-only — no collider, no physics).
 *  Vulnerable users (ped/bike) have no fleet rig and are drawn as code meshes
 *  further down (VulnerableFigure), so they return null here. */
function poseToObstacle(pose: SceneStillPose, index: number): ScenarioObstacleSpec | null {
  const base = { x: pose.x, y: pose.y, headingDeg: pose.headingDeg };
  switch (pose.kind) {
    case "car":
      return {
        kind: "vehicle",
        ...base,
        visual: true,
        // Ego gets a stable seed so its paint is consistent run-to-run; the
        // hero tint + cyan ground ring are what actually identify it.
        seed: pose.variant === "ego" ? 1 : index + 2,
        ...(pose.variant === "ego" ? { heroColor: HERO_EGO_COLOR } : {}),
      };
    case "truck":
    case "bus":
    case "tram":
      return { kind: "vehicle", ...base, visual: true, model: "box_truck", seed: index + 2 };
    default:
      return null; // ped/bike — drawn as code meshes, see VulnerableFigure
  }
}

// --- Vulnerable road users (code meshes) -------------------------------------

/**
 * A cyclist or a pedestrian, built from primitives right here.
 *
 * The instanced fleet only knows vehicles, and TrafficLayer's articulated
 * pedestrians are driven by a live TrafficSystem (agent states, gait phase) —
 * a still has no clock and no system, so borrowing them would mean standing up
 * the whole traffic runtime to draw one motionless figure. These are therefore
 * deliberately small, dumb primitives: the still only has to say "there is a
 * cyclist here, riding that way".
 *
 * They read in HI-VIS YELLOW on purpose. Every other colour in the frame is
 * already spoken for — red = danger/give-way, green = proceed, teal = you —
 * so a vulnerable user needs a fourth channel, and hi-vis is what the real
 * ones wear. Nothing here is graded: these meshes exist only in the dev
 * still route.
 */
const VU_HIVIS = "#e8d93a";
const VU_DARK = "#2b3240"; // trousers / frame / wheels — reads as shadow mass
const VU_SKIN = "#c98d63";

const BIKE_WHEEL_R = 0.34;
const BIKE_WHEELBASE = 1.05; // front/rear hub separation, m
const RIDER_HIP_Y = 0.86;
const RIDER_HEAD_Y = 1.58;

/** District heading (0 = north, cw) → three.js yaw (the obstacle mapping), so
 *  local +Z is the figure's forward and local +X its right. */
function VulnerableFigure({ pose }: { pose: SceneStillPose }) {
  const yaw = obstacleYawRad(pose.headingDeg);
  const isBike = pose.kind === "bike";
  return (
    <group position={[pose.x, 0, -pose.y]} rotation={[0, yaw, 0]}>
      {isBike ? (
        <>
          {/* Two wheels + a frame bar between them — enough silhouette from
              46° above to read as a bicycle rather than a bollard. */}
          {[BIKE_WHEELBASE / 2, -BIKE_WHEELBASE / 2].map((z) => (
            <mesh
              key={z}
              position={[0, BIKE_WHEEL_R, z]}
              rotation={[0, Math.PI / 2, Math.PI / 2]}
              castShadow
            >
              <torusGeometry args={[BIKE_WHEEL_R, 0.05, 8, 20]} />
              <meshStandardMaterial color={VU_DARK} roughness={0.6} metalness={0.1} />
            </mesh>
          ))}
          <mesh position={[0, BIKE_WHEEL_R + 0.24, 0]} castShadow>
            <boxGeometry args={[0.08, 0.08, BIKE_WHEELBASE]} />
            <meshStandardMaterial color={VU_DARK} roughness={0.6} />
          </mesh>
        </>
      ) : null}
      {/* Legs — one dark block; a still has no gait to show, so splitting them
          would only add triangles for nothing at this camera distance. */}
      <mesh position={[0, isBike ? RIDER_HIP_Y - 0.28 : 0.42, 0]} castShadow>
        <boxGeometry args={[0.32, isBike ? 0.56 : 0.84, 0.26]} />
        <meshStandardMaterial color={VU_DARK} roughness={0.85} />
      </mesh>
      {/* Torso — the hi-vis mass that actually carries the read. A rider leans
          forward over the bars, a pedestrian stands upright. */}
      <mesh
        position={[0, isBike ? RIDER_HIP_Y + 0.26 : 1.06, isBike ? 0.12 : 0]}
        rotation={[isBike ? 0.55 : 0, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.42, 0.66, 0.28]} />
        <meshStandardMaterial
          color={VU_HIVIS}
          emissive={VU_HIVIS}
          emissiveIntensity={0.18}
          roughness={0.75}
        />
      </mesh>
      <mesh position={[0, isBike ? RIDER_HEAD_Y - 0.18 : RIDER_HEAD_Y, isBike ? 0.3 : 0]} castShadow>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial color={VU_SKIN} roughness={0.9} />
      </mesh>
    </group>
  );
}

// The roundabout central island used to be drawn HERE, as a dev-only code mesh
// over a dev-only copy of the derivation, because — in that file's own words —
// „the SIM still renders a ring without an island". That gap is closed: the
// island, the annular carriageway, the outer kerb and the ring divider are all
// built by sim/world's own builders/roundabout.ts, so <DistrictWorld/> below
// draws them and the still shows exactly what the driver sees. One derivation,
// never two that drift.

// --- Attention marks (code meshes) ------------------------------------------

const ARROW_TAIL_Y = 3.4; // tail floats above the road, near the ego
const ARROW_HEAD_Y = 0.6; // head hovers just above the road at the target
const ARROW_CONE_LEN = 3.4;
const ARROW_CONE_R = 1.7;
const ARROW_SHAFT_R = 0.62;

/** A bright green 3D arrow (shaft + cone) sweeping from `from` (near the ego,
 *  elevated) down to `to` (at the target) — a long, low, clearly directional
 *  "drive here" arrow that reads from the angled-overhead view (a short
 *  straight-down arrow foreshortens into a dot). */
function TargetArrow({ from, to }: { from: Vector3; to: Vector3 }) {
  const geo = useMemo(() => {
    const dir = to.clone().sub(from);
    const length = Math.max(1, dir.length());
    const quat = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    const shaftLen = Math.max(0.3, length - ARROW_CONE_LEN);
    return { quat, shaftLen };
  }, [from, to]);

  return (
    <group position={from} quaternion={geo.quat}>
      <mesh position={[0, geo.shaftLen / 2, 0]} castShadow>
        <cylinderGeometry args={[ARROW_SHAFT_R, ARROW_SHAFT_R, geo.shaftLen, 20]} />
        <meshStandardMaterial
          color="#26d267"
          emissive="#17a34a"
          emissiveIntensity={0.9}
          roughness={0.4}
          metalness={0}
        />
      </mesh>
      <mesh position={[0, geo.shaftLen + ARROW_CONE_LEN / 2, 0]} castShadow>
        <coneGeometry args={[ARROW_CONE_R, ARROW_CONE_LEN, 24]} />
        <meshStandardMaterial
          color="#26d267"
          emissive="#17a34a"
          emissiveIntensity={1.0}
          roughness={0.4}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

/** A red conflict-point ring lying flat on the road. */
function DangerRing({ mark }: { mark: SceneStillMark }) {
  return (
    <group position={[mark.x, 0, -mark.y]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.14, 0]}>
        <torusGeometry args={[1.7, 0.32, 12, 40]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#dc2626"
          emissiveIntensity={0.8}
          roughness={0.5}
        />
      </mesh>
      {/* Translucent hot-zone fill so the point reads even from a low angle. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <circleGeometry args={[1.7, 40]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A cyan "this is you" ring under the ego car. */
function EgoRing({ pose }: { pose: SceneStillPose }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[pose.x, 0.12, -pose.y]}>
      <torusGeometry args={[2.5, 0.22, 12, 44]} />
      <meshStandardMaterial
        color="#22d3ee"
        emissive="#06b6d4"
        emissiveIntensity={0.7}
        roughness={0.5}
      />
    </mesh>
  );
}

/** District heading (0 = north, cw) → a three-space forward UNIT vector.
 *  District forward (east=sinθ, north=cosθ) maps to three (x, 0, −z). */
function forwardVec(headingDeg: number): Vector3 {
  const t = (headingDeg * Math.PI) / 180;
  return new Vector3(Math.sin(t), 0, -Math.cos(t));
}

// "proceed" forward arrow — flat on the tarmac, long enough to read when the
// ego points straight away from the camera (see the memo that builds it).
const PROCEED_FLAT_Y = 0.4; // just above the road, constant (no diving)
const PROCEED_AHEAD_M = 4.5; // arrow tip this far forward of the anchor
const PROCEED_BACK_M = 3.0; // shaft tail this far back of the anchor

const YIELD_BAR_LEN = 4.4; // across the road, spans the ego lane
const YIELD_BAR_H = 0.36;
const YIELD_BAR_DEPTH = 1.2; // along the heading — a solid stop band
const YIELD_CHEVRON_Y = 1.05; // low, so the angled cam keeps it over the bar

/** A red "give way here" marker for the ego: a bold thick STOP band laid ACROSS
 *  the road (perpendicular to the ego's heading) plus a downward chevron sitting
 *  just above it — "you must stop / give way here". Oriented by the ego heading
 *  so its long axis spans the lane. */
function YieldBar({ anchor, headingDeg }: { anchor: Vector3; headingDeg: number }) {
  // obstacleYawRad maps district heading so local +Z = ego-forward and local
  // +X = the cross-road axis; the bar's length runs along local X.
  const yaw = obstacleYawRad(headingDeg);
  return (
    <group position={anchor} rotation={[0, yaw, 0]}>
      {/* Bold red stop band on the tarmac, spanning the lane across the heading. */}
      <mesh position={[0, YIELD_BAR_H / 2 + 0.02, 0]} castShadow>
        <boxGeometry args={[YIELD_BAR_LEN, YIELD_BAR_H, YIELD_BAR_DEPTH]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#dc2626"
          emissiveIntensity={0.9}
          roughness={0.5}
          metalness={0}
        />
      </mesh>
      {/* Translucent glow skirt so the band reads even from the low angle. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <planeGeometry args={[YIELD_BAR_LEN + 0.8, YIELD_BAR_DEPTH + 1.0]} />
        <meshBasicMaterial
          color="#ef4444"
          transparent
          opacity={0.25}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* Large downward chevron (square-pyramid) just above the band. */}
      <mesh position={[0, YIELD_CHEVRON_Y, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[1.15, 1.5, 4]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#dc2626"
          emissiveIntensity={1.0}
          roughness={0.45}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

// --- Readiness probe ---------------------------------------------------------

const READY_WARMUP_FRAMES = 40;

/** Fires onReady once the world (and, when present, the fleet) has mounted and
 *  a warmup of frames has rendered — the still is settled and shootable. */
function ReadyProbe({
  onReady,
  needObstacles,
}: {
  onReady: () => void;
  needObstacles: boolean;
}) {
  const frames = useRef(0);
  const fired = useRef(false);
  useFrame(({ scene }) => {
    if (fired.current) return;
    const worldReady = !!scene.getObjectByName("district-world");
    const carsReady = !needObstacles || !!scene.getObjectByName("scenario-obstacles");
    if (!worldReady || !carsReady) {
      frames.current = 0;
      return;
    }
    frames.current += 1;
    if (frames.current >= READY_WARMUP_FRAMES) {
      fired.current = true;
      onReady();
    }
  });
  return null;
}

// --- Scene -------------------------------------------------------------------

export function SceneStillScene({
  spec,
  eye,
  onReady,
  onError,
}: {
  spec: SceneStillMedia;
  /** Dev driver-eye camera override (`?eye=` on the route). Absent = the
   *  committed angled-overhead frame, byte-identical to every rendered still. */
  eye?: EyeCam | null;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const [district, setDistrict] = useState<District | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/world/${spec.districtId}.json`);
        if (!res.ok) throw new Error(`district ${spec.districtId} ${res.status}`);
        const raw: unknown = await res.json();
        const parsed = assertDistrict(raw);
        // Dry, settled weather on frame 1 (mirrors the clip rig's prime).
        resetWeather();
        setWeatherTarget(false, false, false);
        stepWeather(1000);
        if (alive) setDistrict(parsed);
      } catch (err) {
        console.error("SceneStillScene: failed to load district", err);
        if (alive) onError(err instanceof Error ? err.message : "district load failed");
      }
    })();
    return () => {
      alive = false;
    };
    // Mounted once per spec.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const obstacles = useMemo(
    () =>
      spec.poses
        .map((p, i) => poseToObstacle(p, i))
        .filter((o): o is ScenarioObstacleSpec => o !== null),
    [spec.poses],
  );
  const egoPose = useMemo(
    () => spec.poses.find((p) => p.variant === "ego") ?? null,
    [spec.poses],
  );
  const vulnerable = useMemo(
    () => spec.poses.filter((p) => isVulnerablePoseKind(p.kind)),
    [spec.poses],
  );
  const marks = spec.marks ?? [];
  const cam = useMemo(
    () => (eye ? eyeCamera(eye) : stillCamera(spec.focus)),
    [spec.focus, eye],
  );

  // Arrow tails, computed from the ego toward each target (pure). The arrow
  // sweeps back across most of the ego→target gap so it reads directionally.
  const targetArrows = useMemo(() => {
    return marks
      .filter((m) => m.kind === "target")
      .map((m) => {
        const head = new Vector3(m.x, ARROW_HEAD_Y, -m.y);
        let tail: Vector3;
        if (egoPose) {
          const horiz = new Vector3(m.x - egoPose.x, 0, -m.y - -egoPose.y);
          const horizDist = horiz.length();
          if (horizDist < 1e-3) horiz.set(0, 0, 1);
          horiz.normalize();
          // Span most of the gap, but stay clear of the ego body and don't run
          // off short faults; the arrow descends from ARROW_TAIL_Y to the road.
          const spanBack = Math.min(Math.max(horizDist * 0.85, 5), 16);
          tail = new Vector3(
            head.x - horiz.x * spanBack,
            ARROW_TAIL_Y,
            head.z - horiz.z * spanBack,
          );
        } else {
          tail = new Vector3(head.x, ARROW_TAIL_Y + 3, head.z);
        }
        return { from: tail, to: head };
      });
  }, [marks, egoPose]);

  // "proceed" — a GREEN forward arrow along the ego's heading, centred on the
  // mark anchor (a couple metres ahead of the ego): "you have priority — go".
  // Reuses the target-arrow mesh, but laid FLAT on the tarmac (constant, low
  // height) and long: an ego facing away from the camera points its heading
  // straight up-screen, so an elevated/short arrow foreshortens into a blob —
  // a long flat road arrow keeps real screen length and reads as "go straight".
  const proceedArrows = useMemo(() => {
    const fwd = forwardVec(egoPose?.headingDeg ?? 0);
    return marks
      .filter((m) => m.kind === "proceed")
      .map((m) => {
        const anchor = new Vector3(m.x, PROCEED_FLAT_Y, -m.y);
        const to = anchor.clone().addScaledVector(fwd, PROCEED_AHEAD_M);
        const from = anchor.clone().addScaledVector(fwd, -PROCEED_BACK_M);
        return { from, to };
      });
  }, [marks, egoPose]);

  // "yield" — a RED give-way bar across the road ahead of the ego, oriented by
  // the ego heading: "you must give way here".
  const yieldBars = useMemo(() => {
    const head = egoPose?.headingDeg ?? 0;
    return marks
      .filter((m) => m.kind === "yield")
      .map((m) => ({ anchor: new Vector3(m.x, 0, -m.y), headingDeg: head }));
  }, [marks, egoPose]);

  if (!district) {
    return (
      <div
        style={{ width: STILL_W, height: STILL_H }}
        className="flex items-center justify-center bg-black text-sm text-white/60"
      >
        Зареждане на света…
      </div>
    );
  }

  return (
    <div style={{ width: STILL_W, height: STILL_H }}>
      <Canvas
        shadows="percentage"
        dpr={1}
        camera={{ fov: cam.fov, near: 0.5, far: 2000, position: cam.position }}
        gl={{
          antialias: !QUALITY_PRESETS[LEVEL].postprocessing,
          powerPreference: "high-performance",
          stencil: false,
          preserveDrawingBuffer: true,
        }}
      >
        {/* The still is a review frame of the committed district, so it takes
            that district's own skyline verdict (doc 82 §3.2 V3) — a lot still
            that grew a mountain would be reviewing the wrong scene. */}
        <SimEnvironment
          timeOfDay="day"
          rain={false}
          skyline={mapKindHasSkyline(district.meta.mapKind)}
          quality={LEVEL}
        />
        <Suspense fallback={null}>
          <Environment
            files="/sim/env/shanghai_riverside_1k.hdr"
            background={false}
            environmentIntensity={STILL_ENV_INTENSITY}
            environmentRotation={DAY_ENV_ROTATION}
          />
          <DistrictWorld
            district={district}
            quality={LEVEL}
            night={false}
            physics={false}
            signSvgBaseUrl={null}
          />
          {obstacles.length > 0 ? (
            <ScenarioObstacles obstacles={obstacles} clearcoat={LEVEL === "high"} />
          ) : null}
          {vulnerable.map((p, i) => (
            <VulnerableFigure key={`vu-${i}`} pose={p} />
          ))}
          {egoPose ? <EgoRing pose={egoPose} /> : null}
          {targetArrows.map((a, i) => (
            <TargetArrow key={`target-${i}`} from={a.from} to={a.to} />
          ))}
          {proceedArrows.map((a, i) => (
            <TargetArrow key={`proceed-${i}`} from={a.from} to={a.to} />
          ))}
          {yieldBars.map((y, i) => (
            <YieldBar key={`yield-${i}`} anchor={y.anchor} headingDeg={y.headingDeg} />
          ))}
          {marks
            .filter((m) => m.kind === "danger")
            .map((m, i) => (
              <DangerRing key={`danger-${i}`} mark={m} />
            ))}
          <StillCamera cam={cam} />
          <ReadyProbe onReady={onReady} needObstacles={obstacles.length > 0} />
        </Suspense>
      </Canvas>
    </div>
  );
}
