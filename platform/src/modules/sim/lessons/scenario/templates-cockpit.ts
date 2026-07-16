/**
 * Scenario templates — the COCKPIT-PROCEDURE family (doc 72 §3 „Family VP —
 * Vehicle procedure & cockpit discipline"): ONE ✅ FULL readiness template that
 * rides the recorder's cockpit-state channels (headlights/seatbelt/handbrake —
 * committed de3c33a), DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district file so nothing loads world JSON at
 * runtime; the trace-gate battery asserts every pinned value against the map):
 *
 *  - sc-vp-readiness  „Готовност преди тръгване"  (VP-02 belt + VP-05 handbrake,
 *                     vp-ready-v1)
 *
 * ONE template, TWO DISTINCT codes (the sc-ov-lane-keeping precedent): the
 * shadow buckles up, releases the handbrake and drives clean; each mistake demo
 * flips ONE cockpit channel and cites a SHIPPED rules-catalog code, grading
 * EXACTLY it with NO extras when replayed through the production stack (the
 * §5/§9 gates, traces/__tests__/vp-readiness-traces.test.ts):
 *   - VP-02 → SEATBELT_OFF_WHILE_MOVING (основна: движение без колан — the belt
 *     detector, 1 s sustain while moving);
 *   - VP-05 → HANDBRAKE_LEFT_ON (второстепенна: движение с вдигната ръчна — the
 *     handbrake detector, 1.5 s sustain while moving).
 *
 * The map carries NO crossing, junction, signal or sign, ambient traffic is
 * ZERO (seed 7), the drives stay under the limit and centered in the lane and
 * the day is dry (lights off is lawful) — so the ONLY thing the rule engine can
 * grade is the flipped cockpit channel. The shadow earns the positive
 * CLEAN_DRIVING (a sustained violation-free streak).
 *
 * Family: "cockpit" — the catalog chip added for the VP family (types.ts +
 * ScenarioCatalog FAMILY_ICONS "🧰"); the id (sc-vp-readiness) matches the
 * sc-<topic>-<slug> naming standard and ID_RE.
 *
 * Doc-72 provenance: VP-02 and VP-05 are the "Engine: ✅ FULL" cockpit
 * archetypes gradable from the shipped belt/handbrake detectors. VP-01
 * (pre-drive ritual) already ships as the preDriveMode machine; VP-03/04/06/…
 * need a gear/stall/telltale channel or an actor and are 🟡 PARTIAL or 🔴 NEW —
 * left for later waves.
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constant (pinned from the generated district by value — the
// L7 pattern; the ac-vp-districts battery asserts the copy matches the map)
// ---------------------------------------------------------------------------

/** Right-lane center of vp-ready-v1 (1+1 street, drawn lane 8.125 m). */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// sc-vp-readiness — „Готовност преди тръгване" (VP-02 + VP-05) on vp-ready-v1
//    (360 m straight street, limit 50, dry day)
// ---------------------------------------------------------------------------

/** VP-02 / VP-05 — готовност на кокпита преди потегляне: колан поставен (ЗДвП
 *  чл. 137а) и ръчна спирачка свалена (ЗДвП чл. 20 — контрол над ППС). */
export const SC_VP_READINESS: ScenarioSpec = {
  id: "sc-vp-readiness",
  family: "cockpit",
  tagsBg: ["кокпит", "готовност преди тръгване", "предпазен колан", "ръчна спирачка"],
  titleBg: "Готовност преди тръгване",
  objectiveBg:
    "Приготви кокпита и потегли правилно: закопчан колан и свалена ръчна спирачка — двете действия, които всеки водач прави, преди колелата да се завъртят, и които изпитващият проверява първи.",
  archetypeIds: ["VP-02", "VP-05"],
  conceptIds: ["c-pre-drive-check", "c-seatbelts", "c-vehicle-controls"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in vp-ready-v1.json meta.scenario.params
    // (tools/maps/gen_ac_vp_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "vp-ready-v1",
  },
  start: {
    spawnPointId: "vp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Преди да потеглиш: закопчай предпазния колан — винаги, дори за 100 метра." },
    { n: 2, textBg: "Свали ръчната спирачка докрай — освобождаването ѝ е част от процедурата за потегляне." },
    { n: 3, textBg: "Потегли плавно по правата улица и дръж спокойна скорост под 50 км/ч." },
    { n: 4, textBg: "Ако усетиш, че колата тегли или дърпа встрани — спри и провери ръчната, не давай повече газ." },
    { n: 5, textBg: "Продължи с поставен колан и свалена ръчна до края на отсечката." },
  ],
  success: [
    {
      id: "sc-vpr-ready",
      titleBg: "Мини контролната зона с готов кокпит",
      params: { kind: "reachZone", x: LANE_X, y: 180, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vpr-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVpReadiness.ts; gates in traces/__tests__/vp-readiness-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-readiness/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-readiness/mistake-no-belt.trace.json" },
      titleBg: "Тръгване без колан",
      whatWentWrongBg:
        "Колата потегли с откопчан колан — „нали е близо“. Движението без предпазен колан е основна грешка (чл. 137а): при удар с 50 км/ч тялото без колан удря арматурата със сила колкото падане от третия етаж. Коланът се закопчава преди потеглянето, всеки път.",
      codeRefs: ["SEATBELT_OFF_WHILE_MOVING"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-readiness/mistake-handbrake.trace.json" },
      titleBg: "Тръгване с вдигната ръчна",
      whatWentWrongBg:
        "Колата потегли, без да е свалена ръчната спирачка — влачи се, спирачките прегряват, а на таблото свети предупредителна лампа. Освобождаването на ръчната е част от процедурата за потегляне; усетиш ли съпротивление, спри и провери, вместо да натискаш газта.",
      codeRefs: ["HANDBRAKE_LEFT_ON"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, преди да потеглиш — от паркинга, от банкета, на изпита. Готовността на кокпита е последното нещо преди движението: колан поставен, ръчна свалена, предавка избрана. Две секунди сега спестяват точки и рискове после.",
    whyBg:
      "Коланът и свалената ръчна не са формалност: коланът задържа тялото при удар (чл. 137а), а свалената ръчна пази спирачките от прегряване и колата от влачене. Пропускането им са двете най-чести кокпит грешки на изпита — и двете напълно избежими с един и същ навик преди потеглянето.",
    lawRef: "ЗДвП чл. 137а",
    examinerBg:
      "Изпитващият проверява точно тези действия, преди колата изобщо да е тръгнала: закопчан колан и свалена ръчна спирачка. Движението без колан е основна грешка, а потеглянето с вдигната ръчна — второстепенна; и двете се броят, ако колата тръгне без тях.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pk-move-off — „Потегляне от място без оглеждане" (doc 72 PK-05) on
//    vp-ready-v1 (map REUSED; the config-gated move-off-observation drill)
// ---------------------------------------------------------------------------

/** PK-05 — потегляне от място с оглеждане (ЗДвП чл. 25: преди навлизане в
 *  движението и всяка маневра водачът се убеждава, че няма да създаде опасност
 *  и няма да попречи на другите — огледало + поглед през рамо преди тръгване от
 *  банкета). Config-gated: the move-off-observation detector ships OFF and this
 *  drill opts it IN (ruleConfig below → the LIVE session grades the student too;
 *  the recorder passes the same override for the §9 code assert). */
export const SC_PK_MOVE_OFF: ScenarioSpec = {
  id: "sc-pk-move-off",
  family: "cockpit",
  tagsBg: ["потегляне от място", "оглеждане", "огледала", "мъртва зона", "изпитни упражнения"],
  titleBg: "Потегляне от място с оглеждане",
  objectiveBg:
    "Потегли от банкета правилно: преди да тръгнеш, погледни в огледалото и през лявото рамо в мъртвата зона — потеглянето от място е маневра и започва с оглеждане, не с газта.",
  // Doc-72 provenance: PK-05 IS this moment (move-off without observation —
  // DVSA move-off top-5; the BG изпит starts with потегляне от място).
  archetypeIds: ["PK-05"],
  conceptIds: ["c-mirrors-blind-spots", "c-maneuver-principles", "c-general-care-duty"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-vp-readiness — mirrored in vp-ready-v1.json
    // meta.scenario.params (tools/maps/gen_ac_vp_streets.mjs).
    params: { lengthM: 360, maxspeedKmh: 50 },
    districtId: "vp-ready-v1",
  },
  start: {
    spawnPointId: "vp-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Колата е спряла на банкета. Потеглянето от място е маневра — започва с оглеждане." },
    { n: 2, textBg: "Погледни в лявото огледало и прецени идва ли кола или колоездач отзад." },
    { n: 3, textBg: "Хвърли поглед и през ЛЯВОТО рамо — в мъртвата зона, която огледалото не показва." },
    { n: 4, textBg: "Чак когато е чисто, пусни мигач при нужда и потегли плавно в дясната лента." },
    { n: 5, textBg: "Продължи спокойно и центрирано по отсечката, под ограничението." },
  ],
  success: [
    {
      id: "sc-pmo-moved",
      titleBg: "Потегли и се нареди в дясната лента",
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 14 },
    },
    {
      id: "sc-pmo-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 310, radiusM: 14 },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkMoveOff.ts; the §5 gate (shadow replays ZERO violations +
  // CLEAN_DRIVING) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-pk-move-off-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-move-off/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-move-off/mistake-no-look.trace.json" },
      titleBg: "Потегляне без оглеждане",
      whatWentWrongBg:
        "Колата потегли от банкета, без нито едно оглеждане — „нали ще тръгна бавно“. Потеглянето от място е маневра (чл. 25): приближаващият отзад-отляво остана невидим до последно. Едно огледало и поглед през рамо преди тръгване спестяват челен удар отстрани.",
      codeRefs: ["MOVE_OFF_WITHOUT_OBSERVATION"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-move-off/mistake-curb-glance.trace.json" },
      titleBg: "Поглед само към бордюра",
      whatWentWrongBg:
        "Колата погледна само надясно, към тротоара, и потегли — но опасността при потегляне идва отзад и отляво, от движението. Оглеждането за потегляне е към огледалото и през ЛЯВОТО рамо; погледът към бордюра не замества мъртвата зона отляво.",
      codeRefs: ["MOVE_OFF_WITHOUT_OBSERVATION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато потегляш от място — от банкета, от паркинг, след спиране на пътник. Изпитът в града често започва точно с този момент: потегляне от място. Две секунди оглеждане преди газта решават всичко.",
    whyBg:
      "Потеглянето от място без оглеждане е сред най-честите причини за странични удари и за помитане на колоездач в мъртвата зона. Огледалото показва по-голямата част, но не и мъртвата зона зад лявото рамо — затова се гледа и през рамо, преди колелата да се завъртят.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият следи точно за това при потегляне от място: поглед в огледалото и през рамо в мъртвата зона, преди колата да тръгне. Потегляне без оглеждане е основна грешка — маневра без убеждаване, че е безопасно.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  // Config-gated drill: opt the move-off-observation detector IN so the LIVE
  // student session grades the taught fault (default-OFF elsewhere — see
  // rules/types.ts moveOffObservationEnabled). compileScenario propagates this
  // to the LessonSpec; the recorder passes the same override for the §9 assert.
  ruleConfig: { moveOffObservationEnabled: true },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The cockpit-procedure-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_COCKPIT: readonly ScenarioSpec[] = [SC_VP_READINESS, SC_PK_MOVE_OFF];
