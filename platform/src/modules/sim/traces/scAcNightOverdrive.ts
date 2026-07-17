/**
 * sc-ac-night-overdrive — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Не изпреварвай собствените си фарове"
 * (SP-07 + AC-01) on the committed ov-oncoming-v1 district, recorded at NIGHT.
 * No staged actors, ambient traffic ZERO (seed 7): the ONLY hazard is an unlit
 * STALLED TRAILER ahead in the lane, staged as a recorder obstacle rect (the
 * sc-ac-wet-braking mold), so the ONLY things the stack can grade are the
 * driver's night speed, the lights channel and any contact with the trailer.
 *
 * THE ENVELOPE THE DEMOS ARE TUNED AGAINST (read before editing):
 *   - the drives record with the template's OWN ruleConfig
 *     (conditionSpeedNightFactor 0.65 — the unlit-segment authoring, see the
 *     template header), so the recorder's internal grader runs EXACTLY the
 *     config the live lesson runs: envelope 0.65 × 90 = 58.5 km/h;
 *   - the recorder is KINEMATIC and its stop envelope tracks 0.7 × the step's
 *     decel cap, i.e. 0.7 × SCRIPT_DECEL = 3.22 m/s² by default. From 50 km/h
 *     that is exactly 30 m — so the shadow's final step (given 50 m of room)
 *     brakes of its own accord at y ≈ 360, which is the ~40 m beam edge ahead
 *     of the trailer. The geometry and the story are the same number;
 *   - from 90 km/h the same envelope needs ~97 m: the „по знака" demo cannot
 *     stop inside the beam no matter how promptly it reacts. That is the
 *     archetype, not a tuning artifact.
 *
 * The trace gate replays exactly these through the production stack, at night:
 *   - shadow: low beams (the recorder's NIGHT default is already "low"; set
 *     explicitly for the story), a centered ~50 km/h drive under the 58.5
 *     envelope, brake at the beam edge, rest at the mark (y = 390) ~5.7 m short
 *     of the trailer → ZERO violations + CLEAN_DRIVING;
 *   - „90 км/ч на къси светлини": lights correct, but the posted 90 carried
 *     through the dark (> 58.5 sustained ≫ 3 s) and braking only once the
 *     trailer is in the beam — ploughs in at ~70 km/h → EXACTLY
 *     SPEED_TOO_FAST_FOR_CONDITIONS + COLLISION, never SPEEDING_* (90 sits
 *     under the graced 99, and the conditions code is capped at the graced
 *     limit by construction: lawful speed, imprudent for the dark);
 *   - „без светлини": adapted ~50 km/h but headlights OFF, and it stops at
 *     y = 300 — well short of the trailer → EXACTLY HEADLIGHTS_OFF_AT_NIGHT
 *     (2 s sustain), never the speed code (under the envelope) and never
 *     COLLISION (the two demos are two separate lessons).
 *
 * Geometry pinned to content/world/ov-oncoming-v1.json: road on x = 0, own-lane
 * center x = 4.06, spawn ovg-spawn-start (4.06, 15) heading north, 900 m long,
 * limit 90. The drives stay centered in the own lane the whole way, so the
 * overtake corridor never arms and nothing but the night channels is gradable.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_AC_NIGHT_OVERDRIVE } from "../lessons/scenario/templates-conditions2";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_NIGHT_OVERDRIVE_ID = "sc-ac-night-overdrive";

/** Own-lane (northbound) center of ov-oncoming-v1. */
const LANE_X = 4.06;
/** The stop mark the shadow eases to a full stop at (denormalized in the template). */
const STOP_MARK_Y = 390;
/** The unlit stalled trailer's centre in the lane. */
const TRAILER_Y = 400;
/** Where the trailer enters the ~40 m low-beam cone (nose at 360 + 2.02 is
 *  ~38 m from the trailer's body): the shadow's own brake point, and the point
 *  at which the „по знака" demo first has anything to react to. */
const BEAM_EDGE_Y = 360;

/** An unlit stalled trailer (the sc-ac-wet-braking van footprint) centred in
 *  the lane at (4.06, 400): the obstruction the driver must stop short of —
 *  and the one the beam only reveals at ~40 m. */
export function nightTrailerObstacle(): ObstacleRect2D[] {
  return [
    {
      x: LANE_X,
      y: TRAILER_Y,
      headingDeg: 0,
      halfWidthM: 0.9,
      halfLengthM: 2.25,
      withWhat: "vehicle" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — ~50 km/h, stop inside the beam
// ---------------------------------------------------------------------------

export function scAcNightOverdriveShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Неосветен път, нощ: късите светлини показват около 40 метра — и нищо отвъд тях." },
      // Low beams set explicitly: the recorder's NIGHT default is already
      // "low", but the shadow demonstrates the correct пакет, not the default.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~50 km/h — under the 0.65 × 90 = 58.5 km/h authored night envelope, and
      // the speed whose stopping distance fits inside the 40 m beam.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, 260]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Знакът разрешава 90 — но 90 се спират за над 70 метра, а виждаш 40. Караме 50." },
      { kind: "drive", points: [[LANE_X, 260], [LANE_X, 340]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Гледай до КРАЯ на осветеното, не в асфалта пред капака — там се появяват нещата." },
      // 50 m of room for a 30 m stop: the recorder brakes on its own at
      // y ≈ 360 — exactly where the trailer enters the beam.
      { kind: "drive", points: [[LANE_X, 340], [LANE_X, STOP_MARK_Y]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Препятствието влезе в снопа и спряхме в него, с метри в аванс — точно за това служат 50-те." },
      { kind: "annotation", textBg: "Правилото: нощем на къси светлини таванът ти са фаровете, не табелата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „90 км/ч на къси светлини"
// (SPEED_TOO_FAST_FOR_CONDITIONS + COLLISION)
// ---------------------------------------------------------------------------

export function scAcNightOverdriveMistakePostedLimitScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: 90 км/ч в тъмното — „нали е в ограничението“." },
      // Lights correct (low beams on) so the ONLY gradable channels are the
      // night speed and the contact: the posted 90 is LAWFUL — and blind.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // 90 sustained for ~14 s — far over the 58.5 envelope (3 s sustain), yet
      // under the graced 99, so the CONDITIONS code bills and SPEEDING_* cannot.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, BEAM_EDGE_Y]], targetKmh: 90, stopAtEnd: false },
      { kind: "annotation", textBg: "Препятствието влиза в снопа на 40 метра — но от 90 км/ч спирачният път е над 70." },
      // Braking begins the instant the trailer is visible; the envelope needs
      // ~97 m and it has ~38 — the car ploughs in at ~70 km/h.
      { kind: "drive", points: [[LANE_X, BEAM_EDGE_Y], [LANE_X, 404]], targetKmh: 90 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ударът беше решен още преди да го видиш: на къси светлини 90 значи да изпревариш фаровете си." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Тъмен участък без включени фарове"
// (HEADLIGHTS_OFF_AT_NIGHT)
// ---------------------------------------------------------------------------

export function scAcNightOverdriveMistakeLightsOffScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: скоростта е съобразена, но колата пое в тъмното с изгасени светлини." },
      // Headlights OFF, set explicitly: the recorder's NIGHT default is "low",
      // so the dark drive must author it. The speed stays under the envelope —
      // the lights channel is the ONLY thing this demo grades.
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, 300]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Без къси светлини няма дори 40-те метра: караш на сляпо и си невидим за насрещните." },
      { kind: "annotation", textBg: "Късите се включват със запалването по тъмно — чак после се говори за скорост (чл. 70)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcNightOverdriveTraceName =
  | "shadow-correct"
  | "mistake-posted-limit"
  | "mistake-lights-off";

const SCRIPTS: Record<
  ScAcNightOverdriveTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcNightOverdriveShadowScript },
  "mistake-posted-limit": { kind: "mistake", script: scAcNightOverdriveMistakePostedLimitScript },
  "mistake-lights-off": { kind: "mistake", script: scAcNightOverdriveMistakeLightsOffScript },
};

/**
 * Record one of the three drives against a loaded ov-oncoming-v1 document — at
 * NIGHT, the trailer obstacle armed, ambient traffic zero (the harness law).
 * The template's OWN ruleConfig is passed through, so the recorder's internal
 * grader runs the same unlit-segment night envelope the live lesson runs.
 * collisionMinKmh 5 so even a gentle overrun into the trailer grades COLLISION.
 * Deterministic: same district → same trace.
 */
export function recordScAcNightOverdriveDrive(
  districtRaw: unknown,
  name: ScAcNightOverdriveTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_NIGHT_OVERDRIVE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_NIGHT_OVERDRIVE.staged ?? [])] as StagedEventSpec[],
    isNight: true,
    obstacles: nightTrailerObstacle(),
    collisionMinKmh: 5,
    ...(SC_AC_NIGHT_OVERDRIVE.ruleConfig ? { ruleConfig: SC_AC_NIGHT_OVERDRIVE.ruleConfig } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
