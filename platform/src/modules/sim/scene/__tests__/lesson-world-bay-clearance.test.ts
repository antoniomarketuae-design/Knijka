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
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario, SCENARIO_TEMPLATES } from "../../lessons/scenario";
import type { ScenarioLevel } from "../../lessons/scenario";

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
