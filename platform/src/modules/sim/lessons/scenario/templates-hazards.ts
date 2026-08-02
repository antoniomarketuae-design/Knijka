/**
 * Scenario templates — the HAZARDS family (doc 72 §10 OV-18 „Обект на платното
 * — заобикаляне / Obstacle swerve"). DATA ONLY in the templates.ts mold:
 * coordinates are denormalized from the committed hz-obstacle-v1 district
 * (tools/maps/gen_hazard_obstacle.mjs) so nothing loads world JSON at runtime;
 * the hz-obstacle battery asserts every pinned value against the generated map,
 * and the sc-hazard-obstacle trace gate replays the drives through the
 * production stack.
 *
 *  - sc-hazard-obstacle  „Заобикаляне на обект на платното"  (OV-18)
 *
 * The stalled obstacle sits curb-side of the driving line; the drawn lane is a
 * wide 8.125 m, so the correct pass EASES toward the centreline WITHIN the same
 * lane (no crossing into oncoming, laneId 0 throughout, offset under the
 * lane-keep tolerance) and clears it. A driver who holds the line, or who
 * swerves too late, contacts the obstacle → COLLISION (the sc-pk-smooth-stop
 * obstacle-rect machinery).
 *
 * Family: "hazards" — the doc-76 §2 hazard-avoidance chip (new to the catalog
 * with this template). Traces are RECORDED; the §5 gate + §9 stage-5 asserts run
 * in traces/__tests__/sc-hazard-obstacle-traces.test.ts (RECORD_TRACES=1).
 */

import type { ScenarioSpec } from "./types";
import { l5Wet } from "./complications";

/** Northbound right-lane center of hz-obstacle-v1. */
const LANE_X = 4.06;

/**
 * OV-18 — заобикаляне на обект на платното (ЗДвП чл. 25: преди маневра водачът
 * се убеждава, че няма да застраши останалите участници и я извършва плавно).
 */
export const SC_HAZARD_OBSTACLE: ScenarioSpec = {
  id: "sc-hazard-obstacle",
  family: "hazards",
  tagsBg: ["опасност", "обект на платното", "заобикаляне", "аварирал автомобил", "оглеждане"],
  titleBg: "Заобикаляне на обект на платното",
  objectiveBg:
    "Забележи навреме спрелия обект в твоята лента и го заобиколи плавно: широката лента дава място да се отклониш към средата, без да навлизаш в насрещното — с оглеждане, без рязко дърпане и без да го закачиш.",
  archetypeIds: ["OV-18"],
  conceptIds: ["c-hazard-perception", "c-animals-obstacles", "c-mirrors-blind-spots", "c-maneuver-principles"],
  map: {
    archetype: "straight-street",
    // Mirrored in hz-obstacle-v1.json meta.scenario.params (gen_hazard_obstacle.mjs).
    params: { lengthM: 240, maxspeedKmh: 50 },
    districtId: "hz-obstacle-v1",
  },
  start: {
    spawnPointId: "hz-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и гледай надалеч — напред, към бордюрната страна на лентата, стои аварирал автомобил." },
    { n: 2, textBg: "Забележи го отрано и намали — плавно, а не в последния момент." },
    { n: 3, textBg: "Огледай в огледалото за задно виждане, преди да се отклониш — заобикалянето също е маневра." },
    { n: 4, textBg: "Отклони се плавно към средата на своята лента — тук платното е широко и не се налага да навлизаш в насрещното." },
    { n: 5, textBg: "Задмини обекта, върни се плавно в средата на лентата и продължи." },
  ],
  success: [
    {
      id: "sc-obs-approach",
      titleBg: "Приближи обекта с контролирана скорост",
      params: { kind: "reachZone", x: LANE_X, y: 60, radiusM: 12, maxSpeedKmh: 46 },
    },
    {
      id: "sc-obs-cleared",
      titleBg: "Задмини обекта, без да го закачиш",
      // Past the obstacle (y = 130), back in the lane center.
      params: { kind: "reachZone", x: LANE_X, y: 178, radiusM: 12 },
    },
    {
      id: "sc-obs-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 220, radiusM: 10 },
    },
  ],
  rubric: { parTimeSec: 40 },
  shadow: { path: "content/traces/sc-hazard-obstacle/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-hazard-obstacle/mistake-hold-line.trace.json" },
      titleBg: "Задържане по линията",
      whatWentWrongBg:
        "Колата продължи право по линията на лентата, все едно обектът го няма, и се вряза в спрелия автомобил. Обект на платното иска ранно забелязване и плавно отклонение — а не надежда, че „ще се размине“.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-hazard-obstacle/mistake-late-swerve.trace.json" },
      titleBg: "Закъсняло отклонение",
      whatWentWrongBg:
        "Отклонението дойде в последния момент — рязко и твърде късно, така че предницата закачи ъгъла на обекта. Който забележи опасността отдалеч, има време за плавна маневра; който я види късно, вече няма избор.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всеки спрял обект в твоята лента — аварирал автомобил, изпуснат товар, ремонтна ограда. В града двойно спрелите доставни коли са ежедневие; заобикалянето им е маневра с всичките ѝ задължения.",
    whyBg:
      "Най-честата грешка е рефлекторното дърпане настрани без поглед назад и наляво — точно когато отзад или в съседната лента идва някой. Ранното забелязване превръща паниката в плавно, огледано отклонение; закъснялото я оставя без изход.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа: ранно забелязване и намаляване, поглед в огледалото преди отклонението, плавно заобикаляне без ненужно навлизане в насрещното и връщане в лентата след обекта. Закачане на обекта или рязко дърпане без оглеждане е тежка грешка.",
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
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The hazards templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_HAZARDS: readonly ScenarioSpec[] = [SC_HAZARD_OBSTACLE];
