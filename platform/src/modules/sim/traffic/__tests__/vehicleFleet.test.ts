/**
 * vehicleFleet — fleet-v2 model assignment (research-weighted mix, police
 * carve-out, hero-SUV cap) + the instanced assembly: merged/folded body
 * groups, split palette-tinted paint shell, shared vs custom (hero) wheels,
 * and the parked pass. Runs headless: three.js objects only, no GPU.
 */
import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import type { TrafficVehicleState } from "../types";
import {
  assignCivilianModel,
  assignModel,
  BOXY_INDEX,
  BOXY_MAX_INSTANCES,
  buildTrafficFleet,
  disposeTrafficFleet,
  FLEET,
  paintColorFor,
} from "../vehicleFleet";

const POLICE_INDEX = FLEET.length - 1;
const KOLOS_INDEX = FLEET.indexOf("kolos");
const KARGO_M_INDEX = FLEET.indexOf("kargo_m");
const TAXI_INDEX = FLEET.indexOf("taxi");

/** Minimal stand-in for an authored v2 fleet GLB: paint_x + glass/trim/plate
 * body (plate folds into trim, paint splits for palette models), 4 named
 * wheel nodes with tire+hubcap prims (offsets read from world positions). */
function makeCarScene(opts?: { heroWheels?: boolean; spareTire?: boolean }): Object3D {
  const root = new Group();
  const paint = new MeshStandardMaterial();
  paint.name = "paint_grey";
  const body = new Mesh(new BoxGeometry(1.8, 1, 4.2), paint);
  body.position.y = 0.8;
  root.add(body);
  const glass = new MeshStandardMaterial();
  glass.name = "glass";
  const cabin = new Mesh(new BoxGeometry(1.5, 0.5, 2), glass);
  cabin.position.y = 1.4;
  root.add(cabin);
  const trim = new MeshStandardMaterial();
  trim.name = "trim";
  const bumper = new Mesh(new BoxGeometry(1.8, 0.3, 4.3), trim);
  bumper.position.y = 0.5;
  root.add(bumper);
  const plate = new MeshStandardMaterial();
  plate.name = "plate";
  const plates = new Mesh(new BoxGeometry(0.5, 0.14, 4.35), plate);
  plates.position.y = 0.55;
  root.add(plates);
  const tire = new MeshStandardMaterial();
  tire.name = "tire";
  if (opts?.spareTire) {
    // Hero SUV: tailgate spare — a tire-material prim inside the BODY.
    const spare = new Mesh(new BoxGeometry(0.8, 0.8, 0.2), tire);
    spare.position.set(0, 1.05, -2.2);
    root.add(spare);
  }
  const wheels: [string, number, number][] = [
    ["wheel_FL", 0.8, 1.4],
    ["wheel_FR", -0.8, 1.4],
    ["wheel_RL", 0.8, -1.4],
    ["wheel_RR", -0.8, -1.4],
  ];
  const hubcap = new MeshStandardMaterial();
  hubcap.name = opts?.heroWheels ? "rim_gloss_black" : "hubcap";
  for (const [name, x, z] of wheels) {
    const node = new Group();
    node.name = name;
    node.position.set(x, 0.32, z);
    node.add(new Mesh(new BoxGeometry(0.25, 0.64, 0.64), tire));
    node.add(new Mesh(new BoxGeometry(0.26, 0.4, 0.4), hubcap));
    root.add(node);
  }
  return root;
}

function makeScenes(): Object3D[] {
  return FLEET.map((name) =>
    name === "suv_boxy_lux"
      ? makeCarScene({ heroWheels: true, spareTire: true })
      : makeCarScene(),
  );
}

function vehicle(id: number): TrafficVehicleState {
  return { id, x: 0, y: 0, dirX: 0, dirY: 1, speedMps: 0, braking: false, colorIndex: 0 };
}

describe("model assignment", () => {
  it("is deterministic, covers the fleet, and follows the research mix", () => {
    const N = 30000;
    const counts = new Array(FLEET.length).fill(0);
    for (let id = 0; id < N; id++) {
      const m = assignModel(id);
      expect(m).toBe(assignModel(id));
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThan(FLEET.length);
      counts[m]++;
    }
    // Every model spawns (variety is the point of fleet v2).
    for (let m = 0; m < FLEET.length; m++) expect(counts[m]).toBeGreaterThan(0);
    // Police ~1 in 15 (carve-out preserved from v1).
    expect(counts[POLICE_INDEX] / N).toBeGreaterThan(0.05);
    expect(counts[POLICE_INDEX] / N).toBeLessThan(0.09);
    // Taxi ~1 in 10.
    expect(counts[TAXI_INDEX] / N).toBeGreaterThan(0.07);
    expect(counts[TAXI_INDEX] / N).toBeLessThan(0.12);
    // Hero boxy SUV rare premium ~1 in 20 (population cap tested below).
    expect(counts[BOXY_INDEX] / N).toBeGreaterThan(0.03);
    expect(counts[BOXY_INDEX] / N).toBeLessThan(0.07);
    // Ordinary sedans/hatches/wagons/crossover dominate.
    const ordinary =
      ["vela_h3", "pino", "corva_s", "dret_90", "corva_sw", "arden_x"]
        .map((n) => counts[FLEET.indexOf(n as (typeof FLEET)[number])])
        .reduce((a, b) => a + b, 0) / N;
    expect(ordinary).toBeGreaterThan(0.5);
  });

  it("keeps police, the kargo_m minibus and the hero SUV out of parked slots", () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 5000; seed++) {
      const m = assignCivilianModel(seed);
      expect(m).toBe(assignCivilianModel(seed));
      expect(m).not.toBe(POLICE_INDEX);
      expect(m).not.toBe(BOXY_INDEX);
      expect(m).not.toBe(KARGO_M_INDEX);
      seen.add(m);
    }
    // Variety: the parked streets show the whole 11-model parked pool
    // (incl. curb-parked taxis).
    expect(seen.size).toBe(FLEET.length - 3);
    expect(seen.has(TAXI_INDEX)).toBe(true);
  });

  it("picks deterministic palette paint colors; police/hero SUV stay untinted", () => {
    const a = new Color();
    const b = new Color();
    expect(paintColorFor(0, 42, a)).toBe(true); // vela_h3 has a palette
    expect(paintColorFor(0, 42, b)).toBe(true);
    expect(a.equals(b)).toBe(true);
    expect(paintColorFor(POLICE_INDEX, 42, a)).toBe(false); // two-tone livery
    expect(paintColorFor(BOXY_INDEX, 42, a)).toBe(false); // REF-4 gloss black
  });
});

describe("buildTrafficFleet", () => {
  it("caps hero-SUV instances and reassigns overflow to the kolos", () => {
    // 400 ids at ~4.7% => far more boxy assignments than the cap.
    const vehicles = Array.from({ length: 400 }, (_, i) => vehicle(i));
    const raw = vehicles.filter((v) => assignModel(v.id) === BOXY_INDEX).length;
    expect(raw).toBeGreaterThan(BOXY_MAX_INSTANCES);
    const fleet = buildTrafficFleet(makeScenes(), vehicles);
    expect(fleet.models[BOXY_INDEX].count).toBe(BOXY_MAX_INSTANCES);
    // Overflow became kolos: raw kolos assignments + the boxy overflow.
    const rawKolos = vehicles.filter((v) => assignModel(v.id) === KOLOS_INDEX).length;
    expect(fleet.models[KOLOS_INDEX].count).toBe(rawKolos + raw - BOXY_MAX_INSTANCES);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("splits palette paint, folds plate into trim, tints per instance", () => {
    const vehicles = [vehicle(1), vehicle(2), vehicle(3), vehicle(4)];
    const fleet = buildTrafficFleet(makeScenes(), vehicles);
    for (let i = 0; i < vehicles.length; i++) {
      const m = fleet.assign[i];
      const rig = fleet.models[m].rig;
      if (m === POLICE_INDEX || m === BOXY_INDEX) {
        expect(rig.paint).toBeNull(); // untinted: paint stays in the body
        continue;
      }
      // Palette model: paint split out (white clone) + tinted instances.
      expect(rig.paint).not.toBeNull();
      const pm = fleet.paintMeshes[m];
      expect(pm).not.toBeNull();
      expect(pm?.instanceColor).not.toBeNull();
      // Body groups after folding: glass + trim(+plate) — no paint, no plate.
      const names = rig.bodyMaterials.map((mat) => mat.name);
      expect(names).not.toContain("paint_grey");
      expect(names).not.toContain("plate");
      expect(names).toContain("glass");
      expect(names).toContain("trim");
      expect(rig.bodyMaterials.length).toBe(2);
      expect(rig.bodyGeometry.groups.length).toBe(2);
    }
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("builds side-mirrored custom wheels for the hero SUV, keeps its spare in the body", () => {
    // Force hero-SUV vehicles: find ids that assign to BOXY.
    const ids: number[] = [];
    for (let id = 0; ids.length < 2 && id < 100000; id++) {
      if (assignModel(id) === BOXY_INDEX) ids.push(id);
    }
    expect(ids.length).toBe(2);
    const vehicles = ids.map((id) => vehicle(id));
    const fleet = buildTrafficFleet(makeScenes(), vehicles);
    const rig = fleet.models[BOXY_INDEX].rig;
    expect(rig.customWheel).not.toBeNull();
    // 2 instances per car per side (front/rear).
    expect(fleet.customWheelL[BOXY_INDEX]?.count).toBe(2 * 2);
    expect(fleet.customWheelR[BOXY_INDEX]?.count).toBe(2 * 2);
    // Custom-wheel model uses its own geometry at scale 1.
    expect(fleet.wheelScale[0]).toBe(1);
    // The tailgate spare (tire material inside the BODY mesh) is NOT stripped
    // by wheel extraction — exclusion is by wheel-node subtree.
    expect(rig.bodyMaterials.map((m) => m.name)).toContain("tire");
    // Standard models never get custom wheel meshes.
    expect(fleet.customWheelL[KOLOS_INDEX]).toBeNull();
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("reads wheel radius from the authored hub height", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1)]);
    const rig = fleet.models[fleet.assign[0]].rig;
    expect(rig.wheelRadius).toBeCloseTo(0.32); // fixture hub height
    expect(fleet.wheelRadius[0]).toBeCloseTo(0.32);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});

describe("buildTrafficFleet parked pass", () => {
  it("builds static per-model parked instances + a 4-per-car wheel mesh", () => {
    const vehicles = [vehicle(1), vehicle(2), vehicle(3)];
    const parked = [0, 0, 3, 5, 0].map((model, i) => ({ model, seed: i * 977 }));
    const fleet = buildTrafficFleet(makeScenes(), vehicles, parked);

    // Per-model instance counts follow the assignment.
    expect(fleet.parkedMeshes[0]?.count).toBe(3);
    expect(fleet.parkedMeshes[3]?.count).toBe(1);
    expect(fleet.parkedMeshes[5]?.count).toBe(1);
    for (const m of [1, 2, 4, 6, 7, BOXY_INDEX, POLICE_INDEX]) {
      expect(fleet.parkedMeshes[m]).toBeNull();
    }
    // Parked paint shells exist for the used palette models, tinted.
    expect(fleet.parkedPaintMeshes[0]?.count).toBe(3);
    expect(fleet.parkedPaintMeshes[0]?.instanceColor).not.toBeNull();
    // Slots are dense per model.
    expect(Array.from(fleet.parkedSlot)).toEqual([0, 1, 0, 0, 2]);
    expect(Array.from(fleet.parkedAssign)).toEqual([0, 0, 3, 5, 0]);
    // Wheels render for parked cars too: 4 instances per car, static mesh.
    expect(fleet.parkedWheel?.count).toBe(parked.length * 4);
    // Everything is mounted under the one fleet group (single <primitive>).
    for (const mesh of fleet.parkedMeshes) {
      if (mesh) expect(mesh.parent).toBe(fleet.group);
    }
    expect(fleet.parkedWheel?.parent).toBe(fleet.group);
    // Wheel scale defined for every parked slot.
    expect(fleet.parkedWheelScale.length).toBe(parked.length);
    for (const s of fleet.parkedWheelScale) expect(s).toBeGreaterThan(0);

    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("stays parked-free when no placements are supplied", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1)]);
    expect(fleet.parkedWheel).toBeNull();
    expect(fleet.parkedMeshes.every((m) => m === null)).toBe(true);
    expect(fleet.parkedPaintMeshes.every((m) => m === null)).toBe(true);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});
