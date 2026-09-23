/**
 * paintedRouteCorpus — a DETERMINISTIC corpus of guidance derivations over
 * every shipped district, and a hash of exactly what `RouteGuidance` PAINTS
 * from each (`pts`, `arc`, `count`, `totalLen`, `goalS`, `turns`).
 *
 * Test-only helper for `guidance-lane-align-span.test.ts`: the golden it is
 * compared against (`fixtures/guidance-painted-2c6d3cb.json`) was captured by
 * this same function at commit 2c6d3cb, before `DerivedRoute.laneAlign`
 * existed, so a match proves the field changed no painted value.
 *
 * Nothing here reads `laneAlign` into the hash — that is the point.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildRouteGraph,
  deriveGuidanceRoute,
  type DerivedRoute,
  type RouteDistrictLike,
  type RouteTarget,
} from "../guidanceRoute";

export const WORLD_DIR = path.resolve(__dirname, "../../../../../public/world");

/** Lateral offsets a goal is authored at, right-normal metres: centreline,
 *  a left lane centre, a right lane centre, the far side. */
const OFFSETS = [0, 4.06, 12.19, -4.06];

function pointAlong(g: [number, number][], frac: number, lat: number): { x: number; y: number; headingDeg: number } {
  let total = 0;
  for (let i = 1; i < g.length; i++) total += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
  let want = total * frac;
  for (let i = 1; i < g.length; i++) {
    const L = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
    if (want <= L || i === g.length - 1) {
      const u = L > 0 ? Math.min(1, want / L) : 0;
      const dx = L > 0 ? (g[i][0] - g[i - 1][0]) / L : 0;
      const dy = L > 0 ? (g[i][1] - g[i - 1][1]) / L : 1;
      return {
        x: g[i - 1][0] + (g[i][0] - g[i - 1][0]) * u + dy * lat,
        y: g[i - 1][1] + (g[i][1] - g[i - 1][1]) * u - dx * lat,
        headingDeg: (Math.atan2(dx, dy) * 180) / Math.PI,
      };
    }
    want -= L;
  }
  return { x: g[0][0], y: g[0][1], headingDeg: 0 };
}

export interface CorpusEntry {
  label: string;
  route: DerivedRoute | null;
}

/** Every derivation of one district, in a fixed order. */
export function districtCorpus(district: RouteDistrictLike): CorpusEntry[] {
  const graph = buildRouteGraph(district);
  const edges = district.roads.edges.filter((e) => e.geometry.length >= 2);
  const out: CorpusEntry[] = [];
  if (edges.length === 0) return out;
  const pick = (n: number) => {
    const k: number[] = [];
    for (let i = 0; i < Math.min(n, edges.length); i++) k.push(Math.floor((i * edges.length) / Math.min(n, edges.length)));
    return k;
  };
  const starts = pick(5);
  const goals = pick(4);
  for (const si of starts) {
    const start = pointAlong(edges[si].geometry, 0.2, 0);
    for (const gi of goals) {
      for (const lat of OFFSETS) {
        const gp = pointAlong(edges[gi].geometry, 0.6, lat);
        const goal: RouteTarget = { kind: "point", x: gp.x, y: gp.y };
        out.push({ label: `s${si}-g${gi}-o${lat}`, route: deriveGuidanceRoute(graph, start, goal) });
        // …with a same-lane look-ahead on the same edge (the HOLD branch), and
        // one on the next edge (the decay / a junction between).
        const ahead = pointAlong(edges[gi].geometry, 0.95, lat);
        out.push({
          label: `s${si}-g${gi}-o${lat}-la`,
          route: deriveGuidanceRoute(graph, start, goal, { lookahead: [{ kind: "point", x: ahead.x, y: ahead.y }] }),
        });
        const nx = edges[(gi + 1) % edges.length];
        const far = pointAlong(nx.geometry, 0.5, lat);
        out.push({
          label: `s${si}-g${gi}-o${lat}-lx`,
          route: deriveGuidanceRoute(graph, start, goal, { lookahead: [{ kind: "point", x: far.x, y: far.y }] }),
        });
      }
    }
    // an "ahead" corridor from the same start (never lane-aligned)
    out.push({ label: `s${si}-ahead`, route: deriveGuidanceRoute(graph, start, { kind: "ahead", meters: 120 }) });
  }
  return out;
}

/** The painted values of one route, hashed. `laneAlign` is NOT an input. */
export function paintedHash(route: DerivedRoute | null): string {
  const h = createHash("sha256");
  if (route === null) return h.update("null").digest("hex").slice(0, 16);
  h.update(Buffer.from(route.pts.buffer, route.pts.byteOffset, route.count * 2 * 4));
  h.update(Buffer.from(route.arc.buffer, route.arc.byteOffset, route.count * 4));
  h.update(JSON.stringify([route.count, route.totalLen, route.goalS, route.turns]));
  return h.digest("hex").slice(0, 16);
}

/** One hash per district over its whole corpus, plus its size. */
export function corpusHashes(): Record<string, { n: number; hash: string }> {
  const out: Record<string, { n: number; hash: string }> = {};
  for (const f of fs.readdirSync(WORLD_DIR).filter((x) => x.endsWith(".json")).sort()) {
    const district = JSON.parse(fs.readFileSync(path.join(WORLD_DIR, f), "utf8")) as RouteDistrictLike;
    if (!district?.roads?.edges) continue;
    const h = createHash("sha256");
    const corpus = districtCorpus(district);
    for (const e of corpus) h.update(`${e.label}:${paintedHash(e.route)};`);
    out[f] = { n: corpus.length, hash: h.digest("hex").slice(0, 24) };
  }
  return out;
}
