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
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import type { TrafficVehicleState } from "../types";
import {
  ANIMAL_DIMENSIONS,
  ANIMAL_MODEL_INDEX,
  assignCivilianModel,
  assignModel,
  BICYCLE_DIMENSIONS,
  BOXY_INDEX,
  BOXY_MAX_INSTANCES,
  BOXY_MAX_INSTANCES_LOW,
  buildAnimalRig,
  buildTrafficFleet,
  carPaintMaterial,
  carPaintStandardMaterial,
  CHILD_CYCLIST_MODEL_INDEX,
  CHILD_CYCLIST_SCALE,
  CYCLIST_MODEL_INDEX,
  disposeTrafficFleet,
  EMERGENCY_DIMENSIONS,
  EMERGENCY_MODEL_INDEX,
  FLEET,
  modelForVehicle,
  paintColorFor,
  STROBE_HALF_PERIOD_S,
  STROBE_OFF,
  STROBE_ON,
  TRAIN_DIMENSIONS,
  TRAIN_LENGTH_M,
  TRAIN_MODEL_INDEX,
  TRAM_DIMENSIONS,
  TRAM_MODEL_INDEX,
  TRUCK_DIMENSIONS,
  TRUCK_MODEL_INDEX,
  updateEmergencyStrobe,
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
    // The per-id properties are compared plainly and reported ONCE below.
    // Calling expect() three times per id built 90 000 assertion objects and
    // cost ~9 s — past vitest's 5 s default on its own, so this test failed on
    // a loaded box for reasons that had nothing to do with assignModel. Same
    // three properties, same 30 000 ids, first offender still stops the loop
    // exactly as a throwing expect() did; only the overhead is gone.
    let nonDeterministicId = -1;
    let outOfRangeId = -1;
    for (let id = 0; id < N; id++) {
      const m = assignModel(id);
      if (m !== assignModel(id)) {
        nonDeterministicId = id;
        break;
      }
      if (m < 0 || m >= FLEET.length) {
        outOfRangeId = id;
        break;
      }
      counts[m]++;
    }
    expect(nonDeterministicId, "assignModel gave two answers for this id").toBe(-1);
    expect(outOfRangeId, "assignModel returned a model outside FLEET for this id").toBe(-1);
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

  it("drops the hero SUV entirely at the tier-low cap, without moving a vehicle", () => {
    // doc 82 §2.3: 22,672 tris / 16 materials at ~1-in-21 against a ≤250k-tri,
    // ≤70-draw phone budget. The point of the fix is that it is FREE: every
    // pick falls back to the kolos, so the traffic population is untouched.
    const vehicles = Array.from({ length: 400 }, (_, i) => vehicle(i));
    const scenes = makeScenes();
    const shipped = buildTrafficFleet(scenes, vehicles);
    const low = buildTrafficFleet(scenes, vehicles, [], {
      boxyMaxInstances: BOXY_MAX_INSTANCES_LOW,
    });

    expect(low.models[BOXY_INDEX].count).toBe(0);
    expect(low.models[BOXY_INDEX].mesh).toBeNull(); // no InstancedMesh, no draws
    // The kolos absorbs exactly the two instances the shipped cap allowed.
    expect(low.models[KOLOS_INDEX].count).toBe(
      shipped.models[KOLOS_INDEX].count + BOXY_MAX_INSTANCES,
    );
    // Same number of cars, every one of them still assigned a model.
    expect(low.assign.length).toBe(shipped.assign.length);
    const total = (f: typeof low) => f.models.reduce((n, m) => n + m.count, 0);
    expect(total(low)).toBe(total(shipped));
    expect(() => disposeTrafficFleet(shipped)).not.toThrow();
    expect(() => disposeTrafficFleet(low)).not.toThrow();
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

describe("animal-hazard profile (Half-B reels — the code-built quadruped)", () => {
  it("modelForVehicle maps the 'animal' profile to ANIMAL_MODEL_INDEX", () => {
    expect(modelForVehicle({ id: 9, profile: "animal" })).toBe(ANIMAL_MODEL_INDEX);
    // The default MUST be byte-identical to the pre-profile fleet pick.
    for (let id = 0; id < 100; id++) expect(modelForVehicle({ id })).toBe(assignModel(id));
  });

  it("buildAnimalRig produces a 2-group quadruped rig with hidden wheels + owned materials", () => {
    const rig = buildAnimalRig();
    // Two merged material groups: hide (torso/legs/tail) + head.
    expect(rig.bodyGeometry.groups.length).toBe(2);
    expect(rig.bodyMaterials.length).toBe(2);
    // No paint tint; four wheel offsets; wheels are the hidden-placeholder pair.
    expect(rig.paint).toBeNull();
    expect(rig.customWheel).not.toBeNull();
    expect(rig.wheelOffsets.length).toBe(4);
    expect(rig.halfLength).toBeCloseTo(ANIMAL_DIMENSIONS.halfLengthM);
    expect(rig.halfWidth).toBeCloseTo(ANIMAL_DIMENSIONS.halfWidthM);
    // Materials (hide, head, hidden-wheel) are OWNED — disposed on teardown.
    expect(rig.ownedMaterials.length).toBe(3);
    rig.bodyGeometry.dispose();
    for (const m of rig.ownedMaterials) m.dispose();
  });

  it("builds an InstancedMesh only when an animal actor is staged (cost discipline)", () => {
    const animal: TrafficVehicleState = { ...vehicle(1), profile: "animal" };
    const fleet = buildTrafficFleet(makeScenes(), [animal, vehicle(2)]);
    expect(fleet.assign[0]).toBe(ANIMAL_MODEL_INDEX);
    expect(fleet.assign[1]).toBe(assignModel(2)); // ambient neighbor untouched
    expect(fleet.models[ANIMAL_MODEL_INDEX].count).toBe(1);
    expect(fleet.models[ANIMAL_MODEL_INDEX].mesh).not.toBeNull();
    expect(fleet.models[ANIMAL_MODEL_INDEX].mesh?.name).toBe("traffic-body-animal");
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("costs nothing when no animal actor exists (no InstancedMesh)", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(3)]);
    expect(fleet.models[ANIMAL_MODEL_INDEX].count).toBe(0);
    expect(fleet.models[ANIMAL_MODEL_INDEX].mesh).toBeNull();
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});

describe("large-vehicle profile (doc 72 FO-06)", () => {
  const KARGO_V_INDEX = FLEET.indexOf("kargo_v");

  it("modelForVehicle: profile overrides the pick; ambient (no profile) stays assignModel", () => {
    expect(modelForVehicle({ id: 7, profile: "truck" })).toBe(TRUCK_MODEL_INDEX);
    expect(modelForVehicle({ id: 7, profile: "van" })).toBe(KARGO_V_INDEX);
    // The default MUST be byte-identical to the pre-profile fleet pick.
    for (let id = 0; id < 200; id++) {
      expect(modelForVehicle({ id })).toBe(assignModel(id));
      expect(modelForVehicle({ id, profile: "car" })).toBe(assignModel(id));
    }
  });

  it("builds the procedural box-truck rig for a truck-profile vehicle", () => {
    const truck: TrafficVehicleState = { ...vehicle(1), profile: "truck" };
    const fleet = buildTrafficFleet(makeScenes(), [truck, vehicle(2)]);
    expect(fleet.assign[0]).toBe(TRUCK_MODEL_INDEX);
    expect(fleet.assign[1]).toBe(assignModel(2)); // ambient neighbor untouched
    const model = fleet.models[TRUCK_MODEL_INDEX];
    expect(model.count).toBe(1);
    expect(model.mesh).not.toBeNull();
    expect(model.mesh?.name).toBe("traffic-body-box_truck");
    // The rig is genuinely LARGER than every car (the vision-blocking point):
    // footprint 7.5 × 2.4 vs the fixture cars' ~4.35 × 1.8.
    const rig = model.rig;
    expect(rig.halfLength).toBeCloseTo(TRUCK_DIMENSIONS.lengthM / 2);
    expect(rig.halfWidth).toBeCloseTo(TRUCK_DIMENSIONS.widthM / 2);
    expect(rig.paint).toBeNull(); // no palette tint
    expect(rig.customWheel).toBeNull(); // shared wheel, scaled up
    expect(fleet.wheelScale[0]).toBeCloseTo(TRUCK_DIMENSIONS.wheelRadiusM / 0.32);
    expect(fleet.wheelRadius[0]).toBeCloseTo(TRUCK_DIMENSIONS.wheelRadiusM);
    // Truck materials are OWNED (disposed on teardown), never drei-cached.
    expect(rig.ownedMaterials.length).toBe(2);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("a van-profile vehicle reuses the kargo_v panel-van rig", () => {
    const van: TrafficVehicleState = { ...vehicle(3), profile: "van" };
    const fleet = buildTrafficFleet(makeScenes(), [van]);
    expect(fleet.assign[0]).toBe(KARGO_V_INDEX);
    expect(fleet.models[KARGO_V_INDEX].count).toBe(1);
    expect(fleet.models[TRUCK_MODEL_INDEX].count).toBe(0);
    expect(fleet.models[TRUCK_MODEL_INDEX].mesh).toBeNull(); // costs nothing unused
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("builds the procedural emergency rig (VU-09) — white body + blue light-bar group", () => {
    const ev: TrafficVehicleState = { ...vehicle(5), profile: "emergency" };
    expect(modelForVehicle({ id: 5, profile: "emergency" })).toBe(EMERGENCY_MODEL_INDEX);
    const fleet = buildTrafficFleet(makeScenes(), [ev, vehicle(6)]);
    expect(fleet.assign[0]).toBe(EMERGENCY_MODEL_INDEX);
    expect(fleet.assign[1]).toBe(assignModel(6)); // ambient neighbor untouched
    const model = fleet.models[EMERGENCY_MODEL_INDEX];
    expect(model.count).toBe(1);
    expect(model.mesh).not.toBeNull();
    expect(model.mesh?.name).toBe("traffic-body-emergency");
    const rig = model.rig;
    expect(rig.halfLength).toBeCloseTo(EMERGENCY_DIMENSIONS.lengthM / 2);
    expect(rig.halfWidth).toBeCloseTo(EMERGENCY_DIMENSIONS.widthM / 2);
    expect(rig.paint).toBeNull(); // no palette tint — white + blue IS the livery
    expect(rig.customWheel).toBeNull(); // shared wheel, scaled to the 0.38 m hubs
    expect(fleet.wheelScale[0]).toBeCloseTo(EMERGENCY_DIMENSIONS.wheelRadiusM / 0.32);
    // Four owned material groups: the white body + the emissive blue kit
    // (light bar + beltline stripes) + the two beacon lamp domes — ADR-001:
    // fictional, no insignia.
    expect(rig.ownedMaterials.length).toBe(4);
    expect(rig.bodyMaterials.length).toBe(4);
    const blue = rig.bodyMaterials.find((m) => m.name === "emergency_blue") as MeshStandardMaterial;
    expect(blue).toBeDefined();
    expect(blue.emissiveIntensity).toBeGreaterThan(0); // the light bar reads lit
    // Strobe channel: the two lamp-dome materials, unlit-lens dark at build.
    expect(rig.strobe).toBeDefined();
    expect(rig.strobe?.left.toneMapped).toBe(false);
    expect(rig.strobe?.right.toneMapped).toBe(false);
    expect(rig.strobe?.left.color.getHex()).toBe(STROBE_OFF);
    expect(rig.strobe?.right.color.getHex()).toBe(STROBE_OFF);
    // The unused truck slot stays free alongside it.
    expect(fleet.models[TRUCK_MODEL_INDEX].mesh).toBeNull();
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("strobes the emergency beacon in anti-phase on the blink clock", () => {
    const ev: TrafficVehicleState = { ...vehicle(5), profile: "emergency" };
    const fleet = buildTrafficFleet(makeScenes(), [ev]);
    const strobe = fleet.models[EMERGENCY_MODEL_INDEX].rig.strobe;
    expect(strobe).toBeDefined();
    // Phase 0: left lit, right dark.
    updateEmergencyStrobe(fleet, 0);
    expect(strobe?.left.color.getHex()).toBe(STROBE_ON);
    expect(strobe?.right.color.getHex()).toBe(STROBE_OFF);
    // Same phase again — cached, colors unchanged.
    updateEmergencyStrobe(fleet, STROBE_HALF_PERIOD_S * 0.9);
    expect(strobe?.left.color.getHex()).toBe(STROBE_ON);
    // Phase 1: flipped.
    updateEmergencyStrobe(fleet, STROBE_HALF_PERIOD_S * 1.1);
    expect(strobe?.left.color.getHex()).toBe(STROBE_OFF);
    expect(strobe?.right.color.getHex()).toBe(STROBE_ON);
    // And back on the next half period.
    updateEmergencyStrobe(fleet, STROBE_HALF_PERIOD_S * 2.2);
    expect(strobe?.left.color.getHex()).toBe(STROBE_ON);
    expect(strobe?.right.color.getHex()).toBe(STROBE_OFF);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("emergency strobe is a no-op without a staged emergency actor", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1)]);
    expect(fleet.models[EMERGENCY_MODEL_INDEX].mesh).toBeNull();
    expect(() => updateEmergencyStrobe(fleet, 1.23)).not.toThrow();
    // Unused rig's lenses stay dark (no phase ever written).
    expect(fleet.models[EMERGENCY_MODEL_INDEX].rig.strobe?.phase).toBe(-1);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("builds the procedural articulated tram rig (RX-04/RX-05) — crimson body + graphite kit", () => {
    const tram: TrafficVehicleState = { ...vehicle(9), profile: "tram" };
    expect(modelForVehicle({ id: 9, profile: "tram" })).toBe(TRAM_MODEL_INDEX);
    const fleet = buildTrafficFleet(makeScenes(), [tram, vehicle(10)]);
    expect(fleet.assign[0]).toBe(TRAM_MODEL_INDEX);
    expect(fleet.assign[1]).toBe(assignModel(10)); // ambient neighbor untouched
    const model = fleet.models[TRAM_MODEL_INDEX];
    expect(model.count).toBe(1);
    expect(model.mesh).not.toBeNull();
    expect(model.mesh?.name).toBe("traffic-body-tram");
    const rig = model.rig;
    // The rig is genuinely a TRAM: ~14 m — nearly twice the box truck, more
    // than 3× every fleet car (the perceptual point of RX-05's actor).
    expect(rig.halfLength).toBeCloseTo(TRAM_DIMENSIONS.lengthM / 2);
    expect(rig.halfWidth).toBeCloseTo(TRAM_DIMENSIONS.widthM / 2);
    expect(rig.halfLength).toBeGreaterThan(TRUCK_DIMENSIONS.lengthM / 2 + 3);
    expect(rig.paint).toBeNull(); // no palette tint — the crimson IS the livery
    expect(rig.customWheel).toBeNull(); // shared wheel, scaled to the 0.33 m bogies
    expect(fleet.wheelScale[0]).toBeCloseTo(TRAM_DIMENSIONS.wheelRadiusM / 0.32);
    // Two owned material groups: the crimson body segments + the graphite kit
    // (bellows, roof strips, pantograph) — ADR-001: fictional, no insignia.
    expect(rig.ownedMaterials.length).toBe(2);
    expect(rig.bodyMaterials.length).toBe(2);
    expect(rig.bodyMaterials.map((m) => m.name).sort()).toEqual(["tram_dark", "tram_paint"]);
    // The unused truck + emergency slots stay free alongside it.
    expect(fleet.models[TRUCK_MODEL_INDEX].mesh).toBeNull();
    expect(fleet.models[EMERGENCY_MODEL_INDEX].mesh).toBeNull();
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});

describe("procedural multi-unit TRAIN rig (RX-02/RX-01 — the level-crossing actor)", () => {
  it("modelForVehicle: the train profile maps to its own slot, one past the child cyclist", () => {
    expect(modelForVehicle({ id: 9, profile: "train" })).toBe(TRAIN_MODEL_INDEX);
    expect(TRAIN_MODEL_INDEX).toBe(FLEET.length + 5);
  });

  it("builds a genuine multi-unit consist: LONGER than the tram, teal + yellow + graphite", () => {
    const train: TrafficVehicleState = { ...vehicle(9), profile: "train" };
    const fleet = buildTrafficFleet(makeScenes(), [train, vehicle(10)]);
    expect(fleet.assign[0]).toBe(TRAIN_MODEL_INDEX);
    expect(fleet.assign[1]).toBe(assignModel(10)); // ambient neighbour untouched
    const model = fleet.models[TRAIN_MODEL_INDEX];
    expect(model.count).toBe(1);
    expect(model.mesh).not.toBeNull();
    expect(model.mesh?.name).toBe("traffic-body-train");
    const rig = model.rig;
    // A ~34 m consist — longer than the 14 m tram (the perceptual point: a
    // train can neither stop nor swerve at the crossing).
    expect(rig.halfLength).toBeCloseTo(TRAIN_LENGTH_M / 2);
    expect(rig.halfLength).toBeGreaterThan(TRAM_DIMENSIONS.lengthM / 2);
    expect(rig.halfWidth).toBeCloseTo(TRAIN_DIMENSIONS.widthM / 2);
    // Wheel track = HALF the rail gauge so the bogies sit on the drawn rails,
    // and the body is WIDER than the gauge (overhangs the rails).
    expect(TRAIN_DIMENSIONS.widthM).toBeGreaterThan(TRAIN_DIMENSIONS.railGaugeM);
    expect(rig.paint).toBeNull(); // no palette tint — the livery IS the identity
    expect(rig.customWheel).toBeNull(); // shared wheel, scaled to the 0.46 m bogies
    expect(fleet.wheelScale[0]).toBeCloseTo(TRAIN_DIMENSIONS.wheelRadiusM / 0.32);
    // Three owned material groups: teal body + yellow accent + graphite kit.
    expect(rig.ownedMaterials.length).toBe(3);
    expect(rig.bodyMaterials.length).toBe(3);
    expect(rig.bodyMaterials.map((m) => m.name).sort()).toEqual([
      "train_accent",
      "train_dark",
      "train_paint",
    ]);
    // The unused tram/truck/emergency slots stay free alongside it.
    expect(fleet.models[TRAM_MODEL_INDEX].mesh).toBeNull();
    expect(fleet.models[TRUCK_MODEL_INDEX].mesh).toBeNull();
    expect(fleet.models[EMERGENCY_MODEL_INDEX].mesh).toBeNull();
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("costs nothing when no train actor exists (no InstancedMesh)", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1), vehicle(2)]);
    expect(fleet.models[TRAIN_MODEL_INDEX].count).toBe(0);
    expect(fleet.models[TRAIN_MODEL_INDEX].mesh).toBeNull();
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});

describe("cyclist bicycle rigs (audit C3's render half — VU-01/02/03)", () => {
  it("modelForVehicle: cyclist profiles map to the bicycle slots", () => {
    expect(modelForVehicle({ id: 7, profile: "cyclist" })).toBe(CYCLIST_MODEL_INDEX);
    expect(modelForVehicle({ id: 7, profile: "childCyclist" })).toBe(CHILD_CYCLIST_MODEL_INDEX);
  });

  it("builds the adult bicycle + rider rig: narrow footprint, real spinning wheels", () => {
    const bike: TrafficVehicleState = { ...vehicle(11), profile: "cyclist" };
    const fleet = buildTrafficFleet(makeScenes(), [bike, vehicle(12)]);
    expect(fleet.assign[0]).toBe(CYCLIST_MODEL_INDEX);
    expect(fleet.assign[1]).toBe(assignModel(12)); // ambient neighbor untouched
    const model = fleet.models[CYCLIST_MODEL_INDEX];
    expect(model.count).toBe(1);
    expect(model.mesh).not.toBeNull();
    expect(model.mesh?.name).toBe("traffic-body-cyclist");
    const rig = model.rig;
    // Genuinely a BICYCLE footprint: ~1.7 × 0.46 m vs the fixture cars'
    // ~4.35 × 1.8 — the narrow-and-tall silhouette IS the perceptual point.
    expect(rig.halfLength).toBeCloseTo(BICYCLE_DIMENSIONS.halfLengthM);
    expect(rig.halfWidth).toBeCloseTo(BICYCLE_DIMENSIONS.halfWidthM);
    expect(rig.paint).toBeNull(); // no palette tint — the frame IS the livery
    // Custom-wheel channel: 2 slots per side; the visible wheel rides the LEFT
    // set at both centerline hubs, so the front steers and both roll.
    expect(rig.customWheel).not.toBeNull();
    expect(fleet.customWheelL[CYCLIST_MODEL_INDEX]?.count).toBe(2);
    expect(fleet.customWheelR[CYCLIST_MODEL_INDEX]?.count).toBe(2);
    expect(fleet.customWheelL[CYCLIST_MODEL_INDEX]?.name).toBe("traffic-wheels-cyclist-L");
    expect(fleet.wheelScale[0]).toBe(1); // custom wheels: no shared-wheel draw
    expect(fleet.wheelRadius[0]).toBeCloseTo(BICYCLE_DIMENSIONS.wheelRadiusM);
    expect(rig.wheelOffsets[0].x).toBe(0); // centerline, front hub
    expect(rig.wheelOffsets[0].z).toBeCloseTo(BICYCLE_DIMENSIONS.hubZM);
    expect(rig.wheelOffsets[2].z).toBeCloseTo(-BICYCLE_DIMENSIONS.hubZM);
    // Three merged groups — frame kit + rider clothes + skin — all OWNED
    // (frame, clothes, skin + the two wheel materials; ADR-001 fictional).
    expect(rig.bodyMaterials.map((m) => m.name)).toEqual([
      "bike_frame",
      "bike_rider",
      "bike_skin",
    ]);
    expect(rig.ownedMaterials.length).toBe(5);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("the child rig is the scaled plan — the „дете с колело“ silhouette", () => {
    const child: TrafficVehicleState = { ...vehicle(13), profile: "childCyclist" };
    const fleet = buildTrafficFleet(makeScenes(), [child]);
    expect(fleet.assign[0]).toBe(CHILD_CYCLIST_MODEL_INDEX);
    const model = fleet.models[CHILD_CYCLIST_MODEL_INDEX];
    expect(model.count).toBe(1);
    expect(model.mesh?.name).toBe("traffic-body-cyclist_child");
    const rig = model.rig;
    expect(rig.halfLength).toBeCloseTo(BICYCLE_DIMENSIONS.halfLengthM * CHILD_CYCLIST_SCALE);
    expect(rig.wheelRadius).toBeCloseTo(BICYCLE_DIMENSIONS.wheelRadiusM * CHILD_CYCLIST_SCALE);
    expect(rig.bodyMaterials.map((m) => m.name)).toEqual([
      "bike_frame_child",
      "bike_rider",
      "bike_skin",
    ]);
    // Each variant costs only itself: the adult slot stays free alongside.
    expect(fleet.models[CYCLIST_MODEL_INDEX].mesh).toBeNull();
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});

describe("hero clearcoat paint", () => {
  it("carPaintMaterial is a MeshPhysicalMaterial with the clearcoat recipe", () => {
    const mat = carPaintMaterial({ color: 0x0a0a0a });
    expect(mat).toBeInstanceOf(MeshPhysicalMaterial);
    expect(mat.clearcoat).toBe(1);
    expect(mat.clearcoatRoughness).toBeCloseTo(0.03);
    expect(mat.metalness).toBeCloseTo(0.9);
    expect(mat.roughness).toBeCloseTo(0.5);
    expect(mat.transmission).toBe(0); // banned on gameplay vehicles
    mat.dispose();
  });

  it("carPaintStandardMaterial is the glossy MeshStandard fallback (no clearcoat lobe)", () => {
    const mat = carPaintStandardMaterial({ color: 0x0a0a0a });
    expect(mat).toBeInstanceOf(MeshStandardMaterial);
    expect(mat).not.toBeInstanceOf(MeshPhysicalMaterial);
    expect(mat.metalness).toBeCloseTo(0.7);
    expect(mat.roughness).toBeCloseTo(0.35);
    expect(mat.envMapIntensity).toBeCloseTo(1.4);
    mat.dispose();
  });

  it("upgrades the hero SUV paint to clearcoat but keeps the fleet on MeshStandard", () => {
    // Rigs are extracted for every model regardless of instance count.
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1)]);

    // Hero SUV body carries exactly one physical (clearcoat) paint material,
    // and it is OWNED (disposed on teardown).
    const suv = fleet.models[BOXY_INDEX].rig;
    const physical = suv.bodyMaterials.filter((m) => m instanceof MeshPhysicalMaterial);
    expect(physical.length).toBe(1);
    expect((physical[0] as MeshPhysicalMaterial).clearcoat).toBe(1);
    expect(suv.ownedMaterials).toContain(physical[0]);

    // A fleet model (kolos, the ambient boxy SUV) stays MeshStandard — the
    // clearcoat is hero-only. (MeshPhysicalMaterial extends MeshStandard, so
    // an explicit instanceof check is what distinguishes them.)
    const kolos = fleet.models[KOLOS_INDEX].rig;
    expect(kolos.bodyMaterials.some((m) => m instanceof MeshPhysicalMaterial)).toBe(false);
    expect(kolos.ownedMaterials.length).toBe(0);

    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("drops the hero SUV to glossy MeshStandard on the med/low tier (clearcoat=false)", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1)], [], { clearcoat: false });

    // The SUV paint is now a plain MeshStandard (still OWNED + disposed), NOT a
    // MeshPhysicalMaterial — no clearcoat lobe on the cheaper tiers.
    const suv = fleet.models[BOXY_INDEX].rig;
    const physical = suv.bodyMaterials.filter((m) => m instanceof MeshPhysicalMaterial);
    expect(physical.length).toBe(0);
    const owned = suv.ownedMaterials;
    expect(owned.length).toBe(1);
    expect(owned[0]).toBeInstanceOf(MeshStandardMaterial);
    expect((owned[0] as MeshStandardMaterial).metalness).toBeCloseTo(0.7);
    // The owned paint material is actually wired onto the merged body.
    expect(suv.bodyMaterials).toContain(owned[0]);

    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });

  it("defaults to clearcoat when no options are passed (the full look)", () => {
    const fleet = buildTrafficFleet(makeScenes(), [vehicle(1)], []);
    const suv = fleet.models[BOXY_INDEX].rig;
    expect(suv.bodyMaterials.some((m) => m instanceof MeshPhysicalMaterial)).toBe(true);
    expect(() => disposeTrafficFleet(fleet)).not.toThrow();
  });
});
