// District selection for the OSM → world pipeline.
// To target a different district: change `name`, `label`, `bbox` (and re-run
// `node fetch.mjs --force`, then `node build.mjs`). Keep the box near ~1 km²
// so the built district stays lesson-sized and under the 2 MB output budget.

/**
 * Chosen district: Студентски град (Studentski grad), Sofia.
 *
 * Why (scoping probe against Overpass, 2026-07):
 * - Contains a real multi-way roundabout at ул. „Акад. Борис Стефанов" /
 *   ул. „8-ми декември" (~42.6564, 23.3532) — required for roundabout lessons.
 *   The candidate Младост-1 box had zero mapped roundabouts.
 * - The bbox was optimized over real signal-node positions: this window holds
 *   ~16 traffic_signals nodes (junction clusters on бул. „Св. Климент Охридски"
 *   and бул. „Д-р Г. М. Димитров") — the best signal count of any ~1 km²
 *   window that also contains the roundabout.
 * - Mixed road classes: primary (Г. М. Димитров) + secondary (Климент
 *   Охридски) arterials, tertiary collectors, dense residential student grid —
 *   no motorway/trunk complexity; right difficulty for beginner lessons.
 * - Mostly flat → low mesh-generation complexity; elevation deferred to wave 2.
 */
export const DISTRICT = {
  name: "studentski-grad",
  label: "Студентски град (Studentski grad), Sofia, Bulgaria",
  // ~1.00 km (S–N) × ~1.04 km (W–E) ≈ 1.04 km²
  bbox: {
    south: 42.655,
    west: 23.3473,
    north: 42.664,
    east: 23.36,
  },
};

/** Projection origin = bbox center (equirectangular local tangent plane). */
export function districtCenter(d = DISTRICT) {
  return {
    lat: (d.bbox.south + d.bbox.north) / 2,
    lon: (d.bbox.west + d.bbox.east) / 2,
  };
}

/** Road classes that enter the drivable graph (drivable by a car in lessons). */
export const DRIVABLE_HIGHWAY = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);

/** service=* values that are noise for lessons (private accesses, aisles). */
export const EXCLUDED_SERVICE = new Set(["driveway", "parking_aisle", "emergency_access"]);
