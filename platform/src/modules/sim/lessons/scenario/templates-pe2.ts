/**
 * Scenario templates — the PEDESTRIAN family, wave 1 (doc 72 §6 „Family PE"),
 * DATA ONLY in the templates.ts mold (coordinates denormalized from the
 * committed district files so nothing loads world JSON at runtime; the
 * batteries assert every pinned value against the generated maps):
 *
 *  - sc-pe-school-patrol  „Училищна пътека със стоп-палка"  (PE-07 + PE-02,
 *    pe-school-v1 — the 50 → 30 school zone with a zebra deep inside it)
 *
 * PE-07 („Училищна зона") was 🟡 PARTIAL in doc 72 for exactly one reason:
 * „SPEEDING_* grades automatically once maxSpeedKmh reflects the zone; NEW:
 * speed-zone map layer". tools/maps/gen_pe_school.mjs IS that layer for this
 * street — the zone segment posts its own `maxspeed` 30, so the shipped
 * speeding detectors grade the school zone with no engine change at all.
 *
 * THE TWO-ACTOR SPLIT (the honest design — read before editing):
 *  - the PATROL WARDEN is a `policeStop` staged spec: the shipped stopSignal
 *    pose (raised arm + hi-vis vest, ADR-001 fictional) standing at the curb.
 *    That runner is SCENERY + MEASUREMENT ONLY by contract — it emits ZERO
 *    SimTick events, so the paddle can never itself convict (the A12 bias: an
 *    unmodelled duty must not grade). Its outcome channel records „yielded"
 *    when the driver rests at the halt point, „passedWithoutStopping" when the
 *    raised paddle is driven past — the debrief's proof, not the grade.
 *  - the CHILD GROUP is a `pedestrianDartOut` at pes-x-1: the LAW's duty
 *    (чл. 119 — пропусни стъпилите на пътеката) and the whole graded contract.
 *    Driving past the raised paddle therefore grades PEDESTRIAN_NOT_YIELDED
 *    honestly: the people on the zebra are the reason the paddle is up.
 * So „подминаване на вдигната стоп-палка" convicts through the pedestrians it
 * endangers, never through a paddle detector that does not exist.
 *
 * HONEST GAP (see gen_pe_school.mjs): the А19 „Деца" plate has no SignKind and
 * no GLB in the shipped kit, so the zone's visual anchor is the school block
 * + the automatic В26 entry post. Render-only — grading reads `maxspeed` and
 * the crossing, never a sign placement.
 */

import type { PedestrianDartOutSpec, PoliceStopSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from pe-school-v1 by value — the L7
// pattern; pe-school-districts.test.ts asserts the copies match the map)
// ---------------------------------------------------------------------------

/** Right-lane center of the 1-lane-per-direction street. */
const LANE_2 = 4.06;
/** The 50 → 30 school-zone entry (pes-n-mid). */
const ZONE_ENTRY_Y = 140;
/** The zebra pes-x-1, 110 m inside the zone. */
const CROSSING_Y = 250;
/** West curb: half-carriageway 8.125 + 0.4 curb + 1.2 stand-back. */
const CURB_X = -9.72;
/** Road-occupancy span along the dart path (west edge → east edge across the
 *  16.25 m carriageway): 9.72 − 8.125 ≈ 1.6 m in, 9.72 + 8.125 ≈ 17.85 m out. */
const ROAD_FROM_M = 1.6;
const ROAD_TO_M = 17.85;
/** Curb → across the carriageway → a few metres of east walk-out. */
const TRAVEL_M = 23.45;
/** The compliant halt: 6 m short of the zebra, the PE-family stop distance. */
const HALT_Y = CROSSING_Y - 6;

// ---------------------------------------------------------------------------
// sc-pe-school-patrol — „Училищна пътека със стоп-палка" (PE-07 + PE-02)
// ---------------------------------------------------------------------------

/**
 * The PATROL WARDEN at the west curb beside the zebra (kind "policeStop" —
 * scenery + measurement only, see contracts.ts): stands at (−9.72, 246)
 * facing the roadway (east), right arm raised — the стоп-палка pose, hi-vis
 * vest, fictional per ADR-001. The runner emits ZERO SimTick events: the
 * graded duty lives in the child group below and in this template's
 * objectives, so no paddle detector exists to false-fire (A12).
 *
 * `stop` is single truth with the graded halt objective: the driver who stops
 * for the paddle rests exactly where the чл. 119 duty puts them — short of the
 * crossing. passBeyondM 25 = the warden falls a quarter-block behind without a
 * compliant stop → outcome "passedWithoutStopping" (the debrief's receipt).
 */
const SCHOOL_WARDEN: PoliceStopSpec = {
  id: "sc-pesp-warden",
  kind: "policeStop",
  libraryEventId: "ev-ped-crossing-marked",
  officer: { x: CURB_X, y: CROSSING_Y - 4 },
  facing: { x: 1, y: 0 }, // toward the roadway (east)
  stop: { x: LANE_2, y: HALT_Y }, // single truth with sc-pesp-halt below
  stopRadiusM: 4,
  stopSpeedKmh: 4,
  passBeyondM: 25,
};

/**
 * The CHILD GROUP at pes-x-1 (0, 250): steps off the WEST curb at 1.1 m/s (a
 * school group's shuffle — slower than the adult 1.4 tier, so the occupancy
 * lasts long enough to be a real wait) once the player closes within ~40 m.
 *
 * triggerDistM 40 is deliberately INSIDE the crossing zone (which arms at
 * ~35 m… the trigger fires a hair before it) and well PAST the speed-only
 * window the map guarantees (y 140..215): that is what lets „бърз подход"
 * grade EXACTLY SPEEDING_OVER_LIMIT — the speeding episode completes and
 * resets before any child is ever seen, so no crossing code can pile on.
 */
const SCHOOL_CHILDREN: PedestrianDartOutSpec = {
  id: "sc-pesp-children",
  kind: "pedestrianDartOut",
  crossingId: "pes-x-1",
  crossing: { x: 0, y: CROSSING_Y },
  start: { x: CURB_X, y: CROSSING_Y },
  dir: { x: 1, y: 0 },
  speedMps: 1.1,
  travelM: TRAVEL_M,
  roadFromM: ROAD_FROM_M,
  roadToM: ROAD_TO_M,
  triggerDistM: 40,
  minTriggerSpeedKmh: 8,
};

/** PE-07 + PE-02 — училищна зона със стоп-палка (ЗДвП чл. 119: пропусни
 *  стъпилите на пътеката пешеходци; чл. 62–63: режимът на зоната — в
 *  училищната зона ограничението е 30 и се кара с готовност за спиране). */
export const SC_PE_SCHOOL_PATROL: ScenarioSpec = {
  id: "sc-pe-school-patrol",
  family: "pedestrians",
  tagsBg: ["пешеходци", "училищна зона", "деца", "пешеходна пътека", "градско каране"],
  titleBg: "Училищна пътека със стоп-палка",
  objectiveBg:
    "Спри напълно, когато отговорникът на пътеката вдигне стоп-палката, и потегли чак когато групата е освободила платното и палката е свалена.",
  archetypeIds: ["PE-07", "PE-02"],
  conceptIds: [
    "c-crosswalk-yield",
    "c-children-on-road",
    "c-child-safety",
    "c-speed-signs-zone",
    "c-pedestrian-rights-duties",
  ],
  map: {
    archetype: "zebra-block",
    // The generator recipe — mirrored in pe-school-v1.json meta.scenario.params
    // (tools/maps/gen_pe_school.mjs).
    params: { crossings: 1, signalized: "no", approachM: 140, zoneCrossingM: 110, zoneKmh: 30 },
    districtId: "pe-school-v1",
  },
  start: {
    spawnPointId: "pes-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли и се движи спокойно в своята лента — улицата пред теб минава край училище." },
    {
      n: 2,
      textBg:
        "На входа на училищната зона ограничението пада на 30. Свали скоростта ПРЕДИ знака, не след него — в зона 30 дръж 25–28 км/ч.",
    },
    {
      n: 3,
      textBg:
        "Виж отговорника на пътеката до бордюра. Вдигне ли стоп-палката, тя е разпореждане — не е молба.",
    },
    {
      n: 4,
      textBg: "Спри напълно на няколко метра преди пътеката — не навлизай в нея и не пълзи напред.",
    },
    {
      n: 5,
      textBg:
        "Изчакай ЦЯЛАТА група да освободи платното, включително твоята лента. Децата не вървят в права линия — едно може да се върне.",
    },
    { n: 6, textBg: "Огледай се и потегли плавно едва когато пътеката е чиста и палката е свалена." },
  ],
  success: [
    {
      id: "sc-pesp-zone",
      titleBg: "Влез в училищната зона със скорост на зоната",
      // 30 m past the entry, at/below 30: the зона-30 regime, graded as a gate.
      params: { kind: "reachZone", x: LANE_2, y: ZONE_ENTRY_Y + 30, radiusM: 12, maxSpeedKmh: 30 },
    },
    {
      id: "sc-pesp-halt",
      titleBg: "Спри пред пътеката по сигнала на стоп-палката",
      // Single truth with SCHOOL_WARDEN.stop — the compliant halt IS the duty.
      params: { kind: "reachZone", x: LANE_2, y: HALT_Y, radiusM: 4, maxSpeedKmh: 5 },
    },
    {
      id: "sc-pesp-clear",
      titleBg: "Премини, след като групата е освободила платното",
      params: { kind: "reachZone", x: LANE_2, y: CROSSING_Y + 40, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 95 },
  shadow: { path: "content/traces/sc-pe-school-patrol/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pe-school-patrol/mistake-ignored-paddle.trace.json" },
      titleBg: "Подминаване на вдигната стоп-палка",
      whatWentWrongBg:
        "Палката беше вдигната, децата вече бяха стъпили на платното — а колата продължи. Стоп-палката не е учтива молба: тя се вдига именно защото хора са на пътеката. Затова грешката се отсъжда като непропускане на пешеходец по чл. 119 — най-тежката грешка на изпита.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-pe-school-patrol/mistake-fast-approach.trace.json" },
      titleBg: "Бърз подход към зоната на училището",
      whatWentWrongBg:
        "Водачът влезе в училищната зона, без да свали скоростта — държеше близо 38 км/ч там, където знакът казва 30. Спря коректно за децата после, но е късно: в зона 30 резервът за спиране е целият смисъл на ограничението, а децата излизат без да гледат.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "Пред всяко училище в учебен ден: зона 30, отговорник на пътеката със стоп-палка и групи деца, които пресичат. Палката се вдига, докато групата е на платното, и се сваля, когато го освободи.",
    whyBg:
      "Детето не е нисък възрастен: то не преценява скорост и разстояние, тръгва внезапно и се връща след изпусната топка. Затова законът сваля скоростта на 30 — от 30 км/ч спираш за около 13 м, от 50 км/ч — за около 27 м, а разликата е точно ширината на пътеката. Стоп-палката е последната предпазна мрежа, когато детето вече е на платното.",
    lawRef: "ЗДвП чл. 119; чл. 62–63",
    examinerBg:
      "Изпитващият очаква видимо сваляне на скоростта ПРЕДИ знака за зоната, пълно спиране на сигнала на отговорника и потегляне едва след като платното е чисто. Превишаване с над 10 км/ч в зона 30 е опасна грешка; непропускането на пешеходец на пътеката прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд: същият дълг, по-дълъг спирачен път и по-лоша видимост към
    // бордюра. Physics stays DRY on purpose: the authored ghost envelopes are
    // dry-tuned (the doc 76 §7 rule — only a template that AUTHORS `physics`
    // gets reduced grip).
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [SCHOOL_WARDEN, SCHOOL_CHILDREN],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The PE-family wave-1 templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_PE2: readonly ScenarioSpec[] = [SC_PE_SCHOOL_PATROL];
