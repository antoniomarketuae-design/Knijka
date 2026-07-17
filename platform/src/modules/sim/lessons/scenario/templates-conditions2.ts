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
 *  - sc-ac-truck-spray      „Водна пелена зад камиона" (FO-04 + FO-06 + AC-02,
 *                           mw-v1 REUSED in RAIN — the wave-5 addition)
 *
 * Family: "conditions" — the existing catalog chip (doc 76 §2).
 */

import type { CutInLeadCarSpec } from "../../contracts";
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

// ---------------------------------------------------------------------------
// sc-ac-truck-spray — „Водна пелена зад камиона" (FO-04 + FO-06 + AC-02) on
// mw-v1 (the 1000 m 2+2 motorway posted 140, REUSED in RAIN).
// ---------------------------------------------------------------------------

/** mw-v1 northbound CRUISE-lane center — laneId 1, the rightmost REQUIRED
 *  travel lane (meta.scenario.laneCruiseX; the L7 copy truth, asserted against
 *  the map by the trace gate). The emergency lane is x = 8.13, the overtaking
 *  lane x = −8.12; both stay empty for the whole drill. */
const MW_X_CRUISE = 0;

/**
 * THE STAGED SPRAY RIG — the truck whose pelena is the lesson.
 *
 * WHY cutInLeadCar AND NOT brakingLeadCar (read before "fixing" this — the
 * backlog asked for brakingLeadCar and the engine cannot honour it HERE):
 * BrakingLeadCarRunner.stage() (orchestrator/runners.ts) does NOT forward
 * `actor.extraRightOffsetM` to traffic.stage(), while CutInLeadCarRunner.stage()
 * does. On every 1+1 district the omission is invisible — the traffic graph's
 * lane for a BIDIRECTIONAL edge already sits on the player's own lane center
 * (x = 4.06), which is why every shipped brakingLeadCar authors
 * `extraRightOffsetM: 0`. mw-v1 is the first ONEWAY multi-lane carriageway to
 * host a lead: graph.laneOffsetFor(oneway) = ((lanes−1)/2) × laneWidth =
 * +8.125, so the graph lane lands on the EMERGENCY lane (x = 8.13) — 8.13 m
 * from the player, twice the 4.0 m LEAD_CORRIDOR_M. A brakingLeadCar here is
 * literally ungradeable: tick.leadGapM stays Infinity for the whole kilometre
 * and the FO-04 detector can never arm (verified by probe). cutInLeadCar
 * reaches the cruise lane via the offset it does forward, paces on the SAME
 * matchPlayer command, and renders the SAME `profile: "truck"` rig — the
 * grading channel (tick.leadGapM) is identical. Its CUT tier is authored out
 * of reach (cutAt 400 m past the road end + minCutSpeedKmh 250), exactly the
 * way sc-follow-rain-gap authors its slam tier out of reach: the actor is
 * deterministic moving traffic, not a cut-in drill. It emits no events and
 * resolves no outcome. See the file report for the one-line runners.ts diff
 * that would let this template say `brakingLeadCar` — NOT taken here because
 * templates-flow.ts' sc-lc-blindspot already ships a nonzero
 * extraRightOffsetM that the runner silently drops today, so the fix moves a
 * LIVE actor and invalidates that template's committed traces.
 *
 * THE PINNED GAP IS THE DESIGN (the FO-04 recipe, verbatim): the rig paces at
 * a fixed 64 m of centers (bumper gap ≈ 59.9 m — leadGapFor subtracts the
 * 4.1 m VEHICLE_LENGTH_M), so the ONLY variable the student changes is SPEED.
 * 59.9 m is a wet-prudent ~3.4 s at the shadow's 64 km/h and an imprudent
 * ~1.9 s at the mistake's 115 km/h, where the wet rule wants 2.88 s.
 * HONEST LIMIT (the sc-follow-truck precedent): matchPlayer slaves the rig to
 * the player, so in the 115 km/h demo the truck also runs 115 — a rig that
 * fast in a downpour is not a claim about real trucks, it is the price of
 * pinning the gap so the lesson isolates one variable.
 */
const ACTS_SPRAY_TRUCK: CutInLeadCarSpec = {
  id: "sc-acts-truck",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["mw-n-nb-start", "mw-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: 79 }, // dormant ~64 m ahead of the spawn — the pinned gap, no lurch
    cruiseSpeedMps: 18,
    extraRightOffsetM: -8.125, // one drawn lane LEFT of the graph lane → the CRUISE lane (x = 0)
    colorIndex: 2,
    profile: "truck", // FO-06: the box-truck rig — the thing throwing the pelena
  },
  paceAheadM: 64, // ~64 m of centers (bumper ≈ 59.9) — ~3.4 s at 64 km/h, ~1.9 s at 115
  maxMatchSpeedMps: 33, // 118.8 km/h — holds the gap at the mistake's 115
  cutAt: { x: MW_X_CRUISE, y: 1400 }, // 400 m PAST the 1000 m road — the cut tier is out of reach…
  cutRadiusM: 2,
  minCutSpeedKmh: 250, // …and double-locked: no player speed can fire it
  cutShiftM: 0,
  cutRampSec: 1.5,
  cutSpeedMps: 18,
  clearAheadM: 45,
};

/**
 * FO-04 („дистанция в дъжд" — whose doc-72 entry names „following spray-blind"
 * as the mistake) × FO-06 („зад камион": the gap must buy the vision the rig
 * took) × AC-02 („дъжд без светлини"), fused on the ONE map where the arithmetic
 * bites: ЗДвП чл. 20, ал. 2 (скоростта се съобразява с атмосферните условия и
 * видимостта) + чл. 23 (дистанция, съобразена с условията).
 *
 * WHY mw-v1 AND NOT the fo-follow-v1 city street (the distinctness that earns
 * this template its slot):
 *  - sc-follow-rain-gap teaches the SAME detector at 25 vs 40 km/h inside a
 *    50-zone. Here the posted limit is 140: the wet envelope (0.85 × 140 =
 *    119 km/h) sits ABOVE every speed this drill uses, so the conditions code
 *    can never fire and the ONLY thing on trial is the GAP. The mistake runs
 *    115 km/h — lawful on the sign, lawful for the rain envelope, and still
 *    convicted. „Спазвах ограничението" is measurably not a defence, and that
 *    is a claim only a motorway can make.
 *  - sc-follow-truck (FO-06) is the same rig on a DRY 50-zone; sc-ac-rain-lights
 *    (AC-02) is the same lamp duty on a city street. Neither meets the other:
 *    the spray is where the vision block and the wet gap become one fault.
 *  - mw-v1 carries no zones, no crossings, no junctions and no signals, so
 *    nothing but the gap, the speed and the lamps is gradable. The drives never
 *    leave laneId 1 (the rightmost REQUIRED lane under the emergencyLaneRight
 *    seam), so NOT_KEEPING_RIGHT never arms; every speed stays ≥ 50, so
 *    DRIVING_TOO_SLOW_FOR_MOTORWAY never arms either.
 *
 * THE TWO DIALS ARE AUTHORED, NOT ASSUMED:
 *  - `ruleConfig.followRainAwareEnabled` — the FO-04 detector ships OFF
 *    (rules/types.ts: the exam bot never widens its time-gap in rain, so a
 *    default-on grade would flag its innocent rainy drives). The recorder
 *    passes the SAME override, so the trace gate and the student path grade
 *    identically. Template-wide: rain IS this template's whole condition.
 *  - `physics.wetGrip` — template-wide (the sc-ac-wet-braking precedent, ADR-006
 *    stage 4a): the LIVE student's car runs at WET_GRIP_FACTOR. The recorded
 *    ghosts are KINEMATIC, so their stop ramps are authored at WET_DECEL
 *    (SCRIPT_DECEL × WET_GRIP_FACTOR) — the ghost never demonstrates a dry stop
 *    the student's wet car cannot reproduce (the dual-channel honesty contract).
 */
export const SC_AC_TRUCK_SPRAY: ScenarioSpec = {
  id: "sc-ac-truck-spray",
  family: "conditions",
  tagsBg: ["условия", "дъжд", "магистрала", "камион", "водна пелена", "дистанция", "видимост"],
  titleBg: "Водна пелена зад камиона",
  objectiveBg:
    "В дъжд на магистрала камионът пред теб вдига пелена, която изтрива видимостта: увеличи дистанцията към 3+ секунди и пусни светлините, преди да изпреварваш каквото и да е.",
  archetypeIds: ["FO-04", "FO-06", "AC-02"],
  conceptIds: [
    "c-following-distance",
    "c-rain-aquaplaning",
    "c-stopping-distance-total",
    "c-speed-adaptation",
    "c-safety-space",
  ],
  map: {
    archetype: "motorway-segment",
    // Reuses the committed mw-v1 map (1000 m divided 2+2 АМ, posted 140, an
    // emergencyLane span per carriageway, NO junctions/crossings/signals) —
    // its meta.scenario.params, mirrored here for provenance.
    params: { lengthM: 1000, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Магистрала, ограничение 140 — но вали силно и пред теб в дясната лента се движи камион. Включи късите светлини още преди да потеглиш.",
    },
    {
      n: 2,
      textBg:
        "Гумите на камиона изхвърлят водата нагоре: зад него стои пелена от пръски, в която не се вижда нищо — нито стоповете му, нито какво става пред него.",
    },
    {
      n: 3,
      textBg:
        "Затова дистанцията расте двойно: за дъжда (мокрият спирачен път е около 1,5 пъти по-дълъг) и за пелената (тя ти отне погледа напред). Целта е 3 и повече секунди.",
    },
    {
      n: 4,
      textBg:
        "Установи се на около 65 км/ч зад камиона. Да, 140 е разрешено — знакът е таван за сухо и чисто, а тук нито едното е вярно (чл. 20, ал. 2).",
    },
    {
      n: 5,
      textBg:
        "Не се доближавай, „за да виждаш“: колкото по-близо си до пелената, толкова по-малко виждаш. Видимостта зад камион се купува само с дистанция — задръж я до края на отсечката.",
    },
  ],
  success: [
    {
      id: "sc-acts-gap",
      titleBg: "Мини пелената със съобразена скорост и дистанция",
      // Cap 80 is the gate that separates the two stories. The pinned 59.9 m
      // gap is worth 2.7 s at 80 km/h — still inside the wet-prudent band — so
      // the shadow's 64 km/h clears it with room, while the „законните" 115
      // simply cannot be here slowly enough. The gap discipline is graded by
      // the FO-04 detector; THIS gate grades the speed that makes it possible.
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 450, radiusM: 12, maxSpeedKmh: 80 },
    },
    {
      id: "sc-acts-finish",
      titleBg: "Стигни края на отсечката, без да си влизал в пелената",
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 860, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcTruckSpray.ts; gates in traces/__tests__/
  // sc-ac-truck-spray-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-truck-spray/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-truck-spray/mistake-dry-gap.trace.json" },
      titleBg: "Суха дистанция в мокрото",
      whatWentWrongBg:
        "Колата държеше 115 км/ч на около 60 метра зад камиона — „нали съм под 140“. Само че 60 метра при 115 км/ч са 1,9 секунди, а на мокро правилото иска 3 и повече: спирачният път е с около половина по-дълъг, а пелената пред очите ти е скрила самите стопове, по които би реагирал. Скоростта беше в ограничението и въпреки това несъобразена — ограничението е таван за сухо и чисто (чл. 20, ал. 2), а дистанцията се брои в секунди, не в метри (чл. 23).",
      codeRefs: ["FOLLOWING_TOO_CLOSE_FOR_RAIN"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-truck-spray/mistake-lights-off.trace.json" },
      titleBg: "Дъжд без светлини",
      whatWentWrongBg:
        "Дистанцията беше примерна, но колата мина целия участък без светлини. В пелената зад камион това е най-лошото място да си невидим: пръските разсейват дневната светлина, а мокрото платно поглъща силуета — колата зад теб те открива в мига, в който вече те настига. Тръгнат ли чистачките, светват и късите: светлините в дъжд не са за да виждаш, а за да те виждат (чл. 70).",
      codeRefs: ["HEADLIGHTS_OFF_IN_RAIN"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато вали и пред теб има камион, автобус или бус — най-често на магистрала и по извънградските пътища, където скоростите са високи. Разпознава се мигновено: облакът пръски зад задните гуми и чистачките ти на максимум.",
    whyBg:
      "Зад камион в дъжд губиш два от инструментите си наведнъж. Пелената изтрива погледа напред — не виждаш нито стоповете на камиона, нито причината, заради която ще ги натисне. А мокрото платно удължава спирачния ти път с около половина. Двете се събират точно там, където хората правят обратното: доближават се, „за да виждат по-добре“, и така влизат още по-навътре в пръските. Затова 2-секундното правило става 3 и повече, а на пелена — и повече от три. И понеже пръските разсейват светлината, късите фарове вървят задължително: не за да виждаш ти, а за да те вижда онзи зад теб (чл. 70). Ограничението от 140 не е обещание — то е таван за сух и чист път; чл. 20, ал. 2 връзва скоростта с условията и видимостта, а зад пелената видимост просто няма.",
    lawRef: "ЗДвП чл. 20, ал. 2; чл. 23",
    examinerBg:
      "Изпитващият следи дали дъждът променя нещо в караното ти: очаква осезаемо по-ниска скорост и видимо по-голяма дистанция зад високо превозно средство, без да чака подкана. Несъобразената дистанция е основна грешка, движението в дъжд без светлини — второстепенна, а изпреварване „на сляпо“ през пелената прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — пороят пада върху нощта. RENDER/conditions axis only: the rung
    // spreads OVER the template's conditions (compileScenario), so weather
    // stays "rain" and night is added. The night factor ships at 1 and the
    // engine composes conditions by MIN, so the envelope stays 0.85 × 140 =
    // 119 and NOTHING re-tunes — the rung adds visibility pressure, not a new
    // grade. `physics` is template-wide (rain IS the template), so this rung
    // inherits wetGrip like every other.
    { level: 5, conditions: { night: true } },
  ],
  staged: [ACTS_SPRAY_TRUCK],
  conditions: { weather: "rain" },
  // The FO-04 detector ships OFF (rules/types.ts) — this drill opts it in so the
  // LIVE student who keeps a dry-habit gap in the spray grades exactly what the
  // shadow demonstrates. The recorder passes the same override.
  ruleConfig: { followRainAwareEnabled: true },
  // ADR-006 stage 4a: the student's car runs the wet grip factor. The ghosts are
  // kinematic, so their stop ramps are authored at WET_DECEL (traces/
  // scAcTruckSpray.ts) — the pinned-envelope rule, honoured on both channels.
  physics: { wetGrip: true },
  localeBg: "bg-BG",
};

/** The wave-2 adverse-conditions templates, in catalog order (registered in
 *  templates.ts by the integration pass). */
export const SCENARIO_TEMPLATES_CONDITIONS2: readonly ScenarioSpec[] = [
  SC_AC_NIGHT_OVERDRIVE,
  SC_AC_TRUCK_SPRAY,
];
