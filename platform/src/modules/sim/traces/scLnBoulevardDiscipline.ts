/**
 * sc-ln-boulevard-discipline — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Лентова дисциплина на булеварда" (OV-11 ×
 * OV-02 × OV-12) on the committed wb-boulevard-v1 district, recorded with the
 * template's OWN staged crawler (single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + TWO SAFE_LANE_CHANGE commendations (out and
 *     back — the arc this whole template exists for);
 *   - „Постоянно каране в лявата лента": a BY-THE-BOOK move into laneId 1 that
 *     never comes home grades EXACTLY NOT_KEEPING_RIGHT;
 *   - „Лутане между лентите без мигач": three glanced-but-unsignalled crossings
 *     plus a long straddle of the lane boundary grade EXACTLY
 *     LANE_CHANGE_WITHOUT_INDICATOR + POOR_LANE_KEEPING.
 *
 * Geometry pinned to content/world/wb-boulevard-v1.json: a 2+2 straight
 * boulevard on y ∈ [0, 200], RIGHT-lane center x = 12.19, LEFT-lane center
 * x = 4.06 (lane boundary x = 8.125), spawn wb-spawn-approach (12.19, 15)
 * heading north, limit 40 km/h.
 *
 * Rule envelope the scripts respect (rules/engine.ts §3/§4, cfg defaults):
 *  - NOT_KEEPING_RIGHT after keepRightSustainSec = 12 s in laneId > 0 while
 *    moving forward WITHOUT the left indicator (a declared overtake is exempt —
 *    which is why the hog demo CANCELS its indicator and then sits);
 *  - the lane-change codes ride the laneId delta at ≥ 10 km/h: indicatorOk = a
 *    matching-direction signal within 3 s, mirrorOk = a matching glance within
 *    5 s. The shadow arms both at every crossing; the weave arms only the
 *    glance, at every crossing, so the _MIRROR_CHECK code can never leak;
 *  - POOR_LANE_KEEPING after laneKeepSustainSec = 3 s with |laneOffsetM| >
 *    laneKeepMaxOffsetM = 3.25 m, SUPPRESSED while centerLineCond is armed.
 *    The weave's straddle sits at x ≈ 8.0 — held in laneId 1 by the locator's
 *    hysteresis (|8.0 − 4.0625| = 3.94 < 4.4125) with laneOffsetM ≈ −3.94:
 *    magnitude past the tolerance (offCentre ✓), sign toward the CURB, so
 *    centerLineCond (which needs a POSITIVE offset toward the осева) stays
 *    disarmed and the generic lane-keep episode is the one that bills.
 * The 40 km/h limit graces to 44 (speedingGraceRatio 0.1): every drive here
 * stays at or under 40, so no speeding code can leak into any of the three.
 * The crawler is deterministic moving traffic — its slam tier is authored out
 * of the corridor in the template, so it never resolves and never grades.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_LN_BOULEVARD_DISCIPLINE } from "../lessons/scenario/templates-lanes2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_LN_BOULEVARD_DISCIPLINE_ID = "sc-ln-boulevard-discipline";

/** Right-lane (home) and left-lane (visit) centers of wb-boulevard-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;
/** The weave's straddle line — the 0/1 lane boundary, approached from the LEFT
 *  lane so the offset is NEGATIVE (see the header: centerLineCond stays off). */
const X_STRADDLE = 8.0;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scLnBoulevardDisciplineShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Булевард с две ленти в посока — установи се в ДЯСНАТА лента." },
      { kind: "glance", mirror: "rear" },
      // Home lane (laneId 0) — satisfies the cruise gate at (12.19, 40).
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 45]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред теб бавна кола с около 20 км/ч — ето сега лявата лента ти трябва." },
      // The учебен ред, inside the lookback windows: огледало → мигач → рамо.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      {
        // Smooth diagonal out; the laneId boundary (x = 8.125) falls ~y = 58.
        kind: "drive",
        points: [[X_RIGHT, 45], [9.5, 55], [6.0, 66], [X_LEFT, 78]],
        targetKmh: 38,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Изпреварвай решително и без да превишаваш 40 — лявата лента е за маневра, не за скорост." },
      { kind: "drive", points: [[X_LEFT, 78], [X_LEFT, 140]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Цялата изпреварена кола се вижда в огледалото — десен мигач и веднага се прибираш." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [[X_LEFT, 140], [6.0, 150], [9.5, 160], [X_RIGHT, 170]],
        targetKmh: 38,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_RIGHT, 170], [X_RIGHT, 188]], targetKmh: 36 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: едно излизане, едно прибиране — и пак вдясно, където ти е мястото." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Постоянно каране в лявата лента" (NOT_KEEPING_RIGHT)
// ---------------------------------------------------------------------------

export function scLnBoulevardDisciplineMistakeHogScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: излизането е по реда — но маневрата няма край." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 30]], targetKmh: 38, stopAtEnd: false },
      // By the book — mirror + indicator, so NO lane-change code can leak: the
      // isolated fault is the STAY, not the move.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [[X_RIGHT, 30], [9.5, 39], [6.0, 47], [X_LEFT, 56]],
        targetKmh: 38,
        stopAtEnd: false,
      },
      // Indicator OFF at y ≈ 56 — the driver himself declares the maneuver
      // over, and the keep-right clock starts (the left signal is the
      // detector's own exemption). 12 s later he is at y ≈ 182 with the
      // crawler ~35 m behind him and the curb lane empty the whole way.
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LEFT, 56], [X_LEFT, 120]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Бавната кола е изпреварена — тук маневрата свършва. Само че воланът не помръдва." },
      { kind: "drive", points: [[X_LEFT, 120], [X_LEFT, 188]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дясната лента е празна цялата отсечка. Извън изпреварване и ляв завой мястото ти е вдясно (чл. 15)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Лутане между лентите без мигач"
//                  (LANE_CHANGE_WITHOUT_INDICATOR + POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scLnBoulevardDisciplineMistakeWeavingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: наляво, надясно, пак наляво — и нито един мигач." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 35]], targetKmh: 22, stopAtEnd: false },
      // Crossing 1 (0 → 1): the driver DOES look — the isolated fault is the
      // missing indicator, so no left signal is ever armed here or below.
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [[X_RIGHT, 35], [9.0, 44], [X_LEFT, 56]],
        targetKmh: 22,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Огледа се — но никой отвън не знае какво е видял." },
      // The straddle: hung on the lane line for ~5 s → POOR_LANE_KEEPING. Held
      // in laneId 1 by the locator's hysteresis, so this is NOT a crossing.
      {
        kind: "drive",
        points: [[X_LEFT, 56], [X_STRADDLE, 68], [X_STRADDLE, 100]],
        targetKmh: 22,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "И увисва на самата линия — нито в едната лента, нито в другата." },
      // Crossing 2 (1 → 0): glance right, still no signal.
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_STRADDLE, 100], [X_RIGHT, 118]], targetKmh: 22, stopAtEnd: false },
      // Crossing 3 (0 → 1): glance left, still no signal.
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_RIGHT, 118], [9.0, 130], [X_LEFT, 145]], targetKmh: 22, stopAtEnd: false },
      { kind: "drive", points: [[X_LEFT, 145], [X_LEFT, 175]], targetKmh: 22 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Заеми една лента, обяви я с мигач и я дръж — смяната е решение, а не навик на волана.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScLnBoulevardDisciplineTraceName =
  | "shadow-correct"
  | "mistake-left-lane-hog"
  | "mistake-weaving";

const SCRIPTS: Record<
  ScLnBoulevardDisciplineTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scLnBoulevardDisciplineShadowScript },
  "mistake-left-lane-hog": { kind: "mistake", script: scLnBoulevardDisciplineMistakeHogScript },
  "mistake-weaving": { kind: "mistake", script: scLnBoulevardDisciplineMistakeWeavingScript },
};

/**
 * Record one of the three drives against a loaded wb-boulevard-v1 document —
 * the TEMPLATE's staged crawler armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScLnBoulevardDisciplineDrive(
  districtRaw: unknown,
  name: ScLnBoulevardDisciplineTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_LN_BOULEVARD_DISCIPLINE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_LN_BOULEVARD_DISCIPLINE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
