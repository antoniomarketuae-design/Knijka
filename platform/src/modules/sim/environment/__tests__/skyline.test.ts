/**
 * V3's skyline gate — doc 82 §3.2: "Gate off on poligon/lot maps".
 *
 * Two halves, because the bug this file exists to prevent lived in the seam
 * between them: SkyDome grew a working `skyline` prop that damps the Vitosha
 * uniform to 0, and NOTHING ever passed it. The pure ridge maths was green
 * (skyShader.test.ts) while a 6.6° massif rendered beyond the fence of the
 * enclosed полигон and over the parking lots. So:
 *
 *   1. the RULE — every shipped district file is classified, in Node, from
 *      its own meta.mapKind (no hardcoded id list to forget a map into);
 *   2. the WIRING — the prop is actually threaded, at every render site.
 *
 * (2) is a source-level test for the same reason composerSplit.test.ts is:
 * there is no DOM/GPU test environment here (vitest runs `environment:
 * "node"`), and a dead prop is invisible to every other kind of check.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENCLOSED_MAP_KINDS, mapKindHasSkyline } from "../skyline";

// ---------------------------------------------------------------------------
// 1. The rule, against the shipped maps
// ---------------------------------------------------------------------------

/** content/ sits beside platform/; vitest's cwd is platform/ but a repo-root
 *  run is possible too (the poligon-district.test.ts convention). */
function worldDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "..", "content", "world"),
    path.join(process.cwd(), "content", "world"),
  ];
  for (const dir of candidates) if (fs.existsSync(dir)) return dir;
  throw new Error("content/world not found from " + process.cwd());
}

interface ShippedMap {
  id: string;
  mapKind: unknown;
}

function shippedMaps(): ShippedMap[] {
  const dir = worldDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as {
        meta?: Record<string, unknown>;
      };
      return { id: f.replace(/\.json$/, ""), mapKind: doc.meta?.mapKind };
    });
}

describe("mapKindHasSkyline", () => {
  it("hides the ridge on the enclosed kinds and only those", () => {
    for (const kind of ENCLOSED_MAP_KINDS) expect(mapKindHasSkyline(kind)).toBe(false);
    for (const kind of ["scenario-street", "scenario-junction", "scenario-roundabout", "scenario-vru"]) {
      expect(mapKindHasSkyline(kind)).toBe(true);
    }
  });

  it("keeps the ridge for an absent or unrecognised mapKind", () => {
    // The two OSM city districts predate mapKind, and a typo must never be
    // able to silently delete the skyline — doc 82 §1.2's „flat-earth test
    // level" tell is the more expensive failure of the two.
    expect(mapKindHasSkyline(undefined)).toBe(true);
    expect(mapKindHasSkyline(null)).toBe(true);
    expect(mapKindHasSkyline("")).toBe(true);
    expect(mapKindHasSkyline("training_ground")).toBe(true);
    expect(mapKindHasSkyline(7)).toBe(true);
  });

  it("classifies EVERY shipped district — полигон + lots dark, the rest Sofia", () => {
    const maps = shippedMaps();
    // Cheap guard that the loader actually found the content dir.
    expect(maps.length).toBeGreaterThan(80);

    const noSkyline = maps.filter((m) => !mapKindHasSkyline(m.mapKind)).map((m) => m.id);
    // The exact set doc 82 V3 names: the fenced training ground and every
    // parking-lot micro-map. If a new lot map ships, it lands here for free
    // (it is generated with mapKind "scenario-lot") — and if a new map type
    // needs the gate, this list is where the omission becomes visible.
    expect(noSkyline.sort()).toEqual([
      "lot-45-v1",
      // The ten parking situations added for the founder's „10 at least" — each
      // is generated with mapKind "scenario-lot", so each lands here as the
      // comment above promises. Listed rather than pattern-matched on purpose:
      // this roster is the omission detector, and a wildcard would let a new
      // map type delete the skyline without anyone noticing.
      "lot-45rev-v1",
      "lot-double-v1",
      "lot-gap-judge-v1",
      "lot-gap-long-v1",
      "lot-gap-short-v1",
      "lot-left-v1",
      "lot-narrow-v1",
      "lot-night-v1",
      "lot-par-v1",
      "lot-perp-v1",
      "lot-van-v1",
      "lot-wall-v1",
      "lot-zebra-v1",
      "poligon-v1",
    ]);

    // …and the street maps keep it, including the two mapKind-less districts.
    expect(mapKindHasSkyline(maps.find((m) => m.id === "district-v1")?.mapKind)).toBe(true);
    expect(mapKindHasSkyline(maps.find((m) => m.id === "d2-v1")?.mapKind)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The wiring — the half that was missing
// ---------------------------------------------------------------------------

const SRC = path.resolve(__dirname, "..", "..", "..", "..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Strip comments before scanning for JSX: this codebase documents heavily,
 *  and the usage EXAMPLE in SimEnvironment's own header („<SimEnvironment
 *  timeOfDay="dusk" … />") is not a render site. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** The attribute text of every `<Tag …>` occurrence, tag by tag. */
function openTags(source: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[\\s/>]`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const end = source.indexOf(">", m.index);
    out.push(source.slice(m.index, end === -1 ? source.length : end + 1));
  }
  return out;
}

describe("skyline gate wiring", () => {
  const files = tsxFiles(SRC).map((file) => ({
    file,
    rel: path.relative(SRC, file).replace(/\\/g, "/"),
    source: stripComments(fs.readFileSync(file, "utf8")),
  }));

  it("forwards the prop from SimEnvironment to the sky dome", () => {
    // The regression in full: SkyDome's gate worked, and the ONE render site
    // in the tree never passed it, so it could never fire.
    const sites = files.flatMap((f) => openTags(f.source, "SkyDome"));
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) expect(site).toContain("skyline=");
  });

  it("keeps SkyDome's uniform gated by that prop", () => {
    // Forwarding a prop that no longer does anything would pass the test
    // above and still put a massif over the полигон.
    const dome = fs.readFileSync(path.join(SRC, "modules/sim/environment/SkyDome.tsx"), "utf8");
    expect(dome).toMatch(/skyline\s*\?\s*ridgeStrengthGoal\([^)]*\)\s*:\s*0/);
  });

  it("makes every district-mounting scene decide it FROM THE MAP", () => {
    // Scope: any scene that renders a real district. Those are exactly the
    // scenes where a wrong sky is a wrong place — and a hardcoded
    // `skyline={true}` there would be the same bug wearing a prop, so the
    // value has to come through mapKindHasSkyline().
    const scenes = files.filter((f) => f.source.includes("<DistrictWorld"));
    expect(scenes.map((s) => s.rel).sort()).toEqual([
      "app/dev/clip-capture/CaptureScene.tsx",
      "app/dev/scene-still/SceneStillScene.tsx",
      "components/sim/LessonScene.tsx",
    ]);
    for (const scene of scenes) {
      const sites = openTags(scene.source, "SimEnvironment");
      expect(sites.length, `${scene.rel} renders a district but no SimEnvironment`).toBeGreaterThan(0);
      for (const site of sites) {
        expect(site, `${scene.rel} drops the skyline gate`).toMatch(
          /skyline=\{\s*mapKindHasSkyline\(/,
        );
      }
    }
  });
});
