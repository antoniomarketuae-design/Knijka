"use client";

/**
 * StaticWorld — the merged, non-instanced world meshes: terrain, asphalt
 * (ribbons + junction patches), sidewalks, markings and buildings.
 * 11 draw calls: terrain, road, junctions, sidewalks, markings, 4 facade
 * variants, roofs (+1 spare for the junction/road material split).
 *
 * Materials are declared in JSX so night-mode (window glow) is prop-driven;
 * geometries and canvas textures are memoized and disposed on change.
 */

import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import type { WorldGeometry } from "../types";
import {
  makeAsphaltTexture,
  makeFacadeTextures,
  makeGrassTexture,
  makeRoofTexture,
  makeSidewalkTexture,
} from "../textures/canvasTextures";
import { disposeAll, meshDataToGeometry } from "./three-helpers";
import type { QualityPreset } from "./quality";

const FACADE_VARIANT_COUNT = 4;

interface WorldTextures {
  asphalt: THREE.Texture;
  sidewalk: THREE.Texture;
  grass: THREE.Texture;
  roof: THREE.Texture;
  facades: { map: THREE.Texture; emissiveMap: THREE.Texture }[];
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
      roof: withAniso(makeRoofTexture(Math.min(512, preset.textureSize))),
      facades: Array.from({ length: FACADE_VARIANT_COUNT }, (_, v) => {
        const pair = makeFacadeTextures(v, Math.min(512, preset.textureSize));
        withAniso(pair.map);
        withAniso(pair.emissiveMap);
        return pair;
      }),
    };
  }, [preset]);

  useEffect(
    () => () => {
      disposeAll([
        textures.asphalt,
        textures.sidewalk,
        textures.grass,
        textures.roof,
        ...textures.facades.flatMap((f) => [f.map, f.emissiveMap]),
      ]);
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
  walls: THREE.BufferGeometry[];
  roofs: THREE.BufferGeometry;
}

function useWorldGeometries(world: WorldGeometry): WorldGeometries {
  const geometries = useMemo<WorldGeometries>(
    () => ({
      road: meshDataToGeometry(world.roadSurface),
      junctions: meshDataToGeometry(world.junctionSurface),
      sidewalks: meshDataToGeometry(world.sidewalks),
      markings: meshDataToGeometry(world.markings),
      terrain: meshDataToGeometry(world.terrain),
      walls: world.buildingWalls.map(meshDataToGeometry),
      roofs: meshDataToGeometry(world.buildingRoofs),
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
        ...geometries.walls,
        geometries.roofs,
      ]);
    },
    [geometries],
  );
  return geometries;
}

export function StaticWorld({
  world,
  preset,
  night,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  night: boolean;
}) {
  const textures = useWorldTextures(preset);
  const geometries = useWorldGeometries(world);

  const receive = preset.receiveShadows;
  const buildingsCast = preset.castShadows !== "none";

  return (
    <group name="world-static">
      <mesh geometry={geometries.terrain} receiveShadow={receive}>
        <meshStandardMaterial map={textures.grass} roughness={1} metalness={0} />
      </mesh>
      <mesh geometry={geometries.road} receiveShadow={receive}>
        <meshStandardMaterial map={textures.asphalt} roughness={0.96} metalness={0} />
      </mesh>
      <mesh geometry={geometries.junctions} receiveShadow={receive}>
        <meshStandardMaterial map={textures.asphalt} roughness={0.96} metalness={0} />
      </mesh>
      <mesh geometry={geometries.sidewalks} receiveShadow={receive}>
        <meshStandardMaterial map={textures.sidewalk} roughness={0.92} metalness={0} />
      </mesh>
      <mesh geometry={geometries.markings}>
        <meshStandardMaterial color={0xe9e7df} roughness={0.85} metalness={0} />
      </mesh>
      {geometries.walls.map((wall, variant) => (
        <mesh
          key={variant}
          geometry={wall}
          castShadow={buildingsCast}
          receiveShadow={receive}
        >
          <meshStandardMaterial
            map={textures.facades[variant % FACADE_VARIANT_COUNT]!.map}
            emissiveMap={textures.facades[variant % FACADE_VARIANT_COUNT]!.emissiveMap}
            emissive={0xffffff}
            emissiveIntensity={night ? 1.1 : 0}
            vertexColors
            roughness={0.9}
            metalness={0}
          />
        </mesh>
      ))}
      <mesh
        geometry={geometries.roofs}
        castShadow={buildingsCast}
        receiveShadow={receive}
      >
        <meshStandardMaterial map={textures.roof} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}
