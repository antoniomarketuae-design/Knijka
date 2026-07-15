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

/** The cockpit-procedure-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_COCKPIT: readonly ScenarioSpec[] = [SC_VP_READINESS];
