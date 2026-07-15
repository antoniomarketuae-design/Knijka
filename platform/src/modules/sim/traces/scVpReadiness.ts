/**
 * sc-vp-readiness — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Готовност преди тръгване" (VP-02 belt + VP-05
 * handbrake) on the committed vp-ready-v1 district. No staged actors, ambient
 * traffic ZERO (seed 7), dry day: the ONLY thing the rule engine can grade is
 * the driver's cockpit state (belt / handbrake).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: belt on + handbrake off (the readiness ritual), a centered ~40
 *     km/h drive the whole street → ZERO violations + CLEAN_DRIVING;
 *   - „Тръгване без колан": {seatbelt:false} while moving grades EXACTLY
 *     SEATBELT_OFF_WHILE_MOVING (1 s sustain), no handbrake/speed/lane code;
 *   - „Тръгване с вдигната ръчна": {handbrake:true} while moving grades EXACTLY
 *     HANDBRAKE_LEFT_ON (1.5 s sustain), no belt/speed/lane code.
 *
 * Geometry pinned to content/world/vp-ready-v1.json: street on x = 0, right-lane
 * center x = 4.06, spawn vp-spawn-approach (4.06, 15) heading north, 360 m long,
 * limit 50 km/h. The drives stay on x = 4.06 (centered) and at 40 km/h (well
 * under the limit) so nothing but the flipped cockpit channel is gradable.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VP_READINESS } from "../lessons/scenario/templates-cockpit";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VP_READINESS_ID = "sc-vp-readiness";

/** Northbound right-lane center of vp-ready-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — belt on, handbrake off, clean drive
// ---------------------------------------------------------------------------

export function scVpReadinessShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Готовност преди тръгване: закопчай колана и свали ръчната." },
      // The readiness ritual — both match the recorder defaults (belt on,
      // handbrake off), so the shadow records byte-identically while stating
      // the correct cockpit state for the story.
      { kind: "seatbelt", on: true },
      { kind: "handbrake", on: false },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Коланът е закопчан, ръчната — свалена: потегляме плавно." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата се движи свободно, без съпротивление — ръчната наистина е долу." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка с поставен колан и свалена ръчна." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Тръгване без колан" (SEATBELT_OFF_WHILE_MOVING)
// ---------------------------------------------------------------------------

export function scVpReadinessMistakeNoBeltScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата потегля с откопчан колан — „нали е близо“." },
      // Belt off before moving → SEATBELT_OFF_WHILE_MOVING after 1 s of motion.
      // Handbrake stays off, speed legal, lane centered: no other code.
      { kind: "seatbelt", on: false },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Движение без колан е основна грешка — при удар тялото няма какво да го задържи." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Закопчай колана преди потегляне — винаги, дори за 100 метра." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Тръгване с вдигната ръчна" (HANDBRAKE_LEFT_ON)
// ---------------------------------------------------------------------------

export function scVpReadinessMistakeHandbrakeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата потегля с вдигната ръчна спирачка." },
      // Handbrake left on before moving → HANDBRAKE_LEFT_ON after 1.5 s of
      // motion. Belt stays on, speed legal, lane centered: no other code.
      { kind: "handbrake", on: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата се влачи, спирачките прегряват, а на таблото свети лампа." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Свали ръчната докрай преди потегляне; усетиш ли съпротивление — спри и провери." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVpReadinessTraceName = "shadow-correct" | "mistake-no-belt" | "mistake-handbrake";

const SCRIPTS: Record<
  ScVpReadinessTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVpReadinessShadowScript },
  "mistake-no-belt": { kind: "mistake", script: scVpReadinessMistakeNoBeltScript },
  "mistake-handbrake": { kind: "mistake", script: scVpReadinessMistakeHandbrakeScript },
};

/**
 * Record one of the three drives against a loaded vp-ready-v1 document — no
 * staged actors, ambient traffic zero, dry day. Deterministic: same district →
 * same trace.
 */
export function recordScVpReadinessDrive(
  districtRaw: unknown,
  name: ScVpReadinessTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VP_READINESS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VP_READINESS.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
