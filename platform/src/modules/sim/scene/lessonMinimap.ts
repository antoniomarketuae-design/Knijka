// Adapter: district road network → HUD MinimapPolyline[] (district x,y meters).
// The runtime ships its own minimap builder, but the HUD's Minimap consumes a
// simpler {points:[x,y][], kind} shape; this bridges the two without either
// module depending on the other.

import type { MinimapPolyline } from "@/modules/sim/hud";

interface EdgeLike {
  geometry: Array<[number, number]>;
  class?: string;
}
interface DistrictLike {
  roads: { edges: EdgeLike[] };
}

/** Build the static road polylines once per district (district coords). */
export function buildMinimapPolylines(district: DistrictLike): MinimapPolyline[] {
  return district.roads.edges.map((e) => ({
    points: e.geometry.map(([x, y]) => [x, y] as [number, number]),
    kind: "road" as const,
  }));
}
