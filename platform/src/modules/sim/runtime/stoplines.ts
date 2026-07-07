/**
 * sim/runtime — stop-line geometry derivation.
 *
 * OSM (and therefore district-v1.json) has no stop-line or sign data, so stop
 * lines are DERIVED. Two sources:
 *
 * 1. SIGNALIZED APPROACHES. Every edge arriving at a `signalized: true`
 *    intersection node gets a stop line across it, SIGNAL_SETBACK_M (7 m)
 *    before the node — roughly where the real line sits ahead of the zebra +
 *    lamp post. The line's lightState is adjudicated per approach axis
 *    (N-S / E-W) against the node's signal cluster.
 *
 * 2. STOP-SIGN HEURISTIC (honest documentation, per doc 17 §6/§8 the real
 *    signs arrive with the hand-polish overlay): at every UNSIGNALIZED
 *    intersection where a minor road (service / residential / unclassified,
 *    class rank ≤ 2) meets an arterial (primary / secondary / secondary_link,
 *    rank ≥ 4), each MINOR approach gets a stop-sign line 5 m before the node.
 *    - Tertiary meetings are excluded — those are typically yield (Б1), and
 *      modeling yield as stop would grade students unfairly.
 *    - Roundabout nodes are excluded (priority-inside, yield on entry).
 *    - This over-approximates reality (many such junctions carry Б1, not Б2);
 *      we accept it deliberately: it exercises the full-stop pedagogy and is
 *      replaced per-junction by the hand-polish overlay (wave 2).
 *
 * Oneway edges only get a line at their downstream end (no approach exists
 * against the flow). Setbacks clamp to half the edge length on short
 * dual-carriageway link stubs so lines stay on their own edge.
 */

import type { District } from "./district";
import { axisOfBearing, bearingDeg, type Axis } from "./geometry";
import type { DistrictIndex } from "./spatial";
import type { SignalController } from "./signals";

const SIGNAL_SETBACK_M = 7;
const STOP_SIGN_SETBACK_M = 5;
const ARTERIAL_MIN_RANK = 4;
const MINOR_MAX_RANK = 2;

export interface StopLine {
  /** Stable debug id: `<edgeId>@<sM>:<control>`. */
  id: string;
  edgeIdx: number;
  /** Arclength position of the line on the edge, meters. */
  sM: number;
  /** Travel direction that crosses this line: +1 = with geometry, -1 = against. */
  dirSign: 1 | -1;
  control: "trafficLight" | "stopSign";
  /** Intersection node the line guards. */
  junctionNodeId: string;
  /** Signal cluster (trafficLight lines), -1 for stop signs. */
  clusterIdx: number;
  /** Approach axis-group for phase adjudication (trafficLight lines). */
  group: Axis | null;
  /** Compass bearing of travel across the line (toward the junction). */
  approachBearingDeg: number;
}

export interface StopLineSet {
  all: StopLine[];
  /** Per edge index: indices into `all`, sorted by sM ascending. */
  byEdge: number[][];
}

export function buildStopLines(
  district: District,
  index: DistrictIndex,
  signals: SignalController,
): StopLineSet {
  const all: StopLine[] = [];
  const byEdge: number[][] = index.edges.map(() => []);

  const addApproach = (
    edgeIdx: number,
    junctionNodeId: string,
    atFromEnd: boolean,
    control: "trafficLight" | "stopSign",
    setbackM: number,
  ): void => {
    const rt = index.edgeRt(edgeIdx);
    if (atFromEnd && rt.edge.oneway) return; // flow leaves the junction here
    const sb = Math.min(setbackM, rt.totalLen / 2);
    const sM = atFromEnd ? sb : rt.totalLen - sb;
    const dirSign: 1 | -1 = atFromEnd ? -1 : 1;
    const [tx, ty] = index.tangentAt(edgeIdx, sM);
    const bearing = dirSign === 1 ? bearingDeg(tx, ty) : bearingDeg(-tx, -ty);
    const clusterIdx = control === "trafficLight" ? signals.clusterIdxForNode(junctionNodeId) : -1;
    const line: StopLine = {
      id: `${rt.edge.id}@${sM.toFixed(1)}:${control}`,
      edgeIdx,
      sM,
      dirSign,
      control,
      junctionNodeId,
      clusterIdx,
      group: control === "trafficLight" ? axisOfBearing(bearing) : null,
      approachBearingDeg: bearing,
    };
    byEdge[edgeIdx].push(all.length);
    all.push(line);
  };

  for (const it of district.intersections) {
    const incident = index.edgesAtNode.get(it.id) ?? [];
    if (incident.length === 0) continue;

    if (it.signalized) {
      for (const edgeIdx of incident) {
        const rt = index.edgeRt(edgeIdx);
        if (rt.edge.from === it.id) addApproach(edgeIdx, it.id, true, "trafficLight", SIGNAL_SETBACK_M);
        if (rt.edge.to === it.id) addApproach(edgeIdx, it.id, false, "trafficLight", SIGNAL_SETBACK_M);
      }
      continue;
    }

    // Stop-sign heuristic.
    if (incident.some((i) => index.edgeRt(i).edge.roundabout)) continue;
    const ranks = incident.map((i) => index.edgeRt(i).classRank);
    if (!ranks.some((r) => r >= ARTERIAL_MIN_RANK)) continue;
    for (const edgeIdx of incident) {
      const rt = index.edgeRt(edgeIdx);
      if (rt.classRank > MINOR_MAX_RANK) continue;
      if (rt.edge.from === it.id) addApproach(edgeIdx, it.id, true, "stopSign", STOP_SIGN_SETBACK_M);
      if (rt.edge.to === it.id) addApproach(edgeIdx, it.id, false, "stopSign", STOP_SIGN_SETBACK_M);
    }
  }

  for (const list of byEdge) {
    list.sort((a, b) => all[a].sM - all[b].sM);
  }
  return { all, byEdge };
}
