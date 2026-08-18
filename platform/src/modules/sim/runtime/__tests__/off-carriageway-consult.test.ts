/**
 * worldRuntime — THE SURFACE CONSULT (sweep161, two critical BROKEN findings
 * that turned out to be one defect).
 *
 *   · sc-ov-oncoming-gap / mobile-wrong / 04-t146s.png — 97 км/ч on a
 *     featureless grey plane with no road, marking or boundary anywhere.
 *   · sc-ln-turn-lane-arrows / pc-right / 04-t064s.png — the ego on bare
 *     ground, while 01-arrival of the SAME run shows that district fully
 *     painted. The map is fine; the car is off it.
 *
 * The mechanism this suite pins is the one the frames' own maps make visible:
 * `locator.ts` calls 30 m from the CENTRELINE "off-road", and that is a lock
 * ACQUISITION radius, not a kerb. `ov-oncoming-v1`'s asphalt ends at
 * |x| ≈ 12.1 m, so a car standing at x = 16 m — four metres into the verge —
 * used to be handed back edge `ovg-e-road`, lane 0, and PAINTED markings, with
 * `laneOffsetM` clamped to −4.06 m. `laneKeepMaxOffsetM` is 3.25 m, so the
 * reducer convicted it of «Неустойчиво движение в лентата» for drifting off
 * the middle of a lane that is not there — which is the lone −1 второстепенна
 * in that mobile-wrong debrief, billed at t129s/t134s.
 *
 * BOTH DIRECTIONS, because a false acquittal is the same crime as a false
 * conviction: every test that proves the verge is now bare is paired with one
 * proving the carriageway is untouched, and the sweep at the bottom walks the
 * lane centres of both frames' districts through the production `sample()`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorldRuntime } from "../worldRuntime";
import {
  makeSurfaceFix,
  resolveDistrictDrivableSurface,
  OFF_CARRIAGEWAY_BODY_ALLOWANCE_M,
} from "../surface";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import type { VehicleSample } from "../../contracts";
import type { SimTick } from "../../rules/types";

const WORLD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world",
);
const districts = new Map<string, unknown>();
function load(id: string): unknown {
  let d = districts.get(id);
  if (d === undefined) {
    d = JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
    districts.set(id, d);
  }
  return d;
}

function vehicle(x: number, y: number, headingDeg = 0, speedKmh = 50): VehicleSample {
  return {
    position: { x, y },
    headingDeg,
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

/** One tick at a standstill-free cruise, from a fresh runtime. */
function tickAt(districtId: string, x: number, y: number, headingDeg = 0): SimTick {
  const rt = createWorldRuntime(load(districtId));
  return rt.sample(vehicle(x, y, headingDeg), 1, false);
}

// ---------------------------------------------------------------------------
// 1. THE CONVICTING HALF — the verge is bare, and the runtime now says so
// ---------------------------------------------------------------------------

describe("the surface consult publishes bare ground as bare", () => {
  it("ov-oncoming-v1: the verge beside the road still locks the edge, but no longer claims paint", () => {
    // 16 m from the centreline: 4 m past the kerb (asphalt ends at ≈12.1 m),
    // and 14 m INSIDE the locator's 30 m lock ring — the whole point.
    const tick = tickAt("ov-oncoming-v1", 16, 400);

    // The old referent is untouched and still fabricating: the tick reports a
    // road, a lane, and a limit for a car standing in a field. That is what
    // makes the paint flags load-bearing rather than redundant.
    expect(tick.edgeId).toBe("ovg-e-road");
    expect(tick.maxSpeedKmh).toBe(90);
    expect(Math.abs(tick.laneOffsetM)).toBeGreaterThan(3.25); // laneKeepMaxOffsetM

    // Fails on the old behaviour: `laneMarkingAt` answers for the EDGE, said
    // "painted" here, and both flags were therefore left ABSENT = armed.
    expect(tick.laneLinesPainted).toBe(false);
    expect(tick.centreLinePainted).toBe(false);
  });

  it("ov-oncoming-v1: and the measurement behind it is readable", () => {
    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    const out = makeSurfaceFix();

    // Before any sample() the answer is UNKNOWN, not the "nowhere near a road"
    // default of a fresh slot — a caller must not be able to read a
    // conviction out of a runtime that has not graded a frame yet.
    expect(rt.surfaceUnderCar(out)).toBe(false);

    rt.sample(vehicle(16, 400), 1, false);
    expect(rt.surfaceUnderCar(out)).toBe(true);
    expect(out.under).not.toBe("carriageway");
    expect(out.outsideKerbM).toBeGreaterThan(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M);
  });

  it("ln-arrows-v1: the same verge, on the second finding's own district", () => {
    // The west arm is a 2-lane residential street: asphalt to ≈12 m, lock to
    // 30 m — the same ~18 m band of fabricated road as ov-oncoming-v1.
    const tick = tickAt("ln-arrows-v1", -100, 18, 90);
    expect(tick.edgeId).toBe("ln-e-w");
    expect(tick.laneLinesPainted).toBe(false);
    expect(tick.centreLinePainted).toBe(false);
  });

  it("the reducer stops billing «Неустойчиво движение в лентата» in a field", () => {
    // The frame's own conviction, end to end, through the production reducer
    // with the production config: leave the lane centre, cross the kerb, and
    // hold out in the verge for well past `laneKeepSustainSec` (3 s).
    expect(driftAndGrade("ov-oncoming-v1", 16)).not.toContain("POOR_LANE_KEEPING");
  });
});

/**
 * Drive the own lane of ov-oncoming-v1 for 2 s (which satisfies the reducer's
 * spawn-pose latch — the positional detectors arm only once the car has been
 * seen inside its lane), ramp out to `toX` over 1 s, then hold there for 8 s.
 * Returns every violation code the production reducer billed.
 */
function driftAndGrade(districtId: string, toX: number): string[] {
  const rt = createWorldRuntime(load(districtId));
  let state = createRuleEngine();
  const codes: string[] = [];
  const fromX = 4.06;
  for (let i = 0; i <= 44; i++) {
    const t = i * 0.25;
    const ramp = Math.min(1, Math.max(0, (t - 2) / 1));
    const x = fromX + (toX - fromX) * ramp;
    const res = reduceTick(state, rt.sample(vehicle(x, 200 + t * 13.9), t, false));
    state = res.state;
    for (const e of res.events) if (e.kind === "violation") codes.push(e.code);
  }
  return codes;
}

// ---------------------------------------------------------------------------
// 2. THE ACQUITTING HALF — nothing on the asphalt changed
// ---------------------------------------------------------------------------

describe("the surface consult never disarms a car that is on the road", () => {
  it("ov-oncoming-v1: the own-lane centre keeps both flags ARMED (absent)", () => {
    const tick = tickAt("ov-oncoming-v1", 4.06, 400);
    expect(tick.edgeId).toBe("ovg-e-road");
    // Absent, not false: this road IS painted, and the T1 contract says only
    // an explicit false disarms. A change that published false here would be
    // the same defect with the sign flipped.
    expect(tick.laneLinesPainted).toBeUndefined();
    expect(tick.centreLinePainted).toBeUndefined();
  });

  it("the same drift, half a metre INSIDE the kerb, still bills lane keeping", () => {
    // x = 11.5 m: `laneOffsetM` is the same clamped −4.06 m as the verge case
    // above, but the car's centre is still on the asphalt — so the conviction
    // the previous block removes must land here, or the change is an amnesty
    // rather than a correction.
    expect(driftAndGrade("ov-oncoming-v1", 11.5)).toContain("POOR_LANE_KEEPING");
  });

  it("sweeps every lane centre of both frames' districts and finds only carriageway", () => {
    // The gate is `outsideKerbM > OFF_CARRIAGEWAY_BODY_ALLOWANCE_M`, and on the
    // carriageway that distance is 0 — so proving every lane centre reads
    // `carriageway` through the production sample() proves the override can
    // never reach a student driving their own lane. (surface.ts's own suite
    // makes the same sweep over all 105 districts against the raw predicate;
    // this one is about the WIRING in worldRuntime.)
    const out = makeSurfaceFix();
    let points = 0;
    for (const id of ["ov-oncoming-v1", "ln-arrows-v1"]) {
      const raw = load(id) as {
        roads: {
          edges: Array<{ id: string; lanes: number; oneway: boolean; geometry: [number, number][] }>;
        };
      };
      const rt = createWorldRuntime(raw);
      let t = 1;
      for (const edge of raw.roads.edges) {
        const [ax, ay] = edge.geometry[0];
        const [bx, by] = edge.geometry[edge.geometry.length - 1];
        const len = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / len;
        const uy = (by - ay) / len;
        const lanesPerDir = edge.oneway ? edge.lanes : Math.max(1, Math.floor(edge.lanes / 2));
        const W = 3.25 * 2.5; // spatial.LANE_WIDTH_M
        for (let step = 5; step <= len - 5; step += 5) {
          for (let lane = 0; lane < lanesPerDir; lane++) {
            const lat = (lane + 0.5) * W;
            for (const side of [1, -1]) {
              const px = ax + ux * step + uy * lat * side;
              const py = ay + uy * step - ux * lat * side;
              rt.sample(vehicle(px, py), (t += 0.1), false);
              rt.surfaceUnderCar(out);
              expect(out.under, `${id} ${edge.id} s=${step} lane=${lane} side=${side}`).toBe(
                "carriageway",
              );
              points++;
            }
          }
        }
      }
    }
    expect(points).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// 3. UNKNOWN STAYS UNKNOWN
// ---------------------------------------------------------------------------

describe("a district whose asphalt cannot be indexed answers nothing", () => {
  const EMPTY = {
    format: "district-v1",
    meta: { boundsLocalMeters: { minX: -50, minY: -50, maxX: 50, maxY: 50 } },
    roads: { nodes: [], edges: [] },
    intersections: [],
    crossings: [],
    roundabouts: [],
    spawnPoints: [],
  };

  it("reports unknown instead of «the whole world is verge»", () => {
    const rt = createWorldRuntime(structuredClone(EMPTY));
    const tick = rt.sample(vehicle(0, 0), 1, false);
    const out = makeSurfaceFix();
    expect(rt.surfaceUnderCar(out)).toBe(false);
    // An index with zero asphalt triangles must not disarm every detector on
    // every hand-built fixture in this repo.
    expect(tick.laneLinesPainted).toBeUndefined();
    expect(tick.centreLinePainted).toBeUndefined();
  });

  it("an injected index is the one read, and clearing it restores the lazy one", () => {
    // Deliberately mismatched: an ov-oncoming-v1 runtime handed ln-arrows-v1's
    // asphalt. (4.06, 400) is a lane centre in the first and open ground in the
    // second, so the answer names WHICH index the consult actually consulted —
    // the only way to prove the LessonScene hand-over seam is wired rather than
    // decorative.
    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    const out = makeSurfaceFix();

    rt.setDrivableSurface(resolveDistrictDrivableSurface(load("ln-arrows-v1") as never));
    rt.sample(vehicle(4.06, 400), 1, false);
    expect(rt.surfaceUnderCar(out)).toBe(true);
    expect(out.under).not.toBe("carriageway");

    // Clearing must not leave the lazy path believing it already resolved.
    rt.setDrivableSurface(null);
    rt.sample(vehicle(4.06, 400), 2, false);
    expect(rt.surfaceUnderCar(out)).toBe(true);
    expect(out.under).toBe("carriageway");
  });
});
