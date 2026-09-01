/**
 * sc-ed-poligon-chain — the authored drives (doc 76 §5/§9): ONE correct shadow
 * that chains the THREE Наредба-38 площадкови маневри as a single graded route +
 * TWO mistake demos, on the committed poligon-v1 training ground (the capstone
 * one rung above sc-ed-reverse-line, which graded ONE maneuver on the same
 * ground).
 *
 * THE CHAIN, in the sequential order the lesson engine advances the objectives:
 *   1. parkInBay      — перпендикулярно паркиране на заден in the EAST band bay
 *                       (>40 m east of p1: the turn-detector's junction rule);
 *   2/3/4. reachZone   — заден ход по права: settle → mid → rest (no straight-
 *                       reverse evaluator primitive — the reverse-line corridor
 *                       mold);
 *   5. threePointTurn — обръщане в три хода in the WEST band (>40 m west of g2),
 *                       the travel direction reversed 180°.
 *
 * WHY THE SWINGS LIVE IN THE END BANDS. runtime/turns.ts emits `turnStarted`
 * (→ TURN_WITHOUT_INDICATOR) only for a >55° swing INSIDE a junction area
 * (≤40 m of an intersection node). poligon-v1's straight has nodes at x=−95/0/95
 * and degree-2 (non-junction) corners at x=±170, so the ~90° reverse-park swing
 * lives east of p1 (x≈143) and the ~180° three-point lives west of g2 (x≈−150),
 * where a swing fires nothing. The straight reverse has no swing and the transit
 * between stations is a straight run (crosses the junctions freely). Every
 * forward maneuver move is a creep ≤4 km/h (< the 5 km/h `moving` floor), so
 * lane/wrong-way never arm; reverse gear is A12-exempt; the ONLY gradeable
 * events are the two the demos are about.
 *
 * WHY IT OPENS WITH A FORWARD MOVE-OFF (the reverse-line HONEST LIMIT 2). The
 * move-off-observation detector grades the SESSION'S FIRST move-off and is
 * FORWARD-GEAR ONLY; a run that reversed first would leave the taught оглед
 * ungraded. So the drive opens with the observed forward APPROACH past the bay
 * — the pull-past every reverse-park needs — and every drive (shadow + both
 * mistakes) glances before that first metre, so MOVE_OFF_WITHOUT_OBSERVATION
 * (enabled via ruleConfig) stays OFF all three sheets: it is not a demonstrated
 * fault here.
 *
 * The trace gate replays exactly these through the production stack with the
 * bay cones ARMED (collisionMinKmh 0) and the move-off drill ENABLED:
 *   - shadow: ZERO violations, all five objectives complete, one clean bay
 *     attempt, the three-point in three movements;
 *   - „Удар в конус по веригата": the observed pull-away, then a too-wide bay
 *     reverse clips a cone → EXACTLY COLLISION;
 *   - „Загасване под напрежение": the observed pull-away, then one stall+restart
 *     at the maneuver → EXACTLY ENGINE_STALLED.
 *
 * Geometry pinned to content/world/poligon-v1.json; the leg is pinned by the
 * poligon-chain-districts battery.
 */

import { SC_ED_POLIGON_CHAIN } from "../lessons/scenario/templates-exam";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_ED_POLIGON_CHAIN_ID = "sc-ed-poligon-chain";

/** South curb lane of the „Старт-стоп права" (the reverse-line baseline). */
const Y = -136.4;
/** Start pose (EAST band), facing WEST — the pull-past opens the drive. */
const START_X = 155;
/** Pull-past setup on the curb lane, just west of the bay. */
const SETUP_X = 138;
/** The perpendicular bay centre (EAST band, >40 m east of p1 x=95). */
const BAY_X = 143;
const BAY_Y = -127;
/** The straight-reverse marks (WEST end / middle / east rest). */
const SR_SETTLE_X = -135;
const SR_END_X = -120;
/** The three-point corridor centre (WEST band, >40 m west of g2 x=−95). */
const TURN_X = -150;
const TURN_Y = -131.5;
/** Every forward maneuver creep, under the 5 km/h `moving` floor. */
const CREEP_KMH = 4;
/** Reverse (заден ход) pace — пешеходна скорост. */
const REVERSE_KMH = 4;
/** Observed opening move-off, comfortably over the 5 km/h floor. */
const MOVEOFF_KMH = 9;
/** Straight transit between stations (proven wrong-way-free both ways). */
const TRANSIT_KMH = 20;

/**
 * The bay cones — the headless twins of the scene's cone colliders, flanking the
 * perpendicular bay's mouth (y ≈ −130) so a clean reverse threads between them
 * and a too-wide one mounts a cone. collisionMinKmh 0: a creep-speed touch grades
 * COLLISION (the parking threshold, the sc-maneuver-3point precedent).
 */
export function poligonChainConeObstacles(): ObstacleRect2D[] {
  return [
    {
      x: 140,
      y: -129,
      headingDeg: 0,
      halfWidthM: 0.4,
      halfLengthM: 0.4,
      withWhat: "staticObject" as const,
    },
    {
      x: 146.5,
      y: -129,
      headingDeg: 0,
      halfWidthM: 0.4,
      halfLengthM: 0.4,
      withWhat: "staticObject" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the whole полигон on one graded route
// ---------------------------------------------------------------------------

export function scEdPoligonChainShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Целият площадков изпит наведнъж — три маневри без прекъсване. Първо огледът: огледало и през ЛЯВОТО рамо, преди колелата да се завъртят.",
      },
      // Both glances inside the move-off detector's 7 s lookback.
      { kind: "glance", mirror: "rear" },
      // One frame-producing beat between them: the recorder carries a SINGLE
      // pending glance sample, so two glance steps drained back to back would
      // land only the last one on the tick stream.
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "glance", mirror: "shoulder" },
      { kind: "pause", sec: 0.4, brake: true },
      {
        kind: "annotation",
        textBg:
          "Първа маневра — перпендикулярно паркиране на заден. Подмини гнездото между конусите и спри изходната позиция.",
      },
      // Observed forward move-off (approach) — the session's first move-off,
      // pulling west PAST the bay to the изходна позиция.
      {
        kind: "drive",
        points: [[START_X, Y], [150, Y], [145, Y], [SETUP_X, Y]],
        targetKmh: MOVEOFF_KMH,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 0.5, brake: true },
      {
        kind: "annotation",
        textBg: "Огледала и през рамо назад — и на заден, до центъра на мястото.",
      },
      { kind: "glance", mirror: "rear" },
      // Reverse-swing into the bay: last segment due north ⇒ nose south,
      // axis-aligned. The target overshoots the centre a touch so the decel
      // undershoot settles the car near the bay centre (well inside centerTolM).
      {
        kind: "drive",
        points: [[SETUP_X, Y], [140, -135.5], [142, -134], [BAY_X, -132], [BAY_X, -128.6], [BAY_X, -126.6]],
        targetKmh: REVERSE_KMH,
        reverse: true,
        stopAtEnd: true,
      },
      // holdSec 1.4 + margin — the parkInBay contract completes at rest.
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Центрирано в мястото. Излез напред и продължи по правата към втората станция.",
      },
      { kind: "glance", mirror: "rear" },
      // Exit the bay forward (nose south), arc to face WEST — kept at x <= 143
      // (>42 m from p1, and clear of the east cone), so the swing is outside
      // every junction area.
      {
        kind: "drive",
        points: [[BAY_X, -126.6], [BAY_X, -131], [142, -134], [140.5, -136], [138.5, -136.6], [137, Y]],
        targetKmh: CREEP_KMH,
        stopAtEnd: false,
      },
      // Straight transit WEST to the reverse station — crosses p1/s0/g2 (no swing).
      {
        kind: "drive",
        points: [[137, Y], [95, Y], [30, Y], [-40, Y], [-100, Y], [SR_SETTLE_X, Y]],
        targetKmh: TRANSIT_KMH,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Втора маневра — заден ход по права линия. Убеди се, че отзад е чисто (чл. 40), и върни назад по права до знака.",
      },
      { kind: "glance", mirror: "rear" },
      // Straight reverse east along the curb line (settle → mid → rest).
      {
        kind: "drive",
        points: [[SR_SETTLE_X, Y], [-130, Y], [-125, Y], [SR_END_X, Y]],
        targetKmh: REVERSE_KMH,
        reverse: true,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Трета маневра — обръщане в три хода. Първо движение: напред-настрани към отсрещната страна на коридора.",
      },
      // Forward creep west to the three-point corridor; the north drift stays at
      // x < −135 (>40 m from g2), so the swing is outside the junction area.
      {
        kind: "drive",
        points: [[SR_END_X, Y], [-128, Y], [SR_SETTLE_X, Y], [-140, -132], [-143, -128], [-144, -127.44]],
        targetKmh: CREEP_KMH,
        stopAtEnd: false,
      },
      // Movement 1 (forward): swing across to the far side of the corridor.
      {
        kind: "drive",
        points: [[-144, -127.44], [-147, -127.9], [-149.5, -129.3], [TURN_X, TURN_Y], [-150.7, -134.5], [-151, -136.5]],
        targetKmh: CREEP_KMH,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "annotation", textBg: "Второ движение: задна предавка, огледай назад и се върни през коридора." },
      { kind: "glance", mirror: "rear" },
      // Movement 2 (reverse): back across, the nose swinging toward east.
      {
        kind: "drive",
        points: [[-151, -136.5], [-150, -133.5], [-150.5, -130], [-152, -128], [-153.5, -127.3]],
        targetKmh: CREEP_KMH,
        reverse: true,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "annotation", textBg: "Трето движение: напред, изправи волана и излез по обратната посока." },
      // Movement 3 (forward): straighten out, facing EAST — the reversed direction.
      {
        kind: "drive",
        points: [[-153.5, -127.3], [-151, -129.5], [-149, -132.5], [-147.5, -134], [-145, -134]],
        targetKmh: CREEP_KMH,
        stopAtEnd: true,
      },
      // holdSec 0.8 + margin — the threePointTurn contract completes at rest.
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Готово: трите площадкови маневри една след друга, на пешеходна скорост, без закачен конус и без загасване.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Удар в конус по веригата" (wide bay reverse = COLLISION)
//   The pull-away IS observed, so PK-05 cannot ride along: the ONLY fault is the
//   cone contact during the first maneuver. One card, one thing.
// ---------------------------------------------------------------------------

export function scEdPoligonChainMistakeConeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: заден ход в мястото с твърде широк замах — задницата тръгва към конуса.",
      },
      // The оглед before the move-off is done right — the fault must not be two.
      { kind: "glance", mirror: "rear" },
      // One frame-producing beat between them: the recorder carries a SINGLE
      // pending glance sample, so two glance steps drained back to back would
      // land only the last one on the tick stream.
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "glance", mirror: "shoulder" },
      { kind: "pause", sec: 0.4, brake: true },
      {
        kind: "drive",
        points: [[START_X, Y], [150, Y], [145, Y], [SETUP_X, Y]],
        targetKmh: MOVEOFF_KMH,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "glance", mirror: "rear" },
      // The reverse swings too far EAST and mounts the cone at (146.5, −129).
      {
        kind: "drive",
        points: [[SETUP_X, Y], [141, -135], [145, -133], [147, -130]],
        targetKmh: REVERSE_KMH,
        reverse: true,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Конусът е закачен. Перпендикулярното паркиране се прави на пешеходна скорост — следиш докъде стига колата и коригираш с волана, не с надежда.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Загасване под напрежение" (one stall+restart = ENGINE_STALLED)
//   The pull-away is observed and the car stays clear of the cones, so the ONLY
//   fault is the single stall at the maneuver. One card, one thing.
// ---------------------------------------------------------------------------

export function scEdPoligonChainMistakeStallScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: под напрежението на изпита съединителят се отпуска рязко на маневрата — двигателят гасне.",
      },
      { kind: "glance", mirror: "rear" },
      // One frame-producing beat between them: the recorder carries a SINGLE
      // pending glance sample, so two glance steps drained back to back would
      // land only the last one on the tick stream.
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "glance", mirror: "shoulder" },
      { kind: "pause", sec: 0.4, brake: true },
      {
        kind: "drive",
        points: [[START_X, Y], [150, Y], [145, Y], [139, Y]],
        targetKmh: MOVEOFF_KMH,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "annotation", textBg: "На изходната позиция кракът отпуска съединителя твърде бързо…" },
      // The stall at the maneuver — one rising edge = one ENGINE_STALLED.
      { kind: "stall", on: true },
      { kind: "pause", sec: 2.0, brake: true },
      { kind: "annotation", textBg: "Двигателят загасна — второстепенна грешка, брои се всяко загасване." },
      // Calm restart (clears the driveline latch).
      { kind: "stall", on: false },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спокоен рестарт по процедурата и продължаваш — но всяко загасване тежи. Маневрите се карат бавно и с фин съединител, не с газ.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScEdPoligonChainTraceName = "shadow-correct" | "mistake-cone" | "mistake-stall";

export const SC_ED_POLIGON_CHAIN_TRACE_NAMES: readonly ScEdPoligonChainTraceName[] = [
  "shadow-correct",
  "mistake-cone",
  "mistake-stall",
];

const SCRIPTS: Record<
  ScEdPoligonChainTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scEdPoligonChainShadowScript },
  "mistake-cone": { kind: "mistake", script: scEdPoligonChainMistakeConeScript },
  "mistake-stall": { kind: "mistake", script: scEdPoligonChainMistakeStallScript },
};

/**
 * Record one of the three drives against a loaded poligon-v1 document — the bay
 * cones armed, ambient traffic zero (the harness law), collisionMinKmh 0 so a
 * creep-speed cone touch grades COLLISION, and the move-off-observation drill
 * ENABLED via ruleConfig (mirrored from SC_ED_POLIGON_CHAIN so the LIVE lesson
 * grades what the recorder grades). Deterministic: same district → same trace.
 */
export function recordScEdPoligonChainDrive(
  districtRaw: unknown,
  name: ScEdPoligonChainTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_ED_POLIGON_CHAIN_ID,
    kind,
    seed: 7,
    obstacles: poligonChainConeObstacles(),
    collisionMinKmh: 0,
    ruleConfig: { ...(SC_ED_POLIGON_CHAIN.ruleConfig ?? {}) },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
