"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  type BufferGeometry,
  type Object3D,
} from "three";
import type { VehicleSim } from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import { hotspotsForStep, type CockpitHotspotName } from "@/modules/sim/procedures";
import type { CabinControls } from "../cabin";
import {
  CLUSTER_H,
  CLUSTER_W,
  clusterHash,
  drawCluster,
  needleAngleRad,
  type ClusterData,
} from "./cluster";
import {
  COCKPIT_HOTSPOTS,
  CockpitInteractionContext,
  type HotspotAction,
} from "./hotspots";
import { MirrorRig, type MirrorMeshes } from "./MirrorRig";

// ---------------------------------------------------------------------------
// A3 authored interior — the Aurelis GT-E cabin (Draco GLB, 22.5k tris,
// 6 materials, 2 merged draw groups interior_shell + interior_seats, all 13
// doc-69 hotspot_* nodes kept separate + screen_cluster / screen_center +
// the steering_wheel empty parenting steering_wheel_mesh & hotspot_horn).
//
// MOUNTING MATH (verified against the GLB node transforms): the file is
// authored Y-up with the car facing -Z — the same convention as the exterior
// hero_car.glb — so the sim's existing yaw-π flip applies; at scale 1.0 with
// a y offset of -0.55 the authored driver eye lands exactly on COCKPIT_DEP
// (the design eye point; the camera sits aft of it, see COCKPIT_EYE).
// Cross-check: authored steering_wheel (-0.34, 0.85, -0.52) → chassis-local
// (0.34, 0.30, 0.52) — the procedural cockpit's exact wheel mount.
// ---------------------------------------------------------------------------
const INTERIOR_URL = "/sim/vehicles/hero_interior.glb";
/** Local Draco decoder (CSP-safe, no CDN) — copied to public/draco/. */
const DRACO_PATH = "/draco/";
/** Authored car faces -Z (like the exterior GLB) → flip to chassis +Z. */
const INTERIOR_YAW = Math.PI;
/** Authored floor→eye calibration: chassis-local y = authored y - 0.55. */
const INTERIOR_Y_OFFSET = -0.55;

/**
 * Render layer for everything cabin-local (interior GLB, hotspot proxies,
 * VehicleRig's windshield plane). The MAIN camera enables it (effect below);
 * the A4 mirror render-to-texture cameras keep the default layer-0 mask, so
 * mirror passes see the world but never the cabin — that is the recursion /
 * self-view guard for the RTT mirrors.
 */
export const INTERIOR_LAYER = 2;

/**
 * Visual steering ratio (hands-to-roadwheel-visual). The shared physics
 * constant STEERING_WHEEL_VISUAL_RATIO was 13×, which whipped the rim to
 * implausible lock for a normal steer input; a realistic wheel turns only
 * ~1.5 turns lock-to-lock, so a modest ~3.5× reads far better. Kept local
 * (visual-only) to avoid touching the physics tuning module.
 */
const WHEEL_VISUAL_RATIO = 3.5;

// Cluster quad: 0.30 x 0.15 m mapping the 512x256 canvas -> 0.000586 m/px.
const PX = 0.3 / CLUSTER_W;
const NEEDLE_PIVOT_X = (140 - CLUSTER_W / 2) * PX; // dial centre (140,132)
const NEEDLE_PIVOT_Y = (CLUSTER_H / 2 - 132) * PX;

/** Mutable cluster redraw state, created lazily on first frame and owned by
 * a plain ref (per-frame mutation is only legal on ref contents). */
interface ClusterRuntime {
  ctx: CanvasRenderingContext2D | null;
  lastHash: string;
  cooldown: number;
  data: ClusterData;
}

function makeClusterRuntime(canvas: HTMLCanvasElement): ClusterRuntime {
  return {
    ctx: canvas.getContext("2d"),
    lastHash: "",
    cooldown: 0,
    data: {
      gear: "N",
      indicatorLeftLit: false,
      indicatorRightLit: false,
      seatbeltOn: false,
      handbrakeOn: false,
      headlights: "off",
    },
  };
}

/**
 * The A3 GLB ships no UVs (solid-color PBR materials). The screen and mirror
 * quads need them for the cluster canvas / RTT textures, so synthesize a
 * planar map from the quad's local XY extents. `mirrorU` bakes the horizontal
 * mirror-image flip straight into the UVs (a raw rear-facing camera shows
 * car-left on image-right; a real mirror shows it on the left).
 */
function ensureQuadUVs(geometry: BufferGeometry, mirrorU: boolean): void {
  if (geometry.getAttribute("uv")) return;
  const pos = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb) return;
  const w = Math.max(bb.max.x - bb.min.x, 1e-6);
  const h = Math.max(bb.max.y - bb.min.y, 1e-6);
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - bb.min.x) / w;
    uv[i * 2] = mirrorU ? 1 - u : u;
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / h;
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
}

function asMesh(o: Object3D | undefined): Mesh | null {
  return o instanceof Mesh ? o : null;
}

/**
 * „Виток" cockpit, A3 edition: the authored GT-E interior GLB replaces the
 * old procedural box shell. Kept live on top of it:
 *  - the instrument-cluster CanvasTexture, now projected onto the GLB's
 *    `screen_cluster` quad (UV-synthesized, unmirrored from the driver seat)
 *    with the 3D speedo needle re-parented onto that quad;
 *  - the steering-wheel rotation driver, retargeted to the `steering_wheel`
 *    node (its child hotspot_horn rides the rim, like a real wheel);
 *  - the doc-69 hotspot layer (invisible enlarged proxy boxes at the GLB
 *    control positions — P1 touch targets stay big).
 * The interior renders in the cockpit view only (context.enabled, the
 * existing view gating) and lives on INTERIOR_LAYER so the A4 mirror cameras
 * never see the cabin.
 *
 * STEERING WHEEL SIGN (GLB verified: the wheel disc lies in the
 * steering_wheel empty's local XZ plane — rim X ±0.205 / Z −0.162..0.205,
 * 12-o'clock accent stripe at +Z — so the spin axis is local +Y, which after
 * the authored tilt and the yaw-π mount points along chassis (0, 0.44, 0.90):
 * exactly the old procedural column axis, pointing away from the driver.
 * Same sign rule as before on that axis: `rotation.y = -steerRad * ratio`
 * reads counter-clockwise from the driver's seat for a left steer.)
 */
export function VitokCockpit({
  simRef,
  inputRef,
  cabinRef,
}: {
  simRef: RefObject<VehicleSim | null>;
  inputRef: RefObject<SimInput | null>;
  cabinRef: RefObject<CabinControls | null>;
}) {
  const { enabled: cockpitView } = useContext(CockpitInteractionContext);
  const camera = useThree((s) => s.camera);
  const raycaster = useThree((s) => s.raycaster);
  const { scene } = useGLTF(INTERIOR_URL, DRACO_PATH);

  const needleRef = useRef<Object3D | null>(null);
  const runtimeRef = useRef<ClusterRuntime | null>(null);
  const textureRef = useRef<CanvasTexture | null>(null);

  // Main camera renders the cabin layer; the default raycaster must also test
  // it or the layer-2 hotspot proxies would be unclickable (three's Raycaster
  // defaults to layer 0 only). Mirror cameras keep mask 1 → cabin excluded.
  useEffect(() => {
    camera.layers.enable(INTERIOR_LAYER);
    raycaster.layers.enable(INTERIOR_LAYER);
    return () => {
      camera.layers.disable(INTERIOR_LAYER);
    };
  }, [camera, raycaster]);

  const { model, wheelNode, clusterMesh, mirrorMeshes } = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      o.layers.set(INTERIOR_LAYER);
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        // No shadow casting: 22.5k tris the shadow pass doesn't need — the
        // cabin is lit by the fill light + IBL, grounded by the world's AO.
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      }
    });

    const clusterMesh = asMesh(root.getObjectByName("screen_cluster"));
    if (clusterMesh) ensureQuadUVs(clusterMesh.geometry, false);

    const mirrorMeshes: MirrorMeshes = {
      left: asMesh(root.getObjectByName("hotspot_mirror_left")),
      right: asMesh(root.getObjectByName("hotspot_mirror_right")),
      rear: asMesh(root.getObjectByName("hotspot_mirror_rear")),
    };
    for (const mesh of Object.values(mirrorMeshes)) {
      if (mesh) ensureQuadUVs(mesh.geometry, true); // mirror-image U flip
    }

    const wheelNode = root.getObjectByName("steering_wheel") ?? null;
    return { model: root, wheelNode, clusterMesh, mirrorMeshes };
  }, [scene]);

  const clusterCanvas = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CLUSTER_W;
    canvas.height = CLUSTER_H;
    return canvas;
  }, []);

  // Project the live cluster canvas onto the GLB screen quad and hang the 3D
  // speedo needle off it (frame-rate sweep over the 10 Hz canvas face). All
  // resources created here are owned here and disposed on unmount; the quad's
  // authored material is restored so the cached GLTF scene stays pristine.
  useEffect(() => {
    const cluster = clusterMesh;
    if (!cluster) return;
    const texture = new CanvasTexture(clusterCanvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new MeshBasicMaterial({ map: texture, toneMapped: false });
    const previousMaterial = cluster.material;
    cluster.material = material;
    textureRef.current = texture;
    // Force a first draw (runtime hash starts empty, but make the texture
    // upload once even before the first state change).
    runtimeRef.current = null;

    const needleGeometry = new BoxGeometry(0.066, 0.006, 0.003);
    needleGeometry.translate(0.025, 0, 0);
    const needleMaterial = new MeshBasicMaterial({ color: "#ff5533", toneMapped: false });
    const needle = new Mesh(needleGeometry, needleMaterial);
    // Dial centre in quad-local metres, floated 4 mm off the glass.
    needle.position.set(NEEDLE_PIVOT_X, NEEDLE_PIVOT_Y, 0.004);
    needle.layers.set(INTERIOR_LAYER);
    cluster.add(needle);
    needleRef.current = needle;

    return () => {
      cluster.remove(needle);
      cluster.material = previousMaterial;
      needleRef.current = null;
      textureRef.current = null;
      texture.dispose();
      material.dispose();
      needleGeometry.dispose();
      needleMaterial.dispose();
    };
  }, [clusterMesh, clusterCanvas]);

  useFrame((_, delta) => {
    const sim = simRef.current;
    const cabin = cabinRef.current;
    if (!sim) return;

    if (wheelNode) {
      // Spin about the authored column axis (node-local +Y, see doc above).
      wheelNode.rotation.y = -sim.steerRad * WHEEL_VISUAL_RATIO;
    }
    const needle = needleRef.current;
    if (needle) {
      needle.rotation.z = needleAngleRad(sim.speedKmh);
    }

    // Cluster face: redrawn only when a telltale changes (blink edges /
    // gear / lamp toggles — capped at 10 Hz). Runtime state lives in a ref.
    let rt = runtimeRef.current;
    if (!rt) {
      rt = makeClusterRuntime(clusterCanvas);
      runtimeRef.current = rt;
    }
    rt.cooldown -= delta;
    if (rt.ctx && rt.cooldown <= 0) {
      rt.cooldown = 0.1;
      const input = inputRef.current?.read() ?? null;
      const blink = cabin?.blinkOn ?? false;
      const hazardBlink = cabin?.hazardBlinkOn ?? false;
      const d = rt.data;
      // A1: the cluster reads the REAL driveline — selector letter (P R N D /
      // M2), stateful parking-brake lamp, hazard flashers on both arrows.
      d.gear = cabin ? cabin.driveline.gearLabel : sim.gear;
      d.indicatorLeftLit = (blink && cabin?.indicator === "left") || hazardBlink;
      d.indicatorRightLit = (blink && cabin?.indicator === "right") || hazardBlink;
      d.seatbeltOn = cabin?.seatbeltOn ?? false;
      d.handbrakeOn =
        (cabin?.driveline.parkingBrakeOn ?? false) || (input?.handbrake ?? false);
      d.headlights = cabin?.headlights ?? "off";
      const hash = clusterHash(d);
      if (hash !== rt.lastHash) {
        rt.lastHash = hash;
        drawCluster(rt.ctx, d);
        const texture = textureRef.current;
        if (texture) texture.needsUpdate = true;
      }
    }
  });

  // Cockpit-view-only: the cabin is pure driver-seat perception; the chase
  // camera sees the exterior GLB instead. visible (not unmount) so the GLTF
  // graph, canvas texture and mirror targets survive view toggles.
  return (
    <group visible={cockpitView}>
      <primitive
        object={model}
        position={[0, INTERIOR_Y_OFFSET, 0]}
        rotation={[0, INTERIOR_YAW, 0]}
        dispose={null}
      />

      {/* A4: functional render-to-texture mirrors on the GLB mirror glass. */}
      <MirrorRig mirrors={mirrorMeshes} active={cockpitView} />

      {/* A2: named raycast hotspots (doc 69). */}
      <CockpitHotspots cabinRef={cabinRef} />
    </group>
  );
}

useGLTF.preload(INTERIOR_URL, DRACO_PATH);

// ---------------------------------------------------------------------------
// A2 cockpit hotspots — the doc-69 interactive layer
// ---------------------------------------------------------------------------

/** Hover glow / instruction-pulse opacities for the proxy boxes. */
const HOTSPOT_HOVER_OPACITY = 0.38;
const HOTSPOT_PULSE_BASE = 0.14;
const HOTSPOT_PULSE_AMPLITUDE = 0.13;
const HOTSPOT_PULSE_HZ = 0.7;
const HOTSPOT_COLOR = "#6db4ff";

/**
 * Named raycast-target meshes per the doc-69 contract: invisible enlarged
 * proxy boxes at the GLB control positions (transparent, opacity 0 — R3F only
 * raycasts objects with handlers, so the authored control meshes underneath
 * stay inert and never occlude the proxies). Proxies keep the P1 touch
 * targets bigger than the visible controls, exactly as doc 69 allows.
 *
 * Interaction contract (doc 68 A2):
 *  - hover  → subtle glow around the authored control + Bulgarian tooltip
 *    naming it (with its equivalent key — the keys are real, so the hint is
 *    honest), pointer cursor;
 *  - click  → the SAME CabinControls/DrivelineState transition as the key
 *    (gear selector: right-click steps back toward P; horn is momentary on
 *    pointer down/up; mirror glances HOLD while pressed — pointer down/up
 *    twins the Q/E/F key down/up, graded once per hold);
 *  - instruction mode → the pending step's hotspot(s) pulse gently
 *    (highlightStepId via CockpitInteractionContext, provided by LessonScene).
 *
 * Enabled only in the cockpit camera view (context.enabled) — a chase-view
 * click on the car must never operate a control the student cannot see.
 */
function CockpitHotspots({ cabinRef }: { cabinRef: RefObject<CabinControls | null> }) {
  const { enabled, highlightStepId } = useContext(CockpitInteractionContext);
  const [hovered, setHovered] = useState<CockpitHotspotName | null>(null);
  // Ref twin of `hovered` for the frame loop (written only in handlers/effects
  // — render stays pure per the project lint rules).
  const hoveredRef = useRef<CockpitHotspotName | null>(null);
  const materialsRef = useRef(new Map<CockpitHotspotName, MeshBasicMaterial>());

  const setHover = useCallback((name: CockpitHotspotName | null) => {
    hoveredRef.current = name;
    setHovered(name);
    document.body.style.cursor = name ? "pointer" : "auto";
  }, []);

  // Camera left cockpit view (or unmount) mid-hover: clear glow + cursor.
  useEffect(() => {
    if (!enabled && hoveredRef.current !== null) setHover(null);
    return () => {
      if (hoveredRef.current !== null) {
        hoveredRef.current = null;
        document.body.style.cursor = "auto";
      }
    };
  }, [enabled, setHover]);

  const highlightNames = useMemo(
    () => new Set<CockpitHotspotName>(highlightStepId ? hotspotsForStep(highlightStepId) : []),
    [highlightStepId],
  );

  // Per-frame glow: hovered = steady, highlighted = slow pulse, else hidden.
  // Mutates materials only (no React state at frame rate).
  useFrame((state) => {
    const pulse =
      HOTSPOT_PULSE_BASE +
      HOTSPOT_PULSE_AMPLITUDE *
        (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * HOTSPOT_PULSE_HZ * 2 * Math.PI));
    for (const [name, material] of materialsRef.current) {
      material.opacity =
        hoveredRef.current === name ? HOTSPOT_HOVER_OPACITY : highlightNames.has(name) ? pulse : 0;
    }
  });

  const runAction = useCallback(
    (action: HotspotAction) => {
      const cabin = cabinRef.current;
      if (!cabin) return;
      switch (action.type) {
        case "engineToggle":
          cabin.driveline.toggleEngine();
          break;
        case "seatbeltToggle":
          cabin.toggleSeatbelt();
          break;
        case "gearStep":
          cabin.driveline.gearUp(); // click = one gate step toward D (doc 69)
          break;
        case "parkingBrakeToggle":
          cabin.toggleParkingBrake();
          break;
        case "indicatorCycle":
          cabin.cycleIndicator();
          break;
        case "wipersToggle":
          cabin.driveline.toggleWipers();
          break;
        case "headlightsCycle":
          cabin.cycleHeadlights();
          break;
        case "hazardsToggle":
          cabin.driveline.toggleHazards();
          break;
        case "fogToggle":
          cabin.driveline.toggleFogLights();
          break;
        case "glance":
          break; // held — handled on pointer down/up below (Q/E/F twin)
        case "hornHold":
          break; // momentary — handled on pointer down/up below
      }
    },
    [cabinRef],
  );

  const hoveredSpec = hovered ? COCKPIT_HOTSPOTS.find((h) => h.name === hovered) ?? null : null;

  return (
    <group>
      {enabled
        ? COCKPIT_HOTSPOTS.map((spec) => (
            <mesh
              key={spec.name}
              name={spec.name}
              position={spec.pos as [number, number, number]}
              onUpdate={(m: Mesh) => m.layers.set(INTERIOR_LAYER)}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHover(spec.name);
              }}
              onPointerOut={() => {
                if (hoveredRef.current === spec.name) setHover(null);
                // Dragging off a held control releases it (like lifting off).
                if (spec.action.type === "hornHold") cabinRef.current?.driveline.setHorn(false);
                if (spec.action.type === "glance") cabinRef.current?.glanceEnd(spec.action.mirror);
              }}
              onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                if (e.button !== 0) return;
                if (spec.action.type === "hornHold") {
                  e.stopPropagation();
                  cabinRef.current?.driveline.setHorn(true);
                } else if (spec.action.type === "glance") {
                  // Founder contract: the glance view HOLDS while pressed —
                  // pointer down/up mirrors the Q/E/F key down/up exactly.
                  e.stopPropagation();
                  cabinRef.current?.glanceStart(spec.action.mirror);
                }
              }}
              onPointerUp={() => {
                if (spec.action.type === "hornHold") cabinRef.current?.driveline.setHorn(false);
                if (spec.action.type === "glance") cabinRef.current?.glanceEnd(spec.action.mirror);
              }}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                runAction(spec.action);
              }}
              onContextMenu={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                e.nativeEvent.preventDefault();
                // Right-click steps the selector gate back toward P (doc 69).
                if (spec.action.type === "gearStep") cabinRef.current?.driveline.gearDown();
              }}
            >
              <boxGeometry args={spec.size as [number, number, number]} />
              <meshBasicMaterial
                ref={(m: MeshBasicMaterial | null) => {
                  if (m) materialsRef.current.set(spec.name, m);
                  else materialsRef.current.delete(spec.name);
                }}
                color={HOTSPOT_COLOR}
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          ))
        : null}

      {/* Tooltip: Bulgarian control name + its real key, above the control. */}
      {enabled && hoveredSpec ? (
        <Html
          position={[
            hoveredSpec.pos[0],
            hoveredSpec.pos[1] + hoveredSpec.size[1] / 2 + 0.03,
            hoveredSpec.pos[2],
          ]}
          center
          style={{ pointerEvents: "none", whiteSpace: "nowrap" }}
          zIndexRange={[30, 10]}
        >
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background/90 px-2 py-1 backdrop-blur">
            <span className="text-[11px] font-semibold text-foreground">
              {hoveredSpec.labelBg}
            </span>
            <kbd className="rounded bg-surface px-1 py-0.5 font-mono text-[10px] font-bold text-accent">
              {hoveredSpec.keyHint}
            </kbd>
          </div>
        </Html>
      ) : null}
    </group>
  );
}
