/**
 * sc-speed-rain — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Скорост в дъжд през нощта" (SP-04, rain speed discipline
 * ×N) on the committed sp-rain-v1 district, recorded at NIGHT in the RAIN (the
 * recorder feeds tick.rain / tick.isNight so the conditions detector is live).
 * No staged actors, ambient traffic ZERO (seed 7).
 *
 * The trace gate replays exactly these through the production stack, under
 * rain + night:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a 38 km/h drive, under the
 *     0.85 × 50 = 42.5 km/h rain envelope; low beams on at night avoid
 *     HEADLIGHTS_OFF_IN_RAIN);
 *   - „Като на сухо в дъжда": accelerating to ~72 km/h grades EXACTLY
 *     SPEEDING_DANGEROUS (over the +10 dangerous band, i.e. > 60). The
 *     acceleration crosses the 55–60 minor band too fast to arm
 *     SPEEDING_OVER_LIMIT, and at 72 > graced 55 the engine's
 *     conditions code is out of range (it is capped at the graced limit) —
 *     the wet-envelope SPEED_TOO_FAST_FOR_CONDITIONS is carried by the
 *     „Каране с потока" demo instead;
 *   - „Каране с потока": holding 48 km/h grades EXACTLY
 *     SPEED_TOO_FAST_FOR_CONDITIONS.
 *
 * Geometry pinned to content/world/sp-rain-v1.json:
 *   street on x = 0, right-lane center x = 4.06, spawn sp-spawn-approach
 *   (4.06, 15) heading north, 360 m long, limit 50 km/h.
 */

import type { OncomingStreamSpec, StagedEventSpec } from "../contracts";
import { SC_SPEED_RAIN } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SPEED_RAIN_ID = "sc-speed-rain";

/** Northbound right-lane center of sp-rain-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpeedRainShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Знакът казва 50, но тази вечер той лъже: в дъжд и тъмнина съобразената скорост е около 38 км/ч." },
      { kind: "glance", mirror: "rear" },
      // 38 km/h — under the rain envelope (42.5 km/h) for the whole street.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Съобразената скорост е тази, при която спираш в осветеното от фаровете платно." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг — дръж резерв." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: намалена за дъжда и нощта скорост през цялата отсечка." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Като на сухо в дъжда" (SPEEDING_DANGEROUS)
// Founder taste-pass: the over-speed must be OBVIOUS. The ghost blows past the
// В26-50 at the district entry and guns to ~72 km/h — +22 over the posted 50,
// well past the +10 dangerous band, so the fault reads as flat-out illegal
// (not a subtle „too fast for the wet"). At 72 > graced 55 the engine's
// conditions code is out of range, so this demo grades SPEEDING_DANGEROUS
// alone; the wet-envelope SPEED_TOO_FAST_FOR_CONDITIONS stays the „поток" demo's.
// ---------------------------------------------------------------------------

export function scSpeedRainMistakeDrySpeedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: газ като на сух, открит път — стрелката прескача 70 при знак В26 „50“ и проливен дъжд.",
      },
      { kind: "glance", mirror: "rear" },
      // Accelerate to ~72 km/h (+22 over the posted 50): past the +10 dangerous
      // band (> 60) → SPEEDING_DANGEROUS. The climb crosses the 55–60 minor
      // band in under 2 s, so SPEEDING_OVER_LIMIT never arms; 72 > graced 55
      // keeps it out of the conditions code's at/under-graced-limit range.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 72, stopAtEnd: false },
      { kind: "annotation", textBg: "72 при ограничение 50 е над +10 км/ч — опасна грешка; на мокрия, тъмен път е и невъзможно да спреш в осветеното платно." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 72 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Съобразената скорост тук е около 38 км/ч — над 30 км/ч под тази, с която мина." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Каране с потока в дъжда" (SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scSpeedRainMistakeFlowAlongScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: потокът кара 48 и водачът върви с него, макар да вали.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 48 km/h — over the 42.5 rain envelope, under the limit: EXACTLY
      // SPEED_TOO_FAST_FOR_CONDITIONS.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 140]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "48 км/ч в дъжд и тъмнина е несъобразена скорост — видимостта и сцеплението са по-малки." },
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 320]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При дъжд намали до около 38 км/ч — спираш в рамките на видимото платно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedRainTraceName = "shadow-correct" | "mistake-dry-speed" | "mistake-flow-along";

const SCRIPTS: Record<
  ScSpeedRainTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedRainShadowScript },
  "mistake-dry-speed": { kind: "mistake", script: scSpeedRainMistakeDrySpeedScript },
  "mistake-flow-along": { kind: "mistake", script: scSpeedRainMistakeFlowAlongScript },
};

// ---------------------------------------------------------------------------
// CLIP-only staging: the traffic that makes the speed READ as wrong
// ---------------------------------------------------------------------------

/**
 * Founder R0 on the produced clip: „again nothing — a car moving forward, no
 * cars in front of it; this is not showing anything to the user, needs complete
 * re-design." He is right, and the reason is structural: SPEEDING_DANGEROUS and
 * SPEED_TOO_FAST_FOR_CONDITIONS are graded off the ego's own speedometer
 * against an empty 360 m straight, so the frame has nothing to measure the
 * speed AGAINST. A number on a HUD is not a hazard.
 *
 * The clip — and ONLY the clip — gets a column of two cars running the ego's
 * own lane at 38 km/h, which is the CORRECT wet-night pace this lesson teaches.
 * Now the frame carries the whole argument: the ghost reels them in at a rate
 * no wet road forgives.
 *   - „Като на сухо" (m0, fault 8.57 s, window ends 12.57 s): the ghost is doing
 *     72 to the column's 38, i.e. closing at 9.4 m/s. The tail car is ~57 m
 *     ahead at the fault and ~23 m ahead when the window closes — over half the
 *     gap eaten in four seconds. It is never REACHED, which matters: the ghost
 *     rides its recorded rails and cannot brake, so anything it caught it would
 *     drive through (the founder's other R0 complaint, on the accident reel).
 *   - „Каране с потока" (m1, fault 8.35 s): the same column sits ~60 m ahead
 *     and barely closes at 48 — „потокът" the demo is named after, made literal.
 *
 * THIS CHANGES NO GRADING. Clip-scoped exactly like the doc 66 R1 precedents
 * (scFollowDistanceClipStaged, reelClipStaged): the recorder still runs
 * SC_SPEED_RAIN.staged (empty), the committed trace bytes are untouched, and
 * the live drill compiles the lesson independently. Promoting the column into
 * the DRILL is a separate change — a lead car in the lane arms the following
 * chain, so it needs a re-record and a fresh exact-code gate.
 */
const SPEED_RAIN_CLIP_TRAFFIC: OncomingStreamSpec = {
  id: "sc-rn-clip-ahead",
  kind: "oncomingStream", // a path-locked column that emits ZERO grading events
  libraryEventId: "ev-speed-rain",
  actor: {
    pathNodes: ["sp-n-start", "sp-n-end"], // NORTHBOUND — the player's own bank
    // 95 m up the street with the tail car 25 m behind it (hold 70). Those two
    // numbers are the no-overlap guarantee: released at ~0.8 s, the tail car is
    // at y ≈ 194 when m0's window closes while the ghost is only at y ≈ 171.
    hold: { nodeIndex: 0, offsetM: 95 },
    cruiseSpeedMps: 10.56, // 38 km/h — the wet-night pace the shadow holds
    colorIndex: 3,
  },
  count: 2,
  gapsM: [25],
  releaseKmh: 6,
};

/** CLIP staged override for sc-speed-rain (both mistakes share the column).
 *  Registered in clipReplay's CLIP_STAGED_OVERRIDES; null anywhere else. */
export function scSpeedRainClipStaged(mistakeIndex: number): StagedEventSpec[] | null {
  if (mistakeIndex !== 0 && mistakeIndex !== 1) return null;
  return [...((SC_SPEED_RAIN.staged ?? []) as StagedEventSpec[]), SPEED_RAIN_CLIP_TRAFFIC];
}

/**
 * Record one of the three drives against a loaded sp-rain-v1 document — at
 * NIGHT in the RAIN (the conditions the archetype is defined by), no staged
 * actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpeedRainDrive(
  districtRaw: unknown,
  name: ScSpeedRainTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SPEED_RAIN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SPEED_RAIN.staged ?? [])] as StagedEventSpec[],
    rain: true,
    isNight: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
