/**
 * sc-roundabout-entry:08a0b701 (lane npcstep) — THE NPC SHELL POOL, STEPPED ON
 * THE SESSION GRID (scene/npcShells.ts), and the cabin refresh the scene makes
 * before it grades a point inside a frame (scene/vehicleSample.ts
 * `updateCabinChannels`).
 *
 * The cadence proof is elsewhere (lessons/scenario/__tests__/
 * npc-contact-cadence.test.ts and its census: the pool on rapier, under
 * @react-three/rapier's stepper, against the product's chassis). THIS file
 * holds the pool's own contract, executed against recording bodies and against
 * rapier:
 *
 *   · who holds a shell is chosen on the GRID's index — the pool's first point
 *     and every k ≡ 0 (mod 30) — from the student it is HANDED, and from
 *     nothing else;
 *   · a bound shell is given its agent's pose at the point as the NEXT
 *     kinematic pose, so rapier moves it there in ONE step at the agent's own
 *     one-step velocity — on real rapier, every step; a shell that changes
 *     agent teleports (no implied velocity);
 *   · the budget: 8 + 4 shells, 130 m / 70 m, the per-agent fit — unchanged;
 *     with no agent in range a point costs twelve compares and writes nothing;
 *   · the per-point cost, MEASURED and printed (the task's «state the per-step
 *     cost»).
 *
 * ROUND 2 adds:
 *   · ONE TOUCH, ONE KIND — a shell bound to a member of the lesson's staged
 *     cast carries the CAST's kind (the director's record), whatever the
 *     traffic system's curb-offset marker says; a state no cast names reads
 *     the marker. (The catalogue-wide pin and the chassis drive are
 *     lessons/scenario/__tests__/npc-shell-cast-kind.test.ts.)
 *   · A RESPAWN — the first point after `GradeGrid.reset()` re-chooses every
 *     binding from that point's student and TELEPORTS every shell, on real
 *     rapier with no implied velocity; the grid hands the flag to exactly one
 *     point, the first that BEGINS after the reset.
 */
import { appendFileSync } from "node:fs";
import RAPIER from "../../../../../node_modules/@react-three/rapier/node_modules/@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { actorObb } from "../../collision";
import type { VehicleSample } from "../../contracts";
import { FIXED_DT } from "../../vehicle/tuning";
import type { PhysicsStepSource } from "../../traffic";
import { CabinControls } from "../cabin";
import { GradeGrid, type GradeGridHooks, type GradeGridWorld } from "../gradeGrid";
import {
  createNpcShellTags,
  NPC_SHELL_PARK_Y,
  NPC_SHELL_REBIND_POINTS,
  NPC_SHELL_REBIND_SEC,
  NPC_VEHICLE_SHELL_HALF_HEIGHT_M,
  NpcShellPool,
  PED_SHELL_COUNT,
  PED_SHELL_RADIUS_M,
  pedShellParkX,
  VEHICLE_SHELL_COUNT,
  VEHICLE_SHELL_RADIUS_M,
  vehicleShellParkX,
  type NpcShellBody,
  type NpcShellCast,
  type NpcShellTraffic,
} from "../npcShells";
import { createVehicleSample, updateCabinChannels, updateVehicleSample } from "../vehicleSample";

beforeAll(async () => {
  await RAPIER.init();
});

type Veh = NpcShellTraffic["vehicles"][number];
type Ped = NpcShellTraffic["pedestrians"][number];

const veh = (id: number, x: number, y: number, o: Partial<Veh> = {}): Veh =>
  ({ id, x, y, dirX: 0, dirY: 1, speedMps: 0, ...o }) as Veh;
const ped = (id: number, x: number, y: number): Ped => ({ id, x, y, dirX: 0, dirY: 1, speedMps: 0 }) as Ped;

/** `cyclists`: the state ids the traffic system's curb-offset marker tags;
 *  `staged`: state id → the staged actor's id (every other id is ambient). */
function world(
  vehicles: Veh[],
  pedestrians: Ped[] = [],
  cyclists: number[] = [],
  staged: Record<number, string> = {},
): NpcShellTraffic {
  return {
    vehicles,
    pedestrians,
    vehicleCollisionKind: (id: number) => (cyclists.includes(id) ? "cyclist" : "vehicle"),
    stagedActorId: (id: number) => staged[id] ?? null,
  } as unknown as NpcShellTraffic;
}

/** A body that records what the pool did to it. */
interface Recorded extends NpcShellBody {
  calls: string[];
  halfExtents: { x: number; y: number; z: number } | null;
}
function recordingBody(): Recorded {
  const b: Recorded = {
    calls: [],
    halfExtents: null,
    numColliders: () => 1,
    collider: () => ({
      setHalfExtents: (v) => {
        b.halfExtents = { ...v };
        b.calls.push("fit");
      },
    }),
    setTranslation: (v, wake) => void b.calls.push(`teleport ${v.x},${v.y},${v.z} ${wake}`),
    setRotation: (q) => void b.calls.push(`teleportRot ${q.y.toFixed(6)},${q.w.toFixed(6)}`),
    setNextKinematicTranslation: (v) => void b.calls.push(`next ${v.x},${v.y},${v.z}`),
    setNextKinematicRotation: (q) => void b.calls.push(`nextRot ${q.y.toFixed(6)},${q.w.toFixed(6)}`),
  };
  return b;
}
function mount(traffic: NpcShellTraffic, cast: NpcShellCast = []) {
  const vehBodies = Array.from({ length: VEHICLE_SHELL_COUNT }, recordingBody);
  const pedBodies = Array.from({ length: PED_SHELL_COUNT }, recordingBody);
  const vehTags = createNpcShellTags(VEHICLE_SHELL_COUNT, "vehicle");
  const pedTags = createNpcShellTags(PED_SHELL_COUNT, "pedestrian");
  const pool = new NpcShellPool(traffic, vehTags, pedTags, cast);
  const clear = () => [...vehBodies, ...pedBodies].forEach((b) => (b.calls.length = 0));
  const writes = () => [...vehBodies, ...pedBodies].reduce((n, b) => n + b.calls.length, 0);
  return { pool, vehBodies, pedBodies, vehTags, pedTags, clear, writes };
}
const at = (x: number, y: number): Pick<VehicleSample, "position"> => ({ position: { x, y } });

describe("NpcShellPool — who holds a shell is chosen on the grid's index, from the student it is handed", () => {
  it("the rebind interval is the pool's 0.5 s, counted in grid points: 0.5 ÷ (1/60) = 30", () => {
    expect(NPC_SHELL_REBIND_SEC).toBe(0.5);
    expect(NPC_SHELL_REBIND_POINTS).toBe(30);
    expect(NPC_SHELL_REBIND_POINTS * FIXED_DT).toBeCloseTo(NPC_SHELL_REBIND_SEC, 12);
  });

  it("the pool's first point binds, whatever its index; after that only the points k ≡ 0 (mod 30) choose again", () => {
    const m = mount(world([veh(1, 0, 10)]));
    m.pool.step(7, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.pool.rebinds).toBe(1);
    expect(m.vehTags[0].npcId).toBe(1);
    const rebindAt: number[] = [];
    for (let k = 8; k <= 130; k++) {
      const before = m.pool.rebinds;
      m.pool.step(k, at(0, 0), m.vehBodies, m.pedBodies);
      if (m.pool.rebinds !== before) rebindAt.push(k);
    }
    expect(rebindAt).toEqual([30, 60, 90, 120]);
  });

  it("a road user that comes into range between two rebind points is a ghost until the next one — and bound AT it, on every display the same point", () => {
    const car = veh(5, 0, 400);
    const m = mount(world([car]));
    const boundAt: number[] = [];
    for (let k = 1; k <= 100; k++) {
      if (k === 41) car.y = 50; // into range just after the rebind at 30
      m.pool.step(k, at(0, 0), m.vehBodies, m.pedBodies);
      if (m.vehTags[0].npcId === 5 && boundAt.length === 0) boundAt.push(k);
    }
    expect(boundAt).toEqual([60]);
  });

  it("the nearest are chosen from the STUDENT HANDED IN — the same world, another student, other shells", () => {
    const cars = Array.from({ length: 12 }, (_, i) => veh(100 + i, 0, i * 20)); // y = 0 … 220
    const near = mount(world(cars));
    near.pool.step(30, at(0, 0), near.vehBodies, near.pedBodies);
    // 130 m: y = 0 … 120 are in range (7 cars).
    expect(near.vehTags.map((t) => t.npcId).filter((id) => id >= 0).sort((a, b) => a - b)).toEqual([100, 101, 102, 103, 104, 105, 106]);
    const far = mount(world(cars));
    far.pool.step(30, at(0, 220), far.vehBodies, far.pedBodies);
    // From y = 220: 100 … 220 are in range (7), nearest first.
    expect(far.vehTags.map((t) => t.npcId).filter((id) => id >= 0).sort((a, b) => a - b)).toEqual([105, 106, 107, 108, 109, 110, 111]);
  });

  it("the budget is unchanged: 8 vehicle shells within 130 m, 4 pedestrian shells within 70 m, the nearest first", () => {
    expect([VEHICLE_SHELL_COUNT, PED_SHELL_COUNT, VEHICLE_SHELL_RADIUS_M, PED_SHELL_RADIUS_M]).toEqual([8, 4, 130, 70]);
    const cars = Array.from({ length: 12 }, (_, i) => veh(i, 0, 5 + i * 10)); // 5 … 115 m: all in range
    const peds = [ped(50, 0, 10), ped(51, 0, 30), ped(52, 0, 69), ped(53, 0, 71), ped(54, 0, 20), ped(55, 0, 40)];
    const m = mount(world(cars, peds));
    m.pool.step(1, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.vehTags.map((t) => t.npcId).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Five pedestrians are within 70 m; the four nearest hold a shell.
    expect(m.pedTags.map((t) => t.npcId).sort((a, b) => a - b)).toEqual([50, 51, 54, 55]);
  });

  it("a state NO cast names reads the traffic system's marker (the tag VehicleRig's ear classifies the contact by): an ambient car, and a staged rider whose runner casts nothing", () => {
    // 7: ambient; 1000: staged, marked a cyclist by its curb offset, in no cast.
    const m = mount(world([veh(7, 0, 10), veh(1000, 3, 10)], [], [1000], { 1000: "sc-x-rider" }), []);
    m.pool.step(1, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.vehTags.filter((t) => t.npcId >= 0).map((t) => `${t.npcId}:${t.kind}`).sort()).toEqual(["1000:cyclist", "7:vehicle"]);
  });

  it("ONE TOUCH, ONE KIND: a shell bound to a member of the staged cast carries the CAST's kind — both ways round against the marker (the two lessons that billed one touch twice)", () => {
    const tagsOf = (m: ReturnType<typeof mount>) =>
      m.vehTags.filter((t) => t.npcId >= 0).map((t) => `${t.npcId}:${t.kind}`).sort();
    // sc-vu-bikelane-turn's shape: the rider's curb offset is NEGATIVE, so the
    // marker says «vehicle»; the director casts him a cyclist.
    const bikelane = mount(world([veh(1000, 0, 10), veh(1001, 3, 10)], [], [], { 1000: "rider-wf", 1001: "rider-cf" }), [
      { actorId: "rider-wf", withWhat: "cyclist" },
      { actorId: "rider-cf", withWhat: "cyclist" },
    ]);
    bikelane.pool.step(1, at(0, 0), bikelane.vehBodies, bikelane.pedBodies);
    expect(tagsOf(bikelane)).toEqual(["1000:cyclist", "1001:cyclist"]);
    // …and the mirror image: a marker that says «cyclist» for a body its
    // runner casts as a vehicle — the cast is what the sentinel reports, so
    // the shell says the same (the catalogue has no such body any more; the
    // pool does not depend on that).
    const mirror = mount(world([veh(1000, 0, 10)], [], [1000], { 1000: "lead" }), [{ actorId: "lead", withWhat: "vehicle" }]);
    mirror.pool.step(1, at(0, 0), mirror.vehBodies, mirror.pedBodies);
    expect(tagsOf(mirror)).toEqual(["1000:vehicle"]);
    // A cast that names ANOTHER actor changes nothing for this one.
    const other = mount(world([veh(1000, 0, 10)], [], [1000], { 1000: "rider" }), [{ actorId: "someone-else", withWhat: "vehicle" }]);
    other.pool.step(1, at(0, 0), other.vehBodies, other.pedBodies);
    expect(tagsOf(other)).toEqual(["1000:cyclist"]);
  });

  it("a shell that passes from a cast member to an uncast state takes the new state's kind at that rebind (the tag is rewritten on every new binding)", () => {
    const rider = veh(1000, 0, 10);
    const car = veh(3, 0, 300);
    const m = mount(world([rider, car], [], [], { 1000: "rider" }), [{ actorId: "rider", withWhat: "cyclist" }]);
    m.pool.step(30, at(0, 0), m.vehBodies, m.pedBodies);
    expect([m.vehTags[0].npcId, m.vehTags[0].kind]).toEqual([1000, "cyclist"]);
    rider.y = 900;
    car.y = 12;
    m.pool.step(60, at(0, 0), m.vehBodies, m.pedBodies);
    expect([m.vehTags[0].npcId, m.vehTags[0].kind]).toEqual([3, "vehicle"]);
  });

  it("a staged walker in the cast is a pedestrian through both reporters; an ambient walker's capsule says «pedestrian» as it always did", () => {
    const m = mount(world([], [ped(1000, 0, 5), ped(4, 2, 5)], [], { 1000: "sc-x-walker" }), [{ actorId: "sc-x-walker", withWhat: "pedestrian" }]);
    m.pool.step(1, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.pedTags.filter((t) => t.npcId >= 0).map((t) => `${t.npcId}:${t.kind}`).sort()).toEqual(["1000:pedestrian", "4:pedestrian"]);
  });
});

describe("NpcShellPool — a respawn re-binds on the grid (round 2)", () => {
  it("the respawn point re-chooses from ITS student whatever the rebind phase, and every shell is teleported — the one that keeps its agent too; a shell that loses its agent parks", () => {
    const near = veh(1, 0, 10);
    const atSpawn = veh(2, 500, 10);
    const walker = ped(9, 0, 6);
    const m = mount(world([near, atSpawn], [walker]));
    m.pool.step(30, at(0, 0), m.vehBodies, m.pedBodies);
    expect([m.vehTags[0].npcId, m.pedTags[0].npcId]).toEqual([1, 9]);
    m.pool.step(31, at(0, 0), m.vehBodies, m.pedBodies);
    m.clear();
    // Point 37 — seven points after a rebind, twenty-three before the next —
    // is the first after a respawn: the car stands at its spawn point (500, 0)
    // and the director put the staged car back on its hold (500, 12).
    atSpawn.y = 12;
    const before = m.pool.rebinds;
    m.pool.step(37, at(500, 0), m.vehBodies, m.pedBodies, true);
    expect(m.pool.rebinds).toBe(before + 1);
    expect(m.vehTags[0].npcId).toBe(2);
    expect(m.vehBodies[0].calls.filter((c) => c.startsWith("next"))).toEqual([]);
    expect(m.vehBodies[0].calls).toContain(`teleport 500,${NPC_VEHICLE_SHELL_HALF_HEIGHT_M},-12 true`);
    // The walker is out of range of the spawn point: his capsule is parked.
    expect(m.pedBodies[0].calls).toEqual([`teleport ${pedShellParkX(0)},${NPC_SHELL_PARK_Y},0 false`]);
    expect(m.pedTags[0].npcId).toBe(-1);
    // THE POINT AFTER CHOOSES AGAIN, from its own student (a respawn made by a
    // point's own tick is shown at that point, whose student is the car
    // before it was lifted away) — and it GLIDES the shell that keeps its
    // agent: only the respawn point teleports. After that the phase of the
    // ordinary rebinds is the grid's and did not move.
    m.clear();
    atSpawn.y = 12.1;
    const rebindAt: number[] = [];
    for (let k = 38; k <= 95; k++) {
      const n = m.pool.rebinds;
      m.pool.step(k, at(500, 0), m.vehBodies, m.pedBodies);
      if (m.pool.rebinds !== n) rebindAt.push(k);
      if (k === 38) expect(m.vehBodies[0].calls[0]).toBe(`next 500,${NPC_VEHICLE_SHELL_HALF_HEIGHT_M},-12.1`);
    }
    expect(rebindAt).toEqual([38, 60, 90]);
  });

  it("a shell that KEEPS its agent through the respawn is teleported onto the agent's reset pose, and only at that point — the next point glides again", () => {
    const lead = veh(1, 0, 40);
    const m = mount(world([lead]));
    m.pool.step(1, at(0, 0), m.vehBodies, m.pedBodies);
    m.pool.step(2, at(0, 0), m.vehBodies, m.pedBodies);
    m.clear();
    lead.y = 15; // the director's reset: back to the hold, 25 m in one grid point
    m.pool.step(3, at(0, 0), m.vehBodies, m.pedBodies, true);
    expect(m.vehBodies[0].calls.filter((c) => c.startsWith("teleport "))).toEqual([`teleport 0,${NPC_VEHICLE_SHELL_HALF_HEIGHT_M},-15 true`]);
    expect(m.vehBodies[0].calls.some((c) => c.startsWith("next"))).toBe(false);
    m.clear();
    lead.y = 15.1;
    m.pool.step(4, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.vehBodies[0].calls[0]).toBe(`next 0,${NPC_VEHICLE_SHELL_HALF_HEIGHT_M},-15.1`);
  });
});

describe("NpcShellPool — a bound shell gets its agent's pose AT the point; a new binding teleports; a lost one parks", () => {
  it("the first binding teleports the shell onto its agent (wake, no implied velocity) and fits it to the agent's own body; every later point hands rapier the NEXT pose", () => {
    const truck = veh(9, 12, 34, { dirX: 1, dirY: 0, profile: "truck" } as Partial<Veh>);
    const m = mount(world([truck]));
    m.pool.step(1, at(0, 0), m.vehBodies, m.pedBodies);
    const yaw = Math.atan2(1, -0);
    expect(m.vehBodies[0].calls).toEqual([
      "fit",
      `teleport 12,${NPC_VEHICLE_SHELL_HALF_HEIGHT_M},-34 true`,
      `teleportRot ${Math.sin(yaw / 2).toFixed(6)},${Math.cos(yaw / 2).toFixed(6)}`,
    ]);
    const box = actorObb({ x: 0, y: 0, dirX: 0, dirY: 1 }, "truck");
    expect(m.vehBodies[0].halfExtents).toEqual({ x: box.halfWidthM, y: NPC_VEHICLE_SHELL_HALF_HEIGHT_M, z: box.halfLengthM });
    m.clear();
    truck.x = 12.4;
    m.pool.step(2, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.vehBodies[0].calls).toEqual([
      `next 12.4,${NPC_VEHICLE_SHELL_HALF_HEIGHT_M},-34`,
      `nextRot ${Math.sin(yaw / 2).toFixed(6)},${Math.cos(yaw / 2).toFixed(6)}`,
    ]);
    // The other eleven shells were never touched: bound to nobody, parked where they were mounted.
    expect(m.writes()).toBe(2);
  });

  it("a pedestrian's capsule follows by translation only", () => {
    const walker = ped(60, 3, 9);
    const m = mount(world([], [walker]));
    m.pool.step(1, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.pedBodies[0].calls).toEqual(["teleport 3,0.8500000000000001,-9 true"]);
    m.clear();
    walker.y = 9.02;
    m.pool.step(2, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.pedBodies[0].calls).toEqual(["next 3,0.8500000000000001,-9.02"]);
  });

  it("a road user that falls out of range is let go at the next rebind point: its shell parks below the district and its tag goes dormant", () => {
    const car = veh(3, 0, 20);
    const walker = ped(4, 0, 20);
    const m = mount(world([car], [walker]));
    m.pool.step(30, at(0, 0), m.vehBodies, m.pedBodies);
    expect([m.vehTags[0].npcId, m.pedTags[0].npcId]).toEqual([3, 4]);
    m.clear();
    car.y = 900;
    walker.y = 900;
    // Until the next rebind point the shells still follow their agents.
    m.pool.step(31, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.vehBodies[0].calls[0]).toBe(`next 0,${NPC_VEHICLE_SHELL_HALF_HEIGHT_M},-900`);
    m.clear();
    m.pool.step(60, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.vehBodies[0].calls).toEqual([`teleport ${vehicleShellParkX(0)},${NPC_SHELL_PARK_Y},0 false`]);
    expect(m.pedBodies[0].calls).toEqual([`teleport ${pedShellParkX(0)},${NPC_SHELL_PARK_Y},0 false`]);
    expect([m.vehTags[0].npcId, m.pedTags[0].npcId]).toEqual([-1, -1]);
  });

  it("NO AGENT NEAR, NO WORK: a point writes to no body, and the world is scanned once per 30 points", () => {
    const m = mount(world([veh(1, 0, 5000)], [ped(2, 0, 5000)]));
    for (let k = 1; k <= 300; k++) m.pool.step(k, at(0, 0), m.vehBodies, m.pedBodies);
    expect(m.writes()).toBe(0);
    expect(m.pool.rebinds).toBe(1 + 10); // the first point, then 30, 60, … 300
  });

  it("a body that is not mounted yet is skipped, and fitted the first point it exists (the remount witness)", () => {
    const truck = veh(9, 0, 10, { profile: "truck" } as Partial<Veh>);
    const m = mount(world([truck]));
    const late = m.vehBodies[0];
    const bodies: Array<NpcShellBody | null> = [null, ...m.vehBodies.slice(1)];
    m.pool.step(1, at(0, 0), bodies, m.pedBodies);
    expect(late.calls).toEqual([]);
    bodies[0] = late;
    m.pool.step(2, at(0, 0), bodies, m.pedBodies);
    expect(late.calls[0]).toBe("fit");
    expect(late.halfExtents?.z).toBe(actorObb({ x: 0, y: 0, dirX: 0, dirY: 1 }, "truck").halfLengthM);
  });
});

describe("NpcShellPool on rapier — one point, one physics step, the agent's own velocity", () => {
  /** A rapier world with the pool's twelve kinematic bodies, as NpcColliders mounts them. */
  function rapierPool(traffic: NpcShellTraffic) {
    const w = new RAPIER.World({ x: 0, y: 0, z: 0 });
    w.timestep = FIXED_DT;
    const make = (x: number) => {
      const rb = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, NPC_SHELL_PARK_Y, 0));
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2), rb);
      return rb;
    };
    const vehBodies = Array.from({ length: VEHICLE_SHELL_COUNT }, (_, k) => make(vehicleShellParkX(k)));
    const pedBodies = Array.from({ length: PED_SHELL_COUNT }, (_, k) => make(pedShellParkX(k)));
    const pool = new NpcShellPool(traffic, createNpcShellTags(VEHICLE_SHELL_COUNT, "vehicle"), createNpcShellTags(PED_SHELL_COUNT, "pedestrian"));
    return { w, pool, vehBodies: vehBodies as unknown as NpcShellBody[], pedBodies: pedBodies as unknown as NpcShellBody[], shell: vehBodies[0] };
  }

  it("A RESPAWN ON RAPIER: the staged car jumps 25 m back to its hold in one grid point — told of the respawn the shell arrives with NO velocity; not told (what shipped) it crosses the 25 m in one step at 1518 m/s", () => {
    const run = (told: boolean) => {
      const lead = veh(1, 0, 40, { dirX: 0, dirY: 1 });
      const r = rapierPool(world([lead]));
      const speeds: number[] = [];
      for (let k = 1; k <= 6; k++) {
        if (k === 4) lead.y = 15; // the director's reset lands at point 4
        else lead.y += 0.1;
        r.pool.step(k, at(0, 0), r.vehBodies, r.pedBodies, told && k === 4);
        r.w.step();
        const v = r.shell.linvel();
        speeds.push(Math.hypot(v.x, v.y, v.z));
      }
      const z = -r.shell.translation().z;
      r.w.free();
      return { speeds, z, y: lead.y };
    };
    const told = run(true);
    // Steps 2–3 glide at the agent's 6 m/s; the respawn step carries none;
    // the steps after it glide again from the new pose.
    expect(told.speeds[3]).toBe(0);
    expect(told.speeds[4]).toBeCloseTo(0.1 / FIXED_DT, 2);
    expect(Math.abs(told.z - told.y)).toBeLessThan(1e-5);
    const untold = run(false);
    expect(untold.speeds[3]).toBeGreaterThan(1000);
    // 40.3 m → 15 m in one step of 1/60 s: 1518 m/s (rapier keeps single-precision floats).
    expect(untold.speeds[3]).toBeCloseTo(25.3 / FIXED_DT, 0);
  });

  it("posed once per point, the shell stands on its agent's last pose after every step and moves at the agent's speed — 6 m/s for a 0.1 m step, never a multiple of it", () => {
    const car = veh(1, 0, 10, { dirX: 0, dirY: 1 });
    const r = rapierPool(world([car]));
    const speeds: number[] = [];
    const lag: number[] = [];
    for (let k = 1; k <= 90; k++) {
      // The world's step k: the agent moves 0.1 m north.
      car.y += 0.1;
      r.pool.step(k, at(0, 0), r.vehBodies, r.pedBodies);
      // rapier's step k + 1 moves the shell to that pose.
      r.w.step();
      const v = r.shell.linvel();
      speeds.push(Math.hypot(v.x, v.y, v.z));
      lag.push(Math.abs(-r.shell.translation().z - car.y));
    }
    // Step 1 is the binding's teleport (no velocity); so are the rebind
    // points' steps for a shell that CHANGES agent — this one keeps its agent.
    expect(speeds[0]).toBe(0);
    // (rapier keeps single-precision floats: 6 m/s to the third decimal.)
    for (const s of speeds.slice(1)) expect(s).toBeCloseTo(0.1 / FIXED_DT, 2);
    expect(Math.max(...lag)).toBeLessThan(1e-5);
    r.w.free();
  });

  it("WHAT IT WAS, on the same rapier: posed once per FRAME of 22 steps the shell leaps 22 steps' worth in the frame's first step — 132 m/s — and stands still for the other 21", () => {
    const car = veh(1, 0, 10, { dirX: 0, dirY: 1 });
    const r = rapierPool(world([car]));
    const speeds: number[] = [];
    r.pool.step(1, at(0, 0), r.vehBodies, r.pedBodies);
    r.w.step();
    for (let frame = 0; frame < 3; frame++) {
      // The frame's 22 world steps are graded at its end; the pool is posed once.
      for (let i = 0; i < 22; i++) car.y += 0.1;
      r.pool.step(2 + frame, at(0, 0), r.vehBodies, r.pedBodies);
      for (let i = 0; i < 22; i++) {
        r.w.step();
        const v = r.shell.linvel();
        speeds.push(Math.hypot(v.x, v.y, v.z));
      }
    }
    const leaps = speeds.filter((s) => s > 100);
    expect(leaps.length).toBe(3);
    for (const s of leaps) expect(s).toBeCloseTo((22 * 0.1) / FIXED_DT, 1);
    expect(speeds.filter((s) => s === 0).length).toBe(3 * 21);
    r.w.free();
  });

  it("THE COST, MEASURED (printed): a point with nobody near, and a point with all twelve shells bound and moving", () => {
    const idle = mount(world([veh(1, 0, 5000)], [ped(2, 0, 5000)]));
    const cars = Array.from({ length: 40 }, (_, i) => veh(i, (i % 5) * 4, 5 + i * 3, { dirX: 0, dirY: 1 }));
    const peds = Array.from({ length: 30 }, (_, i) => ped(100 + i, 6, 2 + i * 2));
    const busyTraffic = world(cars, peds);
    const busy = rapierPool(busyTraffic);
    const N = 60_000;
    const time = (f: (k: number) => void): number => {
      for (let k = 1; k <= 3000; k++) f(k); // warm
      const t0 = performance.now();
      for (let k = 1; k <= N; k++) f(k);
      return ((performance.now() - t0) / N) * 1e6; // ns per point
    };
    const idleNs = time((k) => idle.pool.step(k, at(0, 0), idle.vehBodies, idle.pedBodies));
    const busyNs = time((k) => {
      for (let i = 0; i < cars.length; i++) cars[i].y += 0.01;
      busy.pool.step(k, at(0, 0), busy.vehBodies, busy.pedBodies);
    });
    busy.w.free();
    // (`NPC_SHELL_COST_OUT=<file>` appends the line — a reporter may swallow the log.)
    if (process.env.NPC_SHELL_COST_OUT) appendFileSync(process.env.NPC_SHELL_COST_OUT, `idle ${idleNs.toFixed(0)} ns, busy ${busyNs.toFixed(0)} ns per grid point\n`);
    console.log(
      `[npc-shells] per grid point: ${idleNs.toFixed(0)} ns with no agent in range (one 2-agent scan per 30 points); ` +
        `${busyNs.toFixed(0)} ns with 8 + 4 shells bound and moved (70 agents, one scan per 30 points; includes moving the 40 test cars)`,
    );
    // No budget is asserted on a shared machine beyond the order of magnitude:
    // a point is far under a tenth of a millisecond either way.
    expect(idleNs).toBeLessThan(20_000);
    expect(busyNs).toBeLessThan(100_000);
  });
});

describe("updateCabinChannels — the cabin as it stands, and never the look", () => {
  function withWindow<T>(fn: () => T): T {
    const g = globalThis as { window?: unknown };
    const had = "window" in g;
    const prev = g.window;
    g.window = { addEventListener() {}, removeEventListener() {} };
    try {
      return fn();
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  }

  it("writes the nine channels from the real cabin, the sim and the pad — and leaves the pose, the speed and the cabin's latched look alone", () => {
    withWindow(() => {
      const cabin = new CabinControls({}, "ready", "off");
      cabin.indicateLeft();
      cabin.toggleSeatbelt();
      cabin.glanceStart("left");
      cabin.glanceEnd("left");
      const out = createVehicleSample();
      out.position.x = 11;
      out.position.y = 22;
      out.headingDeg = 33;
      out.speedKmh = 44;
      out.mirrorGlance = "rear";
      const sim = { speedKmh: 99, gear: "3" };
      updateCabinChannels(out, sim as never, cabin, { throttle: 0.4, brake: 0, steer: 0, handbrake: true });
      expect({
        indicator: out.indicator,
        seatbeltOn: out.seatbeltOn,
        headlights: out.headlights,
        handbrakeOn: out.handbrakeOn,
        gear: out.gear,
        stalled: out.stalled,
        fogLightsOn: out.fogLightsOn,
        throttlePedal: out.throttlePedal,
        engineOn: out.engineOn,
      }).toEqual({
        indicator: cabin.indicator,
        seatbeltOn: cabin.seatbeltOn,
        headlights: cabin.headlights,
        handbrakeOn: true,
        gear: cabin.driveline.selector === "D" ? 3 : out.gear,
        stalled: cabin.driveline.stalled,
        fogLightsOn: cabin.driveline.fogLightsOn,
        throttlePedal: 0.4,
        engineOn: cabin.driveline.engineOn,
      });
      expect(out.indicator).toBe("left");
      // Nothing else of the sample moved…
      expect([out.position.x, out.position.y, out.headingDeg, out.speedKmh, out.mirrorGlance]).toEqual([11, 22, 33, 44, "rear"]);
      // …and the look is still the cabin's to hand over, once.
      expect(cabin.consumeGlanceSample()).toBe("left");
      expect(cabin.consumeGlanceSample()).toBeNull();
      cabin.dispose();
    });
  });

  it("the frame's builder is the same mapping, plus the pose and ONE look", () => {
    withWindow(() => {
      const cabin = new CabinControls({}, "ready", "off");
      cabin.indicateRight();
      cabin.glanceStart("rear");
      cabin.glanceEnd("rear");
      const a = createVehicleSample();
      const b = createVehicleSample();
      const sim = { speedKmh: 12, gear: "2" };
      const input = { throttle: 0.1, brake: 0, steer: 0, handbrake: false };
      updateCabinChannels(a, sim as never, cabin, input);
      const group = { getWorldPosition: (v: { set(x: number, y: number, z: number): void }) => v.set(1, 0, -2), getWorldQuaternion: (q: { set(x: number, y: number, z: number, w: number): void }) => q.set(0, 0, 0, 1) };
      updateVehicleSample(b, sim as never, group as never, cabin, input);
      for (const ch of ["indicator", "headlights", "seatbeltOn", "handbrakeOn", "gear", "stalled", "fogLightsOn", "throttlePedal", "engineOn"] as const) {
        expect(b[ch], ch).toEqual(a[ch]);
      }
      expect(b.mirrorGlance).toBe("rear");
      expect(a.mirrorGlance).toBeNull();
      expect([b.position.x, b.position.y, b.speedKmh]).toEqual([1, 2, 12]);
      cabin.dispose();
    });
  });
});

describe("GradeGrid — the `shells` hook: once per graded point, LAST, with the student the grid read there", () => {
  function fakeWorld(log: string[]) {
    return {
      runtime: {
        update: () => void log.push("signals"),
        sample: (v: VehicleSample, t: number) => ({ t, position: { ...v.position }, events: [] }),
        signalPhase: () => "green",
      },
      traffic: {
        update: () => void log.push("traffic"),
        leadGapMeters: () => Infinity,
        setRenderSessionTime: (t: number) => void log.push(`drawn@${t}`),
        vehicles: [],
        pedestrians: [],
        vehicleCollisionKind: () => "vehicle",
        staged: () => null,
      },
      director: null,
    } as unknown as GradeGridWorld;
  }
  const NO_WEATHER = { isNight: false, rain: false, fog: false, snow: false };
  /** A step source whose car after step n stands at x = n. */
  const stepsUpTo = (n: number): PhysicsStepSource => ({
    stepCount: n,
    stateAtStep: (k, out) => {
      out.x = k;
      out.y = -k;
      out.speedKmh = 10 + k;
      out.headingDeg = 0;
      return k >= 1 && k <= n;
    },
  });

  it("after the world moved, the tick was delivered and the near misses were handed over — and the student is the car AFTER that point's step, never what the scene's hook wrote", () => {
    const log: string[] = [];
    const grid = new GradeGrid();
    const hooks: GradeGridHooks = {
      student: (_k, _t, out) => {
        out.position.x = -999; // a scene that wrote its frame sample
        return 0;
      },
      onPoint: (p) => void log.push(`tick ${p.k}`),
      shells: (k, student) => void log.push(`shells ${k} at ${student.position.x},${student.position.y} ${student.speedKmh}`),
    };
    expect(grid.stepPhysics(stepsUpTo(2), 2 * FIXED_DT, null, fakeWorld(log), NO_WEATHER, hooks)).toBe(2);
    expect(log).toEqual([
      "signals",
      "traffic",
      "tick 1",
      "shells 1 at 1,-1 11",
      "signals",
      "traffic",
      "tick 2",
      "shells 2 at 2,-2 12",
      `drawn@${2 * FIXED_DT}`,
    ]);
  });

  it("a call from inside the step loop (no frame end) grades the step just taken, poses the shells, and positions nothing that is drawn; the frame's own call then grades only what is left", () => {
    const log: string[] = [];
    const grid = new GradeGrid();
    const world = fakeWorld(log);
    const hooks: GradeGridHooks = {
      student: () => 0,
      onPoint: (p) => void log.push(`tick ${p.k}`),
      shells: (k) => void log.push(`shells ${k}`),
    };
    // A frame of three steps: before steps 2 and 3 the step loop grades 1 and 2…
    expect(grid.stepPhysics(stepsUpTo(1), null, null, world, NO_WEATHER, hooks)).toBe(1);
    expect(grid.stepPhysics(stepsUpTo(2), null, null, world, NO_WEATHER, hooks)).toBe(1);
    expect(log.filter((l) => l.startsWith("drawn"))).toEqual([]);
    // …and the frame's end grades 3 and positions what is drawn.
    expect(grid.stepPhysics(stepsUpTo(3), 0.06, null, world, NO_WEATHER, hooks)).toBe(1);
    expect(log.filter((l) => !/^(signals|traffic)$/.test(l))).toEqual(["tick 1", "shells 1", "tick 2", "shells 2", "tick 3", "shells 3", "drawn@0.06"]);
    // Nothing is graded twice: a second frame-end call with no new step.
    expect(grid.stepPhysics(stepsUpTo(3), 0.07, null, world, NO_WEATHER, hooks)).toBe(0);
  });

  it("ROUND 2 — a respawn is handed to the shells at exactly ONE call: the first after `reset()` — the next point's for a respawn made between two points, from the frame's call or from inside the step loop alike", () => {
    const seen: string[] = [];
    const grid = new GradeGrid();
    const world = fakeWorld([]);
    const hooks: GradeGridHooks = {
      student: () => 0,
      onPoint: () => {},
      shells: (k, _student, respawned) => void seen.push(`${k}:${respawned}`),
    };
    grid.stepPhysics(stepsUpTo(2), 0.04, null, world, NO_WEATHER, hooks);
    grid.reset(); // key R between two frames
    grid.stepPhysics(stepsUpTo(3), null, null, world, NO_WEATHER, hooks); // the next frame's step loop
    grid.stepPhysics(stepsUpTo(5), 0.09, null, world, NO_WEATHER, hooks);
    expect(seen).toEqual(["1:false", "2:false", "3:true", "4:false", "5:false"]);
  });

  it("ROUND 2 — a respawn made BY a point (its own `onPoint` — the dev rig's R key) is handed to THAT point's call: the director's actors have already jumped back to their holds when the hook runs", () => {
    const seen: string[] = [];
    const grid = new GradeGrid();
    const world = fakeWorld([]);
    const hooks: GradeGridHooks = {
      student: () => 0,
      onPoint: (p) => {
        if (p.k === 2) grid.reset();
      },
      shells: (k, student, respawned) => void seen.push(`${k}@${student.position.x}:${respawned}`),
    };
    grid.stepPhysics(stepsUpTo(4), 0.07, null, world, NO_WEATHER, hooks);
    expect(seen).toEqual(["1@1:false", "2@2:true", "3@3:false", "4@4:false"]);
  });

  it("a look handed over inside the step loop is heard at that point — the cabin's queue reaches the grid through `moreLooks` there too", () => {
    const heard: string[] = [];
    const grid = new GradeGrid();
    const cabin: Array<"left" | "right"> = ["left", "right"];
    const hooks: GradeGridHooks = {
      student: () => 0,
      moreLooks: () => cabin.shift() ?? null,
      onPoint: (p) => void heard.push(`${p.k}:${p.student.mirrorGlance ?? "-"}`),
    };
    const world = fakeWorld([]);
    grid.stepPhysics(stepsUpTo(1), null, null, world, NO_WEATHER, hooks);
    grid.stepPhysics(stepsUpTo(2), null, null, world, NO_WEATHER, hooks);
    grid.stepPhysics(stepsUpTo(3), 0.06, null, world, NO_WEATHER, hooks);
    expect(heard).toEqual(["1:left", "2:right", "3:-"]);
  });
});
