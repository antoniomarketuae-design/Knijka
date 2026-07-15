/**
 * sc-ac-night-lights — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Нощно каране без светлини" (AC-01) on the committed
 * ac-night-v1 district, recorded at NIGHT (the recorder feeds tick.isNight so
 * the headlight detector is live). No staged actors, ambient traffic ZERO
 * (seed 7).
 *
 * The trace gate replays exactly these through the production stack, at night:
 *   - shadow: low beams on (the recorder's night DEFAULT is already "low") for a
 *     centered ~44 km/h drive → ZERO violations + CLEAN_DRIVING (night's
 *     prudent-speed factor is 1, so cruising under the limit is lawful);
 *   - „Никога не включени светлини": {headlights:"off"} from the start grades
 *     EXACTLY HEADLIGHTS_OFF_AT_NIGHT (2 s sustain while moving);
 *   - „Изгасени по време на движение": low beams on, then {headlights:"off"}
 *     mid-drive, grades EXACTLY HEADLIGHTS_OFF_AT_NIGHT.
 *
 * Geometry pinned to content/world/ac-night-v1.json: street on x = 0, right-lane
 * center x = 4.06, spawn ac-night-spawn-approach (4.06, 15) heading north, 360 m
 * long, limit 50 km/h. The drives stay centered and under the limit so nothing
 * but the headlight channel is gradable.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_AC_NIGHT_LIGHTS } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_NIGHT_LIGHTS_ID = "sc-ac-night-lights";

/** Northbound right-lane center of ac-night-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — low beams on the whole way
// ---------------------------------------------------------------------------

export function scAcNightLightsShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тъмно е — включи късите светлини още при запалването на двигателя." },
      // Low beams on: matches the recorder's night default, stated for the story.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Късите светлини осветяват пътя пред теб и те правят видим за другите." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Не се води по светлото табло — то не осветява пътя и не се вижда отвън." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка с включени къси светлини." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Никога не включени светлини" (HEADLIGHTS_OFF_AT_NIGHT)
// ---------------------------------------------------------------------------

export function scAcNightLightsMistakeNeverOnScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата потегля по тъмно с изключени светлини." },
      // Lights off at night from the first frame → HEADLIGHTS_OFF_AT_NIGHT after
      // the 2 s sustain. Speed legal, lane centered: no other code.
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Пътят напред е черен, а колата е невидима в огледалата на другите." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Включи късите светлини още при запалването по тъмно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изгасени по време на движение" (HEADLIGHTS_OFF_AT_NIGHT)
// ---------------------------------------------------------------------------

export function scAcNightLightsMistakeTurnedOffScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: тръгва с къси светлини, но ги изгася в движение." },
      // Start correctly lit, then kill the lights mid-drive → the detector arms
      // and fires HEADLIGHTS_OFF_AT_NIGHT after 2 s of dark motion.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Изгася светлините в движение — и продължава да кара на тъмно без тях." },
      { kind: "headlights", setting: "off" },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 320]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "По тъмно късите светят непрекъснато — не се изгасят в движение." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcNightLightsTraceName = "shadow-correct" | "mistake-never-on" | "mistake-turned-off";

const SCRIPTS: Record<
  ScAcNightLightsTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcNightLightsShadowScript },
  "mistake-never-on": { kind: "mistake", script: scAcNightLightsMistakeNeverOnScript },
  "mistake-turned-off": { kind: "mistake", script: scAcNightLightsMistakeTurnedOffScript },
};

/**
 * Record one of the three drives against a loaded ac-night-v1 document — at
 * NIGHT, no staged actors, ambient traffic zero. Deterministic: same district →
 * same trace.
 */
export function recordScAcNightLightsDrive(
  districtRaw: unknown,
  name: ScAcNightLightsTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_NIGHT_LIGHTS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_NIGHT_LIGHTS.staged ?? [])] as StagedEventSpec[],
    isNight: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
