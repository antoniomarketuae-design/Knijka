import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime, parseDistrict, type District } from "..";
import { analyzeNetwork, STOP_LINE_BEYOND_CUT_M } from "../../world/builders/network";
import { assertDistrict } from "../../world/types";
import type { VehicleSample } from "../../contracts";
import type { SimTickEvent } from "../../rules/types";

/**
 * B15, THE HALF THAT WAS PHOTOGRAPHED FROM THE WRONG PLACE.
 *
 * The row („I waited for the traffic car 3-4 seconds, than I waited it for
 * twice more and it still stated the error") was closed by standing a rig at
 * the south mouth of rb-mini-v1 and photographing the repair. The rig stood at
 * `radius + 4` = 22 m from the ring centre. THE М7 GIVE-WAY PAINT IS AT
 * 35.73 m, and the tracker armed at `radius + ROUNDABOUT_ENTRY_MARGIN_M` = 30.
 * So the mechanism was real and the fix was real, and neither of them was ever
 * in the same place as the student.
 *
 * This battery measures the two numbers against each other on every shipped
 * roundabout — the paint distance is computed from the PAINTER's own
 * expression (`ap.cut + away · STOP_LINE_BEYOND_CUT_M`, markings.paintStopLine),
 * so a drift between world and grader shows up as a failure here rather than as
 * a founder complaint — and then drives the sequence that the old keyhole could
 * not see, plus the barge that must still convict.
 */

const ROOTS = [process.cwd(), path.resolve(process.cwd(), "..")];

function worldFile(id: string): string {
  for (const root of ROOTS) {
    const f = path.join(root, "content", "world", `${id}.json`);
    if (fs.existsSync(f)) return f;
  }
  throw new Error(`${id}.json not found`);
}

function loadRuntimeDistrict(id: string): District {
  return parseDistrict(JSON.parse(fs.readFileSync(worldFile(id), "utf-8")));
}

/**
 * Distance from a ring's centre to the М7 линия за изчакване at each of its
 * mouths, straight out of the world builder's own paint expression.
 */
function paintDistancesFromCentre(id: string): Map<string, number[]> {
  const district = assertDistrict(JSON.parse(fs.readFileSync(worldFile(id), "utf-8")));
  const net = analyzeNetwork(district);
  const out = new Map<string, number[]>();
  for (const rb of district.roundabouts) {
    const ringIds = new Set(rb.edgeIds);
    const mouths = new Set<string>();
    for (const e of district.roads.edges) {
      if (!ringIds.has(e.id)) continue;
      mouths.add(e.from);
      mouths.add(e.to);
    }
    const ds: number[] = [];
    for (const nodeId of mouths) {
      const node = net.nodes.get(nodeId);
      if (!node) continue;
      for (const ap of node.approaches) {
        if (!ap.incoming || ringIds.has(ap.edgeId)) continue;
        const px = ap.cut[0] + ap.cutTangentAway[0] * STOP_LINE_BEYOND_CUT_M;
        const py = ap.cut[1] + ap.cutTangentAway[1] * STOP_LINE_BEYOND_CUT_M;
        ds.push(Math.hypot(px - rb.x, py - rb.y));
      }
    }
    out.set(rb.id, ds);
  }
  return out;
}

/** Every shipped map that registers a roundabout. */
const RING_MAPS = [
  "rb-mini-v1",
  "rb-ped-v1",
  "rb-2lane-v1",
  "rb-single-v1",
  "d2-v1",
  "district-v1",
] as const;

describe("a roundabout's give-way grader is armed where the give-way paint is", () => {
  for (const id of RING_MAPS) {
    it(`${id} — every mouth's М7 line is inside the watch reach`, () => {
      const rt = createWorldRuntime(loadRuntimeDistrict(id));
      const zones = new Map(rt.debugRoundaboutZones().map((z) => [z.id, z]));
      const paint = paintDistancesFromCentre(id);
      expect(paint.size).toBeGreaterThan(0);
      for (const [ringId, distances] of paint) {
        const zone = zones.get(ringId);
        expect(zone, `${id}/${ringId} has no zone`).toBeDefined();
        expect(distances.length).toBeGreaterThan(0);
        for (const d of distances) {
          // The instrument must see the paint AND the car standing at it: the
          // sample point is the vehicle origin, a metre or two behind the
          // bumper the student parks on the line.
          expect(zone!.watchReachM, `${id}/${ringId} mouth at ${d.toFixed(2)} m`).toBeGreaterThan(
            d + 2,
          );
        }
      }
    });
  }

  it("the watch zone never shrinks below the ring-relative reach it replaced", () => {
    for (const id of RING_MAPS) {
      const rt = createWorldRuntime(loadRuntimeDistrict(id));
      for (const z of rt.debugRoundaboutZones()) {
        expect(z.watchReachM, `${id}/${z.id}`).toBeGreaterThanOrEqual(z.commitReachM);
      }
    }
  });

  it("pins the defect: five of six maps painted their give-way OUTSIDE the old reach", () => {
    // The commit reach IS the old arming reach, unchanged — so this asserts the
    // gap that existed, not a number invented to match the fix.
    const outside: string[] = [];
    for (const id of RING_MAPS) {
      const rt = createWorldRuntime(loadRuntimeDistrict(id));
      const zones = new Map(rt.debugRoundaboutZones().map((z) => [z.id, z]));
      for (const [ringId, distances] of paintDistancesFromCentre(id)) {
        const commit = zones.get(ringId)!.commitReachM;
        if (distances.some((d) => d > commit)) outside.push(id);
      }
    }
    expect([...new Set(outside)].sort()).toEqual(
      ["d2-v1", "rb-2lane-v1", "rb-mini-v1", "rb-ped-v1", "rb-single-v1"].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// The drive the old keyhole could not see
// ---------------------------------------------------------------------------

const DT = 0.05;
/** The founder's stop point: the М8 give-way paint on rb-mini's south arm. */
const PAINT = { x: 4.06, y: -36.92 };

function mk(x: number, y: number, speedKmh: number): VehicleSample {
  return {
    position: { x, y },
    headingDeg: 0, // north, up the south arm, into the ring
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

interface RunResult {
  convicted: boolean;
  /** Distance from the ring centre at which the conviction landed. */
  convictedAtM: number | null;
  commended: boolean;
}

/**
 * Approach → STOP ON THE PAINT → wait `waitSec` with a car circulating →
 * the ring clears → pull away and drive through, out the far side.
 */
function stopWaitThenEnterOnAClearGap(waitSec: number): RunResult {
  const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
  let ringBusy = true;
  rt.setCirculatingQuery(() => ringBusy);
  rt.setRightConflictQuery(() => false);

  let t = 0;
  let convictedAtM: number | null = null;
  let commended = false;
  const feed = (y: number, speedKmh: number): void => {
    t += DT;
    rt.update(DT);
    for (const e of rt.sample(mk(PAINT.x, y, speedKmh), t, false).events as SimTickEvent[]) {
      if (e.kind !== "prioritySituation" || e.situation !== "roundabout") continue;
      if (e.violated && convictedAtM === null) convictedAtM = Math.hypot(PAINT.x, y);
      if (!e.violated && e.yielded) commended = true;
    }
  };

  // Approach: 25 km/h from 60 m out, braking to a stop on the paint.
  let y = -60;
  let v = 25 / 3.6;
  while (y < PAINT.y) {
    const d = PAINT.y - y;
    v = Math.min(v, Math.sqrt(2 * 2.0 * Math.max(0, d)));
    y = Math.min(PAINT.y, y + v * DT);
    feed(y, v * 3.6);
  }
  // The wait, on the paint, wheels stopped.
  for (let i = 0; i < Math.round(waitSec / DT); i++) feed(PAINT.y, 0);
  // The ring clears — this is the gap he was waiting for.
  ringBusy = false;
  // Pull away and drive right through, out the north arm past the watch zone.
  v = 0;
  y = PAINT.y;
  while (y < 60) {
    v = Math.min(20 / 3.6, v + 1.4 * DT);
    y += v * DT;
    feed(y, v * 3.6);
  }
  return { convicted: convictedAtM !== null, convictedAtM, commended };
}

describe("B15's own drive: stop on the paint, wait, enter on a clear gap", () => {
  for (const waitSec of [4, 8, 40, 60]) {
    it(`${waitSec} s wait — no conviction, and the yield is CREDITED`, () => {
      const run = stopWaitThenEnterOnAClearGap(waitSec);
      expect(run.convicted).toBe(false);
      // The half nobody could reach before: standing on the paint is where the
      // yield happens, and the paint was outside the instrument. `rbSlowed`
      // could only be set by a driver already inside 30 m — i.e. already past
      // the line — so the commendation was unreachable on this map by
      // construction, and a perfect drive scored exactly what a blind one did.
      expect(run.commended).toBe(true);
    });
  }
});

describe("the mirror image: a real barge still convicts, and no earlier than before", () => {
  it("a steady 20 km/h entry into a busy ring is billed inside the commit radius", () => {
    const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
    rt.setCirculatingQuery(() => true); // a car is on the ring the whole time
    rt.setRightConflictQuery(() => false);
    const commit = rt.debugRoundaboutZones()[0]!.commitReachM;
    let t = 0;
    let y = -60;
    let convictedAtM: number | null = null;
    while (y < -18 && convictedAtM === null) {
      t += DT;
      y += (20 / 3.6) * DT;
      rt.update(DT);
      for (const e of rt.sample(mk(PAINT.x, y, 20), t, false).events as SimTickEvent[]) {
        if (e.kind === "prioritySituation" && e.situation === "roundabout" && e.violated) {
          convictedAtM ??= Math.hypot(PAINT.x, y);
        }
      }
    }
    expect(convictedAtM).not.toBeNull();
    // Never out at the paint: the widened field of view is for WATCHING. A
    // driver can still only be billed once he is committed to the entry, and
    // the sustain window he gets there is the same one he always got.
    expect(convictedAtM!).toBeLessThan(commit);
    expect(convictedAtM!).toBeGreaterThan(18); // and not inside the ring itself
  });

  it("a driver who never commits is never billed, however long the ring is busy", () => {
    // Creeping up the arm and stopping short of the commit radius: the tracker
    // sees him for the whole approach now, and says nothing.
    const rt = createWorldRuntime(loadRuntimeDistrict("rb-mini-v1"));
    rt.setCirculatingQuery(() => true);
    rt.setRightConflictQuery(() => false);
    let t = 0;
    let convicted = false;
    for (let i = 0; i < 1200; i++) {
      const y = -44 + Math.min(11, i * 0.01); // 44 m → 33 m, still outside 30
      t += DT;
      rt.update(DT);
      for (const e of rt.sample(mk(PAINT.x, y, 8), t, false).events as SimTickEvent[]) {
        if (e.kind === "prioritySituation" && e.situation === "roundabout" && e.violated) {
          convicted = true;
        }
      }
    }
    expect(convicted).toBe(false);
  });
});
