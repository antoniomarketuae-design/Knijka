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
 *  - sc-ac-bridge-ice       „Мостът замръзва пръв" (AC-08 ANTICIPATION, on the
 *                           NEW ac-bridge-v1 — the wave-7 addition)
 *
 * Family: "conditions" — the existing catalog chip (doc 76 §2).
 */

/**
 * THE BRIEFING BUDGET — 2026-08-16. Every `instructionsBg` step in this file
 * was rewritten so that THE ACT IS THE FIRST WORD and no step exceeds 95
 * characters. The measurement that forced it, the per-character fold table it
 * is derived from and the one thing this lane could not fix are written out in
 * full at the top of `templates-flow.ts`; read that block before lengthening
 * anything here.
 *
 * This file's share of the defect, counted before the rewrite: 20 authored
 * steps, 20 of them past the 95-character band the compact card was sized
 * against, longest 287 characters (sc-ac-wind-truck-pass step 1, 287 ch). On the
 * deployed build a step-1 past ~96 characters leaves ZERO characters of the
 * rest of the briefing above the fold — measured on an iPhone 16 in both
 * orientations, not inferred.
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
    // Step 2 buried „потегли и се стабилизирай около 50 км/ч“ behind two
    // sentences about what the sign means. Same tier-feasibility caution as
    // sc-ac-fog: the order keeps a step of its own so it stays one identifiable
    // row for the imperative sweep.
    // 66 ch
    // THE LAMPS THE BRIEFING DENIED (sweep161, sc-ac-night-overdrive/pc-right/
    // 04-t130s.png: a row of posts down the left kerb, lit windows both sides).
    // The line read „нощ е и по този път няма нито една лампа" — and the
    // district is what puts them there: ov-oncoming-v1's only edge is
    // `class: "tertiary"`, which is a member of ARTERIAL_CLASSES
    // (world/builders/constants.ts), and props.ts builds streetlights and
    // street trees from exactly that set. The template could not have denied
    // them without changing the map's road class, which is not this file.
    //
    // Nothing about the LESSON needs the denial. „Отвъд снопа пътят е черен" is
    // the real AC-01 premise, it is true with lamps or without, and it keeps
    // the graded act (чл. 70 dipped beams → HEADLIGHTS_OFF_AT_NIGHT) first.
    { n: 1, textBg: "Включи късите светлини — нощ е и отвъд снопа им пътят е черен." },
    // 40 ch
    { n: 2, textBg: "Потегли и се стабилизирай около 50 км/ч." },
    // 63 ch
    { n: 3, textBg: "Помни: късите осветяват около 40 метра напред и нищо отвъд тях." },
    // 73 ch
    { n: 4, textBg: "Знай: знакът дава 90, но той е таван за ДЕНЯ — нощем таванът ти е снопът." },
    // 81 ch
    { n: 5, textBg: "Сметни: от 90 спираш за над 70 метра, а виждаш 40 — над ~60 изпреварваш фаровете." },
    // 55 ch
    { n: 6, textBg: "Гледай до края на осветеното, не в асфалта пред капака." },
    // 73 ch
    { n: 7, textBg: "Очаквай необозначено препятствие — ще го видиш едва когато влезе в снопа." },
    // 53 ch
    { n: 8, textBg: "Спри плавно и докрай на маркираната позиция зад него." },
    // 57 ch
    { n: 9, textBg: "Помни: при 50 км/ч 40-те метра ти стигат с метри в аванс." },
  ],
  success: [
    {
      id: "sc-acno-adapted",
      titleBg: "Мини неосветения участък със съобразена за видимостта скорост",
      // THE GATE CREDITED THE OFFENCE THE LESSON IS ABOUT (doc 87 B58, the
      // founder's own words: „a student who obeys the number the world shows
      // him commits the mistake the world is grading").
      //
      // The cap was 58, chosen to sit just under the night envelope
      // (0.65 × 90 = 58.5). But an authored cap is not what the student is
      // shown: `RouteGuidance` prints the COMPILED cap on the gate bar across
      // the lane, and the L1 ladder adds SPEED_CAP_GRACE_KMH_PER_TOLERANCE ×
      // 0.5 = 5 (params.ts) — bounded only by the posted limit, which here is
      // 90. Measured through compileScenario, this gate's cap by rung was
      //   L1 63 · L2 60.5 · L3–L5 58
      // against a briefing that ORDERS «стабилизирай около 50 км/ч» (step 2)
      // and whose step 5 is literally «над ~60 изпреварваш фаровете». So at
      // Ниво 1 — the beginner rung — the bar in the world read 63: above the
      // lesson's own taught threshold AND above the 58.5 envelope the rule
      // engine bills SPEED_TOO_FAST_FOR_CONDITIONS from. The objective handed
      // out a tick at a speed the detector was convicting in the same second.
      //
      // Authoring the cap at the number the briefing orders puts every rung
      // inside both:  L1 55 · L2 52.5 · L3–L5 50 — under 58.5 and under ~60
      // everywhere, with the ladder's standing 5 km/h of beginner forgiveness
      // (the same absolute slack `speedingGraceMaxKmh` gives every driver)
      // intact. The shadow rides ~50 and still passes at all five rungs; that
      // is asserted, not assumed — a tightened gate that failed the lesson's
      // own model line would be the founder's roundabout complaint again.
      params: { kind: "reachZone", x: LANE_X, y: 250, radiusM: 12, maxSpeedKmh: 50 },
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
    // doc 87 B67: mw-v1 grew 1000 -> 2600 m per carriageway (the posted 140 was
    // unreachable inside 1000 m). This object MIRRORS the generator recipe and is
    // asserted equal to the shipped meta.scenario.params, so it moves with it.
    params: { lengthM: 2600, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Every step here was 133-173 characters — the worst average in this file.
    // „Установи се на около 65 км/ч“ is kept as a bare, separate step for the
    // tier-feasibility reason recorded on sc-ac-fog.
    // 54 ch
    { n: 1, textBg: "Включи късите светлини преди да потеглиш — вали силно." },
    // 72 ch
    { n: 2, textBg: "Виж камиона пред теб в дясната лента — магистралата е с ограничение 140." },
    // 66 ch
    { n: 3, textBg: "Знай: гумите му вдигат пелена от пръски, в която не се вижда нищо." },
    // 66 ch
    { n: 4, textBg: "Не разчитай да видиш в нея нито стоповете му, нито пътя пред него." },
    // 66 ch
    { n: 5, textBg: "Дръж 3 и повече секунди до камиона — дистанцията тук расте двойно." },
    // 69 ch
    { n: 6, textBg: "Брой я двойно: за дъжда (~1,5 пъти по-дълъг път) и за отнетия поглед." },
    // 41 ch
    { n: 7, textBg: "Установи се на около 65 км/ч зад камиона." },
    // 78 ch
    { n: 8, textBg: "Помни: 140 е таван за сухо и чисто, а тук нито едното е вярно (чл. 20, ал. 2)." },
    // 79 ch
    { n: 9, textBg: "Не се доближавай „за да виждаш“ — колкото по-близо си, толкова по-малко виждаш." },
    // 71 ch
    { n: 10, textBg: "Задръж дистанцията до края: видимостта зад камион се купува само с нея." },
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

// ---------------------------------------------------------------------------
// sc-ac-bridge-ice — „Мостът замръзва пръв" (AC-08, the ANTICIPATION arm) on
// the NEW ac-bridge-v1 (520 m urban 50 street, icePatch deck [250, 340]).
// ---------------------------------------------------------------------------

/** Right-lane (northbound) center of ac-bridge-v1 (1+1 street) — the by-value
 *  pin; the trace gate asserts the copy against meta.scenario.laneCenterRightM. */
const BRIDGE_LANE_X = 4.06;
/** The deck = the icePatch span (ac-bridge-v1 zones[0]; battery-pinned). */
const DECK_FROM_M = 250;
const DECK_TO_M = 340;

/**
 * AC-08 — „Лед по моста", the ANTICIPATION arm: ЗДвП чл. 20, ал. 2 (скоростта
 * се съобразява със СЪСТОЯНИЕТО на пътя, не с изгледа му).
 *
 * WHY A SECOND ICE TEMPLATE (the distinctness that earns this slot — read
 * before merging it into sc-ac-ice):
 *  - sc-ac-ice grades ICE RESPONSE: you are on the span, a stalled car is in
 *    front of you, and the skill is the feather-light stop. Its whole graded
 *    contract is a crawl gate + a stop mark. It answers „какво правя ВЪРХУ
 *    леда".
 *  - This template answers the question that comes FIRST and kills more
 *    people: „КЪДЕ ще има лед и кога вдигам крака". Nothing is in the way. The
 *    road is dry, the sky is clear, the sign is a warning triangle and not a
 *    limit, and the ONLY thing that separates a pass from a slide is whether
 *    the driver read the bridge from 200 m and lifted off on the dry asphalt.
 *    The graded contract is therefore three gates in a row — slow BEFORE the
 *    near abutment, still slow AT the far one, and only then the throttle —
 *    and NOT a stop.
 *  - The map carries the difference (see gen_ac_bridge.mjs): ac-ice-v1's
 *    „bridge" is a word in a lesson card; ac-bridge-v1's deck is a 90 m span
 *    with 170 m of authored void around it and the А15 post standing on the
 *    near abutment — the cues the anticipation is supposed to be built from
 *    actually exist in the world.
 *
 * THE ENGINE SEES AN ORDINARY 50-STREET, AND THAT IS THE ARCHITECTURE (read
 * before "fixing" the mistake codeRefs — the backlog asked for
 * SPEED_TOO_FAST_FOR_CONDITIONS + HARSH_BRAKING_NO_CAUSE and the engine cannot
 * honour either HERE; see the file report):
 *  - SPEED_TOO_FAST_FOR_CONDITIONS is armed EXCLUSIVELY by tick.rain / fog /
 *    snow / isNight (engine.ts: conditionFactor = MIN of the four, and a factor
 *    of 1 disarms it). This drill is a CLEAR DRY MORNING on purpose — the
 *    invisible ice under a blue sky IS the doc-72 surprise, and a weather tag
 *    would delete it. So the conditions code is structurally unreachable here,
 *    and the demo bills what actually happens instead: the tail steps out
 *    (POOR_LANE_KEEPING). The honest hook would be per-segment SURFACE-aware
 *    prudence — the rules/types.ts night-factor note anticipates exactly that
 *    shape („a per-segment world signal, not a blanket factor"). NOT authored
 *    as a ruleConfig night factor the way sc-ac-night-overdrive does it: that
 *    template's own header explains why a 50-zone cannot carry one („on a
 *    50-zone the limit already fits inside the beam… „не изпреварвай фаровете"
 *    would be a fabricated rule"), and this is a 50-zone in the morning.
 *  - HARSH_BRAKING_NO_CAUSE needs accel ≤ −7 m/s² (harshBrakeDecelMps2). On
 *    0.15 grip the car cannot produce a THIRD of that. „Спирачка върху леда" is
 *    physically incapable of being harsh — that IS the lesson the demo teaches,
 *    so the code's absence is the honest outcome, not a gap. sc-ac-ice's gate
 *    asserts the same thing in the negative („0.69 m/s² is anything but harsh").
 *
 * Like sc-ac-ice / sc-ac-aquaplane, the bridge PARAPETS are RECORDER obstacle
 * rects (trace channel), not live props: the live student's graded skill is the
 * three-gate anticipation, and the consequence of getting it wrong — the wall
 * that is always exactly there on a bridge and nowhere else — is demonstrated
 * by the red ghosts.
 */
export const SC_AC_BRIDGE_ICE: ScenarioSpec = {
  id: "sc-ac-bridge-ice",
  family: "conditions",
  tagsBg: ["условия", "лед", "зимни условия", "мостове", "съобразена скорост", "предвиждане"],
  titleBg: "Мостът замръзва пръв",
  // THE BRIDGE THAT IS NOT THERE (sweep161, sc-ac-bridge-ice/pc-right/
  // 04-t152s.png, 04-t076s.png, 04-t027s.png — every sampled frame of the
  // CORRECT drive). The copy used to point at it: „сградите свършват и пътят
  // тръгва над дерето", „знака А15 на устоя", and both graded gates were TITLED
  // against abutments — «ПРЕДИ близкия устой», «Стигни отсрещния устой». The
  // buildings never end; the street runs between apartment blocks to the
  // horizon.
  //
  // MEASURED, not assumed: ac-bridge-v1 carries ONE zone —
  // { kind: "icePatch", fromM: 250, toM: 340, signRef: "А15",
  //   patchGripFactor: 0.15 } — and nothing else. There is no deck, no ravine
  // and no abutment anywhere in the document, and `DistrictZoneKind`
  // (world/types.ts) has no member that could carry one, so no map in the
  // catalogue could have made those four sentences true. The same shape as the
  // мантинела struck out of sc-mw-discipline (__tests__/sp-world-claims.test.ts).
  //
  // WHAT IS REAL, AND IS NOW WHAT THE LESSON POINTS AT. The ice is physically
  // real (grip 0.15 over 90 m) and INVISIBLE by design — waterDecals.ts renders
  // nothing for an icePatch, „black ice you cannot see IS the lesson". And the
  // А15 „Опасност от хлъзгане" post IS built, 60 m ahead of the span
  // (zoneSigns.ts ZONE_SIGN_KIND.icePatch → "slippery", HAZARD_WARNING_AHEAD_M
  // = 60). So the only cue this world gives is the SIGN, and reading the sign
  // rather than the scenery is a strictly better version of the same skill —
  // the AC-08 „антиципация" arm is anticipation from a warning, not from a
  // silhouette. The bridge doctrine itself is untouched: it stays in `teach`,
  // where it is a statement about the RULE and true on every map.
  //
  // The claim gate is __tests__/lane-world-claims.test.ts §1/§3.
  objectiveBg:
    "При температури около нулата настилката заледява там, където няма топла земя отдолу: вдигни крака от газта ОЩЕ преди знака А15, мини цялата хлъзгава отсечка с равна скорост и прав волан, и дай газ чак когато е зад теб.",
  archetypeIds: ["AC-08"],
  conceptIds: [
    "c-winter-ice",
    "c-hazard-perception",
    "c-speed-adaptation",
    "c-braking-distance",
    "c-general-care-duty",
  ],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ac-bridge-v1.json meta.scenario.params
    // (tools/maps/gen_ac_bridge.mjs).
    params: { lengthM: 520, maxspeedKmh: 50 },
    districtId: "ac-bridge-v1",
  },
  start: {
    spawnPointId: "ac-bridge-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // 260-character step 1, whose act was „включи първо късите светлини“ in the
    // middle of a paragraph about black ice. The template's own environment sets
    // the dark rung, so the lamp step stays near the front (L10).
    // 75 ch
    { n: 1, textBg: "Потегли внимателно — зимна сутрин е около нулата, а улицата е суха и черна." },
    // 74 ch
    { n: 2, textBg: "Включи късите светлини по тъмно (чл. 70): черният лед блести само осветен." },
    // 75 ch
    // Was „Погледни напред: сградите свършват и пътят тръгва над дерето — това
    // е мост." The buildings never end (frame 04-t152s). What the world DOES
    // show is a dry black surface all the way out — which is what black ice
    // looks like, and is therefore the honest version of the same warning.
    { n: 3, textBg: "Гледай платното напред: сухо и черно докрай — точно така изглежда ледът." },
    // 75 ch
    // The RULE, not this street — „мост, надлез, сянка" is doctrine and stays
    // true on every map, the same reason sp-world-claims.test.ts exempts
    // `teach.*`. Only the DEICTIC form („ето мост", „отсрещния устой") claims
    // geometry, and only that form is gated.
    { n: 4, textBg: "Знай: където няма топла земя отдолу — мост, надлез, сянка — заледява пръв." },
    // 72 ch
    // Was „…на устоя". The А15 post IS built — zoneSigns.ts maps icePatch →
    // "slippery" and stands it HAZARD_WARNING_AHEAD_M = 60 m before the first
    // icy metre. The abutment it was hung on never existed.
    { n: 5, textBg: "Прочети знака А15 „Опасност от хлъзгане“ — тук той не е украса, а заглавие." },
    // 65 ch
    // Was „…преди близкия устой". The 60 m between the А15 post and metre 250
    // is the room the gate below asks the student to spend slowing down — and
    // it is the one landmark this world actually gives him.
    { n: 6, textBg: "Смъкни до около 25 км/ч ОЩЕ на сухия асфалт, докато знакът е пред теб." },
    // 65 ch
    { n: 7, textBg: "Мини целия мост с равна газ и прав волан, без нито една корекция." },
    // 80 ch
    { n: 8, textBg: "Помни: върху леда сцеплението е ~15% от сухото — спирачка и волан почти липсват." },
    // 66 ch
    { n: 9, textBg: "Не бързай да даваш газ — ускорението е също толкова рязка команда." },
    // 66 ch
    // Was „Чакай отсрещния устой: там свършва ледът и чак там свършва мостът."
    // The span is 90 m long (250→340) and its end is not marked by anything the
    // student can see — which is the point, and is now what the line says.
    { n: 10, textBg: "Брой метрите: хлъзгавото е около 90 и краят му не е обозначен с нищо." },
  ],
  success: [
    {
      id: "sc-acbi-before",
      // Was «…ПРЕДИ близкия устой». The gate anchor is y = 235 — 15 m before
      // the icePatch's first metre (250) and 45 m PAST the А15 post (190). It
      // never measured an abutment; it measured „slow on the dry, before the
      // ice", and it now says so. A banner may refuse only for something it
      // named (the Round-5 lamp-banner law, __tests__/conditions-lamp-gates).
      titleBg: "Вдигни крака от газта ПРЕДИ хлъзгавата отсечка",
      // THE WHOLE TEMPLATE, in one gate. Cap 30 must be met 15 m BEFORE the
      // deck starts (250), i.e. on dry asphalt — the only surface where slowing
      // down still works. A driver who plans to brake „on the bridge" fails
      // here before the physics ever gets a chance to teach him.
      params: { kind: "reachZone", x: BRIDGE_LANE_X, y: 235, radiusM: 10, maxSpeedKmh: 30 },
    },
    {
      id: "sc-acbi-deck",
      // Was «Стигни отсрещния устой все още бавно — без газ по моста». Anchor
      // y = 335, radius 5, wholly inside the ice span [330, 340].
      titleBg: "Стигни края на хлъзгавото все още бавно — без газ по него",
      // The anti-cheat on gate 1: cap 30 again at the FAR abutment (340). You
      // cannot satisfy both by dipping under 30 for one tick and flooring it —
      // the 90 m between them must be driven at the crawl, which is exactly the
      // „равна газ, прав волан" the ice demands. radiusM 5 keeps the zone WHOLLY
      // on the deck ([330, 340]): a gate that spilled past the abutment could be
      // met on dry asphalt, which is the one thing it must never accept.
      params: { kind: "reachZone", x: BRIDGE_LANE_X, y: 335, radiusM: 5, maxSpeedKmh: 30 },
    },
    {
      id: "sc-acbi-past",
      // Was «Ускори чак на сухото, след съоръжението». Anchor y = 440 — 100 m
      // past the last icy metre, on the surface the district really has.
      titleBg: "Ускори чак на сухото, след хлъзгавия участък",
      // No cap: past the far abutment the dry street is back and normal speed
      // is not just allowed, it is correct. The gate exists to prove the drill
      // ends on the far side — the bridge is crossed, not stopped on.
      params: { kind: "reachZone", x: BRIDGE_LANE_X, y: 440, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 85 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcBridgeIce.ts; gates in traces/__tests__/
  // sc-ac-bridge-ice-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-bridge-ice/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-bridge-ice/mistake-road-speed.trace.json" },
      titleBg: "Мостът с пътна скорост — задницата тръгва",
      whatWentWrongBg:
        "Колата влезе в хлъзгавия участък с разрешените 50 — „нали е в ограничението, пътят е сух“. Само че сухо беше зад теб, не под теб: на първите метри лед задницата тръгна настрани и колата се понесе към банкета, олюлявайки се през половината платно. Никой не я е карал в тези секунди — воланът върху 15% сцепление не води, а моли. Ограничението е таван за платно в добро състояние; чл. 20, ал. 2 връзва скоростта със СЪСТОЯНИЕТО на пътя, а в мразовита сутрин състоянието е лед, докато не се докаже обратното. Решението е взето 200 метра по-рано или изобщо не е взето.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-bridge-ice/mistake-brake-on-deck.trace.json" },
      titleBg: "Спирачка ВЪРХУ леда",
      whatWentWrongBg:
        "Този водач поне разбра, че отсечката е лед — но разбра го със закъснение от 90 метра и натисна спирачката ВЪРХУ самия лед. При 15% сцепление педалът не спира колата, а само ѝ отнема посоката: за 40 метра с натисната докрай спирачка скоростта падна от 50 на 42 км/ч — на сух асфалт същата спирачка щеше да е спряла колата в 24 метра. Вместо това колата се понесе по инерцията си и намери единственото нещо, което на такъв път е винаги там — банкета. Забележи какво НЕ се случи: няма рязко спиране, защото рязко спиране на лед е физически невъзможно. Точно затова намаляването не е реакция, а предвиждане — то се прави преди леда, на чист асфалт (чл. 20, ал. 2).",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Във всяка сутрин около нулата — и винаги на откритите съоръжения: мостове, надлези, естакади, крайречни участъци, сенките на сгради и дървета. Мостът е първият, защото под платното му няма топла земя, а студеният въздух го брули отгоре И отдолу: той може да е заледен, докато улицата преди и след него е суха и черна. Разпознава се по геометрия, не по цвят — сградите свършват, пътят тръгва над празното, парапет от двете страни. Видиш ли това при термометър около нулата, кракът се вдига от газта ОЩЕ ТАМ.",
    whyBg:
      "Ледът оставя на гумите около 10–20% от сухото сцепление — спирачният път от 40 км/ч става колкото сухият от 100, а завъртеният волан не завива, а отключва занасяне. Най-коварното е, че той не се вижда: асфалтът на моста лъщи под същото синьо небе като сухата улица зад него. Затова на мост няма реакция — има само предвиждане. Всяка команда, която би те спасила (спирачка, волан, дори газ), изисква сцепление, а точно него ледът ти е взел: единственият момент, в който още имаш сцепление и избор, е ДОКАТО СИ НА СУХОТО. Оттам нататък мостът не ти оставя нищо — нито място да завиеш, нито банкет да избягаш, само парапет отляво и отдясно и дере отдолу. Законът казва същото с две думи: скоростта се съобразява със състоянието на пътното покритие (чл. 20, ал. 2) — а състоянието на моста в мразовита сутрин е лед, докато не се докаже обратното.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият следи дали изобщо си видял моста: очаква осезаемо вдигане на газта ПРЕДИ съоръжението, без подкана и без знак, който да го изисква — знакът А15 предупреждава, не задължава. Равномерното преминаване с прав волан и липсата на ускорение до отсрещния устой се четат като зимно четене на пътя; всяка рязка команда върху съоръжението е грешка в преценката, а плъзгането в парапета прекратява изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — НОЩЕН МРАЗ: RENDER/conditions axis only (compileScenario spreads the
    // rung OVER the template's conditions, so weather stays "dry" and night is
    // added). NOTHING re-tunes: conditionSpeedNightFactor ships at 1
    // (rules/types.ts — the lit-urban-Sofia A12 FP case), so the envelope is
    // unchanged and no drive changes by a tick. What the rung actually adds is
    // the real thing: in the dark the geometry cue this whole template is built
    // on — the buildings ending, the void, the parapets — is much harder to
    // read, so the anticipation has to come from the thermometer and the А15
    // post instead of the skyline. NO `physics`: the deck's icePatch already
    // does the grip locally, and a template-wide flag would ice the approach —
    // deleting the dry/icy contrast that IS the lesson.
    { level: 5, conditions: { night: true } },
  ],
  // A COLD CLEAR MORNING: day, dry, no weather render — the ice is the map's own
  // data (the deck's icePatch span), never a weather tag. Consequence, stated
  // plainly: the rule engine sees an ordinary dry 50-street and arms NO
  // conditions envelope (see the header) — the ice speaks only through physics.
  conditions: { weather: "dry" },
  // NO ruleConfig: every code this drill grades is shipped default-on.
  // NO physics: base grip stays 1 and ONLY the deck span reduces it — the
  // sc-ac-ice precedent (the pure map-data grip contract).
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-ac-wind-truck-pass — „Страничен вятър след камиона" (AC-12 crosswind, the
// OVERTAKING beat) on mw-v1 (the 1000 m 2+2 motorway, REUSED, DAY DRY + WIND).
// ---------------------------------------------------------------------------

/** mw-v1 northbound OVERTAKING-lane center — laneId 2 (meta.scenario.laneLeftX;
 *  the L7 copy truth, asserted against the map by the trace gate). The cruise
 *  lane (laneId 1) is x = 0 (MW_X_CRUISE, above), the emergency lane x = 8.13. */
const MW_X_OVERTAKE = -8.12;

/**
 * THE STAGED TRUCK — the rig whose lee (завет) is the whole lesson.
 *
 * WHY cutInLeadCar (the sc-ac-truck-spray precedent, verbatim rationale): on a
 * ONEWAY multi-lane carriageway the traffic graph's lane for the lead sits on
 * the EMERGENCY lane (x = 8.13 — graph.laneOffsetFor(oneway) = +8.125), so only
 * the runner that FORWARDS extraRightOffsetM to traffic.stage()
 * (CutInLeadCarRunner) can place a rig in the CRUISE lane (x = 0). Its CUT tier
 * is authored out of reach (cutAt 400 m past the road end + minCutSpeedKmh 250,
 * the sc-follow-rain-gap slam-out-of-reach pattern): the actor is deterministic
 * scenery — the truck the player overtakes — and executes NO cut. It emits no
 * SimTick events and resolves no outcome (the runner's collision arm only ever
 * arms AFTER a cut, which never fires here — verified by probe), so no drive can
 * grade from it.
 *
 * HONEST LIVE LIMIT (stated, not hidden — the sc-ac-crosswind dual-channel law):
 * cutInLeadCar has only a matchPlayer motion mode, so in the LIVE re-sim the rig
 * PACES the player and never physically falls behind — the overtake is not
 * completed in world space. The pass NARRATIVE (drawing level with the trailer,
 * the nose clearing the cab, the gust in the lee's edge) is carried by the
 * AUTHORED shadow polyline + the copy, exactly the way sc-ac-crosswind authors
 * the wind itself into the ghost (the recorder is kinematic — it never runs the
 * live crosswind force). A plain slow-cruiser lead actor (or a hold-only truck
 * slot) would make the live pass complete in world space — flagged for a
 * follow-up (see the file report): NOT taken here because it is new runner work
 * on a shared file, and the taught skill (hold the lane through the gust) is
 * fully LIVE regardless of the rig's relative position.
 *
 * paceAheadM 60: generous enough that the brief return to the cruise lane at the
 * end never re-approaches the rig inside the FOLLOWING band (56 m of bumper gap
 * ≈ 2.6 s at the ~78 km/h finish — over the 1.8 s dry threshold), so the ONLY
 * things this template grades are the wind-control channels.
 */
const ACTS_WIND_TRUCK: CutInLeadCarSpec = {
  id: "sc-acw-truck",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["mw-n-nb-start", "mw-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: 95 }, // dormant ~80 m ahead of the spawn, cruise lane
    cruiseSpeedMps: 17, // ~61 km/h — the slow truck the player overtakes
    extraRightOffsetM: -8.125, // one drawn lane LEFT of the graph lane → the CRUISE lane (x = 0)
    colorIndex: 2,
    profile: "truck", // FO-06 box-truck rig — the wall of the lee
  },
  paceAheadM: 60, // see the header — keeps the return FOLLOWING-innocent
  maxMatchSpeedMps: 33, // 118.8 km/h — never the constraint at this drill's speeds
  cutAt: { x: MW_X_CRUISE, y: 1400 }, // 400 m PAST the 1000 m road — the cut tier is out of reach…
  cutRadiusM: 2,
  minCutSpeedKmh: 250, // …and double-locked: no player speed can fire it
  cutShiftM: 0,
  cutRampSec: 1.5,
  cutSpeedMps: 17,
  clearAheadM: 45,
};

/**
 * AC-12 — страничен вятър при изпреварване на камион (ЗДвП чл. 20, ал. 2:
 * скоростта се съобразява с атмосферните условия — вятърът е изрично такова —
 * така че водачът да запази контрол над превозното средство). The OVERTAKING
 * beat of the wind archetype, distinct from live sc-ac-crosswind (the plain
 * open-segment gust): here the danger is the TRANSITION — the truck's lee
 * (завет) shelters you while you are alongside, and the gust hits the instant
 * your nose clears the cab.
 *
 * WHY mw-v1 AND NOT the fo-follow-v1 street sc-ac-crosswind uses:
 *  - The lesson needs a SLOW vehicle to overtake and a wide carriageway to do
 *    it on — a motorway is where „изпреварвам камион в силен вятър" actually
 *    lives (доц-72 AC-12's own „изпреварен камион" cue). The player pulls into
 *    the overtaking lane (laneId 2, x = −8.12), passes the rig in the cruise
 *    lane, and is struck by the gust at the cab line.
 *  - mw-v1 carries no zones, crossings, junctions or signals, so nothing but
 *    the wind-control channels is gradable. Every speed stays ≥ 50 km/h (the
 *    motorway floor) and well under 140, so no motorway-crawl and no speeding
 *    code can attach.
 *
 * THE GRADING IS ALL LANE DISCIPLINE, AND THAT IS THE ARCHITECTURE (read before
 * „fixing" the mistake codeRefs):
 *  - The carriageway is ONEWAY (oneway === true), so CENTER_LINE_TOUCHED is
 *    STRUCTURALLY unreachable (engine.ts centerLineCond requires oneway ===
 *    false — there is no oncoming half). Any sustained excursion, either bank,
 *    grades POOR_LANE_KEEPING (|laneOffsetM| > laneKeepMaxOffsetM = 3.25 m for
 *    laneKeepSustainSec) — the shipped detector, unchanged.
 *  - The overtake is a REAL lane change graded by the shipped machinery: the
 *    shadow signals + glances each way → SAFE_LANE_CHANGE (a commendation, not
 *    a violation); the LEFT indicator stays on across the pass, which EXEMPTS
 *    NOT_KEEPING_RIGHT (engine.ts keepRight indicator carve-out) while the car
 *    is in the overtaking lane.
 *  - The COLLISION mistake is the recorder's AUTHORED-consequence seam (a
 *    scripted `collision` step — the „пешеходец зад колата" pattern), the gust
 *    throwing the car against the trailer in the тясна пролука of the pass. It
 *    is a narrative beat at the current clock, never a geometric contact with
 *    the paced rig (which stays 8 m away in its own lane), so it bills EXACTLY
 *    COLLISION and nothing else.
 *
 * DUAL-CHANNEL HONESTY (the 4a law, wind edition — sc-ac-crosswind verbatim):
 * `physics.crosswind` runs the LIVE student's car under the westward force +
 * deterministic gust sine (CROSSWIND_BRIDGE_N ± CROSSWIND_GUST_*, the same
 * whole-map wind the crosswind template ships — a truck-phase-locked gust is
 * doc-65 Phase-4 work, stated). The recorded demos are KINEMATIC, so the
 * lee-then-gust story is AUTHORED into the polylines (traces/scAcWindTruckPass
 * .ts): the shadow's small held-and-released correction at the cab line, the
 * mistakes' excursion / clip.
 */
export const SC_AC_WIND_TRUCK_PASS: ScenarioSpec = {
  id: "sc-ac-wind-truck-pass",
  family: "conditions",
  tagsBg: ["условия", "страничен вятър", "пориви", "изпреварване", "камион", "контрол на волана"],
  titleBg: "Страничен вятър след камиона",
  objectiveBg:
    "При силен страничен вятър изпревари бавния камион и бъди готов за порива в мига, в който носът ти излезе от завета му: намали преди маневрата, дръж волана здраво и посрещай поривите с леки, постоянни корекции — не с рязко дръпване.",
  archetypeIds: ["AC-12"],
  conceptIds: [
    "c-vehicle-controls",
    "c-speed-adaptation",
    "c-overtaking-procedure",
    "c-hazard-perception",
    "c-general-care-duty",
  ],
  map: {
    archetype: "motorway-segment",
    // Reuses the committed mw-v1 map (1000 m divided 2+2 АМ, posted 140, an
    // emergencyLane span per carriageway, NO junctions/crossings/signals) —
    // its meta.scenario.params, mirrored here for provenance.
    // doc 87 B67: mw-v1 grew 1000 -> 2600 m per carriageway (the posted 140 was
    // unreachable inside 1000 m). This object MIRRORS the generator recipe and is
    // asserted equal to the shipped meta.scenario.params, so it moves with it.
    params: { lengthM: 2600, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // 287 characters — THE LONGEST STEP 1 IN THESE FIVE FILES. Three separate
    // duties (hands, lamps, look) and a paragraph of reasoning, in one line the
    // card could show a third of.
    // 70 ch
    { n: 1, textBg: "Хвани волана здраво с двете ръце — вятърът бие, а отпред пъпли камион." },
    // 73 ch
    { n: 2, textBg: "Включи късите светлини, ако вали (чл. 70) — минаваш през водния му облак." },
    // 75 ch
    { n: 3, textBg: "Не се лъжи от завета зад камиона: това е най-опасната секунда преди порива." },
    // 58 ch
    { n: 4, textBg: "Намали и подай ляв мигач ПРЕДИ да излезеш за изпреварване." },
    // 67 ch
    { n: 5, textBg: "Помни: по-бавно покрай камиона значи по-малко отместване от порива." },
    // 60 ch
    { n: 6, textBg: "Очаквай удара в мига, в който носът ти излезе пред кабината." },
    // 66 ch
    { n: 7, textBg: "Посрещни го с лека, ПОСТОЯННА корекция към камиона — никога рязко." },
    // 74 ch
    { n: 8, textBg: "Прибери се плавно надясно с десен мигач, щом целият камион е в огледалото." },
    // 51 ch
    { n: 9, textBg: "Очаквай нов порив при всяко следващо открито място." },
  ],
  success: [
    {
      id: "sc-acw-pass",
      // THE BANNER NOW NAMES WHAT THE GATE MEASURES (sweep161: mobile-wrong/
      // 04-t034s.png at 112 км/ч and pc-wrong/04-t039s.png at 135 км/ч — road
      // ahead completely empty, no truck anywhere). It used to read «Изпревари
      // камиона със съобразена скорост, без да излизаш от лентата», and the
      // gate under it is a bare `reachZone`: arrive within 12 m of
      // (−8.12, 340) at ≤ 100 км/ч. It cannot see a truck, cannot see whether
      // one was passed, and cannot see the lane you left — and this file's own
      // ACTS_WIND_TRUCK header already says the pass „is not completed in world
      // space" because cutInLeadCar only paces. Above `maxMatchSpeedMps` = 33
      // (118.8 км/ч) the rig cannot even keep station, which is exactly why the
      // 135 км/ч frame shows bare tarmac.
      //
      // So the tick stops promising the overtake and promises the two things a
      // capped zone in the overtaking lane really does prove: that the student
      // is IN the overtaking lane at the cab line, and that he is there under
      // the prudent-wind ceiling this drill teaches. The lane discipline
      // through the gust is still graded — by POOR_LANE_KEEPING, live, on the
      // real crosswind force (`physics.crosswind`) — and the overtaking
      // NARRATIVE is still taught by the instructions and the shadow.
      //
      // Routed, not silently dropped: an actor that actually falls behind
      // (a hold-only or plain slow-cruiser lead) is contracts.ts + a runner —
      // NOT this lane's files. Until it exists no gate here may say «изпревари».
      titleBg: "Излез в лявата лента до кабината със съобразена за вятъра скорост",
      // The pass point in the overtaking lane, at the cab line where the gust
      // lands. Cap 100 is the prudent-wind band this drill teaches (the shadow
      // rides ~70): both mistakes carry the pass off — the excursion demo
      // leaves the lane, the clip demo never reaches the far marker — so чл. 20
      // ал. 2 is graded by the objective and the LANE discipline by the shipped
      // POOR_LANE_KEEPING detector.
      params: { kind: "reachZone", x: MW_X_OVERTAKE, y: 340, radiusM: 12, maxSpeedKmh: 100 },
    },
    {
      id: "sc-acw-finish",
      titleBg: "Върни се в дясната лента и стигни края на отсечката",
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 600, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 90 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scAcWindTruckPass.ts; gates in traces/__tests__/
  // sc-ac-wind-truck-pass-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-ac-wind-truck-pass/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-wind-truck-pass/mistake-blown-out.trace.json" },
      titleBg: "Изненадан от порива — към разделителната ивица",
      whatWentWrongBg:
        "Колата излезе да изпреварва с отпусната ръка и с пътна скорост. В мига, в който носът мина пред кабината, заветът изчезна и поривът блъсна колата към разделителната ивица — тя се понесе през половин лента, докато водачът реагира. На открито място, а и при излизане от завета на камион, скоростта се смъква ПРЕДИ порива, а воланът се държи здраво с двете ръце (чл. 20, ал. 2).",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-wind-truck-pass/mistake-clip-truck.trace.json" },
      titleBg: "Порив в тясната пролука — удар в камиона",
      whatWentWrongBg:
        "Точно докато колата беше до кабината, в тясната пролука между нея и ремаркето, поривът я хвърли обратно към камиона — и последва удар. Изпреварването в силен вятър иска и по-широк страничен просвет, и по-ниска скорост: тръгне ли колата, за да намери просвета е нужно време, а вятърът не чака. По-бавно, здрав хват и повече място встрани (чл. 20, ал. 2).",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Винаги когато изпреварваш висок автомобил — камион, автобус, бус — при силен страничен вятър, най-често на магистрала и по откритите извънградски пътища. Разпознава се предварително: ветропоказателят или клоните се навеждат в една посока, а самата кола „плава“ при поривите. Докато си в завета на камиона вятърът мълчи — но точно затова ударът при излизане е двоен.",
    whyBg:
      "Камионът е стена, която спира вятъра — докато си зад него и до него, си в неговия завет и поривът не те бута. В секундата, в която носът ти излезе пред кабината, тази стена изчезва и целият вятър те удря наведнъж, странично. При висока скорост изминаваш повече метри, докато реагираш, и дрейфът те изнася — или към разделителната ивица отляво, или обратно към камиона отдясно. Още по-опасен е рефлексът „рязко срещу вятъра“: отслабне ли поривът, рязко завъртеният волан сам изхвърля колата на другата страна — вторият замах е убиецът при вятър. Затова законът връзва скоростта с атмосферните условия (чл. 20, ал. 2): преди такова изпреварване се намалява, воланът се държи здраво с двете ръце, а поривите се посрещат с меки, постоянни корекции.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    examinerBg:
      "Изпитващият следи контрола на волана при вятър и при изпреварване на високи превозни средства: очаква по-ниска скорост преди маневрата, стабилна лента през целия участък и спокойни, постоянни корекции. Лъкатушенето в лентата е грешка, а изхвърлянето към разделителната ивица или към изпреварвания камион — тежка: две ръце на волана и смъкната скорост.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5 — ДЪЖД върху вятъра. The conditions rung spreads OVER the template's
    // (compileScenario), so weather becomes "rain" (render + the tick.rain
    // conditions envelope, 0.85 × 140 = 119 km/h — still above every speed this
    // drill uses, so no conditions code attaches). physics MERGES per key over
    // the template's { crosswind: true }, so this rung ALSO runs wetGrip: the
    // wet road makes holding the lane against the gust genuinely harder — the
    // harder-conditions rung, honestly physical. The recorded ghosts are DAY
    // DRY (base), untouched.
    { level: 5, conditions: { weather: "rain" }, physics: { wetGrip: true } },
  ],
  staged: [ACTS_WIND_TRUCK],
  // DRY, clear weather — the wind is PHYSICS, never a weather render tag (the
  // sc-ac-crosswind law: no weather tag flips physics, and wind couples to none).
  conditions: { weather: "dry" },
  // THE SLICE: the live student's car runs the crosswind force (opt-in, authored
  // — the same whole-map wind sc-ac-crosswind ships). The recorded ghosts are
  // kinematic; their lee-then-gust story is authored (traces/scAcWindTruckPass.ts).
  physics: { crosswind: true },
  localeBg: "bg-BG",
};

/** The wave-2 adverse-conditions templates, in catalog order (registered in
 *  templates.ts by the integration pass). */
export const SCENARIO_TEMPLATES_CONDITIONS2: readonly ScenarioSpec[] = [
  SC_AC_NIGHT_OVERDRIVE,
  SC_AC_TRUCK_SPRAY,
  SC_AC_BRIDGE_ICE,
  SC_AC_WIND_TRUCK_PASS,
];
