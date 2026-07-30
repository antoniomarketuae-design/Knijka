/**
 * sc-vu-emergency-junction — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Линейка на кръстовището" (VU-10, ADR-006
 * stage 1c) on the committed tj-rhr-v1 district (the sc-junction-rhr
 * uncontrolled T, map REUSED), recorded with the template's OWN staged
 * emergency crosser (priorityFromRight sc-vuej-ev, profile "emergency" —
 * single truth, imported from the template). No ambient traffic (seed 7): the
 * ONLY actor is the EV crossing from the right, and the ONLY fault the rule
 * engine can grade is how the driver treats it.
 *
 * MECHANIC (the stage-1c documented choice — template header has the full
 * story): the shipped emergencyApproach adjudication arms strictly on
 * BEHIND + CLOSING, so a CROSSING EV rides the existing junction-conflict
 * machinery instead — the runtime's own right-hand-rule tracker adjudicates
 * the staged EV like any vehicle from the right. Grading is therefore the
 * shipped junction pair:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (stopped short of the
 *     core on the siren, let the EV flash through, then turned left);
 *   - „Навлизане пред линейката" grades EXACTLY FAILED_TO_YIELD (constant-
 *     speed barge across the EV's path — the RHR tracker convicts);
 *   - „Надбягване със сирената" grades EXACTLY FAILED_TO_YIELD (heard it,
 *     accelerated to beat it — same code, distinct coaching story).
 *
 * Geometry pinned to content/world/tj-rhr-v1.json (the sc-junction-rhr
 * numbers): drawn lane centers ±4.0625 m, spawn tj-spawn-south (4.06, −105)
 * heading north, junction node (0, 0), RHR conviction core 18 m, junction
 * area 40 m — the shadow yields at y = −19.5 (outside the core, inside the
 * area where the tracker latches the yield).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_EMERGENCY_JUNCTION } from "../lessons/scenario/templates-vru";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_EMERGENCY_JUNCTION_ID = "sc-vu-emergency-junction";

/** Drawn lane-center offset on tj-rhr-v1, m. */
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

/** Stem approach: spawn → right-lane cruise toward the junction. */
const APPROACH: Array<[number, number]> = [
  [LANE, -105],
  [LANE, -34],
];

/** Left turn stem → west arm: R = 18 quarter arc, center (−13.94, −13.94). */
const LEFT_TURN: Array<[number, number]> = [
  [LANE, -13.94],
  ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — siren heard, stop short, let it cross
// ---------------------------------------------------------------------------

export function scVuEmergencyJunctionShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Приближаваме кръстовището — и в далечината вие сирена." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      { kind: "annotation", textBg: "Синя лампа отдясно: линейка със специален режим. Тя минава първа — винаги (чл. 91)." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Ease to the yield point OUTSIDE the 18 m conviction core.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -19.5],
        ],
        targetKmh: 10,
      },
      { kind: "annotation", textBg: "Спираме преди кръстовището и я пропускаме да премине изцяло." },
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Линейката премина, пътят е чист — завиваме наляво уверено." },
      {
        kind: "drive",
        points: [
          [LANE, -19.5],
          ...LEFT_TURN,
          [-30, LANE],
          [-55, LANE],
        ],
        targetKmh: 16,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: направи път на линейката, без паника и без навлизане в коридора ѝ." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Навлизане пред линейката" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scVuEmergencyJunctionMistakeBargeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: сирената вие, а скоростта изобщо не пада." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      { kind: "indicator", setting: "left" },
      {
        // Constant-speed barge straight through the core while the EV is
        // inbound from the right — the RHR tracker convicts (FAILED_TO_YIELD).
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
        textBg: "Линейката трябваше да мине първа — навлизането пред автомобил със специален режим е отнето предимство (чл. 91).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Надбягване със сирената" (FAILED_TO_YIELD)
//
// A DISTINCT second way to refuse the duty: where demo 1 never registers the
// siren, this driver HEARS it, decides „ще мина преди нея" and accelerates
// into the box. Same graded code (the junction machinery convicts the same
// refusal), the coaching story is "при сирена се чака, не се спринтира".
// ---------------------------------------------------------------------------

export function scVuEmergencyJunctionMistakeRaceScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: сирената е чута… и водачът решава да я изпревари." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "„Ще мина преди нея“ — газта се натиска точно когато трябва спирачка." },
      {
        // The sprint: accelerating through the core across the EV's path.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -13.94],
          ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
          [-30, LANE],
          [-52, LANE],
        ],
        targetKmh: 26,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Секундата „печалба“ кара линейката да спира заради теб. При сигнал от специален режим се чака (чл. 91).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuEmergencyJunctionTraceName = "shadow-correct" | "mistake-barge" | "mistake-race";

const SCRIPTS: Record<
  ScVuEmergencyJunctionTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVuEmergencyJunctionShadowScript },
  "mistake-barge": { kind: "mistake", script: scVuEmergencyJunctionMistakeBargeScript },
  "mistake-race": { kind: "mistake", script: scVuEmergencyJunctionMistakeRaceScript },
};

/**
 * Record one of the three drives against a loaded tj-rhr-v1 document — the
 * TEMPLATE's staged emergency crosser armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScVuEmergencyJunctionDrive(
  districtRaw: unknown,
  name: ScVuEmergencyJunctionTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_EMERGENCY_JUNCTION_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_EMERGENCY_JUNCTION.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
