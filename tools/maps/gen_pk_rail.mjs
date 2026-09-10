/**
 * gen_pk_rail.mjs — pk-rail-v1, the RAIL-CROSSING ban map (doc 72 §11 archetype
 * PK-06 „спиране в забранена зона" + §12 RX-03 „опашка върху прелеза";
 * ЗДвП чл. 98). The gen_rail_crossing.mjs geometry (the authored track BAND, the
 * guarded А34 variant, the barrier timetable) fused with gen_ban_zones.mjs /
 * gen_pk_banx.mjs span authoring — the first district where the two data layers
 * share one street.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0, the
 * driver travels north — so edge arclength (the Locator's sM) EQUALS district y):
 *
 *     pkr-n-end (0, 400)
 *         │
 *         ·  legal shoulder bay          y = 330   (outside everything — the goal)
 *         │
 *         ▓  z-ban-after   чл. 98 т. 4   y = [206, 206.79]  (= last rail + 2)
 *         ═  z-railcrossing (А34, guarded) y = [200, 206]   ← the BAND
 *            · rails drawn at y = 201.21 and 204.79 (gauge 3.5875 about 203)
 *         ▓  z-ban-before  чл. 98 т. 4   y = [199.21, 200]  (= first rail − 2)
 *         ·  СТОП line / barrier arm     y = 195   (legal ground — see below)
 *         │
 *     pkr-spawn-start (4.06, 15)
 *         │
 *     pkr-n-start (0, 0)
 *
 * WHY THE BAND CARRIES NO BAN SPAN. Stopping ON the rails is not merely also
 * forbidden — it is the worst thing in this whole stretch, and the engine
 * already grades it: the railCrossing zone's rest-on-tracks arm bills
 * RAIL_CROSSING_VIOLATION (опасна) with detail "stopped-on-track", deliberately
 * WITHOUT the queue exemption every ban span has. Laying a noStopping span over
 * the band as well would double-bill ONE legal fault under TWO codes, and would
 * make the тежката грешка indistinguishable from the лека one beside it. So the
 * two data layers split the geography exactly on the band edge: the ban spans
 * own the remainder of the act's two metres, the rail zone owns the band and
 * every metre inside it. Together they cover the whole forbidden stretch, each
 * with the code it deserves. The spans ABUT the band (toM 200 / fromM 206) —
 * there is no legal metre anywhere between y = 199.21 and y = 206.79, and no
 * DOUBLE-billed one either: `runtime/worldRuntime.ts` refuses to arm a
 * noStopping span on any metre a railCrossing span already owns, so the split
 * survives the vehicle-body reach that the ban test uses (a car whose centre is
 * on the deck overhangs both layers and is billed by the rail zone alone).
 *
 * WHY THE CROSSING IS GUARDED (А34), AND WHY THE BARRIER NEVER COMES DOWN HERE.
 * Both are forced by the ban this map exists to teach:
 *  - GUARDED: an unguarded crossing (А35) carries чл. 51, ал. 3's MANDATORY
 *    full stop before the band, and чл. 51, ал. 4 puts that stop «не по-малко
 *    от 2 метра преди първата релса» — which is now the outer edge of
 *    z-ban-before TO THE MILLIMETRE, because that edge is derived from the same
 *    sentence. The duty and the offence share a line: a nose 2.01 m out obeys
 *    чл. 51, a nose 1.99 m out is the fault this map grades. (Under the old
 *    50 m span it was worse than sharp, it was contradictory: the commanded
 *    stop landed 48 m INSIDE the graded ban, so the law ordered the fault. The
 *    re-cut removes the contradiction; the map stays guarded anyway, because a
 *    drill must not ask a learner to hit a legal boundary to the centimetre.)
 *    Чл. 52 asks no stop of a guarded-open crossing, so the correct drive here
 *    really is one unbroken motion, and „спрях за малко пред прелеза" really is
 *    a choice rather than a duty.
 *  - BARRIER UP: the timetable is authored down [480, 540) of a 600 s cycle (a
 *    train every ten minutes, a minute of closure) — entirely outside the
 *    drillWindowSec the params assert, so every drive on this map lives in the
 *    open window. This is not tidiness: waiting at a lowered barrier inside a
 *    ban span is LAWFUL (чл. 93 — that is спиране for a traffic reason, not
 *    престой), and ILLEGAL_STOP_IN_BAN_ZONE has no armor that can see a barrier
 *    (its banZoneControl reads stop lines and signals only). A drill that put
 *    the barrier down over the span would convict a driver for obeying it. The
 *    missing capability — the rail phase joining the detector's innocent-context
 *    set in rules/engine.ts — is named, not taken (shared file).
 *
 * WHY NOTHING IS SIGNALIZED / ARTERIAL / CROSSED (the gen_pk_banx precondition,
 * verbatim): ILLEGAL_STOP_IN_BAN_ZONE is structurally innocent wherever a rest
 * is traffic-shaped (a queue lead, a stop line within the clear window, any
 * forbidding signal, an armed crossing zone). This map carries ZERO
 * intersections and ZERO crossings and its one edge is `residential`
 * (CLASS_RANK 2 < ARTERIAL_MIN_RANK 4), so buildStopLines emits NOTHING and
 * CrossingZoneTracker can never arm: a rest in a span is the authored fault and
 * nothing else.
 *
 * THE 50 m IS GONE, AND THE PROJECT ALREADY KNEW IT WAS A MYTH (2026-09-10).
 * banReachM was 50 — „on the crossing and less than 50 metres either side" —
 * and the header that shipped it called that the CONTENT BANK's number,
 * quoting a stale [REVIEW] note. That review has since been decided, in the
 * bank, AGAINST the number: content/questions/spirane-i-parkirane.json,
 * q-spirane-i-parkirane-056 now keys «Няма мярка в метри — забранено е там,
 * където пречиш на влака или трамвая» as CORRECT and «На самия прелез и на
 * по-малко от 50 метра от двете му страни» as `correct: false`, with its own
 * explanation recording «Одит 90, §4.3 — ИЗМИСЛЕНО ЧИСЛО, най-тежкият единичен
 * дефект в банката» and «„50 метра от двете страни" е разпространен мит от
 * стари помагала». So the theory bank was teaching that the 50 is a myth while
 * this map convicted students under it. That is the defect this parameter
 * change closes.
 *
 * WHAT THE ACT ACTUALLY GIVES — retrieved from content/law/acts/zdvp.json, and
 * a census of EVERY file in content/law/acts/ for a sentence carrying both a
 * rail word (релс|трамва|железопът|прелез) and «метр» returns exactly four:
 *  - чл. 39 «...при намалена видимост под 50 метра» — a U-TURN ban keyed to
 *    VISIBILITY, not to a crossing. This is almost certainly where the myth
 *    got its number, and it is not about престой at all.
 *  - чл. 51, ал. 4: «пред железопътния прелез пътните превозни средства спират
 *    на разстояние не по-малко от 2 метра преди първата релса, а когато има
 *    бариери - на 1 метър от тях»;
 *  - чл. 53, ал. 2: «...ако не е предварително убеден, че няма да се наложи
 *    спиране върху релсите или на разстояние по-малко от 2 метра от тях»;
 *  - чл. 54, ал. 1: «В случай на принудително спиране на превозното средство
 *    върху релсите или на разстояние, по-малко от 2 метра преди първата или
 *    след последната релса...» → evacuate the passengers, warn the train.
 * And the ban itself, чл. 98, ал. 1, т. 4: «върху трамвайни и железопътни линии
 * или в такава близост до тях, която може да затрудни движението на релсовите
 * превозни средства» — a FUNCTIONAL test with NO metre count in it.
 *
 * SO banReachM = 2, AND THAT NUMBER IS RETRIEVED RATHER THAN CHOSEN. The census
 * above returns TWO rail distances, not one, because чл. 51, ал. 4 carries both
 * of them in a single sentence — and the first cut of this repair quoted that
 * sentence in full here and then, thirteen lines down, called the second half
 * nonexistent («one rail distance … named three times»). Corrected 2026-09-10
 * (D1). The two are not interchangeable, and the difference is the SUBJECT:
 *
 *   ал. 4 places a WAITING vehicle — «пред железопътния прелез пътните превозни
 *   средства СПИРАТ на разстояние…»: 1 m in front of the arm where there are
 *   barriers, 2 m in front of the first rail where there are none, and either
 *   branch only «ако няма други указания, дадени с пътни знаци или с пътна
 *   маркировка» (this map authors no marking and no Б2, so ал. 4 applies whole).
 *
 *   чл. 53, ал. 2 and чл. 54, ал. 1 state the floor for a vehicle that is
 *   merely STANDING near the steel, and they state it in barrier-INDEPENDENT
 *   terms — «на разстояние по-малко от 2 метра от тях», «по-малко от 2 метра
 *   преди първата или след последната релса», under ал. 1 of чл. 53's
 *   «независимо от състоянието на бариерите». Чл. 54 names BOTH sides, which is
 *   why the two spans stay symmetric.
 *
 * THE SPAN IMPLEMENTS THE SECOND, so `guarded: true` does not move it. Three
 * reasons, in the order they bind. (1) The span convicts престой under чл. 98,
 * ал. 1, т. 4, and ал. 4 does not create or lift a no-stopping zone — it tells a
 * driver where to stand while WAITING, which is not what this map bills. (2) The
 * floor for a standing car is written without reference to barriers, and a
 * raised arm does not make 1.19 m from the first rail safe. (3) Geometry, on the
 * shipped instance: the arm stands at y = 197 (zoneSigns' barrier station,
 * `zone.fromM − RAIL_BARRIER_AHEAD_M` = 200 − 3, pinned by
 * pk-rail-crossing-drawn.test.ts) and the first rail at 201.20625, so «на 1
 * метър от тях» puts a waiting car at 196 — 5.20625 m short of the steel,
 * 3.20625 m FURTHER OUT than the 2 m line at 199.20625. The governing branch is
 * therefore the stricter one HERE, and obeying it clears the чл. 98 span
 * entirely; re-anchoring the span to it would convict 3.2 m of legal approach,
 * which is the 50 m myth in miniature. On the far side there is no barrier
 * coordinate at all — one arm, one approach — while чл. 54, ал. 1 measures both
 * sides. Beyond those two metres чл. 98, ал. 1, т. 4 states a consequence, not a
 * distance, and this engine has no measurement that establishes it (there is no
 * train entity to be hindered here, only a barrier timetable). A span that
 * convicted at 50 m — or at 20, or at 6 — would be the engine asserting a fact
 * it cannot observe under a citation that does not contain it. ADR-002, in the
 * direction that costs the student.
 *
 * THE ANCHOR IS THE FIRST RAIL, NOT THE BAND EDGE — CORRECTED 2026-09-10 (F1).
 * The first cut of this re-cut measured the act's 2 m from the band edge, on
 * the reasoning that the grading model has no rail objects and `railCrossing`
 * [fromM, toM] IS „the rails" for every arm that reads it. That reasoning is
 * true about the GRADER and false about the WORLD, and the student reads the
 * world: builders/railTrack.ts draws the two rails at a 3.5875 m gauge about
 * the band centre, i.e. 1.20625 m inside each edge, so a span starting at the
 * band edge starts 3.21 m from the steel while the card it prints quotes «не
 * по-малко от 2 метра преди първата релса». Card and world disagreeing about a
 * number is the exact defect class this whole change exists to remove, so the
 * second cut moved the anchor to the rail the renderer actually draws:
 *
 *     banBeforeFromM = ceil2((band.fromM + band.toM) / 2 − RAIL_GAUGE_M / 2 − 2)
 *
 * DERIVED, NOT TYPED. RAIL_GAUGE_M is mirrored from railTrack.ts at the top of
 * this file and pinned to the BUILT MESH by pk-rail-crossing-drawn.test.ts, so
 * changing the drawing constant fails a test rather than silently sliding a
 * legal boundary. And the 2 m in that expression is `banReachM`, whose bound is
 * LAW_RAIL_CLEAR_M — the number the act writes three times.
 *
 * THE BAND STILL OWNS ITS OWN METRES. The ban span stops AT the band edge
 * instead of running on to the rail, because [200, 206] is already convicted,
 * more heavily and with no queue exemption, by the rail zone. So the two
 * metres before the first rail are convicted end to end and split between the
 * layers: [199.21, 200] чл. 98, ал. 1, т. 4 → основна, [200, 201.21] the rail
 * zone → опасна. Not one metre carries both (see WHY THE BAND CARRIES NO BAN
 * SPAN, and the runtime's rail-band suppression that makes it hold under the
 * body test).
 *
 * AND THE MEASUREMENT IS THE CAR, WHICH IS WHY THE SPAN CAN BE 0.79 m LONG AND
 * STILL MEAN „2 metres". `worldRuntime.ts` tests a noStopping span against the
 * vehicle's own reach along the edge, not against a point inside it, so the ban
 * arms exactly when the car's nearest part is within banReachM of the rail —
 * which is how «спират на разстояние не по-малко от 2 метра преди първата
 * релса» is measured in the first place. A car nose 1.99 m from the steel
 * convicts wherever its centre happens to be.
 *
 * WHAT THE MAP THEREFORE NO LONGER CLAIMS: that a car resting 25 or 40 m short
 * of a crossing is committing an offence. It is not, on any article in the
 * corpus. It may still be an offence under чл. 98, ал. 1, т. 1 (створяване на
 * опасност / пречка — e.g. the queue it pushes onto the rails), but that is a
 * different точка with a different test and NOTHING here measures it; inventing
 * a radius for it is how the 50 was born. The scenario copy teaches the
 * functional rule instead — see templates-parking2.ts SC_PK_RAIL_BAN.
 *
 * KNOWN RENDER GAP, corrected 2026-09-10 while re-cutting the spans: the first
 * half of the old note here („no А34 / Андреевски-кръст / barrier-arm asset
 * exists ... renders no track, posts or arm") is FALSE and its own battery says
 * so — builders/railTrack.ts emits 17 deck+rail quads on this band and
 * zoneSigns places railGuarded + railCross + barrier (world/__tests__/
 * pk-rail-crossing-drawn.test.ts, pk-rail-districts.test.ts). The half that is
 * still true: builders/zoneSigns.ts posts a В27 face at the start of every
 * `noStopping` span, so the two law-implied spans here get two plates that do
 * not exist in reality (render-only — grading reads the spans, never the posts).
 * The re-cut MOVES them from y = 150 / 206 to y = 199.21 / 206, which makes the
 * fiction smaller rather than larger: a plate standing where the ban really is
 * beats a plate drawing the 50 m myth on a post. It lands 2.21 m past the
 * barrier arm — clear of ZONE_POST_MIN_APART_M, so zoneSigns' nudge never
 * fires and the post keeps its coordinate. A plate BETWEEN the arm and the deck
 * is an odder place for a post than the 192 the nudge used to produce, and a
 * truer one for this ban; the drawn-crossing battery measures where it lands
 * and says so.
 * The fix is still a `posted?: boolean` on DistrictZone (default true ⇒ every
 * shipped map byte-identical); not taken here — shared file.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pk_rail.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** The СТОП cross / barrier arm sits this far before the band (gen_rail_crossing). */
const STOP_LINE_CLEAR_M = 5;
/** runtime/worldRuntime.ts RAIL_APPROACH_M — the phase window before the band. */
const RAIL_APPROACH_M = 30;
/**
 * The BARRIER-INDEPENDENT floor ЗДвП gives for a STANDING vehicle near rails, m
 * — retrieved, not chosen (the header carries all four quotes in full). Чл. 53,
 * ал. 2 «на разстояние по-малко от 2 метра от тях» and чл. 54, ал. 1 «по-малко
 * от 2 метра преди първата или след последната релса» name it on both sides and
 * without reference to barriers (чл. 53, ал. 1: «независимо от състоянието на
 * бариерите»). Чл. 51, ал. 4 writes the same 2 m for the WAITING position, and
 * in the same sentence a second distance for that position — «а когато има
 * бариери - на 1 метър от тях» — which is NOT this constant: it measures from
 * an arm on one approach, answers where to wait rather than where престой is
 * banned, and on this map falls 3.20625 m outside the span (see the header).
 * Чл. 98, ал. 1, т. 4 — the ban itself — contains no metre at all.
 */
const LAW_RAIL_CLEAR_M = 2;
/**
 * WHERE THE RAILS ACTUALLY ARE — mirrored from the RENDERER so the legal
 * boundary below is derived from the drawing rather than guessed beside it.
 * `sim/contracts.ts PERCEPTUAL_ROAD_SCALE` = 2.5 (the caricature the whole
 * world is drawn at) and `world/builders/railTrack.ts RAIL_GAUGE_M` =
 * 1.435 × that, laid as ±GAUGE/2 about the band CENTRE (`railTrack.ts`:
 * `const mid = (from + to) / 2`). A .mjs generator cannot import the TS
 * module, so the mirror is pinned instead: `world/builders/__tests__/
 * pk-rail-crossing-drawn.test.ts` measures the FIRST RAIL out of the built
 * mesh and fails if this file's spans stop being exactly LAW_RAIL_CLEAR_M
 * from it. Change the gauge and that test fails until the map is re-run.
 *
 * RAIL_HEAD_WIDTH_M (0.3) is deliberately NOT part of this: its own docblock
 * says a real ~7 cm head „reads like thread at this scale" and was widened for
 * legibility, so it is a drawing decision, and a drawing decision must not move
 * a legal boundary by 15 cm. The rail's POSITION is the gauge line.
 */
const PERCEPTUAL_ROAD_SCALE = 2.5;
const RAIL_GAUGE_M = 1.435 * PERCEPTUAL_ROAD_SCALE; // 3.5875 m, centre to centre
/** runtime/zones.ts ZONE_EXIT_RADIUS_M — the widest armor radius on this map's
 *  furniture (there is none, but the bay margin is checked against it anyway). */
const CROSSING_EXIT_R_M = 38;

const r2 = (v) => Math.round(v * 100) / 100;
/** The two legal boundaries are stored to the centimetre like every other
 *  coordinate in the file, and they round INWARD — toward the band, never away
 *  — so the convicted strip can only ever be a few millimetres SHORTER than the
 *  2 m the act names. Convicting ground no article gives is the defect this
 *  whole re-cut exists to remove; a 4 mm shortfall in the student's favour is
 *  not that defect. */
const ceil2 = (v) => Math.ceil(v * 100) / 100;
const floor2 = (v) => Math.floor(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** signRef ↔ kind pairing law (self-validation), the two generators merged:
 *  А34 posts the guarded crossing (Наредба № 18 warning signs); the чл. 98 spans
 *  are LAW-implied and carry the statute as their ref, never a plate. */
const SIGN_GUARDED = "А34";
const SIGN_UNGUARDED = "А35";
const BAN_LAW_REF = "ЗДвП-98";

/**
 * @param {{
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/zone/spawn id prefix
 *   lengthM: number,        // street length (200..1000)
 *   maxspeedKmh: number,    // legal limit (30..90)
 *   band: { fromM: number, toM: number },  // the track band (rails ± clearance)
 *   banReachM: number,      // чл. 98, ал. 1, т. 4 reach, measured from the
 *                          // FIRST / LAST RAIL rather than from the band edge
 *                          // (header §THE ANCHOR); (0, LAW_RAIL_CLEAR_M]
 *   legalBayY: number,      // the ONE legal stopping mark, district y
 *   barrier: { cycleSec: number, downFromSec: number, downToSec: number },
 *   drillWindowSec: number, // every drive must fit in the OPEN window
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildRailBanStreet(params) {
  const errors = [];
  const {
    districtId,
    label,
    idPrefix,
    lengthM,
    maxspeedKmh,
    band,
    banReachM,
    legalBayY,
    barrier,
    drillWindowSec,
    noteBg,
  } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!band || !(band.fromM > 0 && band.fromM < band.toM)) {
    errors.push(`band must satisfy 0 < fromM < toM, got [${band?.fromM}, ${band?.toM}]`);
  }
  if (band && band.toM - band.fromM > 12) {
    errors.push(`band [${band.fromM}, ${band.toM}] wider than 12 m — a level crossing is a BAND, not a district`);
  }
  // NOT A FREE KNOB. Anything past LAW_RAIL_CLEAR_M has no clause behind it —
  // the „50 метра от двете страни" this map used to ship is a myth the content
  // bank itself now fails (q-spirane-i-parkirane-056). A caller who needs a
  // wider ban needs a retrieved article first, and then this bound.
  if (!(banReachM > 0 && banReachM <= LAW_RAIL_CLEAR_M)) {
    errors.push(
      `banReachM must be within (0, ${LAW_RAIL_CLEAR_M}] m, got ${banReachM}: ЗДвП gives no престой ` +
        `distance for a crossing beyond the 2 m floor of чл. 53, ал. 2 / чл. 54, ал. 1 (чл. 51, ал. 4 ` +
        `writes 2 m and, at barriers, 1 m — but for the WAITING position, not for the ban) — ` +
        `see the header's retrieval`,
    );
  }
  // The street must be long enough that the whole rail PHASE window (30 m) fits
  // on it before the band — the driver has to MEET the crossing while there is
  // still road to react on.
  if (band && !(band.fromM - RAIL_APPROACH_M >= 60)) {
    errors.push(`the rail approach window must open >= 60 m into the street, opens at ${band?.fromM - RAIL_APPROACH_M}`);
  }
  // INVERTED 2026-09-10, with the 50 m. The old assertion here demanded
  // banReachM >= RAIL_APPROACH_M so that „the rail approach window would [not]
  // open on legal road" — i.e. it required the ban to be at least 30 m, which is
  // a distance no article gives. The road before a crossing IS legal road; that
  // is the whole finding. What must hold instead is the containment: the ban
  // strip lies wholly inside the phase window, so the reducer is already calling
  // this a crossing approach on every metre the ban convicts.
  if (band && !(banReachM <= RAIL_APPROACH_M)) {
    errors.push(`banReachM ${banReachM} > RAIL_APPROACH_M ${RAIL_APPROACH_M}: the ban would reach outside the rail phase`);
  }
  if (!barrier || !(barrier.cycleSec > 0) ||
      !(barrier.downFromSec >= 0 && barrier.downFromSec < barrier.downToSec && barrier.downToSec <= barrier.cycleSec)) {
    errors.push(`guarded crossing requires a valid barrier timetable (0 <= downFromSec < downToSec <= cycleSec), got ${JSON.stringify(barrier)}`);
  }
  // THE header's second law, as an assertion: the barrier may not fall while any
  // drive is running, or the drill would convict a driver for obeying it.
  if (!(drillWindowSec > 0)) errors.push(`drillWindowSec must be > 0, got ${drillWindowSec}`);
  if (barrier && drillWindowSec > 0 && !(barrier.downFromSec >= drillWindowSec)) {
    errors.push(
      `the barrier falls at ${barrier?.downFromSec} s, inside the ${drillWindowSec} s drill window — ` +
        `a lawful barrier wait inside a ban span would grade ILLEGAL_STOP_IN_BAN_ZONE (see the header)`,
    );
  }
  if (band && !(legalBayY > band.toM + banReachM && legalBayY <= lengthM - 40)) {
    errors.push(`legalBayY must sit past the far ban span and <= ${lengthM - 40}, got ${legalBayY}`);
  }
  if (errors.length > 0) throw new Error(`gen_pk_rail params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): 1+1 street — the northbound lane center
  // sits half a drawn lane east of the axis.
  const lanes = 2;
  const lanesPerDir = lanes / 2;
  const laneRightM = r2((lanesPerDir - 0.5) * SCALED_LANE_W); // 4.06
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125

  /** The СТОП cross / barrier arm — the anchor the templates and trace scripts
   *  pin (gen_rail_crossing's meta.scenario.railCrossing.stopLineY). It sits on
   *  LEGAL ground, outside z-ban-before: see the header's barrier note. */
  const stopLineY = r2(band.fromM - STOP_LINE_CLEAR_M);

  // -- THE LEGAL BOUNDARY, DERIVED FROM THE RAILS (see the header §THE ANCHOR).
  // The renderer lays the two rails at the band centre ∓ RAIL_GAUGE_M / 2, so
  // the article's referent — «първата релса» / «последната релса» — is a
  // computable coordinate, and `banReachM` is measured FROM IT rather than from
  // the band edge. On the shipped instance that is 203 ∓ 1.79375 = 201.20625 /
  // 204.79375, and the spans therefore start at 199.21 and end at 206.79.
  const bandMidM = (band.fromM + band.toM) / 2;
  const firstRailM = bandMidM - RAIL_GAUGE_M / 2;
  const lastRailM = bandMidM + RAIL_GAUGE_M / 2;
  const banBeforeFromM = ceil2(firstRailM - banReachM);
  const banAfterToM = floor2(lastRailM + banReachM);
  // The band already convicts its own metres under the HEAVIER rail code, so
  // each span runs from the act's line to the band edge and stops there — the
  // two layers abut, and the metres between the band edge and the rail are
  // billed once, by the rail zone. A reach that does not clear the inset would
  // author an empty or inverted span instead.
  const railInsetM = r2((band.toM - band.fromM) / 2 - RAIL_GAUGE_M / 2);
  if (!(banBeforeFromM < band.fromM && banAfterToM > band.toM)) {
    throw new Error(
      `gen_pk_rail: banReachM ${banReachM} does not clear the band-edge-to-rail inset ` +
        `${railInsetM} m (gauge ${r2(RAIL_GAUGE_M)} in a ${band.toM - band.fromM} m band), so the ` +
        `чл. 98 spans would be empty: [${banBeforeFromM}, ${band.fromM}] / [${band.toM}, ${banAfterToM}]`,
    );
  }

  const edgeId = `${idPrefix}-e-street`;
  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-end`]: [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: edgeId,
      from: `${idPrefix}-n-start`,
      to: `${idPrefix}-n-end`,
      // CLASS_RANK 2 — below ARTERIAL_MIN_RANK: no stop lines, no FP armor.
      class: "residential",
      name: label,
      oneway: false,
      roundabout: false,
      lanes,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      // FR-21 (traffic/TrafficLayer.ts `parkingOptedOut`; the ledger is
      // traffic/__tests__/parked-on-footway.test.ts). DECLARED WITH THE SPAN
      // RE-CUT, and forced by it. `computeParkedCars` suppresses the curb row
      // inside a noStopping span, so the 50 m myth was also holding 96 m of
      // kerb empty; the moment the span shrank to the act's 2 m, twelve more
      // bodies appeared — and on a `residential` edge EVERY one of them stands
      // fully on the footway, because residential is in the pass's PARK_CLASSES
      // and not in the world's PARKING_LANE_CLASSES. That is 45 cars parked on
      // the pavement on the ONE lesson whose whole subject is where a car may
      // lawfully stand. `true` is not available here: it moves the kerb out 4 m,
      // which puts the frontage (|x| = 14.13) inside the widened pavement (back
      // edge 15.98) and widens the rail deck railTrack.ts draws across the
      // carriageway — churn in the object this map exists to show. So the
      // street declares it carries no kerbside parking, which is the honest
      // reading of a 400 m drill street with two blocks on it, and the ledger
      // row for pk-rail-v1 is deleted rather than raised.
      parkingBand: false,
      length: polylineLength(geometry),
      geometry,
    },
  ];

  // The FP-armor precondition, as data: nothing here can make a rest look
  // traffic-shaped (see the header).
  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // -- The two data layers, abutting on the rail edge (see the header).
  const ZONES = [
    {
      // чл. 98, ал. 1, т. 4 — the part of the act's two metres before the FIRST
      // RAIL that lies outside the band; the band's own metres belong to the
      // rail zone (header §THE ANCHOR IS THE FIRST RAIL).
      // CLAUSE NAMED 2026-09-09 (BAN-BASIS slice): the ref was a bare «чл. 98».
      // The retrieved т. 4 is «върху трамвайни и железопътни линии или в такава
      // близост до тях, която може да затрудни движението на релсовите превозни
      // средства» (content/law/acts/zdvp.json, чл. 98) — a functional test with
      // no metre in it. RE-CUT 2026-09-10 from 50 m to the 2 m the act names in
      // чл. 51, ал. 4 / чл. 53, ал. 2 / чл. 54, ал. 1 (header).
      id: `${idPrefix}-z-ban-before`,
      kind: "noStopping",
      basis: "law-rail",
      edgeId,
      fromM: banBeforeFromM,
      toM: r2(band.fromM),
      signRef: BAN_LAW_REF,
    },
    {
      // The track band itself — RX-03's ground, and the ONLY span here that is
      // not a чл. 98 span (its rest arm is опасна, not основна).
      id: `${idPrefix}-z-railcrossing`,
      kind: "railCrossing",
      edgeId,
      fromM: r2(band.fromM),
      toM: r2(band.toM),
      signRef: SIGN_GUARDED,
      guarded: true,
      barrier: {
        cycleSec: barrier.cycleSec,
        downFromSec: barrier.downFromSec,
        downToSec: barrier.downToSec,
      },
    },
    {
      // чл. 98, ал. 1, т. 4 — the mirror strip: from the band edge out to two
      // metres past the LAST RAIL.
      // Symmetric because the act is: чл. 54, ал. 1 says «преди първата ИЛИ
      // след последната релса» in one breath.
      id: `${idPrefix}-z-ban-after`,
      kind: "noStopping",
      basis: "law-rail",
      edgeId,
      fromM: r2(band.toM),
      toM: banAfterToM,
      signRef: BAN_LAW_REF,
    },
  ];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — преди зоната на прелеза",
    },
    {
      id: `${idPrefix}-spawn-bay`,
      x: laneRightM,
      y: r2(legalBayY),
      heading: 0,
      edgeId,
      name: "Разрешено място за престой — след зоната на прелеза",
    },
  ];

  // Visual anchors west of the street, clear of carriageway + sidewalk: one
  // where the DECISION is made and one at the legal bay (so the goal READS as a
  // place, not as a coordinate). The decision anchor used to hang off the ban's
  // start, which was fine while the ban was 50 m long and is meaningless now
  // that it is 2 m: with the myth removed, the moment the driver has to think is
  // the moment the crossing announces itself, i.e. the rail approach window.
  const CLEAR = halfRoadM + 6;
  const approachOpensM = r2(band.fromM - RAIL_APPROACH_M);
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block-approach`,
      height: 6,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 20), r2(approachOpensM - 24)],
        [r2(-CLEAR), r2(approachOpensM - 24)],
        [r2(-CLEAR), r2(approachOpensM - 6)],
        [r2(-CLEAR - 20), r2(approachOpensM - 6)],
      ],
    },
    {
      id: `${idPrefix}-b-block-bay`,
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-CLEAR - 22), r2(legalBayY - 14)],
        [r2(-CLEAR), r2(legalBayY - 14)],
        [r2(-CLEAR), r2(legalBayY + 14)],
        [r2(-CLEAR - 22), r2(legalBayY + 14)],
      ],
    },
  ];

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
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
  bounds.minX = r2(Math.min(bounds.minX, -halfRoadM - 6));
  bounds.maxX = r2(Math.max(bounds.maxX, halfRoadM + 6));
  bounds.minY = r2(Math.min(bounds.minY, -6));
  bounds.maxY = r2(Math.max(bounds.maxY, lengthM + 6));

  const scenario = {
    archetype: "straight-street",
    params: {
      lengthM,
      maxspeedKmh,
      bandFromM: r2(band.fromM),
      bandToM: r2(band.toM),
      banReachM,
      legalBayY: r2(legalBayY),
      banKind: "noStopping",
      banBasis: "law", // чл. 98, ал. 1, т. 4 — no plate posts these spans
      guarded: "guarded",
    },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    legalBayY: r2(legalBayY),
    railCrossing: {
      id: ZONES[1].id,
      signRef: SIGN_GUARDED,
      fromM: r2(band.fromM),
      toM: r2(band.toM),
      /** WHERE THE STEEL IS — the band centre ∓ RAIL_GAUGE_M / 2, i.e. the two
       *  rails builders/railTrack.ts actually draws, published as data so no
       *  reader of this map has to recompute the чл. 51, ал. 4 boundary in his
       *  head. The ban spans are derived from these (header §THE ANCHOR). */
      firstRailM: r2(firstRailM),
      lastRailM: r2(lastRailM),
      guarded: true,
      stopLineY,
      barrier: { ...ZONES[1].barrier },
      drillWindowSec,
    },
    /** District-y (not edge-arclength — identical here, but the pk-banx
     *  convention) view of every чл. 98 span: what the ScenarioSpec and the
     *  trace scripts are written against. The BAND is deliberately absent — it
     *  is not a ban span (see the header). */
    banZonesY: [
      { id: ZONES[0].id, lawRef: "ЗДвП чл. 98, ал. 1, т. 4", fromY: banBeforeFromM, toY: r2(band.fromM) },
      { id: ZONES[2].id, lawRef: "ЗДвП чл. 98, ал. 1, т. 4", fromY: r2(band.toM), toY: banAfterToM },
    ],
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pk_rail.mjs",
      // ZONE schema marker (ADR-006 stage 2a version contract; kind growth keeps
      // 1 — the 2b/3a precedent): this file carries the optional `zones`.
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с жп прелез и забранена за престой зона — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: noteBg,
      },
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
      scenario,
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
    zones: ZONES,
  };

  // -------------------------------------------------------------------------
  // Self-validation — the gen_ban_zones + gen_rail_crossing invariants, plus
  // the two laws that only exist because this map fuses them.
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const edgeById = new Map(EDGES.map((e) => [e.id, e]));
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.lanes !== lanes || e.oneway) post.push(`${e.id}: two-way 1+1 street expected`);
    // The no-stop-line law (gen_pk_banx): an arterial rank here would post a
    // stop line and silently acquit every graded rest.
    if (e.class !== "residential") post.push(`${e.id}: every edge must stay residential (no stop lines)`);
  }
  // The FP-armor precondition, asserted rather than assumed.
  if (INTERSECTIONS.length !== 0) post.push("no intersection may exist (it would feed buildStopLines)");
  if (CROSSINGS.length !== 0) post.push("no crossing may exist (it would arm CrossingZoneTracker within ~35 m)");

  const railZones = ZONES.filter((z) => z.kind === "railCrossing");
  const banZones = ZONES.filter((z) => z.kind === "noStopping");
  if (railZones.length !== 1) post.push(`exactly ONE rail band expected, got ${railZones.length}`);
  if (banZones.length !== 2) post.push(`exactly TWO чл. 98 spans expected (both sides), got ${banZones.length}`);
  for (const z of ZONES) {
    const host = edgeById.get(z.edgeId);
    if (!host) {
      post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
      continue;
    }
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= host.length)) {
      post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${host.length} of ${z.edgeId}`);
    }
  }
  if (new Set(ZONES.map((z) => z.id)).size !== ZONES.length) post.push("zone ids must be unique");

  const rail = railZones[0];
  if (rail) {
    if (rail.signRef !== SIGN_GUARDED) post.push(`${rail.id}: a guarded crossing posts ${SIGN_GUARDED}, not ${rail.signRef}`);
    if (rail.signRef === SIGN_UNGUARDED) post.push(`${rail.id}: А35 would impose a чл. 51, ал. 3 stop duty on the ban span's own edge`);
    if (rail.guarded !== true) post.push(`${rail.id}: this map's crossing must be guarded (see the header)`);
    const b = rail.barrier;
    if (!b || !(b.cycleSec > 0 && b.downFromSec >= 0 && b.downFromSec < b.downToSec && b.downToSec <= b.cycleSec)) {
      post.push(`${rail.id}: guarded span carries an invalid barrier timetable`);
    } else if (!(b.downFromSec >= drillWindowSec)) {
      post.push(`${rail.id}: the barrier falls inside the drill window — see the header`);
    }
    // THE law of this district: the ban spans must not overlap the band's
    // INTERIOR, or the rest-on-rails demo would bill two codes for one fault.
    for (const z of banZones) {
      if (z.fromM < rail.toM && z.toM > rail.fromM) {
        post.push(`${z.id}: чл. 98 span [${z.fromM}, ${z.toM}] overlaps the band [${rail.fromM}, ${rail.toM}]`);
      }
    }
    // …and they must ABUT it: a legal metre beside the band would be a lie, and
    // an overlapping one would bill two codes for one act.
    const before = banZones.find((z) => z.toM <= rail.fromM);
    const after = banZones.find((z) => z.fromM >= rail.toM);
    if (!before || before.toM !== rail.fromM) post.push("the approach ban must end exactly at the band's near edge");
    if (!after || after.fromM !== rail.toM) post.push("the run-out ban must start exactly at the band's far edge");
    // THE CITATION, AS AN ASSERTION (F1). The card the student reads quotes «не
    // по-малко от 2 метра преди първата релса», so the convicted ground has to
    // begin there and not at the band edge 1.2 m further out. Measured against
    // the rails the RENDERER draws (mid ∓ RAIL_GAUGE_M / 2), to the centimetre
    // the file stores — and only ever short of the article, never past it.
    if (before) {
      const gap = r2(firstRailM - before.fromM);
      if (!(gap <= banReachM && gap > banReachM - 0.02)) {
        post.push(`${before.id}: starts ${gap} m before the first rail (${r2(firstRailM)}), not ${banReachM}`);
      }
    }
    if (after) {
      const gap = r2(after.toM - lastRailM);
      if (!(gap <= banReachM && gap > banReachM - 0.02)) {
        post.push(`${after.id}: ends ${gap} m past the last rail (${r2(lastRailM)}), not ${banReachM}`);
      }
    }
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  if (!(stopLineY > 0 && stopLineY < band.fromM)) post.push(`stop line ${stopLineY} must sit before the band start ${band.fromM}`);

  for (const s of SPAWN_POINTS) {
    if (!edgeById.has(s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  // A drill may not start or finish anywhere forbidden — the shadow's rest is
  // the whole objective, so it has to be provably lawful ground.
  const inAnyZone = (y) => ZONES.some((z) => y >= z.fromM && y <= z.toM);
  for (const s of SPAWN_POINTS) {
    if (inAnyZone(s.y)) post.push(`${s.id} (y=${s.y}) sits inside an authored span — it must be legal ground`);
  }
  if (!(legalBayY - banAfterToM > CROSSING_EXIT_R_M)) {
    post.push(`the legal bay must sit > ${CROSSING_EXIT_R_M} m past the ban, got ${r2(legalBayY - banAfterToM)} m`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`lane center ${laneRightM} outside the northbound bank`);
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM && y >= 0 && y <= lengthM) post.push(`${bl.id}: footprint on the carriageway`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pk_rail self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pk-rail-v1",
    label: "Учебна улица — престой около жп прелез (сценарий PK-06 / RX-03)",
    idPrefix: "pkr",
    lengthM: 400,
    maxspeedKmh: 50,
    band: { fromM: 200, toM: 206 },
    // RETRIEVED, not chosen — ЗДвП чл. 51, ал. 4 / чл. 53, ал. 2 / чл. 54, ал. 1.
    // Was 50 („на по-малко от 50 метра от двете му страни"), which the content
    // bank's own q-spirane-i-parkirane-056 keys as the WRONG answer and calls
    // «ИЗМИСЛЕНО ЧИСЛО ... разпространен мит от стари помагала». See the header.
    banReachM: LAW_RAIL_CLEAR_M,
    legalBayY: 330,
    // A train every ten minutes, a minute of closure — and it falls at t = 480,
    // long after the last drive has parked (drillWindowSec 180). See the header.
    barrier: { cycleSec: 600, downFromSec: 480, downToSec: 540 },
    drillWindowSec: 180,
    noteBg:
      "Забраната тук не е поставена със знак — тя следва от закона: чл. 98, ал. 1, т. 4 забранява престоя и паркирането върху релсите и толкова близо до тях, че да пречиш на влака или трамвая. Самата забрана няма мярка в метри. Метри ЗДвП дава по друг въпрос — къде спира ЧАКАЩАТА кола пред прелеза: „не по-малко от 2 метра преди първата релса, а когато има бариери – на 1 метър от тях“ (чл. 51, ал. 4). Прелезът тук е охраняем, тъй че за чакащия важи метърът пред бариерата — а тя стои на 197 м, повече от четири метра пред първата релса, тоест още по-назад от двата метра. Спрялата кола обаче има под, който не зависи от бариерите: два метра преди първата или след последната релса (чл. 53, ал. 2; чл. 54, ал. 1). Точно него мерят двете зони тук. „50 метра от двете страни“ е мит от стари помагала. Върху самите релси спирането е най-тежкото от всичко: прелезът трябва да е чист и за колоната, и за влака.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildRailBanStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== rail-ban build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("track band", `[${district.meta.scenario.railCrossing.fromM}, ${district.meta.scenario.railCrossing.toM}] m (${district.meta.scenario.railCrossing.signRef}, guarded)`);
  line("rails (drawn)", `y = ${district.meta.scenario.railCrossing.firstRailM} / ${district.meta.scenario.railCrossing.lastRailM} — gauge ${r2(RAIL_GAUGE_M)} m about the band centre`);
  line("stop line", `y = ${district.meta.scenario.railCrossing.stopLineY}`);
  line("barrier", `down [${params.barrier.downFromSec}, ${params.barrier.downToSec}) of ${params.barrier.cycleSec} s — UP for the whole ${params.drillWindowSec} s drill`);
  for (const z of district.meta.scenario.banZonesY) {
    line(z.id, `y ∈ [${z.fromY}, ${z.toY}]  (${z.lawRef})`);
  }
  line("legal bay", `y = ${district.meta.scenario.legalBayY}`);
  line("zonesVersion", district.meta.zonesVersion);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
