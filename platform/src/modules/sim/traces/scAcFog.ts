/**
 * sc-ac-fog — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Мъгла" (AC-03) on the committed ac-rain-v1 district,
 * recorded in DAY DENSE FOG (the recorder feeds tick.fog with isNight false —
 * the FOG weather unlock: conditions envelope 0.6 × 50 = 30 km/h + the
 * fog-lamp duty). No staged actors, ambient traffic ZERO (seed 7).
 *
 * The trace gate replays exactly these through the production stack, in fog:
 *   - shadow: FOG LAMPS ON (the recorder's fogLights channel — default off,
 *     so the shadow must set it) + low beams, a centered ~25 km/h drive under
 *     the 30 km/h fog envelope → ZERO violations + CLEAN_DRIVING;
 *   - „като на сухо": fog lamps on but ~38 km/h — legal in rain (42.5), too
 *     fast for fog — grades EXACTLY SPEED_TOO_FAST_FOR_CONDITIONS (3 s
 *     sustain), never the fog-lamp code (lamps are on);
 *   - „без фарове за мъгла": adapted ~25 km/h but fog lamps LEFT OFF —
 *     grades EXACTLY FOG_LIGHTS_OFF_IN_FOG (3 s sustain), never the speed
 *     code (under the envelope).
 *
 * Geometry pinned to content/world/ac-rain-v1.json: street on x = 0, right-
 * lane center x = 4.06, spawn ac-rain-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The drives stay centered so nothing but
 * the fog channels is gradable.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_AC_FOG } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_FOG_ID = "sc-ac-fog";

/** Northbound right-lane center of ac-rain-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — fog lamps + low beams, ~25 km/h
// ---------------------------------------------------------------------------

export function scAcFogShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Гъста мъгла: фарове за мъгла и къси светлини — още преди потеглянето." },
      // BOTH light channels set explicitly: the recorder's day defaults are
      // headlights "off" and fog lamps OFF — the latter would itself grade
      // FOG_LIGHTS_OFF_IN_FOG; the shadow demonstrates the correct пакет.
      { kind: "headlights", setting: "low" },
      { kind: "fogLights", on: true },
      { kind: "glance", mirror: "rear" },
      // ~25 km/h — half the limit, comfortably under the 0.6 × 50 = 30 km/h
      // fog envelope: the „спри в рамките на видимостта" speed at ~50 m sight.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 25, stopAtEnd: false },
      { kind: "annotation", textBg: "Караш толкова бързо, колкото виждаш — тук около 25 км/ч, не 50." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 25, stopAtEnd: false },
      { kind: "annotation", textBg: "Фаровете за мъгла светят ниско под пелената — и те правят видим за другите." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка със смъкната скорост и включени фарове за мъгла." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „като на сухо" (SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scAcFogMistakeDrySpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: кара близо 40 км/ч в мъглата — „нали е под ограничението“." },
      // Lamps correct (fog lamps ON, low beams) so the ONLY gradable channel
      // is the speed: 38 km/h sits under rain's 42.5 envelope but far over
      // fog's 30 — exactly the dry-habit speed the AC-03 archetype demos.
      { kind: "headlights", setting: "low" },
      { kind: "fogLights", on: true },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "На 50 метра видимост препятствието „изплува“ твърде късно за тази скорост." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "В мъгла скоростта се смъква драстично — спираш В РАМКИТЕ на видимото." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „без фарове за мъгла" (FOG_LIGHTS_OFF_IN_FOG)
// ---------------------------------------------------------------------------

export function scAcFogMistakeNoFogLightsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: скоростта е съобразена, но фаровете за мъгла остават изключени." },
      // Adapted speed (under the fog envelope) and low beams on — the ONLY
      // gradable channel is the fog-lamp duty. The recorder's default for the
      // channel is already OFF; set explicitly to match the story.
      { kind: "headlights", setting: "low" },
      { kind: "fogLights", on: false },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 25, stopAtEnd: false },
      { kind: "annotation", textBg: "Късите се отразяват в пелената — колата остава смътно петно за другите." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При значително намалена видимост: фарове за мъгла + къси, заедно (чл. 74)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcFogTraceName = "shadow-correct" | "mistake-dry-speed" | "mistake-no-fog-lights";

const SCRIPTS: Record<
  ScAcFogTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcFogShadowScript },
  "mistake-dry-speed": { kind: "mistake", script: scAcFogMistakeDrySpeedScript },
  "mistake-no-fog-lights": { kind: "mistake", script: scAcFogMistakeNoFogLightsScript },
};

/**
 * Record one of the three drives against a loaded ac-rain-v1 document — in
 * DAY DENSE FOG, no staged actors, ambient traffic zero. Deterministic: same
 * district → same trace.
 */
export function recordScAcFogDrive(
  districtRaw: unknown,
  name: ScAcFogTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_FOG_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_FOG.staged ?? [])] as StagedEventSpec[],
    fog: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
