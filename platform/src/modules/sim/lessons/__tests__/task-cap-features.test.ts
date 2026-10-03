/**
 * THE FEATURE EACH TASK CAP NAMES, AND WHERE IT ENDS — founder ruling
 * 2026-09-25 «Only the named stretch».
 *
 * `taskCapFeatures.ts` restates, by value, the one fact the ruling needs and the
 * objective does not carry: for each capped objective whose task names a
 * feature beyond its own mark (the bend, the spray curtain, a slippery section,
 * a speed zone, the ring…), where that feature ENDS. Every other capped
 * objective names its own zone and binds across it (`finish.ts
 * taskCapStretch`'s default). Restated by value because a lesson may not
 * import the world — the template-side pattern (`CURVE_MID`, `DECK_TO_M`),
 * pinned here against the committed content so a moved span, edge, ring or
 * actor fails loudly instead of silently re-binding a cap.
 *
 * RED on round 3 (the module did not exist).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REACH_ZONE_HALT_CAP_KMH, parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel, ScenarioSpec } from "../scenario/types";
import { shownObjectiveCapKmh } from "../advisor";
import { TASK_CAP_FEATURES, taskCapFeatureFor, type TaskCapFeature } from "../taskCapFeatures";
import type { ObjectiveParams } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
/** Half the product's lane pitch (LANE_WIDTH_M 3.25 × the 2.5 road scale). */
const HALF_LANE_M = 8.125 / 2;

type Pt = { x: number; y: number };
interface District {
  roads: {
    nodes: Array<{ id: string; x: number; y: number }>;
    edges: Array<{ id: string; maxspeed: number; lanes?: number; roundabout?: boolean; geometry: number[][] }>;
  };
  roundabouts: Array<{ id: string; x: number; y: number; radius: number; edgeIds: string[] }>;
  zones: Array<{ id: string; kind: string; edgeId: string; fromM: number; toM: number }>;
  crossings?: Array<{ id: string; x: number; y: number; edgeId: string }>;
}
const districts = new Map<string, District>();
function district(id: string): District {
  if (!districts.has(id)) {
    districts.set(id, JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8")));
  }
  return districts.get(id)!;
}
/** Point and unit tangent at arclength `s` along a polyline. */
function along(g: number[][], s: number): { p: Pt; u: Pt } {
  let acc = 0;
  for (let i = 0; i + 1 < g.length; i++) {
    const L = Math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]);
    if (acc + L >= s - 1e-9 || i + 2 === g.length) {
      const f = Math.min(1, Math.max(0, (s - acc) / L));
      return {
        p: { x: g[i][0] + f * (g[i + 1][0] - g[i][0]), y: g[i][1] + f * (g[i + 1][1] - g[i][1]) },
        u: { x: (g[i + 1][0] - g[i][0]) / L, y: (g[i + 1][1] - g[i][1]) / L },
      };
    }
    acc += L;
  }
  throw new Error("empty polyline");
}
function polyDist(g: number[][], p: Pt, from = 0, to = Infinity): number {
  let best = Infinity;
  let acc = 0;
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let s = 0; s <= L; s += 0.5) {
      if (acc + s < from || acc + s > to) continue;
      const q = { x: a[0] + ((b[0] - a[0]) * s) / L, y: a[1] + ((b[1] - a[1]) * s) / L };
      best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
    }
    acc += L;
  }
  return best;
}
const angleDeg = (a: Pt, b: Pt) => (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y))) * 180) / Math.PI;

/** Every (template, objective id, rung, params, shown cap) of a flow-capped reachZone on a practice rung. */
interface CappedRow {
  spec: ScenarioSpec;
  id: string;
  level: ScenarioLevel;
  params: Extract<ObjectiveParams, { kind: "reachZone" }>;
  shown: number;
  next: ObjectiveParams | undefined;
  all: ObjectiveParams[];
  index: number;
}
function cappedRows(): CappedRow[] {
  const rows: CappedRow[] = [];
  for (const spec of SCENARIO_TEMPLATES) {
    for (const level of spec.levels.map((l) => l.level as ScenarioLevel)) {
      const lesson = compileScenario(spec, level);
      if (lesson.examMode) continue;
      const all = lesson.objectives.map((o) => parseObjectiveParams(o));
      lesson.objectives.forEach((o, index) => {
        const p = all[index];
        if (p.kind !== "reachZone" || p.maxSpeedKmh === undefined || p.maxSpeedKmh <= REACH_ZONE_HALT_CAP_KMH) return;
        rows.push({
          spec,
          id: o.id,
          level,
          params: p,
          shown: shownObjectiveCapKmh(o, p.maxSpeedKmh, lesson.postedLimitKmh),
          next: all.slice(index + 1).find((q) => q.kind !== "driveDistance"),
          all,
          index,
        });
      });
    }
  }
  return rows;
}
const ROWS = cappedRows();
/** A goal's centre and radius as the finish gates use it (`finish.ts goalArea`). */
function goalOf(p: ObjectiveParams): { x: number; y: number; r: number } | null {
  if (p.kind === "reachZone" || p.kind === "passSignal") return { x: p.x, y: p.y, r: p.radiusM };
  if (p.kind === "completeManeuver") {
    if (p.maneuver === "roundabout") return { x: p.x, y: p.y, r: p.enterRadiusM };
    if (p.maneuver === "threePointTurn")
      return { x: p.corridor.x, y: p.corridor.y, r: Math.hypot(p.corridor.halfWidthM, p.corridor.halfLengthM) };
    if (p.maneuver === "parkInBay") return { x: p.bay.x, y: p.bay.y, r: 14 };
  }
  return null;
}

describe("every row of the feature table names a real capped objective", () => {
  const ids = Object.keys(TASK_CAP_FEATURES);
  it("the table is not empty and carries the three kinds the ruling names", () => {
    expect(ids.length).toBeGreaterThan(20);
    const named = new Set(Object.values(TASK_CAP_FEATURES).map((f) => f.named));
    for (const k of ["bend", "curtain", "speedZone"]) expect(named.has(k as TaskCapFeature["named"])).toBe(true);
  });
  for (const id of ids) {
    it(`${id} — exactly one template authors it, and it is a flow-capped reachZone on a practice rung`, () => {
      const owners = new Set(ROWS.filter((r) => r.id === id).map((r) => r.spec.id));
      expect([...owners].length).toBe(1);
      const everywhere = SCENARIO_TEMPLATES.filter((s) => s.success.some((o) => o.id === id));
      expect(everywhere.length).toBe(1);
    });
  }
  it("ROUND 5 (verifier F4): «Влез покрай редицата с намалена скорост» names the PARKED ROW, which ends at the crossing (0, 78)", () => {
    const f = taskCapFeatureFor("sc-prs-row");
    expect(f?.named).toBe("parkedRow");
    expect(f?.end).toEqual({ kind: "gate", x: 0, y: 78, ux: 0, uy: 1 });
    expect(f?.authored).toEqual({ crossing: { district: "pe-child-v1", id: "pe-x-1" } });
    // Its neighbour, «Приближи мястото на изскачане…», asks only to arrive.
    expect(taskCapFeatureFor("sc-prs-approach")).toBeUndefined();
  });
  it("an objective the table does not name resolves to nothing (the stretch then defaults to its own zone)", () => {
    expect(taskCapFeatureFor("sc-jgap-approach")).toBeUndefined();
    expect(taskCapFeatureFor("no-such-objective")).toBeUndefined();
  });
});

describe("every feature end is the authored geometry it says it is", () => {
  for (const [id, f] of Object.entries(TASK_CAP_FEATURES)) {
    const row = ROWS.find((r) => r.id === id)!;
    it(`${id} (${f.named}) — ${f.source}`, () => {
      expect(row).toBeDefined();
      const a = f.authored;
      if ("zone" in a) {
        const d = district(a.zone.district);
        expect(row.spec.map.districtId).toBe(a.zone.district);
        const z = d.zones.find((x) => x.id === a.zone.id)!;
        expect(z).toBeDefined();
        const e = d.roads.edges.find((x) => x.id === z.edgeId)!;
        const end = along(e.geometry, z.toM);
        expect(f.end.kind).toBe("gate");
        if (f.end.kind !== "gate") return;
        expect(Math.hypot(f.end.x - end.p.x, f.end.y - end.p.y)).toBeLessThan(0.5);
        expect(angleDeg({ x: f.end.ux, y: f.end.uy }, end.u)).toBeLessThan(2);
        // The task's mark is at the span (inside it, or on its approach).
        expect(polyDist(e.geometry, row.params, z.fromM, z.toM)).toBeLessThan(25);
      } else if ("edge" in a) {
        const d = district(a.edge.district);
        expect(row.spec.map.districtId).toBe(a.edge.district);
        const e = d.roads.edges.find((x) => x.id === a.edge.id)!;
        expect(e).toBeDefined();
        const g = e.geometry;
        const L = g.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - g[i][0], p[1] - g[i][1]), 0);
        const end = along(g, L);
        expect(f.end.kind).toBe("gate");
        if (f.end.kind !== "gate") return;
        expect(Math.hypot(f.end.x - end.p.x, f.end.y - end.p.y)).toBeLessThan(0.5);
        expect(angleDeg({ x: f.end.ux, y: f.end.uy }, end.u)).toBeLessThan(2);
        expect(polyDist(g, row.params)).toBeLessThan(2 * HALF_LANE_M + 0.1);
        if (f.named === "speedZone") {
          // The zone the task names is the stretch posted at (or under) the cap it shows.
          for (const r of ROWS.filter((x) => x.id === id)) expect(e.maxspeed).toBeLessThanOrEqual(r.shown);
        }
      } else if ("staged" in a) {
        const ev = (row.spec.staged ?? []).find((s) => s.id === a.staged.actor) as
          | { sectionStart: Pt; sectionEnd: Pt }
          | undefined;
        expect(ev).toBeDefined();
        const u = { x: ev!.sectionEnd.x - ev!.sectionStart.x, y: ev!.sectionEnd.y - ev!.sectionStart.y };
        const n = Math.hypot(u.x, u.y);
        expect(f.end.kind).toBe("gate");
        if (f.end.kind !== "gate") return;
        expect(Math.hypot(f.end.x - ev!.sectionEnd.x, f.end.y - ev!.sectionEnd.y)).toBeLessThan(0.5);
        expect(angleDeg({ x: f.end.ux, y: f.end.uy }, { x: u.x / n, y: u.y / n })).toBeLessThan(2);
      } else if ("roundabout" in a) {
        const d = district(a.roundabout.district);
        expect(row.spec.map.districtId).toBe(a.roundabout.district);
        const rb = d.roundabouts.find((x) => x.id === a.roundabout.id)!;
        const lanes = d.roads.edges.find((x) => x.id === rb.edgeIds[0])!.lanes ?? 1;
        expect(f.end.kind).toBe("area");
        if (f.end.kind !== "area") return;
        expect(f.end.x).toBeCloseTo(rb.x, 6);
        expect(f.end.y).toBeCloseTo(rb.y, 6);
        expect(f.end.radiusM).toBeCloseTo(rb.radius + lanes * HALF_LANE_M, 6);
        expect(Math.hypot(row.params.x - rb.x, row.params.y - rb.y)).toBeLessThan(f.end.radiusM);
      } else if ("crossing" in a) {
        // ROUND 5 (verifier F4): a feature that ends AT a crossing — the parked
        // row of `sc-pe-parked-row-scan`, which the template's own instruction
        // ends «В края на редицата, на самата пешеходна пътека».
        const d = district(a.crossing.district);
        expect(row.spec.map.districtId).toBe(a.crossing.district);
        const c = (d.crossings ?? []).find((x) => x.id === a.crossing.id)!;
        expect(c).toBeDefined();
        const e = d.roads.edges.find((x) => x.id === c.edgeId)!;
        expect(e).toBeDefined();
        expect(f.end.kind).toBe("gate");
        if (f.end.kind !== "gate") return;
        expect(Math.hypot(f.end.x - c.x, f.end.y - c.y)).toBeLessThan(0.5);
        // Square to the crossing's own road, in the direction the mark approaches it.
        let best = { d: Infinity, u: { x: 0, y: 0 } };
        const g = e.geometry;
        for (let i = 0; i + 1 < g.length; i++) {
          const L = Math.hypot(g[i + 1][0] - g[i][0], g[i + 1][1] - g[i][1]);
          const dd = polyDist([g[i], g[i + 1]], c);
          if (dd < best.d) best = { d: dd, u: { x: (g[i + 1][0] - g[i][0]) / L, y: (g[i + 1][1] - g[i][1]) / L } };
        }
        const toCrossing = { x: c.x - row.params.x, y: c.y - row.params.y };
        const sign = toCrossing.x * best.u.x + toCrossing.y * best.u.y >= 0 ? 1 : -1;
        expect(angleDeg({ x: f.end.ux, y: f.end.uy }, { x: sign * best.u.x, y: sign * best.u.y })).toBeLessThan(2);
        // The mark is on the crossing's street (its line — the row starts on the
        // bayed segment before this edge), short of the crossing.
        const lateral = Math.abs(toCrossing.x * best.u.y - toCrossing.y * best.u.x);
        expect(lateral).toBeLessThan(2 * HALF_LANE_M + 0.1);
        expect(toCrossing.x * f.end.ux + toCrossing.y * f.end.uy).toBeGreaterThan(0);
        // The template names the row's end at this crossing, in its own words.
        expect(
          (row.spec.instructionsBg ?? []).some((i) => i.textBg.includes("В края на редицата, на самата пешеходна пътека")),
        ).toBe(true);
      } else if ("actor" in a) {
        // A feature that travels with the car: the actor's own path runs past
        // the next goal's far edge, so round 3's region (which ends there) is
        // the tighter bound and the feature never ends inside it.
        expect(f.end.kind).toBe("goal");
        const ev = (row.spec.staged ?? []).find((s) => s.id === a.actor.id) as
          | { kind: string; actor: { pathNodes: string[] } }
          | undefined;
        expect(ev).toBeDefined();
        expect(["brakingLeadCar", "cutInLeadCar"]).toContain(ev!.kind);
        const d = district(row.spec.map.districtId);
        const endNode = d.roads.nodes.find((n) => n.id === ev!.actor.pathNodes[ev!.actor.pathNodes.length - 1])!;
        for (const r of ROWS.filter((x) => x.id === id)) {
          const g = goalOf(r.next!)!;
          const gx = g.x - r.params.x;
          const gy = g.y - r.params.y;
          const gn = Math.hypot(gx, gy);
          const ux = gx / gn;
          const uy = gy / gn;
          const nodeAhead = (endNode.x - r.params.x) * ux + (endNode.y - r.params.y) * uy;
          expect(nodeAhead).toBeGreaterThan(gn + g.r);
        }
      } else if ("condition" in a) {
        expect(f.end.kind).toBe("goal");
        if (a.condition === "crosswind") {
          expect(row.spec.physics?.crosswind).toBe(true);
          for (const l of row.spec.levels) expect(l.physics?.crosswind).not.toBe(false);
        } else {
          expect(row.spec.conditions?.night).toBe(true);
          for (const l of row.spec.levels) expect(l.conditions?.night).not.toBe(false);
        }
        expect(row.next).toBeDefined();
      } else {
        expect(f.end.kind).toBe("goal");
        expect(row.next).toBeDefined();
      }
    });
  }
});

describe("THE CENSUS — every capped objective's feature", () => {
  it("every flow-capped objective on every practice rung resolves to a named feature or to its own zone, and the table has no stale row", () => {
    const used = new Set<string>();
    const out: string[] = ["template\tobjective\trung\tshown\tfeature\tend"];
    for (const r of ROWS) {
      const f = taskCapFeatureFor(r.id);
      if (f !== undefined) used.add(r.id);
      const end =
        f === undefined
          ? `zone r${r.params.radiusM}`
          : f.end.kind === "gate"
            ? `gate (${f.end.x.toFixed(1)},${f.end.y.toFixed(1)})→(${f.end.ux.toFixed(2)},${f.end.uy.toFixed(2)})`
            : f.end.kind === "area"
              ? `area r${f.end.radiusM.toFixed(2)}`
              : "the next goal";
      out.push(`${r.spec.id}\t${r.id}\tL${r.level}\t${r.shown}\t${f?.named ?? "zone"}\t${end}`);
    }
    expect([...used].sort()).toEqual(Object.keys(TASK_CAP_FEATURES).sort());
    const dir = process.env.FEATURE_CENSUS_OUT;
    if (dir && existsSync(dir)) writeFileSync(path.join(dir, "feature-census.tsv"), out.join("\n") + "\n");
    expect(ROWS.length).toBeGreaterThan(400);
  });
});
