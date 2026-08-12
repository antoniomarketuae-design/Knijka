/**
 * DrivelineState — the A1 vehicle state machine (driveline.ts).
 *
 * Covers the required suite: cold/ready spawn, selector-gate legality,
 * engine-start interlocks, the manual stall model (grace timing, throttle
 * threshold, clutch escape, restart), transmission switching behind the
 * difficulty toggle, and the event stream A2's procedures will subscribe to.
 */

import { describe, expect, it } from "vitest";
import {
  DrivelineState,
  gearForSpeedKmh,
  hasDriveTraction,
  forwardForceScale,
  transmissionModeFor,
  MANUAL_GEAR_COUNT,
  MANUAL_GEAR_MAX_KMH,
  SELECTOR_ENGAGE_MAX_KMH,
  STALL_BELOW_KMH,
  STALL_GRACE_S,
  STALL_MIN_THROTTLE,
  type DrivelineEvent,
  type TransmissionMode,
} from "./driveline";

/** Fresh machine + captured event log. */
function rig(start: "cold" | "ready" = "cold") {
  const d = new DrivelineState(start);
  const events: DrivelineEvent[] = [];
  d.subscribe((e) => events.push(e));
  return { d, events };
}

/** Advance the stall clock in small frames (like the render loop does).
 *  `transmission` is optional and mirrors `update()`'s own signature — the
 *  render loop passes it every frame, so a test that holds a tier across a
 *  grace window must be able to as well (doc 87 A4). */
function tick(
  d: DrivelineState,
  seconds: number,
  ctx: { speedKmh: number; throttle: number; transmission?: TransmissionMode },
) {
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) d.update(step, ctx);
}

const STILL = { speedKmh: 0, throttle: 0 };

describe("spawn policy", () => {
  it("cold spawn: engine OFF, selector P, parking brake ON (the pre-drive reality)", () => {
    const { d } = rig("cold");
    expect(d.engineOn).toBe(false);
    expect(d.selector).toBe("P");
    expect(d.parkingBrakeOn).toBe(true);
    expect(d.stalled).toBe(false);
    expect(d.gearLabel).toBe("P");
    expect(hasDriveTraction(d.physicsInput)).toBe(false);
  });

  it("ready spawn: engine running in D, brake released (L0 free drive)", () => {
    const { d } = rig("ready");
    expect(d.engineOn).toBe(true);
    expect(d.selector).toBe("D");
    expect(d.parkingBrakeOn).toBe(false);
    expect(hasDriveTraction(d.physicsInput)).toBe(true);
  });
});

describe("selector gate (automatic)", () => {
  it("walks P → R → N → D at standstill and stops at the gate ends", () => {
    const { d, events } = rig("cold");
    expect(d.gearUp()).toBe(true); // P → R
    expect(d.selector).toBe("R");
    expect(d.gearUp()).toBe(true); // R → N
    expect(d.gearUp()).toBe(true); // N → D
    expect(d.selector).toBe("D");
    expect(d.gearUp()).toBe(false); // end of gate
    expect(events.filter((e) => e.kind === "selectorChanged")).toHaveLength(3);
    expect(events.at(-1)).toEqual({ kind: "shiftRejected", reason: "endOfGate" });

    expect(d.gearDown()).toBe(true); // D → N
    expect(d.gearDown()).toBe(true); // N → R
    expect(d.gearDown()).toBe(true); // R → P
    expect(d.selector).toBe("P");
    expect(d.gearDown()).toBe(false); // end of gate
  });

  it("rejects engaging R above the standstill threshold, allows it below", () => {
    const { d, events } = rig("ready"); // in D
    d.update(1 / 60, { speedKmh: 30, throttle: 0 });
    expect(d.gearDown()).toBe(true); // D → N is fine at speed
    expect(d.gearDown()).toBe(false); // N → R rejected at 30 km/h
    expect(d.selector).toBe("N");
    expect(events.at(-1)).toEqual({ kind: "shiftRejected", reason: "speed" });

    d.update(1 / 60, { speedKmh: SELECTOR_ENGAGE_MAX_KMH - 1, throttle: 0 });
    expect(d.gearDown()).toBe(true); // N → R once (nearly) stopped
    expect(d.selector).toBe("R");
    expect(d.gearLabel).toBe("R");
  });

  it("allows N → D while rolling (a real automatic does)", () => {
    const { d } = rig("ready");
    d.update(1 / 60, { speedKmh: 45, throttle: 0.4 });
    expect(d.gearDown()).toBe(true); // D → N
    expect(d.gearUp()).toBe(true); // N → D at 45 km/h
    expect(d.selector).toBe("D");
  });
});

describe("engine start interlocks", () => {
  it("automatic: starts only from P or N", () => {
    const { d, events } = rig("cold");
    expect(d.toggleEngine()).toBe(true); // P → ok
    expect(d.engineOn).toBe(true);
    d.gearUp(); // R
    d.gearUp(); // N
    d.gearUp(); // D
    expect(d.toggleEngine()).toBe(true); // stopping is always allowed
    expect(d.engineOn).toBe(false);
    expect(d.toggleEngine()).toBe(false); // restart in D rejected
    expect(events.at(-1)).toEqual({ kind: "startRejected", reason: "selector" });
    d.gearDown(); // D → N
    expect(d.toggleEngine()).toBe(true);
    expect(d.engineOn).toBe(true);
  });

  it("manual: the clutch is an alternative interlock (restart in gear)", () => {
    const { d, events } = rig("cold");
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    d.toggleEngine(); // start in P
    d.setClutch(true);
    d.gearUp(); // R
    d.gearUp(); // N
    d.gearUp(); // M1
    expect(d.selector).toBe("M");
    d.toggleEngine(); // stop while in gear
    d.setClutch(false);
    expect(d.toggleEngine()).toBe(false); // in gear, clutch up → rejected
    expect(events.at(-1)).toEqual({ kind: "startRejected", reason: "clutch" });
    d.setClutch(true);
    expect(d.toggleEngine()).toBe(true); // clutch down → starts in gear
  });
});

describe("manual mode (behind the difficulty toggle)", () => {
  it("difficulty mapping: only 'advanced' drives the manual box", () => {
    expect(transmissionModeFor("beginner")).toBe("automatic");
    expect(transmissionModeFor("normal")).toBe("automatic");
    expect(transmissionModeFor("advanced")).toBe("manual");
  });

  it("switching to manual converts D to a speed-matched M gear and back", () => {
    const { d, events } = rig("ready");
    d.update(1 / 60, { speedKmh: 45, throttle: 0.3, transmission: "manual" });
    expect(d.transmission).toBe("manual");
    expect(d.selector).toBe("M");
    expect(d.manualGear).toBe(gearForSpeedKmh(45));
    expect(d.gearLabel).toBe(`M${gearForSpeedKmh(45)}`);
    expect(events.some((e) => e.kind === "transmissionChanged")).toBe(true);

    d.update(1 / 60, { speedKmh: 45, throttle: 0.3, transmission: "automatic" });
    expect(d.selector).toBe("D");
    expect(d.clutchDown).toBe(false);
  });

  // -------------------------------------------------------------------------
  // doc 87 A4 — „I tried to go from Advanced to Normal, and the engine turned
  // off, and when I went back to Normal it did not turn on."
  //
  // Both assertions below FAIL on the pre-fix switchTransmission: the first
  // because a standing car went to M1 and update() stalled it 0.7 s later, the
  // second because the dead car came back in D and toggleEngine() refuses to
  // start an automatic outside P/N. Rendered before and after:
  // scratchpad/ovg/frames/A4-t020.png (before) / A4fix-* (after).
  // -------------------------------------------------------------------------
  it("A4: switching tier on a PARKED car does not stall it", () => {
    const { d } = rig("ready"); // engine running, D, brake off
    expect(d.selector).toBe("D");
    d.update(1 / 60, { ...STILL, transmission: "manual" }); // click „Напреднал"
    expect(d.selector).toBe("N"); // neutral, not first gear
    tick(d, STALL_GRACE_S * 4, { ...STILL, transmission: "manual" });
    expect(d.engineOn).toBe(true);
    expect(d.stalled).toBe(false);
  });

  it("A4: the tier round trip on a parked car is a no-op — the car is still in D and still drives", () => {
    const { d } = rig("ready");
    d.update(1 / 60, { ...STILL, transmission: "manual" }); // „Напреднал"
    expect(d.selector).toBe("N");
    d.update(1 / 60, { ...STILL, transmission: "automatic" }); // „Нормален"
    expect(d.selector).toBe("D");
    expect(d.engineOn).toBe(true);
    expect(hasDriveTraction(d.physicsInput)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 2026-08-11 — A4's OWN UNFINISHED SENTENCE. Its note reads „the student
  // gets the engine back but sits in neutral with nothing on screen saying so,
  // which is the same complaint wearing a different hat" — and then only the
  // round trip was closed. Measured on /dev/drive-rig the same day: a click on
  // „Напреднал" with the car standing still moved the selector D → N with ZERO
  // toasts, and holding ↓ for 12.5 s after it produced zero more.
  //
  // `movedSelectorTo` is what lets the cockpit say it. The rule it encodes is
  // „report a lever THE SWITCH moved, and only that" — so the round trip, which
  // puts the lever back where it was found, stays silent.
  // -------------------------------------------------------------------------
  it("A4: the tier switch REPORTS the lever it moved, so the cockpit can say so", () => {
    const { d, events } = rig("ready");
    d.update(1 / 60, { ...STILL, transmission: "manual" }); // click „Напреднал"
    expect(d.selector).toBe("N");
    expect(events.at(-1)).toEqual({
      kind: "transmissionChanged",
      transmission: "manual",
      movedSelectorTo: "N",
    });
  });

  it("A4: a MOVING car reports the gear it landed in, not a neutral it never saw", () => {
    const { d, events } = rig("ready");
    d.update(1 / 60, { speedKmh: 45, throttle: 0.3, transmission: "manual" });
    expect(d.selector).toBe("M");
    expect(events.at(-1)).toEqual({
      kind: "transmissionChanged",
      transmission: "manual",
      movedSelectorTo: "M",
    });
  });

  it("A4: putting a lever back where it was found is reported as NO move", () => {
    const { d, events } = rig("ready");
    d.update(1 / 60, { ...STILL, transmission: "manual" }); // D → N (ours)
    d.update(1 / 60, { ...STILL, transmission: "automatic" }); // …undone
    expect(d.selector).toBe("D");
    expect(events.at(-1)).toEqual({ kind: "transmissionChanged", transmission: "automatic" });
  });

  it("A4: a tier switch that moves nothing reports nothing", () => {
    const { d, events } = rig("ready");
    d.setClutch(true);
    d.gearDown(); // D → N, the STUDENT's own choice
    d.setClutch(false);
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    expect(d.selector).toBe("N");
    expect(events.at(-1)).toEqual({ kind: "transmissionChanged", transmission: "manual" });
  });

  it("A4: a neutral the STUDENT chose in manual is not overwritten by the round trip", () => {
    const { d } = rig("ready");
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    d.setClutch(true);
    expect(d.gearUp()).toBe(true); // N → M1, the student's own choice
    expect(d.gearDown()).toBe(true); // M1 → N, also the student's
    d.setClutch(false);
    d.update(1 / 60, { ...STILL, transmission: "automatic" });
    expect(d.selector).toBe("N");
  });

  it("A4: a car stalled in manual can be restarted after switching back to automatic", () => {
    const { d } = rig("ready");
    // Stall it for real, the way a student would: into gear, clutch up, no gas.
    d.update(1 / 60, { speedKmh: 20, throttle: 0.3, transmission: "manual" });
    expect(d.selector).toBe("M");
    tick(d, STALL_GRACE_S * 3, { ...STILL, transmission: "manual" });
    expect(d.engineOn).toBe(false);
    expect(d.stalled).toBe(true);
    // Click „Нормален" — and the starter must work from where it leaves you.
    d.update(1 / 60, { ...STILL, transmission: "automatic" });
    expect(d.toggleEngine()).toBe(true);
    expect(d.engineOn).toBe(true);
    expect(d.stalled).toBe(false);
  });

  it("gear changes and going into gear require the clutch while the engine runs", () => {
    const { d, events } = rig("cold");
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    d.toggleEngine(); // start in P
    d.setClutch(true);
    d.gearUp(); // R
    d.gearUp(); // N
    d.setClutch(false);
    expect(d.gearUp()).toBe(false); // N → M1 without clutch
    expect(events.at(-1)).toEqual({ kind: "shiftRejected", reason: "clutch" });
    d.setClutch(true);
    expect(d.gearUp()).toBe(true); // N → M1
    expect(d.gearLabel).toBe("M1");
    d.setClutch(false);
    expect(d.gearUp()).toBe(false); // M1 → M2 without clutch
    d.setClutch(true);
    expect(d.gearUp()).toBe(true);
    expect(d.manualGear).toBe(2);
    // Slipping OUT of gear to N never needs the clutch.
    d.setClutch(false);
    d.gearDown(); // M2 → M1 rejected (clutch up)…
    expect(d.manualGear).toBe(2);
    d.setClutch(true);
    d.gearDown(); // M2 → M1
    d.setClutch(false);
    expect(d.gearDown()).toBe(true); // M1 → N, clutch up — fine
    expect(d.selector).toBe("N");
  });

  it("with the engine off the box shifts freely (push the car around)", () => {
    const { d } = rig("cold");
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    expect(d.gearUp()).toBe(true); // P → R
    expect(d.gearUp()).toBe(true); // R → N
    expect(d.gearUp()).toBe(true); // N → M1 — no clutch, engine off
    expect(d.gearUp()).toBe(true); // M1 → M2
    expect(d.manualGear).toBe(2);
  });

  it("caps the gate at M5", () => {
    const { d } = rig("cold");
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    d.gearUp();
    d.gearUp();
    d.gearUp(); // M1
    for (let i = 0; i < 10; i++) d.gearUp();
    expect(d.manualGear).toBe(MANUAL_GEAR_COUNT);
    expect(d.gearUp()).toBe(false);
  });
});

describe("stall model", () => {
  /** Manual box, engine running, in M1 at standstill, clutch UP. */
  function launchRig() {
    const { d, events } = rig("cold");
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    d.toggleEngine();
    d.setClutch(true);
    d.gearUp(); // R
    d.gearUp(); // N
    d.gearUp(); // M1
    d.setClutch(false);
    return { d, events };
  }

  it("M1 at standstill with no throttle stalls after the grace period", () => {
    const { d, events } = launchRig();
    tick(d, STALL_GRACE_S * 0.8, STILL);
    expect(d.engineOn).toBe(true); // still inside the grace window
    tick(d, STALL_GRACE_S * 0.4, STILL);
    expect(d.engineOn).toBe(false);
    expect(d.stalled).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "engineStalled" });
  });

  it("M1 with enough throttle does NOT stall (the move-off skill)", () => {
    const { d } = launchRig();
    tick(d, STALL_GRACE_S * 3, { speedKmh: 2, throttle: STALL_MIN_THROTTLE + 0.05 });
    expect(d.engineOn).toBe(true);
    expect(d.stalled).toBe(false);
  });

  it("clutch down always prevents the stall", () => {
    const { d } = launchRig();
    d.setClutch(true);
    tick(d, STALL_GRACE_S * 3, STILL);
    expect(d.engineOn).toBe(true);
  });

  it("moving off from standstill in M2+ stalls even at full throttle", () => {
    const { d } = launchRig();
    d.setClutch(true);
    d.gearUp(); // M2
    d.setClutch(false);
    tick(d, STALL_GRACE_S * 1.5, { speedKmh: 1, throttle: 1 });
    expect(d.stalled).toBe(true);
  });

  it("rolling above the stall floor never stalls; braking to a stop in gear does", () => {
    const { d } = launchRig();
    d.setClutch(true);
    d.gearUp(); // M2
    d.setClutch(false);
    tick(d, 2, { speedKmh: STALL_BELOW_KMH + 20, throttle: 0.2 });
    expect(d.engineOn).toBe(true);
    // …then the student brakes to a halt without pressing the clutch:
    tick(d, STALL_GRACE_S * 1.5, { speedKmh: 2, throttle: 0 });
    expect(d.stalled).toBe(true);
  });

  it("reverse behaves like first gear (needs throttle or clutch)", () => {
    const { d } = rig("cold");
    d.update(1 / 60, { ...STILL, transmission: "manual" });
    d.toggleEngine();
    d.setClutch(true);
    d.gearUp(); // R
    expect(d.selector).toBe("R");
    d.setClutch(false);
    tick(d, STALL_GRACE_S * 1.5, STILL);
    expect(d.stalled).toBe(true);
  });

  it("a stall is recoverable: clutch down + restart clears the flag", () => {
    const { d } = launchRig();
    tick(d, STALL_GRACE_S * 1.5, STILL);
    expect(d.stalled).toBe(true);
    expect(d.toggleEngine()).toBe(false); // still in gear, clutch up
    d.setClutch(true);
    expect(d.toggleEngine()).toBe(true);
    expect(d.stalled).toBe(false);
    expect(d.engineOn).toBe(true);
  });

  it("the automatic NEVER stalls", () => {
    const { d } = rig("ready"); // automatic, in D
    tick(d, STALL_GRACE_S * 5, STILL);
    expect(d.engineOn).toBe(true);
    expect(d.stalled).toBe(false);
  });
});

describe("founder-reported sequences (test drive 2026-07-10)", () => {
  it("'pressed I, engine stopped; pressed I again — doesn't start': stop in D, restart is rejected WITH an event, P/N recovers", () => {
    const { d, events } = rig("ready"); // engine on, D — mid-drive
    expect(d.toggleEngine()).toBe(true); // I: stopping is always allowed
    expect(d.engineOn).toBe(false);
    expect(events.at(-1)).toEqual({ kind: "engineStopped" });

    expect(d.toggleEngine()).toBe(false); // I again: interlocked (still in D)
    expect(d.engineOn).toBe(false);
    // NOT a silent failure: the rejection is observable (the HUD subscribes).
    expect(events.at(-1)).toEqual({ kind: "startRejected", reason: "selector" });

    expect(d.gearDown()).toBe(true); // [ : D → N
    expect(d.toggleEngine()).toBe(true); // I: starts from N
    expect(d.engineOn).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "engineStarted" });
  });

  it("automatic: '[ down to N, then ]' returns to D — there ARE no numbered gears, and ] in D rejects with an event", () => {
    const { d, events } = rig("ready");
    d.update(1 / 60, { speedKmh: 40, throttle: 0.3 }); // rolling
    expect(d.gearDown()).toBe(true); // [ : D → N
    expect(d.selector).toBe("N");
    expect(d.gearUp()).toBe(true); // ] : N → D (never M1/M2/M3 on the automatic)
    expect(d.selector).toBe("D");
    expect(d.gearLabel).toBe("D");

    // What the founder likely saw next: ] again, expecting an upshift.
    expect(d.gearUp()).toBe(false);
    expect(d.selector).toBe("D");
    expect(events.at(-1)).toEqual({ kind: "shiftRejected", reason: "endOfGate" });
  });

  it("automatic: [ from N while rolling is rejected (R needs standstill) with an event", () => {
    const { d, events } = rig("ready");
    d.update(1 / 60, { speedKmh: 40, throttle: 0 });
    expect(d.gearDown()).toBe(true); // D → N
    expect(d.gearDown()).toBe(false); // N → R at 40 km/h: rejected
    expect(d.selector).toBe("N");
    expect(events.at(-1)).toEqual({ kind: "shiftRejected", reason: "speed" });
  });

  it("manual: '[ down to N, then ]' without the clutch is rejected WITH an event; with the clutch it enters the speed-matched gear", () => {
    const { d, events } = rig("ready");
    d.update(1 / 60, { speedKmh: 40, throttle: 0.3, transmission: "manual" });
    expect(d.selector).toBe("M"); // D converted to speed-matched M gear

    // Slip out to N — always free, like a real unloaded box.
    d.setClutch(true);
    while (d.manualGear > 1) d.gearDown();
    d.setClutch(false);
    expect(d.gearDown()).toBe(true); // M1 → N, clutch up — fine
    expect(d.selector).toBe("N");

    expect(d.gearUp()).toBe(false); // ] without clutch: silent no more
    expect(d.selector).toBe("N");
    expect(events.at(-1)).toEqual({ kind: "shiftRejected", reason: "clutch" });

    d.setClutch(true);
    expect(d.gearUp()).toBe(true); // ] with clutch: N → M @ speed-matched gear
    expect(d.selector).toBe("M");
    expect(d.manualGear).toBe(gearForSpeedKmh(40));
  });
});

describe("auxiliary controls + events", () => {
  it("parking brake / hazards / wipers / fog / horn toggle with events", () => {
    const { d, events } = rig("cold");
    d.toggleParkingBrake(); // spawned ON → releases
    expect(d.parkingBrakeOn).toBe(false);
    d.toggleHazards();
    d.toggleWipers();
    d.toggleFogLights();
    d.setHorn(true);
    expect(d.hazardsOn).toBe(true);
    expect(d.wipersOn).toBe(true);
    expect(d.fogLightsOn).toBe(true);
    expect(d.hornOn).toBe(true);
    d.setHorn(false);
    expect(d.hornOn).toBe(false);
    expect(events.map((e) => e.kind)).toEqual([
      "parkingBrakeChanged",
      "hazardsChanged",
      "wipersChanged",
      "fogLightsChanged",
      "hornChanged",
      "hornChanged",
    ]);
  });

  it("unsubscribe stops the event stream", () => {
    const d = new DrivelineState("cold");
    const events: DrivelineEvent[] = [];
    const off = d.subscribe((e) => events.push(e));
    d.toggleHazards();
    off();
    d.toggleHazards();
    expect(events).toHaveLength(1);
  });

  it("snapshot() mirrors the state, physicsInput reuses one object", () => {
    const { d } = rig("cold");
    const p1 = d.physicsInput;
    d.toggleParkingBrake();
    const p2 = d.physicsInput;
    expect(p2).toBe(p1); // same object, refreshed values
    expect(p2.parkingBrakeOn).toBe(false);
    const s = d.snapshot();
    expect(s.selector).toBe("P");
    expect(s.parkingBrakeOn).toBe(false);
    expect(s.gearLabel).toBe("P");
  });
});

describe("checklist force-setters (QW5 honesty — the pre-drive interim path)", () => {
  it("forceEngineOn / forceSelectForward / forceParkingBrake bypass the gate", () => {
    const { d, events } = rig("cold");
    d.forceEngineOn();
    d.forceSelectForward(); // P → D directly (checklist, not the [ ] gate)
    d.forceParkingBrake(false);
    expect(d.engineOn).toBe(true);
    expect(d.selector).toBe("D");
    expect(d.parkingBrakeOn).toBe(false);
    expect(hasDriveTraction(d.physicsInput)).toBe(true);
    // Idempotent: re-applying the completed list must not double-emit.
    const count = events.length;
    d.forceEngineOn();
    d.forceSelectForward();
    d.forceParkingBrake(false);
    expect(events.length).toBe(count);
  });
});

describe("physics gating helpers", () => {
  it("hasDriveTraction: off/P/N/clutch-down transmit nothing", () => {
    const base = { engineOn: true, selector: "D", manualGear: 1, clutchDown: false, parkingBrakeOn: false } as const;
    expect(hasDriveTraction({ ...base })).toBe(true);
    expect(hasDriveTraction({ ...base, engineOn: false })).toBe(false);
    expect(hasDriveTraction({ ...base, selector: "P" })).toBe(false);
    expect(hasDriveTraction({ ...base, selector: "N" })).toBe(false);
    expect(hasDriveTraction({ ...base, selector: "R" })).toBe(true);
    expect(hasDriveTraction({ ...base, selector: "M" })).toBe(true);
    expect(hasDriveTraction({ ...base, selector: "M", clutchDown: true })).toBe(false);
    expect(hasDriveTraction({ ...base, selector: "R", clutchDown: true })).toBe(false);
  });

  it("forwardForceScale: manual gears rev out above their band, D never does", () => {
    const m2 = { engineOn: true, selector: "M", manualGear: 2, clutchDown: false, parkingBrakeOn: false } as const;
    const m2Max = MANUAL_GEAR_MAX_KMH[1] ?? 0;
    expect(forwardForceScale({ ...m2 }, m2Max - 5)).toBe(1);
    expect(forwardForceScale({ ...m2 }, m2Max + 5)).toBe(0);
    const auto = { ...m2, selector: "D" } as const;
    expect(forwardForceScale({ ...auto }, 999)).toBe(1);
  });
});
