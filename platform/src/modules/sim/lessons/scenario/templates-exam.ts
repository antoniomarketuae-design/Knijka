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
        "Тръгни по отбивката на юг-запад. Това е цял изпитен сегмент — карай непрекъснато, както на истински изпит.",
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
      titleBg: "Спри напълно на знак Б2 и огледай",
      // Just past the Б2 node n2945503673, on the slip road's only lane.
      params: { kind: "reachZone", x: -300.35, y: 79.94, radiusM: 12 },
    },
    {
      id: "sc-edpr-signal",
      titleBg: "Премини светофара и завий надясно",
      // Curb lane of Стоян Михайловски past the n4873770118 complex.
      params: { kind: "reachZone", x: -516.35, y: -128.17, radiusM: 14 },
    },
    {
      id: "sc-edpr-leftturn",
      titleBg: "Завий наляво по „Златовръх“ след насрещния",
      // Златовръх's single lane, ~35 m past the n4547529959 mouth — clear of
      // the turn arc (where the line legitimately rides wide of lane center)
      // and still short of the next node.
      params: { kind: "reachZone", x: -671.26, y: 33.98, radiusM: 10 },
    },
    {
      id: "sc-edpr-finish",
      titleBg: "Пропусни колата отдясно и довърши сегмента",
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
 * heuristic zone inference, ever"). d2-v1 carries no `zones` array at all: it is
 * an OSM cut (ADR-007) and build_district_d2.mjs emits no zone pass, so no ban
 * span exists anywhere in Лозенец. Nothing here fakes one. Site selection is
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
    {
      n: 3,
      textBg:
        "Излез в лентата и набери спокойни 45 км/ч. Улицата е жилищна, ограничението е 50 — карай под него, без да пълзиш.",
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
        "Планирай спирането отрано: огледало, десен мигач, плавно намаляване и спиране плътно вдясно до бордюра. Ако трябва да набиеш спирачките, за да уловиш мястото — мястото не е удобно.",
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
      // gate (HONEST LIMIT 1: no ban-zone detector exists on d2-v1).
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

/** The EXAM-DRILLS family templates (registered in templates.ts). */
export const SCENARIO_TEMPLATES_EXAM: readonly ScenarioSpec[] = [
  SC_ED_D2_CITY_RUN,
  SC_ED_D2_PRIORITY_RUN,
  SC_ED_D2_STOP_ADDRESS,
];
