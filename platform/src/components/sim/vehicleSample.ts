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
  out.handbrakeOn = input?.handbrake ?? false;
  out.gear = gearToNumber(sim.gear);
  out.mirrorGlance = cabin.consumeGlanceSample();
}
