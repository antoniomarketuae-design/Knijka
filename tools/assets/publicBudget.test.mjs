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
    // M-28's number: ~310 MB of the ~494 MB is founder/dev-only. If this ever
    // inverts, something dev-only has been marked shippable.
    expect(result.devBytes).toBeGreaterThan(250_000_000);
    expect(result.prodBytes).toBeLessThan(result.devBytes);
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
