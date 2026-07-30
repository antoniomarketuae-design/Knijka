/**
 * scJunctions3 — the authored drives (doc 76 §5/§9) for sc-junction-left („Ляв
 * завой от Б2 през пътя с предимство", JU-04 applied to the LEFT turn) on the
 * committed tj-emerge-v1 district (REUSED from sc-junction-gap):
 *
 *   sc-junction-left  tj-emerge-v1  shadow + cut-gap + creep-out
 *
 * The scripts are the SOURCE of the committed traces under
 * content/traces/sc-junction-left/. The trace-gate test (sc-ju3-traces) replays
 * exactly these through the production stack (runtime + traffic + scenario
 * director + rules) and asserts the §5 shadow gate (ZERO violations + the
 * yielded proof) and the §9 stage-5 code asserts (each mistake grades EXACTLY
 * FAILED_TO_YIELD).
 *
 * Geometry pinned to tj-emerge-v1 (battery: tj-junctions2-districts):
 *   - drawn lane centers at ±4.0625 m off the road centerline;
 *   - the Б2 line on the 100 m stem sits 27.725 m from the node (y = −27.725),
 *     stem spawn at y = −85 (minorArmM 100).
 *
 * Grading site (ONE adjudicator, as the shipped four do): the GIVE-WAY
 * conflictNear at the Б2 line (FAILED_TO_YIELD). A full stop earns
 * FULL_STOP_AT_STOP_SIGN and the runner emits the give-way yielded commendation
 * on a clean pass; the two mistakes stop fully (no STOP_SIGN_NO_FULL_STOP) and
 * emerge across the priority car's lane.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_JUNCTION_LEFT } from "../lessons/scenario/templates-junctions2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_JUNCTION_LEFT_ID = "sc-junction-left";

/** Drawn lane-center offset on every junction map, m. */
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

/** Stem approach: spawn → right-lane cruise toward the Б2 line. */
const LEFT_APPROACH: Array<[number, number]> = [
  [LANE, -85],
  [LANE, -45],
];

/** Left turn stem → west arm: R = 18 quarter arc, center (−13.94, −13.94). */
const LEFT_TURN: Array<[number, number]> = [
  [LANE, -13.94],
  ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
  [-30, LANE],
  [-55, LANE],
];

function scJunctionLeftShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е път с предимство и знак Б2 „Спри!“ — ще завиваш наляво, през насрещната лента." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: LEFT_APPROACH, targetKmh: 25 },
      { kind: "annotation", textBg: "Ляв мигач и плавно към стоп-линията." },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -29.2],
        ],
        targetKmh: 12,
      },
      { kind: "annotation", textBg: "Пълно спиране преди линията — и преценяваме идващия по главния път в двете посоки." },
      { kind: "pause", sec: 6.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Колата с предимство премина, пътят е чист — завиваме наляво." },
      {
        kind: "drive",
        points: [[LANE, -29.2], ...LEFT_TURN],
        targetKmh: 15,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спря докрай, изчака интервала и завя наляво през чистия път — точно това гледа изпитващият." },
    ],
  };
}

function scJunctionLeftMistakeCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „ще успея“: спирам, но завивам наляво пред приближаващата отдясно кола." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: LEFT_APPROACH, targetKmh: 25 },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -29.2],
        ],
        targetKmh: 12,
      },
      { kind: "annotation", textBg: "Кратко спиране — и веднага газ наляво, докато колата с предимство е още в кръстовището." },
      { kind: "pause", sec: 1.6, brake: true },
      { kind: "glance", mirror: "right" },
      {
        // Emerge left at speed while the priority car is still in the conflict box.
        kind: "drive",
        points: [[LANE, -29.2], ...LEFT_TURN],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Колата с предимство трябваше да намали заради теб. При ляв завой пресичаш нейната лента — интервалът е всичко.",
      },
    ],
  };
}

function scJunctionLeftMistakeCreepScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „пълзящо навлизане“: спирам, после запълзявам в пътя с предимство." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: LEFT_APPROACH, targetKmh: 25 },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -29.2],
        ],
        targetKmh: 12,
      },
      { kind: "annotation", textBg: "Спрях, но носът тръгва навътре, докато колата с предимство приближава." },
      { kind: "pause", sec: 1.6, brake: true },
      { kind: "glance", mirror: "right" },
      {
        // Creep the nose across the line into the box while the car is present.
        kind: "drive",
        points: [
          [LANE, -29.2],
          [LANE, -18],
        ],
        targetKmh: 4,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: [
          [LANE, -18],
          [LANE, -13.94],
          ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
          [-30, LANE],
        ],
        targetKmh: 12,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Бавното навлизане също отне предимството — важна е позицията на колата, не скоростта ѝ.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScJunctionLeftTraceName = "shadow-correct" | "mistake-cut-gap" | "mistake-creep-out";

const SCRIPTS: Record<
  ScJunctionLeftTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scJunctionLeftShadowScript },
  "mistake-cut-gap": { kind: "mistake", script: scJunctionLeftMistakeCutScript },
  "mistake-creep-out": { kind: "mistake", script: scJunctionLeftMistakeCreepScript },
};

/**
 * Record one sc-junction-left drive against its loaded tj-emerge-v1 document —
 * staged events from the template. Deterministic: same district → same trace
 * (seed 7, the house recording seed).
 */
export function recordScJunctionLeftDrive(
  districtRaw: unknown,
  name: ScJunctionLeftTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_JUNCTION_LEFT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_JUNCTION_LEFT.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
