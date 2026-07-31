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
import {
  markingWearOnBeforeCompile,
  markingWearProgramCacheKey,
  PAINT_ALPHA_TEST,
  PAINT_NORMAL_SCALE,
} from "../textures/markingWear";
import { usePbrSet } from "../textures/pbrTextures";
import {
  ROAD_ALBEDO_TINT,
  roadSurfaceOnBeforeCompile,
  roadSurfaceProgramCacheKey,
} from "../textures/roadSurface";
import { TEXTURE_BUDGETS } from "../textures/textureBudget";
import { disposeAll, meshDataToGeometry } from "./three-helpers";
import type { QualityPreset } from "./quality";

const FACADE_VARIANT_COUNT = 4;

/** Roundabout island planting: the ground set pushed greener and a shade
 *  deeper than open verge — a maintained ornamental bed, not a field. */
const ISLAND_PLANTING_TINT = 0x8fa86a;

/** Constant PBR response when the ORM map is dropped (med/low) — matches the
 *  instanced towers (CityBuildings): matte dielectric, no per-pixel fetch. */
const FACADE_FALLBACK_ROUGHNESS = 0.7;
const FACADE_FALLBACK_METALNESS = 0.0;

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

/**
 * Spread onto the three ASPHALT materials (road ribbons, junction patches,
 * parking bands) INSTEAD of MACRO_VARIATION (doc 82 V5). It is a superset:
 * the same shared macro field at the same 80 m scale, plus the 2-tap rotated
 * detile and the UDN detail normal. Its own cache key, so the asphalt program
 * and the plain ground program each compile exactly once.
 */
const ROAD_SURFACE = {
  onBeforeCompile: roadSurfaceOnBeforeCompile,
  customProgramCacheKey: roadSurfaceProgramCacheKey,
} as const;

/**
 * Spread onto the MARKINGS material only (doc 82 V1): world-XZ map UVs at the
 * road's tile scale + macro-noise grime + alpha-eroded edges. Deliberately
 * NOT the ground hook — paint needs the noise at a ~3 m wear scale, not the
 * 80 m ground scale, and it is the only material that touches `diffuseColor.a`.
 */
const PAINT_WEAR = {
  onBeforeCompile: markingWearOnBeforeCompile,
  customProgramCacheKey: markingWearProgramCacheKey,
} as const;

/** normalScale is a Vector2 on the material; R3F's `set` shortcut takes the
 *  tuple. Hoisted so the array identity is stable across re-renders. */
const PAINT_NORMAL_SCALE_V2: [number, number] = [PAINT_NORMAL_SCALE, PAINT_NORMAL_SCALE];

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
  railDeck: THREE.BufferGeometry;
  railRails: THREE.BufferGeometry;
  terrain: THREE.BufferGeometry;
  terrainPaved: THREE.BufferGeometry;
  roundaboutIslands: THREE.BufferGeometry;
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
      railDeck: meshDataToGeometry(world.railTracks.deck),
      railRails: meshDataToGeometry(world.railTracks.rails),
      terrain: meshDataToGeometry(world.terrain),
      terrainPaved: meshDataToGeometry(world.terrainPaved),
      roundaboutIslands: meshDataToGeometry(world.roundaboutIslands),
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
        geometries.railDeck,
        geometries.railRails,
        geometries.terrain,
        geometries.terrainPaved,
        geometries.roundaboutIslands,
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
  // `budget` is the DOWNLOAD tier (audit H-11): at low only the albedo is
  // fetched at all, so normalMap/roughnessMap/aoMap come back null and the
  // authored material constants below take over.
  const budget = TEXTURE_BUDGETS[preset.level];
  const asphalt = usePbrSet("road", budget.groundMaps, preset.anisotropy, gl);
  const concrete = usePbrSet("sidewalk", budget.groundMaps, preset.anisotropy, gl);
  const grass = usePbrSet("ground", budget.groundMaps, preset.anisotropy, gl);
  // Baked facade bay sets (facade_atlas.py) — shared with the instanced kit
  // towers (CityBuildings wires the same cache onto the GLB materials, and
  // MUST pass the same mode: one cache entry, one GPU copy).
  const facadeMaps = budget.facadeMaps;
  const facadeSets = useFacadeTextures(gl, preset.anisotropy, facadeMaps);

  const receive = preset.receiveShadows;
  const buildingsCast = preset.castShadows !== "none";

  // Wet-road response: as the shared rain channel soaks the asphalt, drop its
  // roughness (dry matte 1.0 → wet gloss) and darken its albedo. Grass +
  // concrete stay dry-matte. useWetness re-renders only on quantized 0.01
  // steps (~a few dozen over the several-second ramp, none at steady state) —
  // memoized geometries/textures are untouched, so this only reconciles the
  // road material props.
  //
  // WET-GLOSS RETUNE (doc 66 R5 — founder „too bright" in BOTH clip pilots;
  // pilot-v2 R0 measurement on sc-ac-rain-lights k2 vs the dry
  // sc-follow-distance k2, same day preset, same chase framing): at the old
  // wetRoughness 0.35 + envMapIntensity 1.5 the far wet carriageway measured
  // RGB ≈ [213, 206, 194] against the dry road's [117, 117, 120] — the sharp
  // specular of the bright golden sky OVERWHELMED the darkened albedo
  // (wet asphalt must read DARKER than dry, wetDarken 0.6) and med/high's
  // bloom (threshold 0.9) smeared the blown band into a white sheet.
  // wetRoughness 0.35 → 0.5 spreads the lobe (~0.5× peak) and the env
  // response lerps 1.5 → 1.1 with wetness (×0.73 soaked): reasoned far-field
  // lands near the dry-road band with visible gloss streaks — damp asphalt,
  // not a mirror. Dry scenes stay byte-identical (wetness 0 → the authored
  // 1.0 roughness AND the authored 1.5 env response, untouched).
  const wetness = useWetness();
  const wet = useMemo(
    () => wetnessToRoadParams(wetness, { dryRoughness: 1.0, wetRoughness: 0.5, wetDarken: 0.6 }),
    [wetness],
  );
  // ROAD_ALBEDO_TINT (doc 82 V5) multiplies the wetness darken rather than
  // replacing it: the wet response, its ordering against the decals and the
  // whole R5 retune above are preserved, the asphalt simply starts darker so
  // it separates from the concrete pavement instead of merging with it.
  const roadTint = useMemo(() => {
    const d = wet.darken * ROAD_ALBEDO_TINT;
    return new Color(d, d, d);
  }, [wet.darken]);
  // Decals share the road's wetness response (doc 71 §4.4) with a slightly
  // glossier wet floor — oil/tar stains go reflective FIRST in rain (the
  // ordering survives the retune: 0.45 < 0.5).
  const decalWet = useMemo(
    () => wetnessToRoadParams(wetness, { dryRoughness: 0.95, wetRoughness: 0.45, wetDarken: 0.6 }),
    [wetness],
  );
  // Decals carry the road's albedo tint too — they are wear ON the asphalt,
  // and left at full value they would read as marks painted BRIGHTER than the
  // surface they sit in.
  const decalTint = useMemo(() => {
    const d = decalWet.darken * ROAD_ALBEDO_TINT;
    return new Color(d, d, d);
  }, [decalWet.darken]);
  // Paint's own wetness response (doc 82 V1). Wet thermoplastic goes slicker
  // than wet asphalt — that is the real-world reason „не спирай върху
  // маркировката" is taught — so its wet endpoint sits below the road's 0.5.
  // It darkens FAR less than the road (0.78 vs 0.6): markings must stay
  // legible in rain, because the rule engine grades stop-line and lane
  // discipline in exactly those conditions. dryRoughness is the shipped
  // authored 0.85 and darken lands at 1.0, so every DRY scene is
  // byte-identical to before this change.
  const paintWet = useMemo(
    () => wetnessToRoadParams(wetness, { dryRoughness: 0.85, wetRoughness: 0.4, wetDarken: 0.78 }),
    [wetness],
  );
  // The shipped paint albedo (#e9e7df — worn white, never pure) times the
  // wetness darken.
  const paintTint = useMemo(
    () => new Color(0xe9e7df).multiplyScalar(paintWet.darken),
    [paintWet.darken],
  );
  // Asphalt env response (doc 71 §4.4, retuned by the doc 66 R5 measurements):
  // WETNESS-LERPED 1.5 dry → 0.55 soaked. The wet endpoint is the sky-glare
  // dial: at a grazing angle a wet road mirrors the sky just above the horizon,
  // which by DAY is bright and — crucially — is NOT dimmed for rain (the rig
  // dims only the sun + hemisphere fill, never the HDRI reflection or the
  // exposure), so the far carriageway blows out while the near field darkens
  // correctly. Round-2's 1.1 still measured the far wet band ≈ [180,170,162]
  // vs the dry road's far ≈ [64,62,70] (founder round-3 „still too bright,
  // can't tell rain from dry"). Dropping the soaked env response to 0.55
  // (≈half the reflected sky) lands the far band in the ~[110–125] range —
  // clearly a DARK, damp, reflective road, no longer a white sheet — while the
  // roughness-0.5 gloss lobe keeps the specular STREAKS off lit windows/sun
  // (still reads „wet"). A DRY scene keeps the authored 1.5 response
  // BYTE-IDENTICAL (wetness 0), so the founder-passed dry clips never dim.
  const ROAD_ENV_INTENSITY = 1.5 + (0.55 - 1.5) * wetness;
  // Parking bands read a touch lighter/cooler than the travel lanes so the
  // extra width reads as parking, not as another lane (doc 68 QW3).
  const parkingTint = useMemo(() => {
    const d = wet.darken * ROAD_ALBEDO_TINT;
    return new Color(d * 1.18, d * 1.18, d * 1.22);
  }, [wet.darken]);

  return (
    <group name="world-static">
      <mesh geometry={geometries.terrain} receiveShadow={receive}>
        {grass ? (
          <meshStandardMaterial
            {...MACRO_VARIATION}
            map={grass.map}
            normalMap={grass.normalMap ?? undefined}
            roughnessMap={grass.roughnessMap ?? undefined}
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
            normalMap={concrete.normalMap ?? undefined}
            roughnessMap={concrete.roughnessMap ?? undefined}
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
      {/* ROUNDABOUT CENTRAL ISLANDS — the planted crown + its shrubs
          (builders/roundabout.ts). Shares the ground PBR set already uploaded
          for the terrain, tinted a touch deeper and greener so an ornamental
          island reads as planting rather than as verge, and CASTS SHADOW: the
          long shadow across the circulatory carriageway is a large part of why
          the thing reads as a solid object from the driver's seat at 40 m.
          Guarded, so a district without a drawn ring costs nothing. */}
      {geometries.roundaboutIslands.getAttribute("position") &&
      geometries.roundaboutIslands.getAttribute("position").count > 0 ? (
        <mesh
          geometry={geometries.roundaboutIslands}
          castShadow={buildingsCast}
          receiveShadow={receive}
        >
          {grass ? (
            <meshStandardMaterial
              {...MACRO_VARIATION}
              map={grass.map}
              normalMap={grass.normalMap ?? undefined}
              roughnessMap={grass.roughnessMap ?? undefined}
              color={ISLAND_PLANTING_TINT}
              roughness={1}
              metalness={0}
            />
          ) : (
            <meshStandardMaterial
              {...MACRO_VARIATION}
              map={textures.grass}
              color={ISLAND_PLANTING_TINT}
              roughness={1}
              metalness={0}
            />
          )}
        </mesh>
      ) : null}
      {/* Road ribbons: vertexColors multiplies in the baked wheel-track wear +
          gutter grime (builders/roads.ts) — composes with the wetness tint. */}
      <mesh geometry={geometries.road} receiveShadow={receive}>
        {asphalt ? (
          <meshStandardMaterial
            {...ROAD_SURFACE}
            map={asphalt.map}
            normalMap={asphalt.normalMap ?? undefined}
            roughnessMap={asphalt.roughnessMap ?? undefined}
            aoMap={asphalt.aoMap ?? undefined}
            color={roadTint}
            vertexColors
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        ) : (
          <meshStandardMaterial
            {...ROAD_SURFACE}
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
            {...ROAD_SURFACE}
            map={asphalt.map}
            normalMap={asphalt.normalMap ?? undefined}
            roughnessMap={asphalt.roughnessMap ?? undefined}
            aoMap={asphalt.aoMap ?? undefined}
            color={roadTint}
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        ) : (
          <meshStandardMaterial
            {...ROAD_SURFACE}
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
            {...ROAD_SURFACE}
            map={asphalt.map}
            normalMap={asphalt.normalMap ?? undefined}
            roughnessMap={asphalt.roughnessMap ?? undefined}
            color={parkingTint}
            roughness={wet.roughness}
            metalness={0}
            envMapIntensity={ROAD_ENV_INTENSITY}
          />
        ) : (
          <meshStandardMaterial
            {...ROAD_SURFACE}
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
            normalMap={concrete.normalMap ?? undefined}
            roughnessMap={concrete.roughnessMap ?? undefined}
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
      {/* Lane markings (doc 82 V1). This mesh was the ONE ground mesh in the
          scene without `receiveShadow`, so painted lines glowed at full value
          straight through building and car shadows — the single loudest
          „test level" tell in the shipped frames. It now takes shadow like
          every surface above, borrows the ROAD's own normal/roughness maps at
          the road's world tile scale (PAINT_WEAR rewrites the map UVs — the
          markings' per-quad 0..1 UVs cannot tile), and erodes its edges with
          the shared macro noise, so paint reads as a film ON the aggregate
          rather than as a decal floating over it. */}
      <mesh geometry={geometries.markings} receiveShadow={receive}>
        <meshStandardMaterial
          {...PAINT_WEAR}
          color={paintTint}
          normalMap={asphalt?.normalMap ?? undefined}
          normalScale={PAINT_NORMAL_SCALE_V2}
          roughnessMap={asphalt?.roughnessMap ?? undefined}
          roughness={paintWet.roughness}
          metalness={0}
          envMapIntensity={ROAD_ENV_INTENSITY}
          alphaTest={PAINT_ALPHA_TEST}
        />
      </mesh>
      {/* Railway level-crossing track deck over railCrossing zone spans
          (builders/railTrack.ts): the dark ballast/sleeper band (vertex-coloured
          matte) plus the two raised steel rails running across the carriageway.
          Empty on every map without a railCrossing zone — guarded so a rail-free
          district adds no mesh. Renders for BOTH guarded + unguarded crossings;
          the barrier arm/lights are separate furniture. */}
      {geometries.railDeck.getAttribute("position") &&
      geometries.railDeck.getAttribute("position").count > 0 ? (
        <mesh geometry={geometries.railDeck} receiveShadow={receive}>
          <meshStandardMaterial vertexColors roughness={0.95} metalness={0.05} />
        </mesh>
      ) : null}
      {geometries.railRails.getAttribute("position") &&
      geometries.railRails.getAttribute("position").count > 0 ? (
        <mesh geometry={geometries.railRails} castShadow={buildingsCast} receiveShadow={receive}>
          <meshStandardMaterial
            color={0x82888f}
            roughness={0.45}
            metalness={0.7}
            envMapIntensity={0.55}
          />
        </mesh>
      ) : null}
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
              // Since H-11 the tier gates the FETCH, so the dropped maps are
              // already null here; `?? undefined` is what binds nothing.
              <meshStandardMaterial
                map={baked.color}
                normalMap={baked.normal ?? undefined}
                aoMap={baked.orm ?? undefined}
                aoMapIntensity={1.2}
                roughnessMap={baked.orm ?? undefined}
                metalnessMap={baked.orm ?? undefined}
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
