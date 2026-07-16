/**
 * sc-ov-narrow — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Разминаване в тясна улица" (OV-14) on the committed
 * ov-narrow-v1 district, recorded with the template's OWN staged narrow meeting
 * (narrowMeeting sc-ovn-meeting — a parked row in the player's lane + an
 * oncoming car, single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (waited at the widening in
 *     the own lane for the oncoming to clear, then squeezed past);
 *   - „Вклиняване насреща" grades EXACTLY FAILED_TO_YIELD (swung into the
 *     oncoming lane while it was inbound);
 *   - „Насилване през стеснението" grades EXACTLY FAILED_TO_YIELD.
 *
 * Geometry pinned to content/world/ov-narrow-v1.json:
 *   street on x = 0, player (northbound) lane center x = 4.06, oncoming
 *   (southbound) lane center x = −4.06, spawn nm-spawn-approach (4.06, 15),
 *   section y ∈ [110, 145], parked row at (4.06, 120) and (4.06, 135).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_NARROW } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_NARROW_ID = "sc-ov-narrow";

/** Player (northbound) right-lane center and the oncoming (southbound) center. */
const X_OWN = 4.06;
const X_ONC = -4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — wait at the widening, then squeeze past
// ---------------------------------------------------------------------------

export function scOvNarrowShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тясна улица — напред паркиран ред заема твоята лента, а насреща идва кола." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 80]], targetKmh: 22, stopAtEnd: false },
      { kind: "annotation", textBg: "Препятствието е от твоята страна — предимството е на насрещния. Спри на разширението и изчакай." },
      { kind: "glance", mirror: "left" },
      // Ease to a stop in the OWN lane just before the section (y < 110).
      { kind: "drive", points: [[X_OWN, 80], [X_OWN, 104]], targetKmh: 10 },
      { kind: "pause", sec: 8, brake: true },
      { kind: "annotation", textBg: "Насрещният премина — сега се промъкни покрай паркираните коли." },
      { kind: "indicator", setting: "left" },
      // Swing into the (now free) oncoming lane to pass the parked row, then back.
      {
        kind: "drive",
        points: [
          [X_OWN, 104],
          [2, 110],
          [X_ONC, 118],
          [X_ONC, 138],
          [2, 146],
          [X_OWN, 154],
        ],
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_OWN, 154], [X_OWN, 210]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изчака насрещния и се размина спокойно — точно това иска тясната улица." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Вклиняване насреща" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scOvNarrowMistakeBargeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата се вклинява в насрещната лента, докато насрещният е още в стеснението." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 92]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Без изчакване — направо в насрещната лента, за да заобиколи паркираните коли." },
      { kind: "indicator", setting: "left" },
      // Swing into the oncoming lane WHILE the oncoming car is inbound and hold
      // it through the section — the barge the narrow-meeting runner convicts.
      {
        kind: "drive",
        points: [
          [X_OWN, 92],
          [2, 102],
          [X_ONC, 112],
          [X_ONC, 140],
        ],
        targetKmh: 14,
      },
      { kind: "pause", sec: 2, brake: true },
      {
        kind: "annotation",
        textBg: "Насрещният с предимство трябваше да спре заради теб. От твоята страна е препятствието — ти чакаш.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Насилване през стеснението" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scOvNarrowMistakeForceScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: вместо да изчака, водачът форсира стеснението срещу приближаващата кола." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_OWN, 15], [X_OWN, 96]], targetKmh: 18, stopAtEnd: false },
      { kind: "annotation", textBg: "Носът тръгва в насрещната лента срещу насрещния с предимство…" },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [
          [X_OWN, 96],
          [1, 106],
          [X_ONC, 114],
          [X_ONC, 142],
        ],
        targetKmh: 11,
      },
      { kind: "pause", sec: 2, brake: true },
      {
        kind: "annotation",
        textBg: "Тясното платно не се дели наполовина — този, от чиято страна е препятствието, изчаква другия да мине пръв.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvNarrowTraceName = "shadow-correct" | "mistake-barge" | "mistake-force";

const SCRIPTS: Record<
  ScOvNarrowTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvNarrowShadowScript },
  "mistake-barge": { kind: "mistake", script: scOvNarrowMistakeBargeScript },
  "mistake-force": { kind: "mistake", script: scOvNarrowMistakeForceScript },
};

/**
 * Record one sc-ov-narrow drive against its loaded ov-narrow-v1 document — the
 * TEMPLATE's staged narrow meeting armed (single truth), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScOvNarrowDrive(
  districtRaw: unknown,
  name: ScOvNarrowTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_NARROW_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_NARROW.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
