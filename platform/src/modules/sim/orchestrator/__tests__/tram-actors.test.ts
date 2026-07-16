/**
 * ADR-006 stage 3b unit coverage — the TRAM seams on the shipped runners:
 *
 *  1. OncomingLeftTurnRunner passes the authored actor PROFILE through to
 *     traffic.stage() (RX-05: the oncoming tram renders the articulated rig;
 *     absent = the exact pre-tram spec shape, byte-identical).
 *  2. PedestrianDartOutRunner stages dart-out PROPS (RX-04: the halted tram
 *     at the island stop) as held vehicles — cruise 0, profile through,
 *     NEVER commanded — and resets them on retry (the narrowMeeting recipe).
 *
 * Port-level tests with a recording fake (the runner contract is "what did
 * you ask the traffic system to do"); the end-to-end behavior is proven by
 * the sc-rx-tram trace gates + the tram-island district battery.
 */

import { describe, expect, it } from "vitest";
import type { OncomingLeftTurnSpec, PedestrianDartOutSpec } from "../../contracts";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
} from "../../traffic/types";
import { OncomingLeftTurnRunner, PedestrianDartOutRunner } from "../runners";
import type { StagedTrafficPort } from "../types";

/** Deterministic rng stub (jitter draws don't matter at this level). */
const rng = () => 0.5;

class FakePort implements StagedTrafficPort {
  staged_: StagedActorSpec[] = [];
  commands: Array<{ id: string; command: StagedCommand }> = [];

  stage(spec: StagedActorSpec): StagedActorView | null {
    this.staged_.push(spec);
    return {
      id: spec.id,
      kind: spec.kind,
      x: 0,
      y: 0,
      dirX: 0,
      dirY: 1,
      speedMps: 0,
      s: 0,
      pathLengthM: 100,
      nodeS: [0, 50, 100],
      finished: false,
    };
  }

  stagedCommand(id: string, command: StagedCommand): void {
    this.commands.push({ id, command });
  }

  staged(): StagedActorView | null {
    return null;
  }
}

const LTAP_TRAM: OncomingLeftTurnSpec = {
  id: "t-tram-ltap",
  kind: "oncomingLeftTurn",
  junction: { nodeId: "n1", x: 0, y: 0 },
  actor: {
    pathNodes: ["a", "b", "c"],
    hold: { nodeIndex: 1, offsetM: -80 },
    cruiseSpeedMps: 8,
    profile: "tram",
  },
  junctionNodeIndex: 1,
  armDistM: 65,
  gapSec: 1.6,
  clearSpeedMps: 11,
};

const DART_WITH_TRAM_PROP: PedestrianDartOutSpec = {
  id: "t-tram-dart",
  kind: "pedestrianDartOut",
  crossingId: "x-1",
  crossing: { x: 0, y: 90 },
  start: { x: 9.73, y: 90 },
  dir: { x: -1, y: 0 },
  speedMps: 1.8,
  travelM: 23.45,
  roadFromM: 1.6,
  roadToM: 17.85,
  triggerDistM: 48,
  minTriggerSpeedKmh: 10,
  props: [
    {
      pathNodes: ["end", "start"],
      hold: { nodeIndex: 0, offsetM: 49 },
      profile: "tram",
    },
  ],
};

describe("OncomingLeftTurnRunner — tram profile passthrough (RX-05)", () => {
  it("stages the oncoming actor WITH the authored profile", () => {
    const port = new FakePort();
    new OncomingLeftTurnRunner(LTAP_TRAM).stage(port, rng, true);
    expect(port.staged_).toHaveLength(1);
    const spec = port.staged_[0];
    expect(spec.kind).toBe("vehicle");
    if (spec.kind !== "vehicle") return;
    expect(spec.profile).toBe("tram");
    expect(spec.playerGuard).toBe(true); // the guard survives the passthrough
  });

  it("a profile-less spec stages exactly the pre-tram shape (profile undefined)", () => {
    const port = new FakePort();
    const spec: OncomingLeftTurnSpec = {
      ...LTAP_TRAM,
      actor: { pathNodes: ["a", "b", "c"], hold: { nodeIndex: 1, offsetM: -80 }, cruiseSpeedMps: 8 },
    };
    new OncomingLeftTurnRunner(spec).stage(port, rng, true);
    const staged = port.staged_[0];
    expect(staged.kind).toBe("vehicle");
    if (staged.kind !== "vehicle") return;
    expect(staged.profile).toBeUndefined();
  });
});

describe("PedestrianDartOutRunner — dart-out props (RX-04's halted tram)", () => {
  it("stages the darter + every prop as a HELD vehicle (cruise 0, profile through)", () => {
    const port = new FakePort();
    new PedestrianDartOutRunner(DART_WITH_TRAM_PROP).stage(port, rng, true);
    expect(port.staged_.map((s) => s.kind)).toEqual(["pedestrian", "vehicle"]);
    const prop = port.staged_[1];
    if (prop.kind !== "vehicle") return;
    expect(prop.id).toBe("t-tram-dart-prop-0");
    expect(prop.cruiseSpeedMps).toBe(0); // halted scenery — never commanded
    expect(prop.profile).toBe("tram");
    expect(prop.hold).toEqual({ nodeIndex: 0, offsetM: 49 });
    // Staging issues NO commands — the prop holds dormant for the session.
    expect(port.commands).toEqual([]);
  });

  it("re-stage (retry) resets the darter AND the props, stages nothing new", () => {
    const port = new FakePort();
    const runner = new PedestrianDartOutRunner(DART_WITH_TRAM_PROP);
    runner.stage(port, rng, true);
    const stagedAfterFirst = port.staged_.length;
    runner.stage(port, rng, false);
    expect(port.staged_.length).toBe(stagedAfterFirst); // no duplicate actors
    expect(port.commands).toEqual([
      { id: "t-tram-dart", command: { type: "reset" } },
      { id: "t-tram-dart-prop-0", command: { type: "reset" } },
    ]);
  });

  it("a prop-less spec stages ONLY the darter (the exact pre-props behavior)", () => {
    const port = new FakePort();
    const spec: PedestrianDartOutSpec = { ...DART_WITH_TRAM_PROP };
    delete spec.props;
    new PedestrianDartOutRunner(spec).stage(port, rng, true);
    expect(port.staged_.map((s) => s.kind)).toEqual(["pedestrian"]);
    expect(port.commands).toEqual([]);
  });
});
