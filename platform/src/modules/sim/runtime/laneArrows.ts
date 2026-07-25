/**
 * sim/runtime — М10 lane-intent arrows as a GRADED world channel (audit M-17).
 *
 * `meta.scenario.laneArrows` has shipped since the SN-04 pack: the painter
 * (world/builders/markings.ts) reads it and lays the „само надясно" /
 * „само направо" / „само наляво" glyphs on the approach. Nothing else did — so
 * the one act the whole lesson exists to teach (turning left out of the
 * straight-only lane) reached the student's debrief as TURN_WITHOUT_INDICATOR:
 * the right severity for the wrong law, which requirement-zero forbids
 * outright ("no bare verdicts, and never the wrong explanation").
 *
 * This module resolves the SAME authored data the painter uses into a per-lane
 * arrow the reducer can grade, off the committed lane fix — edge + arclength +
 * lane id, exactly the way maxspeed and the ban zones resolve. Tolerant by
 * construction, in the zone-data tradition: an unreadable glyph, an unknown
 * edge, a degenerate span or a lane the vehicle is not in all resolve to
 * `undefined`, and `undefined` means "no marking here", which is innocent.
 */

import type { LaneArrow } from "../rules/types";
import type { District } from "./district";
import { LANE_WIDTH_M, type DistrictIndex } from "./spatial";

/** Authored glyph vocabulary → the graded direction set. Anything outside it
 *  (the roundabout „nearExits"/„farExits" labels, any future glyph) is dropped
 *  whole — the rule engine must never guess what a marking means. */
const ARROW_BY_NAME: Record<string, LaneArrow> = {
  left: "left",
  through: "through",
  right: "right",
  leftThrough: "leftThrough",
  throughRight: "throughRight",
};

/** One authored arrow span on one edge, resolved to lane ids. */
export interface LaneArrowSpan {
  /** Bank the arrows govern: +1 = with the edge geometry, -1 = against it. */
  travelDir: 1 | -1;
  fromM: number;
  toM: number;
  /** laneId (0 = curb lane of that bank) → the lane's mandatory glyph. */
  byLane: ReadonlyMap<number, LaneArrow>;
}

/**
 * Lane id for an authored `centerM` — the lateral offset from the centerline
 * the PAINTER uses. It is the locator's lane geometry read backwards:
 *  - two-way bank: |centerM| = (lanesPerDir - 1 - laneId + 0.5) · W
 *  - oneway:       |centerM| measured from the carriageway's own middle,
 *                  centers at lanesPerDir·W/2 - (laneId + 0.5) · W
 * Returns null when the offset does not land inside a marked lane (author
 * slip → the lane is dropped, never guessed onto a neighbour).
 */
function laneIdFromCenterM(centerM: number, lanesPerDir: number, oneway: boolean): number | null {
  const W = LANE_WIDTH_M;
  const d = oneway ? (lanesPerDir * W) / 2 - centerM : Math.abs(centerM);
  const fromCenterline = Math.round(d / W - 0.5);
  const laneId = oneway ? fromCenterline : lanesPerDir - 1 - fromCenterline;
  if (!Number.isFinite(laneId) || laneId < 0 || laneId >= lanesPerDir) return null;
  // Guard the rounding: the offset must actually sit within half a lane of
  // that lane's center, otherwise the author meant something we cannot read.
  const center = oneway
    ? (lanesPerDir * W) / 2 - (laneId + 0.5) * W
    : (lanesPerDir - 1 - laneId + 0.5) * W;
  return Math.abs(d - Math.abs(center)) <= W / 2 ? laneId : null;
}

/**
 * Index `meta.scenario.laneArrows` by edge index. Empty for every district
 * without arrows, in which case the runtime adds nothing to the tick.
 */
export function buildLaneArrowSpans(
  district: District,
  index: DistrictIndex,
): Map<number, LaneArrowSpan[]> {
  const out = new Map<number, LaneArrowSpan[]>();
  const sc = district.meta.scenario as { laneArrows?: Record<string, unknown> } | undefined;
  const la = sc?.laneArrows;
  if (!la || typeof la !== "object") return out;

  const edgeIds = Array.isArray(la.edgeIds)
    ? (la.edgeIds as unknown[]).filter((e): e is string => typeof e === "string")
    : typeof la.edgeId === "string"
      ? [la.edgeId]
      : [];
  const { fromM, toM } = la;
  if (edgeIds.length === 0) return out;
  if (typeof fromM !== "number" || typeof toM !== "number" || !(fromM < toM)) return out;
  if (!Array.isArray(la.lanes)) return out;
  const travelDir: 1 | -1 = la.travelDir === -1 ? -1 : 1;

  for (const edgeId of edgeIds) {
    const host = index.edgeRtById(edgeId);
    if (host === null) continue;
    const byLane = new Map<number, LaneArrow>();
    for (const raw of la.lanes as Array<Record<string, unknown> | null>) {
      const arrow = typeof raw?.arrow === "string" ? ARROW_BY_NAME[raw.arrow] : undefined;
      if (arrow === undefined) continue;
      // An explicit laneId is the author's own word and outranks the geometry;
      // centerM (what the painter consumes) is the fallback.
      const laneId =
        typeof raw?.laneId === "number" && Number.isInteger(raw.laneId)
          ? raw.laneId
          : typeof raw?.centerM === "number" && Number.isFinite(raw.centerM)
            ? laneIdFromCenterM(raw.centerM, host.lanesPerDir, host.edge.oneway)
            : null;
      if (laneId === null || laneId < 0 || laneId >= host.lanesPerDir) continue;
      byLane.set(laneId, arrow);
    }
    if (byLane.size === 0) continue;
    let list = out.get(host.idx);
    if (!list) out.set(host.idx, (list = []));
    list.push({ travelDir, fromM, toM, byLane });
  }
  return out;
}

/**
 * The glyph painted in the vehicle's own lane, or undefined when it is outside
 * every authored span / on the other bank / in an unmarked lane.
 */
export function laneArrowAt(
  spans: readonly LaneArrowSpan[] | undefined,
  sM: number,
  laneId: number,
  travelDir: 1 | -1,
): LaneArrow | undefined {
  if (spans === undefined) return undefined;
  for (const span of spans) {
    if (span.travelDir !== travelDir) continue;
    if (sM < span.fromM || sM > span.toM) continue;
    const arrow = span.byLane.get(laneId);
    if (arrow !== undefined) return arrow;
  }
  return undefined;
}
