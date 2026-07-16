/**
 * sim/runtime — deterministic traffic-signal controller.
 *
 * OSM carries no phase/timing data (doc 17 §8), so all timing is invented
 * here, deterministically:
 *
 * GROUPING. OSM models dual carriageways as parallel oneways, so one physical
 * junction appears as up to 4 signalized graph nodes ≤ 30 m apart (doc 17 §6
 * junction-merge note). We single-linkage-cluster ALL signal-bearing nodes
 * (signalized intersections + signalized pedestrian crossings) with a 40 m
 * link radius — signalized crossings sit on the approaches and correctly glue
 * the node groups of one physical junction together. On this district that
 * yields the 4 physical junction complexes the docs describe, plus standalone
 * mid-block crossings as their own single-node controllers.
 *
 * PHASES. Every cluster runs the same two-phase machine: phase A serves the
 * N-S axis, phase B the E-W axis (each signal node is assigned an axis, see
 * `nodeGroup`). Per half-cycle: green 20 s → yellow 3 s → all-red 1 s →
 * other side red+yellow 1 s → green…  Full cycle 50 s; each group sees
 * green 20 / yellow 3 / redYellow 1 / red 26.
 *
 * DETERMINISM. The only "randomness" is a phase offset per cluster, seeded by
 * FNV-1a of the cluster id (its lexicographically smallest member node id).
 * No Math.random anywhere; two controllers advanced by the same dt sequence
 * are bit-identical.
 */

import type { SignalPhase } from "../contracts";
import type { District } from "./district";
import { axisOfBearing, bearingDeg, fnv1a, type Axis } from "./geometry";
import type { DistrictIndex } from "./spatial";

export const SIGNAL_TIMING = {
  greenSec: 20,
  yellowSec: 3,
  redYellowSec: 1,
  allRedSec: 1,
  /** Full two-phase cycle: 2 × (green + yellow + allRed + redYellow). */
  cycleSec: 50,
} as const;

const HALF = SIGNAL_TIMING.cycleSec / 2; // 25

/** Link radius for clustering signal nodes into one physical junction. */
const CLUSTER_LINK_M = 40;
/** Node ≈ centroid ⇒ fall back to incident-edge axis for grouping. */
const CENTROID_MIN_DIST_M = 5;

export interface SignalClusterInfo {
  id: string;
  x: number;
  y: number;
  offsetSec: number;
  memberNodeIds: string[];
}

/**
 * Runtime control mode of a signal cluster (doc 72 JU-09/JU-20). "live" — the
 * shipped two-phase machine drives the lamps. "dark" (загаснал светофар) /
 * "flashingAmber" (мигащо жълто) — the lamps carry NO phase, so the junction
 * is treated as UNCONTROLLED and the right-hand rule governs it (ЗДвП чл. 50).
 * Both non-live modes behave identically to the grader; the distinct names let
 * the world layer render the right lamp state and the copy cite the right sign.
 * Default "live" everywhere → absent = today's behavior, byte-for-byte.
 */
export type SignalClusterMode = "live" | "dark" | "flashingAmber";

interface SignalNode {
  id: string;
  x: number;
  y: number;
  kind: "junction" | "crossing";
  /** Host edge for crossings (grouping fallback), null otherwise. */
  edgeId: string | null;
  clusterIdx: number;
  group: Axis;
}

/** Phase + time-to-next-change of an axis-group at local cycle time (B1a N2).
 * The ns timeline: green [0,20) → yellow [20,23) → red [23,49) → redYellow
 * [49,50); the ew timeline is the same shifted by a half-cycle. Consistent
 * with phaseInCycle by construction (asserted in signals.test.ts). */
export function phaseTimingInCycle(
  localSec: number,
  group: Axis,
): { phase: SignalPhase; timeToChangeSec: number } {
  const cycle = SIGNAL_TIMING.cycleSec;
  const t = ((localSec % cycle) + cycle) % cycle;
  const u = group === "ns" ? t : (t - HALF + cycle) % cycle;
  const { greenSec, yellowSec, redYellowSec } = SIGNAL_TIMING;
  if (u < greenSec) return { phase: "green", timeToChangeSec: greenSec - u };
  if (u < greenSec + yellowSec) {
    return { phase: "yellow", timeToChangeSec: greenSec + yellowSec - u };
  }
  if (u < cycle - redYellowSec) {
    return { phase: "red", timeToChangeSec: cycle - redYellowSec - u };
  }
  return { phase: "redYellow", timeToChangeSec: cycle - u };
}

/** Cycle-local time at which `phase` STARTS for the given axis-group. */
export function phaseStartLocalSec(phase: SignalPhase, group: Axis): number {
  const cycle = SIGNAL_TIMING.cycleSec;
  const { greenSec, yellowSec, redYellowSec } = SIGNAL_TIMING;
  const nsStart =
    phase === "green"
      ? 0
      : phase === "yellow"
        ? greenSec
        : phase === "red"
          ? greenSec + yellowSec
          : cycle - redYellowSec; // redYellow
  return group === "ns" ? nsStart : (nsStart + HALF) % cycle;
}

/** Phase of the given axis-group at local cycle time (phase A = N-S first). */
export function phaseInCycle(localSec: number, group: Axis): SignalPhase {
  const t = ((localSec % SIGNAL_TIMING.cycleSec) + SIGNAL_TIMING.cycleSec) % SIGNAL_TIMING.cycleSec;
  const { greenSec, yellowSec, allRedSec } = SIGNAL_TIMING;
  const inA = t < HALF;
  const local = inA ? t : t - HALF;
  const mine = (group === "ns") === inA; // is my group the served phase of this half?
  if (mine) {
    if (local < greenSec) return "green";
    if (local < greenSec + yellowSec) return "yellow";
    return "red"; // my trailing all-red + the other side's redYellow
  }
  // Other side is served; I show red, except my redYellow in its last second.
  if (local >= greenSec + yellowSec + allRedSec) return "redYellow";
  return "red";
}

export class SignalController {
  private readonly nodes = new Map<string, SignalNode>();
  private readonly clustersInfo: SignalClusterInfo[] = [];
  private readonly offsets: number[] = [];
  /** Per-cluster control mode (index-aligned with offsets); default "live". */
  private readonly modes: SignalClusterMode[] = [];
  private tSec = 0;

  constructor(district: District, index: DistrictIndex) {
    const raw: Omit<SignalNode, "clusterIdx" | "group">[] = [];
    for (const it of district.intersections) {
      if (it.signalized) raw.push({ id: it.id, x: it.x, y: it.y, kind: "junction", edgeId: null });
    }
    for (const c of district.crossings) {
      if (c.signalized) raw.push({ id: c.id, x: c.x, y: c.y, kind: "crossing", edgeId: c.edgeId });
    }
    // Deterministic order regardless of file order.
    raw.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // Single-linkage clustering via union-find (n ≈ 43 — O(n²) is fine).
    const parent = raw.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const link2 = CLUSTER_LINK_M * CLUSTER_LINK_M;
    for (let i = 0; i < raw.length; i++) {
      for (let j = i + 1; j < raw.length; j++) {
        const dx = raw[i].x - raw[j].x;
        const dy = raw[i].y - raw[j].y;
        if (dx * dx + dy * dy <= link2) {
          const ri = find(i);
          const rj = find(j);
          if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
        }
      }
    }

    const clusterOfRoot = new Map<number, number>();
    const members: number[][] = [];
    for (let i = 0; i < raw.length; i++) {
      const root = find(i);
      let ci = clusterOfRoot.get(root);
      if (ci === undefined) {
        ci = members.length;
        clusterOfRoot.set(root, ci);
        members.push([]);
      }
      members[ci].push(i);
    }

    for (let ci = 0; ci < members.length; ci++) {
      const ids = members[ci].map((i) => raw[i].id);
      const clusterId = ids.reduce((a, b) => (a < b ? a : b));
      let cx = 0;
      let cy = 0;
      for (const i of members[ci]) {
        cx += raw[i].x;
        cy += raw[i].y;
      }
      cx /= members[ci].length;
      cy /= members[ci].length;
      const offsetSec = fnv1a(clusterId) % SIGNAL_TIMING.cycleSec;
      this.clustersInfo.push({ id: clusterId, x: cx, y: cy, offsetSec, memberNodeIds: ids });
      this.offsets.push(offsetSec);
      this.modes.push("live");
      for (const i of members[ci]) {
        const r = raw[i];
        this.nodes.set(r.id, {
          ...r,
          clusterIdx: ci,
          group: this.nodeGroup(r, cx, cy, index),
        });
      }
    }
  }

  /**
   * Axis-group assignment for a signal node:
   * 1. Node clearly offset from its cluster centroid (dual-carriageway
   *    approach node) ⇒ axis of the bearing node → centroid: that is the
   *    direction traffic passing this node moves through the junction.
   * 2. Node at/near the centroid (single-node junction) ⇒ axis of its
   *    highest-class incident edge (the arterial the signal actually serves).
   * 3. Signalized crossing ⇒ axis of the host edge at the crossing (the lamp
   *    faces vehicles along that edge).
   */
  private nodeGroup(node: { id: string; x: number; y: number; kind: string; edgeId: string | null }, cx: number, cy: number, index: DistrictIndex): Axis {
    if (node.kind === "crossing") {
      const rt = node.edgeId !== null ? index.edgeRtById(node.edgeId) : null;
      if (rt !== null) {
        const hit = { edgeIdx: -1, distM: 0, sM: 0, latSignedM: 0, tanX: 0, tanY: 1, outsideM: 0 };
        index.projectOnEdge(rt.idx, node.x, node.y, hit);
        return axisOfBearing(bearingDeg(hit.tanX, hit.tanY));
      }
      return "ns";
    }
    const dx = cx - node.x;
    const dy = cy - node.y;
    if (Math.hypot(dx, dy) >= CENTROID_MIN_DIST_M) {
      return axisOfBearing(bearingDeg(dx, dy));
    }
    // Single-node cluster: dominant incident edge axis, deterministic pick.
    const incident = (index.edgesAtNode.get(node.id) ?? [])
      .map((i) => index.edgeRt(i))
      .sort((a, b) => b.classRank - a.classRank || (a.edge.id < b.edge.id ? -1 : 1));
    if (incident.length === 0) return "ns";
    const rt = incident[0];
    const atFrom = rt.edge.from === node.id;
    const [tx, ty] = index.tangentAt(rt.idx, atFrom ? 0 : rt.totalLen);
    return axisOfBearing(bearingDeg(tx, ty));
  }

  /** Advance controller time. Call once per frame (WorldRuntime.update). */
  update(dtSec: number): void {
    if (dtSec > 0) this.tSec += dtSec;
  }

  get timeSec(): number {
    return this.tSec;
  }

  /** Phase shown by the lamps at a signal node (its assigned axis-group). */
  phase(signalNodeId: string): SignalPhase {
    const node = this.nodes.get(signalNodeId);
    if (!node) return "red"; // unknown id: fail safe
    return phaseInCycle(this.tSec + this.offsets[node.clusterIdx], node.group);
  }

  /**
   * Phase facing an approach with the given travel bearing at this node's
   * junction — what a driver arriving on that bearing sees. Lets the world
   * renderer light all heads of a single-node junction correctly.
   */
  phaseForApproach(signalNodeId: string, approachBearingDeg: number): SignalPhase {
    const node = this.nodes.get(signalNodeId);
    if (!node) return "red";
    return phaseInCycle(this.tSec + this.offsets[node.clusterIdx], axisOfBearing(approachBearingDeg));
  }

  /** Phase of an axis-group inside a cluster (stop-line adjudication). */
  phaseForClusterGroup(clusterIdx: number, group: Axis): SignalPhase {
    if (clusterIdx < 0 || clusterIdx >= this.offsets.length) return "red";
    return phaseInCycle(this.tSec + this.offsets[clusterIdx], group);
  }

  /** Cluster index for a signal node id, -1 if unknown. */
  clusterIdxForNode(signalNodeId: string): number {
    return this.nodes.get(signalNodeId)?.clusterIdx ?? -1;
  }

  // -- B1a N2: signal-phase director API (doc 72 JU-06..09/20) ---------------

  /**
   * Phase + seconds until it changes, for the lamps a driver arriving on
   * `approachBearingDeg` sees at this node's junction. Omit the bearing to
   * read the node's own assigned axis-group. Unknown ids fail safe (red, ∞).
   */
  phaseInfo(
    signalNodeId: string,
    approachBearingDeg?: number,
  ): { phase: SignalPhase; timeToChangeSec: number } {
    const node = this.nodes.get(signalNodeId);
    if (!node) return { phase: "red", timeToChangeSec: Infinity };
    const group =
      approachBearingDeg === undefined ? node.group : axisOfBearing(approachBearingDeg);
    return phaseTimingInCycle(this.tSec + this.offsets[node.clusterIdx], group);
  }

  /**
   * Pin a cluster's phase offset (by any member node id). The director's
   * staging dial (doc 72 N2): staged exams pin junction phases at session
   * start, and the amber-dilemma runner pins the flip on approach.
   * Determinism is preserved — callers derive the offset from their seed /
   * deterministic player state. No-op for unknown ids.
   */
  setClusterOffset(signalNodeId: string, offsetSec: number): void {
    const node = this.nodes.get(signalNodeId);
    if (!node) return;
    const cycle = SIGNAL_TIMING.cycleSec;
    const norm = ((offsetSec % cycle) + cycle) % cycle;
    this.offsets[node.clusterIdx] = norm;
    this.clustersInfo[node.clusterIdx].offsetSec = norm;
  }

  /** Control mode of a cluster (index). "live" for out-of-range indices. */
  clusterMode(clusterIdx: number): SignalClusterMode {
    if (clusterIdx < 0 || clusterIdx >= this.modes.length) return "live";
    return this.modes[clusterIdx];
  }

  /**
   * True when a cluster's lamps carry no phase (dark / flashing amber) — the
   * junction is UNCONTROLLED and the right-hand rule governs it (doc 72
   * JU-09/JU-20). Out-of-range indices are live (controlled).
   */
  isClusterUncontrolled(clusterIdx: number): boolean {
    return this.clusterMode(clusterIdx) !== "live";
  }

  /**
   * Set a cluster's control mode (by any member node id). The sibling of
   * setClusterOffset: a deterministic session-start dial (staged exams pin a
   * junction DARK / on FLASHING AMBER to drill the uncontrolled-junction rule,
   * doc 72 JU-09/JU-20). No-op for unknown ids.
   */
  setClusterMode(signalNodeId: string, mode: SignalClusterMode): void {
    const node = this.nodes.get(signalNodeId);
    if (!node) return;
    this.modes[node.clusterIdx] = mode;
  }

  /**
   * The cluster offset that makes `phase` START in exactly `inSec` seconds
   * for the approach group of `approachBearingDeg` at this node. Feed the
   * result to setClusterOffset. Unknown ids return the current-time-neutral 0.
   */
  offsetForPhaseStart(
    signalNodeId: string,
    approachBearingDeg: number,
    phase: SignalPhase,
    inSec: number,
  ): number {
    const node = this.nodes.get(signalNodeId);
    if (!node) return 0;
    const cycle = SIGNAL_TIMING.cycleSec;
    const startLocal = phaseStartLocalSec(phase, axisOfBearing(approachBearingDeg));
    return (((startLocal - inSec - this.tSec) % cycle) + cycle) % cycle;
  }

  /** Assigned axis-group of a signal node ("ns" fallback for unknown ids). */
  groupForNode(signalNodeId: string): Axis {
    return this.nodes.get(signalNodeId)?.group ?? "ns";
  }

  get clusters(): readonly SignalClusterInfo[] {
    return this.clustersInfo;
  }
}
