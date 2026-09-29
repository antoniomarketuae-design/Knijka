/**
 * THE PARKED ROW THE STUDENT SEES IS THE ROW <TrafficLayer> COMPUTES.
 *
 * Row sc-ac-ice:86eab7e9, round-2 verifier X1. Round 2 proved the bridgehead
 * parks nobody by calling `computeParkedCars` itself "with exactly the
 * arguments TrafficLayer's `useMemo` passes it" — a copy of the call, not the
 * call. The verifier then edited the layer's own memo so it handed the curb
 * pass a district with `bridges` stripped: the whole kerbside row came back on
 * screen and 81 of 81 tests stayed green.
 *
 * So this file runs THE COMPONENT. `TrafficLayer` is called as the function it
 * is, with the props LessonScene mounts it with (the recipe's district, the
 * recipe's clear zones, no `laneWidthM`), and React's `useMemo` is the one
 * thing replaced: it runs the component's own factory — the product code — and
 * records what it returns. The first memo whose deps start with the district
 * we passed is the parked-row memo (`[district, laneWidthM, parkedClearZones]`);
 * its value IS the array the parked-body instancing loop reads
 * (`parked[i]` → `setMatrixAt`, TrafficLayer's layout effect over
 * `fleet.parkedMeshes`). The run stops there on purpose: everything after it
 * needs a GL context and the GLB fleet, and nothing after it can add a body.
 *
 * The mount site is pinned as a WHOLE ELEMENT (every attribute between
 * `<TrafficLayer` and its `/>`), so an extra `laneWidthM=` or a transformed
 * `district=` there fails too.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The one replaced seam: React's hooks, so the component body can run outside
// a renderer. `useMemo` runs the product's factory; the parked-row memo is
// recorded and the render is cut right after it.
// ---------------------------------------------------------------------------
const probe = vi.hoisted(() => ({
  district: null as unknown,
  parked: null as unknown,
  memoCalls: 0,
  STOP: Symbol("stop-after-parked-memo"),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T,>(factory: () => T, deps?: readonly unknown[]): T => {
      probe.memoCalls++;
      const value = factory();
      if (probe.district !== null && deps && deps[0] === probe.district && Array.isArray(value)) {
        probe.parked = value;
        throw probe.STOP;
      }
      return value;
    },
    useRef: <T,>(v: T) => ({ current: v }),
    useEffect: () => {},
    useLayoutEffect: () => {},
  };
});

import { PERCEPTUAL_ROAD_SCALE } from "../../contracts";
import { compileScenario, SCENARIO_TEMPLATES, type ScenarioLevel } from "../../lessons/scenario";
import type { ScenarioSpec } from "../../lessons/scenario/types";
import { buildLessonWorldCore, type LessonWorldCore } from "../../scene/lessonWorldRecipe";
import { computeParkedCars, TrafficLayer } from "../TrafficLayer";
import type { TrafficDistrict, TrafficSystem } from "../types";

type Parked = ReturnType<typeof computeParkedCars>;

const ROOT = process.cwd(); // platform/
/** The camera of the 03-ready frame (the spawn both ice lessons share). */
const EYE_Y = 15;
/** The near abutment of ac-bridge-v1 (deck [250, 340]). */
const DECK_FROM = 250;
/** Where the far embankment ends and the city resumes. */
const EMBANKMENT_TO = 380;
/** Worst-case parked-body half-length (TrafficLayer PARKED_HALF_LEN_M). */
const PARKED_HALF_LEN = 2.25;
/** TrafficLayer's default `laneWidthM` — LessonScene passes none (pinned below). */
const LAYER_LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;

const spec = (id: string): ScenarioSpec => {
  const s = SCENARIO_TEMPLATES.find((t) => t.id === id);
  if (!s) throw new Error(`no template ${id}`);
  return s;
};
function liveCore(templateId: string, level: ScenarioLevel): LessonWorldCore {
  const s = spec(templateId);
  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, "public", "world", `${s.map.districtId}.json`), "utf8"),
  ) as unknown;
  return buildLessonWorldCore(compileScenario(s, level), raw);
}

/** A traffic system with no agents: the parked row does not depend on it. */
const EMPTY_SYSTEM = { vehicles: [], pedestrians: [] } as unknown as TrafficSystem;

/**
 * The parked row TrafficLayer computes when LessonScene mounts it for `core`
 * (LessonScene.tsx: `district={district as TrafficDistrict}`,
 * `parkedClearZones={built.parkedClearZones}`, where `built.district` and
 * `built.parkedClearZones` are the recipe core's own — `setBuilt({ district,
 * …, parkedClearZones: core.parkedClearZones })`).
 */
function layerParkedRow(core: LessonWorldCore): Parked {
  const district = core.district as unknown as TrafficDistrict;
  probe.district = district;
  probe.parked = null;
  probe.memoCalls = 0;
  let stopped = false;
  try {
    TrafficLayer({
      system: EMPTY_SYSTEM,
      district,
      parkedClearZones: core.parkedClearZones,
    } as Parameters<typeof TrafficLayer>[0]);
  } catch (e) {
    if (e !== probe.STOP) throw e;
    stopped = true;
  } finally {
    probe.district = null;
  }
  if (!stopped || !Array.isArray(probe.parked)) {
    throw new Error("TrafficLayer ran no memo keyed on the district it was given — the parked-row seam moved");
  }
  return probe.parked as Parked;
}

const onBridgehead = (cars: Parked) =>
  cars.filter((c) => c.y + PARKED_HALF_LEN > 0 && c.y - PARKED_HALF_LEN < EMBANKMENT_TO);

describe("X1 — <TrafficLayer>'s own parked-row memo, mounted as LessonScene mounts it", () => {
  const levels = spec("sc-ac-bridge-ice").levels.map((l) => l.level as ScenarioLevel);

  it("the template has rungs to check", () => {
    expect(levels.length).toBeGreaterThanOrEqual(1);
  });

  for (const level of levels) {
    it(`L${level}: the layer parks NOBODY from the spawn to the far embankment, and the city past it still parks`, () => {
      const cars = layerParkedRow(liveCore("sc-ac-bridge-ice", level));
      expect(onBridgehead(cars)).toEqual([]);
      // Control: a layer that parked nobody anywhere would pass the line above.
      expect(cars.filter((c) => c.y > EMBANKMENT_TO).length).toBeGreaterThan(0);
    });
  }

  it("the layer's row is the curb pass on the recipe's district, element for element (so §2's frame measurements are about THIS row)", () => {
    const core = liveCore("sc-ac-bridge-ice", 1);
    const fromLayer = layerParkedRow(core);
    const direct = computeParkedCars(
      core.district as unknown as TrafficDistrict,
      LAYER_LANE_W,
      core.parkedClearZones,
    );
    expect(fromLayer).toEqual(direct);
  });

  it("the layer honours the recipe's clear zones: on a lesson whose map names a bus stop, the row is the ZONED pass, not the bare one", () => {
    // ac-bridge-v1 authors no clear zone, so an equality on it cannot tell a
    // layer that drops `parkedClearZones` (r3 mutant N2) from one that passes
    // them. A district with a busStop building gets a zone from the recipe
    // (scenarioSceneryProps.parkedClearZonesFor RULE 2), and there the two
    // passes differ.
    const withStop = SCENARIO_TEMPLATES.find((t) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(ROOT, "public", "world", `${t.map.districtId}.json`), "utf8"),
      ) as { buildings?: { kind?: string }[] };
      return (raw.buildings ?? []).some((b) => b.kind === "busStop");
    });
    expect(withStop, "no template maps a district with a bus stop").toBeDefined();
    const core = liveCore(withStop!.id, withStop!.levels[0]!.level as ScenarioLevel);
    expect(core.parkedClearZones.length).toBeGreaterThan(0);
    const district = core.district as unknown as TrafficDistrict;
    const zoned = computeParkedCars(district, LAYER_LANE_W, core.parkedClearZones);
    const bare = computeParkedCars(district, LAYER_LANE_W, []);
    expect(zoned).not.toEqual(bare);
    expect(layerParkedRow(core)).toEqual(zoned);
  });

  it("control: the street-with-ice (sc-ac-ice) keeps its unbroken kerbside row in the 03-ready stretch through the same layer", () => {
    const cars = layerParkedRow(liveCore("sc-ac-ice", 1));
    expect(cars.filter((c) => c.y >= EYE_Y && c.y <= DECK_FROM).length).toBeGreaterThanOrEqual(20);
  });

  it("the probe stops at the parked memo, not later (nothing downstream of it can add a body)", () => {
    layerParkedRow(liveCore("sc-ac-bridge-ice", 1));
    // No memo precedes the parked row in the component today; if one is added
    // this still holds as long as the parked memo is reached — the count is a
    // tripwire that the cut happens early, before the GLB/GL-bound memos.
    expect(probe.memoCalls).toBeGreaterThanOrEqual(1);
    expect(probe.memoCalls).toBeLessThanOrEqual(3);
  });
});

/** The source text of the first `<Tag … />` element (attributes only). */
function elementText(src: string, tag: string): string {
  const at = src.indexOf(`<${tag}\n`) >= 0 ? src.indexOf(`<${tag}\n`) : src.indexOf(`<${tag} `);
  if (at < 0) throw new Error(`no <${tag}> in source`);
  const end = src.indexOf("/>", at);
  if (end < 0) throw new Error(`<${tag}> never closes`);
  return src.slice(at, end + 2);
}
/** Attribute names of an element, JSX comments and `//` line comments removed. */
function attributeNames(el: string): string[] {
  const body = el
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/^<\w+/, "")
    .replace(/\/>$/, "");
  const names: string[] = [];
  // Walk attributes: name={…balanced…} | name="…" | bare name.
  let i = 0;
  while (i < body.length) {
    const m = /^\s*([A-Za-z_][\w-]*)/.exec(body.slice(i));
    if (!m) {
      i++;
      continue;
    }
    names.push(m[1]!);
    i += m[0].length;
    if (body[i] === "=") {
      i++;
      if (body[i] === "{") {
        let depth = 0;
        for (; i < body.length; i++) {
          if (body[i] === "{") depth++;
          else if (body[i] === "}" && --depth === 0) {
            i++;
            break;
          }
        }
      } else if (body[i] === '"') {
        i = body.indexOf('"', i + 1) + 1;
      }
    }
  }
  return names;
}

describe("the mount sites, as whole elements", () => {
  const scene = fs.readFileSync(path.join(ROOT, "src", "components", "sim", "LessonScene.tsx"), "utf8");

  it("attribute walker self-test (a pin that cannot fail is not a pin)", () => {
    expect(attributeNames('<X a={b} c="d" e f={{ g: 1 }}\n // h={i}\n {/* j={k} */} l={m(n)} />')).toEqual([
      "a",
      "c",
      "e",
      "f",
      "l",
    ]);
  });

  it("<TrafficLayer> gets the recipe's district and clear zones untransformed, and no laneWidthM (the default this file measures with)", () => {
    const el = elementText(scene, "TrafficLayer");
    expect(el).toMatch(/\sdistrict=\{district as TrafficDistrict\}\s/);
    expect(el).toMatch(/\sparkedClearZones=\{built\.parkedClearZones\}\s/);
    const names = attributeNames(el);
    expect(names.filter((n) => n === "district")).toHaveLength(1);
    expect(names.filter((n) => n === "parkedClearZones")).toHaveLength(1);
    expect(names).not.toContain("laneWidthM");
    // …and `district` there is the built world's, which is the recipe core's.
    expect(scene).toMatch(/const \{ runtime, geometry, district, traffic, director, minimapPolylines, spawnPoints \} =\s*built;/);
    expect(scene).toMatch(/const \{ runtime, district, geometry, scenarioObstacles, gripPatches \} = core;/);
    expect(scene).toMatch(/parkedClearZones: core\.parkedClearZones,/);
  });

  it("<DistrictWorld> mounts the recipe's geometry with physics left at its default (no `physics=` attribute at all)", () => {
    const el = elementText(scene, "DistrictWorld");
    const names = attributeNames(el);
    expect(el).toMatch(/\sdistrict=\{district\}\s/);
    expect(el).toMatch(/\sprebuilt=\{geometry\}\s/);
    expect(names.filter((n) => n === "prebuilt")).toHaveLength(1);
    expect(names).not.toContain("physics");
    // Only one DistrictWorld mount in the lesson scene: the pin covers it.
    expect(scene.split(/<DistrictWorld[\s/]/).length - 1).toBe(1);
  });
});
