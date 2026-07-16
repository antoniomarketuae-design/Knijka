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
 * VU-05/06 stay 🟡 PARTIAL (recipe/world only) and VU-02/03/04/07/08/11/
 * 12/13/14 stay 🔴 NEW (lateral-clearance detector, door-swing/bus/e-scooter
 * actors) — later waves.
 */

import type {
  CyclistRightHookSpec,
  EmergencyApproachSpec,
  PriorityFromRightSpec,
} from "../../contracts";
import type { ScenarioSpec } from "./types";

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
 * VU-01 — десен завой през велосипедист (ЗДвП чл. 25 ал. 1: преди да завие
 * надясно водачът се убеждава, че няма да пресече пътя на движещ се вдясно от
 * него велосипедист; чл. 119а — велосипедистът по платното е участник с
 * предимство при праволинейно движение).
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
 * The staged EMERGENCY VEHICLE on ln-v1: holds dormant at the road start
 * (15 m behind the spawn), then runs the boulevard northbound at ~68 km/h
 * (special-regime exemption) offset 6.5 m LEFT of the right-lane center —
 * x ≈ 5.69, straddling the lane divider on the player's left edge, exactly
 * doc 72 VU-09's "closing-from-behind pathing on the player's edge". The
 * EmergencyApproachRunner adjudicates (prioritySituation "emergency"): a
 * rightward shift ≥ 0.8 m, slowing to ≤ 38 km/h while keeping right, or
 * standing at the curb inside the generous 7 s window = made way; a window
 * that expires with the car still centered at speed = EMERGENCY_NOT_YIELDED.
 */
const EM_APPROACH: EmergencyApproachSpec = {
  id: "sc-vue-approach",
  kind: "emergencyApproach",
  libraryEventId: "ev-emergency-vehicle",
  actor: {
    pathNodes: ["ln-n-start", "ln-n-end"],
    hold: { nodeIndex: 0, offsetM: 0 }, // y = 0 — 15 m behind ln-spawn-start
    cruiseSpeedMps: 19, // ~68 km/h: the EV runs above the 50 limit (чл. 91)
    extraRightOffsetM: -6.5, // LEFT of the right lane: passes on the player's edge
    colorIndex: 0,
    profile: "emergency", // white rig + blue light bar (ADR-001 fictional)
  },
  releaseGapM: 38,
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
        "Колата продължи по средата на лентата с непроменена скорост, докато линейката висеше зад нея със сирена. Законът е категоричен: при специален режим си длъжен НЕЗАБАВНО да направиш път — отдръпване вдясно и намаляване. Оставането в коридора ѝ е непропускане на автомобил със специален режим (чл. 91).",
      codeRefs: ["EMERGENCY_NOT_YIELDED"],
    },
    {
      traceRef: { path: "content/traces/sc-vu-emergency/mistake-speed-up.trace.json" },
      titleBg: "Ускоряване пред линейката",
      whatWentWrongBg:
        "Вместо да се отдръпне, водачът даде газ и се измести наляво — „да не му се пречка“. Точно обратното на дълга: лявата страна Е коридорът на линейката, а надбягването с нея само удължава блокирането. Прави се път вдясно, с намаляване — не се бяга напред (чл. 91).",
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
        "Чуваш сирена. Огледай се и я намери: отдясно приближава линейка със синя лампа — автомобил със специален режим.",
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
  ],
  staged: [VU_EV_CROSSING],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The VRU-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_VRU: readonly ScenarioSpec[] = [
  SC_VU_CYCLIST_HOOK,
  SC_VU_EMERGENCY,
  SC_VU_EMERGENCY_JUNCTION,
];
