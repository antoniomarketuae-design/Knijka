/**
 * THE CENTRAL ISLAND IS A WALL A CAR CANNOT MOUNT — asserted on the COLLIDER
 * that the physics world is actually built from, on every ring district there
 * is, discovered rather than listed.
 *
 * THE FINDING THIS EXISTS FOR (sweep-161, sc-roundabout-entry, pc-right,
 * critical): „The car ends up driving on the central island. The whole
 * windscreen is grass and a hedge at point-blank range … This is what earns the
 * careful drive its −10 collision."
 *
 * Measured on the shipped geometry, the first sentence is not what happened and
 * the last one says so: the drive's own debrief reads „Настъпи сблъсък · 1
 * опасна грешка · 10 наказателни точки", i.e. the car was STOPPED BY the island,
 * not carried over it, and the frame is a bonnet pressed into the planting. The
 * island wall works.
 *
 * WHY THIS FILE EXISTS ANYWAY, AND WHY IT ASSERTS THE INDEX BUFFER. Because the
 * claim „the island stops a car" was already made once here, in `buildIsland`'s
 * own header — „the sidewalk accumulator is what `colliders.sidewalks` is built
 * from, so the island's kerb stops a car exactly like a pavement edge does. A
 * central island a student can drive across is not an island." — and it was
 * FALSE for months. `ISLAND_WALL_RISE_M`'s header records both refutations: the
 * highest collider vertex inside any island measured 0.140 m, and the founder
 * photographed himself at register B16 driving „due north with no steering at
 * all … the car body sits on grass between two of the island's own bushes".
 * A prose claim about a collider is worth nothing; this is the number.
 *
 * Four things have to hold together, and each of them has failed somewhere in
 * this engine already:
 *
 *  1. WALL-TOP VERTICES EXIST inside the island — the 0.140 m measurement.
 *  2. THEY ARE INDEXED. Positions alone are inert: `WorldColliders` hands
 *     Rapier `(positions, indices)`, so vertices no triangle references are a
 *     wall you can see and drive through.
 *  3. A TRIANGLE SPANS MORE THAN A WHEEL RADIUS vertically. This is the whole
 *     argument of ISLAND_WALL_RISE_M — at pavement height the wheel meets a
 *     ramp, and `WorldColliderSet.sidewalks` is documented „12 cm,
 *     drivable-over per vehicle harness". The bound is `WHEEL_RADIUS` from
 *     vehicle/tuning, not a literal, so retuning the car re-asks the question.
 *  4. THE WALL IS CLOSED. The OUTER kerb of a ring is deliberately broken at
 *     every mouth; if that same mouth logic ever reached the island, the ring
 *     would keep four inviting gaps aimed straight down the arms — the exact
 *     line the founder drove. Gaps are measured in degrees at the island's own
 *     radius and converted to metres, so „closed" means closed to a CAR.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorldGeometry } from "../buildWorldGeometry";
import { analyzeNetwork } from "../network";
import { analyzeRoundabouts, ISLAND_KERB_BAND_M, ISLAND_WALL_RISE_M } from "../roundabout";
import { SIDEWALK_TOP_Y } from "../constants";
import { WHEEL_RADIUS } from "../../../vehicle/tuning";
import { assertDistrict, type District } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "public/world");

/** Every shipped district that declares a roundabout. */
function ringDistricts(): { id: string; district: District }[] {
  const out: { id: string; district: District }[] = [];
  for (const file of fs.readdirSync(WORLD_DIR)) {
    if (!file.endsWith(".json")) continue;
    const district = assertDistrict(
      JSON.parse(fs.readFileSync(path.join(WORLD_DIR, file), "utf8")),
    );
    if ((district.roundabouts ?? []).length > 0) out.push({ id: file.replace(/\.json$/, ""), district });
  }
  return out;
}

const RING_DISTRICTS = ringDistricts();
/** The top of the planter wall — what a wall-top vertex has to reach. */
const WALL_TOP_Y = SIDEWALK_TOP_Y + ISLAND_WALL_RISE_M;
/** Anything above the pavement lip is wall rather than kerb. */
const WALL_BAND_FLOOR_Y = SIDEWALK_TOP_Y + ISLAND_WALL_RISE_M * 0.5;
/** A gap a car could aim through. Narrower than a car is still a wall. */
const CAR_WIDTH_M = 1.8;

describe("the central island is a collider a car cannot mount", () => {
  it("finds the ring maps at all", () => {
    expect(RING_DISTRICTS.length).toBeGreaterThanOrEqual(5);
    expect(RING_DISTRICTS.map((r) => r.id)).toContain("rb-mini-v1");
  });

  for (const { id, district } of RING_DISTRICTS) {
    it(`${id}: every island it resolves is a closed, indexed wall`, () => {
      const rings = analyzeRoundabouts(district, analyzeNetwork(district));
      expect(rings.length).toBeGreaterThan(0);
      const world = buildWorldGeometry(district, { seed: 7 });
      const { positions, indices } = world.colliders.sidewalks;

      for (const ring of rings) {
        // A refused island draws nothing on purpose (d2-v1: an edge runs
        // through the interior). It must SAY so rather than be silently flat.
        if (ring.islandRadiusM === null) {
          expect(ring.refusedBecause, `${id}/${ring.id} refused without a reason`).toBeTruthy();
          continue;
        }
        const rIsland = ring.islandRadiusM;
        const [cx, cy] = ring.centre;
        const radiusOf = (v: number): number =>
          Math.hypot(positions[v * 3]! - cx, -positions[v * 3 + 2]! - cy);
        // The wall face stands at the island rim; the band is its width inward.
        const onWallBand = (v: number): boolean => {
          const r = radiusOf(v);
          return r <= rIsland + 1e-3 && r >= rIsland - ISLAND_KERB_BAND_M - 1e-3;
        };
        const isWallTop = (v: number): boolean =>
          onWallBand(v) && positions[v * 3 + 1]! >= WALL_BAND_FLOOR_Y;

        // (1) the wall exists at all, and reaches its documented top.
        let wallTopVerts = 0;
        let highest = -Infinity;
        for (let v = 0; v * 3 + 2 < positions.length; v++) {
          if (!onWallBand(v)) continue;
          highest = Math.max(highest, positions[v * 3 + 1]!);
          if (isWallTop(v)) wallTopVerts++;
        }
        expect(wallTopVerts, `${id}/${ring.id}: no wall-top collider vertices`).toBeGreaterThan(0);
        expect(highest).toBeCloseTo(WALL_TOP_Y, 6);

        // (2)+(3) triangles reference those vertices, and at least one face per
        // degree of arc rises past a wheel radius. Gaps are collected on the
        // vertical faces only — the rim cap lies flat and stops nothing.
        const faceAtDeg = new Array<number>(360).fill(0);
        let indexedWallTris = 0;
        for (let t = 0; t + 2 < indices.length; t += 3) {
          const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
          if (!tri.some(isWallTop)) continue;
          indexedWallTris++;
          const ys = tri.map((v) => positions[v * 3 + 1]!);
          if (Math.max(...ys) - Math.min(...ys) <= WHEEL_RADIUS) continue;
          for (const v of tri) {
            const bearing = Math.atan2(-positions[v * 3 + 2]! - cy, positions[v * 3]! - cx);
            faceAtDeg[((Math.round((bearing * 180) / Math.PI) % 360) + 360) % 360]!++;
          }
        }
        expect(
          indexedWallTris,
          `${id}/${ring.id}: wall vertices exist but no triangle indexes them — Rapier sees nothing`,
        ).toBeGreaterThan(0);

        // (4) closed all the way round, measured as a chord a car could use.
        // Scanned twice round so a gap straddling 0° is counted once, whole;
        // clamped at 360 so „no wall anywhere" reports a full circle and not
        // the length of the double scan.
        let longestGapDeg = 0;
        let run = 0;
        for (let k = 0; k < 720; k++) {
          if (faceAtDeg[k % 360] === 0) {
            run++;
            longestGapDeg = Math.min(360, Math.max(longestGapDeg, run));
          } else {
            run = 0;
          }
        }
        expect(longestGapDeg, `${id}/${ring.id}: wall face missing all the way round`).toBeLessThan(360);
        const gapM = 2 * rIsland * Math.sin((longestGapDeg * Math.PI) / 360);
        expect(
          gapM,
          `${id}/${ring.id}: a ${longestGapDeg}° hole in the island wall is ${gapM.toFixed(2)} m wide — a car aims through it`,
        ).toBeLessThan(CAR_WIDTH_M);
      }
    });
  }
});
