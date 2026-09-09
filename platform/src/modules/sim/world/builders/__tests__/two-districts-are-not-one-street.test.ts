/**
 * TWO MAPS WITH THE SAME ROAD SHAPE MUST NOT BE THE SAME STREET.
 *
 * THE FINDING: `sc-junction-stop:5d3cc55e` (major) — „separately-named junction
 * lessons render as one and the same route", filed on
 * `.audit-frames/sweep161/sc-junction-stop/pc-right/04-t206s.png`.
 *
 * THE MECHANISM, MEASURED before it was believed. `buildWorldGeometry` seeded
 * `buildProps` from ONE constant (`DEFAULT_SEED`) for all 105 committed
 * districts, and every procedural dressing pass in the product — trees,
 * streetlights, billboards, utility poles, the B65 furniture — draws its jitter
 * and its species from that one stream in a fixed order. So two districts whose
 * road network has the same shape were dressed identically. On the five
 * committed T-junctions the first three tree stations came out at cross-offset
 * z = 17.18 / −17.46 / 17.34 on tj-stop-v1, tj-emerge-v1 AND tj-scan-v1, and
 * z = 14.44 / −14.04 / −14.07 on tj-rhr-v1 AND tj-occluded-v1 — the same street,
 * translated in x by the difference in arm length. tj-stop-v1 and tj-emerge-v1
 * planted 83 trees each.
 *
 * This is the world rim's wave-8 defect one layer over (`worldRim.ts`: the mass
 * id carried no district, so two maps with one bounds box shared their whole
 * frontage), and it has the same cure: put the ONE term that distinguishes the
 * maps into the key.
 *
 * WHAT THIS FILE ASSERTS, in the two halves that can each fail alone:
 *   §1 the keys never collide across the committed catalogue — a collision
 *      silently restores the defect for that pair and nothing else would say so;
 *   §2 the planting of two same-shaped maps genuinely differs, WITH A CONTROL
 *      that re-runs the same comparison on a forced shared seed and requires it
 *      to be identical. Without the control this file passes on a corpus that
 *      happens to have no trees.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorldGeometry, DEFAULT_SEED, propSeedFor } from "../buildWorldGeometry";
import { assertDistrict, type District } from "../../types";

const WORLD_DIR = path.join(process.cwd(), "..", "content", "world");

function load(id: string): District {
  return assertDistrict(JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")));
}

/** The committed T-junction family — same archetype, same class, same lane
 *  count; they differ only in arm lengths and in what the lesson does there. */
const T_JUNCTIONS = ["tj-stop-v1", "tj-emerge-v1", "tj-rhr-v1", "tj-scan-v1", "tj-occluded-v1"];

/**
 * The planting SHAPE, with the arm-length shift taken out: the cross-offsets
 * (world z) of the first trees IN GENERATION ORDER, to the centimetre.
 *
 * Cross-offset and not position, because two maps of different length can still
 * be „the same street translated" and raw positions would miss exactly that —
 * which is the form the defect took (the x column shifted by the arm-length
 * delta while the z column matched digit for digit). Generation order and not
 * sorted, because the shared stream is what is being tested: a sorted multiset
 * also folds in the count, which arm length moves on its own.
 */
const SHAPE_WINDOW = 11;

function plantingShape(district: District, seed?: number): string {
  const world = buildWorldGeometry(district, seed === undefined ? {} : { seed });
  return world.trees
    .slice(0, SHAPE_WINDOW)
    .map((t) => t.position[2].toFixed(2))
    .join("|");
}

describe("§1 the seed key is this district's own, and no two collide", () => {
  const ALL = fs
    .readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("finds the committed catalogue at all", () => {
    expect(ALL.length).toBeGreaterThan(80);
  });

  it("every district gets a distinct prop seed", () => {
    const bySeed = new Map<number, string[]>();
    for (const id of ALL) {
      const seed = propSeedFor(load(id));
      bySeed.set(seed, [...(bySeed.get(seed) ?? []), id]);
    }
    const collisions = [...bySeed.values()].filter((ids) => ids.length > 1);
    expect(collisions).toEqual([]);
    // …and it is genuinely keyed, not a constant wearing a function's name.
    expect(bySeed.size).toBe(ALL.length);
    expect([...bySeed.keys()].some((s) => s === DEFAULT_SEED)).toBe(false);
  });
});

describe("§2 same-shaped junctions are dressed as different places", () => {
  const shapes = T_JUNCTIONS.map((id) => ({ id, shape: plantingShape(load(id)) }));

  it("the control: on ONE shared seed these maps really were one street", () => {
    // Non-vacuity. `DEFAULT_SEED` is exactly what shipped before the repair, so
    // this arm reproduces the finding rather than asserting it from memory.
    const shared = T_JUNCTIONS.map((id) => plantingShape(load(id), DEFAULT_SEED));
    const pairsIdentical = shared.filter((s, i) => shared.some((o, j) => j !== i && o === s));
    expect(
      pairsIdentical.length,
      "the control seed no longer reproduces the shared planting — this file has stopped testing anything",
    ).toBeGreaterThan(0);
  });

  for (let i = 0; i < T_JUNCTIONS.length; i++) {
    for (let j = i + 1; j < T_JUNCTIONS.length; j++) {
      it(`${T_JUNCTIONS[i]} and ${T_JUNCTIONS[j]} do not share a planting`, () => {
        expect(shapes[i].shape).not.toBe(shapes[j].shape);
      });
    }
  }
}, 120_000);
