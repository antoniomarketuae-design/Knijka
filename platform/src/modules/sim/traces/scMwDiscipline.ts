/**
 * sc-mw-discipline — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дисциплина на магистралата" (SP-10 + OV-11 at speed)
 * on the committed mw-v1 district (the FIRST motorway-segment map: a divided
 * 2+2 posted 140, each carriageway an emergency curb lane + 2 travel lanes).
 * No staged actors, ambient traffic ZERO (seed 7), dry daylight.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — accelerates to a flow-speed
 *     ~125 in the RIGHT travel lane (laneId 1 — the rightmost REQUIRED lane
 *     under the emergencyLaneRight seam) and holds it the whole kilometre;
 *   - „Висене в лявата лента при 130": cruising laneId 2 with the right
 *     travel lane free grades EXACTLY NOT_KEEPING_RIGHT (the shipped 12 s
 *     keep-right sustain — the ln-v1 precedent needed ZERO new code at 130);
 *   - „Пълзене с 40": a sustained causeless steady crawl far under the flow
 *     grades EXACTLY DRIVING_TOO_SLOW_FOR_MOTORWAY (второстепенна on the
 *     VERIFIED чл. 22, ал. 1 basis — see rules/catalog.ts).
 *
 * RECORDER SPEED HONESTY (traces/recorder.ts — verified, no cap constant
 * needed): the kinematic recorder has NO top-speed cap — only the authored
 * targetKmh, the accel rate (2.2 m/s² → 0..130 in ~296 m) and the curve-speed
 * cap, which a straight never triggers. mw-v1's generator ASSERTS at build
 * time that accel + stop + 300 m of story fit the segment, so the authored
 * 125–130 km/h drives record their REAL speeds. The crawl/accel transitions
 * ride |a| ≈ 2.2–3.2 m/s², far above the crawl detector's 0.5 steady band —
 * only the held plateaus grade (the A12 transition exemption, by design).
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway on x = 0 — cruise lane (laneId 1) center x = 0, left lane
 * (laneId 2) x = -8.12, emergency lane (laneId 0) x = 8.13; spawn
 * mw-spawn-approach (0, 15) heading north; limit 140; length 1000.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MW_DISCIPLINE } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MW_DISCIPLINE_ID = "sc-mw-discipline";

/** mw-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const X_CRUISE = 0;
const X_LEFT = -8.12;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scMwDisciplineShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Автомагистрала, ограничение 140 — движим се със скоростта на потока, в дясната лента за движение." },
      { kind: "glance", mirror: "rear" },
      // Confident acceleration to flow speed in the RIGHT travel lane.
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 330]], targetKmh: 125, stopAtEnd: false },
      { kind: "annotation", textBg: "Установени 125 км/ч — под тавана, близо до потока. Дясната лента е нашата." },
      { kind: "drive", points: [[X_CRUISE, 330], [X_CRUISE, 700]], targetKmh: 125, stopAtEnd: false },
      { kind: "annotation", textBg: "Лявата лента е само за изпреварване, а аварийната вдясно не е лента за движение." },
      { kind: "drive", points: [[X_CRUISE, 700], [X_CRUISE, 955]], targetKmh: 125 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: скорост с потока, дясна лента, никакви излишни маневри." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Висене в лявата лента при 130" (NOT_KEEPING_RIGHT)
// ---------------------------------------------------------------------------

export function scMwDisciplineMistakeLeftHogScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата се настанява в ЛЯВАТА лента и остава там — дясната е напълно свободна." },
      { kind: "glance", mirror: "rear" },
      // The hog: the whole kilometre in laneId 2, no left indicator — after
      // the 12 s keep-right sustain → NOT_KEEPING_RIGHT, even at 130.
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 430]], targetKmh: 130, stopAtEnd: false },
      { kind: "annotation", textBg: "130 км/ч не оправдава лентата: без изпреварване мястото ти е вдясно." },
      { kind: "drive", points: [[X_LEFT, 430], [X_LEFT, 700]], targetKmh: 130, stopAtEnd: false },
      { kind: "drive", points: [[X_LEFT, 700], [X_LEFT, 950]], targetKmh: 130 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "И на магистрала важи чл. 15 — лявата лента се освобождава за по-бързите." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Пълзене с 40" (DRIVING_TOO_SLOW_FOR_MOTORWAY)
// ---------------------------------------------------------------------------

export function scMwDisciplineMistakeCrawlScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата запълзява с 40 км/ч по празна магистрала — без задръстване, без повреда." },
      { kind: "glance", mirror: "rear" },
      // The held causeless crawl: steady 40 far under the flow floor — the
      // SP-10 mobile chicane. Transitions (accelerating to 40, braking at
      // the end) stay exempt by |a|; only the plateau grades, once.
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 180]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Потокът тук се движи със 120–140: разликата от 80+ км/ч е самата опасност." },
      { kind: "drive", points: [[X_CRUISE, 180], [X_CRUISE, 420]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[X_CRUISE, 420], [X_CRUISE, 560]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Магистралата допуска само превозни средства, способни на повече от 50 км/ч — дръж скоростта на потока." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMwDisciplineTraceName = "shadow-correct" | "mistake-left-hog" | "mistake-crawl";

const SCRIPTS: Record<
  ScMwDisciplineTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMwDisciplineShadowScript },
  "mistake-left-hog": { kind: "mistake", script: scMwDisciplineMistakeLeftHogScript },
  "mistake-crawl": { kind: "mistake", script: scMwDisciplineMistakeCrawlScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — dry
 * daylight, no staged actors, ambient traffic zero. Deterministic: same
 * district → same trace.
 */
export function recordScMwDisciplineDrive(
  districtRaw: unknown,
  name: ScMwDisciplineTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MW_DISCIPLINE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MW_DISCIPLINE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
