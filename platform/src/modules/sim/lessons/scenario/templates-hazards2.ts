/**
 * Scenario templates — the HAZARDS family, wave-3 file: the EMERGENCY-STOP
 * drill (doc 72 PE-04 „Дете между паркирани коли / Child occluded by parked
 * cars (unmarked)" — the mid-block dart the taxonomy marks 🟡 PARTIAL with the
 * exact note this template implements: „occluded pedestrian spawn (pedestrian
 * actor path starting BEHIND a parked-vehicle prop, NO CROSSING ID)").
 * DATA ONLY (the templates.ts law): every coordinate is denormalized from the
 * committed hz-obstacle-v1.json (tools/maps/gen_hazard_obstacle.mjs) so nothing
 * loads world JSON at runtime; the hz-obstacle battery asserts the pinned values
 * against the generated map and the sc-hz-emergency-stop trace gate replays the
 * drives through the production stack.
 *
 *  - sc-hz-emergency-stop      „Екстрено спиране"                  (PE-04)
 *  - sc-hz-brake-dont-swerve  „Спри в лентата, не свивай на сляпо" (OV-18)
 *
 * The two are ONE lesson split along its natural seam, and they are deliberately
 * NOT on the same map. The first teaches the PEDAL against an empty road (the
 * wheel is wrong because straight is shorter). The second — added in wave 6 on
 * its own district hz-debris-v1 (a 2-lane ONE-WAY street) — teaches the WHEEL:
 * there the swerve is not clumsy steering but престрояване into an OCCUPIED
 * lane, graded by the shipped lane-change adjudication, which a two-way 1+1 map
 * structurally cannot host. Its section below carries the full argument.
 *
 * WHY hz-obstacle-v1 (the map is the lesson, and its EMPTINESS is the point):
 * this drill grades ONE thing — the full-force stop for a hazard that appears
 * mid-block, away from any crossing. hz-obstacle-v1 is a bare 240 m two-way
 * street: `crossings: []`, `intersections: []`, no signals, no zones (the
 * district battery pins all four). That means NO PEDESTRIAN_* code can fire here
 * (the CrossingZoneTracker builds its zones from district `crossings[]` alone —
 * the sc-sig-flash-amber-ped finding), so the drill cannot quietly become a
 * zebra lesson: the ONLY gradable channels are the driver's own braking, lane
 * position and contact. A zebra dart is already three shipped templates
 * (sc-crossing-dart, sc-crossing-child-ball, sc-pe-jaywalker); THIS one is the
 * чл. 20 stop where nobody has right of way and the pedal is the whole answer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE `ruleConfig` — WHY THIS DRILL DISARMS HARSH_BRAKING_NO_CAUSE (read this
 * before touching the field; it is NOT a convenience, it is a correctness fix)
 * ═══════════════════════════════════════════════════════════════════════════
 * The causeless-harsh-brake detector (SP-11/VP-09) fires on emergency-grade
 * decel when EVERY plausible cause is positively absent. Its cause ledger
 * (rules/engine.ts) is CROSSING-SHAPED: `crossingZoneEntered`, `crossingPassed`,
 * `prioritySituation`, `collision` — plus a lead VEHICLE within 45 m, a stop
 * line, or a junction. On this district NONE of them can ever exist:
 *   - no district crossings  ⇒ no crossingZoneEntered/crossingPassed, s.crossing
 *     stays null;
 *   - no intersections       ⇒ nextJunctionM / nextStopLineM undefined;
 *   - the staged dart is a PEDESTRIAN, and `leadGapMeters` reads the VEHICLE
 *     list only (traffic/system.ts) ⇒ leadGapM stays null.
 * So `noBrakeCause` is TRUE for the whole drill, by construction. Meanwhile the
 * live student's car stops at BRAKE_FORCE_N / CHASSIS_MASS = 11000 / 1220 ≈
 * 9.0 m/s² at a full pedal — comfortably over `harshBrakeDecelMps2` = 7.
 * Without this override the lesson would order the student to brake ДОКРАЙ and
 * then bill him 10 points (основна) for obeying — the taught behaviour graded as
 * „рязко спиране без причина", with a child on the bonnet as the cause the
 * engine cannot see. Raising the threshold to 25 m/s² (≈ 2.5 g — beyond anything
 * the car can produce, wet or dry) stands the detector down FOR THIS DRILL ONLY.
 * Every other detector stays live, and both mistake demos grade on their own
 * channels (contact, lane position) — untouched by the override.
 *
 * THE PRICE, stated plainly: the override is a scalpel the config layer does not
 * have. It disarms SP-11 for the whole drill, so a student who stabs the pedal
 * at y = 50 for nothing — before the child exists — also goes unbilled here.
 * That is accepted knowingly: the engine cannot tell a panic stab from a
 * life-saving stop by DECELERATION ALONE (both are ~9 m/s²), which is exactly
 * why the real fix is a hazard signal, not a threshold. Billing the taught act
 * on every attempt is the far worse error of the two, and this drill's graded
 * claim (stop short of the child, in your lane) is unaffected either way.
 *
 * The PRINCIPLED fix is an engine change this template must not make: doc 72's
 * own VP-09 entry already prescribes it — „the director knows when hazards are
 * live, so false positives are controllable". Every EventRunner already carries
 * `hazardActive`; routing it into the engine's cause ledger would make a staged
 * hazard innocent EVERYWHERE (not just where a zebra happens to be painted) and
 * would let this `ruleConfig` line be deleted. Filed in the agent report.
 *
 * Family: "hazards" — the existing catalog chip (doc 76 §2); the second member
 * after sc-hazard-obstacle (templates-hazards.ts).
 */

import type {
  CutInLeadCarSpec,
  EmergencyApproachSpec,
  PedestrianDartOutSpec,
  TelltaleStimulusSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated district by value — the
// L7 pattern; hz-obstacle-district.test.ts asserts the copies match the map)
// ---------------------------------------------------------------------------

/** Northbound right-lane center of hz-obstacle-v1 (240 m two-way street, 1+1). */
const LANE_X = 4.06;
/** Where the child enters the carriageway — mid-block, no crossing anywhere. */
const DART_Y = 150;
/** The east kerb the child pushes off from (the lane is a wide 8.125 m: the
 *  carriageway edge sits at x = 8.125, the kerb line beyond it). */
const CURB_X = 9.5;
/** The rest mark of the correct stop: 2 m short of the child's line. */
const STOP_MARK_Y = 148;
/** The parked car the panic-swerve demo runs into, curb-side of the lane. */
const PARKED_CAR_Y = 185;

/**
 * The staged encounter (PE-04): a child runs west off the east kerb at
 * (9.5, 150) — mid-block, chasing a ball, at a spot with NO crossing and
 * therefore no right of way for anyone. She is released when the player is 30 m
 * out (± the runner's seeded jitter) and at 25 km/h or more: at the drill's
 * ~50 km/h that is ~2.2 s of warning, which is exactly what a full-force stop
 * from 50 needs (≈ 10.7 m of braking after ~1 s of reaction) and exactly what a
 * late one does not.
 *
 * `crossingId` is a SYNTHETIC key ("hzes-dart" matches no district crossing on
 * purpose — the PE-04 „no crossing id" note). The traffic system never validates
 * it against the map (traffic/system.ts stages the walk from `path` geometry
 * alone and uses the id only as an occupancy bookkeeping key), so the runner's
 * `crossingPassed` arm is simply unreachable here: the encounter resolves on
 * contact or on the child clearing the roadway, and never through the
 * PEDESTRIAN_* chain. That is the design, not an accident.
 *
 * Pacing (pinned; the trace gate replays it): 2.5 m/s is a running child. She
 * enters the carriageway at s = 1.375 (x = 8.125) ≈ 0.55 s after release,
 * crosses the player's lane centre at s = 5.44 (x = 4.06) ≈ 2.18 s after it —
 * i.e. exactly when a driver who did NOT brake arrives — and has cleared the
 * roadway (s > 17.625, x < −8.125) by ≈ 7.1 s.
 */
export const SC_HZ_EMERGENCY_STOP_DART: PedestrianDartOutSpec = {
  id: "sc-hzes-child",
  kind: "pedestrianDartOut",
  libraryEventId: "ev-emergency-braking",
  crossingId: "hzes-dart",
  crossing: { x: LANE_X, y: DART_Y },
  start: { x: CURB_X, y: DART_Y },
  dir: { x: -1, y: 0 },
  speedMps: 2.5,
  // Kerb to kerb (19 m) — she keeps running until she is off the far side.
  travelM: 19,
  // The carriageway spans x ∈ [−8.125, 8.125]; along her path that is
  // s ∈ [1.375, 17.625].
  roadFromM: 1.375,
  roadToM: 17.625,
  triggerDistM: 30,
  minTriggerSpeedKmh: 25,
};

/**
 * PE-04 — екстрено спиране пред дете на платното (ЗДвП чл. 20: водачът е длъжен
 * да намали скоростта и при необходимост да СПРЕ, когато възникне опасност за
 * движението; ал. 2 — скоростта се съобразява така, че да може да спре пред
 * всяко предвидимо препятствие).
 *
 * THE TEACHING CLAIM: the pedal, not the wheel. Modern cars have ABS, so the
 * full-force stop is BOTH the shortest stop AND a steerable one — the reflex the
 * drill builds is „натисни докрай и дръж волана прав", because the alternative
 * (yanking the wheel at 50 km/h) trades a stop you control for a swerve you do
 * not. The two mistake demos are the two halves of that claim: reacting late
 * spends the metres you needed, and steering instead of braking merely picks a
 * different thing to hit.
 *
 * The debrief metric is FREE: PedestrianDartOutRunner already arms a
 * ReactionTimer on release and samples the brake pedal, so the resolution
 * outcome carries reactionTimeSec + approachSpeedKmh — the „реакция + спирачен
 * път" read-out the card wants, with no new engine seam.
 */
export const SC_HZ_EMERGENCY_STOP: ScenarioSpec = {
  id: "sc-hz-emergency-stop",
  family: "hazards",
  // Every tag carries Cyrillic (the validator's nonEmptyBg rule) — a bare
  // "ABS" would fail it, so the system is named as a Bulgarian driver names it.
  tagsBg: ["опасност", "екстрено спиране", "спирачна система ABS", "спирачен път", "дете на платното", "реакция"],
  titleBg: "Екстрено спиране",
  objectiveBg:
    "При внезапна опасност натисни спирачката ДОКРАЙ и дръж волана прав — ABS ти позволява да спираш с пълна сила, без колелата да блокират, и точно това е най-късият начин да спреш.",
  archetypeIds: ["PE-04"],
  conceptIds: [
    "c-abs-systems",
    "c-braking-distance",
    "c-stopping-distance-total",
    "c-reaction-time",
    "c-hazard-perception",
    "c-children-on-road",
  ],
  map: {
    archetype: "straight-street",
    // Reuses the committed hz-obstacle-v1 map; its meta.scenario.params,
    // mirrored here for provenance (gen_hazard_obstacle.mjs).
    params: { lengthM: 240, maxspeedKmh: 50 },
    districtId: "hz-obstacle-v1",
  },
  start: {
    spawnPointId: "hz-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Права градска улица, ограничение 50. Потегли и се стабилизирай на 50 км/ч — днес не се учим да караме бавно „за всеки случай“, а да спираме, когато потрябва.",
    },
    {
      n: 2,
      textBg:
        "Дръж петата на пода и стъпалото готово над спирачката. Тук няма пътека и няма светофар — опасността няма да ти се обади предварително.",
    },
    {
      n: 3,
      textBg:
        "Някъде напред топка ще изскочи на платното, а след нея — дете. От мига, в който го видиш, до спирането имаш около две секунди. Не ги харчи в чудене.",
    },
    {
      n: 4,
      textBg:
        "Щом го видиш: спирачка ДОКРАЙ и я дръж натисната. Педалът ще вибрира и ще пука под крака ти — това е ABS, който работи. НЕ отпускай: вибрацията значи, че колата спира максимално.",
    },
    {
      n: 5,
      textBg:
        "Дръж волана прав. Не заобикаляй — при ABS най-късият път до спирането е правата линия, а встрани от лентата те чакат бордюрът и паркираните коли.",
    },
    {
      n: 6,
      textBg:
        "Спри преди детето и изчакай да освободи платното напълно. Чак тогава потегли плавно и продължи до края на отсечката.",
    },
  ],
  success: [
    {
      id: "sc-hzes-approach",
      titleBg: "Мини участъка с разрешената скорост",
      // The drill is worthless from a crawl: the approach gate keeps the driver
      // lawful (≤ 52) without letting him pre-empt the dart by dawdling — the
      // stop mark below is what he cannot reach if he arrives too fast.
      params: { kind: "reachZone", x: LANE_X, y: 100, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-hzes-stop",
      titleBg: "Спри преди детето — с пълна спирачка, в лентата",
      // THE objective (the sc-acno-mark / pk-smooth-stop discipline): completable
      // ONLY at rest, and ONLY short of the child's line at y = 150. A driver who
      // reacted late is still rolling here and can never satisfy it; a driver who
      // swerved is not on x = 4.06 at all.
      params: { kind: "reachZone", x: LANE_X, y: 146, radiusM: 4, maxSpeedKmh: 6 },
    },
    {
      id: "sc-hzes-finish",
      titleBg: "Изчакай детето и продължи до края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 220, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scHzEmergencyStop.ts; gates in traces/__tests__/
  // sc-hz-emergency-stop-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-hz-emergency-stop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-hz-emergency-stop/mistake-late-reaction.trace.json" },
      titleBg: "Късна реакция",
      whatWentWrongBg:
        "Детето беше на платното близо две секунди, преди кракът да тръгне към спирачката — и тези две секунди са 28 метра при 50 км/ч. Колата стигна до него, преди спирачката изобщо да е поела работа: ударът беше решен не от спирачния път, а от закъснялото ходило. Спирачният път е физика и не се пазари; реакцията е единственото, което е твое. Затова стъпалото стои над спирачката, а погледът — надалеч.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-hz-emergency-stop/mistake-swerve.trace.json" },
      titleBg: "Отклонение от лентата вместо спиране",
      whatWentWrongBg:
        "Вместо спирачка — волан. Рефлексът размина детето, но изкара колата от лентата ѝ и я задържа върху бордюрната страна, откъдето връщане нямаше: няколко метра по-нататък предницата влезе в паркиран автомобил. Заобикалянето не е спиране — то само сменя в какво ще се удариш, а мястото встрани от лентата ти никога не е празно. С ABS спирачката работи докрай И воланът остава жив: първо спираш, а завиваш само ако СЛЕД това остане и къде.",
      codeRefs: ["POOR_LANE_KEEPING", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всяка внезапна опасност, която вече е на платното ти — дете след топка между паркираните коли, човек иззад спрял бус, животно, отворена врата. Общото им е, че се появяват там, където няма пътека, няма знак и никой не ти дава предимство: остават ти само очите, кракът и метрите.",
    whyBg:
      "Спирачният път не е едно число, а сбор от две: пътят на реакцията плюс пътят на спирането. При 50 км/ч колата минава по 14 метра за всяка секунда мислене — самото спиране от 50 иска към 11–12 метра, а една секунда колебание добавя още 14. Ето защо реакцията, а не спирачката, най-често решава дали ще спреш навреме. Оттук идва и вторият урок: натиснатата ДОКРАЙ спирачка не е паника, а техника. ABS не скъсява физиката, но не позволява на колелата да блокират — а въртящото се колело продължава да се управлява. Затова с ABS се спира с пълна сила и се държи прав волан: пълната спирачка е и най-късото, и най-управляемото спиране. Вибрацията и пукането под крака са знак, че системата работи — единствената грешка е да отпуснеш заради тях. Воланът вместо спирачката е лоша сделка: на 50 км/ч рязкото отклонение изнася колата встрани, където са бордюрът, паркираните автомобили и насрещните — размяна на един удар за друг, при това вече без спирачен път. И на мокро цялата сметка се удължава наполовина, а мисленето остава също толкова бавно.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият гледа две неща: КОГА кракът тръгва и КАК натиска. Очаква стъпало в готовност над спирачката при всяка закрита гледка, незабавно и пълно натискане при поява на опасност и прав волан по време на спирането. Удар в пешеходец прекратява изпита; излизането от лентата и ударът в паркиран автомобил са същият край, само по обиколния път.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд върху същата опасност: the RENDER/conditions axis only.
    // NO `physics: { wetGrip: true }`, and NOT because the lesson would not want
    // it — the stopping-distance point doubles beautifully on wet. The seam is
    // simply missing: `physics` is a TEMPLATE-WIDE ScenarioSpec field (LevelSpec
    // carries `conditions` but no physics override), so opting in would run L1–L4
    // wet too, against authored ghosts that are dry-tuned (ADR-006 stage 4a — the
    // same wall sc-ac-night-overdrive documented in wave 2). Reported in the
    // agent notes; when LevelSpec.physics lands, this rung takes wetGrip and the
    // ghost gets a WET_DECEL twin.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [SC_HZ_EMERGENCY_STOP_DART],
  conditions: { weather: "dry" },
  // THE CORRECTNESS FIX, not a convenience — see the file header for the full
  // argument. The cause ledger cannot see a staged dart on a crossing-less
  // street, so a full-force stop (the TAUGHT behaviour, ≈ 9.0 m/s² in the live
  // car) would bill as „рязко спиране без причина". 25 m/s² is beyond the car's
  // physical maximum: the detector stands down for this drill and only for it.
  ruleConfig: { harshBrakeDecelMps2: 25 },
  localeBg: "bg-BG",
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. sc-hz-brake-dont-swerve — „Спри в лентата, не свивай на сляпо" (OV-18)
//    on hz-debris-v1 (wave 6). The sibling above teaches the PEDAL; this one
//    teaches the WHEEL that must not move while the pedal does its work.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WHY A NEW DISTRICT (hz-debris-v1) INSTEAD OF THE SIBLING'S hz-obstacle-v1:
 * this drill's claim is „спирай В ЛЕНТАТА, а не встрани", and a claim about
 * lanes needs a second lane in the SAME direction — one that is occupied, and
 * one the wheel can actually reach by a REAL, gradable laneId delta.
 * hz-obstacle-v1 is a two-way 1+1: over there a swerve can only ever be a
 * lane-keep excursion toward the kerb (which is exactly what the sibling's
 * „Отклонение от лентата" demo grades). Here the swerve is a LANE CHANGE into
 * an occupied lane, and the engine's shipped lane-change adjudication —
 * indicator + mirror, rules/engine.ts §3 — is what convicts it. That is the
 * whole difference between the two templates, and it is structural, not
 * cosmetic. gen_hz_debris.mjs asserts every clause of it at build time; the
 * battery hz-debris-districts.test.ts re-proves each against the real reducer.
 *
 * Two absences on that map are load-bearing here (both pinned by the battery):
 *  - ONE-WAY ⇒ rules/engine.ts guards CROSSED_SOLID_LINE and
 *    CENTER_LINE_TOUCHED on `tick.oneway === false`, so both are structurally
 *    disarmed: the leftward swerve grades as the lane change it IS, and the
 *    mistake's codeRefs stay exactly two;
 *  - NO crossings / junctions / stop lines ⇒ the same crossing-shaped cause
 *    ledger the sibling documents at length is empty here too, which is why
 *    this template carries the SAME `ruleConfig` override, for the same reason.
 *    See the file header — the argument is not repeated, it is inherited.
 */

/** hz-debris-v1 lane centers (meta.scenario — the L7 copy truth). */
const DEBRIS_LANE_PLAYER_X = 4.06; // laneId 0 — the curb lane; the debris lands here
const DEBRIS_LANE_ESCORT_X = -4.06; // laneId 1 — the escort's lane; the swerve's target
/** One drawn lane width on hz-debris-v1 (3.25 m × perceptual scale 2.5), m. */
const DEBRIS_LANE_SHIFT = 8.125;
/** The reveal: the debris rect's trigger arms 30 m out (meta.scenario.revealY). */
const DEBRIS_REVEAL_Y = 160;
/** The debris rect's center (meta.scenario.debrisY) — recorder data, not map data. */
const DEBRIS_Y = 190;
/** The shadow's rest mark: 6 m short of the debris, wheel dead straight. */
const DEBRIS_STOP_MARK_Y = 184;

/**
 * The ESCORT (the reason the wheel is not an option). A `cutInLeadCar` actor
 * REPURPOSED — the honest v1 proxy this template flags out loud:
 *
 *  - it rides the NEIGHBOURING lane the whole approach (`extraRightOffsetM` =
 *    −one lane pitch → x ≈ −4.06), pinned essentially ABREAST of the player's
 *    door (`paceAheadM` 1 — matchPlayer, slaved to the player's own progress).
 *    That is the entire staging: when the debris appears, the lane you would
 *    swerve into is already full, which is the situation the лекция is about;
 *  - `cutShiftM` is ZERO — the defining departure from every other cutInLeadCar
 *    in the catalog (FC_CUTTER, templates-following.ts, shifts a full lane).
 *    The escort NEVER enters the player's lane; there is no cut to survive.
 *    The runner's „cut" is used here purely as a RELEASE: at the reveal it
 *    swaps matchPlayer for a plain cruise, so the escort — whose lane is
 *    clear — simply carries on past the braking player, exactly as a real
 *    neighbour would. Without that release the actor would be slaved to the
 *    player's progress and would absurdly stop DEAD ALONGSIDE a car braking
 *    for debris that was never in its lane;
 *  - the runner emits NO SimTick event before the release, and after it only a
 *    physical-contact collision (runners.ts) — so the escort can never convict
 *    the player of anything it is not actually hit by. It is scenery with one
 *    consequence, which is precisely what „а до теб има кола" needs to mean.
 *
 * WHAT IT CANNOT DO, stated plainly: it never enters the harsh-brake cause
 * ledger. `leadGapFor` (traffic/system.ts) drops every vehicle more than
 * LEAD_CORRIDOR_M = 4.0 m off the driving line, and the escort sits a full
 * 8.125 m pitch away — so a car ABREAST of the student is invisible to the
 * engine's notion of „why might he be braking". That is a second, independent
 * reason this template needs the `ruleConfig` override below, and it is the
 * same underlying gap the sibling filed: the engine has no hazard channel.
 */
export const SC_HZ_BRAKE_DONT_SWERVE_ESCORT: CutInLeadCarSpec = {
  id: "sc-hzbds-escort",
  kind: "cutInLeadCar",
  libraryEventId: "ev-emergency-braking",
  actor: {
    pathNodes: ["hzd-n-start", "hzd-n-end"],
    // Dormant just ahead-left of the spawn; matchPlayer takes over on the
    // player's first movement and pins it abreast for the whole approach.
    hold: { nodeIndex: 0, offsetM: 18 },
    cruiseSpeedMps: 13.89, // 50 km/h — the posted limit; it is not speeding either
    extraRightOffsetM: -DEBRIS_LANE_SHIFT, // the LEFT lane (x ≈ −4.06)
    colorIndex: 2,
  },
  paceAheadM: 1, // ABREAST (± the runner's seeded jitter) — beside your door
  maxMatchSpeedMps: 16,
  // The RELEASE point, on the ACTOR's own (left-lane) path, at the reveal:
  // from here the escort stops pacing and drives its own clear lane.
  cutAt: { x: DEBRIS_LANE_ESCORT_X, y: 162 },
  cutRadiusM: 4,
  minCutSpeedKmh: 25, // the 50 km/h approach clears it — the release fires
  cutShiftM: 0, // ZERO LATERAL: the escort never enters the player's lane
  cutRampSec: 1.5,
  cutSpeedMps: 13.89, // ~50 km/h locked cruise — it sails past the braking player
  clearAheadM: 60,
};

/**
 * OV-18 — препятствие на платното: спиране в лентата вместо сляпо отклонение
 * (ЗДвП чл. 20: при възникване на опасност водачът намалява скоростта и при
 * необходимост СПИРА; чл. 23: дистанцията и скоростта се съобразяват така, че
 * да може да спре; чл. 25: маневра — включително престрояване — се предприема
 * едва след като водачът се убеди, че няма да застраши останалите).
 *
 * THE TEACHING CLAIM, and why it is NOT the sibling's: sc-hz-emergency-stop
 * teaches „натисни докрай" against an empty road — there, the wheel is wrong
 * because the stop is shorter straight. HERE the wheel is wrong for a harder
 * reason: the metre of tarmac the reflex reaches for IS ALREADY OCCUPIED, and
 * the driver does not know it because he never looked. The лекция therefore
 * grades the swerve as what the law calls it — престрояване, a manoeuvre owed
 * a mirror (чл. 25) — and not as clumsy steering. The trap the drill is built
 * around: a blind swerve TRADES a hazard you can see for one you cannot.
 *
 * And the honest completion, which is the shadow's second half: the drill does
 * NOT teach „never go around". It teaches ORDER. Stop first — in your lane,
 * at full force, wheel straight. THEN look, signal, and pass the obstacle at
 * walking pace, having earned the lane you are taking. Both the correct pass
 * and the fatal one enter the same neighbouring lane; the only differences are
 * a mirror, a signal and 30 km/h — which is exactly the lesson, and exactly why
 * the shadow drives the pass-around instead of parking in front of the debris
 * forever.
 */
export const SC_HZ_BRAKE_DONT_SWERVE: ScenarioSpec = {
  id: "sc-hz-brake-dont-swerve",
  family: "hazards",
  tagsBg: [
    "опасност",
    "препятствие на платното",
    "екстрено спиране",
    "спирачна система ABS",
    "сляпо отклонение",
    "мъртва зона",
    "престрояване",
  ],
  titleBg: "Спри в лентата, не свивай на сляпо",
  objectiveBg:
    "Падне ли препятствие в лентата ти, а до теб има кола — спирай силно В лентата: сляпото рязко отклонение е по-опасно от удара, който избягваш.",
  archetypeIds: ["OV-18"],
  conceptIds: [
    "c-hazard-perception",
    "c-animals-obstacles",
    "c-abs-systems",
    "c-braking-distance",
    "c-stopping-distance-total",
    "c-reaction-time",
    "c-mirrors-blind-spots",
    "c-lane-change",
  ],
  map: {
    archetype: "straight-street",
    // The committed hz-debris-v1 map; its meta.scenario.params, mirrored here
    // for provenance (gen_hz_debris.mjs).
    params: { lengthM: 300, maxspeedKmh: 50 },
    districtId: "hz-debris-v1",
  },
  start: {
    spawnPointId: "hzd-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Еднопосочна улица с две ленти, ограничение 50. Ти си в дясната лента — потегли и се стабилизирай на 50 км/ч.",
    },
    {
      n: 2,
      textBg:
        "Погледни вляво: в съседната лента, почти наравно с вратата ти, се движи кола. Запомни я — тя е причината днешният урок да не е „завърти волана“.",
    },
    {
      n: 3,
      textBg:
        "Някъде напред в ТВОЯТА лента ще се появи препятствие. Първият ти рефлекс ще каже „встрани“. Не му се доверявай: встрани е заета лента, а ти не си погледнал в нея.",
    },
    {
      n: 4,
      textBg:
        "Щом го видиш: спирачка ДОКРАЙ и волан ПРАВ. Педалът ще вибрира под крака ти — това е ABS, който работи. Не отпускай и не дърпай волана: спирачката е твоята маневра.",
    },
    {
      n: 5,
      textBg:
        "Спри преди препятствието, в своята лента, и остани там. Дотук задачата е решена — колата стои, а ти си жив и с избор.",
    },
    {
      n: 6,
      textBg:
        "Гледай колата отляво как си минава по своята лента. Точно това е урокът: лентата, която воланът искаше, не беше празна. Заобикалянето е следващ, ОТДЕЛЕН ход — пак с оглед, пак с мигач и на скорост на пешеходец.",
    },
  ],
  success: [
    {
      id: "sc-hzbds-approach",
      titleBg: "Мини участъка с разрешената скорост",
      // The drill is worthless from a crawl: the approach gate keeps the driver
      // lawful (≤ 52) without letting him pre-empt the reveal by dawdling.
      params: { kind: "reachZone", x: DEBRIS_LANE_PLAYER_X, y: 110, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-hzbds-stop",
      titleBg: "Спри преди препятствието — с пълна спирачка, В своята лента",
      // THE objective (the sc-hzes-stop discipline): completable ONLY at rest,
      // ONLY short of the debris, and ONLY from the player's own lane — the
      // 4 m radius is half a lane pitch, so a car that swerved into lane 1
      // (x = −4.06) can never satisfy it. Stopping is not enough; stopping
      // WHERE YOU WERE is the graded claim.
      params: { kind: "reachZone", x: DEBRIS_LANE_PLAYER_X, y: DEBRIS_STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
    // NO third „заобиколи и продължи" gate, deliberately. The drill's claim
    // ENDS at the stop (the brief's own shadow plan: „full straight-line stop
    // in-lane with the escort untouched"), and an objective is a promise the
    // ghost must be able to keep. A pass-around gate was authored and cut: from
    // a rest mark 6 m short of the debris there is no honest line around it —
    // the ghost clipped the rect every time (measured, not assumed), because a
    // car that stopped THAT close has to reverse or crawl a lock-to-lock arc
    // neither the recorder nor the лекция wants to teach. The pass-around
    // survives where it belongs — in `teach.whyBg` and instruction 6 as the
    // NEXT, separate move — rather than as a gate the drill cannot honour.
  ],
  rubric: { parTimeSec: 45 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scHzBrakeDontSwerve.ts; gates in traces/__tests__/
  // sc-hz-brake-dont-swerve-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-hz-brake-dont-swerve/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-hz-brake-dont-swerve/mistake-blind-swerve.trace.json" },
      titleBg: "Рязко отклонение в съседната кола",
      whatWentWrongBg:
        "Воланът тръгна преди очите. Мигачът дори светна — и точно това прави грешката поучителна: мигачът ОБЯВЯВА маневра, но не я ПРОВЕРЯВА. В лявата лента, на една ръка разстояние, вече имаше кола; тя беше там през цялото време, откакто потегли. Рефлексът размина препятствието и намери автомобил — сделка, при която единият удар се сменя за друг, само че този път в някой, който няма никаква вина. Препятствието се вижда; колата в мъртвата ти зона — не. Затова първо спирачка, а волан само след огледало.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-hz-brake-dont-swerve/mistake-late-brake.trace.json" },
      titleBg: "Късно спиране в препятствието",
      whatWentWrongBg:
        "Волан прав, лента спазена — и въпреки това удар, защото кракът тръгна твърде късно. Тези 30 метра стигаха: пълното спиране от 50 км/ч иска към 11 метра. Не стигна решителността — натискът дойде след колебание, а колебанието при 50 км/ч се мери в метри: всяка секунда чудене е близо 14 метра, изядени преди спирачката изобщо да е поела. Спирачният път е физика и не се пазари; реакцията е единственото, което е твое. Стъпалото стои НАД спирачката, а натискът е докрай от първия сантиметър — не постепенно „опипване“.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Винаги когато нещо се появи в твоята лента, а до теб или зад теб има движение: паднал товар от камион, отчупена гума, клон, дупка, спрял на аварийни. Общото им е, че рефлексът ти предлага изход встрани — точно там, където не си погледнал от километър насам.",
    whyBg:
      "Първо физиката: пълното спиране от 50 км/ч иска около 11 метра, но пътят на реакцията се добавя отгоре — при 50 км/ч колата минава близо 14 метра за всяка секунда чудене. Затова кракът, а не спирачката, най-често решава изхода. ABS не скъсява тези метри, но не позволява на колелата да блокират — а въртящото се колело продължава да се управлява. Оттук и правилото: пълна спирачка, прав волан. Вибрацията под крака е знак, че системата работи, и единствената грешка е да отпуснеш заради нея. Сега главното: защо НЕ волан. Препятствието пред теб е известно — виждаш го, знаеш къде е и колко е голямо. Лентата встрани е НЕИЗВЕСТНА, ако не си погледнал: там може да има кола, мотор или колоездач, а точно съседната лента е мястото, където живее мъртвата ти зона. Сляпото отклонение затова е лоша сделка — то заменя удар, който можеш да намалиш със спирачката, с удар, за който не подозираш, при това често челен или страничен в някой невинен. И юридически това не е „избягване“, а престрояване: чл. 25 иска маневрата да започне едва след като си се убедил, че не застрашаваш никого. Убеждаването се казва огледало и поглед през рамо. Затова редът е спирачка → спиране → оглед → мигач → бавно заобикаляне. Не „никога не заобикаляй“, а „не заобикаляй СЛЯПО и не заобикаляй със скоростта, с която си пътувал“.",
    lawRef: "ЗДвП чл. 20, чл. 23, чл. 25",
    examinerBg:
      "Изпитващият гледа последователността, не героизма. Очаква стъпало в готовност над спирачката, незабавно и ПЪЛНО натискане при поява на препятствие, прав волан по време на спирането — и едва след пълното спиране оглед, мигач и бавно заобикаляне с връщане вдясно. Рязко отклонение без оглед е отсъдено като опасна маневра дори когато „се е разминало“; удар в съседен автомобил прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд върху същата опасност: the RENDER/conditions axis ONLY. The
    // stopping-distance point would double beautifully on wet, and the backlog
    // asked for wetGrip here — but the seam is missing in exactly the way the
    // sibling documents above: `physics` is a TEMPLATE-WIDE ScenarioSpec field
    // (LevelSpec carries `conditions` but no physics override), so opting in
    // would run L1–L4 wet too, against a ghost that is dry-tuned — and on THIS
    // drill that is not cosmetic: the whole map is sized around a 10.68 m dry
    // stop fitting a 30 m reveal window (gen_hz_debris asserts it), and a wet
    // envelope would put the shadow INTO the debris. Reported in the agent
    // notes; when LevelSpec.physics lands, this rung takes wetGrip, the reveal
    // window grows on that rung, and the ghost gets a WET_DECEL twin.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [SC_HZ_BRAKE_DONT_SWERVE_ESCORT],
  conditions: { weather: "dry" },
  // INHERITED CORRECTNESS FIX — the file header carries the full argument and
  // it applies here unchanged: hz-debris-v1 has no crossings, no junctions and
  // no stop lines, and the escort sits a full lane pitch outside the 4 m lead
  // corridor, so `noBrakeCause` is TRUE for the whole drill by construction.
  // Without this the lesson would order the student to brake ДОКРАЙ and then
  // bill him 10 points (основна) for obeying. 25 m/s² is beyond the car's
  // physical maximum (full pedal ≈ 9.0): the detector stands down for this
  // drill and only for it. Every other detector stays live — and both mistake
  // demos grade on their own channels (lane change, contact), untouched.
  ruleConfig: { harshBrakeDecelMps2: 25 },
  localeBg: "bg-BG",
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. sc-hz-accident-scene — „Покрай прясна катастрофа" (VP-12) on
//    hz-accident-v1 (wave 8). The two siblings above teach the STOP the hazard
//    demands; this one teaches the PASS a hazard you are NOT part of demands —
//    slow, arc wide, and above all do NOT stop in the lane to look.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Geometry pinned from content/world/hz-accident-v1.json (gen_hz_accident.mjs) —
 * the L7 copy-by-value law; hz-accident-districts.test.ts asserts these against
 * the generated map, and the sc-hz-accident-scene trace gate replays the drives
 * through the production stack.
 */
/** Northbound right-lane center of hz-accident-v1 (260 m two-way street, 1+1). */
const ACC_LANE_X = 4.06;
/** The wide-pass line the shadow arcs onto to clear the wreck — inside the
 *  lane-keep tolerance (offset −2.26 < 3.25), so the arc bills no lane-keep. */
const ACC_WIDE_X = 1.8;
/** Mid-scene y — the wreck tableau sits here (recorder data, not map data). */
const ACC_SCENE_Y = 155;
/** The В27 no-stopping span [fromM, toM] wrapping the scene (map data). */
const ACC_BAN_FROM_Y = 120;
const ACC_BAN_TO_Y = 195;

/**
 * The BYSTANDER (a person milling by the wreck). A `pedestrianDartOut` on a
 * street with NO crossing — the sc-hz-emergency-stop pattern, and the reason it
 * matters here too: the traffic system stages the walk from `path` geometry
 * alone, so the synthetic `crossingId` ("hzac-scene", matching no district
 * crossing) NEVER arms the CrossingZoneTracker, and no PEDESTRIAN_* code can
 * fire off this actor in ANY drive. It is a contact channel and a scene dressing,
 * not a zebra duty — exactly what a person standing at a wreck is.
 *
 * He steps WEST off the east kerb at (7.8, 152) and walks to x = 4.4 — the
 * curb-HALF of the lane, never reaching the shadow's wide line (x = 1.8), so the
 * shadow that arcs around him is contact-free BY CONSTRUCTION (|Δx| ≥ 2.6 m >
 * PEDESTRIAN_CONTACT_M 1.5 for every frame, whatever the timing). A tight pass
 * that stays on x ≈ 5.5 threads exactly where he is walking — the tight-and-fast
 * demo finds him (or the wreck rects beside him); both are COLLISION.
 */
export const SC_HZ_ACCIDENT_BYSTANDER: PedestrianDartOutSpec = {
  id: "sc-hzac-bystander",
  kind: "pedestrianDartOut",
  libraryEventId: "ev-accident-scene-conduct",
  crossingId: "hzac-scene",
  crossing: { x: ACC_LANE_X, y: 152 },
  start: { x: 7.8, y: 152 },
  dir: { x: -1, y: 0 },
  speedMps: 1.4,
  // He crosses only the curb-half of the lane (x 7.8 → 4.4) and stops there.
  travelM: 3.4,
  // The whole short walk is on the carriageway (x ∈ [−8.125, 8.125]).
  roadFromM: 0,
  roadToM: 3.4,
  triggerDistM: 26,
  minTriggerSpeedKmh: 22,
};

/**
 * The ARRIVING RIG (ambience — ЗДвП чл. 91). An `emergencyApproach` closing from
 * behind on the LEFT (oncoming) lane, heading to the scene: the player must not
 * block it. It is tuned to PASS before the scene and never convict: a fast rig
 * (24 m/s) starting only 16 m behind clears the arm-window (26 m + 12 m at ≥
 * 11.5 m/s closing ≈ 3.4 s, well inside the generous 9 s window) in every drive,
 * so the adjudication resolves „clear" (or „yielded" when the shadow slows) —
 * never EMERGENCY_NOT_YIELDED. It rides x ≈ −4.06 (the oncoming lane), a full
 * lane pitch from the player, so it also never enters the harsh-brake lead
 * corridor and never collides. Scenery with one duty (make way), discharged the
 * moment the player is not a wall in its lane.
 */
export const SC_HZ_ACCIDENT_EMERGENCY: EmergencyApproachSpec = {
  id: "sc-hzac-rig",
  kind: "emergencyApproach",
  libraryEventId: "ev-accident-scene-conduct",
  actor: {
    pathNodes: ["hza-n-start", "hza-n-end"],
    hold: { nodeIndex: 0, offsetM: 0 }, // y = 0 — 15 m behind hza-spawn-approach
    cruiseSpeedMps: 24, // ~86 km/h: the special-regime rig runs above the 50 (чл. 91)
    extraRightOffsetM: -ACC_LANE_X, // the LEFT (oncoming) lane, x ≈ −4.06
    colorIndex: 0,
    profile: "emergency", // white rig + blue light bar (ADR-001 fictional)
  },
  releaseGapM: 16,
  armBehindM: 26,
  responseWindowSec: 9,
  yieldShiftM: 0.8,
  yieldSlowKmh: 40, // ~10 under the posted 50
  passAheadM: 12,
  clearSpeedMps: 24,
};

/**
 * VP-12 — поведение покрай място на произшествие (ЗДвП чл. 123: при пътно-
 * транспортно произшествие водачите на приближаващите превозни средства са
 * длъжни да намалят скоростта, да не създават опасност и да не пречат на
 * оказването на помощ; чл. 20, ал. 2: скоростта се съобразява с обстановката,
 * така че водачът да може да спре пред всяко предвидимо препятствие).
 *
 * THE TEACHING CLAIM, and why it is NOT the two siblings': sc-hz-emergency-stop
 * and sc-hz-brake-dont-swerve teach the STOP a hazard IN your path demands.
 * HERE the hazard is NOT in your path — it is a crash already stopped in the
 * curb-half of the lane — and the whole skill is to pass it WITHOUT becoming a
 * second incident: shed speed early, arc WIDE of the people and the sheet metal,
 * and — the graded core — do NOT stop in the live lane to look. A car parked to
 * gawk turns one accident into a blockage that the ambulance behind you cannot
 * get past; that is what the В27 span over the scene grades
 * (ILLEGAL_STOP_IN_BAN_ZONE), and it is exactly the „standing in live traffic"
 * mistake doc 72 files under VP-12.
 *
 * WHAT IS GRADED vs WHAT IS TAUGHT (the honest scope): чл. 123 also owns the
 * DUTIES OF A PARTICIPANT — stop, secure the scene, give aid, report, never
 * flee or drink. None of that is drivable, and inventing a detector for it
 * would bill an unmodelled duty (A12). So those stay TEACH-CARD content, and the
 * sim grades only the DRIVE-PAST conduct the accident topic's own questions
 * cannot cover: the gawk-stop (ILLEGAL_STOP_IN_BAN_ZONE) and the tight-and-fast
 * squeeze past the people (COLLISION). The arriving ambulance is scenery with
 * one duty — make way — and the map's В27 span + the wreck rects carry the rest.
 */
export const SC_HZ_ACCIDENT_SCENE: ScenarioSpec = {
  id: "sc-hz-accident-scene",
  family: "hazards",
  tagsBg: [
    "произшествие",
    "катастрофа",
    "намали скоростта",
    "мини широко",
    "не спирай да зяпаш",
    "линейка",
    "специален режим",
    "забрана за престой В27",
  ],
  titleBg: "Покрай прясна катастрофа",
  objectiveBg:
    "Покрай ПТП: намали рязко под лимита, мини широко от хората и ламарините и НЕ спирай в лентата да зяпаш — освободи пътя за помощта.",
  archetypeIds: ["VP-12", "OV-18"],
  conceptIds: [
    "c-accident-duties",
    "c-hazard-perception",
    "c-speed-adaptation",
    "c-stopping-standing-rules",
    "c-emergency-priority",
    "c-reaction-time",
  ],
  map: {
    archetype: "straight-street",
    // Reuses the committed hz-accident-v1 map; its meta.scenario.params,
    // mirrored here for provenance (gen_hz_accident.mjs).
    params: { lengthM: 260, maxspeedKmh: 50 },
    districtId: "hz-accident-v1",
  },
  start: {
    spawnPointId: "hza-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Права градска улица, ограничение 50. Напред вдясно има прясна катастрофа — смачкани коли и хора около тях, изял е половината от твоята лента.",
    },
    {
      n: 2,
      textBg:
        "Намали РАНО и слез чувствително под 50 — покрий спирачката. Не защото те задължава знак, а защото не знаеш какво ще излезе иззад ламарините.",
    },
    {
      n: 3,
      textBg:
        "Тук има знак В27 — престоят е забранен през зоната на сцената. Не спирай в лентата да зяпаш: спрелият да гледа е тапа, а зад теб иде линейка, на която пътят трябва да е чист.",
    },
    {
      n: 4,
      textBg:
        "Мини ШИРОКО от хората и от колите — вземи вътрешната част на лентата, далеч от бордюра. Някой може да пристъпи към платното; кракът стои готов над спирачката.",
    },
    {
      n: 5,
      textBg:
        "Зад теб приближава линейка със специален режим. Направи ѝ път — дръж вдясно и намали, за да те подмине по свободната половина; не ѝ спирай в коридора.",
    },
    {
      n: 6,
      textBg:
        "Щом подминеш сцената и платното пред теб е чисто, чак тогава се върни в средата на лентата и ускори плавно до края на отсечката.",
    },
  ],
  success: [
    {
      id: "sc-hzac-slow",
      titleBg: "Влез в зоната на произшествието с намалена скорост",
      // The graded core of чл. 20: come off the limit BEFORE the scene. Capped
      // at 35 (well under 50) at the mouth of the В27 span — a driver who holds
      // city speed to „get a look" cannot satisfy it and stalls the drill here.
      params: { kind: "reachZone", x: ACC_LANE_X, y: 122, radiusM: 12, maxSpeedKmh: 35 },
    },
    {
      id: "sc-hzac-wide",
      titleBg: "Мини широко и бавно покрай хората и ламарините",
      // THE „мини широко" objective: completable ONLY from the wide line
      // (x = 1.8, radius 2.5 < a lane half-pitch), AND only slowly (≤ 32). A car
      // that squeezed past on x ≈ 5.5 is neither wide enough nor — having hit
      // something — still driving.
      params: { kind: "reachZone", x: ACC_WIDE_X, y: ACC_SCENE_Y, radiusM: 2.5, maxSpeedKmh: 32 },
    },
    {
      id: "sc-hzac-clear",
      titleBg: "Освободи сцената и продължи до края на отсечката",
      // Beyond the В27 span (y > 195) — the legal place to be back at speed on
      // the driving line, proving the car cleared the scene and resumed.
      params: { kind: "reachZone", x: ACC_LANE_X, y: 232, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scHzAccidentScene.ts; gates in traces/__tests__/
  // sc-hz-accident-scene-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-hz-accident-scene/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-hz-accident-scene/mistake-gawk-stop.trace.json" },
      titleBg: "Зяпане със спиране в лентата",
      whatWentWrongBg:
        "Колата спря в лентата — да се погледне. И точно това превръща една катастрофа в две: спрелият да зяпа е стена, зад която се трупа опашка, а линейката, която бърза натам, няма как да мине. Знакът В27 не е случаен — престоят покрай произшествие е забранен именно защото пътят трябва да остане чист за помощта. Любопитството се плаща от някого другиго. Ако не си участник, покрай ПТП има само едно правило за движение: намали, мини и освободи платното — не спирай да гледаш.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-hz-accident-scene/mistake-squeeze.trace.json" },
      titleBg: "Минаване плътно и бързо покрай хората",
      whatWentWrongBg:
        "Покрай сцената колата мина плътно и бързо — на една ръка от ламарините и от хората около тях. А около една катастрофа платното не е предвидимо: някой се навежда над ранен, друг пристъпва назад, без да гледа. Тесният и бърз проход не оставя нито метър, нито миг за грешката им — и я намери. Затова покрай произшествие се минава широко и бавно: вземаш вътрешната част на лентата, далеч от хората, със скорост, при която всяко тяхно движение е още само изненада, а не удар.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Винаги, когато минаваш покрай вече случило се произшествие, а ти не си участник: катастрофирали коли на платното, аварирал бус с триъгълник, спрели екипи. Общото е, че опасността е СПРЯЛА встрани от пътя ти — задачата не е да спреш заради нея, а да я подминеш, без да станеш втори инцидент и без да пречиш на помощта.",
    whyBg:
      "Три неща се събират тук. Първо — скоростта (чл. 20): около сцената платното е непредвидимо, затова слизаш чувствително под лимита и покриваш спирачката, за да можеш да спреш пред всичко, което изскочи иззад ламарините. Второ — траекторията: минаваш ШИРОКО от хората и колите, по вътрешната част на лентата, защото тесният проход не прощава едно неволно пристъпване. Трето, и най-важно за изпита — престоят: спирането в лентата „само да погледнеш“ е забранено (В27 покрай произшествие) и е опасно по същество — спрелият да зяпа е тапа, която запушва пътя точно когато по него бърза линейка. Ако зад теб идва автомобил със специален режим, си длъжен да му направиш път (чл. 91): дръж вдясно, намали, пусни го да мине. Отделно стоят задълженията на УЧАСТНИКА в ПТП по чл. 123 — да спреш, да обезопасиш мястото, да окажеш помощ, да уведомиш и никога да не бягаш и да не пиеш алкохол след удар; те са важни, но се учат, а не се карат тук. Тази задача упражнява само едното: как се МИНАВА покрай чуждо произшествие.",
    lawRef: "ЗДвП чл. 123; чл. 20",
    examinerBg:
      "Изпитващият гледа три неща покрай сцена на произшествие: намаляваш ли предварително и осезаемо, минаваш ли с достатъчна странична дистанция от хората и — задължително — НЕ спираш ли в лентата да гледаш. Спиране за зяпане покрай произшествие е груба грешка (пречиш на движението и на помощта); удар в човек или в спряло превозно средство прекратява изпита. Ако приближава специален режим — правиш му път без забавяне.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — night: the difficulty axis is SEEING the scene in time. A crash at
    // night is read from flares and the light bar, not the skyline, so the
    // early slow-down has to come from those cues. RENDER only — no physics
    // (ADR-006 stage 4a: the authored ghost is dry-tuned), no new grading.
    { level: 5, conditions: { night: true } },
  ],
  staged: [SC_HZ_ACCIDENT_BYSTANDER, SC_HZ_ACCIDENT_EMERGENCY],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. sc-hz-breakdown-pulloff — „Авария на магистралата — протоколът" (PK-10)
//    on the committed mw-v1 motorway segment (map REUSED from
//    sc-mw-emergency-lane). The DRIVABLE half of the big triangle cluster
//    (ev-emergency-stop-triangle, 21 q / 43 pt): the pull-off arc itself —
//    signal, cross to the emergency lane in one clean diagonal, stop hard
//    right. The ON-FOOT half (vest before exit, triangle at 100 m, wait behind
//    the barrier, call 112) has NO cockpit mechanic and stays in the debrief
//    card — a deliberate, documented scope cut (the final-report note).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * WHY mw-v1 (map REUSED, not authored): the fault this drill teaches only
 * exists on a road WITH an emergency lane. mw-v1 (gen_motorway.mjs) is the
 * committed divided 2+2 with the авариЙна лента as laneId 0 under an
 * "emergencyLane" zone span (mw-district.test.ts pins it): emergency x = 8.13
 * (laneId 0), cruise x = 0 (laneId 1), limit 140. The чл. 58, т. 3 detector
 * (EMERGENCY_LANE_DRIVING, default-ON, structurally data-armed) is the graded
 * fault of the wrong pull-off; the correct one is protected structurally — the
 * detector's ONE innocence case is exactly the breakdown stop this drill
 * teaches: firm braking toward a halt keeps the clock reset, and the stop
 * itself disarms (v ≤ movingSpeed). No ruleConfig, no physics: the taught act
 * grades clean on the LIVE map with zero overrides.
 */

/** mw-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const BP_X_CRUISE = 0; // laneId 1 — the right TRAVEL lane
const BP_X_EMERG = 8.13; // laneId 0 — the авариЙна лента (лента за принудително спиране)
/** The red telltale lights as the player passes y = 250 in the travel lane —
 *  mid-segment, well past the approach checkpoint (single truth by value with
 *  the staged TelltaleStimulusSpec below). */
const BP_TRIGGER = { x: BP_X_CRUISE, y: 250 };
const BP_TRIGGER_DIST_M = 8;
/** The compliant halt: hard right in the emergency lane, ~130 m of planning
 *  room past the lamp. Mirrors the graded stop-zone objective by value. */
const BP_STOP = { x: BP_X_EMERG, y: 378 };
const BP_STOP_RADIUS_M = 5;
const BP_STOP_SPEED_KMH = 6;

/**
 * The staged COCKPIT STIMULUS (kind "telltaleStimulus" — stimulus + measurement
 * only, contracts.ts): at the trigger the director lights the red engine lamp
 * (the breakdown cue). The runner stages NO actor and emits ZERO SimTick
 * events, so nothing it does can convict the player: the graded contract lives
 * entirely in this template's objectives (the emergency-lane low-speed
 * reachZone below = the pull-over-and-stop completion) plus the SHIPPED
 * EMERGENCY_LANE_DRIVING / HARSH_BRAKING_NO_CAUSE codes the mistake demos trip
 * on the driver's OWN channels. `ignoreBeyondM` 200 sits comfortably past the
 * stop (y 378 is 128 m past the trigger), so a compliant pull-over always
 * resolves "yielded" first; a rider who keeps going records
 * "passedWithoutStopping".
 */
const SC_HZ_BREAKDOWN_TELLTALE: TelltaleStimulusSpec = {
  id: "sc-hzbp-lamp",
  kind: "telltaleStimulus",
  libraryEventId: "ev-emergency-stop-triangle",
  lamp: "temperature",
  trigger: BP_TRIGGER,
  triggerDistM: BP_TRIGGER_DIST_M,
  stop: BP_STOP, // single truth with the graded emergency-lane stop objective
  stopRadiusM: BP_STOP_RADIUS_M,
  stopSpeedKmh: BP_STOP_SPEED_KMH,
  ignoreBeyondM: 200,
};

/**
 * PK-10 — обезопасяване при принудително спиране на магистрала (ЗДвП чл. 58,
 * т. 3: движение по лентата за принудително спиране е забранено, освен при
 * принудително спиране; чл. 97: задълженията при повреда — извеждане на
 * автомобила извън платното за движение, аварийни светлини, светлоотразителна
 * жилетка и триъгълник).
 *
 * THE TEACHING CLAIM: when the car breaks down at speed, the ONLY correct move
 * is the disciplined pull-off — signal, ease across to the emergency lane in
 * one predictable diagonal, stop as far right as possible, engine off. The two
 * wrong ways are the two mistakes the road punishes:
 *   - „Каране по аварийната лента до изхода" — instead of STOPPING, the driver
 *     keeps rolling down the emergency lane toward the next exit: sustained
 *     travel in laneId 0 grades EXACTLY EMERGENCY_LANE_DRIVING (чл. 58, т. 3 —
 *     the lane is the corridor of the ambulance and of the car already stopped
 *     ahead, never a bypass);
 *   - „Спиране в активната лента при работеща кола" — panic instead of a plan:
 *     the driver stamps the brake and stops DEAD in the live travel lane. A
 *     dashboard lamp is not a forward cause in the harsh-brake ledger (it reads
 *     leadGap/signal/junction/crossing channels only, and the telltale runner
 *     emits zero events), so the mid-lane slam grades EXACTLY
 *     HARSH_BRAKING_NO_CAUSE — the honest read: a breakdown asks for a PLANNED
 *     pull-off at motorway speed, never an emergency stop in the flow.
 *
 * HONEST SCOPE CUT (documented for the final report): ev-emergency-stop-triangle
 * is 21 questions, and roughly half of it — жилетка преди слизане, триъгълник
 * на 100 m, изчакване зад мантинелата, обаждане на 112 — is an ON-FOOT
 * checklist with no cockpit mechanic. That half stays in the teach/debrief
 * card (чл. 97, чл. 101). This template owns the DRIVABLE half: the pull-off
 * arc and the lane discipline that the engine can actually grade.
 */
export const SC_HZ_BREAKDOWN_PULLOFF: ScenarioSpec = {
  id: "sc-hz-breakdown-pulloff",
  family: "hazards",
  tagsBg: ["магистрала", "авария", "аварийна лента", "принудително спиране", "обезопасяване", "спиране вдясно"],
  titleBg: "Авария на магистралата — протоколът",
  objectiveBg:
    "При повреда на магистрала: мигач, плавно до аварийната лента, спри максимално вдясно и не се движи по нея нито метър повече от нужното — лентата за принудително спиране е коридорът на помощта, не байпас до изхода.",
  archetypeIds: ["PK-10", "SN-05"],
  conceptIds: [
    "c-emergency-lane-breakdown",
    "c-motorway-prohibitions",
    "c-motorway-rules",
    "c-technical-condition",
  ],
  map: {
    archetype: "motorway-segment",
    // Reuses the committed mw-v1 map; its meta.scenario.params, mirrored here
    // for provenance (gen_motorway.mjs).
    params: { lengthM: 1000, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Магистрала, две ленти за движение и аварийна лента вдясно. Потегли и се установи в дясната лента за движение — около 90–95 км/ч." },
    { n: 2, textBg: "По време на движение на таблото светва червената лампа за налягане на маслото — двигателят отказва. Не бързай да реагираш рязко: имаш време за план." },
    { n: 3, textBg: "Провери огледалото, пусни десен мигач и започни плавно да намаляваш още в лентата за движение — предвидимо за движещите се зад теб." },
    { n: 4, textBg: "Прекоси плавно в аварийната лента в едно движение и спри максимално вдясно. Аварийната лента е само за принудително спиране — по нея не се кара до изхода." },
    { n: 5, textBg: "Спри плътно вдясно и угаси двигателя. Оттук нататък протоколът е пеша: аварийни светлини, жилетка ПРЕДИ да слезеш, триъгълник на 100 м зад колата, изчакване зад мантинелата и обаждане на 112." },
  ],
  success: [
    {
      id: "sc-hzbp-approach",
      titleBg: "Мини участъка с разрешена скорост",
      // Right-lane checkpoint BEFORE the trigger (y 200 < 250) — the objectives
      // complete in order, so the pull-off stop below is graded only on the far
      // side of the stimulus. Limit is 140; 130 keeps the gate lawful without
      // forcing a crawl.
      params: { kind: "reachZone", x: BP_X_CRUISE, y: 200, radiusM: 12, maxSpeedKmh: 130 },
    },
    {
      id: "sc-hzbp-stop",
      titleBg: "Спри плътно вдясно в аварийната лента",
      // THE objective (the sc-vp-telltale / pk-smooth-stop discipline):
      // completable ONLY at near-stop speed at the emergency-lane halt point,
      // 128 m PAST the stimulus trigger. A driver who KEEPS ROLLING down the
      // emergency lane passes through it above 6 km/h and never satisfies it; a
      // driver who panic-stops in the travel lane is on x = 0, not x = 8.13.
      params: {
        kind: "reachZone",
        x: BP_STOP.x,
        y: BP_STOP.y,
        radiusM: BP_STOP_RADIUS_M,
        maxSpeedKmh: BP_STOP_SPEED_KMH,
      },
    },
  ],
  rubric: { parTimeSec: 50 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scHzBreakdownPulloff.ts; gates in traces/__tests__/
  // sc-hz-breakdown-pulloff-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-hz-breakdown-pulloff/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-hz-breakdown-pulloff/mistake-shoulder-drive.trace.json" },
      titleBg: "Каране по аварийната лента до изхода",
      whatWentWrongBg:
        "Двигателят отказа — и вместо да спре, водачът се настани в аварийната лента и я подкара като „своя“ до следващия изход. Аварийната лента не е байпас: тя е коридорът на линейката и мястото, където вече стои друга аварирала кола с хора около нея. Движението по лентата за принудително спиране е забранено (чл. 58, т. 3) — при повреда се спира в нея максимално вдясно, не се пътува по нея.",
      codeRefs: ["EMERGENCY_LANE_DRIVING"],
    },
    {
      traceRef: { path: "content/traces/sc-hz-breakdown-pulloff/mistake-lane-stop.trace.json" },
      titleBg: "Спиране в активната лента при работеща кола",
      whatWentWrongBg:
        "Лампата стресна водача и кракът се заби в спирачката още в лентата за движение — колата спря аварийно насред активната лента, при магистрална скорост зад нея. Точно това е грешният рефлекс: една лампа иска ПЛАН, не паника. При скоростите на магистралата спрял в лентата автомобил е предпоставка за верижен удар — правилното е плавно, предвидимо намаляване и излизане в аварийната лента, а чак там — спиране.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "При всяка повреда в движение на магистрала или скоростен път — спукана гума, отказал двигател, димяща предница, светнала червена лампа. Общото е, че трябва да махнеш колата от потока при скорости, при които спрелият в лентата не се прощава.",
    whyBg:
      "Аварийната лента съществува точно за този момент: мястото, където повредената кола се изтегля, и коридорът, по който линейката и пътната помощ стигат до нея. Затова движението по нея е забранено — кола, която я ползва като байпас, среща спрели автомобили, хора около тях и отломки с магистрална скорост и без време за реакция. Но самата аварийна лента е и правилният изход при повреда: влизаш в нея с мигач и плавно намаляване, спираш максимално вдясно и гасиш двигателя. Двете грешки са двете крайности — да останеш в потока (паническо спиране в активната лента, което кани удар отзад) и да тръгнеш по аварийната като по нормална лента. Спокойната процедура е между тях: предвиди, покажи намерението си, прекоси в едно движение и спри вдясно.",
    lawRef: "ЗДвП чл. 58, т. 3",
    examinerBg:
      "Изпитващият следи лентовата дисциплина и обезопасяването: при повреда очаква навременно забелязване, огледало и десен мигач, плавно намаляване в лентата за движение и извеждане на автомобила в аварийната лента максимално вдясно. Движение по аварийната лента е опасна грешка (с мигач или без), а рязкото спиране насред активната лента е предпоставка за ПТП.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — нощ: чл. 97's night duties (жилетка + триъгълник видимост) carry into
    // the debrief card. The conditions/RENDER axis only — NO physics opt-in (the
    // pull-off ghost is dry-tuned; ADR-006 stage 4a), and the recorded day trace
    // is never replayed at this rung (bot-completion drives L3; the trace gate
    // runs the default rule config), so no HEADLIGHTS_OFF_AT_NIGHT can false-fire.
    { level: 5, conditions: { night: true } },
  ],
  staged: [SC_HZ_BREAKDOWN_TELLTALE],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The hazards templates of this file, in catalog order (registered in
 *  templates.ts by the integration pass). */
export const SCENARIO_TEMPLATES_HAZARDS2: readonly ScenarioSpec[] = [
  SC_HZ_EMERGENCY_STOP,
  SC_HZ_BRAKE_DONT_SWERVE,
  SC_HZ_ACCIDENT_SCENE,
  SC_HZ_BREAKDOWN_PULLOFF,
];
