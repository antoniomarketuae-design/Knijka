/**
 * scSignalController — the JU-18 регулировчик authored drives (doc 76 §5/§9)
 * for sc-signal-controller on the committed sx-v1 district (ADR-006 stage 1d).
 *
 * The capability under test: a traffic CONTROLLER posted at sx-n-c while the
 * LAMPS KEEP RUNNING — the staged trafficController event arms the cluster
 * (mode "controlled" + authored permission timetable + lamp-phase pin)
 * through the scenario director's SignalDirectorPort at session start, so:
 *
 *   - the ns lamps show GREEN for session time t ∈ [5, 25) of each 50 s cycle
 *     (signalOffsetSec 45 — every crossing/arrival below lands inside it);
 *   - the controller HALTS the ns axis (the player's south-stem approach)
 *     until the single authored flip at t = 30, then PERMITS it — by which
 *     time the lamps have cycled to RED.
 *
 * The hierarchy is therefore proven in BOTH directions by the recordings:
 *   - MISTAKES cross the stop line ON A GREEN LAMP while halted → the
 *     stopLineCrossed event carries lightState "green" + controller "halt"
 *     and grades EXACTLY CONTROLLER_SIGNAL_VIOLATED (green does not acquit);
 *   - the SHADOW waits at the line through the green, then proceeds after the
 *     flip ON A RED LAMP with controller "proceed" → ZERO violations (red
 *     does not convict). Сигналите на регулировчика са над светофара
 *     (ЗДвП чл. 7).
 *
 * Geometry pinned to sx-v1 (battery sx-district.test.ts): single-node cluster
 * sx-n-c at the origin; south-approach stop line 27.7 m south of the node
 * (sx-e-s@92.3, group "ns"); drawn lane centers at ±4.0625 m; south spawn at
 * (0, −105).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SIGNAL_CONTROLLER } from "../lessons/scenario/templates-signals";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SIGNAL_CONTROLLER_ID = "sc-signal-controller";

/** Drawn lane-center offset on sx-v1, m. */
const LANE = 4.0625;

/** Stem approach shared by every drive: south spawn → right-lane cruise. */
const APPROACH: Array<[number, number]> = [
  [0, -105],
  [0, -103],
  [LANE, -92],
  [LANE, -38],
];

/** Straight run through the box and up the north arm (right lane). */
const STRAIGHT_NORTH: Array<[number, number]> = [
  [LANE, 0],
  [LANE, 30],
  [LANE, 48],
];

function shadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "На кръстовището напред стои РЕГУЛИРОВЧИК — неговите сигнали са над светофара и над знаците.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 20 },
      {
        kind: "annotation",
        textBg:
          "Светофарът свети ЗЕЛЕНО, но регулировчикът спира нашето направление — зеленото не разрешава нищо срещу неговия сигнал.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Ease to a rest just before the 27.7 m stop line.
        kind: "drive",
        points: [
          [LANE, -38],
          [LANE, -31],
        ],
        targetKmh: 8,
      },
      {
        kind: "annotation",
        textBg: "Спираме преди линията и чакаме — командва човекът, не лампите.",
      },
      // Hold through the authored flip at t = 30 (arrival lands ~t 16–20 s).
      { kind: "pause", sec: 16.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg:
          "Регулировчикът разрешава нашата посока — потегляме, макар светофарът вече да е ЧЕРВЕН: неговият сигнал е по-силният.",
      },
      {
        kind: "drive",
        points: [
          [LANE, -31],
          ...STRAIGHT_NORTH,
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Йерархията на сигналите: първо регулировчикът, после светофарът, после знаците — в двете посоки.",
      },
    ],
  };
}

function mistakeRunScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Грешката: гледат се само лампите — „зелено е, давам газ“, а регулировчикът спира точно нашето направление.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      {
        // Constant-speed run across the line ON THE GREEN LAMP while the
        // controller halts the approach — the hierarchy conviction.
        kind: "drive",
        points: [
          [LANE, -38],
          ...STRAIGHT_NORTH,
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Зеленият светофар не оправдава нищо: регулировчикът спираше посоката ни, а неговият сигнал е над светофара.",
      },
    ],
  };
}

function mistakeCreepScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Грешката „ще припълзя“: уж намалявам, но продължавам бавно през линията, докато регулировчикът още ни спира.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      { kind: "drive", points: [[LANE, -38], [LANE, -32]], targetKmh: 10 },
      {
        // Creep across the stop line at walking pace mid-halt — slow is still
        // a crossing against the controller's signal.
        kind: "drive",
        points: [
          [LANE, -32],
          [LANE, -18],
        ],
        targetKmh: 6,
      },
      {
        kind: "drive",
        points: [
          [LANE, -18],
          ...STRAIGHT_NORTH,
        ],
        targetKmh: 15,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спрян си само ПРЕДИ линията: бавното преминаване е също преминаване срещу сигнала на регулировчика.",
      },
    ],
  };
}

export type ScSignalControllerTraceName = "shadow-correct" | "mistake-run" | "mistake-creep";

interface ControllerRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

const DRIVES: Record<ScSignalControllerTraceName, ControllerRecordingSpec> = {
  "shadow-correct": { kind: "shadow", script: shadowScript },
  "mistake-run": { kind: "mistake", script: mistakeRunScript },
  "mistake-creep": { kind: "mistake", script: mistakeCreepScript },
};

/** Staged events exactly as the compiled lesson runs them (the template's). */
const STAGED: StagedEventSpec[] = [...(SC_SIGNAL_CONTROLLER.staged ?? [])];

/** Trace names in committed order (shadow first). */
export function scSignalControllerTraceNames(): ScSignalControllerTraceName[] {
  return Object.keys(DRIVES) as ScSignalControllerTraceName[];
}

/**
 * Record one регулировчик drive against the loaded sx-v1 document. The whole
 * mechanic (cluster mode + timetable + lamp pin + figure) is armed by the
 * staged trafficController event through the director's signal port — no
 * recorder option needed (the session-start dial lives in the spec).
 * Deterministic: same district → same trace (seed 7, the house recording seed).
 */
export function recordScSignalControllerDrive(
  districtRaw: unknown,
  name: ScSignalControllerTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const rec = DRIVES[name];
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: SC_SIGNAL_CONTROLLER_ID,
    kind: rec.kind,
    seed: 7,
    stagedEvents: STAGED,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
