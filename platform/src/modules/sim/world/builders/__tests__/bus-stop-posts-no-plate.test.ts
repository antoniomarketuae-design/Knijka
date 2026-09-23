/**
 * A SPIRKA IS NOT A В27 — founder ruling 2026-09-22, «Convict under чл. 69»
 * (audit row sc-pk-busstop-ban:b103c282).
 *
 * THE ROW. The world posted a round no-stopping sign В27 at the kerb of the
 * bus stop on pk-busstop-v1 (two of them, one per authored span), and the
 * debrief convicted «под знак В27». A real Sofia bus stop is not marked that
 * way, and the rule that governs another vehicle at a spirka — ЗДвП чл. 69 —
 * needs no sign and no marking. `zoneSigns.ts` placed the face off `zone.kind`
 * alone; it now withholds it for the one basis that needs no plate,
 * `"law-bus-stop"`, through `zonePostsPlate`.
 *
 * WHAT THIS FILE HOLDS, AND THE HALF THAT MATTERS MOST IS THE SECOND:
 *   1. the predicate's truth table — only noStopping + law-bus-stop loses the
 *      post;
 *   2. the CORPUS is otherwise byte-identical: for every shipped district,
 *      building it with and without its authored `basis` fields yields the
 *      SAME sign placements — except pk-busstop-v1, the one map the ruling is
 *      about. So no other lesson or district lost a sign it legitimately
 *      carries (the plated В27 maps and the four чл. 98 maps keep every face).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../buildWorldGeometry";
import { zonePostsPlate } from "../zoneSigns";
import { assertDistrict, type District, type DistrictZoneKind } from "../../types";
import type { NoStopBasis } from "../../../rules";

function worldDir(): string {
  const candidates = [
    path.join(process.cwd(), "content", "world"),
    path.resolve(process.cwd(), "..", "content", "world"),
  ];
  for (const d of candidates) if (fs.existsSync(d)) return d;
  throw new Error(`content/world not found in: ${candidates.join(", ")}`);
}

/** Every shipped district that authors at least one zone carrying a `basis`. */
function districtsWithBasis(): { id: string; raw: District }[] {
  const dir = worldDir();
  const out: { id: string; raw: District }[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    let raw: District;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as District;
    } catch {
      continue;
    }
    if ((raw.zones ?? []).some((z) => z.basis !== undefined)) {
      out.push({ id: file.replace(/\.json$/, ""), raw });
    }
  }
  return out;
}

function withoutBasis(raw: District): District {
  return {
    ...raw,
    zones: raw.zones!.map((z) => {
      const copy = { ...z };
      delete (copy as { basis?: unknown }).basis;
      return copy;
    }),
  };
}

describe("zonePostsPlate — only the spirka loses its post", () => {
  it("noStopping + law-bus-stop posts NOTHING (чл. 69 needs no plate)", () => {
    expect(zonePostsPlate({ kind: "noStopping", basis: "law-bus-stop" })).toBe(false);
  });

  it("every other no-stopping basis keeps its В27 face, exactly as before", () => {
    const kept: (NoStopBasis | undefined)[] = [
      undefined,
      "sign",
      "law-alongside",
      "law-junction",
      "law-crossing",
      "law-rail",
    ];
    for (const basis of kept) {
      expect(zonePostsPlate({ kind: "noStopping", basis }), String(basis)).toBe(true);
    }
  });

  it("the basis is read for noStopping only; other kinds keep their own rule", () => {
    expect(zonePostsPlate({ kind: "noOvertaking" })).toBe(true);
    expect(zonePostsPlate({ kind: "noParking" })).toBe(true);
    // A stray basis on a non-noStopping kind does not strip a post.
    expect(zonePostsPlate({ kind: "noOvertaking", basis: "law-bus-stop" })).toBe(true);
    // Marking-only kinds never posted anything and still do not.
    for (const kind of ["solidCenterLine", "busLane", "emergencyLane"] as DistrictZoneKind[]) {
      expect(zonePostsPlate({ kind }), kind).toBe(false);
    }
  });
});

describe("the corpus — the basis moves posts on pk-busstop-v1 and NOWHERE else", () => {
  const corpus = districtsWithBasis();

  it("found the maps that declare a basis (an empty walk would pass everything)", () => {
    const ids = corpus.map((d) => d.id);
    for (const id of ["pk-busstop-v1", "pk-banx-v1", "pk-rail-v1", "pk-double-v1", "lot-zebra-v1"]) {
      expect(ids).toContain(id);
    }
  });

  for (const { id, raw } of corpus) {
    it(`${id}: sign placements with vs without its authored basis`, () => {
      const ruled = buildWorldGeometry(assertDistrict(raw), { seed: 7 });
      const unruled = buildWorldGeometry(assertDistrict(withoutBasis(raw)), { seed: 7 });
      if (id === "pk-busstop-v1") {
        // The ruling: the two В27 faces the kind alone would post are gone,
        // and nothing else about the furniture moved.
        expect(unruled.stats.signs.noStopping).toBe(2);
        expect(ruled.stats.signs.noStopping ?? 0).toBe(0);
        expect(ruled.signs).toEqual(unruled.signs.filter((s) => s.kind !== "noStopping"));
      } else {
        // Byte-identical: a чл. 98 map keeps every post it had.
        expect(ruled.signs).toEqual(unruled.signs);
        expect(ruled.stats.signs.noStopping ?? 0).toBeGreaterThan(0);
      }
    });
  }
});
