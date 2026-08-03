/**
 * gen_pe_crossings.mjs — the S3 PEDESTRIAN-family micro-maps (Scenario Studio,
 * doc 76 §3; doc 72 §6 archetypes PE-03 / PE-08 / PE-16). Same zebra-block
 * shape as gen_zebra_street.mjs (one straight two-lane street carrying a
 * MARKED, unsignalized crossing) — a purpose-built street per archetype so
 * each ScenarioSpec pins its own approach length, limit and crossing y.
 *
 * ⚠ DOC 86 D1 — WHY THIS FILE GREW A SECOND PARAMETER AXIS (read before adding
 * an eighth instance). The founder played catalog positions 22, 23, 25, 26, 27
 * and 28 back to back and wrote: „same map, same pedestrian behaviour, same
 * crossing, same interaction — only the character model changed. Changing the
 * character model alone does not create a new learning experience." He was
 * right about the map. The generator took exactly ONE meaningful parameter
 * (`approachM`) and emitted, seven times, the same two nodes, one edge, one
 * zebra, one 10 × 12 m corner shop and two spawns — so seven different lessons
 * were taught on one street with the pedestrian's pace as the only difference.
 *
 * Every instance now also names a STREETSCAPE: the frontage that explains why
 * THIS lesson happens on THIS street, and that occludes, frames and lights the
 * approach differently. It is real learning content, not decoration — a blind
 * corner pushed to the kerb line, an unlit warehouse canyon, a depot gate that
 * explains the stopped truck, a courtyard mouth children come out of. The
 * road, the crossing, the limit and the spawns are untouched, so every
 * committed trace, every pinned coordinate and the whole pe-districts contract
 * battery hold byte-for-byte; what changes is what the student SEES and what
 * hides the pedestrian from them.
 *
 * ⚠ DOC 87 FR-41 / B50 / B53 — WHY IT GREW A **THIRD** AXIS, AND WHY THE
 * SECOND ONE WAS NOT ENOUGH. The streetscape pass above changed the FACADES
 * and left the ROAD alone, and the re-look said so with a photograph: seven
 * cockpit frames at the same 22 m stand-off, „seven straight ribbons, no
 * junction, no side road, no bend, no gradient" — all seven still
 * `1 edge / 2 nodes / 1 crossing`, all seven `residential`, 2 lanes, no parking
 * band, no lamp column, one dashed centre line and bare asphalt. His verdict on
 * the family was a count, not an adjective: „already 5-6 different questions",
 * and it is seven. **Fixing this is ROAD work, not facades** — the register's
 * own words, and the second axis is the proof of it.
 *
 * So every instance now also names a ROADSCAPE: what kind of street this is.
 * The levers are the ones a driver reads from the seat — the ROAD CLASS (an
 * arterial class paints solid edge lines and plants a row of lamp columns; a
 * residential or living_street one gets one dashed centre line and bare
 * asphalt), whether the street is ONE-WAY (Д4 at the mouth, В1 at the far
 * terminal, no centre line, no oncoming), whether it has a PAVEMENT on both
 * sides at all (`bareVerge` — the industrial canyon's dock wall meets the
 * kerb), whether it carries a KERBSIDE PARKED ROW, and which BAN ZONE posts a
 * real В24/В27 face on it.
 *
 * ⚠ DOC 87 B50 / B53 / B54 — WHY IT GREW A **FOURTH** AXIS. The re-look put the
 * seven spawn frames on one sheet and the verdict was: „THE DRESSING IS NOW
 * GENUINELY DIFFERENT … BUT THE ROAD IS STILL ONE ROAD, and the data says it
 * with no ambiguity: every one of the seven is 2 nodes / 1 edge / 0
 * intersections / 1 crossing, 138-160 m, DEAD STRAIGHT TO A FLAT HORIZON."
 * Class, paint, lamps and posted faces are all cross-SECTION; none of them
 * change what the street DOES, and none of them fill the top third of the
 * windscreen, which on a straight ribbon is empty sky in all seven.
 *
 * So every instance now also names a TERMINUS: what this street runs INTO.
 * It is the one road lever that is free, because it lives past the end of
 * every recorded drive — measured on the committed traces, the furthest any of
 * the 21 PE ghost samples reaches is `lengthM − 12 m` (per district: 135/150,
 * 130/145, 138/155, 128/140, 132/148, 120/138, 136/152). A terminus that
 * starts AT the terminal node therefore cannot move a single recorded sample,
 * cannot re-time a staged walk (they are all south of the crossing) and cannot
 * touch the crossing zone — while it is the FIRST thing the driver sees,
 * because it sits dead ahead for the whole approach.
 *
 * The kinds are the ones a Bulgarian street actually ends in: it opens into a
 * collector, it is closed by a slab, it bends away, it necks down to a service
 * alley, it opens onto green, or it jogs. Four of them add real road (extra
 * nodes and edges — 2/1 becomes 3/2 or 4/3), which is what „0 intersections"
 * was measuring.
 *
 * DEGREE 2, NEVER DEGREE 3 — and that is a rule, not a coincidence. A leg
 * hangs off the terminal node so the node stays degree 2, which
 * `network.nodeOpenRadiusM` treats as a JOINT (0.6 m setback) and
 * `junctionPriorityControls` / `onewayNoEntryArms` both refuse to sign
 * („degree < 3 is a bend or a dead end, not a junction"). `intersections` stays
 * `[]`, so `runtime.debugUncontrolledJunctions()` stays empty and no give-way
 * obligation can fire inside a crossing drill. That was lever 2 below, and this
 * is how the variety is bought WITHOUT it.
 *
 * THREE LEVERS DELIBERATELY NOT USED, each with the measurement that ruled it
 * out — read this before reaching for them:
 *   1. THE CENTRELINE **OF THE GRADED STREET**. Every committed PE trace is a
 *      dead-straight rail at exactly x = 4.06 (measured: min = max on every
 *      sample of all 21 files). A bend in [0, lengthM] invalidates 21 recorded
 *      ghost lines, which are not this file's to re-record — which is why the
 *      two bend termini bend the road AFTER the terminal node, where no sample
 *      has ever been.
 *   2. NEW JUNCTION NODES (degree >= 3). An uncontrolled junction inside a
 *      crossing drill can fire a give-way fault the lesson never teaches — the
 *      exact defect class he complains loudest about.
 *   3. CARRIAGEWAY WIDTH. It was tried: giving four of these streets the 4 m
 *      curbside parking band widens them to 24.25 m curb to curb, which is a
 *      genuinely different street AND fixes FR-21's car half — but the staged
 *      walks are measured from the kerb, so the crossing grows from 16.25 m to
 *      24.25 m and takes 5.7 s longer at 1.4 m/s. `s3-pe-bot-completion` then
 *      dropped `sc-crossing-slow-crosser` and `sc-crossing-white-cane` from
 *      3 stars to 1. Re-tuning seven drills' release distances (doc 86 T11
 *      derives them from the kerb offset) is a lesson-design job, not a map
 *      job. The width lever is left to whoever owns that re-tune; the tag it
 *      needs already exists (`DistrictEdge.parkingBand`).
 *
 * FR-21's car half is therefore closed here the OTHER way the tag allows: every
 * one of the seven declares `parkingBand: false`, so the curb pass places
 * nothing. It used to seat every body at `travelHalf + 2.0 m`, which on a class
 * with no band is two metres PAST the kerb — „he goes trough a car which is
 * standing on the sidewalk", four separate lessons in his own words. Nothing
 * now stands on these pavements, and no geometry moved to achieve it.
 *
 * Pinned by platform/src/modules/sim/lessons/scenario/__tests__/
 * lane10-pe-vru-truth.test.ts (G7): every district must name a distinct
 * streetscape and no two may share a building layout. The ROAD side is pinned
 * by world/__tests__/pe-districts.test.ts, which used to assert the sameness
 * (`edges.length === 1` seven times over) and now asserts the variety.
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime — the CrossingZoneTracker derives its zone from crossings[]) and
 * buildLaneGraph/createTrafficSystem (traffic) already consume — the
 * gen_zebra_street.mjs mold. Contract battery:
 * platform/src/modules/sim/world/__tests__/pe-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     pe-n-end (0, L)                  L = approachM + RUNOUT_M
 *         │
 *         ═  pe-x-1 (0, approachM)     marked zebra (kind "marked",
 *         │                            signalized false — CrossingZone
 *     pe-spawn-approach (4.06, 15)     radius ~35 m arms on the host edge)
 *         │
 *     pe-n-start (0, 0)
 *
 * No signals, no stop lines, no junctions — the street teaches the crossing
 * approach, nothing else (doc 76 §3). The staged pedestrian is LESSON data
 * (StagedEventSpec pedestrianDartOut in the ScenarioSpec); the map only carries
 * the crossing geometry — single truth in meta.scenario.crossings.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pe_crossings.mjs
 *
 * ⚠ FOLLOW-UP PASS. `tools/maps/gen_streetwall.mjs` (doc 82 V7) appends `sw-`
 * prefixed procedural frontage to pe-dart-v1 and pe-child-v1 IN PLACE, so this
 * generator's output is not the final committed file for those two. Re-run the
 * street-wall pass after any run of this script, or those maps lose their
 * procedural fill (streetwall.test.ts's POPULATED table catches it).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Shared constants (must mirror the engine's perceptual scale — contracts.ts)
// ---------------------------------------------------------------------------

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** Street continues this far past the crossing (run-out + finish), m. */
const RUNOUT_M = 60;
/** constants.PARKING_LANE_WIDTH_M — the curbside band, per side, m. */
const PARKING_LANE_WIDTH_M = 4.0;
/** constants.SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M. */
const SIDEWALK_W = 3.5;
const SIDEWALK_SKIRT_M = 0.35;
/** Stand-back kept between the pavement's outer skirt and any wall, m. */
const FRONTAGE_STANDBACK_M = 0.5;
/**
 * Nearest x a building volume may occupy on a street with NO parking band:
 * half-carriageway 8.125 + the kerb skirt 0.35 + the 3.5 m sidewalk the builder
 * draws + 0.5 m of stand-back. The STREETSCAPE recipes below are authored
 * against exactly this number; a road that carries a parking band pushes its
 * whole frontage out by the band width (`frontageClearX` / `shiftOut`), so a
 * recipe never has to know which road it is riding.
 * Self-validated below — a frontage inside this eats the pavement the staged
 * pedestrians walk on.
 */
const FRONTAGE_CLEAR_X = 8.125 + SIDEWALK_SKIRT_M + SIDEWALK_W + FRONTAGE_STANDBACK_M; // 12.475

/** network.edgeHalfWidth + the skirt + the pavement + the stand-back, m. */
function frontageClearX(parkingBandM) {
  return FRONTAGE_CLEAR_X + parkingBandM;
}

const r2 = (v) => Math.round(v * 100) / 100;

/** Axis-aligned block, counter-clockwise, rounded — the footprint helper. */
function block(x0, x1, y0, y1, height) {
  return {
    height,
    heightSource: "default",
    footprint: [
      [r2(x0), r2(y0)],
      [r2(x1), r2(y0)],
      [r2(x1), r2(y1)],
      [r2(x0), r2(y1)],
    ],
  };
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// Streetscapes (doc 86 D1) — the per-archetype frontage recipes
// ---------------------------------------------------------------------------

/**
 * Each recipe answers one question: WHY does this lesson happen on this street,
 * and what hides the pedestrian here? The recipes are pure functions of the
 * crossing's y so the same geometry rides any approach length, and every volume
 * stands clear of FRONTAGE_CLEAR_X (self-validated below).
 *
 * `note` is the one-line design intent; it ships in meta.scenario so a reviewer
 * reading the district JSON alone can see what the map is for.
 */
const STREETSCAPES = {
  /** PE-03 „Изчакай пътеката" — a shopping block: people on the zebra is normal. */
  "corner-shop-terrace": {
    noteBg:
      "Търговска отсечка: магазини от двете страни, затова на пътеката ПОСТОЯННО има хора — изчакването е нормата, не изключението.",
    build: (cY) => [
      { id: "pe-b-shop", ...block(-26, -16, cY - 34, cY - 22, 4.5) },
      { id: "pe-b-terrace-w", ...block(-30, -13, cY - 18, cY + 16, 11) },
      { id: "pe-b-kiosk-e", ...block(13, 17.5, cY - 14, cY - 8, 3) },
      { id: "pe-b-arcade-e", ...block(13, 24, cY + 6, cY + 34, 8) },
    ],
  },
  /** PE-08 „Бавен пешеходец" — a health centre: this is WHERE slow people cross. */
  "clinic-and-park": {
    noteBg:
      "Поликлиника точно срещу пътеката и парк отсреща: тук пресичат възрастни хора и хора с намалена подвижност — бавно и по всяко време.",
    build: (cY) => [
      { id: "pe-b-clinic", ...block(12.8, 30, cY + 2, cY + 26, 5.5) },
      { id: "pe-b-clinic-annex", ...block(12.8, 21, cY - 20, cY - 4, 4) },
      { id: "pe-b-park-wall", ...block(-15.5, -12.8, cY - 46, cY + 30, 1.8) },
      { id: "pe-b-pavilion", ...block(-34, -22, cY - 8, cY + 8, 4.2) },
    ],
  },
  /** PE-16 „Пътека в дъжд през нощта" — the UNLIT block: a warehouse canyon. */
  "unlit-warehouse-canyon": {
    noteBg:
      "Неосветен складов участък: две глухи стени образуват тъмен коридор и единственият процеп в него е точно на пътеката — нощем фаровете са цялата видимост.",
    build: (cY) => [
      { id: "pe-b-wh-w1", ...block(-40, -12.6, cY - 70, cY - 6, 12) },
      { id: "pe-b-wh-w2", ...block(-40, -12.6, cY + 6, cY + 48, 12) },
      { id: "pe-b-wh-e1", ...block(12.6, 42, cY - 62, cY - 4, 12) },
      { id: "pe-b-wh-e2", ...block(12.6, 42, cY + 8, cY + 44, 12) },
    ],
  },
  /** PE-02 „Внезапен пешеходец" — the blind corner, pushed onto the kerb line. */
  "blind-corner-kiosk": {
    noteBg:
      "Ъглова сграда, изнесена до самия бордюр 1,5 м преди зебрата: западният тротоар е невидим до последния метър — оттам излиза пешеходецът.",
    build: (cY) => [
      { id: "pe-b-corner", ...block(-28, -12.6, cY - 30, cY - 1.5, 9) },
      { id: "pe-b-kiosk", ...block(-16.5, -12.6, cY - 40, cY - 33, 3) },
      { id: "pe-b-east-row", ...block(12.6, 26, cY - 46, cY - 10, 7) },
      { id: "pe-b-east-row2", ...block(12.6, 26, cY + 4, cY + 30, 7) },
    ],
  },
  /** PE-10 „Пешеходци иззад спрял камион" — the depot gate that explains it. */
  "depot-gate": {
    noteBg:
      "Складова база с товарен вход точно преди пътеката: затова тук ВИНАГИ стои спряло голямо превозно средство, а хората излизат иззад него.",
    build: (cY) => [
      { id: "pe-b-depot-s", ...block(12.6, 46, cY - 58, cY - 20, 8) },
      { id: "pe-b-gatehouse", ...block(12.6, 17, cY - 19.5, cY - 15, 3.2) },
      { id: "pe-b-depot-n", ...block(12.6, 46, cY - 6, cY + 34, 8) },
      { id: "pe-b-flats-w", ...block(-32, -13, cY - 36, cY + 12, 14) },
    ],
  },
  /** PE-04 „Дете след топка" / „покрай редицата" — the courtyard mouth. */
  "courtyard-blocks": {
    noteBg:
      "Два панелни блока с междублоково пространство, чието устие гледа право към пътеката: децата излизат от двора, а редицата гаражи отдясно крие погледа.",
    build: (cY) => [
      { id: "pe-b-slab-s", ...block(-44, -13.2, cY - 60, cY - 13, 17) },
      { id: "pe-b-slab-n", ...block(-44, -13.2, cY + 7, cY + 46, 17) },
      { id: "pe-b-playhouse", ...block(-26, -17, cY - 8, cY + 2, 3) },
      { id: "pe-b-garages", ...block(12.7, 19, cY - 52, cY - 12, 2.8) },
      { id: "pe-b-garages-n", ...block(12.7, 19, cY + 6, cY + 30, 2.8) },
    ],
  },
  /** PE-14 „Бял бастун" — the institute whose door points at the zebra. */
  "institute-and-transit": {
    noteBg:
      "Обществена сграда за хора с увредено зрение, чийто вход е насочен към пътеката, и спирка отсреща: белият бастун тук е ежедневие, а не изключение.",
    build: (cY) => [
      { id: "pe-b-institute", ...block(-38, -12.9, cY - 26, cY + 18, 10) },
      { id: "pe-b-institute-wing", ...block(-38, -25, cY + 18, cY + 40, 10) },
      { id: "pe-b-shelter", ...block(12.9, 16.4, cY - 9, cY - 3, 2.8) },
      { id: "pe-b-offices-e", ...block(12.9, 30, cY + 8, cY + 40, 12) },
    ],
  },
};

// ---------------------------------------------------------------------------
// Roadscapes (doc 87 FR-41 / B50 / B53) — WHAT KIND OF STREET this is
// ---------------------------------------------------------------------------

/**
 * The road half of the answer to „seven copies of one street". Each recipe is
 * the cross-section a driver reads from the seat, and every field of it is
 * something the engine already draws:
 *
 *   `roadClass`    — `tertiary` is an ARTERIAL class in the world builder:
 *                    solid edge lines, lane dashes and a lamp column row, plus
 *                    the 4 m curbside parking band by class. `residential` and
 *                    `unclassified` get one dashed centre line and bare asphalt.
 *                    It is also the priority rank, so it is a real statement
 *                    about what the street IS, not a paint choice.
 *   `parkingBand`  — `true`  ⇒ the 4 m band is drawn, kerb to kerb becomes
 *                    24.25 m, and the procedural parked row stands ON ASPHALT
 *                    instead of on the pavement (FR-21, the car half).
 *                    `false` ⇒ no band AND no parked row at all — a wall-to-
 *                    wall industrial canyon has no kerbside parking.
 *                    `null`  ⇒ the class decides (an arterial class has one).
 *   `oneway`       — a one-way street posts Д4 at its mouth, drops the centre
 *                    line, and removes oncoming traffic from the picture. The
 *                    right-hand lane centre stays at x = 4.06, so the recorded
 *                    ghost lines are untouched.
 *   `ban`          — an authored ban zone: a REAL В24/В27 face on a post, on a
 *                    span that means something for this lesson (no stopping
 *                    across a shop frontage; no overtaking past a blind corner).
 *                    `signRef` is the sign the runtime posts for the kind.
 *
 * `noteBg` is the one-line design intent, and it ships in meta.scenario beside
 * the streetscape's, so a reviewer reading the JSON alone can see what the road
 * is for.
 */
const KIND_TO_SIGN = { noStopping: "В27", noOvertaking: "В24" };

const ROADSCAPES = {
  /** PE-03 — the shopping COLLECTOR: the only lit, edge-lined street of the set,
   *  with a В27 keeping the terrace frontage clear. */
  "collector-shopping": {
    roadClass: "tertiary",
    parkingBand: false,
    bareVerge: null,
    ban: { kind: "noStopping", fromFrac: 0.45, toFrac: 0.72 },
    oneway: false,
    noteBg:
      "Събирателна улица: ясна крайна линия, осеви прекъснати линии и редица улични стълбове — единствената осветена отсечка в групата. Пред търговската тераса стои В27 „Забранено е спирането“, за да не се паркира точно пред витрините.",
  },
  /** PE-08 — the CLINIC street: quiet residential, В27 across the entrance so an
   *  ambulance always has the kerb. */
  "residential-clinic": {
    roadClass: "residential",
    parkingBand: false,
    bareVerge: null,
    ban: { kind: "noStopping", fromFrac: 0.4, toFrac: 0.72 },
    oneway: false,
    noteBg:
      "Квартална улица пред поликлиника: без улично осветление и без крайни линии, само осева прекъсната линия — а пред самия вход В27 „Забранено е спирането“, за да остане достъп за линейка.",
  },
  /** PE-16 — the industrial CANYON: the only street with no pavement on the
   *  dock side at all; the wall meets the kerb. Nothing is lit, nothing parks. */
  "industrial-canyon": {
    roadClass: "unclassified",
    parkingBand: false,
    bareVerge: "right",
    ban: null,
    oneway: false,
    noteBg:
      "Складов коридор: от страната на рампите НЯМА тротоар изобщо — стената опира в бордюра, няма стълб, няма дърво, няма паркирана кола. Нощем фаровете са цялата видимост.",
  },
  /** PE-02 — the BLIND CORNER: a В27 keeps the kerb empty exactly where the
   *  sightline dies, so nothing is added to what the corner already hides. */
  "residential-blind-corner": {
    roadClass: "residential",
    parkingBand: false,
    bareVerge: null,
    ban: { kind: "noOvertaking", fromFrac: 0.3, toFrac: 0.72 },
    oneway: false,
    noteBg:
      "Тясна квартална улица преди закрит ъгъл: В24 „Забранено е изпреварването“ важи точно там, където видимостта свършва — не се излиза в насрещното покрай ъгъла, зад който излиза пешеходецът.",
  },
  /** PE-10 — the FREIGHT collector: lit and edge-lined like the shopping street,
   *  but signed В24, because what comes out of the gate is a lorry. */
  "freight-collector": {
    roadClass: "tertiary",
    parkingBand: false,
    bareVerge: null,
    ban: { kind: "noOvertaking", fromFrac: 0.2, toFrac: 0.8 },
    oneway: false,
    noteBg:
      "Товарен подход: събирателна улица с крайни линии и стълбове, а покрай портала на базата — В24 „Забранено е изпреварването“, защото оттам излизат тежки коли и иззад тях се появяват хора.",
  },
  /**
   * PE-04 — the COURTYARD street: no sign at all, no lamp, no line but the
   * centre one. The plainest street of the seven, deliberately.
   *
   * NOT `living_street`, and the reason is a law, not a preference:
   * `constants.livingZoneCarriageway` treats that class as a жилищна зона, and
   * `gradesCrossingDuty` then grades чл. 119 across the WHOLE carriageway with
   * no paint. A жилищна зона is signed Д21 and posted at walking pace; this
   * map is posted 40 and its lesson copy says «улицата е квартална, с
   * ограничение 40 км/ч». Claiming the zone to win a variety point would be
   * exactly the kind of thing this register exists to stop.
   */
  "courtyard-street": {
    roadClass: "residential",
    parkingBand: false,
    bareVerge: null,
    ban: null,
    oneway: false,
    noteBg:
      "Междублокова улица: нито знак, нито стълб, нито крайна линия — само осевата прекъсната. Най-голата отсечка в групата, и точно затова нищо не ти подсказва, че оттук изскачат деца.",
  },
  /** PE-14 — the ONE-WAY in front of the institute: Д4 at the mouth, no centre
   *  line, no oncoming — and therefore no excuse. */
  "oneway-institute": {
    roadClass: "residential",
    parkingBand: false,
    bareVerge: null,
    ban: null,
    oneway: true,
    noteBg:
      "Еднопосочна улица (знак Д4 на входа): няма насрещно движение и няма осева линия — цялото платно е твое, а това прави пропускането на пешеходеца изцяло твоя отговорност.",
  },
};

// ---------------------------------------------------------------------------
// Termini (doc 87 B50 / B53 / B54) — WHAT THE STREET RUNS INTO
// ---------------------------------------------------------------------------

/**
 * The fourth axis, and the one that answers „dead straight to a flat horizon".
 * A terminus is everything NORTH of the terminal node `pe-n-end`, i.e. past the
 * furthest sample of every recorded drive on this family (worst case
 * `lengthM − 12 m`). It may add road and it may add frontage; it may never
 * touch [0, lengthM].
 *
 * `legs(L)` returns extra edges keyed by the node ids they introduce. Every leg
 * hangs off `pe-n-end` in a chain, so **every new node is degree 2** — a joint,
 * not a junction (see the header). `build(L)` returns the vista frontage: the
 * volumes that fill the sky at the end of the street.
 *
 * Each leg declares `parkingBand: false` without exception. Not decoration: an
 * arterial-class leg would otherwise get the 4 m band by class AND a
 * procedurally parked row on it (`TrafficLayer.PARK_CLASSES` ⊇ tertiary), and
 * FR-21 on this family is closed by the family carrying NO parked bodies at
 * all. A terminus may change the horizon; it may not re-open a closed row.
 */
const TERMINI = {
  /** The shopping collector feeds a real 4-lane collector — lit, edge-lined,
   *  twice as wide. The horizon is a wide road, not sky. */
  "opens-to-collector": {
    noteBg:
      "Улицата не свършва в нищото: пред теб тя се влива в четирилентова събирателна улица — по-широко платно, крайни линии и улично осветление. Затова точно тук се гледа напред, а не само в пътеката.",
    legs: (L) => [
      {
        node: ["pe-n-collector", [0, L + 125]],
        edge: {
          id: "pe-e-collector",
          from: "pe-n-end",
          to: "pe-n-collector",
          class: "secondary",
          name: "Събирателна улица",
          oneway: false,
          lanes: 4,
          maxspeed: null, // inherits the street — see LEG_LIMIT below
          parkingBand: false,
          geometry: [
            [0, L],
            [0, L + 125],
          ],
        },
      },
    ],
    build: (L) => [
      { id: "pe-b-far-w", ...block(-46, -22, L + 14, L + 96, 15) },
      { id: "pe-b-far-e", ...block(22, 48, L + 26, L + 110, 15) },
      { id: "pe-b-vista", ...block(-44, 44, L + 146, L + 182, 22) },
    ],
  },
  /** A closed end: an 19 m slab straight across the street 15 m past the
   *  terminal. There is no sky at the end of this one at all. */
  "closed-by-block": {
    noteBg:
      "Улицата е ЗАТВОРЕНА: на петнадесет метра след края ѝ стои жилищен блок напряко. Хоризонт няма — това, което виждаш в горната част на стъклото, е стена, и точно затова окото пада на пътеката.",
    legs: () => [],
    build: (L) => [
      { id: "pe-b-end-slab", ...block(-38, 38, L + 15, L + 51, 19) },
      { id: "pe-b-end-wing-w", ...block(-52, -30, L - 18, L + 15, 14) },
      { id: "pe-b-end-wing-e", ...block(30, 50, L - 6, L + 15, 14) },
    ],
  },
  /** The canyon turns west. The vista is the blank flank of a shed on the
   *  OUTSIDE of the curve — the wall a driver runs at if he does not read it. */
  "bends-away-left": {
    noteBg:
      "Коридорът не продължава — след края на отсечката улицата завива наляво, а срещу теб застава глухата стена на склад. Завой, който се чете отдалеч, а не изневиделица.",
    legs: (L) => [
      {
        node: ["pe-n-west", [-108, L + 44]],
        edge: {
          id: "pe-e-west",
          from: "pe-n-end",
          to: "pe-n-west",
          class: "unclassified",
          name: "Складов подход",
          oneway: false,
          lanes: 2,
          maxspeed: null, // inherits the street — see LEG_LIMIT below
          parkingBand: false,
          geometry: [
            [0, L],
            [-14, L + 23],
            [-54, L + 41],
            [-108, L + 44],
          ],
        },
      },
    ],
    build: (L) => [
      { id: "pe-b-crook", ...block(21, 62, L + 5, L + 62, 13) },
      { id: "pe-b-shed-far", ...block(-64, -34, L + 60, L + 96, 11) },
      { id: "pe-b-shed-w", ...block(-118, -74, L - 6, L + 26, 9) },
    ],
  },
  /** Past the blind corner the street NECKS DOWN to a one-lane service alley:
   *  the asphalt ahead is literally half as wide as the asphalt underneath. */
  "necks-to-service": {
    noteBg:
      "След закрития ъгъл платното се стеснява наполовина — нататък е служебна алея с една лента между гаражите. Стеснението се вижда отдалеч и е причината да си свалил скоростта ПРЕДИ пътеката, а не след нея.",
    legs: (L) => [
      {
        node: ["pe-n-alley", [0, L + 70]],
        edge: {
          id: "pe-e-alley",
          from: "pe-n-end",
          to: "pe-n-alley",
          class: "service",
          name: "Служебна алея",
          oneway: false,
          lanes: 1,
          maxspeed: null, // inherits the street — see LEG_LIMIT below
          parkingBand: false,
          geometry: [
            [0, L],
            [0, L + 70],
          ],
        },
      },
    ],
    build: (L) => [
      { id: "pe-b-garagerow-w", ...block(-25, -9.2, L + 12, L + 66, 3.2) },
      { id: "pe-b-garagerow-e", ...block(9.2, 27, L + 16, L + 60, 3.2) },
      { id: "pe-b-alley-end", ...block(-21, 21, L + 84, L + 118, 12) },
    ],
  },
  /** The freight road swings east into the yard. Same idea as the canyon's
   *  bend, mirrored, on a lit arterial class — a different picture entirely. */
  "bends-away-right": {
    noteBg:
      "Товарният подход завива надясно към двора на базата. Отсреща, в външната страна на завоя, стои халето — там свършва улицата и там влизат камионите, които после излизат срещу теб.",
    legs: (L) => [
      {
        node: ["pe-n-yard", [112, L + 41]],
        edge: {
          id: "pe-e-yard",
          from: "pe-n-end",
          to: "pe-n-yard",
          class: "tertiary",
          name: "Подход към двора",
          oneway: false,
          lanes: 2,
          maxspeed: null, // inherits the street — see LEG_LIMIT below
          parkingBand: false,
          geometry: [
            [0, L],
            [16, L + 22],
            [56, L + 38],
            [112, L + 41],
          ],
        },
      },
    ],
    build: (L) => [
      { id: "pe-b-hall", ...block(-64, -21, L + 4, L + 64, 14) },
      { id: "pe-b-yard-n", ...block(40, 78, L + 56, L + 92, 10) },
      { id: "pe-b-yard-e", ...block(88, 128, L - 8, L + 24, 10) },
    ],
  },
  /** The street simply opens onto green: no leg, no slab — a low park wall far
   *  off and nothing tall anywhere. The horizon is a LINE, not a building. */
  "opens-to-green": {
    noteBg:
      "Улицата свършва в зеленото на квартала: нито блок, нито стена — само нисък парков зид далеч напред. Оттам няма какво да те спре да гледаш надалеч, и точно затова децата отляво се виждат късно.",
    legs: () => [],
    build: (L) => [
      { id: "pe-b-park-wall-n", ...block(-56, 56, L + 62, L + 65.6, 2.2) },
      { id: "pe-b-pavilion-n", ...block(-30, -13, L + 30, L + 46, 3.6) },
      { id: "pe-b-pavilion-e", ...block(15, 30, L + 36, L + 50, 3.6) },
    ],
  },
  /** The one-way JOGS: west, then north again. Four nodes, three edges — the
   *  most road of the seven, and still not one junction. */
  "jogs-and-continues": {
    noteBg:
      "Еднопосочната не върви право до безкрай: тя прави чупка наляво и продължава на север. Отпред те чака калканът на сградата в чупката — улицата се чете, преди да я стигнеш.",
    legs: (L) => [
      {
        node: ["pe-n-jog", [-36, L + 27]],
        edge: {
          id: "pe-e-jog",
          from: "pe-n-end",
          to: "pe-n-jog",
          class: "residential",
          name: "Чупка на еднопосочната",
          oneway: true,
          lanes: 2,
          maxspeed: null, // inherits the street — see LEG_LIMIT below
          parkingBand: false,
          geometry: [
            [0, L],
            [-13, L + 15],
            [-36, L + 27],
          ],
        },
      },
      {
        node: ["pe-n-jog-n", [-36, L + 99]],
        edge: {
          id: "pe-e-jog-n",
          from: "pe-n-jog",
          to: "pe-n-jog-n",
          class: "residential",
          name: "Еднопосочна — продължение",
          oneway: true,
          lanes: 2,
          maxspeed: null, // inherits the street — see LEG_LIMIT below
          parkingBand: false,
          geometry: [
            [-36, L + 27],
            [-36, L + 99],
          ],
        },
      },
    ],
    build: (L) => [
      { id: "pe-b-gable", ...block(15, 46, L + 6, L + 58, 16) },
      { id: "pe-b-jog-w", ...block(-74, -50, L + 38, L + 94, 13) },
      { id: "pe-b-jog-n", ...block(-24, 12, L + 112, L + 144, 15) },
    ],
  },
};

// ---------------------------------------------------------------------------
// The generator (single crossing — the S3 PE micro-map)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,      // output file name + LessonSpec.world.districtId
 *   label: string,           // human label (meta)
 *   approachM: number,       // street-start → crossing distance (>= 60)
 *   maxspeedKmh: number,     // legal limit on the street (30..50)
 *   streetscape: string,     // doc 86 D1 — the frontage recipe (STREETSCAPES)
 *   roadscape: string,       // doc 87 FR-41 — the cross-section (ROADSCAPES)
 *   terminus: string,        // doc 87 B50 — what the street runs into (TERMINI)
 * }} params
 */
export function buildPeCrossingStreet(params) {
  const errors = [];
  const { districtId, label, approachM, maxspeedKmh, streetscape, roadscape, terminus } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 60 && approachM <= 300)) errors.push(`approachM must be within 60..300 m, got ${approachM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 50)) errors.push(`maxspeedKmh must be within 30..50, got ${maxspeedKmh}`);
  if (!STREETSCAPES[streetscape]) {
    errors.push(
      `streetscape "${streetscape}" unknown — pick one of ${Object.keys(STREETSCAPES).join(", ")} ` +
        `(doc 86 D1: an instance without its own frontage is another copy of the same street)`,
    );
  }
  if (!ROADSCAPES[roadscape]) {
    errors.push(
      `roadscape "${roadscape}" unknown — pick one of ${Object.keys(ROADSCAPES).join(", ")} ` +
        `(doc 87 FR-41: an instance without its own cross-section is another copy of the same ROAD, ` +
        `which is the half the streetscape pass did not fix)`,
    );
  }
  if (!TERMINI[terminus]) {
    errors.push(
      `terminus "${terminus}" unknown — pick one of ${Object.keys(TERMINI).join(", ")} ` +
        `(doc 87 B50: an instance without its own terminus runs DEAD STRAIGHT TO A FLAT ` +
        `HORIZON, which is the half the roadscape pass left alone and the re-look photographed)`,
    );
  }
  if (errors.length > 0) throw new Error(`gen_pe_crossings params invalid:\n  - ${errors.join("\n  - ")}`);

  const road = ROADSCAPES[roadscape];
  const end = TERMINI[terminus];
  /** Arterial classes carry the band by class; an explicit tag overrides it. */
  const bandByClass = ["primary", "secondary", "tertiary"].includes(road.roadClass);
  const hasBand = road.parkingBand === null ? bandByClass : road.parkingBand === true;
  const parkingBandM = hasBand ? PARKING_LANE_WIDTH_M : 0;
  const clearX = frontageClearX(parkingBandM);
  /** How far the authored frontage moves out to clear THIS cross-section. */
  const shiftOut = clearX - FRONTAGE_CLEAR_X;

  const crossingY = approachM;
  const lengthM = crossingY + RUNOUT_M;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  // -- Nodes / edge (one straight street; a zebra needs no junctions).
  const NODES = {
    "pe-n-start": [0, 0],
    "pe-n-end": [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: "pe-e-street",
      from: "pe-n-start",
      to: "pe-n-end",
      class: road.roadClass,
      name: "Улица с пешеходна пътека",
      oneway: road.oneway,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
      // FR-21 (car half) + FR-41: only written when the roadscape has an
      // OPINION about the curbside band, so an arterial-class street stays
      // byte-identical to a file written before the tag existed.
      // `true`  ⇒ draw the 4 m band; the parked row lands on asphalt.
      // `false` ⇒ no band and no procedural parked row on this street at all.
      ...(road.parkingBand === null ? {} : { parkingBand: road.parkingBand }),
      // FR-41: a side with NO pavement at all (network.edgeBareVerge) — the
      // industrial canyon's loading wall stands on the kerb, so that side has
      // no footway, no lamp column, no tree and no bus shelter.
      ...(road.bareVerge ? { bareVerge: road.bareVerge } : {}),
    },
  ];

  // -- TERMINUS (doc 87 B50/B53/B54): the road NORTH of pe-n-end. Every leg
  // hangs off the previous one in a chain, so every node it introduces has
  // degree 2 — `nodeOpenRadiusM` treats that as a 0.6 m joint and
  // `junctionPriorityControls` refuses to sign it, which is what keeps a
  // crossing drill free of a give-way obligation it never teaches.
  const LEGS = end.legs(lengthM);
  for (const leg of LEGS) {
    const [nodeId, [nx, ny]] = leg.node;
    NODES[nodeId] = [r2(nx), r2(ny)];
    const geo = leg.edge.geometry.map(([x, y]) => [r2(x), r2(y)]);
    EDGES.push({
      id: leg.edge.id,
      from: leg.edge.from,
      to: leg.edge.to,
      class: leg.edge.class,
      name: leg.edge.name,
      oneway: leg.edge.oneway,
      roundabout: false,
      lanes: leg.edge.lanes,
      lanesSource: "tag",
      // LEG_LIMIT. A terminus leg carries the SAME posted limit as the street
      // it continues, and that is a rule rather than a default. A limit change
      // is a legal fact that must be POSTED (В26 at the change, В33 where the
      // restriction ends) — and a degree-2 joint has no arm to post it on, so a
      // leg with its own number would be a limit the driver is graded against
      // and never shown. It was caught by two batteries at once: sign-truth
      // („pe-bus-v1: В33 @ (-10.1, 137.5) has no numeral or no road") and the
      // world-referent T4raw census (95 -> 100 rung-codes). Variety is bought
      // with SHAPE — class, width, bend, neck — never with an unsigned number.
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geo),
      geometry: geo,
      // Never optional on a leg — see the TERMINI header (FR-21).
      parkingBand: false,
    });
  }

  // -- Ban zone (ADR-006 stage 2a): the В24/В27 the roadscape posts, spanned
  // as a fraction of the street so it rides any approach length.
  const ZONES = road.ban
    ? [
        {
          id: `pe-z-${road.ban.kind.toLowerCase()}`,
          kind: road.ban.kind,
          edgeId: "pe-e-street",
          fromM: r2(lengthM * road.ban.fromFrac),
          toM: r2(lengthM * road.ban.toFrac),
          signRef: KIND_TO_SIGN[road.ban.kind],
        },
      ]
    : [];

  // -- Crossing: the single geometric truth (CrossingZoneTracker + the
  // markings builder + the ScenarioSpec all read exactly this).
  const CROSSINGS = [
    {
      id: "pe-x-1",
      x: 0,
      y: r2(crossingY),
      kind: "marked",
      signalized: false,
      edgeId: "pe-e-street",
    },
  ];

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const ROUNDABOUTS = [];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: "pe-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "pe-e-street",
      name: "Подход към пешеходната пътека",
    },
    {
      id: "pe-spawn-finish",
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: "pe-e-street",
      name: "Контролна точка — след пътеката",
    },
  ];

  // -- The STREETSCAPE (doc 86 D1): the frontage that explains why this lesson
  // happens here and that occludes the approach. Every volume stands clear of
  // the carriageway + kerb + sidewalk (post-validated below).
  const recipe = STREETSCAPES[streetscape];
  // Authored against FRONTAGE_CLEAR_X; a road that carries a parking band
  // pushes the whole frontage OUT by the band width, so the recipe keeps its
  // authored stand-back from the kerb on every cross-section (no volume
  // straddles x = 0, so the sign of x is the side).
  const BUILDINGS = [
    ...recipe.build(crossingY).map((bl) => ({
      ...bl,
      footprint: bl.footprint.map(([x, y]) => [r2(x + Math.sign(x) * shiftOut), y]),
    })),
    // The TERMINUS vista: what fills the sky at the end of the street. Authored
    // in absolute coordinates (it is past the terminal node, so the parking
    // band never shifts it) and validated against EVERY edge below.
    ...end.build(lengthM),
  ];

  // -- Bounds + stats.
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  // Road body + buildings can outgrow the centerline bounds — cover them
  // (the body is curb to curb: travel lanes + the roadscape's parking band).
  // Every edge gets its OWN half-width: a terminus leg may be a 4-lane
  // collector or a one-lane alley, and the ground plane has to cover both.
  for (const e of EDGES) {
    const half = (Math.max(1, e.lanes) * SCALED_LANE_W) / 2 + (e.parkingBand === true ? PARKING_LANE_WIDTH_M : 0);
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x - half - 6);
      bounds.maxX = Math.max(bounds.maxX, x + half + 6);
      bounds.minY = Math.min(bounds.minY, y - half - 6);
      bounds.maxY = Math.max(bounds.maxY, y + half + 6);
    }
  }
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pe_crossings.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна улица с пешеходна пътека — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: "Права улица: ограничението важи по цялата дължина; пред пътеката се кара с готовност за спиране.",
      },
      ...(ZONES.length > 0 ? { zonesVersion: 1 } : {}),
      stats: {
        roadKm: r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000),
        nodes: Object.keys(NODES).length,
        edges: EDGES.length,
        intersections: INTERSECTIONS.length,
        crossings: CROSSINGS.length,
        buildings: BUILDINGS.length,
        spawnPoints: SPAWN_POINTS.length,
        zones: ZONES.length,
      },
      /**
       * Scenario Studio payload (doc 76): the archetype recipe + the crossing
       * truth. ScenarioSpecs pin the crossing by value and the contract battery
       * asserts the copy matches this file.
       */
      scenario: {
        archetype: "zebra-block",
        // Unchanged by doc 86 D1 on purpose: the ScenarioSpecs mirror exactly
        // this object, so the streetscape rides beside it, never inside it.
        params: { crossings: 1, signalized: "no", approachM },
        /** doc 86 D1 — WHICH street this is, not just how long the approach is. */
        streetscape,
        streetscapeNoteBg: recipe.noteBg,
        /** doc 87 FR-41 — WHAT KIND OF ROAD it is, which is the half the
         *  streetscape pass left alone and the founder photographed. */
        roadscape,
        roadscapeNoteBg: road.noteBg,
        /** doc 87 B50/B53/B54 — WHAT THE STREET RUNS INTO, i.e. the half of the
         *  windscreen the cross-section pass never filled. */
        terminus,
        terminusNoteBg: end.noteBg,
        /** Extra road the terminus adds past the terminal node (0 = the street
         *  simply ends and the vista is frontage only). */
        terminusLegs: LEGS.length,
        terminusRoadM: r2(EDGES.slice(1).reduce((s, e) => s + e.length, 0)),
        roadClass: road.roadClass,
        parkingBandM,
        bareVerge: road.bareVerge,
        curbToCurbM: r2(2 * (halfRoadM + parkingBandM)),
        oneway: road.oneway,
        banSignRef: road.ban ? KIND_TO_SIGN[road.ban.kind] : null,
        primaryCrossingId: "pe-x-1",
        laneCenterRightM: laneCenterM,
        crossings: CROSSINGS.map((c) => ({ id: c.id, x: c.x, y: c.y, kind: c.kind })),
      },
    },
    roads: {
      nodes: Object.entries(NODES)
        .map(([id, [x, y]]) => ({ id, x: r2(x), y: r2(y) }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
      edges: EDGES,
    },
    intersections: INTERSECTIONS,
    crossings: CROSSINGS,
    roundabouts: ROUNDABOUTS,
    buildings: BUILDINGS,
    spawnPoints: SPAWN_POINTS,
    ...(ZONES.length > 0 ? { zones: ZONES } : {}),
  };

  // -------------------------------------------------------------------------
  // Self-validation (the invariants tools/osm/build.mjs + gen_poligon enforce)
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== "pe-e-street") post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  // The crossing must sit ON the street centerline with real approach room
  // before it (the ~35 m zone must arm on the road, not at spawn).
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.y < 60) post.push(`${c.id}: needs >= 60 m of approach (zone radius 35 m + spawn margin)`);
    if (c.y > lengthM - 40) post.push(`${c.id}: needs >= 40 m of run-out past the crossing`);
    if (c.edgeId !== "pe-e-street") post.push(`${c.id}: crossing must host on the street edge`);
  }
  // The streetscape may never eat the carriageway, the kerb or the sidewalk the
  // staged pedestrians walk on (doc 86 D1 — a frontage that occludes must still
  // leave the pavement).
  //
  // Measured against EVERY edge, not just against `x = 0`: a terminus adds real
  // road that bends, necks and jogs, and the old `Math.abs(x) < clearX` test
  // could neither see a leg nor allow a volume to stand ACROSS the end of the
  // street — which is exactly the vista „dead straight to a flat horizon"
  // needed. Each edge carries its OWN clearance, because a 4-lane collector leg
  // and a one-lane service alley do not stand back the same distance.
  const clearanceOf = (e) => {
    const lanes = Math.max(1, e.lanes);
    const travelHalf = (lanes * SCALED_LANE_W) / 2;
    const band = e.parkingBand === true ? PARKING_LANE_WIDTH_M : 0;
    return travelHalf + band + SIDEWALK_SKIRT_M + SIDEWALK_W + FRONTAGE_STANDBACK_M;
  };
  /** Distance from a point to a polyline, ENDS INCLUDED (so a volume past the
   *  terminal node is measured from the terminal node, not waved through). */
  const missToPolyline = (geo, px, py) => {
    let best = Infinity;
    for (let i = 0; i < geo.length - 1; i++) {
      const ax = geo[i][0];
      const ay = geo[i][1];
      const dx = geo[i + 1][0] - ax;
      const dy = geo[i + 1][1] - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (d < best) best = d;
    }
    return best;
  };
  const seenBuildingIds = new Set();
  for (const bl of BUILDINGS) {
    if (!/^pe-b-[a-z0-9-]+$/.test(bl.id ?? "")) post.push(`building id "${bl.id}" must be pe-b-kebab-case`);
    if (seenBuildingIds.has(bl.id)) post.push(`duplicate building id ${bl.id}`);
    seenBuildingIds.add(bl.id);
    if (!(bl.height > 0)) post.push(`${bl.id}: non-positive height`);
    for (const [x, y] of bl.footprint) {
      for (const e of EDGES) {
        const need = clearanceOf(e);
        const got = missToPolyline(e.geometry, x, y);
        if (got < need - 1e-9) {
          post.push(
            `${bl.id}: footprint (${x}, ${y}) is ${r2(got)} m from ${e.id}, inside its ` +
              `${r2(need)} m kerb+sidewalk clearance (${e.class}, ${e.lanes} lanes)`,
          );
        }
      }
    }
  }
  // The terminus may never reach back into the graded street: every leg node and
  // every leg vertex must be north of the terminal, and no leg may touch the
  // crossing zone. This is the invariant that keeps the 21 recorded ghost traces
  // valid without re-measuring them.
  for (const e of EDGES) {
    if (e.id === "pe-e-street") continue;
    for (const [, y] of e.geometry) {
      if (y < lengthM - 1e-9) post.push(`${e.id}: terminus geometry reaches y=${y}, south of the terminal node (${lengthM})`);
    }
  }
  if (BUILDINGS.length < 3) post.push(`streetscape ${streetscape}: needs >= 3 volumes to read as a street`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  // The roadscape must be self-consistent: a street that declares no parked row
  // may not also declare the band that row would stand on, and a `parkingBand`
  // opinion on an arterial class is a contradiction the world silently ignores
  // (PARKING_LANE_CLASSES already grants it).
  if (road.bareVerge !== null && !["left", "right", "both"].includes(road.bareVerge)) {
    post.push(`roadscape ${roadscape}: bareVerge must be null | "left" | "right" | "both"`);
  }
  // FR-21: a street that draws no parking band must not be left carrying a
  // procedurally parked row, because the pass would stand it on the pavement.
  if (parkingBandM === 0 && road.parkingBand !== false) {
    post.push(
      `roadscape ${roadscape}: no parking band is drawn, so it must say ` +
        `parkingBand: false — otherwise TrafficLayer.computeParkedCars seats a ` +
        `row 2 m past the kerb, on the footway (founder item FR-21)`,
    );
  }
  for (const z of ZONES) {
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not post ${z.kind}`);
    if (!(z.fromM >= 0 && z.toM <= lengthM && z.toM - z.fromM >= 20)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] is not a readable stretch of the ${lengthM} m street`);
    }
    if (z.edgeId !== "pe-e-street") post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
  }
  if (post.length > 0) {
    throw new Error(`gen_pe_crossings self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The seven committed instances (S3 PE batch 1)
// ---------------------------------------------------------------------------
//
// He played catalog 24–30 back to back. Every column below has to differ from
// its neighbours for the SEQUENCE to stop being the defect (doc 87 B53):
//
//   district      approach  limit  class         curb-to-curb  parked row  sign
//   pe-clear-v1     90 m    50     tertiary        24.25 m      broken@В27  В27
//   pe-slow-v1      85 m    40     residential*    24.25 m      broken@В27  В27
//   pe-rain-v1      95 m    50     unclassified    16.25 m      NONE         —
//   pe-dart-v1      80 m    50     residential     16.25 m      NONE        В27
//   pe-bus-v1       88 m    50     tertiary        24.25 m      on asphalt  В24
//   pe-child-v1     78 m    40     residential     16.25 m      NONE        В24
//   pe-cane-v1      92 m    50     residential* ONE-WAY 24.25 m on asphalt  Д4
//
//   (* residential + an explicit `parkingBand: true` — see ROADSCAPES.)
//
// FR-21 is closed on all seven, two different ways: four streets grew the band
// their row was already standing in the middle of (the bodies did not move —
// the KERB did), and three declare `parkingBand: false`, so nothing is placed
// where there is nowhere to stand. The three narrow ones are narrow on purpose:
// pe-dart-v1 and pe-child-v1 carry darts whose release distances are DERIVED
// from the kerb offset (doc 86 T11), so widening them would silently re-time
// two drills, and pe-rain-v1 is a wall-to-wall industrial canyon that would not
// have kerbside parking anyway.
//
// No two rows agree on the whole tuple, and world/__tests__/pe-districts
// „no two districts share a CROSS-SECTION signature" is what keeps it that way.
// The two arterial-class streets also gain edge lines, lane dashes and a lamp
// column row that the residential ones do not have, so „lamps = 0 on all seven"
// is no longer true of the family either. And a В27 span is a real hole in the
// parked row — `TrafficLayer.computeParkedCars` honours the ban zone, so the
// sign and the street agree.

const INSTANCES = [
  {
    districtId: "pe-clear-v1",
    label: "Търговска отсечка с пешеходна пътека (сценарий PE-03)",
    approachM: 90,
    maxspeedKmh: 50,
    streetscape: "corner-shop-terrace",
    roadscape: "collector-shopping",
    terminus: "opens-to-collector",
  },
  {
    districtId: "pe-slow-v1",
    label: "Улица пред поликлиника (сценарий PE-08)",
    approachM: 85,
    maxspeedKmh: 40,
    streetscape: "clinic-and-park",
    roadscape: "residential-clinic",
    terminus: "closed-by-block",
  },
  {
    districtId: "pe-rain-v1",
    label: "Неосветен складов участък — пътека в дъжд през нощта (сценарий PE-16)",
    approachM: 95,
    maxspeedKmh: 50,
    streetscape: "unlit-warehouse-canyon",
    roadscape: "industrial-canyon",
    terminus: "bends-away-left",
  },
  {
    districtId: "pe-dart-v1",
    label: "Улица със закрит ъгъл преди пътеката (сценарий PE-02/PE-09)",
    approachM: 80,
    maxspeedKmh: 50,
    streetscape: "blind-corner-kiosk",
    roadscape: "residential-blind-corner",
    terminus: "necks-to-service",
  },
  {
    districtId: "pe-bus-v1",
    label: "Улица с товарен вход на складова база (сценарий PE-10)",
    approachM: 88,
    maxspeedKmh: 50,
    streetscape: "depot-gate",
    roadscape: "freight-collector",
    terminus: "bends-away-right",
  },
  {
    districtId: "pe-child-v1",
    label: "Междублоково пространство с редица гаражи (сценарий PE-04)",
    approachM: 78,
    maxspeedKmh: 40,
    streetscape: "courtyard-blocks",
    roadscape: "courtyard-street",
    terminus: "opens-to-green",
  },
  {
    districtId: "pe-cane-v1",
    label: "Еднопосочна улица пред институт за незрящи (сценарий PE-14)",
    approachM: 92,
    maxspeedKmh: 50,
    streetscape: "institute-and-transit",
    roadscape: "oneway-institute",
    terminus: "jogs-and-continues",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildPeCrossingStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const sc = district.meta.scenario;
  console.log(`=== pe-crossings build: ${params.districtId} ===`);
  line("approach / street length", `${params.approachM} m / ${district.roads.edges[0].length} m`);
  line("limit", `${params.maxspeedKmh} km/h`);
  line("streetscape", `${params.streetscape} (${district.buildings.length} volumes)`);
  line(
    "roadscape",
    `${params.roadscape} — ${sc.roadClass}${sc.oneway ? " ONE-WAY" : ""}, ` +
      `${sc.curbToCurbM} m curb to curb, parking band ${sc.parkingBandM} m` +
      `${sc.banSignRef ? `, posts ${sc.banSignRef}` : ""}`,
  );
  line("crossing", district.crossings.map((c) => `${c.id}@y=${c.y}`).join(", "));
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
