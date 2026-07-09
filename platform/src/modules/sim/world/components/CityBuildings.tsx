"use client";

/**
 * CityBuildings — instanced Kenney building modules placed on the OSM
 * footprints (world.buildingInstances). All meshes share a single atlas
 * material, and instances are chunked into a 128 m spatial grid: one
 * InstancedMesh per (model, chunk). Each chunk mesh gets an instance-aware
 * bounding sphere (computeBoundingSphere), so frustum culling works again and
 * off-screen chunks (most of the city, given a ground-level 90° FOV) are
 * skipped in both the color and the shadow pass. This restores GPU headroom
 * vs. the previous "one mesh per model, culling disabled, whole city always
 * drawn" layout.
 *
 * Falls back to nothing (the procedural walls are gone) until the GLBs load,
 * so a brief empty-lot moment is expected on first paint. Non-uniform per-
 * instance scale means we compose matrices here rather than via the shared
 * createInstancedMesh helper (which only does uniform scale).
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { BuildingInstancePlacement, WorldGeometry } from "../types";
import { preloadCityModels, useCityModels } from "./cityModels";
import type { QualityPreset } from "./quality";

// Start fetching + baking the GLBs as soon as this module loads (no-op on the
// server), before any <CityBuildings/> mounts.
preloadCityModels();

/** Spatial chunk size for frustum-cullable building groups (meters). */
const CHUNK_M = 128;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: BuildingInstancePlacement[],
  castShadow: boolean,
  receiveShadow: boolean,
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    _pos.set(p.position[0], p.position[1], p.position[2]);
    _quat.setFromAxisAngle(_Y, p.yaw);
    _scale.set(p.scale[0], p.scale[1], p.scale[2]);
    _mat.compose(_pos, _quat, _scale);
    mesh.setMatrixAt(i, _mat);
  }
  mesh.instanceMatrix.needsUpdate = true;
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
}: {
  world: WorldGeometry;
  preset: QualityPreset;
}) {
  const models = useCityModels();

  const assets = useMemo(() => {
    if (!models) return null;
    // Bump the shared atlas anisotropy to this quality tier (crisper facades at
    // grazing angles); safe to mutate the cache-owned texture in place.
    const aniso = Math.min(8, Math.max(1, preset.anisotropy));
    if (models.texture.anisotropy !== aniso) {
      models.texture.anisotropy = aniso;
      models.texture.needsUpdate = true;
    }
    const material = new THREE.MeshStandardMaterial({
      map: models.texture,
      roughness: 0.82,
      metalness: 0,
    });
    const castShadow = preset.castShadows !== "none";

    // Bucket placements by (model, 128 m chunk). Only non-empty buckets become
    // meshes, so empty sky over the district costs nothing.
    const buckets = new Map<string, { model: number; list: BuildingInstancePlacement[] }>();
    for (const p of world.buildingInstances) {
      const model = models.geometries[p.model] ? p.model : 0;
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
    const meshes: THREE.InstancedMesh[] = [];
    for (const [key, bucket] of buckets) {
      meshes.push(
        makeInstanced(
          models.geometries[bucket.model]!,
          material,
          bucket.list,
          castShadow,
          preset.receiveShadows,
          `city-buildings-${key}`,
        ),
      );
    }
    return { material, meshes };
  }, [models, world.buildingInstances, preset.anisotropy, preset.castShadows, preset.receiveShadows]);

  useEffect(
    () => () => {
      if (!assets) return;
      assets.material.dispose();
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
