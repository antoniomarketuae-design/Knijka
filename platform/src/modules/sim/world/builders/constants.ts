/**
 * World-builder dimensional constants. Meters. Single source of truth for
 * both the visual meshes and the colliders — keep in sync with the vehicle
 * harness assumptions (12 cm drivable curb, car ~4.2 m).
 *
 * Road dimensions are PERCEPTUALLY SCALED (contracts.PERCEPTUAL_ROAD_SCALE,
 * founder call 2026-07-10): textbook 3.25 m lanes read miniature on screen,
 * so the whole road cross-section (lanes, sidewalks, parking, paint, corner
 * fillets) runs 2.5× while the car stays real-size.
 */

import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";

/** Bulgarian urban lane width standard (3.25 m), perceptually scaled. */
export const LANE_WIDTH_M = 3.25 * PERCEPTUAL_ROAD_SCALE;

/** Road surface height above the physics ground plane top. */
export const ROAD_Y = 0.02;
/** Paint sits slightly proud of the asphalt to avoid z-fighting. */
export const MARKING_Y = ROAD_Y + 0.012;
/** Junction patches sit a hair below ribbons (overlap-safe at corners). */
export const JUNCTION_Y = ROAD_Y - 0.003;

/** Raised curb height — must stay drivable per the vehicle harness. */
export const CURB_HEIGHT_M = 0.12;
export const SIDEWALK_TOP_Y = ROAD_Y + CURB_HEIGHT_M;
/** Scaled with the road cross-section (real ~2 m read like a curb strip). */
export const SIDEWALK_WIDTH_M = 3.5;
/** Outer skirt from sidewalk top back down to terrain. */
export const SIDEWALK_SKIRT_M = 0.35;

/**
 * Extra open-corner (curb fillet) radius added past the widest approach at
 * junctions, by the junction's dominant road class. Real Sofia curb radii run
 * 6–12 m; the old flat 2 m read like a model railway and forced implausible
 * turning lines (doc 68 QW3 / audit 03 B2). Scaled ~1.5× with the perceptual
 * road scale so mouths stay proportionate to the 2.5× lanes.
 */
export const JUNCTION_CORNER_RADIUS_MINOR_M = 9; // residential/service/unclassified
export const JUNCTION_CORNER_RADIUS_TERTIARY_M = 12;
export const JUNCTION_CORNER_RADIUS_ARTERIAL_M = 15; // secondary/primary

/** Corner radius for a junction whose widest incident road has `maxRank`. */
export function junctionCornerRadiusM(maxRank: number): number {
  if (maxRank >= 4) return JUNCTION_CORNER_RADIUS_ARTERIAL_M;
  if (maxRank === 3) return JUNCTION_CORNER_RADIUS_TERTIARY_M;
  return JUNCTION_CORNER_RADIUS_MINOR_M;
}

/** Setback used at degree-2 joints (way splits) to stitch tangents. */
export const JOINT_SETBACK_M = 0.6;

/**
 * Curbside parking-lane band added to each side of arterial-class streets
 * (doc 68 QW3 / audit 03 B2): real Студентски град streets read 9–12 m
 * curb-to-curb because cars park along both curbs — the bare lanes×3.25
 * cross-section is what made streets read miniature. The band is part of the
 * carriageway ribbon (asphalt + colliders + sidewalks all shift out with it)
 * and is tinted separately so it reads as parking, not as an extra lane.
 * Sized so TrafficLayer's parked-car pass (travelHalf + 2.0 m center offset,
 * car half-width 0.95 m) sits fully inside the band.
 */
export const PARKING_LANE_WIDTH_M = 4.0;
/** Road classes that carry the parking band (links excluded — short stubs). */
export const PARKING_LANE_CLASSES: ReadonlySet<string> = new Set([
  "primary",
  "secondary",
  "tertiary",
]);
/** Parking band stops this far short of the ribbon ends (no parking within
 *  5 m of a junction, ЗДвП чл. 98) — the bare mouth reads as approach flare. */
export const PARKING_LANE_END_INSET_M = 5;
/** Parking band tint mesh sits between asphalt and paint (z-fight-safe). */
export const PARKING_LANE_Y = ROAD_Y + 0.006;

/** Marking paint dimensions (М-series, stylized). Scaled with the road —
 * textbook paint on an 8 m lane reads like thread (perceptual road scale). */
export const DASH_LENGTH_M = 5.0;
export const DASH_GAP_M = 8.0;
export const DASH_WIDTH_M = 0.25;
export const EDGE_LINE_WIDTH_M = 0.3;
export const EDGE_LINE_INSET_M = 0.5;
export const STOP_LINE_WIDTH_M = 0.8;
export const ZEBRA_STRIPE_ACROSS_M = 0.8; // stripe width across the road
export const ZEBRA_GAP_M = 0.6;
export const ZEBRA_LENGTH_M = 6.0; // extent along the road axis

/** Building facade texture bay: one window per 3 m x 3 m. */
export const FACADE_BAY_M = 3;
/** Facade texture holds 4x4 bays. */
export const FACADE_TILE_M = FACADE_BAY_M * 4;
/** Darker ground-floor band height (vertex-color multiplier). */
export const GROUND_BAND_M = 4.0;
export const GROUND_BAND_TINT = 0.62;
export const FACADE_VARIANTS = 4;

/** Road classes that receive painted lane lines. */
export const MARKED_CLASSES: ReadonlySet<string> = new Set([
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
]);

/** Road classes that get sidewalks. */
export const SIDEWALK_CLASSES: ReadonlySet<string> = new Set([
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
  "living_street",
]);

/** Arterial classes: streetlights + solid edge lines. */
export const ARTERIAL_CLASSES: ReadonlySet<string> = new Set([
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
]);

/** Priority rank per class for stop/give-way sign placement. */
export const CLASS_RANK: Readonly<Record<string, number>> = {
  primary: 5,
  primary_link: 5,
  secondary: 4,
  secondary_link: 4,
  tertiary: 3,
  tertiary_link: 3,
  unclassified: 2,
  residential: 2,
  living_street: 1,
  service: 1,
};

/** Terrain relief: keep subtle (visual only, collider stays flat). Flat band
 * covers the widest scaled carriageway (max half-width ~28 m) so relief never
 * pokes through the asphalt. */
export const TERRAIN_MARGIN_M = 60;
export const TERRAIN_MAX_RELIEF_M = 0.25;
export const TERRAIN_FLAT_NEAR_ROAD_M = 30;
export const TERRAIN_FULL_RELIEF_M = 54;

/**
 * Ground-use zoning: terrain cells whose centre is within this distance of any
 * building footprint are paved (concrete courtyards / parking / plazas of the
 * built-up fabric) instead of grassed. Everything farther stays grass, so
 * genuine open space (parks, district edges) reads green while the city core
 * reads paved — the "park with roads → city" fix, no new assets.
 */
export const TERRAIN_PAVE_NEAR_BUILDING_M = 20;

export const STREETLIGHT_SPACING_M = 28;
export const STREET_TREE_SPACING_M = 22;
export const PARK_TREE_GRID_M = 18;

// --- streetscape v2 dressing (doc 70 REF 1 + REF 3) --------------------------

/** Leafy-tree row spacing along arterial streets (REF 3's tree-lined roads). */
export const ARTERIAL_TREE_SPACING_M = 26;
/** How many primary-class streets (grouped by name, longest first) get palms
 *  instead of leafy rows — the premium/waterfront-flavored boulevards. */
export const PALM_STREET_COUNT = 2;
/** Minimum distance between roadside billboards (sparse: one per ~150–200 m). */
export const BILLBOARD_MIN_SPACING_M = 150;
/** Billboards keep clear of the junction mouth by at least this much. */
export const BILLBOARD_END_INSET_M = 20;
/** Bus-stop shelter distance past the junction mouth (>= 25 m required). */
export const BUS_STOP_FROM_MOUTH_M = 28;
/** Minimum separation between two placed shelters. */
export const BUS_STOP_MIN_SEPARATION_M = 150;
/** Deterministic shelter count cap (target 4–8 district-wide). */
export const BUS_STOP_MAX_COUNT = 6;
