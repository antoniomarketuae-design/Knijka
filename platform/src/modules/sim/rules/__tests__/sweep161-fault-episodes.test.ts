import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";
import { reduceTick } from "../engine";
import type { SimTick } from "../types";

/**
 * THE 2026-08-17 CATALOGUE SWEEP — three episode defects in the reducer.
 *
 * Every case here is pinned to a frame under `.audit-frames/sweep161`, and each
 * is paired with its opposite so the fix cannot be a loosening: the drive that
 * SHOULD convict is asserted next to the drive that must stay clean.
 *
 *  1 · the motorway crawl clock was reset by the crawl's own stops
 *      (`sc-mw-min-speed`, `sc-mw-discipline` — 0 points on the lesson named
 *      «не пълзи», 28 full stops, top speed 15 км/ч);
 *  2 · a rest on a rail band the car never approached was a 10-point опасна
 *      (`sc-pk-rail-ban / pc-right` — the whole of a correct drive's debrief,
 *      fired at 0 км/ч on a street with no crossing in the frame);
 *  3 · WRONG_WAY re-armed on a single frame of lawful direction, so one
 *      stretch of road became five опасни (`sc-ac-wind-truck-pass / pc-right`
 *      — «Движение в обратна посока по еднопосочна улица ×5», 50 наказателни
 *      т. against a sheet that allows 9).
 */

// ---------------------------------------------------------------------------
// 1 · the motorway chicane
// ---------------------------------------------------------------------------

/** A motorway frame: 140 limit, 3-lane bank, curb lane = emergency (laneId 1). */
const mw = (t: number, over: Parameters<typeof tick>[1] = {}) =>
  tick(t, {
    maxSpeedKmh: 140,
    motorway: true,
    emergencyLaneRight: true,
    laneId: 1,
    laneCount: 3,
    ...over,
  });

/**
 * ONE CREEP of the measured chicane, at 4 Hz: launch to `kmh`, hold it, brake,
 * rest. 4.5 s long, of which only the 1.5 s plateau is inside the steady band —
 * the launch and the brake carry |a| ≈ 3 m/s² and the rest is under
 * `movingSpeedKmh`, so three quarters of the creep never qualifies and never
 * did. This is the shape `pc-right` drove for 205 s.
 */
function creep(t0: number, kmh: number): SimTick[] {
  const out: SimTick[] = [];
  let t = t0;
  for (let i = 1; i <= 4; i += 1) {
    out.push(mw(t, { speedKmh: (kmh * i) / 4 }));
    t += 0.25;
  }
  for (let i = 0; i < 6; i += 1) {
    out.push(mw(t, { speedKmh: kmh }));
    t += 0.25;
  }
  for (let i = 3; i >= 0; i -= 1) {
    out.push(mw(t, { speedKmh: (kmh * i) / 4 }));
    t += 0.25;
  }
  for (let i = 0; i < 4; i += 1) {
    out.push(mw(t, { speedKmh: 0 }));
    t += 0.25;
  }
  return out;
}

const crawl = (cycles: number, t0 = 0, kmh = 11): SimTick[] =>
  Array.from({ length: cycles }, (_, i) => creep(t0 + i * 4.5, kmh)).flat();

const crawlBills = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "DRIVING_TOO_SLOW_FOR_MOTORWAY").length;

describe("motorway crawl — the stop-start chicane the old clock could not book", () => {
  it("books the crawl a stop-start creep never held for 4 consecutive seconds", () => {
    // 3 creeps = 13.5 s of road carrying 4.5 s of qualifying plateau. Under the
    // consecutive clock this was 0 bills — the reset arrived every 1.5 s.
    expect(crawlBills(crawl(3))).toBe(1);
  });

  it("…and 205 s of it is still ONE bill, not one per creep", () => {
    expect(crawlBills(crawl(45))).toBe(1);
  });

  it("a lawful merge from rest up to cruise never accrues a second", () => {
    // 0 → 130 km/h at ~2.5 m/s²: every frame of the sub-50 band is a transition,
    // so the ledger stays empty however long the merge takes.
    const ticks: SimTick[] = [];
    for (let i = 0; i <= 58; i += 1) ticks.push(mw(i * 0.25, { speedKmh: Math.min(130, i * 2.25) }));
    expect(crawlBills(ticks)).toBe(0);
  });

  it("a genuine recovery ZEROES the ledger — two short stints never add up", () => {
    // The guard against the naive fix: 2 creeps (3 s accrued), a real recovery
    // to the flow floor, then 2 more (3 s). A session-wide accumulator would
    // bill; a per-episode one must not.
    const ticks: SimTick[] = [
      ...crawl(2, 0),
      ...Array.from({ length: 12 }, (_, i) => mw(9 + i * 0.25, { speedKmh: 110 })),
      ...crawl(2, 12),
    ];
    expect(crawlBills(ticks)).toBe(0);
  });

  it("…and a second crawl AFTER that recovery still bills on its own merits", () => {
    const ticks: SimTick[] = [
      ...crawl(3, 0),
      ...Array.from({ length: 12 }, (_, i) => mw(13.5 + i * 0.25, { speedKmh: 110 })),
      ...crawl(3, 16.5),
    ];
    expect(crawlBills(ticks)).toBe(2);
  });

  it("a queue crawl behind a lead is still innocent — congestion is a cause", () => {
    expect(crawlBills(crawl(6).map((f) => ({ ...f, leadGapM: 18 })))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · a rest on a band the car never approached
// ---------------------------------------------------------------------------

describe("rail rest — the entry gate the RX-03 case was missing", () => {
  it("a car that materialises AT REST on the band is not convicted of the прелез rule", () => {
    // `sc-pk-rail-ban / pc-right`, t=117 s: 0 км/ч, empty street, no rails and
    // no А34 in the frame, and «Нарушение на правилата за жп прелез −10» is the
    // entire debrief of a correct drive. No "approach" frame ever arrived, and
    // the two ENTRY cases already refuse to grade on that ground.
    const ticks = [0, 1, 2, 3, 4, 5, 6].map((t) => tick(t, { speedKmh: 0, railCrossing: "on" }));
    expect(codes(drive(ticks).events)).not.toContain("RAIL_CROSSING_VIOLATION");
  });

  it("a car that DROVE onto the band and stopped there is convicted exactly as before", () => {
    // The opposite direction: the RX-03 kill itself. Approach seen, stop made
    // before the band (so the entry is innocent), then a freeze on the rails.
    const ticks = [
      tick(0, { speedKmh: 20, railCrossing: "approach" }),
      tick(1, { speedKmh: 0, railCrossing: "approach" }),
      tick(2, { speedKmh: 0, railCrossing: "approach" }),
      tick(3, { speedKmh: 10, railCrossing: "on" }),
      tick(4, { speedKmh: 0, railCrossing: "on" }),
      tick(5, { speedKmh: 0, railCrossing: "on" }),
      tick(6, { speedKmh: 0, railCrossing: "on" }),
      tick(7, { speedKmh: 15, railCrossing: "on" }),
    ];
    const v = drive(ticks).events.filter(
      (e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION",
    );
    expect(v).toHaveLength(1);
    expect(v[0].kind === "violation" && v[0].detail).toBe("stopped-on-track");
  });
});

// ---------------------------------------------------------------------------
// 3 · the wrong-way flicker
// ---------------------------------------------------------------------------

/** `wrongWay` true for `onSec`, then false for `offSec`, `cycles` times, at 2 Hz. */
function flicker(cycles: number, onSec: number, offSec: number): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (let c = 0; c < cycles; c += 1) {
    for (let s = 0; s < onSec * 2; s += 1) {
      out.push(tick(t, { speedKmh: 16, wrongWay: true }));
      t += 0.5;
    }
    for (let s = 0; s < offSec * 2; s += 1) {
      out.push(tick(t, { speedKmh: 16 }));
      t += 0.5;
    }
  }
  return out;
}

const wrongWayBills = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "WRONG_WAY").length;

describe("wrong-way — one run, one bill", () => {
  it("a signal that flickers five times over one stretch bills ONCE, not five 10-point опасни", () => {
    // `sc-ac-wind-truck-pass / pc-right` at 13–16 км/ч: five «Движение в обратна
    // посока по еднопосочна улица», 50 наказателни т. on a 9-point sheet.
    expect(wrongWayBills(flicker(5, 2, 1))).toBe(1);
  });

  it("two genuinely separate runs, with the lawful direction HELD between them, still bill twice", () => {
    // The opposite direction: the re-arm is a hysteresis, not an amnesty. 5 s
    // the right way round is longer than WRONG_WAY_REARM_SEC.
    expect(wrongWayBills(flicker(2, 2, 5))).toBe(2);
  });

  it("a single sustained run is unchanged — it still fires on the sustain", () => {
    const ticks = [0, 1, 2].map((t) => tick(t, { speedKmh: 25, wrongWay: true }));
    expect(wrongWayBills(ticks)).toBe(1);
  });

  it("driving the right way round never bills, however long", () => {
    const ticks = Array.from({ length: 40 }, (_, i) => tick(i, { speedKmh: 25 }));
    expect(wrongWayBills(ticks)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4 · the shunt — one contact, thirteen accidents
// ---------------------------------------------------------------------------
//
// `.audit-frames/sweep161/sc-ov-solid-return/mobile-wrong/08-debrief.png`:
// «130 наказателни точки», thirteen identical «Пътнотранспортно произшествие
// −10 изпитни т.» rows, printed under the card's own sentence that the ten is
// the price of the single act. `sc-ln-boulevard-discipline / mobile-wrong`
// printed fourteen. The mid-drive frame `04-t072s.png` shows what was actually
// happening: 4 км/ч, the shunted truck filling the windscreen with its red band
// across the bonnet, and the HUD's «+2» repeat counter — one contact that never
// broke, billed for coming apart.
//
// The travel gate could not see it because it measured PATH, and a shunt is
// precisely the contact that supplies path without supplying separation: at
// 4 км/ч the 2 m floor is crossed in 1.8 s.

/**
 * ONE UNBROKEN CONTACT, `durSec` long, with the car creeping forward at `kmh`
 * still inside what it hit — `leadGapM` never leaves the bumper — while the
 * reporter re-fires only every `cadenceSec`. That cadence is the variable and
 * not the fault: it is a property of the DEVICE (the rapier shell pool re-arms
 * a sustained contact only when it rebinds), which is why the same script
 * scored thirteen on a phone and five on a desktop.
 */
function shunt(durSec: number, kmh: number, cadenceSec: number): SimTick[] {
  const out: SimTick[] = [];
  let nextReport = 0;
  for (let t = 0; t <= durSec; t += 0.25) {
    const reports = t >= nextReport;
    if (reports) nextReport = t + cadenceSec;
    out.push(
      tick(t, {
        speedKmh: kmh,
        leadGapM: 0.1, // bumper against bumper: never once apart
        events: reports ? [{ kind: "collision", withWhat: "vehicle" }] : [],
      }),
    );
  }
  return out;
}

const crashBills = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "COLLISION").length;

describe("contact — one shunt, one accident", () => {
  it("bills ONCE however slowly the reporter re-fires — the whole 13-row card", () => {
    // The measured table. Before: 1 / 46 / 23 / 13 bills. The last is the
    // photographed «130 наказателни точки», to the row.
    for (const cadenceSec of [0.5, 2, 4, 7]) {
      expect(crashBills(shunt(90, 4, cadenceSec))).toBe(1);
    }
  });

  it("…on the very drive the travel floor alone could never stop", () => {
    // 90 s at 4 км/ч integrates to 100 m of path — 50x COLLISION_REOPEN_TRAVEL_M,
    // every metre of it still inside the body being billed for leaving.
    expect((4 / 3.6) * 90).toBeGreaterThanOrEqual(50 * 2);
    expect(crashBills(shunt(90, 4, 7))).toBe(1);
  });

  it("a car that hits, reverses OUT, and drives back in has had TWO accidents", () => {
    // The opposite direction, and the shipped case the travel floor was written
    // to keep: a metre of daylight opens between the bodies, so the second
    // impact is a second accident and must still cost its own ten.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 20, leadGapM: 0, events: [{ kind: "collision", withWhat: "vehicle" }] }),
    ];
    for (let t = 0.25; t <= 3; t += 0.25) ticks.push(tick(t, { speedKmh: -3, leadGapM: 1 }));
    ticks.push(
      tick(3.25, {
        speedKmh: 10,
        leadGapM: 0,
        events: [{ kind: "collision", withWhat: "vehicle" }],
      }),
    );
    expect(crashBills(ticks)).toBe(2);
  });

  it("…and so has one that hits, drives on, and hits something else", () => {
    // The gap reads clear road for the whole run between the two crashes and is
    // 0 again at the instant of the second — which is why the daylight is a
    // LATCH and not a test on the reporting frame. A point test would suppress
    // the second, genuine crash instead of the first, false one.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 30, leadGapM: 0, events: [{ kind: "collision", withWhat: "vehicle" }] }),
    ];
    for (let t = 0.5; t <= 6; t += 0.5) ticks.push(tick(t, { speedKmh: 30, leadGapM: 40 - t * 4 }));
    ticks.push(
      tick(6.5, {
        speedKmh: 30,
        leadGapM: 0,
        events: [{ kind: "collision", withWhat: "vehicle" }],
      }),
    );
    expect(crashBills(ticks)).toBe(2);
  });

  it("a drive with no lead-gap channel grades exactly as it did before", () => {
    // Unknown reads as apart. A wall, a pedestrian, a parked car outside the
    // in-lane corridor: the gate falls back to silence + travel, byte-identical
    // to the shipped behaviour, and this drive still bills twice.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 20, events: [{ kind: "collision", withWhat: "staticObject" }] }),
    ];
    for (let t = 0.25; t <= 3; t += 0.25) ticks.push(tick(t, { speedKmh: -3 }));
    ticks.push(
      tick(3.25, { speedKmh: 10, events: [{ kind: "collision", withWhat: "staticObject" }] }),
    );
    expect(crashBills(ticks)).toBe(2);
  });

  it("an embedded car at 0 км/ч still bills once — the 2 m floor is untouched", () => {
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 60; t += 0.5) {
      ticks.push(
        tick(t, {
          speedKmh: 0,
          events: t % 4 === 0 ? [{ kind: "collision", withWhat: "vehicle" }] : [],
        }),
      );
    }
    expect(crashBills(ticks)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5 · the repeat cadence at the опасна line
// ---------------------------------------------------------------------------
//
// `.audit-frames/sweep161/sc-park-left/pc-wrong/08-debrief.png`: «Опасни грешки
// 11 · 110 · Общо (допустими 9) 11 · 110» — eleven «Превишаване с повече от
// 10 км/ч» rows for one continuous overspeed. `sc-park-zebra` printed the same
// eleven on PC and ten on mobile.

const overspeed = (kmh: number, durSec: number): SimTick[] => {
  const out: SimTick[] = [];
  for (let t = 0; t <= durSec; t += 0.25) out.push(tick(t, { speedKmh: kmh, maxSpeedKmh: 50 }));
  return out;
};

const billsOf = (code: string, ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === code).length;

describe("speeding — the repeat cadence stops at the опасна line", () => {
  it("one continuous overspeed above +10 is ONE опасна, not eleven", () => {
    // 200 s at 70 in a 50. Before: 10 bills, 100 наказателни точки.
    expect(billsOf("SPEEDING_DANGEROUS", overspeed(70, 200))).toBe(1);
  });

  it("two genuinely separate stints, the limit HELD between, still bill twice", () => {
    // The opposite direction: the episode re-arms on a real correction. 6 s at
    // the limit clears speedingRearmSec.
    const ticks: SimTick[] = [
      ...overspeed(70, 6),
      ...Array.from({ length: 25 }, (_, i) =>
        tick(6.25 + i * 0.25, { speedKmh: 50, maxSpeedKmh: 50 }),
      ),
      ...Array.from({ length: 25 }, (_, i) =>
        tick(12.5 + i * 0.25, { speedKmh: 70, maxSpeedKmh: 50 }),
      ),
    ];
    expect(billsOf("SPEEDING_DANGEROUS", ticks)).toBe(2);
  });

  it("the второстепенна band keeps its cadence — collapsing it would buy a pass", () => {
    // 200 s at 57 in a 50 is ten второстепенни, ten наказателни точки, a fail
    // against the allowance of nine. One bill would be a PASS, and that is the
    // one direction a scorer may never move (rules/scoring.ts's header).
    //
    // ELEVEN SINCE w11, and the eleventh is the RE-GRADE, not a cadence change:
    // the ten cadence bills are still at 2, 22, 42 … 182 and the extra one is at
    // 8 (SPEED_REGRADE_SEC), carrying `regrade: true`. It exists to reach the
    // charge the teach-first free lesson spends on the FIRST bill, and
    // `lessons/engine.ts` drops it wherever that bill was already charged — so
    // in exam mode this count is still ten. The cadence itself is what this row
    // guards, and it is asserted below rather than left implied in a total.
    const bills = drive(overspeed(57, 200))
      .events.filter((e) => e.kind === "violation" && e.code === "SPEEDING_OVER_LIMIT")
      .map((e) => [Number(e.t.toFixed(1)), e.kind === "violation" && e.regrade === true] as const);
    expect(bills.filter(([, isRegrade]) => !isRegrade).map(([t]) => t)).toEqual([
      2, 22, 42, 62, 82, 102, 122, 142, 162, 182,
    ]);
    expect(bills.filter(([, isRegrade]) => isRegrade).map(([t]) => t)).toEqual([8]);
    expect(billsOf("SPEEDING_OVER_LIMIT", overspeed(57, 200))).toBe(11);
  });

  it("sustained dangerous speeding is still never cheaper than oscillating (M-16)", () => {
    const pointsOf = (ticks: SimTick[]): number =>
      drive(ticks).events.reduce((sum, e) => sum + (e.kind === "violation" ? e.points : 0), 0);
    const saw: SimTick[] = [];
    let t = 0;
    for (let cycle = 0; cycle < 20; cycle += 1) {
      saw.push(tick(t++, { speedKmh: 70, maxSpeedKmh: 50 }));
      saw.push(tick(t++, { speedKmh: 70, maxSpeedKmh: 50 }));
      saw.push(tick(t++, { speedKmh: 48, maxSpeedKmh: 50 }));
    }
    expect(pointsOf(overspeed(70, 60))).toBeGreaterThanOrEqual(pointsOf(saw));
  });

  it("a drive that never crosses the limit still bills nothing", () => {
    expect(billsOf("SPEEDING_DANGEROUS", overspeed(50, 200))).toBe(0);
    expect(billsOf("SPEEDING_OVER_LIMIT", overspeed(50, 200))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6 · ONE LATCH FOR EVERY BODY IN THE WORLD — the acquittal the dedupe bought
// ---------------------------------------------------------------------------
//
// Section 4 above closed the duplication with a third conjunct: the vehicle
// ahead has to have been SEEN off the bumper before a second bill. It was put
// on a SINGLE latch shared by every body in the world, and a reading off
// `tick.leadGapM` is a statement about exactly one of them — the in-lane
// vehicle ahead.
//
// So the wave that stopped `sc-ov-solid-return` printing thirteen accidents for
// one truck also stopped a pedestrian being billed at all, if the car that was
// hit first was still in front. The student shunts a car, drives on nose-to-tail
// in the queue, knocks somebody down thirty seconds later — and the second
// accident waits for the FIRST body's bumper to clear, which in a queue it
// never does. Two bills before that wave, one after.
//
// It was already shipping. Dumping the contact channel of the template's own
// mistake demo `sc-hz-accident-scene / mistake-squeeze` — 26 reports at
// 45.9 км/ч: t=13.13 the first wreck (vehicle), t=13.43…13.82 the BYSTANDER
// dragged along at 60 Hz (pedestrian), t=14.23 the second wreck — the sheet
// printed ONE «Пътнотранспортно произшествие», the parked wreck. The man under
// the wheels cost nothing on a lesson whose entire subject is that people are
// standing there.
//
// A false pass and a false conviction are the same crime, so every case below
// is paired with the duplication case it must not re-buy. The rule now: the
// encounter is per BODY-KIND, silence and travel are asked of every kind
// because they are properties of the CAR, and daylight is asked only of
// `vehicle` because that is the only body the gap channel can see.

/** How many «Пътнотранспортно произшествие» rows a drive prints. */
const bills = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "COLLISION").length;

describe("contact — the episode is per body-kind", () => {
  it("a pedestrian struck half a minute after a car crash is still billed", () => {
    // THE REGRESSION, to the drive. Crash into the car ahead at 20 км/ч, then
    // 30 s of creeping forward still nose-to-tail behind it (leadGapM 0.3 —
    // under CONTACT_LEAD_GAP_M's 0.5 the whole way, so the shared latch never
    // re-armed), then a pedestrian. MEASURED: 2 bills before the daylight
    // conjunct shipped, 1 with it on a global latch, 2 with it per body-kind.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 20, leadGapM: 0, events: [{ kind: "collision", withWhat: "vehicle" }] }),
    ];
    for (let t = 0.25; t <= 30; t += 0.25) ticks.push(tick(t, { speedKmh: 8, leadGapM: 0.3 }));
    ticks.push(
      tick(30.25, {
        speedKmh: 8,
        leadGapM: 0.3,
        events: [{ kind: "collision", withWhat: "pedestrian" }],
      }),
    );
    expect(bills(ticks)).toBe(2);
  });

  it("…and so is one struck during the shunt itself", () => {
    // The same acquittal at its worst: the car never comes apart from the truck
    // it is pushing (section 4's shunt, verbatim), and a pedestrian goes under
    // the wheels in the middle of it. The truck must still bill ONCE — re-buying
    // section 4 would be no better — and the pedestrian must bill.
    const withPedestrian = shunt(30, 4, 4);
    withPedestrian.push(
      tick(30.25, {
        speedKmh: 4,
        leadGapM: 0.1,
        events: [{ kind: "collision", withWhat: "pedestrian" }],
      }),
    );
    expect(bills(withPedestrian)).toBe(2);
    // …and the shunt on its own is still the single row section 4 pinned.
    expect(bills(shunt(30, 4, 4))).toBe(1);
  });

  it("one body, one bill — a pedestrian dragged along re-reports for free", () => {
    // The opposite direction, and the one a per-kind key must not lose. The
    // recorder re-fires a sustained pedestrian contact at the shell-pool cadence
    // exactly as it does a vehicle's; four seconds of it is ONE accident. If the
    // travel floor stopped holding for non-vehicle kinds this reads as nine.
    const ticks: SimTick[] = [];
    for (let t = 0; t <= 4; t += 0.5) {
      ticks.push(tick(t, { speedKmh: 0, events: [{ kind: "collision", withWhat: "pedestrian" }] }));
    }
    expect(bills(ticks)).toBe(1);
  });

  it("a cyclist and a pedestrian in the same second are two accidents", () => {
    // Two vulnerable road users, two bodies, two ПТП — and they arrive inside
    // collisionSeparationSec, which is precisely where a shared latch merged
    // them. Nothing about the car changed between the two frames; what changed
    // is who was hit.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 25, events: [{ kind: "collision", withWhat: "cyclist" }] }),
      tick(0.5, { speedKmh: 20, events: [{ kind: "collision", withWhat: "pedestrian" }] }),
    ];
    expect(bills(ticks)).toBe(2);
  });

  it("the truck a student follows for 200 s is ONE accident, not seven", () => {
    // `.audit-frames/sweep161/sc-follow-truck/mobile-right/08-debrief.png`:
    // «71 наказателни точки», and in run.log «Пътнотранспортно произшествие ×7
    // — опасна, 70 наказателни т.» printed above the card's own sentence that a
    // collision is ONE dangerous error worth ten. The same log's «23 full stops
    // · top 22 км/ч» is the stuttering crawl behind the truck that produced it:
    // reports arriving in bursts with the bumper never once clear.
    const ticks: SimTick[] = [];
    let nextReport = 0;
    for (let t = 0; t <= 200; t += 0.25) {
      const kmh = Math.floor(t / 8) % 2 === 0 ? 22 : 0; // crawl, rest, crawl…
      const reports = t >= nextReport;
      if (reports) nextReport = t + 4;
      ticks.push(
        tick(t, {
          speedKmh: kmh,
          leadGapM: 0.2,
          events: reports ? [{ kind: "collision", withWhat: "vehicle" }] : [],
        }),
      );
    }
    expect(bills(ticks)).toBe(1);
  });

  it("a static scrape is graded on silence and travel, as it always was", () => {
    // Daylight is the LEAD VEHICLE's alibi, so a wall may not be asked for one —
    // and must not be able to borrow one either. The same drive twice: once with
    // no gap channel at all, once tailgating a car that never leaves the bumper.
    // Both bill twice, because what the channel says about a car it can see is
    // no evidence at all about a wall it cannot.
    const scrape = (over: Partial<SimTick>): SimTick[] => {
      const out: SimTick[] = [
        tick(0, { speedKmh: 20, ...over, events: [{ kind: "collision", withWhat: "staticObject" }] }),
      ];
      for (let t = 0.25; t <= 3; t += 0.25) out.push(tick(t, { speedKmh: -3, ...over }));
      out.push(
        tick(3.25, {
          speedKmh: 10,
          ...over,
          events: [{ kind: "collision", withWhat: "staticObject" }],
        }),
      );
      return out;
    };
    expect(bills(scrape({}))).toBe(2);
    expect(bills(scrape({ leadGapM: 0.1 }))).toBe(2);
  });

  it("the 2 m floor and the silence window still hold for every kind", () => {
    // The per-kind key must not become a way of buying extra bills by
    // relabelling. Each kind embedded at 0 км/ч for a minute bills exactly one,
    // and four kinds embedded together bill exactly four — one per BODY, never
    // one per report.
    const kinds = ["vehicle", "pedestrian", "cyclist", "staticObject"] as const;
    const embedded = (hit: ReadonlyArray<(typeof kinds)[number]>): SimTick[] => {
      const out: SimTick[] = [];
      for (let t = 0; t <= 60; t += 0.5) {
        out.push(
          tick(t, {
            speedKmh: 0,
            events:
              t % 4 === 0 ? hit.map((k) => ({ kind: "collision" as const, withWhat: k })) : [],
          }),
        );
      }
      return out;
    };
    for (const k of kinds) expect(bills(embedded([k]))).toBe(1);
    expect(bills(embedded(kinds))).toBe(4);
  });

  it("the reducer does not write a bill into the caller's state", () => {
    // The episode ledger is a record now, and cloneState copies it shallowly on
    // the promise that entries are REPLACED rather than mutated. Break that
    // promise and the reducer mutates its input: the same frame replayed off the
    // same state — which is exactly what a debrief scrub does — grades
    // differently the second time.
    const crash = { kind: "collision" as const, withWhat: "vehicle" as const };
    const first = drive([tick(0, { speedKmh: 20, events: [crash] })]);
    const before = JSON.stringify(first.state.contactEpisodes);
    const replayA = reduceTick(first.state, tick(4, { speedKmh: 20, events: [crash] }));
    expect(JSON.stringify(first.state.contactEpisodes)).toBe(before);
    const replayB = reduceTick(first.state, tick(4, { speedKmh: 20, events: [crash] }));
    expect(codes(replayB.events)).toEqual(codes(replayA.events));
  });
});
