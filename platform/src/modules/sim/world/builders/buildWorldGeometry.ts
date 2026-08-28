/**
 * buildWorldGeometry — the pure world builder. district-v1.json in,
 * WorldGeometry (typed arrays + placements + colliders) out. No three.js,
 * no DOM: runs identically in the browser and in vitest/node.
 */

import { scenarioBaysOf, type ParkingBaySpec, type ScenarioBayMeta } from "../../contracts";
import { LESSON_PARKING_BAYS } from "../../lessons/specs";
import { SIGN_KINDS } from "../types";
import type {
  BuildWorldOptions,
  District,
  DistrictBuilding,
  SignKind,
  WorldGeometry,
  WorldStats,
} from "../types";
import {
  ROAD_Y,
  TERMINUS_CLOSE_DEPTH_M,
  TERMINUS_CLOSE_MIN_HEIGHT_M,
  TERMINUS_CLOSE_NEAR_M,
  TERRAIN_MARGIN_M,
} from "./constants";
import { buildBuildings } from "./buildings";
import { buildBuildingInstances, CITY_MODELS } from "./cityBuildings";
import { buildRoadDecals } from "./decals";
import { countStaticDrawSlots } from "./drawSlots";
import { buildCrossingFurniture, buildMarkings } from "./markings";
import { perpRight, type Vec2 } from "./math2d";
import { analyzeNetwork, type RoadNetwork } from "./network";
import { buildProps } from "./props";
import { buildRailTracks } from "./railTrack";
import { buildRoads } from "./roads";
import { buildSchools } from "./schools";
import { analyzeRoundabouts, buildRoundabouts } from "./roundabout";
import { buildTerminusClosure } from "./terminus";
import { buildTerrain } from "./terrain";
import { buildWaterDecals } from "./waterDecals";
import { buildWorldRim } from "./worldRim";

export const DEFAULT_SEED = 1337;

/**
 * The road class that IS a parking lot's own roadway. Not a new vocabulary —
 * constants.MARKED_CLASSES already keeps `service` out of the lane-line pass
 * with exactly this reading („a car-park aisle, a driveway and a delivery
 * lane … the lot maps are the reason"), and all 14 committed `scenario-lot`
 * maps author their aisle as `service` and their approach as `residential`.
 */
const LOT_AISLE_CLASS = "service";

/**
 * THE WALKWAY BETWEEN A BAY'S HEAD AND THE BLOCK BEHIND IT, m — the only new
 * number the lot enclosure introduces (`lotEnclosure` reuses the terminus
 * closure's depth / setback / height for the questions those already answer).
 *
 * It is measured from the OUTERMOST of two things — the aisle carriageway edge
 * and the bay band — so it is a clearance from anything a car may lawfully
 * occupy, never a clearance from a centreline. On the committed catalogue the
 * carriageway is the binding one (half-width 8.125 m against a bay band that
 * reaches 7.53 m), which puts the frontage 3 m outside the last asphalt and
 * ~3.6 m past the head of a bay: a person can walk between a parked car's nose
 * and the wall, which is what makes it read as a place rather than a barrier,
 * and a car resting in its bay (0.25 m of air at each end of a 5 m bay) has
 * more than three metres before it touches anything.
 *
 * It is deliberately far tighter than TERMINUS_CLOSE_ROAD_CLEAR_M (12 m from a
 * centreline). That guard exists because a STREET's closing mass must never
 * stand where the street still runs. A car park is the opposite case: its
 * edges are the lesson. „Спри успоредно на бордюра" (ЗДвП чл. 94, quoted by
 * sc-park-gap-long task 2 and sc-park-gap-short's briefing) asks the student to
 * judge his car against the lot's edge, so an edge 12 m away would be scenery
 * again.
 */
const LOT_EDGE_CLEAR_M = 3;

/** The four corners of a painted bay, district space, in `markings`'
 *  axes exactly (dir = [sin h, cos h]; right = perpRight(dir) = [dir.y,
 *  -dir.x]) so a 45° bay contributes its diagonal and not its width. */
function bayCorners(bay: ScenarioBayMeta): Vec2[] {
  const h = (bay.headingDeg * Math.PI) / 180;
  const dx = Math.sin(h);
  const dy = Math.cos(h);
  const halfL = bay.lengthM / 2;
  const halfW = bay.widthM / 2;
  const out: Vec2[] = [];
  for (const sl of [-1, 1]) {
    for (const sw of [-1, 1]) {
      out.push([
        bay.x + sl * halfL * dx + sw * halfW * dy,
        bay.y + sl * halfL * dy - sw * halfW * dx,
      ]);
    }
  }
  return out;
}

/**
 * THE BAY SET A DISTRICT PAINTS WHEN THE CALLER SAYS NOTHING.
 *
 * The default used to be `LESSON_PARKING_BAYS` flat, and that list is the CITY
 * district's alone (specs.ts collects the bays of lessons whose district is
 * DEFAULT_DISTRICT_ID). Built bare, EVERY map therefore got the city's L7 rect:
 * on lot-perp-v1 — bounds x ∈ [-28, 11.03] — the markings mesh reached
 * x = 685.0, i.e. 674 m past the far edge of that world, and `stats.parkingBays`
 * read 1 on all 90 scenario districts. A bay billed to a district that has none,
 * while the five bays lot-perp-v1 DOES author in `meta.scenario.bays` were
 * painted only if a caller happened to hand them back in (sweep161
 * sc-park-bay-exit-rev: „content/world/lot-perp-v1.json does carry five bays …
 * so the data exists and the renderer is not drawing it").
 *
 * A District document carries no lesson-district id — `meta.district` is
 * "studentski-grad" while the lessons key on the file id "district-v1" — so
 * membership is tested where it IS decidable in this layer: a bay rect outside
 * the district's own bounds cannot be paint on that district's ground. The city
 * keeps its L7 bay; nobody else inherits it, and every district's own authored
 * lot is drawn because it is the map's data, not the curriculum's.
 *
 * A caller that passes `parkingBays` still wins outright, `[]` included — the
 * option's "pass [] for a bare build" contract is untouched, so the drill mount
 * (lessonWorldRecipe, which already unions both sources) builds byte-identically.
 */
function defaultParkingBays(district: District): readonly ParkingBaySpec[] {
  const b = district.meta.boundsLocalMeters;
  return [
    ...LESSON_PARKING_BAYS.filter(
      (p) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY,
    ),
    ...scenarioBaysOf(district).map(({ x, y, headingDeg, widthM, lengthM }) => ({
      x,
      y,
      headingDeg,
      widthM,
      lengthM,
    })),
  ];
}

/**
 * THE LOT'S GROUND — the apron a `scenario-lot` map never had.
 *
 * Ground-use zoning (terrain.ts) decides paved-vs-grass by proximity to a
 * BUILDING footprint, and a parking lot has no building: a lot district is one
 * 160 m road, one kiosk and five bay rects in `meta.scenario.bays`. Measured on
 * lot-gap-short-v1 before this pass, `terrainPaved` spanned district y ∈
 * [-177.5, -25.0] — it stopped 25 m SHORT of the bays at y ∈ [-14.05, +14.05],
 * so the bays, the parked cars and the entire manoeuvre were painted on a lawn.
 * That is the sweep161 verdict on three drills at once: „the manoeuvre is
 * performed in a void" (sc-park-gap-short), „nothing to be parallel to"
 * (sc-park-gap-long), „an unbroken grass plane with nothing on it"
 * (sc-park-bay-exit-rev, whose car starts IN a bay at x = 5.03 facing east with
 * 3 m of carriageway left in front of it and nothing but grass after).
 *
 * So the lot's own rect goes into the zoning pass as one apron footprint and
 * the lot becomes the concrete terrain.ts's `paved` mesh is documented for
 * („concrete courtyards / parking"). No new constant: the pass pads whatever it
 * is given by TERRAIN_PAVE_NEAR_BUILDING_M (20 m), which on lot-gap-short-v1
 * carries the paving from y = -34.05 to +34.05 — joining the kiosk's apron at
 * y = -25 into one continuous surface from the approach through the lot.
 *
 * THE APRON IS THE LOT, NOT THE BAY BAND — the second half of the same defect,
 * measured over all 14 committed `scenario-lot` maps rather than the one the
 * first pass sampled. Every one of them is a 60–90 m `residential` approach
 * plus a ~70 m `service` AISLE running y ∈ [-30, +40], and on ELEVEN of them the
 * bay band is shorter than the aisle it is served from. Padding the bay band
 * alone therefore stopped the concrete short of the aisle's own dead end —
 * `terrainPaved`'s northmost vertex, against an aisle that ends at y = 40:
 *
 *     lot-narrow                                    25.0  (15.0 m short)
 *     lot-perp / lot-van / lot-wall / lot-double
 *       / lot-left                                  27.5  (12.5 m)
 *     lot-45 / lot-45rev                            30.0  (10.0 m)
 *     lot-gap-short / lot-par                       35.0  ( 5.0 m)
 *     lot-gap-judge                                 37.5  ( 2.5 m)
 *
 * i.e. the last stretch of the parking aisle the drill actually drives to stood
 * on a lawn and the roadway ended in a field — sweep161's „the world runs out
 * mid-lesson" (sc-park-gap-short) on the very map whose bays were, by then,
 * correctly painted and correctly paved. sc-park-bay-exit-rev is the sharpest
 * case: task 2 completes at y = 20 and the student then drives the remaining
 * 20 m of aisle across grass. So the AISLE's own geometry is unioned into the
 * footprint (`service` is this codebase's word for a lot's roadway — see
 * constants.MARKED_CLASSES, „a car-park aisle, a driveway and a delivery
 * lane"), and the apron covers the ground the drill uses. The centre LINE is
 * enough: the 20 m pad already reaches 11.9 m past a 8.125 m half-width kerb.
 *
 * STRICTLY ADDITIVE, twice over:
 *  - `scenario-lot` is the only mapKind gated in (14 of 105 committed maps).
 *    pk-double-v1 and vu-door-v1 also carry `meta.scenario.bays`, but their
 *    bays are KERBSIDE on a street — asphalt, not a courtyard — and they stay
 *    grass-or-whatever-the-buildings-say exactly as before;
 *  - the apron is fed to the terrain call ONLY. `buildProps` keeps the authored
 *    building AABBs it always had, so not one tree, lamp, pole or railing moves.
 */
function lotApronFootprint(district: District): [number, number, number, number] | null {
  // DistrictMeta is an open record, so the kind arrives typed `unknown`; the
  // typeof is what lets the literal comparison through (zoneSigns.ts pattern).
  const mapKind = district.meta.mapKind;
  if (typeof mapKind !== "string" || mapKind !== "scenario-lot") return null;
  const bays = scenarioBaysOf(district);
  if (bays.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const bay of bays) {
    for (const [x, y] of bayCorners(bay)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  // …and the aisle the bays are served from, so the concrete does not stop
  // where the last bay stops. The centre LINE, not the network's ribbon: the
  // pad already supplies the width (20 m against an 8.125 m half-width), and
  // reading `district.roads` keeps this a pure read of the document.
  for (const edge of district.roads.edges) {
    if (edge.class !== LOT_AISLE_CLASS) continue;
    for (const [x, y] of edge.geometry) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * THE LOT'S EDGES — the enclosure `skyline.ts` already assumes and nothing ever
 * built.
 *
 * WHAT THE FRAMES SHOW. sweep161 and the Wave C re-drive agree on three lot
 * drills: „out the windscreen there is literally nothing: one flat olive plane
 * meeting a hazy sky … this is not an unpolished street, it is the absence of a
 * street" (sc-park-bay-exit-rev, whose car is parked nose-EAST in lot-bay-3 and
 * therefore looks at that half-space for the whole lesson); „by t178s the
 * buildings, pavement and kerb are gone" (sc-park-gap-short); „at 05-stopped
 * there is a boulevard with a railing, lamp posts, a tree and a parked row; at
 * t189s all of it is gone" (sc-park-gap-long).
 *
 * WHY IT HAPPENS, MEASURED. Every lot map is one `residential` approach plus
 * one `service` AISLE, and the aisle is where all fourteen drills happen. The
 * dressing passes are gated on `SCENARIO_LIT_CLASSES` (arterials + residential
 * + unclassified + living_street) — `service` is in none of them — so on
 * lot-perp-v1 / lot-gap-short-v1 / lot-gap-long-v1 the built world reads:
 *
 *     sidewalks (the KERB)  district y ∈ [-118.8, -33.2]   aisle: y ∈ [-30, 40]
 *     last roadside tree                        y = -43
 *     last lamp column                          y = -40
 *     terminus closures     2, both at y ≈ -138…-158 — the APPROACH's far end,
 *                           140 m BEHIND the start, because that end is
 *                           `residential` and the aisle's dead end is not.
 *
 * i.e. the approach is a fully dressed street and the lot is bare ground with
 * paint on it. That is one defect, not three, and it is why the 05-stopped
 * frame of every one of these lessons is a proper street and the manoeuvre
 * frame is a plane.
 *
 * AND THE HORIZON WAS ALREADY SPENT ON THE PROMISE OF THIS. `environment/
 * skyline.ts` removes the Vitosha ridge on `scenario-lot` because the scene is
 * „ENCLOSED — nowhere to hang a distant massif", reasoning that a ridge beyond
 * the enclosure „is exactly the tell that the enclosure is painted scenery
 * rather than a real place". The ridge went; the enclosure never arrived. So
 * the lot is the one map kind in the product with neither a far horizon nor a
 * near edge, which is precisely „one flat olive plane meeting a hazy sky".
 *
 * WHAT IS BUILT. A U of three volumes in the aisle's own frame — a flank down
 * each side of the aisle and a frontage across its dead end, butt-jointed at
 * the two corners so no slit opens on the axis the student drives down. They
 * are BUILDING VOLUMES through `buildBuildings`' `extraVolumes` seam, exactly
 * as terminus.ts's closing masses are, for exactly the reasons its header
 * gives: the four facade meshes and the roof are drawn on every district
 * already, so this costs +0 draw calls and 18 triangles each, and the same
 * loop merges their walls into `colliders.buildings`, so they are edges a car
 * cannot drive through rather than painted scenery. (18, not the terminus
 * header's 26: at TERMINUS_CLOSE_MIN_HEIGHT_M = 9 m the prism falls just under
 * `buildings.ts`'s cornice threshold of 2 × GROUND_BAND_M + CORNICE_DEPTH_M =
 * 9.1 m, so each wall is two rows rather than three. Measured over all 14 lot
 * maps: stats.triangles +54, stats.vertices +160 wall/roof, staticDrawSlots
 * and stats.buildings both unchanged.)
 *
 * WHAT ELSE THE VOLUMES TOUCH, because `extraVolumes` returns an aabb. The
 * three boxes join `buildings.aabbs`, which is handed to `buildProps` and to
 * `buildTerrain`. Measured old-vs-new over all 14 lot maps: not one prop moves
 * (trees / streetlights / utilityPoles / railings / signs identical), because
 * every prop on a lot map stands on the `residential` approach at y ≤ -30 and
 * the flanks start at the junction radius, y ≈ -28. Terrain DOES change, in
 * the direction this pass wants: `terrain.ts` flattens relief within 6 m of a
 * building box, so the blocks sit flush rather than on noise, and its
 * paved-ground zoning follows them — on lot-perp-v1 `terrainPaved` grows from
 * district x ≤ 39.8 / y ≤ 60 to x ≤ 45.5 / y ≤ 92.5, i.e. the courtyard's
 * concrete now reaches the blocks instead of stopping in a field.
 *
 * WHY A COURTYARD BLOCK AND NOT A FENCE. This is where a 17-year-old actually
 * parks: the междублоково parking of a Sofia block. The three constants that
 * are not new say so — the mass stands TERMINUS_CLOSE_NEAR_M past the last
 * asphalt, is TERMINUS_CLOSE_DEPTH_M deep („a block, not a billboard") and
 * takes TERMINUS_CLOSE_MIN_HEIGHT_M, the FLOOR of the band a closing mass may
 * take on a scenario street. The floor rather than the district median because
 * a lot's own frontage is a 3.5 m kiosk, and because 9 m at 11 m lateral
 * subtends 39° from the driver's eye: an edge, not a canyon.
 *
 * WHAT THIS DOES NOT DO, SO NOBODY READS IT AS DONE. It gives the lot EDGES.
 * It does not give it a KERB — the raised бордюр „спри успоредно на бордюра"
 * names is `roads.ts`'s sidewalk pass, which stops at the aisle for the same
 * class reason, and that pass is not this file's. Nor lamps, trees or railings
 * (props.ts, same gate). Those remain open against `SCENARIO_LIT_CLASSES`.
 *
 * ADDITIVE BY CONSTRUCTION. Four independent gates: `mapKind` must be
 * `scenario-lot` (14 of 105 committed maps — pk-double-v1 and vu-door-v1 carry
 * bays on a STREET and are untouched); the map must author bays; it must have a
 * `service` aisle with exactly one dead end; and that aisle must be straight.
 * Every city / exam / полигон / street district builds byte-identically.
 */
function lotEnclosure(district: District, network: RoadNetwork): DistrictBuilding[] {
  const mapKind = district.meta.mapKind;
  if (typeof mapKind !== "string" || mapKind !== "scenario-lot") return [];
  const bays = scenarioBaysOf(district);
  if (bays.length === 0) return [];

  // The lot's own roadway: the longest `service` edge. `network` rather than
  // the document because the built half-width — the thing the clearance is
  // measured from — lives there.
  let longest: (typeof network.edges)[number] | null = null;
  for (const e of network.edges) {
    if (e.edge.class !== LOT_AISLE_CLASS) continue;
    if (!longest || e.edge.length > longest.edge.length) longest = e;
  }
  if (!longest) return [];
  const aisle = longest;

  // Which end runs out of the world. Exactly one endpoint of a lot aisle is a
  // dead end (the other is the junction with the approach); anything else is a
  // shape this pass does not understand, and it declines rather than guesses.
  const fromIsDead = network.deadEnds.has(aisle.edge.from);
  const toIsDead = network.deadEnds.has(aisle.edge.to);
  if (fromIsDead === toIsDead) return [];

  const g = aisle.edge.geometry as Vec2[];
  const first = g[0]!;
  const last = g[g.length - 1]!;
  // `edge.from` is geometry[0] (the convention terminus.ts reads too).
  const origin = fromIsDead ? last : first;
  const tip = fromIsDead ? first : last;
  const originNodeId = fromIsDead ? aisle.edge.to : aisle.edge.from;
  const lengthM = Math.hypot(tip[0] - origin[0], tip[1] - origin[1]);
  if (lengthM < 1e-6) return [];
  const axis: Vec2 = [(tip[0] - origin[0]) / lengthM, (tip[1] - origin[1]) / lengthM];
  const lateral = perpRight(axis);
  const sOf = (p: Vec2) => (p[0] - origin[0]) * axis[0] + (p[1] - origin[1]) * axis[1];
  const uOf = (p: Vec2) => (p[0] - origin[0]) * lateral[0] + (p[1] - origin[1]) * lateral[1];

  // A straight aisle only: the frame above is the CHORD, so a bent aisle would
  // put its flanks across its own carriageway. All 14 committed lot maps author
  // a single two-point segment; a future curved one gets nothing rather than a
  // wall in the road, and the catalogue test says loudly if that ever happens.
  for (const p of g) {
    const s = sOf(p);
    if (Math.abs(uOf(p)) > 0.5 || s < -0.5 || s > lengthM + 0.5) return [];
  }

  // Start where the junction's own open area ends, so no flank stands on the
  // patch the approach opens into the lot.
  const s0 = network.nodes.get(originNodeId)?.radius ?? 0;
  // …and run past the dead end far enough to butt into the end frontage, so the
  // two corners of the U are closed rather than 18 m slits on the driven axis.
  const s1 = lengthM + TERMINUS_CLOSE_NEAR_M + TERMINUS_CLOSE_DEPTH_M;
  if (s1 <= s0) return [];

  /**
   * District-space rect from two (s, u) corners.
   *
   * The ring is emitted in (s, u) order and NOT re-wound here: the two flanks
   * are mirror images in `u`, so one of them always comes out clockwise, and
   * `buildings.buildOne` opens with `toCCW(b.footprint)` for exactly that
   * reason — „CCW ring -> interior on the left -> outward normal = right of
   * travel". Re-winding here as well would be a second answer to a question
   * that already has one, and one no test could tell from the first.
   */
  const rect = (id: string, sA: number, sB: number, uA: number, uB: number): DistrictBuilding => {
    const at = (s: number, u: number): [number, number] => [
      origin[0] + s * axis[0] + u * lateral[0],
      origin[1] + s * axis[1] + u * lateral[1],
    ];
    return {
      id,
      height: TERMINUS_CLOSE_MIN_HEIGHT_M,
      heightSource: "height",
      footprint: [at(sA, uA), at(sB, uA), at(sB, uB), at(sA, uB)],
    };
  };

  /** Inner face of the flank on `side`: outside BOTH the carriageway and any
   *  bay painted on that side, then the walkway. */
  const innerFace = (side: 1 | -1): number => {
    let out = aisle.halfWidth;
    for (const bay of bays) {
      for (const c of bayCorners(bay)) {
        const u = uOf(c);
        if (u * side <= 0) continue;
        out = Math.max(out, Math.abs(u));
      }
    }
    return out + LOT_EDGE_CLEAR_M;
  };

  const innerRight = innerFace(1);
  const innerLeft = innerFace(-1);
  const tag = `${district.meta.district}-lot-enclosure`;
  return [
    rect(`${tag}-r`, s0, s1, innerRight, innerRight + TERMINUS_CLOSE_DEPTH_M),
    rect(`${tag}-l`, s0, s1, -innerLeft, -(innerLeft + TERMINUS_CLOSE_DEPTH_M)),
    rect(
      `${tag}-end`,
      lengthM + TERMINUS_CLOSE_NEAR_M,
      lengthM + TERMINUS_CLOSE_NEAR_M + TERMINUS_CLOSE_DEPTH_M,
      -innerLeft,
      innerRight,
    ),
  ];
}

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
  // `district` is passed for ONE decision the network cannot carry: a
  // `scenario-lot` map's `service` aisle is a car park's roadway and gets the
  // kerb the drill's own task names («спри успоредно на бордюра»). See
  // `roads.lotAisleKerbEdgeIds` for the measurement and the four gates.
  const roads = buildRoads(network, rings, district);
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
  // THE LOT'S EDGES — the same seam, for the map kind terminus.ts declines
  // because a car park's roadway is `service`. Empty on all 91 non-lot
  // districts; see `lotEnclosure`.
  const lotEdges = lotEnclosure(district, network);
  // THE WORLD'S RIM (builders/worldRim.ts). terminus.ts closes ONE axis — the
  // dead end of a street, in the direction that street runs; this closes the
  // other 350°, which is the direction every void frame in the w11 sweep was
  // shot in. It stands down wherever the map already carries frontage that far
  // out, so it is additive against the authored world by construction. LAST in
  // `extraVolumes`, and the terrain call below leans on that (see there).
  const worldRim = buildWorldRim(district, network, [
    ...district.buildings,
    ...terminusClosures.map((c) => c.volume),
    ...lotEdges,
  ]);
  const buildings = buildBuildings(district.buildings, towerIds, [
    ...terminusClosures.map((c) => c.volume),
    ...lotEdges,
    ...worldRim,
  ]);
  // THE AABBs THE GROUND-USE ZONING MAY SEE. `buildBuildings` appends the extra
  // volumes to `aabbs` in the order they were handed in, so dropping the last
  // `worldRim.length` entries drops exactly the rim and nothing else.
  //
  // The rim is kept out of TERRAIN, and only terrain — `terrain.ts` paves every
  // cell within TERRAIN_PAVE_NEAR_BUILDING_M (20 m) of a building box, so a
  // belt that ran all the way round the world would lay a 20 m concrete ring
  // around every district. `lessonWorldRecipe`'s header already files stray
  // `terrainPaved` as a defect in its own right („a car that leaves the
  // carriageway drives onto a 400 m concrete apron"), and answering a void with
  // a ring road of pavement would be answering it with a bigger one. PROPS do
  // still see the rim (below): the terminus grove plants up to 44 m past a
  // boundary end, which is inside the belt, and a tree growing out of a wall is
  // the one thing worse than no wall.
  const nonRimAabbs = buildings.aabbs.slice(0, buildings.aabbs.length - worldRim.length);
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
  // The default is district-scoped since sweep161; see `defaultParkingBays`.
  const markings = buildMarkings(
    district,
    network,
    props.stopSignApproaches,
    props.giveWayApproaches,
    options.parkingBays ?? defaultParkingBays(district),
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
  // The ground-use zoning list is the building AABBs PLUS the parking-lot
  // apron, so a lot is not a lawn — see `lotApronFootprint`. `null` (and so a
  // byte-identical call) on every district that is not a `scenario-lot`.
  const lotApron = lotApronFootprint(district);
  const terrain = buildTerrain(
    district,
    network,
    lotApron ? [...nonRimAabbs, lotApron] : nonRimAabbs,
    112,
  );

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
      markings.markingQuads +
      roundabouts.ringDividerQuads +
      roundabouts.ringEdgeQuads +
      crossingFurniture.furnitureQuads,
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
    /** Wave 8 — the median guard rail of a divided motorway. 0 on the 102
     *  districts with no anti-parallel motorway pair. */
    medianBarriers: props.medianBarriers.length,
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
      medianBarriers: props.medianBarriers,
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
    medianBarriers: props.medianBarriers,
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
