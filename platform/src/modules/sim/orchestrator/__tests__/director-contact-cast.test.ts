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
  // A TITLE CORRECTED, 2026-08-19, because it asserted something the test did
  // not test. It read „returns the very cast the sentinel sweeps — NOT a
  // re-derivation", and both the director's comment and the lane that wired
  // this called that IDENTITY load-bearing — yet every assertion compared
  // `.map(m => m.actorId)` BY VALUE, so mutating the getter to
  // `return this.cast.slice()` — a literal re-derivation — left all three
  // green.
  //
  // …AND THE FIRST REPAIR REACHED FOR WAS ALSO WRONG, which is worth writing
  // down because the same trap is one line away. `createScenarioDirector`
  // snapshots the cast into the WeakMap ONCE
  // (`castByDirector.set(director, director.contactCast)`), so every later call
  // returns that one snapshot whatever the getter did to produce it. MEASURED:
  // mutating the getter to `this.cast.slice()` AND to `this.cast.map(m =>
  // ({ ...m }))` both leave this file green even with the identity assertions
  // below in place. The getter's identity is UNOBSERVABLE through this seam —
  // and harmless for the same reason, since the snapshot is taken before any
  // sweep. So no title here may claim it.
  //
  // What IS observable is the ACCESSOR, which is the seam LessonScene calls on
  // every contact: ONE cast, handed back unchanged. Mutating
  // `directorContactCast` to re-derive per call fails the assertions below.
  it("hands back ONE declared cast — same members on every call, and after reset", () => {
    const director = createScenarioDirector([LEAD], new StillPort(), { seed: 5 });
    const cast = directorContactCast(director);
    // The runner is the single source; a second walk over the specs could
    // drift, and a drifted name is a second name for one body.
    const fromRunner = createRunner(LEAD, null).contactCast;
    expect(cast.map((m) => m.actorId)).toEqual(fromRunner.map((m) => m.actorId));
    expect(cast.length).toBeGreaterThan(0);
    // IDENTITY, which is what the old title claimed and no assertion checked.
    // Scoped to what the seam can actually witness: the accessor. A
    // `directorContactCast` that rebuilt its answer per call would hand the
    // naming side a fresh object on every contact, and „the same cast" would be
    // a claim about nothing.
    const again = directorContactCast(director);
    expect(again).toBe(cast);
    for (let i = 0; i < cast.length; i++) expect(again[i]).toBe(cast[i]);
    director.reset();
    const afterReset = directorContactCast(director);
    expect(afterReset).toBe(cast);
    for (let i = 0; i < cast.length; i++) expect(afterReset[i]).toBe(cast[i]);
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
