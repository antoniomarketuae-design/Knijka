/**
 * sc-roundabout-entry — the authored drives (doc 76 §5/§9): ONE correct
 * shadow demonstration + TWO mistake demos for „Кръгово движение" on the
 * committed rb-mini-v1 district, recorded with the template's OWN staged
 * circulating car (roundaboutEntry sc-rb-circulating — single truth,
 * imported from the template). The trace gate replays exactly these through
 * the production stack:
 *   - shadow: ZERO violations + the YIELDED_TO_PRIORITY commendation
 *     (waited the circulator out) + the roundabout objective completes;
 *   - „Влизане без пропускане" grades EXACTLY FAILED_TO_YIELD (the runtime's
 *     roundabout tracker, on what the circulating car HAD TO DO: the demo
 *     rolls over the give-way line without stopping, right in front of it, and
 *     the car brakes — founder ruling 2026-10-05, see BARGE_* below. It carries
 *     a right indicator so its ONLY graded fault is the priority);
 *   - „Излизане без десен мигач" grades EXACTLY TURN_WITHOUT_INDICATOR (the
 *     runtime's turn detector at the north exit — the honest existing code for
 *     RB-02; the L3 roundabout OBJECTIVE additionally voids such a traversal,
 *     proven in the bot suite).
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW; arm right-lane centers x = ±4.06 / y = ±4.06; south
 * spawn (4.06, −93) heading north; ring limit 30, arms 40; the give-way bar of
 * the south mouth painted at y = −35.725.
 *
 * EVERY PATH HERE IS ONE THE PRODUCT CAR CAN DRIVE
 * (catalogue-demo-curvature:dae908c7). Until 2026-10-11 the three drives were
 * typed in as waypoints: the ring as 10° chords, the entry and the exit as
 * three or four corners. The recorder is kinematic — the ghost stands on the
 * authored point, headed along the chord — so each corner was a pivot on the
 * spot (23° at the mouth, 27° at the peel: 2.46 m of «radius» against a car
 * whose tightest circle is 3.955 m), and between the entry chord and the ring
 * step the ghost skipped 1.6 m of ring in one frame. The drives are now cut
 * from one continuous line each, built with ./ringDrive and ./ringMini (the
 * family's shared entry and exit): curvature only ever ramps, the tightest
 * radius the correct drive asks for is 9 m (the mistake's snap exit: 6.5 m),
 * and the drivability pins are in
 * traces/__tests__/ring-demos-drivable.test.ts.
 *
 * WHERE THE CORRECT DRIVE WAITS. With its nose 0.8 m short of the painted
 * give-way bar (centre y = −38.545) — where the product draws the student's own
 * «Карай до линията за пропускане» gate and where the lesson's first task is
 * cut («before the paint»). The old shadow rolled 11 m past the bar and waited
 * 3.6 m from the ring's edge under «Спри и я пропусни».
 *
 * WHAT THE RUNTIME READS OF THESE DRIVES:
 *  · FAILED_TO_YIELD (roundabout tracker) fires only when a circulating car
 *    has to BRAKE because of the entry, or is touched (founder ruling
 *    2026-10-05). The shadow enters behind the car it waited for, so nothing
 *    does; the barge rolls on ahead of it, slower than it, and it brakes.
 *  · COLLISION (rear-end): the driver circulates a little FASTER than the
 *    crawling car (12 km/h against its 2.9 m/s) and enters most of a quarter
 *    ring behind it — the gap narrows by under 6 m over the whole half ring,
 *    never to less than 25 m (pinned).
 *  · The turn detector calls a manoeuvre a turn at |Σ heading| > 55° over a
 *    sliding 3 s inside a junction area (the whole ring is one). The entry is
 *    44.5° of right turn, the ring ~32° per 3 s at 12 km/h: neither is a turn.
 *    The correct exit is 49.5° under a right indicator. The no-signal demo's
 *    snap exit (./ringMini miniSnapExit) is 64.8° in 2.4 s with the lever at
 *    rest — the graded fault, and nothing else.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_ROUNDABOUT_ENTRY } from "../lessons/scenario/templates-flow";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import { sideStepProgramme, type RingPath } from "./ringDrive";
import {
  MINI_BAR_STOP_Y,
  MINI_ENTRY,
  MINI_LANE_X,
  MINI_SNAP_LAND_OFFSET_M,
  miniExit,
  miniPathFromSpawn,
  miniSnapExit,
} from "./ringMini";

export const SC_ROUNDABOUT_ENTRY_ID = "sc-roundabout-entry";

/** Where the approach comes off the arm's pace (33 m into the 90 m arm). */
const Y_SLOW = -60;
/**
 * Where the right indicator goes on: φ = 112°, the first metre of ring past
 * the far kerb of the east mouth (the mouth's 16.25 m of carriageway spans
 * φ 68°–112° at the ring's outer edge). Earlier, and the lever would tell the
 * driver waiting on the east arm that this car is leaving by his road; the
 * wheel starts to come off the ring 5.7 m later (φ = 130°).
 */
const SIGNAL_PHI_DEG = 112;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

/** Spawn → the stop before the bar → the family entry → the ring → the family
 *  north exit → 52 m up the north arm. */
function buildShadowPath(): RingPath {
  return miniPathFromSpawn()
    .straightToY(Y_SLOW)
    .mark("slow")
    .straightToY(MINI_BAR_STOP_Y)
    .mark("line")
    .enterRing(MINI_ENTRY)
    .mark("ring")
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal")
    .exitRing(miniExit("north"))
    .mark("lane")
    .straightToY(52)
    .mark("end")
    .build();
}
let shadowPath: RingPath | null = null;
const SHADOW = (): RingPath => (shadowPath ??= buildShadowPath());

/**
 * The wait before the bar, s. The circulating car is met ~13 m short of the
 * mouth as the driver comes to rest (the runner's own staging) and crosses the
 * mouth 5.3 s later; at 9 s its tail is 30° of ring past the mouth — on the
 * driver's right, going away — and the driver moves off «в нейния интервал».
 * Measured on the live chain at every rung (the clean window is 7–26 s; before
 * it the car is still short of the mouth, after it the ring has come round).
 */
const SHADOW_WAIT_SEC = 10;

/** The dials a pin may sweep (absent = the authored drive). */
export interface RoundaboutEntryDials {
  /** Shadow / no-signal: the wait before the bar, s. */
  waitSec?: number;
  /** Barge: where the approach ends and the roll begins (district y). */
  bargeBrakeY?: number;
  /** Barge: the roll, км/ч. */
  bargeRollKmh?: number;
}

export function scRoundaboutEntryShadowScript(dials: RoundaboutEntryDials = {}): DriveScript {
  const p = SHADOW();
  return {
    steps: [
      { kind: "annotation", textBg: "Приближаваме кръговото — намали отрано и гледай наляво." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: p.between("start", "slow"), targetKmh: 30, stopAtEnd: false },
      {
        // Ease to a stop with the nose 0.8 m short of the give-way bar.
        kind: "drive",
        points: p.between("slow", "line", { stop: true }),
        targetKmh: 16,
      },
      { kind: "annotation", textBg: "Кола се движи в кръга — тя е с предимство. Спри и я пропусни." },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: dials.waitSec ?? SHADOW_WAIT_SEC, brake: true },
      { kind: "annotation", textBg: "Тя премина — влизаме плътно след нея, в нейния интервал." },
      { kind: "glance", mirror: "left" },
      {
        // The family entry: over the bar, a 10 m-radius right turn, a short
        // chord and onto the ring's centreline at φ = 55°.
        kind: "drive",
        points: p.between("line", "ring"),
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // Circulate at 12 km/h past the east mouth — the first exit, not ours.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Преди твоя изход: десен мигач — обяви, че напускаш кръга." },
      { kind: "indicator", setting: "right" },
      {
        // Ring to φ = 130°, the family exit onto the north arm's lane, and on.
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: 12,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: пропусна кръга, влезе в интервал и излезе с десен мигач." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Влизане без пропускане" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

/**
 * THE BARGE, RE-STAGED SO THAT IT REALLY CUTS THE CAR OFF (founder ruling
 * 2026-10-05, «bill forced braking»: „The lesson own "barge" demo gets
 * re-staged so it really cuts someone off").
 *
 * WHAT WAS WRONG WITH THE OLD ONE. It came through the mouth at 22 км/ч with
 * the staged car ~17 m behind its merge point, doing 2.9 m/s. A car going
 * twice the pace of the one behind it forces nothing: the crawler never had to
 * touch its brake, and the demo was «a priority fault» only because the grader
 * of the day convicted on where a car WAS. Judged by what happened — the
 * ruling — that drive is an entry nobody paid for, and it is no longer billed.
 *
 * WHAT A REAL ONE IS, on this ring. The circulator crawls at 2.9 m/s and its own
 * player guard (traffic/staged.ts step 2) starts braking for a body closer
 * than 9.6 m ahead of it. So a cut-off that does not depend on centimetres is
 * an entry AHEAD of the car by a driver who is then SLOWER than it: the car
 * closes on him for as long as he is in its way. That is also the commonest
 * real one — not a sprint through the mouth, but a driver who comes up fast,
 * dabs the brake, sees «enough room» and ROLLS over the give-way line without
 * stopping, in front of a car that is already there.
 *
 * THE LINE is the correct drive's own entry (./ringMini MINI_ENTRY) — the two
 * drives differ in the stop that is missing, not in where the wheels go.
 *
 * THE TWO NUMBERS, both centred in MEASURED bands (the live chain, every rung
 * L1–L5; re-measured 2026-10-11 on the drivable line — see BARGE_BANDS in
 * traces/__tests__/ring-demos-drivable.test.ts for the sweep):
 *
 *   BARGE_BRAKE_Y   where the 26 км/ч approach ends and the roll begins. It
 *                   has to be LATE: the runner syncs the car to the driver's
 *                   ETA until he is 14 m from the mouth, and a driver who
 *                   slows early lets it run past its station and sprint (a
 *                   different, unsteady choreography — measured, and avoided).
 *   BARGE_ROLL_KMH  the roll. Too slow and the car arrives first (the demo
 *                   becomes a collision); too fast and the driver gets away
 *                   ahead of it and nothing is forced.
 */
const BARGE_BRAKE_Y = -34;
const BARGE_ROLL_KMH = 7;
/** Where the barge demo freezes: on the early ring, 8° past the landing. */
const BARGE_FREEZE_PHI_DEG = 63;

function buildBargePath(brakeY: number): RingPath {
  return miniPathFromSpawn()
    .straightToY(brakeY)
    .mark("brake")
    .enterRing(MINI_ENTRY)
    .mark("ring")
    .ringTo(BARGE_FREEZE_PHI_DEG)
    .mark("end")
    .build();
}
let bargePath: RingPath | null = null;
const BARGE = (): RingPath => (bargePath ??= buildBargePath(BARGE_BRAKE_Y));

export function scRoundaboutEntryMistakeBargeScript(dials: RoundaboutEntryDials = {}): DriveScript {
  const p = dials.bargeBrakeY === undefined ? BARGE() : buildBargePath(dials.bargeBrakeY);
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: колата влиза в кръга, без да пропусне движещия се в него.",
      },
      { kind: "glance", mirror: "rear" },
      // The barger signals right (correct form — it takes the first exit),
      // so the ONLY graded fault is the refused priority.
      { kind: "indicator", setting: "right" },
      {
        // Up the arm at speed, and LATE on the brake (see BARGE_BRAKE_Y).
        kind: "drive",
        points: p.between("start", "brake"),
        targetKmh: 26,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колата в кръга приближава отляво… но нашата не спира." },
      {
        // The roll: over the give-way bar without stopping and onto the ring
        // right in front of the circulating car, slower than it — so the car
        // HAS to brake (the graded moment). The demo freezes on the early ring
        // right after it: driving on with the cut-off car on the bumper would
        // only stack unrelated noise on top of the ONE taught mistake.
        kind: "drive",
        points: p.between("brake", "end", { stop: true }),
        targetKmh: dials.bargeRollKmh ?? BARGE_ROLL_KMH,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Влизащият НЯМА предимство: на входа стои Б1/Б2 (Б3 не се поставя там — Наредба № РД-02-21-1/23.11.2023 за пътните знаци), значи пропускаш движещите се в кръга (ЗДвП чл. 50, ал. 1) — дори с цената на пълно спиране.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Излизане без десен мигач" (TURN_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

/** The correct drive to the ring, then: no indicator, the ring held 20° longer,
 *  the snap exit into the left half of the lane, and an easy drift back to the
 *  lane's centre (a 2.46 m side-step on 40 m radii). */
function buildNoSignalPath(): RingPath {
  return miniPathFromSpawn()
    .straightToY(Y_SLOW)
    .mark("slow")
    .straightToY(MINI_BAR_STOP_Y)
    .mark("line")
    .enterRing(MINI_ENTRY)
    .mark("ring")
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal")
    .exitRing(miniSnapExit("north"))
    .mark("out")
    .programme(sideStepProgramme(MINI_LANE_X - MINI_SNAP_LAND_OFFSET_M, 40, 4))
    .mark("lane")
    .straightToY(54)
    .mark("end")
    .build();
}
let noSignalPath: RingPath | null = null;
const NO_SIGNAL = (): RingPath => (noSignalPath ??= buildNoSignalPath());

export function scRoundaboutEntryMistakeNoSignalScript(dials: RoundaboutEntryDials = {}): DriveScript {
  const p = NO_SIGNAL();
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Този път входът е правилен — гледай какво се обърква на изхода.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: p.between("start", "slow"), targetKmh: 30, stopAtEnd: false },
      { kind: "drive", points: p.between("slow", "line", { stop: true }), targetKmh: 16 },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: dials.waitSec ?? SHADOW_WAIT_SEC, brake: true },
      { kind: "glance", mirror: "left" },
      {
        // The SAME entry as the shadow, taken after the same wait (the entry is
        // not the fault here)…
        kind: "drive",
        points: p.between("line", "ring"),
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // …and the SAME 12 km/h circulation, so the only difference from the
        // shadow is what happens at the exit.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Изходът идва — но мигач няма, и завоят е рязък…" },
      {
        // The SNAP exit (./ringMini miniSnapExit): the ring held to φ = 150°,
        // then 64.8° of right turn on a 6.5 m radius in 2.4 s with NO indicator
        // — TURN_WITHOUT_INDICATOR, and nothing else (the circulator is most of
        // a quarter ring ahead).
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: 14,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Никой около кръга не разбра, че колата излиза. Изходът е маневра — обявява се с десен мигач ПРЕДИ него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRoundaboutEntryTraceName =
  | "shadow-correct"
  | "mistake-barge-entry"
  | "mistake-exit-no-signal";

const SCRIPTS: Record<ScRoundaboutEntryTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scRoundaboutEntryShadowScript },
  "mistake-barge-entry": { kind: "mistake", script: scRoundaboutEntryMistakeBargeScript },
  "mistake-exit-no-signal": { kind: "mistake", script: scRoundaboutEntryMistakeNoSignalScript },
};

/**
 * CLIP staging for this template (doc 66 R1 — produced-media honesty): NONE —
 * the clip re-enacts the compiled DRILL rig, like every demo that registers no
 * override.
 *
 * HISTORY, and why the override is gone rather than re-tuned. Until 2026-10-05
 * the barge clip (m0) swapped the circulator's `conflictLeadM` 14 → −30 «for the
 * clip only»: a sprint to the mouth that put the car ahead-left of the barging
 * ego, inside the chase camera's cone. It was needed because the old barge was
 * graded against a car 14 m upstream that it then outran — the viewer never
 * saw WHICH car had been «cut off», because no car had been.
 *
 * The demo is re-staged (founder ruling 2026-10-05 — see BARGE_BRAKE_Y): the
 * ego now rolls onto the ring ahead of the car and the car HAS TO BRAKE behind
 * it, on the drill's own staging. Under the old override that would be a false
 * clip: the sprinting car reaches the mouth first, and the picture is an ego
 * entering BEHIND the car it is captioned as having cut off. So the clip world
 * is the graded world again (clips/capture/captureFeedParity.test.ts replays it
 * and finds the conviction on the plan's fault time).
 *
 * WHAT THAT LEAVES FOR THE CLIP LANE: at the fault the cut-off car is 6–9 m
 * behind-left of the ego — outside a forward chase frame (the parity test's
 * checklist says so). The clip needs re-capturing and an R0 look, most likely
 * on the rear-aware camera the tailgater clips use. Not media this lane makes.
 */
export function scRoundaboutEntryClipStaged(): StagedEventSpec[] | null {
  return null;
}

/**
 * Record one of the three drives against a loaded rb-mini-v1 document — the
 * TEMPLATE's staged circulating car armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScRoundaboutEntryDrive(
  districtRaw: unknown,
  name: ScRoundaboutEntryTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_ROUNDABOUT_ENTRY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_ROUNDABOUT_ENTRY.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
