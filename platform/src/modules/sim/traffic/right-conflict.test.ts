import { describe, expect, it } from "vitest";
import { conflictFromRightFor, RIGHT_ARRIVAL_LATE_SEC } from "./system";
import { LEFT_TURN_CONVICT_GAP_SEC } from "../runtime/worldRuntime";

const veh = (x: number, y: number, dirX: number, dirY: number, speedMps = 8) => ({
  x,
  y,
  dirX,
  dirY,
  speedMps,
});

// Player at origin heading north; junction ahead at (0,10); the player's right is +x (east).
describe("conflictFromRightFor", () => {
  it("flags a car approaching from the right", () => {
    expect(conflictFromRightFor([veh(8, 12, -1, 0)], 0, 10, 0, 0, 0, 16)).toBe(true);
  });

  it("ignores a car on the left", () => {
    expect(conflictFromRightFor([veh(-8, 12, 1, 0)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });

  it("ignores a car far from the junction", () => {
    expect(conflictFromRightFor([veh(30, 40, -1, 0)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });

  it("ignores same-direction traffic on the right", () => {
    expect(conflictFromRightFor([veh(8, 12, 0, 1)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });

  it("ignores stopped cars", () => {
    expect(conflictFromRightFor([veh(8, 12, -1, 0, 0)], 0, 10, 0, 0, 0, 16)).toBe(false);
  });
});

/*
 * ARRIVAL, NOT PRESENCE — the clauses added for sc-junction-blind:dea35510.
 *
 * The row: the lesson's own model line (creep, eight seconds on the brake,
 * then the authored left turn) was billed «Непропускане на пътно превозно
 * средство с предимство», опасна, НЕИЗДЪРЖАН on 10-11 of 20 ambient seeds at
 * the counts the rungs compile to, and on 0 of 20 with the ambient bodies
 * removed. Dumped at the conviction frame, the convicting vehicle was never one
 * the student obstructed: it was either ~1.2 s from the node while he was 3.5 s
 * back (23 m gone before he arrived) or 16-22 s away, crawling.
 *
 * Both clauses can only ever REMOVE a conviction, so the first block above —
 * every legacy six-argument call — is untouched, and the "still coming, and we
 * meet" case below asserts the other direction.
 */
describe("conflictFromRightFor · arrival", () => {
  // Player 20 m south of the junction at (0,0) heading north, 36 km/h = 10 m/s:
  // he reaches the node in 2.0 s. His right is +x (east).
  const P = { px: 0, py: -20, kmh: 36 };
  const at = (vehicles: Parameters<typeof conflictFromRightFor>[0], kmh?: number) =>
    conflictFromRightFor(vehicles, 0, 0, P.px, P.py, 0, 26, kmh);

  it("a car that will still be in the box when he arrives is his to give way to", () => {
    // 18 m east closing at 9 m/s → node in 2.0 s, exactly when he gets there.
    expect(at([veh(18, 0, -1, 0, 9)], P.kmh)).toBe(true);
  });

  it("…and the same car is a conflict for a caller that passes no speed", () => {
    expect(at([veh(18, 0, -1, 0, 9)])).toBe(true);
  });

  it("a car that clears the node long before he arrives is not", () => {
    // 6 m east closing at 10 m/s: at his 2.0 s arrival it is 14 m past the node
    // — beyond CONFLICT_CLEARED_M (10.175), tail off his carriageway.
    expect(at([veh(6, 0, -1, 0, 10)], P.kmh)).toBe(false);
    // …but presence-only still convicts, which is the defect this repairs.
    expect(at([veh(6, 0, -1, 0, 10)])).toBe(true);
  });

  it("a car crawling 20 m out, twenty seconds away, is not", () => {
    expect(at([veh(20, 0, -1, 0, 1.2)], P.kmh)).toBe(false);
    expect(at([veh(20, 0, -1, 0, 1.2)])).toBe(true);
  });

  it("a car leaving the node on his right, already clear, is not", () => {
    // Crossed the mouth and driving EAST away from it — still on his right, so
    // the side test keeps it, and only the cleared clause can let it go: 14 m
    // out is past CONFLICT_CLEARED_M (10.175), tail off the carriageway.
    expect(at([veh(14, 0, 1, 0, 8)], P.kmh)).toBe(false);
    expect(at([veh(14, 0, 1, 0, 8)])).toBe(false); // …with or without his speed
  });

  it("…but one still straddling the mouth is, even though it is departing", () => {
    expect(at([veh(6, 0, 1, 0, 8)], P.kmh)).toBe(true);
  });

  it("a standing student still SEES the car he is waiting for", () => {
    // The commendation path («Правилно отстъпено предимство») reads the same
    // query while he holds the brake; below the speed floor the arrival clause
    // stands down rather than acquitting everything into silence.
    expect(at([veh(20, 0, -1, 0, 1.2)], 0)).toBe(true);
  });
});

describe("the arrival window is the engine's own conviction band", () => {
  it("equals LEFT_TURN_CONVICT_GAP_SEC", () => {
    // Same physics, same duty, one adjudicator over: a gap of two seconds or
    // less is the one the priority driver cannot absorb. Duplicated rather than
    // imported because traffic/ sits below runtime/; this is the seam that
    // stops the two drifting apart.
    expect(RIGHT_ARRIVAL_LATE_SEC).toBe(LEFT_TURN_CONVICT_GAP_SEC);
  });
});
