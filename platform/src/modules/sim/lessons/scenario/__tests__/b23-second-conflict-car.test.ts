/**
 * B23 (doc 87) — „SHOULD THERE BE AT LEAST 1 MORE THAT WE HAVE TO WAIT".
 *
 * His words on catalog position 8 («Предимство отдясно»): *„the traffic car is
 * quite quick and its only 1 so by the time I reach the crossroad it already
 * has passed — should there be at least 1 more that we have to wait"*.
 *
 * Two waves answered the FIRST half. The witness gate (ledger L7) stopped the
 * car crossing before he arrived, and the family ambient baseline put traffic
 * on the street. The register's 2026-08-04 gate then said what was still open,
 * plainly: *„The staged conflict is still exactly one car — a second needs
 * templates-junctions.ts."* `SC_JUNCTION_RHR_CONFLICT_2` is that car.
 *
 * WHY A TEST AND NOT ONLY A FRAME. A photograph of the junction shows two cars;
 * it cannot show which of them is STAGED and which is an ambient boulevard car
 * that happened to be there on that seed. The row is about the drill's own
 * choreography, so the numbers have to come from the director: both staged
 * actors, both released by his arrival, crossing the node far enough apart that
 * a student who pulls out after the first one meets the second.
 *
 * Driven the way the drill's own instructions read: up the stem at 22 km/h,
 * full stop at the give-way pose, wait, then go.
 */
import { describe, expect, it } from "vitest";

import { compileScenario } from "../compile";
import { SC_JUNCTION_RHR, SC_JUNCTION_RHR_CONFLICT_2 } from "../templates-junctions";
import { createScenarioDirector, lessonSeed } from "../../../orchestrator";
import { loadDistrict } from "../../../world/referents";
import { createTrafficSystem } from "../../../traffic/system";
import type { TrafficDistrict } from "../../../traffic/types";

/** Stem lane centre of tj-rhr-v1; the player spawns at (4.06, −105). */
const LANE_X = 4.06;
/** Where the shadow drive stops — outside the 18 m conviction core. */
const YIELD_Y = -19.5;
const DT = 1 / 60;

interface Crossing {
  id: string;
  /** Session seconds at which the actor's centre passed the node's x = 0. */
  tSec: number | null;
}

function driveAndWatch(level: 1 | 3, waitSec: number): { crossings: Crossing[]; endT: number } {
  const raw = loadDistrict("tj-rhr-v1") as unknown;
  const lesson = compileScenario(SC_JUNCTION_RHR, level);
  const staged = lesson.stagedEvents ?? [];
  const traffic = createTrafficSystem(raw as TrafficDistrict, {
    anchor: { x: LANE_X, y: -105 },
    anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
    // Ambient OFF on purpose: this measurement is about the two STAGED cars,
    // and a boulevard car in the frame is exactly the ambiguity a photograph
    // already suffers from.
    vehicleCount: 0,
    pedestrianCount: 0,
  });
  const director = createScenarioDirector(staged, traffic, { seed: lessonSeed(lesson.id) });

  const ids = staged.map((s) => s.id);
  const crossed = new Map<string, number>();
  const prevX = new Map<string, number>();

  let t = 0;
  let py = -105;
  let phase: 0 | 1 | 2 = 0;
  let holdUntil = 0;
  let pv = 0;

  while (t <= 120) {
    if (phase === 0) {
      pv = 22 / 3.6;
      py += pv * DT;
      if (py >= YIELD_Y) {
        py = YIELD_Y;
        phase = 1;
        holdUntil = t + waitSec;
      }
    } else if (phase === 1) {
      pv = 0;
      if (t >= holdUntil) phase = 2;
    } else {
      pv = 0; // stay put: we are watching the priority road, not the turn
    }

    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: LANE_X, y: py },
      playerSpeedKmh: pv * 3.6,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: LANE_X,
      y: py,
      speedKmh: pv * 3.6,
      headingDeg: 0,
      brakePedal: phase === 1 ? 1 : 0,
      tickEvents: [],
    });

    // Both staged cars run east → west, so „crossed the junction" is the frame
    // on which the actor's x goes from positive to negative.
    for (const id of ids) {
      const a = traffic.staged(id);
      if (!a) continue;
      const was = prevX.get(id);
      if (was !== undefined && was > 0 && a.x <= 0 && !crossed.has(id)) crossed.set(id, t);
      prevX.set(id, a.x);
    }
    t += DT;
  }

  return {
    crossings: ids.map((id) => ({ id, tSec: crossed.get(id) ?? null })),
    endT: t,
  };
}

describe("B23 — the second car on the priority road", () => {
  it("the follower is authored on EVERY rung, not just the complicated ones", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const ids = (compileScenario(SC_JUNCTION_RHR, level).stagedEvents ?? []).map((s) => s.id);
      expect(ids, `L${level}`).toContain("sc-jrhr-conflict");
      expect(ids, `L${level}`).toContain(SC_JUNCTION_RHR_CONFLICT_2.id);
    }
  });

  it("the RECORDED demos are untouched — `staged` still holds exactly one car", () => {
    // traces/scJunctions.ts records from `spec.staged`. The follower rides
    // `stagedAdd`, so the three committed recordings and their gates cannot
    // move. If someone promotes it into `staged`, this fails and the traces
    // must be re-recorded deliberately rather than by accident.
    expect((SC_JUNCTION_RHR.staged ?? []).map((s) => s.id)).toEqual(["sc-jrhr-conflict"]);
  });

  it("BOTH staged cars cross the junction while he waits — the second well after the first", () => {
    const { crossings } = driveAndWatch(1, 30);
    const first = crossings.find((c) => c.id === "sc-jrhr-conflict")!;
    const second = crossings.find((c) => c.id === SC_JUNCTION_RHR_CONFLICT_2.id)!;
    expect(first.tSec, "the lead conflict must cross").not.toBeNull();
    expect(second.tSec, "the follower must cross too — not stall on the road").not.toBeNull();
    // Ordered, and separated by enough that „first one's gone, off I go" walks
    // into the second. Under 2 s they fuse into one event and teach nothing.
    const gap = second.tSec! - first.tSec!;
    expect(gap).toBeGreaterThan(2);
    // …and not so far apart that the drill becomes a minute of staring.
    expect(gap).toBeLessThan(30);
    // THE MEASUREMENT, written down rather than described. Player reaches the
    // give-way pose at t ≈ 14.0 s (85.5 m at 22 km/h); the lead conflict clears
    // the node at 18.87 s and the follower at 28.37 s. Nine and a half seconds
    // is the window in which „the first one's gone, off I go" gets you killed,
    // and it is now the window this drill actually stages.
    expect(first.tSec!).toBeCloseTo(18.87, 1);
    expect(second.tSec!).toBeCloseTo(28.37, 1);
  });

  it("it also arrives for a student who waits only briefly (L3, 8 s)", () => {
    const { crossings } = driveAndWatch(3, 8);
    for (const c of crossings) expect(c.tSec, `${c.id} never crossed`).not.toBeNull();
  });

  it("neither car is left standing on the priority road (the FR-B5-VAN shape)", () => {
    // A staged actor that runs out of path parks on its last metre forever.
    // Both of these run east → node → west, i.e. off the far end of the west
    // arm at x = −150, 100 m past the drill's own last objective (x = −50).
    for (const spec of [
      SC_JUNCTION_RHR.staged![0],
      SC_JUNCTION_RHR_CONFLICT_2,
    ] as Array<{ actor: { pathNodes: readonly string[] } }>) {
      expect(spec.actor.pathNodes[spec.actor.pathNodes.length - 1]).toBe("tj-n-w");
    }
  });
});
