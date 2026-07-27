/**
 * sc-ac-rain-lights — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дъжд без светлини" (AC-02) on the committed ac-rain-v1
 * district, recorded in DAY RAIN (the recorder feeds tick.rain with isNight
 * false so the DAY rain-lights detector is live). No staged actors, ambient
 * traffic ZERO (seed 7).
 *
 * The trace gate replays exactly these through the production stack, in day rain:
 *   - shadow: low beams ON (set EXPLICITLY — the recorder's DAY default is "off",
 *     which would itself grade the code) for a centered ~38 km/h drive, under the
 *     0.85 × 50 = 42.5 km/h rain envelope → ZERO violations + CLEAN_DRIVING;
 *   - „Виждам си добре": {headlights:"off"} the whole way grades EXACTLY
 *     HEADLIGHTS_OFF_IN_RAIN (3 s sustain), never SPEED_TOO_FAST_FOR_CONDITIONS
 *     (speed stays under the envelope);
 *   - „Чистачки без светлини": low beams, then {headlights:"off"} mid-drive,
 *     grades EXACTLY HEADLIGHTS_OFF_IN_RAIN.
 *
 * Geometry pinned to content/world/ac-rain-v1.json: street on x = 0, right-lane
 * center x = 4.06, spawn ac-rain-spawn-approach (4.06, 15) heading north, 360 m
 * long, limit 50 km/h. The drives stay centered and at ~38 km/h so nothing but
 * the headlight channel is gradable.
 */

import type { OncomingStreamSpec, StagedEventSpec } from "../contracts";
import { SC_AC_RAIN_LIGHTS } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_RAIN_LIGHTS_ID = "sc-ac-rain-lights";

/** Northbound right-lane center of ac-rain-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — low beams on, adapted rain speed
// ---------------------------------------------------------------------------

export function scAcRainLightsShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Вали, макар да е ден — правило „чистачки → светлини“: включи късите." },
      // Low beams ON, set explicitly: the recorder's DAY default is "off", which
      // would itself grade HEADLIGHTS_OFF_IN_RAIN — the shadow must turn them on.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // 38 km/h — under the rain envelope (42.5 km/h) for the whole street.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Светлините в дъжд не са за да виждаш, а за да те виждат другите." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Скоростта е свалена за мокрия път — около 38 км/ч, под ограничението." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка с включени къси светлини в дъжда." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Виждам си добре" (HEADLIGHTS_OFF_IN_RAIN)
// ---------------------------------------------------------------------------

export function scAcRainLightsMistakeNeverOnScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дневен порой, а колата кара без светлини — „нали виждам добре“." },
      // Lights off in day rain → HEADLIGHTS_OFF_IN_RAIN after the 3 s sustain.
      // Speed under 42.5: no SPEED_TOO_FAST_FOR_CONDITIONS. Set explicitly to
      // match the story (the day default is also "off").
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Сивата кола без светлини изчезва в пелената и в мокрите огледала." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Светлините в дъжд са за да те виждат — включи ги, преди да потеглиш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Чистачки без светлини" (HEADLIGHTS_OFF_IN_RAIN)
// ---------------------------------------------------------------------------

export function scAcRainLightsMistakeWipersOnlyScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: пуска чистачките, но изгася светлините в движение." },
      // Start correctly lit, then kill the lights mid-drive → the day rain-lights
      // detector arms and fires HEADLIGHTS_OFF_IN_RAIN after 3 s. Speed stays
      // under the rain envelope, lane centered: no other code.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Половината правило: чистачките вървят, но светлините не." },
      { kind: "headlights", setting: "off" },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 320]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Тръгнат ли чистачките, светват и късите — двете вървят винаги заедно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcRainLightsTraceName = "shadow-correct" | "mistake-never-on" | "mistake-wipers-only";

const SCRIPTS: Record<
  ScAcRainLightsTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcRainLightsShadowScript },
  "mistake-never-on": { kind: "mistake", script: scAcRainLightsMistakeNeverOnScript },
  "mistake-wipers-only": { kind: "mistake", script: scAcRainLightsMistakeWipersOnlyScript },
};

// ---------------------------------------------------------------------------
// CLIP-only staging: somebody who has to SEE the unlit car
// ---------------------------------------------------------------------------

/**
 * FOUNDER R0 on the produced clip („…the road is completely and finely visible
 * and this contradicts the question itself"). He is reading the frame exactly
 * right, and the frame was wrong twice over:
 *
 *  1. This lesson's own teach copy says the lights in rain „не са за да виждаш,
 *     а за да те виждат другите" — and the recorded demo drives an EMPTY road.
 *     There was nobody in the picture for whom the unlit car was invisible, so
 *     the only claim the clip could make was the one the founder rejected:
 *     „the road is perfectly visible". The lesson is about being SEEN, so the
 *     frame must contain someone doing the seeing.
 *  2. The weather itself: day rain is a RENDER concern (sky/exposure), reported
 *     separately — staging cannot make a bright sky grey.
 *
 * So the CLIP — and only the clip — gets a stream of oncoming cars on the far
 * bank, closing on the ghost through the whole [0, 10 s] window. `oncomingStream`
 * is the learn-only carrier: its runner emits ZERO SimTick events except a
 * contact check, and the stream rides the OTHER carriageway (southbound path
 * order) which the centred ghost never enters — so nothing it can touch, and
 * nothing it can grade.
 *
 * Arc arithmetic (release is keyed to the ghost's own move-off, ~0.8 s at
 * releaseKmh 6; positions are a pure function of time from there): car 0 holds
 * 270 m along the southbound path = district y ≈ 90, the next two 30 m further
 * back up the path (y ≈ 120 / 150). At the ENGINE fault (t = 3.63 s, ghost at
 * y ≈ 30) car 0 is ~30 m ahead and closing at ~21 m/s; the three pass the ghost
 * across the rest of the window.
 *
 * THIS CHANGES NO GRADING — clip-scoped exactly like scSpeedRainClipStaged and
 * reelClipStaged: the recorder still runs SC_AC_RAIN_LIGHTS.staged, the
 * committed trace bytes are untouched, and the live drill compiles its lesson
 * independently. Promoting the stream into the DRILL is a separate change (an
 * oncoming bank on a rain street feeds the overtake-corridor tracker and would
 * need a re-record plus a fresh exact-code gate).
 */
const RAIN_LIGHTS_CLIP_ONCOMING: OncomingStreamSpec = {
  id: "sc-acr-clip-oncoming",
  kind: "oncomingStream",
  libraryEventId: "ev-adverse-weather",
  actor: {
    pathNodes: ["ac-rain-n-end", "ac-rain-n-start"], // SOUTHBOUND — the far bank
    hold: { nodeIndex: 0, offsetM: 270 }, // district y ≈ 90
    cruiseSpeedMps: 10.6, // ~38 km/h — the same rain-adapted pace the shadow holds
    colorIndex: 4,
  },
  count: 3,
  gapsM: [30, 60],
  releaseKmh: 6,
};

/** CLIP staged override for sc-ac-rain-lights (both mistakes share the stream —
 *  both are „driving unlit in rain", and both need someone to be unseen BY).
 *  Registered in clipReplay's CLIP_STAGED_OVERRIDES; null anywhere else. */
export function scAcRainLightsClipStaged(mistakeIndex: number): StagedEventSpec[] | null {
  if (mistakeIndex !== 0 && mistakeIndex !== 1) return null;
  return [...(SC_AC_RAIN_LIGHTS.staged ?? []), RAIN_LIGHTS_CLIP_ONCOMING] as StagedEventSpec[];
}

/**
 * Record one of the three drives against a loaded ac-rain-v1 document — in DAY
 * RAIN, no staged actors, ambient traffic zero. Deterministic: same district →
 * same trace.
 */
export function recordScAcRainLightsDrive(
  districtRaw: unknown,
  name: ScAcRainLightsTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_RAIN_LIGHTS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_RAIN_LIGHTS.staged ?? [])] as StagedEventSpec[],
    rain: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
