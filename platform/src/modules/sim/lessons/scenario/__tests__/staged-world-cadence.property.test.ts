/**
 * PROPERTY — sc-roundabout-entry:7b747c15 [major]: «the same drive is graded
 * differently on the two platforms».
 *
 * THE MEASURED CAUSE (w80 judge at 2127d8f, reproduced by this lane before a
 * line of product changed): the ring's staged circulator was released,
 * re-timed and locked by a director that decided once per RENDER FRAME, and it
 * was integrated in the ambient fleet's 0.1 s sub-steps. On a phone cadence the
 * whole lap ran up to ~1 m away from where the 60 Hz run put it at the same
 * session time, and lineStop(45 s, 12 км/ч) — a careful wait at the line — was
 * convicted of a COLLISION (10 т.) on two phone cadences while 60 Hz, 30 Hz
 * and a steady 0.5 s passed it «yielded», 0 points.
 *
 * THE PROPERTY, STATED HONESTLY. The student's own car is sampled per frame on
 * a real device too, so «every cadence grades every drive the same» is not a
 * claim any build can make. What this file asserts, for the SAME session-time
 * input tape (the authored drive, open loop, through liveChainReplay — the
 * production chain), on rungs L1–L5 and six cadences:
 *
 *   1. THE STAGED WORLD agrees: the circulator's release (its first command
 *      off the hold) happens at the same session time on every cadence to
 *      within ONE PHYSICS STEP (FIXED_DT), and its arc position at matched
 *      session times agrees to within one physics step of its own travel,
 *      for as long as it has not reacted to the student (its `playerShedMps`
 *      is 0 — after that it answers his per-frame pose, which is (2)'s
 *      business, not the staged clock's).
 *   2. THE SHEET (violation codes in order, points, verdict, tasks, praise)
 *      is ONE sheet per tape across the six cadences — with the two residual
 *      cells listed in KNOWN_RESIDUAL, each measured and explained, and pinned
 *      as still splitting so that a later repair (or a new split) is seen.
 *      Both residuals are the GRADER's frame sampling, not the staged world:
 *      the circulator agrees to ≤ 0.02 m in both (see the list).
 *
 * The default grid is the judge's: 8 tapes + a 38–46 s wait sweep × L1–L5 ×
 * 6 cadences (~25 s). `RB_CADENCE_FULL=1` widens it (waits 36–50 s every
 * 0.5 s, fourteen phase shifts of the phone cadence, ~100 s) and asserts (1)
 * on all of it while REPORTING sheet splits rather than pinning them. It is a
 * MEASUREMENT mode and is red today, on purpose and on numbers: the authored
 * barge's lock (a distance trigger, dEntry ≤ 14 m, met while he is braking
 * into the mouth) lands up to 27.3 ms (1.6 physics steps) off the 60 Hz lock
 * on five of the fourteen shifts, and the arc after it up to 0.069 m against
 * a 0.062 m step — the director knows his pose inside a long frame only as
 * the straight line between the frame's two ends. Sheet splits on the full
 * grid: lineStop(42) only (L1, L3, L4, L5), the KNOWN_RESIDUAL class.
 *
 * ROUND 3 — THE FIXED-STEP ACCUMULATOR (traffic/system.ts stepGrid). The world
 * and the director now advance only at the session's grid points k·FIXED_DT,
 * in whole steps, each reading the student's state AT the grid point; a frame
 * that crosses no grid point advances nothing. So the clauses are no longer
 * „within one step": on every cadence of this grid — including the ones the
 * round-2 verifier refuted it on (120 Hz, 144 Hz, 60 Hz ± 1 ms, 1/60–1/20 s, a
 * 2 s stall, 0.123/0.456 s, 0.37 s) — the release and the lock happen at the
 * SAME grid instant (|Δ| ≤ 1 µs) and the circulator's arc at matched grid
 * times agrees to ≤ 1 mm (measured: 0.000 m, 0.0 ms on all 1,040 rows). The
 * world is sampled at the grid point it is AT (`gridTimeOf`), not at the frame
 * end, which is up to one step later. The twoStop(2, 4.9) lock exemption
 * (round 2: «his knife edge», −108.7 ms on phone A) is gone: with his per-step
 * states read at the grid points and `dtSec` handed over as (k − kLast)·step,
 * it locks at 14.0500 s on every cadence.
 *
 * ROUND 4 — THE GRADE RUNS ON THE SAME GRID (scene/gradeGrid.ts). The rule
 * engine, the runtime's trackers and the lesson engine now run once per grid
 * point with the student AT it, so the SHEET clause has no exemption left:
 * lineStop(42) agrees on every cadence (KNOWN_RESIDUAL is empty), and three
 * cadences round 3's verifier refuted the frame-end grade on — 59.94 Hz,
 * 90 Hz, 60 Hz ± 0.2 µs — join the grid. `RB_CADENCE_FULL=1` now asserts the
 * sheets as well.
 *
 * ROUND 5 — ONE ORIGIN. The replay harness now runs the product's clock (the
 * first frame's delta moves the session clock, liveChainReplay.ts) and the grid
 * brings every point of the first frame (traffic/sessionGrid.ts), so a long
 * FIRST frame joins the cadences (0.5 s and 0.1 s then 60 Hz; 0.25 s and
 * 2/60 s in the full grid), and a fourth clause is asserted on every run, the
 * 60 Hz one included: the traffic world's own integrated time equals the
 * session time at every graded point. Round 4 brought ONE grid point on the
 * first frame whatever its length; on this lesson that moved no release, no
 * pose and no sheet (the circulator stands at its hold through the first half
 * second), which is exactly why the world's clock is asserted outright.
 * To keep the default grid near two minutes with those added, six cadences
 * whose class another default cadence already covers (30 Hz, 1/60–1/20 s,
 * 0.123/0.456 s, steady 0.37 s, 59.94 Hz, 90 Hz) moved to the full grid.
 */

import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import type { StagedCommand } from "../../../traffic";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import {
  scRoundaboutEntryMistakeBargeScript,
  scRoundaboutEntryShadowScript,
} from "../../../traces/scRoundaboutEntry";
import { FIXED_DT } from "../../../vehicle/tuning";
import { compileScenario } from "../compile";
import { SC_ROUNDABOUT_ENTRY } from "../templates-flow";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { lineStop, roll, singleStop, stopOnRing, twoStop } from "./roundaboutEntryDrives";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", `${SC_ROUNDABOUT_ENTRY.map.districtId}.json`), "utf-8"),
);
const FULL = process.env.RB_CADENCE_FULL === "1";
/** Measurement dump (one line per tape × cadence × rung): RB_CADENCE_DUMP=<file>. */
const DUMP = process.env.RB_CADENCE_DUMP;

/**
 * Frame deltas (ms) of w69-h1-mob sc-roundabout-entry__mobile-right (the
 * phone the row was filed from; witness-roundabout-entry-hold-and-cadence
 * carries the same list and where it was read from). 87 frames, a 7.5 s stall.
 */
const W69_MOBILE_FRAME_MS = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
];
/** A desktop jitter mix (w69 pc-right excerpt, a 983 ms hitch included). */
const PC_JITTER_MS = [11, 17, 12, 20, 14, 33, 10, 35, 10, 17, 12, 19, 13, 36, 31, 44, 33, 14, 12, 34, 13, 21, 12, 20, 14, 20, 29, 34, 161, 983];
const sec = (ms: readonly number[]) => ms.map((m) => m / 1000);
const rotate = (a: readonly number[], k: number) => [...a.slice(k), ...a.slice(0, k)];

/** A seeded LCG in [0, 1) — the round-2 verifier's generator, kept verbatim. */
function lcg(seed: number, n: number, map: (u: number) => number): number[] {
  let x = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(map(x / 2147483648));
  }
  return out;
}
/** 437 frames at 60 Hz, ONE 2 s stall (clamped to 0.5 s by the session clock), then 60 Hz. */
const STALL_2S = [...Array.from({ length: 437 }, () => 1 / 60), 2.0, ...Array.from({ length: 40000 }, () => 1 / 60)];

/**
 * Phone B is phone A phase-shifted by seven frames — the judge's construction.
 * ROUND 3 adds every cadence the round-2 verifier refuted the build on (its F1):
 * displays FASTER than the physics step (120, 144 Hz) and a real 60 Hz whose
 * frames jitter by ±1 ms — frame ends that are never grid points — plus its
 * slow mixes. Same generators, same seeds.
 */
const CADENCES: Array<[string, readonly number[]]> = [
  ["60 Hz", [1 / 60]],
  ["jitter", sec(PC_JITTER_MS)],
  ["phone A", sec(W69_MOBILE_FRAME_MS)],
  ["phone B", rotate(sec(W69_MOBILE_FRAME_MS), 7)],
  ["steady 0.5 s", [0.5]],
  ["120 Hz", [1 / 120]],
  ["144 Hz", [1 / 144]],
  ["60 Hz ±1 ms", lcg(777, 5000, (u) => 1 / 60 - 0.001 + u * 0.002)],
  ["2 s stall", STALL_2S],
  ["0.25/0.4 s", [0.25, 0.4]],
  // Round 4: a cadence round 3's verifier refuted the frame-end grade on.
  ["60 Hz ± 0.2 µs", [1 / 60 + 2e-7, 1 / 60 - 2e-7]],
  // Round 5 — a long FIRST live frame, then a 60 Hz display (the harness runs
  // the product's clock: the first frame's delta moves the session clock).
  ["0.5 s first frame, then 60 Hz", [0.5, ...Array.from({ length: 60000 }, () => 1 / 60)]],
  ["0.1 s first frame, then 60 Hz", [0.1, ...Array.from({ length: 60000 }, () => 1 / 60)]],
];
if (FULL) {
  CADENCES.push(["30 Hz", [1 / 30]]);
  CADENCES.push(["1/60–1/20 s", lcg(12345, 5000, (u) => 1 / 60 + u * (1 / 20 - 1 / 60))]);
  CADENCES.push(["0.123/0.456 s", [0.123, 0.456]]);
  CADENCES.push(["steady 0.37 s", [0.37]]);
  CADENCES.push(["59.94 Hz", [1 / 59.94]]);
  CADENCES.push(["90 Hz", [1 / 90]]);
  CADENCES.push(["0.25 s first frame, then 60 Hz", [0.25, ...Array.from({ length: 60000 }, () => 1 / 60)]]);
  CADENCES.push(["2/60 s first frame, then 60 Hz", [2 / 60, ...Array.from({ length: 60000 }, () => 1 / 60)]]);
  for (let k = 1; k <= 14; k++) if (k !== 7) CADENCES.push([`phone A+${k}`, rotate(sec(W69_MOBILE_FRAME_MS), k)]);
}

const TAPES: Array<[string, () => DriveScript]> = [
  ["authored shadow", scRoundaboutEntryShadowScript],
  ["singleStop(9,12)", () => singleStop(9, 12)],
  ["twoStop(2,4.9,12,12)", () => twoStop(2, 4.9, 12, 12)],
  ["singleStop(30,10)", () => singleStop(30, 10)],
  ["lineStop(45,12)", () => lineStop(45, 12)],
  ["authored barge", scRoundaboutEntryMistakeBargeScript],
  ["roll(0,25)", () => roll(0, 25)],
  ["stopOnRing(0,17,10,3)", () => stopOnRing(0, 17, 10, 3)],
];
const waits = FULL ? Array.from({ length: 29 }, (_, i) => 36 + i * 0.5) : [38, 39, 40, 41, 42, 43, 44, 46];
for (const w of waits) TAPES.push([`lineStop(${w},12)`, () => lineStop(w, 12)]);

const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];

/** Round 3: one grid instant is one grid instant (the clock is k·FIXED_DT on a
 *  long frame and Σ dt at a 60 Hz frame end: they differ in the 13th digit). */
const SAME_INSTANT_SEC = 1e-6;
/** …and one world is one world: the circulator's arc at matched grid times. */
const SAME_POSE_M = 0.001;

/**
 * THE TWO CELLS THAT STILL SPLIT, measured on this tree (probe of the default
 * grid), each a fact about the GRADER's frame sampling with the staged world
 * agreeing:
 *
 *  · L1 lineStop(42): 60 Hz and four other cadences bill FAILED_TO_YIELD +
 *    COLLISION (20); phone B bills COLLISION only (10). His nose comes onto the
 *    ring and the circulator's rear passes his mouth INSIDE ONE 0.5 s phone-B
 *    frame (57.527 → 58.027 s). The runtime's roundabout tracker
 *    (runtime/worldRuntime.ts, ADR-011's priority set) builds the set from
 *    the cars' poses at the END of the entry frame, so the car has already
 *    passed and never joins it; the touch is then «a collision, billed as one
 *    elsewhere». The circulator itself is within 0.016 m of the 60 Hz car.
 *  · L4 lineStop(42): 60 Hz and 30 Hz bill FAILED_TO_YIELD (10), the four
 *    long-frame cadences FAILED_TO_YIELD + COLLISION (20). At 60 Hz the
 *    circulator's 0.4 m/s shed convicts at 57.80 s and the L4 session ends
 *    there; on a long frame the shed AND the contact that would have come
 *    after it land in ONE tick, and both are billed.
 *
 *
 * ROUND 2 (session-aligned staged grid + the per-step track): the circulator
 * now releases and locks at EXACTLY the 60 Hz instants on every cadence of
 * this grid (Δ 0.0 ms) and its arc stays within 3 mm of the 60 Hz car — and the
 * L1 phone-B split is joined by L3 and L5, the same tracker class on the same
 * frame (57.527 → 58.027 s): round 1 passed them only because its circulator
 * ran 16 mm off the 60 Hz car, enough to move the end-of-frame membership.
 *
 * Neither is the staged clock this lane repairs; both are owed to whoever
 * takes the grader's sub-frame ordering (the report names the code).
 *
 * ROUND 3 (fixed-step grid): the circulator is now the SAME car on every
 * cadence (arc Δ 0.000 m at matched grid times, release and lock Δ 0.0 ms), and
 * the student is the same open-loop drive — what is left is the grader's own
 * per-frame sampling. L1/L3/L5 phone B now AGREE with 60 Hz (the circulator no
 * longer passes his mouth at a different instant); L1/L3/L5 split on a steady
 * 0.37 s instead. MEASURED (probe, L1): at the grid point 57.7167 s the
 * circulator is at arc 35.335 m on both runs; at 60 Hz the runtime tracker
 * convicts at 57.850 s, the very frame the sentinel finds the first contact,
 * and both are billed; on 0.37 s one frame (57.72 → 58.09 s) holds his nose
 * reaching the ring AND that contact, the tracker reads the ring at 58.09 s
 * only, and bills nothing — the collision (found at its grid point) alone.
 * L4 (the session ends on the first fault): at 60 Hz the circulator's shed
 * convicts at 57.800 s and the session ends there; on phone B one frame
 * (57.527 → 58.027 s) holds the shed and the contact after it, the tracker
 * convicts at 58.027 s, and the contact found inside that frame is billed with
 * it. Both are the runtime's once-per-frame adjudication (worldRuntime.ts
 * roundabout tracker; the engine's frame-granular session end), not the world.
 */
/*
 * ROUND 4 — THE GRADE RUNS ON THE SAME GRID (scene/gradeGrid.ts): the whole
 * graded chain, the runtime's roundabout tracker and the engine's session end
 * included, runs once per grid point with the student AT it. The tracker no
 * longer reads one frame end for a whole 0.37 s or 0.5 s frame, and a long
 * frame no longer carries the shed and the contact after it in one tick: both
 * residuals above are gone, MEASURED on every cadence of this grid (lineStop(42)
 * L1–L5: one sheet, FAILED_TO_YIELD + COLLISION 20 т. on L1/L2/L3/L5 and
 * FAILED_TO_YIELD 10 т. on L4, on all of them). Nothing is exempt any more.
 */
const KNOWN_RESIDUAL: ReadonlyArray<string> = [];

interface Run {
  sheet: string;
  /** Session time of the circulator's first command off its hold. */
  releaseT: number;
  /** …and of the lock (the runner's `cruise` at the authored ring speed). */
  lockT: number;
  /** [t, arc s, speed m/s, shed m/s] at every frame. */
  series: Array<[number, number, number, number]>;
  pathLengthM: number;
  /** First session time his centre came within the roundabout (ring + 6 m). */
  outsideUntil: number;
  /** First session time he was at rest (≤ 2.5 км/ч) after moving off. */
  firstStopT: number;
  /** Round 5 — ONE ORIGIN: the largest |world time − session time| at a graded
   *  point, s (the traffic world's own integrated time against the tick's). */
  worldLagSec: number;
}

/** rb-mini-v1's ring centreline radius about the origin (roundaboutEntryDrives). */
const RING_AREA_M = 18 + 6;

/** The session time the traffic world is AT: its integer grid index × the step. */
function gridTimeOf(traffic: unknown, frameT: number): number {
  const k = (traffic as { gridK?: number }).gridK;
  // A tree without the fixed-step grid (base, round 2) is at its frame end.
  return typeof k === "number" ? k * FIXED_DT : frameT;
}

const ringId = (staged: readonly StagedEventSpec[]) => staged.find((s) => s.kind === "roundaboutEntry")!.id;

function drive(lessonLevel: ScenarioLevel, trace: ReturnType<typeof recordScriptedDrive>["trace"], frameDeltas: readonly number[]): Run {
  const lesson = compileScenario(SC_ROUNDABOUT_ENTRY, lessonLevel);
  const id = ringId((lesson.stagedEvents ?? []) as StagedEventSpec[]);
  // The release is read off the command stream, at the instant it was issued:
  // a command from inside a frame (the director's sub-step) carries the
  // sub-step's session time, one from the director's frame step the frame's.
  let installed = false;
  let frameT = 0;
  let clock: number | null = null;
  const releases: Array<number | null> = [];
  const locks: Array<number | null> = [];
  const series: Run["series"] = [];
  let pathLengthM = 0;
  let outsideUntil = Infinity;
  let firstStopT = Infinity;
  let movedOff = false;
  let worldLagSec = 0;
  const out = liveChainReplay({
    lesson,
    districtRaw: RAW,
    trace,
    frameDeltas,
    holdAfterSec: 3,
    beforeApply: (c) => {
      // Commands issued by this frame's director step land here, at the frame's t.
      for (let i = 0; i < releases.length; i++) if (releases[i] === null) releases[i] = c.t;
      for (let i = 0; i < locks.length; i++) if (locks[i] === null) locks[i] = c.t;
      if (installed) return;
      installed = true;
      const tr = c.traffic as unknown as {
        stagedCommand(i: string, cmd: StagedCommand): void;
        stagedListener?: {
          substep(e: number, h: number, f: number, p: unknown, g?: number): void;
          frameEnd(decideAtEnd?: boolean, h?: number): void;
        } | null;
      };
      const orig = tr.stagedCommand.bind(tr);
      tr.stagedCommand = (i: string, cmd: StagedCommand) => {
        if (i === id && cmd.type === "cruise" && (cmd.speedMps ?? 1) > 0) releases.push(clock);
        if (i === id && cmd.type === "cruise" && cmd.speedMps === undefined) locks.push(clock);
        orig(i, cmd);
      };
      const inner = tr.stagedListener;
      if (inner) {
        tr.stagedListener = {
          // Every argument forwarded: on the fixed-step grid (round 3) the 5th is
          // the grid point's session time, and frameEnd's says whether the
          // frame end is one.
          substep: (e, h, f, p, g) => {
            clock = g ?? frameT + e;
            inner.substep(e, h, f, p, g);
          },
          frameEnd: (d, h) => {
            clock = null;
            inner.frameEnd(d, h);
          },
        };
      }
    },
    afterApply: (c) => {
      frameT = c.t;
      // The world has integrated exactly as much time as the session has had
      // at this grid point — whatever the first frame's length (round 4 left
      // it 29 steps short for the whole drive after a 0.5 s first frame).
      worldLagSec = Math.max(worldLagSec, Math.abs(c.traffic.timeSec - c.t));
      if (outsideUntil === Infinity && Math.hypot(c.tick.position.x, c.tick.position.y) < RING_AREA_M) outsideUntil = c.t;
      if (Math.abs(c.tick.speedKmh) > 10) movedOff = true;
      else if (movedOff && firstStopT === Infinity && Math.abs(c.tick.speedKmh) <= 2.5) firstStopT = c.t;
      const a = c.traffic.staged(id);
      if (!a) return;
      pathLengthM = a.pathLengthM;
      const row = c.traffic
        .circulatingTraffic(0, 0, c.tick.position.x, c.tick.position.y, c.tick.headingDeg, 40)
        .vehicles.find((v) => Math.hypot(v.x - a.x, v.y - a.y) < 1e-6);
      // The world is a GRID state (round 3): the instant it is at is the last
      // grid point reached, not the frame end (traffic/system.ts stepGrid).
      series.push([gridTimeOf(c.traffic, c.t), a.s, a.speedMps, row?.playerShedMps ?? 0]);
    },
  });
  const r = out.result;
  const sheet = [
    out.violationCodes.join("+") || "—",
    `${r.score} т.`,
    r.passed ? "passed" : "failed",
    `tasks ${r.objectives.map((o) => (o.done ? "1" : "0")).join("")}`,
    `praise ${out.commendationCodes.join("+") || "—"}`,
  ].join(" · ");
  return {
    sheet,
    releaseT: releases.find((t) => t !== null) ?? NaN,
    lockT: locks.find((t) => t !== null) ?? NaN,
    series,
    pathLengthM,
    outsideUntil,
    firstStopT,
    worldLagSec,
  };
}

/**
 * Largest |Δarc| against the 60 Hz run at this run's frame times — over the
 * STAGED WORLD'S OWN STRETCH: from the release until the student's centre
 * first comes within the roundabout in either run, and only while neither
 * car has shed speed for him. Inside the roundabout the circulator answers his
 * pose (its player guard), which is his per-frame sampling, not its clock.
 */
function worstPoseGap(ref: Run, run: Run, untilT: number): { gapM: number; tolM: number; at: number } {
  let worst = { gapM: 0, tolM: 0, at: NaN };
  let ratio = -1;
  let j = 1;
  let vMax = 0;
  let k = 0;
  const from = Math.max(ref.releaseT, run.releaseT);
  const until = Math.min(ref.outsideUntil, run.outsideUntil, untilT);
  for (const [t, s, , shed] of run.series) {
    if (t >= until) break;
    if (shed > 0 || t < from) continue;
    while (j < ref.series.length && ref.series[j][0] < t) j++;
    if (j >= ref.series.length) break;
    const [t0, s0, , sh0] = ref.series[j - 1];
    const [t1, s1, , sh1] = ref.series[j];
    if (sh0 > 0 || sh1 > 0) continue;
    // The fastest the 60 Hz car has gone since the release, up to t: a step's
    // offset in TIME is worth that much arc, and keeps it after the car slows.
    while (k < j + 1 && k < ref.series.length) {
      if (ref.series[k][0] >= from) vMax = Math.max(vMax, ref.series[k][2]);
      k++;
    }
    let ds = s1 - s0;
    const L = ref.pathLengthM;
    if (L > 0 && Math.abs(ds) > L / 2) ds -= Math.sign(ds) * L;
    const sRef = s0 + (ds * (t - t0)) / Math.max(t1 - t0, 1e-9);
    let gap = Math.abs(s - sRef);
    if (L > 0) gap = Math.min(gap, Math.abs(L - gap));
    // One physics step of travel, + 1 cm: 5 mm for the reference's own linear
    // interpolation between two 60 Hz frames and 5 mm for the integrators
    // (equal sub-steps of a long frame are not the 60 Hz grid's steps).
    const tol = vMax * FIXED_DT + 0.01;
    if (gap / tol > ratio) {
      ratio = gap / tol;
      worst = { gapM: gap, tolM: tol, at: t };
    }
  }
  return worst;
}

describe("the staged world runs on the physics clock — sc-roundabout-entry:7b747c15", () => {
  const recorded = new Map<string, ReturnType<typeof recordScriptedDrive>["trace"]>();
  const traceOf = (level: ScenarioLevel, name: string, mk: () => DriveScript) => {
    // The demo chain arms the template's base staging under seed 7 (the
    // recorder never grades a rung); the pose stream is the same on every rung.
    const key = name;
    let t = recorded.get(key);
    if (!t) {
      const lesson = compileScenario(SC_ROUNDABOUT_ENTRY, level);
      t = recordScriptedDrive(RAW, mk(), {
        scenarioId: SC_ROUNDABOUT_ENTRY.id,
        kind: "shadow",
        seed: 7,
        stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
        collisionMinKmh: 0,
      }).trace;
      recorded.set(key, t);
    }
    return t;
  };

  const splits: string[] = [];
  for (const level of LEVELS) {
    it(`L${level}: release within one physics step, matched poses within one step of travel, one sheet per tape`, () => {
      const releaseFails: string[] = [];
      const poseFails: string[] = [];
      for (const [name, mk] of TAPES) {
        const trace = traceOf(level, name, mk);
        const runs = CADENCES.map(([c, fd]) => [c, drive(level, trace, fd)] as const);
        const ref = runs[0][1];
        expect(Number.isFinite(ref.releaseT), `${name}: the circulator was never released at 60 Hz`).toBe(true);
        const differ: string[] = [];
        for (const [c, run] of runs) {
          if (!(run.worldLagSec <= SAME_INSTANT_SEC)) {
            releaseFails.push(`${name} @${c}: the world's clock is ${(run.worldLagSec * 1000).toFixed(1)} ms off the session clock at a graded point`);
          }
        }
        for (const [c, run] of runs.slice(1)) {
          const dRel = Math.abs(run.releaseT - ref.releaseT);
          // The same grid instant (round 3), which is far inside one step.
          if (!(dRel <= SAME_INSTANT_SEC)) {
            releaseFails.push(`${name} @${c}: release ${run.releaseT.toFixed(4)} s vs 60 Hz ${ref.releaseT.toFixed(4)} s (Δ ${(dRel * 1000).toFixed(1)} ms)`);
          }
          const dLock = Math.abs(run.lockT - ref.lockT);
          if (Number.isFinite(ref.lockT) || Number.isFinite(run.lockT)) {
            if (!(dLock <= SAME_INSTANT_SEC)) {
              releaseFails.push(`${name} @${c}: lock ${run.lockT.toFixed(4)} s vs 60 Hz ${ref.lockT.toFixed(4)} s (Δ ${(dLock * 1000).toFixed(1)} ms)`);
            }
          }
          const g = worstPoseGap(ref, run, Infinity);
          if (DUMP) {
            appendFileSync(
              DUMP,
              `L${level}	${name}	${c}	release ${run.releaseT.toFixed(4)} (60 Hz ${ref.releaseT.toFixed(4)}, Δ ${((run.releaseT - ref.releaseT) * 1000).toFixed(1)} ms)	lock ${run.lockT.toFixed(4)} (Δ ${((run.lockT - ref.lockT) * 1000).toFixed(1)} ms)	arc gap ${g.gapM.toFixed(3)} m (step ${g.tolM.toFixed(3)})	${run.sheet === ref.sheet ? "same sheet" : `SHEET «${run.sheet}» vs «${ref.sheet}»`}
`,
            );
          }
          if (g.gapM > SAME_POSE_M) {
            poseFails.push(`${name} @${c}: arc ${g.gapM.toFixed(3)} m off the 60 Hz car at t=${g.at.toFixed(2)} s (one step = ${g.tolM.toFixed(3)} m)`);
          }
          if (run.sheet !== ref.sheet) differ.push(c);
        }
        if (differ.length > 0) {
          splits.push(`L${level} ${name}: ${differ.join(", ")} differ`);
          if (FULL) console.log(`[split] L${level} ${name}: 60 Hz «${ref.sheet}»; ${differ.map((c) => `${c} «${runs.find((r) => r[0] === c)![1].sheet}»`).join("; ")}`);
        }
      }
      // One assertion, three clauses, so a failure shows all of them at once:
      // the release / lock clock, the matched poses, and the sheets.
      const mine = splits.filter((s) => s.startsWith(`L${level} `));
      expect(
        { clock: releaseFails, poses: poseFails, sheets: mine },
        "staged clock, staged poses, one sheet per tape (residuals: KNOWN_RESIDUAL)",
      ).toEqual({
        clock: [],
        poses: [],
        // Round 4: asserted on the full grid too — every wait 36–50 s, every phase.
        sheets: KNOWN_RESIDUAL.filter((s) => s.startsWith(`L${level} `)),
      });
    }, 600_000);
  }
});
