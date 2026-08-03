/**
 * Buildings: footprint rings extruded to flat-roof prisms.
 * - Heights come from the district data via resolveBuildingHeightM (QW3,
 *   doc 68): OSM height/levels where present, deterministic 15–25 m mid-rise
 *   jitter where the data has none.
 * - Walls merged into one mesh PER facade palette variant (4 variants,
 *   deterministic per building id) — 4 draw calls total. Buildings that get a
 *   kit-building instance instead (skipFacadesFor) emit NO walls/roof, but
 *   ALWAYS emit their collider + aabb, so physics and prop placement see
 *   every building.
 * - Wall UVs: u = perimeter meters / FACADE_TILE_U_M, v = -(height meters) /
 *   FACADE_TILE_V_M — the baked bay textures (facade_atlas.py) tile at true
 *   world scale. V is NEGATED because the shared textures are uploaded in
 *   glTF convention (flipY=false, v=0 at image top) to serve the kit towers
 *   too; with RepeatWrapping the negation reads the image bottom-up.
 * - Per-building whole-bay U / whole-floor V offset (hash lane "bay:") shifts
 *   the baked lit-window pattern so neighbouring prisms never repeat it.
 * - Ground floor: darker band via vertex colors (extra vertex row at
 *   GROUND_BAND_M) — free, no extra material.
 * - Per-building tint (doc 71 Phase 1 / QW-D): ±9 % brightness + a subtle
 *   warm/cool split, deterministic per building id, multiplied into the same
 *   vertex colors — the 238 prisms stop being identical white at zero cost.
 * - Roofs merged into one mesh (flat, ear-clip triangulated).
 * - Collider: wall quads only, merged into a single trimesh.
 */

import type { DistrictBuilding } from "../types";
import { resolveBuildingHeightM } from "./cityBuildings";
import {
  FACADE_BAY_M,
  FACADE_FLOOR_M,
  FACADE_TILE_U_M,
  FACADE_TILE_V_M,
  FACADE_VARIANTS,
  GROUND_BAND_M,
  GROUND_BAND_TINT,
} from "./constants";
import { hashString, toCCW, triangulate, type Vec2 } from "./math2d";
import { MeshAccumulator, toWorld, UP } from "./mesh";

export interface BuildingBuildResult {
  walls: MeshAccumulator[];
  roofs: MeshAccumulator;
  collider: MeshAccumulator;
  /** District-space AABBs (minX, minY, maxX, maxY) for prop placement. */
  aabbs: [number, number, number, number][];
  count: number;
}

/**
 * Facade variant a `kind: "school"` block always takes. Variant 2 is the
 * horizontal-band system (StaticWorld FACADE_SETS: bay_grid / bay_band /
 * bay_strip / bay_curtain → index 2 = `bay_strip`), i.e. long ribbon windows
 * rather than the punched panelka grid variant 0 the neighbouring residential
 * blocks skew to. A school must not read as one more жилищен блок — that was
 * the founder's whole complaint on item 61.
 */
const SCHOOL_FACADE_VARIANT = 2;

/**
 * Cornice band, art pass 2026-08-03. Height of the crown strip cut off the top
 * of every wall. 1.1 m is a real Bulgarian parapet + coping: tall enough to
 * read at the 40–120 m a driver sees a block from, short enough that it never
 * eats a floor of the baked bay texture underneath it.
 */
const CORNICE_DEPTH_M = 1.1;
/** Value at the reveal line — the shaded gap the projecting coping throws on
 *  the wall under it. Deliberately DEEPER than GROUND_BAND_TINT (0.62): this
 *  is a cast shadow with a hard top edge, not the ground floor's diffuse
 *  street grime, and the two bands have to be separable or the prism just
 *  gains a second grubby stripe. */
const CORNICE_REVEAL_TINT = 0.55;
/** …and at the roofline itself: the coping's own top face is the one part of
 *  the wall pointing at the sky, so it is the brightest thing on the prism. */
const CORNICE_CAP_TINT = 1.14;

export function facadeVariant(buildingId: string, height: number, kind?: string): number {
  // A school is never hashed into the residential palette: it is the ONE
  // building on the street a driver has to recognise (founder item 61).
  if (kind === "school") return SCHOOL_FACADE_VARIANT;
  const h = hashString(buildingId);
  // Tall blocks skew toward the panel-block palette (variant 0) — Студентски
  // град is panelka country.
  if (height >= 15 && h % 3 !== 0) return 0;
  return h % FACADE_VARIANTS;
}

/**
 * Deterministic per-building facade tint (multiplied into the wall vertex
 * colors): luminance 0.90–1.08 with a ±1.5 % warm/cool channel split. Subtle
 * on purpose — it must read as different paint/weathering batches, not as
 * candy. Uses a different hash lane than facadeVariant so tint and texture
 * variant don't correlate.
 */
export function facadeTint(buildingId: string, kind?: string): [number, number, number] {
  // A school wears the Bulgarian school palette — warm ochre/cream, brighter
  // than any of the residential jitter band (0.90–1.08 luminance). It is a
  // FIXED tint, not a hashed one: this building must be the same recognisable
  // colour on every map that ever hosts a school (founder item 61).
  if (kind === "school") return [1.16, 1.05, 0.83];
  const h = hashString(`tint:${buildingId}`);
  const lum = 0.9 + 0.18 * ((h & 0xff) / 255);
  const warm = 0.985 + 0.03 * (((h >> 8) & 0xff) / 255);
  return [lum * warm, lum, lum * (2.0 - warm)];
}

function buildOne(
  wallAcc: MeshAccumulator | null,
  roofAcc: MeshAccumulator | null,
  colliderAcc: MeshAccumulator,
  b: DistrictBuilding,
): [number, number, number, number] {
  const ring = toCCW(b.footprint as Vec2[]);
  const h = resolveBuildingHeightM(b);
  const bandTop = Math.min(GROUND_BAND_M, h - 0.5);
  // Whole-bay U / whole-floor V shift of the baked bay texture per building —
  // de-correlates the lit-window pattern across the 238 prisms for free.
  const bayHash = hashString(`bay:${b.id}`);
  const uOff = (bayHash % 4) * (FACADE_BAY_M / FACADE_TILE_U_M);
  const vOff = ((bayHash >> 2) % 3) * (FACADE_FLOOR_M / FACADE_TILE_V_M);
  const vAt = (y: number): number => vOff - y / FACADE_TILE_V_M;
  const [tr, tg, tb] = facadeTint(b.id, b.kind);
  const dark: [number, number, number] = [
    GROUND_BAND_TINT * tr,
    GROUND_BAND_TINT * tg,
    GROUND_BAND_TINT * tb,
  ];
  const light: [number, number, number] = [tr, tg, tb];
  // Cornice band (art pass 2026-08-03). The review: *"our buildings are
  // untextured extruded boxes with painted-on window rectangles"*. Half of
  // that read is the TOP: a flat-roofed prism whose wall runs at one value
  // straight into the roof plane has no crown, and a box with no crown is an
  // extrusion, not a building. Every Bulgarian блок has one — a projecting
  // parapet with a shaded reveal under it.
  //
  // This is that, and it costs nothing but one extra vertex row: the wall's
  // top quad is split at CORNICE_DEPTH_M, the split row is darkened to the
  // reveal value and the roofline row is lifted to the parapet value. Vertex
  // colours multiply the SAME facade map on the SAME material, so the mesh
  // count, the draw count and the texture budget are all unchanged, and it
  // reads identically at every tier — including `low`, where facadeMaps is
  // "colorOnly" and there is no normal map to carry relief. That is the point:
  // it is the one building cue a phone can afford.
  const reveal: [number, number, number] = [
    CORNICE_REVEAL_TINT * tr,
    CORNICE_REVEAL_TINT * tg,
    CORNICE_REVEAL_TINT * tb,
  ];
  const parapet: [number, number, number] = [
    CORNICE_CAP_TINT * tr,
    CORNICE_CAP_TINT * tg,
    CORNICE_CAP_TINT * tb,
  ];
  // Never eat the ground band, and never invent a cornice on a hut: below
  // ~2 × the band height the building is a kiosk and gets none.
  const corniceY =
    h > GROUND_BAND_M * 2 + CORNICE_DEPTH_M ? h - CORNICE_DEPTH_M : Number.NaN;
  const hasCornice = Number.isFinite(corniceY);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let perim = 0;

  for (let i = 0; i < ring.length; i++) {
    const p0 = ring[i] as Vec2;
    const p1 = ring[(i + 1) % ring.length] as Vec2;
    minX = Math.min(minX, p0[0]);
    minY = Math.min(minY, p0[1]);
    maxX = Math.max(maxX, p0[0]);
    maxY = Math.max(maxY, p0[1]);
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;
    // CCW ring -> interior on the left -> outward normal = right of travel.
    const nx = dy / segLen;
    const ny = -dx / segLen;
    const n: [number, number, number] = [nx, 0, -ny];
    const u0 = uOff + perim / FACADE_TILE_U_M;
    const u1 = uOff + (perim + segLen) / FACADE_TILE_U_M;
    perim += segLen;

    // Wall as two stacked quads: ground band (dark tint) + upper floors.
    // Vertical wall along travel (b0, b1, t1, t0) faces right = outward.
    if (wallAcc) {
      // Each row is [yBottom, yTop, tintAtBottom, tintAtTop] — the last two
      // differ only on the cornice, where the gradient IS the reveal.
      const rows: [number, number, [number, number, number], [number, number, number]][] =
        hasCornice
          ? [
              [0, bandTop, dark, dark],
              [bandTop, corniceY, light, light],
              // Dark at the reveal line, bright at the parapet's top edge.
              [corniceY, h, reveal, parapet],
            ]
          : [
              [0, bandTop, dark, dark],
              [bandTop, h, light, light],
            ];
      for (const [y0, y1, tint0, tint1] of rows) {
        const b0 = wallAcc.vertex(toWorld(p0[0], p0[1], y0), n, [u0, vAt(y0)], tint0);
        const b1 = wallAcc.vertex(toWorld(p1[0], p1[1], y0), n, [u1, vAt(y0)], tint0);
        const t1 = wallAcc.vertex(toWorld(p1[0], p1[1], y1), n, [u1, vAt(y1)], tint1);
        const t0 = wallAcc.vertex(toWorld(p0[0], p0[1], y1), n, [u0, vAt(y1)], tint1);
        wallAcc.quad(b0, b1, t1, t0);
      }
    }

    // Collider: single full-height quad.
    const cb0 = colliderAcc.vertex(toWorld(p0[0], p0[1], 0), n, [0, 0]);
    const cb1 = colliderAcc.vertex(toWorld(p1[0], p1[1], 0), n, [0, 0]);
    const ct1 = colliderAcc.vertex(toWorld(p1[0], p1[1], h), n, [0, 0]);
    const ct0 = colliderAcc.vertex(toWorld(p0[0], p0[1], h), n, [0, 0]);
    colliderAcc.quad(cb0, cb1, ct1, ct0);
  }

  // Roof: ear-clip the ring at height h (CCW input -> up-facing output).
  if (roofAcc) {
    const tris = triangulate(ring);
    const roofIdx = ring.map((p) =>
      roofAcc.vertex(toWorld(p[0], p[1], h), UP, [p[0] / 9, p[1] / 9]),
    );
    for (let i = 0; i < tris.length; i += 3) {
      roofAcc.tri(roofIdx[tris[i]!]!, roofIdx[tris[i + 1]!]!, roofIdx[tris[i + 2]!]!);
    }
  }

  return [minX, minY, maxX, maxY];
}

/**
 * `skipFacadesFor`: building ids that render as instanced kit buildings
 * (towers or retail pavilions, buildBuildingInstances) — they get collider +
 * aabb but no wall/roof mesh, so the instance and the prism never z-fight.
 */
export function buildBuildings(
  buildings: DistrictBuilding[],
  skipFacadesFor?: ReadonlySet<string>,
): BuildingBuildResult {
  const walls = Array.from({ length: FACADE_VARIANTS }, () => new MeshAccumulator(true));
  const roofs = new MeshAccumulator();
  const collider = new MeshAccumulator();
  const aabbs: [number, number, number, number][] = [];
  let count = 0;
  for (const b of buildings) {
    if (!b.footprint || b.footprint.length < 3) continue;
    const asTower = skipFacadesFor?.has(b.id) ?? false;
    const variant = facadeVariant(b.id, resolveBuildingHeightM(b), b.kind);
    aabbs.push(
      buildOne(asTower ? null : walls[variant]!, asTower ? null : roofs, collider, b),
    );
    count++;
  }
  return { walls, roofs, collider, aabbs, count };
}
