/**
 * sc-rb-exit-signal — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Изход от кръгово с десен мигач“ on
 * the committed rb-mini-v1 district, recorded with the template's OWN staged
 * circulating car (roundaboutEntry sc-rbx-circulating — single truth, imported
 * from the template). The trace gate replays exactly these through the
 * production stack:
 *   - shadow: ZERO violations + the YIELDED_TO_PRIORITY commendation (waited
 *     the circulator out) + the roundabout objective completes at the THIRD
 *     (west) exit under a right indicator;
 *   - „Изход без мигач“ grades EXACTLY TURN_WITHOUT_INDICATOR (the runtime's
 *     turn detector on the west exit joint — the honest existing code for
 *     RB-02; the L3 roundabout OBJECTIVE additionally voids such a traversal,
 *     proven in the bot suite);
 *   - „Нахлуване в кръга пред циркулираща кола“ grades EXACTLY FAILED_TO_YIELD
 *     (the runtime's circulatingConflict tracker — the barge carries a right
 *     indicator so its ONLY graded fault is the priority).
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW (s → e → n → w); arm right-lane centers ±4.06; south
 * spawn (4.06, −93) heading north; ring limit 30, arms 40. The THIRD exit is
 * west: the outbound west lane center is y = +4.06 (facing west, north is on
 * your right), and the exit peels off the ring arc at φ ≈ 240° — the exact
 * 90°-rotated mirror of sc-roundabout-entry's north exit at φ ≈ 150°.
 *
 * Three runtime windows must ALL stay closed for the shadow:
 *  · FAILED_TO_YIELD (roundabout tracker): fires if a circulating car is on
 *    the driver's LEFT while the driver is still entering (inward, moving,
 *    azimuth-swept < RB_ON_RING_DEG = 35°). Closed by a BRISK flat-chord entry
 *    (17 km/h, a nearly-straight NE line) taken only after a 9 s wait, so ring
 *    priority is held while the car is still on the driver's RIGHT.
 *  · COLLISION (rear-end): this drill rides ~190° of ring (south mouth → west
 *    exit), nearly twice sc-roundabout-entry's arc, and the entry envelope
 *    forces a CRAWLING circulator (2.9 m/s — see the template's dial note).
 *    Closed by MATCHING its pace: the driver circulates 10.5 km/h (2.92 m/s),
 *    so the gap won at entry holds to the exit instead of closing metre by
 *    metre the way sc-roundabout-entry's brisker 12 km/h could afford over its
 *    short arc.
 *  · TURN_WITHOUT_INDICATOR (turn detector: |Σ heading deltas| > 55° over a
 *    sliding 3 s window inside a junction area — the whole ring qualifies).
 *    Circulation at 10.5 km/h on R = 18 is ~9.3°/s (window ≈ 28° — never
 *    fires); the flat-chord entry's total heading change is ~40°; and the
 *    signalled exit fires the detector WITH the indicator live (the engine
 *    stamps lastIndicatorOnAt every tick the lever is on, so the 3 s lookback
 *    is trivially satisfied).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_EXIT_SIGNAL } from "../lessons/scenario/templates-roundabout";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_RB_EXIT_SIGNAL_ID = "sc-rb-exit-signal";

/** South-arm northbound lane center (2-lane arm, drawn lane 8.125 m). */
const X_LANE = 4.06;
/** Ring centerline radius (rb-mini-v1 meta.scenario). */
const R = 18;

/** Ring point at circulation angle φ (degrees from the SOUTH node, CCW through
 * EAST — φ 90 = east, 180 = north, 270 = west): (R sin φ, −R cos φ). */
function ring(phiDeg: number): [number, number] {
  const a = (phiDeg * Math.PI) / 180;
  return [R * Math.sin(a), -R * Math.cos(a)];
}

/** Sampled ring run φ0 → φ1 (CCW, 10° steps). */
function ringRun(phi0: number, phi1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let p = phi0; p <= phi1; p += 10) out.push(ring(p));
  return out;
}

/** The shared yield-and-enter opening: approach, wait the circulator past the
 *  mouth, then take the brisk flat-chord entry that wins ring priority. Every
 *  drive whose fault is NOT the entry reuses it verbatim. */
function cleanEntrySteps(): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60]], targetKmh: 30, stopAtEnd: false },
    {
      // Ease to a stop at the yield line (just inside the decision zone —
      // ring 18 + entry margin 12 = 30 m from the centre).
      kind: "drive",
      points: [[X_LANE, -60], [X_LANE, -40], [X_LANE, -27.5]],
      targetKmh: 16,
    },
    { kind: "annotation", textBg: "Кола се движи в кръга — тя е с предимство. Спри на линията и я пропусни." },
    { kind: "glance", mirror: "left" },
    // Wait the circulator fully PAST the mouth and onto the east arc (to the
    // driver's RIGHT) before committing — the yield the commendation reads.
    { kind: "pause", sec: 9.0, brake: true },
    { kind: "annotation", textBg: "Тя премина — влизаме плътно след нея, в нейния интервал." },
    { kind: "glance", mirror: "left" },
    {
      // FLAT-CHORD entry: a nearly-straight NE line from the mouth to ring(55)
      // rather than a tight ring-hugging arc. It sweeps the azimuth-from-centre
      // past RB_ON_RING_DEG (35°) — the tracker's ring-priority stand-down —
      // with only ~40° of TOTAL heading change (under the 55° turn window), so
      // it is both quick to priority AND indicator-free-clean.
      kind: "drive",
      points: [
        [X_LANE, -27.5],
        [6.0, -23.0],
        [8.5, -18.5],
        [11.0, -15.0],
        ring(48),
        ring(55),
      ],
      targetKmh: 17,
      stopAtEnd: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scRbExitSignalShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Целта днес е ИЗХОДЪТ: третият, на запад. Първо влизаме чисто." },
      ...cleanEntrySteps(),
      {
        // Circulate the east arc past the FIRST exit (east, φ = 90) and on past
        // the SECOND (north, φ = 180) at a MATCHED pace (10.5 km/h ≈ the
        // circulator's 2.9 m/s), holding the gap won at entry. No indicator: a
        // right lever here would tell the drivers waiting at the east and north
        // mouths that this car is leaving — and one of them would pull out into
        // it. That is the RB-06 half of the lesson.
        kind: "drive",
        points: ringRun(60, 190),
        targetKmh: 10.5,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Северният подход е зад нас — това беше последният преди нашия. СЕГА десен мигач.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ring to φ = 240° (the west peel-off point — the 90°-rotated mirror of
        // sc-roundabout-entry's φ = 150° north peel), then the gentle
        // indicator-announced blend onto the west arm's outbound lane
        // (y = +4.06). The step opens at φ = 200, one ringRun stride past the
        // previous step's φ = 190 end, so the path stays C¹-smooth and no
        // spurious turnStarted fires at the joint.
        kind: "drive",
        points: [...ringRun(200, 240), [-20.5, 6.4], [-25, 4.9], [-30, 4.06], [-40, 4.06], [-52, 4.06]],
        targetKmh: 10.5,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Готово: два подхода мълчаливо, мигач след последния, изход — и мигачът веднага изгасва.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изход без мигач“ (TURN_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scRbExitSignalMistakeNoSignalScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Входът и обиколката са същите — гледай какво липсва на изхода." },
      ...cleanEntrySteps(),
      {
        // The SAME matched-pace circulation as the shadow, so the driver never
        // catches the car and the entry keeps its earned priority — the only
        // difference from the shadow is what happens at the exit. It runs one
        // stride LONGER than the shadow's (to φ = 210) purely so the snap step
        // below can open on a ringRun stride: a jump between non-adjacent ring
        // angles is a kinked joint the turn detector fires on, which would
        // double-count the taught fault.
        kind: "drive",
        points: ringRun(60, 210),
        targetKmh: 10.5,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Изходът идва — но лостът стои в нула, и завоят е рязък…" },
      {
        // The SNAP exit: unlike the shadow's wide, indicator-announced blend, a
        // TIGHT ~70° right sweep off φ ≈ 245° onto the west arm (small radius →
        // the turn detector's 3 s window clears 55°) with NO indicator —
        // TURN_WITHOUT_INDICATOR, and nothing else (the circulator is a full
        // arc away, on the far/SE side). The 90°-rotated mirror of
        // sc-roundabout-entry's proven snap.
        kind: "drive",
        points: [ring(220), ring(235), ring(245), [-19.5, 5.0], [-23, 4.06], [-28, 4.06], [-40, 4.06], [-54, 4.06]],
        targetKmh: 14,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Чакащите на западния вход видяха само кола, която обикаля — и останаха на място. Изходът е маневра: обявява се с десен мигач ПРЕДИ него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Нахлуване в кръга пред циркулираща кола“ (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scRbExitSignalMistakeBargeScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Тук до изхода изобщо не се стига — грешката е още на входа.",
      },
      { kind: "glance", mirror: "rear" },
      // The barger signals right (correct form for its intended exit), so the
      // ONLY graded fault is the refused priority.
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LANE, -93], [X_LANE, -60], [X_LANE, -40]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата в кръга приближава отляво… но нашата не спира." },
      {
        // Straight through the mouth at speed, cutting the circulator off — the
        // demo freezes on the early ring right after the graded moment (driving
        // on with the cut-off car on the bumper would only stack unrelated
        // noise on top of the ONE taught mistake).
        kind: "drive",
        points: [
          [X_LANE, -40],
          [X_LANE, -26],
          [5.4, -21.5],
          [7.4, -18.3],
          ...ringRun(30, 60),
        ],
        targetKmh: 22,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Влизащият НЯМА предимство: чл. 50а изисква да пропуснеш вече движещите се в кръга. „Пропусни“ не значи „чакай празен кръг“ — значи „не карай никого в кръга да намалява“.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRbExitSignalTraceName =
  | "shadow-correct"
  | "mistake-exit-no-signal"
  | "mistake-barge-entry";

const SCRIPTS: Record<ScRbExitSignalTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scRbExitSignalShadowScript },
  "mistake-exit-no-signal": { kind: "mistake", script: scRbExitSignalMistakeNoSignalScript },
  "mistake-barge-entry": { kind: "mistake", script: scRbExitSignalMistakeBargeScript },
};

/**
 * Record one of the three drives against a loaded rb-mini-v1 document — the
 * TEMPLATE's staged circulating car armed (single truth), ambient traffic zero
 * (the harness law). Deterministic: same district → same trace.
 */
export function recordScRbExitSignalDrive(
  districtRaw: unknown,
  name: ScRbExitSignalTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RB_EXIT_SIGNAL_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RB_EXIT_SIGNAL.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
