/**
 * sc-junction-scan — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Един поглед не стига" (JU-23 — the ляво-дясно-ляво scan
 * before a Б2 stop line) on the committed tj-stop-v1 district. The junction-scan
 * detector ships config-OFF (types.ts: the A12 whole-commute crosses a Б2
 * unglanced by default), so this DRILL enables it via the recorder's ruleConfig
 * override — exactly the per-lesson opt-in the config comment describes.
 *
 * T9 (ledger §2): the template now stages the car all of this copy talks about
 * (SC_JUNCTION_SCAN_CONFLICT — the priority car from the LEFT, west → east, in
 * the very lane the right turn merges into). The recorder forwards
 * `SC_JUNCTION_SCAN.staged`, so every drive below meets it. That changes what
 * the two mistakes grade, and the change is the lesson: a driver who does not
 * look does not merely fail an observation checkbox, he takes somebody's right
 * of way.
 *
 * The trace gate replays exactly these through the production stack, with the
 * junction-scan drill ENABLED:
 *   - shadow: full stop before the line + ляво-дясно-ляво scan + a real WAIT
 *     for the priority car → ZERO violations (FULL_STOP_AT_STOP_SIGN + a clean
 *     right turn), conflict resolved „yielded";
 *   - „Без оглеждане": a full stop but NO scan → JUNCTION_SCAN_INCOMPLETE +
 *     FAILED_TO_YIELD (never STOP_SIGN_NO_FULL_STOP — it stops fully);
 *   - „Само един поглед": a full stop + a single LEFT glance (no right) →
 *     the same pair (one look is not the Л-Д-Л scan, and the car it missed is
 *     the one the SECOND left glance exists for).
 *
 * Geometry pinned to content/world/tj-stop-v1.json: the minor (stem) approach
 * on x = 0 with the Б2 line at y = −27.725, right-lane center x = 4.0625, spawn
 * tj-spawn-south (4.06, −105) heading north; the drive stops before the line and
 * turns right onto the east priority arm (the sc-junction-stop path).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_JUNCTION_SCAN } from "../lessons/scenario/templates-junctions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_JUNCTION_SCAN_ID = "sc-junction-scan";

/** Right-lane center of tj-stop-v1's drawn lane. */
const LANE = 4.0625;

/** Arc polyline: center (cx, cy), radius r, param a0→a1 deg (8 segments). */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Right turn stem → east arm: R = 20 quarter arc, center (24.06, −24.06). */
const TJ_RIGHT_TURN: Array<[number, number]> = [
  [LANE, -24.06],
  ...arcPts(24.0625, -24.0625, 20, 180, 90),
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — full stop, then ляво-дясно-ляво scan
// ---------------------------------------------------------------------------

export function scJunctionScanShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е знак Б2 „Спри!“ — спираш напълно и оглеждаш наляво-надясно-наляво." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -45]], targetKmh: 25 },
      { kind: "annotation", textBg: "Десен мигач и плавно към стоп-линията." },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[LANE, -45], [LANE, -29.2]], targetKmh: 12 },
      { kind: "annotation", textBg: "Пълно спиране ПРЕДИ линията, после наляво-надясно-наляво." },
      { kind: "pause", sec: 1, brake: true },
      // Separate the glances with brief brake-holds so EACH reaches the rule
      // engine (the recorder consumes one pendingGlance per frame — consecutive
      // glance markers would collapse to the last one).
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "glance", mirror: "left" },
      {
        // T9: the second look left is the one that CATCHES something now —
        // SC_JUNCTION_SCAN_CONFLICT is held ~25 m west and released the moment
        // the player is at the line. The demonstration waits it out; pulling
        // away on the third glance would take its right of way. 8 s covers the
        // held car's ramp to the node (~4.7 s) plus its clear-out sprint past
        // PRIORITY_CLEAR_ARC_M (~2.2 s), with margin.
        kind: "pause",
        sec: 8,
        brake: true,
      },
      {
        kind: "annotation",
        textBg: "Вторият поглед наляво я хвана: кола по главния, отляво. Изчакваме я да премине изцяло.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "annotation", textBg: "Мина — сега вече е чисто. Потегляме." },
      { kind: "drive", points: [[LANE, -29.2], ...TJ_RIGHT_TURN, [58, -LANE]], targetKmh: 15 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така: пълно спиране, ПЪЛНО оглеждане, уверено потегляне." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Без оглеждане" (JUNCTION_SCAN_INCOMPLETE)
// ---------------------------------------------------------------------------

export function scJunctionScanMistakeNoScanScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: спира напълно на Б2, но потегля БЕЗ да се огледа." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -45]], targetKmh: 25 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[LANE, -45], [LANE, -29.2]], targetKmh: 12 },
      { kind: "annotation", textBg: "Спира докрай — но потегля, без да погледне нито наляво, нито надясно." },
      // Full stop (so NO STOP_SIGN_NO_FULL_STOP) but NO left/right scan.
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "drive", points: [[LANE, -29.2], ...TJ_RIGHT_TURN, [58, -LANE]], targetKmh: 15 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "„Гледах, но не видях“ е най-честата причина за удар на кръстовище — оглеждай се." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Само един поглед" (JUNCTION_SCAN_INCOMPLETE)
// ---------------------------------------------------------------------------

export function scJunctionScanMistakeSingleGlanceScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: поглежда само веднъж наляво и потегля — един поглед не стига." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, -45]], targetKmh: 25 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[LANE, -45], [LANE, -29.2]], targetKmh: 12 },
      { kind: "annotation", textBg: "Един поглед наляво — но не и надясно, откъдето идват колите с предимство." },
      { kind: "pause", sec: 2.5, brake: true },
      // A single LEFT glance — no right → the scan is incomplete.
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE, -29.2], ...TJ_RIGHT_TURN, [58, -LANE]], targetKmh: 15 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Оглеждай наляво-надясно-наляво: вторият поглед хваща колата, приближила междувременно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScJunctionScanTraceName = "shadow-correct" | "mistake-no-scan" | "mistake-single-glance";

const SCRIPTS: Record<ScJunctionScanTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scJunctionScanShadowScript },
  "mistake-no-scan": { kind: "mistake", script: scJunctionScanMistakeNoScanScript },
  "mistake-single-glance": { kind: "mistake", script: scJunctionScanMistakeSingleGlanceScript },
};

/**
 * Record one of the three drives against a loaded tj-stop-v1 document — the
 * junction-scan drill ENABLED via ruleConfig (the config-gated detector's
 * per-lesson opt-in), ambient traffic zero. Deterministic: same district →
 * same trace (rule config does not affect the serialized trace bytes).
 */
export function recordScJunctionScanDrive(
  districtRaw: unknown,
  name: ScJunctionScanTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_JUNCTION_SCAN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_JUNCTION_SCAN.staged ?? [])] as StagedEventSpec[],
    ruleConfig: { junctionScanObservationEnabled: true },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
