/**
 * Schools — the building kind a school-zone lesson's copy has always promised
 * and the world never contained.
 *
 * THE DEFECT (founder register item 61, doc 87 B61). He drove „Зона 30 —
 * училище и жилищен квартал" and wrote: *„I see only Normal Buildings
 * living/office building no actual school when the question states there
 * should be School, weak map engineering which must be fixed, either build
 * schools and put and name them school, or find some solutions."* He also
 * named the second half himself (item 60): *„no kids are playing on the
 * sidewalks and we should do that it will attract the user to watch closely."*
 *
 * So the lesson asked a 17-year-old to slow to 30 „защото има деца" while the
 * street showed him a row of identical residential prisms and nobody on the
 * pavement. The sign was true, the number was true, and the REASON — the only
 * part a driver actually obeys at eye level — was missing.
 *
 * WHAT THIS PASS BUILDS, and what it deliberately does not:
 *  - NOT the body. A `kind: "school"` footprint is extruded by the ordinary
 *    facade-prism pass (builders/buildings.ts), which only changes its palette.
 *    That keeps this pass additive: a district with no school gets an empty
 *    array and byte-identical geometry everywhere else.
 *  - the NAME BOARD over the street frontage, carrying real Bulgarian text.
 *    „Put and name them school" is not a metaphor: an unnamed block is what he
 *    already had.
 *  - the YARD RAILING along the frontage with a GATE gap at its centre. Every
 *    Bulgarian училище is fenced, and the fence is also the thing that tells a
 *    driver whether the children he can see are behind a barrier or one step
 *    from his lane. The gate is where they come out, so it is published: the
 *    scenario stages its children on it.
 *
 * The А19 „Деца" warning triangle that belongs on the approach is NOT here —
 * it is a SIGN, and signs are placed by builders/props.ts through the one sign
 * pipeline, so a school's warning post is instanced, scaled and counted like
 * every other post rather than being a special case.
 *
 * PURE: no three.js, no DOM. Deterministic — pure geometry off the footprint
 * and the nearest carriageway, no RNG at all.
 */

import type { DistrictBuilding, SchoolPlacement, Vec3Tuple } from "../types";
import { SIDEWALK_TOP_Y } from "./constants";
import { orientedBox } from "./cityBuildings";
import { dist, norm, sub, toCCW, type Vec2 } from "./math2d";
import { toWorld, yawFromFacing } from "./mesh";
import type { RoadNetwork } from "./network";

/** Default board label. Bulgarian, and the word the question itself uses. */
export const SCHOOL_LABEL_BG = "УЧИЛИЩЕ";

/** Board panel size (m). Sized to be readable from ~120 m, the distance a
 *  driver needs to have already lifted off in a зона 30. */
export const SCHOOL_BOARD_W_M = 9.0;
export const SCHOOL_BOARD_H_M = 1.5;
/** Board centre height above the pavement (m) — over a ground-floor entrance. */
export const SCHOOL_BOARD_Y_M = 5.4;
/** How far the board stands OFF the facade, so it never z-fights the wall. */
const BOARD_STANDOFF_M = 0.35;

/** Yard railing height (m) and the half-width of the gate gap in it. */
export const SCHOOL_RAILING_H_M = 1.35;
export const SCHOOL_GATE_HALF_M = 2.4;
/** How far the railing sits IN FRONT of the facade, toward the street (m). */
const RAILING_OFFSET_M = 5.5;

/** Closest point on the road network to `p`, or null on a district with no
 *  drivable line at all (never true in practice — guarded, not assumed). */
function nearestRoadPoint(network: RoadNetwork, p: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const eb of network.edges) {
    const line = eb.line ?? (eb.edge.geometry as Vec2[]);
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i] as Vec2;
      const b = line[i + 1] as Vec2;
      const ab = sub(b, a);
      const l2 = ab[0] * ab[0] + ab[1] * ab[1];
      const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2));
      const q: Vec2 = [a[0] + ab[0] * t, a[1] + ab[1] * t];
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}

/**
 * One dressing set per `kind: "school"` building. Empty (and allocation-free)
 * on every district that authors none.
 */
export function buildSchools(
  buildings: readonly DistrictBuilding[],
  network: RoadNetwork,
): SchoolPlacement[] {
  const out: SchoolPlacement[] = [];
  for (const b of buildings) {
    if (b.kind !== "school") continue;
    if (!b.footprint || b.footprint.length < 3) continue;
    const ring = toCCW(b.footprint as Vec2[]);
    const box = orientedBox(ring);
    const centre: Vec2 = [box.cx, box.cy];
    const road = nearestRoadPoint(network, centre);
    if (!road) continue;

    // The frontage normal: from the building centre TOWARD the carriageway,
    // snapped to whichever OBB axis it agrees with more. A school's name board
    // hangs square on a wall, never at 23° across a corner.
    const toRoad = norm(sub(road, centre));
    const along: Vec2 = [Math.cos(box.angle), Math.sin(box.angle)];
    const across: Vec2 = [-along[1], along[0]];
    const dAlong = toRoad[0] * along[0] + toRoad[1] * along[1];
    const dAcross = toRoad[0] * across[0] + toRoad[1] * across[1];
    const useAcross = Math.abs(dAcross) >= Math.abs(dAlong);
    const axis = useAcross ? across : along;
    const sign = (useAcross ? dAcross : dAlong) >= 0 ? 1 : -1;
    /** Unit normal of the frontage wall, pointing at the street. */
    const nrm: Vec2 = [axis[0] * sign, axis[1] * sign];
    /** Unit vector ALONG the frontage wall. */
    const tan: Vec2 = [-nrm[1], nrm[0]];
    /** Half-extent of the building from its centre to the frontage wall. */
    const halfToFront = (useAcross ? box.d : box.w) / 2;
    /** Half-extent of the frontage wall itself. */
    const halfFrontage = (useAcross ? box.w : box.d) / 2;

    const boardCentre: Vec2 = [
      centre[0] + nrm[0] * (halfToFront + BOARD_STANDOFF_M),
      centre[1] + nrm[1] * (halfToFront + BOARD_STANDOFF_M),
    ];
    // The railing runs the frontage, clamped so it never outruns the wall it
    // fences, and offset toward the street. It stays well inside the pavement:
    // gen_streetwall's frontage clearance is >= 8 m on every populated map.
    const railHalf = Math.max(halfFrontage - 1, 3);
    const railCentre: Vec2 = [
      centre[0] + nrm[0] * (halfToFront + RAILING_OFFSET_M),
      centre[1] + nrm[1] * (halfToFront + RAILING_OFFSET_M),
    ];
    const from: Vec2 = [railCentre[0] - tan[0] * railHalf, railCentre[1] - tan[1] * railHalf];
    const to: Vec2 = [railCentre[0] + tan[0] * railHalf, railCentre[1] + tan[1] * railHalf];

    const boardW = Math.min(SCHOOL_BOARD_W_M, Math.max(4, halfFrontage * 1.6));
    const gate: Vec3Tuple = toWorld(railCentre[0], railCentre[1], SIDEWALK_TOP_Y);

    out.push({
      buildingId: b.id,
      labelBg: SCHOOL_LABEL_BG,
      board: {
        position: toWorld(boardCentre[0], boardCentre[1], SCHOOL_BOARD_Y_M),
        // Object convention: +Z is the facing side (StaticTransform), and the
        // board must face the street, i.e. along `nrm`.
        yaw: yawFromFacing(nrm),
        widthM: boardW,
        heightM: SCHOOL_BOARD_H_M,
      },
      railing: {
        from: toWorld(from[0], from[1], SIDEWALK_TOP_Y),
        to: toWorld(to[0], to[1], SIDEWALK_TOP_Y),
        heightM: SCHOOL_RAILING_H_M,
        gateHalfM: SCHOOL_GATE_HALF_M,
      },
      gate,
    });
  }
  return out;
}
