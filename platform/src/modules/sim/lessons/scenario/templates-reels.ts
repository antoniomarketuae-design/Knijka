/**
 * templates-reels.ts — the 5 NEW theory-reel scenarios (Half-B BUILD wave, doc
 * 72 REEL_FIDELITY_CHECKLIST). Each is a why-panel drill whose RECORDED mistake
 * demo shows a fault a theory question tests, built against the fidelity list:
 * the map carries the REAL infrastructure and the mistake is visually obvious.
 *
 *  1. sc-sign-warning       [S] „Знак А15 — хлъзгав път" — hold speed through
 *     the warned slippery stretch in the rain → загуба на управление / излизане
 *     от платното (ac-ice-v1: icePatch span + auto-dropped А15 slippery sign).
 *     Grades SPEED_TOO_FAST_FOR_CONDITIONS (armed by the rain tag) + COLLISION.
 *  2. sc-driver-distraction [M] „Разсеян водач" — a DELAYED reaction to a
 *     staged pedestrian dart-out (distraction lag): the mistake reacts late and
 *     hits the walker; the shadow reacts in time. Grades COLLISION.
 *  3. sc-accident-own-conduct [M] „Поведение при собствено ПТП" — a driver's
 *     OWN collision with an obstacle, then FLEEING instead of stop/warn/stay.
 *     Grades COLLISION; the stay/warn duty is a DEBRIEF teach-beat (no fled-scene
 *     detector — the locked decision). A NEW event id keeps sc-hz-accident-scene
 *     (passing SOMEONE ELSE's crash) untouched.
 *  4. sc-animal-hazard      [M] „Животно на пътя" — an animal darts across; the
 *     driver SWERVES across the solid М1 line into the oncoming stream instead
 *     of braking straight (ov-solid-v1: solidCenterLine span). Grades
 *     CROSSED_SOLID_LINE + COLLISION. The animal is the code-built quadruped rig
 *     (vehicleFleet buildAnimalRig) shown on the ballDartOut path integrator.
 *  5. sc-lane-control-signal [L] „Сигнал над лентата (X)" — the overhead gantry
 *     closes a lane with a red ✕; the driver rides the X-closed lane, which is
 *     modelled as oncoming traffic → head-on. Grades WRONG_WAY + COLLISION (the
 *     locked decision: NO new lane-signal engine code; the X-closed lane is a
 *     one-way carriageway flowing the other way). Map lc-gantry-v1 carries the
 *     divided one-way boulevard + meta.scenario.laneGantry (LaneSignalGantry).
 *
 * Districts: 1–4 REUSE committed maps (ac-ice-v1, hz-obstacle-v1 ×2, ov-solid-v1
 * — Pattern-5 shared-map reuse); only #5 ships a new district (lc-gantry-v1,
 * tools/maps/gen_lc_gantry.mjs). All copy is original bg-BG (ADR content law).
 */

import type {
  HazardStimulusSpec,
  OncomingStreamSpec,
  PedestrianDartOutSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared lane geometry (pinned to each district's meta.scenario)
// ---------------------------------------------------------------------------

/** Right (travel) lane centre on every scenario-street micro-map, metres east. */
const LANE_RIGHT = 4.06;

// ===========================================================================
// 1. sc-sign-warning — „Знак А15: хлъзгав път" (ac-ice-v1, rain)
// ===========================================================================

export const SC_SIGN_WARNING: ScenarioSpec = {
  id: "sc-sign-warning",
  family: "conditions",
  tagsBg: ["предупредителни знаци", "хлъзгав път", "скорост според условията"],
  titleBg: "Знак А15: хлъзгав път в дъжда",
  objectiveBg:
    "Разчети предупреждението за хлъзгав участък и намали скоростта преди него, вместо да я задържиш.",
  archetypeIds: ["AC-08"],
  conceptIds: ["c-winter-ice", "c-braking-distance", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ac-ice-v1",
  },
  start: { spawnPointId: "ac-ice-spawn-approach" },
  instructionsBg: [
    { n: 1, textBg: "Вали дъжд. Знакът А15 предупреждава за хлъзгав участък напред." },
    { n: 2, textBg: "Включи къси светлини — в дъжд са задължителни." },
    { n: 3, textBg: "Отпусни газта и намали скоростта ПРЕДИ участъка, докато пътят е още сцепен." },
    { n: 4, textBg: "Премини участъка плавно, без резки движения на волана и спирачката." },
  ],
  success: [
    {
      id: "reach-end",
      titleBg: "Премини хлъзгавия участък и стигни контролната точка",
      params: { kind: "reachZone", x: LANE_RIGHT, y: 345, radiusM: 8, maxSpeedKmh: 45 },
    },
  ],
  shadow: { path: "content/traces/sc-sign-warning/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sign-warning/mistake-hold-speed.trace.json" },
      titleBg: "Задържана скорост през хлъзгавия участък",
      whatWentWrongBg:
        "Водачът не намали пред знака А15 и влезе в хлъзгавия участък с пълна скорост. В дъжда сцеплението не стига — колата се завърта и излиза от платното в крайпътния стълб.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-sign-warning/mistake-no-slowdown.trace.json" },
      titleBg: "Пълна скорост в дъжда без произшествие",
      whatWentWrongBg:
        "Този път водачът се размина без удар, но пак задържа 50 км/ч в хлъзгавия участък в дъжда. Скоростта е несъобразена с условията — рискът остава, дори когато „мине“.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
  ],
  teach: {
    whenBg: "Всеки път, когато знак предупреждава за намалено сцепление — А15, мокър, заледен или замърсен път.",
    whyBg: "Спирачният път в дъжд нараства около 1,5 пъти; върху лед — многократно. Скоростта се сваля преди участъка, не в него.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg: "Изпитващият очаква видимо намаляване на скоростта при предупредителния знак и плавно преминаване без резки корекции.",
  },
  levels: [{ level: 1 }, { level: 2 }, { level: 3 }],
  conditions: { weather: "rain" },
  localeBg: "bg-BG",
};

// ===========================================================================
// 2. sc-driver-distraction — „Разсеян водач" (hz-obstacle-v1, pedestrian dart)
// ===========================================================================

/** The staged walker (PE-04 dart-out mold; synthetic crossing id — no district
 *  crossing zone, so PEDESTRIAN_NOT_YIELDED never arms and the demo grades the
 *  late reaction as COLLISION, cf. sc-hz-emergency-stop).
 *
 *  triggerDistM 78 IS THE LESSON (founder R0: „the driver and the car are
 *  nowhere near colliding — the pedestrian moves on top of it 4–5 s after").
 *  The walker needs 13.6 m of walk (2.4 m/s ⇒ 5.65 s) to reach the travel lane
 *  at x = 4.06. At the mistake's 50 km/h (13.9 m/s) the old 34 m trigger gave
 *  her 2.45 s — she was still 8 m short of the car when the „collision" beat
 *  fired, i.e. the demo showed a car stopping at nothing. Releasing her ~78 m
 *  out (≈ 5.6 s at 50) puts her IN THE EGO'S LANE exactly as the distracted
 *  driver arrives, so the staged runner's own contact check convicts — the
 *  COLLISION is a real meeting, not an authored beat over an empty road.
 *  It is also the honest pedagogy: the walker was visible for five full
 *  seconds, which is precisely why the attentive shadow stops in time. */
const DISTRACTION_PED: PedestrianDartOutSpec = {
  id: "sc-distraction-ped",
  kind: "pedestrianDartOut",
  crossingId: "hzd-dart", // synthetic — no matching district crossing
  crossing: { x: 0, y: 140 },
  start: { x: -9.5, y: 140 },
  dir: { x: 1, y: 0 },
  speedMps: 2.4,
  travelM: 20,
  roadFromM: 1.6,
  roadToM: 16,
  triggerDistM: 78,
  minTriggerSpeedKmh: 10,
};

export const SC_DRIVER_DISTRACTION: ScenarioSpec = {
  id: "sc-driver-distraction",
  family: "hazards",
  tagsBg: ["разсейване", "внимание", "пешеходец", "реакция"],
  titleBg: "Разсеян водач: закъсняла реакция",
  objectiveBg:
    "Задръж вниманието върху пътя, за да реагираш навреме, когато пешеходец внезапно излезе на платното.",
  archetypeIds: ["PE-04"],
  conceptIds: ["c-crosswalk-yield", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    params: { lengthM: 240, maxspeedKmh: 50 },
    districtId: "hz-obstacle-v1",
  },
  start: { spawnPointId: "hz-spawn-approach" },
  instructionsBg: [
    { n: 1, textBg: "Гледай пътя напред — не таблото, телефона или спътника." },
    { n: 2, textBg: "Наблюдавай тротоара и междините между колите — оттам излиза пешеходец." },
    { n: 3, textBg: "Пешеходец може да излезе внезапно отляво. Дръж крак готов над спирачката." },
    { n: 4, textBg: "Реагирай веднага щом го видиш и спри преди мястото на пресичане." },
  ],
  success: [
    {
      id: "reach-end",
      titleBg: "Реагирай навреме и стигни контролната точка",
      params: { kind: "reachZone", x: LANE_RIGHT, y: 225, radiusM: 8 },
    },
  ],
  shadow: { path: "content/traces/sc-driver-distraction/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-driver-distraction/mistake-late-react.trace.json" },
      titleBg: "Закъсняла реакция от разсейване",
      whatWentWrongBg:
        "Погледът на водача беше настрани и той видя пешеходеца твърде късно. Реакцията закъсня с част от секундата — точно колкото да не спре навреме и да го удари.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-driver-distraction/mistake-no-brake.trace.json" },
      titleBg: "Изобщо без реакция — поглед в телефона",
      whatWentWrongBg:
        "Водачът не вдигна поглед и не докосна спирачката. Колата премина мястото на пресичане с непроменена скорост и удари пешеходеца — цената на един поглед встрани.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg: "Постоянно — всяко отклоняване на погледа от пътя удължава реакцията с метри спирачен път.",
    whyBg: "При 50 км/ч колата изминава ~14 м в секунда. Един поглед към телефона е достатъчен да пропуснеш излизащ пешеходец.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg: "Изпитващият очаква непрекъснато наблюдение на пътя и навременна, спокойна реакция при поява на пешеходец.",
  },
  levels: [{ level: 1 }, { level: 2 }, { level: 3 }],
  staged: [DISTRACTION_PED],
  hazard: {
    kind: "ballDartOut",
    x: -9.5,
    y: 140,
    dirX: 1,
    dirY: 0,
    speedMps: 2.4,
    travelM: 20,
  } satisfies HazardStimulusSpec,
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ===========================================================================
// 3. sc-accident-own-conduct — „Поведение при собствено ПТП" (hz-obstacle-v1)
//    NEW event id ev-accident-own-conduct (see whyPanel EVENT_TO_SCENARIO).
// ===========================================================================

export const SC_ACCIDENT_OWN_CONDUCT: ScenarioSpec = {
  id: "sc-accident-own-conduct",
  family: "hazards",
  tagsBg: ["ПТП", "поведение при произшествие", "аварийни светлини", "задължения"],
  titleBg: "Поведение при собствено ПТП",
  objectiveBg:
    "Заобиколи безопасно паркирания автомобил; ако все пак го удариш — спри, обезопаси и остани, не бягай.",
  archetypeIds: ["OV-18", "VP-12"],
  conceptIds: ["c-general-care-duty", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    params: { lengthM: 240, maxspeedKmh: 50 },
    districtId: "hz-obstacle-v1",
  },
  start: { spawnPointId: "hz-spawn-approach" },
  instructionsBg: [
    { n: 1, textBg: "Отпред на платното има паркиран автомобил. Заобиколи го плавно, без да го закачаш." },
    { n: 2, textBg: "Прецени страничната дистанция — мини встрани, без да го докосваш." },
    { n: 3, textBg: "Ако настъпи удар, това е ПТП с твое участие — длъжен си да спреш веднага." },
    { n: 4, textBg: "Включи аварийни светлини, обезопаси мястото и остани — бягството е тежко нарушение." },
  ],
  success: [
    {
      id: "reach-end",
      titleBg: "Заобиколи автомобила и стигни контролната точка",
      params: { kind: "reachZone", x: LANE_RIGHT, y: 225, radiusM: 8 },
    },
  ],
  shadow: { path: "content/traces/sc-accident-own-conduct/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-accident-own-conduct/mistake-hit-and-flee.trace.json" },
      titleBg: "Удар в паркирания автомобил и бягство",
      whatWentWrongBg:
        "Водачът закачи паркирания автомобил и вместо да спре, обезопаси и остане, продължи напред. Напускането на място на ПТП е самостоятелно тежко нарушение — след удар се спира винаги.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-accident-own-conduct/mistake-clip-continue.trace.json" },
      titleBg: "Одраскване и продължаване „все едно нищо не е било“",
      whatWentWrongBg:
        "Дори леко закачане е ПТП. Водачът усети допира, но реши, че „няма нищо“, и продължи. Точно това е напускане на място на произшествие — задължението да спреш не зависи от силата на удара.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg: "При всяко пътнотранспортно произшествие с твое участие — колкото и дребно да изглежда.",
    whyBg: "Дори лек удар е ПТП: спираш, включваш аварийни, поставяш триъгълника и оставаш. Бягството отнема правата и е престъпление при пострадали.",
    lawRef: "ЗДвП чл. 123",
    examinerBg: "Изпитващият очаква безопасно заобикаляне; при контакт — незабавно спиране и обезопасяване, никога продължаване.",
  },
  levels: [{ level: 1 }, { level: 2 }, { level: 3 }],
  localeBg: "bg-BG",
};

// ===========================================================================
// 4. sc-animal-hazard — „Животно на пътя" (ov-solid-v1: solid М1 + oncoming)
// ===========================================================================

/** Southbound oncoming bank on ov-solid-v1's two-way street (the collision
 *  target of a panic swerve across the М1 line). */
const ANIMAL_ONCOMING: OncomingStreamSpec = {
  id: "sc-animal-oncoming",
  kind: "oncomingStream",
  libraryEventId: "ev-animal-hazard",
  actor: {
    pathNodes: ["ovs-n-end", "ovs-n-start"], // southbound = oncoming
    hold: { nodeIndex: 0, offsetM: 150 },
    cruiseSpeedMps: 10,
    colorIndex: 1,
  },
  count: 2,
  gapsM: [45],
  releaseKmh: 8,
};

export const SC_ANIMAL_HAZARD: ScenarioSpec = {
  id: "sc-animal-hazard",
  family: "hazards",
  tagsBg: ["животно на пътя", "непрекъсната осева линия", "насрещно движение"],
  titleBg: "Животно на пътя: спри, не отбивай в насрещното",
  objectiveBg:
    "Когато животно изскочи на пътя, спирай право в лентата си — не пресичай непрекъснатата линия в насрещното движение.",
  archetypeIds: ["OV-04"],
  conceptIds: ["c-longitudinal-markings", "c-general-care-duty", "c-speed-adaptation"],
  map: {
    archetype: "straight-street",
    params: {
      lengthM: 340,
      maxspeedKmh: 50,
      banKind: "solidCenterLine",
      banFromM: 90,
      banToM: 230,
    },
    districtId: "ov-solid-v1",
  },
  start: { spawnPointId: "ovs-spawn-start" },
  instructionsBg: [
    { n: 1, textBg: "Осевата линия е непрекъсната (М1) — пресичането ѝ е забранено." },
    { n: 2, textBg: "Наблюдавай крайпътните храсти и банкета — оттам може да изскочи животно." },
    { n: 3, textBg: "Ако животно изскочи, спирай право и решително в своята лента." },
    { n: 4, textBg: "Не отбивай в насрещното — там идват коли, а ударът челно е много по-тежък." },
  ],
  success: [
    {
      id: "reach-end",
      titleBg: "Спри за животното и продължи в лентата си до края",
      params: { kind: "reachZone", x: LANE_RIGHT, y: 325, radiusM: 8 },
    },
  ],
  shadow: { path: "content/traces/sc-animal-hazard/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-animal-hazard/mistake-swerve-oncoming.trace.json" },
      titleBg: "Отбиване в насрещното при животното",
      whatWentWrongBg:
        "При изскочилото животно водачът рязко зави наляво през непрекъснатата осева линия — право срещу насрещния автомобил. Правилото е обратното: спира се право в лентата, ударът с животно е по-малкото зло от челен сблъсък.",
      codeRefs: ["CROSSED_SOLID_LINE", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-animal-hazard/mistake-cross-line.trace.json" },
      titleBg: "Пресичане на осевата линия за заобикаляне",
      whatWentWrongBg:
        "Насрещното този път беше чисто, но водачът пак пресече непрекъснатата осева линия, за да заобиколи животното наляво. Пресичането на М1 е забранено — при животно се спира право, не се навлиза в насрещната лента.",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
  ],
  teach: {
    whenBg: "При внезапно препятствие или животно на пътя, когато инстинктът тласка към рязко отбиване.",
    whyBg: "Отбиването в насрещното сменя дребен удар с челен сблъсък. Непрекъснатата линия пази точно този сценарий — спира се право.",
    lawRef: "ЗДвП чл. 63",
    examinerBg: "Изпитващият очаква спиране в собствената лента без пресичане на осевата линия при поява на препятствие.",
  },
  levels: [{ level: 1 }, { level: 2 }, { level: 3 }],
  staged: [ANIMAL_ONCOMING],
  hazard: {
    kind: "ballDartOut",
    x: -9,
    y: 152,
    dirX: 1,
    dirY: 0,
    speedMps: 5,
    travelM: 18,
    presentation: "animal",
  } satisfies HazardStimulusSpec,
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ===========================================================================
// 5. sc-lane-control-signal — „Сигнал над лентата (X)" (lc-gantry-v1)
// ===========================================================================

/** Oncoming stream on the X-closed (southbound one-way) carriageway — the
 *  head-on the driver meets by riding the closed lane. */
const LC_ONCOMING: OncomingStreamSpec = {
  id: "sc-lc-oncoming",
  kind: "oncomingStream",
  libraryEventId: "ev-lane-control-signal",
  actor: {
    pathNodes: ["lcg-n-closed-n", "lcg-n-closed-s"], // southbound carriageway
    hold: { nodeIndex: 0, offsetM: 150 },
    cruiseSpeedMps: 11,
    colorIndex: 1,
  },
  count: 2,
  gapsM: [50],
  releaseKmh: 8,
};

export const SC_LANE_CONTROL_SIGNAL: ScenarioSpec = {
  id: "sc-lane-control-signal",
  family: "lanes",
  tagsBg: ["сигнал над лентата", "затворена лента", "движение в насрещното"],
  titleBg: "Сигнал над лентата: червен X",
  objectiveBg:
    "Червеният X над лентата я затваря — карай в лентата със зелена стрелка, не в затворената насрещна.",
  archetypeIds: ["OV-13"],
  conceptIds: ["c-sign-groups", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "lc-gantry-v1",
  },
  start: { spawnPointId: "lcg-spawn-start" },
  instructionsBg: [
    { n: 1, textBg: "Над платното виси сигнален портал: зелена стрелка ↓ над отворената лента, червен X над затворената." },
    { n: 2, textBg: "Прочети сигнала над всяка лента, преди да минеш под портала." },
    { n: 3, textBg: "Карай само в лентата със зелената стрелка." },
    { n: 4, textBg: "Не навлизай в лентата с червения X — тя е затворена и там идва насрещно движение." },
  ],
  success: [
    {
      id: "reach-end",
      titleBg: "Остани в отворената лента до контролната точка",
      params: { kind: "reachZone", x: 6, y: 345, radiusM: 8 },
    },
  ],
  shadow: { path: "content/traces/sc-lane-control-signal/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-lane-control-signal/mistake-closed-lane.trace.json" },
      titleBg: "Навлизане в затворената лента (червен X)",
      whatWentWrongBg:
        "Водачът пренебрегна червения X и навлезе в затворената лента. Тя е с насрещно движение — резултатът е движение срещу потока и челен сблъсък с идващата кола.",
      codeRefs: ["WRONG_WAY", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-lane-control-signal/mistake-wrong-way.trace.json" },
      titleBg: "Движение срещу потока в затворената лента",
      whatWentWrongBg:
        "Дори без насрещна кола в момента, карането на север в лента, отредена за юг (червен X), е движение срещу потока. Затворената с X лента е насрещна — влизането в нея е нарушение само по себе си.",
      codeRefs: ["WRONG_WAY"],
    },
  ],
  teach: {
    whenBg: "На булеварди и тунели със сигнални портали над лентите (обратим трафик, ремонт, произшествие напред).",
    whyBg: "Червеният X не е препоръка — лентата е физически затворена и често служи за насрещно движение. Навлизането е движение срещу потока.",
    lawRef: "ЗДвП чл. 6",
    examinerBg: "Изпитващият очаква движение само в лентата с разрешаващ сигнал и никакво навлизане в затворена с X лента.",
  },
  levels: [{ level: 1 }, { level: 2 }, { level: 3 }],
  staged: [LC_ONCOMING],
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------

export const SCENARIO_TEMPLATES_REELS: readonly ScenarioSpec[] = [
  SC_SIGN_WARNING,
  SC_DRIVER_DISTRACTION,
  SC_ACCIDENT_OWN_CONDUCT,
  SC_ANIMAL_HAZARD,
  SC_LANE_CONTROL_SIGNAL,
];
