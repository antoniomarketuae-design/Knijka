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

import { speedLimitSignKind } from "../types";
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
/**
 * А15 „Хлъзгав път" and А1 „Опасен завой" stand THIS far before the hazard —
 * not at its first metre (doc 86 T14). A warning sign whose whole job is
 * „намали ПРЕДИ" is worthless at the corner: the founder scanned the approach
 * on items 33/36 and reported „no signs on the map at all" while the А1 was
 * built and standing at the apex. railCrossing already had this discipline
 * (RAIL_WARNING_AHEAD_M); water, ice and curve did not.
 *
 * 60 m clears every graded „slow down before" gate in the tree by a margin:
 * ac-aqua zone 240 / gate 225 -> post 180; ac-ice 210 / 190 -> 150;
 * ac-bridge 250 / 235 -> 190; sp-curve 220 -> 160 (the world-referent gate
 * asks for >= 40 m). placeAt clamps, so a zone that starts inside 60 m of the
 * edge simply gets its post at the edge's head.
 */
const HAZARD_WARNING_AHEAD_M = 60;
/** The В26 advisory plate stands this far before its А1 curve warning. */
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
/** Two zone posts must stand at least this far apart on the ground; matches
 *  sign-post-distinct.test.ts's MIN_POST_SEPARATION_M with a little headroom. */
const ZONE_POST_MIN_APART_M = 1.2;
/** How far a colliding free post steps back along the road each try. */
const ZONE_POST_NUDGE_STEP_M = 3;
/** Rail furniture whose station is load-bearing and must never be nudged. */
const RAIL_FURNITURE: ReadonlySet<SignKind> = new Set<SignKind>([
  "railGuarded",
  "railUnguarded",
  "railCross",
  "barrier",
]);
/**
 * The В26 advisory plate under an А1 needs enough road BEFORE the curve to
 * stand on. A curve whose span starts at metre 0–16 of its own edge (three in
 * the corpus: district-v1 ×2, d2-v1, mw-exit-v1's ramp) has none: the plate
 * clamps to metre 1, which is inside the junction mouth beside a DIFFERENT
 * road with a different limit — the exact T4 failure mode, re-created by a
 * warning sign. Those curves stay А1-only until a cross-edge warning pass
 * exists (the А1 itself clamps, which is weak but never states a wrong number).
 */
const CURVE_PLATE_MIN_ROOM_M = HAZARD_WARNING_AHEAD_M + 3;

/** Marking-only / physics-only kinds place no post. */
const ZONE_SIGN_KIND: Partial<Record<DistrictZoneKind, SignKind>> = {
  noOvertaking: "noOvertaking",
  noStopping: "noStopping",
  // В28 „Забранено е паркирането". This row was MISSING, not marking-only: the
  // zone kind has existed since the ban slice („В24/В27/В28 bans" in its own
  // docstring) and pk-ban2-v1 authors one, so the map had a graded parking ban
  // whose sign was never posted — while the parking lessons name В28 34 times.
  noParking: "noParking",
  waterPatch: "slippery",
  icePatch: "slippery",
  curveAdvisory: "curve",
};

/** Which of those are WARNINGS (posted in advance) rather than prohibitions
 *  (posted at the first metre they govern). Doc 86 T14. */
const HAZARD_WARNING_AHEAD_OF: Partial<Record<DistrictZoneKind, number>> = {
  waterPatch: HAZARD_WARNING_AHEAD_M,
  icePatch: HAZARD_WARNING_AHEAD_M,
  curveAdvisory: HAZARD_WARNING_AHEAD_M,
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
  /**
   * Ground points already occupied by a post, so two zones whose furniture
   * lands on the same spot become two posts instead of one silhouette (the
   * Г12-on-the-Б1 failure, pinned by sign-post-distinct.test.ts). pk-rail-v1
   * authors a noStopping ban starting at 150 m and a railCrossing at 200 m
   * whose warning triangle goes 50 m ahead — dead on top of the В27, 0.00 m
   * apart.
   *
   * The test is the REAL invariant (a distance between two models), not a gap
   * in arclength: the curve station deliberately puts its В26 2 m before the А1
   * and 1.4 m further out, which is 2.44 m apart and reads as two signs.
   *
   * The RAIL furniture claims its ground first and never moves: the crossbuck
   * marks the graded stop line and the arm spans the incoming lane, so their
   * positions are load-bearing, not decorative. Only free posts step aside.
   */
  const occupied: Vec2[] = [];
  const groundPoint = (edgeId: string, s: number, lateralExtraM = 0): Vec2 | null => {
    const eb = network.edgeById.get(edgeId);
    if (!eb) return null;
    const g = eb.edge.geometry as Vec2[];
    const total = polylineLength(g);
    if (total <= 2) return null;
    const { point, tangent } = pointAlong(g, Math.min(Math.max(s, 1), total - 1));
    return add(point, mul(perpRight(tangent), eb.halfWidth + ZONE_SIGN_LATERAL_M + lateralExtraM));
  };
  for (const zone of zones) {
    if (zone.kind !== "railCrossing") continue;
    for (const s of [
      zone.fromM - RAIL_WARNING_AHEAD_M,
      zone.fromM - RAIL_CROSS_AHEAD_M,
      ...(zone.guarded ? [zone.fromM - RAIL_BARRIER_AHEAD_M] : []),
    ]) {
      const p = groundPoint(zone.edgeId, s);
      if (p) occupied.push(p);
    }
  }

  for (const zone of zones) {
    const eb = network.edgeById.get(zone.edgeId);
    if (!eb) continue; // unknown edge — ignore (forward compat contract)
    const g = eb.edge.geometry as Vec2[];
    const total = polylineLength(g);
    if (total <= 2) continue;

    const placeAt = (
      s: number,
      kind: SignKind,
      lateralExtraM = 0,
      extra: { speedKmh?: number } = {},
    ) => {
      let clamped = Math.min(Math.max(s, 1), total - 1);
      let p = groundPoint(zone.edgeId, clamped, lateralExtraM)!;
      if (!RAIL_FURNITURE.has(kind)) {
        // Step a free post back along the road until it is its own object.
        let guard = 0;
        while (
          occupied.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < ZONE_POST_MIN_APART_M) &&
          guard < 8
        ) {
          clamped = Math.max(1, clamped - ZONE_POST_NUDGE_STEP_M);
          p = groundPoint(zone.edgeId, clamped, lateralExtraM)!;
          guard++;
        }
        occupied.push(p);
      }
      const { tangent } = pointAlong(g, clamped);
      out.push({
        kind,
        position: toWorld(p[0], p[1], ROAD_Y),
        yaw: yawFromFacing(mul(tangent, -1)), // face the approaching driver
        ...extra,
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
      // A PROHIBITION starts where it starts (В24/В27 mark the first metre of
      // the ban); a WARNING has to arrive in advance of the hazard or it
      // teaches nothing (doc 86 T14).
      const ahead = HAZARD_WARNING_AHEAD_OF[zone.kind] ?? 0;
      placeAt(zone.fromM - ahead, kind);
      // В24: restate the ban deep in the span so it stays in the fault
      // sightline (doc 66 R2). One repeat, kept clear of the span end.
      if (zone.kind === "noOvertaking") {
        const repeatAt = zone.fromM + ZONE_SIGN_REPEAT_M;
        if (repeatAt < zone.toM - ZONE_SIGN_REPEAT_END_CLEAR_M) placeAt(repeatAt, kind);
      }
    }

    // Founder R3 #36 („Скорост в завой"): the copy promises „знак А1 с табела
    // „50"" — pair the curve warning with its В26 plate, 2 m before the А1 and
    // staggered 1.4 m further off the curb so the pair reads as one signed
    // station without the near post occluding the far one on the straight
    // approach. The plate states `advisoryKmh`, which is EXACTLY the number
    // rules/engine.ts:997 grades SPEED_TOO_FAST_FOR_CURVE against inside this
    // span (tick.curveAdvisoryKmh) — so it is a referent, not a second limit.
    // Until doc 86 T4 there was one face in the kit and the plate could only
    // be posted on a 50-advisory curve; every numeral now has a face, so 30 /
    // 40 / 60 advisories are signed too, and an advisory the face set cannot
    // state still places nothing.
    if (zone.kind === "curveAdvisory" && zone.fromM >= CURVE_PLATE_MIN_ROOM_M) {
      const plateKind = speedLimitSignKind(zone.advisoryKmh);
      if (plateKind !== null) {
        placeAt(
          zone.fromM - HAZARD_WARNING_AHEAD_OF.curveAdvisory! - CURVE_ADVISORY_PLATE_AHEAD_M,
          plateKind,
          CURVE_ADVISORY_PLATE_OUT_M,
          { speedKmh: zone.advisoryKmh },
        );
      }
    }
  }

  return out;
}
