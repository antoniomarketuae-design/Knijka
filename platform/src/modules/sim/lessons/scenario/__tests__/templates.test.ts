/**
 * Template integrity — sc-park-perp-rev (P0) against the REAL registries:
 * content/concepts.json (the 152-graph), the doc-72 archetype registry, the
 * rules catalog, and the COMMITTED generated map (content/world/
 * lot-perp-v1.json): the template's pinned bay must match the generator's
 * meta.scenario truth value-for-value, and the referenced spawn must exist.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VIOLATIONS } from "../../../rules/catalog";
import { DOC72_ARCHETYPE_IDS } from "../registry";
import { LOT_PERP_TARGET_BAY, SCENARIO_TEMPLATES, SC_PARK_PERP_REV } from "../templates";
import { validateScenarioSpec } from "../validate";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, rel), "utf-8")) as T;
}

describe("scenario templates — registry integrity", () => {
  it("every template validates against the REAL concept registry", () => {
    const concepts = loadJson<Array<{ id: string }>>("content/concepts.json");
    const known = new Set(concepts.map((c) => c.id));
    for (const spec of SCENARIO_TEMPLATES) {
      expect(validateScenarioSpec(spec, { conceptIds: known }), spec.id).toEqual([]);
    }
  });

  it("template ids are unique and follow sc-<family>-<slug>", () => {
    const ids = SCENARIO_TEMPLATES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^sc-[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("P0 cites doc-72 PK-02 exactly (perpendicular bay reverse)", () => {
    expect(SC_PARK_PERP_REV.archetypeIds).toEqual(["PK-02"]);
    for (const a of SC_PARK_PERP_REV.archetypeIds) expect(DOC72_ARCHETYPE_IDS.has(a)).toBe(true);
  });

  it("teach.lawRef matches the c-reversing law basis (ЗДвП чл. 40)", () => {
    const concepts = loadJson<Array<{ id: string; lawRefs: Array<{ act: string; ref: string }> }>>(
      "content/concepts.json",
    );
    const reversing = concepts.find((c) => c.id === "c-reversing")!;
    expect(reversing.lawRefs).toContainEqual({ act: "ЗДвП", ref: "чл. 40" });
    expect(SC_PARK_PERP_REV.teach.lawRef).toBe("ЗДвП чл. 40");
  });

  it("mistake-demo codeRefs cite real catalog codes", () => {
    for (const m of SC_PARK_PERP_REV.mistakes) {
      for (const code of m.codeRefs) expect(code in VIOLATIONS, code).toBe(true);
    }
  });
});

describe("sc-park-perp-rev ↔ lot-perp-v1.json (the committed generated map)", () => {
  interface LotScenarioMeta {
    archetype: string;
    params: Record<string, number | string>;
    targetBayId: string;
    bays: Array<{
      id: string;
      x: number;
      y: number;
      headingDeg: number;
      widthM: number;
      lengthM: number;
      occupied: boolean;
    }>;
  }
  const district = loadJson<{
    meta: { scenario: LotScenarioMeta };
    spawnPoints: Array<{ id: string }>;
  }>("content/world/lot-perp-v1.json");

  it("the pinned target bay equals the generator's free bay, value for value", () => {
    const target = district.meta.scenario.bays.find(
      (b) => b.id === district.meta.scenario.targetBayId,
    )!;
    expect(target.occupied).toBe(false);
    expect({
      x: target.x,
      y: target.y,
      headingDeg: target.headingDeg,
      widthM: target.widthM,
      lengthM: target.lengthM,
    }).toEqual(LOT_PERP_TARGET_BAY);
    // And the template grades exactly that rect.
    const park = SC_PARK_PERP_REV.success[1].params;
    if (park.kind !== "completeManeuver" || park.maneuver !== "parkInBay") {
      expect.unreachable("second success objective must be the parkInBay contract");
    } else {
      expect(park.bay).toEqual(LOT_PERP_TARGET_BAY);
    }
  });

  it("the founder's reference occupancy: 4 occupied neighbors around ONE free bay", () => {
    const bays = district.meta.scenario.bays;
    expect(bays).toHaveLength(5);
    expect(bays.filter((b) => b.occupied)).toHaveLength(4);
    expect(bays.filter((b) => !b.occupied)).toHaveLength(1);
    expect(district.meta.scenario.params.bayWidthM).toBe(2.7);
    expect(district.meta.scenario.params.angle).toBe("90");
  });

  it("the template's map recipe mirrors the generator params in the file", () => {
    expect(SC_PARK_PERP_REV.map.params).toEqual(district.meta.scenario.params);
    expect(SC_PARK_PERP_REV.map.archetype).toBe(district.meta.scenario.archetype);
  });

  it("the start spawn exists in the district file", () => {
    const ids = new Set(district.spawnPoints.map((s) => s.id));
    expect(ids.has(SC_PARK_PERP_REV.start.spawnPointId!)).toBe(true);
  });

  it("the published copy is byte-identical to the content source", () => {
    const src = readFileSync(path.join(REPO_ROOT, "content/world/lot-perp-v1.json"));
    const pub = path.join(REPO_ROOT, "platform/public/world/lot-perp-v1.json");
    expect(existsSync(pub)).toBe(true);
    expect(readFileSync(pub).equals(src)).toBe(true);
  });

  it("traces are RECORDED (S1): files exist at the refs + public copies match", () => {
    const refs = [SC_PARK_PERP_REV.shadow, ...SC_PARK_PERP_REV.mistakes.map((m) => m.traceRef)];
    for (const ref of refs) {
      expect(ref.pending, ref.path).not.toBe(true);
      const src = path.join(REPO_ROOT, ref.path);
      expect(existsSync(src), src).toBe(true);
      // Public copy: content/traces/<template>/<file> → platform/public/traces/…
      const pub = path.join(
        REPO_ROOT,
        "platform",
        "public",
        ref.path.replace(/^content\//, ""),
      );
      expect(existsSync(pub), pub).toBe(true);
      expect(readFileSync(pub).equals(readFileSync(src))).toBe(true);
    }
  });
});
