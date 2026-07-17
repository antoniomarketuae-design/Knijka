/**
 * sc-ln-turn-lane-arrows — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Лентови стрелки преди кръстовище" (SN-04 +
 * JU-14) on the committed ln-arrows-v1 district. No staged actors, ambient
 * traffic ZERO (seed 7): the only things the rule engine can grade are the
 * driver's own lane choices, indicator discipline and lane position.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — reads the arrows from the curb
 *     lane, walks lane 0 → 1 → 2 with mirror + indicator well before the stop
 *     line, crosses on green and turns left from the „само наляво" lane;
 *   - „Ляв завой от лента „само направо“": stops one lane short, cancels the
 *     indicator, turns left from lane 1 unsignalled and drags the exit's curb
 *     edge → EXACTLY TURN_WITHOUT_INDICATOR + POOR_LANE_KEEPING;
 *   - „Късно престрояване през две ленти": crosses lanes 0 → 1 → 2 metres from
 *     the line with neither mirror nor indicator, then signals for the turn →
 *     EXACTLY LANE_CHANGE_WITHOUT_INDICATOR + LANE_CHANGE_WITHOUT_MIRROR_CHECK.
 *
 * Geometry pinned to content/world/ln-arrows-v1.json (battery
 * world/__tests__/ln-arrows-districts.test.ts): 3+3 boulevard on x = 0,
 * y ∈ [−150, 100], northbound lane centers x = 20.31 / 12.19 / 4.06 (laneId
 * 0/1/2), signal node ln-n-c at the origin, ns stop line y = −43.98, 1+1 west
 * street with the westbound lane center y = 4.06, spawn ln-spawn-south
 * (20.31, −135) heading north, ns limit 50.
 *
 * THE DIAL (signals.ts ns timeline, phaseAt(t + offset), cycle 50 s: green
 * [0,20) → yellow [20,23) → red [23,49) → redYellow [49,50)): offset 0 ⇒ the
 * ns approach is GREEN from t = 0 for 20 s, and every drive crosses the line
 * inside that window. The signal is scenery here — the drill is the arrow.
 *
 * Rule envelope the scripts respect (rules/engine.ts, cfg defaults):
 *   - lane changes grade at ≥ 10 km/h in a forward gear; indicatorOk = a
 *     matching-direction indicator within 3 s, mirrorOk = a matching-direction
 *     glance within 5 s. Deltas near an edge transition are dropped as locator
 *     artifacts (laneChangeJointGraceSec 1.5 s), so every graded change is
 *     authored to land ≥ 3 s before the junction;
 *   - TURN_WITHOUT_INDICATOR fires on turnStarted (55° of accumulated heading
 *     inside the 40 m junction area) with no left indicator in the 3 s lookback;
 *   - POOR_LANE_KEEPING needs 3 s beyond |laneOffsetM| = 3.25 m — the mistake
 *     rides y = 7.7 on the west exit (offset ≈ −3.64, toward the CURB, so
 *     CENTER_LINE_TOUCHED can never arm instead);
 *   - NOT_KEEPING_RIGHT (12 s sustain in laneId > 0) is exempt while the LEFT
 *     indicator is on. The shadow leaves it on from the first change to the
 *     exit; the mistakes hold laneId > 0 unsignalled for well under 12 s.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_LN_TURN_LANE_ARROWS } from "../lessons/scenario/templates-lanes2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_LN_TURN_LANE_ARROWS_ID = "sc-ln-turn-lane-arrows";

/** Northbound lane centers of ln-arrows-v1, by laneId (0 = curb lane). */
const X_RIGHT = 20.31; // → „само надясно"
const X_THROUGH = 12.19; // ↑ „само направо"
const X_LEFT = 4.06; // ← „само наляво"
/** West exit: the westbound lane center, and the curb edge the demo drags. */
const Y_WEST = 4.06;
const Y_WEST_CURB = 7.7; // laneOffsetM ≈ −3.64 (past the 3.25 m tolerance)
/** ns approach GREEN from t = 0 for SIGNAL_TIMING.greenSec (see the header). */
const SIGNAL_OFFSETS = { "ln-n-c": 0 } as const;

/** Arc polyline: center (cx, cy), radius r, param a0→a1 deg (8 segments) —
 *  the scSignals.ts helper. */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Left turn out of the „само наляво" lane: R = 18 quarter arc from
 *  (X_LEFT, −13.94) to (−13.94, Y_WEST) — the sc-signal-dead turning line. */
const LEFT_TURN_FROM_LEFT_LANE: Array<[number, number]> = [
  [X_LEFT, -13.94],
  ...arcPts(-13.94, -13.94, 18, 0, 90),
];

/** The WRONG left turn, cut out of the „само направо" lane: R = 22 quarter arc
 *  from (X_THROUGH, −14.3) landing wide, on the exit's curb edge (Y_WEST_CURB). */
const LEFT_TURN_FROM_THROUGH_LANE: Array<[number, number]> = [
  [X_THROUGH, -14.3],
  ...arcPts(-9.81, -14.3, 22, 0, 90),
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scLnTurnLaneArrowsShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Стрелките на платното: дясна лента — само надясно, средна — само направо, лява — само наляво.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, -135], [X_RIGHT, -132]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Маршрутът ми е наляво — значи ми трябва лявата лента. Заемам я ОТРАНО." },
      { kind: "glance", mirror: "rear" },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      {
        // Lane 0 → 1: a long, shallow diagonal (the scLaneChange mold — internal
        // heading deltas stay under the recorder's 8° curve-cap window).
        kind: "drive",
        points: [[X_RIGHT, -132], [18.5, -120], [13.9, -102], [X_THROUGH, -92], [X_THROUGH, -86]],
        targetKmh: 46,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Лента по лента: пак огледало, мигачът остава — и втората стъпка наляво." },
      { kind: "glance", mirror: "left" },
      {
        // Lane 1 → 2, settled well before the stop line at y = −43.98.
        kind: "drive",
        points: [[X_THROUGH, -86], [10.4, -74], [5.8, -56], [X_LEFT, -46], [X_LEFT, -30]],
        targetKmh: 46,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "В лявата лента съм, зелено е — оттук нататък само следвам стрелката." },
      {
        kind: "drive",
        points: [[X_LEFT, -30], ...LEFT_TURN_FROM_LEFT_LANE, [-30, Y_WEST], [-45, Y_WEST]],
        targetKmh: 34,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-45, Y_WEST], [-90, Y_WEST], [-155, Y_WEST]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Готово: лентата по стрелка, заета отрано — на кръстовището остава само изпълнението.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Ляв завой от лента „само направо“"
// (TURN_WITHOUT_INDICATOR + POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scLnTurnLaneArrowsMistakeLeftFromThroughScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: маршрутът е наляво, но колата спира на средната лента — „само направо“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, -135], [X_RIGHT, -110]], targetKmh: 46, stopAtEnd: false },
      // The one lane change the driver DOES make is clean (mirror + indicator) —
      // the isolated faults are the unsignalled turn and the wide exit.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      {
        kind: "drive",
        points: [[X_RIGHT, -110], [18.5, -98], [13.9, -80], [X_THROUGH, -70], [X_THROUGH, -64]],
        targetKmh: 46,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Престрои се една лента и спря дотам — стрелката под колелата казва „само направо“." },
      { kind: "drive", points: [[X_THROUGH, -64], [X_THROUGH, -40], [X_THROUGH, -14.3]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "И въпреки стрелката завива наляво — без мигач, напреко през чуждата лента." },
      {
        kind: "drive",
        points: [...LEFT_TURN_FROM_THROUGH_LANE, [-30, Y_WEST_CURB], [-50, Y_WEST_CURB]],
        targetKmh: 30,
        stopAtEnd: false,
      },
      // Landing wide: the whole exit dragged along the curb edge (offset ≈ −3.64).
      { kind: "drive", points: [[-50, Y_WEST_CURB], [-80, Y_WEST_CURB], [-105, Y_WEST_CURB]], targetKmh: 32 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Завоят от грешната лента излиза широко и отрязва завиващите законно. Сбъркана лента = продължаваш по стрелката и се връщаш по-нататък.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Късно престрояване през две ленти на самото кръстовище"
// (LANE_CHANGE_WITHOUT_INDICATOR + LANE_CHANGE_WITHOUT_MIRROR_CHECK)
// ---------------------------------------------------------------------------

export function scLnTurnLaneArrowsMistakeLateTwoLanesScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: стрелките се четат в последния момент — и колата пресича две ленти наведнъж." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, -135], [X_RIGHT, -80]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "„Аз съм наляво!“ — без огледало, без мигач, направо през двете ленти." },
      {
        // Both boundaries crossed in one swerve, ~4 s before the junction so the
        // deltas grade (they clear the 1.5 s joint grace with room to spare).
        kind: "drive",
        points: [[X_RIGHT, -80], [17.5, -72], [8.0, -60], [X_LEFT, -52], [X_LEFT, -44]],
        targetKmh: 40,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Мигачът светва чак сега — след маневрата, за завоя. Той трябваше да предхожда престрояването." },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_LEFT, -44], [X_LEFT, -30]], targetKmh: 36, stopAtEnd: false },
      {
        kind: "drive",
        points: [[X_LEFT, -30], ...LEFT_TURN_FROM_LEFT_LANE, [-30, Y_WEST], [-50, Y_WEST]],
        targetKmh: 30,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[-50, Y_WEST], [-80, Y_WEST]], targetKmh: 34 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Двете ленти наведнъж до самата стоп-линия са „изведнъж отникъде“ за всички наоколо. Стрелките се четат отдалеч, а лентата се заема лента по лента — с огледало и мигач.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScLnTurnLaneArrowsTraceName =
  | "shadow-correct"
  | "mistake-left-from-through"
  | "mistake-late-two-lanes";

const SCRIPTS: Record<
  ScLnTurnLaneArrowsTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scLnTurnLaneArrowsShadowScript },
  "mistake-left-from-through": { kind: "mistake", script: scLnTurnLaneArrowsMistakeLeftFromThroughScript },
  "mistake-late-two-lanes": { kind: "mistake", script: scLnTurnLaneArrowsMistakeLateTwoLanesScript },
};

/**
 * Record one of the three drives against a loaded ln-arrows-v1 document — the
 * green window pinned (signalOffsets), the TEMPLATE's staged set (empty),
 * ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScLnTurnLaneArrowsDrive(
  districtRaw: unknown,
  name: ScLnTurnLaneArrowsTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_LN_TURN_LANE_ARROWS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_LN_TURN_LANE_ARROWS.staged ?? [])] as StagedEventSpec[],
    signalOffsets: SIGNAL_OFFSETS,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
