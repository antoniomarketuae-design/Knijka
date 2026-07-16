/**
 * sc-ov-oncoming-gap — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Изпреварване срещу насрещни" (doc 72 OV-05 — the
 * overtake-corridor adjudication) on the committed ov-oncoming-v1 district
 * (900 m extra-urban 1+1, dashed осева, limit 90), recorded with the
 * template's OWN staged actors (single truth, imported from the template):
 *  - the slow lead (brakingLeadCar sc-ovg-lead, matchPlayer ~16 m ahead
 *    capped at 11.1 m/s ≈ 40 km/h — the crawler that makes passing tempting);
 *  - the oncoming stream (oncomingStream sc-ovg-stream): three cars at
 *    12 m/s southbound, released on the player's first movement — pure
 *    clockwork; car 0 @ y 310, car 1 66 m behind it (the 4–7 s advisory
 *    between-window), car 2 560 m behind (the BIG legal window).
 *
 * Choreography note (the matchPlayer servo): the approach runs TWO stages
 * (30 → 34 km/h) so the lead's proportional spin-up never squeezes the catch-
 * up gap under the following-distance band — the graded acts must be the
 * OVERTAKES alone. The 34 km/h follow sits safely under the lead's 40 km/h
 * cap, so the servo holds its 16 m equilibrium with recovery headroom.
 *
 * The trace gate replays exactly these through the production stack:
 *  - shadow: waits behind the lead while cars 0+1 pass, then overtakes in the
 *    big window (out, past, back) → ZERO violations + CLEAN_DRIVING; on this
 *    1+1 the bank flip renumbers no lane, so NO lane-change code (positive or
 *    negative) can exist — the innocence proof is the corridor's own silence;
 *  - „Излизане в тесен прозорец": pulls out into car 0's ~3.5 s measured gap
 *    and holds it unbraked past the sustain → grades EXACTLY
 *    OVERTAKE_INSUFFICIENT_GAP (опасна), then slots back with metres to spare;
 *  - „Провлачено изпреварване": passes the lead in the big window but stays
 *    out cruising the oncoming lane until car 2 closes under 4 s → EXACTLY
 *    OVERTAKE_INSUFFICIENT_GAP, convicted mid-drift while still on the bank.
 *
 * Geometry pinned to content/world/ov-oncoming-v1.json: road on x = 0, own
 * lane center x = +4.06, oncoming bank x = −4.06; spawn ovg-spawn-start
 * (4.06, 15) heading north; 900 m, limit 90. A vehicle whose CENTER is at
 * x < 0 sits fully past the осева (tick.opposingBank — the committed bank
 * fix), which on a DASHED line is legal — only the oncoming gap grades.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_ONCOMING_GAP } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_ONCOMING_GAP_ID = "sc-ov-oncoming-gap";

/** Own (northbound) lane center / committed-pass line on the oncoming bank. */
const X_OWN = 4.06;
const X_OUT = -2.5;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — patience, then the big window
// ---------------------------------------------------------------------------

export function scOvOncomingGapShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб пълзи бавна кола, а насреща идват автомобили — осевата е прекъсната, но лентата отсреща е заета." },
      { kind: "glance", mirror: "rear" },
      // Two-stage settle behind the lead (the servo note above).
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      // Patient follow while oncoming cars 0 and 1 pass head-on.
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 120], [X_OWN, 180]], targetKmh: 34, stopAtEnd: false },
      { kind: "annotation", textBg: "Малкият прозорец между двете насрещни не стига за цяла маневра — изчакваме големия." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // Pull out into the BIG window (car 2 is ~30 measured seconds away).
      { kind: "drive", points: [[X_OWN, 180], [X_OWN, 187], [0.8, 201], [X_OUT, 215]], targetKmh: 50, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The decisive pass: ~62 km/h against the 40 km/h lead.
      { kind: "drive", points: [[X_OUT, 215], [X_OUT, 352]], targetKmh: 62, stopAtEnd: false },
      { kind: "annotation", textBg: "Решително покрай бавния: колкото по-кратко си в насрещната лента, толкова по-безопасна е маневрата." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 352], [0.8, 366], [X_OWN, 380]], targetKmh: 62, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 380], [X_OWN, 520]], targetKmh: 60, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 520], [X_OWN, 560]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Чисто: изчака заетата лента, изпревари в големия прозорец и се прибра навреме." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Излизане в тесен прозорец" (OVERTAKE_INSUFFICIENT_GAP)
// ---------------------------------------------------------------------------

export function scOvOncomingGapMistakeTightScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: насрещният „изглежда далеч“ — и колата излиза в прозорец от около 3 секунди." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 95]], targetKmh: 34, stopAtEnd: false },
      // Pull out INTO car 0's ~3.5 s measured gap (boundary x < 0 at y ≈ 114).
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 95], [0.8, 108], [X_OUT, 121]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Holds it, unbraked, at speed — the gamble the adjudicator convicts.
      { kind: "drive", points: [[X_OUT, 121], [X_OUT, 126]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Прозорецът се изпари: при взаимно приближаване 3 секунди се топят двойно по-бързо." },
      // Slots back with metres to spare — adrenaline, not skill.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 126], [1.0, 142], [X_OWN, 160]], targetKmh: 38, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Ease off the squeezed follow gap behind the lead (recovery band).
      { kind: "drive", points: [[X_OWN, 160], [X_OWN, 200]], targetKmh: 28, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 200], [X_OWN, 290]], targetKmh: 34 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Насрещният прозорец се смята в секунди: съмняваш ли се — оставаш зад бавния (чл. 42, ал. 1)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Провлачено изпреварване" (OVERTAKE_INSUFFICIENT_GAP)
// ---------------------------------------------------------------------------

export function scOvOncomingGapMistakeOverstayScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: излиза в голям прозорец, но остава да се вози в насрещната лента — „лявата е по-широка“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 120], [X_OWN, 180]], targetKmh: 34, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 180], [X_OWN, 187], [0.8, 201], [X_OUT, 215]], targetKmh: 50, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The pass itself is fine — but instead of returning at ~y 360 the car
      // CRUISES ON in the oncoming lane while car 2 closes head-on.
      { kind: "drive", points: [[X_OUT, 215], [X_OUT, 352]], targetKmh: 62, stopAtEnd: false },
      { kind: "annotation", textBg: "Изпреварването свърши — а колата още е в насрещната лента, срещу следващия насрещен." },
      { kind: "drive", points: [[X_OUT, 352], [X_OUT, 410]], targetKmh: 55, stopAtEnd: false },
      // A late, gentle drift home — begun only when car 2 is already inside
      // 4 measured seconds; the conviction lands mid-drift, unbraked.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 410], [-0.5, 432], [2.0, 452], [X_OWN, 478]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 478], [X_OWN, 540]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Насрещната лента е назаем: излизаш, подминаваш, прибираш се — веднага щом видиш изпреварания в огледалото." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvOncomingGapTraceName =
  | "shadow-correct"
  | "mistake-tight-gap"
  | "mistake-overstay";

const SCRIPTS: Record<
  ScOvOncomingGapTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvOncomingGapShadowScript },
  "mistake-tight-gap": { kind: "mistake", script: scOvOncomingGapMistakeTightScript },
  "mistake-overstay": { kind: "mistake", script: scOvOncomingGapMistakeOverstayScript },
};

/**
 * Record one of the three drives against a loaded ov-oncoming-v1 document —
 * the TEMPLATE's staged lead + oncoming stream armed (single truth), ambient
 * traffic zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScOvOncomingGapDrive(
  districtRaw: unknown,
  name: ScOvOncomingGapTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_ONCOMING_GAP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_ONCOMING_GAP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
