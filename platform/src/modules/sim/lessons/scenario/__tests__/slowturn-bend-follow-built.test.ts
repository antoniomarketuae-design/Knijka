/**
 * NO ADDED TURN FOR A CAR THAT FOLLOWS THE ROAD — on the BUILT world (lane
 * slowturn, T4). runtime/turns.ts's added path measures the change in the
 * direction of travel against the road: the lane fix's edge, carried through
 * the node onto its least-deflection continuation. So a car that stays on a
 * road which bends through a junction must net ≈ 0°.
 *
 * Every catalogue district, every non-ring intersection node, every approach
 * edge whose through continuation (deflection < 55°) makes the road bend 35°
 * or more between 40 m before and 40 m after the node: a car driven along its
 * right-hand lane at 8, 12 and 15 km/h, its pose fed on the runtime's 60 Hz
 * grid through the Locator, the junction area and the product TurnDetector.
 * The base window may fire on such a bend (that is pre-existing and not this
 * test's subject); the ADDED path must not.
 */
import { describe, expect, it } from "vitest";
import { parseDistrict } from "../../../runtime";
import { bearingDeg, signedDeltaDeg } from "../../../runtime/geometry";
import { Locator } from "../../../runtime/locator";
import { DistrictIndex, LANE_WIDTH_M } from "../../../runtime/spatial";
import { createTurnRoadPort, JUNCTION_AREA_RADIUS_M, TurnDetector, type TurnRoadSample } from "../../../runtime/turns";
import type { SimTickEvent } from "../../../rules/types";
import { FIXED_DT } from "../../../vehicle/tuning";
import { SCENARIO_TEMPLATES } from "../templates";
import { loadDistrict } from "./witnessLiveRung";

const REACH_M = 40;
const MIN_BEND_DEG = 35;

interface Leg {
  district: string;
  node: string;
  e0: number;
  s0: 1 | -1;
  e1: number;
  s1: 1 | -1;
  bendDeg: number;
}

function legsOf(districtId: string): { legs: Leg[]; index: DistrictIndex; ring: Set<string> } {
  const district = parseDistrict(loadDistrict(districtId));
  const index = new DistrictIndex(district);
  const port = createTurnRoadPort(index);
  const ring = new Set<string>();
  for (const e of district.roads.edges) {
    if (!e.roundabout) continue;
    ring.add(e.from);
    ring.add(e.to);
  }
  const legs: Leg[] = [];
  for (const ix of district.intersections) {
    if (ring.has(ix.id)) continue;
    for (const e0 of index.edgesAtNode.get(ix.id) ?? []) {
      const rt0 = index.edges[e0];
      if (rt0.edge.from === rt0.edge.to) continue;
      const s0: 1 | -1 = rt0.edge.to === ix.id ? 1 : -1;
      if (rt0.edge.oneway && s0 < 0) continue;
      const th = port.through(e0, s0);
      if (th === null) continue;
      const rt1 = index.edges[th.edgeIdx];
      const inS = s0 > 0 ? Math.max(0, rt0.totalLen - REACH_M) : Math.min(rt0.totalLen, REACH_M);
      const outS = th.sign > 0 ? Math.min(rt1.totalLen, REACH_M) : Math.max(0, rt1.totalLen - REACH_M);
      const bendDeg = Math.abs(signedDeltaDeg(port.bearingDeg(e0, inS, s0), port.bearingDeg(th.edgeIdx, outS, th.sign)));
      if (bendDeg >= MIN_BEND_DEG) legs.push({ district: districtId, node: ix.id, e0, s0, e1: th.edgeIdx, s1: th.sign, bendDeg });
    }
  }
  return { legs, index, ring };
}

/** Lane-centre poses along one edge, `len` metres in the travel sense, every `ds` m. */
function* along(index: DistrictIndex, e: number, sign: 1 | -1, fromS: number, len: number, ds: number) {
  const rt = index.edges[e];
  const off = rt.edge.oneway ? 0 : LANE_WIDTH_M / 2;
  for (let d = 0; d <= len; d += ds) {
    const s = fromS + sign * d;
    if (s < 0 || s > rt.totalLen) break;
    const [px, py] = index.pointAt(e, s);
    const [tx, ty] = index.tangentAt(e, s);
    const dx = tx * sign;
    const dy = ty * sign;
    yield { x: px + dy * off, y: py - dx * off, h: bearingDeg(dx, dy) };
  }
}

function addedOnLeg(leg: Leg, index: DistrictIndex, ring: Set<string>, kmh: number): string[] {
  const port = createTurnRoadPort(index);
  const locator = new Locator(index);
  const det = new TurnDetector();
  const sample: TurnRoadSample = { nodeId: null, ring: false, edgeIdx: -1, sM: 0, port };
  const ds = (kmh / 3.6) * FIXED_DT;
  const rt0 = index.edges[leg.e0];
  const rt1 = index.edges[leg.e1];
  const inFrom = leg.s0 > 0 ? Math.max(0, rt0.totalLen - REACH_M) : Math.min(rt0.totalLen, REACH_M);
  const outFrom = leg.s1 > 0 ? 0 : rt1.totalLen;
  const poses = [
    ...along(index, leg.e0, leg.s0, inFrom, REACH_M, ds),
    ...along(index, leg.e1, leg.s1, outFrom, REACH_M, ds),
  ];
  const ev: SimTickEvent[] = [];
  const out: string[] = [];
  poses.forEach((p, i) => {
    const k = i + 1;
    const fix = locator.track(p.x, p.y, p.h);
    const ix = index.nearestIntersection(p.x, p.y, JUNCTION_AREA_RADIUS_M);
    sample.nodeId = ix?.id ?? null;
    sample.ring = ix !== null && ring.has(ix.id);
    sample.edgeIdx = fix.edgeIdx;
    sample.sM = fix.sM;
    ev.length = 0;
    det.update(k * FIXED_DT, p.h, ix !== null, ev, kmh, sample);
    for (const e of ev) {
      if (e.kind === "turnStarted" && e.addedPath === true) {
        out.push(`${leg.district} ${leg.node} ${index.edges[leg.e0].edge.id}→${index.edges[leg.e1].edge.id} (${leg.bendDeg.toFixed(0)}°) @${kmh} km/h k${k} ${e.direction}`);
      }
    }
  });
  return out;
}

const districts = [...new Set(SCENARIO_TEMPLATES.map((s) => s.map.districtId))].sort();

describe("T4 — following a bending road through a built junction is never an added turn", () => {
  const all: Array<{ legs: Leg[]; index: DistrictIndex; ring: Set<string> }> = districts.map(legsOf);
  const nLegs = all.reduce((n, d) => n + d.legs.length, 0);

  it("the census finds the built through-bends of 35° or more (a vacuous pass is a red)", () => {
    expect(nLegs).toBeGreaterThan(0);
  });

  it.each([8, 12, 15])("BUILT-BEND-FOLLOW at %i km/h: no added turnStarted on any of them", (kmh) => {
    const bad: string[] = [];
    for (const d of all) for (const leg of d.legs) bad.push(...addedOnLeg(leg, d.index, d.ring, kmh));
    expect(bad).toEqual([]);
  });
});
