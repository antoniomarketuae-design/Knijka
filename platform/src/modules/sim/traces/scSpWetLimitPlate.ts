/**
 * sc-sp-wet-limit-plate — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Табела „при мокра настилка"" (SP-04 — the
 * conditional-plate half) on the committed sp-rain-v1 district (360 m straight
 * street, limit 50), recorded in DAY RAIN. No staged actors, ambient traffic
 * ZERO (seed 7). The only gradable channels are the driver's speed vs the rain
 * envelope and the posted limit — this is a speed-discipline drill, nothing to
 * hit and no lane to leave.
 *
 * DUAL-CHANNEL HONESTY (the 4a note): the WET rungs (L3–L5) run the LIVE
 * student car at real wetGrip (physics.wetGrip → ~1.4× braking distance). These
 * RECORDED demos are KINEMATIC (the recorder never runs VehicleSim), so grip is
 * the LIVE car's, not the ghost's — the ghost simply drives the authored
 * envelope. Rain is fed to tick.rain so the conditions detector is live; low
 * beams are set ON (the recorder's DAY default is "off", which would itself
 * grade HEADLIGHTS_OFF_IN_RAIN).
 *
 * The trace gate replays exactly these through the production stack, day rain:
 *   - shadow: low beams ON, ~38 km/h the whole street (under the 0.85 × 50 =
 *     42.5 km/h rain envelope — the „40 при мокра настилка" ceiling, driven a
 *     touch under) → ZERO violations + CLEAN_DRIVING;
 *   - „Сухата скорост под мократа табела": ~50 held (> 42.5 envelope, ≤ 55
 *     graced) → EXACTLY SPEED_TOO_FAST_FOR_CONDITIONS, never a speeding or
 *     lights code;
 *   - „Пълно превишение в дъжда": ~57 held (> 55 graced, ≤ 60) → EXACTLY
 *     SPEEDING_OVER_LIMIT; above the graced limit the conditions episode's
 *     accumulator is cleared by band, so the ~1.6 s accel crossing and the
 *     ~1.5 s decel crossing of (42.5, 55] never reach the 3 s sustain.
 *
 * Geometry pinned to content/world/sp-rain-v1.json: street on x = 0, right-lane
 * center x = 4.06, spawn sp-spawn-approach (4.06, 15) heading north, 360 m long,
 * limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SP_WET_LIMIT_PLATE } from "../lessons/scenario/templates-speed2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SP_WET_LIMIT_PLATE_ID = "sc-sp-wet-limit-plate";

/** Northbound right-lane center of sp-rain-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the wet ceiling, held the whole street
// ---------------------------------------------------------------------------

export function scSpWetLimitPlateShadowScript(): DriveScript {
  return {
    steps: [
      // sc-sp-wet-limit-plate:65c7eaac, residual (a) — THE CAPTION TOLD HIM THE
      // WEATHER, WHICH IS THE ONE THING THIS DRILL EXISTS TO MAKE HIM READ.
      // `templates-speed2.ts` re-authored every instruction step to be true on a
      // dry rung and a wet one («На сухо табелата спи», «първо погледни
      // настилката, не текста»), and said in its own comment why: the L1 rung
      // the harness drives is DRY, and a briefing that asserts rain teaches a
      // student to misread a sleeping plate. These captions were not re-authored
      // with it, and they are painted on the glass: w10-3 pc-right/04-t038s.png
      // carries «важи: вали. Таванът ни е 40 км/ч» on the SAME screenshot as the
      // instruction line saying 50 is fully lawful today, over 59 drive frames
      // of dry asphalt, clear sky and parked wipers.
      //
      // THE RECORDING ITSELF IS A RAIN DRIVE and stays one (`rain: true` below,
      // and the whole envelope argument in this file's header depends on it), so
      // the caption is not made false — it is made to say WHOSE weather it is,
      // and then hands the student the check. Same repair as the fog lesson's
      // «Сянката кара с фарове за мъгла…».
      //
      // ── AND THAT REPAIR WAS OVERTURNED BY ITS OWN QUOTE (wave 2) ──────────
      //
      // It shipped «Мокра ли е настилката — КАКТО В ТОЗИ ЗАПИС — табелата …
      // важи и таванът е 40 км/ч. Суха ли е, тя мълчи и важи основното 50.» and
      // was closed as „conditional in both directions … says nothing about
      // today". Читателят на закритието го опроверга с неговия собствен цитат:
      // «както в този запис» is neither conditional nor about nothing. It is a
      // flat assertion that the recording the student is about to press play on
      // is WET — and `.audit-frames/w11/frames/sc-sp-wet-limit-plate__pc-right/
      // 01-arrival.png` is that sentence painted on the glass over a dry,
      // sunlit street, clear sky, wipers parked.
      //
      // WHY THE ASSERTION IS FALSE ON SCREEN EVEN THOUGH THE RECORDING IS WET.
      // The demo is a SHADOW CAR replayed inside the LIVE scene, and the
      // playback carries no weather of its own: `modules/sim/environment/
      // weather.ts` §3b makes `lesson.environment.{rain,fog,snow}` the ONE
      // authored field feeding both the picture (SimEnvironment →
      // setWeatherTarget) and the graded tick. `templates-speed2.ts` ships this
      // template `conditions: { weather: "dry" }` with rain first appearing at
      // L3, and the harness drives «Ниво 1 — Пълна помощ». So on the rung the
      // student is standing on, „this recording" IS his own dry road. The
      // `rain: true` two lines down is the RECORDER's envelope — it makes the
      // ghost's 38 км/ч honest against the rain band — and it is not, and
      // cannot be, a render instruction.
      //
      // SO THE CAPTION STOPS POINTING AT THE PICTURE ALTOGETHER. It states the
      // plate's rule in both directions and hands the student the check, which
      // is true at every rung of the alternating ladder and at every offset of
      // the replay clock — the same escape instruction 3 already uses. Nothing
      // about the recording, the ghost or the weather is claimed by it.
      { kind: "annotation", textBg: "Табелата „при мокра настилка — 40“ важи само при мокра настилка: тогава таванът е 40 км/ч. Суха ли е — тя мълчи и важи основното 50. Първо гледай настилката, после текста." },
      // Low beams ON, set explicitly: the recorder's DAY default is "off",
      // which would itself grade HEADLIGHTS_OFF_IN_RAIN.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~38 km/h — under the 42.5 km/h rain envelope for the whole street, a
      // touch under the 40 plate ceiling.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Подминаваме табелата вече на 38 — таванът се чете от настилката, не се чака някой да го каже." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг — 40 връща и разстоянието, и времето за реакция." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: мокрият таван е спазен по цялата отсечка. На сухо същата улица позволява 50 — това е разликата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Сухата скорост под мократа табела"
// (SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scSpWetLimitPlateMistakeDrySpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: 50 км/ч „по знака“, все едно е сухо — а табелата „при мокра настилка“ важи." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // Hold 50 km/h (the posted limit): above the 42.5 rain envelope but at the
      // limit — SPEED_TOO_FAST_FOR_CONDITIONS ALONE, never SPEEDING_OVER_LIMIT.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "50 по мокро под табелата „40“ е несъобразена скорост — законна по знака, но грешна под условието." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Табелата не е за украса: при мокра настилка таванът тук е 40 км/ч." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Пълно превишение в дъжда" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpWetLimitPlateMistakeOverLimitScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: около 57 км/ч по улица с ограничение 50 — и то в дъжд." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // Hold ~57 km/h: over the graced 55 (⇒ SPEEDING_OVER_LIMIT), under the
      // dangerous 60. Above the graced limit the conditions detector stands down
      // by band, so this bills the speeding code ALONE.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 57, stopAtEnd: false },
      { kind: "annotation", textBg: "Тук вече не е спазен дори основният знак: 57 при ограничение 50 е превишаване." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 57 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Първо се спазва знакът (50), после и табелата под него (40 при мокро). Тук не беше нито едното." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpWetLimitPlateTraceName =
  | "shadow-correct"
  | "mistake-dry-speed-in-wet"
  | "mistake-over-limit-in-wet";

const SCRIPTS: Record<
  ScSpWetLimitPlateTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpWetLimitPlateShadowScript },
  "mistake-dry-speed-in-wet": { kind: "mistake", script: scSpWetLimitPlateMistakeDrySpeedScript },
  "mistake-over-limit-in-wet": { kind: "mistake", script: scSpWetLimitPlateMistakeOverLimitScript },
};

/**
 * Record one of the three drives against a loaded sp-rain-v1 document — in DAY
 * RAIN (the wet rung the drill grades on), no staged actors, ambient traffic
 * zero. Deterministic: same district → same trace.
 */
export function recordScSpWetLimitPlateDrive(
  districtRaw: unknown,
  name: ScSpWetLimitPlateTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SP_WET_LIMIT_PLATE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SP_WET_LIMIT_PLATE.staged ?? [])] as StagedEventSpec[],
    rain: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
