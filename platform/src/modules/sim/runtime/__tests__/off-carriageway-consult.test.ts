/**
 * worldRuntime — THE SURFACE CONSULT (sweep161, two critical BROKEN findings
 * that turned out to be one defect).
 *
 *   · sc-ov-oncoming-gap / mobile-wrong / 04-t146s.png — 97 км/ч on a
 *     featureless grey plane with no road, marking or boundary anywhere.
 *   · sc-ln-turn-lane-arrows / pc-right / 04-t064s.png — the ego on bare
 *     ground, while 01-arrival of the SAME run shows that district fully
 *     painted. The map is fine; the car is off it.
 *
 * The mechanism this suite pins is the one the frames' own maps make visible:
 * `locator.ts` calls 30 m from the CENTRELINE "off-road", and that is a lock
 * ACQUISITION radius, not a kerb. `ov-oncoming-v1`'s asphalt ends at
 * |x| ≈ 12.1 m, so a car standing at x = 16 m — four metres into the verge —
 * used to be handed back edge `ovg-e-road`, lane 0, and PAINTED markings, with
 * `laneOffsetM` clamped to −4.06 m. `laneKeepMaxOffsetM` is 3.25 m, so the
 * reducer convicted it of «Неустойчиво движение в лентата» for drifting off
 * the middle of a lane that is not there — which is the lone −1 второстепенна
 * in that mobile-wrong debrief, billed at t129s/t134s.
 *
 * BOTH DIRECTIONS, because a false acquittal is the same crime as a false
 * conviction: every test that proves the verge is now bare is paired with one
 * proving the carriageway is untouched, and the sweep at the bottom walks the
 * lane centres of both frames' districts through the production `sample()`.
 *
 * ---------------------------------------------------------------------------
 * 2026-08-24 — AND THE PAINT WAS NEVER WHAT THE FINDINGS SAID. Sections 1–3
 * shipped, the −1 «Неустойчиво движение в лентата» retired with them, and both
 * findings stayed OPEN — because neither of them is about a lane-keeping bill.
 * They say «no off-route stop, no reset, no penalty» and «ended naturally with
 * 0 of 3 objectives done», i.e. the DRIVE never ends. The measurement was being
 * made every frame and thrown away: `surfaceUnderCar` is an imperative getter
 * whose only caller, platform-wide, was this file.
 *
 * Sections 4–6 are that half. `sample()` now publishes `edgeId: null` off the
 * carriageway — the SimTick contract's own word for „off-road/unknown" — which
 * is the evidence `lessons/finish.ts`'s off-network ending has been waiting on,
 * measured at the KERB instead of one 30 m lock-radius past the centreline. §4
 * pins the boundary from both sides so the constant cannot be neutralised, §5
 * proves the acquitting half over all 105 districts (spawn points, parking bay
 * centres, every lane centre and kerb band), and §6 drives finding A's own
 * compiled lesson through the real `applyTick` and reads the sentence the
 * student is shown.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorldRuntime } from "../worldRuntime";
import {
  makeSurfaceFix,
  resolveDistrictDrivableSurface,
  surfaceAt,
  OFF_CARRIAGEWAY_BODY_ALLOWANCE_M,
} from "../surface";
import { createRuleEngine, reduceTick } from "../../rules/engine";
import { analyzeNetwork } from "../../world/builders/network";
import { assertDistrict } from "../../world/types";
import { applyTick, createLessonSession } from "../../lessons/engine";
import { OFF_NETWORK_STUCK_S, offNetworkEndingCopy } from "../../lessons/finish";
import { compileScenario } from "../../lessons/scenario/compile";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import type { VehicleSample } from "../../contracts";
import type { SimTick } from "../../rules/types";

const WORLD = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world",
);
const districts = new Map<string, unknown>();
function load(id: string): unknown {
  let d = districts.get(id);
  if (d === undefined) {
    d = JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
    districts.set(id, d);
  }
  return d;
}

function vehicle(x: number, y: number, headingDeg = 0, speedKmh = 50): VehicleSample {
  return {
    position: { x, y },
    headingDeg,
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
}

/** One tick at a standstill-free cruise, from a fresh runtime. */
function tickAt(districtId: string, x: number, y: number, headingDeg = 0): SimTick {
  const rt = createWorldRuntime(load(districtId));
  return rt.sample(vehicle(x, y, headingDeg), 1, false);
}

// ---------------------------------------------------------------------------
// 1. THE CONVICTING HALF — the verge is bare, and the runtime now says so
// ---------------------------------------------------------------------------

describe("the surface consult publishes bare ground as bare", () => {
  it("ov-oncoming-v1: the verge beside the road claims no paint AND no road", () => {
    // 16 m from the centreline: 3.875 m past the kerb (asphalt ends at
    // x = 12.125 m), and 14 m INSIDE the locator's 30 m lock ring — the whole
    // point.
    const tick = tickAt("ov-oncoming-v1", 16, 400);

    // Fails on the old behaviour: `laneMarkingAt` answers for the EDGE, said
    // "painted" here, and both flags were therefore left ABSENT = armed.
    expect(tick.laneLinesPainted).toBe(false);
    expect(tick.centreLinePainted).toBe(false);

    // …and the ROAD-MEMBERSHIP channel with them. This assertion used to read
    // `.toBe("ovg-e-road")` and was labelled "the old referent is untouched and
    // still fabricating" — a defect pinned rather than fixed, because the two
    // findings say the drive never ENDS and paint cannot end one. Inverted, not
    // relaxed: it is a stronger claim about the same tick.
    expect(tick.edgeId).toBeNull();

    // WHAT DELIBERATELY DID NOT CHANGE, asserted so a later lane cannot quietly
    // widen this into an amnesty: the limit and the lane fix are still the
    // road's, so 97 км/ч in a field is still a conviction (finding A's frame).
    expect(tick.maxSpeedKmh).toBe(90);
    expect(Math.abs(tick.laneOffsetM)).toBeGreaterThan(3.25); // laneKeepMaxOffsetM
  });

  it("ov-oncoming-v1: and the measurement behind it is readable", () => {
    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    const out = makeSurfaceFix();

    // Before any sample() the answer is UNKNOWN, not the "nowhere near a road"
    // default of a fresh slot — a caller must not be able to read a
    // conviction out of a runtime that has not graded a frame yet.
    expect(rt.surfaceUnderCar(out)).toBe(false);

    rt.sample(vehicle(16, 400), 1, false);
    expect(rt.surfaceUnderCar(out)).toBe(true);
    expect(out.under).not.toBe("carriageway");
    expect(out.outsideKerbM).toBeGreaterThan(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M);
  });

  it("ln-arrows-v1: the same verge, on the second finding's own district", () => {
    // The west arm is a 2-lane residential street: asphalt to ≈12 m, lock to
    // 30 m — the same ~18 m band of fabricated road as ov-oncoming-v1.
    const tick = tickAt("ln-arrows-v1", -100, 18, 90);
    expect(tick.laneLinesPainted).toBe(false);
    expect(tick.centreLinePainted).toBe(false);
    // Was `.toBe("ln-e-w")` — the same inversion as the block above, on the
    // second finding's own map.
    expect(tick.edgeId).toBeNull();
  });

  it("the reducer stops billing «Неустойчиво движение в лентата» in a field", () => {
    // The frame's own conviction, end to end, through the production reducer
    // with the production config: leave the lane centre, cross the kerb, and
    // hold out in the verge for well past `laneKeepSustainSec` (3 s).
    expect(driftAndGrade("ov-oncoming-v1", 16)).not.toContain("POOR_LANE_KEEPING");
  });
});

/**
 * Drive the own lane of ov-oncoming-v1 for 2 s (which satisfies the reducer's
 * spawn-pose latch — the positional detectors arm only once the car has been
 * seen inside its lane), ramp out to `toX` over 1 s, then hold there for 8 s.
 * Returns every violation code the production reducer billed.
 */
function driftAndGrade(districtId: string, toX: number): string[] {
  const rt = createWorldRuntime(load(districtId));
  let state = createRuleEngine();
  const codes: string[] = [];
  const fromX = 4.06;
  for (let i = 0; i <= 44; i++) {
    const t = i * 0.25;
    const ramp = Math.min(1, Math.max(0, (t - 2) / 1));
    const x = fromX + (toX - fromX) * ramp;
    const res = reduceTick(state, rt.sample(vehicle(x, 200 + t * 13.9), t, false));
    state = res.state;
    for (const e of res.events) if (e.kind === "violation") codes.push(e.code);
  }
  return codes;
}

// ---------------------------------------------------------------------------
// 2. THE ACQUITTING HALF — nothing on the asphalt changed
// ---------------------------------------------------------------------------

describe("the surface consult never disarms a car that is on the road", () => {
  it("ov-oncoming-v1: the own-lane centre keeps both flags ARMED (absent)", () => {
    const tick = tickAt("ov-oncoming-v1", 4.06, 400);
    expect(tick.edgeId).toBe("ovg-e-road");
    // Absent, not false: this road IS painted, and the T1 contract says only
    // an explicit false disarms. A change that published false here would be
    // the same defect with the sign flipped.
    expect(tick.laneLinesPainted).toBeUndefined();
    expect(tick.centreLinePainted).toBeUndefined();
  });

  it("the same drift, half a metre INSIDE the kerb, still bills lane keeping", () => {
    // x = 11.5 m: `laneOffsetM` is the same clamped −4.06 m as the verge case
    // above, but the car's centre is still on the asphalt — so the conviction
    // the previous block removes must land here, or the change is an amnesty
    // rather than a correction.
    expect(driftAndGrade("ov-oncoming-v1", 11.5)).toContain("POOR_LANE_KEEPING");
  });

  it("sweeps every lane centre of both frames' districts and finds only carriageway", () => {
    // The gate is `outsideKerbM > OFF_CARRIAGEWAY_BODY_ALLOWANCE_M`, and on the
    // carriageway that distance is 0 — so proving every lane centre reads
    // `carriageway` through the production sample() proves the override can
    // never reach a student driving their own lane. (surface.ts's own suite
    // makes the same sweep over all 105 districts against the raw predicate;
    // this one is about the WIRING in worldRuntime.)
    const out = makeSurfaceFix();
    let points = 0;
    for (const id of ["ov-oncoming-v1", "ln-arrows-v1"]) {
      const raw = load(id) as {
        roads: {
          edges: Array<{ id: string; lanes: number; oneway: boolean; geometry: [number, number][] }>;
        };
      };
      const rt = createWorldRuntime(raw);
      let t = 1;
      for (const edge of raw.roads.edges) {
        const [ax, ay] = edge.geometry[0];
        const [bx, by] = edge.geometry[edge.geometry.length - 1];
        const len = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / len;
        const uy = (by - ay) / len;
        const lanesPerDir = edge.oneway ? edge.lanes : Math.max(1, Math.floor(edge.lanes / 2));
        const W = 3.25 * 2.5; // spatial.LANE_WIDTH_M
        for (let step = 5; step <= len - 5; step += 5) {
          for (let lane = 0; lane < lanesPerDir; lane++) {
            const lat = (lane + 0.5) * W;
            for (const side of [1, -1]) {
              const px = ax + ux * step + uy * lat * side;
              const py = ay + uy * step - ux * lat * side;
              rt.sample(vehicle(px, py), (t += 0.1), false);
              rt.surfaceUnderCar(out);
              expect(out.under, `${id} ${edge.id} s=${step} lane=${lane} side=${side}`).toBe(
                "carriageway",
              );
              points++;
            }
          }
        }
      }
    }
    expect(points).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// 3. UNKNOWN STAYS UNKNOWN
// ---------------------------------------------------------------------------

describe("a district whose asphalt cannot be indexed answers nothing", () => {
  const EMPTY = {
    format: "district-v1",
    meta: { boundsLocalMeters: { minX: -50, minY: -50, maxX: 50, maxY: 50 } },
    roads: { nodes: [], edges: [] },
    intersections: [],
    crossings: [],
    roundabouts: [],
    spawnPoints: [],
  };

  it("reports unknown instead of «the whole world is verge»", () => {
    const rt = createWorldRuntime(structuredClone(EMPTY));
    const tick = rt.sample(vehicle(0, 0), 1, false);
    const out = makeSurfaceFix();
    expect(rt.surfaceUnderCar(out)).toBe(false);
    // An index with zero asphalt triangles must not disarm every detector on
    // every hand-built fixture in this repo.
    expect(tick.laneLinesPainted).toBeUndefined();
    expect(tick.centreLinePainted).toBeUndefined();
  });

  it("an injected index is the one read, and clearing it restores the lazy one", () => {
    // Deliberately mismatched: an ov-oncoming-v1 runtime handed ln-arrows-v1's
    // asphalt. (4.06, 400) is a lane centre in the first and open ground in the
    // second, so the answer names WHICH index the consult actually consulted —
    // the only way to prove the LessonScene hand-over seam is wired rather than
    // decorative.
    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    const out = makeSurfaceFix();

    rt.setDrivableSurface(resolveDistrictDrivableSurface(load("ln-arrows-v1") as never));
    rt.sample(vehicle(4.06, 400), 1, false);
    expect(rt.surfaceUnderCar(out)).toBe(true);
    expect(out.under).not.toBe("carriageway");

    // Clearing must not leave the lazy path believing it already resolved.
    rt.setDrivableSurface(null);
    rt.sample(vehicle(4.06, 400), 2, false);
    expect(rt.surfaceUnderCar(out)).toBe(true);
    expect(out.under).toBe("carriageway");
  });
});

// ---------------------------------------------------------------------------
// 4. THE ROAD-MEMBERSHIP CHANNEL — where the boundary is, and that it is REAL
// ---------------------------------------------------------------------------
//
// `edgeId === null` is the runtime's only statement of „this car is nowhere in
// the authored world", and three consumers read it as exactly that: the C1
// lane-change basis and the act latch (`rules/engine.ts`), and the off-network
// ending (`lessons/finish.ts` O22, folded in `lessons/engine.ts`). Until the
// surface consult, the ONLY thing that produced it was the locator's 30 m
// centreline lock — so the block below is about the band between the kerb and
// that ring, measured on ov-oncoming-v1's own cross-section at y = 400:
//
//   x = 4.06 …  own-lane centre                    outsideKerbM 0.000
//   x = 12.125  the kerb (carriageway ends here)
//   x = 12.6    two wheels over, body mostly on     outsideKerbM 0.475
//   x = 13.1    the whole flank past the kerb       outsideKerbM 0.975
//   x = 16      in the verge                        outsideKerbM 3.875
//   x = 29.9    STILL locked to `ovg-e-road`        outsideKerbM 17.775
//   x = 31      the locator finally lets go         outsideKerbM 18.875
//
// OFF_CARRIAGEWAY_BODY_ALLOWANCE_M is 0.97 m (0.85 chassis half-width + 0.12 of
// deliberately-drivable kerb), so the boundary falls between the third and
// fourth rows. Both sides of it are asserted, which is what makes the constant
// a derivation rather than a number wearing one: set it to 0 and the 12.6 m
// case goes red; raise it past 3.875 and the 16 m case does.

describe("the boundary between a kerb kiss and a car that is nowhere", () => {
  it("KERB TOLERANCE: 0.475 m past the kerb is still ON the network", () => {
    // The whole reason OFF_CARRIAGEWAY_BODY_ALLOWANCE_M is not zero: a car that
    // clips a kerb with two wheels is still driving on the road, and ending its
    // lesson (or clearing its lane-change basis) for that would be the founder's
    // own complaint — a false failure manufactured by an instrument.
    const out = makeSurfaceFix();
    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    const tick = rt.sample(vehicle(12.6, 400), 1, false);
    rt.surfaceUnderCar(out);

    // The measurement this case rests on, asserted rather than assumed.
    expect(out.outsideKerbM).toBeGreaterThan(0);
    expect(out.outsideKerbM).toBeLessThan(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M);

    expect(tick.edgeId).toBe("ovg-e-road");
    // …and the paint stays armed with it: one predicate, one boundary.
    expect(tick.laneLinesPainted).toBeUndefined();
  });

  it("PAST THE FLANK: 3.875 m past the kerb is nowhere", () => {
    const out = makeSurfaceFix();
    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    const tick = rt.sample(vehicle(16, 400), 1, false);
    rt.surfaceUnderCar(out);

    expect(out.outsideKerbM).toBeGreaterThan(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M);
    expect(tick.edgeId).toBeNull();
  });

  it("the crossing is between 0.475 m and 0.975 m, and the constant is inside it", () => {
    // The ratchet. A mutation of OFF_CARRIAGEWAY_BODY_ALLOWANCE_M that survived
    // both cases above would have to land inside this interval, and this case
    // says the shipped value does — so „the number moved" and „the number was
    // deleted" are both red here, not merely one of them.
    expect(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M).toBeGreaterThan(0.475);
    expect(OFF_CARRIAGEWAY_BODY_ALLOWANCE_M).toBeLessThan(0.975);

    // And the sweep across the boundary, through the production sample(): the
    // channel flips exactly once, and it flips in the right place.
    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    let t = 1;
    const seen: Array<[number, boolean]> = [];
    for (let x = 4; x <= 20; x += 0.25) {
      seen.push([x, rt.sample(vehicle(x, 400), (t += 0.1), false).edgeId === null]);
    }
    const flips = seen.filter(([, off], i) => i > 0 && off !== seen[i - 1][1]);
    expect(flips.length, JSON.stringify(seen)).toBe(1);
    expect(flips[0][0]).toBeGreaterThan(12.125); // never inside the kerb
    expect(flips[0][0]).toBeLessThan(14); // and never as far out as the verge
  });
});

// ---------------------------------------------------------------------------
// 5. THE FALSE-REFUSAL SWEEP — nothing a student is SENT to may read nowhere
// ---------------------------------------------------------------------------
//
// This is the half that had to be measured before arming an ENDING on the
// channel, and it is the reason the asphalt referent is safer than the lock
// ring it overrules rather than merely different. `off-network-headroom.test.ts`
// measures the incumbent's exposure: 0.645 m, along the whole kerb band of
// district-v1's five-lane boulevard. The exposure of THIS predicate, on the
// same 105 districts, is zero at every pose a lesson can send a student to.

describe("nothing a student is sent to reads as nowhere", () => {
  const ALL_IDS = readdirSync(WORLD)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));

  it("every authored SPAWN POINT on all 105 districts is on drawn asphalt", () => {
    // Through the production sample(), not the raw predicate: this is a
    // statement about the tick a lesson's first frame actually receives.
    const offenders: string[] = [];
    let count = 0;
    for (const id of ALL_IDS) {
      const raw = load(id) as { spawnPoints?: Array<{ id: string; x: number; y: number }> };
      const rt = createWorldRuntime(raw);
      for (const sp of raw.spawnPoints ?? []) {
        count++;
        if (rt.sample(vehicle(sp.x, sp.y), 1 + count * 0.1, false).edgeId === null) {
          offenders.push(`${id}/${sp.id}`);
        }
      }
    }
    // The census is asserted first, for the reason this repo has learned four
    // times: a sweep that silently shrank still reports zero offenders.
    expect(ALL_IDS.length).toBeGreaterThanOrEqual(105);
    expect(count).toBeGreaterThanOrEqual(248);
    expect(offenders).toEqual([]);
  });

  it("every authored PARKING BAY centre is on drawn asphalt", () => {
    // The one way this change could have been catastrophic. A parking lesson
    // ends with the car STANDING STILL in a bay, and OFF_NETWORK_STUCK_S is
    // 75 s — so if a bay centre read `nowhere`, a student who parked perfectly
    // and waited would have his lesson closed with «колата е извън пътя».
    // Measured: the deepest bay is lot-par-v1's parallel slot, 6.28 m off the
    // aisle centreline, and its `outsideKerbM` is 0.000 — the builder draws the
    // bays into the aisle ribbon (round 3, „the parking lots get a street").
    const offenders: string[] = [];
    let bays = 0;
    for (const id of ALL_IDS) {
      const raw = load(id) as {
        meta?: { scenario?: { bays?: Array<{ x: number; y: number }> } };
      };
      const list = raw.meta?.scenario?.bays;
      if (!list || list.length === 0) continue;
      const rt = createWorldRuntime(raw);
      const out = makeSurfaceFix();
      for (const b of list) {
        bays++;
        const tick = rt.sample(vehicle(b.x, b.y), 1 + bays * 0.1, false);
        rt.surfaceUnderCar(out);
        if (tick.edgeId === null || out.under !== "carriageway") {
          offenders.push(`${id} bay@${b.x},${b.y} ${out.under} out=${out.outsideKerbM.toFixed(3)}`);
        }
      }
    }
    expect(bays).toBeGreaterThanOrEqual(117);
    expect(offenders).toEqual([]);
  });

  it("every travel-lane centre and kerbside PARKING BAND of every ribbon, all 105", () => {
    // The builder's own `halfWidth` (which includes the parking band), not a
    // `lanes × LANE_WIDTH_M` re-derivation — the same point off-network-
    // headroom.test.ts makes about its sweep, and the reason the worst pose is
    // findable at all. Measured: 57,000 poses, worst outsideKerbM 0.000 m.
    const offenders: string[] = [];
    let probes = 0;
    let worst = 0;
    for (const id of ALL_IDS) {
      const d = assertDistrict(load(id));
      const surface = resolveDistrictDrivableSurface(d);
      expect(surface, `${id} has no indexable asphalt`).not.toBeNull();
      const out = makeSurfaceFix();
      for (const eb of analyzeNetwork(d).edges) {
        if (!eb.line) continue;
        const travelHalf = eb.halfWidth - eb.parkingM;
        const lanes = Math.max(1, eb.edge.lanes);
        const laneW = (travelHalf * 2) / lanes;
        const lats: number[] = [];
        for (let L = 0; L < lanes; L++) lats.push(-travelHalf + laneW * (L + 0.5));
        if (eb.parkingM > 0) {
          lats.push(travelHalf + eb.parkingM / 2, -(travelHalf + eb.parkingM / 2));
        }
        for (let i = 1; i < eb.line.length; i++) {
          const [x0, y0] = eb.line[i - 1];
          const [x1, y1] = eb.line[i];
          const segLen = Math.hypot(x1 - x0, y1 - y0);
          if (segLen < 1e-6) continue;
          const nx = (y1 - y0) / segLen;
          const ny = -(x1 - x0) / segLen;
          for (let sM = 0; sM <= segLen; sM += 4) {
            const f = sM / segLen;
            for (const lat of lats) {
              probes++;
              const s = surfaceAt(
                surface!,
                x0 + (x1 - x0) * f + nx * lat,
                y0 + (y1 - y0) * f + ny * lat,
                out,
              );
              if (s.outsideKerbM > worst) worst = s.outsideKerbM;
              if (s.outsideKerbM > OFF_CARRIAGEWAY_BODY_ALLOWANCE_M && offenders.length < 10) {
                offenders.push(`${id} ${eb.edge.id} lat=${lat.toFixed(2)} out=${s.outsideKerbM}`);
              }
            }
          }
        }
      }
    }
    expect(probes).toBeGreaterThan(50_000);
    expect(offenders).toEqual([]);
    // Not „under the bar" — zero. If this ever becomes a positive number the
    // exposure stopped being nil and OFF_NETWORK_STUCK_S has to be re-argued.
    expect(worst).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. THE STUDENT SEES IT — end to end, through the shipped lesson engine
// ---------------------------------------------------------------------------
//
// Sections 1–5 are about a tick. This one is about the two findings, which are
// both about a DRIVE: «no off-route stop, no reset, no penalty» (A) and «ended
// naturally with 0 of 3 objectives done» after a hundred seconds on bare
// ground (B). The rig is the production one end to end — the real district, the
// real `createWorldRuntime().sample()`, the real compiled `sc-ov-oncoming-gap`
// lesson (finding A's own scenario) and the real `applyTick`. Nothing is
// hand-built, so a green here is a statement about the product.

describe("finding A's own lesson, driven into the verge, now ends and says why", () => {
  const DT = 0.25;

  /** Drive the compiled lesson at a fixed lateral offset for `dur` seconds. */
  function driveAt(xOffset: number, dur: number) {
    const template = SCENARIO_TEMPLATES.find((t) => t.id === "sc-ov-oncoming-gap");
    expect(template, "sc-ov-oncoming-gap must still be in the catalogue").toBeDefined();
    const lesson = compileScenario(template!, 1);
    expect(lesson.world?.districtId).toBe("ov-oncoming-v1");

    const rt = createWorldRuntime(load("ov-oncoming-v1"));
    let state = createLessonSession(lesson);
    let endedAtSec: number | null = null;
    let offRoadCard: { titleBg?: string; explanationBg?: string } | null = null;
    // 15 км/ч ≈ 4.17 m/s northwards up the corridor, from the lesson's own
    // spawn latitude. Slow on purpose: the whole 900 m road at this speed is
    // 216 s, so the car cannot run out of district before the 75 s bar.
    const MPS = 15 / 3.6;
    let drovenForSec = 0;
    for (let t = 0; t <= dur; t = Number((t + DT).toFixed(6))) {
      const tick = rt.sample(vehicle(xOffset, 15 + t * MPS, 0, 15), t, false);
      const step = applyTick(state, tick);
      state = step.state;
      drovenForSec = t;
      const card = step.hudEvents.find(
        (e) => e.kind === "lesson" && String(e.titleBg ?? "").includes("извън пътя"),
      );
      if (card) offRoadCard = card as { titleBg?: string; explanationBg?: string };
      if (state.phase !== "driving") {
        endedAtSec = state.endedAtSec ?? t;
        break;
      }
    }
    return { state, endedAtSec, offRoadCard, drovenForSec };
  }

  it("THE FIX: 3.9 m into the verge — the drive ends one bar after the kerb", () => {
    // Before this change the tick reported `edgeId: "ovg-e-road"` for every one
    // of these frames (the locator locks out to 30 m), `stepOffNetwork` never
    // started its clock, and this drive ran for as long as the loop did — which
    // is finding B's frame sequence exactly: painted road, bare ground, still
    // going a hundred seconds later.
    const { state, endedAtSec, offRoadCard } = driveAt(16, 200);

    expect(endedAtSec, "a car in the verge must not drive forever").not.toBeNull();
    expect(state.phase).toBe("completed");
    // The clock starts on the first frame off the asphalt, which here is frame
    // zero, so the ending lands just after the bar.
    expect(endedAtSec!).toBeGreaterThanOrEqual(OFF_NETWORK_STUCK_S);
    expect(endedAtSec!).toBeLessThan(OFF_NETWORK_STUCK_S + 5);

    // THEO-4: never a bare verdict. The student is told what happened and why
    // the lesson is closing rather than leaving him blocked, in the words the
    // ending owns — read off what the engine PUSHED, not off the helper.
    expect(offRoadCard, "the ending must announce itself").not.toBeNull();
    expect(offRoadCard!.titleBg).toBe(offNetworkEndingCopy(false).titleBg);
    expect(offRoadCard!.explanationBg).toBe(offNetworkEndingCopy(false).explanationBg);
    expect(offRoadCard!.explanationBg).toContain("извън пътната мрежа");
    expect(offRoadCard!.explanationBg!.length).toBeGreaterThan(80);
  });

  it("THE CONTROL: the same drive in its own lane is never ended on", () => {
    // Without this the case above is worthless — „the session ended" is equally
    // true of a rig that ends every session. Same lesson, same rig, same
    // duration, same speed; only the lateral offset differs, and the car is on
    // the asphalt the whole way.
    const { offRoadCard, drovenForSec } = driveAt(4.06, 200);
    expect(offRoadCard, "a car in its own lane may never be told it left the road").toBeNull();
    // …and it was given the CHANCE to be ended on. Without this the case is
    // worthless in the other direction: a drive that stopped at t = 3 s for
    // some unrelated reason cannot accumulate a 75 s bar, and „no card" would
    // be true of a rig that never ran.
    expect(drovenForSec).toBeGreaterThan(OFF_NETWORK_STUCK_S + 5);
  });

  it("…and neither is a car riding the kerb the whole way", () => {
    // The kerb-tolerance case from section 4, but as a DRIVE: 200 s at 0.475 m
    // past the kerb is 2.6 bars' worth of clock, so a threshold of zero would
    // close this lesson.
    const { offRoadCard, drovenForSec } = driveAt(12.6, 200);
    expect(offRoadCard).toBeNull();
    expect(drovenForSec).toBeGreaterThan(OFF_NETWORK_STUCK_S + 5);
  });
});
