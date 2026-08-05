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
 * 2. PRIORITY-SIGN HEURISTIC (honest documentation, per doc 17 §6/§8 the real
 *    signs arrive with the hand-polish overlay): at every UNSIGNALIZED
 *    intersection where a minor road (service / residential / unclassified,
 *    class rank ≤ 2) meets an arterial (primary / secondary / secondary_link,
 *    rank ≥ 4), each MINOR approach gets a priority line at the junction
 *    mouth (same derivation as source 1, floor STOP_SIGN_SETBACK_M).
 *    - Tertiary meetings are excluded — those are typically yield (Б1), and
 *      modeling yield as stop would grade students unfairly.
 *    - Roundabout nodes are excluded (priority-inside, yield on entry).
 *    - WHICH sign the line carries is NOT decided here: it comes from
 *      world/builders/network.junctionPriorityControls — the same call that
 *      paints the sign the student sees (Б2 only against a primary, Б1
 *      otherwise). Audit C-4: this used to be hardcoded "stopSign", so four
 *      approaches on the shipped district — one of them crossed twice per lap
 *      by the practical-exam route — instant-failed a legal rolling entry
 *      under a visible „Пропусни движението" triangle. An approach the
 *      painter posts NO sign on is now never graded either.
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
  GIVE_WAY_TRIANGLE_LENGTH_M,
  GIVE_WAY_TRIANGLE_SETBACK_M,
} from "../world/builders/constants";
import {
  JUNCTION_TRIM_MAX_FRACTION,
  junctionPriorityControls,
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
 * "giveWay" = Б1 „Пропусни движението" (yield only). It must match what the
 * world builder paints at that approach, exactly as the derived lines above do
 * — an override is a HAND-authored junction, so the author owns both halves.
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

  // sc-jx-giveway-b1 („Б1 не значи спри винаги") — the give-way CAPABILITY's
  // first shipped author-hook (tools/maps/gen_jx_giveway.mjs → jxg-giveway-v1).
  // The map is a TERTIARY north-south street crossing TWO SECONDARY boulevards,
  // so the stop-sign heuristic derives NOTHING at either mouth (a tertiary
  // minor is rank 3 > MINOR_MAX_RANK 2 — skipped) and these giveWay entries are
  // the SOLE grading lines. control "giveWay" = Б1: rolling through a clear
  // mouth is zero violations, an unyielded conflict is FAILED_TO_YIELD (ЗДвП
  // чл. 50; engine.ts give-way branch) — and each line makes its node GUARDED,
  // so the right-hand-rule tracker never double-grades. The world builder
  // paints the matching VISIBLE Б1 on the same minor approach (props.ts:
  // maxRank 4 < 5 → "giveWay"). jxg-* ids keep both entries skip-safe on every
  // foreign shipped map (the idempotent-override law, doc 74 §5.6).
  { nodeId: "jxg-n-j1", edgeId: "jxg-e-s", control: "giveWay" }, // mouth 1 (clear — the rolling-pass crux)
  { nodeId: "jxg-n-j2", edgeId: "jxg-e-m", control: "giveWay" }, // mouth 2 (conflicted — the yield)

  // sc-ed-d2-priority-run („Изпитен сегмент „Лозенец" — предимства") hangs its
  // whole first beat on „n2945503673 — Б2 + stop line (the ONLY stop sign on
  // the route)" (templates-exam.ts). The heuristic used to hand it that line by
  // accident: the runtime's rank table was missing `primary_link`, so the 1-lane
  // slip road e171919146.0 read as a MINOR approach. The world builder ranks it
  // 5 — equal to the бул. „Пейо К. Яворов" it joins — and therefore painted no
  // sign at all, so the scenario graded a full stop under bare sky (audit C-4's
  // sibling: invisible control). With the tables reconciled the accident is
  // gone, so the Б2 the curriculum needs is AUTHORED here instead, and props.ts
  // now posts the octagon the drill has always assumed. A slip road entering a
  // 70 km/h boulevard is a Б2 in Sofia, so the lesson is unchanged — only the
  // sign is now real.
  { nodeId: "n2945503673", edgeId: "e171919146.0" },
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
   * когато иначе би ги засякъл", content bank q-krastovishta-006). ALWAYS the
   * kind of sign the world builder posts on this approach — audit C-4 made
   * that an invariant instead of a coincidence.
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

/**
 * Junction-mouth setback for an approach: the world builder's open-radius cut
 * on this edge (identical math incl. the per-edge trim clamp) plus the paint
 * inset. Guarantees the graded line sits ON the painted line, just outside the
 * junction patch. The scaled textbook setback is only a fallback for nodes
 * with no computable radius.
 *
 * Module-level because a roundabout MOUTH needs the same number without owning
 * a StopLine — see `roundaboutGiveWayReachM`.
 */
function mouthSetbackM(
  index: DistrictIndex,
  edgeIdx: number,
  junctionNodeId: string,
  fallbackM: number,
): number {
  const incident = index.edgesAtNode.get(junctionNodeId) ?? [];
  const touched = incident.map((i) => index.edgeRt(i).edge);
  const radius = nodeOpenRadiusM(touched, touched.length);
  if (radius <= 0) return fallbackM;
  const rt = index.edgeRt(edgeIdx);
  return Math.min(radius, rt.totalLen * JUNCTION_TRIM_MAX_FRACTION) + STOP_LINE_BEYOND_CUT_M;
}

/**
 * HOW FAR FROM A RING'S CENTRE THE ROAD ITSELF SAYS „GIVE WAY" — the distance
 * the roundabout entry-yield tracker must be able to see (worldRuntime §4c).
 *
 * B15, THE HALF THAT WAS NEVER MEASURED. The tracker armed at
 * `radius + ROUNDABOUT_ENTRY_MARGIN_M` — a constant bolted to the RING. The
 * give-way paint is bolted to the JUNCTION MOUTH, which is a different number
 * on every map, and on five of the six shipped roundabouts it is the larger
 * one. Measured 2026-08-05, distance from ring centre to the М7 линия за
 * изчакване at each mouth against the armed reach it had:
 *
 *     rb-mini-v1     paint 35.73   armed 30.00   → 4 of 4 mouths OUTSIDE
 *     rb-ped-v1      paint 35.73   armed 30.00   → 4 of 4 OUTSIDE
 *     rb-2lane-v1    paint 51.85   armed 38.00   → 4 of 4 OUTSIDE
 *     rb-single-v1   paint 55.73   armed 50.00   → 4 of 4 OUTSIDE
 *     d2-v1          paint 37.85…47.36  armed 40.00 → 3 of 4 OUTSIDE
 *     district-v1    paint 26.54…29.90  armed 31.83 → both inside
 *
 * So a student who stops exactly where the road tells him to stop stands in a
 * place the roundabout instrument cannot see. Everything it exists to notice —
 * that a car was circulating, that he SLOWED for it, that he stood still and
 * did not barge — happens outside its field of view, and the visit it finally
 * opens 6 m later is the visit of a driver already rolling into the mouth. The
 * commendation (`YIELDED_TO_PRIORITY`) is therefore unreachable on every one of
 * those maps by construction: it needs `rbSlowed`, and nobody who drives
 * correctly is below the yield speed that late.
 *
 * The row was closed with a rig that stood at `radius + 4` — INSIDE the old
 * reach. The mechanism it photographed was real; the place it photographed it
 * from was not the place the paint is.
 *
 * The reach returned here is the whole painted give-way announcement, not just
 * its last line: the М18 „триъгълник" (Наредба № 2/2001 чл. 23, ал. 3) is
 * painted `GIVE_WAY_TRIANGLE_SETBACK_M` before the М7 line with its apex a
 * further `GIVE_WAY_TRIANGLE_LENGTH_M` back, pointed at the driver who must
 * give way. Its apex is the first word of the instruction; a grader that arms
 * after the last one is reading the sentence from the full stop. That run also
 * covers the car BODY — the runtime samples the vehicle origin, so a driver
 * whose bumper is at the line has his sample point a metre or two behind it.
 *
 * Returns 0 when the ring has no derivable mouth (degenerate data) — the caller
 * floors the result against the legacy ring-relative reach, so nothing shrinks.
 */
export function roundaboutGiveWayReachM(
  district: District,
  index: DistrictIndex,
  // `edgeIds` is REQUIRED on purpose: made optional, a caller that forgot it
  // would silently get 0, the caller would silently floor back to the legacy
  // ring-relative reach, and this whole fix would silently not exist.
  ring: { x: number; y: number; edgeIds: readonly string[] },
): number {
  // Ring edges of THIS roundabout, and the nodes they touch = its mouths.
  const ringEdgeIds = new Set(ring.edgeIds);
  const mouthNodeIds = new Set<string>();
  for (const e of district.roads.edges) {
    if (!ringEdgeIds.has(e.id)) continue;
    mouthNodeIds.add(e.from);
    mouthNodeIds.add(e.to);
  }

  let farthest = 0;
  for (const nodeId of mouthNodeIds) {
    for (const edgeIdx of index.edgesAtNode.get(nodeId) ?? []) {
      const rt = index.edgeRt(edgeIdx);
      if (ringEdgeIds.has(rt.edge.id) || rt.edge.roundabout) continue; // the ring itself
      const atFromEnd = rt.edge.from === nodeId;
      if (atFromEnd && rt.edge.oneway) continue; // flow leaves here — no approach
      if (!atFromEnd && rt.edge.to !== nodeId) continue;
      const sb = Math.min(
        mouthSetbackM(index, edgeIdx, nodeId, STOP_SIGN_SETBACK_M),
        rt.totalLen / 2,
      );
      const sM = atFromEnd ? sb : rt.totalLen - sb;
      const [px, py] = index.pointAt(edgeIdx, sM);
      farthest = Math.max(farthest, Math.hypot(px - ring.x, py - ring.y));
    }
  }
  if (farthest <= 0) return 0;
  return farthest + GIVE_WAY_TRIANGLE_SETBACK_M + GIVE_WAY_TRIANGLE_LENGTH_M;
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
    const sb = Math.min(mouthSetbackM(index, edgeIdx, junctionNodeId, fallbackM), rt.totalLen / 2);
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

    // Priority-sign heuristic.
    if (incident.some((i) => index.edgeRt(i).edge.roundabout)) continue;
    // Whose obligation, and WHICH one, is the world builder's own rule — the
    // one that paints the sign the student actually sees (audit C-4). The
    // gate below then keeps the GRADED subset conservative (minor meets
    // arterial only); an approach the painter posts nothing on is never
    // graded, so a line can no longer exist without a sign above it.
    const controls = junctionPriorityControls(
      incident.map((i) => {
        const { edge } = index.edgeRt(i);
        return {
          edgeId: edge.id,
          class: edge.class,
          incoming: !edge.oneway || edge.to === it.id,
          roundabout: edge.roundabout,
        };
      }),
    );
    const ranks = incident.map((i) => index.edgeRt(i).classRank);
    if (!ranks.some((r) => r >= ARTERIAL_MIN_RANK)) continue;
    for (const edgeIdx of incident) {
      const rt = index.edgeRt(edgeIdx);
      if (rt.classRank > MINOR_MAX_RANK) continue;
      const control = controls.get(rt.edge.id);
      if (control === undefined) continue;
      if (rt.edge.from === it.id) addApproach(edgeIdx, it.id, true, control, STOP_SIGN_SETBACK_M);
      if (rt.edge.to === it.id) addApproach(edgeIdx, it.id, false, control, STOP_SIGN_SETBACK_M);
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
