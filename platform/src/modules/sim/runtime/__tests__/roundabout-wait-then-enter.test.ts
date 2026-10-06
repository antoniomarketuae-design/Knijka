import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { loadDistrict, mkVehicle } from "./helpers";
import type { SimTickEvent } from "../../rules/types";
import type { CirculatingQueryReport } from "../worldRuntime";
import { ringReport, type StubCar } from "./circulatingStub";

/**
 * B15 — „I waited for the traffic car 3-4 seconds, than I waited it for twice
 * more and it still stated the error."
 *
 * His sequence, at the runtime level: approach, STOP on the give-way paint,
 * stand there, then move off.
 *
 * THE DEFECT, AS IT WAS. The tracker used to convict on PRESENCE — a car on the
 * ring, on his left — once a sustain clock had run 0.9 s. The clock was stamped
 * when the car first became visible and cleared only when it was gone, so a
 * driver who did the lawful thing and stood still banked the whole wait, and
 * was convicted on the first tick the wheels turned. Waiting longer made it
 * worse. The first repair (2026-08) held the clock at null while he stood.
 *
 * WHAT ANSWERS IT NOW. There is no clock (founder ruling 2026-10-05, «bill
 * forced braking»): an entry is billed when a circulating car has to BRAKE
 * because of it, or is touched — and for no other reason. A car that is merely
 * there, for four seconds or for forty-six, bills nothing; and when a car does
 * have to brake, the bill lands on that braking and is the same whether he
 * waited at all. Both halves are measured below.
 */

const DT = 0.05;
const MOVING_KMH = 1; // this file's own «the wheels have turned» (the conviction itself does not ask whether he is moving)

interface WaitDriveResult {
  /** Seconds after the wheels first turned that the violation fired, or null. */
  convictedAfterSec: number | null;
  /** His distance from the ring centre when it fired, m. */
  convictedAtM: number | null;
}

/**
 * Stand on the south approach of rb-1, a metre short of where his nose would
 * be on the ring, for `waitSec`; then pull away into it (~1.4 m/s²).
 * `ring(i, moving)` says what the car on the ring is doing on each frame.
 */
function waitThenEnter(
  waitSec: number,
  ring: (rb: { x: number; y: number; radius: number }, moving: boolean, movedM: number) => CirculatingQueryReport,
): WaitDriveResult {
  const rt = createWorldRuntime(loadDistrict());
  const rb = rt.district.roundabouts[0];
  const enterM = rt.debugRoundaboutZones()[0]!.enterReachM;
  const startM = enterM + 2.02 + 1; // nose 1 m outside the ring carriageway
  let moving = false;
  let movedM = 0;
  rt.setCirculatingQuery(() => ring(rb, moving, movedM));

  let t = 0;
  // --- the wait: parked, engine running, watching the ring ---
  for (let i = 0; i < Math.round(waitSec / DT); i += 1) {
    t += DT;
    rt.update(DT);
    rt.sample(mkVehicle({ x: rb.x, y: rb.y - startM, headingDeg: 0 }, { speedKmh: 0 }), t, false);
  }

  // --- the move-off: a normal pull-away, straight in ---
  let convictedAfterSec: number | null = null;
  let convictedAtM: number | null = null;
  let firstMovingT: number | null = null;
  let v = 0;
  for (let i = 0; i < 120; i += 1) {
    t += DT;
    v = Math.min(20 / 3.6, v + 1.4 * DT);
    movedM += v * DT;
    const speedKmh = v * 3.6;
    moving = speedKmh > MOVING_KMH;
    if (moving && firstMovingT === null) firstMovingT = t;
    rt.update(DT);
    const d = Math.max(rb.radius - 2, startM - movedM);
    const tick = rt.sample(mkVehicle({ x: rb.x, y: rb.y - d, headingDeg: 0 }, { speedKmh }), t, false);
    const violated = tick.events.some(
      (e: SimTickEvent) => e.kind === "prioritySituation" && e.situation === "roundabout" && e.violated,
    );
    if (violated && convictedAfterSec === null) {
      convictedAfterSec = t - (firstMovingT ?? t);
      convictedAtM = d;
    }
  }
  return { convictedAfterSec, convictedAtM };
}

const carOnRing = (rb: { radius: number }, extra: Partial<StubCar> = {}): StubCar => ({
  id: 7,
  azDeg: 230,
  radiusM: rb.radius,
  speedMps: 5,
  shedMps: 0,
  ...extra,
});

describe("B15 — roundabout: wait on the give-way line, then enter", () => {
  // The three waits from his sentence: „3-4 seconds", „twice more", and the
  // 46 s the re-look wave stood there.
  for (const waitSec of [4, 8, 46]) {
    it(`a car that is on the ring the whole time and never has to brake bills nothing after standing ${waitSec} s`, () => {
      // The worst case of the old defect: the loop actor keeps coming round, so
      // from the stationary driver's seat a car is always «there».
      let car: StubCar | null = null;
      const { convictedAfterSec } = waitThenEnter(waitSec, (rb) => {
        car ??= carOnRing(rb, { approaching: true });
        return ringReport(rb, [car], true);
      });
      expect(convictedAfterSec).toBeNull();
    });
  }

  it("a LONGER wait is never worse than a shorter one: when a car does have to brake, the bill lands on the same frame of the entry", () => {
    // His actual complaint: waiting more made it fire sooner. Now the wait is
    // not an input at all — the car brakes from the moment his nose is on the
    // ring, and the conviction is that braking.
    const run = (waitSec: number) => {
      let car: StubCar | null = null;
      return waitThenEnter(waitSec, (rb, moving, movedM) => {
        car ??= carOnRing(rb);
        if (moving && movedM >= 1) car.shedMps += 0.1; // his nose is over the edge
        return ringReport(rb, [car]);
      });
    };
    const short = run(4);
    const long = run(46);
    expect(short.convictedAfterSec).not.toBeNull();
    expect(long.convictedAfterSec).not.toBeNull();
    expect(long.convictedAfterSec!).toBeCloseTo(short.convictedAfterSec!, 9);
    expect(long.convictedAtM!).toBeCloseTo(short.convictedAtM!, 9);
  });

  it("standing still is not an amnesty: a driver who waits 46 s and then pulls out in front of a car that has to brake is billed — on the entry, not on the first turn of the wheels", () => {
    let car: StubCar | null = null;
    const { convictedAfterSec, convictedAtM } = waitThenEnter(46, (rb, moving, movedM) => {
      car ??= carOnRing(rb);
      if (moving && movedM >= 1) car.shedMps += 0.1;
      return ringReport(rb, [car]);
    });
    expect(convictedAfterSec).not.toBeNull();
    // He had to cover the metre to the ring's edge first (≈ 1.2 s at 1.4 m/s²)…
    expect(convictedAfterSec!).toBeGreaterThan(0.5);
    // …and the bill lands with his nose on the ring carriageway.
    const rt = createWorldRuntime(loadDistrict());
    expect(convictedAtM!).toBeLessThanOrEqual(rt.debugRoundaboutZones()[0]!.enterReachM + 2.02);
  });

  it("whatever a car sheds while he is still standing on the line is not his entry", () => {
    let car: StubCar | null = null;
    const { convictedAfterSec } = waitThenEnter(8, (rb, moving) => {
      car ??= carOnRing(rb);
      if (!moving) car.shedMps += 0.1; // «brakes for him» throughout the wait, then goes
      return ringReport(rb, [car]);
    });
    expect(convictedAfterSec).toBeNull();
  });
});
