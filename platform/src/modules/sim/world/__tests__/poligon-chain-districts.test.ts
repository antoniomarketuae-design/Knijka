/**
 * poligon-v1 chain battery — the topology sc-ed-poligon-chain („Полигонът на
 * един дъх", the capstone) pins.
 *
 * The capstone chains three Наредба-38 маневри on the южната „Старт-стоп права":
 * a perpendicular reverse-park, a straight reverse, and a three-point turn. Its
 * ONLY structural dependency beyond the reverse-line drill is the turn-detector's
 * 40 m junction rule (runtime/turns.ts): a >55° swing fires `turnStarted`
 * (→ TURN_WITHOUT_INDICATOR) only when the car is within 40 m of an INTERSECTION
 * node. So the two SWINGING maneuvers must live where NO intersection is within
 * 40 m — the straight's end bands, east of p1 and west of g2. This battery pins
 * that the bay anchor and the turn anchor actually sit in those bands, that the
 * degree-2 corners are not junctions, and that the полигон is otherwise the
 * empty closed ground the drill assumes (no signals, no stop lines).
 *
 * The general полигон engine contract is proven by poligon-district.test.ts and
 * the reverse leg by poligon-reverse-districts.test.ts; this file asserts ONLY
 * the chain drill's own dependencies.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadPoligon(): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "poligon-v1.json"), "utf-8"));
}

interface RawDistrict {
  roads: {
    nodes: Array<{ id: string; x: number; y: number }>;
    edges: Array<{ id: string; from: string; to: string; oneway: boolean; lanes: number; maxspeed: number }>;
  };
  intersections: Array<{ id: string; x: number; y: number }>;
}

/** The drill's authored anchors (denormalized in templates-exam.ts). */
const BAY = { x: 143, y: -127 }; // parkInBay centre (EAST band)
const TURN = { x: -150, y: -131.5 }; // threePointTurn corridor centre (WEST band)
const CURB_Y = -136.4;

/** The turn detector's junction-area radius (runtime/turns.ts JUNCTION_AREA_RADIUS_M). */
const JUNCTION_AREA_M = 40;

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

describe("poligon-v1 — the sc-ed-poligon-chain topology", () => {
  const raw = loadPoligon() as RawDistrict;

  it("the south straight is one continuous two-way run (pg-e-s1..s4), limit 30, along y = −130", () => {
    for (const id of ["pg-e-s1", "pg-e-s2", "pg-e-s3", "pg-e-s4"]) {
      const e = raw.roads.edges.find((x) => x.id === id);
      expect(e, `${id} missing — the drill's ground`).toBeDefined();
      expect(e!.oneway).toBe(false); // reverse against travel must stay wrong-way-free
      expect(e!.maxspeed).toBe(30);
    }
  });

  it("the straight's junction nodes are g2/s0/p1 at x = −95/0/95; the end corners are NOT junctions", () => {
    const onStraight = raw.intersections.filter((i) => Math.abs(i.y - -130) < 1);
    const xs = onStraight.map((i) => i.x).sort((a, b) => a - b);
    expect(xs).toEqual([-95, 0, 95]); // g2, s0, p1 — and nothing else
    // The degree-2 corner joints (sw-a, se-a) carry the straight into the curves
    // but are NOT intersections, so they open no junction area for the turns.
    for (const id of ["pg-n-sw-a", "pg-n-se-a"]) {
      expect(raw.roads.nodes.find((n) => n.id === id), `${id} node`).toBeDefined();
      expect(raw.intersections.find((i) => i.id === id), `${id} must not be a junction`).toBeUndefined();
    }
  });

  it("BOTH swinging maneuvers sit >40 m from every intersection — turnStarted can never arm", () => {
    // This is the whole reason the geometry is what it is: a >55° swing inside a
    // junction area grades TURN_WITHOUT_INDICATOR. The perpendicular reverse-park
    // (~90° swing) and the three-point turn (~180°) must both clear the 40 m ring
    // of every intersection node.
    for (const anchor of [BAY, TURN]) {
      for (const j of raw.intersections) {
        const d = Math.hypot(anchor.x - j.x, anchor.y - j.y);
        expect(d, `anchor (${anchor.x},${anchor.y}) is ${d.toFixed(1)} m from ${j.id}`).toBeGreaterThan(
          JUNCTION_AREA_M,
        );
      }
    }
    // And the straight reverse's marks (x −135..−120) are, by contrast, allowed
    // NEAR g2 — a straight reverse has no swing, so no junction area matters.
    const g2 = raw.intersections.find((i) => i.id === "pg-n-g2")!;
    expect(Math.abs(-120 - g2.x)).toBeLessThan(JUNCTION_AREA_M); // 25 m — inside, and fine
  });

  it("the EAST bay band and WEST turn band read the 30 limit and are wrong-way-free at creep", () => {
    const runtime: DistrictWorldRuntime = createWorldRuntime(loadPoligon());
    runtime.update(1 / 60);
    // Curb-lane poses under each swinging station (creep speed, both headings the
    // maneuvers actually use): on-road, limit 30, no wrong-way.
    for (const [x, hdg] of [
      [145, 270], // bay approach (EAST band, facing west)
      [-135, 270], // reverse-station settle (WEST, facing west)
      [-144, 270], // three-point approach (WEST, facing west)
    ] as const) {
      const tick = runtime.sample(sample(x, CURB_Y, hdg, 4), 1, false);
      expect(tick.maxSpeedKmh, `limit at x=${x}`).toBe(30);
      expect(tick.wrongWay, `wrongWay at x=${x}`).toBe(false);
    }
  });

  it("the полигон is closed: no signals, no stop lines to disturb the chain", () => {
    const runtime = createWorldRuntime(loadPoligon());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
  });
});
