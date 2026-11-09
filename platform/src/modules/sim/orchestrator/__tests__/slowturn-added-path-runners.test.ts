/**
 * THE ADDED-PATH FLAG AT THE TWO RUNNERS THAT READ `turnStarted` (lane
 * slowturn, ruling R11). runtime/turns.ts now also reports a slow or
 * stop-interrupted junction turn, flagged `addedPath: true`. Such an event
 * BILLS exactly as a base event and never CREDITS or NARRATES:
 *
 *  - CyclistRightHookRunner: an added right turn with the rider alongside is
 *    the hook (FAILED_TO_YIELD «cyclist-right-hook»), as a base turn is; an
 *    added right turn after the rider got clear earns NO credit — the drive
 *    resolves «clear», as it did when the turn was not seen at all;
 *  - OncomingLeftTurnRunner: an added left turn is a commit (`committed:
 *    true` — he did turn), but records no `acceptedGapSec` and marks the
 *    outcome `addedPathCommit`, so the Интервал row does not narrate it; a
 *    conviction made at it resolves «violation» with no figure.
 *
 * Port-level, with a fake traffic port whose one actor the test places — the
 * tram-actors / cyclist-rig mold.
 */
import { describe, expect, it } from "vitest";
import type { CyclistRightHookSpec, OncomingLeftTurnSpec, StagedEventOutcome } from "../../contracts";
import type { SimTickEvent } from "../../rules/types";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../../traffic/types";
import { CyclistRightHookRunner, OncomingLeftTurnRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";

const rng = () => 0.5;

class FakePort implements StagedTrafficPort {
  view: { x: number; y: number; s: number; speedMps: number } = { x: 0, y: 0, s: 0, speedMps: 0 };
  commands: Array<{ id: string; command: StagedCommand }> = [];
  private id = "";
  stage(spec: StagedActorSpec): StagedActorView | null {
    this.id = spec.id;
    return this.staged();
  }
  stagedCommand(id: string, command: StagedCommand): void {
    this.commands.push({ id, command });
  }
  staged(): StagedActorView | null {
    return {
      id: this.id,
      kind: "vehicle",
      x: this.view.x,
      y: this.view.y,
      dirX: 0,
      dirY: 1,
      speedMps: this.view.speedMps,
      s: this.view.s,
      pathLengthM: 200,
      nodeS: [0, 100, 200],
      finished: false,
    };
  }
}

function input(t: number, x: number, y: number, headingDeg: number, kmh: number, ev: SimTickEvent[] = []): DirectorInput {
  return { tSec: t, dtSec: 1 / 60, x, y, speedKmh: kmh, headingDeg, brakePedal: 0, tickEvents: ev };
}

const RIGHT_BASE: SimTickEvent = { kind: "turnStarted", direction: "right" };
const RIGHT_ADDED: SimTickEvent = { kind: "turnStarted", direction: "right", addedPath: true };
const LEFT_BASE: SimTickEvent = { kind: "turnStarted", direction: "left" };
const LEFT_ADDED: SimTickEvent = { kind: "turnStarted", direction: "left", addedPath: true };

// ── Cyclist: junction at the origin, the player arrives northbound from the
// south; the rider rides the same way on his right (path arc 100 = the node).
const HOOK: CyclistRightHookSpec = {
  id: "t-hook",
  kind: "cyclistRightHook",
  junction: { nodeId: "n1", x: 0, y: 0 },
  actor: { pathNodes: ["a", "b", "c"], hold: { nodeIndex: 1, offsetM: -30 }, cruiseSpeedMps: 4 },
  junctionNodeIndex: 1,
  releaseDistM: 60,
  dangerRadiusM: 9,
  conflictWindowM: 25,
};

function cyclistDrive(turn: SimTickEvent, riderAlongside: boolean): { out: SimTickEvent[]; outcome: StagedEventOutcome | null } {
  const port = new FakePort();
  const r = new CyclistRightHookRunner(HOOK);
  r.stage(port, rng, true);
  const out: SimTickEvent[] = [];
  let outcome: StagedEventOutcome | null = null;
  // Arm: 50 m south, heading north (approaching).
  port.view = { x: 2.6, y: -55, s: 45, speedMps: 4 };
  r.step(port, input(1, 0, -50, 0, 10), out);
  // Rider within the conflict window while the player is at the junction.
  port.view = { x: 2.6, y: -12, s: 88, speedMps: 4 };
  r.step(port, input(2, 0, -14, 0, 10), out);
  // The turn: rider alongside (arc < 8 m past the node, 3 m away) or long clear.
  port.view = riderAlongside ? { x: 2.6, y: -6, s: 94, speedMps: 4 } : { x: 2.6, y: 40, s: 140, speedMps: 4 };
  outcome = r.step(port, input(3, 0, -8, 30, 10, [turn]), out) ?? outcome;
  // He completes the junction: within 16 m of it, then 22 m beyond it.
  port.view = { x: 2.6, y: 60, s: 160, speedMps: 4 };
  if (outcome === null) outcome = r.step(port, input(4, 5, -5, 90, 10), out);
  if (outcome === null) outcome = r.step(port, input(6, 30, -3, 90, 10), out);
  return { out, outcome };
}

describe("CyclistRightHookRunner — the added right turn bills the hook, never earns the credit", () => {
  it("HOOK-BASE (control): a base right turn with the rider alongside is the hook", () => {
    const d = cyclistDrive(RIGHT_BASE, true);
    expect(d.outcome?.detail).toBe("violation");
  });
  it("HOOK-ADDED: an ADDED right turn with the rider alongside is the hook too — FAILED_TO_YIELD «cyclist-right-hook»", () => {
    const d = cyclistDrive(RIGHT_ADDED, true);
    expect(d.outcome?.detail).toBe("violation");
    expect(d.out).toContainEqual({ kind: "prioritySituation", situation: "cyclist-right-hook", violated: true });
  });
  it("CREDIT-BASE (control): a base right turn after the rider got clear earns the yield credit", () => {
    const d = cyclistDrive(RIGHT_BASE, false);
    expect(d.outcome?.detail).toBe("yielded");
  });
  it("NO-CREDIT-ADDED: an ADDED right turn after the rider got clear resolves «clear» — no YIELDED_TO_PRIORITY", () => {
    const d = cyclistDrive(RIGHT_ADDED, false);
    expect(d.outcome?.detail).toBe("clear");
    expect(d.out.filter((e) => e.kind === "prioritySituation")).toEqual([]);
  });
});

// ── Oncoming: junction at the origin; the oncoming car's path reaches the
// node at arc 100. The player is 20 m out, turning.
const LTAP: OncomingLeftTurnSpec = {
  id: "t-ltap",
  kind: "oncomingLeftTurn",
  junction: { nodeId: "n1", x: 0, y: 0 },
  actor: { pathNodes: ["a", "b", "c"], hold: { nodeIndex: 1, offsetM: -100 }, cruiseSpeedMps: 8 },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 6,
  clearSpeedMps: 12,
};

function oncomingDrive(events: SimTickEvent[]): StagedEventOutcome | null {
  const port = new FakePort();
  const r = new OncomingLeftTurnRunner(LTAP);
  r.stage(port, rng, true);
  const out: SimTickEvent[] = [];
  // The car 30 m short of the node at 8 m/s (3.75 s) on the commit frame.
  port.view = { x: 0, y: 30, s: 70, speedMps: 8 };
  let outcome = r.step(port, input(1, 0, -20, 0, 10, events), out);
  if (outcome !== null) return outcome;
  // The car 45 m past the node — the encounter is over.
  port.view = { x: 0, y: -45, s: 145, speedMps: 8 };
  outcome = r.step(port, input(2, -10, -10, 270, 10), out);
  return outcome;
}

describe("OncomingLeftTurnRunner — the added commit is a commit with no figure", () => {
  it("GAP-BASE (control): a base left turn records the accepted gap, 30 m / 8 m/s = 3.75 s", () => {
    const o = oncomingDrive([LEFT_BASE]);
    expect(o?.detail).toBe("clear");
    expect(o?.committed).toBe(true);
    expect(o?.acceptedGapSec).toBeCloseTo(3.75, 6);
    expect(o?.addedPathCommit).toBeUndefined();
  });
  it("NO-GAP-ADDED: an ADDED left turn commits, records NO accepted gap, and marks the outcome addedPathCommit", () => {
    const o = oncomingDrive([LEFT_ADDED]);
    expect(o?.detail).toBe("clear");
    expect(o?.committed).toBe(true);
    expect(o?.acceptedGapSec).toBeUndefined();
    expect(o?.addedPathCommit).toBe(true);
  });
  it("CONVICT-ADDED: a conviction at an ADDED commit resolves «violation» with no figure", () => {
    const o = oncomingDrive([
      LEFT_ADDED,
      { kind: "prioritySituation", situation: "left-turn-oncoming", violated: true, addedPath: true },
    ]);
    expect(o?.detail).toBe("violation");
    expect(o?.acceptedGapSec).toBeUndefined();
    expect(o?.addedPathCommit).toBe(true);
  });
  it("NO-FIGURE-FROM-THE-ADDED-ADJUDICATION: even a gapSec on an added-path prioritySituation is not recorded", () => {
    const o = oncomingDrive([
      LEFT_ADDED,
      { kind: "prioritySituation", situation: "left-turn-oncoming", violated: true, gapSec: 4.9, addedPath: true },
    ]);
    expect(o?.acceptedGapSec).toBeUndefined();
  });
});
