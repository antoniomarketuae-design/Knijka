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

import type { PoliceStopSpec, TelltaleStimulusSpec } from "../../contracts";
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

// ---------------------------------------------------------------------------
// sc-vp-stall — „Загасване при потегляне" (doc 72 VP-04) on vp-ready-v1
//    (map REUSED; rides the recorder's stall channel — {kind:"stall"})
// ---------------------------------------------------------------------------

/** VP-04 — загасване на двигателя при потегляне (Наредба № 38: всяко загасване
 *  е официална второстепенна грешка; повтарянето трупа точки). The classic
 *  learner stall: clutch released too fast at move-off. Rides the recorder's
 *  stall channel (the VP-04 capability unlock): the driveline's LATCHED
 *  stalled flag reaches the rule engine, which grades each RISING EDGE as one
 *  ENGINE_STALLED — the restart re-arms the episode, so the repeat demo grades
 *  it twice. The shipped detector is default-ON (no ruleConfig needed): the
 *  LIVE student session grades the same fault. */
export const SC_VP_STALL: ScenarioSpec = {
  id: "sc-vp-stall",
  family: "cockpit",
  tagsBg: ["кокпит", "потегляне", "загасване", "съединител", "изпитни упражнения"],
  titleBg: "Загасване при потегляне",
  objectiveBg:
    "Потегли от място, без двигателят да загасне: съединител докрай, лек газ и плавно отпускане до точката на зацепване — загасването е класическата грешка от изпитни нерви и всяко се брои.",
  archetypeIds: ["VP-04"],
  conceptIds: ["c-vehicle-controls", "c-pre-drive-check"],
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
    { n: 1, textBg: "Преди потегляне: съединител докрай, включи първа предавка и дай лек газ." },
    { n: 2, textBg: "Отпускай съединителя ПЛАВНО до точката на зацепване — усещаш как колата „поляга“ напред." },
    { n: 3, textBg: "Задръж крака в точката на зацепване, докато колата тръгне, и чак тогава отпусни докрай." },
    { n: 4, textBg: "Ако двигателят все пак загасне: спокойно — съединител докрай, запали отново и повтори процедурата." },
    { n: 5, textBg: "Продължи плавно по отсечката, без нито едно загасване, до края." },
  ],
  success: [
    {
      id: "sc-vps-moved",
      titleBg: "Потегли плавно и мини контролната зона",
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 14, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vps-finish",
      titleBg: "Стигни края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 330, radiusM: 14 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scVpStall.ts; gates in traces/__tests__/vp-stall-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-stall/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-stall/mistake-stall-once.trace.json" },
      titleBg: "Загасване при потеглянето",
      whatWentWrongBg:
        "Съединителят беше отпуснат рязко и двигателят загасна още на първия метър — колата подскочи и спря. Всяко загасване е официална второстепенна грешка на изпита: не е драма, но се отбелязва. Спокойното повторение на процедурата е част от умението.",
      codeRefs: ["ENGINE_STALLED"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-stall/mistake-stall-repeat.trace.json" },
      titleBg: "Повторно загасване",
      whatWentWrongBg:
        "Двигателят загасна два пъти подред — след първото загасване дойде паниката, а с нея и същото рязко отпускане на съединителя. Повтарящото се загасване показва проблем с работата на съединителя и газта и трупа точки: всяко ново загасване се брои отделно.",
      codeRefs: ["ENGINE_STALLED"],
    },
  ],
  teach: {
    whenBg:
      "При всяко потегляне от място с ръчни скорости — на светофар, на знак Стоп, на наклон и в началото на изпита. Точно там нервите избързват с крака и двигателят гасне; процедурата е една и съща всеки път.",
    whyBg:
      "Загасването само по себе си е дребна грешка, но последствията не са: кола, която угасва на зелено или на кръстовище, блокира потока и кани удар отзад, а паниката след първото загасване ражда второто. Овладяната точка на зацепване прави потеглянето предвидимо — и на изпита, и на хълма пред колоната.",
    lawRef: "Наредба № 38 (второстепенни грешки — загасване на двигателя)",
    examinerBg:
      "Изпитващият отбелязва всяко загасване на двигателя като второстепенна грешка — едно се преживява, но повтарянето показва липса на контрол над съединителя и газта и се трупа. Гледа се и реакцията: спокоен рестарт и правилно повторно потегляне, не газ до ламарината.",
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
// sc-vp-police-stop — „Спиране по полицейски сигнал" (doc 72 VP-11) on ln-v1
//    (map REUSED from sc-lane-change / sc-vu-emergency: the 400 m 2+2
//    boulevard — a left lane must exist so the „подминаване" demo can grade)
// ---------------------------------------------------------------------------

/** ln-v1 northbound lane centers (meta.scenario; pinned by value — L7). */
const PS_RIGHT = 12.19;
const PS_LEFT = 4.06;
/** The officer's post on the RIGHT sidewalk (curb line x = 16.25). */
const PS_OFFICER = { x: 17.0, y: 210 };
/** The curb-side halt point: right edge of the right lane, just short of the
 *  officer — the driver stops with the window at the officer's level. */
const PS_STOP = { x: 13.9, y: 206 };
const PS_STOP_RADIUS_M = 3;
const PS_STOP_SPEED_KMH = 4;

/**
 * The staged OFFICER FIGURE on ln-v1 (kind "policeStop" — scenery +
 * measurement only, see contracts.ts): stands at the curb at y = 210 facing
 * the roadway (west), right arm raised — the стоп-сигнал pose, hi-vis vest,
 * fictional per ADR-001. The runner emits ZERO SimTick events: the graded
 * duty lives entirely in this template's objectives (the curb-side low-speed
 * reachZone below = the pull-over-and-stop completion), so no new violation
 * code exists to false-fire (A12). The outcome channel records "yielded" /
 * "passedWithoutStopping" for the debrief.
 */
const VP_POLICE_OFFICER: PoliceStopSpec = {
  id: "sc-vpps-officer",
  kind: "policeStop",
  libraryEventId: "ev-police-stop-signal",
  officer: PS_OFFICER,
  facing: { x: -1, y: 0 }, // toward the roadway (west)
  stop: PS_STOP, // single truth with the graded stop-zone objective below
  stopRadiusM: PS_STOP_RADIUS_M,
  stopSpeedKmh: PS_STOP_SPEED_KMH,
  passBeyondM: 25,
};

/**
 * VP-11 — спиране по полицейски сигнал (ЗДвП чл. 170: разпорежданията на
 * органите за контрол са задължителни за участниците в движението; сигналът
 * за спиране изисква БЕЗОПАСНО спиране плътно вдясно — не паническо спиране
 * насред лентата и не подминаване).
 *
 * COMPLETION DRILL (the stage-1c mandate): graded through EXISTING objective
 * kinds only — a low-speed curb-side reachZone (the sc-pk-smooth-stop
 * stop-mark pattern) IS the pull-over-and-stop duty; no new violation code.
 * The mistake demos grade shipped codes that honestly fit each wrong way:
 *   - „Подминаване на сигнала" — swerves LEFT around the officer and drives
 *     on: the left-lane hog grades NOT_KEEPING_RIGHT (чл. 15) and the drill
 *     never completes (the stop zone stays unreached — capped outcome);
 *   - „Паника в лентата" — the doc-72 mistake verbatim (panic-brake in-lane
 *     instead of pulling right): the ≥ 8 m/s² slam on an empty street grades
 *     HARSH_BRAKING_NO_CAUSE, and the early mid-lane rest never reaches the
 *     stop zone either.
 * HONEST LIMIT (documented like sc-pk-smooth-stop's smoothness note): the
 * WITHIN-LANE pull-to-the-edge nuance (~1.7 m) is coached by the instructions
 * and the shadow, not zone-graded — a circular reachZone cannot honestly
 * discriminate lateral position inside one lane.
 */
export const SC_VP_POLICE_STOP: ScenarioSpec = {
  id: "sc-vp-police-stop",
  family: "cockpit",
  tagsBg: ["полицейски сигнал", "спиране", "проверка", "чл. 170"],
  titleBg: "Спиране по полицейски сигнал",
  objectiveBg:
    "Полицай на тротоара ти подава сигнал за спиране. Изпълни го правилно: мигач надясно, плавно намаляване и спиране плътно вдясно при полицая — без паническо спиране насред лентата и без подминаване. Разпорежданията на контролните органи са задължителни (чл. 170).",
  archetypeIds: ["VP-11"],
  conceptIds: ["c-general-care-duty", "c-vehicle-controls", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-lane-change — mirrored in ln-v1.json
    // meta.scenario.params (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в дясната лента по булеварда." },
    {
      n: 2,
      textBg:
        "Напред вдясно на тротоара стои полицай с вдигната ръка — сигналът за спиране е за теб и е задължителен (чл. 170).",
    },
    { n: 3, textBg: "Без паника: провери огледалото, пусни десен мигач и започни плавно да намаляваш отрано." },
    {
      n: 4,
      textBg:
        "Отдръпни се към десния край на лентата и спри плътно вдясно, точно при полицая — не насред платното.",
    },
    { n: 5, textBg: "Остани спрял с работещ двигател и ръце на волана — изчакваш указанията на полицая." },
  ],
  success: [
    {
      id: "sc-vpps-approach",
      titleBg: "Приближи полицая с контролирана скорост",
      // Right-lane checkpoint well before the officer's post.
      params: { kind: "reachZone", x: PS_RIGHT, y: 120, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vpps-stop",
      titleBg: "Спри плътно вдясно при полицая",
      // Completable ONLY at near-stop speed at the curb-side halt point (the
      // sc-pk-smooth-stop stop-mark pattern): the drill ENDS at rest by the
      // officer — pulled over right and stopped. Same values as the staged
      // PoliceStopSpec's halt contract (single truth by value).
      params: {
        kind: "reachZone",
        x: PS_STOP.x,
        y: PS_STOP.y,
        radiusM: PS_STOP_RADIUS_M,
        maxSpeedKmh: PS_STOP_SPEED_KMH,
      },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED (ADR-006 stage 1c): committed deterministic recordings of the
  // authored scripts in traces/scVpPoliceStop.ts; the §5 gate (shadow replays
  // with ZERO violations + rests in the stop zone) and the §9 stage-5 code
  // asserts run in traces/__tests__/sc-vp-police-stop-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-police-stop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-police-stop/mistake-drive-past.trace.json" },
      titleBg: "Подминаване на сигнала",
      whatWentWrongBg:
        "Водачът видя сигнала, измести се в лявата лента и просто отмина полицая. Разпореждането за спиране е задължително (чл. 170) — неизпълнението му е сериозно нарушение с глоба и книжка на масата. А оставането в лявата лента при свободна дясна е и „висене“ в лентата за изпреварване (чл. 15).",
      codeRefs: ["NOT_KEEPING_RIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-police-stop/mistake-panic-stop.trace.json" },
      titleBg: "Паника в лентата",
      whatWentWrongBg:
        "Сигналът стресна водача и кракът се заби в спирачката — колата спря рязко насред лентата, далеч преди полицая. Точно това е класическата грешка на новите водачи: сигналът иска БЕЗОПАСНО спиране плътно вдясно, а не аварийно спиране на място, което изненадва движещите се отзад и е предпоставка за удар.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "Когато униформен полицай (или контролен орган със стоп-палка) ти подаде сигнал за спиране — при проверка, при произшествие напред, при отклоняване на движението. Сигналът е задължителен винаги и навсякъде.",
    whyBg:
      "Паническото спиране насред лентата е толкова опасно, колкото и подминаването: движещият се зад теб не очаква аварийно спиране без причина. Спокойната процедура — огледало, мигач, плавно вдясно, спиране при полицая — пази и теб, и колоната зад теб, и показва контрол над колата.",
    lawRef: "ЗДвП чл. 170",
    examinerBg:
      "Изпитващият (и полицаят) гледа: навременно забелязване на сигнала, огледало и десен мигач, плавно намаляване и спиране плътно вдясно на посоченото място, двигател работещ и изчакване на указания. Рязко спиране в лентата или подминаване на сигнала е грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [VP_POLICE_OFFICER],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-vp-telltale — „Контролна лампа в движение" (doc 72 VP-06, N11 cockpit-
//    stimuli batch #10) on ln-v1 (map REUSED from sc-vp-police-stop: the
//    400 m 2+2 boulevard with curb space for the pull-over)
// ---------------------------------------------------------------------------

/** ln-v1 northbound right-lane center (meta.scenario; pinned by value — L7). */
const TT_RIGHT = 12.19;
/** The stimulus: the red temperature telltale lights as the player passes
 *  y = 140 in the right lane (mid-drive, well past the approach checkpoint). */
const TT_TRIGGER = { x: TT_RIGHT, y: 140 };
const TT_TRIGGER_DIST_M = 8;
/** The curb-side halt point (right edge of the right lane, curb x = 16.25 —
 *  the sc-vp-police-stop pull-over geometry, ~80 m of planning room after
 *  the lamp). */
const TT_STOP = { x: 13.9, y: 220 };
const TT_STOP_RADIUS_M = 3;
const TT_STOP_SPEED_KMH = 4;

/**
 * The staged COCKPIT STIMULUS on ln-v1 (kind "telltaleStimulus" — stimulus +
 * measurement only, see contracts.ts): NO actor; at the trigger the director's
 * telltaleLit channel lights the cluster's red temperature lamp (+ the L1/L2
 * HUD cue). The runner emits ZERO SimTick events: the graded duty lives
 * entirely in this template's objectives (the curb-side low-speed reachZone
 * below = the pull-over-and-stop completion), so no new violation code exists
 * to false-fire (A12). The outcome channel records "yielded" (with the
 * stimulus→first-brake reactionTimeSec) / "passedWithoutStopping" for the
 * debrief. ignoreBeyondM 120 sits comfortably past the stop zone (y 260 vs
 * 220), so a compliant pull-over always resolves first.
 */
const VP_TELLTALE_LAMP: TelltaleStimulusSpec = {
  id: "sc-vptt-lamp",
  kind: "telltaleStimulus",
  libraryEventId: "ev-warning-light",
  lamp: "temperature",
  trigger: TT_TRIGGER,
  triggerDistM: TT_TRIGGER_DIST_M,
  stop: TT_STOP, // single truth with the graded stop-zone objective below
  stopRadiusM: TT_STOP_RADIUS_M,
  stopSpeedKmh: TT_STOP_SPEED_KMH,
  ignoreBeyondM: 120,
};

/**
 * VP-06 — контролна лампа по време на движение (ЗДвП чл. 20: водачът е длъжен
 * да контролира ППС; чл. 139: движение само с технически изправно превозно
 * средство. Doc-65 ev-warning-light doctrine: ЧЕРВЕНА лампа = спри безопасно
 * СЕГА — не паническо спиране насред лентата и не „ще стигна до вкъщи").
 *
 * COMPLETION DRILL (the sc-vp-police-stop mold): graded through EXISTING
 * objective kinds only — a low-speed curb-side reachZone IS the
 * notice-and-pull-over duty; no new violation code. The mistake demos grade
 * shipped codes that honestly fit each wrong way:
 *   - „Игнорирана лампа" — drives on past the lamp and HURRIES (the classic
 *     ignore story: push on to get home before the car dies): the sustained
 *     58 km/h in the 50 zone grades SPEEDING_OVER_LIMIT (чл. 21), and the
 *     drill never completes (the stop zone stays unreached; the outcome
 *     records "passedWithoutStopping");
 *   - „Паника в лентата" — the doc-72 VP-06 mistake flavor (panic instead of
 *     a plan): the ≥ 8 m/s² slam mid-lane on the empty street grades
 *     HARSH_BRAKING_NO_CAUSE — HONEST grading verified against the ledger: a
 *     dashboard lamp is NOT a forward cause (the harsh-brake ledger reads
 *     leadGap/signal/junction/crossing channels only; the telltale runner
 *     emits zero events), and the early mid-lane rest never reaches the stop
 *     zone either.
 * HONEST LIMIT (the sc-vp-police-stop note verbatim): the WITHIN-LANE
 * pull-to-the-edge nuance (~1.7 m) is coached by the instructions and the
 * shadow, not zone-graded.
 */
export const SC_VP_TELLTALE: ScenarioSpec = {
  id: "sc-vp-telltale",
  family: "cockpit",
  tagsBg: ["контролна лампа", "табло", "прегряване", "спиране вдясно", "кокпит"],
  titleBg: "Контролна лампа в движение",
  objectiveBg:
    "По време на движение на таблото светва червената лампа за температура на двигателя. Забележи я навреме и реагирай правилно: огледало, десен мигач, плавно намаляване и спиране плътно вдясно — червена лампа значи „спри безопасно сега“, не паника и не продължаване.",
  archetypeIds: ["VP-06"],
  conceptIds: ["c-vehicle-controls", "c-technical-condition", "c-braking-distance"],
  map: {
    archetype: "straight-street",
    // Map REUSED from sc-lane-change / sc-vp-police-stop — mirrored in
    // ln-v1.json meta.scenario.params (tools/maps/gen_two_lane_road.mjs).
    params: { lengthM: 400, maxspeedKmh: 50 },
    districtId: "ln-v1",
  },
  start: {
    spawnPointId: "ln-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Движи се спокойно в дясната лента — и си създай навика да поглеждаш таблото." },
    {
      n: 2,
      textBg:
        "Светва червената лампа за температура на двигателя. Червена лампа значи: спри безопасно сега — двигателят прегрява.",
    },
    { n: 3, textBg: "Без паника: провери огледалото, пусни десен мигач и започни плавно да намаляваш отрано." },
    {
      n: 4,
      textBg:
        "Отдръпни се към десния край на лентата и спри плътно вдясно — не рязко насред платното и не „до вкъщи е близо“.",
    },
    { n: 5, textBg: "Остани спрял вдясно — при червена лампа двигателят се гаси и не се продължава." },
  ],
  success: [
    {
      id: "sc-vptt-approach",
      titleBg: "Карай спокойно по булеварда",
      // Right-lane checkpoint BEFORE the trigger (y 100 < 140) — the
      // objectives complete in order, so the stop zone below can only be
      // graded on the far side of the stimulus.
      params: { kind: "reachZone", x: TT_RIGHT, y: 100, radiusM: 10, maxSpeedKmh: 55 },
    },
    {
      id: "sc-vptt-stop",
      titleBg: "Спри плътно вдясно след лампата",
      // Completable ONLY at near-stop speed at the curb-side halt point (the
      // sc-pk-smooth-stop stop-mark pattern), 80 m PAST the stimulus trigger
      // — reaching it before the lamp is geometrically impossible (any drive
      // to it crosses the trigger corridor, and the runner's passed-backstop
      // covers a crawler). Same values as the staged TelltaleStimulusSpec's
      // halt contract (single truth by value).
      params: {
        kind: "reachZone",
        x: TT_STOP.x,
        y: TT_STOP.y,
        radiusM: TT_STOP_RADIUS_M,
        maxSpeedKmh: TT_STOP_SPEED_KMH,
      },
    },
  ],
  rubric: { parTimeSec: 55 },
  // RECORDED (N11 batch #10): committed deterministic recordings of the
  // authored scripts in traces/scVpTelltale.ts; the §5 gate (shadow replays
  // with ZERO violations + rests in the stop zone) and the §9 stage-5 code
  // asserts run in traces/__tests__/sc-vp-telltale-traces.test.ts
  // (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-vp-telltale/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-vp-telltale/mistake-ignore.trace.json" },
      titleBg: "Игнорирана лампа",
      whatWentWrongBg:
        "Червената лампа светна — а водачът само натисна газта: „ще стигна до вкъщи“. Прегряващ двигател не се лекува с бързане: няколко километра с червена лампа значат скъсан двигател насред пътя. А ускоряването „за да стигнеш“ прати колата и над ограничението (чл. 21). Червена лампа = спри безопасно сега.",
      codeRefs: ["SPEEDING_OVER_LIMIT"],
    },
    {
      traceRef: { path: "content/traces/sc-vp-telltale/mistake-panic-stop.trace.json" },
      titleBg: "Паника в лентата",
      whatWentWrongBg:
        "Лампата стресна водача и кракът се заби в спирачката — колата спря аварийно насред лентата. Точно това е грешният рефлекс: червената лампа иска БЕЗОПАСНО спиране плътно вдясно, с огледало и мигач, а не аварийно спиране на място, което изненадва движещите се отзад и е предпоставка за удар.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
  ],
  teach: {
    whenBg:
      "Когато на таблото светне предупредителна лампа по време на движение — температура, налягане на маслото, спирачки. Цветът казва всичко: червена лампа значи „спри безопасно сега“, жълта — „внимание, до сервиз“. Навикът да поглеждаш таблото на всеки няколко секунди я хваща навреме.",
    whyBg:
      "Контролните лампи предупреждават за проблем, преди той да е станал опасен (чл. 20 — контролът над автомобила значи и контрол над състоянието му). Игнорирането на червена лампа завършва със счупена кола насред пътя, а паническото спиране в лентата — с удар отзад. Спокойната процедура — огледало, мигач, плавно вдясно — решава и двете.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият гледа реакцията на водача при проблем: навременно забелязване, запазено самообладание, огледало и десен мигач, плавно намаляване и спиране плътно вдясно на безопасно място. Рязко спиране в лентата или продължаване с явна неизправност е грешка.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  staged: [VP_TELLTALE_LAMP],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The cockpit-procedure-family templates, in catalog order (registered in
 *  templates.ts). */
export const SCENARIO_TEMPLATES_COCKPIT: readonly ScenarioSpec[] = [
  SC_VP_READINESS,
  SC_PK_MOVE_OFF,
  SC_VP_STALL,
  SC_VP_POLICE_STOP,
  SC_VP_TELLTALE,
];
