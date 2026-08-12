/**
 * scJunctions2 — the S3 batch-4 authored drives (doc 76 §5/§9) for the two
 * NEW junction/priority templates, on the committed generated districts:
 *
 *   sc-junction-gap    tj-emerge-v1    shadow + cut-gap + creep-out
 *   sc-junction-blind  tj-occluded-v1  shadow + barge + no-look
 *
 * The scripts are the SOURCE of the committed traces under
 * content/traces/<template>/ — the per-map trace-gate test (sc-ju2-traces)
 * replays exactly these through the production stack (runtime + traffic +
 * scenario director + rules) and asserts the §5 shadow gate (ZERO violations +
 * the yielded proof) and the §9 stage-5 code asserts (each mistake grades
 * EXACTLY its authored codeRefs).
 *
 * Geometry pinned to the generated districts (battery proves the numbers):
 *   - drawn lane centers at ±4.0625 m off the road centerline;
 *   - tj-emerge Б2 line 27.725 m from the node (stem: y = −27.725), stem
 *     spawn at y = −85 (minorArmM 100);
 *   - tj-occluded is uncontrolled (right-hand rule); the 18 m conviction core
 *     around the node is identical to tj-rhr, stem spawn at y = −115
 *     (minorArmM 130). The blind shadow YIELDS at y = −19.5 — outside the core.
 *
 * Grading sites (only ONE adjudicator per template, as the shipped four do):
 *   - sc-junction-gap: the GIVE-WAY conflictNear at the Б2 line
 *     (FAILED_TO_YIELD). A full stop earns FULL_STOP_AT_STOP_SIGN and the
 *     runner emits the give-way yielded commendation on a clean pass; the two
 *     mistakes stop fully (no STOP_SIGN_NO_FULL_STOP) and emerge into the car.
 *   - sc-junction-blind: the RIGHT-HAND-RULE tracker at the uncontrolled node
 *     (FAILED_TO_YIELD / COLLISION) — identical to sc-junction-rhr.
 */

import type { StagedEventSpec } from "../contracts";
import {
  SC_JUNCTION_GAP,
  SC_JUNCTION_BLIND,
} from "../lessons/scenario/templates-junctions2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

/** Drawn lane-center offset on every junction map, m. */
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
// sc-junction-gap — tj-emerge-v1 (Б2 line at y = −27.725; spawn (4.06, −85))
// ---------------------------------------------------------------------------

export const SC_JUNCTION_GAP_ID = "sc-junction-gap";

/** Stem approach: spawn → right-lane cruise toward the Б2 line. */
const GAP_APPROACH: Array<[number, number]> = [
  [LANE, -85],
  [LANE, -45],
];

/** Right turn stem → east arm: R = 20 quarter arc, center (24.06, −24.06). */
const GAP_RIGHT_TURN: Array<[number, number]> = [
  [LANE, -24.06],
  ...arcPts(24.0625, -24.0625, 20, 180, 90),
];

function scJunctionGapShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е път с предимство и знак Б2 „Спри!“ — тук се спира и се преценява." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: GAP_APPROACH, targetKmh: 25 },
      { kind: "annotation", textBg: "Десен мигач и плавно към стоп-линията." },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -29.2],
        ],
        targetKmh: 12,
      },
      { kind: "annotation", textBg: "Пълно спиране преди линията — и сега преценяваме идващия по главния път." },
      { kind: "pause", sec: 6.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Колата с предимство премина, пътят е чист — потегляме." },
      {
        kind: "drive",
        points: [
          [LANE, -29.2],
          ...GAP_RIGHT_TURN,
          [58, -LANE],
          [72, -LANE],
        ],
        targetKmh: 15,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спря докрай, изчака интервала и завя надясно — точно това гледа изпитващият." },
    ],
  };
}

/**
 * B5 TIMING NOTE (doc 87, 2026-08-10) — why the mistake approach is 20 km/h and
 * the „кратко спиране" is 0.9 s. Read this before retuning either number.
 *
 * These demos claim «колата с предимство трябваше да намали заради теб». Until
 * this wave that claim was not true of the choreography, and nothing caught it
 * because `conflictNearFor` convicted on ANY moving crosswise vehicle within
 * 26 m of the node. Measured at the graded instant (the Б2 line crossing) with
 * the old script: the priority car was **19.4 m past the node and departing**
 * on `mistake-cut-gap`, **22.8 m past** on `mistake-creep-out` — it had crossed
 * the student's path seconds earlier and was leaving. The demo taught a fault
 * that had not happened.
 *
 * The desync is structural, not random. `PriorityFromRightRunner` releases the
 * pinned car when the player's ETA to the LINE falls under the car's own
 * transit to the node (`WITNESS_ENTRY_MARGIN_SEC`), i.e. it aims to put the car
 * in the box exactly as the student arrives. Every second the student spends
 * after that release — a slow final leg, a long pause — is a second the car
 * spends leaving. The old 12 km/h leg plus a 1.6 s stop spent ~2.8 s of it.
 *
 * 20 km/h + 0.9 s spends ~0.9 s, which lands the car **6.3 m past the node,
 * still inside the box** at the graded instant (7.5 m on ju3's mirror of this
 * script) — under CONFLICT_CLEARED_M, so it is still a vehicle he cut across.
 * 0.9 s is comfortably a graded FULL STOP (`fullStopMinDurationSec` 0.5), which
 * the gate asserts by requiring no STOP_SIGN_NO_FULL_STOP in these demos.
 */
function scJunctionGapMistakeCutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „ще успея“: спирам, но потеглям пред приближаващата кола." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: GAP_APPROACH, targetKmh: 25 },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -29.2],
        ],
        targetKmh: 20,
      },
      { kind: "annotation", textBg: "Кратко спиране — и веднага газ, докато колата с предимство е още в кръстовището." },
      // 0.9 s: still a graded FULL STOP (fullStopMinDurationSec 0.5) and still
      // „кратко", but no longer 1.6 s of DESYNC. See the timing note on
      // scJunctionGapMistakeCutScript.
      { kind: "pause", sec: 0.9, brake: true },
      { kind: "glance", mirror: "left" },
      {
        // Emerge at speed while the priority car is still in the conflict box.
        kind: "drive",
        points: [
          [LANE, -29.2],
          ...GAP_RIGHT_TURN,
          [58, -LANE],
          [72, -LANE],
        ],
        targetKmh: 18,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Колата с предимство трябваше да намали заради теб. Спирането не е предимство — интервалът е.",
      },
    ],
  };
}

function scJunctionGapMistakeCreepScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката „пълзящо навлизане“: спирам, после запълзявам в пътя с предимство." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: GAP_APPROACH, targetKmh: 25 },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [LANE, -45],
          [LANE, -29.2],
        ],
        targetKmh: 20,
      },
      { kind: "annotation", textBg: "Спрях, но носът тръгва навътре, докато колата с предимство приближава." },
      { kind: "pause", sec: 0.9, brake: true },
      { kind: "glance", mirror: "left" },
      {
        // Creep the nose across the line into the box while the car is present.
        kind: "drive",
        points: [
          [LANE, -29.2],
          [LANE, -24.06],
        ],
        targetKmh: 7,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: [
          ...arcPts(24.0625, -24.0625, 20, 180, 90),
          [58, -LANE],
        ],
        targetKmh: 12,
      },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg: "Бавното навлизане също отне предимството — важна е позицията на колата, не скоростта ѝ.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// sc-junction-blind — tj-occluded-v1 (uncontrolled; spawn (4.06, −115))
// mirrors sc-junction-rhr: the 18 m core dynamics are arm-independent.
// ---------------------------------------------------------------------------

export const SC_JUNCTION_BLIND_ID = "sc-junction-blind";

/** Stem approach: spawn → right-lane cruise toward the junction. */
const BLIND_APPROACH: Array<[number, number]> = [
  [LANE, -115],
  [LANE, -34],
];

/** Left turn stem → west arm: R = 18 quarter arc, center (−13.94, −13.94). */
const BLIND_LEFT_TURN: Array<[number, number]> = [
  [LANE, -13.94],
  ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
];

function scJunctionBlindShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Равнозначно кръстовище, но сграда на ъгъла крие гледката надясно — приближаваме с готовност за спиране." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: BLIND_APPROACH, targetKmh: 20 },
      { kind: "annotation", textBg: "Ляв мигач и се оглеждаме: първо наляво, после НАДЯСНО, изпълзявайки докато видим зад сградата." },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        // Creep to the yield point OUTSIDE the 18 m conviction core.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -19.5],
        ],
        targetKmh: 9,
      },
      { kind: "annotation", textBg: "Кола отдясно се показа иззад сградата — тя има предимство. Спираме и я пропускаме." },
      { kind: "pause", sec: 8.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътят е чист — завиваме наляво уверено." },
      {
        kind: "drive",
        points: [
          [LANE, -19.5],
          ...BLIND_LEFT_TURN,
          [-30, LANE],
          [-55, LANE],
        ],
        targetKmh: 16,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изпълзя внимателно, видя, пропусна и премина — така се взима кръстовище на сляпо." },
    ],
  };
}

function scJunctionBlindMistakeBargeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: сградата крие дясното, но скоростта изобщо не пада." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: BLIND_APPROACH, targetKmh: 22 },
      { kind: "indicator", setting: "left" },
      {
        // Constant-speed barge through the core while the car is inbound from
        // the right — the RHR tracker convicts (FAILED_TO_YIELD).
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
        textBg: "Колата отдясно трябваше да мине първа — на закрито кръстовище високата скорост е отнето предимство.",
      },
    ],
  };
}

function scJunctionBlindMistakeNoLookScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Гледай какво става, когато не изчакаш да видиш зад сградата." },
      { kind: "drive", points: BLIND_APPROACH, targetKmh: 20 },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Никакво изпълзяване — колата се вмъква направо в устието на сляпо." },
      {
        // Roll blind to the junction MOUTH (just outside the 18 m core) and
        // meet the hidden car there — the authored contact fires before the
        // driver ever holds the core, so the offence graded is the crash
        // itself (COLLISION), not a sustained failure-to-yield.
        kind: "drive",
        points: [
          [LANE, -34],
          [LANE, -19.5],
        ],
        targetKmh: 16,
        stopAtEnd: false,
      },
      // The authored consequence: the hidden priority car strikes the nose.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "Колата отдясно остана скрита до удара. Зад сграда се пълзи, докато очите видят — после се тръгва.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry — one deterministic function)
// ---------------------------------------------------------------------------

export type ScJunction2TemplateId = typeof SC_JUNCTION_GAP_ID | typeof SC_JUNCTION_BLIND_ID;

export type ScJunction2TraceName =
  | "shadow-correct"
  | "mistake-cut-gap"
  | "mistake-creep-out"
  | "mistake-barge"
  | "mistake-no-look";

interface Junction2RecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
}

interface Junction2TemplateRecordings {
  districtId: string;
  stagedEvents: StagedEventSpec[];
  drives: Partial<Record<ScJunction2TraceName, Junction2RecordingSpec>>;
}

export const SC_JUNCTION2_RECORDINGS: Record<ScJunction2TemplateId, Junction2TemplateRecordings> = {
  [SC_JUNCTION_GAP_ID]: {
    districtId: "tj-emerge-v1",
    stagedEvents: [...(SC_JUNCTION_GAP.staged ?? [])],
    drives: {
      "shadow-correct": { kind: "shadow", script: scJunctionGapShadowScript },
      "mistake-cut-gap": { kind: "mistake", script: scJunctionGapMistakeCutScript },
      "mistake-creep-out": { kind: "mistake", script: scJunctionGapMistakeCreepScript },
    },
  },
  [SC_JUNCTION_BLIND_ID]: {
    districtId: "tj-occluded-v1",
    stagedEvents: [...(SC_JUNCTION_BLIND.staged ?? [])],
    drives: {
      "shadow-correct": { kind: "shadow", script: scJunctionBlindShadowScript },
      "mistake-barge": { kind: "mistake", script: scJunctionBlindMistakeBargeScript },
      "mistake-no-look": { kind: "mistake", script: scJunctionBlindMistakeNoLookScript },
    },
  },
};

/** Trace names of one template, in committed order (shadow first). */
export function scJunction2TraceNames(templateId: ScJunction2TemplateId): ScJunction2TraceName[] {
  return Object.keys(SC_JUNCTION2_RECORDINGS[templateId].drives) as ScJunction2TraceName[];
}

/**
 * Record one S3 batch-4 drive against ITS loaded district document — staged
 * events from the template (the same set compiled lessons run). Deterministic:
 * same district → same trace (seed 7, the house recording seed).
 */
export function recordScJunction2Drive(
  districtRaw: unknown,
  templateId: ScJunction2TemplateId,
  name: ScJunction2TraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const template = SC_JUNCTION2_RECORDINGS[templateId];
  const rec = template.drives[name];
  if (!rec) throw new Error(`recordScJunction2Drive: ${templateId} has no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: templateId,
    kind: rec.kind,
    seed: 7,
    stagedEvents: template.stagedEvents,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
