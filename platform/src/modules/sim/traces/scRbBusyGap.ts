/**
 * sc-rb-busy-gap — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Пролука в натоварено кръгово“ on the
 * committed rb-mini-v1 district, recorded with the template's OWN staged pair
 * (two roundaboutEntry cars, sc-rbg-lead + sc-rbg-follower — single truth,
 * imported from the template). The trace gate replays exactly these through the
 * production stack:
 *   - shadow: ZERO violations + the YIELDED_TO_PRIORITY commendation — the pair
 *     is waited out at the line and the ring is taken in the gap BEHIND it;
 *   - „Нахлуване пред циркулиращата кола“ grades EXACTLY FAILED_TO_YIELD;
 *   - „Влизане в твърде къса пролука“ grades EXACTLY FAILED_TO_YIELD +
 *     COLLISION.
 *
 * Geometry pinned to content/world/rb-mini-v1.json: ring centerline R = 18
 * around (0, 0), CCW (s → e → n → w); arm right-lane centers ±4.06; south spawn
 * (4.06, −93) heading north; ring limit 30, arms 40. This drill takes the SECOND
 * (north) exit, peeling off the ring arc at φ ≈ 150°.
 *
 * READ THIS FIRST (2026-10-05). The first envelope below — «THE LEFT
 * HALF-PLANE IS THE WHOLE GAME» — and every later sentence that speaks of the
 * 0.9 s sustain or of a car «in the driver's left band» convicting describe
 * the grader these drives were AUTHORED AGAINST: one that billed an entry on
 * where a circulating car was. It is gone. Founder ruling 2026-10-05, «bill
 * forced braking»: an entry is FAILED_TO_YIELD when a circulating car has to
 * BRAKE because of it (the car's own account, runtime/worldRuntime.ts §4c) or
 * is touched — and for no other reason. The drives did not have to move for
 * that, except two: the barge, which under the old grader was billed for a car
 * it outran, is re-staged (BARGE_KMH); and the short gap, which drove into the
 * side of a car that was already going by, is re-staged to take the gap in
 * FRONT of the follower (SHORT_GAP_WAIT_SEC — round 4 of the ruling: yielding
 * is about the mouth he enters by and the cars that had not yet passed it).
 * What each drive is billed on now:
 *
 *   shadow      nothing — no car on the ring loses any speed because of it
 *               (the trace gate measures that against a world without him);
 *   barge       the LEAD has to brake, 0.4 s after his nose is on the ring;
 *   short gap   the FOLLOWER has to brake, at t = 20.87 — its tail still
 *               1.4 m short of his mouth — and the two bodies meet on the next
 *               frame (20.88): FAILED_TO_YIELD, then COLLISION. Its guard
 *               looks down its own lane and he comes at it from the side, so
 *               it brakes late and hard: 2.90 m/s to a stop.
 *
 * The paragraphs are kept because the geometry in them is still true and the
 * phasing arithmetic still explains where every car is.
 *
 * FOUR ENVELOPES DECIDED EVERY NUMBER BELOW — all four measured, not guessed:
 *
 *  · THE LEFT HALF-PLANE WAS THE WHOLE GAME. FAILED_TO_YIELD (the runtime's
 *    roundabout tracker) fires when a MOVING car sits in the ring band AND in
 *    the driver's left half-plane (circulatingConflictFor: left · (car − player)
 *    ≥ 1.5) for YIELD_CONVICT_SUSTAIN_SEC = 0.9 s, while the driver is inward
 *    (≥ 0.3), moving (> 3 km/h) and not yet swept RB_ON_RING_DEG = 35° of
 *    azimuth. It is a HALF-PLANE, not a cone: at the mouth (heading 0) it is
 *    every ring point with x < 2.56 — over half the ring — and it ROTATES with
 *    the entry chord, so as the driver turns NE the north-east arc swings into
 *    it too. Only the SE/E arc is ever safe, and only briefly. Everything below
 *    is arithmetic on that one fact.
 *
 *  · THE CAR PACE IS PINNED AT 2.9 m/s, inherited from sc-roundabout-entry and
 *    re-proved here. Faster circulators sweep into the rotating left band
 *    mid-chord and convict an otherwise clean entry (measured on this district
 *    at 3.35 m/s). It is not a style choice, and it is also the exchange rate
 *    between the platoon's degrees and its seconds: 2.9 m/s on the 112.8 m lap
 *    is 9.27 °/s, a 39 s cycle, so the authored 26° offset is the 2.8 s gap the
 *    drill teaches you to refuse.
 *
 *  · THE RING PACE IS SET BY THE CAR AHEAD, not by the turn detector. This is the
 *    one dial that differs from the sibling ring drills (12 km/h) — see RING_KMH
 *    below for the measured °/s arithmetic. The detector's ceiling is real but
 *    slack here: it fires at |Σ heading deltas| > 55° over a sliding 3 s window
 *    inside a junction area, and the whole ring is junction area (the four mouths
 *    are intersection nodes ≤ 13.8 m from every ring point), which puts the wall
 *    at 20.7 km/h — twice this drill's pace.
 *
 *  · THE ENTRY IS A FLAT CHORD, not a ring-hugging arc: a nearly-straight NE
 *    line from the mouth to ~ring(48) sweeps the azimuth past the 35° stand-down
 *    in ~3 s with only ~40° of TOTAL heading change (under the 55° turn window),
 *    so it is both quick to ring priority AND indicator-free-clean.
 *
 * WHERE THE „4 s GAP" OF THE BACKLOG WENT (the honest note). The brief's
 * shadowPlan reads „crawls to the yield line, lets two ring cars pass, takes the
 * 4-second gap between them". Those two clauses cannot both be true — after two
 * cars have passed, the gap you take is by definition the one BEHIND them — and
 * the engine settles which half survives. The gap between the platoon's cars is
 * the TRAP, not the line: a car entering it is still mid-chord — inward, under
 * the azimuth stand-down, with the follower square in its rotating left band —
 * when the 0.9 s sustain expires, so it convicts and then it gets hit (measured;
 * that IS mistake demo 2). So the shadow does what the first clause says — waits
 * the platoon out and takes the gap behind it — and the „4-second gap between
 * them" is authored as the tempting wrong answer, at the 2.8 s the geometry
 * actually allows. The lesson the backlog was reaching for („пролуката се мери в
 * секунди, не в метри") survives whole, and the drill gains a sharper second
 * mistake — a driver who DID stop and DID yield once, and still got it wrong —
 * instead of a shadow that cannot exist.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_BUSY_GAP } from "../lessons/scenario/templates-roundabout";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import type { RingPath, RingPathBuilder } from "./ringDrive";
import { MINI_ENTRY, MINI_ENTRY_FROM_MOUTH, miniExit, miniPathFromSpawn } from "./ringMini";

export const SC_RB_BUSY_GAP_ID = "sc-rb-busy-gap";

/** Where the approach comes off the arm's pace. */
const Y_SLOW = -60;
/**
 * Where this drill's car waits: centre y = −27.5, inside the mouth. NOT before
 * the painted give-way bar (y = −35.725), where the family's other drills now
 * wait — because this lesson grades its halt in a 3 m disc at (4.06, −26),
 * capped at 6 km/h («Спри на линията за пропускане преди входа»,
 * sc-rbg-yield-line), and a car that stops before the paint is 9.7 m outside
 * that disc and can never collect it. The demo stops where the lesson's own
 * task says «the line» is; the 9.7 m between that task and the paint is the
 * lesson's, and is reported as such (doc 88, the curvring landing).
 */
const Y_LINE = -27.5;
/**
 * The ring pace — a STATION-KEEPING speed behind the platoon.
 *
 * Measured on rb-mini-v1: a staged circulator rides r ≈ 17.9 at cruise 2.9 m/s =
 * 9.27 °/s. The driver holds the ring centreline at r = 18, so 12 km/h is
 * 10.61 °/s — 1.34 °/s FASTER than the platoon — and he enters right behind
 * its last car. 9.5 km/h = 8.40 °/s trails just under the platoon's own rate,
 * so the gap opens gently instead of closing — which is simply what following
 * the car ahead at ITS pace means. Both figures sit far under the 20.7 km/h
 * turn-detector ceiling: the ceiling is not what picks this number.
 */
const RING_KMH = 9.5;
/**
 * Where the right indicator goes on: φ = 112°, the first metre of ring past
 * the far kerb of the east mouth (it spans φ 68°–112° at the ring's outer
 * edge) — the first exit, which is not ours.
 */
const SIGNAL_PHI_DEG = 112;

/** The dials a pin may sweep (absent = the authored drive). */
export interface RbBusyGapDials {
  /** Shadow: the wait at the line, s. */
  waitSec?: number;
  /** Shadow: the ring pace, км/ч. */
  ringKmh?: number;
  /** Barge: its one speed, км/ч. */
  bargeKmh?: number;
  /** Short gap: the wait at the line, s. */
  shortGapWaitSec?: number;
  /** Short gap: how far into the entry the drive is cut, m (the contact). */
  shortGapCutM?: number;
}

/** Spawn → REST at the line in the mouth. */
function toLine(): RingPathBuilder {
  return miniPathFromSpawn().straightToY(Y_SLOW).mark("slow").straightToY(Y_LINE).mark("line");
}

/**
 * The correct drive's line: from the line, the family entry as it is taken
 * from inside the mouth (./ringMini MINI_ENTRY_FROM_MOUTH — 8 m radius), the
 * ring past the east mouth, the family north exit, and on to the finish.
 */
function buildShadowPath(): RingPath {
  return toLine()
    .enterRing(MINI_ENTRY_FROM_MOUTH)
    .mark("ring")
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal")
    .exitRing(miniExit("north"))
    .mark("lane")
    .straightToY(58)
    .mark("end")
    .build();
}
let shadowPath: RingPath | null = null;
const SHADOW = (): RingPath => (shadowPath ??= buildShadowPath());

/**
 * The shared approach: roll down the south arm and come to REST on the line at
 * (4.06, −27.5). Arriving at rest is what the drill's own „спри на линията"
 * gate (≤ 6 km/h within 3 m of y = −26) demands.
 */
function approachToLineSteps(p: RingPath): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: p.between("start", "slow"), targetKmh: 40, stopAtEnd: false },
    { kind: "drive", points: p.between("slow", "line", { stop: true }), targetKmh: 16 },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

/**
 * The wait at the line, in seconds, from the moment the car comes to rest there
 * (t = 12.25). THE dial of this template, and it is centred in a MEASURED
 * window. The drive clock: the platoon arms at t ≈ 5.75 (the player passes
 * 60 m from the ring centre) and metronomes from there, so the lead crosses
 * the player's mouth at t = 15.8, the follower at t = 18.6 — and on the L5
 * rung a THIRD car, 2.8 s behind the follower, at t = 21.4.
 *
 * One recording serves every rung, so the wait has to be right for the longest
 * platoon: the car moves off once the LAST car of it is past the mouth. See
 * SHADOW_WAIT_WINDOW in traces/__tests__/ring-demos-drivable.test.ts for the
 * measured window on every rung (the old 10 s was clean on L1–L4 and drove
 * into the side of the third car on L5).
 */
const SHADOW_WAIT_SEC = 14;

export function scRbBusyGapShadowScript(dials: RbBusyGapDials = {}): DriveScript {
  const p = SHADOW();
  const ringKmh = dials.ringKmh ?? RING_KMH;
  return {
    steps: [
      {
        // ONE RECORDING IS SHOWN ON EVERY RUNG, and the rungs differ in how
        // many cars the ring carries: two on L1–L4, three on L5. Until
        // 2026-10-12 these captions counted two («две коли», «зад втората»,
        // «и двете») and were false on L5, where the car the shadow enters
        // behind is the third. They now say what is true on all five.
        kind: "annotation",
        textBg: "В кръга колите вървят една след друга. Всички са с предимство — намаляваме отрано.",
      },
      ...approachToLineSteps(p),
      {
        kind: "annotation",
        // WAS «Спираме на линията…»: the car rests where the lesson's own
        // «Спри на линията» task is graded (a 3 m disc at y = −26), which is
        // 8 m PAST the give-way bar painted at y = −35.7 — the caption may not
        // call that spot the line. It is before the ring, 3.8 m from its edge.
        textBg: "Спираме преди кръга и гледаме наляво. Първата минава… но зад нея идва втора.",
      },
      { kind: "glance", mirror: "left" },
      {
        // The wait: the platoon sweeps through the mouth and out onto the east
        // arc. Braked: the ledger stays honest about why the car is still.
        kind: "pause",
        sec: dials.waitSec ?? SHADOW_WAIT_SEC,
        brake: true,
      },
      {
        kind: "annotation",
        textBg: "Пролуките между тях бяха твърде къси. Тази ЗАД последната е истинската — влизаме решително.",
      },
      { kind: "glance", mirror: "left" },
      {
        // The family entry, from inside the mouth.
        kind: "drive",
        points: p.between("line", "ring"),
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // The ring, flat and quiet, from the landing past the east mouth
        // (φ = 90) — the first exit, which is not ours.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Ring to φ = 130°, the family exit onto the north arm's lane, and on.
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: ringKmh,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Пропуснахме всички, влязохме в реален интервал и излязохме с мигач — никой в кръга не намали заради нас.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Нахлуване пред циркулиращата кола“ (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

/**
 * THE BARGE'S ONE SPEED, км/ч — held from the spawn to the ring, because the
 * card says so («Колата дори не намали на входа: влезе в кръга с непроменена
 * скорост пред първата циркулираща кола») and the demo has to be that drive.
 *
 * RE-STAGED 2026-10-05 (founder ruling «bill forced braking»: „The lesson own
 * "barge" demo gets re-staged so it really cuts someone off"). The old barge
 * came through the mouth at 22 км/ч with the lead ~11 m behind its merge point
 * and outran it: the lead held 2.90 m/s to the end, nobody had to brake, and
 * the drive was «a priority fault» only to a grader that convicted on where a
 * car WAS. Judged by what happened it is an entry nobody paid for.
 *
 * The platoon is a metronome from the moment the driver passes 60 m from the
 * ring centre (the sync is pinned out — see the template), so WHEN he reaches
 * the ring is set by this speed alone, on every rung and under every seed. The
 * band in which the lead really has to brake and the two cars never touch is
 * measured on the live chain at every rung and pinned (BARGE_BAND in
 * traces/__tests__/ring-demos-drivable.test.ts); this is its middle.
 */
const BARGE_KMH = 14;
/** Where the barge demo freezes: on the early ring, 8° past the landing. */
const BARGE_FREEZE_PHI_DEG = 63;

/** The barge's line is the family entry taken at a roll (./ringMini
 *  MINI_ENTRY): straight through the mouth and onto the ring. */
function buildBargePath(): RingPath {
  return miniPathFromSpawn()
    .straightToY(-40)
    .mark("arm")
    .enterRing(MINI_ENTRY)
    .mark("ring")
    .ringTo(BARGE_FREEZE_PHI_DEG)
    .mark("end")
    .build();
}
let bargePath: RingPath | null = null;
const BARGE = (): RingPath => (bargePath ??= buildBargePath());

export function scRbBusyGapMistakeBargeScript(dials: RbBusyGapDials = {}): DriveScript {
  const p = BARGE();
  const bargeKmh = dials.bargeKmh ?? BARGE_KMH;
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: колата изобщо не намалява на входа — влиза пред първата циркулираща кола.",
      },
      { kind: "glance", mirror: "rear" },
      // The barger signals right (correct form — it takes the first exit), so
      // its ONLY graded fault is the refused priority.
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: p.between("start", "arm"),
        targetKmh: bargeKmh,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Първата кола в кръга приближава отляво… но нашата не спира." },
      {
        // Straight through the mouth at the same speed, right in front of the
        // lead — which has to brake (the graded moment). The demo freezes on
        // the early ring right after it (driving on with the cut-off car on
        // the bumper would only stack unrelated noise on top of the ONE taught
        // mistake).
        kind: "drive",
        points: p.between("arm", "end", { stop: true }),
        targetKmh: bargeKmh,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 2.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Влизащият НЯМА предимство: на входа стои Б1/Б2 (Б3 не се поставя там — Наредба № РД-02-21-1/23.11.2023 за пътните знаци), значи пропускаш движещите се в кръга (ЗДвП чл. 50, ал. 1) — дори с цената на пълно спиране на входа.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Влизане в твърде къса пролука“ (FAILED_TO_YIELD + COLLISION)
// ---------------------------------------------------------------------------

/**
 * The wait that ends one car too early: long enough to let the LEAD pass (t =
 * 15.8, so the demo is visibly NOT the barge — this driver did look and did give
 * way once), short enough that the launch lands in the platoon's 2.8 s gap IN
 * FRONT of the follower: he comes onto the ring ahead of it, it has to brake
 * for him (FAILED_TO_YIELD) and still cannot avoid him (COLLISION). Measured
 * at the cut below: from 5.02 s to 5.18 s every rung shows exactly that AND
 * the follower ends stopped against him with the bodies unbroken in contact to
 * the end of the demo; at 5.0 the crash is only the authored beat (the bodies
 * never meet: a crash the ghost did not have), and from 5.2 the follower's own
 * turn at its path vertex opens the contact for a frame or more. 5.1 is the
 * middle (SHORT_GAP_WINDOW in traces/__tests__/ring-demos-drivable.test.ts).
 */
const SHORT_GAP_WAIT_SEC = 5.1;

/**
 * Where the short-gap drive is cut: this many metres into the entry. At the
 * 5.1 s wait the two bodies first overlap ≈ 7.5 m in (t = 20.00, the frame
 * both FAILED_TO_YIELD and COLLISION are billed); the ghost carries on and
 * stops with its nose ACROSS the follower's lane, so the follower brakes all
 * the way to a stop against it and the contact is unbroken to the end of the
 * demo — ONE accident, the authored `collision` beat landing inside it.
 * Measured at that wait: a cut of 7.4 m or less stops the ghost 0.1–0.5 m
 * short of the follower (the «crash» would be the authored beat alone); from
 * 7.7 m to beyond 11 m the follower is blocked and stays in contact. 8.85 m
 * keeps 1.2 m of margin on the short side. (The first re-authoring cut at the
 * overlap itself, 7.7 m at a 5.2 s wait: a corner the follower grazed for ten
 * frames and then drove on past — «нямаше къде да отиде» false.)
 */
const SHORT_GAP_CUT_M = 8.85;

function buildShortGapPath(cutM: number): RingPath {
  return toLine().enterRing(MINI_ENTRY_FROM_MOUTH, { contact: cutM }).mark("ring").build();
}
let shortGapPath: RingPath | null = null;
const SHORT_GAP = (): RingPath => (shortGapPath ??= buildShortGapPath(SHORT_GAP_CUT_M));

export function scRbBusyGapMistakeShortGapScript(dials: RbBusyGapDials = {}): DriveScript {
  const p = dials.shortGapCutM === undefined ? SHORT_GAP() : buildShortGapPath(dials.shortGapCutM);
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Този път входът започва правилно — колата спира и пропуска първата. Гледай КОЯ пролука взима после.",
      },
      ...approachToLineSteps(p),
      { kind: "glance", mirror: "left" },
      {
        // Only the LEAD is waited out. That single act of patience is what makes
        // this the harder, more honest mistake: the driver знае правилото и все
        // пак не го е приложил докрай.
        kind: "pause",
        sec: dials.shortGapWaitSec ?? SHORT_GAP_WAIT_SEC,
        brake: true,
      },
      { kind: "annotation", textBg: "Първата отмина — и кракът тръгва. Но на три секунди зад нея идва втора…" },
      {
        // The SAME entry as the shadow, taken one car too early: he comes onto
        // the ring in front of the follower, which has to brake for him
        // (FAILED_TO_YIELD) and still cannot avoid him (COLLISION). The entry
        // is cut at the measured contact point.
        kind: "drive",
        points: p.between("line", "contact"),
        targetKmh: 17,
        stopAtEnd: false,
      },
      {
        // The AUTHORED consequence (the S1 mistake-demo seam). HISTORY: it had
        // to be authored when contact was a branch of the runner's own step() and
        // a resolved runner stopped stepping. The director's ContactSentinel has
        // billed the crash from the geometry since B81, so this beat is
        // redundant — it lands inside the same unbroken overlap and folds into
        // the same accident. Kept because the annotation copy is timed against
        // it; the trace gate proves the geometry independently.
        kind: "collision",
        withWhat: "vehicle",
      },
      {
        kind: "annotation",
        textBg: "Втората кола нямаше къде да отиде — пролуката така и не беше пролука.",
      },
      // The demo ENDS on the impact. 1.2 s is enough to render the beat and to
      // drain the authored contact into a tick, and it is deliberately under the
      // 1.5 s standstillGapSustainSec: the follower's playerGuard parks it against
      // the wreck, so a longer freeze bills the driver a second, unrelated
      // второстепенна („bumper-kissing at a standstill") for standing too close to
      // the car it has just hit. That is the engine narrating the aftermath, not
      // the taught fault — the same reason sc-roundabout-entry's barge demo cuts
      // the moment its priority fault lands.
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "„Пропусни движещите се в кръга“ не значи „изчакай една кола“. Влизаш само когато никой в кръга не трябва да намалява заради теб (ЗДвП чл. 50, ал. 1).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRbBusyGapTraceName = "shadow-correct" | "mistake-barge-lead" | "mistake-short-gap";

const SCRIPTS: Record<ScRbBusyGapTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scRbBusyGapShadowScript },
  "mistake-barge-lead": { kind: "mistake", script: scRbBusyGapMistakeBargeScript },
  "mistake-short-gap": { kind: "mistake", script: scRbBusyGapMistakeShortGapScript },
};

/**
 * Record one of the three drives against a loaded rb-mini-v1 document — the
 * TEMPLATE's staged pair armed (single truth), ambient traffic zero (the harness
 * law). Deterministic: same district → same trace.
 */
export function recordScRbBusyGapDrive(
  districtRaw: unknown,
  name: ScRbBusyGapTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RB_BUSY_GAP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RB_BUSY_GAP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
