/**
 * sc-ov-abort — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Прекъснато изпреварване" (doc 72 OV-08 abort discipline,
 * the OV-05 companion) on the committed ov-oncoming-v1 district, recorded
 * with the template's OWN staged actors (single truth):
 *  - the slow lead (brakingLeadCar sc-ova-lead — the sc-ovg-lead mold);
 *  - ONE fast oncoming (oncomingStream sc-ova-stream): 25 m/s ≈ 90 km/h,
 *    released on the player's first movement, holding @ y 882 — authored so
 *    the pull-out reads a comfortable ~9 measured seconds. The trap is the
 *    SPEED: distance deceives, the window collapses at mutual closing.
 *
 * The trace gate replays exactly these through the production stack:
 *  - shadow: pulls out legally (~9 s measured), reads the closure EARLY
 *    (~6–7 s — still legal country), ABORTS — hard brake IN the oncoming
 *    lane, down through the corridor's commit bar, then tucks back behind
 *    the lead — and completes the pass on the emptied road → completely
 *    clean (ZERO violations + CLEAN_DRIVING). The abort's innocence IS the
 *    lesson: braking stand-down + the sub-commit bar + the excursion reset
 *    make an aborted overtake structurally unconvictable;
 *  - „Настояване": the same pull-out, but pushes on unbraked past the 4 s
 *    convict band → EXACTLY OVERTAKE_INSUFFICIENT_GAP, slotting back with
 *    only metres to spare;
 *  - „Челен сблъсък": neither aborts nor slots back → the same conviction,
 *    then the head-on contact (COLLISION) — the lesson's terminal beat.
 *
 * Geometry pinned to content/world/ov-oncoming-v1.json (see scOvOncomingGap).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_ABORT } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_ABORT_ID = "sc-ov-abort";

/** Own (northbound) lane center / committed-pass line on the oncoming bank. */
const X_OWN = 4.06;
const X_OUT = -2.5;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the abort, then the clean completion
// ---------------------------------------------------------------------------

export function scOvAbortShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Зад бавната кола, далеч напред се задава насрещен — разстоянието изглежда достатъчно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 150]], targetKmh: 34, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // Legal pull-out: the oncoming measures ~9 seconds away.
      { kind: "drive", points: [[X_OWN, 150], [X_OWN, 157], [0.8, 171], [X_OUT, 185]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OUT, 185], [X_OUT, 198]], targetKmh: 60, stopAtEnd: false },
      { kind: "annotation", textBg: "Насрещният идва с 90 — прозорецът се затваря. НЕ настоявай: план Б." },
      // THE ABORT: hard brake IN the lane (down through ~18 km/h), then the
      // tuck back behind the lead — the whole lesson in two moves.
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 198], [X_OUT, 212]], targetKmh: 18, stopAtEnd: false },
      { kind: "drive", points: [[X_OUT, 212], [0.8, 222], [X_OWN, 234]], targetKmh: 18, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 234], [X_OWN, 262]], targetKmh: 24, stopAtEnd: false },
      { kind: "annotation", textBg: "Прекъснатото изпреварване не е провал — то е умението, което те пази жив." },
      // The oncoming thunders past head-on; then the road is empty.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 262], [X_OWN, 270], [0.8, 284], [X_OUT, 298]], targetKmh: 50, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OUT, 298], [X_OUT, 430]], targetKmh: 62, stopAtEnd: false },
      { kind: "annotation", textBg: "Сега прозорецът е истински — маневрата се довършва решително." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 430], [0.8, 444], [X_OWN, 458]], targetKmh: 62, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 458], [X_OWN, 520]], targetKmh: 60, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 520], [X_OWN, 560]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Планът Б струва три секунди чакане — и после маневрата се довършва на чист път." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Настояване" (OVERTAKE_INSUFFICIENT_GAP)
// ---------------------------------------------------------------------------

export function scOvAbortMistakePushOnScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: прозорецът се затваря, а водачът „ще довърши започнатото“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 150]], targetKmh: 34, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 150], [X_OWN, 157], [0.8, 171], [X_OUT, 185]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Pushes on, unbraked, straight through the collapsing window.
      { kind: "drive", points: [[X_OUT, 185], [X_OUT, 242]], targetKmh: 56, stopAtEnd: false },
      { kind: "annotation", textBg: "Под 4 секунди до насрещния — а колата още настоява в неговата лента." },
      // Slots back with only metres to spare — luck, not judgment.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 242], [0.0, 264], [X_OWN, 292]], targetKmh: 56, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 292], [X_OWN, 340]], targetKmh: 55, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 340], [X_OWN, 400]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изпреварването е законно само докато условията са налице — изчезнат ли, се прибираш (чл. 42)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Челен сблъсък" (OVERTAKE_INSUFFICIENT_GAP + COLLISION)
// ---------------------------------------------------------------------------

export function scOvAbortMistakeHeadOnScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: нито прекъсва, нито се прибира — среща с насрещния при събрани скорости." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 150]], targetKmh: 34, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 150], [X_OWN, 157], [0.8, 171], [X_OUT, 185]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Holds the oncoming lane all the way into the meeting.
      { kind: "drive", points: [[X_OUT, 185], [X_OUT, 268]], targetKmh: 60, stopAtEnd: false },
      { kind: "annotation", textBg: "Планът Б така и не дойде — насрещният няма къде да се дене." },
      { kind: "drive", points: [[X_OUT, 268], [0.8, 282], [X_OWN, 296]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 296], [X_OWN, 320]], targetKmh: 30 },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "Челният удар събира двете скорости. Единствената защита е планът Б — спирачка и обратно, ЩОМ прозорецът се затваря." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvAbortTraceName = "shadow-correct" | "mistake-push-on" | "mistake-head-on";

const SCRIPTS: Record<
  ScOvAbortTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvAbortShadowScript },
  "mistake-push-on": { kind: "mistake", script: scOvAbortMistakePushOnScript },
  "mistake-head-on": { kind: "mistake", script: scOvAbortMistakeHeadOnScript },
};

/**
 * Record one of the three drives against a loaded ov-oncoming-v1 document —
 * the TEMPLATE's staged lead + fast oncoming armed (single truth), ambient
 * traffic zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScOvAbortDrive(
  districtRaw: unknown,
  name: ScOvAbortTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_ABORT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_ABORT.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
