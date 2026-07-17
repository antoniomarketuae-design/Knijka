/**
 * sc-merge-accel-lane — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Включване в магистрала през лентата за ускоряване"
 * (ЗДвП чл. 55 + чл. 25) on the committed mw-entry-v1 district. Ambient traffic
 * ZERO (seed 7), dry day; the ONLY staged actor is the mainline car of
 * SC_MERGE_ACCEL_LANE.staged — the rearTailgater runner, which emits ZERO
 * SimTick events by contract (pressure scenery, doc 72 FO-07). Everything the
 * gate asserts therefore comes from the PLAYER's own channels.
 *
 * HONEST PROXY (flagged): a mainline car that genuinely blows past at flow
 * speed is not authorable with today's staged vocabulary — matchPlayer is the
 * only station-keeping command, so the actor paces a 42 m gap behind the player
 * and only accelerates away after its pressure window. That is why the
 * „вливане пред идваща кола" consequence is an AUTHORED contact
 * (DriveStep.collision — the scJunctions2 „скритата кола удря носа" precedent)
 * rather than a physical overlap: the runner cannot collide, and an authored
 * beat is honest demo data, never a silent detector.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ramp → ~70 km/h at the nose → builds ~95 in the acceleration
 *     lane → mirror, indicator, shoulder → merges into laneId 1 well before
 *     the taper → cancels → cruises 105 to the end. ZERO violations +
 *     CLEAN_DRIVING + SAFE_LANE_CHANGE;
 *   - „Спиране в края на лентата за ускоряване": a 12 m/s²-envelope slam from
 *     95 km/h to a dead stop at the end of the acceleration lane, on an EMPTY
 *     mainline → EXACTLY HARSH_BRAKING_NO_CAUSE (the map has no crossing, no
 *     stop line, no junction and nothing ahead — every ledger cause is
 *     positively absent). It then merges properly, so the ONE thing graded is
 *     the causeless stop;
 *   - „Вливане без оглеждане пред идваща кола": indicator ON, no glance at all,
 *     wheel straight into laneId 1 → EXACTLY LANE_CHANGE_WITHOUT_MIRROR_CHECK
 *     + COLLISION (never LANE_CHANGE_WITHOUT_INDICATOR — signalling without
 *     looking is the whole point of the demo).
 *
 * Geometry pinned to content/world/mw-entry-v1.json (meta.scenario): the
 * northbound carriageway runs on x = 0 — curb/acceleration lane (laneId 0)
 * x = 8.13, merge target (laneId 1) x = 0; ramp nose (8.13, 260); the
 * acceleration lane tapers at y = 460; the segment ends at y = 960; spawn
 * mwe-spawn-ramp (35.56, 139.5) heading 347.18°; АМ limit 140, ramp 90.
 *
 * PACING LAWS the numbers obey (probed, not guessed):
 *  - the RAMP-TO-ACCEL path is authored as ONE two-segment drive step whose
 *    joint bends only 3.6° — under the recorder's 8° curve-cap trigger, so the
 *    ramp is driven at the authored speed, not at a phantom corner cap;
 *  - the locator hands the fix from the ramp to the accel segment at y ≈ 273;
 *    every drive holds ≤ 70 km/h until then (ramp limit 90 — nothing can
 *    grade as speeding on the връзка);
 *  - every merge completes its laneId flip (x ≈ 3.7) at least 40 m before the
 *    taper joint: a lane delta inside laneChangeJointGraceSec (1.5 s) of a
 *    segment change is DROPPED ungraded, which would silently gut the §9
 *    assert of the blind-merge demo.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MERGE_ACCEL_LANE } from "../lessons/scenario/templates-merging";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MERGE_ACCEL_LANE_ID = "sc-merge-accel-lane";

/** mw-entry-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const X_CURB = 8.13; // laneId 0 — the acceleration lane
const X_CRUISE = 0; // laneId 1 — the merge target
/** mw-entry-v1 spawn + ramp geometry (meta.scenario.rampSpawn / the nose). */
const RAMP_SPAWN: readonly [number, number] = [35.56, 139.5];
/** A point ON the ramp centerline, 20 m short of the nose (x = 8.13 + 31.87 ×
 *  20/140): the drive's bend point, chosen so the joint stays under the 8°
 *  curve cap. */
const RAMP_BEND: readonly [number, number] = [12.68, 240];
/** First point on the acceleration lane proper (past the nose at y = 260). */
const ACCEL_IN: readonly [number, number] = [X_CURB, 268];

/** The ramp is driven at this, safely under its чл. 21 90 (the fix is still
 *  the ramp's until y ≈ 273). */
const RAMP_KMH = 70;
/** Flow-matching speed built in the acceleration lane. */
const MERGE_KMH = 95;
/** Mainline cruise once merged. */
const CRUISE_KMH = 105;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — accelerate, look, merge, cancel
// ---------------------------------------------------------------------------

export function scMergeAccelLaneShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Рампа към магистралата: набираме скорост още тук — на магистралата се влиза с темпото на потока." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [RAMP_SPAWN, RAMP_BEND, ACCEL_IN], targetKmh: RAMP_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Вдясно започва лентата за ускоряване — тя е наша за около 200 метра. Ускоряваме до скоростта на потока." },
      { kind: "drive", points: [ACCEL_IN, [X_CURB, 330]], targetKmh: MERGE_KMH, stopAtEnd: false },
      // The observation pair the rubric names: mirror first (where is the
      // gap?), then the indicator, then the blind spot — wheel last.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "В огледалото: колата по магистралата идва отзад — пролуката пред нея е нашата." },
      { kind: "drive", points: [[X_CURB, 330], [X_CURB, 350]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Ляв мигач, още веднъж огледало и поглед през рамо в мъртвата зона — чак тогава воланът." },
      // The merge: 8.13 m of lateral over 62 m of arc — the laneId flip lands
      // at y ≈ 384, a full 76 m before the taper joint at 460.
      { kind: "drive", points: [[X_CURB, 350], [X_CRUISE, 412]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Вписахме се в пролуката, без никой по магистралата да спира заради нас — мигачът се изключва." },
      { kind: "drive", points: [[X_CRUISE, 412], [X_CRUISE, 930]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Вдясно вече е аварийната лента — лентата за ускоряване свърши на 460-ия метър и по нея не се кара." },
      { kind: "drive", points: [[X_CRUISE, 930], [X_CRUISE, 950]], targetKmh: CRUISE_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: ускорение в лентата, пълна проверка, плавно вливане — точно това очаква изпитващият." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спиране в края на лентата за ускоряване"
// (HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

export function scMergeAccelLaneMistakeStopAtEndScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: лентата за движение е свободна, но водачът се колебае — и решава да спре „да го пуснат“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [RAMP_SPAWN, RAMP_BEND, ACCEL_IN], targetKmh: RAMP_KMH, stopAtEnd: false },
      { kind: "drive", points: [ACCEL_IN, [X_CURB, 300]], targetKmh: MERGE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Вместо да ползва лентата, водачът набива спирачките до дупка — на празна магистрала." },
      // The 12 m/s² envelope turns the „stop at the end of the lane" into an
      // emergency slam: braking starts ~42 m before rest, a sustained
      // ~8.4 m/s² the detector grades. The mainline is empty ahead (the staged
      // car is 42 m BEHIND, one lane over) — every ledger cause is absent.
      { kind: "drive", points: [[X_CURB, 300], [X_CURB, 372]], targetKmh: MERGE_KMH, maxDecelMps2: 12 },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "annotation", textBg: "Сега потегляме от нула в края на лентата — сред коли със 140 км/ч. Точно това лентата за ускоряване трябваше да спести." },
      { kind: "drive", points: [[X_CURB, 372], [X_CURB, 395]], targetKmh: 70, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_CURB, 395], [X_CRUISE, 440]], targetKmh: 70, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_CRUISE, 440], [X_CRUISE, 900]], targetKmh: 100 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спирането в края на лентата е крайна мярка, когато наистина няма пролука — не начин да отложиш решението." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Вливане без оглеждане пред идваща кола"
// (LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION)
// ---------------------------------------------------------------------------

export function scMergeAccelLaneMistakeBlindMergeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: мигач — и веднага волан. Нито огледало, нито поглед през рамо." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [RAMP_SPAWN, RAMP_BEND, ACCEL_IN], targetKmh: RAMP_KMH, stopAtEnd: false },
      { kind: "drive", points: [ACCEL_IN, [X_CURB, 350]], targetKmh: MERGE_KMH, stopAtEnd: false },
      // Politely signalled — and still blind: the indicator declares, it does
      // not check. NO glance step anywhere near this merge.
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "По магистралата вече идва кола — предимството е нейно, а водачът дори не е погледнал." },
      { kind: "drive", points: [[X_CURB, 350], [X_CRUISE, 410]], targetKmh: MERGE_KMH, stopAtEnd: false },
      // The authored consequence: the mainline car strikes the merging car.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.6, brake: true },
      { kind: "annotation", textBg: "Мигачът обявява намерението, но не оглежда лентата. Огледалото и рамото са ПРЕДИ волана — винаги." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMergeAccelLaneTraceName =
  | "shadow-correct"
  | "mistake-stop-at-end"
  | "mistake-blind-merge";

const SCRIPTS: Record<
  ScMergeAccelLaneTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMergeAccelLaneShadowScript },
  "mistake-stop-at-end": { kind: "mistake", script: scMergeAccelLaneMistakeStopAtEndScript },
  "mistake-blind-merge": { kind: "mistake", script: scMergeAccelLaneMistakeBlindMergeScript },
};

/**
 * Record one of the three drives against a loaded mw-entry-v1 document — the
 * template's staged mainline car armed, ambient traffic zero (the harness law).
 * Deterministic: same district → same trace.
 */
export function recordScMergeAccelLaneDrive(
  districtRaw: unknown,
  name: ScMergeAccelLaneTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MERGE_ACCEL_LANE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MERGE_ACCEL_LANE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
