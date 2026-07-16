/**
 * sc-vu-pass-clearance — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Изпреварване на велосипедист" (VU-02) on the
 * committed vu-pass-v1 street, recorded with the template's OWN staged cyclist
 * (cyclistRightHook sc-vup-cyclist — single truth, imported from the
 * template). No ambient traffic (seed 7): the ONLY actor is the curb-riding
 * cyclist, and the ONLY thing the stack can grade mid-block is the lateral
 * clearance the driver sets (the runtime vulnerable-pass tracker).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (the wide-arc pass at
 *     ~3.2 m of air — ≥ the 1.5 m norm after the ~1.25 m body allowance);
 *   - „Провиране покрай велосипедиста" grades EXACTLY
 *     VULNERABLE_PASS_TOO_CLOSE (a sub-20 km/h squeeze at ~1.1 m of air —
 *     under the follow-grading floor, so no FOLLOWING code can pollute it);
 *   - „Бързо изпреварване с късно отместване" grades EXACTLY
 *     VULNERABLE_PASS_TOO_CLOSE (the same ~1.1 m of air at 47 km/h — the
 *     late-dive line keeps the in-corridor time under the follow sustain).
 *
 * Geometry pinned to content/world/vu-pass-v1.json: 360 m S→N street on
 * x = 0, northbound lane center x = 4.0625 (drawn half-lane), the cyclist's
 * curb line x = 6.6625 (lane + extraRightOffsetM 2.6). Cyclist released at
 * t = 0 (releaseDistM exceeds the spawn distance) from y = 110 at 3 m/s.
 * Lateral honesty (runtime VULNERABLE_PASS_* doc): center-to-center minus the
 * ~1.25 m body allowance = air. Clean line x 2.2 → 4.46 m centers ≈ 3.2 m
 * air; squeeze line x 4.3 → 2.3625 m centers ≈ 1.1 m air — inside the
 * convict band (< 2.45) and clear of the runner's 2.2 m contact radius.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_PASS_CLEARANCE } from "../lessons/scenario/templates-vru";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_PASS_CLEARANCE_ID = "sc-vu-pass-clearance";

/** Northbound lane center of vu-pass-v1 (0.5 × drawn lane). */
const LANE_X = 4.06;
/** The wide-arc pass line (≈ 3.2 m of air to the cyclist's curb line). */
const PASS_X = 2.2;
/** The squeeze line (≈ 1.1 m of air — the taught mistake). */
const SQUEEZE_X = 4.3;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — mirror, signal, wide arc, calm return
// ---------------------------------------------------------------------------

export function scVuPassShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Покрай десния бордюр кара велосипедист — планирай широката дъга отрано." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // Move out EARLY (the arc is built before the gap closes), then hold the
      // wide line the whole pass: 4.46 m of centers ≈ 3.2 m of air.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 60]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Огледало, мигач наляво и осезаемо отместване — поне метър и половина въздух." },
      {
        kind: "drive",
        points: [[LANE_X, 60], [PASS_X, 75], [PASS_X, 195]],
        targetKmh: 45,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Велосипедистът е далеч зад теб — прибери се плавно вдясно." },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [[PASS_X, 195], [LANE_X, 215], [LANE_X, 315]],
        targetKmh: 45,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: широка дъга, спокойна скорост и плавно прибиране — точно чл. 42." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Провиране покрай велосипедиста" (VULNERABLE_PASS_TOO_CLOSE)
//
// The slow squeeze: the driver never changes line (x 4.3 — a hand's width off
// the lane center) and worms past at 18 km/h. Sub-20 km/h keeps the follow
// detector structurally off (followMinSpeedKmh); the pass floor (15 km/h)
// still grades the squeeze — creeping in a queue would not.
// ---------------------------------------------------------------------------

export function scVuPassMistakeSqueezeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: колата не се отмества — ще се провре на метър от колелото." },
      { kind: "glance", mirror: "left" },
      // Approach at speed, then ease to a worm-past pace behind the cyclist.
      { kind: "drive", points: [[LANE_X, 15], [SQUEEZE_X, 30], [SQUEEZE_X, 95]], targetKmh: 45, stopAtEnd: false },
      { kind: "drive", points: [[SQUEEZE_X, 95], [SQUEEZE_X, 112]], targetKmh: 18, stopAtEnd: false },
      { kind: "annotation", textBg: "Велосипедистът е на една ръка разстояние… а колата продължава напред." },
      { kind: "drive", points: [[SQUEEZE_X, 112], [SQUEEZE_X, 210]], targetKmh: 18, stopAtEnd: false },
      { kind: "drive", points: [[SQUEEZE_X, 210], [LANE_X, 225], [LANE_X, 300]], targetKmh: 32 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Метър въздух не е дистанция: едно клатушкане на колелото и е сблъсък — отместваш се с цялата кола (чл. 42).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Бързо изпреварване с късно отместване" (same code)
//
// The fast close pass: the driver rides the wide line, then DIVES back toward
// the curb exactly at the cyclist and sweeps past at 47 km/h with the same
// ~1.1 m of air. The dive spans y 130→140 (in) and 165→180 (out), so the
// cyclist sits in the lead corridor for ~1.3 s only — under the follow
// sustain (2 s): the ONLY graded fault is the clearance. Same-code pair by
// design (the sc-ov-keep-right precedent) — the doc 72 VU-02 "fast close
// pass" flavor prefers the single code.
// ---------------------------------------------------------------------------

export function scVuPassMistakeFastCloseScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: отместване има… но в последния миг и обратно към колелото." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE_X, 15], [PASS_X, 35], [PASS_X, 130]], targetKmh: 47, stopAtEnd: false },
      { kind: "annotation", textBg: "Вместо да задържи дъгата, колата се връща плътно до велосипедиста на скорост." },
      {
        kind: "drive",
        points: [[PASS_X, 130], [SQUEEZE_X, 140], [SQUEEZE_X, 165], [PASS_X, 180]],
        targetKmh: 47,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[PASS_X, 180], [LANE_X, 200], [LANE_X, 310]], targetKmh: 45 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Дъгата се строи отрано и се ДЪРЖИ: късото връщане оставя същия метър въздух при два пъти по-висока скорост (чл. 42).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuPassTraceName = "shadow-correct" | "mistake-squeeze" | "mistake-fast-close";

const SCRIPTS: Record<ScVuPassTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scVuPassShadowScript },
  "mistake-squeeze": { kind: "mistake", script: scVuPassMistakeSqueezeScript },
  "mistake-fast-close": { kind: "mistake", script: scVuPassMistakeFastCloseScript },
};

/**
 * Record one of the three drives against a loaded vu-pass-v1 document — the
 * TEMPLATE's staged cyclist armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScVuPassDrive(
  districtRaw: unknown,
  name: ScVuPassTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_PASS_CLEARANCE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_PASS_CLEARANCE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
