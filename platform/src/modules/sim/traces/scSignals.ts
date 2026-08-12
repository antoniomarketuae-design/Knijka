/**
 * scSignals — the dead/flashing-signal authored drives (doc 76 §5/§9) for the
 * two SIGNALS-family templates, both on the committed sx-v1 district:
 *
 *   sc-signal-dead      sx-v1 (DARK)           shadow + barge + cut
 *   sc-signal-flashing  sx-v1 (FLASHING AMBER) shadow + barge + cut
 *
 * The scripts are the SOURCE of the committed traces under
 * content/traces/<template>/ — the sc-signals trace gate replays exactly these
 * through the production stack (runtime + traffic + scenario director + rules)
 * and asserts the §5 shadow gate (ZERO violations + YIELDED_TO_PRIORITY) and
 * the §9 stage-5 code asserts (each mistake grades EXACTLY FAILED_TO_YIELD).
 *
 * The capability under test (doc 72 JU-20): the recorder dials sx-n-c's signal
 * cluster DARK / on FLASHING AMBER via the signalModes option (runtime
 * setSignalClusterMode) before the first frame, so the junction is UNCONTROLLED
 * and the shipped right-hand-rule tracker adjudicates the car from the right —
 * no signal codes ever fire (the mode maps to unsignalized). Absent the mode
 * these same scripts would face live lamps; the mode is what makes the fallback.
 *
 * Geometry pinned to sx-v1 (battery sx-district.test.ts):
 *   - sx-n-c is ONE single-node cluster at the origin; the derived stop line on
 *     the south approach is at y = −27.725 (sx-e-s@92.3). T7 (ledger §2): the
 *     shadows USED to yield at y = −19.5 — chosen to clear the engine's 18 m
 *     RHR core, but 8.17 m PAST the paint, so the demonstrated-correct ghost
 *     stopped inside the junction mouth and the L1 student followed it there.
 *     They now yield at y = −29.5 — 1.78 m short of the line (the proven
 *     sc-signal-redyellow hold pose), still outside the 18 m core and inside
 *     the 40 m junction area where the right-hand-rule tracker latches;
 *   - drawn lane centers at ±4.0625 m; south spawn at (4.06, −105).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SIGNAL_DEAD, SC_SIGNAL_FLASHING } from "../lessons/scenario/templates-signals";
import type { SignalClusterMode } from "../runtime";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

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

/** Stem approach shared by every drive: south spawn → right-lane cruise. */
const APPROACH: Array<[number, number]> = [
  [LANE, -105],
  [LANE, -34],
];

/**
 * The lawful yield pose on sx-v1's south approach, m (= y) — T7.
 *
 * Centre 1.78 m short of the derived line at −27.725, i.e. the whole car short
 * of the paint (nose at −27.45 against a 1.2 m `stopOvershootCenterM` window
 * that therefore never arms). It is the pose sc-signal-redyellow and
 * sc-jx-blocked-exit already prove on this exact map, and it is 29.78 m from
 * the node — outside the 18 m right-hand-rule core the shadows must clear.
 */
const YIELD_Y = -29.5;
/** Lift-off point for the ease down to YIELD_Y: 20.5 m of gentle deceleration,
 *  so «намали отрано» is demonstrated rather than merely instructed (and no
 *  brake stab ever approaches a harsh-braking read). */
const EASE_FROM_Y = -50;

// ---------------------------------------------------------------------------
// sc-signal-dead — sx-v1 DARK; left turn stem → west arm (R = 18 quarter arc,
// center (−13.94, −13.94)), gives way to the car from the right (east).
// ---------------------------------------------------------------------------

export const SC_SIGNAL_DEAD_ID = "sc-signal-dead";

/** Left turn stem → west arm: R = 18 quarter arc, center (−13.94, −13.94). */
const DEAD_LEFT_TURN: Array<[number, number]> = [
  [LANE, -13.94],
  ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
];

function scSignalDeadShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Светофарът напред е ЗАГАСНАЛ — кръстовището става равнозначно, важи правилото на дясното." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, EASE_FROM_Y]], targetKmh: 20 },
      { kind: "annotation", textBg: "Намали, пусни ляв мигач и се огледай: първо наляво, после НАДЯСНО." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // T7: ease to the lawful yield pose — SHORT of the painted stop line,
        // not 8 m beyond it. Still outside the 18 m conviction core.
        kind: "drive",
        points: [
          [LANE, EASE_FROM_Y],
          [LANE, YIELD_Y],
        ],
        targetKmh: 9,
      },
      { kind: "annotation", textBg: "Спираме ПРЕД стоп-линията — кола отдясно има предимство и я пропускаме изцяло." },
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътят е чист — завиваме наляво уверено." },
      {
        kind: "drive",
        points: [
          [LANE, YIELD_Y],
          ...DEAD_LEFT_TURN,
          [-30, LANE],
          [-55, LANE],
        ],
        targetKmh: 16,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Угасналият светофар не дава предимство — намали, пропусна отдясно и премина безопасно." },
    ],
  };
}

function scSignalDeadMistakeBargeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: тъмният светофар се приема за зелено и скоростта изобщо не пада." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      { kind: "indicator", setting: "left" },
      {
        // Constant-speed barge through the core while the car from the right is
        // inbound — the RHR tracker convicts (FAILED_TO_YIELD).
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -13.94],
          ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
          [-30, LANE],
          [-52, LANE],
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Колата отдясно трябваше да мине първа — загасналият светофар прави кръстовището равнозначно.",
      },
    ],
  };
}

function scSignalDeadMistakeCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „ще се промъкна“: понамалих, но не спрях пред идващия отдясно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LANE, -34], [LANE, -22]], targetKmh: 12 },
      {
        // Roll straight into the turn without a real stop while the priority car
        // is inbound from the right — the RHR tracker convicts (FAILED_TO_YIELD).
        kind: "drive",
        points: [
          [LANE, -22],
          ...DEAD_LEFT_TURN,
          [-30, LANE],
          [-52, LANE],
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Намаляването не е пропускане: идващият отдясно се дава реално, като го изчакаш да премине.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// sc-signal-flashing — sx-v1 FLASHING AMBER; STRAIGHT through (south → north),
// gives way to the car from the right (east). Same map, distinct maneuver.
// ---------------------------------------------------------------------------

export const SC_SIGNAL_FLASHING_ID = "sc-signal-flashing";

/** Straight run through the box and up the north arm (stays in the right lane). */
const FLASH_STRAIGHT: Array<[number, number]> = [
  [LANE, 0],
  [LANE, 30],
  [LANE, 48],
];

function scSignalFlashingShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Светофарът напред мига в ЖЪЛТО — премини с повишено внимание и пропусни предимството." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE, -105], [LANE, EASE_FROM_Y]], targetKmh: 20 },
      { kind: "annotation", textBg: "Мигащото жълто не е зелено: намаляваме и се оглеждаме — наляво и НАДЯСНО." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // T7: the halt lands SHORT of the painted line (see YIELD_Y).
        kind: "drive",
        points: [
          [LANE, EASE_FROM_Y],
          [LANE, YIELD_Y],
        ],
        targetKmh: 9,
      },
      { kind: "annotation", textBg: "Спираме ПРЕД стоп-линията — кола отдясно има предимство и я пропускаме изцяло." },
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътят е чист — преминаваме правó напред." },
      {
        kind: "drive",
        points: [
          [LANE, YIELD_Y],
          ...FLASH_STRAIGHT,
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Мигащото жълто иска внимание и пропускане — намали, пропусна отдясно и премина." },
    ],
  };
}

function scSignalFlashingMistakeBargeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: мигащото жълто се приема за зелено — минаваме без да намалим." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      {
        // Constant-speed straight barge while the car from the right is inbound.
        kind: "drive",
        points: [
          [LANE, -34],
          ...FLASH_STRAIGHT,
        ],
        targetKmh: 20,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Колата отдясно трябваше да мине първа — мигащото жълто изисква пропускане, не спринт.",
      },
    ],
  };
}

function scSignalFlashingMistakeCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „ще успея“: понамалих, но продължих право напред пред идващия отдясно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 22 },
      { kind: "drive", points: [[LANE, -34], [LANE, -22]], targetKmh: 12 },
      {
        // Roll straight across without a real stop while the priority car is
        // inbound from the right — the RHR tracker convicts (FAILED_TO_YIELD).
        kind: "drive",
        points: [
          [LANE, -22],
          ...FLASH_STRAIGHT,
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Намаляването не е пропускане: на мигащо жълто изчакваш идващия отдясно да премине.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry — one deterministic function)
// ---------------------------------------------------------------------------

export type ScSignalTemplateId = typeof SC_SIGNAL_DEAD_ID | typeof SC_SIGNAL_FLASHING_ID;

export type ScSignalTraceName = "shadow-correct" | "mistake-barge" | "mistake-cut";

interface SignalRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

interface SignalTemplateRecordings {
  districtId: string;
  /** Session-start signal mode dialed on sx-n-c (the capability under test). */
  signalModes: Readonly<Record<string, SignalClusterMode>>;
  stagedEvents: StagedEventSpec[];
  drives: Partial<Record<ScSignalTraceName, SignalRecordingSpec>>;
}

export const SC_SIGNAL_RECORDINGS: Record<ScSignalTemplateId, SignalTemplateRecordings> = {
  [SC_SIGNAL_DEAD_ID]: {
    // B40(b): its own signalized district now (a collector crossing) — the ns
    // carriageway, the spawn and the derived stop line are byte-identical.
    districtId: "sxd-v1",
    signalModes: { "sx-n-c": "dark" },
    stagedEvents: [...(SC_SIGNAL_DEAD.staged ?? [])],
    drives: {
      "shadow-correct": { kind: "shadow", script: scSignalDeadShadowScript },
      "mistake-barge": { kind: "mistake", script: scSignalDeadMistakeBargeScript },
      "mistake-cut": { kind: "mistake", script: scSignalDeadMistakeCutScript },
    },
  },
  [SC_SIGNAL_FLASHING_ID]: {
    // B40(b): its own signalized district now (a one-way side street).
    districtId: "sxf-v1",
    signalModes: { "sx-n-c": "flashingAmber" },
    stagedEvents: [...(SC_SIGNAL_FLASHING.staged ?? [])],
    drives: {
      "shadow-correct": { kind: "shadow", script: scSignalFlashingShadowScript },
      "mistake-barge": { kind: "mistake", script: scSignalFlashingMistakeBargeScript },
      "mistake-cut": { kind: "mistake", script: scSignalFlashingMistakeCutScript },
    },
  },
};

/** Trace names of one template, in committed order (shadow first). */
export function scSignalTraceNames(templateId: ScSignalTemplateId): ScSignalTraceName[] {
  return Object.keys(SC_SIGNAL_RECORDINGS[templateId].drives) as ScSignalTraceName[];
}

/**
 * Record one dead/flashing-signal drive against ITS loaded district document —
 * the signal MODE dialed on sx-n-c (the capability), staged events from the
 * template (the same set compiled lessons run). Deterministic: same district →
 * same trace (seed 7, the house recording seed).
 */
export function recordScSignalDrive(
  districtRaw: unknown,
  templateId: ScSignalTemplateId,
  name: ScSignalTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const template = SC_SIGNAL_RECORDINGS[templateId];
  const rec = template.drives[name];
  if (!rec) throw new Error(`recordScSignalDrive: ${templateId} has no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: templateId,
    kind: rec.kind,
    seed: 7,
    stagedEvents: template.stagedEvents,
    signalModes: template.signalModes,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
