/**
 * B33 — THE RELEASE IS A LIVE DECISION, NOT A ONE-SHOT PREDICTION.
 *
 * The founder, playing lesson 15 «Ограничена видимост»: *„if I drive under 22
 * as it states, the traffic car passes long before I reach the crossroad"*.
 * Obeying the instruction deleted the encounter.
 *
 * Measured on the real sc-junction-blind@L1 before this fix, at the pace its
 * own objective authorises (`maxSpeedKmh 22`) and its own instruction 3 demands
 * («приближи почти до спиране и изпълзи внимателно»): the witness gate fired at
 * t=17.0 s on a raw ETA of 6.2 s, the car crossed the node at t=23.4 s with the
 * player still 24.4 m short of it, and by the time he reached the junction
 * mouth at t=39.7 s the car was 145.7 m away and parked at the end of its path
 * for the rest of the drive. The prediction said 6.2 s. The truth was 22.7 s.
 * NOTHING RE-CHECKED IT.
 *
 * These are the unit proofs of the repair, against the same 1-D fake port
 * `witness-arm.test.ts` uses (junction at the origin, actor east→west, node arc
 * 95 on a 190 m path, player northbound up the south stem, lineDistM 18).
 */

import { describe, expect, it } from "vitest";
import type { PriorityFromRightSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../../traffic";
import { PriorityFromRightRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const DT = 1 / 30;
const NODE_S = 95;
const PATH_LEN = 190;
const LANE = 4.0625;
const LINE_DIST_M = 18;

/** 1-D fake of the staged seam, with a 2.6 m/s² ramp so a `cruise 0` command
 *  is a real deceleration rather than a teleport to standstill. */
class FakePriorityPort implements StagedTrafficPort {
  s = 0;
  speedMps = 0;
  private target = 0;
  private readonly cruise: number;

  constructor(cruise: number) {
    this.cruise = cruise;
  }

  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view();
  }

  stagedCommand(_id: string, command: StagedCommand): void {
    if (command.type === "cruise") this.target = command.speedMps ?? this.cruise;
    else if (command.type === "hold") this.target = 0;
    else if (command.type === "reset") {
      this.s = 0;
      this.speedMps = 0;
      this.target = 0;
    }
  }

  staged(_id: string): StagedActorView | null {
    return this.view();
  }

  tick(dtSec: number): void {
    const a = this.speedMps < this.target ? 2.6 : -4.5;
    this.speedMps =
      a > 0
        ? Math.min(this.target, this.speedMps + a * dtSec)
        : Math.max(this.target, this.speedMps + a * dtSec);
    this.s = Math.min(PATH_LEN, this.s + this.speedMps * dtSec);
  }

  private view(): StagedActorView {
    return {
      id: "rehold-conflict",
      kind: "vehicle",
      x: NODE_S - this.s,
      y: 0,
      dirX: -1,
      dirY: 0,
      speedMps: this.speedMps,
      s: this.s,
      pathLengthM: PATH_LEN,
      nodeS: [0, NODE_S, PATH_LEN],
      finished: this.s >= PATH_LEN,
    };
  }
}

function makeSpec(): PriorityFromRightSpec {
  return {
    id: "rehold-conflict",
    kind: "priorityFromRight",
    junction: { nodeId: "n-c", x: 0, y: 0 },
    junctionControl: "uncontrolled",
    actor: {
      pathNodes: ["n-e", "n-c", "n-w"],
      hold: { nodeIndex: 1, offsetM: -95 },
      cruiseSpeedMps: 8,
    },
    junctionNodeIndex: 1,
    armDistM: 70,
    leadSec: -3.5,
    lineDistM: LINE_DIST_M,
    clearSpeedMps: 11.5,
    witnessArm: { etaSec: 8, nearLineM: 6 },
  };
}

const rng = () => 0.5;

function input(tSec: number, y: number, speedKmh: number): DirectorInput {
  return {
    tSec,
    dtSec: DT,
    x: LANE,
    y,
    speedKmh,
    headingDeg: 0,
    brakePedal: 0,
    tickEvents: [] as SimTickEvent[],
  };
}

interface Result {
  /** Player's distance to the node when the car first reached it, m. */
  playerNodeDistAtCrossing: number | null;
  /** Player's speed at that moment, km/h. */
  playerSpeedAtCrossing: number;
  /** Did the runner ever take a release back? */
  reheld: boolean;
}

/**
 * THE FOUNDER'S DRIVE: obey the objective's own cap and instruction 3.
 * 20 km/h from y = −115, ease to 10 at −45, creep at 5 from −30, stop at −20
 * and wait. Exactly the profile measured against the live wiring above.
 */
function driveObedient(spec: PriorityFromRightSpec, holdSec: number): Result {
  const port = new FakePriorityPort(spec.actor.cruiseSpeedMps);
  const runner = new PriorityFromRightRunner(spec);
  runner.stage(port, rng, true);
  const out: SimTickEvent[] = [];

  let y = -115;
  let t = 0;
  let held = 0;
  let reheld = false;
  let wasTriggered = false;
  let playerNodeDistAtCrossing: number | null = null;
  let playerSpeedAtCrossing = 0;

  for (let frame = 0; frame < 30 * 200; frame++) {
    const kmh = y >= -20 ? 0 : y >= -30 ? 5 : y >= -45 ? 10 : 20;
    if (kmh === 0) held += DT;
    else y += (kmh / 3.6) * DT;
    t += DT;
    runner.step(port, input(t, y, kmh), out);
    if (wasTriggered && runner.phase === "armed") reheld = true;
    wasTriggered = runner.phase === "triggered";
    port.tick(DT);
    if (port.s >= NODE_S && playerNodeDistAtCrossing === null) {
      playerNodeDistAtCrossing = Math.hypot(LANE, y);
      playerSpeedAtCrossing = kmh;
    }
    if (held >= holdSec) break;
  }
  return { playerNodeDistAtCrossing, playerSpeedAtCrossing, reheld };
}

describe("PriorityFromRightRunner — B33 re-hold (obeying the lesson keeps the encounter)", () => {
  it("the car crosses while the obedient student is AT the mouth, not 24 m short of it", () => {
    const r = driveObedient(makeSpec(), 14);
    expect(r.playerNodeDistAtCrossing).not.toBeNull();
    // Before the fix this measured 24.4 m from the node with the student still
    // rolling; the car then parked 145 m away and never came back. The mouth of
    // these maps is ~17 m, so ≤ 22 m is "he is at the junction watching it".
    expect(r.playerNodeDistAtCrossing!).toBeLessThanOrEqual(22);
    // And he is stopped or creeping when it happens — the taught behaviour.
    expect(r.playerSpeedAtCrossing).toBeLessThanOrEqual(5);
    // …and the mechanism that achieved it is the re-hold, not luck.
    expect(r.reheld).toBe(true);
  });

  it("a constant-pace approach never re-holds (recorded choreography is untouched)", () => {
    const spec = makeSpec();
    const port = new FakePriorityPort(spec.actor.cruiseSpeedMps);
    const runner = new PriorityFromRightRunner(spec);
    runner.stage(port, rng, true);
    const out: SimTickEvent[] = [];
    const mps = 20 / 3.6;
    let y = -69;
    let t = 0;
    let reheld = false;
    let wasTriggered = false;
    for (let frame = 0; frame < 30 * 60; frame++) {
      y += mps * DT;
      t += DT;
      runner.step(port, input(t, y, 20), out);
      if (wasTriggered && runner.phase === "armed") reheld = true;
      wasTriggered = runner.phase === "triggered";
      port.tick(DT);
      if (port.s >= NODE_S) break;
    }
    // A steady approach's ETA only ever falls, so the release can never become
    // a lie — this is why witness-arm.test.ts's "commits on EXACTLY the legacy
    // frame" and every committed trace still hold.
    expect(reheld).toBe(false);
    expect(port.s).toBeGreaterThanOrEqual(NODE_S);
  });

  it("T7 is preserved: a STANDING student's release is never taken back", () => {
    const spec = makeSpec();
    const port = new FakePriorityPort(spec.actor.cruiseSpeedMps);
    const runner = new PriorityFromRightRunner(spec);
    runner.stage(port, rng, true);
    const out: SimTickEvent[] = [];
    // Roll up and stop 12 m short of the authored line — the T7 deadlock band,
    // where nearLineM fails and a stopped player's ETA is infinite. The
    // stopped-witness rule releases the car; the re-hold must not undo it.
    const restY = -(LINE_DIST_M + 12);
    let y = -69;
    let t = 0;
    let mps = 20 / 3.6;
    for (let frame = 0; frame < 30 * 90; frame++) {
      if (y >= restY) mps = 0;
      y = Math.min(restY, y + mps * DT);
      t += DT;
      runner.step(port, input(t, y, mps * 3.6), out);
      port.tick(DT);
      if (port.s >= NODE_S) break;
    }
    expect(runner.phase).toBe("triggered");
    expect(port.s).toBeGreaterThanOrEqual(NODE_S);
    expect(y).toBeCloseTo(restY, 6);
  });
});
