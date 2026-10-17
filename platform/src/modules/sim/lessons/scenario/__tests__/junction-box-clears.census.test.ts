/**
 * sc-sig-controller-postures:5ee4301e, round 2 — A VEHICLE THAT HAS ENTERED A JUNCTION BOX CLEARS IT, AND NO POSE JUMPS.
 *
 * WHAT ROUND 1 BROKE (its verifier, on sc-turn-left-oncoming through the live chain). Once ambient cars obeyed the
 * lamp of their own approach, an eastbound car entered sx-v1 lawfully on its green, turned right, had its pose JUMP
 * from (−1.1, −4.1) to (−4.1, 0) and stood at 0 km/h inside the box to the end of the drive; the lesson's staged
 * oncoming pair froze behind it and the rig tapes turned into the frozen car: 33 COLLISIONs in 100 start delays.
 *
 * THE CAUSE was older than round 1 and is the same at base (2e9268f): an ambient car hopped the gap between the two
 * lanes of a turn, and on a right turn the hop lands it beside its own follower with its old lane still to cross —
 * the follower will not close on it, it will not close on the follower (`traffic/graph.ts laneConnector` has the
 * measurement). Round 2 gives the car a path through the box (the connector), holds it at its line while a staged
 * vehicle holds the box (round 4: `vehicles.ts boxGate`) and joins the next lane behind whoever is already on it.
 *
 * THE CENSUS (red at base and on the round-1 tree, green here). Every compiled rung of every template whose
 * district has a signalised junction, deduplicated by what the traffic can see and by the demo that is driven
 * (district, spawn, traffic, signal plan and modes, staged events, demo): 43 configurations, 126 drives — the round-1
 * verifier's 43 signalised configurations. Each is driven three ways through
 * `liveChainReplay` on the 1/60 s grid —
 *   · PARKED: the student never leaves his spawn, 200 s;
 *   · WAITING: the lesson's own demo up to the last sample before the car comes within 3 m of a junction's box,
 *     then held there for 90 s — a student who stops at the mouth and waits, which is what arms the staged actors;
 *   · THE DEMO itself, plus 5 s —
 * and on every grid point:
 *
 *  (a) NO VEHICLE STANDS IN A BOX. A vehicle — ambient or staged — is «in the box» of a junction (signalised, or of
 *      three arms or more) while its centre is inside EVERY arm's cut: the junction's drawn radius, clamped at
 *      JUNCTION_TRIM_MAX_FRACTION of each arm, the number the ribbons are trimmed and the stop lines set back with;
 *      a car at its line is never inside it. It «stands» below RESERVATION_PROGRESS_MPS (0.3 m/s, the fleet's own
 *      «making no progress»). THE BOUND is the signal's own clearance interval,
 *          SIGNAL_TIMING.yellowSec + allRedSec + redYellowSec = 3 + 1 + 1 = 5 s,
 *      the time the product's plan gives a vehicle that is in the junction before it releases the cross street: a
 *      vehicle standing in the box longer than that is standing in a released flow's way. (Measured on this tree
 *      outside d2-v1: no vehicle stands in a box for even 2 s. At base: up to 178 s; round 1: up to 162 s.)
 *
 *  (b) NO AMBIENT POSE MOVES FURTHER THAN ONE STEP OF TRAVEL: the speed it had or has, plus one step of the fleet's
 *      own acceleration, times the step. (At base and in round 1 every turn hopped: 5.7 m at sx-v1, up to 24.4 m in
 *      d2-v1; 363–780 hops per drive mode.) THE ONE DECLARED TELEPORT is excluded: the grid point on which a staged
 *      actor first appears, when `separateVehicleFrom` pushes an ambient car out from under it (system.ts, FR-27).
 *      Staged actors are not ambient cars: their return to the start of their path is the product's own re-entry
 *      (staged.ts FR-B5-RETURN) and they are not measured here.
 *
 * PINNED BY NAME, NOT REPAIRED HERE (identical in kind at base, where the same two lessons stand for up to 192 s):
 * on the real-Sofia cut d2-v1, ambient cars still stand in the boxes of UNSIGNALISED junctions joined by a link
 * shorter than the two boxes it connects (22 m between n3196455795 and n427565854): the stop point for the second
 * junction's time slot lies inside the first junction's box, and two cars each holding one slot wait for the other's
 * (`vehicles.ts`, «Holding a different node — wait here until it is released»). No lamp, no officer and no staged
 * actor is involved; it needs the slot of a short link taken together with the junction before it, which is a
 * change to the unsignalised reservation this lane was not given. It is asserted below exactly as measured, so a
 * repair and a regression both turn this file red. No vehicle stands in a SIGNALISED junction's box anywhere.
 *
 * THE CAREFUL STUDENT (the round-1 verifier's go sweep, its 91 cells): on every rung of the three officer drills a
 * student stops at his line and goes at one of thirteen moments around the flip — the same two assertions.
 *
 * THE DRILL (the round-1 refutation itself): the four rig-w2 tapes of sc-turn-left-oncoming at start delays 0–24 s —
 * the verifier's 100 cells, with its «start race» stood in at the director — and the same tapes stopped at the line
 * and held 60 s at nine delays (36 cells): no vehicle stands in the box in any of them, and the student never
 * touches an ambient car.
 *
 * ROUND 3 (integrator decisions D2 and D6, 2026-10-11).
 *
 * D2 — WHAT THE 100 TAPES DO TO THE LESSON'S OWN ONCOMING CARS IS PINNED BY NAME. The round-1 verifier's acceptance was
 * «0 COLLISION in the delay sweep». At base that was true only because the oncoming approach did not run: in every
 * cell that is not clean on this tree, at base an oncoming car STOOD AT 0 km/h ON ITS OWN GREEN for 3–9.7 s of the
 * window (an ambient car obeying the boulevard's lamp, the staged pair queued behind it — the filed defect itself;
 * r2b/sweepclass-base.json, r2b/dtl-base-a.txt). Here the pair runs, and an open-loop tape that turns across it is
 * either billed FAILED_TO_YIELD by the lesson's own oncoming encounters, or — when the car it cut up has already
 * stopped FOR it — drives on into that standing car. `SWEEP_NOT_CLEAN` names every such cell and its cause; every
 * other cell is clean; and in all 100 no vehicle rests in the box, no ambient pose jumps and no ambient car is touched.
 *
 * D6 — THE PATIENCE BOUND (traffic/vehicles.ts AMBIENT_YIELD_PATIENCE_SEC). In round 2 an ambient left-turner held at
 * its line for as long as the student stood at the opposite line, with the lesson's staged follow car queued behind
 * it for the whole 60 s (the nine pc-L3 wait cells). Pinned on the 36 wait cells, read against the lamp the oncoming
 * approach itself faces: while the student holds, the HEAD of the oncoming queue never stands on its own green longer
 * than the bound; in every pc-L3 cell the staged follow car passes the junction during the hold; and (the test above
 * it, unchanged) nothing rests in the box.
 *
 * ROUND 4 (integrator decision 2026-10-12: one junction-box protocol — traffic/vehicles.ts `boxGate`, `boxOf`,
 * `earliestReachM`). Round 3 was refuted on two findings this census could not see, and it now can:
 *
 *  · R3-F1, THE LAWFUL STUDENT HIT ON «PROCEED». Thirteen go times and one stop position had no go = 37.0 s (flip +
 *    patience + the turner's pull-away) and no student standing 3 m short of his line. The careful sweep is now ALSO
 *    the verifier's own grid — stop at the line and 3 m short of it, go every half second from 24 to 50 s, 1,378
 *    drives — and asserts what the grid is for: no drive that obeyed the officer touches an ambient car.
 *    (Base: 18 such drives end in COLLISION; round 3: 33.)
 *  · R3-F2, THE FREEZE THE END OF THE LESSON HID. A pair that froze in the box 3.5 s before the last objective was
 *    «under the 5 s bound». Every drive of the delay sweep is now watched a second time with the lesson HELD OPEN
 *    for a minute after the tape (one objective nobody can reach), and so are the 140 cells of the early-stop band —
 *    the two instruments on which the verifier found the pair standing 22.6–63.7 s.
 *
 * And two round-3 pins say something else now, because the rule under them changed:
 *  · D2's list is re-derived cell by cell (`SWEEP_NOT_CLEAN`: 80 clean, 18 across the pair, 2 into the stopped car);
 *  · D6 — «the head of the oncoming queue stands for the patience bound and no longer» — was the release the careful
 *    student met in the box. The bound now lifts the taught margin only, so past it a car still stands on its own
 *    green for a standing student in exactly one case, which the census names instead of forbidding: the turner on
 *    the arm OPPOSITE a student who stands at his line saying nothing (`HELD_FOR_A_STUDENT_AT_HIS_LINE`, read from
 *    the geometry). A student who signals his own left turn is not waited for (`holdAtTheLine`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { SIGNAL_TIMING } from "../../../runtime";
import { parseScenarioTrace } from "../../../traces/parse";
import type { ScenarioTrace, TraceSample } from "../../../traces/types";
import { STAGED_STATE_ID_BASE } from "../../../traffic/staged";
import { buildLaneGraph, laneConnector, sampleLane } from "../../../traffic/graph";
import {
  AMBIENT_YIELD_PATIENCE_SEC,
  PLAYER_STANDING_MAX_MPS,
  STUDENT_PATH_SEP_M,
  VEHICLE_LENGTH_M,
  WAITING_HOLD_STUDENT,
  stagedPathSepM,
  waitingPointArc,
  waitingPointHoldFor,
} from "../../../traffic/vehicles";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict, type TrafficVehicleState } from "../../../traffic/types";
import { JUNCTION_TRIM_MAX_FRACTION, STOP_LINE_BEYOND_CUT_M, analyzeNetwork, nodeOpenRadiusM } from "../../../world/builders/network";
import { compileScenario } from "../compile";
import { SCENARIO_TEMPLATES } from "../templates";
import { SC_TURN_LEFT_ONCOMING } from "../templates-junctions";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

// The rig-w2 «start race», exactly as ltap-turn-after-encounter.live.test.tsx stands it in: the director is given
// the pre-spawn pose (0, 0) until the tape's own pre-spawn sample. Inert (−1) for the catalogue census.
const RACE = vi.hoisted(() => ({ untilSec: -1 }));
vi.mock("../../../orchestrator/director", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../orchestrator/director")>();
  return {
    ...m,
    createScenarioDirector: (...args: Parameters<typeof m.createScenarioDirector>) => {
      const d = m.createScenarioDirector(...args);
      const step = d.step.bind(d);
      d.step = (input) => (input.tSec < RACE.untilSec ? step({ ...input, x: 0, y: 0, speedKmh: 0 }) : step(input));
      return d;
    },
  };
});

// D6, CATALOGUE-WIDE AND FROM OUTSIDE: the fleet's step function is wrapped (nothing else of the module is touched) and,
// after each step, the car just stepped is read the way a bystander would read it — not through its own patience
// clock. A car is «standing on its own green for a standing student» while ALL of this holds:
//   · it stands (≤ 0.3 m/s) as the HEAD of its lane (no ambient car ahead of it on the lane), within a car and a
//     standstill gap of its stop line, at a signalised lane end whose lamp FOR ITS OWN APPROACH is green
//     (runtime.ambientSignalPhase, asked exactly as the product asks it);
//   · the student stands (≤ 0.3 m/s) at that junction (within its drawn radius + 15 m of this lane's end), and is not
//     the obstacle in the car's own corridor (the fleet's «player ahead in lane» test) — a car queued behind him is
//     waiting for him to drive on, not holding the way open for him;
//   · no staged actor is within 80 m of the car (it may be holding its line for that actor: boxGate), and no
//     pedestrian is on a crossing of its lane.
// ROUND 4. Round 3 asserted that no car is in that state longer than the patience bound. Under the junction-box
// protocol one kind of car IS, by decision (integrator, 2026-10-12: «if it cannot clear before the earliest he could
// arrive, it keeps waiting»): the car about to turn left or round on the arm OPPOSITE a student who stands at his line
// on the same green and is not signalling a left turn. He could be in its path before it is out of it; round 3 let it
// go on the clock and the careful student met it in the box (verifier R3-F1). The census now asserts that every car
// past the bound is of that kind — read here from the geometry, not from the car's own clock — and names the drives.
const YIELD = vi.hoisted(() => ({
  maxSec: Infinity,
  since: new Map<number, number>(),
  over: new Map<number, string>(),
  rt: null as null | { ambientSignalPhase(node: string, bearingDeg: number, fromNode: string): string | null },
}));
vi.mock("../../../traffic/vehicles", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../traffic/vehicles")>();
  const HALF = m.VEHICLE_LENGTH_M / 2;
  return {
    ...m,
    updateVehicle: (...args: Parameters<typeof m.updateVehicle>) => {
      m.updateVehicle(...args);
      const [agent, , env] = args;
      const id = agent.state.id;
      const lane = env.graph.lanes[agent.route.laneIndices[agent.routePos]];
      const node = lane.endSignalNodeId;
      const clear = (): void => void YIELD.since.delete(id);
      if (!YIELD.rt || !env.hasPlayer || node === null || agent.speed > 0.3 || env.playerSpeedMps > 0.3) return clear();
      const radius = env.graph.junctionRadiusM.get(lane.toNode) ?? 0;
      const n = lane.px.length - 1;
      // Near its line, and the student at this junction.
      if (lane.length - agent.s > radius + 0.6 + HALF + env.cfg.minGapM + 3) return clear();
      if (Math.hypot(env.playerX - lane.px[n], env.playerY - lane.py[n]) > radius + 15) return clear();
      // Head of its lane.
      const laneIdx = agent.route.laneIndices[agent.routePos];
      if (env.agents.some((o) => o !== agent && o.route.laneIndices[o.routePos] === laneIdx && o.s > agent.s)) return clear();
      // The student is not the obstacle in its own corridor.
      const relX = env.playerX - agent.state.x;
      const relY = env.playerY - agent.state.y;
      const along = relX * agent.state.dirX + relY * agent.state.dirY;
      const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
      if (along > -2 && along < env.cfg.lookaheadM && lateral < env.cfg.playerLateralM) return clear();
      // Nothing staged near, nobody on its crossings.
      if (env.staged.some((st) => Math.hypot(st.x - agent.state.x, st.y - agent.state.y) < 80)) return clear();
      if (lane.crossings.some((c) => (env.crossingCounts.get(c.crossingId) ?? 0) > 0)) return clear();
      // Its own lamp.
      const bearing = ((Math.atan2(lane.endDirX, lane.endDirY) * 180) / Math.PI + 360) % 360;
      if (YIELD.rt.ambientSignalPhase(node, bearing, lane.fromNode) !== "green") return clear();
      const since = YIELD.since.get(id);
      if (since === undefined) return void YIELD.since.set(id, env.timeSec);
      const sec = env.timeSec - since;
      if (sec > YIELD.maxSec) {
        // WHO it is standing for, read as a bystander would: a car about to turn LEFT or ROUND, on the arm OPPOSITE a
        // student who stands within a launch of its path (75.6 m is what his car covers from rest in the 7.2 s the
        // turn takes — see junction-box-protocol.test.ts) and is not signalling a left turn of his own.
        const idxs = agent.route.laneIndices;
        const next = env.graph.lanes[idxs[(agent.routePos + 1) % idxs.length]];
        const cos = lane.endDirX * next.startDirX + lane.endDirY * next.startDirY;
        const cross = lane.endDirX * next.startDirY - lane.endDirY * next.startDirX;
        const turnsAcross = cos < -0.17 || (cos < 0.57 && cross > 0);
        const opposite = env.playerDirX * lane.endDirX + env.playerDirY * lane.endDirY < -0.7;
        const within = Math.hypot(env.playerX - lane.px[n], env.playerY - lane.py[n]) < 75.6;
        const why = turnsAcross && opposite && within && env.playerIndicator !== "left" ? "OPPOSITE-ARM TURNER" : "UNEXPLAINED";
        YIELD.over.set(id, `${why}: car ${id} at (${agent.state.x.toFixed(1)}, ${agent.state.y.toFixed(1)}) has stood on its own green for a standing student past the bound`);
      }
    },
  };
});

// The live chain's own runtime, captured so the wait census can read the lamp the oncoming approach faces.
const RT = vi.hoisted(() => ({ last: null as null | { ambientSignalPhase(node: string, bearingDeg: number, fromNode: string | null): string | null } }));
vi.mock("../../../runtime", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../runtime")>();
  return {
    ...m,
    createWorldRuntime: (...args: Parameters<typeof m.createWorldRuntime>) => {
      const r = m.createWorldRuntime(...args);
      RT.last = r as never;
      YIELD.rt = r as never;
      return r;
    },
  };
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(process.cwd(), "..");

/** The signal's clearance interval: what the plan gives a vehicle in the junction before the cross street goes. */
const BOX_REST_BOUND_SEC = SIGNAL_TIMING.yellowSec + SIGNAL_TIMING.allRedSec + SIGNAL_TIMING.redYellowSec;
/** vehicles.ts RESERVATION_PROGRESS_MPS (module-private; copied by value): below it a car is making no progress. */
const AT_REST_MPS = 0.3;
/** Float slack on one step of travel, m. */
const STEP_EPS_M = 1e-6;
/** One grid step, s. */
const STEP_SEC = 1 / 60;
/**
 * The longest a car may be SEEN standing while it holds the way open for a standing student: the patience bound
 * (traffic/vehicles.ts AMBIENT_YIELD_PATIENCE_SEC), plus the time the fleet's own acceleration needs to take it from
 * rest past the no-progress speed it is read with (0.3 m/s ÷ accelMps2), plus the two grid steps the reading straddles.
 */
const HEAD_ON_GREEN_MAX_SEC = AMBIENT_YIELD_PATIENCE_SEC + AT_REST_MPS / DEFAULT_TRAFFIC_CONFIG.accelMps2 + 2 * STEP_SEC;

interface RawDistrict {
  roads: { edges: Array<{ id: string; from: string; to: string; class: string; lanes: number; length: number }> };
  intersections: Array<{ id: string; x: number; y: number; degree: number; signalized: boolean }>;
}
interface Box {
  id: string;
  x: number;
  y: number;
  /** Inside EVERY arm's cut. */
  r: number;
  signalised: boolean;
}
const boxCache = new Map<string, Box[]>();
function boxesOf(districtId: string, raw: RawDistrict): Box[] {
  let boxes = boxCache.get(districtId);
  if (boxes) return boxes;
  const touching = new Map<string, RawDistrict["roads"]["edges"]>();
  for (const e of raw.roads.edges) {
    for (const id of [e.from, e.to]) {
      let bucket = touching.get(id);
      if (!bucket) touching.set(id, (bucket = []));
      bucket.push(e);
    }
  }
  boxes = [];
  for (const ix of raw.intersections) {
    if (!(ix.signalized || ix.degree >= 3)) continue;
    const arms = touching.get(ix.id) ?? [];
    const radius = nodeOpenRadiusM(arms as never, arms.length);
    const r = Math.min(radius, ...arms.map((e) => e.length * JUNCTION_TRIM_MAX_FRACTION));
    if (r > 0) boxes.push({ id: ix.id, x: ix.x, y: ix.y, r, signalised: ix.signalized });
  }
  boxCache.set(districtId, boxes);
  return boxes;
}

interface Rest {
  vehicle: number;
  box: string;
  signalised: boolean;
  fromSec: number;
  sec: number;
}
interface Watch {
  rests: Rest[];
  jumps: number;
  worstJumpM: number;
  firstJump: string;
  ambientContacts: number;
  /** The violation codes of the drive, in order. */
  codes: string[];
  /** The lesson's oncoming encounters that ended in a bill (event ids, sorted). */
  billedBy: string[];
  /** The vehicle nearest the student on the first grid point that carries a vehicle contact, or null. */
  hit: { id: number; mps: number; cruiseMps: number } | null;
  /** Ambient cars seen standing on their own green for a standing student for longer than the patience bound. */
  heldPastTheBound: string[];
  /**
   * Rounds 6–7 (E2, E5, E6): rests at a waiting point that the product held FOR a body that was coming (its own
   * `waitingPointHoldFor`) and that ended within the passage bound after that body had passed, turned off the path or
   * stopped — not rests. `afterPassageSec`: from the first grid point at which no such body was coming to the end.
   */
  waitingPointHolds: Array<{ vehicle: number; fromSec: number; sec: number; afterPassageSec: number }>;
}
type PointHook = (p: { t: number; x: number; y: number; speedKmh: number; events: ReadonlyArray<{ kind: string; violated?: boolean }>; vehicles: ReadonlyArray<{ id: number; x: number; y: number; dirX: number; dirY: number; speedMps: number }> }) => void;
/** Drive one trace through the live chain and watch every vehicle on every grid point. */
function watchDrive(lesson: Parameters<typeof liveChainReplay>[0]["lesson"], raw: unknown, trace: ScenarioTrace, boxes: Box[], holdAfterSec: number, onPoint?: PointHook): Watch {
  const speeds = new Map<number, Array<[number, number]>>();
  let hit: Watch["hit"] = null;
  YIELD.over.clear();
  YIELD.since.clear();
  YIELD.maxSec = HEAD_ON_GREEN_MAX_SEC;
  const prev = new Map<number, { x: number; y: number; v: number }>();
  const still = new Map<number, { t0: number; box: Box; w: WaitingPoint | null; ledger: HoldLedger | null }>();
  const rests: Rest[] = [];
  const waitingPointHolds: Watch["waitingPointHolds"] = [];
  const points = waitingPointsOf(raw);
  let ended = false;
  let known = new Set<number>();
  let lastT = 0;
  let jumps = 0;
  let worstJumpM = 0;
  let firstJump = "";
  const close = (id: number, t: number): void => {
    const s = still.get(id);
    if (!s) return;
    still.delete(id);
    if (s.ledger !== null && s.ledger.lastComing !== null) {
      const v = s.ledger.verdict(t, ended);
      if (v.overPassageSec === null && v.unexcusedSec <= BOX_REST_BOUND_SEC) {
        waitingPointHolds.push({ vehicle: id, fromSec: +s.t0.toFixed(2), sec: +(t - s.t0).toFixed(2), afterPassageSec: +v.tailSec.toFixed(2) });
        return;
      }
      // Held on after the body it was held for was no longer coming (E5/E6), or longer than the bound with none coming.
      const why = v.overPassageSec !== null ? ` — held ${v.tailSec.toFixed(2)} s after its body was no longer coming` : "";
      rests.push({ vehicle: id, box: s.box.id + why, signalised: s.box.signalised, fromSec: +s.t0.toFixed(2), sec: +(t - s.t0).toFixed(2) });
      return;
    }
    if (t - s.t0 > BOX_REST_BOUND_SEC) {
      rests.push({ vehicle: id, box: s.box.id, signalised: s.box.signalised, fromSec: +s.t0.toFixed(2), sec: +(t - s.t0).toFixed(2) });
    }
  };
  const out = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace,
    applyOutcomes: true,
    holdAfterSec,
    afterApply: ({ t, tick, traffic }) => {
      const dt = t - lastT;
      lastT = t;
      onPoint?.({ t, x: tick.position.x, y: tick.position.y, speedKmh: tick.speedKmh, events: tick.events as never, vehicles: traffic.vehicles });
      // The speed each vehicle had over the last 6 s, and whom the student touched first.
      let nearest: { id: number; d: number; mps: number } | null = null;
      for (const v of traffic.vehicles) {
        let h = speeds.get(v.id);
        if (!h) speeds.set(v.id, (h = []));
        h.push([t, v.speedMps]);
        while (h[0][0] < t - 6) h.shift();
        const d = Math.hypot(v.x - tick.position.x, v.y - tick.position.y);
        if (!nearest || d < nearest.d) nearest = { id: v.id, d, mps: v.speedMps };
      }
      if (!hit && nearest && tick.events.some((e) => e.kind === "collision" && e.withWhat === "vehicle")) {
        hit = { id: nearest.id, mps: nearest.mps, cruiseMps: Math.max(...speeds.get(nearest.id)!.map((p) => p[1])) };
      }
      let stagedAppeared = false;
      const now = new Set<number>();
      for (const v of traffic.vehicles) {
        now.add(v.id);
        if (v.id >= STAGED_STATE_ID_BASE && !known.has(v.id)) stagedAppeared = true;
      }
      known = now;
      for (const v of traffic.vehicles) {
        const p = prev.get(v.id);
        prev.set(v.id, { x: v.x, y: v.y, v: v.speedMps });
        // (b) one step of travel — ambient cars, except the declared re-seat when an actor is staged.
        if (p && dt > 0 && v.id < STAGED_STATE_ID_BASE && !stagedAppeared) {
          const moved = Math.hypot(v.x - p.x, v.y - p.y);
          const allowed = (Math.max(p.v, v.speedMps) + DEFAULT_TRAFFIC_CONFIG.accelMps2 * dt) * dt + STEP_EPS_M;
          if (moved > allowed) {
            jumps++;
            if (moved - allowed > worstJumpM) worstJumpM = moved - allowed;
            if (!firstJump) {
              firstJump = `car ${v.id} t=${t.toFixed(2)} (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) → (${v.x.toFixed(2)}, ${v.y.toFixed(2)}), ${moved.toFixed(2)} m in a step worth ${allowed.toFixed(2)} m`;
            }
          }
        }
        // (a) standing in a box.
        const box = v.speedMps < AT_REST_MPS ? boxes.find((b) => Math.hypot(v.x - b.x, v.y - b.y) < b.r) : undefined;
        if (!box) {
          close(v.id, t);
          continue;
        }
        const s = still.get(v.id);
        if (!s) {
          const w = v.id < STAGED_STATE_ID_BASE ? (points.find((p) => Math.hypot(v.x - p.at.x, v.y - p.at.y) < 3) ?? null) : null;
          still.set(v.id, { t0: t, box, w, ledger: w !== null ? new HoldLedger(t, w) : null });
        }
        else if (s.box !== box) {
          close(v.id, t);
          still.set(v.id, { t0: t, box, w: null, ledger: null });
        }
      }
      // E5/E6 — while a car stands at its waiting point the product says whom it holds it FOR (`waitingPointHoldFor`);
      // the ledger asks of exactly those bodies, and of no other, whether they are still coming at the rest of its path.
      for (const [id, s] of still) {
        if (s.ledger === null) continue;
        const st = traffic.vehicles.find((o) => o.id === id);
        s.ledger.step(t, dt, holdBodies(st ? waitingPointHoldFor(st as TrafficVehicleState) : null, tick, traffic.vehicles));
      }
    },
  });
  ended = true;
  for (const id of [...still.keys()]) close(id, lastT);
  const billedBy = out.outcomes
    .filter((o) => o.kind === "oncomingLeftTurn" && !o.success)
    .map((o) => o.eventId)
    .sort();
  return { rests, jumps, worstJumpM, firstJump, ambientContacts: out.ambientContacts.length, codes: out.violationCodes, billedBy, hit, heldPastTheBound: [...YIELD.over.values()], waitingPointHolds };
}

function parkedTrace(at: { x: number; y: number; headingDeg: number }, secs: number, id: string): ScenarioTrace {
  const samples = [0, secs].map((t) => ({ tSec: t, x: at.x, y: at.y, headingDeg: at.headingDeg, steerRad: 0, speedKmh: 0, gear: 1, indicator: "off", brakeOn: true, throttleOn: false }));
  return { meta: { scenarioId: id, kind: "attempt", version: 1, durationSec: secs }, samples, events: [] } as unknown as ScenarioTrace;
}
/** The demo up to the last sample before the car's centre is within 3 m of a box, then held there for `holdSec`. */
function waitingTrace(demo: ScenarioTrace, boxes: Box[], holdSec: number, id: string): ScenarioTrace | null {
  const ss = demo.samples as TraceSample[];
  let cut = -1;
  for (let i = 0; i < ss.length; i++) {
    if (boxes.some((b) => Math.hypot(ss[i].x - b.x, ss[i].y - b.y) < b.r + 3)) {
      cut = i - 1;
      break;
    }
  }
  if (cut < 1) return null;
  const last = ss[cut];
  const samples = [
    ...ss.slice(0, cut + 1),
    { ...last, tSec: last.tSec + 0.05, speedKmh: 0, brakeOn: true, throttleOn: false },
    { ...last, tSec: last.tSec + holdSec, speedKmh: 0, brakeOn: true, throttleOn: false },
  ];
  return { meta: { scenarioId: id, kind: "attempt", version: 1, durationSec: last.tSec + holdSec }, samples, events: [] } as unknown as ScenarioTrace;
}

/**
 * The drives of the catalogue census in which the opposite-arm turner stands past the bound: every one a WAITING
 * drive — the student stopped at his own line and held there 90 s, on a signal that lets him go, saying nothing.
 * (PARKED at his spawn and on the lesson's own DEMO: none.)
 */
const HELD_FOR_A_STUDENT_AT_HIS_LINE: string[] = [
  "sc-jx-blocked-exit L1 waiting",
  "sc-jx-blocked-exit L3 waiting",
  "sc-jx-blocked-exit L5 waiting",
  "sc-sig-controller-postures L1 waiting",
  "sc-sig-controller-postures L3 waiting",
  "sc-sig-flash-amber-ped L5 waiting",
  "sc-signal-controller L1 waiting",
  "sc-signal-controller L3 waiting",
  "sc-signal-controller L5 waiting",
  "sc-signal-flashing L1 waiting",
  "sc-signal-redyellow L1 waiting",
  "sc-signal-redyellow L3 waiting",
  "sc-signal-redyellow L5 waiting",
  "sc-signal-response L1 waiting",
  "sc-signal-response L3 waiting",
  "sc-signal-response L5 waiting",
];

/** The two d2-v1 lessons whose ambient fleet still stands in UNSIGNALISED boxes joined by a short link (see header). */
const SHORT_LINK_SLOT_CHAIN = ["sc-ed-d2-city-run", "sc-ed-d2-priority-run"];

describe("every signalised configuration of the catalogue: nothing stands in a junction box and no ambient pose jumps", () => {
  it("parked, waiting at the first junction mouth, and on the lesson's own demo", () => {
    const seen = new Set<string>();
    let configs = 0;
    let drives = 0;
    const jumped: string[] = [];
    const inSignalised: string[] = [];
    const inUnsignalised = new Map<string, string[]>();
    const heldPastTheBound: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const raw = loadDistrict(spec.map.districtId) as RawDistrict;
      if (!raw.intersections.some((i) => i.signalized)) continue;
      const boxes = boxesOf(spec.map.districtId, raw);
      for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        let lesson;
        try {
          lesson = compileScenario(spec, level);
        } catch {
          continue;
        }
        const key = JSON.stringify([spec.map.districtId, lesson.spawn, lesson.traffic ?? null, lesson.signalPlan ?? null, lesson.signalModes ?? null, lesson.stagedEvents ?? null, spec.shadow!.path]);
        if (seen.has(key)) continue;
        seen.add(key);
        configs++;
        const demo = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, spec.shadow!.path), "utf-8")))!;
        const modes: Array<[string, ScenarioTrace | null, number]> = [
          ["parked", parkedTrace(demo.samples[0] as never, 200, spec.id), 0],
          ["waiting", waitingTrace(demo, boxes, 90, spec.id), 0],
          ["demo", demo, 5],
        ];
        for (const [mode, trace, hold] of modes) {
          if (!trace) continue;
          drives++;
          const w = watchDrive(lesson, raw, trace, boxes, hold);
          const cell = `${spec.id} L${level} ${mode}`;
          if (w.jumps > 0) jumped.push(`${cell}: ${w.jumps} — ${w.firstJump}`);
          for (const h of w.heldPastTheBound) heldPastTheBound.push(`${cell}: ${h}`);
          for (const r of w.rests) {
            const line = `${cell}: vehicle ${r.vehicle} in ${r.box} from t=${r.fromSec} for ${r.sec} s`;
            if (r.signalised) inSignalised.push(line);
            else inUnsignalised.set(spec.id, [...(inUnsignalised.get(spec.id) ?? []), line]);
          }
        }
      }
    }
    expect(configs).toBeGreaterThanOrEqual(43);
    expect(drives).toBeGreaterThanOrEqual(126);
    // (b) no ambient pose moves further than one step of travel.
    expect(jumped).toEqual([]);
    // (c) D6 under the protocol: past the patience bound a car stands on its own green for a standing student only as
    //     the opposite-arm turner he could beat into its own path — nothing unexplained, and the drives are named.
    expect(heldPastTheBound.filter((h) => !h.includes(": OPPOSITE-ARM TURNER: "))).toEqual([]);
    expect([...new Set(heldPastTheBound.map((h) => h.slice(0, h.indexOf(": "))))].sort()).toEqual(HELD_FOR_A_STUDENT_AT_HIS_LINE);
    // (a) nothing stands in a SIGNALISED junction's box, anywhere…
    expect(inSignalised).toEqual([]);
    // …and in an unsignalised one only where the header names it, exactly.
    expect([...inUnsignalised.keys()].sort(), JSON.stringify([...inUnsignalised.values()].flat().slice(0, 6))).toEqual(SHORT_LINK_SLOT_CHAIN);
  }, 1_200_000);
});

/**
 * THE CAREFUL STUDENT AT THE OFFICER'S JUNCTION — the round-1 verifier's go sweep (its 91 cells): a student who drives
 * up sx-v1's northbound lane, stops 31 m short of the node (at his line) and goes at one of thirteen moments around
 * the officer's flip, whatever the traffic is doing.
 */
function carefulTrace(goSec: number, id: string, stopY = -31, indicator: "off" | "left" | "right" = "off", goKmh = 30, goAccel = 2): ScenarioTrace {
  const samples: unknown[] = [];
  const dt = 0.05;
  const vMax = 30 / 3.6;
  const vGo = goKmh / 3.6;
  let y = -105;
  let v = 0;
  let phase: "approach" | "hold" | "go" = "approach";
  for (let t = 0; y < 70 && t < 200; t += dt) {
    if (phase === "approach") {
      const d = stopY - y;
      v = d <= (v * v) / 3 + 0.05 ? Math.max(0, v - 1.5 * dt) : Math.min(vMax, v + 1.5 * dt);
      if (v === 0 && d < 1) phase = "hold";
    } else if (phase === "hold") {
      if (t >= goSec) phase = "go";
    } else v = Math.min(vGo, v + goAccel * dt);
    samples.push({ tSec: +t.toFixed(4), x: 4.0625, y, headingDeg: 0, steerRad: 0, speedKmh: v * 3.6, gear: 1, indicator, brakeOn: phase !== "go" && v === 0, throttleOn: v > 0 });
    y += v * dt;
  }
  return { meta: { scenarioId: id, kind: "attempt", version: 1, durationSec: (samples[samples.length - 1] as { tSec: number }).tSec }, samples, events: [] } as unknown as ScenarioTrace;
}
const OFFICER_DRILLS = ["sc-signal-controller", "sc-sig-controller-live", "sc-sig-controller-postures"];
const GO_SECS = [20, 26, 32, 38, 41, 44, 47, 50, 53, 56, 62, 70, 80];
/**
 * ROUND 4 — THE ROUND-3 VERIFIER'S GRID (its finding R3-F1). Thirteen go times and one stop position hid both things
 * it found: go = 37.0 s (flip 30 + patience 5 + the turner's pull-away) and a student standing 3 m SHORT of his line.
 * Its grid: stop at the line (y = −31) and 3 m short of it (−34), go every half second from 24 to 50 s — 53 × 2 cells
 * on each of the 13 compiled rungs of the three drills, 1,378 drives.
 */
const GRID_STOPS_Y = [-31, -34];
const GRID_GO_FROM_SEC = 24;
const GRID_GO_TO_SEC = 50;
const GRID_GO_STEP_SEC = 0.5;

describe("the officer's junction, a careful student going at thirteen moments around the flip", () => {
  it("every rung of the three officer drills: nothing stands in the box and no ambient pose jumps", () => {
    const seen = new Set<string>();
    let cells = 0;
    const jumped: string[] = [];
    const rested: string[] = [];
    for (const id of OFFICER_DRILLS) {
      const spec = SCENARIO_TEMPLATES.find((t) => t.id === id)!;
      const raw = loadDistrict(spec.map.districtId) as RawDistrict;
      const boxes = boxesOf(spec.map.districtId, raw);
      for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        let lesson;
        try {
          lesson = compileScenario(spec, level);
        } catch {
          continue; // a rung the template does not author
        }
        const key = JSON.stringify([lesson.spawn, lesson.traffic ?? null, lesson.signalPlan ?? null, lesson.signalModes ?? null, lesson.stagedEvents ?? null]);
        if (seen.has(key)) continue;
        seen.add(key);
        for (const go of GO_SECS) {
          cells++;
          const w = watchDrive(lesson, raw, carefulTrace(go, id), boxes, 0);
          const cell = `${id} L${level} go ${go} s`;
          if (w.jumps > 0) jumped.push(`${cell}: ${w.jumps} — ${w.firstJump}`);
          for (const r of w.rests) rested.push(`${cell}: vehicle ${r.vehicle} in ${r.box} from t=${r.fromSec} for ${r.sec} s`);
        }
      }
    }
    expect(cells).toBeGreaterThanOrEqual(91);
    expect(jumped).toEqual([]);
    expect(rested).toEqual([]);
  }, 1_200_000);

  it("THE LAWFUL STUDENT IS NEVER HIT: on the round-3 verifier's 1,378-cell grid no drive that obeyed the officer touches an ambient car, and nothing stands in the box", () => {
    let cells = 0;
    let lawful = 0;
    const hit: string[] = [];
    const rested: string[] = [];
    for (const id of OFFICER_DRILLS) {
      const spec = SCENARIO_TEMPLATES.find((t) => t.id === id)!;
      const raw = loadDistrict(spec.map.districtId) as RawDistrict;
      const boxes = boxesOf(spec.map.districtId, raw);
      for (const level of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
        let lesson;
        try {
          lesson = compileScenario(spec, level);
        } catch {
          continue; // a rung the template does not author
        }
        for (const stopY of GRID_STOPS_Y) {
          for (let go = GRID_GO_FROM_SEC; go <= GRID_GO_TO_SEC + 1e-9; go += GRID_GO_STEP_SEC) {
            cells++;
            const w = watchDrive(lesson, raw, carefulTrace(go, id, stopY), boxes, 0);
            const cell = `${id} L${level} stop ${stopY} go ${go} s`;
            for (const r of w.rests) rested.push(`${cell}: vehicle ${r.vehicle} in ${r.box} from t=${r.fromSec} for ${r.sec} s`);
            if (w.codes.includes("CONTROLLER_SIGNAL_VIOLATED")) continue; // he drove against the officer: not lawful
            lawful++;
            if (w.ambientContacts > 0 || w.codes.includes("COLLISION")) hit.push(`${cell}: ${w.codes.join("+")}`);
          }
        }
      }
    }
    expect(cells).toBe(1378);
    // More than half the grid is lawful (go at or after the flip): the assertion is not vacuous.
    expect(lawful).toBeGreaterThan(700);
    // At base 18 of these drives ended in COLLISION; on the round-3 tree 33 (its verifier's count).
    expect(hit).toEqual([]);
    expect(rested).toEqual([]);
  }, 2_400_000);
});

/** The lesson's two oncoming encounters (templates-junctions.ts): the only things that may bill the tapes' turn. */
const OWN_ONCOMING_EVENTS = ["sc-ltap-follow", "sc-ltap-tight"];
/** The staged follow car of sc-turn-left-oncoming (the second staged actor: STAGED_STATE_ID_BASE + 1). */
const FOLLOW_CAR_ID = STAGED_STATE_ID_BASE + 1;
/** Lane-centre offset from the road's centreline, m. */
const LANE_OFFSET_M = DEFAULT_TRAFFIC_CONFIG.laneWidthM / 2;

/**
 * D2 — EVERY CELL OF THE 100-CELL DELAY SWEEP THAT IS NOT CLEAN, AND WHY (see the header). At base (2e9268f) all of
 * these were «clean» because an oncoming car stood on its own green.
 */
const ACROSS_IN_THE_ENCOUNTER =
  "FAILED_TO_YIELD | turned across the lesson's own staged oncoming car, lawfully there and moving; billed by the lesson's oncoming encounters";
/** The same turn across the same pair on a later lap, after both encounters had resolved: billed by the runtime's own left-turn tracker. */
const ACROSS_ON_A_LATER_LAP = "FAILED_TO_YIELD | turned across the lesson's own staged oncoming car, lawfully there and moving";
const INTO_THE_CAR_THAT_STOPPED = "COLLISION | drove on into the staged car that had stopped for him";
const sweepCells = (leg: string, delays: number[], cause: string): Array<[string, string]> => delays.map((d) => [`${leg}+${d}`, cause]);
const SWEEP_NOT_CLEAN: Record<string, string> = Object.fromEntries([
  // ROUND 4, RE-DERIVED CELL BY CELL (r4/dump/sweep-notclean.json). The causes are the same three; the DELAYS moved,
  // because the staged pair's pass moved: in round 3 the head of the oncoming queue (an ambient left-turner) held
  // its line for the patience bound after its green and then went; now it holds while the tape approaches signalling
  // nothing and goes when the tape's left indicator comes on (an opposing left turn passes it) — so the pair behind it
  // arrives at a different second of each tape. Round 3: 79 clean / 17 across the pair / 4 into the stopped car.
  ...sweepCells("pc-L1", [12, 15, 16, 17], ACROSS_IN_THE_ENCOUNTER),
  ...sweepCells("pc-L1", [20, 21, 22], ACROSS_ON_A_LATER_LAP),
  ...sweepCells("pc-L1", [24], INTO_THE_CAR_THAT_STOPPED),
  ...sweepCells("phone-L1", [12, 15, 16], ACROSS_IN_THE_ENCOUNTER),
  ...sweepCells("phone-L1", [20, 21, 22], ACROSS_ON_A_LATER_LAP),
  ...sweepCells("phone-L1", [24], INTO_THE_CAR_THAT_STOPPED),
  ...sweepCells("phone-L3", [17, 18, 19], ACROSS_IN_THE_ENCOUNTER),
  ...sweepCells("phone-L3", [23, 24], ACROSS_ON_A_LATER_LAP),
  // pc-L3: all 25 delays clean.
]);

describe("sc-turn-left-oncoming, the round-1 refutation: the rig-w2 tapes at every start delay", () => {
  type Row = [number, number, number, number, number, number, number];
  const IND = { "-1": "left", "0": "off", "1": "right" } as const;
  const SX = JSON.parse(readFileSync(path.join(HERE, "../../../../../../../content/world/sx-v1.json"), "utf-8")) as RawDistrict;
  const boxes = boxesOf("sx-v1", SX);
  const legs: Array<{ name: string; level: 1 | 3; preSpawnSampleSec: number; rows: Row[] }> = [];
  for (const fx of ["phone", "pc"]) {
    const tapes = JSON.parse(readFileSync(path.join(HERE, `ltap-rig-w2-${fx}-tapes.fixture.json`), "utf-8")) as {
      legs: Record<string, { level: 1 | 3; preSpawnSampleSec: number; rows: Row[] }>;
    };
    for (const name of Object.keys(tapes.legs)) legs.push({ name, ...tapes.legs[name] });
  }
  const sample = (t: number, r: Row): TraceSample => ({ tSec: t, x: r[1], y: r[2], headingDeg: r[3], steerRad: 0, speedKmh: r[4], gear: r[5], indicator: IND[String(r[6]) as "0"], brakeOn: false, throttleOn: false });
  const traceOf = (samples: TraceSample[]): ScenarioTrace => ({ meta: { scenarioId: SC_TURN_LEFT_ONCOMING.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec }, samples, events: [] }) as ScenarioTrace;
  /**
   * ROUND 4 — HELD OPEN (`heldOpenSec` > 0). The lesson ends when its last objective is met, and the round-3 census
   * stopped watching there: a pair that froze in the box 3.5 s before the end was «under the 5 s bound» (verifier
   * R3-F2 — the same pair stood 63.7 s once the lesson was kept open). So the same drive is watched again with one
   * objective nobody can reach added to the lesson and the world run on for `heldOpenSec` after the tape.
   */
  function drive(leg: (typeof legs)[number], trace: ScenarioTrace, onPoint?: PointHook, heldOpenSec = 0): Watch {
    RACE.untilSec = leg.preSpawnSampleSec + 1e-6;
    const compiled = compileScenario(SC_TURN_LEFT_ONCOMING, leg.level);
    const lesson =
      heldOpenSec > 0
        ? ({
            ...compiled,
            objectives: [
              ...compiled.objectives,
              { id: "census-never", titleBg: "—", kind: "reachZone", params: { x: 9999, y: 9999, radiusM: 1 } },
            ],
          } as typeof compiled)
        : compiled;
    try {
      return watchDrive(lesson, SX, trace, boxes, heldOpenSec, onPoint);
    } finally {
      RACE.untilSec = -1;
    }
  }
  /** How long the world is watched after the tape when the lesson is held open, s. */
  const HELD_OPEN_SEC = 60;
  /** The early-stop band of ltap-early-stop-band.live.test.tsx: brake to rest at `xStopM`, wait, creep to the line, then the tape. */
  function earlyStop(rows: readonly Row[], xStopM: number, waitSec: number): Row[] {
    const iBrake = rows.findIndex((r) => r[1] <= xStopM + 12);
    const head = rows.slice(0, iBrake);
    const b = head[head.length - 1];
    const v0 = b[4] / 3.6;
    const a = (v0 * v0) / (2 * (b[1] - xStopM));
    const stopDur = v0 / a;
    const out: Row[] = [...head];
    let t = b[0];
    for (let tt = 0.05; tt <= stopDur; tt += 0.05) {
      const v = v0 - a * tt;
      out.push([t + tt, b[1] - (v0 * tt - 0.5 * a * tt * tt), b[2], b[3], v * 3.6, b[5], b[6]]);
    }
    t += stopDur;
    for (let tt = 0.1; tt <= waitSec; tt += 0.1) out.push([t + tt, xStopM, b[2], b[3], 0, b[5], b[6]]);
    t += waitSec;
    const line = rows.find((r) => r[0] > 20 && r[4] < 0.5)!;
    const iLine = rows.indexOf(line);
    const creep = 10 / 3.6;
    let x = xStopM;
    while (x > line[1] + 0.05) {
      t += 0.05;
      x = Math.max(line[1], x - creep * 0.05);
      out.push([t, x, b[2], b[3], x === line[1] ? 0 : 10, b[5], b[6]]);
    }
    const shift = t + 0.1 - line[0];
    for (let i = iLine; i < rows.length; i++) out.push([rows[i][0] + shift, ...rows[i].slice(1)] as Row);
    return out;
  }

  it("the box is sx-v1's whole drawn junction and the bound is the signal's clearance interval", () => {
    expect(legs.map((l) => l.name).sort()).toEqual(["pc-L1", "pc-L3", "phone-L1", "phone-L3"]);
    expect(boxes).toEqual([{ id: "sx-n-c", x: 0, y: 0, r: nodeOpenRadiusM(SX.roads.edges as never, 4), signalised: true }]);
    expect(BOX_REST_BOUND_SEC).toBe(5);
  });

  it("driven as recorded, started 0–24 s late (100 cells): no vehicle stands in the box, no ambient pose jumps, no ambient car is touched — and every cell that is not clean is named with its cause", () => {
    const stood: string[] = [];
    const stoodHeldOpen: string[] = [];
    const jumped: string[] = [];
    const touched: string[] = [];
    const notClean: Record<string, string> = {};
    for (const leg of legs) {
      for (let delay = 0; delay <= 24; delay++) {
        // Whom he turned across: on the grid point the runtime calls the left turn a violated priority, the nearest
        // vehicle on the oncoming carriageway west of him and heading east — who it is, the fastest it went in the 6 s
        // before (what it was doing until he was in its way), and whether its own approach had the green or it was
        // already inside the box (either way it was lawfully there).
        const speeds = new Map<number, Array<[number, number]>>();
        let across: { staged: boolean; cruiseMps: number; lawful: boolean } | null = null;
        const w = drive(leg, traceOf([sample(0, leg.rows[0]), ...leg.rows.slice(1).map((r) => sample(r[0] + delay, r))]), ({ t, x, y, events, vehicles }) => {
          if (across) return;
          for (const v of vehicles) {
            let h = speeds.get(v.id);
            if (!h) speeds.set(v.id, (h = []));
            h.push([t, v.speedMps]);
            while (h[0][0] < t - 6) h.shift();
          }
          if (!events.some((e) => e.kind === "prioritySituation" && e.violated === true)) return;
          let near: (typeof vehicles)[number] | null = null;
          for (const v of vehicles) {
            if (v.dirX < 0.7 || v.x >= x || Math.abs(v.y) > 8 || x - v.x > 60) continue;
            if (!near || Math.hypot(v.x - x, v.y - y) < Math.hypot(near.x - x, near.y - y)) near = v;
          }
          if (!near) return;
          across = {
            staged: near.id >= STAGED_STATE_ID_BASE,
            cruiseMps: Math.max(...speeds.get(near.id)!.map((p) => p[1])),
            lawful: near.x > -boxes[0].r || RT.last!.ambientSignalPhase("sx-n-c", 90, "sx-n-w") === "green",
          };
        });
        const cell = `${leg.name}+${delay}`;
        for (const r of w.rests) stood.push(`${cell}: vehicle ${r.vehicle} from t=${r.fromSec} for ${r.sec} s`);
        // …and the same drive with the lesson HELD OPEN for a minute after the tape (round 4).
        const open = drive(leg, traceOf([sample(0, leg.rows[0]), ...leg.rows.slice(1).map((r) => sample(r[0] + delay, r))]), undefined, HELD_OPEN_SEC);
        for (const r of open.rests) stoodHeldOpen.push(`${cell}: vehicle ${r.vehicle} from t=${r.fromSec} for ${r.sec} s`);
        if (w.jumps > 0) jumped.push(`${cell}: ${w.firstJump}`);
        if (w.ambientContacts > 0) touched.push(cell);
        if (w.codes.length === 0) continue;
        // Not clean: the cause, read off the drive — never off the code alone.
        const a = across as { staged: boolean; cruiseMps: number; lawful: boolean } | null;
        const acrossLawfulTraffic = a !== null && a.lawful && a.cruiseMps > AT_REST_MPS;
        const billedByOwnPair = w.billedBy.length > 0 && w.billedBy.every((id) => OWN_ONCOMING_EVENTS.includes(id));
        const droveIntoAStagedCarThatHadStopped =
          w.hit !== null && w.hit.id >= STAGED_STATE_ID_BASE && w.hit.mps < AT_REST_MPS && w.hit.cruiseMps > AT_REST_MPS;
        const parts = [w.codes.join("+")];
        if (w.codes.includes("FAILED_TO_YIELD")) {
          parts.push(
            acrossLawfulTraffic
              ? `turned across ${a!.staged ? "the lesson's own staged oncoming car" : "an ambient oncoming car"}, lawfully there and moving${billedByOwnPair ? "; billed by the lesson's oncoming encounters" : ""}`
              : "UNEXPLAINED YIELD",
          );
        }
        if (w.codes.includes("COLLISION")) {
          parts.push(droveIntoAStagedCarThatHadStopped ? "drove on into the staged car that had stopped for him" : "UNEXPLAINED CONTACT");
        }
        if (parts.length === 1) parts.push("UNEXPLAINED");
        notClean[cell] = parts.join(" | ");
      }
    }
    expect(stood).toEqual([]);
    expect(stoodHeldOpen).toEqual([]);
    expect(jumped).toEqual([]);
    expect(touched).toEqual([]);
    expect(notClean).toEqual(SWEEP_NOT_CLEAN);
    // 80 clean, 18 turned across the pair (billed, not hit), 2 drove on into the car that had stopped for them.
    expect(Object.keys(SWEEP_NOT_CLEAN).length).toBe(20);
    expect(Object.values(notClean).filter((c) => c.startsWith("COLLISION")).length).toBe(2);
    expect(Object.values(notClean).filter((c) => c.includes("UNEXPLAINED"))).toEqual([]);
  }, 2_400_000);

  it("the early-stop band (7 stops × 5 waits × 4 tapes, 140 cells) with the lesson HELD OPEN: nothing stands in the box and no staged car is stranded behind one", () => {
    // The round-3 verifier's second instrument for R3-F2: 6 of these 140 cells froze an ambient left-turner and the
    // staged oncoming car nose to flank in the box (phone-L3 and pc-L3 at 64.5/10, 63/10, 55/15) once the lesson no
    // longer ended 3.5 s later.
    const stood: string[] = [];
    let cells = 0;
    for (const leg of legs) {
      for (const xs of [66, 64.5, 63, 61, 60.2, 59.5, 55]) {
        for (const wait of [10, 15, 20, 30, 45]) {
          cells++;
          const rows = earlyStop(leg.rows, xs, wait);
          const w = drive(leg, traceOf(rows.map((r) => sample(r[0], r))), undefined, HELD_OPEN_SEC);
          for (const r of w.rests) stood.push(`${leg.name} ${xs}/${wait}: vehicle ${r.vehicle} from t=${r.fromSec} for ${r.sec} s`);
        }
      }
    }
    expect(cells).toBe(140);
    expect(stood).toEqual([]);
  }, 2_400_000);

  it("stopped at the line and held for 60 s, at nine start delays (36 cells): the junction clears in front of him", () => {
    const stood: string[] = [];
    for (const leg of legs) {
      for (const delay of [0, 3, 6, 9, 12, 15, 18, 21, 24]) {
        // Up to the tape's first full stop near the line (x 20–40 m, after t = 10 s), then hold.
        let cut = leg.rows.findIndex((r, i) => i > 0 && r[0] > 10 && r[4] < 0.5 && r[1] > 20 && r[1] < 40);
        if (cut < 0) cut = leg.rows.length - 1;
        const samples = [sample(0, leg.rows[0]), ...leg.rows.slice(1, cut + 1).map((r) => sample(r[0] + delay, r))];
        const last = samples[samples.length - 1];
        samples.push({ ...last, tSec: last.tSec + 60, speedKmh: 0 });
        const w = drive(leg, traceOf(samples));
        for (const r of w.rests) stood.push(`${leg.name}+${delay}: vehicle ${r.vehicle} from t=${r.fromSec} for ${r.sec} s`);
      }
    }
    expect(stood).toEqual([]);
  }, 1_200_000);

  /**
   * D6 UNDER THE PROTOCOL (round 4). Round 3 pinned «the head of the oncoming queue stands on its own green for the
   * patience bound and no longer» — and the release it pinned is the one the careful student met in the box (R3-F1).
   * What holds or frees the head now is what the student could do next:
   *   · the tapes hold at the line SIGNALLING LEFT, as the lesson asks: an opposing left-turner is not waiting for a
   *     student whose own left turn passes it, the head never stands, and the staged follow car comes through in every
   *     pc-L3 cell — the lesson's oncoming traffic arrives;
   *   · the same hold with the indicator OFF is a student who may drive straight on: the head left-turner keeps its
   *     line for as long as he stands there (he could be in its path in 4 s, the turn takes 7), with whatever is
   *     queued behind it. That is the protocol's stated cost, pinned here by name so that it is a decision and not a
   *     surprise: `HEAD_KEEPS_ITS_LINE_WHEN_HE_SIGNALS_NOTHING`.
   */
  function holdAtTheLine(indicator: "left" | "off", intoM = 0, delays = [0, 3, 6, 9, 12, 15, 18, 21, 24]): { overBound: string[]; followStuck: string[]; worst: number; pcL3Cells: number } {
    const R = boxes[0].r;
    const overBound: string[] = [];
    const followStuck: string[] = [];
    let worst = 0;
    let pcL3Cells = 0;
    for (const leg of legs) {
      for (const delay of delays) {
        let cut = leg.rows.findIndex((r, i) => i > 0 && r[0] > 10 && r[4] < 0.5 && r[1] > 20 && r[1] < 40);
        if (cut < 0) cut = leg.rows.length - 1;
        const raw = [sample(0, leg.rows[0]), ...leg.rows.slice(1, cut + 1).map((r) => sample(r[0] + delay, r))];
        // Round 9 (verifier R8-F1, its boxwait instrument): from his line he creeps intoM metres into the junction at
        // 5 km/h — the «pull forward and wait for the gap» of a left-turner — and waits there.
        if (intoM > 0) {
          const base = leg.rows[cut];
          let t = base[0] + delay;
          let x = base[1];
          while (x > base[1] - intoM) {
            t += 0.1;
            x = Math.max(base[1] - intoM, x - (5 / 3.6) * 0.1);
            raw.push(sample(t, [t, x, base[2], base[3], x === base[1] - intoM ? 0 : 5, base[5], base[6]]));
          }
        }
        const samples = raw.map((p) => (indicator === "off" ? { ...p, indicator: "off" as const } : p));
        const last = samples[samples.length - 1];
        const holdFrom = last.tSec;
        samples.push({ ...last, tSec: last.tSec + 60, speedKmh: 0 });
        // The oncoming (eastbound) approach: its head is the vehicle nearest the box that has not entered it.
        let head: { id: number; since: number } | null = null;
        const followPassed = new Set<number>();
        const followSeen = new Set<number>();
        drive(leg, traceOf(samples), ({ t, vehicles }) => {
          if (t < holdFrom) return;
          let h: (typeof vehicles)[number] | null = null;
          for (const v of vehicles) {
            if (v.id === FOLLOW_CAR_ID) {
              if (v.x < -R) followSeen.add(v.id);
              else if (v.x > R && followSeen.has(v.id)) followPassed.add(v.id);
            }
            // On the eastbound lane, short of the box, heading east.
            if (v.dirX > 0.7 && v.x < -R && v.x > -R - 60 && Math.abs(v.y + LANE_OFFSET_M) < 1 && (!h || v.x > h.x)) h = v;
          }
          const green = RT.last!.ambientSignalPhase("sx-n-c", 90, "sx-n-w") === "green";
          const standsOnGreen = h !== null && green && h.speedMps < AT_REST_MPS && h.id < STAGED_STATE_ID_BASE;
          if (!standsOnGreen || !h) head = null;
          else if (!head || head.id !== h.id) head = { id: h.id, since: t };
          else {
            const sec = t - head.since;
            if (sec > worst) worst = sec;
            if (sec > HEAD_ON_GREEN_MAX_SEC && !overBound.includes(`${leg.name}+${delay}`)) overBound.push(`${leg.name}+${delay}`);
          }
        });
        if (leg.name === "pc-L3") {
          pcL3Cells++;
          if (!followPassed.has(FOLLOW_CAR_ID)) followStuck.push(`${leg.name}+${delay}`);
        }
      }
    }
    return { overBound, followStuck, worst, pcL3Cells };
  }

  it("D6 — while he holds at his line signalling left, the head of the oncoming queue does not stand on its own green for him, and on pc-L3 the staged follow car passes", () => {
    expect(AMBIENT_YIELD_PATIENCE_SEC).toBe(5);
    const w = holdAtTheLine("left");
    expect(w.pcL3Cells).toBe(9);
    expect(w.overBound).toEqual([]);
    expect(w.followStuck).toEqual([]);
    expect(w.worst).toBeLessThanOrEqual(HEAD_ON_GREEN_MAX_SEC);
  }, 1_200_000);

  /**
   * ROUND 9 (E13; verifier R8-F1). Waiting INSIDE the junction signalling left — pulled 10–24 m past his line — he is
   * waiting exactly as at his line (E1): the oncoming left-turner is released and goes. Round 8 read him there by his
   * room and held it at its waiting point, which lies in its own approach lane: the straight stream he waits for stood
   * behind it (77 of 120 heads over the bound, the staged follow car 0 of 25 from 11 m in).
   */
  it("D6/E13 — waiting INSIDE the junction signalling left (10–24 m past his line), he is waiting as at his line: no head of the oncoming queue stands on its own green past the bound, and on pc-L3 the staged follow car passes", () => {
    for (const intoM of [10, 11, 12, 16, 20, 24]) {
      const w = holdAtTheLine("left", intoM, [0, 6, 12, 18, 24]);
      expect(w.pcL3Cells, "in " + intoM).toBe(5);
      expect(w.overBound, "in " + intoM).toEqual([]);
      expect(w.followStuck, "in " + intoM).toEqual([]);
    }
  }, 1_800_000);

  it("…and signalling nothing he may drive straight on: the head left-turner keeps its line while he stands there — the cells are named", () => {
    const w = holdAtTheLine("off");
    expect(w.overBound.sort()).toEqual(HEAD_KEEPS_ITS_LINE_WHEN_HE_SIGNALS_NOTHING);
    expect(w.followStuck.length).toBe(9);
  }, 1_200_000);
});
/**
 * Measured 2026-10-13 on the round-4 tree (r4/dump/d6-off.json): ALL 36 wait cells — on each of the four tapes the car
 * at the head of the oncoming queue when the student stops is a left-turner — and in all nine pc-L3 cells the staged
 * follow car is queued behind it for the hold. Round 6 (E1): a student who signals NOTHING is never WAITING
 * (`studentWaiting` needs his left indicator), so standing at his line he is read as one who may launch straight on at
 * any instant (P3) — the opposite-arm left-turner keeps its line for him. The list is that, re-measured on the round-6
 * tree: the same 36 cells.
 */
const HEAD_KEEPS_ITS_LINE_WHEN_HE_SIGNALS_NOTHING: string[] = ["pc-L1", "pc-L3", "phone-L1", "phone-L3"]
  .flatMap((leg) => [0, 3, 6, 9, 12, 15, 18, 21, 24].map((d) => `${leg}+${d}`))
  .sort();

/**
 * ROUND 6 (E3; verifier R4-F6) — EVERY COMMITTED DEMO OF THE CATALOGUE, correct AND mistake, at every compiled rung.
 * The catalogue pass above drives the shadow demo only; that gap hid two rests inside a box on a MISTAKE demo
 * (sc-turn-left-oncoming mistake-cut-gap, ambient car 3, 6.1 s and 6.4 s — round 4). Here every demo the catalogue
 * commits is driven as recorded through the live chain, and every vehicle — ambient or staged — that stands
 * (< 0.3 m/s) for BOX_REST_BOUND_SEC or longer inside the carriageway of ANY junction (a node of three arms or more,
 * within the widest half-width of its arms) is named. Measured on the round-6 tree (2,434 drives): the rests are
 *   · the staged circulators of the five roundabout lessons, on every drive of every rung (scripted rests; the same
 *     cells at base), and
 *   · ambient car 5 on sc-ed-d2-priority-run's shadow demo, rungs 1–4 (18.7 s; the unsignalised short-link slot chain
 *     named in the header, SHORT_LINK_SLOT_CHAIN).
 * Nothing else — no ambient vehicle in any signalised junction, and no rest on any mistake demo.
 */
const STAGED_ROUNDABOUT_RESTS = ["sc-rb-busy-gap", "sc-rb-exit-signal", "sc-rb-lane-choice", "sc-rb-ped-exit", "sc-roundabout-entry"];
const AMBIENT_REST_DRIVES = [1, 2, 3, 4].map((l) => `sc-ed-d2-priority-run L${l} shadow-correct.trace.json: car 5`);

describe("every committed demo of the catalogue, correct and mistake (round 6, E3)", () => {
  it("nothing stands in a junction's carriageway for the bound but the scripted roundabout circulators and the named short-link chain", () => {
    const carriageways = new Map<string, Array<{ x: number; y: number; r: number; signalised: boolean }>>();
    let drives = 0;
    let mistakeDrives = 0;
    const ambient: string[] = [];
    const staged = new Map<string, number>();
    const stagedInSignalised: string[] = [];
    for (const spec of SCENARIO_TEMPLATES) {
      const raw = loadDistrict(spec.map.districtId);
      let boxes = carriageways.get(spec.map.districtId);
      if (!boxes) {
        const net = analyzeNetwork(raw as never);
        const widths = new Map<string, number[]>();
        for (const eb of net.edges) {
          const e = eb.edge as unknown as { from: string; to: string };
          for (const id of [e.from, e.to]) widths.set(id, [...(widths.get(id) ?? []), eb.halfWidth]);
        }
        const nodes = (raw as { roads: { nodes: Array<{ id: string; x: number; y: number }> } }).roads.nodes;
        const lamps = new Set((raw as RawDistrict).intersections.filter((i) => i.signalized).map((i) => i.id));
        boxes = nodes
          .filter((n) => (widths.get(n.id) ?? []).length >= 3)
          .map((n) => ({ x: n.x, y: n.y, r: Math.max(...widths.get(n.id)!), signalised: lamps.has(n.id) }));
        carriageways.set(spec.map.districtId, boxes);
      }
      const demos = [spec.shadow?.path, ...(spec.mistakes ?? []).map((m) => m.traceRef.path)].filter((p): p is string => !!p);
      for (const lv of spec.levels ?? []) {
        let lesson;
        try {
          lesson = compileScenario(spec, lv.level as ScenarioLevel);
        } catch {
          continue;
        }
        for (const p of demos) {
          const trace = parseScenarioTrace(JSON.parse(readFileSync(path.join(REPO_ROOT, p), "utf-8")))!;
          drives++;
          if (p !== spec.shadow?.path) mistakeDrives++;
          const still = new Map<number, number>();
          const longest = new Map<number, number>();
          const where = new Map<number, boolean>();
          liveChainReplay({
            lesson,
            districtRaw: raw,
            trace,
            afterApply: ({ t, traffic }) => {
              for (const v of traffic.vehicles) {
                const box = Math.abs(v.speedMps) < AT_REST_MPS ? boxes!.find((b) => (b.x - v.x) ** 2 + (b.y - v.y) ** 2 < b.r * b.r) : undefined;
                if (!box) {
                  still.delete(v.id);
                  continue;
                }
                const s0 = still.get(v.id);
                if (s0 === undefined) still.set(v.id, t);
                else if (t - s0 > (longest.get(v.id) ?? 0)) {
                  longest.set(v.id, t - s0);
                  where.set(v.id, box.signalised);
                }
              }
            },
          });
          for (const [id, sec] of longest) {
            if (sec < BOX_REST_BOUND_SEC) continue;
            const cell = `${spec.id} L${lv.level} ${path.basename(p)}`;
            if (id >= STAGED_STATE_ID_BASE) {
              staged.set(spec.id, (staged.get(spec.id) ?? 0) + 1);
              if (where.get(id)) stagedInSignalised.push(`${cell}: staged ${id}`);
            }
            else ambient.push(`${cell}: car ${id}`);
          }
        }
      }
    }
    expect(drives).toBeGreaterThanOrEqual(2434);
    expect(mistakeDrives).toBeGreaterThan(drives / 2);
    expect(ambient.sort()).toEqual(AMBIENT_REST_DRIVES);
    expect([...staged.keys()].sort()).toEqual(STAGED_ROUNDABOUT_RESTS);
    // …standing in an UNSIGNALISED box (the roundabout), never in a signalised one.
    expect(stagedInSignalised).toEqual([]);
  }, 1_800_000);
});

/**
 * ROUND 6 (E1, E2) — THE OFFICER'S JUNCTION WITH HIS LEFT INDICATOR ON, DRIVING STRAIGHT ON «proceed». Round 4's
 * release trusted the indicator and was struck 116 times on the verifier's 1,378-cell grid (R4-F1). Under E1 a student
 * who signals left is WAITING only while his car is at rest or can still stop short of his own line at the fleet's
 * comfortable deceleration; the car let in while he waits holds at its WAITING POINT, clear of his lane, if he becomes
 * COMING before it gets there (D3).
 *
 * E2 — such a hold is bounded by the coming vehicle's PASSAGE, not by BOX_REST_BOUND_SEC. Round 7 (E5/E6): it is a
 * hold only while the product holds the car FOR a body (`waitingPointHoldFor`) that is coming, and it must be seen to
 * end within the car's launch + one step after that body is the product's restart distance clear of the rest of its
 * path (STUDENT_PATH_SEP_M) — or has turned off it, or stopped (`HoldLedger`). Every other rest in the drawn junction
 * still counts against BOX_REST_BOUND_SEC. The first grid is the verifier's, on the two rungs whose cells were struck
 * most (sc-signal-controller L1, sc-sig-controller-postures L3), stops at the line and 3 m short, go every half second
 * from 30 to 40 s (the flip is at 30); the two after it are the verifier's round-6 speed and timid grids (R6-F1).
 */
/**
 * ROUND 7 (E5) — THE PASSAGE BOUND IS A DISTANCE. A car holding at its waiting point for a coming body goes again on the
 * first step at which that body is the product's own RESTART DISTANCE clear of the rest of its path — the clearance the
 * gate reads it at (traffic/vehicles.ts `STUDENT_PATH_SEP_M`, 5.8 m, for the student; `stagedPathSepM` for a staged
 * car), not this file's GATE_SEP_M (4.925 m) — and is then SEEN moving once it has launched to AT_REST_MPS. Round 6
 * allowed a fixed 0.5 s after the GATE_SEP_M clearing, which holds only at about 20 km/h and above (verifier R6-F1:
 * 1.33 s at 6 km/h — the restart is triggered by distance, so in seconds it grows as he slows down). The ledger below
 * therefore reads «coming» AT the restart distance, and a hold must be seen to end within the launch plus one grid step
 * after it. The launch is derived and is a test tolerance, not a product constant: rest to AT_REST_MPS at the fleet's
 * acceleration (0.3 / 1.8 = 0.167 s).
 */
const HOLD_LAUNCH_SEC = AT_REST_MPS / DEFAULT_TRAFFIC_CONFIG.accelMps2;
/** E5's allowance after the restart distance: the launch + the one step on which the product reads the body clear. */
const HOLD_END_AFTER_CLEAR_SEC = HOLD_LAUNCH_SEC + STEP_SEC + 1e-6;

/** A body a waiting-point hold is FOR (E6), as one grid point shows it. */
interface HoldBody {
  x: number;
  y: number;
  dx: number;
  dy: number;
  moving: boolean;
  /** The product's restart distance for this body (E5). */
  sep: number;
  /** The product's body clamp for it: standing closer than this to the path, it blocks the car physically. */
  bodySep: number;
  /** The student (E10 reads his standing in the junction), not a staged car. */
  student: boolean;
}
type HoldVehicle = { id: number; x: number; y: number; dirX: number; dirY: number; speedMps: number; profile?: TrafficVehicleState["profile"] };
/** The bodies the product holds a car at its waiting point for on this grid point (E6) — read from it, never guessed. */
function holdBodies(
  forIds: readonly number[] | null,
  tick: { position: { x: number; y: number }; headingDeg: number; speedKmh: number },
  vehicles: ReadonlyArray<HoldVehicle>,
): HoldBody[] {
  const out: HoldBody[] = [];
  if (forIds === null) return out;
  for (const id of forIds) {
    if (id === WAITING_HOLD_STUDENT) {
      const h = (tick.headingDeg * Math.PI) / 180;
      out.push({
        x: tick.position.x,
        y: tick.position.y,
        dx: Math.sin(h),
        dy: Math.cos(h),
        moving: tick.speedKmh / 3.6 > PLAYER_STANDING_MAX_MPS,
        sep: STUDENT_PATH_SEP_M,
        bodySep: VEHICLE_LENGTH_M + 0.5,
        student: true,
      });
      continue;
    }
    const o = vehicles.find((v) => v.id === id);
    if (!o) continue;
    out.push({ x: o.x, y: o.y, dx: o.dirX, dy: o.dirY, moving: o.speedMps > AT_REST_MPS, sep: stagedPathSepM(o.profile), bodySep: stagedPathSepM(o.profile) - 1, student: false });
  }
  return out;
}
/**
 * ROUND 7 (E6) — THE LEDGER OF ONE REST AT A WAITING POINT. A grid point is EXCUSED while a body the product holds the
 * car for is COMING: moving, and within its restart distance of the rest of the car's path, or heading at it (some of
 * the path ahead of it within that distance of its line). After the last such point the hold must be seen to end within
 * HOLD_END_AFTER_CLEAR_SEC — whether that body passed, turned off the path or stopped — except while a stopped body
 * stands within the product's body clamp of the path (it blocks the car physically; that time counts as a rest). Every
 * point not excused counts against BOX_REST_BOUND_SEC, exactly like any other rest. Round 6's watcher excused a hold
 * while ANY moving vehicle's heading line passed near the path at ANY distance (verifier R6-C1) — gone.
 *
 * ROUND 8 (E10) — A WAIT BOUNDED BY HIS STANDING IS NOT A FREEZE. A point is excused too while the STUDENT, one of the
 * bodies the product holds the car for, STANDS in the junction — at rest (the product's standing threshold), his nose
 * past his own stop line (read like the fleet reads it: the node along his heading, less the cut radius,
 * STOP_LINE_BEYOND_CUT_M and half a car) — with the rest of the path ahead of him within his restart distance (E9: he
 * could drive straight into it). That is exactly whom E9 holds a car for, and only for as long as he stands there: when
 * he moves off he is coming (above) until he is clear, turns away or stops again; at his line or short of it he is not
 * «in the junction», and a staged car standing anywhere is never excused this way.
 *
 * ROUND 9 (E15) — THE HOLD'S FOLLOWERS. A vehicle queued behind a hold this ledger excuses (its leader, or its leader's
 * leader…, is that car while it stands — just ahead of it in its lane, or, for a car standing at its own line, across
 * the junction in its corridor: P1 holds it there while that body stands on its path) is excused for as long as that hold is, and is judged by the hold's own bound:
 * it must be moving again within the queue's restart lag (QUEUE_RESTART_SEC, the product's IDM) after its own leader
 * moves off — so the last car of the queue is moving within the hold's allowance plus one lag per car ahead of it.
 * officerLeftGrid keeps that account (followers / worstFollowerTail / followerOver).
 */
class HoldLedger {
  lastComing: number | null = null;
  /** Grid seconds excused because the student stood in the junction within reach (E10). */
  standSec = 0;
  /** Grid seconds excused at all — a body coming, or the student standing in the junction. */
  excusedSec = 0;
  /** Round 9 (E15): was the last grid point excused (a body coming, or the student standing in the junction)? */
  excusedNow = false;
  private firstClear: number | null = null;
  private clearBlocked = false;
  private unexcused = 0;
  constructor(
    private readonly t0: number,
    private readonly w: WaitingPoint,
  ) {}
  private onPath(b: HoldBody, sep: number, ahead: boolean): boolean {
    return this.w.rest.some((q) => {
      const rx = q.x - b.x;
      const ry = q.y - b.y;
      return Math.hypot(rx, ry) < sep || (ahead && rx * b.dx + ry * b.dy > 0 && Math.abs(rx * b.dy - ry * b.dx) < sep);
    });
  }
  /** E10: is this body the student, standing with his nose past his own line at the junction of this waiting point? */
  private standsInJunction(b: HoldBody): boolean {
    if (!b.student || b.moving) return false;
    const toLine = (this.w.node.x - b.x) * b.dx + (this.w.node.y - b.y) * b.dy - this.w.lineM;
    return toLine < 0;
  }
  step(t: number, dt: number, bodies: HoldBody[]): void {
    const standing = bodies.some((b) => this.standsInJunction(b) && this.onPath(b, b.sep, true));
    if (standing) this.standSec += dt;
    const coming = bodies.some((b) => b.moving && this.onPath(b, b.sep, true));
    this.excusedNow = standing || coming;
    if (standing || coming) this.excusedSec += dt;
    if (standing || coming) {
      this.lastComing = t;
      this.firstClear = null;
      this.clearBlocked = false;
      return;
    }
    if (this.lastComing !== null && this.firstClear === null) this.firstClear = t;
    if (bodies.some((b) => !b.moving && this.onPath(b, b.bodySep, false))) this.clearBlocked = true;
    const grace = this.firstClear !== null && t <= this.firstClear + HOLD_END_AFTER_CLEAR_SEC;
    if (!grace && t > this.t0) this.unexcused += dt;
  }
  /** At the rest's end: the time from the last coming point to the end, whether that is past E5's bound, the unexcused time. */
  verdict(tEnd: number, censored: boolean): { tailSec: number; overPassageSec: number | null; unexcusedSec: number } {
    if (this.firstClear === null) return { tailSec: 0, overPassageSec: null, unexcusedSec: this.unexcused };
    const tail = tEnd - this.firstClear;
    const over = !censored && !this.clearBlocked && tail > HOLD_END_AFTER_CLEAR_SEC ? tail - HOLD_END_AFTER_CLEAR_SEC : null;
    return { tailSec: tail, overPassageSec: over, unexcusedSec: this.unexcused };
  }
}

/** A waiting point (D3) of a signalised movement and the rest of that movement's path from it (connector + half a car). */
interface WaitingPoint {
  at: { x: number; y: number };
  rest: Array<{ x: number; y: number }>;
  /** The junction node and how far behind it (along a driver's heading) a nose is on its own stop line (E10). */
  node: { x: number; y: number };
  lineM: number;
}
const waitingPointCache = new WeakMap<object, WaitingPoint[]>();
/** Every waiting point of a district's signalised movements, read off the built graph like the fleet reads it. */
function waitingPointsOf(raw: unknown): WaitingPoint[] {
  let pts = waitingPointCache.get(raw as object);
  if (pts) return pts;
  pts = [];
  const g = buildLaneGraph(raw as TrafficDistrict, { laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM, excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses, crossingSignalRadiusM: 45 });
  const p = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };
  const ixs = (raw as { intersections: Array<{ id: string; x: number; y: number }> }).intersections;
  for (const lk of g.lanes) {
    if (lk.endSignalNodeId === null) continue;
    const ix = ixs.find((i) => i.id === lk.toNode);
    if (!ix) continue;
    const lineM = (g.junctionRadiusM.get(lk.toNode) ?? 0) + STOP_LINE_BEYOND_CUT_M + VEHICLE_LENGTH_M / 2;
    for (const nk of g.lanes) {
      if (nk.fromNode !== lk.toNode) continue;
      const w = waitingPointArc(g, DEFAULT_TRAFFIC_CONFIG, lk, nk);
      if (!Number.isFinite(w)) continue;
      const ck = laneConnector(g, lk, nk);
      const rest: Array<{ x: number; y: number }> = [];
      for (let a = w; a <= ck.length; a += 0.25) {
        sampleLane(ck, a, 0, p);
        rest.push({ x: p.x, y: p.y });
      }
      sampleLane(nk, Math.min(nk.length, ck.entryS + VEHICLE_LENGTH_M / 2), 0, p);
      rest.push({ x: p.x, y: p.y });
      pts.push({ at: rest[0], rest, node: { x: ix.x, y: ix.y }, lineM });
    }
  }
  waitingPointCache.set(raw as object, pts);
  return pts;
}
/** The gate's clamp separation for two fleet-length bodies (vehicles.ts studentHoldsBox `sep`). */
const GATE_SEP_M = VEHICLE_LENGTH_M + 0.5 + 0.125;

/** A standing vehicle this far ahead of a standing car (centre to centre) in its own lane makes it a queue follower, m: a fleet car's length + the IDM's standstill gap, rounded up. */
const QUEUE_GAP_M = 8;
/** …and within half a lane of its line, m (a leader already turning off at its waiting point stands ~2 m aside). */
const QUEUE_LATERAL_M = DEFAULT_TRAFFIC_CONFIG.laneWidthM / 2;
/**
 * ROUND 8 (E10, verifier R7-C1) — IS THE STUDENT THE HEAD OF THIS STANDING CAR'S QUEUE? He is just ahead of it (centre
 * within QUEUE_GAP_M along its heading), travelling its way, in the corridor the fleet itself stops for him in (its
 * «player ahead» test: DEFAULT_TRAFFIC_CONFIG.playerLateralM) — standing or creeping. A car queued behind him is
 * judged by him, as a follower is judged by a standing vehicle ahead of it.
 */
function queuedBehindStudent(v: { x: number; y: number; dirX: number; dirY: number }, tick: { position: { x: number; y: number }; headingDeg: number }): boolean {
  const hr = (tick.headingDeg * Math.PI) / 180;
  const ax = tick.position.x - v.x;
  const ay = tick.position.y - v.y;
  const along = ax * v.dirX + ay * v.dirY;
  const sameWay = Math.sin(hr) * v.dirX + Math.cos(hr) * v.dirY > 0.7;
  return sameWay && along > 0 && along < QUEUE_GAP_M && Math.abs(ax * v.dirY - ay * v.dirX) < DEFAULT_TRAFFIC_CONFIG.playerLateralM;
}
/**
 * ROUND 9 (E15) — THE QUEUE'S RESTART LAG, s: how long after a standing leader starts to move (passes AT_REST_MPS) the
 * car queued behind it at the product's standstill gap (cfg.minGapM) does the same, with both driven by the fleet's own
 * IDM (vehicles.ts idmTerm / updateVehicle: cfg.accelMps2, comfortDecelMps2, headwaySec, minGapM, IDM delta 4, the
 * clampAcc ceiling) at the grid step. Derived, not chosen: 0.867 s with DEFAULT_TRAFFIC_CONFIG — plus one grid step for
 * the fleet's update order (a follower stepped before its leader sees the leader's previous step) and one for where the
 * census reads each rest's end: 0.900 s. (Measured on the pin below: car 0 behind car 2, 0.900 s.)
 */
function queueRestartLagSec(): number {
  const c = DEFAULT_TRAFFIC_CONFIG;
  const clamp = (x: number): number => Math.min(c.accelMps2, Math.max(-c.hardDecelMps2, x));
  let xl = 0;
  let vl = 0;
  let xf = -c.minGapM;
  let vf = 0;
  let tl: number | null = null;
  for (let k = 1; k <= 600; k++) {
    const al = clamp(c.accelMps2 * (1 - Math.pow(vl / c.maxSpeedMps, 4)));
    const sStar = c.minGapM + Math.max(0, vf * c.headwaySec + (vf * (vf - vl)) / (2 * Math.sqrt(c.accelMps2 * c.comfortDecelMps2)));
    const af = clamp(c.accelMps2 * (1 - Math.pow(vf / c.maxSpeedMps, 4) - Math.pow(sStar / Math.max(xl - xf, 0.01), 2)));
    vl = Math.max(0, vl + al * STEP_SEC);
    xl += vl * STEP_SEC;
    vf = Math.max(0, vf + af * STEP_SEC);
    xf += vf * STEP_SEC;
    if (tl === null && vl >= AT_REST_MPS) tl = k * STEP_SEC;
    if (vf >= AT_REST_MPS) return k * STEP_SEC - (tl as number);
  }
  return Infinity;
}
const QUEUE_RESTART_SEC = queueRestartLagSec() + 2 * STEP_SEC + 1e-6;
/** How far beyond the drawn radius a queue behind a hold in the box is followed, m (two queue gaps: R8-C2's car 0 at its line). */
const FOLLOW_REACH_M = 2 * QUEUE_GAP_M;
/** A body the E15 follower relation reads (a fleet vehicle's state, or a bench stand-in for one). */
interface QueueCar {
  id: number;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
}
/**
 * ROUND 9 (E15) — the standing vehicles whose queues the census follows: at rest, within FOLLOW_REACH_M beyond the
 * drawn radius of the junction node at the origin. (Extracted unchanged from officerLeftGrid at the landing, so the
 * relation's NEGATIVE cases can be pinned — verifier R9-C3, VR9_FOLLOW_REACH_WIDE.)
 */
function standingNearJunction<T extends QueueCar>(vehicles: readonly T[], radius: number): T[] {
  return vehicles.filter((u) => u.speedMps < AT_REST_MPS && Math.hypot(u.x, u.y) < radius + FOLLOW_REACH_M);
}
/**
 * ROUND 9 (E15) — WHO THIS STANDING CAR FOLLOWS: the nearest standing vehicle just ahead of it in its own lane (within
 * QUEUE_GAP_M along its heading, QUEUE_LATERAL_M of its line) — or, with nothing standing just ahead, the nearest car
 * across the junction in its corridor that stands at a waiting point (`open` holds it with a ledger). Nothing else
 * across the junction is a leader. (Extracted unchanged from officerLeftGrid at the landing — verifier R9-C3,
 * VR9_FOLLOW_ACROSS_ANY.)
 */
function followLeaderOf(v: QueueCar, near: readonly QueueCar[], open: ReadonlyMap<number, { readonly ledger: unknown }>, radius: number): number | null {
  let best = QUEUE_GAP_M;
  let lead: number | null = null;
  for (const u of near) {
    if (u.id === v.id) continue;
    const along = (u.x - v.x) * v.dirX + (u.y - v.y) * v.dirY;
    if (along > 0 && along < best && Math.abs((u.x - v.x) * v.dirY - (u.y - v.y) * v.dirX) < QUEUE_LATERAL_M) {
      best = along;
      lead = u.id;
    }
  }
  // …or, with nothing standing just ahead, a car held at its waiting point across the junction in this car's own
  // corridor: standing at its line, this car is held there by P1 because that body stands on its path (R8-C2's
  // north-arm cars, waiting at their line behind the turner held for the student).
  if (lead === null) {
    let far = 2 * radius;
    for (const u of near) {
      const hu = open.get(u.id);
      if (u.id === v.id || hu === undefined || hu.ledger === null) continue;
      const along = (u.x - v.x) * v.dirX + (u.y - v.y) * v.dirY;
      if (along > 0 && along < far && Math.abs((u.x - v.x) * v.dirY - (u.y - v.y) * v.dirX) < QUEUE_LATERAL_M) {
        far = along;
        lead = u.id;
      }
    }
  }
  return lead;
}

/** One drive of the officer-junction grids below: a careful student signalling left, straight on «proceed». */
interface LeftCell {
  id: string;
  level: number;
  stopY: number;
  go: number;
  vGoKmh: number;
  aGo: number;
  /** Round 8 (E10/E12): what he signals (default left), and from his go on (the verifier's R7-F1 cancellation). */
  indicator?: "off" | "left" | "right";
  indicatorFromGo?: "off" | "left" | "right";
  /** Round 8: he stops again inside the junction with his centre at this y, stands holdSec, then drives straight on. */
  boxY?: number;
  holdSec?: number;
}
/**
 * Round 8 — the verifier's BOXSTOP tape (its round-6/7 probe, VAR=boxstop): the careful approach to his line at 30 km/h,
 * a stand there until his go time, then straight on at his go acceleration, a stop at 3 m/s² with his centre at
 * boxY inside the junction, a stand of holdSec, and straight on again. indicatorFromGo replaces what he signals
 * from the moment he sets off (R7-F1: left at his line, cancelled at go).
 */
function boxstopTrace(c: LeftCell): ScenarioTrace {
  const samples: unknown[] = [];
  const dt = 0.05;
  const vMax = 30 / 3.6;
  const vGo = c.vGoKmh / 3.6;
  const boxY = c.boxY as number;
  let y = -105;
  let v = 0;
  let phase: "approach" | "hold" | "go" | "brake2" | "hold2" | "go2" = "approach";
  let hold2Until = -1;
  let switched = false;
  for (let t = 0; y < 70 && t < 220; t += dt) {
    if (phase === "approach") {
      const d = c.stopY - y;
      v = d <= (v * v) / 3 + 0.05 ? Math.max(0, v - 1.5 * dt) : Math.min(vMax, v + 1.5 * dt);
      if (v === 0 && d < 1) phase = "hold";
    } else if (phase === "hold") {
      if (t >= c.go) phase = "go";
    } else if (phase === "go") {
      v = Math.min(vGo, v + c.aGo * dt);
      if (boxY - y <= (v * v) / 6 + 0.05) phase = "brake2";
    } else if (phase === "brake2") {
      v = Math.max(0, v - 3 * dt);
      if (v === 0) {
        phase = "hold2";
        hold2Until = t + (c.holdSec ?? 0);
      }
    } else if (phase === "hold2") {
      v = 0;
      if (t >= hold2Until) phase = "go2";
    } else v = Math.min(vGo, v + c.aGo * dt);
    if (phase === "go") switched = true;
    const indicator = switched && c.indicatorFromGo !== undefined ? c.indicatorFromGo : (c.indicator ?? "left");
    samples.push({ tSec: +t.toFixed(4), x: 4.0625, y, headingDeg: 0, steerRad: 0, speedKmh: v * 3.6, gear: 1, indicator, brakeOn: v === 0 || phase === "brake2", throttleOn: v > 0 && phase !== "brake2" });
    y += v * dt;
  }
  return { meta: { scenarioId: c.id, kind: "attempt", version: 1, durationSec: (samples[samples.length - 1] as { tSec: number }).tSec }, samples, events: [] } as unknown as ScenarioTrace;
}
/**
 * Drive `cells` and read every rest in the drawn junction with the round-7 ledger (E5/E6): a rest at a waiting point is
 * a hold only while the product holds it FOR a body that is coming, and must be seen to end within the launch + one
 * step after that body is the product's restart distance clear (or has turned off the path, or stopped); every other
 * rest counts against BOX_REST_BOUND_SEC.
 */
function officerLeftGrid(cells: LeftCell[]): { lawful: number; struck: string[]; overBound: string[]; holds: number; longestHold: number; longestTail: number; perSpeed: Map<number, { holds: number; longest: number; tail: number }>; standHolds: number; longestStandHold: number; longestStandSec: number; worstStandExcess: number; queueRests: number; longestQueueRest: number; worstQueueExcess: number; followers: string[]; longestFollowerRest: number; worstFollowerTail: number; followerOver: string[] } {
  const g = buildLaneGraph(loadDistrict("sx-v1") as TrafficDistrict, { laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM, excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses, crossingSignalRadiusM: 45 });
  const radius = g.junctionRadiusM.get("sx-n-c")!;
  const struck: string[] = [];
  const overBound: string[] = [];
  const perSpeed = new Map<number, { holds: number; longest: number; tail: number }>();
  let lawful = 0;
  let holds = 0;
  let longestHold = 0;
  let longestTail = 0;
  // E10 — the holds and queue rests excused by his standing, and by how much each outlasts his standing (+ the allowance).
  let standHolds = 0;
  let longestStandHold = 0;
  let longestStandSec = 0;
  let worstStandExcess = -Infinity;
  let queueRests = 0;
  let longestQueueRest = 0;
  let worstQueueExcess = -Infinity;
  // E15 — the followers of an excused hold: each named, its rest, and how long after its own leader moved it moved.
  const followers: string[] = [];
  const followerOver: string[] = [];
  let longestFollowerRest = 0;
  let worstFollowerTail = -Infinity;
  for (const c of cells) {
    const spec = SCENARIO_TEMPLATES.find((s) => s.id === c.id)!;
    let lesson;
    try {
      lesson = compileScenario(spec, c.level as ScenarioLevel);
    } catch {
      continue;
    }
    const raw = loadDistrict(spec.map.districtId);
    const points = waitingPointsOf(raw);
    const cell =
      `${c.id} L${c.level} stop ${c.stopY} go ${c.go} ${c.vGoKmh} km/h at ${c.aGo} m/s²` +
      (c.boxY !== undefined ? ` box ${c.boxY} for ${c.holdSec} s` : "") +
      (c.indicator !== undefined ? ` ${c.indicator}` : "") +
      (c.indicatorFromGo !== undefined ? `→${c.indicatorFromGo}` : "");
    const open = new Map<number, { t0: number; ledger: HoldLedger | null; alone: number; behindHim: number; lastBehind: number }>();
    let lastT = 0;
    const close = (vid: number, t: number, censored: boolean): void => {
      const o = open.get(vid)!;
      open.delete(vid);
      const sec = t - o.t0;
      if (o.behindHim > 0) {
        queueRests++;
        longestQueueRest = Math.max(longestQueueRest, sec);
        // How long it stood on after he was no longer just ahead of it, beyond E5's allowance.
        if (!censored) worstQueueExcess = Math.max(worstQueueExcess, t - o.lastBehind - HOLD_END_AFTER_CLEAR_SEC);
      }
      if (o.ledger !== null && o.ledger.lastComing !== null) {
        const v = o.ledger.verdict(t, censored);
        if (o.ledger.standSec > 0) {
          standHolds++;
          longestStandHold = Math.max(longestStandHold, sec);
          longestStandSec = Math.max(longestStandSec, o.ledger.standSec);
          if (!censored) worstStandExcess = Math.max(worstStandExcess, sec - o.ledger.excusedSec - HOLD_END_AFTER_CLEAR_SEC);
        }
        holds++;
        longestHold = Math.max(longestHold, sec);
        if (!censored) longestTail = Math.max(longestTail, v.tailSec);
        const ps = perSpeed.get(c.vGoKmh) ?? { holds: 0, longest: 0, tail: 0 };
        ps.holds++;
        ps.longest = Math.max(ps.longest, sec);
        if (!censored) ps.tail = Math.max(ps.tail, v.tailSec);
        perSpeed.set(c.vGoKmh, ps);
        if (v.overPassageSec !== null) overBound.push(`${cell}: car ${vid} held at its waiting point ${sec.toFixed(2)} s, ${v.tailSec.toFixed(2)} s after its body was no longer coming`);
        else if (v.unexcusedSec > BOX_REST_BOUND_SEC) overBound.push(`${cell}: car ${vid} held at its waiting point ${sec.toFixed(2)} s, ${v.unexcusedSec.toFixed(2)} s of it with no body coming`);
      } else if (o.ledger !== null && o.alone >= BOX_REST_BOUND_SEC) {
        // At a waiting point with no body the product held it for ever coming, and not queued: a rest like any other.
        overBound.push(`${cell}: car ${vid} stood ${sec.toFixed(2)} s at its waiting point from ${o.t0.toFixed(2)} with no body coming`);
      } else if (o.ledger === null && o.alone >= BOX_REST_BOUND_SEC) overBound.push(`${cell}: car ${vid} stood ${sec.toFixed(2)} s in the junction from ${o.t0.toFixed(2)}, ${o.alone.toFixed(2)} s of it not queued behind a standing car`);
    };
    // E15 bookkeeping: when each vehicle near the junction last stopped standing, and the followers of an excused hold.
    const wasStanding = new Set<number>();
    const restEnd = new Map<number, number>();
    const follow = new Map<number, { t0: number; leader: number; head: number; excusedSec: number; leaderEndAt: number | null }>();
    const out = liveChainReplay({
      lesson,
      districtRaw: raw,
      trace: c.boxY !== undefined ? boxstopTrace(c) : carefulTrace(c.go, c.id, c.stopY, c.indicator ?? "left", c.vGoKmh, c.aGo),
      afterApply: ({ t, tick, traffic }) => {
        const dt = t - lastT;
        lastT = t;
        // ROUND 9 (E15) — who is queued behind whom, near the junction, this grid point; the chain is followed to its head.
        const near = standingNearJunction(traffic.vehicles, radius);
        const nowStanding = new Set(near.map((u) => u.id));
        for (const id of wasStanding) if (!nowStanding.has(id)) restEnd.set(id, t);
        const leaderOf = new Map<number, number>();
        for (const v of near) {
          if (v.id >= STAGED_STATE_ID_BASE) continue;
          const lead = followLeaderOf(v, near, open, radius);
          if (lead !== null) leaderOf.set(v.id, lead);
        }
        for (const v of near) {
          const lead = leaderOf.get(v.id);
          if (lead === undefined) continue;
          let head = lead;
          for (let k = 0; k < 12 && leaderOf.has(head); k++) head = leaderOf.get(head) as number;
          const ho = open.get(head);
          const excusedHold = ho !== undefined && ho.ledger !== null && ho.ledger.excusedNow;
          let fo = follow.get(v.id);
          if (!fo && excusedHold) follow.set(v.id, (fo = { t0: t, leader: lead, head, excusedSec: 0, leaderEndAt: null }));
          if (fo) {
            fo.leader = lead;
            if (excusedHold) fo.excusedSec += dt;
          }
        }
        for (const [id, fo] of [...follow]) {
          if (nowStanding.has(id)) continue;
          // It moves off: judged by its leader's restart (the hold's own bound for the first follower, chained after it).
          follow.delete(id);
          const le = nowStanding.has(fo.leader) ? null : (restEnd.get(fo.leader) ?? null);
          const tail = le === null ? -Infinity : t - le;
          const rest = t - fo.t0;
          const name = `${cell}: car ${id} behind ${fo.leader} (head ${fo.head}) stood ${rest.toFixed(2)} s, ${fo.excusedSec.toFixed(2)} s of it behind the excused hold, moved ${Number.isFinite(tail) ? tail.toFixed(3) : "before its leader"} s after its leader`;
          followers.push(name);
          longestFollowerRest = Math.max(longestFollowerRest, rest);
          if (Number.isFinite(tail)) worstFollowerTail = Math.max(worstFollowerTail, tail);
          if (tail > QUEUE_RESTART_SEC) followerOver.push(name);
        }
        wasStanding.clear();
        for (const id of nowStanding) wasStanding.add(id);
        for (const v of traffic.vehicles) {
          if (v.id >= STAGED_STATE_ID_BASE) continue;
          const resting = v.speedMps < AT_REST_MPS && Math.hypot(v.x, v.y) < radius;
          if (!resting) {
            if (open.has(v.id)) close(v.id, t, false);
            continue;
          }
          let o = open.get(v.id);
          if (!o) {
            const w = points.find((p) => Math.hypot(v.x - p.at.x, v.y - p.at.y) < 3) ?? null;
            open.set(v.id, (o = { t0: t, ledger: w !== null ? new HoldLedger(t, w) : null, alone: 0, behindHim: 0, lastBehind: t }));
          }
          const forIds = o.ledger !== null ? waitingPointHoldFor(v as TrafficVehicleState) : null;
          if (o.ledger !== null && forIds !== null) o.ledger.step(t, dt, holdBodies(forIds, tick, traffic.vehicles));
          // A car standing in a queue — another standing vehicle just ahead of it in its own lane — is judged by the
          // queue's head (a follower of a waiting-point hold waits as long as that hold, and no longer). Round 8: so is a
          // car that stands where a waiting point is but that the product holds for nobody (R7-C1: the student's own
          // follower, queued behind him at the north-bound left turn's waiting point).
          else if (!traffic.vehicles.some((u) => u.id !== v.id && u.speedMps < AT_REST_MPS && (u.x - v.x) * v.dirX + (u.y - v.y) * v.dirY > 0 && (u.x - v.x) * v.dirX + (u.y - v.y) * v.dirY < QUEUE_GAP_M && Math.abs((u.x - v.x) * v.dirY - (u.y - v.y) * v.dirX) < QUEUE_LATERAL_M)) {
            // Round 8 (E10, R7-C1): …or the STUDENT is that head (`queuedBehindStudent`). It waits as long as he is
            // there, and no longer.
            if (queuedBehindStudent(v, tick)) {
              o.behindHim += dt;
              o.lastBehind = t;
            }
            else {
              o.alone += dt;
              if (o.ledger !== null) o.ledger.step(t, dt, []);
            }
          }
        }
      },
    });
    for (const vid of [...open.keys()]) close(vid, lastT, true);
    const signalOk = !out.violationCodes.some((code) => /CONTROLLER_SIGNAL_VIOLATED|RED_LIGHT|RED_YELLOW|STOP_LINE/.test(code));
    if (signalOk) {
      lawful++;
      if (out.violationCodes.includes("COLLISION") || out.ambientContacts.length > 0) struck.push(cell);
    }
  }
  return { lawful, struck, overBound, holds, longestHold, longestTail, perSpeed, standHolds, longestStandHold, longestStandSec, worstStandExcess, queueRests, longestQueueRest, worstQueueExcess, followers, longestFollowerRest, worstFollowerTail, followerOver };
}

describe("the officer's junction with his left indicator on (rounds 6–7: E1, E2, E5, E6)", () => {
  it("a student who signals left and drives straight on «proceed» is never struck; a waiting-point hold ends with his passage, every other rest inside the bound", () => {
    const cells: LeftCell[] = [];
    for (const [id, level] of [["sc-signal-controller", 1], ["sc-sig-controller-postures", 3]] as const) {
      for (const stopY of GRID_STOPS_Y) for (let go = 30; go <= 40 + 1e-9; go += 0.5) cells.push({ id, level, stopY, go, vGoKmh: 30, aGo: 2 });
    }
    const r = officerLeftGrid(cells);
    expect(r.lawful).toBeGreaterThanOrEqual(60);
    expect(r.struck).toEqual([]);
    expect(r.overBound).toEqual([]);
    // Not vacuous: the release happens and the holds are there (round 6: 44 holds on these 84 cells, the longest 6.25 s —
    // over BOX_REST_BOUND_SEC, inside the student's passage).
    expect(r.holds).toBeGreaterThanOrEqual(20);
    expect(r.longestHold).toBeGreaterThan(BOX_REST_BOUND_SEC);
  }, 1_200_000);

  /**
   * E5 — the verifier's round-6 speeds (R6-F1): the careful tape going on «proceed» at 2 m/s² to 6, 8, 10, 12, 15, 20, 30
   * and 40 km/h, on the two rungs it measured, stop at the line, go every half second from 31 to 40 s. Round 6's 0.5 s
   * allowance failed below about 20 km/h (1.33 s at 6 km/h); the bound read at the product's restart distance holds at
   * every speed.
   */
  it("E5: at every speed from 6 to 40 km/h each waiting-point hold ends within the launch after he is the restart distance clear", () => {
    const speeds = [6, 8, 10, 12, 15, 20, 30, 40];
    const cells: LeftCell[] = [];
    for (const vGoKmh of speeds) {
      for (const [id, level] of [["sc-signal-controller", 1], ["sc-sig-controller-postures", 3]] as const) {
        for (let go = 31; go <= 40 + 1e-9; go += 0.5) cells.push({ id, level, stopY: -31, go, vGoKmh, aGo: 2 });
      }
    }
    const r = officerLeftGrid(cells);
    expect(r.struck).toEqual([]);
    expect(r.overBound).toEqual([]);
    for (const v of speeds) expect(r.perSpeed.get(v)?.holds ?? 0, `${v} km/h`).toBeGreaterThanOrEqual(10);
    // The slow end is where round 6's time allowance failed: there the holds are long, and still end with his passage.
    expect(r.perSpeed.get(6)!.longest).toBeGreaterThan(BOX_REST_BOUND_SEC);
    expect(r.longestTail).toBeLessThanOrEqual(HOLD_END_AFTER_CLEAR_SEC);
  }, 1_800_000);

  /**
   * E5 — the verifier's timid grid (R6-F1, r6/timidL.json): 0.8 m/s² to 12 km/h on every compiled rung of the three
   * officer drills, stops at the line and 3 m short, go every quarter second from 30 to 42 s — 1,274 drives, whose 366
   * holds all lasted 5 s or more and ended 0.75–0.88 s after the census's GATE_SEP clearing.
   */
  it("E5: the timid grid — every hold ends within the launch after he is the restart distance clear", () => {
    const cells: LeftCell[] = [];
    for (const id of OFFICER_DRILLS) {
      for (const level of [1, 2, 3, 4, 5]) {
        for (const stopY of GRID_STOPS_Y) for (let go = 30; go <= 42 + 1e-9; go += 0.25) cells.push({ id, level, stopY, go: +go.toFixed(2), vGoKmh: 12, aGo: 0.8 });
      }
    }
    const r = officerLeftGrid(cells);
    expect(r.lawful).toBeGreaterThanOrEqual(800);
    expect(r.struck).toEqual([]);
    expect(r.overBound).toEqual([]);
    expect(r.holds).toBeGreaterThanOrEqual(300);
    expect(r.longestHold).toBeGreaterThan(BOX_REST_BOUND_SEC);
  }, 3_600_000);
});

/**
 * ROUND 8 (E9, E10) — THE STUDENT WHO STOPS IN THE JUNCTION. Round 7's frontier and the verifier's R7-F1: a student who
 * entered on «proceed», stopped in his own lane inside the junction short of the oncoming turner's path and then drove
 * straight on was struck — signalling left (137 of 1,344 boxstop cells) and with the indicator cancelled (6 / 11 / 4 / 13
 * of 112 per grid). E9: standing in the junction he is read by his ROOM, never by his signal, so the turner held at its
 * waiting point stays there for as long as he stands within reach. E10: that wait — and the wait of a car queued behind
 * him while he stands or creeps — is bounded by his standing, not a freeze; it must end within E5's allowance once he
 * moves off and clears, turns away or leaves reach, and every other rest still counts against BOX_REST_BOUND_SEC.
 * The grids are the verifier's boxstop grid (three rungs, go 31–37 s every 2 s, stand 0.5–8 s), stop at y = −4 / −7 /
 * −10, launch 2 or 3.9 m/s², with his indicator left, off, right, and left at his line cancelled when he sets off.
 */
const BOX_HOLDS_SEC = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8];
function boxstopCells(boxY: number, aGo: number, indicator: "off" | "left" | "right", indicatorFromGo?: "off" | "left" | "right", holds = BOX_HOLDS_SEC): LeftCell[] {
  const cells: LeftCell[] = [];
  for (const [id, level] of [["sc-signal-controller", 1], ["sc-sig-controller-postures", 3], ["sc-sig-controller-live", 1]] as const) {
    for (let go = 31; go <= 37; go += 2) for (const holdSec of holds) cells.push({ id, level, stopY: -31, go, vGoKmh: 30, aGo, indicator, indicatorFromGo, boxY, holdSec });
  }
  return cells;
}

describe("the student who stops in the junction (round 8: E9, E10; round 9: E13, E15)", () => {
  it("E10 — the ledger: a hold for the STUDENT standing in the junction with the path ahead of him is excused; one for him standing at his line, or for a staged car standing anywhere, is not; after he moves off and clears it must end within the allowance", () => {
    // A waiting point on the east side of a node at the origin, its path crossing x = 4.06 northwards (the student's lane).
    const w: WaitingPoint = { at: { x: -2, y: 15 }, rest: Array.from({ length: 40 }, (_, i) => ({ x: -2 + i * 0.25, y: 15 - i * 0.1 })), node: { x: 0, y: 0 }, lineM: 27.125 + STOP_LINE_BEYOND_CUT_M + VEHICLE_LENGTH_M / 2 };
    const him = (y: number, moving: boolean): HoldBody => ({ x: 4.0625, y, dx: 0, dy: 1, moving, sep: STUDENT_PATH_SEP_M, bodySep: VEHICLE_LENGTH_M + 0.5, student: true });
    const drive = (bodies: (k: number) => HoldBody[], steps: number): { v: ReturnType<HoldLedger["verdict"]>; stand: number } => {
      const l = new HoldLedger(0, w);
      for (let k = 1; k <= steps; k++) l.step(k * STEP_SEC, STEP_SEC, bodies(k));
      return { v: l.verdict(steps * STEP_SEC, false), stand: l.standSec };
    };
    // Standing 4 m short of the node (past his line, 30.4 m) for 20 s: every point excused.
    const inJ = drive(() => [him(-4, false)], 1200);
    expect(inJ.v.unexcusedSec).toBe(0);
    expect(inJ.stand).toBeGreaterThan(19.9);
    // Round 9 (E16, verifier VR8_LEDGER_STAND_NOPATH): standing in the junction with his heading line nowhere near the
    // path (turned east, 19 m from it) he could not drive into it — not the hold E9 makes for him: the 20 s are a rest.
    const away = drive(() => [{ ...him(-4, false), dx: 1, dy: 0 }], 1200);
    expect(away.v.unexcusedSec).toBeGreaterThan(BOX_REST_BOUND_SEC);
    expect(away.stand).toBe(0);
    // Standing AT his line (nose 0.1 m behind it): he is not in the junction — the same 20 s are a rest.
    const atLine = drive(() => [him(-(w.lineM + 0.1), false)], 1200);
    expect(atLine.v.unexcusedSec).toBeGreaterThan(BOX_REST_BOUND_SEC);
    // A staged car standing in the very same place is never excused this way.
    const st = drive(() => [{ ...him(-4, false), student: false, sep: stagedPathSepM("car"), bodySep: stagedPathSepM("car") - 1 }], 1200);
    expect(st.v.unexcusedSec).toBeGreaterThan(BOX_REST_BOUND_SEC);
    // He stands 10 s, sets off and is past the path's last point by 12 s; the hold that goes on 2 s more is over the allowance.
    const after = drive((k) => (k <= 600 ? [him(-4, false)] : [him(-4 + (k - 600) * STEP_SEC * 10, true)]), 1440);
    expect(after.v.overPassageSec).not.toBeNull();
    // …and one that ends within the allowance after he is clear is not.
    const clearAt = (() => { const l = new HoldLedger(0, w); for (let k = 1; k <= 1440; k++) { l.step(k * STEP_SEC, STEP_SEC, k <= 600 ? [him(-4, false)] : [him(-4 + (k - 600) * STEP_SEC * 10, true)]); if (l.lastComing !== null && l.lastComing < k * STEP_SEC) return l.lastComing; } return null; })();
    expect(clearAt).not.toBeNull();
    const ok = drive((k) => (k <= 600 ? [him(-4, false)] : [him(-4 + (k - 600) * STEP_SEC * 10, true)]), Math.round(((clearAt as number) + HOLD_END_AFTER_CLEAR_SEC - 2 * STEP_SEC) / STEP_SEC));
    expect(ok.v.overPassageSec).toBeNull();
  });

  it("E10 — a car is queued behind the student only while he is just ahead of it, its way, in its corridor", () => {
    const car = { x: 2.29, y: -16.75, dirX: Math.sin((341 * Math.PI) / 180), dirY: Math.cos((341 * Math.PI) / 180) };
    // R7-C1's follower: he stands 7.35 m ahead and 1.8 m to the side of its centre line, heading north.
    expect(queuedBehindStudent(car, { position: { x: 4.0625, y: -9.4 }, headingDeg: 0 })).toBe(true);
    // Gone on (9 m ahead), behind it, turned across its way, or a lane over: not its queue's head.
    expect(queuedBehindStudent(car, { position: { x: 4.0625, y: -7.5 }, headingDeg: 0 })).toBe(false);
    expect(queuedBehindStudent(car, { position: { x: 2.29, y: -22 }, headingDeg: 0 })).toBe(false);
    expect(queuedBehindStudent(car, { position: { x: 4.0625, y: -9.4 }, headingDeg: 90 })).toBe(false);
    expect(queuedBehindStudent(car, { position: { x: 9.5, y: -11 }, headingDeg: 0 })).toBe(false);
  });

  /**
   * LANDING PIN (verifier R9-C3): E15's follower relation was pinned on its positive cases only — the grids below find
   * the followers that ARE there, and a widening of who counts as a follower's leader (VR9_FOLLOW_ACROSS_ANY) or of how
   * far out a queue is followed (VR9_FOLLOW_REACH_WIDE) left every grid green. These are the negative rows, on a bench
   * junction (node at the origin, drawn radius 20 m): a car standing at its line, heading north, 30 m south of the node.
   */
  it("E15 — a standing car follows only the car just ahead of it in its lane, or one HELD AT A WAITING POINT across the junction in its corridor; and only within two queue gaps of the drawn junction", () => {
    const radius = 20;
    const car = (id: number, x: number, y: number, speedMps = 0): QueueCar => ({ id, x, y, dirX: 0, dirY: 1, speedMps });
    const v = car(1, -2, -30);
    const across = car(2, -2, 5);
    const held = new Map([[2, { ledger: {} }]]);
    // Positive: across the junction in its corridor, held at a waiting point — its leader (R8-C2's north-arm car).
    expect(followLeaderOf(v, [v, across], held, radius)).toBe(2);
    // NEGATIVE: the same car standing in the junction but NOT at a waiting point (no ledger) is no leader…
    expect(followLeaderOf(v, [v, across], new Map([[2, { ledger: null }]]), radius)).toBeNull();
    // …nor one the census has no rest open for…
    expect(followLeaderOf(v, [v, across], new Map(), radius)).toBeNull();
    // …nor a held car across the junction out of its corridor (a lane over), or behind it.
    const laneOver = -2 + DEFAULT_TRAFFIC_CONFIG.laneWidthM;
    expect(followLeaderOf(v, [v, car(2, laneOver, 5)], held, radius)).toBeNull();
    expect(followLeaderOf(v, [v, car(2, -2, -45)], held, radius)).toBeNull();
    // A standing car just ahead in its own lane is its leader whatever it stands for — and it beats the held car across.
    expect(followLeaderOf(v, [v, across, car(3, -2, -24)], held, radius)).toBe(3);
    expect(followLeaderOf(v, [v, car(3, -2, -24)], new Map(), radius)).toBe(3);
    // NEGATIVE: not one a lane over, nor one more than a queue gap ahead that nobody holds.
    expect(followLeaderOf(v, [v, car(3, laneOver, -24)], new Map(), radius)).toBeNull();
    expect(followLeaderOf(v, [v, car(3, -2, -21)], new Map(), radius)).toBeNull();
    // THE REACH: two queue gaps (16 m) beyond the drawn radius. Standing 15 m out it is followed; NEGATIVE: standing
    // 17 m or 40 m out — three or five queue gaps — it is not, and a car still moving is never a queue member.
    const ids = (cars: QueueCar[]): number[] => standingNearJunction(cars, radius).map((c) => c.id);
    expect(ids([car(1, 0, -(radius + 15)), car(2, radius + 15, 0)])).toEqual([1, 2]);
    expect(ids([car(1, 0, -(radius + 17)), car(2, radius + 17, 0), car(3, 0, radius + 40)])).toEqual([]);
    expect(ids([car(1, 0, -(radius + 5), 2)])).toEqual([]);
  });

  /**
   * ROUND 9 (E13). Signalling LEFT where he stands he is WAITING (E1) and read as at his line: the turner is released.
   * If he then drives straight on he may be struck by the turner his own signal released — founder question 7 (open),
   * counted here, not a refutation: exactly round 7's cells (25 at y −4 / 2 m/s², 19 at y −10 / 3.9 m/s²). Signalling
   * nothing or right — or having cancelled his left signal — he is read by his room and never struck.
   */
  it("E13/E10/E15 — the verifier's boxstop grids: signalling nothing or right, or having cancelled, he is never struck; signalling left he is struck only in round 7's question-7 cells; every rest at a waiting point is his standing or his passage, every queue behind him or behind such a hold his standing, every other rest inside the bound", () => {
    const grids: Array<[string, LeftCell[], number]> = [
      ["left, y −4, 2 m/s² (question 7)", boxstopCells(-4, 2, "left"), 25],
      ["left, y −10, 3.9 m/s² (question 7)", boxstopCells(-10, 3.9, "left"), 19],
      ["off, y −4, 2 m/s²", boxstopCells(-4, 2, "off"), 0],
      ["off, y −10, 2 m/s² (R7-C1: his follower)", boxstopCells(-10, 2, "off"), 0],
      ["right, y −7, 2 m/s²", boxstopCells(-7, 2, "right"), 0],
      ["left at his line, off from go, y −4, 2 m/s² (R7-F1)", boxstopCells(-4, 2, "left", "off"), 0],
      ["left at his line, off from go, y −7, 3.9 m/s² (R7-F1)", boxstopCells(-7, 3.9, "left", "off"), 0],
    ];
    const stats: string[] = [];
    for (const [name, cells, q7] of grids) {
      const r = officerLeftGrid(cells);
      stats.push(`${name}: ${cells.length} drives, ${r.lawful} lawful, struck ${r.struck.length}, over ${r.overBound.length}; holds ${r.holds} (standing ${r.standHolds}, longest ${r.longestStandHold.toFixed(2)} s, of it standing ${r.longestStandSec.toFixed(2)} s, worst excess ${r.worstStandExcess.toFixed(3)} s); queue rests behind him ${r.queueRests} (longest ${r.longestQueueRest.toFixed(2)} s, worst excess ${r.worstQueueExcess.toFixed(3)} s); followers of an excused hold ${r.followers.length} (longest ${r.longestFollowerRest.toFixed(2)} s, worst tail ${r.worstFollowerTail.toFixed(3)} s)`);
      expect(r.struck.length, name).toBe(q7);
      // The question-7 class only: he signalled left while he stood and drove straight on.
      for (const cell of r.struck) expect(cell, name).toMatch(/ left$/);
      expect(r.overBound, name).toEqual([]);
      expect(r.followerOver, name).toEqual([]);
      // Each wait excused by his standing ends within E5's allowance of the last point he stood or came (grid-exact).
      if (r.standHolds > 0) expect(r.worstStandExcess, name).toBeLessThanOrEqual(STEP_SEC + 1e-6);
      // Each car queued behind him moves on by the time he is no longer just ahead of it.
      if (r.queueRests > 0) expect(r.worstQueueExcess, name).toBeLessThanOrEqual(1e-6);
      if (name.includes("R7-F1")) {
        // Not vacuous: having cancelled, he is protected — the turner waits at its waiting point while he stands, past the bound.
        expect(r.standHolds, name).toBeGreaterThanOrEqual(20);
        expect(r.longestStandHold, name).toBeGreaterThan(BOX_REST_BOUND_SEC);
      }
      if (q7 > 0) {
        // E13: signalling left where he stands he is waiting — nothing is held for him standing past the bound.
        expect(r.longestStandSec, name).toBeLessThan(BOX_REST_BOUND_SEC);
      }
      if (name.includes("R7-C1")) {
        expect(r.queueRests, name).toBeGreaterThanOrEqual(20);
        expect(r.longestQueueRest, name).toBeGreaterThan(BOX_REST_BOUND_SEC);
      }
    }
    console.log(stats.join("\n"));
  }, 1_800_000);

  it("E13 — he stands in the junction for a minute signalling left: he is waiting, the turner goes (round 7's behaviour), and nothing stands past the bound", () => {
    const r = officerLeftGrid(boxstopCells(-4, 2, "left", undefined, [60]));
    expect(r.lawful).toBeGreaterThanOrEqual(8);
    expect(r.struck).toEqual([]);
    expect(r.overBound).toEqual([]);
    expect(r.longestHold).toBeLessThan(BOX_REST_BOUND_SEC);
    expect(r.longestStandSec).toBeLessThan(BOX_REST_BOUND_SEC);
    // E15 names only the followers of a hold that is excused: no queue at a red line or behind anything else is counted.
    expect(r.followers.filter((x) => Number(/stood ([\d.]+) s/.exec(x)?.[1]) > BOX_REST_BOUND_SEC)).toEqual([]);
    console.log(`standlong (left): ${r.holds} holds, longest ${r.longestHold.toFixed(2)} s, standing part ${r.longestStandSec.toFixed(2)} s`);
  }, 600_000);

  /**
   * ROUND 9 (E10, E15; verifier R8-C2). Having cancelled his left signal at go he stands in the junction for a minute:
   * he is protected — the north arm's left-turner waits at its waiting point all that time, held for him (E10) — and the
   * cars queued behind it on the north arm (R8-C2: cars 2 and 0 — one in the drawn junction, one at its line) are the
   * hold's followers, excused for as long as it is and each moving within the queue's restart lag of its leader.
   */
  it("E10/E15 — he stands a minute having cancelled his signal: the turner waits at its waiting point held for him, and its followers wait exactly as long, each moving off within the queue's restart lag after its leader", () => {
    const r = officerLeftGrid(boxstopCells(-4, 2, "left", "off", [60]));
    console.log(`standlong (cancelled): ${r.standHolds} holds, longest ${r.longestStandHold.toFixed(2)} s, of it standing ${r.longestStandSec.toFixed(2)} s, worst excess ${r.worstStandExcess.toFixed(3)} s; followers:\n${r.followers.join("\n")}`);
    expect(r.lawful).toBeGreaterThanOrEqual(8);
    expect(r.struck).toEqual([]);
    expect(r.overBound).toEqual([]);
    expect(r.longestStandHold).toBeGreaterThan(60);
    expect(r.worstStandExcess).toBeLessThanOrEqual(STEP_SEC + 1e-6);
    expect(QUEUE_RESTART_SEC).toBeGreaterThan(0.8);
    expect(QUEUE_RESTART_SEC).toBeLessThan(1);
    const long = r.followers.filter((x) => Number(/stood ([\d.]+) s/.exec(x)?.[1]) > 50);
    expect(long.length, r.followers.join("\n")).toBeGreaterThanOrEqual(2);
    // …through the chain: car 0, queued behind car 2 at its line, is a follower of car 3's hold (its leader is not the head).
    const chained = long.filter((x) => {
      const m = /behind (\d+) \(head (\d+)\)/.exec(x);
      return m !== null && m[1] !== m[2];
    });
    expect(chained.length, r.followers.join("\n")).toBeGreaterThanOrEqual(1);
    expect(r.followerOver, r.followers.join("\n")).toEqual([]);
    expect(r.worstFollowerTail).toBeLessThanOrEqual(QUEUE_RESTART_SEC);
  }, 600_000);
});
