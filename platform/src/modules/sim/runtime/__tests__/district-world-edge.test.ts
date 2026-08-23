/**
 * THE DISTRICT'S EDGE — the measure, and the exposure it makes countable.
 *
 * WHAT THIS FILE IS ABOUT, in the founder's terms: a learner can drive off the
 * end of the world. The audit filed the cause in one sentence: *the district
 * has no edge.*
 *
 * THE PROVENANCE, STATED HONESTLY, because the frames are weaker than the
 * geometry. The void photographs
 * (`.audit-frames/proof/frames/sc-junction-rhr__pc-right/`, 04-t070s and
 * 04-t202s) come from a drive its OWN run.log marks BLIND — the ribbon was on
 * 63 of 137 moving samples and the log says «THIS DRIVE WAS NOT STEERED» — and
 * the only tracked drive on this map (mobile-right, ribbon 23/23, straightness
 * 0.967) travelled 96.5 m and never came near the rim. What is NOT in doubt is
 * the committed document, and that is what this battery measures: on tj-rhr-v1,
 * tj-stop-v1 and tj-emerge-v1 the graded node sits at (0, 0) and `maxY` IS 0.
 *
 * `districtWorldEdge` / `worldEdgeClearanceM` (runtime/district.ts) are that
 * edge. This battery does two jobs, and the second is the one that matters:
 *
 *   1. the arithmetic — the rectangle IS the ground quad `terrain.ts` builds,
 *      the sign convention is right, a corner overshoot is Euclidean, and an
 *      inverted box (which `parseDistrict` accepts on a measurement) does not
 *      make the whole world read as outside;
 *
 *   2. THE CORPUS MEASUREMENT — how close the drivable network of every
 *      committed district comes to that rectangle. This is the defect, stated
 *      as a number that a re-cut map can move and a test can catch. It also
 *      pins the OTHER half of the duty, the one a consumer will lean on: every
 *      pose a lawful drive can occupy — every centreline vertex, every spawn
 *      point — is strictly INSIDE, so an ending wired to this measure cannot
 *      fire on a student who is still on the road.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { districtWorldEdge, parseDistrict, worldEdgeClearanceM, type District } from "../district";
import { TERRAIN_MARGIN_M } from "../../world/builders/constants";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");

function loadDistrict(name: string): District {
  return parseDistrict(JSON.parse(readFileSync(path.join(WORLD_DIR, `${name}.json`), "utf8")));
}

function loadCorpus(): Array<{ file: string; district: District }> {
  return readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, raw: JSON.parse(readFileSync(path.join(WORLD_DIR, f), "utf8")) as unknown }))
    .filter(({ raw }) => (raw as { format?: string }).format === "district-v1")
    .map(({ file, raw }) => ({ file, district: parseDistrict(raw) }));
}

describe("districtWorldEdge — the rectangle past which nothing is drawn", () => {
  it("is the declared box padded by the ground quad's own margin", () => {
    const d = loadDistrict("tj-rhr-v1");
    const b = d.meta.boundsLocalMeters;
    // The relationship, so the two cannot drift: `terrain.ts` builds its quad
    // from exactly these four expressions.
    expect(districtWorldEdge(d)).toEqual({
      minX: b.minX - TERRAIN_MARGIN_M,
      minY: b.minY - TERRAIN_MARGIN_M,
      maxX: b.maxX + TERRAIN_MARGIN_M,
      maxY: b.maxY + TERRAIN_MARGIN_M,
    });
  });

  /**
   * …and the same rectangle in literal metres, because "it equals a formula"
   * is true of a formula that has quietly changed. tj-rhr-v1's box is
   * (−150, −120) … (150, 0); at TERRAIN_MARGIN_M = 60 the world is 420 × 240 m.
   * If the terrain margin is ever retuned this line fails, which is the point:
   * the size of the world is not something to change without noticing.
   */
  it("is 420 x 240 m on tj-rhr-v1 today", () => {
    expect(districtWorldEdge(loadDistrict("tj-rhr-v1"))).toEqual({
      minX: -210,
      minY: -180,
      maxX: 210,
      maxY: 60,
    });
  });

  /**
   * `parseDistrict` accepts an inverted box on a measurement (323/323 located
   * on district-v1 — see district-parse.test.ts). Padding one literally would
   * give a rectangle of negative span on which EVERY pose reads as outside:
   * a false alarm on a document the parser has already ruled harmless.
   */
  it("normalises an inverted box instead of inverting the world", () => {
    const upright = loadDistrict("tj-rhr-v1");
    const inverted: District = {
      ...upright,
      meta: { ...upright.meta, boundsLocalMeters: { minX: 150, minY: 0, maxX: -150, maxY: -120 } },
    };
    expect(districtWorldEdge(inverted)).toEqual(districtWorldEdge(upright));
    // …and the junction at the middle of that map still reads as inside.
    expect(worldEdgeClearanceM(inverted, 0, 0)).toBeGreaterThan(0);
  });
});

describe("worldEdgeClearanceM — the signed measure", () => {
  const d = () => loadDistrict("tj-rhr-v1");

  it("is positive inside, zero on the rim, negative past it", () => {
    expect(worldEdgeClearanceM(d(), 0, 59.9)).toBeCloseTo(0.1, 6);
    expect(worldEdgeClearanceM(d(), 0, 60)).toBe(0);
    expect(worldEdgeClearanceM(d(), 0, 60.1)).toBeCloseTo(-0.1, 6);
  });

  it("reports the distance to the NEAREST rim, not to one axis", () => {
    // (0, 0) is 60 m from the north rim, 180 m from the south, 210 m from
    // either side. The answer is the north one.
    expect(worldEdgeClearanceM(d(), 0, 0)).toBe(60);
    // Near the north-east corner: 10 m from the east rim beats 20 m from north.
    expect(worldEdgeClearanceM(d(), 200, 40)).toBe(10);
  });

  /**
   * A corner overshoot is EUCLIDEAN. Per-axis (`Math.max`) would report 30 m
   * for a car 30 m past both rims, which understates how far outside it is by
   * 12.4 m — and a warning distance that under-reports at exactly the diagonal
   * is a warning that arrives late where the map is smallest.
   */
  it("measures a corner overshoot as a distance, not as an axis", () => {
    expect(worldEdgeClearanceM(d(), 240, 90)).toBeCloseTo(-Math.hypot(30, 30), 6);
    expect(worldEdgeClearanceM(d(), 240, 90)).toBeLessThan(-30);
  });

  /**
   * THE FINDING, AS A NUMBER. sc-junction-rhr / sc-junction-stop /
   * sc-junction-scan all grade the node `tj-n-c` at (0, 0), and the box's
   * `maxY` IS 0 — so a student who does not turn drives straight out of the
   * world after exactly one terrain margin. That is the whole of
   * `.audit-frames/proof/frames/sc-junction-rhr__pc-right/04-t070s.png`.
   */
  it("gives the graded T-junction exactly one terrain margin of world to the north", () => {
    for (const name of ["tj-rhr-v1", "tj-stop-v1"]) {
      const map = loadDistrict(name);
      const junction = map.intersections[0];
      expect(junction.id).toBe("tj-n-c");
      expect(worldEdgeClearanceM(map, junction.x, junction.y)).toBe(TERRAIN_MARGIN_M);
      // 12 m of straight-ahead driving past the rim — the pose the frames show.
      expect(worldEdgeClearanceM(map, junction.x, junction.y + TERRAIN_MARGIN_M + 12)).toBe(-12);
    }
  });
});

describe("the corpus — how close every shipped world comes to its own edge", () => {
  /** Closest approach of any drivable centreline vertex to the rim, m. */
  function closestApproachM(d: District): number {
    let min = Number.POSITIVE_INFINITY;
    for (const edge of d.roads.edges) {
      for (const [x, y] of edge.geometry) {
        const c = worldEdgeClearanceM(d, x, y);
        if (c < min) min = c;
      }
    }
    return min;
  }

  /**
   * THE DEFECT, COUNTED. Not one committed district buffers its road network
   * away from the end of the world: the closest a centreline comes to the rim
   * is 60 m on 64 of the 105 maps (the declared box IS the network's bounding
   * box, so the terrain margin is the entire world past the last road) and
   * never more than 78.125 m anywhere. Every learner on every map is between
   * 60 and 79 metres of straight-ahead driving from a place that does not
   * exist — and nothing draws a fence there, nothing says a word, nothing
   * turns him round.
   *
   * The band is asserted from BOTH sides on purpose. The upper bound is the
   * defect (no map escapes it). The lower bound is the reassurance a consumer
   * needs before it draws anything at that line: no committed road runs closer
   * to the rim than one terrain margin, so a barrier or a warning placed
   * inside that margin cannot land on top of a carriageway.
   */
  it("no committed district holds its roads further than 79 m from the rim", () => {
    const corpus = loadCorpus();
    expect(corpus.length).toBeGreaterThan(90);

    let atExactlyOneMargin = 0;
    let worst = 0;
    for (const { file, district } of corpus) {
      const approach = closestApproachM(district);
      expect(approach, `${file} has roads OUTSIDE its own world`).toBeGreaterThan(0);
      expect(approach, `${file} runs closer to the rim than one terrain margin`)
        .toBeGreaterThanOrEqual(TERRAIN_MARGIN_M);
      expect(approach, `${file} finally buffers its network away from the rim`).toBeLessThan(79);
      if (approach === TERRAIN_MARGIN_M) atExactlyOneMargin += 1;
      if (approach > worst) worst = approach;
    }
    expect(atExactlyOneMargin).toBeGreaterThanOrEqual(60);
    expect(worst).toBeCloseTo(78.125, 3);
  });

  /**
   * THE OTHER HALF OF THE DUTY. A measure that a lesson-ending will be wired
   * to has to be provably silent on every lawful pose, or the first thing it
   * does is end a drive that was going fine. Every authored spawn point — the
   * places the product itself puts the car — has a clear margin, and so does
   * every centreline vertex (asserted above). Nothing about a legal drive
   * reads as "outside the world".
   */
  it("every authored spawn point is well inside its own world", () => {
    const corpus = loadCorpus();
    let tightest = Number.POSITIVE_INFINITY;
    let spawns = 0;
    for (const { file, district } of corpus) {
      for (const s of district.spawnPoints) {
        const c = worldEdgeClearanceM(district, s.x, s.y);
        expect(c, `${file}/${s.id} spawns outside the authored world`).toBeGreaterThan(0);
        spawns += 1;
        if (c < tightest) tightest = c;
      }
    }
    expect(spawns).toBeGreaterThan(200);
    // The tightest authored spawn still has most of a terrain margin in hand.
    expect(tightest).toBeGreaterThan(TERRAIN_MARGIN_M * 0.9);
  });
});
