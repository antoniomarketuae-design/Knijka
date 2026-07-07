/**
 * Shared fixtures for the runtime tests — all tests run against the REAL
 * content/world/district-v1.json (the runtime's actual production input).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VehicleSample } from "../../contracts";
import type { SimTick } from "../../rules/types";
import { parseDistrict, type District, type DistrictEdge, type DistrictWorldRuntime } from "..";

let cached: District | null = null;

export function loadDistrict(): District {
  if (cached === null) {
    const p = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../../../content/world/district-v1.json",
    );
    cached = parseDistrict(JSON.parse(readFileSync(p, "utf-8")));
  }
  return cached;
}

export function edgeById(district: District, id: string): DistrictEdge {
  const edge = district.roads.edges.find((e) => e.id === id);
  if (!edge) throw new Error(`test fixture: edge ${id} not in district`);
  return edge;
}

export interface PathPose {
  x: number;
  y: number;
  headingDeg: number;
}

/** Point + geometry-forward unit tangent at arclength s of a polyline. */
export function pointAlong(geometry: [number, number][], s: number): { x: number; y: number; tx: number; ty: number } {
  let acc = 0;
  for (let i = 0; i < geometry.length - 1; i++) {
    const [ax, ay] = geometry[i];
    const [bx, by] = geometry[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (s <= acc + len || i === geometry.length - 2) {
      const t = len > 0 ? Math.min(1, Math.max(0, (s - acc) / len)) : 0;
      return {
        x: ax + t * (bx - ax),
        y: ay + t * (by - ay),
        tx: len > 0 ? (bx - ax) / len : 0,
        ty: len > 0 ? (by - ay) / len : 1,
      };
    }
    acc += len;
  }
  const [x, y] = geometry[geometry.length - 1];
  return { x, y, tx: 0, ty: 1 };
}

/**
 * Poses driving along an edge from arclength s0 to s1 (either direction),
 * laterally offset `rightOffsetM` to the RIGHT of the travel direction
 * (i.e. into the correct lane bank for right-hand traffic).
 */
export function edgeDrivePath(
  edge: DistrictEdge,
  s0: number,
  s1: number,
  stepM: number,
  rightOffsetM: number,
): PathPose[] {
  const poses: PathPose[] = [];
  const dir = s1 >= s0 ? 1 : -1;
  const n = Math.max(2, Math.round(Math.abs(s1 - s0) / stepM) + 1);
  for (let i = 0; i < n; i++) {
    const s = s0 + ((s1 - s0) * i) / (n - 1);
    const p = pointAlong(edge.geometry, s);
    const tx = p.tx * dir;
    const ty = p.ty * dir;
    // Right of travel direction (x east, y north): (ty, -tx).
    poses.push({
      x: p.x + ty * rightOffsetM,
      y: p.y - tx * rightOffsetM,
      headingDeg: ((Math.atan2(tx, ty) * 180) / Math.PI + 360) % 360,
    });
  }
  return poses;
}

export function mkVehicle(pose: PathPose, overrides: Partial<VehicleSample> = {}): VehicleSample {
  return {
    position: { x: pose.x, y: pose.y },
    headingDeg: pose.headingDeg,
    speedKmh: 30,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
    ...overrides,
  };
}

export interface DriveResult {
  ticks: SimTick[];
  /** Session time after the last frame. */
  tEnd: number;
}

/**
 * Feed a pose path through the runtime with the production call order
 * (update → sample), dt seconds per frame. Returns all emitted ticks.
 */
export function drive(
  rt: DistrictWorldRuntime,
  poses: PathPose[],
  opts: { dtSec?: number; t0Sec?: number; isNight?: boolean; speedKmh?: number } = {},
): DriveResult {
  const dt = opts.dtSec ?? 0.05;
  let t = opts.t0Sec ?? 0;
  const ticks: SimTick[] = [];
  for (const pose of poses) {
    t += dt;
    rt.update(dt);
    ticks.push(rt.sample(mkVehicle(pose, { speedKmh: opts.speedKmh ?? 30 }), t, opts.isNight ?? false));
  }
  return { ticks, tEnd: t };
}

export function eventsOf(ticks: SimTick[], kind: string): SimTick["events"] {
  const out: SimTick["events"] = [];
  for (const tick of ticks) for (const e of tick.events) if (e.kind === kind) out.push(e);
  return out;
}
