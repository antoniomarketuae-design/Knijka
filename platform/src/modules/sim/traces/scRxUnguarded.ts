/**
 * sc-rx-unguarded — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Неохраняем жп прелез" (RX-02, ADR-006 stage 3a) on
 * the committed rx-unguarded-v1 district (the first map carrying a
 * `railCrossing` zone span: track band @ y ∈ [150, 156], unguarded — А35 +
 * СТОП cross, stop line y = 145). No staged actor IN THE RECORDER: the trap is
 * the CROSSING itself — ambient zero, so the only gradable act is the driver's
 * own crossing discipline.
 *
 * THE TRAIN IS CHOREOGRAPHY, NOT GRADING. The TEMPLATE stages one
 * (templates-rail railTrainPassEvent, released 55 m out) and the clip rig
 * re-enacts it over these committed traces, so the pacing below is authored
 * against the consist even though the recorder never sees it: 34.4 m of train
 * at 43 km/h sweeps the carriageway t ≈ 20.5–23.8 s on every one of the three
 * drives (the release is keyed to the player's own approach, which is identical
 * up to the СТОП line in all three). The two WAITING drives hold at the line
 * until it has gone; the roll-through crosses in FRONT of it with ~1.4 s to
 * spare — founder review 2026-07-27: „the car must … see in distance that the
 * train is coming but deciding not to stop and going infront of the train and
 * passing normaly, without collision".
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: full stop at the СТОП-cross line, scans BOTH ways (glances),
 *     crosses briskly without stopping on the band → ZERO violations +
 *     CLEAN_DRIVING (the correct ritual is actively good);
 *   - „Преминаване без спиране": rolls across the band at 30 km/h with no
 *     stop → grades EXACTLY RAIL_CROSSING_VIOLATION, once (detail no-stop —
 *     the mandatory-stop duty of the UNGUARDED crossing, чл. 51–53);
 *   - „Спиране върху релсите": stops correctly at the line (innocent entry),
 *     then freezes mid-band for 3 s → EXACTLY RAIL_CROSSING_VIOLATION, once
 *     (detail stopped-on-track — the RX-03 kill; NO queue exemption exists).
 *
 * Geometry pinned to content/world/rx-unguarded-v1.json: a 1+1 street on
 * x = 0, lane center x = 4.06, band [150, 156], stop line y = 145, spawn
 * rxu-spawn-start (4.06, 15) heading north, 300 m, limit 50.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RX_UNGUARDED_ID = "sc-rx-unguarded";

/** The single northbound lane center of rx-unguarded-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — stop, scan both ways, cross briskly
// ---------------------------------------------------------------------------

export function scRxUnguardedShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е неохраняем жп прелез (А35): без бариери, без светлини — ти си бариерата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 146]], targetKmh: 30 },
      // The mandatory FULL STOP at the СТОП-cross line (y = 145 ± the nose) —
      // and it lasts as long as the TRAIN needs. The staged consist (34.4 m,
      // 43 km/h) sweeps the carriageway t ≈ 20.5–23.8 s; this pause puts the
      // move-off at t ≈ 24 and the band entry at t ≈ 25.3, so the ritual is
      // performed AGAINST a train instead of against empty rails. Trim it and
      // the shadow drives into the consist's tail (templates-rail
      // RXU_TRAIN_HOLD_M carries the other half of this number).
      { kind: "pause", sec: 5.0, brake: true },
      { kind: "annotation", textBg: "Пълно спиране на линията. Сега огледай ДВЕТЕ посоки по релсите — докъдето стига погледът." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Влакът мина изцяло — чак сега премини решително, без спиране върху коловоза." },
      { kind: "drive", points: [[X_LANE, 146], [X_LANE, 190]], targetKmh: 25, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 35 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: спиране, двоен оглед, решително преминаване — желязното правило на прелеза." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Преминаване без спиране" (RAIL_CROSSING_VIOLATION)
// ---------------------------------------------------------------------------

export function scRxUnguardedMistakeRollThroughScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „нищо не се чува“ — и колата минава прелеза, без изобщо да спре." },
      { kind: "glance", mirror: "rear" },
      // Rolls across the band at cruise speed — the band entry lands with NO
      // qualifying full stop in the recency ledger → the exact code.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 190]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Неохраняем прелез без пълно спиране — влакът идва с 100+ км/ч и не може да спре." },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 283]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "На прелез без бариери спираш ВИНАГИ — тишината не е гаранция, а капан (чл. 51–53)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Спиране върху релсите" (RAIL_CROSSING_VIOLATION)
// ---------------------------------------------------------------------------

export function scRxUnguardedMistakeStopOnTrackScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: спира правилно на линията… но след потеглянето се поколебава по средата на коловоза." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 100], [X_LANE, 146]], targetKmh: 30 },
      // The stop itself is CORRECT (innocent band entry — the ledger holds;
      // lastQualifyingStopAt refreshes every frame at rest, so a LONGER wait
      // never spends the 6 s stopRecency window) and it outlasts the staged
      // train exactly like the shadow's — the hesitation this demo grades must
      // happen on rails the consist has already left, not through its flank.
      { kind: "pause", sec: 5.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // …but the crossing stalls MID-BAND (y = 153 ∈ [150, 156]): a 3 s
      // freeze on the rails — past the 2 s rest sustain, no queue exemption.
      { kind: "drive", points: [[X_LANE, 146], [X_LANE, 153]], targetKmh: 12 },
      { kind: "pause", sec: 3, brake: true },
      { kind: "annotation", textBg: "Замръзване върху релсите — точно там, където влакът не може нито да спре, нито да те заобиколи." },
      { kind: "drive", points: [[X_LANE, 153], [X_LANE, 220]], targetKmh: 25, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 220], [X_LANE, 283]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Премини решително: върху коловоза не се спира никога — спираш чак когато целият автомобил е отвъд." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRxUnguardedTraceName =
  | "shadow-correct"
  | "mistake-roll-through"
  | "mistake-stop-on-track";

const SCRIPTS: Record<
  ScRxUnguardedTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scRxUnguardedShadowScript },
  "mistake-roll-through": { kind: "mistake", script: scRxUnguardedMistakeRollThroughScript },
  "mistake-stop-on-track": { kind: "mistake", script: scRxUnguardedMistakeStopOnTrackScript },
};

/**
 * Record one of the three drives against a loaded rx-unguarded-v1 document —
 * no staged events (the crossing is the trap), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScRxUnguardedDrive(
  districtRaw: unknown,
  name: ScRxUnguardedTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RX_UNGUARDED_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
