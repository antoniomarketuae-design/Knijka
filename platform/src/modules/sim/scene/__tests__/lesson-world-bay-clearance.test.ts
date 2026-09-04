/**
 * THE FRAME: `.audit-frames/sweep161/sc-pk-driveway/pc-right/04-t045s.png` —
 * the whole windscreen is a building facade at arm's length, and by t045s the
 * view is INSIDE the structure: a flat grey floor plane and no exterior. The
 * finding's own words were „either the building has no solid body or the
 * lesson's route is laid across it". Both halves turned out to be true, and
 * only one of them is answerable here.
 *
 * WHAT THIS FILE CAN AND CANNOT SETTLE.
 *
 * The pass-through half is NOT this module's. `sim/collision/index.ts` already
 * records, from frames, that there is NO STATIC-WORLD BODY: `buildOne`
 * (world/builders/buildings.ts) emits one full-height quad per footprint edge
 * — no floor triangle, no roof cap — WorldColliders merges them into a single
 * trimesh, and cars are photographed on the far side of it still being graded
 * (sc-ac-night-overdrive pc-wrong t039s is flush inside a facade at 95 км/ч).
 * Nothing in `lessonWorldRecipe.ts` authors or owns a collider, so that half is
 * routed, not fixed. See the lane report.
 *
 * The PROXIMITY half is this module's, because `buildLessonWorldCore` is the
 * one function in the codebase that holds the lesson's graded parking bay and
 * the district's building footprints at the same time — it literally builds
 * `paintBays` from `lesson.parkingBay` beside the `raw` document that carries
 * `buildings`. Nothing checked that the place a student is ordered to park is
 * clear of the scenery, and a bay pressed against a wall is what turns a
 * missing collider from a latent bug into a photographed one.
 *
 * THE MEASUREMENT (this file's own sweep, §1). Across every scenario lesson
 * with both a graded bay and authored buildings, the gap from bay rect to
 * nearest footprint is:
 *
 *     sc-pk-driveway ........  1.50 m   ← the frame
 *     sc-ed-poligon-chain ... 29.50 m
 *     the other 15 .......... 46.36 – 61.57 m
 *
 * The offender is not merely tight; it is twenty times closer than anything
 * else in the catalogue. That is what makes a floor defensible rather than
 * invented: it separates one lesson from a population that is nowhere near it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * §2 — THE GROUND UNDER THE BAY, added 2026-08-24 because §1 CLOSED NOTHING.
 *
 * §1 shipped a distance and a quarantine and the finding stayed OPEN, which is
 * the correct outcome for a measurement that measures the wrong property.
 * „A wall is 1.5 m away" is a fact about the scenery. It does not say whether
 * the student can carry out the order he is given, and that is the question the
 * frame is asking: `04-t045s.png` is the windscreen of a car that never once
 * left gear D on any lane of any platform, on a drill whose entire subject is
 * reverse.
 *
 * SO THIS SECTION MEASURES THE ORDER INSTEAD: is the rect a student is told to
 * park inside made of ground a car can be driven onto? It is built through the
 * SHIPPED recipe — `buildLessonWorldCore` — and read off the meshes that recipe
 * produces, not off the JSON, so it answers about the world the student is in.
 *
 * THE RESULT, over every scenario lesson with a graded bay (17), sampling each
 * bay rect on a 5 × 3 lattice — 15 stations, corners included:
 *
 *     16 of 17 .............. 15/15 stations on the driven carriageway
 *     sc-pk-driveway .......   9/15 on the carriageway, 6/15 on the RAISED
 *                              SIDEWALK — the 12 cm kerb that `WorldColliders`
 *                              mounts as a trimesh the wheels must climb
 *
 * The split is not marginal and it is not a sampling artefact: `PK_DRIVE_TARGET
 * _BAY` is (8, 45) 2.7 × 5 at heading 90°, so its long axis runs EAST and its
 * stations stand at x = 5.5 / 6.75 / 8 / 9.25 / 10.5. The carriageway's own
 * built edge — `roadSurface`'s outermost vertex — is x = 8.125. The outer
 * 2.375 m of a 5 m bay, 47.5% of the cell, is painted on the pavement.
 *
 * WHAT THAT DOES TO THE STUDENT, WHICH IS WHY IT IS THE ROOT AND §1 IS NOT.
 * `sc-pkd-park` is a `parkInBay` with `centerTolM: 0.5`, so the car's centre
 * must come to rest within 0.5 m of x = 8 — and a car is ~4.4 m long lying
 * along that same east axis. At the most favourable pose inside tolerance the
 * body still reaches x ≈ 10.2, i.e. roughly two metres of car, including an
 * axle, has to be up over a kerb before the objective can tick. The manoeuvre
 * the drill exists to teach is not merely hard on this map; it is graded
 * against a rectangle that is half kerb, with a 15–25 m facade 1.5 m past its
 * head (§1). „Задача 2" going unticked on all four lanes, and the windscreen
 * being facade, are the same defect seen from two ends.
 *
 * THE PAINT IS THE OTHER HALF OF IT AND IT IS THIS MODULE'S OWN OUTPUT.
 * `buildLessonWorldCore` pushes `lesson.parkingBay` into `paintBays` and
 * `buildWorldGeometry` draws the white U into `markings`, which is co-planar
 * with the ROAD surface. MEASURED on the built meshes: the U's vertices in the
 * bay's y-band reach x = 10.63 at height 0.032 m, while the ground they stand
 * over from x = 8.125 outward is the sidewalk, top at ROAD_Y + CURB_HEIGHT_M =
 * 0.14 m. The outer 2.375 m of the graded cell is therefore painted about
 * 0.11 m BELOW the pavement covering it: the cell the student can SEE is the
 * 60% on asphalt, the cell he is MEASURED against is the whole rect. The L7
 * „painted rect equals graded rect" law holds in the data and fails on the
 * glass. Both numbers are asserted in the quarantine below, not just written
 * here.
 *
 * THE OWNERS WERE NAMED RATHER THAN IMPLIED, AND ONE OF THEM ANSWERED. Moving
 * the bay is `lessons/scenario/templates-pk.ts` (`PK_DRIVE_TARGET_BAY`, pinned
 * value-for-value against `traces/scPkDriveway.ts PK_DRIVE_TARGET_BAY`, so both
 * move together or neither does); moving the garage or opening a dropped kerb
 * across the driveway mouth is `tools/maps/gen_pk_driveway.mjs` +
 * `public/world/pk-drive-v1.json`. The MOUTH is the half that landed:
 * `meta.scenario.drivewayMouths` declares a 6 m span and `world/builders/
 * roads.ts` ramps the pavement down to ROAD_Y across it, so the six off-road
 * stations now stand on an apron 12 mm UNDER the paint instead of 108 mm over
 * it. The station split is deliberately unchanged — the strip is ramped, not
 * cut — so the quarantine below keeps its 9 and 6 and gains the HEIGHT, which
 * is the number that separates a driveway from a step. The 1.5 m garage
 * clearance of §1 is untouched and still quarantined.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario, SCENARIO_TEMPLATES } from "../../lessons/scenario";
import type { ScenarioLevel } from "../../lessons/scenario";
import { buildLessonWorldCore } from "../lessonWorldRecipe";
import { ROAD_Y, SIDEWALK_TOP_Y, type MeshData } from "../../world";

/**
 * Floor for the gap between a graded bay and any building footprint. Chosen
 * from the census above, not from taste: the healthy population starts at
 * 29.50 m, so 10 m sits far below every lesson that is fine and far above the
 * one that is not. A car is 5 m long — 10 m of clearance is the difference
 * between „a wall is nearby" and „the windscreen is a wall".
 */
export const BAY_BUILDING_CLEARANCE_FLOOR_M = 10;

/**
 * THE ONE KNOWN OFFENDER, quarantined by NAME and by VALUE.
 *
 * This is deliberately not an exemption that merely skips the row — that is
 * the shape of tautology that let the spawn-lamp defect sit for seven rounds
 * (see spawnHeadlights.test.ts). The pinned distance is asserted too, so the
 * day the owning lane moves the bay (templates-parking, not ours) or moves the
 * garage (`public/world/pk-drive-v1.json`, not ours) THIS TEST FAILS and the
 * quarantine must be deleted rather than quietly inherited.
 */
const QUARANTINE = { templateId: "sc-pk-driveway", clearanceM: 1.5 };

interface Bay {
  x: number;
  y: number;
  headingDeg: number;
  widthM: number;
  lengthM: number;
}

/** Axis-aligned bounds of a bay rect. Heading 0 = +y (district convention). */
function bayBounds(b: Bay) {
  const rad = (b.headingDeg * Math.PI) / 180;
  const hx = (Math.abs(Math.sin(rad)) * b.lengthM) / 2 + (Math.abs(Math.cos(rad)) * b.widthM) / 2;
  const hy = (Math.abs(Math.cos(rad)) * b.lengthM) / 2 + (Math.abs(Math.sin(rad)) * b.widthM) / 2;
  return { minX: b.x - hx, maxX: b.x + hx, minY: b.y - hy, maxY: b.y + hy };
}

/** Gap between the bay rect and a footprint's bounds; -1 when they overlap. */
function clearanceM(bb: ReturnType<typeof bayBounds>, footprint: number[][]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of footprint) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const dx = Math.max(minX - bb.maxX, bb.minX - maxX, 0);
  const dy = Math.max(minY - bb.maxY, bb.minY - maxY, 0);
  return dx === 0 && dy === 0 ? -1 : Math.hypot(dx, dy);
}

interface Row {
  templateId: string;
  districtId: string;
  clearanceM: number;
  buildingId: string;
}

const CENSUS: Row[] = (() => {
  const out: Row[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    let lesson;
    try {
      lesson = compileScenario(spec, spec.levels[0].level as ScenarioLevel);
    } catch {
      continue;
    }
    const bay = lesson.parkingBay as Bay | undefined;
    if (!bay) continue;
    const districtId = lesson.world!.districtId;
    const file = path.resolve(__dirname, `../../../../../public/world/${districtId}.json`);
    if (!fs.existsSync(file)) continue;
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
      buildings?: { id: string; footprint: number[][] }[];
    };
    const buildings = doc.buildings ?? [];
    if (buildings.length === 0) continue;
    const bb = bayBounds(bay);
    let best = Infinity;
    let bestId = "";
    for (const b of buildings) {
      const c = clearanceM(bb, b.footprint);
      if (c < best) {
        best = c;
        bestId = b.id;
      }
    }
    out.push({ templateId: spec.id, districtId, clearanceM: best, buildingId: bestId });
  }
  return out;
})();

describe("graded parking bay vs authored buildings", () => {
  it("the census is real — bays and buildings actually meet in this catalogue", () => {
    // A sweep that silently found nothing would pass every assertion below.
    // Every "0 defects" report in this project was an instrument bug, so the
    // population is asserted before anything is concluded from it.
    expect(CENSUS.length, "no lesson has both a graded bay and buildings").toBeGreaterThanOrEqual(
      15,
    );
    expect(CENSUS.some((r) => r.templateId === QUARANTINE.templateId)).toBe(true);
  });

  it("no bay overlaps a building footprint outright", () => {
    const inside = CENSUS.filter((r) => r.clearanceM < 0);
    expect(inside.map((r) => `${r.templateId} inside ${r.buildingId}`)).toEqual([]);
  });

  it("every lesson but the known offender clears the floor", () => {
    const offenders = CENSUS.filter(
      (r) =>
        r.templateId !== QUARANTINE.templateId &&
        r.clearanceM < BAY_BUILDING_CLEARANCE_FLOOR_M,
    );
    expect(
      offenders.map((r) => `${r.templateId} (${r.districtId}): ${r.clearanceM.toFixed(2)} m to ${r.buildingId}`),
    ).toEqual([]);
  });

  it("the healthy population really is nowhere near the floor", () => {
    // This is what makes the floor a measurement rather than a preference: if
    // the catalogue ever drifts down toward 10 m the separation is gone and
    // the constant must be re-derived, not nudged.
    const healthy = CENSUS.filter((r) => r.templateId !== QUARANTINE.templateId);
    const min = Math.min(...healthy.map((r) => r.clearanceM));
    expect(min, `closest healthy lesson: ${min.toFixed(2)} m`).toBeGreaterThan(25);
  });

  it("sc-pk-driveway is STILL parked 1.5 m from the garage — quarantine tripwire", () => {
    // `.audit-frames/sweep161/sc-pk-driveway/pc-right/04-t045s.png`.
    // Bay (8, 45) 2.7 × 5 heading 90 → x ∈ [5.5, 10.5]; `pkd-b-garage`
    // footprint x ∈ [12, 18], y ∈ [37, 53], height 4 m. The nose of a parked
    // car sits 1.5 m off a four-metre wall, which is why the frame is facade.
    //
    // NOT OURS TO MOVE: the bay is authored in the parking templates and the
    // garage in `public/world/pk-drive-v1.json`. When either moves, this fails
    // and whoever moved it deletes the quarantine above.
    const row = CENSUS.find((r) => r.templateId === QUARANTINE.templateId)!;
    expect(row.buildingId).toBe("pkd-b-garage");
    expect(row.clearanceM).toBeCloseTo(QUARANTINE.clearanceM, 2);
    expect(row.clearanceM).toBeLessThan(BAY_BUILDING_CLEARANCE_FLOOR_M);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §2 — THE GROUND UNDER THE BAY (see the header block).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stations across the bay rect, as fractions of its own length and width.
 * Five × three = 15, corners included, so the lattice reaches the rect's
 * extremes rather than sampling a comfortable interior — a centre-only probe
 * would have called `sc-pk-driveway` clean.
 */
const LENGTH_STATIONS = [-0.5, -0.25, 0, 0.25, 0.5] as const;
const WIDTH_STATIONS = [-0.5, 0, 0.5] as const;
const BAY_STATIONS = LENGTH_STATIONS.length * WIDTH_STATIONS.length;

/** Station poses of a bay rect, district space. Heading 0 = +y, and the length
 *  axis is [sin h, cos h] — `markings`' own axes, so a 45° bay is sampled
 *  along its diagonal exactly as it is painted. */
function bayStations(b: Bay): Array<[number, number]> {
  const h = (b.headingDeg * Math.PI) / 180;
  const dx = Math.sin(h);
  const dy = Math.cos(h);
  const out: Array<[number, number]> = [];
  for (const sl of LENGTH_STATIONS) {
    for (const sw of WIDTH_STATIONS) {
      out.push([
        b.x + sl * b.lengthM * dx + sw * b.widthM * dy,
        b.y + sl * b.lengthM * dy - sw * b.widthM * dx,
      ]);
    }
  }
  return out;
}

/**
 * Is the district-space point (px, py) covered by this built mesh?
 *
 * The meshes are WORLD space and the sim's world axes are (x, height, z) with
 * district y = −z — the same convention `LessonScene` uses when it feeds the
 * shadow trace and anchors traffic (`y: -anchorPose.z`, `armSignalPlan`s own
 * comment: „district y = −world z"). Getting that sign wrong is the
 * one way this whole section could be quietly nonsense, which is why the
 * control test below drives the district's OWN spawn points through it: a
 * flipped sign puts every spawn off the road and goes red immediately.
 */
function overMesh(mesh: MeshData, px: number, py: number): boolean {
  const p = mesh.positions;
  const ix = mesh.indices;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const a = ix[t] * 3;
    const b = ix[t + 1] * 3;
    const c = ix[t + 2] * 3;
    const ax = p[a];
    const ay = -p[a + 2];
    const bx = p[b];
    const by = -p[b + 2];
    const cx = p[c];
    const cy = -p[c + 2];
    // Cheap triangle-bbox reject before the three half-plane tests.
    if (px < Math.min(ax, bx, cx) || px > Math.max(ax, bx, cx)) continue;
    if (py < Math.min(ay, by, cy) || py > Math.max(ay, by, cy)) continue;
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

/**
 * The HEIGHT this mesh stands at over (px, py), m — the tallest containing
 * triangle, barycentrically interpolated, or null where nothing covers it.
 *
 * `overMesh` answers „is there pavement here", which stopped being the whole
 * question when a driveway mouth could drop its kerb: the strip still covers
 * the mouth, at road level. A station that is 12 cm up is a step an axle has to
 * climb and paint it hides; the same station at ROAD_Y is an apron.
 */
function meshTopAt(mesh: MeshData, px: number, py: number): number | null {
  const p = mesh.positions;
  const ix = mesh.indices;
  let top: number | null = null;
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const a = ix[t] * 3;
    const b = ix[t + 1] * 3;
    const c = ix[t + 2] * 3;
    const ax = p[a];
    const ay = -p[a + 2];
    const bx = p[b];
    const by = -p[b + 2];
    const cx = p[c];
    const cy = -p[c + 2];
    if (px < Math.min(ax, bx, cx) || px > Math.max(ax, bx, cx)) continue;
    if (py < Math.min(ay, by, cy) || py > Math.max(ay, by, cy)) continue;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-9) continue; // a collapsed kerb face carries no top
    const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
    const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
    const w2 = 1 - w0 - w1;
    if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
    const h = w0 * p[a + 1] + w1 * p[b + 1] + w2 * p[c + 1];
    if (top === null || h > top) top = h;
  }
  return top;
}

interface GroundRow {
  templateId: string;
  districtId: string;
  /** Stations standing on the DRIVEN carriageway (road ribbon or junction fill). */
  onCarriageway: number;
  /** Stations standing on the raised sidewalk — the 12 cm kerb trimesh. */
  onSidewalk: number;
  /** Stations on neither: bare ground. */
  elsewhere: number;
  /** Outermost carriageway vertex of this district, m — the built kerb line. */
  carriagewayEdgeM: number;
  /** Farthest bay station from the road centre line, m. */
  bayReachM: number;
  /** Farthest PAINT vertex from the centre line inside the bay's own y-band,
   *  m — how far out the white U is actually drawn. */
  paintReachM: number;
  /** Height that paint is drawn at, m (markings is co-planar with the road). */
  paintTopM: number;
  /** Tallest pavement standing under a bay station, m — 0 where none does.
   *  ROAD_Y means a dropped kerb: an apron, not a step. */
  walkTopUnderBayM: number;
  /** Every spawn point the district authors, and whether it is on asphalt. */
  spawnsOnCarriageway: number;
  spawnCount: number;
  /** A point 1 km beyond the district bounds — must read OFF the carriageway. */
  offMapReadsOn: boolean;
}

const GROUND: GroundRow[] = (() => {
  const out: GroundRow[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    let lesson;
    try {
      lesson = compileScenario(spec, spec.levels[0].level as ScenarioLevel);
    } catch {
      continue;
    }
    const bay = lesson.parkingBay as Bay | undefined;
    if (!bay) continue;
    const districtId = lesson.world!.districtId;
    const file = path.resolve(__dirname, `../../../../../public/world/${districtId}.json`);
    if (!fs.existsSync(file)) continue;
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    // THROUGH THE SHIPPED RECIPE, not a re-listing of it: this is the same
    // call `LessonScene` makes in its district-load effect, so the ground measured
    // here is the ground rendered and collided in the drill.
    const core = buildLessonWorldCore(lesson, raw);
    const { roadSurface, junctionSurface, sidewalks } = core.geometry;
    const onRoad = (x: number, y: number) =>
      overMesh(roadSurface, x, y) || overMesh(junctionSurface, x, y);

    let carriageway = 0;
    let walk = 0;
    let elsewhere = 0;
    let walkTop = 0;
    for (const [x, y] of bayStations(bay)) {
      if (onRoad(x, y)) carriageway++;
      else if (overMesh(sidewalks, x, y)) {
        walk++;
        walkTop = Math.max(walkTop, meshTopAt(sidewalks, x, y) ?? 0);
      } else elsewhere++;
    }

    let edge = 0;
    for (let i = 0; i < roadSurface.positions.length; i += 3) {
      edge = Math.max(edge, Math.abs(roadSurface.positions[i]));
    }
    let reach = 0;
    for (const [x] of bayStations(bay)) reach = Math.max(reach, Math.abs(x));

    // How far out the WHITE U is actually drawn, read off the markings mesh
    // inside the bay's own y-band, and at what height. `markings` is co-planar
    // with the road, so paint standing past the kerb line is paint drawn under
    // a pavement — a cell the student is graded on and cannot see.
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of bayStations(bay)) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    let paintReach = 0;
    let paintTop = 0;
    const mp = core.geometry.markings.positions;
    for (let i = 0; i < mp.length; i += 3) {
      const y = -mp[i + 2];
      if (y < minY || y > maxY) continue;
      if (Math.abs(mp[i]) > paintReach) paintReach = Math.abs(mp[i]);
      paintTop = Math.max(paintTop, mp[i + 1]);
    }

    const b = (raw as { meta: { boundsLocalMeters: { maxX: number; maxY: number } } }).meta
      .boundsLocalMeters;
    out.push({
      templateId: spec.id,
      districtId,
      onCarriageway: carriageway,
      onSidewalk: walk,
      elsewhere,
      carriagewayEdgeM: edge,
      bayReachM: reach,
      paintReachM: paintReach,
      paintTopM: paintTop,
      walkTopUnderBayM: walkTop,
      spawnsOnCarriageway: core.spawnPoints.filter((s) => onRoad(s.x, s.y)).length,
      spawnCount: core.spawnPoints.length,
      offMapReadsOn: onRoad(b.maxX + 1000, b.maxY + 1000),
    });
  }
  return out;
})();

/**
 * THE ONE OFFENDER, quarantined by NAME and by VALUE, exactly as §1's is.
 * 9 stations on the carriageway and 6 on the kerb, from a bay whose outer edge
 * stands 2.375 m past the built carriageway edge. Whoever moves
 * `PK_DRIVE_TARGET_BAY` (templates-pk.ts) or the street's cross-section
 * (gen_pk_driveway.mjs) breaks this and deletes it — a repair that leaves this
 * green did not reach the ground the student parks on.
 */
const GROUND_QUARANTINE = {
  templateId: "sc-pk-driveway",
  onCarriageway: 9,
  onSidewalk: 6,
  pastTheKerbM: 2.375,
};

describe("the graded bay stands on ground a car can be driven onto", () => {
  it("the census is real, and the ground test discriminates", () => {
    // THREE separate ways this section could be a tautology, all closed here,
    // because every "0 defects" report in this project so far was an
    // instrument bug rather than a clean product.
    //
    //  (a) an empty population passes every assertion below;
    //  (b) an `overMesh` that always returns TRUE passes „15/15 on the
    //      carriageway" for the whole catalogue — the off-map probe kills it;
    //  (c) an `overMesh` that always returns FALSE (or a flipped z sign) would
    //      make the healthy population read 0/15 — the spawn-point control
    //      kills it, since every scenario spawn is authored on a carriageway
    //      and validated as such by the generators' own post-checks.
    expect(GROUND.length, "no scenario lesson has a graded bay").toBeGreaterThanOrEqual(15);
    expect(GROUND.some((r) => r.templateId === GROUND_QUARANTINE.templateId)).toBe(true);

    const offMap = GROUND.filter((r) => r.offMapReadsOn);
    expect(offMap.map((r) => r.districtId), "a point 1 km off the map read as road").toEqual([]);

    const strandedSpawns = GROUND.filter((r) => r.spawnsOnCarriageway !== r.spawnCount);
    expect(
      strandedSpawns.map((r) => `${r.districtId}: ${r.spawnsOnCarriageway}/${r.spawnCount}`),
      "a district spawn point did not read as carriageway",
    ).toEqual([]);
  });

  it("every lesson but the known offender is graded on asphalt end to end", () => {
    const offenders = GROUND.filter(
      (r) => r.templateId !== GROUND_QUARANTINE.templateId && r.onCarriageway !== BAY_STATIONS,
    );
    expect(
      offenders.map(
        (r) =>
          `${r.templateId} (${r.districtId}): ${r.onCarriageway}/${BAY_STATIONS} road, ` +
          `${r.onSidewalk} kerb, ${r.elsewhere} bare`,
      ),
    ).toEqual([]);
  });

  it("sc-pk-driveway is STILL graded half on the pavement — quarantine tripwire", () => {
    // `.audit-frames/sweep161/sc-pk-driveway/pc-right/04-t045s.png`, and the
    // sibling row that says gear D never moved on any lane.
    const row = GROUND.find((r) => r.templateId === GROUND_QUARANTINE.templateId)!;
    expect(row.onCarriageway).toBe(GROUND_QUARANTINE.onCarriageway);
    expect(row.onSidewalk).toBe(GROUND_QUARANTINE.onSidewalk);
    expect(row.elsewhere, "the off stations are kerb, not bare ground").toBe(0);
    // …and the same defect in metres, DERIVED from the built world rather than
    // typed in: the outermost carriageway vertex against the bay's own reach.
    expect(row.bayReachM - row.carriagewayEdgeM).toBeCloseTo(
      GROUND_QUARANTINE.pastTheKerbM,
      3,
    );
    // AND THE HALF OF IT THE STUDENT COULD NOT SEE — NOW THE MOUTH IS OPEN.
    //
    // The white U really is drawn out past the kerb line (`markings` reaches
    // x = 10.63 here) at road level, 0.032 m. Until the driveway mouth existed
    // the ground under that span was the pavement top, ROAD_Y + CURB_HEIGHT_M
    // = 0.14 m, so the outer 2.375 m of the graded cell was painted 0.11 m
    // BELOW the sidewalk covering it and the student was measured against a
    // cell he could see 60 % of. `gen_pk_driveway.mjs` now declares a 6 m
    // `drivewayMouths` span and `builders/roads.ts` ramps the kerb down to
    // ROAD_Y across it, so the six off-road stations stand on an APRON.
    //
    // The station count is unchanged ON PURPOSE: the strip is ramped, not cut,
    // so the pavement still covers the mouth and `onSidewalk` still reads 6.
    // The height is the assertion that separates the two worlds — a repair
    // that leaves this at 0.14 has drawn a driveway and kept the step.
    expect(row.paintReachM).toBeGreaterThan(row.carriagewayEdgeM);
    expect(row.paintTopM).toBeLessThan(0.12);
    expect(row.walkTopUnderBayM, "the driveway mouth is still a 12 cm step").toBeCloseTo(
      ROAD_Y,
      3,
    );
    expect(
      row.paintTopM,
      "the graded rect is painted under the ground it stands on",
    ).toBeGreaterThan(row.walkTopUnderBayM);
  });

  it("the dropped kerb is local to the mouth — the rest of the street keeps its 12 cm", () => {
    // The tautology this closes: a `meshTopAt` that always returned ROAD_Y, or
    // a ramp applied to the whole strip, would pass the row above and would
    // have deleted the pavement of a residential street. Sampled on the SAME
    // mesh, on the same side, 20 m north and south of the driveway.
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === GROUND_QUARANTINE.templateId)!;
    const lesson = compileScenario(spec, spec.levels[0].level as ScenarioLevel);
    const raw: unknown = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, `../../../../../public/world/${lesson.world!.districtId}.json`),
        "utf8",
      ),
    );
    const { sidewalks } = buildLessonWorldCore(lesson, raw).geometry;
    const bay = lesson.parkingBay as Bay;
    const x = 9.5; // between the kerb line (8.125) and the pavement's outer edge
    for (const dy of [-20, 20]) {
      expect(meshTopAt(sidewalks, x, bay.y + dy), `pavement at y ${bay.y + dy}`).toBeCloseTo(
        SIDEWALK_TOP_Y,
        3,
      );
    }
  });

  it("the healthy population is not merely inside the kerb, it is clear of it", () => {
    // What makes „15/15" a measurement rather than a lucky lattice: on every
    // healthy lesson the bay's farthest station is INSIDE the carriageway
    // edge, so the whole rect is asphalt however finely it is sampled.
    const healthy = GROUND.filter((r) => r.templateId !== GROUND_QUARANTINE.templateId);
    const worst = Math.max(...healthy.map((r) => r.bayReachM - r.carriagewayEdgeM));
    expect(worst, `closest healthy bay to its kerb: ${worst.toFixed(2)} m`).toBeLessThan(0);
  });
});
