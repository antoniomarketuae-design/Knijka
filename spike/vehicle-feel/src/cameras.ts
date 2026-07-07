// Chase camera (smoothed follow, yaw-only so it doesn't roll with the car)
// + cockpit camera parented to the chassis at driver eye height. C toggles.

import * as THREE from 'three';
import * as T from './tuning';

export type CameraMode = 'chase' | 'cockpit';

export class CameraRig {
  readonly chase: THREE.PerspectiveCamera;
  readonly cockpit: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';

  private snapped = false;
  private readonly pos = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly carQ = new THREE.Quaternion();

  constructor(aspect: number, cockpitParent: THREE.Object3D) {
    this.chase = new THREE.PerspectiveCamera(T.CHASE_FOV, aspect, 0.1, 800);
    this.cockpit = new THREE.PerspectiveCamera(T.COCKPIT_FOV, aspect, 0.05, 800);
    // Car forward is +Z; a three.js camera looks down its local -Z.
    this.cockpit.rotation.y = Math.PI;
    cockpitParent.add(this.cockpit);
  }

  get active(): THREE.PerspectiveCamera {
    return this.mode === 'chase' ? this.chase : this.cockpit;
  }

  toggle(): CameraMode {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
    return this.mode;
  }

  update(dt: number, car: THREE.Object3D): void {
    // Cockpit camera rides its parent — only the chase cam needs work.
    car.getWorldPosition(this.pos);
    car.getWorldQuaternion(this.carQ);

    this.forward.set(0, 0, 1).applyQuaternion(this.carQ);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, 1);
    this.forward.normalize();

    this.desired
      .copy(this.pos)
      .addScaledVector(this.forward, -T.CHASE_DISTANCE)
      .add(new THREE.Vector3(0, T.CHASE_HEIGHT, 0));

    if (!this.snapped) {
      this.chase.position.copy(this.desired);
      this.snapped = true;
    } else {
      const k = 1 - Math.exp(-T.CHASE_STIFFNESS * dt);
      this.chase.position.lerp(this.desired, k);
    }

    this.lookAt
      .copy(this.pos)
      .addScaledVector(this.forward, T.CHASE_LOOK_AHEAD)
      .add(new THREE.Vector3(0, T.CHASE_LOOK_HEIGHT, 0));
    this.chase.lookAt(this.lookAt);
  }

  resize(aspect: number): void {
    for (const cam of [this.chase, this.cockpit]) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }
}
