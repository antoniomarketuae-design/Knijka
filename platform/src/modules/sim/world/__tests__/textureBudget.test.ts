/**
 * The download tier is a BYTE budget, so this test weighs it (audit H-11
 * part 2).
 *
 * It does not assert the policy against itself — it resolves each tier's fetch
 * plan against the REAL manifests in public/ and adds up the files on disk.
 * That is the only form of this test that can fail for the reason that
 * matters: before the fix every tier's plan resolved to the same 4,465,053 B
 * of ground maps and the same 328,139 B of facade maps, because the loaders
 * took no quality argument at all.
 *
 * It also pins the ceilings, so a future normal map or bay set cannot quietly
 * put the phone tier back where it was (see tools/assets/publicBudget.mjs for
 * the same discipline applied to the whole of public/).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  TEXTURE_BUDGETS,
  facadeFetchPlan,
  facadeMapsOf,
  groundFetchPlan,
  groundMapsOf,
  type GroundMapName,
} from "../textures/textureBudget";
import { QUALITY_PRESETS } from "../components/quality";
import type { WorldQuality } from "../types";

const PUBLIC = path.resolve(__dirname, "../../../../../public");
const GROUND_BASE = "/sim/textures";
const FACADE_BASE = "/sim/city-v3/textures";

/** Mirrors GROUPS in pbrTextures.ts — only sidewalk/concrete ships no ao. */
const GROUND_GROUPS = [
  { group: "road", dir: "road", hasAo: true },
  { group: "sidewalk", dir: "sidewalk", hasAo: false },
  { group: "ground", dir: "ground", hasAo: true },
] as const;

function readManifest(rel: string): {
  sets: Record<string, Partial<Record<string, string>>>;
} {
  return JSON.parse(readFileSync(path.join(PUBLIC, rel), "utf8"));
}

/** Bytes on disk for a public URL, e.g. "/sim/textures/road/color.ktx2". */
function bytesOf(url: string): number {
  const file = path.join(PUBLIC, url.replace(/^\//, ""));
  expect(existsSync(file), `${url} exists`).toBe(true);
  return statSync(file).size;
}

/** Everything one quality level pulls before the first simulator frame. */
function tierBytes(level: WorldQuality): {
  ground: number;
  facade: number;
  hdr: number;
  total: number;
} {
  const budget = TEXTURE_BUDGETS[level];

  const groundManifest = readManifest("sim/textures/manifest.json");
  let ground = 0;
  for (const g of GROUND_GROUPS) {
    const plan = groundFetchPlan({
      baseUrl: GROUND_BASE,
      dir: g.dir,
      hasAo: g.hasAo,
      mode: budget.groundMaps,
      entry: groundManifest.sets[g.group] as Partial<Record<GroundMapName, string>>,
    });
    // The KTX2 is what actually goes over the wire; the PNG is the fallback.
    for (const req of plan) ground += bytesOf(req.ktx2Url ?? req.pngUrl);
  }

  const facadeManifest = readManifest("sim/city-v3/textures/manifest.json");
  let facade = 0;
  for (const setName of Object.keys(facadeManifest.sets)) {
    const plan = facadeFetchPlan({
      baseUrl: FACADE_BASE,
      setName,
      mode: budget.facadeMaps,
      entry: facadeManifest.sets[setName],
    });
    for (const req of plan) facade += bytesOf(req.url);
  }

  // LessonScene mounts the day HDR unless the tier says otherwise; the night
  // one is the same order of magnitude and only one is ever loaded.
  const hdr = budget.hdrEnvironment ? bytesOf("/sim/env/shanghai_riverside_1k.hdr") : 0;

  return { ground, facade, hdr, total: ground + facade + hdr };
}

describe("texture download budget", () => {
  it("gives every render tier a download tier", () => {
    // The whole defect: `low` existed as a render preset and had no effect on
    // a single byte fetched.
    for (const level of ["low", "med", "high"] as const) {
      expect(TEXTURE_BUDGETS[level]).toBeDefined();
      expect(QUALITY_PRESETS[level].level).toBe(level);
    }
  });

  it("mirrors the render tier's facade-map ruling exactly", () => {
    // Fetching more maps than the tier BINDS is the original bug in miniature:
    // at "colorOnly" the normal and ORM were downloaded, transcoded, uploaded
    // to VRAM and never sampled.
    expect(TEXTURE_BUDGETS.low.facadeMaps).toBe("colorOnly");
    expect(TEXTURE_BUDGETS.med.facadeMaps).toBe("colorNormal");
    expect(TEXTURE_BUDGETS.high.facadeMaps).toBe("full");
    expect(facadeMapsOf("colorOnly")).toEqual(["color", "emissive"]);
    expect(groundMapsOf("colorOnly")).toEqual(["color"]);
  });

  it("does not mount the HDR at the phone tier", () => {
    expect(TEXTURE_BUDGETS.low.hdrEnvironment).toBe(false);
    expect(TEXTURE_BUDGETS.med.hdrEnvironment).toBe(true);
    expect(TEXTURE_BUDGETS.high.hdrEnvironment).toBe(true);
    // Worth gating: one HDR outweighs the entire low-tier texture budget.
    expect(bytesOf("/sim/env/shanghai_riverside_1k.hdr")).toBeGreaterThan(1_000_000);
  });

  it("keeps the high tier byte-identical to the pre-tier build", () => {
    const high = tierBytes("high");
    expect(high.ground).toBe(4_465_053);
    expect(high.facade).toBe(328_139);
    expect(high.hdr).toBe(1_596_163);
  });

  it("cuts the phone tier to well under a megabyte", () => {
    const low = tierBytes("low");
    const high = tierBytes("high");
    // Ceilings, not equalities — a re-encode may shift a few KB. The point is
    // that low can never again be within a rounding error of high.
    expect(low.ground).toBeLessThan(600_000);
    expect(low.facade).toBeLessThan(250_000);
    expect(low.hdr).toBe(0);
    expect(low.total).toBeLessThan(800_000);
    // 6,389,355 -> 725,950 B: the 5.40 MB the audit asked for.
    expect(high.total - low.total).toBeGreaterThan(5_000_000);
  });

  it("keeps the med tier a real step between the two", () => {
    const med = tierBytes("med");
    const high = tierBytes("high");
    const low = tierBytes("low");
    expect(med.total).toBeLessThan(high.total);
    expect(med.total).toBeGreaterThan(low.total);
    // med drops the ground AO and the facade ORM, nothing else.
    expect(high.ground - med.ground).toBe(375_234);
    expect(high.facade - med.facade).toBe(63_818);
  });
});
