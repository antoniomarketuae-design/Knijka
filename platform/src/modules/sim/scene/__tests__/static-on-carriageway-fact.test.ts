/**
 * THE FACT A STATIC CONTACT'S SENTENCE IS CHOSEN BY — lane staticcardcopy,
 * sc-hz-brake-dont-swerve:b7297cb7 (integrator rulings C1, S1, S2(a) and the
 * centre rule; 2026-10-18 / 2026-11-04). T7 and the L7 pin.
 *
 * A held WALL or PROP (the template's dressing and the district's own cones)
 * is ON THE CARRIAGEWAY when `surfaceAt(resolveDistrictDrivableSurface(
 * district), centre).under === "carriageway"` on the committed district. The
 * recipe stamps `onCarriageway: true` on exactly those specs
 * (`stampHeldOnCarriageway`, applied in `buildLessonWorldCore`); a fuel
 * station, a vehicle, an animal, a worker is never stamped. The recorder's
 * static rects carry the same fact BY VALUE, and this file asserts that every
 * one of them agrees with the measured fact — a hand-set flag the built road
 * contradicts goes red here.
 *
 * MEASURED, and what the rows below pin (lane PROGRESS.md, STEP 0(a)):
 *  · stamped: the hz block (4.06, 190) on hz-debris-v1; the ten
 *    hz-roadworks-v1 cones; the sc-park-wall lot wall (5.03, 8.6) on
 *    lot-wall-v1 and the two sc-ed-poligon-chain cones on poligon-v1 — the
 *    last three under S2(a): the fact governs, no per-lesson list, and the
 *    on-road copy is written to be true there;
 *  · not stamped: both sc-pk-driveway walls (their centres stand on the
 *    footway: 0.88 m and 2.88 m past the kerb) and the sc-merge-from-property
 *    fuel station (never a candidate, though its centre measures carriageway);
 *  · THE CENTRE RULE: three recorder kerb rects straddle the asphalt edge
 *    with two or three corners on the carriageway and their centre on the
 *    footway (scEdReverseLine, scManeuverUturn ×2), as does the driveway wall
 *    at (9, 47.3). The centre decides; they keep the off-road copy, which is
 *    true of a kerb (the carriageway's edge). The census line printed below
 *    records each straddler's corners for the judge.
 */
import { describe, expect, it } from "vitest";
import { lessonDistrictId } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import type { ScenarioLevel } from "../../lessons/scenario/types";
import { loadDistrict } from "../../lessons/scenario/__tests__/witnessLiveRung";
import { districtDrivableSurfaceOf, makeSurfaceFix, surfaceAt } from "../../runtime";
import { WorldColliders } from "../../world";
import { buildLessonWorldCore } from "../lessonWorldRecipe";
import {
  PROP_COLLIDER_DIMS,
  STATIC_ON_CARRIAGEWAY_USER_DATA,
  WALL_DEFAULT_THICKNESS_M,
  isStaticOnCarriagewayUserData,
  type ScenarioObstacleSpec,
} from "../obstacleSpec";
import { heldSceneryFor, heldStaticContactBodies, stampHeldOnCarriageway } from "../scenarioSceneryProps";
import type { ObstacleRect2D } from "../../traces/recorder";
import { hzBrakeDontSwerveObstacles } from "../../traces/scHzBrakeDontSwerve";
import { roadworksConeRects } from "../../traces/scMergeRoadworksShift";
import { bridgeParapetObstacles } from "../../traces/scAcBridgeIce";
import { reverseLineCurbObstacles } from "../../traces/scEdReverseLine";
import { narrowCurbObstacles } from "../../traces/scManeuver3Point";
import { boulevardCurbObstacles } from "../../traces/scManeuverUturn";
import { poligonChainConeObstacles } from "../../traces/scEdPoligonChain";
import { PARK_DEPTH_DRILLS, PARK_DEPTH_WALL, parkDepthObstacles } from "../../traces/scParkDepth";
import { drivewayObstacles } from "../../traces/scPkDriveway";

const fix = makeSurfaceFix();
function underAt(districtId: string, x: number, y: number): string {
  const s = districtDrivableSurfaceOf(loadDistrict(districtId) as object);
  if (s === null) throw new Error(`${districtId}: no drivable surface`);
  return surfaceAt(s, x, y, fix).under;
}
function corners(x: number, y: number, headingDeg: number, halfL: number, halfW: number): Array<[number, number]> {
  const r = (headingDeg * Math.PI) / 180;
  const ax = Math.sin(r), ay = Math.cos(r), bx = Math.cos(r), by = -Math.sin(r);
  const out: Array<[number, number]> = [];
  for (const sl of [-1, 1]) for (const sw of [-1, 1]) out.push([x + ax * halfL * sl + bx * halfW * sw, y + ay * halfL * sl + by * halfW * sw]);
  return out;
}

function firstRung(templateId: string) {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === templateId)!;
  for (const L of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
    try {
      return compileScenario(spec, L);
    } catch {
      /* next rung */
    }
  }
  throw new Error(`${templateId}: no rung compiles`);
}

const at = (o: { x: number; y: number }) => `(${o.x},${o.y})`;

/** Every held body the fact stamps, over EVERY scenario template, on its committed district. */
function stampedAcrossTheCatalogue(): string[] {
  const out: string[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    const districtId = (spec.map as { districtId?: string }).districtId;
    if (!districtId) continue;
    const raw = loadDistrict(districtId);
    for (const o of stampHeldOnCarriageway(heldSceneryFor(`${spec.id}@L1`, raw), raw)) {
      if ((o as { onCarriageway?: unknown }).onCarriageway !== undefined) {
        out.push(`${spec.id} ${o.kind}${o.kind === "prop" ? `:${o.prop}` : ""} ${at(o)}`);
      }
    }
  }
  return out.sort();
}

describe("T7 — the fact flags exactly the bodies that stand on the carriageway", () => {
  it("over the whole catalogue: the hz block, the ten roadworks cones, the park-wall lot wall and the two poligon cones", () => {
    const cones = [
      [7.6, 216], [5.85, 222], [4.1, 228], [2.35, 234], [0.6, 240],
      [0.6, 246], [0.6, 253], [0.6, 260], [0.6, 267], [0.6, 274],
    ].map(([x, y]) => `sc-merge-roadworks-shift prop:cone (${x},${y})`);
    expect(stampedAcrossTheCatalogue()).toEqual(
      [
        "sc-hz-brake-dont-swerve wall (4.06,190)",
        ...cones,
        "sc-park-wall wall (5.03,8.6)",
        "sc-ed-poligon-chain prop:cone (140,-129)",
        "sc-ed-poligon-chain prop:cone (146.5,-129)",
      ].sort(),
    );
  });

  it("the recipe stamps them on the mounted list; vehicles and the fuel station are never stamped", () => {
    const flagged = (id: string) => {
      const lesson = firstRung(id);
      const list = buildLessonWorldCore(lesson, loadDistrict(lessonDistrictId(lesson))).scenarioObstacles;
      for (const o of list) {
        if (o.kind !== "wall" && o.kind !== "prop") expect(o, `${id}: a ${o.kind} is never stamped`).not.toHaveProperty("onCarriageway");
      }
      return list.filter((o) => (o as { onCarriageway?: unknown }).onCarriageway === true).map((o) => `${o.kind} ${at(o)}`);
    };
    expect(flagged("sc-hz-brake-dont-swerve")).toEqual(["wall (4.06,190)"]);
    expect(flagged("sc-merge-roadworks-shift")).toHaveLength(10);
    expect(flagged("sc-park-wall")).toEqual(["wall (5.03,8.6)"]);
    expect(flagged("sc-ed-poligon-chain")).toEqual(["prop (140,-129)", "prop (146.5,-129)"]);
    expect(flagged("sc-pk-driveway"), "both driveway walls stand off the carriageway (centre rule)").toEqual([]);
    expect(flagged("sc-merge-from-property"), "the fuel station is never a candidate (S1)").toEqual([]);
    // …though its centre DOES measure carriageway — which is why it is excluded by kind, not by measurement.
    expect(underAt(lessonDistrictId(firstRung("sc-merge-from-property")), 58, 0)).toBe("carriageway");
  });

  it("a stamped spec is a COPY with one added key; every other spec is the same object", () => {
    const raw = loadDistrict("hz-debris-v1");
    const held = heldSceneryFor("sc-hz-brake-dont-swerve@L1", raw);
    const stamped = stampHeldOnCarriageway(held, raw);
    expect(stamped).toHaveLength(held.length);
    stamped.forEach((o, i) => {
      if ((o as { onCarriageway?: unknown }).onCarriageway === true) {
        expect(o).not.toBe(held[i]);
        expect(o).toEqual({ ...held[i], onCarriageway: true });
      } else {
        expect(o).toBe(held[i]);
      }
    });
  });
});

describe("STEP 1's rules: lazy, never throws, cached; heldSceneryFor itself unchanged", () => {
  const ONLY_VEHICLES: ScenarioObstacleSpec[] = [{ kind: "vehicle", x: 1, y: 2, headingDeg: 0 }];

  it("(1) the surface is computed only when the list holds a wall or a prop", () => {
    const touched: PropertyKey[] = [];
    const spy = new Proxy({}, { get: (_t, k) => (touched.push(k), undefined), has: (_t, k) => (touched.push(k), false) });
    expect(stampHeldOnCarriageway(ONLY_VEHICLES, spy)).toEqual(ONLY_VEHICLES);
    expect(stampHeldOnCarriageway([], spy)).toEqual([]);
    expect(touched, "the district document was read for a list with nothing to stamp").toEqual([]);
  });

  it("(2) it never throws: no document, not an object, or one the builders cannot sweep stamps nothing", () => {
    const list: ScenarioObstacleSpec[] = [{ kind: "wall", x: 4.06, y: 190, headingDeg: 0, lengthM: 2.4 }];
    const hostile = new Proxy({}, { get: () => { throw new Error("boom"); } });
    const docs: Array<[string, unknown]> = [
      ["null", null], ["undefined", undefined], ["{}", {}], ["42", 42], ["a string", "hz-debris-v1"],
      ["a bare district header", { format: "district-v1" }], ["a document whose every read throws", hostile],
    ];
    for (const [label, doc] of docs) {
      expect(stampHeldOnCarriageway(list, doc), label).toEqual(list);
    }
  });

  it("(3) the surface is cached per district document — the runtime's own cache", () => {
    const raw = loadDistrict("hz-roadworks-v1") as object;
    expect(districtDrivableSurfaceOf(raw)).toBe(districtDrivableSurfaceOf(raw));
  });

  it("heldSceneryFor(id, {}) and heldSceneryFor(id, null) carry no stamp, for every lesson id; heldStaticContactBodies keeps its five keys", () => {
    for (const spec of SCENARIO_TEMPLATES) {
      for (const L of [1, 2, 3, 4, 5]) {
        const id = `${spec.id}@L${L}`;
        for (const doc of [{}, null]) {
          const held = heldSceneryFor(id, doc);
          expect(JSON.stringify(held), id).not.toContain("onCarriageway");
          expect(stampHeldOnCarriageway(held, doc), id).toEqual(held);
        }
        for (const b of heldStaticContactBodies(id)) {
          expect(Object.keys(b).sort(), id).toEqual(["halfLengthM", "halfWidthM", "headingDeg", "x", "y"]);
        }
      }
    }
  });
});

describe("L7 — every recorder static rect carries the measured fact by value, and only it", () => {
  const sets: Array<[string, string, ObstacleRect2D[]]> = [
    ["scHzBrakeDontSwerve.ts:111", "hz-debris-v1", hzBrakeDontSwerveObstacles()],
    ["scMergeRoadworksShift.ts:122", "hz-roadworks-v1", roadworksConeRects()],
    ["scAcBridgeIce.ts:116", "ac-bridge-v1", bridgeParapetObstacles()],
    ["scEdReverseLine.ts:77", "poligon-v1", reverseLineCurbObstacles()],
    ["scManeuver3Point.ts:53", "ov-narrow-v1", narrowCurbObstacles()],
    ["scManeuverUturn.ts:52", "wb-boulevard-v1", boulevardCurbObstacles()],
    ["scEdPoligonChain.ts:91", "poligon-v1", poligonChainConeObstacles()],
    ["scParkDepth.ts PARK_DEPTH_WALL", "lot-wall-v1", [PARK_DEPTH_WALL]],
    ["scPkDriveway.ts:65", "pk-drive-v1", drivewayObstacles()],
  ];
  // …and every parking-depth drill's own rect set (lot cars + its extra rects).
  for (const drillId of Object.keys(PARK_DEPTH_DRILLS)) {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === drillId);
    const districtId = (spec?.map as { districtId?: string } | undefined)?.districtId;
    if (!districtId) continue;
    sets.push([`scParkDepth.ts ${drillId}`, districtId, parkDepthObstacles(loadDistrict(districtId), drillId as never)]);
  }

  it("flag === (centre on the carriageway), for every static rect; vehicle rects never carry it", () => {
    const census: string[] = [];
    const wrong: string[] = [];
    let flagged = 0;
    for (const [tag, districtId, rects] of sets) {
      for (const r of rects) {
        if (r.withWhat !== "staticObject") {
          if (r.onCarriageway !== undefined) wrong.push(`${tag} ${at(r)}: a ${r.withWhat} rect carries the flag`);
          continue;
        }
        const centre = underAt(districtId, r.x, r.y);
        const c = corners(r.x, r.y, r.headingDeg, r.halfLengthM, r.halfWidthM);
        const onCorners = c.filter(([x, y]) => underAt(districtId, x, y) === "carriageway").length;
        census.push(`${tag} ${at(r)} centre=${centre} corners-on-carriageway=${onCorners}/4 flag=${String(r.onCarriageway)}`);
        const want = centre === "carriageway" ? true : undefined;
        if (r.onCarriageway !== want) wrong.push(`${tag} ${at(r)}: flag ${String(r.onCarriageway)}, centre ${centre}`);
        if (want) flagged++;
      }
    }
    console.log(`L7 recorder static-rect census (the centre decides):\n  ${census.join("\n  ")}`);
    expect(wrong).toEqual([]);
    // Positive control: the census really saw the flagged sets (1 + 10 + 2 + 1, the
    // park-wall wall once as PARK_DEPTH_WALL and once inside its drill's set).
    expect(flagged).toBe(15);
  });

  it("the straddlers keep the off-road copy: centre off the carriageway, corners on it", () => {
    const straddlers: Array<[string, ObstacleRect2D]> = [
      ["poligon-v1", reverseLineCurbObstacles()[0]],
      ["wb-boulevard-v1", boulevardCurbObstacles()[0]],
      ["wb-boulevard-v1", boulevardCurbObstacles()[1]],
      ["pk-drive-v1", drivewayObstacles()[0]],
    ];
    for (const [districtId, r] of straddlers) {
      expect(underAt(districtId, r.x, r.y), at(r)).not.toBe("carriageway");
      const on = corners(r.x, r.y, r.headingDeg, r.halfLengthM, r.halfWidthM).filter(
        ([x, y]) => underAt(districtId, x, y) === "carriageway",
      ).length;
      expect(on, `${at(r)} straddles the kerb`).toBeGreaterThanOrEqual(2);
      expect(r.onCarriageway, at(r)).toBeUndefined();
    }
  });
});

describe("no other collider carries the tag", () => {
  it("the tag reader refuses an NPC tag and the drive-over surface tag", () => {
    expect(isStaticOnCarriagewayUserData(STATIC_ON_CARRIAGEWAY_USER_DATA)).toBe(true);
    expect(isStaticOnCarriagewayUserData({ npcCollider: true, npcId: 3000, kind: "vehicle" })).toBe(false);
    expect(isStaticOnCarriagewayUserData({ districtSurface: true })).toBe(false);
    expect(isStaticOnCarriagewayUserData(undefined)).toBe(false);
    expect(isStaticOnCarriagewayUserData(null)).toBe(false);
  });

  it("the district's world colliders (surface, buildings, island walls) never carry it", () => {
    const lesson = firstRung("sc-hz-brake-dont-swerve");
    const core = buildLessonWorldCore(lesson, loadDistrict(lessonDistrictId(lesson)));
    const flat: unknown[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (n && typeof n === "object" && "props" in (n as object)) {
        const p = (n as { props: Record<string, unknown> }).props;
        flat.push(p.userData);
        walk(p.children);
      }
    };
    walk(WorldColliders({ colliders: core.geometry.colliders }));
    expect(flat.length).toBeGreaterThan(0);
    expect(flat.filter((u) => isStaticOnCarriagewayUserData(u))).toEqual([]);
  });

  it("the collider numbers a stamp rides on are unchanged (it adds a key, never a dimension)", () => {
    expect(PROP_COLLIDER_DIMS.cone.half).toEqual({ x: 0.08, y: 0.25, z: 0.08 });
    expect(WALL_DEFAULT_THICKNESS_M).toBe(0.3);
  });
});
