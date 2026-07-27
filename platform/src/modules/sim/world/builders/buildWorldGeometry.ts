/**
 * buildWorldGeometry — the pure world builder. district-v1.json in,
 * WorldGeometry (typed arrays + placements + colliders) out. No three.js,
 * no DOM: runs identically in the browser and in vitest/node.
 */

import { LESSON_PARKING_BAYS } from "../../lessons/specs";
import type {
  BuildWorldOptions,
  District,
  SignKind,
  WorldGeometry,
  WorldStats,
} from "../types";
import { ROAD_Y, TERRAIN_MARGIN_M } from "./constants";
import { buildBuildings } from "./buildings";
import { buildBuildingInstances, CITY_MODELS } from "./cityBuildings";
import { buildRoadDecals } from "./decals";
import { buildMarkings } from "./markings";
import { analyzeNetwork } from "./network";
import { buildProps } from "./props";
import { buildRailTracks } from "./railTrack";
import { buildRoads } from "./roads";
import { buildTerrain } from "./terrain";
import { buildWaterDecals } from "./waterDecals";

export const DEFAULT_SEED = 1337;

export function buildWorldGeometry(
  district: District,
  options: BuildWorldOptions = {},
): WorldGeometry {
  const network = analyzeNetwork(district, options.junctionRadiusOverrides);
  const roads = buildRoads(network);
  // Standing-water sheets over waterPatch zone spans (aquaplane visibility
  // slice) — one merged mesh, zero quads on every map without live spans.
  const water = buildWaterDecals(district, network);
  // Rail-track deck (ballast band + sleepers + steel rails) over every
  // railCrossing zone span — two merged meshes, zero quads on every map
  // without a railCrossing zone (the waterDecals additive contract).
  const rail = buildRailTracks(district, network);
  // Tall, compact buildings become glass-tower instances; every other
  // footprint keeps its facade prism (walls/roofs), so the split below tells
  // the prism builder which ids to leave to the instanced pass (doc 68 QW3).
  const buildingInstances = buildBuildingInstances(district.buildings);
  const towerIds = new Set(buildingInstances.map((p) => p.buildingId));
  const buildings = buildBuildings(district.buildings, towerIds);
  const props = buildProps(district, network, buildings.aabbs, {
    treeDensity: options.treeDensity ?? 1,
    seed: options.seed ?? DEFAULT_SEED,
  });
  // Lesson-authored painted bays (L7) by default — the same curriculum-drives-
  // the-world pattern as the L2 stop-sign placement. Pass [] for a bare build.
  const markings = buildMarkings(
    district,
    network,
    props.stopSignApproaches,
    props.giveWayApproaches,
    options.parkingBays ?? LESSON_PARKING_BAYS,
  );
  // Seeded street-wear decal batch (cracks/patches/manholes) — one draw call.
  // Covers ribbons AND junction interiors since doc 82 V4; still one mesh.
  // Runs AFTER buildMarkings on purpose: every decal is vetted against the
  // painted markings mesh so no wear lands under a stop line, a zebra bar or
  // a lane line (decals.ts MarkingKeepOut). The markings themselves are
  // untouched by this — buildMarkings reads nothing the decal pass writes, so
  // the paint buffers stay byte-identical to the old build order.
  const decals = buildRoadDecals(network, options.seed ?? DEFAULT_SEED, markings.markings);
  // Terrain resolution is fixed in the pure layer; the renderer decimates by
  // quality via the `terrainSegments` option of its own rebuild if needed.
  const terrain = buildTerrain(district, network, buildings.aabbs, 112);

  const b = district.meta.boundsLocalMeters;
  const spanX = b.maxX - b.minX + 2 * TERRAIN_MARGIN_M;
  const spanY = b.maxY - b.minY + 2 * TERRAIN_MARGIN_M;
  const centerX = (b.minX + b.maxX) / 2;
  const centerY = (b.minY + b.maxY) / 2;
  const groundThickness = 1;

  const signCounts: Record<SignKind, number> = {
    stop: 0,
    giveWay: 0,
    limit50: 0,
    roundabout: 0,
    // Zone-driven posts (SIGN-ASSET drop) — 0 on every zones-less district.
    noOvertaking: 0,
    noStopping: 0,
    slippery: 0,
    curve: 0,
    railGuarded: 0,
    railUnguarded: 0,
    railCross: 0,
    barrier: 0,
    // Junction-derived В1 post — 0 on every district without a one-way mouth.
    noEntry: 0,
  };
  for (const s of props.signs) signCounts[s.kind]++;

  // Zone-sign draws: +2 per placed textured kind (body + face), +1 for the
  // geometry-only crossbuck/barrier. Zero on zones-less districts, so their
  // estimate is untouched.
  let zoneSignDraws = 0;
  for (const [kind, count] of Object.entries(signCounts) as [SignKind, number][]) {
    if (count === 0) continue;
    if (kind === "stop" || kind === "giveWay" || kind === "limit50" || kind === "roundabout")
      continue; // inside the fixed 27 below
    zoneSignDraws += kind === "railCross" || kind === "barrier" ? 1 : 2;
  }

  const meshes = [
    roads.surface,
    roads.junctions,
    roads.sidewalks,
    roads.parkingLanes,
    markings.markings,
    decals.decals,
    water.water,
    rail.deck,
    rail.rails,
    terrain.grass,
    terrain.paved,
    ...buildings.walls,
    buildings.roofs,
  ];
  const vertices = meshes.reduce((sum, m) => sum + m.vertexCount, 0);
  const triangles = meshes.reduce((sum, m) => sum + m.triangleCount, 0);

  const stats: WorldStats = {
    edges: district.roads.edges.length,
    ribbons: roads.ribbonCount,
    skippedRibbons: roads.skippedRibbonCount,
    junctionPatches: roads.junctionPatchCount,
    sidewalkStrips: roads.sidewalkStripCount,
    markingQuads: markings.markingQuads,
    stopLines: markings.stopLines,
    zebraCrossings: markings.zebraCrossings,
    parkingBays: markings.parkingBays,
    parkingLaneStrips: roads.parkingLaneStripCount,
    roadDecals: decals.count,
    junctionDecals: decals.junctionCount,
    waterDecals: water.count,
    railTrackQuads: rail.deckQuads + rail.railQuads,
    buildings: buildings.count,
    buildingInstances: buildingInstances.length,
    trafficLights: props.trafficLights.length,
    signs: signCounts,
    streetlights: props.streetlights.length,
    trees: props.trees.length,
    billboards: props.billboards.length,
    busStops: props.busStops.length,
    parkingKits: props.parkingKits.length,
    vertices,
    triangles,
    // 13 static meshes (roads, junctions, sidewalks, parking lanes, markings,
    // road-decal batch, grass, paved, 4 facade-wall variants, roofs) + 27
    // fixed WorldProps instanced draws (2 signals + 8 signs + 2 streetlights +
    // 4 trees + 4 furniture + 4 billboards + 2 bus stops + 1 parking kit) +
    // zone-sign draws (only on maps whose zones place posts) +
    // the water-sheet mesh (only on maps with live waterPatch spans) +
    // the rail deck + rails meshes (only on maps with a railCrossing zone) +
    // towers (chunked & frustum-culled at runtime; count ~model-order).
    drawCallEstimate:
      13 +
      27 +
      zoneSignDraws +
      (water.count > 0 ? 1 : 0) +
      (rail.deckQuads > 0 ? 2 : 0) +
      CITY_MODELS.length,
  };

  return {
    roadSurface: roads.surface.toMeshData(),
    junctionSurface: roads.junctions.toMeshData(),
    sidewalks: roads.sidewalks.toMeshData(),
    markings: markings.markings.toMeshData(),
    parkingLanes: roads.parkingLanes.toMeshData(),
    roadDecals: decals.decals.toMeshData(),
    waterDecals: water.water.toMeshData(),
    railTracks: { deck: rail.deck.toMeshData(), rails: rail.rails.toMeshData() },
    terrain: terrain.grass.toMeshData(),
    terrainPaved: terrain.paved.toMeshData(),
    buildingWalls: buildings.walls.map((w) => w.toMeshData()),
    buildingRoofs: buildings.roofs.toMeshData(),
    buildingInstances,
    trafficLights: props.trafficLights,
    signs: props.signs,
    streetlights: props.streetlights,
    trees: props.trees,
    billboards: props.billboards,
    busStops: props.busStops,
    parkingKits: props.parkingKits,
    colliders: {
      ground: {
        halfExtents: [spanX / 2, groundThickness / 2, spanY / 2],
        // Top face exactly at the road surface height.
        position: [centerX, ROAD_Y - groundThickness / 2, -centerY],
      },
      sidewalks: roads.sidewalks.toColliderMesh(),
      buildings: buildings.collider.toColliderMesh(),
    },
    attribution: {
      text: district.meta.attribution.text,
      copyrightUrl: district.meta.attribution.copyrightUrl,
    },
    stats,
  };
}
