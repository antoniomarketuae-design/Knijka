/**
 * FR-21, the car half — the parked-car-on-the-footway budget.
 *
 * HIS SENTENCE, three lessons running (150 verdict, lines 185 / 284 / 288 /
 * 292): „the Pedestrian … goes trough a car which is standing on the sidewalk",
 * „passes like a ghost trough some car", „ghost crossing trough stopped car on
 * the side walk". And the one that costs a drill, line 239: „If i stop at the
 * green cyrcle I cant see the car coming on the right **because of the cars
 * that have stopped on the side walk**."
 *
 * THE ARITHMETIC. `TrafficLayer.PARK_CLASSES` — the classes the procedural curb
 * pass parks cars along — is
 *
 *     {primary, secondary, tertiary} ∪ {residential, living_street, unclassified}
 *
 * while `world/builders/constants.PARKING_LANE_CLASSES` — the classes the WORLD
 * draws a 4 m curbside parking band for — is only the first half. The pass
 * seats every body at `travelHalf + PARK_BAND_CENTER_M`, i.e. the centre line of
 * a band that on the second half of that set does not exist. On a two-lane
 * residential street: kerb at 8.125 m, body centred at 10.125 m spanning
 * 9.175…11.075, and the pavement runs 8.475…11.975. The body is not near the
 * footway, it is in the MIDDLE of it — and `TrafficLayer`'s transform plants
 * every parked body at y = 0, so it is also sunk 0.12 m into the kerb it stands
 * on.
 *
 * WHY THIS IS A BUDGET AND NOT A FIX. Two cheaper repairs were measured on this
 * tree and both are worse than the defect:
 *
 *   - **Seat the bodies inside the carriageway** (outer flank against the kerb,
 *     which is what a real Sofia street looks like). Measured over the 207
 *     committed traces: **19 of them end up inside a body footprint, three of
 *     those `shadow-correct`** — the demonstrated-CORRECT drive would drive
 *     through a parked car. The parking, reversing and manoeuvre drills use
 *     that strip on purpose. Fixing it means re-recording traces, which is not
 *     this lane's file ownership.
 *   - **Add `residential` to `PARKING_LANE_CLASSES`.** That grows
 *     `edgeHalfWidth` by 4 m on 76 districts at once, which moves every kerb,
 *     pavement, junction mouth radius, collider and baked building footprint —
 *     a 100-district regeneration, and the generators' own frontage validators
 *     would reject most of them.
 *
 * So the repair is per-map and opt-in (`DistrictEdge.parkingBand`,
 * `network.edgeParkingBand`): a street declares the band its own parked row
 * already assumes, the KERB moves out from under the row, and **not one body
 * moves** — the pass already seats them on the band's centre line, so every
 * committed trace still holds. `parkingBand: false` says the opposite: this
 * street has no kerbside parking at all, and the pass places nothing.
 *
 * This file is the ledger. It exists so the remaining falsehood is a number
 * that can only go down, and so the next person who regenerates one of these
 * maps is told, by a failing test, that a one-word tag closes their district.
 *
 * MEASURED ON THIS TREE:
 *
 * | | before this lane | now |
 * |---|---|---|
 * | parked bodies, 100 districts   | 3799 | 3621 |
 * | …standing fully on a footway   | 2605 (68.6%) | 2427 (67.0%) |
 * | districts with ≥ 1 such body   | 83 | 76 |
 * | PE family (catalog 24–30)      | 7 of 7 dirty | 0 of 7 — 178 bodies |
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { edgeHalfWidth } from "../../world/builders/network";
import { computeParkedCars } from "../TrafficLayer";
import type { DistrictEdge, TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = path.resolve(HERE, "../../../../../..", "content", "world");

/** The lane width LessonScene mounts TrafficLayer with (its own default). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
/** Parked-body half-width, m (TrafficLayer PARKED_HALF_W_M). */
const BODY_HALF_W = 0.95;

/**
 * Districts that still stand at least one parked body on a footway, with the
 * count they were admitted with. Discipline is doc 86 §10's, the same one
 * `scenery-sightline.TRACE_EXEMPT` follows: **an entry may only shrink, and an
 * entry that reaches zero must be DELETED** — a stale row fails the gate, so
 * the list cannot quietly stop being true.
 *
 * To close a row: give the street's edges `parkingBand: true` in the generator
 * that writes the map (`tools/maps/gen_*.mjs`), re-run it, and check the
 * frontage validator still passes — the kerb moves out 4 m, so buildings move
 * with it. If the street genuinely has no kerbside parking, say
 * `parkingBand: false` instead and the row goes to zero that way.
 */
const FOOTWAY_BUDGET: Record<string, number> = {
  "ov-crest-v1": 107, "d2-v1": 106, "poligon-v1": 91, "sp-signs-v1": 84,
  "district-v1": 80, "sp-curve-v1": 80, "sp-creep2-v1": 75, "ac-aqua-v1": 60,
  "ac-bridge-v1": 60, "fo-brake-v1": 48, "jx-equal-v1": 46, "sp-danger-v1": 46,
  "ac-ice-v1": 41, "ac-night-v1": 41, "ac-rain-v1": 41, "fo-follow-v1": 41,
  "ov-oneway-v1": 41, "pk-banx-v1": 41, "sp-creep-v1": 41, "sp-rain-v1": 41,
  "sp-zone30-v1": 41, "vp-ready-v1": 41, "vu-pass-v1": 41, "ov-solid-v1": 39,
  "tj-rhr-v1": 36, "ov-lane-v1": 35, "sp-trans-v1": 35, "rb-mini-v1": 34,
  "rb-ped-v1": 34, "rb-single-v1": 34, "rx-drop-v1": 34, "rx-guarded-v1": 34,
  "rx-unguarded-v1": 34, "vu-child-v1": 34, "vu-door-v1": 34, "pk-rail-v1": 33,
  "sig-wave-v1": 33, "tj-occluded-v1": 33, "vu-bikelane-v1": 32,
  "pk-busstop-v1": 31, "rb-2lane-v1": 30, "hz-obstacle-v1": 27,
  "ov-narrow-v1": 27, "pe-school-v1": 27, "vu-cyclist-v1": 27, "sx-v1": 26,
  "pk-double-v1": 24, "pk-stop-v1": 21, "wb-boulevard-v1": 21,
  "hz-accident-v1": 19, "ln-arrows-v1": 19, "pk-ban-v1": 19, "zb-v1": 18,
  "pk-ban2-v1": 17, "pe-jay-v1": 14, "rx-tram-island-v1": 13,
  "rx-tram-stop-v1": 13, "pe-zone-v1": 11, "tj-stop-v1": 11, "lot-45-v1": 8,
  "lot-45rev-v1": 8, "lot-double-v1": 8, "lot-gap-judge-v1": 8,
  "lot-gap-long-v1": 8, "lot-gap-short-v1": 8, "lot-left-v1": 8,
  "lot-narrow-v1": 8, "lot-par-v1": 8, "lot-perp-v1": 8, "lot-van-v1": 8,
  "lot-wall-v1": 8, "lot-zebra-v1": 8, "pk-drive-v1": 8, "tj-emerge-v1": 8,
  "mv-uturn-v1": 6, "lot-night-v1": 4,
};

/** Total across the budget above — the one number the founder's complaint is. */
const BUDGET_TOTAL = Object.values(FOOTWAY_BUDGET).reduce((a, b) => a + b, 0);

/** The PE family (catalog 24–30). Fixed this lane; may never regress. */
const PE_FAMILY = [
  "pe-clear-v1", "pe-slow-v1", "pe-rain-v1", "pe-dart-v1",
  "pe-bus-v1", "pe-child-v1", "pe-cane-v1",
] as const;

const DISTRICT_IDS = readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

function loadDistrict(id: string): TrafficDistrict | null {
  const raw = JSON.parse(readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8")) as TrafficDistrict;
  return raw.roads?.edges ? raw : null;
}

/** Bounding box of a polyline, cached per edge for the sweep below. */
function bboxOf(geo: readonly number[][]): [number, number, number, number] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of geo) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return [minX, maxX, minY, maxY];
}

/** Perpendicular miss from a point to a polyline. */
function missTo(geo: readonly number[][], px: number, py: number): number {
  let best = Infinity;
  for (let i = 0; i < geo.length - 1; i++) {
    const ax = geo[i][0];
    const ay = geo[i][1];
    const dx = geo[i + 1][0] - ax;
    const dy = geo[i + 1][1] - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best) best = d;
  }
  return best;
}

/**
 * Bodies whose FOOTPRINT lies entirely beyond EVERY edge's kerb — i.e. off all
 * asphalt, which on a SIDEWALK_CLASSES street means on the pavement.
 *
 * Measured against `edgeHalfWidth`, the very function the world draws the kerb
 * with (travel lanes + whatever parking band the edge carries), so the test and
 * the mesh cannot disagree. "Every edge, not just the nearest" is deliberate:
 * it is the same shape as the neighbouring-carriageway rule in
 * `scenery-sightline`, and it never blames a body that is legitimately inside
 * some other street's band.
 */
function footwayBodies(district: TrafficDistrict): Array<{ x: number; y: number; over: number }> {
  const out: Array<{ x: number; y: number; over: number }> = [];
  const edges = district.roads.edges.filter((e) => e.geometry && e.geometry.length >= 2);
  const boxes = edges.map((e) => bboxOf(e.geometry));
  const kerbs = edges.map((e) => edgeHalfWidth(e as DistrictEdge));
  for (const b of computeParkedCars(district, LANE_W)) {
    // A bbox reject means the body is beyond that edge's kerb too — it must NOT
    // leave `over` at Infinity, or every body on a straight street's pavement
    // (rejected by every bbox it is 10 m clear of) would read as clean.
    let over = Infinity;
    let onSomeAsphalt = false;
    for (let i = 0; i < edges.length && !onSomeAsphalt; i++) {
      const limit = kerbs[i] + BODY_HALF_W;
      const [minX, maxX, minY, maxY] = boxes[i];
      if (b.x < minX - limit || b.x > maxX + limit || b.y < minY - limit || b.y > maxY + limit) {
        continue; // certainly outside this edge's kerb
      }
      const gap = missTo(edges[i].geometry, b.x, b.y) - limit;
      if (gap <= 1e-6) onSomeAsphalt = true;
      else if (gap < over) over = gap;
    }
    if (!onSomeAsphalt) out.push({ x: b.x, y: b.y, over: Number.isFinite(over) ? over : 0 });
  }
  return out;
}

describe("FR-21 — no parked body stands on a footway", () => {
  it("is clean on every district that is NOT in the budget", () => {
    const surprises: string[] = [];
    for (const id of DISTRICT_IDS) {
      if (id in FOOTWAY_BUDGET) continue;
      const d = loadDistrict(id);
      if (!d) continue;
      const bad = footwayBodies(d);
      if (bad.length > 0) {
        surprises.push(
          `${id}: ${bad.length} bodies on the pavement, worst ${Math.max(
            ...bad.map((b) => b.over),
          ).toFixed(2)} m past the kerb — add it to FOOTWAY_BUDGET or fix the map`,
        );
      }
    }
    expect(surprises).toEqual([]);
  });

  it("every budget row is real, and none of them grew", () => {
    const regressed: string[] = [];
    const stale: string[] = [];
    let total = 0;
    for (const [id, admitted] of Object.entries(FOOTWAY_BUDGET)) {
      const d = loadDistrict(id);
      expect(d, `${id} is in the budget but is not a committed district`).not.toBeNull();
      const n = footwayBodies(d!).length;
      total += n;
      if (n > admitted) regressed.push(`${id}: ${admitted} → ${n}`);
      if (n === 0) stale.push(`${id} is CLEAN now — delete its FOOTWAY_BUDGET row`);
    }
    expect(regressed).toEqual([]);
    expect(stale).toEqual([]);
    // The headline number. It may only fall.
    expect(total).toBeLessThanOrEqual(BUDGET_TOTAL);
  });

  it("the PE family — the seven lessons he played back to back — is clean", () => {
    // catalog 24–30. Closed by tools/maps/gen_pe_crossings.mjs declaring
    // `parkingBand` on every one of them; the bodies did not move, the kerb did.
    const dirty: string[] = [];
    for (const id of PE_FAMILY) {
      const d = loadDistrict(id);
      expect(d, id).not.toBeNull();
      const bad = footwayBodies(d!);
      if (bad.length > 0) dirty.push(`${id}: ${bad.length}`);
      expect(id in FOOTWAY_BUDGET, `${id} must not be in the budget`).toBe(false);
    }
    expect(dirty).toEqual([]);
  });

  it("an opted-out street parks nobody at all", () => {
    // pe-rain-v1 is the unlit warehouse canyon: `parkingBand: false`, so the
    // pass places nothing rather than inventing a row with nowhere to stand.
    const d = loadDistrict("pe-rain-v1")!;
    expect(d.roads.edges[0]).toMatchObject({ parkingBand: false });
    expect(computeParkedCars(d, LANE_W).length).toBe(0);
  });
});
