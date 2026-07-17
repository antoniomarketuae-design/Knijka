/**
 * sim/runtime — stop-line geometry derivation.
 *
 * OSM (and therefore district-v1.json) has no stop-line or sign data, so stop
 * lines are DERIVED. Three sources:
 *
 * 1. SIGNALIZED APPROACHES. Every edge arriving at a `signalized: true`
 *    intersection node gets a stop line across it, at the JUNCTION MOUTH —
 *    the same open-radius cut the world builder trims ribbons at (shared
 *    nodeOpenRadiusM math + STOP_LINE_BEYOND_CUT_M), never closer than
 *    SIGNAL_SETBACK_M. With the perceptual road scale (2.5×) junction
 *    patches reach 17–43 m from the node, so a fixed setback would sit
 *    INSIDE the junction; deriving from the same math as the painted line
 *    keeps grading and paint coincident. The line's lightState is
 *    adjudicated per approach axis (N-S / E-W) against the node's signal
 *    cluster.
 *
 * 2. STOP-SIGN HEURISTIC (honest documentation, per doc 17 §6/§8 the real
 *    signs arrive with the hand-polish overlay): at every UNSIGNALIZED
 *    intersection where a minor road (service / residential / unclassified,
 *    class rank ≤ 2) meets an arterial (primary / secondary / secondary_link,
 *    rank ≥ 4), each MINOR approach gets a stop-sign line at the junction
 *    mouth (same derivation as source 1, floor STOP_SIGN_SETBACK_M).
 *    - Tertiary meetings are excluded — those are typically yield (Б1), and
 *      modeling yield as stop would grade students unfairly.
 *    - Roundabout nodes are excluded (priority-inside, yield on entry).
 *    - This over-approximates reality (many such junctions carry Б1, not Б2);
 *      we accept it deliberately: it exercises the full-stop pedagogy and is
 *      replaced per-junction by the hand-polish overlay (wave 2).
 *
 * 3. HAND-PLACED OVERRIDES (STOP_LINE_OVERRIDES): junctions the curriculum
 *    depends on that neither source reaches — see the table's comment.
 *
 * Oneway edges only get a line at their downstream end (no approach exists
 * against the flow). Setbacks clamp to half the edge length on short
 * dual-carriageway link stubs so lines stay on their own edge.
 */

import { PERCEPTUAL_ROAD_SCALE } from "../contracts";
import {
  JUNCTION_TRIM_MAX_FRACTION,
  nodeOpenRadiusM,
  STOP_LINE_BEYOND_CUT_M,
} from "../world/builders/network";
import type { District } from "./district";
import { axisOfBearing, bearingDeg, type Axis } from "./geometry";
import type { DistrictIndex } from "./spatial";
import type { SignalController } from "./signals";

/**
 * Fallback setbacks from the junction node (textbook 7 m / 5 m × the
 * perceptual road scale), used ONLY when a node's open radius cannot be
 * computed (no incident edges — degenerate data). Everywhere else the
 * setback is the junction-mouth cut (nodeOpenRadiusM, clamped per edge
 * exactly like the ribbon trim) + STOP_LINE_BEYOND_CUT_M — the graded line
 * must COINCIDE with the painted line (never before it, or a driver stopping
 * at the paint gets flagged; never after it, or grading fires mid-junction).
 */
export const SIGNAL_SETBACK_M = 7 * PERCEPTUAL_ROAD_SCALE;
export const STOP_SIGN_SETBACK_M = 5 * PERCEPTUAL_ROAD_SCALE;

const ARTERIAL_MIN_RANK = 4;
const MINOR_MAX_RANK = 2;

/**
 * HAND-PLACED priority lines — a deterministic override table applied AFTER
 * the derived sources, for junctions the heuristics can never reach (doc 68
 * QW4). Each entry pins a line on the `edgeId` approach into `nodeId` (both
 * ends of a two-way edge that touch the node get the line, same as the
 * heuristic). The world builder mirrors this table for the visible sign +
 * painted line (world/builders/props.ts), so grading and visuals always agree.
 * Entries survive until the hand-polish overlay (doc 17 §6/§8) replaces
 * per-junction control wholesale.
 *
 * `control` picks the sign: absent/"stopSign" = Б2 „Стоп" (full stop);
 * "giveWay" = Б1 „Пропусни движението" (yield only). Give-way is the authoring
 * hook for a Б1 node — a junction node carrying a Б1 sign resolves to a giveWay
 * line here (the heuristic never manufactures one, and no entry sets it today,
 * so every shipped map is byte-identical).
 */
export interface StopLineOverride {
  nodeId: string;
  edgeId: string;
  /** Sign kind of the pinned line; default "stopSign" (Б2). "giveWay" = Б1. */
  control?: "stopSign" | "giveWay";
}

export const STOP_LINE_OVERRIDES: readonly StopLineOverride[] = [
  // Lesson 2's „Спри!" objective (l2-stop-sign, lessons/specs.ts) requires a
  // Б2 line at n331942490 — but all three incident edges there are
  // `unclassified` (rank 2), so the minor-meets-arterial heuristic below
  // never fires and the objective could never complete, locking L3–L7
  // (audit 04 D10, curriculum-bricking risk). Verified missing 2026-07-10.
  // The pinned approach is the player's: northbound oneway e897608662.0.
  { nodeId: "n331942490", edgeId: "e897608662.0" },
];

export interface StopLine {
  /** Stable debug id: `<edgeId>@<sM>:<control>`. */
  id: string;
  edgeIdx: number;
  /** Arclength position of the line on the edge, meters. */
  sM: number;
  /** Travel direction that crosses this line: +1 = with geometry, -1 = against. */
  dirSign: 1 | -1;
  /**
   * Sign kind guarding the line. "trafficLight" = signalized; "stopSign" = Б2
   * „Стоп" (full stop demanded at the line regardless of traffic, ЗДвП чл. 50);
   * "giveWay" = Б1 „Пропусни движението" (yield to priority traffic, NO full
   * stop when the mouth is clear — same чл. 50, „пълно спиране се налага само
   * когато иначе би ги засякъл", content bank q-krastovishta-006). A giveWay
   * line appears ONLY where a Б1 node is authored (STOP_LINE_OVERRIDES.control),
   * of which there are none today — so every shipped map still emits only
   * stopSign/trafficLight (byte-identical).
   */
  control: "trafficLight" | "stopSign" | "giveWay";
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

  /**
   * Junction-mouth setback for an approach: the world builder's open-radius
   * cut on this edge (identical math incl. the per-edge trim clamp) plus the
   * paint inset. Guarantees the graded line sits ON the painted line, just
   * outside the junction patch. The scaled textbook setback is only a
   * fallback for nodes with no computable radius.
   */
  const mouthSetbackM = (edgeIdx: number, junctionNodeId: string, fallbackM: number): number => {
    const incident = index.edgesAtNode.get(junctionNodeId) ?? [];
    const touched = incident.map((i) => index.edgeRt(i).edge);
    const radius = nodeOpenRadiusM(touched, touched.length);
    if (radius <= 0) return fallbackM;
    const rt = index.edgeRt(edgeIdx);
    return Math.min(radius, rt.totalLen * JUNCTION_TRIM_MAX_FRACTION) + STOP_LINE_BEYOND_CUT_M;
  };

  const addApproach = (
    edgeIdx: number,
    junctionNodeId: string,
    atFromEnd: boolean,
    control: "trafficLight" | "stopSign" | "giveWay",
    fallbackM: number,
  ): void => {
    const rt = index.edgeRt(edgeIdx);
    if (atFromEnd && rt.edge.oneway) return; // flow leaves the junction here
    // C1 revision — no lines INSIDE a signal cluster. OSM models one physical
    // signalized complex as several micro-nodes (the „Семов" block, the NW
    // „Габровски" cluster) whose 4–25 m link stubs run between SAME-cluster
    // members. A driver who entered the complex on green then faces the
    // perpendicular axis-group's red on an interior stub — the официален
    // обратен завой around the block becomes ungradable (10-point
    // RED_LIGHT_CROSSED for a lawful transit — the C1 FP case in
    // stoplines.test.ts). Real complexes paint stop lines only on their
    // OUTER approaches; interior edges get none.
    if (control === "trafficLight") {
      const otherEnd = rt.edge.from === junctionNodeId ? rt.edge.to : rt.edge.from;
      const cluster = signals.clusterIdxForNode(junctionNodeId);
      if (cluster >= 0 && signals.clusterIdxForNode(otherEnd) === cluster) return;
    }
    const sb = Math.min(mouthSetbackM(edgeIdx, junctionNodeId, fallbackM), rt.totalLen / 2);
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

  // Hand-placed overrides (see STOP_LINE_OVERRIDES above). Skipped when the
  // heuristics already guard that node+edge, so the table is idempotent.
  for (const ov of STOP_LINE_OVERRIDES) {
    const edgeIdx = index.edgeIdxById.get(ov.edgeId);
    if (edgeIdx === undefined) continue;
    const alreadyGuarded = byEdge[edgeIdx].some(
      (li) => all[li].junctionNodeId === ov.nodeId,
    );
    if (alreadyGuarded) continue;
    const control = ov.control ?? "stopSign";
    const rt = index.edgeRt(edgeIdx);
    if (rt.edge.from === ov.nodeId) {
      addApproach(edgeIdx, ov.nodeId, true, control, STOP_SIGN_SETBACK_M);
    }
    if (rt.edge.to === ov.nodeId) {
      addApproach(edgeIdx, ov.nodeId, false, control, STOP_SIGN_SETBACK_M);
    }
  }

  for (const list of byEdge) {
    list.sort((a, b) => all[a].sM - all[b].sM);
  }
  return { all, byEdge };
}
