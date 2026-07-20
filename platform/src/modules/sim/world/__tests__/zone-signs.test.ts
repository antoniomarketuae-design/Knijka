/**
 * SIGN-ASSET drop battery — the zone-driven sign pass (builders/zoneSigns.ts).
 *
 * The zone/crossing maps GRADE their spans (ban/rail/curve/surface batteries);
 * this battery proves the world now SHOWS the posts the law implies:
 *  - each authored span places its kind at the span START, right-hand side of
 *    the (geometry-forward) travel direction, facing the approaching driver;
 *  - railCrossing places the full furniture: warning triangle ~50 m ahead,
 *    the Андреевски кръст at the line (5 m before the band), and the barrier
 *    arm on the guarded map only;
 *  - marking-only kinds (М1 solidCenterLine) place NOTHING;
 *  - zones-less districts place NOTHING (the additive contract — their
 *    geometry stays byte-identical, per the existing district batteries).
 *
 * Render-only by design: grading reads the spans, never these placements.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type SignKind, type WorldGeometry } from "../types";

const ZONE_KINDS: readonly SignKind[] = [
  "noOvertaking",
  "noStopping",
  "slippery",
  "curve",
  "railGuarded",
  "railUnguarded",
  "railCross",
  "barrier",
];

function loadWorld(id: string): WorldGeometry {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`${id}.json not found in: ${candidates.join(", ")}`);
  const district = assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
  return buildWorldGeometry(district, { seed: 7 });
}

function zonePosts(world: WorldGeometry) {
  return world.signs.filter((s) => ZONE_KINDS.includes(s.kind));
}

/** All zone maps drive district-north along x=0: the right-hand curb is +x,
 *  the span start at arclength s sits at world z = -s, and facing the
 *  approaching (northbound) driver means yaw 0 (world +Z = district south). */
function expectPost(
  posts: { kind: SignKind; position: [number, number, number]; yaw: number }[],
  kind: SignKind,
  atMeters: number,
) {
  const post = posts.find((p) => p.kind === kind);
  expect(post, `expected a ${kind} post`).toBeDefined();
  expect(post!.position[0]).toBeGreaterThan(0); // right of travel
  expect(post!.position[2]).toBeCloseTo(-atMeters, 1);
  expect(Math.abs(post!.yaw)).toBeLessThan(1e-6);
}

describe("zone-driven sign posts (SIGN-ASSET drop)", () => {
  it("ov-ban-v1: one В24 post at the span start (90 m), right-hand curb", () => {
    const world = loadWorld("ov-ban-v1");
    expect(world.stats.signs.noOvertaking).toBe(1);
    expectPost(zonePosts(world), "noOvertaking", 90);
  });

  it("zone posts on scenario maps carry the lesson-critical scale (doc 62 #6)", () => {
    // The sign IS the lesson on a micro-map — real-size posts read miniature
    // against the 2.5× perceptual road, so scenario maps scale them up.
    const world = loadWorld("ov-ban-v1");
    const post = world.signs.find((s) => s.kind === "noOvertaking")!;
    expect(post.scale).toBeGreaterThanOrEqual(1.3);
    expect(post.scale).toBeLessThanOrEqual(1.6);
  });

  it("pk-ban-v1: one В27 post at the span start (70 m)", () => {
    const world = loadWorld("pk-ban-v1");
    expect(world.stats.signs.noStopping).toBe(1);
    expectPost(zonePosts(world), "noStopping", 70);
  });

  it("sp-curve-v1: one А1 post at the arc start (220 m) — the shipped warning-bend face", () => {
    const world = loadWorld("sp-curve-v1");
    expect(world.stats.signs.curve).toBe(1);
    expectPost(zonePosts(world), "curve", 220);
  });

  it("sp-curve-v1: the В26-50 companion plate the copy promises stands beside the А1 (doc 62 #36)", () => {
    // „знак А1 с табела „50"" — the advisory 50 pairs the shipped limit50
    // face with the warning: 2 m before it, staggered further off the curb so
    // neither occludes the other on the straight approach. Placed ONLY when
    // the authored advisory matches the shipped face (50) — mw-exit-v1's
    // advisory-60 ramp stays А1-only (the В26-60 face is a reported asset
    // need, and a „50" post there would lie).
    const world = loadWorld("sp-curve-v1");
    const a1 = world.signs.find((s) => s.kind === "curve")!;
    const plates = world.signs.filter(
      (s) => s.kind === "limit50" && Math.abs(s.position[2] - -218) < 0.5,
    );
    expect(plates).toHaveLength(1);
    const plate = plates[0]!;
    expect(plate.position[0]).toBeGreaterThan(a1.position[0]); // staggered outward
    expect(plate.scale).toBe(a1.scale); // one signed station, one prominence
    // District-entry plates (the shipped generic pass) + the companion.
    expect(world.stats.signs.limit50).toBe(3);

    const mwExit = loadWorld("mw-exit-v1");
    expect(mwExit.stats.signs.curve).toBe(1);
    // No companion on the advisory-60 ramp: only the two generic entry plates.
    expect(mwExit.stats.signs.limit50).toBe(2);
  });

  it("ac-aqua-v1 + ac-ice-v1: one А15 post each at the patch start", () => {
    const aqua = loadWorld("ac-aqua-v1");
    expect(aqua.stats.signs.slippery).toBe(1);
    expectPost(zonePosts(aqua), "slippery", 240);

    const ice = loadWorld("ac-ice-v1");
    expect(ice.stats.signs.slippery).toBe(1);
    expectPost(zonePosts(ice), "slippery", 210);
  });

  it("rx-unguarded-v1: А33-style warning 50 m ahead + the crossbuck at the line, NO barrier", () => {
    const world = loadWorld("rx-unguarded-v1");
    expect(world.stats.signs.railUnguarded).toBe(1);
    expect(world.stats.signs.railCross).toBe(1);
    expect(world.stats.signs.railGuarded).toBe(0);
    expect(world.stats.signs.barrier).toBe(0);
    const posts = zonePosts(world);
    expectPost(posts, "railUnguarded", 100); // band 150 - 50
    expectPost(posts, "railCross", 145); // the graded stop line
  });

  it("rx-guarded-v1: А32-style warning + crossbuck + the barrier arm (static down)", () => {
    const world = loadWorld("rx-guarded-v1");
    expect(world.stats.signs.railGuarded).toBe(1);
    expect(world.stats.signs.railCross).toBe(1);
    expect(world.stats.signs.barrier).toBe(1);
    expect(world.stats.signs.railUnguarded).toBe(0);
    const posts = zonePosts(world);
    expectPost(posts, "railGuarded", 100);
    expectPost(posts, "railCross", 145);
    expectPost(posts, "barrier", 147); // between the line and the band
  });

  it("ov-solid-v1: М1 is marking-only — zero zone posts", () => {
    const world = loadWorld("ov-solid-v1");
    expect(zonePosts(world)).toHaveLength(0);
    for (const kind of ZONE_KINDS) expect(world.stats.signs[kind]).toBe(0);
  });

  it("a zones-less shipped map places zero zone posts (additive contract)", () => {
    const world = loadWorld("ov-crossing-v1");
    expect(zonePosts(world)).toHaveLength(0);
    for (const kind of ZONE_KINDS) expect(world.stats.signs[kind]).toBe(0);
  });

  it("the pass is deterministic (same seed, same stats)", () => {
    const a = loadWorld("rx-guarded-v1");
    const b = loadWorld("rx-guarded-v1");
    expect(b.stats).toEqual(a.stats);
    expect(b.signs).toEqual(a.signs);
  });
});
