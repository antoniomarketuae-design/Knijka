/**
 * Scenario templates — the FOLLOWING family, wave 3: the CHAIN-READING slice,
 * plus the wave-8 MOTORWAY-SPEED slice. Every shipped city FO template grades
 * the gap to the car in front at urban speed (templates-following.ts:
 * FO-01/02/03/04/06/07/08); this file adds the reads the city drills cannot —
 * the two-car chain, and the SAME чл. 23 rule at 130 km/h where the метри and
 * the closure rate change everything. DATA ONLY, in the templates.ts mold
 * (coordinates denormalized from the committed district file so nothing loads
 * world JSON at runtime; the trace gate asserts every pinned value against the
 * generated map):
 *
 *  - sc-fo-brakelight-chain  „Стоповете два автомобила напред" (FO-05 + FO-01,
 *                            fo-brake-v1 REUSED with a TWO-car chain)
 *  - sc-fo-motorway-gap      „Дистанция при 130" (FO-01 + SP-10, mw-v1 REUSED —
 *                            the following rule in the SPEED domain)
 *
 * Family: "following" — the existing catalog chip (doc 76 §2).
 */

import type { BrakingLeadCarSpec, CutInLeadCarSpec } from "../../contracts";
import type { ScenarioSpec } from "./types";

// ---------------------------------------------------------------------------
// Shared geometry constants (pinned from the generated district by value — the
// L7 pattern; the trace gate asserts the copies match fo-brake-v1)
// ---------------------------------------------------------------------------

/** Northbound right-lane center of fo-brake-v1 (1+1 straight street). */
const LANE_X = 4.06;

/**
 * FO-05 „движение в колона" — the queue-harmonics archetype, graded through the
 * SHIPPED FO-01 gap channel.
 *
 * THE CHAIN IS THE LESSON. Two staged cars run AHEAD of the player in the same
 * lane on the reused fo-brake-v1 straight (420 m, limit 50, lane x = 4.06):
 *
 *   player ──19 m──► sc-fbc-mid (the middle slot) ──~27 m──► sc-fbc-head
 *
 * and the HEAD is the one that brake-slams. The player never touches the head —
 * it is the STIMULUS, seen only as brake lights through/over the middle car. The
 * middle car is what the gap detector actually reads (the runtime's leadGap
 * query takes the NEAREST vehicle in the lead corridor — traffic/system.ts
 * leadGapFor), so every graded surface here is the player's own gap and their
 * own reaction to a warning that arrives one car early.
 *
 * HONEST LIMITS, stated so the numbers below read as deliberate:
 *  - Both cars are matchPlayer-paced, i.e. PINNED to the player's own progress.
 *    A real chain concertinas; this one does not. That is exactly the FO-01
 *    mold (a pinned metric gap, SPEED as the only variable) and it is what
 *    makes the drill deterministic: the shadow's 2.1 s and the mistake's 1.1 s
 *    are the SAME metres at different speeds.
 *  - The middle car's „reaction" is the cutInLeadCar CUT with cutShiftM 0: no
 *    lateral movement at all, just the mode flip matchPlayer → plain cruise at
 *    a crawl. That models the one thing that matters — the middle car finally
 *    seeing what the player should have seen 12 m earlier — and it is gated on
 *    minCutSpeedKmh, so it fires ONLY for a player who never lifted. A driver
 *    who read the head's lights is already too slow to trigger it, which is why
 *    the shadow never sees the cut at all.
 *  - HARSH_BRAKING_NO_CAUSE is deliberately NOT a demo here. A lead inside 45 m
 *    IS a forward cause in the harsh-brake ledger (rules/engine.ts), so a panic
 *    stop behind the chain honestly must not grade — the sc-follow-cutin
 *    precedent verbatim. The gate proves that fact with a probe drive instead.
 */
const FBC_MID: CutInLeadCarSpec = {
  id: "sc-fbc-mid",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 41 }, // dormant ~26 m ahead of the spawn — the matchPlayer target
    // (the HOLD has to track paceAheadM or the band spends the first seconds
    // closing a 19 m handover gap toward 26 — measured, that dip put the shadow
    // at 12.99 m of bumpers, i.e. 1.81 s, which is the T18 defect all over again)
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06) — the middle of the chain,
    // not an adjacent-lane cutter: the "cut" below is a pure speed event (cutShiftM 0)
    colorIndex: 1,
  },
  // LEDGER T18 (doc 86 §2): this was 19 m of centres ≈ 14.9 m of bumpers, i.e.
  // FOLLOWING_TOO_CLOSE above 42.6 km/h on a street posted 50 whose finish leg
  // carries no speed cap at all. Measured through the recorder, the shadow held
  // 1.81 s and the „bumper stare" demo 1.07 s against a 1.26 s fire line — the
  // shadow and the convicted demo were riding the SAME frozen 13.0 m, separated
  // only by the speedometer. That is founder item 48 in one number. 26 m of
  // centres = 20.9 m of bumpers at the seeded worst case moves the threshold to
  // 59.7 km/h, above the posted 50, so only a driver who CLOSES is billed.
  //
  // The chain deliberately keeps `matchPlayer` (contrast sc-follow-distance):
  // the drill's stimulus is a brake-slam two cars ahead arriving at a scripted
  // moment, so the queue has to hold its shape relative to the player or the
  // whole „stoppove dva avtomobila napred" choreography dissolves. T17's
  // scheduled cruise is for drills that grade a GAP; this one grades a LOOK.
  paceAheadM: 26, // ~26 m of centers ≈ 20.9 m of bumpers: 2.9 s at the shadow's 26 km/h
  maxMatchSpeedMps: 15, // 54 km/h — holds 26 m at any legal player speed
  cutAt: { x: LANE_X, y: 244 }, // the middle car's OWN reaction point: it reaches y = 244 when the
  // player is at ~225, i.e. ~12 m (~1 s at 40 km/h) AFTER the head's brake lights lit at player ~212
  cutRadiusM: 3,
  minCutSpeedKmh: 33, // …but ONLY for a player still at speed. The shadow (26 km/h, already lifting)
  // never reaches this — its reward for reading the chain is that the middle car's panic never happens
  cutShiftM: 0, // NO lateral movement — the chain stays in lane; the cut is the mode flip alone
  cutRampSec: 1.5,
  cutSpeedMps: 1, // the middle car stands on it: a crawl ≈ a stop — the concertina the player caused
  clearAheadM: 60,
};

/**
 * The HEAD of the chain — two cars ahead, matchPlayer-pinned ~46 m out (~27 m
 * beyond the middle car: visible over/through it, never reachable past it). It
 * brake-slams when it reaches y = 258, i.e. with the player at ~212 and still
 * at cruise (minSlamSpeedKmh 20 clears every authored approach). Its slam is
 * the ONLY stimulus in the drill; the player's own lane stays physically clear
 * the whole way, so nothing the player does can rear-end it — the encounter
 * resolves "stoppedInTime" the moment the player comes to rest behind the
 * chain, and after resumeAfterSec the head drives on and the queue rolls.
 */
const FBC_HEAD: BrakingLeadCarSpec = {
  id: "sc-fbc-head",
  kind: "brakingLeadCar",
  actor: {
    pathNodes: ["fo-n-start", "fo-n-end"],
    hold: { nodeIndex: 0, offsetM: 68 }, // dormant ~53 m ahead of the spawn — the matchPlayer target
    cruiseSpeedMps: 11,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  // Tracks the middle car's T18 move (19 → 26) so the chain's own spacing is
  // unchanged at ~27 m — the „две коли напред" sight line is the whole drill.
  followGapM: 53, // ~27 m AHEAD of the middle car — the „две коли напред" sight line
  maxMatchSpeedMps: 15,
  slamAt: { x: LANE_X, y: 258 }, // the staged brake-slam, mid-street (player at ~212)
  slamRadiusM: 3,
  slamDecelMps2: 6.5, // a hard emergency slam — the brake lights the whole drill hangs on
  minSlamSpeedKmh: 20, // every authored approach (26/38/48 km/h) clears it — the slam always fires
  proximityFallbackM: 0.5,
  triggersHazard: false,
  resumeAfterSec: 3,
};

/** FO-05/FO-01 — четене на колоната напред (ЗДвП чл. 23: достатъчната дистанция
 *  е тази, която ти дава време да спреш — а времето започва да тече от
 *  стоповете НАПРЕД в колоната, не от бронята пред теб). */
export const SC_FO_BRAKELIGHT_CHAIN: ScenarioSpec = {
  id: "sc-fo-brakelight-chain",
  family: "following",
  tagsBg: ["дистанция", "движение в колона", "стопове", "наблюдение", "градско каране"],
  titleBg: "Стоповете два автомобила напред",
  objectiveBg:
    "Гледай ПРЕЗ колата пред теб: светнат ли стопове по-напред в колоната, вдигни крака от газта преди твоят преден да е спрял. Дистанцията ти дава метрите, а погледът напред ти дава секундите.",
  archetypeIds: ["FO-05", "FO-01"],
  conceptIds: ["c-following-distance", "c-reaction-time", "c-stopping-distance-total", "c-safety-space"],
  map: {
    archetype: "straight-street",
    // Reuses the committed fo-brake-v1 map — its meta.scenario.params, here for provenance.
    params: { lengthM: 420, maxspeedKmh: 50 },
    districtId: "fo-brake-v1",
  },
  start: {
    spawnPointId: "fo-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung is a wet column and HEADLIGHTS_OFF_IN_RAIN grades
    // with no config gate (ЗДвП чл. 70).
    { n: 1, textBg: "Потегли спокойно — пред теб в твоята лента се движи колона от две коли. Вали ли, първо късите светлини (чл. 70): в колона под дъжд стоповете и габаритите напред са цялата информация, която имаш — и твоите са цялата, която има човекът зад теб." },
    { n: 2, textBg: "Не залепвай поглед в бронята на предния. Гледай през стъклата му и покрай него — стоповете на ПЪРВАТА кола са твоето предупреждение." },
    { n: 3, textBg: "Дръж поне 2 секунди дистанция: на спокойна скорост това са около петнайсет метра — метрите, в които ще спреш." },
    { n: 4, textBg: "Светнат ли стопове по-напред в колоната, вдигни крака от газта ВЕДНАГА — още преди твоят преден да е реагирал." },
    { n: 5, textBg: "Спри плавно зад колоната и изчакай — щом тя потегли, продължи със същата дистанция до края на отсечката." },
  ],
  success: [
    {
      id: "sc-fbc-read",
      titleBg: "Следвай колоната на съобразена дистанция",
      // Cap 32 km/h keeps the calm chain-reading posture; the gap grading itself
      // is the rule engine's job (FOLLOWING_TOO_CLOSE against the middle car).
      params: { kind: "reachZone", x: LANE_X, y: 150, radiusM: 12, maxSpeedKmh: 32 },
    },
    {
      id: "sc-fbc-stop",
      titleBg: "Спри зад колоната, без да я удариш",
      // The shadow lifts on the HEAD's brake lights (player ~212) and rolls to
      // rest well short of the stopped chain; the low speed cap makes reaching
      // this AT REST the drill.
      params: { kind: "reachZone", x: LANE_X, y: 222, radiusM: 14, maxSpeedKmh: 6 },
    },
    {
      id: "sc-fbc-finish",
      titleBg: "Продължи с колоната до края на отсечката",
      params: { kind: "reachZone", x: LANE_X, y: 370, radiusM: 14 },
    },
  ],
  // The shadow runs the whole chain — approach, stop, queue restart, finish —
  // in ~62 s; par leaves room for a student who reads the lights a beat later.
  rubric: { parTimeSec: 85 },
  shadow: { path: "content/traces/sc-fo-brakelight-chain/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-fo-brakelight-chain/mistake-bumper-stare.trace.json" },
      titleBg: "Гледане само в бронята отпред",
      whatWentWrongBg:
        "Колата се движеше на 48 км/ч на около петнайсет метра зад средната — под секунда и половина дистанция, с поглед, залепен в бронята ѝ. Стоповете на първата кола светнаха и не значеха нищо: предупреждението дойде цяла кола по-рано, а водачът го гледаше отзад. Останаха му само чуждите стопове и паническата спирачка. Несъобразената дистанция е основна грешка — а тя започва с погледа, не с крака.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-fo-brakelight-chain/mistake-late-brake.trace.json" },
      titleBg: "Късно пълно спиране до сблъсък",
      whatWentWrongBg:
        "Дистанцията беше приемлива, но погледът не стигаше по-далеч от предната кола. Първата кола в колоната спря, средната се закова, а водачът разбра за това едва от нейните стопове — секунда по-късно и петнайсет метра по-близо. Пълната спирачка дойде, когато вече нямаше метри: удар отзад. Гледаш ли през колоната, спираш с крак; гледаш ли в бронята, спираш с бронята.",
      codeRefs: ["COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "Във всяка колона — на булевард, в тапа, на светофар, извън града зад бавен камион. Колкото по-плътна е колоната, толкова по-рано трябва да дойде информацията, а тя винаги идва отпред.",
    whyBg:
      "Верижните удари се раждат от една и съща грешка: всеки гледа само бронята пред себе си, затова всеки научава за спирането с половин секунда закъснение спрямо предния. Половин секунда на всяка кола се натрупва — четвъртата в колоната няма никакъв шанс. Погледът през и покрай предния ти връща тази половин секунда: виждаш стоповете два автомобила напред и вдигаш газта, докато твоят преден още не е реагирал. Дистанцията ти дава метрите, погледът — секундите; трябват ти и двете.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият вижда четенето на колоната по плавността ти: ранното вдигане на газта при чужди стопове напред е точно поведението, което очаква. Движение на несъобразена дистанция в колона е основна грешка, а удар в предната кола е ПТП — незабавно прекратяване на изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    { level: 5, conditions: { weather: "rain" } }, // L5: мокра колона — the same chain, longer stopping
  ],
  staged: [FBC_MID, FBC_HEAD],
  conditions: { weather: "dry" },
  localeBg: "bg-BG",
};

// ---------------------------------------------------------------------------
// sc-fo-motorway-gap — „Дистанция при 130" (FO-01 + SP-10) on mw-v1 REUSED:
// the SAME чл. 23 following rule the city drills teach, moved into the SPEED
// domain. At 130 km/h the two-second gap is 72 m, not 15, and the closure rate
// behind a braking lead is lethal — same detector, a different world.
// ---------------------------------------------------------------------------

/** mw-v1 northbound cruise-lane center (meta.scenario.laneCruiseX — the L7 copy
 *  truth; sc-mw-discipline pins the same value). */
const MW_X_CRUISE = 0;

/**
 * THE LEAD is a single lead car in the player's OWN cruise lane, doing motorway
 * flow. It is modelled with the cutInLeadCar recipe used PURELY as an in-lane
 * decelerating lead (cutShiftM 0 — no lateral cut, the sc-fbc-mid precedent):
 * the brakingLeadCar runner is the natural fit but it does not forward the
 * actor's extraRightOffsetM (every OTHER runner does — see the file note),
 * which this template needs to shift the mw-e-nb path off the EMERGENCY lane
 * (its default resolution, x = 8.13) into the CRUISE lane (x = 0). The
 * cutInLeadCar runner forwards the offset AND slows via a gentle cruise-decel
 * (~4.5 m/s²) — exactly the firm-but-survivable motorway brake this drill wants.
 *
 * The design that makes ONE staged car teach BOTH the safe gap and the tailgate:
 *   paceAheadM 76 (leadGap ~72 m ≈ 2.1 s at flow) is the gap the lead PREFERS,
 *   and maxMatchSpeedMps 34 (~122 km/h flow) is barely above the lead's own
 *   cruise — so a disciplined player who settles at flow is simply held at 76 m
 *   (the shadow), while a tailgater who RACES into the gap (a burst under the
 *   150 km/h dangerous-speed line) finds the lead has no headroom to escape and
 *   sits on ~38 m / ~14 m of held gap (the mistakes). The pin works FOR the
 *   disciplined driver and AGAINST the impatient one — exactly the road.
 *
 * At y = 720 the lead brakes firmly to a stop (cruise 0, ~4.5 m/s²): the shadow,
 * 72 m back, absorbs it and stops with a big margin; the bumper-rider, ~14 m
 * back, cannot (COLLISION). The 1-second demo ends BEFORE the brake — its fault
 * is the gap, nothing else.
 */
const FMG_LEAD: CutInLeadCarSpec = {
  id: "sc-fmg-lead",
  kind: "cutInLeadCar",
  actor: {
    pathNodes: ["mw-n-nb-start", "mw-n-nb-end"],
    hold: { nodeIndex: 0, offsetM: 91 }, // ~76 m ahead of the spawn (y = 15) — the pinned 2-second gap
    cruiseSpeedMps: 30, // 108 km/h — the pre-arm hold cruise (matchPlayer overrides once armed)
    // The mw-e-nb node pair resolves to the EMERGENCY lane (x = 8.13); shift the
    // whole path -8.13 m into the CRUISE lane (x = 0) where the player drives.
    extraRightOffsetM: -8.13,
    colorIndex: 2,
  },
  paceAheadM: 76, // ~76 m of centers (leadGap ~72 m): ~2.1 s at flow — the taught gap
  maxMatchSpeedMps: 34, // ~122 km/h — holds 76 m at flow; a tailgater who races in finds no escape headroom
  cutAt: { x: MW_X_CRUISE, y: 720 }, // the staged firm brake, mid-segment
  cutRadiusM: 3,
  minCutSpeedKmh: 60, // the shadow and the collision demo are >100 km/h here; the 1-s demo ends earlier
  cutShiftM: 0, // NO lateral cut — a pure in-lane speed event (the sc-fbc-mid precedent)
  cutRampSec: 1.2,
  cutSpeedMps: 0, // brake to a stop at the staged point (gentle ~4.5 m/s² cruise-decel)
  clearAheadM: 150, // keep the encounter live to the finish (no early resolution)
};

/** FO-01/SP-10 — дистанция на магистрала (ЗДвП чл. 23: достатъчна е дистанцията,
 *  която ти дава време да спреш — а при 130 км/ч това време струва 72 метра, не
 *  15; същото правило, друг мащаб). */
export const SC_FO_MOTORWAY_GAP: ScenarioSpec = {
  id: "sc-fo-motorway-gap",
  family: "following",
  tagsBg: ["дистанция", "магистрала", "скорост на потока", "спирачен път", "следване"],
  titleBg: "Дистанция при 130",
  objectiveBg:
    "При 130 км/ч двете секунди са 72 метра — дръж ги и виж защо „плътно зад бързия“ на магистрала е самоубийствен навик: при тази скорост спирачният път и скоростта на сближаване не прощават.",
  archetypeIds: ["FO-01", "SP-10"],
  conceptIds: ["c-following-distance", "c-reaction-time", "c-stopping-distance-total", "c-motorway-rules"],
  map: {
    archetype: "motorway-segment",
    // The generator recipe — mirrored in mw-v1.json meta.scenario.params.
    params: { lengthM: 1000, maxspeedKmh: 140, lanesPerDirection: 2, medianM: 6 },
    districtId: "mw-v1",
  },
  start: {
    spawnPointId: "mw-spawn-approach",
    vehicleStart: "ready",
  },
  instructionsBg: [
    // Ledger L10: the L5 rung is a wet motorway (rain + wetGrip) and the
    // rain-lights fault is unconditional (ЗДвП чл. 70).
    { n: 1, textBg: "Магистрала, ограничение 140 — установи се в дясната лента за движение зад колата пред теб, със скоростта на потока. Вали ли, включи късите светлини преди да ускориш (чл. 70): при 130 км/ч влизаш в чуждия воден облак за части от секундата и те виждат само по светлините ти." },
    { n: 2, textBg: "На 130 км/ч изминаваш 36 метра всяка секунда: правилото за 2 секунди тук значи цели 72 метра дистанция." },
    { n: 3, textBg: "Избери си ориентир (табела, стълб): предният го подмине — брой „двадесет и едно, двадесет и две“. Стигнеш ли го преди „две“, изостани." },
    { n: 4, textBg: "Не залепвай зад по-бързия „да те тегли“: при тази скорост, светне ли стоп отпред, метрите свършват за части от секундата." },
    { n: 5, textBg: "Светне ли стоп на предния — не рязко в паника, а плавно и право: голямата дистанция е това, което ти купува спокойното спиране." },
  ],
  success: [
    {
      id: "sc-fmg-gap",
      titleBg: "Дръж 2-секундната дистанция със скоростта на потока",
      // maxSpeedKmh 140: the whole point is holding flow speed AND the gap — the
      // gap grading is the rule engine's job (FOLLOWING_TOO_CLOSE against the lead).
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 400, radiusM: 8, maxSpeedKmh: 140 },
    },
    {
      id: "sc-fmg-stop",
      titleBg: "Спри зад спирачещия, без да го удариш",
      // The shadow absorbs the firm brake and rolls to rest with a big margin
      // (~46 m); the low speed cap makes reaching this AT REST the drill.
      params: { kind: "reachZone", x: MW_X_CRUISE, y: 790, radiusM: 18, maxSpeedKmh: 8 },
    },
  ],
  rubric: { parTimeSec: 60 },
  shadow: { path: "content/traces/sc-fo-motorway-gap/shadow-correct.trace.json" },
  mistakes: [
    {
      traceRef: { path: "content/traces/sc-fo-motorway-gap/mistake-one-second.trace.json" },
      titleBg: "Една секунда зад водещия при 130",
      whatWentWrongBg:
        "Колата се залепи на около 40 метра зад водещия при 130 км/ч — една секунда дистанция там, където трябват две. На тази скорост изминаваш 36 метра за секунда: 40 метра са по-малко от времето, нужно дори само за да реагираш. Несъобразената дистанция е основна грешка, а на магистрала е и най-честата причина за верижни удари.",
      codeRefs: ["FOLLOWING_TOO_CLOSE"],
    },
    {
      traceRef: { path: "content/traces/sc-fo-motorway-gap/mistake-bumper-crash.trace.json" },
      titleBg: "Каране на бронята и закъсняла реакция",
      whatWentWrongBg:
        "Колата се движеше почти на бронята на водещия при 130 км/ч. Когато той спря, метрите вече ги нямаше — реакцията дойде късно, а от 130 спирачният път е над сто метра. Удар отзад на магистрала при тази скорост е сред най-тежките ПТП. Дистанцията не е учтивост към предния — тя е единственото време, което имаш за себе си.",
      codeRefs: ["FOLLOWING_TOO_CLOSE", "COLLISION"],
    },
  ],
  teach: {
    whenBg:
      "При всяко движение по автомагистрала и скоростен път зад друга кола. Колкото по-висока е скоростта, толкова по-голяма е дистанцията в МЕТРИ за същите две секунди — а на 130 това са над 70 метра.",
    whyBg:
      "Дистанцията е време, преведено в метри. При 130 км/ч изминаваш 36 метра всяка секунда, а спирачният път от тази скорост е над сто метра — двете секунди се превръщат в над 70 метра само за да имаш време да реагираш и да спреш. „Плътно зад бързия“ спестява секунди, но при първия светнал стоп отпред няма метри за спиране: точно така се раждат верижните удари на магистрала. Дистанцията се купува предварително — когато вече ти трябва, е късно да я създадеш.",
    lawRef: "ЗДвП чл. 23",
    examinerBg:
      "Изпитващият очаква съобразена със скоростта дистанция: на магистрала — осезаемо по-голяма, отколкото в града. Движение на несъобразена дистанция е основна грешка, а удар в предната кола е ПТП — незабавно прекратяване на изпита.",
  },
  levels: [
    { level: 1 },
    { level: 2 },
    { level: 3 },
    { level: 4, vehicleStart: "cold" },
    // L5: мокра магистрала — rain + real reduced grip; the wet-gap detector
    // (armed template-wide via ruleConfig) only bites once it actually rains,
    // so L1–L4 stay dry-tuned and only THIS rung grades the wet-prudent gap.
    { level: 5, conditions: { weather: "rain" }, physics: { wetGrip: true } },
  ],
  staged: [FMG_LEAD],
  conditions: { weather: "dry" },
  // The rain-aware following detector is default-OFF (the exam bot never widens
  // its time-gap in rain); this drill opts it in so the LIVE session grades a
  // student who keeps a dry-habit gap on the wet L5 rung. Harmless on the dry
  // rungs — the detector guards `raining`, which is true only at L5.
  ruleConfig: { followRainAwareEnabled: true },
  localeBg: "bg-BG",
};

/** The following templates, in catalog order (registered in templates.ts
 *  by the integration pass). */
export const SCENARIO_TEMPLATES_FOLLOWING2: readonly ScenarioSpec[] = [
  SC_FO_BRAKELIGHT_CHAIN,
  SC_FO_MOTORWAY_GAP,
];
