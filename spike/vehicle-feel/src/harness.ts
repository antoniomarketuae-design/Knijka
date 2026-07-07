// Headless numeric tuning harness — runs the REAL Vehicle class in Node
// (rapier wasm works fine without a browser) and prints hard numbers for the
// feel targets: settle/ride height, 0–50/0–100, braking g, steady-state
// cornering roll & yaw, the 12 cm curb strike at 50 km/h, a 90 km/h lane
// change, and a handbrake turn.
//
// Build & run (from spike/vehicle-feel):
//   npx vite build --ssr src/harness.ts --outDir harness-dist
//   node harness-dist/harness.js
//
// This file is NOT imported by the browser app. It exists because vehicle
// tuning without measurements is guesswork — keep it alive in the platform.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';
import * as T from './tuning';
import { Vehicle } from './vehicle';
import type { VehicleInput } from './input';

const IDLE: VehicleInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

interface Rig {
  world: World;
  vehicle: Vehicle;
}

function makeRig(setup?: (world: World) => void): Rig {
  const world = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  world.timestep = T.FIXED_DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setFriction(1));
  setup?.(world);
  const scene = new THREE.Scene();
  const vehicle = new Vehicle(world, scene);
  return { world, vehicle };
}

function step(rig: Rig, input: VehicleInput): void {
  rig.vehicle.update(input, T.FIXED_DT);
  rig.world.step();
}

/** Roll/pitch in degrees from the chassis quaternion (small-angle friendly). */
function attitude(rig: Rig): { rollDeg: number; pitchDeg: number; upY: number } {
  const d = rig.vehicle.debugState();
  const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  const left = new THREE.Vector3(1, 0, 0).applyQuaternion(q); // car +X = left side
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  return {
    rollDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(left.y, -1, 1))),
    pitchDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1))),
    upY: up.y, // 1 = upright, <0 = flipped
  };
}

const fmt = (n: number, digits = 2): string => n.toFixed(digits);

// ---------------------------------------------------------------------------
await RAPIER.init();
console.log('rapier initialized (headless)\n');

// --- 1. Settle -------------------------------------------------------------
{
  const rig = makeRig();
  for (let i = 0; i < 60 * 4; i++) step(rig, IDLE);
  const d = rig.vehicle.debugState();
  const a = attitude(rig);
  console.log('[settle after 4 s]');
  console.log(`  body centre y      ${fmt(d.position.y, 3)} m (expected ~0.63)`);
  console.log(`  roll/pitch         ${fmt(a.rollDeg)} / ${fmt(a.pitchDeg)} deg`);
  console.log(`  susp lengths       ${d.suspensionLengths.map((s) => fmt(s, 3)).join('  ')} (rest ${T.SUSPENSION_REST_LENGTH})`);
  console.log(`  wheels in contact  ${d.wheelsInContact.join(' ')}`);
  console.log(`  drift speed        ${fmt(Math.abs(rig.vehicle.speedKmh), 3)} km/h\n`);
}

// --- 2. Full-throttle acceleration ------------------------------------------
{
  const rig = makeRig();
  for (let i = 0; i < 60; i++) step(rig, IDLE); // settle 1 s
  const t50: number[] = [];
  const t90: number[] = [];
  const t100: number[] = [];
  let top = 0;
  const startX = rig.vehicle.debugState().position.x;
  for (let i = 0; i < 60 * 30; i++) {
    step(rig, { ...IDLE, throttle: 1 });
    const v = rig.vehicle.speedKmh;
    top = Math.max(top, v);
    const t = i / 60;
    if (v >= 50 && t50.length === 0) t50.push(t);
    if (v >= 90 && t90.length === 0) t90.push(t);
    if (v >= 100 && t100.length === 0) t100.push(t);
  }
  const endX = rig.vehicle.debugState().position.x;
  console.log('[full throttle 30 s]');
  console.log(`  direction check    moved ${fmt(endX - startX, 0)} m in +X (must be positive)`);
  console.log(`  0-50 / 0-90 / 0-100  ${fmt(t50[0] ?? -1, 1)} / ${fmt(t90[0] ?? -1, 1)} / ${fmt(t100[0] ?? -1, 1)} s`);
  console.log(`  top speed          ${fmt(top, 1)} km/h (target ~130-140)\n`);
}

// --- 3. Braking from 90 ------------------------------------------------------
{
  const rig = makeRig();
  for (let i = 0; i < 60; i++) step(rig, IDLE);
  while (rig.vehicle.speedKmh < 90) step(rig, { ...IDLE, throttle: 1 });
  const v0 = rig.vehicle.speedKmh / 3.6;
  const x0 = rig.vehicle.debugState().position.x;
  let frames = 0;
  let maxNoseDive = 0;
  while (rig.vehicle.speedKmh > 2 && frames < 60 * 15) {
    step(rig, { ...IDLE, brake: 1 });
    maxNoseDive = Math.min(maxNoseDive, attitude(rig).pitchDeg);
    frames++;
  }
  const dist = rig.vehicle.debugState().position.x - x0;
  const tStop = frames / 60;
  console.log('[full brake from 90 km/h]');
  console.log(`  stop time/distance ${fmt(tStop, 2)} s / ${fmt(dist, 1)} m (real compact ~ 35-40 m)`);
  console.log(`  avg decel          ${fmt(v0 / tStop / 9.81, 2)} g`);
  console.log(`  max nose dive      ${fmt(maxNoseDive, 1)} deg (negative = nose down)\n`);
}

// --- 4. Steady-state corner at ~50 km/h --------------------------------------
{
  const rig = makeRig();
  for (let i = 0; i < 60; i++) step(rig, IDLE);
  let maxRoll = 0;
  let yawPrev: number | null = null;
  let yawRateDegS = 0;
  let minUpY = 1;
  for (let i = 0; i < 60 * 14; i++) {
    const v = rig.vehicle.speedKmh;
    const input: VehicleInput = {
      throttle: v < 50 ? 1 : 0, // bang-bang speed hold
      brake: 0,
      steer: i > 60 * 4 ? 0.3 : 0, // turn in after reaching speed
      handbrake: false,
    };
    step(rig, input);
    if (i > 60 * 8) {
      const a = attitude(rig);
      maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
      minUpY = Math.min(minUpY, a.upY);
      const d = rig.vehicle.debugState();
      const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const yaw = Math.atan2(f.x, f.z);
      if (yawPrev !== null) {
        let dy = yaw - yawPrev;
        if (dy > Math.PI) dy -= 2 * Math.PI;
        if (dy < -Math.PI) dy += 2 * Math.PI;
        yawRateDegS = THREE.MathUtils.radToDeg(dy) * 60;
      }
      yawPrev = yaw;
    }
  }
  console.log('[steady corner, ~50 km/h, steer input 0.3]');
  console.log(`  speed held         ${fmt(rig.vehicle.speedKmh, 1)} km/h`);
  console.log(`  body roll          ${fmt(maxRoll, 1)} deg (target 2-5: visible lean, not a boat)`);
  console.log(`  yaw rate           ${fmt(Math.abs(yawRateDegS), 1)} deg/s`);
  console.log(`  min up.y           ${fmt(minUpY, 3)} (1 = upright)\n`);
}

// --- 5. Curb strike at ~50 km/h ----------------------------------------------
{
  // 12 cm box curb across the RIGHT wheel path only (car faces +X, right = +Z
  // world at spawn). Sharp-edged worst case.
  const rig = makeRig((world) => {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.15, 0.06, 0.8).setTranslation(25, 0.06, -39.3).setFriction(0.9),
    );
  });
  for (let i = 0; i < 60; i++) step(rig, IDLE);
  let maxRoll = 0;
  let maxPitch = 0;
  let minUpY = 1;
  let speedAtCurb = 0;
  for (let i = 0; i < 60 * 12; i++) {
    const x = rig.vehicle.debugState().position.x;
    step(rig, { ...IDLE, throttle: x < 20 ? 1 : 0 });
    const a = attitude(rig);
    maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
    maxPitch = Math.max(maxPitch, Math.abs(a.pitchDeg));
    minUpY = Math.min(minUpY, a.upY);
    if (speedAtCurb === 0 && x >= 25) speedAtCurb = rig.vehicle.speedKmh;
  }
  const end = attitude(rig);
  console.log('[12 cm curb under right wheels]');
  console.log(`  speed at strike    ${fmt(speedAtCurb, 1)} km/h (target ~50)`);
  console.log(`  max roll/pitch     ${fmt(maxRoll, 1)} / ${fmt(maxPitch, 1)} deg`);
  console.log(`  min up.y           ${fmt(minUpY, 3)} (flip if < 0)`);
  console.log(`  upright at end     ${end.upY > 0.9 ? 'YES' : `NO (up.y ${fmt(end.upY, 2)})`}\n`);
}

// --- 6. Lane change at 90 km/h ------------------------------------------------
{
  const rig = makeRig();
  for (let i = 0; i < 60; i++) step(rig, IDLE);
  while (rig.vehicle.speedKmh < 90) step(rig, { ...IDLE, throttle: 1 });
  let maxRoll = 0;
  let minUpY = 1;
  for (let i = 0; i < 60 * 5; i++) {
    const t = i / 60;
    let steer = 0;
    if (t < 0.6) steer = 0.5; // left
    else if (t < 1.2) steer = -0.5; // right
    step(rig, { ...IDLE, throttle: 0.4, steer });
    const a = attitude(rig);
    maxRoll = Math.max(maxRoll, Math.abs(a.rollDeg));
    minUpY = Math.min(minUpY, a.upY);
  }
  const d = rig.vehicle.debugState();
  const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  console.log('[lane change at 90 km/h, steer pulse 0.5/-0.5]');
  console.log(`  max roll           ${fmt(maxRoll, 1)} deg`);
  console.log(`  min up.y           ${fmt(minUpY, 3)}`);
  console.log(`  final speed        ${fmt(rig.vehicle.speedKmh, 1)} km/h`);
  console.log(`  final heading ok   ${Math.abs(f.z) < 0.7 ? 'YES (still ~+X)' : 'NO (spun)'}\n`);
}

// --- 7. Handbrake turn at 50 km/h ----------------------------------------------
{
  const rig = makeRig();
  for (let i = 0; i < 60; i++) step(rig, IDLE);
  while (rig.vehicle.speedKmh < 50) step(rig, { ...IDLE, throttle: 1 });
  let minUpY = 1;
  for (let i = 0; i < 60 * 4; i++) {
    const t = i / 60;
    const input: VehicleInput = {
      throttle: 0,
      brake: 0,
      steer: t < 1.0 ? 1 : 0,
      handbrake: t < 1.2,
    };
    step(rig, input);
    minUpY = Math.min(minUpY, attitude(rig).upY);
  }
  const d = rig.vehicle.debugState();
  const q = new THREE.Quaternion(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const headingDeg = THREE.MathUtils.radToDeg(Math.atan2(f.x, f.z));
  console.log('[handbrake + full steer at 50 km/h]');
  console.log(`  heading change     started at 90 deg, now ${fmt(headingDeg, 0)} deg (should rotate well past 90)`);
  console.log(`  min up.y           ${fmt(minUpY, 3)} (no flip)`);
  console.log(`  end speed          ${fmt(Math.abs(rig.vehicle.speedKmh), 1)} km/h\n`);
}

console.log('harness done');
