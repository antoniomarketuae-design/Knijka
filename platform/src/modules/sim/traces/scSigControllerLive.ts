/**
 * scSigControllerLive — the JU-18 регулировчик authored drives (doc 76 §5/§9)
 * for sc-sig-controller-live on the committed sx-v1 district.
 *
 * The capability under test is the INVERTED half of the hierarchy: a controller
 * posted at sx-n-c while the LAMPS KEEP RUNNING, with the permission timetable
 * arranged so the officer OPENS the player's axis first and closes it later
 * (haltedGroup "ew" + flipAtSec 26 — the mirror of sc-signal-controller). Armed
 * through the scenario director's SignalDirectorPort at session start:
 *
 *   - signalOffsetSec 23 → the ns lamps are RED for session time t ∈ [0, 26),
 *     GREEN for t ∈ [27, 47), yellow to 50, RED again after;
 *   - the controller PERMITS the ns axis until the single authored flip at
 *     t = 26, then HALTS it — precisely as the lamps turn green.
 *
 * So the recordings prove ЗДвП чл. 7 from the side a driver never volunteers:
 *   - the SHADOW crosses at t ≈ 13 on a RED LAMP with controller "proceed" →
 *     ZERO violations (червеното не осъжда срещу разрешението на регулировчика);
 *   - mistake-wait-for-green sits out the red, leaves on the GREEN lamp at
 *     t ≈ 29 — by then halted → EXACTLY CONTROLLER_SIGNAL_VIOLATED (зеленото не
 *     разрешава нищо срещу регулировчика);
 *   - mistake-refuse-then-creep refuses the wave, dithers through the whole
 *     green and creeps over at t ≈ 53 on a RED lamp — still the CONTROLLER code,
 *     never RED_LIGHT_CROSSED: the permission REPLACES the lamp grading in both
 *     directions (rules/engine.ts).
 *
 * Geometry pinned to sx-v1 (battery sx-district.test.ts): single-node cluster
 * sx-n-c at the origin; south-approach stop line 27.725 m south of the node
 * (sx-e-s@92.3, group "ns"); drawn lane centers at ±4.0625 m; south spawn at
 * (0, −105). Every rest pose below sits ≥ 5 m short of the paint — the
 * STOP_LINE_OVERSHOOT window is 1.2 m and this drill's surfaced signal state is
 * never green, so its lawful-presence latch can never disarm it.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SIG_CONTROLLER_LIVE } from "../lessons/scenario/templates-signals2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SIG_CONTROLLER_LIVE_ID = "sc-sig-controller-live";

/** Drawn lane-center offset on sx-v1, m. */
const LANE = 4.0625;

/** Stem approach shared by every drive: south spawn → right-lane cruise. */
const APPROACH: Array<[number, number]> = [
  [0, -105],
  [0, -103],
  [LANE, -92],
  [LANE, -40],
];

/** Through the box and up the north arm (right lane) — the exit gate at y = 45. */
const STRAIGHT_NORTH: Array<[number, number]> = [
  [LANE, 0],
  [LANE, 30],
  [LANE, 48],
];

/** Rest pose of both mistake demos: 5.275 m short of the 27.725 m stop line. */
const HOLD_Y = -33;

function shadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Светофарът работи, но на кръстовището стои РЕГУЛИРОВЧИК — от този момент важи само неговият сигнал.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 26 },
      {
        kind: "annotation",
        textBg: "Нашата лампа е ЧЕРВЕНА — а регулировчикът е отворил точно нашата посока.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Ease to a reading pace — slow enough to have actually looked at the
        // officer (the sc-sctl-read gate), fast enough that the runner never
        // latches a hold: CONTROLLER_HOLD_KMH is 4 and this never drops to it,
        // so the outcome reads "clear" (waved through), not "yielded".
        kind: "drive",
        points: [
          [LANE, -40],
          [LANE, -34],
        ],
        targetKmh: 12,
      },
      {
        kind: "annotation",
        textBg:
          "Минаваме по негово разрешение — през червеното. Йерархията: регулировчик над светофара (ЗДвП чл. 7).",
      },
      {
        kind: "drive",
        points: [[LANE, -34], ...STRAIGHT_NORTH],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Червената лампа не осъжда, когато регулировчикът разрешава — и зеленото няма да оправдае нищо, когато той спира.",
      },
    ],
  };
}

function mistakeWaitForGreenScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Грешката: „червено е — чакам зелено“, макар регулировчикът вече да е отворил нашата посока.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 26 },
      {
        kind: "drive",
        points: [
          [LANE, -40],
          [LANE, HOLD_Y],
        ],
        targetKmh: 12,
      },
      {
        kind: "annotation",
        textBg: "Пропуснатият момент: разрешението беше дадено, а колата стои и гледа лампата.",
      },
      // Wait out the red. The authored flip lands at t = 26 and the lamps turn
      // green at t = 27 — so this pause ends AFTER the direction was closed.
      { kind: "pause", sec: 14.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Зелено! — но регулировчикът вече пуска напречното направление. Тръгването сега е срещу неговия сигнал.",
      },
      {
        kind: "drive",
        points: [[LANE, HOLD_Y], ...STRAIGHT_NORTH],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Зеленото не е разрешение при регулировчик — то е лампа, която в този момент не командва никого.",
      },
    ],
  };
}

function mistakeRefuseThenCreepScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: регулировчикът маха да минем, но „не мога на червено“ — и колата спира.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 26 },
      {
        kind: "drive",
        points: [
          [LANE, -40],
          [LANE, HOLD_Y],
        ],
        targetKmh: 12,
      },
      {
        kind: "annotation",
        textBg: "Отказът: сигналът на регулировчика е изпълним само сега — а колата не тръгва.",
      },
      // Dither through the flip (t = 26) AND the entire green (t ∈ [27, 47)):
      // the moment is gone and it never comes back — the schedule carries one
      // flip, exactly like an officer who has moved on to the other axis.
      { kind: "pause", sec: 37.15, brake: true },
      {
        kind: "annotation",
        textBg:
          "Засечката: зеленото дойде и си отиде. Сега забраняват И лампата, И регулировчикът — а колата тръгва точно сега.",
      },
      {
        kind: "drive",
        points: [
          [LANE, HOLD_Y],
          [LANE, -18],
        ],
        targetKmh: 6,
      },
      {
        kind: "drive",
        points: [[LANE, -18], ...STRAIGHT_NORTH],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Отсъденото не е „преминаване на червено“, а неподчинение на регулировчика: при него лампата не се брои — нито за, нито против.",
      },
    ],
  };
}

export type ScSigControllerLiveTraceName =
  | "shadow-correct"
  | "mistake-wait-for-green"
  | "mistake-refuse-then-creep";

interface ControllerRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

const DRIVES: Record<ScSigControllerLiveTraceName, ControllerRecordingSpec> = {
  "shadow-correct": { kind: "shadow", script: shadowScript },
  "mistake-wait-for-green": { kind: "mistake", script: mistakeWaitForGreenScript },
  "mistake-refuse-then-creep": { kind: "mistake", script: mistakeRefuseThenCreepScript },
};

/** Staged events exactly as the compiled lesson runs them (the template's). */
const STAGED: StagedEventSpec[] = [...(SC_SIG_CONTROLLER_LIVE.staged ?? [])];

/** Trace names in committed order (shadow first). */
export function scSigControllerLiveTraceNames(): ScSigControllerLiveTraceName[] {
  return Object.keys(DRIVES) as ScSigControllerLiveTraceName[];
}

/**
 * Record one drive against the loaded sx-v1 document. The whole mechanic
 * (cluster mode + permission timetable + lamp pin + figure) is armed by the
 * staged trafficController event through the director's signal port — no
 * recorder option needed (the session-start dial lives in the spec).
 * Deterministic: same district → same trace (seed 7, the house recording seed).
 */
export function recordScSigControllerLiveDrive(
  districtRaw: unknown,
  name: ScSigControllerLiveTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const rec = DRIVES[name];
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: SC_SIG_CONTROLLER_LIVE_ID,
    kind: rec.kind,
    seed: 7,
    stagedEvents: STAGED,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
