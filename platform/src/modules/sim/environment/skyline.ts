// V3's skyline gate — doc 82 §3.2 V3, "Gate off on poligon/lot maps".
//
// The Vitosha ridge is drawn INSIDE the sky-dome fragment shader (skyShader.ts),
// so the only way to switch it off per-map is a uniform, and the only honest
// source for "does this scene even have a far horizon?" is the map itself.
// Every generated district carries `meta.mapKind` (tools/maps/gen_*.mjs writes
// it; world/builders/markings.ts + zoneSigns.ts already branch on it), so the
// gate reads THAT rather than a hardcoded list of district ids — otherwise
// every new parking-lot map would have to be remembered into the list, and the
// one that is forgotten renders a 2,290 m massif over a 5-bay car park.
//
// Deliberately three-free and React-free: SkyDome/SimEnvironment are "use
// client" three.js modules, while this rule has to be assertable in plain Node
// against all the shipped district files (see __tests__/skyline.test.ts).

/**
 * Map kinds whose scene is ENCLOSED — nowhere to hang a distant massif.
 *
 * - `training-ground` — the fenced учебен полигон (закрита площадка), 380×260 m
 *   inside its own perimeter. A ridge rising beyond that fence is exactly the
 *   tell that the enclosure is painted scenery rather than a real place.
 * - `scenario-lot` — the parking micro-maps: one aisle, five bays and a ~90 m
 *   approach. There is no city around them, let alone a mountain 15 km south
 *   of one.
 *
 * Every other kind (`scenario-street` / `-junction` / `-roundabout` / `-vru*`,
 * plus the two OSM city districts that predate mapKind) IS a Sofia street, and
 * doc 82 §1.4 names Vitosha the cheapest Bulgaria-recognition cue there is —
 * so it stays.
 */
export const ENCLOSED_MAP_KINDS: readonly string[] = ["training-ground", "scenario-lot"];

/**
 * Does the map described by `mapKind` show the distant Vitosha ridge?
 *
 * `unknown` in, because DistrictMeta is an open record (`[key: string]:
 * unknown`) and the two hand-fetched OSM districts carry no mapKind at all.
 * An absent or unrecognised value therefore means "not one of the enclosed
 * kinds" and keeps the ridge ON: doc 82 §1.2 calls a missing skyline the
 * „flat-earth test level" tell, so ONLY a recognised enclosed kind is allowed
 * to remove it — never a typo, never a new map kind nobody classified.
 */
export function mapKindHasSkyline(mapKind: unknown): boolean {
  return !(typeof mapKind === "string" && ENCLOSED_MAP_KINDS.includes(mapKind));
}
