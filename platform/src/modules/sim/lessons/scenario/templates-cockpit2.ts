/**
 * Scenario templates — the COCKPIT-PROCEDURE family, SECOND file (doc 76 §2
 * chip "cockpit"; templates-cockpit.ts holds VP-02/04/05/06/11 + PK-05):
 *
 *  - sc-vp-handbrake  „Потегляне с вдигната ръчна"  (VP-05 + PK-05, vp-ready-v1)
 *
 * MAP REUSED — vp-ready-v1, the committed 360 m 1+1 cockpit street
 * (tools/maps/gen_ac_vp_streets.mjs), already hosting sc-vp-readiness /
 * sc-pk-move-off / sc-vp-stall. DATA ONLY, the templates.ts mold: every
 * coordinate below is denormalized from the committed district file
 * (meta.scenario), so nothing loads world JSON at runtime; the district battery
 * (world/__tests__/ac-vp-districts.test.ts) and the trace gate assert every
 * pinned value against the generated map.
 *
 * WHY THE MAP GRADES THIS FOR FREE: vp-ready-v1 carries NO crossing, junction,
 * signal, sign or ban span, ambient traffic is ZERO (seed 7) and the day is dry
 * (lights off is lawful) — so with every drive centered on the lane and under
 * the posted 50, the ONLY things the rule engine can grade are the two cockpit
 * channels this drill is about: the handbrake and the move-off glance.
 *
 * DISTINCTNESS (the three cockpit drills on this street are three different
 * lessons, not three copies — the sc-ov-lane-keeping precedent):
 *   - sc-vp-readiness (VP-02+VP-05) teaches the RITUAL: belt and handbrake as
 *     the two things you do before the wheels turn, one demo each;
 *   - sc-pk-move-off (PK-05) teaches the OBSERVATION alone: what „оглеждане"
 *     means (mirror + left shoulder, not a curb glance);
 *   - THIS one (VP-05 first, PK-05 second) teaches the DIAGNOSIS: the two cues
 *     that betray a raised handbrake — the dashboard telltale that refuses to
 *     die and the car that drags instead of pulling — chained to the checklist
 *     step students skip once they are busy staring at the lamp. The pedagogy
 *     is the CHAIN: a cockpit check that ends at the dashboard is not finished;
 *     it ends at the mirror.
 *
 * CONFIG-GATED: the move-off-observation detector ships OFF (rules/types.ts
 * moveOffObservationEnabled — the A12 whole-commute pulls away from rest
 * unglanced by default), so this drill opts it IN (ruleConfig below →
 * compileScenario propagates it to the LessonSpec, so the LIVE student session
 * grades the taught fault too; the recorder passes the same override for the §9
 * code assert). The sc-pk-move-off / sc-junction-scan precedent.
 *
 * HONEST LIMIT (documented like sc-vp-police-stop's within-lane note): the
 * handbrake DRAG is narrative, not simulated — the trace recorder's movement
 * model is the C1 kinematic core, not physics (doc 76 trap 3), so a
 * handbrake-on drive covers the street exactly like a clean one. Nothing is
 * faked to hide that: the objectives below grade ROUTE COMPLETION only, the
 * telltale is the authored CUE, and the shipped HANDBRAKE_LEFT_ON detector (1.5
 * s of motion with the channel raised) is the sole grader of the fault. A
 * circular reachZone cannot honestly discriminate a cockpit channel.
 */

import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constant (pinned from the generated district by value — the
// L7 pattern; the ac-vp-districts battery asserts the copy matches the map)
// ---------------------------------------------------------------------------

/** Right-lane center of vp-ready-v1 (1+1 street, drawn lane 8.125 m). */
const LANE_X = 4.06;

// ---------------------------------------------------------------------------
// sc-vp-handbrake — „Потегляне с вдигната ръчна" (VP-05 + PK-05) on
//    vp-ready-v1 (360 m straight street, limit 50, dry day)
// ---------------------------------------------------------------------------

/** VP-05 / PK-05 — ръчната спирачка преди потегляне (ЗДвП чл. 20 — водачът
 *  контролира ППС; Наредба № 38 брои потеглянето с вдигната ръчна за
 *  второстепенна грешка) и последната стъпка от чек-листа: огледът преди
 *  тръгване (ЗДвП чл. 25 — потеглянето от място е маневра). */
export const SC_VP_HANDBRAKE: ScenarioSpec = {
  id: "sc-vp-handbrake",
  family: "cockpit",
  tagsBg: ["кокпит", "ръчна спирачка", "контролна лампа", "потегляне", "чек-лист"],
  titleBg: "Потегляне с вдигната ръчна",
  objectiveBg:
    "Провери ръчната спирачка ПРЕДИ потегляне — лампата на таблото и съпротивлението на колата издават вдигнатата ръчна. И довърши чек-листа докрай: последната стъпка не е таблото, а огледът.",
  // Doc-72 provenance: VP-05 IS this moment (move-off with the parking brake
  // engaged); PK-05 is the checklist's last step, the fault the second demo
  // rides — both are "Engine: ✅ FULL" archetypes with shipped detectors.
  archetypeIds: ["VP-05", "PK-05"],
  conceptIds: ["c-vehicle-controls", "c-pre-drive-check", "c-mirrors-blind-spots"],
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
    { n: 1, textBg: "Преди потегляне мини кокпит чек-листа: колан, огледала, предавка — и ръчната спирачка." },
    {
      n: 2,
      textBg:
        "Свали ръчната докрай и погледни таблото: червената лампа за ръчна спирачка ТРЯБВА да угасне. Свети ли още — ръчната не е долу.",
    },
    {
      n: 3,
      textBg:
        "Чек-листът не свършва на таблото: последната стъпка е огледът — огледало и поглед през ЛЯВОТО рамо, преди колелата да се завъртят.",
    },
    { n: 4, textBg: "Чак сега потегли плавно и дръж спокойна скорост под 50 км/ч по правата отсечка." },
    {
      n: 5,
      textBg:
        "Ако колата тегли тежко и не набира скорост или лампата свети в движение — спри и провери ръчната, вместо да натискаш газта.",
    },
  ],
  success: [
    {
      id: "sc-vph-moved",
      titleBg: "Потегли плавно и мини контролната зона",
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 14, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vph-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 12 },
    },
  ],
  rubric: {
    // The checklist's last step IS an observation moment — the rubric channel
    // the S1 trace recorder feeds (until a student attempt supplies it, the
    // component reports measured: false and stays out of the star math).
    observation: {
      moments: [
        { id: "sc-vph-glance-mirror", titleBg: "Поглед в огледалото, преди колата да тръгне" },
        { id: "sc-vph-glance-shoulder", titleBg: "Поглед през ляво рамо в мъртвата зона" },
      ],
    },
    parTimeSec: 55,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVpHandbrake.ts; the §5 gate (shadow replays ZERO violations +
  // CLEAN_DRIVING) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-vp-handbrake-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-handbrake/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-handbrake/mistake-handbrake-on.trace.json" },
      titleBg: "Потегляне с вдигната ръчна",
      whatWentWrongBg:
        "Колата потегли с вдигната ръчна спирачка — и водачът не забеляза нито едното, нито другото предупреждение: червената лампа на таблото не угасна, а колата теглеше тежко и не набираше скорост. Точно това са двата признака. Влаченето с вдигната ръчна прегрява задните спирачки до загуба на ефективност — а прегрелите спирачки няма да ги има точно когато потрябват. Свали ръчната докрай и изчакай лампата да угасне, преди да дадеш газ.",
      codeRefs: ["HANDBRAKE_LEFT_ON"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-handbrake/mistake-no-observation.trace.json" },
      titleBg: "Потегляне без оглед след чек-листа",
      whatWentWrongBg:
        "Ръчната беше свалена изрядно, лампата угасна — и колата тръгна веднага, без нито един поглед назад. Чек-листът беше изпълнен наполовина: водачът гледаше таблото вместо огледалото. Потеглянето от място е маневра (чл. 25) и последната ѝ стъпка е огледът — огледало и поглед през ляво рамо. Приближаващият отзад-отляво остана невидим до последно.",
      codeRefs: ["MOVE_OFF_WITHOUT_OBSERVATION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, преди колелата да се завъртят — от паркинга, от банкета, на светофара след спиране на наклон, в началото на изпита. Ръчната се проверява като част от един и същ чек-лист всеки път, а не когато колата вече „не върви както трябва“.",
    whyBg:
      "Вдигнатата ръчна не е дребна забравка: влаченето прегрява задните спирачки и им отнема ефективността точно преди първото сериозно спиране, а водач, който търси причината в движението, гледа таблото вместо пътя. Колата ти казва истината по два начина — лампата, която не угасва, и съпротивлението при потегляне; и двата са безплатни, ако ги познаваш. А чек-лист, който свършва на таблото, ражда втората грешка: потегляне без оглед.",
    lawRef: "ЗДвП чл. 20; Наредба № 38 (контролни уреди)",
    examinerBg:
      "Изпитващият следи цялата процедура по потегляне: свалена ръчна (движението с вдигната ръчна е второстепенна грешка по Наредба № 38 и се брои всеки път), угаснала контролна лампа и оглед — огледало и поглед през рамо — преди колата да тръгне. Потегляне без оглеждане е основна грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  // Config-gated drill: opt the move-off-observation detector IN so the LIVE
  // student session grades the checklist's last step (default-OFF elsewhere —
  // see rules/types.ts moveOffObservationEnabled). compileScenario propagates
  // this to the LessonSpec; the recorder passes the same override for the §9
  // assert. The handbrake detector needs no gate: it ships default-ON.
  ruleConfig: { moveOffObservationEnabled: true },
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The cockpit-procedure-family templates, file 2 — in catalog order
 *  (registered in templates.ts). */
export const SCENARIO_TEMPLATES_COCKPIT2: readonly ScenarioSpec[] = [SC_VP_HANDBRAKE];
