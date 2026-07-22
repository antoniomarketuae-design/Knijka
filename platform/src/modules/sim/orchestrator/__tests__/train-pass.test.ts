/**
 * ADR-006 stage 3c — the TRAIN as the railway-crossing actor (RX-02/RX-01).
 *
 *  1. TrainPassRunner (port-level, the tram-actors recording-fake pattern):
 *     stages a path-locked "train" on the authored PERPENDICULAR rail polyline
 *     (railPath, empty pathNodes, playerGuard OFF), holds it dormant, releases
 *     it at CRUISE once the player nears the crossing, resolves "clear" when it
 *     finishes, and resets on retry — emitting ZERO SimTick events (grading is
 *     byte-neutral; the world-data rail detectors alone convict).
 *  2. The template↔map pin (the L7 discipline): every rail template's train
 *     rides the exact rail line the regenerated district authors.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TrainPassSpec } from "../../contracts";
import type { SimTickEvent } from "../../rules";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
} from "../../traffic/types";
import { TrainPassRunner } from "../runners";
import type { DirectorInput, StagedTrafficPort } from "../types";
import {
  SC_RX_BARRIER_DROP,
  SC_RX_GUARDED,
  SC_RX_UNGUARDED,
} from "../../lessons/scenario/templates-rail";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const rng = () => 0.5; // the train draws no jitter — value is irrelevant

/** Recording fake with a MUTABLE view so step() can watch the run finish. */
class FakePort implements StagedTrafficPort {
  staged_: StagedActorSpec[] = [];
  commands: Array<{ id: string; command: StagedCommand }> = [];
  view: StagedActorView = {
    id: "",
    kind: "vehicle",
    x: -50,
    y: 153,
    dirX: 1,
    dirY: 0,
    speedMps: 0,
    s: 80,
    pathLengthM: 260,
    nodeS: [0, 260],
    finished: false,
  };

  stage(spec: StagedActorSpec): StagedActorView | null {
    this.staged_.push(spec);
    this.view = { ...this.view, id: spec.id };
    return this.view;
  }
  stagedCommand(id: string, command: StagedCommand): void {
    this.commands.push({ id, command });
  }
  staged(): StagedActorView | null {
    return this.view;
  }
}

const TRAIN: TrainPassSpec = {
  id: "t-train",
  kind: "trainPass",
  railPath: [
    { x: -130, y: 153 },
    { x: 130, y: 153 },
  ],
  holdOffsetM: 80,
  cruiseSpeedMps: 12,
  accelMps2: 3.5,
  triggerPlayerDistM: 55,
  crossing: { x: 4.06, y: 153 },
  colorIndex: 0,
};

function input(x: number, y: number, speedKmh: number): DirectorInput {
  return { tSec: 1, dtSec: 0.1, x, y, speedKmh, headingDeg: 0, brakePedal: 0, tickEvents: [] };
}

describe("TrainPassRunner — the level-crossing train (RX-02/RX-01)", () => {
  it("stages a path-locked train on the rail polyline: profile train, no lane path, no guard", () => {
    const port = new FakePort();
    new TrainPassRunner(TRAIN).stage(port, rng, true);
    expect(port.staged_).toHaveLength(1);
    const spec = port.staged_[0];
    expect(spec.kind).toBe("vehicle");
    if (spec.kind !== "vehicle") return;
    expect(spec.profile).toBe("train");
    expect(spec.railPath).toEqual(TRAIN.railPath); // the authored line, not lane graph
    expect(spec.pathNodes).toEqual([]); // no road-graph path
    expect(spec.hold).toEqual({ nodeIndex: 0, offsetM: 80 });
    expect(spec.cruiseSpeedMps).toBe(12);
    expect(spec.playerGuard).toBe(false); // the train never yields to a car
    expect(port.commands).toEqual([]); // dormant — no command at stage
  });

  it("holds while the player is far, releases at CRUISE once they near the crossing", () => {
    const port = new FakePort();
    const runner = new TrainPassRunner(TRAIN);
    runner.stage(port, rng, true);
    const events: SimTickEvent[] = [];

    // Far away + approaching → still armed, no command, no events.
    expect(runner.step(port, input(4.06, 60, 30), events)).toBeNull();
    expect(port.commands).toEqual([]);
    expect(events).toEqual([]); // BYTE-NEUTRAL to grading

    // Within triggerPlayerDistM (43 m from the crossing) and heading north.
    expect(runner.step(port, input(4.06, 110, 30), events)).toBeNull();
    expect(port.commands).toEqual([{ id: "t-train", command: { type: "cruise" } }]);
    expect(events).toEqual([]); // still emits nothing
  });

  it("resolves clear when the train finishes its line — no SimTick events, ever", () => {
    const port = new FakePort();
    const runner = new TrainPassRunner(TRAIN);
    runner.stage(port, rng, true);
    const events: SimTickEvent[] = [];
    runner.step(port, input(4.06, 110, 30), events); // trigger
    port.view = { ...port.view, finished: true };
    const outcome = runner.step(port, input(4.06, 150, 10), events);
    expect(outcome?.success).toBe(true);
    expect(outcome?.detail).toBe("clear");
    expect(outcome?.kind).toBe("trainPass");
    expect(events).toEqual([]);
    expect(runner.phase).toBe("resolved");
  });

  it("re-stage (retry) resets the train, stages nothing new", () => {
    const port = new FakePort();
    const runner = new TrainPassRunner(TRAIN);
    runner.stage(port, rng, true);
    runner.stage(port, rng, false);
    expect(port.staged_).toHaveLength(1); // no duplicate actor
    expect(port.commands).toEqual([{ id: "t-train", command: { type: "reset" } }]);
  });
});

describe("the rail templates' train rides the exact line the map authors (L7 pin)", () => {
  const CASES = [
    { spec: SC_RX_UNGUARDED, districtId: "rx-unguarded-v1", eventId: "sc-rxu-train" },
    { spec: SC_RX_GUARDED, districtId: "rx-guarded-v1", eventId: "sc-rxg-train" },
    { spec: SC_RX_BARRIER_DROP, districtId: "rx-drop-v1", eventId: "sc-rxd-train" },
  ] as const;

  for (const { spec, districtId, eventId } of CASES) {
    it(`${spec.id}: the staged trainPass matches ${districtId} meta.scenario.railCrossing.railPath`, () => {
      const event = spec.staged?.find((e) => e.id === eventId);
      expect(event, `${spec.id} must stage the train ${eventId}`).toBeDefined();
      expect(event!.kind).toBe("trainPass");
      const train = event as TrainPassSpec;

      const district = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, "content", "world", `${districtId}.json`), "utf8"),
      ) as { meta: { scenario: { railCrossing: { railPath: number[][] } } } };
      const mapPath = district.meta.scenario.railCrossing.railPath;

      // The template pins {x, y}; the map stores [x, y] — same points, in order.
      expect(train.railPath.map((p) => [p.x, p.y])).toEqual(mapPath);
      // Sanity: the crossing beat is on the band-centre line the train rides.
      expect(train.crossing.y).toBe(mapPath[0][1]);
    });
  }
});
