/**
 * JU-18 регулировчик — the "controlled" signal-cluster mode + authored
 * permission timetable (ADR-006 stage 1d), against the committed sx-v1
 * district (single-node cluster sx-n-c at the origin; south-approach stop
 * line at sM 92.275 of sx-e-s ⇒ y = −27.725, group "ns").
 *
 * The capability contract:
 *  - permissions are a PURE function of authored schedule + controller time
 *    (deterministic — same dt sequence, same permissions);
 *  - a "controlled" cluster is NOT uncontrolled (never right-hand-rule) and
 *    its lamps KEEP cycling — misleading-but-visible;
 *  - stop-line crossings carry BOTH the lamp truth (lightState) and the
 *    controller permission; the surfaced next-line context reads the
 *    EFFECTIVE signal ("red" while halted, the live lamp when permitted);
 *  - default absent = byte-identical live behavior (no controller field).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import type { SimTickEvent } from "../../rules/types";
import { createWorldRuntime, parseDistrict, type DistrictWorldRuntime } from "..";
import { SignalController } from "../signals";
import { DistrictIndex } from "../spatial";

const SX_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../../content/world/sx-v1.json",
);
const sxRaw = JSON.parse(readFileSync(SX_PATH, "utf-8")) as unknown;

const NODE = "sx-n-c";
const LANE = 4.0625;
const LINE_Y = -27.725;

function mkSignals(): SignalController {
  const district = parseDistrict(sxRaw);
  return new SignalController(district, new DistrictIndex(district));
}

function sampleAt(rt: DistrictWorldRuntime, y: number, t: number, speedKmh = 20) {
  const v: VehicleSample = {
    position: { x: LANE, y },
    headingDeg: 0,
    speedKmh,
    indicator: "off",
    headlights: "off",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    mirrorGlance: null,
  };
  return rt.sample(v, t, false);
}

/** Drive north across the south stop line in small steps; returns all events. */
function crossLine(rt: DistrictWorldRuntime, t0: number): { events: SimTickEvent[]; t: number } {
  const events: SimTickEvent[] = [];
  let t = t0;
  for (let y = -40; y <= -20; y += 1) {
    const tick = sampleAt(rt, y, t);
    events.push(...tick.events);
    t += 0.1;
    rt.update(0.1);
  }
  return { events, t };
}

function lineCrossings(events: SimTickEvent[]) {
  return events.filter(
    (e): e is Extract<SimTickEvent, { kind: "stopLineCrossed" }> => e.kind === "stopLineCrossed",
  );
}

describe("SignalController — controller permission timetable (JU-18)", () => {
  it("static halt: the halted axis reads 'halt', the other 'proceed', forever", () => {
    const s = mkSignals();
    s.setClusterController(NODE, { haltedGroup: "ns" });
    expect(s.clusterMode(0)).toBe("controlled");
    expect(s.controllerPermission(0, "ns")).toBe("halt");
    expect(s.controllerPermission(0, "ew")).toBe("proceed");
    s.update(1000);
    expect(s.controllerPermission(0, "ns")).toBe("halt");
    expect(s.controllerPermission(0, "ew")).toBe("proceed");
  });

  it("single authored flip: permissions swap exactly at flipAtSec", () => {
    const s = mkSignals();
    s.setClusterController(NODE, { haltedGroup: "ns", flipAtSec: 30 });
    s.update(29.9);
    expect(s.controllerPermission(0, "ns")).toBe("halt");
    expect(s.controllerPermission(0, "ew")).toBe("proceed");
    s.update(0.2); // t = 30.1 — flipped
    expect(s.controllerPermission(0, "ns")).toBe("proceed");
    expect(s.controllerPermission(0, "ew")).toBe("halt");
  });

  it("deterministic: two controllers fed the same dt sequence agree on every permission", () => {
    const a = mkSignals();
    const b = mkSignals();
    a.setClusterController(NODE, { haltedGroup: "ns", flipAtSec: 12.5 });
    b.setClusterController(NODE, { haltedGroup: "ns", flipAtSec: 12.5 });
    for (const dt of [0.016, 3.3, 0.4, 8.9, 0.016, 4.1]) {
      a.update(dt);
      b.update(dt);
      expect(a.controllerPermission(0, "ns")).toBe(b.controllerPermission(0, "ns"));
      expect(a.controllerPermission(0, "ew")).toBe(b.controllerPermission(0, "ew"));
    }
  });

  it("the lamps KEEP cycling under a controller (misleading-but-visible)", () => {
    const s = mkSignals();
    s.setClusterController(NODE, { haltedGroup: "ns" });
    const seen = new Set<string>();
    for (let t = 0; t < 50; t += 0.5) {
      s.update(0.5);
      seen.add(s.phaseForClusterGroup(0, "ns"));
    }
    expect([...seen].sort()).toEqual(["green", "red", "redYellow", "yellow"]);
  });

  it("'controlled' is NOT uncontrolled; dark/flashing are; live is not", () => {
    const s = mkSignals();
    expect(s.isClusterUncontrolled(0)).toBe(false); // live
    s.setClusterController(NODE, { haltedGroup: "ns" });
    expect(s.isClusterUncontrolled(0)).toBe(false); // controlled — signals govern
    s.setClusterMode(NODE, "dark");
    expect(s.isClusterUncontrolled(0)).toBe(true);
    s.setClusterMode(NODE, "flashingAmber");
    expect(s.isClusterUncontrolled(0)).toBe(true);
  });

  it("fail-innocent gates: no schedule / non-controlled mode / recall ⇒ null permission", () => {
    const s = mkSignals();
    expect(s.controllerPermission(0, "ns")).toBeNull(); // live, nothing posted
    s.setClusterMode(NODE, "controlled"); // mode without a schedule
    expect(s.controllerPermission(0, "ns")).toBeNull();
    s.setClusterController(NODE, { haltedGroup: "ns" });
    expect(s.controllerPermission(0, "ns")).toBe("halt");
    s.setClusterMode(NODE, "dark"); // mode gates the schedule
    expect(s.controllerPermission(0, "ns")).toBeNull();
    s.setClusterController(NODE, { haltedGroup: "ns" });
    s.setClusterController(NODE, null); // recall — back to live
    expect(s.clusterMode(0)).toBe("live");
    expect(s.controllerPermission(0, "ns")).toBeNull();
    s.setClusterController("no-such-node", { haltedGroup: "ns" }); // no-op
    expect(s.controllerPermission(0, "ns")).toBeNull();
  });
});

describe("worldRuntime — controlled-cluster stop-line semantics (JU-18)", () => {
  it("halted approach, GREEN lamps: the crossing event carries lightState 'green' + controller 'halt'", () => {
    const rt = createWorldRuntime(sxRaw);
    rt.setSignalClusterOffset(NODE, 45); // ns lamps green for t ∈ [5, 25)
    rt.setSignalClusterController(NODE, { haltedGroup: "ns" });
    // Advance into the green window, then drive across the line.
    rt.update(10);
    expect(rt.signalPhaseForApproach(NODE, 0)).toBe("green");
    const { events } = crossLine(rt, 10);
    const crossings = lineCrossings(events);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toEqual({
      kind: "stopLineCrossed",
      control: "trafficLight",
      lightState: "green",
      controller: "halt",
    });
  });

  it("permitted approach, RED lamps: controller 'proceed' rides the event (innocent side)", () => {
    const rt = createWorldRuntime(sxRaw);
    rt.setSignalClusterOffset(NODE, 45);
    rt.setSignalClusterController(NODE, { haltedGroup: "ns", flipAtSec: 30 });
    rt.update(32); // past the flip; ns lamps are red at t = 32 (u = 27)
    expect(rt.signalPhaseForApproach(NODE, 0)).toBe("red");
    const { events } = crossLine(rt, 32);
    const crossings = lineCrossings(events);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].controller).toBe("proceed");
    expect(crossings[0].lightState).toBe("red");
  });

  it("surfaced next-line context reads the EFFECTIVE signal: 'red' while halted under green lamps", () => {
    const rt = createWorldRuntime(sxRaw);
    rt.setSignalClusterOffset(NODE, 45);
    rt.setSignalClusterController(NODE, { haltedGroup: "ns" });
    rt.update(10); // green lamps
    const tick = sampleAt(rt, -45, 10, 15);
    expect(tick.nextStopLineControl).toBe("trafficLight");
    expect(tick.nextStopLineState).toBe("red"); // the controller's halt, not the lamp
    expect(rt.signalPhaseForApproach(NODE, 0)).toBe("green");
  });

  it("recalling the controller restores live lamp grading (no controller field)", () => {
    const rt = createWorldRuntime(sxRaw);
    rt.setSignalClusterOffset(NODE, 45);
    rt.setSignalClusterController(NODE, { haltedGroup: "ns" });
    rt.setSignalClusterController(NODE, null);
    rt.update(10); // green window
    const { events } = crossLine(rt, 10);
    const crossings = lineCrossings(events);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].lightState).toBe("green");
    expect(crossings[0].controller).toBeUndefined();
  });

  it("mode 'controlled' without a schedule adjudicates as live (fail-innocent)", () => {
    const rt = createWorldRuntime(sxRaw);
    rt.setSignalClusterOffset(NODE, 45);
    rt.setSignalClusterMode(NODE, "controlled");
    rt.update(10);
    const { events } = crossLine(rt, 10);
    const crossings = lineCrossings(events);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].controller).toBeUndefined();
    expect(crossings[0].lightState).toBe("green");
  });
});
