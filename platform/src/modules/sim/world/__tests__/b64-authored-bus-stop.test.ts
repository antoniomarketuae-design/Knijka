/**
 * B64 (doc 87) — THE BUS STOP THE DRILL ASKS THE STUDENT TO IMAGINE.
 *
 * `sc-sp-harsh-brake` grades a PLANNED stop at y = 180 on `sp-creep-v1`, and
 * its instruction 2 says „представи си, че това е твоята спирка или адрес".
 * The founder's reply was *„the question states stopping out of nowhere, but
 * why?"*, and a drive to the graded stop point confirmed him: the right-hand
 * side of the street was a row of parked cars and three grey extruded boxes.
 * The map DID author a canopy, a shop and a neighbour block — but a `building`
 * is a footprint plus a height, so a bus stop renders exactly like a block of
 * flats.
 *
 * The world already owned the object (`WorldGeometry.busStops` + a shelter kit
 * with a lit face); what it lacked was any way for a map to SAY where one
 * belongs. The derived rule in `builders/props.ts` needs a primary/secondary
 * street with a real junction mouth ≥ 28 m back, and every scenario micro-map
 * fails both halves — `builders/constants.ts` records „sp-creep-v1 … busStops
 * 0" in its own census.
 *
 * `DistrictBuilding.kind: "busStop"` is that sentence. This battery holds the
 * three things that make it real rather than a flag nothing reads:
 *   1. the district still authors the frontage, and now names it;
 *   2. the built world puts a shelter ON THE PAVEMENT beside the graded stop
 *      point, on the same side as the frontage, not across the street;
 *   3. a map that names no stop still builds none (the additive contract), so
 *      the 90 other districts are untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { SIDEWALK_WIDTH_M } from "../builders/constants";
import { assertDistrict, type District } from "../types";

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

function load(id: string): District {
  const raw = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  );
  return assertDistrict(raw);
}

/** The graded stop point of `sc-sp-harsh-brake` (templates-sp.ts `sc-shb-stop`). */
const STOP_Y = 180;
/** Northbound lane centre of the street. */
const LANE_X = 4.06;

describe("B64 — sp-creep-v1 authors a bus stop and the world builds one", () => {
  const district = load("sp-creep-v1");

  it("the canopy frontage is named as a bus stop", () => {
    const canopy = district.buildings.find((b) => b.id === "sp-b-stop-canopy");
    expect(canopy, "sp-b-stop-canopy must still be authored").toBeDefined();
    expect(canopy!.kind).toBe("busStop");
    // It is the frontage of the graded stop point, not somewhere else on the
    // street — the whole claim of the row is „at the place he stops".
    const ys = canopy!.footprint.map(([, y]) => y);
    expect(Math.min(...ys)).toBeLessThanOrEqual(STOP_Y);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(STOP_Y);
  });

  it("the built world places a shelter on the pavement beside the stop point", () => {
    const world = buildWorldGeometry(district);
    expect(world.stats.busStops).toBeGreaterThanOrEqual(1);
    // World space: x is district x, z is −district y (builders/mesh.toWorld).
    const near = world.busStops.filter(
      (t) => Math.abs(-t.position[2] - STOP_Y) <= 10,
    );
    expect(near.length, "a shelter within 10 m of the graded stop point").toBe(1);
    const shelter = near[0];

    // ON THE STUDENT'S SIDE of the road (the frontage is east, x > 0) and
    // BEYOND the kerb — a shelter in the carriageway would be the B29/B30
    // defect with a different prop.
    expect(shelter.position[0]).toBeGreaterThan(LANE_X + 2);
    // …and on the pavement rather than out in the field or inside the
    // building. Bounded by the frontage it belongs to instead of by a guessed
    // number: measured, the street's half-width is 12.125 m, so the pavement
    // runs 12.125 → 15.625 and the shelter lands at 14.275 — 1.35 m in from
    // the back edge and 1.86 m clear of the canopy wall at 16.13.
    const canopy = district.buildings.find((b) => b.id === "sp-b-stop-canopy")!;
    const wallX = Math.min(...canopy.footprint.map(([x]) => x));
    expect(shelter.position[0]).toBeLessThan(wallX);
    expect(wallX - shelter.position[0]).toBeLessThan(SIDEWALK_WIDTH_M);
    // Standing on the pavement top, not sunk or floating.
    expect(shelter.position[1]).toBeGreaterThan(0);
    expect(shelter.position[1]).toBeLessThan(0.5);
  });

  it("ADDITIVE: a sibling street that names no stop still builds none", () => {
    // sp-danger-v1 comes off the same generator with `stopReasonY` absent, so
    // it is the exact control for „did this change every district".
    const sibling = load("sp-danger-v1");
    expect(sibling.buildings.some((b) => b.kind === "busStop")).toBe(false);
    expect(buildWorldGeometry(sibling).stats.busStops).toBe(0);
  });

  it("NON-VACUITY: the derived rule alone would still build nothing here", () => {
    // If someone later makes the derived pass fire on residential two-node
    // streets, this test stops proving that the AUTHORED key is what placed
    // the shelter. Strip the key and the count must go back to zero.
    const stripped: District = {
      ...district,
      buildings: district.buildings.map((b) =>
        b.kind === "busStop" ? { ...b, kind: undefined } : b,
      ),
    };
    expect(buildWorldGeometry(stripped).stats.busStops).toBe(0);
  });
});

/**
 * WAVE 8 — THE THIRD SOURCE: a stop authored as a SPAN, not as a frontage.
 *
 * sc-pk-busstop-ban (critical): «The world does not contain the landmark the
 * lesson is entirely about … The briefing's навес (shelter) is absent … The
 * zone exists only as a translucent teal/amber tint painted by the HUD, so the
 * student is trained to read a coaching overlay instead of the street.»
 *
 * The two maps whose whole lesson IS the stop author it in `meta.scenario`
 * (`busStopPocketY` / `busBayY`) and carry no `kind: "busStop"` building, so
 * BOTH passes above declined and `scene/scenarioSceneryProps.ts` answered with
 * a `kind: "wall"` obstacle — which renders as one flat grey box. props.ts now
 * reads those authored keys itself, through the SAME two helpers the зигзаг
 * painter uses, and places the real modelled shelter.
 */
describe("wave 8 — an authored scenario stop SPAN earns the modelled навес", () => {
  const CASES = [
    // district, span fromY, span toY, drawn ribbon half-width, nearest frontage x
    ["pk-busstop-v1", 180, 210, 8.125, 14.13],
    ["mg-busstop-v1", 130, 176, 20.25, 22.25],
  ] as const;

  it.each(CASES)(
    "%s: one shelter, at the midpoint of its own span and at the kerb",
    (id, fromY, toY, halfWidth, frontageX) => {
      const district = load(id);
      // Neither map may reach this through the frontage pass — that is the
      // whole reason the third source exists.
      expect(district.buildings.some((b) => b.kind === "busStop")).toBe(false);
      const world = buildWorldGeometry(district);
      expect(world.stats.busStops).toBe(1);
      const [shelter] = world.busStops;
      // World space: x is district x, z is −district y.
      expect(-shelter.position[2]).toBeCloseTo((fromY + toY) / 2, 3);
      // AT the kerb, on the pavement, on the stop's own side. The front face is
      // AUTHORED_STOP_KERB_GAP_M (0.35) off the drawn ribbon edge, which is the
      // anchor that works on both edge classes — the parking band moves the
      // decoration-band centre by 4 m between them and the old wall-panel
      // derivation was aimed at that centre.
      expect(shelter.position[0]).toBeGreaterThan(halfWidth);
      expect(shelter.position[0] - halfWidth).toBeLessThan(2);
      // …and never buried in the frontage behind it.
      expect(shelter.position[0]).toBeLessThan(frontageX);
      // Standing on the pavement top, not sunk or floating.
      expect(shelter.position[1]).toBeGreaterThan(0);
      expect(shelter.position[1]).toBeLessThan(0.5);
    },
  );

  it("NON-VACUITY: strip the authored span and the shelter goes with it", () => {
    const district = load("pk-busstop-v1");
    const meta = district.meta as unknown as Record<string, unknown>;
    const scenario = meta.scenario as Record<string, unknown>;
    const stripped: District = {
      ...district,
      meta: {
        ...district.meta,
        scenario: { ...scenario, busStopPocketY: undefined, busBayY: undefined },
      } as typeof district.meta,
    };
    expect(buildWorldGeometry(stripped).stats.busStops).toBe(0);
  });

  it("ADDITIVE: the 103 districts that author no stop span are unchanged", () => {
    // The two controls the зигзаг pass uses, for the same reason: they come off
    // straight-street generators and would be the first to be swept up by a
    // rule that read the archetype instead of the span.
    for (const id of ["pk-stop-v1", "pe-child-v1", "ov-narrow-v1"]) {
      expect(buildWorldGeometry(load(id)).stats.busStops, id).toBe(0);
    }
  });
});
