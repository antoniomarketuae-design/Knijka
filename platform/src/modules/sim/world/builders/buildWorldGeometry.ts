/**
 * buildWorldGeometry — the pure world builder. district-v1.json in,
 * WorldGeometry (typed arrays + placements + colliders) out. No three.js,
 * no DOM: runs identically in the browser and in vitest/node.
 */

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
import { buildMarkings } from "./markings";
import { analyzeNetwork } from "./network";
import { buildProps } from "./props";
import { buildRoads } from "./roads";
import { buildTerrain } from "./terrain";

export const DEFAULT_SEED = 1337;

export function buildWorldGeometry(
  district: District,
  options: BuildWorldOptions = {},
): WorldGeometry {
  const network = analyzeNetwork(district, options.junctionRadiusOverrides);
  const roads = buildRoads(network);
  const buildings = buildBuildings(district.buildings);
  const buildingInstances = buildBuildingInstances(district.buildings);
  const props = buildProps(district, network, buildings.aabbs, {
    treeDensity: options.treeDensity ?? 1,
    seed: options.seed ?? DEFAULT_SEED,
  });
  const markings = buildMarkings(
    district,
    network,
    props.stopSignApproaches,
    props.giveWayApproaches,
  );
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
  };
  for (const s of props.signs) signCounts[s.kind]++;

  const meshes = [
    roads.surface,
    roads.junctions,
    roads.sidewalks,
    markings.markings,
    terrain,
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
    buildings: buildings.count,
    buildingInstances: buildingInstances.length,
    trafficLights: props.trafficLights.length,
    signs: signCounts,
    streetlights: props.streetlights.length,
    trees: props.trees.length,
    vertices,
    triangles,
    // roads + junctions + sidewalks + markings + terrain + 3 signal parts +
    // (4 sign faces + 1 pole) + 2 streetlight parts + 4 tree variants +
    // one instanced draw per Kenney building model
    drawCallEstimate: 5 + 3 + 5 + 2 + 4 + CITY_MODELS.length,
  };

  return {
    roadSurface: roads.surface.toMeshData(),
    junctionSurface: roads.junctions.toMeshData(),
    sidewalks: roads.sidewalks.toMeshData(),
    markings: markings.markings.toMeshData(),
    terrain: terrain.toMeshData(),
    buildingWalls: buildings.walls.map((w) => w.toMeshData()),
    buildingRoofs: buildings.roofs.toMeshData(),
    buildingInstances,
    trafficLights: props.trafficLights,
    signs: props.signs,
    streetlights: props.streetlights,
    trees: props.trees,
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
