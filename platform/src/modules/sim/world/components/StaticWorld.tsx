"use client";

/**
 * StaticWorld — the merged, non-instanced ground meshes: terrain, asphalt
 * (ribbons + junction patches), sidewalks and markings. Buildings are now drawn
 * by <CityBuildings/> (instanced Kenney models); the procedural wall/roof mesh
 * data still exists in WorldGeometry (as the collider source) but is no longer
 * rendered here.
 *
 * Materials are declared in JSX; geometries and canvas textures are memoized and
 * disposed on change. Real CC0 PBR sets replace the procedural canvas textures
 * once they resolve.
 */

import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import type { WorldGeometry } from "../types";
import {
  makeAsphaltTexture,
  makeGrassTexture,
  makeSidewalkTexture,
} from "../textures/canvasTextures";
import { usePbrSet } from "../textures/pbrTextures";
import { disposeAll, meshDataToGeometry } from "./three-helpers";
import type { QualityPreset } from "./quality";

interface WorldTextures {
  asphalt: THREE.Texture;
  sidewalk: THREE.Texture;
  grass: THREE.Texture;
}

function useWorldTextures(preset: QualityPreset): WorldTextures {
  const textures = useMemo<WorldTextures>(() => {
    const withAniso = <T extends THREE.Texture>(t: T): T => {
      t.anisotropy = preset.anisotropy;
      return t;
    };
    return {
      asphalt: withAniso(makeAsphaltTexture(preset.textureSize)),
      sidewalk: withAniso(makeSidewalkTexture(Math.min(512, preset.textureSize))),
      grass: withAniso(makeGrassTexture(preset.textureSize)),
    };
  }, [preset]);

  useEffect(
    () => () => {
      disposeAll([textures.asphalt, textures.sidewalk, textures.grass]);
    },
    [textures],
  );
  return textures;
}

interface WorldGeometries {
  road: THREE.BufferGeometry;
  junctions: THREE.BufferGeometry;
  sidewalks: THREE.BufferGeometry;
  markings: THREE.BufferGeometry;
  terrain: THREE.BufferGeometry;
}

function useWorldGeometries(world: WorldGeometry): WorldGeometries {
  const geometries = useMemo<WorldGeometries>(
    () => ({
      road: meshDataToGeometry(world.roadSurface),
      junctions: meshDataToGeometry(world.junctionSurface),
      sidewalks: meshDataToGeometry(world.sidewalks),
      markings: meshDataToGeometry(world.markings),
      terrain: meshDataToGeometry(world.terrain),
    }),
    [world],
  );
  useEffect(
    () => () => {
      disposeAll([
        geometries.road,
        geometries.junctions,
        geometries.sidewalks,
        geometries.markings,
        geometries.terrain,
      ]);
    },
    [geometries],
  );
  return geometries;
}

export function StaticWorld({
  world,
  preset,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
}) {
  const textures = useWorldTextures(preset);
  const geometries = useWorldGeometries(world);

  // Real CC0 PBR sets — shared, cached, loaded once. Until they resolve (or on
  // the server) each mesh falls back to its procedural canvas texture below.
  const asphalt = usePbrSet("road", preset.anisotropy);
  const concrete = usePbrSet("sidewalk", preset.anisotropy);
  const grass = usePbrSet("ground", preset.anisotropy);

  const receive = preset.receiveShadows;

  return (
    <group name="world-static">
      <mesh geometry={geometries.terrain} receiveShadow={receive}>
        {grass ? (
          <meshStandardMaterial
            map={grass.map}
            normalMap={grass.normalMap}
            roughnessMap={grass.roughnessMap}
            aoMap={grass.aoMap ?? undefined}
            roughness={1}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial map={textures.grass} roughness={1} metalness={0} />
        )}
      </mesh>
      <mesh geometry={geometries.road} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            aoMap={asphalt.aoMap ?? undefined}
            roughness={1}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial map={textures.asphalt} roughness={0.96} metalness={0} />
        )}
      </mesh>
      <mesh geometry={geometries.junctions} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            aoMap={asphalt.aoMap ?? undefined}
            roughness={1}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial map={textures.asphalt} roughness={0.96} metalness={0} />
        )}
      </mesh>
      <mesh geometry={geometries.sidewalks} receiveShadow={receive}>
        {concrete ? (
          <meshStandardMaterial
            map={concrete.map}
            normalMap={concrete.normalMap}
            roughnessMap={concrete.roughnessMap}
            roughness={1}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial map={textures.sidewalk} roughness={0.92} metalness={0} />
        )}
      </mesh>
      <mesh geometry={geometries.markings}>
        <meshStandardMaterial color={0xe9e7df} roughness={0.85} metalness={0} />
      </mesh>
    </group>
  );
}
