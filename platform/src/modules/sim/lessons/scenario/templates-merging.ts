/**
 * Scenario templates — the MERGING family (doc 76 §2 chip "merging", doc 72
 * §10 „Family OV" merge archetypes), staged on the "merge-lane" micro-maps:
 *
 *  - sc-merge-accel-lane „Включване в магистрала през лентата за ускоряване"
 *    (OV-15 + SP-10, mw-entry-v1 — tools/maps/gen_mw_entry.mjs)
 *  - sc-merge-lane-end „Краят на лентата — вливане с цип"
 *    (OV-16 + OV-01/OV-02, ln-merge-v1 — tools/maps/gen_ln_merge.mjs)
 *  - sc-merge-roadworks-shift „Ремонт затваря лентата ти"
 *    (SN-07 + OV-16/OV-02/OV-12, hz-roadworks-v1 — tools/maps/gen_hz_roadworks.mjs)
 *
 * DATA ONLY, the templates.ts mold: every coordinate below is denormalized
 * from the committed district file (meta.scenario), so nothing loads world
 * JSON at runtime; the district battery (world/__tests__/merge-districts.test
 * .ts) and the trace gate assert every pinned value against the generated map.
 *
 * WHY THE MAP GRADES THIS FOR FREE (see gen_mw_entry.mjs's header): the
 * acceleration lane is the carriageway's CURB lane (laneId 0) over the 200 m
 * segment that carries NO emergencyLane span. So:
 *   - riding it is legal and it is the rightmost REQUIRED lane (no
 *     NOT_KEEPING_RIGHT, no EMERGENCY_LANE_DRIVING);
 *   - the merge is a laneId 0 → 1 delta WITHIN one edge, which the shipped
 *     lane-change adjudicator grades on indicator + mirror;
 *   - past the taper the span resumes, so the merged driver in laneId 1 is
 *     innocent while a driver who never merged rides the аварийна лента.
 *
 * Both mistake demos cite SHIPPED rules-catalog codes and grade EXACTLY them
 * through the production stack (the §5/§9 gates, traces/__tests__/
 * sc-merge-accel-lane-traces.test.ts):
 *   - „Спиране в края на лентата за ускоряване" → HARSH_BRAKING_NO_CAUSE
 *     (основна: рязко спиране без причина — the ledger is positively empty on
 *     this map: no crossing, no stop line, no junction, no lead ahead);
 *   - „Вливане без оглеждане пред идваща кола" →
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION (the indicator is ON — the
 *     demo's whole point is that signalling is not looking).
 */

import type { RearTailgaterSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// sc-merge-accel-lane — „Включване в магистрала през лентата за ускоряване"
// (OV-15 „Включване в движението" at motorway scale + SP-10 „Магистрала")
// ---------------------------------------------------------------------------

/** mw-entry-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const MWE_X_CURB = 8.13; // laneId 0 — the acceleration lane between nose and taper
const MWE_X_CRUISE = 0; // laneId 1 — the merge target (mainline right travel lane)
/** mw-entry-v1 story arclengths in district y (meta.scenario). */
const MWE_NOSE_Y = 260; // the acceleration lane begins (ramp nose)
const MWE_TAPER_Y = 460; // …and tapers out here — the curb lane becomes аварийна
const MWE_END_Y = 960;

/**
 * The MAINLINE CAR the drill is about: the shipped rearTailgater actor armed
 * in the TARGET lane (extraRightOffsetM = −one lane off the graph's curb lane
 * ⇒ x ≈ 0, mainline laneId 1), released once the player is well up the ramp.
 * It matchPlayer-paces a gap BEHIND the player — that is what keeps the pролука
 * ahead of it open and honest, so „merge ahead of it" is a real choice — and
 * after the pressure window it accelerates away and passes on the left (the
 * „passes if you dawdle" beat).
 *
 * HONEST PROXY (flagged, the FO-07 precedent): the rearTailgater is the only
 * shipped actor that keeps station relative to the player, so a car that
 * genuinely BLOWS PAST at flow speed is not authorable today (see the module
 * note in the trace script). PRESSURE SCENERY under the learn-only policy: the
 * runner emits ZERO SimTick events — no violation and no collision can grade
 * from it (doc 72 FO-07). Everything graded here is the player's own channel:
 * the lane-change indicator/mirror pair, and the causeless slam.
 */
const MWE_MAINLINE_CAR: RearTailgaterSpec = {
  id: "sc-mrg-mainline",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["mwe-n-nb-start", "mwe-n-nose", "mwe-n-taper", "mwe-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: 30 }, // dormant at (0, 30) — deep behind the nose
    cruiseSpeedMps: 28,
    // The graph's oneway lane rides the CURB lane (x ≈ +8.13); one lane LEFT
    // of it is the mainline travel lane the player must merge into.
    extraRightOffsetM: -MWE_X_CURB,
    colorIndex: 2,
  },
  releaseGapM: 150, // the player is ~half-way up the ramp before it rolls
  followBehindM: 42, // ~38 m of bumpers — a real, mergeable пролука at flow speed
  maxMatchSpeedMps: 33, // ~120 km/h — it keeps station even with a brisk player
  pressureSec: 18,
  passShiftM: -8.125, // the pass runs one lane LEFT (never through the player)
  passSpeedMps: 33,
  passAheadM: 45,
  easeKmh: 8,
};

/**
 * OV-15 / SP-10 — включване в магистрала през лентата за ускоряване (ЗДвП
 * чл. 55: водачът, който се включва в движението по автомагистрала, е длъжен
 * да пропусне движещите се по нея; чл. 25: маневрата се извършва след
 * убеждаване, че е безопасна, и със сигнал). The taught norm, verbatim from
 * the content bank (q-magistrali-i-izvangradsko-006): използваш лентата за
 * ускоряване, за да изравниш скоростта с потока → ляв мигач + огледало и
 * мъртва зона → пропускаш движещите се по магистралата → вливаш се.
 */
export const SC_MERGE_ACCEL_LANE: ScenarioSpec = {
  id: "sc-merge-accel-lane",
  family: "merging",
  tagsBg: ["магистрала", "вливане", "лента за ускоряване", "предимство", "огледала"],
  titleBg: "Включване в магистрала през лентата за ускоряване",
  objectiveBg:
    "Ускори в лентата за ускоряване до скоростта на потока, огледай се и се включи в пролука, без да спираш в края на лентата.",
  archetypeIds: ["OV-15", "SP-10"],
  conceptIds: ["c-motorway-entry-exit", "c-merging-traffic", "c-lane-change", "c-mirrors-blind-spots"],
  map: {
    archetype: "merge-lane",
    // The generator recipe — mirrored in mw-entry-v1.json meta.scenario.params
    // (tools/maps/gen_mw_entry.mjs).
    params: { approachM: 260, accelM: 200, mainM: 500, maxspeedKmh: 140, rampKmh: 90, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-entry-v1",
  },
  start: {
    spawnPointId: "mwe-spawn-ramp",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по рампата и набирай скорост още по нея — на магистралата се влиза със скоростта на потока, не пълзешком." },
    { n: 2, textBg: "От върха на рампата вдясно започва лентата за ускоряване. Тя е твоя за около 200 метра — използвай ги докрай, за да стигнеш ~90–100 км/ч." },
    { n: 3, textBg: "Докато ускоряваш, гледай в лявото огледало: къде е пролуката между колите по магистралата и с каква скорост идват те." },
    { n: 4, textBg: "Подай ляв мигач, провери огледалото И мъртвата зона през рамо — мигачът те обявява, но не те оглежда." },
    { n: 5, textBg: "Влей се плавно в пролуката: предимството е на движещите се по магистралата — ти се вписваш между тях, не ги избутваш." },
    { n: 6, textBg: "Изключи мигача и продължи в дясната лента. След края на лентата за ускоряване вдясно вече е аварийната лента — там не се кара." },
  ],
  success: [
    {
      id: "sc-mrg-accel",
      titleBg: "Използвай лентата за ускоряване",
      // Radius 4 < the 8.125 m lane pitch: satisfiable ONLY from the curb
      // (acceleration) lane, deep inside the 200 m segment — using the lane
      // instead of nosing straight into the flow IS the drill.
      params: { kind: "reachZone", x: MWE_X_CURB, y: 340, radiusM: 4 },
    },
    {
      id: "sc-mrg-merge",
      titleBg: "Влей се в лентата за движение преди края на лентата",
      // Same lane-pinning radius on the TARGET lane, 20 m before the taper: a
      // car still riding the acceleration lane at y = 440 misses it entirely.
      params: { kind: "reachZone", x: MWE_X_CRUISE, y: 440, radiusM: 4 },
    },
    {
      id: "sc-mrg-finish",
      titleBg: "Продължи по магистралата до края на отсечката",
      params: { kind: "reachZone", x: MWE_X_CRUISE, y: 930, radiusM: 12 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mrg-glance-mirror", titleBg: "Ляво огледало, докато ускоряваш в лентата" },
        { id: "sc-mrg-glance-shoulder", titleBg: "Мъртва зона през рамо, преди да завъртиш волана" },
      ],
    },
    parTimeSec: 55,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeAccelLane.ts; gates in traces/__tests__/
  // sc-merge-accel-lane-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-accel-lane/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-accel-lane/mistake-stop-at-end.trace.json" },
      titleBg: "Спиране в края на лентата за ускоряване",
      whatWentWrongBg:
        "Лентата за движение беше свободна, а водачът все пак наби спирачките до пълен стоп в края на лентата за ускоряване — от чиста несигурност. Това е рязко спиране без причина: точно зад теб по рампата идват други, а после ще потегляш от място сред коли със 140 км/ч. Спирането в края на лентата е КРАЙНА мярка, когато наистина няма пролука — не начин да отложиш решението. Лентата за ускоряване съществува, за да не се налага: използвай я, за да изравниш скоростта.",
      codeRefs: ["HARSH_BRAKING_NO_CAUSE"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-accel-lane/mistake-blind-merge.trace.json" },
      titleBg: "Вливане без оглеждане пред идваща кола",
      whatWentWrongBg:
        "Мигачът светна и воланът тръгна наляво в същата секунда — без нито един поглед в огледалото и без проверка на мъртвата зона. По магистралата обаче вече идваше кола: предимството е нейно (чл. 55) и разликата в скоростите не прощава. Мигачът обявява намерението ти, но не проверява дали лентата е свободна — това правят огледалото и рамото, ПРЕДИ волана.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всеки вход на автомагистрала и скоростен път — и в умален вид при всяко включване в движението от рампа, отбивка или паркинг. Лентата за ускоряване не е чакалня, а разгон: тя ти дава точно толкова метри, колкото са нужни, за да станеш част от потока, вместо препятствие в него.",
    whyBg:
      "Разликата в скоростите убива на магистралата. Кола, която се влива с 60 в поток от 130, е неподвижна стена за идващия отзад — той има под две секунди да реши. Затова законът дава предимството на движещите се по магистралата, а на теб — лента, в която да изравниш скоростта: ускоряваш, гледаш, вписваш се. Обратното — спиране в края на лентата „да ме пуснат“ — те оставя да потегляш от нула сред коли със 140 км/ч, което е най-опасният възможен старт.",
    lawRef: "ЗДвП чл. 55",
    examinerBg:
      "Изпитващият гледа три неща: използва ли се лентата за ускоряване докрай (скорост, близка до потока, на края ѝ), има ли пълна проверка преди маневрата — ляв мигач, огледало и мъртва зона през рамо — и вписва ли се вливането без да принуждава някого по магистралата да спира или да отбива. Спиране без причина в лентата за ускоряване и вливане без оглеждане са основни грешки; принуждаването на движещ се по магистралата да спре рязко е опасна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: rain. Deliberately NO physics.wetGrip — the authored ghost envelope
    // of this template is dry-tuned (the ADR-006 stage-4a opt-in rule), and the
    // taught delta here is the conditions speed envelope (0.85 × 140), not
    // braking distance.
    { level: 5, conditions: { weather: "rain" } },
  ],
  staged: [MWE_MAINLINE_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-merge-lane-end — „Краят на лентата — вливане с цип"
// (OV-16 „Цип-принцип" + OV-01/OV-02, the lane-change duties)
// ---------------------------------------------------------------------------

/** ln-merge-v1 lane centers (meta.scenario — the L7 copy truth). */
const LNM_X_ENDING = 4.06; // laneId 0 — the curb lane the drill starts in; it dies
const LNM_X_THROUGH = -4.06; // laneId 1 — the lane that survives the taper
/** ln-merge-v1 story arclengths in district y (meta.scenario). */
const LNM_TAPER_FROM_Y = 180; // the 60 m taper begins
const LNM_TAPER_TO_Y = 240; // …and the ending lane is gone from here
const LNM_END_Y = 280;

/**
 * THE CAR YOU MUST NOT CUT OFF: the shipped rearTailgater actor armed in the
 * THROUGH lane (extraRightOffsetM = −one lane pitch off the graph's curb-lane
 * path ⇒ x ≈ −4.06), released once the player is clear of the spawn. It closes
 * up, keeps station behind the player through the pressure window, and then —
 * because its lane is the one that continues — accelerates BY at the posted 50
 * (passShiftM = 0: it passes in its own lane, never through the player). The
 * пролука behind it is the one the taught drive merges into.
 *
 * PRESSURE SCENERY under the learn-only policy (doc 72 FO-07): the runner
 * emits ZERO SimTick events — no violation and no collision can grade from it.
 * Everything graded here is the player's own channel: the lane-change
 * indicator/mirror pair, and the objective gate past the taper. That is also
 * why the blind-merge demo's contact is an AUTHORED beat (DriveStep.collision,
 * the scMergeAccelLane precedent), not a physical overlap.
 */
const LNM_THROUGH_CAR: RearTailgaterSpec = {
  id: "sc-mle-through-car",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["lnm-n-start", "lnm-n-end"],
    hold: { nodeIndex: 0, offsetM: 8 }, // dormant just behind the player's spawn
    cruiseSpeedMps: 13.9, // 50 km/h — the posted limit of the through lane
    // buildLaneGraph rides a oneway edge's lane on the CURB lane (x ≈ +4.06);
    // one lane pitch LEFT of it is the through lane the player must join.
    extraRightOffsetM: -(LNM_X_ENDING - LNM_X_THROUGH),
    colorIndex: 3,
  },
  releaseGapM: 26, // it rolls once the player is properly under way
  followBehindM: 14, // ~10 m of bumpers in the next lane — visible, not glued
  maxMatchSpeedMps: 16, // it can close up even on a brisk player
  pressureSec: 2.5,
  passShiftM: 0, // its OWN lane is the surviving one — no shift to make
  passSpeedMps: 13.9, // 50 km/h — the flow you are expected to fit into
  passAheadM: 24, // …and once it is this far by, the пролука behind it is yours
  easeKmh: 8,
};

/**
 * OV-16 — цип-принцип при край на лента (ЗДвП чл. 25: маневрата се извършва,
 * след като водачът се убеди, че е безопасна, и подаде сигнал; предимството е
 * на движещите се по платното, в чиято лента се влизаш). The taught norm,
 * grounded in the content bank (q-predimstvo-061, q-manevri-006/007/008):
 * ТВОЯТА лента свършва → ти си този, който се съобразява → огледало + мигач +
 * пролука, а не изтласкване.
 */
export const SC_MERGE_LANE_END: ScenarioSpec = {
  id: "sc-merge-lane-end",
  family: "merging",
  tagsBg: ["вливане", "цип-принцип", "край на лента", "престрояване", "огледала", "мигач"],
  titleBg: "Краят на лентата — вливане с цип",
  objectiveBg:
    "Когато твоята лента свършва, ти осигуряваш вливането: огледай, дай мигач и се впиши в пролука, без да изтласкваш движещите се в съседната лента.",
  archetypeIds: ["OV-16", "OV-01", "OV-02"],
  conceptIds: ["c-merging-traffic", "c-lane-change", "c-lane-choice", "c-mirrors-blind-spots", "c-driver-signals"],
  map: {
    archetype: "merge-lane",
    // The generator recipe — mirrored in ln-merge-v1.json meta.scenario.params
    // (tools/maps/gen_ln_merge.mjs).
    params: { lengthM: 280, taperFromM: 180, taperM: 60, maxspeedKmh: 50, lanesBefore: 2, lanesAfter: 1 },
    districtId: "ln-merge-v1",
  },
  start: {
    spawnPointId: "lnm-spawn-ending-lane",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгваш в дясната лента на еднопосочна улица. След около 180 метра тази лента свършва — стеснението е твое, не на другите." },
    { n: 2, textBg: "Забележи края на лентата РАНО. Колкото по-рано го видиш, толкова повече метри имаш, за да се впишеш спокойно — вместо да се бориш за сантиметри на самия край." },
    { n: 3, textBg: "Погледни в лявото огледало: с каква скорост се движи колата в лявата лента и къде е пролуката зад нея?" },
    { n: 4, textBg: "Изравни темпото си с потока в лявата лента. Ако колата до теб е почти наравно — отпусни газта и я пусни да мине; пролуката зад нея е твоята." },
    { n: 5, textBg: "Подай ляв мигач, провери огледалото И мъртвата зона през рамо — и чак тогава завърти волана. Мигачът обявява, но не оглежда." },
    { n: 6, textBg: "Влез в пролуката с едно плавно движение и изключи мигача. Твоята лента свърши — значи ти се съобразяваш: никой в лявата лента не бива да спира или да отбива заради теб." },
  ],
  success: [
    {
      id: "sc-mle-merge",
      titleBg: "Влей се в оставащата лента преди края на своята",
      // Radius 3.5 < half the 8.125 m lane pitch: satisfiable ONLY from the
      // through lane, and pinned just short of the taper's end — a car still
      // riding the dying lane at y = 236 misses it entirely. THIS is what
      // grades „did you actually get out" (the lane-drop world zone does not
      // exist yet — see gen_ln_merge.mjs's header).
      params: { kind: "reachZone", x: LNM_X_THROUGH, y: 236, radiusM: 3.5 },
    },
    {
      id: "sc-mle-finish",
      titleBg: "Продължи по оставащата лента до края на отсечката",
      params: { kind: "reachZone", x: LNM_X_THROUGH, y: 270, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mle-glance-mirror", titleBg: "Ляво огледало, докато лентата ти още я има" },
        { id: "sc-mle-glance-shoulder", titleBg: "Мъртва зона през рамо, преди да завъртиш волана" },
      ],
    },
    parTimeSec: 40,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeLaneEnd.ts; gates in traces/__tests__/
  // sc-merge-lane-end-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-lane-end/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-lane-end/mistake-no-indicator.trace.json" },
      titleBg: "Вливане без мигач в последния метър",
      whatWentWrongBg:
        "Водачът изчака до самия край на лентата и се пъхна наляво — без нито един мигач. Огледалото беше погледнато, но това не стига: мигачът не е учтивост, а ЕДИНСТВЕНИЯТ начин другите да разберат намерението ти, преди то да се е случило (чл. 25). Колата отляво няма как да ти направи място за маневра, която не си обявил — тя научава за нея в момента, в който вече си пред нея. Краят на лентата не е изненада: той е обозначен и се вижда отдалеч. Мигачът тръгва ПРЕДИ волана, не заедно с него.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-lane-end/mistake-push-out.trace.json" },
      titleBg: "Изтласкване на кола от съседната лента",
      whatWentWrongBg:
        "Мигачът светна и воланът тръгна веднага след него — без нито един поглед в огледалото и без проверка на мъртвата зона. В лявата лента обаче вече имаше кола: тя се движи по своята лента, а твоята свършва — значи ти си този, който се съобразява. „Ще ме пуснат“ не е маневра. Мигачът обявява намерението ти, но не проверява дали лентата е свободна — това правят огледалото и рамото, ПРЕДИ волана.",
      codeRefs: ["LANE_CHANGE_WITHOUT_MIRROR_CHECK", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяко стеснение, ремонт или край на лента — и на всяко място, където две ленти стават една. В града това е ежедневие: лента, която свършва преди кръстовище, затворена от ремонт лента, стеснение заради паркирали коли.",
    whyBg:
      "Правилото е просто и почти винаги пренебрегвано: който има лента, продължава; чиято лента свършва, той се вписва. Цип-принципът работи само ако вливащият се подаде сигнал и изчака пролука, а не си я вземе насила. Двете типични катастрофи тук са огледални: единият се пъха, без да гледа, и удря; другият се бори за сантиметри до самия конус и принуждава цяла колона да спира. И двете идват от едно и също — решението е взето твърде късно. Забележиш ли края на лентата 200 метра по-рано, маневрата става скучна, а скучното е безопасно.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа кога забелязваш стеснението, а не как се измъкваш от него: ранно решение, огледало и мъртва зона преди волана, мигач с достатъчно преднина и вливане в пролука с едно движение. Вливане без мигач и вливане без оглеждане са основни грешки; принуждаването на движещ се в съседната лента да спира или да отбива е опасна.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: a SECOND through-lane car — denser pressure in the lane you must
    // join, so the пролука has to be chosen, not just taken. It rides the same
    // path one pitch left of the graph lane and is released later, so the two
    // cars arrive as a pair. Learn-only scenery, exactly like the first.
    {
      level: 5,
      stagedAdd: [
        {
          ...LNM_THROUGH_CAR,
          id: "sc-mle-through-car-2",
          actor: { ...LNM_THROUGH_CAR.actor, hold: { nodeIndex: 0, offsetM: 44 }, colorIndex: 5 },
          releaseGapM: 8,
          followBehindM: 30,
          pressureSec: 4,
          passAheadM: 40,
        } satisfies RearTailgaterSpec,
      ],
    },
  ],
  staged: [LNM_THROUGH_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-merge-roadworks-shift — „Ремонт затваря лентата ти"
// (SN-07 „Временна организация" + OV-16, OV-02, OV-12)
// ---------------------------------------------------------------------------

/** hz-roadworks-v1 lane centers (meta.scenario — the L7 copy truth). */
const HZR_X_CLOSED = 4.06; // laneId 0 — the curb lane the drill starts in; cones own it
const HZR_X_OPEN = -4.06; // laneId 1 — the lane that survives the closure
/** hz-roadworks-v1 story arclengths in district y (meta.scenario). */
const HZR_TAPER_FROM_Y = 216; // the 24 m cone taper begins
const HZR_WORKS_FROM_Y = 240; // …the lane is gone, and the ВРЕМЕННО 30 starts here
const HZR_WORKS_TO_Y = 276; // the site ends; 50 resumes

/**
 * THE CAR ALREADY IN THE LANE YOU NEED: the shipped rearTailgater actor armed
 * in the OPEN lane (extraRightOffsetM = −one lane pitch off the graph's
 * curb-lane path ⇒ x ≈ −4.06), walking all three collinear segments. It closes
 * up, keeps station behind the player through the pressure window, and then —
 * because its lane is the one that continues — accelerates BY at the approach's
 * posted pace (passShiftM = 0: it passes in its own lane, never through the
 * player). The пролука behind it is the one the taught drive merges into.
 *
 * PRESSURE SCENERY under the learn-only policy (doc 72 FO-07): the runner emits
 * ZERO SimTick events — no violation and no collision can grade from it.
 * Everything graded here is the player's own channel: the lane-change
 * indicator/mirror pair, the works pace, the cone contacts and the line.
 */
const HZR_THROUGH_CAR: RearTailgaterSpec = {
  id: "sc-mrs-through-car",
  kind: "rearTailgater",
  actor: {
    pathNodes: ["hzr-n-start", "hzr-n-works-start", "hzr-n-works-end", "hzr-n-end"],
    hold: { nodeIndex: 0, offsetM: 8 }, // dormant just behind the player's spawn
    cruiseSpeedMps: 12.5, // 45 km/h — the flow of the lane that continues
    // buildLaneGraph rides a oneway edge's lane on the CURB lane (x ≈ +4.06);
    // one lane pitch LEFT of it is the open lane the player must join.
    extraRightOffsetM: -(HZR_X_CLOSED - HZR_X_OPEN),
    colorIndex: 3,
  },
  releaseGapM: 26, // it rolls once the player is properly under way
  followBehindM: 14, // ~10 m of bumpers in the next lane — visible, not glued
  maxMatchSpeedMps: 15, // it can close up even on a brisk player
  pressureSec: 2.5,
  passShiftM: 0, // its OWN lane is the surviving one — no shift to make
  passSpeedMps: 12.5,
  passAheadM: 24, // …and once it is this far by, the пролука behind it is yours
  easeKmh: 8,
};

/**
 * SN-07 / OV-16 — временна организация на движението при ремонт (ЗДвП чл. 25:
 * маневрата се извършва, след като водачът се убеди, че е безопасна, и подаде
 * сигнал; Наредба № 2/2001: временните знаци и маркировка отменят постоянните и
 * се спазват като всяка друга сигнализация). The taught norm, grounded in the
 * content bank (q-manevri-033, q-signali-i-markirovka-032/060, q-signs-013):
 * временната сигнализация е закон → снижаваш скоростта → вливаш се РАНО в
 * отворената лента → държиш новата траектория през целия участък.
 */
export const SC_MERGE_ROADWORKS_SHIFT: ScenarioSpec = {
  id: "sc-merge-roadworks-shift",
  family: "merging",
  tagsBg: ["ремонт", "временна организация", "стеснение", "вливане", "конуси", "мигач"],
  titleBg: "Ремонт затваря лентата ти",
  objectiveBg:
    "Следвай временната сигнализация: снижи скоростта, влей се в отворената лента и дръж новата траектория през стеснението.",
  archetypeIds: ["SN-07", "OV-16", "OV-02", "OV-12"],
  conceptIds: [
    "c-temporary-signalization",
    "c-merging-traffic",
    "c-lane-change",
    "c-mirrors-blind-spots",
    "c-driver-signals",
    "c-speed-adaptation",
  ],
  map: {
    archetype: "merge-lane",
    // The generator recipe — mirrored in hz-roadworks-v1.json
    // meta.scenario.params (tools/maps/gen_hz_roadworks.mjs).
    params: {
      approachM: 240,
      worksM: 36,
      exitM: 34,
      taperM: 24,
      maxspeedKmh: 50,
      worksKmh: 30,
      lanesBefore: 2,
      lanesAfter: 1,
    },
    districtId: "hz-roadworks-v1",
  },
  start: {
    spawnPointId: "hzr-spawn-closed-lane",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Тръгваш в дясната лента на еднопосочна улица. Напред има ремонт: конусите започват да стесняват твоята лента на 216-ия метър и я затварят напълно на 240-ия." },
    { n: 2, textBg: "Временната сигнализация отменя постоянната. Каквото пише на нея — това важи: тук ограничението в участъка е 30, а не 50." },
    { n: 3, textBg: "Забележи стеснението РАНО. Конусите се виждат отдалеч — колкото по-рано решиш, толкова по-спокойно се вписваш, вместо да се бориш за сантиметри до последния конус." },
    { n: 4, textBg: "Погледни в лявото огледало: с каква скорост върви колата в лявата лента и къде е пролуката зад нея? Отпусни газта и я пусни да мине — пролуката ЗАД нея е твоята." },
    { n: 5, textBg: "Подай ляв мигач, провери огледалото И мъртвата зона през рамо — и чак тогава завърти волана. Мигачът обявява, но не оглежда." },
    { n: 6, textBg: "Снижи до 30 преди участъка и дръж новата траектория през целия ремонт: между конусите се работи, а мястото е тясно за всички." },
    { n: 7, textBg: "Изключи мигача и продължи спокойно. Чак след края на участъка ограничението пак става 50." },
  ],
  success: [
    {
      id: "sc-mrs-merged",
      titleBg: "Влей се в отворената лента, преди конусите да затворят твоята",
      // Radius 3.5 < half the 8.125 m lane pitch: satisfiable ONLY from the
      // open lane, and pinned just short of where the taper finishes the job —
      // a car still riding the closed lane at y = 234 misses it entirely. THIS
      // is what grades „did you actually get out" (see gen_hz_roadworks.mjs's
      // header: the lane-closure world zone does not exist yet).
      params: { kind: "reachZone", x: HZR_X_OPEN, y: 234, radiusM: 3.5 },
    },
    {
      id: "sc-mrs-works-pace",
      titleBg: "Мини през участъка по временната лента и с временната скорост",
      // The template's second duty, made graded: pinned mid-site on the open
      // lane's line AND capped at the graced 30 (33), so it is satisfiable only
      // by a driver who is both in the right place and at the posted pace. A
      // car threading the cone line at x ≈ 0 is 3.8 m away and misses it.
      params: { kind: "reachZone", x: HZR_X_OPEN, y: 258, radiusM: 3.5, maxSpeedKmh: 33 },
    },
    {
      id: "sc-mrs-finish",
      titleBg: "Продължи по отворената лента до края на отсечката",
      params: { kind: "reachZone", x: HZR_X_OPEN, y: 290, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mrs-glance-mirror", titleBg: "Ляво огледало, докато лентата ти още я има" },
        { id: "sc-mrs-glance-shoulder", titleBg: "Мъртва зона през рамо, преди да завъртиш волана" },
      ],
    },
    parTimeSec: 45,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeRoadworksShift.ts; gates in traces/__tests__/
  // sc-merge-roadworks-shift-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-roadworks-shift/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-roadworks-shift/mistake-no-indicator.trace.json" },
      titleBg: "Вливане в последния момент без мигач",
      whatWentWrongBg:
        "Водачът изчака до последните метри преди конусите и се пъхна наляво — без нито един мигач. Огледалото беше погледнато, но това не стига: мигачът не е учтивост, а ЕДИНСТВЕНИЯТ начин другите да разберат намерението ти, преди то да се е случило (чл. 25). Ремонтът не е изненада — конусите се виждат от стотина метра, а знаците го обявяват още по-рано. Който реши рано, обявява спокойно; който отлага, накрая се пъха мълчаливо и се надява. Мигачът тръгва ПРЕДИ волана, не заедно с него.",
      codeRefs: ["LANE_CHANGE_WITHOUT_INDICATOR"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-roadworks-shift/mistake-squeeze-cones.trace.json" },
      titleBg: "Провиране през конусите",
      whatWentWrongBg:
        "Вместо да се влее, водачът реши да „пробва“ дали ще се промъкне: задържа затворената лента до самите конуси, събори ги и после се повлече по границата на участъка — нито в своята лента, нито в чуждата. Конусите не са украса, а временна маркировка: те очертават мястото, където работят хора (Наредба № 2/2001). Возенето по линията е втората половина на същата грешка — колата не е никъде, а всички около нея трябва да гадаят. Затворена лента се напуска навреме и с една маневра, а не се преговаря конус по конус.",
      codeRefs: ["COLLISION", "POOR_LANE_KEEPING"],
    },
  ],
  teach: {
    whenBg:
      "На всеки ремонт, стеснение или временна организация на движението — в града това е ежедневие: затворена лента, изместена траектория, временни знаци върху постоянните. Същият рефлекс работи и при всяко друго стеснение: катастрофа, паднал товар, коли на пътна помощ.",
    whyBg:
      "Временната сигнализация отменя постоянната — това е целият закон в едно изречение. Знакът за 30 при ремонт не е препоръка и не е „за да им е спокойно“: между конусите има хора на метър от колата ти, платното е тясно, а траекторията е нова и никой не я знае наизуст. Двете типични грешки тук са огледални: единият се пъха в последния метър без мигач и изненадва цяла колона; другият решава, че конусите са за другите, и се провира по границата. И двете идват от едно и също — решението е взето твърде късно. Забележиш ли стеснението 200 метра по-рано, маневрата става скучна, а скучното е безопасно.",
    lawRef: "ЗДвП чл. 25; Наредба № 2/2001",
    examinerBg:
      "Изпитващият гледа кога забелязваш временната сигнализация, а не как се измъкваш от нея: ранно решение, огледало и мъртва зона преди волана, мигач с достатъчно преднина, вливане с едно движение и спазване на временното ограничение през целия участък. Вливане без мигач и возене по линията са основни грешки; събарянето на конус и принуждаването на движещ се в съседната лента да спира са опасни.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: night + rain — the works under lamps, the classic Sofia frame (a
    // closure is signalled the same way at 03:00 as at noon, and the cones read
    // worse wet). Deliberately NO physics.wetGrip: the authored ghost envelope
    // of this template is dry-tuned (the ADR-006 stage-4a opt-in rule), and the
    // taught delta here is READING the temporary signalling, not braking
    // distance.
    { level: 5, conditions: { weather: "rain", night: true } },
  ],
  staged: [HZR_THROUGH_CAR],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The merging-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_MERGING: readonly ScenarioSpec[] = [
  SC_MERGE_ACCEL_LANE,
  SC_MERGE_LANE_END,
  SC_MERGE_ROADWORKS_SHIFT,
];
