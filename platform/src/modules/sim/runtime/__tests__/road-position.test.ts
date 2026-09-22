/**
 * `SimTick.sM` / `SimTick.distM` ARE THE LOCATOR'S OWN FIX — and absent off-road.
 *
 * Founder RULING-2 (2026-09-22) publishes the committed lane fix's arclength
 * (and centreline distance) beside `laneOffsetM` so the audit harness knows
 * where along the edge the car is. `road-position-not-graded.test.ts` proves
 * nothing grades them; this file proves they are TRUE:
 *
 *   1. they are the locator's fix at the same pose — an independent `Locator`
 *      over the same district, fed the same pose sequence, commits the same
 *      lock and must return the same numbers, to the bit;
 *   2. `sM` runs in the EDGE's geometry direction (from → to), rising when the
 *      car drives with the geometry and FALLING when it drives against it, on
 *      both banks of a two-way road — so a reader never has to guess which way
 *      the arclength counts;
 *   3. both are ABSENT whenever the tick's `edgeId` is not a string — past the
 *      kerb (where the lock ring still hands back an edge and the tick nulls
 *      it) and off the network — never 0, never Infinity.
 *   4. `sM` is CLAMPED at the edge's vertices: behind the first one the tick
 *      still names the edge and `sM` is exactly 0 for metres of travel — a
 *      real 0, carried as 0, never dropped as if it were absent.
 *
 * HOW IT FAILS. Fill `sM` from anything but the committed fix (the pre-lock
 * `peek`, a re-projection, `laneOffsetM`), gate it on the lock ring's edge
 * instead of the tick's, default it off-road, or drop `distM`, and a named
 * assertion below goes red.
 */
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { DistrictIndex } from "../spatial";
import { Locator } from "../locator";
import { drive, edgeById, edgeDrivePath, loadDistrict, pointAlong, type PathPose } from "./helpers";
import type { SimTick } from "../../rules/types";

const TWO_WAY = "e672186635.0";

function run(poses: PathPose[]): { ticks: SimTick[]; fixes: { edgeId: string | null; sM: number; distM: number; laneOffsetM: number }[] } {
  const district = loadDistrict();
  const ticks = drive(createWorldRuntime(district), poses, { speedKmh: 25 }).ticks;
  // The independent referent: the product's own Locator class, fresh, fed the
  // exact call sequence the runtime makes (one `track` per sample, with the
  // heading). The fix is an internally reused object, so it is copied here.
  const locator = new Locator(new DistrictIndex(district));
  const fixes = poses.map((p) => {
    const f = locator.track(p.x, p.y, p.headingDeg);
    return { edgeId: f.edgeId, sM: f.sM, distM: f.distM, laneOffsetM: f.laneOffsetM };
  });
  return { ticks, fixes };
}

function edgePoses(edgeId: string, s0: number, s1: number, stepM: number, rightOffsetM: number): PathPose[] {
  return edgeDrivePath(edgeById(loadDistrict(), edgeId), s0, s1, stepM, rightOffsetM);
}

function onEdge(ticks: SimTick[], edgeId: string): SimTick[] {
  return ticks.filter((t) => t.edgeId === edgeId);
}

function strictlyMonotone(xs: number[], dir: 1 | -1): boolean {
  return xs.every((x, i) => i === 0 || (x - xs[i - 1]) * dir > 0);
}

describe("SimTick.sM / distM — the committed fix, on the road", () => {
  const legs = [
    { name: "own bank, with geometry", poses: edgePoses(TWO_WAY, 40, 160, 1, 1.6), dir: 1 as const },
    { name: "OPPOSING bank, with geometry", poses: edgePoses(TWO_WAY, 40, 160, 1, -1.6), dir: 1 as const },
    { name: "own bank, against geometry", poses: edgePoses(TWO_WAY, 160, 40, 1, 1.6), dir: -1 as const },
  ];

  for (const leg of legs) {
    describe(leg.name, () => {
      const { ticks, fixes } = run(leg.poses);
      const on = onEdge(ticks, TWO_WAY);

      it("the leg is on the two-way edge for most of its length (the material is real)", () => {
        expect(on.length).toBeGreaterThan(100);
        expect(on.every((t) => t.oneway === false)).toBe(true);
        if (leg.name.startsWith("OPPOSING")) expect(on.every((t) => t.opposingBank === true)).toBe(true);
        else expect(on.every((t) => t.opposingBank === undefined)).toBe(true);
      });

      it("every on-road tick carries the locator's own fix, to the bit", () => {
        const mismatches = ticks
          .map((t, i) => ({ t, f: fixes[i], i }))
          .filter(({ t }) => t.edgeId != null)
          .filter(({ t, f }) => t.edgeId !== f.edgeId || t.sM !== f.sM || t.distM !== f.distM || t.laneOffsetM !== f.laneOffsetM)
          .map(({ i }) => i);
        expect({ mismatches }).toEqual({ mismatches: [] });
      });

      it("sM runs in the edge's GEOMETRY direction — rising with it, falling against it", () => {
        expect(strictlyMonotone(on.map((t) => t.sM!), leg.dir)).toBe(true);
      });

      it("sM is the arclength the pose was laid at (within the lateral offset's projection)", () => {
        // `edgeDrivePath` places pose i at arclength s0 + (s1 − s0)·i/(n − 1).
        const n = leg.poses.length;
        const [s0, s1] = leg.dir === 1 ? [40, 160] : [160, 40];
        const worst = ticks.reduce((w, t, i) => {
          if (t.edgeId !== TWO_WAY) return w;
          return Math.max(w, Math.abs(t.sM! - (s0 + ((s1 - s0) * i) / (n - 1))));
        }, 0);
        expect(worst).toBeLessThan(1.0);
      });

      it("distM is the unsigned centreline distance: ~1.6 m on either bank", () => {
        const d = on.map((t) => t.distM!);
        expect(Math.min(...d)).toBeGreaterThan(1.0);
        expect(Math.max(...d)).toBeLessThan(2.2);
      });
    });
  }
});

describe("SimTick.sM / distM — absent whenever the tick names no edge", () => {
  it("past the kerb: the lock ring still has an edge, the tick does not, and both fields are ABSENT", () => {
    const { ticks, fixes } = run(edgePoses("e432951179.0", 170, 340, 2, 25));
    const nulled = ticks.map((t, i) => ({ t, f: fixes[i] })).filter(({ t }) => t.edgeId === null);
    // The gate is the TICK's edgeId: these are exactly the ticks where a gate on
    // the locator's edge would have published a number.
    expect(nulled.some(({ f }) => f.edgeId !== null && Number.isFinite(f.distM))).toBe(true);
    expect(nulled.every(({ t }) => !("sM" in t) && !("distM" in t))).toBe(true);
  });

  it("off the network: both fields absent on every tick (never 0, never Infinity)", () => {
    const { ticks } = run(Array.from({ length: 40 }, (_, i) => ({ x: 2000 + i * 0.35, y: 2000, headingDeg: 45 })));
    expect(ticks.every((t) => t.edgeId === null && !("sM" in t) && !("distM" in t))).toBe(true);
  });

  it("…and on the road neither is ever non-finite", () => {
    const { ticks } = run(edgePoses(TWO_WAY, 40, 160, 1, 1.6));
    const on = ticks.filter((t) => t.edgeId != null);
    expect(on.length).toBeGreaterThan(0);
    expect(on.every((t) => Number.isFinite(t.sM) && Number.isFinite(t.distM))).toBe(true);
  });
});

describe("SimTick.sM — CLAMPED at the edge's vertices, and a clamped 0 is carried as 0", () => {
  /** Own bank, facing with the geometry, from s = 30 back to the first vertex
   *  and then 6 m BEHIND it along the start tangent (a reversing car, or one
   *  coming out of the junction the edge starts at). */
  function behindTheStart(edgeId: string): PathPose[] {
    const e = edgeById(loadDistrict(), edgeId);
    const p0 = pointAlong(e.geometry, 0);
    const poses: PathPose[] = [];
    for (let s = 30; s >= -6; s -= 0.5) {
      const q = s >= 0 ? pointAlong(e.geometry, s) : { x: p0.x + p0.tx * s, y: p0.y + p0.ty * s, tx: p0.tx, ty: p0.ty };
      poses.push({ x: q.x + q.ty * 1.6, y: q.y - q.tx * 1.6, headingDeg: ((Math.atan2(q.tx, q.ty) * 180) / Math.PI + 360) % 360 });
    }
    return poses;
  }

  it("behind the first vertex the tick still NAMES the edge, and sM sits at exactly 0 while the car keeps moving", () => {
    const { ticks, fixes } = run(behindTheStart(TWO_WAY));
    const pinned = ticks.map((t, i) => ({ t, f: fixes[i] })).filter(({ t }) => t.edgeId === TWO_WAY && t.sM === 0);
    // Several frames — metres of travel — with one and the same arclength:
    // that is the clamp the SimTick.sM docblock warns a controller about.
    expect(pinned.length).toBeGreaterThanOrEqual(5);
    // A REAL ZERO, carried: present as a key, equal to the fix, and not
    // dropped by a truthiness gate (`if (fix.sM) tick.sM = fix.sM` survived
    // every other assertion in this file).
    expect(pinned.every(({ t, f }) => "sM" in t && f.sM === 0 && t.distM === f.distM)).toBe(true);
    // …while distM, now the distance to the VERTEX, keeps growing.
    expect(strictlyMonotone(pinned.map(({ t }) => t.distM!), 1)).toBe(true);
  });
});
