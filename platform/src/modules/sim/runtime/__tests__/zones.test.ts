import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "..";
import { drive, edgeById, edgeDrivePath, loadDistrict } from "./helpers";

/**
 * Crossing-zone sequencing on a real crossing: n676643323 (marked, not
 * signalized) sits at s ≈ 120.8 of e170139947.0 (ул. Проф. Борис Боровски,
 * two-way, 131.3 m) — a clean straight approach with the zone fully on-edge.
 */
const CROSSING = "n676643323";
const HOST_EDGE = "e170139947.0";

type ZoneEvent = { kind: string; crossingId?: string; pedestrianOnCrossing?: boolean };

function zoneEventsFor(ticks: ReturnType<typeof drive>["ticks"], crossingId: string): ZoneEvent[] {
  const out: ZoneEvent[] = [];
  for (const tick of ticks) {
    for (const e of tick.events) {
      if (
        (e.kind === "crossingZoneEntered" || e.kind === "crossingPassed") &&
        e.crossingId === crossingId
      ) {
        out.push(e);
      }
    }
  }
  return out;
}

describe("pedestrian crossing zones", () => {
  const district = loadDistrict();

  it("emits crossingZoneEntered (~25 m out) then crossingPassed, exactly once each", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, HOST_EDGE);
    const { ticks } = drive(rt, edgeDrivePath(edge, 80, 131, 1, 1.625));
    const seq = zoneEventsFor(ticks, CROSSING);
    expect(seq.map((e) => e.kind)).toEqual(["crossingZoneEntered", "crossingPassed"]);
    // No pedestrians exist yet (no traffic module): flag must be false.
    expect(seq.every((e) => e.pedestrianOnCrossing === false)).toBe(true);
    // Zone arms roughly 25 m before the crossing (s≈120.8 ⇒ enter s≈96):
    // with 1 m steps the entered event must come well before the pass.
    const enterIdx = ticks.findIndex((t) => t.events.some((e) => e.kind === "crossingZoneEntered"));
    const passIdx = ticks.findIndex((t) => t.events.some((e) => e.kind === "crossingPassed"));
    expect(enterIdx).toBeGreaterThanOrEqual(0);
    expect(passIdx - enterIdx).toBeGreaterThan(15);
  });

  it("does not arm the zone from a distant parallel street (edge-adjacency gate)", () => {
    // e903163172.0 hosts crossing n263750759; driving e170139947.0 must never
    // touch it — and driving nowhere near a zone emits no zone events at all.
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, HOST_EDGE);
    const { ticks } = drive(rt, edgeDrivePath(edge, 80, 131, 1, 1.625));
    expect(zoneEventsFor(ticks, "n263750759")).toHaveLength(0);
  });

  it("passes the live pedestrian flag through on both events", () => {
    const rt = createWorldRuntime(district);
    rt.setPedestrianQuery((id) => id === CROSSING);
    const edge = edgeById(district, HOST_EDGE);
    const { ticks } = drive(rt, edgeDrivePath(edge, 80, 131, 1, 1.625));
    const seq = zoneEventsFor(ticks, CROSSING);
    expect(seq.map((e) => e.kind)).toEqual(["crossingZoneEntered", "crossingPassed"]);
    expect(seq.every((e) => e.pedestrianOnCrossing === true)).toBe(true);
  });

  it("re-emits crossingZoneEntered when a pedestrian steps on mid-zone", () => {
    const rt = createWorldRuntime(district);
    let pedestrian = false;
    rt.setPedestrianQuery(() => pedestrian);
    const edge = edgeById(district, HOST_EDGE);

    const r1 = drive(rt, edgeDrivePath(edge, 80, 105, 1, 1.625)); // inside zone, before crossing
    pedestrian = true; // steps onto the crossing while we approach
    const r2 = drive(rt, edgeDrivePath(edge, 106, 131, 1, 1.625), { t0Sec: r1.tEnd });

    const seq = [...zoneEventsFor(r1.ticks, CROSSING), ...zoneEventsFor(r2.ticks, CROSSING)];
    expect(seq.map((e) => [e.kind, e.pedestrianOnCrossing])).toEqual([
      ["crossingZoneEntered", false],
      ["crossingZoneEntered", true], // re-emit with the updated flag
      ["crossingPassed", true],
    ]);
  });

  it("re-arms after leaving the zone (exit hysteresis at ~28 m)", () => {
    const rt = createWorldRuntime(district);
    const edge = edgeById(district, HOST_EDGE);
    const forth = edgeDrivePath(edge, 80, 131, 1, 1.625);
    const back = edgeDrivePath(edge, 131, 80, 1, 1.625); // exits the zone at s≈93
    const again = edgeDrivePath(edge, 80, 131, 1, 1.625);
    const r1 = drive(rt, forth);
    // Reversing back over the crossing while STILL inside the zone is latched
    // (one pass per zone visit); the exit at >28 m re-arms everything.
    const r2 = drive(rt, back, { t0Sec: r1.tEnd });
    const r3 = drive(rt, again, { t0Sec: r2.tEnd });
    expect(zoneEventsFor(r1.ticks, CROSSING).map((e) => e.kind)).toEqual([
      "crossingZoneEntered",
      "crossingPassed",
    ]);
    expect(zoneEventsFor(r2.ticks, CROSSING)).toHaveLength(0);
    expect(zoneEventsFor(r3.ticks, CROSSING).map((e) => e.kind)).toEqual([
      "crossingZoneEntered",
      "crossingPassed",
    ]);
  });
});
