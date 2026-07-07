// Test track: flat ground, a rectangular road loop with rounded corners,
// curb strips (the flip test), cones (slalom), crates and concrete blocks.
// Roads are visual-only textured planes; collision is one flat ground slab
// plus the obstacle colliders.

import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';
import { asphaltTexture, curbTexture, grassTexture, roadTexture } from './textures';

const ROAD_Y = 0.02; // lift above ground to avoid z-fighting

// Loop geometry: centreline rectangle 120×80 m with 14 m corner radius,
// road width 8 m → straights at z=±40 (|x|≤46) and x=±60 (|z|≤26).
const LOOP_A = 60; // half-extent in x
const LOOP_B = 40; // half-extent in z
const CORNER_R = 14; // centreline corner radius
const ROAD_W = 8;

interface PropRecord {
  body: RigidBody;
  mesh: THREE.Object3D;
  initialPos: THREE.Vector3;
  initialRot: THREE.Quaternion;
}

export class Environment {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(40, 55, 25);
  private readonly props: PropRecord[] = [];

  constructor(private readonly physics: World) {
    this.scene.background = new THREE.Color(0x87b5d9);
    this.scene.fog = new THREE.Fog(0x87b5d9, 150, 450);

    // --- Lights -------------------------------------------------------------
    this.scene.add(new THREE.HemisphereLight(0xbcd8ee, 0x51683f, 0.55));
    this.sun = new THREE.DirectionalLight(0xfff2df, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    const d = 45;
    this.sun.shadow.camera.left = -d;
    this.sun.shadow.camera.right = d;
    this.sun.shadow.camera.top = d;
    this.sun.shadow.camera.bottom = -d;
    this.sun.shadow.normalBias = 0.4;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // --- Ground (one flat slab: visual plane + static collider) -------------
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ map: grassTexture(80), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(250, 1, 250).setTranslation(0, -1, 0).setFriction(1.0),
    );

    this.buildRoadLoop();
    this.buildObstacles();
  }

  /** Copy dynamic prop transforms into their meshes. Call once per frame. */
  sync(): void {
    for (const p of this.props) {
      const t = p.body.translation();
      const r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Put every knocked-over cone/crate back (R key). */
  resetProps(): void {
    for (const p of this.props) {
      p.body.setTranslation({ x: p.initialPos.x, y: p.initialPos.y, z: p.initialPos.z }, true);
      p.body.setRotation(
        { x: p.initialRot.x, y: p.initialRot.y, z: p.initialRot.z, w: p.initialRot.w },
        true,
      );
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Keep the shadow frustum centred on the car. */
  followSun(target: THREE.Vector3): void {
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
  }

  // ---------------------------------------------------------------------------

  private buildRoadLoop(): void {
    const straightX = (LOOP_A - CORNER_R) * 2; // 92 m straights along x
    const straightZ = (LOOP_B - CORNER_R) * 2; // 52 m straights along z

    this.addStraight(0, -LOOP_B, straightX, true); // south
    this.addStraight(0, LOOP_B, straightX, true); // north
    this.addStraight(-LOOP_A, 0, straightZ, false); // west
    this.addStraight(LOOP_A, 0, straightZ, false); // east

    // Quarter-ring corners. thetaStart chosen so each arc bulges outward
    // (RingGeometry XY point (cosθ, sinθ) maps to XZ (cosθ, -sinθ) after
    // rotateX(-π/2)).
    const cx = LOOP_A - CORNER_R; // 46
    const cz = LOOP_B - CORNER_R; // 26
    this.addCorner(cx, cz, -Math.PI / 2); // NE: north → east
    this.addCorner(cx, -cz, 0); // SE: east → south
    this.addCorner(-cx, -cz, Math.PI / 2); // SW: south → west
    this.addCorner(-cx, cz, Math.PI); // NW: west → north
  }

  private addStraight(cx: number, cz: number, length: number, alongX: boolean): void {
    const geo = new THREE.PlaneGeometry(ROAD_W, length);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: roadTexture(length), roughness: 0.95 }),
    );
    if (alongX) mesh.rotation.y = Math.PI / 2;
    mesh.position.set(cx, ROAD_Y, cz);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private addCorner(cx: number, cz: number, thetaStart: number): void {
    const geo = new THREE.RingGeometry(
      CORNER_R - ROAD_W / 2,
      CORNER_R + ROAD_W / 2,
      20,
      1,
      thetaStart,
      Math.PI / 2,
    );
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: asphaltTexture(6), roughness: 0.95 }),
    );
    mesh.position.set(cx, ROAD_Y + 0.001, cz);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildObstacles(): void {
    // Curb strip ACROSS the right half of the south straight — drive over it
    // at 50 km/h: the car must bounce, not flip. 12 cm high, box-sharp
    // (worst case; real curbs would be bevelled).
    this.addCurb(20, -41.2, 1.0, 0.12, 2.4);
    // Curb along the inside edge of the north straight (clip test).
    this.addCurb(0, 36.2, 12, 0.12, 0.5);

    // Cone slalom on the south straight, ahead of the spawn point.
    for (let i = 0; i < 6; i++) {
      this.addCone(-10 + i * 7, -40 + (i % 2 === 0 ? 1.4 : -1.4));
    }
    // Cone gate on the east straight.
    this.addCone(60 - 2.2, 10);
    this.addCone(60 + 2.2, 10);

    // Pushable crates on the east straight.
    this.addCrate(60, 0.35, -6);
    this.addCrate(60, 0.35, -4.2);
    this.addCrate(60.8, 0.35, -5.1);

    // Static concrete gate on the north straight (miss it or crash).
    this.addBlock(20, 40 - 5.2);
    this.addBlock(20, 40 + 5.2);

    // A few visual-reference buildings outside the loop (with colliders).
    const buildings: ReadonlyArray<readonly [number, number, number]> = [
      [80, 60, 14],
      [-84, -55, 10],
      [-80, 58, 12],
      [84, -52, 16],
    ];
    for (const [bx, bz, size] of buildings) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.9 }),
      );
      mesh.position.set(bx, size / 2, bz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.physics.createCollider(
        RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setTranslation(bx, size / 2, bz),
      );
    }
  }

  private addCurb(cx: number, cz: number, halfX: number, halfY: number, halfZ: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(halfX * 2, halfY * 2, halfZ * 2),
      new THREE.MeshStandardMaterial({ map: curbTexture(Math.max(halfX, halfZ) * 2), roughness: 0.9 }),
    );
    mesh.position.set(cx, halfY, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ).setTranslation(cx, halfY, cz).setFriction(0.9),
    );
  }

  private addCone(cx: number, cz: number): void {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.5, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8641e, roughness: 0.7 }),
    );
    mesh.castShadow = true;
    this.addDynamic(mesh, RAPIER.ColliderDesc.cone(0.25, 0.18), 1.8, cx, 0.25, cz);
  }

  private addCrate(cx: number, cy: number, cz: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.85 }),
    );
    mesh.castShadow = true;
    this.addDynamic(mesh, RAPIER.ColliderDesc.cuboid(0.35, 0.35, 0.35), 18, cx, cy, cz);
  }

  private addBlock(cx: number, cz: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.0, 2.0),
      new THREE.MeshStandardMaterial({ color: 0xa8a29a, roughness: 0.95 }),
    );
    mesh.position.set(cx, 0.5, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(0.5, 0.5, 1.0).setTranslation(cx, 0.5, cz),
    );
  }

  private addDynamic(
    mesh: THREE.Object3D,
    colliderDesc: RAPIER.ColliderDesc,
    massKg: number,
    cx: number,
    cy: number,
    cz: number,
  ): void {
    mesh.position.set(cx, cy, cz);
    this.scene.add(mesh);
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(cx, cy, cz),
    );
    this.physics.createCollider(
      colliderDesc.setMass(massKg).setFriction(0.8).setRestitution(0.1),
      body,
    );
    this.props.push({
      body,
      mesh,
      initialPos: new THREE.Vector3(cx, cy, cz),
      initialRot: new THREE.Quaternion(),
    });
  }
}
