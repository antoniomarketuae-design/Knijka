/**
 * Zone-driven sign posts (SIGN-ASSET drop) — the world finally SHOWS the
 * signs the law implies for the authored District.zones spans that until now
 * only GRADED (ADR-006 stages 2a/2b/3a + curve-envelope + surface-patch).
 *
 * Pure data pass, additive by construction: a district without zones yields
 * ZERO placements, so every shipped zones-less map builds byte-identical
 * geometry. Render-only — grading reads the spans (runtime/district.ts),
 * never these posts.
 *
 * Placement convention (mirrors the В26 district-entry pass in props.ts):
 * the post stands at the span START, on the RIGHT-hand side of the travel
 * direction (geometry-forward — the zone maps are authored driving from -> to),
 * at the existing curb offset (halfWidth + 0.8), facing the approaching
 * driver.
 *
 * Kinds:
 *  - noOvertaking -> "noOvertaking" (В24), noStopping -> "noStopping" (В27)
 *  - waterPatch/icePatch -> "slippery" (А15)
 *  - curveAdvisory -> "curve" (А1 — the shipped sign_warning_bend face)
 *  - railCrossing -> the full crossing furniture: the guarded/unguarded
 *    warning triangle ~50 m ahead of the band, the Андреевски кръст crossbuck
 *    at the line (5 m before the band — where the runtime grades the stop),
 *    and on guarded maps the striped barrier arm (STATIC DOWN pose; the
 *    timetable animates grading-side only).
 *  - marking-only kinds (solidCenterLine М1, busLane, emergencyLane М2,
 *    noParking) and unknown future kinds place nothing (forward compat).
 */

import type { District, DistrictZoneKind, SignKind, SignPlacement } from "../types";
import { ROAD_Y } from "./constants";
import { add, mul, perpRight, pointAlong, polylineLength, type Vec2 } from "./math2d";
import { toWorld, yawFromFacing } from "./mesh";
import type { RoadNetwork } from "./network";

/** Curb offset used by the existing sign passes (props.ts): just past the
 *  carriageway edge. */
const ZONE_SIGN_LATERAL_M = 0.8;
/** Rail warning triangle (А32/А33-style) stands this far before the band. */
const RAIL_WARNING_AHEAD_M = 50;
/** The crossbuck stands at the line — 5 m before the band, matching the
 *  graded stop line (runtime rail phase; rail-districts battery). */
const RAIL_CROSS_AHEAD_M = 5;
/** Guarded maps: the barrier arm pivots between the line and the band. */
const RAIL_BARRIER_AHEAD_M = 3;

/** Marking-only / physics-only kinds place no post. */
const ZONE_SIGN_KIND: Partial<Record<DistrictZoneKind, SignKind>> = {
  noOvertaking: "noOvertaking",
  noStopping: "noStopping",
  waterPatch: "slippery",
  icePatch: "slippery",
  curveAdvisory: "curve",
};

/**
 * One post per matching zone span (rail spans place two or three). Output
 * order follows the authored zones order — deterministic, data-driven.
 */
export function buildZoneSigns(district: District, network: RoadNetwork): SignPlacement[] {
  const out: SignPlacement[] = [];
  const zones = district.zones;
  if (!zones || zones.length === 0) return out;

  for (const zone of zones) {
    const eb = network.edgeById.get(zone.edgeId);
    if (!eb) continue; // unknown edge — ignore (forward compat contract)
    const g = eb.edge.geometry as Vec2[];
    const total = polylineLength(g);
    if (total <= 2) continue;

    const placeAt = (s: number, kind: SignKind) => {
      const clamped = Math.min(Math.max(s, 1), total - 1);
      const { point, tangent } = pointAlong(g, clamped);
      const r = perpRight(tangent); // right of geometry-forward travel
      const p = add(point, mul(r, eb.halfWidth + ZONE_SIGN_LATERAL_M));
      out.push({
        kind,
        position: toWorld(p[0], p[1], ROAD_Y),
        yaw: yawFromFacing(mul(tangent, -1)), // face the approaching driver
      });
    };

    if (zone.kind === "railCrossing") {
      placeAt(zone.fromM - RAIL_WARNING_AHEAD_M, zone.guarded ? "railGuarded" : "railUnguarded");
      placeAt(zone.fromM - RAIL_CROSS_AHEAD_M, "railCross");
      if (zone.guarded) placeAt(zone.fromM - RAIL_BARRIER_AHEAD_M, "barrier");
      continue;
    }

    const kind = ZONE_SIGN_KIND[zone.kind];
    if (kind) placeAt(zone.fromM, kind);
  }

  return out;
}
