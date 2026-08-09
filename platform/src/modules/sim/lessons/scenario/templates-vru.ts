/**
 * Scenario templates — the VULNERABLE-ROAD-USER family, S3 batch 6 (doc 72 §7
 * „Family VU"): the one ✅ FULL, cleanly-gradable VRU archetype today, staged on
 * a purpose-built T-junction micro-map, DATA ONLY in the templates.ts mold
 * (coordinates denormalized from the committed district file so nothing loads
 * world JSON at runtime; the trace-gate battery asserts every pinned value
 * against the generated map):
 *
 *  - sc-vu-cyclist-hook  „Десен завой през велосипедист"  (VU-01, vu-cyclist-v1)
 *
 * It stages the SHIPPED `cyclistRightHook` kind — a narrow curb-riding
 * vehicle-agent (the honest v1 cyclist proxy, audit C3) travelling the DRIVER'S
 * OWN direction, so the runtime's conflictFromRight same-direction filter
 * correctly ignores it and the ONLY thing that grades the hook is the staged
 * director (orchestrator/runners.ts CyclistRightHookRunner). Each mistake demo
 * cites SHIPPED rules-catalog codes and grades EXACTLY them when replayed
 * through the production stack (the §5/§9 gate, traces/__tests__/
 * sc-vu-cyclist-hook-traces):
 *   - shadow → ZERO violations + YIELDED_TO_PRIORITY (waited the cyclist past
 *     the mouth, THEN turned right into the cleared gap);
 *   - „Завой пред велосипедиста" → EXACTLY FAILED_TO_YIELD (right turn started
 *     with the cyclist still alongside within the danger radius — the classic
 *     right hook; prioritySituation "cyclist-right-hook" violated);
 *   - „Удар във велосипедиста" → EXACTLY COLLISION (turned into the cyclist —
 *     contact through the existing collision(cyclist) reducer).
 *
 * The map carries NO signal, sign, crossing or roundabout, and control is
 * "none" (uncontrolled) so ZERO stop-line/priority code can pollute the demo;
 * every drive runs ambient traffic ZERO (seed 7): the ONLY actor is the cyclist
 * and the ONLY fault the rule engine can grade is how the driver treats it.
 *
 * Family: "vru" — the doc-76 §2 chip (already in ScenarioFamily/SCENARIO_FAMILIES
 * + FAMILY_ICONS 🚲); the id (sc-vu-*) matches the sc-<family>-<slug> standard.
 *
 * Doc-72 provenance: VU-01 is the single "Engine: ✅ FULL" archetype of Family
 * VU (the shipped cyclist proxy). ADR-006 stage 1b adds VU-09 („Линейка
 * отзад" — the emergency actor + yield adjudication, prioritySituation
 * "emergency" → EMERGENCY_NOT_YIELDED / YIELDED_TO_PRIORITY):
 *
 *  - sc-vu-emergency  „Линейка отзад"  (VU-09, ln-v1 — the 2+2 boulevard)
 *
 * ADR-006 stage 1c adds VU-10 („Линейка на кръстовището" — the junction EV
 * recipe on the shipped machinery):
 *
 *  - sc-vu-emergency-junction  „Линейка на кръстовището"  (VU-10, tj-rhr-v1)
 *
 * MECHANIC CHOICE (documented per the stage-1c mandate): the shipped
 * emergencyApproach adjudication arms strictly on BEHIND + CLOSING in the
 * player's frame (EM arm: behindM > 2 && ≤ armBehindM && actor faster) — a
 * CROSSING EV approaches from the side/ahead, so that runner structurally
 * cannot see it, and forking a second "emergency" adjudicator for crossing
 * geometry would be new grading, which VU-10 explicitly does not add (doc 72:
 * "extends VU-09's capability, no extra grading"). The clean, honest mechanic
 * is the existing junction-conflict machinery: the EV is staged as the
 * priorityFromRight crossing actor (profile "emergency" — the white rig +
 * blue light bar) through the UNCONTROLLED tj-rhr junction, arriving from the
 * player's right, so the runtime's own right-hand-rule tracker adjudicates:
 *   - barging in front of it grades EXACTLY FAILED_TO_YIELD (опасна, 10 т.) —
 *     on this junction the EV holds priority twice over (чл. 91 special
 *     regime AND чл. 50 право отдясно), so the junction-priority conviction
 *     is legally honest;
 *   - yielding earns YIELDED_TO_PRIORITY (the tracker's own commendation).
 * The чл. 91 make-way TEACHING lives in this template's copy (objective,
 * instructions, teach card) — the graded code stays a shipped one.
 *
 * VRU-INTERACTION pack slice 1 (doc 72 §15 item #8 / N8) adds VU-02 + VU-04
 * on two purpose-built straight streets (tools/maps/gen_vu_streets.mjs):
 *
 *  - sc-vu-pass-clearance  „Изпреварване на велосипедист"  (VU-02, vu-pass-v1)
 *    — the LATERAL-CLEARANCE duty (ЗДвП чл. 42). The staged actor REUSES the
 *    shipped cyclistRightHook kind as a plain curb-cruise recipe: the
 *    "junction" is the street's far end node, which the driver never turns
 *    right at, so the CyclistRightHookRunner only ever contributes its
 *    release choreography + the collision(cyclist) contact channel — the
 *    GRADING is the NEW runtime vulnerable-pass tracker (worldRuntime
 *    VULNERABLE_PASS_*: min lateral distance over the alongside phase;
 *    prioritySituation "vulnerable-pass" → VULNERABLE_PASS_TOO_CLOSE /
 *    YIELDED_TO_PRIORITY). NO new actor type (the N8 mandate).
 *
 *  - sc-vu-door-zone  „Зоната на вратата"  (VU-04, vu-door-v1) — the parked-
 *    row discipline (ЗДвП чл. 20; the opener's duty чл. 95 lives in the
 *    copy). The row is meta.scenario.bays (precise hittable cars in the
 *    scene, lotObstacleRects headless); the DOOR is a TIMED trace obstacle
 *    (ObstacleRect2D.trigger — arms on the player's approach, the telltale
 *    position-latch discipline). Mistake composition (documented ruling):
 *    hugging the row grades COLLISION (the door); the late dodge into the
 *    oncoming bank grades CROSSED_SOLID_LINE via the authored М1 span over
 *    the row — ONE honest code per demo, no staged oncoming needed. SCENE
 *    DESCOPE (honest): the live scene renders the parked row but NO door
 *    mesh/collider — the door ambush lives in the recorded demos + copy
 *    (annotations carry the beat); a swinging-door scene prop is a later
 *    polish item.
 *
 * NOTE on doc-72 numbering: the DOOR archetype is VU-04 („Вратата"); VU-03 is
 * the cyclist swerve-out, which slice 1 ships only as the vulnerable-pass
 * tracker's SWERVE STAND-DOWN (the margin lesson's honest half), not as a
 * scripted path-deviation actor.
 *
 * VU-05/06 stay 🟡 PARTIAL (recipe/world only) and VU-03 (scripted swerve
 * actor)/07/08/11/12/13/14 stay 🔴 NEW — later waves.
 */

import type {
  CyclistRightHookSpec,
  EmergencyApproachSpec,
  PriorityFromRightSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";
import { l5Night, l5Wet } from "./complications";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from vu-cyclist-v1 by value — the L7
// pattern; the vu-cyclist-district battery asserts the copies match the map)
// ---------------------------------------------------------------------------

/** Eastbound lane center of the W–E through road (centerline y = 0, drawn
 *  lane 8.125 m → right-of-travel/south center y = −4.06). */
const THROUGH_LANE_Y = -4.06;
/** Southbound lane center of the south stem (centerline x = 0 → right-of-
 *  travel/west center x = −4.06) — where the right turn lands. */
const STEM_LANE_X = -4.06;

/**
 * The staged CYCLIST on vu-cyclist-v1: rides the through road's SOUTH curb
 * eastbound (the driver's own direction), holding ~38 m short of the junction
 * until the driver closes within releaseDistM, then cruising straight through
 * the mouth. extraRightOffsetM 2.6 places it curb-side of the eastbound lane
 * (y ≈ −6.66). The CyclistRightHookRunner adjudicates the driver's right turn
 * across it (prioritySituation "cyclist-right-hook" / collision(cyclist)); the
 * numbers mirror the shipped exam-bank cyclistRightHookAtT config.
 */
const VU_CYCLIST: CyclistRightHookSpec = {
  id: "sc-vu-cyclist",
  kind: "cyclistRightHook",
  libraryEventId: "ev-cyclist",
  junction: { nodeId: "vu-n-c", x: 0, y: 0 },
  actor: {
    // Eastbound through the junction: vu-n-w → vu-n-c → vu-n-e.
    pathNodes: ["vu-n-w", "vu-n-c", "vu-n-e"],
    hold: { nodeIndex: 1, offsetM: -30 }, // waits curb-side, 30 m short of vu-n-c
    // A slow city cyclist (~11 km/h): the driver can close and pass it BELOW
    // the follow-grading speed floor (20 km/h), so the collision demo can hit
    // it cleanly without a spurious FOLLOWING_TOO_CLOSE, and it lingers at the
    // mouth long enough that the hook/yield windows are stable.
    cruiseSpeedMps: 3.0,
    extraRightOffsetM: 2.6, // rides the curb of the scaled eastbound lane
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  releaseDistM: 70,
  dangerRadiusM: 9,
  // Widened from the exam-bank's 20: on this micro-map the yield drive brakes
  // to a stop at the mouth while the released cyclist is already easing past,
  // so the closest centre-to-centre gap sits ~22 m — 25 lets that count as the
  // "a real conflict existed" gate for the YIELDED_TO_PRIORITY commendation
  // (it gates ONLY the yield credit; the hook uses dangerRadiusM).
  conflictWindowM: 25,
};

/**
 * VU-01 — десен завой през велосипедист.
 *
 * CITATION CORRECTED 2026-08-03: this cited „чл. 119а", which does not exist —
 * ЗДвП has чл. 119 and nothing suffixed after it. The duty is:
 *   чл. 25, ал. 1: водачът, който ще предприеме маневра… „преди да започне
 *     маневрата, трябва да се убеди, че няма да създаде опасност за участниците
 *     в движението, които се движат след него, преди него или минават покрай
 *     него";
 *   чл. 35, ал. 2: завиващият надясно „е длъжен да пропусне пътните превозни
 *     средства, преминаващи от дясната му страна";
 *   чл. 5, ал. 2, т. 1: водачът е длъжен „да бъде внимателен и предпазлив към
 *     уязвимите участници в движението, каквито са пешеходците и водачите на
 *     двуколесни пътни превозни средства".
 * Same three the content bank uses (q-predimstvo-062, q-uyazvimi-011/063).
 */
export const SC_VU_CYCLIST_HOOK: ScenarioSpec = {
  id: "sc-vu-cyclist-hook",
  family: "vru",
  tagsBg: ["велосипедист", "десен завой", "мъртва зона", "уязвими участници"],
  titleBg: "Десен завой през велосипедист",
  objectiveBg:
    "Преди десен завой провери огледалото и мъртвата зона отдясно: движещият се покрай бордюра велосипедист продължава направо и има предимство — пропусни го и завий чак когато е преминал.",
  archetypeIds: ["VU-01"],
  conceptIds: ["c-cyclists", "c-priority-concept", "c-mirrors-blind-spots"],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in vu-cyclist-v1.json meta.scenario.params
    // (tools/maps/gen_vu_cyclist.mjs).
    params: { control: "none", throughArmM: 130, stemArmM: 90, throughMaxKmh: 50, stemMaxKmh: 50 },
    districtId: "vu-cyclist-v1",
  },
  start: {
    spawnPointId: "vu-spawn-west",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в дясната лента по правата улица към кръстовището." },
    {
      n: 2,
      textBg:
        "Ще завиваш надясно по страничната улица. Още преди завоя провери дясното огледало и погледни през дясното рамо в мъртвата зона.",
    },
    {
      n: 3,
      textBg:
        "Покрай бордюра се движи велосипедист, който продължава направо — той има предимство. Намали и го пропусни да отмине устието на кръстовището.",
    },
    {
      n: 4,
      textBg:
        "Завий надясно едва когато велосипедистът е преминал и е чист — не завивай пред него и не се опитвай да го изпревариш в завоя.",
    },
    { n: 5, textBg: "Влез плавно в страничната улица и продължи по нея." },
  ],
  success: [
    {
      id: "sc-vu-approach",
      titleBg: "Приближи завоя с готовност да пропуснеш",
      // Pre-junction checkpoint on the eastbound lane, ~22 m before vu-n-c:
      // arriving slowly is the yield-setup skill (VU-01).
      params: { kind: "reachZone", x: -22, y: THROUGH_LANE_Y, radiusM: 9, maxSpeedKmh: 35 },
    },
    {
      id: "sc-vu-turned",
      titleBg: "Завий надясно, след като велосипедистът е преминал",
      // Down the south stem after the turn — reachable ONLY from a completed
      // right turn (a car continuing east never nears y = −45).
      params: { kind: "reachZone", x: STEM_LANE_X, y: -45, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 70 },
  // RECORDED (S3 batch 6): committed deterministic recordings of the authored
  // scripts in traces/scVuCyclist.ts; the §5 gate (shadow replays with ZERO
  // violations + YIELDED_TO_PRIORITY) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-vu-cyclist-hook-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-cyclist-hook/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-cyclist-hook/mistake-hook.trace.json" },
      titleBg: "Завой пред велосипедиста",
      whatWentWrongBg:
        "Колата зави надясно точно докато велосипедистът беше плътно вдясно и още не беше преминал — класическият „десен капан“. Велосипедистът, който се движи направо покрай бордюра, има предимство; завиването пред него е непропускане на участник с предимство.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-cyclist-hook/mistake-no-look.trace.json" },
      titleBg: "Завой без оглеждане на мъртвата зона",
      whatWentWrongBg:
        "Водачът зави надясно само с поглед в огледалото за обратно виждане — дясната мъртва зона остана непроверена, а точно там се движеше велосипедистът, и колата му отряза пътя. Велосипедистът направо има предимство; един поглед през дясното рамо преди завоя предотвратява десния капан.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      // THE PICTURE-TRUE right hook (founder brief, 2026-07-28). Demos 0 and 1
      // grade the fault correctly but, measured against the staged rider, pass
      // BEHIND it: the cyclist is 5–7 m ahead through the whole turn and holds a
      // flat 3.00 m/s from release to the last frame — nothing on screen argues
      // the lesson. This demo cuts ACROSS the rider's line and lands in front of
      // it, so playerGuard brakes the cyclist from 3.00 m/s to a standstill with
      // 4.26 m of clearance still between them (no contact — the founder's
      // near-miss-over-crash ruling, the train-reel precedent). Same single
      // graded code as its siblings; the trace gate pins the braking.
      traceRef: { path: "content/traces/sc-vu-cyclist-hook/mistake-forced-brake.trace.json" },
      titleBg: "Отрязване на велосипедиста в завоя",
      whatWentWrongBg:
        "Колата застигна велосипедиста и вместо да го изчака, зави надясно пред него — отряза пътя му точно преди устието на кръстовището. Велосипедистът, който се движи направо, трябваше да спре рязко, за да не се удари в завиващата кола. Праволинейно движещият се велосипедист има предимство: десният завой се прави чак след като той премине.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "При всеки десен завой в града, където покрай бордюра може да има велосипедист — на кръстовище, на изход от булевард, покрай велоалея. Велосипедистът често е точно в мъртвата зона отдясно.",
    whyBg:
      "Десният завой през велосипедист е сред най-честите и най-тежките градски произшествия с уязвими участници — колелото няма ламарина около себе си. Велосипедистът, който се движи направо, е бърз и нисък и лесно изчезва в мъртвата зона; един поглед през рамото преди завоя го спасява.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа: проверка на дясното огледало и рамо преди десен завой, осезаемо намаляване и пропускане на движещия се направо велосипедист, завиване едва когато е чист. Завиване пред велосипедиста или контакт с него е опасна грешка.",
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
  staged: [VU_CYCLIST],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2. sc-vu-emergency — „Линейка отзад" (VU-09) on ln-v1 (400 m 2+2 boulevard,
//    limit 50 — the sc-lane-change map, reused: a plain straight multi-lane
//    street is exactly where the rear siren drill lives)
// ---------------------------------------------------------------------------

/** ln-v1 lane centers (meta.scenario; pinned by value — the L7 pattern). */
const EM_RIGHT = 12.19;

/**
 * The staged EMERGENCY VEHICLE on ln-v1: holds at the road start (15 m behind
 * the spawn), RELEASES the moment the ghost pulls its 15 m lead (releaseGapM
 * 14) and runs the boulevard northbound up to ~68 km/h (special-regime
 * exemption) DEAD-CENTRE in the LEFT lane — x = 4.06 (right lane − 8.125 m, the
 * exact one-drawn-lane offset validated by world/__tests__/ln-district.test.ts).
 * The left lane IS the EV's чл. 91 corridor: the shadow driver keeps to the
 * RIGHT lane (out of it) and the mistake ghosts sit IN it, so the ambulance is
 * visibly blocked behind an unyielding car in its OWN lane (founder taste-pass,
 * doc 66 R0).
 *
 * RENDER TASTE-PASS (founder round: „the ambulance is nowhere near the car").
 * The old releaseGapM 38 held the EV dormant until the ghost was 38 m ahead,
 * then launched it from a standstill while the ghost was already at cruise — so
 * the gap BLEW OUT to ~68 m before the EV could close, and the clip opened on a
 * distant speck that read as an empty road. Two changes pin it to the ghost's
 * tail for the WHOLE clip instead: (1) release at 14 m (the EV rolls the instant
 * the ghost takes its lead, never falling back); (2) accelMps2 2.2 — the EV's
 * ramp is held to the ghost's own launch pace (recorder SCRIPT_ACCEL), so an
 * early-released EV rides ~15 m off the ghost's bumper through the slow launch
 * INSTEAD of surging past it. That surge was also a GRADING trap: an EV that
 * out-accelerates the still-slow ghost arms the yield duty while the ghost is
 * under the make-way threshold, and the runner reads the slow launch as a yield
 * (EMERGENCY_NOT_YIELDED never fires). Matching the ramp arms the duty only once
 * the ghost is at cruise, in the corridor, refusing — so the fault convicts AND
 * the ambulance is a close, constant tail on screen (playerGuard pins it ~15 m
 * back against the un-yielding ghost, its own lane, lights on).
 *
 * The EmergencyApproachRunner adjudicates (prioritySituation "emergency"): a
 * rightward shift ≥ 0.8 m, slowing to ≤ 38 km/h while keeping right, or
 * standing inside the generous 7 s window = made way; a window that expires
 * with the car still in the corridor at speed = EMERGENCY_NOT_YIELDED.
 */
const EM_APPROACH: EmergencyApproachSpec = {
  id: "sc-vue-approach",
  kind: "emergencyApproach",
  libraryEventId: "ev-emergency-vehicle",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 0 }, // y = 0 — 15 m behind ln-spawn-start
    cruiseSpeedMps: 19, // ~68 km/h: the EV runs above the 50 limit (чл. 91)
    accelMps2: 2.2, // held to the ghost's launch ramp — ride its tail, don't surge past it
    extraRightOffsetM: -8.125, // dead-centre the LEFT lane (x = 4.06) — the EV's own corridor
    colorIndex: 0,
    profile: "emergency", // white rig + blue light bar (ADR-001 fictional)
  },
  releaseGapM: 14, // roll the instant the ghost takes its 15 m lead — no dormant blow-out
  armBehindM: 60,
  responseWindowSec: 7,
  yieldShiftM: 0.8,
  yieldSlowKmh: 38, // ~12 under the posted 50
  passAheadM: 18,
  clearSpeedMps: 21,
};

/**
 * VU-09 — линейка отзад (ЗДвП чл. 91: при подадени светлинен и звуков сигнал
 * от автомобил със специален режим на движение водачите са длъжни незабавно
 * да му направят път — отдръпване вдясно и при нужда намаляване/спиране, без
 * блокиране на коридора му).
 */
export const SC_VU_EMERGENCY: ScenarioSpec = {
  id: "sc-vu-emergency",
  family: "vru",
  tagsBg: ["линейка", "специален режим", "направи път", "огледала"],
  titleBg: "Линейка отзад",
  objectiveBg:
    "Зад теб приближава автомобил със специален режим — синя лампа и сирена. Направи му път незабавно: провери огледалото, мигач надясно, отдръпни се към десния край и намали, докато премине. Не спирай рязко в лентата и не блокирай коридора му.",
  archetypeIds: ["VU-09"],
  conceptIds: ["c-emergency-priority", "c-special-regime-vehicles", "c-mirrors-blind-spots"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in ln-v1.json meta.scenario.params
    // (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по булеварда в дясната лента и се установи на спокойна скорост." },
    {
      n: 2,
      textBg:
        "Поглеждай периодично в огледалото за обратно виждане — синята лампа се вижда там, преди сирената да е оглушителна.",
    },
    {
      n: 3,
      textBg:
        "Зад теб приближава линейка. Мигач надясно и плавно се отдръпни към десния край на лентата — коридорът ѝ минава отляво.",
    },
    {
      n: 4,
      textBg:
        "Намали, докато премине — без рязко спиране в лентата. Не ускорявай и не се мести наляво: това блокира пътя ѝ.",
    },
    { n: 5, textBg: "Щом линейката отмине, върни се плавно в средата на лентата и продължи." },
  ],
  success: [
    {
      id: "sc-vue-made-way",
      titleBg: "Отдръпни се вдясно и пропусни линейката",
      // Mid-boulevard checkpoint in the RIGHT lane, at yield pace — passing it
      // slowly and to the right is the make-way posture itself.
      params: { kind: "reachZone", x: EM_RIGHT, y: 180, radiusM: 8, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vue-finish",
      titleBg: "Продължи до края на отсечката",
      params: { kind: "reachZone", x: EM_RIGHT, y: 355, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 75 },
  // RECORDED (ADR-006 stage 1b): committed deterministic recordings of the
  // authored scripts in traces/scVuEmergency.ts; the §5 gate (shadow replays
  // with ZERO violations + YIELDED_TO_PRIORITY) and the §9 stage-5 code
  // asserts run in traces/__tests__/sc-vu-emergency-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-emergency/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-emergency/mistake-block.trace.json" },
      titleBg: "Блокиране на линейката",
      whatWentWrongBg:
        "Колата остана в лявата лента — точно в коридора на линейката — с непроменена скорост, докато линейката висеше плътно зад нея, в същата лента, със сирена. Законът е категоричен: при специален режим си длъжен НЕЗАБАВНО да направиш път — прибиране вдясно и намаляване. Оставането в коридора ѝ е непропускане на автомобил със специален режим (чл. 91).",
      codeRefs: ["EMERGENCY_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-emergency/mistake-speed-up.trace.json" },
      titleBg: "Ускоряване пред линейката",
      whatWentWrongBg:
        "Вместо да се прибере вдясно, водачът даде газ и остана в лявата лента — „да избяга напред“ пред линейката. Точно обратното на дълга: лявата лента Е коридорът на линейката, а надбягването с нея само удължава блокирането. Прави се път вдясно, с намаляване — не се бяга напред (чл. 91).",
      codeRefs: ["EMERGENCY_NOT_YIELDED"],
    },
  ],
  teach: {
    whenBg:
      "Винаги когато чуеш сирена или видиш синя/червена лампа в огледалото — линейка, пожарна, полиция. Дългът е един и същ навсякъде: в града, на булевард, на кръстовище — незабавно освобождаваш коридора им.",
    whyBg:
      "Всяка секунда закъснение на линейката е секунда от нечий живот. Паникьосаното рязко спиране в лентата е също толкова опасно, колкото и инатливото блокиране — линейката разчита на предвидимо, решително отдръпване вдясно. Немската „спасителна алея“ е същият рефлекс, издигнат в система.",
    lawRef: "ЗДвП чл. 91",
    examinerBg:
      "Изпитващият гледа: навременно забелязване (огледала), решително и плавно отдръпване към десния край с мигач, намаляване без рязко спиране и продължаване чак след като автомобилът със специален режим премине. Блокирането на коридора му е опасна грешка.",
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
  staged: [EM_APPROACH],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3. sc-vu-emergency-junction — „Линейка на кръстовището" (VU-10) on tj-rhr-v1
//    (the sc-junction-rhr uncontrolled T, reused: the header documents WHY the
//    crossing EV rides the priorityFromRight machinery, not emergencyApproach)
// ---------------------------------------------------------------------------

/** tj-rhr-v1 drawn lane-center offset from the road centerline, m. */
const VUEJ_LANE = 4.0625;

/**
 * The staged EMERGENCY VEHICLE on tj-rhr-v1: holds on the east arm, then
 * crosses the equal T-junction from the player's RIGHT (east arm → west arm,
 * straight through), timed by the priorityFromRight runner against the
 * player's approach up the stem — the sc-junction-rhr recipe (negative
 * leadSec: the EV reaches the node ~3.5 s AFTER the player's projected
 * line-crossing, so a barging player crosses its path with the conflict still
 * inbound, while a yielding player watches it flash through). profile
 * "emergency" renders the white special-regime rig with the blue light bar
 * (ADR-001 fictional); junctionControl "uncontrolled" — the runtime's OWN
 * right-hand-rule tracker adjudicates (FAILED_TO_YIELD / YIELDED_TO_PRIORITY),
 * the runner only records the outcome. Faster than the JU-01 civilian
 * (cruise 10 m/s, clear sprint 14) — an EV moves with urgency.
 */
const VU_EV_CROSSING: PriorityFromRightSpec = {
  id: "sc-vuej-ev",
  kind: "priorityFromRight",
  libraryEventId: "ev-emergency-vehicle",
  junction: { nodeId: "tj-n-c", x: 0, y: 0 },
  junctionControl: "uncontrolled",
  actor: {
    pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
    hold: { nodeIndex: 1, offsetM: -95 },
    cruiseSpeedMps: 10, // ~36 km/h through the box — EV urgency, still plausible
    colorIndex: 0,
    profile: "emergency", // white rig + blue light bar (ADR-001 fictional)
  },
  junctionNodeIndex: 1,
  armDistM: 70,
  leadSec: -3.5,
  lineDistM: 18,
  clearSpeedMps: 14,
};

/**
 * VU-10 — линейка през кръстовището (ЗДвП чл. 91: при светлинен и звуков
 * сигнал от автомобил със специален режим водачите са ДЛЪЖНИ да го пропуснат
 * — включително когато иначе биха имали предимство; тук, на равнозначно
 * кръстовище, линейката идва и отдясно, чл. 50 — двойно нейното предимство).
 */
export const SC_VU_EMERGENCY_JUNCTION: ScenarioSpec = {
  id: "sc-vu-emergency-junction",
  family: "vru",
  tagsBg: ["линейка", "специален режим", "кръстовище", "направи път"],
  titleBg: "Линейка на кръстовището",
  objectiveBg:
    "Пропусни линейката със специален режим, която пресича кръстовището пред теб: чуеш ли сирена или видиш ли синя лампа, спри преди кръстовището и я изчакай да премине изцяло — линейката минава първа ВИНАГИ, независимо кой е с предимство.",
  archetypeIds: ["VU-10"],
  conceptIds: ["c-emergency-priority", "c-special-regime-vehicles", "c-priority-concept"],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in tj-rhr-v1.json meta.scenario.params
    // (tools/maps/gen_t_junction.mjs; map REUSED from sc-junction-rhr).
    params: {
      control: "none",
      priorityArmM: 150,
      minorArmM: 120,
      lanes: 2,
      priorityMaxKmh: 40,
      minorMaxKmh: 40,
    },
    districtId: "tj-rhr-v1",
  },
  start: {
    spawnPointId: "tj-spawn-south",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгни по страничната улица към кръстовището и намали отрано — ще завиваш наляво." },
    {
      n: 2,
      textBg:
        "Огледай пресечните посоки: отдясно приближава линейка със синя лампа — автомобил със специален режим.",
    },
    {
      n: 3,
      textBg:
        "Линейката минава първа — винаги. Дори светофар да ти дава зелено или пътят да е твой, чл. 91 е над реда на кръстовището.",
    },
    { n: 4, textBg: "Спри преди кръстовището и я изчакай да премине ИЗЦЯЛО — без да навлизаш и без да ѝ режеш коридора." },
    { n: 5, textBg: "Щом линейката е преминала и пътят е чист, завий наляво и продължи." },
  ],
  success: [
    {
      id: "sc-vuej-approach",
      titleBg: "Приближи кръстовището бавно и с готовност за спиране",
      // Stem lane center, just before the junction area (the JU-01 geometry).
      params: { kind: "reachZone", x: VUEJ_LANE, y: -30, radiusM: 8, maxSpeedKmh: 25 },
    },
    {
      id: "sc-vuej-cross",
      titleBg: "Премини кръстовището, след като линейката е преминала",
      // West-arm westbound lane center, past the 40 m junction area (the
      // right-hand-rule tracker commends on leaving it).
      params: { kind: "reachZone", x: -50, y: VUEJ_LANE, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED (ADR-006 stage 1c): committed deterministic recordings of the
  // authored scripts in traces/scVuEmergencyJunction.ts; the §5 gate (shadow
  // replays with ZERO violations + YIELDED_TO_PRIORITY) and the §9 stage-5
  // code asserts run in traces/__tests__/sc-vu-emergency-junction-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-emergency-junction/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-emergency-junction/mistake-barge.trace.json" },
      titleBg: "Навлизане пред линейката",
      whatWentWrongBg:
        "Колата навлезе в кръстовището с непроменена скорост, докато отдясно приближаваше линейка със сирена и синя лампа. Автомобилът със специален режим минава първи — задължението по чл. 91 е абсолютно, а тук линейката идва и отдясно. Навлизането пред нея е отнето предимство — опасна грешка, която на изпита прекратява всичко.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-emergency-junction/mistake-race.trace.json" },
      titleBg: "Надбягване със сирената",
      whatWentWrongBg:
        "Водачът чу сирената, прецени „ще мина преди нея“ и даде газ през кръстовището. Точно обратното на дълга: при сигнал от специален режим се спира и се чака, а не се спринтира — секундата, която „печелиш“, кара линейката да спира заради теб. Пресичането на пътя ѝ е непропускане на автомобил с предимство (чл. 91).",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всяко кръстовище, когато чуеш сирена или видиш синя/червена лампа — линейка, пожарна, полиция. Правилото не зависи от реда на кръстовището: и на зелено, и с предимство, автомобилът със специален режим минава пръв.",
    whyBg:
      "Кръстовището е най-честото място за удар с линейка: водачът гледа „своя“ ред — светофара, знака, дясното — и изключва ушите си. Сирената се чува секунди преди лампата да се види; който при сирена автоматично сваля газта и оглежда пресечните посоки, никога не се среща с линейка в кръстовището.",
    lawRef: "ЗДвП чл. 91",
    examinerBg:
      "Изпитващият гледа: реакция на сирената още при приближаването (намаляване, оглеждане), решително спиране преди кръстовището, изчакване линейката да премине изцяло и чак тогава продължаване. Навлизане пред автомобил със специален режим е опасна грешка.",
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
  staged: [VU_EV_CROSSING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4. sc-vu-pass-clearance — „Изпреварване на велосипедист" (VU-02) on
//    vu-pass-v1 (360 m junction-free 1+1 street; the header documents WHY the
//    staged cyclist rides the cyclistRightHook kind as a plain cruise recipe)
// ---------------------------------------------------------------------------

/** vu-pass-v1 northbound lane center (0.5 drawn lane east — the L7 pattern). */
const VUP_LANE_X = 4.06;
/** The cyclist's curb line: lane center + extraRightOffsetM 2.6 → x ≈ 6.66.
 *  Pass-geometry honesty (runtime VULNERABLE_PASS_* doc): center-to-center
 *  lateral carries ~1.25 m of bodies, so the clean line x 2.2 gives 4.46 m of
 *  centers ≈ 3.2 m of air (≥ the 1.5 m norm), while the squeeze line x 4.3
 *  gives 2.36 m of centers ≈ 1.1 m of air — inside the convict band, still
 *  0.16 m clear of the runner's 2.2 m contact radius. */
const VUP_CYCLIST_X = 6.66;

/**
 * The staged CYCLIST on vu-pass-v1: rides the east curb northbound the whole
 * street at a city-cyclist ~11 km/h. REUSED cyclistRightHook kind (NO new
 * actor type — the N8 mandate): the "junction" is the far end node the driver
 * never turns right at, so the runner contributes only the release
 * choreography + the collision(cyclist) contact channel; releaseDistM 360
 * exceeds the spawn's ~345 m node distance, so the cyclist cruises from the
 * first frame (no hold theater on an empty street). The GRADING is the
 * runtime's vulnerable-pass tracker.
 */
const VU_PASS_CYCLIST: CyclistRightHookSpec = {
  id: "sc-vup-cyclist",
  kind: "cyclistRightHook",
  libraryEventId: "ev-cyclist",
  junction: { nodeId: "vup-n-end", x: 0, y: 360 },
  actor: {
    pathNodes: ["vup-n-start", "vup-n-end"],
    hold: { nodeIndex: 1, offsetM: -250 }, // y = 110 — ~95 m ahead of the spawn
    cruiseSpeedMps: 3.0,
    extraRightOffsetM: 2.6, // the curb line (tags the proxy as a cyclist, A11)
    colorIndex: 1,
  },
  junctionNodeIndex: 1,
  releaseDistM: 360,
  dangerRadiusM: 9, // inert here — no right turn exists on this street
  conflictWindowM: 25,
};

/**
 * VU-02 — тясно изпреварване на колело (ЗДвП чл. 42: изпреварваш велосипедист
 * само с достатъчно СТРАНИЧНО РАЗСТОЯНИЕ и намалена скорост; учи се ~1,5 м
 * въздух — bank-verified: q-uyazvimi-010/012/045 ground the duty at чл. 42).
 * Graded by the runtime vulnerable-pass tracker: convict < ~1.2 m of air,
 * teach band 1.2–1.5 m (silent — honest grace), ≥ 1.5 m earns the yielded
 * commendation.
 */
export const SC_VU_PASS_CLEARANCE: ScenarioSpec = {
  id: "sc-vu-pass-clearance",
  family: "vru",
  tagsBg: ["велосипедист", "странична дистанция", "изпреварване", "уязвими участници"],
  titleBg: "Изпреварване на велосипедист",
  objectiveBg:
    "Покрай десния бордюр се движи велосипедист. Изпревари го с широка дъга — поне метър и половина въздух между вас: огледало, мигач наляво, отмести се осезаемо и се прибери чак когато е далеч зад теб.",
  archetypeIds: ["VU-02"],
  conceptIds: ["c-cyclists", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vu-pass-v1.json meta.scenario.params
    // (tools/maps/gen_vu_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50, variant: "pass" },
    districtId: "vu-pass-v1",
  },
  start: {
    spawnPointId: "vup-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и се установи на спокойна градска скорост." },
    {
      n: 2,
      textBg:
        "Пред теб, покрай десния бордюр, кара велосипедист. Не се залепяй зад него — прецени отрано откъде ще минеш.",
    },
    {
      n: 3,
      textBg:
        "Огледало, мигач наляво и се отмести осезаемо наляво — целта е поне метър и половина въздух между теб и колелото.",
    },
    {
      n: 4,
      textBg:
        "Подмини го спокойно, без да ускоряваш рязко до него — велосипедистът може да се отклони внезапно заради дупка или вятър.",
    },
    { n: 5, textBg: "Прибери се плавно вдясно чак когато велосипедистът е изцяло зад теб, и продължи." },
  ],
  success: [
    {
      id: "sc-vup-pass",
      titleBg: "Изпревари велосипедиста с широка дъга",
      // Post-pass checkpoint back in the lane, ~60 m past where the pass lands.
      params: { kind: "reachZone", x: VUP_LANE_X, y: 210, radiusM: 9 },
    },
    {
      id: "sc-vup-finish",
      titleBg: "Продължи до края на отсечката",
      params: { kind: "reachZone", x: VUP_LANE_X, y: 300, radiusM: 9 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED (N8 slice 1): committed deterministic recordings of the authored
  // scripts in traces/scVuPass.ts; the §5 gate (shadow replays with ZERO
  // violations + YIELDED_TO_PRIORITY from the clean pass) and the §9 stage-5
  // code asserts run in traces/__tests__/sc-vu-pass-clearance-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-pass-clearance/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-pass-clearance/mistake-squeeze.trace.json" },
      titleBg: "Провиране покрай велосипедиста",
      whatWentWrongBg:
        "Колата се провря покрай велосипедиста на около метър въздух, без изобщо да смени линията си. Законът изисква ДОСТАТЪЧНА странична дистанция (чл. 42) — учи се метър и половина: на метър всяко клатушкане на колелото е сблъсък, а велосипедистът се отклонява без предупреждение.",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-pass-clearance/mistake-fast-close.trace.json" },
      titleBg: "Бързо изпреварване с късно отместване",
      whatWentWrongBg:
        "Водачът се отмести едва в последния миг и профуча плътно покрай велосипедиста с непроменена скорост. Дъгата се строи ОТРАНО — късното отместване оставя същия половин метър въздух, само че при два пъти по-висока скорост: по-малко време за реакция и по-силен въздушен тласък върху колелото (чл. 42).",
      codeRefs: ["VULNERABLE_PASS_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато изпреварваш велосипедист, тротинетка или каруца в града и извън него — включително когато „само ще го подминеш“ в собствената си лента. Широката дъга важи и при пресичане на осевата, ако е прекъсната и насрещното е чисто.",
    whyBg:
      "Притиснатият велосипедист няма ламарина и няма втори шанс: дупка, шахта или порив на вятъра го отклоняват с метър встрани за миг. Дистанцията, която оставяш, е точно резервът за това отклонение — затова се учи метър и половина, а не „колкото се събере“.",
    lawRef: "ЗДвП чл. 42",
    examinerBg:
      "Изпитващият гледа: навременна преценка (без залепяне зад колелото), огледало и мигач преди отместването, осезаема широка дъга с намалена скорост и плавно прибиране чак след като велосипедистът е чист. Провирането на по-малко от метър е грешка.",
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
  staged: [VU_PASS_CYCLIST],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5. sc-vu-door-zone — „Зоната на вратата" (VU-04) on vu-door-v1 (300 m 1+1
//    street + occupied parallel row on the east curb + М1 span over the row;
//    the header documents the door's timed-obstacle design + scene descope)
// ---------------------------------------------------------------------------

/** vu-door-v1 northbound lane center. */
const VUD_LANE_X = 4.06;
/** The door-zone DISCIPLINE line: ~1.2 m west of the lane center — the car's
 *  right flank rides ≈ 2.3 m off the parked row (a full door width + margin).
 *  Pinned with the row (bays x 6.75, parked-rect flank x 5.85) by the
 *  vu-streets district battery. */
const VUD_CLEAR_X = 2.6;

/**
 * VU-04 — вратата / the door zone (driver side: ЗДвП чл. 20 — контрол и
 * готовност за спиране покрай редица паркирани коли; bank-verified:
 * q-uyazvimi-056 grounds exactly the parked-row precautions at чл. 20. The
 * OPENER's duty — чл. 95, не отваряй врата, ако застрашаваш някого — lives in
 * the copy: the graded lesson is the DRIVER's positioning). The door itself
 * is a TIMED trace obstacle (ObstacleRect2D.trigger, pinned in
 * traces/scVuDoorZone.ts); the live scene mounts the hittable parked row from
 * meta.scenario.bays but NO door prop (documented descope — the demos and the
 * copy carry the ambush).
 */
export const SC_VU_DOOR_ZONE: ScenarioSpec = {
  id: "sc-vu-door-zone",
  family: "vru",
  tagsBg: ["паркирани коли", "врата", "странична дистанция", "градско каране"],
  titleBg: "Зоната на вратата",
  objectiveBg:
    "Минаваш покрай плътна редица паркирани коли. Дръж поне една отворена врата разстояние от тях и намали — вратата се отваря без предупреждение, а между колите може да излезе пешеходец.",
  archetypeIds: ["VU-04"],
  conceptIds: ["c-general-care-duty", "c-leaving-vehicle-safely"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vu-door-v1.json meta.scenario.params
    // (tools/maps/gen_vu_streets.mjs).
    params: {
      lengthM: 300,
      maxspeedKmh: 40,
      variant: "door",
      banFromM: 90,
      banToM: 240,
      parkedRowXM: 6.75,
    },
    districtId: "vu-door-v1",
  },
  start: {
    spawnPointId: "vud-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — напред вдясно започва дълга редица паркирани коли." },
    {
      n: 2,
      textBg:
        "Още преди редицата се отмести наляво в своята лента: дръж поне една отворена врата разстояние от паркираните коли.",
    },
    {
      n: 3,
      textBg:
        "Намали и гледай КРАЙ колите, не само пътя: крака под браниците, сенки между колите, светнали стопове, глава зад волана.",
    },
    {
      n: 4,
      textBg:
        "Ако врата се отвори пред теб, спокойно продължи по линията си — дистанцията, която държиш, Е спасението; не свивай рязко в насрещното.",
    },
    { n: 5, textBg: "След края на редицата се върни плавно към средата на лентата и продължи." },
  ],
  success: [
    {
      id: "sc-vud-row",
      titleBg: "Подмини вратата по своята линия — без да излизаш в насрещното",
      /**
       * THE GATE THAT MEASURES WHAT ITS TITLE PROMISES (doc 87, 2026-08-09).
       *
       * This was `(2.6, 175) r 6, ≤40` and it was titled „премини покрай
       * редицата с дистанция от вратите". It measured neither half of that.
       * A radius-6 disc on an 8.125 m lane accepts x ∈ [−3.4, 8.6]: the whole
       * carriageway, the ONCOMING bank past the М1, and the door swing itself.
       * And it sat at y = 175 — nineteen metres PAST the door at y = 156,
       * which is the one place on this street where the student's line is the
       * lesson.
       *
       * It was found by the Наредба № 38 re-baseline: `CROSSED_SOLID_LINE` was
       * carrying an unlawful 10-point опасна charge, and when that came off,
       * the „рязко избягване през непрекъснатата линия" mistake demo PASSED
       * the drill — it dives to x = −1.2 across the осева, comes back, and
       * ticks every gate the template authored. The severity had been doing
       * the objectives' job; the drill never encoded „не пресичай осевата" at
       * all. `s10-vru-pack-bot-completion.test.ts` pinned that hole on purpose
       * so that closing it would go red here.
       *
       * Closed by moving the gate ONTO the door and shrinking it to the band
       * the lesson actually teaches. At (2.6, 156) r 2.2 the acceptance is
       * x ∈ [0.4, 4.8]:
       *   left bound  — right of the М1 осева at x = 0: the swerve is out.
       *   right bound — 1.05 m clear of the parked flank at x = 5.85: the hug
       *                 line at 4.6 is still inside (it fails on the door it
       *                 hits, which is ITS honest code), but a car any further
       *                 over is in the swing.
       * Measured against the three committed drives at y = 156: shadow 0.00 m
       * off centre, hug 2.00, swerve 3.7+ — and the L1 ladder widens 2.2 to
       * 3.3, still short of the swerve. No `maxSpeedKmh`: a cap would arm the
       * evaluator's grace CAPSULE, and this gate is about lateral position, the
       * one thing a capsule stretched down the approach must not forgive. The
       * pace contract moved to the finish gate below, where it costs nothing.
       */
      params: { kind: "reachZone", x: VUD_CLEAR_X, y: 156, radiusM: 2.2 },
    },
    {
      id: "sc-vud-finish",
      titleBg: "Върни се плавно в средата на лентата и продължи до края",
      // The row's pace contract lives here now (see sc-vud-row): past the row
      // the street is straight and empty, so a cap is a pace check rather than
      // a position trap, and the terminal gate is where the evaluator's grace
      // capsule is designed to be forgiving.
      params: { kind: "reachZone", x: VUD_LANE_X, y: 270, radiusM: 9, maxSpeedKmh: 40 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED (N8 slice 1): committed deterministic recordings of the authored
  // scripts in traces/scVuDoorZone.ts; the §5 gate (shadow replays with ZERO
  // violations while the door opens harmlessly beside it) and the §9 stage-5
  // code asserts run in traces/__tests__/sc-vu-door-zone-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vu-door-zone/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vu-door-zone/mistake-hug.trace.json" },
      titleBg: "Каране плътно до паркираните коли",
      whatWentWrongBg:
        "Колата се движеше на педя от паркираната редица и когато врата се отвори пред нея, нямаше нито време, нито място — удар. „Зоната на вратата“ е около метър от всяка паркирана кола: който кара в нея, залага на това, че никой няма да отвори. Дистанцията се държи ПРЕДВАРИТЕЛНО (чл. 20).",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-door-zone/mistake-swerve.trace.json" },
      titleBg: "Рязко избягване през непрекъснатата линия",
      whatWentWrongBg:
        "Водачът караше плътно до редицата и когато вратата се отвори, сви рязко в насрещната лента — през непрекъснатата осева линия. Избегна вратата, но размени един риск за по-голям: насрещното платно зад М1 не е изход. Правилният отговор се взема ПРЕДИ редицата — дистанция, която прави маневрата излишна (чл. 20).",
      codeRefs: ["CROSSED_SOLID_LINE"],
    },
  ],
  teach: {
    whenBg:
      "По всяка градска улица с паркирани коли покрай бордюра — особено до училища, магазини и вечер, когато хората се прибират по колите си. Същата дисциплина пази и велосипедистите: те загиват точно в зоната на вратата.",
    whyBg:
      "Вратата се отваря за половин секунда и спира кола, дете или велосипедист. Никаква реакция не компенсира липсващия метър — единствената работеща защита е позицията: една отворена врата разстояние от редицата и намалена скорост. Затова водачът, който слиза, е длъжен да огледа (чл. 95), а водачът, който минава — да е извън обсега на вратата (чл. 20).",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият гледа: навременно отместване от паркираната редица (без да пресичаш непрекъснатата осева), намалена скорост и активно наблюдение на колите — стопове, глави, движение между браниците. Каране на педя от редицата е рискова позиция.",
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
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The VRU-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_VRU: readonly ScenarioSpec[] = [
  SC_VU_CYCLIST_HOOK,
  SC_VU_EMERGENCY,
  SC_VU_EMERGENCY_JUNCTION,
  SC_VU_PASS_CLEARANCE,
  SC_VU_DOOR_ZONE,
];
