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
 *  - sc-hz-emergency-stop  „Екстрено спиране"  (PE-04)
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

import type { PedestrianDartOutSpec } from "../../contracts";
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

/** The wave-3 hazards templates, in catalog order (registered in templates.ts
 *  by the integration pass). */
export const SCENARIO_TEMPLATES_HAZARDS2: readonly ScenarioSpec[] = [SC_HZ_EMERGENCY_STOP];
