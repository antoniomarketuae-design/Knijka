/**
 * THE SESSION'S CAST, READABLE FROM THE PHYSICS SIDE — ONE NAME PER BODY.
 *
 * A browser drive has two reporters pointed at the same bodies: this
 * director's ContactSentinel, which names every staged body it is inside of,
 * and the rapier contact handler, which reaches the runtime through
 * `LessonScene`. The rule engine keys its contact episode on that name.
 *
 * So the two reporters must use ONE vocabulary. Measured on the shipped
 * reducer, two DIFFERENT names for one body bill TWICE — 90 наказателни точки
 * for one crash — which is why the physics side does not mint an id of its own
 * (the shell tag's numeric `npcId` would have been the obvious one) but reads
 * the sentinel's own cast through `directorContactCast`.
 *
 * What these guard: the accessor hands back the SAME array the sentinel
 * sweeps, and an unknown or absent director names nothing rather than
 * something wrong.
 */

import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../contracts";
import { createScenarioDirector, directorContactCast } from "../director";
import { createRunner } from "../runners";
import type { ScenarioDirector, StagedTrafficPort } from "../types";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../../traffic/types";

/** One car standing dead still at the origin — enough for the runners to
 *  stage against; the cast itself is declared at construction either way. */
class StillPort implements StagedTrafficPort {
  private readonly view: StagedActorView = {
    id: "e1",
    kind: "vehicle",
    x: 0,
    y: 0,
    dirX: 0,
    dirY: 1,
    speedMps: 0,
    s: 0,
    pathLengthM: 100,
    nodeS: [0, 100],
    finished: false,
  };
  stage(_spec: StagedActorSpec): StagedActorView | null {
    return this.view;
  }
  stagedCommand(_id: string, _c: StagedCommand): void {}
  staged(_id: string): StagedActorView | null {
    return this.view;
  }
}

const LEAD: StagedEventSpec = {
  id: "e1",
  kind: "brakingLeadCar",
  actor: { pathNodes: ["a", "b"], hold: { nodeIndex: 0, offsetM: 0 }, cruiseSpeedMps: 5 },
  followGapM: 20,
  maxMatchSpeedMps: 12,
  slamAt: { x: 0, y: 9999 },
  slamRadiusM: 2,
  slamDecelMps2: 6,
  minSlamSpeedKmh: 250,
  proximityFallbackM: 0.3,
  triggersHazard: false,
  resumeAfterSec: 3,
} as unknown as StagedEventSpec;

describe("directorContactCast", () => {
  it("returns the very cast the sentinel sweeps — not a re-derivation", () => {
    const director = createScenarioDirector([LEAD], new StillPort(), { seed: 5 });
    const cast = directorContactCast(director);
    // The runner is the single source; a second walk over the specs could
    // drift, and a drifted name is a second name for one body.
    const fromRunner = createRunner(LEAD, null).contactCast;
    expect(cast.map((m) => m.actorId)).toEqual(fromRunner.map((m) => m.actorId));
    expect(cast.length).toBeGreaterThan(0);
    // The bodies carry what the physics side needs to place them: a category
    // and a shape. Without these the naming side cannot test overlap at all.
    for (const m of cast) {
      expect(["vehicle", "pedestrian", "cyclist"]).toContain(m.withWhat);
      expect(["box", "disc"]).toContain(m.body);
    }
  });

  it("names nothing for a null director or one this module did not build", () => {
    // The innocent direction: an unknown director yields no candidates, so the
    // physics reporter falls back to its per-category behaviour (A12) instead
    // of inventing a name the sentinel never uses.
    expect(directorContactCast(null)).toEqual([]);
    const foreign = {
      step: () => ({ events: [], outcomes: [] }),
      reset: () => {},
      hazardActive: false,
      telltaleLit: false,
      attempt: 0,
      outcomes: [],
      snapshot: () => [],
    } as unknown as ScenarioDirector;
    expect(directorContactCast(foreign)).toEqual([]);
  });

  it("survives reset() — a retry re-stages actors, it does not re-cast them", () => {
    const director = createScenarioDirector([LEAD], new StillPort(), { seed: 5 });
    const before = directorContactCast(director).map((m) => m.actorId);
    director.reset();
    expect(directorContactCast(director).map((m) => m.actorId)).toEqual(before);
  });
});
