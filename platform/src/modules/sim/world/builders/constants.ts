/**
 * World-builder dimensional constants. Meters. Single source of truth for
 * both the visual meshes and the colliders — keep in sync with the vehicle
 * harness assumptions (12 cm drivable curb, car ~4.2 m).
 */

/** Bulgarian urban lane width standard. */
export const LANE_WIDTH_M = 3.25;

/** Road surface height above the physics ground plane top. */
export const ROAD_Y = 0.02;
/** Paint sits slightly proud of the asphalt to avoid z-fighting. */
export const MARKING_Y = ROAD_Y + 0.012;
/** Junction patches sit a hair below ribbons (overlap-safe at corners). */
export const JUNCTION_Y = ROAD_Y - 0.003;

/** Raised curb height — must stay drivable per the vehicle harness. */
export const CURB_HEIGHT_M = 0.12;
export const SIDEWALK_TOP_Y = ROAD_Y + CURB_HEIGHT_M;
export const SIDEWALK_WIDTH_M = 2.0;
/** Outer skirt from sidewalk top back down to terrain. */
export const SIDEWALK_SKIRT_M = 0.35;

/** Extra open-corner radius added past the widest approach at junctions. */
export const JUNCTION_CORNER_RADIUS_M = 2.0;
/** Setback used at degree-2 joints (way splits) to stitch tangents. */
export const JOINT_SETBACK_M = 0.6;

/** Marking paint dimensions (М-series, stylized). */
export const DASH_LENGTH_M = 2.5;
export const DASH_GAP_M = 4.0;
export const DASH_WIDTH_M = 0.12;
export const EDGE_LINE_WIDTH_M = 0.15;
export const EDGE_LINE_INSET_M = 0.25;
export const STOP_LINE_WIDTH_M = 0.4;
export const ZEBRA_STRIPE_ACROSS_M = 0.5; // stripe width across the road
export const ZEBRA_GAP_M = 0.4;
export const ZEBRA_LENGTH_M = 4.0; // extent along the road axis

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

/** Terrain relief: keep subtle (visual only, collider stays flat). */
export const TERRAIN_MARGIN_M = 60;
export const TERRAIN_MAX_RELIEF_M = 0.25;
export const TERRAIN_FLAT_NEAR_ROAD_M = 14;
export const TERRAIN_FULL_RELIEF_M = 38;

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
