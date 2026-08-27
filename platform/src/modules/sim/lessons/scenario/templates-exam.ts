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

import type {
  OncomingLeftTurnSpec,
  PedestrianDartOutSpec,
  PriorityFromRightSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Wet } from "./complications";

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
        "Тръгни по бул. „Драган Цанков“ на северозапад. Това е цял изпитен сегмент — карай непрекъснато, както на истински изпит. По тъмно или в дъжд включи първо късите светлини (чл. 70): на булевард с колони и пешеходци всички те четат по фаровете и габаритите, а изпитващият чака да ги включиш ПРЕДИ да потеглиш, не след първата забележка.",
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

// ---------------------------------------------------------------------------
// sc-ed-d2-priority-run — „Изпитен сегмент „Лозенец" — предимства" on d2-v1
// ---------------------------------------------------------------------------

/**
 * WHY THIS CHAIN AND NO OTHER — and why the beats run left-turn-BEFORE-equal
 * rather than the other way round. This is the RHR/staging debug pass the
 * backlog asks for, and it returned exactly one answer:
 *
 *  - d2-v1 derives only THREE Б2 stop lines from the whole 21.7 km cut.
 *    n3790209881 dead-ends at the map edge (2 reachable nodes); n2952140105 is
 *    1163 m of one-way ramp from the nearest two-way junction. Only
 *    n2945503673 reaches real two-way topology, over Стоян Михайловски.
 *  - The lane graph EXCLUDES service roads (traffic/types.ts
 *    excludedRoadClasses), so a staged actor cannot exist on one. That kills
 *    the otherwise-perfect equal junction n348203930 — the route passes
 *    straight through it and it IS uncontrolled, but its only cross arm
 *    (e31296967.0) is class „service", so the car from the right could never
 *    be staged there. The route keeps it as an honest uncontrolled node and
 *    stages the right-hand conflict at n248572866 instead, where Галичица
 *    (residential) can actually carry the car.
 *  - The left turn therefore has to come FIRST: the only left turn on the
 *    corridor with a stageable opposing approach is n4547529959 (the пл.
 *    Велчова завера arm is tertiary), and it sits 267 m BEFORE n248572866.
 *    Turning left at n253549280 onto Васил Кирков instead would strand the
 *    route off Златовръх and lose the right-hand conflict entirely.
 *
 * So the objective states the chain in the order the street imposes. The
 * exam-districts battery pins every claim above.
 *
 * The three graded junctions, in route order:
 *   1. n2945503673 — Б2 + stop line (the ONLY stop sign on the route);
 *   2. n4547529959 — the left turn onto Златовръх across the oncoming;
 *   3. n248572866 — uncontrolled, car from the RIGHT off Галичица ⇒ чл. 37.
 */

/**
 * Conflict 1 — the ONCOMING car at n4547529959, graded by the runtime's N1
 * left-turn tracker. It comes down the пл. Велчова завера arm (e856821051.0,
 * tertiary — the player's opposing approach at this square: it arrives on
 * ~115° against the player's ~326°) and continues straight onto Стоян
 * Михайловски, i.e. across the player's left turn onto Златовръх.
 *
 * The path starts a node EARLIER than the junction's own arm on purpose:
 * e856821051.0 is only 33 m long, far too short to hold an actor 110 m back
 * and let it reach cruise. Prepending e20302341.0 (166 m of the same
 * one-way square) puts the junction at ~199 m of path arc, so the −110 m hold
 * has real road behind it. gapSec 11 keeps the arrival sync's desired
 * stand-off beyond that hold through the approach, so the car genuinely waits
 * instead of being quietly walked forward (the jx-equal measurement).
 */
export const SC_ED_D2_PRIORITY_ONCOMING: OncomingLeftTurnSpec = {
  id: "sc-edpr-oncoming",
  kind: "oncomingLeftTurn",
  libraryEventId: "JU-10",
  junction: { nodeId: "n4547529959", x: -650.5, y: 68.9 },
  actor: {
    pathNodes: ["n1116876709", "n11026531614", "n4547529959", "n6309210293"],
    hold: { nodeIndex: 2, offsetM: -110 },
    cruiseSpeedMps: 7,
    colorIndex: 2,
  },
  junctionNodeIndex: 2,
  armDistM: 60,
  gapSec: 11,
  clearSpeedMps: 10,
};

/**
 * Conflict 2 — the car from the RIGHT at the equal junction n248572866: it
 * comes east along Галичица (residential, one-way, 190 m of run-up) and turns
 * left across the player's southbound Златовръх lane, so the conflict is a
 * genuine crossing of the player's nose rather than a merge ahead of it.
 * junctionControl "uncontrolled": the runtime's own right-hand-rule tracker
 * adjudicates (FAILED_TO_YIELD / YIELDED_TO_PRIORITY) and emits its own
 * commendation on leaving the junction — no orchestrator help needed.
 *
 * lineDistM 20 matches the shadow's yield pose, which sits OUTSIDE the 18 m
 * RHR conviction core, so a student resting there while the car crosses is
 * structurally innocent (the jx-equal precedent). armDistM 55 arms it 174 m
 * after the left-turn conflict has resolved — one teach card at a time.
 */
export const SC_ED_D2_PRIORITY_RIGHT: PriorityFromRightSpec = {
  id: "sc-edpr-right",
  kind: "priorityFromRight",
  libraryEventId: "JU-01",
  junction: { nodeId: "n248572866", x: -725.4, y: -190.3 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["n1699496997", "n248572866", "n253549280"],
    hold: { nodeIndex: 1, offsetM: -80 },
    cruiseSpeedMps: 7,
  },
  junctionNodeIndex: 1,
  armDistM: 55,
  leadSec: -3.5,
  lineDistM: 20,
  clearSpeedMps: 10,
};

export const SC_ED_D2_PRIORITY_RUN: ScenarioSpec = {
  id: "sc-ed-d2-priority-run",
  family: "exam-drills",
  tagsBg: ["изпит", "предимство", "Б2", "равнозначно кръстовище", "ляв завой", "Лозенец"],
  titleBg: "Изпитен сегмент „Лозенец“ — предимства",
  // The backlog phrased the chain „Б2, равнозначно с дясно и ляв завой"; the
  // street imposes the last two the other way round (see the WHY block above),
  // and the objective a student reads has to match the drive they will make.
  objectiveBg:
    "Верига от три кръстовища по реалната топология: Б2 със стоп-линия, ляв завой срещу насрещен и равнозначно кръстовище с кола отдясно — премини я по изпитния протокол.",
  archetypeIds: ["JU-01", "JU-10", "JU-23", "JU-05"],
  conceptIds: [
    "c-give-way-stop-behavior",
    "c-right-hand-rule",
    "c-junction-approach",
    "c-priority-signs",
    "c-driver-signals",
    "c-lane-choice",
  ],
  map: {
    archetype: "x-junction",
    // d2-v1 has NO meta.scenario.params: it is a committed OSM cut, not a
    // generator recipe (ADR-007). These mirror meta.source/meta.stats.
    params: {
      pipeline: "tools/maps/build_district_d2.mjs",
      district: "lozenets",
      osmDataTimestamp: "2026-07-16T22:54:45Z",
      roadKm: 21.7,
      segmentM: 927,
      segmentRoad: "Пейо К. Яворов → Стоян Михайловски → Златовръх",
      stopSignJunctions: 1,
      equalJunctions: 2,
    },
    districtId: "d2-v1",
  },
  start: {
    // The slip road's outer node (e171919146.0's from-node), its only lane —
    // a 1-lane oneway bank centers on the polyline, so the lane center IS the
    // geometry. d2's five spawnPoints all sit far from this ramp, so the
    // segment authors its own pose (validate.ts: position + headingDeg).
    position: { x: -243.96, y: 154.45 },
    headingDeg: 215.3,
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Тръгни по отбивката на юг-запад. Това е цял изпитен сегмент — карай непрекъснато, както на истински изпит. Вали ли, включи късите светлини още преди да потеглиш (чл. 70): на мокър асфалт кръстовищата се разчитат по чужди светлини, а колата без включени фарове е тъкмо тази, която насрещният не изчаква.",
    },
    {
      n: 2,
      textBg:
        "Напред е знак Б2 „Спри!“. Спри НАПЪЛНО пред стоп-линията — дори платното да изглежда празно.",
    },
    {
      n: 3,
      textBg:
        "След спирането огледай наляво-надясно-наляво и чак тогава потегли. Вторият поглед наляво е за колата, приближила, докато си гледал надясно.",
    },
    {
      n: 4,
      textBg:
        "Светофарът напред е зелен: премини равномерно и завий надясно по „Стоян Михайловски“ с мигач.",
    },
    {
      n: 5,
      textBg:
        "Преди левия завой към „Златовръх“ се престрой в лявата лента — първо огледало, после мигач, чак тогава маневрата.",
    },
    {
      n: 6,
      textBg:
        "На самия ляв завой изчакай насрещния да премине — с прави колела — и завий чак след него (чл. 37).",
    },
    {
      n: 7,
      textBg:
        "Последното кръстовище е РАВНОЗНАЧНО — няма знаци и няма светофар. Пропусни колата, която идва отдясно по „Галичица“.",
    },
  ],
  success: [
    {
      id: "sc-edpr-b2",
      // WAS «Спри напълно на знак Б2 и огледай» on a bare radius-12 disc — two
      // claims, neither measured. The disc carried NO speed cap, so it ticked
      // for any car that merely arrived: the committed rolling-stop demo rolls
      // the paint at 11.9 km/h and was certified as having stopped напълно
      // (s-w4-bot-completion said so in its own words). And it was authored at
      // route s ≈ 94 — measured 50 m PAST the paint it named, 23 m past node
      // n2945503673 — so „на знак Б2" pointed into the middle of the slip road.
      // The GLANCE half is unfixable and is dropped rather than faked: the
      // rubric note below says the observation channel is not wired to a glance
      // feed, and a reachZone tick carries no glances at all. The look is
      // graded where it actually can be — the config-gated JU-23 detector this
      // template enables (ruleConfig below), which the partial-scan demo proves.
      titleBg: "Спри напълно на стоп-линията на знак Б2",
      // The mark now IS the paint: e171919146.0@42.7:stopSign, derived by
      // runtime/stoplines.ts at (−268.56, 119.61) — the slip road is 1-lane
      // oneway, so the lane centre IS the polyline and the line sits on it.
      // maxSpeedKmh 3 makes this a HALT DEMAND (≤ REACH_ZONE_HALT_CAP_KMH 8):
      // it opens the approach capsule, so stopping SHORT of the line still
      // counts, and params.ts never widens a halt cap — «спри» reads the same
      // at L1 as at L5. acceptBeforeMarkM 0 cuts the disc at the paint, so
      // credit runs from 11 m short of the line (radius 6 + REACH_ZONE_GRACE_M
      // 5) up to the line and not one centimetre past it.
      // ACHIEVABLE IN THIS WORLD (measured through the recorder, not guessed):
      // the shadow rests 4.56 m short of the paint at 0.00 km/h — inside the
      // radius with 1.4 m to spare and mid-capsule — while the rolling demo
      // never drops below 11.9 km/h anywhere inside the 11 m window. The spawn
      // is 42.65 m away, so `everOutside` latches long before the ring: no free
      // tick at t = 0. THEO-4 needs nothing new here: `overCapNoted` already
      // latches „на точката и още твърде бързо" and engine.ts turns it into the
      // card that names the 3 km/h and the speed actually driven.
      params: {
        kind: "reachZone",
        x: -268.56,
        y: 119.61,
        radiusM: 6,
        maxSpeedKmh: 3,
        acceptBeforeMarkM: 0,
      },
    },
    {
      id: "sc-edpr-signal",
      titleBg: "Премини светофара и завий надясно",
      // Curb lane of Стоян Михайловски past the n4873770118 complex.
      params: { kind: "reachZone", x: -516.35, y: -128.17, radiusM: 14 },
    },
    {
      id: "sc-edpr-leftturn",
      // WAS «…след насрещния» — the same certificate sc-edpr-finish below could
      // not issue, for the same reason: nothing in a tick says whether the
      // oncoming car was let through. Arrival on Златовръх proves the turn was
      // completed. чл. 37 keeps its grader — the runtime's left-turn tracker
      // and FAILED_TO_YIELD (the recording header notes a MEASURED conviction
      // at a 3.1 s gap, which is why the shadow waits the car out). The disc is
      // radius 10 on an 8.125 m lane pitch, so it may not claim a lane either.
      // Params untouched ⇒ `done` is bit-identical; THEO-4 owes no card.
      titleBg: "Завий наляво по „Златовръх“ и продължи по нея",
      // Златовръх's single lane, ~35 m past the n4547529959 mouth — clear of
      // the turn arc (where the line legitimately rides wide of lane center)
      // and still short of the next node.
      params: { kind: "reachZone", x: -671.26, y: 33.98, radiusM: 10 },
    },
    {
      id: "sc-edpr-finish",
      // WAS «Пропусни колата отдясно и довърши сегмента» — a certificate this
      // gate cannot issue. A SimTick carries no other actor's priority and no
      // yield outcome, and stepReachZone is handed (params, prev, tick) with no
      // ObjectiveContext, so „пропусна ли я" is unanswerable here at any value
      // of any param. Arrival proves the junction was CLEARED, and that is what
      // the title now says. The duty keeps its voice: FAILED_TO_YIELD in
      // mistakes[] below, convicted by the runtime's right-hand-rule tracker —
      // whose 18 m core is exactly why SC_ED_D2_PRIORITY_RIGHT pins the
      // shadow's yield pose at lineDistM 20, OUTSIDE it. Params untouched: this
      // objective's `done` is bit-identical to before, so nothing can newly
      // fail and THEO-4 owes no card.
      titleBg: "Премини равнозначното кръстовище и довърши сегмента",
      // Златовръх ~25 m past n248572866 — far enough to prove the equal
      // junction was actually cleared, and short of the segment's end node
      // (whose own service stub would capture a gate placed right on it).
      params: { kind: "reachZone", x: -735.77, y: -214.49, radiusM: 12 },
    },
  ],
  // parTime only: the rubric's observation channel is not wired to a glance
  // feed yet (rubric.ts scores it measured:false), so authoring observation
  // moments here would be a promise the pipeline cannot keep — even though
  // THIS drill is precisely about observation. The JU-23 detector carries that
  // weight instead, which is the honest place for it.
  rubric: { parTimeSec: 165 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scEdD2PriorityRun.ts; the §5 gate (shadow replays ZERO violations)
  // and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-ed-d2-priority-run-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ed-d2-priority-run/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ed-d2-priority-run/mistake-rolling-stop.trace.json" },
      titleBg: "Търкаляне през стоп-линията",
      whatWentWrongBg:
        "Колата се претърколи през стоп-линията на около 12 км/ч — и обърни внимание: шофьорът СЕ ОГЛЕДА наляво и надясно. Точно затова грешката е чиста и единствена: огледът беше налице, спирането — не. „Почти спрях“ не съществува нито в закона, нито на изпита. Знакът Б2 иска неподвижни колела, защото само спрялата кола ти дава време да видиш това, което идва отдясно.",
      codeRefs: ["STOP_SIGN_NO_FULL_STOP"],
    },
    {
      traceRef: { path: "content/traces/sc-ed-d2-priority-run/mistake-partial-scan.trace.json" },
      titleBg: "Незавършен оглед след спирането",
      whatWentWrongBg:
        "Спирането беше образцово — пълно, пред линията, точно по учебник. И пак е грешка, защото шофьорът погледна САМО наляво и потегли. Тази отбивка се влива в булевард „Пейо К. Яворов“: колите с предимство идват отдясно, а именно натам никой не погледна. „Гледах, но не видях“ е най-честата причина за удар на кръстовище — и почти винаги означава „гледах само веднъж, и то не натам“.",
      codeRefs: ["JUNCTION_SCAN_INCOMPLETE"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръстовище без светофар — тоест на повечето кръстовища в София. Трите правила в този сегмент идват едно след друго за три минути: знак Б2, равнозначно кръстовище и ляв завой срещу насрещен.",
    whyBg:
      "Предимството не е една буква, а три различни правила, и кандидатите ги бъркат точно защото ги учат поотделно. На Б2 спираш ВИНАГИ, дори платното да е празно. На равнозначно кръстовище няма знаци — важи „дясната ръка“, и то важи и когато колата отдясно е далеч и бавна. При ляв завой пропускаш насрещния, защото той продължава направо. Сегментът ги подрежда в реда, в който улицата ги задава, и добавя това, което нито един тест не може: че между тях няма пауза.",
    lawRef: "Наредба № 38; ЗДвП чл. 37, чл. 48, чл. 50",
    examinerBg:
      "Изпитващият гледа не само дали си спрял, а и КАК си се огледал: пълно спиране пред линията на Б2, после ляво-дясно-ляво, и чак тогава потегляне. На равнозначното кръстовище — реално пропускане на дясната, без колебливо пълзене. На левия завой — изчакване на насрещния с прави колела. Непропускането на предимство и неспирането на Б2 са опасни грешки: всяка от тях сама по себе си прекратява изпита.",
  },
  // JU-23 is config-gated and ships OFF (rules/types.ts: the A12 whole-commute
  // crosses a Б2 unglanced and must stay innocent by default). This drill is
  // the per-lesson opt-in the flag exists for — and it is the exam-grade
  // differentiator of the whole template: without it, „спрях и потеглих без да
  // погледна" is an ungraded pass. compileScenario propagates this to the live
  // LessonSpec.ruleConfig; the recorder enables the same flag for the traces.
  ruleConfig: { junctionScanObservationEnabled: true },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    // L4: изпитни условия — студен старт по протокола.
    { level: 4, vehicleStart: "cold" },
    // L5: дъжд + жив околен трафик по реалната мрежа на Лозенец, така че на
    // трите възела има и коли, които никой не е поставял.
    // NO physics.wetGrip: the authored ghost envelope is dry-tuned (ADR-006
    // stage 4a — only a template that AUTHORS the field gets reduced grip).
    {
      level: 5,
      conditions: { weather: "rain" },
      traffic: { vehicleCount: 8, pedestrianCount: 3, anchorRadiusM: 350 },
    },
  ],
  // Route order: the left turn resolves 267 m before the equal junction arms.
  staged: [SC_ED_D2_PRIORITY_ONCOMING, SC_ED_D2_PRIORITY_RIGHT],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-ed-d2-stop-address — „„Спрете на удобно място" — Лозенец" on d2-v1
// ---------------------------------------------------------------------------

/**
 * THE Наредба-38 COMMAND AS A DRILL — and the two honest limits that shaped it.
 *
 * WHY THIS BLOCK: „Незабравка" e76856228.0 is 375 m of two-way residential
 * street (2 lanes ⇒ lanesPerDir 1, limit 50) that carries NO crossing, NO
 * derived stop line and NO signal, and it is untouched by the two shipped d2
 * drills (city-run drives бул. Драган Цанков; priority-run drives the Яворов
 * ramp → Стоян Михайловски → Златовръх). That emptiness IS the drill: with
 * every other grading axis positively absent, the only things the rule engine
 * can judge are the two this lesson is about — the оглед before the wheels turn
 * and HOW the car is brought to rest. The single junction on the block sits at
 * its far end (n1119524707, uncontrolled, 377 m out), which is why the chosen
 * legal stretch is mid-block: 120 m clear of the чл. 98 junction ban.
 *
 * HONEST LIMIT 1 — SITE SELECTION IS GATE-GRADED, NOT DETECTOR-GRADED. The
 * backlog asked for ILLEGAL_STOP_IN_BAN_ZONE on the „first, forbidden place".
 * That detector reads tick.noStopZone, which comes from an AUTHORED В27 span in
 * the district's `zones` layer (engine.ts: „the zone is AUTHORED data — no
 * heuristic zone inference, ever"). Audit M-15 gave d2-v1 a zone layer
 * (tools/maps/gen_exam_district_zones.mjs), but every В27 span in it sits where
 * the OSM cut EARNS one — the бул. „Пейо К. Яворов" viaduct and бул. „Никола Й.
 * Вапцаров", both 70 km/h with no shoulder. „Незабравка" is a quiet residential
 * block with no such evidence, so it carries no ban span and nothing here fakes
 * one (the exam-districts battery pins that). Site selection is
 * therefore carried by the OBJECTIVE GATES (the sc-ln-turn-lane-arrows
 * precedent: gate the correct choice, and script the mistake demo to trip a code
 * it genuinely earns), and the „wrong place" demo grades the fault that a dive
 * for the first gap ACTUALLY commits — HARSH_BRAKING_NO_CAUSE. A place you must
 * stamp on the brakes to make is not „удобно": that is the lesson, and it is a
 * real Н38 основна грешка, not a stand-in.
 *
 * HONEST LIMIT 2 — WHY THE DRILL OPENS AT THE CURB INSTEAD OF ENDING THERE. The
 * move-off detector grades the SESSION'S FIRST move-off only (engine.ts:
 * s.moveOff.done latches on the first crossing of movingSpeedKmh). A drill that
 * stopped at the curb and then pulled away would have its taught move-off
 * ungraded for the STUDENT — the config-gated opt-in below would be decoration.
 * So the exam pair „спиране и потегляне" runs in the order the engine can
 * actually grade: the car STARTS at rest against the curb (the examiner's
 * previous „спрете" already executed), the first thing the student does is the
 * observed pull-away, and the command „спрете на удобно място" then closes the
 * cycle. A second, post-stop move-off is deliberately NOT authored: it would be
 * ungraded narrative pretending to be the lesson.
 */
export const SC_ED_D2_STOP_ADDRESS: ScenarioSpec = {
  id: "sc-ed-d2-stop-address",
  family: "exam-drills",
  tagsBg: ["изпит", "престой", "потегляне", "оглед", "плавно спиране", "Лозенец"],
  titleBg: "„Спрете на удобно място“ — Лозенец",
  // The backlog phrased the cycle „избери легално място, спри плавно и потегли
  // отново"; the engine imposes the move-off FIRST (see HONEST LIMIT 2), and the
  // objective a student reads has to match the drive they will make — the
  // sc-ed-d2-priority-run precedent.
  objectiveBg:
    "Изпълни изпитната команда: потегли от бордюра с пълен оглед, избери легално място по-нататък по улицата и спри плавно до него — както го иска изпитващият.",
  // PK-05 IS the move-off observation; PK-14 „Плавно спиране на позиция" is the
  // stop half; SP-11 is the fault the dive demo grades. PK-06 („спиране в
  // забранена зона") is deliberately NOT claimed: its detector cannot fire on
  // this district (HONEST LIMIT 1) and provenance is not a wish list.
  archetypeIds: ["PK-05", "PK-14", "SP-11"],
  conceptIds: [
    "c-maneuver-principles",
    "c-mirrors-blind-spots",
    "c-driver-signals",
    "c-stop-parking-definitions",
    "c-stopping-standing-rules",
    "c-sudden-braking-slow-driving",
  ],
  map: {
    archetype: "straight-street",
    // d2-v1 has NO meta.scenario.params: it is a committed OSM cut, not a
    // generator recipe (ADR-007). These mirror meta.source/meta.stats.
    params: {
      pipeline: "tools/maps/build_district_d2.mjs",
      district: "lozenets",
      osmDataTimestamp: "2026-07-16T22:54:45Z",
      roadKm: 21.7,
      segmentM: 256,
      segmentRoad: "Незабравка",
      blockM: 375,
      // THE SIGN CLAMP IS INERT ON THIS DRILL, AND THE ONE-LINE FIX IS BLOCKED
      // IN ANOTHER LANE'S FILE (sweep161,
      // `sc-ed-d2-stop-address/pc-right/04-t129s.png`; left undone 2026-08-20).
      //
      // `compile.ts` reads the street's limit from exactly one place —
      // `spec.map.params.maxspeedKmh` — and this block has none, so
      // `LessonSpec.postedLimitKmh` compiles to `undefined` and B58's „a gate
      // label may never exceed the sign" has nothing to clamp against, on the
      // very lesson the audit photographed for carrying four speeds at once.
      // The prose has known the number all along: the docblock above says
      // „limit 50" and briefing step 3 says „ограничението е 50".
      //
      // READ OFF THE DISTRICT, NOT OFF THE PROSE — the drill's block is
      // `e76856228.0` in `d2-v1.json`: 375 m, residential, lanes 2,
      // `maxspeed 50` (source „default"), the same edge `blockM: 375` names.
      // (Other Незабравка edges in the cut carry 40 by tag; none is this block.)
      //
      // ADDING `maxspeedKmh: 50` HERE WAS TRIED AND MEASURED. No gate moves:
      // the ladder's caps are 37 / 34.5 / 32 / 32 with a halt gate of 3, all
      // far below 50, so `widenSpeedCap`'s clamp never bites and every compiled
      // objective stays byte-identical. Eleven of the twelve assertions in
      // `scenario/__tests__/b58-gate-never-over-posted.test.ts` stay green —
      // including `unreadableCards` and the invariant itself. The twelfth is a
      // census that must be RESTATED, not relaxed: the survey grows from 502
      // cards to 510, because this template's two capped objectives across four
      // rungs finally enter it. That file belongs to another lane, so the
      // change is left here rather than made half-way. Apply both together.
    },
    districtId: "d2-v1",
  },
  start: {
    // The NE end of Незабравка (e76856228.0's from-node n1116876635 — the cut
    // boundary), curb lane. d2's spawn-2 sits on THIS street but 187 m in,
    // which would leave no block to search; so the drill authors its own pose
    // (validate.ts: position + headingDeg), the two sibling d2 drills' pattern.
    position: { x: 343.03, y: -127.56 },
    headingDeg: 229.2,
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Стоиш до бордюра на „Незабравка“. Изпитващият казва „продължете“ — но първо огледът: огледало и поглед през ЛЯВОТО рамо, чак после мигач наляво.",
    },
    {
      n: 2,
      textBg:
        "Потеглянето от място е маневра (чл. 25): преди колелата да се завъртят трябва да си сигурен, че не пресичаш пътя на никого зад теб.",
    },
    // FOUR SPEEDS ON ONE SCREEN (sweep161,
    // `sc-ed-d2-stop-address/pc-right/04-t129s.png`): *„the instruction panel
    // says take a calm 45 км/ч, the task toast says hold under 37 км/ч, the
    // world sign says 50, and the mode strip says ≤80 on a street the
    // instructions call residential."*
    //
    // The 37 was the grader's tolerance speaking in its own voice and it is
    // already gone — the authored-cap wave gave `advisor.ts` the template's own
    // figure, and this drill's card now reads „дръж под 32 км/ч" on every rung
    // (compiled and measured: gates 37 / 34.5 / 32 / 32, spoken 32 throughout).
    //
    // WHAT THAT FIX COULD NOT DO IS SEQUENCE THE NUMBERS, and that is this
    // file's job. 45 and 32 are not rivals — one is the middle of the block and
    // the other is the approach — but nothing said so, and a student who holds
    // the briefing's 45 into the zone fails a gate whose figure appears only on
    // a transient chip. That is requirement zero's bare verdict (doc 64
    // THEO-4) and the founder's own roundabout complaint pointing the other
    // way. Steps 3 and 6 now name WHICH number is graded and WHEN each applies.
    //
    // Deliberately without printing the approach figure here: it is generated
    // per rung from `sc-edsa-planned-approach`, and a numeral hard-coded in the
    // briefing would be a second copy of it, free to drift, on the one drill
    // whose whole finding is numbers that disagree.
    //
    // ── …AND THE SEQUENCING WAS PUT WHERE NOBODY READS IT (w11, 2026-08-26,
    //    `.audit-frames/w11/frames/sc-ed-d2-stop-address__pc-right/
    //    04-t129s.png`) ──────────────────────────────────────────────────────
    //
    // The re-drive credits the mitigation above and then photographs what it
    // missed. On the glass at t129s the ИНСТРУКЦИИ panel shows steps 1–4 and
    // ends in «↓ ОЩЕ 4 СТЪПКИ»: step 3's «набери спокойни 45 км/ч» is legible,
    // and step 6 — the step that said which of the two numbers is graded — is
    // BELOW THE FOLD. The chip beside it reads «дръж под 32 км/ч». So the
    // student who reads what he is shown reads 45, is measured against 32, and
    // the sentence that reconciles them is one he has to scroll for.
    //
    // That is this repo's own rule, already written down twice and applied to
    // the wrong file both times: `templates-flow.ts`'s briefing-budget block
    // („a step-1 past ~96 characters leaves ZERO characters of the rest of the
    // briefing above the fold") and `templates-parking3.ts`'s ORDER OF THE
    // FIRST STEP („an act that keeps the student out of a parked car cannot be
    // the act below the fold, and it cannot be the last five words of a
    // sentence whose first words send him up the row"). The fold is a property
    // of the SURFACE, so the fix is not a shorter step 6 — it is that the
    // disambiguation must live in the same step as the numeral it disambiguates.
    //
    // So step 3 now carries the pointer itself, in the same sentence as the 45,
    // at the place the panel actually shows. Step 6 keeps a short
    // back-reference for the student who reaches it — redundancy above AND
    // below the fold is the point, not an accident. Still no numeral for the
    // cap, for the reason above: `advisor.ts` speaks the compiled per-rung
    // figure and this file must not ship a second copy of it.
    //
    // AND THE POSTED 50 LEFT THE PANEL, which is the other half of the row and
    // is a deletion rather than a sentence. The finding counts FOUR numbers on
    // one screen; two of them are this template's (the 45 and the задача's cap)
    // and two are not (the В26 disc, and the governor's ≤80 — `districtMaxLegalKmh`
    // over the whole Лозенец cut, whose viaduct is 80; `scene/lessonSpeedContract.ts`
    // names the three surfaces that must adopt one resolution and none is in
    // this module). What this file could do is stop printing a THIRD copy of a
    // number the world already posts six pixels away: «ограничението е 50 —
    // карай под него» became «под знака». The law is unchanged and still
    // delivered — by the disc, which is where a driver reads a limit — and the
    // instruction panel now carries exactly one speed, the one it commands.
    // The budget is unchanged too: step 3 is 184 characters against 178 before,
    // so the pointer is bought with the numeral rather than with the fold.
    //
    // `__tests__/d2-stop-address-speeds.test.ts` is the guard and it still
    // passes on all four of its clauses (checked against the compiled
    // briefing): briefNums = {45}, and the strings «задачата на екрана»,
    // «по което те оценяват» and «СРЕДАТА на блока» all survive — they simply
    // moved from step 6 up into step 3.
    {
      n: 3,
      textBg:
        "Излез в лентата и набери спокойни 45 км/ч — под знака, темпото за СРЕДАТА на блока. При приближаването важи другото, по-ниско число от задачата на екрана — онова, по което те оценяват.",
    },
    {
      n: 4,
      textBg:
        "Командата на изпитващия: „Спрете на удобно място“. Това НЕ означава „спри веднага“ — означава „намери място, което е и законно, и безопасно, и стигни до него плавно“.",
    },
    {
      n: 5,
      textBg:
        "Не спирай на кръстовището в края на улицата и на по-малко от 5 метра от него (чл. 98). Избери правата отсечка по средата на блока — там колата ти не пречи и не крие никого.",
    },
    {
      n: 6,
      textBg:
        "Планирай спирането отрано: огледало, десен мигач, плавно намаляване и спиране плътно вдясно до бордюра. Скоростта тук е числото от задачата, не 45-те от точка 3. Ако трябва да набиеш спирачките, за да уловиш мястото — мястото не е удобно.",
    },
    { n: 7, textBg: "Спри напълно, задръж колата и остави мигача изключен, когато си спрял." },
  ],
  success: [
    {
      id: "sc-edsa-moveoff",
      titleBg: "Потегли от бордюра след пълния оглед",
      // 60 m up the block — proves the car actually left the curb and settled
      // into the lane (the move-off itself is graded by PK-05, not by a zone).
      params: { kind: "reachZone", x: 297.63, y: -166.78, radiusM: 12 },
    },
    {
      id: "sc-edsa-planned-approach",
      titleBg: "Приближи избраното място с намалена скорост",
      // 36 m short of the stop, completable ONLY at/below маневрена скорост:
      // this is where „плавно" gets its teeth. A car that dives for a gap at
      // 45 km/h is never inside this zone slowly enough to complete it.
      params: { kind: "reachZone", x: 184.48, y: -279.35, radiusM: 9, maxSpeedKmh: 32 },
    },
    {
      id: "sc-edsa-legal-stop",
      titleBg: "Спри на легалната отсечка до бордюра",
      // The chosen stretch: mid-block, 121 m clear of the junction at the
      // street's end (чл. 98). Completable only at rest — the site-selection
      // gate (HONEST LIMIT 1: „Незабравка" carries no authored ban span).
      params: { kind: "reachZone", x: 173.85, y: -313.6, radiusM: 12, maxSpeedKmh: 3 },
    },
  ],
  // parTime only: the rubric's observation channel is not wired to a glance
  // feed yet (rubric.ts scores it measured:false), so authoring observation
  // moments here would be a promise the pipeline cannot keep — even though this
  // drill opens on an observation. The PK-05 detector carries that weight
  // instead, which is the honest place for it. Par 60 s ≈ 1.75× the C1 shadow's
  // measured 34 s: the student band, not the ghost's time — the cold start at
  // L4 and the seconds spent actually LOOKING for a place are the difference.
  // Informational only (doc 76 §6), never a penalty.
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scEdD2StopAddress.ts; the §5 gate (shadow replays ZERO violations)
  // and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-ed-d2-stop-address-traces.test.ts (RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ed-d2-stop-address/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ed-d2-stop-address/mistake-first-spot-dive.trace.json" },
      titleBg: "Спиране на първото зърнато място",
      whatWentWrongBg:
        "„Ето тук има място!“ — и спирачките се набиха от 45 км/ч, за да уловят пролука, забелязана един момент по-рано. Ето защо това е грешка, а не находчивост: рязкото спиране без причина е основна грешка по Наредба № 38 само по себе си, а колата отзад няма как да очаква стоповете ти на празна жилищна улица. Командата „спрете на удобно място“ не е „спрете веднага“: удобното място е онова, до което стигаш с планирано, плавно намаляване — ако трябва да набиеш спирачката, за да го хванеш, то вече не е удобно. Мястото на 100 метра по-нататък беше същото легално място, но със спокойно спиране.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-ed-d2-stop-address/mistake-no-observation.trace.json" },
      titleBg: "Потегляне без оглед",
      whatWentWrongBg:
        "Мигачът беше подаден изрядно, спирането по-нататък — образцово, и точно затова грешката е чиста и единствена: колата тръгна от бордюра без нито един поглед назад. Мигачът съобщава намерението ти, но не ти показва нищо; само огледалото и погледът през лявото рамо го правят. Потеглянето от място е маневра (чл. 25) — а маневра се прави след оглед, не преди него. Мотористът или колелото, което се промъква покрай бордюра, живее точно в тази непогледната секунда.",
      codeRefs: ["MOVE_OFF_WITHOUT_OBSERVATION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки изпит и после всеки ден: „спрете на удобно място“ е командата, с която изпитващият проверява дали изобщо четеш улицата, а потеглянето от бордюра е първото нещо, което правиш всеки път, щом седнеш в колата.",
    whyBg:
      "Тази команда изглежда като почивка и точно затова къса кандидати. В нея има три отделни решения, а не едно. Първо КЪДЕ: местата, на които не се спира, са изброени в закона (кръстовище и 5 метра преди него, пешеходна пътека, спирка, стеснение) — и всяко от тях е забранено, защото спрялата там кола крие някого. Второ КАК: до избраното място се стига с планирано намаляване; спирачка, набита за да уловиш място, което си видял късно, е грешка независимо колко законно е мястото. И трето — потеглянето обратно: то е маневра като всяка друга и започва с оглед, а не с мигач. Кандидатът, който чуе командата и спре на първото нещо, което прилича на място, е сгрешил и трите.",
    lawRef: "Наредба № 38; ЗДвП чл. 25, чл. 98",
    examinerBg:
      "Изпитващият гледа цялата верига: оглед — огледало и през рамо — преди колата да тръгне от бордюра, после подаден мигач; законен избор на място за престой (не на кръстовище и не по-близо от 5 м от него); плавно, планирано намаляване без рязко спиране; и спиране плътно вдясно до бордюра. Потегляне без оглеждане и рязко спиране без причина са основни грешки — всяка от тях се брои отделно.",
  },
  // Config-gated drill: the move-off-observation detector ships OFF
  // (rules/types.ts moveOffObservationEnabled — the A12 whole-commute pulls
  // away from rest unglanced by default), so this drill opts it IN.
  // compileScenario propagates this to the LIVE LessonSpec, so the student's own
  // pull-away grades; the recorder passes the same override for the §9 assert.
  // It is the exam-grade differentiator: without it, „потеглих, без да погледна"
  // is an ungraded pass. HARSH_BRAKING_NO_CAUSE needs no gate (default-ON).
  ruleConfig: { moveOffObservationEnabled: true },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    // L4: изпитни условия — студен старт по протокола (examMode is the ladder
    // default at this rung; the „команда" is instruction card n=4).
    { level: 4, vehicleStart: "cold" },
    // No L5: the backlog authors rungs 1–4 only. A rain/night rung would need
    // its own tuning pass against the dry-tuned ghost envelope (ADR-006 stage
    // 4a) and the drill's fault is a cockpit habit, not a conditions skill.
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-ed-reverse-line — „Заден ход по права линия" on poligon-v1
// ---------------------------------------------------------------------------

/**
 * THE Наредба-38 REVERSE MANEUVER AS A DRILL — and the two honest limits that
 * shaped it (the sc-ed-d2-stop-address pattern, on the полигон instead of the
 * city).
 *
 * WHY poligon-v1: the „Старт-стоп права" (edge pg-e-s1, the southern two-way
 * straight, limit 30) is a closed training ground with NOTHING staged on it —
 * no signals, no crossings, no other actors. That emptiness IS the drill: with
 * every other grading axis positively absent, the only things the rule engine
 * can judge are the two this lesson is about — the оглед before the wheels turn
 * and any contact with the CURB. This is the FIRST scenario template to drive
 * the полигон (it has shipped with only the legacy L-lesson today).
 *
 * HONEST LIMIT 1 — THE STRAIGHT-REVERSE HAS NO EVALUATOR PRIMITIVE. The maneuver
 * evaluator set ships parkInBay + threePointTurn, but no „reverse in a straight
 * line" objective. Rather than fork the engine, the 25 m reverse is graded by a
 * reachZone CHAIN read in reverse (the sc-ln-turn-lane-arrows precedent): a
 * settle gate after the observed pull-away, a narrow mid-corridor gate (radiusM
 * 1.8 < a lane — a drift off the curb line misses it: the lateral band), and a
 * rest gate 25 m back (maxSpeedKmh 4 — at walking pace, stopped). Curb contact
 * grades COLLISION through the recorder's obstacle-rect machinery (collisionMinKmh
 * 0 — the sc-maneuver-3point precedent), not through the objective layer.
 *
 * HONEST LIMIT 2 — WHY THE DRILL OPENS WITH A FORWARD MOVE-OFF. The оглед that
 * ЗДвП чл. 40 demands before backing is the same „look before the wheels turn"
 * PK-05 grades — but the move-off detector (engine.ts) grades the SESSION'S FIRST
 * move-off and is FORWARD-GEAR ONLY: „whose first motion is a reverse maneuver is
 * never graded (conservative)". A pure reverse latches nothing. So the exam pair
 * „потегляне + заден ход" runs in the order the engine can grade: the car pulls
 * away from the curb FORWARD (observed), settles into the изходна позиция, and
 * only THEN reverses the 25 m. The observation the drill teaches — and the „без
 * поглед" mistake convicts — is that opening move-off; on the exam a maneuver
 * begun with no оглед at all ends the run before the reverse is even judged.
 */
export const SC_ED_REVERSE_LINE: ScenarioSpec = {
  id: "sc-ed-reverse-line",
  family: "exam-drills",
  tagsBg: ["изпит", "заден ход", "права линия", "полигон", "оглед", "бордюр"],
  titleBg: "Заден ход по права линия",
  objectiveBg:
    "Изпитната маневра: 25 метра назад по права линия покрай бордюра — с поглед през рамо, пешеходна скорост и без докосване на бордюра.",
  // PK-11 „Заден ход" IS the maneuver; PK-05 „Потегляне без оглеждане" is the
  // graded observation fault (the engine convicts the FORWARD move-off — HONEST
  // LIMIT 2). ЗДвП чл. 40 is the reverse duty the drill teaches.
  archetypeIds: ["PK-11", "PK-05"],
  conceptIds: [
    "c-reversing",
    "c-maneuver-principles",
    "c-mirrors-blind-spots",
    "c-driver-signals",
    "c-general-care-duty",
  ],
  map: {
    archetype: "straight-street",
    // poligon-v1 is a hand-authored NON-OSM training ground (gen_poligon.mjs); it
    // carries no meta.scenario.params, so these mirror meta.generator/stats as
    // provenance (the d2-v1 pattern for a committed non-recipe district).
    params: {
      generator: "tools/maps/gen_poligon.mjs",
      district: "poligon",
      mapKind: "training-ground",
      laneEdge: "pg-e-s1",
      segmentRoad: "Старт-стоп права",
      reverseM: 25,
    },
    districtId: "poligon-v1",
  },
  start: {
    // At rest against the south curb of the „Старт-стоп права", facing east
    // (heading 90 = +X), on the clean western stretch (x = -132, well clear of
    // the g2 junction at x = -95 and the SW corner joint at x = -170). The
    // полигон's three spawnPoints sit elsewhere, so the drill authors its own
    // pose (validate.ts: position + headingDeg) — the d2 drills' pattern.
    position: { x: -132, y: -136.4 },
    headingDeg: 90,
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Стоиш до бордюра на „Старт-стоп правата“. Изпитната маневра е „движение назад по права линия“ — но първо огледът.",
    },
    {
      n: 2,
      textBg:
        "Преди колелата да се завъртят: поглед в огледалото и през ЛЯВОТО рамо. Потеглянето от място е маневра (чл. 25) и започва с оглед, не с газ.",
    },
    {
      n: 3,
      textBg:
        "Излез напред в лентата и заеми изходната позиция — плътно вдясно до бордюра, спри спокойно.",
    },
    {
      n: 4,
      textBg:
        "Включи на задна и се убеди, че пътят ЗАД теб е свободен: обърни се и гледай през рамо назад, не разчитай само на огледалото (чл. 40).",
    },
    {
      n: 5,
      textBg:
        "Карай назад бавно, с пешеходна скорост, като държиш права линия успоредно на бордюра — фини движения на волана, очите назад.",
    },
    {
      n: 6,
      textBg:
        "Спри плавно след около 25 метра, без нито веднъж да докоснеш бордюра. Ако усетиш, че губиш линията — спри и коригирай, не карай до бордюра.",
    },
  ],
  success: [
    {
      id: "sc-edrl-moveoff",
      titleBg: "Потегли с оглед и заеми изходната позиция",
      // The settle after the observed forward pull-away (the move-off itself is
      // graded by PK-05, not by this gate). Pinned to poligon-v1 pg-e-s1.
      params: { kind: "reachZone", x: -121, y: -136.4, radiusM: 4 },
    },
    {
      id: "sc-edrl-reverse-mid",
      titleBg: "Дръж права линия по средата на заден ход",
      // The lateral band: radiusM 1.8 < a lane, so a reverse that wanders off the
      // curb line misses this gate. ~13 m into the 25 m reverse.
      params: { kind: "reachZone", x: -134, y: -136.4, radiusM: 1.8 },
    },
    {
      id: "sc-edrl-reverse-end",
      titleBg: "Спри след 25 метра заден ход до бордюра",
      // 25 m back, at rest — maxSpeedKmh 4 (пешеходна скорост, stopped): the
      // reverse must actually be completed slowly, not run out.
      params: { kind: "reachZone", x: -144, y: -136.4, radiusM: 2.2, maxSpeedKmh: 4 },
    },
  ],
  // parTime only: the rubric's observation channel is not wired to a glance feed
  // yet (rubric.ts scores it measured:false), so authoring observation moments
  // here would promise what the pipeline cannot keep — even though this drill is
  // about observation. PK-05 carries that weight, the honest place for it. Par
  // 50 s ≈ 1.8× the C1 shadow's ~28 s: the student band with the L4 cold start
  // and a careful, corrected reverse. Informational only (doc 76 §6), never a
  // penalty.
  rubric: { parTimeSec: 50 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scEdReverseLine.ts; the §5 gate (shadow replays ZERO violations) and
  // the §9 stage-5 code asserts run in
  // traces/__tests__/sc-ed-reverse-line-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ed-reverse-line/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ed-reverse-line/mistake-curb.trace.json" },
      titleBg: "Качване на бордюра",
      whatWentWrongBg:
        "Огледът преди потегляне беше налице — затова грешката е чиста и единствена: по време на заден ход колата се отклони и задницата се качи на бордюра. Заден ход се кара с пешеходна скорост и с постоянно внимание докъде стига колата; бордюрът се пази с фини корекции на волана и с поглед назад, а не с надежда, че „ще се получи“. Едно докосване на бордюра на изпита е отсъдена грешка, независимо колко бавно е станало.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ed-reverse-line/mistake-no-look.trace.json" },
      titleBg: "Заден ход без поглед назад",
      whatWentWrongBg:
        "Колата тръгна за маневрата без нито един поглед назад. Точно затова грешката личи ясно: движението назад изисква водачът да се убеди, че пътят зад него е свободен (чл. 40), а потеглянето от място — оглед през рамо и в огледалото (чл. 25). Тук нямаше нито едното. На изпита това е основна грешка още при потеглянето — маневрата приключва, преди изобщо да си стигнал до правата линия назад. Мотористът, колоездачът или детето зад колата живеят точно в тази непогледната секунда.",
      codeRefs: ["MOVE_OFF_WITHOUT_OBSERVATION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки изпит — движението назад по права линия е една от задължителните маневри на площадката — и после на всеки паркинг и всяка тясна улица, където се налага да върнеш колата назад.",
    whyBg:
      "Заден ход е сред най-подценяваните маневри: видимостта назад е ограничена, а колата се движи натам, накъдето водачът гледа най-малко. Две неща я правят безопасна и двете се бъркат от кандидатите. Първо — огледът: и потеглянето, и заден ход са маневри, а маневра се прави СЛЕД оглед, не преди него; погледът през рамо показва това, което огледалото и мигачът не могат. Второ — контролът: назад се кара с пешеходна скорост и по права линия, с фини движения на волана и с очи, които следят докъде стига задницата спрямо бордюра. Който бърза или гледа само напред, качва бордюра или криволичи — и двете са отсъдени грешки.",
    lawRef: "Наредба № 38; ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа цялата верига: оглед — огледало и през рамо — преди колата да тръгне; заемане на изходна позиция плътно до бордюра; убеждаване, че пътят назад е свободен, преди задния ход; движение назад с пешеходна скорост по права линия, успоредно на бордюра; и спиране без нито едно докосване на бордюра. Потегляне без оглеждане и качване/докосване на бордюра са отсъдени грешки.",
  },
  // Config-gated drill: the move-off-observation detector ships OFF
  // (rules/types.ts moveOffObservationEnabled — the A12 whole-commute pulls away
  // unglanced by default), so this drill opts it IN. compileScenario propagates
  // it to the LIVE LessonSpec so the student's own pull-away grades; the recorder
  // passes the same override for the §9 assert. It is the exam-grade
  // differentiator: without it, „тръгнах, без да погледна" is an ungraded pass.
  // COLLISION needs no gate (default-ON).
  ruleConfig: { moveOffObservationEnabled: true },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    // L4: изпитни условия — студен старт по протокола (examMode is the ladder
    // default at this rung).
    { level: 4, vehicleStart: "cold" },
    // No L5: the backlog authors rungs 1–4 only. The полигон is a closed площадка
    // (no rain/night exam maneuver) and the fault is a low-speed control habit,
    // not a conditions skill; a wet rung would need the ADR-006 stage-4a physics
    // opt-in the dry-tuned ghost cannot honour.
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-ed-poligon-chain — „Полигонът на един дъх" on poligon-v1 (the capstone)
// ---------------------------------------------------------------------------

/**
 * THE THREE Наредба-38 площадкови МАНЕВРИ AS ONE UNBROKEN GRADED ROUTE — the
 * capstone that chains the three existing maneuver evaluators (parkInBay +
 * corridor reachZone gates + threePointTurn) into a single rubric, on the
 * committed poligon-v1 training ground (the sc-ed-reverse-line precedent, one
 * lesson up: that drill graded ONE площадкова маневра; this one grades the
 * whole set „на един дъх", in the order the exam площадка runs them).
 *
 * WHY THE GEOMETRY IS WHAT IT IS — the turn-detector's 40 m junction rule.
 * The runtime emits `turnStarted` (→ TURN_WITHOUT_INDICATOR) only when a >55°
 * heading swing happens INSIDE a junction area (≤40 m of an intersection node —
 * runtime/turns.ts). poligon-v1's south straight („Старт-стоп права", y=-130)
 * has intersection nodes at x = −95 (g2), 0 (s0), +95 (p1); its degree-2
 * corners (sw-a x=−170, se-a x=+170) are NOT junctions. So the two TURNING
 * maneuvers — the perpendicular reverse-park (~90° swing) and the three-point
 * turn (~180°) — are pinned to the junction-free END BANDS (x > 135 east of p1;
 * x < −135 west of g2), where a swing fires nothing. The STRAIGHT reverse has
 * no swing, so it is graded by a reachZone corridor chain (the reverse-line
 * precedent) anywhere on the straight; the transit between stations is a
 * straight run and crosses the junctions freely (no swing = no turnStarted).
 * The exam-districts battery (poligon-chain-districts.test.ts) pins every band.
 *
 * WHY IT OPENS WITH A FORWARD MOVE-OFF (the reverse-line HONEST LIMIT 2). The
 * move-off-observation detector (engine.ts) grades the SESSION'S FIRST move-off
 * and is FORWARD-GEAR ONLY — a run whose first motion is a reverse latches
 * nothing. A capstone whose first act was the bay-reverse would leave the taught
 * оглед ungraded for the STUDENT. So the drive opens with the observed forward
 * APPROACH past the bay (the pull-past every reverse-park needs anyway), which
 * IS the graded move-off; the ruleConfig opt-in below then has teeth on the
 * student's own run. MOVE_OFF_WITHOUT_OBSERVATION is enabled but is NOT one of
 * this drill's demonstrated faults: it must stay OFF the sheet in all three
 * drives, which is why every drive glances before the first forward metre.
 *
 * THE GRADED CHAIN (success objectives, in the sequential order the engine
 * advances them — objectives complete strictly in list order, engine.ts):
 *   1. parkInBay        — перпендикулярно паркиране на заден в гнездото (east band);
 *   2/3/4. reachZone     — заден ход по права: settle → mid → rest (the corridor
 *                          chain, the reverse-line mold — no straight-reverse
 *                          evaluator primitive exists);
 *   5. threePointTurn    — обръщане в три маневри, посоката обърната (west band).
 * Economy rides the parkInBay bay-entry attempts (a clean chain parks in one);
 * the three-point movements ride the objective detail for the debrief.
 *
 * Longest trace in the catalog (the backlog's flagged size check): the C1
 * shadow runs the whole ground in ~164 s — ~3300 20 Hz samples, ~630 KB. That
 * is denser than the backlog's ~25 KB/60 s rule of thumb, but it lands a hair
 * above the existing longest committed trace (sc-ed-d2-priority-run, ~623 KB)
 * and well inside the recorder's 300 s ring; parse.ts imposes no replay-size
 * limit, so the size is in-band, not a blocker. Geometry pinned to
 * content/world/poligon-v1.json by literal.
 */

/** South curb lane of the „Старт-стоп права" (the reverse-line baseline). */
const PGC_Y = -136.4;
/** The perpendicular bay in the EAST band (>40 m east of p1 x=95). */
const PGC_BAY = { x: 143, y: -127, headingDeg: 0, widthM: 2.6, lengthM: 5.0 } as const;
/** The three-point corridor in the WEST band (>40 m west of g2 x=−95). */
const PGC_TURN = { x: -150, y: -131.5, halfWidthM: 8, halfLengthM: 11 } as const;

export const SC_ED_POLIGON_CHAIN: ScenarioSpec = {
  id: "sc-ed-poligon-chain",
  family: "exam-drills",
  tagsBg: ["изпит", "полигон", "паркиране на заден", "заден ход", "обръщане", "площадка"],
  titleBg: "Полигонът на един дъх",
  objectiveBg:
    "Трите изпитни маневри последователно, без нулиране: перпендикулярно паркиране на заден, заден ход по права и обръщане от три маневри — както на изпита, с една кола и един дъх.",
  // PK-02 перпендикулярно паркиране, PK-11 заден ход, PK-12 обръщане в три хода,
  // PK-05 потегляне с оглед — the chain's four doc-72 primitives.
  archetypeIds: ["PK-02", "PK-11", "PK-12", "PK-05"],
  conceptIds: [
    "c-reversing",
    "c-maneuver-principles",
    "c-mirrors-blind-spots",
    "c-u-turn",
    "c-driver-signals",
    "c-general-care-duty",
  ],
  map: {
    archetype: "straight-street",
    // poligon-v1 is a hand-authored NON-OSM training ground (gen_poligon.mjs); it
    // carries no meta.scenario.params, so these mirror meta.generator/stats as
    // provenance (the sc-ed-reverse-line pattern for this committed district).
    params: {
      generator: "tools/maps/gen_poligon.mjs",
      district: "poligon",
      mapKind: "training-ground",
      bayEdge: "pg-e-s4",
      turnEdge: "pg-e-s1",
      maneuvers: 3,
    },
    districtId: "poligon-v1",
  },
  start: {
    // At rest on the „Старт-стоп права" curb lane, EAST band, facing WEST — the
    // pull-past the bay opens the drive (validate.ts: position + headingDeg). The
    // полигон's spawnPoints sit elsewhere, so the drill authors its own pose (the
    // reverse-line pattern).
    position: { x: 155, y: PGC_Y },
    headingDeg: 270,
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Това е целият площадков изпит наведнъж: три маневри една след друга, без спиране между тях. Първо огледът — огледало и през ЛЯВОТО рамо, чак после потегляш.",
    },
    {
      n: 2,
      textBg:
        "Първа маневра — перпендикулярно паркиране на заден. Подмини гнездото между конусите, спри, огледай се и влез на заден до центъра на мястото; задръж колата спряна.",
    },
    {
      n: 3,
      textBg:
        "Излез от мястото и продължи по правата към втората станция — спокойно, с пешеходна скорост в маневрите и без да закачаш конус.",
    },
    {
      n: 4,
      textBg:
        "Втора маневра — заден ход по права линия. Заеми изходната позиция, убеди се, че отзад е чисто (чл. 40), и върни колата назад по права линия до знака.",
    },
    {
      n: 5,
      textBg:
        "Трета маневра — обръщане в три хода. Обърни посоката на 180° в коридора: напред-настрани, назад, после напред по обратната посока — с оглеждане преди всяко движение.",
    },
    {
      n: 6,
      textBg:
        "Веригата се кара като на изпит: една отсъдена грешка — закачен конус или загасване под напрежение — тежи, независимо колко чисто е било дотам. Точността е преди бързината.",
    },
  ],
  success: [
    {
      id: "sc-pgc-park",
      titleBg: "Паркирай на заден в перпендикулярното място",
      // parkInBay in the EAST band bay (>40 m from p1). Reverse credit accrues
      // within 15 m of the bay; centered stop completes it.
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.4,
        bay: PGC_BAY,
        centerTolM: 0.6,
        headingTolDeg: 12,
      },
    },
    {
      id: "sc-pgc-rev-settle",
      titleBg: "Заеми изходната позиция за заден ход по права",
      // The settle at the west end of the straight-reverse (the car has
      // transited here and stopped); maxSpeedKmh gates it to a real halt.
      params: { kind: "reachZone", x: -135, y: PGC_Y, radiusM: 3, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pgc-rev-mid",
      titleBg: "Дръж права линия по средата на заден ход",
      // The lateral band mid-reverse: radiusM 2 < a lane, so a reverse that
      // wanders off the curb line misses this gate.
      params: { kind: "reachZone", x: -127.5, y: PGC_Y, radiusM: 2 },
    },
    {
      id: "sc-pgc-rev-end",
      titleBg: "Спри след заден ход по права до знака",
      // The reverse ends here at rest (maxSpeedKmh 4 — пешеходна скорост, stopped).
      params: { kind: "reachZone", x: -120, y: PGC_Y, radiusM: 2.5, maxSpeedKmh: 4 },
    },
    {
      id: "sc-pgc-turn",
      titleBg: "Обърни посоката на 180° в три маневри",
      // Corridor-locked threePointTurn in the WEST band (>40 m from g2): the
      // reversed travel direction, at rest inside the box, in as few movements
      // as possible (a clean поли́гон turn is 3).
      params: {
        kind: "completeManeuver",
        maneuver: "threePointTurn",
        corridor: PGC_TURN,
        startHeadingDeg: 270,
        toleranceDeg: 20,
        holdSec: 0.8,
      },
    },
  ],
  rubric: {
    // The shared economy budget rides the FIRST maneuver's bay-entry attempts
    // (a clean chain parks in one); the three-point's movement count rides its
    // own objective detail for the debrief. placement is deliberately NOT
    // claimed — a capstone grades the CHAIN's cleanliness, not one bay's
    // centering — so a single economy channel carries the star math honestly.
    economy: { objectiveId: "sc-pgc-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    parTimeSec: 210,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scEdPoligonChain.ts; the §5 gate (shadow replays ZERO violations +
  // completes all five objectives) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-ed-poligon-chain-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ed-poligon-chain/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ed-poligon-chain/mistake-cone.trace.json" },
      titleBg: "Удар в конус по веригата",
      whatWentWrongBg:
        "Огледът при потеглянето беше налице — затова грешката е чиста и единствена: при влизането на заден колата тръгна твърде широко и закачи конуса, който очертава мястото. Конусът не е декор, а границата на маневрата: перпендикулярното паркиране се прави на пешеходна скорост, като следиш докъде стига колата и коригираш с волана, а не с надежда. Един закачен конус на площадката е отсъдена грешка — независимо колко чисти са били предишните маневри от веригата.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ed-poligon-chain/mistake-stall.trace.json" },
      titleBg: "Загасване под напрежение",
      whatWentWrongBg:
        "Маневрите изискват фин съединител на съвсем ниска скорост, а под напрежението на изпита кракът отпуска рязко — двигателят загасва. Загасването е второстепенна грешка и се брои всеки път, а на верига от маневри то идва точно когато вниманието е най-разпиляно. Спокоен рестарт по процедурата и продължаваш; но всяко загасване тежи в общата сметка, затова маневрите се карат бавно и с търпение, не с газ.",
      codeRefs: ["ENGINE_STALLED"],
    },
  ],
  teach: {
    whenBg:
      "На площадковата част на изпита и после при всяко реално паркиране, връщане на заден и обръщане в тясна улица. На изпита трите маневри идват една след друга — точно преходът между тях къса кандидатите: паркирал е чисто, а после е загасил при потеглянето; върнал е по права, а на обръщането е закачил конус.",
    whyBg:
      "Всяка маневра поотделно е лесна на спокойствие; трудното е да ги свържеш без нулиране на вниманието. Трите имат едно общо ядро: оглед ПРЕДИ движение (потеглянето и заден ход са маневри по чл. 25 и чл. 40), пешеходна скорост и постоянен контрол докъде стигат предницата и задницата. Който бърза, закача конус или загасва; който отпуска вниманието между маневрите, губи точно там, където изпитът го проверява. Веригата тренира издръжливостта на маневрената дисциплина: три маневри, в които нито един момент не е почивка.",
    lawRef: "Наредба № 38",
    examinerBg:
      "Изпитващият гледа целия площадков блок като едно цяло: оглед преди всяко потегляне, перпендикулярно паркиране на заден с центрирано спиране, заден ход по права линия без отклонение, обръщане в три контролирани хода с обърната посока — всичко на пешеходна скорост и без закачен конус. Закачането на конус (съоръжение) и загасването на двигателя са отсъдени грешки и се броят отделно, независимо колко чисто е карано преди тях.",
  },
  // Config-gated drill: the move-off-observation detector ships OFF
  // (rules/types.ts moveOffObservationEnabled — the A12 whole-commute pulls
  // away unglanced by default), so this capstone opts it IN. compileScenario
  // propagates it to the LIVE LessonSpec so the student's own opening pull-away
  // grades; the recorder passes the same override for the §5/§9 gates. It is NOT
  // a demonstrated fault here — it must stay off all three sheets — but the exam
  // grades the оглед and so must the drill. COLLISION and ENGINE_STALLED are
  // default-ON and need no gate.
  ruleConfig: { moveOffObservationEnabled: true },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    // L4: изпитни условия — студен старт + examMode (ladder), цялата верига без
    // прекъсване (the backlog's L4 = cold start + examMode + full chain unbroken).
    { level: 4, vehicleStart: "cold" },
    // No L5: the backlog authors rungs 1–4 only. The полигон is a closed
    // площадка (no rain/night exam maneuver) and the faults are low-speed
    // control habits, not conditions skills.
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The EXAM-DRILLS family templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_EXAM: readonly ScenarioSpec[] = [
  SC_ED_D2_CITY_RUN,
  SC_ED_D2_PRIORITY_RUN,
  SC_ED_D2_STOP_ADDRESS,
  SC_ED_REVERSE_LINE,
  SC_ED_POLIGON_CHAIN,
];
