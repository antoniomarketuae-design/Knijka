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
 * VU (the shipped cyclist proxy). VU-05/06 are 🟡 PARTIAL (recipe/world only)
 * and VU-02/03/04/07/08/09/10/11/12/13/14 are 🔴 NEW (lateral-clearance
 * detector, door-swing/bus/e-scooter/emergency actors) — skipped for later
 * waves.
 */

import type { CyclistRightHookSpec } from "../../contracts";
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

/** The VRU-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_VRU: readonly ScenarioSpec[] = [SC_VU_CYCLIST_HOOK];
