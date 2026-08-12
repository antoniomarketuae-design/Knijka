/**
 * buildWorldGeometry — the pure world builder. district-v1.json in,
 * WorldGeometry (typed arrays + placements + colliders) out. No three.js,
 * no DOM: runs identically in the browser and in vitest/node.
 */

import { LESSON_PARKING_BAYS } from "../../lessons/specs";
import { SIGN_KINDS } from "../types";
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
import { countStaticDrawSlots } from "./drawSlots";
import { buildCrossingFurniture, buildMarkings } from "./markings";
import { analyzeNetwork } from "./network";
import { buildProps } from "./props";
import { buildRailTracks } from "./railTrack";
import { buildRoads } from "./roads";
import { buildSchools } from "./schools";
import { analyzeRoundabouts, buildRoundabouts } from "./roundabout";
import { buildTerminusClosure } from "./terminus";
import { buildTerrain } from "./terrain";
import { buildWaterDecals } from "./waterDecals";

export const DEFAULT_SEED = 1337;

export function buildWorldGeometry(
  district: District,
  options: BuildWorldOptions = {},
): WorldGeometry {
  const network = analyzeNetwork(district, options.junctionRadiusOverrides);
  // Roundabouts resolve BEFORE the roads: the ring's central island is what
  // decides how far the four arm↔ring junction pads may reach inward. Without
  // it each pad opens at the ARM's radius (~17 m against an 18 m ring) and the
  // four of them union into an open plaza with nothing in the middle — the
  // „not a proper round-about … a Round a bout is a Cyrcle" defect (doc 87
  // FR-22). Empty on every district that registers none.
  const rings = analyzeRoundabouts(district, network);
  const roads = buildRoads(network, rings);
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
  // THE STREET END, the axis half (B65 — builders/terminus.ts). Scenery masses
  // the district document does not author, built through the buildings pass so
  // they cost no draw call and carry the wall collider every other block does.
  // Empty on every city / exam / полигон district. `buildBuildingInstances`
  // above deliberately never sees them: a closure is a facade prism, never a
  // glass tower.
  const terminusClosures = buildTerminusClosure(district, network);
  const buildings = buildBuildings(
    district.buildings,
    towerIds,
    terminusClosures.map((c) => c.volume),
  );
  // School dressing — name board + yard railing per `kind: "school"` footprint
  // (founder item 61). Empty on every district that authors none, so this is
  // additive: no existing map's geometry moves by a vertex.
  const schools = buildSchools(district.buildings, network);
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
  // The roundabout pass proper: the kerbed central island (kerb + rim into the
  // SIDEWALK mesh, so the kerb also becomes a collider a car cannot cross; the
  // planted crown into its OWN mesh) and the ring's own circular lane divider
  // (into the PAINT mesh). It runs after markings and before decals so the wear
  // pass keeps out from under the new paint, exactly as for every other marking.
  const roundabouts = buildRoundabouts(rings, {
    sidewalks: roads.sidewalks,
    markings: markings.markings,
  });
  // Crossing FURNITURE (doc 87 B50/B53/B54): the kerbed refuge island / median
  // nose and the raised table's painted ramp bands. Same insertion point and
  // the same two accumulators as the roundabout island above — after the paint,
  // before the wear, so decals keep out from under it. Adds nothing at all to a
  // district whose crossings carry no furniture fields.
  const crossingFurniture = buildCrossingFurniture(district, network, {
    sidewalks: roads.sidewalks,
    markings: markings.markings,
  });
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

  // Built from SIGN_KINDS, not a hand-written literal: the В26 numeral set
  // (doc 86 T4) turned one speed kind into thirteen, and a Record literal is
  // exactly the thing that goes stale when a kind is added.
  const signCounts = Object.fromEntries(SIGN_KINDS.map((k) => [k, 0])) as Record<SignKind, number>;
  for (const s of props.signs) signCounts[s.kind]++;

  // Sign draws are no longer split into "the fixed four" and "the zone extras":
  // `drawSlots.ts` charges body+face for every kind actually placed (and body
  // only for the geometry-only crossbuck/barrier), so a district that posts no
  // STOP is not billed for one. The old split existed only to keep the
  // hand-written 27 arithmetically true.

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
    roundabouts.islandPlanting,
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
    markingQuads:
      markings.markingQuads + roundabouts.ringDividerQuads + crossingFurniture.furnitureQuads,
    stopLines: markings.stopLines,
    zebraCrossings: markings.zebraCrossings,
    parkingBays: markings.parkingBays,
    parkingLaneStrips: roads.parkingLaneStripCount,
    roadDecals: decals.count,
    junctionDecals: decals.junctionCount,
    waterDecals: water.count,
    railTrackQuads: rail.deckQuads + rail.railQuads,
    roundaboutIslands: roundabouts.islands,
    /** doc 87 B50/B53/B54 — kerbed pedestrian refuge islands / median noses. */
    crossingIslands: crossingFurniture.islands,
    /** Raised-table ramp bands painted (2 per table, one per approach). */
    crossingTableRamps: crossingFurniture.tableRamps,
    roundabouts: rings.length,
    ringDividerQuads: roundabouts.ringDividerQuads,
    /** FR-22, the outer half: mouth-free arcs of circular ring kerb swept. */
    ringKerbRuns: roads.ringKerbRunCount,
    /** B16 — kerb returns that close the mouths (two per arm). */
    ringReturnRuns: roads.ringReturnRunCount,
    buildings: buildings.count,
    buildingInstances: buildingInstances.length,
    trafficLights: props.trafficLights.length,
    signs: signCounts,
    streetlights: props.streetlights.length,
    trees: props.trees.length,
    billboards: props.billboards.length,
    /** B65 street furniture — see constants.SCENARIO_LIT_CLASSES. */
    utilityPoles: props.utilityPoles.length,
    utilityWireSpans: props.utilityPoles.filter((p) => p.spanM > 0).length,
    railings: props.railings.length,
    /** B65 — the masses that close a street end running out of the world. */
    terminusClosures: terminusClosures.length,
    skidMarks: decals.skidCount,
    busStops: props.busStops.length,
    parkingKits: props.parkingKits.length,
    vertices,
    triangles,
    // HOW MANY STATIC MESH SLOTS THIS DISTRICT MOUNTS — counted from the
    // placement data by `drawSlots.ts`, term by term, gated exactly the way
    // WorldProps gates each mesh.
    //
    // This replaced `drawCallEstimate`, which was `13 + 27 + …`. The `27` was a
    // prose tally of the fixed WorldProps draws; `WorldProps.tsx` carried its
    // own copy of the same tally that said **28**, and neither counted the
    // pedestrian-signal trio. Deriving it is what makes that drift impossible
    // rather than corrected once — there is no longer a number to keep in sync.
    //
    // READ THE HEADER OF drawSlots.ts BEFORE USING THIS FOR ANYTHING. It is the
    // static world only. It is NOT the frame, it is 26–41 % of the frame on the
    // running product, and scoring it against `PERF_BUDGETS[tier].drawCalls` is
    // the exact mistake that hid a 3–5× overrun for months. The frame is
    // `sim/environment/frameCost.ts`.
    staticDrawSlots: countStaticDrawSlots({
      trafficLights: props.trafficLights,
      signCounts,
      streetlights: props.streetlights,
      trees: props.trees,
      billboards: props.billboards,
      busStops: props.busStops,
      parkingKits: props.parkingKits,
      utilityPoles: props.utilityPoles,
      railings: props.railings,
      // roads, junctions, sidewalks, parking lanes, markings, road-decal batch,
      // grass, paved, 4 facade-wall variants, roofs.
      staticMeshes: 13,
      cityModels: CITY_MODELS.length,
      waterSheet: water.count > 0,
      railDeck: rail.deckQuads > 0,
      roundaboutIsland: roundabouts.islands > 0,
    }),
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
    roundaboutIslands: roundabouts.islandPlanting.toMeshData(),
    buildingWalls: buildings.walls.map((w) => w.toMeshData()),
    buildingRoofs: buildings.roofs.toMeshData(),
    buildingInstances,
    trafficLights: props.trafficLights,
    signs: props.signs,
    streetlights: props.streetlights,
    trees: props.trees,
    billboards: props.billboards,
    utilityPoles: props.utilityPoles,
    railings: props.railings,
    busStops: props.busStops,
    parkingKits: props.parkingKits,
    schools,
    terminusClosures: terminusClosures.map((c) => c.placement),
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
