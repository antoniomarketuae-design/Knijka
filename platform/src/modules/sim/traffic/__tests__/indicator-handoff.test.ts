/**
 * Ledger L8 / L11, register row B73 — the renderer must PREFER the published
 * indicator over its yaw-rate guess.
 *
 * Doc 86 closed the engine half (`TrafficVehicleState.indicator` + the cut-in
 * runner's ≥ 3 s lead) and left this half open across two waves, with the file
 * named in the ledger: *„the renderer must prefer the published
 * `TrafficVehicleState.indicator` over its yaw-rate guess (TrafficLayer.tsx
 * :881-887). One file, two lanes."* The eight-agent verification pass then
 * confirmed the symptom by counting: TrafficLayer.tsx contained ZERO
 * occurrences of `indicator`, so the founder's *„the right signal turns on very
 * very very late"* was, on this drill, *„there is no right signal"*.
 *
 * These are the four properties that fix has to have, pinned so nobody can
 * quietly re-derive the lamp from geometry again.
 */
import { describe, expect, it } from "vitest";
import { blinkerSides } from "../TrafficLayer";

/** The file's own arming threshold; the numbers below straddle it. */
const OVER = 0.2;
const UNDER = 0.02;

describe("blinkerSides — the L6 indicator handoff", () => {
  it("a commanded lamp lights even when the car is not yawing at all", () => {
    // THE regression. A staged laneShift is a lateral glide: the shipped
    // sc-follow-cutin moves 8.125 m over 1.5 s at 11 m/s and its smoothed
    // steer peaks at 0.0624 — under the 0.07 threshold — so the guess never
    // armed. Commanded "right" with a dead-straight car must still blink.
    expect(blinkerSides("right", 0)).toEqual({ left: false, right: true });
    expect(blinkerSides("left", 0)).toEqual({ left: true, right: false });
    expect(blinkerSides("right", UNDER)).toEqual({ left: false, right: true });
  });

  it("a commanded lamp is never overridden by the geometry", () => {
    // The cut-in noses into the lane it is joining, so mid-glide the yaw guess
    // reads the OTHER way for a moment. The command is what the driver
    // announced; the wheel is only where it has got to.
    expect(blinkerSides("right", OVER)).toEqual({ left: false, right: true });
    expect(blinkerSides("left", -OVER)).toEqual({ left: true, right: false });
  });

  it("an uncommanded car keeps the yaw-rate guess — NPCs still signal turns", () => {
    // Suppressing this would be a new defect: a student reads the traffic
    // around him off these lamps, and an ambient car turning a corner without
    // a blinker teaches the wrong thing.
    expect(blinkerSides(undefined, OVER)).toEqual({ left: true, right: false });
    expect(blinkerSides(undefined, -OVER)).toEqual({ left: false, right: true });
    expect(blinkerSides("off", OVER)).toEqual({ left: true, right: false });
    expect(blinkerSides("off", -OVER)).toEqual({ left: false, right: true });
  });

  it("nothing is lit when nothing is commanded and nothing is turning", () => {
    expect(blinkerSides(undefined, UNDER)).toEqual({ left: false, right: false });
    expect(blinkerSides("off", 0)).toEqual({ left: false, right: false });
  });

  it("never lights both lamps at once (that reads as hazards, not a turn)", () => {
    for (const ind of ["left", "right", "off", undefined] as const) {
      for (const steer of [-OVER, -UNDER, 0, UNDER, OVER]) {
        const s = blinkerSides(ind, steer);
        expect(s.left && s.right, `${ind}/${steer}`).toBe(false);
      }
    }
  });
});
