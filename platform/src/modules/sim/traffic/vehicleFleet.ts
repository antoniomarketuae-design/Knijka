/**
 * vehicleFleet — GLB extraction + instanced-mesh assembly for TrafficLayer.
 *
 * The traffic system is model-agnostic (it only carries pose + colorIndex). This
 * helper turns the authored low-poly GLB kit (public/sim/vehicles/*.glb, built by
 * tools/blender/vehicles.py) into a small, FIXED set of InstancedMeshes so the
 * ambient cars read as real vehicles without the draw-call count scaling with the
 * agent count:
 *
 *  - Each traffic vehicle is assigned ONE model deterministically from its id
 *    (police rare, ~1 in 15). Vehicles that share a model share an InstancedMesh.
 *  - Per model, the body's paint/glass/trim/livery/lightbar primitives are merged
 *    into a SINGLE multi-material geometry (headlight/taillight primitives are
 *    dropped — TrafficLayer draws those as its own night-gated / per-vehicle
 *    emissive lamp overlays, preserving the old dynamic behaviour). One
 *    InstancedMesh per model, sized to the number of vehicles on that model.
 *  - ALL wheels (26×4) are one shared InstancedMesh: a single wheel geometry
 *    (extracted from the sedan GLB, spin axis local X, hub-centred) drawn 4× per
 *    car. TrafficLayer sets each instance's matrix = car·offset·roll·steer, and a
 *    uniform scale so the shared wheel matches each model's wheel radius.
 *  - The PARKED pass (doc 68 A5) reuses the exact same rigs: per-model STATIC
 *    InstancedMeshes over the same merged body geometry + one static shared
 *    wheel InstancedMesh (4 per parked car, so parked cars keep their wheels).
 *    Civilian models only (assignCivilianModel — no parked police), matrices
 *    written once by TrafficLayer's placement effect.
 *
 * Draw calls are therefore bounded by MODELS × body-primitives (+ 2 wheel groups)
 * for the moving fleet, plus the same bound again for the parked pass —
 * independent of how many cars are on screen. Geometry is authored ground-relative
 * (Y = 0 = tarmac; body floats above, wheels touch down), so instances place the
 * body at Y = 0 and each wheel at Y = its (scaled) radius.
 *
 * ADR-001: the kit is entirely FICTIONAL (no real brands / insignia).
 */

import {
  Box3,
  type BufferGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  type Object3D,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TrafficVehicleState } from "./types";

/** Fleet model basenames. Order is load-order and the model-index space. */
export const FLEET = [
  "sedan",
  "sedan_silver",
  "sedan_maroon",
  "suv",
  "suv_sand",
  "hatchback",
  "hatchback_red",
  "van",
  "police",
] as const;
export const FLEET_URLS = FLEET.map((n) => `/sim/vehicles/${n}.glb`);
/** Police is the last entry; the civilian pool is everything before it. */
const POLICE_INDEX = FLEET.length - 1;
const CIVILIAN_COUNT = FLEET.length - 1;

/** Local Draco decoder (CSP-safe, served from public/draco/ — no CDN). */
export const DRACO_DECODER_PATH = "/draco/";

// Materials the body merge drops (TrafficLayer renders these as dynamic lamp
// overlays) and the ones that belong to the shared wheel, matched by GLB name.
const SKIP_BODY_MATERIALS = new Set(["headlight", "taillight"]);
const WHEEL_MATERIALS = new Set(["tire", "hubcap"]);
const WHEEL_NODE_RE = /^wheel_(FL|FR|RL|RR)$/;
const WHEEL_ORDER = ["wheel_FL", "wheel_FR", "wheel_RL", "wheel_RR"];

/** Let paint/glass/chrome catch the scene HDRI (glass reflects more). */
function bumpEnv(mat: Material | Material[] | null | undefined): void {
  const list = Array.isArray(mat) ? mat : mat ? [mat] : [];
  for (const m of list) {
    const sm = m as Material & { envMapIntensity?: number; name?: string };
    if (sm && "envMapIntensity" in sm) {
      sm.envMapIntensity = /glass/i.test(sm.name ?? "") ? 1.7 : 1.35;
    }
  }
}

/** Per-model geometry + placement metadata, extracted once from the GLB. */
export interface ModelRig {
  /** Merged multi-material body geometry (paint/glass/trim/livery/bars). */
  bodyGeometry: BufferGeometry;
  /** Materials aligned to the merged geometry's groups. */
  bodyMaterials: Material[];
  /** Wheel hub offsets [FL, FR, RL, RR] in body-local (three) space. */
  wheelOffsets: Vector3[];
  /** Wheel radius = hub height above ground. */
  wheelRadius: number;
  /** Body extents (for lamp placement + blob-shadow footprint). */
  rearZ: number;
  frontZ: number;
  halfWidth: number;
  lampY: number;
  headY: number;
  halfLength: number;
}

/** Shared wheel geometry reused across every car's wheels. */
interface SharedWheel {
  geometry: BufferGeometry;
  materials: Material[];
  refRadius: number;
}

function extractModelRig(scene: Object3D): ModelRig {
  scene.updateMatrixWorld(true);
  const bodyGeos: BufferGeometry[] = [];
  const bodyMats: Material[] = [];
  const offsets: Record<string, Vector3> = {};

  scene.traverse((o) => {
    if (WHEEL_NODE_RE.test(o.name)) {
      // Body node is at the origin, so world position == the hub's local offset.
      offsets[o.name] = o.getWorldPosition(new Vector3());
    }
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as Material & { name?: string };
    const name = (mat?.name ?? "").toLowerCase();
    if (WHEEL_MATERIALS.has(name)) return; // shared wheel, handled separately
    if (SKIP_BODY_MATERIALS.has(name)) return; // head/tail -> overlay lamps
    bumpEnv(mat);
    bodyGeos.push(mesh.geometry);
    bodyMats.push(mat);
  });

  // Merge with groups so one InstancedMesh + material array draws the whole body.
  const merged = bodyGeos.length ? mergeGeometries(bodyGeos, true) : null;
  const bodyGeometry = merged ?? bodyGeos[0]?.clone();
  if (!merged && bodyGeos.length > 1) {
    // Extremely unlikely (all prims share POSITION+NORMAL+index) — degrade to the
    // paint shell rather than crash, and surface it.
    console.warn("[vehicleFleet] body merge failed; using first primitive only");
  }
  const materials = merged ? bodyMats : bodyMats.slice(0, 1);
  bodyGeometry.computeBoundingBox();
  const bb = bodyGeometry.boundingBox ?? new Box3();
  const height = bb.max.y - bb.min.y;

  const wheelOffsets = WHEEL_ORDER.map((k) => offsets[k]?.clone() ?? new Vector3());
  const wheelRadius = wheelOffsets[0].y || 0.32;

  return {
    bodyGeometry,
    bodyMaterials: materials,
    wheelOffsets,
    wheelRadius,
    rearZ: bb.min.z,
    frontZ: bb.max.z,
    halfWidth: bb.max.x,
    halfLength: Math.max(bb.max.z, -bb.min.z),
    lampY: bb.min.y + height * 0.42,
    headY: bb.min.y + height * 0.3,
  };
}

function extractSharedWheel(scene: Object3D): SharedWheel {
  const parts: Record<string, { geo: BufferGeometry; mat: Material }> = {};
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as Material & { name?: string };
    const name = (mat?.name ?? "").toLowerCase();
    if (WHEEL_MATERIALS.has(name) && !parts[name]) {
      bumpEnv(mat);
      parts[name] = { geo: mesh.geometry, mat };
    }
  });
  const ordered = ["tire", "hubcap"].filter((k) => parts[k]).map((k) => parts[k]);
  const geos = ordered.map((p) => p.geo);
  // Always hand back a geometry WE own (merged, or a clone of the single part) —
  // disposeTrafficFleet frees it, and the drei cache's source geometry must not
  // be the thing we dispose.
  const merged = geos.length > 1 ? mergeGeometries(geos, true) : null;
  const geometry = merged ?? geos[0].clone();
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox ?? new Box3();
  // Wheel axis is local X; radius = half the Y (or Z) extent.
  const refRadius = (bb.max.y - bb.min.y) / 2 || 0.32;
  return {
    geometry,
    materials: merged ? ordered.map((p) => p.mat) : [ordered[0].mat],
    refRadius,
  };
}

function mix32(n: number): number {
  let h = (n + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministic model index from a vehicle id. Police ~1 in 15; everything else
 * spreads across the civilian pool. Stable across sessions (same id => same car).
 */
export function assignModel(id: number): number {
  const h = mix32(id);
  if (h % 15 === 0) return POLICE_INDEX;
  return h % CIVILIAN_COUNT;
}

/**
 * Deterministic CIVILIAN model index from an arbitrary seed (parked cars —
 * a parked police cruiser on every street would read wrong). Stable: same
 * seed => same model.
 */
export function assignCivilianModel(seed: number): number {
  return mix32(seed) % CIVILIAN_COUNT;
}

export interface TrafficFleet {
  /** One Object3D holding every fleet InstancedMesh; mount with <primitive>. */
  group: Group;
  /** Per model: its InstancedMesh (null when no vehicle uses it) + rig. */
  models: { mesh: InstancedMesh | null; rig: ModelRig; count: number }[];
  /** Shared wheel InstancedMesh (nVeh*4 instances). */
  wheel: InstancedMesh;
  /** veh index -> model index. */
  assign: Int32Array;
  /** veh index -> instance slot inside its model's InstancedMesh. */
  slot: Int32Array;
  /** veh index -> uniform wheel scale (model radius / shared-wheel radius). */
  wheelScale: Float32Array;
  /** veh index -> wheel roll radius (for speed·dt/r). */
  wheelRadius: Float32Array;

  // --- Parked pass (static; matrices written once by TrafficLayer) ---------
  /** Per model index: static body InstancedMesh (null when no parked car uses
   *  that model). Shares each model's merged geometry with `models`. */
  parkedMeshes: (InstancedMesh | null)[];
  /** Static shared wheel InstancedMesh (nPark*4), null when nPark = 0. */
  parkedWheel: InstancedMesh | null;
  /** parked index -> model index (civilian only). */
  parkedAssign: Int32Array;
  /** parked index -> instance slot inside its model's parked InstancedMesh. */
  parkedSlot: Int32Array;
  /** parked index -> uniform wheel scale. */
  parkedWheelScale: Float32Array;
}

const ZERO_MATRIX = new Float32Array(16); // all-zero => scale 0 => nothing drawn

function hideAll(mesh: InstancedMesh): void {
  for (let i = 0; i < mesh.count; i++) mesh.instanceMatrix.set(ZERO_MATRIX, i * 16);
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Build the instanced fleet from the loaded GLB scenes (FLEET order) and the
 * traffic vehicles. Instances start hidden (zero matrix); TrafficLayer positions
 * them on the first frame. `parkedModels` (model index per parking slot, from
 * assignCivilianModel) additionally builds the static parked pass over the
 * same rigs.
 */
export function buildTrafficFleet(
  scenes: Object3D[],
  vehicles: readonly TrafficVehicleState[],
  parkedModels: readonly number[] = [],
): TrafficFleet {
  const rigs = scenes.map(extractModelRig);
  const sharedWheel = extractSharedWheel(scenes[0]);
  const nVeh = vehicles.length;

  const assign = new Int32Array(nVeh);
  const slot = new Int32Array(nVeh);
  const wheelScale = new Float32Array(nVeh);
  const wheelRadius = new Float32Array(nVeh);
  const counts = new Array(FLEET.length).fill(0);

  for (let i = 0; i < nVeh; i++) {
    const m = assignModel(vehicles[i].id);
    assign[i] = m;
    slot[i] = counts[m]++;
  }

  const group = new Group();
  group.name = "traffic-fleet";

  const models = rigs.map((rig, m) => {
    const count = counts[m];
    if (count === 0) return { mesh: null, rig, count };
    const mesh = new InstancedMesh(rig.bodyGeometry, rig.bodyMaterials, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = `traffic-body-${FLEET[m]}`;
    hideAll(mesh);
    group.add(mesh);
    return { mesh, rig, count };
  });

  const wheel = new InstancedMesh(
    sharedWheel.geometry,
    sharedWheel.materials,
    Math.max(1, nVeh * 4),
  );
  wheel.instanceMatrix.setUsage(DynamicDrawUsage);
  wheel.frustumCulled = false;
  wheel.name = "traffic-wheels";
  hideAll(wheel);
  group.add(wheel);

  for (let i = 0; i < nVeh; i++) {
    const rig = rigs[assign[i]];
    wheelScale[i] = rig.wheelRadius / sharedWheel.refRadius;
    wheelRadius[i] = rig.wheelRadius;
  }

  // --- Parked pass: static instances over the SAME rigs/geometry ------------
  const nPark = parkedModels.length;
  const parkedAssign = new Int32Array(nPark);
  const parkedSlot = new Int32Array(nPark);
  const parkedWheelScale = new Float32Array(nPark);
  const parkedCounts = new Array(FLEET.length).fill(0);
  for (let i = 0; i < nPark; i++) {
    const m = parkedModels[i];
    parkedAssign[i] = m;
    parkedSlot[i] = parkedCounts[m]++;
    parkedWheelScale[i] = rigs[m].wheelRadius / sharedWheel.refRadius;
  }

  const parkedMeshes = rigs.map((rig, m): InstancedMesh | null => {
    const count = parkedCounts[m];
    if (count === 0) return null;
    // Static draw usage (default) — placed once, never animated.
    const mesh = new InstancedMesh(rig.bodyGeometry, rig.bodyMaterials, count);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.name = `traffic-parked-body-${FLEET[m]}`;
    hideAll(mesh);
    group.add(mesh);
    return mesh;
  });

  let parkedWheel: InstancedMesh | null = null;
  if (nPark > 0) {
    parkedWheel = new InstancedMesh(
      sharedWheel.geometry,
      sharedWheel.materials,
      nPark * 4,
    );
    parkedWheel.frustumCulled = false;
    parkedWheel.name = "traffic-parked-wheels";
    hideAll(parkedWheel);
    group.add(parkedWheel);
  }

  return {
    group,
    models,
    wheel,
    assign,
    slot,
    wheelScale,
    wheelRadius,
    parkedMeshes,
    parkedWheel,
    parkedAssign,
    parkedSlot,
    parkedWheelScale,
  };
}

/**
 * Free the buffers this fleet OWNS — instance attributes (moving + parked) +
 * the merged geometries (disposed once even though moving and parked meshes
 * share them). Materials and source primitive geometries belong to the drei
 * GLTF cache (shared, survive remounts) and are deliberately NOT disposed here.
 */
export function disposeTrafficFleet(fleet: TrafficFleet): void {
  for (let m = 0; m < fleet.models.length; m++) {
    fleet.models[m].mesh?.dispose();
    fleet.parkedMeshes[m]?.dispose();
    // Merged body geometry is ours regardless of whether any mesh used it.
    fleet.models[m].rig.bodyGeometry.dispose();
  }
  fleet.wheel.dispose();
  fleet.parkedWheel?.dispose();
  // Shared wheel geometry backs both wheel meshes — dispose once.
  fleet.wheel.geometry.dispose();
}
