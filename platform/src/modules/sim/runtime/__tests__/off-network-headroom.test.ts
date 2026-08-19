/**
 * THE OFF-ROAD CHANNEL'S HEADROOM — O22, 2026-08-19.
 *
 * WHAT THIS FILE IS ABOUT. `edgeId === null` is the runtime's only statement of
 * „this car is nowhere in the authored world", produced by exactly one rule:
 * further than OFF_ROAD_DISTANCE_M (30 m) from every road centreline
 * (`locator.ts` `chooseEdge`). Three separate consumers read it as that
 * statement — the C1 lane-change basis (`rules/engine.ts`), the finish module's
 * off-network ending (`lessons/finish.ts` O22) and the HUD locate — and until
 * this file nobody had measured how much room the shipped world actually leaves
 * under the threshold.
 *
 * IT LOOKS GENEROUS AND IT IS NOT. Thirty metres is nearly four lane pitches at
 * the 2.5× perceptual scale, but a two-way arterial puts `lanesPerDir` lanes on
 * EACH side of its centreline and then adds a 4 m kerbside parking band on top,
 * so the outermost legal pose on `district-v1`'s five-lane бул. Свети Климент
 * Охридски sits 29.355 m out — 0.645 m of margin. A car parked legally at that
 * kerb is two thirds of a metre from being declared out of the world.
 *
 * BOTH DIRECTIONS ARE PINNED, because either one alone is the other crime:
 *  · NOTHING DRIVABLE MAY READ OFF-ROAD. This is the acquitting half, and it is
 *    the one an off-network ENDING rests on: if any lane centre or kerb band on
 *    any shipped district read null, a drive could be closed on a student
 *    sitting on real asphalt — the founder's own complaint, manufactured by an
 *    instrument. The sweep is every drawn ribbon on all 105 districts.
 *  · AND THE MARGIN IS A RATCHET. A district authored one metre wider than that
 *    boulevard would not fail anything today: it would silently stop resolving
 *    an edge on its own kerb band, and with the edge goes `laneCount` (→ 1),
 *    `maxSpeedKmh` (→ the district default), `wrongWay` (→ false), the М10 lane
 *    arrow and every authored ban / paint / rail / curve span. Lane grading
 *    would switch itself off and report nothing. The ceiling below is what turns
 *    that into a red test.
 *
 * The threshold itself is deliberately not moved by this lane: it lives in
 * `spatial.ts` and raising it would move grading on every district at once.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeNetwork } from "../../world/builders/network";
import { assertDistrict, type District } from "../../world/types";
import { createWorldRuntime, parseDistrict, type District as RuntimeDistrict } from "..";
import { DistrictIndex, makeEdgeHit, OFF_ROAD_DISTANCE_M } from "../spatial";

const WORLD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world",
);

// TWO VALIDATORS FOR ONE FILE, deliberately. `analyzeNetwork` (the ribbon
// geometry the drivable poses are derived from) takes the WORLD schema;
// `DistrictIndex` and `createWorldRuntime` (the locator under test) take the
// RUNTIME schema. Parsing the same JSON through both is what makes this a
// measurement of the shipped locator against the shipped builder rather than
// against a cast.
const rawCache = new Map<string, unknown>();
function raw(id: string): unknown {
  let j = rawCache.get(id);
  if (j === undefined) {
    j = JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
    rawCache.set(id, j);
  }
  return j;
}

const worldCache = new Map<string, District>();
function load(id: string): District {
  let d = worldCache.get(id);
  if (!d) worldCache.set(id, (d = assertDistrict(raw(id))));
  return d;
}

const rtCache = new Map<string, RuntimeDistrict>();
function loadRuntime(id: string): RuntimeDistrict {
  let d = rtCache.get(id);
  if (!d) rtCache.set(id, (d = parseDistrict(raw(id))));
  return d;
}

function districtIds(): string[] {
  return readdirSync(WORLD)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/**
 * The worst (largest) distance from a DRIVABLE pose to the nearest centreline,
 * and every drivable pose that reads off-road.
 *
 * „Drivable" is the builder's own ribbon, not a `lanes × LANE_WIDTH_M`
 * re-derivation: `halfWidth` includes the kerbside PARKING band, which is where
 * the worst pose lives and which a re-derivation would have thrown away
 * (drivable-surface.test.ts made the same point about the surface predicate).
 * Three pose families are measured separately so a regression names which one
 * moved.
 */
function sweepDrivable(): {
  probes: number;
  worst: Record<string, { m: number; at: string }>;
  offRoad: string[];
} {
  const worst: Record<string, { m: number; at: string }> = {
    "travel-lane-centre": { m: 0, at: "" },
    "parking-band-centre": { m: 0, at: "" },
    "ribbon-edge": { m: 0, at: "" },
  };
  const offRoad: string[] = [];
  let probes = 0;

  for (const id of districtIds()) {
    const d = load(id);
    const index = new DistrictIndex(loadRuntime(id));
    const hit = makeEdgeHit();
    for (const eb of analyzeNetwork(d).edges) {
      if (!eb.line) continue;
      const half = eb.halfWidth;
      const parkingM = eb.parkingM;
      const travelHalf = half - parkingM;
      const lanes = Math.max(1, eb.edge.lanes);
      const laneW = (travelHalf * 2) / lanes;
      const poses: Array<[number, string]> = [];
      for (let L = 0; L < lanes; L++) {
        poses.push([-travelHalf + laneW * (L + 0.5), "travel-lane-centre"]);
      }
      if (parkingM > 0) {
        poses.push(
          [travelHalf + parkingM / 2, "parking-band-centre"],
          [-(travelHalf + parkingM / 2), "parking-band-centre"],
        );
      }
      poses.push([half, "ribbon-edge"], [-half, "ribbon-edge"]);

      for (let i = 1; i < eb.line.length; i++) {
        const [x0, y0] = eb.line[i - 1];
        const [x1, y1] = eb.line[i];
        const segLen = Math.hypot(x1 - x0, y1 - y0);
        if (segLen < 1e-6) continue;
        const nx = (y1 - y0) / segLen;
        const ny = -(x1 - x0) / segLen;
        for (let sM = 0; sM <= segLen; sM += 4) {
          const t = sM / segLen;
          for (const [lat, kind] of poses) {
            const qx = x0 + (x1 - x0) * t + nx * lat;
            const qy = y0 + (y1 - y0) * t + ny * lat;
            probes++;
            if (!index.nearestEdge(qx, qy, OFF_ROAD_DISTANCE_M, hit)) {
              if (offRoad.length < 12) {
                offRoad.push(
                  `${id} ${eb.edge.id} ${kind} @ ${qx.toFixed(1)},${qy.toFixed(1)} half=${half.toFixed(2)}`,
                );
              }
              continue;
            }
            if (hit.distM > worst[kind].m) {
              worst[kind] = {
                m: hit.distM,
                at: `${id} ${eb.edge.id} lanes=${eb.edge.lanes} half=${half.toFixed(2)} @ ${qx.toFixed(1)},${qy.toFixed(1)}`,
              };
            }
          }
        }
      }
    }
  }
  return { probes, worst, offRoad };
}

const SWEEP = sweepDrivable();

describe("nothing a student can legally drive or park on reads off-road", () => {
  it("sweeps the full drivable half-width of every ribbon on all 105 districts", () => {
    // The census total is asserted first, for the reason drivable-surface.test.ts
    // gives about its own: a sweep that silently shrank would still report zero
    // offenders, and „0 problems" from a smaller world is the exact instrument
    // failure this programme has shipped four times. Measured 2026-08-19:
    // 105 districts, 96,908 poses.
    expect(districtIds().length).toBeGreaterThanOrEqual(105);
    expect(SWEEP.probes).toBeGreaterThan(90_000);
    expect(SWEEP.offRoad).toEqual([]);
  });

  it("and neither does any authored spawn point — where lessons SEND a student", () => {
    // Through `createWorldRuntime().locate` rather than the raw index, so this
    // exercises the shipped Locator (hysteresis, heading gate and all) on the
    // one pose every drive actually starts from.
    const offRoad: string[] = [];
    let worst = 0;
    let worstAt = "";
    let count = 0;
    for (const id of districtIds()) {
      const d = loadRuntime(id);
      const rt = createWorldRuntime(d);
      const index = new DistrictIndex(d);
      const hit = makeEdgeHit();
      for (const sp of d.spawnPoints ?? []) {
        count++;
        if (rt.locate({ x: sp.x, y: sp.y }).edgeId === null) offRoad.push(`${id}/${sp.id}`);
        if (index.nearestEdge(sp.x, sp.y, OFF_ROAD_DISTANCE_M, hit) && hit.distM > worst) {
          worst = hit.distM;
          worstAt = `${id}/${sp.id}`;
        }
      }
    }
    expect(count).toBeGreaterThanOrEqual(248);
    expect(offRoad).toEqual([]);
    // Measured: 20.310 m at ln-arrows-v1/ln-spawn-south — 9.69 m of headroom,
    // far more than the drivable surface's worst, because a spawn is authored on
    // a LANE CENTRE while the worst drivable pose is a kerb band.
    expect(worst, `worst spawn was ${worst.toFixed(3)} m at ${worstAt}`).toBeLessThan(21);
  });
});

describe("the margin is a ratchet, not an accident", () => {
  it("pins the worst drivable pose per family, so a wider arterial fails HERE", () => {
    const w = SWEEP.worst;
    const report = Object.entries(w)
      .map(([k, v]) => `${k} ${v.m.toFixed(3)} m @ ${v.at}`)
      .join("\n  ");

    // Measured 2026-08-19. The ceilings are the measured values rounded UP to
    // the next tenth — tight enough that authoring a wider arterial has to be a
    // decision rather than a silent regression, which is the property doc 88 R2
    // stands open against this module for missing elsewhere.
    expect(w["travel-lane-centre"].m, report).toBeLessThanOrEqual(20.4); // 20.313
    expect(w["ribbon-edge"].m, report).toBeLessThanOrEqual(28.7); // 28.607
    expect(w["parking-band-centre"].m, report).toBeLessThanOrEqual(29.4); // 29.355

    // …and the headroom that is actually left, stated as the number it is. This
    // is what OFF_NETWORK_STUCK_S is sized against (lessons/finish.ts O22): the
    // false-refusal exposure of an off-network ending is a band this wide.
    const headroomM = OFF_ROAD_DISTANCE_M - w["parking-band-centre"].m;
    expect(headroomM).toBeGreaterThan(0); // the contract holds today
    expect(headroomM, `headroom is ${headroomM.toFixed(3)} m`).toBeLessThan(1);
  });

  it("the worst pose is a KERB BAND, which a lanes×width derivation would miss", () => {
    // Not decoration: it is why this sweep uses the builder's `halfWidth` and
    // not `lanes × LANE_WIDTH_M`. If the worst pose ever became a travel lane
    // centre instead, the geometry changed shape and the ceilings above are
    // measuring something else.
    const w = SWEEP.worst;
    expect(w["parking-band-centre"].m).toBeGreaterThan(w["travel-lane-centre"].m);
    expect(w["parking-band-centre"].at).toContain("district-v1");
  });
});
