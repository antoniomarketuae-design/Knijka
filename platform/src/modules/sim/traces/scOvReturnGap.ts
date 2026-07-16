/**
 * sc-ov-return-gap — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Прибиране след изпреварване" (doc 72 OV-09 — the
 * overtake-return adjudication) on the committed ov-oncoming-v1 district,
 * recorded with the template's OWN staged lead (single truth, imported from
 * the template): the ovgLeadCar mold (matchPlayer ~16 m of bumpers ahead,
 * capped 11.1 m/s ≈ 40 km/h — the crawler worth passing). The oncoming lane
 * is deliberately EMPTY: the graded act is the RETURN, and a corridor
 * conviction would stand the return tracker down (one act, one code).
 *
 * The trace gate replays exactly these through the production stack:
 *  - shadow: passes decisively and returns WIDE — the „целия в огледалото"
 *    norm (landing ≥ 2 s in front of the overtaken lead) → ZERO violations +
 *    CLEAN_DRIVING; the return tracker's silence on a wide landing is the
 *    lesson's own innocence proof;
 *  - „Ранно прибиране": the same pass, but cuts back ~0.6 s in front of the
 *    lead (the brake-forcing cut — the staged guard visibly brakes) → grades
 *    EXACTLY OVERTAKE_RETURN_TOO_EARLY (основна), once;
 *  - „Засичане при бързо изпреварване": passes fast (72 km/h) and cuts back
 *    with the same half-second landing — speed does not change the return
 *    duty → EXACTLY OVERTAKE_RETURN_TOO_EARLY again.
 *
 * Geometry pinned to content/world/ov-oncoming-v1.json (see scOvOncomingGap):
 * road on x = 0, own lane center x = +4.06, oncoming bank x = −2.5 committed
 * line; spawn ovg-spawn-start (4.06, 15) heading north; 900 m, limit 90.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_RETURN_GAP } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_RETURN_GAP_ID = "sc-ov-return-gap";

/** Own (northbound) lane center / committed-pass line on the oncoming bank. */
const X_OWN = 4.06;
const X_OUT = -2.5;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the decisive pass + the WIDE return
// ---------------------------------------------------------------------------

export function scOvReturnGapShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб пълзи бавна кола, а насрещната лента е свободна — изпреварването е разрешено и безопасно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 120]], targetKmh: 34, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 120], [X_OWN, 127], [0.8, 141], [X_OUT, 155]], targetKmh: 50, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The decisive pass: ~62 km/h against the 40 km/h lead.
      { kind: "drive", points: [[X_OUT, 155], [X_OUT, 292]], targetKmh: 62, stopAtEnd: false },
      { kind: "annotation", textBg: "Подмина я — но изпреварването още не е свършило: прибираш се чак когато я видиш ЦЯЛАТА в огледалото." },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 292], [0.8, 306], [X_OWN, 320]], targetKmh: 62, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Широко прибиране: изпрeвареният не докосва спирачката заради теб — така завършва чистото изпреварване." },
      { kind: "drive", points: [[X_OWN, 320], [X_OWN, 520]], targetKmh: 60, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 520], [X_OWN, 560]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Чисто: решително подминаване, поглед в огледалото и връщане с дистанция — трите действия на изпреварването." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Ранно прибиране" (OVERTAKE_RETURN_TOO_EARLY)
// ---------------------------------------------------------------------------

export function scOvReturnGapMistakeEarlyCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата подминава бавния и веднага реже обратно — „мина ли предницата, мястото е мое“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 95]], targetKmh: 34, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 95], [X_OWN, 102], [0.8, 109], [X_OUT, 123]], targetKmh: 50, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The pass at ~55 — legal and decisive…
      { kind: "drive", points: [[X_OUT, 123], [X_OUT, 236]], targetKmh: 55, stopAtEnd: false },
      { kind: "annotation", textBg: "Подмина я — и без поглед в огледалото завива обратно, на метри пред носа ѝ…" },
      // …but the return lands ~0.6 s in front of the overtaken car: the cut.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 236], [0.8, 248], [X_OWN, 260]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 260], [X_OWN, 330]], targetKmh: 55, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 330], [X_OWN, 400]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изпревареният натисна спирачка заради чуждата маневра. Прибираш се чак когато го видиш целия в огледалото (чл. 42)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Засичане при бързо изпреварване" (same code, speed flavor)
// ---------------------------------------------------------------------------

export function scOvReturnGapMistakeFastCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: бързо изпреварване — и също толкова бързо, рязко прибиране. Скоростта не сменя правилото за връщането." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 70]], targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 70], [X_OWN, 95]], targetKmh: 34, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_OWN, 95], [X_OWN, 102], [0.8, 109], [X_OUT, 123]], targetKmh: 60, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The fast pass: 72 km/h — still under the 90 limit, fully legal.
      { kind: "drive", points: [[X_OUT, 123], [X_OUT, 204]], targetKmh: 72, stopAtEnd: false },
      { kind: "annotation", textBg: "Минава бързо — но реже обратно със същата половин секунда запас пред изпреварения…" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_OUT, 204], [0.8, 216], [X_OWN, 228]], targetKmh: 72, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 228], [X_OWN, 330]], targetKmh: 65, stopAtEnd: false },
      { kind: "drive", points: [[X_OWN, 330], [X_OWN, 410]], targetKmh: 55 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Колкото по-бързо минаваш, толкова по-евтино е да изчакаш още миг — и толкова по-грозно е засичането." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvReturnGapTraceName = "shadow-correct" | "mistake-early-cut" | "mistake-fast-cut";

const SCRIPTS: Record<
  ScOvReturnGapTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvReturnGapShadowScript },
  "mistake-early-cut": { kind: "mistake", script: scOvReturnGapMistakeEarlyCutScript },
  "mistake-fast-cut": { kind: "mistake", script: scOvReturnGapMistakeFastCutScript },
};

/**
 * Record one of the three drives against a loaded ov-oncoming-v1 document —
 * the TEMPLATE's staged lead armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScOvReturnGapDrive(
  districtRaw: unknown,
  name: ScOvReturnGapTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_RETURN_GAP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_RETURN_GAP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
