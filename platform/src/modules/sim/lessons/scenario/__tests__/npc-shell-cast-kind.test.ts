/**
 * sc-roundabout-entry:08a0b701 (lane npcstep, round 2) — ONE TOUCH, ONE BILL,
 * ONE KIND.
 *
 * A staged road user has two reporters on one wire: the director's sentinel
 * (the boxes overlap at a grid point — it reports the cast's `withWhat` under
 * the cast's `actorId`) and the rapier contact (the chassis began a contact at
 * a physics step — VehicleRig's ear reports the struck SHELL'S TAG, and
 * LessonScene's `handleCollision` names it from the cast, among the cast's
 * candidates OF THAT KIND). The rule engine merges a named and an anonymous
 * report of one touch only within one kind.
 *
 * Through round 1 the tag came from the traffic system's curb-offset marker
 * (`vehicleCollisionKind`), a second answer to «what is this body». Where the
 * two disagreed, one touch was billed twice, one grid point apart, as two
 * kinds (the round-1 verifier's finding V-1):
 *
 *   sc-vu-bikelane-turn  both riders   cast «cyclist», shell «vehicle»
 *                                      (their curb offsets are negative)
 *   sc-vu-child-cyclist  the child     cast «vehicle», shell «cyclist»
 *                                      (a child on a bicycle, cast by the
 *                                      cut-in runner as the car it usually
 *                                      stages)
 *
 * 15 of the catalogue's 784 cast members. WHICH KIND IS TRUE: all three are
 * people on bicycles — the profile each is drawn and boxed with («cyclist»,
 * «childCyclist»), the lessons' own text («велосипедист», «дете на
 * велосипед») and their library event (`ev-cyclist`) say so. So:
 *
 *   · the cast's kind is a function of the profile (orchestrator/contact.ts
 *     `contactKindOfProfile`) — the child is cast a cyclist now;
 *   · a shell bound to a cast member carries the CAST's kind
 *     (scene/npcShells.ts) — the bikelane riders' shells say cyclist now.
 *
 * ROUND 3 — ONE FACT EVERYWHERE A STAGED BODY IS NAMED (the round-2
 * verifier's V2-5): the rear-proximity badge (`TrafficSystem.rearBodyBehind`)
 * and the near-miss stat (scene/nearMissMeter.ts `emitVehicle`) named the
 * body by the curb-offset marker still, so the badge said «Кола отзад» about a
 * rider the sheet bills as a cyclist. The director now hands the traffic
 * system its cast's kinds (`setStagedContactKind`), and
 * `vehicleCollisionKind` — the one function all three naming readers call —
 * answers the cast's kind for a cast member.
 *
 * ROUND 4 — ONE FACT FOR THE GRADED QUERIES TOO (the round-3 verifier's V3-2,
 * integrator N9): `cyclistNear` (the lateral-clearance duty's feed),
 * `overtakenNear` (the overtake-return duty) and `sameDirVehiclesNear` (the
 * lane-entry tracker) read `vehicleCollisionKind` too, and an actor authored
 * `gradedOnlyByOwnRunner` (the counter-flow rider of sc-vu-bikelane-turn,
 * whose opt-out was the SIGN of its curb offset through round 3) is returned
 * by none of them. The catalogue pin RUNS all three for every vehicle-bodied
 * member, the student just behind it facing its way.
 *
 * THIS FILE: (1) the catalogue pin — every staged cast member of every
 * template × rung, bound by the product's own pool, wears its cast's kind, and
 * the cast's kind is the kind of its rig; and (round 3) for every vehicle-
 * bodied member the traffic system's `vehicleCollisionKind` IS the cast's
 * kind, the rear badge RUN with the student just ahead of the member names it
 * by the cast's kind, and the near-miss stat RUN on a pass alongside the
 * member reports the cast's kind; (2) the chassis driven into a
 * cyclist shell on rapier, both lessons, 60 Hz and the long-frame cadences:
 * one report stream of one kind under one name, one COLLISION row.
 *
 * RED ON 8cb0707 and on round 1 (run on a copy with this harness): the pin
 * lists the 15 members; the drives show the second row.
 */
import { appendFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import * as Npc from "../../../../../components/sim/NpcColliders";
import type { VehicleSample } from "../../../contracts";
import { directorContactCast } from "../../../orchestrator/director";
import { createGradeGridSample } from "../../../scene/gradeGrid";
import { GridNearMissMeter } from "../../../scene/nearMissMeter";
import type { NearMissEvent } from "../../../contracts";
import { rearNearestFor } from "../../../traffic/system";
import type { TrafficSystem } from "../../../traffic";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import type { ScenarioLevel } from "../types";
import { buildLiveWorld } from "./liveChainReplay";
import { demoTrace, W69 } from "./npcContactDrive";
import { driveIntoContact, followPath, followTape, initRapier, sheetDigest, type ContactDriveOutcome } from "./rapierContactDrive";
import { loadDistrict } from "./witnessLiveRung";

beforeAll(async () => {
  await initRapier();
});

const OUT = process.env.NPC_KIND_OUT;
const note = (line: string) => {
  if (OUT) appendFileSync(OUT, line + "\n");
};

// ───────────────────────────────────────────────────────────────────────────
// (1) The catalogue
// ───────────────────────────────────────────────────────────────────────────

interface PoolLike {
  step(k: number, student: Pick<VehicleSample, "position">, veh: unknown[], ped: unknown[], respawned?: boolean): void;
}
type Tag = { npcCollider: true; kind: string; npcId: number };
/** The product's pool (the repair) — undefined on a tree whose NpcColliders
 *  still moves the pool itself (8cb0707), where the tag was the marker. */
const ProductPool = (
  Npc as unknown as { NpcShellPool?: new (traffic: unknown, veh: Tag[], ped: Tag[], cast?: unknown) => PoolLike }
).NpcShellPool;

/** A body the pool can pose; nothing is read back from it. */
const inertBody = () => ({
  numColliders: () => 1,
  collider: () => ({ setHalfExtents: () => {} }),
  setTranslation: () => {},
  setRotation: () => {},
  setNextKinematicTranslation: () => {},
  setNextKinematicRotation: () => {},
});

/**
 * The tag the shell of the staged state at (x, y) wears when the pool binds
 * it — by RUNNING the product's pool on the lesson's own traffic system and
 * director's cast, with the student standing on the actor (so it is the
 * nearest and holds a shell). On a tree with no pool: the rule its
 * NpcColliders applied (`traffic.vehicleCollisionKind`, «pedestrian» for a
 * walker).
 */
function shellTagKind(traffic: TrafficSystem, cast: unknown, kind: "vehicle" | "pedestrian", stateId: number, x: number, y: number): string {
  if (!ProductPool) return kind === "pedestrian" ? "pedestrian" : traffic.vehicleCollisionKind(stateId);
  const veh: Tag[] = Array.from({ length: Npc.VEHICLE_SHELL_COUNT }, () => ({ npcCollider: true, kind: "vehicle", npcId: -1 }));
  const ped: Tag[] = Array.from({ length: Npc.PED_SHELL_COUNT }, () => ({ npcCollider: true, kind: "pedestrian", npcId: -1 }));
  const pool = new ProductPool(traffic, veh, ped, cast);
  pool.step(30, { position: { x, y } }, veh.map(inertBody), ped.map(inertBody));
  const tag = (kind === "pedestrian" ? ped : veh).find((t) => t.npcId === stateId);
  if (!tag) throw new Error(`state ${stateId} was not bound a shell with the student standing on it`);
  return tag.kind;
}

/**
 * THE REAR BADGE, RUN for one vehicle state (round 3): the student 6 m ahead of
 * it, facing the way it faces — the badge's own sweep, `rearBodyBehind`. Null
 * when the badge's nearest body behind would be another (a moving agent or a
 * parked body between them): that member is counted, not judged.
 */
function badgeKindFor(traffic: TrafficSystem, stateId: number): string | null {
  const i = traffic.vehicles.findIndex((v) => v.id === stateId);
  const v = traffic.vehicles[i];
  const dx = v.dirX === 0 && v.dirY === 0 ? 0 : v.dirX;
  const dy = v.dirX === 0 && v.dirY === 0 ? 1 : v.dirY;
  const headingDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const px = v.x + dx * 6;
  const py = v.y + dy * 6;
  const moving = rearNearestFor(traffic.vehicles, px, py, headingDeg);
  if (!moving || traffic.vehicles[moving.index].id !== stateId) return null;
  const behind = traffic.rearBodyBehind(px, py, headingDeg);
  if (!behind || behind.gapM !== moving.gapM) return null;
  return behind.kind;
}

/**
 * THE NEAR-MISS STAT, RUN for one vehicle state (round 3): the product's grid
 * meter, stepped at 60 Hz while a student at 36 km/h passes the state 0.4 m
 * clear — the state as published (its id, its place, its body), handed to the
 * meter moving at 1 m/s (the stat counts moving road users only; a staged
 * actor is dormant at the start). What the meter names the resolved encounter
 * is what `emitVehicle` reads off the traffic system for that id.
 */
function nearMissKindFor(traffic: TrafficSystem, stateId: number): string[] {
  const v = traffic.vehicles.find((s) => s.id === stateId)!;
  const moving = { ...v, dirX: 0, dirY: 1, speedMps: 1 };
  // The lesson's own traffic system, seen with this one agent in its vehicle
  // array: every other member (the kind function, the marker, the staged
  // ids) is the system's own, reached through the prototype.
  const view = Object.create(traffic, {
    vehicles: { value: [moving] },
    pedestrians: { value: [] },
  }) as Parameters<GridNearMissMeter["step"]>[3];
  const meter = new GridNearMissMeter();
  const s = createGradeGridSample();
  s.headingDeg = 0;
  s.speedKmh = 36;
  const out: NearMissEvent[] = [];
  // Body half-widths: the meter's own envelopes (car-sized for any vehicle
  // state) — 0.4 m of daylight between them.
  s.position.x = v.x + 0.9 + 0.9 + 0.4;
  for (let k = 0; k <= 180; k++) {
    s.position.y = v.y - 15 + (k * 10) / 60;
    meter.step(k / 60, 1 / 60, s, view, out);
  }
  return out.map((e) => e.kind);
}

/** The actor ids a compiled lesson authors `gradedOnlyByOwnRunner: true`
 *  on, with the kind of the staged event that owns each actor. */
function ownRunnerOnlyActors(lesson: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (o: unknown) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o === null || typeof o !== "object") return;
    const r = o as Record<string, unknown>;
    const actor = r.actor as Record<string, unknown> | undefined;
    if (typeof r.id === "string" && actor && typeof actor === "object" && "gradedOnlyByOwnRunner" in actor) {
      out.set(r.id, `${String(r.kind)}:${String(actor.gradedOnlyByOwnRunner)}`);
    }
    for (const v of Object.values(r)) walk(v);
  };
  walk(lesson);
  return out;
}

/**
 * THE THREE GRADED QUERIES, RUN for one vehicle state (round 4): the lesson's
 * own traffic system seen with this one agent in its vehicle array (every
 * other member — the kind function, the marker, the opt-out set — is the
 * system's own, through the prototype), the student 6 m behind it facing the
 * way it faces. Which of the three returns it.
 */
function gradedQueriesFor(traffic: TrafficSystem, stateId: number): { cyclistNear: boolean; overtakenNear: boolean; sameDirVehiclesNear: boolean } {
  const v = traffic.vehicles.find((s) => s.id === stateId)!;
  const dx = v.dirX === 0 && v.dirY === 0 ? 0 : v.dirX;
  const dy = v.dirX === 0 && v.dirY === 0 ? 1 : v.dirY;
  const one = { ...v, dirX: dx, dirY: dy };
  const view = Object.create(traffic, { vehicles: { value: [one] } }) as TrafficSystem;
  const headingDeg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const px = v.x - dx * 6;
  const py = v.y - dy * 6;
  return {
    cyclistNear: view.cyclistNear(px, py, headingDeg, 30) !== null,
    overtakenNear: view.overtakenNear(px, py, headingDeg, 30) !== null,
    sameDirVehiclesNear: view.sameDirVehiclesNear(px, py, headingDeg, 30).some((s) => s.id === stateId),
  };
}

describe("the catalogue — every staged cast member's shell wears the kind its runner casts it as", () => {
  it("every template × rung: cast kind == shell tag kind, the cast's kind is the kind of its rig, a disc is a walker and a box a vehicle state", () => {
    const wrongTag: string[] = [];
    const wrongRig: string[] = [];
    const wrongBody: string[] = [];
    // Round 3: the readers that NAME a vehicle state.
    const wrongNamed: string[] = [];
    const wrongBadge: string[] = [];
    const wrongNear: string[] = [];
    // Round 4: the three GRADED queries.
    const wrongGraded: string[] = [];
    const ownRunnerOnly: string[] = [];
    let gradedCyclists = 0;
    let badgeRun = 0;
    let badgeShadowed = 0;
    const kinds: Record<string, number> = {};
    let members = 0;
    let rungs = 0;
    for (const spec of SCENARIO_TEMPLATES) {
      const raw = loadDistrict(spec.map.districtId);
      for (const lv of spec.levels) {
        rungs++;
        const lesson = compileScenario(spec, lv.level);
        const { traffic, director } = buildLiveWorld(lesson, raw);
        const cast = directorContactCast(director);
        const optedOut = ownRunnerOnlyActors(lesson);
        for (const [id, how] of optedOut) {
          ownRunnerOnly.push(`${spec.id} L${lv.level} ${id} ${how}`);
          // Authored only where a runner of its own grades the actor: a
          // cyclistRightHook event, `true` — and a cast member.
          if (how !== "cyclistRightHook:true") wrongGraded.push(`${spec.id} L${lv.level} ${id}: gradedOnlyByOwnRunner on ${how}`);
          if (!cast.some((m) => m.actorId === id)) wrongGraded.push(`${spec.id} L${lv.level} ${id}: gradedOnlyByOwnRunner on an actor no cast names`);
        }
        for (const m of cast) {
          members++;
          const where = `${spec.id} L${lv.level} ${m.actorId}`;
          const view = traffic.staged(m.actorId);
          if (!view) {
            wrongBody.push(`${where}: in the cast and not staged`);
            continue;
          }
          // The state behind the view (its pose mirrors the published state).
          const states = view.kind === "pedestrian" ? traffic.pedestrians : traffic.vehicles;
          // Staged states can stand on one spot (a stream's cars at their hold, a
          // crosser and its sprint variant): the one the traffic system names
          // this actor, else the first there (and the inverse is then wrong, below).
          const here = states.filter((a) => a.id >= 1000 && a.x === view.x && a.y === view.y);
          const actorOf = (id: number) => (traffic as TrafficSystem).stagedActorId?.(id);
          const state = here.find((a) => actorOf(a.id) === m.actorId) ?? here[0];
          if (!state) {
            wrongBody.push(`${where}: no ${view.kind} state stands where the staged view does`);
            continue;
          }
          if ((m.body === "disc") !== (view.kind === "pedestrian")) wrongBody.push(`${where}: cast body ${m.body} on a ${view.kind} state`);
          // The traffic system's inverse of `staged(id)` names this state's actor
          // (what the pool's cast lookup asks — scene/npcShells.ts `castKindOf`).
          if (!here.some((a) => actorOf(a.id) === m.actorId) && actorOf(state.id) !== undefined) {
            wrongBody.push(`${where}: no state standing there is named ${m.actorId} by stagedActorId (${here.map((a) => `${a.id}:${actorOf(a.id)}`).join(", ")})`);
          }
          const tag = shellTagKind(traffic as TrafficSystem, cast, view.kind, state.id, view.x, view.y);
          kinds[`${m.body}:${m.withWhat}`] = (kinds[`${m.body}:${m.withWhat}`] ?? 0) + 1;
          if (tag !== m.withWhat) wrongTag.push(`${where}: cast ${m.withWhat}, shell tag ${tag}`);
          // What the student SEES is what both reporters must say.
          if (m.body === "box") {
            const bicycle = m.profile === "cyclist" || m.profile === "childCyclist";
            if ((m.withWhat === "cyclist") !== bicycle) wrongRig.push(`${where}: cast ${m.withWhat} on the ${m.profile ?? "car"} rig`);
            const drawn = (state as { profile?: string }).profile;
            if (drawn !== m.profile) wrongRig.push(`${where}: boxed as ${m.profile ?? "car"}, drawn as ${drawn ?? "car"}`);
            // ONE FACT (round 3): the function every naming reader calls…
            const named = (traffic as TrafficSystem).vehicleCollisionKind(state.id);
            if (named !== m.withWhat) wrongNamed.push(`${where}: cast ${m.withWhat}, vehicleCollisionKind ${named}`);
            // …the rear badge, run…
            const badge = badgeKindFor(traffic as TrafficSystem, state.id);
            if (badge === null) badgeShadowed++;
            else {
              badgeRun++;
              if (badge !== m.withWhat) wrongBadge.push(`${where}: cast ${m.withWhat}, rear badge ${badge}`);
            }
            // …and the near-miss stat, run.
            const near = nearMissKindFor(traffic as TrafficSystem, state.id);
            if (near.length !== 1 || near[0] !== m.withWhat) wrongNear.push(`${where}: cast ${m.withWhat}, near-miss stat ${JSON.stringify(near)}`);
            // …and the three GRADED queries, run (round 4): a cyclist to the
            // lateral-clearance feed exactly when the cast says cyclist, a
            // vehicle to the overtake-return and lane-entry queries exactly
            // when it says vehicle — and none of the three for an actor its
            // own runner alone grades.
            const q = gradedQueriesFor(traffic as TrafficSystem, state.id);
            const own = optedOut.has(m.actorId);
            const want = {
              cyclistNear: !own && m.withWhat === "cyclist",
              overtakenNear: !own && m.withWhat === "vehicle",
              sameDirVehiclesNear: !own && m.withWhat === "vehicle",
            };
            if (q.cyclistNear) gradedCyclists++;
            if (JSON.stringify(q) !== JSON.stringify(want)) {
              wrongGraded.push(`${where}: cast ${m.withWhat}${own ? " (own runner only)" : ""}, graded queries ${JSON.stringify(q)}`);
            }
          } else if (m.withWhat !== "pedestrian") wrongRig.push(`${where}: a disc cast ${m.withWhat}`);
        }
      }
    }
    note(
      `[catalogue] rungs ${rungs}, cast members ${members}, kinds ${JSON.stringify(kinds)}, tag mismatches ${wrongTag.length}, named ${wrongNamed.length}, badge ${wrongBadge.length} (run ${badgeRun}, shadowed ${badgeShadowed}), near-miss ${wrongNear.length}`,
    );
    note(`[catalogue] graded queries ${wrongGraded.length} mismatches, ${gradedCyclists} members a cyclist to cyclistNear; own-runner-only: ${ownRunnerOnly.join(" | ")}`);
    for (const w of [...wrongTag, ...wrongNamed, ...wrongBadge, ...wrongNear, ...wrongGraded]) note(`[catalogue] ${w}`);
    expect(wrongBody).toEqual([]);
    expect(wrongTag).toEqual([]);
    expect(wrongRig).toEqual([]);
    expect(wrongNamed).toEqual([]);
    expect(wrongBadge).toEqual([]);
    expect(wrongNear).toEqual([]);
    expect(wrongGraded).toEqual([]);
    // The one authored opt-out: the counter-flow rider, on every rung of its
    // lesson, and nowhere else.
    expect(ownRunnerOnly).toEqual([1, 2, 3, 4, 5].map((l) => `sc-vu-bikelane-turn L${l} sc-vbl-rider-cf cyclistRightHook:true`));
    // Every cyclist member but those five is a cyclist to the clearance feed.
    expect(gradedCyclists).toBe(kinds["box:cyclist"] - 5);
    // The badge is judged on most vehicle members (the rest have another
    // body nearer behind the place the student is put): 2026-10-14, see the
    // report for the count.
    expect(badgeRun).toBeGreaterThanOrEqual(400);
    // 784 members on 2026-10-13 (186 walkers, 548 vehicles, 50 riders); a
    // catalogue that grows keeps the pin, one that loses its riders does not.
    expect(members).toBeGreaterThanOrEqual(784);
    expect(kinds["box:cyclist"]).toBeGreaterThanOrEqual(50);
    expect(kinds["disc:pedestrian"]).toBeGreaterThanOrEqual(186);
  }, 600_000);
});

describe("the counter-flow rider of sc-vu-bikelane-turn is graded only by its own runner — by an authored field, not by the sign of its offset (round 4)", () => {
  /** The bikelane lesson's rung, its traffic system, and the two riders'
   *  states — optionally with the authored opt-out stripped from a COPY of
   *  the template (the tooth: the field is what does it). */
  function riders(level: ScenarioLevel, stripOptOut: boolean) {
    const tpl = SCENARIO_TEMPLATES.find((t) => t.id === "sc-vu-bikelane-turn")!;
    const spec = stripOptOut
      ? (JSON.parse(JSON.stringify(tpl), (k, v) => (k === "gradedOnlyByOwnRunner" ? undefined : v)) as typeof tpl)
      : tpl;
    const lesson = compileScenario(spec, level);
    const { traffic, director } = buildLiveWorld(lesson, loadDistrict(spec.map.districtId));
    const t = traffic as TrafficSystem;
    const stateOf = (actorId: string) => t.vehicles.find((v) => t.stagedActorId(v.id) === actorId)!;
    return { t, director, cf: stateOf("sc-vbl-rider-cf"), wf: stateOf("sc-vbl-rider-wf") };
  }

  for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
    it(`L${level}: the counter-flow rider is a CYCLIST to the bill, the shell, the badge and the near-miss stat, and returned by NONE of the three graded queries; the with-flow rider is a cyclist to the clearance feed`, () => {
      const { t, director, cf, wf } = riders(level, false);
      const cast = directorContactCast(director);
      expect(cast.find((m) => m.actorId === "sc-vbl-rider-cf")?.withWhat).toBe("cyclist");
      expect(t.vehicleCollisionKind(cf.id)).toBe("cyclist");
      expect(gradedQueriesFor(t, cf.id)).toEqual({ cyclistNear: false, overtakenNear: false, sameDirVehiclesNear: false });
      // Its own runner stages and grades it: the event is a cyclistRightHook.
      expect(ownRunnerOnlyActors(compileScenario(SCENARIO_TEMPLATES.find((x) => x.id === "sc-vu-bikelane-turn")!, level)).get("sc-vbl-rider-cf")).toBe(
        "cyclistRightHook:true",
      );
      // The with-flow rider (no opt-out) — a cyclist to the clearance feed,
      // not a vehicle to the other two (through round 3: the reverse, by the
      // sign of its −2.6 offset).
      expect(gradedQueriesFor(t, wf.id)).toEqual({ cyclistNear: true, overtakenNear: false, sameDirVehiclesNear: false });
    });
  }

  it("THE TOOTH — the same rung with the authored field stripped: the counter-flow rider IS returned by the clearance feed (it is a cyclist), so the field is what keeps it out", () => {
    const { t, cf } = riders(1, true);
    expect(t.vehicleCollisionKind(cf.id)).toBe("cyclist");
    expect(gradedQueriesFor(t, cf.id)).toEqual({ cyclistNear: true, overtakenNear: false, sameDirVehiclesNear: false });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (2) The chassis into a cyclist's shell
// ───────────────────────────────────────────────────────────────────────────

const CADENCES: ReadonlyArray<readonly [string, readonly number[]]> = [
  ["30 Hz", [1 / 30]],
  ["13 fps", [1 / 13]],
  ["0.37 s", [0.37]],
  ["w69 phone", W69],
];

interface RiderRow {
  /** Every collision report of the drive: [grid point, kind, actorId | null]. */
  reports: Array<[number, string, string | null]>;
  /** The contacts the rig's ear judged with a tagged shell: [step, kind, npcId, graded]. */
  ear: Array<[number, string, number, boolean]>;
  /** Every COLLISION row of the session's ledger: [t, detail, points]. */
  rows: Array<[number, string, number]>;
  sheet: string;
  closedAt: number;
  shellClock: string;
}

function rowOf(out: ContactDriveOutcome): RiderRow {
  return {
    reports: out.collisionReports.map(([k, w, id]) => [k, w, id]),
    ear: out.judged.filter((j) => j.npcId !== undefined && j.bookedStep <= out.closedAtPoint).map((j) => [j.bookedStep, j.withWhat, j.npcId as number, j.graded]),
    rows: out.session.events
      .filter((e) => (e as { kind?: string; code?: string }).kind === "violation" && (e as { code?: string }).code === "COLLISION")
      .map((e) => {
        const v = e as { t?: number; points?: number; detail?: string };
        return [v.t ?? NaN, v.detail ?? "", v.points ?? NaN];
      }),
    sheet: sheetDigest(out.result),
    closedAt: out.closedAtPoint,
    shellClock: out.shellClock,
  };
}

function drive(
  id: string,
  level: ScenarioLevel,
  trace: ScenarioTrace,
  control: ReturnType<ReturnType<typeof followTape>>,
  maxSteps: number,
  deltas: readonly number[],
): RiderRow {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id)!;
  const s0 = trace.samples[0];
  return rowOf(
    driveIntoContact({
      lesson: compileScenario(spec, level),
      raw: loadDistrict(spec.map.districtId),
      start: { x: s0.x, y: s0.y, headingDeg: s0.headingDeg },
      control,
      deltas,
      maxSteps,
      npcShells: "product",
      tracePoses: true,
    }),
  );
}

/** The verifier's cell: sc-vu-bikelane-turn L1, the cut-path demo followed on
 *  rapier, the driver carrying on after a crash. */
function bikelane(deltas: readonly number[]): RiderRow {
  const trace = demoTrace("sc-vu-bikelane-turn", "mistake-cut-path.trace.json");
  const max = Math.ceil(trace.samples[trace.samples.length - 1].tSec * 60) + 300;
  return drive("sc-vu-bikelane-turn", 1, trace, followTape(trace, { afterCrash: "carry-on" })(), max, deltas);
}

/**
 * sc-vu-child-cyclist L1: no committed demo touches the child, so the car is
 * driven up the street on the line x = 5.9 at 20 км/ч — 0.76 m inside the
 * child's curb line (6.66), less than the half-widths of the two bodies — and
 * runs into him from behind before the wobble.
 */
function child(deltas: readonly number[]): RiderRow {
  const tape = demoTrace("sc-vu-child-cyclist", "shadow-correct.trace.json");
  const s0 = tape.samples[0];
  const line: Array<{ x: number; y: number }> = [{ x: s0.x, y: s0.y }];
  for (let y = s0.y + 6; y <= s0.y + 240; y += 2) line.push({ x: 5.9, y });
  const synthetic = { ...tape, samples: line.map((p, i) => ({ ...s0, ...p, tSec: i })) } as ScenarioTrace;
  const control = followPath(synthetic, { holdAtY: s0.y, goStep: 0, cruiseKmh: 20 })();
  return drive("sc-vu-child-cyclist", 1, { ...tape, samples: [s0] } as ScenarioTrace, control, 1500, deltas);
}

/** The road-user rows of a ledger whose struck body was `kind`. */
const rowsOf = (r: RiderRow, kind: string) => r.rows.filter((x) => x[1] === kind);

describe("the chassis into a staged rider's shell — one touch is one kind under one name, and one row", () => {
  it("sc-vu-bikelane-turn L1, the cut-path demo carried on (the verifier's cell): the sentinel and the shell report the counter-flow rider as ONE cyclist — no «vehicle» report, one cyclist row", () => {
    const r = bikelane([1 / 60]);
    note(`[bikelane 60 Hz] clock ${r.shellClock} reports ${JSON.stringify(r.reports)} ear ${JSON.stringify(r.ear)} rows ${JSON.stringify(r.rows)} closed ${r.closedAt}`);
    const rider = r.reports.filter(([, , id]) => id === "sc-vbl-rider-cf");
    // Both reporters spoke: the sentinel on the grid, the ear a step later.
    expect(rider.length).toBeGreaterThanOrEqual(1);
    expect(r.ear.some(([, kind, npcId, graded]) => npcId === 1001 && kind === "cyclist" && graded)).toBe(true);
    // One kind, one name: every report about a vehicle-class body in this
    // drive is the named cyclist — never an anonymous «vehicle».
    expect(r.reports.filter(([, w]) => w === "vehicle")).toEqual([]);
    expect(r.reports.filter(([, w, id]) => w === "cyclist" && id !== "sc-vbl-rider-cf" && id !== "sc-vbl-rider-wf")).toEqual([]);
    for (const [, w] of rider) expect(w).toBe("cyclist");
    // ONE row for the touch (it was two: «cyclist» and, one step later, «vehicle»).
    expect(rowsOf(r, "vehicle")).toEqual([]);
    expect(rowsOf(r, "cyclist").length).toBe(1);
  }, 600_000);

  it("…and on every cadence the same reports, the same ear, the same rows, the same sheet", () => {
    const ref = bikelane([1 / 60]);
    for (const [name, deltas] of CADENCES) {
      const r = bikelane(deltas);
      expect({ cadence: name, ...r }).toEqual({ cadence: name, ...ref });
    }
  }, 900_000);

  it("sc-vu-child-cyclist L1, driven into the child from behind: a child on a bicycle is a CYCLIST through both reporters — «Удар във велосипедист», once", () => {
    const r = child([1 / 60]);
    note(`[child 60 Hz] clock ${r.shellClock} reports ${JSON.stringify(r.reports)} ear ${JSON.stringify(r.ear)} rows ${JSON.stringify(r.rows)} closed ${r.closedAt}`);
    const kid = r.reports.filter(([, , id]) => id === "sc-vucc-child");
    expect(kid.length).toBeGreaterThanOrEqual(1);
    for (const [, w] of kid) expect(w).toBe("cyclist");
    expect(r.ear.some(([, kind, npcId, graded]) => npcId === 1000 && kind === "cyclist" && graded)).toBe(true);
    // No report of this drive calls him a vehicle, named or not.
    expect(r.reports.filter(([, w]) => w === "vehicle")).toEqual([]);
    expect(r.reports.filter(([, w, id]) => w === "cyclist" && id === null)).toEqual([]);
    expect(rowsOf(r, "vehicle")).toEqual([]);
    expect(rowsOf(r, "cyclist").length).toBe(1);
  }, 600_000);

  it("…and on every cadence the same", () => {
    const ref = child([1 / 60]);
    for (const [name, deltas] of CADENCES) {
      const r = child(deltas);
      expect({ cadence: name, ...r }).toEqual({ cadence: name, ...ref });
    }
  }, 900_000);
});
