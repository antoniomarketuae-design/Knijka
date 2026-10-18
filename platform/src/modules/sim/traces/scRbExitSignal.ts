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
 *     turn detector on the west exit — the honest existing code for RB-02; the
 *     L3 roundabout OBJECTIVE additionally voids such a traversal, proven in
 *     the bot suite);
 *   - „Нахлуване в кръга пред циркулираща кола“ grades EXACTLY FAILED_TO_YIELD
 *     (the runtime's roundabout tracker, on what the circulating car HAD TO DO:
 *     the demo rolls over the give-way line without stopping, right in front
 *     of it, and the car brakes — founder ruling 2026-10-05, see BARGE_* below.
 *     It carries a right indicator so its ONLY graded fault is the priority).
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW (s → e → n → w); arm right-lane centers ±4.06; south
 * spawn (4.06, −93) heading north; ring limit 30, arms 40; the give-way bar of
 * the south mouth painted at y = −35.725. The THIRD exit is west: the outbound
 * west lane center is y = +4.06 (facing west, north is on your right).
 *
 * EVERY PATH HERE IS ONE THE PRODUCT CAR CAN DRIVE
 * (catalogue-demo-curvature:dae908c7). Until 2026-10-11 the drives were typed
 * in as waypoints — the ring as 10° chords, the entry and the exit as three or
 * four corners, each a pivot on the spot (23° at the mouth, 27° at the peel:
 * 2.16 m of «radius» against a car whose tightest circle is 3.955 m) — and
 * where two ring steps met «one stride apart» the ghost skipped 3.2 m of ring
 * in a frame. They are now cut from one continuous line each, built with
 * ./ringDrive and ./ringMini (the family's shared entry and exit, here turned
 * to the west arm): the tightest radius the correct drive asks for is 9 m, the
 * snap exit of the no-signal demo 6.5 m. Pins:
 * traces/__tests__/ring-demos-drivable.test.ts.
 *
 * WHERE THE CORRECT DRIVE WAITS: with its nose 0.8 m short of the painted
 * give-way bar (centre y = −38.545), which is what its caption says — «Спри на
 * линията и я пропусни». The old shadow rolled 11 m past the bar first.
 *
 * WHAT THE RUNTIME READS OF THESE DRIVES:
 *  · FAILED_TO_YIELD (roundabout tracker) fires only when a circulating car
 *    has to BRAKE because of the entry, or is touched (founder ruling
 *    2026-10-05). The shadow enters behind the car it waited for.
 *  · COLLISION (rear-end): this drill rides ~215° of ring (south mouth → west
 *    exit) behind a car that crawls at 2.9 m/s. The driver MATCHES it —
 *    10.5 km/h is 2.92 m/s — so the gap won at the entry holds to the exit.
 *  · TURN_WITHOUT_INDICATOR (turn detector: |Σ heading| > 55° over a sliding
 *    3 s inside a junction area — the whole ring qualifies). Circulation at
 *    10.5 km/h on R = 18 is 9.3°/s (28° a window — never fires); the entry is
 *    44.5° of right turn; the correct exit is 49.5° under a live indicator;
 *    the no-signal demo's snap exit (./ringMini miniSnapExit) is 64.8° in
 *    2.4 s with the lever at rest — the graded fault, and nothing else.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_EXIT_SIGNAL } from "../lessons/scenario/templates-roundabout";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import { sideStepProgramme, type RingPath, type RingPathBuilder } from "./ringDrive";
import {
  MINI_BAR_STOP_Y,
  MINI_ENTRY,
  MINI_LANE_X,
  MINI_SNAP_LAND_OFFSET_M,
  miniExit,
  miniPathFromSpawn,
  miniSnapExit,
} from "./ringMini";

export const SC_RB_EXIT_SIGNAL_ID = "sc-rb-exit-signal";

/** Where the approach comes off the arm's pace. */
const Y_SLOW = -60;
/** The ring pace: the staged car's own 2.9 m/s (see the header). */
const RING_KMH = 10.5;
/**
 * Where the right indicator goes on: φ = 202°, the first metre of ring past
 * the far kerb of the NORTH mouth (its 16.25 m of carriageway spans φ 158°–202°
 * at the ring's outer edge) — «Северният подход е зад нас». Earlier, and the
 * lever tells the drivers waiting on the east and north arms that this car is
 * leaving by their road (the RB-06 half of the lesson). The wheel starts to
 * come off the ring 5.7 m later (φ = 220°).
 */
const SIGNAL_PHI_DEG = 202;

/** The wait before the bar, s — see sc-roundabout-entry (same ring, same car,
 *  same staging; the clean window is re-measured for THIS lesson's rungs in
 *  the drivability pins, L5's second circulator included). */
const SHADOW_WAIT_SEC = 10;

/** The dials a pin may sweep (absent = the authored drive). */
export interface RbExitSignalDials {
  waitSec?: number;
  ringKmh?: number;
  bargeBrakeY?: number;
  bargeRollKmh?: number;
}

/** Spawn → the stop before the bar → the family entry → the ring to the
 *  signal point: the half of the drive the shadow and the no-signal demo share. */
function toSignalPoint(): RingPathBuilder {
  return miniPathFromSpawn()
    .straightToY(Y_SLOW)
    .mark("slow")
    .straightToY(MINI_BAR_STOP_Y)
    .mark("line")
    .enterRing(MINI_ENTRY)
    .mark("ring")
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal");
}

function buildShadowPath(): RingPath {
  return toSignalPoint().exitRing(miniExit("west")).mark("lane").straightToX(-52).mark("end").build();
}
let shadowPath: RingPath | null = null;
const SHADOW = (): RingPath => (shadowPath ??= buildShadowPath());

/** The shared yield-and-enter opening: approach, stop before the bar, wait the
 *  circulator past the mouth, then the family entry. Every drive whose fault
 *  is NOT the entry reuses it verbatim. */
function cleanEntrySteps(p: RingPath, waitSec: number): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: p.between("start", "slow"), targetKmh: 30, stopAtEnd: false },
    {
      // Ease to a stop with the nose 0.8 m short of the give-way bar.
      kind: "drive",
      points: p.between("slow", "line", { stop: true }),
      targetKmh: 16,
    },
    { kind: "annotation", textBg: "Кола се движи в кръга — тя е с предимство. Спри на линията и я пропусни." },
    { kind: "glance", mirror: "left" },
    // Wait the circulator fully PAST the mouth and onto the east arc (to the
    // driver's RIGHT) before committing — the yield the commendation reads.
    { kind: "pause", sec: waitSec, brake: true },
    { kind: "annotation", textBg: "Тя премина — влизаме плътно след нея, в нейния интервал." },
    { kind: "glance", mirror: "left" },
    {
      // The family entry: a 10 m-radius right turn, a short chord and onto the
      // ring's centreline at φ = 55°.
      kind: "drive",
      points: p.between("line", "ring"),
      targetKmh: 17,
      stopAtEnd: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scRbExitSignalShadowScript(dials: RbExitSignalDials = {}): DriveScript {
  const p = SHADOW();
  const ringKmh = dials.ringKmh ?? RING_KMH;
  return {
    steps: [
      { kind: "annotation", textBg: "Целта днес е ИЗХОДЪТ: третият, на запад. Първо влизаме чисто." },
      ...cleanEntrySteps(p, dials.waitSec ?? SHADOW_WAIT_SEC),
      {
        // Circulate past the FIRST exit (east, φ = 90) and on past the SECOND
        // (north, φ = 180) at the car's own pace, holding the gap won at entry.
        // No indicator: a right lever here would tell the drivers waiting at
        // the east and north mouths that this car is leaving — and one of them
        // would pull out into it. That is the RB-06 half of the lesson.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Северният подход е зад нас — това беше последният преди нашия. СЕГА десен мигач.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ring to φ = 220°, the family exit onto the west arm's outbound lane
        // (y = +4.06), and on to the finish.
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: ringKmh,
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

/** The shadow's drive to the signal point, then: no indicator, the ring held
 *  20° longer, the snap exit into the left half of the west lane, and an easy
 *  drift back to the lane's centre (a 2.46 m side-step on 40 m radii). */
function buildNoSignalPath(): RingPath {
  return toSignalPoint()
    .exitRing(miniSnapExit("west"))
    .mark("out")
    .programme(sideStepProgramme(MINI_LANE_X - MINI_SNAP_LAND_OFFSET_M, 40, 4))
    .mark("lane")
    .straightToX(-54)
    .mark("end")
    .build();
}
let noSignalPath: RingPath | null = null;
const NO_SIGNAL = (): RingPath => (noSignalPath ??= buildNoSignalPath());

export function scRbExitSignalMistakeNoSignalScript(dials: RbExitSignalDials = {}): DriveScript {
  const p = NO_SIGNAL();
  return {
    steps: [
      { kind: "annotation", textBg: "Входът и обиколката са същите — гледай какво липсва на изхода." },
      ...cleanEntrySteps(p, dials.waitSec ?? SHADOW_WAIT_SEC),
      {
        // The SAME matched-pace circulation as the shadow, so the driver never
        // catches the car and the entry keeps its earned priority — the only
        // difference from the shadow is what happens at the exit.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: dials.ringKmh ?? RING_KMH,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Изходът идва — но лостът стои в нула, и завоят е рязък…" },
      {
        // The SNAP exit (./ringMini miniSnapExit): the ring held to φ = 240°,
        // then 64.8° of right turn on a 6.5 m radius in 2.4 s with NO indicator
        // — TURN_WITHOUT_INDICATOR, and nothing else (the circulator is a
        // quarter ring away).
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
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
 * L1–L5 — L5's second circulator included; re-measured 2026-10-11 on the
 * drivable line, and pinned in traces/__tests__/ring-demos-drivable.test.ts):
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

export function scRbExitSignalMistakeBargeScript(dials: RbExitSignalDials = {}): DriveScript {
  const p = dials.bargeBrakeY === undefined ? BARGE() : buildBargePath(dials.bargeBrakeY);
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
          "Влизащият НЯМА предимство: на входа стои Б1/Б2 (Наредба № РД-02-21-1/23.11.2023 за пътните знаци), значи пропускаш вече движещите се в кръга (ЗДвП чл. 50, ал. 1). „Пропусни“ не значи „чакай празен кръг“ — значи „не карай никого в кръга да намалява“.",
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
