// Entry point: rapier init (guarded), fixed-timestep physics loop with
// accumulator + capped frame delta, resize handling, HUD, camera toggle.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from './tuning';
import { Environment } from './environment';
import { Vehicle } from './vehicle';
import { Keyboard } from './input';
import { CameraRig } from './cameras';
import { Hud } from './hud';

function fatal(message: string): void {
  const div = document.createElement('div');
  div.className = 'fatal';
  div.textContent = `Vehicle feel spike failed to start:\n\n${message}`;
  document.body.appendChild(div);
}

async function main(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app container missing from index.html');

  // Rapier ships as WASM — init can fail (old browser, blocked wasm). Guard it.
  await RAPIER.init();

  const physics = new RAPIER.World({ x: 0, y: T.GRAVITY, z: 0 });
  physics.timestep = T.FIXED_DT;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  app.appendChild(renderer.domElement);

  const env = new Environment(physics);
  const vehicle = new Vehicle(physics, env.scene);
  const rig = new CameraRig(window.innerWidth / window.innerHeight, vehicle.cockpitAnchor);
  const hud = new Hud(app);
  const keyboard = new Keyboard({
    onToggleCamera: () => hud.setCameraMode(rig.toggle()),
    onReset: () => {
      vehicle.reset();
      env.resetProps();
    },
  });
  void keyboard; // listeners live for the page lifetime

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    rig.resize(window.innerWidth / window.innerHeight);
  });

  // --- Fixed-timestep loop ---------------------------------------------------
  // Physics always steps at FIXED_DT (tuning is dt-sensitive); rendering runs
  // at display rate. Frame delta is capped so a backgrounded tab doesn't
  // spiral the accumulator.
  let last = performance.now();
  let accumulator = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    let frameDt = (now - last) / 1000;
    last = now;
    if (frameDt > T.MAX_FRAME_DT) frameDt = T.MAX_FRAME_DT;
    accumulator += frameDt;

    const input = keyboard.read();
    while (accumulator >= T.FIXED_DT) {
      vehicle.update(input, T.FIXED_DT);
      physics.step();
      accumulator -= T.FIXED_DT;
    }

    vehicle.syncVisuals();
    env.sync();
    env.followSun(vehicle.root.position);
    rig.update(frameDt, vehicle.root);
    hud.update(now, vehicle.speedKmh, vehicle.gear, input.handbrake);

    if (vehicle.root.position.y < T.KILL_PLANE_Y) {
      vehicle.reset();
    }

    renderer.render(env.scene, rig.active);
  });
}

main().catch((err: unknown) => {
  console.error(err);
  fatal(err instanceof Error ? err.message : String(err));
});
