/**
 * Focused test for the LC lane-control gantry (Half-B reels): the pure meta
 * reader `laneGantryOf`, and that the shipped lc-gantry-v1 district carries a
 * well-formed laneGantry block while ordinary maps do not (additive/inert).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { laneGantryOf } from "../components/LaneSignalGantry";
import { assertDistrict, type District } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

function loadDistrict(id: string): { meta?: { scenario?: unknown } } {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

function loadRealDistrict(id: string): District {
  return assertDistrict(
    JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")),
  );
}

describe("laneGantryOf", () => {
  it("reads a well-formed gantry block off lc-gantry-v1's scenario meta", () => {
    const g = laneGantryOf(loadDistrict("lc-gantry-v1"));
    expect(g).not.toBeNull();
    expect(typeof g!.y).toBe("number");
    expect(g!.openLaneX).toBe(6);
    expect(g!.closedLaneX).toBe(-6);
    // The public copy the browser loads must carry it too (dual-write).
    const pub = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "platform", "public", "world", "lc-gantry-v1.json"), "utf-8"),
    );
    expect(laneGantryOf(pub)).not.toBeNull();
  });

  it("returns null for districts without a gantry (inert everywhere else)", () => {
    expect(laneGantryOf(loadDistrict("ov-solid-v1"))).toBeNull();
    expect(laneGantryOf(loadDistrict("hz-obstacle-v1"))).toBeNull();
    expect(laneGantryOf({})).toBeNull();
    expect(laneGantryOf({ meta: {} })).toBeNull();
    expect(laneGantryOf({ meta: { scenario: {} } })).toBeNull();
  });
});

describe("lc-gantry-v1 roadside-tree suppression (clean overhead-gantry shot)", () => {
  it("plants ZERO procedural roadside trees so no canopy occludes the gantry", () => {
    const world = buildWorldGeometry(loadRealDistrict("lc-gantry-v1"));
    expect(world.trees).toHaveLength(0);
    expect(world.stats.trees).toBe(0);
  });

  it("the suppression is the meta flag's doing — dropping it restores the trees", () => {
    // Prove the empty tree list is caused by meta.scenario.suppressRoadsideTrees,
    // not by the map having no tree-bearing edges: the same secondary
    // carriageways plant an arterial tree row once the opt-out is removed.
    const district = loadRealDistrict("lc-gantry-v1");
    const scenario = (district.meta as { scenario?: Record<string, unknown> }).scenario;
    expect(scenario?.suppressRoadsideTrees).toBe(true); // guards the fixture
    delete scenario!.suppressRoadsideTrees;
    const world = buildWorldGeometry(district);
    expect(world.trees.length).toBeGreaterThan(0);
  });
});
