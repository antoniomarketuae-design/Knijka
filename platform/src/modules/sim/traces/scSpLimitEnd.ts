/**
 * sc-sp-limit-end — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Докъде важи ограничението" (SP-03, the scope half) on
 * the committed sp-signs-v1 district — a street of FIVE collinear segments
 * reading 50 → 40 → 50 → 40 → 50, where the first В26-40 span dies at a JUNCTION
 * (y = 340) and the second dies at an END PLATE (y = 700). No staged actors,
 * ambient traffic ZERO (seed 7): the ONLY gradable fault is the driver's own
 * speed against the PER-EDGE local limit.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — holds ≈37 through BOTH spans and
 *     resumes ≈46 only PAST each endpoint;
 *   - „Ускоряване 200 м преди края на зоната": lifts to ≈48 at y = 140 — 200 m
 *     short of the junction, still inside span 1 → EXACTLY SPEEDING_OVER_LIMIT
 *     (above the graced 44, under the dangerous 50), never the dangerous band;
 *   - „Голямо превишение в зоната": ≈57 km/h through span 2 → EXACTLY
 *     SPEEDING_DANGEROUS (57 > 40 + 10). SCRIPT_ACCEL (2.2 m/s² ≈ 7.9 km/h/s)
 *     carries it across the 44–50 minor band in ≈0.8 s — far under that
 *     detector's 2 s sustain — so the minor code never arms; and the demo holds
 *     57 to the plate rather than settling in the band, then sheds speed only
 *     once the local limit is 50 again (where 57 resets under the graced 55
 *     inside 0.2 s).
 *
 * Geometry pinned to content/world/sp-signs-v1.json: street on x = 0, right-lane
 * center x = 4.06, spawn sp-sg-spawn-approach (4.06, 15) heading north; В26
 * spans y 100..340 and y 460..700; total length 800 m.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SP_LIMIT_END_ID = "sc-sp-limit-end";

/** Northbound right-lane center of sp-signs-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — hold the limit to BOTH endpoints
// ---------------------------------------------------------------------------

export function scSpLimitEndShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Ограничението е 50 км/ч, но напред следва знак В26 „40“ — намаляваме преди знака." },
      { kind: "glance", mirror: "rear" },
      // ~46 km/h on the 50 approach, then lift so we enter span 1 already at ~37.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 78]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 78], [X_LANE, 100]], targetKmh: 37, stopAtEnd: false },
      { kind: "annotation", textBg: "Зона 40. Тя свършва на кръстовището напред — дотогава 40 важи до последния метър." },
      // Span 1 (100..340) — hold 37 ALL the way to the junction endpoint.
      { kind: "drive", points: [[X_LANE, 100], [X_LANE, 340]], targetKmh: 37, stopAtEnd: false },
      { kind: "annotation", textBg: "Кръстовището отмени знака — чак СЕГА се връщаме към 50 км/ч." },
      // Between (340..460) — the limit really is 50 again here.
      { kind: "drive", points: [[X_LANE, 340], [X_LANE, 438]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 438], [X_LANE, 460]], targetKmh: 37, stopAtEnd: false },
      { kind: "annotation", textBg: "Втори знак В26 „40“ — тази зона свършва при табелата за край, не при кръстовище." },
      // Span 2 (460..700) — hold 37 all the way to the end plate.
      { kind: "drive", points: [[X_LANE, 460], [X_LANE, 700]], targetKmh: 37, stopAtEnd: false },
      { kind: "annotation", textBg: "Знакът за край на забраната — оттук отново 50 км/ч." },
      { kind: "drive", points: [[X_LANE, 700], [X_LANE, 790]], targetKmh: 46 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: държахме 40 до кръстовището и до знака, и ускорихме чак след тях." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Ускоряване 200 м преди края на зоната" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpLimitEndMistakeEarlyAccelScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата вижда кръстовището напред и си отменя знака сама." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 78]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 78], [X_LANE, 100]], targetKmh: 37, stopAtEnd: false },
      // Correct for the first 40 m of span 1…
      { kind: "drive", points: [[X_LANE, 100], [X_LANE, 140]], targetKmh: 37, stopAtEnd: false },
      { kind: "annotation", textBg: "200 метра преди края на зоната кракът натиска — но тук още важи 40." },
      // …then 200 m of ~48 km/h, INSIDE span 1, all the way to the junction.
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 340]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "48 км/ч в зона 40 е второстепенна грешка — знакът важи до кръстовището, не „почти до него“." },
      // Past the junction the 48 is legal again; the rest of the route is driven
      // correctly, so the demo grades the early acceleration and nothing else.
      { kind: "drive", points: [[X_LANE, 340], [X_LANE, 438]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 438], [X_LANE, 460]], targetKmh: 37, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 460], [X_LANE, 700]], targetKmh: 37, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 700], [X_LANE, 790]], targetKmh: 46 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дръж ограничението до самото кръстовище — то е краят на зоната, не приближаването му." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Голямо превишение в зоната" (SPEEDING_DANGEROUS)
// ---------------------------------------------------------------------------

export function scSpLimitEndMistakeBigOverspeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „нали скоро свършва“ — и колата вдига 57 км/ч в зона 40." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 78]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 78], [X_LANE, 100]], targetKmh: 37, stopAtEnd: false },
      // Span 1 driven correctly — the fault belongs to span 2 alone.
      { kind: "drive", points: [[X_LANE, 100], [X_LANE, 340]], targetKmh: 37, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 340], [X_LANE, 460]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Зона 40 — а кракът дава газ до 57 км/ч." },
      // Span 2 at ~57: > 40 + 10 → опасна. The throttle crosses the 44–50 minor
      // band in ~0.8 s (< the 2 s sustain), so only the dangerous code arms.
      { kind: "drive", points: [[X_LANE, 460], [X_LANE, 700]], targetKmh: 57, stopAtEnd: false },
      { kind: "annotation", textBg: "57 в зона 40 е над +10 км/ч — опасна грешка и отпадане от изпита." },
      // Shed the speed only PAST the plate, where the local limit is 50 again:
      // 57 falls under the graced 55 in ~0.2 s, so nothing arms on the tail.
      { kind: "drive", points: [[X_LANE, 700], [X_LANE, 790]], targetKmh: 46 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Краят на зоната се чете от знака, не от усещането — до табелата таванът е 40." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpLimitEndTraceName = "shadow-correct" | "mistake-early-accel" | "mistake-big-overspeed";

const SCRIPTS: Record<ScSpLimitEndTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scSpLimitEndShadowScript },
  "mistake-early-accel": { kind: "mistake", script: scSpLimitEndMistakeEarlyAccelScript },
  "mistake-big-overspeed": { kind: "mistake", script: scSpLimitEndMistakeBigOverspeedScript },
};

/**
 * Record one of the three drives against a loaded sp-signs-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpLimitEndDrive(
  districtRaw: unknown,
  name: ScSpLimitEndTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SP_LIMIT_END_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
