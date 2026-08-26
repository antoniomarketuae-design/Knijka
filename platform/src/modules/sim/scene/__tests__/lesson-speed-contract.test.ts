/**
 * THE LESSON'S SPEED CONTRACT — BOTH DIRECTIONS.
 *
 * Sweep 161 routed 22 BROKEN rows to `scene/lessonSpeedContract.ts`, all
 * carrying one sentence: three speed numbers stand on the glass at once and
 * none explains the others (`sc-crossing-child-ball/mobile-right/
 * 05-stopped.png` — a 40 disc, «РЕЖИМ Нормален ≤50 · знакът важи», and a lane
 * bar reading «не по-бързо от 37 км/ч»). This file pins the two answers that
 * belong to that module:
 *
 *  1. THE GOVERNOR MAY NOT BE RAISED ABOVE THE LAW BY A DECLARATION. B58's
 *     ruling („the world may not instruct the fault it is about to bill")
 *     applied to the number the HUD prints beside the disc, not just to the
 *     number the gate prints on the lane.
 *  2. THE STRICTER OF LAW AND TASK BINDS, AND THE GOVERNOR NEVER DOES.
 *
 * Every assertion here is written so the OPPOSITE mistake fails it too: the
 * shipped-tree sweep proves the new bound refuses nobody (all 105 districts
 * resolve to exactly what they resolved to before it existed), and the
 * fabricated districts prove it refuses the one thing it exists to refuse. A
 * check that only ever fires one way is how a false certificate and a false
 * failure both get shipped.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { governorCapKmh, REQUIRED_SPEED_HEADROOM_KMH } from "@/modules/sim/vehicle";
import type { District, DistrictEdge } from "@/modules/sim/world";
import {
  districtMaxLegalKmh,
  lessonRequiredSpeedKmh,
  lessonSpeedConflict,
  readSpeedContract,
} from "../lessonSpeedContract";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = path.resolve(HERE, "../../../../../..", "content", "world");

function loadDistricts(): { id: string; doc: District }[] {
  return readdirSync(WORLD_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      id: f.replace(/\.json$/, ""),
      doc: JSON.parse(readFileSync(path.join(WORLD_DIR, f), "utf-8")) as District,
    }));
}

/** A district with the two fields this module reads and nothing else it needs.
 *  `edges` carry only `maxspeed`; the cast is the same shape the module's own
 *  tolerance guards assume of JSON arriving at the seam. */
function fakeDistrict(opts: {
  limits?: number[];
  scenario?: unknown;
}): District {
  const edges = (opts.limits ?? []).map(
    (maxspeed, i) => ({ id: `e${i}`, maxspeed }) as unknown as DistrictEdge,
  );
  return {
    meta: opts.scenario === undefined ? {} : { scenario: opts.scenario },
    roads: { nodes: [], edges },
  } as unknown as District;
}

/**
 * The declaration EXACTLY as `lessonRequiredSpeedKmh` read it before the road
 * bound existed — the pre-change implementation, kept verbatim so the sweep
 * below can assert „nothing shipped moved" against the real thing rather than
 * against a remembered claim.
 */
function declaredBeforeTheBound(district: District): number | undefined {
  const inBand = (v: unknown): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= 5 && v <= 200 ? v : undefined;
  const scenario = district.meta?.scenario as
    | { wave?: { speedKmh?: unknown }; requiredSpeedKmh?: unknown }
    | undefined;
  if (!scenario || typeof scenario !== "object") return undefined;
  return inBand(scenario.wave?.speedKmh) ?? inBand(scenario.requiredSpeedKmh);
}

describe("districtMaxLegalKmh — the law of the loaded map", () => {
  it("is the largest published limit, and is a limit that is actually on the map", () => {
    const all = loadDistricts();
    // Self-check: a sweep that silently stopped finding districts would pass
    // every property below vacuously. 105 files at the time of writing.
    expect(all.length).toBeGreaterThanOrEqual(100);
    let withLimits = 0;
    for (const { id, doc } of all) {
      const limits = doc.roads.edges
        .map((e) => (e as { maxspeed?: unknown }).maxspeed)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
      const got = districtMaxLegalKmh(doc);
      if (limits.length === 0) {
        expect(got, id).toBeUndefined();
        continue;
      }
      withLimits += 1;
      // Two independent properties rather than a second copy of the same
      // reduce: the answer is ON the map, and nothing on the map beats it.
      expect(limits, id).toContain(got);
      for (const v of limits) expect(v, `${id} edge ${v} > ${got}`).toBeLessThanOrEqual(got!);
    }
    expect(withLimits).toBeGreaterThanOrEqual(100);
  });

  it("reads the green-wave map at its own posted maximum", () => {
    const wave = loadDistricts().find((d) => d.id === "sig-wave-v1");
    expect(wave, "sig-wave-v1 is the district doc 86 B7 was written about").toBeDefined();
    expect(districtMaxLegalKmh(wave!.doc)).toBe(50);
  });
});

describe("lessonRequiredSpeedKmh — the road bound refuses nobody who ships today", () => {
  it("resolves all 105 shipped districts to exactly what they resolved to before the bound", () => {
    const all = loadDistricts();
    expect(all.length).toBeGreaterThanOrEqual(100);
    let declaring = 0;
    for (const { id, doc } of all) {
      const before = declaredBeforeTheBound(doc);
      if (before !== undefined) declaring += 1;
      expect(lessonRequiredSpeedKmh(doc), id).toBe(before);
      expect(lessonSpeedConflict(doc), id).toBeNull();
    }
    // Self-check with teeth: if the tree ever stops declaring anything this
    // whole comparison passes on 105 undefineds and proves nothing. Doc 86 B7
    // says the count is 1 and names it.
    expect(declaring).toBe(1);
    const wave = all.find((d) => d.id === "sig-wave-v1")!;
    expect(lessonRequiredSpeedKmh(wave.doc)).toBe(50);
  });
});

describe("lessonRequiredSpeedKmh — a lesson may not require what its roads forbid", () => {
  it("bounds a declaration above the map's own maximum, and says which two numbers fought", () => {
    const d = fakeDistrict({ limits: [50, 40], scenario: { wave: { speedKmh: 140 } } });
    expect(lessonRequiredSpeedKmh(d)).toBe(50);
    expect(lessonSpeedConflict(d)).toEqual({
      declaredKmh: 140,
      maxLegalKmh: 50,
      source: "wave",
    });
  });

  it("keeps the governor off the number the disc would be billing", () => {
    // THE MEASUREMENT, taken through the shipped governor rather than argued:
    // unbounded, a 140 declaration on a 50 map sets Начинаещ's ceiling to
    // 140 + REQUIRED_SPEED_HEADROOM_KMH and the HUD prints «РЕЖИМ Начинаещ
    // ≤146» beside a 50 disc — B58's crime on the other surface.
    const d = fakeDistrict({ limits: [50], scenario: { wave: { speedKmh: 140 } } });
    const unbounded = governorCapKmh("beginner", 50, 140);
    expect(unbounded).toBe(140 + REQUIRED_SPEED_HEADROOM_KMH);
    const bounded = governorCapKmh("beginner", 50, lessonRequiredSpeedKmh(d));
    expect(bounded).toBe(50 + REQUIRED_SPEED_HEADROOM_KMH);
    expect(bounded!).toBeLessThan(unbounded!);
  });

  it("reports the generic seam under its own name", () => {
    const d = fakeDistrict({ limits: [30], scenario: { requiredSpeedKmh: 90 } });
    expect(lessonRequiredSpeedKmh(d)).toBe(30);
    expect(lessonSpeedConflict(d)).toEqual({
      declaredKmh: 90,
      maxLegalKmh: 30,
      source: "requiredSpeedKmh",
    });
  });

  it("does NOT bound a declaration at or under the law, and never raises one", () => {
    // The false-refusal direction. sig-wave-v1's own shape: declared == max.
    const atLimit = fakeDistrict({ limits: [50, 40], scenario: { wave: { speedKmh: 50 } } });
    expect(lessonRequiredSpeedKmh(atLimit)).toBe(50);
    expect(lessonSpeedConflict(atLimit)).toBeNull();
    // Under the law stays under it — the bound is a ceiling, never a floor. A
    // Math.max here would invent a requirement the lesson never made and shove
    // the governor up to meet it.
    const under = fakeDistrict({ limits: [50], scenario: { wave: { speedKmh: 40 } } });
    expect(lessonRequiredSpeedKmh(under)).toBe(40);
    expect(lessonSpeedConflict(under)).toBeNull();
  });

  it("leaves a district that publishes no limit exactly as declared", () => {
    // No law was stated, so there is nothing to be bounded by. Inventing one
    // would refuse a lesson for a fact nobody wrote down.
    const d = fakeDistrict({ limits: [], scenario: { wave: { speedKmh: 130 } } });
    expect(lessonRequiredSpeedKmh(d)).toBe(130);
    expect(lessonSpeedConflict(d)).toBeNull();
    const garbageLimits = fakeDistrict({
      scenario: { wave: { speedKmh: 130 } },
    });
    (garbageLimits.roads.edges as unknown[]).push({ id: "x", maxspeed: "50" }, { id: "y" });
    expect(districtMaxLegalKmh(garbageLimits)).toBeUndefined();
    expect(lessonRequiredSpeedKmh(garbageLimits)).toBe(130);
  });
});

describe("lessonRequiredSpeedKmh — tolerance unchanged", () => {
  it("returns undefined for an absent, non-object or empty scenario", () => {
    expect(lessonRequiredSpeedKmh(fakeDistrict({ limits: [50] }))).toBeUndefined();
    expect(
      lessonRequiredSpeedKmh(fakeDistrict({ limits: [50], scenario: null })),
    ).toBeUndefined();
    expect(
      lessonRequiredSpeedKmh(fakeDistrict({ limits: [50], scenario: "wave" })),
    ).toBeUndefined();
    expect(lessonRequiredSpeedKmh(fakeDistrict({ limits: [50], scenario: {} }))).toBeUndefined();
  });

  it("refuses every out-of-band declaration rather than governing to it", () => {
    for (const bad of [0, 4, 201, 1e9, NaN, Infinity, -10, "50", null, {}]) {
      const d = fakeDistrict({ limits: [50], scenario: { wave: { speedKmh: bad } } });
      expect(lessonRequiredSpeedKmh(d), String(bad)).toBeUndefined();
      expect(lessonSpeedConflict(d), String(bad)).toBeNull();
    }
  });

  it("falls through to the generic seam when the wave declaration is garbage", () => {
    const d = fakeDistrict({
      limits: [50],
      scenario: { wave: { speedKmh: 500 }, requiredSpeedKmh: 45 },
    });
    expect(lessonRequiredSpeedKmh(d)).toBe(45);
    // …and the wave wins when it is usable, unchanged precedence.
    const both = fakeDistrict({
      limits: [90],
      scenario: { wave: { speedKmh: 60 }, requiredSpeedKmh: 45 },
    });
    expect(lessonRequiredSpeedKmh(both)).toBe(60);
  });
});

describe("readSpeedContract — which of the three numbers is being graded", () => {
  it("reads the audit frame itself: disc 40, gate 37, «РЕЖИМ Нормален ≤50»", () => {
    // sweep161/sc-crossing-child-ball/mobile-right/05-stopped.png
    const r = readSpeedContract({ postedKmh: 40, taskCapKmh: 37, modeCapKmh: 50 });
    expect(r.bindingKmh).toBe(37);
    expect(r.binding).toBe("task");
    expect(r.modeAboveLaw).toBe(true);
    expect(r.modeBlocksBinding).toBe(false);
    // All three numbers appear, each attached to its owner, and the one that
    // is graded is named as the one that wins.
    expect(r.lineBg).toBe(
      "Знакът е 40 — това е законът. Задачата иска ≤37: по-строгото важи. " +
        "РЕЖИМ ≤50 е таван на колата, не разрешение.",
    );
  });

  it("never lets the governor bind — not from below", () => {
    // A min() that included the governor would return 40 here: the student is
    // convicted against a number no sign ever published, and the founder's own
    // complaint (a correct action failed) is exactly this shape.
    const r = readSpeedContract({ postedKmh: 50, modeCapKmh: 40 });
    expect(r.bindingKmh).toBe(50);
    expect(r.binding).toBe("law");
  });

  it("never lets the governor bind — not from above", () => {
    // A max() would return 60: 55 in a 50 zone reads as compliant. That is
    // `sc-speed-dangerous` (disc 50, mark «Нормален ≤60») — the drill whose
    // subject is that 51–60 in a 50 zone is a scored fault.
    const r = readSpeedContract({ postedKmh: 50, modeCapKmh: 60 });
    expect(r.bindingKmh).toBe(50);
    expect(r.binding).toBe("law");
    expect(r.modeAboveLaw).toBe(true);
    expect(r.lineBg).toBe(
      "Знакът е 50 — това е законът. РЕЖИМ ≤60 е таван на колата, не разрешение.",
    );
  });

  it("B58: a task cap above the sign neither binds nor is printed", () => {
    // The 32 gates authored above their own street carry grading slack. Slack
    // may keep grading; it may not be read out as an instruction.
    const r = readSpeedContract({ postedKmh: 50, taskCapKmh: 57, modeCapKmh: 60 });
    expect(r.bindingKmh).toBe(50);
    expect(r.binding).toBe("law");
    expect(r.lineBg).not.toContain("57");
    expect(r.lineBg).toContain("Знакът е 50");
  });

  it("attributes a tie to the sign, not to the drill", () => {
    const r = readSpeedContract({ postedKmh: 50, taskCapKmh: 50 });
    expect(r.bindingKmh).toBe(50);
    expect(r.binding).toBe("law");
    expect(r.lineBg).toBe("Знакът е 50 — това е законът.");
  });

  it("states the drill's own demand when no sign is known", () => {
    const r = readSpeedContract({ taskCapKmh: 37 });
    expect(r.bindingKmh).toBe(37);
    expect(r.binding).toBe("task");
    expect(r.modeAboveLaw).toBe(false);
    expect(r.lineBg).toBe("Задачата иска ≤37 км/ч.");
  });

  it("says WHY the drill cannot be driven when the governor sits under it — doc 86 B7", () => {
    // sig-wave-v1 on Начинаещ before the B7 floor existed: the wave needs 50,
    // the tier gave 40, and „nothing told the student why".
    const r = readSpeedContract({ postedKmh: 50, taskCapKmh: 50, modeCapKmh: 40 });
    expect(r.modeBlocksBinding).toBe(true);
    expect(r.bindingKmh).toBe(50);
    expect(r.lineBg).toContain("РЕЖИМ ≤40 не стига за 50 — смени режима.");
    // …and it must not ALSO read as a permission; the two clauses describe
    // opposite failures and only one of them is true at a time.
    expect(r.lineBg).not.toContain("не разрешение");
  });

  it("carries no governor furniture when the governor cannot be misread", () => {
    // At or under the sign with the drill reachable there is nothing to
    // disclaim — the same test `GovernorCapMark` applies to its own clause.
    const r = readSpeedContract({ postedKmh: 50, taskCapKmh: 50, modeCapKmh: 50 });
    expect(r.modeAboveLaw).toBe(false);
    expect(r.modeBlocksBinding).toBe(false);
    expect(r.lineBg).toBe("Знакът е 50 — това е законът.");
    expect(r.lineBg).not.toContain("РЕЖИМ");
  });

  it("says nothing at all when nothing is graded", () => {
    const r = readSpeedContract({ modeCapKmh: 60 });
    expect(r.bindingKmh).toBeUndefined();
    expect(r.binding).toBeUndefined();
    expect(r.lineBg).toBe("");
  });

  it("treats an absent, null or non-finite ceiling as absent", () => {
    const r = readSpeedContract({
      postedKmh: 50,
      taskCapKmh: NaN,
      modeCapKmh: null,
    });
    expect(r.bindingKmh).toBe(50);
    expect(r.binding).toBe("law");
    expect(r.lineBg).toBe("Знакът е 50 — това е законът.");
    // „Напреднал" writes no cap at all; a 0 or negative one is corruption.
    expect(readSpeedContract({ postedKmh: 50, modeCapKmh: 0 }).modeAboveLaw).toBe(false);
    expect(readSpeedContract({ postedKmh: 50, modeCapKmh: -60 }).modeAboveLaw).toBe(false);
  });

  it("mirrors GovernorCapMark's rounded compare, so mark and line cannot disagree", () => {
    // 50.4 vs 50 renders as «50» beside a «50» disc: a clause pointing at two
    // identical numbers is furniture that teaches nothing.
    expect(readSpeedContract({ postedKmh: 50, modeCapKmh: 50.4 }).modeAboveLaw).toBe(false);
    expect(readSpeedContract({ postedKmh: 50, modeCapKmh: 50.6 }).modeAboveLaw).toBe(true);
  });

  it("NEVER prints the governor's number without saying what it is not", () => {
    // The sweep behind rule 2: the founder read «Нормален ≤60» six pixels from
    // a 50 disc as „the limit is 50, you may do 60". A bare `РЕЖИМ ≤N` on this
    // line would be the same string again.
    const grid = [undefined, 20, 37, 50, 57, 60, 90];
    let printed = 0;
    for (const postedKmh of grid)
      for (const taskCapKmh of grid)
        for (const modeCapKmh of grid) {
          const { lineBg } = readSpeedContract({ postedKmh, taskCapKmh, modeCapKmh });
          if (!lineBg.includes("РЕЖИМ")) continue;
          printed += 1;
          expect(
            lineBg.includes("не разрешение") || lineBg.includes("не стига"),
            `bare governor number: ${lineBg}`,
          ).toBe(true);
        }
    // Self-check: 343 combinations, and the assertion is worthless if none of
    // them printed the governor at all.
    expect(printed).toBeGreaterThan(50);
  });

  it("NEVER prints a number that is not the graded one as the graded one", () => {
    // The whole of rule 1+2 as one property over the same grid: whatever the
    // line says, the number it attributes to the drill is the binding number,
    // and it is never above the sign.
    const grid = [undefined, 20, 37, 50, 57, 90];
    let stricter = 0;
    for (const postedKmh of grid)
      for (const taskCapKmh of grid) {
        const r = readSpeedContract({ postedKmh, taskCapKmh });
        if (postedKmh !== undefined && taskCapKmh !== undefined) {
          expect(r.bindingKmh).toBe(Math.min(postedKmh, taskCapKmh));
          expect(r.bindingKmh!).toBeLessThanOrEqual(postedKmh);
        }
        if (r.binding !== "task") {
          expect(r.lineBg).not.toContain("Задачата");
          continue;
        }
        stricter += 1;
        expect(r.lineBg).toContain(`≤${Math.round(r.bindingKmh!)}`);
      }
    expect(stricter).toBeGreaterThan(0);
  });
});

/**
 * ===========================================================================
 * THE REPORT HAS A READER — 2026-08-26.
 *
 * `lessonSpeedConflict`'s own docstring promises the contradiction is
 * „reported rather than absorbed", and until this commit the only thing it was
 * reported TO was the suite above. The bound half is live: `LessonScene`
 * imports `lessonRequiredSpeedKmh` and hands the clamped number to the world as
 * `lessonRequiredKmh`, so a district asking for 140 on a 50 map has its
 * declaration silently reduced — the glass stays lawful and the lesson quietly
 * becomes undriveable-as-authored with nothing anywhere naming the two numbers
 * that fought. Detected, proved to five cases, and never said out loud.
 *
 * The warning now sits at the one place the bound is applied, which is also the
 * one place a district is loaded. This block is the ADDRESS: it fails if
 * `LessonScene` stops asking, so the visibility half cannot go back to being an
 * assertion about itself.
 * ===========================================================================
 */
describe("the contradiction reaches the surface that loads the district", () => {
  const SCENE = readFileSync(
    path.resolve(HERE, "../../../../components/sim/LessonScene.tsx"),
    "utf8",
  );

  it("LessonScene asks for the conflict, on the same district it bounds", () => {
    expect(SCENE).toContain("lessonSpeedConflict,");
    expect(SCENE).toContain("const speedConflict = lessonSpeedConflict(district);");
    // Bound and report are one act: both read the SAME `district` object, in
    // the same build block, so a scene that clamps without asking is refused.
    const build = SCENE.slice(
      SCENE.indexOf("lessonRequiredKmh: lessonRequiredSpeedKmh(district)"),
      SCENE.indexOf("} catch (err) {"),
    );
    expect(build.length).toBeGreaterThan(0);
    expect(build).toContain("lessonSpeedConflict(district)");
  });

  it("…and it prints BOTH numbers, not merely that something was wrong", () => {
    // A warning that says „speed bound" and no figures is the same silence with
    // extra steps: the whole content of this report is which two numbers fought
    // and which of them the map published.
    const at = SCENE.indexOf("if (speedConflict !== null) {");
    expect(at).toBeGreaterThan(-1);
    const warn = SCENE.slice(at, at + 900);
    expect(warn).toContain("speedConflict.declaredKmh");
    expect(warn).toContain("speedConflict.maxLegalKmh");
    expect(warn).toContain("speedConflict.source");
  });

  it("the shape it prints is the shape the function returns", () => {
    // Pinned against a real conflict rather than against the type, so renaming
    // a field breaks this row and not only the compiler.
    const doc = fakeDistrict({ limits: [50, 40], scenario: { requiredSpeedKmh: 140 } });
    const conflict = lessonSpeedConflict(doc);
    expect(conflict).not.toBeNull();
    expect(Object.keys(conflict!).sort()).toEqual(["declaredKmh", "maxLegalKmh", "source"]);
    expect(conflict!.declaredKmh).toBe(140);
    expect(conflict!.maxLegalKmh).toBe(50);
    // …and the bound really did fire, so the warning is about a clamp that happened.
    expect(lessonRequiredSpeedKmh(doc)).toBe(50);
  });
});
