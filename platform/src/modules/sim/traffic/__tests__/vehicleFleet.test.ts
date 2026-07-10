/**
 * vehicleFleet — model assignment determinism + the instanced assembly,
 * including the A5 parked pass (static per-model instances over the same
 * rigs, civilian models only). Runs headless: three.js objects only, no GPU.
 */
import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import type { TrafficVehicleState } from "../types";
import {
  assignCivilianModel,
  assignModel,
  buildTrafficFleet,
  disposeTrafficFleet,
  FLEET,
} from "../vehicleFleet";

const POLICE_INDEX = FLEET.length - 1;

/** Minimal stand-in for an authored fleet GLB: paint+glass body, 4 named
 * wheel meshes with tire material (offsets read from node world positions). */
function makeCarScene(): Object3D {
  const root = new Group();
  const paint = new MeshStandardMaterial();
  paint.name = "paint";
  const body = new Mesh(new BoxGeometry(1.8, 1, 4.2), paint);
  body.position.y = 0.8;
  root.add(body);
  const glass = new MeshStandardMaterial();
  glass.name = "glass";
  const cabin = new Mesh(new BoxGeometry(1.5, 0.5, 2), glass);
  cabin.position.y = 1.4;
  root.add(cabin);
  const tire = new MeshStandardMaterial();
  tire.name = "tire";
  const wheels: [string, number, number][] = [
    ["wheel_FL", 0.8, 1.4],
    ["wheel_FR", -0.8, 1.4],
    ["wheel_RL", 0.8, -1.4],
    ["wheel_RR", -0.8, -1.4],
  ];
  for (const [name, x, z] of wheels) {
    const w = new Mesh(new BoxGeometry(0.25, 0.64, 0.64), tire);
    w.name = name;
    w.position.set(x, 0.32, z);
    root.add(w);
  }
  return root;
}

function makeScenes(): Object3D[] {
  return FLEET.map(() => makeCarScene());
}

function vehicle(id: number): TrafficVehicleState {
  return { id, x: 0, y: 0, dirX: 0, dirY: 1, speedMps: 0, braking: false, colorIndex: 0 };
}

describe("model assignment", () => {
  it("is deterministic and police-capable for moving vehicles", () => {
    let sawPolice = false;
    for (let id = 0; id < 500; id++) {
      const m = assignModel(id);
      expect(m).toBe(assignModel(id));
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(FLEET.length);
      if (m === POLICE_INDEX) sawPolice = true;
    }
    expect(sawPolice).toBe(true);
  });

  it("never assigns police to parked slots (assignCivilianModel)", () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 2000; seed++) {
      const m = assignCivilianModel(seed);
      expect(m).toBe(assignCivilianModel(seed));
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(POLICE_INDEX);
      seen.add(m);
    }
    // Variety: the parked streets should show the whole civilian pool.
    expect(seen.size).toBe(POLICE_INDEX);
  });
});

describe("buildTrafficFleet parked pass", () => {
  it("builds static per-model parked instances + a 4-per-car wheel mesh", () => {
    const vehicles = [vehicle(1), vehicle(2), vehicle(3)];
    const parkedModels = [0, 0, 3, 5, 0];
    const fleet = buildTrafficFleet(makeScenes(), vehicles, parkedModels);

    // Per-model instance counts follow the assignment.
    expect(fleet.parkedMeshes[0]?.count).toBe(3);
    expect(fleet.parkedMeshes[3]?.count).toBe(1);
    expect(fleet.parkedMeshes[5]?.count).toBe(1);
    for (const m of [1, 2, 4, 6, 7, POLICE_INDEX]) {
      expect(fleet.parkedMeshes[m]).toBeNull();
    }
    // Slots are dense per model.
    expect(Array.from(fleet.parkedSlot)).toEqual([0, 1, 0, 0, 2]);
    expect(Array.from(fleet.parkedAssign)).toEqual(parkedModels);
    // Wheels render for parked cars too: 4 instances per car, static mesh.
    expect(fleet.parkedWheel?.count).toBe(parkedModels.length * 4);
    // Everything is mounted under the one fleet group (single <primitive>).
    for (const mesh of fleet.parkedMeshes) {
      if (mesh) expect(mesh.parent).toBe(fleet.group);
    }
    expect(fleet.parkedWheel?.parent).toBe(fleet.group);
    // Wheel scale defined for every parked slot.
    expect(fleet.parkedWheelScale.length).toBe(parkedModels.length);
    for (const s of fleet.parkedWheelScale) expect(s).toBeGreaterThan(0);

    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("stays parked-free when no placements are supplied", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1)]);
    expect(fleet.parkedWheel).toBeNull();
    expect(fleet.parkedMeshes.every((m) => m === null)).toBe(true);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});
