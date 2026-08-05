/**
 * B14 / B46 / B49 — no pedestrian walks through a parked car.
 *
 * HIS SENTENCE, written about three different lessons: „the Pedestrian at the
 * end when he leaves the Zebra, he goes trough a car", „he passes like a ghost
 * trough some car", „ghost crossing trough stopped car". It is one defect seen
 * three times, and it was never about collision detection.
 *
 * THE CAUSE, in two constants written years apart:
 *
 *   pedestrians.buildPedRoute   sidewalk at travelHalf + 0.4 + 1.2 = +1.60 m
 *   TrafficLayer parked row     body centre travelHalf + 2.00 m, half-width 0.95
 *                               → the body spans travelHalf + 1.05 … +2.95 m
 *
 * The walking line was 0.55 m inside the near flank of every parked car in the
 * district. Not intermittently — by construction, on every street the parking
 * pass touches.
 *
 * MEASURED ON THIS TREE, before the fix (this file, five rng seeds, all 100
 * committed districts): **19 of 121 pedestrian walk loops on 11 districts pass
 * through a parked body, up to 1.25 m deep** —
 *
 *   zb-v1 2/2 (catalog 5, the lesson he was looking at) · rb-ped-v1 3/3 ·
 *   district-v1 5/48 · d2-v1 2/51 · poligon-v1 1/1 · pe-school-v1 1/1 ·
 *   pe-zone-v1 1/1 · pk-banx-v1 1/1 · ov-crossing-v1 1/1 ·
 *   rx-tram-stop-v1 1/1 · rx-tram-island-v1 1/1
 *
 * and **50 crossing-edges on 5 districts had their walk line INSIDE THE KERB**,
 * i.e. the pedestrian was walking down the carriageway. That half was created
 * by FR-21's own repair: declaring `parkingBand` moves a street's kerb out 4 m,
 * and the walk was measured from the travel lanes, so it stayed behind.
 *
 * Both are zero now, and both stay zero because this file measures the walk
 * against `computeParkedCars` and `edgeHalfWidth` — the very functions that
 * place the bodies and draw the kerb, so the test and the world cannot drift.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { edgeHalfWidth } from "../../world/builders/network";
import { computeParkedCars, parkingOptedOut } from "../TrafficLayer";
import { buildPedRoute, pedSidewalkOffsetM, PED_SHOULDER_HALF_M } from "../pedestrians";
import { mulberry32 } from "../rng";
import type { DistrictEdge, TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = path.resolve(HERE, "../../../../../..", "content", "world");

/** The lane width LessonScene mounts TrafficLayer and the traffic system with. */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
/** TrafficLayer PARKED_HALF_LEN_M / PARKED_HALF_W_M — the body footprint. */
const BODY_HALF_LEN = 2.25;
const BODY_HALF_W = 0.95;
/** rng draws only the walk's LENGTH, never its offset — sweep a few anyway so
 *  a route that reaches further down the parked row cannot hide. */
const SEEDS = [12345, 777, 4242, 99, 31337];

const DISTRICT_IDS = readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

function loadDistrict(id: string): TrafficDistrict | null {
  const raw = JSON.parse(readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8")) as TrafficDistrict;
  return raw.roads?.edges ? raw : null;
}

/** Penetration depth of a point (inflated by the walker's shoulders) into a
 *  parked body's oriented footprint, in metres. 0 when clear.
 *
 *  `ParkedCar.yaw` is the THREE-space Y rotation TrafficLayer publishes as
 *  `atan2(dx, -dy)`, so the body's forward axis in district space is
 *  `(sin yaw, -cos yaw)` and its right axis is `(cos yaw, sin yaw)`. Getting
 *  that backwards rotates every footprint 90° and measures the wrong thing. */
function penetration(
  bx: number,
  by: number,
  yaw: number,
  px: number,
  py: number,
): number {
  const dx = px - bx;
  const dy = py - by;
  const lon = dx * Math.sin(yaw) + dy * -Math.cos(yaw);
  const lat = dx * Math.cos(yaw) + dy * Math.sin(yaw);
  const overLon = Math.abs(lon) - (BODY_HALF_LEN + PED_SHOULDER_HALF_M);
  const overLat = Math.abs(lat) - (BODY_HALF_W + PED_SHOULDER_HALF_M);
  return overLon < 0 && overLat < 0 ? Math.min(-overLon, -overLat) : 0;
}

/** Sample a built segment's polyline every `step` metres. */
function* samples(
  seg: { px: Float64Array; py: Float64Array; cum: Float64Array; length: number },
  step = 0.25,
): Generator<[number, number]> {
  for (let s = 0; s <= seg.length; s += step) {
    let i = 0;
    while (i < seg.cum.length - 2 && seg.cum[i + 1] < s) i++;
    const segLen = seg.cum[i + 1] - seg.cum[i];
    const t = segLen > 0 ? (s - seg.cum[i]) / segLen : 0;
    yield [
      seg.px[i] + (seg.px[i + 1] - seg.px[i]) * t,
      seg.py[i] + (seg.py[i + 1] - seg.py[i]) * t,
    ];
  }
}

describe("B14 — pedestrians do not walk through parked cars", () => {
  it("no walk loop on any committed district passes through a parked body", () => {
    const offenders: string[] = [];
    let routes = 0;
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d || !d.crossings?.length) continue;
      const bodies = computeParkedCars(d, LANE_W);
      if (bodies.length === 0) continue;
      const edgeById = new Map(d.roads.edges.map((e) => [e.id, e]));
      let hits = 0;
      let worst = 0;
      let where = "";
      for (const crossing of d.crossings) {
        const edge = edgeById.get(crossing.edgeId);
        if (!edge) continue;
        let counted = false;
        let hitHere = false;
        for (const seed of SEEDS) {
          const route = buildPedRoute(crossing, edge, LANE_W, mulberry32(seed));
          if (!route) continue;
          if (!counted) {
            routes++;
            counted = true;
          }
          for (const seg of route.segments) {
            for (const [px, py] of samples(seg)) {
              for (const b of bodies) {
                const depth = penetration(b.x, b.y, b.yaw, px, py);
                if (depth <= 0) continue;
                hitHere = true;
                if (depth > worst) {
                  worst = depth;
                  where = `walker (${px.toFixed(2)}, ${py.toFixed(2)}) in body (${b.x.toFixed(2)}, ${b.y.toFixed(2)}) on ${edge.id}`;
                }
              }
            }
          }
        }
        if (hitHere) hits++;
      }
      if (hits > 0) {
        offenders.push(`${id}: ${hits} walk loops through a body, worst ${worst.toFixed(2)} m deep — ${where}`);
      }
    }
    // 121 loops swept before the fix; the number only matters as proof the
    // sweep is not vacuous.
    expect(routes).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  }, 300_000);

  it("the geometry that produced his sentence still fails the same measurement", () => {
    // The witness. `LEGACY_OFFSET` is the line this file replaced —
    // `travelHalf + 0.4 + 1.2`, measured from the TRAVEL lanes. Sweeping it
    // laterally against the parked row proves the fix was needed and keeps the
    // before-number honest: a future reader can see the defect, not just be
    // told it was there.
    //
    // THE ROW HAS TO EXIST. `bodyOffset` is an ANALYTIC stand-in for where
    // `computeParkedCars` seats a body — `travelHalf + PARK_BAND_CENTER_M`. On a
    // street that declared `parkingBand: false` the pass parks nobody at all
    // (TrafficLayer line „FR-21: this street parks nobody"), so that line is not
    // a row, it is a phantom: nothing stands there to walk through. Measuring
    // against it flagged the six PE crossings the carriageway wave opted out —
    // pe-bus / pe-cane / pe-child / pe-clear / pe-dart / pe-slow — even though
    // the real sweep above, which uses the ACTUAL body positions, finds them
    // clean. Worse, the flag fired *because* the world got safer: with no row on
    // the footway the walk relaxes from the 0.7 m kerb-hug (PED_KERB_WALK_M,
    // which exists only to dodge a footway-parked row) back out to the normal
    // 1.6 m stand-back, and 1.6 sits 0.40 m from the phantom while 0.7 sat 1.30.
    // So this half asks `parkingOptedOut` first, the same predicate the pass
    // itself asks. Measured on this tree: 116 → 110 old, 6 → 0 new.
    const legacy = (edge: DistrictEdge) => (Math.max(1, edge.lanes) * LANE_W) / 2 + 1.6;
    const bodyOffset = (edge: DistrictEdge) => (Math.max(1, edge.lanes) * LANE_W) / 2 + 2.0;
    const clear = BODY_HALF_W + PED_SHOULDER_HALF_M;
    const oldBad = new Set<string>();
    const newBad = new Set<string>();
    let optedOut = 0;
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d || !d.crossings?.length) continue;
      if (computeParkedCars(d, LANE_W).length === 0) continue;
      const edgeById = new Map(d.roads.edges.map((e) => [e.id, e]));
      for (const crossing of d.crossings) {
        const edge = edgeById.get(crossing.edgeId) as DistrictEdge | undefined;
        if (!edge) continue;
        if (parkingOptedOut(edge)) {
          optedOut++;
          continue;
        }
        const row = bodyOffset(edge);
        if (Math.abs(legacy(edge) - row) < clear) oldBad.add(`${id}/${edge.id}`);
        if (Math.abs(pedSidewalkOffsetM(edge, LANE_W) - row) < clear) newBad.add(`${id}/${edge.id}`);
      }
    }
    // 110 crossing-edges across the committed districts put the walking line
    // inside the lateral span of the parked row. It may only ever go DOWN.
    expect(oldBad.size).toBeGreaterThanOrEqual(40);
    expect([...newBad]).toEqual([]);
    // …and the skip is not a way to make the measurement vacuous. It cannot
    // drift — it asks `parkingOptedOut`, the same predicate the pass itself asks
    // before it seats a body — but it must also stay a MINORITY of what is
    // swept, so „skip the awkward ones" can never become the way this passes.
    // Six today (the PE family); FR-21 tagging more streets may raise it, and
    // that is fine right up until the skip outnumbers the measurement.
    expect(optedOut).toBeLessThan(oldBad.size);
  }, 300_000);

  it("no walk line is inside the kerb — a pedestrian is never on the carriageway", () => {
    const offenders: string[] = [];
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d || !d.crossings?.length) continue;
      const edgeById = new Map(d.roads.edges.map((e) => [e.id, e]));
      for (const crossing of d.crossings) {
        const edge = edgeById.get(crossing.edgeId) as DistrictEdge | undefined;
        if (!edge) continue;
        const walk = pedSidewalkOffsetM(edge, LANE_W);
        const kerb = edgeHalfWidth(edge);
        if (walk < kerb - 1e-6) {
          offenders.push(`${id}/${edge.id}: walk ${walk.toFixed(2)} < kerb ${kerb.toFixed(2)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the walk stays ON the pavement — never past its back edge", () => {
    // SIDEWALK_WIDTH_M 3.5 (world/builders/constants). A walker pushed clear of
    // a footway-parked row must not be pushed into the buildings instead.
    const SIDEWALK_WIDTH_M = 3.5;
    const offenders: string[] = [];
    for (const id of DISTRICT_IDS) {
      const d = loadDistrict(id);
      if (!d || !d.crossings?.length) continue;
      const edgeById = new Map(d.roads.edges.map((e) => [e.id, e]));
      for (const crossing of d.crossings) {
        const edge = edgeById.get(crossing.edgeId) as DistrictEdge | undefined;
        if (!edge) continue;
        const back = edgeHalfWidth(edge) + SIDEWALK_WIDTH_M;
        const outer = pedSidewalkOffsetM(edge, LANE_W) + PED_SHOULDER_HALF_M;
        if (outer > back + 1e-6) {
          offenders.push(`${id}/${edge.id}: walk edge ${outer.toFixed(2)} past pavement back ${back.toFixed(2)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
