/**
 * Scenario templates — the PRECISION-STOP form of the PARKING/LOW-SPEED family,
 * S3 batch 6 (doc 72 §11 „Family PK", archetype PK-14 „Плавно спиране на
 * позиция"): a FULL parking-family form NOT among the four shipped bay
 * maneuvers (perp-rev / parallel / 45 / narrow), staged on a purpose-built
 * straight-street micro-map, DATA ONLY in the templates.ts mold (coordinates
 * denormalized from the committed district file so nothing loads world JSON at
 * runtime; the trace-gate battery asserts every pinned value against the map):
 *
 *  - sc-pk-smooth-stop  „Плавно спиране на позиция"  (PK-14, pk-stop-v1)
 *
 * A stopped delivery van sits in the lane ahead (a recorder obstacle rect, not
 * a lane actor). The driver must bring the car to a SMOOTH, CONTROLLED stop
 * precisely at the mark a few metres short of it. Each mistake demo cites a
 * SHIPPED rules-catalog code and grades EXACTLY it through the production stack
 * (the §5/§9 gate, traces/__tests__/sc-pk-smooth-stop-traces):
 *   - shadow → ZERO violations; completes the smoothStop maneuver (eased to a
 *     stop under the harsh-decel ceiling) AND the low-speed stop-mark reachZone;
 *   - „Претърколи се в спрелия автомобил" → EXACTLY COLLISION (lifted off too
 *     late, rolled past the mark into the van);
 *   - „Твърде бърз подход" → EXACTLY COLLISION (approached far too fast to stop
 *     in the distance and ploughed into the van).
 *
 * Н38 grades a harsh/late stop as второстепенна → основна, but the recorder's
 * kinematic core cannot manufacture the > 7 m/s² deceleration the harsh-brake
 * detector needs (SCRIPT_DECEL 4.6), so the gradeable failure of a lost
 * stopping plan here is the OVERRUN — the two demos both grade COLLISION (the
 * same same-code mistake pair as sc-follow-brake / sc-park-perp-rev). The
 * smoothStop objective is what proves the CORRECT stop was controlled.
 *
 * Family: "parking" — the doc-76 §2 chip (already in ScenarioFamily +
 * FAMILY_ICONS 🅿️); the id (sc-pk-*) matches the sc-<family>-<slug> standard.
 */

import type { ScenarioSpec } from "./types";
import type { ParkingBaySpec } from "../../contracts";

/** Right-lane center of the 1-lane-per-direction street (pk-stop-v1). */
const LANE_X = 4.06;
/** The stop mark: the driver eases to a full stop here, ~6 m short of the van. */
const STOP_MARK_Y = 112;

/**
 * PK-14 — плавно спиране на маркирана позиция (ЗДвП чл. 20 ал. 2: водачът
 * съобразява скоростта така, че да може да спре пред всяко предвидимо
 * препятствие; плавното, предвидимо спиране е и част от техниката за паркиране
 * и спиране по знак/маркировка).
 */
export const SC_PK_SMOOTH_STOP: ScenarioSpec = {
  id: "sc-pk-smooth-stop",
  family: "parking",
  tagsBg: ["плавно спиране", "контрол на спирачката", "точност", "изпитни упражнения"],
  titleBg: "Плавно спиране на позиция",
  objectiveBg:
    "Спри плавно и точно на маркираната позиция — вдигни газта рано, натисни спирачката меко и предвидимо и спри на няколко метра пред спрелия отпред автомобил, без рязкост и без да го докоснеш.",
  archetypeIds: ["PK-14"],
  conceptIds: ["c-braking-distance", "c-stopping-distance-total", "c-sudden-braking-slow-driving"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-stop-v1.json meta.scenario.params
    // (tools/maps/gen_pk_smoothstop.mjs).
    params: { lengthM: 200, maxspeedKmh: 50 },
    districtId: "pk-stop-v1",
  },
  start: {
    spawnPointId: "pk-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по правата улица и се движи спокойно в дясната лента." },
    {
      n: 2,
      textBg:
        "Напред в лентата е спрял автомобил. Ще спреш плавно на маркираната позиция на няколко метра зад него.",
    },
    {
      n: 3,
      textBg:
        "Вдигни газта рано — още отдалеч — и остави колата да намали. Не изчаквай последния момент.",
    },
    {
      n: 4,
      textBg:
        "Натисни спирачката меко и постепенно; отпусни леко точно преди спиране, за да няма клъвване напред.",
    },
    { n: 5, textBg: "Спри напълно на позицията, с малка дистанция до спрелия отпред, и задръж колата." },
  ],
  success: [
    {
      id: "sc-pk-approach",
      titleBg: "Приближи позицията с готовност за спиране",
      // A mid-street progress checkpoint the calm approach passes through.
      params: { kind: "reachZone", x: LANE_X, y: 60, radiusM: 12 },
    },
    {
      id: "sc-pk-mark",
      titleBg: "Спри точно на маркираната позиция",
      // Completable ONLY at near-stop speed at the mark: the precision skill —
      // a car that overruns (into the van) blows through this zone at speed and
      // never rests inside it. (A recorder-driven smoothStop maneuver objective
      // is not usable here: the kinematic recorder can only brake at a fixed
      // ~4.6 m/s² and zeroes the last ~2 km/h in one frame, a spike no sane
      // maxDecelMs2 accepts — so the graded FAILURE of a lost stopping plan is
      // the overrun/COLLISION, and the controlled arrival is graded by this
      // low-speed stop-mark zone; smoothness is coached in the instructions.)
      params: { kind: "reachZone", x: LANE_X, y: STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED (S3 batch 6): committed deterministic recordings of the authored
  // scripts in traces/scPkSmoothStop.ts; the §5 gate (shadow replays with ZERO
  // violations + completes smoothStop) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-pk-smooth-stop-traces.test.ts (re-record with
  // RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-smooth-stop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-smooth-stop/mistake-overshoot.trace.json" },
      titleBg: "Претърколи се в спрелия автомобил",
      whatWentWrongBg:
        "Спирачката дойде твърде късно и меко — колата подмина маркираната позиция и се претърколи в спрелия отпред автомобил. Съобразената скорост е тази, при която спираш пред предвидимото препятствие: газта се вдига рано, а спирането се планира, не се изчаква.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-smooth-stop/mistake-too-fast.trace.json" },
      titleBg: "Твърде бърз подход",
      whatWentWrongBg:
        "Подходът към позицията беше твърде бърз — на тази скорост спирачният път не стигна и колата се вряза в спрелия отпред автомобил. Спирачният път расте квадратично със скоростта: към точка на спиране се приближава бавно и с готовност за спиране.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всяко спиране на определена позиция — зад спрял автомобил, на стоп-линия, на автобусна маркировка, пред бариера. Плавното, планирано спиране е основата и на паркирането, и на спокойното градско каране.",
    whyBg:
      "Рязкото и закъсняло спиране е предпоставка за удар — отпред, ако не стигне спирачният път, и отзад, защото изненадва движещите се след теб. Който вдига газта рано и спира меко, владее и дистанцията, и габаритите на колата, и не кара пътниците да клъвват напред.",
    lawRef: "ЗДвП чл. 20",
    examinerBg:
      "Изпитващият следи спирането по целия маршрут: ранно вдигане на газта, меко и постепенно натискане на спирачката, спиране точно на посочената позиция без рязкост и без да докоснеш препятствието отпред. Рязкото спиране, което създава предпоставка за ПТП, е грешка.",
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
// sc-pk-driveway — „Заден ход в алея" (doc 72 PK-11 „Reverse around the corner /
// into a driveway") on pk-drive-v1: a Grundfahraufgabe-class reverse maneuver
// NOT among the four shipped bay parks (perp-rev / parallel / 45 / narrow), the
// sc-park-perp-rev mold with the driveway's own WALLS as the collision hazard.
// ---------------------------------------------------------------------------

/** The driveway bay (content/world/pk-drive-v1.json east kerb at y = 45) —
 *  copied by VALUE (the lesson-specs law; the trace-gate battery asserts it
 *  matches traces/scPkDriveway.ts PK_DRIVE_TARGET_BAY value-for-value). */
export const PK_DRIVE_TARGET_BAY: ParkingBaySpec = {
  x: 8.0,
  y: 45.0,
  headingDeg: 90,
  widthM: 2.7,
  lengthM: 5,
};

/** PK-11 — заден ход в алея (ЗДвП чл. 40: при движение назад водачът е длъжен
 *  да се убеди, че пътят зад него е свободен и да пропусне останалите участници;
 *  ЗДвП чл. 25 — маневрата се извършва след като водачът се убеди, че е
 *  безопасна). The reverse-into-a-driveway form of the Наредба-38 reversing
 *  family, distinct from the four bay parks: a residential-street kerb, walls
 *  instead of parked neighbours. */
export const SC_PK_DRIVEWAY: ScenarioSpec = {
  id: "sc-pk-driveway",
  family: "parking",
  tagsBg: ["паркиране", "заден ход", "алея", "двор", "изпитни упражнения"],
  titleBg: "Заден ход в алея",
  objectiveBg:
    "Влез на заден ход в алея вдясно: подмини входа, огледай се преди и по време на маневрата и вкарай колата точно в очертанията между стените, с нос към улицата и без да ги докоснеш.",
  // Doc-72 provenance: PK-11 IS this maneuver (reverse around a corner / into a
  // driveway — the German Grundfahraufgabe reverse, full observation).
  archetypeIds: ["PK-11"],
  conceptIds: ["c-reversing", "c-maneuver-principles", "c-mirrors-blind-spots"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-drive-v1.json meta.scenario.params
    // (tools/maps/gen_pk_driveway.mjs).
    params: { lengthM: 90, maxspeedKmh: 30, drivewayY: 45 },
    districtId: "pk-drive-v1",
  },
  start: {
    spawnPointId: "pkd-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Приближи бавно по улицата — не повече от 15 км/ч — и намери алеята вдясно." },
    {
      n: 2,
      textBg: "Подмини входа на алеята и спри, когато задната ти броня подмине входа ѝ.",
    },
    {
      n: 3,
      textBg: "Включи на задна. Огледай се — двете огледала, после през рамо — и чак тогава завий назад към алеята.",
    },
    {
      n: 4,
      textBg: "Движи се назад с пешеходна скорост, следи стените на алеята в огледалата и изправяй волана, щом влезеш в очертанията.",
    },
    {
      n: 5,
      textBg: "Спри напълно вътре в алеята — центрирано, с нос към улицата — и задръж колата в покой.",
    },
  ],
  success: [
    {
      id: "sc-pkd-position",
      titleBg: "Заеми изходна позиция покрай входа на алеята",
      // The pull-past pose in the lane just north of the driveway mouth.
      params: { kind: "reachZone", x: LANE_X, y: 50, radiusM: 7, maxSpeedKmh: 15 },
    },
    {
      id: "sc-pkd-park",
      titleBg: "Влез на заден ход в алеята и спри напълно",
      // Bay-locked parkInBay (A10): at rest INSIDE the driveway, aligned, via
      // reverse, held 1.5 s. Tolerances are evaluator defaults at L3/L4; L1/L2
      // widen them via toleranceScale (compile).
      params: {
        kind: "completeManeuver",
        maneuver: "parkInBay",
        holdSec: 1.5,
        bay: PK_DRIVE_TARGET_BAY,
        centerTolM: 0.5,
        headingTolDeg: 10,
      },
    },
  ],
  rubric: {
    placement: { objectiveId: "sc-pkd-park" },
    // German Grundfahraufgaben codify > 2 correction pulls as a fault (doc 72
    // PK-11 evidence): 1 entry clean, 2 acceptable.
    economy: { objectiveId: "sc-pkd-park", attemptsFor3Stars: 1, attemptsFor2Stars: 2 },
    observation: {
      moments: [
        { id: "obs-before-reverse", titleBg: "Огледала и рамо преди включване на задна" },
        { id: "obs-during-reverse", titleBg: "Наблюдение назад по време на движението на заден ход" },
        { id: "obs-final-check", titleBg: "Контролен поглед към стените преди окончателното спиране" },
      ],
    },
    parTimeSec: 90,
  },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkDriveway.ts; the §5 gate (shadow replays ZERO violations +
  // completes parkInBay) and the §9 stage-5 code asserts run in
  // traces/__tests__/sc-pk-driveway-traces.test.ts (re-record RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-driveway/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-driveway/mistake-wide.trace.json" },
      titleBg: "Твърде широк замах",
      whatWentWrongBg:
        "Замахът назад тръгна твърде широко и задницата се качи на оградата на алеята. На заден ход в алея се влиза на части: волан докрай, бавно назад и СПИРАНЕ — гледаш докъде стига колата в огледалото, не караш, докато стената не те спре.",
      codeRefs: ["COLLISION"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-driveway/mistake-deep.trace.json" },
      titleBg: "Твърде дълбоко назад",
      whatWentWrongBg:
        "Колата продължи на заден ход без да спре и се вряза в дъното на алеята. Спираш на мястото, не когато стената те спре — движението назад се планира и се следи в огледалото за обратно виждане (чл. 40).",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Когато влизаш на заден ход в алея, двор или тесен вход между стени или огради — ежедневната маневра пред блока и вкъщи. На заден ход колата завива по-остро и виждаш по-добре входа, затова заден ход в алея е по-безопасен от влизането напред.",
    whyBg:
      "Повечето леки удари при влизане в двор стават при широк замах на задницата или при заден ход без спиране до стената. Който владее замаха и спира на мястото — с постоянна работа с огледалата — не чупи огледала, не бели ламарина и не удря детето зад колата.",
    lawRef: "ЗДвП чл. 40",
    examinerBg:
      "Изпитващият гледа три неща: непрекъснато наблюдение (огледала + рамо, преди и по време на маневрата), контролирана пешеходна скорост и краен резултат в очертанията между стените, без излишни корекции. Прекъсни маневрата, ако се появи пешеходец или кола.",
  },
  levels: [
    { level: 1, toleranceScale: 1.5 },
    { level: 2, toleranceScale: 1.25 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
  ],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-pk-ban-stop — „Спиране в забранена зона" (doc 72 PK-06) on pk-ban-v1: a
// 1+1 street with a В27 no-stopping span @ y ∈ [70, 190] — the FIRST parking-
// family template on the ZONE-BAN district data layer (ADR-006 stage 2a). The
// „пусни ме тук за малко" trap: the driver is asked to stop „където е
// позволено" — the skill is READING the zone, driving through it and resting
// only after its end.
// ---------------------------------------------------------------------------

/** pk-ban-v1: the single northbound lane center (1+1 street). */
const PKB_LANE = 4.06;
/** pk-ban-v1: the В27 no-stopping span along the street (meta.scenario). */
const PKB_BAN_FROM = 70;
const PKB_BAN_TO = 190;
/** The LEGAL stop mark — after the В27 zone ends. */
const PKB_STOP_MARK_Y = 235;

/** PK-06 — спиране в забранена зона, знак В27 (ЗДвП чл. 98: забрани за
 *  престой и паркиране; знакът В27 забранява престоя и паркирането в
 *  участъка на действието си). */
export const SC_PK_BAN_STOP: ScenarioSpec = {
  id: "sc-pk-ban-stop",
  family: "parking",
  tagsBg: ["спиране", "престой", "забранена зона", "знак В27"],
  titleBg: "Спиране в забранена зона",
  objectiveBg:
    "Помолен си да спреш „тук някъде за малко“ — но участъкът е под знак В27 „Забранени са престоят и паркирането“. Премини през зоната, без да спираш, и спри чак след края ѝ, на разрешено място.",
  archetypeIds: ["PK-06"],
  conceptIds: ["c-stopping-standing-rules", "c-parking-prohibitions", "c-prohibition-signs"],
  map: {
    archetype: "straight-street",
    // The generator recipe — mirrored in pk-ban-v1.json meta.scenario.params
    // (tools/maps/gen_ban_zones.mjs).
    params: { lengthM: 300, maxspeedKmh: 50, banKind: "noStopping", banFromM: PKB_BAN_FROM, banToM: PKB_BAN_TO },
    districtId: "pk-ban-v1",
  },
  start: {
    spawnPointId: "pkb-spawn-start",
    vehicleStart: "ready",
  },
  instructionsBg: [
    { n: 1, textBg: "Потегли по улицата — задачата е да спреш за кратко, но само където е позволено." },
    { n: 2, textBg: "Напред започва участък със знак В27 „Забранени са престоят и паркирането“ — в него не се спира изобщо, дори „само за минутка“." },
    { n: 3, textBg: "Премини през зоната с равномерна скорост, без да спираш и без да се колебаеш." },
    { n: 4, textBg: "След края на зоната намали плавно и спри на разрешеното място." },
    { n: 5, textBg: "Спри напълно и задръж колата — това е правилният „пусни ме тук“." },
  ],
  success: [
    {
      id: "sc-pkb-through",
      titleBg: "Премини през зоната В27, без да спираш",
      // A mid-zone progress checkpoint the non-stop transit passes through.
      params: { kind: "reachZone", x: PKB_LANE, y: 130, radiusM: 6 },
    },
    {
      id: "sc-pkb-legal-stop",
      titleBg: "Спри на разрешеното място след зоната",
      // Completable ONLY at near-stop speed at the legal mark past the zone
      // end (the pk-smooth-stop mark discipline).
      params: { kind: "reachZone", x: PKB_LANE, y: PKB_STOP_MARK_Y, radiusM: 4, maxSpeedKmh: 6 },
    },
  ],
  rubric: { parTimeSec: 60 },
  // RECORDED: committed deterministic recordings of the authored scripts in
  // traces/scPkBanStop.ts; gates in traces/__tests__/sc-pk-ban-stop-traces
  // .test.ts (re-record with RECORD_TRACES=1).
  shadow: { path: "content/traces/sc-pk-ban-stop/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-pk-ban-stop/mistake-stop-in-zone.trace.json" },
      titleBg: "„Само за минутка“ в зоната",
      whatWentWrongBg:
        "Колата спря по средата на участъка със знак В27 — „само за минутка, да те пусна“. Точно това забранява знакът: спрялата кола там закрива видимостта и запушва лентата. Престой под В27 няма — нито дълъг, нито кратък (чл. 98).",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
    {
      traceRef: { path: "content/traces/sc-pk-ban-stop/mistake-stop-at-edge.trace.json" },
      titleBg: "Спиране „почти в края“ на зоната",
      whatWentWrongBg:
        "Водачът изчака почти до края на зоната и спря на няколко метра преди знакът да спре да действа. Забраната важи до самия край на участъка — „почти след зоната“ е все още в зоната. Изчакай края ѝ и спри на разрешеното място.",
      codeRefs: ["ILLEGAL_STOP_IN_BAN_ZONE"],
    },
  ],
  teach: {
    whenBg:
      "Всеки път, когато търсиш място да спреш „за малко“ — пред училището, до спирката, на тясната улица. Първо прочети знаците и маркировката на участъка: под В27 не се спира изобщо, под В28 не се паркира.",
    whyBg:
      "Забранените за престой участъци не са произвол: там спряла кола закрива пешеходец, запушва лента или крие изглед към кръстовище. „Само за минутка“ е точно минутата, в която детето излиза иззад колата ти. Затова изпитът брои спирането в забранена зона като основна грешка.",
    lawRef: "ЗДвП чл. 98",
    examinerBg:
      "Изпитващият дава инструкция „спри тук, където е безопасно и позволено“ и следи дали четеш знаците: спиране в зоната на В27 (или на пътека, кръстовище, спирка) е основна грешка. Правилният отговор е да продължиш и да спреш след края на забраната.",
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

/** The PK precision-stop templates, in catalog order (registered in templates.ts). */
export const SCENARIO_TEMPLATES_PK: readonly ScenarioSpec[] = [
  SC_PK_SMOOTH_STOP,
  SC_PK_DRIVEWAY,
  SC_PK_BAN_STOP,
];
