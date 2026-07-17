/**
 * poligon-v1 reverse-corridor battery — the topology sc-ed-reverse-line pins.
 *
 * sc-ed-reverse-line („Заден ход по права линия", the first scenario template on
 * poligon-v1) denormalizes its start pose, its three corridor reachZone gates and
 * its curb obstacle as literals against the committed content/world/poligon-v1.json.
 * This battery proves those literals actually land on the „Старт-стоп права"
 * (edge pg-e-s1, the southern two-way straight) exactly where the template expects
 * — so a future re-cut of the полигон that moved the straight would fail HERE, at
 * the map, rather than silently drifting the drill's ghost off the road.
 *
 * The general полигон engine contract (world builder, runtime, traffic) is proven
 * by poligon-district.test.ts; this file asserts ONLY the reverse drill's own
 * dependencies.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadPoligon(): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "poligon-v1.json"), "utf-8"));
}

interface RawDistrict {
  roads: { edges: Array<{ id: string; from: string; to: string; oneway: boolean; lanes: number; maxspeed: number; geometry: number[][] }> };
  intersections: Array<{ id: string; x: number; y: number }>;
}

/** The drill's authored geometry (denormalized in templates-exam.ts). */
const CURB_LANE_Y = -136.4;
const START_X = -132;
const REVERSE_END_X = -145;
const MOVEOFF_X = -120;

const sample = (x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

describe("poligon-v1 — the sc-ed-reverse-line corridor topology", () => {
  const raw = loadPoligon() as RawDistrict;

  it("hosts the Старт-стоп права (pg-e-s1): two-way, 2 lanes, limit 30, along y = -130", () => {
    const s1 = raw.roads.edges.find((e) => e.id === "pg-e-s1");
    expect(s1, "pg-e-s1 missing — the drill's curb straight").toBeDefined();
    expect(s1!.oneway).toBe(false); // reverse against traffic must stay wrong-way-free
    expect(s1!.lanes).toBe(2);
    expect(s1!.maxspeed).toBe(30);
    expect(s1!.from).toBe("pg-n-sw-a");
    expect(s1!.to).toBe("pg-n-g2");
    // The straight runs west→east along y = -130 from the SW corner to g2.
    expect(s1!.geometry[0]).toEqual([-170, -130]);
    expect(s1!.geometry[s1!.geometry.length - 1]).toEqual([-95, -130]);
  });

  it("the reverse corridor is clear of every junction by a wide margin", () => {
    // The drill works x ∈ [-145, -120] on the south straight. The nearest junction
    // is g2 (x = -95); the nearest corner joint is pg-n-sw-a (x = -170). Both must
    // sit well outside the worked corridor so no junction detector can arm.
    const g2 = raw.intersections.find((i) => i.id === "pg-n-g2")!;
    expect(g2.x).toBe(-95);
    expect(Math.abs(MOVEOFF_X - g2.x)).toBeGreaterThan(20); // 25 m clear of g2
    // No intersection node lies inside the worked x-band on the straight (y=-130).
    const insideBand = raw.intersections.filter(
      (i) => Math.abs(i.y - -130) < 20 && i.x <= MOVEOFF_X && i.x >= REVERSE_END_X,
    );
    expect(insideBand).toEqual([]);
  });

  it("the curb lane at the drill's pinned poses is on-road, limit 30, wrong-way-free eastbound", () => {
    const runtime: DistrictWorldRuntime = createWorldRuntime(loadPoligon());
    runtime.update(1 / 60);
    for (const x of [START_X, MOVEOFF_X, -134, REVERSE_END_X]) {
      const tick = runtime.sample(sample(x, CURB_LANE_Y, 90, 6), 1, false);
      expect(tick.maxSpeedKmh, `limit at x=${x}`).toBe(30);
      // Eastbound (heading 90) in the south curb lane is a legal direction.
      expect(tick.wrongWay, `wrongWay at x=${x}`).toBe(false);
      // The pose sits within the lane, not off-map (offset well under a lane).
      expect(Math.abs(tick.laneOffsetM), `laneOffset at x=${x}`).toBeLessThan(3.25);
    }
  });

  it("the полигон is closed: no signals, no stop lines to disturb the drill", () => {
    const runtime = createWorldRuntime(loadPoligon());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
  });
});
