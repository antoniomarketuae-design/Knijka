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
/** Deterministic shelter count cap (target 4–8 district-wide). */
export const BUS_STOP_MAX_COUNT = 6;
