/**
 * scSigControllerPostures — the JU-18 „Езикът на регулировчика" authored drives
 * (doc 76 §5/§9) for sc-sig-controller-postures on the committed sx-v1 district.
 *
 * The capability under test is reading the officer's POSTURE at a DARK junction:
 * a traffic CONTROLLER posted at sx-n-c with NO lamp to read (no signalOffsetSec
 * pin — the светофар is загаснал). The staged trafficController event arms the
 * cluster "controlled" + the authored posture timetable through the scenario
 * director's SignalDirectorPort at session start:
 *
 *   - haltedGroup "ns" HALTS the player's south-stem approach until the single
 *     authored flip at t = 30 (officer turned toward the player — гърди/гръб or
 *     вдигната ръка = стоп), then PERMITS it (officer side-on = премини).
 *
 * So the recordings prove ППЗДвП чл. 66 / ЗДвП чл. 7 with the posture as the
 * sole signal:
 *   - the SHADOW reads the „стоп" posture, waits at the line through the raised
 *     arm, then proceeds after the flip on the side-on profile → ZERO
 *     violations (позата разрешава, не лампа);
 *   - mistake-barge-chest never stops — it crosses the stop line while the
 *     officer faces it → EXACTLY CONTROLLER_SIGNAL_VIOLATED (гърди = стоп);
 *   - mistake-start-on-raised-arm stops correctly, then false-starts on the
 *     raised arm while still halted → STILL exactly CONTROLLER_SIGNAL_VIOLATED
 *     (вдигнатата ръка не е „тръгвай"). Both cross BEFORE the flip.
 *
 * Geometry pinned to sx-v1 (battery sx-district.test.ts): single-node cluster
 * sx-n-c at the origin; south-approach stop line 27.725 m south of the node
 * (sx-e-s@92.3, group "ns"); drawn lane centers at ±4.0625 m; south spawn at
 * (0, −105). Every rest pose below sits ≥ 3 m short of the paint — the
 * STOP_LINE_OVERSHOOT window is 1.2 m, and a halted approach's surfaced signal
 * is never green, so no lamp/hesitation code can arm.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SIG_CONTROLLER_POSTURES } from "../lessons/scenario/templates-signals2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SIG_CONTROLLER_POSTURES_ID = "sc-sig-controller-postures";

/** Drawn lane-center offset on sx-v1, m. */
const LANE = 4.0625;

/** Stem approach shared by every drive: south spawn → right-lane cruise. */
const APPROACH: Array<[number, number]> = [
  [0, -105],
  [0, -103],
  [LANE, -92],
  [LANE, -38],
];

/** Through the box and up the north arm (right lane) — exit gate at y = 45. */
const STRAIGHT_NORTH: Array<[number, number]> = [
  [LANE, 0],
  [LANE, 30],
  [LANE, 48],
];

/** Rest pose short of the 27.7 m stop line. */
const HOLD_Y = -31;

function shadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Светофарът е ЗАГАСНАЛ — движението нарежда РЕГУЛИРОВЧИК. От тук важи само неговата поза, не лампа.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 20 },
      {
        kind: "annotation",
        textBg:
          "Регулировчикът е с лице към нас — гърди към теб значи СПРИ. Спираме преди линията и четем човека.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Ease to a rest just before the 27.7 m stop line (below the runner's
        // CONTROLLER_HOLD_KMH so the „waited for the officer" credit latches).
        kind: "drive",
        points: [
          [LANE, -38],
          [LANE, HOLD_Y],
        ],
        targetKmh: 8,
      },
      {
        kind: "annotation",
        textBg:
          "Ръката му се вдига — „внимание, сменям посоките“. Вдигнатата ръка НЕ е „тръгвай“: чакаме спокойно.",
      },
      // Hold through the authored flip at t = 30 (arrival lands ~t 16–20 s).
      { kind: "pause", sec: 16.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg:
          "Обърна се със страничен профил към нас и отпусна ръце — посоката ни е свободна. Потегляме решително.",
      },
      {
        kind: "drive",
        points: [[LANE, HOLD_Y], ...STRAIGHT_NORTH],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Азбуката на регулировчика: профил = свободно, гърди/гръб = стоп, ръка нагоре = смяна на фазата.",
      },
    ],
  };
}

function mistakeBargeChestScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Грешката: „нали светофарът не работи — минавам“, а регулировчикът е с лице към нас: гърди = СПРИ.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      {
        // Constant-speed run across the stop line while the officer halts the
        // approach — the posture conviction (crosses well before the flip).
        kind: "drive",
        points: [[LANE, -38], ...STRAIGHT_NORTH],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Загасналият светофар не разрешава нищо: движението се нарежда от регулировчика, а неговата поза беше „стоп“.",
      },
    ],
  };
}

function mistakeStartOnRaisedArmScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Грешката: спираме правилно, но щом регулировчикът ВДИГНЕ ръка — потегляме, сякаш това значи „тръгвай“.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      {
        kind: "drive",
        points: [
          [LANE, -38],
          [LANE, HOLD_Y],
        ],
        targetKmh: 8,
      },
      // A correct full stop at the line — then the false start.
      { kind: "pause", sec: 3.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Ръката се вдига — и колата тръгва. Но „внимание, сменям посоките“ не е разрешение: посоката ни още е спряна.",
      },
      {
        // Start and cross the line on the raised arm, still before the flip.
        kind: "drive",
        points: [[LANE, HOLD_Y], ...STRAIGHT_NORTH],
        targetKmh: 16,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Правилното спиране не оправдава грешното тръгване: изчаква се страничният профил с отпуснати ръце.",
      },
    ],
  };
}

export type ScSigControllerPosturesTraceName =
  | "shadow-correct"
  | "mistake-barge-chest"
  | "mistake-start-on-raised-arm";

interface ControllerRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

const DRIVES: Record<ScSigControllerPosturesTraceName, ControllerRecordingSpec> = {
  "shadow-correct": { kind: "shadow", script: shadowScript },
  "mistake-barge-chest": { kind: "mistake", script: mistakeBargeChestScript },
  "mistake-start-on-raised-arm": { kind: "mistake", script: mistakeStartOnRaisedArmScript },
};

/** Staged events exactly as the compiled lesson runs them (the template's). */
const STAGED: StagedEventSpec[] = [...(SC_SIG_CONTROLLER_POSTURES.staged ?? [])];

/** Trace names in committed order (shadow first). */
export function scSigControllerPosturesTraceNames(): ScSigControllerPosturesTraceName[] {
  return Object.keys(DRIVES) as ScSigControllerPosturesTraceName[];
}

/**
 * Record one drive against the loaded sx-v1 document. The whole mechanic
 * (cluster mode + posture timetable + figure) is armed by the staged
 * trafficController event through the director's signal port — no recorder
 * option needed (the session-start dial lives in the spec). Deterministic:
 * same district → same trace (seed 7, the house recording seed).
 */
export function recordScSigControllerPosturesDrive(
  districtRaw: unknown,
  name: ScSigControllerPosturesTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const rec = DRIVES[name];
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: SC_SIG_CONTROLLER_POSTURES_ID,
    kind: rec.kind,
    seed: 7,
    stagedEvents: STAGED,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
