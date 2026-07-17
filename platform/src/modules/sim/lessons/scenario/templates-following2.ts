/**
 * Scenario templates — the FOLLOWING family, wave 3: the CHAIN-READING slice.
 * Every shipped FO template grades the gap to the ONE car in front
 * (templates-following.ts: FO-01/02/03/04/06/07/08); none of them puts a
 * SECOND car in front of that one, which is where the taught skill actually
 * lives — „гледай през колата пред теб". DATA ONLY, in the templates.ts mold
 * (coordinates denormalized from the committed district file so nothing loads
 * world JSON at runtime; the trace gate asserts every pinned value against the
 * generated map):
 *
 *  - sc-fo-brakelight-chain  „Стоповете два автомобила напред" (FO-05 + FO-01,
 *                            fo-brake-v1 REUSED with a TWO-car chain)
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
    hold: { nodeIndex: 0, offsetM: 34 }, // dormant ~19 m ahead of the spawn — the matchPlayer target
    cruiseSpeedMps: 8,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06) — the middle of the chain,
    // not an adjacent-lane cutter: the "cut" below is a pure speed event (cutShiftM 0)
    colorIndex: 1,
  },
  paceAheadM: 19, // ~19 m of centers ≈ 14.9 m of bumpers: 2.1 s at the shadow's 26 km/h,
  // 1.1 s at the mistake's 48 km/h — the FO-01 lesson, one car further back
  maxMatchSpeedMps: 15, // 54 km/h — holds 19 m at any legal player speed
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
    hold: { nodeIndex: 0, offsetM: 61 }, // dormant ~46 m ahead of the spawn — the matchPlayer target
    cruiseSpeedMps: 11,
    extraRightOffsetM: 0, // the player's OWN lane (northbound, x = 4.06)
    colorIndex: 2,
  },
  followGapM: 46, // ~27 m AHEAD of the middle car — the „две коли напред" sight line
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
    { n: 1, textBg: "Потегли спокойно — пред теб в твоята лента се движи колона от две коли." },
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

/** The wave-3 following templates, in catalog order (registered in templates.ts
 *  by the integration pass). */
export const SCENARIO_TEMPLATES_FOLLOWING2: readonly ScenarioSpec[] = [SC_FO_BRAKELIGHT_CHAIN];
