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
 * archetypes gradable from the shipped headlight detectors. AC-04 (dazzle
 * channel) and AC-07's friction slice shipped next; the FOG unlock adds AC-03
 * (sc-ac-fog — the compilable weather="fog" condition: dense FogExp2 render,
 * tick.fog conditions envelope at conditionSpeedFogFactor 0.6, and the
 * FOG_LIGHTS_OFF_IN_FOG fog-lamp duty on the recorder's fogLights channel).
 * The remaining AC archetypes need an oncoming actor or a snow/ice condition
 * and stay 🟡 PARTIAL or 🔴 NEW — left for later waves.
 *
 * ADR-006 stage 4a adds sc-ac-wet-braking — the FIRST template on the opt-in
 * wet-grip physics slice (LessonSpec.physics.wetGrip ← ScenarioSpec.physics):
 * the friction-model slice of the doc-72 AC-07 subsystem (wet braking distance
 * ~1.4×; the standing-water aquaplane FLOAT itself, and AC-12 crosswind,
 * remain Phase-4 work). See that template's header for the dual-channel
 * honesty note (live physics vs authored kinematic demos).
 *
 * The SNOW unlock adds sc-ac-snow (AC-08's packed-snow slice) — the LAST
 * weather ungated, by COMPOSING the two shipped seams: fog's render path
 * (weather="snow" → environment.snow → the lighter cold haze + tick.snow at
 * conditionSpeedSnowFactor 0.5) and the wet-grip physics opt-in
 * (physics.snowGrip → SNOW_GRIP_FACTOR 0.4 → ~2.5× braking distance). Black
 * ice (~0.1–0.2 grip, the AC-08 invisible-hazard CUE) stays Phase-4.
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

// ---------------------------------------------------------------------------
// 4. sc-ac-wet-braking — „Спирачен път на мокро" (AC-07 friction slice) on
//    ac-rain-v1 (360 m straight street, limit 50, DAY rain, WET-GRIP PHYSICS)
// ---------------------------------------------------------------------------

/** The stop mark of sc-ac-wet-braking: the shadow eases to a full stop here,
 *  ~5.7 m short of the stopped van at y = 310 (nose 302.02 vs the van's rear
 *  face at 307.75). Denormalized from ac-rain-v1 (lane x = 4.06). */
const WET_STOP_MARK_Y = 300;

/**
 * AC-07 (friction slice) — спирачен път на мокър път (ЗДвП чл. 20 ал. 2:
 * скоростта се съобразява с атмосферните условия и състоянието на пътя, така
 * че водачът да може да спре пред всяко предвидимо препятствие; чл. 23 —
 * дистанция, която позволява да избегне удар).
 *
 * THE PHYSICS IS THE LESSON (the first opt-in wet-grip template):
 *  - `physics.wetGrip` compiles to LessonSpec.physics.wetGrip → the LIVE
 *    student car runs at tuning.WET_GRIP_FACTOR (0.7): tyre μ and brake force
 *    scale down, measured braking distance × ~1.42 from 50 km/h
 *    (vehicle/wet-grip.test.ts). Braking „where the dry habit says" no longer
 *    stops the car in time — exactly the mistake the demos show.
 *  - DUAL-CHANNEL HONESTY: the recorded demos are KINEMATIC (authored decel
 *    envelopes — the recorder never runs VehicleSim), so the wet truth is
 *    AUTHORED into them: every stop ramp uses SCRIPT_DECEL × WET_GRIP_FACTOR
 *    (traces/scAcWetBraking.ts), the same ~0.7 scaling the live car obeys.
 *    Ghost and student therefore brake to the same envelope, by construction
 *    on one side and by physics on the other.
 *  - DELIBERATELY NOT coupled to weather="rain" alone: sc-ac-rain-lights and
 *    every other shipped rain lesson stay on dry physics (their tuning and
 *    recordings predate the slice); only this template AUTHORS the flag.
 *
 * Like the sc-pk-smooth-stop mold, the stopped van is a RECORDER obstacle
 * rect (trace channel), not a live prop — the live student's graded skill is
 * the low-speed stop-mark zone; the collision consequence is demonstrated by
 * the red ghosts.
 */
export const SC_AC_WET_BRAKING: ScenarioSpec = {
  id: "sc-ac-wet-braking",
  family: "conditions",
  tagsBg: ["условия", "дъжд", "спирачен път", "мокър път", "съобразена скорост"],
  titleBg: "Спирачен път на мокро",
  objectiveBg:
    "Спри плавно на маркираната позиция зад спрелия автомобил в дъжда — на мокър път спирачният път е около 1,4 пъти по-дълъг, затова вдигаш газта по-рано и спираш по-меко, отколкото на сухо.",
  archetypeIds: ["AC-07"],
  conceptIds: ["c-braking-distance", "c-stopping-distance-total", "c-rain-aquaplaning"],
  map: {
    archetype: "straight-street",
    // Reuses the committed ac-rain-v1 map (a plain 1+1 straight street) — its
    // meta.scenario.params, mirrored here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ac-rain-v1",
  },
  start: {
    spawnPointId: "ac-rain-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Вали: включи късите светлини и потегли със съобразена за дъжда скорост — около 38 км/ч." },
    {
      n: 2,
      textBg:
        "Напред в лентата е спрял автомобил. Ще спреш плавно на маркираната позиция на няколко метра зад него.",
    },
    {
      n: 3,
      textBg:
        "На мокър път гумите държат по-слабо: спирачният път е около 1,4 пъти по-дълъг, отколкото на сухо.",
    },
    {
      n: 4,
      textBg:
        "Затова вдигни газта много по-рано, отколкото ти казва сухият навик, и натисни спирачката меко и постепенно.",
    },
    { n: 5, textBg: "Спри напълно на позицията, с дистанция до спрелия отпред, и задръж колата." },
  ],
  success: [
    {
      id: "sc-acw-approach",
      titleBg: "Приближи със съобразена за дъжда скорост",
      // Under the 0.85 × 50 = 42.5 km/h rain envelope — the adapted approach.
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 12, maxSpeedKmh: 42 },
    },
    {
      id: "sc-acw-mark",
      titleBg: "Спри точно на маркираната позиция",
      // Completable ONLY at near-stop speed at the mark (the pk-smooth-stop
      // discipline): a car that brakes at the dry-habit point blows through
      // this zone at speed — on wet physics it simply cannot rest here.
      params: { kind: "reachZone", x: LANE_X, y: WET_STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcWetBraking.ts; gates in traces/__tests__/
  // sc-ac-wet-braking-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-wet-braking/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-wet-braking/mistake-dry-point.trace.json" },
      titleBg: "Спирачка „като на сухо“",
      whatWentWrongBg:
        "Водачът кара със съобразена скорост, но натисна спирачката там, където сухият навик казва, че стига — на мокрия път същата спирачка спира колата около 1,4 пъти по-дълго и тя се претърколи в спрелия отпред автомобил. На мокро вдигаш газта и спираш по-рано (чл. 20, ал. 2).",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-wet-braking/mistake-dry-speed.trace.json" },
      titleBg: "Кара като на сухо — 50 в дъжда",
      whatWentWrongBg:
        "Колата носеше 50 км/ч в дъжда — „нали е в ограничението“ — а несъобразената с мокрия път скорост удължи спирачния път двойно спрямо очакваното: ударът в спрелия отпред стана неизбежен. Ограничението е таван за сухо; в дъжд скоростта се съобразява надолу (чл. 20, ал. 2).",
      codeRefs: ["COLLISION", "SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спиране на мокър път — зад спрял автомобил, на светофар, пред пътека. Правилото: щом пътят е мокър, вдигаш газта по-рано и започваш да спираш там, където на сухо още не би — мократа настилка държи около 70% от сухото сцепление.",
    whyBg:
      "Спирачният път расте обратно на сцеплението: на мокро същата спирачка спира колата около 1,4 пъти по-дълго, а сухият навик „знае“ точката за спиране грешно. Повечето удари отзад в дъжда са точно това — спирачка, натисната на сухата точка. Който брои мокрия път в главата си, спира преди препятствието, не в него.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият следи дали „четеш“ настилката: в дъжд очаква по-ниска скорост, по-ранно вдигане на газта и по-дълга дистанция за спиране. Несъобразената с мокрия път скорост е грешка, а спирането в препятствие прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "rain" },
  // THE SLICE: the live student car runs wet-grip physics (opt-in, authored).
  physics: { wetGrip: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-ac-fog — „Мъгла" (AC-03) on ac-rain-v1 (360 m straight street,
//    limit 50, DAY dense fog — the FOG weather unlock)
// ---------------------------------------------------------------------------

/**
 * AC-03 — движение в гъста мъгла (ЗДвП чл. 20, ал. 2: скоростта се съобразява
 * с видимостта, така че водачът да може да спре в рамките на ВИДИМОТО платно;
 * чл. 74: при значително намалена видимост се включват предните фарове за
 * мъгла, заедно с късите светлини).
 *
 * THE FOG IS THE LESSON (the first compilable weather="fog" template):
 *  - conditions.weather "fog" compiles to LessonSpec.environment.fog → the
 *    scene renders the dense FogExp2 bank (~50 m usable sight, dimmed rig,
 *    washed sky) and the runtime feeds tick.fog every frame;
 *  - the conditions envelope hardens: conditionSpeedFogFactor 0.6 × 50 =
 *    30 km/h — the „спри в рамките на видимостта" band. Driving the dry
 *    habit (~38 km/h, legal in rain) grades SPEED_TOO_FAST_FOR_CONDITIONS;
 *  - the fog-lamp duty arms: FOG_LIGHTS_OFF_IN_FOG (второстепенна, чл. 74)
 *    grades a drive without the front fog lamps (cockpit V key — the
 *    recorder's fogLights channel authors the demos).
 *
 * Reuses the committed ac-rain-v1 straight street (the sc-ac-wet-braking
 * precedent): no crossing/junction/signal/sign, ambient traffic ZERO (seed 7),
 * so nothing but the fog channels is gradable. The shadow drives fog lamps +
 * low beams on at ~25 km/h and earns CLEAN_DRIVING.
 */
export const SC_AC_FOG: ScenarioSpec = {
  id: "sc-ac-fog",
  family: "conditions",
  tagsBg: ["условия", "мъгла", "видимост", "фарове за мъгла", "съобразена скорост"],
  titleBg: "Мъгла",
  objectiveBg:
    "Измини правата улица в гъста мъгла с включени фарове за мъгла и скорост, при която можеш да спреш в рамките на видимия участък — в мъглата виждаш 50 метра напред, а правото да караш 50 км/ч не значи, че е безопасно.",
  archetypeIds: ["AC-03"],
  conceptIds: ["c-fog-driving", "c-stopping-distance-total", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Reuses the committed ac-rain-v1 map (a plain 1+1 straight street) — its
    // meta.scenario.params, mirrored here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ac-rain-v1",
  },
  start: {
    spawnPointId: "ac-rain-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Гъста мъгла: включи късите светлини и фаровете за мъгла (клавиш V) още преди да потеглиш." },
    {
      n: 2,
      textBg:
        "Потегли бавно и се стабилизирай около 25 км/ч — в мъглата караш толкова бързо, колкото виждаш, не колкото позволява знакът.",
    },
    {
      n: 3,
      textBg:
        "Правилото е желязно: трябва да можеш да спреш В РАМКИТЕ на видимия участък. Виждаш 50 метра — значи скорост, която спира за по-малко от 50 метра, с целия ти рефлекс вътре.",
    },
    {
      n: 4,
      textBg:
        "Не се залепяй за маркировката в последния момент — гледай докъдето стига видимостта и очаквай спрял автомобил или пешеходец да „изплува“ от пелената.",
    },
    { n: 5, textBg: "Продължи така до края на отсечката — фаровете за мъгла светят, докато трае мъглата." },
  ],
  success: [
    {
      id: "sc-acf-adapted",
      titleBg: "Мини контролната зона със съобразена за мъглата скорост",
      // Cap 30 km/h IS the fog conditions envelope (0.6 × 50): the adapted
      // ~25 km/h drive satisfies it; a dry-habit 38 km/h simply cannot
      // complete the objective without slowing into the envelope.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-acf-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 90 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcFog.ts; gates in traces/__tests__/sc-ac-fog-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-fog/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-fog/mistake-dry-speed.trace.json" },
      titleBg: "Кара „като на сухо“ в мъглата",
      whatWentWrongBg:
        "Колата носеше близо 40 км/ч в гъстата мъгла — „нали е под ограничението“. Но ограничението е таван за ясно време: при 50 метра видимост препятствието „изплува“ твърде късно и спирачният път не се събира във видимото. В мъгла скоростта се смъква драстично — тук под 30 км/ч (чл. 20, ал. 2).",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-fog/mistake-no-fog-lights.trace.json" },
      titleBg: "Без фарове за мъгла",
      whatWentWrongBg:
        "Водачът кара със съобразена скорост, но без включени фарове за мъгла — късите светлини се отразяват в пелената, а колата остава смътно петно за другите. При значително намалена видимост предните фарове за мъгла светят заедно с късите (чл. 74) — те осветяват ниско, под мъглата, и те правят видим.",
      codeRefs: ["FOG_LIGHTS_OFF_IN_FOG"],
    },
  ],
  teach: {
    whenBg:
      "При всяка гъста мъгла — есенните утрини, котловините, крайречните булеварди. Двете действия идват заедно още преди потеглянето: фарове за мъгла + къси светлини, и скорост, смъкната до това, което реално виждаш — не до това, което пише на знака.",
    whyBg:
      "Мъглата е най-коварното условие: тя не прави пътя хлъзгав, а те ослепява — препятствието се появява на 50 метра, а на 50 км/ч само спирачният път е около 30 метра плюс реакцията. Който кара „по знака“, спира В препятствието; който кара по видимостта, спира ПРЕД него. Затова законът връзва скоростта с видимото платно, а фаровете за мъгла те правят видим за другите.",
    lawRef: "ЗДвП чл. 20, ал. 2; чл. 74",
    examinerBg:
      "Изпитващият очаква при намалена видимост да реагираш без подкана: фарове за мъгла и къси светлини преди потеглянето, скорост далеч под ограничението и по-голяма дистанция. Несъобразената с видимостта скорост е грешка — карай толкова бързо, колкото виждаш.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "fog" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6. sc-ac-snow — „Сняг" (AC-08 packed-snow slice) on ac-rain-v1 (360 m
//    straight street, limit 50, DAY SNOW, SNOW-GRIP PHYSICS — the last
//    weather unlock: fog's render seam × the wet-grip physics seam)
// ---------------------------------------------------------------------------

/** The stop mark of sc-ac-snow: the shadow eases to a full stop here, ~5.7 m
 *  short of the stopped van at y = 310 (the sc-ac-wet-braking geometry,
 *  reused verbatim — nose 302.02 vs the van's rear face at 307.75). */
const SNOW_STOP_MARK_Y = 300;

/**
 * AC-08 (packed-snow slice) — зимно каране по заснежен път (ЗДвП чл. 20
 * ал. 2: скоростта се съобразява със състоянието на пътя и атмосферните
 * условия, така че водачът да може да спре пред всяко предвидимо препятствие).
 *
 * THE COMPOSITION IS THE LESSON (the two shipped seams, together):
 *  - conditions.weather "snow" compiles to LessonSpec.environment.snow → the
 *    scene renders the cold snow haze (lighter than fog — you SEE the road,
 *    you cannot STOP on it) and the runtime feeds tick.snow every frame; the
 *    conditions envelope hardens to conditionSpeedSnowFactor 0.5 × 50 =
 *    25 km/h — the „зимна скорост" band. Driving the dry habit (~40 km/h,
 *    legal in rain) grades SPEED_TOO_FAST_FOR_CONDITIONS;
 *  - `physics.snowGrip` compiles to LessonSpec.physics.snowGrip → the LIVE
 *    student car runs at tuning.SNOW_GRIP_FACTOR (0.4): packed snow holds
 *    ~0.35–0.45 of dry grip, braking distance ~2.5× — braking „където сухият
 *    навик казва" physically cannot stop the car (the wet-braking precedent,
 *    one grip band deeper).
 *  - DUAL-CHANNEL HONESTY (the 4a law): the recorded demos are KINEMATIC, so
 *    every stop ramp is authored at SCRIPT_DECEL × SNOW_GRIP_FACTOR
 *    (traces/scAcSnow.ts SNOW_DECEL ≈ 1.84 m/s²) — the same scaling the live
 *    car obeys, pinned by the trace gate.
 *
 * HONEST VISUAL SCOPE (documented, not hidden): no snowfall particles and no
 * white ground cover ship in this slice (asset work — doc 76 §0); the cold
 * desaturated haze, the copy and the snow-grip physics carry the winter
 * story. Like the wet template, the stopped van is a RECORDER obstacle rect
 * (trace channel), not a live prop — the live student's graded skill is the
 * low-speed stop-mark zone; the collision consequence is demonstrated by the
 * red ghosts.
 */
export const SC_AC_SNOW: ScenarioSpec = {
  id: "sc-ac-snow",
  family: "conditions",
  tagsBg: ["условия", "сняг", "зимни условия", "спирачен път", "съобразена скорост"],
  titleBg: "Сняг",
  objectiveBg:
    "Измини заснежената улица със зимна скорост и спри плавно на маркираната позиция зад спрелия автомобил — на утъпкан сняг гумите държат под половината от сухото сцепление и спирачният път е около 2,5 пъти по-дълъг.",
  archetypeIds: ["AC-08"],
  conceptIds: ["c-winter-ice", "c-braking-distance", "c-stopping-distance-total"],
  map: {
    archetype: "straight-street",
    // Reuses the committed ac-rain-v1 map (a plain 1+1 straight street) — its
    // meta.scenario.params, mirrored here for provenance.
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ac-rain-v1",
  },
  start: {
    spawnPointId: "ac-rain-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Пътят е заснежен: включи късите светлини и потегли меко, без резки движения." },
    {
      n: 2,
      textBg:
        "Стабилизирай се около 22 км/ч — на сняг зимната скорост е наполовина под знака, не „малко по-бавно“.",
    },
    {
      n: 3,
      textBg:
        "Утъпканият сняг държи около 40% от сухото сцепление: същата спирачка спира колата около 2,5 пъти по-дълго.",
    },
    {
      n: 4,
      textBg:
        "Напред в лентата е спрял автомобил. Вдигни газта многократно по-рано, отколкото ти казва сухият навик, и спирай меко и постепенно.",
    },
    { n: 5, textBg: "Спри напълно на маркираната позиция, с дистанция до спрелия отпред, и задръж колата." },
  ],
  success: [
    {
      id: "sc-acs-approach",
      titleBg: "Приближи със зимна скорост",
      // Cap 25 km/h IS the snow conditions envelope (0.5 × 50): the adapted
      // ~22 km/h drive satisfies it; the dry-habit 40 km/h cannot pass here
      // without slowing into the winter band.
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 12, maxSpeedKmh: 25 },
    },
    {
      id: "sc-acs-mark",
      titleBg: "Спри точно на маркираната позиция",
      // Completable ONLY at near-stop speed at the mark (the pk-smooth-stop
      // discipline): a car that brakes at the dry-habit point slides through
      // this zone — on the 0.4 snow grip it simply cannot rest here.
      params: { kind: "reachZone", x: LANE_X, y: SNOW_STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 90 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcSnow.ts; gates in traces/__tests__/sc-ac-snow-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-snow/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-snow/mistake-dry-speed.trace.json" },
      titleBg: "Кара „като на сухо“ — 40 в снега",
      whatWentWrongBg:
        "Колата носеше 40 км/ч по заснежения път — „нали е под ограничението“. Но ограничението е таван за суха настилка: на сняг несъобразената скорост изяжда цялата дистанция, а спирачният път се брои по зимното сцепление. Зимната скорост тук е под 25 км/ч (чл. 20, ал. 2).",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-snow/mistake-late-brake.trace.json" },
      titleBg: "Спирачка на „сухата” точка",
      whatWentWrongBg:
        "Водачът кара със зимна скорост, но натисна спирачката там, където сухият навик казва, че стига — на утъпкания сняг същата спирачка спира колата около 2,5 пъти по-дълго и тя се плъзна в спрелия отпред автомобил. На сняг вдигаш газта многократно по-рано и спираш меко (чл. 20, ал. 2).",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всяко каране по заснежен или заледен път — първият сняг, утъпканите странични улици, сенчестите участъци, които не се топят. Двете правила идват заедно: зимна скорост (около наполовина под знака) и многократно по-ранно, по-меко спиране — сухият навик за „точката на спирачката“ на сняг е капан.",
    whyBg:
      "Утъпканият сняг държи около 40% от сухото сцепление — спирачният път расте обратно на сцеплението и от 25 км/ч става колкото сухият от 40. Повечето зимни удари са точно това: скорост „по знака“ и спирачка на сухата точка. Който брои снежния път в главата си, спира пред препятствието, не в него — а резките движения на волана и спирачката на сняг отключват поднасяне.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият следи дали „четеш“ настилката: на сняг очаква скорост далеч под ограничението, меки команди и многократно по-ранно вдигане на газта. Несъобразената със зимния път скорост е грешка, а спирането в препятствие прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "snow" },
  // THE COMPOSITION: the live student car runs snow-grip physics (opt-in,
  // authored — the weather tag alone never flips physics, the wet precedent).
  physics: { snowGrip: true },
  localeBg: "bg-BG",
};

/** The adverse-conditions-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_CONDITIONS: readonly ScenarioSpec[] = [
  SC_AC_NIGHT_LIGHTS,
  SC_AC_RAIN_LIGHTS,
  SC_AC_HIGHBEAM_LEAD,
  SC_AC_WET_BRAKING,
  SC_AC_FOG,
  SC_AC_SNOW,
];
