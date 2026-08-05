/* TEMPORARY measurement harness — delete after the FR-21 remainder report. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { PERCEPTUAL_ROAD_SCALE } from "@/modules/sim/contracts";
import { edgeHalfWidth, edgeTravelHalfWidth, edgeParkingBand } from "../../world/builders/network";
import { computeParkedCars } from "../TrafficLayer";
import type { DistrictEdge, TrafficDistrict } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../../../../..");
const WORLD_DIR = path.join(REPO, "content", "world");
const LANE_W = 3.25 * PERCEPTUAL_ROAD_SCALE;
const BODY_HALF_W = 0.95;
const PARKING_LANE_WIDTH_M = 4.0;
const SIDEWALK_WIDTH_M = 3.5;
const SIDEWALK_SKIRT_M = 0.35;

const IDS = readdirSync(WORLD_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

type Bld = { id: string; footprint: number[][] };
type Doc = TrafficDistrict & { buildings?: Bld[]; meta?: { generator?: string; mapKind?: string } };

function load(id: string): Doc | null {
  const raw = JSON.parse(readFileSync(path.join(WORLD_DIR, `${id}.json`), "utf-8")) as Doc;
  return raw.roads?.edges ? raw : null;
}
function bboxOf(geo: readonly number[][]): [number, number, number, number] {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const p of geo) {
    if (p[0] < a) a = p[0];
    if (p[0] > b) b = p[0];
    if (p[1] < c) c = p[1];
    if (p[1] > d) d = p[1];
  }
  return [a, b, c, d];
}
/** Perpendicular miss + whether the foot of the perpendicular is INSIDE the span. */
function project(geo: readonly number[][], px: number, py: number): { m: number; interior: boolean } {
  let best = Infinity;
  let interior = false;
  const n = geo.length - 1;
  for (let i = 0; i < n; i++) {
    const ax = geo[i][0], ay = geo[i][1];
    const dx = geo[i + 1][0] - ax, dy = geo[i + 1][1] - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(px - (ax + dx * clamped), py - (ay + dy * clamped));
    if (d < best) {
      best = d;
      // "interior" = the foot is not at the very ends of the WHOLE polyline
      interior = !((i === 0 && t <= 0) || (i === n - 1 && t >= 1));
    }
  }
  return { m: best, interior };
}
function missTo(geo: readonly number[][], px: number, py: number): number {
  return project(geo, px, py).m;
}
function footwayBodies(district: Doc) {
  const out: Array<{ x: number; y: number }> = [];
  const edges = district.roads.edges.filter((e) => e.geometry && e.geometry.length >= 2);
  const boxes = edges.map((e) => bboxOf(e.geometry));
  const kerbs = edges.map((e) => edgeHalfWidth(e as DistrictEdge));
  for (const b of computeParkedCars(district, LANE_W)) {
    let onSomeAsphalt = false;
    for (let i = 0; i < edges.length && !onSomeAsphalt; i++) {
      const limit = kerbs[i] + BODY_HALF_W;
      const [minX, maxX, minY, maxY] = boxes[i];
      if (b.x < minX - limit || b.x > maxX + limit || b.y < minY - limit || b.y > maxY + limit) continue;
      if (missTo(edges[i].geometry, b.x, b.y) - limit <= 1e-6) onSomeAsphalt = true;
    }
    if (!onSomeAsphalt) out.push({ x: b.x, y: b.y });
  }
  return out;
}
/** Nearest building to an edge, counting only vertices whose foot lands on the edge's own span. */
function frontage(d: Doc, geo: readonly number[][]): { m: number; id: string; any: number; anyId: string } {
  let best = Infinity, id = "—", any = Infinity, anyId = "—";
  for (const b of d.buildings ?? []) {
    for (const p of b.footprint ?? []) {
      const pr = project(geo, p[0], p[1]);
      if (pr.m < any) { any = pr.m; anyId = b.id; }
      if (pr.interior && pr.m < best) { best = pr.m; id = b.id; }
    }
  }
  return { m: best, id, any, anyId };
}

describe("FR-21 remainder measurement", () => {
  it("dumps the per-district ledger", () => {
    const rows: string[] = [];
    let micro = 0, microDirty = 0, all = 0, allDirty = 0;
    const closable: string[] = [];
    const blocked: string[] = [];
    for (const id of IDS) {
      const d = load(id);
      if (!d) continue;
      all++;
      const isMicro = typeof d.meta?.generator === "string" && d.meta.generator.includes("tools/maps/gen_");
      if (isMicro) micro++;
      const bad = footwayBodies(d);
      if (bad.length === 0) continue;
      allDirty++;
      if (isMicro) microDirty++;
      const edges = d.roads.edges.filter((e) => e.geometry && e.geometry.length >= 2);
      const perEdge: string[] = [];
      let worst = Infinity;
      let worstEdge = "";
      let worstBld = "";
      for (const e of edges) {
        const de = e as DistrictEdge;
        if (edgeParkingBand(de) !== null) continue;
        let owned = 0;
        for (const b of bad) {
          let bestM = Infinity, bestId = "";
          for (const o of edges) {
            const m = missTo(o.geometry, b.x, b.y);
            if (m < bestM) { bestM = m; bestId = o.id; }
          }
          if (bestId === e.id) owned++;
        }
        if (owned === 0) continue;
        const th = edgeTravelHalfWidth(de);
        const need = th + PARKING_LANE_WIDTH_M + SIDEWALK_WIDTH_M + SIDEWALK_SKIRT_M;
        const f = frontage(d, e.geometry);
        const head = f.m - need;
        if (head < worst) { worst = head; worstEdge = e.id; worstBld = f.id; }
        perEdge.push(
          `    ${e.id} cls=${e.class} ln=${e.lanes} bodies=${owned} need=${need.toFixed(3)} frontOnSpan=${Number.isFinite(f.m) ? f.m.toFixed(3) : "none"}(${f.id}) head=${Number.isFinite(head) ? head.toFixed(3) : "inf"} | nearestAny=${Number.isFinite(f.any) ? f.any.toFixed(3) : "none"}(${f.anyId})`,
        );
      }
      const line = `${id}: ${bad.length} bodies micro=${isMicro} worstHead=${Number.isFinite(worst) ? worst.toFixed(3) : "inf"} @${worstEdge}/${worstBld} gen=${d.meta?.generator ?? "?"}`;
      rows.push(`${line}\n${perEdge.join("\n") || "    (offending edges already declare parkingBand)"}`);
      if (worst >= 0) closable.push(`${id}(${bad.length},+${Number.isFinite(worst) ? worst.toFixed(2) : "inf"})`);
      else blocked.push(`${id}(${bad.length},${worst.toFixed(2)} @${worstEdge}→${worstBld})`);
    }
    const summary = [
      `districts=${all} dirty=${allDirty} | micro-maps=${micro} dirtyMicro=${microDirty}`,
      ``,
      `CLOSABLE BY A TAG (worst headroom ≥ 0), ${closable.length}:`,
      closable.join("  "),
      ``,
      `BLOCKED (a building is inside the widened corridor), ${blocked.length}:`,
      blocked.join("\n  "),
      ``,
    ].join("\n");
    writeFileSync(path.join(REPO, "..", "fr21-measure.txt"), summary + "\n" + rows.join("\n"));
  }, 600000);
});
