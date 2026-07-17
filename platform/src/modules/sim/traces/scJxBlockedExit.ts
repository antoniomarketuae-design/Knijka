/**
 * sc-jx-blocked-exit — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Зелено, но изходът е задръстен" (JU-16
 * „Навлизане в задръстено кръстовище") on the committed sx-v1 district,
 * recorded with the template's OWN staged queue tail (brakingLeadCar
 * sc-jxb-tail — single truth, imported from the template) and the template's
 * OWN ruleConfig (the scAcNightOverdrive pattern: the recorder's internal
 * grader runs exactly the config the live lesson runs — here JU-09's
 * clear-ahead flag, calibrated to sx-v1's 27.7 m mouths).
 *
 * THE CLOCK (why every step's timing is load-bearing). Two independent
 * determinisms drive this drill, and the whole design is the GAP between them:
 *
 *   1. THE LAMP is wall-clock (signals.ts ns timeline, phaseAt(t + offset),
 *      cycle 50 s: green [0,20) → yellow [20,23) → red [23,49) → redYellow
 *      [49,50)). offset 0 ⇒ the arrival at t = 12.6 lands on GREEN with ~7 s of
 *      it left, and the next green opens at t = 50.
 *   2. THE QUEUE is keyed to the PLAYER — resumeAfterSec 24 counts from the
 *      driver's OWN first stop, not from the session clock. That is what lets
 *      ONE number serve all three drives.
 *
 * The shared spine (MEASURED, not estimated — these are the values the gate
 * pins): approach at 28 km/h → rest at the line (y = −29.54, leadGap 41.44 m)
 * at t = 12.62 → the tail's runner resolves on that stop → the column rolls at
 * t = 36.62, in the MIDDLE of the red. „Изходът се освободи" and „мога да
 * тръгна" are therefore ~13 s apart, and that gap is the lesson.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: refuses a whole GREEN in front of a blocked exit, sits out the
 *     red while the column pulls away at t = 36.62, and crosses on the NEXT
 *     green at t = 53.88 → ZERO violations. It never bills JU-09 „закъснели
 *     действия" because the tail sits at 41.44 m — inside the calibrated 48 m
 *     clear-ahead flag — for the whole green it refuses. Once the flag RELEASES
 *     (column gone, gap 115.4 m) the detector re-arms on the t = 50 green, and
 *     the drive answers it the way the teach copy demands: rolling at t = 52.62
 *     — a 2.6 s start, inside both the examiner's „2–3 секунди" and the 5 s
 *     hesitation sustain. BOTH halves of the lesson stay graded;
 *   - „Влизане на зелено в пълно кръстовище": follows the column in on the
 *     green it should have refused (line crossed at t = 12.52 at 19.8 km/h,
 *     lawfully GREEN) and strands at y = 10.75 — 1.15 m off the tail's bumper,
 *     car straddling the far mouth → EXACTLY STANDSTILL_GAP_TOO_CLOSE. The
 *     entry itself is innocent (the lamp WAS green), which is exactly why no
 *     signal code can carry this lesson and why the see-the-tyres floor is the
 *     only shipped detector that convicts the act;
 *   - „Нетърпеливо тръгване на новото червено": waits correctly through the
 *     green, then goes WITH the column ~1 s after it rolls — line crossed at
 *     t = 38.88 on a red that has been up 15.9 s → EXACTLY RED_LIGHT_CROSSED
 *     (the tail is ~50 m gone and the gap is OPENING by then, so no
 *     following/standstill code can double-bill).
 *
 * FOLLOWING_TOO_CLOSE is structurally impossible on all three (followMinSpeedKmh
 * 20): the only approach that closes on the standing tail does it at 12 km/h —
 * the stop-and-go exemption — and the gap crosses the fire threshold (9.8 m at
 * 28 km/h) only after that step has taken the speed down.
 *
 * Geometry pinned to content/world/sx-v1.json: ns right lane x = 4.06, south
 * stop line y = −27.73, junction node sx-n-c at the origin, mouths at ±27.7 m,
 * spawn sx-spawn-south (0, −105) heading north, ns limit 50, north arm to
 * y = 90. The standstill detector reads the RECORDER's leadGapM (bumper gap =
 * 16 − playerY − 4.1 m), so the hold rests at y = −29.5 (~41.4 m — inside the
 * 48 m flag, far outside the 1.5 m floor) and the kiss at y = 10.8 (~1.1 m).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_JX_BLOCKED_EXIT } from "../lessons/scenario/templates-junctions4";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_JX_BLOCKED_EXIT_ID = "sc-jx-blocked-exit";

/** Northbound right-lane center of sx-v1's ns road. */
const X_LANE = 4.06;
/** The rest pose at the line: center 1.8 m short of y = −27.73 (the proven
 *  sc-signal-redyellow pose — the JU-15 overshoot window at 1.2 m never arms). */
const Y_HOLD = -29.5;
/** The bumper-kiss rest: 1.1 m off the tail standing at y = 16, car mid-box. */
const Y_KISS = 10.8;
/** The JU-16 dial: ns green on the arrival (~t 11), next green at t 50 (header). */
const SIGNAL_OFFSETS = { "sx-n-c": 0 } as const;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — refuse the green, wait for the EXIT
// ---------------------------------------------------------------------------

export function scJxBlockedExitShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Светофарът напред свети ЗЕЛЕНО — но погледни отвъд кръстовището, не към лампата.",
      },
      { kind: "glance", mirror: "rear" },
      // Arrive at the stop line at t = 12.62: the lamp is green with ~7 s left,
      // and the column beyond the far mouth is already standing at y = 16.
      {
        kind: "drive",
        points: [[0, -105], [0, -103], [X_LANE, -92], [X_LANE, -50], [X_LANE, Y_HOLD]],
        targetKmh: 28,
      },
      {
        kind: "annotation",
        textBg: "Опашката на колоната е спряла веднага след кръстовището — място за мен там няма. Спирам пред линията, макар да е зелено.",
      },
      { kind: "glance", mirror: "left" },
      {
        kind: "annotation",
        textBg: "Зеленото разрешава преминаване, не влизане без изход. По-добре цяло изпуснато зелено, отколкото заключено кръстовище.",
      },
      // The wait outlasts the whole cycle: green out (t 20), yellow, the full
      // red (t 23 → 49) — the column pulls away at t = 36.62, in the MIDDLE of
      // it — and the next green at t 50. Rolling at t = 52.62: a 2.6 s start
      // that answers the re-armed JU-09 detector inside its 5 s sustain.
      { kind: "pause", sec: 40, brake: true },
      {
        kind: "annotation",
        textBg: "Колоната се отлепи още на червеното — но свободният изход не е сигнал. Чакам моето зелено.",
      },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg: "Зелено И празен изход — сега тръгвам веднага и минавам на едно движение.",
      },
      { kind: "drive", points: [[X_LANE, Y_HOLD], [X_LANE, 10], [X_LANE, 47]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Точно така: решението се взима ПРЕД линията — има ли отсреща място за цялата ми кола.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Влизане на зелено в пълно кръстовище"
// (STANDSTILL_GAP_TOO_CLOSE — the stranding, billed at the bumper)
// ---------------------------------------------------------------------------

export function scJxBlockedExitMistakeEnterFullBoxScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „свети зелено — значи мога“. Колоната отвъд кръстовището изобщо не е погледната.",
      },
      { kind: "glance", mirror: "rear" },
      // Same approach, but no stop at the line — it falls at t = 12.52 at
      // 19.8 km/h, lawfully GREEN (the entry is innocent; the exit is not).
      {
        kind: "drive",
        points: [[0, -105], [0, -103], [X_LANE, -92], [X_LANE, -50], [X_LANE, -30]],
        targetKmh: 26,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Колата влиза в кръстовището на зелено и пълзи след колоната…",
      },
      // Roll in behind the column at 12 km/h — under followMinSpeedKmh (20), so
      // the closing gap is the stop-and-go exemption, not tailgating — and rest
      // at t = 24.20, y = 10.75, 1.15 m off its bumper, straddling the far mouth.
      { kind: "drive", points: [[X_LANE, -30], [X_LANE, Y_KISS]], targetKmh: 12 },
      {
        kind: "annotation",
        textBg: "…и спира там, където никога не се спира: насред кръстовището, опряна в предната кола, без изход напред.",
      },
      // The glue outlasts the 1.5 s standstill sustain (bills ~t 25.7); the demo
      // ends at t = 30.2, well before this drive's own tail-roll at t = 48.2
      // (its rest was late, so the queue is late too) — the picture stays the
      // stranding.
      { kind: "pause", sec: 6, brake: true },
      {
        kind: "annotation",
        textBg: "След секунди напречното направление получава зелено — към платно, което е заето от теб. Така се заключва кръстовище (чл. 47).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Нетърпеливо тръгване на новото червено"
// (RED_LIGHT_CROSSED — the right decision, taken at the wrong second)
// ---------------------------------------------------------------------------

export function scJxBlockedExitMistakeImpatientRedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: изчакването беше правилно — но тръгването стана по колоната, не по светофара.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[0, -105], [0, -103], [X_LANE, -92], [X_LANE, -50], [X_LANE, Y_HOLD]], targetKmh: 28 },
      {
        kind: "annotation",
        textBg: "Дотук всичко е наред: цяло зелено е изтърпяно пред зает изход.",
      },
      // Wait out the green (t 20), the yellow and 14 s of the red — then move
      // ~1 s after the column rolls at t = 36.62. Line crossed at t = 38.88:
      // the lamp has been RED for 15.9 s. The wait was right; the trigger was
      // the queue instead of the lamp.
      { kind: "pause", sec: 25, brake: true },
      {
        kind: "annotation",
        textBg: "Колоната се отлепи — и кракът тръгва с нея, без да провери лампата…",
      },
      { kind: "drive", points: [[X_LANE, Y_HOLD], [X_LANE, 10], [X_LANE, 47]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Изходът реши, че МОЖЕШ да преминеш. Лампата решава дали ти е РЕД — а тя беше червена от петнайсет секунди (ППЗДвП чл. 31).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScJxBlockedExitTraceName =
  | "shadow-correct"
  | "mistake-enter-full-box"
  | "mistake-impatient-red";

const SCRIPTS: Record<
  ScJxBlockedExitTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scJxBlockedExitShadowScript },
  "mistake-enter-full-box": { kind: "mistake", script: scJxBlockedExitMistakeEnterFullBoxScript },
  "mistake-impatient-red": { kind: "mistake", script: scJxBlockedExitMistakeImpatientRedScript },
};

/**
 * Record one of the three drives against a loaded sx-v1 document — the
 * TEMPLATE's staged queue tail armed and the TEMPLATE's own ruleConfig applied
 * (single truth for both), the ns phase pinned (signalOffsets), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScJxBlockedExitDrive(
  districtRaw: unknown,
  name: ScJxBlockedExitTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_JX_BLOCKED_EXIT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_JX_BLOCKED_EXIT.staged ?? [])] as StagedEventSpec[],
    signalOffsets: SIGNAL_OFFSETS,
    ...(SC_JX_BLOCKED_EXIT.ruleConfig ? { ruleConfig: SC_JX_BLOCKED_EXIT.ruleConfig } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
