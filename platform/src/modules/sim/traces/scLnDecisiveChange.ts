/**
 * sc-ln-decisive-change — the authored drives (doc 76 §5/§9): ONE correct
 * shadow demonstration + TWO mistake demos for „Решително престрояване в поток"
 * (ЗДвП чл. 25) on the committed ln-v1 district, recorded with the template's
 * OWN staged target-lane car (rearTailgater sc-lndc-target — single truth,
 * imported from the template). Ambient traffic ZERO (seed 7), dry day.
 *
 * The rearTailgater runner emits ZERO SimTick events by contract (doc 72 FO-07
 * pressure scenery), so everything the gate asserts comes from the PLAYER's own
 * channels — and the collision demo's contact is an AUTHORED beat
 * (DriveStep.collision — the sc-vu-blindspot-moto precedent on this same map),
 * not a physical overlap the runner could never produce.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: paces the right lane → left glance reads the target-lane car →
 *     HOLDS the lane while it draws level and passes → fresh glance + indicator
 *     + shoulder → decisive crossing into the gap BEHIND it. ZERO violations +
 *     SAFE_LANE_CHANGE;
 *   - „Престрояване върху колата в мъртвата зона": a REAR-mirror glance only
 *     (never left), indicator ON, wheel over while the car is alongside →
 *     EXACTLY LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION (never
 *     LANE_CHANGE_WITHOUT_INDICATOR — signalling without looking IS the demo);
 *   - „Половинчато вмъкване, което кара другия да спира": left glance present
 *     (the car was SEEN and waited out), NO indicator, and the wheel stops on
 *     the divider (x = 7.8) instead of committing → EXACTLY
 *     LANE_CHANGE_WITHOUT_INDICATOR + POOR_LANE_KEEPING.
 *
 * Geometry pinned to content/world/ln-v1.json: a 2+2 straight boulevard on
 * y ∈ [0, 400], RIGHT-lane center x = 12.19, LEFT-lane center x = 4.06 (lane
 * boundary x = 8.125), spawn ln-spawn-start (12.19, 15) heading north, limit
 * 50 km/h. ONE edge, so no segment joint can eat a lane delta
 * (laneChangeJointGraceSec is inert here).
 *
 * Rule envelope the scripts respect (rules/engine.ts §3/§4, cfg defaults): the
 * lane change grades when tick.laneId crosses the boundary at ≥ 10 km/h in a
 * forward gear. indicatorOk = a matching-direction indicator within
 * indicatorLookbackSec = 3 s; mirrorOk = a matching-direction glance within
 * mirrorLookbackSec = 5 s (DIRECTION-keyed — a `rear` glance never satisfies a
 * left crossing, which is what makes the mirror-only demo honest). The half-
 * merge parks the car at x = 7.8: laneOffsetM ≈ −3.74, past laneKeepMaxOffsetM
 * (3.25) toward the DIVIDER, so the center-line condition (which needs the
 * offset toward oncoming) never arms and the generic lane-keeping episode fires
 * after laneKeepSustainSec = 3 s — POOR_LANE_KEEPING, held well under the 12 s
 * keepRightSustainSec so NOT_KEEPING_RIGHT stays silent.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_LN_DECISIVE_CHANGE } from "../lessons/scenario/templates-lanes3";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_LN_DECISIVE_CHANGE_ID = "sc-ln-decisive-change";

/** ln-v1 lane centers + the half-merge divider line. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;
// The half-merge straddle. The world runtime flips laneId 0→1 at x ≈ 7.64 when
// approached from the right (hysteresis off the 8.125 drawn boundary), and the
// slot is sticky once entered, so the drive dips clearly PAST the flip (to
// x = 6.5 — a real lane change with no indicator) and then hovers at x = 7.5:
// laneId 1, laneOffsetM ≈ −3.44 (past laneKeepMaxOffsetM 3.25 toward the
// DIVIDER), which grades POOR_LANE_KEEPING without re-flipping to laneId 0.
const X_HALF = 7.5;
/** The flow pace, km/h (posted limit 50). */
const FLOW_KMH = 34;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — wait for the pass, then merge decisively
// ---------------------------------------------------------------------------

export function scLnDecisiveChangeShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Стабилно в дясната лента. В лявата лента идва кола — не се хвърляй пред нея." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 80], [X_RIGHT, 140]], targetKmh: FLOW_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Поглед в лявото огледало — прецени скоростта ѝ. Тя е по-бърза от теб." },
      // The observation glance that READS the target-lane car — the teaching
      // beat, not the maneuver check (the crossing arms its own fresh pair).
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_RIGHT, 140], [X_RIGHT, 200]], targetKmh: FLOW_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Изчакай я да те изравни и да отмине. Зад нея се отваря реалната пролука." },
      { kind: "drive", points: [[X_RIGHT, 200], [X_RIGHT, 260]], targetKmh: FLOW_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата е напред, пролуката зад нея е чиста. Чак сега започва маневрата." },
      // The учебен ред, all inside the lookback windows before the crossing:
      // огледало (glance-left) → мигач (indicator-left) → рамо (a second
      // glance-left as the blind-spot check) → плавна, решителна маневра.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Ляв мигач, после бърз поглед през рамо — и чак тогава воланът." },
      { kind: "glance", mirror: "left" },
      {
        // Decisive diagonal into the LEFT lane — one clean line to the center,
        // no hovering on the divider. The laneId boundary (x = 8.125) is crossed
        // ~2 s after the glance+indicator armed (inside both lookback windows).
        kind: "drive",
        points: [[X_RIGHT, 268], [9.6, 279], [6.0, 293], [X_LEFT, 312], [X_LEFT, 340]],
        targetKmh: FLOW_KMH,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LEFT, 340], [X_LEFT, 368]], targetKmh: FLOW_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изчака пролуката, обяви я и я зае в едно движение — никого не накара да спре." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Престрояване върху колата в мъртвата зона"
// (LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION)
// ---------------------------------------------------------------------------

export function scLnDecisiveChangeMistakeBlindSpotScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: поглед в огледалото за обратно виждане — „чисто е“ — и воланът тръгва." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 80], [X_RIGHT, 140]], targetKmh: FLOW_KMH, stopAtEnd: false },
      // The driver DID signal (indicator is OK) and DID look in the rear-view
      // mirror — but the glance channel is direction-keyed, and no LEFT glance
      // is ever made: the left blind spot stays unchecked. The target-lane car
      // is drawing level right now.
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Мигач — да. Но нито ляво огледало, нито поглед през рамо. А колата е точно там." },
      {
        kind: "drive",
        points: [[X_RIGHT, 140], [10.0, 153], [6.0, 170], [X_LEFT, 190]],
        targetKmh: FLOW_KMH,
        stopAtEnd: false,
      },
      // The authored consequence: the alongside car is struck by the car moving
      // into the lane it occupies.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Огледалото за обратно виждане не показва страничната мъртва зона — а там имаше цяла кола. Рамото е половин секунда.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Половинчато вмъкване, което кара другия да спира"
// (LANE_CHANGE_WITHOUT_INDICATOR + POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scLnDecisiveChangeMistakeHalfMergeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: водачът изчака колата, но после увисна на границата между лентите." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 80], [X_RIGHT, 140]], targetKmh: FLOW_KMH, stopAtEnd: false },
      // The driver DID look (mirror is OK) and waited the car out — the isolated
      // faults are the missing indicator and the half-taken lane, so NO left
      // signal is ever armed.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Огледа се, изчака колата да отмине — дотук добре." },
      { kind: "drive", points: [[X_RIGHT, 140], [X_RIGHT, 200]], targetKmh: FLOW_KMH, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "…но без мигач, и воланът увисва насред маркировката — нито в едната лента, нито в другата." },
      {
        // Nose into the left lane (past the laneId flip at x ≈ 7.64 → a real
        // lane change with NO indicator) but never commit to the center —
        // the diagonal bottoms out at x = 6.5.
        kind: "drive",
        points: [[X_RIGHT, 208], [10.5, 222], [8.0, 234], [6.5, 248]],
        targetKmh: FLOW_KMH,
        stopAtEnd: false,
      },
      {
        // Drift back OUT to the divider (x = 7.5) and hover there — the
        // half-merge. Held straddling (laneOffsetM ≈ −3.44) for > 3 s.
        kind: "drive",
        points: [[6.5, 248], [X_HALF, 262], [X_HALF, 300]],
        targetKmh: 24,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Без мигач движещият се зад теб не може да предвиди маневрата, а увисналата на маркировката кола кара съседа да спре. Влизай решително, в една линия до средата на лентата.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScLnDecisiveChangeTraceName =
  | "shadow-correct"
  | "mistake-blind-spot"
  | "mistake-half-merge";

const SCRIPTS: Record<
  ScLnDecisiveChangeTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scLnDecisiveChangeShadowScript },
  "mistake-blind-spot": { kind: "mistake", script: scLnDecisiveChangeMistakeBlindSpotScript },
  "mistake-half-merge": { kind: "mistake", script: scLnDecisiveChangeMistakeHalfMergeScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged target-lane car armed (single truth), ambient traffic zero
 * (the harness law). Deterministic: same district → same trace.
 */
export function recordScLnDecisiveChangeDrive(
  districtRaw: unknown,
  name: ScLnDecisiveChangeTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_LN_DECISIVE_CHANGE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_LN_DECISIVE_CHANGE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
