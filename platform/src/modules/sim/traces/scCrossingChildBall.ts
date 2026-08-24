/**
 * sc-crossing-child-ball — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Дете тича след топка на пътеката" (PE-04, the
 * child dart) on the committed pe-child-v1 district, recorded with the
 * template's OWN staged runner (pedestrianDartOut sc-cbl-ped, 2.6 m/s — a small
 * child bolting across, single truth, imported from the template). Founder R3
 * #27: the figure renders as the CHILD rig and the template's `hazard` BALL
 * rolls out at the trigger with the child following ballLeadSec = 0.5 s later
 * (the ball is the warning cue) — so every occupancy window in these drives
 * sits 0.5 s later than the pre-ball recordings, and the scripts are retimed
 * for it. The ball itself is render-only and never reaches the trace bytes.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED (slowed early, stopped, waited);
 *   - „Твърде бързо приближаване" grades EXACTLY PEDESTRIAN_CROSSING_TOO_FAST
 *     (held a legal-but-too-fast 38 km/h into the occupied residential crossing,
 *     then braked short — no not-yielded, no contact);
 *   - „Удар в детето" grades EXACTLY COLLISION (never braked, struck the child ON
 *     the crossing; stays under the 30 km/h approach cap and never passes the
 *     line, so the ONLY code is the authored contact).
 *
 * Geometry pinned to content/world/pe-child-v1.json:
 *   street on x = 0, right-lane center x = 4.06, zebra at y = 78, spawn
 *   pe-spawn-approach (4.06, 15) heading north, limit 40 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_CROSSING_CHILD_BALL } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_CROSSING_CHILD_BALL_ID = "sc-crossing-child-ball";

/** Northbound right-lane center of pe-child-v1. */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 78;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scCrossingChildBallShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Квартална улица с деца — карай бавно и наблюдавай дворовете и паркираните коли." },
      { kind: "glance", mirror: "rear" },
      // ~20 km/h — под прага за приближаване; готов за изскачащо дете.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 38]], targetKmh: 20 },
      {
        // The BALL beat (R3 #27): the trigger fires at y ≈ 37–43 and the ball
        // rolls out FIRST — the annotation teaches the read before the child.
        kind: "annotation",
        textBg: "Топка се търкаля на платното — това е предупреждение: след топката тича дете!",
      },
      { kind: "drive", points: [[X_LANE, 38], [X_LANE, 46]], targetKmh: 20 },
      {
        kind: "annotation",
        textBg: "Дете изтичва след топка си на пътеката! Реагирай веднага — спирачка, без да завиваш.",
      },
      {
        // Firm, planned stop 6 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 46], [X_LANE, Y_ZEBRA - 6]],
        targetKmh: 20,
      },
      // Wait the child out — the 2.6 m/s runner clears the carriageway in ~7 s.
      { kind: "pause", sec: 8, brake: true },
      { kind: "annotation", textBg: "Изчакай детето да освободи цялото платно — не потегляй под носа му." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Премини спокойно едва когато пътеката е свободна." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6], [X_LANE, 106], [X_LANE, 120]],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: караше бавно, реагира навреме и пропусна изтичалото дете." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде бързо приближаване" (PEDESTRIAN_CROSSING_TOO_FAST)
// ---------------------------------------------------------------------------

export function scCrossingChildBallMistakeTooFastScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: колата задържа 38 км/ч, макар детето вече да е на пътеката.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 38 km/h (legal in the 40 zone, but too fast for an occupied
      // crossing) through the zone entry — over a second of „без готовност" is
      // the graded fault, regardless of the legal limit. Held to y = 66 (was
      // 60 pre-ball): the child now enters the road ~0.5 s later (the ball
      // leads — probed occupancy at car y ≈ 54), so the fast-while-occupied
      // window needs the longer hold to clear crossingTooFastSustainSec (1 s).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 66]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Чак сега спирачка — късно за спокойно спиране." },
      {
        // The late HARD brake (12 → the ~8.4 m/s² envelope) still stops ~4 m
        // short of the line — ONE fault: braking inside an occupied crossing
        // zone is a CAUSED stop (s.crossing != null), so no harsh-brake code.
        kind: "drive",
        points: [[X_LANE, 66], [X_LANE, Y_ZEBRA - 4]],
        targetKmh: 5,
        maxDecelMps2: 12,
      },
      { kind: "pause", sec: 7, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_ZEBRA - 4], [X_LANE, 104]], targetKmh: 18 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Дори при законно ограничение приближаването с 38 км/ч към заета от дете пътека е опасната грешка (чл. 119).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Удар в детето" (COLLISION)
// ---------------------------------------------------------------------------

export function scCrossingChildBallMistakeCollisionScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: погледът е другаде, колата не спира при появата на детето.",
      },
      { kind: "glance", mirror: "rear" },
      // ~24 km/h, under the 30 km/h approach cap (no too-fast), no braking:
      // the car reaches the zebra as the child crosses the driving lane and
      // strikes it — the ONLY code is the authored contact (never passes the
      // line, so no not-yielded).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 58]], targetKmh: 24, stopAtEnd: false },
      { kind: "annotation", textBg: "Детето е на пътеката, а спирачка няма…" },
      { kind: "drive", points: [[X_LANE, 58], [X_LANE, Y_ZEBRA - 2]], targetKmh: 24, stopAtEnd: false },
      // The authored consequence: the child is struck on the crossing.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "В квартална зона с деца скоростта и вниманието трябва да позволяват спиране при внезапна поява. Ударът прекратява изпита.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScCrossingChildBallTraceName = "shadow-correct" | "mistake-too-fast" | "mistake-collision";

const SCRIPTS: Record<
  ScCrossingChildBallTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scCrossingChildBallShadowScript },
  "mistake-too-fast": { kind: "mistake", script: scCrossingChildBallMistakeTooFastScript },
  "mistake-collision": { kind: "mistake", script: scCrossingChildBallMistakeCollisionScript },
};

/**
 * Record one of the three drives against a loaded pe-child-v1 document — the
 * TEMPLATE's staged child runner armed (single truth), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScCrossingChildBallDrive(
  districtRaw: unknown,
  name: ScCrossingChildBallTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_CROSSING_CHILD_BALL_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_CROSSING_CHILD_BALL.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
