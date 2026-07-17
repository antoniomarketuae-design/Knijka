"use client";

/**
 * StaticWorld — the merged, non-instanced world meshes: terrain, asphalt
 * (ribbons + junction patches), parking-lane bands, the batched road-decal
 * pass (one atlas, one draw call), sidewalks, markings and the mid-rise
 * facade-prism buildings (walls per palette variant + roofs).
 * Tall, compact buildings are drawn by <CityBuildings/> instead (instanced
 * glass towers); the builder splits the two sets so they never overlap
 * (doc 68 QW3).
 *
 * Materials are declared in JSX; geometries and canvas textures are memoized
 * and disposed on change. Real CC0 PBR sets replace the procedural canvas
 * textures once they resolve.
 */

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
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
import { makeDecalAtlasTexture } from "../textures/decalAtlas";
import { useFacadeTextures, type FacadeSetName } from "../textures/facadeTextures";
import { macroOnBeforeCompile, macroProgramCacheKey } from "../textures/macroVariation";
import { usePbrSet } from "../textures/pbrTextures";
import { disposeAll, meshDataToGeometry } from "./three-helpers";
import { QUALITY_PRESETS, type FacadeMapsMode } from "@/modules/sim/environment";
import type { QualityPreset } from "./quality";

const FACADE_VARIANT_COUNT = 4;

/** Constant PBR response when the ORM map is dropped (med/low) — matches the
 *  instanced towers (CityBuildings): matte dielectric, no per-pixel fetch. */
const FACADE_FALLBACK_ROUGHNESS = 0.7;
const FACADE_FALLBACK_METALNESS = 0.0;

/**
 * Per-fragment facade-map budget for this tier (shared ruling with the
 * instanced towers). The world preset carries no explicit level, so map its
 * tier-monotonic textureSize back to the shared quality level and read the
 * environment presets (single source of truth). high = full, med = colorNormal,
 * low = colorOnly.
 */
function facadeMapsFor(preset: QualityPreset): FacadeMapsMode {
  const level = preset.textureSize >= 1024 ? "high" : preset.textureSize >= 512 ? "med" : "low";
  return QUALITY_PRESETS[level].facadeMaps;
}

/**
 * Facade-prism variant -> baked bay system (doc 71 §4.5). Variant 0 is the
 * dominant tall-prism palette (buildings.ts skews >=15 m there), so it gets
 * the punched concrete grid — the panelka-adjacent read; the rest spread the
 * remaining REF 1 systems across the district.
 */
const FACADE_SETS: FacadeSetName[] = ["bay_grid", "bay_band", "bay_strip", "bay_curtain"];

/** Lit-window glow (shared with CityBuildings): golden-hour interiors must
 *  cross the composer's 0.9 bloom threshold at day (doc 71 §4.3). */
const FACADE_DAY_GLOW = 2.0;
const FACADE_NIGHT_GLOW = 3.2;

/**
 * Spread onto every GROUND material (terrain, paved, road, junctions,
 * parking lanes, sidewalks): the shared world-space macro-noise hook —
 * ±22% albedo variation at 40–80 m so big surfaces stop reading uniform,
 * ONE extra texture fetch, one shared program (doc 71 §4.4). Albedo only —
 * it never touches roughness, so the wet-road lerp below stays authoritative.
 */
const MACRO_VARIATION = {
  onBeforeCompile: macroOnBeforeCompile,
  customProgramCacheKey: macroProgramCacheKey,
} as const;

interface WorldTextures {
  asphalt: THREE.Texture;
  sidewalk: THREE.Texture;
  grass: THREE.Texture;
  roof: THREE.Texture;
  /** Procedural road-decal atlas (one texture -> one batched draw call). */
  decals: THREE.Texture;
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
      // 2x the tiling size (a 4x4 atlas shares it across 16 cells), cap 1024
      // per the world texture budget.
      decals: withAniso(makeDecalAtlasTexture(Math.min(1024, preset.textureSize * 2))),
      facades: Array.from({ length: FACADE_VARIANT_COUNT }, (_, v) => {
        const pair = makeFacadeTextures(v, Math.min(512, preset.textureSize));
        withAniso(pair.map);
        withAniso(pair.emissiveMap);
        // The wall UVs are authored for the baked sets (glTF convention,
        // negated V — buildings.ts); match the fallback's orientation.
        pair.map.flipY = false;
        pair.emissiveMap.flipY = false;
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
        textures.decals,
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
  roadDecals: THREE.BufferGeometry;
  waterDecals: THREE.BufferGeometry;
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
      roadDecals: meshDataToGeometry(world.roadDecals),
      waterDecals: meshDataToGeometry(world.waterDecals),
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
        geometries.roadDecals,
        geometries.waterDecals,
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
  const gl = useThree((s) => s.gl);

  // Real CC0 PBR sets — shared, cached, loaded once. Until they resolve (or on
  // the server) each mesh falls back to its procedural canvas texture below.
  const asphalt = usePbrSet("road", preset.anisotropy, gl);
  const concrete = usePbrSet("sidewalk", preset.anisotropy, gl);
  const grass = usePbrSet("ground", preset.anisotropy, gl);
  // Baked facade bay sets (facade_atlas.py) — shared with the instanced kit
  // towers (CityBuildings wires the same cache onto the GLB materials).
  const facadeSets = useFacadeTextures(gl, preset.anisotropy);

  const receive = preset.receiveShadows;
  const buildingsCast = preset.castShadows !== "none";
  const facadeMaps = facadeMapsFor(preset);

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
  // Decals share the road's wetness response (doc 71 §4.4) with a slightly
  // glossier wet floor — oil/tar stains go reflective FIRST in rain.
  const decalWet = useMemo(
    () => wetnessToRoadParams(wetness, { dryRoughness: 0.95, wetRoughness: 0.3, wetDarken: 0.6 }),
    [wetness],
  );
  const decalTint = useMemo(
    () => new Color(decalWet.darken, decalWet.darken, decalWet.darken),
    [decalWet.darken],
  );
  // Asphalt env response (doc 71 §4.4): 1.5 so the wet-gloss state (roughness
  // 0.35) smears the golden HDRI like damp asphalt — dry roughness ~1.0 keeps
  // it matte, so this only shows where the surface goes smooth.
  const ROAD_ENV_INTENSITY = 1.5;
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
            {...MACRO_VARIATION}
            map={grass.map}
            normalMap={grass.normalMap}
            roughnessMap={grass.roughnessMap}
            aoMap={grass.aoMap ?? undefined}
            roughness={1}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={textures.grass}
            roughness={1}
            metalness={0}
          />
        )}
      </mesh>
      {/* Paved courtyards/parking (concrete). Co-planar with the grass terrain;
          shares the concrete PBR set with the sidewalks so no extra upload. */}
      <mesh geometry={geometries.terrainPaved} receiveShadow={receive}>
        {concrete ? (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={concrete.map}
            normalMap={concrete.normalMap}
            roughnessMap={concrete.roughnessMap}
            roughness={1}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={textures.sidewalk}
            roughness={0.92}
            metalness={0}
          />
        )}
      </mesh>
      {/* Road ribbons: vertexColors multiplies in the baked wheel-track wear +
          gutter grime (builders/roads.ts) — composes with the wetness tint. */}
      <mesh geometry={geometries.road} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            aoMap={asphalt.aoMap ?? undefined}
            color={roadTint}
            vertexColors
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        ) : (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={textures.asphalt}
            color={roadTint}
            vertexColors
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        )}
      </mesh>
      <mesh geometry={geometries.junctions} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            aoMap={asphalt.aoMap ?? undefined}
            color={roadTint}
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        ) : (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={textures.asphalt}
            color={roadTint}
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        )}
      </mesh>
      {/* Curbside parking bands — same asphalt set, lighter tint (QW3). */}
      <mesh geometry={geometries.parkingLanes} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={asphalt.map}
            normalMap={asphalt.normalMap}
            roughnessMap={asphalt.roughnessMap}
            color={parkingTint}
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        ) : (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={textures.asphalt}
            color={parkingTint}
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        )}
      </mesh>
      {/* Batched road decals: cracks/patches/oil/manholes from ONE atlas in
          ONE draw call. Quads are EXACTLY co-planar with the asphalt — the
          official three.js decal recipe (polygonOffset -4, no depth write,
          renderOrder after the road) resolves the tie without Y-lifting,
          which shears at grazing cockpit angles (doc 71 §4.4). */}
      {geometries.roadDecals.getAttribute("position") &&
      geometries.roadDecals.getAttribute("position").count > 0 ? (
        <mesh geometry={geometries.roadDecals} receiveShadow={receive} renderOrder={1}>
          <meshStandardMaterial
            map={textures.decals}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            color={decalTint}
            roughness={decalWet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        </mesh>
      ) : null}
      {/* Standing-water sheets over the waterPatch zone spans (aquaplane
          visibility slice, builders/waterDecals.ts): the puddle the physics
          rig floats on is finally VISIBLE — glossy near-black blue-grey, low
          roughness so the sky/HDRI smears into a wet mirror. Slightly Y-lifted
          above the paint AND polygonOffset (belt + braces against z-fighting
          on the long flat span). icePatch spans render NOTHING by design —
          invisible black ice is the AC-08 lesson. */}
      {geometries.waterDecals.getAttribute("position") &&
      geometries.waterDecals.getAttribute("position").count > 0 ? (
        <mesh geometry={geometries.waterDecals} receiveShadow={receive} renderOrder={2}>
          <meshStandardMaterial
            color={0x0d141b}
            transparent
            opacity={0.4}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            roughness={0.12}
            metalness={0.55}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        </mesh>
      ) : null}
      {/* Sidewalks: vertexColors carries the curb-foot grime + skirt AO tint;
          the 2 cm top chamfer strip catches the low sun (doc 71 §4.4). */}
      <mesh geometry={geometries.sidewalks} receiveShadow={receive}>
        {concrete ? (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={concrete.map}
            normalMap={concrete.normalMap}
            roughnessMap={concrete.roughnessMap}
            vertexColors
            roughness={1}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={textures.sidewalk}
            vertexColors
            roughness={0.92}
            metalness={0}
          />
        )}
      </mesh>
      <mesh geometry={geometries.markings}>
        <meshStandardMaterial color={0xe9e7df} roughness={0.85} metalness={0} />
      </mesh>
      {/* Mid-rise facade prisms: real OSM footprints at district-data heights
          (glass towers are a separate instanced pass — CityBuildings). Baked
          bay sets (real recess normals/AO + lit-window emissive, doc 71 §4.5)
          replace the procedural canvas pair once loaded; the facadeTint
          vertex colors keep multiplying over either. ORM fills three slots
          from ONE texture (R=AO, G=rough, B=metal — three's channel layout),
          so factors stay 1 and the map rules. */}
      {geometries.walls.map((wall, variant) => {
        if (!(wall.getAttribute("position") && wall.getAttribute("position").count > 0)) {
          return null;
        }
        const baked = facadeSets?.[FACADE_SETS[variant % FACADE_VARIANT_COUNT]!];
        return (
          <mesh
            key={variant}
            geometry={wall}
            castShadow={buildingsCast}
            receiveShadow={receive}
          >
            {baked ? (
              // Tier-gated maps (shared ruling with CityBuildings): color +
              // emissive always; normal on full+colorNormal; the ORM (ao/rough/
              // metal) only on full — dropped to a matte constant otherwise.
              <meshStandardMaterial
                map={baked.color}
                normalMap={facadeMaps === "colorOnly" ? undefined : baked.normal}
                aoMap={facadeMaps === "full" ? baked.orm : undefined}
                aoMapIntensity={1.2}
                roughnessMap={facadeMaps === "full" ? baked.orm : undefined}
                metalnessMap={facadeMaps === "full" ? baked.orm : undefined}
                emissiveMap={baked.emissive}
                emissive={0xffffff}
                emissiveIntensity={night ? FACADE_NIGHT_GLOW : FACADE_DAY_GLOW}
                vertexColors
                roughness={facadeMaps === "full" ? 1 : FACADE_FALLBACK_ROUGHNESS}
                metalness={facadeMaps === "full" ? 1 : FACADE_FALLBACK_METALNESS}
                envMapIntensity={1.5}
              />
            ) : (
              <meshStandardMaterial
                map={textures.facades[variant % FACADE_VARIANT_COUNT]!.map}
                emissiveMap={textures.facades[variant % FACADE_VARIANT_COUNT]!.emissiveMap}
                emissive={0xffffff}
                emissiveIntensity={night ? 1.1 : 0}
                vertexColors
                roughness={0.9}
                metalness={0}
              />
            )}
          </mesh>
        );
      })}
      <mesh geometry={geometries.roofs} castShadow={buildingsCast} receiveShadow={receive}>
        <meshStandardMaterial map={textures.roof} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  );
}
