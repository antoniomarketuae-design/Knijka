/**
 * catalogue-demo-curvature:dae908c7, family «curvpark2», round 3 — ЗДвП чл. 35,
 * ал. 2's PRECONDITION, MEASURED ON THE PRODUCT CHASSIS (integrator ruling
 * CP2-1bis (1), 2026-11-06).
 *
 * THE QUESTION. ЗДвП чл. 15, ал. 1 binds on lot-perp-v1's two-way `service`
 * aisle. Three of the six parking lessons set the car up LEFT of its centre
 * line: sc-park-perp-forward (x −4.6, the turn-in of a forward entry),
 * sc-park-perp-rev (x −0.5) and sc-park-narrow (x −1.6, the setups of a
 * reverse entry). чл. 35, ал. 2 (content/law/acts/zdvp.json) licenses that
 * only «Когато радиусът на завиване на пътното превозно средство е по-голям от
 * радиуса на завоя»: when no entry made from the right part reaches the bay.
 * That is a fact about the car and the lot, so it is measured, not assumed:
 * the product's own chassis at its PHYSICS limit (full lock, ≈ 4.17 m body
 * circle — not the demos' 4.6 m programme), wound AT REST so the steering rate
 * costs nothing (the tightest entry a driver can make), started square on the
 * aisle wholly right of the centre line (centre x ≥ the car's half width
 * 0.85 m, its right side short of the parked noses at x 2.78), rolled at
 * walking pace on full lock, then aligned and rolled into the bay
 * (./parkLimitEntry.ts). A start that ends at rest in the bay, square, with no
 * contact, refutes the precondition.
 *
 * THE MEASUREMENT (scratch sweeps of the lane; this pin re-drives a grid
 * through the best of them):
 *   · sc-park-perp-forward — 0 clean of 2884 drives (start x 0.85–1.85, turn-in
 *     y −8…−1, unwinding lead 0–40°, and starts angled 5–20° left with every
 *     corner right of the line). The best ends square in the bay 0.065 m INTO
 *     a neighbour (x 0.85, y −2.8; vela_h3 #1); with the cars mounted the
 *     chassis strikes it. The precondition HOLDS: the forward entry's left-half
 *     start stands under ал. 2 (the left-half distance, the duty and the
 *     citation are pinned in ./park-family-drivable.test.ts block 7).
 *   · sc-park-perp-rev — a right-half reverse entry PARKS CLEAN: from (0.85,
 *     5.25), its left side on the centre line, full lock, it rests centred
 *     (3.1°) in lot-bay-3 0.116 m clear of dret_90 #2, both tasks done, 0 т.
 *     at every rung, the cars mounted.
 *   · sc-park-narrow — the same, from (0.85, 5.2): 0.003 m clear of dret_90
 *     #2, resting 5.5° and 0.14 m off centre — inside the 7° / 0.35 m the
 *     lesson accepts — both tasks done, 0 т. at every rung.
 *   These two full-lock entries are RECORDED FACT, not the precondition.
 *   Round 3 read them as the precondition and stopped on them; integrator
 *   ruling CP2-1ter (2026-11-08) then ruled that for the reverse set-ups the
 *   precondition is read on the DRIVABLE PROGRAMME WITH THE DEMO FLOOR — «no
 *   right-half start enters the bay on the 4.6 m programme keeping ≥ 0.25 m
 *   from every parked car» — a turning radius that exists only at full lock
 *   wound at rest, 0.116 / 0.003 m off a parked car, is not one a driver turns
 *   on. On that reading the precondition HOLDS (measured in
 *   ./park-family-drivable.test.ts block 8: the kit refuses the right-half
 *   swing, and every 4.6 m swing from a right-half line overlaps dret_90 #2),
 *   and the reverse lessons are BUILT under чл. 35, ал. 2 (rounds 4–5: the
 *   left half only for the swing's start, on the two-stage set-up of
 *   CP2-1quater; the duty and the citation pinned there). The two drives are
 *   pinned below so the fact is re-measured, not remembered.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { compileScenario } from "../../lessons/scenario/compile";
import { scenarioById } from "../../lessons/scenario/templates";
import type { ScenarioLevel } from "../../lessons/scenario/types";
import { initRapier } from "../../lessons/scenario/__tests__/rapierContactDrive";
import { lotObstacleRects } from "../scParkPerpRev";
import { lessonBoxSets } from "./parkDepthProduct";
import { driveLimitEntry, HERO_HALF_WIDTH_M, type LimitEntryOutcome } from "./parkLimitEntry";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const BAY = { x: 5.03, y: 0 };
/** The parked noses of lot-perp-v1 / lot-narrow-v1 (bay centre x 5.03 − depth 5 / 2). */
const NOSES_X = 2.78;

function lesson(id: string, district: string) {
  const raw = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${district}.json`), "utf-8"));
  return { raw, sets: lessonBoxSets(raw, id, lotObstacleRects(raw)) };
}

beforeAll(async () => {
  await initRapier();
});

describe("curvpark2 round 3 — sc-park-perp-forward: no forward entry begun wholly in the aisle's right half reaches the bay clean, even at full lock (ЗДвП чл. 35, ал. 2 holds)", () => {
  it("the grid through the sweep's best: every start ends in a neighbour; the best still overlaps one by more than 5 cm, and with the cars mounted the chassis strikes it", () => {
    const id = "sc-park-perp-forward";
    const { raw, sets } = lesson(id, "lot-perp-v1");
    const L1 = compileScenario(scenarioById(id)!, 1);
    const slack = (2.7 - 2 * HERO_HALF_WIDTH_M) / 2;
    let best: LimitEntryOutcome | null = null;
    let n = 0;
    for (const x0 of [HERO_HALF_WIDTH_M, 0.95, 1.05, 1.45, NOSES_X - HERO_HALF_WIDTH_M - 0.08]) {
      expect(x0 - HERO_HALF_WIDTH_M, "wholly right of the centre line").toBeGreaterThanOrEqual(0);
      for (let i = 0; i <= 8; i++) {
        const y0 = +(-3.2 + 0.1 * i).toFixed(2);
        for (const lead of [0, 10]) {
          const r = driveLimitEntry({ lesson: L1, raw, parked: sets.live, bay: BAY, kind: "forward", x0, y0, leadDeg: lead, inBayM: slack, mount: false });
          n++;
          expect(r.parked, `(${x0}, ${y0}) lead ${lead}: gap ${r.minGap.m.toFixed(3)} on ${r.minGap.model}#${r.minGap.index}`).toBe(false);
          const inBay = r.rest.x >= BAY.x - 0.3 && Math.abs(r.rest.y - BAY.y) <= slack && Math.abs(r.rest.headingDeg - 90) <= 6;
          if (inBay && (!best || r.minGap.m > best.minGap.m)) best = r;
        }
      }
    }
    expect(n).toBe(90);
    expect(best, "some right-half start ends square in the bay — through a neighbour").not.toBeNull();
    expect(best!.minGap.m, `best (${best!.x0}, ${best!.y0}) lead ${best!.leadDeg}: ${best!.minGap.m.toFixed(3)} m on ${best!.minGap.model}#${best!.minGap.index}`).toBeLessThan(-0.05);
    const hit = driveLimitEntry({ lesson: L1, raw, parked: sets.live, bay: BAY, kind: "forward", x0: best!.x0, y0: best!.y0, leadDeg: best!.leadDeg, inBayM: slack });
    expect(hit.collisions, "the lesson's ledger books the strike").toEqual(["vehicle"]);
    expect(hit.parked).toBe(false);
  }, 300_000);
});

describe("curvpark2 round 3 — the reverse lessons: a right-half reverse entry at full lock PARKS CLEAN — a recorded fact; the precondition is read on the 4.6 m programme with the 0.25 m floor (CP2-1ter), where it holds", () => {
  const CASES: ReadonlyArray<[string, string, number, number, number, number]> = [
    // lesson, district, bay width, start y, its clearance (m), at least
    ["sc-park-perp-rev", "lot-perp-v1", 2.7, 5.25, 0.116, 0.1],
    ["sc-park-narrow", "lot-narrow-v1", 2.5, 5.2, 0.003, 0.0],
  ];
  for (const [id, district, bw, y0, clearM, floorM] of CASES) {
    it(`${id}: from (0.85, ${y0}) — the car's left side on the centre line — full lock rests in the bay ${clearM} m clear, both tasks done, 0 т. at every rung`, () => {
      const { raw, sets } = lesson(id, district);
      for (const lv of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        const r = driveLimitEntry({
          lesson: compileScenario(scenarioById(id)!, lv),
          raw,
          parked: sets.live,
          bay: BAY,
          kind: "reverse",
          x0: HERO_HALF_WIDTH_M,
          y0,
          leadDeg: 0,
          inBayM: (bw - 2 * HERO_HALF_WIDTH_M) / 2,
        });
        expect(r.collisions, `${id} L${lv}`).toEqual([]);
        expect(r.minGap.m, `${id} L${lv}: ${r.minGap.m.toFixed(3)} m on ${r.minGap.model}#${r.minGap.index}`).toBeGreaterThan(floorM);
        expect(r.parked, `${id} L${lv}`).toBe(true);
        const sheet = JSON.parse(r.sheet) as { score: number; objectives: Array<{ done: boolean }> };
        expect(sheet.score, `${id} L${lv}`).toBe(0);
        expect(sheet.objectives.map((o) => o.done), `${id} L${lv}`).toEqual([true, true]);
      }
    }, 120_000);
  }
});
