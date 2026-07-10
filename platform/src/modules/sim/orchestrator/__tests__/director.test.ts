/**
 * Director core unit tests — arm/trigger/outcome machine + seeded
 * reproducibility, against a FAKE traffic port (no district, no runtime).
 */

import { describe, expect, it } from "vitest";
import type { PedestrianDartOutSpec, StagedEventSpec } from "../../contracts";
import type {
  StagedActorSpec,
  StagedActorView,
  StagedCommand,
} from "../../traffic/types";
import { createScenarioDirector, hashSeed, lessonSeed } from "../director";
import type { DirectorInput, StagedTrafficPort } from "../types";

// ---------------------------------------------------------------------------
// Fake traffic port: records stage specs + commands, exposes a mutable view.
// ---------------------------------------------------------------------------

interface FakeActor {
  spec: StagedActorSpec;
  view: {
    id: string;
    kind: "vehicle" | "pedestrian";
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speedMps: number;
    s: number;
    pathLengthM: number;
    nodeS: number[];
    finished: boolean;
  };
}

class FakePort implements StagedTrafficPort {
  readonly actors = new Map<string, FakeActor>();
  readonly commands: Array<{ id: string; command: StagedCommand }> = [];

  stage(spec: StagedActorSpec): StagedActorView | null {
    const view: FakeActor["view"] = {
      id: spec.id,
      kind: spec.kind,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      s: 0,
      pathLengthM: 100,
      nodeS: [0, 100],
      finished: false,
    };
    if (spec.kind === "pedestrian") {
      view.x = spec.path[0].x;
      view.y = spec.path[0].y;
    }
    this.actors.set(spec.id, { spec, view });
    return view;
  }

  stagedCommand(id: string, command: StagedCommand): void {
    this.commands.push({ id, command });
  }

  staged(id: string): StagedActorView | null {
    return this.actors.get(id)?.view ?? null;
  }

  commandsFor(id: string): StagedCommand[] {
    return this.commands.filter((c) => c.id === id).map((c) => c.command);
  }
}

// A dart-out staged on synthetic geometry: crossing at (0, 100), road spans
// arc 1.2..18.3 of a 23.5 m dart from the right curb.
const DART: PedestrianDartOutSpec = {
  id: "t-dart",
  kind: "pedestrianDartOut",
  crossingId: "x1",
  crossing: { x: 0, y: 100 },
  start: { x: -9.7, y: 100 },
  dir: { x: 1, y: 0 },
  speedMps: 2.9,
  travelM: 23.5,
  roadFromM: 1.2,
  roadToM: 18.3,
  triggerDistM: 34,
  minTriggerSpeedKmh: 20,
};

/** Northbound player frame at (0, y). */
function frame(t: number, y: number, speedKmh: number, brake = 0): DirectorInput {
  return {
    tSec: t,
    dtSec: 1 / 30,
    x: 0,
    y,
    speedKmh,
    headingDeg: 0,
    brakePedal: brake,
    tickEvents: [],
  };
}

describe("scenario director core", () => {
  it("stages every event dormant at construction", () => {
    const port = new FakePort();
    createScenarioDirector([DART], port, { seed: 42 });
    expect(port.actors.size).toBe(1);
    const actor = port.actors.get("t-dart")!;
    expect(actor.spec.kind).toBe("pedestrian");
    // Dormant: no movement command yet.
    expect(port.commandsFor("t-dart")).toHaveLength(0);
  });

  it("throws loudly on an unstageable spec (data bug must surface)", () => {
    const port = new FakePort();
    port.stage = () => null;
    expect(() => createScenarioDirector([DART], port, { seed: 1 })).toThrow(/failed to stage/);
  });

  it("arms silently, triggers only on distance+speed+approach, then releases the actor", () => {
    const port = new FakePort();
    const director = createScenarioDirector([DART], port, { seed: 42 });

    // Far away at speed: no trigger.
    director.step(frame(0.1, 0, 40));
    expect(port.commandsFor("t-dart")).toHaveLength(0);
    expect(director.snapshot()[0].phase).toBe("armed");

    // Close but too slow: no trigger.
    director.step(frame(0.2, 75, 10));
    expect(port.commandsFor("t-dart")).toHaveLength(0);

    // Close, fast, approaching: trigger → cruise command.
    director.step(frame(0.3, 75, 40));
    expect(port.commandsFor("t-dart")).toEqual([{ type: "cruise" }]);
    expect(director.snapshot()[0].phase).toBe("triggered");
  });

  it("measures reaction time from trigger to brake onset and resolves once", () => {
    const port = new FakePort();
    const director = createScenarioDirector([DART], port, { seed: 42 });

    director.step(frame(1.0, 75, 40)); // trigger at t=1.0
    director.step(frame(1.2, 78, 40, 0)); // not braking yet
    director.step(frame(1.6, 81, 35, 0.9)); // brake onset at t=1.6
    // Walk the pedestrian across the road; resolution when it clears.
    const view = port.actors.get("t-dart")!.view;
    view.s = 19.0;
    const res = director.step(frame(2.0, 84, 10, 0.9));
    expect(res.outcomes).toHaveLength(1);
    const outcome = res.outcomes[0];
    expect(outcome.eventId).toBe("t-dart");
    expect(outcome.success).toBe(true);
    expect(outcome.reactionTimeSec).toBeCloseTo(0.6, 5);
    expect(outcome.approachSpeedKmh).toBe(40);
    expect(director.snapshot()[0].phase).toBe("resolved");

    // Resolved events never re-fire.
    view.s = 0;
    const res2 = director.step(frame(2.1, 85, 40));
    expect(res2.outcomes).toHaveLength(0);
    expect(director.outcomes).toHaveLength(1);
  });

  it("adjudicates a drive-through over the occupied crossing as failure", () => {
    const port = new FakePort();
    const director = createScenarioDirector([DART], port, { seed: 42 });
    director.step(frame(1.0, 75, 45)); // trigger
    const input: DirectorInput = {
      ...frame(1.5, 90, 45),
      tickEvents: [{ kind: "crossingPassed", crossingId: "x1", pedestrianOnCrossing: true }],
    };
    const res = director.step(input);
    expect(res.outcomes).toHaveLength(1);
    expect(res.outcomes[0].success).toBe(false);
    expect(res.outcomes[0].detail).toBe("violation");
  });

  it("emits a pedestrian collision event on contact (existing vocabulary)", () => {
    const port = new FakePort();
    const director = createScenarioDirector([DART], port, { seed: 42 });
    director.step(frame(1.0, 75, 45)); // trigger
    const view = port.actors.get("t-dart")!.view;
    view.x = 0;
    view.y = 91;
    view.s = 9.7; // mid-road
    const res = director.step(frame(1.4, 90.2, 42));
    expect(res.events).toContainEqual({ kind: "collision", withWhat: "pedestrian" });
    expect(res.outcomes[0]).toMatchObject({ success: false, detail: "collision" });
  });

  it("same seed → identical staging; new attempt → different jitter", () => {
    // Approach at constant speed; record the frame index the trigger fires.
    const triggerFrame = (director: ReturnType<typeof createScenarioDirector>, port: FakePort) => {
      let y = 40;
      for (let i = 0; i < 400; i++) {
        y += 12 * (1 / 30); // 43 km/h northbound
        director.step(frame(i / 30, y, 43.2));
        if (port.commandsFor("t-dart").length > 0) return i;
      }
      return -1;
    };

    const portA = new FakePort();
    const a = createScenarioDirector([DART], portA, { seed: 7 });
    const portB = new FakePort();
    const b = createScenarioDirector([DART], portB, { seed: 7 });
    const fA = triggerFrame(a, portA);
    const fB = triggerFrame(b, portB);
    expect(fA).toBeGreaterThan(0);
    expect(fA).toBe(fB); // deterministic per seed

    // Fresh attempt (reset) redraws the trigger jitter deterministically.
    const portC = new FakePort();
    const c = createScenarioDirector([DART], portC, { seed: 7 });
    c.reset();
    expect(c.attempt).toBe(1);
    portC.commands.length = 0;
    const fC = triggerFrame(c, portC);
    expect(fC).toBeGreaterThan(0);
    expect(fC).not.toBe(fA); // ±3 m jitter ≈ ±7 frames at 43 km/h

    // …and the same attempt on another director replays bit-identically.
    const portD = new FakePort();
    const d = createScenarioDirector([DART], portD, { seed: 7 });
    d.reset();
    portD.commands.length = 0;
    expect(triggerFrame(d, portD)).toBe(fC);
  });

  it("reset() re-stages actors and clears outcomes", () => {
    const port = new FakePort();
    const director = createScenarioDirector([DART], port, { seed: 42 });
    director.step(frame(1.0, 75, 45));
    port.actors.get("t-dart")!.view.s = 19;
    director.step(frame(2.0, 84, 10));
    expect(director.outcomes).toHaveLength(1);

    director.reset();
    expect(director.outcomes).toHaveLength(0);
    expect(director.snapshot()[0].phase).toBe("armed");
    expect(port.commands.at(-1)).toEqual({ id: "t-dart", command: { type: "reset" } });
  });

  it("hash helpers are stable", () => {
    expect(hashSeed("a")).toBe(hashSeed("a"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
    expect(lessonSeed("l5-emergency-braking")).toBe(lessonSeed("l5-emergency-braking"));
  });

  it("multiple events run independently", () => {
    const second: StagedEventSpec = { ...DART, id: "t-dart-2", crossing: { x: 0, y: 400 }, start: { x: -9.7, y: 400 } };
    const port = new FakePort();
    const director = createScenarioDirector([DART, second], port, { seed: 3 });
    director.step(frame(0.5, 75, 45)); // triggers only the first
    expect(port.commandsFor("t-dart")).toHaveLength(1);
    expect(port.commandsFor("t-dart-2")).toHaveLength(0);
    expect(director.snapshot().map((s) => s.phase)).toEqual(["triggered", "armed"]);
  });
});
