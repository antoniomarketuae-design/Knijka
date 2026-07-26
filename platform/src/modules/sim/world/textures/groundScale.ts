/**
 * Ground texel-scale facts — the numbers that must agree between the meshes
 * that share a texture set. Deliberately its OWN module with no imports:
 * pbrTextures.ts pulls in the quality/download-budget graph, and the paint
 * hook (markingWear.ts) needs nothing but the number.
 */

/**
 * Real-world metres ONE tile of the road photograph covers (Asphalt031
 * publishes no physical size — doc 71 §4.4's ruling for road-asphalt tiles).
 * This is the PHOTOGRAPH's fact and nothing else; the number the meshes
 * actually sample at is ROAD_TILE_SPAN_M below.
 */
export const ROAD_TEXTURE_TILE_M = 3;

/**
 * Optic-flow divisor (doc 82 F4, folded into V5). The road tile is
 * deliberately sampled at HALF its assumed physical size.
 *
 * F4 asks for roughly double the near-field flow rate, on the evidence that
 * road-surface detail flow is the one speed cue that does NOT distort the
 * 10–30 m distance judgements the rule engine grades (unlike widening the
 * FOV, which `COCKPIT_FOV_MAX = 56` forbids outright). The doc phrases the
 * dial as "halve ASPHALT_UV_SCALE", but that constant stopped being the
 * density dial when pbrTextures started COMPUTING `repeat` from
 * `uvMetresPerUnit / realWorldSizeM`: halving the builder's UV scale alone is
 * exactly cancelled by the recomputed repeat and changes nothing on screen.
 * The equivalent, contract-safe dial is the tile span — so the flow doubles
 * here, once, where both consumers read it.
 *
 * 3 m was itself an ASSUMPTION (ambientCG publishes dimension 0 for
 * Asphalt031), so halving it to 1.5 m is a re-ruling of a guess, not a
 * violation of a measurement: at 1.5 m the aggregate reads as ~15 mm chips at
 * a 1024² map, which is what Bulgarian urban wearing course actually is. The
 * repetition this buys is paid for by the 2-tap rotated blend in
 * roadSurface.ts — the doc pairs the two for exactly this reason.
 *
 * Two consumers must agree on it or the illusion breaks:
 *  - pbrTextures.GROUPS.road, which derives the texture `repeat` from it and
 *    the builders' metres/7 planar UVs;
 *  - markingWear.ts, which cannot use the markings mesh's per-quad 0..1 UVs
 *    for tiling and derives the paint's map UV in WORLD XZ instead. If the
 *    paint's micro-relief tiled at a different rate from the asphalt 12 mm
 *    below it, the paint would read as a decal — which is the exact defect
 *    doc 82 V1 exists to remove.
 */
export const ROAD_TILE_FLOW_DIVISOR = 2;

/** Metres of road ONE asphalt tile spans on screen — the number that sets
 *  both the texel density and the optic-flow rate. */
export const ROAD_TILE_SPAN_M = ROAD_TEXTURE_TILE_M / ROAD_TILE_FLOW_DIVISOR;
