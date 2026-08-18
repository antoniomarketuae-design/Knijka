/**
 * Scenario templates — PARKING DEPTH (the founder's „we can think of many many
 * many more parking variants 10 at least which to teach how to park the
 * students", doc 87 FR-15).
 *
 * WHY THIS FILE EXISTS AT ALL. The previous wave answered that ask
 * NOT-A-DEFECT because ten low-speed drills already carried the „parking"
 * chip. Counted honestly, eight of them TEACH A PARKING MANOEUVRE and two are
 * turns (sc-maneuver-3point, sc-maneuver-uturn); the rest of the family are
 * чл. 98 ban-reading drills. He asked for ten that teach how to PARK. These
 * are ten new ones, and every one of them puts the car into — or takes it out
 * of — a space.
 *
 * WHAT MAKES THEM TEN SITUATIONS AND NOT ONE SITUATION TEN TIMES. Each drill
 * changes a variable the others hold fixed, and each variable is one a real
 * learner meets and fails on:
 *
 *   GAP LENGTH        7.3 m (sc-park-gap-short) · 12.7 m (sc-park-gap-long)
 *                     · 4.3 m, i.e. not a gap at all (sc-park-judge)
 *   ENTRY GEAR        reverse S · nose-in forward · 45° reverse-angle
 *   THE NEIGHBOUR     a car · a VAN that steals space and sight-line
 *                     · a garage WALL · a whole opposite ROW
 *   THE SIDE          the row on the right kerb · the row on the LEFT
 *   LEGALITY          a marked zebra with a чл. 98 span and its own В27 post
 *   LIGHT             an unlit row at night
 *
 * All ten ride NEW committed districts from tools/maps/gen_parking_lot.mjs
 * (lot-gap-short-v1 … lot-gap-judge-v1) — no district is reused, no copy is
 * recoloured, and every coordinate below is denormalised BY VALUE from its
 * map's meta.scenario so nothing loads world JSON at runtime (the lesson-specs
 * law; the templates battery re-asserts each pin against the committed file).
 *
 * THEO-4: every drill states WHY before it states WHAT, its teach card cites
 * the law by retrieval (rules/catalog lawRefs — never free recall, ADR-002),
 * and every mistake demo explains the failure instead of marking it wrong.
 *
 * Traces are RECORDED (traces/scParkDepth.ts → content/traces/<id>);
 * the §5 zero-violation shadow gate and the §9 exact-code mistake gate run in
 * traces/__tests__/sc-park-depth-traces.test.ts.
 */

/**
 * THE BRIEFING BUDGET — 2026-08-16. Every `instructionsBg` step in this file
 * was rewritten so that THE ACT IS THE FIRST WORD and no step exceeds 95
 * characters. The measurement that forced it, the per-character fold table it
 * is derived from and the one thing this lane could not fix are written out in
 * full at the top of `templates-flow.ts`; read that block before lengthening
 * anything here.
 *
 * This file's share of the defect, counted before the rewrite: 50 authored
 * steps, 42 of them past the 95-character band the compact card was sized
 * against, longest 214 characters (sc-park-gap-short step 2, 214 ch). On the
 * deployed build a step-1 past ~96 characters leaves ZERO characters of the
 * rest of the briefing above the fold — measured on an iPhone 16 in both
 * orientations, not inferred.
 */

/**
 * THE FIVE ROWS — 2026-08-18, sweep 161. „A green tick for a skill it never
 * measured" (commit cdb2f71) was a catalogue-wide class; this is its parking
 * chapter, found by driving all ten drills on two platforms and reading the
 * debriefs rather than the source.
 *
 * WHAT A `reachZone` TICK CAN PROVE. `stepReachZone(params, prev, tick)` sees
 * `tick.position` and `tick.speedKmh` and nothing else — no ObjectiveContext,
 * no control state, no zone membership, no heading. So it can certify „the car
 * was near this coordinate, at rest" and NOT: which lamps are on, whether a
 * чл. 98 span was stopped in, whether the driver measured a gap by eye,
 * whether the car is parallel to the aisle — and, on a HALT gate, not even
 * that the space has been driven past. That last one is the counter-intuitive
 * half and it is arithmetic, not opinion: a cap at or below
 * REACH_ZONE_HALT_CAP_KMH (8) unlocks the approach capsule, whose rear edge
 * sits `radiusM + REACH_ZONE_GRACE_M` BEHIND the mark. Every Задача 1 in this
 * file caps at 6 on radius 4–5, so the capsule reaches 9–10 m back at L3 and
 * 11–12.5 m at L1 (the ladder widens the radius, not the grace). Eight of the
 * ten set their pose NORTH of their own target bay, and on all eight the
 * capsule's rear edge lands SOUTH of that bay's north edge at every rung —
 * §4 of parking3-claim-gates.test.ts re-derives the eight every build.
 *
 * The five titles that claimed more than that, and where each duty went:
 *
 *   sc-pgl-assess  «…и премери дължината му»  → the halt. Measuring stays in
 *                  briefing 1–3 and the teach card.
 *   sc-p45r-setup  «подмини мястото и спри успоредно…» → the halt. Heading and
 *                  „подмини" are both outside the disc (bay rect y ∈ [−2.72,
 *                  +2.72]; capsule rear edge y = −4.0 at L3, −6.5 at L1).
 *   sc-pzb-setup   «подмини забраната…» → the halt. The зона is the rule
 *                  engine's (ILLEGAL_STOP_IN_BAN_ZONE) and the capsule reached
 *                  INTO it at L1 — the row's own comment carries the numbers.
 *   sc-pgj-assess  «…и го премери» → the halt. The refusal is proven by
 *                  Задача 2 landing 11 m up the row, which IS measured.
 *   sc-park-night  `objectiveBg` sold the lamps as the first half of Задача 1.
 *                  They are a fault (HEADLIGHTS_OFF_AT_NIGHT, основна), never
 *                  a tick, and the sentence now says which.
 *
 * NOT ONE `params` VALUE CHANGED. `done` is bit-identical for every drive that
 * was passing before, so no recording is re-cut and no student loses credit he
 * had — the sentences were wrong, and a sentence is what the student obeys.
 *
 * THE HALF THIS LANE COULD NOT FIX, pinned so it is not mistaken for closed.
 * The backward halt grace is `objectives.ts`'s, and no authored value can clip
 * it: `acceptBeforeMarkM` cuts the FAR side of the mark only, and shrinking
 * `radiusM` runs into WIDEN-ONLY (params.ts) and cannot touch L1 anyway. A
 * setup pose is not a stop line — stopping short of it is a DIFFERENT
 * manoeuvre, not the same one done earlier — so the capsule needs either a
 * mirror parameter or clipping against the district's `noStopping` spans.
 * Written up in the sweep-161 report; not authored here, because guessing a
 * semantic for an existing field is how the next false certificate is issued.
 */

import type { ScenarioSpec } from "./types";
import type { ParkingBaySpec } from "../../contracts";

// ---------------------------------------------------------------------------
// Pinned target bays (meta.scenario of the committed districts, BY VALUE)
// ---------------------------------------------------------------------------

/** lot-gap-short-v1 — the 7.3 m kerb slot (paint rect 4.5 m). */
export const LOT_GAP_SHORT_BAY: ParkingBaySpec = {
  x: 6.28,
  y: 0,
  headingDeg: 0,
  widthM: 2.5,
  lengthM: 4.5,
};

/** lot-gap-long-v1 — the 12.7 m kerb slot (paint rect 6.5 m). */
export const LOT_GAP_LONG_BAY: ParkingBaySpec = {
  x: 6.28,
  y: 0,
  headingDeg: 0,
  widthM: 2.5,
  lengthM: 6.5,
};

/** lot-van-v1 — the free bay whose south neighbour is the van. */
export const LOT_VAN_BAY: ParkingBaySpec = {
  x: 5.03,
  y: 0,
  headingDeg: 90,
  widthM: 2.7,
  lengthM: 5,
};

/** lot-45rev-v1 — the 135° echelon bay (mouth opens behind the driver). */
export const LOT_45REV_BAY: ParkingBaySpec = {
  x: 4.8,
  y: 0,
  headingDeg: 135,
  widthM: 2.7,
  lengthM: 5,
};

/** lot-left-v1 — the free bay of the WEST row. */
export const LOT_LEFT_BAY: ParkingBaySpec = {
  x: -5.03,
  y: 0,
  headingDeg: 270,
  widthM: 2.7,
  lengthM: 5,
};

/** lot-zebra-v1 — the first LEGAL slot, 3.75 m clear of the чл. 98 span. */
export const LOT_ZEBRA_BAY: ParkingBaySpec = {
  x: 6.28,
  y: 11.75,
  headingDeg: 0,
  widthM: 2.5,
  lengthM: 5.5,
};

/** lot-wall-v1 — the END bay, 1.65 m short of the garage wall. */
export const LOT_WALL_BAY: ParkingBaySpec = {
  x: 5.03,
  y: 5.4,
  headingDeg: 90,
  widthM: 2.7,
  lengthM: 5,
};

/** lot-night-v1 — the free slot near the far end of the unlit row. */
export const LOT_NIGHT_BAY: ParkingBaySpec = {
  x: 6.28,
  y: 13,
  headingDeg: 0,
  widthM: 2.5,
  lengthM: 5.5,
};

/** lot-double-v1 — the free bay of the east row, opposite a full west row. */
export const LOT_DOUBLE_BAY: ParkingBaySpec = {
  x: 5.03,
  y: 0,
  headingDeg: 90,
  widthM: 2.7,
  lengthM: 5,
};

/** lot-gap-judge-v1 — the GOOD slot (9.5 m clear); the 4.3 m one is at y = −4. */
export const LOT_JUDGE_BAY: ParkingBaySpec = {
  x: 6.28,
  y: 7.4,
  headingDeg: 0,
  widthM: 2.5,
  lengthM: 4.2,
};

// ---------------------------------------------------------------------------
// 1 — sc-park-gap-short „Късо място край бордюра"
// ---------------------------------------------------------------------------

export const SC_PARK_GAP_SHORT: ScenarioSpec = {
  id: "sc-park-gap-short",
  family: "parking",
  tagsBg: ["паркиране", "успоредно", "заден ход", "късо място", "прецизност"],
  titleBg: "Късо място край бордюра",
  objectiveBg:
    "Две задачи, в този ред: първо спри в изходната позиция на половин метър от предната кола — в късо място тя е единствената, която работи; после влез на заден ход от първи опит, защото поправка няма къде да се направи.",
  archetypeIds: ["PK-01"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-safety-space"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 5,
      bayWidthM: 2.5,
      bayDepthM: 4.5,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
      pitchesM: "5.9|5.9|5.9|5.9",
    },
    districtId: "lot-gap-short-v1",
  },
  start: { spawnPointId: "lotgs-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // THE PARKING FAMILY'S SHAPE, stated once here and applied to all ten drills.
    // Every one of them opened with a 120-190-character scene-setting step and
    // put „Задача 1: спри …“ — the act the first objective actually grades — in
    // step 2, behind a „под 6 км/ч, практически в покой“ parenthesis.
    // · The HALT is now step 1, so it is the line. lane15-parking-depth.test.ts
    //   requires the copy to contain „спри“ wherever the gate caps 6 km/h; it
    //   does, in the one row that is always painted.
    // · The „Задача 1/2“ labels are dropped from the STEP text and kept where
    //   they were always authoritative — objectiveBg („Две задачи…“, asserted by
    //   that same test) and the two objective titles. Ten characters of label in
    //   front of the verb is exactly the pattern this wave exists to remove.
    // · The lamp step stays LAST in the sequence and says ПРЕДИ маневрата,
    //   because that is when it is done; L10 reads presence, not position.
    // 61 ch
    { n: 1, textBg: "Спри успоредно на предната кола, задна броня срещу задната ѝ." },
    // 53 ch — the lateral offset is an instruction, not scenery: it is what
    // makes the 45° swing fit a 7.3 m gap, so it keeps a step of its own.
    { n: 2, textBg: "Дръж около половин метър странично разстояние до нея." },
    // 70 ch
    { n: 3, textBg: "Спри наистина — под 6 км/ч, практически в покой: оттук се мери всичко." },
    // 69 ch
    { n: 4, textBg: "Премери мястото: малко над седем метра при кола от четири и половина." },
    // 62 ch
    { n: 5, textBg: "Знай: място има, но за едно правилно влизане, не за три опита." },
    // 70 ch
    { n: 6, textBg: "Включи на задна — огледала, после през рамо — и волана ДОКРАЙ надясно." },
    // 43 ch
    { n: 7, textBg: "Помни: в късо място половин волан не стига." },
    // 79 ch
    { n: 8, textBg: "Върни назад до около 45°, после докрай наляво — щом бронята ти подмине нейната." },
    // 76 ch
    { n: 9, textBg: "Влез до дъното, подкарай леко напред за центъра и спри успоредно на бордюра." },
    // 61 ch
    { n: 10, textBg: "Включи късите светлини ПРЕДИ маневрата, ако е тъмно или вали." },
  ],
  success: [
    {
      id: "sc-pgs-setup",
      titleBg: "Задача 1: спри в изходната позиция до предната кола",
      // The pose the recorded shadow actually stops at (traces/scParkDepth
      // GS_SETUP_X/GS_SETUP_Y). At rest, not a drive-by: the 6 km/h cap is what
      // turns a waypoint into a task (doc 86 D11).
      params: { kind: "reachZone", x: 3.7, y: 5.67, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pgs-park",
      titleBg: "Задача 2: влез на заден ход в късото място и спри напълно",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_GAP_SHORT_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pgs-park" },
    // Tighter than the roomy slot by design: in 7.3 m the second pull is
    // already the one that touches a bumper.
    economy: { objectiveId: "sc-pgs-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 110,
  },
  shadow: { path: "content/traces/sc-park-gap-short/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-gap-short/mistake-shallow-angle.trace.json" },
      titleBg: "Плитък ъгъл — воланът не отиде докрай",
      whatWentWrongBg:
        "Воланът остана на половин завъртане, колата тръгна назад под твърде малък ъгъл и не стигна до бордюра. Вместо да излезе напред и да започне отначало, шофьорът продължи да бута назад — и задницата удари колата отзад. В късо място плиткият ъгъл няма поправка: излизаш напред и започваш пак, с пълен волан.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-gap-short/mistake-forward-hit.trace.json" },
      titleBg: "Изправяне напред без броене на метрите отпред",
      whatWentWrongBg:
        "Колата влезе накриво и далеч от бордюра, а изправянето напред тръгна с поглед във волана вместо в предната броня — и я заби в колата отпред. В място със седем метра предното разстояние се брои на сантиметри: гледаш бронята, не воланa.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато мястото край бордюра изглежда „малко късо“ — в центъра, пред блока, вечер, когато вече няма избор. Това е най-честото градско място и най-често сгрешаваната маневра.",
    whyBg:
      "Дългото място прощава грешна изходна позиция; късото — не. Тук цялата маневра е решена, преди воланът да е мръднал: половин метър встрани и броня срещу броня. Който владее това, паркира от първи опит и не остава да блокира улицата с включени аварийни.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа изходната позиция (успоредно, около половин метър), непрекъснатото наблюдение преди и по време на задния ход и крайния резултат — в очертанията, успоредно, без повече от една корекция.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pgs-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      // L5 „Усложнени": същото късо място, но мокро и на тъмно — и с по-строг
      // допуск. Задължението за светлините е записано в инструкция 10 —
      // ПОСЛЕДНАТА (doc 86 L10 — нощна степен не таксува задължение, което
      // урокът не е казал). Номерът се разминаваше с една стъпка, останал от
      // пренаписването на брифинга; L10 се проверява по СЪДЪРЖАНИЕ, не по
      // номер (lane15 §5 чете compileScenario().briefingBg), затова номерът
      // тук е само ориентир — но грешният ориентир е покана да се изтрие
      // грешната стъпка.
      level: 5,
      conditions: { weather: "rain", night: true },
      physics: { wetGrip: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-pgs-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 2 — sc-park-gap-long „Дълго място — влизане напред"
// ---------------------------------------------------------------------------

export const SC_PARK_GAP_LONG: ScenarioSpec = {
  id: "sc-park-gap-long",
  family: "parking",
  tagsBg: ["паркиране", "успоредно", "преден ход", "дълго място", "преценка"],
  titleBg: "Дълго място край бордюра — влизане напред",
  objectiveBg:
    "Две задачи, в този ред: първо спри срещу мястото, защото дължината се мери с поглед от покой — над две дължини на колата означава, че заден ход изобщо не е нужен; после влез напред с една плавна дъга и се изправи плътно до бордюра.",
  archetypeIds: ["PK-01"],
  conceptIds: ["c-maneuver-principles", "c-stop-parking-definitions", "c-safety-space"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 5,
      bayWidthM: 2.5,
      bayDepthM: 6.5,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
      pitchesM: "8.6|8.6|8.6|8.6",
    },
    districtId: "lot-gap-long-v1",
  },
  start: { spawnPointId: "lotgl-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Step 2 was 184 characters carrying the halt, the measurement and the
    // decision rule. Three acts, three steps.
    // 68 ch
    { n: 1, textBg: "Спри срещу мястото — под 6 км/ч, практически в покой — и го премери." },
    // 75 ch
    { n: 2, textBg: "Мери от броня до броня: под две дължини кола — заден ход; над две — напред." },
    // 72 ch
    { n: 3, textBg: "Виж: тук има три дължини кола — заден ход е за малко място, не по навик." },
    // 67 ch
    { n: 4, textBg: "Провери огледалото, погледни през дясното рамо и подай десен мигач." },
    // 47 ch
    { n: 5, textBg: "Включи и късите светлини, ако е тъмно или вали." },
    // 57 ch
    { n: 6, textBg: "Влез напред с една плавна дъга, срещу СРЕДАТА на мястото." },
    // 72 ch
    { n: 7, textBg: "Не се цели в предния му край — иначе предницата свършва в колата отпред." },
    // 79 ch
    { n: 8, textBg: "Изправи волана и спри успоредно на бордюра, на педя, по посоката (ЗДвП чл. 94)." },
  ],
  success: [
    {
      id: "sc-pgl-assess",
      // CLAIM GATE (see THE FIVE ROWS at the top of this file). It read
      // „спри срещу мястото и премери дължината му“ — a disc cannot see a
      // measurement taken by eye, so the tick certified it for arriving. The
      // measuring stays where it is teachable and unfaked: briefing steps 1–3
      // and the teach card. The title now names only the halt the gate reads.
      titleBg: "Задача 1: спри срещу свободното място",
      // The assess halt IS the turn-in pose (traces/scParkDepth GL_ASSESS_*):
      // a separate „reposition" leg of 30 cm is a pivot, not a manoeuvre.
      params: { kind: "reachZone", x: 3.5, y: -8.37, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pgl-park",
      titleBg: "Задача 2: влез НАПРЕД в мястото и спри успоредно на бордюра",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_GAP_LONG_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
        entry: "forward",
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pgl-park" },
    economy: { objectiveId: "sc-pgl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    // No observation moments: the v1 observation mapper anchors on a REVERSE
    // phase, and this drill deliberately has none (sc-park-45's precedent).
    parTimeSec: 80,
  },
  shadow: { path: "content/traces/sc-park-gap-long/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-gap-long/mistake-overrun.trace.json" },
      titleBg: "Влезе срещу предния край на мястото",
      whatWentWrongBg:
        "Завоят започна късно и колата влезе срещу ПРЕДНИЯ край на празното място, а не срещу средата му — така дванайсетте метра свършиха под предната броня и тя влезе в колата отпред. Дългото място също има край: цели се в средата му.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-gap-long/mistake-blind-reverse.trace.json" },
      titleBg: "Излишен заден ход, при това без наблюдение",
      whatWentWrongBg:
        "Мястото беше дълго колкото три коли, а шофьорът включи на задна по навик — и то без огледала и без поглед през рамо. Пешеходецът зад колата остана невидим до удара. Чл. 40 иска да си сигурен, че пътят зад теб е свободен; а най-сигурният заден ход е този, който не ти е нужен.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На улици с рядко паркиране, пред заведения и в жилищни комплекси вечер, когато си тръгва цяла редица коли — тогава мястото е дълго и се влиза напред.",
    whyBg:
      "Изборът между напред и назад не е въпрос на вкус, а на дължина: заден ход в дълго място е излишен риск в мъртва зона, а преден ход в късо място е удар. Затова първата част от всяко паркиране е измерване с поглед, а не завъртане на волана.",
    lawRef: "ЗДвП чл. 94",
    examinerBg:
      "Изпитващият гледа дали си преценил мястото, преди да маневрираш, дали си сигнализирал и дали крайният резултат е успореден на бордюра, по посоката на движението и на разумно разстояние от него.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pgl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      // L5: същото място в мъгла — преценката на дължина по поглед е точно
      // това, което мъглата отнема. Задължението за фаровете е в инструкция 5
      // („Включи и късите светлини, ако е тъмно или вали."); беше записано 3.
      level: 5,
      conditions: { weather: "fog" },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-pgl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 3 — sc-park-van „Гнездо до бус"
// ---------------------------------------------------------------------------

export const SC_PARK_VAN: ScenarioSpec = {
  id: "sc-park-van",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "перпендикулярно", "ограничена видимост"],
  titleBg: "Гнездо до бус — заден ход с ограничена видимост",
  objectiveBg:
    "Две задачи, в този ред: първо спри в изходната позиция покрай свободното гнездо; после влез на заден ход, като държиш работещо разстояние от буса — той е по-широк от очертанията си и закрива всичко зад себе си.",
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-mirrors-blind-spots", "c-safety-space"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "X__XX",
      approachM: 90,
      entry: "south",
      targetIndex: 2,
    },
    districtId: "lot-van-v1",
  },
  start: { spawnPointId: "lotvn-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Step 2 was 162 characters: the halt, its trigger and the lateral offset.
    // The offset is an instruction of its own and now reads as one.
    // 75 ch
    { n: 1, textBg: "Подмини гнездото и спри — под 6 км/ч — щом задната ти броня подмине съседа." },
    // THE ACT THE SHADOW PERFORMS AND NO STEP USED TO STATE (sweep 161).
    // Step 2 read „Дръж около метър и половина странично от реда." — a state,
    // with no WHEN. The recorded correct drive leaves the curb lane at
    // y = −18 (traces/scParkDepth `easeTo`), i.e. BEFORE the bay row starts at
    // y = −7.65, because the swing room for a 90° reverse is bought from the
    // middle of the aisle and nowhere else. Measured on lot-van-v1: the drawn
    // curb-lane centre is x = 4.06 and the row's own occupied bays reach out
    // to x = 2.53, so a student who holds that lane down the row has 0 m of
    // it left — the four mobile/pc legs of sweep 161 all ended on „Настъпи
    // сблъсък“. The metre-and-a-half is kept; it now has a moment.
    // 70 ch
    { n: 2, textBg: "Излез в средата на алеята преди реда — около метър и половина от него." },
    // 80 ch
    { n: 3, textBg: "Знай: гнездото е до бус, а бусът краде сантиметри и цялата видимост зад себе си." },
    // 44 ch
    { n: 4, textBg: "Включи на задна — огледала, после през рамо." },
    // 64 ch
    { n: 5, textBg: "Гледай два пъти към страната на буса: там огледалото ти свършва." },
    // 79 ch
    { n: 6, textBg: "Влизай бавно и се центрирай ПО-ДАЛЕЧ от буса — той стои по-навън от линиите си." },
    // 27 ch
    { n: 7, textBg: "Спри напълно в очертанията." },
    // 61 ch
    { n: 8, textBg: "Включи късите светлини ПРЕДИ маневрата, ако е тъмно или вали." },
  ],
  success: [
    {
      id: "sc-pvn-setup",
      titleBg: "Задача 1: спри в изходната позиция покрай гнездото",
      params: { kind: "reachZone", x: 0.9, y: 6.3, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pvn-park",
      titleBg: "Задача 2: паркирай на заден ход, без да опираш буса",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_VAN_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pvn-park" },
    economy: { objectiveId: "sc-pvn-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-van-side", titleBg: "Втори поглед към страната на буса" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 100,
  },
  shadow: { path: "content/traces/sc-park-van/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-van/mistake-early-turn.trace.json" },
      titleBg: "Завъртане, преди гнездото да е подминато",
      whatWentWrongBg:
        "Воланът тръгна, докато колата още не беше подминала свободното гнездо — и задницата влезе в буса вместо в очертанията. Ориентирът не се променя заради буса: докато не си подминал задната броня на съседа, воланът стои прав.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-van/mistake-blind-reverse.trace.json" },
      titleBg: "Заден ход покрай бус без нито един поглед назад",
      whatWentWrongBg:
        "Задната предавка влезе веднага, без огледала и без рамо. Пешеходец, който минаваше иззад буса, остана скрит до самия удар — точно това прави високото возило опасно: огледалата ти свършват там, където започва то. Чл. 40 иска да се убедиш, че отзад е свободно, ПРЕДИ да потеглиш.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "В паркинги на магазини и в жилищни комплекси, където до свободното място винаги стои бус, джип или каравана — тоест почти винаги.",
    whyBg:
      "Повечето удари в паркинг стават до високо возило, защото то изяжда и мястото, и погледа. Който се научи да се центрира встрани от него и да гледа два пъти към неговата страна, спестява и ламарина, и пешеходец.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа наблюдението (двете огледала, рамо, и допълнителния поглед към закритата страна), пешеходната скорост и крайния резултат в очертанията без допир до съседа.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pvn-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      level: 5,
      conditions: { night: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-pvn-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 4 — sc-park-45-rev „Косо място на заден ход"
// ---------------------------------------------------------------------------

export const SC_PARK_45_REV: ScenarioSpec = {
  id: "sc-park-45-rev",
  family: "parking",
  tagsBg: ["паркиране", "косо място", "заден ход", "45 градуса"],
  titleBg: "Косо място на заден ход",
  objectiveBg:
    "Две задачи, в този ред: първо спри в изходната позиция край косия ред, подминал мястото и успоредно на алеята; после влез на заден ход с точно 45° завъртане — устата на това място гледа назад и напред просто няма как да се влезе.",
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "135",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-45rev-v1",
  },
  start: { spawnPointId: "lot45r-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Step 5 was 174 characters: a halt, the reason the bay faces this way, and
    // the lamp condition. The reason survives; it just no longer comes first.
    // 65 ch
    { n: 1, textBg: "Подмини мястото и спри успоредно на алеята — под 6 км/ч, в покой." },
    // THE ACT THE SHADOW PERFORMS AND NO STEP USED TO STATE (sweep 161), the
    // sibling of sc-park-van step 2 — and this drill had it NOWHERE. The
    // recorded correct drive is on x = 0.9 from y = −18 up; on lot-45rev-v1
    // the 135° echelon row reaches out to x = 2.53, which is inside the drawn
    // curb lane the car spawns in (centre x = 4.06). Every leg of sweep 161
    // that held that lane hit a parked car — mobile-right three times, 30 т.
    // 69 ch
    { n: 2, textBg: "Излез в средата на алеята преди реда — замахът назад се купува оттам." },
    // 66 ch
    { n: 3, textBg: "Погледни накъде гледат линиите: устата се отваря НАЗАД спрямо теб." },
    // 70 ch
    { n: 4, textBg: "Знай: такъв ред се взима само на заден ход и се напуска с лице напред." },
    // 44 ch
    { n: 5, textBg: "Включи на задна — огледала, после през рамо." },
    // 43 ch
    { n: 6, textBg: "Завърти надясно, но само до 45°, не докрай." },
    // 68 ch
    { n: 7, textBg: "Изправи волана, щом колата легне по линиите, и влез право до дъното." },
    // 79 ch
    { n: 8, textBg: "Спри в очертанията — предницата гледа към алеята и на тръгване виждаш кой идва." },
    // 61 ch
    { n: 9, textBg: "Включи късите светлини ПРЕДИ маневрата, ако е тъмно или вали." },
  ],
  success: [
    {
      id: "sc-p45r-setup",
      // CLAIM GATE. It read „подмини мястото и спри успоредно на алеята“ and
      // claimed two things the disc cannot resolve. HEADING: ReachZoneParams
      // has no heading field, so a car standing across the aisle at 0 км/ч
      // ticked „успоредно“. PASSED-THE-SPACE: this is a halt demand (cap 6 ≤
      // REACH_ZONE_HALT_CAP_KMH), so its grace capsule reaches radius +
      // REACH_ZONE_GRACE_M = 10 m BACK down the approach — from the mark at
      // y = 6.0 that is y = −4.0 at L3 and y = −6.5 at L1, while the target
      // bay rect only spans y ∈ [−2.72, +2.72]. A car halted level with, or
      // south of, the space was credited with having driven past it — the
      // exact pose mistake-nose-in convicts one screen down.
      titleBg: "Задача 1: спри в изходната позиция край косия ред",
      params: { kind: "reachZone", x: 0.9, y: 6.0, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-p45r-park",
      titleBg: "Задача 2: влез на заден ход по линиите и спри напълно",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_45REV_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-p45r-park" },
    economy: { objectiveId: "sc-p45r-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 100,
  },
  shadow: { path: "content/traces/sc-park-45-rev/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-45-rev/mistake-nose-in.trace.json" },
      titleBg: "Опит да се влезе напред в място с обратна уста",
      whatWentWrongBg:
        "Шофьорът завъртя надясно и се опита да влезе напред, както в косо място по посоката на движението — но устата тук е от другата страна. Колата застана напречно на реда и предницата опря в съседа. Първата работа при косо място е да прочетеш накъде гледат линиите.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-45-rev/mistake-shallow-swing.trace.json" },
      titleBg: "Недовъртяно завъртане",
      whatWentWrongBg:
        "Завъртането спря по средата и колата тръгна назад под около 20° вместо под 45° — така не влезе в мястото, а в съседа. Числото е ориентир, не украса: довърти завъртането и чак тогава изправи волана.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Пред болници, училища и големи магазини, където редовете умишлено се чертаят с обратна уста, за да излизат колите с лице към алеята.",
    whyBg:
      "Излизането е по-опасната половина от паркирането: на заден ход в жива алея не виждаш нищо. Косото място на заден ход обръща риска — трудното става, докато си спрял и всичко се движи бавно, а тръгването после е с пълна видимост.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа дали си прочел посоката на мястото, дали си спрял успоредно преди завъртането, наблюдението назад и крайния резултат — в очертанията, по линиите, без корекции.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-p45r-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      level: 5,
      conditions: { weather: "rain", night: true },
      physics: { wetGrip: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-p45r-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 5 — sc-park-left „Гнездо от лявата страна на алеята"
// ---------------------------------------------------------------------------

export const SC_PARK_LEFT: ScenarioSpec = {
  id: "sc-park-left",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "огледална маневра", "лява страна"],
  titleBg: "Гнездо от лявата страна на алеята",
  objectiveBg:
    "Две задачи, в този ред: първо пресечи алеята с поглед и мигач и спри в изходната позиция покрай гнездото ОТЛЯВО; после влез на заден ход с волан докрай наляво — всеки ориентир е огледален и водещото огледало е лявото.",
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
      side: "west",
    },
    districtId: "lot-left-v1",
  },
  start: { spawnPointId: "lotlf-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // The mirror-image drill: crossing the aisle is a manoeuvre of its own and
    // now leads, because it happens first.
    // 67 ch
    { n: 1, textBg: "Провери лявото огледало, подай ляв мигач и погледни в двете посоки." },
    // 75 ch
    { n: 2, textBg: "Знай: редът е ОТЛЯВО — това е огледалната маневра, а ръцете помнят дясната." },
    // 57 ch
    { n: 3, textBg: "Помни: пресичането на алея е маневра, и то през чужд път." },
    // 75 ch
    { n: 4, textBg: "Подмини гнездото и спри — под 6 км/ч — щом задната ти броня подмине съседа." },
    // 70 ch
    { n: 5, textBg: "Чети ориентира в ЛЯВОТО огледало — той е същият, но от другата страна." },
    // 69 ch
    { n: 6, textBg: "Включи на задна — огледала, после през рамо — и волана ДОКРАЙ НАЛЯВО." },
    // 77 ch
    { n: 7, textBg: "Изправи волана, щом колата легне по очертанията, центрирай се и спри напълно." },
    // 61 ch
    { n: 8, textBg: "Включи късите светлини ПРЕДИ маневрата, ако е тъмно или вали." },
  ],
  success: [
    {
      id: "sc-plf-setup",
      titleBg: "Задача 1: спри в изходната позиция покрай гнездото отляво",
      params: { kind: "reachZone", x: -0.9, y: 6.3, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-plf-park",
      titleBg: "Задача 2: паркирай на заден ход в лявото гнездо",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_LEFT_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-plf-park" },
    economy: { objectiveId: "sc-plf-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 105,
  },
  shadow: { path: "content/traces/sc-park-left/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-left/mistake-mirrored-habit.trace.json" },
      titleBg: "Ръцете направиха заучената дясна маневра",
      whatWentWrongBg:
        "Завъртането тръгна на позицията, на която тръгва при дясно гнездо — тоест твърде рано за огледалната — и задницата влезе в съседната кола. Огледалната маневра иска СЪЩИЯ ориентир, но прочетен в другото огледало; ако го четеш по памет, той е винаги с два метра сгрешен.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-left/mistake-cross-blind.trace.json" },
      titleBg: "Пресичане на алеята без поглед",
      whatWentWrongBg:
        "Колата зави наляво през алеята, без ляво огледало, без мигач и без поглед — и се озова пред кола, идваща насреща. Мястото отляво струва точно един допълнителен поглед; той е разликата между маневра и изненада.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "В подземни гаражи и на паркинги с двупосочни алеи, където свободното място е от другата страна — и на всяка еднопосочна улица, на която паркирането отляво е разрешено.",
    whyBg:
      "Маневрата отляво не е по-трудна, тя е непозната: същата геометрия, огледално. Който я е правил, не замръзва пред единственото свободно място в гаража и не пресича алея на сляпо, за да го стигне.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа сигнализирането и погледа преди пресичането на алеята, изходната позиция и наблюдението през ЛЯВОТО огледало и рамо, и крайния резултат в очертанията.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-plf-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      level: 5,
      conditions: { night: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-plf-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 6 — sc-park-zebra „Паркиране до пешеходна пътека"
// ---------------------------------------------------------------------------

export const SC_PARK_ZEBRA: ScenarioSpec = {
  id: "sc-park-zebra",
  family: "parking",
  tagsBg: ["паркиране", "пешеходна пътека", "чл. 98", "знак В27", "избор на място"],
  titleBg: "Паркиране до пешеходна пътека",
  objectiveBg:
    "Две задачи, в този ред: първо спри в изходната позиция до първото РАЗРЕШЕНО място — то е чак след забранената зона около пътеката, а спиране в самата зона се наказва отделно; после паркирай на заден ход в него.",
  archetypeIds: ["PK-01", "PK-06"],
  conceptIds: ["c-parking-prohibitions", "c-reversing", "c-pedestrian-rights-duties"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 6,
      bayWidthM: 2.5,
      bayDepthM: 5.5,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XX___X",
      approachM: 90,
      entry: "south",
      pitchesM: "6.5|6.5|9|8|6.5",
      targetIndex: 4,
    },
    districtId: "lot-zebra-v1",
  },
  start: { spawnPointId: "lotzb-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Step 1 was 192 characters of law before a single act. The act — cross the
    // banned span WITHOUT stopping in it — is what the first objective grades.
    // ЗДвП чл. 98 and the В27 plate keep their own steps.
    // 48 ch
    { n: 1, textBg: "Мини през забранената зона, без да спираш в нея." },
    // 76 ch
    { n: 2, textBg: "Спри успоредно на колата след първото разрешено място — под 6 км/ч, в покой." },
    // 79 ch
    { n: 3, textBg: "Виж: от трите свободни места две са на под пет метра от пътеката (ЗДвП чл. 98)." },
    // 50 ch
    { n: 4, textBg: "Прочети знака В27 в началото на пътеката, отдясно." },
    // 81 ch
    { n: 5, textBg: "Помни: забраната важи и преди, и след пътеката — спряла кола там крие пешеходеца." },
    // 71 ch
    { n: 6, textBg: "Включи на задна — огледала, после през рамо — и завърти докрай надясно." },
    // 63 ch
    { n: 7, textBg: "Влез в мястото, изправи се успоредно на бордюра и спри напълно." },
    // 61 ch
    { n: 8, textBg: "Включи късите светлини ПРЕДИ маневрата, ако е тъмно или вали." },
  ],
  success: [
    {
      id: "sc-pzb-setup",
      // CLAIM GATE, and the worst row in the file: it read „подмини забраната
      // и спри до първото разрешено място“ while the disc cannot see the ban
      // at all — and its own halt-grace capsule reaches INTO it. Measured
      // against the committed district: lot-zebra-v1's `noStopping` zone
      // lotzb-z-zebra runs fromM 22 → toM 38 of lotzb-e-aisle, which starts at
      // y = −30, i.e. the чл. 98 span is y ∈ [−8, +8]. The capsule's rear edge
      // is mark − (radius + REACH_ZONE_GRACE_M) = 18 − 10 = +8.0 at L3 and
      // 18 − 12.5 = +5.5 at L1 — so at the guided rung a student parked INSIDE
      // the banned span was handed a green „подмини забраната“ by the task
      // list while the rule engine billed him ILLEGAL_STOP_IN_BAN_ZONE for the
      // same act (doc 87 B58: the product must not certify the offence it
      // bills). The duty is not lost — it is the зона's, mistake-park-after's
      // and instruction 1's. What is lost is the false certificate.
      titleBg: "Задача 1: спри до първото разрешено място след пътеката",
      params: { kind: "reachZone", x: 4.0, y: 18.0, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pzb-park",
      titleBg: "Задача 2: паркирай на заден ход в разрешеното място",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_ZEBRA_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pzb-park" },
    economy: { objectiveId: "sc-pzb-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 120,
  },
  shadow: { path: "content/traces/sc-park-zebra/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-zebra/mistake-park-after.trace.json" },
      titleBg: "Спря веднага СЛЕД пътеката",
      whatWentWrongBg:
        "„Минах пътеката, значи може“ — но чл. 98 брои пет метра и в двете посоки. Спряла непосредствено след пътеката, колата пак закрива човека, който тъкмо е тръгнал по нея, от всички, които идват насреща. Първото разрешено място е следващото.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-park-zebra/mistake-hidden-pedestrian.trace.json" },
      titleBg: "Паркира плътно ПРЕД пътеката — и после я закри",
      whatWentWrongBg:
        "Колата спря на по-малко от пет метра преди пътеката, а при тръгването пешеходецът излезе точно иззад нея. Ето за какво са петте метра: те не пазят мястото, а видимостта — и за теб, и за всички зад теб. Затова забраната е и преди, не само след.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На всяка градска улица с пешеходна пътека — тоест всеки ден. Свободното място точно до пътеката винаги е свободно по една и съща причина.",
    whyBg:
      "Кола, спряла до пешеходна пътека, е най-честата причина за блъснат пешеходец в града: тя не пречи на теб, тя крие човека от следващия. Петте метра са разстоянието, на което един шофьор успява да види и да спре.",
    lawRef: "ЗДвП чл. 98",
    examinerBg:
      "Изпитващият гледа дали изобщо си спрял в забранената зона (дори за момент), дали си избрал разрешеното място сам, без подсказка, и дали крайното паркиране е в очертанията и успоредно.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pzb-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      // L5: същата пътека в дъжд и на тъмно — точно условията, в които
      // закритият пешеходец става непоправим. Задължението за светлините е
      // записано в инструкция 8 — последната; беше записано 5.
      level: 5,
      conditions: { weather: "rain", night: true },
      physics: { wetGrip: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-pzb-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 7 — sc-park-wall „Крайно гнездо до стената"
// ---------------------------------------------------------------------------

export const SC_PARK_WALL: ScenarioSpec = {
  id: "sc-park-wall",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "гараж", "крайно гнездо", "стена"],
  titleBg: "Крайно гнездо до стената на гаража",
  objectiveBg:
    "Две задачи, в този ред: първо спри РАНО и близо до средата на алеята, защото стената в края на реда не оставя място за широк замах; после влез на заден ход в последното гнездо, следейки разстоянието до стената.",
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XXXX_",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-wall-v1",
  },
  start: { spawnPointId: "lotwl-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Step 5 was 209 characters and ended on the lamp clause. Step 2's two
    // instructions (stop early, hold the middle of the aisle) are one step
    // because they are one position, and it is the graded one.
    // 85 ch
    { n: 1, textBg: "Спри РАНО — под 6 км/ч — щом бронята ти подмине последната кола, в средата на алеята." },
    // 65 ch
    { n: 2, textBg: "Знай: свободно е само последното гнездо, а редът свършва в стена." },
    // 52 ch
    { n: 3, textBg: "Помни: мястото за замах зад реда тук просто го няма." },
    // 71 ch
    { n: 4, textBg: "Включи на задна — огледала, после през рамо; дясното сега мери стената." },
    // 71 ch
    { n: 5, textBg: "Завърти докрай и влизай бавно — замахът е от алеята пред теб, не отзад." },
    // 74 ch
    { n: 6, textBg: "Изправи волана, центрирай се и спри, без да си взел сантиметър от стената." },
    // 80 ch
    { n: 7, textBg: "Включи късите светлини в гараж и вечер — те са и осветление, и сигнал по алеята." },
  ],
  success: [
    {
      id: "sc-pwl-setup",
      titleBg: "Задача 1: спри рано, в средата на алеята",
      params: { kind: "reachZone", x: 0.9, y: 11.7, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pwl-park",
      titleBg: "Задача 2: паркирай на заден ход в крайното гнездо",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_WALL_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pwl-park" },
    economy: { objectiveId: "sc-pwl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-wall-side", titleBg: "Наблюдение на разстоянието до стената" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 110,
  },
  shadow: { path: "content/traces/sc-park-wall/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-wall/mistake-into-wall.trace.json" },
      titleBg: "Търсеше мястото с поглед вдясно и опря в стената",
      whatWentWrongBg:
        "Гнездото беше отдясно, погледът също — и колата продължи напред, докато предницата не намери стената в края на реда. Крайното гнездо иска решението да е взето рано: спираш успоредно на него, а не покрай него.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-wall/mistake-clip-neighbour.trace.json" },
      titleBg: "Завъртане твърде рано, защото стената притиска",
      whatWentWrongBg:
        "Стената кара шофьора да бърза и воланът тръгна два метра по-рано — задницата влезе в съседната кола, а не в гнездото. Стената не мести ориентира: той пак е задната броня на съседа.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "В подземни и етажни гаражи, където всеки ред свършва в стена или колона, и точно крайното място обикновено е свободното.",
    whyBg:
      "Стената не прощава и не се вижда в огледалата така, както се вижда кола. Който се научи да купува замаха си от алеята, а не от пространството зад реда, паркира еднакво и в средата, и в края — и не оставя ламарина по бетона.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа ранното спиране, пешеходната скорост, използването на дясното огледало към стената и крайния резултат — в очертанията, без допир.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pwl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      level: 5,
      conditions: { night: true },
      toleranceScale: 0.8,
      rubric: { economy: { objectiveId: "sc-pwl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 8 — sc-park-night „Нощно паркиране край неосветен ред"
// ---------------------------------------------------------------------------

export const SC_PARK_NIGHT: ScenarioSpec = {
  id: "sc-park-night",
  family: "parking",
  tagsBg: ["паркиране", "нощем", "светлини", "успоредно", "заден ход"],
  titleBg: "Нощно паркиране край неосветен ред",
  objectiveBg:
    "Две задачи, в този ред: първо спри в изходната позиция до предната кола; после влез на заден ход, като мериш разстоянията по огледала, а не по усет. Светлините не са една от двете задачи — те са задължение през целия урок и карането без тях се наказва като основна грешка (ЗДвП чл. 70).",
  archetypeIds: ["PK-01"],
  conceptIds: ["c-reversing", "c-night-visibility", "c-lights-overview"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 7,
      bayWidthM: 2.5,
      bayDepthM: 5.5,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XXXXX_X",
      approachM: 60,
      entry: "south",
      targetIndex: 5,
    },
    districtId: "lot-night-v1",
  },
  start: { spawnPointId: "lotnt-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Night is this template's own environment at every rung, so the lamp step is
    // step 1 here — and it is also the act that comes first in time (L10).
    // 71 ch
    { n: 1, textBg: "Включи късите светлини ПРЕДИ да тръгнеш — тъмно е и редът не е осветен." },
    // 65 ch
    { n: 2, textBg: "Помни: нощем фаровете не са само за да виждаш, а за да те виждат." },
    // 72 ch
    { n: 3, textBg: "Карай бавно покрай целия ред и чети линиите — свободното е чак към края." },
    // 65 ch
    { n: 4, textBg: "Спри успоредно на предната кола — под 6 км/ч — броня срещу броня." },
    // 71 ch
    { n: 5, textBg: "Включи на задна — огледала, после през рамо — и завърти докрай надясно." },
    // 68 ch
    { n: 6, textBg: "Мери разстоянието по огледала и по светлините на съседа, не по усет." },
    // 53 ch
    { n: 7, textBg: "Влез, изправи се успоредно на бордюра и спри напълно." },
    // 52 ch
    { n: 8, textBg: "Дръж светлините включени, докато не спреш двигателя." },
  ],
  success: [
    {
      id: "sc-pnt-setup",
      // CLAIM GATE. This TITLE was already honest; `objectiveBg` was not — it
      // read „първо включи късите светлини и спри в изходната позиция“, i.e.
      // it sold the lamps as the first half of Задача 1. No ObjectiveParams
      // variant reads a control state (ReachZone/PassSignal/DriveDistance/
      // Maneuver), and `stepReachZone` gets only position and speed, so no
      // authored value could ever have ticked that half. The duty is real and
      // is enforced ELSEWHERE, which is why the sentence now says so: the
      // compiled environment arms HEADLIGHTS_OFF_AT_NIGHT with no config gate
      // (lane11-data-truth), the template's own mistake-no-lights demo cites
      // that code, and briefing step 1 states the act before the wheels turn.
      titleBg: "Задача 1: спри в изходната позиция до предната кола",
      params: { kind: "reachZone", x: 4.0, y: 19.3, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pnt-park",
      titleBg: "Задача 2: паркирай на заден ход в тъмното и спри напълно",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_NIGHT_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pnt-park" },
    economy: { objectiveId: "sc-pnt-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 120,
  },
  shadow: { path: "content/traces/sc-park-night/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-night/mistake-no-lights.trace.json" },
      titleBg: "„Паркингът е близо, няма да паля светлините“",
      whatWentWrongBg:
        "Колата мина целия неосветен ред без светлини. Линиите останаха невидими за шофьора, а самата кола — за всички останали. Задължението за светлините не зависи от разстоянието: щом е тъмно, те са включени.",
      codeRefs: ["HEADLIGHTS_OFF_AT_NIGHT"],
    },
    {
      traceRef: { path: "content/traces/sc-park-night/mistake-too-deep.trace.json" },
      titleBg: "Назад „по усет“, докато нещо спре колата",
      whatWentWrongBg:
        "В тъмното задната кола не се вижда добре и шофьорът продължи назад, докато не я усети с бронята. Нощем разстоянието не се усеща — то се чете в огледалата и по светлоотразителите на съседа; при съмнение спираш и излизаш да погледнеш.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всяка вечер, когато се прибираш — уличното осветление свършва точно там, където започва редът с паркираните коли.",
    whyBg:
      "Нощем и двете страни на паркирането се влошават: ти виждаш по-малко, и теб те виждат по-малко. Светлините са и инструмент, и сигнал; изключените фарове „за две минути“ са причината за половината одраскани брони в квартала.",
    lawRef: "ЗДвП чл. 70",
    examinerBg:
      "Изпитващият гледа дали светлините са включени преди началото на движението, пешеходната скорост покрай реда, наблюдението и крайния резултат в очертанията.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pnt-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      // L5: нощта плюс дъжд — мокрият асфалт разсипва светлината на фаровете и
      // линиите изчезват съвсем. Задължението за светлините е в инструкция 1.
      level: 5,
      conditions: { weather: "rain", night: true },
      physics: { wetGrip: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-pnt-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  // The whole drill is after dark — the night is the lesson, not a rung.
  conditions: { weather: "dry", night: true },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 9 — sc-park-double „Два реда гнезда"
// ---------------------------------------------------------------------------

export const SC_PARK_DOUBLE: ScenarioSpec = {
  id: "sc-park-double",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "тесен коридор", "два реда", "супермаркет"],
  titleBg: "Два реда гнезда — паркиране в тесен коридор",
  objectiveBg:
    "Две задачи, в този ред: първо спри точно по средата на алеята, защото отсрещният ред оставя под шест метра свободен коридор; после влез на заден ход със замах, който започва от средата — широкият подход тук е удар в чужда кола.",
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-safety-space"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
      side: "both",
      occupancyWest: "XXXXX",
    },
    districtId: "lot-double-v1",
  },
  start: { spawnPointId: "lotdb-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Step 5 was 211 characters and ended with the lamp clause; the correction
    // rule inside it is an instruction and now stands as one.
    // 66 ch
    { n: 1, textBg: "Подмини гнездото и спри — под 6 км/ч — точно по средата на алеята." },
    // 39 ch
    { n: 2, textBg: "Помни: една педя вляво вече е чужд ред." },
    // 77 ch
    { n: 3, textBg: "Знай: между двата пълни реда остават под шест метра — нито сантиметър повече." },
    // 80 ch
    { n: 4, textBg: "Включи на задна — огледала, после през рамо, и в двете посоки: и двете са заети." },
    // 75 ch
    { n: 5, textBg: "Прави целия замах назад: тръгнеш ли напред-наляво, вече си в отсрещния ред." },
    // 44 ch
    { n: 6, textBg: "Изправи волана, центрирай се и спри напълно." },
    // 53 ch
    { n: 7, textBg: "Коригирай НАПРЕД по дължината на алеята, не настрани." },
    // 73 ch
    { n: 8, textBg: "Включи вечер късите светлини — и за този, който идва насреща по коридора." },
  ],
  success: [
    {
      id: "sc-pdb-setup",
      titleBg: "Задача 1: спри в средата на алеята, покрай гнездото",
      params: { kind: "reachZone", x: 0.9, y: 6.3, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pdb-park",
      titleBg: "Задача 2: паркирай на заден ход, без да влизаш в отсрещния ред",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_DOUBLE_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pdb-park" },
    economy: { objectiveId: "sc-pdb-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-opposite-row", titleBg: "Поглед към отсрещния ред по време на замаха" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 110,
  },
  shadow: { path: "content/traces/sc-park-double/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-double/mistake-wide-run-up.trace.json" },
      titleBg: "Широк подход от отсрещната страна",
      whatWentWrongBg:
        "Навикът от празен паркинг: колата се дръпна широко вляво, за да „вземе ъгъл“ — и закачи паркиран автомобил от отсрещния ред. В коридор между два реда широк подход не съществува; маневрата тръгва от средата и се прави с повече завъртане, не с повече място.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-double/mistake-correct-backwards.trace.json" },
      titleBg: "Корекция назад през коридора",
      whatWentWrongBg:
        "Ъгълът не стана и шофьорът тръгна назад НАСТРАНИ, за да го поправи — право в отсрещния ред. В тесен коридор корекцията се прави напред, по дължината на алеята: излизаш, подреждаш се отново и влизаш пак.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Във всеки паркинг на супермаркет, мол или болница: два реда гнезда с една алея между тях, и всички места отсреща заети.",
    whyBg:
      "Повечето учебни паркинги са празни и учат на широк подход, който в реалния паркинг просто няма къде да се случи. Тесният коридор те кара да завъртиш повече волан и по-рано — и това е умението, което прави разликата в събота следобед.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа дали държиш средата на алеята, дали замахът остава в твоята половина и дали крайният резултат е в очертанията без допир до нито един съсед.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pdb-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      level: 5,
      conditions: { night: true },
      toleranceScale: 0.8,
      rubric: { economy: { objectiveId: "sc-pdb-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// 10 — sc-park-judge „Прецени мястото"
// ---------------------------------------------------------------------------

export const SC_PARK_JUDGE: ScenarioSpec = {
  id: "sc-park-judge",
  family: "parking",
  tagsBg: ["паркиране", "преценка", "успоредно", "късо място", "решение"],
  titleBg: "Прецени мястото: късо и достатъчно",
  objectiveBg:
    "Две задачи, в този ред: първо спри срещу първото свободно място, защото оттам се мери с поглед — то е по-късо от колата плюс метър и не се взима; после паркирай на заден ход във ВТОРОТО, което е близо десет метра.",
  archetypeIds: ["PK-01"],
  conceptIds: ["c-maneuver-principles", "c-safety-space", "c-reversing"],
  map: {
    archetype: "parking-lot",
    params: {
      bays: 6,
      bayWidthM: 2.5,
      bayDepthM: 4.2,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XX_X_X",
      approachM: 90,
      entry: "south",
      pitchesM: "6|4.4|4.4|7|7",
      targetIndex: 4,
    },
    districtId: "lot-gap-judge-v1",
  },
  start: { spawnPointId: "lotgj-spawn-approach", vehicleStart: "ready" },
  instructionsBg: [
    // Step 5 was 203 characters — five acts and a night clause. The whole drill
    // is a JUDGEMENT, so the rule („дължина + метър“) sits directly under the act
    // it governs instead of at the end of a paragraph.
    // 71 ch
    { n: 1, textBg: "Спри срещу първото място — под 6 км/ч — и го премери от броня до броня." },
    // 70 ch
    { n: 2, textBg: "Помни правилото: под една дължина кола плюс метър мястото не се взима." },
    // 74 ch
    { n: 3, textBg: "Виж: първото е около четири и трийсет, а колата ти е четири и четиридесет." },
    // 64 ch
    { n: 4, textBg: "Не пробвай „само да видиш“ — решението се взима ПРЕДИ маневрата." },
    // 68 ch
    { n: 5, textBg: "Знай: в по-късо място всяка поправка на единия край е удар в другия." },
    // 63 ch
    { n: 6, textBg: "Продължи до второто място — близо десет метра, над две дължини." },
    // 71 ch
    { n: 7, textBg: "Спри успоредно на предната кола, огледала и рамо, волан докрай надясно." },
    // 36 ch
    { n: 8, textBg: "Изправи се и спри напълно в мястото." },
    // 81 ch
    { n: 9, textBg: "Включи късите светлини още ПРЕДИ огледа — на тъмно двете места изглеждат еднакви." },
  ],
  success: [
    {
      id: "sc-pgj-assess",
      // CLAIM GATE. „…и го премери“ is a judgement, and the tick is a disc:
      // the drill's whole subject — that the short slot is REFUSED — is proven
      // by Задача 2 landing in the SECOND bay 11 m up the row, not by this
      // halt. So this title names the halt and the refusal keeps its own
      // objective, which is the honest division of the two.
      titleBg: "Задача 1: спри срещу късото място",
      // Beside the 4.3 m slot (traces/scParkDepth GJ_ASSESS_X / GJ_SHORT_Y):
      // the halt IS the act — the decision is taken here or it is taken with a
      // bumper. r 4 excludes the second slot, 11 m further up the row.
      params: { kind: "reachZone", x: 4.0, y: -4.0, radiusM: 4, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pgj-park",
      titleBg: "Задача 2: паркирай на заден ход във ВТОРОТО място",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_JUDGE_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pgj-park" },
    economy: { objectiveId: "sc-pgj-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 130,
  },
  shadow: { path: "content/traces/sc-park-judge/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-judge/mistake-try-short.trace.json" },
      titleBg: "„Ще се сместя“ — маневра в място, което не е място",
      whatWentWrongBg:
        "Изходната позиция беше вярна, наблюдението — също. Мястото не беше: завоят закачи колата отпред, а задницата стигна до колата отзад. Между двете брони има четири метра и трийсет, а колата е четири и четиридесет — никаква техника не запълва тази разлика.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-judge/mistake-short-forward.trace.json" },
      titleBg: "Опит да се „вреже“ напред",
      whatWentWrongBg:
        "Другият опит в същия процеп: носът влиза под ъгъл, предницата опира в колата отпред, а задницата остава в платното. Късото място не се превзема с друг подход — то се разпознава и се подминава.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато търсиш място в оживена улица и първото свободно изглежда „почти достатъчно“ — точно тогава решението струва най-скъпо.",
    whyBg:
      "Най-важната част от паркирането става, преди воланът да е мръднал. Измерването с поглед — една дължина на колата плюс метър — спестява ударите, блокираната улица и петте минути с включени аварийни. Това е единственото умение тук, което не е за ръцете.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа дали изобщо преценяваш място, преди да маневрираш: спиране срещу мястото, оглед, решение — и чак после маневра. Опит в явно късо място е груба грешка дори без допир.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pgj-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      // L5: същата преценка нощем, когато и двете места изглеждат еднакви.
      // Задължението за светлините е записано в инструкция 9 — последната;
      // беше записано 5.
      level: 5,
      conditions: { night: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-pgj-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The parking-depth wave, in catalog order. */
export const SCENARIO_TEMPLATES_PARKING3: readonly ScenarioSpec[] = [
  SC_PARK_GAP_SHORT,
  SC_PARK_GAP_LONG,
  SC_PARK_VAN,
  SC_PARK_45_REV,
  SC_PARK_LEFT,
  SC_PARK_ZEBRA,
  SC_PARK_WALL,
  SC_PARK_NIGHT,
  SC_PARK_DOUBLE,
  SC_PARK_JUDGE,
];
