"use client";

/**
 * ScenarioObstacles — S0 precise hittable obstacles for scenario tasks
 * (doc 76 §0: "parked cars in scenarios must be HITTABLE with precise boxes,
 * not the 150-cap curb-decoration pass"; §12 founder ruling: "low-speed/
 * reverse feel + precise colliders NOW").
 *
 * A scenario obstacle set is a SPEC LIST — plain data in district space
 * ({model|prop|wall, x, y, headingDeg}) — rendered through the machinery that
 * already exists and collided through tight FIXED rapier bodies:
 *
 *  - PARKED CARS reuse the traffic fleet's instanced GLB rigs
 *    (buildTrafficFleet's static parked pass — same draw-call budget rules,
 *    same palette tints), but unlike TrafficLayer's curb-decoration pass each
 *    car gets a FIXED cuboid collider matched to ITS model's measured bbox
 *    (rig.halfWidth / rig.halfLength / merged-geometry top — a vela_h3 is
 *    1.62 m wide, a kargo_v van is not). Fixed bodies are the cheap kind:
 *    no kinematic pose writes, no per-frame cost, contact pairs only with
 *    the one dynamic player chassis.
 *  - PROPS (traffic cone / полигон marker pole — tools/blender/
 *    scenario_props.py, doc 74 noted the slalom cones missing) render as one
 *    InstancedMesh per authored primitive and collide as slim cuboids sized
 *    to the shaft the bumper can actually reach.
 *  - WALLS are code-geometry boxes (parking-garage pillars/walls) with exact
 *    cuboid colliders.
 *
 * COLLISION CLASSIFICATION (the existing userData path): parked cars carry
 * the NpcColliders userData tag with kind "vehicle" (npcId >= 3000 — ambient
 * agents are < 1000, staged actors >= 1000), so VehicleRig's onCollisionEnter
 * grades `withWhat: "vehicle"`. Props and walls stay UNTAGGED — the rig's
 * fallback classifies them "staticObject". No grading code changes.
 *
 * CONTACT THRESHOLD: street driving ignores contacts under 10 km/h
 * (VehicleRig COLLISION_MIN_KMH — nudge tolerance). In a parking task a
 * 2 km/h bumper touch on a cone IS the mistake, so scenario lessons pass
 * PARKING_COLLISION_MIN_KMH (0) into VehicleRig's `collisionMinKmh` prop.
 * That seam is additive — every existing scene keeps the street default.
 *
 * Coordinates: district (x east, y north, heading 0 = north cw) → three.js
 * (x, −z), yawRad = π − heading (the TrafficLayer/NpcColliders mapping).
 */

import { useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import {
  CanvasTexture,
  Group,
  InstancedMesh,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D as AnyObject3D,
} from "three";
import {
  assignCivilianModel,
  buildTrafficFleet,
  disposeTrafficFleet,
  DRACO_DECODER_PATH,
  FLEET,
  FLEET_URLS,
  type ModelRig,
  type TrafficFleet,
} from "@/modules/sim/traffic";
import type { NpcColliderUserData } from "./NpcColliders";

// ---------------------------------------------------------------------------
// Spec types (data-only — a ScenarioSpec's obstacle list serializes to JSON)
// ---------------------------------------------------------------------------

/** Common pose fields, district space (x east, y north, heading 0=N cw). */
interface ObstaclePose {
  x: number;
  y: number;
  headingDeg: number;
}

/** A parked fleet vehicle with a tight per-model collider. */
export interface ScenarioVehicleObstacle extends ObstaclePose {
  kind: "vehicle";
  /**
   * Fleet model basename ("vela_h3", "corva_s", "kargo_v", …). Absent or
   * unknown → deterministic civilian pick from `seed` (parked pool — no
   * police/route minibus/hero SUV).
   */
  model?: string;
  /** Stable seed: paint palette pick (+ fallback model). Default: list index. */
  seed?: number;
  /**
   * HELD DRESSING: render the body through the same instanced parked pass but
   * mount NO collider — the TrafficLayer curb-decoration convention (visible,
   * not hittable). For drills whose collision consequence is authored in the
   * trace channel (recorder ObstacleRect2D) / objective zones, a purely
   * visual body must not add a crash surface the grading never authored
   * (scenarioSceneryProps.ts). Absent = hittable (the S0 default).
   */
  visual?: boolean;
}

export type ScenarioPropKind = "cone" | "pole";

/** A small streetscape obstacle (traffic cone / полигон marker pole). */
export interface ScenarioPropObstacle extends ObstaclePose {
  kind: "prop";
  prop: ScenarioPropKind;
}

/** A wall/pillar segment running along its heading. */
export interface ScenarioWallObstacle extends ObstaclePose {
  kind: "wall";
  /** Length along the heading, m. */
  lengthM: number;
  /** Default 1.2 m (parking-garage half-wall). */
  heightM?: number;
  /** Default 0.3 m. */
  thicknessM?: number;
}

export type ScenarioObstacleSpec =
  | ScenarioVehicleObstacle
  | ScenarioPropObstacle
  | ScenarioWallObstacle;

// ---------------------------------------------------------------------------
// Contact-grading constants (the VehicleRig `collisionMinKmh` seam)
// ---------------------------------------------------------------------------

/**
 * Threshold for parking scenarios: ANY contact grades (a 2 km/h cone touch is
 * the mistake being taught). Pass into VehicleRig's `collisionMinKmh`; street
 * scenes keep the default 10 km/h nudge tolerance by not passing anything.
 */
export const PARKING_COLLISION_MIN_KMH = 0;

/** Scenario-obstacle npcId space (ambient < 1000, staged >= 1000). */
export const SCENARIO_OBSTACLE_NPC_ID_BASE = 3000;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in scenarioObstacles.test.ts)
// ---------------------------------------------------------------------------

/** District heading (0 = north, cw) → three.js yaw about +Y. */
export function obstacleYawRad(headingDeg: number): number {
  return Math.PI - (headingDeg * Math.PI) / 180;
}

/** Resolve a vehicle spec to a fleet model index (civilian fallback). */
export function resolveVehicleModel(model: string | undefined, seed: number): number {
  if (model) {
    const idx = (FLEET as readonly string[]).indexOf(model);
    if (idx >= 0) return idx;
  }
  return assignCivilianModel(seed);
}

export interface CuboidDims {
  /** Collider half-extents, m (x = width, y = height, z = length). */
  half: { x: number; y: number; z: number };
  /** Collider centre height above ground, m. */
  centerY: number;
}

/**
 * Tight vehicle cuboid from a rig's MEASURED extents (geometry is authored
 * ground-relative, so the roof line is the bbox top).
 */
export function vehicleColliderDims(
  halfWidth: number,
  halfLength: number,
  topY: number,
): CuboidDims {
  return {
    half: { x: halfWidth, y: topY / 2, z: halfLength },
    centerY: topY / 2,
  };
}

/**
 * Prop colliders — sized to what a bumper (chassis box bottom ≈ 0.28 m) can
 * actually reach, NOT the ground-level base plate (tools/blender/
 * scenario_props.py documents the same contract):
 *  - cone: 0.50 m tall, body ≈ Ø12–16 cm at bumper heights → 16 cm square.
 *  - pole: 1.5 m marker (колче), Ø5 cm shaft → 8 cm square (a hair generous
 *    so a brushing pass registers instead of tunnelling past a 5 cm sliver).
 */
export const PROP_COLLIDERS: Record<ScenarioPropKind, CuboidDims> = {
  cone: { half: { x: 0.08, y: 0.25, z: 0.08 }, centerY: 0.25 },
  pole: { half: { x: 0.04, y: 0.75, z: 0.04 }, centerY: 0.75 },
};

/** Authored prop GLBs (tools/blender/scenario_props.py → glb:optimize). */
export const PROP_URLS: Record<ScenarioPropKind, string> = {
  cone: "/sim/props/cone.glb",
  pole: "/sim/props/training_pole.glb",
};

const WALL_DEFAULT_HEIGHT_M = 1.2;
const WALL_DEFAULT_THICKNESS_M = 0.3;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const UP = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0); // wheel spin axis (GLB wheels are X-axial)
const BLOB_Y = 0.03;

/** Soft radial-gradient decal for the fake ground shadow (mirrors
 *  TrafficLayer's parked pass so scenario cars ground identically). */
function makeBlobTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

/** Roof-line of a rig = top of the merged body ∪ paint bboxes (both are
 *  computed by the fleet extractor; ground-relative geometry ⇒ minY ≈ 0). */
function rigTopY(rig: ModelRig): number {
  let top = rig.bodyGeometry.boundingBox?.max.y ?? 1.45;
  const paintTop = rig.paint?.geometry.boundingBox?.max.y;
  if (paintTop !== undefined && paintTop > top) top = paintTop;
  return top;
}

interface ResolvedVehicle {
  spec: ScenarioVehicleObstacle;
  model: number;
  seed: number;
  yawRad: number;
  dims: CuboidDims;
  tag: NpcColliderUserData;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ScenarioObstaclesProps {
  obstacles: readonly ScenarioObstacleSpec[];
  /** Hero-paint tier passthrough (LessonScene passes level === "high"). */
  clearcoat?: boolean;
}

export function ScenarioObstacles({ obstacles, clearcoat = true }: ScenarioObstaclesProps) {
  const vehicles = useMemo(
    () => obstacles.filter((o): o is ScenarioVehicleObstacle => o.kind === "vehicle"),
    [obstacles],
  );
  const cones = useMemo(
    () =>
      obstacles.filter(
        (o): o is ScenarioPropObstacle => o.kind === "prop" && o.prop === "cone",
      ),
    [obstacles],
  );
  const poles = useMemo(
    () =>
      obstacles.filter(
        (o): o is ScenarioPropObstacle => o.kind === "prop" && o.prop === "pole",
      ),
    [obstacles],
  );
  const walls = useMemo(
    () => obstacles.filter((o): o is ScenarioWallObstacle => o.kind === "wall"),
    [obstacles],
  );

  return (
    <group name="scenario-obstacles">
      {vehicles.length > 0 ? (
        <ObstacleVehicles vehicles={vehicles} clearcoat={clearcoat} />
      ) : null}
      {cones.length > 0 ? <PropInstances kind="cone" placements={cones} /> : null}
      {poles.length > 0 ? <PropInstances kind="pole" placements={poles} /> : null}
      {walls.map((w, i) => (
        <ObstacleWall key={`wall-${i}`} spec={w} />
      ))}
    </group>
  );
}

// --- Parked vehicles over the instanced fleet rigs ---------------------------

function ObstacleVehicles({
  vehicles,
  clearcoat,
}: {
  vehicles: ScenarioVehicleObstacle[];
  clearcoat: boolean;
}) {
  const gltfs = useGLTF(FLEET_URLS, DRACO_DECODER_PATH) as unknown as Array<{
    scene: AnyObject3D;
  }>;

  // Resolve specs → models/seeds ONCE (stable identity per list).
  const resolvedBase = useMemo(
    () =>
      vehicles.map((spec, i) => {
        const seed = spec.seed ?? i;
        return { spec, seed, model: resolveVehicleModel(spec.model, seed) };
      }),
    [vehicles],
  );

  // The fleet: zero moving vehicles, every obstacle in the static parked pass
  // (palette tints are written by the builder from each placement's seed).
  const fleet: TrafficFleet = useMemo(
    () =>
      buildTrafficFleet(
        gltfs.map((g) => g.scene),
        [],
        resolvedBase.map((r) => ({ model: r.model, seed: r.seed })),
        { clearcoat },
      ),
    [gltfs, resolvedBase, clearcoat],
  );
  useEffect(() => () => disposeTrafficFleet(fleet), [fleet]);

  // Collider data from the MEASURED rigs (per-model tight cuboids).
  const resolved: ResolvedVehicle[] = useMemo(
    () =>
      resolvedBase.map((r, i) => {
        const rig = fleet.models[r.model].rig;
        return {
          ...r,
          yawRad: obstacleYawRad(r.spec.headingDeg),
          dims: vehicleColliderDims(rig.halfWidth, rig.halfLength, rigTopY(rig)),
          tag: {
            npcCollider: true,
            kind: "vehicle",
            npcId: SCENARIO_OBSTACLE_NPC_ID_BASE + i,
          } satisfies NpcColliderUserData,
        };
      }),
    [fleet, resolvedBase],
  );

  const blobTex = useMemo(() => makeBlobTexture(), []);
  useEffect(() => () => blobTex.dispose(), [blobTex]);

  // Blob-shadow instanced mesh, owned imperatively next to the fleet group.
  const blob = useMemo(() => {
    const mesh = new InstancedMesh(undefined, undefined, resolved.length);
    mesh.frustumCulled = false;
    mesh.name = "scenario-obstacle-blobs";
    return mesh;
  }, [resolved.length]);
  useEffect(() => () => blob.dispose(), [blob]);

  // Static matrices — written ONCE per fleet/list (TrafficLayer's parked
  // pass, verbatim discipline: body+paint at the tarmac, wheels at the rig
  // hubs with a deterministic roll phase, elliptical blob shadow).
  useLayoutEffect(() => {
    const dummy = new Object3D();
    const qYaw = new Quaternion();
    const qRoll = new Quaternion();
    const qFlat = new Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2);
    const wheel = fleet.parkedWheel;
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      const m = fleet.parkedAssign[i];
      const rig = fleet.models[m].rig;
      const s = fleet.parkedSlot[i];
      const tx = r.spec.x;
      const tz = -r.spec.y;
      const yaw = r.yawRad;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, yaw, 0);
      dummy.position.set(tx, 0, tz);
      dummy.updateMatrix();
      fleet.parkedMeshes[m]?.setMatrixAt(s, dummy.matrix);
      fleet.parkedPaintMeshes[m]?.setMatrixAt(s, dummy.matrix);
      const ws = fleet.parkedWheelScale[i];
      qYaw.setFromAxisAngle(UP, yaw);
      for (let w = 0; w < 4; w++) {
        const off = rig.wheelOffsets[w];
        qRoll.setFromAxisAngle(AXIS_X, (i * 4 + w) * 2.4);
        dummy.quaternion.copy(qYaw).multiply(qRoll);
        dummy.scale.set(ws, ws, ws);
        dummy.position.set(
          tx + off.x * cos + off.z * sin,
          off.y,
          tz - off.x * sin + off.z * cos,
        );
        dummy.updateMatrix();
        wheel?.setMatrixAt(i * 4 + w, dummy.matrix);
      }
      dummy.quaternion.copy(qYaw).multiply(qFlat);
      dummy.scale.set(rig.halfWidth + 0.34, rig.halfLength + 0.4, 1);
      dummy.position.set(tx, BLOB_Y, tz);
      dummy.updateMatrix();
      blob.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of fleet.parkedMeshes) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of fleet.parkedPaintMeshes) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
    if (wheel) wheel.instanceMatrix.needsUpdate = true;
    blob.instanceMatrix.needsUpdate = true;
  }, [fleet, resolved, blob]);

  return (
    <>
      <primitive object={fleet.group} />
      <primitive object={blob}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial
          color="#000000"
          alphaMap={blobTex}
          transparent
          opacity={0.5}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </primitive>
      {resolved.map((r, i) =>
        // `visual` dressing renders in the pass above but mounts NO body —
        // its consequence channel (if any) is authored elsewhere.
        r.spec.visual ? null : (
          <RigidBody
            key={`sc-veh-${i}`}
            type="fixed"
            colliders={false}
            position={[r.spec.x, 0, -r.spec.y]}
            rotation={[0, r.yawRad, 0]}
            userData={r.tag}
          >
            <CuboidCollider
              args={[r.dims.half.x, r.dims.half.y, r.dims.half.z]}
              position={[0, r.dims.centerY, 0]}
              friction={0.5}
              restitution={0.05}
            />
          </RigidBody>
        ),
      )}
    </>
  );
}

// --- Small props (cone / pole): instanced GLB + slim fixed cuboids ----------

function PropInstances({
  kind,
  placements,
}: {
  kind: ScenarioPropKind;
  placements: ScenarioPropObstacle[];
}) {
  const gltf = useGLTF(PROP_URLS[kind], DRACO_DECODER_PATH) as unknown as {
    scene: AnyObject3D;
  };

  // One InstancedMesh per authored primitive (props are authored base-at-
  // origin with export_apply, so primitive geometry is already in prop space).
  // We OWN the InstancedMeshes (instance buffers) — the geometry/materials
  // belong to the drei GLTF cache and are never disposed here.
  const group = useMemo(() => {
    const prims: Array<{ geometry: BufferGeometry; material: Material }> = [];
    gltf.scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      prims.push({ geometry: mesh.geometry, material: mat });
    });
    const g = new Group();
    g.name = `scenario-props-${kind}`;
    const dummy = new Object3D();
    for (const prim of prims) {
      const mesh = new InstancedMesh(prim.geometry, prim.material, placements.length);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i];
        dummy.position.set(p.x, 0, -p.y);
        dummy.rotation.set(0, obstacleYawRad(p.headingDeg), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      g.add(mesh);
    }
    return g;
  }, [gltf, placements, kind]);
  useEffect(
    () => () => {
      for (const child of group.children) {
        (child as InstancedMesh).dispose(); // instance buffers only
      }
    },
    [group],
  );

  const dims = PROP_COLLIDERS[kind];
  return (
    <>
      <primitive object={group} />
      {placements.map((p, i) => (
        <RigidBody
          key={`sc-${kind}-${i}`}
          type="fixed"
          colliders={false}
          position={[p.x, 0, -p.y]}
          rotation={[0, obstacleYawRad(p.headingDeg), 0]}
        >
          {/* Untagged ⇒ VehicleRig classifies contact as "staticObject". */}
          <CuboidCollider
            args={[dims.half.x, dims.half.y, dims.half.z]}
            position={[0, dims.centerY, 0]}
            friction={0.6}
            restitution={0.1}
          />
        </RigidBody>
      ))}
    </>
  );
}

// --- Walls / pillars ---------------------------------------------------------

function ObstacleWall({ spec }: { spec: ScenarioWallObstacle }) {
  const height = spec.heightM ?? WALL_DEFAULT_HEIGHT_M;
  const thickness = spec.thicknessM ?? WALL_DEFAULT_THICKNESS_M;
  const yaw = obstacleYawRad(spec.headingDeg);
  return (
    <RigidBody
      type="fixed"
      colliders={false}
      position={[spec.x, 0, -spec.y]}
      rotation={[0, yaw, 0]}
    >
      {/* Length runs along the heading (local +Z). Untagged ⇒ staticObject. */}
      <CuboidCollider
        args={[thickness / 2, height / 2, spec.lengthM / 2]}
        position={[0, height / 2, 0]}
        friction={0.6}
        restitution={0.05}
      />
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[thickness, height, spec.lengthM]} />
        <meshStandardMaterial color="#8d8a83" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}

// Warm the drei cache so scenario props decode off the first-mount path
// (mirrors TrafficLayer's fleet preload).
useGLTF.preload(PROP_URLS.cone, DRACO_DECODER_PATH);
useGLTF.preload(PROP_URLS.pole, DRACO_DECODER_PATH);
