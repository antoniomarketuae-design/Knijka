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
 *  - sc-merge-bus-pullout „Автобусът потегля от спирката"
 *    (VU-11 + FO-03, mg-busstop-v1 — tools/maps/gen_mg_busstop.mjs); the odd one
 *    out: here SOMEONE ELSE merges and the duty is to LET them (ЗДвП чл. 67)
 *  - sc-merge-from-property „Излизане от бензиностанция през тротоара"
 *    (OV-15 + PE-03, mg-property-v1 — tools/maps/gen_mg_property.mjs); the
 *    family's smallest merge and its strictest: leaving a property you yield to
 *    EVERYONE — pavement first, then the flow (ЗДвП чл. 25)
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

import type {
  CutInLeadCarSpec,
  OncomingStreamSpec,
  PedestrianDartOutSpec,
  RearTailgaterSpec,
} from "../../contracts";
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

// ---------------------------------------------------------------------------
// sc-merge-bus-pullout — „Автобусът потегля от спирката"
// (VU-11 „Потеглящ автобус" + FO-03 — the cut-in actor recipe, inverted)
// ---------------------------------------------------------------------------

/** mg-busstop-v1 lane centers (meta.scenario — the L7 copy truth). The EXACT
 *  (unrounded) lane-graph values: the district battery pins meta's rounded
 *  12.19/4.06 against these, and everything below is written in these. */
const MGB_X_BUS = 12.1875; // laneId 0 — the бус лента; the спирка sits in it
const MGB_X_GENERAL = 4.0625; // laneId 1 — the general lane; the player's whole drive
/** One drawn lane width on mg-busstop-v1 (3.25 m × perceptual scale 2.5), m —
 *  the bus's pull-out is exactly this, leftward. */
const MGB_LANE_SHIFT = 8.125;
/** mg-busstop-v1 story arclengths in district y (meta.scenario). */
const MGB_BAY_FROM_Y = 130; // the спирка window opens…
const MGB_BAY_TO_Y = 176; // …and the bus swings out of it here
const MGB_END_Y = 400;

/**
 * THE BUS: the shipped cutInLeadCar actor with the box rig (`profile: "truck"`
 * — the only large-vehicle rig that exists; ADR-001 fictional), dwelling in the
 * бус лента at the спирка and gliding out into the player's lane.
 *
 * WHY IT DWELLS WITHOUT A DWELL COMMAND: the runner issues one matchPlayer with
 * gapM = paceAheadM, whose target is `playerSpeed + 0.55 × (paceAheadM − gap)`
 * CLAMPED AT ZERO (traffic/staged.ts). Held 100+ m ahead of a spawning player,
 * that term is deeply negative, so the rig sits at the спирка with its target
 * pinned to 0 — a genuine dwell, expressed in the shipped controller. It only
 * gets under way when the player closes to roughly paceAheadM + v/0.55 ≈ 55 m
 * of it, which IS the encounter: the bus always pulls out just as you arrive.
 *
 * WHY extraRightOffsetM IS ZERO: buildLaneGraph rides a two-way edge's lane on
 * the CURB lane (x = 12.1875 — the ln-v1 precedent, re-proved on this map by
 * mg-busstop-districts.test.ts), which here IS the бус лента. So the default
 * offset parks the bus exactly where the спирка is, and — decisively — a
 * POSITIVE curb offset is what tags a staged actor as the A11 cyclist proxy.
 * The bus must never be one: it would arm the vulnerable-pass tracker and make
 * „минах покрай автобуса" grade as a cyclist offence.
 *
 * HONEST GAP (flagged — the whole family's discipline): TrafficVehicleState
 * carries NO indicator channel (traffic/types.ts), so the bus CANNOT show the
 * ляв мигач the law and the copy are about. The visible cue is the rig itself
 * rolling out of the bay; the card copy carries „подал ляв мигач", and nothing
 * grades off the missing lamp. Everything graded here is the player's own
 * channel: the ease gate at the pull-out, the gap he keeps afterwards, and the
 * contact he earns by forcing past.
 */
const MGB_BUS: CutInLeadCarSpec = {
  id: "sc-mgb-bus",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["mgb-n-start", "mgb-n-end"],
    hold: { nodeIndex: 0, offsetM: 140 }, // dormant at the спирка, inside the bay
    cruiseSpeedMps: 9,
    extraRightOffsetM: 0, // the graph's curb lane IS the бус лента
    colorIndex: 4,
    profile: "truck", // the box rig — the largest actor the fleet has
  },
  paceAheadM: 30,
  maxMatchSpeedMps: 11, // ~40 km/h: a city bus rolling out, never a sports car
  cutAt: { x: MGB_X_BUS, y: MGB_BAY_TO_Y }, // on the ACTOR's path, at the bay's exit
  cutRadiusM: 4,
  minCutSpeedKmh: 18, // the taught ease (~28) still clears it — the bus comes out
  cutShiftM: -MGB_LANE_SHIFT, // one lane LEFT — out of the бус лента into yours
  cutRampSec: 2.5, // a 12 m rig glides out; it does not dart
  cutSpeedMps: 8.5, // ~31 km/h — a bus getting under way, and staying slow
  clearAheadM: 45,
};

/**
 * VU-11 — потегляне на автобус от спирка (ЗДвП чл. 67: в населено място
 * водачът е длъжен да намали и при необходимост да спре, за да пропусне
 * автобус от редовна линия, подал сигнал, че потегля от спирка).
 *
 * LAW NOTE (ADR-002 — retrieval + citation only; the divergence is flagged, not
 * hidden): the repo's own event library (scenarios/event-library.json
 * ev-bus-pullout) and doc 72 §15 VU-11 both cite чл. 67 — the library entry is
 * itself a recorded correction of an earlier, wrong чл. 100. The QUESTION BANK
 * cites the same duty as „чл. 68?" (q-predimstvo-020/041) and „чл. 69?"
 * (q-manevri-036), every one of them status needs-review, and
 * content/audits/manevri-i-izprevarvane.audit.json argues чл. 69 for the other
 * drivers' duty while c-bus-pullout in concepts.json still says чл. 68?. Three
 * repo sources, three numbers, all flagged — this template cites the library's
 * чл. 67 (the brief's own ref) and the reconciliation belongs to the content
 * review, not to the sim. The SUBSTANCE is not in doubt anywhere: намали, при
 * нужда спри, само в населено място, само за подал сигнал автобус от редовна
 * линия — verbatim the taught norm of q-manevri-036 / q-predimstvo-020/041.
 *
 * WHAT ACTUALLY GRADES (doc 72 VU-11 marks the bus-yield adjudicator 🔴 NEW —
 * `prioritySituation("bus-pullout")` is reserved vocabulary and NOT shipped, so
 * no detector convicts „не пропуснах автобуса"). The drill is therefore graded
 * on channels that exist and are exact:
 *   - the OBJECTIVE gate at the pull-out (maxSpeedKmh 30 on the general lane):
 *     „намали" made a contract — a driver who forces past is simply never
 *     there slowly enough, and objectives advance sequentially, so his run
 *     stops at that gate (the sc-ov-being-overtaken pattern);
 *   - COLLISION, from the contact forcing past earns;
 *   - FOLLOWING_TOO_CLOSE, from the gap he keeps once the bus is in front (the
 *     shipped cut-in pipeline, with its followRecoveryRateMps guard keeping the
 *     honest ease innocent).
 */
export const SC_MERGE_BUS_PULLOUT: ScenarioSpec = {
  id: "sc-merge-bus-pullout",
  family: "merging",
  tagsBg: ["автобус", "спирка", "бус лента", "пропускане", "дистанция", "населено място"],
  titleBg: "Автобусът потегля от спирката",
  objectiveBg:
    "В населено място пропусни автобуса, който е подал ляв мигач да потегли от спирка — намали и го пусни да се влее.",
  archetypeIds: ["VU-11", "FO-03"],
  conceptIds: ["c-bus-pullout", "c-merging-traffic", "c-following-distance", "c-hazard-perception", "c-safety-space"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in mg-busstop-v1.json meta.scenario.params
    // (tools/maps/gen_mg_busstop.mjs).
    params: { lengthM: 400, maxspeedKmh: 50, lanes: 4, bayFromM: 130, bayToM: 176, banKind: "busLane" },
    districtId: "mg-busstop-v1",
  },
  start: {
    spawnPointId: "mgb-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Пътуваш в лявата, обща лента на градска улица. Дясната лента е бус лента — в нея е спирката, и там не се кара." },
    { n: 2, textBg: "Напред, на около 130 метра, на спирката стои автобус от редовната линия. Виж го РАНО: спрелият автобус е подвижна стена — крие пешеходци и всеки момент може да потегли." },
    { n: 3, textBg: "Щом автобусът подаде ляв мигач и тръгне да излиза от спирката, решението вече е взето от закона: в населено място си длъжен да го пропуснеш (чл. 67)." },
    { n: 4, textBg: "Отпусни газта плавно и му отвори мястото. Не се нуждае от твоята учтивост — нуждае се от метрите пред теб." },
    { n: 5, textBg: "Не форсирай покрай него „преди да е излязъл“. Автобусът е дълъг 12 метра и потегля бавно — от кабината му ти си в мъртва зона точно когато решаваш да се промъкнеш." },
    { n: 6, textBg: "След като се влее, се нареди зад него на две секунди. Пред автобус се залепва само този, който няма да види нищо: нито пътя, нито спирачките му, нито пешеходеца отпред." },
  ],
  success: [
    {
      id: "sc-mgb-ease",
      titleBg: "Намали, за да пропуснеш потеглящия автобус",
      // THE чл. 67 CONTRACT, made graded. Radius 5 < the 8.125 m lane pitch, so
      // it is satisfiable ONLY from the general lane; maxSpeedKmh 30 is what
      // „намали и при необходимост спри" means in numbers on a 50 street. The
      // forcing-past demo passes this y at ~48 and misses it outright — and
      // objectives advance sequentially, so its run stops here.
      params: { kind: "reachZone", x: MGB_X_GENERAL, y: 168, radiusM: 5, maxSpeedKmh: 30 },
    },
    {
      id: "sc-mgb-behind-bus",
      titleBg: "Нареди се зад автобуса и го следвай в неговото темпо",
      // The second half of the duty: пропускането не свършва с вдигане на
      // газта. Pinned deep in the run-out, on the general lane, capped just
      // above the bus's own ~31 km/h — a driver who „пропусна" the bus and
      // then went round it is doing 45+ here and misses it.
      params: { kind: "reachZone", x: MGB_X_GENERAL, y: 280, radiusM: 6, maxSpeedKmh: 38 },
    },
    {
      id: "sc-mgb-finish",
      titleBg: "Продължи по общата лента до края на отсечката",
      params: { kind: "reachZone", x: MGB_X_GENERAL, y: 380, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mgb-glance-stop", titleBg: "Оглед на спирката отрано — още преди автобусът да тръгне" },
        { id: "sc-mgb-glance-mirror", titleBg: "Огледало назад, преди да отпуснеш газта" },
      ],
    },
    parTimeSec: 55,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeBusPullout.ts; gates in traces/__tests__/
  // sc-merge-bus-pullout-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-bus-pullout/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-bus-pullout/mistake-force-past.trace.json" },
      titleBg: "Форсиране покрай потеглящия автобус",
      whatWentWrongBg:
        "Автобусът вече излизаше от спирката, а водачът натисна газта — „ще мина преди него“. Мина, но в него. Автобусът е дълъг 12 метра и завива с целия си корпус: докато носът му е още в спирката, задницата му вече е в твоята лента. Шофьорът му седи на два метра над земята и има мъртва зона точно там, откъдето ти реши да се промъкнеш — той няма как да те види и няма как да спре. И най-важното: тук не се преценява, а се пропуска. В населено място законът вече е решил вместо теб (чл. 67) — намаляваш и при необходимост спираш. Няколкото секунди, които „печелиш“, не съществуват: автобусът пак ще е пред теб на следващия светофар.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-bus-pullout/mistake-glue-behind.trace.json" },
      titleBg: "Залепване зад автобуса след вливането",
      whatWentWrongBg:
        "Водачът пропусна автобуса коректно — и веднага след това залепи за него на няколко метра, сякаш да си върне „загубеното“. Пропускането обаче не е услуга, за която да си вземеш ресто. Зад автобус на две коли разстояние ти не виждаш НИЩО: нито платното пред него, нито пешеходеца, който излиза отпред му, нито собствените му стопове навреме. Автобусът спира на всяка спирка, и то по-рязко, отколкото очакваш. Две секунди зад него не са учтивост, а единственото място, от което изобщо можеш да реагираш.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
  ],
  teach: {
    whenBg:
      "На всяка градска спирка, всеки ден, по всяко време — Софийският градски транспорт спира и потегля хиляди пъти на ден. Същият рефлекс работи и при всяко друго превозно средство, което те моли да се влееш: колата от паркомястото, тролейбусът, боклукчийският камион. Разликата е, че за автобуса от редовната линия това не е молба, а закон — и само в населено място.",
    whyBg:
      "Автобусът вози шейсет души, тежи петнайсет тона и потегля бавно. Ако всеки, който минава покрай спирката, реши, че „има още време“, автобусът не потегля никога — затова законът обръща предимството в негова полза, вместо да го остави да чака целия поток. Двете типични грешки тук са огледални и еднакво човешки: единият форсира покрай носа му и се озовава в мъртвата зона на дванайсетметров корпус; другият коректно го пропуска и после залепва за задницата му, защото „все пак изгуби време“. И двете идват от една и съща сметка — че секундите се печелят на пътя. Не се печелят: автобусът ще е пред теб и на следващата спирка. Това, което се губи, е видимостта — а тя е единственото, което имаш.",
    lawRef: "ЗДвП чл. 67",
    examinerBg:
      "Изпитващият гледа кога виждаш автобуса, а не как се разминаваш с него: забелязваш ли спрелия автобус отдалеч, отпускаш ли газта още щом той тръгне да излиза, и оставяш ли му място без да те принуждава да набиваш спирачки в последния момент. Форсирането покрай потеглящ автобус е основна грешка (Н38: непропускане при задължение да пропуснеш); ако принудиш автобуса да спре или се стигне до контакт — опасна. Залепването зад него след вливането е основна грешка по дистанцията.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: „привечер, на мокър път" — the q-uyazvimi-065 frame. HONEST SCOPE:
    // ConditionAxis has no dusk axis (weather + night are the two dials), so
    // привечер renders as the night one — the low-light half of the frame,
    // which is the half that matters for reading a dark rig against a dark
    // curb. Deliberately NO physics.wetGrip: the authored ghost envelope of
    // this template is dry-tuned (the ADR-006 stage-4a opt-in rule), and the
    // taught delta here is SEEING the bus leave, not braking distance.
    { level: 5, conditions: { weather: "rain", night: true } },
  ],
  staged: [MGB_BUS],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-merge-from-property — „Излизане от бензиностанция през тротоара"
// (OV-15 „Включване в движението" at its smallest scale + PE-03)
// ---------------------------------------------------------------------------

/** mg-property-v1 truths (meta.scenario — the L7 copy law; the district
 *  battery world/__tests__/mg-property-districts.test.ts pins every one of
 *  these against the generated map AND against the runtime's own derivation). */
const MFP_Y_EXIT = 4.06; // the outbound (westbound) exit-lane center
const MFP_X_WALK = 34; // mgp-x-walk — the тротоар band across the exit
const MFP_X_LINE = 27.73; // the DERIVED Б2 line on mgp-e-drive (see below)
const MFP_X_LANE = 4.06; // the boulevard's northbound lane center
/** Curb-start convention (the templates-pe LET_PASS_PED recipe, rotated 90°):
 *  half-carriageway 8.125 + 0.4 curb + 1.2 stand-back = 9.73 m off the exit
 *  lane's centerline — here NORTH of it, on the station-shop pavement. */
const MFP_WALK_CURB_Y = 9.73;

/**
 * THE ТРОТОАР WALKER: the shipped pedestrianDartOut actor, walking SOUTH along
 * the pavement across the exit mouth — from the player's RIGHT, which is the
 * half he occupies, so she is in his path from her first step (the templates-pe
 * geometry, rotated onto a driveway).
 *
 * roadFromM/roadToM span the EXIT's carriageway along her walk (9.73 − 8.125 =
 * 1.6 m in, 9.73 + 8.125 = 17.85 m out), so the runtime's crossing-occupancy
 * query — and therefore PEDESTRIAN_NOT_YIELDED / PEDESTRIAN_YIELDED — is
 * measured against the band the player actually crosses, not a street zebra.
 *
 * triggerDistM 22 releases her while the player is still ~22 m up the
 * forecourt: early enough that a 22 km/h roll-off can stop short of the band
 * comfortably (so the walk-through demo grades a REFUSED duty, never a braking
 * failure), late enough that she is mid-band as he arrives.
 */
const MFP_WALKER: PedestrianDartOutSpec = {
  id: "sc-mfp-walker",
  kind: "pedestrianDartOut",
  crossingId: "mgp-x-walk",
  crossing: { x: MFP_X_WALK, y: 0 },
  start: { x: MFP_X_WALK, y: MFP_WALK_CURB_Y },
  dir: { x: 0, y: -1 },
  speedMps: 1.4,
  travelM: 23.45, // curb → across the 16.25 m exit → a few m of south walk-out
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 22,
  minTriggerSpeedKmh: 8,
};

/**
 * THE ПОТОК: the shipped oncomingStream actor — three cars northbound on the
 * boulevard's curb lane (x = 4.06), released by the player's own first metres
 * off the forecourt and then pure clockwork.
 *
 * NAMING, HONESTLY: the spec's doc calls its path „the oncoming bank" because
 * every shipped user stages it head-on. Mechanically it is „N cars on a path
 * with authored spacing, released at a player speed" — which is exactly what a
 * поток is, and the direction is the author's. Here the cars run WITH the node
 * order (mgp-n-s → mgp-n-c → mgp-n-n), so buildLaneGraph rides them on the
 * northbound curb lane: the near bank, the one a right-turner out of the
 * property crosses into. Nothing about the runner assumes head-on.
 *
 * WHY THIS ACTOR AND NOT priorityFromRight (the flagged design call): the
 * priority runner SYNCS its car to arrive `leadSec` before the player's
 * PROJECTED line-crossing and commits once he is 22 m from his line
 * (PRIORITY_COMMIT_PLAYER_M). On this map the player is inside 22 m of the Б2
 * before he even reaches the тротоар — and then he stops there for ~12 s of
 * walker. The synced car would launch, cross and sprint clear long before he
 * ever met the line, and „изчакай потока" would be a claim about an empty road.
 * A clockwork stream is the only shipped actor whose timing survives a player
 * who legitimately stops twice on one approach.
 *
 * LEARN-ONLY SCENERY (doc 72 FO-07): the runner emits ZERO SimTick events bar
 * a contact. What convicts is the PLAYER's own channel — the runtime's give-way
 * adjudication at the derived Б2 (conflictNear over PRIORITY_CONFLICT_RADIUS_M
 * at the moment he crosses the line), which is чл. 25 exactly: crossing out of
 * a property while someone is coming, from either side.
 */
const MFP_STREAM: OncomingStreamSpec = {
  id: "sc-mfp-stream",
  kind: "oncomingStream",
  actor: {
    pathNodes: ["mgp-n-s", "mgp-n-c", "mgp-n-n"],
    // Dormant at the south end with 52 m of arc BEHIND the head, so the two
    // followers have somewhere to sit. Authored at exactly gapsM[0] + gapsM[1]
    // (founder review 2026-07-27, „the other cars waiting … get in the lane
    // infront"): at offsetM 0 the runner clamps every follower's negative arc to
    // the path start, so all three bodies were staged in the SAME metre —
    // „три коли минаха" rendered as one car, and the drill's whole premise (a
    // COLUMN with no gap in it) was invisible. The 52 m puts the HEAD 3.7 s
    // earlier; the TAIL keeps its original arc (0) and therefore its original
    // clock, which is the number both the shadow's 9 s wait and the mistake's
    // conviction hang on — see traces/scMergeFromProperty.ts.
    hold: { nodeIndex: 0, offsetM: 52 },
    cruiseSpeedMps: 14, // 50 km/h — the posted limit, driven at the posted limit
    colorIndex: 2,
  },
  count: 3,
  // CUMULATIVE arcs behind the head (the runner reads gapsM[i-1] as car i's own
  // offset from car 0, not as a per-pair headway): 26 and 52 ⇒ a 26 m headway,
  // ~1.9 s at 50 — a real Sofia boulevard column. The shipped [26, 26] put cars
  // 1 and 2 on the same arc, which is why spacing the head alone still rendered
  // a two-car pile.
  gapsM: [26, 52],
  releaseKmh: 15, // the player's own roll-off starts the clock
};

/**
 * OV-15 / PE-03 — излизане от имот (ЗДвП чл. 25, ал. 1: водачът, който
 * навлиза в пътното платно от прилежащ имот, е длъжен да пропусне пътните
 * превозни средства и пешеходците, които се движат по него; ал. 2: при
 * маневрата водачът е длъжен да пропусне пешеходците). The taught norm,
 * grounded in the content bank (q-manevri-003/022/064, q-predimstvo-018,
 * q-krastovishta-056, q-uyazvimi-020): излизаш от имот → нямаш предимство пред
 * НИКОГО → тротоарът първо, после потокът → сигналът обявява, не дава.
 *
 * WHAT ACTUALLY GRADES, and why the map is shaped the way it is (the whole
 * design in one place — see tools/maps/gen_mg_property.mjs's header):
 *
 *   - „не пропуснах пешеходеца по тротоара" → PEDESTRIAN_NOT_YIELDED, from the
 *     shipped crossing-occupancy chain. The тротоар is authored as a district
 *     CROSSING on the exit edge, so the duty is measured, not narrated.
 *   - „не пропуснах потока" → FAILED_TO_YIELD, from the runtime's give-way
 *     adjudication at a Б2 line the map DERIVES rather than declares: the
 *     boulevard is `primary` (rank 5) and the exit is `service` (rank 1), so
 *     the minor-meets-arterial heuristic (runtime/stoplines.ts) puts the line
 *     at the exit's mouth and the world builder paints the matching Б2. There
 *     is no other shipped way to convict a property exit: чл. 25 has no
 *     dedicated detector, and the uncontrolled right-hand-rule tracker would
 *     acquit exactly the car this drill is about (it comes from the LEFT).
 *     conflictNearFor excludes only SAME-DIRECTION traffic — which makes the
 *     derived line grade чл. 25's „пропусни всички" faithfully.
 *   - THE ORDER IS THE TEMPLATE. The тротоар (x = 34) sits OUTSIDE the derived
 *     line (x = 27.73), so the two demos fail on two different beats and
 *     neither can leak the other's codes (the generator VALIDATES that gap).
 *
 * HONEST GAP (flagged, ADR-002 discipline — the card copy says велоалея because
 * the real чл. 25 duty covers it, and the student's real exit crosses one):
 * DistrictZoneKind has no cycle-lane member and the world builder paints no
 * cycle track, so the велоалея is TAUGHT and never GRADED. No rider is staged;
 * nothing here pretends a bike lane is measured. The pavement carries the
 * vulnerable-user duty this drill grades.
 */
export const SC_MERGE_FROM_PROPERTY: ScenarioSpec = {
  id: "sc-merge-from-property",
  family: "merging",
  tagsBg: ["изход от имот", "бензиностанция", "тротоар", "предимство", "вливане", "пешеходци"],
  titleBg: "Излизане от бензиностанция през тротоара",
  objectiveBg:
    "На изхода от имот пресичаш тротоар и велоалея: пропусни пешеходците, колоездачите и потока на пътя — мигачът не ти дава предимство.",
  archetypeIds: ["OV-15", "PE-03"],
  // Integration fix (wave 5): the authored list cited "c-right-of-way-basics"
  // and "c-pedestrian-priority" — neither exists in the content/concepts.json
  // 152-graph, so templates.test.ts's registry check rejected the spec. Mapped
  // onto the real ids that carry this drill's duties: c-exit-from-adjacent IS
  // ЗДвП чл. 25 (излизане от прилежаща територия), c-pedestrian-rights-duties
  // carries the тротоар yield.
  conceptIds: [
    "c-merging-traffic",
    "c-exit-from-adjacent",
    "c-pedestrian-rights-duties",
    "c-driver-signals",
    "c-hazard-perception",
  ],
  map: {
    archetype: "t-junction",
    // The generator recipe — mirrored in mg-property-v1.json
    // meta.scenario.params (tools/maps/gen_mg_property.mjs).
    params: { southM: 260, northM: 140, exitM: 68, walkX: 34, streetKmh: 50, exitKmh: 20 },
    districtId: "mg-property-v1",
  },
  start: {
    spawnPointId: "mgp-spawn-forecourt",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Ти си на изхода на бензиностанцията, с лице към булеварда. Между теб и платното има тротоар и велоалея — те не са „ничия земя“, а чужда територия." },
    { n: 2, textBg: "Тръгни бавно и спри ПРЕД тротоара, не върху него. Оттам се вижда надлъж по пешеходната зона; спреш ли върху нея, вече си отнел нечий път, за да видиш нещо." },
    { n: 3, textBg: "Пропусни пешеходците и колоездачите. Ти излизаш от имот — предимството е тяхно, независимо колко бързаш и колко празен изглежда тротоарът." },
    { n: 4, textBg: "Освободи ли се тротоарът напълно — не „почти“ — продължи бавно до знака Б2 на изхода и спри напълно на линията." },
    { n: 5, textBg: "Оттук гледаш само едно: потока по булеварда. Изчакай да мине целият — пролуката, която ти трябва, е ЗАД последната кола, а не между колите." },
    { n: 6, textBg: "Подай десен мигач и се влей плавно, когато платното е наистина свободно. Мигачът обявява намерението ти — той не създава предимство и не кара никого да спре." },
    { n: 7, textBg: "След вливането ускори до скоростта на потока. Кола, която изпълзява от имот и после се мъкне, е същият проблем, само по-късно." },
  ],
  success: [
    {
      id: "sc-mfp-walk-yield",
      titleBg: "Спри пред тротоара и пропусни пешеходеца",
      // THE чл. 25, ал. 2 CONTRACT, made graded. Pinned 3.5 m before the band
      // on the exit lane, capped at 5 km/h: satisfiable ONLY by a car that
      // actually came to rest short of the pavement. The walk-through demo
      // passes this x at 25 km/h and misses it outright — and objectives
      // advance sequentially, so its run stops here.
      params: { kind: "reachZone", x: 37.5, y: MFP_Y_EXIT, radiusM: 3, maxSpeedKmh: 5 },
    },
    {
      id: "sc-mfp-stop-line",
      titleBg: "Спри напълно на Б2 на изхода",
      // The second duty, on the derived line's own metre: radius 3 at 3 km/h
      // is a real halt, not a roll. Both the shadow AND the „с мигача“ demo
      // clear it — which is the point of that card: everything up to here was
      // right.
      params: { kind: "reachZone", x: 29, y: MFP_Y_EXIT, radiusM: 3, maxSpeedKmh: 3 },
    },
    {
      id: "sc-mfp-merged",
      titleBg: "Влей се в лентата на булеварда",
      // Radius 4 < half the 8.125 m lane pitch, pinned 40 m up the northbound
      // lane: satisfiable only from the correct bank, and only by a car that
      // actually joined rather than nosed out and stopped.
      params: { kind: "reachZone", x: MFP_X_LANE, y: 40, radiusM: 4 },
    },
    {
      id: "sc-mfp-finish",
      titleBg: "Продължи по булеварда до края на отсечката",
      params: { kind: "reachZone", x: MFP_X_LANE, y: 118, radiusM: 8 },
    },
  ],
  rubric: {
    observation: {
      moments: [
        { id: "sc-mfp-glance-walk", titleBg: "Оглед по тротоара — преди да го пресечеш" },
        { id: "sc-mfp-glance-flow", titleBg: "Оглед наляво по булеварда — от линията, преди да тръгнеш" },
      ],
    },
    parTimeSec: 60,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scMergeFromProperty.ts; gates in traces/__tests__/
  // sc-merge-from-property-traces.test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-merge-from-property/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-merge-from-property/mistake-walk-through.trace.json" },
      titleBg: "Изнасяне през тротоара без спиране",
      whatWentWrongBg:
        "Колата излезе от бензиностанцията, без да спре нито веднъж — погледът беше вече на булеварда, търсеше пролука. А между двора и булеварда има тротоар, и по него вървеше човек. Точно това е капанът: докато търсиш предимството, което ти трябва, пропускаш задължението, което имаш. Тротоарът не е част от изхода ти — той е пътят на пешеходеца и ти го ПРЕСИЧАШ. Излизането от имот е маневра (чл. 25): в нея ти се съобразяваш с всички — пешеходци, колоездачи, коли — и никой не се съобразява с теб. Скоростта тук дори не беше висока; вината не е в километрите, а в това, че решението „ще мина“ беше взето, преди да е погледнато.",
      codeRefs: ["PEDESTRIAN_NOT_YIELDED", "COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-merge-from-property/mistake-signal-and-go.trace.json" },
      titleBg: "Вливане „с мигача“ пред потока",
      whatWentWrongBg:
        "Всичко до знака беше учебникарско: бавно потегляне, спиране пред тротоара, изчакан пешеходец, пълно спиране на Б2. И после — мигач и газ, в същата секунда. По булеварда обаче идваха коли и те трябваше да се съобразят с човек, който излиза от двор. Мигачът е ОБЯВЯВАНЕ на намерение, а не предимство: той казва „ще завия“, не „пуснете ме“ (чл. 25). Пролуката, от която имаш нужда, не е между колите — тя е зад последната. Разликата с правилното каране е едно решение и няколко секунди; разликата в последствията е между скучно излизане и кола, набила спирачки в дясната лента заради теб.",
      codeRefs: ["FAILED_TO_YIELD"],
    },
  ],
  teach: {
    whenBg:
      "На всеки изход от бензиностанция, паркинг, двор, гараж или магазин — тоест по няколко пъти на всяко пътуване. Същото правило важи и когато излизаш от паркомясто напряко през тротоара, и когато потегляш от банкета: щом идваш отнякъде, което не е път, ти влизаш в чуждото движение, а не то в твоето.",
    whyBg:
      "Изходът от имот е мястото, където водачът е най-силно изкушен да смята, че вече кара — а всъщност още не е. Затова законът е безкомпромисен и подреден: пропускаш пешеходците и колоездачите по тротоара и велоалеята, после пропускаш движещите се по платното, и чак тогава си участник в движението. Двете типични грешки тук са огледални и еднакво човешки: единият гледа наляво за пролука и минава през тротоара, без изобщо да го е видял — защото очите му вече са на булеварда; другият прави всичко правилно, спира на знака, светва мигач и тръгва, защото „нали показах“. Мигачът обаче не е разрешение. Той обявява какво ще направиш; дали МОЖЕШ да го направиш, решава потокът. И двете грешки идват от една и съща сметка — че секундите на изхода се печелят. Не се печелят: тротоарът се пресича за две секунди, а пролуката зад колоната идва след пет.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа реда, а не бързината: спираш ли пред тротоара (а не върху него), оглеждаш ли пешеходната зона в двете посоки, изчакваш ли пълното ѝ освобождаване, спираш ли напълно на Б2, и влизаш ли в пролука, която е СВОБОДНА, а не в такава, която си взел. Непропускането на пешеходец при излизане от имот и непропускането на движещите се по пътя са отсъждани грешки; ако принудиш някого по булеварда да спира рязко или да отбива — опасна. Изпълзяването на изхода без спиране е класиката, която проваля кандидати още в първата минута.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: „пролуката струва цяла минута търпение" — a SECOND column arriving
    // behind the first, so the road is never briefly-empty and the only way
    // out is to actually wait for a gap rather than take the first hole.
    // Authored as its own stream (LevelSpec.stagedAdd ADDS specs; it cannot
    // re-tune the base one), held further back and released by the same
    // roll-off, so the two columns arrive as a train.
    {
      level: 5,
      stagedAdd: [
        {
          ...MFP_STREAM,
          id: "sc-mfp-stream-2",
          actor: { ...MFP_STREAM.actor, hold: { nodeIndex: 0, offsetM: 0 }, colorIndex: 0 },
          count: 3,
          gapsM: [110, 136], // …the next column, ~7 s of boulevard behind the first
        } satisfies OncomingStreamSpec,
      ],
    },
  ],
  staged: [MFP_WALKER, MFP_STREAM],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The merging-family templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_MERGING: readonly ScenarioSpec[] = [
  SC_MERGE_ACCEL_LANE,
  SC_MERGE_LANE_END,
  SC_MERGE_ROADWORKS_SHIFT,
  SC_MERGE_BUS_PULLOUT,
  SC_MERGE_FROM_PROPERTY,
];
