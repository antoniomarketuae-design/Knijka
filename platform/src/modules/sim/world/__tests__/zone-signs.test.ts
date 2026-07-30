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
  it("ov-ban-v1: a В24 at the span start (90 m) plus one in-zone repeat, right-hand curb", () => {
    const world = loadWorld("ov-ban-v1");
    // Entry post + one repeat (ZONE_SIGN_REPEAT_M into the span) so the ban
    // stays in frame at the overtake fault deep in the zone (doc 66 R2).
    expect(world.stats.signs.noOvertaking).toBe(2);
    const posts = zonePosts(world).filter((p) => p.kind === "noOvertaking");
    expectPost(posts, "noOvertaking", 90); // entry (the first post)
    const repeat = posts.find((p) => Math.abs(p.position[2] - -170) < 1);
    expect(repeat, "expected a В24 repeat ~170 m in").toBeDefined();
    expect(repeat!.position[0]).toBeGreaterThan(0); // right of travel, like the entry
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

  it("sp-curve-v1: one А1 post 60 m BEFORE the arc (doc 86 T14) — the shipped warning-bend face", () => {
    // RE-BASELINED 220 -> 160 by doc 86 T14. The post used to stand at the
    // span START, i.e. at the first metre of the corner it warns about, while
    // the graded „slow down BEFORE" gate (sc-acq-before y=225 and friends) sits
    // UPSTREAM of it — so the only cue the world offered arrived after the
    // grading window had closed. That is why item 36 reads as „no signs on the
    // map at all" even though the А1 does build. railCrossing already had the
    // advance (RAIL_WARNING_AHEAD_M); water, ice and curve did not.
    const world = loadWorld("sp-curve-v1");
    expect(world.stats.signs.curve).toBe(1);
    expectPost(zonePosts(world), "curve", 160);
  });

  it("sp-curve-v1: the В26-50 companion plate the copy promises stands beside the А1 (doc 62 #36)", () => {
    // „знак А1 с табела „50"" — the advisory pairs a В26 face with the warning:
    // 2 m before it, staggered further off the curb so neither occludes the
    // other on the straight approach. It states `advisoryKmh`, which is exactly
    // the number rules/engine.ts:997 grades SPEED_TOO_FAST_FOR_CURVE against
    // inside the span (tick.curveAdvisoryKmh) — a referent, not a second limit.
    // Doc 86 T4 grew the face set from one numeral to thirteen, so an advisory
    // of 30/40/60 is now signed too instead of being silently dropped.
    const world = loadWorld("sp-curve-v1");
    const a1 = world.signs.find((s) => s.kind === "curve")!;
    const plates = world.signs.filter(
      (s) => s.kind === "limit50" && Math.abs(s.position[2] - -158) < 0.5,
    );
    expect(plates).toHaveLength(1);
    const plate = plates[0]!;
    expect(plate.speedKmh).toBe(50);
    expect(plate.position[0]).toBeGreaterThan(a1.position[0]); // staggered outward
    expect(plate.scale).toBe(a1.scale); // one signed station, one prominence
    // The road itself is 90, so its two entry plates are В26-90 now — the
    // „50" on a 90 km/h road was doc 86 T4's headline lie. Only the curve
    // companion states 50, and only inside the span that grades 50.
    expect(world.stats.signs.limit50).toBe(1);
    expect(world.stats.signs.limit90).toBe(2);

    const mwExit = loadWorld("mw-exit-v1");
    expect(mwExit.stats.signs.curve).toBe(1);
    // The ramp's advisory-60 curve starts at metre 0 of its own edge, so there
    // is no road left to stand an ADVANCE plate on; a plate clamped to metre 1
    // would sit in the junction mouth beside a different road with a different
    // limit — T4's failure mode re-created by a warning sign. А1-only.
    expect(mwExit.stats.signs.limit60).toBe(0);
  });

  it("ac-aqua-v1 + ac-ice-v1: one А15 post each, 60 m BEFORE the patch (doc 86 T14)", () => {
    // RE-BASELINED 240 -> 180 and 210 -> 150: see the sp-curve note above. The
    // graded gates sit at y=225 (aqua) and y=190 (ice), so the warning now
    // arrives while the student still has road to slow down on.
    const aqua = loadWorld("ac-aqua-v1");
    expect(aqua.stats.signs.slippery).toBe(1);
    expectPost(zonePosts(aqua), "slippery", 180);

    const ice = loadWorld("ac-ice-v1");
    expect(ice.stats.signs.slippery).toBe(1);
    expectPost(zonePosts(ice), "slippery", 150);
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
