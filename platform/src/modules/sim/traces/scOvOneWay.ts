/**
 * sc-ov-oneway — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Еднопосочна улица" (OV-13) on the committed ov-oneway-v1
 * district — since the founder R3 redesign (doc 62 #47) a T-JUNCTION whose
 * cross street is one-way EAST: the drill is CHOOSING the legal entry. No
 * staged actors, ambient traffic ZERO (seed 7): the ONLY thing the rule
 * engine can grade is the driver's own direction of travel.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations (approach, right indicator, RIGHT turn WITH the
 *     eastbound flow, cruise to the end of the east arm);
 *   - „Ляв завой срещу еднопосочната": the LEFT turn — signalled properly,
 *     chosen wrongly — enters the west arm AGAINST the flow and grades
 *     EXACTLY WRONG_WAY;
 *   - „«Само няколко метра» в грешната посока": the same left entry driven
 *     only ~25 m before stopping still grades EXACTLY WRONG_WAY.
 *
 * Geometry pinned to content/world/ov-oneway-v1.json: two-way approach stem on
 * x = 0 (northbound lane center x = 4.06, spawn ov-ow-spawn-entry (4.06, 15));
 * the one-way bar on y = 200 flows WEST → EAST (arms ±140 m, single lane
 * centered on the polyline). М10 „right-only" arrows are painted in the
 * approach lane before the mouth (meta.scenario.laneArrows) — the world's own
 * statement of the legal entry.
 *
 * Rule envelope the scripts respect (rules/engine.ts §4, cfg defaults):
 * WRONG_WAY fires after wrongWaySustainSec = 1.5 s while moving forward
 * against a one-way's flow (the runtime sets tick.wrongWay when the heading
 * opposes the edge tangent). The shadow only ever travels east on the bar
 * (wrongWay never true); each mistake heads west on it for well over the
 * sustain. The turns run ~18–20 km/h so the junction transit stays far under
 * the 3 s lane-keep sustain — no positional code can leak from the arc.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_ONEWAY } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_ONEWAY_ID = "sc-ov-oneway";

/** Approach (stem) northbound lane center of ov-oneway-v1. */
const X_STEM = 4.06;
/** The one-way bar's lane center line (y of the polyline). */
const BAR_Y = 200;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — read the arrows, turn RIGHT (east)
// ---------------------------------------------------------------------------

export function scOvOneWayShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е Т-кръстовище с еднопосочна улица — стрелките на платното казват: движението ѝ е надясно, на изток." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_STEM, 15], [X_STEM, 120]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Чети входа отдалеч: посоката на еднопосочната се избира ПРЕДИ кръстовището, не в него." },
      { kind: "drive", points: [[X_STEM, 120], [X_STEM, 172]], targetKmh: 26, stopAtEnd: false },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "annotation", textBg: "Десен мигач — влизаме по посоката на движението." },
      // The RIGHT turn: stem lane center onto the eastbound bar lane center.
      {
        kind: "drive",
        points: [[X_STEM, 172], [X_STEM, 186], [5.0, 193.5], [7.6, 197.6], [11.5, 199.6], [17, BAR_Y], [26, BAR_Y]],
        targetKmh: 19,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "В еднопосочната, по посоката ѝ — насрещни тук няма как да има." },
      { kind: "drive", points: [[26, BAR_Y], [80, BAR_Y]], targetKmh: 35, stopAtEnd: false },
      { kind: "drive", points: [[80, BAR_Y], [128, BAR_Y]], targetKmh: 35 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: правилният вход е избран преди завоя — по стрелките, по посоката." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Ляв завой срещу еднопосочната" (WRONG_WAY)
// ---------------------------------------------------------------------------

export function scOvOneWayMistakeWrongWayScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът завива НАЛЯВО — срещу посоката, която стрелките показваха от петдесет метра." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_STEM, 15], [X_STEM, 120]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[X_STEM, 120], [X_STEM, 172]], targetKmh: 26, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // The LEFT turn — signalled by the book, chosen against the one-way.
      {
        kind: "drive",
        points: [[X_STEM, 172], [X_STEM, 186], [3.0, 193.5], [0.2, 197.6], [-4.0, 199.6], [-10, BAR_Y], [-20, BAR_Y]],
        targetKmh: 19,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Всеки метър тук е срещу насрещните — те карат с очакването, че никой няма да се появи." },
      // Deep against the flow — well over the 1.5 s wrong-way sustain.
      { kind: "drive", points: [[-20, BAR_Y], [-80, BAR_Y]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Движение срещу еднопосочна е опасна грешка и прекратява изпита — входът се чете преди завоя." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „«Само няколко метра» в грешната посока" (WRONG_WAY)
// ---------------------------------------------------------------------------

export function scOvOneWayMistakeWrongWayShortScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „само да спра ей там“ — ляв завой и двайсетина метра срещу посоката." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_STEM, 15], [X_STEM, 125]], targetKmh: 38, stopAtEnd: false },
      { kind: "drive", points: [[X_STEM, 125], [X_STEM, 172]], targetKmh: 24, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [[X_STEM, 172], [X_STEM, 186], [3.0, 193.5], [0.2, 197.6], [-4.0, 199.6], [-10, BAR_Y]],
        targetKmh: 18,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Кратко не значи безопасно: насрещният иззад завоя не получава нито метър предупреждение." },
      // ~25 m against the flow at ~18 km/h ≈ 5 s — far over the 1.5 s sustain.
      { kind: "drive", points: [[-10, BAR_Y], [-34, BAR_Y]], targetKmh: 18 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "И няколко метра срещу еднопосочното са същата опасна грешка — по еднопосочна се влиза само по посоката ѝ." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvOneWayTraceName =
  | "shadow-correct"
  | "mistake-wrong-way"
  | "mistake-wrong-way-short";

const SCRIPTS: Record<
  ScOvOneWayTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvOneWayShadowScript },
  "mistake-wrong-way": { kind: "mistake", script: scOvOneWayMistakeWrongWayScript },
  "mistake-wrong-way-short": { kind: "mistake", script: scOvOneWayMistakeWrongWayShortScript },
};

/**
 * Record one of the three drives against a loaded ov-oneway-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScOvOneWayDrive(
  districtRaw: unknown,
  name: ScOvOneWayTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_ONEWAY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_ONEWAY.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
