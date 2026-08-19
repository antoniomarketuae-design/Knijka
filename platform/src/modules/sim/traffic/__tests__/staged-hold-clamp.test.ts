/**
 * =============================================================================
 * `clampArc` — THE HOLD ARC'S TWO BOUNDS, AND WHY THE INERT ONE STAYS.
 *
 * `createStagedVehicle` resolves a scripted actor's dormant pose as
 * `clampArc(path, path.nodeS[nodeIndex] + offsetM)`. The function has a floor
 * and a ceiling, and an adversarial re-read of the previous wave found the
 * CEILING INERT: delete it and the suite does not notice.
 *
 * ── WHAT WAS MEASURED, 2026-08-19, before anything here was written ────────
 *
 *   · MUTANT `return s < 0 ? 0 : s` (ceiling removed)
 *       traffic + orchestrator ......... 57 files, 549 tests, ALL GREEN
 *   · MUTANT `return s > path.length ? path.length : s` (floor removed)
 *       traffic + orchestrator ......... 57 files, 549 tests, ALL GREEN
 *       whole of src/modules/sim ....... 1 failed / 10,310 passed —
 *         lessons/scenario/__tests__/signals-sweep161.test.ts:234, „the law is
 *         not a check that passes everybody": raw arc −5 m, expected pinned to
 *         0, received −5.
 *   · CATALOGUE SWEEP of every staged actor with a hold that is reachable from
 *     `SCENARIO_TEMPLATES` (`staged` + every level's `stagedAdd`) and
 *     `EXAM_SHELLS`, staged against its own committed district: 113 actors,
 *     113 resolved, **0 high-clamped and 0 low-clamped**.
 *
 * So BOTH bounds are latent in the shipped catalogue; the floor merely happens
 * to have a test 600 files away and the ceiling has none. That is a difference
 * in luck, not in kind, and „an untested defensive branch masking nothing" is
 * one of the four things this programme has already shipped believing it was
 * working code. This file ends it by making the ceiling answer for itself.
 *
 * ── WHY THE BRANCH IS KEPT RATHER THAN DELETED ─────────────────────────────
 *
 * Because `sampleLane` (graph.ts:369) EXTRAPOLATES. It clamps the segment
 * INDEX and never the interpolant: at s > cum[last] it evaluates t > 1 on the
 * final segment and returns a point that marches off the end of the road,
 * forever, in a straight line. Not NaN, not a crash — a perfectly plausible
 * pose, published to the renderer and to every distance check, for a car that
 * is standing in the terrain past the end of its street. §1 proves that from
 * the sampler itself rather than asserting it.
 *
 * The failure that reaches a student is then the audit's own: a conflict actor
 * authored `hold: { nodeIndex: <last>, offsetM: 45 }` — a one-character slip
 * from the `nodeIndex: 0, offsetM: 45` idiom this catalogue writes constantly —
 * holds 45 m off the map, the encounter the lesson is built around never
 * happens, and the seventeen-year-old is handed a green tick for a skill
 * nothing measured. Clamping keeps him on the road at the end of his path,
 * where the reachability battery can still see him; refusing him (returning
 * null, the way an unresolvable path is refused) would delete the encounter
 * outright, which is the same crime with better manners.
 *
 * ── AND §3, WHICH IS THE POINT ─────────────────────────────────────────────
 *
 * A clamp makes an authoring slip SURVIVABLE. It does not make it VISIBLE, and
 * a silently survivable slip is how a lesson ends up grading an encounter that
 * never occurred. §3 re-runs the catalogue sweep above as an assertion, so the
 * day an actor's hold does fall outside its own path, this says so by name
 * instead of parking it quietly at the end of the road.
 * =============================================================================
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXAM_SHELLS } from "../../lessons/examBankData";
import { SCENARIO_TEMPLATES } from "../../lessons/scenario/templates";
import { buildLaneGraph, sampleLane } from "../graph";
import { createStagedVehicle, resolveStagedVehiclePath, type StagedPath } from "../staged";
import { createTrafficSystem } from "../system";
import { DEFAULT_TRAFFIC_CONFIG, type StagedVehicleSpec, type TrafficDistrict } from "../types";
import { makeSquareDistrict } from "./fixtures";

// ---------------------------------------------------------------------------
// Rig — the square fixture's A→B leg, the shortest path with a real length.
// ---------------------------------------------------------------------------

/** The A(0,0)→B(300,0) lane-centre polyline, resolved exactly as system.ts
 *  resolves one (same graph options, same zero curb offset). */
function legAB(): StagedPath {
  const graph = buildLaneGraph(makeSquareDistrict(), {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
  const p = resolveStagedVehiclePath(graph, ["A", "B"], 0);
  expect(p, "the square fixture's A→B leg must resolve").not.toBeNull();
  // The fixture is only worth measuring on if it has a real interior: both
  // bounds below are stated in metres OFF the ends, and a stub path would let
  // „clamped" and „not clamped" agree by being the same point.
  expect(p!.length).toBeGreaterThan(100);
  expect(p!.nodeS[0]).toBe(0);
  expect(p!.nodeS[p!.nodeS.length - 1]).toBeCloseTo(p!.length, 9);
  return p!;
}

function holdAt(p: StagedPath, nodeIndex: number, offsetM: number) {
  const spec: StagedVehicleSpec = {
    kind: "vehicle",
    id: `probe-${nodeIndex}-${offsetM}`,
    pathNodes: ["A", "B"],
    hold: { nodeIndex, offsetM },
    cruiseSpeedMps: 8,
  };
  return createStagedVehicle(spec, p, 1);
}

const out = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
function poseAt(p: StagedPath, s: number): { x: number; y: number } {
  sampleLane(p, s, 0, out);
  return { x: out.x, y: out.y };
}
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------------------
// 1. The ceiling — the bound the mutation showed nothing was watching
// ---------------------------------------------------------------------------

const OVER_M = 40;

describe("clampArc's ceiling holds an over-range actor on its own road", () => {
  it("the sampler really does march off the end — the premise, measured", () => {
    // Stated rather than assumed, because the whole case for keeping the branch
    // rests on it. If sampleLane ever starts clamping its interpolant, this
    // test fails FIRST and the branch below becomes deletable — which is the
    // answer this lane would then owe.
    const p = legAB();
    const end = poseAt(p, p.length);
    const past = poseAt(p, p.length + OVER_M);
    expect(dist(end, past)).toBeCloseTo(OVER_M, 6);
    // …and backwards, symmetrically: the floor guards the same extrapolation.
    const start = poseAt(p, 0);
    const before = poseAt(p, -OVER_M);
    expect(dist(start, before)).toBeCloseTo(OVER_M, 6);
  });

  it("a hold past the end of the path is pinned to the end, not extrapolated", () => {
    const p = legAB();
    const agent = holdAt(p, p.nodeS.length - 1, OVER_M);
    expect(agent.s).toBe(p.length);
    expect(agent.holdS).toBe(p.length);
    // The pose the student would see: on the last metre of the road…
    const end = poseAt(p, p.length);
    expect(dist(agent.state, end)).toBeLessThan(1e-6);
    // …and NOT the 40 m of terrain the unclamped arc names. Asserted as a
    // distance so the test says what the guard is worth, not merely that it
    // fired: without the ceiling this actor stands here.
    expect(dist(agent.state, poseAt(p, p.length + OVER_M))).toBeCloseTo(OVER_M, 6);
  });

  it("a hold before the start of the path is pinned to the start", () => {
    const p = legAB();
    const agent = holdAt(p, 0, -OVER_M);
    expect(agent.s).toBe(0);
    expect(dist(agent.state, poseAt(p, 0))).toBeLessThan(1e-6);
    expect(dist(agent.state, poseAt(p, -OVER_M))).toBeCloseTo(OVER_M, 6);
  });

  it("…and neither bound touches a hold that is inside the path", () => {
    // The false-refusal direction, without which both assertions above are
    // satisfied by `return 0` and by `return path.length`. Four interior holds,
    // including the two ENDS themselves, which the bounds must leave alone.
    const p = legAB();
    for (const [nodeIndex, offsetM, expected] of [
      [0, 0, 0],
      [0, OVER_M, OVER_M],
      [1, -OVER_M, p.length - OVER_M],
      [1, 0, p.length],
    ] as const) {
      const agent = holdAt(p, nodeIndex, offsetM);
      expect(agent.s, `node ${nodeIndex} ${offsetM >= 0 ? "+" : ""}${offsetM} m`).toBeCloseTo(
        expected,
        9,
      );
      expect(dist(agent.state, poseAt(p, expected))).toBeLessThan(1e-6);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The catalogue — the clamp must have nothing to do
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");
const districtCache = new Map<string, TrafficDistrict>();

function district(id: string): TrafficDistrict {
  const hit = districtCache.get(id);
  if (hit) return hit;
  const raw = JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as TrafficDistrict;
  districtCache.set(id, raw);
  return raw;
}

interface Actor {
  owner: string;
  districtId: string;
  hold: { nodeIndex: number; offsetM: number };
  spec: Record<string, unknown>;
}

/**
 * Every hold-carrying actor anywhere under a template, found STRUCTURALLY (an
 * object with a `hold` and a path) rather than by naming the twenty-odd
 * `StagedEventSpec` kinds and their differently-named actor keys — a census by
 * enumeration is a census that silently shrinks when a kind is added.
 */
function collect(node: unknown, districtId: string, owner: string, out: Actor[], seen: Set<unknown>): void {
  if (node === null || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const v of node) collect(v, districtId, owner, out, seen);
    return;
  }
  const o = node as Record<string, unknown>;
  const hold = o.hold as { nodeIndex: number; offsetM: number } | undefined;
  if (hold && typeof hold === "object" && (Array.isArray(o.pathNodes) || Array.isArray(o.railPath))) {
    out.push({ owner, districtId, hold, spec: o });
  }
  for (const v of Object.values(o)) collect(v, districtId, owner, out, seen);
}

function catalogue(): Actor[] {
  const out: Actor[] = [];
  for (const t of SCENARIO_TEMPLATES as unknown as Array<Record<string, unknown>>) {
    const districtId = (t.map as Record<string, unknown>).districtId as string;
    collect(t.staged, districtId, `${t.id as string}.staged`, out, new Set());
    collect(t.levels, districtId, `${t.id as string}.stagedAdd`, out, new Set());
  }
  for (const shell of EXAM_SHELLS as unknown as Array<Record<string, unknown>>) {
    collect(shell, (shell.districtId as string) ?? "district-v1", `exam.${shell.id as string}`, out, new Set());
  }
  return out;
}

/** The sweep's verdict for one staged actor: the raw arc, and whether it fell
 *  off either end of its own path. Factored so the self-check below runs the
 *  SAME predicate the catalogue is judged by — a probe that is verified by a
 *  reimplementation of itself is verified by nothing. */
function rawArcOutside(
  nodeS: readonly number[],
  pathLengthM: number,
  hold: { nodeIndex: number; offsetM: number },
): number | null {
  const idx = Math.min(Math.max(hold.nodeIndex, 0), nodeS.length - 1);
  const raw = nodeS[idx]! + hold.offsetM;
  return raw < 0 || raw > pathLengthM ? raw : null;
}

describe("no shipped staged actor needs the clamp", () => {
  it("the sweep's own predicate convicts the case §1 measured by hand", () => {
    // Without this the sweep below passes by finding nothing, which is how
    // every „0 defects" report in this project has been wrong so far. The
    // positive case is the square fixture's 40-m-past-the-end hold — the exact
    // actor §1 stands in the terrain — and the negative is the same hold
    // in range, so the predicate cannot be one that convicts everybody either.
    const p = legAB();
    expect(rawArcOutside(p.nodeS, p.length, { nodeIndex: 1, offsetM: OVER_M })).toBeCloseTo(
      p.length + OVER_M,
      9,
    );
    expect(rawArcOutside(p.nodeS, p.length, { nodeIndex: 0, offsetM: -OVER_M })).toBe(-OVER_M);
    expect(rawArcOutside(p.nodeS, p.length, { nodeIndex: 1, offsetM: -OVER_M })).toBeNull();
    expect(rawArcOutside(p.nodeS, p.length, { nodeIndex: 1, offsetM: 0 })).toBeNull();
  });

  it("every authored hold arc lands inside its own resolved path", () => {
    const actors = catalogue();
    // Measured 2026-08-19: 113. Asserted as a floor so the sweep cannot pass by
    // finding nothing — the failure mode of every structural census.
    expect(actors.length).toBeGreaterThanOrEqual(113);
    const unresolved: string[] = [];
    const outside: string[] = [];
    let n = 0;
    for (const a of actors) {
      const system = createTrafficSystem(district(a.districtId), {
        seed: 3,
        vehicleCount: 0,
        pedestrianCount: 0,
      });
      const view = system.stage({
        ...a.spec,
        kind: "vehicle",
        id: `sweep-${n++}`,
        cruiseSpeedMps: (a.spec.cruiseSpeedMps as number) ?? 5,
      } as unknown as StagedVehicleSpec);
      if (!view) {
        unresolved.push(a.owner);
        continue;
      }
      const raw = rawArcOutside(view.nodeS, view.pathLengthM, a.hold);
      if (raw !== null) {
        outside.push(
          `${a.owner}: node ${a.hold.nodeIndex} ${a.hold.offsetM} m → ${raw.toFixed(1)} of 0…${view.pathLengthM.toFixed(1)}`,
        );
      }
    }
    // A path that will not resolve is a different lane's finding, but it would
    // also make this sweep look clean by counting nothing — so it is named.
    expect(unresolved, "staged paths that no longer resolve").toEqual([]);
    expect(outside, "authored holds outside their own path").toEqual([]);
  });
});
