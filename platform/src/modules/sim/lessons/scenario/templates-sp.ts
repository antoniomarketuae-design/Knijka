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
 * Doc-72 provenance: the batch-2 three are marked "Engine: ✅ FULL". Later
 * waves in this file: SP-03 (zone/transition — sc-speed-zone + sc-speed-
 * transition), SP-11/VP-09 (harsh brake — sc-sp-harsh-brake), SP-05
 * (curve envelope — sc-sp-curve on the rural-curve archetype + the
 * curveAdvisory zone layer) and SP-10 (the motorway-segment archetype —
 * sc-mw-discipline on mw-v1: the edge motorway tag arms the SP-10 crawl
 * detector, and OV-11's keep-right works at 130 with zero new code).
 * SP-06..SP-09 stay 🟡/🔴; SP-12 grades a crossing code (pedestrian family);
 * SP-13 needs ambient traffic set over the limit, which the determinism law
 * (ambient 0) forbids — left for later waves.
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

// ---------------------------------------------------------------------------
// 5. sc-speed-transition — „Преход 50→30 (навлизане в зона 30)" (SP-03) on
//    sp-trans-v1: a street built from TWO segments — a 160 m approach posted 50
//    then a 200 m zone posted 30 — so the limit DROPS mid-route. The runtime
//    grades PER EDGE (each segment carries its own maxspeed), so keeping the
//    approach speed past the transition sign fires the speeding codes against
//    the LOCAL 30, not the 50 the driver just left.
// ---------------------------------------------------------------------------

/** Transition Y of sp-trans-v1 (= approachM); the В26 „Зона 30" sign line. */
const TRANS_Y = 160;

/**
 * SP-03 — „Преходът на зони / Zone-transition blindness (50→30)" (ЗДвП чл. 21).
 * The distinct value vs sc-speed-zone (a homogeneous 30-street): here the limit
 * actually CHANGES mid-route, so the taught fault is the missing anticipatory
 * lift at the sign. ONE template, TWO DISTINCT codes against the LOCAL 30 limit:
 *   - „Само наполовина намалена" (~37 km/h) → SPEEDING_OVER_LIMIT (31–40 in the
 *     30 zone → второстепенна);
 *   - „Скоростта от преди зоната" (~48 km/h carried straight through) →
 *     SPEEDING_DANGEROUS (> +10 = > 40 → опасна). The speed stays above 40
 *     across the sign, so it never dwells in the 33–40 minor band — only the
 *     dangerous code arms (the sc-speed-dangerous „flooring" pattern). Neither
 *     fault grades on the 50 APPROACH: 48 < the graced 55 there.
 */
export const SC_SPEED_TRANSITION: ScenarioSpec = {
  id: "sc-speed-transition",
  family: "speed",
  tagsBg: ["скорост", "зона 30", "преход на зони", "навлизане в зона", "училищна зона"],
  titleBg: "Преход 50→30 — навлизане в зона 30",
  objectiveBg:
    "Намали НАВРЕМЕ на знака за зона 30: улицата минава от 50 на 30 км/ч в средата на маршрута, а скоростта трябва да падне заедно със знака — пренесеш ли скоростта от преди зоната, тя става грешка още с влизането.",
  archetypeIds: ["SP-03"],
  conceptIds: ["c-speed-limits", "c-speed-adaptation", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in sp-trans-v1.json meta.scenario.params
    // (tools/maps/gen_sp_transition.mjs): 160 m @ 50 → 200 m @ 30.
    params: { approachM: 160, zoneM: 200, approachKmh: 50, zoneKmh: 30 },
    districtId: "sp-trans-v1",
  },
  start: {
    spawnPointId: "sp-tr-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица — тук ограничението все още е 50 км/ч." },
    { n: 2, textBg: "Напред следва знак за зона 30 (училище/жилищна). Забележи го отрано — намаляването започва преди знака, не след него." },
    { n: 3, textBg: "Вдигни крака от газта навреме и влез в зоната вече под 30 км/ч — около 26–28 км/ч." },
    { n: 4, textBg: "Не пренасяй скоростта от преди зоната: същите 50 км/ч, законни допреди малко, в зоната са над +10 км/ч — опасна грешка." },
    { n: 5, textBg: "Задръж под 30 км/ч до края на зоната." },
  ],
  success: [
    {
      id: "sc-trn-approach",
      titleBg: "Измини подхода спокойно до знака за зоната",
      // On the 50 approach — reach it under a relaxed cap (a normal ~46 drive).
      params: { kind: "reachZone", x: LANE_X, y: 120, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-trn-in-zone",
      titleBg: "Влез в зона 30 вече под ограничението",
      // Deep in the 30 zone with a cap just above the taught ~27 cruise: an
      // anticipating driver satisfies it; one who carried 37+ km/h does not.
      params: { kind: "reachZone", x: LANE_X, y: 250, radiusM: 12, maxSpeedKmh: 33 },
    },
    {
      id: "sc-trn-finish",
      titleBg: "Стигни края на зоната",
      params: { kind: "reachZone", x: LANE_X, y: 345, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  shadow: { path: "content/traces/sc-speed-transition/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-speed-transition/mistake-carry-speed.trace.json" },
      titleBg: "Скоростта от преди зоната",
      whatWentWrongBg:
        "Колата пренесе около 48 км/ч право през знака в зона 30 — законна допреди метри, тук над +10 км/ч. Знакът смени тавана на 30; неснижаването е опасна грешка, а не продължение на подхода.",
      codeRefs: ["SPEEDING_DANGEROUS"],
    },
    {
      traceRef: { path: "content/traces/sc-speed-transition/mistake-half-slow.trace.json" },
      titleBg: "Само наполовина намалена",
      whatWentWrongBg:
        "Скоростта падна, но само до около 37 км/ч — все още над 30. Намаляването закъсня и остана недостатъчно: 31–40 км/ч в зона 30 е второстепенна грешка. Целѝ под тавана, не към него.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
  ],
  teach: {
    whenBg:
      "При всяко влизане в зона с по-ниско ограничение — знак В26 „Зона 30“, училищна или жилищна зона, край на населено място наопаки. Ключът е преходът: таванът пада на знака, а с него трябва да падне и скоростта.",
    whyBg:
      "Проучванията за зони 30 показват типичната грешка: водачът „не регистрира“ прехода и влиза в зоната със старата скорост, като адаптацията закъснява със стотина метра — точно там, където живее по-ниският лимит заради децата. Навременното вдигане на газта на знака връща цялото предимство на зоната.",
    lawRef: "ЗДвП чл. 21",
    examinerBg:
      "Изпитващият следи скоростта спрямо знаците през целия маршрут и очаква видимо, НАВРЕМЕННО намаляване при прехода към по-ниско ограничение. Движение над лимита в зоната е грешка, а над +10 км/ч (тук 40) — опасна грешка, която прекратява изпита.",
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
// 6. sc-sp-harsh-brake — „Рязко спиране без причина" (SP-11 / VP-09) on
//    sp-creep-v1 (map REUSED; rides the recorder's maxDecelMps2 override —
//    the hard-brake capability unlock)
// ---------------------------------------------------------------------------

/**
 * SP-11 / VP-09 — рязко спиране без причина (Наредба № 38: „много рязко
 * спиране, което създава предпоставка за ПТП" is an explicit BG examiner fail
 * cause — phantom braking is graded, not just collisions). Rides the
 * recorder's drive.maxDecelMps2 override: the default 4.6 m/s² stop envelope
 * sits under the HARSH_BRAKING_NO_CAUSE threshold (7 m/s², emergency-grade),
 * so only an authored ≥ 10 override can slam. The street is EMPTY (ambient 0,
 * no crossing/junction/signal), so every cause in the detector's ledger is
 * positively absent — the slam grades EXACTLY the phantom-brake code. The
 * shadow demonstrates the correct habit: the same stop, planned early and
 * braked progressively (~3.2 m/s²), grades nothing. Detector is default-ON
 * (no ruleConfig needed): the LIVE student session grades the same fault.
 */
export const SC_SP_HARSH_BRAKE: ScenarioSpec = {
  id: "sc-sp-harsh-brake",
  family: "speed",
  tagsBg: ["рязко спиране", "плавно спиране", "предвиждане", "удар отзад"],
  titleBg: "Рязко спиране без причина",
  objectiveBg:
    "Спирай планирано и плавно: вдигни газта рано и намалявай постепенно, така че движещите се зад теб да разберат намерението ти — рязкото забиване на спирачките без опасност пред колата е предпоставка за удар отзад и се брои като грешка.",
  archetypeIds: ["SP-11", "VP-09"],
  conceptIds: ["c-general-care-duty", "c-speed-adaptation"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-speed-creep — mirrored in sp-creep-v1.json
    // meta.scenario.params (tools/maps/gen_sp_speed.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "sp-creep-v1",
  },
  start: {
    spawnPointId: "sp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и установи спокойна скорост около 45 км/ч." },
    { n: 2, textBg: "Напред следва планирано спиране в контролната зона — реши да спреш ОТРАНО, не в последния момент." },
    { n: 3, textBg: "Вдигни газта първо и остави колата да губи скорост, после спирай постепенно и равномерно до пълен покой." },
    { n: 4, textBg: "Силната спирачка е само за истинска опасност: без причина пред колата рязкото спиране изненадва тези зад теб." },
    { n: 5, textBg: "Потегли отново плавно и продължи до края на отсечката." },
  ],
  success: [
    {
      id: "sc-shb-stop",
      titleBg: "Мини контролната зона с планирано, плавно спиране",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 12, maxSpeedKmh: 52 },
    },
    {
      id: "sc-shb-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpHarshBrake.ts; gates in traces/__tests__/sp-harsh-brake-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-harsh-brake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-harsh-brake/mistake-phantom-stop.trace.json" },
      titleBg: "Фантомно спиране",
      whatWentWrongBg:
        "На съвсем празна улица колата заби спирачките до пълен покой — „стори ми се, че нещо мръдна“. Пред нея нямаше нищо: нито пешеходец, нито кола, нито знак. Рязкото спиране без причина е точно грешката, която изпитващите описват като „предпоставка за ПТП“ — движещият се отзад няма как да го очаква.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-harsh-brake/mistake-stab-crawl.trace.json" },
      titleBg: "Рязък натиск до пълзене",
      whatWentWrongBg:
        "Паническо набиване на спирачката от 47 км/ч до пълзене — заради сянка между паркираните коли, без реална опасност на пътя. Дори без пълно спиране внезапното силно забавяне е същата грешка: този зад теб вижда стоповете късно и разстоянието се топи. Съмняваш ли се — вдигни газта и намали плавно, не забивай.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спиране, което можеш да предвидиш — автобусна спирка, адрес, място за паркиране, край на отсечка. Решението за спиране се взима рано и се съобщава на другите с постепенно, равномерно спиране; резкият крак е запазен само за истинска опасност.",
    whyBg:
      "Ударът отзад е сред най-честите катастрофи в града и в около една трета от случаите го „поръчва“ спиращият — с внезапна, необяснима за другите спирачка. Плавното, планирано спиране дава на движещия се зад теб време да реагира и запазва управлението на колата; рязкото без причина е грешка дори когато нищо не се удари.",
    lawRef: "Наредба № 38 (рязко спиране — предпоставка за ПТП)",
    examinerBg:
      "Изпитващият следи как спираш през целия маршрут: „много рязко спиране, което създава предпоставка за ПТП“ е изрично посочена грешка. Очаква се ранно вдигане на газта, постепенно спиране и пълен контрол — силната спирачка е оправдана само при реална опасност пред колата.",
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
// 7. sc-sp-curve — „Скорост в завой" (SP-05) on sp-curve-v1: the FIRST
//    rural-curve map (gen_rural_curve.mjs) — an extra-urban 1+1 road posted 90
//    with a marked 90° arc (R 170) carrying the first curveAdvisory zone span
//    (advisory 50, знак А1 + табела). Sustained speed above the advisory
//    INSIDE the arc grades the CURVE-ENVELOPE основна SPEED_TOO_FAST_FOR_CURVE
//    (чл. 20 ал. 2); the approach and exit stay governed by the posted 90.
// ---------------------------------------------------------------------------

/** Inside-lane arc midpoint of sp-curve-v1 (meta.scenario.laneCurveMid). */
const CURVE_MID = { x: 52.66, y: 337.34 };
/** Exit-leg lane center of sp-curve-v1 (meta.scenario.exitLaneY). */
const CURVE_EXIT_Y = 385.94;

/**
 * SP-05 — несъобразена скорост в завой (ЗДвП чл. 20, ал. 2; SWOV: загубата на
 * контрол В ЗАВОЙ е НАЙ-свръхпредставената грешка на начинаещите — влизане
 * ~10 км/ч по-бързо, паническо спиране в дъгата, поднасяне/излизане от пътя).
 * The taught discipline: brake BEFORE the curve, never in it. Detector is
 * default-ON and structurally data-armed (only an authored curveAdvisory span
 * sets the tick field), so no ruleConfig is needed — the LIVE student session
 * grades the same fault.
 */
export const SC_SP_CURVE: ScenarioSpec = {
  id: "sc-sp-curve",
  family: "speed",
  tagsBg: ["скорост", "завой", "извънградско", "препоръчителна скорост", "знак А1"],
  titleBg: "Скорост в завой",
  objectiveBg:
    "Мини обозначения завой безопасно: свали скоростта до препоръчителните 50 км/ч ПРЕДИ завоя, дръж я равномерно през дъгата и ускорявай чак на излизане — спирачките работят на правата, не в завоя.",
  archetypeIds: ["SP-05"],
  conceptIds: ["c-speed-adaptation", "c-speed-limits", "c-general-care-duty"],
  map: {
    archetype: "rural-curve",
    // The generator recipe — mirrored in sp-curve-v1.json meta.scenario.params
    // (tools/maps/gen_rural_curve.mjs).
    params: { approachM: 220, radiusM: 170, sweepDeg: 90, exitM: 200, maxspeedKmh: 90, advisoryKmh: 50 },
    districtId: "sp-curve-v1",
  },
  start: {
    spawnPointId: "spc-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по извънградския път — тук ограничението е 90 км/ч и правата е свободна." },
    { n: 2, textBg: "Напред следва знак А1 „Опасен завой надясно“ с табела „50“ — препоръчителната скорост за завоя." },
    { n: 3, textBg: "Свали скоростта ПРЕДИ завоя: вдигни газта отрано и спри намаляването около 45–50 км/ч още на правата." },
    { n: 4, textBg: "Дръж скоростта равномерна през цялата дъга — без спирачки и без газ в завоя; гледай към изхода му." },
    { n: 5, textBg: "Щом воланът започне да се изправя, ускори плавно обратно към скоростта за правата." },
  ],
  success: [
    {
      id: "sc-spcv-approach",
      titleBg: "Измини подхода с разрешената скорост",
      // On the 90 approach — a normal ~85 rural cruise satisfies it.
      params: { kind: "reachZone", x: LANE_X, y: 170, radiusM: 12, maxSpeedKmh: 92 },
    },
    {
      id: "sc-spcv-curve",
      titleBg: "Мини средата на завоя с препоръчителната скорост",
      // Mid-arc control zone (meta.scenario.laneCurveMid), cap just above the
      // advisory + grace: the adapted 48 passes, the 70 hold does not.
      params: { kind: "reachZone", x: CURVE_MID.x, y: CURVE_MID.y, radiusM: 12, maxSpeedKmh: 55 },
    },
    {
      id: "sc-spcv-finish",
      titleBg: "Излез от завоя и продължи по правата",
      params: { kind: "reachZone", x: 330, y: CURVE_EXIT_Y, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scSpCurve.ts; gates in traces/__tests__/sc-sp-curve-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-sp-curve/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-sp-curve/mistake-hold-speed.trace.json" },
      titleBg: "Със скоростта от правата в завоя",
      whatWentWrongBg:
        "Колата влезе в обозначения завой с около 70 км/ч — цели 20 над препоръчителните 50 от табелата. В дъгата гумите нямат резерв за нищо друго: една дупка, мокро петно или по-остър радиус и колата излиза от пътя. Точно тази грешка е най-честата причина начинаещи да катастрофират сами, без никой друг на пътя.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
    {
      traceRef: { path: "content/traces/sc-sp-curve/mistake-brake-late.trace.json" },
      titleBg: "Спиране В завоя вместо преди него",
      whatWentWrongBg:
        "Намаляването започна чак В дъгата — колата влезе с ~85 и спирачките работиха в самия завой, а скоростта така и не слезе под препоръчителната. Спирането в завой краде от сцеплението за завиване и е рецептата за поднасяне: цялото намаляване се прави на правата, преди волана да се завърти.",
      codeRefs: ["SPEED_TOO_FAST_FOR_CURVE"],
    },
  ],
  teach: {
    whenBg:
      "При всеки обозначен завой извън населено място — знак А1/А2, често с табела с препоръчителна скорост. Ограничението 90 важи за правата; завоят има собствена безопасна скорост и тя се чете от знака и от геометрията на пътя.",
    whyBg:
      "Изследванията на SWOV показват: загубата на контрол в завой е НАЙ-типичната самостоятелна катастрофа на начинаещия водач — влизане само с 10 км/ч повече, паника, спирачка в дъгата, поднасяне. Гумите имат едно сцепление и то се дели между завиване и спиране: свалиш ли скоростта преди завоя, цялото сцепление остава за завиването.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият очаква видимо, навременно намаляване ПРЕДИ завоя — не спирачки в дъгата. Несъобразената с пътните условия скорост е грешка дори в рамките на общото ограничение; равномерното преминаване и плавното ускоряване на излизане показват контрол.",
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
// 8. sc-mw-discipline — „Дисциплина на магистралата" (SP-10 + OV-11) on mw-v1:
//    the FIRST motorway-segment map (gen_motorway.mjs) — a divided 2+2
//    motorway posted the honest АМ 140, each carriageway carrying an
//    emergency curb lane (an authored "emergencyLane" zone span + the
//    edge-level motorway tag). TWO DISTINCT lane/speed faults, one template
//    (the sc-speed-zone precedent):
//      - „Висене в лявата лента при 130" → NOT_KEEPING_RIGHT (the shipped
//        keep-right detector at motorway speed — the ln-v1 precedent needed
//        ZERO new code; the emergencyLaneRight seam makes laneId 1 the
//        rightmost REQUIRED lane);
//      - „Пълзене с 40 без причина" → DRIVING_TOO_SLOW_FOR_MOTORWAY (the
//        SP-10 crawl detector this slice ships — второстепенна on the
//        VERIFIED чл. 54 basis; NO general BG motorway minimum exists, see
//        rules/catalog.ts).
// ---------------------------------------------------------------------------

/** mw-v1 northbound cruise-lane center (meta.scenario — the L7 copy truth). */
const MW_X_CRUISE = 0;

/**
 * SP-10 — скорост на потока + дръж вдясно на автомагистрала (ЗДвП чл. 15,
 * чл. 21, чл. 54; motorway speed-differential crash studies — the far-below-
 * flow car is a mobile chicane). Detectors are default-ON and structurally
 * data-armed (edge motorway tag + emergencyLane span — no other map carries
 * them), so no ruleConfig is needed — the LIVE student session grades both.
 */
export const SC_MW_DISCIPLINE: ScenarioSpec = {
  id: "sc-mw-discipline",
  family: "speed",
  tagsBg: ["магистрала", "скорост на потока", "дръж вдясно", "лентова дисциплина"],
  titleBg: "Дисциплина на магистралата",
  objectiveBg:
    "Измини магистралния участък като част от потока: установи се в ДЯСНАТА лента за движение с около 120–130 км/ч и я дръж — лявата е само за изпреварване, а пълзенето далеч под потока е също толкова грешно, колкото и превишаването.",
  archetypeIds: ["SP-10", "OV-11"],
  conceptIds: ["c-motorway-rules", "c-speed-limits", "c-lane-choice"],
  map: {
    archetype: "motorway-segment",
    // The generator recipe — mirrored in mw-v1.json meta.scenario.params
    // (tools/maps/gen_motorway.mjs).
    params: { lengthM: 1000, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по магистралата — ограничението е 140 км/ч, платното е разделено с мантинела." },
    { n: 2, textBg: "Ускорявай уверено и се установи около 120–130 км/ч — на магистрала се кара със скоростта на потока." },
    { n: 3, textBg: "Дръж ДЯСНАТА лента за движение: лявата е само за изпреварване, а аварийната вдясно не е лента за движение изобщо." },
    { n: 4, textBg: "Не пълзи: трайно движение далеч под потока (под 50 км/ч без причина) прави от колата ти подвижно препятствие." },
    { n: 5, textBg: "Задръж скоростта и лентата до края на участъка." },
  ],
  success: [
    {
      id: "sc-mwd-lane",
      titleBg: "Мини контролната зона в дясната лента за движение",
      // Radius 6 pins the CRUISE lane (lane centers sit 8.12–8.13 m apart):
      // the left-lane hog and an emergency-lane rider both miss it.
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 520, radiusM: 6, maxSpeedKmh: 140 },
    },
    {
      id: "sc-mwd-finish",
      titleBg: "Стигни края на участъка",
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 940, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMwDiscipline.ts; gates in traces/__tests__/sc-mw-discipline-
  // traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-mw-discipline/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-mw-discipline/mistake-left-hog.trace.json" },
      titleBg: "Висене в лявата лента при 130",
      whatWentWrongBg:
        "Колата се настани в ЛЯВАТА лента и остана там с километри, без да изпреварва никого. И на магистрала важи чл. 15: движиш се във възможно най-дясната свободна лента за движение — лявата се освобождава за по-бързите, иначе целият поток се подрежда зад теб.",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-mw-discipline/mistake-crawl.trace.json" },
      titleBg: "Пълзене с 40 по магистралата",
      whatWentWrongBg:
        "Колата запълзя трайно с около 40 км/ч по свободна магистрала — без задръстване, без повреда. Потокът тук се движи със 120–140: разликата от 80–100 км/ч прави пълзящата кола подвижно препятствие, което всички трябва да заобикалят. Магистралата изобщо допуска само превозни средства, способни на повече от 50 км/ч.",
      codeRefs: ["DRIVING_TOO_SLOW_FOR_MOTORWAY"],
    },
  ],
  teach: {
    whenBg:
      "При всяко движение по автомагистрала и скоростен път — от включването до напускането. Двете дисциплини вървят заедно: скорост, близка до потока, и възможно най-дясната свободна лента за движение.",
    whyBg:
      "Катастрофите на магистрала се раждат от РАЗЛИКИ в скоростта, не от самата скорост: кола с 40 км/ч в поток от 130 се приближава със 90 км/ч — колкото челен удар в града. Затова и пълзенето, и висенето в лявата лента са грешки: и двете карат потока да маневрира около теб, точно там, където маневрите са най-скъпи.",
    lawRef: "ЗДвП чл. 15",
    examinerBg:
      "Изпитващият очаква уверено движение със скоростта на потока в дясната лента за движение: трайното движение в лява лента без изпреварване е грешка, а пълзенето далеч под потока без причина — също. Лентите се сменят само с огледало и мигач, с ясна причина.",
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
  SC_SPEED_TRANSITION,
  SC_SP_HARSH_BRAKE,
  SC_SP_CURVE,
  SC_MW_DISCIPLINE,
];
