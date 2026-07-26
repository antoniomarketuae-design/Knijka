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
import { BUCKETS, classify, scanPublic, walk } from "./publicBudget.mjs";

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
});
