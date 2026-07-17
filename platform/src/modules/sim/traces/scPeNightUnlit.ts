/**
 * sc-pe-night-unlit — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Неосветена пътека нощем" (PE-09 night axis + PE-02
 * dart) on the committed pe-dart-v1 district, recorded at NIGHT with the
 * template's OWN staged figure (pedestrianDartOut sc-pnu-ped, 1.4 m/s, released
 * only when the player closes within 30 m — single truth, imported from the
 * template). Ambient traffic ZERO (seed 7): the figure is the only actor.
 *
 * THE ENVELOPE THE DEMOS ARE TUNED AGAINST (read before editing):
 *   - the crossing zone arms at CROSSING_ZONE_RADIUS_M = 35 from (0, 80), i.e.
 *     at y ≈ 45.2 in the driving lane — with the figure still at the curb, so
 *     `pedestrianSeen` is FALSE there. She flips it ~1.14 s after the trigger
 *     (roadFromM 1.6 at 1.4 m/s), and only THEN can the 30 km/h approach cap
 *     (crossingApproachMaxKmh, 1 s sustain) bill anything;
 *   - the recorder is KINEMATIC: its stop envelope tracks 0.7 × SCRIPT_DECEL =
 *     3.22 m/s². From 26 km/h that is 8.1 m — so the shadow, given 22 m of
 *     runway to its mark, is already braking before the figure exists;
 *   - `pause` ZEROES the speed in place (it never rolls the car forward), which
 *     is what keeps the collision demo on the near side of the zebra: no
 *     crossingPassed, therefore no PEDESTRIAN_NOT_YIELDED piling onto the two
 *     authored codes;
 *   - NO ruleConfig: conditionSpeedNightFactor stays the shipped 1, so the
 *     night never bills SPEED_TOO_FAST_FOR_CONDITIONS here (the template
 *     header's A12 note — the unlit envelope is sc-ac-night-overdrive's drill).
 *
 * The trace gate replays exactly these through the production stack, at night:
 *   - shadow: low beams, ~45 km/h down the dark street, shed to 26 (under the
 *     30 cap) BEFORE the zone, brake to rest 6 m short of the zebra, wait the
 *     figure out, pass a clear crossing → ZERO violations + PEDESTRIAN_YIELDED;
 *   - „Градска скорост срещу невидимия пешеходец": lights correct, 40 km/h held
 *     through the zone with the figure on the zebra and no brake → EXACTLY
 *     PEDESTRIAN_CROSSING_TOO_FAST (fires ~y 74, on the 1 s sustain) +
 *     COLLISION (the authored strike at y = 79), never SPEEDING_* (40 under the
 *     posted 50) and never PEDESTRIAN_NOT_YIELDED (the car never passes 80);
 *   - „Нощно каране без светлини": headlights OFF, a calm 27 m of dark street,
 *     at rest at y = 42 — outside the 35 m zone (38.2 m from the crossing), so
 *     the figure is never even released → EXACTLY HEADLIGHTS_OFF_AT_NIGHT (2 s
 *     sustain). Two demos, two separate lessons.
 *
 * Geometry pinned to content/world/pe-dart-v1.json: street on x = 0, right-lane
 * center x = 4.06, zebra pe-x-1 at y = 80, spawn pe-spawn-approach (4.06, 15)
 * heading north, limit 50 km/h, street ends at y = 140.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_PE_NIGHT_UNLIT } from "../lessons/scenario/templates-pe2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PE_NIGHT_UNLIT_ID = "sc-pe-night-unlit";

/** Northbound right-lane center of pe-dart-v1. */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 80;
/** The compliant rest point — single truth with the template's halt objective. */
const Y_HALT = Y_ZEBRA - 6;
/** Where the shadow has finished shedding to the ready speed: ~3 m before the
 *  crossing zone arms (y ≈ 45.2), so every flag flip lands under the cap. */
const Y_READY = 52;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — ready BEFORE the figure exists
// ---------------------------------------------------------------------------

export function scPeNightUnlitShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Неосветена улица, нощ: късите светлини показват около 40 метра — пътеката е отвъд тях, в тъмното.",
      },
      // Low beams set explicitly: the recorder's NIGHT default is already
      // "low", but the shadow demonstrates the correct пакет, not the default.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~45 km/h down the dark street: legal, unremarkable — and the last
      // moment at which choosing the speed is still free.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 32]], targetKmh: 45, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Пътеката отпред е неосветена. Свали скоростта СЕГА, докато още не виждаш никого — готовността се създава рано.",
      },
      // Shed to 26 km/h — under the 30 km/h crossing cap — and reach it by
      // y ≈ 48, before the zone arms at y ≈ 45.2… the figure is still a curb.
      { kind: "drive", points: [[X_LANE, 32], [X_LANE, Y_READY]], targetKmh: 26, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Тъмна фигура на ръба на снопа — човек в тъмни дрехи вече стъпва на зебрата. Спирачка, без да завиваш встрани.",
      },
      // 22 m of runway for an 8.1 m stop: the recorder brakes on its own well
      // before the mark — the reaction is a formality because the speed was.
      { kind: "drive", points: [[X_LANE, Y_READY], [X_LANE, Y_HALT]], targetKmh: 26 },
      // Wait her out — the 1.4 m/s walker needs ~12.8 s from the trigger to
      // clear the 16.25 m carriageway; the stop consumed ~4.4 s of it.
      { kind: "pause", sec: 11, brake: true },
      { kind: "annotation", textBg: "Изчакай я да освободи цялото платно — в тъмното не се разминаваш „на косъм“." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е свободна — премини спокойно." },
      {
        kind: "drive",
        points: [[X_LANE, Y_HALT], [X_LANE, 110], [X_LANE, 128]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Правилото: нощем таванът ти е осветеното, не табелата — 26 км/ч пред неосветена пътека не е плахост, а сметка.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Градска скорост срещу невидимия пешеходец"
// (PEDESTRIAN_CROSSING_TOO_FAST + COLLISION)
// ---------------------------------------------------------------------------

export function scPeNightUnlitMistakeCitySpeedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: обичайната градска скорост към неосветената пътека — „нали съм в ограничението“.",
      },
      // Lights correct (low beams on) so the ONLY gradable channels are the
      // crossing approach and the contact: the speed is LAWFUL — and blind.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // 40 km/h held, no brake: under the posted 50 (no SPEEDING_*), but far
      // over the 30 km/h approach cap once she is on the zebra — the 1 s
      // sustain completes at y ≈ 74, six metres before the paint.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Фигурата влиза в снопа — но на 40 км/ч спирачният път вече е по-дълъг от осветеното." },
      { kind: "drive", points: [[X_LANE, 55], [X_LANE, Y_ZEBRA - 1]], targetKmh: 40, stopAtEnd: false },
      // The authored consequence: the walker is struck on the crossing.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "Ударът беше решен още преди да я видиш: пред неосветена пътека разрешените километри не удължават нито фаровете, нито спирачките.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Нощно каране без светлини" (HEADLIGHTS_OFF_AT_NIGHT)
// ---------------------------------------------------------------------------

export function scPeNightUnlitMistakeLightsOffScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: скоростта е премерена, но колата пое по тъмната улица с изгасени светлини.",
      },
      // Headlights OFF, set explicitly: the recorder's NIGHT default is "low",
      // so the dark drive must author it. The car comes to rest at y = 42 —
      // 38.2 m from the zebra, outside the 35 m crossing zone — so the lights
      // channel is the ONLY thing this demo grades and the figure stays a curb.
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 42]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Без къси светлини няма и 40-те метра: неосветената пътека напред просто не съществува — а тъмната фигура върху нея също.",
      },
      {
        kind: "annotation",
        textBg: "Късите се включват със запалването по тъмно. Чак след това се говори за скорост.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPeNightUnlitTraceName = "shadow-correct" | "mistake-city-speed" | "mistake-lights-off";

const SCRIPTS: Record<
  ScPeNightUnlitTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPeNightUnlitShadowScript },
  "mistake-city-speed": { kind: "mistake", script: scPeNightUnlitMistakeCitySpeedScript },
  "mistake-lights-off": { kind: "mistake", script: scPeNightUnlitMistakeLightsOffScript },
};

/**
 * Record one of the three drives against a loaded pe-dart-v1 document — at
 * NIGHT, the TEMPLATE's staged figure armed (single truth), ambient traffic
 * zero (the harness law). collisionMinKmh 0 so nothing about the authored
 * strike depends on a threshold. Deterministic: same district → same trace.
 */
export function recordScPeNightUnlitDrive(
  districtRaw: unknown,
  name: ScPeNightUnlitTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PE_NIGHT_UNLIT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PE_NIGHT_UNLIT.staged ?? [])] as StagedEventSpec[],
    isNight: true,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
