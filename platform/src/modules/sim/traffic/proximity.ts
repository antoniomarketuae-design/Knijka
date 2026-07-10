/**
 * sim/traffic — A11 proximity helpers (pure, allocation-free).
 *
 * Two jobs, both frame-rate hot and physics-adjacent, kept React-free so the
 * shell-pool component (components/sim/NpcColliders) stays a thin binding:
 *
 *  1. Nearest-N selection + stable pool assignment. The physics layer keeps a
 *     FIXED pool of kinematic collider shells (~8 vehicles + 4 pedestrians —
 *     doc 68 A11 budget) and re-binds them to the NPC agents closest to the
 *     player every ~0.5 s. Far NPCs stay ghosts by design: an agent tens of
 *     seconds of driving away needs no physics presence yet, and a fixed pool
 *     keeps the rapier world size (and broadphase churn) constant.
 *
 *  2. Near-miss detection. The player squeezing past a MOVING agent with
 *     almost no lateral clearance is a teachable moment even when nothing
 *     touched. Surfaced as a session stat (contracts NearMissEvent /
 *     NearMissStats) for A15's feedback map — deliberately NOT a
 *     ViolationCode; no grading change.
 *
 * Everything here is pure: callers own every buffer, functions mutate them in
 * place and allocate nothing per call. Positions are district space
 * (x = east, y = north, meters), headings 0 = north, clockwise — the same
 * conventions as the rest of the traffic module.
 */

export interface AgentPoint {
  x: number;
  y: number;
}

/**
 * Write the indices of the up-to-`cap` agents nearest to (px, py) — and
 * within `maxDistM` — into `outIndices[0..count)`, nearest first, where
 * `cap = min(outIndices.length, scratchD2.length)`. Returns `count`.
 * `scratchD2` holds the matching squared distances (caller-owned scratch).
 * One O(agents x cap) insertion pass, zero allocations.
 */
export function selectNearest(
  agents: readonly AgentPoint[],
  px: number,
  py: number,
  maxDistM: number,
  outIndices: Int32Array,
  scratchD2: Float64Array,
): number {
  const cap = Math.min(outIndices.length, scratchD2.length);
  if (cap === 0) return 0;
  const maxD2 = maxDistM * maxDistM;
  let count = 0;
  for (let i = 0; i < agents.length; i++) {
    const dx = agents[i].x - px;
    const dy = agents[i].y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > maxD2) continue;
    if (count === cap && d2 >= scratchD2[count - 1]) continue;
    let j = count < cap ? count : cap - 1;
    while (j > 0 && scratchD2[j - 1] > d2) {
      scratchD2[j] = scratchD2[j - 1];
      outIndices[j] = outIndices[j - 1];
      j--;
    }
    scratchD2[j] = d2;
    outIndices[j] = i;
    if (count < cap) count++;
  }
  return count;
}

/**
 * Stable pool (re)assignment. `assignments[k]` is the agent index shell `k`
 * is bound to, or -1 when the shell is dormant. Shells whose agent is still
 * among `selected[0..selectedCount)` KEEP their binding (a kept binding means
 * no teleport — the kinematic body keeps gliding), shells whose agent fell
 * out of the selection are freed, and newly selected agents bind to freed
 * shells in nearest-first order. Mutates `assignments` in place. O(pool²) —
 * pool sizes are single-digit.
 */
export function assignPool(
  assignments: Int32Array,
  selected: Int32Array,
  selectedCount: number,
): void {
  const n = Math.min(selectedCount, selected.length);
  // Pass 1: free shells whose agent is no longer selected.
  for (let k = 0; k < assignments.length; k++) {
    const bound = assignments[k];
    if (bound < 0) continue;
    let still = false;
    for (let j = 0; j < n; j++) {
      if (selected[j] === bound) {
        still = true;
        break;
      }
    }
    if (!still) assignments[k] = -1;
  }
  // Pass 2: bind not-yet-bound selected agents to free shells, nearest first.
  for (let j = 0; j < n; j++) {
    const agent = selected[j];
    let taken = false;
    for (let k = 0; k < assignments.length; k++) {
      if (assignments[k] === agent) {
        taken = true;
        break;
      }
    }
    if (taken) continue;
    for (let k = 0; k < assignments.length; k++) {
      if (assignments[k] < 0) {
        assignments[k] = agent;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Near-miss detection
// ---------------------------------------------------------------------------

/** The slice of an NPC state the detector reads (satisfied by both
 *  TrafficVehicleState and TrafficPedestrianState). */
export interface NearMissAgent {
  x: number;
  y: number;
  /** Unit travel/facing direction, district space. */
  dirX: number;
  dirY: number;
  speedMps: number;
}

/** Player pose + body envelope for the near-miss geometry. */
export interface NearMissPlayer {
  x: number;
  y: number;
  /** 0 = north, clockwise. */
  headingDeg: number;
  speedMps: number;
  /** Body half-extents (chassis collider), meters. */
  halfWidthM: number;
  halfLengthM: number;
}

export interface NearMissConfig {
  /** Body-envelope clearance below which the danger window opens, m. */
  enterClearanceM: number;
  /** Clearance above which an open window closes (hysteresis > enter). */
  exitClearanceM: number;
  /** Relative speed at or above which a squeeze counts, m/s. */
  minRelSpeedMps: number;
  /** The agent must be MOVING (parked/held NPCs never near-miss), m/s. */
  minAgentSpeedMps: number;
  /** The PLAYER must be moving — this is the player's near-miss, not the
   *  NPC's (an ambient car brushing past a parked student is NPC behavior
   *  the student cannot answer for), m/s. */
  minPlayerSpeedMps: number;
  /** Per-agent re-arm delay after a window closes, s (boundary jitter). */
  cooldownSec: number;
}

export const DEFAULT_NEAR_MISS_CONFIG: NearMissConfig = {
  enterClearanceM: 0.75,
  exitClearanceM: 1.1,
  minRelSpeedMps: 2.0,
  minAgentSpeedMps: 0.5,
  minPlayerSpeedMps: 1.5,
  cooldownSec: 2,
};

/**
 * Per-agent encounter state, parallel to one agent array. An ENCOUNTER is a
 * contiguous danger window: it opens when the frame condition first holds and
 * closes on geometric separation (no longer alongside, or clearance beyond
 * the exit hysteresis). `emit` fires ONCE per encounter, at close, carrying
 * the window's tightest clearance and peak relative speed — so a session's
 * "worst" is the true worst, not the entry sample. Honest limitation: an
 * encounter that ends in actual contact still emits when the bodies finally
 * separate (clearance 0) — acceptable for a non-graded stat, and the real
 * COLLISION violation has already fired through the physics path by then.
 */
export interface NearMissTracker {
  /** 1 = danger window currently open for this agent. */
  active: Uint8Array;
  /** Seconds until this agent may open a new window. */
  cooldown: Float32Array;
  /** Tightest clearance seen inside the open window, m. */
  minClearance: Float32Array;
  /** Peak relative speed seen inside the open window, m/s. */
  maxRelSpeed: Float32Array;
}

export function createNearMissTracker(capacity: number): NearMissTracker {
  return {
    active: new Uint8Array(capacity),
    cooldown: new Float32Array(capacity),
    minClearance: new Float32Array(capacity),
    maxRelSpeed: new Float32Array(capacity),
  };
}

/**
 * Advance the near-miss detector one frame over ONE agent array (call once
 * for vehicles, once for pedestrians, with that array's body envelope).
 *
 * Geometry, in the player's frame: an agent is "alongside" while the along-
 * track offset is inside the summed half-lengths; the clearance is the
 * lateral offset minus both half-widths (clamped at 0 — physics shells stop
 * real interpenetration, so negative only means "touching"). The frame
 * condition additionally needs relative speed and both parties moving (cfg).
 *
 * `emit(agentIndex, clearanceM, relSpeedMps)` fires once per encounter, at
 * window close — bind it once, not per frame.
 */
export function stepNearMiss(
  tracker: NearMissTracker,
  dtSec: number,
  player: NearMissPlayer,
  agents: readonly NearMissAgent[],
  agentHalfWidthM: number,
  agentHalfLengthM: number,
  cfg: NearMissConfig,
  emit: (agentIndex: number, clearanceM: number, relSpeedMps: number) => void,
): void {
  const rad = (player.headingDeg * Math.PI) / 180;
  const fx = Math.sin(rad); // forward (0 deg = north = +y, cw positive)
  const fy = Math.cos(rad);
  const n = Math.min(agents.length, tracker.active.length);
  for (let i = 0; i < n; i++) {
    if (tracker.cooldown[i] > 0) {
      tracker.cooldown[i] = Math.max(0, tracker.cooldown[i] - dtSec);
    }
    const a = agents[i];
    const rx = a.x - player.x;
    const ry = a.y - player.y;
    const along = rx * fx + ry * fy;
    const lat = Math.abs(rx * fy - ry * fx); // |projection on the right axis|
    const alongside = Math.abs(along) < player.halfLengthM + agentHalfLengthM;
    const rawClearance = lat - player.halfWidthM - agentHalfWidthM;
    const clearance = rawClearance < 0 ? 0 : rawClearance;

    if (tracker.active[i]) {
      if (!alongside || rawClearance > cfg.exitClearanceM) {
        // Separation — the encounter resolved without contact: report it.
        tracker.active[i] = 0;
        tracker.cooldown[i] = cfg.cooldownSec;
        emit(i, tracker.minClearance[i], tracker.maxRelSpeed[i]);
      } else {
        if (clearance < tracker.minClearance[i]) tracker.minClearance[i] = clearance;
        const rvx = player.speedMps * fx - a.speedMps * a.dirX;
        const rvy = player.speedMps * fy - a.speedMps * a.dirY;
        const rel = Math.hypot(rvx, rvy);
        if (rel > tracker.maxRelSpeed[i]) tracker.maxRelSpeed[i] = rel;
      }
      continue;
    }

    if (tracker.cooldown[i] > 0) continue;
    if (!alongside || rawClearance >= cfg.enterClearanceM) continue;
    if (a.speedMps < cfg.minAgentSpeedMps) continue;
    if (player.speedMps < cfg.minPlayerSpeedMps) continue;
    const rvx = player.speedMps * fx - a.speedMps * a.dirX;
    const rvy = player.speedMps * fy - a.speedMps * a.dirY;
    const rel = Math.hypot(rvx, rvy);
    if (rel < cfg.minRelSpeedMps) continue;
    tracker.active[i] = 1;
    tracker.minClearance[i] = clearance;
    tracker.maxRelSpeed[i] = rel;
  }
}

/** Reset all windows/cooldowns (fresh attempt). */
export function resetNearMissTracker(tracker: NearMissTracker): void {
  tracker.active.fill(0);
  tracker.cooldown.fill(0);
  tracker.minClearance.fill(0);
  tracker.maxRelSpeed.fill(0);
}
