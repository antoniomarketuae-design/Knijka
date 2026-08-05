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
 * ⚠ DOC 87 B50 / B53 / B54 — WHY IT GREW A **FIFTH** AXIS, AND THE MEASUREMENT
 * THAT FORCED IT. The terminus pass above closed the horizon and the register
 * still refused to call the rows fixed, with the right reason: „all seven
 * differences are 100 m+ away. The near field a student drives in is still one
 * street." Measured on the shipped files and on `buildWorldGeometry` output,
 * not asserted — this is what the first fifty metres of all seven contained:
 *
 *   - curb to curb: **16.25 m on all seven**, `parkingBandM: 0` on all seven.
 *     Four axes of „variety" and not one of them changes the width of the
 *     asphalt, which is the single biggest object in the frame.
 *   - the В26 limit plate stands at **(8.9, 45) on all seven** — same face,
 *     same post, same side, same distance from the spawn (props.ts
 *     `SPAWN_CONTEXT_AHEAD_M`, 30 m ahead of a spawn at y = 15).
 *   - the first two street trees land at **(14.4, −11.0) and (−14.0, −33.0) on
 *     four of the seven**, because `buildWorldGeometry` seeds EVERY district's
 *     prop rng from one constant (`DEFAULT_SEED = 1337`) and the tree pass
 *     walks a fixed 22 m cadence — so two same-class straight streets get
 *     byte-identical planting at byte-identical metres.
 *   - authored frontage standing between the spawn (y = 15) and y = 62:
 *     **pe-cane 0**, pe-clear 1, pe-slow 2, pe-rain 2, pe-bus 2, pe-child 2,
 *     pe-dart 3. The lesson he wrote „absolutely same as question 23" about is
 *     the one with NOTHING beside the road for the first fifty metres.
 *
 * The cause is structural and it is in this file: **every STREETSCAPE recipe is
 * authored relative to `crossingY`**, so its content sits 20–50 m north of the
 * spawn, and the terminus is 100 m+ out. All four axes act where the student is
 * not yet looking. Nothing in this generator has ever authored the part of the
 * world that fills the windscreen for the whole approach.
 *
 * So every instance now also names a NEARFIELD: what stands beside the road in
 * the first fifty metres. It is authored in ABSOLUTE y, anchored to the SPAWN
 * rather than to the crossing — that anchor is the whole point of the axis, and
 * `NEARFIELD_FIRST_WITHIN_M` makes it enforceable: at least one volume must
 * begin within 20 m of the spawn, so „the near field is bare" cannot come back.
 *
 * The recipes differ in SILHOUETTE, not in position, because position is what
 * the last three passes varied and the sheet still read as one street. The
 * levers are the ones that change the SHAPE OF THE SKY: height band (a 2.6 m
 * lock-up row you see clean over vs a 12 m blank dock wall vs a 17 m slab
 * standing end-on), setback (a wall on the kerb line vs houses 21 m back
 * behind gardens), rhythm (unbroken vs wall/gap/wall), and symmetry (one side
 * towering while the other is open — which no instance in the family had).
 * Height also picks the facade family for free: `buildings.facadeVariant`
 * sends h ≥ 15 to the panelka grid and hashes everything below it across all
 * four sets, so a family that was all-tall was also all-one-texture.
 *
 * IT ALSO FIXES THE PLANTING, WITHOUT TOUCHING THE PROP PASS. `props.ts` skips
 * a tree whose point falls `insideBuilding(p, 1.8)`, and the near-field volumes
 * that stand on the kerb line sit exactly under the x = ±14.4 tree stations. A
 * recipe that occupies the west kerb clears the west row and leaves the east
 * one; a recipe that stands back leaves both. Seven different occupancy
 * patterns ⇒ seven different surviving tree rows, bought with authored data
 * instead of a global reseed. **The reseed is still the real cure and it is
 * NOT done here:** `DEFAULT_SEED` is shared by all 90 districts and every
 * pinned prop census in the tree, so it is a wave of its own.
 *
 * ⚠ DOC 87 B50 / B53 / B54 — WHY IT GREW A **SIXTH** AXIS, AND THE ONE
 * SENTENCE THAT REFUSED THE FIFTH. The near-field pass above gave the seven
 * districts seven rooflines and the register still would not sign the rows:
 *
 *   „THE CARRIAGEWAY IS IDENTICAL ON ALL SEVEN — the same 16.25 m width, the
 *   same осева, the same edge line, the same kerb. So the bottom ~45% of every
 *   frame is one picture … A driver looks at the road, not the roofline."
 *
 * Five axes and every one of them is BESIDE the road. Nothing this generator
 * has ever written changed the asphalt, and the asphalt is the largest object
 * in a cockpit frame.
 *
 * WHY THE WIDTH LEVER LOOKED BLOCKED, AND WHY IT IS NOT. The register's own
 * note (lever 3 below, and doc 87 row 884) says a 4 m curbside band grows the
 * street to 24.25 m curb to curb, which „grows the staged crossing from 16.25
 * to 24.25 m and takes 5.7 s longer at 1.4 m/s" and dropped
 * `sc-crossing-slow-crosser` and `sc-crossing-white-cane` from 3 stars to 1.
 * That measurement is right, and so is the conclusion — for the crossing.
 * Traced to its cause it is much narrower than it reads:
 *
 *   - `edgeParkingWidthM` adds the band OUTSIDE the travel lanes, and
 *     `referents.ts` derives the lane grid from `halfWidth − parkingM`. So a
 *     band does NOT move the driven rail: x = 4.0625 is the right-lane centre
 *     with a band and without one. No trace cares.
 *   - what the band DOES move is the KERB (8.125 → 12.125) and everything
 *     measured from it. `templates-pe*.ts` pins the staged walk by VALUE —
 *     `CURB_X = −9.73`, `roadFromM 1.6`, `roadToM 17.85` — so on a banded
 *     street the pedestrian steps off inside the parking strip instead of off
 *     the pavement, and `markings.paintZebra(…, eb.halfWidth)` paints a 24.25 m
 *     zebra under a 16.25 m walk.
 *
 * i.e. THE BLOCK IS ON THE SEGMENT THAT CARRIES THE CROSSING, not on the
 * street. The street is 138–155 m long; the crossing occupies one 16 m band of
 * it. Everything south of the crossing zone is free.
 *
 * So every instance now also names a CARRIAGEWAY: the street is emitted as a
 * CHAIN of collinear segments joined at degree-2 nodes, and only the southern
 * ones vary. Three shapes, all of them legible from the seat:
 *   - `bays-from-spawn-*` — the drill STARTS on a 24.25 m street lined with
 *     kerbside bays and a real parked row, and the road narrows ahead of you;
 *   - `bay-pocket-*` — 16.25 m at the seat, flaring into a bay pocket (a джоб)
 *     in the middle distance and closing again before the zebra;
 *   - `plain-two-lane` — today's single 16.25 m ribbon, unchanged.
 *
 * THE INVARIANTS THAT MAKE IT SAFE, each one asserted below rather than argued:
 *   - every segment is `lanes: 2` and carries the SAME `maxspeed`, so the lane
 *     grid never moves under the x = 4.06 rail and no unposted limit exists;
 *   - the segment that hosts `pe-x-1` is ALWAYS `parkingBand: false` and is
 *     always the edge id `pe-e-street`, so the painted zebra, the
 *     `CrossingZoneTracker` zone, the В24/В27 span and the staged walk from
 *     CURB_X are byte-identical to the file before this axis existed;
 *   - a banded segment must end at least `BAND_CROSSING_CLEAR_M` before the
 *     crossing. `TrafficLayer.computeParkedCars` clears 25 m around a crossing
 *     only on the crossing's OWN edge, so on a split street that guard does not
 *     reach — this generator has to keep the distance itself, and does;
 *   - a ban span may not straddle a joint (two zone rows would post two signs).
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
 * FOUR LEVERS DELIBERATELY NOT USED, each with the measurement that ruled it
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
 *   3. WIDTH **AT THE CROSSING**, i.e. one `parkingBand: true` on the edge that
 *      hosts `pe-x-1`. It was tried and the measurement stands: the staged
 *      walks are pinned by value from the kerb, so the crossing grows 16.25 →
 *      24.25 m, takes 5.7 s longer at 1.4 m/s, and `s3-pe-bot-completion`
 *      dropped `sc-crossing-slow-crosser` and `sc-crossing-white-cane` from 3
 *      stars to 1. Re-tuning the release distances (doc 86 T11 derives them
 *      from the kerb offset) is a lesson-design job in `templates-pe*.ts`, not
 *      a map job. That block is REAL and it is why the CARRIAGEWAY axis above
 *      widens the street only SOUTH of the crossing zone.
 *   4. `lanes` ON ANY DRIVEN SEGMENT. Measured, not assumed: the lane grid is
 *      `−travelHalf + k·8.125 + 4.0625`, so a 2-lane street puts a centre at
 *      x = +4.0625 — the rail every committed trace drives. `lanes: 3` puts the
 *      centres at −8.13 / 0 / +8.13 and the recorded rail STRADDLES a divider;
 *      `lanes: 4` keeps 4.06 a centre but demotes it from the kerbside lane to
 *      the inner one, and widens the travel carriageway to 32.5 m, which puts
 *      CURB_X = −9.73 inside it. Only `lanes: 2` leaves both the rail and the
 *      staged walk where they were authored, so every segment gets `lanes: 2`.
 *
 * FR-21's car half is closed here TWO ways now, and the second is the honest
 * one. Every CROSSING segment still declares `parkingBand: false`, so the curb
 * pass places nothing where there is nowhere lawful to stand — that used to seat
 * a body at `travelHalf + 2.0 m`, two metres PAST the kerb, „he goes trough a
 * car which is standing on the sidewalk", four lessons in his own words. And the
 * banded segments the CARRIAGEWAY axis introduces are the tag working as
 * designed: the band is drawn, the kerb moves out from under the row, and the
 * bodies stand on asphalt. Five of the seven now carry a real parked row, and
 * `pe-districts.test.ts` measures every body against the band it stands in.
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
/**
 * Where the drive STARTS. Every recorded PE trace begins here, so it is the
 * anchor the NEARFIELD axis is authored against — the streetscapes are
 * authored against `crossingY` instead, which is precisely why their content
 * lands 20–50 m north of the seat and the first fifty metres were bare.
 */
const SPAWN_Y_M = 15;
/** constants.PARKING_LANE_WIDTH_M — the curbside band, per side, m. */
const PARKING_LANE_WIDTH_M = 4.0;
/**
 * CARRIAGEWAY axis: how far short of the crossing every banded segment must
 * stop. `TrafficLayer.computeParkedCars` refuses to park within
 * `PARK_CROSSING_CLEAR_M` of an authored crossing — but only for crossings on
 * the SAME edge (`if (crossing.edgeId !== edge.id) continue`). On a split
 * street the bay segment is a different edge, so that guard cannot see the
 * zebra and this generator has to keep the distance itself. 30 m is the pass's
 * own 25 m clear plus a body half-length and a joint radius.
 */
const BAND_CROSSING_CLEAR_M = 30;
/** Shortest segment worth emitting: below this the ribbon is all joint taper. */
const MIN_SEGMENT_M = 12;
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

/**
 * `cityBuildings.DATA_HEIGHT_MIN_M` — the renderer clamps an authored height up
 * to this. Authoring below it is not an error the world reports; it is a number
 * in the file that the screen quietly ignores, which is the whole disease this
 * generator has just been treated for. Self-validated below instead.
 */
const MIN_DRAWN_HEIGHT_M = 3;

/**
 * Axis-aligned block, counter-clockwise, rounded — the footprint helper.
 *
 * ⚠ `heightSource: "height"`, AND THAT ONE WORD IS THE ANSWER TO „SAME MAP,
 * SAME ENGINEERING, EVERYTHING SAME". It used to say `"default"`, and
 * `cityBuildings.resolveBuildingHeightM` reads that word like this:
 *
 *     if (b.heightSource === "default") {
 *       const u = (hashString(b.id) % 1000) / 1000;
 *       return DEFAULT_HEIGHT_MIN_M + u * (DEFAULT_HEIGHT_MAX_M - DEFAULT_HEIGHT_MIN_M);
 *     }                                //  15 m                       25 m
 *
 * — i.e. THE AUTHORED HEIGHT WAS THROWN AWAY AND REPLACED BY A HASH IN
 * [15, 25] m. Every volume this file has ever written: the 1.8 m park wall, the
 * 3 m corner kiosk, the 2.8 m garage row, the 12 m dock wall, the 17 m panel
 * slab — all of them rendered as a 15–25 m mid-rise block. Measured on the
 * shipped files: the authored height was being discarded on 10/10 volumes of
 * pe-dart-v1, 9/9 of pe-rain-v1, 11/13 of pe-cane-v1, 10/11 of pe-slow-v1.
 *
 * That is why three variety passes did not move the picture. STREETSCAPES has
 * been authoring a low kiosk against a tall terrace since doc 86 D1, ROADSCAPES
 * and TERMINI both lean on massing, and not one of those metres has ever
 * reached the screen. It is also why the family read as one TEXTURE:
 * `buildings.facadeVariant` sends `height >= 15` to the panelka grid, and with
 * every resolved height ≥ 15 two thirds of the family took that one facade set.
 *
 * ⚠ IT IS NOT ONLY THIS FAMILY, and this fix deliberately does not reach the
 * rest. Across the 100 shipped district files there are **332 buildings on
 * `heightSource: "default"` and 4 on `"height"`** — the authored height is
 * discarded on 111 of d2-v1's volumes, on every поligon, lot, ov-, rx-, sp- and
 * tj- map's frontage, everywhere. Fixing that belongs in
 * `resolveBuildingHeightM` (or in the other generators), it moves every map in
 * the product, and it is a wave of its own. See the report.
 */
function block(x0, x1, y0, y1, height) {
  return {
    height,
    heightSource: "height",
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
      { id: "pe-b-park-wall", ...block(-15.5, -12.8, cY - 46, cY + 30, 3) },
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
      { id: "pe-b-garages", ...block(12.7, 19, cY - 52, cY - 12, 3) },
      { id: "pe-b-garages-n", ...block(12.7, 19, cY + 6, cY + 30, 3) },
    ],
  },
  /** PE-14 „Бял бастун" — the institute whose door points at the zebra. */
  "institute-and-transit": {
    noteBg:
      "Обществена сграда за хора с увредено зрение, чийто вход е насочен към пътеката, и спирка отсреща: белият бастун тук е ежедневие, а не изключение.",
    build: (cY) => [
      { id: "pe-b-institute", ...block(-38, -12.9, cY - 26, cY + 18, 10) },
      { id: "pe-b-institute-wing", ...block(-38, -25, cY + 18, cY + 40, 10) },
      { id: "pe-b-shelter", ...block(12.9, 16.4, cY - 9, cY - 3, 3) },
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

// ---------------------------------------------------------------------------
// Carriageways (doc 87 B50/B53/B54, sixth axis) — THE WIDTH OF THE ASPHALT
// ---------------------------------------------------------------------------

/**
 * „A driver looks at the road, not the roofline." Five axes changed what stands
 * BESIDE the street and the register measured the street itself: 16.25 m curb
 * to curb, `parkingBandM: 0`, on all seven.
 *
 * A carriageway recipe returns the SOUTHERN segments of the chain — everything
 * from y = 0 up to `cutY`, where the crossing-bearing `pe-e-street` takes over
 * and runs to the terminal node. `cutY = 0` means no split at all: the street
 * stays the single edge it has always been, byte-identical.
 *
 * Only three things vary and all three are read from the seat:
 *   - WIDTH — a banded segment is 24.25 m curb to curb against 16.25 m, and
 *     `TrafficLayer` fills its bays with a real parked row;
 *   - WHERE THE WIDTH CHANGES — the taper is a hard depth cue. A road that
 *     narrows 13 m past the bonnet is not the road that narrows at 52 m;
 *   - WHETHER THE SEAT IS INSIDE IT — starting between two parked rows and
 *     coming upon a bay pocket forty metres out are different drives.
 *
 * Not varied, and each is a measurement in the header: lane COUNT (lever 4),
 * width at the crossing (lever 3), the centreline (lever 1), junctions (2).
 */
const CARRIAGEWAYS = {
  /** The street the family has always been: one 16.25 m ribbon, no joint. */
  "plain-two-lane": {
    segments: () => [],
    noteBg:
      "Обикновено двулентово платно: 16,25 м от бордюр до бордюр по цялата отсечка, без джобове и без разширения — платното изглежда еднакво от потеглянето до пътеката.",
  },
  /** The ONLY pocket whose mouth is BEHIND the seat: the car spawns three
   *  metres inside it, so the drill opens on 24.25 m of asphalt that then
   *  narrows 29 m out. Its parked row starts at y = 23. */
  "bay-pocket-behind-the-seat": {
    segments: () => [
      { toY: 12, band: false },
      { toY: 44, band: true },
    ],
    noteBg:
      "Паркинг джобът започва ТРИ МЕТРА ЗАД теб — потегляш вече вътре в него, платното е 24,25 м широко и отдясно има спрели коли. На двадесет и девет метра напред се стеснява обратно до 16,25 м. Единствената отсечка в групата, чието разширение е започнало, преди ти да си тръгнал.",
  },
  /** The ONLY street that is wide UNDER THE SEAT and stays wide: bays run the
   *  whole length of the terrace and the taper is 31 m out. Row starts y = 11 —
   *  the closest parked car in the family. */
  "bays-from-the-seat": {
    segments: () => [{ toY: 46, band: true }],
    noteBg:
      "Единствената отсечка, по която потегляш върху широко платно и то остава широко: 46 м по 24,25 м с паркинг джобове пред витрините и коли, спрели непосредствено вдясно от теб. Стеснението е чак на тридесет и един метра.",
  },
  /** The clinic car park: the pocket sits in the MIDDLE distance, so the wide
   *  stretch reads as a place you are driving toward rather than one you are
   *  in. Row starts y = 37. */
  "bay-pocket-mid": {
    segments: () => [
      { toY: 26, band: false },
      { toY: 55, band: true },
    ],
    noteBg:
      "Тясно платно под колелата и широк джоб в средната далечина: между двадесет и шестия и петдесет и петия метър улицата се разтваря до 24,25 м — това е паркингът пред поликлиниката. После се стеснява обратно, четиридесет метра пред теб.",
  },
  /** The ONE-WAY street: the pocket mouth opens one metre past the bonnet and
   *  runs 36 m — the longest bay in the family — and none of that width carries
   *  an осева, because a one-way road has no oncoming half to separate. */
  "bay-pocket-oneway": {
    segments: () => [
      { toY: 16, band: false },
      { toY: 52, band: true },
    ],
    noteBg:
      "Джобът се отваря на един метър пред бронята и върви цели тридесет и шест метра: 24,25 м платно, по което НЯМА осева линия — улицата е еднопосочна, цялото платно е твое. Точно това прави пропускането на пешеходеца изцяло твоя отговорност.",
  },
  /** The blind corner: narrow under the seat, a lock-up row's pocket 7 m out,
   *  and the row starts at y = 33. */
  "bay-pocket-near": {
    segments: () => [
      { toY: 18, band: false },
      { toY: 50, band: true },
    ],
    noteBg:
      "Тръгваш по тясно 16,25-метрово платно, а на три метра пред теб то се разширява в паркинг джоб пред гаражите — 24,25 м със спрели коли, и после отново се стеснява преди пътеката.",
  },
  /** The freight approach: the pocket is a lorry lay-by, far enough out that
   *  it reads as a widening of the middle distance, not of the near field. */
  "bay-pocket-far": {
    segments: () => [
      { toY: 22, band: false },
      { toY: 58, band: true },
    ],
    noteBg:
      "Тясно платно под колелата и широк джоб чак в далечината: между двадесет и втория и петдесет и осмия метър улицата се разтваря до 24,25 м — това е отбивката пред портала на базата, където спират тежките коли. Най-отдалеченото разширение в групата.",
  },
};

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
      { id: "pe-b-park-wall-n", ...block(-56, 56, L + 62, L + 65.6, 3) },
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
// Nearfields (doc 87 B50 / B53 / B54) — WHAT STANDS BESIDE THE FIRST 50 m
// ---------------------------------------------------------------------------

/**
 * The fifth axis, and the only one authored in ABSOLUTE y. See the header for
 * the measurement; the short version is that axes 2–4 all act 50 m or more
 * ahead of a driver who spends the whole drill looking at the first fifty.
 *
 * A recipe returns volumes that must lie inside
 * `[NEARFIELD_MIN_Y, crossingY − NEARFIELD_CROSSING_CLEAR_M]`, must clear the
 * carriageway like every other volume (the shared per-edge clearance check
 * below measures them too), and must include at least one that BEGINS within
 * `NEARFIELD_FIRST_WITHIN_M` of the spawn. The last rule is the axis: without
 * it a „near field" recipe silently drifts north and becomes a fourth
 * streetscape.
 *
 * `signature` is the thing the family test compares — the three levers that
 * decide the SHAPE OF THE SKY at the seat, in the order a driver reads them:
 * which sides are occupied, the height band, and the nearest setback. Two
 * instances may not share it. It is asserted rather than described because
 * „they look different" is exactly the claim this family has failed three
 * times; a signature is checkable.
 */
const NEARFIELD_MIN_Y = 1;
/** No near-field volume may stand inside this of the crossing: the last stretch
 *  before a zebra belongs to the zebra, and the streetscape recipes already own
 *  it (they are authored ±46 m around `crossingY`). */
const NEARFIELD_CROSSING_CLEAR_M = 16;
/** At least one volume must begin within this of the spawn — THE axis rule. */
const NEARFIELD_FIRST_WITHIN_M = 20;

const NEARFIELDS = {
  /** PE-03 — a low two-storey shop arcade tight to both kerbs. You are inside
   *  a COMMERCIAL canyon from the first metre, and the sky sits just above the
   *  rooflines: the shortest horizon in the family. */
  "arcade-canyon-low": {
    sides: "both",
    heightBand: "low",
    setbackM: 12.6,
    noteBg:
      "Още от потеглянето си между витрините: двуетажна търговска аркада опира и от двете страни в тротоара. Улицата е тясна и ниска, небето започва точно над покривите — затова тук се кара бавно и се гледа в тротоара, а не в далечината.",
    build: () => [
      { id: "pe-b-nf-arcade-w", ...block(-30, -12.6, 3, 34, 6.5) },
      { id: "pe-b-nf-arcade-e", ...block(12.6, 29, 3, 30, 6.5) },
      { id: "pe-b-nf-arcade-e2", ...block(12.6, 26, 36, 52, 6.5) },
    ],
  },
  /** PE-08 — the OPPOSITE of the arcade and the only OPEN one: nothing stands
   *  on either kerb at all. Everything is set 19–26 m back behind forecourts,
   *  so the pavement runs free and the sky comes down to the rooflines instead
   *  of starting above them. The widest, brightest street of the seven.
   *
   *  It deliberately carries no kerbside wall, and that is a consequence of the
   *  `heightSource` fix rather than a taste: the renderer clamps an authored
   *  height up to 3 m (`DATA_HEIGHT_MIN_M`), and a 3 m wall on the kerb line is
   *  not a garden edging — from a 1.25 m eye 9 m away it stands 11° above the
   *  horizon and closes exactly the view this recipe exists to open. */
  "open-forecourt": {
    sides: "both",
    heightBand: "setback-low",
    setbackM: 19,
    noteBg:
      "Широко и открито: на нито един от двата тротоара не стои нищо — сградите са дръпнати навътре зад паркинга на поликлиниката. Нищо не ти пречи да виждаш надалеч, и точно затова бавният пешеходец се забелязва рано, ако гледаш.",
    build: () => [
      { id: "pe-b-nf-villa-w", ...block(-40, -26, 8, 30, 7) },
      { id: "pe-b-nf-annex-w", ...block(-38, -25, 36, 56, 5.5) },
      { id: "pe-b-nf-pavilion-e", ...block(19, 31, 10, 24, 4.5) },
      { id: "pe-b-nf-clinic-park-e", ...block(22, 34, 30, 52, 5.5) },
    ],
  },
  /** PE-16 — total enclosure from metre one: the dock walls run south to the
   *  start of the street, so the canyon has no mouth. Nights here are the
   *  headlights and nothing else. */
  "dock-wall-tight": {
    sides: "both",
    heightBand: "tall",
    setbackM: 12.6,
    noteBg:
      "Коридорът започва още от потеглянето: глухите стени на рампите вървят до самото начало на отсечката. Няма отвор, няма пролука, няма къде да падне светлина — от първия метър караш в тъмен тунел.",
    build: () => [
      { id: "pe-b-nf-dock-w", ...block(-42, -12.6, 2, 23, 12) },
      { id: "pe-b-nf-dock-e", ...block(12.6, 44, 2, 31, 12) },
    ],
  },
  /** PE-02 — a lock-up garage row whose roofline sits barely above the eye for
   *  thirty metres with open sky over it, and then the 9 m corner block rears
   *  up at y = 50, three times its height. The silhouette CHANGES during the
   *  approach, and that change is the lesson. (3 m, not the 2.6 m first
   *  authored: `MIN_DRAWN_HEIGHT_M` is the floor the renderer actually draws,
   *  so anything lower is a number the screen ignores.) */
  "lockup-garages": {
    sides: "both",
    heightBand: "low-row",
    setbackM: 12.6,
    noteBg:
      "Първите тридесет метра покрай теб минава ниска редица гаражи — покривите им са едва над очите ти и над тях остава чисто небе. И точно затова деветметровата ъглова сграда, която изниква след тях, изглежда толкова внезапна: улицата ти е показала ниска линия, и после я вдига.",
    // The east row is BROKEN AT THE BAY MOUTH, and that is the CARRIAGEWAY axis
    // showing through the frontage rather than a taste: a lock-up forecourt
    // cannot occupy the metres the parking pocket occupies, so the row stops at
    // y = 17 (still on the 16.25 m lead-in, still hard against the kerb at
    // x = 12.6) and picks up again at y = 20 standing 4 m further back, which is
    // where the widened kerb puts it. It is also what keeps the east tree
    // station at (14.0, 11) suppressed here — without it that station survives
    // on this district AND on pe-slow-v1, and the family's „no two plant the
    // same tree in the same metre" gate fails on that pair. It caught it.
    build: () => [
      { id: "pe-b-nf-lockup-w", ...block(-26, -12.6, 4, 17, 3) },
      { id: "pe-b-nf-lockup-w2", ...block(-26, -12.6, 24, 37, 3) },
      { id: "pe-b-nf-lockup-e", ...block(12.6, 25, 4, 17, 3) },
      { id: "pe-b-nf-lockup-e2", ...block(12.6, 25, 20, 31, 3) },
    ],
  },
  /** PE-10 — the only ASYMMETRIC one in the family: a 21 m residential slab
   *  standing over the west kerb while the east side is a 2.4 m yard wall.
   *  One side of the windscreen is full and the other is sky. */
  "yard-wall-asym": {
    sides: "asym-west-tall",
    heightBand: "slab",
    setbackM: 12.6,
    noteBg:
      "Улицата е несиметрична: отляво жилищен блок опира в тротоара и закрива половината стъкло, а отдясно е само ниският зид на базата. Каквото излиза насреща, излиза отдясно — и ти няма как да го видиш отляво.",
    build: () => [
      { id: "pe-b-nf-slab-w", ...block(-34, -13, 6, 44, 21) },
      { id: "pe-b-nf-yardwall-e", ...block(12.6, 13.8, 2, 27, 3) },
      { id: "pe-b-nf-weighhut-e", ...block(16, 26, 6, 17, 3.6) },
    ],
  },
  /** PE-04 — the only LAYERED frontage in the family: a 2.8 m garage row on the
   *  kerb with a 17 m panel slab standing right behind it, so the east side has
   *  two depths and a roofline that steps. The west is the slab the streetscape
   *  already puts on the kerb — one flat wall, one stepped one. */
  "garage-and-backslab": {
    sides: "asym-east-layered",
    heightBand: "stepped",
    setbackM: 12.7,
    noteBg:
      "Отдясно улицата е на два етажа дълбочина: първо ниска редица гаражи до самия тротоар, а веднага зад тях се извисява панелен блок. Отляво е глухият калкан на другия блок. Между гаражите има процепи — и точно оттам излиза дете, което ти виждаш едва в последния момент.",
    build: () => [
      // The bin store is not dressing: without something on this kerb before
      // y = 17 the east tree station at y = 11 survives here AND on pe-slow-v1,
      // and the family test „no two districts plant the same tree in the same
      // metre" fails on that one pair. It caught it; this is the fix.
      { id: "pe-b-nf-binstore-e", ...block(12.7, 18, 6, 14, 3) },
      { id: "pe-b-nf-trafo-e", ...block(12.7, 20, 17, 25, 3.6) },
      { id: "pe-b-nf-backslab-e", ...block(19.5, 40, 26, 52, 17) },
    ],
  },
  /** PE-14 — the DOMESTIC one, and the only family of separate volumes: a
   *  continuous three-storey terrace hard on the east kerb, and on the west
   *  three DETACHED houses standing 21 m back behind open front gardens with
   *  real gaps between them. Every other instance is walls; this one is
   *  objects, and the gaps are where a person steps out. */
  "villa-row-setback": {
    sides: "asym-east-tight",
    heightBand: "house",
    setbackM: 12.9,
    noteBg:
      "Ниска домашна улица: отдясно плътен ред стари къщи опира в тротоара, а отляво къщите са дръпнати навътре зад предни градини и стоят разделени една от друга. Между тях зеят пролуки — и точно от такава пролука се излиза направо на платното, без да те е видял никой.",
    build: () => [
      { id: "pe-b-nf-house-w1", ...block(-32, -21, 6, 17, 8.5) },
      { id: "pe-b-nf-house-w2", ...block(-32, -21, 23, 34, 8.5) },
      { id: "pe-b-nf-house-w3", ...block(-32, -21, 40, 51, 8.5) },
      { id: "pe-b-nf-terrace-e", ...block(12.9, 24, 4, 26, 9.5) },
      { id: "pe-b-nf-terrace-e2", ...block(12.9, 24, 32, 54, 9.5) },
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
 *   nearfield: string,       // doc 87 B53 — what stands beside the first 50 m
 *   carriageway: string,     // doc 87 B50 — the width of the asphalt (CARRIAGEWAYS)
 * }} params
 */
export function buildPeCrossingStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    approachM,
    maxspeedKmh,
    streetscape,
    roadscape,
    terminus,
    nearfield,
    carriageway,
  } = params;

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
  if (!NEARFIELDS[nearfield]) {
    errors.push(
      `nearfield "${nearfield}" unknown — pick one of ${Object.keys(NEARFIELDS).join(", ")} ` +
        `(doc 87 B50/B53/B54: an instance without its own near field is another copy of the ` +
        `FIRST FIFTY METRES, which is the only part of the street the student looks at for the ` +
        `whole drill and the one part the other four axes never touch)`,
    );
  }
  if (!CARRIAGEWAYS[carriageway]) {
    errors.push(
      `carriageway "${carriageway}" unknown — pick one of ${Object.keys(CARRIAGEWAYS).join(", ")} ` +
        `(doc 87 B50/B53/B54: an instance without its own carriageway is another copy of the ` +
        `SAME 16.25 m ribbon, which is the bottom ~45% of every cockpit frame and the half ` +
        `the near-field pass was refused for)`,
    );
  }
  if (errors.length > 0) throw new Error(`gen_pe_crossings params invalid:\n  - ${errors.join("\n  - ")}`);

  const road = ROADSCAPES[roadscape];
  const end = TERMINI[terminus];
  const near = NEARFIELDS[nearfield];
  const cw = CARRIAGEWAYS[carriageway];
  /** Arterial classes carry the band by class; an explicit tag overrides it. */
  const bandByClass = ["primary", "secondary", "tertiary"].includes(road.roadClass);
  const hasBand = road.parkingBand === null ? bandByClass : road.parkingBand === true;
  /** The band ON THE CROSSING SEGMENT — lever 3 keeps this 0 on all seven. */
  const parkingBandM = hasBand ? PARKING_LANE_WIDTH_M : 0;
  const clearX = frontageClearX(parkingBandM);

  const crossingY = approachM;
  const lengthM = crossingY + RUNOUT_M;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  // -- CARRIAGEWAY (doc 87 B50/B53/B54, sixth axis): the street as a CHAIN of
  // collinear segments joined at degree-2 nodes. The recipe owns everything
  // SOUTH of `cutY`; `pe-e-street` runs from there to the terminal node and
  // carries the crossing, the ban zone, the finish spawn and — always —
  // `parkingBand: false`, so nothing the axis does can reach the graded
  // geometry (see lever 3 in the header for the measurement that forces it).
  const southSpec = cw.segments(lengthM, crossingY);
  /** [fromY, toY, bandM] per segment, south → north, INCLUDING pe-e-street. */
  const SEGMENTS = [];
  {
    let y0 = 0;
    southSpec.forEach((s, i) => {
      SEGMENTS.push({
        id: `pe-e-street-s${i + 1}`,
        fromNode: i === 0 ? "pe-n-start" : `pe-n-cw${i}`,
        toNode: `pe-n-cw${i + 1}`,
        fromY: y0,
        toY: s.toY,
        bandM: s.band ? PARKING_LANE_WIDTH_M : 0,
      });
      y0 = s.toY;
    });
    SEGMENTS.push({
      id: "pe-e-street",
      fromNode: southSpec.length === 0 ? "pe-n-start" : `pe-n-cw${southSpec.length}`,
      toNode: "pe-n-end",
      fromY: y0,
      toY: lengthM,
      bandM: parkingBandM,
    });
  }
  const crossSeg = SEGMENTS[SEGMENTS.length - 1];
  /** The curbside band in force at district y — drives the frontage stand-back. */
  const bandAtY = (y) => {
    for (const s of SEGMENTS) if (y >= s.fromY - 1e-9 && y <= s.toY + 1e-9) return s.bandM;
    return 0; // north of the terminal node: terminus legs, never banded
  };
  /**
   * How far a volume spanning [y0, y1] must move out. The WIDEST band its own
   * y-range touches, so a wall beside a bay pocket stands back from the bay's
   * kerb and the same recipe's wall beside the plain section does not — the
   * frontage steps where the road does, which is what a real джоб looks like.
   */
  const shiftForSpan = (y0, y1) => {
    let widest = 0;
    for (const s of SEGMENTS) {
      if (y1 < s.fromY - 1e-9 || y0 > s.toY + 1e-9) continue;
      widest = Math.max(widest, s.bandM);
    }
    return widest;
  };
  const shiftBlock = (bl) => {
    const ys = bl.footprint.map(([, y]) => y);
    const out = shiftForSpan(Math.min(...ys), Math.max(...ys));
    return out === 0
      ? bl
      : { ...bl, footprint: bl.footprint.map(([x, y]) => [r2(x + Math.sign(x) * out), y]) };
  };
  /** Legacy alias kept for the meta signature: the CROSSING segment's shift. */
  const shiftOut = clearX - FRONTAGE_CLEAR_X;

  // -- Nodes / edges. Every segment is `lanes: 2` on the same posted limit, so
  // the lane grid (and the x = 4.06 rail every committed trace drives) is the
  // same on all of them; only the kerb moves.
  const NODES = { "pe-n-start": [0, 0], "pe-n-end": [0, lengthM] };
  for (const s of SEGMENTS) {
    if (!NODES[s.toNode]) NODES[s.toNode] = [0, r2(s.toY)];
  }
  const segEdge = (s) => {
    const geo = [
      [0, r2(s.fromY)],
      [0, r2(s.toY)],
    ];
    return {
      id: s.id,
      from: s.fromNode,
      to: s.toNode,
      class: road.roadClass,
      name: "Улица с пешеходна пътека",
      oneway: road.oneway,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geo),
      geometry: geo,
      // FR-21 (car half) + FR-41: only written when there is an OPINION about
      // the curbside band, so a street written before the tag existed is
      // byte-identical. `true` ⇒ draw the 4 m band and let the parked row land
      // on asphalt; `false` ⇒ no band and no procedural parked row at all.
      // The CROSSING segment inherits the roadscape's opinion; a CARRIAGEWAY
      // segment states its own, because the band is what the axis IS.
      ...(s.id === "pe-e-street"
        ? road.parkingBand === null
          ? {}
          : { parkingBand: road.parkingBand }
        : { parkingBand: s.bandM > 0 }),
      // FR-41: a side with NO pavement at all (network.edgeBareVerge) — the
      // industrial canyon's loading wall stands on the kerb, so that side has
      // no footway, no lamp column, no tree and no bus shelter.
      ...(road.bareVerge ? { bareVerge: road.bareVerge } : {}),
    };
  };
  // `pe-e-street` stays EDGES[0] — pe-districts.test.ts reads the graded street
  // there, and so does every census that has ever been taken of this family.
  const EDGES = [segEdge(crossSeg), ...SEGMENTS.slice(0, -1).map(segEdge)];

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
  //
  // The span is authored in ABSOLUTE y and then re-based onto the crossing
  // segment's own arclength, because `DistrictZone.fromM/toM` are measured
  // along ONE edge. A span that straddled a joint would have to be emitted as
  // two zone rows and `zoneSigns` posts a face at each row's start — two В24
  // posts eight metres apart is a falsehood a student can see, so instead the
  // span is CLAMPED to start just inside the crossing segment. On the two
  // instances where that moves it (pe-dart 42 → 48 m, pe-bus 29.6 → 58 m) the
  // ban still covers the whole crossing approach, which is what the roadscape
  // recipe's note says it is for. Asserted below, never assumed.
  const banAbs = road.ban
    ? {
        fromY: Math.max(r2(lengthM * road.ban.fromFrac), r2(crossSeg.fromY + 2)),
        toY: r2(lengthM * road.ban.toFrac),
      }
    : null;
  const ZONES = banAbs
    ? [
        {
          id: `pe-z-${road.ban.kind.toLowerCase()}`,
          kind: road.ban.kind,
          edgeId: "pe-e-street",
          fromM: r2(banAbs.fromY - crossSeg.fromY),
          toM: r2(banAbs.toY - crossSeg.fromY),
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
  // The approach spawn keeps its coordinates to the metre (every recorded trace
  // starts there) but names whichever segment now contains y = 15.
  const segAtY = (y) => SEGMENTS.find((s) => y >= s.fromY - 1e-9 && y <= s.toY + 1e-9) ?? crossSeg;
  const SPAWN_POINTS = [
    {
      id: "pe-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: segAtY(SPAWN_Y_M).id,
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
  // Authored against FRONTAGE_CLEAR_X; a stretch of road that carries a parking
  // band pushes the frontage BESIDE IT out by the band width, so the recipe
  // keeps its authored stand-back from the kerb on every cross-section and
  // never has to know which one it is riding (no volume straddles x = 0, so the
  // sign of x is the side). `shiftForSpan` is per-VOLUME rather than
  // per-district since the CARRIAGEWAY axis: a wall beside a bay pocket stands
  // 4 m further back than the same recipe's wall beside the plain section.
  const BUILDINGS = [
    ...recipe.build(crossingY).map(shiftBlock),
    // The TERMINUS vista: what fills the sky at the end of the street. Authored
    // in absolute coordinates (it is past the terminal node, so the parking
    // band never shifts it) and validated against EVERY edge below.
    ...end.build(lengthM),
    // The NEARFIELD: what stands beside the FIRST FIFTY METRES. Authored in
    // absolute y against the SPAWN, and shifted out by the band like the
    // streetscape is. Validated below against the spawn anchor and the crossing.
    ...near.build().map(shiftBlock),
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
        /** doc 87 B50/B53/B54 — WHAT STANDS BESIDE THE FIRST FIFTY METRES,
         *  i.e. the only part of the world the student looks at for the whole
         *  drill, and the one the other four axes are all authored past. */
        nearfield,
        nearfieldNoteBg: near.noteBg,
        /** The signature the family battery compares: sides occupied × height
         *  band × nearest setback. Two instances may not share it. */
        nearfieldSignature: `${near.sides}|${near.heightBand}|${r2(near.setbackM + shiftOut)}`,
        /** Distance from the SPAWN to the first near-field volume, m. This is
         *  the number that was effectively infinite on pe-cane-v1 and 41+ m on
         *  most of the rest; `NEARFIELD_FIRST_WITHIN_M` now caps it. */
        nearfieldFirstM: r2(
          Math.min(...near.build().map((bl) => Math.min(...bl.footprint.map(([, y]) => y)))) -
            SPAWN_Y_M,
        ),
        /** Extra road the terminus adds past the terminal node (0 = the street
         *  simply ends and the vista is frontage only). */
        terminusLegs: LEGS.length,
        // LEG length only — the CARRIAGEWAY axis also puts edges after index 0,
        // and counting those here would have quietly reported bay pockets as
        // terminus road.
        terminusRoadM: r2(LEGS.reduce((s, l) => s + polylineLength(l.edge.geometry), 0)),
        roadClass: road.roadClass,
        parkingBandM,
        bareVerge: road.bareVerge,
        curbToCurbM: r2(2 * (halfRoadM + parkingBandM)),
        /** doc 87 B50/B53/B54 — THE WIDTH OF THE ASPHALT, per segment. The one
         *  axis that changes the bottom ~45 % of a cockpit frame. */
        carriageway,
        carriagewayNoteBg: cw.noteBg,
        carriagewaySegments: SEGMENTS.map((s) => ({
          id: s.id,
          fromY: r2(s.fromY),
          toY: r2(s.toY),
          curbToCurbM: r2(2 * (halfRoadM + s.bandM)),
        })),
        /** Curb to curb AT THE SEAT (district y = 15). This is the number the
         *  founder's frame is actually of; `curbToCurbM` above is the crossing's
         *  and is frozen at 16.25 by lever 3. */
        spawnCurbToCurbM: r2(2 * (halfRoadM + bandAtY(SPAWN_Y_M))),
        /** Where the width changes, north of the spawn — the taper is a depth
         *  cue and no two instances may put it in the same place. */
        widthChangesAtM: SEGMENTS.slice(0, -1).map((s) => r2(s.toY - SPAWN_Y_M)),
        /** Metres of 24.25 m carriageway on the drive. 0 = today's street. */
        bayedRoadM: r2(SEGMENTS.reduce((s, g) => s + (g.bandM > 0 ? g.toY - g.fromY : 0), 0)),
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
  const segIds = new Set(SEGMENTS.map((s) => s.id));
  for (const s of SPAWN_POINTS) {
    if (!segIds.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (s.edgeId !== segAtY(s.y).id) post.push(`${s.id}: edgeId ${s.edgeId} does not contain y=${s.y}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  // -- CARRIAGEWAY invariants (doc 87 B50/B53/B54, the sixth axis). Every one of
  // these is what keeps a width change from reaching the graded geometry, and
  // every one is the reason a previous attempt at the width lever was reverted.
  {
    let prevY = 0;
    for (const s of SEGMENTS) {
      if (Math.abs(s.fromY - prevY) > 1e-9) {
        post.push(`carriageway ${carriageway}: segment ${s.id} starts at ${s.fromY}, gap from ${prevY}`);
      }
      if (s.toY - s.fromY < MIN_SEGMENT_M) {
        post.push(
          `carriageway ${carriageway}: segment ${s.id} is ${r2(s.toY - s.fromY)} m — below the ` +
            `${MIN_SEGMENT_M} m floor, so it would be all joint taper and no ribbon`,
        );
      }
      prevY = s.toY;
    }
    if (Math.abs(prevY - lengthM) > 1e-9) {
      post.push(`carriageway ${carriageway}: the chain ends at ${prevY}, not at the terminal node ${lengthM}`);
    }
    // Lever 3: the segment the zebra is painted on, the CrossingZone arms from
    // and the staged walk steps onto must be the 16.25 m one it was authored
    // against. `markings.paintZebra` takes `eb.halfWidth`, so a band here paints
    // a 24.25 m zebra under a walk pinned at CURB_X = −9.73.
    if (crossSeg.bandM !== 0) {
      post.push(
        `carriageway ${carriageway}: the crossing segment carries a ${crossSeg.bandM} m band — ` +
          `that widens the painted zebra and the kerb the staged walk is pinned to ` +
          `(templates-pe*.ts CURB_X = −9.73), which is the change that dropped ` +
          `sc-crossing-slow-crosser and sc-crossing-white-cane from 3 stars to 1`,
      );
    }
    // Lever 4: one lane grid on the whole chain, or the recorded rail moves.
    for (const e of EDGES) {
      if (!segIds.has(e.id)) continue;
      if (e.lanes !== 2) post.push(`${e.id}: ${e.lanes} lanes — only 2 keeps x = ${laneCenterM} a kerbside lane centre`);
      if (e.maxspeed !== maxspeedKmh) post.push(`${e.id}: ${e.maxspeed} km/h — a joint has no arm to post В26 on`);
      if (e.class !== road.roadClass) post.push(`${e.id}: class ${e.class} != the roadscape's ${road.roadClass}`);
      if (e.oneway !== road.oneway) post.push(`${e.id}: oneway ${e.oneway} != the roadscape's ${road.oneway}`);
    }
    // The parked row `TrafficLayer` seats in a bay must stay clear of the zebra.
    // Its own 25 m crossing guard only looks at the crossing's OWN edge
    // (`if (crossing.edgeId !== edge.id) continue`), so on a split street this
    // distance is nobody's job but this generator's.
    for (const s of SEGMENTS) {
      if (s.bandM === 0) continue;
      if (crossingY - s.toY < BAND_CROSSING_CLEAR_M) {
        post.push(
          `carriageway ${carriageway}: banded segment ${s.id} ends at y=${s.toY}, only ` +
            `${r2(crossingY - s.toY)} m before the crossing at ${crossingY} — computeParkedCars ` +
            `cannot see a crossing on another edge, so a body would stand inside the approach ` +
            `(need >= ${BAND_CROSSING_CLEAR_M} m)`,
        );
      }
    }
    // A ban span may not straddle a joint: `zoneSigns` posts one face per zone
    // row, so a split span posts two signs metres apart.
    if (banAbs) {
      if (banAbs.fromY < crossSeg.fromY - 1e-9 || banAbs.toY > lengthM + 1e-9) {
        post.push(
          `roadscape ${roadscape}: ban span [${banAbs.fromY}, ${banAbs.toY}] straddles the joint at ` +
            `y=${crossSeg.fromY} — it would need two zone rows and would post two ${KIND_TO_SIGN[road.ban.kind]} faces`,
        );
      }
    }
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
  /** The whole graded street as one collinear polyline — see the chain test. */
  const CHAIN_GEO = [
    [0, 0],
    [0, lengthM],
  ];
  /** Clearance the chain demands at district y, band-aware. */
  const chainClearanceAt = (y) =>
    halfRoadM +
    bandAtY(Math.min(Math.max(y, 0), lengthM)) +
    SIDEWALK_SKIRT_M +
    SIDEWALK_W +
    FRONTAGE_STANDBACK_M;
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
    // Since `block()` emits `heightSource: "height"`, the authored metres are
    // what gets drawn — EXCEPT below this floor, where the renderer clamps and
    // says nothing. A file that states 1.8 and draws 3.0 is a smaller version
    // of the bug that produced „same map, same engineering": a number in the
    // data that the screen does not obey.
    if (bl.height < MIN_DRAWN_HEIGHT_M) {
      post.push(
        `${bl.id}: height ${bl.height} m is below the renderer's ${MIN_DRAWN_HEIGHT_M} m floor ` +
          `(cityBuildings.DATA_HEIGHT_MIN_M clamps it up and reports nothing) — author ` +
          `${MIN_DRAWN_HEIGHT_M} m, or use a volume that is genuinely taller`,
      );
    }
    for (const [x, y] of bl.footprint) {
      // The CHAIN is one straight collinear street, so its clearance is measured
      // against the whole [0, lengthM] ribbon with the band IN FORCE AT THIS y —
      // never segment by segment. Per-segment `missToPolyline` measures to a
      // segment's END POINT, so a wall standing 4 m north of a bay pocket's
      // joint failed a 16.48 m lateral test on a hypotenuse of 13.2 m: a
      // geometry error, not a frontage error.
      {
        const need = chainClearanceAt(y);
        const got = missToPolyline(CHAIN_GEO, x, y);
        if (got < need - 1e-9) {
          post.push(
            `${bl.id}: footprint (${x}, ${y}) is ${r2(got)} m from the street, inside its ` +
              `${r2(need)} m kerb+sidewalk clearance (${road.roadClass}, 2 lanes, ` +
              `${r2(bandAtY(Math.min(Math.max(y, 0), lengthM)))} m band here)`,
          );
        }
      }
      for (const e of EDGES) {
        if (segIds.has(e.id)) continue; // handled by the chain test above
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
    if (segIds.has(e.id)) continue; // a CARRIAGEWAY segment, not a terminus leg
    for (const [, y] of e.geometry) {
      if (y < lengthM - 1e-9) post.push(`${e.id}: terminus geometry reaches y=${y}, south of the terminal node (${lengthM})`);
    }
  }
  // The NEARFIELD must actually BE a near field. Three rules, and the first is
  // the axis itself: a recipe whose nearest volume drifts north is a fourth
  // streetscape wearing this axis's name, which is exactly how the first fifty
  // metres ended up bare on all seven while four axes reported „variety".
  {
    const nfY = near.build().flatMap((bl) => bl.footprint.map(([, y]) => y));
    const first = Math.min(...nfY);
    const last = Math.max(...nfY);
    if (first > SPAWN_Y_M + NEARFIELD_FIRST_WITHIN_M) {
      post.push(
        `nearfield ${nearfield}: nearest volume begins at y=${first}, ` +
          `${r2(first - SPAWN_Y_M)} m from the spawn — the axis requires something standing ` +
          `within ${NEARFIELD_FIRST_WITHIN_M} m of it (doc 87 B53: the streetscapes are ` +
          `authored against the CROSSING and that is why they all land past the seat)`,
      );
    }
    if (first < NEARFIELD_MIN_Y) {
      post.push(`nearfield ${nearfield}: volume at y=${first} is south of the street start`);
    }
    if (last > crossingY - NEARFIELD_CROSSING_CLEAR_M) {
      post.push(
        `nearfield ${nearfield}: volume reaches y=${last}, inside the ` +
          `${NEARFIELD_CROSSING_CLEAR_M} m the crossing at y=${crossingY} keeps clear ` +
          `(the streetscape recipe owns that stretch)`,
      );
    }
    if (near.build().length < 2) post.push(`nearfield ${nearfield}: needs >= 2 volumes to read as a street edge`);
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
  // FR-21: every drivable edge in the file must state an OPINION about the
  // band, and the opinion must match the width actually drawn. Absent, the class
  // decides — and on a `residential` street the class says "no band" while
  // `TrafficLayer.PARK_CLASSES` says "park here", which is the two-set
  // disagreement that put 2605 bodies on 83 districts' pavements.
  for (const e of EDGES) {
    if (typeof e.parkingBand !== "boolean") {
      post.push(`${e.id}: no parkingBand opinion — the class decides, and PARK_CLASSES ⊋ PARKING_LANE_CLASSES (FR-21)`);
      continue;
    }
    const seg = SEGMENTS.find((s) => s.id === e.id);
    if (seg && e.parkingBand !== seg.bandM > 0) {
      post.push(`${e.id}: parkingBand ${e.parkingBand} contradicts its ${seg.bandM} m band`);
    }
  }
  for (const z of ZONES) {
    if (KIND_TO_SIGN[z.kind] !== z.signRef) post.push(`${z.id}: signRef ${z.signRef} does not post ${z.kind}`);
    const host = SEGMENTS.find((s) => s.id === z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    } else if (!(z.fromM >= 0 && z.toM <= host.toY - host.fromY + 1e-9 && z.toM - z.fromM >= 20)) {
      post.push(
        `${z.id}: span [${z.fromM}, ${z.toM}] is not a readable stretch of the ` +
          `${r2(host.toY - host.fromY)} m ${host.id} segment`,
      );
    }
    if (z.edgeId !== "pe-e-street") post.push(`${z.id}: a ban belongs on the crossing segment, not on ${z.edgeId}`);
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
//   district      appr limit class        sign  near field           first m
//   pe-clear-v1   90 m  50   tertiary     В27   arcade-canyon-low     −12
//   pe-slow-v1    85 m  40   residential  В27   open-forecourt        −11
//   pe-rain-v1    95 m  50   unclassified  —    dock-wall-tight       −13
//   pe-dart-v1    80 m  50   residential  В24   lockup-garages        −11
//   pe-bus-v1     88 m  50   tertiary     В24   yard-wall-asym        −13
//   pe-child-v1   78 m  40   residential   —    garage-and-backslab    +2
//   pe-cane-v1    92 m  50   residential  Д4    villa-row-setback     −12
//                             (ONE-WAY)
//
// „first m" is `nearfieldFirstM`: how far from the SPAWN the nearest authored
// volume begins. Negative means it is already beside you when the drill starts.
// Before this axis existed the same column read +41, +24, +10, +19, +15, +3 and
// — on pe-cane-v1, the lesson he wrote „absolutely same as question 23" about —
// nothing at all for the first fifty metres.
//
// ⚠ THE CROSS-SECTION COLUMN THIS TABLE USED TO CARRY WAS FALSE ONCE, was
// deleted, and is now TRUE — worth the whole history, because a future author
// would have trusted the false version. It once claimed 24.25 m curb-to-curb
// for four of the seven while every shipped file was 16.25 m with
// `parkingBandM: 0`; the comment had survived a revert. What follows is
// measured on the emitted JSON by `pe-districts.test.ts`, not asserted here:
//
//   district      carriageway                  seat      width changes   1st car
//   pe-clear-v1   bays-from-the-seat           24.25 m   +31             y=11
//   pe-slow-v1    bay-pocket-mid               16.25 m   +11, +40        y=37
//   pe-rain-v1    plain-two-lane               16.25 m   —               none
//   pe-dart-v1    bay-pocket-near              16.25 m    +3, +35        y=29
//   pe-bus-v1     bay-pocket-far               16.25 m    +7, +43        y=33
//   pe-child-v1   bay-pocket-behind-the-seat   24.25 m    −3, +29        y=23
//   pe-cane-v1    bay-pocket-oneway            16.25 m    +1, +37        y=27
//                 (ONE-WAY: 24.25 m of asphalt with no осева on it at all)
//
// „seat" is curb-to-curb at district y = 15, where every recorded drive begins.
// „width changes" is metres AHEAD of that seat. All seven were 16.25 m / never.
//
// ⚠ THE „1st car" COLUMN IS WHY THE BAY STARTS ARE STAGGERED, and it is worth
// the sentence because the first attempt got it wrong and the sheet showed it.
// `TrafficLayer.computeParkedCars` seats the row at `PARK_END_MARGIN_M` = 11 m
// from the SEGMENT START and every `PARK_SPACING_M` = 6.6 m after it, on the
// RIGHT of travel only. Three districts were first given a bay starting at
// y = 0; all three then had their nearest parked car at exactly y = 11, on the
// same side, at the same three metres — a fresh instance of the very defect
// this axis exists to fix, and the cockpit sheet made it obvious at a glance.
// Six distinct bay starts buy six distinct rows. The one-sidedness is NOT
// fixable from here: the row's side is `TrafficLayer`'s right-hand normal.
//
// FR-21 is now closed both ways the tag allows. The CROSSING segment of every
// one of the seven still declares `parkingBand: false`, so nothing is placed
// where there is nowhere lawful to stand; the five bay segments declare `true`,
// so the band is drawn, the kerb moves out from under the row and the bodies
// stand on asphalt. That is the tag doing its job rather than being avoided.
//
// No two rows agree on the whole tuple, and world/__tests__/pe-districts holds
// it: „no two districts share a CROSS-SECTION signature", „no two share a
// TERMINUS", „no two share a NEAR-FIELD signature", and now „no two share a
// CARRIAGEWAY signature" — the last one being the only assertion in the battery
// about the part of the world the cockpit camera actually points at. The two
// arterial-class streets also gain edge lines, lane dashes and a lamp column
// row that the residential ones do not have, so „lamps = 0 on all seven" is no
// longer true of the family either. And a В27 span is a real hole in the parked
// row — `TrafficLayer.computeParkedCars` honours the ban zone, so the sign and
// the street agree.

const INSTANCES = [
  {
    districtId: "pe-clear-v1",
    label: "Търговска отсечка с пешеходна пътека (сценарий PE-03)",
    approachM: 90,
    maxspeedKmh: 50,
    streetscape: "corner-shop-terrace",
    roadscape: "collector-shopping",
    terminus: "opens-to-collector",
    nearfield: "arcade-canyon-low",
    carriageway: "bays-from-the-seat",
  },
  {
    districtId: "pe-slow-v1",
    label: "Улица пред поликлиника (сценарий PE-08)",
    approachM: 85,
    maxspeedKmh: 40,
    streetscape: "clinic-and-park",
    roadscape: "residential-clinic",
    terminus: "closed-by-block",
    nearfield: "open-forecourt",
    carriageway: "bay-pocket-mid",
  },
  {
    districtId: "pe-rain-v1",
    label: "Неосветен складов участък — пътека в дъжд през нощта (сценарий PE-16)",
    approachM: 95,
    maxspeedKmh: 50,
    streetscape: "unlit-warehouse-canyon",
    roadscape: "industrial-canyon",
    terminus: "bends-away-left",
    nearfield: "dock-wall-tight",
    carriageway: "plain-two-lane",
  },
  {
    districtId: "pe-dart-v1",
    label: "Улица със закрит ъгъл преди пътеката (сценарий PE-02/PE-09)",
    approachM: 80,
    maxspeedKmh: 50,
    streetscape: "blind-corner-kiosk",
    roadscape: "residential-blind-corner",
    terminus: "necks-to-service",
    nearfield: "lockup-garages",
    carriageway: "bay-pocket-near",
  },
  {
    districtId: "pe-bus-v1",
    label: "Улица с товарен вход на складова база (сценарий PE-10)",
    approachM: 88,
    maxspeedKmh: 50,
    streetscape: "depot-gate",
    roadscape: "freight-collector",
    terminus: "bends-away-right",
    nearfield: "yard-wall-asym",
    carriageway: "bay-pocket-far",
  },
  {
    districtId: "pe-child-v1",
    label: "Междублоково пространство с редица гаражи (сценарий PE-04)",
    approachM: 78,
    maxspeedKmh: 40,
    streetscape: "courtyard-blocks",
    roadscape: "courtyard-street",
    terminus: "opens-to-green",
    nearfield: "garage-and-backslab",
    carriageway: "bay-pocket-behind-the-seat",
  },
  {
    districtId: "pe-cane-v1",
    label: "Еднопосочна улица пред институт за незрящи (сценарий PE-14)",
    approachM: 92,
    maxspeedKmh: 50,
    streetscape: "institute-and-transit",
    roadscape: "oneway-institute",
    terminus: "jogs-and-continues",
    nearfield: "villa-row-setback",
    carriageway: "bay-pocket-oneway",
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
  line("approach / street length", `${params.approachM} m / ${sc.params.approachM + 60} m`);
  line("limit", `${params.maxspeedKmh} km/h`);
  line(
    "carriageway",
    `${params.carriageway} — ${sc.spawnCurbToCurbM} m at the seat, ` +
      `${sc.carriagewaySegments.map((s) => `${s.fromY}–${s.toY}:${s.curbToCurbM}`).join(" | ")}` +
      `${
        sc.widthChangesAtM.length
          ? `, width changes at ${sc.widthChangesAtM.map((m) => `${m >= 0 ? "+" : ""}${m} m`).join(", ")} from the seat`
          : ", no width change"
      }`,
  );
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
