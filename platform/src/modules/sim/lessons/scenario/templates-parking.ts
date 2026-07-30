/**
 * Scenario templates — PARKING family, S2-A breadth wave (doc 76 §9; the
 * sc-park-perp-rev mold). DATA ONLY: every coordinate is denormalized from
 * its committed lot district so nothing loads world JSON at runtime; the
 * templates test asserts each pinned bay matches the generator's
 * meta.scenario truth value-for-value.
 *
 * Five templates on gen_parking_lot.mjs variants (no new archetypes, no new
 * districts — every map here is COMMITTED and REUSED byte-for-byte):
 *   sc-park-parallel      — „Успоредно паркиране"          (lot-par-v1,    PK-01)
 *   sc-park-45            — „Паркиране на 45°"             (lot-45-v1,     PK-02)
 *   sc-park-narrow        — „Тясно гнездо"                  (lot-narrow-v1, PK-02)
 *   sc-park-perp-forward  — „Паркиране напред в гнездото"   (lot-perp-v1,   PK-02)
 *   sc-park-parallel-exit — „Излизане от успоредно място"   (lot-par-v1,    PK-01/PK-05)
 *
 * DOC 86 D11 — „Parking depth: the briefing promises two tasks and delivers
 * one". The founder played the four bay drills and wrote „it states it will
 * give 2 tasks … and its only 1 task … major discomfort trust issues", then
 * asked for „at least 10" genuinely different parking situations. Two things
 * in this file answer him, and they are separate fixes:
 *
 *  1. THE SECOND TASK IS NOW REAL. Every bay drill's first success objective
 *     used to be a 14 m-wide waypoint at ≤15 km/h that the student satisfied
 *     by driving past it on the way to the only act the drill graded — so the
 *     HUD counted „Задача 1/2" for nothing. Each is now the ориентир its own
 *     instructions teach (at rest beside the neighbour for the reverse drills,
 *     the left-of-centre setup for the forward ones), pinned to the pose the
 *     recorded shadow actually holds. See each objective's comment for the
 *     before/after numbers.
 *  2. TWO NEW ACTS, NOT TWO NEW SKINS. The family taught reversing IN (P0,
 *     parallel, narrow, 45 forward) and reversing OUT of a perpendicular bay.
 *     Nobody taught the entry most drivers actually make — nose first — or
 *     leaving a kerbside slot, which is the manoeuvre that puts a learner's
 *     tail into a live lane. Both ride committed maps.
 *
 * Traces are RECORDED (the §5 gate + §9 stage-5 code asserts run in
 * traces/__tests__/sc-park-*-traces.test.ts; re-record with RECORD_TRACES=1).
 */

import type { ScenarioSpec } from "./types";
import type { ParkingBaySpec } from "../../contracts";

// ---------------------------------------------------------------------------
// Pinned target bays (meta.scenario of the committed districts — bay-3, the
// only free one in every XX_XX row; copied by VALUE, the lesson-specs law)
// ---------------------------------------------------------------------------

/** content/world/lot-par-v1.json — free parallel slot between two parked cars. */
export const LOT_PAR_TARGET_BAY: ParkingBaySpec = {
  x: 6.28,
  y: 0,
  headingDeg: 0,
  widthM: 2.5,
  lengthM: 5.5,
};

/** content/world/lot-45-v1.json — free echelon bay, axis 45° to the aisle. */
export const LOT_45_TARGET_BAY: ParkingBaySpec = {
  x: 4.8,
  y: 0,
  headingDeg: 45,
  widthM: 2.7,
  lengthM: 5,
};

/** content/world/lot-narrow-v1.json — the 2.5 m tight pocket, both neighbors occupied. */
export const LOT_NARROW_TARGET_BAY: ParkingBaySpec = {
  x: 5.03,
  y: 0,
  headingDeg: 90,
  widthM: 2.5,
  lengthM: 5,
};

/** content/world/lot-perp-v1.json — the P0's free 2.7 m perpendicular bay, REUSED
 *  by sc-park-perp-forward (the nose-in entry into the same pocket the P0
 *  reverses into). Copied by VALUE like every other bay in this file; the lane's
 *  battery asserts it against the district's meta.scenario.bays. */
export const LOT_PERP_FWD_TARGET_BAY: ParkingBaySpec = {
  x: 5.03,
  y: 0,
  headingDeg: 90,
  widthM: 2.7,
  lengthM: 5,
};

// ---------------------------------------------------------------------------
// sc-park-parallel — „Успоредно паркиране" (doc-72 PK-01: THE Наредба-38
// required maneuver; reverse entry off two reference-point turns)
// ---------------------------------------------------------------------------

export const SC_PARK_PARALLEL: ScenarioSpec = {
  id: "sc-park-parallel",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "успоредно", "изпитни упражнения"],
  titleBg: "Успоредно паркиране",
  objectiveBg:
    "Две задачи, в този ред: първо спри в изходната позиция — успоредно на предната кола, на половин до един метър от нея; после паркирай на заден ход в мястото по трите ориентира, с непрекъснато наблюдение и възможно най-малко корекции.",
  // Doc-72 provenance: PK-01 IS reverse parallel parking (Н38 required
  // maneuver, graded on control, observation and result).
  archetypeIds: ["PK-01"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // Mirrored in lot-par-v1.json meta.scenario.params (gen_parking_lot.mjs
    // angle "parallel": street-side slots along the east curb, 6.5 m pitch).
    params: {
      bays: 5,
      bayWidthM: 2.5,
      bayDepthM: 5.5,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-par-v1",
  },
  start: {
    spawnPointId: "lot-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Задачите са две и се броят поотделно: първо изходната позиция, после самото паркиране. Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч.",
    },
    {
      n: 2,
      textBg:
        "Задача 1: спри успоредно на предната кола, на половин до един метър странично — задната ти броня изравнена с нейната задна броня. Това е ориентир 1 и маневрата започва от него, не от волана.",
    },
    {
      n: 3,
      textBg:
        "Включи на задна. Огледай се — двете огледала, после през рамо — и завърти волана докрай надясно.",
    },
    {
      n: 4,
      textBg:
        "Върни бавно назад, докато колата застане под около 45° към реда. Това е ориентир 2.",
    },
    {
      n: 5,
      textBg:
        "Щом предната ти броня подмине задната броня на предната кола, завърти докрай наляво и продължи назад. Това е ориентир 3.",
    },
    {
      n: 6,
      textBg:
        "Изправи колата успоредно на линиите, центрирай се в мястото и спри напълно.",
    },
  ],
  success: [
    {
      id: "sc-ppl-position",
      titleBg: "Задача 1: спри в изходната позиция до предната кола",
      // DOC 86 D11 — „the lesson states TWO tasks and delivers one". This gate
      // used to be a 14 m-wide drive-by at ≤ 15 km/h centred on the aisle
      // (x 0, y 6, r 7), so the HUD counted „Задача 1/2" for something no
      // student ever performed: you satisfied it by driving past at 15 km/h,
      // 4 m from the aisle centre, on the way to the only act the drill really
      // graded. It is now the ориентир instruction 2 actually teaches — AT REST
      // beside the lead car, at the pose the recorded shadow stops on
      // (traces/scParkParallel.ts X_SETUP 3.68 / Y_SETUP 6.3).
      // Radius stays generous (5 m — every sane stopping position for this
      // maneuver is inside it, and B4's „blown capped waypoint" hazard needs a
      // 3-second roll back at 10 km/h to undo, not a 200 m boulevard); the
      // SPEED CAP is what turns a waypoint into a task.
      params: { kind: "reachZone", x: 3.68, y: 6.3, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-ppl-park",
      titleBg: "Задача 2: паркирай на заден ход в успоредното място и спри напълно",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_PAR_TARGET_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-ppl-park" },
    // German Grundfahraufgaben: > 2 correction pulls = a codified fault
    // (doc-72 PK-01 evidence) — 1 entry clean, 2 acceptable.
    economy: { objectiveId: "sc-ppl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на завъртането" },
        { id: "obs-final-check", titleBg: "Контролен поглед преди окончателното спиране" },
      ],
    },
    parTimeSec: 110,
  },
  shadow: { path: "content/traces/sc-park-parallel/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-park-parallel/mistake-far-from-lead.trace.json",
      },
      titleBg: "Твърде далеч от предната кола",
      whatWentWrongBg:
        "Изходната позиция започна на близо два метра от предната кола — геометрията на маневрата се разпадна: ъгълът не стигна до бордюра и при опита за корекция задницата удари задната кола. Правилно: около половин метър странично от съседа.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: {
        path: "content/traces/sc-park-parallel/mistake-no-observation.trace.json",
      },
      titleBg: "Заден ход без наблюдение",
      whatWentWrongBg:
        "Задната скорост влезе без оглеждане в огледалата и през рамо — пешеходец, минаващ зад колата, остана невидим до самия удар. Чл. 40 изисква да се убедиш, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато паркираш край тротоара между две коли — в квартала, пред офиса и на изпита. Успоредното паркиране на заден ход е задължителната маневра по Наредба 38 и най-честата градска маневра изобщо.",
    whyBg:
      "Правилното странично разстояние и три прости ориентира превръщат „невъзможното“ място във влизане от първи опит. Който владее ориентирите, не блокира улицата, не опира бордюра и не гадае къде е задницата на колата.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа изходната позиция (успоредно, на половин до един метър), непрекъснатото наблюдение преди и по време на задния ход, и крайния резултат — в очертанията, успоредно, без повече от една корекция. Прекъсни маневрата, ако се появи пешеходец или кола.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      // Doc 86 D7 (lane 12's rubric seam): the exam rung finally GRADES
      // tighter, not just „no aids + cold start". On the изпит a second
      // correction pull is already a remark; here it costs the third star.
      rubric: { economy: { objectiveId: "sc-ppl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    // L5 „Усложнени": по-строг допуск — прецизно прибиране, and the placement
    // is scored against the same one-pull economy as the exam rung.
    {
      level: 5,
      toleranceScale: 0.8,
      rubric: { economy: { objectiveId: "sc-ppl-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-park-45 — „Паркиране на 45°" (doc-72 PK-02 echelon variant: forward
// entry into an angled bay; the swing-awareness drill)
// ---------------------------------------------------------------------------

export const SC_PARK_45: ScenarioSpec = {
  id: "sc-park-45",
  family: "parking",
  tagsBg: ["паркиране", "косо място", "преден ход", "прецизност"],
  titleBg: "Паркиране на 45°",
  objectiveBg:
    "Две задачи, в този ред: първо се дръпни вляво в алеята и намали — косото място не се взима от дясната лента; после влез напред под 45° с един плавен завой, без да подрязваш ъгъла на съседа и без да подминаваш линията на гнездото.",
  // Doc-72 provenance: PK-02 covers bay parking in lot geometry with
  // swing-out awareness — the echelon row is its angled variant.
  archetypeIds: ["PK-02"],
  conceptIds: ["c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // Mirrored in lot-45-v1.json meta.scenario.params (angle "45": echelon
    // bays opening toward the northbound aisle).
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "45",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-45-v1",
  },
  start: {
    spawnPointId: "lot-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Задачите са две и се броят поотделно: първо изходната позиция, после влизането в мястото. Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч. Ако е тъмно или вали, включи късите светлини преди маневрата.",
    },
    {
      n: 2,
      textBg:
        "Задача 1: дръпни се леко вляво в алеята — към средата ѝ, не по дясната лента — и намали до пешеходна скорост. Косото място се отваря надясно пред теб и завоят иска това място отляво.",
    },
    {
      n: 3,
      textBg: "Огледай се — дясното огледало, после през рамо — и пусни десен мигач.",
    },
    {
      n: 4,
      textBg:
        "Завий плавно надясно, щом предната броня се изравни с близкия ъгъл на мястото, и влез напред под 45° — следи съседната кола в дясното огледало.",
    },
    {
      n: 5,
      textBg:
        "Изправи волана по посоката на линиите и спри центрирано в очертанията, без да подминаваш крайната линия.",
    },
  ],
  success: [
    {
      id: "sc-p45-position",
      titleBg: "Задача 1: дръпни се вляво и намали преди косото място",
      // DOC 86 D11. The old gate (x 0, y −8, r 7, ≤15 km/h) was satisfied from
      // the RIGHT lane at x = 4.06 (3.06 m < 7) at 15 km/h — i.e. by doing
      // nothing the instructions ask for, which is why the drill read as one
      // task. This one is a real, checkable act: the left-of-centre setup pose
      // the shadow drives (traces/scPark45.ts veerPoints ends at x = 1.0,
      // y = −9.5) at the taught approach speed. r 3.0 EXCLUDES the right lane
      // (|4.06 − 0.5| = 3.56 > 3.0), so a student who never opens the swing
      // sees „Задача 1/2" stay open and knows why.
      // NOT a halt gate, unlike the reverse drills: a 45° entry is ONE smooth
      // arc — asking for a stop here would contradict instruction 4.
      params: { kind: "reachZone", x: 0.5, y: -9.5, radiusM: 3, maxSpeedKmh: 10 },
    },
    {
      id: "sc-p45-park",
      titleBg: "Задача 2: влез напред в косото място и спри напълно",
      // S2 forward-entry gate: the bay entry itself must happen in a forward
      // gear (entry "forward") — the echelon drill is nose-in by design.
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_45_TARGET_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
        entry: "forward",
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-p45-park" },
    economy: { objectiveId: "sc-p45-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    // No observation moments: the v1 observation mapper anchors on a REVERSE
    // phase (parking-family window model) — a forward drill would surface a
    // permanently unmeasured channel instead of honest data.
    parTimeSec: 75,
  },
  shadow: { path: "content/traces/sc-park-45/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-park-45/mistake-overshoot.trace.json",
      },
      titleBg: "Подмината линия на гнездото",
      whatWentWrongBg:
        "Влизането продължи твърде дълбоко — предната броня подмина крайната линия на гнездото и предното колело опря в бордюра. Ориентирът е прост: спри, щом линиите отстрани застанат успоредно на колата, не когато бордюрът те спре.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: {
        path: "content/traces/sc-park-45/mistake-corner-cut.trace.json",
      },
      titleBg: "Подрязан ъгъл на съседа",
      whatWentWrongBg:
        "Завоят започна твърде рано и диагоналът мина твърде близо до съседното място — страницата на колата закачи ъгъла на паркирания съсед с пешеходна скорост. В паркинга и 2 км/ч са удар: отвори завоя и дръж метър до реда.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "На косите паркинги пред магазини, покрай булеварди и в подземни гаражи — навсякъде, където местата са начертани под ъгъл и се влиза напред, по посоката на движение.",
    whyBg:
      "Косото място прощава по-малко, отколкото изглежда: подранил завой подрязва съседа, закъснял — качва колата на линията. Един плавен завой с точен момент на завиване е разликата между едно движение и три корекции с чакаща колона отзад.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа момента на завиване (предната броня срещу близкия ъгъл на мястото), плавната крива с пешеходна скорост и крайния резултат — центрирано в очертанията, без опрян бордюр и без навлизане в съседното място.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-p45-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      // L5 „Усложнени" (doc 86 L13 — this template had NO L5 at all): the same
      // echelon row after dark, when the painted 45° line is the one cue the
      // maneuver depends on and the headlights are the only thing that shows
      // it. Instruction 1 states the lights duty, so the compiled night
      // environment does not bill HEADLIGHTS_OFF_AT_NIGHT for a duty this
      // lesson never taught (doc 86 L10). Placement is also graded tighter.
      level: 5,
      conditions: { night: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-p45-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-park-narrow — „Тясно гнездо" (doc-72 PK-02 at bayWidth 2.5: the hard
// variant of the P0 maneuver — steeper swing, tighter rubric)
// ---------------------------------------------------------------------------

export const SC_PARK_NARROW: ScenarioSpec = {
  id: "sc-park-narrow",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "тясно място", "прецизност"],
  titleBg: "Тясно гнездо",
  objectiveBg:
    "Две задачи, в този ред: първо спри в изходната позиция покрай реда, на около метър странично; после паркирай на заден ход в тясното 2,5-метрово място — с по-стръмен замах от обичайния, непрекъснато наблюдение и точно центриране в очертанията.",
  // Doc-72 provenance: PK-02 (perpendicular bay reverse) — the tight-pocket
  // parameter variant, both neighbors occupied.
  archetypeIds: ["PK-02"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "parking-lot",
    // Mirrored in lot-narrow-v1.json meta.scenario.params (angle "90" at
    // bayWidth 2.5 — the doc-76 §2 tight rung of the P0 recipe).
    params: {
      bays: 5,
      bayWidthM: 2.5,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-narrow-v1",
  },
  start: {
    spawnPointId: "lot-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Задачите са две и се броят поотделно: първо изходната позиция, после самото паркиране. Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч. Ако е тъмно или вали, включи късите светлини преди маневрата.",
    },
    {
      n: 2,
      textBg:
        "Задача 1: подмини тясното място и спри, когато задната броня подмине съседната кола — дръж около метър странично разстояние от реда. От тази позиция зависи целият замах.",
    },
    {
      n: 3,
      textBg:
        "Включи на задна. Огледай се — двете огледала, после през рамо — и завий към мястото с по-стръмна дъга от обичайната: в тясното гнездо широкият замах закача съседа.",
    },
    {
      n: 4,
      textBg:
        "Движи се назад съвсем бавно и следи двете съседни коли в огледалата — тук грешката се мери в сантиметри.",
    },
    {
      n: 5,
      textBg:
        "Изправи волана, центрирай се точно между линиите и спри напълно в покой.",
    },
  ],
  success: [
    {
      id: "sc-pnr-position",
      titleBg: "Задача 1: спри в изходната позиция покрай тясното място",
      // DOC 86 D11 — see the sc-park-parallel note. Was (0, 6) r 7 ≤15 km/h:
      // a drive-by. Now AT REST at the pose the shadow stops on
      // (traces/scParkNarrow.ts X_SETUP 0.9 / Y_SETUP 5.8), radius 5.
      params: { kind: "reachZone", x: 0.9, y: 5.8, radiusM: 5, maxSpeedKmh: 6 },
    },
    {
      id: "sc-pnr-park",
      titleBg: "Задача 2: паркирай на заден ход в тясното място и спри напълно",
      // Tighter than the P0 rubric (0.5 m / 10°): the 2.5 m pocket leaves
      // 0.4 m per side — the drill IS precision.
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_NARROW_TARGET_BAY,
        centerTolM: 0.35,
        headingTolDeg: 7,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pnr-park" },
    economy: { objectiveId: "sc-pnr-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на движението на заден ход" },
        { id: "obs-final-check", titleBg: "Контролен поглед към съседните коли преди окончателното спиране" },
      ],
    },
    parTimeSec: 100,
  },
  shadow: { path: "content/traces/sc-park-narrow/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: {
        path: "content/traces/sc-park-narrow/mistake-wide-swing.trace.json",
      },
      titleBg: "Широк замах в тясното място",
      whatWentWrongBg:
        "Дъгата, която работи на широкото място, тук е твърде широка — по средата на завъртането задният калник закачи съседната кола. В тясно гнездо се влиза по-стръмно: по-късен и по-остър завой, с половин око на всяко огледало.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: {
        path: "content/traces/sc-park-narrow/mistake-no-observation.trace.json",
      },
      titleBg: "Заден ход без наблюдение",
      whatWentWrongBg:
        "Задната скорост влезе без огледала и без поглед през рамо — пешеходец, минаващ зад колата, остана невидим до самия удар. Чл. 40 изисква да се убедиш, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Пълните градски паркинги, подземните гаражи и „последното останало място“ между два джипа — тясното гнездо е ежедневието на шофьора в големия град.",
    whyBg:
      "Точно в тесните места стават повечето паркинг-удари: широкият замах, който минава на просторното място, тук струва калник. По-стръмен подход, пешеходна скорост и постоянна работа с огледалата правят тясното място рутинно.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа адаптацията: по-късен завой със стръмна дъга, скорост на кретане, непрекъснато наблюдение в двете огледала и краен резултат точно между линиите — без докосване на съседите и без излишни корекции.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-pnr-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    // L5 „Усложнени" (doc 76 §7): the same pocket at night in the rain —
    // condition delta only, no new geometry. The lights duty is stated in
    // instruction 1 (doc 86 L10: a rung may not bill HEADLIGHTS_OFF_AT_NIGHT /
    // _IN_RAIN for a duty the lesson's own copy never states).
    {
      level: 5,
      conditions: { weather: "rain", night: true },
      rubric: { economy: { objectiveId: "sc-pnr-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-park-perp-forward — „Паркиране напред в гнездото" (doc-72 PK-02 forward
// variant) on lot-perp-v1, the P0's map REUSED byte-for-byte
// ---------------------------------------------------------------------------

/**
 * WHY THIS IS NOT sc-park-perp-rev WITH THE ARROW REVERSED. The P0 teaches the
 * entry the examiner asks for. This one teaches the entry the student will
 * actually make on Monday — nose first, because it is one movement and it feels
 * easy — and then makes him pay for it inside the same lesson.
 *
 * The two are geometrically different manoeuvres, not two directions of one.
 * Reversing in, the car pivots about its REAR axle: the tail goes where you
 * point it and the nose sweeps wide into the aisle you can see. Going in nose
 * first, it pivots about the rear axle the other way round: the TAIL swings out
 * across the aisle behind you, the front inside wheel cuts the corner, and the
 * whole swing has to be bought in advance — from the far side of the aisle,
 * one full turning radius before the bay. That is why the drill's first task is
 * lateral („вземи си място отляво") and not a stop: a forward bay entry has no
 * stopping point, it has a RADIUS, and starting it from the right-hand lane is
 * how the neighbour's corner gets taken.
 *
 * And the cost, which no other template states: the driver who enters nose-in
 * has bought a blind reverse out, between two cars, into an aisle where people
 * walk. Mistake demo 2 IS that exit — the same clean park as the shadow,
 * followed by the manoeuvre it obliges. This is the honest argument for reverse
 * parking, made in world space, and it is why sc-park-bay-exit-rev exists.
 *
 * SAME DISTRICT, NOT ONE BYTE CHANGED. lot-perp-v1 already hosts the P0 and its
 * exit half; reusing it is the point — the student meets the identical pocket
 * three times and the only variable is what he does with it.
 */
export const SC_PARK_PERP_FORWARD: ScenarioSpec = {
  id: "sc-park-perp-forward",
  family: "parking",
  tagsBg: ["паркиране", "преден ход", "перпендикулярно", "замах на задницата", "сляп изход"],
  titleBg: "Паркиране напред в гнездото",
  objectiveBg:
    "Две задачи, в този ред: първо си вземи място отляво в алеята и намали — завоят иска цялата ѝ ширина; после влез НАПРЕД в гнездото с една дъга, без да подрязваш ъгъла на съседа. И запомни какво купуваш с това влизане: излизането ще е на заден и на сляпо.",
  // Doc-72 provenance: PK-02 IS the perpendicular bay archetype (lot geometry,
  // swing-out awareness); this is its forward-entry half. PK-05 („потеглянето
  // от място е маневра и започва с оглед") is the exit the drill charges for.
  archetypeIds: ["PK-02", "PK-05"],
  conceptIds: ["c-maneuver-principles", "c-mirrors-blind-spots", "c-reversing"],
  map: {
    archetype: "parking-lot",
    // The P0's generator recipe verbatim — the map is REUSED, not regenerated
    // (tools/maps/gen_parking_lot.mjs; mirrored in lot-perp-v1.json
    // meta.scenario.params, asserted value-for-value by the lane battery).
    params: {
      bays: 5,
      bayWidthM: 2.7,
      bayDepthM: 5,
      angle: "90",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-perp-v1",
  },
  start: {
    // NOT `lot-spawn-approach`. That spawn sits at (0, −105) — the approach
    // road's CENTRELINE — which is doc 86 T2: `runtime/locator.ts` reads
    // laneOffsetM 4.06 there against `laneKeepMaxOffsetM` 3.25, so the car
    // begins the lesson already in violation and collects CENTER_LINE_TOUCHED
    // 3.5 s after it first moves. Thirty-one shipped scenarios do that and this
    // one refuses to be the thirty-second: an explicit pose on the RIGHT-LANE
    // centre of the same edge (2 lanes × 3.25 m × 2.5 perceptual scale / 2 =
    // 4.0625), which is where the P0's own shadow drives to in its first three
    // metres anyway. Same road, same heading, legal from frame one.
    position: { x: 4.0625, y: -105 },
    headingDeg: 0,
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Задачите са две и се броят поотделно: първо изходната позиция, после влизането. Влез в паркинга по алеята и карай бавно — не повече от 10 км/ч. Ако е тъмно, включи късите светлини: линиите на гнездото са единственият ти ориентир.",
    },
    {
      n: 2,
      textBg:
        "Задача 1: дръпни се вляво към средата на алеята и намали под 8 км/ч. Влизането напред не се прави от дясната лента — там дъгата просто не се побира и предният десен ъгъл минава през съседа.",
    },
    {
      n: 3,
      textBg:
        "Пусни десен мигач и изчакай: завърташ, когато предната ти броня се изравни с ближния ъгъл на свободното място, не по-рано.",
    },
    {
      n: 4,
      textBg:
        "Завий надясно в ЕДНА дъга и следи дясното огледало — там минава ъгълът на съседната кола. Задницата ти в същото време замахва наляво през алеята: увери се, че отзад няма кой да я срещне.",
    },
    {
      n: 5,
      textBg:
        "Изправи волана по линиите, влез до центъра на мястото и спри напълно, без да опираш бордюра отпред.",
    },
    {
      n: 6,
      textBg:
        "Преди да слезеш — помисли за после. Паркиран с нос навътре, ти ще излизаш назад между две коли, които крият цялата алея. Затова изпитът учи обратното паркиране: то мести сляпата минута в началото, когато още виждаш.",
    },
  ],
  success: [
    {
      id: "sc-ppf-setup",
      titleBg: "Задача 1: дръпни се вляво в алеята и намали",
      // A REAL first task (doc 86 D11), and a lateral one: the gate is centred
      // on the setup line the shadow drives (x = 0.9 — as far left as the lane
      // detectors allow, |laneOffset| 3.16 < 3.25) and its radius 3.0 EXCLUDES
      // the right-hand lane (|4.0625 − 0.9| = 3.16 > 3.0). A student who never
      // opens the swing sees „Задача 1/2" stay open and is told why by
      // instruction 2 — instead of clipping the neighbour and wondering.
      // Cap 8 = the „намали под 8 км/ч" instruction 2 states out loud (doc 86
      // D4: no hidden speed contracts); the shadow passes here at 6.
      params: { kind: "reachZone", x: 0.9, y: -6.5, radiusM: 3, maxSpeedKmh: 8 },
    },
    {
      id: "sc-ppf-park",
      titleBg: "Задача 2: влез напред в гнездото и спри напълно",
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: LOT_PERP_FWD_TARGET_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
        // The whole subject: the bay must be entered in a FORWARD gear. A
        // student who reverses in has done the P0, not this drill.
        entry: "forward",
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-ppf-park" },
    economy: { objectiveId: "sc-ppf-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    // No observation moments: the v1 observation mapper anchors on a REVERSE
    // phase (the parking-family window model), and this entry has none — the
    // sc-park-45 precedent. A channel that cannot measure must not pretend to.
    parTimeSec: 80,
  },
  shadow: { path: "content/traces/sc-park-perp-forward/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-perp-forward/mistake-early-turn.trace.json" },
      titleBg: "Подранил завой от дясната лента",
      whatWentWrongBg:
        "Волана надясно още от дясната лента и цяла кола по-рано — оттам дъгата няма как да стигне до мястото. Резултатът е геометричен, не е лош късмет: предната дясна четвърт мина точно през ъгъла на съседната кола, при това с пешеходна скорост. Влизането напред се плаща предварително — с място, взето отляво, и с един пълен радиус разстояние преди гнездото. Ако мястото отляво го няма, значи мястото не се взима напред.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-perp-forward/mistake-blind-exit.trace.json" },
      titleBg: "Чиста маневра, сляп изход",
      whatWentWrongBg:
        "Влизането беше безупречно — и точно затова тази демонстрация е важна: грешката не е в него, а в това, което то задължава. Минути по-късно колата излиза назад между две коли, които крият цялата алея, без нито един поглед преди задната предавка — и зад нея върви човек. Чл. 40 иска водачът да СЕ Е УБЕДИЛ, че пътят зад него е свободен, преди да потегли назад; от тази седалка, в това място, той не може да се убеди в нищо. Затова обратното паркиране не е изпитен каприз: то прави сляпата минута част от влизането, когато алеята е още пред очите ти, вместо част от излизането, когато вече не е.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки ден, на всеки паркинг пред магазин, блок или офис — влизането напред е това, което правят почти всички, защото е едно движение и изглежда по-лесно. Този урок не ти забранява да го правиш; учи те да го правиш правилно и да знаеш какво плащаш след това.",
    whyBg:
      "Влизането напред и влизането на заден са различни маневри, не две посоки на една. При заден ход колата се върти около задната си ос: задницата отива там, накъдето я насочиш, а предницата замахва широко в алеята, която виждаш. Напред е обратното — задницата замахва през алеята ЗАД теб, вътрешното предно колело реже ъгъла, а целият завой трябва да е купен предварително, от отсрещната страна на алеята и цял радиус преди мястото. Оттук идват двете типични щети: подрязаният ъгъл на съседа отпред и закачената минаваща кола отзад. И оттук идва цената: паркиран с нос навътре, ти си насрочил излизане на заден между две коли, в алея, по която вървят хора. Статистиката на паркинг-щетите не е за влизането — тя е за излизането.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа три неща при влизане напред: подготовката (изнесен вляво, пешеходна скорост, мигач), момента на завиване (бронята срещу ближния ъгъл на мястото) и контрола докъде стигат предният десен ъгъл и задницата — едната към съседа, другата към алеята. Краен резултат: центрирано в очертанията, успоредно на линиите, без опрян бордюр. И ако мястото позволява, изпитващият очаква да чуе защо би влязъл на заден вместо това.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    {
      level: 4,
      vehicleStart: "cold",
      rubric: { economy: { objectiveId: "sc-ppf-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
    {
      // L5 „Усложнени": the same pocket after dark — which is precisely when
      // the bill for a nose-in park comes due, because the exit this entry
      // obliges is made on mirrors and reversing lamps alone. The lights duty
      // is stated in instruction 1 (doc 86 L10).
      level: 5,
      conditions: { night: true },
      toleranceScale: 0.85,
      rubric: { economy: { objectiveId: "sc-ppf-park", attemptsFor3Stars: 1, attemptsFor2Stars: 1 } },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-park-parallel-exit — „Излизане от успоредно място" (doc-72 PK-01 exit half
// + PK-05) on lot-par-v1, the map REUSED byte-for-byte
// ---------------------------------------------------------------------------

/**
 * WHY THE EXIT IS A SEPARATE SKILL FROM THE ENTRY. Getting into a kerbside slot
 * is a geometry problem solved at 2 km/h with the whole street in front of you.
 * Getting out of one is a negotiation with a lane that belongs to somebody
 * else, and the driver is the last thing in the car to see down it.
 *
 * Two facts carry the drill:
 *  - the car pivots about its REAR axle, so steering left to leave swings the
 *    TAIL RIGHT — toward the kerb and toward the car parked behind. The room
 *    for that swing is bought BEFORE the manoeuvre, by reversing up to the rear
 *    car; there is no way to buy it once the wheels are turned.
 *  - the corner of the bonnet enters the lane several seconds before the driver
 *    can see along it. Whatever is filtering past on the left meets the car
 *    before the car meets it — which is why потеглянето от място е маневра
 *    (чл. 25) and a maneuver starts with a look, not with an indicator.
 *
 * START POSE, NOT A SPAWN POINT. `ScenarioStart.position` (6.28, 1.6) facing
 * north — inside lot-bay-3, tucked up 0.63 m behind the car in front. The
 * generator authored no spawn inside a slot, and the drill has nowhere else to
 * begin; the sc-park-bay-exit-rev precedent in templates-parking2.ts is the same
 * seam used the same way. The pose is legal at rest (|laneOffset| 2.22 m against
 * the 3.25 m detector envelope), so the student does not start in violation.
 */
export const SC_PARK_PARALLEL_EXIT: ScenarioSpec = {
  id: "sc-park-parallel-exit",
  family: "parking",
  tagsBg: ["паркиране", "излизане от място", "успоредно", "потегляне от място", "чл. 25"],
  titleBg: "Излизане от успоредно място",
  objectiveBg:
    "Две задачи, в този ред: първо върни назад до колата зад теб — мястото за завоя се купува преди маневрата; после излез в лентата с една плавна дъга, след оглед в огледалото и през ЛЯВОТО рамо, без да закачиш нито съседа отпред, нито бордюра със задницата.",
  // Doc-72 provenance: PK-01 owns the parallel-slot geometry (this is its exit
  // half); PK-05 owns „потеглянето от място е маневра и започва с оглеждане".
  archetypeIds: ["PK-01", "PK-05"],
  conceptIds: ["c-maneuver-principles", "c-mirrors-blind-spots", "c-reversing"],
  map: {
    archetype: "parking-lot",
    // sc-park-parallel's generator recipe verbatim — the map is REUSED, not
    // regenerated (tools/maps/gen_parking_lot.mjs; mirrored in lot-par-v1.json
    // meta.scenario.params).
    params: {
      bays: 5,
      bayWidthM: 2.5,
      bayDepthM: 5.5,
      angle: "parallel",
      aisleWidthM: 7,
      occupancy: "XX_XX",
      approachM: 90,
      entry: "south",
    },
    districtId: "lot-par-v1",
  },
  start: {
    // Parked in lot-bay-3, tucked up behind the front car (its rear bumper is
    // at y = 4.25; the hero's nose ends at y = 3.62 — 0.63 m of nothing).
    position: { x: 6.28, y: 1.6 },
    headingDeg: 0,
    vehicleStart: "ready",
  },
  instructionsBg: [
    {
      n: 1,
      textBg:
        "Колата е до бордюра между две паркирани коли, плътно зад предната. Задачите са две и се броят поотделно: първо мястото за завоя, после самото излизане.",
    },
    {
      n: 2,
      textBg:
        "Задача 1: включи на задна, върни бавно назад, докато почти опреш колата зад теб, и спри там. Това не е загубено движение — това е мястото, от което завоят изобщо може да започне.",
    },
    {
      n: 3,
      textBg:
        "Сега огледало, ляв мигач и поглед през ЛЯВОТО рамо. Мигачът само съобщава намерението ти; проверява погледът — и то преди колелата да се завъртят (чл. 25).",
    },
    {
      n: 4,
      textBg:
        "Волан наляво и съвсем бавно напред. Следи ДВЕ неща едновременно: задния ъгъл на колата отпред, който минава покрай дясната ти броня, и собствената си задница — тя замахва надясно, към бордюра и към колата зад теб.",
    },
    {
      n: 5,
      textBg:
        "Щом задницата е чиста, изправи волана, подравни се в лентата и чак тогава ускори — по алеята се минава с не повече от 12 км/ч. Излизащият от място пропуска всички: колелото или мотористът, който се промъква отляво, не е длъжен да те чака.",
    },
    {
      n: 6,
      textBg:
        "Ако е тъмно, включи късите светлини ПРЕДИ да потеглиш: те не ти показват колоездача отляво, но показват теб на него — а точно той е това, което не се вижда нощем.",
    },
  ],
  success: [
    {
      id: "sc-ppx-room",
      titleBg: "Задача 1: върни назад и си купи място за завоя",
      // The room-buying reverse, graded where the recorded shadow stops
      // (traces/scParkParallelExit.ts BACK_Y = −1.6 — 0.63 m off the rear car's
      // bumper). The radius is deliberately SMALL (1.9 m) for one reason and it
      // is not difficulty: the start pose is 3.2 m away, and the L1 tolerance
      // ladder widens a waypoint by ×1.5, so anything above 2.13 m would put the
      // stationary car inside its own first gate at L1 and hand it the task for
      // free. Asserted per rung in __tests__/lane15-parking-depth.ts.
      params: { kind: "reachZone", x: 6.28, y: -1.6, radiusM: 1.9, maxSpeedKmh: 5 },
    },
    {
      id: "sc-ppx-out",
      titleBg: "Задача 2: излез в лентата и се подравни",
      // Past the front neighbour (its nose is at y = 8.75) and back on the lane
      // line: you are only here if the tail cleared the car behind and the
      // bonnet cleared the car in front. Cap 12 keeps it a manoeuvre rather
      // than a launch; the shadow arrives at ≈ 8 km/h.
      params: { kind: "reachZone", x: 4.2, y: 11, radiusM: 4, maxSpeedKmh: 12 },
    },
  ],
  rubric: {
    // No placement/economy: both read the parkInBay detail channel this drill
    // never produces (the sc-park-bay-exit-rev rule — a component that cannot
    // measure must not pretend to). TWO observation moments, deliberately: the
    // v1 mapper (scenario/observation.ts) scores moment[0] from the window
    // BEFORE the reverse and the last moment from the window at/after its end,
    // which is exactly this manoeuvre's story — look before you back up, look
    // again before you pull out.
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Оглед назад ПРЕДИ включване на задна" },
        { id: "obs-before-moveoff", titleBg: "Огледало и през ляво рамо преди изнасянето в лентата" },
      ],
    },
    parTimeSec: 70,
  },
  shadow: { path: "content/traces/sc-park-parallel-exit/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-park-parallel-exit/mistake-no-room.trace.json" },
      titleBg: "Изнасяне без купено място",
      whatWentWrongBg:
        "Един метър назад „колкото да мръдна“ и веднага волан наляво. Резултатът не е въпрос на умение, а на геометрия: колата се върти около задната си ос, така че носът излиза по дъга, чийто радиус е даден — и от това място тази дъга минава през задния ъгъл на колата отпред. Затова първото движение при излизане от успоредно място е НАЗАД, до почти опрян заден съсед: то не приближава изхода, то създава ъгъла, от който изходът съществува.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-park-parallel-exit/mistake-no-look.trace.json" },
      titleBg: "Ляв мигач без поглед",
      whatWentWrongBg:
        "Тук всичко изглеждаше изрядно: върнато назад за място, ляв мигач подаден навреме — и пак свърши с удар, защото липсваше единственото, което проверява. Мигачът СЪОБЩАВА какво възнамеряваш; той не ти показва нищо. По алеята се промъкваше колоездач и го срещна ъгълът на капака — няколко секунди преди водачът изобщо да можеше да погледне натам, защото при изнасяне под ъгъл предницата влиза в лентата първа, а погледът стига последен. Потеглянето от място е маневра по чл. 25: огледало, после през ЛЯВОТО рамо, и чак тогава колелата. Излизащият пропуска — не обратното.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато си паркирал успоредно на улицата и трябва да си тръгнеш — тоест при всяко успоредно паркиране, защото влизането е избор, а излизането не е. В града това е маневрата, която правиш най-често в компанията на движещи се хора: колоездачи, куриери на скутери и коли, които минават на една ръка от бронята ти.",
    whyBg:
      "Две неща правят излизането по-трудно от влизането, и двете са физика, не смелост. Първото: колата се завърта около задната си ос, затова волан наляво изнася носа наляво и запраща ЗАДНИЦАТА надясно — към бордюра и към колата зад теб. Мястото за този замах се създава само с връщане назад преди маневрата; след като волана е завъртян, вече няма откъде да се вземе. Второто: при изнасяне под ъгъл предният ъгъл на колата влиза в лентата секунди преди водачът да може да види по нея. Точно в тези секунди минава колоездачът. Оттук идва и правната логика — потеглянето от място е маневра (чл. 25) и се извършва, след като водачът се убеди, че няма да попречи на другите: убеждаването е огледало плюс поглед през рамо, в този ред, преди колелата да се завъртят. Мигачът не участва в убеждаването; той само съобщава решението.",
    lawRef: "ЗДвП чл. 25",
    examinerBg:
      "Изпитващият гледа реда, не бързината: връщане назад за място преди завоя, огледало и поглед през лявото рамо ПРЕДИ да тръгне колата, ляв мигач, изнасяне с пешеходна скорост и контрол докъде стига задницата, подравняване в лентата преди ускоряването. Потегляне от място без оглед е основна грешка дори когато нищо не се случи — оценява се убеждаването, а не късметът. Закачането на съседа или бордюра е отделна грешка към него.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    {
      // L5 „Усложнени": the same slot after dark. This is the rung where the
      // drill's second fact bites hardest — the cyclist filtering past on the
      // left is the least visible thing on a city street at night, and the
      // shoulder check is the only instrument that finds him. The lights duty
      // is stated in instruction 6 below (doc 86 L10).
      level: 5,
      conditions: { night: true },
    },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

/** The S2-A parking wave, in catalog order (consumed by the registry line in
 *  templates.ts — one spread, the assembly-line pattern). */
export const PARKING_TEMPLATES: readonly ScenarioSpec[] = [
  SC_PARK_PARALLEL,
  SC_PARK_45,
  SC_PARK_NARROW,
  SC_PARK_PERP_FORWARD,
  SC_PARK_PARALLEL_EXIT,
];
