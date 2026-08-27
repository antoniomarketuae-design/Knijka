import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import type { RuleEvent, SimTick } from "../types";

/**
 * THE CRAWL THAT COST NOTHING — w11, `sc-mw-discipline:9e8f6966`.
 *
 * `.audit-frames/w11/frames/sc-mw-discipline__mobile-right`: 273 s on the
 * 140 км/ч mw-v1 motorway, top speed 24 км/ч, 23 full stops, 287.2 m of witness
 * path — and «Опасни 0 | 0 · Основни 1 | 3 · Второстепенни 0 | 0», the single
 * основна being the harness's unbuckled belt.
 *
 * The row was filed as „no code convicts the crawl". The leg's own
 * `_audit-debrief.json` refutes the mechanism and keeps the verdict:
 *
 *   «Учебни моменти (не влизат в точките): • Твърде бавно движение по
 *    автомагистрала»
 *
 * `DRIVING_TOO_SLOW_FOR_MOTORWAY` DID fire — once, as the teach-first free
 * mini-lesson, priced at zero, because the code is второстепенна and the
 * accrued episode bills once per episode and never again. See
 * `MOTORWAY_CRAWL_REGRADE_SEC`.
 *
 * Every case here is paired with its opposite, so the repair cannot be a
 * loosening: the drive that must now cost a point sits next to the drives that
 * must still cost nothing.
 */

const HZ = 20;
const STEP = 1 / HZ;
/** A motorway frame: 140 limit, 3-lane bank, cruise lane (laneId 1). */
const MW: Partial<SimTick> = { maxSpeedKmh: 140, motorway: true, laneId: 1, laneCount: 3 };

function ramp(
  t0: number,
  from: number,
  to: number,
  secs: number,
  over: Partial<SimTick> = {},
): SimTick[] {
  const out: SimTick[] = [];
  const n = Math.round(secs * HZ);
  for (let i = 0; i < n; i += 1) {
    out.push(
      tick(Number((t0 + i * STEP).toFixed(3)), {
        ...MW,
        speedKmh: from + ((to - from) * i) / n,
        ...over,
      }),
    );
  }
  return out;
}
const hold = (t0: number, kmh: number, secs: number, over: Partial<SimTick> = {}) =>
  ramp(t0, kmh, kmh, secs, over);
const tail = (ts: SimTick[]) => (ts.length ? ts[ts.length - 1].t + STEP : 0);

/** One creep of the photographed chicane: launch to `kmh`, hold, brake, rest. */
function creep(seq: SimTick[], kmh: number, over: Partial<SimTick> = {}): void {
  seq.push(...ramp(tail(seq), 0, kmh, 3, over));
  seq.push(...hold(tail(seq), kmh, 5, over));
  seq.push(...ramp(tail(seq), kmh, 0, 2, over));
  seq.push(...hold(tail(seq), 0, 2, over));
}

const crawlEvents = (ticks: SimTick[]): RuleEvent[] =>
  drive(ticks).events.filter((e) => e.code === "DRIVING_TOO_SLOW_FOR_MOTORWAY");
const isRegrade = (e: RuleEvent): boolean => (e as { regrade?: true }).regrade === true;

describe("the motorway crawl re-grade (sc-mw-discipline:9e8f6966)", () => {
  it("bills the photographed 273 s chicane TWICE — the teach and the grade", () => {
    const seq: SimTick[] = [];
    for (let c = 0; c < 23; c += 1) creep(seq, 12);
    const bills = crawlEvents(seq);

    expect(bills).toHaveLength(2);
    // The first bill is exactly the one that shipped: unmarked, so the coach
    // spends it on the free mini-lesson as it does today.
    expect(isRegrade(bills[0])).toBe(false);
    // The second is the charge that lesson consumed — MARKED, so
    // `lessons/engine.ts` drops it wherever the code was already charged.
    expect(isRegrade(bills[1])).toBe(true);
    // …and it is strictly LATER than the bill it re-grades. It can never
    // arrive instead of it: same ledger, larger threshold.
    expect(bills[1].t).toBeGreaterThan(bills[0].t);
  });

  it("never bills a third time, however long the crawl runs", () => {
    const seq: SimTick[] = [];
    for (let c = 0; c < 60; c += 1) creep(seq, 12); // ~12 minutes of crawling
    expect(crawlEvents(seq)).toHaveLength(2);
  });

  it("cannot reach a student who answers the card by accelerating", () => {
    // The whole safety property of the six seconds: they are QUALIFYING
    // seconds. A recovery is by construction not steady, so it accrues
    // nothing — this drive crawls just long enough to earn the first bill and
    // then climbs to flow speed, and the re-grade never arrives.
    const seq: SimTick[] = [];
    seq.push(...ramp(0, 0, 12, 3));
    seq.push(...hold(tail(seq), 12, 5)); // 5 qualifying s: past the 4 s sustain
    seq.push(...ramp(tail(seq), 12, 120, 30)); // recovery — |a| out of the band
    seq.push(...hold(tail(seq), 120, 30));
    const bills = crawlEvents(seq);
    expect(bills).toHaveLength(1);
    expect(isRegrade(bills[0])).toBe(false);
  });

  it("re-arms as a fresh episode when the driver recovers and crawls again", () => {
    // Two genuine acts, and the ceiling starts over with the second: the
    // recovery to flow speed is the reset that zeroes both ledgers.
    const seq: SimTick[] = [];
    for (let c = 0; c < 6; c += 1) creep(seq, 12);
    seq.push(...ramp(tail(seq), 0, 120, 20));
    seq.push(...hold(tail(seq), 120, 10));
    seq.push(...ramp(tail(seq), 120, 0, 20));
    for (let c = 0; c < 6; c += 1) creep(seq, 12);
    const bills = crawlEvents(seq);
    expect(bills).toHaveLength(4);
    expect(bills.map(isRegrade)).toEqual([false, true, false, true]);
  });

  it("stays silent on every drive that is silent today (A12)", () => {
    // 1 · a city street — the flag the whole detector hangs on is absent.
    const city: SimTick[] = [];
    for (let c = 0; c < 23; c += 1) {
      city.push(...ramp(tail(city), 0, 12, 3, { motorway: undefined, maxSpeedKmh: 50 }));
      city.push(...hold(tail(city), 12, 5, { motorway: undefined, maxSpeedKmh: 50 }));
      city.push(...ramp(tail(city), 12, 0, 2, { motorway: undefined, maxSpeedKmh: 50 }));
    }
    expect(crawlEvents(city)).toHaveLength(0);

    // 2 · a lawful motorway cruise.
    const cruise = hold(0, 125, 120);
    expect(codes(drive(cruise).events)).not.toContain("DRIVING_TOO_SLOW_FOR_MOTORWAY");

    // 3 · the queue exemption — a body inside `motorwaySlowQueueGapM`. This is
    //     the gate that is silent on the photographed leg's siblings; the
    //     re-grade must not smuggle a conviction past it.
    const queued: SimTick[] = [];
    for (let c = 0; c < 23; c += 1) creep(queued, 12, { leadGapM: 40 });
    expect(crawlEvents(queued)).toHaveLength(0);

    // 4 · a merge — 0 to motorway speed is one long unsteady climb.
    const merge = [...ramp(0, 0, 130, 52), ...hold(52, 130, 20)];
    expect(crawlEvents(merge)).toHaveLength(0);
  });
});
