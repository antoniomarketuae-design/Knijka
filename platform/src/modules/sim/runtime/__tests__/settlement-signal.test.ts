/**
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» — the BUILT-WORLD
 * half: the settlement signal the runtime publishes, and the bill it allows,
 * measured on the committed maps rather than on hand-built ticks.
 *
 * WHERE THE SIGNAL COMES FROM. No committed district places a Д11/Д12 sign
 * («settlement» is a sign kind nobody authors) and no edge carries a
 * settlement tag. What the map DOES carry, and what the world builder already
 * reads as «this carriageway is outside a built-up area», is the posted limit:
 * `world/builders/constants.isExtraUrbanCarriageway` — an AUTHORED (tag)
 * limit of ≥ 90 km/h, the чл. 21 category-В ceiling outside a settlement. The
 * world dresses exactly those edges as an извънградски път (no town blocks,
 * no kerbside rank), so the student sees open road where the runtime says
 * «outside a settlement» and a street where it says nothing. The runtime
 * publishes `SimTick.outsideSettlement = true` from that same predicate —
 * one source of truth, not a second guess.
 *
 * WHAT THE TESTS HOLD
 *   1. On every committed district, the tick's settlement flag equals the
 *      world builder's predicate for the edge the car is on.
 *   2. (a) the town street of ov-keepright-v1 (2+2, 50, tag) — 20 s in the
 *      left lane bills NO NOT_KEEPING_RIGHT (red on 0daca33, which billed it).
 *   3. (b) the same street re-posted 90 (outside a settlement), 81 (above 80)
 *      or tagged `motorway` bills it, and so does mw-v1's left lane.
 *   4. (c) ал. 2, т. 3: the only light-signal lane control in the product
 *      stands over single-lane edges, where the rule cannot arm.
 *   5. The census the report quotes: on the committed maps the ruling leaves
 *      NOT_KEEPING_RIGHT armable on the three motorway maps and nowhere else.
 *   6. (round 3, W1) The clause is the LIMIT, never the car's speed — on the
 *      three town boulevards the re-scoped lessons run on: a student at
 *      95 km/h in the left lane of ov-keepright-v1, ln-v1 and wb-boulevard-v1
 *      is billed for SPEEDING and not for the lane; the same lane on the same
 *      street re-posted 90, driven at 60, is billed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createWorldRuntime, parseDistrict, type District, type DistrictEdge } from "..";
import { isExtraUrbanCarriageway, isMotorwayCarriageway } from "../../world/builders/constants";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import { KEEP_RIGHT_TOWN_MAX_KMH, type SimTick } from "../../rules/types";
import { drive, edgeDrivePath, type PathPose } from "./helpers";

const WORLD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../content/world");
const DISTRICT_FILES = fs
  .readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

function raw(id: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8")) as Record<string, unknown>;
}
function load(id: string, edit?: (e: Record<string, unknown>) => void): District {
  const doc = raw(id) as { roads: { edges: Record<string, unknown>[] } };
  if (edit) for (const e of doc.roads.edges) edit(e);
  return parseDistrict(doc);
}

function grade(ticks: SimTick[]): string[] {
  let s = createRuleEngine();
  const out: string[] = [];
  for (const t of ticks) {
    const r = reduceTick(s, t);
    s = r.state;
    for (const e of r.events) if (e.kind === "violation") out.push(e.code);
  }
  return out;
}

/** A straight northbound left-lane stint: x fixed, y0 → y1, at `kmh`. */
function straight(x: number, y0: number, y1: number, kmh: number, dt = 0.05): PathPose[] {
  const step = (kmh / 3.6) * dt;
  const n = Math.round((y1 - y0) / step);
  return Array.from({ length: n + 1 }, (_, i) => ({ x, y: y0 + i * step, headingDeg: 0 }));
}

/** ov-keepright-v1: 2+2 town boulevard; northbound LEFT lane centre x = 4.06. */
function hogKeepRight(district: District): SimTick[] {
  // 320 m at 45 km/h = 25.6 s in the left lane, indicator off.
  return drive(createWorldRuntime(district), straight(4.06, 20, 340, 45), { speedKmh: 45 }).ticks;
}

describe("1. the settlement signal IS the world builder's own predicate, on every committed map", () => {
  it(`agrees with isExtraUrbanCarriageway on every edge of all ${DISTRICT_FILES.length} districts`, () => {
    let compared = 0;
    let outside = 0;
    const disagreements: string[] = [];
    for (const file of DISTRICT_FILES) {
      const district = parseDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, file), "utf-8")));
      const rt = createWorldRuntime(district);
      for (const edge of district.roads.edges as DistrictEdge[]) {
        if (edge.length < 24) continue;
        const mid = edge.length / 2;
        const poses = edgeDrivePath(edge, mid - 6, mid + 6, 1, edge.oneway ? 0 : 4.0625);
        const { ticks } = drive(rt, poses, { speedKmh: 30 });
        const want = isExtraUrbanCarriageway(edge);
        for (const t of ticks) {
          if (t.edgeId !== edge.id) continue;
          compared++;
          if (t.outsideSettlement === true) outside++;
          if ((t.outsideSettlement === true) !== want) disagreements.push(`${file}:${edge.id}`);
          // Published only in the TRUE direction: a town tick stays byte-identical.
          if (!want) expect("outsideSettlement" in t, `${file}:${edge.id}`).toBe(false);
        }
      }
    }
    expect(disagreements).toEqual([]);
    expect(compared).toBeGreaterThan(5000);
    // Five rural micro-maps + the motorway carriageways posted 140 — never zero.
    expect(outside).toBeGreaterThan(50);
  });

  it("the rural five and the motorway are outside; the town boulevards are not", () => {
    for (const [id, x, y] of [
      ["ov-crest-v1", 4.06, 200],
      ["sp-curve-v1", 4.06, 60],
      ["mw-v1", 0, 400],
    ] as const) {
      const { ticks } = drive(createWorldRuntime(load(id)), straight(x, y, y + 20, 60), { speedKmh: 60 });
      expect(ticks.some((t) => t.outsideSettlement === true), id).toBe(true);
    }
    for (const id of ["ov-keepright-v1", "ln-v1", "wb-boulevard-v1"]) {
      const { ticks } = drive(createWorldRuntime(load(id)), straight(12.19, 30, 60, 40), { speedKmh: 40 });
      expect(ticks.length).toBeGreaterThan(0);
      expect(ticks.some((t) => t.outsideSettlement === true), id).toBe(false);
    }
  });
});

describe("2. (a) ал. 2, т. 2 on the built town street — no bill", () => {
  it("ov-keepright-v1 as committed (2+2, 50 tag, a town boulevard): 25 s in the left lane bills NO NOT_KEEPING_RIGHT", () => {
    const ticks = hogKeepRight(load("ov-keepright-v1"));
    // The stint really is a left-lane stint on a painted two-lane bank…
    const held = ticks.filter((t) => t.laneId === 1 && t.laneCount === 2 && t.speedKmh > 40);
    expect(held.length * 0.05).toBeGreaterThan(20);
    expect(ticks.every((t) => t.maxSpeedKmh === 50 && t.outsideSettlement !== true && t.motorway !== true)).toBe(true);
    // …and the law lets him choose it.
    expect(grade(ticks)).not.toContain("NOT_KEEPING_RIGHT");
  });

  it("the same street posted exactly 80 is still т. 2 — no bill", () => {
    const ticks = hogKeepRight(load("ov-keepright-v1", (e) => (e.maxspeed = KEEP_RIGHT_TOWN_MAX_KMH)));
    expect(grade(ticks)).not.toContain("NOT_KEEPING_RIGHT");
  });
});

describe("3. (b) ал. 1 binds on the built road — the same student IS billed", () => {
  it("the street re-posted 90 by tag is an извънградски път: outsideSettlement on the tick, and billed", () => {
    const ticks = hogKeepRight(load("ov-keepright-v1", (e) => (e.maxspeed = 90)));
    expect(ticks.some((t) => t.outsideSettlement === true)).toBe(true);
    expect(grade(ticks)).toContain("NOT_KEEPING_RIGHT");
  });

  it("posted 81 (still a town street to the world) is billed — above 80, т. 2 does not apply", () => {
    const ticks = hogKeepRight(load("ov-keepright-v1", (e) => (e.maxspeed = KEEP_RIGHT_TOWN_MAX_KMH + 1)));
    expect(ticks.some((t) => t.outsideSettlement === true)).toBe(false);
    expect(grade(ticks)).toContain("NOT_KEEPING_RIGHT");
  });

  it("a 90 that is only a class DEFAULT is not «outside» to the world, but is still above 80 — billed", () => {
    const ticks = hogKeepRight(
      load("ov-keepright-v1", (e) => {
        e.maxspeed = 90;
        e.maxspeedSource = "default";
      }),
    );
    expect(ticks.some((t) => t.outsideSettlement === true)).toBe(false);
    expect(grade(ticks)).toContain("NOT_KEEPING_RIGHT");
  });

  it("the street tagged `motorway` at 50 is billed — the motorway clause arms on its own", () => {
    const ticks = hogKeepRight(load("ov-keepright-v1", (e) => (e.motorway = true)));
    expect(ticks.some((t) => t.motorway === true)).toBe(true);
    expect(grade(ticks)).toContain("NOT_KEEPING_RIGHT");
  });

  it("mw-v1's left lane (laneId 2, x = −8.12) for 20 s at 130 km/h is billed", () => {
    const ticks = drive(createWorldRuntime(load("mw-v1")), straight(-8.12, 100, 830, 130), { speedKmh: 130 }).ticks;
    expect(ticks.filter((t) => t.laneId === 2).length * 0.05).toBeGreaterThan(18);
    expect(grade(ticks)).toContain("NOT_KEEPING_RIGHT");
  });
});

/** Lanes in ONE direction of an edge. */
const perDirection = (e: DistrictEdge): number => (e.oneway ? e.lanes : Math.floor(e.lanes / 2));

describe("4. (c) ал. 2, т. 3 — lanes a light signal admits", () => {
  it("the only lane-control signal in the product (meta.scenario.laneGantry) stands over single-lane edges, where the rule cannot arm", () => {
    const gantries = DISTRICT_FILES.filter((f) => {
      const meta = (JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf-8")) as { meta: { scenario?: { laneGantry?: unknown } } }).meta;
      return meta.scenario?.laneGantry !== undefined;
    });
    expect(gantries).toEqual(["lc-gantry-v1.json"]);
    const edges = load("lc-gantry-v1").roads.edges as DistrictEdge[];
    expect(edges.every((e) => perDirection(e) === 1)).toBe(true);
  });
});

describe("5. the census — where NOT_KEEPING_RIGHT stays armable on the committed maps", () => {
  it("only the three motorway maps carry a 2+-lane bank where ал. 1 binds", () => {
    const binding = new Set<string>();
    for (const file of DISTRICT_FILES) {
      const d = parseDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, file), "utf-8")));
      for (const e of d.roads.edges as DistrictEdge[]) {
        if (perDirection(e) < 2) continue;
        if (isMotorwayCarriageway(e) || isExtraUrbanCarriageway(e) || e.maxspeed > KEEP_RIGHT_TOWN_MAX_KMH) {
          binding.add(file.replace(/\.json$/, ""));
        }
      }
    }
    expect([...binding].sort()).toEqual(["mw-entry-v1", "mw-exit-v1", "mw-v1"]);
  });
});

/** `seconds` of driving spread evenly over a straight northbound stint (the
 *  runtime samples every 0.05 s, so this is where the car is at each sample). */
function stay(x: number, y0: number, y1: number, seconds: number, dt = 0.05): PathPose[] {
  const n = Math.round(seconds / dt);
  return Array.from({ length: n + 1 }, (_, i) => ({ x, y: y0 + ((y1 - y0) * i) / n, headingDeg: 0 }));
}

describe("6. the clause is the LIMIT on the built road, never the car's speed (round 3, W1)", () => {
  // The three town boulevards the re-scoped lessons run on. Left-lane centre
  // x = 4.06 on all three (meta.scenario.laneCenterLeftM / laneCenterInnerM).
  const BOULEVARDS = [
    { id: "ov-keepright-v1", lengthM: 360, limit: 50 },
    { id: "ln-v1", lengthM: 400, limit: 50 },
    { id: "wb-boulevard-v1", lengthM: 200, limit: 40 },
  ] as const;
  const LEFT_X = 4.06;

  for (const b of BOULEVARDS) {
    describe(b.id, () => {
      it("is the street the test says it is: one two-way edge, two lanes one way, the posted limit, a left lane at x = 4.06", () => {
        const doc = raw(b.id) as {
          meta: { scenario: Record<string, number> };
          roads: { edges: { lanes: number; oneway: boolean; maxspeed: number; maxspeedSource: string; length: number }[] };
        };
        expect(doc.roads.edges).toHaveLength(1);
        const e = doc.roads.edges[0];
        expect([e.lanes, e.oneway, e.maxspeed, e.maxspeedSource, e.length]).toEqual([4, false, b.limit, "tag", b.lengthM]);
        expect(doc.meta.scenario.laneCenterLeftM ?? doc.meta.scenario.laneCenterInnerM).toBe(LEFT_X);
      });

      it(`25 s in the left lane with the dial at 95 km/h: billed for SPEEDING, NOT for the lane (posted ${b.limit})`, () => {
        // The ROAD half of every tick — lane, lane count, limit, settlement —
        // is the built map's own. The dial reads 95. (On the 200 m boulevard a
        // car really doing 95 is through in 7 s, under the 12 s sustain, so the
        // stay is held for 25 s by sampling the same asphalt more densely: the
        // rule reads the tick, and this is the tick a 95 km/h student produces
        // there, for longer than the map lets him.)
        const ticks = drive(createWorldRuntime(load(b.id)), stay(LEFT_X, 10, b.lengthM - 10, 25), { speedKmh: 95 }).ticks;
        const held = ticks.filter((t) => t.laneId === 1 && t.laneCount === 2);
        expect(held.length * 0.05).toBeGreaterThan(24);
        expect(ticks.every((t) => t.maxSpeedKmh === b.limit && t.outsideSettlement !== true && t.motorway !== true)).toBe(true);
        expect(ticks.every((t) => t.speedKmh === 95)).toBe(true);
        const billed = grade(ticks);
        expect(billed).not.toContain("NOT_KEEPING_RIGHT");
        expect(billed.some((c) => c.startsWith("SPEEDING"))).toBe(true);
      });

      it("the same lane, the street re-posted 90 (a class default — still a town street to the world), the dial at 60: billed", () => {
        const fast = load(b.id, (e) => {
          e.maxspeed = 90;
          e.maxspeedSource = "default";
        });
        const ticks = drive(createWorldRuntime(fast), stay(LEFT_X, 10, b.lengthM - 10, 25), { speedKmh: 60 }).ticks;
        expect(ticks.some((t) => t.outsideSettlement === true)).toBe(false);
        expect(ticks.every((t) => t.maxSpeedKmh === 90 && t.speedKmh === 60)).toBe(true);
        expect(grade(ticks)).toContain("NOT_KEEPING_RIGHT");
      });
    });
  }

  it("a real pass at 95 km/h (the car covers the metres the dial says) on the two boulevards long enough to hold 12 s: speeding, no keep-right bill", () => {
    for (const [id, y0, y1] of [
      ["ov-keepright-v1", 5, 355],
      ["ln-v1", 5, 395],
    ] as const) {
      const ticks = drive(createWorldRuntime(load(id)), straight(LEFT_X, y0, y1, 95), { speedKmh: 95 }).ticks;
      expect(ticks.filter((t) => t.laneId === 1).length * 0.05, id).toBeGreaterThan(12.5);
      const billed = grade(ticks);
      expect(billed, id).not.toContain("NOT_KEEPING_RIGHT");
      expect(billed.some((c) => c.startsWith("SPEEDING")), id).toBe(true);
    }
  });

  it("wb-boulevard-v1 is too short for a real 95 km/h pass to last the 12 s sustain — stated, so the dense-sampling test above is not mistaken for one", () => {
    const usableM = 200 - 20;
    expect(usableM / (95 / 3.6)).toBeLessThan(12);
    expect(usableM / (81 / 3.6)).toBeLessThan(12);
  });
});
