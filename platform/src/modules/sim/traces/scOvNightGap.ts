/**
 * sc-ov-night-gap — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Изпреварване нощем — преценка по фаровете" (doc 72
 * OV-05 corridor × AC-04 night) on the committed ov-oncoming-v1 district
 * (900 m extra-urban 1+1, dashed осева, limit 90), recorded at NIGHT with the
 * template's OWN staged actors (single truth, imported from the template):
 *  - the slow lead (brakingLeadCar sc-ovn-lead, matchPlayer ~16 m of bumpers
 *    ahead capped at 11.1 m/s ≈ 40 km/h — the crawler that makes passing
 *    tempting AND the car the long beam dazzles);
 *  - the night oncoming stream (oncomingStream sc-ovn-stream): TWO cars at
 *    12 m/s southbound, released on the player's first movement — pure
 *    clockwork; car 0 @ instant-model y 310 (the „далечни фарове" TRAP, its
 *    window measures inside OVERTAKE_CONVICT_GAP_SEC), car 1 700 m behind it
 *    (the big, verified window the legal pass lives in).
 *
 * The recorder feeds tick.isNight so the beam-dip detector is live and the
 * night conditions envelope applies (night's prudent-speed factor is 1, so a
 * legal-speed drive takes no SPEED_TOO_FAST_FOR_CONDITIONS); ambient traffic is
 * ZERO (seed 7).
 *
 * Choreography note (the matchPlayer servo, inherited from the OVG mold): the
 * approach runs TWO stages (30 → 34 km/h) so the lead's proportional spin-up
 * never squeezes the catch-up gap into the following-distance band — the graded
 * acts must be the OVERTAKE and the BEAM alone. The 34 km/h follow sits safely
 * under the lead's 40 km/h cap, so the servo holds its equilibrium with room.
 *
 * The trace gate replays exactly these through the production stack, at night:
 *  - shadow: low beams (the recorder's night default, stated for the story)
 *    behind the lead while the trap car passes, then one decisive pass in the
 *    dark window → ZERO violations + CLEAN_DRIVING; on this 1+1 the bank flip
 *    renumbers no lane, so NO lane-change code (positive or negative) can
 *    exist — the innocence proof is the corridor's own silence;
 *  - „Изпреварване срещу далечни фарове": pulls out into car 0's window — the
 *    corridor measures it at ~2.3 s, deep inside OVERTAKE_CONVICT_GAP_SEC (4.0)
 *    — and holds it unbraked past the sustain → grades EXACTLY
 *    OVERTAKE_INSUFFICIENT_GAP (опасна), then slots back with metres to spare;
 *  - „Следване на дълги светлини": never overtakes at all — it simply follows
 *    the lead on HIGH beams the whole way → EXACTLY HIGH_BEAM_NOT_DIPPED
 *    (3 s sustain, leadGapM ≈ 16 m ≤ 150 m). Speed legal, gap safe, lane
 *    centered, oncoming lane never entered: the beam is the only channel.
 *
 * Geometry pinned to content/world/ov-oncoming-v1.json: road on x = 0, own lane
 * center x = +4.06, oncoming bank x = −4.06; spawn ovg-spawn-start (4.06, 15)
 * heading north; 900 m, limit 90. A vehicle whose CENTER is at x < 0 sits fully
 * past the осева (tick.opposingBank), which on a DASHED line is legal — only
 * the oncoming gap grades.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_NIGHT_GAP } from "../lessons/scenario/templates-lanes2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_NIGHT_GAP_ID = "sc-ov-night-gap";

/** Own (northbound) lane center / committed-pass line on the oncoming bank. */
const X_OWN = 4.06;
const X_OUT = -2.5;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — refuse the first headlights, pass in the
// dark window
// ---------------------------------------------------------------------------

export function scOvNightGapShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тъмно е: пред теб пълзи бавна кола, а далеч насреща светят фарове." },
      // Low beams: matches the recorder's night default, stated for the story.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // Two-stage settle behind the lead (the servo note above).
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Зад движещата се пред теб кола — къси светлини: дългите ѝ бият в огледалата." },
      // Patient follow while the trap car's headlights close head-on.
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 120], [X_OWN, 180]], targetKmh: 34, stopAtEnd: false },
      { kind: "annotation", textBg: "Тези фарове „изглеждат далеч“ — но нощем фарове не значат разстояние. Изчакваме ги." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // Pull out only once the oncoming lane is fully DARK (car 1 is hundreds
      // of measured seconds away).
      { kind: "drive", points: [[X_OWN, 180], [X_OWN, 187], [0.8, 201], [X_OUT, 215]], targetKmh: 50, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The decisive pass: ~62 km/h against the 40 km/h lead.
      { kind: "drive", points: [[X_OUT, 215], [X_OUT, 352]], targetKmh: 62, stopAtEnd: false },
      { kind: "annotation", textBg: "Насрещната лента е съвсем тъмна — минаваме кратко и решително." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 352], [0.8, 366], [X_OWN, 380]], targetKmh: 62, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 380], [X_OWN, 520]], targetKmh: 60, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 520], [X_OWN, 560]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Чисто: къси зад бавния, изчака фаровете и изпревари чак в тъмния прозорец." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изпреварване срещу далечни фарове" (OVERTAKE_INSUFFICIENT_GAP)
// ---------------------------------------------------------------------------

export function scOvNightGapMistakeFarHeadlightsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „фаровете са далеч“ — и колата излиза в прозорец от около две секунди." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 95]], targetKmh: 34, stopAtEnd: false },
      // Pull out INTO the trap car's ~3.5 s measured window (the boundary
      // x < 0 falls at y ≈ 114).
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 95], [0.8, 108], [X_OUT, 121]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Holds it, unbraked, at speed — the gamble the adjudicator convicts.
      { kind: "drive", points: [[X_OUT, 121], [X_OUT, 126]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Два фара не са разстояние: прозорецът се изпари двойно по-бързо, отколкото изглеждаше." },
      // Slots back with metres to spare — adrenaline, not skill.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 126], [1.0, 142], [X_OWN, 160]], targetKmh: 38, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Ease off the squeezed follow gap behind the lead (recovery band).
      { kind: "drive", points: [[X_OWN, 160], [X_OWN, 200]], targetKmh: 28, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 200], [X_OWN, 290]], targetKmh: 34 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Нощем прозорецът се чете по фарове — съмняваш ли се колко са далеч, не започваш (чл. 42, ал. 1)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Следване на дълги светлини зад бавния" (HIGH_BEAM_NOT_DIPPED)
// ---------------------------------------------------------------------------

export function scOvNightGapMistakeHighBeamsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: следва бавната кола на ДЪЛГИ светлини — „за да види дали да изпревари“." },
      // High beams behind the moving lead → HIGH_BEAM_NOT_DIPPED after the 3 s
      // sustain. No overtake at all: speed legal, gap safe, lane centered, the
      // oncoming bank never touched — the beam is the only gradable channel.
      { kind: "headlights", setting: "high" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Дългите бият право в огледалата на предната кола и заслепяват водача ѝ." },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 120], [X_OWN, 180]], targetKmh: 34, stopAtEnd: false },
      { kind: "annotation", textBg: "А отразената светлина отнема и твоята нощна адаптация — виждаш по-малко, не повече." },
      { kind: "drive", points: [[X_OWN, 180], [X_OWN, 300]], targetKmh: 34 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Зад движеща се кола се кара на къси; на дълги минаваш чак когато пътят пред теб е празен (чл. 74)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvNightGapTraceName =
  | "shadow-correct"
  | "mistake-far-headlights"
  | "mistake-high-beams";

const SCRIPTS: Record<
  ScOvNightGapTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvNightGapShadowScript },
  "mistake-far-headlights": { kind: "mistake", script: scOvNightGapMistakeFarHeadlightsScript },
  "mistake-high-beams": { kind: "mistake", script: scOvNightGapMistakeHighBeamsScript },
};

/**
 * Record one of the three drives against a loaded ov-oncoming-v1 document — at
 * NIGHT, the TEMPLATE's staged lead + oncoming stream armed (single truth),
 * ambient traffic zero (the harness law). Deterministic: same district → same
 * trace.
 */
export function recordScOvNightGapDrive(
  districtRaw: unknown,
  name: ScOvNightGapTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_NIGHT_GAP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_NIGHT_GAP.staged ?? [])] as StagedEventSpec[],
    isNight: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
