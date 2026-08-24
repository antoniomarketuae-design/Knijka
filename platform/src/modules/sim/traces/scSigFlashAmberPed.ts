/**
 * sc-sig-flash-amber-ped — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Мигащо жълто и пешеходец на пътеката"
 * (JU-20 × PE-01/PE-02) on the committed pe-jay-v1 district, recorded with the
 * template's OWN staged walker (pedestrianDartOut sc-sfap-ped — single truth,
 * imported from the template) and sx-n-c dialed FLASHING AMBER (signalModes).
 *
 * The flashing-amber dial is what makes these drives gradeable at all: a
 * cluster in that mode carries NO phase, so fireLine emits nothing on its stop
 * lines and no signal code can fire. With no staged car from the right the
 * right-hand-rule tracker also stays silent — the crossing chain is the ONLY
 * graded axis, which is exactly what each demo isolates.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED — approached the flashing
 *     amber at 28 km/h (under the 30 km/h crossing cap), stopped 6 m short of
 *     the crossing, waited the walker off the carriageway, then passed an EMPTY
 *     crossing;
 *   - „несъобразена скорост" grades EXACTLY PEDESTRIAN_CROSSING_TOO_FAST — the
 *     45 km/h approach holds > 30 km/h for the 1 s sustain while she is on the
 *     carriageway, THEN slams to a stop before the crossing and waits her off,
 *     so no непропускане and no contact follow: the graded fault is the
 *     approach itself. The slam cannot double-grade — HARSH_BRAKING_NO_CAUSE's
 *     noBrakeCause requires `s.crossing === null`, and the brake lands inside
 *     the crossing zone (the detector's built-in innocence);
 *   - „непропускане" grades EXACTLY PEDESTRIAN_NOT_YIELDED — a lawful 28 km/h
 *     (no too-fast) straight over the occupied crossing while she is still on
 *     the western half (~3 m clear of the lane: no contact).
 *
 * Geometry pinned to content/world/pe-jay-v1.json: ns road on x = 0 (right lane
 * 4.06, limit 50 → the 55 km/h graced band no drive here reaches), junction
 * stop lines at ±27.7, the crossing pej-x-1 at y = 34 on the north exit arm,
 * spawn sx-spawn-south (4.06, −105) heading north. The 35 m crossing zone arms at
 * y ≈ −0.76. Walker timing: released at trigger 55 m (player y ≈ −20.85), on the
 * carriageway from ~1.1 s, reaches the player's lane (x ≈ 4.06) ~9.2 s after
 * release, clear of the roadway at ~11.9 s.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SIG_FLASH_AMBER_PED } from "../lessons/scenario/templates-signals2";
import type { SignalClusterMode } from "../runtime";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SIG_FLASH_AMBER_PED_ID = "sc-sig-flash-amber-ped";

/** Northbound right-lane center of pe-jay-v1's ns road. */
const X_LANE = 4.06;
/** The staged crossing (pej-x-1) on the north exit arm. */
const Y_CROSSING = 34;
/**
 * The capability under test: the junction carries no phase for the whole story.
 * Dial by NODE id, never by cluster id — on pe-jay-v1 the signalized crossing
 * (pej-x-1) and the junction (sx-n-c) are close enough to merge into ONE
 * cluster, and that cluster is named "pej-x-1" (battery pe-jay-district.test.ts).
 * setSignalClusterMode resolves "sx-n-c" through the member-node map, so this
 * correctly takes the junction AND the crossing's own head into warning mode —
 * which is what мигащо жълто means on the ground.
 */
const SIGNAL_MODES: Readonly<Record<string, SignalClusterMode>> = {
  "sx-n-c": "flashingAmber",
};

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSigFlashAmberPedShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Светофарът мига в жълто — кръстовището е нерегулирано. Намали и влез готов за спиране.",
      },
      { kind: "glance", mirror: "rear" },
      // ~28 km/h — under the 30 km/h crossing-approach cap, so the approach
      // itself is never the fault; the duty of care is what gets demonstrated.
      {
        kind: "drive",
        points: [[X_LANE, -105], [X_LANE, -40]],
        targetKmh: 28,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Мигащото жълто не пази никого вместо теб — огледай наляво и надясно и гледай пътеката ОТВЪД кръстовището.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg: "Пешеходец слиза на пътеката! На мигащо жълто предимството е негово — чл. 119.",
      },
      {
        // Transit the unregulated junction and stop 6 m short of the crossing.
        kind: "drive",
        points: [[X_LANE, -40], [X_LANE, 6], [X_LANE, Y_CROSSING - 6]],
        targetKmh: 28,
      },
      // Wait her off the carriageway (~11.9 s from release; the stop lands
      // mid-walk, so the residue here is shorter).
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "annotation", textBg: "Изчакай я да освободи платното напълно — не се разминавай „на косъм“." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Продължи едва когато пътеката е чиста." },
      { kind: "drive", points: [[X_LANE, Y_CROSSING - 6], [X_LANE, 55], [X_LANE, 72]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Точно така: мигащо жълто = повишено внимание и премерена скорост — и пешеходецът мина спокойно.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Несъобразена скорост покрай пътеката"
// (PEDESTRIAN_CROSSING_TOO_FAST)
// ---------------------------------------------------------------------------

export function scSigFlashAmberPedMistakeHotApproachScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „мига жълто — значи мога“ — и колата подминава кръстовището с 45 км/ч.",
      },
      { kind: "glance", mirror: "rear" },
      // 45 km/h: under the 55 km/h graced band (limit 50 — no SPEEDING code),
      // but half again over the 30 km/h cap that a busy crossing demands.
      {
        kind: "drive",
        points: [[X_LANE, -105], [X_LANE, -20]],
        targetKmh: 45,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Пешеходецът е вече на платното, а скоростта не пада — това е несъобразена скорост.",
      },
      // Carry 45 km/h through the zone entry (y ≈ −0.76) so the too-fast
      // sustain (1 s over 30 km/h with her on the carriageway) lands at y ≈ 12
      // — BEFORE the brake, which would otherwise pause the clock.
      { kind: "drive", points: [[X_LANE, -20], [X_LANE, 16]], targetKmh: 45, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "И идва паническата спирачка — доказателството, че скоростта е била грешна.",
      },
      // The panic stop: a hard rate the crossing zone makes structurally
      // innocent (noBrakeCause needs s.crossing === null), so this demo grades
      // its ONE authored code and nothing else.
      {
        kind: "drive",
        points: [[X_LANE, 16], [X_LANE, 31]],
        targetKmh: 45,
        maxDecelMps2: 9,
        stopAtEnd: true,
      },
      // She still has to finish crossing — the wait that should have been calm.
      { kind: "pause", sec: 7.0, brake: true },
      { kind: "drive", points: [[X_LANE, 31], [X_LANE, 55], [X_LANE, 72]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "„Повишено внимание“ е скорост, от която спираш пред пътеката — не спирачка в последния метър. Под 30 км/ч покрай зает пешеходен преход.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Непропускане на пешеходеца" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scSigFlashAmberPedMistakeNoYieldScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: скоростта е премерена, но колата изобщо не спира за пешеходеца.",
      },
      { kind: "glance", mirror: "rear" },
      // The SAME lawful 28 km/h approach as the shadow — the only fault this
      // demo shows is the refusal to yield to the person on the carriageway.
      {
        kind: "drive",
        points: [[X_LANE, -105], [X_LANE, -40]],
        targetKmh: 28,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Пешеходецът е на платното, но колата продължава — „нали мига жълто“…",
      },
      {
        // Straight over the occupied crossing (she is on the western half —
        // ~3 m from the car: pure „непропускане", no contact).
        kind: "drive",
        points: [[X_LANE, -40], [X_LANE, 20], [X_LANE, 58]],
        targetKmh: 28,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Мигащото жълто разрешава преминаване през КРЪСТОВИЩЕТО — никога през човека на пътеката. Чл. 119 не мига.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSigFlashAmberPedTraceName =
  | "shadow-correct"
  | "mistake-hot-approach"
  | "mistake-no-yield";

const SCRIPTS: Record<
  ScSigFlashAmberPedTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSigFlashAmberPedShadowScript },
  "mistake-hot-approach": { kind: "mistake", script: scSigFlashAmberPedMistakeHotApproachScript },
  "mistake-no-yield": { kind: "mistake", script: scSigFlashAmberPedMistakeNoYieldScript },
};

/** Trace names in committed order (shadow first) — the gate's iteration order. */
export const SC_SIG_FLASH_AMBER_PED_TRACE_NAMES: ScSigFlashAmberPedTraceName[] = [
  "shadow-correct",
  "mistake-hot-approach",
  "mistake-no-yield",
];

/**
 * Record one of the three drives against a loaded pe-jay-v1 document — the
 * TEMPLATE's staged walker armed (single truth), sx-n-c dialed FLASHING AMBER
 * (the capability), ambient traffic zero. Deterministic: same district → same
 * trace (seed 7, the house recording seed).
 */
export function recordScSigFlashAmberPedDrive(
  districtRaw: unknown,
  name: ScSigFlashAmberPedTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SIG_FLASH_AMBER_PED_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SIG_FLASH_AMBER_PED.staged ?? [])] as StagedEventSpec[],
    signalModes: SIGNAL_MODES,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
