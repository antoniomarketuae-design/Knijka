/**
 * sc-vu-blindspot-moto — the authored drives (doc 76 §5/§9): ONE correct
 * shadow demonstration + TWO mistake demos for „Мотор в мъртвата зона"
 * (ЗДвП чл. 25 + чл. 42) on the committed ln-v1 district, recorded with the
 * template's OWN staged filtering rider (rearTailgater sc-vubs-moto — single
 * truth, imported from the template). Ambient traffic ZERO (seed 7), dry day.
 *
 * The rearTailgater runner emits ZERO SimTick events by contract (doc 72
 * FO-07 pressure scenery), so everything the gate asserts comes from the
 * PLAYER's own channels — and the collision demo's contact is an AUTHORED beat
 * (DriveStep.collision — the scMergeAccelLane „вливане пред идваща кола"
 * precedent), not a physical overlap the runner could never produce.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: crawls the right lane at 32 → left glance spots the rider
 *     filtering the divider → HOLDS the lane while it squirts past → fresh
 *     glance + indicator + shoulder → clean crossing into the left lane.
 *     ZERO violations + SAFE_LANE_CHANGE;
 *   - „Престрояване само по огледало": a REAR-mirror glance only (never left),
 *     indicator ON, wheel over while the rider is alongside → EXACTLY
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION (never
 *     LANE_CHANGE_WITHOUT_INDICATOR — signalling without looking IS the demo);
 *   - „Престрояване без мигач пред моториста": left glances present (the rider
 *     was SEEN), no indicator ever armed → EXACTLY
 *     LANE_CHANGE_WITHOUT_INDICATOR, and no contact (the rider is scenery; the
 *     fault is the unannounced maneuver, so nothing else may grade).
 *
 * Geometry pinned to content/world/ln-v1.json: a 2+2 straight boulevard on
 * y ∈ [0, 400], RIGHT-lane center x = 12.19, LEFT-lane center x = 4.06 (lane
 * boundary x = 8.125; the rider filters at x = 7.59 — see templates-vru2's
 * VUB_X_FILTER for why not the boundary itself), spawn ln-spawn-start
 * (12.19, 15) heading north, limit 50 km/h. ONE edge, so no segment joint can
 * eat a lane delta (laneChangeJointGraceSec is inert here).
 *
 * Rule envelope the scripts respect (rules/engine.ts §3, cfg defaults): the
 * lane change grades when tick.laneId crosses the boundary at ≥ 10 km/h in a
 * forward gear. indicatorOk = a matching-direction indicator within
 * indicatorLookbackSec = 3 s; mirrorOk = a matching-direction glance within
 * mirrorLookbackSec = 5 s. The channel is DIRECTION-KEYED: a `rear` glance
 * never satisfies a left crossing — which is precisely what makes the
 * mirror-only demo honest (огледалото за обратно виждане не е проверка на
 * лявата мъртва зона).
 *
 * PACING LAWS the numbers obey (probed, not guessed — the figures below are
 * measured off the recordings, and the gate re-asserts each one):
 *  - THE WAIT IS REAL: the rider resolves its pass (40 m ahead) at t ≈ 21.6 s,
 *    and the shadow crosses the boundary at t ≈ 32.0 s — 10.4 s later, by
 *    which time the rider is ~100 m up the boulevard at ~58 km/h against the
 *    column's 32. So „изчаках го" is the recording, not the caption, and the
 *    merged player can never close on it (a 2 s gap at 32 km/h is ~18 m);
 *  - WHILE IT IS ALONGSIDE nothing can grade as following anyway: the rider's
 *    filtering line (x = 7.59) sits 4.60 m off the player's lane center and
 *    LEAD_CORRIDOR_M is 4.0 — it is structurally outside the lead corridor by
 *    0.60 m, so a rider drawing level can never read as a zero-gap lead. The
 *    vu-blindspot-districts battery asserts that margin against the real
 *    traffic system, because the whole demo rests on it;
 *  - THE COLLISION DEMO IS CHOREOGRAPHED, not asserted into existence: it
 *    crosses at t ≈ 18.5 s (y ≈ 161) — BEFORE the pass resolves at t ≈ 21.6 —
 *    so the rider really is glued alongside at the moment of the wheel-over,
 *    and the authored contact depicts what the geometry already says;
 *  - the column pace is 32 km/h against the posted 50: no speed code can fire;
 *  - the recorder SNAPS to a drive step's first point, so the crossing time is
 *    an authored quantity: (y_cross − 268) / 8.87 m/s. The decisive glance +
 *    indicator arm 1.97 s before it — inside the 3 s indicator window with
 *    ~1.0 s of slack and the 5 s mirror window with ~3.0 s.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_BLINDSPOT_MOTO } from "../lessons/scenario/templates-vru2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_BLINDSPOT_MOTO_ID = "sc-vu-blindspot-moto";

/** ln-v1 lane centers — the column's lane and the target lane. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;
/** The crawling column's pace, km/h (posted limit 50). */
const COLUMN_KMH = 32;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — look, SEE the rider, wait, then move
// ---------------------------------------------------------------------------

export function scVuBlindspotMotoShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Движението пълзи. Спокойно в дясната лента — съседната само изглежда по-бърза." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 80], [X_RIGHT, 140]], targetKmh: COLUMN_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Поглед в лявото огледало — и веднага през рамо, защото огледалото не покрива всичко." },
      // The rubric's observation pair: the glance that SPOTS the rider. This
      // one is the teaching beat, not the maneuver check — the crossing arms
      // its own fresh pair below.
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Ето го: мотор се промъква по разделителната линия — точно в мъртвата зона." },
      { kind: "drive", points: [[X_RIGHT, 140], [X_RIGHT, 200]], targetKmh: COLUMN_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Не се престрояваме пред него. Изчакваме го да отмине — той е по-бърз от колоната." },
      { kind: "drive", points: [[X_RIGHT, 200], [X_RIGHT, 260]], targetKmh: COLUMN_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Мотористът е далеч напред и лявата лента е чиста. Чак сега започва маневрата." },
      // The учебен ред, all inside the lookback windows before the crossing:
      // огледало (glance-left) → мигач (indicator-left) → рамо (a second
      // glance-left as the blind-spot check) → плавна маневра.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Ляв мигач, после бърз поглед през рамо — и чак тогава воланът." },
      { kind: "glance", mirror: "left" },
      {
        // Smooth diagonal into the LEFT lane — the laneId boundary (x = 8.125)
        // is crossed at y ≈ 285.5, which at the column's 8.87 m/s is 1.97 s
        // after the glance+indicator armed: inside the 3 s indicator window
        // with ~1.0 s of slack, and inside the 5 s mirror window with ~3.0 s.
        kind: "drive",
        points: [[X_RIGHT, 268], [9.6, 279], [6.0, 293], [X_LEFT, 312], [X_LEFT, 350]],
        targetKmh: COLUMN_KMH,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_LEFT, 350], [X_LEFT, 380]], targetKmh: COLUMN_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Огледало, мигач, рамо, маневра — и мотористът никога не беше изненада." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Престрояване само по огледало"
// (LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION)
// ---------------------------------------------------------------------------

export function scVuBlindspotMotoMistakeMirrorOnlyScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: поглед в огледалото за обратно виждане — „чисто е“ — и воланът тръгва." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 80], [X_RIGHT, 140]], targetKmh: COLUMN_KMH, stopAtEnd: false },
      // The driver DID signal (indicator is OK) and DID look in the rear-view
      // mirror — but the glance channel is direction-keyed, and no LEFT glance
      // is ever made: the left blind spot stays unchecked, which is exactly
      // the named fault. The rider is filtering the divider right now.
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Мигач — да. Но нито ляво огледало, нито поглед през рамо. А моторът е точно там." },
      {
        kind: "drive",
        points: [[X_RIGHT, 140], [10.0, 153], [6.0, 170], [X_LEFT, 190]],
        targetKmh: COLUMN_KMH,
        stopAtEnd: false,
      },
      // The authored consequence: the filtering rider is struck by the car
      // moving into the lane it occupies.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Огледалото за обратно виждане не показва мъртвата зона — а тя е с размера на цял мотоциклет. Рамото е половин секунда.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Престрояване без мигач пред моториста"
// (LANE_CHANGE_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scVuBlindspotMotoMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: водачът видя моториста — и въпреки това тръгна наляво без мигач." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 80], [X_RIGHT, 140]], targetKmh: COLUMN_KMH, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Огледа се, видя мотора, изчака го да отмине — дотук добре." },
      { kind: "drive", points: [[X_RIGHT, 140], [X_RIGHT, 200]], targetKmh: COLUMN_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_RIGHT, 200], [X_RIGHT, 260]], targetKmh: COLUMN_KMH, stopAtEnd: false },
      // The driver DID look (mirror is OK, twice, in the graded direction) —
      // the isolated fault is the missing indicator, so NO left signal is ever
      // armed anywhere in this drive.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "…но нито един мигач. „Щом го виждам, всичко е наред“ — не е." },
      {
        // The SAME diagonal as the shadow — the only delta is the missing
        // indicator, so the demo isolates one fault and nothing else.
        kind: "drive",
        points: [[X_RIGHT, 268], [9.6, 279], [6.0, 293], [X_LEFT, 312], [X_LEFT, 350]],
        targetKmh: COLUMN_KMH,
        stopAtEnd: false,
      },
      { kind: "drive", points: [[X_LEFT, 350], [X_LEFT, 380]], targetKmh: COLUMN_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Мигачът не е за теб — за другите е. Мотористът не може да прочете намерението ти, а изненадата е това, което го поваля.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuBlindspotMotoTraceName =
  | "shadow-correct"
  | "mistake-mirror-only"
  | "mistake-no-indicator";

const SCRIPTS: Record<
  ScVuBlindspotMotoTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVuBlindspotMotoShadowScript },
  "mistake-mirror-only": { kind: "mistake", script: scVuBlindspotMotoMistakeMirrorOnlyScript },
  "mistake-no-indicator": { kind: "mistake", script: scVuBlindspotMotoMistakeNoIndicatorScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged filtering rider armed (single truth), ambient traffic zero
 * (the harness law). Deterministic: same district → same trace.
 */
export function recordScVuBlindspotMotoDrive(
  districtRaw: unknown,
  name: ScVuBlindspotMotoTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_BLINDSPOT_MOTO_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_BLINDSPOT_MOTO.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
