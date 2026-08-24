/**
 * scRxTram — the RAIL-PACK ACTOR-SLICE authored drives (ADR-006 stage 3b,
 * doc 76 §5/§9) for the two TRAM templates, on their committed districts:
 *
 *   sc-rx-tram-left   sx-v1               shadow + cut-tram + no-indicator
 *   sc-rx-tram-island rx-tram-island-v1   shadow + squeeze-past + collision
 *
 * The scripts are the SOURCE of the committed traces under
 * content/traces/<template>/ — the trace-gate tests replay exactly these
 * through the production stack (runtime + traffic + scenario director +
 * rules) and assert the §5 shadow gate (ZERO violations) and the §9 stage-5
 * code asserts (each mistake grades EXACTLY its authored codeRefs).
 *
 * sc-rx-tram-left is sc-turn-left-oncoming's site and machinery with a
 * RAIL-BOUND actor (the scJunctions scLtap* scripts are the mold): the same
 * sx-v1 spawn (105, 4.06) heading west, the same EW-green signal pin
 * (SX_PIN_EW_GREEN_WINDOW), the same R15 left-turn arc for the two drives that
 * turn PROPERLY — but ONE oncoming actor, the 14 m tram (profile "tram",
 * cruise 10.5 m/s, gapSec 1.6 → inside the ≤ 2 s conviction band). The shadow's
 * wait is LONGER than the car scenario's (9.5 s vs 7.5) because its 14 m must
 * pass IN FULL — the pedagogy is the patience. The MISTAKE takes its own
 * corner-cut line (SX_LEFT_CUT) so the near miss is a near miss and not a
 * crash; see that constant and the template's cruise-speed note.
 *
 * sc-rx-tram-island is the scCrossingBusShadow mold pointed at a tram stop:
 * the halted tram is a staged PROP on the dart-out spec itself (visible in
 * live sessions AND recordings — an upgrade over the bus's trace-side
 * obstacle rect), the darter is the template's own staged passenger, and the
 * grading is 100% the shipped pedestrian chain.
 *
 * Geometry pinned to the committed maps (batteries prove the numbers):
 *   sx-v1: lane centers ±4.0625; rx-tram-island-v1: street on x = 0, lane
 *   center 4.06, zebra at y = 90, island [92, 106], tram body center y = 101.
 */

import type { StagedEventSpec } from "../contracts";
import {
  SC_RX_TRAM_ISLAND,
  SC_RX_TRAM_LEFT,
} from "../lessons/scenario/templates-rail";
import { SX_PIN_EW_GREEN_WINDOW } from "./scJunctions";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RX_TRAM_LEFT_ID = "sc-rx-tram-left";
export const SC_RX_TRAM_ISLAND_ID = "sc-rx-tram-island";

/** Drawn lane-center offset on sx-v1, m. */
const LANE = 4.0625;

/** Arc polyline: center (cx, cy), radius r, param a0→a1 deg (8 segments). */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// sc-rx-tram-left — sx-v1 (spawn (105, 4.06) heading west; EW green pinned;
// ONE staged oncoming TRAM from the west)
// ---------------------------------------------------------------------------

const SX_EAST_APPROACH: Array<[number, number]> = [
  [105, LANE],
  [52, LANE],
];

/** Left turn east arm → south arm: R = 15 quarter arc (the detector-tuned
 *  radius — see scJunctions SX_LEFT_TURN for the 55°/3 s derivation). */
const SX_LEFT_TURN: Array<[number, number]> = [
  [10.9375, LANE],
  ...arcPts(10.9375, -10.9375, 15, 90, 180),
];

/**
 * „РЯЗАНЕ" — the corner-CUT line the mistake demo takes (founder review
 * 2026-07-27: „the tram and the car actually colide … in real life scenarios
 * the cars go infront of the trams and do not colide, just make it very hard
 * for the tram to stop").
 *
 * The textbook SX_LEFT_TURN above is tangent to both lane centres, so it meets
 * the tram's rail lane (y = −LANE) at x ≈ −2.4 — WEST of the junction node,
 * where a tram held at a 1.6 s gap physically is. The consist's own speed
 * (templates-rail) buys the metres; this line buys the rest by being the
 * manoeuvre an impatient driver actually makes: he does not arc politely round
 * the junction centre, he CUTS, peeling into the oncoming half early. It meets
 * the rail lane at x ≈ +2.3 — ~4.7 m east of the arc and, more importantly,
 * ~0.9 s SOONER after the node, so the car is already past the consist's line
 * of travel while the tram is still hauling itself down (the staged
 * playerGuard's 8 m/s²) 12 m short of it. Measured minimum clearance
 * car-body → tram-nose: ~5 m.
 *
 * The graded act is UNCHANGED: the same left turn, committed inside the same
 * authored 1.6 s gap (LEFT_TURN_CONVICT_GAP_SEC = 2.0), read by the same
 * runtime N1 tracker — FAILED_TO_YIELD, left-turn-oncoming. The corner is kept
 * to ≈ 15 m of effective radius so the TurnDetector's 55°/3 s window still arms
 * (the recorder's curve cap ties speed to radius — rate ≈ √(2.4/r) rad/s — so a
 * lazier corner turns too slowly to register at all, and the demo would grade
 * NOTHING; the trace gate is what proves it did not).
 */
const SX_LEFT_CUT: Array<[number, number]> = [
  [14, LANE],
  [7.0, 1.0],
  [1.6, -4.6],
  [-2.0, -11.5],
  [-3.4, -20],
  [-LANE, -32],
];

function scRxTramLeftShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Релси в платното и ляв завой напред: трамваят има предимство винаги — и спира три пъти по-дълго от кола." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: SX_EAST_APPROACH, targetKmh: 25 },
      { kind: "annotation", textBg: "Насреща се задава трамвай. Той не може нито да спре навреме, нито да завие — чакаме, без да навлизаме върху релсите." },
      {
        kind: "drive",
        points: [
          [52, LANE],
          [31.2, LANE],
        ],
        targetKmh: 14,
      },
      // The wait: 14 m of tram must pass IN FULL — longer than the car
      // scenario's 7.5 s (slower cruise, slower clear, a full tram length).
      { kind: "pause", sec: 9.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Трамваят премина изцяло и трасето е чисто — завиваме решително." },
      {
        kind: "drive",
        points: [
          [31.2, LANE],
          ...SX_LEFT_TURN,
          [-LANE, -30],
          [-LANE, -56],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изчака релсовото возило докрай и зави чак тогава — така се пресича трамвайно трасе." },
    ],
  };
}

function scRxTramLeftMistakeCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „той ще спре“: ляв завой през релсите пред идващия трамвай." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[105, LANE], [40, LANE]], targetKmh: 26 },
      {
        // The cut: no lift, peel early across the tram's lane while it is
        // ~1.6 s from the junction — the N1 tracker convicts (FAILED_TO_YIELD,
        // left-turn-oncoming). The tram cannot swerve at all and stops in
        // multiples of a car's distance: it stands on its brakes and the car
        // scrapes through in front of it (see SX_LEFT_CUT).
        kind: "drive",
        points: [
          [40, LANE],
          ...SX_LEFT_CUT,
          [-LANE, -52],
        ],
        targetKmh: 26,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Трамваят трябваше да спасява положението — а той спира в пъти по-дълго и не завива. Релсовото возило се пропуска винаги (чл. 8, ал. 2).",
      },
    ],
  };
}

function scRxTramLeftMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Изчакването на трамвая е правилно — но никой не знае, че ще завиваме през релсите: мигач няма." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: SX_EAST_APPROACH, targetKmh: 25 },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[52, LANE], [37, LANE]], targetKmh: 12 },
      {
        // Creep instead of a full rest: 2 km/h toward the mouth (the honest
        // way to hold at a GREEN light without declaring — the scLtap
        // no-indicator recipe; the slow creep also lets the tram clear).
        kind: "drive",
        points: [
          [37, LANE],
          [31.2, LANE],
        ],
        targetKmh: 2,
        stopAtEnd: false,
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // The turn itself — properly yielded to the tram, but UNSIGNALED.
        kind: "drive",
        points: [
          [31.2, LANE],
          ...SX_LEFT_TURN,
          [-LANE, -30],
          [-LANE, -52],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Завоят през трасето започна без ляв мигач — нито ватманът, нито колоната отзад имаше как да го предвиди.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// sc-rx-tram-island — rx-tram-island-v1 (spawn (4.06, 15) heading north;
// halted tram prop at y = 101 on the southbound lane, passenger darts WEST
// across the player's lane at the y = 90 zebra toward the island)
// ---------------------------------------------------------------------------

/** Northbound right-lane center of rx-tram-island-v1. */
const X_LANE = 4.06;
/** The passenger crossing (rxt-x-1). */
const Y_ZEBRA = 90;

function scRxTramIslandShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Спрял трамвай на остров вляво, вратите отворени — очаквай пътници през платното. Крак над спирачката." },
      { kind: "glance", mirror: "rear" },
      // ~24 km/h — well under the limit AND the crossing approach cap.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 40]], targetKmh: 24 },
      {
        kind: "annotation",
        textBg: "Пътник хуква през пътеката към трамвая! Реагирай веднага — спирачка, без да завиваш.",
      },
      {
        // Firm, planned stop 6 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 40], [X_LANE, 62], [X_LANE, Y_ZEBRA - 6]],
        targetKmh: 24,
      },
      // Wait the passenger out — 1.8 m/s across the carriageway ≈ 9 s + margin.
      { kind: "pause", sec: 11, brake: true },
      { kind: "annotation", textBg: "Изчакай го да стигне острова — не потегляй под носа му." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Премини внимателно покрай острова едва когато платното е свободно." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6], [X_LANE, 120], [X_LANE, 134]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: намали покрай спрелия трамвай, реагира навреме и пропусна пътника до острова." },
    ],
  };
}

function scRxTramIslandMistakeSqueezeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата профучава покрай спрелия трамвай, без да пропусне тичащия към острова пътник.",
      },
      { kind: "glance", mirror: "rear" },
      // 24 km/h — legal and under the 30 km/h approach cap, so the ONLY fault
      // is crossing while the passenger is still on the roadway.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60]], targetKmh: 24, stopAtEnd: false },
      { kind: "annotation", textBg: "Пътникът е на платното, но колата не изчаква…" },
      {
        kind: "drive",
        points: [[X_LANE, 60], [X_LANE, 124]],
        targetKmh: 24,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спрял трамвай с отворени врати значи хора на платното — чл. 66, ал. 2: намали и спри, за да преминат до острова.",
      },
    ],
  };
}

function scRxTramIslandMistakeCollisionScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: погледът е другаде, спирачка не идва — а пътникът вече тича през пътеката към трамвая.",
      },
      { kind: "glance", mirror: "rear" },
      // ~28 km/h, under the 30 km/h approach cap (no too-fast), no braking:
      // the car reaches the zebra and strikes the passenger — the ONLY code
      // is the authored contact (never passes the line, so no not-yielded).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пътникът е на пътеката пред отворените врати, а колата не спира…" },
      { kind: "drive", points: [[X_LANE, 60], [X_LANE, Y_ZEBRA - 2]], targetKmh: 28, stopAtEnd: false },
      // The authored consequence: the passenger is struck on the crossing.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "Покрай спирка скоростта трябва да позволява спиране при внезапна поява — трамваят ИЗПРАЩА хора през платното. Ударът прекратява изпита.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry — one deterministic function)
// ---------------------------------------------------------------------------

export type ScRxTramTemplateId = typeof SC_RX_TRAM_LEFT_ID | typeof SC_RX_TRAM_ISLAND_ID;

export type ScRxTramTraceName =
  | "shadow-correct"
  | "mistake-cut-tram"
  | "mistake-no-indicator"
  | "mistake-squeeze-past"
  | "mistake-collision";

interface TramRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
  signalOffsets?: Readonly<Record<string, number>>;
}

interface TramTemplateRecordings {
  districtId: string;
  stagedEvents: StagedEventSpec[];
  drives: Partial<Record<ScRxTramTraceName, TramRecordingSpec>>;
}

export const SC_RX_TRAM_RECORDINGS: Record<ScRxTramTemplateId, TramTemplateRecordings> = {
  [SC_RX_TRAM_LEFT_ID]: {
    districtId: "sx-v1",
    stagedEvents: [...(SC_RX_TRAM_LEFT.staged ?? [])],
    drives: {
      "shadow-correct": {
        kind: "shadow",
        script: scRxTramLeftShadowScript,
        signalOffsets: SX_PIN_EW_GREEN_WINDOW,
      },
      "mistake-cut-tram": {
        kind: "mistake",
        script: scRxTramLeftMistakeCutScript,
        signalOffsets: SX_PIN_EW_GREEN_WINDOW,
      },
      "mistake-no-indicator": {
        kind: "mistake",
        script: scRxTramLeftMistakeNoIndicatorScript,
        signalOffsets: SX_PIN_EW_GREEN_WINDOW,
      },
    },
  },
  [SC_RX_TRAM_ISLAND_ID]: {
    districtId: "rx-tram-island-v1",
    stagedEvents: [...(SC_RX_TRAM_ISLAND.staged ?? [])],
    drives: {
      "shadow-correct": { kind: "shadow", script: scRxTramIslandShadowScript },
      "mistake-squeeze-past": { kind: "mistake", script: scRxTramIslandMistakeSqueezeScript },
      "mistake-collision": { kind: "mistake", script: scRxTramIslandMistakeCollisionScript },
    },
  },
};

/** Trace names of one template, in committed order (shadow first). */
export function scRxTramTraceNames(templateId: ScRxTramTemplateId): ScRxTramTraceName[] {
  return Object.keys(SC_RX_TRAM_RECORDINGS[templateId].drives) as ScRxTramTraceName[];
}

/**
 * Record one tram-slice drive against ITS loaded district document — staged
 * events from the template (the same set compiled lessons run; the island's
 * halted-tram PROP rides the dart-out spec itself), signal offsets per the
 * recording's authored pin. Deterministic: same district → same trace
 * (seed 7, the house recording seed; ambient traffic zero — the harness law).
 */
export function recordScRxTramDrive(
  districtRaw: unknown,
  templateId: ScRxTramTemplateId,
  name: ScRxTramTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const template = SC_RX_TRAM_RECORDINGS[templateId];
  const rec = template.drives[name];
  if (!rec) throw new Error(`recordScRxTramDrive: ${templateId} has no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: templateId,
    kind: rec.kind,
    seed: 7,
    stagedEvents: template.stagedEvents,
    collisionMinKmh: 0,
    ...(rec.signalOffsets ? { signalOffsets: rec.signalOffsets } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
