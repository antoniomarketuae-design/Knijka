/**
 * CENSUS PIN — sc-roundabout-entry:7b747c15 round 4: «the same drive is graded
 * differently on the two platforms». THE WORLD AND THE GRADE RUN ON ONE FIXED
 * STEP (scene/gradeGrid.ts): for the SAME session-time input tape, every
 * render cadence must produce the SAME graded tick stream — tick for tick,
 * bit for bit — and therefore the same sheet.
 *
 * WHY THE STREAM AND NOT ONLY THE SHEET. Round 3 moved the world onto the grid
 * and left the rule engine on the frame; its verifier found the sheet census
 * still agreeing on most cells while the per-frame gap rate the engine reads
 * (rules/engine.ts, FOLLOWING_TOO_CLOSE's «the gap is opening» acquittal) was
 * a sawtooth on 627 of 1,257 frames at 120 Hz. A sheet can agree by luck; a
 * stream of ticks that is identical cannot be graded two ways. So each cell
 * asserts the stream digest (every graded point's time, pose, speed, lead
 * gap and events) AND the sheet against the 60 Hz run.
 *
 * WHAT IS EXPECTED TO DIFFER: nothing graded. The frame count differs (that is
 * the cadence); the drawn poses differ (render only). Every cell this file
 * covers agrees on every cadence on this tree.
 *
 * ROUND 5 — THE FIRST LIVE FRAME. Until round 5 the replay harness skipped the
 * first frame's delta, so every cadence in this file began with one graded
 * point at t = 0 and nothing here could see what a long first frame does. The
 * product adds that delta to the session clock like any other, and round 4's
 * grid brought ONE grid point on that frame whatever its length: after a 0.5 s
 * first frame the car and the session clock were 0.5 s in and the world and
 * the signal clock 0.0167 s in for the rest of the drive. Its verifier
 * measured, under the product's clock, 21 of 1,531 sheets split against the
 * same 60 Hz display without the hitch (base: 2): sc-rx-tram-left gained a
 * RED_LIGHT_CROSSED, the CORRECT demo of sc-jx-equal-left gained a COLLISION
 * and failed. The harness now runs the product's clock (liveChainReplay.ts)
 * and the grid brings every point of the first frame (traffic/sessionGrid.ts),
 * so this file drives the FIRST-FRAME-HITCH cadences too — a 0.5 s, 0.25 s,
 * 0.1 s and 2/60 s first frame, then a 60 Hz display — and the stream digest
 * carries the SIGNAL STATE each tick read, so a signal clock that started
 * late is a stream split even where no sheet moves.
 *
 * ROUND 6 — THE PERSON IN THE PATH. `tick.vruAheadM` (graded input: it acquits
 * a stop made for a human being) was published by the product and never by the
 * harness, so no cell here could see it — nor a scene that measured it from
 * the wrong pose (round 5's verifier, F1/F4). The grid measures it for both of
 * its callers now, and the stream digest carries it; three cells with staged
 * people in the car's path joined the default grid (the accident scene, the
 * tram island, the roundabout's exit crossing).
 *
 * ROUND 7 — WHAT THE STUDENT IS SHOWN, NOT ONLY WHAT HE IS BILLED. The sheet
 * key (codes, points, verdict, tasks, praise) could not see three things a
 * student reads: the coached rows (a first fault shown and not charged), the
 * lesson's own mistake, and the near misses («мина на косъм» — stepped once
 * per render frame by NpcColliders until round 7, so the replay could not
 * contain one and its count differed by cadence in the round-6 verifier's
 * model on 15 of 503 demos). The grid measures the near-miss stat now and the
 * replay folds it into the session as the shell does, so each cell also
 * compares SHOWN: the coached rows, the lesson mistakes, every teach-moment
 * code, every near miss (time, kind, clearance, speed, place) and the whole
 * debrief text. Cells with a near miss and one with a coached standstill gap
 * joined the default grid.
 *
 * ROUND 8 — THE LOOKS GO THE PRODUCT'S WAY, AND SO DOES THE ATTEMPT TRACE.
 * Through round 7 the replay wrote a tape's looks straight into each grid
 * point, so no cell here ran the grid's held-look path — where the next
 * frame's look erased one no point had heard (the round-7 verifier, F1: 26 of
 * its 481 two-look cells got two sheets between 60 Hz and 120/144 Hz, 15
 * flipped pass/fail) — and the first of two looks pressed at one instant (128
 * pairs on 89 committed tapes) was dropped on every cadence, where the product
 * at 60 Hz hears both. The replay now hands looks over as a live frame gets
 * them (the cabin's own queue → the frame's glance and `moreLooks` → the
 * grid's queue, one look per grid point), so:
 *
 *  · WHAT MUST AGREE ON EVERY CADENCE: the sheet; everything shown; the world's
 *    tick stream (every graded point's time, pose, speed, lead gap, person
 *    ahead, signal state and events OTHER than the look); that every look
 *    pressed was heard, once, in order, none dropped.
 *  · WHAT MUST AGREE ON A DISPLAY WHOSE FRAMES ARE NO LONGER THAN A STEP
 *    (120 Hz, 144 Hz, 90 Hz): everything — the grid point each look was heard
 *    at, the attempt trace sample for sample and event for event, the rubric's
 *    observation moments.
 *  · WHAT A LONGER FRAME CHANGES, AND ONLY THIS: the grid point a look is heard
 *    at. The cabin is read once per frame, so a look is heard at the first
 *    point of the frame that sampled it — never later than at 60 Hz, and at
 *    most (the frame's points − 1) earlier. The census below bounds exactly
 *    that. Where a look sits within a frame of an edge the rubric's observation
 *    mapper draws, the scored moments can therefore differ on a phone's
 *    cadence: ONE committed demo does (sc-park-gap-short mistake-forward-hit,
 *    L1–L5 — three looks pressed one grid point before the tape's lever
 *    reads R are all heard, inside a 0.5 s frame, before that gear change,
 *    which this replay — unlike a live long frame — keeps at its own grid
 *    point). It is pinned by name, with its numbers; no sheet differs.
 *
 * And the student's ATTEMPT TRACE — what the rubric's observation moments are
 * scored from — is fed once per graded grid point by the scene's own function
 * (scene/attemptFeed.ts), here as in the live lesson: its samples are compared
 * on every cadence.
 *
 * Default (~1 min): the cells the round-3 verifier and the round-1/2 censuses
 * named as splitting — the follow-distance family, the priority / police /
 * telltale stops, the crossing overtake, the stop-sign and zebra long-frame
 * class, the bike-lane turn, the merge cells — on the fifteen cadences of the
 * round-4 brief, ambient ON (the product's own traffic), plus the gap-rate
 * profile of sc-follow-distance tailgate L4; and the cells the round-4
 * verifier measured splitting after a long first frame, on the first-frame
 * cadences (FIRST_FRAME_CADENCES), with the signal state at every grid point
 * compared outright on two signal lessons.
 * `GRADE_GRID_FULL=1`: every committed demo × every rung — with staged traffic
 * ambient ON and OFF, without it ambient ON (round 7) — every cadence of both lists (`GRADE_GRID_SHARD=i/n`
 * splits it; a few hours on one worker).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LessonSpec } from "../../../contracts";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace } from "../../../traces/types";
import { FIXED_DT } from "../../../vehicle/tuning";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayLooks } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const FULL = process.env.GRADE_GRID_FULL === "1";

/** w69-h1-mob sc-roundabout-entry__mobile-right frame deltas, ms (the phone
 *  the row was filed from; staged-world-cadence.property.test.ts). */
const W69 = [
  234, 668, 255, 629, 259, 722, 522, 277, 227, 300, 1104, 295, 256, 739, 524, 778, 518, 817, 350, 411, 927,
  1365, 498, 287, 800, 524, 845, 366, 310, 1217, 1185, 262, 234, 241, 243, 338, 404, 1114, 527, 1249, 332,
  1272, 355, 654, 770, 419, 344, 990, 1557, 429, 491, 1476, 482, 617, 1213, 890, 1888, 871, 1051, 1082, 1623,
  7505, 655, 1887, 453, 329, 362, 343, 314, 306, 291, 502, 2139, 1939, 2099, 2341, 506, 499, 494, 471, 407, 384,
  439, 453, 370, 339,
].map((m) => m / 1000);
/** A desktop jitter mix (w69 pc-right excerpt, a 983 ms hitch included). */
const PC_JITTER = [
  11, 17, 12, 20, 14, 33, 10, 35, 10, 17, 12, 19, 13, 36, 31, 44, 33, 14, 12, 34, 13, 21, 12, 20, 14, 20, 29,
  34, 161, 983,
].map((m) => m / 1000);
/** The round-2 verifier's seeded LCG in [0, 1), verbatim. */
function lcg(seed: number, n: number, map: (u: number) => number): number[] {
  let x = seed;
  const o: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    o.push(map(x / 2147483648));
  }
  return o;
}

const rep = (n: number, v: number) => Array.from({ length: n }, () => v);
/** A first live frame of `first` seconds, then a 60 Hz display. */
const firstFrame = (first: number) => [first, ...rep(60000, 1 / 60)];

/** Round 5 — the first-frame cadences: a long first frame, then 60 Hz, plus
 *  the long-frame cadences whose FIRST frame is long too (steady 0.5 s, the
 *  phone's two phases) and 120 Hz (a first frame that brings no grid point). */
export const FIRST_FRAME_CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["0.5 s first frame, then 60 Hz", firstFrame(0.5)],
  ["0.25 s first frame, then 60 Hz", firstFrame(0.25)],
  ["0.1 s first frame, then 60 Hz", firstFrame(0.1)],
  ["2/60 s first frame, then 60 Hz", firstFrame(2 / 60)],
  ["0.5 s", [0.5]],
  ["phone A", W69],
  ["phone B", [...W69.slice(7), ...W69.slice(0, 7)]],
  ["120 Hz", [1 / 120]],
];

/** The round-4 brief's cadences; the reference is the first. */
export const GRADE_GRID_CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["60 Hz", [1 / 60]],
  ["120 Hz", [1 / 120]],
  ["144 Hz", [1 / 144]],
  ["59.94 Hz", [1 / 59.94]],
  ["90 Hz", [1 / 90]],
  ["60 Hz ± 0.2 µs", [1 / 60 + 2e-7, 1 / 60 - 2e-7]],
  ["60 Hz ± 1 ms", lcg(777, 5000, (u) => 1 / 60 - 0.001 + u * 0.002)],
  ["PC jitter", PC_JITTER],
  ["1/60–1/20 s", lcg(12345, 5000, (u) => 1 / 60 + u * (1 / 20 - 1 / 60))],
  ["phone A", W69],
  ["phone B", [...W69.slice(7), ...W69.slice(0, 7)]],
  ["0.25/0.4 s", [0.25, 0.4]],
  ["0.37 s", [0.37]],
  ["0.5 s", [0.5]],
  ["2 s stall", [...Array.from({ length: 437 }, () => 1 / 60), 2.0, ...Array.from({ length: 40000 }, () => 1 / 60)]],
];

/** lesson id → trace file → rungs: the default grid. */
const DEFAULT_CELLS: ReadonlyArray<readonly [string, string, readonly ScenarioLevel[]]> = [
  ["sc-follow-distance", "mistake-tailgate.trace.json", [1, 4]],
  ["sc-follow-cutin", "shadow-correct.trace.json", [1]],
  ["sc-follow-rain-gap", "mistake-gap-melts.trace.json", [4]],
  ["sc-fo-motorway-gap", "mistake-one-second.trace.json", [5]],
  ["sc-merge-bus-pullout", "mistake-glue-behind.trace.json", [1, 4]],
  ["sc-vp-police-stop", "shadow-correct.trace.json", [1]],
  ["sc-vp-telltale", "shadow-correct.trace.json", [1]],
  ["sc-hz-breakdown-pulloff", "shadow-correct.trace.json", [1]],
  ["sc-ov-crossing-overtake", "mistake-late-swerve.trace.json", [1]],
  ["sc-junction-gap", "mistake-creep-out.trace.json", [1]],
  ["sc-zebra-approach", "mistake-too-fast.trace.json", [1]],
  ["sc-vu-bikelane-turn", "mistake-cut-path.trace.json", [1]],
  ["sc-merge-from-property", "mistake-signal-and-go.trace.json", [1]],
  ["sc-merge-lane-end", "mistake-no-indicator.trace.json", [1]],
  ["sc-rb-lane-choice", "mistake-exit-across-outer.trace.json", [1]],
  // Round 6 — staged people in the car's own path (`tick.vruAheadM` live).
  ["sc-hz-accident-scene", "mistake-gawk-stop.trace.json", [4]],
  ["sc-rx-tram-island", "mistake-squeeze-past.trace.json", [1]],
  ["sc-rb-ped-exit", "shadow-correct.trace.json", [5]],
  // Round 7 — near misses (an oncoming car at 0.72 m; a pedestrian at 0.60 m;
  // two bystanders) and a coached row decided on the drive's last tick.
  ["sc-turn-left-oncoming", "mistake-cut-gap.trace.json", [3]],
  ["sc-crossing-rain-sprint", "mistake-not-yielded.trace.json", [3]],
  ["sc-hz-accident-scene", "mistake-squeeze.trace.json", [3]],
  ["sc-fo-brakelight-chain", "mistake-late-brake.trace.json", [2]],
  // …and a lesson with NO staged traffic: two near misses with ambient walkers.
  ["sc-ln-turn-lane-arrows", "mistake-left-from-through.trace.json", [1]],
  // Round 8 — looks and what is scored from them: two looks recorded at one
  // instant before a three-point turn; a reverse park whose observation moments are
  // scored from the attempt trace; and the one demo whose scored moments a
  // phone's frame changes (KNOWN_LOOK_TIMED_MOMENTS).
  ["sc-maneuver-3point", "shadow-correct.trace.json", [1]],
  ["sc-park-perp-rev", "shadow-correct.trace.json", [1]],
  ["sc-park-gap-short", "mistake-forward-hit.trace.json", [1]],
];

/**
 * ROUND 8 — the cells whose SCORED observation moments differ from 60 Hz on a
 * cadence with frames longer than a step, and what they are there. Measured
 * over every committed demo × rung (2,434 cells) on phone B and a steady
 * 0.5 s: these five and no other; no sheet and nothing else shown differs.
 *
 * sc-park-gap-short mistake-forward-hit: the tape presses left, right, rear at
 * one instant, 30.333 s (grid point 1820), and its lever reads R from 30.35 s
 * (grid point 1821). At 60 Hz the three are heard at points 1820, 1821, 1822;
 * the attempt trace keeps every third point, so its first sample in reverse
 * is point 1822 — the mapper credits the first look as obs-before-reverse and
 * the third, heard on that very sample, as obs-during-reverse. Inside a 0.5 s
 * frame the three are heard at the frame's first points (1801–1803 at a steady
 * 0.5 s), up to 0.35 s BEFORE the reverse phase the trace records, which this
 * replay keeps at the tape's own grid point: no look is left inside it, and
 * obs-during-reverse is not credited. A live long frame samples the lever by
 * the frame too, so there the order of lever and look is the order they were
 * pressed in; this replay cannot show that.
 */
const KNOWN_LOOK_TIMED_MOMENTS: ReadonlyMap<string, { at60: string[]; onLongFrames: string[] }> = new Map(
  ([1, 2, 3, 4, 5] as const).map((L) => [
    `sc-park-gap-short/mistake-forward-hit.trace.json/L${L}`,
    { at60: ["obs-before-reverse", "obs-during-reverse"], onLongFrames: ["obs-before-reverse"] },
  ]),
);

/** A frame of this cadence brings at most this many grid points (the session
 *  clock's 0.5 s ceiling included). What that bounds: `heardTooEarly`. */
function maxPointsPerFrame(deltas: readonly number[]): number {
  let longest = 0;
  for (const d of deltas) longest = Math.max(longest, Math.min(d, 0.5));
  return Math.max(1, Math.ceil(longest / FIXED_DT - 1e-6));
}

/**
 * HOW EARLY A LOOK CAN BE HEARD — MEASURED FROM ITS PRESS (the round-8
 * verifier's C-PINBOUND). A look is heard at the first grid point graded at or
 * after the frame that sampled it, plus one per look ahead of it. That frame
 * reached the press (the press is at or before the frame's end), and the frame
 * brought at most `span` points, the first of them at `f`; the clock hands
 * out every point at or before the frame's end, so the point after its last
 * one lies AFTER the frame's end and so after the press. Hence
 * pressSec < (f + span)·FIXED_DT: the point that hears a look lies LESS THAN
 * `span` steps before its press.
 *   - A display of 60 Hz or faster (span 1): the grid point the press falls
 *     in, never earlier — for a press on the grid that is its own point.
 *   - A 0.5 s frame (span 30): at most 29 whole points before the grid point
 *     the press falls in. For a press OFF the grid that is 30 points before
 *     its 60 Hz point (phone B, presses 7 ms off the grid, measured by the
 *     verifier); until this round the pin counted from the 60 Hz point and
 *     allowed span - 1 = 29, which is one point short of the truth.
 * Never later than at 60 Hz is checked beside it, from the 60 Hz point.
 * `span` is the span of THE FRAME THAT TOOK THE LOOK (the replay's frame
 * `frame`, 1-based, ran on deltas[(frame - 1) % deltas.length]) — not the
 * longest frame of the cadence: on phone B (frames 0.23–0.5 s) a look taken by
 * a 0.234 s frame leads its press by less than 15 steps, and a bound of 30
 * would let a replay that hands a press to a frame that ENDED BEFORE it go
 * unseen (the integration verifier's mutant: the latch reaching one step past
 * a long frame's end survived every clause of this file).
 * Returns the first look that breaks the bound, or null.
 */
function heardTooEarly(r: CellRun, deltas: readonly number[]): string | null {
  if (r.looks.taken.length !== r.looks.heard.length) {
    return `${r.looks.heard.length} look(s) heard, ${r.looks.taken.length} press time(s) known`;
  }
  for (let i = 0; i < r.looks.heard.length; i++) {
    const { k, kind } = r.looks.heard[i];
    const { pressSec, frame } = r.looks.taken[i];
    const span = maxPointsPerFrame([deltas[(frame - 1) % deltas.length]]);
    // (1e-9 s: float noise in k·FIXED_DT, nothing else.)
    if (!(k * FIXED_DT > pressSec - span * FIXED_DT - 1e-9)) {
      return `look ${i} (${kind}) pressed at ${pressSec.toFixed(4)} s (grid ${(pressSec / FIXED_DT).toFixed(2)}) heard at point ${k}, ${(pressSec / FIXED_DT - k).toFixed(2)} steps before its press — a frame here brings at most ${span} point(s)`;
    }
  }
  return null;
}

/**
 * The two-look clause's tapes: a committed demo with its own first two
 * DIFFERENT looks made less than 2 s apart pressed at `offSec` and
 * `offSec + gapSec` after the first one's instant (0, 0 = together, on the
 * grid). Null when the tape has no such pair.
 */
export function pressedTogether(trace: ScenarioTrace, offSec: number, gapSec: number): ScenarioTrace | null {
  const idx = trace.events.map((e, i) => (e.kind.startsWith("glance-") ? i : -1)).filter((i) => i >= 0);
  for (let a = 0; a + 1 < idx.length; a++) {
    const ea = trace.events[idx[a]];
    const eb = trace.events[idx[a + 1]];
    if (ea.kind === eb.kind || eb.tSec - ea.tSec >= 2) continue;
    const events = trace.events.map((e, i) =>
      i === idx[a] ? { ...e, tSec: ea.tSec + offSec } : i === idx[a + 1] ? { ...e, tSec: ea.tSec + offSec + gapSec } : e,
    );
    const ordered = events
      .map((e, i) => [e, i] as const)
      .sort((x, y) => x[0].tSec - y[0].tSec || x[1] - y[1])
      .map((x) => x[0]);
    return { ...trace, events: ordered };
  }
  return null;
}

/** The default cells that must CARRY a near miss (a replay that published
 *  none would agree with itself on every cadence). */
const NEAR_MISS_CELLS =
  /^sc-(turn-left-oncoming\/mistake-cut-gap\.trace\.json\/L3|crossing-rain-sprint\/mistake-not-yielded\.trace\.json\/L3|hz-accident-scene\/mistake-squeeze\.trace\.json\/L3|ln-turn-lane-arrows\/mistake-left-from-through\.trace\.json\/L1)$/;

/** lesson id → trace file → rungs: the cells the round-4 verifier measured
 *  splitting after a long first frame (r4/ff-r4-on-splits.txt), driven on
 *  FIRST_FRAME_CADENCES. */
const FIRST_FRAME_CELLS: ReadonlyArray<readonly [string, string, readonly ScenarioLevel[]]> = [
  ["sc-rx-tram-left", "mistake-no-indicator.trace.json", [1, 4]],
  ["sc-jx-equal-left", "shadow-correct.trace.json", [1]],
  ["sc-junction-rhr", "mistake-barge.trace.json", [3]],
  ["sc-junction-left", "mistake-cut-gap.trace.json", [3, 5]],
  ["sc-turn-left-oncoming", "mistake-cut-gap.trace.json", [1]],
  ["sc-signal-flashing", "mistake-cut.trace.json", [1]],
  ["sc-sig-controller-live", "mistake-wait-for-green.trace.json", [1]],
  ["sc-ed-d2-priority-run", "shadow-correct.trace.json", [1]],
  ["sc-vu-cyclist-group", "mistake-cut-in.trace.json", [4]],
  ["sc-sig-green-wave", "mistake-sleep-at-green.trace.json", [1]],
];

const noAmbient = (l: LessonSpec): LessonSpec => ({
  ...l,
  traffic: { ...(l.traffic ?? {}), vehicleCount: 0, pedestrianCount: 0, sidewalkPedestrianCount: 0 },
});

interface CellRun {
  sheet: string;
  /** Everything else the student is shown that the sheet key does not carry
   *  (round 7): coached rows, lesson mistakes, teach-moment codes, near misses
   *  and the debrief text. */
  shown: string;
  /** Near misses the grid resolved on this drive. */
  nearMisses: number;
  /** FNV-1a over every graded point's (t, x, y, heading, speed, lead gap, the
   *  person-ahead distance, the signal state the tick read, events) — the
   *  events WITHOUT the look (round 8: which point hears a look is the frame's
   *  to decide; see `looksAt`). */
  stream: string;
  /** …and the same with every event, the looks included. */
  streamWithLooks: string;
  /** What became of the tape's looks (round 8). */
  looks: LiveReplayLooks;
  /** Every look a grid point heard, in order: `kind@k`. */
  looksAt: string[];
  /** The rubric's observation moments as the shell scores them from the
   *  attempt trace (null: unmeasured), and the whole rubric. */
  observed: string[] | null;
  rubric: string;
  /** The attempt trace: its samples (time, pose, speed, lever, stalk, the
   *  frame's controls), and its events (looks, indicator edges). */
  traceSamples: string;
  traceEvents: string;
  /** Graded points that carried a person-ahead distance. */
  personAhead: number;
  /** The signal state the tick read at each graded grid point, by index. */
  signal: Map<number, string>;
  points: number;
  /** Graded points at which the lead gap OPENED at ≥ 0.5 m/s (the engine's
   *  «opening» acquittal of FOLLOWING_TOO_CLOSE reads that rate). */
  opening: number;
}

function fnv(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function run(lesson: LessonSpec, raw: unknown, trace: ScenarioTrace, frameDeltas: readonly number[]): CellRun {
  let h = 2166136261;
  let hLooks = 2166136261;
  let points = 0;
  let opening = 0;
  let personAhead = 0;
  let prevGap = NaN;
  let prevT = NaN;
  const signal = new Map<number, string>();
  const out = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace,
    frameDeltas,
    afterApply: ({ t, tick }) => {
      points++;
      const g = tick.leadGapM ?? Infinity;
      if (Number.isFinite(g) && Number.isFinite(prevGap) && t > prevT && (g - prevGap) / (t - prevT) >= 0.5) opening++;
      prevGap = g;
      prevT = t;
      const light = tick.nextStopLineState ?? "-";
      signal.set(Math.round(t / FIXED_DT), light);
      const person = tick.vruAheadM ?? Infinity;
      if (Number.isFinite(person)) personAhead++;
      const head = `${t}|${tick.position.x}|${tick.position.y}|${tick.headingDeg}|${tick.speedKmh}|${g}|${person}|${light}|`;
      h = fnv(h, head + JSON.stringify(tick.events.filter((e) => e.kind !== "mirrorGlance")));
      hLooks = fnv(hLooks, head + JSON.stringify(tick.events));
    },
  });
  const r = out.result;
  const at = out.attemptTrace;
  let hs = 2166136261;
  for (const sm of at?.samples ?? []) {
    hs = fnv(
      hs,
      `${sm.tSec.toFixed(9)}|${sm.x}|${sm.y}|${sm.headingDeg}|${sm.speedKmh}|${sm.gear}|${sm.indicator}|${sm.steerRad}|${sm.brakeOn}|${sm.throttleOn}`,
    );
  }
  return {
    sheet: [
      out.violationCodes.join("+") || "—",
      `${r.score} т.`,
      r.passed ? "passed" : "failed",
      `tasks ${r.objectives.map((o) => (o.done ? "1" : "0")).join("")}`,
      `praise ${out.commendationCodes.join("+") || "—"}`,
    ].join(" · "),
    shown: JSON.stringify({
      coached: r.coachedMistakes ?? [],
      lessonMistakes: r.lessonMistakes ?? [],
      teach: out.teachMomentCodes,
      nearMisses: r.nearMisses ?? [],
      nearMissEvents: out.nearMisses,
      debrief: out.debrief,
    }),
    nearMisses: out.nearMisses.length,
    stream: h.toString(16),
    streamWithLooks: hLooks.toString(16),
    looks: out.looks,
    looksAt: out.looks.heard.map((l) => `${l.kind}@${l.k}`),
    observed: out.observedMomentIds,
    rubric: JSON.stringify(out.rubric),
    traceSamples: at ? `${at.samples.length}:${hs.toString(16)}` : "no trace",
    traceEvents: JSON.stringify((at?.events ?? []).map((e) => `${e.kind}:${e.detail ?? ""}@${e.tSec.toFixed(9)}`)),
    signal,
    points,
    opening,
    personAhead,
  };
}

/**
 * One cell on one cadence against its own 60 Hz run — the round-8 contract in
 * the file header. Appends what differs to `splits`.
 */
function compareToReference(key: string, name: string, deltas: readonly number[], r: CellRun, ref: CellRun, splits: string[]): void {
  const at = `${key} @${name}`;
  // WHEN, from the press (C-PINBOUND): no look is heard as much as one of its
  // frames before it was pressed — on this cadence, nor on the 60 Hz run.
  for (const [run, cadence, label] of [
    [r, deltas, name],
    [ref, [1 / 60], "60 Hz"],
  ] as const) {
    const early = heardTooEarly(run, cadence);
    if (early !== null) {
      splits.push(`${key} @${label}: HEARD BEFORE ITS PRESS ALLOWS — ${early}`);
      return;
    }
  }
  if (r.sheet !== ref.sheet) {
    splits.push(`${at}: SHEET «${r.sheet}» vs 60 Hz «${ref.sheet}»`);
    return;
  }
  if (r.stream !== ref.stream || r.points !== ref.points) {
    splits.push(`${at}: stream ${r.stream}/${r.points} vs 60 Hz ${ref.stream}/${ref.points} (same sheet)`);
    return;
  }
  if (r.shown !== ref.shown) {
    splits.push(`${at}: SHOWN differs (${r.nearMisses} near misses vs ${ref.nearMisses} at 60 Hz; same sheet and stream)`);
    return;
  }
  // EVERY LOOK HEARD: none dropped, none left waiting that 60 Hz heard.
  const lost = r.looks.droppedByCabin + r.looks.droppedByGrid;
  if (lost > 0) splits.push(`${at}: ${lost} look(s) DROPPED`);
  const kinds = r.looks.heard.map((l) => l.kind);
  const refKinds = ref.looks.heard.map((l) => l.kind);
  const span = maxPointsPerFrame(deltas);
  // In order: the looks 60 Hz heard are the first looks this cadence heard. A
  // long frame may reach — and hear — a later press of the tape before the
  // point the session ends on; a display of 60 Hz or faster may not.
  if (kinds.slice(0, refKinds.length).join(",") !== refKinds.join(",") || (span === 1 && kinds.length !== refKinds.length)) {
    splits.push(`${at}: LOOKS heard [${kinds.join(",")}] vs 60 Hz [${refKinds.join(",")}]`);
    return;
  }
  // WHEN: never later than at 60 Hz (how early: `heardTooEarly`, above,
  // measured from the press).
  let early = 0;
  for (let i = 0; i < refKinds.length; i++) {
    const dk = ref.looks.heard[i].k - r.looks.heard[i].k;
    if (dk < 0) {
      splits.push(`${at}: look ${i} (${kinds[i]}) heard at point ${r.looks.heard[i].k}, LATER than at 60 Hz (${ref.looks.heard[i].k})`);
      return;
    }
    if (dk > 0) early++;
  }
  // The attempt trace's samples are the grid's on every cadence.
  if (r.traceSamples !== ref.traceSamples) {
    splits.push(`${at}: ATTEMPT TRACE samples ${r.traceSamples} vs 60 Hz ${ref.traceSamples}`);
    return;
  }
  if (span === 1) {
    // A display of 60 Hz or faster: everything, the looks' points included.
    if (r.streamWithLooks !== ref.streamWithLooks || r.looksAt.join() !== ref.looksAt.join()) {
      splits.push(`${at}: a look heard at another grid point: [${r.looksAt.join(",")}] vs 60 Hz [${ref.looksAt.join(",")}]`);
    } else if (r.traceEvents !== ref.traceEvents) splits.push(`${at}: ATTEMPT TRACE events differ`);
    else if (JSON.stringify(r.observed) !== JSON.stringify(ref.observed) || r.rubric !== ref.rubric) {
      splits.push(`${at}: SCORED moments [${r.observed}] vs 60 Hz [${ref.observed}]`);
    }
    return;
  }
  // A longer frame: the scored moments are 60 Hz's unless a look moved — and
  // then only on the cells named, with the moments named.
  if (JSON.stringify(r.observed) !== JSON.stringify(ref.observed) || r.rubric !== ref.rubric) {
    const known = KNOWN_LOOK_TIMED_MOMENTS.get(key.replace(" (ambient off)", ""));
    const asKnown =
      known !== undefined &&
      early > 0 &&
      JSON.stringify(ref.observed) === JSON.stringify(known.at60) &&
      JSON.stringify(r.observed) === JSON.stringify(known.onLongFrames);
    if (!asKnown) splits.push(`${at}: SCORED moments [${r.observed}] vs 60 Hz [${ref.observed}] (${early} look(s) heard early)`);
  }
}

function cellsOf(
  list: ReadonlyArray<readonly [string, string, readonly ScenarioLevel[]]> = DEFAULT_CELLS,
): Array<{ key: string; lesson: LessonSpec; raw: unknown; trace: ScenarioTrace }> {
  const cells: Array<{ key: string; lesson: LessonSpec; raw: unknown; trace: ScenarioTrace }> = [];
  const shard = (process.env.GRADE_GRID_SHARD ?? "0/1").split("/").map(Number);
  let n = 0;
  for (const spec of SCENARIO_TEMPLATES) {
    const dir = path.join(REPO_ROOT, "content", "traces", spec.id);
    if (!existsSync(dir)) continue;
    const wanted = FULL ? null : list.filter((c) => c[0] === spec.id);
    if (wanted !== null && wanted.length === 0) continue;
    const rungs: Array<[ScenarioLevel, LessonSpec]> = [];
    for (const L of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      try {
        const l = compileScenario(spec, L);
        // Round 7: lessons WITHOUT staged traffic are cells too (the ambient
        // fleet gives near misses there) — every one under FULL, the listed
        // ones by default. Through round 6 this pin skipped them.
        if (FULL || wanted !== null || (l.stagedEvents ?? []).length > 0) rungs.push([L, l]);
      } catch {
        /* no such rung */
      }
    }
    if (rungs.length === 0) continue;
    if (FULL && n++ % shard[1] !== shard[0]) continue;
    const raw = loadDistrict(spec.map.districtId);
    const files = readdirSync(dir).filter((f) => f.endsWith(".trace.json")).sort();
    for (const f of files) {
      const levels = wanted === null ? null : wanted.filter((c) => c[1] === f).flatMap((c) => c[2]);
      if (levels !== null && levels.length === 0) continue;
      const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(dir, f), "utf-8")));
      if (!trace) continue;
      for (const [L, lesson] of rungs) {
        if (levels !== null && !levels.includes(L)) continue;
        cells.push({ key: `${spec.id}/${f}/L${L}`, lesson, raw, trace });
        if (FULL && (lesson.stagedEvents ?? []).length > 0) {
          cells.push({ key: `${spec.id}/${f}/L${L} (ambient off)`, lesson: noAmbient(lesson), raw, trace });
        }
      }
    }
  }
  return cells;
}

describe("one graded stream on every cadence — the grade runs on the session grid (sc-roundabout-entry:7b747c15)", () => {
  const cells = cellsOf();

  // FULL: every cadence of both lists on every cell.
  const driven = FULL
    ? [...GRADE_GRID_CADENCES.slice(1), ...FIRST_FRAME_CADENCES.filter(([n]) => !GRADE_GRID_CADENCES.some(([m]) => m === n))]
    : GRADE_GRID_CADENCES.slice(1);

  it(`${FULL ? "every committed demo × rung, ambient on and off" : "the cells that used to split"}: the tick stream and the sheet equal 60 Hz's on ${driven.length} cadences`, () => {
    expect(cells.length).toBeGreaterThan(FULL ? 0 : DEFAULT_CELLS.length - 1);
    const splits: string[] = [];
    for (const c of cells) {
      const ref = run(c.lesson, c.raw, c.trace, GRADE_GRID_CADENCES[0][1]);
      expect(ref.points, `${c.key}: graded at 60 Hz`).toBeGreaterThan(0);
      // Round 6: the cells with staged people in the path do carry the channel
      // the digest now covers (a harness that published nothing would agree
      // with itself on every cadence).
      if (/^sc-(hz-accident-scene|rx-tram-island|rb-ped-exit)\//.test(c.key)) {
        expect(ref.personAhead, `${c.key}: graded points with a person in the path`).toBeGreaterThan(50);
      }
      // Round 7: the near-miss cells do carry a near miss, and the brake-light
      // chain's late brake does carry its coached standstill gap.
      if (NEAR_MISS_CELLS.test(c.key)) expect(ref.nearMisses, `${c.key}: near misses at 60 Hz`).toBeGreaterThan(0);
      if (c.key === "sc-fo-brakelight-chain/mistake-late-brake.trace.json/L2") {
        expect(ref.shown, `${c.key}: the coached row`).toContain("STANDSTILL_GAP_TOO_CLOSE");
      }
      // Round 8: at 60 Hz every look on the tape is heard — the two of a pair
      // recorded at one instant included — and the look cells do carry looks
      // and scored moments (a replay that fed none would agree with itself).
      expect(
        { dropped: ref.looks.droppedByCabin + ref.looks.droppedByGrid, unheard: ref.looks.unheard, heard: ref.looks.heard.length },
        `${c.key}: the tape's looks at 60 Hz`,
      ).toEqual({ dropped: 0, unheard: 0, heard: ref.looks.pressed });
      if (c.key === "sc-maneuver-3point/shadow-correct.trace.json/L1") {
        // left and right recorded at one instant: heard at consecutive points.
        const pair = ref.looks.heard.findIndex((l, i, a) => i > 0 && l.k === a[i - 1].k + 1 && l.kind !== a[i - 1].kind);
        expect(pair, `${c.key}: two looks of one instant heard at consecutive grid points [${ref.looksAt.join(",")}]`).toBeGreaterThan(0);
      }
      if (c.key === "sc-park-perp-rev/shadow-correct.trace.json/L1") {
        expect(ref.observed, `${c.key}: observation moments scored from the attempt trace`).not.toBeNull();
        expect((ref.observed ?? []).length).toBeGreaterThan(0);
        expect(ref.traceSamples).not.toBe("no trace");
      }
      const known = KNOWN_LOOK_TIMED_MOMENTS.get(c.key);
      if (known) expect(ref.observed, `${c.key}: scored moments at 60 Hz`).toEqual(known.at60);
      for (const [name, fd] of driven) {
        const r = run(c.lesson, c.raw, c.trace, fd);
        compareToReference(c.key, name, fd, r, ref, splits);
        // The pinned difference IS there on a steady 0.5 s (if it stopped
        // being, the pin and the header are stale).
        if (known && name === "0.5 s") expect(r.observed, `${c.key} @0.5 s: scored moments`).toEqual(known.onLongFrames);
      }
    }
    expect(splits).toEqual([]);
  }, 14_400_000);

  it.skipIf(FULL)(
    `ROUND 5 — the first live frame: the cells that split after a 0.5 s first frame give one stream and one sheet on ${FIRST_FRAME_CADENCES.length} first-frame cadences`,
    () => {
      const ff = cellsOf(FIRST_FRAME_CELLS);
      expect(ff.length).toBeGreaterThan(FIRST_FRAME_CELLS.length - 1);
      const splits: string[] = [];
      for (const c of ff) {
        const ref = run(c.lesson, c.raw, c.trace, [1 / 60]);
        expect(ref.points, `${c.key}: graded at 60 Hz`).toBeGreaterThan(0);
        for (const [name, fd] of FIRST_FRAME_CADENCES) {
          const r = run(c.lesson, c.raw, c.trace, fd);
          compareToReference(c.key, name, fd, r, ref, splits);
        }
      }
      expect(splits).toEqual([]);
    },
    1_200_000,
  );

  it("ROUND 5 — the harness runs the PRODUCT's clock on the first frame: its delta moves the session clock, and the frame grades the grid points inside it", () => {
    // Every pin in this file is only as good as the clock the harness runs.
    // Until round 5 `liveChainReplay` skipped the first frame's delta, so a
    // 0.5 s first frame graded nothing the product grades in it. LessonScene
    // adds that delta (`sessionClock.frame(dt, …)`), and rapier takes 30 steps
    // in such a frame — so the harness must grade grid points 1…30 IN the
    // first frame: at wall time 0.5 s, with the car read at k/60.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-follow-distance")!;
    const lesson = compileScenario(spec, 1 as ScenarioLevel);
    const raw = loadDistrict(spec.map.districtId);
    const trace = parseScenarioTrace(
      JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "shadow-correct.trace.json"), "utf-8")),
    )!;
    for (const [first, inFirst] of [
      [0.5, 30],
      [0.25, 15],
      [0.1, 6],
      [2 / 60, 2],
      [1 / 60, 1],
      // A 120 Hz first frame reaches no grid point: it grades nothing, and
      // grid point 1 is graded in the second frame.
      [1 / 120, 0],
    ] as const) {
      const seen: Array<{ k: number; t: number; wall: number }> = [];
      const out = liveChainReplay({
        lesson,
        districtRaw: raw,
        trace,
        frameDeltas: [first, ...rep(60000, 1 / 60)],
        afterApply: ({ t, wallSec }) => {
          if (seen.length < 40) seen.push({ k: Math.round(t / FIXED_DT), t, wall: wallSec });
        },
      });
      const name = `first frame ${first.toFixed(4)} s`;
      // Grid points 1, 2, 3 … — the origin (t = 0) is never graded — each at
      // k·FIXED_DT, a product.
      expect(seen.map((s) => s.k), name).toEqual(Array.from({ length: 40 }, (_, i) => 1 + i));
      for (const s of seen) expect(Object.is(s.t, s.k * FIXED_DT), `${name}: tick at k·H`).toBe(true);
      // The points graded IN the first frame: the wall clock stands at the
      // first frame's own length for exactly those.
      expect(seen.filter((s) => Math.abs(s.wall - first) < 1e-12).length, `${name}: grid points graded in the first frame`).toBe(inFirst);
      // The next frame (1/60 s later) grades the next point, and so on.
      expect(seen[inFirst].wall, `${name}: wall clock at the first point of frame 2`).toBeCloseTo(first + 1 / 60, 12);
      // The wall clock counts every frame's delta, the first included.
      expect(out.frames, name).toBeGreaterThan(40 - inFirst);
    }
  }, 600_000);

  it("ROUND 5 — the signal clock starts with the car: the signal state a tick reads at every grid point equals 60 Hz's after a first frame of any length", () => {
    // MEASURED by the round-4 verifier under the product's clock: on
    // sc-sig-green-wave mistake-sleep-at-green L1 the state differed at up to
    // 132 grid points after a 0.5 s first frame (the signal clock 29 steps
    // behind the session clock for the whole drive); 0 on base.
    for (const [id, file, L] of [
      ["sc-sig-green-wave", "mistake-sleep-at-green.trace.json", 1],
      ["sc-rx-tram-left", "mistake-no-indicator.trace.json", 1],
    ] as const) {
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
      const lesson = compileScenario(spec, L as ScenarioLevel);
      const raw = loadDistrict(spec.map.districtId);
      const trace = parseScenarioTrace(
        JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", id, file), "utf-8")),
      )!;
      const ref = run(lesson, raw, trace, [1 / 60]);
      // The lesson has a signal to read, and it changes during the drive.
      expect(new Set(ref.signal.values()).size, `${id}: signal states seen at 60 Hz`).toBeGreaterThan(1);
      // The first graded point is grid point 1 — the origin is never graded.
      expect(Math.min(...ref.signal.keys()), `${id}: first graded grid point`).toBe(1);
      for (const [name, fd] of FIRST_FRAME_CADENCES) {
        const r = run(lesson, raw, trace, fd);
        let differs = 0;
        let first = -1;
        for (const [k, s] of ref.signal) {
          if (r.signal.get(k) !== s) {
            differs++;
            if (first < 0) first = k;
          }
        }
        expect(
          { points: r.signal.size, differs, first },
          `${id} @${name}: grid points at which the tick read another signal state than at 60 Hz`,
        ).toEqual({ points: ref.signal.size, differs: 0, first: -1 });
      }
    }
  }, 600_000);

  // ── ROUND 8 — the look clause ────────────────────────────────────────────
  /** The cadences of the round-8 brief's look clause; the reference first. */
  const LOOK_CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
    ["60 Hz", [1 / 60]],
    ["120 Hz", [1 / 120]],
    ["144 Hz", [1 / 144]],
    ["90 Hz", [1 / 90]],
    ["phone B", [...W69.slice(7), ...W69.slice(0, 7)]],
    ["0.5 s", [0.5]],
  ];
  /** How the two looks are pressed: [label, seconds off the grid, seconds apart]. */
  const PRESSES: ReadonlyArray<readonly [string, number, number]> = [
    ["together, on the grid", 0, 0],
    ["together, 5 ms off the grid", 0.005, 0],
    ["on consecutive 120 Hz frames", 0, 1 / 120],
    ["5 ms off the grid, on consecutive 144 Hz frames", 0.005, 1 / 144],
  ];
  /** The demos the round-7 verifier measured flipping pass/fail between 60 Hz
   *  and 120/144 Hz when their two looks were pressed together. */
  const LOOK_CELLS: ReadonlyArray<readonly [string, string, readonly ScenarioLevel[]]> = [
    ["sc-jx-giveway-b1", "shadow-correct.trace.json", [1]],
    ["sc-pk-move-off", "shadow-correct.trace.json", [1, 4]],
    ["sc-vp-handbrake", "shadow-correct.trace.json", [1]],
    ["sc-vp-handbrake", "mistake-handbrake-on.trace.json", [1]],
    ["sc-ed-d2-priority-run", "mistake-rolling-stop.trace.json", [4]],
  ];

  it(`ROUND 8 — two looks pressed together, and on consecutive frames: ${FULL ? "every committed demo that has two different looks < 2 s apart" : "the demos that flipped pass/fail at 120/144 Hz"} — ONE sheet on ${LOOK_CADENCES.length} cadences, and every look heard`, () => {
    const lookCells = cellsOf(LOOK_CELLS).filter((c) => !c.key.endsWith("(ambient off)"));
    expect(lookCells.length).toBeGreaterThan(FULL ? 0 : 5);
    const splits: string[] = [];
    let driven = 0;
    let onePointEarly = 0;
    for (const c of lookCells) {
      for (const [press, off, gap] of PRESSES) {
        const tape = pressedTogether(c.trace, off, gap);
        if (tape === null) continue; // (FULL) no two different looks < 2 s apart
        driven++;
        const key = `${c.key} [${press}]`;
        const ref = run(c.lesson, c.raw, tape, LOOK_CADENCES[0][1]);
        // 60 Hz: every look heard; a pair pressed inside one frame at k, k + 1.
        expect(
          { dropped: ref.looks.droppedByCabin + ref.looks.droppedByGrid, unheard: ref.looks.unheard, heard: ref.looks.heard.length },
          `${key}: the tape's looks at 60 Hz`,
        ).toEqual({ dropped: 0, unheard: 0, heard: ref.looks.pressed });
        for (const [name, fd] of LOOK_CADENCES.slice(1)) {
          const r = run(c.lesson, c.raw, tape, fd);
          const at = `${key} @${name}`;
          if (r.sheet !== ref.sheet) {
            splits.push(`${at}: SHEET «${r.sheet}» vs 60 Hz «${ref.sheet}»`);
            continue;
          }
          if (r.stream !== ref.stream || r.points !== ref.points || r.shown !== ref.shown) splits.push(`${at}: world stream or shown differs (same sheet)`);
          const lost = r.looks.droppedByCabin + r.looks.droppedByGrid + r.looks.unheard;
          const kinds = r.looks.heard.map((l) => l.kind).join(",");
          const refKinds = ref.looks.heard.map((l) => l.kind).join(",");
          if (lost > 0 || !kinds.startsWith(refKinds)) {
            splits.push(`${at}: LOOKS heard [${kinds}] (${lost} dropped or unheard) vs 60 Hz [${refKinds}]`);
            continue;
          }
          // WHEN. Never later than 60 Hz; and, from the PRESS (C-PINBOUND,
          // `heardTooEarly`), less than one of its frames before it: a press
          // OFF the grid can be heard one point before its 60 Hz point on a
          // display of 60 Hz or faster (a frame that brought a grid point and
          // then sampled a press made after it), and a longer frame hears a
          // look at its first point. Pressed together on the grid, the pair is
          // heard at 60 Hz's points on every display of 60 Hz or faster.
          for (const [run, cadence, label] of [
            [r, fd, name],
            [ref, LOOK_CADENCES[0][1], LOOK_CADENCES[0][0]],
          ] as const) {
            const tooEarly = heardTooEarly(run, cadence);
            if (tooEarly !== null) splits.push(`${key} @${label}: HEARD BEFORE ITS PRESS ALLOWS — ${tooEarly}`);
          }
          const exact = maxPointsPerFrame(fd) === 1 && off === 0 && gap === 0;
          for (let i = 0; i < ref.looks.heard.length; i++) {
            const dk = ref.looks.heard[i].k - r.looks.heard[i].k;
            if (dk < 0 || (exact && dk !== 0)) splits.push(`${at}: look ${i} heard at point ${r.looks.heard[i].k}, at 60 Hz at ${ref.looks.heard[i].k}`);
            else if (dk === 1 && maxPointsPerFrame(fd) === 1) onePointEarly++;
          }
        }
      }
    }
    expect(driven).toBeGreaterThan(FULL ? 100 : 20);
    expect(splits).toEqual([]);
    // Teeth for the «one point early» allowance: it does happen (144 and 90 Hz,
    // presses off the grid) — it is a property of the product, not slack.
    if (!FULL) expect(onePointEarly, "looks heard one point before their 60 Hz point on a 90/144 Hz display").toBeGreaterThan(0);
  }, 14_400_000);

  it("C-PINBOUND — how early a look is heard is measured from its PRESS: every look of sc-ed-d2-city-run's correct demo pressed 7 ms off the grid, on phone B, is heard less than one frame (30 steps) before its press — and one of them 30 points before its 60 Hz point, past the 29 a bound counted from the 60 Hz point allows; one sheet", () => {
    const spec = SCENARIO_TEMPLATES.find((sp) => sp.id === "sc-ed-d2-city-run")!;
    const lesson = compileScenario(spec, 1 as ScenarioLevel);
    const raw = loadDistrict(spec.map.districtId);
    const tape = parseScenarioTrace(
      JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "shadow-correct.trace.json"), "utf-8")),
    )!;
    // Every look of the tape 7 ms after its recorded instant (the verifier's
    // «sh7»): presses off the grid.
    const trace = { ...tape, events: tape.events.map((e) => (e.kind.startsWith("glance-") ? { ...e, tSec: e.tSec + 0.007 } : e)) };
    const phoneB = LOOK_CADENCES.find(([n]) => n === "phone B")![1];
    const ref = run(lesson, raw, trace, [1 / 60]);
    const r = run(lesson, raw, trace, phoneB);
    expect(r.sheet, "phone B against 60 Hz").toBe(ref.sheet);
    expect(r.looks.heard.length).toBeGreaterThanOrEqual(ref.looks.heard.length);
    expect(ref.looks.heard.length).toBeGreaterThan(5);
    // The pin: from the press, on both cadences — and the census's whole
    // comparison passes this cell.
    expect(heardTooEarly(ref, [1 / 60]), "60 Hz").toBeNull();
    expect(heardTooEarly(r, phoneB), "phone B").toBeNull();
    const splits: string[] = [];
    compareToReference(`${spec.id}/shadow-correct.trace.json/L1 (looks +7 ms)`, "phone B", phoneB, r, ref, splits);
    expect(splits).toEqual([]);
    // Teeth — the bound is the truth, not slack: a look IS heard 30 points
    // before its 60 Hz point (look 5: 5578 against 5608) …
    let maxEarly = 0;
    for (let i = 0; i < ref.looks.heard.length; i++) maxEarly = Math.max(maxEarly, ref.looks.heard[i].k - r.looks.heard[i].k);
    expect(maxEarly, "points before the 60 Hz point (a bound from the 60 Hz point allows span - 1 = 29)").toBe(30);
    // … and the most a look leads its press here is within one step of the
    // bound (29.42 steps; the bound is < 30).
    let maxLead = 0;
    for (let i = 0; i < r.looks.heard.length; i++) maxLead = Math.max(maxLead, r.looks.taken[i].pressSec / FIXED_DT - r.looks.heard[i].k);
    expect(maxLead).toBeGreaterThan(29);
    expect(maxLead).toBeLessThan(30);
  }, 600_000);

  it("C-PINBOUND teeth — a press made just AFTER a long frame ended is taken by the NEXT frame: looks of sc-ed-d2-city-run's correct demo moved to 1 ms past the first grid point after a phone-B frame end are heard no earlier than that point, within the span of the frame that took them", () => {
    const spec = SCENARIO_TEMPLATES.find((sp) => sp.id === "sc-ed-d2-city-run")!;
    const lesson = compileScenario(spec, 1 as ScenarioLevel);
    const raw = loadDistrict(spec.map.districtId);
    const tape = parseScenarioTrace(
      JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "shadow-correct.trace.json"), "utf-8")),
    )!;
    const phoneB = LOOK_CADENCES.find(([n]) => n === "phone B")![1];
    // The session clock's frame ends on phone B (the replay's `t`: the sum of
    // the clamped deltas, 0.5 s ceiling included).
    const ends: number[] = [];
    for (let t = 0, i = 0; t < tape.meta.durationSec + 2; i++) {
      t += Math.max(0, Math.min(0.5, phoneB[i % phoneB.length]));
      ends.push(t);
    }
    // Each look → 1 ms past the first grid point after the last frame end
    // before it, where that instant lies inside the step after the frame end
    // (a latch reaching one step past a frame's end would hand it to the frame
    // that had already ended) and before the next frame ends.
    const moved = new Set<number>();
    const events = tape.events.map((e) => {
      if (!e.kind.startsWith("glance-") || e.tSec < ends[0]) return e;
      let j = 0;
      while (j + 1 < ends.length && ends[j + 1] <= e.tSec) j++;
      const fe = ends[j];
      const press = (Math.floor(fe / FIXED_DT + 1e-6) + 1) * FIXED_DT + 0.001;
      if (!(press <= fe + FIXED_DT - 1e-4 && j + 1 < ends.length && press < ends[j + 1] - 1e-4)) return e;
      moved.add(press);
      return { ...e, tSec: press };
    });
    const ordered = events
      .map((e, i) => [e, i] as const)
      .sort((x, y) => x[0].tSec - y[0].tSec || x[1] - y[1])
      .map((x) => x[0]);
    const r = run(lesson, raw, { ...tape, events: ordered }, phoneB);
    expect({ unheard: r.looks.unheard, heard: r.looks.heard.length }).toEqual({ unheard: 0, heard: r.looks.pressed });
    // Causality, directly: a look pressed after its frame's end is taken by
    // the next frame, whose first point is the first grid point after the end
    // — the press's own grid point. Never one before it.
    let checked = 0;
    for (let i = 0; i < r.looks.heard.length; i++) {
      const p = r.looks.taken[i].pressSec;
      if (!moved.has(p)) continue;
      checked++;
      expect(r.looks.heard[i].k, `look ${i} pressed at ${p.toFixed(4)} s (grid ${(p / FIXED_DT).toFixed(2)})`).toBeGreaterThanOrEqual(Math.floor(p / FIXED_DT + 1e-9));
    }
    expect(checked, "looks moved past a frame end").toBeGreaterThan(3);
    // …and the bound, per frame, holds on this tape.
    expect(heardTooEarly(r, phoneB)).toBeNull();
  }, 600_000);

  it("ROUND 8 — the replay hands looks over the product's way: per FRAME, through the cabin's queue and the grid's — a look written straight into a grid point's sample is not heard", () => {
    const spec = SCENARIO_TEMPLATES.find((sp) => sp.id === "sc-maneuver-3point")!;
    const lesson = compileScenario(spec, 1 as ScenarioLevel);
    const raw = loadDistrict(spec.map.districtId);
    const trace = parseScenarioTrace(
      JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "shadow-correct.trace.json"), "utf-8")),
    )!;
    const tapeLooks = trace.events.filter((e) => e.kind.startsWith("glance-"));
    expect(tapeLooks.length).toBeGreaterThanOrEqual(2);
    // 60 Hz: each look is taken out of the cabin by the frame that reaches its
    // press — frame n ends at n/60 s — and heard at that frame's grid point.
    const at60 = liveChainReplay({ lesson, districtRaw: raw, trace });
    // (The session ends before the tape does: the looks pressed after its last
    // tick are never reached.)
    expect(at60.looks.heard.length).toBeGreaterThanOrEqual(4);
    expect(at60.looks.heard.length).toBe(at60.looks.pressed);
    expect(at60.looks.heard.map((l) => l.kind)).toEqual(
      tapeLooks.slice(0, at60.looks.heard.length).map((e) => e.kind.slice("glance-".length)),
    );
    expect(at60.looks.taken.length).toBe(at60.looks.heard.length);
    let prevK = 0;
    let waited = 0;
    for (let i = 0; i < at60.looks.heard.length; i++) {
      // The frame that reached the press (a press at t = 0 is reached by frame
      // 1; two looks of one instant are taken by the same frame).
      const frame = Math.max(1, Math.round(at60.looks.taken[i].pressSec / FIXED_DT));
      expect(at60.looks.taken[i].frame, `look ${i}: the frame that took it`).toBe(frame);
      // Heard at that frame's grid point — or, behind a look still ahead of
      // it, at the next point: one look per grid point.
      const due = Math.max(frame, prevK + 1);
      if (due > frame) waited++;
      expect(at60.looks.heard[i].k, `look ${i}: the grid point that heard it`).toBe(due);
      prevK = due;
    }
    // This tape does press two looks at one instant (the pair the old replay
    // dropped the first of).
    expect(waited, "looks that waited one point behind another at 60 Hz").toBeGreaterThan(0);
    // 0.5 s frames: a frame takes the look in the frame that contains its
    // press — frame n covers ((n−1)·0.5, n·0.5] — and the grid hears it at that
    // frame's FIRST point (+1 per look ahead of it): the frame is the unit.
    const slow = liveChainReplay({ lesson, districtRaw: raw, trace, frameDeltas: [0.5] });
    // (A 0.5 s frame can reach — and hear — one more press before the point
    // the session ends on.)
    expect(slow.looks.heard.slice(0, at60.looks.heard.length).map((l) => l.kind)).toEqual(at60.looks.heard.map((l) => l.kind));
    expect(slow.looks.heard.length).toBe(slow.looks.pressed);
    prevK = 0;
    for (let i = 0; i < slow.looks.heard.length; i++) {
      const frame = slow.looks.taken[i].frame;
      expect(frame, `look ${i}: the 0.5 s frame containing its press`).toBe(Math.max(1, Math.ceil(slow.looks.taken[i].pressSec / 0.5 - 1e-6)));
      const due = Math.max((frame - 1) * 30 + 1, prevK + 1);
      expect(slow.looks.heard[i].k, `look ${i}: heard at its frame's first point, or right behind the look ahead of it`).toBe(due);
      prevK = due;
    }
  }, 600_000);

  it("ROUND 8 — the stated loss: a second look pressed on the very tick that ends the session is not graded — and the replay COUNTS it as unheard, on every cadence", () => {
    const spec = SCENARIO_TEMPLATES.find((sp) => sp.id === "sc-maneuver-3point")!;
    const lesson = compileScenario(spec, 1 as ScenarioLevel);
    const raw = loadDistrict(spec.map.districtId);
    const trace = parseScenarioTrace(
      JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "shadow-correct.trace.json"), "utf-8")),
    )!;
    // Where the session ends on this drive (it completes before the tape does).
    let endK = 0;
    const plain = liveChainReplay({
      lesson,
      districtRaw: raw,
      trace,
      afterApply: ({ t }) => {
        endK = Math.round(t / FIXED_DT);
      },
    });
    expect(plain.session.phase).toBe("completed");
    expect(endK * FIXED_DT).toBeLessThan(trace.meta.durationSec - 1);
    const before = plain.looks.heard.length;
    // The same drive, with two looks pressed on the grid point of that last tick.
    const tEnd = endK * FIXED_DT;
    const kept = trace.events.filter((e) => !e.kind.startsWith("glance-") || e.tSec < tEnd - 1e-9);
    const events = [...kept, { tSec: tEnd, kind: "glance-left" as const }, { tSec: tEnd, kind: "glance-right" as const }].sort(
      (x, y) => x.tSec - y.tSec,
    );
    for (const [name, fd] of LOOK_CADENCES) {
      const r = liveChainReplay({ lesson, districtRaw: raw, trace: { ...trace, events }, frameDeltas: fd });
      expect(r.session.phase, name).toBe("completed");
      const heardAtEnd = r.looks.heard.filter((l) => l.k === endK).map((l) => l.kind);
      // The frame that reaches the last tick hands both looks over; the tick
      // carries ONE; whatever is still waiting when the session ends is left
      // unheard — and is reported, not silently gone.
      expect(r.looks.droppedByCabin + r.looks.droppedByGrid, name).toBe(0);
      expect(r.looks.heard.length + r.looks.unheard, `${name}: every press is either heard or counted as unheard`).toBe(r.looks.pressed);
      if (name === "60 Hz") {
        expect(r.looks.pressed, name).toBe(before + 2);
        expect(heardAtEnd, name).toEqual(["left"]);
        expect(r.looks.unheard, `${name}: looks not graded because the session ended first`).toBe(1);
      }
      // …and it changes nothing that is graded: the sheet is that of the drive.
      expect(r.violationCodes, name).toEqual(plain.violationCodes);
      expect(r.result.passed, name).toBe(plain.result.passed);
    }
  }, 600_000);

  it.skipIf(FULL)("ROUND 8 — the rubric's observation moments are scored from an attempt trace fed on the grid: the same trace samples on 6 cadences, the same moments on every display of 60 Hz or faster", () => {
    const park = cellsOf([
      ["sc-park-perp-rev", "shadow-correct.trace.json", [1]],
      ["sc-park-perp-rev", "mistake-wide-approach.trace.json", [1]],
      ["sc-park-gap-short", "mistake-forward-hit.trace.json", [1]],
      ["sc-park-narrow", "mistake-wide-swing.trace.json", [1]],
    ]).filter((c) => !c.key.endsWith("(ambient off)"));
    expect(park.length).toBe(4);
    const splits: string[] = [];
    let scored = 0;
    for (const c of park) {
      const ref = run(c.lesson, c.raw, c.trace, LOOK_CADENCES[0][1]);
      if (ref.observed !== null) scored++;
      for (const [name, fd] of LOOK_CADENCES.slice(1)) {
        compareToReference(c.key, name, fd, run(c.lesson, c.raw, c.trace, fd), ref, splits);
      }
    }
    expect(scored, "cells whose observation moments are measured").toBe(4);
    expect(splits).toEqual([]);
  }, 14_400_000);

  it("sc-follow-distance tailgate L4: the lead gap the engine reads never saw-tooths open (120 Hz, 60 Hz ± 0.2 µs, 59.94 Hz)", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-follow-distance")!;
    const lesson = compileScenario(spec, 4 as ScenarioLevel);
    const raw = loadDistrict(spec.map.districtId);
    const trace = parseScenarioTrace(
      JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "traces", spec.id, "mistake-tailgate.trace.json"), "utf-8")),
    )!;
    const ref = run(lesson, raw, trace, [1 / 60]);
    // MEASURED at round 3 (its verifier): 627 of 1,257 frames at 120 Hz and
    // 313 of 630 at ± 0.2 µs read the gap «opening» at ≥ 0.5 m/s; 0 at 60 Hz.
    expect(ref.opening).toBe(0);
    for (const fd of [[1 / 120], [1 / 60 + 2e-7, 1 / 60 - 2e-7], [1 / 59.94]]) {
      const r = run(lesson, raw, trace, fd);
      expect({ opening: r.opening, points: r.points, stream: r.stream, sheet: r.sheet }).toEqual({
        opening: 0,
        points: ref.points,
        stream: ref.stream,
        sheet: ref.sheet,
      });
    }
  }, 600_000);
});
