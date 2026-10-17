/**
 * sc-sig-controller-postures:4f446777 [major] — «ambient pavement walkers walk off the kerb into the junction».
 *
 * WHAT WAS FILED. On the регулировчик drill (sx-v1) a pavement walker of the east arm walked from the kerb out to
 * x = 0.03 — the N-S centre line, beside the officer — and back, t 97.7–118.6, through the northbound lane the student
 * is told to drive on «proceed»; the rig car passed him at 0.4 m (debrief: «пешеходец — на 0.4 м»). A second walker did
 * the same on the west arm. The cause: `buildPedSidewalkRoute` offset the edge's centre line from s = 0 — the NODE, the
 * middle of the crossing road — and nothing trimmed it, while the file's own header promised «no carriageway span
 * anywhere in it».
 *
 * WHAT IS PINNED HERE.
 *   1. THE NUMBER IS THE WORLD'S: on every committed district, at every junction end of every edge the world draws a
 *      pavement on, the walker's beat starts exactly where `analyzeNetwork` + `roads.ts` start the pavement strip
 *      (junction cut + `sidewalkEndInsetM`). One source; no constant of this lane's.
 *   2. sx-v1, the live scene's config for the drill (anchor at the spawn, the compiled rung's traffic, the live sidewalk
 *      budget), stepped 130 s at 1/60: no ambient walker centre is ever on a carriageway — inside any edge's kerb band
 *      between its end cross-sections, or inside a junction box — and none stands inside the junction cut of its own
 *      edge. At base: 3,534 walker-steps on a carriageway at L1.
 *   3. THE CATALOGUE: every distinct live traffic config of every scenario template at every rung (158), 130 s each —
 *      no PAVEMENT walker on a carriageway anywhere. At base 74 of 158 configs had one. The CROSSING
 *      walkers' pavement legs are a different route builder with a graded segment and are not this lane's: the two
 *      configs where one stands on a carriageway (d2-v1, the L5 rungs that seed crossing walkers) are pinned BY NAME
 *      so the set can only shrink deliberately.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../runtime";
import { compileScenario } from "../../lessons/scenario/compile";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import type { ScenarioLevel } from "../../lessons/scenario/types";
import { analyzeNetwork } from "../../world/builders/network";
import { sidewalkEndInsetM } from "../../world/builders/constants";
import { polylineLength } from "../../world/builders/math2d";
import type { District as WorldDistrict } from "../../world/types";
import { ambientSidewalkBudget, pedPavementSpan, pedPavementWorld, pedOnOtherCarriageway } from "../pedestrians";
import { createTrafficSystem } from "../system";
import { DEFAULT_TRAFFIC_CONFIG, type DistrictEdge, type TrafficDistrict } from "../types";
import { STAGED_STATE_ID_BASE } from "../staged";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const LANE_W = DEFAULT_TRAFFIC_CONFIG.laneWidthM;
const TIMEOUT = 600_000;

function loadWorld(id: string): TrafficDistrict & { roads: { edges: DistrictEdge[] } } {
  return JSON.parse(readFileSync(path.join(WORLD, `${id}.json`), "utf-8"));
}

interface Spawn {
  x: number;
  y: number;
}

/** The live scene's traffic for a compiled rung (LessonScene / liveChainReplay `buildLiveWorld`). */
function liveTraffic(raw: TrafficDistrict, lesson: ReturnType<typeof compileScenario>) {
  const pts = ((raw as { spawnPoints?: Array<{ id: string; x: number; y: number }> }).spawnPoints ?? []);
  const sp = lesson.spawn as { pointId?: string; position?: Spawn };
  const p = sp.pointId ? pts.find((s) => s.id === sp.pointId) : undefined;
  const anchor = { x: p?.x ?? sp.position?.x ?? 0, y: p?.y ?? sp.position?.y ?? 0 };
  const t = (lesson.traffic ?? {}) as {
    anchorRadiusM?: number;
    anchorPath?: Spawn[];
    vehicleCount?: number;
    pedestrianCount?: number;
    sidewalkPedestrianCount?: number;
  };
  const traffic = createTrafficSystem(raw, {
    anchor,
    anchorRadiusM: t.anchorRadiusM ?? 280,
    anchorPath: t.anchorPath,
    vehicleCount: t.vehicleCount ?? 26,
    pedestrianCount: t.pedestrianCount ?? 20,
    sidewalkPedestrianCount:
      t.sidewalkPedestrianCount ??
      ambientSidewalkBudget(raw, DEFAULT_TRAFFIC_CONFIG.footwaylessRoadClasses, LANE_W),
  } as never);
  return { traffic, anchor };
}

/** Steps on which an ambient walker centre stands on another edge's carriageway or in a junction box, by walker kind. */
function walkCarriageway(raw: TrafficDistrict & { roads: { edges: DistrictEdge[] } }, lesson: ReturnType<typeof compileScenario>, secs: number) {
  const runtime = createWorldRuntime(raw);
  const { traffic, anchor } = liveTraffic(raw, lesson);
  const world = pedPavementWorld(raw.roads.edges, LANE_W);
  const agents = (traffic as unknown as {
    pedestrianAgents: Array<{ state: { id: number }; route: { segments: Array<{ kind: string }> } }>;
  }).pedestrianAgents;
  const crossing = new Set(agents.filter((a) => a.route.segments.some((s) => s.kind === "cross")).map((a) => a.state.id));
  let pavement = 0;
  let crossingLegs = 0;
  for (let k = 1; k <= secs * 60; k++) {
    runtime.update(1 / 60);
    traffic.update(1 / 60, {
      signalPhase: (id) => runtime.signalPhase(id),
      ambientSignal: (id, b, f) => runtime.ambientSignalPhase(id, b, f),
      playerPos: anchor,
      playerSpeedKmh: 0,
      playerHeadingDeg: 0,
    });
    for (const p of traffic.pedestrians) {
      if (p.id >= STAGED_STATE_ID_BASE || p.onCrossing) continue;
      // "" = no own edge: a walker is checked against EVERY carriageway here.
      if (!pedOnOtherCarriageway(world, "", p.x, p.y)) continue;
      if (crossing.has(p.id)) crossingLegs++;
      else pavement++;
    }
  }
  return { pavement, crossingLegs, walkers: agents.length };
}

describe("a pavement walker's beat ends where the world's pavement does (4f446777)", () => {
  it("on every committed district, at every junction end, the beat starts at the drawn pavement strip's start", () => {
    let checked = 0;
    for (const f of readdirSync(WORLD).filter((x) => x.endsWith(".json")).sort()) {
      const raw = JSON.parse(readFileSync(path.join(WORLD, f), "utf-8")) as WorldDistrict & {
        roads: { edges: DistrictEdge[] };
      };
      const net = analyzeNetwork(raw);
      const world = pedPavementWorld(raw.roads.edges, LANE_W);
      for (const eb of net.edges) {
        const e = eb.edge as unknown as DistrictEdge;
        const total = polylineLength(e.geometry as [number, number][]);
        const span = pedPavementSpan(e, total, world.edgesAtNode);
        const lineLen = eb.line ? polylineLength(eb.line) : 0;
        const fromJunction = (world.edgesAtNode.get(e.from) ?? []).length >= 3;
        const toJunction = (world.edgesAtNode.get(e.to) ?? []).length >= 3;
        if (!fromJunction && !toJunction) {
          expect(span, `${f} ${e.id}`).toEqual({ fromS: 0, toS: total });
          continue;
        }
        if (eb.line === null || !(lineLen > 6)) {
          expect(span, `${f} ${e.id}: the world draws no pavement here`).toBeNull();
          continue;
        }
        const inset = sidewalkEndInsetM(lineLen);
        if (fromJunction) expect(span!.fromS, `${f} ${e.id} from`).toBeCloseTo(eb.trimFrom + inset, 6);
        if (toJunction) expect(span!.toS, `${f} ${e.id} to`).toBeCloseTo(total - eb.trimTo - inset, 6);
        checked++;
      }
    }
    expect(checked).toBe(499); // junction-ended edges with a drawn pavement, 106 districts (measured)
  }, TIMEOUT);

  it("sx-v1 (the регулировчик drill, live config): no ambient walker on a carriageway or inside its own junction cut, 130 s at 1/60", () => {
    const raw = loadWorld("sx-v1");
    const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-sig-controller-postures")!;
    for (const L of [1, 3] as ScenarioLevel[]) {
      const lesson = compileScenario(spec, L);
      const runtime = createWorldRuntime(raw);
      const { traffic, anchor } = liveTraffic(raw, lesson);
      const world = pedPavementWorld(raw.roads.edges, LANE_W);
      const walkers = traffic.pedestrians.filter((p) => p.id < STAGED_STATE_ID_BASE);
      expect(walkers.length, `L${L}`).toBeGreaterThanOrEqual(4);
      let onCarriageway = 0;
      let insideCut = 0;
      // sx-v1's four arms meet at sx-n-c (0, 0): the widest arm is the N-S secondary (kerb half 12.125 m) and the
      // junction is arterial, so the world cuts every arm at 12.125 + 15 = 27.125 m and starts the pavement 1.2 m
      // further out (sidewalkEndInsetM). A walker centre nearer the node than that along its own arm is in the cut.
      const span = pedPavementSpan(raw.roads.edges.find((e) => e.id === "sx-e-e")!, 120, world.edgesAtNode)!;
      expect(span.fromS).toBeCloseTo(28.325, 9);
      for (let k = 1; k <= 130 * 60; k++) {
        runtime.update(1 / 60);
        traffic.update(1 / 60, {
          signalPhase: (id) => runtime.signalPhase(id),
          ambientSignal: (id, b, f) => runtime.ambientSignalPhase(id, b, f),
          playerPos: anchor,
          playerSpeedKmh: 0,
          playerHeadingDeg: 0,
        });
        for (const p of traffic.pedestrians) {
          if (p.id >= STAGED_STATE_ID_BASE) continue;
          if (pedOnOtherCarriageway(world, "", p.x, p.y)) onCarriageway++;
          const alongEw = Math.abs(p.y) < 12.125 + 4 ? Math.abs(p.x) : Infinity;
          const alongNs = Math.abs(p.x) < 12.125 + 4 ? Math.abs(p.y) : Infinity;
          if (Math.min(alongEw, alongNs) < span.fromS - 1e-6) insideCut++;
        }
      }
      expect(onCarriageway, `L${L}: walker steps on a carriageway`).toBe(0);
      expect(insideCut, `L${L}: walker steps inside the junction cut`).toBe(0);
    }
  }, TIMEOUT);

  it("the catalogue: no PAVEMENT walker on a carriageway in any live traffic config; crossing-walker legs pinned by name", () => {
    const seen = new Set<string>();
    const crossingOffenders: string[] = [];
    const pavementOffenders: string[] = [];
    let configs = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      const raw = loadWorld(spec.map.districtId);
      for (const L of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        let lesson;
        try {
          lesson = compileScenario(spec, L);
        } catch {
          continue;
        }
        const key = JSON.stringify([spec.map.districtId, lesson.spawn, lesson.traffic ?? null]);
        if (seen.has(key)) continue;
        seen.add(key);
        configs++;
        const r = walkCarriageway(raw, lesson, 130);
        if (r.pavement > 0) pavementOffenders.push(`${spec.id}/L${L} (${spec.map.districtId}): ${r.pavement}`);
        if (r.crossingLegs > 0) crossingOffenders.push(`${spec.id}/L${L}`);
      }
    }
    expect(configs).toBeGreaterThan(150);
    expect(pavementOffenders).toEqual([]);
    // OWED, not this lane's (see header): crossing walkers on d2-v1's divided roads.
    expect(crossingOffenders.sort()).toEqual(["sc-ed-d2-city-run/L5", "sc-ed-d2-priority-run/L5"]);
  }, 3_600_000);
});
