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
import { ROAD_Y, SCENARIO_SIGN_SCALE } from "./constants";
import { add, mul, perpRight, pointAlong, polylineLength, type Vec2 } from "./math2d";
import { toWorld, yawFromFacing } from "./mesh";
import type { RoadNetwork } from "./network";

/**
 * Lesson-critical sign scale of a district (founder R3 doc 62 #6): scenario
 * micro-maps (meta.mapKind "scenario-*") get SCENARIO_SIGN_SCALE, everything
 * else (city / exam / полигон / mapKind-less) gets undefined so their
 * placements stay byte-identical (no `scale` key at all).
 */
export function scenarioSignScale(district: District): number | undefined {
  const mapKind = district.meta.mapKind;
  return typeof mapKind === "string" && mapKind.startsWith("scenario")
    ? SCENARIO_SIGN_SCALE
    : undefined;
}

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
/** The В26-50 advisory plate stands this far before its А1 curve warning. */
const CURVE_ADVISORY_PLATE_AHEAD_M = 2;
/** …and this much further off the curb, so neither post occludes the other
 *  on the dead-straight approach. */
const CURVE_ADVISORY_PLATE_OUT_M = 1.4;
/**
 * В24 repeat cadence inside a noOvertaking span (doc 66 R2 — the governing
 * control must be IN FRAME at the fault, not only at the kerb entry). A single
 * post at the span START leaves the ban unsigned deep in the zone — exactly
 * where a slow-lead overtake is attempted and where the pilot mistake clip
 * frames the violation (~70 m past the entry on ov-ban-v1). Bulgarian practice
 * repeats В24 through a long ban stretch; one reminder post this far past the
 * start restates the ban where it is broken. Render-only, like every post here.
 */
const ZONE_SIGN_REPEAT_M = 80;
/** …but never within this of the span end, so the repeat never reads as the
 *  ban lifting right where it is being restated. */
const ZONE_SIGN_REPEAT_END_CLEAR_M = 30;

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
  const scale = scenarioSignScale(district);

  for (const zone of zones) {
    const eb = network.edgeById.get(zone.edgeId);
    if (!eb) continue; // unknown edge — ignore (forward compat contract)
    const g = eb.edge.geometry as Vec2[];
    const total = polylineLength(g);
    if (total <= 2) continue;

    const placeAt = (s: number, kind: SignKind, lateralExtraM = 0) => {
      const clamped = Math.min(Math.max(s, 1), total - 1);
      const { point, tangent } = pointAlong(g, clamped);
      const r = perpRight(tangent); // right of geometry-forward travel
      const p = add(point, mul(r, eb.halfWidth + ZONE_SIGN_LATERAL_M + lateralExtraM));
      out.push({
        kind,
        position: toWorld(p[0], p[1], ROAD_Y),
        yaw: yawFromFacing(mul(tangent, -1)), // face the approaching driver
        // Lesson-critical prominence on scenario maps — never on the barrier
        // arm (RailBarriers builds its own rig; the arm must stay real-size
        // so it spans exactly the incoming lane it is authored across).
        ...(scale !== undefined && kind !== "barrier" ? { scale } : {}),
      });
    };

    if (zone.kind === "railCrossing") {
      placeAt(zone.fromM - RAIL_WARNING_AHEAD_M, zone.guarded ? "railGuarded" : "railUnguarded");
      placeAt(zone.fromM - RAIL_CROSS_AHEAD_M, "railCross");
      if (zone.guarded) placeAt(zone.fromM - RAIL_BARRIER_AHEAD_M, "barrier");
      continue;
    }

    const kind = ZONE_SIGN_KIND[zone.kind];
    if (kind) {
      placeAt(zone.fromM, kind); // the entry post (span start, right kerb)
      // В24: restate the ban deep in the span so it stays in the fault
      // sightline (doc 66 R2). One repeat, kept clear of the span end.
      if (zone.kind === "noOvertaking") {
        const repeatAt = zone.fromM + ZONE_SIGN_REPEAT_M;
        if (repeatAt < zone.toM - ZONE_SIGN_REPEAT_END_CLEAR_M) placeAt(repeatAt, kind);
      }
    }

    // Founder R3 #36 („Скорост в завой"): the copy promises „знак А1 с табела
    // „50"" — pair the curve warning with the В26-50 plate the sign kit DOES
    // ship, 2 m before the А1 and staggered 1.4 m further off the curb so the
    // pair reads as one signed station without the near post occluding the
    // far one on the straight approach. Honest by construction: only an
    // advisory the shipped face can state (50) places the plate; other
    // advisories (40/60/90…) stay А1-only until the В26 face set grows
    // (reported asset need — never post a face that lies).
    if (zone.kind === "curveAdvisory" && zone.advisoryKmh === 50) {
      placeAt(zone.fromM - CURVE_ADVISORY_PLATE_AHEAD_M, "limit50", CURVE_ADVISORY_PLATE_OUT_M);
    }
  }

  return out;
}
