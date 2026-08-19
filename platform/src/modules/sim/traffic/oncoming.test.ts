import { describe, expect, it } from "vitest";
import type { OncomingLeftTurnSpec } from "../contracts";
import { SCENARIO_TEMPLATES } from "../lessons/scenario/templates";
import { oncomingApproachFor, oncomingNearFor } from "./system";

const veh = (x: number, y: number, dirX: number, dirY: number, speedMps = 8) => ({
  x,
  y,
  dirX,
  dirY,
  speedMps,
});

// Player at origin heading north (0). Oncoming = a car ahead (+y) heading south.
describe("oncomingNearFor", () => {
  it("flags an oncoming car ahead", () => {
    expect(oncomingNearFor([veh(0, 15, 0, -1)], 0, 0, 0, 26)).toBe(true);
  });

  it("ignores a car ahead going the same way", () => {
    expect(oncomingNearFor([veh(0, 15, 0, 1)], 0, 0, 0, 26)).toBe(false);
  });

  it("ignores an oncoming car behind the player", () => {
    expect(oncomingNearFor([veh(0, -15, 0, -1)], 0, 0, 0, 26)).toBe(false);
  });

  it("ignores cars outside the radius", () => {
    expect(oncomingNearFor([veh(0, 40, 0, -1)], 0, 0, 0, 26)).toBe(false);
  });

  it("ignores stopped cars", () => {
    expect(oncomingNearFor([veh(0, 15, 0, -1, 0)], 0, 0, 0, 26)).toBe(false);
  });
});

// N1 (doc 72 JU-10): the rich form carries distance + closing speed so the
// runtime's left-turn tracker adjudicates the accepted gap in SECONDS.
describe("oncomingApproachFor", () => {
  it("reports distance and closing speed of a head-on car", () => {
    const a = oncomingApproachFor([veh(0, 15, 0, -1, 8)], 0, 0, 0, 26);
    expect(a).not.toBeNull();
    expect(a!.distM).toBeCloseTo(15, 5);
    expect(a!.closingMps).toBeCloseTo(8, 5); // fully toward the player
    expect(a!.speedMps).toBe(8);
  });

  it("picks the most URGENT oncoming (smallest time-to-arrival), not the nearest", () => {
    // 20 m at 10 m/s (2 s) is more urgent than 12 m at 2 m/s (6 s).
    const a = oncomingApproachFor(
      [veh(0, 12, 0, -1, 2), veh(0, 20, 0, -1, 10)],
      0,
      0,
      0,
      26,
    );
    expect(a!.distM).toBeCloseTo(20, 5);
    expect(a!.closingMps).toBeCloseTo(10, 5);
  });

  it("closing speed is the component toward the player, not raw speed", () => {
    // Car ahead angled 45° off the approach line: closing < speed.
    const s = Math.SQRT1_2;
    const a = oncomingApproachFor([veh(0, 15, -s, -s, 8)], 0, 0, 0, 26);
    expect(a!.speedMps).toBe(8);
    expect(a!.closingMps).toBeCloseTo(8 * s, 5);
  });

  it("returns null when the way is clear / cars are stopped", () => {
    expect(oncomingApproachFor([], 0, 0, 0, 26)).toBeNull();
    expect(oncomingApproachFor([veh(0, 15, 0, -1, 0)], 0, 0, 0, 26)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AND THE LESSON THAT NEEDS SOMETHING TO SEE (sweep161,
// `sc-turn-left-oncoming/pc-right/04-t095s.png`).
//
// The audit filed *„The lesson's own event is missing at the decision point:
// in the sampled frames at the junction mouth the opposing lane is completely
// empty — there is no oncoming vehicle to judge a gap against, in a lesson
// whose entire subject is judging a gap against oncoming traffic"* — against
// THIS FILE.
//
// It cannot be this file: everything above tests two pure functions over an
// array someone else fills. That is exactly why the routing is worth keeping.
// Every test in this file passes whether or not a single oncoming actor is ever
// staged anywhere in the product — it is a green instrument that reports on the
// detector while saying nothing about the drive, which is the shape of every
// „0 defects" report this project has had to throw away.
//
// So the file now also asks the question its name implies: does the JU-10
// lesson STAGE an oncoming car, close enough and slow enough that the helpers
// above would report it? A test may cross a module boundary that shipped code
// may not (the `controller-bubble.test.ts` precedent), so the authored spec is
// read directly.
//
// WHAT THIS STILL DOES NOT PROVE, said plainly: that the runner released the
// actor on that drive. The arrival is synced to the player's ETA and the
// audited run was force-ended with objective 2/2 open, so a spec that is
// present here can still deliver nothing on the glass. That half lives in the
// staged-event runner and in `templates-junctions.ts`, and is routed there.
// ---------------------------------------------------------------------------
describe("the JU-10 lesson stages oncoming traffic at all", () => {
  it("sc-turn-left-oncoming authors oncomingLeftTurn actors on the opposing arm", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-turn-left-oncoming");
    expect(spec, "the JU-10 lesson left the catalogue").toBeDefined();
    const staged = (spec!.staged ?? []).filter((e) => e.kind === "oncomingLeftTurn");
    expect(staged.length, "the gap-judgment lesson stages nothing to judge").toBeGreaterThan(0);
    for (const e of staged) {
      const ev = e as OncomingLeftTurnSpec;
      // Straight THROUGH the junction — an actor that turns off before the
      // mouth is never oncoming from the player's seat.
      expect(ev.actor.pathNodes.length, ev.id).toBeGreaterThanOrEqual(3);
      expect(ev.actor.pathNodes[ev.junctionNodeIndex], ev.id).toBe(ev.junction.nodeId);
      // Moving: `oncomingNearFor` ignores stopped cars (pinned above), so a
      // zero-cruise actor would be invisible to the very helper this file tests.
      expect(ev.actor.cruiseSpeedMps, `${ev.id} is parked, not oncoming`).toBeGreaterThan(0);
      // And the sync has to start while the player can still act on it.
      expect(ev.armDistM, ev.id).toBeGreaterThan(0);
    }
  });

  it("one of them is TIGHT enough to be the wait the lesson teaches", () => {
    // Both directions. A pair of comfortable actors satisfies the test above
    // and teaches nothing: the drill's subject is the gap you must NOT take.
    // The objectiveBg promises «изчакай плътния интервал (4 и повече секунди)»,
    // so at least one authored gap must sit under that norm.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === "sc-turn-left-oncoming");
    const gaps = (spec!.staged ?? [])
      .filter((e) => e.kind === "oncomingLeftTurn")
      .map((e) => (e as OncomingLeftTurnSpec).gapSec);
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...gaps), "no actor forces a wait").toBeLessThan(4);
    // …and one that is genuinely clear, or there is no gap to turn into.
    expect(Math.max(...gaps), "no actor leaves a takeable gap").toBeGreaterThanOrEqual(4);
  });
});
