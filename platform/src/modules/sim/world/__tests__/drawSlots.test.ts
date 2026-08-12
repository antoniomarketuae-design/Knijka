/**
 * THE NUMBER THAT USED TO BE TYPED IN TWICE.
 *
 * `buildWorldGeometry` published `drawCallEstimate = 13 + 27 + CITY_MODELS.length + …`.
 * The `27` was a hand tally of the fixed WorldProps instanced draws;
 * `WorldProps.tsx` carried its own copy of the same tally and it said **28**
 * (the B35 lens-glass pass was added to one place and not the other), and
 * NEITHER of them counted the pedestrian-signal trio. That is what two prose
 * copies of one number always do.
 *
 * The count is now derived from the placement data (`builders/drawSlots.ts`),
 * so there is no tally to keep in sync — and this file is the check that the
 * derivation and the builder's call site cannot drift apart either: the
 * builder's published number must equal what the derivation recomputes from
 * the finished world, on every district that ships.
 *
 * It also pins the property that made the old number useless: it is a count of
 * STATIC world mesh slots, and it must respond to what a district actually
 * places. The old one charged 27 whether or not a district had a single
 * billboard, which is why its range across all 105 shipped districts was 56–67
 * — an 11-slot spread over maps ranging from a полигон to a 4,276-tree city.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  countStaticDrawSlots,
  staticDrawSlotInputFromWorld,
  staticDrawSlotTerms,
} from "../builders/drawSlots";
import { assertDistrict, type District } from "../types";

function worldDir(): string {
  const here = path.join(process.cwd(), "content", "world");
  return fs.existsSync(here) ? here : path.resolve(process.cwd(), "..", "content", "world");
}

function loadAll(): { id: string; district: District }[] {
  const dir = worldDir();
  const out: { id: string; district: District }[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as unknown;
    out.push({ id: file.replace(/\.json$/, ""), district: assertDistrict(raw) });
  }
  return out;
}

describe("staticDrawSlots is derived, not tallied", () => {
  const districts = loadAll();

  it("the builder's published count equals a recompute from the finished world", () => {
    expect(districts.length).toBeGreaterThan(100);
    for (const { id, district } of districts) {
      const world = buildWorldGeometry(district);
      expect(countStaticDrawSlots(staticDrawSlotInputFromWorld(world)), id).toBe(
        world.stats.staticDrawSlots,
      );
    }
  }, 120_000);

  it("charges a family only where the district places it", () => {
    const byId = new Map(districts.map((d) => [d.id, d.district]));
    // mw-v1 is a motorway slice: no signals, no billboards, no bus stop, no
    // parking kit, no street lighting run. The old estimate billed it for all
    // of them and scored it 60. Measured on the running product it is also the
    // lightest district in the corpus, which is the relationship a static
    // number should at least have the shape of.
    const mw = buildWorldGeometry(byId.get("mw-v1")!);
    const ids = staticDrawSlotTerms(staticDrawSlotInputFromWorld(mw)).map((t) => t.id);
    expect(ids).not.toContain("billboards");
    expect(ids).not.toContain("bus-stops");
    expect(ids).not.toContain("signals-vehicle");

    // d2-v1 is the full city: both signal families, many sign kinds, the
    // billboards, the shelters, the parking kit.
    const d2 = staticDrawSlotTerms(staticDrawSlotInputFromWorld(buildWorldGeometry(byId.get("d2-v1")!)));
    const d2ids = d2.map((t) => t.id);
    expect(d2ids).toContain("signals-vehicle");
    expect(d2ids).toContain("signals-pedestrian");
    expect(d2ids).toContain("billboards");
    expect(d2ids).toContain("bus-stops");
    expect(d2ids).toContain("parking-kits");
    // Pedestrian heads are three slots (housing + lens glass + lamps) and the
    // old hand tally had NO term for them at all.
    expect(d2.find((t) => t.id === "signals-pedestrian")!.slots).toBe(3);
  }, 60_000);

  it("spreads across the corpus instead of sitting flat", () => {
    // The whole 105-district range under the old estimate was 56..67. If a
    // future change makes this flat again it has stopped describing anything.
    const values = districts.map(({ district }) => buildWorldGeometry(district).stats.staticDrawSlots);
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(max - min).toBeGreaterThanOrEqual(25);
  }, 120_000);
});
