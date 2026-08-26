import { describe, expect, it } from "vitest";
import { DrivelineState } from "../../vehicle/driveline";
import {
  COCKPIT_HOTSPOT_NAMES,
  createPreDriveSignalTracker,
  hotspotsForStep,
  isCockpitHotspotName,
  observeControlSignal,
  PRE_DRIVE_INFO_STEPS,
  PRE_DRIVE_STEP_CONTROLS,
  preDriveStepKind,
  readyToMoveOff,
  type PreDriveControlSignal,
} from "../performedSteps";
import { PRE_DRIVE_STEP_ORDER } from "../steps";
import type { PreDriveStepId } from "../types";

function observe(tracker = createPreDriveSignalTracker()) {
  return {
    tracker,
    step: (signal: PreDriveControlSignal) => observeControlSignal(tracker, signal),
  };
}

describe("performed steps — driveline transitions", () => {
  it("engineStarted → start-engine, exactly once", () => {
    const o = observe();
    expect(o.step({ kind: "driveline", event: { kind: "engineStarted" } })).toBe("start-engine");
    expect(o.step({ kind: "driveline", event: { kind: "engineStarted" } })).toBeNull();
  });

  it("selector reaching a forward drive gear (D or M) → select-gear; P/R/N do not", () => {
    const o = observe();
    expect(
      o.step({ kind: "driveline", event: { kind: "selectorChanged", selector: "R", manualGear: 1 } }),
    ).toBeNull();
    expect(
      o.step({ kind: "driveline", event: { kind: "selectorChanged", selector: "N", manualGear: 1 } }),
    ).toBeNull();
    expect(
      o.step({ kind: "driveline", event: { kind: "selectorChanged", selector: "D", manualGear: 1 } }),
    ).toBe("select-gear");
  });

  it("manual mode: selecting M performs select-gear too", () => {
    const o = observe();
    expect(
      o.step({ kind: "driveline", event: { kind: "selectorChanged", selector: "M", manualGear: 1 } }),
    ).toBe("select-gear");
  });

  it("parking brake released → release-handbrake; re-engaging does nothing", () => {
    const o = observe();
    expect(o.step({ kind: "driveline", event: { kind: "parkingBrakeChanged", on: true } })).toBeNull();
    expect(o.step({ kind: "driveline", event: { kind: "parkingBrakeChanged", on: false } })).toBe(
      "release-handbrake",
    );
    expect(o.step({ kind: "driveline", event: { kind: "parkingBrakeChanged", on: false } })).toBeNull();
  });

  it("irrelevant driveline events (hazards, wipers, rejections) perform nothing", () => {
    const o = observe();
    expect(o.step({ kind: "driveline", event: { kind: "hazardsChanged", on: true } })).toBeNull();
    expect(o.step({ kind: "driveline", event: { kind: "wipersChanged", on: true } })).toBeNull();
    expect(
      o.step({ kind: "driveline", event: { kind: "startRejected", reason: "selector" } }),
    ).toBeNull();
    expect(o.step({ kind: "driveline", event: { kind: "engineStopped" } })).toBeNull();
  });
});

describe("performed steps — cabin electrics and pedals", () => {
  it("belt on → fasten-seatbelt (belt off is not a step)", () => {
    const o = observe();
    expect(o.step({ kind: "seatbelt", on: false })).toBeNull();
    expect(o.step({ kind: "seatbelt", on: true })).toBe("fasten-seatbelt");
  });

  it("headlights leaving off → headlights-on (low or high both count)", () => {
    const low = observe();
    expect(low.step({ kind: "headlights", setting: "off" })).toBeNull();
    expect(low.step({ kind: "headlights", setting: "low" })).toBe("headlights-on");
    const high = observe();
    expect(high.step({ kind: "headlights", setting: "high" })).toBe("headlights-on");
  });

  it("LEFT indicator → signal; right indicator does not (move-off is a left signal)", () => {
    const o = observe();
    expect(o.step({ kind: "indicator", setting: "right" })).toBeNull();
    expect(o.step({ kind: "indicator", setting: "off" })).toBeNull();
    expect(o.step({ kind: "indicator", setting: "left" })).toBe("signal");
  });

  it("brake press → press-brake; throttle on a ready driveline → move-off", () => {
    const o = observe();
    expect(o.step({ kind: "brakePressed" })).toBe("press-brake");
    expect(o.step({ kind: "brakePressed" })).toBeNull();
    expect(o.step({ kind: "moveOffAttempt" })).toBe("move-off");
  });
});

describe("performed steps — mirror glances (the graded path)", () => {
  it("all three mirrors glanced = adjust-mirrors; the NEXT glance = final-mirror-check", () => {
    const o = observe();
    expect(o.step({ kind: "glance", mirror: "left" })).toBeNull();
    expect(o.step({ kind: "glance", mirror: "left" })).toBeNull(); // repeat — no progress
    expect(o.step({ kind: "glance", mirror: "right" })).toBeNull();
    expect(o.step({ kind: "glance", mirror: "rear" })).toBe("adjust-mirrors");
    expect(o.step({ kind: "glance", mirror: "left" })).toBe("final-mirror-check");
    expect(o.step({ kind: "glance", mirror: "rear" })).toBeNull(); // both mirror steps done
  });
});

describe("readyToMoveOff — the move-off gate", () => {
  const base = {
    engineOn: true,
    selector: "D" as const,
    manualGear: 1,
    clutchDown: false,
    parkingBrakeOn: false,
  };

  it("requires engine on, a forward gear and a released parking brake", () => {
    expect(readyToMoveOff(base)).toBe(true);
    expect(readyToMoveOff({ ...base, selector: "M" })).toBe(true);
    expect(readyToMoveOff({ ...base, engineOn: false })).toBe(false);
    expect(readyToMoveOff({ ...base, selector: "P" })).toBe(false);
    expect(readyToMoveOff({ ...base, selector: "N" })).toBe(false);
    expect(readyToMoveOff({ ...base, selector: "R" })).toBe(false); // move-off is forward
    expect(readyToMoveOff({ ...base, parkingBrakeOn: true })).toBe(false);
  });

  it("ignores the clutch (a manual move-off starts clutch-down)", () => {
    expect(readyToMoveOff({ ...base, selector: "M", clutchDown: true })).toBe(true);
  });
});

describe("step classification + control metadata", () => {
  it("exactly the three walkaround steps are info; the other ten are performed", () => {
    const info = PRE_DRIVE_STEP_ORDER.filter((id) => preDriveStepKind(id) === "info");
    expect(info).toEqual(["adjust-seat", "check-surroundings", "check-dashboard"]);
    expect(info).toEqual([...PRE_DRIVE_INFO_STEPS]);
  });

  it("every performed step has control metadata (key hint); info steps have none", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      const control = PRE_DRIVE_STEP_CONTROLS[id];
      if (preDriveStepKind(id) === "performed") {
        expect(control, id).toBeDefined();
        expect(control!.keys.length, id).toBeGreaterThan(0);
      } else {
        expect(control, id).toBeUndefined();
      }
    }
  });

  it("hotspotsForStep only names doc-69 contract hotspots", () => {
    for (const id of PRE_DRIVE_STEP_ORDER) {
      for (const name of hotspotsForStep(id)) {
        expect(COCKPIT_HOTSPOT_NAMES).toContain(name);
      }
    }
    // Pedal-performed steps highlight no hotspot.
    expect(hotspotsForStep("press-brake")).toEqual([]);
    expect(hotspotsForStep("move-off")).toEqual([]);
  });
});

describe("the doc-69 hotspot vocabulary", () => {
  /* THE WALK-UP ROW STOOD HERE and went out with `resolveHotspotName` on
     2026-08-26. It proved that a click on `hotspot_engine_start > starter_bezel
     > <unnamed>` resolves to the hotspot — a correct rule for a cockpit nobody
     has built. `VitokCockpit.tsx` binds `onPointerDown`/`onClick` per hotspot
     MESH over a `spec` in the closure, so no pick is ever resolved by name and
     no hotspot has children. The vocabulary itself is the contract and is
     asserted below, unchanged. */

  it("isCockpitHotspotName accepts exactly the contract vocabulary", () => {
    for (const name of COCKPIT_HOTSPOT_NAMES) expect(isCockpitHotspotName(name)).toBe(true);
    expect(isCockpitHotspotName("hotspot_sunroof")).toBe(false);
    expect(isCockpitHotspotName("engine_start")).toBe(false);
  });
});

describe("integration: a real DrivelineState feeds the tracker", () => {
  it("cold-start driveaway chain performs start-engine → select-gear → release-handbrake", () => {
    const driveline = new DrivelineState("cold"); // engine OFF, P, brake ON
    const events: PreDriveControlSignal[] = [];
    driveline.subscribe((event) => events.push({ kind: "driveline", event }));

    driveline.toggleEngine(); // P → allowed
    driveline.gearUp(); // P → R
    driveline.gearUp(); // R → N
    driveline.gearUp(); // N → D
    driveline.toggleParkingBrake(); // ON → off

    const tracker = createPreDriveSignalTracker();
    const performed = events
      .map((s) => observeControlSignal(tracker, s))
      .filter((s): s is PreDriveStepId => s !== null);
    expect(performed).toEqual(["start-engine", "select-gear", "release-handbrake"]);
    expect(readyToMoveOff(driveline.physicsInput)).toBe(true);
  });
});
