// Bridges the visual/physics rig to the integrator's VehicleSample contract
// (modules/sim/contracts.ts). Updated once per render frame by VehicleRig;
// the future world runtime consumes it via WorldRuntime.sample().

import { Vector3, Quaternion, type Group } from "three";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { VehicleSim, VehicleInput } from "@/modules/sim/vehicle";
import type { CabinControls } from "./cabin";

// Module-level scratch (client-only module; never allocate per frame).
const scratchPos = new Vector3();
const scratchQuat = new Quaternion();
const scratchFwd = new Vector3();

export function createVehicleSample(): VehicleSample {
  return {
    position: { x: 0, y: 0 },
    headingDeg: 0,
    speedKmh: 0,
    indicator: "off",
    headlights: "off",
    seatbeltOn: false,
    handbrakeOn: false,
    gear: 0,
    mirrorGlance: null,
    stalled: false,
    fogLightsOn: false,
    throttlePedal: 0,
    engineOn: false,
  };
}

/** Cosmetic gear string (VehicleSim.gear) → contract number: R=-1, N=0, 1..5. */
function gearToNumber(gear: string): number {
  if (gear === "R") return -1;
  if (gear === "N") return 0;
  const n = Number(gear);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Contract gear (-1 = reverse, 0 = neutral, 1.. = forward) from the REAL
 * selector state (A1). R is now what the student deliberately engaged — the
 * rule engine's reverse-related logic (e.g. L7 parkInBay's usedReverse) stops
 * inferring intent from rolling direction. In D the forward number stays the
 * speed-derived cosmetic gear (min 1 — an automatic in D is never "in
 * neutral"); in M it is the student's own gear.
 */
function contractGear(cabin: CabinControls, sim: VehicleSim): number {
  const d = cabin.driveline;
  switch (d.selector) {
    case "R":
      return -1;
    case "P":
    case "N":
      return 0;
    case "M":
      return d.manualGear;
    case "D":
      return Math.max(1, gearToNumber(sim.gear));
  }
}

/**
 * Write the current frame into `out` (zero allocation).
 *
 * District-space mapping (matches DistrictWorld, which places district (x,y)
 * at three.js (x, 0, −y) per district-v1.json meta / doc 17): three.js +X =
 * district x (east), three.js −Z = district y (north). So district y = −worldZ.
 * headingDeg is 0 = north, clockwise positive (facing +X/east = 90°); the
 * car's local forward is +Z, so district-forward = (fwd.x, −fwd.z).
 *
 * mirrorGlance is a ONE-frame event: CabinControls latches the key press and
 * this consumes it, so exactly one sample carries each glance.
 */
export function updateVehicleSample(
  out: VehicleSample,
  sim: VehicleSim,
  chassis: Group,
  cabin: CabinControls,
  input: VehicleInput | null,
): void {
  chassis.getWorldPosition(scratchPos);
  chassis.getWorldQuaternion(scratchQuat);
  scratchFwd.set(0, 0, 1).applyQuaternion(scratchQuat);

  out.position.x = scratchPos.x;
  out.position.y = -scratchPos.z;
  out.headingDeg =
    (Math.atan2(scratchFwd.x, -scratchFwd.z) * (180 / Math.PI) + 360) % 360;
  out.speedKmh = sim.speedKmh;
  out.indicator = cabin.indicator;
  out.headlights = cabin.headlights;
  out.seatbeltOn = cabin.seatbeltOn;
  // A1: the stateful parking brake is the real handbrake signal — the rule
  // engine's HANDBRAKE_LEFT_ON detector now grades truth, not a held Space
  // key. The momentary gamepad handbrake still counts while held.
  out.handbrakeOn = cabin.driveline.parkingBrakeOn || (input?.handbrake ?? false);
  out.gear = contractGear(cabin, sim);
  out.mirrorGlance = cabin.consumeGlanceSample();
  // B1a (doc 72 VP-04): the driveline's latched stall flag — the rule engine
  // grades its rising edge as the официална второстепенна „загасване".
  out.stalled = cabin.driveline.stalled;
  // FOG unlock (doc 72 AC-03): the driveline's fog-lamp state (V key /
  // cockpit hotspot) — graded only when the lesson's world is in fog.
  out.fogLightsOn = cabin.driveline.fogLightsOn;
  // THE ACCELERATOR THE GRADER COULD NOT SEE (sc-vp-handbrake:1f2f7463). The
  // FUNCTIONAL value — this is the gated, reverse-remapped input the physics
  // is actually being given, so a pedal zeroed by the pre-drive lock reads 0
  // here too and the standstill handbrake arm cannot fire during the
  // procedure. `rules/types.ts SimTick.throttlePedal` carries the reason.
  out.throttlePedal = input?.throttle ?? 0;
  // …AND WHETHER THE ENGINE IS EVEN RUNNING. The pedal alone cannot say what is
  // holding the car: on a COLD hand-over (`vehicleStart: "cold"`, this drill's
  // L4) the lever is up AND the engine is off, and `engine/stuckStart.ts`
  // answers «запали двигателя», not «свали ръчната». The standstill handbrake
  // arm reads this so it can only ever bill the blocker the cockpit named.
  out.engineOn = cabin.driveline.engineOn;
}
