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
/**
 * Top chamfer on the street-facing curb edge (doc 71 §4.4): a sharp 90° edge
 * catches no light and reads CG; the 2 cm bevel catching the low golden-hour
 * sun is what makes street edges read 3D. VISUAL polish only — CURB_HEIGHT_M
 * and the sidewalk top height are unchanged, so the 12 cm drivable-curb
 * physics contract holds (the collider merely gains the same 2 cm bevel at
 * the very top of the face).
 */
export const CURB_CHAMFER_M = 0.02;
/** Scaled with the road cross-section (real ~2 m read like a curb strip). */
export const SIDEWALK_WIDTH_M = 3.5;
/** Outer skirt from sidewalk top back down to terrain. */
export const SIDEWALK_SKIRT_M = 0.35;

/**
 * How far a street's pavement strip starts INSIDE its junction-trimmed
 * centreline, so junction corners stay open for the corner apron.
 *
 * Extracted so the roundabout mouth's kerb return can end exactly where the
 * arm's own pavement begins (builders/roundabout.ts `ringMouthKerbRuns`).
 * Two copies of `Math.min(1.2, len * 0.08)` would leave either a hole in the
 * kerb or a co-planar overlap at every mouth, and both are visible from the
 * driving seat.
 */
export const SIDEWALK_END_INSET_M = 1.2;
export const SIDEWALK_END_INSET_FRACTION = 0.08;

/** Pavement start inset for a trimmed centreline `lineLenM` long. */
export function sidewalkEndInsetM(lineLenM: number): number {
  return Math.min(SIDEWALK_END_INSET_M, lineLenM * SIDEWALK_END_INSET_FRACTION);
}

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

// --- baked ground wear (doc 71 §4.4 vertex-color wear — free at runtime) ----

/**
 * Wheel-track darkening on road ribbons: two subtle darker bands where tyres
 * actually run, baked into the road geometry's vertex colors at build time
 * (multiplies the asphalt map — the racing-sim "groove map" trick for free).
 * Track offset is from the LANE centre; the car stays real-size under the
 * perceptual road scale, so a real ~1.6 m axle track (±0.8–0.9 m) applies.
 */
export const WHEEL_TRACK_OFFSET_M = 0.9;
/** Half-width of one darkened wheel band (full band ~1.1 m, soft edges). */
export const WHEEL_TRACK_BAND_HALF_M = 0.55;
/**
 * Luminance multiplier at the centre of a wheel band. 0.82 → 0.72 (doc 82
 * V4 „lift the baked wheel-track wear"): at ×0.82 the groove was ~1.5 sRGB
 * steps of separation once the asphalt map, the macro noise and AgX had all
 * had their say — measurable in the buffer, invisible on screen. ×0.72 is
 * still well short of a painted stripe (a real polished wheel track runs
 * ×0.6–0.75 against fresh asphalt) but finally reads as a groove at the
 * 20–60 m the cockpit camera actually looks at, which is what tells the eye
 * where the lane's traffic runs. Free: it is a vertex colour on geometry
 * that already carries the attribute.
 */
export const WHEEL_TRACK_TINT = 0.72;
/** Gutter grime band against the outer ribbon edges (dirt collects there). */
export const GUTTER_BAND_M = 0.45;
/** Lifted with the wheel tracks (0.86 → 0.80) so the carriageway edge keeps
 *  reading dirtier than the lane it borders after the track dips deepened. */
export const GUTTER_TINT = 0.8;
/** AO-ish tint at the curb-face foot (grime shadow where asphalt meets curb). */
export const CURB_FOOT_TINT = 0.78;
/** Slight grime on the sidewalk's outer skirt (grounds it against terrain). */
export const SIDEWALK_SKIRT_TINT = 0.9;

// --- batched road decals (doc 71 §4.4 — ONE quad batch, ONE draw call) ------

/**
 * Average spacing: ~one decal per 10 m of ribbon centreline (doc 82 V4, was
 * 40 m). On a perceptually-scaled 8.125 m lane, 40 m spacing is one blob per
 * ~325 m² — the six authored atlas cells were statistically invisible and the
 * carriageway read as a clean slab. 10 m lands ~one per 80 m², which is what
 * a real Sofia street carries. It costs nothing in draws: every decal is a
 * quad in the SAME batch sharing the SAME atlas, so this trades ~6 k
 * triangles on the city map for the whole surface-wear system actually being
 * seen.
 */
export const ROAD_DECAL_SPACING_M = 10;
/**
 * Decals keep clear of ribbon ends (junction paint: stop lines sit at the
 * cut + 0.6 m, zebras hug the mouth — doc 71 "avoid junction paint").
 *
 * 6 m → 1.5 m (doc 82 V4). The 6 m skirt was a full car length at both ends
 * of every ribbon AND the junction patches got nothing at all, so the most
 * driven, most worn part of the network — a 2.5×-scaled 4-way is ~1,600 m²
 * of asphalt — was the cleanest surface in the world. Junction interiors are
 * now dressed by their own pass (buildJunctionDecals below); this inset only
 * has to keep the mouth PAINT legible, and 1.5 m does that.
 *
 * It is a clearance for the decal's EDGE, not its centre. Applying 1.5 m to
 * the centre was the P2 defect: the biggest atlas cells are 5.0 m across
 * (half-extent 2.5 m) and `patch` is rotated to the ribbon axis, so a centre
 * at s = 1.5 m spanned −1.0…+4.0 m — over the approach cut, over the stop
 * line at cut + STOP_LINE_BEYOND_CUT_M, and with the overhang 3 mm ABOVE the
 * junction patch it lands on. decals.ts therefore adds each cell's own
 * along-ribbon half-extent to this constant (`alongRibbonHalf`).
 */
export const ROAD_DECAL_END_INSET_M = 1.5;
/**
 * Clearance kept between ANY decal quad and ANY painted marking polygon
 * (decals.ts MarkingKeepOut). Grime on asphalt is the point of the wear
 * system; grime UNDER a zebra bar, a stop line or a lane dash reads as a bug
 * and costs marking legibility — and the rule engine grades the student on
 * seeing exactly those markings, so paint wins every tie.
 *
 * 0.25 m is one dash-width of breathing room: enough that the paint edge stays
 * crisp at the 20–60 m the cockpit camera reads, small enough that wear still
 * runs right up beside the lane lines where real traffic polishes it.
 */
export const DECAL_MARKING_CLEARANCE_M = 0.25;
/**
 * How many times a decal slot re-draws (cell, size, position, rotation) before
 * it is abandoned. Without retries the marking keep-out would simply delete
 * every decal near paint, which on a 4-lane arterial is most of the
 * carriageway — the density doc 82 V4 exists to deliver. With retries the slot
 * usually resolves to a smaller cell tucked between the dashes instead, so the
 * keep-out costs coverage only where the paint really is that dense.
 */
export const DECAL_PLACEMENT_ATTEMPTS = 6;
/** Decals are EXACTLY co-planar with the asphalt (polygonOffset resolves the
 *  depth tie at render time — never Y-lift, doc 71 §4.4). */
export const ROAD_DECAL_Y = ROAD_Y;
/**
 * Junction decals are co-planar with the JUNCTION patch, which sits 3 mm
 * BELOW the ribbons (JUNCTION_Y) — same rule, different plane. Lifting them
 * to ROAD_DECAL_Y instead would put a 3 mm quad over a 4 m footprint, and at
 * the ~1.4° elevation a cockpit camera sees 50 m of road at, 3 mm of lift
 * shears the decal ~12 cm off the crack it is drawn on.
 */
export const JUNCTION_DECAL_Y = JUNCTION_Y;
/**
 * Junction wear budget: ~one decal per this many m² of approach-mouth area.
 * Deliberately denser than the ribbons' ~80 m² — junctions ARE more worn
 * (braking, turning scrub, utility trench cuts, ironwork, idling drips) —
 * but not so dense that a 2-lane residential T turns into a rubbish tip: at
 * 120 m² a small T mouth earns one decal and a 4-lane arterial mouth four.
 */
export const JUNCTION_DECAL_AREA_M2 = 120;
/** Hard cap per approach mouth, so an oversized `radius` cannot flood one
 *  junction with quads. 4 × 4 approaches = 16 decals in the worst case. */
export const JUNCTION_DECAL_MAX_PER_APPROACH = 4;

// --- Tyre / skid marks (founder register B65 — „no tyre marks") -------------
//
// A SKID IS NOT A BLOB, WHICH IS WHY THE FIRST ART LANE REFUSED TO FAKE ONE.
// The register records that refusal and it was the right call: every other
// atlas cell is a roughly-square patch of grime dropped at a random angle
// somewhere in the travel band, and a skid drawn that way is a smear lying
// diagonally across the road. A real скид is (a) LONG and THIN, (b) aligned
// with TRAVEL to within a couple of degrees, (c) laid in PAIRS one axle track
// apart, and (d) placed where cars actually brake hard. None of those four can
// be expressed by weight + minSize + maxSize + aspect, so the cell needs its
// own placement rule — the honest note said exactly that. These are its
// parameters.
//
/** Rear-axle track of the fictional hero saloon: how far apart the two streaks
 *  of one pair are laid, centre to centre, m. (ADR-001 — a track width is a
 *  dimension, not a brand; nothing here names a real vehicle.) */
export const SKID_TRACK_M = 1.62;
/** Nominal centreline spacing between skid EVENTS along a ribbon, m. Rarer than
 *  general wear (ROAD_DECAL_SPACING_M) on purpose: a street where every 30 m
 *  carries a panic stop is a street nobody survives. */
export const SKID_SPACING_M = 110;
/**
 * A ribbon shorter than this carries no rubber at all.
 *
 * Not a tuning knob — a rule with a reason and a test consequence. Rubber is
 * laid by a car that got up to a speed worth braking off, and a 60 m stub
 * between two junction mouths is not that road; laying a skid there would put
 * an 11 m streak on a ribbon whose whole usable band is 40 m. It is also what
 * keeps `decals.test.ts`'s 120 m isolated-ribbon fixture — which asserts an
 * EXACT quad count of 12 slots per seed over 200 seeds — measuring the pass it
 * was written for instead of silently absorbing this one.
 */
export const SKID_MIN_RIBBON_M = 200;
/** Longest run of rubber a single streak is drawn at, m — a 50 km/h emergency
 *  stop lays roughly 12–15 m on dry asphalt, and the quad is the DARKEST part
 *  of that, not the whole braking distance. */
export const SKID_MAX_LENGTH_M = 11;
export const SKID_MIN_LENGTH_M = 5.5;
/** Width of one streak, m — a tyre contact patch, near enough. */
export const SKID_WIDTH_M = 0.22;
/** How far a streak may wander off its lane centre, m (a locked wheel drifts;
 *  it does not teleport into the next lane). */
export const SKID_LANE_WOBBLE_M = 0.9;
/** Maximum yaw of a streak away from the travel axis, rad (~4.6°). A skid that
 *  is visibly crooked to the road reads as a bug, not as rubber. */
export const SKID_ALIGN_JITTER_RAD = 0.08;

/** Marking paint dimensions (М-series, stylized). Scaled with the road —
 * textbook paint on an 8 m lane reads like thread (perceptual road scale). */
export const DASH_LENGTH_M = 5.0;
export const DASH_GAP_M = 8.0;
export const DASH_WIDTH_M = 0.25;
/**
 * ОСЕВА stroke — the line that separates OPPOSING streams — is painted 1.5×
 * the same-direction divider (doc 86 T16, founder item 46: „no actual marking
 * on the road showing which lane is which"). On a 2+2 the painter used to emit
 * three visually identical dashed lines at −8.13 / 0.00 / +8.13, and the middle
 * one is the only one with oncoming traffic behind it.
 *
 * Width is the ONE cue that carries no legal claim: a broken line stays broken
 * and a continuous line stays continuous, so nothing a student may or may not
 * do changes — only which line his eye lands on. Deliberately NOT the ledger's
 * „paint the centre boundary as solid/double М1": «непрекъсната» means
 * пресичането и застъпването са забранени (ППЗДвП чл. 63, ал. 2, т. 1–2), and
 * asserting that on every multi-lane two-way road would ban crossings the
 * district's OWN data permits — `mvu-e-beyond` (mv-uturn-v1, 4 lanes two-way,
 * no zone) is precisely where sc-mv-uturn-ban sends the student to make a
 * LEGAL U-turn. Where crossing really is banned the data already says so, and
 * `paintZoneSolids` already draws the М1 (see SOLID_CENTER_LINE_WIDTH_M).
 */
export const CENTER_LINE_WIDTH_M = DASH_WIDTH_M * 1.5;
export const EDGE_LINE_WIDTH_M = 0.3;
export const EDGE_LINE_INSET_M = 0.5;
export const STOP_LINE_WIDTH_M = 0.8;

/**
 * М18 „ТРИЪГЪЛНИК" — the give-way symbol painted on the carriageway BEFORE the
 * М7 линия за изчакване (Наредба № 2/2001, чл. 23, ал. 3, verified verbatim by
 * docs/education/90_THEORY_VS_LAW_AUDIT.md §„Markings"):
 *
 *   „Преди линията за изчакване върху платното за движение може да бъде
 *    очертан символът М18 „триъгълник", предупреждаващ за приближаване към път
 *    с предимство. Върхът на триъгълника е насочен срещу водачите, които
 *    трябва да пропуснат…"
 *
 * The theory bank TEACHES it — `q-krastovishta-062` („голям бял триъгълник с
 * връх, насочен към теб") is a live, law-cited exam question — and until now
 * the simulator could not draw it, so a student met the symbol in the exam and
 * never once on the road. Its natural twin, the М7 line itself, has been
 * painted since v1 (`paintStopLine(…, dashed: true)`).
 *
 * Sized against the 2.5× perceptual carriageway (LANE_WIDTH_M 8.125), not
 * against a real 3.25 m lane: ~44% of the lane wide, so it reads as a symbol
 * from the seat rather than as a scuff. The apex points AT the approaching
 * driver, which is the whole legal content of ал. 3 — a triangle drawn the
 * other way up is a different marking.
 */
export const GIVE_WAY_TRIANGLE_BASE_M = 3.6;
export const GIVE_WAY_TRIANGLE_LENGTH_M = 5.4;
/** Clear gap between the М7 line and the triangle's BASE (its junction-side
 *  edge) — „няколко метра преди нея" at road scale. */
export const GIVE_WAY_TRIANGLE_SETBACK_M = 3.0;

export const ZEBRA_STRIPE_ACROSS_M = 0.8; // stripe width across the road
export const ZEBRA_GAP_M = 0.6;
export const ZEBRA_LENGTH_M = 6.0; // extent along the road axis
/**
 * Zone-authored SOLID markings (ADR-006 stage 2b — the world SHOWS what
 * District.zones GRADE; markings.ts). М1 „единична непрекъсната" осева over a
 * solidCenterLine span reuses the dash stroke it replaces, so a suppressed
 * span reads as one filled line; the bus-/emergency-lane curb seam (М8.1/М2
 * continuous edge of laneId 0) is a hair bolder so the restricted lane reads.
 */
export const SOLID_CENTER_LINE_WIDTH_M = CENTER_LINE_WIDTH_M;
/** …and a В24 span's SAME-DIRECTION dividers keep the divider stroke they
 *  replace, so the осева stays the widest line on the carriageway inside a ban
 *  span too (T16 must not stop working where a zone starts). */
export const SOLID_LANE_DIVIDER_WIDTH_M = DASH_WIDTH_M;
export const BUS_LANE_SEAM_WIDTH_M = EDGE_LINE_WIDTH_M;
/**
 * The лента за принудително спиране is bounded by the WIDE continuous line —
 * gen_motorway.mjs has documented that intent since mw-v1 was authored, and
 * has equally documented that nothing rendered it, so the shoulder read as a
 * third travel lane (founder verdict-board note on sc-hz-breakdown-pulloff:
 * „the marking on the road is not showing it either"). Wide enough to be
 * unmistakably not a lane divider at cockpit height: 2× the dash stroke.
 */
export const EMERGENCY_LANE_SEAM_WIDTH_M = 0.5;

/**
 * Lesson-critical sign prominence (founder review R3 doc 62 S4/#6: „those
 * signs must be big because they are a major part"). On scenario micro-maps
 * (meta.mapKind "scenario-*") every sign that IS the lesson — the junction
 * Б2/Б1, the roundabout Д11, the zone-driven В24/В27/А1/А15/rail posts —
 * renders at this uniform instance scale. Real-size signs read miniature
 * against the 2.5× perceptually scaled road; the drills' own signs must be
 * unmissable. City (district-v1), exam (d2-v1) and полигон maps carry no
 * scenario mapKind and keep scale-free (byte-identical) placements.
 */
export const SCENARIO_SIGN_SCALE = 1.5;

// --- painted zone-speed glyphs (founder R3 #33/#34 — the honest stopgap
// while the В26-30 face is missing from the sign kit) ------------------------

/** Only zone speeds paint (30/20). Higher tagged limits stay paint-free. */
export const SPEED_GLYPH_MAX_KMH = 30;
/** Untagged straight-street hosts qualify only past this length (a real zone
 *  street like sp-zone30's 360 m, not a 90 m driveway stub). */
export const SPEED_GLYPH_MIN_EDGE_M = 150;
/** First glyph this far into the drawn line (ahead of the entry spawns). */
export const SPEED_GLYPH_INSET_M = 20;
/** Repeat pitch of glyph stations along the street. */
export const SPEED_GLYPH_PITCH_M = 120;
/** Digit box (road numerals elongate along travel; 2.5× road scale). */
export const SPEED_GLYPH_DIGIT_H_M = 6.0;
export const SPEED_GLYPH_DIGIT_W_M = 2.4;
export const SPEED_GLYPH_STROKE_M = 0.5;
export const SPEED_GLYPH_DIGIT_GAP_M = 0.9;

/** Facade bay module (whole-bay UV offsets snap to this). */
export const FACADE_BAY_M = 3;
/**
 * Baked facade bay texture tile (tools/blender/facade_atlas.py layout.json):
 * 12 m of facade per U repeat, 3 floors x 3.8 m = 11.4 m per V repeat. The
 * procedural canvas fallback (4x4 bays) tiles on the same U scale so the
 * swap to the baked sets doesn't rescale facades mid-load.
 */
export const FACADE_TILE_U_M = FACADE_BAY_M * 4;
export const FACADE_TILE_V_M = 11.4;
/** Storey height baked into the bay textures (whole-floor V offsets). */
export const FACADE_FLOOR_M = 3.8;
/** Darker ground-floor band height (vertex-color multiplier). */
export const GROUND_BAND_M = 4.0;
export const GROUND_BAND_TINT = 0.62;
export const FACADE_VARIANTS = 4;

/** Road classes that receive painted lane lines. `motorway`/`trunk` are marked
 *  (lane dividers on a motorway carriageway) but deliberately absent from
 *  ARTERIAL_CLASSES, PARKING_LANE_CLASSES and SIDEWALK_CLASSES below — a
 *  motorway carries no arterial parking band, street trees, streetlights or sidewalks
 *  (gen_motorway.mjs mw-v1; founder R-media #7/#8).
 *
 *  `residential` / `unclassified` / `living_street` joined the set (doc 86 T1):
 *  every catalogued street map is built from those three classes, so the pass
 *  skipped them wholesale — 90 of 155 scenarios graded CENTER_LINE_TOUCHED,
 *  POOR_LANE_KEEPING and NOT_KEEPING_RIGHT against an осева the world never
 *  drew (founder: «Настъпване на осевата линия … it say we step on some line
 *  that doesnt exist at all», and item 46 «there are no lanes on the roads I
 *  only know them in my head»). A 6.5 m two-way Sofia street IS marked; the
 *  bare-asphalt classes are the ones that follow.
 *
 *  `service` stays OUT on purpose and is not an oversight: a car-park aisle, a
 *  driveway and a delivery lane carry bay paint, not lane lines. The lot maps
 *  (lot-45/narrow/par/perp-v1) are the reason — painting an осева down a
 *  parking aisle would be the same defect pointed the other way. Their
 *  approach edges are `residential` and DO get the line. */
export const MARKED_CLASSES: ReadonlySet<string> = new Set([
  "motorway",
  "trunk",
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

/** The minimum an offset line must measure before `paintDashedLine` emits its
 *  first quad (it starts the walk at gap/2 and needs a whole dash to fit). A
 *  boundary shorter than this is a boundary the world does NOT draw. */
export const MIN_DASHED_LINE_M = DASH_GAP_M / 2 + DASH_LENGTH_M;

/** Just the shape `paintsCentreLine`/`paintsLaneLines` need — so the runtime
 *  can ask the question with a `DistrictEdge` and the builder with an
 *  `EdgeBuild.edge`, without either importing the other's types. */
export interface MarkedEdgeLike {
  class: string;
  oneway: boolean;
  lanes: number;
}

/**
 * Does the lane-line pass draw a boundary EXACTLY on the road axis — the осева,
 * the only painted line with oncoming traffic behind it?
 *
 * This is the painter's own arithmetic, not a second opinion: markings.ts walks
 * `k = 1..lanes-1` at `off = -travelHalf + k·LANE_WIDTH_M`, and `off` lands on 0
 * only for an EVEN lane count on a two-way edge (a 3- or 5-lane two-way road
 * gets its boundaries at ±0.5·W / ±1.5·W and NO centre line at all). Exported
 * so `runtime/spatial.ts` publishes the same answer the painter acts on —
 * the single decision doc 86 T1 says was never shared.
 */
export function paintsCentreLine(edge: MarkedEdgeLike): boolean {
  if (!MARKED_CLASSES.has(edge.class)) return false;
  if (edge.oneway) return false;
  const lanes = Math.max(1, edge.lanes);
  return lanes >= 2 && lanes % 2 === 0;
}

/**
 * Does the lane-line pass draw ANY internal lane boundary on this edge? False
 * means there is no painted lane to keep — the referent POOR_LANE_KEEPING and
 * NOT_KEEPING_RIGHT need before either may convict.
 */
export function paintsLaneLines(edge: MarkedEdgeLike): boolean {
  if (!MARKED_CLASSES.has(edge.class)) return false;
  return Math.max(1, edge.lanes) >= 2;
}

// --- pedestrian crossings: paint, and the duty that needs no paint ----------

/** Just the shape the crossing predicates need, so neither the builder nor the
 *  runtime has to import the other's types (the `paintsCentreLine` pattern). */
export interface CrossingLike {
  kind: string;
}
/** The host carriageway of a crossing, as much of it as the predicates read. */
export interface CrossingHostEdgeLike {
  class: string;
  zone?: string;
}

/**
 * Does the zebra pass draw М8.1 paint at this crossing?
 *
 * markings.ts's own predicate, exported so `runtime/zones.ts` can ask the SAME
 * question the painter answers (doc 86 T1's discipline, applied to crossings).
 *
 * The three yes-kinds and the one no-kind (doc 87 A13):
 *  - `marked` / `signals` — OSM says there IS marking. Painted, as shipped.
 *  - `unknown` — the node is a crossing and the mapper tagged no type. In a
 *    Bulgarian city a designated пешеходна пътека carries М8.1 by Наредба № 2,
 *    so an untagged urban crossing node is a MARKED one whose tag is missing,
 *    not an unmarked one. Painting it is what makes the world state what the
 *    grader already assumed — and it is the referent Урок 4 („пешеходни
 *    пътеки", specs.ts l4-crossings) was missing: its staged dart-out declares
 *    `libraryEventId: "ev-ped-crossing-marked"` and stands on n12324499587,
 *    which the painter drew nothing at.
 *  - `unmarked` — OSM saying affirmatively that there is NO marking. §1 т.53
 *    ДР ЗДвП: a пешеходна пътека is a part of the carriageway *обозначена с
 *    пътна маркировка или знаци*. No paint, no пътека, no absolute duty — so
 *    the world draws nothing AND the grader stands down (see
 *    `gradesCrossingDuty` for the one lawful exception).
 */
export function paintsZebra(crossing: CrossingLike): boolean {
  return (
    crossing.kind === "marked" || crossing.kind === "signals" || crossing.kind === "unknown"
  );
}

/**
 * Living-zone streets (Д15/Д16, ЗДвП чл. 61–62): пешеходците ползват цялото
 * платно и са с предимство. There the duty is owed with NO paint at all — a
 * zebra inside a жилищна зона would teach the opposite of the law — so the
 * crossing referent is the STREET, not a marking.
 */
export function livingZoneCarriageway(edge: CrossingHostEdgeLike): boolean {
  return edge.class === "living_street" || edge.zone === "residential";
}

/**
 * May the crossing duties (чл. 119 approach speed, the yield, the overtake
 * ban) be GRADED at this crossing — i.e. does the world put something in front
 * of the student that justifies convicting him?
 *
 * Two, and only two, referents:
 *  1. the world paints the zebra (`paintsZebra`) — he can see the пътека;
 *  2. the host edge is a жилищна зона — чл. 61–62 gives pedestrians the whole
 *     carriageway there, so the duty is real with no paint (pe-zone-v1's
 *     pz-x-1 is authored `unmarked` for exactly this reason, and its battery
 *     pins both halves: zebraCrossings = 0 AND the pass event still fires).
 *
 * Everything else — the 17 `unmarked` nodes the OSM cuts carry on ordinary
 * 50 km/h streets — is a place where somebody once crossed, with no paint, no
 * sign and no zone. Arming a 10-point опасна there taught a seventeen-year-old
 * a law that does not exist (doc 87 A13/A16).
 */
export function gradesCrossingDuty(
  crossing: CrossingLike,
  hostEdge: CrossingHostEdgeLike | null | undefined,
): boolean {
  if (paintsZebra(crossing)) return true;
  return hostEdge != null && livingZoneCarriageway(hostEdge);
}

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

/** Arterial classes: STREET FURNITURE (streetlights, street trees, the parking
 *  band's siblings in props.ts). It used to decide the painted carriageway edge
 *  line as well — see EDGE_LINE_CLASSES below for why that was wrong. */
export const ARTERIAL_CLASSES: ReadonlySet<string> = new Set([
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
]);

/**
 * A MOTORWAY CARRIAGEWAY, HOWEVER ITS `class` HAPPENS TO BE TAGGED.
 *
 * The rule three docstrings up is founder-ratified and older than this
 * function: „a motorway carries no arterial parking band, street trees,
 * streetlights or sidewalks (gen_motorway.mjs mw-v1; founder R-media #7/#8)".
 * It was enforced ENTIRELY by the class string, and the class string is not the
 * only place the world records what a road is.
 *
 * `.audit-frames/w10-2/frames/sc-merge-motorway-exit__mobile-right/01-arrival.png`
 * is what that costs. The briefing reads «Тръгваш в ЛЯВАТА лента на
 * магистралата», the HUD chip reads 140, and out of the windscreen there is an
 * iron pedestrian parapet along the left kerb, a row of cypresses, street-lamp
 * columns and four overhead catenary spans crossing the sky. MEASURED on the
 * committed districts: mw-entry-v1 and mw-v1 tag their carriageways
 * `class: "motorway"` and are dressed correctly by the class rule alone;
 * mw-exit-v1 tags the identical carriageway `class: "primary"` and carries
 * `motorway: true` beside it — so ARTERIAL_CLASSES matched, SCENARIO_LIT_CLASSES
 * matched, and the one map in the catalogue whose entire subject is leaving a
 * магистрала got the Sofia side-street dressing kit.
 *
 * The `motorway` flag is not new and not invented here: `world/types.ts` has
 * carried it since the MOTORWAY-SEGMENT slice, and `world/referents.ts` already
 * spells this exact test inline when it refuses to name a motorway as a street.
 * The furniture passes simply never asked.
 *
 * ONLY THE DRESSING PASSES CONSULT IT (props.ts). Sidewalks, the parking band
 * and the paint still go by class, deliberately: those move `edgeHalfWidth` and
 * therefore the drivable geometry every lane-keeping rule is graded against,
 * and re-tagging a graded carriageway is a re-drive, not a patch. Scenery can
 * only ever be REMOVED by this predicate, so no drive it credits today can be
 * refused tomorrow.
 */
export function isMotorwayCarriageway(edge: { class: string; motorway?: boolean }): boolean {
  return edge.motorway === true || edge.class === "motorway" || edge.class === "motorway_link";
}

/**
 * Classes whose carriageway gets the SOLID EDGE LINE (М1 „очертаваща края на
 * платното за движение").
 *
 * WHY THIS IS ITS OWN SET AND NOT `ARTERIAL_CLASSES` (founder item B81, „there
 * are no marking on the roads … has to be GLOBALLY FIXED"). The edge line is
 * PAINT; `ARTERIAL_CLASSES` is FURNITURE — its own docstring is „streetlights",
 * and props.ts uses it to decide street trees and lamp posts. markings.ts
 * borrowed it, and a borrowed predicate is wrong at both ends:
 *
 *  - a MOTORWAY carriageway got no edge line at all, because a motorway carries
 *    no street furniture. `authoredSolidBoundaries` even grew a special case to
 *    hand mw-v1's emergency lane an outer line, precisely because the class it
 *    had to ask was answering a different question;
 *  - and 444 of the world's 698 marked edges — 63.6%, across 83 of 100 built
 *    districts — are `residential`/`unclassified`, so on the streets the drills
 *    actually run on the ENTIRE painted vocabulary of a mid-block ribbon was one
 *    dashed осева across a 16.25 m carriageway. That is the frame he called „a
 *    very basic Minecraft server with a car".
 *
 * `living_street` is deliberately OUT and is not an oversight: a жилищна зона is
 * a shared surface where the carriageway edge is the point that is NOT defined,
 * and painting one there would teach the opposite of what the zone means.
 * `service` is out for the reason it is out of MARKED_CLASSES — a car-park aisle
 * carries bay paint, not carriageway lines.
 */
export const EDGE_LINE_CLASSES: ReadonlySet<string> = new Set([
  "motorway",
  "trunk",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "unclassified",
  "residential",
]);

/**
 * Does the painter draw a solid carriageway edge line on this edge? The
 * painter's OWN arithmetic, exported for the same reason `paintsCentreLine` is
 * (doc 86 T1): the runtime and the tests ask the question instead of restating
 * the class set.
 */
export function paintsEdgeLine(edge: { class: string }): boolean {
  return MARKED_CLASSES.has(edge.class) && EDGE_LINE_CLASSES.has(edge.class);
}

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

// --- Street furniture on the streets the drills actually run on (B65) -------
//
// THE MEASUREMENT THAT FORCED THIS. The founder drove `sp-creep-v1` — 360 m of
// two-way street — and wrote „I see many issue with the Map its very Raw,
// boring". Re-rendered twice; nothing changed. Counted on the built world, not
// inherited from the register (which said „one lamp post in 360 m"):
//
//     sp-creep-v1   streetlights 0   billboards 0   busStops 0   parkingKits 0
//     sp-zone30-v1  streetlights 0   ...            (the SCHOOL street)
//
// ZERO, not one. And zero lamps means zero of everything downstream, because
// WorldProps.furniturePlacements derives every bench, bin, planter and bollard
// in the product FROM THE LAMP RUN. One predicate — `ARTERIAL_CLASSES.has(
// edge.class)`, whose own docstring says „streetlights" — is why a scenario
// micro-map has no street furniture of any kind: every one of them is authored
// `residential`, and `residential` is not an arterial.
//
// The set below is the furniture predicate widened to the classes a Bulgarian
// city actually lights. It is applied ONLY on scenario micro-maps, and that
// gate is not timidity — it is the same discipline props.ts already applies to
// В1/Д4/Б3/В26: our authored micro-maps are ours to dress, while an OSM city
// district's real column positions were never recorded, d2-v1 and district-v1
// already carry 280 columns from their arterials, and widening the predicate
// there would add ~1,000 lamp instances to the two heaviest maps in the
// product for no teaching gain. Every city/exam/полигон map therefore stays
// BYTE-IDENTICAL, which also means the tier-low draw/triangle budget
// (environment/perfBudget.ts) is unchanged where it is tightest.
export const SCENARIO_LIT_CLASSES: ReadonlySet<string> = new Set([
  ...ARTERIAL_CLASSES,
  "residential",
  "unclassified",
  "living_street",
]);
/** Column pitch on a scenario side street — wider than the arterial 28 m,
 *  because a жилищна улица is lit more sparsely than a boulevard. */
export const SCENARIO_STREETLIGHT_SPACING_M = 32;

/**
 * OVERHEAD DISTRIBUTION LINE — the „no wires, no poles" half of B65.
 *
 * Sofia's residential streets are strung, not buried: a concrete or wooden
 * column every ~35–40 m on one verge, a short crossarm, and 3–4 catenary
 * spans between neighbours. It is the single most characteristic thing in a
 * photograph of a Bulgarian side street and the world had none of it.
 *
 * Poles alternate to the verge OPPOSITE the lamp column run so the two rows do
 * not merge into one silhouette (the same reasoning as ROUNDABOUT_SIGN_OUT_M).
 */
export const UTILITY_POLE_SPACING_M = 37;
/** Column height above the pavement, m. */
export const UTILITY_POLE_HEIGHT_M = 8.6;
/** Half-span of the crossarm, m — the wires hang from its two tips + the top. */
export const UTILITY_ARM_HALF_M = 0.62;
/** Sag of a span at mid-point, m. A dead-straight wire reads as a wire-frame
 *  artefact; the sag is what makes it read as a cable. */
export const UTILITY_WIRE_SAG_M = 0.55;

/**
 * PAVEMENT PARAPET (парапет) — the „no fences, no barriers" half of B65.
 *
 * `public/sim/streetscape-v2/railing_run_6m.glb` has shipped since the v2 kit
 * landed and NO CODE PATH COULD EVER PLACE IT: 2.4 KB, one primitive, one
 * `steel_black` material, span 6.055 m, height 1.10 m. It is the same class of
 * defect as sign_priority_road.glb (doc 86 D5) — a finished asset with no
 * placement pass — and it is exactly the object he says is missing. Placing it
 * costs no new bytes in public/ (so the size ceiling behind
 * tools/assets/publicBudget.test.mjs cannot move) and carries no brand.
 */
export const RAILING_RUN_M = 6.055;
/** A parapet shorter than this is street clutter, not a guard rail: runs below
 *  it are dropped whole rather than drawn as one lonely panel. */
export const RAILING_MIN_RUN_M = 30;
/** Standing distance from the kerb line, m — at the back of the walking width,
 *  never over the carriageway. */
export const RAILING_FROM_KERB_M = 0.55;
/**
 * Panels per unbroken run, then the gap before the next one, in panels.
 *
 * MEASURED, THEN CORRECTED. The first cut placed a continuous centred run and
 * put 58 panels — 351 m of unbroken fence — down one side of a 360 m street.
 * That is not street furniture, it is a wall: it hides the very frontage this
 * row is about and it is not what a Bulgarian street looks like either. A
 * парапет runs in STRETCHES, with the gaps where the doorways and the parked
 * cars need them. 5 on / 4 off = 30 m of rail then 24 m of open kerb.
 */
export const RAILING_PANELS_PER_RUN = 5;
export const RAILING_GAP_PANELS = 4;
/**
 * NO PARAPET WITHIN THIS OF A CROSSING, m — a correctness rule, not a taste
 * one. A guard rail is precisely the object that stops a pedestrian stepping
 * off the kerb, so a panel standing across a zebra's approach fences off the
 * crossing the lesson grades and contradicts the paint. Every authored
 * crossing on the edge clears its own gap.
 */
export const RAILING_CROSSING_CLEAR_M = 11;

// --- THE STREET END (B65 — the carriageway that stops at a cut edge) --------
//
// WHAT HE SEES, AND WHY IT IS THE LOUDEST THING IN THE ROW. The furniture pass
// above answered „raw": `sp-creep-v1` now carries frontage both sides, a lamp
// run, an overhead line and a parapet. It did NOT answer the last four seconds
// of the drive. Photographed from the seat at `y = 299.73`, 60 m short of the
// road end (scratchpad frame, whole cockpit, car stopped, telemetry burned in):
// the tarmac runs forward and STOPS at a hard horizontal edge, and beyond it an
// empty olive plain runs to a haze band and distant hills. Nothing stands in
// the vista at all. That is not a street that ends; it is a mesh that ends, and
// it is the single frame in this lesson that reads as a prototype rather than a
// place.
//
// WHY TREES AND NOT A BUILDING, A BEND OR A JUNCTION. All three were on the
// table; trees are the only one of the four that changes nothing but the view:
//
//   * a BEND or a JUNCTION moves the road graph, which moves `speedLimitAt`,
//     the Locator grid and every committed trace on the map. A scenery change
//     may not become a grading change (the law tools/maps/lib/streetwall.mjs
//     already writes down for its own footprints);
//   * a terminating BUILDING is cheaper in triangles and would read superbly —
//     but a building carries a COLLIDER, and collision geometry is another
//     lane's live work this wave. A wall the student can drive through is a
//     worse artefact than the cut edge it replaces;
//   * TREE placements carry no collider, no grading input and no new instanced
//     kind — the four tree draws in WorldProps are paid on every district
//     already — so a grove costs draw calls exactly zero. It costs TRIANGLES,
//     which is why the numbers below are as small as they are and why the cost
//     was measured on the built world rather than estimated.
//
// The grove is planted BEYOND the last asphalt, so nothing that can be driven,
// staged or graded is behind it.

/** How far past the end node the first row stands, m. Beyond the drawn
 *  carriageway (nothing is ever placed on the asphalt) and near enough that the
 *  eye reads the road as running INTO the trees rather than stopping at them. */
export const TERMINUS_TREE_NEAR_M = 8;
/** Rows in the closing band, and the gap between them. Three rows read as a
 *  mass from 60 m; one row reads as a hedge with a plain behind it. */
export const TERMINUS_TREE_ROWS = 4;
export const TERMINUS_TREE_ROW_PITCH_M = 9;
/**
 * Half-width of the band, m. At the 60 m station the frame was shot from, 34 m
 * subtends ~29° each side of the axis — the middle 58° of a ~76° windscreen,
 * i.e. the whole part of the vista the flanking frontage and the parked row do
 * not already close.
 */
export const TERMINUS_TREE_HALF_W_M = 26;
export const TERMINUS_TREE_COL_PITCH_M = 6.5;
/** Acceptance rate per candidate station — a planted verge, not a wall. */
export const TERMINUS_TREE_DENSITY = 0.8;
/**
 * TREE INSTANCES THIS PASS MAY SPEND ON ONE DISTRICT — a budget, not a rate,
 * and the reason it is a budget is a measurement.
 *
 * The first cut spent TERMINUS_TREE_ROWS on EVERY dressed end. On a straight
 * street that is two ends and it is right. On a four-arm junction micro-map
 * every arm ends at the map boundary, so the same rule bought four to eight
 * groves — measured across the whole catalogue by building it twice:
 *
 *     sig-wave-v1     222 -> 435 trees   (+213)
 *     jxg-giveway-v1  126 -> 287         (+161)
 *     mw-exit-v1      407 -> 541         (+134)
 *     sp-creep-v1      13 ->  59         (+46, the street B65 was rendered on)
 *
 * At the MEASURED 378 triangles per tree instance, +213 is +80,500 triangles on
 * a district that already runs above the tier-low triangle budget — which is
 * exactly the trade doc 82 §2.2 exists to refuse. So the ROW COUNT is derived
 * from how many ends a district has, and the total is held near this figure
 * however many arms the map grows: ~24k triangles, about 9 % of the tier-low
 * SOFT triangle budget and ~7 % of a measured tier-low frame.
 *
 * It costs the straight streets nothing — two ends still take the full four
 * rows, which is the frame that was photographed.
 */
export const TERMINUS_TREE_BUDGET = 60;
/**
 * NO TERMINUS TREE WITHIN THIS OF ANY ROAD CENTRELINE, m. The band is laid on
 * the dead end's OWN axis, so this cannot be the park fill's 30 m rule (that
 * rule is exactly why the vista is empty today). It is a guard against a second
 * road running past the end — a grove on somebody else's carriageway would be a
 * far worse defect than the one being fixed.
 */
export const TERMINUS_TREE_ROAD_CLEAR_M = 7;
/**
 * Keep-in from the drawn ground, m. The builder paves `bounds` +
 * TERRAIN_MARGIN_M and not one metre more, so a tree planted past that stands
 * on nothing — the cut edge again, with a tree on it.
 */
export const TERMINUS_TREE_TERRAIN_INSET_M = 8;

// --- THE AXIS (B65 — the half of the street end the treeline does not close) --
//
// WHAT THE TREELINE ACTUALLY DID, MEASURED ON THE FRAME IT WAS SHIPPED AGAINST.
// The band above plants the FLANKS and it genuinely helps. It leaves the middle
// open. On `sp-creep-v1` seed 7 the band is 21 trees spanning x −27.8..28.3 at
// y 367..398, and the nearest trunk either side of the centreline is x −0.91 /
// +5.92: a 6.8 m hole on the road's own axis. From the seat at y = 298 that is
// ≈5.3°, about 90 px of open plain in the middle of a 1264 px frame — and the
// hole is not plain, it is plain THEN haze band THEN hills. Photographed again
// at that station before this pass (scratchpad, tier low, canvas 1264×620): the
// tarmac stops, and dead ahead through the gap the eye goes to the horizon.
//
// The row-0 corridor (`TERMINUS_TREE_*`, and the assertion that used to guard
// it) is what holds that hole open, and it is there for a reason: a thing
// standing AT the end node has to stay visible from the seat. So the axis
// cannot be closed by planting it. It has to be closed BEHIND the trees.
//
// WHY A BUILDING, AND WHY THE OBJECTION TO ONE WAS WRONG BY HALF. The previous
// pass declined a terminating building because „a building carries a COLLIDER,
// and collision geometry is another lane's live work". The collider is the
// REASON to choose it, not the objection: `buildBuildings` merges every wall
// quad into `colliders.buildings` in the same pass that draws it, so this mass
// is the one candidate that is not a wall the student can drive through. It is
// data through an existing pass — no runtime, rules or billing code is touched.
// The other candidate the review named, a parapet laid across the road end, was
// declined here for the opposite reason: `RailingPlacement` carries NO collider
// at all (props.ts says so where it places them), so a rail across the
// carriageway is exactly the drive-through artefact, and at 1.1 m tall it
// closes ≈16 px of a 90 px hole. It does not answer the row.
//
// WHAT IT COSTS. Nothing in the currency the phone is short of. The four facade
// variants + the roof mesh are five draws paid on EVERY district already, so a
// volume added to them is +0 draws by construction — there is no new mesh, no
// new material and no new instanced kind. Triangles: 3 wall rows × 4 edges × 2
// tris + 2 roof tris = 26 per volume, 52 per end. Measured on the running
// product at tier low, both instruments, at the same station: see the test.
//
// The volumes stand BEYOND the last asphalt and beyond anything that drives,
// stages or is graded — TERMINUS_CLOSE_ROAD_CLEAR_M is the guard, and it is
// nearly twice the tree band's.

/** Boundary band a dead end must fall in to count as „runs out of the world",
 *  m. The value props.ts's own `nearBoundary` has always used, named so the
 *  tree band and the closing mass cannot drift apart. */
export const TERMINUS_BOUNDARY_MARGIN_M = 40;
/** How far past the end node the closing frontage starts, m. Past the last
 *  asphalt and past the first two tree rows (8 m, 17 m), so the trees read as
 *  standing IN FRONT of it rather than growing out of the wall. */
export const TERMINUS_CLOSE_NEAR_M = 18;
/** Depth of one closing volume, m — a block, not a billboard. */
export const TERMINUS_CLOSE_DEPTH_M = 14;
/**
 * Half-width of the closing frontage, m. At the 60 m station 20 m subtends
 * ~13.5° each side of the axis, which is wider than the hole the treeline
 * leaves (±2.7°) by a margin that survives the eye being off the centreline —
 * the seat is at x = 4.06, not 0.
 */
export const TERMINUS_CLOSE_HALF_W_M = 20;
/** How far each half reaches PAST the axis, m. The two halves overlap so the
 *  join can never open a slit on the one line the driver is looking down. */
export const TERMINUS_CLOSE_OVERLAP_M = 5;
/** How much further back the second half stands, m, and what it takes of the
 *  first one's height. A single 40 m slab across the end is the „Minecraft"
 *  read this whole row exists to answer; two volumes with a step between them
 *  read as a street corner, for 26 more triangles. */
export const TERMINUS_CLOSE_STEP_M = 6;
export const TERMINUS_CLOSE_STEP_HEIGHT_FRACTION = 0.72;
/**
 * Height band, m. The mass takes the MEDIAN height of the district's own
 * frontage clamped into this band, so it belongs to the street it closes:
 * sp-creep-v1's blocks run 13.6–34 m and its closure comes out at the cap,
 * while a low-rise micro-map gets a low-rise end instead of a tower.
 */
export const TERMINUS_CLOSE_MIN_HEIGHT_M = 9;
export const TERMINUS_CLOSE_MAX_HEIGHT_M = 22;
/** Fallback when a district authors no frontage at all to take a cue from. */
export const TERMINUS_CLOSE_DEFAULT_HEIGHT_M = 12;
/**
 * NO CLOSING VOLUME WITHIN THIS OF ANY ROAD CENTRELINE, m — the guard that
 * makes the collider safe. It is checked over the whole footprint on a 4 m
 * lattice, not at its corners: a road crossing the middle of a rectangle
 * clears all four of them. Nearly twice TERMINUS_TREE_ROAD_CLEAR_M, because
 * unlike a tree this thing stops a car.
 */
export const TERMINUS_CLOSE_ROAD_CLEAR_M = 12;
/** Keep-in from the drawn ground, m (TERMINUS_TREE_TERRAIN_INSET_M's reason: a
 *  volume past the paved bounds stands on nothing). */
export const TERMINUS_CLOSE_TERRAIN_INSET_M = 6;
/** Clearance from any footprint already on the map, m — the closing mass never
 *  grows out of the street's own last block. */
export const TERMINUS_CLOSE_BUILDING_CLEAR_M = 3;

// --- THE WORLD'S RIM (builders/worldRim.ts) ---------------------------------
//
// TERMINUS_CLOSE_* above closes ONE AXIS: the dead end of a street, in the
// direction that street runs. It leaves the other 350° of the horizon open, and
// `runtime/district.ts`'s census says what is out there — the drawn world is
// exactly `bounds ± TERRAIN_MARGIN_M`, and on 64 of the 105 committed districts
// the declared box IS the road network's bounding box, so a student who simply
// drives OFF the carriageway crosses 60 m of empty ground and then leaves the
// authored world entirely. Past that line the ground is
// `environment/groundBackdropShader.ts`'s 480 m camera-following disc: the
// horizon, not the world. That disc is the "featureless green/grey plane under
// an empty horizon" of every void frame in the w11 sweep, and the reason the
// mirror inset keeps rendering a full city street in the same frame is simply
// that the city is BEHIND the car — it never stopped existing, the car left it.
//
// These constants stand the frontage that marks the line. They deliberately
// reuse the terminus block's depth, height band, lattice guards and clearances:
// the questions "how deep is a block", "how tall may a closing mass be" and
// "how far must it stay off a centreline" are already answered above, and a
// second set of answers is a second set of numbers to keep in sync.

/**
 * Keep-in from the drawn ground's outer rim, m — the rim's OUTER face stands
 * this far inside `bounds ± TERRAIN_MARGIN_M`.
 *
 * Smaller than TERMINUS_CLOSE_TERRAIN_INSET_M (6 m) on purpose. That inset
 * buys slack for a mass placed on an arbitrary street heading; the rim is
 * axis-aligned with the ground quad itself, so the only thing an inset buys
 * here is a strip of ground BEHIND the wall that no car can reach — and every
 * metre of it is a metre of void the student can still get to on the near
 * side. 3 m is enough that terrain relief (TERRAIN_MAX_RELIEF_M = 0.25 m)
 * cannot expose the ground edge under a wall foot.
 */
export const WORLD_RIM_TERRAIN_INSET_M = 3;
/**
 * Frontage length of one rim mass, m. A run is divided into a whole number of
 * masses as close to this as fits, so the belt is CONTIGUOUS by construction —
 * adjacent masses share an exact edge and no slit can open on a sight line.
 *
 * 34 m is a Sofia панелен блок's long side. It is also what keeps the belt
 * cheap: the median committed district takes 36 masses, i.e. ~940 triangles
 * and — because every one of them goes through `buildBuildings`' existing
 * facade/roof accumulators — ZERO additional draw calls.
 */
export const WORLD_RIM_SPAN_M = 34;
/**
 * How far a mass may be pushed INWARD from the nominal inner face, m, so the
 * belt reads as a row of blocks rather than one 1.3 km slab. Same number and
 * same job as TERMINUS_CLOSE_STEP_M. Only the inner face moves: the outer face
 * stays flush at the keep-in line (nothing can ever see it) and the corners
 * butt at the NOMINAL inner face, so the jitter cannot open a corner.
 */
export const WORLD_RIM_STEP_M = 6;
/**
 * Thinnest a rim mass may end up, m, after its inner face has been pushed out
 * past frontage the map already authored inside the band. Below this the block
 * is a wall rather than a building — and it is not needed, because the mass
 * that pushed it that far out is itself standing in the belt and closing the
 * same sight line.
 */
export const WORLD_RIM_MIN_DEPTH_M = 5;
/**
 * How much of the district's frontage median the four height steps take. The
 * result is clamped into TERMINUS_CLOSE_MIN/MAX_HEIGHT_M exactly as a terminus
 * closure is, so a low-rise micro-map gets a low-rise edge and nothing anywhere
 * becomes a tower.
 */
export const WORLD_RIM_HEIGHT_STEPS = [0.72, 0.88, 1, 1.16] as const;

// --- streetscape v2 dressing (doc 70 REF 1 + REF 3) --------------------------

/** Leafy-tree row spacing along arterial streets (REF 3's tree-lined roads). */
export const ARTERIAL_TREE_SPACING_M = 26;
/** How many primary-class streets (grouped by name, longest first) are planted
 *  as LINDEN BOULEVARDS — one uniform species end to end instead of the mixed
 *  leafy row. That is exactly how Sofia's main streets read (a boulevard is
 *  planted as a single-species avenue: липа, кестен, топола), and it keeps the
 *  "the big boulevard looks deliberately landscaped" flourish this constant was
 *  introduced for — with a tree that survives a Sofia winter. */
export const LINDEN_BOULEVARD_COUNT = 2;
/** Minimum distance between roadside billboards (sparse: one per ~150–200 m). */
export const BILLBOARD_MIN_SPACING_M = 150;
/** Billboards keep clear of the junction mouth by at least this much. */
export const BILLBOARD_END_INSET_M = 20;
/** Bus-stop shelter distance past the junction mouth (>= 25 m required). */
export const BUS_STOP_FROM_MOUTH_M = 28;
/** Minimum separation between two placed shelters. */
export const BUS_STOP_MIN_SEPARATION_M = 150;
/** Shelter depth, m — how far the kit is parked IN from the back edge of the
 *  sidewalk so its roof does not overhang the kerb. Named because the authored
 *  B64 placement and the derived one must agree on it. */
export const BUS_STOP_SHELTER_DEPTH_M = 1.35;
/** Deterministic shelter count cap (target 4–8 district-wide). */
export const BUS_STOP_MAX_COUNT = 6;
