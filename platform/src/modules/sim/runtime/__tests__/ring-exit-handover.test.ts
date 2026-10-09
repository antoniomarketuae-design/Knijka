/**
 * THE RING LETS GO AT ITS OWN KERB — sc-rb-lane-choice:ffdffd55 [critical],
 * clause 1b (rig-w2, 2026-10-08, at 43b4109).
 *
 * THE ROW. A correct drive of «Коя лента в двулентово кръгово», at the lesson's
 * own «около 12 км/ч», ended «НЕ Е ВЗЕТ» with «Неустойчиво движение в лентата»
 * on phone-L3, pc-L1 and pc-L3 — on the west arm, inside its kerb lane.
 *
 * THE CAUSE, measured here on the built district. The locator hands the fix
 * from one edge to another on CENTRELINE distance (`EDGE_SWITCH_MARGIN_M`), and
 * the kerb lane of a four-lane arm is 12.19 m from that arm's axis by design.
 * So the ring kept the fix until the car was 8.06 m beyond the ring's own
 * carriageway; out there `computeLane` clamps the lateral coordinate, so the
 * lane offset read a constant −4.06 m, and a ring edge answers «lane lines
 * painted» everywhere. A car on the CENTRE LINE of the exit lane was read as
 * straddling for 9.55 m — 2.87 s at 12 км/ч against a 3 s sustain.
 *
 * WHAT IS PINNED. (1) The rule and each of its conditions, one control per
 * condition, each on a pose where the old answer and a careless new one differ.
 * (2) A census of every lane of every exit of every ring the product ships —
 * the number that says the lag is gone, with the base figure beside each row.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDistrict, type District } from "..";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { Locator } from "../locator";
import { DistrictIndex, LANE_WIDTH_M, makeEdgeHit } from "../spatial";
import { ringExitWalks } from "./ringExitWalk";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const load = (id: string): District =>
  parseDistrict(JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8")));

/** The straddle band the lane-keeping rule grades against (not touched here). */
const BAND_M = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;
const SUSTAIN_SEC = DEFAULT_RULE_CONFIG.laneKeepSustainSec;
/** The locator's own «past a boundary» tolerance — the ring's release margin. */
const DEADBAND_M = 0.35;

const bearing = (dx: number, dy: number): number => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;

/** A locator whose lock is `ringEdgeId`, arrived at as a circulating car does. */
function ringLocked(index: DistrictIndex, ringEdgeId: string): Locator {
  const rt = index.edgeRtById(ringEdgeId)!;
  const locator = new Locator(index);
  const outerM = ((rt.lanesPerDir - 1) / 2) * LANE_WIDTH_M;
  let edge: string | null = null;
  for (let s = rt.totalLen / 2; s <= rt.totalLen - 1 + 1e-9; s += 0.5) {
    const [x, y] = index.pointAt(rt.idx, s);
    const [tx, ty] = index.tangentAt(rt.idx, s);
    edge = locator.track(x + ty * outerM, y - tx * outerM, bearing(tx, ty)).edgeId;
  }
  expect(edge, `seed lock on ${ringEdgeId}`).toBe(ringEdgeId);
  return locator;
}

describe("rb-2lane-v1 — the west exit by the kerb lane, the row's own geometry", () => {
  const district = load("rb-2lane-v1");
  const index = new DistrictIndex(district);
  const ringIdx = index.edgeIdxById.get("rb2-e-ring-nw")!;
  const armIdx = index.edgeIdxById.get("rb2-e-arm-w")!;
  const hit = makeEdgeHit();
  /** The west arm's outbound kerb-lane centre (one and a half lane pitches). */
  const KERB_Y = 1.5 * LANE_WIDTH_M;

  it("the arm takes the fix where the ring's carriageway ends — to the deadband, not 8 m later", () => {
    const locator = ringLocked(index, "rb2-e-ring-nw");
    let handoverX: number | null = null;
    let lastRingOutsideM = 0;
    let steps = 0;
    // West along the kerb lane's own centre line, a centimetre at a time.
    for (let x = -27; x >= -48; x -= 0.01) {
      const fix = locator.track(x, KERB_Y, 270);
      const outsideRingM = index.projectOnEdge(ringIdx, x, KERB_Y, hit).outsideM;
      steps++;
      if (handoverX === null && fix.edgeId === "rb2-e-arm-w") handoverX = x;
      if (handoverX === null) {
        // Still the ring's: it may hold the fix only up to its kerb + deadband.
        expect(fix.edgeId, `x=${x.toFixed(2)}`).toBe("rb2-e-ring-nw");
        expect(outsideRingM, `x=${x.toFixed(2)}`).toBeLessThanOrEqual(DEADBAND_M + 1e-9);
        lastRingOutsideM = outsideRingM;
      } else {
        // Handed over: it never goes back, and the offset is the REAL one —
        // the car is on the lane's centre line, so it reads zero, not −4.06.
        expect(fix.edgeId, `x=${x.toFixed(2)}`).toBe("rb2-e-arm-w");
        expect(fix.laneId, `x=${x.toFixed(2)}`).toBe(0);
        expect(Math.abs(fix.laneOffsetM), `x=${x.toFixed(2)}`).toBeLessThan(1e-9);
      }
    }
    expect(steps).toBeGreaterThan(2000);
    expect(handoverX).not.toBeNull();
    // The ring really did hold on right up to the margin (not released early)…
    expect(lastRingOutsideM).toBeGreaterThan(DEADBAND_M - 0.02);
    // …and the hand-over is at r ≈ 34.3, where the capture measured r ≈ 42.4.
    const r = Math.hypot(handoverX as number, KERB_Y);
    expect(r).toBeGreaterThan(34.0);
    expect(r).toBeLessThan(34.6);
  });

  it("on the arm the offset is the car's real distance from its lane centre, either side of it", () => {
    for (const offLaneM of [-2.5, -1, 0, 1, 2.5]) {
      const locator = ringLocked(index, "rb2-e-ring-nw");
      // Driving west, north is the driver's right: + offLaneM = left of travel = smaller y.
      const y = KERB_Y - offLaneM;
      const fix = locator.track(-38, y, 270);
      expect(fix.edgeId, `${offLaneM}`).toBe("rb2-e-arm-w");
      expect(fix.laneOffsetM, `${offLaneM}`).toBeCloseTo(offLaneM, 9);
    }
  });

  it("CONTROL — inside the ring's carriageway the ring keeps the fix, even where the arm's axis is the nearer one", () => {
    const locator = ringLocked(index, "rb2-e-ring-nw");
    const fix = locator.track(-31, 3, 270);
    const ring = index.projectOnEdge(ringIdx, -31, 3, makeEdgeHit());
    const arm = index.projectOnEdge(armIdx, -31, 3, makeEdgeHit());
    expect(ring.outsideM).toBe(0); // still on the ring's asphalt band
    expect(arm.distM).toBeLessThan(ring.distM); // and the arm's axis IS nearer
    expect(fix.edgeId).toBe("rb2-e-ring-nw");
  });

  it("CONTROL — on the verge beside the mouth (outside BOTH carriageways) it is still a car that left the ring's lane", () => {
    const locator = ringLocked(index, "rb2-e-ring-nw");
    const fix = locator.track(-36, 18, 270);
    expect(index.projectOnEdge(ringIdx, -36, 18, makeEdgeHit()).outsideM).toBeGreaterThan(DEADBAND_M);
    const arm = index.projectOnEdge(armIdx, -36, 18, makeEdgeHit());
    expect(arm.outsideM).toBeGreaterThan(1); // 1.75 m past the arm's kerb
    expect(arm.sM).toBeGreaterThan(0);
    expect(arm.sM).toBeLessThan(index.edgeRt(armIdx).totalLen); // abeam it
    expect(fix.edgeId).toBe("rb2-e-ring-nw");
    expect(Math.abs(fix.laneOffsetM)).toBeGreaterThan(BAND_M);
    expect(fix.laneLinesPainted).toBe(true);
  });

  it("CONTROL — riding the central island next to a mouth is not handed to that arm (its end cap reaches back over the ring)", () => {
    const locator = ringLocked(index, "rb2-e-ring-se");
    const seIdx = index.edgeIdxById.get("rb2-e-ring-se")!;
    const sIdx = index.edgeIdxById.get("rb2-e-arm-s")!;
    // r = 17.0 at φ 30° — 0.9 m inside the island's kerb, heading plausible for both.
    const [x, y] = [8.5, -14.72];
    const ring = index.projectOnEdge(seIdx, x, y, makeEdgeHit());
    const arm = index.projectOnEdge(sIdx, x, y, makeEdgeHit());
    expect(ring.outsideM).toBeGreaterThan(DEADBAND_M); // off the ring, island side
    expect(arm.outsideM).toBe(0); // «inside» the arm's width…
    expect(arm.sM).toBeCloseTo(index.edgeRt(sIdx).totalLen, 9); // …but only via its END CAP
    const fix = locator.track(x, y, 30);
    expect(fix.edgeId).toBe("rb2-e-ring-se");
    expect(Math.abs(fix.laneOffsetM)).toBeGreaterThan(BAND_M);
    expect(fix.laneLinesPainted).toBe(true);
  });

  it("CONTROL — the heading gate still applies: a car circulating wide across the mouth is not handed to the arm it is crossing", () => {
    const locator = ringLocked(index, "rb2-e-ring-nw");
    const [x, y] = [-35, 5];
    expect(index.projectOnEdge(ringIdx, x, y, makeEdgeHit()).outsideM).toBeGreaterThan(DEADBAND_M);
    const arm = index.projectOnEdge(armIdx, x, y, makeEdgeHit());
    expect(arm.outsideM).toBe(0);
    expect(arm.sM).toBeLessThan(index.edgeRt(armIdx).totalLen - 1);
    // Heading south — along the ring at its west node, square across the arm.
    expect(locator.track(x, y, 180).edgeId).toBe("rb2-e-ring-nw");
    // The same place, heading out along the arm: that IS an exit.
    expect(ringLocked(index, "rb2-e-ring-nw").track(x, y, 270).edgeId).toBe("rb2-e-arm-w");
  });
});

describe("the rule is the ring's alone — every other hand-over is the centreline rule, unchanged", () => {
  it("one ring segment to the next: rb-mini-v1, the outer kerb past the east node", () => {
    const index = new DistrictIndex(load("rb-mini-v1"));
    const locator = ringLocked(index, "rbm-e-ring-se");
    const [x, y] = [20.9, 4.4];
    const se = index.projectOnEdge(index.edgeIdxById.get("rbm-e-ring-se")!, x, y, makeEdgeHit());
    const enIdx = index.edgeIdxById.get("rbm-e-ring-en")!;
    const en = index.projectOnEdge(enIdx, x, y, makeEdgeHit());
    // Every condition of the ring's release holds here but one: the rival is a ring.
    expect(se.outsideM).toBeGreaterThan(DEADBAND_M);
    expect(en.outsideM).toBe(0);
    expect(en.sM).toBeGreaterThan(1);
    expect(en.sM).toBeLessThan(index.edgeRt(enIdx).totalLen - 1);
    expect(locator.track(x, y, 3).edgeId).toBe("rbm-e-ring-se");
  });

  it("a side street onto a six-lane boulevard: district-v1, ул. Трайко Станоев → бул. Св. Климент Охридски", () => {
    const index = new DistrictIndex(load("district-v1"));
    const a = index.edgeRtById("e519275131.0")!;
    const b = index.edgeRtById("e672186634.0")!;
    expect(a.edge.roundabout || b.edge.roundabout).toBe(false);
    const node = a.edge.to === b.edge.from || a.edge.to === b.edge.to ? a.edge.to : a.edge.from;
    const dirA = a.edge.to === node ? 1 : -1;
    const dirB = b.edge.from === node ? 1 : -1;
    const locator = new Locator(index);
    const kerb = (rt: typeof a): number => (rt.lanesPerDir - 0.5) * LANE_WIDTH_M;
    // Up the side street's own lane to its mouth…
    let edge: string | null = null;
    for (let s = a.totalLen / 2; s >= 1; s -= 0.5) {
      const sE = dirA === 1 ? a.totalLen - s : s;
      const [cx, cy] = index.pointAt(a.idx, sE);
      const [gx, gy] = index.tangentAt(a.idx, sE);
      edge = locator.track(cx + gy * dirA * kerb(a), cy - gx * dirA * kerb(a), bearing(gx * dirA, gy * dirA)).edgeId;
    }
    expect(edge).toBe(a.edge.id);
    // …then out along the boulevard's kerb lane. While the centreline rule has
    // not handed over, the side street keeps the fix — however far beyond its
    // own carriageway the car is, and although it is inside the boulevard's.
    let worstLagM = 0;
    let lagSteps = 0;
    for (let s = 0; s <= 30; s += 0.25) {
      const sE = dirB === 1 ? s : b.totalLen - s;
      const [cx, cy] = index.pointAt(b.idx, sE);
      const [gx, gy] = index.tangentAt(b.idx, sE);
      const x = cx + gy * dirB * kerb(b);
      const y = cy - gx * dirB * kerb(b);
      const ha = index.projectOnEdge(a.idx, x, y, makeEdgeHit());
      const hb = index.projectOnEdge(b.idx, x, y, makeEdgeHit());
      const fix = locator.track(x, y, bearing(gx * dirB, gy * dirB));
      if (fix.edgeId !== a.edge.id) break;
      const releaseWouldHold = ha.outsideM > DEADBAND_M && hb.outsideM === 0 && hb.sM > 1e-6 && hb.sM < b.totalLen - 1e-6;
      if (releaseWouldHold) {
        lagSteps++;
        worstLagM = Math.max(worstLagM, ha.outsideM);
        // …and no lane line is claimed out there, which is why this lag bills nobody.
        expect(fix.laneLinesPainted, `s=${s}`).toBe(false);
      }
    }
    expect(lagSteps).toBeGreaterThan(20);
    expect(worstLagM).toBeGreaterThan(15); // measured 16.13 m at 43b4109 and here
  });
});

// ---------------------------------------------------------------------------
// THE CENSUS — every lane of every exit of every ring the product ships.
// ---------------------------------------------------------------------------

/** [ring edge, exit road, exit lane (0 = kerb), m beyond the ring's kerb at the
 *  hand-over, m of «ring edge, lines painted, |offset| past the band» read on
 *  the exit lane's own centre line]. The trailing comment is the same row at
 *  43b4109, before the change. */
type Row = [string, string, number, number, number];
const CENSUS: Record<string, Row[]> = {
  "rb-2lane-v1": [
    ["rb2-e-ring-se", "rb2-e-arm-e", 0, 0.37, 1.25], // base 8.06 m, 9.55 m
    ["rb2-e-ring-se", "rb2-e-arm-e", 1, 0, 1.05], // base 0 m, 1.05 m
    ["rb2-e-ring-en", "rb2-e-arm-n", 0, 0.37, 1.25], // base 8.06 m, 9.55 m
    ["rb2-e-ring-en", "rb2-e-arm-n", 1, 0, 1.05], // base 0 m, 1.05 m
    ["rb2-e-ring-nw", "rb2-e-arm-w", 0, 0.37, 1.25], // base 8.06 m, 9.55 m  ← the row
    ["rb2-e-ring-nw", "rb2-e-arm-w", 1, 0, 1.05], // base 0 m, 1.05 m
    ["rb2-e-ring-ws", "rb2-e-arm-s", 0, 0.37, 1.25], // base 8.06 m, 9.55 m
    ["rb2-e-ring-ws", "rb2-e-arm-s", 1, 0, 1.05], // base 0 m, 1.05 m
  ],
  "rb-mini-v1": [
    ["rbm-e-ring-se", "rbm-e-arm-e", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbm-e-ring-en", "rbm-e-arm-n", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbm-e-ring-nw", "rbm-e-arm-w", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbm-e-ring-ws", "rbm-e-arm-s", 0, 0.38, 1.2], // base 4 m, 4.85 m
  ],
  "rb-ped-v1": [
    ["rbp-e-ring-se", "rbp-e-arm-e", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbp-e-ring-en", "rbp-e-arm-n", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbp-e-ring-nw", "rbp-e-arm-w", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbp-e-ring-ws", "rbp-e-arm-s", 0, 0.38, 1.2], // base 4 m, 4.85 m
  ],
  "rb-single-v1": [
    ["rbs-e-ring-se", "rbs-e-arm-e", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbs-e-ring-en", "rbs-e-arm-n", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbs-e-ring-nw", "rbs-e-arm-w", 0, 0.38, 1.2], // base 4 m, 4.85 m
    ["rbs-e-ring-ws", "rbs-e-arm-s", 0, 0.38, 1.2], // base 4 m, 4.85 m
  ],
  // The two real rings (OSM). Their exits are one-way roads whose axis runs
  // through the exit lanes, so the centreline rule already handed over inside
  // the ring's carriageway: unchanged, row for row.
  "d2-v1": [
    ["e1323634719.0", "e193362540.0", 0, 0, 0], // base 0 m, 0 m
    ["e1323634719.0", "e193362540.0", 1, 0, 2.7], // base 0 m, 2.7 m
    ["e259188190.1", "e193362536.0", 0, 0, 0], // base 0 m, 0 m
    ["e259188190.1", "e193362536.0", 1, 0, 3.1], // base 0 m, 3.1 m
    ["e259188191.0", "e193362537.0", 0, 0, 4.05], // base 0 m, 4.05 m
    ["e259470445.0", "e193362543.0", 0, 0, 0], // base 0 m, 0 m
    ["e259470445.0", "e193362543.0", 1, 0, 2.9], // base 0 m, 2.9 m
  ],
  "district-v1": [
    ["e1163616027.0", "e89604118.0", 0, 0, 0], // base 0 m, 0 m
    ["e925166132.0", "e89604105.0", 0, 0, 0], // base 0 m, 0 m
  ],
};

describe("census — every lane of every exit of every ring", () => {
  const walks = Object.fromEntries(Object.keys(CENSUS).map((id) => [id, ringExitWalks(load(id), BAND_M)]));

  it("these six districts are every district that has a ring", () => {
    const withRing: string[] = [];
    for (const f of readdirSync(WORLD).filter((n) => n.endsWith(".json"))) {
      const raw = JSON.parse(readFileSync(path.join(WORLD, f), "utf-8")) as { roads?: { edges?: Array<{ roundabout?: boolean }> } };
      if ((raw.roads?.edges ?? []).some((e) => e.roundabout === true)) withRing.push(f.replace(/\.json$/, ""));
    }
    expect(withRing.sort()).toEqual(Object.keys(CENSUS).sort());
  });

  it("row for row: where the fix leaves the ring, and how much false straddle it reads first", () => {
    for (const [id, rows] of Object.entries(CENSUS)) {
      const got = walks[id].map((w): Row => [w.ringEdgeId, w.exitEdgeId, w.laneId, w.outsideRingAtHandoverM ?? -1, w.offBandRunM]);
      expect(got, id).toEqual(rows);
    }
  });

  it("no exit lane's centre line is read as the ring's more than the deadband beyond the ring's kerb (base: 8.06 m and 4.0 m on 20 of 29)", () => {
    let lanes = 0;
    for (const [id, ws] of Object.entries(walks)) {
      for (const w of ws) {
        lanes++;
        expect(w.handoverAtM, `${id} ${w.exitEdgeId} lane ${w.laneId}`).not.toBeNull();
        // one 5 cm step of the walk past the margin
        expect(w.outsideRingAtHandoverM as number, `${id} ${w.exitEdgeId} lane ${w.laneId}`).toBeLessThanOrEqual(DEADBAND_M + 0.05);
        // and once on the exit road the lane's centre line reads as the lane's centre
        expect(w.worstOffsetOnExitM, `${id} ${w.exitEdgeId} lane ${w.laneId}`).toBeLessThan(0.15);
      }
    }
    expect(lanes).toBe(29);
  });

  it("at the lesson pace no exit lane can be convicted of lane keeping for driving its own centre line — and the pace at which one could is a crawl", () => {
    // Seconds of false straddle at 12 км/ч, and the pace below which the
    // false stretch alone would outlast laneKeepSustainSec.
    const at12 = (m: number): number => m / (12 / 3.6);
    const billsBelowKmh = (m: number): number => (m / SUSTAIN_SEC) * 3.6;
    const worstByDistrict: Record<string, number> = {};
    for (const [id, ws] of Object.entries(walks)) {
      worstByDistrict[id] = Math.max(...ws.map((w) => w.offBandRunM));
    }
    // The four lesson rings: under 0.4 s at 12 км/ч (base rb-2lane 2.87 s —
    // 0.13 s short of a conviction; any exit under 11.5 км/ч drew one).
    for (const id of ["rb-2lane-v1", "rb-mini-v1", "rb-ped-v1", "rb-single-v1"]) {
      expect(at12(worstByDistrict[id]), id).toBeLessThan(0.4);
      expect(billsBelowKmh(worstByDistrict[id]), id).toBeLessThanOrEqual(1.5);
    }
    // The real rings, unchanged by this change: the worst is 4.05 m INSIDE the
    // ring's own carriageway (d2-v1, a single-lane slip road) — 4.9 км/ч.
    expect(billsBelowKmh(worstByDistrict["d2-v1"])).toBeLessThan(5);
    expect(worstByDistrict["district-v1"]).toBe(0);
  });
});
