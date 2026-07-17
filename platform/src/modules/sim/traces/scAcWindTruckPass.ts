/**
 * sc-ac-wind-truck-pass — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Страничен вятър след камиона" (doc 72 AC-12,
 * the crosswind physics slice, OVERTAKING beat) on the committed mw-v1 district
 * (the 1000 m divided 2+2 АМ posted 140), recorded in DAY DRY with the
 * template's OWN staged truck (sc-acw-truck — single truth, imported from the
 * template) in the cruise lane. Ambient traffic ZERO (seed 7).
 *
 * THE LESSON IS LANE CONTROL AT THE LEE EDGE — the player pulls into the
 * OVERTAKING lane (laneId 2, x = −8.12), passes the slow truck in the CRUISE
 * lane (x = 0), and is struck by the gust the instant the nose clears the cab.
 * The carriageway is ONEWAY, so CENTER_LINE_TOUCHED is structurally unreachable
 * (engine centerLineCond needs oneway === false); every graded outcome is a
 * lane-discipline channel:
 *   - shadow: signal + glance each way (→ SAFE_LANE_CHANGE, the LEFT indicator
 *     held across the pass EXEMPTS keep-right), a SMALL steady correction at the
 *     cab line (authored drift to x ≈ −9.2, ~1.1 m — far inside the 3.25 m
 *     band), released smoothly → ZERO violations + CLEAN_DRIVING;
 *   - „Изненадан от порива“: loose hands, the gust walks the car to x ≈ −11.6
 *     (offset ≈ 3.48 m > the band) and it rides the median side ~4 s →
 *     EXACTLY POOR_LANE_KEEPING (never a speed/lane-change code);
 *   - „Порив в тясната пролука“: the gust throws the car back toward the
 *     trailer — a small in-band lurch + an AUTHORED collision consequence (the
 *     recorder's scripted `collision` seam, never a geometric contact with the
 *     paced rig 8 m away) → EXACTLY COLLISION.
 *
 * DUAL-CHANNEL HONESTY (the 4a design note, wind edition — sc-ac-crosswind
 * verbatim): the LIVE student session runs REAL wind physics (LessonSpec
 * .physics.crosswind → the westward force + gust sine). These recordings are
 * KINEMATIC (recorder.ts authored envelopes — VehicleSim never runs), so the
 * lee-then-gust truth is AUTHORED into the polylines below; the annotations
 * carry the counter-steer teaching. The ghost tells the same story the live
 * wind writes.
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway — cruise lane (laneId 1) center x = 0, overtaking lane (laneId 2)
 * x = −8.12, emergency lane x = 8.13; spawn mw-spawn-approach (0, 15) heading
 * north; limit 140; length 1000. Lane detectors
 * (DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM = 3.25): in the overtaking lane the
 * offset passes 3.25 m toward the median at x < −11.375; the pass never leaves
 * laneId 2 (basin [−12.19, −4.06]).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_AC_WIND_TRUCK_PASS } from "../lessons/scenario/templates-conditions2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_WIND_TRUCK_PASS_ID = "sc-ac-wind-truck-pass";

/** mw-v1 northbound CRUISE-lane center (laneId 1 — meta.scenario.laneCruiseX). */
const X_CRUISE = 0;
/** mw-v1 northbound OVERTAKING-lane center (laneId 2 — meta.scenario.laneLeftX). */
const X_OVERTAKE = -8.12;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — slow pass, small steady gust correction
// ---------------------------------------------------------------------------

export function scAcWindTruckPassShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Магистрала в силен страничен вятър, а пред нас пъпли бавен камион. Двете ръце здраво на волана." },
      // Cruise-lane approach, building to a MODERATE pass speed (the prudent-wind
      // band — slower than the truck-following demos, because the gust is coming).
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 120]], targetKmh: 78, stopAtEnd: false },
      { kind: "annotation", textBg: "Намаляваме преди изпреварването — колкото по-бавно минаваме, толкова по-малко ще ни отмести поривът." },
      // Declared overtake: LEFT indicator + shoulder/mirror glance, then the
      // lane change into the overtaking lane (→ SAFE_LANE_CHANGE). The LEFT
      // indicator stays on across the pass, exempting keep-right.
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_CRUISE, 120], [X_OVERTAKE, 200]], targetKmh: 74, stopAtEnd: false },
      { kind: "annotation", textBg: "Докато сме до камиона, сме в неговия завет — вятърът мълчи. Точно затова следващата секунда е коварна." },
      // The cab-line gust, AUTHORED: as the nose clears the cab the lee ends and
      // the wind shoves — the correct driver meets it with a small STEADY
      // correction toward the truck (drift to x ≈ −9.2, ≈ 1.1 m, far inside the
      // 3.25 m band), held, then released smoothly. Passes the sc-acw-pass zone
      // (−8.12, 340) at ~70 km/h.
      {
        kind: "drive",
        points: [[X_OVERTAKE, 200], [X_OVERTAKE, 290], [-9.2, 320], [-8.9, 345], [X_OVERTAKE, 380]],
        targetKmh: 70,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Носът излезе пред кабината — поривът удари, посрещаме го с лека, ПОСТОЯННА корекция, не с рязко дръпване." },
      // Return: RIGHT indicator + glance, then the lane change back to the
      // cruise lane (→ SAFE_LANE_CHANGE), only once the truck is behind.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_OVERTAKE, 380], [X_CRUISE, 470]], targetKmh: 76, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_CRUISE, 470], [X_CRUISE, 610]], targetKmh: 78 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: изпреварихме камиона със съобразена скорост, посрещнахме порива в лентата и се прибрахме плавно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изненадан от порива" (POOR_LANE_KEEPING — toward the median)
// ---------------------------------------------------------------------------

export function scAcWindTruckPassMistakeBlownOutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: изпреварване с пътна скорост и отпусната ръка — точно в мига на излизане от завета." },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 120]], targetKmh: 80, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_CRUISE, 120], [X_OVERTAKE, 200]], targetKmh: 80, stopAtEnd: false },
      { kind: "annotation", textBg: "Носът излиза пред кабината — заветът изчезва и поривът блъска колата към мантинелата." },
      // Loose hands at the cab line: the gust walks the car to x ≈ −11.6 (offset
      // ≈ 3.48 m, past the 3.25 m band) and it rides the median side from
      // y ≈ 323 to 420 — ~4.3 s at 80 km/h, past the 3 s POOR_LANE_KEEPING
      // sustain. Never leaves laneId 2 (basin left edge −12.19).
      {
        kind: "drive",
        points: [[X_OVERTAKE, 200], [X_OVERTAKE, 280], [-11.6, 330], [-11.6, 420]],
        targetKmh: 80,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колата се понесе през половин лента към мантинелата — вятърът я държи там, докато водачът се събуди." },
      { kind: "drive", points: [[-11.6, 420], [X_OVERTAKE, 470], [X_OVERTAKE, 540]], targetKmh: 76 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При излизане от завета на камион скоростта се смъква ПРЕДИ порива, а воланът се държи здраво с двете ръце (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Порив в тясната пролука" (COLLISION — thrown into the truck)
// ---------------------------------------------------------------------------

export function scAcWindTruckPassMistakeClipTruckScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: тясна пролука до ремаркето и висока скорост — вятърът не оставя място за реакция." },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 120]], targetKmh: 80, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_CRUISE, 120], [X_OVERTAKE, 200]], targetKmh: 80, stopAtEnd: false },
      { kind: "drive", points: [[X_OVERTAKE, 200], [X_OVERTAKE, 280]], targetKmh: 80, stopAtEnd: false },
      { kind: "annotation", textBg: "До кабината, в тясната пролука между колата и ремаркето — поривът я хвърля обратно към камиона." },
      // The gust throws the car back toward the trailer: a small in-band lurch
      // (to x ≈ −6.0, offset ≈ 2.1 m, still laneId 2) coincident with the
      // AUTHORED collision consequence — the тясна-пролука sideswipe. NOT a
      // geometric contact with the paced rig (8 m away in its own lane); the
      // scripted step bills EXACTLY COLLISION.
      { kind: "drive", points: [[X_OVERTAKE, 280], [-6.0, 312]], targetKmh: 80, stopAtEnd: false },
      { kind: "collision", withWhat: "vehicle" },
      { kind: "drive", points: [[-6.0, 312], [-6.2, 336]], targetKmh: 44, stopAtEnd: false },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изпреварването на камион в силен вятър иска по-широк просвет и по-ниска скорост — тръгне ли колата, за просвета трябва време, а вятърът не чака (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcWindTruckPassTraceName = "shadow-correct" | "mistake-blown-out" | "mistake-clip-truck";

const SCRIPTS: Record<
  ScAcWindTruckPassTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcWindTruckPassShadowScript },
  "mistake-blown-out": { kind: "mistake", script: scAcWindTruckPassMistakeBlownOutScript },
  "mistake-clip-truck": { kind: "mistake", script: scAcWindTruckPassMistakeClipTruckScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — in DAY DRY
 * (the wind is PHYSICS, opted in per template — never a weather tag), the
 * template's own staged truck, ambient traffic zero. Deterministic: same
 * district → same trace.
 */
export function recordScAcWindTruckPassDrive(
  districtRaw: unknown,
  name: ScAcWindTruckPassTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_WIND_TRUCK_PASS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_WIND_TRUCK_PASS.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
