"use client";

/**
 * CityBuildings — instanced Kenney building modules placed on the OSM
 * footprints (world.buildingInstances). One InstancedMesh per model, all
 * sharing a single atlas material → ~12 draw calls for the whole city.
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
  // Instances span the whole district; the base geometry's bounding sphere is
  // at the origin, so default frustum culling would drop them all.
  mesh.frustumCulled = false;
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
    const material = new THREE.MeshStandardMaterial({
      map: models.texture,
      roughness: 0.82,
      metalness: 0,
    });
    const castShadow = preset.castShadows !== "none";
    const buckets: BuildingInstancePlacement[][] = models.geometries.map(() => []);
    for (const p of world.buildingInstances) {
      (buckets[p.model] ?? buckets[0])!.push(p);
    }
    const meshes = models.geometries.map((geometry, i) =>
      makeInstanced(
        geometry,
        material,
        buckets[i]!,
        castShadow,
        preset.receiveShadows,
        `city-buildings-${i}`,
      ),
    );
    return { material, meshes };
  }, [models, world.buildingInstances, preset.castShadows, preset.receiveShadows]);

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
