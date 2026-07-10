/**
 * A11 proximity helpers — nearest-N selection, stable shell-pool assignment
 * and the near-miss detector (all pure; the NpcColliders physics component is
 * a thin binding over exactly these functions).
 */

import { describe, expect, it } from "vitest";
import {
  assignPool,
  createNearMissTracker,
  DEFAULT_NEAR_MISS_CONFIG,
  resetNearMissTracker,
  selectNearest,
  stepNearMiss,
  type NearMissAgent,
  type NearMissConfig,
  type NearMissPlayer,
} from "../proximity";

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// selectNearest
// ---------------------------------------------------------------------------

function scratch(cap: number) {
  return { idx: new Int32Array(cap), d2: new Float64Array(cap) };
}

describe("selectNearest", () => {
  const agents = [
    { x: 100, y: 0 }, // 100 m
    { x: 5, y: 0 }, // 5 m
    { x: 0, y: 30 }, // 30 m
    { x: -12, y: 0 }, // 12 m
    { x: 0, y: -500 }, // 500 m (outside every radius used below)
  ];

  it("returns the nearest agents, nearest first", () => {
    const s = scratch(3);
    const n = selectNearest(agents, 0, 0, 1000, s.idx, s.d2);
    expect(n).toBe(3);
    expect(Array.from(s.idx.subarray(0, n))).toEqual([1, 3, 2]);
  });

  it("respects the radius cut-off", () => {
    const s = scratch(8);
    const n = selectNearest(agents, 0, 0, 50, s.idx, s.d2);
    expect(n).toBe(3); // 5, 12, 30 in; 100 and 500 out
    expect(Array.from(s.idx.subarray(0, n))).toEqual([1, 3, 2]);
  });

  it("caps at the output capacity even when more agents qualify", () => {
    const s = scratch(2);
    const n = selectNearest(agents, 0, 0, 1000, s.idx, s.d2);
    expect(n).toBe(2);
    expect(Array.from(s.idx.subarray(0, n))).toEqual([1, 3]);
  });

  it("handles empty input and zero capacity", () => {
    const s = scratch(4);
    expect(selectNearest([], 0, 0, 100, s.idx, s.d2)).toBe(0);
    const empty = scratch(0);
    expect(selectNearest(agents, 0, 0, 100, empty.idx, empty.d2)).toBe(0);
  });

  it("evicts the farthest of a full set when a nearer agent appears later", () => {
    const late = [
      { x: 40, y: 0 },
      { x: 50, y: 0 },
      { x: 1, y: 0 }, // appears last, nearest of all
    ];
    const s = scratch(2);
    const n = selectNearest(late, 0, 0, 1000, s.idx, s.d2);
    expect(n).toBe(2);
    expect(Array.from(s.idx.subarray(0, n))).toEqual([2, 0]);
  });
});

// ---------------------------------------------------------------------------
// assignPool
// ---------------------------------------------------------------------------

describe("assignPool", () => {
  it("binds fresh selections to free shells, nearest first", () => {
    const assignments = new Int32Array([-1, -1, -1]);
    assignPool(assignments, new Int32Array([7, 2, 9]), 3);
    expect(Array.from(assignments)).toEqual([7, 2, 9]);
  });

  it("keeps still-selected agents on their shells (no teleport churn)", () => {
    const assignments = new Int32Array([7, 2, 9]);
    // Re-selection in a different order + one swap (9 out, 4 in).
    assignPool(assignments, new Int32Array([2, 4, 7]), 3);
    expect(assignments[0]).toBe(7); // kept in place
    expect(assignments[1]).toBe(2); // kept in place
    expect(assignments[2]).toBe(4); // freed shell took the newcomer
  });

  it("frees shells whose agents dropped out without refilling when nothing is selected", () => {
    const assignments = new Int32Array([7, 2, 9]);
    assignPool(assignments, new Int32Array(0), 0);
    expect(Array.from(assignments)).toEqual([-1, -1, -1]);
  });

  it("leaves surplus selections unbound when the pool is smaller", () => {
    const assignments = new Int32Array([-1, -1]);
    assignPool(assignments, new Int32Array([5, 6, 8]), 3);
    // Nearest two get the shells; the third stays a ghost.
    expect(Array.from(assignments)).toEqual([5, 6]);
  });
});

// ---------------------------------------------------------------------------
// stepNearMiss
// ---------------------------------------------------------------------------

/** Player heading north at 10 m/s, hero-chassis envelope (0.85 x 2.02 m). */
function playerNorth(overrides?: Partial<NearMissPlayer>): NearMissPlayer {
  return {
    x: 0,
    y: 0,
    headingDeg: 0,
    speedMps: 10,
    halfWidthM: 0.85,
    halfLengthM: 2.02,
    ...overrides,
  };
}

/** Oncoming car (southbound) `latM` meters to the player's right. */
function oncomingCar(latM: number, overrides?: Partial<NearMissAgent>): NearMissAgent {
  return { x: latM, y: 0, dirX: 0, dirY: -1, speedMps: 8, ...overrides };
}

const VEH_HALF_W = 0.92;
const VEH_HALF_L = 2.1;
const CFG: NearMissConfig = DEFAULT_NEAR_MISS_CONFIG;

interface Hit {
  index: number;
  clearanceM: number;
  relSpeedMps: number;
}

function collect(): { hits: Hit[]; emit: (i: number, c: number, r: number) => void } {
  const hits: Hit[] = [];
  return {
    hits,
    emit: (index, clearanceM, relSpeedMps) => hits.push({ index, clearanceM, relSpeedMps }),
  };
}

describe("stepNearMiss", () => {
  it("emits once per encounter, at separation, with the window's tightest clearance", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    const player = playerNorth();
    // Alongside at 2.3 m lateral -> clearance 2.3 - 0.85 - 0.92 = 0.53 < 0.75.
    const agents = [oncomingCar(2.3)];
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(0); // window open, not resolved
    // Squeeze tighter mid-pass: clearance 2.0 - 1.77 = 0.23.
    agents[0] = oncomingCar(2.0);
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(0);
    // The car passes behind — longitudinal separation resolves the encounter.
    agents[0] = oncomingCar(2.0, { y: -30 });
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(0);
    expect(hits[0].clearanceM).toBeCloseTo(0.23, 5);
    // Head-on relative speed: 10 + 8 = 18 m/s.
    expect(hits[0].relSpeedMps).toBeCloseTo(18, 5);
  });

  it("ignores comfortable passes (clearance at or above the threshold)", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    // 2.8 m lateral -> clearance 1.03 > 0.75: never a window, never a hit.
    const agents = [oncomingCar(2.8)];
    stepNearMiss(tracker, DT, playerNorth(), agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    agents[0] = oncomingCar(2.8, { y: -30 });
    stepNearMiss(tracker, DT, playerNorth(), agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(0);
  });

  it("ignores stationary agents (parked/held NPCs are not near-misses)", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    const agents = [oncomingCar(2.0, { speedMps: 0 })];
    stepNearMiss(tracker, DT, playerNorth(), agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(tracker.active[0]).toBe(0);
    expect(hits).toHaveLength(0);
  });

  it("ignores squeezes while the player is (near) stationary", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    // NPC drives close past a parked player — NPC behavior, not the student's.
    const agents = [oncomingCar(2.0)];
    stepNearMiss(tracker, DT, playerNorth({ speedMps: 0 }), agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(tracker.active[0]).toBe(0);
    expect(hits).toHaveLength(0);
  });

  it("ignores low relative-speed crawls even when close", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    // Same-direction neighbor at nearly the player's speed: rel ~0.5 m/s.
    const agents: NearMissAgent[] = [
      { x: 2.0, y: 0, dirX: 0, dirY: 1, speedMps: 9.5 },
    ];
    stepNearMiss(tracker, DT, playerNorth(), agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(tracker.active[0]).toBe(0);
    expect(hits).toHaveLength(0);
  });

  it("does not re-trigger during the cooldown, then re-arms", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    const player = playerNorth();
    const agents = [oncomingCar(2.0)];
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    agents[0] = oncomingCar(2.0, { y: -30 });
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(1);
    // Immediately back alongside: cooldown must swallow it.
    agents[0] = oncomingCar(2.0);
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(tracker.active[0]).toBe(0);
    // Burn the cooldown with the agent far away, then squeeze again.
    agents[0] = oncomingCar(2.0, { y: -30 });
    const frames = Math.ceil(CFG.cooldownSec / DT) + 1;
    for (let i = 0; i < frames; i++) {
      stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    }
    agents[0] = oncomingCar(2.0);
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    agents[0] = oncomingCar(2.0, { y: -30 });
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(2);
  });

  it("clamps touching (negative raw clearance) to 0", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    const player = playerNorth();
    const agents = [oncomingCar(1.5)]; // raw clearance 1.5 - 1.77 < 0
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    agents[0] = oncomingCar(1.5, { y: -30 });
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(1);
    expect(hits[0].clearanceM).toBe(0);
  });

  it("works with the pedestrian envelope and tracks independent agents", () => {
    const tracker = createNearMissTracker(2);
    const { hits, emit } = collect();
    const player = playerNorth();
    const pedEnvelope = 0.35;
    // Agent 0: a pedestrian 1.6 m to the LEFT (clearance 1.6 - 0.85 - 0.35 =
    // 0.4), walking across. Agent 1: far away, never involved.
    const agents: NearMissAgent[] = [
      { x: -1.6, y: 1, dirX: 1, dirY: 0, speedMps: 1.5 },
      { x: 50, y: 50, dirX: 1, dirY: 0, speedMps: 1.5 },
    ];
    stepNearMiss(tracker, DT, player, agents, pedEnvelope, pedEnvelope, CFG, emit);
    expect(tracker.active[0]).toBe(1);
    expect(tracker.active[1]).toBe(0);
    agents[0] = { x: -1.6, y: -20, dirX: 1, dirY: 0, speedMps: 1.5 };
    stepNearMiss(tracker, DT, player, agents, pedEnvelope, pedEnvelope, CFG, emit);
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBe(0);
    expect(hits[0].clearanceM).toBeCloseTo(0.4, 5);
  });

  it("respects a rotated player frame (heading east)", () => {
    const tracker = createNearMissTracker(1);
    const { hits, emit } = collect();
    // Player heading east (90 deg); oncoming car 2.0 m north of them =
    // laterally 2.0 m in the player frame, driving west.
    const player = playerNorth({ headingDeg: 90 });
    const agents: NearMissAgent[] = [{ x: 0, y: 2.0, dirX: -1, dirY: 0, speedMps: 8 }];
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(tracker.active[0]).toBe(1);
    agents[0] = { x: -30, y: 2.0, dirX: -1, dirY: 0, speedMps: 8 };
    stepNearMiss(tracker, DT, player, agents, VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(hits).toHaveLength(1);
    expect(hits[0].clearanceM).toBeCloseTo(2.0 - 0.85 - 0.92, 5);
  });

  it("resetNearMissTracker clears windows and cooldowns", () => {
    const tracker = createNearMissTracker(1);
    const { emit } = collect();
    stepNearMiss(tracker, DT, playerNorth(), [oncomingCar(2.0)], VEH_HALF_W, VEH_HALF_L, CFG, emit);
    expect(tracker.active[0]).toBe(1);
    resetNearMissTracker(tracker);
    expect(tracker.active[0]).toBe(0);
    expect(tracker.cooldown[0]).toBe(0);
  });
});
