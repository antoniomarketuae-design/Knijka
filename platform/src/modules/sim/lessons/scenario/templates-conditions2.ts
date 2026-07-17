/**
 * Scenario templates — the ADVERSE-CONDITIONS family, wave 2: the NIGHT-SPEED
 * slice that templates-conditions.ts never reached, because every shipped AC
 * template grades a LIGHT CHANNEL (lights off / beams undipped / fog lamps) and
 * none grades the speed you carry into your own beam. DATA ONLY, in the
 * templates.ts mold (coordinates denormalized from the committed district file
 * so nothing loads world JSON at runtime; the trace gate asserts every pinned
 * value against the generated map):
 *
 *  - sc-ac-night-overdrive  „Не изпреварвай собствените си фарове" (SP-07 +
 *                           AC-01, ov-oncoming-v1 REUSED at NIGHT)
 *
 * Family: "conditions" — the existing catalog chip (doc 76 §2).
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated district by value — the
// L7 pattern; the trace gate asserts the copies match ov-oncoming-v1)
// ---------------------------------------------------------------------------

/** Own-lane (northbound) center of ov-oncoming-v1 (1+1 rural road). */
const LANE_X = 4.06;

/** The stop mark the shadow eases to a full stop at: ~5.7 m short of the unlit
 *  stalled trailer at y = 400 (nose 392.02 vs its rear face at 397.75) — the
 *  sc-ac-wet-braking / sc-ac-ice stop-mark geometry, reused verbatim. */
const OVERDRIVE_STOP_MARK_Y = 390;

/**
 * SP-07 — „Скорост при ограничена видимост нощем" / overdriving the headlights
 * (ЗДвП чл. 20, ал. 2: скоростта се съобразява с атмосферните условия и с
 * ВИДИМОСТТА, така че водачът да може да спре пред всяко предвидимо
 * препятствие — нощем на къси светлини видимото платно, не знакът, е
 * истинското ограничение). The second demo is the AC-01 beat (движение нощем
 * без светлини, чл. 70) played on the same unlit road.
 *
 * THE ROAD IS THE LESSON (the first template on the night-speed envelope):
 *  - ov-oncoming-v1 is a 900 m EXTRA-URBAN 1+1 road posted at 90 — the doc-72
 *    SP-07 frame verbatim („unlit segment, lows throw ~50 m; stopping from 70
 *    needs more"). Low beams light ~40 m; stopping from 90 needs ~73 m of
 *    reaction + braking. Driving the POSTED LIMIT here is lawful on paper and
 *    blind in fact — that gap IS the archetype.
 *  - WHY ov-oncoming-v1 and not an urban street: the lesson is arithmetic, and
 *    it only exists where the posted limit EXCEEDS the beam's ~60 km/h ceiling.
 *    On a 50-zone the limit already fits inside the beam (≈29 m of stopping
 *    from 50), so „не изпреварвай фаровете" would be a fabricated rule. This
 *    district is also the ONLY committed 90-road with no zones, no crossings
 *    and no junctions (the aquaplane road carries a waterPatch span), so
 *    NOTHING but the night speed and the lights is gradable. The drives never
 *    leave the own lane, so the corridor tracker never arms.
 *
 * THE NIGHT ENVELOPE IS AUTHORED, NOT ASSUMED (read before editing):
 *  - `conditionSpeedNightFactor` ships at 1 ON PURPOSE (rules/types.ts): the
 *    MVP world is LIT urban Sofia, where cruising at the posted limit on low
 *    beams is exactly what every competent driver does — a blanket night
 *    reduction would flag the single most common innocent night behaviour
 *    (the A12 FP case). That default is correct and stays untouched.
 *  - Its own note names the escape hatch: „If unlit rural segments arrive,
 *    reintroduce a reduction as a per-segment world signal, not a blanket
 *    night factor" — and doc 72's SP-07 entry says the same („the types.ts
 *    night-factor note anticipates per-segment lighting").
 *  - Until per-segment lighting is district DATA, the honest seam is
 *    `ruleConfig` (per-DRILL, propagated by compileScenario to
 *    LessonSpec.ruleConfig): this whole map IS the unlit segment, so
 *    per-scenario and per-segment coincide here. 0.65 × 90 = 58.5 km/h — the
 *    „спри в осветеното" band the archetype teaches, and no other lesson on
 *    this district (sc-ov-abort, sc-ov-oncoming-gap, sc-ov-night-gap) changes
 *    by a single tick.
 *  - SPEED_TOO_FAST_FOR_CONDITIONS is capped at the graced posted limit by
 *    construction (engine.ts), so the 90 km/h demo bills the CONDITIONS code
 *    and never SPEEDING_*: it is lawful speed, imprudent for the dark — two
 *    different lessons, and this is the one that kills.
 *
 * Like sc-ac-wet-braking / sc-ac-snow / sc-ac-ice, the stalled trailer is a
 * RECORDER obstacle rect (trace channel), not a live prop: the live student's
 * graded skill is the adapted approach + the low-speed stop-mark zone, and the
 * collision consequence is demonstrated by the red ghosts.
 */
export const SC_AC_NIGHT_OVERDRIVE: ScenarioSpec = {
  id: "sc-ac-night-overdrive",
  family: "conditions",
  tagsBg: ["условия", "нощно каране", "къси светлини", "съобразена скорост", "спирачен път"],
  titleBg: "Не изпреварвай собствените си фарове",
  objectiveBg:
    "На неосветен път карай така, че да можеш да спреш в осветените от късите светлини ~40 метра — над ~60 км/ч удряш това, което още не виждаш, колкото и да пише 90 на знака.",
  archetypeIds: ["SP-07", "AC-01"],
  conceptIds: [
    "c-night-visibility",
    "c-speed-adaptation",
    "c-stopping-distance-total",
    "c-braking-distance",
  ],
  map: {
    archetype: "straight-street",
    // Reuses the committed ov-oncoming-v1 map (900 m extra-urban 1+1, dashed
    // осева, NO zones) — its meta.scenario.params, mirrored for provenance.
    params: { lengthM: 900, maxspeedKmh: 90 },
    districtId: "ov-oncoming-v1",
  },
  start: {
    spawnPointId: "ovg-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Нощ е, извън града, и по този път няма нито една лампа. Късите светлини са включени — те осветяват около 40 метра напред и нищо отвъд тях.",
    },
    {
      n: 2,
      textBg:
        "Знакът разрешава 90. Но знакът е таван за ДЕНЯ — нощем твоят истински таван е снопът на фаровете. Потегли и се стабилизирай около 50 км/ч.",
    },
    {
      n: 3,
      textBg:
        "Сметни го: от 90 км/ч спираш за над 70 метра с реакцията вътре — а виждаш 40. Значи над ~60 км/ч буквално изпреварваш фаровете си.",
    },
    {
      n: 4,
      textBg:
        "Напред в лентата има необозначено препятствие. Ще го видиш едва когато влезе в снопа — гледай до края на осветеното, не в асфалта пред капака.",
    },
    {
      n: 5,
      textBg:
        "Щом препятствието се появи, спри плавно и докрай на маркираната позиция зад него — при 50 км/ч 40-те метра ти стигат с метри в аванс.",
    },
  ],
  success: [
    {
      id: "sc-acno-adapted",
      titleBg: "Мини неосветения участък със съобразена за видимостта скорост",
      // Cap 58 sits just under the authored night envelope (0.65 × 90 = 58.5):
      // the ~50 km/h drive satisfies it, while the „по знака" 90 cannot pass
      // this gate at all without first slowing into the beam's band.
      params: { kind: "reachZone", x: LANE_X, y: 250, radiusM: 12, maxSpeedKmh: 58 },
    },
    {
      id: "sc-acno-mark",
      titleBg: "Спри на позицията, в рамките на осветеното",
      // Completable ONLY at near-stop speed at the mark (the pk-smooth-stop
      // discipline): a car that carried the posted 90 into the dark is still
      // doing ~70 km/h here — it cannot rest on this zone.
      params: { kind: "reachZone", x: LANE_X, y: OVERDRIVE_STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcNightOverdrive.ts; gates in traces/__tests__/
  // sc-ac-night-overdrive-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-night-overdrive/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-night-overdrive/mistake-posted-limit.trace.json" },
      titleBg: "90 км/ч на къси светлини",
      whatWentWrongBg:
        "Колата носеше разрешените 90 през неосветения участък — „нали е в ограничението“. Но късите светлини показват 40 метра, а от 90 км/ч спирачният път с реакцията вътре е над 70: препятствието влезе в снопа и ударът беше вече неизбежен в мига, в който водачът го видя. Ограничението е таван за видим път; нощем на къси светлини скоростта се съобразява с осветеното (чл. 20, ал. 2).",
      codeRefs: ["SPEED_TOO_FAST_FOR_CONDITIONS", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-night-overdrive/mistake-lights-off.trace.json" },
      titleBg: "Тъмен участък без включени фарове",
      whatWentWrongBg:
        "Скоростта беше съобразена, но водачът пое в неосветения участък с изгасени светлини — таблото свети, дневните светлини лъжат, а пътят напред е абсолютно черен. Без къси светлини няма дори 40-те метра, с които да се съобразяваш: караш на сляпо и си невидим за насрещните. Движението нощем без светлини е основна грешка (чл. 70).",
      codeRefs: ["HEADLIGHTS_OFF_AT_NIGHT"],
    },
  ],
  teach: {
    whenBg:
      "На всеки неосветен път нощем — извънградските отсечки, обходните шосета, селските улици без лампи. Правилото е аритметика, не усещане: късите светлини показват ~40 метра, значи спирачният ти път ПЛЮС реакцията трябва да се съберат в тях. На къси това означава около 60 км/ч таван, колкото и да пише на знака.",
    whyBg:
      "Нощем не караш по пътя — караш по снопа на фаровете. Всичко отвъд 40-те метра е чиста тъмнина, а в нея еднакво спокойно стоят закъсал камион, пешеходец в тъмни дрехи и животно. Който кара 90 на къси, стига до препятствието по-рано, отколкото очите му са го намерили: когато то влезе в снопа, вече е късно да спреш — това е „изпреварване на собствените фарове“. Затова чл. 20, ал. 2 връзва скоростта с ВИДИМОТО платно, а не с табелата: знакът е таван за деня, фаровете са таванът за нощта. Дългите светлини удължават снопа, но само докато няма никого — щом се появи кола, се връщаш на къси и на скоростта, която къси позволяват.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият следи дали скоростта ти следва видимостта: на неосветен участък очаква осезаемо намаляване под ограничението, без да чака подкана. Несъобразената с видимостта скорост е грешка, движението без светлини нощем — основна, а ударът в препятствие прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — дъжд върху нощта: RENDER/conditions axis only (night carries from
    // the template conditions: compileScenario spreads rung over template).
    // The rain factor (0.85 → 76.5) is LOOSER than the authored night factor
    // (0.65 → 58.5) and the engine composes conditions by MIN, so the envelope
    // stays 58.5 and the rung adds visibility pressure without re-tuning the
    // grading. NO `physics`: the authored ghost envelope is dry-tuned
    // (ADR-006 stage 4a — see the file report for the missing per-rung seam).
    { level: 5, conditions: { weather: "rain" } },
  ],
  // The unlit rural night — no staged actor anywhere: a lead car's tail lights
  // would MARK the hazard and quietly delete the lesson (the dark is the drill).
  conditions: { weather: "dry", night: true },
  // THE AUTHORED ENVELOPE (per-drill, never global — see the header): this
  // road is the unlit segment rules/types.ts' night-factor note anticipates.
  ruleConfig: { conditionSpeedNightFactor: 0.65 },
  localeBg: "bg-BG",
};

/** The wave-2 adverse-conditions templates, in catalog order (registered in
 *  templates.ts by the integration pass). */
export const SCENARIO_TEMPLATES_CONDITIONS2: readonly ScenarioSpec[] = [SC_AC_NIGHT_OVERDRIVE];
