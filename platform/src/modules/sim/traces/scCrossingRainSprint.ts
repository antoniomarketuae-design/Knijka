/**
 * sc-crossing-rain-sprint — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Пътека в дъжд през нощта" (PE-16, the rain
 * sprinter ×N) on the committed pe-rain-v1 district, recorded at NIGHT in the
 * RAIN with the template's OWN staged sprinter (pedestrianDartOut sc-crs-ped,
 * 2.9 m/s — single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack, under
 * rain + night (the recorder feeds tick.rain / tick.isNight so the conditions
 * detectors are live):
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED (a low, rain-adapted
 *     approach; low beams on at night avoid HEADLIGHTS_OFF_IN_RAIN, and 25 km/h
 *     stays under the 0.85 × 50 = 42.5 km/h rain-conditions envelope);
 *   - „Суха скорост в дъжд" grades EXACTLY PEDESTRIAN_CROSSING_TOO_FAST (40 km/h
 *     is over the 30 km/h crossing max but under the rain-conditions envelope,
 *     so it is the crossing fault ALONE, not SPEED_TOO_FAST_FOR_CONDITIONS);
 *   - „Непропускане" grades EXACTLY PEDESTRIAN_NOT_YIELDED;
 *   - „Без светлини в дъжда" (doc 86 L10) grades EXACTLY the two lights codes.
 *     The drill compiles night + rain on all four rungs, so
 *     HEADLIGHTS_OFF_AT_NIGHT (основна) and HEADLIGHTS_OFF_IN_RAIN are armed
 *     unconditionally against it — and until this demo landed, the lesson
 *     neither told the student to switch the lamps on nor showed them what
 *     happens if they do not. The sc-pe-night-unlit „mistake-lights-off"
 *     recipe verbatim: stop OUTSIDE the crossing zone so the lights channel is
 *     the only thing graded.
 *
 * Geometry pinned to content/world/pe-rain-v1.json:
 *   street on x = 0, right-lane center x = 4.06, zebra at y = 95, spawn
 *   pe-spawn-approach (4.06, 15) heading north, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_CROSSING_RAIN_SPRINT } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_CROSSING_RAIN_SPRINT_ID = "sc-crossing-rain-sprint";

/** Northbound right-lane center of pe-rain-v1. */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 95;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scCrossingRainSprintShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Дъжд и тъмнина — карай със съобразена, чувствително по-ниска скорост." },
      { kind: "glance", mirror: "rear" },
      // 25 km/h — под прага за приближаване И под дъждовния таван (42.5 км/ч).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 45]], targetKmh: 25 },
      {
        kind: "annotation",
        textBg: "Пешеходец тича към отсрещния тротоар. Спри плавно и напълно преди зебрата.",
      },
      {
        // Ease down and stop 6.5 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 45], [X_LANE, 70], [X_LANE, Y_ZEBRA - 6.5]],
        targetKmh: 25,
      },
      // The sprinter clears the carriageway fast (~5.6 s); a short, calm wait.
      { kind: "pause", sec: 5, brake: true },
      { kind: "annotation", textBg: "Изчакай го да слезе напълно от платното — при дъжд той бърза и вижда трудно." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е свободна — премини спокойно." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6.5], [X_LANE, 125], [X_LANE, 138]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: намалена за условията скорост и пропуснат пешеходец." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Суха скорост в дъжд" (PEDESTRIAN_CROSSING_TOO_FAST)
// ---------------------------------------------------------------------------

export function scCrossingRainSprintMistakeTooFastScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: суха скорост в дъжда, все едно е сух ден, а пешеходец вече тича по зебрата.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 36 km/h through the zone entry (y ≈ 60): over the 30 km/h crossing
      // max but under the 42.5 km/h rain envelope — the crossing fault ALONE.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 80]], targetKmh: 36, stopAtEnd: false },
      { kind: "annotation", textBg: "Чак сега спирачка — на мокър път пътят за спиране е по-дълъг." },
      {
        // The late brake still stops ~4 m short of the line — ONE fault.
        kind: "drive",
        points: [[X_LANE, 76], [X_LANE, Y_ZEBRA - 4]],
        targetKmh: 5,
      },
      { kind: "pause", sec: 6, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_ZEBRA - 4], [X_LANE, 125]], targetKmh: 18 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "В дъжд и нощ пред заета пътека скоростта трябва да е още по-ниска — тази сухо-дневна скорост тук е опасната грешка (чл. 119).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Непропускане на пешеходеца" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scCrossingRainSprintMistakeNotYieldedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Колата продължава през пътеката, докато пешеходецът още тича по нея в дъжда.",
      },
      { kind: "glance", mirror: "rear" },
      // 28 km/h — legal and under the approach threshold, so the ONLY fault is
      // crossing while the sprinter is still on the occupied zebra.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът е на платното, но колата не спира…" },
      {
        kind: "drive",
        points: [[X_LANE, 60], [X_LANE, 128]],
        targetKmh: 28,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Дори когато пешеходецът бърза непредпазливо, предимството е негово — задължението за спиране остава на водача.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 3 — „Без светлини в дъжда" (doc 86 L10: HEADLIGHTS_OFF_AT_NIGHT
// + HEADLIGHTS_OFF_IN_RAIN)
// ---------------------------------------------------------------------------

export function scCrossingRainSprintMistakeLightsOffScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: скоростта е съобразена, но колата пое в дъждовната нощ с изгасени светлини.",
      },
      // Headlights OFF, set explicitly: the recorder's NIGHT default is "low",
      // so the dark drive has to author it. The car rests at y = 52 — 43 m from
      // the zebra, OUTSIDE both the ~35 m crossing zone and the sprinter's 40 m
      // release ring — so the lights channel is the only thing this demo grades
      // and the sprinter never leaves the kerb.
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 52]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "В дъжд през нощта фаровете не са за да виждаш ти — те са и това, по което мокрият пешеходец иззад чадъра си преценява има ли кола.",
      },
      {
        kind: "annotation",
        textBg: "Късите се включват със запалването: първо светлините, чак после разговорът за скорост.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScCrossingRainSprintTraceName =
  | "shadow-correct"
  | "mistake-too-fast"
  | "mistake-not-yielded"
  | "mistake-lights-off";

const SCRIPTS: Record<
  ScCrossingRainSprintTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scCrossingRainSprintShadowScript },
  "mistake-too-fast": { kind: "mistake", script: scCrossingRainSprintMistakeTooFastScript },
  "mistake-not-yielded": { kind: "mistake", script: scCrossingRainSprintMistakeNotYieldedScript },
  "mistake-lights-off": { kind: "mistake", script: scCrossingRainSprintMistakeLightsOffScript },
};

/**
 * Record one of the three drives against a loaded pe-rain-v1 document — at
 * NIGHT in the RAIN (the conditions the archetype is defined by), the
 * TEMPLATE's staged sprinter armed (single truth), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScCrossingRainSprintDrive(
  districtRaw: unknown,
  name: ScCrossingRainSprintTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_CROSSING_RAIN_SPRINT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_CROSSING_RAIN_SPRINT.staged ?? [])] as StagedEventSpec[],
    rain: true,
    isNight: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
