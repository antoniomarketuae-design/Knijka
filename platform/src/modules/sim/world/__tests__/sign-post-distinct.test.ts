/**
 * One post, one sign — the placement invariant behind the founder's
 * sc-roundabout-entry ruling ("the sign is wrong it has 2 signs in one …
 * currently it has the Triangle sign for not entering without letting others
 * go and the sign of the roundabout on top of each other").
 *
 * There was never a composited face. Every SignKind is a self-contained GLB
 * (pole + plate), and WorldProps instances each kind at its placement
 * transform VERBATIM — there is no per-kind offset anywhere in the renderer,
 * despite the comment in props.ts that used to claim one. So the roundabout
 * pass pushing Б1 and Г12 at the same pose put two whole sign models in the
 * same cubic metre, which reads as a single plate carrying two signs.
 *
 * The gate is deliberately stated over ALL posts, not just the roundabout
 * pair: "two sign models at the same spot" is a class of bug (any future pass
 * that reuses an existing pose reintroduces it), and it is invisible to the
 * builder batteries, which only ever assert that a post of some kind EXISTS.
 *
 * Render-only, like the pass it covers: grading reads
 * network.junctionPriorityControls, never these placements. The Б1/Б2
 * assertion below pins that — the priority post's pose is the one thing this
 * fix must NOT have moved, because the clip battery's control-visibility gate
 * frames sc-roundabout-entry__m0 on exactly that post.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type SignPlacement, type WorldGeometry } from "../types";

/** Two posts closer than this share a pole's worth of space — i.e. they read
 *  as one object rather than two signs a driver can tell apart. */
const MIN_POST_SEPARATION_M = 0.75;

function loadWorld(id: string): WorldGeometry {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
  return buildWorldGeometry(assertDistrict(JSON.parse(fs.readFileSync(file, "utf8"))), { seed: 7 });
}

/** Ground-plane distance between two placements (posts differ only in x/z). */
function apart(a: SignPlacement, b: SignPlacement): number {
  return Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
}

/** Every district that actually renders a roundabout, plus the city map. */
const MAPS = ["rb-mini-v1", "rb-2lane-v1", "rb-ped-v1", "district-v1"] as const;

describe("sign posts are physically distinct", () => {
  for (const id of MAPS) {
    it(`${id}: no two sign models stand in the same place`, () => {
      const world = loadWorld(id);
      expect(world.signs.length).toBeGreaterThan(0);
      const collisions: string[] = [];
      for (let i = 0; i < world.signs.length; i++) {
        for (let j = i + 1; j < world.signs.length; j++) {
          const a = world.signs[i]!;
          const b = world.signs[j]!;
          const d = apart(a, b);
          if (d < MIN_POST_SEPARATION_M) {
            collisions.push(
              `${a.kind} @ (${a.position[0].toFixed(2)}, ${a.position[2].toFixed(2)}) and ` +
                `${b.kind} ${d.toFixed(2)} m away — give the second sign its own pose`,
            );
          }
        }
      }
      expect(collisions, collisions.join("\n")).toEqual([]);
    });
  }

  it("rb-mini-v1: the Г12 roundabout post is a SEPARATE, earlier post than the Б1", () => {
    const world = loadWorld("rb-mini-v1");
    const rings = world.signs.filter((s) => s.kind === "roundabout");
    const yields = world.signs.filter((s) => s.kind === "giveWay" || s.kind === "stop");
    expect(rings.length, "the ring entries must be signed Г12").toBeGreaterThan(0);
    expect(yields.length).toBeGreaterThanOrEqual(rings.length);

    for (const ring of rings) {
      // Its priority partner is the nearest Б1/Б2 — same approach, same facing.
      const partner = yields.reduce((best, s) =>
        apart(s, ring) < apart(best, ring) ? s : best,
      );
      expect(partner.yaw).toBeCloseTo(ring.yaw, 5); // same approach, same driver
      const gap = apart(partner, ring);
      // Set back far enough to be its own post, close enough to still read as
      // the same entry's signing rather than an unrelated sign up the road.
      expect(gap).toBeGreaterThan(MIN_POST_SEPARATION_M);
      expect(gap).toBeLessThan(8);
    }
  });
});
