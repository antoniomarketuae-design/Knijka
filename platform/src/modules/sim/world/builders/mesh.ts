/**
 * MeshAccumulator — grows indexed triangle buffers and emits MeshData.
 *
 * World-space convention (see types.ts): district (x, y) -> three (x, -z).
 * A triangle wound counter-clockwise in district space (positive signed
 * area) comes out front-facing UP (+Y) after mapping — builders emit
 * district-CCW order everywhere and it renders correctly.
 */

import type { MeshData, ColliderMesh, Vec3Tuple } from "../types";
import type { Vec2 } from "./math2d";

/** District (x, y) at height h -> world [x, h, -y]. */
export const toWorld = (x: number, y: number, h: number): Vec3Tuple => [x, h, -y];

/** District-space direction -> world-space (y = 0) direction. */
export const dirToWorld = (d: Vec2): Vec3Tuple => [d[0], 0, -d[1]];

/**
 * Yaw (rotation about +Y) that points an object's LOCAL +Z along the
 * district-space facing direction `f`.
 */
export function yawFromFacing(f: Vec2): number {
  // world facing = (f.x, 0, -f.y); rotating +Z by yaw gives (sin, 0, cos).
  return Math.atan2(f[0], -f[1]);
}

export class MeshAccumulator {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] | null;
  private idx: number[] = [];

  constructor(withColors = false) {
    this.col = withColors ? [] : null;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  /**
   * Read-only views of the raw buffers, so a LATER builder pass can test
   * against geometry an EARLIER pass already emitted — road decals keep out of
   * the painted markings (decals.ts MarkingKeepOut) instead of re-deriving
   * where the paint went. Re-derivation is exactly what drifts: a new marking
   * kind (lane arrows, speed glyphs, zone solids…) lands in the mesh and a
   * hand-written keep-out silently misses it.
   */
  get positionsView(): readonly number[] {
    return this.pos;
  }

  get indicesView(): readonly number[] {
    return this.idx;
  }

  /** Push one vertex (world space); returns its index. */
  vertex(p: Vec3Tuple, n: Vec3Tuple, uvv: [number, number], c?: [number, number, number]): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uvv[0], uvv[1]);
    if (this.col) {
      const cc = c ?? [1, 1, 1];
      this.col.push(cc[0], cc[1], cc[2]);
    }
    return i;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Quad a-b-c-d (CCW) as two triangles. */
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  toMeshData(): MeshData {
    const data: MeshData = {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nor),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
    };
    if (this.col) data.colors = new Float32Array(this.col);
    return data;
  }

  toColliderMesh(): ColliderMesh {
    return { positions: new Float32Array(this.pos), indices: new Uint32Array(this.idx) };
  }
}

export const UP: Vec3Tuple = [0, 1, 0];

/** Empty mesh (keeps components unconditional). */
export function emptyMeshData(): MeshData {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    indices: new Uint32Array(0),
  };
}
