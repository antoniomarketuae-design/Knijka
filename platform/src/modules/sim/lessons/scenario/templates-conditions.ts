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
 * channel) and AC-07's friction slice shipped next; the FOG unlock adds AC-05
 * (sc-ac-fog — fog-lamp discipline: the compilable weather="fog" condition,
 * dense FogExp2 render, tick.fog conditions envelope at conditionSpeedFogFactor
 * 0.6, and the FOG_LIGHTS_OFF_IN_FOG fog-lamp duty on the recorder's fogLights
 * channel). The remaining AC archetypes need an oncoming actor (e.g. AC-03
 * high-beams-vs-oncoming) or a snow/ice condition and stay 🟡 PARTIAL or 🔴 NEW
 * — left for later waves.
 *
 * ADR-006 stage 4a adds sc-ac-wet-braking — the FIRST template on the opt-in
 * wet-grip physics slice (LessonSpec.physics.wetGrip ← ScenarioSpec.physics):
 * the friction-model slice of the doc-72 AC-07 subsystem (wet braking distance
 * ~1.4×; the standing-water aquaplane FLOAT itself remains Phase-4 work). See
 * that template's header for the dual-channel honesty note (live physics vs
 * authored kinematic demos).
 *
 * The CROSSWIND unlock adds sc-ac-crosswind (AC-12) — the wind slice on the
 * SAME opt-in seam (physics.crosswind → VehicleSim windLateralN + the
 * deterministic gust sine; vehicle/crosswind.test.ts is the bit-identity +
 * measured-push proof). NO new rule code: the shipped lane detectors grade
 * the drift, exactly as doc 72 called it. Per-segment wind ZONES / exposure
 * modelling stay doc-65 Phase-4 work.
 *
 * The SNOW unlock adds sc-ac-snow (AC-08's packed-snow slice) — the LAST
 * weather ungated, by COMPOSING the two shipped seams: fog's render path
 * (weather="snow" → environment.snow → the lighter cold haze + tick.snow at
 * conditionSpeedSnowFactor 0.5) and the wet-grip physics opt-in
 * (physics.snowGrip → SNOW_GRIP_FACTOR 0.4 → ~2.5× braking distance). Black
 * ice (~0.1–0.2 grip, the AC-08 invisible-hazard CUE) stays Phase-4.
 */

/**
 * THE BRIEFING BUDGET — 2026-08-16. Every `instructionsBg` step in this file
 * was rewritten so that THE ACT IS THE FIRST WORD and no step exceeds 95
 * characters. The measurement that forced it, the per-character fold table it
 * is derived from and the one thing this lane could not fix are written out in
 * full at the top of `templates-flow.ts`; read that block before lengthening
 * anything here.
 *
 * This file's share of the defect, counted before the rewrite: 45 authored
 * steps, 26 of them past the 95-character band the compact card was sized
 * against, longest 177 characters (sc-ac-aquaplane step 2, 177 ch). On the
 * deployed build a step-1 past ~96 characters leaves ZERO characters of the
 * rest of the briefing above the fold — measured on an iPhone 16 in both
 * orientations, not inferred.
 */

/**
 * THE BRIEFING NAMES THE CEILING IT IS GRADED AGAINST — sweep161, six lessons
 * in this file at once. The founder's sentence for the class: „the briefing
 * does not match what is graded."
 *
 * Every adverse-conditions drill briefed a TARGET („около 25 км/ч") and was
 * then graded against a CEILING the student was never told, which the world
 * printed at him on the gate bar as an instruction. Measured over this file's
 * compiled rungs, before:
 *
 *   lesson              briefing   authored gate   bar/card at L1
 *   sc-ac-night-lights  под 50           55              50   ← the coach said 55
 *   sc-ac-rain-lights   ~38              42              47
 *   sc-ac-wet-braking   ~38              42              47
 *   sc-ac-fog           ~25              30              35
 *   sc-ac-snow          ~22              25              30
 *   sc-ac-crosswind     ~34              40              45
 *   sc-ac-aquaplane     под 60           58              58   ← copy LOOSER than gate
 *
 * Three different defects wear one shape, and they are fixed separately:
 *  1. night-lights authored a gate ABOVE the posted limit — a false PASS, and
 *     the only one of the seven that moves a graded number (see sc-acn-lit).
 *  2. aquaplane briefed 60 over a gate of 58 — a false FAILURE: a student who
 *     obeys „под 60 км/ч" at 59 is refused the objective at L3+. The copy is
 *     tightened onto the gate; the gate is NOT loosened onto the copy.
 *  3. the other five briefed a target and hid the ceiling. Each now names both
 *     in the same step — the target to aim at and the ceiling that is graded —
 *     so the number the gate bar shows is a number he was told.
 *
 * WHAT THIS FILE COULD NOT CLOSE, so it is written down rather than implied:
 * at L1/L2 the bar still reads authored + 5 / + 2.5 (`params.ts` widenSpeedCap,
 * `SPEED_CAP_GRACE_KMH_PER_TOLERANCE`). Its only ceiling is the POSTED limit,
 * which in adverse conditions is the wrong ceiling — the L1 bar of a rain drill
 * reads 47 while the rule engine bills SPEED_TOO_FAST_FOR_CONDITIONS above
 * 0.85 × 50 = 42.5, and fog's reads 35 over an envelope of 30. That is B58 one
 * level in (the world instructing the fault it is about to bill), it is not
 * authorable from here, and the caps below are already AT their envelope.
 *
 * The steps that carry a ceiling keep the bare number OUT of any imperative
 * clause: `vehicle/tier-feasibility.test.ts` reads „дръж/карай/стабилизирай …
 * N" as an order to REACH N, and a ceiling is not a target. The demand set of
 * every step below is unchanged by this wave.
 */

import type { BrakingLeadCarSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Night, l5Wet } from "./complications";

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
    // Step 1 opened with „Преди да потеглиш по тъмно:“ — the condition first and
    // the imperative eleven words in. Reversed. Step 2 is untouched: „под 50
    // км/ч“ is an UPPER bound and tier-feasibility reads it as one only while the
    // word „под“ stays immediately in front of the number.
    // 66 ch
    { n: 1, textBg: "Включи късите светлини още със запалването на двигателя — тъмно е." },
    // 61 ch
    { n: 2, textBg: "Потегли по правата улица и дръж спокойна скорост под 50 км/ч." },
    // 78 ch
    { n: 3, textBg: "Дръж късите включени през цялото време по тъмно, не „когато се стъмни съвсем“." },
    // 83 ch
    { n: 4, textBg: "Не се води по светлото табло и лампите — те не осветяват пътя и не те правят видим." },
    // 55 ch
    { n: 5, textBg: "Продължи с включени къси светлини до края на отсечката." },
  ],
  success: [
    {
      id: "sc-acn-lit",
      titleBg: "Мини контролната зона осветен",
      // THE GATE MAY NOT LICENSE THE SPEED THE STREET FORBIDS — sweep161,
      // `sc-ac-night-lights/pc-wrong/04-t012s.png`. ac-night-v1 is posted 50,
      // step 2 says „под 50 км/ч" and the В26 plate in the frame reads 50 —
      // and this gate was authored at 55. `lessons/engine.ts` prints
      // `params.maxSpeedKmh` RAW in its live nudge, so the coach's own sentence
      // in that frame was «Задачата иска да си тук с не повече от 55 км/ч, а в
      // момента караш 59 км/ч»: the instructor licensing a 10 % offence inside
      // the 50 zone his own briefing had just named. B58 had already clamped
      // the two channels that read the sign (RouteGuidance's bar, the advisor
      // card — both printed 50 in the same frame), which is exactly what left
      // the contradiction visible instead of uniform.
      //
      // The 55 was never the ladder's doing and could not be undone there:
      // `scenario/params.ts` widenSpeedCap bounds grace by
      // max(authored, posted), so an authored over-post compiles UNCHANGED at
      // every rung (measured: 55 at L1–L5) and that file deliberately refuses
      // to tighten it — „tightening it is an authoring decision, not the
      // ladder's". This is that authoring decision. At night the prudent-speed
      // factor is 1 (lit urban Sofia — the envelope note at the top of this
      // file), so the conditions envelope here IS the sign: 50.
      //
      // MEASURED AFTER: authored 50 → compiled 50 at L1–L5, so the world bar
      // (min(cap, posted)) is 50, the engine nudge that prints the raw param is
      // 50, the advisor card can no longer be handed anything above 50, and the
      // briefing already said 50 — every surface reads the sign. The shadow
      // drives 44 km/h (traces/scAcNightLights.ts), so the demonstration and
      // the L3 bot are untouched; what changes is that a 51–55 km/h drive now
      // FAILS the gate it used to be credited by.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 50 },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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
    // Step 3 was 109 characters of pure rationale with the point at the end. The
    // rule first, the vanishing grey car second.
    // 69 ch
    { n: 1, textBg: "Включи късите светлини — вали, макар да е ден: „чистачки → светлини“." },
    // 74 ch — the graded ceiling (sc-acr-lit, 42) now stands beside the target
    // it was hidden behind; „таванът тук е 42" carries no imperative, so
    // tier-feasibility still reads zero speed ORDERS in this step.
    { n: 2, textBg: "Потегли със съобразена за дъжда скорост — около 38 км/ч, таванът тук е 42." },
    // 59 ch
    { n: 3, textBg: "Помни: късите в дъжд не са за да виждаш, а за да те виждат." },
    // 73 ch
    { n: 4, textBg: "Знай, че сивата кола без светлини просто изчезва в огледалата на другите." },
    // 58 ch
    { n: 5, textBg: "Дръж късите включени, докато вали и видимостта е намалена." },
    // 55 ch
    { n: 6, textBg: "Продължи с включени къси светлини до края на отсечката." },
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
    // Order only: steps 1, 2 and 4 each led with the weather, the trigger or the
    // exception and reached the verb late.
    // 63 ch
    { n: 1, textBg: "Потегли с включени къси светлини — тъмно е и пред теб има кола." },
    // 77 ch
    { n: 2, textBg: "Превключи на къси, щом настигнеш кола — иначе я заслепяваш през огледалата ѝ." },
    // 72 ch — sc-ahl-follow grades 45 and the world prints it on the gate bar;
    // this drill was the last capped gate in the file whose number the briefing
    // never spoke. No finding named it: it is here because the rule below is a
    // rule, and a rule with one silent exception is a list.
    { n: 3, textBg: "Следвай предната кола на дистанция и с КЪСИ светлини — таванът тук е 45." },
    // 68 ch
    { n: 4, textBg: "Мини на дълги чак когато няма нито изпреварвана, нито насрещна кола." },
    // 62 ch
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Wet(),
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
    // Step 4 welded two different pedal acts (lift earlier, brake softer) into
    // one 107-character sentence. They are two acts; they are two steps.
    // 74 ch — sc-acw-approach grades 42; step 1 is the row the compact card
    // always paints, so the ceiling goes there (the sc-zebra-approach rule in
    // briefing-card-budget.test.ts: the number he is graded against on the
    // line he cannot scroll away from).
    { n: 1, textBg: "Включи късите светлини и потегли с около 38 км/ч — вали, таванът тук е 42." },
    // 64 ch
    { n: 2, textBg: "Спри плавно на маркираната позиция зад спрелия отпред автомобил." },
    // 66 ch
    { n: 3, textBg: "Помни: на мокро спирачният път е около 1,4 пъти по-дълъг от сухия." },
    // 60 ch
    { n: 4, textBg: "Вдигни газта много по-рано, отколкото ти казва сухият навик." },
    // 50 ch
    { n: 5, textBg: "Натисни спирачката меко и постепенно, не наведнъж." },
    // 74 ch
    { n: 6, textBg: "Спри напълно на позицията, с дистанция до спрелия отпред, и задръж колата." },
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  conditions: { weather: "rain" },
  // THE SLICE: the live student car runs wet-grip physics (opt-in, authored).
  physics: { wetGrip: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-ac-fog — „Мъгла" (AC-05, fog-lamp discipline) on ac-rain-v1 (360 m
//    straight street, limit 50, DAY dense fog — the FOG weather unlock)
// ---------------------------------------------------------------------------

/**
 * AC-05 — дисциплина на фаровете за мъгла + съобразена скорост в гъста мъгла
 * (ЗДвП чл. 20, ал. 2: скоростта се съобразява с видимостта, така че водачът
 * да може да спре в рамките на ВИДИМОТО платно; чл. 74: при значително
 * намалена видимост се включват предните фарове за мъгла, заедно с късите
 * светлини). Няма насрещен участник — това НЕ е AC-03 (дълги срещу насрещни).
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
  archetypeIds: ["AC-05"],
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
    // Steps 3 and 4 were 171 and 149 characters. Step 2 keeps „стабилизирай …
    // 25 км/ч“ AT INDEX 2 on purpose — tier-feasibility's imperative sweep labels
    // a speed order by its instruction number, and 25 km/h is feasible on every
    // tier, so the row must stay recognisably the same row.
    // 72 ch
    { n: 1, textBg: "Включи късите светлини и фаровете за мъгла (клавиш V) преди да потеглиш." },
    // 71 ch — sc-acf-adapted grades 30 (= the 0.6 × 50 fog envelope). „25"
    // stays inside the „стабилизирай" clause, so it remains the ONE speed
    // order tier-feasibility sees here, at instruction 2, exactly as the note
    // above requires; the ceiling sits after the dash, orderless.
    { n: 2, textBg: "Потегли бавно и се стабилизирай около 25 км/ч — таванът в мъглата е 30." },
    // 66 ch
    { n: 3, textBg: "Карай толкова бързо, колкото виждаш — не колкото позволява знакът." },
    // 63 ch
    { n: 4, textBg: "Спирай В РАМКИТЕ на видимия участък — това е желязното правило." },
    // 78 ch
    { n: 5, textBg: "Сметни: виждаш 50 метра — значи спирачният ти път, с рефлекса вътре, е под 50." },
    // 72 ch
    { n: 6, textBg: "Гледай докъдето стига видимостта, не за маркировката в последния момент." },
    // 63 ch
    { n: 7, textBg: "Очаквай спрял автомобил или пешеходец да „изплува“ от пелената." },
    // 70 ch
    { n: 8, textBg: "Продължи така до края — фаровете за мъгла светят, докато трае мъглата." },
  ],
  success: [
    {
      id: "sc-acf-adapted",
      titleBg: "Мини контролната зона с къси светлини, фарове за мъгла и съобразена скорост",
      // Cap 30 km/h IS the fog conditions envelope (0.6 × 50): the adapted
      // ~25 km/h drive satisfies it; a dry-habit 38 km/h simply cannot
      // complete the objective without slowing into the envelope.
      //
      // ── AND THE LAMPS ARE HALF THE LESSON, so they are half the gate ──────
      // Sweep 161 photographed both telltales DIM from arrival through t101s
      // with this gate ticked at 1:56 and 3/3 stars, on the drill whose own
      // title is „Мъгла" and whose instruction 1 makes both lamps a
      // precondition of moving off. MEASURED THROUGH THE PRODUCTION EVALUATOR
      // on this template's OWN shipped recordings (the probe in
      // `conditions-lamp-gates.test.ts` is the same run, kept):
      //
      //   drive                    cockpit          sc-acf-adapted, before
      //   shadow-correct           low + fog ON     ✓ @23.9 s
      //   mistake-no-fog-lights    low + fog OFF    ✓ @23.9 s   ← the demo whose
      //                                                          whole subject is
      //                                                          the unlit lamp
      //   shadow, lamps forced off off + fog OFF    ✓ @23.9 s
      //
      // i.e. the gate could not tell the correct drive from the counter-example
      // this lesson ships to teach against, to the tenth of a second.
      //
      // THE FIX IS THE BANNER, and that is a routing fact rather than a style
      // choice. `objectives.ts` reads the lamp demand off `titleBg`
      // (`deriveLampDemand`) precisely so it can bind gates in template files
      // its own lane does not own; the AUTHORED alternative — a `requireLamps`
      // key in these params — does not typecheck, because
      // `ScenarioObjectiveSpec.params` is the real `ObjectiveParams` union and
      // `ReachZoneParams` lives in `lessons/types.ts`, another lane's file. (The
      // routing note that opened this row asked for the authored key; it was
      // never compilable. Whoever folds `ReachZoneWitnessDemands` into
      // `ReachZoneParams` should add `requireLamps: "fog"` here as the belt to
      // this brace.)
      //
      // So the title does both jobs, which is the stronger invariant anyway: the
      // banner is the only thing the student reads while the task sits unticked,
      // so the gate may refuse only for something the banner named. „fog" is the
      // чл. 74 pairing and asks for BOTH the dipped beams and the fog lamps —
      // exactly what this banner and instruction 1 promise.
      // `conditions-lamp-gates.test.ts` pins title → demand, so a copy edit that
      // drops the lamps from the words fails the build instead of the student.
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
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
    // „Стабилизирай се около 22 км/ч“ stays at index 2 for the tier-feasibility
    // reason recorded on sc-ac-fog above.
    // 57 ch
    { n: 1, textBg: "Включи късите светлини и потегли меко — пътят е заснежен." },
    // 77 ch — sc-acs-approach grades 25 (= the 0.5 × 50 snow envelope). Same
    // shape as fog: „22" keeps the imperative clause, the ceiling follows it.
    { n: 2, textBg: "Стабилизирай се около 22 км/ч — зимният таван тук е 25, наполовина под знака." },
    // 59 ch
    { n: 3, textBg: "Помни: зимната скорост не е „малко по-бавно“, а наполовина." },
    // 79 ch
    { n: 4, textBg: "Знай, че снегът държи около 40% от сухото — спирачката спира 2,5 пъти по-дълго." },
    // 75 ch
    { n: 5, textBg: "Вдигни газта многократно по-рано от сухия навик — напред е спрял автомобил." },
    // 38 ch
    { n: 6, textBg: "Спирай меко и постепенно, не наведнъж." },
    // 77 ch
    { n: 7, textBg: "Спри напълно на маркираната позиция, с дистанция до спрелия, и задръж колата." },
  ],
  success: [
    {
      id: "sc-acs-approach",
      titleBg: "Приближи с къси светлини и зимна скорост",
      // Cap 25 km/h IS the snow conditions envelope (0.5 × 50): the adapted
      // ~22 km/h drive satisfies it; the dry-habit 40 km/h cannot pass here
      // without slowing into the winter band.
      //
      // ── THE ONE LAMP DUTY NOTHING ELSE IN THE PRODUCT GRADES ─────────────
      // Sweep 161 photographed СВЕТЛИНИ dim throughout with this gate ticked,
      // and re-measured through the production evaluator the gate completes at
      // 21.6 s on the shadow's own path with the lamps forced OFF — the same
      // tenth of a second as the correct drive.
      //
      // WHY IT MATTERS MORE HERE THAN IN FOG. The rule engine has a lamp
      // detector for rain (HEADLIGHTS_OFF_IN_RAIN) and one for fog
      // (FOG_LIGHTS_OFF_IN_FOG); it has NONE for snow — `rules/engine.ts` arms
      // the rain arm on `raining` and the fog arm on `tick.fog`, and neither
      // reads `tick.snow`. So on this drill, instruction 1 („Включи късите
      // светлини") was an order the whole product never checked in any channel:
      // no violation, no card, and a green tick over an unlit car. The missing
      // detector is routed to the rules lane; this gate is what makes the order
      // real today, and the banner now names it so the refusal is legible.
      //
      // DEMANDED THROUGH THE BANNER — see the twin note on `sc-acf-adapted` for
      // why the authored `requireLamps` key does not typecheck from a template.
      // «къси светлини» resolves to the "low" demand in `deriveLampDemand`, and
      // `conditions-lamp-gates.test.ts` fails the build if the words and the
      // demand ever come apart.
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
    // L5 «Усложнени» — the complication kit (scenario/complications.ts):
    // the delta AND the instructor's line that explains it, authored together.
    l5Night(),
  ],
  conditions: { weather: "snow" },
  // THE COMPOSITION: the live student car runs snow-grip physics (opt-in,
  // authored — the weather tag alone never flips physics, the wet precedent).
  physics: { snowGrip: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7. sc-ac-crosswind — „Страничен вятър" (AC-12) on fo-follow-v1 (360 m
//    straight street, limit 50, DAY DRY — the CROSSWIND physics unlock)
// ---------------------------------------------------------------------------

/**
 * AC-12 — страничен вятър на открит участък (ЗДвП чл. 20, ал. 2: скоростта се
 * съобразява с атмосферните условия — вятърът е изрично такова условие — така
 * че водачът да запази контрол над превозното средство).
 *
 * THE WIND IS THE LESSON (the first opt-in crosswind template):
 *  - `physics.crosswind` compiles to LessonSpec.physics.crosswind → the LIVE
 *    student car takes a WESTWARD lateral force (−tuning.CROSSWIND_BRIDGE_N
 *    along world X) plus the deterministic gust sine (CROSSWIND_GUST_*):
 *    measured ≈1 m of downwind drift per 5 s hands-fixed at speed,
 *    compounding as the heading blows over (vehicle/crosswind.test.ts). On
 *    this northbound street „downwind" = toward the осева — the exact AC-12
 *    danger. A small steady counter-steer holds the lane; an over-correction
 *    genuinely overshoots.
 *  - DUAL-CHANNEL HONESTY (the 4a law, wind edition): the recorded demos are
 *    KINEMATIC (the recorder never runs VehicleSim), so the wind story is
 *    AUTHORED into the ghost polylines — the shadow's small held-and-released
 *    deviation, the mistakes' line-crossing drifts (traces/scAcCrosswind.ts).
 *  - NO NEW RULE CODE (doc 72's own call: „the POOR_LANE_KEEPING detector
 *    would grade the outcome unchanged"): the drift toward oncoming grades
 *    CENTER_LINE_TOUCHED, the over-correction wobble POOR_LANE_KEEPING —
 *    the shipped lane detectors ARE the honest grading.
 *  - DELIBERATELY NOT coupled to any weather tag: conditions stay "dry"
 *    (clear sky, full grip — wind is force, not friction), and no rain/fog/
 *    snow lesson acquires wind. Only this template AUTHORS the flag.
 *  - HONEST VISUAL SCOPE (stated, not hidden): no windsock/foliage assets and
 *    no per-zone exposure model ship in this slice — the live wind blows over
 *    the WHOLE map, evenly, from the first metre to the last.
 *
 * THE COPY MAY ONLY NARRATE THAT — sweep161, severity critical. This template
 * used to describe an exposed span („на моста", „открития участък", y ≈ 150–265)
 * and a lorry to be passed. Six of its eight steps did. Opened side by side
 * with `.audit-frames/sweep161/sc-ac-crosswind/pc-right/01-arrival.png` and
 * `04-t191s.png`, the world it runs on is fo-follow-v1: a dense 1+1 city street
 * with six-storey blocks, street trees and a kerbside row of parked cars on
 * BOTH sides for all 360 m. `content/world/fo-follow-v1.json` carries no
 * `zones` array at all, so there is no span to be exposed on and nothing marks
 * one; there is no bridge, no lorry, and wind is depicted nowhere — no swaying
 * tree, no drifting debris, no leaning vehicle. The founder's words: „the world
 * does not contain what the briefing promises."
 *
 * So the copy below narrates the wind that is REAL — steady, everywhere, with
 * the deterministic gusts of `vehicle/crosswind.test.ts` — and nothing else.
 * The places a crosswind is actually met (bridges, gaps between blocks, forest
 * edges, tunnel mouths, the lee of a lorry) survive in `teach.whenBg`, where
 * they are knowledge about the road rather than a claim about THIS road.
 * Giving the drill a genuinely exposed span is district work (a fo-follow-v1
 * successor with an authored wind zone + the exposure model); the предупреди-
 * телен знак for strong crosswind is likewise unplaceable — fo-follow-v1
 * declares zero signs. Both stay doc-65 Phase-4.
 */
export const SC_AC_CROSSWIND: ScenarioSpec = {
  id: "sc-ac-crosswind",
  family: "conditions",
  tagsBg: ["условия", "страничен вятър", "пориви", "контрол на волана"],
  titleBg: "Страничен вятър",
  objectiveBg:
    "Задръж лентата по цялата отсечка въпреки страничния вятър: намали още в началото, дръж волана здраво с двете ръце и посрещай поривите с леки, постоянни корекции — поривът бута колата към осевата линия, а рязката свръхкорекция е точно толкова опасна.",
  archetypeIds: ["AC-12"],
  conceptIds: ["c-speed-adaptation", "c-vehicle-controls", "c-general-care-duty"],
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
    // Step 1 spent 76 of its 125 characters describing the bridge before naming
    // the act (both hands on the wheel). Step 4's „втора корекция“ warning is the
    // one that kills, so it is no longer the tail of a 149-character sentence.
    //
    // Steps 1, 2, 3 and 8 named a bridge, an „открит участък" and a lorry that
    // fo-follow-v1 does not contain (the block above this template). They now
    // name the wind, which it does — blowing over the whole route, which is
    // exactly how `physics.crosswind` applies it.
    // 74 ch
    { n: 1, textBg: "Хвани волана здраво с двете ръце — по цялата отсечка духа страничен вятър." },
    // 76 ch
    { n: 2, textBg: "Очаквай пориви отдясно през целия маршрут — вятърът духа напряко на улицата." },
    // 66 ch — sc-acx-open grades 40; the target and the ceiling, together.
    { n: 3, textBg: "Намали сега, преди първия порив — тук около 34 км/ч, таванът е 40." },
    // 65 ch
    { n: 4, textBg: "Помни: колкото по-бавно караш, толкова по-малко те мести поривът." },
    // 73 ch
    { n: 5, textBg: "Посрещни с лека, ПОСТОЯННА корекция надясно порива, който те бута наляво." },
    // 63 ch
    { n: 6, textBg: "Отпусни корекцията плавно, щом поривът отслабне — вятърът диша." },
    // 69 ch
    { n: 7, textBg: "Пази се от рязката „втора корекция“ — тя изхвърля колата към бордюра." },
    // 70 ch
    { n: 8, textBg: "Дръж лентата до края — поривите не спират, докато не свърши отсечката." },
  ],
  success: [
    {
      id: "sc-acx-open",
      titleBg: "Мини отсечката със съобразена за вятъра скорост",
      // Cap 40 is the prudent-wind band this drill teaches (the shadow runs
      // ~34): both mistake demos carry near-50 through the gap and cannot
      // complete it — чл. 20 ал. 2 is graded by the objective, the LANE
      // discipline by the shipped detectors.
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 40 },
    },
    {
      id: "sc-acx-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcCrosswind.ts; gates in traces/__tests__/
  // sc-ac-crosswind-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-crosswind/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-crosswind/mistake-full-speed.trace.json" },
      titleBg: "Полет срещу поривите",
      whatWentWrongBg:
        "Колата вървеше с 50 км/ч и отпусната ръка на волана — поривът я премести с метри наляво и тя яздеше осевата линия срещу насрещното, докато водачът реагира. При страничен вятър скоростта се смъква ПРЕДИ порива, а воланът се държи здраво (чл. 20, ал. 2).",
      codeRefs: ["CENTER_LINE_TOUCHED"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-crosswind/mistake-overcorrect.trace.json" },
      titleBg: "Свръхкорекцията — вторият замах",
      whatWentWrongBg:
        "Поривът премести колата наляво — а водачът дръпна волана рязко надясно и я изхвърли чак до бордюра, лъкатушейки през половината платно. Свръхкорекцията е по-опасна от самия порив: срещу вятър се стои с меки, постоянни корекции, никога с резки движения.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
  ],
  teach: {
    whenBg:
      "Навсякъде, където заслонът внезапно изчезва: мостове, отвори между сгради, краят на гора, изходът от тунел — и в мига, в който подминеш изпреварван камион и излезеш от завета му. Предупредителният знак за страничен вятър и ръкавът-ветропоказател са сигнал да намалиш и да стегнеш хвата ОЩЕ ПРЕДИ порива.",
    whyBg:
      "Поривът бута колата с постоянна сила встрани — при висока скорост изминаваш повече метри, докато реагираш, и дрейфът те изнася към осевата линия. Още по-опасен е рефлексът „рязко срещу вятъра“: когато поривът внезапно отслабне, рязко завъртяният волан сам изхвърля колата на другата страна — вторият замах е причината за повечето катастрофи при вятър. Затова законът връзва скоростта и с атмосферните условия (чл. 20, ал. 2): по-бавно, здрав хват, меки корекции.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият следи контрола на волана при вятър и на открити участъци: очаква намаляване преди тях, стабилна лента и спокойни корекции. Лъкатушенето в лентата е грешка, а навлизането към осевата линия при насрещно движение — тежка: дръж две ръце на волана и смъкни скоростта.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  // DRY, clear weather — the wind is PHYSICS, never a weather render tag.
  conditions: { weather: "dry" },
  // THE SLICE: the live student car runs the crosswind force (opt-in,
  // authored — no weather tag ever flips physics, the wet precedent).
  physics: { crosswind: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 8. sc-ac-aquaplane — „Аквапланинг" (AC-07-full standing-water slice) on
//    ac-aqua-v1 (520 m extra-urban 90 road, DAY RAIN, WET-GRIP PHYSICS + the
//    FIRST waterPatch span — the surface-patch unlock)
// ---------------------------------------------------------------------------

/** The stop mark of sc-ac-aquaplane: the shadow eases to a full stop here,
 *  ~5.7 m short of the broken-down van at y = 460 (the wet-braking spacing,
 *  reused verbatim — nose 452.02 vs the van's rear face at 457.75).
 *  Denormalized from ac-aqua-v1 (lane x = 4.06). */
const AQUA_STOP_MARK_Y = 450;

/**
 * AC-07-full (the standing-water float) — аквапланинг върху дълбока вода
 * (ЗДвП чл. 20, ал. 2: скоростта се съобразява със състоянието на пътя и
 * атмосферните условия; при аквапланинг нито спирачка, нито волан достигат
 * асфалта — спасението е превантивно).
 *
 * THE SPEED GATE IS THE LESSON (the first waterPatch template — the
 * surface-patch slice on TOP of the shipped wet-grip seam):
 *  - `physics.wetGrip` runs the LIVE car at tuning.WET_GRIP_FACTOR (0.7) —
 *    the whole road is wet (rain), the shipped 4a seam;
 *  - the MAP carries the hazard: ac-aqua-v1's `waterPatch` span [240, 280]
 *    (patchGripFactor 0.15, aquaplaneAboveKmh 65 — tuning.AQUAPLANE_*).
 *    LessonScene resolves it (resolveSurfaceGripPatches) and VehicleRig
 *    drops the LIVE car's grip to MIN(0.7, 0.15) = 0.15 while the chassis
 *    crosses it AT OR ABOVE 65 km/h — above the float speed the tyres stop
 *    evacuating the water (doc 72 AC-07); below it the patch does NOT bite,
 *    so the taught ~55 km/h transit keeps real wet grip. Measured: at 0.15
 *    braking distance grows ≈ 5.5× and steering answers ≈ 0.14× of dry
 *    (vehicle/surface-grip.test.ts) — inside the water nothing works, which
 *    is exactly why the ONLY correct act happens BEFORE it.
 *  - DUAL-CHANNEL HONESTY (the 4a law): the recorded demos are KINEMATIC, so
 *    the float is AUTHORED — the mistakes carry speed through the span
 *    unbraked (in the water no ramp exists at all) and pay after it (a
 *    WET_DECEL overrun into the van / the authored drift onto the осева);
 *    the shadow's ramps stay at SCRIPT_DECEL × WET_GRIP_FACTOR.
 *  - NO NEW RULE CODE (the crosswind discipline): the float's consequences
 *    grade through shipped machinery — COLLISION into the staged van,
 *    CENTER_LINE_TOUCHED for the drift, SPEED_TOO_FAST_FOR_CONDITIONS for
 *    the dry-limit habit in rain.
 *  - HONEST VISUAL SCOPE (stated, not hidden): no water decal/reflection
 *    asset ships in this slice (the snow/crosswind precedent) — the copy,
 *    the shadow ghost, the ribbon and the objective markers narrate WHERE
 *    the standing water is; the LIVE physics change is fully real.
 * Like the wet/snow molds, the broken-down van is a RECORDER obstacle rect
 * (trace channel), not a live prop — the live student's graded skill is the
 * pre-water slow-down zone + the low-speed stop mark; the collision
 * consequence is demonstrated by the red ghosts.
 */
export const SC_AC_AQUAPLANE: ScenarioSpec = {
  id: "sc-ac-aquaplane",
  family: "conditions",
  tagsBg: ["условия", "дъжд", "аквапланинг", "стояща вода", "съобразена скорост"],
  titleBg: "Аквапланинг",
  objectiveBg:
    "Мини участъка със стояща вода на извънградския път: намали под 58 км/ч ПРЕДИ водата, прекоси я с равна газ и прав волан и спри плавно на позицията зад авариралия автомобил — над ~65 км/ч гумите изплуват и нито спирачката, нито воланът работят.",
  archetypeIds: ["AC-07"],
  conceptIds: ["c-rain-aquaplaning", "c-speed-adaptation", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ac-aqua-v1.json meta.scenario.params
    // (tools/maps/gen_ac_surface.mjs).
    params: { lengthM: 520, maxspeedKmh: 90 },
    districtId: "ac-aqua-v1",
  },
  start: {
    spawnPointId: "ac-aqua-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Step 2 was 177 characters and defined aquaplaning inside a sentence about
    // where the water is. The graded act — sc-acq-before, „намали под 60 ПРЕДИ
    // водата“ — was step 3, third clause. It is a step of its own now, 55 ch.
    // 66 ch
    { n: 1, textBg: "Включи късите светлини и потегли с около 70 км/ч — вали от часове." },
    // 66 ch
    { n: 2, textBg: "Помни: знакът извън града е 90, но дъждът сваля разумната скорост." },
    // 61 ch
    { n: 3, textBg: "Гледай напред — в ниското платното е покрито със стояща вода." },
    // 72 ch
    { n: 4, textBg: "Знай: над ~65 км/ч гумите „изплуват“ — воланът олеква и колата не слуша." },
    // 56 ch — 60 → 58, the number sc-acq-before actually grades. „под 60" was
    // 2 km/h LOOSER than the gate, so at L3/L4 (no ladder grace) a student who
    // obeyed the briefing at 59 was refused the objective. Tightening the copy
    // costs nothing; loosening the gate to 60 would eat the margin under the
    // 65 km/h float speed, which is the whole lesson.
    { n: 5, textBg: "Намали ПРЕДИ водата — под 58 км/ч, още на чистия асфалт." },
    // 66 ch
    { n: 6, textBg: "Отпусни газта плавно и спирай меко, преди да си стъпил във водата." },
    // 86 ch
    { n: 7, textBg: "Дръж равна газ и прав волан във водата: под скоростта на изплуване протекторът работи." },
    // 76 ch
    { n: 8, textBg: "Спри напълно на позицията зад авариралия — мокрият път е ~1,4 пъти по-дълъг." },
  ],
  success: [
    {
      id: "sc-acq-before",
      // The title says the SAME number the params grade (58). It said 60, and
      // `advisor.ts` titleCapKmh takes the strictest of the two, so the card
      // read „под 60" at L1 and „под 58" at L3 for one unchanged gate.
      titleBg: "Намали под 58 ПРЕДИ водата",
      // Cap 58 sits UNDER the 65 km/h float speed with margin: a car that
      // passes here at 58 or less physically cannot aquaplane in the span.
      // The dry-habit 85+ (and the „lawful" 72) blow this zone.
      params: { kind: "reachZone", x: LANE_X, y: 225, radiusM: 10, maxSpeedKmh: 58 },
    },
    {
      id: "sc-acq-mark",
      titleBg: "Спри точно на позицията зад авариралия",
      // Completable ONLY at near-stop speed (the pk-smooth-stop discipline):
      // a car that floated through the water arrives here without the meters
      // it needed — on wet physics it cannot rest at the mark.
      params: { kind: "reachZone", x: LANE_X, y: AQUA_STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcAquaplane.ts; gates in traces/__tests__/
  // sc-ac-aquaplane-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-aquaplane/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-aquaplane/mistake-full-speed.trace.json" },
      titleBg: "Полет във водата — 85 в дъжда",
      whatWentWrongBg:
        "Колата носеше 85 км/ч в пороя — несъобразена с дъжда скорост — и влетя в стоящата вода далеч над скоростта на изплуване: гумите заплуваха, спирачката и воланът престанаха да съществуват, а асфалтът се върна чак след водата — твърде късно за спиране зад авариралия. Ударът беше неизбежен още ПРЕДИ водата (чл. 20, ал. 2).",
      codeRefs: ["COLLISION", "SPEED_TOO_FAST_FOR_CONDITIONS"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-aquaplane/mistake-float-drift.trace.json" },
      titleBg: "„В нормата съм“ — 72 върху водата",
      whatWentWrongBg:
        "Скоростта уж беше съобразена с дъжда — но над скоростта на изплуване: върху водата предницата „заплува“, колата се понесе косо към осевата линия и я язди секунди наред срещу насрещното, докато водата свърши. Правилото не е „малко по-бавно“, а ПОД скоростта на изплуване — тук под 60 (чл. 20, ал. 2).",
      codeRefs: ["CENTER_LINE_TOUCHED"],
    },
  ],
  teach: {
    whenBg:
      "При силен дъжд и навсякъде, където водата се събира: ниските участъци, коловозите на изтъркан асфалт, страничната лента до бордюра, локвите след буря. Правилото е желязно: видиш ли стояща вода — намали ПРЕДИ нея, под скоростта на изплуване (за обикновени гуми ~60–70 км/ч, по-малко при изтъркан протектор).",
    whyBg:
      "Протекторът е помпа: до определена скорост той изхвърля водата изпод гумата, над нея водният клин повдига колата и тя се носи по водата като шейна — нула спирачка, нула волан, нула сцепление. В аквапланинг НИЩО не помага: рязката спирачка и завъртеният волан само подготвят занасянето за мига, в който гумите отново докоснат асфалт. Затова цялото умение е превантивно — по-ниска скорост преди водата, равна газ и прав волан в нея (чл. 20, ал. 2).",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият следи дали „четеш“ платното напред: при стояща вода очаква осезаемо намаляване ПРЕДИ участъка, спокойни ръце върху волана и никакво спиране във водата. Несъобразената с мокрия път скорост е грешка, а ударът в препятствие прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "rain" },
  // THE SLICE: the live car runs wet-grip physics (opt-in, authored); the
  // waterPatch itself is MAP DATA — the district is the second opt-in.
  physics: { wetGrip: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 9. sc-ac-ice — „Черен лед" (AC-08 ice band) on ac-ice-v1 (360 m street,
//    limit 50, COLD CLEAR MORNING — day, dry, NO physics flag: the icePatch
//    span in the map data is the whole hazard)
// ---------------------------------------------------------------------------

/** The stop mark of sc-ac-ice: the shadow crawls to a full stop here, ~5.7 m
 *  short of the stalled car at y = 290 (nose 282.02 vs its rear face at
 *  287.75) — ON the icy span [210, 300], which is why the approach must
 *  already be crawling. Denormalized from ac-ice-v1 (lane x = 4.06). */
const ICE_STOP_MARK_Y = 280;

/**
 * AC-08 (ice band) — ЧЕРЕН ЛЕД върху обикновена улица в ясна студена сутрин
 * (ЗДвП чл. 20, ал. 2: скоростта се съобразява със СЪСТОЯНИЕТО НА ПЪТЯ — и
 * невидимото; урокът е да очакваш лед след влажна нощ с минус, там където
 * пътят изглежда просто сух).
 *
 * THIS DRILL IS NOT THE BRIDGE DRILL — sweep161, severity critical. It shipped
 * as „Лед по моста" and its briefing told the student to slow BEFORE the
 * bridge, to know the bridge has no warm ground under it, to read an А15 plate
 * before it and to look at a car stranded ON it. Opened against
 * `.audit-frames/sweep161/sc-ac-ice/pc-right/04-t098s.png` (and 03-ready,
 * mobile 05-stopped) the world is ac-ice-v1: a dead-straight street running to
 * the horizon between buildings and parked cars. Checked in
 * `content/world/ac-ice-v1.json`, three of the four promises cannot be kept
 * from here at all — the document declares NO bridge geometry, `signs` is
 * absent entirely (the „А15" lives only as `zones[0].signRef`, a data label
 * nothing places or renders), and the stalled car is a RECORDER rect with no
 * entry in `scene/scenarioSceneryProps.ts`, so the live student drives past
 * empty asphalt where the briefing points.
 *
 * The bridge arm of AC-08 already has its own lesson — `sc-ac-bridge-ice`
 * („Мостът замръзва пръв", templates-conditions2.ts) on ac-bridge-v1, whose
 * icePatch IS authored as a deck. So the copy here stops competing with it and
 * takes the arm this map can actually stage: BLACK ICE ON AN ORDINARY STREET,
 * where the invisibility is the whole hazard. „Мостове, надлези, сенки" survive
 * in teach.whenBg as knowledge about the road, not as a claim about this one.
 *
 * THE MAP IS THE WHOLE HAZARD (the first icePatch template — and the first
 * template whose reduced grip arrives PURELY through district data):
 *  - NO physics flag is authored (base grip 1 — clear, dry, cold morning;
 *    contrast sc-ac-aquaplane's wetGrip base) and NO weather tag (dry day —
 *    ice under a blue sky on asphalt that looks dry IS the doc-72 surprise);
 *  - ac-ice-v1's `icePatch` span [210, 300] (patchGripFactor 0.15 —
 *    tuning.ICE_PATCH_GRIP_FACTOR) is resolved by LessonScene and applied
 *    by VehicleRig: MIN(1, 0.15) = 0.15 on the span, at ANY speed (ice has
 *    no float gate). Measured: braking ≈ 5.5× longer, steering ≈ 0.14×
 *    (vehicle/surface-grip.test.ts) — on the ice the car answers almost
 *    nothing, so every input must be tiny and everything decided BEFORE
 *    the icy span begins.
 *  - DUAL-CHANNEL HONESTY: the demos are kinematic — the mistakes' slides
 *    are AUTHORED (the brake-on-ice ramp runs SCRIPT_DECEL ×
 *    ICE_PATCH_GRIP_FACTOR ≈ 0.69 m/s² and STILL cannot stop the car; the
 *    harsh-steer slide glides wide past the stalled car), the shadow's
 *    on-ice stop uses the same honest ≈0.69 envelope started absurdly early.
 *  - NO NEW RULE CODE: COLLISION into the staged car and POOR_LANE_KEEPING
 *    for the sliding swerve — shipped detectors only.
 *  - HONEST VISUAL SCOPE: no ice sheen decal ships (the snow precedent) —
 *    invisibility is not a descope here but the POINT of black ice; the copy
 *    and the ghosts carry the warning. What IS a gap, and is not this file's
 *    to close: the stalled car has no `scenarioSceneryProps.ts` entry (the
 *    sc-ac-wet-braking and sc-ac-snow vans have one), so the mistake demos
 *    below narrate a collision with a body the scene never draws. The copy
 *    the LIVE student is given therefore points at the marked position, which
 *    the guidance layer does draw, and stays true either way.
 */
export const SC_AC_ICE: ScenarioSpec = {
  id: "sc-ac-ice",
  family: "conditions",
  tagsBg: ["условия", "лед", "черен лед", "зимни условия", "плавни движения"],
  titleBg: "Черен лед",
  objectiveBg:
    "Ясна студена сутрин, а платното напред е заледено, без да личи: намали до пълзене ОЩЕ на чистия асфалт, мини ледения участък с равна газ и прав волан и спри свръхплавно на маркираната позиция — върху лед спирачката и воланът почти не съществуват.",
  archetypeIds: ["AC-08"],
  conceptIds: ["c-winter-ice", "c-braking-distance", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ac-ice-v1.json meta.scenario.params
    // (tools/maps/gen_ac_surface.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "ac-ice-v1",
  },
  start: {
    spawnPointId: "ac-ice-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // THE GRADED ACT IS THE LINE. sc-aci-before grades the slow-down BEFORE the
    // ice, and it was the second half of a 139-character step 2 whose first
    // half explained bridge thermodynamics. The physics and the reason all
    // still ship — behind the act instead of in front of it.
    //
    // Steps 1, 2, 4, 7 and 9 pointed at a bridge, an А15 plate and a stranded
    // car, none of which ac-ice-v1 contains (the block above this template).
    // They now point at the three things it DOES have: the clean approach
    // asphalt, the invisible ice, and the marked stop position the guidance
    // layer draws.
    // 64 ch — sc-aci-before grades 30; the target and the ceiling, together.
    { n: 1, textBg: "Намали до около 25 км/ч ОЩЕ на чистия асфалт — таванът тук е 30." },
    // 74 ch
    { n: 2, textBg: "Гледай напред: платното изглежда сухо, но нощта е била влажна и мразовита." },
    // 68 ch
    { n: 3, textBg: "Помни: откритите участъци замръзват първи при минус след влажна нощ." },
    // 73 ch
    { n: 4, textBg: "Знай: черният лед е прозрачен — под него асфалтът изглежда сух или мокър." },
    // 72 ch
    { n: 5, textBg: "Дръж равна газ и прав волан — никаква рязка спирачка, никакво завъртане." },
    // 52 ch
    { n: 6, textBg: "Помни: върху леда сцеплението е около 15% от сухото." },
    // 72 ch
    { n: 7, textBg: "Виж маркираната позиция напред — до нея се стига само с пълзене по леда." },
    // 65 ch
    { n: 8, textBg: "Започни да спираш многократно по-рано, с едва докосната спирачка." },
    // 76 ch
    { n: 9, textBg: "Спри напълно на маркираната позиция и задръж колата — плавността е умението." },
  ],
  success: [
    {
      id: "sc-aci-before",
      titleBg: "Намали до пълзене ПРЕДИ леда",
      // Cap 30: the winter crawl must be established on the CLEAN approach —
      // slowing ON the ice is exactly what the 0.15 grip cannot deliver.
      params: { kind: "reachZone", x: LANE_X, y: 190, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-aci-mark",
      // Was „…зад закъсалия": the stalled car is a recorder rect with no
      // scenery-prop entry, so the live student is sent to look at nothing.
      // The marked position IS drawn, and stays the right words if the prop
      // ever lands.
      titleBg: "Спри свръхплавно на маркираната позиция",
      // ON the icy span (where the demos' stalled car slid to a stop) —
      // completable only by a crawl with an absurdly early, feather-light
      // brake; any dry habit blows through at speed.
      params: { kind: "reachZone", x: LANE_X, y: ICE_STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 90 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcIce.ts; gates in traces/__tests__/sc-ac-ice-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-ice/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-ice/mistake-brake-on-ice.trace.json" },
      titleBg: "Спирачка върху леда",
      whatWentWrongBg:
        "Улицата изглежда суха и колата носи 50 — а участъкът напред е заледен. Водачът видя закъсалия автомобил и натисна спирачката ВЪРХУ леда: при 15% сцепление тя почти не забавя и колата се плъзна десетки метри право в спрелия — ударът дойде с около 40 км/ч. Върху лед се пристига бавно: намаляването става ПРЕДИ ледения участък, на чист асфалт (чл. 20, ал. 2).",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-ice/mistake-harsh-steer.trace.json" },
      titleBg: "Рязък волан върху леда",
      whatWentWrongBg:
        "Вместо спирачка — паническо дръпване на волана: върху леда завъртяното колело не води, а ПОДНАСЯ. Колата се плъзна косо покрай закъсалия на сантиметри, олюлявайки се чак до бордюра, и се събра в лентата едва след ледения участък. Оцеляването ѝ беше късмет, не умение — на лед всяко движение е малко и плавно, а скоростта пада ПРЕДИ леда.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
  ],
  teach: {
    whenBg:
      "Във всяка студена сутрин след влажна нощ — и с особено внимание на откритите места: мостове, надлези, крайречни участъци, сенките на сгради и дървета, които не се топят. Мостът замръзва пръв, защото няма топла земя под платното. Знакът А15 и термометърът около нулата значат едно: смъкни скоростта ПРЕДИ участъка и мини по него без нито едно рязко движение.",
    whyBg:
      "Ледът оставя на гумите около 10–20% от сухото сцепление — спирачният път от 40 км/ч става колкото сухият от 100, а завъртеният волан не завива, а отключва занасяне. Най-коварното е, че ледът не се вижда: черният лед е прозрачен и под него асфалтът изглежда просто сух под същото синьо небе. Затова законът връзва скоростта със СЪСТОЯНИЕТО на пътя, не с изгледа му (чл. 20, ал. 2) — който очаква леда там, където той се ражда, пристига върху него бавно и с прав волан.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият очаква „зимно четене“ на пътя: разпознат риск от заледяване, намаляване ПРЕДИ съмнителния участък, меки команди и многократно по-ранно спиране. Рязката спирачка или воланът върху лед е грешка в преценката, а плъзгането в препятствие прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  // A COLD CLEAR MORNING: day, dry, no weather render — the ice is the map's
  // own data (icePatch span), never a weather tag. NO physics flag either:
  // the base grip stays 1 and ONLY the span reduces it (the first pure
  // map-data grip template).
  conditions: { weather: "dry" },
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
  SC_AC_CROSSWIND,
  SC_AC_AQUAPLANE,
  SC_AC_ICE,
];
