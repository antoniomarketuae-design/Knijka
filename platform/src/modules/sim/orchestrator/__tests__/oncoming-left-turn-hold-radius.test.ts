/**
 * WHO IS STILL «AT THE JUNCTION» — sc-turn-left-oncoming:d079e687 (clause 5),
 * round 2. `OncomingLeftTurnRunner` keeps its encounter open after its car is
 * 40 m clear while the student is uncommitted and still at the junction, so
 * the turn he then makes is the commit the outcome reports
 * (`committed: true` + the interval). lessons/objectives.ts reads
 * `committed: false` as «he never turned» — the debrief's «Интервал: завоят не
 * беше започнат…».
 *
 * Round 1 bounded «at the junction» at 60 m. The encounter, though, is STARTED
 * by a student at ≤ 8 km/h anywhere inside the spec's `armDistM`, which is
 * 65 m on every catalogue site but one. The round-1 verifier drove a lawful
 * student who stopped 60.2–64.5 m out, waited, rolled up to the line and
 * turned: the encounter he had started resolved «clear, committed: false»
 * while he stood there, and his ✓ turn printed «не беше започнат» (120 lawful
 * cells of 420, both layouts, every cadence). The radius is now the larger of
 * the hold's own 60 m floor and the spec's arming distance.
 *
 * A hand-driven port, so every distance is exact. Each block also pins one
 * guard the round-1 verifier showed no test could tell apart from its absence
 * (mutants v2, v3, v5 of D:/knijka-lanes/scratch/ltapnote-verify/mut/).
 */

import { describe, expect, it } from "vitest";
import type { OncomingLeftTurnSpec, StagedEventOutcome } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../../traffic/types";
import { OncomingLeftTurnRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const DT = 1 / 60;
/** Node 1 of the oncoming's path is the junction, 200 m along it. */
const NODE_S = 200;

function spec(armDistM: number): OncomingLeftTurnSpec {
  return {
    id: "t-ltap-hold",
    kind: "oncomingLeftTurn",
    junction: { nodeId: "j", x: 0, y: 0 },
    actor: { pathNodes: ["a", "j", "b"], hold: { nodeIndex: 1, offsetM: -100 }, cruiseSpeedMps: 8.5 },
    junctionNodeIndex: 1,
    armDistM,
    gapSec: 6,
    clearSpeedMps: 12.5,
  };
}

/** One hand-placed oncoming car. */
class Port implements StagedTrafficPort {
  view: StagedActorView = {
    id: "t-ltap-hold",
    kind: "vehicle",
    x: -100,
    y: 0,
    dirX: 1,
    dirY: 0,
    speedMps: 0,
    s: NODE_S - 100,
    pathLengthM: 400,
    nodeS: [0, NODE_S, 400],
    finished: false,
  };
  readonly commands: StagedCommand[] = [];
  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(_id: string, command: StagedCommand): void {
    this.commands.push(command);
  }
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
  /** Put the car `carArcM` along its path from the junction (< 0: before it). */
  car(carArcM: number, speedMps: number, finished = false): void {
    this.view = { ...this.view, x: carArcM, s: NODE_S + carArcM, speedMps, finished };
  }
}

class Drive {
  readonly runner: OncomingLeftTurnRunner;
  readonly port = new Port();
  t = 0;
  constructor(armDistM: number) {
    this.runner = new OncomingLeftTurnRunner(spec(armDistM));
    this.runner.stage(this.port, () => 0.5, true);
  }
  /** One frame with the student `dM` east of the junction (negative: west, past it). */
  frame(dM: number, speedKmh: number, events: SimTickEvent[] = []): StagedEventOutcome | null {
    this.t += DT;
    const input: DirectorInput = {
      tSec: this.t,
      dtSec: DT,
      x: dM,
      y: 0,
      speedKmh,
      headingDeg: 270,
      brakePedal: 0,
      tickEvents: events,
    };
    return this.runner.step(this.port, input, []);
  }
}

const LEFT: SimTickEvent[] = [{ kind: "turnStarted", direction: "left" }];

describe("an uncommitted student is at the junction anywhere he could have started the encounter from", () => {
  it("armDistM 65: he stopped 63 m out and started it — its car 40 m clear does not resolve it behind his back", () => {
    const d = new Drive(65);
    d.port.car(-80, 0);
    expect(d.frame(63, 4)).toBeNull(); // ≤ 8 km/h inside 65 m: the encounter starts
    expect(d.runner.phase).toBe("triggered");
    d.port.car(41, 12.5); // its car is past the node and 41 m beyond it
    for (let i = 0; i < 600; i++) expect(d.frame(63, 0)).toBeNull(); // 10 s standing at 63 m
    expect(d.runner.phase).toBe("triggered");
    // He rolls up and turns: the turn is the commit the outcome reports.
    expect(d.frame(30, 10)).toBeNull();
    const o = d.frame(8, 12, LEFT);
    expect(o).not.toBeNull();
    expect(o!.detail).toBe("clear");
    expect(o!.committed).toBe(true);
  });

  it("armDistM 65: the student at 64.9 m is still held; at 65.1 m he has left it, committed: false", () => {
    const d = new Drive(65);
    d.port.car(-80, 0);
    d.frame(64.9, 4);
    d.port.car(41, 12.5);
    expect(d.frame(64.9, 0)).toBeNull();
    const o = d.frame(65.1, 0);
    expect(o).not.toBeNull();
    expect(o!.detail).toBe("clear");
    expect(o!.committed).toBe(false);
    expect(o!.acceptedGapSec).toBeUndefined();
  });

  it("the radius never shrinks below its 60 m floor: armDistM 40, a student 55 m past the node is still at it", () => {
    const d = new Drive(40);
    d.port.car(-80, 0);
    d.frame(39, 4); // starts the encounter inside 40 m
    expect(d.runner.phase).toBe("triggered");
    d.port.car(41, 12.5);
    // Straight on through the node and away west: 55 m out is still inside the floor.
    expect(d.frame(-55, 20)).toBeNull();
    const o = d.frame(-60.1, 20);
    expect(o).not.toBeNull();
    expect(o!.committed).toBe(false);
  });
});

describe("a committed student is not held — the encounter ends when its car is clear (mutant v2)", () => {
  it("he turned with the car 50 m out at 8.5 m/s; it clears 40 m past the node while he is 20 m from the junction: resolved on that frame", () => {
    const d = new Drive(65);
    d.port.car(-80, 0);
    d.frame(30, 6);
    d.port.car(-50, 8.5);
    expect(d.frame(10, 12, LEFT)).toBeNull();
    d.port.car(41, 12.5);
    const o = d.frame(20, 15);
    expect(o).not.toBeNull();
    expect(o!.detail).toBe("clear");
    expect(o!.committed).toBe(true);
    expect(o!.acceptedGapSec!).toBeCloseTo(50 / 8.5, 6);
  });
});

describe("a left turn farther than 45 m from the junction is another corner, not this commit (mutant v3)", () => {
  it("turnStarted left at 50 m: no commit, no interval — held while he is at the junction, then committed: false", () => {
    const d = new Drive(65);
    d.port.car(-80, 0);
    d.frame(50, 6); // starts the encounter at 50 m
    d.port.car(-50, 8.5);
    expect(d.frame(50, 8, LEFT)).toBeNull(); // a driveway 50 m before the junction
    d.port.car(41, 12.5);
    expect(d.frame(50, 8)).toBeNull(); // not committed here: held
    const o = d.frame(70, 15);
    expect(o).not.toBeNull();
    expect(o!.committed).toBe(false);
    expect(o!.acceptedGapSec).toBeUndefined();
  });
});

describe("a car that runs out of path before it is 40 m clear still ends the encounter (mutant v5)", () => {
  it("committed student; the car's path ends 10 m past the node (finished): resolved on that frame", () => {
    const d = new Drive(65);
    d.port.car(-80, 0);
    d.frame(30, 6);
    d.port.car(-60, 8.5);
    expect(d.frame(8, 12, LEFT)).toBeNull();
    d.port.car(10, 8.5, true);
    const o = d.frame(15, 15);
    expect(o).not.toBeNull();
    expect(o!.detail).toBe("clear");
    expect(o!.committed).toBe(true);
  });
});
