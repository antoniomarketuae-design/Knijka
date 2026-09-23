/**
 * THE INTERIOR MIRROR STATION, RE-ANCHORED — the geometry half of the founder
 * ruling of 2026-09-22 «Re-anchor the mirror» (row sc-mw-emergency-lane:
 * 3ffb0692). HOW FAR things move is `cabinLook.cockpitHeaderDropM` /
 * `rearMirrorStationDropM` (pure functions of the canvas aspect, 0 at 16:9);
 * this file is WHAT moves and how, pulled out of `VitokCockpit.tsx` so it is a
 * unit test and not a render.
 *
 * WHAT MOVES, AND WHY EACH PIECE HAS TO:
 *   · the rigged glass quad (MirrorRig) and the housing parented into it;
 *   · the AUTHORED casing — the mirror end of the 168 `interior_shell`
 *     vertices B58's `tools/glb/raise_interior_mirror.mjs` raised. Moving the
 *     glass alone „does nothing: the authored casing then becomes the
 *     occluder" (B58), so the casing comes down with it — at RUNTIME, on a
 *     private copy of the geometry, because the asset is authored for 16:9 and
 *     must stay so;
 *   · the mount (`VitokCockpit` POD) — re-aimed down the new stalk axis;
 *   · the windscreen header pad — lowered by the header drop so the mirror
 *     hangs from a header that is ON the screen.
 *
 * WHAT DOES NOT: the stalk's ROOT ring (12 vertices, chassis z 0.149–0.151)
 * stays where it enters the headliner, so the authored bar tilts rather than
 * detaching from the roof — the same way a real mount pivots at its base. The
 * box below therefore stops at chassis z 0.40, well clear of it.
 */

/** A straight mount axis, chassis-local: where it leaves the roof and where it
 *  meets the mirror body. */
export interface StalkAxis {
  root: { y: number; z: number };
  tip: { y: number; z: number };
}

/** The axis with its mirror end lowered by the station drop; the root stays. */
export function reanchoredStalk(stalk: StalkAxis, tipDropM: number): StalkAxis {
  const drop = Number.isFinite(tipDropM) && tipDropM > 0 ? tipDropM : 0;
  return { root: { ...stalk.root }, tip: { y: stalk.tip.y - drop, z: stalk.tip.z } };
}

/** Axis height at a given z. */
export function stalkAxisY(stalk: StalkAxis, z: number): number {
  const slope = (stalk.root.y - stalk.tip.y) / (stalk.tip.z - stalk.root.z);
  return stalk.root.y - slope * (z - stalk.root.z);
}

/** Length, midpoint and pitch (rotation about X that points a box's local +Z
 *  down the axis) of a box running along the axis between two z. */
export function stalkRun(
  stalk: StalkAxis,
  zBack: number,
  zFront: number,
): { len: number; y: number; z: number; pitch: number } {
  return {
    len: Math.hypot(stalkAxisY(stalk, zFront) - stalkAxisY(stalk, zBack), zFront - zBack),
    y: stalkAxisY(stalk, (zBack + zFront) / 2),
    z: (zBack + zFront) / 2,
    pitch: Math.atan2(stalk.root.y - stalk.tip.y, stalk.tip.z - stalk.root.z),
  };
}

/**
 * The header pad's vertical span once its front edge is lowered by `dropM`:
 * the underside comes down, the top stays, so the pad is one slab from the
 * lowered edge to the headliner's top face and no sky can show between them.
 * At drop 0 it is exactly the slab VitokCockpit always shipped.
 */
export function headerPadSpan(
  roofY: number,
  thicknessM: number,
  dropM: number,
): { yLo: number; yHi: number; height: number; centerY: number } {
  const drop = Number.isFinite(dropM) && dropM > 0 ? dropM : 0;
  const yLo = roofY - drop;
  const yHi = roofY + thicknessM;
  return { yLo, yHi, height: yHi - yLo, centerY: (yLo + yHi) / 2 };
}

/**
 * The MIRROR END of the authored station, chassis-local, AFTER B58's raise.
 * Derived from `raise_interior_mirror.mjs`'s MIRROR_STATION box (authored GLB
 * space, pre-raise) through the raise (+0.105 on GLB y) and the cabin mount
 * (chassis = (−x, y − 0.55, −z)), with the z run cut at 0.40 so the stalk's
 * root ring is excluded.
 *
 * MEASURED against the shipped hero_interior.glb (decoded with the same
 * gltf-transform + draco stack the tool uses): the raised box holds 168
 * `interior_shell` vertices — 156 at the mirror end (GLB y 1.414…1.505) and the
 * 12 root-ring vertices this box leaves out — and a box half as wide again and
 * 0.6 m tall around it holds the SAME 156, so nothing else in the cabin can be
 * caught by it. The glass quad (`hotspot_mirror_rear`) also lies inside this
 * box in space; it is NOT interior_shell and the caller must not pass it (it
 * is moved by MirrorRig, which owns its transform).
 */
export const REAR_MIRROR_CASING_BOX = {
  x: [-0.2, 0.2],
  y: [0.795, 1.015],
  z: [0.4, 0.68],
} as const;

/** Is this chassis-local point part of the mirror end of the station? */
export function inRearMirrorCasing(x: number, y: number, z: number): boolean {
  const b = REAR_MIRROR_CASING_BOX;
  return x > b.x[0] && x < b.x[1] && y > b.y[0] && y < b.y[1] && z > b.z[0] && z < b.z[1];
}
