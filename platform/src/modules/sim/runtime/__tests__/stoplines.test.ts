import { describe, expect, it } from "vitest";
import type { DistrictWorldRuntime } from "..";
import { createWorldRuntime } from "..";
import { LANE_WIDTH_M } from "../spatial";
import {
  JUNCTION_TRIM_MAX_FRACTION,
  nodeOpenRadiusM,
  STOP_LINE_BEYOND_CUT_M,
} from "../../world/builders/network";
import { drive, edgeById, edgeDrivePath, eventsOf, loadDistrict } from "./helpers";

/**
 * Stop-line crossing detection with synthetic drives over REAL geometry.
 *
 * Signalized reference: n179974491 — бул. Свети Климент Охридски × ул. Трайко
 * Станоев (doc 17 hand-polish junction #5). Southbound approach edge
 * e672186634.0 (60.3 m) carries a derived stop line at the junction mouth
 * (perceptual road scale: the mouth, not a fixed setback, is authoritative).
 *
 * Stop-sign reference: n316056951 — residential ул. (e1182196532.0) meeting
 * secondary бул. (e718268829.*): the minor approach gets a heuristic Б2 line
 * at its junction mouth; the arterial through-movement gets none.
 */
const SIGNAL_JUNCTION = "n179974491";
const APPROACH_EDGE = "e672186634.0"; // southbound; line sM read from the runtime
const APPROACH_BEARING = 178; // travel bearing at the line (N-S axis)
const W = LANE_WIDTH_M;

/** sM of the single stop line guarding `nodeId` on `edgeId`. */
function lineS(rt: DistrictWorldRuntime, district: ReturnType<typeof loadDistrict>, edgeId: string, nodeId: string): number {
  const line = rt
    .debugStopLines()
    .find((l) => district.roads.edges[l.edgeIdx].id === edgeId && l.junctionNodeId === nodeId);
  expect(line, `stop line ${edgeId}@${nodeId}`).toBeDefined();
  return line!.sM;
}

/**
 * Advance a runtime to just past the START of the next `phase` window of the
 * approach, so the whole test drive (~2 s) happens inside one phase.
 */
function advanceToPhase(rt: DistrictWorldRuntime, phase: "green" | "red"): void {
  let prev = rt.signalPhaseForApproach(SIGNAL_JUNCTION, APPROACH_BEARING);
  for (let t = 0; t < 120; t += 0.1) {
    rt.update(0.1);
    const cur = rt.signalPhaseForApproach(SIGNAL_JUNCTION, APPROACH_BEARING);
    if (cur === phase && prev !== phase) {
      rt.update(0.5); // settle safely inside the window (green 20 s / red 26 s)
      return;
    }
    prev = cur;
  }
  throw new Error(`phase ${phase} never reached — controller broken`);
}

describe("stop lines (signalized)", () => {
  const district = loadDistrict();

  it("derives a stop line for every approach of the reference junction", () => {
    const rt = createWorldRuntime(district);
    const lines = rt.debugStopLines().filter((l) => l.junctionNodeId === SIGNAL_JUNCTION);
    // 4 approaches: two-way Охридски N+S, Станоев E, Брадистилов W.
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.control === "trafficLight")).toBe(true);
    expect(new Set(lines.map((l) => l.group)).size).toBe(2); // both axes present
  });

  it("reports stopLineCrossed with the lightState at the moment of crossing (green)", () => {
    const rt = createWorldRuntime(district);
    advanceToPhase(rt, "green");
    const edge = edgeById(district, APPROACH_EDGE);
    const s = lineS(rt, district, APPROACH_EDGE, SIGNAL_JUNCTION);
    const { ticks } = drive(rt, edgeDrivePath(edge, s - 12, s + 5, 1, 1.5 * W));
    const crossed = eventsOf(ticks, "stopLineCrossed");
    expect(crossed).toHaveLength(1);
    expect(crossed[0]).toEqual({ kind: "stopLineCrossed", control: "trafficLight", lightState: "green" });
  });

  it("reports lightState red when crossing on red", () => {
    const rt = createWorldRuntime(district);
    advanceToPhase(rt, "red");
    const edge = edgeById(district, APPROACH_EDGE);
    const s = lineS(rt, district, APPROACH_EDGE, SIGNAL_JUNCTION);
    const { ticks } = drive(rt, edgeDrivePath(edge, s - 12, s + 5, 1, 1.5 * W));
    const crossed = eventsOf(ticks, "stopLineCrossed");
    expect(crossed).toHaveLength(1);
    expect(crossed[0]).toEqual({ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" });
  });

  it("does not fire for the oncoming carriageway direction", () => {
    // Drive the same edge NORTHBOUND (away from the junction): the southbound
    // line must not fire; the far end (unsignalized n1113186267 —
    // tertiary/secondary meeting, no arterial-minor pair) has no line either.
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, APPROACH_EDGE);
    const s = lineS(rt, district, APPROACH_EDGE, SIGNAL_JUNCTION);
    const { ticks } = drive(rt, edgeDrivePath(edge, s + 5, 5, 1, 1.5 * W));
    expect(eventsOf(ticks, "stopLineCrossed")).toHaveLength(0);
  });

  it("debounces jitter at the line: one event within the refire window, a new one after", () => {
    const rt = createWorldRuntime(district);
    advanceToPhase(rt, "green");
    const edge = edgeById(district, APPROACH_EDGE);
    const s = lineS(rt, district, APPROACH_EDGE, SIGNAL_JUNCTION);
    // Cross, roll back behind the line, cross again quickly (jitter/creep)…
    const there = edgeDrivePath(edge, s - 5, s + 5, 0.5, 1.5 * W);
    const back = edgeDrivePath(edge, s + 5, s - 5, 0.5, 1.5 * W);
    const r1 = drive(rt, [...there, ...back, ...there], { dtSec: 0.03 });
    expect(eventsOf(r1.ticks, "stopLineCrossed")).toHaveLength(1);
    // …then a genuine re-approach later fires again.
    const r2 = drive(rt, [...back, ...there], { dtSec: 0.3, t0Sec: r1.tEnd + 6 });
    expect(eventsOf(r2.ticks, "stopLineCrossed")).toHaveLength(1);
  });
});

describe("stop lines (stop-sign heuristic)", () => {
  const district = loadDistrict();

  it("puts a stop-sign line on the minor approach of a minor×arterial junction", () => {
    const rt = createWorldRuntime(district);
    const minor = edgeById(district, "e1182196532.0"); // residential, from == n316056951
    const s = lineS(rt, district, minor.id, "n316056951"); // line at the junction mouth
    // Approach the junction: travel from beyond the line toward s=0 (the node end).
    const { ticks } = drive(rt, edgeDrivePath(minor, s + 10, 0.5, 0.5, W / 2));
    const crossed = eventsOf(ticks, "stopLineCrossed");
    expect(crossed).toHaveLength(1);
    expect(crossed[0]).toEqual({ kind: "stopLineCrossed", control: "stopSign" });
  });

  it("leaves the arterial through-movement uncontrolled", () => {
    const rt = createWorldRuntime(district);
    const a = edgeById(district, "e718268829.0"); // secondary, to == n316056951
    const b = edgeById(district, "e718268829.1"); // secondary, from == n316056951
    const { ticks } = drive(rt, [
      ...edgeDrivePath(a, 90, a.length, 1, W / 2),
      ...edgeDrivePath(b, 0.5, 40, 1, W / 2),
    ]);
    expect(eventsOf(ticks, "stopLineCrossed")).toHaveLength(0);
  });

  it("derives stop signs only at unsignalized minor×arterial meetings (never tertiary, never roundabouts)", () => {
    const rt = createWorldRuntime(district);
    const edgeByIdx = (i: number) => district.roads.edges[i];
    const intersectionById = new Map(district.intersections.map((it) => [it.id, it]));
    const stopSigns = rt.debugStopLines().filter((l) => l.control === "stopSign");
    expect(stopSigns.length).toBeGreaterThan(0);
    for (const line of stopSigns) {
      const junction = intersectionById.get(line.junctionNodeId);
      expect(junction, line.id).toBeDefined();
      expect(junction?.signalized, line.id).toBe(false);
      const edge = edgeByIdx(line.edgeIdx);
      expect(["service", "residential", "unclassified"], line.id).toContain(edge.class);
      expect(edge.roundabout, line.id).toBe(false);
    }
  });
});

describe("stop line overrides (QW4 — lesson 2's Б2 at n331942490)", () => {
  // Curriculum-bricking regression (doc 68 QW4 / audit 04 D10): the l2-stop-
  // sign objective requires a Б2 line at n331942490, but every incident edge
  // there is `unclassified`, so the minor×arterial heuristic never fires —
  // the line MUST come from STOP_LINE_OVERRIDES. If this test fails, lesson 2
  // cannot be completed and L3–L7 stay locked forever.
  const district = loadDistrict();
  const NODE = "n331942490";
  const APPROACH = "e897608662.0"; // player's northbound oneway approach

  it("hard-places exactly one Б2 stop line at the node, on the player's approach", () => {
    const rt = createWorldRuntime(district);
    const lines = rt.debugStopLines().filter((l) => l.junctionNodeId === NODE);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line.control).toBe("stopSign");
    expect(district.roads.edges[line.edgeIdx].id).toBe(APPROACH);
    // Oneway INTO the node: the line guards forward travel, at the junction
    // mouth — EXACTLY the world builder's ribbon cut + paint inset, so the
    // graded line coincides with the painted one (perceptual road scale).
    expect(line.dirSign).toBe(1);
    const edge = edgeById(district, APPROACH);
    const incident = district.roads.edges.filter((e) => e.from === NODE || e.to === NODE);
    const mouth =
      Math.min(
        nodeOpenRadiusM(incident, incident.length),
        edge.length * JUNCTION_TRIM_MAX_FRACTION,
      ) + STOP_LINE_BEYOND_CUT_M;
    // digits=1: the JSON's stored edge.length and the runtime's recomputed
    // polyline length differ by float noise (~mm).
    expect(line.sM).toBeCloseTo(edge.length - mouth, 1);
    // Sane approach bearing: the edge runs almost due north (≈ 358°).
    const delta = Math.abs(((line.approachBearingDeg - 358 + 540) % 360) - 180);
    expect(delta).toBeLessThan(10);
  });

  it("emits stopLineCrossed{stopSign} when driving the lesson-2 approach", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, APPROACH);
    const { ticks } = drive(rt, edgeDrivePath(edge, 40, edge.length - 0.5, 0.5, 0));
    const crossed = eventsOf(ticks, "stopLineCrossed");
    expect(crossed).toHaveLength(1);
    expect(crossed[0]).toEqual({ kind: "stopLineCrossed", control: "stopSign" });
  });

  it("removes the node from the uncontrolled (right-hand-rule) junction set", () => {
    const rt = createWorldRuntime(district);
    expect(rt.debugUncontrolledJunctions().some((j) => j.id === NODE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C1 revision — no stop lines INSIDE a signal cluster
// ---------------------------------------------------------------------------

describe("cluster-interior edges carry no stop lines (C1)", () => {
  const district = loadDistrict();

  it("invariant: no trafficLight line on an edge whose both ends share one cluster", () => {
    // OSM models one physical signalized complex (the „Семов" block, the NW
    // „Габровски" cluster) as several micro-nodes linked by 4–25 m stubs.
    // A stub BETWEEN two members of the same cluster is junction interior:
    // a driver who entered the complex on green would face the perpendicular
    // axis-group's red there, making the официален обратен завой around the
    // block ungradable (10-point RED_LIGHT_CROSSED for a lawful transit —
    // found by the C1 exam-bank driver bot on shells A/B/D/E/G).
    const rt = createWorldRuntime(district);
    const clusterOf = new Map<string, string>();
    for (const c of rt.debugSignalClusters()) {
      for (const m of c.memberNodeIds) clusterOf.set(m, c.id);
    }
    for (const line of rt.debugStopLines()) {
      if (line.control !== "trafficLight") continue;
      const edge = district.roads.edges[line.edgeIdx];
      const fromCluster = clusterOf.get(edge.from);
      const toCluster = clusterOf.get(edge.to);
      expect(
        fromCluster !== undefined && fromCluster === toCluster,
        `${line.id} lies interior to signal cluster ${fromCluster}`,
      ).toBe(false);
    }
  });

  it("pins the Семов-block stub e672166612.0 clean and the outer approach guarded", () => {
    const rt = createWorldRuntime(district);
    const lines = rt.debugStopLines();
    const onEdge = (id: string) =>
      lines.filter((l) => district.roads.edges[l.edgeIdx].id === id);
    // Interior stub n1805512645 → n6294440266 (7 m, both cluster members).
    expect(onEdge("e672166612.0")).toHaveLength(0);
    // Outer boulevard approach into the complex (n6294463135 is unsignalized,
    // n1805512602 signalized) keeps its line — entry is still graded.
    expect(onEdge("e672169336.0").length).toBeGreaterThan(0);
  });
});
