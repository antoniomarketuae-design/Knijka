/**
 * ONE CONTACT WITH ONE BODY BILLS ONCE; TWO SEPARATE VICTIMS BILL TWICE — the
 * contract stated as the two failures it sits between, because this reducer has
 * already been wrong in BOTH directions and each repair bought the other back.
 *
 * The history, so nobody re-buys a leg of it:
 *   · a 3 s rate limit billed one four-second scrape twice, and a car left
 *     resting against a bumper 10 points every 3 s indefinitely (14 bills /
 *     140 points over 40 s, against an allowance of 9);
 *   · the fix that stopped THAT — a shared latch closed by measured daylight —
 *     asked the LEAD VEHICLE's bumper to clear before ANY body could bill
 *     again, so a pedestrian struck while nose-deep in a wreck cost nothing;
 *   · the fix that stopped THAT keyed the latch per body KIND, which is not per
 *     body on any drive staging two of anything: two wrecked cars struck 1.1 s
 *     apart inside `collisionSeparationSec` billed ONCE, and the debrief told
 *     the student he had hit one car when he had hit two.
 *
 * WHAT IS NEW HERE. `SimTickEvent.collision` now carries an optional `actorId`,
 * the episode is keyed by `contactKey` (`actor:<id>`, falling back to
 * `kind:<withWhat>`), and — because the three reporters do NOT all speak at the
 * same resolution — an anonymous report is matched against any open episode of
 * its kind rather than opening one of its own. Every `it` below fails on the
 * per-kind engine, on a naive per-actor engine, or on both; the ones that pin
 * the OLD behaviour are here so that the new key cannot quietly re-buy the
 * duplication the old one existed to prevent.
 */

import { describe, expect, it } from "vitest";

import type { RuleEvent, SimTick, ViolationEvent } from "../types";
import { codes, drive, tick } from "./fixtures";

/** How many «Пътнотранспортно произшествие» rows a drive prints. */
const bills = (ticks: SimTick[]): number =>
  codes(drive(ticks).events).filter((c) => c === "COLLISION").length;

/** Which BODY each row names, in order — the assertion a bare count cannot make. */
const struck = (ticks: SimTick[]): (string | undefined)[] =>
  drive(ticks)
    .events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "COLLISION")
    .map((e) => e.detail);

/** Frames of unbroken reported contact with one named body, 60 Hz. */
function embedded(
  from: number,
  to: number,
  actorId: string,
  withWhat: "vehicle" | "pedestrian" = "vehicle",
  over: Partial<SimTick> = {},
): SimTick[] {
  const out: SimTick[] = [];
  for (let t = from; t <= to + 1e-9; t += 1 / 60) {
    out.push(
      tick(Number(t.toFixed(4)), {
        speedKmh: 8,
        leadGapM: 0.1,
        ...over,
        events: [{ kind: "collision", withWhat, actorId }],
      }),
    );
  }
  return out;
}

describe("the episode is per BODY — a second victim is never free", () => {
  it("TWO NAMED CARS inside one separation window bill TWICE", () => {
    /**
     * THE LIVE UNDER-BILLING, in the geometry that produced it. The
     * sc-hz-accident-scene wreck tableau is two rects at y = 150 and y = 162;
     * a car on the tight line at 45.9 км/ч reaches the second 1.1 s after the
     * first, INSIDE `collisionSeparationSec` (1.2 s). Keyed by kind the second
     * car's report lands on the first car's still-open episode and bills
     * nothing at all.
     *
     * MUTATION THAT BREAKS IT: drop `actorId` from either event (or key the
     * episode on `withWhat` again) and this reads 1.
     */
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 46, events: [{ kind: "collision", withWhat: "vehicle", actorId: "wreck-a" }] }),
      tick(0.5, { speedKmh: 44 }),
      tick(1.1, { speedKmh: 42, events: [{ kind: "collision", withWhat: "vehicle", actorId: "wreck-b" }] }),
      tick(2, { speedKmh: 30 }),
    ];
    expect(bills(ticks)).toBe(2);
  });

  it("…and the same two reports WITHOUT names still bill once — the fallback is unchanged", () => {
    // THE CONTROL FOR THE TEST ABOVE. It is the id that buys the second row and
    // nothing else, so the live rapier channel — which has no stable id and
    // therefore sends none — grades byte-identically to the shipped engine.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 46, events: [{ kind: "collision", withWhat: "vehicle" }] }),
      tick(0.5, { speedKmh: 44 }),
      tick(1.1, { speedKmh: 42, events: [{ kind: "collision", withWhat: "vehicle" }] }),
      tick(2, { speedKmh: 30 }),
    ];
    expect(bills(ticks)).toBe(1);
  });

  it("a car and a person struck 0.3 s apart are TWO rows, and the sheet names both", () => {
    // The drive this whole lane exists for. A count alone would pass over
    // «vehicle, vehicle», which is the sentence the student was actually shown.
    const ticks: SimTick[] = [
      tick(13.13, { speedKmh: 46, events: [{ kind: "collision", withWhat: "vehicle", actorId: "wreck-a" }] }),
      tick(13.43, { speedKmh: 45, events: [{ kind: "collision", withWhat: "pedestrian", actorId: "bystander" }] }),
      tick(14, { speedKmh: 40 }),
    ];
    expect(struck(ticks)).toEqual(["vehicle", "pedestrian"]);
  });
});

describe("…and one body is never billed twice, however it is reported", () => {
  it("120 frames of one named body embedded in the bumper is ONE accident", () => {
    /**
     * THE DIRECTION THE PER-ACTOR KEY COULD HAVE RE-BOUGHT. Two seconds of
     * unbroken 60 Hz reporting — the sentinel's contract — with the car still
     * crawling forward, which is what a shaken student does. The travel gate
     * alone would let this through: 8 км/ч for 2 s integrates to 4.4 m, over
     * COLLISION_REOPEN_TRAVEL_M's 2 m.
     *
     * MUTATION THAT BREAKS IT: delete the `daylight`/silence conjuncts, or
     * refresh the episode only on the frame that bills, and this climbs past 1.
     */
    expect(bills(embedded(0, 2, "lead-car"))).toBe(1);
  });

  it("a NAMED report and an ANONYMOUS one for the same body are ONE accident", () => {
    /**
     * THE TRAP THE PER-ACTOR KEY SET, and it was live on two shipped demos
     * before this test existed. `sc-merge-from-property`'s walk-through has the
     * contact sentinel reporting `sc-mfp-walker` at 60 Hz from t = 6.30 AND the
     * script's own authored consequence beat firing an anonymous pedestrian
     * report at t = 6.57, inside the same overlap. Keyed naively that is
     * `actor:sc-mfp-walker` plus `kind:pedestrian` — two episodes, two ПТП, one
     * person under the wheels. (`sc-rb-busy-gap`'s short-gap demo is the same
     * shape at t = 23.40 against `sc-rbg-follower`.)
     *
     * MUTATION THAT BREAKS IT: look up only the report's own key — i.e. drop
     * the anonymous/kind candidate scan — and this reads 2.
     */
    const ticks = embedded(6.3, 6.9, "sc-mfp-walker", "pedestrian");
    ticks.splice(16, 0, tick(6.57, { speedKmh: 8, events: [{ kind: "collision", withWhat: "pedestrian" }] }));
    expect(bills(ticks)).toBe(1);
  });

  it("and the mirror: an ANONYMOUS episode opened first still absorbs the NAMED report", () => {
    // Reporter order is a property of the frame, not of the world. The rapier
    // channel can win the race just as easily as the sentinel can.
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 10, events: [{ kind: "collision", withWhat: "pedestrian" }] }),
      tick(0.2, { speedKmh: 9, events: [{ kind: "collision", withWhat: "pedestrian", actorId: "walker" }] }),
      tick(0.4, { speedKmh: 8 }),
    ];
    expect(bills(ticks)).toBe(1);
  });

  it("a REAL second impact on the SAME body — apart, driven on, hit again — bills twice", () => {
    /**
     * THE OTHER HALF, so the anonymous-absorption rule above cannot be
     * satisfied by never billing anything again. Hit the car, separate for
     * longer than `collisionSeparationSec` with the lead seen clear
     * (`leadGapM` over CONTACT_LEAD_GAP_M), drive well past the 2 m floor, hit
     * it again.
     */
    const ticks: SimTick[] = [
      tick(0, { speedKmh: 20, leadGapM: 0, events: [{ kind: "collision", withWhat: "vehicle", actorId: "lead" }] }),
    ];
    for (let t = 0.25; t <= 6; t += 0.25) ticks.push(tick(t, { speedKmh: 20, leadGapM: 3 }));
    ticks.push(
      tick(6.25, { speedKmh: 20, leadGapM: 0, events: [{ kind: "collision", withWhat: "vehicle", actorId: "lead" }] }),
    );
    expect(bills(ticks)).toBe(2);
  });
});

describe("nothing else about the charge moves", () => {
  it("every row is still опасна, 10 points, session-terminating, and names its body", () => {
    // The split reaches the KEY and the `detail`; it may not reach the charge.
    const events: RuleEvent[] = drive([
      tick(0, { speedKmh: 30, events: [{ kind: "collision", withWhat: "cyclist", actorId: "bike-1" }] }),
      tick(3, { speedKmh: 20, events: [{ kind: "collision", withWhat: "staticObject", actorId: "pole-7" }] }),
    ]).events;
    const rows = events.filter((e): e is ViolationEvent => e.kind === "violation" && e.code === "COLLISION");
    expect(rows.map((r) => r.detail)).toEqual(["cyclist", "staticObject"]);
    for (const r of rows) {
      expect(r.severityClass).toBe("opasna");
      expect(r.points).toBe(10);
      expect(r.terminateSession).toBe(true);
    }
    // …and the authored per-body copy really did reach the event (catalog.ts
    // COLLISION_CONTACT_COPY), which is what the debrief later reads.
    expect(rows[0].titleBg).not.toBe(rows[1].titleBg);
  });
});
