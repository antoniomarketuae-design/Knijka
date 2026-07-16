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

import type { BrakingLeadCarSpec } from "../../contracts";
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

// ---------------------------------------------------------------------------
// 3. sc-ac-highbeam-lead — „Дълги светлини зад кола" (AC-04) on fo-follow-v1
//    (360 m straight street, limit 50, recorded at NIGHT with a pacing lead)
// ---------------------------------------------------------------------------

/**
 * The staged LEAD CAR for sc-ac-highbeam-lead: paces the player's own
 * northbound lane (x = 4.06, extraRightOffsetM 0) at a fixed ~20 m ahead
 * (positive followGapM, matchPlayer). The gap is deliberately GENEROUS: it
 * sits far above the 2-second following threshold at the calm ~28 km/h drive
 * (so FOLLOWING_TOO_CLOSE never leaks), yet well inside the 150 m dip-duty
 * window — so the ONLY thing the rule engine can grade against it is the
 * driver's BEAM state (HIGH_BEAM_NOT_DIPPED). The slam tier is authored out of
 * the corridor (slamAt y = 520, minSlamSpeedKmh 250): it is deterministic
 * moving traffic, the car whose mirrors the long beam dazzles, not a braking
 * drill. Reuses the committed fo-follow-v1 straight-street geometry (its
 * fo-n-start/fo-n-end lane path + the fo-spawn-approach spawn) — a plain 1+1
 * street with no zebra/junction/signal, so nothing else is gradable.
 */
const AH_LEAD_CAR: BrakingLeadCarSpec = {
  id: "sc-ah-lead",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 40 }, // dormant ~25 m ahead of the spawn
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 20, // pace ~20 m AHEAD — safe at the ~28 km/h drive, well inside the dip window
  maxMatchSpeedMps: 15, // 54 km/h — holds 20 m at any legal player speed
  slamAt: { x: 4.06, y: 520 }, // far past the 360 m road — never reached
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250, // the slam tier is authored out of reach…
  proximityFallbackM: 0.3, // …and the proximity fallback cannot occur (gap pinned at 20 m)
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** AC-04 — превключване на къси светлини при движение зад друга кола нощем
 *  (ЗДвП чл. 74: дългите светлини се превключват на къси, за да не се заслепява
 *  водачът на движещото се отпред превозно средство през огледалата му). */
export const SC_AC_HIGHBEAM_LEAD: ScenarioSpec = {
  id: "sc-ac-highbeam-lead",
  family: "conditions",
  tagsBg: ["условия", "нощно каране", "дълги светлини", "заслепяване"],
  titleBg: "Дълги светлини зад кола",
  objectiveBg:
    "Следвай движещата се пред теб кола нощем с включени КЪСИ светлини — дългите заслепяват водача отпред през огледалата му; на дълги минаваш само когато пътят напред е чист.",
  archetypeIds: ["AC-04"],
  conceptIds: ["c-dazzle-handling", "c-night-visibility", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-follow-v1 map (a plain 1+1 straight street) —
    // its meta.scenario.params, mirrored here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "fo-follow-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тъмно е и пред теб се движи кола — потегли спокойно с включени къси светлини." },
    { n: 2, textBg: "Щом настигнеш кола пред теб, дългите светлини се превключват на къси — иначе я заслепяваш през огледалата ѝ." },
    { n: 3, textBg: "Следвай предната кола на дистанция и с КЪСИ светлини през целия участък." },
    { n: 4, textBg: "На дълги минаваш чак когато пред теб няма нито изпреварвана, нито насрещна кола." },
    { n: 5, textBg: "Задръж късите светлини зад предната кола до края на отсечката." },
  ],
  success: [
    {
      id: "sc-ahl-follow",
      titleBg: "Следвай предната кола с къси светлини",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 45 },
    },
    {
      id: "sc-ahl-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcHighbeamLead.ts; gates in traces/__tests__/
  // ac-highbeam-lead-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-highbeam-lead/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-highbeam-lead/mistake-highs-all-way.trace.json" },
      titleBg: "Дълги светлини през целия път зад предния",
      whatWentWrongBg:
        "Колата се движеше зад предната на дълги светлини целия участък — светлината биеше право в огледалата ѝ и заслепяваше водача отпред. При движение зад друга кола дългите се превключват на къси; това е второстепенна грешка (чл. 74).",
      codeRefs: ["HIGH_BEAM_NOT_DIPPED"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-highbeam-lead/mistake-late-dip.trace.json" },
      titleBg: "Не превключи, щом настигна предния",
      whatWentWrongBg:
        "Водачът тръгна правилно на къси, но включи дългите зад движещата се пред него кола и продължи така — вместо да я превключи на къси, щом я настигна. Дългите зад предна кола заслепяват през огледалата ѝ и се превключват веднага.",
      codeRefs: ["HIGH_BEAM_NOT_DIPPED"],
    },
  ],
  teach: {
    whenBg:
      "През нощта, всеки път когато настигнеш и следваш друга кола или срещнеш насрещна. Дългите светлини са за празен, тъмен път без коли пред и срещу теб; появи ли се кола — превключваш на къси.",
    whyBg:
      "Дългите светлини бият право в огледалата на предната кола (или в очите на насрещния) и за няколко секунди заслепяват водача точно когато той трябва да вижда пътя. Затова законът изисква да се превключат на къси при движение зад друго ППС и при разминаване — заслепеният отпред е също толкова опасен, колкото и ти да не виждаш.",
    lawRef: "ЗДвП чл. 74",
    examinerBg:
      "Изпитващият следи ползването на светлините нощем: дългите се превключват на къси при настигане на движеща се отпред кола и при насрещно разминаване. Оставените дълги зад предна кола са второстепенна грешка — превключвай веднага, щом настигнеш предния.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [AH_LEAD_CAR],
  conditions: { weather: "dry", night: true },
  localeBg: "bg-BG",
};

/** The adverse-conditions-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_CONDITIONS: readonly ScenarioSpec[] = [
  SC_AC_NIGHT_LIGHTS,
  SC_AC_RAIN_LIGHTS,
  SC_AC_HIGHBEAM_LEAD,
];
