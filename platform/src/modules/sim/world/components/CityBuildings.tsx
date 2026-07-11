"use client";

/**
 * CityBuildings — instanced authored district-kit-v3 buildings (towers +
 * retail pavilions) placed on the OSM footprints (world.buildingInstances).
 * Each model carries multiple PBR materials, so it is drawn as one
 * InstancedMesh PER material group (glass / concrete shell / podium / lit
 * windows / …), all sharing the SAME per-instance matrices. The glass
 * materials reflect the scene HDRI (scene.environment, set by the scene's
 * <Environment>) automatically via MeshStandardMaterial's envMap sampling,
 * and the emissive `glass_lit` windows glow, brighter at night.
 *
 * Instances are chunked into a 128 m spatial grid: one InstancedMesh per
 * (model, material group, chunk). Each chunk mesh gets an instance-aware
 * bounding sphere (computeBoundingSphere), so frustum culling works and
 * off-screen chunks (most of the city, given a ground-level ~90° FOV) are
 * skipped in both the color and the shadow pass.
 *
 * Falls back to nothing (the procedural walls are gone) until the GLBs load,
 * so a brief empty-lot moment is expected on first paint. Non-uniform per-
 * instance scale means we compose matrices here rather than via the shared
 * createInstancedMesh helper (which only does uniform scale).
 */

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { BuildingInstancePlacement, WorldGeometry } from "../types";
import { useFacadeTextures, type FacadeSetName } from "../textures/facadeTextures";
import { preloadCityModels, useCityModels } from "./cityModels";
import type { QualityPreset } from "./quality";

// Start fetching + baking the GLBs as soon as this module loads (no-op on the
// server), before any <CityBuildings/> mounts.
preloadCityModels();

/** Spatial chunk size for frustum-cullable building groups (meters). Larger =
 *  fewer (model, material, chunk) InstancedMeshes = fewer draw calls, at the
 *  cost of coarser culling. Authored glass towers carry ~5 material groups each,
 *  so the chunk count multiplies the draw budget — keep it moderate. */
const CHUNK_M = 200;

/** Emissive intensity of the lit-window materials by time of day. Day 2.0
 *  (doc 71 §4.3): golden-hour interiors must cross the composer's 0.9 bloom
 *  threshold. The v4 kit bakes lit windows into the bay/trim emissive maps
 *  (materials `bay_*` + `trim`); `glass_lit` is kept for older kit GLBs. */
const DAY_GLOW = 2.0;
const NIGHT_GLOW = 3.2;

/** Materials whose emissive map carries baked lit windows / signage. */
function isLitWindowMaterial(name: string): boolean {
  return name === "glass_lit" || name === "trim" || name.startsWith("bay_");
}

/** Baked facade set for a kit material name, if it is texture-driven. */
function facadeSetFor(name: string): FacadeSetName | null {
  if (name === "trim") return "trim";
  if (name === "bay_grid" || name === "bay_strip" || name === "bay_curtain" || name === "bay_band") {
    return name;
  }
  return null;
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);
const _tint = new THREE.Color();

/** Per-instance facade tint via `instanceColor` (doc 71 Phase 1 / QW-D):
 *  ±9 % brightness + a subtle warm/cool split so repeated instances of a
 *  model stop being pixel-identical. Zero extra draw calls; multiplies
 *  diffuse only (emissive untouched in r185). Keyed on a deterministic hash
 *  of the instance index — the SAME placements array feeds every material
 *  group of a model, so all groups of one building tint identically. */
function tintFor(i: number): THREE.Color {
  const h = ((i + 1) * 2654435761) >>> 0;
  const lum = 0.9 + 0.18 * ((h & 0xff) / 255);
  const warm = 0.985 + 0.03 * (((h >> 8) & 0xff) / 255);
  return _tint.setRGB(lum * warm, lum, lum * (2.0 - warm));
}

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: BuildingInstancePlacement[],
  castShadow: boolean,
  receiveShadow: boolean,
  name: string,
  tint: boolean,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    _pos.set(p.position[0], p.position[1], p.position[2]);
    _quat.setFromAxisAngle(_Y, p.yaw);
    _scale.set(p.scale[0], p.scale[1], p.scale[2]);
    _mat.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat);
    if (tint) mesh.setColorAt(i, tintFor(i));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.matrixAutoUpdate = false;
  // Instance-aware bounding sphere (covers just this chunk's instances) so
  // three's Frustum.intersectsObject can cull the whole chunk when it's off
  // screen. Without this the per-chunk mesh would fall back to the unit-height
  // base geometry sphere at the origin and mis-cull.
  mesh.frustumCulled = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

export function CityBuildings({
  world,
  preset,
  night = false,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  night?: boolean;
}) {
  const models = useCityModels();
  const gl = useThree((s) => s.gl);
  // Shared baked facade sets (one GPU copy district-wide — same cache the
  // facade prisms in StaticWorld consume). The kit GLBs ship image-free.
  const facadeSets = useFacadeTextures(gl, 8);

  // Wire the shared textures onto the named kit materials (bay_* / trim).
  // Everything is set explicitly — the image-free GLB factors are noise:
  // color/roughness/metalness 1 so the maps rule; emissive white so the
  // day/night glow effect below owns intensity; ORM fills aoMap +
  // roughnessMap + metalnessMap from ONE texture (R=AO, G=rough, B=metal).
  useEffect(() => {
    if (!models || !facadeSets) return;
    for (const groups of models.models) {
      for (const g of groups) {
        const setName = facadeSetFor(g.name);
        if (!setName) continue;
        const set = facadeSets[setName];
        const m = g.material;
        if (m.map === set.color) continue; // already wired
        m.map = set.color;
        m.normalMap = set.normal;
        m.aoMap = set.orm;
        m.aoMapIntensity = 1.2;
        m.roughnessMap = set.orm;
        m.metalnessMap = set.orm;
        m.emissiveMap = set.emissive;
        m.emissive.setRGB(1, 1, 1);
        m.color.setRGB(1, 1, 1);
        m.roughness = 1;
        m.metalness = 1;
        // Bays mix concrete + glass panes in one map (metal/rough channels
        // pick the response); middle-ground env punch. Trim is mostly stone.
        m.envMapIntensity = setName === "trim" ? 1.0 : 1.5;
        m.needsUpdate = true;
      }
    }
  }, [models, facadeSets]);

  const assets = useMemo(() => {
    if (!models) return null;
    // Buildings cast shadows only on the "full" (high/discrete-GPU) tier. The
    // authored towers are ~5 InstancedMeshes each; casting them all on the med
    // tier (castShadows "buildings") doubles the tower draw budget in the shadow
    // pass and was the main post-glass FPS regression. They still RECEIVE shadows.
    const castShadow = preset.castShadows === "full";

    // Bucket placements by (model, 128 m chunk). Only non-empty buckets become
    // meshes, so empty sky over the district costs nothing.
    const buckets = new Map<string, { model: number; list: BuildingInstancePlacement[] }>();
    for (const p of world.buildingInstances) {
      const model = models.models[p.model] ? p.model : 0;
      const cx = Math.floor(p.position[0] / CHUNK_M);
      const cz = Math.floor(p.position[2] / CHUNK_M);
      const key = `${model}:${cx}:${cz}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { model, list: [] };
        buckets.set(key, bucket);
      }
      bucket.list.push(p);
    }

    // One InstancedMesh per (model, material group, chunk): every group of a
    // model reuses the same per-instance matrices but its own geometry+material.
    const meshes: THREE.InstancedMesh[] = [];
    for (const [key, bucket] of buckets) {
      const groups = models.models[bucket.model];
      if (!groups) continue;
      for (const grp of groups) {
        meshes.push(
          makeInstanced(
            grp.geometry,
            grp.material,
            bucket.list,
            castShadow,
            preset.receiveShadows,
            `city-buildings-${key}-${grp.name}`,
            // Tint the matte shells only; glass groups (glass_dark/
            // glass_bronze/glass_lit) keep physically-consistent reflections
            // and untinted emissive windows.
            !grp.name.startsWith("glass"),
          ),
        );
      }
    }
    return { meshes };
  }, [models, world.buildingInstances, preset.castShadows, preset.receiveShadows]);

  // Night glow — tweak the shared emissive window materials in place (cheap;
  // no mesh rebuild). Materials are cache-owned, like the previous atlas
  // texture. Covers the baked bay/trim emissive maps (v4 kit) and glass_lit.
  useEffect(() => {
    if (!models) return;
    const want = night ? NIGHT_GLOW : DAY_GLOW;
    for (const groups of models.models) {
      for (const g of groups) {
        if (isLitWindowMaterial(g.name) && g.material.emissiveIntensity !== want) {
          g.material.emissiveIntensity = want;
          g.material.needsUpdate = true;
        }
      }
    }
  }, [models, night]);

  useEffect(
    () => () => {
      // Dispose only our InstancedMeshes; geometries + materials are cache-owned.
      if (!assets) return;
      for (const m of assets.meshes) m.dispose();
    },
    [assets],
  );

  if (!assets) return null;
  return (
    <group name="city-buildings">
      {assets.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}
