/**
 * sc-ov-solid-line — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Непрекъсната осева линия" (OV-04 escalation + SN-03,
 * ADR-006 stage 2b LINE TYPES) on the committed ov-solid-v1 district (1+1
 * street; М1 solidCenterLine span @ y ∈ [90, 230]). NO staged actor, ambient
 * traffic zero (the harness law) — the only gradable act is the driver's own
 * position vs the осева.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: holds the middle of the own lane through the whole М1 span →
 *     ZERO violations + CLEAN_DRIVING;
 *   - „Изпреварващо излизане": a SIGNALLED overtake-style pull-out across the
 *     solid line inside the span (out, brief ride of the oncoming lane, back)
 *     → grades EXACTLY CROSSED_SOLID_LINE (опасна) — the indicator does not
 *     excuse the marking, and NO lane-change code exists on a 1+1 (the bank
 *     flip renumbers nothing);
 *   - „Отнасяне": an UNSIGNALLED drift fully across and back → EXACTLY
 *     CROSSED_SOLID_LINE, and provably NO CENTER_LINE_TOUCHED — the crossing
 *     bills the excursion alone (the stage-2b no-double-bill ruling).
 *
 * Geometry pinned to content/world/ov-solid-v1.json: a 1+1 road on x = 0, own
 * (northbound) lane center x = 4.06, the осева ON x = 0, oncoming lane center
 * x = −4.06; М1 span [90, 230]; spawn ovs-spawn-start (4.06, 15) heading
 * north; 340 m, limit 50. A vehicle whose CENTER is at x < 0 sits fully past
 * the осева (tick.opposingBank — the runtime's committed bank fix).
 */

import { SC_OV_SOLID_LINE } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_SOLID_LINE_ID = "sc-ov-solid-line";

/** Own-lane center of ov-solid-v1 (northbound bank of the 1+1 street). */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the middle of the own lane, throughout
// ---------------------------------------------------------------------------

export function scOvSolidLineShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред осевата линия е непрекъсната (М1) — плътната линия не се застъпва и не се пресича." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 160]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Средата на лентата: гледай далеч напред — колата отива там, където гледаш." },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 230], [X_LANE, 308]], targetKmh: 35 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Чисто: нито настъпена, нито пресечена линия — своята лента стига." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изпреварващо излизане" (CROSSED_SOLID_LINE, signalled)
// ---------------------------------------------------------------------------

export function scOvSolidLineMistakePulloutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: излизане за изпреварване през плътната линия — мигачът не отменя маркировката." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 80], [X_LANE, 120]], targetKmh: 30, stopAtEnd: false },
      // Signalled pull-out ACROSS the solid осева, deep inside the span
      // (center crosses x = 0 at y ≈ 142) — the textbook OV-04 mistake.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_LANE, 120], [-2.5, 155]], targetKmh: 25, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-2.5, 155], [-2.5, 165]], targetKmh: 25, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата е изцяло в насрещната половина — точно каквото М1 забранява." },
      // Abort back into the own lane (signalled) — the excursion bills ONCE.
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[-2.5, 165], [X_LANE, 200]], targetKmh: 25, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LANE, 200], [X_LANE, 300]], targetKmh: 32 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Плътна линия = стена: изпреварвай чак където маркировката стане прекъсната." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Отнасяне" (CROSSED_SOLID_LINE, unsignalled drift)
// ---------------------------------------------------------------------------

export function scOvSolidLineMistakeDriftScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: погледът пада в предния капак — и колата се отнася през плътната линия." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 80], [X_LANE, 125]], targetKmh: 28, stopAtEnd: false },
      // Unsignalled drift fully across (center crosses x = 0 at y ≈ 149),
      // a short ride on the wrong side, then the correction back.
      { kind: "drive", points: [[X_LANE, 125], [-1.8, 160], [-1.8, 172], [X_LANE, 207]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "„Само за момент“ отвъд осевата е пълно пресичане — опасна грешка." },
      { kind: "drive", points: [[X_LANE, 207], [X_LANE, 300]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Гледай далеч напред по средата на лентата — малки корекции, рано и плавно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvSolidLineTraceName = "shadow-correct" | "mistake-pullout" | "mistake-drift";

const SCRIPTS: Record<
  ScOvSolidLineTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvSolidLineShadowScript },
  "mistake-pullout": { kind: "mistake", script: scOvSolidLineMistakePulloutScript },
  "mistake-drift": { kind: "mistake", script: scOvSolidLineMistakeDriftScript },
};

/**
 * Record one of the three drives against a loaded ov-solid-v1 document — no
 * staged events, ambient traffic zero (the harness law). Deterministic: same
 * district → same trace.
 */
export function recordScOvSolidLineDrive(
  districtRaw: unknown,
  name: ScOvSolidLineTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_SOLID_LINE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_SOLID_LINE.staged ?? [])],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
