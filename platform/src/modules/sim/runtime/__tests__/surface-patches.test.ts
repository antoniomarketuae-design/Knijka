/**
 * Surface grip patches (runtime/surface.ts) — the district-side seam of the
 * AQUAPLANE + ICE slice (doc 72 AC-07-full / AC-08 ice band):
 *
 *  - resolveSurfaceGripPatches turns the authored waterPatch/icePatch spans
 *    of the committed maps into the exact district-space rects the rig
 *    tests the chassis against (pinned by value);
 *  - surfacePatchGripAt: membership, the MIN composition across overlapping
 *    patches, and the WATER SPEED GATE — below aquaplaneAboveKmh the patch
 *    does NOT bite (the tyre still evacuates the water; the taught ~55 km/h
 *    transit keeps real grip), at/above it the factor applies; ice bites at
 *    ANY speed;
 *  - the tolerance law (the curveAdvisory discipline, A12): malformed
 *    spans / factors / gates and unknown edges drop the WHOLE span;
 *  - the RUNTIME stays ignorant by design: the kinds are consumed by the
 *    PHYSICS RIG — createWorldRuntime's unknown-kind tolerance keeps them
 *    inert on the tick (no new field, no crash);
 *  - FP sweep: NO shipped map carries the kinds except the two new ones —
 *    ac-aqua-v1 (exactly one waterPatch) and ac-ice-v1 (exactly one
 *    icePatch); every other content/world file resolves to [].
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import {
  AQUAPLANE_ABOVE_KMH,
  AQUAPLANE_PATCH_GRIP_FACTOR,
  ICE_PATCH_GRIP_FACTOR,
} from "../../vehicle";
import { createWorldRuntime } from "../worldRuntime";
import { LANE_WIDTH_M } from "../spatial";
import {
  resolveSurfaceGripPatches,
  surfacePatchGripAt,
  type SurfacePatchSource,
} from "../surface";

const WORLD_DIR = (() => {
  const candidates = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(`content/world not found in: ${candidates.join(", ")}`);
})();

function loadRaw(id: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf8")) as unknown;
}

const LANE_X = 4.06;

const sample = (x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "low",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

/** A minimal synthetic straight-street source for tolerance cases. */
function synthetic(zones: NonNullable<SurfacePatchSource["zones"]>): SurfacePatchSource {
  return {
    roads: {
      edges: [
        {
          id: "e-street",
          lanes: 2,
          geometry: [
            [0, 0],
            [0, 400],
          ],
        },
      ],
    },
    zones,
  };
}

describe("resolveSurfaceGripPatches — the committed maps by value", () => {
  it("ac-aqua-v1 resolves to EXACTLY the [240, 280] full-width water rect with the tuning values", () => {
    const patches = resolveSurfaceGripPatches(loadRaw("ac-aqua-v1") as SurfacePatchSource);
    expect(patches).toHaveLength(1);
    const p = patches[0];
    expect(p.x).toBe(0); // centreline of the straight street
    expect(p.y).toBe(260); // mid-span of [240, 280]
    expect(p.headingDeg).toBe(0); // the street runs due north
    expect(p.halfLengthM).toBe(20);
    expect(p.halfWidthM).toBe(LANE_WIDTH_M); // 2 lanes → full carriageway half-width 8.125
    expect(p.gripFactor).toBe(AQUAPLANE_PATCH_GRIP_FACTOR);
    expect(p.aquaplaneAboveKmh).toBe(AQUAPLANE_ABOVE_KMH);
  });

  it("ac-ice-v1 resolves to EXACTLY the [210, 300] full-width ice rect — NO float gate", () => {
    const patches = resolveSurfaceGripPatches(loadRaw("ac-ice-v1") as SurfacePatchSource);
    expect(patches).toHaveLength(1);
    const p = patches[0];
    expect(p.x).toBe(0);
    expect(p.y).toBe(255); // mid-span of [210, 300]
    expect(p.headingDeg).toBe(0);
    expect(p.halfLengthM).toBe(45);
    expect(p.halfWidthM).toBe(LANE_WIDTH_M);
    expect(p.gripFactor).toBe(ICE_PATCH_GRIP_FACTOR);
    expect(p.aquaplaneAboveKmh).toBeUndefined();
  });
});

describe("surfacePatchGripAt — membership, MIN composition and the water speed gate", () => {
  const aqua = resolveSurfaceGripPatches(loadRaw("ac-aqua-v1") as SurfacePatchSource);
  const ice = resolveSurfaceGripPatches(loadRaw("ac-ice-v1") as SurfacePatchSource);

  it("the water bites only AT/ABOVE the float speed — and only inside the rect", () => {
    // Inside the span, above the gate: the patch bites.
    expect(surfacePatchGripAt(aqua, LANE_X, 260, 80)).toBe(AQUAPLANE_PATCH_GRIP_FACTOR);
    // Exactly at the gate: bites (the documented at/above semantics).
    expect(surfacePatchGripAt(aqua, LANE_X, 260, AQUAPLANE_ABOVE_KMH)).toBe(
      AQUAPLANE_PATCH_GRIP_FACTOR,
    );
    // Inside, below the gate: the tyre evacuates the water — grip stays 1.
    // This is the taught transit (~55) AND the recovery: a car slowing
    // INSIDE the span regains grip the moment it drops below the gate.
    expect(surfacePatchGripAt(aqua, LANE_X, 260, 55)).toBe(1);
    expect(surfacePatchGripAt(aqua, LANE_X, 260, 64.9)).toBe(1);
    // Reverse-signed speed uses |v| (a rolling car floats regardless of gear).
    expect(surfacePatchGripAt(aqua, LANE_X, 260, -80)).toBe(AQUAPLANE_PATCH_GRIP_FACTOR);
    // Outside the span (before/after/beside): never bites at any speed.
    expect(surfacePatchGripAt(aqua, LANE_X, 239, 90)).toBe(1);
    expect(surfacePatchGripAt(aqua, LANE_X, 281, 90)).toBe(1);
    expect(surfacePatchGripAt(aqua, 8.2, 260, 90)).toBe(1); // beyond the carriageway edge
    // Both direction banks are covered (water floods the whole roadway).
    expect(surfacePatchGripAt(aqua, -LANE_X, 260, 80)).toBe(AQUAPLANE_PATCH_GRIP_FACTOR);
  });

  it("ice bites at ANY speed — a crawl included", () => {
    expect(surfacePatchGripAt(ice, LANE_X, 255, 5)).toBe(ICE_PATCH_GRIP_FACTOR);
    expect(surfacePatchGripAt(ice, LANE_X, 255, 50)).toBe(ICE_PATCH_GRIP_FACTOR);
    expect(surfacePatchGripAt(ice, LANE_X, 209, 50)).toBe(1); // the dry approach
    expect(surfacePatchGripAt(ice, LANE_X, 301, 50)).toBe(1); // past the bridge
  });

  it("overlapping patches compose by MIN (most restrictive wins)", () => {
    const patches = resolveSurfaceGripPatches(
      synthetic([
        { kind: "icePatch", edgeId: "e-street", fromM: 100, toM: 200, patchGripFactor: 0.3 },
        { kind: "icePatch", edgeId: "e-street", fromM: 150, toM: 250, patchGripFactor: 0.15 },
      ]),
    );
    expect(patches).toHaveLength(2);
    expect(surfacePatchGripAt(patches, 0, 120, 30)).toBe(0.3); // first only
    expect(surfacePatchGripAt(patches, 0, 175, 30)).toBe(0.15); // overlap → MIN
    expect(surfacePatchGripAt(patches, 0, 230, 30)).toBe(0.15); // second only
  });
});

describe("tolerance — a data slip must never fling the live car (A12)", () => {
  it("malformed spans / factors / gates and unknown edges drop the WHOLE span", () => {
    expect(
      resolveSurfaceGripPatches(
        synthetic([
          // Unknown edge.
          { kind: "waterPatch", edgeId: "nope", fromM: 10, toM: 20, patchGripFactor: 0.15, aquaplaneAboveKmh: 65 },
          // Degenerate spans.
          { kind: "icePatch", edgeId: "e-street", fromM: 50, toM: 50, patchGripFactor: 0.15 },
          { kind: "icePatch", edgeId: "e-street", fromM: 80, toM: 60, patchGripFactor: 0.15 },
          { kind: "icePatch", edgeId: "e-street", fromM: Number.NaN, toM: 60, patchGripFactor: 0.15 },
          // Missing / malformed grip.
          { kind: "icePatch", edgeId: "e-street", fromM: 10, toM: 20 },
          { kind: "icePatch", edgeId: "e-street", fromM: 10, toM: 20, patchGripFactor: 0 },
          { kind: "icePatch", edgeId: "e-street", fromM: 10, toM: 20, patchGripFactor: 1 },
          { kind: "icePatch", edgeId: "e-street", fromM: 10, toM: 20, patchGripFactor: Number.NaN },
          // waterPatch REQUIRES its float gate.
          { kind: "waterPatch", edgeId: "e-street", fromM: 10, toM: 20, patchGripFactor: 0.15 },
          { kind: "waterPatch", edgeId: "e-street", fromM: 10, toM: 20, patchGripFactor: 0.15, aquaplaneAboveKmh: 0 },
          // Unknown kinds pass through untouched (forward compat).
          { kind: "lavaPatch", edgeId: "e-street", fromM: 10, toM: 20, patchGripFactor: 0.15 },
        ]),
      ),
    ).toEqual([]);
  });

  it("a district without zones (or without the kinds) resolves to [] — the rig branch never runs", () => {
    expect(resolveSurfaceGripPatches({ roads: { edges: [] } })).toEqual([]);
    expect(
      resolveSurfaceGripPatches(loadRaw("ac-rain-v1") as SurfacePatchSource),
    ).toEqual([]); // a shipped zones-less v1 street
    expect(
      resolveSurfaceGripPatches(loadRaw("sp-curve-v1") as SurfacePatchSource),
    ).toEqual([]); // a shipped zones-CARRYING map (curveAdvisory) — not these kinds
  });

  it("the resolver clamps a below-floor factor into the setter band", () => {
    const patches = resolveSurfaceGripPatches(
      synthetic([{ kind: "icePatch", edgeId: "e-street", fromM: 10, toM: 20, patchGripFactor: 0.01 }]),
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].gripFactor).toBe(0.05); // PATCH_GRIP_MIN — VehicleSim's own floor
  });
});

describe("the runtime stays ignorant by design — no tick channel exists", () => {
  it("createWorldRuntime accepts both maps and its ticks carry NO surface field on the spans", () => {
    for (const [id, y] of [
      ["ac-aqua-v1", 260],
      ["ac-ice-v1", 255],
    ] as const) {
      const rt = createWorldRuntime(loadRaw(id));
      rt.update(1 / 60);
      const tick = rt.sample(sample(LANE_X, y, 0, 70), 1, false);
      // The kinds live OUTSIDE the tick vocabulary: the runtime's
      // unknown-kind tolerance keeps them inert here — the PHYSICS RIG is
      // the consumer (LessonScene → VehicleRig → setSurfaceGripFactor).
      expect(tick.edgeId).toBeTruthy();
      expect("surfaceGrip" in tick).toBe(false);
      expect("waterPatch" in tick).toBe(false);
      expect("icePatch" in tick).toBe(false);
    }
  });
});

/**
 * The COMPLETE roster of maps allowed to carry a surface-grip patch, and the
 * exact zone vocabulary each one may carry. Adding a map here is a deliberate
 * act: the sweep below proves EVERY other shipped district resolves zero
 * patches, which is what keeps the physics rig off the exam bank and the free
 * drive. A new surface map lands one line here plus its own contract battery.
 */
const PATCH_MAPS: Record<string, string[]> = {
  "ac-aqua-v1": ["waterPatch"], // AC-07-full — the standing-water float
  "ac-ice-v1": ["icePatch"], // AC-08 — the ice band (ice RESPONSE: sc-ac-ice)
  "ac-bridge-v1": ["icePatch"], // AC-08 — the frozen deck (ice ANTICIPATION: sc-ac-bridge-ice)
};

describe("FP sweep — no unlisted map carries the kinds", () => {
  it("across ALL content/world files, only the PATCH_MAPS roster resolves patches", () => {
    const files = fs.readdirSync(WORLD_DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(40); // the whole shipped fleet is swept
    const seen: string[] = [];
    for (const f of files) {
      const id = f.replace(/\.json$/, "");
      const raw = JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf8")) as {
        zones?: Array<{ kind: string }>;
      };
      const patches = resolveSurfaceGripPatches(raw as unknown as SurfacePatchSource);
      const kinds = (raw.zones ?? []).map((z) => z.kind);
      const expected = PATCH_MAPS[id];
      if (expected) {
        seen.push(id);
        expect(patches, `${id} must resolve its authored patch`).toHaveLength(expected.length);
        expect(kinds).toEqual(expected);
      } else {
        expect(patches, `${id} must carry no surface patches`).toEqual([]);
        expect(kinds).not.toContain("waterPatch");
        expect(kinds).not.toContain("icePatch");
      }
    }
    // The roster is exact in BOTH directions: a listed map that stopped
    // existing would otherwise quietly weaken the sweep into a no-op.
    expect(seen.sort()).toEqual(Object.keys(PATCH_MAPS).sort());
  });
});
