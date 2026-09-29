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

import { BufferAttribute, Matrix3, Vector3, type Mesh, type Object3D } from "three";
import { COCKPIT_EYE } from "../../vehicle/tuning";

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

// ═══════════════════════════════════════════════════════════════════════════
// THE AUTHORED CASING, MOVED AT RUNTIME — the functions VitokCockpit runs on
// its cloned interior (2026-09-28, lane mirror round 3). They lived inside the
// component until round 2 raised the station-drop cap from 0 and made them
// live; no test could execute them there, so the casing half of the B58
// re-check was a subtraction (`rearMirrorB58ClearanceM().casing`), not a
// measurement of the buffers the GPU draws. Here they are the SAME functions
// VitokCockpit calls, and `mirrorCasing.test.ts` runs them on the decoded
// hero_interior.glb (156 vertices) and on a scaled, rotated synthetic shell.
// ═══════════════════════════════════════════════════════════════════════════

/** The authored mirror casing's vertices, on private geometry copies, with
 *  their authored position — what `applyRearMirrorCasingDrop` writes from. */
export interface RearMirrorCasing {
  parts: {
    /** The mesh's PRIVATE position attribute (the cached GLTF's is untouched). */
    position: BufferAttribute;
    indices: Uint32Array;
    /** Authored x, y, z of each captured vertex, interleaved. */
    base: Float32Array;
    /** One metre of chassis-DOWN in the mesh's own frame (identity mount: (0, -1, 0)). */
    down: Vector3;
  }[];
  /** The drop currently written into the buffers, metres. */
  applied: number;
}

/**
 * «RE-ANCHOR THE MIRROR» — THE AUTHORED HALF (founder ruling 2026-09-22).
 *
 * B58 learned that moving the glass alone „does nothing: the authored casing
 * then becomes the occluder", which is why its raise was an ASSET edit. The
 * re-anchor cannot be one: it exists only on wide canvases and is 0 at 16:9,
 * so the casing is moved at runtime, on a private copy of the shell geometry —
 * the same clone-before-edit rule VitokCockpit's `recessDemisterSlots` keeps,
 * so the cached GLTF every other mount (and the clip rig) receives is never
 * touched.
 *
 * Which vertices: every vertex of a mesh whose name starts with
 * `shellNodePrefix` (`interior_shell`: GLTFLoader names the 8 primitives
 * interior_shell, interior_shell_1 …) that lies inside
 * {@link REAR_MIRROR_CASING_BOX} — the MIRROR END of the station B58 raised
 * (156 of its 168 vertices, measured on the shipped GLB; the 12-vertex stalk
 * root stays in the roof). Called ONCE at clone time, while the root still
 * has an identity transform, so root space is GLB space and the chassis point
 * is (−x, y − {@link INTERIOR_MOUNT_Y_OFFSET_M}, −z) — the cabin mount.
 */
export function captureRearMirrorCasing(root: Object3D, shellNodePrefix: string): RearMirrorCasing {
  root.updateMatrixWorld(true);
  const v = new Vector3();
  const parts: RearMirrorCasing["parts"] = [];
  root.traverse((o) => {
    if (!o.name.startsWith(shellNodePrefix)) return;
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.geometry.getAttribute("position");
    if (!(source instanceof BufferAttribute)) return;
    const hits: number[] = [];
    for (let i = 0; i < source.count; i++) {
      v.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
      if (inRearMirrorCasing(-v.x, v.y - INTERIOR_MOUNT_Y_OFFSET_M, -v.z)) hits.push(i);
    }
    if (hits.length === 0) return;
    // Private copy — never write the cached GLTF's buffers.
    mesh.geometry = mesh.geometry.clone();
    const position = mesh.geometry.getAttribute("position") as BufferAttribute;
    const indices = Uint32Array.from(hits);
    const base = new Float32Array(indices.length * 3);
    for (let k = 0; k < indices.length; k++) {
      base[k * 3] = position.getX(indices[k]);
      base[k * 3 + 1] = position.getY(indices[k]);
      base[k * 3 + 2] = position.getZ(indices[k]);
    }
    // Chassis Y is root Y (the mount is a yaw and a y offset), so chassis-down
    // in the mesh frame is root-down through the inverse of its world matrix.
    // L = A⁻¹·(0, −1, 0) for the linear part A — NOT transformDirection, which
    // normalises and would mis-size the move under a scaled node.
    const down = new Vector3(0, -1, 0).applyMatrix3(new Matrix3().setFromMatrix4(mesh.matrixWorld).invert());
    parts.push({ position, indices, base, down });
  });
  return { parts, applied: 0 };
}

/**
 * Write the casing at `dropM` below its authored height. Absolute, from the
 * captured base, so it is idempotent and a return to a narrow canvas restores
 * the authored vertices exactly. The drop is applied along chassis-down as
 * seen in the mesh's own frame, so a node transform on the shell cannot turn
 * it into a sideways or scaled move.
 */
export function applyRearMirrorCasingDrop(casing: RearMirrorCasing, dropM: number): void {
  const drop = Number.isFinite(dropM) && dropM > 0 ? dropM : 0;
  if (drop === casing.applied) return;
  for (const part of casing.parts) {
    const { base, down } = part;
    for (let k = 0; k < part.indices.length; k++) {
      part.position.setXYZ(
        part.indices[k],
        base[k * 3] + down.x * drop,
        base[k * 3 + 1] + down.y * drop,
        base[k * 3 + 2] + down.z * drop,
      );
    }
    part.position.needsUpdate = true;
  }
  casing.applied = drop;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE RIGGED GLASS AND ITS HOUSING, AS THE PRODUCT BUILDS THEM — and B58's
// sign clearance measured on THAT, not on a subtraction (2026-09-27, lane
// mirror round 2).
//
// The first cut of the re-anchor capped the station drop by «105 − d ≥ 92.8
// mm». That sum is true of the AUTHORED CASING only (a straight vertex
// translation). The glass is not moved like that: MirrorRig slides it 60 mm
// along the ray to the driver's eye (REF 8), and a node raise tilts that ray,
// so 105 mm of node raise delivers ~97.4 mm at the glass — and the station
// drop is applied AFTER the lift, as a pure translation. At 12.0 mm the glass
// (and the housing portalled into it) sat where a 92.10 mm node raise puts it:
// 0.7 mm under B58's bar. So the placement is a pure function here, MirrorRig
// calls it, and the clearance below is asked of the points it produces.
// ═══════════════════════════════════════════════════════════════════════════

export type Vec3 = readonly [number, number, number];

/**
 * The interior GLB's mount offset along +Y: chassis = (−x, y − 0.55, −z)
 * (VitokCockpit's `INTERIOR_Y_OFFSET` = −0.55, and its yaw π).
 */
export const INTERIOR_MOUNT_Y_OFFSET_M = 0.55;

/** COCKPIT_EYE carried into the interior GLB's frame (the mount inverted). */
export const COCKPIT_EYE_GLB: Vec3 = [
  -COCKPIT_EYE.x,
  COCKPIT_EYE.y + INTERIOR_MOUNT_Y_OFFSET_M,
  -COCKPIT_EYE.z,
];

/** MirrorRig's REF 8 lift of the rear glass along the eye ray, metres (60 mm
 *  clears the authored casing's driver-facing face — see MIRROR_DEFS). */
export const REAR_GLASS_LIFT_M = 0.06;

/**
 * MirrorRig's `MIRROR_DROP_M`: the rear assembly's extra 14 mm drop after the
 * lift, so the authored stalk meets the housing's top rim instead of ending
 * inside the reflection (REF 8, second half — the argument is at MirrorRig's
 * constant).
 */
export const REAR_GLASS_ASSEMBLY_DROP_M = 0.014;

/**
 * Where MirrorRig puts a mirror glass quad, from its AUTHORED node position
 * (GLB frame), in this order — the order is the point:
 *   1. REF 8: slide `liftM` along the ray to the eye and shrink by the
 *      distance ratio (d − lift) / d, so the eye sees the same pixels, nearer;
 *      skipped when `liftM` is 0 or the eye is within 2 × lift;
 *   2. only when that lift ran: `liftedDropM` straight down (MIRROR_DROP_M);
 *   3. `stationDropM` straight down — the «re-anchor» drop, AFTER the lift, so
 *      the lift's eye-ray geometry is the authored one at every aspect.
 * Returns the new position and the factor the node's scale is multiplied by.
 * The arithmetic is three.js's own (`divideScalar` multiplies by 1/d), so
 * MirrorRig's placement is float-identical to what it computed inline.
 */
export function rigMirrorGlass(
  authored: Vec3,
  liftM: number,
  liftedDropM: number,
  stationDropM: number,
  eye: Vec3 = COCKPIT_EYE_GLB,
): { position: [number, number, number]; scaleRatio: number } {
  let [x, y, z] = authored;
  let scaleRatio = 1;
  if (liftM !== 0) {
    const tx = eye[0] - x;
    const ty = eye[1] - y;
    const tz = eye[2] - z;
    const distance = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (distance > liftM * 2) {
      const inv = 1 / distance;
      x += tx * inv * liftM;
      y += ty * inv * liftM;
      z += tz * inv * liftM;
      scaleRatio = (distance - liftM) / distance;
      y -= liftedDropM;
    }
  }
  if (stationDropM > 0) y -= stationDropM;
  return { position: [x, y, z], scaleRatio };
}

/**
 * MirrorRig's placement of one glass NODE, with its undo — the half of the rig
 * effect that touches the transform (lane mirror round 3, verifier note N1).
 * Places the node through {@link rigMirrorGlass} from its CURRENT (authored)
 * position and returns the restore MirrorRig's effect cleanup runs. The
 * restore puts back position AND scale, so when the canvas aspect changes the
 * re-anchor drop (a phone turned sideways: 0 ↔ 11.3 mm) the effect re-applies
 * from the AUTHORED transform — the lift direction never depends on the drop,
 * and neither the lift, the drop nor the shrink can accumulate across turns.
 */
export function placeRigGlassNode(
  node: Object3D,
  liftM: number,
  liftedDropM: number,
  stationDropM: number,
): () => void {
  const previousPosition = new Vector3().copy(node.position);
  const previousScale = new Vector3().copy(node.scale);
  const placed = rigMirrorGlass(
    [node.position.x, node.position.y, node.position.z],
    liftM,
    liftedDropM,
    stationDropM,
  );
  node.position.set(placed.position[0], placed.position[1], placed.position[2]);
  if (placed.scaleRatio !== 1) node.scale.multiplyScalar(placed.scaleRatio);
  return () => {
    node.position.copy(previousPosition);
    node.scale.copy(previousScale);
  };
}

/**
 * `hotspot_mirror_rear` as hero_interior.glb ships it (node 15, a scene root —
 * read off the file; `mirrorAnchor.test.ts` re-reads the GLB and fails if they
 * part). `preRaiseY` is `raise_interior_mirror.mjs`'s AUTHORED_NODE_Y: the
 * shipped y is that plus B58's raise.
 */
export const REAR_GLASS_NODE = {
  x: 0,
  preRaiseY: 1.353,
  z: -0.5,
  quaternion: [-0.03455985710024834, -0.13908833265304565, -0.004857071675360203, 0.9896649122238159],
  scale: 0.8399999737739563,
} as const;

/**
 * B58 (founder register), restated from `tools/glb/raise_interior_mirror.mjs`:
 * the mirror station was RAISED 105 mm so the В26 «50» the speeding drill tells
 * the student to read clears the assembly. The swept threshold is 92.8 mm of
 * NODE raise — measured WITH MirrorRig's eye-ray lift, clearing the glass and
 * the authored casing, at the lane centre of ov-keepright-v1.
 */
export const B58_STATION_RAISE_M = 0.105;
export const B58_CLEARANCE_NODE_RAISE_M = 0.0928;

// ── The housing. Moved here from VitokCockpit so the B58 check below measures
//    the boxes the cockpit renders. Each carries the measurement that set it.
/** Authored `hotspot_mirror_rear` quad half-extents, quad-local units. */
export const REAR_GLASS_HALF = { x: 0.1125, y: 0.0375 } as const;
/** Bezel/front-shell half-extents — a ~12 mm rim around the glass. */
export const HOUSING_HALF = { x: 0.124, y: 0.05 } as const;
/** How far the bezel ring stands proud of the glass, quad-local units. */
export const BEZEL_PROUD = 0.014;
/**
 * Front-shell depth behind the glass, before the housing steps out. Kept to a
 * lip: the authored casing's DRIVER-FACING face is at chassis z 0.467–0.483 —
 * i.e. immediately behind the lifted glass — so the tall rear shell has to
 * begin there. A first pass gave the slim front shell 50 mm of depth and a
 * rendered frame put the casing's lit corner straight back over the mirror.
 */
export const HOUSING_FRONT_DEPTH = 0.004;
/**
 * REAR SHELL — the bulky half of the housing, and the part that does the
 * hiding. A first render with a single slim box left a lit tan flap above the
 * mirror; raycasting those exact pixels put it on interior_shell at chassis
 * (0.06, 0.848, 0.475) — the authored casing's own TOP FACE, whose elevation
 * from COCKPIT_EYE (0.189 rad) just beat the slim shell's (0.188). Rather than
 * fatten the visible bezel to cover it, the housing steps UP and OUT behind
 * the glass, which is what a real mirror body does anyway: at half-height
 * 0.082 the rear shell sits at elevation 0.180–0.213 along its length against
 * the authored casing's 0.172–0.191, so the old top face is behind it from
 * every point of the shipped cockpit pose.
 */
export const HOUSING_REAR_HALF = { x: 0.128, y: 0.045 } as const;
/** Rear shell depth — its far face passes the authored casing's (chassis
 *  z 0.560, i.e. ~0.125 m behind the lifted glass). */
export const HOUSING_REAR_DEPTH = 0.16;
/**
 * Rear-shell rise, quad-local. The assembly now also drops 14 mm
 * (MirrorRig.MIRROR_DROP_M) while the authored casing stays put, so the shell
 * has to grow back UP by at least that much or the casing's top face reappears
 * over the mirror — which is exactly what the next rendered frame showed.
 * 0.030 local ≈ 23 mm of rise: the drop plus margin, added upward only so the
 * housing does not also grow downward into the frame.
 */
export const HOUSING_REAR_RISE = 0.05;
/**
 * MIRROR HOOD (R0 round 3) — the moulded lip over the glass, and the ONLY
 * thing that can legally cover the last stretch of the authored stalk.
 *
 * The stalk's underside crosses the lifted glass's top edge (the constant
 * chassis-height line y 0.8165 from (0.119, z 0.470) to (−0.083, z 0.417)) at
 * about z 0.449 — it physically penetrates the reflection. A chassis-space
 * fairing that follows it that far therefore lands ON the glass, which is what
 * round 1 did and what a first round-3 render reproduced exactly (first bright
 * row 230 → 239 in columns 1010…1080).
 *
 * This piece lives in the GLASS QUAD'S OWN FRAME, so it is defined against the
 * glass, not against the car: its lower edge is `REAR_GLASS_HALF.y` — the glass's
 * top edge itself — and it can never eat a millimetre of reflection no matter
 * what MirrorRig does to the quad. Standing 0.035 local PROUD of the glass
 * plane it is nearer the eye than the stalk from chassis z 0.4145 back, so it
 * occludes the stalk's last centimetres. And because the glass rakes away from
 * the driver as it rises, a proud lip at the same local height projects ABOVE
 * the glass's top edge (row 215 vs 224 at 1440×900), not over it.
 */
export const HOUSING_HOOD = { halfX: 0.124, yTop: 0.095, zFront: 0.035, zBack: -0.02 } as const;

/** One box of the housing, quad-local: its centre and its full size (three.js
 *  `boxGeometry` args). */
export interface HousingBox {
  position: [number, number, number];
  size: [number, number, number];
}

/** Every box MirrorHousing renders, in the glass quad's local frame. */
export const REAR_MIRROR_HOUSING_BOXES: {
  front: HousingBox;
  rear: HousingBox;
  hood: HousingBox;
  bezel: readonly HousingBox[];
} = (() => {
  // [half-width, half-height, centre-x, centre-y] — top / bottom run the full
  // housing width; the sides fill between them.
  const bars: readonly (readonly [number, number, number, number])[] = [
    [HOUSING_HALF.x, (HOUSING_HALF.y - REAR_GLASS_HALF.y) / 2, 0, (HOUSING_HALF.y + REAR_GLASS_HALF.y) / 2],
    [HOUSING_HALF.x, (HOUSING_HALF.y - REAR_GLASS_HALF.y) / 2, 0, -(HOUSING_HALF.y + REAR_GLASS_HALF.y) / 2],
    [(HOUSING_HALF.x - REAR_GLASS_HALF.x) / 2, REAR_GLASS_HALF.y, -(HOUSING_HALF.x + REAR_GLASS_HALF.x) / 2, 0],
    [(HOUSING_HALF.x - REAR_GLASS_HALF.x) / 2, REAR_GLASS_HALF.y, (HOUSING_HALF.x + REAR_GLASS_HALF.x) / 2, 0],
  ];
  return {
    front: {
      position: [0, 0, -0.003 - HOUSING_FRONT_DEPTH / 2],
      size: [HOUSING_HALF.x * 2, HOUSING_HALF.y * 2, HOUSING_FRONT_DEPTH],
    },
    rear: {
      position: [0, HOUSING_REAR_RISE / 2, -0.003 - HOUSING_FRONT_DEPTH - HOUSING_REAR_DEPTH / 2],
      size: [HOUSING_REAR_HALF.x * 2, HOUSING_REAR_HALF.y * 2 + HOUSING_REAR_RISE, HOUSING_REAR_DEPTH],
    },
    hood: {
      position: [0, (REAR_GLASS_HALF.y + HOUSING_HOOD.yTop) / 2, (HOUSING_HOOD.zFront + HOUSING_HOOD.zBack) / 2],
      size: [HOUSING_HOOD.halfX * 2, HOUSING_HOOD.yTop - REAR_GLASS_HALF.y, HOUSING_HOOD.zFront - HOUSING_HOOD.zBack],
    },
    bezel: bars.map(([hw, hh, cx, cy]) => ({
      position: [cx, cy, BEZEL_PROUD / 2 - 0.002] as [number, number, number],
      size: [hw * 2, hh * 2, BEZEL_PROUD] as [number, number, number],
    })),
  };
})();

/** Rotate v by the unit quaternion q = [x, y, z, w] (three.js's applyQuaternion). */
function rotate(q: readonly number[], v: Vec3): [number, number, number] {
  const [qx, qy, qz, qw] = q;
  const [x, y, z] = v;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/**
 * A point of the rigged rear glass's own frame (the glass quad, or anything
 * portalled into it — MirrorHousing) in GLB space, for a given node raise and
 * station drop, through exactly the placement MirrorRig applies.
 */
export function rearGlassPointGlb(
  local: Vec3,
  nodeRaiseM: number,
  stationDropM: number,
): [number, number, number] {
  const n = REAR_GLASS_NODE;
  const rig = rigMirrorGlass(
    [n.x, n.preRaiseY + nodeRaiseM, n.z],
    REAR_GLASS_LIFT_M,
    REAR_GLASS_ASSEMBLY_DROP_M,
    stationDropM,
  );
  const s = n.scale * rig.scaleRatio;
  const r = rotate(n.quaternion, local);
  return [rig.position[0] + s * r[0], rig.position[1] + s * r[1], rig.position[2] + s * r[2]];
}

/** The eight corners of a box. */
function boxCorners(b: HousingBox): Vec3[] {
  const out: Vec3[] = [];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        out.push([
          b.position[0] + (sx * b.size[0]) / 2,
          b.position[1] + (sy * b.size[1]) / 2,
          b.position[2] + (sz * b.size[2]) / 2,
        ]);
  return out;
}

/** The glass quad's four corners, quad-local. */
export const REAR_GLASS_CORNERS: readonly Vec3[] = [
  [REAR_GLASS_HALF.x, REAR_GLASS_HALF.y, 0],
  [-REAR_GLASS_HALF.x, REAR_GLASS_HALF.y, 0],
  [REAR_GLASS_HALF.x, -REAR_GLASS_HALF.y, 0],
  [-REAR_GLASS_HALF.x, -REAR_GLASS_HALF.y, 0],
];

/** Every corner of every box MirrorHousing renders, quad-local. */
export const REAR_HOUSING_CORNERS: readonly Vec3[] = [
  REAR_MIRROR_HOUSING_BOXES.front,
  REAR_MIRROR_HOUSING_BOXES.rear,
  REAR_MIRROR_HOUSING_BOXES.hood,
  ...REAR_MIRROR_HOUSING_BOXES.bezel,
].flatMap(boxCorners);

/**
 * B58 RE-VERIFIED ON THE BUILT ASSEMBLY, per part: for each part, the LEAST
 * (over its points) of «how high it sits at the shipped raise with this
 * station drop» minus «how high it sat at B58's 92.8 mm threshold raise with
 * none», metres. ≥ 0 means no point of that part is lower than it was at the
 * swept threshold. What each part is:
 *   · casing — the authored station vertices: B58's raise and the re-anchor
 *     drop are both straight vertex translations (raise_interior_mirror.mjs;
 *     VitokCockpit.applyRearMirrorCasingDrop), so every vertex agrees and the
 *     subtraction IS the product for this part — and only for this part;
 *   · glass — the quad's four corners through `rigMirrorGlass`;
 *   · housing — every corner of every box portalled into the glass.
 * What it is NOT: a ray sweep from the eye to the plate. The sweep that set
 * 92.8 did not record which part hides the «50» at the threshold, so the claim
 * this can make is the conservative one — nothing sits lower than it did at
 * the threshold the sweep measured.
 */
export function rearMirrorB58ClearanceM(stationDropM: number): {
  casing: number;
  glass: number;
  housing: number;
} {
  const drop = Number.isFinite(stationDropM) && stationDropM > 0 ? stationDropM : 0;
  const least = (points: readonly Vec3[]) =>
    Math.min(
      ...points.map(
        (p) =>
          rearGlassPointGlb(p, B58_STATION_RAISE_M, drop)[1] -
          rearGlassPointGlb(p, B58_CLEARANCE_NODE_RAISE_M, 0)[1],
      ),
    );
  return {
    casing: B58_STATION_RAISE_M - drop - B58_CLEARANCE_NODE_RAISE_M,
    glass: least(REAR_GLASS_CORNERS),
    housing: least(REAR_HOUSING_CORNERS),
  };
}
