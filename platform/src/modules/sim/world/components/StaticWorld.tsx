"use client";

/**
 * StaticWorld — the merged, non-instanced world meshes: terrain, asphalt
 * (ribbons + junction patches), parking-lane bands, sidewalks, markings and
 * the mid-rise facade-prism buildings (walls per palette variant + roofs).
 * Tall, compact buildings are drawn by <CityBuildings/> instead (instanced
 * glass towers); the builder splits the two sets so they never overlap
 * (doc 68 QW3).
 *
 * Materials are declared in JSX; geometries and canvas textures are memoized
 * and disposed on change. Real CC0 PBR sets replace the procedural canvas
 * textures once they resolve.
 */

import { useEffect, useMemo } from "react";
import type * as THREE from "three";
import { Color } from "three";
import { useWetness, wetnessToRoadParams } from "@/modules/sim/environment";
import type { WorldGeometry } from "../types";
import {
  makeAsphaltTexture,
  makeFacadeTextures,
  makeGrassTexture,
  makeRoofTexture,
  makeSidewalkTexture,
} from "../textures/canvasTextures";
import { usePbrSet } from "../textures/pbrTextures";
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
  parkingLanes: THREE.BufferGeometry;
  terrain: THREE.BufferGeometry;
  terrainPaved: THREE.BufferGeometry;
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
      parkingLanes: meshDataToGeometry(world.parkingLanes),
      terrain: meshDataToGeometry(world.terrain),
      terrainPaved: meshDataToGeometry(world.terrainPaved),
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
        geometries.parkingLanes,
        geometries.terrain,
        geometries.terrainPaved,
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
  night = false,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  night?: boolean;
}) {
  const textures = useWorldTextures(preset);
  const geometries = useWorldGeometries(world);

  // Real CC0 PBR sets — shared, cached, loaded once. Until they resolve (or on
  // the server) each mesh falls back to its procedural canvas texture below.
  const asphalt = usePbrSet("road", preset.anisotropy);
  const concrete = usePbrSet("sidewalk", preset.anisotropy);
  const grass = usePbrSet("ground", preset.anisotropy);

  const receive = preset.receiveShadows;
  const buildingsCast = preset.castShadows !== "none";

  // Wet-road response: as the shared rain channel soaks the asphalt, drop its
  // roughness (dry matte 1.0 → wet gloss 0.35 so the sky/streetlights smear
  // into reflections) and darken its albedo. Grass + concrete stay dry-matte.
  // useWetness re-renders only on quantized 0.01 steps (~a few dozen over the
  // several-second ramp, none at steady state) — memoized geometries/textures
  // are untouched, so this only reconciles the road material props.
  const wetness = useWetness();
  const wet = useMemo(
    () => wetnessToRoadParams(wetness, { dryRoughness: 1.0, wetRoughness: 0.35, wetDarken: 0.6 }),
    [wetness],
  );
  const roadTint = useMemo(() => new Color(wet.darken, wet.darken, wet.darken), [wet.darken]);
  // Parking bands read a touch lighter/cooler than the travel lanes so the
  // extra width reads as parking, not as another lane (doc 68 QW3).
  const parkingTint = useMemo(
    () => new Color(wet.darken * 1.18, wet.darken * 1.18, wet.darken * 1.22),
    [wet.darken],
  );

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
      {/* Paved courtyards/parking (concrete). Co-planar with the grass terrain;
          shares the concrete PBR set with the sidewalks so no extra upload. */}
      <mesh geometry={geometries.terrainPaved} receiveShadow={receive}>
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
      <mesh geometry={geometries.road} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            aoMap={asphalt.aoMap ?? undefined}
            color={roadTint}
            roughness={wet.roughness}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial
            map={textures.asphalt}
            color={roadTint}
            roughness={wet.roughness}
            metalness={0}
          />
        )}
      </mesh>
      <mesh geometry={geometries.junctions} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            aoMap={asphalt.aoMap ?? undefined}
            color={roadTint}
            roughness={wet.roughness}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial
            map={textures.asphalt}
            color={roadTint}
            roughness={wet.roughness}
            metalness={0}
          />
        )}
      </mesh>
      {/* Curbside parking bands — same asphalt set, lighter tint (QW3). */}
      <mesh geometry={geometries.parkingLanes} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            color={parkingTint}
            roughness={wet.roughness}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial
            map={textures.asphalt}
            color={parkingTint}
            roughness={wet.roughness}
            metalness={0}
          />
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
      {/* Mid-rise facade prisms: real OSM footprints at district-data heights
          (glass towers are a separate instanced pass — CityBuildings). */}
      {geometries.walls.map((wall, variant) =>
        wall.getAttribute("position") && wall.getAttribute("position").count > 0 ? (
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
        ) : null,
      )}
      <mesh geometry={geometries.roofs} castShadow={buildingsCast} receiveShadow={receive}>
        <meshStandardMaterial map={textures.roof} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}
