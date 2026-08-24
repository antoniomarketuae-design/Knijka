/**
 * scRxTramStopDoors — the NO-ISLAND TRAM-STOP authored drives (ADR-006 stage
 * 3b; doc 76 §5/§9) for sc-rx-tram-stop-doors on rx-tram-stop-v1:
 *
 *   sc-rx-tram-stop-doors  rx-tram-stop-v1  shadow + thread-doors + creep-through
 *
 * The RX-04 INVERSE of sc-rx-tram-island: strip the refuge island and чл. 66,
 * ал. 1 makes the stop MANDATORY — the alighting passenger owns the whole lane
 * from the tram's front door to the kerb. Same scCrossingBusShadow mold pointed
 * at a no-island stop: the halted tram is a staged PROP on the dart-out spec
 * itself, the darter is the template's own alighting passenger, and the grading
 * is 100% the shipped pedestrian chain.
 *
 * Geometry pinned to the committed map (the district battery proves the numbers):
 *   rx-tram-stop-v1: street on x = 0, lane center 4.06, door zebra at y = 90,
 *   halted tram body center y = 97 on the southbound lane (nose at 90 — front
 *   door at the zebra). The passenger steps off at x = −2.9 and crosses EAST at
 *   1.2 m/s, on the lane s ∈ [0, 11.03] (t ∈ [0, 9.19] s from its release).
 *
 * The three drives on ONE occupancy window (the passenger released 25 m out):
 *   - shadow: stop 6 m short of the door zebra, wait the passenger fully off
 *     the lane, THEN cross → ZERO violations + PEDESTRIAN_YIELDED;
 *   - thread-doors: thread past the open doors so the bumper meets the
 *     passenger in-lane → PEDESTRIAN_NOT_YIELDED + COLLISION;
 *   - creep-through: roll across after the passenger is past the lane but still
 *     on the carriageway → PEDESTRIAN_NOT_YIELDED alone (no contact).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RX_TRAM_STOP } from "../lessons/scenario/templates-rail2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RX_TRAM_STOP_ID = "sc-rx-tram-stop-doors";

/** Northbound right-lane center of rx-tram-stop-v1. */
const X_LANE = 4.06;
/** The passenger door crossing (rts-x-1). */
const Y_ZEBRA = 90;

// ---------------------------------------------------------------------------
// The shadow — stop behind the open doors, wait the lane clear, then proceed
// ---------------------------------------------------------------------------

function scRxTramStopShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Спрял трамвай на спирка БЕЗ остров, вратите отворени — пътниците слизат право на платното. Крак над спирачката." },
      { kind: "glance", mirror: "rear" },
      // ~22 km/h — well under the limit AND the crossing approach cap.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 45]], targetKmh: 22 },
      {
        kind: "annotation",
        textBg: "Пътник слиза и тръгва през твоята лента към тротоара! Спри — не се провирай покрай отворените врати.",
      },
      {
        // Firm, planned stop 6 m short of the door zebra.
        kind: "drive",
        points: [[X_LANE, 45], [X_LANE, 66], [X_LANE, Y_ZEBRA - 6]],
        targetKmh: 22,
      },
      // Wait the passenger fully off the lane — 1.2 m/s across ≈ 9.2 s + margin.
      { kind: "pause", sec: 12, brake: true },
      { kind: "annotation", textBg: "Платното е на пътника, докато не се прибере — не потегляй под носа му." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Премини спокойно покрай спрелия трамвай едва когато лентата е чиста." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6], [X_LANE, 120], [X_LANE, 134]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: спря зад отворените врати, изчака слизащия пътник и потегли чак когато платното се освободи." },
    ],
  };
}

// ---------------------------------------------------------------------------
// mistake „Провиране покрай отворените врати" — threads past into the passenger
// ---------------------------------------------------------------------------

function scRxTramStopThreadScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата се провира покрай спрелия трамвай, право към слизащия пътник.",
      },
      { kind: "glance", mirror: "rear" },
      // ~16 km/h thread: legal and under the 30 km/h cap, so the fault is
      // crossing while the passenger is in the lane — the bumper reaches the
      // door line just as the passenger steps into the player's lane.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 65]], targetKmh: 16, stopAtEnd: false },
      { kind: "annotation", textBg: "Пътникът е на платното пред отворените врати, а колата не спира…" },
      { kind: "drive", points: [[X_LANE, 65], [X_LANE, Y_ZEBRA + 4]], targetKmh: 16, stopAtEnd: false },
      // The authored consequence: contact in the lane at the open doors.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спирка без остров значи хора направо на платното — чл. 66, ал. 1: спираш зад отворените врати и не потегляш, докато не се приберат. Ударът прекратява изпита.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// mistake „Пълзене през слизащите" — creeps across, no contact
// ---------------------------------------------------------------------------

function scRxTramStopCreepScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата не спира, а пропълзява през пътеката, докато пътникът още пресича.",
      },
      { kind: "glance", mirror: "rear" },
      // Approach at ~15 km/h to release the passenger, then creep ~11 km/h so
      // the car crosses AFTER the passenger is past the lane but still on the
      // carriageway — PEDESTRIAN_NOT_YIELDED with no contact.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 65]], targetKmh: 15, stopAtEnd: false },
      { kind: "annotation", textBg: "Пътникът е на платното, но колата пълзи напред вместо да спре…" },
      { kind: "drive", points: [[X_LANE, 65], [X_LANE, 124]], targetKmh: 11, stopAtEnd: false },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Без остров пътникът няма къде да се скрие — платното е негово. „Бавно и внимателно“ покрай слизащи не е пропускане (чл. 66, ал. 1).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry — one deterministic function)
// ---------------------------------------------------------------------------

export type ScRxTramStopTraceName = "shadow-correct" | "mistake-thread-doors" | "mistake-creep-through";

interface StopRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

const SC_RX_TRAM_STOP_DRIVES: Record<ScRxTramStopTraceName, StopRecordingSpec> = {
  "shadow-correct": { kind: "shadow", script: scRxTramStopShadowScript },
  "mistake-thread-doors": { kind: "mistake", script: scRxTramStopThreadScript },
  "mistake-creep-through": { kind: "mistake", script: scRxTramStopCreepScript },
};

const SC_RX_TRAM_STOP_STAGED: StagedEventSpec[] = [...(SC_RX_TRAM_STOP.staged ?? [])];

/** Trace names in committed order (shadow first). */
export function scRxTramStopTraceNames(): ScRxTramStopTraceName[] {
  return Object.keys(SC_RX_TRAM_STOP_DRIVES) as ScRxTramStopTraceName[];
}

/**
 * Record one no-island tram-stop drive against ITS loaded district document —
 * the template's own staged events (the halted-tram PROP rides the dart-out
 * spec itself). Deterministic: same district → same trace (seed 7, the house
 * recording seed; ambient traffic zero — the harness law).
 */
export function recordScRxTramStopDrive(
  districtRaw: unknown,
  name: ScRxTramStopTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const rec = SC_RX_TRAM_STOP_DRIVES[name];
  if (!rec) throw new Error(`recordScRxTramStopDrive: no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: SC_RX_TRAM_STOP_ID,
    kind: rec.kind,
    seed: 7,
    stagedEvents: SC_RX_TRAM_STOP_STAGED,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
