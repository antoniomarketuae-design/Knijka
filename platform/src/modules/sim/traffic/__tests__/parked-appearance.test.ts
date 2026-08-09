/**
 * THE PARKED ROW'S APPEARANCE IS PER-DISTRICT; ITS PLACEMENT IS NOT
 * (doc 87 B50 / B53 / B54).
 *
 * THE DEFECT, MEASURED BEFORE IT WAS FIXED. `TrafficLayer.computeParkedCars`
 * hashed `(edgeIndex, slot)` — the edge's index inside its own district and the
 * slot's index along it. Nothing in that hash names the district. Every
 * generated family therefore lands its parked segment on the same edge index
 * in every instance, so every instance gets the same `assignCivilianModel` pick
 * and the same paint seed, in the same order. On the seven-district PE family,
 * right kerb:
 *
 *   pe-cane   m=1 s=654 | m=1 s=35 | m=4 s=133
 *   pe-bus    m=1 s=654 | m=1 s=35 | m=4 s=133
 *   pe-child  m=1 s=654 | m=1 s=35
 *
 * …and left kerb `m=3 s=398 | m=4 s=421` on pe-dart, pe-slow AND pe-bus. Three
 * consecutive lessons with the same three cars in the same paint at the same
 * kerb, which is the literal form of the founder's „same map, same
 * engineering, everything same". Photographed at the spawn:
 * `base__28-pe-cane__y15.png` beside `base__29-pe-bus__y15.png`.
 *
 * WHY THIS FILE EXISTS RATHER THAN A LINE IN pe-districts. The fix salts the
 * hash with `meta.district`, and the whole safety of it is a SPLIT: the salt
 * reaches the model and the paint, and does NOT reach the 1-in-5 gap skip that
 * decides where a body stands. That is a claim about all 90 committed
 * districts, not about seven — so it is asserted over all of them, on the real
 * shipped files, by running the pass twice against the same district with the
 * salt present and absent.
 *
 * If this ever goes red on the placement half, every parked-body census in the
 * tree (`parked-on-footway`, `ped-through-parked`, `scenery-sightline`, every
 * per-district battery) is measuring a different world than the one it was
 * written against.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { computeParkedCars } from "../TrafficLayer";
import type { TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD_DIR = path.resolve(HERE, "../../../../../..", "content", "world");
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;

const DISTRICT_IDS = readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

function load(id: string): TrafficDistrict {
  return JSON.parse(readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8")) as TrafficDistrict;
}

/** Everything about a body that is a fact about the WORLD, not about paint. */
const placement = (b: { x: number; y: number; yaw: number }) =>
  `${b.x.toFixed(4)},${b.y.toFixed(4)},${b.yaw.toFixed(4)}`;

describe("the parked row: appearance is salted per district, placement is not", () => {
  it("no body moves when the salt is applied — all 90 districts, measured both ways", () => {
    const moved: string[] = [];
    for (const id of DISTRICT_IDS) {
      const salted = load(id);
      const unsalted = load(id);
      // The pre-salt world, exactly: `districtParkedSalt` returns 0 when the
      // district does not name itself.
      delete (unsalted as { meta?: unknown }).meta;
      const a = computeParkedCars(salted, LANE_W);
      const b = computeParkedCars(unsalted, LANE_W);
      if (a.length !== b.length) {
        moved.push(`${id}: ${b.length} bodies became ${a.length}`);
        continue;
      }
      for (let i = 0; i < a.length; i++) {
        if (placement(a[i]) !== placement(b[i])) {
          moved.push(`${id}[${i}]: ${placement(b[i])} → ${placement(a[i])}`);
        }
      }
    }
    expect(moved).toEqual([]);
  });

  it("…and the cars themselves DO change, or the salt is doing nothing", () => {
    // The negative half. A salt that is wired up but never reaches the model
    // pick would pass the test above perfectly — that is the exact shape of the
    // `heightSource: "default"` failure, where a renderer quietly discarded
    // three passes of authored variety while every test stayed green.
    let districtsWithBodies = 0;
    let districtsWhoseLookChanged = 0;
    for (const id of DISTRICT_IDS) {
      const salted = load(id);
      const unsalted = load(id);
      delete (unsalted as { meta?: unknown }).meta;
      const a = computeParkedCars(salted, LANE_W);
      const b = computeParkedCars(unsalted, LANE_W);
      if (a.length === 0) continue;
      districtsWithBodies++;
      const look = (r: typeof a) => r.map((p) => `${p.model}#${p.seed >>> 0}`).join(",");
      if (look(a) !== look(b)) districtsWhoseLookChanged++;
    }
    expect(districtsWithBodies, "districts that park anybody at all").toBeGreaterThan(50);
    // Every one of them: the salt is a function of the district name, which is
    // unique per file, so a district whose row did not change means the salt
    // never reached the pick.
    expect(districtsWhoseLookChanged, "districts whose kerb row changed").toBe(districtsWithBodies);
  });

  it("a district that does not name itself keeps the pre-salt look exactly", () => {
    // The "absent ⇒ unchanged" contract every other tag in district-v1 honours,
    // and the reason the small in-test fixtures elsewhere in this folder — which
    // carry no `meta` — did not all have to be rewritten.
    const bare = load("pe-clear-v1");
    delete (bare as { meta?: unknown }).meta;
    const twin = load("pe-clear-v1");
    delete (twin as { meta?: unknown }).meta;
    (twin as { meta?: unknown }).meta = { district: "" };
    expect(computeParkedCars(twin, LANE_W)).toEqual(computeParkedCars(bare, LANE_W));
  });
});
