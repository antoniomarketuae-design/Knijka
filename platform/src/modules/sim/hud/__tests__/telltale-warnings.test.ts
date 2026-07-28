import { describe, expect, it } from "vitest";
import { createDashboardStatus, type DashboardStatus } from "../dashboardStatus";
import { armedTelltaleWarnings, telltaleWarningsKey } from "../telltaleWarnings";

/**
 * The edge pings exist because a telltale nobody looks at teaches nothing
 * (founder 2026-07-28). Their whole value depends on being ARMED, not merely
 * "lamp off": a car parked with the engine off must be silent, and a fault the
 * rule engine is about to grade must not be.
 */

function status(over: Partial<DashboardStatus> = {}): DashboardStatus {
  return { ...createDashboardStatus(), ...over };
}

const ids = (s: DashboardStatus) => armedTelltaleWarnings(s).map((w) => w.id);

describe("armedTelltaleWarnings", () => {
  it("says nothing about a cold parked car", () => {
    // Engine off, belt off, parking brake on — the A1 spawn state. Warning
    // here would fire on every single session before the student did anything.
    expect(ids(status())).toEqual([]);
  });

  it("arms the belt as soon as the engine runs, before the car moves", () => {
    // The belt has to be on BEFORE moving off; a ping that waits for motion
    // arrives one graded mistake late.
    expect(ids(status({ engineOn: true }))).toEqual(["belt"]);
  });

  it("arms the belt on a rolling car even with the engine stalled", () => {
    expect(ids(status({ engineOn: false, speedKmh: 20 }))).toContain("belt");
  });

  it("drops the belt warning once buckled", () => {
    expect(ids(status({ engineOn: true, seatbeltOn: true }))).toEqual([]);
  });

  it("arms the parking brake only while actually moving", () => {
    const rolling = status({ engineOn: true, seatbeltOn: true, parkingBrakeOn: true, speedKmh: 12 });
    expect(ids(rolling)).toEqual(["handbrake"]);
    // Stationary with the brake on is the correct state, not a fault.
    const parked = status({ engineOn: true, seatbeltOn: true, parkingBrakeOn: true, speedKmh: 0 });
    expect(ids(parked)).toEqual([]);
  });

  it("arms the headlights only when the conditions require them", () => {
    const base = { engineOn: true, seatbeltOn: true, parkingBrakeOn: false } as const;
    expect(ids(status({ ...base, headlights: "off" }))).toEqual([]);
    expect(ids(status({ ...base, headlights: "off", headlightsRequired: true }))).toEqual(["lights"]);
    expect(ids(status({ ...base, headlights: "low", headlightsRequired: true }))).toEqual([]);
  });

  it("arms the fog lamps only in fog", () => {
    const base = { engineOn: true, seatbeltOn: true, parkingBrakeOn: false } as const;
    expect(ids(status({ ...base, fogLightsOn: false }))).toEqual([]);
    expect(ids(status({ ...base, fogLightsOn: false, fogLightsRequired: true }))).toEqual(["fog"]);
  });

  it("flags forgotten hazards at cruising speed but not at a genuine stop", () => {
    const base = { engineOn: true, seatbeltOn: true, parkingBrakeOn: false, hazardsOn: true } as const;
    // Standing with hazards on is a legitimate „I am an obstacle" signal.
    expect(ids(status({ ...base, speedKmh: 0 }))).toEqual([]);
    expect(ids(status({ ...base, speedKmh: 45 }))).toEqual(["hazards"]);
  });

  it("orders by safety and splits the two rails so neither side stacks alone", () => {
    const all = armedTelltaleWarnings(
      status({
        engineOn: true,
        seatbeltOn: false,
        parkingBrakeOn: true,
        speedKmh: 40,
        headlights: "off",
        headlightsRequired: true,
        fogLightsRequired: true,
        hazardsOn: true,
      }),
    );
    expect(all.map((w) => w.id)).toEqual(["belt", "handbrake", "lights", "fog", "hazards"]);
    expect(all.filter((w) => w.side === "left").map((w) => w.id)).toEqual(["belt", "handbrake"]);
    expect(all.filter((w) => w.side === "right").map((w) => w.id)).toEqual([
      "lights",
      "fog",
      "hazards",
    ]);
  });

  it("names a fixing key for every warning it can raise", () => {
    const all = armedTelltaleWarnings(
      status({
        engineOn: true,
        parkingBrakeOn: true,
        speedKmh: 40,
        headlights: "off",
        headlightsRequired: true,
        fogLightsRequired: true,
        hazardsOn: true,
      }),
    );
    expect(all.every((w) => typeof w.keyHint === "string" && w.keyHint.length > 0)).toBe(true);
  });

  it("keys the render on the armed SET, so speed jitter never re-renders", () => {
    const a = armedTelltaleWarnings(status({ engineOn: true, speedKmh: 41.2 }));
    const b = armedTelltaleWarnings(status({ engineOn: true, speedKmh: 41.9 }));
    expect(telltaleWarningsKey(a)).toBe(telltaleWarningsKey(b));
    const c = armedTelltaleWarnings(status({ engineOn: true, seatbeltOn: true, speedKmh: 41.9 }));
    expect(telltaleWarningsKey(c)).not.toBe(telltaleWarningsKey(b));
  });
});
