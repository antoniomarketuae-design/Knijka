/**
 * sc-ed-reverse-line — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for the Наредба-38 exam maneuver „движение назад по права
 * линия" (ED / PK-11 „Заден ход", PK-05 „Потегляне без оглеждане") on the
 * committed poligon-v1 training ground — the FIRST scenario template to drive
 * the полигон (it has shipped with only the legacy L-lesson today).
 *
 * THE SITE — the „Старт-стоп права" (poligon-v1 edge pg-e-s1, the southern
 * straight along y = -130, two-way, limit 30), the western clean stretch between
 * the SW corner joint (x = -170) and the g2 junction (x = -95). The car works
 * the eastbound (south) curb lane, hugging the south curb; nothing else is on the
 * площадка, so the ONLY things the stack can grade are (1) the pre-maneuver оглед
 * on the move-off and (2) any contact with the CURB.
 *
 * WHY THE DRILL OPENS WITH A FORWARD MOVE-OFF (the sc-ed-d2-stop-address HONEST
 * LIMIT 2, applied here). The оглед that ЗДвП чл. 40 demands before backing is
 * the same „look before the wheels turn" the move-off detector grades — but that
 * detector (engine.ts) grades the SESSION'S FIRST move-off and is FORWARD-GEAR
 * ONLY: „whose first motion is a reverse maneuver is never graded (conservative)"
 * — a reverse first move latches nothing (signed speed stays negative, gear −1).
 * So the exam pair „потегляне + заден ход" runs in the order the engine can
 * actually grade: the car pulls away from the curb FORWARD (potegля, observed),
 * settles, and only THEN reverses the 25 m. The observation the drill teaches
 * (and the „без оглед" mistake convicts) is that opening move-off; the reverse
 * itself is graded by the corridor reachZone chain + the curb collision (the
 * maneuver evaluator set has no straight-reverse primitive — the reachZone
 * composition avoids new evaluator work; the sc-ed-d2-stop-address / PK-11 note).
 *
 * The trace gate replays exactly these through the production stack with the
 * move-off drill ENABLED (ruleConfig mirrored from SC_ED_REVERSE_LINE):
 *   - shadow: mirror + shoulder before the pull-away, a short forward move-off,
 *     mirror before reverse, a straight 25 m reverse hugging the curb → ZERO
 *     violations, all three corridor gates met;
 *   - „Качване на бордюра": the pull-away IS observed (so PK-05 cannot ride
 *     along), then the reverse drifts onto the curb → EXACTLY COLLISION;
 *   - „Заден ход без поглед назад": the whole maneuver is begun with NO оглед at
 *     all — the forward move-off convicts → EXACTLY MOVE_OFF_WITHOUT_OBSERVATION;
 *     the reverse itself stays clear of the curb so nothing else attaches.
 *
 * Geometry pinned to content/world/poligon-v1.json (the reverse-districts
 * battery pins the leg). Reverse gear is exempt from the lane/wrong-way detectors
 * (A12), and every forward move stays a short creep well inside the 30 limit, so
 * the ONLY gradeable events are the two the drill is about.
 */

import { SC_ED_REVERSE_LINE } from "../lessons/scenario/templates-exam";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_ED_REVERSE_LINE_ID = "sc-ed-reverse-line";

/** Eastbound (south) curb-lane center on the „Старт-стоп права" (y = -130 edge). */
const Y = -136.4;
/** The pull-away starts here, at rest against the curb. */
const START_X = -132;
/** The observed forward move-off settles here (the maneuver's изходна позиция). */
const FWD_X = -120;
/** The reverse ends 25 m back along the curb (FWD_X − 25). */
const REV_X = -145;
/** Every forward creep of the drill (comfortably over the 5 km/h move-off floor). */
const MOVEOFF_KMH = 9;
/** Walking pace for the reverse (пешеходна скорост). */
const REVERSE_KMH = 5;

/**
 * The south curb of the „Старт-стоп права" — the headless twin of the scene's
 * kerb collider, a long thin rect just south of the curb lane (north edge at
 * y = -137.85). The correct reverse rides ~0.6 m clear of it; a drift onto it is
 * a COLLISION at walking speed (collisionMinKmh 0 — the parking threshold, doc
 * 76 §0 / the sc-maneuver-3point precedent).
 */
export function reverseLineCurbObstacles(): ObstacleRect2D[] {
  return [
    {
      x: -130,
      y: -138.6,
      headingDeg: 90,
      halfWidthM: 0.75,
      halfLengthM: 30,
      withWhat: "staticObject" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — оглед, потегляне, заден ход по бордюра
// ---------------------------------------------------------------------------

export function scEdReverseLineShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Изпитната маневра „движение назад по права линия“. Стоиш до бордюра — но първо огледът: огледало и поглед през ЛЯВОТО рамо, преди колелата да се завъртят.",
      },
      // Both glances inside the detector's 7 s lookback of the pull-away below.
      { kind: "glance", mirror: "rear" },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.4, brake: true },
      {
        kind: "annotation",
        textBg:
          "Потеглянето от място е маневра (чл. 25): излез напред в лентата и заеми изходната позиция за заден ход, плътно вдясно до бордюра.",
      },
      { kind: "drive", points: [[START_X, Y], [-126, Y], [FWD_X, Y]], targetKmh: MOVEOFF_KMH, stopAtEnd: true },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Сега заден ход: включи на задна и се убеди, че пътят ЗАД теб е свободен — поглед през рамо назад, не само в огледалото (чл. 40).",
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[FWD_X, Y], [-133, Y], [REV_X, Y]],
        targetKmh: REVERSE_KMH,
        reverse: true,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Готово: 25 метра назад по права линия, с пешеходна скорост, плътно до бордюра и без нито едно докосване на бордюра.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Качване на бордюра" (tail drifts onto the curb = COLLISION)
//   The pull-away IS observed (glance before it), so PK-05 cannot ride along:
//   the ONLY fault is the curb contact during the reverse. One card, one thing.
// ---------------------------------------------------------------------------

export function scEdReverseLineMistakeCurbScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: заден ход без да следиш докъде стига колата — задницата тръгва към бордюра.",
      },
      // The оглед before the move-off is done right — the fault must not be two.
      { kind: "glance", mirror: "rear" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "drive", points: [[START_X, Y], [-126, Y], [FWD_X, Y]], targetKmh: MOVEOFF_KMH, stopAtEnd: true },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "glance", mirror: "rear" },
      // The reverse drifts SOUTH into the curb rect (north edge at y = -137.85).
      {
        kind: "drive",
        points: [[FWD_X, Y], [-130, -137.0], [-138, -137.7]],
        targetKmh: REVERSE_KMH,
        reverse: true,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Колелото се качи на бордюра. Заден ход се кара с пешеходна скорост, като държиш права линия — очите назад през рамо, ръцете фино на волана.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заден ход без поглед назад" (MOVE_OFF_WITHOUT_OBSERVATION)
//   The whole maneuver is begun with NO оглед at all; the engine convicts on the
//   first gradeable point — the forward move-off (PK-05, чл. 25). On the exam
//   that ends the run before the reverse is even judged. The reverse then stays
//   clear of the curb, so nothing else attaches: one card, one thing to fix.
// ---------------------------------------------------------------------------

export function scEdReverseLineMistakeNoLookScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: маневрата започва без нито един поглед назад — колата просто тръгва.",
      },
      // NO glance anywhere before the wheels turn → the first (forward) move-off
      // grades MOVE_OFF_WITHOUT_OBSERVATION; the reverse below is clean.
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "drive", points: [[START_X, Y], [-126, Y], [FWD_X, Y]], targetKmh: MOVEOFF_KMH, stopAtEnd: true },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "drive",
        points: [[FWD_X, Y], [-133, Y], [REV_X, Y]],
        targetKmh: REVERSE_KMH,
        reverse: true,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Огледът не е формалност: преди да потеглиш И преди да дадеш заден ход трябва да си сигурен, че пътят е свободен. Мигачът съобщава намерение — само погледът показва какво има зад теб.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScEdReverseLineTraceName = "shadow-correct" | "mistake-curb" | "mistake-no-look";

export const SC_ED_REVERSE_LINE_TRACE_NAMES: readonly ScEdReverseLineTraceName[] = [
  "shadow-correct",
  "mistake-curb",
  "mistake-no-look",
];

const SCRIPTS: Record<
  ScEdReverseLineTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scEdReverseLineShadowScript },
  "mistake-curb": { kind: "mistake", script: scEdReverseLineMistakeCurbScript },
  "mistake-no-look": { kind: "mistake", script: scEdReverseLineMistakeNoLookScript },
};

/**
 * Record one of the three drives against a loaded poligon-v1 document — the south
 * curb armed, ambient traffic zero (the harness law), collisionMinKmh 0 so a
 * creep-speed curb touch grades COLLISION, and the move-off-observation drill
 * ENABLED via ruleConfig (mirrored from SC_ED_REVERSE_LINE.ruleConfig so the LIVE
 * lesson grades what the recorder grades). Deterministic: same district → same
 * trace (rule config never touches the serialized trace bytes).
 */
export function recordScEdReverseLineDrive(
  districtRaw: unknown,
  name: ScEdReverseLineTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_ED_REVERSE_LINE_ID,
    kind,
    seed: 7,
    obstacles: reverseLineCurbObstacles(),
    collisionMinKmh: 0,
    ruleConfig: { ...(SC_ED_REVERSE_LINE.ruleConfig ?? {}) },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
