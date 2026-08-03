import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { loadDistrict, mkVehicle } from "./helpers";
import type { SimTickEvent } from "../../rules/types";

/**
 * B15 — „I waited for the traffic car 3-4 seconds, than I waited it for twice
 * more and it still stated the error."
 *
 * His sequence, at the runtime level: approach, STOP on the give-way paint,
 * stand there, then move off. Two constants shipped for this row before
 * (`RB_WITNESS_STOPPED_NEAR_M`, `CIRCULATING_REACH_M`) and neither is on this
 * path — the conviction comes from the sustain clock itself.
 *
 * `rbCondSince` is stamped the first tick a circulating conflict is visible and
 * (before this fix) cleared only on a tick where the conflict is ABSENT. A
 * driver standing still never clears it, so after a long wait both mercies the
 * C1/D1 comments exist to grant — the 0.9 s reaction window and the 3.0 s
 * braking-immunity band — are stale by tens of seconds, and the only live gate
 * left is `speedKmh > RHR_MOVING_KMH`. He is convicted on the FIRST tick the
 * wheels turn, and waiting longer makes it worse, which is what he reported.
 *
 * The fix makes the clock mean what the rest of the block already says it
 * means: seconds spent MOVING into a visible conflict.
 */

const DT = 0.05;
const MOVING_KMH = 3; // RHR_MOVING_KMH — the conviction floor

interface WaitDriveResult {
  /** Seconds after the wheels first turned that the violation fired, or null. */
  convictedAfterSec: number | null;
  /** Seconds of standing still before the move-off. */
  waitedSec: number;
}

/**
 * Stand at the south mouth of rb-1 with a circulating conflict permanently
 * visible, then accelerate into the ring. `brakingKmh` drives the move-off
 * profile: a positive ramp accelerates from 0.
 */
function waitThenEnter(waitSec: number, opts: { moveFrames?: number } = {}): WaitDriveResult {
  const rt = createWorldRuntime(loadDistrict());
  const rb = rt.district.roundabouts[0];
  // A car is on the ring the whole time — the worst case, and the one the
  // register measured: the loop actor keeps coming round, so from the
  // stationary driver's seat the conflict never resolves for long.
  rt.setCirculatingQuery(() => true);

  // Fixed pose at the south mouth pointing north (inward = 1, azimuth never
  // sweeps, so the "already circulating" latch stays off — this is an ENTRY).
  const pose = { x: rb.x, y: rb.y - (rb.radius + 4), headingDeg: 0 };
  let t = 0;

  // --- the wait: parked, engine running, watching the ring ---
  for (let i = 0; i < Math.round(waitSec / DT); i += 1) {
    t += DT;
    rt.update(DT);
    rt.sample(mkVehicle(pose, { speedKmh: 0 }), t, false);
  }

  // --- the move-off: a normal pull-away, ~1.4 m/s² ---
  const moveFrames = opts.moveFrames ?? 80; // 4.0 s
  let convictedAfterSec: number | null = null;
  let firstMovingT: number | null = null;
  for (let i = 0; i < moveFrames; i += 1) {
    t += DT;
    const speedKmh = 5 * (i + 1) * DT * 5; // 0 → 20 km/h over 1.6 s, then on up
    rt.update(DT);
    const tick = rt.sample(mkVehicle(pose, { speedKmh }), t, false);
    if (speedKmh > MOVING_KMH && firstMovingT === null) firstMovingT = t;
    const violated = tick.events.some(
      (e: SimTickEvent) => e.kind === "prioritySituation" && e.situation === "roundabout" && e.violated,
    );
    if (violated && convictedAfterSec === null) {
      convictedAfterSec = t - (firstMovingT ?? t);
    }
  }
  return { convictedAfterSec, waitedSec: waitSec };
}

describe("B15 — roundabout: wait on the give-way line, then enter", () => {
  // The three waits from his sentence: „3-4 seconds", „twice more", and the
  // 46 s the re-look wave stood there.
  for (const waitSec of [4, 8, 46]) {
    it(`gives a full reaction window after standing still for ${waitSec} s`, () => {
      const { convictedAfterSec } = waitThenEnter(waitSec);
      // Either he is not convicted at all, or — if a car really is circulating
      // right there — the conviction lands no sooner than the sustain window
      // every other driver gets. What must NEVER happen is conviction on the
      // tick the wheels turn.
      if (convictedAfterSec !== null) {
        expect(convictedAfterSec).toBeGreaterThanOrEqual(0.9 - DT);
      }
    });
  }

  it("does not make a LONGER wait worse than a shorter one", () => {
    // His actual complaint: waiting more made it fire sooner, not later.
    const short = waitThenEnter(4).convictedAfterSec;
    const long = waitThenEnter(46).convictedAfterSec;
    expect(long === null ? Infinity : long).toBeGreaterThanOrEqual(
      (short === null ? Infinity : short) - DT,
    );
  });

  it("still convicts a driver who barges in from the line without stopping", () => {
    // Guard-rail: the mercy is a reaction window, not an amnesty. A driver who
    // stands, then accelerates into a car that is genuinely on the ring beside
    // him is still graded — just not instantly.
    const { convictedAfterSec } = waitThenEnter(46, { moveFrames: 200 });
    expect(convictedAfterSec).not.toBeNull();
  });
});
