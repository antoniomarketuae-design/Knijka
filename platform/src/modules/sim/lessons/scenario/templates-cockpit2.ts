/**
 * Scenario templates — the COCKPIT-PROCEDURE family, SECOND file (doc 76 §2
 * chip "cockpit"; templates-cockpit.ts holds VP-02/04/05/06/11 + PK-05):
 *
 *  - sc-vp-handbrake     „Потегляне с вдигната ръчна"  (VP-05 + PK-05, vp-ready-v1)
 *  - sc-vp-telltale-red  „Червена лампа — спри сега"   (VP-06, ln-v1)
 *
 * The two drills sit on DIFFERENT reused maps and share no state; each block
 * pins its own geometry by value from its own committed district file.
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

import type { TelltaleStimulusSpec } from "../../contracts";
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

// ---------------------------------------------------------------------------
// sc-vp-telltale-red — „Червена лампа — спри сега" (VP-06, the red/amber
//    TRIAGE) on ln-v1 (map REUSED from sc-vp-telltale / sc-vp-police-stop: the
//    400 m 2+2 boulevard with curb space for the pull-over)
// ---------------------------------------------------------------------------

/** ln-v1 northbound right-lane center (meta.scenario; pinned by value — L7,
 *  the ln-district battery asserts x = 12.19). */
const TTR_RIGHT = 12.19;
/** The RED stimulus: the temperature telltale (ЗДвП чл. 20 doctrine: red =
 *  спри безопасно СЕГА) lights as the player passes y = 175 in the right lane,
 *  well after the amber cue and the "continue-smoothly" checkpoint. */
const TTR_TRIGGER = { x: TTR_RIGHT, y: 175 };
const TTR_TRIGGER_DIST_M = 8;
/** The curb-side halt point for the RED lamp (right edge of the right lane,
 *  curb x = 16.25 — the sc-vp-police-stop pull-over geometry), ~80 m of
 *  planning room after the lamp. */
const TTR_STOP = { x: 13.9, y: 255 };
const TTR_STOP_RADIUS_M = 3;
const TTR_STOP_SPEED_KMH = 4;

/**
 * The staged COCKPIT STIMULUS on ln-v1 (kind "telltaleStimulus" — stimulus +
 * measurement only, see contracts.ts): NO actor; at the trigger the director's
 * telltaleLit channel lights the cluster's RED temperature lamp (+ the L1/L2
 * HUD cue). The runner emits ZERO SimTick events — the graded duty lives in
 * this template's objectives (the curb-side low-speed reachZone = the RED
 * pull-over-and-stop verdict), so no new violation code exists to false-fire
 * (A12). ignoreBeyondM 100 sits past the stop zone (255 vs the 175 trigger =
 * an 80 m gap), so a compliant pull-over always resolves "yielded" first; a
 * mid-lane rest short of the halt point leaves the encounter UNRESOLVED.
 */
const VP_TELLTALE_RED_LAMP: TelltaleStimulusSpec = {
  id: "sc-vptr-lamp",
  kind: "telltaleStimulus",
  libraryEventId: "ev-warning-light",
  lamp: "temperature",
  trigger: TTR_TRIGGER,
  triggerDistM: TTR_TRIGGER_DIST_M,
  stop: TTR_STOP, // single truth with the graded RED stop-zone objective below
  stopRadiusM: TTR_STOP_RADIUS_M,
  stopSpeedKmh: TTR_STOP_SPEED_KMH,
  ignoreBeyondM: 100,
};

/**
 * VP-06 — цветът на контролната лампа решава протокола (ЗДвП чл. 20: водачът
 * контролира ППС; чл. 139: движение само с технически изправно ППС. Doc-65
 * ev-warning-light doctrine: ЧЕРВЕНА лампа = спри безопасно СЕГА и гаси
 * двигателя; ЖЪЛТА = внимателно, до сервиз, без аварийно спиране).
 *
 * THE TRIAGE (distinct from the live sc-vp-telltale, which is a single-lamp
 * reaction): this drill teaches DISCRIMINATION — amber first (keep going,
 * calmly, to a garage), then red (stop now, right, engine off) — back to back
 * on one drive. Graded through EXISTING objective kinds only, the
 * sc-vp-police-stop / sc-vp-telltale mold — no new violation code:
 *   - the AMBER verdict is "continue-smoothly": a right-lane checkpoint the bot
 *     completes by DRIVING ON past the amber cue at cruising speed (a red-lamp
 *     panic-stop or a needless amber stop never reaches it while rolling);
 *   - the RED verdict is "stop-within-distance": a low-speed curb-side
 *     reachZone 80 m past the red trigger (the runner records "yielded").
 * The mistake demos grade shipped codes that honestly fit each wrong way:
 *   - „Каране нататък с червената лампа" — the ignore reflex pushed to its
 *     physical end: the seized engine coasts the car off line into the roadside
 *     (an AUTHORED consequence — the scCrossingDart „collision" seam; the
 *     telltale runner stages nothing to hit), grading COLLISION. Held at 45 in
 *     the 50 zone so SPEEDING never joins it — the lamp itself convicts nothing;
 *   - „Паническо спиране в активната лента" — the doc-72 VP-06 wrong reflex:
 *     the ≥ 8 m/s² slam mid-lane on the empty street grades
 *     HARSH_BRAKING_NO_CAUSE (a dashboard lamp is NOT a forward cause in the
 *     harsh-brake ledger — leadGap/signal/junction/crossing channels only, and
 *     the runner emits zero events — so the honest read stands: a red lamp asks
 *     for a PLANNED pull-over, never an emergency stop).
 *
 * HONEST LIMIT (documented like sc-vp-handbrake's drag note): the engine's
 * telltaleStimulus renders ONE lamp channel (temperature, red). The AMBER lamp
 * is the authored NARRATIVE cue — the instructions, the shadow annotation and
 * the "continue-smoothly" objective carry it; the RED lamp is the one engine
 * stimulus. Nothing is faked to hide that: the objectives grade only what the
 * car actually did (drove on past the amber checkpoint; rested at the red curb
 * zone), and the shipped detectors grade the two wrong ways.
 */
export const SC_VP_TELLTALE_RED: ScenarioSpec = {
  id: "sc-vp-telltale-red",
  family: "cockpit",
  tagsBg: ["контролна лампа", "червена лампа", "жълта лампа", "табло", "кокпит"],
  titleBg: "Червена лампа — спри сега",
  objectiveBg:
    "Червена контролна лампа (масло, температура, спирачки) значи: спри безопасно ВЕДНАГА и гаси двигателя; жълтата значи „внимателно до сервиза“ — научи се да ги различаваш в движение.",
  archetypeIds: ["VP-06"],
  conceptIds: ["c-vehicle-controls", "c-technical-condition", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-vp-telltale / sc-lane-change — mirrored in ln-v1.json
    // meta.scenario.params (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в дясната лента и поглеждай таблото — цветът на лампата решава какво правиш." },
    {
      n: 2,
      textBg:
        "Светне ли ЖЪЛТА лампа: това е „внимание, до сервиз“. Не спирай аварийно — продължи плавно и спокойно.",
    },
    {
      n: 3,
      textBg:
        "Светне ли ЧЕРВЕНА лампа (масло, температура, спирачки): спри безопасно СЕГА. Огледало, десен мигач, плавно намаляване, спиране плътно вдясно.",
    },
    { n: 4, textBg: "При червена лампа гаси двигателя и не продължавай — червеното не търпи „още малко до вкъщи“." },
    {
      n: 5,
      textBg:
        "И в двата случая — без паника: аварийно спиране насред лентата изненадва движещите се отзад и е грешният отговор и за жълтото, и за червеното.",
    },
  ],
  success: [
    {
      id: "sc-vptr-amber",
      titleBg: "Продължи плавно покрай жълтата лампа",
      // The AMBER verdict — a right-lane checkpoint BEFORE the red trigger
      // (y 110 < 175). Completed by driving ON at cruising speed: the objective
      // ORDER means the red stop zone below is graded only past the stimulus.
      params: { kind: "reachZone", x: TTR_RIGHT, y: 110, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vptr-red-stop",
      titleBg: "Спри плътно вдясно при червената лампа",
      // The RED verdict — completable ONLY at near-stop speed at the curb-side
      // halt point (the sc-pk-smooth-stop stop-mark pattern), 80 m PAST the red
      // trigger. Same values as the staged TelltaleStimulusSpec's halt contract
      // (single truth by value).
      params: {
        kind: "reachZone",
        x: TTR_STOP.x,
        y: TTR_STOP.y,
        radiusM: TTR_STOP_RADIUS_M,
        maxSpeedKmh: TTR_STOP_SPEED_KMH,
      },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVpTelltaleRed.ts; the §5 gate (shadow replays ZERO violations +
  // rests in the red stop zone) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-vp-telltale-red-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-telltale-red/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-telltale-red/mistake-drive-on.trace.json" },
      titleBg: "Каране нататък с червената лампа",
      whatWentWrongBg:
        "Червената лампа светна — а водачът натисна газта: „още малко до вкъщи“. Червено значи СПРИ СЕГА, не „внимателно до сервиз“ (това е жълтото). Прегряващ двигател или спаднало налягане на маслото убива мотора в движение за минути — и когато двигателят блокира на скорост, колата поднася и удря това, което е пред нея. Червена лампа = плавно спиране плътно вдясно и изгасен двигател, веднага.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-telltale-red/mistake-panic-lane.trace.json" },
      titleBg: "Паническо спиране в активната лента",
      whatWentWrongBg:
        "Лампата стресна водача и кракът се заби в спирачката насред платното. Точно това е грешният рефлекс — и за червената, и за жълтата лампа. Правилният отговор на червено не е аварийно спиране на място, а СПОКОЙНО спиране плътно вдясно: огледало, десен мигач, плавно намаляване. Аварийното спиране в активната лента изненадва движещите се отзад и е предпоставка за удар отзад.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "Когато на таблото светне предупредителна лампа по време на движение. Цветът е протоколът: ЧЕРВЕНА (масло, температура, спирачки, зареждане) значи „спри безопасно сега и гаси двигателя“; ЖЪЛТА значи „внимание — до сервиз, без аварийно спиране“. Навикът да поглеждаш таблото на всеки няколко секунди хваща и двете навреме.",
    whyBg:
      "Червената лампа предупреждава за повреда, която ще стане опасна за минути — прегрят двигател, спаднало налягане на маслото, отказала спирачна система. Караш ли нататък, рискуваш скъсан двигател или отказ на спирачките точно в движение; спреш ли панически в лентата — удар отзад. Жълтата иска само повишено внимание и посещение в сервиз. Разликата в цвета е разликата между „спри веднага“ и „продължи внимателно“ — и спокойната процедура (огледало, мигач, плавно вдясно) е верният отговор и за двете.",
    lawRef: "ЗДвП чл. 20; чл. 139",
    examinerBg:
      "Изпитващият следи реакцията при индикация за неизправност: навременно забелязване, правилна преценка по цвета на лампата, запазено самообладание, огледало и десен мигач, плавно намаляване и спиране плътно вдясно при червена лампа. Рязко спиране в лентата или продължаване с явна червена индикация е грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [VP_TELLTALE_RED_LAMP],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The cockpit-procedure-family templates, file 2 — in catalog order
 *  (registered in templates.ts). */
export const SCENARIO_TEMPLATES_COCKPIT2: readonly ScenarioSpec[] = [
  SC_VP_HANDBRAKE,
  SC_VP_TELLTALE_RED,
];
