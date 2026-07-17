/**
 * scJxPriorityConfidence — the wave-3 authored drives (doc 76 §5/§9) for the
 * priority-road pass, on the committed generated district:
 *
 *   sc-jx-priority-confidence  tj-stop-v1  shadow + phantom-brake + blind-priority
 *
 * The scripts are the SOURCE of the committed traces under
 * content/traces/sc-jx-priority-confidence/ — the trace-gate test
 * (sc-jx-priority-confidence-traces) replays exactly these through the
 * production stack (runtime + traffic + scenario director + rules) and asserts
 * the §5 shadow gate (ZERO violations) and the §9 stage-5 code asserts (each
 * mistake grades EXACTLY its authored codeRefs).
 *
 * Geometry pinned to the generated district (the tj battery proves the numbers):
 *   - drawn lane centers at ±4.0625 m off the road centerline; the player runs
 *     WEST→EAST on the primary arm, so their lane is y = −4.0625;
 *   - the primary arm is 150 m per side at 50 km/h; the stem is 120 m at 40;
 *   - tj-n-c carries exactly ONE derived stop line — the Б2 at the stem mouth,
 *     27.725 m from the node — which is why tj-n-c is NOT an uncontrolled
 *     junction and the right-hand-rule tracker never arms on the player.
 *
 * Grading sites — deliberately few, and none of them a priority adjudicator:
 *   - HARSH_BRAKING_NO_CAUSE (SP-11/VP-09) is the taught fault. Its cause ledger
 *     reads only the FORWARD channels, so the лепка behind the player is
 *     structurally not a cause — which is exactly what makes the phantom brake
 *     gradeable and the drill honest.
 *   - COLLISION for the L5 нахлуващ.
 * The shadow's whole job is to prove the third state exists: pass a junction at
 * a steady 46 km/h, with a car waiting at the Б2 and a car glued to your bumper,
 * and have the engine find NOTHING to say.
 */

import type { StagedEventSpec } from "../contracts";
import {
  SC_JX_PRIORITY_CONFIDENCE,
  SC_JX_PRIO_CREEPER,
} from "../lessons/scenario/templates-junctions3";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

/** Drawn lane-center offset on every junction map, m. */
const LANE = 4.0625;
/** The player's eastbound lane on the primary arm, m. */
const Y = -LANE;

// ---------------------------------------------------------------------------
// sc-jx-priority-confidence — tj-stop-v1 (T with Б2 on the stem; spawn (−135, 0))
// ---------------------------------------------------------------------------

export const SC_JX_PRIORITY_CONFIDENCE_ID = "sc-jx-priority-confidence";
export const SC_JX_PRIORITY_CONFIDENCE_DISTRICT_ID = "tj-stop-v1";

/**
 * Spawn → eastbound lane center. tj-spawn-west sits ON the centerline (−135, 0),
 * so every drive opens with the same 15 m settle into the right-hand lane; the
 * recorder does not lane-offset, the author does.
 */
const APPROACH_SETTLE: Array<[number, number]> = [
  [-135, 0],
  [-131, -2],
  [-120, Y],
];

/**
 * The cruising speed of every drive, km/h. Under the arm's 50 limit with real
 * margin (SPEEDING_OVER_LIMIT must never be the reason a demo "works"), and
 * fast enough that the waiting car's post-pass pull-out can never catch up.
 */
const CRUISE_KMH = 46;

function shadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Главната улица. Напред е кръстовище, а страничната улица излиза на знак Б2 „Спри!“ — предимството е мое.",
      },
      { kind: "drive", points: APPROACH_SETTLE, targetKmh: CRUISE_KMH },
      { kind: "glance", mirror: "rear" },
      {
        kind: "annotation",
        textBg: "Отзад — залепена кола. Още една причина да не спирам без причина.",
      },
      { kind: "drive", points: [[-120, Y], [-70, Y]], targetKmh: CRUISE_KMH },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg:
          "Виждам чакащия отдясно на Б2. Гледам го, но не му отстъпвам — той е длъжен да ме пропусне.",
      },
      // The approach the objective gates: steady, no lift-off ripple. The
      // 4 km/h ease below is „покрий спирачката" made visible — a cover, not a
      // stop: SCRIPT_DECEL never reaches the harsh band, and the drop is far
      // too small to read as hesitation.
      { kind: "drive", points: [[-70, Y], [-34, Y]], targetKmh: CRUISE_KMH },
      {
        kind: "annotation",
        textBg: "Кракът минава над спирачката — готовност по чл. 20, без да натискам.",
      },
      { kind: "drive", points: [[-34, Y], [-12, Y]], targetKmh: CRUISE_KMH - 4 },
      { kind: "glance", mirror: "right" },
      // Through the box at the cover speed, then back to cruise: confident, not
      // fast. The waiting car commits (pulls out) the moment the player is 22 m
      // from the node — i.e. right about here — and needs > 5 s to reach this
      // lane. It arrives behind. That is the lesson, played out.
      { kind: "drive", points: [[-12, Y], [30, Y]], targetKmh: CRUISE_KMH - 4 },
      {
        kind: "annotation",
        textBg:
          "Минах равномерно. Чакащият потегля СЛЕД мен — точно както трябва, защото не му дадох повод да гадае.",
      },
      { kind: "drive", points: [[30, Y], [95, Y]], targetKmh: CRUISE_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предимството е право, но и задължение да го използваш: който с предимство пълзи и спира, спира и кръстовището.",
      },
    ],
  };
}

function mistakePhantomBrakeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Същото кръстовище, същият чакащ на Б2 — и водач, който не вярва на знака.",
      },
      { kind: "drive", points: APPROACH_SETTLE, targetKmh: CRUISE_KMH },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[-120, Y], [-70, Y]], targetKmh: CRUISE_KMH },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg: "„Идва отдясно!“ — макар че е спрял, а знакът е негов, не мой.",
      },
      // THE SLAM, and everything about it is placed, not improvised. It lands
      // ~50 m from the node because HARSH_BRAKING_NO_CAUSE refuses to fire with
      // a junction inside 35 m (harshBrakeJunctionClearM) — an honest FP armor
      // this demo must respect rather than dodge: panic braking at 50 m out for
      // a car that is not moving IS the real-world fault, and it is the arm's
      // open sightline that makes it possible to author it there at all.
      // maxDecelMps2 12 clears harshBrakeDecelMps2 (7) with the margin the
      // recorder's doc prescribes (the envelope tracks 0.7×); the onset speed is
      // 46 km/h, over harshBrakeMinSpeedKmh (35).
      {
        kind: "drive",
        points: [[-70, Y], [-50, Y]],
        targetKmh: CRUISE_KMH,
        maxDecelMps2: 12,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спрях на празен път, на предимство, с кола на метри зад мен — и чакащият сега не знае какво правя.",
      },
      { kind: "drive", points: [[-50, Y], [30, Y]], targetKmh: 35 },
      { kind: "drive", points: [[30, Y], [70, Y]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Рязкото спиране без причина е самостоятелно нарушение. Предимството се използва — предпазливостта е кракът над спирачката, не спирачката.",
      },
    ],
  };
}

function mistakeBlindPriorityScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Условията на ниво 5: този на страничната улица е изпълзял пред линията и не гледа към мен.",
      },
      { kind: "drive", points: APPROACH_SETTLE, targetKmh: CRUISE_KMH },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[-120, Y], [-70, Y]], targetKmh: CRUISE_KMH },
      {
        kind: "annotation",
        textBg: "„Предимството е мое“ — и кракът остава на газта.",
      },
      // Steady, no cover, straight into the box. The creeper commits at d = 56 m
      // (its lineDistM dial) and crawls the 16 m to this lane in ~5.5 s — the
      // same ~5.5 s this drive needs to cover the 56 m. They arrive together.
      //
      // NO authored `collision` step here, and that is the point: this demo is
      // the rare one whose consequence is EMERGENT. The creeper's own runner
      // trips its contact test (VEHICLE_CONTACT_M = 3.0 — measured closest
      // approach 0.3 m) and resolves detail "collision", so the COLLISION the
      // gate asserts is the production stack finding a crash, not the author
      // declaring one. It works because the staged playerGuard cannot rescue
      // this geometry: the guard only brakes for a player AHEAD of the actor
      // along its own heading (lateral < 3 m), and by the time the player is
      // beside it the creeper is already across the lane — `along` has gone
      // negative. Tuning the two dials (creeper lineDistM 34, cruise 4.2) is
      // what earns that; do not "fix" a drift here by pasting a collision step.
      { kind: "drive", points: [[-70, Y], [5, Y]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предимството беше негово. Чл. 20 обаче иска готовност да спреш при възникнала опасност — правото не спира чужда кола.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry — one deterministic function)
// ---------------------------------------------------------------------------

export type ScJxPriorityConfidenceTraceName =
  | "shadow-correct"
  | "mistake-phantom-brake"
  | "mistake-blind-priority";

interface JxPrioRecordingSpec {
  kind: "shadow" | "mistake";
  script: () => DriveScript;
  /** The staged set this drive records against (see STAGED_L5 below). */
  staged: () => StagedEventSpec[];
}

/** The template's own staged set — the base rungs (L1–L4). */
const STAGED_BASE = (): StagedEventSpec[] => [...(SC_JX_PRIORITY_CONFIDENCE.staged ?? [])];

/**
 * The L5 set: base + the creeper, exactly what compileScenario(spec, 5) builds
 * (`[...spec.staged, ...rung.stagedAdd]`). The blind-priority demo records
 * against it because the нахлуващ only EXISTS at L5 — a mistake demo has to be
 * a situation the student can actually meet, and staging the creeper into the
 * base rungs would rewrite the lesson the other three rungs teach.
 */
const STAGED_L5 = (): StagedEventSpec[] => [...STAGED_BASE(), SC_JX_PRIO_CREEPER];

export const SC_JX_PRIORITY_CONFIDENCE_RECORDINGS: Record<
  ScJxPriorityConfidenceTraceName,
  JxPrioRecordingSpec
> = {
  "shadow-correct": { kind: "shadow", script: shadowScript, staged: STAGED_BASE },
  "mistake-phantom-brake": {
    kind: "mistake",
    script: mistakePhantomBrakeScript,
    staged: STAGED_BASE,
  },
  "mistake-blind-priority": {
    kind: "mistake",
    script: mistakeBlindPriorityScript,
    staged: STAGED_L5,
  },
};

/** Trace names in committed order (shadow first). */
export function scJxPriorityConfidenceTraceNames(): ScJxPriorityConfidenceTraceName[] {
  return Object.keys(SC_JX_PRIORITY_CONFIDENCE_RECORDINGS) as ScJxPriorityConfidenceTraceName[];
}

/**
 * Record one wave-3 drive against ITS loaded district document. Deterministic:
 * same district → same trace (seed 7, the house recording seed).
 */
export function recordScJxPriorityConfidenceDrive(
  districtRaw: unknown,
  name: ScJxPriorityConfidenceTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const rec = SC_JX_PRIORITY_CONFIDENCE_RECORDINGS[name];
  if (!rec) throw new Error(`recordScJxPriorityConfidenceDrive: no drive "${name}"`);
  return recordScriptedDrive(districtRaw, rec.script(), {
    scenarioId: SC_JX_PRIORITY_CONFIDENCE_ID,
    kind: rec.kind,
    seed: 7,
    stagedEvents: rec.staged(),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
