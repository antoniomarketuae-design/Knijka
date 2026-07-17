/**
 * scJxEqualLeft — the wave-1 authored drives (doc 76 §5/§9) for the equal
 * crossroads left turn, on the committed generated district:
 *
 *   sc-jx-equal-left  jx-equal-v1  shadow + cut-right + cut-oncoming
 *
 * The scripts are the SOURCE of the committed traces under
 * content/traces/sc-jx-equal-left/ — the trace-gate test
 * (sc-jx-equal-left-traces) replays exactly these through the production stack
 * (runtime + traffic + scenario director + rules) and asserts the §5 shadow
 * gate (ZERO violations + BOTH yield proofs) and the §9 stage-5 code asserts
 * (each mistake grades EXACTLY its authored codeRefs).
 *
 * Geometry pinned to the generated district (battery proves the numbers):
 *   - drawn lane centers at ±4.0625 m off the road centerline;
 *   - four equal 130 m arms, uncontrolled at jx-n-c (degree 4); stem spawn at
 *     y = −115;
 *   - the 18 m conviction core around the node (RHR_CORE_RADIUS_M). The shadow
 *     waits at y = −19.5 — hypot(4.0625, 19.5) = 19.92, OUTSIDE the core, so
 *     both waits are structurally innocent.
 *
 * Grading sites — the point of this template is that BOTH fire at ONE node,
 * sequenced:
 *   - the RIGHT-HAND-RULE tracker (east-arm car) → FAILED_TO_YIELD /
 *     YIELDED_TO_PRIORITY, and
 *   - the N1 LEFT-TURN tracker (north-arm oncoming) → the same vocabulary.
 * The bearing gates keep them from seeing each other's car (battery:
 * "the two adjudicators are DISJOINT"), and the runners' different trigger
 * conditions keep them from firing together (templates-junctions3 header).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_JX_EQUAL_LEFT } from "../lessons/scenario/templates-junctions3";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

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

// ---------------------------------------------------------------------------
// sc-jx-equal-left — jx-equal-v1 (uncontrolled X; spawn (0, −115))
// ---------------------------------------------------------------------------

export const SC_JX_EQUAL_LEFT_ID = "sc-jx-equal-left";

/** South-arm approach: spawn → right-lane cruise toward the junction. */
const EQ_APPROACH: Array<[number, number]> = [
  [0, -115],
  [0, -113],
  [LANE, -100],
  [LANE, -34],
];

/** Left turn south arm → west arm: R = 18 quarter arc, center (−13.94, −13.94). */
const EQ_LEFT_TURN: Array<[number, number]> = [
  [LANE, -13.94],
  ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
];

function scJxEqualLeftShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Кръстовище без знаци и без светофар — четирите улици са равнозначни. Значи: правилото на дясното.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: EQ_APPROACH, targetKmh: 20 },
      { kind: "annotation", textBg: "Ляв мигач и се оглеждаме и в двете посоки — левият завой пресича насрещното платно." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Roll to the yield pose at yield speed (<= 8 km/h) so the right-hand
        // conflict is met ALREADY slowing — outside the 18 m core.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -19.5],
        ],
        targetKmh: 7,
      },
      { kind: "annotation", textBg: "Отдясно идва кола. Няма знак, който да ѝ отнеме предимството — спираме и я пропускаме." },
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg: "Десният мина — но НЕ тръгваме: отсреща идва кола направо, а завиващият наляво я пропуска.",
      },
      { kind: "pause", sec: 11.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Сега и насрещният премина. Пътят е чист — завиваме наляво." },
      {
        // 20 km/h through the R = 18 arc, not less: the TurnDetector needs 55°
        // inside its 3 s window (turns.ts), and a slower arc sweeps them in
        // ~3.9 s — no turnStarted, so the N1 tracker never adjudicates and the
        // yield proof silently vanishes. Measured: 16 km/h = no commit.
        kind: "drive",
        points: [
          [LANE, -19.5],
          ...EQ_LEFT_TURN,
          [-30, LANE],
          [-58, LANE],
        ],
        targetKmh: 20,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Двама пропуснати, един завой. На равнозначно кръстовище чакаш не първата кола, а чистия път.",
      },
    ],
  };
}

function scJxEqualLeftMistakeCutRightScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „няма знак, значи мога“: колата отдясно се вижда — и въпреки това влизаме." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: EQ_APPROACH, targetKmh: 22 },
      { kind: "indicator", setting: "left" },
      {
        // Constant-speed barge through the core while the car is inbound from
        // the right — the RHR tracker convicts (FAILED_TO_YIELD). The oncoming
        // actor is still held at 70 m (its runner only releases on a yield or a
        // commit), so exactly ONE adjudicator has anything to say here.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -13.94],
          ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
          [-30, LANE],
          [-52, LANE],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Колата отдясно трябваше да намали заради теб. Липсата на знак не дава предимство — тя го дава на десния.",
      },
    ],
  };
}

function scJxEqualLeftMistakeCutOncomingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тук десният е пропуснат коректно — и точно това приспива водача." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: EQ_APPROACH, targetKmh: 20 },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "right" },
      {
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -19.5],
        ],
        targetKmh: 7,
      },
      { kind: "annotation", textBg: "Пропускаме десния — дотук всичко е по учебник." },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg: "Десният мина — и кракът тръгва към газта, без да провери насрещното.",
      },
      // The whole demo hangs on this pause. The N1 tracker convicts only when
      // the turn COMMITS into a tight gap while the player is MOVING (> 8 km/h,
      // worldRuntime LEFT_TURN_CONVICT_GAP_SEC = 2.0) — a waiter reads every
      // passing nose as "tight" and is innocent by definition. Launching here
      // puts the commit ~2 s before the oncoming reaches the node.
      { kind: "pause", sec: 2.8, brake: true },
      {
        kind: "drive",
        points: [
          [LANE, -19.5],
          ...EQ_LEFT_TURN,
          [-18, LANE],
        ],
        targetKmh: 20,
        stopAtEnd: false,
      },
      // The authored consequence: the oncoming strikes the crossing flank.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "Изчакването не свършва с първата кола. Завиващият наляво пропуска насрещния направо — винаги.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry — one deterministic function)
// ---------------------------------------------------------------------------

export type ScJxEqualLeftTraceName = "shadow-correct" | "mistake-cut-right" | "mistake-cut-oncoming";

interface JxEqualRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

const STAGED: StagedEventSpec[] = [...(SC_JX_EQUAL_LEFT.staged ?? [])];

export const SC_JX_EQUAL_LEFT_DISTRICT_ID = "jx-equal-v1";

export const SC_JX_EQUAL_LEFT_RECORDINGS: Record<ScJxEqualLeftTraceName, JxEqualRecordingSpec> = {
  "shadow-correct": { kind: "shadow", script: scJxEqualLeftShadowScript },
  "mistake-cut-right": { kind: "mistake", script: scJxEqualLeftMistakeCutRightScript },
  "mistake-cut-oncoming": { kind: "mistake", script: scJxEqualLeftMistakeCutOncomingScript },
};

/** Trace names in committed order (shadow first). */
export function scJxEqualLeftTraceNames(): ScJxEqualLeftTraceName[] {
  return Object.keys(SC_JX_EQUAL_LEFT_RECORDINGS) as ScJxEqualLeftTraceName[];
}

/**
 * Record one wave-1 drive against ITS loaded district document — staged events
 * from the template (the same set compiled lessons run). Deterministic: same
 * district → same trace (seed 7, the house recording seed).
 */
export function recordScJxEqualLeftDrive(
  districtRaw: unknown,
  name: ScJxEqualLeftTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const rec = SC_JX_EQUAL_LEFT_RECORDINGS[name];
  if (!rec) throw new Error(`recordScJxEqualLeftDrive: no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: SC_JX_EQUAL_LEFT_ID,
    kind: rec.kind,
    seed: 7,
    stagedEvents: STAGED,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
