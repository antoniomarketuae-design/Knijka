/**
 * Scenario templates — the SPEED-MANAGEMENT family, S3 batch 2 (doc 72 §8
 * „Family SP"): three ✅ FULL overspeed archetypes staged on purpose-built
 * straight-street micro-maps, DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district files so nothing loads world JSON at
 * runtime; the trace-gate batteries assert every pinned value against the
 * generated maps):
 *
 *  - sc-speed-creep     „Пълзящо превишаване"  (SP-01, sp-creep-v1)
 *  - sc-speed-dangerous „Над +10 км/ч"         (SP-02, sp-danger-v1)
 *  - sc-speed-rain      „Скорост в дъжд"        (SP-04, sp-rain-v1, ×N)
 *
 * Each mistake demo cites SHIPPED rules-catalog SPEED codes and grades EXACTLY
 * them, with NO extra codes, when replayed through the production stack (the
 * §5/§9 gates, traces/__tests__/sp-speed-*-traces.test.ts):
 *   - SP-01 → SPEEDING_OVER_LIMIT (второстепенна: 51–60 in a 50 zone);
 *   - SP-02 → SPEEDING_DANGEROUS  (опасна: > +10 км/ч — the exam-termination band);
 *   - SP-04 → SPEED_TOO_FAST_FOR_CONDITIONS (второстепенна: legal but imprudent
 *     for rain/night — the rain factor 0.85 × 50 = 42.5 km/h envelope).
 *
 * The maps carry NO crossing, junction, signal or sign, and every drive runs
 * ambient traffic ZERO (seed 7): the ONLY fault the rule engine can grade is
 * the driver's own speed. The shadow drives disciplined and clean and earns the
 * family positive CLEAN_DRIVING (a sustained violation-free streak).
 *
 * Family: "speed" — the catalog chip added for the SP family (doc 72 §8);
 * the ids (sc-speed-*) match the sc-<family>-<slug> naming standard.
 *
 * Doc-72 provenance: all three are marked "Engine: ✅ FULL". SP-03 (zone
 * transition), SP-05..SP-11 (curve/slow/night/warning-sign/red-drag/harsh-brake)
 * are 🟡 PARTIAL or 🔴 NEW and skipped; SP-12 grades a crossing code (pedestrian
 * family); SP-13 needs ambient traffic set over the limit, which the determinism
 * law (ambient 0) forbids — all left for later waves.
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constant (pinned from the generated districts by value —
// the L7 pattern; the sp-districts battery asserts the copy matches the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of a 1-lane-per-direction street (sp-*-v1). */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// 1. sc-speed-creep — „Пълзящо превишаване" (SP-01) on sp-creep-v1
//    (360 m straight street, limit 50)
// ---------------------------------------------------------------------------

/** SP-01 — движение над разрешената скорост в рамките на +10 км/ч (ЗДвП
 *  чл. 21: ограничението е таван, не цел). */
export const SC_SPEED_CREEP: ScenarioSpec = {
  id: "sc-speed-creep",
  family: "speed",
  tagsBg: ["скорост", "ограничение на скоростта", "градско каране", "самоконтрол"],
  titleBg: "Пълзящо превишаване на скоростта",
  objectiveBg:
    "Измини правата улица, като държиш скоростта под разрешените 50 км/ч през цялото време — ограничението е таван, не цел, и „с потока“ не е оправдание.",
  archetypeIds: ["SP-01"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-creep-v1.json meta.scenario.params
    // (tools/maps/gen_sp_speed.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-creep-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица — ограничението е 50 км/ч." },
    { n: 2, textBg: "Установи спокойна скорост около 46–48 км/ч и я задръж — остави си резерв под тавана." },
    { n: 3, textBg: "Поглеждай скоростомера от време на време; в равномерно движение скоростта пълзи нагоре неусетно." },
    { n: 4, textBg: "Не се води по „потока“ — дори другите да карат по-бързо, таванът за теб остава 50 км/ч." },
    { n: 5, textBg: "Продължи под ограничението до края на отсечката." },
  ],
  success: [
    {
      id: "sc-crp-under-limit",
      titleBg: "Мини контролната зона под ограничението",
      // reachZone with a speed cap just above the taught cruise (46–48): a
      // disciplined drive satisfies it, a „с потока" speeder at 57 does not.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 52 },
    },
    {
      id: "sc-crp-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 55 },
  shadow: { path: "content/traces/sc-speed-creep/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-creep/mistake-flow-along.trace.json" },
      titleBg: "Носене с потока",
      whatWentWrongBg:
        "Колата задържа около 57 км/ч, защото „всички карат така“ — но 51–60 км/ч в зона 50 е второстепенна грешка. Ограничението е таван за всеки поотделно; потокът не го вдига.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-creep/mistake-creep-up.trace.json" },
      titleBg: "Скоростта пълзи нагоре",
      whatWentWrongBg:
        "Без поглед към скоростомера скоростта се покачи от законните 48 до 59 км/ч — усещането е същото, но стрелката вече е над тавана. Превишаването до +10 км/ч е второстепенна грешка, която се трупа.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "При всяко продължително движение с постоянна скорост в града — по булеварди и прави отсечки, където потокът тегли нагоре и стрелката пълзи, без да усетиш.",
    whyBg:
      "Рискът от тежко нараняване при удар расте стръмно със скоростта — няколко километра в час над тавана свиват дистанцията за спиране и полето на видимост точно там, където се появяват пешеходци. Ограничението е граница, оставяш си резерв под нея, не я доближаваш.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците през целия маршрут: движение над разрешеното е грешка дори без друга злополука, а над +10 км/ч е опасна грешка и прекратява изпита. Дръж стрелката осезаемо под тавана.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-speed-dangerous — „Над +10 км/ч" (SP-02) on sp-danger-v1
//    (400 m straight street, limit 50)
// ---------------------------------------------------------------------------

/** SP-02 — превишаване с повече от 10 км/ч (ЗДвП чл. 21; doc 32: опасна
 *  грешка — изпитът се прекратява). */
export const SC_SPEED_DANGEROUS: ScenarioSpec = {
  id: "sc-speed-dangerous",
  family: "speed",
  tagsBg: ["скорост", "ограничение на скоростта", "опасна грешка", "изпит"],
  titleBg: "Превишаване над +10 км/ч",
  objectiveBg:
    "Измини правата улица, без нито веднъж да превишиш с повече от 10 км/ч разрешените 50 — над +10 км/ч е опасна грешка, която на изпита означава директно отпадане.",
  archetypeIds: ["SP-02"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-danger-v1.json meta.scenario.params.
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "sp-danger-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица — ограничението е 50 км/ч." },
    { n: 2, textBg: "Ускорявай плавно и спри покачването около 46–48 км/ч; не давай пълна газ „защото е чисто“." },
    { n: 3, textBg: "Помни границата: 60 км/ч (+10) е опасната граница на изпита, не буфер за прекрачване." },
    { n: 4, textBg: "Дръж крака готов да вдигнеш газта — скоростта се сваля преди да е станала проблем." },
    { n: 5, textBg: "Продължи под ограничението до края на отсечката." },
  ],
  success: [
    {
      id: "sc-dng-under-limit",
      titleBg: "Мини контролната зона под ограничението",
      params: { kind: "reachZone", x: LANE_X, y: 200, radiusM: 10, maxSpeedKmh: 52 },
    },
    {
      id: "sc-dng-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 370, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 60 },
  shadow: { path: "content/traces/sc-speed-dangerous/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-dangerous/mistake-flooring.trace.json" },
      titleBg: "Пълна газ след потеглянето",
      whatWentWrongBg:
        "Колата даде пълна газ и стрелката прескочи 60, стигайки около 66 км/ч. Над +10 км/ч над ограничението е опасна грешка — на практическия изпит това е незабавно отпадане.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-dangerous/mistake-accelerate.trace.json" },
      titleBg: "Ускоряване без поглед към скоростомера",
      whatWentWrongBg:
        "Силното ускоряване изнесе скоростта до около 63 км/ч в зона 50 — отново над +10 км/ч. Опасната грешка не изисква злополука: самото прекрачване на границата прекратява изпита.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "При ускоряване по свободна отсечка, надолнище или след кръстовище — точно там, където кракът натежава и стрелката минава +10 км/ч, без да усетиш.",
    whyBg:
      "Наредба № 38 отделя превишаването с повече от 10 км/ч като опасна грешка не случайно: при тази скорост спирачният път и тежестта на евентуалния удар нарастват рязко. Затова +10 км/ч е граница, а не буфер — вдигаш газта веднага щом видиш знака.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростомера спрямо знаците през целия маршрут. Едно превишаване с повече от 10 км/ч е опасна грешка и прекратява изпита на място — дръж скоростта осезаемо под тавана и никога не се доближавай до +10 км/ч.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-speed-rain — „Скорост в дъжд през нощта" (SP-04, ×N) on sp-rain-v1
//    (360 m straight street, limit 50, recorded at night in the rain)
// ---------------------------------------------------------------------------

/** SP-04 — несъобразена с дъжда/нощта скорост (ЗДвП чл. 20: скорост, при която
 *  водачът може да спре в рамките на видимото платно). */
export const SC_SPEED_RAIN: ScenarioSpec = {
  id: "sc-speed-rain",
  family: "speed",
  tagsBg: ["скорост", "дъжд", "нощно каране", "съобразена скорост"],
  titleBg: "Скорост в дъжд през нощта",
  objectiveBg:
    "Измини правата улица в дъжд и тъмнина с чувствително намалена скорост — под ограничението не е достатъчно; съобразената скорост е тази, при която спираш в рамките на видимото платно.",
  archetypeIds: ["SP-04"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-rain-aquaplaning", "c-night-visibility"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-rain-v1.json meta.scenario.params.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-rain-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица в дъжд и тъмнина — ограничението е 50 км/ч, но условията искат по-малко." },
    { n: 2, textBg: "Свали скоростта с около 10–15% под тавана — тук това значи около 38 км/ч." },
    { n: 3, textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг, а фаровете осветяват само няколко метра напред." },
    { n: 4, textBg: "Карай така, че да можеш да спреш в рамките на осветеното платно пред теб." },
    { n: 5, textBg: "Задръж намалената за условията скорост до края на отсечката." },
  ],
  success: [
    {
      id: "sc-rn-adapted",
      titleBg: "Мини контролната зона със съобразена за дъжда скорост",
      // Cap 42 km/h sits just under the rain envelope (0.85 × 50 = 42.5): the
      // adapted ~38 km/h drive satisfies it; a dry-speed 50 km/h does not.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 42 },
    },
    {
      id: "sc-rn-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-rain/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-rain/mistake-dry-speed.trace.json" },
      titleBg: "Суха скорост в дъжда",
      whatWentWrongBg:
        "Колата държа 50 км/ч, все едно е сух ден — законно по знак, но несъобразено с дъжда и тъмнината. При намалена видимост и хлъзгав път съобразената скорост е чувствително по-ниска (чл. 20); това е второстепенна грешка.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-rain/mistake-flow-along.trace.json" },
      titleBg: "Каране с потока в дъжда",
      whatWentWrongBg:
        "Около 48 км/ч „с потока“ — под знака, но твърде бързо за мокрия път и слабата видимост. Съобразената скорост не се чете от знака, а от условията: намали до около 38 км/ч.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
  ],
  teach: {
    whenBg:
      "При дъжд, мокър път, мъгла или тъмнина — тогава разрешеното по знак вече не е съобразеното. Видимостта и сцеплението падат, а с тях трябва да падне и скоростта.",
    whyBg:
      "На мокър и тъмен път спирачният път нараства около 1,4 пъти, а фаровете осветяват само няколко метра — карането на „сухата“ скорост означава да летиш към участък, който още не виждаш. Съобразената скорост връща и разстоянието за спиране, и времето за реакция.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият очаква видимо намаляване за условията — не просто спазен знак. Несъобразената с дъжда/нощта скорост се отбелязва като грешка; съобразена е тази, при която спираш в рамките на видимото платно.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "rain", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-speed-zone — „Зона 30 (училище/жилищна)" (SP-03 / PE-07) on
//    sp-zone30-v1 (360 m straight street posted 30 — the whole street IS the
//    zone; the map's own maxspeed grades it, no zone map layer needed)
// ---------------------------------------------------------------------------

/**
 * SP-03 / PE-07 — съобразяване с по-ниско ограничение в зона 30 (ЗДвП чл. 21).
 * ONE template, TWO DISTINCT codes (the sc-vp-readiness / sc-ov-lane-keeping
 * precedent): the SAME 50 км/ч, законна по булевард, в зона 30 е ОПАСНА грешка.
 *   - „Скорост от булеварда" (~37 км/ч) → SPEEDING_OVER_LIMIT (31–40 в зона 30
 *     → второстепенна; над грациозния 33, под опасния праг 40);
 *   - „Пълни 50 през зоната" (~50 км/ч) → SPEEDING_DANGEROUS (> +10 = > 40 →
 *     опасна). Колата минава лентата 33–40 за под 2 s (движещ праг), затова
 *     второстепенният код не се арма — точно като sc-speed-dangerous „flooring".
 */
export const SC_SPEED_ZONE: ScenarioSpec = {
  id: "sc-speed-zone",
  family: "speed",
  tagsBg: ["скорост", "зона 30", "училищна зона", "жилищна зона"],
  titleBg: "Зона 30 — училище и жилищен квартал",
  objectiveBg:
    "Измини улицата в зона 30, като държиш скоростта под 30 км/ч през цялото време — там, където има деца и пешеходци, същите 50 км/ч, законни по булеварда, стават опасна грешка.",
  archetypeIds: ["SP-03", "PE-07"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-zone30-v1.json meta.scenario.params.
    params: { lengthM: 360, maxspeedKmh: 30 },
    districtId: "sp-zone30-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Влизаш в зона 30 — училище и жилищен квартал. Ограничението тук е 30 км/ч, не 50." },
    { n: 2, textBg: "Свали скоростта осезаемо още на знака и установи спокойни около 26–28 км/ч." },
    { n: 3, textBg: "Между паркираните коли и дворовете всеки момент може да излезе дете — карай с готовност за спиране." },
    { n: 4, textBg: "Не пренасяй „скоростта от булеварда“ в зоната: 50 км/ч тук е над +10 км/ч, тоест опасна грешка." },
    { n: 5, textBg: "Задръж под 30 км/ч до края на зоната." },
  ],
  success: [
    {
      id: "sc-zn-under-limit",
      titleBg: "Мини контролната зона под 30 км/ч",
      // Cap 33 (= graced limit) sits just above the taught ~27 cruise: a
      // disciplined drive satisfies it, a 37+ speeder does not.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 33 },
    },
    {
      id: "sc-zn-finish",
      titleBg: "Стигни края на зоната",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-zone/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-zone/mistake-boulevard-speed.trace.json" },
      titleBg: "Скорост от булеварда в зона 30",
      whatWentWrongBg:
        "Колата задържа около 37 км/ч — нормална за булевард, но в зона 30 това е превишаване. 31–40 км/ч тук е второстепенна грешка; знакът смени тавана, скоростта трябваше да го последва.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-zone/mistake-full-speed.trace.json" },
      titleBg: "Пълни 50 през зоната",
      whatWentWrongBg:
        "Колата премина зоната с около 50 км/ч, все едно е булевард. В зона 30 това е над +10 км/ч — опасна грешка, която на изпита означава отпадане, а на улицата е разликата между спиране и прегазено дете.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
  ],
  teach: {
    whenBg:
      "При всяка зона 30 — пред училища, детски градини, в жилищни квартали и там, където знакът В26 или табелата „Зона 30“ смъква тавана. Ниският лимит не е формалност: той е избран заради децата и пешеходците.",
    whyBg:
      "При 30 км/ч спирачният път и тежестта на удара са в пъти по-малки, отколкото при 50 — затова зоните 30 се поставят точно там, където пешеходец изскача без предупреждение. Пренасянето на булевардната скорост в зоната заличава цялото предимство, за което зоната съществува.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците: при влизане в зона с по-ниско ограничение очаква видимо и навременно намаляване. Движение над лимита в зоната е грешка, а над +10 км/ч (тук 40) — опасна грешка, която прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The speed-management templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_SP: readonly ScenarioSpec[] = [
  SC_SPEED_CREEP,
  SC_SPEED_DANGEROUS,
  SC_SPEED_RAIN,
  SC_SPEED_ZONE,
];
