/**
 * B1b — property tests over the WHOLE exam bank (doc 72 §16 contract).
 *
 * Strategy (documented, so the coverage story is honest):
 *  - The distinctness/budget/id-codec properties run over EVERY variant —
 *    they are pure arithmetic over the authored slot tables (cheap).
 *  - The geometric properties (routes drivable, официален protocol counts,
 *    staged specs valid against district-v1.json) run over every SHELL ×
 *    every SLOT OPTION — the variant space is the cartesian product of
 *    exactly these parts, so validating the parts validates every variant
 *    without building 40k+ LessonSpecs.
 *  - Full spec construction + engine parse (createLessonSession) runs on a
 *    seeded 100-variant sample + every shell's first/last assignment, each
 *    generated twice for the determinism (deep-equal) law.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  AmberDilemmaSpec,
  BrakingLeadCarSpec,
  CyclistRightHookSpec,
  PedestrianDartOutSpec,
  PriorityFromRightSpec,
  RoundaboutEntrySpec,
  StagedEventSpec,
} from "../../contracts";
import { createWorldRuntime } from "../../runtime";
import { createLessonSession } from "../engine";
import {
  EXAM_BANK_SIZE,
  EXAM_MAX_TERMINAL_ENCOUNTERS,
  EXAM_MIN_TERMINAL_ENCOUNTERS,
  allExamVariantIds,
  drawExamVariantId,
  examShellAssignmentCount,
  examVariantById,
  examVariantDistinctnessKey,
  generateExamVariant,
  isExamVariantId,
  parseExamVariantId,
} from "../examBank";
import { EXAM_CONDITIONS, EXAM_SHELLS, TASHEV_BAY } from "../examBankData";
import { gradeFinishWire } from "../wire";

// ---------------------------------------------------------------------------
// District fixtures (raw JSON — the same source exam-spec.test.ts trusts)
// ---------------------------------------------------------------------------

interface RawNode {
  id: string;
  x: number;
  y: number;
}
interface RawEdge {
  id: string;
  from: string;
  to: string;
  oneway: boolean;
  geometry: Array<[number, number]>;
}
interface RawDistrict {
  roads: { nodes: RawNode[]; edges: RawEdge[] };
  intersections: Array<{ id: string; signalized: boolean }>;
  crossings: Array<{ id: string; x: number; y: number; kind: string }>;
  roundabouts: Array<{ id: string; x: number; y: number; radius: number }>;
  spawnPoints: Array<{ id: string; x: number; y: number; heading: number }>;
}

const district = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../../../../content/world/district-v1.json", import.meta.url)),
    "utf8",
  ),
) as RawDistrict;

const nodeById = new Map(district.roads.nodes.map((n) => [n.id, n]));
const signalizedIds = new Set(
  district.intersections.filter((i) => i.signalized).map((i) => i.id),
);

/** Directed pair → (edge, forward?) honoring oneways. */
const edgeByPair = new Map<string, { edge: RawEdge; fwd: boolean }>();
for (const e of district.roads.edges) {
  edgeByPair.set(`${e.from}|${e.to}`, { edge: e, fwd: true });
  if (!e.oneway) edgeByPair.set(`${e.to}|${e.from}`, { edge: e, fwd: false });
}

function edgeLen(geom: ReadonlyArray<readonly [number, number]>): number {
  let L = 0;
  for (let i = 0; i < geom.length - 1; i++) {
    L += Math.hypot(geom[i + 1][0] - geom[i][0], geom[i + 1][1] - geom[i][1]);
  }
  return L;
}

/** rb-1's ring nodes — turns INSIDE the ring don't count as завои. */
const RING_NODES = new Set([
  "n707684255",
  "n707684256",
  "n279646956",
  "n279646958",
  "n1038574156",
  "n1038574251",
]);

/** Stop-guarded junction ids from the PRODUCTION stop-line derivation. */
const runtime = createWorldRuntime(district as unknown as Parameters<typeof createWorldRuntime>[0]);
const stopLines = (
  runtime as unknown as {
    debugStopLines(): Array<{
      id: string;
      sM: number;
      control: "trafficLight" | "stopSign";
      junctionNodeId: string;
    }>;
  }
).debugStopLines();
const stopGuardedJunctions = new Set(
  stopLines.filter((l) => l.control === "stopSign").map((l) => l.junctionNodeId),
);
/** Б2 OR Б1 — both are posted control, both count as a regulated pass (audit
 *  C-4 split the two; counting only Б2 would undercount the официален protocol
 *  the moment a junction is correctly demoted to a give-way). */
const signGuardedJunctions = new Set(
  stopLines.filter((l) => l.control !== "trafficLight").map((l) => l.junctionNodeId),
);

interface RouteLeg {
  fromId: string;
  toId: string;
  geom: Array<[number, number]>;
  lenM: number;
}

function legsOf(routeNodes: readonly string[]): RouteLeg[] {
  const legs: RouteLeg[] = [];
  for (let i = 0; i < routeNodes.length - 1; i++) {
    const rec = edgeByPair.get(`${routeNodes[i]}|${routeNodes[i + 1]}`);
    expect(rec, `route leg not drivable: ${routeNodes[i]} → ${routeNodes[i + 1]}`).toBeDefined();
    const geom = rec!.fwd ? rec!.edge.geometry : [...rec!.edge.geometry].reverse();
    legs.push({
      fromId: routeNodes[i],
      toId: routeNodes[i + 1],
      geom: geom.map((p) => [p[0], p[1]]),
      lenM: edgeLen(geom),
    });
  }
  return legs;
}

function bearingDeg(dx: number, dy: number): number {
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Signed heading delta at every internal route node (out − in, −180..180). */
function turnDeltas(legs: RouteLeg[]): Array<{ node: string; delta: number }> {
  const out: Array<{ node: string; delta: number }> = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const gIn = legs[i].geom;
    const gOut = legs[i + 1].geom;
    const inB = bearingDeg(
      gIn[gIn.length - 1][0] - gIn[gIn.length - 2][0],
      gIn[gIn.length - 1][1] - gIn[gIn.length - 2][1],
    );
    const outB = bearingDeg(gOut[1][0] - gOut[0][0], gOut[1][1] - gOut[0][1]);
    let delta = outB - inB;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    out.push({ node: legs[i].toId, delta });
  }
  return out;
}

function distToPolyline(
  x: number,
  y: number,
  geom: ReadonlyArray<readonly [number, number]>,
): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < geom.length - 1; i++) {
    const ax = geom[i][0];
    const ay = geom[i][1];
    const bx = geom[i + 1][0];
    const by = geom[i + 1][1];
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

// ---------------------------------------------------------------------------
// 1. Bank arithmetic, distinctness contract, id codec
// ---------------------------------------------------------------------------

describe("exam bank — the distinctness contract (doc 72 §16)", () => {
  it("holds ≥ 1000 honestly distinct variants (report: the true count)", () => {
    // The key encodes exactly the four contract axes: shell × conditions ×
    // slot-archetype assignment × parameter tier. Jitter appears nowhere.
    const ids = allExamVariantIds();
    expect(ids.length).toBe(EXAM_BANK_SIZE);
    const keys = new Set(ids.map((id) => examVariantDistinctnessKey(id)));
    // No two variants may collapse to the same pedagogical exam…
    expect(keys.size).toBe(EXAM_BANK_SIZE);
    // …and the bank clears the founder's floor with real margin. The exact
    // size is reported through the assertion below so a data edit that
    // silently shrinks the bank fails loudly, with the number in the diff.
    expect(
      keys.size,
      `true distinct-variant count: ${keys.size} (shells: ${EXAM_SHELLS.map(
        (s) => `${s.code}=${examShellAssignmentCount(s.code)}`,
      ).join(" ")} × ${EXAM_CONDITIONS.length} conditions)`,
    ).toBeGreaterThanOrEqual(1000);
  });

  it("enforces the опасна-exposure budget on every assignment (independent oracle)", () => {
    for (const shell of EXAM_SHELLS) {
      const radices = shell.slots.map((s) => s.options.length);
      let valid = 0;
      const digits = radices.map(() => 0);
      for (;;) {
        let terminal = 0;
        for (let i = 0; i < digits.length; i++) {
          if (shell.slots[i].options[digits[i]].terminal) terminal++;
        }
        if (
          terminal >= EXAM_MIN_TERMINAL_ENCOUNTERS &&
          terminal <= EXAM_MAX_TERMINAL_ENCOUNTERS
        ) {
          valid++;
        }
        let i = digits.length - 1;
        while (i >= 0) {
          digits[i]++;
          if (digits[i] < radices[i]) break;
          digits[i] = 0;
          i--;
        }
        if (i < 0) break;
      }
      expect(valid, `shell ${shell.code}`).toBe(examShellAssignmentCount(shell.code));
      expect(valid).toBeGreaterThan(0);
      expect(valid).toBeLessThanOrEqual(9999); // the 4-digit id contract
    }
  });

  it("every shell defines 4–6 slots, option 0 is always the empty slot", () => {
    for (const shell of EXAM_SHELLS) {
      expect(shell.slots.length, `shell ${shell.code}`).toBeGreaterThanOrEqual(4);
      expect(shell.slots.length, `shell ${shell.code}`).toBeLessThanOrEqual(6);
      for (const slot of shell.slots) {
        expect(slot.options[0].key).toBe("none");
        expect(slot.options[0].terminal).toBe(false);
        expect(slot.options[0].build).toBeNull();
        // tier keys unique within the slot (distinctness key soundness)
        const keys = slot.options.map((o) => o.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    }
  });

  it("id codec: parse ∘ format = identity; junk ids reject", () => {
    for (const shell of EXAM_SHELLS) {
      const count = examShellAssignmentCount(shell.code);
      const id = `EX-${shell.code}-N2-${String(count - 1).padStart(4, "0")}`;
      expect(parseExamVariantId(id)).toEqual({
        shellCode: shell.code,
        conditionCode: "N2",
        assignmentIndex: count - 1,
      });
      // one past the end of the shell's assignment space
      expect(parseExamVariantId(`EX-${shell.code}-N2-${String(count).padStart(4, "0")}`)).toBeNull();
    }
    expect(isExamVariantId("ex-a-d1-0000")).toBe(true); // case-insensitive paste
    expect(isExamVariantId("EX-Z-D1-0000")).toBe(false);
    expect(isExamVariantId("EX-A-D3-0000")).toBe(false);
    expect(isExamVariantId("EX-A-D1-000")).toBe(false);
    expect(isExamVariantId("lex-exam-1")).toBe(false);
    expect(examVariantById("EX-Z-D1-0000")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Route shells — официален protocol, machine-verified (doc 72 §1)
// ---------------------------------------------------------------------------

describe("exam bank — route shells vs the real district", () => {
  for (const shell of EXAM_SHELLS) {
    describe(`shell ${shell.code} („${shell.nameBg}")`, () => {
      const legs = legsOf(shell.routeNodes);
      const deltas = turnDeltas(legs);
      const totalLen = legs.reduce((s, l) => s + l.lenM, 0);

      it("route is connected and drivable (oneways honored) — legsOf asserted", () => {
        expect(legs.length).toBe(shell.routeNodes.length - 1);
      });

      it("spawn sits on the opening leg", () => {
        let x: number;
        let y: number;
        if (shell.spawn.pointId) {
          const p = district.spawnPoints.find((s) => s.id === shell.spawn.pointId);
          expect(p, `spawn point ${shell.spawn.pointId}`).toBeDefined();
          x = p!.x;
          y = p!.y;
        } else {
          expect(shell.spawn.position).toBeDefined();
          x = shell.spawn.position!.x;
          y = shell.spawn.position!.y;
        }
        const d = Math.min(
          ...legs.slice(0, 3).map((l) => distToPolyline(x, y, l.geom)),
        );
        // ≤ 7 m: centerline spawns are exact; explicit spawns sit at the
        // scaled right-lane center (~4.1 m off the centerline).
        expect(d).toBeLessThan(7);
      });

      it("официален protocol: ≥5 right + ≥5 left turns (ring interior excluded)", () => {
        const turns = deltas.filter((t) => !RING_NODES.has(t.node));
        const rights = turns.filter((t) => t.delta >= 30 && t.delta <= 150);
        const lefts = turns.filter((t) => t.delta <= -30 && t.delta >= -150);
        expect(rights.length, `rights: ${rights.map((t) => t.node).join(",")}`).toBeGreaterThanOrEqual(5);
        expect(lefts.length, `lefts: ${lefts.map((t) => t.node).join(",")}`).toBeGreaterThanOrEqual(5);
      });

      it("официален protocol: contains an обратен завой (bearing reversal ≤ 450 m)", () => {
        const samples: Array<{ s: number; b: number }> = [];
        let s = 0;
        for (const l of legs) {
          const g = l.geom;
          samples.push({
            s,
            b: bearingDeg(g[g.length - 1][0] - g[0][0], g[g.length - 1][1] - g[0][1]),
          });
          s += l.lenM;
        }
        let uturn = false;
        outer: for (let i = 0; i < samples.length; i++) {
          for (let j = i + 1; j < samples.length; j++) {
            if (samples[j].s - samples[i].s > 450) break;
            let d = Math.abs(samples[j].b - ((samples[i].b + 180) % 360));
            if (d > 180) d = 360 - d;
            if (d <= 30) {
              uturn = true;
              break outer;
            }
          }
        }
        expect(uturn).toBe(true);
      });

      it("официален protocol: ≥3 regulated-junction passes", () => {
        let regulated = 0;
        for (let i = 1; i < shell.routeNodes.length; i++) {
          const n = shell.routeNodes[i];
          if (signalizedIds.has(n) || signGuardedJunctions.has(n)) regulated++;
          // roundabout entry = a give-way (Б1) regulated mouth
          if (RING_NODES.has(n) && !RING_NODES.has(shell.routeNodes[i - 1])) regulated++;
        }
        expect(regulated).toBeGreaterThanOrEqual(3);
      });

      it("route length matches the official in-town analog (2–4.5 km)", () => {
        expect(totalLen).toBeGreaterThanOrEqual(2000);
        expect(totalLen).toBeLessThanOrEqual(4500);
      });

      it("парking element: the bay sits beside the final legs, sane rect", () => {
        const bay = shell.bayRef === "l7" ? { x: 681.26, y: -199.54 } : shell.bayRef;
        const tail = legs.slice(-2);
        const d = Math.min(...tail.map((l) => distToPolyline(bay.x, bay.y, l.geom)));
        expect(d).toBeLessThan(16); // curbside offset within the scaled street
        if (shell.bayRef !== "l7") {
          expect(shell.bayRef.widthM).toBeGreaterThan(0);
          expect(shell.bayRef.lengthM).toBeGreaterThan(0);
        }
      });

      it("every slot approach is a consecutive pair of the route", () => {
        const pairs = new Set(
          shell.routeNodes.slice(0, -1).map((n, i) => `${n}|${shell.routeNodes[i + 1]}`),
        );
        for (const slot of shell.slots) {
          if (!slot.approach) continue;
          expect(
            pairs.has(`${slot.approach[0]}|${slot.approach[1]}`),
            `${slot.id}: approach ${slot.approach.join(" → ")} not on route`,
          ).toBe(true);
        }
      });

      it("objective anchors: unique ids, zones on drivable roads, signals real", () => {
        const ids = shell.objectives.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const o of shell.objectives) {
          if (o.kind === "reachZone") {
            const p = o.params as { x: number; y: number; radiusM: number };
            const d = Math.min(...legs.map((l) => distToPolyline(p.x, p.y, l.geom)));
            expect(d, `${o.id}: nearest route leg ${d.toFixed(1)} m`).toBeLessThan(p.radiusM - 4);
          }
          if (o.kind === "passSignal") {
            const p = o.params as { nodeId: string; x: number; y: number; control: string };
            const node = nodeById.get(p.nodeId);
            expect(node, `${o.id}: node missing`).toBeDefined();
            expect(Math.hypot(node!.x - p.x, node!.y - p.y)).toBeLessThan(1.5);
            expect(shell.routeNodes).toContain(p.nodeId);
            if (p.control === "trafficLight") {
              expect(signalizedIds.has(p.nodeId), `${o.id}: not signalized`).toBe(true);
            } else {
              expect(stopGuardedJunctions.has(p.nodeId), `${o.id}: no stop line`).toBe(true);
            }
          }
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Staged slot options — every option geometrically valid
// ---------------------------------------------------------------------------

function everyBuiltOption(): Array<{ shellCode: string; slotId: string; spec: StagedEventSpec }> {
  const out: Array<{ shellCode: string; slotId: string; spec: StagedEventSpec }> = [];
  for (const shell of EXAM_SHELLS) {
    for (const slot of shell.slots) {
      for (const option of slot.options) {
        if (option.build === null) continue;
        out.push({ shellCode: shell.code, slotId: slot.id, spec: option.build(slot.id) });
      }
    }
  }
  return out;
}

describe("exam bank — staged slot options vs the district", () => {
  const options = everyBuiltOption();

  it("actor paths: nodes exist, consecutive pairs drivable (oneways honored)", () => {
    for (const { slotId, spec } of options) {
      if (!("actor" in spec)) continue;
      const nodes = spec.actor.pathNodes;
      for (const id of nodes) {
        expect(nodeById.has(id), `${slotId}: node ${id} missing`).toBe(true);
      }
      for (let i = 0; i < nodes.length - 1; i++) {
        expect(
          edgeByPair.has(`${nodes[i]}|${nodes[i + 1]}`),
          `${slotId}: ${nodes[i]} → ${nodes[i + 1]} not drivable`,
        ).toBe(true);
      }
    }
  });

  it("priority events pin real junctions, junction node on the actor path, sane arms", () => {
    for (const { slotId, spec } of options) {
      if (spec.kind !== "priorityFromRight") continue;
      const s = spec as PriorityFromRightSpec;
      const node = nodeById.get(s.junction.nodeId);
      expect(node, `${slotId}: junction missing`).toBeDefined();
      expect(Math.hypot(node!.x - s.junction.x, node!.y - s.junction.y)).toBeLessThan(1.5);
      expect(s.actor.pathNodes[s.junctionNodeIndex]).toBe(s.junction.nodeId);
      expect(s.armDistM).toBeGreaterThan(30);
      expect(s.armDistM).toBeLessThan(200);
      // the dormant hold must stay on the authored path (never before its
      // start): upstream arc from the junction node covers the hold offset
      if (s.actor.hold.offsetM < 0) {
        let upstream = 0;
        for (let i = 0; i < s.actor.hold.nodeIndex; i++) {
          const rec = edgeByPair.get(`${s.actor.pathNodes[i]}|${s.actor.pathNodes[i + 1]}`)!;
          upstream += edgeLen(rec.edge.geometry);
        }
        expect(upstream, `${slotId}: hold ${s.actor.hold.offsetM} m`).toBeGreaterThanOrEqual(
          -s.actor.hold.offsetM,
        );
      }
    }
  });

  it("dart-outs: real crossings, unit dart through the crossing, road span inside the walk", () => {
    for (const { slotId, spec } of options) {
      if (spec.kind !== "pedestrianDartOut") continue;
      const s = spec as PedestrianDartOutSpec;
      const crossing = district.crossings.find((c) => c.id === s.crossingId);
      expect(crossing, `${slotId}: crossing ${s.crossingId} missing`).toBeDefined();
      expect(Math.hypot(crossing!.x - s.crossing.x, crossing!.y - s.crossing.y)).toBeLessThan(1);
      expect(Math.hypot(s.dir.x, s.dir.y)).toBeCloseTo(1, 2);
      const toCrossing = Math.hypot(s.start.x - s.crossing.x, s.start.y - s.crossing.y);
      const walkX = s.start.x + toCrossing * s.dir.x;
      const walkY = s.start.y + toCrossing * s.dir.y;
      expect(Math.hypot(walkX - s.crossing.x, walkY - s.crossing.y)).toBeLessThan(0.35);
      expect(s.roadFromM).toBeGreaterThan(0);
      expect(s.roadFromM).toBeLessThan(s.roadToM);
      expect(s.roadToM).toBeLessThan(s.travelM);
      expect(s.speedMps).toBeGreaterThan(0.5);
      expect(s.speedMps).toBeLessThan(4);
    }
  });

  it("braking lead cars: slam point ON the actor path, no ball visual in exam mode", () => {
    for (const { slotId, spec } of options) {
      if (spec.kind !== "brakingLeadCar") continue;
      const s = spec as BrakingLeadCarSpec;
      expect(s.triggersHazard, `${slotId}: exam corridors use brake lights only`).toBe(false);
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < s.actor.pathNodes.length - 1; i++) {
        const rec = edgeByPair.get(`${s.actor.pathNodes[i]}|${s.actor.pathNodes[i + 1]}`)!;
        const geom = rec.fwd ? rec.edge.geometry : [...rec.edge.geometry].reverse();
        best = Math.min(best, distToPolyline(s.slamAt.x, s.slamAt.y, geom));
      }
      expect(best, `${slotId}: slam ${best.toFixed(1)} m off path`).toBeLessThan(2.5);
      expect(s.slamDecelMps2).toBeGreaterThanOrEqual(4);
      expect(s.slamDecelMps2).toBeLessThanOrEqual(9);
    }
  });

  it("cyclist hooks: T-junction real, cyclist path through it", () => {
    for (const { slotId, spec } of options) {
      if (spec.kind !== "cyclistRightHook") continue;
      const s = spec as CyclistRightHookSpec;
      const node = nodeById.get(s.junction.nodeId);
      expect(node, slotId).toBeDefined();
      expect(Math.hypot(node!.x - s.junction.x, node!.y - s.junction.y)).toBeLessThan(1.5);
      expect(s.actor.pathNodes[s.junctionNodeIndex]).toBe(s.junction.nodeId);
      expect(s.actor.cruiseSpeedMps).toBeGreaterThan(3);
      expect(s.actor.cruiseSpeedMps).toBeLessThan(8);
    }
  });

  it("roundabout entries: rb-1 center, entry node at entryNodeIndex, closed loop", () => {
    const rb = district.roundabouts[0];
    for (const { slotId, spec } of options) {
      if (spec.kind !== "roundaboutEntry") continue;
      const s = spec as RoundaboutEntrySpec;
      expect(Math.hypot(rb.x - s.center.x, rb.y - s.center.y), slotId).toBeLessThan(1);
      expect(Math.abs(s.ringRadiusM - rb.radius)).toBeLessThan(1);
      const entryNode = nodeById.get(s.actor.pathNodes[s.entryNodeIndex]);
      expect(entryNode, slotId).toBeDefined();
      expect(Math.hypot(entryNode!.x - s.entry.x, entryNode!.y - s.entry.y)).toBeLessThan(1.5);
      expect(s.actor.loop).toBe(true);
      expect(s.actor.pathNodes[0]).toBe(s.actor.pathNodes[s.actor.pathNodes.length - 1]);
    }
  });

  it("amber dilemmas: signalized node, lineDistM matches the derived stop line (±2.5 m)", () => {
    for (const shell of EXAM_SHELLS) {
      for (const slot of shell.slots) {
        for (const option of slot.options) {
          if (option.build === null) continue;
          const spec = option.build(slot.id);
          if (spec.kind !== "amberDilemma") continue;
          const s = spec as AmberDilemmaSpec;
          expect(signalizedIds.has(s.signalNodeId), slot.id).toBe(true);
          const node = nodeById.get(s.signalNodeId);
          expect(Math.hypot(node!.x - s.junction.x, node!.y - s.junction.y)).toBeLessThan(1.5);
          // resolve the player's approach edge from the slot approach pair
          expect(slot.approach, `${slot.id}: amber slots must pin an approach`).toBeDefined();
          const rec = edgeByPair.get(`${slot.approach![0]}|${slot.approach![1]}`)!;
          const total = edgeLen(rec.edge.geometry);
          const line = stopLines.find(
            (l) =>
              l.junctionNodeId === s.signalNodeId &&
              l.control === "trafficLight" &&
              l.id.startsWith(`${rec.edge.id}@`),
          );
          expect(line, `${slot.id}: no light line on ${rec.edge.id}`).toBeDefined();
          const setback = rec.edge.to === s.signalNodeId ? total - line!.sM : line!.sM;
          expect(
            Math.abs(s.lineDistM - setback),
            `${slot.id}: lineDistM ${s.lineDistM} vs derived ${setback.toFixed(2)}`,
          ).toBeLessThan(2.5);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Spec generation — determinism, engine parse, wire round trip
// ---------------------------------------------------------------------------

/** Deterministic 100-variant sample spread over shells × conditions. */
function sampleIds(): string[] {
  const ids: string[] = [];
  for (const shell of EXAM_SHELLS) {
    const count = examShellAssignmentCount(shell.code);
    for (const cond of EXAM_CONDITIONS) {
      // first, last + two mid points of every (shell, condition) cell
      for (const i of [0, count - 1, Math.floor(count / 3), Math.floor((2 * count) / 3)]) {
        ids.push(`EX-${shell.code}-${cond.code}-${String(i).padStart(4, "0")}`);
      }
    }
  }
  return [...new Set(ids)];
}

describe("exam bank — generated specs", () => {
  const ids = sampleIds();

  it(`sample size is honest (${sampleIds().length} ≥ 100 variants)`, () => {
    expect(ids.length).toBeGreaterThanOrEqual(100);
  });

  it("determinism law: generate twice → deep-equal; id is canonical", () => {
    for (const id of ids) {
      const a = generateExamVariant(id);
      const b = generateExamVariant(id);
      expect(b).toEqual(a);
      expect(a.id).toBe(id);
      expect(a.titleBg).toContain(id);
    }
  });

  it("every sampled spec is a real exam: mode flags, cold start, assess pre-drive", () => {
    for (const id of ids) {
      const spec = generateExamVariant(id);
      expect(spec.examMode).toBe(true);
      expect(spec.preDrive).toBe(true);
      expect(spec.preDriveMode).toBe("assess");
      expect(spec.vehicleStart).toBeUndefined();
      expect(spec.unlockAfterLessonId).toBe("l2-intersections");
      expect(spec.parkingBay).toBeDefined();
      expect(spec.environment?.timeOfDay).toBeDefined();
      // staged ids unique; objective ids unique; park objective closes it
      const sIds = (spec.stagedEvents ?? []).map((e) => e.id);
      expect(new Set(sIds).size).toBe(sIds.length);
      const oIds = spec.objectives.map((o) => o.id);
      expect(new Set(oIds).size).toBe(oIds.length);
      const last = spec.objectives.at(-1)!;
      expect(last.params.maneuver).toBe("parkInBay");
      expect(last.params.bay).toBe(spec.parkingBay);
      // budget visible in the artifact itself: 2–3 termination-class specs
      expect((spec.stagedEvents ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("every sampled spec parses into a live session (parseObjectiveParams et al.)", () => {
    for (const id of ids) {
      const session = createLessonSession(generateExamVariant(id));
      expect(session.phase).toBe("preDrive");
      expect(session.objectives.length).toBeGreaterThanOrEqual(10);
    }
  });

  it("Ташев-bay shells park in the painted rect object (single truth)", () => {
    const spec = generateExamVariant("EX-D-D1-0000");
    expect(spec.parkingBay).toBe(TASHEV_BAY);
  });

  it("wire round trip: the server regrades a variant from its id alone", () => {
    for (const id of ids.slice(0, 12)) {
      const spec = generateExamVariant(id);
      const graded = gradeFinishWire({
        lessonId: id,
        startedAtMs: 1_000,
        finishedAtMs: 601_000,
        aborted: false,
        ruleEvents: [{ kind: "violation", code: "RED_LIGHT_CROSSED", t: 42 }],
        objectives: spec.objectives.map((o) => ({ id: o.id, done: false, completedAtSec: null })),
      });
      expect(graded.status).toBe("ok");
      if (graded.status !== "ok") continue;
      expect(graded.lesson.id).toBe(id);
      expect(graded.lesson.examMode).toBe(true);
      // A13 termination rederives server-side: an опасна ends the exam.
      expect(graded.result.examTermination).toEqual({ reason: "dangerous-mistake", tSec: 42 });
      expect(graded.result.passed).toBe(false);
    }
  });

  it("unknown/foreign ids stay unknown on the wire", () => {
    const graded = gradeFinishWire({
      lessonId: "EX-A-D1-9999",
      startedAtMs: 0,
      finishedAtMs: 1000,
      aborted: false,
      ruleEvents: [],
      objectives: [],
    });
    expect(graded.status).toBe("unknown-lesson");
  });
});

// ---------------------------------------------------------------------------
// 5. „Нов изпит" draw
// ---------------------------------------------------------------------------

describe("exam bank — seeded draw", () => {
  it("same seed → same id; ids valid; spread across shells and conditions", () => {
    const shells = new Set<string>();
    const conds = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const id = drawExamVariantId(seed);
      expect(drawExamVariantId(seed)).toBe(id);
      const parsed = parseExamVariantId(id);
      expect(parsed, id).not.toBeNull();
      shells.add(parsed!.shellCode);
      conds.add(parsed!.conditionCode);
    }
    expect(shells.size).toBeGreaterThanOrEqual(5);
    expect(conds.size).toBeGreaterThanOrEqual(4);
  });
});
