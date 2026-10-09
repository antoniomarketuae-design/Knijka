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

/**
 * «AN URBAN STREET LINED WITH APARTMENT BLOCKS ON BOTH SIDES» — filed against
 * BOTH mw-v1 templates in this file (sc-ac-truck-spray:c042440d,
 * sc-ac-wind-truck-pass:6a076479's frame description), so it is answered once
 * here rather than twice at the map blocks. MEASURED 2026-08-27: THE MAP IS NOT
 * THE PROBLEM AND MUST NOT BE REGENERATED.
 *
 * `content/world/mw-v1.json` is `class: "motorway"`, `oneway: true`,
 * `lanes: 3` per carriageway over 2,606 m, posted 140, with an `emergencyLane`
 * zone per direction — and it authors ONE building in the whole district. Its
 * `platform/public/world/` twin is byte-identical, so the world that loads is
 * the world in this repo. Every block face in the w13 frames comes from
 * `world/builders/worldRim.ts`, added by the wave-3 repair (bbf1223) for „the
 * world simply runs out and the car keeps going": `buildWorldGeometry.ts:472`
 * calls it on EVERY district whose `meta.mapKind` is a string — 102
 * `scenario-*` maps plus poligon-v1 — and it stands a contiguous belt of
 * building masses on all four sides, 43–57 m outside the declared box
 * (TERRAIN_MARGIN_M 60 − WORLD_RIM_TERRAIN_INSET_M 3, less
 * TERMINUS_CLOSE_DEPTH_M 14), clamped to 9–22 m tall
 * (TERMINUS_CLOSE_MIN/MAX_HEIGHT_M) and skinned through the same
 * `facadeVariant` path as an authored блок. It reads the bounds and the road
 * polylines and never reads `edge.class`, so an автомагистрала is dressed
 * exactly like a residential street. The two exact edits, and the graded side
 * effect the belt's colliders introduce, are measured in
 * `environment/weather.ts` §2c.
 *
 * THE OTHER HALF OF c042440d IS REAL, SEPARATE, AND IS NOT worldRim: there is
 * no Д5 „Автомагистрала" plate and no gantry anywhere on the route, because
 * `world/builders/zoneSigns.ts` posts a plate only for a `zones` entry it has a
 * ZONE_SIGN_KIND mapping for, and mw-v1's only zones are the two
 * `emergencyLane` spans, whose `signRef` „М2" is a MARKING. A motorway the
 * briefing tells the student to read as one needs its entry plate. That is the
 * sign layer's row, not a template's: `map.params` below mirrors the generator
 * recipe and is an input to nothing at runtime.
 *
 * RE-PHOTOGRAPHED 2026-08-27, so the routing is not carried forward on a stale
 * frame: `.audit-frames/w14/frames/sc-ac-truck-spray__pc-right/04-t101s.png`
 * (that run’s own `_audit-status.json` is stamped 2026-08-27T17:09:37Z) shows the
 * 2+2 carriageway, the hard shoulder and a grassed median — mw-v1's geometry is
 * all there — under a continuous six-storey streetwall on both verges, with no
 * Д5 plate and no gantry in frame. Nothing in THIS file authors any of that:
 * `districtId: "mw-v1"` names a committed document whose `content/world/` and
 * `platform/public/world/` copies are byte-identical. c042440d's address is
 * `world/builders/zoneSigns.ts` + `world/builders/worldRim.ts`, and both edits
 * are written out in `environment/weather.ts` §2c.
 *
 * AND THE PELENA IS NOT THIS FILE EITHER, although the lesson is. Both spray
 * rows (`sc-ac-truck-spray:6f13e17b` „no spray and no plume is rendered behind
 * the truck", `:ebaacf94` „no visibility loss behind the truck") are filed
 * against `environment/weather.ts`, whose §4 refuses them for the right reason:
 * spray is emitted BY one vehicle and occludes the air behind THAT vehicle, so
 * a scene-wide 0..1 in the weather store would make every driver in the lesson
 * spray. On the same 2026-08-27 frame the road markings, the hard shoulder, the
 * treeline and the tower blocks directly behind the truck are all sharp and its
 * tail-lamp bar is crisp, with `ИНСТРУКЦИИ` step 3 legible beside it. The
 * emitter belongs on the truck rig — `traffic/vehicleFleet.ts:1648`
 * (TRUCK_MODEL_INDEX, the procedural box truck) mounted through
 * `traffic/TrafficLayer.tsx:1408` — and must ride `getRainIntensity()` from the
 * weather store rather than replace it. THE COPY IS DELIBERATELY NOT REWRITTEN
 * TO MATCH THE EMPTY AIR: unlike sc-ac-bridge-ice's мост (which no district in
 * the catalogue could ever carry — there is no `bridgeDeck` zone kind), a spray
 * plume is renderable, and striking «пелена» from FO-04 × FO-06 would delete
 * the vision-block half of the archetype to make a picture-match go green.
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
      //
      // ── AND IT NOW HAS A FLOOR AS WELL AS A CEILING —
      //    sc-ac-night-overdrive:b9d61410 (critical), CLOSED HERE ────────────
      //
      // The row: „✓ at 2:45 on a drive that never exceeded 15 км/ч … a
      // speed-appropriate-to-visibility gate that a walking-pace car satisfies
      // teaches nothing". It is NOT closed by the tightening recorded directly
      // above: 58 → 50 lowers a CEILING, which is harder for a fast car and no
      // answer whatever to a slow one. `maxSpeedKmh` entered `stepReachZone` as
      // `speedKmh <= cap` and nothing else, so 0 км/ч satisfied this gate as
      // completely as the taught 50 did.
      //
      // `minSpeedKmh` is the missing half of that ONE contract — authored here,
      // parsed by `parseObjectiveParams`, carried onto the compiled objective by
      // `serializeObjectiveParams` and ANDed into `contractEarned`. The full
      // design note lives on `objectives.ts ReachZoneWitnessDemands.minSpeedKmh`;
      // the two things a template author needs from it are that it is NOT
      // laddered (so the number must be comfortable at every rung) and that it
      // may not be derived from the banner — only a template can quantify
      // «съобразена».
      //
      // WHY 35. Step 2 of the briefing orders «стабилизирай около 50 км/ч» and
      // the committed shadow rides 49.9 км/ч across this disc, so 35 leaves the
      // lesson's own model line 15 км/ч of margin on top of the
      // REACH_ZONE_CAP_SLACK_KMH dead band beneath it — replayed through the
      // full pipeline at all five rungs by §6 of `scenario/__tests__/
      // lane-world-claims.test.ts` rather than assumed. And it is clear of the
      // crawl the frame photographed: 15 км/ч is now refused, with a card.
      //
      // THE BAND IS WIDEST WHERE THE HELP IS. `widenSpeedCap` lifts the ceiling
      // to 55 at L1 while the floor stays 35, so the beginner drives [35, 55]
      // and the expert [35, 50] — the ladder still forgives in the direction it
      // is meant to.
      //
      // THE BANNER IS DELIBERATELY LEFT ALONE, and it is now honest rather than
      // UNDERDETERMINED. «Съобразена … скорост» is the catalogue's own
      // phrase for a capped gate (seven rows across three `templates-*.ts`
      // files) and `deriveLawfulSpeedDemand` reasons about the family by name,
      // so rewording this row alone would break a shared idiom. An
      // underdetermined claim is repaired by the missing term, and this is it.
      params: { kind: "reachZone", x: LANE_X, y: 250, radiusM: 12, minSpeedKmh: 35, maxSpeedKmh: 50 },
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
 * a fixed 64 m of centers, so the ONLY variable the student changes is SPEED.
 * The bumper gap is 58.2 m, not the 59.9 m this comment used to state: that
 * figure subtracted one 4.1 m CAR, but `leadGapFor` (traffic/system.ts,
 * `bumperSubtrahendM`) subtracts the player's half plus the LEAD'S OWN half —
 * PLAYER_HALF_LENGTH_M = car 4.1 / 2 = 2.05 (traffic/types.ts:216 `car: 4.1`,
 * :270) plus truck 7.5 / 2 = 3.75 (traffic/types.ts:218 `truck: 7.5`) —
 * so 64 − 5.8 = 58.2 m, 1.7 m shorter than the car-length figure.
 * 58.2 m is ~3.3 s at the shadow's 64 km/h and ~1.8 s at the mistake's
 * 115 km/h; the wet rule targets 2.88 s (1.6 × 1.8) and FOLLOWING_TOO_CLOSE_
 * FOR_RAIN fires under 0.7 × 2.88 ≈ 2.0 s (rules/types.ts followRain*), so the
 * shadow is clear of it and the mistake is inside it — the same two stories.
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
  paceAheadM: 64, // 64 m of centers (truck bumper 58.2 m, see above) — ~3.3 s at 64 km/h, ~1.8 s at 115
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
      // Cap 80 is the gate that separates the two stories. The pinned 58.2 m
      // truck-bumper gap (64 m of centers less the car's 2.05 m and the
      // truck's 3.75 m halves — see ACTS_SPRAY_TRUCK) is worth ~2.6 s at
      // 80 km/h: under the 2.88 s wet target, but clear of the ≈2.0 s line the
      // FO-04 detector fires on. The shadow's 64 km/h clears it with room,
      // while the „законните" 115 simply cannot be here slowly enough. The gap
      // discipline is graded by the FO-04 detector; THIS gate grades the speed
      // that makes it possible.
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 450, radiusM: 12, maxSpeedKmh: 80 },
    },
    {
      id: "sc-acts-finish",
      // TITLE-TRUTH (founder ruling 2026-09-27, «The time gap»). This read
      // «…, без да си влизал в пелената» over a bare reachZone that never
      // reads the truck, the lead gap or SPRAY_NEAR_M — a car 3 m off the
      // tailboard collected it exactly like one 58 m back. The offence this
      // lesson bills is the SECONDS gap (FOLLOWING_TOO_CLOSE_FOR_RAIN), and
      // the pinned rig keeps every lawful drive ~58 m out of the curtain, so a
      // plume check here could never fire. The title now claims only what the
      // row checks; the curtain's WHY stays in steps 3/4/9 and the teach card.
      // Pinned: __tests__/wet-copy-truth.test.ts §A.
      titleBg: "Стигни края на отсечката",
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
 * The bridge PARAPETS are RECORDER obstacle rects on the trace channel (the
 * sc-ac-ice / sc-ac-aquaplane mold) AND, since row sc-ac-ice:86eab7e9, BUILT at
 * exactly those faces: ac-bridge-v1's street edge declares the structure
 * (`bridges`), and world/builders/bridgeDeck.ts draws the deck, both walls
 * with their abutment pylons, and the railed bridgehead embankment the whole
 * approach runs on — all in the wall collider. The live student's graded skill
 * is still the three-gate anticipation; the wall the red ghosts meet is now the
 * wall in front of him, and the brake-on-deck ghost ends against its face
 * (traces/__tests__/sc-ac-bridge-ice-ghost-meets-built-wall.test.ts).
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
  //
  // THE BRIDGE IS THERE NOW (row sc-ac-ice:86eab7e9, 2026-09-27). The deck,
  // its parapets, the abutment pylons at 250 and 340 and the railed
  // bridgehead embankment from the spawn are BUILT (world/builders/
  // bridgeDeck.ts), and the claim gate credits deictic bridge wording on this
  // map through the edge's `bridges` tag. The ravine is still not built, so
  // „над дерето" stays refused. Two sentences the built bridge made FALSE were
  // rewritten: step 10 said the end of the ice is marked by nothing (the far
  // abutment now stands exactly there), and both demo cards sent the car onto
  // a «банкет» over a replay on the deck, where the teach text itself says
  // there is none — only the parapet.
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
    // 78 ch
    // WAS „Мини целия мост с равна газ и прав волан, без нито една корекция."
    // — 2026-08-27, sc-ac-bridge-ice:4dc973d6. This is the ONE instruction the
    // wave-N bridge strike missed, and it missed it for a reason worth writing
    // down: `lane-world-claims.test.ts`'s bridge predicate matches the DEICTIC
    // SPELLINGS it enumerated — /устой|устоя|над дерето|това е мост|
    // съоръжението|по моста|на моста|мостът е/ — and „целия мост" is none of
    // them. So steps 3, 5, 6 and 10 and both gate titles were rewritten while
    // this line went on ordering the student across a bridge, GREEN, in a
    // district whose only zone is `{ kind: "icePatch", 250→340 }`. Confirmed
    // still shipping on the 2026-08-27 re-drive: `.audit-frames/w14/frames/
    // sc-ac-bridge-ice__pc-right/03-ready.png` prints steps 1–6 in the
    // ИНСТРУКЦИИ panel over apartment blocks that run to the horizon, and
    // 04-t075s.png shows the А15 post standing on ordinary street asphalt with
    // no deck, no abutment and no ravine anywhere in frame.
    //
    // „хлъзгавата отсечка" is the same 90 m and the same duty — and it is the
    // wording steps 6 and 10, the objective and gate `sc-acbi-deck` already
    // use, so the briefing now names one thing consistently instead of two.
    // THE GATE HOLE IS NOT CLOSED BY THIS EDIT: the predicate still cannot see
    // a bare „мост" as a claim. Widening it is a test file this lane does not
    // own — the exact edit is in the lane report.
    { n: 7, textBg: "Мини цялата хлъзгава отсечка с равна газ и прав волан, без нито една корекция." },
    // 80 ch
    { n: 8, textBg: "Помни: върху леда сцеплението е ~15% от сухото — спирачка и волан почти липсват." },
    // 66 ch
    { n: 9, textBg: "Не бързай да даваш газ — ускорението е също толкова рязка команда." },
    // 66 ch
    // Was „Чакай отсрещния устой: там свършва ледът и чак там свършва мостът."
    // then „…краят му не е обозначен с нищо" while no deck was built. The far
    // abutment IS built now (pylons, the end of both parapets and the
    // expansion joint at 340 — exactly where the ice ends), so the line names
    // it again; no SIGN marks the end, and the line does not claim one.
    // 72 ch
    { n: 10, textBg: "Брой метрите: хлъзгавото е целият мост, около 90 м — до отсрещния устой." },
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
  // The cards' distances are the RECORDINGS' (row sc-ac-ice:86eab7e9, round 4):
  // the shadow starts its ease-down at y ≈ 180.6, i.e. ~70 m before the ice at
  // 250, and the brake-on-deck driver first brakes at y ≈ 255.7 — 75 m later.
  // They used to say «200 метра по-рано» and «закъснение от 90 метра», which no
  // recording gives. traces/__tests__/sc-ac-bridge-ice-caption-windows.test.ts
  // measures both off the shipped traces.
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-ac-bridge-ice/mistake-road-speed.trace.json" },
      titleBg: "Мостът с пътна скорост — задницата тръгва",
      whatWentWrongBg:
        "Колата влезе в хлъзгавия участък с разрешените 50 — „нали е в ограничението, пътят е сух“. Само че сухо беше зад теб, не под теб: на първите метри лед задницата тръгна настрани и колата се понесе към парапета, олюлявайки се през половината платно. Никой не я е карал в тези секунди — воланът върху 15% сцепление не води, а моли. Ограничението е таван за платно в добро състояние; чл. 20, ал. 2 връзва скоростта със СЪСТОЯНИЕТО на пътя, а в мразовита сутрин състоянието е лед, докато не се докаже обратното. Правилният водач взе решението около 70 метра преди леда — тук то изобщо не беше взето.",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-bridge-ice/mistake-brake-on-deck.trace.json" },
      titleBg: "Спирачка ВЪРХУ леда",
      whatWentWrongBg:
        "Този водач поне разбра, че отсечката е лед — но го разбра 75 метра по-късно от правилния водач и натисна спирачката ВЪРХУ самия лед. При 15% сцепление педалът не спира колата, а само ѝ отнема посоката: за 36 метра с натисната докрай спирачка скоростта падна от 50 на 43 км/ч — на сух асфалт същата спирачка щеше да е спряла колата в 24 метра. Вместо това колата се понесе по инерцията си и намери единственото нещо, което на моста е винаги там — парапета. Забележи какво НЕ се случи: няма рязко спиране, защото рязко спиране на лед е физически невъзможно. Точно затова намаляването не е реакция, а предвиждане — то се прави преди леда, на чист асфалт (чл. 20, ал. 2).",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Във всяка сутрин около нулата — и винаги на откритите съоръжения: мостове, надлези, естакади, крайречни участъци, сенките на сгради и дървета. Мостът е първият, защото под платното му няма топла земя, а студеният въздух го брули отгоре И отдолу: той може да е заледен, докато улицата преди и след него е суха и черна. Разпознава се по геометрия, не по цвят — сградите свършват, пътят тръгва над празното, парапет от двете страни. Видиш ли това при термометър около нулата, кракът се вдига от газта ОЩЕ ТАМ.",
    whyBg:
      "Ледът оставя на гумите около 10–20% от сухото сцепление — спирачният път от 40 км/ч става колкото сухият от 100, а завъртеният волан не завива, а отключва занасяне. Най-коварното е, че той не се вижда: асфалтът на моста лъщи под същото синьо небе като сухата улица зад него. Затова на мост няма реакция — има само предвиждане. Всяка команда, която би те спасила (спирачка, волан, дори газ), изисква сцепление, а точно него ледът ти е взел: единственият момент, в който още имаш сцепление и избор, е ДОКАТО СИ НА СУХОТО. Оттам нататък мостът не ти оставя нищо — нито място да завиеш, нито банкет да избягаш, само парапет отляво и отдясно и дере отдолу. Законът казва същото с две думи: скоростта се съобразява със състоянието на пътното покритие (чл. 20, ал. 2) — а състоянието на моста в мразовита сутрин е лед, докато не се докаже обратното.",
    lawRef: "ЗДвП чл. 20, ал. 2",
    // THE BRIDGE THAT SURVIVED IN AN EXEMPTED FIELD — 2026-08-27, the second
    // half of sc-ac-bridge-ice:4dc973d6. `lane-world-claims.test.ts` exempts
    // `teach.*` because it states the RULE, true on every map; that exemption
    // is right for `whenBg`/`whyBg` (bridge doctrine, untouched below) and it
    // was wrong for this string, which is not doctrine at all — it says what
    // the examiner is watching ON THIS DRIVE. It watched „дали изобщо си видял
    // МОСТА", counted „липсата на ускорение до ОТСРЕЩНИЯ УСТОЙ", called every
    // sharp input „върху СЪОРЪЖЕНИЕТО" and ended the exam on „плъзгането в
    // ПАРАПЕТА". ac-bridge-v1 has none of the four, and the drill's own
    // COLLISION demo ends in the банкет, not in a parapet — so the one
    // consequence this paragraph named was the one that cannot happen.
    // Re-pointed at what the world gives: the А15 post, the 90 m span, the
    // carriageway edge.
    //
    // HONEST LIMIT, so the next reader does not count this as delivered: NO
    // LIVE READER RENDERS `teach.examinerBg`. `modules/lesson/types.ts:87`
    // types the ref `field: "when" | "why" | "examiner"` and `compose.ts:231`
    // is the only construction site — it always asks for "why". The one place
    // an examiner paragraph reaches a screen is the marketing page, off a
    // hand-copied constant for a different lesson
    // (`components/marketing/landing/featuredMistakes.ts:147`). This edit
    // therefore changes no pixel today; it removes a false sentence from the
    // corpus before the field acquires the reader its type already promises.
    examinerBg:
      "Изпитващият следи дали си прочел знака А15: очаква осезаемо вдигане на газта ПРЕДИ хлъзгавата отсечка, без подкана — знакът предупреждава, не задължава. Равномерното преминаване с прав волан и липсата на ускорение до края на отсечката се четат като зимно четене на пътя; всяка рязка команда върху леда е грешка в преценката, а изнасянето извън платното прекратява изпита.",
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
  //
  // `winter: true` is the SEASON, and it is what makes «При температури около
  // нулата …» a picture instead of a caption (sc-ac-bridge-ice:7eb16029 /
  // sc-ac-ice:5372f176: both ice lessons rendered the same full-leaf summer
  // morning). A render axis ONLY — no grip, no envelope, no weather tag; the
  // sentence above is unchanged by it.
  conditions: { weather: "dry", winter: true },
  // NO ruleConfig: every code this drill grades is shipped default-on.
  // NO physics: base grip stays 1 and ONLY the deck span reduces it — the
  // sc-ac-ice precedent (the pure map-data grip contract).
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-ac-wind-truck-pass — „Страничен вятър след камиона" (AC-12 crosswind, the
// OVERTAKING beat) on mw-v1 (the 2600 m 2+2 motorway, REUSED, DAY DRY + WIND).
// ---------------------------------------------------------------------------

/** mw-v1 northbound OVERTAKING-lane center — laneId 2 (meta.scenario.laneLeftX;
 *  the L7 copy truth, asserted against the map by the trace gate). The cruise
 *  lane (laneId 1) is x = 0 (MW_X_CRUISE, above), the emergency lane x = 8.13. */
const MW_X_OVERTAKE = -8.12;

/**
 * THE TRUCK'S OWN SPEED — 40 км/ч (11.11 m/s), held on a scheduled cruise.
 *
 * WHY 40. It has to be BELOW what the student may lawfully drive beside it, at
 * every rung, or the pass the lesson asks for cannot be made without speeding.
 * The slowest lawful speed in the overtaking lane of mw-v1 is the product's own
 * motorway floor, 50 км/ч (`rules/types.ts motorwayMinFlowKmh`: a steady speed
 * under it, with no vehicle within 60 m ahead in the lane, is billed
 * DRIVING_TOO_SLOW_FOR_MOTORWAY) — so 40 leaves the slowest lawful student
 * 10 км/ч of closing speed, and the taught 62 км/ч twenty-two. The lesson's cap
 * (100, the pass task) and the road's limit (140; 119 under L5's rain
 * envelope) are untouched: nothing was raised to make the pass fit.
 *
 * A heavy rig crawling at 40 in this wind is the picture the briefing already
 * paints («отпред пъпли камион»), and ЗДвП чл. 20, ал. 2 — the article this
 * lesson cites — is its driver's reason.
 */
const WIND_TRUCK_MPS = 40 / 3.6;

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
 * scenery — the truck the player overtakes — and executes NO cut.
 *
 * THE RESTAGE OF 2026-10-08 (sc-ac-wind-truck-pass:ff1d4290; the founder's
 * delegation of that date, the integrator's decision: «restage the truck-pass
 * crosswind lesson so the truck can really be passed and its lee reached»).
 * Until then this actor was `matchPlayer` with `paceAheadM: 60`: it paced the
 * student and stayed 36–80 m AHEAD on every sample of every drive, so it was
 * never abeam and never behind. Briefing step 8 («…щом целият камион е в
 * огледалото») could not trigger, the first task («…до кабината…») was a disc
 * on an empty lane, the correct demo ended on «изпреварихме камиона» with the
 * truck still in front, and the lee the lesson is about could not be reached,
 * so the briefing had been rewritten to tell the student there was none.
 *
 * THREE AUTHORED FACTS MAKE IT REAL, all three opt-in on the shared contracts:
 *  · `paceMode: "scheduledCruise"` at `WIND_TRUCK_MPS` — the truck holds its
 *    own 40 км/ч on its own arc and is passed in world space. `paceAheadM: 90`
 *    is that mode's RELEASE distance; the truck stands 80 m up the road at the
 *    spawn, so it moves off with the student's first metres.
 *  · `actor.windShelter: true` — its body is a wall to this lesson's wind
 *    (`vehicle/windShelter.ts`): the wind blows WEST, the truck is in the
 *    cruise lane, so the LEE is on its WEST side — the overtaking lane — and
 *    in the 13 m of wake behind its tail. There the force on the student's car
 *    is 30 % of the open wind's; it is whole again one car length past the cab.
 *  · `overtake` — the runner reports, in the truck's own frame, the frame the
 *    car draws level with the cab in the overtaking lane and the frame its
 *    return into the truck's lane is FINISHED: settled in the lane with
 *    10.25 m of road behind its tail, not slower than the truck, and the truck
 *    not slowing for it, for the 1.44 s the truck takes to drive its guard's
 *    reach — and the truck never braked hard for it (round 3). The first two
 *    tasks below are those two reports.
 *
 * It still emits no SimTick events and resolves no outcome of its own; a real
 * contact with it is the director's sentinel's to report, and now can be —
 * the „narrow gap" mistake demo below is that contact.
 */
const ACTS_WIND_TRUCK: CutInLeadCarSpec = {
  id: "sc-acw-truck",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["mw-n-nb-start", "mw-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: 95 }, // dormant 80 m ahead of the spawn, cruise lane
    cruiseSpeedMps: WIND_TRUCK_MPS, // 40 км/ч — see WIND_TRUCK_MPS
    extraRightOffsetM: -8.125, // one drawn lane LEFT of the graph lane → the CRUISE lane (x = 0)
    colorIndex: 2,
    profile: "truck", // FO-06 box-truck rig, 7.5 × 2.4 m — the wall of the lee
    windShelter: true, // …and now it IS one: vehicle/windShelter.ts
  },
  paceMode: "scheduledCruise", // its own speed, on its own arc — it can be passed
  paceAheadM: 90, // the RELEASE distance: 80 m of road at the spawn, so it moves off with the student
  maxMatchSpeedMps: WIND_TRUCK_MPS, // unused under scheduledCruise; carried because the spec requires it
  cutAt: { x: MW_X_CRUISE, y: 3000 }, // 400 m PAST the 2600 m road — the cut tier is out of reach…
  cutRadiusM: 2,
  minCutSpeedKmh: 250, // …and double-locked: no player speed can fire it
  cutShiftM: 0,
  cutRampSec: 1.5,
  cutSpeedMps: WIND_TRUCK_MPS,
  clearAheadM: 45,
  overtake: {
    side: "left",
    // The overtaking lane, edge to edge, measured from the truck's own line
    // (x = 0): mw-v1's lane pitch is 8.12 m, so its centre is 8.12 m to the
    // truck's left and its edges 4.06 and 12.18.
    adjacentLaneM: [4.06, 12.18],
    // „До кабината": the car's centre level with the cab — the front 2 m of
    // the 7.5 m rig (its nose is 3.75 m ahead of its centre).
    abeamFromM: 1.75,
    // The truck's lane, half of it; the return is watched from the first
    // frame any part of the car (0.85 m of half-width) is over its edge.
    ownLaneHalfWidthM: 4.06,
    // ROUND 3 — WHEN THE RETURN IS FINISHED (the round-2 verifier's F2-01: a
    // car slower than the truck was answered «clear» on the frame its centre
    // crossed the lane line, and the truck braked hard 0.6–1.6 s later). The
    // car is SETTLED: centre within 3.0 m of the truck's line — the tighter of
    // the lane-keeping band (laneKeepMaxOffsetM 3.25 on the drawn lane) and
    // the truck's own following corridor (traffic/staged.ts GUARD_LATERAL_M
    // 3.0), so the guard can see it — and heading within 15° of the road
    // (runtime/turns.ts TURN_REARM_DEG, the runtime's «straightened out»).
    // The restage test pins both to their sources.
    establishedHalfWidthM: 3.0,
    establishedHeadingDeg: 15,
    // «Щом целият камион е в огледалото»: 10.25 m of road between the car's
    // tail and the truck's nose. At that distance the whole 2.4 m front of the
    // rig subtends 11° at the interior mirror — inside the glass, edge to edge.
    //
    // WHY NOT A ROUND 10 (round 2). The truck's own following guard watches
    // 16 m ahead of its centre (`traffic/staged.ts GUARD_AHEAD_M`), which is
    // 16 − 3.75 − 2.02 = 10.23 m between the bumpers, and brakes for a car
    // nearer than that in its lane. A return counted «clear» at 10.00 m could
    // therefore still be braked for on the next frame; at 10.25 the car is
    // outside the truck's reach (`overtake-return-forced.test.ts` holds this
    // number to the guard's). Round 3: the gap is one of the conditions the
    // return must HOLD for 1.44 s before it is finished — never read on the
    // frame the car crosses the line.
    clearBumperGapM: 10.25,
  },
};

/**
 * Where the stretch ends, m up the northbound carriageway.
 *
 * WAS 600, and 600 is too tight for a truck that holds its own speed. MEASURED
 * on the live car at every rung (`scenario/__tests__/
 * wind-truck-pass-restage.test.ts` §2 — the five rungs agree to the metre):
 *
 *                          in the lee      alongside      level with   back, whole
 *                          (any / full)    the truck      the cab at   truck behind
 *   taught, 62 км/ч        4.2 s / 2.8 s   2.0 s, 33 m    y = 276      y = 361
 *   slowest lawful, 53     7.2 s / 4.8 s   3.4 s, 49 m    y = 373      y = 481
 *
 * (53 on the pedal is 52 on the dial at the cab: two over the motorway floor.
 * The lee column is with the 13 m wake of round 2; with round 1's 15 m it was
 * 4.5 / 3.2 s and 7.8 / 5.4 s.)
 * 900 leaves the slowest lawful pass 419 m of road in hand and the taught one
 * 539 m, on a carriageway that is 2600 m long.
 */
const WIND_FINISH_Y = 900;

/**
 * AC-12 — страничен вятър при изпреварване на камион (ЗДвП чл. 20, ал. 2:
 * скоростта се съобразява с атмосферните условия — вятърът е изрично такова —
 * така че водачът да запази контрол над превозното средство). The OVERTAKING
 * beat of the wind archetype, distinct from live sc-ac-crosswind (the plain
 * open-segment gust): here the danger is the TRANSITION — the truck's lee
 * (завет) shelters you while you are alongside, and the wind is back the
 * instant your nose clears the cab.
 *
 * WHY mw-v1 AND NOT the fo-follow-v1 street sc-ac-crosswind uses:
 *  - The lesson needs a SLOW vehicle to overtake and a wide carriageway to do
 *    it on — a motorway is where „изпреварвам камион в силен вятър" actually
 *    lives (доц-72 AC-12's own „изпреварен камион" cue). The player pulls into
 *    the overtaking lane (laneId 2, x = −8.12), passes the rig in the cruise
 *    lane, and meets the wind again at the cab line.
 *  - mw-v1 carries no zones, crossings, junctions or signals, so nothing but
 *    the wind-control channels is gradable. In the overtaking lane every
 *    lawful speed is ≥ 50 км/ч (the motorway floor) and well under 140.
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
 *  - The COLLISION mistake is a REAL contact since the restage: the demo's car
 *    runs into the truck's flank beside the cab and the director's sentinel
 *    reports the two bodies overlapping. The recorder's scripted `collision`
 *    seam, which billed a crash 8 m of air away from a paced rig, is gone.
 *
 * DUAL-CHANNEL HONESTY (the 4a law, wind edition — sc-ac-crosswind verbatim):
 * `physics.crosswind` runs the LIVE student's car under the westward force +
 * deterministic gust sine (CROSSWIND_BRIDGE_N ± CROSSWIND_GUST_*), multiplied
 * here by the truck's lee. The recorded demos are KINEMATIC, so what the wind
 * does to the car is AUTHORED into the polylines (traces/scAcWindTruckPass.ts);
 * what the truck does is not authored — it is this staged actor in the
 * recorder's stack, on the same schedule as in the live one.
 */
export const SC_AC_WIND_TRUCK_PASS: ScenarioSpec = {
  id: "sc-ac-wind-truck-pass",
  family: "conditions",
  tagsBg: ["условия", "страничен вятър", "пориви", "изпреварване", "камион", "контрол на волана"],
  titleBg: "Страничен вятър след камиона",
  // «ИЗПРЕВАРИ» IS BACK, BECAUSE THE WORLD NOW STAGES IT (2026-10-08,
  // sc-ac-wind-truck-pass:ff1d4290). On 2026-08-27 (:6a076479) this sentence
  // was stripped of both its promises — the overtake and the lee — under the
  // rule „until it exists no gate here may say «изпревари»", because the rig
  // only paced and the wind had no position term. Both exist now (see
  // ACTS_WIND_TRUCK), both are measured on the live car at every rung
  // (`wind-truck-pass-restage.test.ts`), and the sentence says what the drive
  // delivers: the lee beside the truck, and the wind back at the cab.
  // `objectiveBg` is student-facing on two live surfaces
  // (`lane-world-claims.test.ts` counts it in `shownToTheStudent`, and the
  // classroom prints it under the correct take).
  objectiveBg:
    "При силен страничен вятър изпревари бавния камион: намали преди маневрата и дръж волана здраво с двете ръце. До камиона си в неговия завет и вятърът отслабва — отпусни корекцията плавно; пред кабината вятърът се връща наведнъж — посрещни го с лека, постоянна корекция, не с рязко дръпване.",
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
    // Reuses the committed mw-v1 map (2600 m divided 2+2 АМ, posted 140, an
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
    // 70 ch
    { n: 1, textBg: "Хвани волана здраво с двете ръце — вятърът бие, а отпред пъпли камион." },
    // 73 ch
    { n: 2, textBg: "Включи късите светлини, ако вали (чл. 70) — минаваш през водния му облак." },
    // 64 ch
    // WAS «Не разчитай на завет зад камиона — тук вятърът натиска през целия
    // участък» (2026-08-27, when the wind had no position term and that was the
    // truth of the drive). The first half is still the rule and is now a
    // MEASURED property of the lee, at the product's OWN line (round 2, the
    // round-1 verifier's F-05): the wake ends 13 m behind the truck's tail
    // (`WIND_SHELTER_WAKE_M`), and the rule engine starts to bill a car
    // following a 40 км/ч truck at 14.0 m — `followFireRatio` 0.7 of the
    // `followSafeSeconds` 1.8 s gap, at 11.11 m/s. The TAUGHT gap is the whole
    // 1.8 s, 20 m. So at every distance the product does not call too close
    // the factor is exactly 1 (measured on the live car at four rungs,
    // `wind-truck-pass-restage.test.ts` §8b), and the lee begins a metre
    // inside the «твърде близо» card. The second half of the old sentence was
    // true of the old world and is false of this one: beside the truck the
    // wind is at 30 %.
    { n: 3, textBg: "Дръж корекцията и зад камиона: на безопасна дистанция завет няма." },
    // 58 ch
    { n: 4, textBg: "Намали и подай ляв мигач ПРЕДИ да излезеш за изпреварване." },
    // 67 ch
    { n: 5, textBg: "Помни: по-бавно покрай камиона значи по-малко отместване от порива." },
    // 67 ch
    // WAS «Очаквай порив на всеки няколко секунди — вятърът диша, но никога не
    // спира» — the 2026-08-27 line for a wind that knew no place. The event
    // this lesson is named for HAS a place now, and the step names it. MEASURED
    // on the live car at every rung: beside the truck the force is 210–510 N
    // against 700–1700 N in the open, the wheel that holds the lane falls from
    // 1.7 % of the lock to 0.4 %, and a wheel left where the open wind wanted
    // it carries the car 1.6 m toward the truck in the 1.5 s the full lee
    // lasts at 80 км/ч (0.9 m with no lee) — which is the „плавно".
    { n: 6, textBg: "Отпусни корекцията плавно до камиона — в завета му вятърът отслабва." },
    // 68 ch
    // WAS «Посрещни го с лека, ПОСТОЯННА корекция към камиона — никога рязко».
    // MEASURED: the factor is back to 1 within one car length (4.04 m) of
    // relative travel past the cab — 0.7 s at the taught 62 км/ч, half a
    // second at a 30 км/ч closing speed; the force goes from 214 N to 987 N in
    // that time on the L3 drive.
    { n: 7, textBg: "Посрещни вятъра пред кабината леко, никога рязко — връща се наведнъж." },
    // 74 ch — unchanged, and since the restage it can happen: the truck falls
    // behind, and the second task fires when it has.
    { n: 8, textBg: "Прибери се плавно надясно с десен мигач, щом целият камион е в огледалото." },
    // 51 ch
    { n: 9, textBg: "Очаквай нов порив при всяко следващо открито място." },
  ],
  success: [
    {
      id: "sc-acw-pass",
      // THE GATE IS THE CAB, WHEREVER THE STUDENT CATCHES IT
      // (sc-ac-wind-truck-pass:ff1d4290).
      //
      // History, because both earlier repairs were right and neither could be
      // enough: the banner was retitled from «Изпревари камиона…» to this one
      // (sweep161 — a bare `reachZone` cannot see a truck), then the disc was
      // shrunk from 12 m to the lane's own 4.5 (:aa37b361 — a disc wider than
      // the lane pitch credited «в лявата лента» to a car that never left the
      // right one). What remained was a disc at y = 340 beside which no truck
      // ever stood: «до кабината» was certified on an empty lane.
      //
      // `stagedPass` ends that. The task is complete on the frame the truck's
      // own runner reports the car level with its cab in the overtaking lane
      // (`ACTS_WIND_TRUCK.overtake`), at a speed within the cap. The disc is
      // not consulted (`lessons/objectives.ts stepStagedPass`).
      //
      // THE CAP IS UNCHANGED — 100, the prudent-wind band this drill teaches
      // (the shadow passes at 62) — and it is judged where the task now is:
      // credited up to the cap plus the evaluator's slack on the frame the car
      // draws level, and billed as the task cap's ARRIVAL above the bill line
      // on that same frame (`lessons/engine.ts stagedPassCapArrival`), exactly
      // as crossing the old disc over the line was.
      //
      // x / y / radiusM: where the committed shadow does it (level with the cab
      // at y ≈ 280 in the overtaking lane) and the lane's own half-width. They
      // are provenance and the aid ladder's dial; nothing judges the car
      // against them, and guidance draws no ring there.
      titleBg: "Излез в лявата лента до кабината със съобразена за вятъра скорост",
      params: {
        kind: "reachZone",
        x: MW_X_OVERTAKE,
        y: 280,
        radiusM: 4.5,
        maxSpeedKmh: 100,
        stagedPass: { eventId: "sc-acw-truck", phase: "abeam" },
      },
    },
    {
      /**
       * «ПРИБЕРИ СЕ … СЛЕД ИЗПРЕВАРВАНЕТО» IS JUDGED BY THE TRUCK BEING BEHIND
       * (sc-ac-wind-truck-pass:ff1d4290).
       *
       * It was a disc in the cruise lane at y = 480 — which could see a lane
       * (the 2026-08-28 repair) but not an overtake: a car that had stayed 40 m
       * behind the truck the whole way was «прибрал се след изпреварването» the
       * moment it reached the mark. And a student who did what step 8 says —
       * return once the whole truck is in the mirror — could never do it at
       * all, because the truck never fell behind.
       *
       * Now: complete on the frame the runner reports the return FINISHED —
       * the car settled in the truck's lane with at least 10.25 m of road
       * between its tail and the truck's nose, not slower than the truck, the
       * truck not slowing for it, held for 1.44 s — AFTER it drew level on the
       * left (the runner's own order), and WITHOUT the truck having had to
       * brake HARD for the return (rounds 2–3): such a return is billed
       * (LANE_ENTRY_FORCED_BRAKING) and never completes this task by the gap
       * the truck's own braking then opens. One the truck only gave way to is
       * billed with the product's «Ранно прибиране пред изпреварения»
       * (OVERTAKE_RETURN_TOO_EARLY) and completes it once finished.
       * No cap, as before. A drive that never passes never hears either
       * report, completes neither task, and is ended by the route finish with
       * both rows open — which is the debrief that drive needs.
       *
       * THE TERMINAL BELOW IS UNTOUCHED IN KIND: a wide fixed disc, so the
       * lesson always has an ending (`lessons/engine.ts` consults
       * `routeFinishZone` while the chain is stalled on an earlier task).
       *
       * x / y / radiusM: where the committed shadow is back in the cruise lane
       * (y ≈ 425), provenance only — see the first task.
       */
      id: "sc-acw-back",
      titleBg: "Прибери се обратно в дясната лента след изпреварването",
      params: {
        kind: "reachZone",
        x: MW_X_CRUISE,
        y: 425,
        radiusM: 4.5,
        stagedPass: { eventId: "sc-acw-truck", phase: "returned" },
      },
    },
    {
      // THE BANNER KEEPS ONLY WHAT THIS DISC MEASURES: the arrival. Moved from
      // y = 600 to WIND_FINISH_Y so the slowest lawful pass fits before it.
      id: "sc-acw-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: MW_X_CRUISE, y: WIND_FINISH_Y, radiusM: 12 },
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
        // The lee is back in this card because it is back in the world (it was
        // taken out in round 2 of sc-ac-crosswind:a9db1738, V-13, when the
        // drive had none). The demo under it clears the cab at 80 км/ч with a
        // loose hand, and from that frame its polyline is carried 3.5 m toward
        // the median — the live car, hands off from the same frame at the same
        // speed, is carried 2.4 m that way in 2 s and 3.8 m in 2.5 s at every
        // rung (`wind-truck-pass-restage.test.ts` §8): «през половин лента».
        "Колата излезе да изпреварва с отпусната ръка и с пътна скорост. Пред кабината заветът на камиона свърши, вятърът се върна наведнъж и я понесе през половин лента към разделителната ивица, докато водачът реагира. При излизане от завета на камион скоростта се смъква ПРЕДИ това, а воланът се държи здраво с двете ръце (чл. 20, ал. 2).",
      codeRefs: ["POOR_LANE_KEEPING"],
    },
    {
      traceRef: { path: "content/traces/sc-ac-wind-truck-pass/mistake-clip-truck.trace.json" },
      // WAS «Порив в тясната пролука — удар в камиона». In the gap beside the
      // truck there is no gust — that is the lee; what happens there is the
      // hand. The title now names it.
      titleBg: "Рязка корекция в тясната пролука — удар в камиона",
      // The mechanism, measured on the live car: beside the truck the wind is
      // at 30 %, so a sharp correction „against the wind" has almost nothing to
      // push against and the car goes where the wheel points — toward the
      // truck (`wind-truck-pass-restage.test.ts` §8: the same hand carries
      // the car 1.6 m toward the truck through the lee and 0.9 m with no lee).
      // The demo passes on the truck's side of its lane (three metres of air
      // instead of six) and that correction closes the rest.
      whatWentWrongBg:
        "Колата мина покрай камиона в тясна пролука и с висока скорост. В завета му вятърът отслабна, а рязката корекция срещу него остана — и хвърли колата към камиона: последва удар до кабината. Изпреварването в силен вятър иска и по-широк страничен просвет, и по-ниска скорост: тръгне ли колата, за да намери просвета е нужно време. По-бавно, здрав хват и повече място встрани (чл. 20, ал. 2).",
      // COLLISION is the act, the one code this card cites, and — since round 2
      // — THE ONE CODE THE DEMO GRADES, at every rung (10 т.; the trace gate
      // and the live-chain test pin the sheet to exactly this).
      //
      // In round 1 the recording also graded LANE_CHANGE_WITHOUT_INDICATOR and
      // LANE_CHANGE_WITHOUT_MIRROR_CHECK: mw-v1's lanes are 8.12 m wide and the
      // truck holds the middle of its own, so a car cannot touch its flank
      // without its centre being two metres over the lane line first, and the
      // engine saw a lane entered with no signal toward it and no look. Through
      // the live chain the universal first-fault grace was then spent on the
      // first of those — a code this card never mentions — and the sheet read
      // 13 at four rungs of five (the round-1 verifier's F-04). The demo's
      // driver now looks right and signals right before his wheel goes over
      // (`traces/scAcWindTruckPass.ts`): the swerve is graded as what the card
      // says it is. It is not PRAISED either — a signalled, looked-for lane
      // change that ends against the truck's side is not commended
      // (`rules/engine.ts`, the `collision` case).
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    // WAS «…Докато си в завета на камиона вятърът мълчи — но точно затова
    // ударът при излизане е двоен.» Two words were not this car's: in the lee
    // the wind does not go silent (30 % of it remains — 210–510 N), and
    // nothing measured is „double". What is measured is the weakening and the
    // return, and the sentence now says those.
    whenBg:
      "Винаги когато изпреварваш висок автомобил — камион, автобус, бус — при силен страничен вятър, най-често на магистрала и по откритите извънградски пътища. Разпознава се предварително: ветропоказателят или клоните се навеждат в една посока, а самата кола „плава“ при поривите. Докато си в завета на камиона, вятърът отслабва — и точно затова връщането му пред кабината заварва неподготвения водач.",
    // THE LEE IS TAUGHT AS WHAT THIS DRIVE DOES (2026-10-08). Round 2 of
    // sc-ac-crosswind:a9db1738 (V-13) had to mark the lee as knowledge about
    // the road («На пътя…») and add «В това упражнение на завет не се
    // разчита — камионът остава далеч пред теб…», because that was the truth
    // of a paced rig and a wind with no position term; that builder routed the
    // real lee to the founder as owed, and this is it. Every clause below is
    // measured on the lesson's own car at every rung
    // (`wind-truck-pass-restage.test.ts`): the lee beside the truck and close
    // behind it; none at a lawful following distance; the whole wind back
    // within one car length past the cab; the displacement over a reaction
    // time rising with speed (`vehicle/crosswind.test.ts`); the drift to the
    // LEFT, toward the median (the wind blows west); and the sharp wheel
    // throwing the car toward the truck when the wind it was turned against
    // weakens — in a lull, and now in the lee. The law reference is unchanged
    // — nothing is recalled here.
    whyBg:
      "Камионът е стена, която спира вятъра: до него и плътно зад него си в завета му и вятърът отслабва, а в секундата, в която носът ти излезе пред кабината, стената свършва и целият вятър те удря наведнъж, странично. Зад камиона, на безопасна дистанция, завет няма — там корекцията се държи през цялото време. При висока скорост изминаваш повече метри, докато реагираш, и вятърът те отмества повече — към разделителната ивица отляво. Още по-опасен е рефлексът „рязко срещу вятъра“: отслабне ли вятърът — в порив или в завета на камиона, — рязко завъртеният волан сам изхвърля колата на другата страна, към камиона — вторият замах е убиецът при вятър. Затова законът връзва скоростта с атмосферните условия (чл. 20, ал. 2): преди такова изпреварване се намалява, воланът се държи здраво с двете ръце, а вятърът се посреща с меки, постоянни корекции.",
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
  // THE RETURN IS BILLED WHEN IT MAKES THE TRUCK BRAKE HARD (round 2; the
  // integrator's decision of 2026-10-08 under the founder's delegation, on his
  // rulings of 2026-09-30 «a lane-drop cut-in forcing hard braking IS the
  // push-out» and 2026-10-05 «bill it only when a … car actually has to brake
  // or swerve because of the entry, or there is contact»). The switch is the
  // lane-drop lessons' own, and it arms both bases of the one code here:
  //   · what an entry DEMANDS of a vehicle that is catching him (the runtime's
  //     `laneEntered` — a student who drops in front of the truck while slower
  //     than it), and
  //   · what the truck actually DID about a car that came into its lane in
  //     front of it (`laneEntryAnswer`, published by `ACTS_WIND_TRUCK`'s runner
  //     off the truck's own account of speed shed because of him) — the early
  //     return of step 8, where the car is the faster of the two and nothing
  //     is „demanded" at all.
  // A return with the whole truck in the mirror is outside the truck's reach
  // and is never billed (measured at every rung, 10–20 m, at the slowest lawful
  // speed and the taught one: `wind-truck-pass-restage.test.ts` §9).
  ruleConfig: { laneEntryForcedBrakingEnabled: true },
  // DRY, clear weather — the wind is PHYSICS, never a weather render tag (the
  // sc-ac-crosswind law: no weather tag flips physics, and wind couples to none).
  conditions: { weather: "dry" },
  // THE SLICE: the live student's car runs the crosswind force (opt-in, authored
  // — the same whole-map wind sc-ac-crosswind ships), and on this lesson the
  // staged truck shelters it (`ACTS_WIND_TRUCK.actor.windShelter`): the scene
  // reads the two facts together (`scene/lessonWindShelter.ts`) and feeds the
  // rig the lee's factor before every physics step. The recorded ghosts are
  // kinematic; what the wind does to them is authored
  // (traces/scAcWindTruckPass.ts).
  //
  // The DEPICTION of the wind (sc-ac-wind-truck-pass:6a076479) rides the same
  // number: the dust layer, the tree sway, the head lean and the gust chip all
  // read `VehicleSim.windLateralNow` / `windLatAccelMs2`, which are the
  // sheltered force — so the air is drawn calmer beside the truck with no
  // change to any of them.
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
