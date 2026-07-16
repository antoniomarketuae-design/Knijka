/**
 * sc-signal-redyellow — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Тръгване на червено-жълто" (JU-08) on the committed
 * sx-v1 district. No staged conflict — the 1 s red+yellow lamp window IS the
 * encounter, pinned deterministically by signalOffsets.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations — waits out the red, stays put through the
 *     red+yellow second, crosses on GREEN (stopLineCrossed lightState green);
 *   - „Пропълзяване на червено-жълто" grades EXACTLY RED_YELLOW_CROSSED (a
 *     standstill creep that crosses the line inside the 1 s window);
 *   - „Изстрелване преди зеленото" grades EXACTLY RED_YELLOW_CROSSED (the
 *     hard anticipation launch, same window at speed).
 *
 * THE DIAL (signals.ts ns timeline, phaseAt(t + offset), cycle 50 s: green
 * [0,20) → yellow [20,23) → red [23,49) → redYellow [49,50)): offset 30 ⇒
 * for the ns group red lands on the arrival (~t 11), redYellow on t ∈
 * [19,20), green from t 20. The recorder's determinism pins the window
 * forever — the byte-identity gate is the fragility-proofing.
 *
 * Geometry pinned to sx-v1: ns right lane x = 4.06, stop line y = −27.73,
 * spawn sx-spawn-south (0, −105) heading north, ns limit 50.
 */

import type { StagedEventSpec } from "../contracts";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SIGNAL_REDYELLOW_ID = "sc-signal-redyellow";

/** Northbound right-lane center of sx-v1's ns road. */
const X_LANE = 4.06;
/** The JU-08 dial: ns redYellow on t ∈ [19,20), green from t 20 (see header). */
const SIGNAL_OFFSETS = { "sx-n-c": 30 } as const;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSignalRedYellowShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Светофарът напред е червен — спри плавно на линията и чакай." },
      { kind: "glance", mirror: "rear" },
      {
        // Ease to a stop just short of the line (y = −27.73) on red.
        kind: "drive",
        points: [[0, -105], [0, -103], [X_LANE, -92], [X_LANE, -50], [X_LANE, -29.5]],
        targetKmh: 28,
      },
      {
        kind: "annotation",
        textBg: "Червено + жълто: приготви се — но кракът остава на спирачката. Тръгва се на ЗЕЛЕНО.",
      },
      // The red runs to t 19, red+yellow t ∈ [19,20), green at t 20 — hold
      // through both and launch a beat after the green.
      { kind: "pause", sec: 9.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Чисто зелено — премини решително." },
      { kind: "drive", points: [[X_LANE, -29.5], [X_LANE, 10], [X_LANE, 47]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така: готовност на червено-жълто, движение на зелено." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Пропълзяване на червено-жълто" (RED_YELLOW_CROSSED)
// ---------------------------------------------------------------------------

export function scSignalRedYellowMistakeCreepScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: колата тръгва с появата на червено-жълтото, преди зеленото." },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[0, -105], [0, -103], [X_LANE, -92], [X_LANE, -50], [X_LANE, -29.5]],
        targetKmh: 28,
      },
      // Wait most of the red out, then creep off just as the red+yellow shows —
      // the line falls inside the 1 s window.
      { kind: "pause", sec: 5.5, brake: true },
      { kind: "annotation", textBg: "Червено-жълто — и кракът вече пуска спирачката…" },
      { kind: "drive", points: [[X_LANE, -29.5], [X_LANE, -24], [X_LANE, -14]], targetKmh: 8, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, -14], [X_LANE, 12], [X_LANE, 45]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Комбинираният сигнал подготвя, но НЕ разрешава: линията се пресича чак на зелено — напречното направление още дочиства кръстовището.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изстрелване преди зеленото" (RED_YELLOW_CROSSED)
// ---------------------------------------------------------------------------

export function scSignalRedYellowMistakeJumpScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: изстрелване в секундата на червено-жълтото — „да хвана зеленото“." },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[0, -105], [0, -103], [X_LANE, -92], [X_LANE, -50], [X_LANE, -29.5]],
        targetKmh: 28,
      },
      // A shorter wait, then a hard launch — the line falls inside the window
      // at speed.
      { kind: "pause", sec: 5.5, brake: true },
      { kind: "annotation", textBg: "Газ до долу още на червено-жълто…" },
      { kind: "drive", points: [[X_LANE, -29.5], [X_LANE, 5], [X_LANE, 45]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Печели се под секунда, а се влиза в кръстовище, което другите още не са освободили. Тръгва се на чисто зелено.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSignalRedYellowTraceName = "shadow-correct" | "mistake-creep" | "mistake-jump";

const SCRIPTS: Record<
  ScSignalRedYellowTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSignalRedYellowShadowScript },
  "mistake-creep": { kind: "mistake", script: scSignalRedYellowMistakeCreepScript },
  "mistake-jump": { kind: "mistake", script: scSignalRedYellowMistakeJumpScript },
};

/**
 * Record one of the three drives against a loaded sx-v1 document — the
 * red+yellow window pinned (signalOffsets), no staged events, ambient traffic
 * zero. Deterministic: same district → same trace.
 */
export function recordScSignalRedYellowDrive(
  districtRaw: unknown,
  name: ScSignalRedYellowTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SIGNAL_REDYELLOW_ID,
    kind,
    seed: 7,
    stagedEvents: [] as StagedEventSpec[],
    signalOffsets: SIGNAL_OFFSETS,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
