/**
 * =============================================================================
 * THE RIM CARD MAY NOT CONTRADICT THE WINDSCREEN
 * — sc-jx-equal-left:29a8ae1a, major.
 * =============================================================================
 *
 * The finding is a photograph of the last frame of a lesson:
 * `.audit-frames/sweep161/sc-jx-equal-left/mobile-wrong/07-end.png` — "the whole
 * windscreen is a flat untextured beige plane … the last thing the student sees
 * is the inside of a wall". It was filed against `CameraRig.tsx`, which is not
 * the owner: the rear-view mirror inset in the SAME frame renders the city
 * correctly, so nothing is wrong with the camera. The car had driven 285 m
 * straight north off a 130 m arm and parked nose-first against the WORLD RIM
 * BELT — the contiguous, collidable row of building masses
 * `world/builders/worldRim.ts` has stood just inside the rim of every authored
 * micro-map since 2026-08-27, on purpose, so that leaving the map meets a city
 * edge instead of an empty plane.
 *
 * WHAT WAS ACTUALLY BROKEN is the one sentence the product says about that
 * edge. `LessonPlayShell`'s rim card was written before the belt existed and
 * told every student, on every map, «Оттук нататък няма нито път, нито сграда —
 * теренът просто свършва». On 103 of the 105 committed districts that is the
 * exact opposite of what is in front of him. `runtime/district.ts` recorded it
 * as an open defect owned by another lane on the day the belt landed («the copy
 * should say so … Routed, not edited») and it was still unedited at HEAD.
 *
 * SO THIS FILE GATES THE TWO THINGS THAT CAN GO WRONG AGAIN:
 *   §1 the classification is the BUILDER'S, not a second opinion — one
 *      predicate, and the belt refuses to build exactly where it says there is
 *      no wall;
 *   §2 it reaches a student: the runtime publishes it on the tick and the shell
 *      picks its sentence from it. A measure with no consumer is this
 *      programme's standing defect and is not repeated here.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { VehicleSample } from "../../contracts";
import { districtHasWorldRimBelt } from "../../world/builders/worldRim";
import { createWorldRuntime } from "../worldRuntime";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const WORLD_DIR = path.join(REPO_ROOT, "content", "world");

function loadDistrict(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8")) as Record<
    string,
    unknown
  >;
}

const AT_REST: VehicleSample = {
  position: { x: 4.0625, y: -115 },
  headingDeg: 0,
  speedKmh: 0,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
};

// ---------------------------------------------------------------------------
// §1 — one classification, and it is the builder's
// ---------------------------------------------------------------------------

describe("which maps end in a wall", () => {
  it("classifies every committed district, and only the two OSM extracts are open ground", () => {
    const ids = readdirSync(WORLD_DIR)
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.replace(/\.json$/, ""));
    // An empty sweep is not a pass — the census this rests on is 105 documents.
    expect(ids.length).toBeGreaterThan(100);

    const open = ids.filter((id) => {
      const d = loadDistrict(id) as { meta?: { boundsLocalMeters?: unknown } };
      if (d.meta?.boundsLocalMeters === undefined) return false;
      return !districtHasWorldRimBelt(
        d as unknown as Parameters<typeof districtHasWorldRimBelt>[0],
      );
    });

    // `worldRim.ts` builds nothing on a district declaring no `meta.mapKind`,
    // and says which two those are and why: Sofia under an ODbL notice, whose
    // box is a cut through a city that genuinely continues. Everything else is
    // an authored micro-map and is belted.
    expect(open.sort()).toEqual(["d2-v1", "district-v1"]);
  });

  it("is the same gate the belt itself refuses on — not a second opinion", () => {
    // Both halves of `buildWorldRim`'s guard live in the predicate now, so the
    // sentence on the glass and the geometry in the world cannot disagree.
    expect(districtHasWorldRimBelt({ meta: { boundsLocalMeters: bounds(130) } })).toBe(false);
    expect(
      districtHasWorldRimBelt({ meta: { mapKind: 42, boundsLocalMeters: bounds(130) } }),
    ).toBe(false);
    expect(
      districtHasWorldRimBelt({
        meta: { mapKind: "scenario-junction", boundsLocalMeters: bounds(130) },
      }),
    ).toBe(true);
    // A degenerate box builds no belt, so it may not be described as walled.
    expect(
      districtHasWorldRimBelt({
        meta: { mapKind: "scenario-junction", boundsLocalMeters: bounds(0) },
      }),
    ).toBe(false);
  });
});

function bounds(half: number) {
  return { minX: -half, minY: -half, maxX: half, maxY: half };
}

// ---------------------------------------------------------------------------
// §2 — and it reaches the student
// ---------------------------------------------------------------------------

describe("the walled/open answer travels to the card", () => {
  it("rides the tick out of the production runtime", () => {
    // jx-equal-v1 IS the finding's own map, and the belt it hit is the reason
    // this field exists.
    const walled = createWorldRuntime(loadDistrict("jx-equal-v1")).sample(AT_REST, 0, false);
    expect(walled.worldEdgeIsWalled).toBe(true);
  });

  it("says OPEN on a document that declares no mapKind, rather than inventing a wall", () => {
    const raw = loadDistrict("jx-equal-v1") as { meta: Record<string, unknown> };
    delete raw.meta.mapKind;
    const open = createWorldRuntime(raw).sample(AT_REST, 0, false);
    expect(open.worldEdgeIsWalled).toBe(false);
  });

  it("the shell prints a different sentence for each, and neither denies the belt", () => {
    // Source-pinned on purpose: the defect was a STRING, and no unit of the
    // shell can be mounted without a WebGL context.
    const shell = readFileSync(
      path.join(REPO_ROOT, "platform", "src", "components", "sim", "lesson-ui",
        "LessonPlayShell.tsx"),
      "utf-8",
    )
      // Comments stripped: the blocks above the card QUOTE the old sentence to
      // explain why it is now a branch, and a gate that counts prose cannot
      // tell a fix from a description of one.
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^[ \t]*\/\/.*$/gm, " ");
    // The card asks the tick which world it is in…
    expect(shell).toContain("tick.worldEdgeIsWalled");
    // …and the walled branch names the buildings the student is looking at.
    expect(shell).toContain("отпред е плътен ред сгради");
    // The old sentence survives ONLY as the open-ground branch. If it is the
    // whole card again, 103 maps are being lied to again.
    const denials = shell.split("нито път, нито сграда").length - 1;
    expect(denials).toBe(1);
  });
});
