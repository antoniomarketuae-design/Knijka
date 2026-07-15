/**
 * Scenario templates — the ADVERSE-CONDITIONS family (doc 72 §13 „Family AC —
 * Adverse conditions"): two ✅ FULL headlight-discipline archetypes that ride
 * the recorder's cockpit-state channels (headlights — committed de3c33a), DATA
 * ONLY in the templates.ts mold (coordinates denormalized from the committed
 * district files so nothing loads world JSON at runtime; the trace-gate
 * batteries assert every pinned value against the generated maps):
 *
 *  - sc-ac-night-lights  „Нощно каране без светлини"  (AC-01, ac-night-v1,
 *                        recorded at night)
 *  - sc-ac-rain-lights   „Дъжд без светлини"          (AC-02, ac-rain-v1,
 *                        recorded in DAY rain)
 *
 * Each mistake demo cites a SHIPPED rules-catalog code and grades EXACTLY it,
 * with NO extras, when replayed through the production stack (the §5/§9 gates,
 * traces/__tests__/ac-night-lights- / ac-rain-lights-traces.test.ts):
 *   - AC-01 → HEADLIGHTS_OFF_AT_NIGHT (основна: движение нощем без светлини —
 *     the isNight + headlights detector, 2 s sustain while moving);
 *   - AC-02 → HEADLIGHTS_OFF_IN_RAIN (второстепенна: движение в дъжд без къси
 *     светлини — the rain + headlights DAY detector, 3 s sustain while moving).
 *
 * Condition envelope the drives respect (rules/engine.ts §4, cfg defaults):
 *   - the DEFAULT headlights are the recorder's former hardcode
 *     (isNight ? "low" : "off"), so the night shadow needs no light step (low
 *     beams are already on) while the DAY-rain shadow MUST set {headlights:"low"}
 *     explicitly (the day default is "off", which would itself grade the code);
 *   - the rain drives stay under the 0.85 × 50 = 42.5 km/h conditions envelope,
 *     so SPEED_TOO_FAST_FOR_CONDITIONS never leaks into a lights mistake; at
 *     night the prudent-speed factor is 1 (lit urban Sofia), so cruising at the
 *     limit is lawful and only the lights channel is graded.
 *
 * The maps carry NO crossing, junction, signal or sign, ambient traffic is ZERO
 * (seed 7). The shadow drives correctly lit and clean and earns the family
 * positive CLEAN_DRIVING.
 *
 * Family: "conditions" — the existing catalog chip (doc 76 §2).
 *
 * Doc-72 provenance: AC-01 and AC-02 are the "Engine: ✅ FULL" adverse-condition
 * archetypes gradable from the shipped headlight detectors. AC-03..AC-13 need an
 * oncoming actor, a fog/friction condition or a dazzle channel and are 🟡
 * PARTIAL or 🔴 NEW — left for later waves.
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated districts by value — the
// L7 pattern; the ac-vp-districts battery asserts the copies match the maps)
// ---------------------------------------------------------------------------

/** Right-lane center of ac-night-v1 / ac-rain-v1 (1+1 street, drawn lane 8.125 m). */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// 1. sc-ac-night-lights — „Нощно каране без светлини" (AC-01) on ac-night-v1
//    (360 m straight street, limit 50, recorded at night)
// ---------------------------------------------------------------------------

/** AC-01 — движение нощем с включени къси светлини (ЗДвП чл. 70: през нощта и
 *  при намалена видимост фаровете светят). */
export const SC_AC_NIGHT_LIGHTS: ScenarioSpec = {
  id: "sc-ac-night-lights",
  family: "conditions",
  tagsBg: ["условия", "нощно каране", "къси светлини", "видимост"],
  titleBg: "Нощно каране без светлини",
  objectiveBg:
    "Измини правата улица в тъмнината с включени къси светлини през цялото време — нощем виждаш само осветеното от фаровете, а без тях и другите не виждат теб.",
  archetypeIds: ["AC-01"],
  conceptIds: ["c-night-visibility", "c-vehicle-controls", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ac-night-v1.json meta.scenario.params
    // (tools/maps/gen_ac_vp_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ac-night-v1",
  },
  start: {
    spawnPointId: "ac-night-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Преди да потеглиш по тъмно: включи късите светлини още със запалването на двигателя." },
    { n: 2, textBg: "Потегли по правата улица и дръж спокойна скорост под 50 км/ч." },
    { n: 3, textBg: "Късите светлини светят през цялото време по тъмно, не „когато се стъмни съвсем“." },
    { n: 4, textBg: "Не се води по светлия таблото и уличните лампи — те не осветяват пътя и не те правят видим за другите." },
    { n: 5, textBg: "Продължи с включени къси светлини до края на отсечката." },
  ],
  success: [
    {
      id: "sc-acn-lit",
      titleBg: "Мини контролната зона осветен",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-acn-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcNightLights.ts; gates in traces/__tests__/
  // ac-night-lights-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-night-lights/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-night-lights/mistake-never-on.trace.json" },
      titleBg: "Никога не включени светлини",
      whatWentWrongBg:
        "Колата потегли по тъмно с изключени светлини и остана така цялата отсечка — таблото е ярко (модерните LED уредби мамят), но пътят напред е черен, а колата е невидима за другите. Късите светлини се включват още при запалването на двигателя.",
      codeRefs: ["HEADLIGHTS_OFF_AT_NIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-night-lights/mistake-turned-off.trace.json" },
      titleBg: "Изгасени светлини по време на движение",
      whatWentWrongBg:
        "Водачът тръгна с къси светлини, но ги изгаси в движение — и продължи да кара на тъмно без тях. Изключването на светлините нощем е същата основна грешка: докато караш по тъмно, късите светят непрекъснато, без изключение.",
      codeRefs: ["HEADLIGHTS_OFF_AT_NIGHT"],
    },
  ],
  teach: {
    whenBg:
      "През нощта и при всяка намалена видимост — от здрач до изгрев. Модерните коли със светещо LED табло и дневни светлини заблуждават: таблото е ярко, но фаровете отпред може да са изключени. Провери светлините още при запалването по тъмно.",
    whyBg:
      "Нощем виждаш само това, което фаровете осветяват — без къси светлини летиш към участък, който не виждаш, и оставаш невидим в огледалата на другите. Късите светлини правят две неща наведнъж: осветяват пътя пред теб и те правят видим — затова законът ги изисква през цялата тъмна част (чл. 70).",
    lawRef: "ЗДвП чл. 70",
    examinerBg:
      "Изпитващият проверява светлините още преди потеглянето по тъмно и следи да са включени през целия маршрут. Движението нощем без светлини е основна грешка — включи късите със запалването и не ги изгасяй в движение.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-ac-rain-lights — „Дъжд без светлини" (AC-02) on ac-rain-v1
//    (360 m straight street, limit 50, recorded in DAY rain)
// ---------------------------------------------------------------------------

/** AC-02 — движение в дъжд с включени къси светлини (ЗДвП чл. 70: при намалена
 *  видимост светлините се включват — за да те виждат другите). */
export const SC_AC_RAIN_LIGHTS: ScenarioSpec = {
  id: "sc-ac-rain-lights",
  family: "conditions",
  tagsBg: ["условия", "дъжд", "къси светлини", "видимост"],
  titleBg: "Дъжд без светлини",
  objectiveBg:
    "Измини правата улица в дневен дъжд с включени къси светлини — тръгнат ли чистачките, светват и късите светлини; те не са за да виждаш, а за да те виждат другите.",
  archetypeIds: ["AC-02"],
  conceptIds: ["c-night-visibility", "c-rain-aquaplaning", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ac-rain-v1.json meta.scenario.params
    // (tools/maps/gen_ac_vp_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ac-rain-v1",
  },
  start: {
    spawnPointId: "ac-rain-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Вали, макар да е ден: включи късите светлини — правило „чистачки → светлини“." },
    { n: 2, textBg: "Потегли по правата улица със съобразена за дъжда скорост — тук около 38 км/ч." },
    { n: 3, textBg: "Късите светлини в дъжд не са за да виждаш, а за да те виждат — сивата кола без светлини изчезва в огледалата." },
    { n: 4, textBg: "Дръж късите включени, докато вали и видимостта е намалена." },
    { n: 5, textBg: "Продължи с включени къси светлини до края на отсечката." },
  ],
  success: [
    {
      id: "sc-acr-lit",
      titleBg: "Мини контролната зона осветен и съобразен",
      // Cap 42 km/h sits just under the rain envelope (0.85 × 50 = 42.5): the
      // adapted ~38 km/h drive satisfies it and no conditions-speed code leaks.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 42 },
    },
    {
      id: "sc-acr-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcRainLights.ts; gates in traces/__tests__/
  // ac-rain-lights-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-rain-lights/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-rain-lights/mistake-never-on.trace.json" },
      titleBg: "„Виждам си добре“ — без светлини",
      whatWentWrongBg:
        "Дневен порой, а колата кара без къси светлини — „нали виждам добре“. Но светлините в дъжд са за да те ВИЖДАТ: сивата кола без светлини е невидима във всяко огледало. При намалена видимост късите светлини се включват — това е второстепенна грешка (чл. 70).",
      codeRefs: ["HEADLIGHTS_OFF_IN_RAIN"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-rain-lights/mistake-wipers-only.trace.json" },
      titleBg: "Чистачки без светлини",
      whatWentWrongBg:
        "Водачът пусна чистачките, но изгаси светлините в движение — половината правило. Простото правило е: тръгнат ли чистачките, светват и късите светлини — двете вървят винаги заедно, докато вали.",
      codeRefs: ["HEADLIGHTS_OFF_IN_RAIN"],
    },
  ],
  teach: {
    whenBg:
      "При всеки дъжд, мъгла или сняг — дори посред бял ден. Простото, безотказно правило е „чистачки → светлини“: тръгнат ли чистачките, светват и късите. Валеше ли, включи ги, преди да потеглиш.",
    whyBg:
      "В дъжд видимостта пада за всички — и колите без светлини изчезват в пелената и в мокрите огледала. Късите светлини в дъжд не са толкова за да виждаш ти, колкото за да те виждат другите; те са евтината застраховка срещу удара, който не си видял да идва.",
    lawRef: "ЗДвП чл. 70",
    examinerBg:
      "Изпитващият очаква включени къси светлини при намалена видимост — заедно с чистачките. Движението в дъжд без светлини е второстепенна грешка; включи ги, преди да потеглиш, и не ги изгасяй, докато вали.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "rain" },
  localeBg: "bg-BG",
};

/** The adverse-conditions-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_CONDITIONS: readonly ScenarioSpec[] = [
  SC_AC_NIGHT_LIGHTS,
  SC_AC_RAIN_LIGHTS,
];
