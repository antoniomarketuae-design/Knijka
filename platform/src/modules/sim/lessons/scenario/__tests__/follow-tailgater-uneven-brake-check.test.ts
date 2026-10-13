/**
 * sc-follow-tailgater:63c0c28c clause C2a — AN UNEVEN BRAKE CHECK AS THE ЛЕПКА'S PASS COMES DUE, through the live
 * rung chain (lane tailbrake3, round 5, integrator decision 2026-10-12).
 *
 * WHAT ROUND 2 LEFT, MEASURED BY ITS VERIFIER. Round 2 held a due pass only on grid points whose reading was AT the
 * product's harsh line. On the verifier's own tapes 762 of 5,838 sub-floor brake checks still escaped: an emergency
 * stop that is UNEVEN — 9.3 m/s² dipping to 5.0–6.5 for 0.05–0.10 s, 8 ± 1.5 m/s² at 5 Hz, a release of one or two
 * grid points — let the pass go on the first reading under 7 m/s², the лепка still braking 4.6–5.1 m behind him. The
 * cruise law then accelerated it at 3.5 m/s², its hard brake (0.15–0.32 s at the line, up to 3.57 m/s shed) was cut
 * short of the 0.4 s sustain, nothing was reported, and the 35 км/ч floor acquitted the brake check: «ИЗДЪРЖАН» with
 * the unscoped «Чисто и спокойно каране». The same drives with the pass timer never due (pressureSec 90) report and
 * bill, every one. That is TTF25's mechanism (`follow-tailgater-rig-w3b-ttf25.test.ts`) on an uneven pedal.
 *
 * WHAT ROUND 3 LEFT, MEASURED BY ITS VERIFIER. Round 3 held the pass through the OPEN WINDOW of the product's harsh
 * step. That step RE-ANCHORS its window once it has been open for the sustain with a mean not over the line — while
 * the brake goes on — and reports the same brake from the next window (`rules/harshBrakeEpisode.ts`, «Open, or
 * re-anchor on this frame's own reading»). On the verifier's tapes 383 of 9,000 sub-floor brake checks escaped where
 * the re-anchor fell on a reading under the line: the лепка had been at the harsh line 0.05–0.217 s, had shed
 * 1.9–3.3 m/s and was still braking at 5.5–7.0 m/s² when its pass was commanded and the cruise law accelerated it;
 * «ИЗДЪРЖАН» with the unscoped praise, while the no-timer world reports the brake 0.83–1.03 s after the pedal and
 * bills every one. Two of those shapes are pinned BY NAME below: the builder's own lead-in + dip, and the verifier's
 * seeded random shape rand26, which has no lead-in at all.
 *
 * WHAT ROUND 4 LEFT, MEASURED BY ITS VERIFIER. Round 4 held the pass until the product step's RE-ARM, the лепка's
 * first reading under the braking line (2 m/s²) — «the released pedal». One such reading is not a released pedal. A
 * release of three grid points (0.05 s) in the middle of an emergency stop, or an ease to 1.9 m/s² for four, gives the
 * лепка one or two of them; the due pass began on that dip or on the timer's next grid point, and the cruise law
 * accelerated the car at 3.5 m/s² toward a student braking at 9.3 m/s² again. On the verifier's tapes 980 of 6,444
 * sub-floor brake checks escaped so (tap–release–slam 700 of 1,548; one emergency stop with a dip 234 of 1,296; seeded
 * random stops with releases 46 of 3,600): the лепка had been at the harsh line 0.017–0.283 s and had shed
 * 0.65–3.23 m/s; «ИЗДЪРЖАН» with the unscoped praise, while the no-timer world reports the brake 0.57–1.10 s after the
 * pedal and bills every one. Five of those shapes are pinned BY NAME below.
 *
 * THE RULE PINNED HERE. A due pass is held from the лепка's FIRST reading at the harsh line until the product's step
 * REPORTS its hard brake, or that brake is OVER — its reading has stayed under the braking line for the product's own
 * sustain (0.4 s) — through any reading under the harsh line, through any re-anchor and through any shorter release
 * (`RearTailgaterRunner.ownHardBrakeHoldsThePass`; the rule itself, with each thing that ends a hold and how long a
 * hold can last, is pinned on a scripted port in `orchestrator/__tests__/tailgater-pass-hold.test.ts`). What this
 * file pins is what that does to the LESSON'S SHEET:
 *   · every uneven brake check under the floor that the no-timer world bills, with the лепка at the harsh line
 *     before its pass came due, is billed here — on the same report, at the same time;
 *   · NOTHING is billed here that the no-timer world does not bill: until its pass is commanded the лепка is under
 *     the very law it is under when the timer never comes due;
 *   · what stays unbilled is the decided F2 class and only it: the pedal came so late before the timer (or after
 *     it) that the лепка had not been at the harsh line when its pass began. Its width is pinned as measured.
 *
 * THE TAPES are this file's own: a kinematic student on ln-v1's northbound right lane, one sample per 1/60 s grid
 * point, the pedal keyed to a grid point counted back from the one on which the лепка's pass is commanded when he
 * does not brake at all. THE ORACLE for what the лепка did is computed here from the speed and lateral offset the
 * traffic system publishes — never from the runner.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import type { LessonSpec, StagedEventSpec } from "../../../contracts";
import type { ScenarioTrace, TraceEvent, TraceSample } from "../../../traces/types";

const REPO_ROOT = path.join(process.cwd(), "..");
const LN = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
const TAIL_ID = "sc-ftg-tail";
const G = 1 / 60;
const HARSH = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
const SUSTAIN = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
const FLOOR_KMH = DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh;
const TIMEOUT = 900_000;
/** The rig's TTF25 speed, км/ч — 10.5 under the floor. */
const HOLD_KMH = 24.5;

/**
 * The student, one sample per grid point: at rest for 1 s, away at 1.95 m/s² to 45.9 км/ч, a look in the rear
 * mirror at y 100, easing at 1 m/s² from y 125 to `HOLD_KMH`, and at `pedalT` (null: never) the brake under test —
 * `law(seconds since the pedal)` m/s² until he stands; then 1.5 s at rest, away again and a gentle stop at y 345.
 */
function tape(pedalT: number | null, law: (sinceSec: number) => number): ScenarioTrace {
  const SUB = 10;
  const h = G / SUB;
  const cruise = 45.9 / 3.6;
  const hold = HOLD_KMH / 3.6;
  let y = 15;
  let v = 0;
  let phase: "wait" | "launch" | "ease" | "hold" | "brake" | "rest" | "off" | "stop" | "done" = "wait";
  let restUntil = 0;
  let braking = false;
  let looked = false;
  const samples: TraceSample[] = [];
  const events: TraceEvent[] = [];
  for (let n = 0; n < 60 * 200 * SUB && phase !== "done"; n++) {
    const t = n * h;
    if (n % SUB === 0) {
      samples.push({
        tSec: n / SUB / 60,
        x: 12.19,
        y,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: v * 3.6,
        gear: v * 3.6 > 30 ? 3 : v * 3.6 > 15 ? 2 : 1,
        indicator: "off",
        brakeOn: braking,
        throttleOn: !braking && v > 0,
      });
    }
    if (!looked && y >= 100) {
      events.push({ tSec: Math.round(t * 60) / 60, kind: "glance-rear" });
      looked = true;
    }
    if (pedalT !== null && t >= pedalT - 1e-9 && (phase === "launch" || phase === "ease" || phase === "hold")) phase = "brake";
    let a = 0;
    braking = false;
    if (phase === "wait") {
      if (t >= 1) phase = "launch";
    } else if (phase === "launch") {
      a = v < cruise ? 1.95 : 0;
      if (y >= 125) phase = "ease";
    } else if (phase === "ease") {
      a = v > hold ? -1 : 0;
      if (v <= hold) {
        v = hold;
        phase = "hold";
      }
    } else if (phase === "hold") {
      if (pedalT === null && y >= 300) phase = "stop";
    } else if (phase === "brake") {
      a = -law(t - pedalT!);
      braking = a < 0;
      if (a < 0 && v + a * h <= 0) {
        v = 0;
        a = 0;
        phase = "rest";
        restUntil = t + 1.5;
      }
    } else if (phase === "rest") {
      braking = true;
      if (t >= restUntil) phase = "off";
    } else if (phase === "off") {
      a = v < 39.9 / 3.6 ? 1.95 : 0;
      if (v > 0 && 345 - y <= (v * v) / 4) phase = "stop";
    } else if (phase === "stop") {
      braking = true;
      a = -2;
      if (v + a * h <= 0) {
        v = 0;
        a = 0;
        phase = "done";
      }
    }
    const v0 = v;
    v = Math.max(0, v + a * h);
    if (phase === "launch" && v > cruise) v = cruise;
    y += ((v0 + v) / 2) * h;
  }
  const last = samples[samples.length - 1]!;
  for (let j = 1; j <= 60; j++) samples.push({ ...last, tSec: last.tSec + j / 60, speedKmh: 0, brakeOn: true, throttleOn: false });
  return {
    meta: { scenarioId: SC_FOLLOW_TAILGATER.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1]!.tSec },
    samples,
    events,
  };
}

/** An emergency stop that is uneven: deceleration by seconds since the pedal, m/s². The round-2 verifier's shapes. */
const SHAPES: Array<[string, (dt: number) => number]> = [
  ["9.3 m/s² dipping to 6.0 for 0.10 s", (dt) => (dt >= 0.2 && dt < 0.3 ? 6.0 : 9.3)],
  ["9.3 m/s² dipping to 5.0 for 0.07 s", (dt) => (dt >= 0.25 && dt < 0.25 + 4 * G ? 5.0 : 9.3)],
  ["9.3 m/s² dipping to 6.5 for 0.05 s", (dt) => (dt >= 0.15 && dt < 0.2 ? 6.5 : 9.3)],
  ["8 ± 1.5 m/s² at 5 Hz", (dt) => 8 + 1.5 * Math.sin(2 * Math.PI * 5 * dt)],
  ["full pedal released for one grid point every 0.35 s", (dt) => (dt % (0.35 + G) < 0.35 ? 9.3 : 0)],
  ["full pedal released for two grid points every 0.35 s", (dt) => (dt % (0.35 + 2 * G) < 0.35 ? 9.3 : 0)],
  ["full pedal released for two grid points every 0.25 s", (dt) => (dt % (0.25 + 2 * G) < 0.25 ? 9.3 : 0)],
];
/** The steady full pedal, for the control rows. */
const STEADY = (): number => 9.3;

interface Drive {
  out: LiveReplayOutcome;
  reportsAt: number[];
  billedAt: number | null;
  charged: boolean;
  /** The grid point the лепка's pass was commanded on (the one before it first left its lane line); null: never. */
  passCmdT: number | null;
  /** ORACLE, from its published speed: grid points from the pedal up to its pass command with its reading (its speed
   *  change over three grid points, the product's reading window) at the harsh line. */
  atLineBeforePass: number;
  /** Its reading on the grid point its pass was commanded, m/s². */
  readingAtPassCmd: number | null;
  /** Its reading on the grid point `refCmdT` (the pass command of the drive where he never brakes), m/s². */
  readingAtRefCmd: number | null;
  /** Grid points from the pedal up to `refCmdT` with its reading at the harsh line. */
  atLineBeforeRefCmd: number;
  /** Its strongest gain of speed over one grid point from the pedal to its report (or to its pass command), m/s². */
  maxAccelBeforeRelease: number;
  onsetKmh: number | null;
}

function lessonFor(level: ScenarioLevel, noTimer: boolean): LessonSpec {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, level);
  if (!noTimer) return lesson;
  // THE NO-TIMER WORLD: the same lesson with the pass timer never due.
  return {
    ...lesson,
    stagedEvents: ((lesson.stagedEvents ?? []) as StagedEventSpec[]).map((s) => (s.kind === "rearTailgater" ? { ...s, pressureSec: 90 } : s)),
  } as LessonSpec;
}

function drive(level: ScenarioLevel, trace: ScenarioTrace, pedalT: number | null, refCmdT: number | null, noTimer = false): Drive {
  const T: number[] = [];
  const fv: number[] = [];
  const lat: number[] = [];
  const sv: number[] = [];
  const reportsAt: number[] = [];
  const out = liveChainReplay({
    lesson: lessonFor(level, noTimer),
    districtRaw: LN,
    trace,
    afterApply: ({ t, tick, traffic }) => {
      for (const e of tick.events) if (e.kind === "followerBraked") reportsAt.push(t);
      const a = traffic.staged(TAIL_ID);
      if (!a) return;
      T.push(t);
      fv.push(a.speedMps);
      lat.push(a.lateralOffsetM ?? 0);
      sv.push(tick.speedKmh);
    },
  });
  const bills = [
    ...(out.result.coachedMistakes ?? []).filter((c) => c.code === "HARSH_BRAKING_NO_CAUSE").map((c) => ({ t: c.t, charged: false })),
    ...out.session.events
      .filter((e) => e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE")
      .map((e) => ({ t: (e as { t: number }).t, charged: true })),
  ];
  const iPass = lat.findIndex((x) => Math.abs(x) > 1e-6);
  const iCmd = iPass < 0 ? null : iPass - 1;
  const reading = (i: number) => (i >= 3 ? (fv[i - 3]! - fv[i]!) / (T[i]! - T[i - 3]!) : 0);
  const idx = (t: number | null) => (t === null ? -1 : T.findIndex((x) => x >= t - 1e-9));
  const iPedal = idx(pedalT);
  const iRef = idx(refCmdT);
  const countAtLine = (to: number | null) => {
    if (iPedal < 0 || to === null || to < 0) return 0;
    let n = 0;
    for (let i = iPedal; i <= to; i++) if (reading(i) >= HARSH) n++;
    return n;
  };
  let maxAccel = 0;
  if (iPedal >= 0) {
    const iEnd = reportsAt.length > 0 ? idx(reportsAt[0]!) : (iCmd ?? iPedal);
    for (let i = iPedal + 1; i <= iEnd; i++) maxAccel = Math.max(maxAccel, (fv[i]! - fv[i - 1]!) / (T[i]! - T[i - 1]!));
  }
  return {
    out,
    reportsAt,
    billedAt: bills.length > 0 ? Math.min(...bills.map((b) => b.t)) : null,
    charged: bills.some((b) => b.charged),
    passCmdT: iCmd === null ? null : T[iCmd]!,
    atLineBeforePass: countAtLine(iCmd),
    readingAtPassCmd: iCmd === null ? null : reading(iCmd),
    readingAtRefCmd: iRef < 0 ? null : reading(iRef),
    atLineBeforeRefCmd: countAtLine(iRef < 0 ? null : iRef),
    maxAccelBeforeRelease: maxAccel,
    onsetKmh: iPedal < 0 ? null : sv[iPedal]!,
  };
}

describe("sc-follow-tailgater · an UNEVEN brake check under the floor as the лепка's pass comes due: held while the лепка's hard brake is not over and not reported, billed as the no-timer world bills it (63c0c28c C2a, round 5)", () => {
  /** Per rung: the grid point the pass is commanded on when he never brakes. */
  const refCmd = new Map<ScenarioLevel, number>();
  const ref = (L: ScenarioLevel): number => {
    if (!refCmd.has(L)) refCmd.set(L, drive(L, tape(null, STEADY), null, null).passCmdT!);
    return refCmd.get(L)!;
  };
  const pedalAt = (L: ScenarioLevel, k: number) => Math.round((ref(L) + k * G) * 60) / 60;
  const cell = (L: ScenarioLevel, law: (dt: number) => number, k: number) => {
    const pedalT = pedalAt(L, k);
    const tr = tape(pedalT, law);
    return { pedalT, tree: drive(L, tr, pedalT, ref(L)), noTimer: drive(L, tr, pedalT, ref(L), true) };
  };

  it(
    "the timeline: left alone at 24.5 км/ч the лепка's pass is commanded once on every rung tested, and nothing is reported or billed",
    () => {
      for (const L of [1, 3, 4] as ScenarioLevel[]) {
        const d = drive(L, tape(null, STEADY), null, null);
        expect(d.passCmdT, `L${L}`).not.toBeNull();
        expect(d.passCmdT!, `L${L}`).toBeGreaterThan(15);
        expect(d.reportsAt, `L${L}`).toEqual([]);
        expect(d.billedAt, `L${L}`).toBeNull();
      }
    },
    TIMEOUT,
  );

  it(
    "L3, every shape, the pedal on each of the 24 grid points before the timer (0.4 s): nothing is billed that the no-timer world does not bill; every brake check it bills with the лепка at the harsh line before the timer is billed here on the same report; what stays unbilled had the лепка not yet at the line",
    () => {
      const L = 3 as ScenarioLevel;
      const bad: string[] = [];
      const perShape: Record<string, { n: number; billed: number; noTimerBilled: number; dipAtDue: number; unbilledK: number[]; longestHold: number }> = {};
      for (const [name, law] of SHAPES) {
        const S = (perShape[name] = { n: 0, billed: 0, noTimerBilled: 0, dipAtDue: 0, unbilledK: [] as number[], longestHold: 0 });
        for (let k = -24; k <= -1; k++) {
          const { pedalT, tree, noTimer } = cell(L, law, k);
          const label = `${name} · pedal ${k}`;
          S.n++;
          if (tree.onsetKmh === null || !(tree.onsetKmh < FLOOR_KMH)) bad.push(`${label}: onset ${tree.onsetKmh} is not under the floor`);
          if (noTimer.passCmdT !== null && noTimer.passCmdT < pedalT + 4) bad.push(`${label}: the no-timer world passed`);
          if (tree.passCmdT === null) {
            bad.push(`${label}: the pass never began`);
            continue;
          }
          if (tree.passCmdT < ref(L) - 1e-9) bad.push(`${label}: pass before it was due`);
          S.longestHold = Math.max(S.longestHold, tree.passCmdT - ref(L));
          // NEVER MORE THAN THE NO-TIMER WORLD.
          if (tree.billedAt !== null && noTimer.billedAt === null) bad.push(`${label}: billed here, not in the no-timer world`);
          if (tree.reportsAt.length > 1) bad.push(`${label}: ${tree.reportsAt.length} reports`);
          if (tree.reportsAt.length === 1 && tree.reportsAt[0] !== noTimer.reportsAt[0]) bad.push(`${label}: report at ${tree.reportsAt[0]}, the no-timer world's at ${noTimer.reportsAt[0]}`);
          if ((tree.billedAt !== null) !== (tree.reportsAt.length === 1)) bad.push(`${label}: billed ${tree.billedAt}, reports ${tree.reportsAt.length}`);
          if (noTimer.billedAt !== null) S.noTimerBilled++;
          if (tree.billedAt !== null) {
            S.billed++;
            if (tree.billedAt !== noTimer.billedAt) bad.push(`${label}: billed at ${tree.billedAt}, the no-timer world at ${noTimer.billedAt}`);
            // The pass begins on the report, never before it, and the лепка was never handed to the cruise law
            // first: that law accelerates it at 3.5 m/s²; under matchPlayer, across his one- or two-grid-point
            // release, it holds its speed to within a few cm/s² (measured: 0.01 m/s²).
            if (tree.passCmdT < tree.reportsAt[0]! - 1e-9) bad.push(`${label}: pass at ${tree.passCmdT} before its report at ${tree.reportsAt[0]}`);
            if (tree.maxAccelBeforeRelease > 0.1) bad.push(`${label}: the лепка accelerated (${tree.maxAccelBeforeRelease.toFixed(2)} m/s²) before its report`);
            if (tree.out.result.passed) bad.push(`${label}: billed and still «издържан» at L3`);
            if (tree.out.commendationCodes.includes("CLEAN_DRIVING")) bad.push(`${label}: billed and praised`);
            if (tree.charged) bad.push(`${label}: charged at L3 (a coached rung)`);
            // THE ROUND-2 ESCAPE'S OWN SHAPE: on the grid point the timer came due the лепка's reading was under
            // the harsh line, still braking, after it had been at the line.
            if (tree.readingAtRefCmd! < HARSH && tree.atLineBeforeRefCmd > 0) S.dipAtDue++;
          } else if (noTimer.billedAt !== null) {
            // UNBILLED THOUGH THE NO-TIMER WORLD BILLS — only the decided F2 class.
            S.unbilledK.push(k);
            if (tree.atLineBeforePass > 0) bad.push(`${label}: unbilled although the лепка had been at the harsh line ${tree.atLineBeforePass} grid point(s) before its pass`);
            if (tree.passCmdT > ref(L) + 1e-9) bad.push(`${label}: unbilled although its pass was held`);
          }
        }
      }
      expect(bad).toEqual([]);
      for (const [name, S] of Object.entries(perShape)) {
        // The no-timer world bills every one of these brake checks (they are emergency stops)…
        expect(S.noTimerBilled, name).toBe(S.n);
        // …and what is not billed here is the pedal in the last 0.05 s before the timer, no wider.
        expect(S.unbilledK.every((k) => k >= -3), `${name}: unbilled at ${S.unbilledK}`).toBe(true);
        expect(S.billed, name).toBeGreaterThanOrEqual(21);
        // The escape's own shape is in the sweep for this shape — the timer due on a dip — and it bills.
        expect(S.dipAtDue, name).toBeGreaterThanOrEqual(1);
        // No hold outlasts the sustain plus the shape's own dips.
        expect(S.longestHold, name).toBeLessThan(SUSTAIN + 0.2);
      }
    },
    TIMEOUT,
  );

  it(
    "the same on the rungs either side — L1 (coached) and L4 (the exam rung, charged): a pedal 0.13, 0.2 and 0.3 s before the timer is billed for every shape, on the no-timer world's report; at L4 the bill is the charged основна",
    () => {
      for (const L of [1, 4] as ScenarioLevel[]) {
        for (const [name, law] of SHAPES) {
          for (const k of [-18, -12, -8]) {
            const { tree, noTimer } = cell(L, law, k);
            const label = `L${L} · ${name} · pedal ${k}`;
            expect(noTimer.billedAt, label).not.toBeNull();
            expect(tree.reportsAt, label).toEqual(noTimer.reportsAt);
            expect(tree.reportsAt, label).toHaveLength(1);
            expect(tree.billedAt, label).toBe(noTimer.billedAt);
            expect(tree.charged, label).toBe(L === 4);
            expect(tree.passCmdT!, label).toBeGreaterThanOrEqual(tree.reportsAt[0]! - 1e-9);
            expect(tree.out.commendationCodes, label).not.toContain("CLEAN_DRIVING");
            // The sheet is the no-timer world's sheet for this mistake.
            expect((tree.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`), label).toEqual(
              (noTimer.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`),
            );
            if (L === 1) expect(tree.out.result.passed, label).toBe(false);
          }
        }
      }
    },
    TIMEOUT,
  );

  /**
   * The round-3 verifier's seeded random uneven emergency stops — its probe's own generator (seed 12345): a rise of
   * 0–0.4 s (linear, or a firm plateau of 3–5.5 m/s²), then a level redrawn every 2–5 grid points from 5.5–10 m/s².
   * Shape 26 is its «rand26» (a 0.033 s rise to 9.6 m/s², 6.0–7.5 m/s² for 0.4 s, then 8.9), shape 32 its «rand32»
   * (a 0.1 s rise to 6.7 m/s², then 5.9–8.5 m/s²).
   */
  const verifierRandomShape = (index: number): ((dt: number) => number) => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let shape: (dt: number) => number = () => 0;
    for (let i = 0; i <= index; i++) {
      const rise = Math.round(rnd() * 24) / 60;
      const plateau = rnd() < 0.5 ? 3 + rnd() * 2.5 : null;
      const segs: Array<[number, number]> = [];
      let t = rise;
      while (t < 3) {
        const len = (2 + Math.floor(rnd() * 4)) / 60;
        segs.push([t + len, 5.5 + rnd() * 4.5]);
        t += len;
      }
      shape = (dt) => {
        if (dt < rise - 1e-9) return plateau === null ? (segs[0]![1] * dt) / Math.max(rise, 1e-6) : plateau;
        for (const [end, a] of segs) if (dt < end - 1e-9) return a;
        return 9;
      };
    }
    return shape;
  };
  /**
   * ROUND 3'S ESCAPES, BY NAME. `lateK` — the first pedal grid point, counted from the timer, at which the лепка has
   * not been at the harsh line when its pass comes due (the decided F2 class for this shape: its own rise);
   * `namedK` — the cell pinned by name; `engineTieFree` — on this file's tape every report of this shape is billed.
   *
   * NOT THIS LANE'S, AND NOT HIDDEN: on this file's tape rand26 has pedal times at which the лепка's report is out and
   * the ENGINE bills nothing — he comes to rest on the grid point his own brake's accrual would reach the sustain, and
   * the engine's ledger of HIS brake does not call it harsh (rules/engine.ts; the round-3 verifier's condition C2,
   * filed on its own). It is the same in the no-timer world, cell for cell, so those cells are held to the no-timer
   * world's sheet here and their number is not pinned. The verifier's own example cell (the pedal 29 grid points
   * before the timer, billed on its tape) is one of them on this tape; the cell named below is two grid points later.
   */
  const ESCAPES: Array<{ name: string; law: (dt: number) => number; lateK: number; namedK: number; engineTieFree: boolean }> = [
    {
      // The builder's search shape «lead4/0.25+dip6@0.383» (lane tailbrake3 round 3: 14 of its 49 pedal times escaped).
      name: "THE BUILDER'S LEAD-IN + DIP (4 m/s² for 0.25 s, then 9.3 with a dip to 6.0 for 0.1 s from 0.383 s)",
      law: (dt) => (dt < 0.25 - 1e-9 ? 4 : dt >= 23 * G - 1e-9 && dt < 29 * G - 1e-9 ? 6.0 : 9.3),
      lateK: -16,
      namedK: -24,
      engineTieFree: true,
    },
    {
      // The round-3 verifier's «rand26/ramp0.033» (26 of its 36 pedal times escaped on its tape; in its example round 3
      // commanded the pass 0.483 s after the pedal on a reading of 6.43 m/s²).
      name: "THE VERIFIER'S SEEDED RANDOM SHAPE rand26 (no lead-in: 9.6 m/s², 6.0–7.5 for 0.4 s, then 8.9)",
      law: verifierRandomShape(26),
      lateK: -3,
      namedK: -27,
      engineTieFree: false,
    },
    {
      // The round-3 verifier's «rand32/ramp0.100» (17 of its 36 pedal times escaped on its tape).
      name: "THE VERIFIER'S SEEDED RANDOM SHAPE rand32 (a 0.1 s rise to 6.7 m/s², then 5.9–8.5)",
      law: verifierRandomShape(32),
      lateK: -13,
      namedK: -20,
      engineTieFree: true,
    },
  ];

  it(
    "ROUND 3'S ESCAPES, BY NAME — L3, the pedal on each of the 36 grid points before the timer (0.6 s): the pass is held THROUGH the product step's re-anchor, every brake check the no-timer world bills with the лепка at the harsh line before its pass is billed here on the same report at the same time, and nothing is billed that the no-timer world does not bill",
    () => {
      const L = 3 as ScenarioLevel;
      for (const E of ESCAPES) {
        const bad: string[] = [];
        let billed = 0;
        let reported = 0;
        let noTimerReported = 0;
        let longestHold = 0;
        const unbilledK: number[] = [];
        for (let k = -36; k <= -1; k++) {
          const { pedalT, tree, noTimer } = cell(L, E.law, k);
          const label = `${E.name} · pedal ${k}`;
          if (tree.onsetKmh === null || !(tree.onsetKmh < FLOOR_KMH)) bad.push(`${label}: onset ${tree.onsetKmh} is not under the floor`);
          if (noTimer.passCmdT !== null && noTimer.passCmdT < pedalT + 4) bad.push(`${label}: the no-timer world passed`);
          if (tree.passCmdT === null) {
            bad.push(`${label}: the pass never began`);
            continue;
          }
          if (tree.passCmdT < ref(L) - 1e-9) bad.push(`${label}: pass before it was due`);
          longestHold = Math.max(longestHold, tree.passCmdT - ref(L));
          // NEVER MORE THAN THE NO-TIMER WORLD.
          if (tree.billedAt !== null && noTimer.billedAt === null) bad.push(`${label}: billed here, not in the no-timer world`);
          if (tree.reportsAt.length > 1) bad.push(`${label}: ${tree.reportsAt.length} reports`);
          if (tree.reportsAt.length === 1 && tree.reportsAt[0] !== noTimer.reportsAt[0]) bad.push(`${label}: report at ${tree.reportsAt[0]}, the no-timer world's at ${noTimer.reportsAt[0]}`);
          if (tree.billedAt !== null && tree.reportsAt.length !== 1) bad.push(`${label}: billed ${tree.billedAt} without a report`);
          if (noTimer.reportsAt.length > 0) noTimerReported++;
          if (tree.reportsAt.length === 1) {
            reported++;
            // THE SHEET IS THE NO-TIMER WORLD'S: the same bill at the same time (or, where the engine's own ledger
            // does not call his brake harsh — see ESCAPES — none in either).
            if (tree.billedAt !== noTimer.billedAt) bad.push(`${label}: billed at ${tree.billedAt}, the no-timer world at ${noTimer.billedAt}`);
            if (E.engineTieFree && tree.billedAt === null) bad.push(`${label}: reported and not billed`);
          }
          if (tree.billedAt !== null) {
            billed++;
            // The pass begins on the report, never before it, and the лепка was never handed to the cruise law first.
            if (tree.passCmdT < tree.reportsAt[0]! - 1e-9) bad.push(`${label}: pass at ${tree.passCmdT} before its report at ${tree.reportsAt[0]}`);
            if (tree.maxAccelBeforeRelease > 0.1) bad.push(`${label}: the лепка accelerated (${tree.maxAccelBeforeRelease.toFixed(2)} m/s²) before its report`);
            if (tree.out.result.passed) bad.push(`${label}: billed and still «издържан» at L3`);
            if (tree.out.commendationCodes.includes("CLEAN_DRIVING")) bad.push(`${label}: billed and praised`);
            if (tree.charged) bad.push(`${label}: charged at L3 (a coached rung)`);
          }
          if (tree.reportsAt.length === 0 && noTimer.reportsAt.length > 0) {
            // UNREPORTED THOUGH THE NO-TIMER WORLD REPORTS — only the decided F2 class.
            unbilledK.push(k);
            if (tree.atLineBeforePass > 0) bad.push(`${label}: unreported although the лепка had been at the harsh line ${tree.atLineBeforePass} grid point(s) before its pass`);
            if (tree.passCmdT > ref(L) + 1e-9) bad.push(`${label}: unreported although its pass was held`);
          }
        }
        expect(bad, E.name).toEqual([]);
        // The no-timer world's лепка reports every one of these brake checks…
        expect(noTimerReported, E.name).toBe(36);
        // …and what is not reported here is the pedal too late for the лепка to have been at the line: this shape's own rise.
        expect(unbilledK.every((k) => k >= E.lateK), `${E.name}: unreported at ${unbilledK}`).toBe(true);
        expect(reported, E.name).toBe(36 - unbilledK.length);
        expect(reported, E.name).toBeGreaterThanOrEqual(36 + E.lateK);
        if (E.engineTieFree) expect(billed, E.name).toBe(reported);
        expect(billed, E.name).toBeGreaterThanOrEqual(10);
        // The hold ends with the report of the window AFTER the re-anchor: longer than the sustain, and bounded.
        expect(longestHold, E.name).toBeGreaterThan(SUSTAIN);
        expect(longestHold, E.name).toBeLessThan(2 * SUSTAIN + 0.2);
      }
    },
    TIMEOUT,
  );

  it(
    "…and one cell of each BY NAME: ONE report 0.8–1.05 s after the pedal — the no-timer world's, on its grid point — coached there or on the next grid point as the lesson's own mistake, not «издържан», no «Чисто и спокойно каране»; the pass was commanded on the report (round 3 commanded it 0.4–0.45 s earlier, the лепка still braking at 6–7 m/s²), and the лепка never sped up at him before it",
    () => {
      const L = 3 as ScenarioLevel;
      for (const E of ESCAPES) {
        const { pedalT, tree, noTimer } = cell(L, E.law, E.namedK);
        const label = `${E.name} · pedal ${E.namedK}`;
        expect(tree.onsetKmh!, label).toBeLessThan(FLOOR_KMH);
        expect(tree.reportsAt, label).toHaveLength(1);
        expect(tree.reportsAt, label).toEqual(noTimer.reportsAt);
        expect(tree.reportsAt[0]! - pedalT, label).toBeGreaterThan(0.8);
        expect(tree.reportsAt[0]! - pedalT, label).toBeLessThan(1.05);
        expect(tree.billedAt, label).not.toBeNull();
        expect(tree.billedAt, label).toBe(noTimer.billedAt);
        expect(tree.billedAt! - tree.reportsAt[0]!, label).toBeGreaterThan(-1e-9);
        expect(tree.billedAt! - tree.reportsAt[0]!, label).toBeLessThan(G + 1e-9);
        expect(tree.charged, label).toBe(false);
        expect((tree.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`), label).toEqual(["HARSH_BRAKING_NO_CAUSE:false"]);
        expect(tree.out.result.passed, label).toBe(false);
        expect(tree.out.commendationCodes, label).not.toContain("CLEAN_DRIVING");
        // The pass: commanded on the report's grid point, later than the sustain after the timer came due.
        expect(tree.passCmdT!, label).toBeCloseTo(tree.reportsAt[0]!, 9);
        expect(tree.passCmdT! - ref(L), label).toBeGreaterThan(SUSTAIN);
        expect(tree.atLineBeforeRefCmd, label).toBeGreaterThan(0);
        expect(tree.maxAccelBeforeRelease, label).toBeLessThanOrEqual(0.1);
      }
    },
    TIMEOUT,
  );

  /**
   * The round-4 verifier's seeded random stops WITH RELEASES — its probe's own generator (seed 424242): a linear rise
   * of 0–0.4 s to 9 m/s², then a level redrawn every 2–6 grid points: 15 % a release (0–1.9 m/s²), 15 % a firm 2–5.5,
   * the rest 5.5–10. Shape 92 is its «rr92» (a 0.05 s rise, 8.5–9.2 m/s² to 0.333 s, 0.46 m/s² for four grid points,
   * then 9.1 again).
   */
  const verifierRandomShapeWithReleases = (index: number): ((dt: number) => number) => {
    let seed = 424242;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let shape: (dt: number) => number = () => 0;
    for (let i = 0; i <= index; i++) {
      const rise = Math.round(rnd() * 24) / 60;
      const segs: Array<[number, number]> = [];
      let t = rise;
      while (t < 3) {
        const len = (2 + Math.floor(rnd() * 5)) / 60;
        const u = rnd();
        segs.push([t + len, u < 0.15 ? rnd() * 1.9 : u < 0.3 ? 2 + rnd() * 3.5 : 5.5 + rnd() * 4.5]);
        t += len;
      }
      shape = (dt) => {
        if (dt < rise - 1e-9) return (9 * dt) / Math.max(rise, 1e-6);
        for (const [end, a] of segs) if (dt < end - 1e-9) return a;
        return 9;
      };
    }
    return shape;
  };
  /**
   * ROUND 4'S ESCAPES, BY NAME — each is an emergency stop with a release or an ease SHORTER THAN THE SUSTAIN in it.
   * `namedK` is a pedal time the round-4 verifier measured as an escape on its tape («ИЗДЪРЖАН» with the unscoped
   * praise; the no-timer world billed it); `lateK` — the first pedal grid point, counted from the timer, at which the
   * лепка has not been at the harsh line when its pass comes due (the decided F2 class: the shape's own rise).
   */
  const RELEASES: Array<{ name: string; law: (dt: number) => number; lateK: number; namedK: number }> = [
    {
      // The verifier's «on0.15/off0.050/on» — its frame-by-frame example: the pass was commanded 0.233 s after the
      // pedal on a reading of 5.91 m/s², one grid point after the лепка's one reading under 2.
      name: "TAP – RELEASE – SLAM (full pedal for 0.15 s, off for 0.05 s, full pedal)",
      law: (dt) => (dt < 0.15 - 1e-9 ? 9.3 : dt < 0.2 - 1e-9 ? 0 : 9.3),
      lateK: -3,
      namedK: -14,
    },
    {
      // The verifier's «on0.25/off0.200/on»: the pass was commanded while he was off the pedal.
      name: "TAP – 0.2 s OFF THE PEDAL – SLAM (full pedal for 0.25 s, off for 0.2 s, full pedal)",
      law: (dt) => (dt < 0.25 - 1e-9 ? 9.3 : dt < 0.45 - 1e-9 ? 0 : 9.3),
      lateK: -3,
      namedK: -20,
    },
    {
      // The verifier's «dip0x3@0.2»: one emergency stop with a release of three grid points.
      name: "THE DIP (full pedal with a three-grid-point release at 0.2 s)",
      law: (dt) => (dt >= 0.2 - 1e-9 && dt < 0.2 + 3 * G - 1e-9 ? 0 : 9.3),
      lateK: -3,
      namedK: -12,
    },
    {
      // The verifier's «on0.25/ease1.9x0.1/on»: his pedal never came off.
      name: "THE EASE, PEDAL NEVER OFF (full pedal, 1.9 m/s² from 0.25 s to 0.35 s, full pedal)",
      law: (dt) => (dt >= 0.25 - 1e-9 && dt < 0.35 - 1e-9 ? 1.9 : 9.3),
      lateK: -3,
      namedK: -14,
    },
    {
      // The verifier's «rr92/ramp0.050»: 22 of its 36 pedal times escaped on its tape.
      name: "THE VERIFIER'S SEEDED RANDOM STOP WITH A RELEASE rr92",
      law: verifierRandomShapeWithReleases(92),
      lateK: -4,
      namedK: -14,
    },
  ];

  it(
    "ROUND 4'S ESCAPES, BY NAME — L3, the pedal on each of the 36 grid points before the timer (0.6 s): the pass is held THROUGH the лепка's reading under the braking line (a release or an ease shorter than the sustain is a dip, not the end of its brake); every brake check the no-timer world reports with the лепка at the harsh line before its pass is reported here on the same grid point and billed as that world bills it, and nothing is billed that the no-timer world does not bill",
    () => {
      const L = 3 as ScenarioLevel;
      for (const E of RELEASES) {
        const bad: string[] = [];
        let billed = 0;
        let reported = 0;
        let noTimerReported = 0;
        let longestHold = 0;
        const unreportedK: number[] = [];
        for (let k = -36; k <= -1; k++) {
          const { pedalT, tree, noTimer } = cell(L, E.law, k);
          const label = `${E.name} · pedal ${k}`;
          if (tree.onsetKmh === null || !(tree.onsetKmh < FLOOR_KMH)) bad.push(`${label}: onset ${tree.onsetKmh} is not under the floor`);
          if (noTimer.passCmdT !== null && noTimer.passCmdT < pedalT + 4) bad.push(`${label}: the no-timer world passed`);
          if (tree.passCmdT === null) {
            bad.push(`${label}: the pass never began`);
            continue;
          }
          if (tree.passCmdT < ref(L) - 1e-9) bad.push(`${label}: pass before it was due`);
          longestHold = Math.max(longestHold, tree.passCmdT - ref(L));
          // NEVER MORE THAN THE NO-TIMER WORLD: its reports are that world's, in order, up to its pass; its bill is that world's.
          if (tree.billedAt !== null && noTimer.billedAt === null) bad.push(`${label}: billed here, not in the no-timer world`);
          if (tree.reportsAt.some((t, i) => t !== noTimer.reportsAt[i])) bad.push(`${label}: reports at ${tree.reportsAt.join(", ")}, the no-timer world's at ${noTimer.reportsAt.join(", ")}`);
          if (tree.billedAt !== null && tree.reportsAt.length === 0) bad.push(`${label}: billed ${tree.billedAt} without a report`);
          if (noTimer.reportsAt.length > 0) noTimerReported++;
          if (tree.reportsAt.length > 0) {
            reported++;
            if (tree.billedAt !== noTimer.billedAt) bad.push(`${label}: billed at ${tree.billedAt}, the no-timer world at ${noTimer.billedAt}`);
          }
          if (tree.billedAt !== null) {
            billed++;
            // The pass begins on a report, never before it, and the лепка was never handed to the cruise law first.
            if (tree.passCmdT < tree.reportsAt[0]! - 1e-9) bad.push(`${label}: pass at ${tree.passCmdT} before its report at ${tree.reportsAt[0]}`);
            if (tree.out.result.passed) bad.push(`${label}: billed and still «издържан» at L3`);
            if (tree.out.commendationCodes.includes("CLEAN_DRIVING")) bad.push(`${label}: billed and praised`);
            if (tree.charged) bad.push(`${label}: charged at L3 (a coached rung)`);
          }
          if (tree.reportsAt.length === 0 && noTimer.reportsAt.length > 0) {
            // UNREPORTED THOUGH THE NO-TIMER WORLD REPORTS — only the decided F2 class.
            unreportedK.push(k);
            if (tree.atLineBeforePass > 0) bad.push(`${label}: unreported although the лепка had been at the harsh line ${tree.atLineBeforePass} grid point(s) before its pass`);
            if (tree.passCmdT > ref(L) + 1e-9) bad.push(`${label}: unreported although its pass was held`);
          }
        }
        expect(bad, E.name).toEqual([]);
        // The no-timer world's лепка reports every one of these brake checks…
        expect(noTimerReported, E.name).toBe(36);
        // …and what is not reported here is the pedal too late for the лепка to have been at the line.
        expect(unreportedK.every((k) => k >= E.lateK), `${E.name}: unreported at ${unreportedK}`).toBe(true);
        expect(reported, E.name).toBe(36 - unreportedK.length);
        expect(billed, E.name).toBeGreaterThanOrEqual(20);
        // The hold ends with the report of the application AFTER the release: the release and the sustain, bounded.
        expect(longestHold, E.name).toBeGreaterThan(SUSTAIN);
        expect(longestHold, E.name).toBeLessThan(2 * SUSTAIN + 0.3);
      }
    },
    TIMEOUT,
  );

  it(
    "…and one cell of each BY NAME (a pedal time the round-4 verifier measured as «ИЗДЪРЖАН» with the unscoped praise): the pass is NOT commanded on the dip — it waits for the no-timer world's report, the brake check is coached as the lesson's own mistake, not «издържан», no «Чисто и спокойно каране», and the лепка never sped up at him first",
    () => {
      const L = 3 as ScenarioLevel;
      for (const E of RELEASES) {
        const { pedalT, tree, noTimer } = cell(L, E.law, E.namedK);
        const label = `${E.name} · pedal ${E.namedK}`;
        expect(tree.onsetKmh!, label).toBeLessThan(FLOOR_KMH);
        // The лепка had been at the harsh line when the timer came due, and its pass was held.
        expect(tree.atLineBeforeRefCmd, label).toBeGreaterThan(0);
        expect(tree.passCmdT!, label).toBeGreaterThan(ref(L) + 1e-9);
        // ONE report after the timer — the no-timer world's, on its grid point, 0.5–1.15 s after the pedal…
        expect(noTimer.reportsAt.length, label).toBeGreaterThanOrEqual(1);
        expect(tree.reportsAt, label).toEqual(noTimer.reportsAt.slice(0, tree.reportsAt.length));
        expect(tree.reportsAt, label).toHaveLength(1);
        expect(tree.reportsAt[0]! - pedalT, label).toBeGreaterThan(0.5);
        expect(tree.reportsAt[0]! - pedalT, label).toBeLessThan(1.15);
        // …the pass commanded on that report's grid point…
        expect(tree.passCmdT!, label).toBeCloseTo(tree.reportsAt[0]!, 9);
        // …and the sheet: coached there or on the next grid point, the lesson's own mistake, not passed, no praise.
        expect(tree.billedAt, label).not.toBeNull();
        expect(tree.billedAt, label).toBe(noTimer.billedAt);
        expect(tree.billedAt! - tree.reportsAt[0]!, label).toBeGreaterThan(-1e-9);
        expect(tree.billedAt! - tree.reportsAt[0]!, label).toBeLessThan(G + 1e-9);
        expect(tree.charged, label).toBe(false);
        expect((tree.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`), label).toEqual(["HARSH_BRAKING_NO_CAUSE:false"]);
        expect(tree.out.result.passed, label).toBe(false);
        expect(tree.out.commendationCodes, label).not.toContain("CLEAN_DRIVING");
        // Across the release the лепка, still under the matchPlayer law, follows him and no more: it never gains
        // speed at the cruise law's 3.5 m/s² before its report.
        expect(tree.maxAccelBeforeRelease, label).toBeLessThan(1);
      }
    },
    TIMEOUT,
  );

  it(
    "…and on the rungs either side, TAP – RELEASE – SLAM with the pedal 0.233 s before the timer: billed on the no-timer world's report at L1 (coached, not «издържан») and at L4 (the exam rung: the charged основна, 3 наказателни точки — the lesson can still be «издържан» there, as in the no-timer world)",
    () => {
      const E = RELEASES[0]!;
      for (const L of [1, 4] as ScenarioLevel[]) {
        const { tree, noTimer } = cell(L, E.law, E.namedK);
        const label = `L${L} · ${E.name} · pedal ${E.namedK}`;
        expect(tree.reportsAt, label).toHaveLength(1);
        expect(tree.reportsAt, label).toEqual(noTimer.reportsAt.slice(0, 1));
        expect(tree.passCmdT!, label).toBeCloseTo(tree.reportsAt[0]!, 9);
        expect(tree.billedAt, label).not.toBeNull();
        expect(tree.billedAt, label).toBe(noTimer.billedAt);
        expect(tree.charged, label).toBe(L === 4);
        expect(tree.out.commendationCodes, label).not.toContain("CLEAN_DRIVING");
        expect((tree.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`), label).toEqual(
          (noTimer.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`),
        );
        expect(tree.out.result.passed, label).toBe(noTimer.out.result.passed);
        if (L === 1) expect(tree.out.result.passed, label).toBe(false);
      }
    },
    TIMEOUT,
  );

  it(
    "CONTROL — the decided F2 class is unchanged for a steady full pedal at L3: the pedal one grid point before the timer leaves the лепка not yet at the line, its pass begins on time and nothing is billed; six grid points before, it is held and billed",
    () => {
      const L = 3 as ScenarioLevel;
      const late = cell(L, STEADY, -1);
      expect(late.tree.atLineBeforePass).toBe(0);
      expect(late.tree.passCmdT!).toBeCloseTo(ref(L), 9);
      expect(late.tree.reportsAt).toEqual([]);
      expect(late.tree.billedAt).toBeNull();
      expect(late.noTimer.billedAt).not.toBeNull(); // the world where nothing takes the лепка off his tail does bill it
      const held = cell(L, STEADY, -6);
      expect(held.tree.passCmdT!).toBeGreaterThan(ref(L) + 1e-9);
      expect(held.tree.reportsAt).toEqual(held.noTimer.reportsAt);
      expect(held.tree.billedAt).not.toBeNull();
    },
    TIMEOUT,
  );
});
