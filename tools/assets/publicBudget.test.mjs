/**
 * The gate for the gate (audit M-28 / M-29).
 *
 * These run inside the ordinary `npx vitest run` step, which is what makes the
 * ceiling real: a commit that puts 200 MB of PNGs back under public/ fails CI
 * in the same place a broken unit test does, with no extra workflow step to
 * remember. See tools/assets/publicBudget.mjs for the declaration itself.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BUCKETS,
  SESSION_MODELS,
  classify,
  scanPublic,
  sessionCosts,
  walk,
} from "./publicBudget.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_PUBLIC = path.resolve(HERE, "../../platform/public");

/** A throwaway public/ tree carrying the two landmarks the tools look for. */
function makeTree(files) {
  const root = mkdtempSync(path.join(tmpdir(), "knijka-public-"));
  const write = (rel, bytes) => {
    mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    writeFileSync(path.join(root, rel), Buffer.alloc(bytes));
  };
  write("clips/manifest.json", 10);
  mkdirSync(path.join(root, "sim"), { recursive: true });
  for (const [rel, bytes] of Object.entries(files)) write(rel, bytes);
  temps.push(root);
  return root;
}

const temps = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
});

describe("public/ budget declaration", () => {
  it("classifies every file in the real public/ tree", () => {
    // The rule that makes the whole thing survive contact with a new feature:
    // an undeclared asset dir is a failure, not a silent default.
    const undeclared = walk(REAL_PUBLIC).filter((rel) => classify(rel) === null);
    expect(undeclared).toEqual([]);
  });

  it("keeps the real public/ inside every ceiling", () => {
    const result = scanPublic(REAL_PUBLIC);
    expect(result.violations).toEqual([]);
  });

  it("splits the deployed weight from the working-copy weight", () => {
    const result = scanPublic(REAL_PUBLIC);
    // Every byte lands on exactly one side of the deploy line, or in
    // `unclassified` — which the first test already treats as a failure.
    const accounted = result.prodBytes + result.devBytes;
    const stray = result.unclassified.reduce((n, f) => n + f.bytes, 0);
    expect(accounted + stray).toBe(result.totalBytes);
  });

  it("keeps the founder-only buckets off the deploy, by name", () => {
    // WHAT THIS REPLACED, AND WHY. This used to assert `devBytes > 250 MB`
    // and `prodBytes < devBytes` — M-28's measured snapshot, ~310 MB dev of
    // ~494 MB total. The failure mode it was aiming at is real (a dev-only
    // bucket quietly re-flagged `ship: "prod"` balloons every deploy), but a
    // byte total is the wrong instrument for it: doc 82 §8 pruned 247.3 MB of
    // unreferenced clip PNG masters — exactly the housekeeping this file is
    // supposed to encourage — and that alone flipped both inequalities while
    // nothing about the deploy line changed.
    //
    // So pin the line itself. A bucket changing sides now fails by NAME,
    // whatever anyone's disk weighs.
    const dev = BUCKETS.filter((b) => b.ship === "dev").map((b) => b.id);
    expect(dev.sort()).toEqual(
      ["clips-docs", "clips-keyframes", "scene-stills", "sim-textures-src"].sort(),
    );
    for (const b of BUCKETS) expect(b.ship, b.id).toMatch(/^(prod|dev)$/);
  });

  it("routes the superseded and the scaffold assets nowhere", () => {
    // Both were deleted under M-28 (public/sim/city was superseded by city-v3;
    // the five create-next-app SVGs were never referenced). Deleting them is
    // not enough — nothing must quietly re-declare them as shippable.
    expect(classify("next.svg")).toBeNull();
    expect(classify("vercel.svg")).toBeNull();
  });

  it("ships the WebP posters and withholds the PNG keyframes", () => {
    expect(classify("clips/sc-ac-crosswind__m1.k2.webp").ship).toBe("prod");
    expect(classify("clips/sc-ac-crosswind__m1.k2.png").ship).toBe("dev");
    expect(classify("scene-stills/anything.png").ship).toBe("dev");
    expect(classify("sim/textures/road/color.ktx2").ship).toBe("prod");
    expect(classify("sim/textures/road/color.png").ship).toBe("dev");
  });

  it("separates the tutorial CLIP from its POSTER, and keeps both out of sim-models", () => {
    // The split is the whole reason the idle number can exist: one bucket is
    // what a student pays for opening a card, the other is what he pays for
    // asking to watch. Ordering matters — `sim-tutorial-clip` matches the
    // directory, and `sim-models` matches `sim/` — so this pins all three.
    expect(classify("sim/tutorial/adjust-seat.mp4").id).toBe("sim-tutorial-clip");
    expect(classify("sim/tutorial/adjust-seat.webp").id).toBe("sim-tutorial-poster");
    expect(classify("sim/vehicles/hero_car.glb").id).toBe("sim-models");
  });

  it("every bucket states why it exists", () => {
    for (const b of BUCKETS) {
      expect(b.why, b.id).toBeTruthy();
      expect(b.maxBytes, b.id).toBeGreaterThan(0);
    }
  });
});

describe("the ceiling actually fails", () => {
  it("rejects a poster that regressed to a full-size image", () => {
    // The H-10 defect, reproduced: a 1,150 KB keyframe where a 30 KB WebP
    // belongs. Before this budget existed, 42 of them shipped unnoticed.
    const root = makeTree({ "clips/sc-x__m0.k2.webp": 1_150_000 });
    const result = scanPublic(root);
    expect(result.violations).toEqual([
      { kind: "file", id: "clips-poster: clips/sc-x__m0.k2.webp", bytes: 1_150_000, limit: 120_000 },
    ]);
  });

  it("rejects a bucket that grew past its total", () => {
    const root = makeTree({
      "world/a.json": 800_000,
      "world/b.json": 800_000,
    });
    const result = scanPublic(root);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ kind: "bucket", id: "world" });
  });

  it("rejects an undeclared asset directory", () => {
    const root = makeTree({ "brochures/flyer.pdf": 10 });
    const result = scanPublic(root);
    expect(result.unclassified.map((f) => f.rel)).toEqual(["brochures/flyer.pdf"]);
  });

  it("rejects the 30 MB tutorial clip — the lump, not the total", () => {
    // The founder's own case: „One 30 MB clip is worse for a student than six
    // 5 MB ones, because they pay for it in a single unskippable lump." The
    // BUCKET is nowhere near its 125 MB total here, so only the per-file
    // ceiling can catch this — which is the point of having one.
    const root = makeTree({ "sim/tutorial/walk-around.mp4": 30_000_000 });
    const result = scanPublic(root);
    expect(result.violations).toEqual([
      {
        kind: "file",
        id: "sim-tutorial-clip: sim/tutorial/walk-around.mp4",
        bytes: 30_000_000,
        limit: 12_000_000,
      },
    ]);
  });

  it("passes the two clips that were actually rendered", () => {
    // The other half of a ceiling that means something: the measured Kling 3.0
    // pair (5.4 MB seat, 9.0 MB walk-around) must FIT, or the number is not a
    // budget, it is a ban. Read as MiB, the stricter reading of the brief.
    const root = makeTree({
      "sim/tutorial/adjust-seat.mp4": Math.round(5.4 * 1_048_576),
      "sim/tutorial/check-surroundings.mp4": Math.round(9.0 * 1_048_576),
    });
    expect(scanPublic(root).violations).toEqual([]);
  });
});

describe("session download — the second number", () => {
  it("names only buckets that exist, and says where its floor is proven", () => {
    // A renamed bucket must not silently zero a model (see `pick`).
    const ids = new Set(BUCKETS.map((b) => b.id));
    for (const m of SESSION_MODELS) {
      for (const id of [...m.upfront, ...m.onDemand]) expect(ids, m.id).toContain(id);
      // The floor is a claim about a COMPONENT, not about disk. If nothing
      // names where that claim is tested, this file is guessing.
      expect(m.idleRequires, m.id).toMatch(/\.tsx?$|\.test\.tsx?/);
      expect(m.steps, m.id).toBeGreaterThan(0);
    }
  });

  it("keeps the idle ceiling and the poster bucket ceiling in step", () => {
    // They are deliberately the same number in two places — the founder-facing
    // one („a few hundred KB for all thirteen") and the enforcement one. This
    // is what makes that duplication safe instead of a future contradiction.
    const model = SESSION_MODELS.find((m) => m.id === "predrive-tutorial");
    const poster = BUCKETS.find((b) => b.id === "sim-tutorial-poster");
    expect(model.maxIdleBytes).toBe(poster.maxBytes);
    expect(model.steps).toBe(13); // the thirteen PreDriveStepIds
  });

  it("holds the real tree inside the idle ceiling", () => {
    const costs = sessionCosts(scanPublic(REAL_PUBLIC));
    expect(costs.flatMap((c) => c.violations)).toEqual([]);
  });

  it("reports a floor that is a rounding error against the worst case", () => {
    // THE WHOLE ARGUMENT FOR TAP-TO-PLAY, as a number. If this ratio ever
    // approaches 1 the feature has stopped being lazy — either the posters
    // grew into screenshots or the clips became upfront.
    const [tutorial] = sessionCosts(scanPublic(REAL_PUBLIC));
    expect(tutorial.permitted.idleBytes).toBeLessThan(tutorial.permitted.worstCaseBytes * 0.01);
    // …and neither number may be vacuous. A model reporting 0 MB permitted is
    // a model that has quietly stopped measuring anything.
    expect(tutorial.permitted.worstCaseBytes).toBeGreaterThan(0);
    expect(tutorial.permitted.biggestFetchBytes).toBeGreaterThan(0);
  });

  it("fails when the posters grow into screenshots", () => {
    // Thirteen posters at the H-10 weight (1.15 MB each) is 15 MB a student
    // pays for opening cards he never plays. The per-file ceiling catches the
    // first one; this proves the SESSION floor catches the set even if each
    // file were individually legal.
    const files = {};
    for (let i = 0; i < 13; i += 1) files[`sim/tutorial/step-${i}.webp`] = 39_000;
    const costs = sessionCosts(scanPublic(makeTree(files)));
    const [tutorial] = costs;
    expect(tutorial.measured.idleBytes).toBe(13 * 39_000);
    expect(tutorial.violations).toEqual([
      { kind: "session-idle", id: "predrive-tutorial", bytes: 507_000, limit: 500_000 },
    ]);
  });

  it("counts a clip as session cost only when it is asked for", () => {
    const root = makeTree({
      "sim/tutorial/adjust-seat.mp4": 2_000_000,
      "sim/tutorial/adjust-seat.webp": 27_000,
    });
    const [tutorial] = sessionCosts(scanPublic(root));
    // Opening the card costs the poster. Pressing play costs the clip too.
    expect(tutorial.measured.idleBytes).toBe(27_000);
    expect(tutorial.measured.worstCaseBytes).toBe(2_027_000);
    // And the lump is named, so the report can point at the offending file.
    expect(tutorial.measured.biggestFetch.rel).toBe("sim/tutorial/adjust-seat.mp4");
  });

  it("crashes loudly if a bucket it names is renamed away", () => {
    const scan = scanPublic(makeTree({}));
    scan.buckets = scan.buckets.filter((b) => b.bucket.id !== "sim-tutorial-clip");
    expect(() => sessionCosts(scan)).toThrow(/sim-tutorial-clip/);
  });
});
