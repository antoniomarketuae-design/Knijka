/**
 * scenery-held-conflicts — the doc 88 gate for HELD dressing.
 *
 * The defect class: **the drill's own prop stops reading as the drill's prop.**
 * Either something else is drawn on the same ground (a curb-pass stranger
 * standing beside the stalled car, a bay neighbour), or the tableau is so
 * sparse that the eye files it as ordinary street furniture — which is exactly
 * what the sweep reported for `sc-hz-accident-scene`: «ONE undamaged dark
 * pickup parked square on the kerb line» where the briefing promises a crash.
 *
 * Everything here reads the SHIPPED artefacts — the committed district JSON,
 * `SCENARIO_TEMPLATES`, the committed traces — and the SHIPPED placement
 * functions. No fixtures, except the two deliberately-broken poses in the
 * negative controls, which exist to prove each check can convict.
 *
 * Measured on this tree, before this wave / after it:
 *
 * | invariant                                                | before | after |
 * |----------------------------------------------------------|--------|-------|
 * | decoration bodies inside a held body's own footprint reach|   12   |   0   |
 * | bodies in the sc-hz-accident-scene tableau                |    2   |   3   |
 * | widest empty kerb INSIDE that tableau, m                  |   7.38 |  0.22 |
 * | broadside bodies in that tableau                          |    0   |   1   |
 * | shadow-line clearance of the tableau, m                   |   0.49 |  0.49 |
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE, scenarioBaysOf } from "@/modules/sim/contracts";
import { SCENARIO_TEMPLATES } from "@/modules/sim/lessons";
import { computeParkedCars, type TrafficDistrict } from "@/modules/sim/traffic";
import { heldSceneryFor, parkedClearZonesFor } from "./scenarioSceneryProps";
import type { ScenarioObstacleSpec } from "./obstacleSpec";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");
/** The lane width LessonScene mounts TrafficLayer with (its own default). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
/** Hero half-width, m — the margin a driven line needs past a body flank. */
const HERO_HALF_W = 0.85;
/** Half a walker's shoulders, m. */
const WALKER_HALF_W = 0.35;
/** Parked-decoration footprint half-extents (the kit's worst case), m. */
const PARKED_HALF_LEN = 2.25;
const PARKED_HALF_W = 0.95;

function loadDistrict(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

function loadTrace(templateId: string, file: string): Array<{ x: number; y: number }> {
  return (
    JSON.parse(
      readFileSync(path.join(REPO_ROOT, "content", "traces", templateId, file), "utf-8"),
    ) as { samples: Array<{ x: number; y: number }> }
  ).samples;
}

// ---------------------------------------------------------------------------
// Geometry — oriented rectangles, because a circle test is what hid this
// ---------------------------------------------------------------------------

interface Rect {
  x: number;
  y: number;
  headingDeg: number;
  halfLenM: number;
  halfWM: number;
}

/** Body-local frame of a pose: heading 0 = +y (north), clockwise. */
function axesOf(headingDeg: number): [[number, number], [number, number]] {
  const r = (headingDeg * Math.PI) / 180;
  return [
    [Math.sin(r), Math.cos(r)], // forward
    [Math.cos(r), -Math.sin(r)], // right
  ];
}

function cornersOf(b: Rect): Array<[number, number]> {
  const [f, s] = axesOf(b.headingDeg);
  const out: Array<[number, number]> = [];
  for (const u of [-b.halfLenM, b.halfLenM]) {
    for (const v of [-b.halfWM, b.halfWM]) {
      out.push([b.x + f[0] * u + s[0] * v, b.y + f[1] * u + s[1] * v]);
    }
  }
  return out;
}

/** Separating-axis test: true when the two footprints share ground. */
function overlaps(a: Rect, b: Rect): boolean {
  const A = cornersOf(a);
  const B = cornersOf(b);
  for (const [nx, ny] of [...axesOf(a.headingDeg), ...axesOf(b.headingDeg)]) {
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const [px, py] of A) {
      const d = px * nx + py * ny;
      a0 = Math.min(a0, d);
      a1 = Math.max(a1, d);
    }
    for (const [px, py] of B) {
      const d = px * nx + py * ny;
      b0 = Math.min(b0, d);
      b1 = Math.max(b1, d);
    }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

/** Distance from a point to a rect's footprint (0 = inside). */
function pointToRect(b: Rect, px: number, py: number): number {
  const [f, s] = axesOf(b.headingDeg);
  const ex = px - b.x;
  const ey = py - b.y;
  const u = Math.abs(ex * f[0] + ey * f[1]) - b.halfLenM;
  const v = Math.abs(ex * s[0] + ey * s[1]) - b.halfWM;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0));
}

/** Axis-aligned y-span of a footprint — how much kerb it actually covers. */
function ySpanOf(b: Rect): [number, number] {
  const ys = cornersOf(b).map(([, y]) => y);
  return [Math.min(...ys), Math.max(...ys)];
}

/** The footprint the scene draws for one held spec. Vehicle extents are the
 *  rigs' own (vehicleFleet TRUCK_DIMENSIONS 7.5 × 2.4; kargo_v body 5.34 ×
 *  1.98; the GLB car kit 4.1 × 1.84 — traffic/types VEHICLE_PROFILE_*). */
function rectOf(o: ScenarioObstacleSpec): Rect {
  const pose = { x: o.x, y: o.y, headingDeg: o.headingDeg };
  switch (o.kind) {
    case "wall":
      return { ...pose, halfLenM: o.lengthM / 2, halfWM: (o.thicknessM ?? 0.3) / 2 };
    case "prop":
      return { ...pose, halfLenM: 0.25, halfWM: 0.25 };
    case "animal":
      return { ...pose, halfLenM: 1.1, halfWM: 0.28 };
    default:
      return o.model === "box_truck"
        ? { ...pose, halfLenM: 3.75, halfWM: 1.2 }
        : o.model === "kargo_v"
          ? { ...pose, halfLenM: 2.67, halfWM: 0.99 }
          : { ...pose, halfLenM: 2.05, halfWM: 0.92 };
  }
}

const TEMPLATES_WITH_DRESSING = SCENARIO_TEMPLATES.filter(
  (s) => heldSceneryFor(`${s.id}@L1`, loadDistrict(s.map.districtId)).length > 0,
);

// ---------------------------------------------------------------------------
// Rule 3 — nothing is parked on top of the lesson's own prop
// ---------------------------------------------------------------------------

describe("rule 3 — the curb pass keeps off the held dressing", () => {
  it("seats no decoration body inside a held footprint's reach, on any drill", () => {
    const tooClose: string[] = [];
    const sharingGround: string[] = [];
    let bodies = 0;
    const parkedDiag = Math.hypot(PARKED_HALF_LEN, PARKED_HALF_W);
    for (const spec of TEMPLATES_WITH_DRESSING) {
      const raw = loadDistrict(spec.map.districtId);
      const held = heldSceneryFor(`${spec.id}@L1`, raw);
      const parked = computeParkedCars(raw, LANE_W, parkedClearZonesFor(`${spec.id}@L1`, raw));
      bodies += parked.length;
      for (const c of parked) {
        const yawDeg = (Math.atan2(Math.sin(c.yaw), Math.cos(c.yaw)) * 180) / Math.PI;
        const body: Rect = {
          x: c.x,
          y: c.y,
          headingDeg: yawDeg,
          halfLenM: PARKED_HALF_LEN,
          halfWM: PARKED_HALF_W,
        };
        for (const h of held) {
          const r = rectOf(h);
          const where =
            `${spec.id}: decoration (${c.x.toFixed(2)}, ${c.y.toFixed(1)}) ` +
            `vs held (${h.x}, ${h.y})`;
          // The rule as stated: a decoration centre may not lie within the two
          // footprints' half-diagonals, whatever their orientations.
          if (Math.hypot(c.x - h.x, c.y - h.y) < Math.hypot(r.halfLenM, r.halfWM) + parkedDiag) {
            tooClose.push(where);
          }
          // …and the stronger statement it implies.
          if (overlaps(r, body)) sharingGround.push(where);
        }
      }
    }
    expect(tooClose).toEqual([]);
    expect(sharingGround).toEqual([]);
    // 458 bodies survive over these templates (470 before rule 3) — the census
    // in scenarioSceneryProps.ts. A change that deleted the rows wholesale
    // would trip this floor.
    expect(bodies).toBe(458);
  }, 120_000);

  it("is what removed them — without rule 3 the same drills seat 12 strangers", () => {
    // The other direction: run the SHIPPED curb pass with the walk/bus-stop
    // zones ONLY, and the twelve come back. This is the check that fails on
    // the old behaviour; the one above is the check that fails if rule 3 is
    // ever widened into deleting streets.
    const perTemplate: Record<string, number> = {};
    for (const spec of TEMPLATES_WITH_DRESSING) {
      const raw = loadDistrict(spec.map.districtId);
      const held = heldSceneryFor(`${spec.id}@L1`, raw);
      const withRule3 = parkedClearZonesFor(`${spec.id}@L1`, raw);
      // Rule 3's circles are exactly one per held body, centred on it and as
      // wide as the two footprints' half-diagonals. Identifying them this way
      // also re-pins the source's per-kind half-diagonals against the extents
      // this file draws with: a mismatch leaves the circle unrecognised and
      // the census below collapses.
      const withoutRule3 = withRule3.filter(
        (z) =>
          !held.some((h) => {
            const r = rectOf(h);
            const want = Math.hypot(r.halfLenM, r.halfWM) + Math.hypot(PARKED_HALF_LEN, PARKED_HALF_W);
            return z.x === h.x && z.y === h.y && Math.abs(z.radiusM - want) < 1e-9;
          }),
      );
      expect(withRule3.length - withoutRule3.length, spec.id).toBe(held.length);
      const before = computeParkedCars(raw, LANE_W, withoutRule3).length;
      const after = computeParkedCars(raw, LANE_W, withRule3).length;
      if (before !== after) perTemplate[spec.id] = before - after;
    }
    expect(perTemplate).toEqual({
      "sc-ov-narrow": 7,
      "sc-pe-parked-row-scan": 2,
      "sc-hazard-obstacle": 1,
      "sc-accident-own-conduct": 1,
      "sc-merge-roadworks-shift": 1,
    });
    expect(Object.values(perTemplate).reduce((a, b) => a + b, 0)).toBe(12);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// The bay guard — the sentence that was not a guard (doc 88, sc-park-van)
// ---------------------------------------------------------------------------

describe("held dressing never shares ground with an occupied bay", () => {
  it("holds on every drill, and sc-park-van's own daylight is 0.79 m", () => {
    const offenders: string[] = [];
    let vanGap = Infinity;
    for (const spec of TEMPLATES_WITH_DRESSING) {
      const raw = loadDistrict(spec.map.districtId);
      const held = heldSceneryFor(`${spec.id}@L1`, raw);
      for (const bay of scenarioBaysOf(raw).filter((b) => b.occupied)) {
        // What lessonWorldRecipe draws in an occupied bay: a civilian car on
        // the bay's own pose.
        const car: Rect = {
          x: bay.x,
          y: bay.y,
          headingDeg: bay.headingDeg,
          halfLenM: 2.05,
          halfWM: 0.92,
        };
        for (const h of held) {
          const r = rectOf(h);
          if (overlaps(r, car)) {
            offenders.push(`${spec.id}: held (${h.x}, ${h.y}) is inside bay ${bay.id}`);
          }
          if (spec.id === "sc-park-van") {
            // Both bodies are broadside to y here, so the axis-aligned span gap
            // IS the flank-to-flank daylight.
            const [hLo, hHi] = ySpanOf(r);
            const [bLo, bHi] = ySpanOf(car);
            vanGap = Math.min(vanGap, Math.max(bLo - hHi, hLo - bHi));
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    // The sweep read the frame as one volume; measured it is 0.79 m — a real
    // 2.7 m bay pitch leaves 0.86 m between two 1.84 m cars.
    expect(vanGap).toBeCloseTo(0.79, 2);
  }, 120_000);

  it("convicts a van moved one bay south (the check is not vacuous)", () => {
    const raw = loadDistrict("lot-van-v1");
    const bay1 = scenarioBaysOf(raw).find((b) => b.id === "lotvn-bay-1");
    expect(bay1?.occupied).toBe(true);
    const car: Rect = {
      x: bay1!.x,
      y: bay1!.y,
      headingDeg: bay1!.headingDeg,
      halfLenM: 2.05,
      halfWM: 0.92,
    };
    const shipped = heldSceneryFor("sc-park-van@L3", raw)[0];
    expect(overlaps(rectOf(shipped), car)).toBe(false);
    // …and the same predicate on the pose the finding describes.
    const moved = rectOf({ ...shipped, y: bay1!.y } as ScenarioObstacleSpec);
    expect(overlaps(moved, car)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sc-hz-accident-scene — the tableau has to read as a crash
// ---------------------------------------------------------------------------

const ACCIDENT = "sc-hz-accident-scene";

describe("the accident tableau reads as a collision, not as a parked row", () => {
  const held = heldSceneryFor(`${ACCIDENT}@L1`, loadDistrict("hz-accident-v1"));
  const rects = held.map(rectOf);

  it("stages more than the two pinned rects, and one of them lies BROADSIDE", () => {
    // Before: two bodies at 20° / −15° — both within 20° of the road, which is
    // how a badly parked car sits, not how a struck one lands.
    expect(held.length).toBeGreaterThanOrEqual(3);
    const broadside = held.filter((o) => Math.abs(Math.sin((o.headingDeg * Math.PI) / 180)) >= 0.9);
    expect(broadside.length).toBeGreaterThanOrEqual(1);
  });

  it("closes the empty kerb the two pinned bodies left between them", () => {
    // The bodies as DRAWN (the GLB car kit, 4.1 × 1.84 — the recorder's rects
    // are 4.5 × 1.8 and are a grading shape, not a picture). Before: y-spans
    // [147.76, 152.24] and [159.78, 164.22] — 7.54 m of clear kerb between two
    // cars, which is a street, not a crash.
    const spans = rects.map(ySpanOf).sort((a, b) => a[0] - b[0]);
    const gaps: number[] = [];
    for (let i = 1; i < spans.length; i++) gaps.push(spans[i][0] - spans[i - 1][1]);
    // 4.80 m and 0.22 m. The wide one is not empty: both staged bystanders
    // stand in it (walks at y = 152 and y = 155.2), which is the briefing's own
    // „хора около тях". The narrow one is the added body jammed against the
    // second wreck — a tangle the eye reads as contact.
    expect(Math.max(...gaps)).toBeLessThan(5.0);
    expect(Math.min(...gaps)).toBeLessThan(0.3);
    // …and nothing interpenetrates: a crash is bodies touching, not bodies
    // inside each other (the very defect this sweep is cataloguing).
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j]), `${i} vs ${j}`).toBe(false);
      }
    }
  });

  it("still leaves the demonstrated-correct line the margin it was recorded with", () => {
    // The other direction: dressing that grew INTO the lane would make the
    // shadow drive through wreckage. The shadow is the artefact, not a guess —
    // its closest approach to the tableau is 2.01 m of body-to-body daylight,
    // and the added body is not the one that sets it.
    const shadow = loadTrace(ACCIDENT, "shadow-correct.trace.json");
    const worstOf = (rs: Rect[]) => {
      let worst = Infinity;
      for (const s of shadow) {
        for (const r of rs) worst = Math.min(worst, pointToRect(r, s.x, s.y) - HERO_HALF_W);
      }
      return worst;
    };
    expect(worstOf(rects)).toBeGreaterThan(1.5);
    // Unchanged by the addition, to the millimetre.
    expect(worstOf(rects)).toBeCloseTo(worstOf(rects.slice(0, 2)), 6);
  });

  it("keeps the two staged bystanders' walks out of the ADDED body", () => {
    // The walks are 2-point polylines with no obstacle query at all
    // (orchestrator/runners.ts), so a body on the line is a walk-through.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === ACCIDENT)!;
    const walks = [...(spec.staged ?? []), ...spec.levels.flatMap((l) => l.stagedAdd ?? [])].filter(
      (e) => e.kind === "pedestrianDartOut",
    );
    expect(walks.length).toBeGreaterThanOrEqual(2);
    // The two PINNED rects are the residual below; everything after them is
    // dressing this file chose, and dressing may not stand on a walker.
    for (const r of rects.slice(2)) {
      for (const w of walks) {
        const ex = w.start.x + w.dir.x * w.travelM;
        const ey = w.start.y + w.dir.y * w.travelM;
        let worst = Infinity;
        for (let t = 0; t <= 1; t += 0.02) {
          worst = Math.min(
            worst,
            pointToRect(r, w.start.x + (ex - w.start.x) * t, w.start.y + (ey - w.start.y) * t),
          );
        }
        expect(worst, `${w.id} vs held (${r.x}, ${r.y})`).toBeGreaterThan(WALKER_HALF_W);
      }
    }
  });

  /**
   * THE RESIDUAL, named with its number so it can only shrink (the doc 86 §10
   * escape-hatch discipline — an entry that starts passing FAILS the gate).
   *
   * `sc-hzac-bystander` WALKS THROUGH the first pinned wreck. His line runs
   * (7.8, 152) → (4.4, 152); the body drawn at (7.0, 150, 20°) covers
   * x ∈ [6.75, 7.50] of it, so 0.75 m of a 3.4 m walk is inside a car and he
   * appears to phase out through its flank. (He also starts 0.10 m off its
   * nose, and inside the recorder's slightly larger graded rect.)
   *
   * Neither end of it is this file's: the wreck pose is the recorder's graded
   * rect (traces/scHzAccidentScene.ts `hzAccidentObstacles`) and moving it
   * breaks three committed traces; the walk is
   * lessons/scenario/templates-hazards2.ts `SC_HZ_ACCIDENT_BYSTANDER`. The fix
   * is one line there — start him off the body, e.g. (9.4, 152) with
   * travelM 5.0, which keeps his end point at x = 4.4 and every timing claim
   * in that spec's own header intact.
   */
  it("records the one walk that still passes through a PINNED wreck", () => {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === ACCIDENT)!;
    const walk = (spec.staged ?? []).find((e) => e.id === "sc-hzac-bystander");
    expect(walk?.kind).toBe("pedestrianDartOut");
    if (walk?.kind !== "pedestrianDartOut") return;
    const ex = walk.start.x + walk.dir.x * walk.travelM;
    const ey = walk.start.y + walk.dir.y * walk.travelM;
    let worst = Infinity;
    for (let t = 0; t <= 1; t += 0.005) {
      worst = Math.min(
        worst,
        pointToRect(rects[0], walk.start.x + (ex - walk.start.x) * t, walk.start.y + (ey - walk.start.y) * t),
      );
    }
    // 0 = the line is inside the body. The day templates-hazards2.ts moves him,
    // this becomes a real clearance and THIS expectation is what has to be
    // deleted with it — a residual that starts passing is itself a failure.
    expect(worst).toBe(0);
  });
});
