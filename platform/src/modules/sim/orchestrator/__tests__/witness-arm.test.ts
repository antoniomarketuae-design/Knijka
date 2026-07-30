/**
 * S2 witness gate (doc 62 founder R3 — staged-car timing vs live pacing):
 * PriorityFromRightRunner unit proofs against a fake StagedTrafficPort (the
 * types.ts "unit-testable against a fake port" seam).
 *
 * The founder's live finding (#15 „Ограничена видимост", #16 „Ляв завой от
 * Б2", #17 „Загаснал светофар", #18 „Мигащо жълто"): the conflict car passes
 * the junction "very very early" — released by the legacy 22 m distance
 * commit while a hesitant student is still half a minute from the line, so
 * they wait at the mouth for a car that has long cleared. With
 * `witnessArm` the release additionally waits for the player's true arrival
 * (raw ETA ≤ etaSec, or within nearLineM of the line), so the encounter is
 * guaranteed PRESENT at any pace — while a scripted-pace approach commits on
 * exactly the same frame as the legacy rule (recorded choreography identical;
 * the sc-ju2/sc-ju3/sc-signals trace gates prove the committed bytes).
 *
 * Geometry mirrors SC_SIGNAL_DEAD_CONFLICT / SC_JUNCTION_BLIND_CONFLICT:
 * junction at the origin, actor path east → node → west (node arc 95 on a
 * 190 m path, hold at arc 0 = 95 m east), player northbound up the south
 * stem at x = 4.06, lineDistM 18, armDistM 70, cruise 8 m/s.
 */

import { describe, expect, it } from "vitest";
import type { PriorityFromRightSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../../traffic";
import { PriorityFromRightRunner, WITNESS_STOPPED_NEAR_M } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const DT = 1 / 30;
const NODE_S = 95;
const PATH_LEN = 190;

/** 1-D fake of the staged seam: the conflict car lives on its arc, east→west. */
class FakePriorityPort implements StagedTrafficPort {
  s = 0; // hold pose: nodeIndex 1 (arc 95) + offsetM −95
  speedMps = 0;
  private readonly cruise: number;

  constructor(cruise: number) {
    this.cruise = cruise;
  }

  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view();
  }

  stagedCommand(_id: string, command: StagedCommand): void {
    if (command.type === "cruise") this.speedMps = command.speedMps ?? this.cruise;
    else if (command.type === "hold") this.speedMps = 0;
    else if (command.type === "reset") {
      this.s = 0;
      this.speedMps = 0;
    }
  }

  staged(_id: string): StagedActorView | null {
    return this.view();
  }

  tick(dtSec: number): void {
    this.s = Math.min(PATH_LEN, this.s + this.speedMps * dtSec);
  }

  private view(): StagedActorView {
    return {
      id: "witness-conflict",
      kind: "vehicle",
      x: NODE_S - this.s, // east arm: +95 … node 0 … west arm −95
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

const LANE = 4.0625;
const LINE_DIST_M = 18;

function makeSpec(witness: boolean): PriorityFromRightSpec {
  return {
    id: "witness-conflict",
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
    ...(witness ? { witnessArm: { etaSec: 8, nearLineM: 6 } } : {}),
  };
}

/** Fixed-value rng — jitters become their authored centers (deterministic). */
const rng = () => 0.5;

function input(tSec: number, y: number, speedKmh: number): DirectorInput {
  return {
    tSec,
    dtSec: DT,
    x: LANE,
    y,
    speedKmh,
    headingDeg: 0, // northbound at the junction
    brakePedal: 0,
    tickEvents: [] as SimTickEvent[],
  };
}

interface HesitantResult {
  /** Player's distance to THEIR line when the car first reached the node, m. */
  lineDistAtCrossing: number | null;
  /** Player line distance when the car was released through the box, m. */
  lineDistAtCommit: number | null;
}

/**
 * The founder's hesitant drive: creep at 4 km/h from y = −69, STOP for 12 s
 * at 12 m short of the line (reading the instructions), then creep on to the
 * line. Returns where the player was when the car crossed.
 */
function driveHesitant(spec: PriorityFromRightSpec): HesitantResult {
  const port = new FakePriorityPort(spec.actor.cruiseSpeedMps);
  const runner = new PriorityFromRightRunner(spec);
  runner.stage(port, rng, true);

  const creepMps = 4 / 3.6;
  const stopAtY = -(LINE_DIST_M + 12); // 12 m short of the line
  let y = -69;
  let t = 0;
  let stoppedForSec = 0;
  let lineDistAtCrossing: number | null = null;
  let lineDistAtCommit: number | null = null;
  const out: SimTickEvent[] = [];

  for (let frame = 0; frame < 30 * 120 && y < -(LINE_DIST_M - 2); frame++) {
    let speedKmh = 4;
    const holding = y >= stopAtY && stoppedForSec < 12;
    if (holding) {
      speedKmh = 0;
      stoppedForSec += DT;
    } else {
      y += creepMps * DT;
    }
    t += DT;
    const wasArmed = runner.phase === "armed";
    runner.step(port, input(t, y, speedKmh), out);
    port.tick(DT);
    const lineDist = Math.max(0, Math.hypot(LANE, y) - LINE_DIST_M);
    if (wasArmed && runner.phase === "triggered" && lineDistAtCommit === null) {
      lineDistAtCommit = lineDist;
    }
    if (port.s >= NODE_S && lineDistAtCrossing === null) {
      lineDistAtCrossing = lineDist;
      break;
    }
  }
  return { lineDistAtCrossing, lineDistAtCommit };
}

describe("PriorityFromRightRunner — the S2 witness gate (doc 62)", () => {
  /**
   * L7 (ledger §4) — RE-BASELINED. This case used to be titled "LEGACY (no
   * witnessArm): the car crosses UNWITNESSED, far from the line" and pinned
   * `lineDistAtCrossing > 10` as CORRECT. That pinned the defect: the gate was
   * opt-in and eight of thirteen `priorityFromRight` specs never opted in
   * (SC_JUNCTION_RHR_CONFLICT, SC_JX_GIVEWAY_CONFLICT,
   * SC_JX_EQUAL_RIGHT_CONFLICT among them), so a student obeying the
   * objective's own «приближи бавно» reached an empty junction — the lesson
   * deleted itself for doing what it asked. The gate is now the default and an
   * unwitnessed release is no longer expressible.
   */
  it("L7: the gate is DEFAULT-ON — an unauthored spec behaves like an authored one", () => {
    const withoutArm = driveHesitant(makeSpec(false));
    const withArm = driveHesitant(makeSpec(true));
    expect(withoutArm.lineDistAtCrossing).not.toBeNull();
    expect(withoutArm.lineDistAtCrossing).toBeCloseTo(withArm.lineDistAtCrossing!, 6);
    expect(withoutArm.lineDistAtCommit).toBeCloseTo(withArm.lineDistAtCommit!, 6);
  });

  it("witnessArm: the hesitant player is STOPPED AND WATCHING when the car crosses", () => {
    const r = driveHesitant(makeSpec(true));
    // The release waited for the player's true arrival. He halts 12 m short of
    // his line and sits there; the car takes its priority in front of a
    // stationary observer instead of freezing indefinitely (see the
    // stopped-witness note in runners.ts). 12.27 m from the line = 30.3 m from
    // the node — he is looking straight at the box.
    expect(r.lineDistAtCrossing).not.toBeNull();
    expect(r.lineDistAtCrossing!).toBeLessThanOrEqual(WITNESS_STOPPED_NEAR_M);
    // And the commit itself only fired once the player was genuinely close.
    expect(r.lineDistAtCommit).not.toBeNull();
    expect(r.lineDistAtCommit!).toBeLessThanOrEqual(WITNESS_STOPPED_NEAR_M);
  });

  /**
   * T7's second harm (ledger §2): `lineDistM 18` on sc-signal-dead /
   * sc-signal-flashing is the engine's RHR core radius, not the world's stop
   * line at 27.7 m. A student who obeys instruction 4 and stops AT the painted
   * line therefore reads as playerLineDist ≈ 10–12 m: `nearLineM 6` fails, and
   * at 0 km/h the raw ETA floors to 12/0.5 = 24 s so `etaSec 8` fails too. The
   * runner used to fall through to `cruise 0` and the car waited FOREVER —
   * "I let everybody pass … but Error appeared that I made error". The
   * stopped-witness release ends the deadlock without needing the data fix.
   */
  it("T7: a player STOPPED at the real line (12 m out) still gets the release", () => {
    const spec = makeSpec(true);
    const port = new FakePriorityPort(spec.actor.cruiseSpeedMps);
    const runner = new PriorityFromRightRunner(spec);
    runner.stage(port, rng, true);
    const out: SimTickEvent[] = [];
    // Roll up at 20 km/h and come to a full stop 12 m short of lineDistM —
    // i.e. exactly on the world's real stop line, 9.7 m beyond the authored one.
    const restY = -(LINE_DIST_M + 12);
    let y = -69;
    let t = 0;
    let speedMps = 20 / 3.6;
    let frames = 0;
    for (; frames < 30 * 60; frames++) {
      if (y >= restY) speedMps = 0;
      y = Math.min(restY, y + speedMps * DT);
      t += DT;
      runner.step(port, input(t, y, speedMps * 3.6), out);
      port.tick(DT);
      if (port.s >= NODE_S) break;
    }
    expect(runner.phase).toBe("triggered");
    expect(port.s).toBeGreaterThanOrEqual(NODE_S);
    // The player never moved off the line — the car came to HIM.
    expect(y).toBeCloseTo(restY, 6);
  });

  it("witnessArm: a stopped-at-the-line player still gets the release (nearLineM)", () => {
    const spec = makeSpec(true);
    const port = new FakePriorityPort(spec.actor.cruiseSpeedMps);
    const runner = new PriorityFromRightRunner(spec);
    runner.stage(port, rng, true);
    const out: SimTickEvent[] = [];
    // Roll up at 20 km/h, brake to a stand 1.5 m short of the line, wait.
    let y = -69;
    let t = 0;
    let speedMps = 20 / 3.6;
    const restY = -(LINE_DIST_M + 1.5);
    for (let frame = 0; frame < 30 * 60; frame++) {
      if (y >= restY) speedMps = 0;
      y = Math.min(restY, y + speedMps * DT);
      t += DT;
      runner.step(port, input(t, y, speedMps * 3.6), out);
      port.tick(DT);
      if (port.s >= NODE_S) break;
    }
    // Standing at the mouth, the car was released and crossed in front.
    expect(runner.phase).toBe("triggered");
    expect(port.s).toBeGreaterThanOrEqual(NODE_S);
  });

  it("scripted pace (20 km/h): witnessArm commits on EXACTLY the legacy frame", () => {
    const specs = [makeSpec(false), makeSpec(true)];
    const commitFrames: number[] = [];
    for (const spec of specs) {
      const port = new FakePriorityPort(spec.actor.cruiseSpeedMps);
      const runner = new PriorityFromRightRunner(spec);
      runner.stage(port, rng, true);
      const out: SimTickEvent[] = [];
      const speedMps = 20 / 3.6;
      let y = -69;
      let t = 0;
      let commitFrame = -1;
      for (let frame = 0; frame < 30 * 60; frame++) {
        y += speedMps * DT;
        t += DT;
        runner.step(port, input(t, y, 20), out);
        port.tick(DT);
        if (runner.phase === "triggered") {
          commitFrame = frame;
          break;
        }
      }
      commitFrames.push(commitFrame);
    }
    expect(commitFrames[0]).toBeGreaterThan(0);
    expect(commitFrames[1]).toBe(commitFrames[0]);
  });
});
