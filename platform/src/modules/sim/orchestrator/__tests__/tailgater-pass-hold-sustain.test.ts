/**
 * «THE BRAKE IS OVER» IS MEASURED WITH THE PRODUCT'S OWN SUSTAIN, NOT WITH A SECOND 0.4 —
 * `RearTailgaterRunner.ownHardBrakeHoldsThePass` (`sc-follow-tailgater:63c0c28c` C2a, round 5, integrator
 * decision 2026-10-12: «import the constant, never a second literal»).
 *
 * The лепка's due pass is held from its first reading at the harsh line until the product's harsh step reports
 * that brake, or the brake is OVER: its reading has stayed under the braking line for `harshBrakeSustainSec`
 * (`tailgater-pass-hold.test.ts` pins the rule). The sustain that says a brake is harsh and the sustain that
 * says it is over are ONE number, `DEFAULT_RULE_CONFIG.harshBrakeSustainSec`, read through the runner's own
 * `OVERTAKE_HARSH_LINE`. A copy of it in the runner would agree with every other test in the repo for as long as
 * the number stays 0.4, and would silently part from the report's sustain on the day it moves.
 *
 * So this file MOVES it: the rules module is loaded afresh, its default sustain is set to another value BEFORE the
 * runner module is loaded, and the same scripted car is driven. Where the hold ends must move with it — by the
 * grid points the new number is worth, counted here — and so must the report. Nothing is read off the runner: the
 * car's reading is this file's own arithmetic on the speed the port publishes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RearTailgaterSpec, StagedEventSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import { SC_FOLLOW_TAILGATER } from "../../lessons/scenario/templates-following";
import type { StagedActorView, StagedCommand } from "../../traffic/types";
import type { DirectorInput, StagedTrafficPort } from "../types";

const DT = 1 / 60;
const LANE_X = 12.19;
/** Pressure from the latch to the due pass in these rows, s. */
const PRESSURE = 2;
const TAILGATER = (SC_FOLLOW_TAILGATER.staged ?? []).find((s: StagedEventSpec) => s.kind === "rearTailgater") as RearTailgaterSpec;

/** The world with the product's default sustain set to `sustainSec` (null: as shipped) before the runner loads. */
async function world(sustainSec: number | null) {
  vi.resetModules();
  const rules = await import("../../rules");
  const config = rules.DEFAULT_RULE_CONFIG as { harshBrakeSustainSec: number; harshBrakeDecelMps2: number; accelWindowSec: number };
  const shipped = config.harshBrakeSustainSec;
  if (sustainSec !== null) config.harshBrakeSustainSec = sustainSec;
  const { RearTailgaterRunner } = await import("../runners");
  /**
   * One scripted drive: the car 9 m behind him from 1 s on, at 9 m/s, slowing by `carDecel(i)` m/s² on grid point
   * i. Returns the grid point its pass was commanded on, the grid points of its reports, and its speed by grid
   * point.
   */
  const drive = (carDecel: (i: number) => number) => {
    let speed = 9;
    let y = 20;
    let t = 0;
    let i = 0;
    const gap = () => (t < 1 ? 22 : 9);
    let passI: number | null = null;
    const reports: number[] = [];
    const speeds: number[] = [9];
    const view = () => ({ x: LANE_X, y: y - gap(), dirX: 0, dirY: 1, speedMps: speed, laneWidthM: 3.5, stateId: 7, finished: false }) as unknown as StagedActorView;
    const port: StagedTrafficPort = {
      stage: () => view(),
      stagedCommand: (_id: string, c: StagedCommand) => {
        if (c.type === "laneShift" && passI === null) passI = i;
      },
      staged: () => view(),
    };
    const runner = new RearTailgaterRunner({ ...TAILGATER, pressureSec: PRESSURE });
    runner.stage(port, () => 0.5, true);
    for (i = 1; i * DT < 9; i++) {
      t = i * DT;
      y += 9 * DT;
      speed = Math.max(0, speed - carDecel(i) * DT);
      speeds[i] = speed;
      const out: SimTickEvent[] = [];
      runner.step(port, { tSec: t, dtSec: DT, x: LANE_X, y, speedKmh: 32.4, headingDeg: 0, brakePedal: 0, tickEvents: [] } satisfies DirectorInput, out);
      for (const e of out) if (e.kind === "followerBraked") reports.push(i);
    }
    /** The car's reading on grid point k: its speed change over the product's reading window (three grid points). */
    const reading = (k: number) => (k >= 3 ? (speeds[k - 3]! - speeds[k]!) / (3 * DT) : 0);
    return { passI: passI as number | null, reports, reading };
  };
  return { shipped, config, drive };
}

afterEach(() => {
  vi.resetModules();
});

describe("RearTailgaterRunner · «the brake is over» is counted with the product's own harshBrakeSustainSec — move the number and the hold moves with it (63c0c28c C2a, round 5)", () => {
  /** A hard brake too short to be reported under any sustain tried here: 10 m/s² for 0.2 s, ending three grid points after the timer. */
  const blip = (due: number) => (i: number) => (i >= due - 9 && i < due + 3 ? 10 : 0);

  it("as shipped (0.4 s): the due pass begins on the 25th reading in a row under the braking line — the first and the 24 after it span 0.4 s", async () => {
    const w = await world(null);
    expect(w.shipped).toBe(0.4);
    const due = w.drive(() => 0).passI!;
    expect(due).toBeGreaterThan(170);
    const r = w.drive(blip(due));
    expect(r.reports).toEqual([]);
    // Own arithmetic: at the harsh line before the timer, and under the braking line from grid point due + 5 on.
    expect(r.reading(due - 1)).toBeGreaterThanOrEqual(w.config.harshBrakeDecelMps2);
    expect(r.reading(due + 4)).toBeGreaterThanOrEqual(2);
    expect(r.reading(due + 5)).toBeLessThan(2);
    expect(r.passI).toBe(due + 5 + Math.round(0.4 / DT));
    expect(r.passI! - (due + 5)).toBe(24);
  });

  for (const sustain of [0.3, 0.5]) {
    it(`with the product's sustain at ${sustain} s the same car's pass begins ${Math.round(sustain / DT)} grid points after its first reading under the braking line — not 24: there is no second 0.4 in the runner`, async () => {
      const w = await world(sustain);
      expect(w.shipped).toBe(0.4);
      const due = w.drive(() => 0).passI!;
      const r = w.drive(blip(due));
      expect(r.reports).toEqual([]);
      expect(r.reading(due + 5)).toBeLessThan(2);
      expect(r.passI! - (due + 5)).toBe(Math.round(sustain / DT));
      expect(r.passI! - (due + 5)).not.toBe(24);
    });
  }

  it("…and it is the report's sustain, the same number: a 10 m/s² brake of 0.35 s across the timer is reported — and the pass begins on that report — when the sustain is 0.3 s, and is held to the end of the brake and the sustain more, unreported, when it is 0.4 s", async () => {
    const brake = (due: number) => (i: number) => (i >= due - 6 && i < due + 15 ? 10 : 0);
    const short = await world(0.3);
    const dueS = short.drive(() => 0).passI!;
    const rs = short.drive(brake(dueS));
    expect(rs.reports).toHaveLength(1);
    expect(rs.passI).toBe(rs.reports[0]!);
    // Reported the sustain after the brake's first reading at the braking line (grid point due − 6).
    expect(rs.reports[0]! - (dueS - 6)).toBeGreaterThanOrEqual(Math.round(0.3 / DT));
    expect(rs.reports[0]! - (dueS - 6)).toBeLessThanOrEqual(Math.round(0.3 / DT) + 3);
    const shipped = await world(null);
    const due = shipped.drive(() => 0).passI!;
    const r = shipped.drive(brake(due));
    expect(r.reports).toEqual([]);
    // The brake's last grid point is due + 14; its reading is under the braking line from due + 17 on.
    expect(r.reading(due + 16)).toBeGreaterThanOrEqual(2);
    expect(r.reading(due + 17)).toBeLessThan(2);
    expect(r.passI).toBe(due + 17 + 24);
  });
});
