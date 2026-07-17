/**
 * Scenario templates — the EXAM-DRILLS family, first file: the „Лозенец" city
 * segment (doc 76 §2; the exam-drills chip has existed in types.ts with zero
 * members — this is its first tenant).
 *
 * DATA ONLY (the templates.ts law): every coordinate below is a denormalized
 * literal pinned to the committed d2-v1.json, so nothing loads world JSON at
 * runtime. The exam-districts battery
 * (world/__tests__/exam-districts.test.ts) asserts the pinned topology, and
 * the trace gate (traces/__tests__/sc-ed-d2-city-run-traces.test.ts) replays
 * the three drives through the production stack.
 *
 * WHY d2-v1 (ADR-007 — the second exam district): Лозенец shipped as a fully
 * proven district with ZERO templates driving it. This drill is the first, and
 * it is deliberately an EXAM-DRILL rather than a single-fault micro-lesson:
 * the whole point of a real-topology district is the thing a micro-map cannot
 * give — a continuous ~3-minute run where nothing is staged for you, the
 * signals are on the map's own clock, and the pass mark is a clean sheet.
 *
 * THE SEGMENT (all бул. Драган Цанков, SE → NW, ~971 m of curb lane):
 *   - signal cluster n1286733599 (ns group) — the map's natural FNV-1a offset
 *     is 0, so its ns green [0,20) of the 50 s cycle covers the ~t=5.8 arrival:
 *     an exam pass, no courtesy stop;
 *   - signal cluster n152073034 (ew group, natural offset 40) — ew is RED
 *     until t=35 and the segment reaches its line at ~t=32.9. The red is NOT
 *     staged: it is what Лозенец shows a car that leaves the SE end at t=0.
 *     That is why the shadow and the red-light demo share one world and differ
 *     only in the driver's choice — the honest version of „преминаване на
 *     червено";
 *   - the keep-right boulevard stretch (4–5 lanes, limit 50) between them;
 *   - the zebra n331946209 — a MID-BLOCK marked crossing (a degree-2 node, no
 *     junction of its own), i.e. the one place on the route where no lamp
 *     protects the pedestrian and чл. 119 is the only rule in the room.
 *
 * Route choice also keeps clear of the d2 exam-bank variant routes: the bank
 * ships no template on this district at all today, so nothing is disturbed.
 */

import type { PedestrianDartOutSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

/** The mid-block zebra on бул. Драган Цанков (d2-v1 crossing n331946209). */
const ZEBRA = { x: 138.3, y: 205.78 } as const;
/** The drive line's heading at the zebra, deg (cw-from-north). */
const ZEBRA_HEADING = 317.8;

// ---------------------------------------------------------------------------
// sc-ed-d2-city-run — „Изпитен сегмент „Лозенец" — градско каране" on d2-v1
// ---------------------------------------------------------------------------

/**
 * The staged encounter: a pedestrian steps off the player's LEFT curb onto the
 * mid-block zebra n331946209 and walks across the 32.5 m carriageway (the
 * scaled 4-lane width: lanesPerDir 2 × LANE_WIDTH_M 8.125 × 2 banks), released
 * when the player is 60 m out — i.e. as the approach settles to the crossing
 * cap. Geometry: `start` sits 1.6 m off the carriageway edge on the left
 * (17.85 m from the centerline along the walk), `dir` is the road normal, so
 * her s = 17.85 is the centerline and s = 30.04 is the player's lane center.
 *
 * Pacing (2.6 m/s — a normal walk carried through the 2.5× PERCEPTUAL_ROAD_SCALE
 * the carriageway is drawn at, the same honesty the road width itself gets):
 *   - on the carriageway from +0.6 s to +13.1 s after release;
 *   - a lawful 28 km/h approach reaches the crossing ~7.7 s after release, so
 *     she is ~20 m in — PAST the centerline but still ~10 m clear of the
 *     player's lane: the „непропускане" demo is a refusal to yield, never a
 *     contact (the sc-pe-jaywalker precedent);
 *   - a drive that actually waits her out passes an EMPTY crossing.
 * She is lawful throughout — a pedestrian on a mid-block zebra has чл. 119
 * outright — which is what keeps the fault squarely on the driver.
 */
export const SC_ED_D2_CITY_RUN_PED: PedestrianDartOutSpec = {
  id: "sc-edcr-ped",
  kind: "pedestrianDartOut",
  crossingId: "n331946209",
  crossing: { x: ZEBRA.x, y: ZEBRA.y },
  // ZEBRA + 17.85 m along the LEFT normal of travel (bearing 227.8°).
  start: { x: 125.08, y: 193.79 },
  // The RIGHT normal of travel (bearing 47.8°) — she walks toward the player.
  dir: { x: 0.7408, y: 0.6717 },
  speedMps: 2.6,
  travelM: 39.7, // 1.6 m verge → 32.5 m carriageway → 5.6 m walk-out
  roadFromM: 1.6,
  roadToM: 34.1,
  triggerDistM: 60,
  minTriggerSpeedKmh: 10,
};

export const SC_ED_D2_CITY_RUN: ScenarioSpec = {
  id: "sc-ed-d2-city-run",
  family: "exam-drills",
  tagsBg: ["изпит", "градско каране", "светофар", "пешеходна пътека", "дясна лента", "Лозенец"],
  titleBg: "Изпитен сегмент „Лозенец“ — градско каране",
  // ~2–3 минути, not the backlog's flat „~3-минутен": the C1 shadow drives the
  // 971 m clean in 111 s, and a student's run stretches toward 3 minutes with
  // the L4 cold start and the luck of the second signal's 50 s cycle (arrive
  // just after ew turns red and the wait alone is 27 s). Honest band, not a
  // flattering round number — the student reads this line.
  objectiveBg:
    "Премини ~2–3-минутен изпитен сегмент по реалната топология на Лозенец: светофари, пътека и дясна лента, без нито една отсъдена грешка.",
  archetypeIds: ["JU-05", "JU-13", "PE-02", "OV-11"],
  conceptIds: [
    "c-traffic-light-signals",
    "c-light-junction",
    "c-junction-approach",
    "c-crosswalk-yield",
    "c-pedestrian-rights-duties",
    "c-lane-choice",
    "c-speed-limits",
  ],
  map: {
    archetype: "x-junction",
    // d2-v1 has NO meta.scenario.params: it is not a generator recipe but a
    // committed OSM cut (ADR-007 reproducibility — the snapshot lives at
    // tools/maps/data/d2-lozenets.json). These mirror meta.source/meta.stats.
    params: {
      pipeline: "tools/maps/build_district_d2.mjs",
      district: "lozenets",
      osmDataTimestamp: "2026-07-16T22:54:45Z",
      roadKm: 21.7,
      signalizedIntersections: 9,
      segmentM: 971,
      segmentRoad: "бул. Драган Цанков",
    },
    districtId: "d2-v1",
  },
  start: {
    // The boulevard's SE end (e601140178.0's outer node, curb lane) — d2's five
    // spawnPoints all sit on quiet streets far from this arterial, so the
    // segment authors its own pose (validate.ts: position + headingDeg).
    position: { x: 795.08, y: -359.73 },
    headingDeg: 327.6,
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни по бул. „Драган Цанков“ на северозапад. Това е цял изпитен сегмент — карай непрекъснато, както на истински изпит.",
    },
    {
      n: 2,
      textBg:
        "Първият светофар е зелен: премини кръстовището с равномерна скорост, без излишно спиране. Зеленото не е покана за ускоряване.",
    },
    {
      n: 3,
      textBg:
        "Вторият светофар е ЧЕРВЕН. Спри плавно пред стоп-линията, изчакай зеления сигнал и потегли веднага щом светне — без пълзене напред и без бавене.",
    },
    {
      n: 4,
      textBg:
        "По булеварда дръж ДЯСНАТА лента и 50 км/ч. Лявата лента не е за движение „по принцип“ — тя е за изпреварване и завой наляво.",
    },
    {
      n: 5,
      textBg:
        "Преди пешеходната пътека намали под 30 км/ч: тя е в средата на участъка и никакъв светофар не пази пешеходеца там.",
    },
    {
      n: 6,
      textBg:
        "Пешеходец слиза на платното отляво — спри пред пътеката и го изчакай да я освободи напълно. Чак тогава довърши сегмента.",
    },
  ],
  success: [
    {
      id: "sc-edcr-signal-1",
      titleBg: "Премини първото светофарно кръстовище",
      // Curb lane past the n1286733599 complex (route s≈120).
      params: { kind: "reachZone", x: 722.14, y: -265.02, radiusM: 12 },
    },
    {
      id: "sc-edcr-signal-2",
      titleBg: "Премини второто светофарно кръстовище по сигнала",
      // Curb lane past the n152073034 complex (route s≈400).
      params: { kind: "reachZone", x: 481.38, y: -123.71, radiusM: 12 },
    },
    {
      id: "sc-edcr-keep-right",
      titleBg: "Дръж дясната лента по булеварда",
      // Curb-lane center mid-stretch (route s≈700). radiusM 7 < the 8.125 m
      // lane pitch, so drifting to the middle lane misses the gate.
      params: { kind: "reachZone", x: 264.99, y: 82.11, radiusM: 7 },
    },
    {
      id: "sc-edcr-finish",
      titleBg: "Довърши сегмента след пешеходната пътека",
      // Past the zebra, at the segment's NW end (route s≈965).
      params: { kind: "reachZone", x: 87.3, y: 278.69, radiusM: 12 },
    },
  ],
  // parTime only: the rubric's observation channel is not wired to a glance
  // feed yet (rubric.ts scores it measured:false), so authoring moments here
  // would be a promise the pipeline cannot keep. Par 150 s = the student band
  // above, not the shadow's 111 s — it is informational, never a penalty.
  rubric: { parTimeSec: 150 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scEdD2CityRun.ts; the §5 gate (shadow replays ZERO violations) and
  // the §9 stage-5 code asserts run in
  // traces/__tests__/sc-ed-d2-city-run-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ed-d2-city-run/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ed-d2-city-run/mistake-red-light.trace.json" },
      titleBg: "Преминаване на червено по маршрута",
      whatWentWrongBg:
        "Същият маршрут, същият светофар — но колата не спря. „Ще успея да мина“ е най-скъпата мисъл на изпита: преминаването на червен сигнал е опасна грешка и прекратява изпита на място, независимо колко чисто е карано дотам. Червеното не се преценява по това дали има някого насреща — то се спазва.",
      codeRefs: ["RED_LIGHT_CROSSED"],
    },
    {
      traceRef: { path: "content/traces/sc-ed-d2-city-run/mistake-no-yield.trace.json" },
      titleBg: "Непропуснат пешеходец в средата на сегмента",
      whatWentWrongBg:
        "Скоростта беше премерена — под 30 км/ч — и точно затова грешката личи ясно: колата ВИДЯ пешеходеца на платното и въпреки това не спря, а се размина с него. Пътеката в средата на участъка няма светофар: там пешеходецът е защитен единствено от чл. 119 и от твоята спирачка. Премерената скорост не е извинение да не пропуснеш — тя е само причината да можеш.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "Винаги, щом излезеш на истинска градска улица: изпитният маршрут в София не е поредица от отделни упражнения, а един непрекъснат участък, в който светофарите, пътеките и лентите идват едно след друго и не те чакат да си починеш между тях.",
    whyBg:
      "Отделните умения се учат поотделно, но изпитът — и улицата — ги искат наведнъж. Точно в прехода се късат кандидатите: спрели са коректно на червено, а после са забравили пътеката след кръстовището; държали са лентата, а са изпуснали скоростта. Сегментът тренира издръжливостта на вниманието: три минути, в които нито един момент не е „почивка“, защото грешката не пита колко добре е било преди нея.",
    lawRef: "Наредба № 38; ЗДвП чл. 21, чл. 119",
    examinerBg:
      "Изпитващият гледа целия участък като едно цяло: равномерно преминаване на зеления сигнал, спиране ПРЕД стоп-линията на червено и потегляне без бавене, дясна лента по булеварда, скорост под 30 км/ч покрай пътеката и реално спиране при пешеходец на платното. Преминаване на червено и непропускане на пешеходец са опасни грешки — всяка от тях сама по себе си прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    // L4: изпитни условия — студен старт по протокола.
    { level: 4, vehicleStart: "cold" },
    // L5: дъжд + нощ + жив околен трафик по реалната мрежа на Лозенец.
    // NO physics.wetGrip: the authored ghost envelope is dry-tuned (ADR-006
    // stage 4a — only a template that AUTHORS the field gets reduced grip).
    {
      level: 5,
      conditions: { weather: "rain", night: true },
      traffic: { vehicleCount: 8, pedestrianCount: 4, anchorRadiusM: 400 },
    },
  ],
  staged: [SC_ED_D2_CITY_RUN_PED],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The EXAM-DRILLS family templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_EXAM: readonly ScenarioSpec[] = [SC_ED_D2_CITY_RUN];
