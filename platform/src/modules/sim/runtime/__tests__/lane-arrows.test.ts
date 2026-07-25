/**
 * The М10 lane-intent channel (audit M-17), end to end on the REAL committed
 * ln-arrows-v1 — the district the SN-04 lesson is built on.
 *
 * The arrows were authored, painted and taught long before anything graded
 * them: `meta.scenario.laneArrows` reached the marking builder and stopped
 * there. This battery pins the other half of that data's journey — approach
 * lane → committed lane fix → `tick.laneArrow` — including the innocence
 * cases, because a marking channel that over-reports would convict correct
 * driving on every unmarked street in the world.
 *
 * Geometry (world/__tests__/ln-arrows-districts.test.ts is the authority):
 * 3+3 boulevard on x = 0, y ∈ [−150, 100]; northbound lane centers
 * x = 20.31 / 12.19 / 4.06 for laneId 0 / 1 / 2 carrying „само надясно" /
 * „само направо" / „само наляво"; the arrow span is 30..150 m along ln-e-s.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime, parseDistrict, type District } from "..";
import type { SimTick } from "../../rules/types";
import { drive, edgeDrivePath } from "./helpers";

function loadWorld(id: string): District {
  const p = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    `../../../../../../content/world/${id}.json`,
  );
  return parseDistrict(JSON.parse(readFileSync(p, "utf-8")));
}

/** Northbound lane centers of ln-arrows-v1, by laneId (0 = curb lane). */
const LANE_CENTER_M = [20.31, 12.19, 4.06];

/** Ticks driving north up ln-e-s in `laneId`'s center, s = 40 → 140. */
function driveLane(district: District, laneId: number): SimTick[] {
  const rt = createWorldRuntime(district);
  const edge = district.roads.edges.find((e) => e.id === "ln-e-s");
  if (!edge) throw new Error("fixture: ln-e-s missing from ln-arrows-v1");
  // Right of travel = away from the centerline on the northbound bank, which
  // is where the authored centerM offsets are measured.
  return drive(rt, edgeDrivePath(edge, 40, 140, 5, LANE_CENTER_M[laneId])).ticks;
}

describe("М10 lane arrows reach the tick (M-17)", () => {
  it("each approach lane reports its own authored glyph", () => {
    const seen = [0, 1, 2].map(
      (laneId) => new Set(driveLane(loadWorld("ln-arrows-v1"), laneId).map((t) => t.laneArrow)),
    );
    expect(seen[0]).toContain("right"); // „само надясно"
    expect(seen[1]).toContain("through"); // „само направо"
    expect(seen[2]).toContain("left"); // „само наляво"
    // No lane ever reports a NEIGHBOUR's glyph — the whole grade hangs on it.
    expect(seen[0].has("left")).toBe(false);
    expect(seen[1].has("left")).toBe(false);
    expect(seen[2].has("right")).toBe(false);
  });

  it("the lane fix agrees with the arrow it is handed", () => {
    // Guards the mapping, not just the presence: an off-by-one between the
    // painter's centerM and the locator's laneId would silently grade the
    // student for the lane beside the one they are in.
    const ticks = driveLane(loadWorld("ln-arrows-v1"), 1).filter((t) => t.laneArrow !== undefined);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) expect(t.laneId).toBe(1);
  });

  it("a district with no authored arrows never sets the channel", () => {
    // The absent-marking contract: every shipped map without laneArrows must
    // add nothing to the tick, so no existing drive can change verdict.
    const district = loadWorld("ln-v1");
    const edge = district.roads.edges[0];
    const rt = createWorldRuntime(district);
    const ticks = drive(rt, edgeDrivePath(edge, 5, Math.min(80, edge.length - 5), 5, 4.06)).ticks;
    expect(ticks.every((t) => t.laneArrow === undefined)).toBe(true);
  });

  it("the roundabout's non-directional labels stay unreadable, not guessed", () => {
    // rb-2lane-v1 authors „nearExits"/„farExits" — lane ADVICE, not a mandatory
    // direction set. The rule engine must never infer a permitted turn from a
    // glyph it does not understand.
    const district = loadWorld("rb-2lane-v1");
    const edge = district.roads.edges.find((e) => e.id === "rb2-e-arm-s");
    if (!edge) throw new Error("fixture: rb2-e-arm-s missing from rb-2lane-v1");
    const rt = createWorldRuntime(district);
    const ticks = drive(rt, edgeDrivePath(edge, 35, 85, 5, 12.19)).ticks;
    expect(ticks.every((t) => t.laneArrow === undefined)).toBe(true);
  });
});
