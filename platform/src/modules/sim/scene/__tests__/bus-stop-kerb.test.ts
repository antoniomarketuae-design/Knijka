/**
 * RULE 2b — a bus stop authored as a SPAN clears its own kerb.
 *
 * Sweep 161, `sc-merge-bus-pullout`: «the street rendered is an ordinary
 * two-lane road … with an unbroken row of privately parked cars occupying the
 * supposed bus lane». The row IS unbroken, straight through the drill's own
 * bus bay, because `parkedClearZonesFor`'s bus-stop rule read a `busStop`
 * BUILDING and `mg-busstop-v1` authors the stop as `meta.scenario.busBayY`
 * instead — so the one map whose whole lesson is a bus pulling out of its stop
 * was the one map the rule never fired on.
 *
 * Everything below runs the SHIPPED placement function `computeParkedCars`
 * against the SHIPPED district JSON. The one fixture is the negative control.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { computeParkedCars, type TrafficDistrict } from "@/modules/sim/traffic";
import { parkedClearZonesFor } from "../scenarioSceneryProps";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
/** The lane width LessonScene mounts TrafficLayer with (its own default). */
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
/** Parked-decoration footprint half-length (the kit's worst case), m. */
const PARKED_HALF_LEN = 2.25;

function loadDistrict(id: string): TrafficDistrict {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
}

/** Body fingerprint — proves a filter REMOVED and never MOVED. */
function fingerprint(p: {
  x: number;
  y: number;
  yaw: number;
  model: number;
  seed: number;
}): string {
  return `${p.x.toFixed(4)}|${p.y.toFixed(4)}|${p.yaw.toFixed(4)}|${p.model}|${p.seed}`;
}

describe("RULE 2b — the authored bus-stop span clears its kerb", () => {
  it("mg-busstop-v1: private cars stood in the bus bay; now none do", () => {
    const raw = loadDistrict("mg-busstop-v1");
    const bay = (
      raw as unknown as {
        meta: { scenario: { busBayY: { fromY: number; toY: number } } };
      }
    ).meta.scenario.busBayY;
    // The span is authored data, not a number this test invents.
    expect(bay).toEqual({ fromY: 130, toY: 176 });

    // BEFORE this wave `parkedClearZonesFor` returned [] for this template —
    // the map stages no pedestrianDartOut, holds no dressing and carries no
    // `busStop` building — so the unfiltered pass IS the old behaviour.
    const before = computeParkedCars(raw, LANE_W, []);
    const after = computeParkedCars(
      raw,
      LANE_W,
      parkedClearZonesFor("sc-merge-bus-pullout@L1", raw),
    );

    const inBay = (p: { y: number }) =>
      p.y + PARKED_HALF_LEN > bay.fromY && p.y - PARKED_HALF_LEN < bay.toY;

    // FAILS on the old behaviour: six bodies stood in the spirka.
    expect(before.filter(inBay).length).toBe(6);
    expect(after.filter(inBay).length).toBe(0);

    // A filter may only REMOVE: every survivor is byte-identical to its old
    // self (same coordinates, same yaw, same model, same paint seed).
    const beforeIds = new Set(before.map(fingerprint));
    for (const p of after) expect(beforeIds.has(fingerprint(p))).toBe(true);
    expect(before.length).toBe(46);
    expect(after.length).toBe(38);

    // And the hole is where the spirka is, not somewhere else: the nearest
    // surviving body on each side sits outside the bay + the чл. 98 margin.
    const ys = after.map((p) => p.y);
    expect(Math.max(...ys.filter((y) => y < bay.fromY))).toBeLessThanOrEqual(bay.fromY - 6);
    expect(Math.min(...ys.filter((y) => y > bay.toY))).toBeGreaterThanOrEqual(bay.toY + 6);
  });

  it("the kerb line the rule derives is the kerb the curb pass actually uses", () => {
    // PARKED_BAND_CENTER_M and the half-lane arithmetic in
    // scenarioSceneryProps.ts are a COPY of TrafficLayer's band offset. Pin
    // the copy against the real row rather than against itself, on BOTH shapes
    // of street this rule meets (4 lanes and 2).
    for (const [id, templateId] of [
      ["mg-busstop-v1", "sc-merge-bus-pullout"],
      ["pk-busstop-v1", "sc-pk-busstop-ban"],
    ] as const) {
      const raw = loadDistrict(id);
      const row = computeParkedCars(raw, LANE_W, []);
      const kerbXs = [...new Set(row.map((p) => +p.x.toFixed(2)))];
      expect(kerbXs.length, `${id}: one-sided row expected`).toBe(1);
      const zones = parkedClearZonesFor(`${templateId}@L1`, raw);
      expect(zones.length, `${id}: no zones emitted`).toBeGreaterThan(0);
      for (const z of zones) {
        expect(Math.abs(z.x - kerbXs[0]), `${id}: zone x ${z.x} vs kerb ${kerbXs[0]}`).toBeLessThan(
          0.05,
        );
      }
    }
  });

  it("removes ONLY inside the authored span + the чл. 98 margin — both maps", () => {
    // The opposite direction from the test above: a rule that widened would
    // start deleting kerb it has no business deleting, and „the row broke where
    // the stop is" would quietly become „the row broke". Every body the rule
    // takes has to lie inside its own span plus the margin plus one body's
    // half-diagonal (the circle radius), and the count is pinned.
    //
    // pk-busstop-v1 is the near-control: its pocket already sits inside an
    // authored `noStopping` zone, which the curb pass honours on its own, so
    // the ONLY body left for this rule is the one standing 3.35 m past the
    // pocket's exit (y = 215.6, footprint [213.35, 217.85]) — the metres a bus
    // needs to pull back out. Everything else on that map is untouched.
    const REACH = 6 + Math.hypot(2.25, 0.95); // margin + PARKED_HALF_DIAG_M
    const CASES = [
      ["mg-busstop-v1", "sc-merge-bus-pullout", "busBayY", 8],
      ["pk-busstop-v1", "sc-pk-busstop-ban", "busStopPocketY", 1],
    ] as const;
    for (const [id, templateId, key, expectedRemoved] of CASES) {
      const raw = loadDistrict(id);
      const span = (
        raw as unknown as {
          meta: { scenario: Record<string, { fromY: number; toY: number }> };
        }
      ).meta.scenario[key];
      const before = computeParkedCars(raw, LANE_W, []);
      const after = computeParkedCars(raw, LANE_W, parkedClearZonesFor(`${templateId}@L1`, raw));
      const kept = new Set(after.map(fingerprint));
      const removed = before.filter((p) => !kept.has(fingerprint(p)));
      expect(removed.length, `${id}: removed count`).toBe(expectedRemoved);
      for (const p of removed) {
        expect(p.y, `${id}: removed y=${p.y} below span`).toBeGreaterThanOrEqual(
          span.fromY - REACH,
        );
        expect(p.y, `${id}: removed y=${p.y} above span`).toBeLessThanOrEqual(span.toY + REACH);
      }
      // Nothing moved, nothing appeared.
      expect(after.length).toBe(before.length - expectedRemoved);
    }
  });

  it("convicts a stop whose kerb is dirty — the negative control", () => {
    // Same shape as pk-busstop-v1, one lane per direction, with a body parked
    // in the middle of its own authored bay. If the rule ever stopped reading
    // the span, this fixture would go green with a car in the bus stop.
    // (A template id used nowhere else in this file: `parkedClearZonesFor`
    // memoises per template, so a shared id would serve a cached answer.)
    const fixture = {
      meta: {
        scenario: {
          laneCenterRightM: 4.06,
          lanesPerDirection: 1,
          busBayY: { fromY: 100, toY: 130 },
        },
      },
    } as unknown;
    const zones = parkedClearZonesFor("sc-follow-standstill@L1", fixture);
    const dirty = { x: 10.13, y: 115 }; // the kerb slot inside the bay
    expect(zones.some((z) => Math.hypot(dirty.x - z.x, dirty.y - z.y) < z.radiusM)).toBe(true);
    // …and a body a bay-length further up the same kerb is left alone.
    const clean = { x: 10.13, y: 150 };
    expect(zones.some((z) => Math.hypot(clean.x - z.x, clean.y - z.y) < z.radiusM)).toBe(false);
  });

  it("a district that authors no stop span is untouched by the rule", () => {
    // The blast radius is the two maps that carry the key and no others: a
    // straight-street sibling from the same generator, with no bus stop, keeps
    // every body it had.
    const raw = loadDistrict("fo-brake-v1");
    const before = computeParkedCars(raw, LANE_W, []);
    const after = computeParkedCars(
      raw,
      LANE_W,
      parkedClearZonesFor("sc-fo-brakelight-chain@L1", raw),
    );
    expect(after.map(fingerprint)).toEqual(before.map(fingerprint));
  });
});
