/**
 * THE PASS DOES NOT BEGIN IN THE MIDDLE OF THE CAR'S OWN HARD BRAKE —
 * `RearTailgaterRunner.ownHardBrakeHoldsThePass`
 * (`sc-follow-tailgater:63c0c28c` C2a, integrator decision 2026-10-11).
 *
 * WHAT WAS MEASURED (lane tailbrake3, 2e9268f). The pass was a pure timer:
 * `pressureSec` after the latch, whatever the car was doing. On the rig's
 * TTF25 drive it came due 0.267 s after a full-pedal brake check from
 * 24.5 км/ч, while the car glued 4.8 m behind was braking at 9.2 m/s² for
 * him. The cruise law took over, the car ACCELERATED at 3.5 m/s² toward a car
 * stopping 4.5 m ahead, and its hard brake — 0.25 s at the harsh line, under
 * the product's 0.4 s sustain — never reached the follower's account. So the
 * brake check was acquitted by the floor: «ИЗДЪРЖАН» ★★★.
 *
 * THE RULE PINNED HERE (round 5, integrator decision 2026-10-12). A pass that
 * has come due is HELD WHILE THE CAR'S HARD BRAKE IS NOT OVER YET AND HAS NOT
 * BEEN REPORTED: from the FIRST grid point its reading is at the harsh line,
 * tracked on every glued grid point (due or not), until
 *   · the product's harsh step REPORTS that brake (`followerBraked` is out) —
 *     the pass begins on that very grid point; or
 *   · THE BRAKE IS OVER — the car's reading has stayed under the product's
 *     braking line, 2 m/s², for the product's own sustain, 0.4 s
 *     (`harshBrakeSustainSec`; on the 1/60 s grid the 25th reading of an
 *     unbroken run under the line, the product's `>=` with its tie tolerance).
 *     Any reading back at the braking line starts the count again; or
 *   · the car is no longer his close follower (`stepFollowerAccount` starts a
 *     fresh track and the hold with it).
 * Nothing else ends it. In particular NOT:
 *   · ONE reading under the braking line, or any run of them shorter than the
 *     sustain. Round 4 released on the first («the released pedal», the
 *     product step's re-arm), and its verifier measured 980 of 6,444 sub-floor
 *     brake checks escaping: a release of three grid points (0.05 s) in the
 *     middle of an emergency stop, or an ease to 1.9 m/s² for four, reads so
 *     once or twice, the pass began on that dip or on the next due grid point,
 *     and the car was braking at 6–9 m/s² again one to three grid points later
 *     (tap–release–slam 700 of 1,548; one stop with a dip 234 of 1,296; 46 of
 *     3,600 seeded random stops with releases);
 *   · a grid point UNDER the harsh line while the car is still braking. Round
 *     2 released there, and its verifier measured 762 of 5,838 sub-floor brake
 *     checks escaping through an UNEVEN emergency stop — a dip to 5–6.5 m/s²
 *     for 0.05–0.10 s, 8 ± 1.5 m/s² at 5 Hz, a one- or two-grid-point release;
 *   · the product step's RE-ANCHOR (its window open for the sustain with a
 *     mean not over the line: «Open, or re-anchor on this frame's own
 *     reading»). Round 3 held only through that open window, and its verifier
 *     measured 383 of 9,000 escaping where the re-anchor fell on a reading
 *     under the line with the car still braking at 5.5–7.0 m/s² (a firm
 *     lead-in then full pedal with a dip; a slow pedal rise into a wobble;
 *     9 of 100 seeded random uneven stops). The step closes that WINDOW, not
 *     the brake: it reports the same brake from the next window.
 * Nothing else holds a pass either: not the student's pedal, not a firm brake
 * of the car's that was never at the harsh line, not a hard brake already
 * reported, not a brake while the car is not his close follower. No number is
 * new — the line, the sustain and the braking line are the engine's
 * (`rules/harshBrakeEpisode.ts` on `DEFAULT_RULE_CONFIG`).
 *
 * WHAT THE RULE LEAVES, MEASURED AND NOT HIDDEN (lane tailbrake3).
 *   · THE DECIDED F2 CLASS: a pedal so late before the timer that the car has
 *     not been at the harsh line when its pass comes due. Its width is the
 *     pedal's own rise: 0.017–0.05 s on the rig's full pedal, up to 0.10–0.117 s
 *     on a 0.1 s ramp, 0.317 s on a 0.4 s ramp, 0.583 s on a 0.75 s ramp (the
 *     mouse pedal's `BRAKE_RISE_SEC`).
 *   · HOW LONG A HOLD CAN LAST — SECONDS, AND THAT IS THE RULE (integrator
 *     decision 2026-10-12: after its own hard brake the car does not pull out
 *     while the car ahead is still slowing; it pulls out once that brake has
 *     been over for the sustain, or the car ahead has stopped). The hold has
 *     no clock but the brake's own:
 *       – the pass is commanded at the latest 25 grid points (0.417 s) after
 *         the car's LAST reading at the braking line — so a pass always begins
 *         once the braking stops, and a standstill is waited out by the
 *         sustain and no longer;
 *       – while it lasts the car reads 2 m/s² or more at least once in every
 *         sustain. Each such reading is 0.1 m/s shed over its 0.05 s span, so
 *         a car that ONLY SLOWS is held at most 4.5 s for each m/s of its
 *         speed at its first reading at the line, plus the sustain (the row
 *         «THE LONGEST HOLD A CAR THAT ONLY SLOWS CAN MAKE» builds exactly
 *         that car: one-grid-point brake taps every 0.45 s, 38 s from
 *         8.5 m/s). A steady 2.1 m/s² to a standstill is speed ÷ 2.1 plus the
 *         sustain;
 *       – a car that keeps coming back to the brake inside every sustain AND
 *         picks its speed up in between is waited behind for as long as it
 *         does that (the row «NO CLOCK OF ITS OWN» holds 20 s of it), as in
 *         the world where the timer never comes due, and is passed 0.417 s
 *         after its last brake.
 *     All that time the car is under the matchPlayer law, the law of the
 *     no-timer world; it keeps its place behind him with its blinker on (the
 *     L6 lamp comes on `INDICATOR_LEAD_SEC` before the pass is DUE and stays
 *     on until 0.4 s after the pass has glided out), and nothing is billed or
 *     shown that the no-timer world does not bill or show.
 *     MEASURED on kinematic tapes through the live rung chain (lane tailbrake3
 *     round 5), the longest hold: 0.366 s on the 2,835-drive steady
 *     brake-check sweep (the report ends it); 1.32 s on the round-3 verifier's
 *     9,000 uneven stops; 1.73 s on the round-2 and round-4 verifiers' pumps
 *     and stops with releases; 4.03 s on this lane's 13,992-drive search (a
 *     0.15 s on / 0.43 s off pump from 34.6 км/ч; 3.58 s behind a tap and
 *     three seconds of brake taps with the throttle in between); and 3.23 /
 *     4.57 / 6.07 s behind a 0.1 s blip and then 2.1 m/s² to a standstill from
 *     24.5 / 34.6 / 45.9 км/ч — where nothing is reported or billed in any
 *     world and the sheets equal base's on all 1,890 such drives.
 *
 * TWO HARNESSES. A scripted port, where the car's speed is whatever the row
 * says, so only the runner's own conditions decide; and the real traffic
 * system on the committed ln-v1 with the lesson's own tailgater, where the
 * car's brake is the matchPlayer law answering a kinematic student. THE ORACLE
 * for «the car is at the harsh line / still in an unreported hard brake /
 * reported» is computed HERE from the speed the port publishes — the line and
 * the report through the product's own step, the BRAKING LINE and the count of
 * readings under it by this file's own arithmetic on the published speeds —
 * never read off the runner; and
 * where a row turns on WHEN the product's step re-anchors its window, the row
 * derives that grid point by its own arithmetic too (`readingAt`, the
 * re-anchor rows).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RearTailgaterSpec, StagedEventSpec } from "../../contracts";
import { DEFAULT_RULE_CONFIG, type SimTickEvent } from "../../rules";
import { BRAKING_LINE_MPS2, newHarshBrakeTrack, stepHarshBrakeTrack } from "../../rules/harshBrakeEpisode";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { createTrafficSystem } from "../../traffic/system";
import type { StagedActorView, StagedCommand, TrafficDistrict } from "../../traffic/types";
import { INDICATOR_LEAD_SEC, RearTailgaterRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const DT = 1 / 60;
const EPS = 1e-9;
const HARSH = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
const SUSTAIN = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
const READ = DEFAULT_RULE_CONFIG.accelWindowSec;

const SPEC = (SCENARIO_TEMPLATES as ScenarioSpec[]).find((s) => s.id === "sc-follow-tailgater")!;
const TAILGATER = [...(SPEC.staged ?? []), ...SPEC.levels.flatMap((l) => l.stagedAdd ?? [])].find(
  (s: StagedEventSpec) => s.kind === "rearTailgater",
) as RearTailgaterSpec;
const LN = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", `${SPEC.map.districtId}.json`), "utf-8"),
) as TrafficDistrict;
const LANE_X = 12.19;

/**
 * «THE BRAKE IS OVER», counted in whole grid points so that no sum of floats decides it: the first reading
 * under the braking line and the 24 after it span 24/60 s = the sustain, so the brake is over on the 25th
 * reading of an unbroken run under the line.
 */
const OVER_AFTER = Math.round(SUSTAIN / DT) + 1;

/**
 * The oracle: the car's published speed through the product's own harsh step (the line, the report), and THIS
 * FILE'S OWN READING of it for the braking line — the speed lost since the latest sample at or before the start
 * of the product's reading window (`accelWindowSec`), per second — and its own count of the run under that line.
 */
function carOracle() {
  const track = newHarshBrakeTrack();
  let ref: number | null = null;
  /** THE RULE'S STATE, kept here: the car has been at the harsh line in a brake that is not over and not reported. */
  let hardBrakeNotOver = false;
  /** Round 4's state: the same, but «over» on the first reading under the braking line. */
  let sinceLastUnderReading = false;
  /** How many grid points in a row, this one included, have read under the braking line. */
  let underRun = 0;
  let hist: Array<{ t: number; v: number }> = [];
  return {
    /**
     * What THIS grid point is —
     *   `atLine`    its reading is at the harsh line (the product's step credited it);
     *   `released`  its reading is under the braking line, 2 m/s² (own arithmetic); `underRun` — how many in a row;
     *   `over`      THE BRAKE IS OVER: this is at least the 25th reading in a row under the braking line;
     *   `holding`   THE RULE: the car has been at the line in a brake that is not over yet, and it is not reported;
     *   `r4holding` ROUND 4'S RULE, kept to show where the two part: the same with the brake «over» on the FIRST
     *               reading under the braking line;
     *   `open`      ROUND 3'S RULE, likewise: the product step's window is open on a credited grid point and not
     *               reported (false again after a re-anchor on a reading under the line);
     *   `reported`  the product's step has reported this brake; `firedNow` — on this very grid point.
     */
    step(t: number, speedMps: number) {
      if (ref === null) ref = speedMps;
      const v = stepHarshBrakeTrack(track, t, ref - speedMps, DEFAULT_RULE_CONFIG);
      hist.push({ t, v: speedMps });
      if (hist.length > 8) hist = hist.slice(-8);
      let anchor = hist[0]!;
      for (const h of hist) if (h.t <= t - READ) anchor = h;
      const reading = t > anchor.t ? (anchor.v - speedMps) / (t - anchor.t) : 0;
      const atLine = track.lastQualAt === t;
      const released = !(reading >= BRAKING_LINE_MPS2);
      underRun = released ? underRun + 1 : 0;
      const over = underRun >= OVER_AFTER;
      if (released) sinceLastUnderReading = false;
      else if (atLine) sinceLastUnderReading = true;
      // The product's step re-arms `fired` on any reading under the braking line, so `fired` here is «reported in
      // the episode the step has open»; a hard brake after such a reading is a new episode and is held for again.
      if (over || track.fired) hardBrakeNotOver = false;
      else if (atLine) hardBrakeNotOver = true;
      return {
        atLine,
        reading,
        released,
        underRun,
        over,
        holding: hardBrakeNotOver,
        r4holding: sinceLastUnderReading && !track.fired,
        open: track.lastQualAt !== null && !track.fired,
        reported: track.fired,
        firedNow: v !== null,
      };
    },
  };
}
type OracleStep = ReturnType<ReturnType<typeof carOracle>["step"]>;

// ---------------------------------------------------------------------------
// 1. THE SCRIPTED PORT — only the runner's own conditions decide.
// ---------------------------------------------------------------------------

/** Pressure from the latch to the due pass in the scripted rows, s. */
const PRESSURE = 2;

interface Scripted {
  /** The car's deceleration at time t, m/s² (0 = holding its speed). */
  carDecel: (t: number, dueT: number) => number;
  /** The student's pedal and pace (he holds 32.4 км/ч unless the row says otherwise). */
  studentBrakeFrom?: (dueT: number) => number;
  /** The student's lateral offset from the lane centre, m. */
  studentOffM?: (t: number) => number;
  view?: (v: StagedActorView) => StagedActorView;
  /** The runner's spec, where a row needs another one (the station runner: passShiftM 0). */
  spec?: Partial<RearTailgaterSpec>;
  /** The student's pace on the tick, км/ч (default 32.4 — under the engine's 35 км/ч floor). */
  studentKmh?: number;
  /** How long the row runs, s (default 12). */
  durationSec?: number;
}

/** Grid points from the nominal due time, for rows whose shape is written in grid points. */
const gridFrom = (t: number, dueT: number) => Math.round((t - dueT) / DT);

function scripted(o: Scripted) {
  const spec: RearTailgaterSpec = { ...TAILGATER, pressureSec: PRESSURE, ...o.spec };
  let speed = 9;
  let y = 20;
  let t = 0;
  let studentV = o.studentKmh === undefined ? 9 : o.studentKmh / 3.6;
  const gap = (tt: number) => (tt < 1 ? 22 : 9);
  const commands: Array<{ t: number; c: StagedCommand }> = [];
  const base = (): StagedActorView =>
    ({ x: LANE_X, y: y - gap(t), dirX: 0, dirY: 1, speedMps: speed, laneWidthM: 3.5, stateId: 7, finished: false }) as unknown as StagedActorView;
  const view = () => (o.view ? o.view(base()) : base());
  const port: StagedTrafficPort = {
    stage: () => view(),
    stagedCommand: (_id, c) => commands.push({ t, c }),
    staged: () => view(),
  };
  const runner = new RearTailgaterRunner(spec);
  runner.stage(port, () => 0.5, true); // the fixed draw: no jitter on pressureSec
  const oracle = carOracle();
  /** The runner latches on the first grid point the car is inside followBehindM + the latch slack. */
  let latchT: number | null = null;
  const reports: number[] = [];
  /** `pedal` and `studentKmh` are what the tick told the runner about HIM on that grid point (the landing's pins read them). */
  const grid: Array<{ t: number; decel: number; speed: number; pedal: number; studentKmh: number } & OracleStep> = [];
  for (let i = 1; i * DT < (o.durationSec ?? 12); i++) {
    t = i * DT;
    // The runner latches on the first grid point the scripted gap is inside its latch band (the step
    // before that one released it), so the pass is due PRESSURE after this grid point.
    if (latchT === null && i >= 2 && gap(t) <= 13) latchT = t;
    const dueT = (latchT ?? 1) + PRESSURE;
    const braking = o.studentBrakeFrom !== undefined && t >= o.studentBrakeFrom(dueT);
    if (braking) studentV = Math.max(0, studentV - 9.5 * DT);
    y += 9 * DT; // the scripted gap is what the row says; his pace on the tick is `studentV`
    const d = o.carDecel(t, dueT);
    speed = Math.max(0, speed - d * DT);
    const out: SimTickEvent[] = [];
    runner.step(
      port,
      {
        tSec: t,
        dtSec: DT,
        x: LANE_X + (o.studentOffM?.(t) ?? 0),
        y,
        speedKmh: studentV * 3.6,
        headingDeg: 0,
        brakePedal: braking ? 1 : 0,
        tickEvents: [],
      } satisfies DirectorInput,
      out,
    );
    for (const e of out) if (e.kind === "followerBraked") reports.push(t);
    grid.push({ t, decel: d, speed, pedal: braking ? 1 : 0, studentKmh: studentV * 3.6, ...oracle.step(t, speed) });
  }
  const at = (type: StagedCommand["type"]) => commands.filter((x) => x.c.type === type).map((x) => x.t);
  const passT = at("laneShift")[0] ?? null;
  const dueT = latchT! + PRESSURE;
  /**
   * THE CAR'S READING ON A GRID POINT, by this file's own arithmetic: its speed change over the product's
   * reading window (`accelWindowSec` 0.04 s — anchored on the latest sample at or before its start, which
   * on the 1/60 s grid is three grid points back, 0.05 s).
   */
  const readingAt = (tt: number): number => {
    const i = grid.findIndex((g) => g.t === tt);
    return i >= 3 ? (grid[i - 3]!.speed - grid[i]!.speed) / (grid[i]!.t - grid[i - 3]!.t) : 0;
  };
  return {
    readingAt,
    dueT,
    /** The first grid point the timer alone allows the pass (base's pass). */
    firstDueT: grid.find((g) => g.t - latchT! >= PRESSURE)!.t,
    passT,
    reports,
    grid,
    commands,
    indicatorOnT: commands.find((x) => x.c.type === "setIndicator" && (x.c as { indicator: string }).indicator !== "off")?.t ?? null,
  };
}

describe("RearTailgaterRunner · a due pass is held only while the car is still in a hard brake of its own that has not been reported (63c0c28c C2a, scripted port)", () => {
  it("the timeline these rows stand on: latched at the first grid point inside the latch band, and a car that is not braking passes on the first grid point the timer allows", () => {
    const r = scripted({ carDecel: () => 0 });
    expect(r.passT).not.toBeNull();
    expect(r.passT!).toBe(r.firstDueT);
    expect(r.firstDueT - r.dueT).toBeLessThan(DT + EPS);
    expect(r.reports).toEqual([]);
    // L6: the blinker came on INDICATOR_LEAD_SEC before the pass was due — but the pressure here is shorter
    // than the lead, so it is on from the latch; either way before the pass.
    expect(INDICATOR_LEAD_SEC).toBeGreaterThan(PRESSURE);
    expect(r.indicatorOnT!).toBeLessThan(r.passT!);
  });

  it("THE DEFECT'S SHAPE — the timer comes due 0.25 s into the car's 10 m/s² brake: the pass waits, the car's brake reaches the sustain and is reported, and the pass begins on that very grid point", () => {
    const r = scripted({ carDecel: (t, due) => (t >= due - 0.25 && t < due + 0.65 ? 10 : 0) });
    // Antecedent: on the grid point the timer came due the car was at the harsh line, unreported.
    const due = r.grid.find((g) => g.t === r.firstDueT)!;
    expect(due.atLine).toBe(true);
    expect(due.reported).toBe(false);
    // Held: no pass on that grid point…
    expect(r.passT).not.toBeNull();
    expect(r.passT!).toBeGreaterThan(r.firstDueT);
    // …one report, on the grid point the product's own step calls the brake harsh…
    expect(r.reports).toHaveLength(1);
    const fired = r.grid.find((g) => g.firedNow)!;
    expect(r.reports[0]!).toBe(fired.t);
    // …the sustain after its brake began, not after the timer…
    expect(fired.t - (r.dueT - 0.25)).toBeGreaterThanOrEqual(SUSTAIN - EPS);
    expect(fired.t - (r.dueT - 0.25)).toBeLessThan(SUSTAIN + READ + 2 * DT);
    // …and the pass begins on the report's own grid point: released by the report, while the car is still at the line.
    expect(r.passT!).toBe(fired.t);
    expect(fired.atLine).toBe(true);
    // Every grid point it was held on is one of the car's unreported hard brake (here a steady brake: each of
    // them is at the harsh line too).
    for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) {
      expect(g.holding, `t ${g.t}`).toBe(true);
      expect(g.atLine, `t ${g.t}`).toBe(true);
    }
  });

  it("…and the same brake with the timer due only AFTER its report is not held at all: a reported hard brake holds nothing", () => {
    // The brake begins 0.6 s before the pass is due and lasts 1.2 s: reported ~0.2 s before the timer.
    const r = scripted({ carDecel: (t, due) => (t >= due - 0.6 && t < due + 0.6 ? 10 : 0) });
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!).toBeLessThan(r.firstDueT);
    const due = r.grid.find((g) => g.t === r.firstDueT)!;
    expect(due.atLine).toBe(true); // still braking hard…
    expect(due.reported).toBe(true); // …but the product's step has already reported it
    expect(r.passT!).toBe(r.firstDueT);
  });

  it("ENDED WHEN THE BRAKE IS OVER — a hard brake that ENDS before the sustain is held until its reading has STAYED under the braking line (2 m/s²) for the sustain: not until its first reading under 7 (round 2), not until its first reading under 2 (round 4); no report, and the pass is not lost", () => {
    // 10 m/s² from 0.25 s before the timer for 0.3 s only: 0.05 s past the due point, then the car holds its speed.
    const r = scripted({ carDecel: (t, due) => (t >= due - 0.25 && t < due + 0.05 ? 10 : 0) });
    expect(r.reports).toEqual([]);
    expect(r.passT).not.toBeNull();
    expect(r.passT!).toBeGreaterThan(r.firstDueT);
    // The pass begins on the first grid point from the due one on which the rule no longer holds it…
    const first = r.grid.find((g) => g.t >= r.firstDueT && !g.holding)!;
    expect(r.passT!).toBe(first.t);
    // …which, by this file's own arithmetic on the published speeds, is the 25th grid point in a row whose reading
    // is under the product's braking line: the first of them and the 24 after it span the product's sustain.
    expect(BRAKING_LINE_MPS2).toBe(2);
    expect(SUSTAIN).toBe(0.4);
    expect(OVER_AFTER).toBe(25);
    const iUnder = r.grid.findIndex((g) => g.t >= r.firstDueT && r.readingAt(g.t) < BRAKING_LINE_MPS2);
    const run = r.grid.slice(iUnder, iUnder + OVER_AFTER);
    for (const g of run) expect(r.readingAt(g.t), `t ${g.t}`).toBeLessThan(BRAKING_LINE_MPS2);
    expect(r.passT!).toBe(run[OVER_AFTER - 1]!.t);
    expect(r.passT! - run[0]!.t).toBeCloseTo(SUSTAIN, 9);
    // NOT the first reading under the harsh line: the brake's tail (readings between 2 and 7 m/s² as the reading
    // window empties) is still the same brake…
    const tail = r.grid.filter((g) => g.t >= r.firstDueT && g.t < r.passT! && r.readingAt(g.t) < HARSH);
    expect(tail.filter((g) => r.readingAt(g.t) >= BRAKING_LINE_MPS2).length).toBeGreaterThanOrEqual(1);
    // …and NOT the first reading under the braking line either: round 4's rule reads «over» there, the rule
    // holds through that reading and the 23 after it.
    expect(run[0]!.r4holding).toBe(false);
    expect(tail.filter((g) => r.readingAt(g.t) < BRAKING_LINE_MPS2)).toHaveLength(OVER_AFTER - 1);
    for (const g of tail) {
      expect(g.atLine, `t ${g.t}`).toBe(false);
      expect(g.holding, `t ${g.t}`).toBe(true);
    }
    // The reading window is 0.04 s (three grid points): the car reads under the braking line within it after
    // the brake ends, so the pass begins the sustain and that window after the brake's last grid point.
    expect(run[0]!.t - (r.dueT + 0.05)).toBeLessThan(READ + 3 * DT);
    expect(r.passT! - (r.dueT + 0.05)).toBeLessThan(SUSTAIN + READ + 3 * DT);
  });

  it("THROUGH THE RE-ANCHOR — a hard brake that eases to a FIRM 4 m/s² before the sustain: the product's step closes its window as not emergency-grade (open for the sustain, mean not over 7) with the car still braking, and the pass is STILL HELD on that grid point (round 3 let it go there); it begins once the firm brake has been over for the sustain", () => {
    // 10 m/s² for 0.3 s from 0.25 s before the timer, then 4 m/s² for 0.95 s.
    const r = scripted({ carDecel: (t, due) => (t >= due - 0.25 && t < due + 0.05 ? 10 : t >= due + 0.05 && t < due + 1 ? 4 : 0) });
    expect(r.reports).toEqual([]);
    expect(r.passT).not.toBeNull();
    // BY THIS FILE'S OWN ARITHMETIC: the step's window opens on the first grid point whose reading is at the
    // braking line, and is re-anchored on the first grid point at least the sustain later on which the speed shed
    // since then is no more than 7 m/s² × the time since. (10 × 0.3 + 4 × (h − 0.3) ≤ 7 h ⇔ h ≥ 0.6 s.)
    const opened = r.grid.find((g) => r.readingAt(g.t) >= BRAKING_LINE_MPS2)!;
    const reanchor = r.grid.find(
      (g) => g.t - opened.t >= SUSTAIN - EPS && opened.speed - g.speed <= HARSH * (g.t - opened.t) * (1 + 1e-9),
    )!;
    expect(reanchor.t - opened.t).toBeGreaterThan(0.55);
    expect(reanchor.t - opened.t).toBeLessThan(0.6 + EPS);
    expect(reanchor.t).toBeGreaterThan(r.firstDueT);
    // On that grid point the product's window is closed (round 3's rule reads «not open») and the car is still
    // slowing at 4 m/s² — and the pass does not begin there:
    expect(reanchor.open).toBe(false);
    expect(reanchor.decel).toBe(4);
    expect(reanchor.holding).toBe(true);
    expect(r.passT!).toBeGreaterThan(reanchor.t);
    // It begins on the 25th grid point in a row whose reading is under the braking line: the firm brake has been
    // over for the sustain.
    const iUnder = r.grid.findIndex((g) => g.t >= r.firstDueT && r.readingAt(g.t) < BRAKING_LINE_MPS2);
    expect(r.grid[iUnder]!.t - (r.dueT + 1)).toBeGreaterThan(-EPS);
    expect(r.grid[iUnder]!.t - (r.dueT + 1)).toBeLessThan(READ + 3 * DT);
    for (const g of r.grid.slice(iUnder, iUnder + OVER_AFTER)) expect(r.readingAt(g.t), `t ${g.t}`).toBeLessThan(BRAKING_LINE_MPS2);
    expect(r.passT!).toBe(r.grid[iUnder + OVER_AFTER - 1]!.t);
    for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
    // WRITTEN DOWN: that is a hold of 1.4 s — from the timer to the end of the firm brake, and the sustain more.
    expect(r.passT! - r.firstDueT).toBeGreaterThan(0.95 + SUSTAIN);
    expect(r.passT! - r.firstDueT).toBeLessThan(1.1 + SUSTAIN);
  });

  describe("HOW LONG A HOLD CAN LAST, WRITTEN DOWN (integrator decision 2026-10-12: seconds-long holds are the rule — after its own hard brake the car does not pull out while the car ahead is still slowing) — the hold has no clock but the brake's own, and a pass always begins once the braking stops", () => {
    /** What the student is shown while a pass is held: the car keeps its place under the law it was under, its blinker on. */
    const nothingChangesWhileHeld = (r: ReturnType<typeof scripted>) => {
      // No command reaches the car between the grid point the timer came due and its pass: no cruise, no lane
      // shift, no lamp change — it is still under the matchPlayer law it was glued under.
      expect(r.commands.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)).toEqual([]);
      // Its blinker came on before the pass was due (L6) and is not switched off before the pass has begun.
      expect(r.indicatorOnT).not.toBeNull();
      expect(r.indicatorOnT!).toBeLessThan(r.firstDueT);
      const offs = r.commands.filter((x) => x.c.type === "setIndicator" && (x.c as { indicator: string }).indicator === "off");
      for (const x of offs) expect(x.t).toBeGreaterThan(r.passT!);
    };

    it("ONE harsh blip, then a long FIRM brake (5 m/s², never emergency-grade, never reported) to a standstill: the pass waits the whole stop out and begins the sustain after the car has come to rest", () => {
      // 10 m/s² for 0.1 s from 0.05 s before the timer, then 5 m/s² until the car stands (≈1.6 s).
      const r = scripted({ carDecel: (t, due) => (t >= due - 0.05 && t < due + 0.05 ? 10 : t >= due + 0.05 ? 5 : 0) });
      const due = r.grid.find((g) => g.t === r.firstDueT)!;
      expect(due.holding).toBe(true);
      expect(r.reports).toEqual([]);
      // A PASS ALWAYS BEGINS: a car at rest reads 0, and the 25th such reading in a row is the brake over.
      expect(r.passT).not.toBeNull();
      const iUnder = r.grid.findIndex((g) => g.t >= r.firstDueT && r.readingAt(g.t) < BRAKING_LINE_MPS2);
      expect(r.passT!).toBe(r.grid[iUnder + OVER_AFTER - 1]!.t);
      for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
      const at = r.grid.find((g) => g.t === r.passT!)!;
      expect(at.speed).toBe(0);
      // It stood for the sustain — and the few grid points its reading window took to empty — before it was let go.
      const stoodAt = r.grid.find((g) => g.speed === 0)!;
      expect(r.passT! - stoodAt.t).toBeGreaterThanOrEqual(SUSTAIN - EPS);
      expect(r.passT! - stoodAt.t).toBeLessThanOrEqual(SUSTAIN + 3 * DT + EPS);
      // A steady brake of c m/s² sheds the speed the car had at its first reading at the line in that speed ÷ c.
      const first = r.grid.find((g) => g.atLine)!;
      expect(r.passT! - first.t).toBeLessThanOrEqual(first.speed / 5 + SUSTAIN + READ + DT);
      // WRITTEN DOWN: 2.1 s for a car that braked hard for 0.1 s and firmly after.
      expect(r.passT! - r.firstDueT).toBeGreaterThan(1.6 + SUSTAIN);
      expect(r.passT! - r.firstDueT).toBeLessThan(1.8 + SUSTAIN);
      nothingChangesWhileHeld(r);
    });

    it("THE LONGEST HOLD A CAR THAT ONLY SLOWS CAN MAKE — it must read 2 m/s² at least once in every sustain, each such reading is 0.1 m/s shed across its 0.05 s span, so 0.1 m/s every 0.45 s: 4.5 s for each m/s of its speed at its first reading at the line, plus the sustain. Built exactly: three grid points at 10 m/s², then ONE grid point of 6.06 m/s² every 27 — 38 s from 8.5 m/s, no report in any world, and the pass begins the sustain after its last brake", () => {
      // j counts grid points from the nominal due time. The blip is j −3 … −1 (readings 3.3, 6.7, 10: at the line on
      // the last, before the timer). A tap on grid point g reads 2.02 m/s² on g, g+1, g+2; the 24 readings after
      // them are under the braking line; the next tap falls on what would have been the 25th.
      const TAP = 6.06;
      const PERIOD = OVER_AFTER + 2;
      const FIRST_TAP = 26;
      const r = scripted({
        durationSec: 46,
        carDecel: (t, due) => {
          const j = gridFrom(t, due);
          if (j >= -3 && j < 0) return 10;
          return j >= FIRST_TAP && (j - FIRST_TAP) % PERIOD === 0 ? TAP : 0;
        },
      });
      expect(r.reports).toEqual([]);
      expect(r.passT).not.toBeNull();
      const first = r.grid.find((g) => g.atLine)!;
      expect(first.t).toBeLessThan(r.firstDueT);
      expect(first.speed).toBeCloseTo(8.5, 9);
      // The car only ever slows.
      for (let i = 1; i < r.grid.length; i++) expect(r.grid[i]!.speed).toBeLessThanOrEqual(r.grid[i - 1]!.speed);
      // Held on every grid point from the due one to the pass — never 25 readings in a row under the braking line…
      const held = r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!);
      for (const g of held) expect(g.holding, `t ${g.t}`).toBe(true);
      expect(Math.max(...held.map((g) => g.underRun))).toBe(OVER_AFTER - 1);
      // …with every braking reading in the hold just over the braking line, far under the harsh one.
      const taps = held.filter((g) => !g.released && g.t > r.dueT + 0.2).map((g) => r.readingAt(g.t));
      expect(taps.length).toBeGreaterThan(240);
      expect(Math.max(...taps)).toBeLessThan(2.1);
      expect(Math.min(...taps)).toBeGreaterThanOrEqual(BRAKING_LINE_MPS2);
      // THE BOUND, and how close this car comes to it.
      const bound = (4.5 * first.speed + SUSTAIN) * (1 + 1e-9);
      // A reading spans three grid points (0.05 s: the latest sample at or before the 0.04 s window's start).
      expect((SUSTAIN + 3 * DT) / (BRAKING_LINE_MPS2 * 3 * DT)).toBeCloseTo(4.5, 9); // (0.4 + 0.05) ÷ (2 × 0.05)
      expect(r.passT! - first.t).toBeLessThanOrEqual(bound);
      expect(r.passT! - first.t).toBeGreaterThan(4.4 * first.speed);
      // WRITTEN DOWN: 38 s. The pass begins on the 25th reading under the line after the last braking one, the
      // car all but at rest.
      expect(r.passT! - r.firstDueT).toBeGreaterThan(37.5);
      expect(r.passT! - r.firstDueT).toBeLessThan(38.5);
      const iLast = r.grid.findIndex((g) => g.t === held.filter((g2) => !g2.released).pop()!.t);
      expect(r.passT!).toBe(r.grid[iLast + OVER_AFTER]!.t);
      expect(r.grid.find((g) => g.t === r.passT!)!.speed).toBeLessThan(0.11);
      nothingChangesWhileHeld(r);
      // The world where the timer never comes due reports nothing of this either: there is nothing to bill.
      expect(scripted({ durationSec: 46, spec: { pressureSec: 90 }, carDecel: (t, due) => {
        const j = gridFrom(t, due);
        if (j >= -3 && j < 0) return 10;
        return j >= FIRST_TAP && (j - FIRST_TAP) % PERIOD === 0 ? TAP : 0;
      } }).reports).toEqual([]);
    });

    it("NO CLOCK OF ITS OWN — a car that keeps coming back to the brake inside every sustain AND picks its speed up in between is waited behind for as long as it does that (here 20 s, its speed where it was), and is passed 25 grid points after its last braking reading: the hold cannot outlive the braking by more than the sustain, and has no other limit", () => {
      // The blip as above; then, from j = 2, a cycle of 24 grid points: 4 m/s² for three (0.2 m/s shed, readings
      // 2.5, 4.0, 2.5) and 21 grid points regaining exactly that. For 20 s; then the car holds its speed.
      const CYCLE = 24;
      const STOP_J = 20 * 60;
      const law = (t: number, due: number) => {
        const j = gridFrom(t, due);
        if (j >= -3 && j < 0) return 10;
        if (j < 2 || j >= STOP_J) return 0;
        return (j - 2) % CYCLE < 3 ? 4 : -(4 * 3) / 21;
      };
      const r = scripted({ durationSec: 30, carDecel: law });
      expect(r.reports).toEqual([]);
      expect(r.passT).not.toBeNull();
      const first = r.grid.find((g) => g.atLine)!;
      expect(first.t).toBeLessThan(r.firstDueT);
      const held = r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!);
      for (const g of held) expect(g.holding, `t ${g.t}`).toBe(true);
      // It never read under the braking line for the sustain while it kept tapping…
      expect(Math.max(...held.filter((g) => g.t < r.dueT + 20).map((g) => g.underRun))).toBeLessThan(OVER_AFTER);
      // …it was held for the whole 20 s and passed 25 grid points after its last braking reading…
      expect(r.passT! - r.firstDueT).toBeGreaterThan(20);
      const iLast = r.grid.findIndex((g) => g.t === held.filter((g2) => !g2.released).pop()!.t);
      expect(r.passT!).toBe(r.grid[iLast + OVER_AFTER]!.t);
      expect(r.passT! - r.firstDueT).toBeLessThan(20 + SUSTAIN + READ + DT);
      // …at the speed it had after the blip: this car did not slow down at all.
      expect(Math.abs(r.grid.find((g) => g.t === r.passT!)!.speed - first.speed)).toBeLessThan(0.25);
      nothingChangesWhileHeld(r);
      const noTimer = scripted({ durationSec: 30, carDecel: law, spec: { pressureSec: 90 } });
      expect(noTimer.reports).toEqual([]);
      expect(noTimer.passT).toBeNull();
    });
  });

  describe("AN UNEVEN EMERGENCY STOP IS ONE BRAKE — the round-2 verifier's shapes: the timer comes due on a grid point whose reading is UNDER the harsh line, the car still braking; the pass is held through it to the report", () => {
    // Each shape is the car's deceleration by grid point j from the grid point the timer comes due on (j < 0 =
    // before it); the brake begins 16 grid points (0.267 s — TTF25's) before it and the dip sits on it. A
    // reading spans three grid points (j − 2 … j), so the 0.05 s dip is exactly the due point's reading.
    const START = -16;
    const END = 40;
    const free = scripted({ carDecel: () => 0 });
    /** The grid point the timer comes due on, counted from the nominal due time (0 or 1). */
    const DUE_K = gridFrom(free.firstDueT, free.dueT);
    const SHAPES: Array<[string, (j: number) => number]> = [
      ["9.3 m/s² dipping to 6.0 for 0.10 s", (j) => (j >= -4 && j < 2 ? 6.0 : 9.3)],
      ["9.3 m/s² dipping to 5.0 for 0.07 s", (j) => (j >= -3 && j < 1 ? 5.0 : 9.3)],
      ["9.3 m/s² dipping to 6.5 for 0.05 s", (j) => (j >= -2 && j < 1 ? 6.5 : 9.3)],
      ["8 ± 1.5 m/s² at 5 Hz", (j) => 8 - 1.5 * Math.cos(2 * Math.PI * 5 * (j + 1) * DT)],
      ["a ONE-grid-point release", (j) => (j === -1 ? 0 : 9.3)],
      ["a TWO-grid-point release", (j) => (j === -2 || j === -1 ? 0 : 9.3)],
    ];
    for (const [name, law] of SHAPES) {
      it(`${name}: under the line at the due point, held, ONE report, and the pass begins on the report's grid point`, () => {
        const r = scripted({
          carDecel: (t, due) => {
            const j = gridFrom(t, due) - DUE_K;
            return j >= START && j < END ? law(j) : 0;
          },
        });
        expect(r.firstDueT).toBe(free.firstDueT);
        // Antecedent — the round-2 escape's own shape: on the grid point the timer came due the car's reading
        // was UNDER the harsh line (round 2 let the pass go here), it was still braking, and it had been at the
        // line earlier in the same, unreported brake.
        const due = r.grid.find((g) => g.t === r.firstDueT)!;
        expect(due.atLine).toBe(false);
        expect(r.readingAt(due.t)).toBeLessThan(HARSH);
        expect(r.readingAt(due.t)).toBeGreaterThanOrEqual(BRAKING_LINE_MPS2);
        expect(due.holding).toBe(true);
        expect(due.reported).toBe(false);
        expect(r.grid.some((g) => g.t < due.t && g.atLine)).toBe(true);
        // Held through it…
        expect(r.passT).not.toBeNull();
        expect(r.passT!).toBeGreaterThan(r.firstDueT);
        for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
        // …to the one report the product's own step makes of this brake, and released by it.
        expect(r.reports).toHaveLength(1);
        const fired = r.grid.find((g) => g.firedNow)!;
        expect(r.reports[0]!).toBe(fired.t);
        expect(r.passT!).toBe(fired.t);
        // The report is the sustain's worth of grid points at the line — later than a steady brake's by its dip.
        expect(fired.t - r.dueT).toBeGreaterThan(SUSTAIN + START * DT - EPS);
        expect(fired.t - r.dueT).toBeLessThan(SUSTAIN + START * DT + 0.2);
      });
    }

    describe("ROUND 3'S ESCAPE, THE RE-ANCHOR ON A DIP (the builder's own search shape: a firm lead-in, then full pedal with a dip across the grid point on which the product's step judges its opening window) — that step closes the window as not emergency-grade with the car still braking at 6 m/s², and the pass is held THROUGH it to the report: the very report, on the very grid point, of the world where the timer never comes due", () => {
      // 4.5 m/s² for 0.25 s (15 grid points), 9.3 for 0.1 s (6), a dip to 6.0, then 9.3 again. `j0` is the lead-in's
      // first grid point counted from the due point: it slides the whole brake against the timer.
      const ROWS: Array<{ name: string; j0: number; dipN: number; reanchorAfterDue: boolean }> = [
        { name: "the window is re-anchored AFTER the timer came due, on the dip", j0: -22, dipN: 6, reanchorAfterDue: true },
        {
          name: "the window is re-anchored BEFORE the timer comes due and the due point is still on the dip: nothing in the product's track says this brake was at the line — the hold's own bit does, kept on every glued grid point",
          j0: -28,
          dipN: 8,
          reanchorAfterDue: false,
        },
      ];
      for (const row of ROWS) {
        it(row.name, () => {
          const law = (j: number) => (j < row.j0 + 15 ? 4.5 : j < row.j0 + 21 ? 9.3 : j < row.j0 + 21 + row.dipN ? 6.0 : 9.3);
          const carDecel = (t: number, due: number) => {
            const j = gridFrom(t, due) - DUE_K;
            return j >= row.j0 && j < END ? law(j) : 0;
          };
          const r = scripted({ carDecel });
          expect(r.firstDueT).toBe(free.firstDueT);
          const due = r.grid.find((g) => g.t === r.firstDueT)!;
          // The car had been at the harsh line in this brake before the timer came due, unreported: held.
          expect(r.grid.some((g) => g.t < due.t && g.atLine)).toBe(true);
          expect(due.reported).toBe(false);
          expect(due.holding).toBe(true);
          // THE RE-ANCHOR, by this file's own arithmetic (as in the row above): the window opened on the first
          // reading at the braking line is judged at the sustain itself — the lead-in kept its mean under the
          // line — on a grid point of the dip.
          const opened = r.grid.find((g) => r.readingAt(g.t) >= BRAKING_LINE_MPS2)!;
          const reanchor = r.grid.find(
            (g) => g.t - opened.t >= SUSTAIN - EPS && opened.speed - g.speed <= HARSH * (g.t - opened.t) * (1 + 1e-9),
          )!;
          expect(reanchor.t - opened.t).toBeLessThan(SUSTAIN + DT + EPS);
          expect(reanchor.t > r.firstDueT).toBe(row.reanchorAfterDue);
          expect(reanchor.t).not.toBe(r.firstDueT);
          expect(reanchor.decel).toBe(6.0);
          expect(r.readingAt(reanchor.t)).toBeLessThan(HARSH);
          expect(r.readingAt(reanchor.t)).toBeGreaterThanOrEqual(BRAKING_LINE_MPS2);
          // On that grid point the product's window is closed and nothing of the new one is credited — round 3's
          // rule reads «not open» (its pass began here, or on the due point just after) — and the car is still in
          // its hard brake:
          expect(reanchor.open).toBe(false);
          expect(reanchor.holding).toBe(true);
          if (!row.reanchorAfterDue) {
            // …and on the due point the reading is still the dip's, the product's window still uncredited.
            expect(r.readingAt(due.t)).toBeLessThan(HARSH);
            expect(due.atLine).toBe(false);
            expect(due.open).toBe(false);
          }
          // HELD THROUGH IT, on every grid point from the due one…
          expect(r.passT).not.toBeNull();
          expect(r.passT!).toBeGreaterThan(Math.max(reanchor.t, r.firstDueT));
          for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
          // …to the ONE report, which is the NEXT window's — the sustain after the re-anchor — and releases it.
          expect(r.reports).toHaveLength(1);
          expect(r.passT!).toBe(r.reports[0]!);
          expect(r.reports[0]! - reanchor.t).toBeGreaterThanOrEqual(SUSTAIN - EPS);
          expect(r.reports[0]! - reanchor.t).toBeLessThan(SUSTAIN + READ + 2 * DT);
          // THE SAME CAR WITH THE TIMER NEVER DUE makes that report on that grid point: nothing is added.
          const noTimer = scripted({ carDecel, spec: { pressureSec: 90 } });
          expect(noTimer.passT).toBeNull();
          expect(noTimer.reports).toEqual(r.reports);
        });
      }
    });

    it("A RE-ANCHOR ON A GRID POINT AT THE LINE KEEPS HOLDING (the round-3 verifier's surviving mutant released on every re-anchor, and no row noticed): a gentle lead-in, then a hard brake still at the line when the product's step re-anchors its window AFTER the timer — held through it, reported from the next window, and the pass begins on the report", () => {
      // 3.5 m/s² for 0.15 s from 0.25 s before the timer, then 7.5 m/s² until the car stands.
      const r = scripted({ carDecel: (t, due) => (t >= due - 0.25 && t < due - 0.1 ? 3.5 : t >= due - 0.1 ? 7.5 : 0) });
      const due = r.grid.find((g) => g.t === r.firstDueT)!;
      expect(due.atLine).toBe(true);
      expect(due.holding).toBe(true);
      // The re-anchor, by this file's own arithmetic: at the sustain the window's mean is under the line
      // (3.5 × 0.12 + 7.5 × 0.28 over 0.4 s ≈ 6.3 m/s²) — on a grid point whose reading is 7.5 m/s², at the line.
      const opened = r.grid.find((g) => r.readingAt(g.t) >= BRAKING_LINE_MPS2)!;
      const reanchor = r.grid.find(
        (g) => g.t - opened.t >= SUSTAIN - EPS && opened.speed - g.speed <= HARSH * (g.t - opened.t) * (1 + 1e-9),
      )!;
      expect(reanchor.t - opened.t).toBeLessThan(SUSTAIN + DT + EPS);
      expect(reanchor.t).toBeGreaterThan(r.firstDueT);
      expect(r.readingAt(reanchor.t)).toBeGreaterThanOrEqual(HARSH);
      expect(reanchor.atLine).toBe(true);
      expect(reanchor.reported).toBe(false);
      // Held on the re-anchor's own grid point and on every one from the due point…
      expect(r.passT).not.toBeNull();
      expect(r.passT!).toBeGreaterThan(reanchor.t);
      for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
      // …to the report of the re-anchored window, the sustain later, with the car still moving.
      expect(r.reports).toHaveLength(1);
      expect(r.passT!).toBe(r.reports[0]!);
      expect(r.reports[0]! - reanchor.t).toBeGreaterThanOrEqual(SUSTAIN - EPS);
      expect(r.reports[0]! - reanchor.t).toBeLessThan(SUSTAIN + READ + 2 * DT);
      expect(r.grid.find((g) => g.t === r.passT!)!.speed).toBeGreaterThan(2);
    });

    describe("ROUND 4'S ESCAPES, BY NAME — ONE READING UNDER THE BRAKING LINE IS A DIP, NOT THE END OF THE BRAKE (the round-4 verifier's shapes: tap–release–slam, one stop with a dip, an ease with the pedal never off). The product's step re-arms on such a reading; round 4 ended the hold there and the due pass began on the dip or just after it, the car braking at 6–9 m/s² again within three grid points. The hold goes THROUGH it, to the very report, on the very grid point, of the world where the timer never comes due", () => {
      type Run = ReturnType<typeof scripted>;
      type Pt = Run["grid"][number];
      /** `law` — the car's deceleration by grid point j from the grid point the timer comes due on. */
      const drive = (law: (j: number) => number, spec?: Partial<RearTailgaterSpec>) =>
        scripted({ carDecel: (t, due) => law(gridFrom(t, due) - DUE_K), ...(spec ? { spec } : {}) });
      /** Every row: held from the due grid point through the dip to the ONE report, which is the no-timer world's. */
      const heldThroughTheDipToTheReport = (law: (j: number) => number, atDue: (due: Pt, r: Run) => void): Run => {
        const r = drive(law);
        expect(r.firstDueT).toBe(free.firstDueT);
        const due = r.grid.find((g) => g.t === r.firstDueT)!;
        // The car had been at the harsh line before the timer came due, and is not reported.
        expect(r.grid.some((g) => g.t < due.t && g.atLine)).toBe(true);
        expect(due.reported).toBe(false);
        atDue(due, r);
        expect(due.holding).toBe(true);
        // Held on every grid point from the due one…
        expect(r.passT).not.toBeNull();
        expect(r.passT!).toBeGreaterThan(r.firstDueT);
        for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
        // …to the ONE report, and released by it…
        expect(r.reports).toHaveLength(1);
        expect(r.passT!).toBe(r.reports[0]!);
        // …which is the no-timer world's report of this brake, on its grid point: the hold added nothing.
        const noTimer = drive(law, { pressureSec: 90 });
        expect(noTimer.passT).toBeNull();
        expect(noTimer.reports).toEqual(r.reports);
        return r;
      };
      /** The dip's readings under the braking line, and that the report is of the application AFTER them: the
       *  product's step re-armed on the dip, so its report comes the sustain after the car is braking again. */
      const dipOf = (r: Run) => {
        const firstAtLine = r.grid.find((g) => g.atLine)!;
        const dip = r.grid.filter((g) => g.t > firstAtLine.t && g.t < r.passT! && g.released);
        const lastUnder = dip[dip.length - 1]!;
        expect(r.reports[0]! - lastUnder.t).toBeGreaterThanOrEqual(SUSTAIN - EPS);
        expect(r.reports[0]! - lastUnder.t).toBeLessThan(SUSTAIN + READ + 3 * DT);
        return dip;
      };

      it("A RELEASE AS LONG AS THE PRODUCT'S READING WINDOW (three grid points, 0.05 s) IS NOT THE END OF THE BRAKE: the timer comes due on the one reading under the braking line, the car is braking at 9.3 m/s² again from the next grid point — the pass is held (round 4 began it here), and begins on the report", () => {
        const law = (j: number) => (j >= START && j < END ? (j >= -2 && j < 1 ? 0 : 9.3) : 0);
        const r = heldThroughTheDipToTheReport(law, (due, run) => {
          // One grid point before the timer the car was still held by every rule (its reading 3.1 m/s², the
          // reading window not yet empty)…
          const before = run.grid.find((g) => Math.abs(g.t - (run.firstDueT - DT)) < EPS)!;
          expect(before.holding).toBe(true);
          expect(before.r4holding).toBe(true);
          expect(run.readingAt(before.t)).toBeGreaterThanOrEqual(BRAKING_LINE_MPS2);
          // …and on the due grid point its reading is under the braking line: round 4's rule reads «the brake is
          // over», the rule reads «one reading».
          expect(run.readingAt(due.t)).toBeLessThan(BRAKING_LINE_MPS2);
          expect(due.released).toBe(true);
          expect(due.underRun).toBe(1);
          expect(due.r4holding).toBe(false);
          expect(run.grid.find((g) => Math.abs(g.t - (run.firstDueT + DT)) < EPS)!.decel).toBe(9.3);
        });
        expect(dipOf(r)).toHaveLength(1);
      });

      it("TAP – RELEASE – SLAM (the verifier's «0.15 s on / 0.05 s off / on»): the timer comes due two grid points AFTER the dip, the car already braking again at 6.2 m/s² and rising — round 4's hold was gone with the dip and its pass began here, +3.5 m/s² at a car braking at 9.3; held, and reported from the second application", () => {
        // 9.3 m/s² for nine grid points, off for three (j −4 … −2), then 9.3 for good.
        const law = (j: number) => (j >= -13 && j < -4 ? 9.3 : j >= -1 && j < END ? 9.3 : 0);
        const r = heldThroughTheDipToTheReport(law, (due, run) => {
          expect(run.readingAt(due.t)).toBeGreaterThan(6);
          expect(run.readingAt(due.t)).toBeLessThan(HARSH);
          expect(due.released).toBe(false);
          expect(due.atLine).toBe(false);
          expect(due.r4holding).toBe(false);
        });
        const dip = dipOf(r);
        expect(dip).toHaveLength(1);
        expect(dip[0]!.t).toBeLessThan(r.firstDueT);
      });

      it("TAP – A QUARTER OF A SECOND OFF THE PEDAL – SLAM: the timer comes due in the middle of the release, the car holding its speed — its hard brake is not over until it has stayed off the brake for the sustain, and 0.25 s is not the sustain: held through the release, and the second application is reported", () => {
        // 9.3 m/s² for nine grid points (j −16 … −8), off for fifteen (j −7 … 7: thirteen readings under the
        // braking line), then 9.3 for good.
        const law = (j: number) => (j >= -16 && j < -7 ? 9.3 : j >= 8 && j < END + 10 ? 9.3 : 0);
        const r = heldThroughTheDipToTheReport(law, (due, run) => {
          expect(run.readingAt(due.t)).toBe(0);
          expect(due.released).toBe(true);
          expect(due.underRun).toBeGreaterThan(3);
          expect(due.r4holding).toBe(false);
        });
        const dip = dipOf(r);
        expect(dip).toHaveLength(13);
        expect(dip.length).toBeLessThan(OVER_AFTER);
      });

      it("AN EASE WITH THE PEDAL NEVER OFF (the verifier's «eased to 1.9 m/s² for four grid points»): two readings under the braking line in the middle of one emergency stop, the timer due on the second — held, and reported", () => {
        const law = (j: number) => (j >= START && j < END ? (j >= -3 && j < 1 ? 1.9 : 9.3) : 0);
        const r = heldThroughTheDipToTheReport(law, (due, run) => {
          expect(run.readingAt(due.t)).toBeCloseTo(1.9, 6);
          expect(due.released).toBe(true);
          expect(due.underRun).toBe(2);
          expect(due.r4holding).toBe(false);
          // His pedal never came off: the car slowed on every grid point of the stop.
          for (const g of run.grid.filter((x) => x.t > run.dueT + START * DT + 2 * DT && x.t <= run.firstDueT + 10 * DT)) expect(g.decel, `t ${g.t}`).toBeGreaterThan(0);
        });
        expect(dipOf(r)).toHaveLength(2);
      });

      it("…and an ease to 2.1 m/s² is still braking by the product's line: no reading under it, the step never re-arms, and every rule since round 3 holds it (the control: the three rows above differ from it only in what round 4 read as «released»)", () => {
        const law = (j: number) => (j >= START && j < END ? (j >= -3 && j < 1 ? 2.1 : 9.3) : 0);
        const r = drive(law);
        const due = r.grid.find((g) => g.t === r.firstDueT)!;
        expect(r.readingAt(due.t)).toBeGreaterThanOrEqual(BRAKING_LINE_MPS2);
        expect(due.released).toBe(false);
        expect(due.r4holding).toBe(true);
        expect(due.holding).toBe(true);
        expect(r.reports).toHaveLength(1);
        expect(r.passT!).toBe(r.reports[0]!);
        expect(r.grid.filter((g) => g.t < r.passT! && g.released && g.t > r.dueT + START * DT + 3 * DT)).toEqual([]);
      });

      describe("THE TIE — «for the sustain» is the product's `>=`: the brake is over on the 25th reading in a row under the braking line (the first and the 24 after it span 24/60 s = 0.4 s), not on the 24th", () => {
        // 9.3 m/s² for nine grid points from j −30, off for `offN` grid points from j −21 (offN − 2 readings under
        // the braking line, the first on j −19), then 9.3 for good.
        const law = (offN: number) => (j: number) => (j >= -30 && j < -21 ? 9.3 : j >= -21 + offN && j < END + 10 ? 9.3 : 0);
        it("24 readings under the line, the car braking again on what would have been the 25th: NOT over — held, and the second application is reported", () => {
          const r = heldThroughTheDipToTheReport(law(26), (due) => {
            expect(due.released).toBe(true);
            expect(due.r4holding).toBe(false);
          });
          const dip = dipOf(r);
          expect(dip).toHaveLength(OVER_AFTER - 1);
          expect(Math.max(...dip.map((g) => g.underRun))).toBe(OVER_AFTER - 1);
          expect(dip[dip.length - 1]!.t - dip[0]!.t).toBeCloseTo(SUSTAIN - DT, 9);
        });
        it("25 readings under the line: OVER — the pass begins on the 25th, with no report, although the car brakes at 9.3 m/s² again from the next grid point on (F2 as it now stands: a pass commanded after the car's brake has been over for the sustain is «already pulling out»; the no-timer world reports that second brake)", () => {
          const r = drive(law(27));
          const due = r.grid.find((g) => g.t === r.firstDueT)!;
          expect(due.holding).toBe(true);
          expect(r.passT).not.toBeNull();
          const at = r.grid.find((g) => g.t === r.passT!)!;
          expect(at.underRun).toBe(OVER_AFTER);
          expect(at.over).toBe(true);
          const firstUnder = r.grid.find((g) => g.t > r.grid.find((x) => x.atLine)!.t && g.released)!;
          expect(r.passT! - firstUnder.t).toBeCloseTo(SUSTAIN, 9);
          for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
          expect(r.reports).toEqual([]);
          expect(r.grid.find((g) => Math.abs(g.t - (r.passT! + DT)) < EPS)!.decel).toBe(9.3);
          const noTimer = drive(law(27), { pressureSec: 90 });
          expect(noTimer.reports).toHaveLength(1);
          expect(noTimer.reports[0]!).toBeGreaterThan(r.passT!);
        });
      });

      it("A FIRM BRAKE BETWEEN TWO RELEASES STARTS THE COUNT AGAIN — any reading back at the BRAKING line does, not only one at the harsh line: two runs of 19 readings under the line (38 in all, never 25 in a row) with four grid points at 4 m/s² between them, then the slam: held throughout, and the slam is reported", () => {
        // 9.3 for nine grid points from j −30; off j −21 … −2; 4 m/s² on j −1 … 2; off j 3 … 22; 9.3 from j 23.
        const law = (j: number) => (j >= -30 && j < -21 ? 9.3 : j >= -1 && j < 3 ? 4 : j >= 23 && j < 60 ? 9.3 : 0);
        const r = heldThroughTheDipToTheReport(law, (due) => {
          expect(due.r4holding).toBe(false);
        });
        const firstAtLine = r.grid.find((g) => g.atLine)!;
        const span = r.grid.filter((g) => g.t > firstAtLine.t && g.t < r.passT!);
        const under = span.filter((g) => g.released);
        expect(under.length).toBeGreaterThanOrEqual(OVER_AFTER);
        expect(Math.max(...span.map((g) => g.underRun))).toBeLessThan(OVER_AFTER);
        // What restarted the count was never at the harsh line: the firm brake's readings are 2.7–4 m/s².
        const firm = span.filter((g) => !g.released && g.t > r.firstDueT - 3 * DT && g.t < r.firstDueT + 8 * DT);
        expect(firm.length).toBeGreaterThanOrEqual(3);
        for (const g of firm) expect(g.atLine, `t ${g.t}`).toBe(false);
      });
    });
  });

  it("A SECOND HARD BRAKE AFTER A COMPLETED REPORT IS HELD FOR AGAIN — the first brake is reported before the timer and holds nothing; he lets go for 0.1 s (the product's step re-arms) and brakes hard again 0.25 s before the timer: the pass waits for the SECOND report (the round-4 verifier's surviving mutant «no hold after a first report»)", () => {
    // 8 m/s² for 0.5 s from 0.85 s before the timer, off for 0.1 s, 8 m/s² again from 0.25 s before it.
    const law = (t: number, due: number) => ((t >= due - 0.85 && t < due - 0.35) || (t >= due - 0.25 && t < due + 0.3) ? 8 : 0);
    const r = scripted({ carDecel: law });
    expect(r.reports).toHaveLength(2);
    // The first report is out before the timer, and the brake it reported was let go before the second began.
    expect(r.reports[0]!).toBeLessThan(r.firstDueT - 0.3);
    expect(r.grid.some((g) => g.t > r.reports[0]! && g.t < r.firstDueT && g.released)).toBe(true);
    // On the due grid point the car is at the line again, in a brake the step has not reported: held.
    const due = r.grid.find((g) => g.t === r.firstDueT)!;
    expect(due.atLine).toBe(true);
    expect(due.reported).toBe(false);
    expect(due.holding).toBe(true);
    expect(r.passT!).toBeGreaterThan(r.firstDueT);
    for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
    // The pass begins on the second report's grid point — and both reports are the no-timer world's.
    expect(r.passT!).toBe(r.reports[1]!);
    const noTimer = scripted({ carDecel: law, spec: { pressureSec: 90 } });
    expect(noTimer.reports).toEqual(r.reports);
  });

  it("THE HOLD DOES NOT ASK HOW FAST HE IS GOING — over the engine's 35 км/ч floor (his own ledger bills him there) the due pass is held by the same rule: the car does not accelerate at a car braking hard ahead of it at any speed (the round-4 verifier's surviving mutant «hold only while the student is under 35 км/ч»)", () => {
    const brake = (t: number, due: number) => (t >= due - 0.25 && t < due + 0.65 ? 10 : 0);
    const r = scripted({ carDecel: brake, studentKmh: 50 });
    const due = r.grid.find((g) => g.t === r.firstDueT)!;
    expect(due.atLine).toBe(true);
    expect(due.holding).toBe(true);
    expect(r.passT!).toBeGreaterThan(r.firstDueT);
    expect(r.reports).toHaveLength(1);
    expect(r.passT!).toBe(r.reports[0]!);
    // …and it is the same hold, grid point for grid point, as under the floor.
    const under = scripted({ carDecel: brake });
    expect(r.passT!).toBe(under.passT!);
    expect(r.reports).toEqual(under.reports);
  });

  it("a FIRM brake of the car's (5 m/s², under the harsh line) at the due point holds nothing", () => {
    const r = scripted({ carDecel: (t, due) => (t >= due - 0.25 && t < due + 0.65 ? 5 : 0) });
    expect(r.grid.find((g) => g.t === r.firstDueT)!.atLine).toBe(false);
    expect(r.grid.find((g) => g.t === r.firstDueT)!.holding).toBe(false); // braking, but never at the harsh line: nothing to hold
    expect(r.passT!).toBe(r.firstDueT);
    expect(r.reports).toEqual([]);
  });

  it("THE STUDENT'S PEDAL IS NOT WHAT HOLDS IT: his full pedal with a car that has not braked does not hold the pass; the car's hard brake with his pedal up does", () => {
    // He is on the brake from 0.25 s before the timer; the scripted car holds its speed.
    const pedal = scripted({ carDecel: () => 0, studentBrakeFrom: (due) => due - 0.25 });
    expect(pedal.passT!).toBe(pedal.firstDueT);
    // The row above («THE DEFECT'S SHAPE») is the other half: `brakePedal` 0 throughout, and the pass was held.
    const car = scripted({ carDecel: (t, due) => (t >= due - 0.25 && t < due + 0.65 ? 10 : 0) });
    expect(car.passT!).toBeGreaterThan(car.firstDueT);
  });

  describe("THREE THINGS THE HOLD DOES NOT READ, PINNED AT THE LANDING (the round-5 verifier's three surviving mutants, condition C2 of its sign-off): whether the timer is due yet, where his pedal is, and whether he is standing", () => {
    it("«OVER» IS COUNTED ON EVERY GLUED GRID POINT, DUE OR NOT — a tap at the harsh line a second before the timer, then the pedal released for longer than the sustain BEFORE the pass is due: that brake is over, and a firm brake (4 m/s², never at the harsh line) the car is in when the timer comes due holds nothing — the pass begins on time (mutant «over counted only once the timer is due»)", () => {
      // 10 m/s² for 0.1 s from 1.3 s before the timer; off the brake for a whole second; 4 m/s² for 1 s from 0.2 s before it.
      const law = (t: number, due: number) => (t >= due - 1.3 && t < due - 1.2 ? 10 : t >= due - 0.2 && t < due + 0.8 ? 4 : 0);
      const r = scripted({ carDecel: law });
      // Antecedents, by the oracle's own arithmetic on the published speeds: the car WAS at the harsh line, in a brake
      // the product's step never reported…
      const tap = r.grid.filter((g) => g.atLine);
      expect(tap.length).toBeGreaterThanOrEqual(1);
      expect(tap.every((g) => g.t < r.firstDueT - 1)).toBe(true);
      expect(tap.every((g) => g.holding)).toBe(true);
      expect(r.reports).toEqual([]);
      // …that brake was OVER (the 25th reading in a row under the braking line) well before the timer came due…
      const over = r.grid.find((g) => g.t > tap[tap.length - 1]!.t && g.over)!;
      expect(over.underRun).toBe(OVER_AFTER);
      expect(over.t).toBeLessThan(r.firstDueT - 0.5);
      // …and on the due grid point the car is braking again — over the braking line, so nothing is «over» there, and
      // under the harsh line, so it is not a new hard brake either.
      const due = r.grid.find((g) => g.t === r.firstDueT)!;
      expect(due.released).toBe(false);
      expect(r.readingAt(due.t)).toBeGreaterThanOrEqual(BRAKING_LINE_MPS2);
      expect(r.readingAt(due.t)).toBeLessThan(HARSH);
      expect(due.atLine).toBe(false);
      expect(due.holding).toBe(false);
      // THE PIN: nothing is held — the pass begins on the first grid point the timer allows.
      expect(r.passT).not.toBeNull();
      expect(r.passT!).toBe(r.firstDueT);
      // THE OTHER SIDE, so that it is the «over» before the timer that frees the pass and not the firm brake: the same
      // tap only 0.3 s before that firm brake (0.5 s before the timer) is NOT over when the firm brake begins — fewer
      // than 25 readings under the line — and the pass is held through the whole firm brake, to the sustain after it.
      const near = scripted({ carDecel: (t, due2) => (t >= due2 - 0.5 && t < due2 - 0.4 ? 10 : t >= due2 - 0.2 && t < due2 + 0.8 ? 4 : 0) });
      expect(near.grid.some((g) => g.t > near.dueT - 0.5 && g.t < near.firstDueT && g.over)).toBe(false);
      expect(near.grid.find((g) => g.t === near.firstDueT)!.holding).toBe(true);
      expect(near.passT).not.toBeNull();
      expect(near.passT!).toBeGreaterThan(near.dueT + 0.8 + SUSTAIN - EPS);
      expect(near.passT!).toBe(near.grid.find((g) => g.t >= near.firstDueT && !g.holding)!.t);
      expect(near.reports).toEqual([]);
    });

    it("«OVER» DOES NOT ASK WHERE HIS PEDAL IS — the car's hard brake ends before the sustain and it holds its speed, while he keeps his foot on the brake the whole time: the pass begins on the 25th reading under the braking line, on the grid point it begins with his pedal up (mutant «over also needs the student's pedal off»)", () => {
      const brake = (t: number, due: number) => (t >= due - 0.25 && t < due + 0.05 ? 10 : 0);
      // His pedal is down from 0.3 s before the timer and never comes up again.
      const r = scripted({ carDecel: brake, studentBrakeFrom: (due) => due - 0.3 });
      const free = scripted({ carDecel: brake });
      expect(free.passT).not.toBeNull();
      expect(free.passT!).toBeGreaterThan(free.firstDueT);
      // Antecedent: his pedal is down on every grid point from the due one to the end of the row (and up in the control).
      expect(r.grid.filter((g) => g.t >= r.firstDueT).every((g) => g.pedal === 1)).toBe(true);
      expect(free.grid.every((g) => g.pedal === 0)).toBe(true);
      // Held at the due point by the car's own unreported hard brake…
      const due = r.grid.find((g) => g.t === r.firstDueT)!;
      expect(due.atLine).toBe(true);
      expect(due.holding).toBe(true);
      // THE PIN: …and released by the car's brake being over, his pedal still down: a pass, on the 25th reading in a
      // row under the braking line, the very grid point of the pedal-up control.
      expect(r.passT).not.toBeNull();
      const iUnder = r.grid.findIndex((g) => g.t >= r.firstDueT && r.readingAt(g.t) < BRAKING_LINE_MPS2);
      const run = r.grid.slice(iUnder, iUnder + OVER_AFTER);
      for (const g of run) expect(r.readingAt(g.t), `t ${g.t}`).toBeLessThan(BRAKING_LINE_MPS2);
      expect(r.passT!).toBe(run[OVER_AFTER - 1]!.t);
      expect(r.passT!).toBe(free.passT!);
      expect(r.grid.find((g) => g.t === r.passT!)!.pedal).toBe(1);
      // He was still moving when it began (so this is not the standstill row below), and nothing was reported.
      expect(r.grid.find((g) => g.t === r.passT!)!.studentKmh).toBeGreaterThan(1);
      expect(r.reports).toEqual([]);
    });

    it("THE HOLD DOES NOT END BECAUSE HE HAS STOPPED — he brakes to a standstill and stands; the car behind him, late on its brake, is at the harsh line and unreported when he comes to rest with its pass already due: the pass is NOT commanded on the grid point he stops (the car is still braking at 10 m/s² for him) — it waits for the car's own report, grid points later, as in the world where the timer never comes due (mutant «the hold ends the moment the student is at rest»)", () => {
      // He is on the brake from 0.9 s before the timer (9 m/s at 9.5 m/s²: at rest three grid points after it);
      // the car brakes at 10 m/s² only from 0.2 s before the timer.
      const brake = (t: number, due: number) => (t >= due - 0.2 && t < due + 0.7 ? 10 : 0);
      const r = scripted({ carDecel: brake, studentBrakeFrom: (due) => due - 0.9 });
      // Antecedents: the first grid point he is at rest is a DUE one…
      const rest = r.grid.find((g) => g.studentKmh === 0)!;
      expect(rest.t).toBeGreaterThanOrEqual(r.firstDueT);
      expect(rest.t - r.firstDueT).toBeLessThan(6 * DT);
      // …and on it the car is at the harsh line in a brake the product's step has not reported.
      expect(rest.atLine).toBe(true);
      expect(rest.reported).toBe(false);
      expect(rest.holding).toBe(true);
      // THE PIN: no pass on that grid point, nor on any other he stands on before the car's brake is reported…
      expect(r.passT).not.toBeNull();
      expect(r.passT!).toBeGreaterThan(rest.t + 5 * DT);
      for (const g of r.grid.filter((x) => x.t >= rest.t && x.t < r.passT!)) {
        expect(g.studentKmh, `t ${g.t}`).toBe(0);
        expect(g.holding, `t ${g.t}`).toBe(true);
        expect(g.atLine, `t ${g.t}`).toBe(true);
      }
      // …the pass begins on the report's own grid point, and the report is the no-timer world's.
      expect(r.reports).toHaveLength(1);
      expect(r.passT!).toBe(r.reports[0]!);
      const noTimer = scripted({ carDecel: brake, studentBrakeFrom: (due) => due - 0.9, spec: { pressureSec: 90 } });
      expect(noTimer.reports).toEqual(r.reports);
      expect(noTimer.passT).toBeNull();
    });
  });

  it("only a CLOSE FOLLOWER's brake holds it: with him out of the car's lane, or on a port that publishes no lane width, the same hard brake at the due point holds nothing", () => {
    const brake = (t: number, due: number) => (t >= due - 0.25 && t < due + 0.65 ? 10 : 0);
    const out = scripted({ carDecel: brake, studentOffM: () => -4 });
    expect(out.passT!).toBe(out.firstDueT);
    expect(out.reports).toEqual([]);
    const fake = scripted({ carDecel: brake, view: (v) => ({ ...v, laneWidthM: undefined }) });
    expect(fake.passT!).toBe(fake.firstDueT);
    expect(fake.reports).toEqual([]);
  });

  it("ENDED WHEN HE IS NO LONGER AHEAD OF IT IN ITS LANE — he leaves the car's lane in the middle of its unreported hard brake, for good: the account starts afresh and the hold with it, on that grid point, and the pass begins, the car still braking hard", () => {
    const brake = (t: number, due: number) => (t >= due - 0.25 && t < due + 0.65 ? 10 : 0);
    // He is in its lane until 0.1 s after the timer, then 4 m to the side (out of the 3.5 m lane's reach).
    const probe = scripted({ carDecel: brake });
    const leaveT = probe.dueT + 0.1;
    const r = scripted({ carDecel: brake, studentOffM: (t) => (t >= leaveT - EPS ? -4 : 0) });
    const due = r.grid.find((g) => g.t === r.firstDueT)!;
    expect(due.holding).toBe(true);
    expect(r.passT).not.toBeNull();
    expect(r.passT!).toBeGreaterThan(r.firstDueT);
    // The oracle here reads the car's speed alone and still calls it at the line, in an unreported hard brake…
    const at = r.grid.find((g) => g.t === r.passT!)!;
    expect(at.holding).toBe(true);
    expect(at.atLine).toBe(true);
    // …so what released it is that he is no longer ahead of it in its lane: the first such grid point.
    expect(r.passT! - leaveT).toBeLessThan(DT + EPS);
    expect(r.passT! - leaveT).toBeGreaterThan(-EPS);
    expect(r.reports).toEqual([]);
  });

  it("A STATION RUNNER IS HELD BY THE SAME RULE (passShiftM 0, the student ahead in its lane): its pass command waits for the report too — one rule, though a station pass moves the car no differently", () => {
    // sc-merge-lane-end's kind of tailgater: its own lane continues, so its «pass» with him ahead is keeping
    // station under the same matchPlayer law. The hold only moves WHEN the pass is commanded (the round-2
    // verifier's surviving mutant applied the hold to shifted passes only, and no row noticed).
    const brake = (t: number, due: number) => (t >= due - 0.25 && t < due + 0.65 ? 10 : 0);
    const r = scripted({ carDecel: brake, spec: { passShiftM: 0 } });
    const due = r.grid.find((g) => g.t === r.firstDueT)!;
    expect(due.holding).toBe(true);
    expect(r.reports).toHaveLength(1);
    expect(r.passT!).toBeGreaterThan(r.firstDueT);
    expect(r.passT!).toBe(r.reports[0]!);
    // What it commands when it does begin is the station law, never the cruise — and the shift is to where it is.
    const atPass = r.commands.filter((x) => x.t === r.passT!).map((x) => x.c);
    expect(atPass.map((c) => c.type)).toEqual(["passGuard", "matchPlayer", "laneShift"]);
    expect((atPass[0] as { on: boolean }).on).toBe(false);
    expect((atPass[2] as { toOffsetM: number }).toOffsetM).toBe(0);
    expect(r.commands.some((x) => x.c.type === "cruise")).toBe(false);
    // …and a station runner whose car is not braking is commanded on time.
    const free = scripted({ carDecel: () => 0, spec: { passShiftM: 0 } });
    expect(free.passT!).toBe(free.firstDueT);
  });

  it("A RE-ANCHOR BEFORE THE TIMER, ON A GRID POINT AT THE LINE: with a gentle lead-in the product's window re-anchors once before the pass is due; the hold goes on, and the report still comes and releases it", () => {
    // 3 m/s² for 0.3 s (a window opens, its mean far under the line), then 7.5 m/s² until the car stands;
    // the hard part begins 0.15 s before the timer, so the car is at the line when the pass comes due.
    const r = scripted({ carDecel: (t, due) => (t >= due - 0.45 && t < due - 0.15 ? 3 : t >= due - 0.15 ? 7.5 : 0) });
    expect(r.grid.find((g) => g.t === r.firstDueT)!.atLine).toBe(true);
    expect(r.passT).not.toBeNull();
    expect(r.passT!).toBeGreaterThan(r.firstDueT);
    expect(r.reports).toHaveLength(1);
    expect(r.passT!).toBe(r.reports[0]!);
    // The report is the RE-ANCHORED window's: later than the sustain after the hard part began.
    expect(r.reports[0]! - (r.dueT - 0.15)).toBeGreaterThan(SUSTAIN + 2 * DT);
    const heldSec = r.passT! - r.firstDueT;
    for (const g of r.grid.filter((x) => x.t >= r.firstDueT && x.t < r.passT!)) expect(g.holding, `t ${g.t}`).toBe(true);
    // …and no longer than two sustains: far inside any bound of the hold.
    expect(heldSec).toBeLessThan(9 / BRAKING_LINE_MPS2);
    expect(heldSec).toBeLessThanOrEqual(2 * SUSTAIN + READ + 2 * DT);
  });

  it("PROPERTY — A PASS ALWAYS BEGINS, and on the first grid point from the due one on which the car's hard brake is reported or over: 400 seeded random brakes of the car (a level redrawn every 1–6 grid points — half of them from 0–11 m/s² with releases, half from the emergency range 5.5–11 — begun up to 0.6 s before the timer, 4 s long), every hold ended by the report or by the 25th reading in a row under the braking line, and inside its bound", () => {
    let seed = 20261012;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    let held = 0;
    let endedByReport = 0;
    let endedByOver = 0;
    let throughReanchor = 0;
    let throughRelease = 0;
    let longest = 0;
    for (let n = 0; n < 400; n++) {
      const start = -Math.floor(rnd() * 37);
      const segs: Array<[number, number]> = [];
      for (let j = start; j < 240; ) {
        const len = 1 + Math.floor(rnd() * 6);
        segs.push([j + len, n % 2 === 0 ? (rnd() < 0.15 ? 0 : rnd() * 11) : rnd() < 0.03 ? 0 : 5.5 + rnd() * 5.5]);
        j += len;
      }
      const law = (j: number) => {
        for (const [end, a] of segs) if (j < end) return a;
        return 0;
      };
      const r = scripted({
        carDecel: (t, due) => {
          const j = gridFrom(t, due);
          return j >= start ? law(j) : 0;
        },
      });
      const label = `brake ${n}`;
      // It begins — never before it is due, and exactly on the first grid point the rule lets it.
      expect(r.passT, label).not.toBeNull();
      const first = r.grid.find((g) => g.t >= r.firstDueT && !g.holding)!;
      expect(r.passT!, label).toBe(first.t);
      if (r.passT! > r.firstDueT) {
        held++;
        longest = Math.max(longest, r.passT! - r.firstDueT);
        const iPass = r.grid.findIndex((g) => g.t === r.passT!);
        const at = r.grid[iPass]!;
        // Ended by the report, or by the brake being over — by nothing else.
        if (r.reports.includes(at.t)) endedByReport++;
        else {
          expect(at.over, label).toBe(true);
          expect(at.underRun, label).toBe(OVER_AFTER);
          endedByOver++;
        }
        // THE BOUND: from the first grid point of this hold (walk back while the rule holds) the pass is at most
        // 4.5 s for each m/s of that grid point's speed away, plus the sustain — and at most the sustain after
        // the car's last reading at the braking line.
        let i0 = iPass - 1;
        while (i0 > 0 && r.grid[i0 - 1]!.holding) i0--;
        expect(at.t - r.grid[i0]!.t, label).toBeLessThanOrEqual((4.5 * r.grid[i0]!.speed + SUSTAIN) * (1 + 1e-9));
        let iLastBraking = iPass;
        while (iLastBraking > 0 && r.grid[iLastBraking]!.released) iLastBraking--;
        expect(iPass - iLastBraking, label).toBeLessThanOrEqual(OVER_AFTER);
        // Round 3's escape class: held on a grid point where the product's window stood re-anchored, uncredited.
        if (r.grid.some((g) => g.t >= r.firstDueT && g.t < at.t && g.holding && !g.open)) throughReanchor++;
        // Round 4's escape class: held on a grid point where round 4's rule read the brake as over.
        if (r.grid.some((g) => g.t >= r.firstDueT && g.t < at.t && g.holding && !g.r4holding)) throughRelease++;
      } else {
        expect(r.grid.find((g) => g.t === r.firstDueT)!.holding, label).toBe(false);
      }
    }
    // The draw contains every class: held and not, both endings, and holds through a re-anchored window and
    // through readings under the braking line.
    expect(held).toBeGreaterThan(150);
    expect(400 - held).toBeGreaterThan(100);
    expect(endedByReport).toBeGreaterThan(80);
    expect(endedByOver).toBeGreaterThan(50);
    expect(throughReanchor).toBeGreaterThan(10);
    expect(throughRelease).toBeGreaterThan(30);
    // The longest hold in the draw: the random car has stopped within 4 s and is let go the sustain after.
    expect(longest).toBeLessThan(4 + SUSTAIN + DT);
  });
});

// ---------------------------------------------------------------------------
// 2. THE REAL TRAFFIC SYSTEM — the lesson's own car on ln-v1, a kinematic student.
// ---------------------------------------------------------------------------

/**
 * `law` — his deceleration by time since the pedal, m/s² (an uneven emergency stop); without it, the rig's
 * full pedal (9.5 m/s² × clamp(0.45 v) + 0.5 of drag). `noTimer` — the same world with the pass timer never
 * due (pressureSec 90): what the car does when nothing takes it off his tail.
 */
function live(o: { cruiseKmh: number; brakeAt: number; law?: (sinceSec: number) => number; noTimer?: boolean }) {
  const tr = createTrafficSystem(LN, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  const commands: Array<{ t: number; type: string }> = [];
  let now = 0;
  const port = new Proxy(tr as unknown as StagedTrafficPort, {
    get(target, prop, recv) {
      if (prop === "stagedCommand")
        return (id: string, c: StagedCommand) => {
          commands.push({ t: now, type: c.type });
          return (target as StagedTrafficPort).stagedCommand(id, c);
        };
      return Reflect.get(target, prop, recv);
    },
  });
  const runner = new RearTailgaterRunner(o.noTimer ? { ...TAILGATER, pressureSec: 90 } : TAILGATER);
  runner.stage(port, () => 0.5, true);
  const cruise = o.cruiseKmh / 3.6;
  let y = 15;
  let v = 0;
  let braking = false;
  const oracle = carOracle();
  const reports: number[] = [];
  const grid: Array<{ t: number; carV: number; gapM: number } & OracleStep> = [];
  for (let i = 1; i * DT < 40; i++) {
    const t = i * DT;
    now = t;
    if (t >= o.brakeAt) braking = true;
    if (braking) v = Math.max(0, v - (o.law ? o.law(t - o.brakeAt) : 9.5 * Math.min(1, 0.45 * v) + 0.5) * DT);
    else v = Math.min(cruise, v + 1.95 * DT);
    y += v * DT;
    tr.update(DT, { signalPhase: () => "green", playerPos: { x: LANE_X, y }, playerSpeedKmh: v * 3.6, playerHeadingDeg: 0 });
    const out: SimTickEvent[] = [];
    runner.step(port, { tSec: t, dtSec: DT, x: LANE_X, y, speedKmh: v * 3.6, headingDeg: 0, brakePedal: braking ? 1 : 0, tickEvents: [] } satisfies DirectorInput, out);
    for (const e of out) if (e.kind === "followerBraked") reports.push(t);
    const a = tr.staged(TAILGATER.id)!;
    grid.push({ t, carV: a.speedMps, gapM: y - a.y, ...oracle.step(t, a.speedMps) });
  }
  const passT = commands.find((c) => c.type === "laneShift")?.t ?? null;
  return { passT, reports, grid };
}

describe("RearTailgaterRunner · the lesson's own car on ln-v1: a brake check as its pass comes due (63c0c28c C2a)", () => {
  const CRUISE = 25; // км/ч — under the 35 км/ч floor, as on the rig's TTF25 drive
  const free = live({ cruiseKmh: CRUISE, brakeAt: 1000 });
  const DUE = free.passT!;

  it("the timeline: left alone, its pass is commanded once, a little over 12 s after it glued", () => {
    expect(free.passT).not.toBeNull();
    expect(free.reports).toEqual([]);
    // Up to its pass the car never brakes hard on its own (the end of its road, 20 s later, is another matter).
    expect(free.grid.filter((g) => g.t <= free.passT! + 1).every((g) => !g.atLine)).toBe(true);
    // Glued by 8 s and the pass 12 s of pressure later — the lesson's own numbers.
    expect(free.passT!).toBeGreaterThan(12);
    expect(free.passT!).toBeLessThan(20);
  });

  it("a full-pedal brake check 0.27 s before the pass is due (the rig's TTF25): the pass is held, the car holds the harsh line for the sustain and reports, and only then pulls out — it never speeds up at him first", () => {
    const r = live({ cruiseKmh: CRUISE, brakeAt: DUE - 0.267 });
    const due = r.grid.find((g) => Math.abs(g.t - DUE) < EPS)!;
    expect(due.atLine).toBe(true); // braking hard for him on the grid point the timer came due
    expect(due.reported).toBe(false);
    expect(r.reports).toHaveLength(1);
    expect(r.passT!).toBe(r.reports[0]!);
    expect(r.passT! - DUE).toBeGreaterThan(0.1);
    expect(r.passT! - DUE).toBeLessThan(SUSTAIN);
    // From his pedal to its pass the car only ever slows.
    const span = r.grid.filter((g) => g.t >= DUE - 0.267 - EPS && g.t <= r.passT! + EPS);
    for (let i = 1; i < span.length; i++) expect(span[i]!.carV, `t ${span[i]!.t}`).toBeLessThanOrEqual(span[i - 1]!.carV + EPS);
    // It shed the product's own harsh amount (7 m/s² × 0.4 s) behind him before it left.
    expect(span[0]!.carV - span[span.length - 1]!.carV).toBeGreaterThanOrEqual(HARSH * SUSTAIN);
  });

  it("at EVERY pedal time from 1 s before the pass is due to 0.2 s after it, the pass never begins while the car is still in an unreported hard brake of its own — and it always begins", () => {
    const bad: string[] = [];
    let held = 0;
    let onTime = 0;
    let longest = 0;
    for (let k = -60; k <= 12; k++) {
      const r = live({ cruiseKmh: CRUISE, brakeAt: DUE + k * DT });
      if (r.passT === null) {
        bad.push(`pedal ${k}: the pass never began`);
        continue;
      }
      const at = r.grid.find((g) => g.t === r.passT)!;
      // The report's own grid point is where a reported brake's pass begins: `holding` is already false there.
      if (at.holding) bad.push(`pedal ${k}: pass at ${r.passT} inside the car's unreported hard brake`);
      if (r.passT < DUE - EPS) bad.push(`pedal ${k}: pass before it was due`);
      // Held ⇔ the car was in an unreported hard brake on the grid point the timer came due.
      const due = r.grid.find((g) => Math.abs(g.t - DUE) < EPS)!;
      if (due.holding !== r.passT > DUE + EPS) bad.push(`pedal ${k}: held ${r.passT > DUE + EPS}, the car in an unreported hard brake ${due.holding}`);
      if (r.passT > DUE + EPS) {
        held++;
        longest = Math.max(longest, r.passT - DUE);
        // A held pass begins on the first grid point the car is no longer in that brake, never later…
        const first = r.grid.find((g) => g.t >= DUE - EPS && !g.holding)!;
        if (r.passT !== first.t) bad.push(`pedal ${k}: pass at ${r.passT}, the hold was over at ${first.t}`);
        // …and on the rig's steady full pedal that is always the report's own grid point.
        if (!r.reports.includes(r.passT)) bad.push(`pedal ${k}: released without a report`);
      } else onTime++;
    }
    expect(bad).toEqual([]);
    // Both classes are in the sweep: pedals the car had already answered at the line and not yet for 0.4 s (held), and
    // pedals after the pass, too close before it for the car to have braked hard yet, or long enough before it
    // that the report was already out (on time).
    expect(held).toBeGreaterThan(10);
    expect(onTime).toBeGreaterThan(10);
    // On a steady full pedal no hold outlasts the sustain: the report releases it.
    expect(longest).toBeLessThan(SUSTAIN + EPS);
  });

  /**
   * ONE UNEVEN SHAPE, the pedal on each of the 36 grid points (0.6 s) before the timer, against the same drive in the
   * world where the timer never comes due. `bad` lists every pedal at which the rule does not hold:
   *   · the pass begins, never before it is due and never while the car is still in an unreported hard brake;
   *   · it is held exactly when the car was in one on the grid point the timer came due;
   *   · until its pass is commanded the car IS the no-timer world's car, grid point for grid point;
   *   · it never reports what that world does not, and never at another time: its reports are that world's, in
   *     order, up to its pass;
   *   · a held pass that the no-timer world's car holds from the due point to its next report is reported here on
   *     that grid point and begins there; a held pass that no report lets go begins when the brake is OVER — on
   *     the 25th reading in a row under the braking line.
   * The counts say what the sweep contained.
   */
  function unevenSweep(law: (dt: number) => number) {
    const bad: string[] = [];
    /** Pedals at which the timer came due on a reading UNDER the harsh line inside an unreported hard brake — round 2's escape. */
    let underLineAtDue = 0;
    /** Pedals at which, from the due point to the pass, the product's window stood re-anchored with nothing credited
     *  (round 3's rule: «not open») while the car was still in its hard brake — round 3's escape. */
    let heldThroughReanchor = 0;
    /** Pedals at which, from the due point to the pass, the car was held on a grid point where round 4's rule read
     *  its brake as over (a reading under the braking line since it was last at the harsh line) — round 4's escape. */
    let heldThroughRelease = 0;
    let reported = 0;
    let longest = 0;
    for (let k = -36; k <= -1; k++) {
      const brakeAt = DUE + k * DT;
      const r = live({ cruiseKmh: CRUISE, brakeAt, law });
      const cf = live({ cruiseKmh: CRUISE, brakeAt, law, noTimer: true });
      if (r.passT === null) {
        bad.push(`pedal ${k}: the pass never began`);
        continue;
      }
      if (cf.passT !== null) bad.push(`pedal ${k}: the no-timer world passed`);
      const at = r.grid.find((g) => g.t === r.passT)!;
      const due = r.grid.find((g) => Math.abs(g.t - DUE) < EPS)!;
      if (at.holding) bad.push(`pedal ${k}: pass at ${r.passT} inside the car's unreported hard brake`);
      if (r.passT < DUE - EPS) bad.push(`pedal ${k}: pass before it was due`);
      if (due.holding !== r.passT > DUE + EPS) bad.push(`pedal ${k}: held ${r.passT > DUE + EPS}, in an unreported hard brake at the due point ${due.holding}`);
      longest = Math.max(longest, r.passT - DUE);
      // Until its pass is commanded the car IS the no-timer world's car, grid point for grid point.
      for (let i = 0; i < r.grid.length && r.grid[i]!.t <= r.passT + EPS; i++) {
        if (r.grid[i]!.carV !== cf.grid[i]!.carV) {
          bad.push(`pedal ${k}: the car left the no-timer world's speed at ${r.grid[i]!.t}, before its pass at ${r.passT}`);
          break;
        }
      }
      // It never reports what that world does not, and never at another time: its reports are that world's, in
      // order, up to its pass (a brake reported before the timer and a second one after a release are two).
      if (r.reports.some((t, i) => t !== cf.reports[i])) bad.push(`pedal ${k}: reports at ${r.reports.join(", ")}, the no-timer world's at ${cf.reports.join(", ")}`);
      if (r.reports.some((t) => t > r.passT! + EPS)) bad.push(`pedal ${k}: a report after its pass`);
      // The no-timer world reports this brake at or after the due point, and its car is in that hard brake — not
      // over, not reported — from the due point to that report ⇒ it is reported here too, on that grid point, and
      // the pass begins on the report.
      const cfNext = cf.reports.find((t) => t >= DUE - EPS) ?? null;
      const cfHeldToReport = cfNext !== null && cf.grid.filter((g) => g.t >= DUE - EPS && g.t < cfNext - EPS).every((g) => g.holding);
      if (due.holding && cfHeldToReport) {
        if (!r.reports.includes(cfNext!)) bad.push(`pedal ${k}: in its hard brake from the due point to the no-timer world's report at ${cfNext}, no report here`);
        else if (r.passT !== cfNext) bad.push(`pedal ${k}: pass at ${r.passT}, report at ${cfNext}`);
        if (!due.atLine) underLineAtDue++;
        if (r.grid.some((g) => g.t >= DUE - EPS && g.t < r.passT! - EPS && g.holding && !g.open)) heldThroughReanchor++;
        if (r.grid.some((g) => g.t >= DUE - EPS && g.t < r.passT! - EPS && g.holding && !g.r4holding)) heldThroughRelease++;
        reported++;
      }
      // A held pass that no report let go was let go because the brake was over, by nothing else.
      if (due.holding && !r.reports.includes(r.passT) && !(at.over && at.underRun === OVER_AFTER)) {
        bad.push(`pedal ${k}: held, not released by a report, and let go on reading ${at.underRun} under the braking line (${at.reading.toFixed(2)} m/s²)`);
      }
    }
    return { bad, underLineAtDue, heldThroughReanchor, heldThroughRelease, reported, longest };
  }

  describe("an UNEVEN brake check (the round-2 verifier's F1 shapes) as the pass comes due: until its brake is reported the car is the car of the world where the timer never comes due", () => {
    const SHAPES: Array<[string, (dt: number) => number]> = [
      ["9.3 m/s² dipping to 6.0 for 0.10 s", (dt) => (dt >= 0.2 && dt < 0.3 ? 6.0 : 9.3)],
      ["9.3 m/s² dipping to 5.0 for 0.07 s", (dt) => (dt >= 0.25 && dt < 0.25 + 4 * DT ? 5.0 : 9.3)],
      ["9.3 m/s² dipping to 6.5 for 0.07 s", (dt) => (dt >= 0.15 && dt < 0.15 + 4 * DT ? 6.5 : 9.3)],
      ["8 ± 1.5 m/s² at 5 Hz", (dt) => 8 + 1.5 * Math.sin(2 * Math.PI * 5 * dt)],
      // Releases of one and two grid points never read under the braking line (the reading spans three); longer
      // ones do, and are round 4's escapes — named below.
      ["full pedal released for one grid point every 0.35 s", (dt) => (Math.round(dt / DT) % 22 < 21 ? 9.3 : 0)],
      ["full pedal released for two grid points every 0.25 s", (dt) => (Math.round(dt / DT) % 17 < 15 ? 9.3 : 0)],
    ];
    for (const [name, law] of SHAPES) {
      it(`${name}: at every pedal time in the last 0.6 s before the timer, the pass never begins inside the car's unreported hard brake, and every brake the no-timer world reports with the car in it from the due point is reported here on the same grid point`, () => {
        const s = unevenSweep(law);
        expect(s.bad).toEqual([]);
        // The escape's own class is in the sweep: the timer due on a dip.
        expect(s.underLineAtDue).toBeGreaterThanOrEqual(2);
        expect(s.reported).toBeGreaterThan(15);
        // The hold is released by the report: never longer than the sustain plus the shape's dips.
        expect(s.longest).toBeLessThan(SUSTAIN + 0.2);
      });
    }
  });

  describe("ROUND 3'S ESCAPES, BY NAME (the re-anchor mid-brake): the product's step closes its window as not emergency-grade on a reading under the line while the car is still braking hard for him — the pass is held through it, and the brake is reported on the no-timer world's grid point", () => {
    /**
     * The round-3 verifier's seeded random uneven emergency stops — its probe's own generator (seed 12345): a rise
     * of 0–0.4 s (linear, or a firm plateau of 3–5.5 m/s²), then a level redrawn every 2–5 grid points from
     * 5.5–10 m/s². Shape 26 is «rand26»: a 0.033 s rise to 9.6 m/s², 6.0–7.5 m/s² for 0.4 s, then 8.9.
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
    const SHAPES: Array<[string, (dt: number) => number]> = [
      // The builder's search shape «lead4/0.25+dip6@0.383»: 14 of its 49 pedal times escaped round 3 at L3.
      ["THE BUILDER'S LEAD-IN + DIP — 4 m/s² for 0.25 s, then 9.3 with a dip to 6.0 for 0.1 s from 0.383 s", (dt) => (dt < 15 * DT - EPS ? 4 : dt >= 23 * DT - EPS && dt < 29 * DT - EPS ? 6.0 : 9.3)],
      // The round-3 verifier's «rand26/ramp0.033»: 26 of its 36 pedal times escaped round 3 at L3.
      ["THE VERIFIER'S SEEDED RANDOM SHAPE rand26 — no lead-in: 9.6 m/s², 6.0–7.5 for 0.4 s, then 8.9", verifierRandomShape(26)],
    ];
    it("the generator is the verifier's: rand26 rises in 0.033 s to 9.60 m/s², then 6.78, 5.99, 6.64 …", () => {
      const law = verifierRandomShape(26);
      expect(law(0.04)).toBeCloseTo(9.601, 3);
      expect(law(6 * DT)).toBeCloseTo(6.777, 3);
      expect(law(10 * DT)).toBeCloseTo(5.987, 3);
      expect(law(13 * DT)).toBeCloseTo(6.643, 3);
      expect(law(30 * DT)).toBeCloseTo(8.857, 3);
    });
    for (const [name, law] of SHAPES) {
      it(`${name}: at every pedal time in the last 0.6 s before the timer the rule holds, and the sweep contains the escape — a pass held through a re-anchored window to the report`, () => {
        const s = unevenSweep(law);
        expect(s.bad).toEqual([]);
        // Round 3's escape is in the sweep and is reported here: the product's window re-anchored with nothing
        // credited, the car still in its hard brake, the pass due — and held.
        expect(s.heldThroughReanchor).toBeGreaterThanOrEqual(10);
        expect(s.reported).toBeGreaterThan(15);
        // The hold ends with the report of the NEXT window: at most the sustain after the re-anchor, which itself
        // falls at most the sustain after the brake began.
        expect(s.longest).toBeLessThan(2 * SUSTAIN + 0.2);
      });
    }
  });

  describe("ROUND 4'S ESCAPES, BY NAME, ON THE LESSON'S OWN CAR (one reading under the braking line is a dip): the car, answering a student who lets go for 0.05 s or eases for four grid points in the middle of his emergency stop, reads under 2 m/s² once or twice — round 4 let the due pass go there. It is held through it, and the brake is reported on the no-timer world's grid point", () => {
    /**
     * The round-4 verifier's seeded random stops WITH RELEASES — its probe's own generator (seed 424242): a linear
     * rise of 0–0.4 s to 9 m/s², then a level redrawn every 2–6 grid points: 15 % a release (0–1.9 m/s²), 15 % a firm
     * 2–5.5, the rest 5.5–10. Shape 92 is «rr92»: a 0.05 s rise, 8.5–9.2 m/s² to 0.333 s, 0.46 m/s² for four grid
     * points, then 9.1 again.
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
    it("the generator is the verifier's: rr92 rises in 0.05 s, holds 9.21 / 8.55 / 8.90 m/s², lets go to 0.46 from 0.333 s to 0.4 s, and is back at 9.11", () => {
      const law = verifierRandomShapeWithReleases(92);
      expect(law(0.025)).toBeCloseTo(4.5, 3);
      expect(law(0.1)).toBeCloseTo(9.21, 2);
      expect(law(0.2)).toBeCloseTo(8.55, 2);
      expect(law(0.3)).toBeCloseTo(8.9, 2);
      expect(law(0.34)).toBeCloseTo(0.46, 2);
      expect(law(0.39)).toBeCloseTo(0.46, 2);
      expect(law(0.41)).toBeCloseTo(9.11, 2);
    });
    const SHAPES: Array<[string, (dt: number) => number, number]> = [
      // The verifier's «on0.15/off0.050/on»: its frame-by-frame example (pass commanded on a reading of 5.91).
      ["TAP – RELEASE – SLAM: full pedal for 0.15 s, off for 0.05 s, full pedal", (dt) => (dt < 0.15 - EPS ? 9.3 : dt < 0.2 - EPS ? 0 : 9.3), 5],
      // The verifier's «on0.25/off0.200/on»: the pass was commanded while he was off the pedal.
      ["TAP – 0.2 s OFF THE PEDAL – SLAM: full pedal for 0.25 s, off for 0.2 s, full pedal", (dt) => (dt < 0.25 - EPS ? 9.3 : dt < 0.45 - EPS ? 0 : 9.3), 5],
      // The verifier's «dip0x3@0.2»: one emergency stop with a three-grid-point release.
      ["ONE EMERGENCY STOP WITH A THREE-GRID-POINT RELEASE at 0.2 s", (dt) => (dt >= 0.2 - EPS && dt < 0.2 + 3 * DT - EPS ? 0 : 9.3), 3],
      // The verifier's «on0.25/ease1.9x0.1/on»: his pedal never came off.
      ["AN EASE WITH THE PEDAL NEVER OFF: full pedal, 1.9 m/s² from 0.25 s to 0.35 s, full pedal", (dt) => (dt >= 0.25 - EPS && dt < 0.35 - EPS ? 1.9 : 9.3), 3],
      // The verifier's «rr92/ramp0.050»: 22 of its 36 pedal times escaped round 4 at L3.
      ["THE VERIFIER'S SEEDED RANDOM STOP WITH A RELEASE rr92", verifierRandomShapeWithReleases(92), 5],
    ];
    for (const [name, law, atLeast] of SHAPES) {
      it(`${name}: at every pedal time in the last 0.6 s before the timer the rule holds, and the sweep contains the escape — a pass held through a reading under the braking line to the report`, () => {
        const s = unevenSweep(law);
        expect(s.bad).toEqual([]);
        // Round 4's escape is in the sweep and is reported here: the car read under the braking line after it had
        // been at the harsh line, the pass due on that reading or after it — and held, to the no-timer world's report.
        expect(s.heldThroughRelease).toBeGreaterThanOrEqual(atLeast);
        expect(s.reported).toBeGreaterThan(10);
        // The hold ends with the report of the application after the release: the release, and the sustain after it.
        expect(s.longest).toBeLessThan(0.45 + SUSTAIN + 0.2);
      });
    }
  });

  it("a pedal 0.03 s before the pass is due (the F2 cell L4 30 км/ч y150): the car has not braked hard yet, its pass begins on time and it is never reported — «already pulling out, not braking»", () => {
    const freeDue = live({ cruiseKmh: 30, brakeAt: 1000 }).passT!;
    const r = live({ cruiseKmh: 30, brakeAt: freeDue - 0.03 });
    expect(r.passT!).toBe(freeDue);
    expect(r.reports).toEqual([]);
    expect(r.grid.find((g) => g.t === r.passT)!.atLine).toBe(false);
  });

  it("a pedal after its pass began holds nothing and reports nothing (unchanged)", () => {
    const r = live({ cruiseKmh: CRUISE, brakeAt: DUE + 0.3 });
    expect(r.passT!).toBe(DUE);
    expect(r.reports).toEqual([]);
  });
});
