/**
 * sc-pe-jaywalker — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Пешеходец на червено" (PE-13) on the committed
 * pe-jay-v1 district, recorded with the template's OWN staged jaywalker
 * (pedestrianDartOut sc-jay-ped — single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED — crossed the junction on a
 *     PINNED GREEN (signalOffsets, the sc-signal-hesitation dial: offset 44 =
 *     green over the encounter; the gate asserts stopLineCrossed carried
 *     lightState "green" — the чл. 120 lesson is provable on the events),
 *     braked for the jaywalker DESPITE the green, waited her off the road;
 *   - „Аз съм на зелено" grades EXACTLY PEDESTRIAN_NOT_YIELDED (drove through
 *     the occupied crossing under the 30 km/h approach cap — no too-fast, no
 *     contact: she is still on the western half);
 *   - „Удар в пешеходеца" grades EXACTLY COLLISION (slowed through the box so
 *     the arrival meets her IN the player's lane — the authored contact of the
 *     sc-crossing-dart precedent).
 *
 * Geometry pinned to content/world/pe-jay-v1.json: ns road on x = 0 (right
 * lane 4.06, limit 50), junction stop lines at ±27.73, the crossing pej-x-1
 * at y = 34 on the north exit arm, spawn sx-spawn-south (4.06, −105) heading
 * north. Walker timing: released at trigger 55 m (player y ≈ −21, just
 * before the line), on the carriageway ~1.1 s later, reaches the player's
 * lane (x ≈ 4) ~9.2 s after release, off the road at ~10.8 s.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_PE_JAYWALKER } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PE_JAYWALKER_ID = "sc-pe-jaywalker";

/** Northbound right-lane center of pe-jay-v1's ns road. */
const X_LANE = 4.06;
/** The staged crossing (pej-x-1) on the north exit arm. */
const Y_CROSSING = 34;
/** The sc-signal-hesitation green dial: sx-n-c pinned green over the story. */
const SIGNAL_OFFSETS = { "sx-n-c": 44 } as const;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scPeJaywalkerShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Зелено за теб — но гледай и пътеката ОТВЪД кръстовището, не само светофара.",
      },
      { kind: "glance", mirror: "rear" },
      // ~28 km/h — under the 30 km/h crossing-approach cap, green over the
      // whole transit (the pinned window).
      { kind: "drive", points: [[X_LANE, -105], [X_LANE, -40]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходец слиза на платното на своето червено! Зеленото не отменя грижата." },
      { kind: "glance", mirror: "left" },
      {
        // Cross the line on green, transit the box, and stop 6 m short of the
        // crossing — the duty of care lands where the pedestrian is.
        kind: "drive",
        points: [[X_LANE, -40], [X_LANE, 6], [X_LANE, Y_CROSSING - 6]],
        targetKmh: 28,
      },
      // Wait the jaywalker off the carriageway (~10.8 s from release; the stop
      // lands mid-walk, so the residue is shorter).
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "annotation", textBg: "Изчакай я да освободи платното напълно — не се разминавай „на косъм“." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е чиста — продължи." },
      { kind: "drive", points: [[X_LANE, Y_CROSSING - 6], [X_LANE, 55], [X_LANE, 72]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така: премина на зелено — и спря за човека. Чл. 120 е абсолютен." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Аз съм на зелено" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scPeJaywalkerMistakeMyGreenScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „светофарът е зелен, значи е мой ред“ — и колата не спира за пешеходеца.",
      },
      { kind: "glance", mirror: "rear" },
      // Same lawful 28 km/h approach — the ONLY fault this demo shows is the
      // refusal to yield to the person on the carriageway.
      { kind: "drive", points: [[X_LANE, -105], [X_LANE, -40]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът е на платното, но колата продължава — „нали съм на зелено“…" },
      {
        // Straight over the occupied crossing (she is on the western half —
        // ~4 m from the car: pure „непропускане", no contact).
        kind: "drive",
        points: [[X_LANE, -40], [X_LANE, 20], [X_LANE, 58]],
        targetKmh: 28,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Зеленото разрешава на теб — но чл. 120 защитава пешеходеца на платното дори в негово нарушение. Пропускаш го винаги.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Удар в пешеходеца" (COLLISION)
// ---------------------------------------------------------------------------

export function scPeJaywalkerMistakeCollisionScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: погледът е върху зеления светофар, не върху пътеката зад него.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, -105], [X_LANE, -40]], targetKmh: 28, stopAtEnd: false },
      {
        // Slow through the box (a distracted crawl) so the arrival at the
        // crossing meets the jaywalker IN the player's lane.
        kind: "drive",
        points: [[X_LANE, -40], [X_LANE, 0], [X_LANE, Y_CROSSING - 2]],
        targetKmh: 19,
        stopAtEnd: false,
      },
      // The authored consequence: the jaywalker is struck on the crossing.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg:
          "Ударът в пешеходец прекратява изпита — независимо чий сигнал е зелен. Гледай пътеката, не само лампата.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPeJaywalkerTraceName = "shadow-correct" | "mistake-my-green" | "mistake-collision";

const SCRIPTS: Record<
  ScPeJaywalkerTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPeJaywalkerShadowScript },
  "mistake-my-green": { kind: "mistake", script: scPeJaywalkerMistakeMyGreenScript },
  "mistake-collision": { kind: "mistake", script: scPeJaywalkerMistakeCollisionScript },
};

/**
 * Record one of the three drives against a loaded pe-jay-v1 document — the
 * TEMPLATE's staged jaywalker armed (single truth), the junction green PINNED
 * (signalOffsets — the sc-signal-hesitation dial), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScPeJaywalkerDrive(
  districtRaw: unknown,
  name: ScPeJaywalkerTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PE_JAYWALKER_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PE_JAYWALKER.staged ?? [])] as StagedEventSpec[],
    signalOffsets: SIGNAL_OFFSETS,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
