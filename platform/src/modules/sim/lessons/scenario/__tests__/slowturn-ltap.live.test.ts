/**
 * A SLOW LEFT TURN IS A TURN — sc-turn-left-oncoming:1613ef2c (lane slowturn).
 *
 * The lesson's own drives, with only the turn leg slowed (and, for the stop
 * cells, a braked stop after ~28° of swing), recorded through the project
 * recorder and folded through the live chain (`liveChainReplay`: runtime →
 * director → engine → objectives → result), with the micro-quiz trigger
 * watching every tick exactly as the shell does.
 *
 * Until this lane the runtime saw a junction turn only as 55° inside a 3 s
 * window (≈ 17.5 km/h on this R15 corner), so every cell below got NO
 * `turnStarted`: the slow cutter ticked «…след като пропуснеш насрещните» with
 * no bill, and the slow turner without a signal was never told. The added,
 * road-referenced path (runtime/turns.ts) now reports these turns — and,
 * under ruling R11, its event CONVICTS but does not CREDIT or NARRATE:
 *
 *  T1 (ruling R12) the correct demo slowed to 6–14 km/h, plain and with a 5 s
 *     or a 20 s stop inside the turn, at L1–L5: EXACTLY ONE left turnStarted —
 *     added — whenever the session outlives the true moving 55° point, never
 *     more than one window (TURN_WINDOW_SEC) after it: the deferral may delay,
 *     it never starves (the round-2 verifier's F-A: 6 and 7 km/h got none).
 *     No praise, no Интервал row, no quiz from the turn (R11). Where a vehicle
 *     he had to give way to braked while he was on its route the turn is billed
 *     (R13''', below); those are the only bills a cell adds, pinned cell by
 *     cell, and every one is checked TRUE by an instrument that does not reuse
 *     the product's predicate (`drivenPathTruth`: the vehicle's ACTUAL
 *     driven path from the raw traffic rows over the whole cell).
 *  T1b (ruling R13', the round-3 verifier's R13-FALSE) the careful turner who
 *     stops 20 s at the waiting point while both oncoming cars pass, then turns
 *     at 10–20 km/h: the base sheet at every level — no FAILED_TO_YIELD from a
 *     car on another arm, a departing car or a braking on an earlier trip, and
 *     the ✓ ticks wherever the base ticks it.
 *  T2 (rulings R11, R13') the cut demo slowed to 10/11/12/14 km/h:
 *     FAILED_TO_YIELD and the ✓ refused at EVERY level — on L2 (10, 11 km/h)
 *     and L4 (11 km/h) the gap the probe measured never fell to 2.0 s because
 *     the tight car's guard braked it for him, and the conviction rests on that
 *     braking (runtime/worldRuntime.ts LEFT_TURN_FORCED_SHED_MPS — the round-2
 *     verifier's F-B); still no row and no quiz;
 *  T3 the no-signal demo slowed to 10–14 km/h: TURN_WITHOUT_INDICATOR.
 *  R13'' / R13''' the verifiers' careful cells (rounds 4 and 5): a careful turner who
 *     waits, stops clear at arc vertex 3 and then turns slowly is billed
 *     nothing for an oncoming LEFT-turner (departing, or still in its
 *     approach), for a car that stopped at its own line after braking while
 *     he stood clear, or for a right-turner that slowed behind him while he
 *     was nowhere on its route — the BASE sheet at every level.
 *
 * Expected sheets are the lane's measurements (PROGRESS.md of lane slowturn,
 * rounds 3–4: r3/probe-r3b and r4/repro/probe-r4c, compared cell by cell with
 * the measuring base), not the brief. Base (no added path) for every cell
 * below 16 km/h without a stop: no turnStarted at all.
 */
import { describe, expect, it } from "vitest";
import type { SimTickEvent } from "../../../rules/types";
import { PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision/bodies";
import { vehicleHalfWidthM } from "../../../traffic/types";
import { objectiveDetailText } from "../../../hud/SessionEndScreen";
import { parseDistrict } from "../../../runtime";
import { DistrictIndex } from "../../../runtime/spatial";
import { TURN_WINDOW_SEC } from "../../../runtime/turns";
import { LEFT_TURN_CONVICT_GAP_SEC, LEFT_TURN_FORCED_SHED_MPS } from "../../../runtime/worldRuntime";
import { recordScriptedDrive, type DriveScript, type DriveStep } from "../../../traces/recorder";
import { SX_PIN_EW_GREEN_WINDOW } from "../../../traces/scJunctions";
import type { ScenarioTrace } from "../../../traces/types";
import { FIXED_DT } from "../../../vehicle/tuning";
import {
  createQuizTriggerState,
  observeQuizTick,
  type MicroQuizQuestion,
  type QuizTriggerState,
} from "../../quiz-trigger";
import { compileScenario } from "../compile";
import { SC_TURN_LEFT_ONCOMING } from "../templates-junctions";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { loadDistrict } from "./witnessLiveRung";

const RAW = loadDistrict(SC_TURN_LEFT_ONCOMING.map.districtId);
const INDEX = new DistrictIndex(parseDistrict(RAW));
const LANE = 4.0625;

/** The R15 arc of scLtapShadowScript (sx-v1, east arm → south arm). */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
const ARC = arcPts(10.9375, -10.9375, 15, 90, 180);
const TURN: Array<[number, number]> = [[10.9375, LANE], ...ARC];
const EAST: Array<[number, number]> = [[105, LANE], [52, LANE]];

/** The turn leg, optionally split at arc vertex 3 (≈ 28° of swing) by a braked stop. */
function turnLeg(from: [number, number], tail: Array<[number, number]>, kmh: number, stopSec: number | null): DriveStep[] {
  if (stopSec === null) return [{ kind: "drive", points: [from, ...TURN, ...tail], targetKmh: kmh }];
  return [
    { kind: "drive", points: [from, [10.9375, LANE], ...ARC.slice(0, 3)], targetKmh: kmh },
    { kind: "pause", sec: stopSec, brake: true },
    { kind: "drive", points: [ARC[2], ...ARC.slice(3), ...tail], targetKmh: kmh },
  ];
}

/** scLtapShadowScript's correct drive: signal, wait out the tight car 7.5 s (or `waitSec`), turn. */
function shadowScript(kmh: number, stopSec: number | null, waitSec = 7.5): DriveScript {
  return {
    steps: [
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: EAST, targetKmh: 25 },
      { kind: "drive", points: [[52, LANE], [31.2, LANE]], targetKmh: 14 },
      { kind: "pause", sec: waitSec, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      ...turnLeg([31.2, LANE], [[-LANE, -30], [-LANE, -56]], kmh, stopSec),
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}
/** The cut demo: straight into the turn in front of the tight car. */
function cutScript(kmh: number): DriveScript {
  return {
    steps: [
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[105, LANE], [40, LANE]], targetKmh: 26 },
      { kind: "drive", points: [[40, LANE], ...TURN, [-LANE, -30], [-LANE, -52]], targetKmh: kmh },
      { kind: "pause", sec: 1.8, brake: true },
    ],
  };
}
/** The no-signal demo: creep to the mouth, look, turn — never signal. */
function noIndicatorScript(kmh: number): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: EAST, targetKmh: 25 },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[52, LANE], [37, LANE]], targetKmh: 12 },
      { kind: "drive", points: [[37, LANE], [31.2, LANE]], targetKmh: 2, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[31.2, LANE], ...TURN, [-LANE, -30], [-LANE, -52]], targetKmh: kmh },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

/** Every concept the trigger can pick has unseen, drawable questions. */
const QUIZ_BANK: MicroQuizQuestion[] = [
  "c-crosswalk-yield",
  "c-give-way-stop-behavior",
  "c-traffic-light-signals",
  "c-driver-signals",
  "c-priority-concept",
].flatMap((c) =>
  Array.from({ length: 20 }, (_, i) => ({
    id: `${c}-${i}`,
    conceptIds: [c],
    type: "single" as const,
    textBg: "q",
    options: [
      { id: "a", textBg: "a" },
      { id: "b", textBg: "b" },
    ],
    points: 1 as const,
  })),
);

/** The sx-v1 centre node the turn is made at, and its 40 m junction area. */
const NODE = INDEX.nearestIntersection(0, 0, 40)!;

/** One grid point of a vehicle, from the RAW traffic rows (`traffic.vehicles`). */
type CarRow = [k: number, x: number, y: number, headingDeg: number, mps: number];
/** One grid point of the student (the tick's pose and speed). */
type MeRow = [k: number, x: number, y: number, headingDeg: number, kmh: number];
/** The truth instrument's reading of the vehicle a forced-braking conviction names — see drivenPathTruth. */
interface DrivenTruth {
  id: number;
  /** Its heading where its driven path first comes within the junction area on this trip, and where it last is. */
  entryDeg: number | null;
  exitDeg: number | null;
  /** Its movement through the junction from those two headings: |Δ| < 55° straight; clockwise right; else left. */
  movement: "straight" | "right" | "left" | null;
  /** Its entry heading off his approach heading, degrees. */
  offApproachDeg: number | null;
  /** His body lay on its driven path somewhere in the cell (the paths cross or join). */
  pathsMeet: boolean;
  /** Its raw speed lost, up to the commit, on grid points on which his body lay on its driven path AHEAD of it, m/s. */
  dropInWayMps: number;
  /** All hold: the bill is true of that vehicle. */
  true: boolean;
}

interface Cell {
  turns: Array<{ k: number; dir: string; added: boolean }>;
  passed: boolean;
  violations: string[];
  commendations: string[];
  coached: string[];
  turnTicked: boolean;
  row: string | null;
  /** Quizzes opened, with the event that opened them, at either frequency. */
  quizzes: string[];
  /** First grid step the session was no longer driving (null: drove to the end). */
  endK: number | null;
  /** The recorded drive's TRUE moving 55° point: cumulative heading change over
   *  moving samples (≥ 2 km/h) inside the junction area, ≥ 3 m travelled. */
  true55Sec: number | null;
  /** The least probe gap (distM / closingMps, closing ≥ 1 m/s) the N1 frame
   *  read while he moved above 8 km/h, before the first left commit. */
  minMovingGapSec: number;
  /** The truth instrument on the vehicle a forced-braking conviction named
   *  (null: no such conviction — the product named no vehicle). */
  truth: DrivenTruth | null;
  /** Every forced-braking prioritySituation's named vehicle, with its grid step. */
  forcedBy: Array<{ k: number; id: number }>;
  /** The level whose cell the truth was carried from (an aborted session), or null (its own rows). */
  truthFromL: ScenarioLevel | null;
  /** The phase the session ended in (null: drove to the end of the tape). */
  endPhase: string | null;
}

/** Points sampled over his chassis box at a pose (a 9 × 5 lattice: ≤ 0.25 m from any point of the box). */
function bodyPoints(m: MeRow): Array<[number, number]> {
  const r = (m[3] * Math.PI) / 180;
  const fx = Math.sin(r);
  const fy = Math.cos(r);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 4; j++) {
      const u = -PLAYER_HALF_LENGTH_M + (2 * PLAYER_HALF_LENGTH_M * i) / 8;
      const w = -PLAYER_HALF_WIDTH_M + (2 * PLAYER_HALF_WIDTH_M * j) / 4;
      pts.push([m[1] + fx * u + fy * w, m[2] + fy * u - fx * w]);
    }
  }
  return pts;
}
/** Least distance from (x, y) to the polyline of rows [from..]. */
function distToPath(x: number, y: number, rows: CarRow[], from: number): number {
  let best = Infinity;
  for (let i = from; i < rows.length - 1; i++) {
    const ax = rows[i][1];
    const ay = rows[i][2];
    const dx = rows[i + 1][1] - ax;
    const dy = rows[i + 1][2] - ay;
    const l2 = dx * dx + dy * dy;
    const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * u, y - ay - dy * u));
  }
  if (from === rows.length - 1) best = Math.hypot(x - rows[from][1], y - rows[from][2]);
  return best;
}
/** His body at pose m on the driven path rows[from..] (within the vehicle's half body width of it). */
function bodyOnPath(m: MeRow, rows: CarRow[], from: number): boolean {
  const hw = vehicleHalfWidthM();
  return bodyPoints(m).some(([x, y]) => distToPath(x, y, rows, from) <= hw);
}

/**
 * THE TRUTH INSTRUMENT (ruling R13''': «the pins must use the car's ACTUAL
 * driven path (raw traffic rows over the whole cell) — not a straight
 * projection at the commit — and check that the car braked while his body lay
 * on that driven path ahead of it»). The product names the vehicle its
 * forced-braking conviction rests on (`prioritySituation.forcedById`, an
 * internal diagnostic); this checks THAT vehicle against its raw rows
 * (`traffic.vehicles`: position, heading, speed — over the whole cell, the
 * rows after the commit included) and the student's own poses only — no shed
 * account, no planned route, no probe, no junction radius. Its TRIP is the run
 * of consecutive grid rows that contains the commit; its DRIVEN PATH is the
 * polyline of those rows' positions.
 *  - A VEHICLE HE HAD TO GIVE WAY TO: its heading where the trip first comes
 *    within 40 m of the node is more than 130° off his approach heading
 *    (oncoming), and its heading change from there to the trip's last row
 *    within 40 m is straight (|Δ| < 55°) or clockwise (right).
 *  - THE PATHS MEET: on some grid point of the cell his body (a 9 × 5 lattice
 *    over PLAYER_HALF_LENGTH_M × PLAYER_HALF_WIDTH_M) lies within the
 *    vehicle's half body width of its driven path.
 *  - IT BRAKED WHILE HE WAS IN ITS WAY: up to the commit, on grid points on
 *    which its raw speed fell and his body — at THAT grid point — lay on its
 *    driven path AHEAD of it (its own later positions), the falls sum to ≥
 *    LEFT_TURN_FORCED_SHED_MPS.
 * WHERE THE SESSION ENDED ON THE BILL (L4: the exam is over at it), the
 * replay stops at the commit and the vehicle's rows — its path ahead — with
 * it; there the cell carries the truth of the SAME recorded drive at a level
 * whose session ran on and whose conviction names the same vehicle at the
 * same grid step (`truthFromL`). It is never invented from a projection.
 * Returns null where the product named no vehicle.
 */
function drivenPathTruth(
  me: MeRow[],
  cars: Map<number, CarRow[]>,
  approachDeg: number | null,
  forced: { k: number; id: number } | null,
): DrivenTruth | null {
  if (forced === null) return null;
  const all = cars.get(forced.id) ?? [];
  const res: DrivenTruth = {
    id: forced.id,
    entryDeg: null,
    exitDeg: null,
    movement: null,
    offApproachDeg: null,
    pathsMeet: false,
    dropInWayMps: 0,
    true: false,
  };
  const at = all.findIndex((r) => r[0] === forced.k);
  if (at < 0 || approachDeg === null) return res;
  let a = at;
  while (a > 0 && all[a - 1][0] === all[a][0] - 1) a--;
  let b = at;
  while (b < all.length - 1 && all[b + 1][0] === all[b][0] + 1) b++;
  const trip = all.slice(a, b + 1);
  const near = trip.filter((r) => Math.hypot(r[1] - NODE.x, r[2] - NODE.y) <= 40);
  if (near.length === 0) return res;
  const offDeg = (p: number, q: number) => Math.abs(((((p - q) % 360) + 540) % 360) - 180);
  res.entryDeg = near[0][3];
  res.exitDeg = near[near.length - 1][3];
  const d = ((((res.exitDeg - res.entryDeg) % 360) + 540) % 360) - 180;
  res.movement = Math.abs(d) < 55 ? "straight" : d > 0 ? "right" : "left";
  res.offApproachDeg = offDeg(res.entryDeg, approachDeg);
  const meAt = new Map<number, MeRow>();
  for (const m of me) meAt.set(m[0], m);
  res.pathsMeet = me.some((m) => bodyOnPath(m, trip, 0));
  const commitIdx = at - a;
  for (let i = 1; i <= commitIdx; i++) {
    const fall = trip[i - 1][4] - trip[i][4];
    if (!(fall > 0)) continue;
    const m = meAt.get(trip[i][0]);
    if (m !== undefined && bodyOnPath(m, trip, i)) res.dropInWayMps += fall;
  }
  res.true =
    res.offApproachDeg > 130 &&
    (res.movement === "straight" || res.movement === "right") &&
    res.pathsMeet &&
    res.dropInWayMps >= LEFT_TURN_FORCED_SHED_MPS;
  return res;
}

function true55(trace: ScenarioTrace): number | null {
  let cum = 0;
  let prev: number | null = null;
  let travel = 0;
  let px = 0;
  let py = 0;
  for (const s of trace.samples) {
    if (Math.hypot(s.x - NODE.x, s.y - NODE.y) > 40) continue;
    if (prev === null) {
      prev = s.headingDeg;
      px = s.x;
      py = s.y;
      continue;
    }
    let dh = s.headingDeg - prev;
    while (dh > 180) dh -= 360;
    while (dh < -180) dh += 360;
    if (s.speedKmh >= 2) {
      cum += dh;
      travel += Math.hypot(s.x - px, s.y - py);
    }
    prev = s.headingDeg;
    px = s.x;
    py = s.y;
    if (Math.abs(cum) > 55 && travel >= 3) return s.tSec;
  }
  return null;
}

type Probe = {
  oncomingNear: (x: number, y: number, h: number, r: number) => { distM: number; closingMps: number } | null;
  vehicles: ReadonlyArray<{ id: number; x: number; y: number; dirX: number; dirY: number; speedMps: number }>;
};

const recCache = new Map<string, ScenarioTrace>();
/** Cells being replayed now (the sibling search never re-enters one). */
const inFlight = new Set<string>();
const cache = new Map<string, Cell>();
function run(name: string, script: DriveScript, L: ScenarioLevel): Cell {
  const key = `${name}@L${L}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let trace = recCache.get(name);
  if (!trace) {
    trace = recordScriptedDrive(RAW, script, {
      scenarioId: SC_TURN_LEFT_ONCOMING.id,
      kind: "shadow",
      seed: 7,
      stagedEvents: [...(SC_TURN_LEFT_ONCOMING.staged ?? [])],
      collisionMinKmh: 0,
      signalOffsets: SX_PIN_EW_GREEN_WINDOW,
    }).trace;
    recCache.set(name, trace);
  }
  const lesson = compileScenario(SC_TURN_LEFT_ONCOMING, L);
  const turns: Cell["turns"] = [];
  const quizzes: string[] = [];
  const qs: Record<string, QuizTriggerState> = {
    occasional: createQuizTriggerState("occasional", QUIZ_BANK),
    frequent: createQuizTriggerState("frequent", QUIZ_BANK),
  };
  let endK: number | null = null;
  let endPhase: string | null = null;
  let vH: number | null = null;
  let minGap = Infinity;
  let committed = false;
  let inAreaK = Infinity;
  const forcedBy: Array<{ k: number; id: number }> = [];
  const me: MeRow[] = [];
  const cars = new Map<number, CarRow[]>();
  const o = liveChainReplay({
    lesson,
    districtRaw: RAW,
    trace,
    applyOutcomes: true,
    holdAfterSec: 0,
    afterApply: ({ t, tick, step, traffic }) => {
      const k = Math.round(t / FIXED_DT);
      if (endK === null && step.state.phase !== "driving") {
        endK = k;
        endPhase = step.state.phase;
      }
      for (const e of tick.events as SimTickEvent[]) {
        if (e.kind === "turnStarted") turns.push({ k, dir: e.direction, added: e.addedPath === true });
        if (e.kind === "prioritySituation" && e.forcedById !== undefined) forcedBy.push({ k, id: e.forcedById });
      }
      // The N1 frame, read as the tracker reads it (instrument only).
      const trf = traffic as unknown as Probe;
      // The raw rows the truth instrument reads (drivenPathTruth).
      me.push([k, tick.position.x, tick.position.y, tick.headingDeg, tick.speedKmh]);
      for (const v of trf.vehicles) {
        if (Math.hypot(v.x - NODE.x, v.y - NODE.y) > 80) continue;
        let rows = cars.get(v.id);
        if (rows === undefined) cars.set(v.id, (rows = []));
        rows.push([k, v.x, v.y, ((Math.atan2(v.dirX, v.dirY) * 180) / Math.PI + 360) % 360, v.speedMps]);
      }
      const inArea = Math.hypot(tick.position.x - NODE.x, tick.position.y - NODE.y) <= 40;
      if (inArea && vH === null) vH = tick.headingDeg;
      if (inArea && inAreaK === Infinity) inAreaK = k;
      if (inArea && vH !== null && !committed) {
        const pr = trf.oncomingNear(NODE.x, NODE.y, vH, 36);
        if (pr && pr.closingMps >= 1 && tick.speedKmh > 8) minGap = Math.min(minGap, pr.distM / pr.closingMps);
        const left = (tick.events as SimTickEvent[]).some((e) => e.kind === "turnStarted" && e.direction === "left");
        if (left) committed = true;
      }
      if (step.state.phase === "driving" && (step.teachMoments?.length ?? 0) === 0) {
        for (const f of ["occasional", "frequent"]) {
          const q = observeQuizTick(qs[f], tick);
          qs[f] = q.state;
          if (q.quiz) {
            const why = (tick.events as SimTickEvent[]).find(
              (e) => e.kind === "turnStarted" || e.kind === "prioritySituation",
            );
            if (why) quizzes.push(`${f}:${why.kind}@k${k}`);
          }
        }
      }
    },
  });
  // A session that ENDED ON THE BILL (L4: the exam is over at the commit, phase «completed» there) cut the
  // vehicle's rows at the commit: carry the truth of the same drive at a level whose session ran on past it and
  // whose conviction names the same vehicle at the same grid step.
  let truth = drivenPathTruth(me, cars, vH, forcedBy[0] ?? null);
  let truthFromL: ScenarioLevel | null = null;
  const named = forcedBy[0];
  if (endK !== null && named !== undefined && endK <= named.k) {
    inFlight.add(key);
    for (const L2 of [1, 2, 3, 5] as ScenarioLevel[]) {
      if (L2 === L || inFlight.has(`${name}@L${L2}`)) continue;
      const other = run(name, script, L2);
      if ((other.endK !== null && other.endK <= named.k) || other.forcedBy[0]?.id !== named.id || other.forcedBy[0]?.k !== named.k) continue;
      truth = other.truth;
      truthFromL = L2;
      break;
    }
    inFlight.delete(key);
  }
  const turn = o.result.objectives.find((x) => x.id === "sc-ltap-turn");
  const cell: Cell = {
    turns,
    passed: o.result.passed,
    violations: o.violationCodes,
    commendations: o.commendationCodes,
    coached: (o.result.coachedMistakes ?? []).map((c) => c.code),
    turnTicked: turn?.done === true,
    row: turn?.detail ? objectiveDetailText(turn.detail) : null,
    quizzes,
    endK,
    true55Sec: true55(trace),
    minMovingGapSec: minGap,
    truth,
    truthFromL,
    endPhase,
    forcedBy,
  };
  cache.set(key, cell);
  return cell;
}

/** The vehicle the forced-braking conviction named had to be given way to and braked while he was on its driven path (the truth instrument). */
const brakedForHim = (c: Cell) => c.truth?.true === true;

const ALL: ScenarioLevel[] = [1, 2, 3, 4, 5];
const C = "COLLISION";
const F = "FAILED_TO_YIELD";
const COLLISION_ROW = /^Интервал: не беше преценен — стигна до удар/;

describe("T1 — the correct demo at 6–14 km/h, plain or stopped mid-turn (and 16/20 km/h stopped), L1–L5: one turn, never starved (R12), nothing credited (R11)", () => {
  // [cell, km/h, stop after ~28° (s), the ADDED commit's grid step, violations at L1..L5]
  // `null` violations' turn = the session ended (a collision at L4) BEFORE the
  // true 55° point, so there is no turn to report on that level.
  const CELLS: Array<[string, number, number | null, number, Array<string[] | { ended: string[] }>]> = [
    ["shadow-6", 6, null, 2808, [[], [], [F], [F], [C, F]]],
    ["shadow-6-stop5", 6, 5, 3243, [[], [], [C, F], { ended: [C] }, [C, C, F]]],
    ["shadow-6-stop20", 6, 20, 4143, [[F], [F], [], ["STANDSTILL_GAP_TOO_CLOSE"], [C]]],
    ["shadow-7", 7, null, 2640, [[], [], [F], [F], [C, F]]],
    ["shadow-7-stop5", 7, 5, 3067, [[], [], [C], { ended: [C] }, [C, C]]],
    ["shadow-7-stop20", 7, 20, 3967, [[], [], [], [], [C]]],
    ["shadow-8", 8, null, 2320, [[], [], [], [], [C]]],
    ["shadow-8-stop5", 8, 5, 2836, [[], [], [C], { ended: [C] }, [C, C]]],
    ["shadow-8-stop20", 8, 20, 3736, [[], [], [], [], [C]]],
    ["shadow-10", 10, null, 2137, [[], [], [], [], [C]]],
    ["shadow-10-stop5", 10, 5, 2665, [[], [], [C, F], { ended: [C] }, [C, C, F]]],
    ["shadow-10-stop20", 10, 20, 3565, [[], [], [], [], [C]]],
    ["shadow-12", 12, null, 2017, [[], [], [], [], [C]]],
    ["shadow-12-stop5", 12, 5, 2560, [[], [], [C, F], { ended: [C] }, [C, C, F]]],
    ["shadow-12-stop20", 12, 20, 3460, [[], [], [], [], [C]]],
    ["shadow-14", 14, null, 1933, [[], [], [], [], [C]]],
    ["shadow-14-stop5", 14, 5, 2488, [[], [], [C, F], { ended: [C] }, [C, C, F]]],
    ["shadow-14-stop20", 14, 20, 3388, [[], [], [], [], [C]]],
    ["shadow-16-stop20", 16, 20, 3340, [[], [], [], [], [C]]],
    ["shadow-20-stop20", 20, 20, 3283, [[], [], [], [], [C]]],
  ];
  for (const [name, kmh, stop, k, perLevel] of CELLS) {
    for (const L of ALL) {
      const want = perLevel[L - 1];
      if (Array.isArray(want)) {
        it(`${name} L${L}: EXACTLY ONE left turnStarted (added) at k${k}, at most one window after the true 55° point`, () => {
          const c = run(name, shadowScript(kmh, stop), L);
          expect(c.turns).toEqual([{ k, dir: "left", added: true }]);
          const lag = k * FIXED_DT - (c.true55Sec as number);
          expect(lag).toBeGreaterThanOrEqual(0);
          expect(lag).toBeLessThanOrEqual(TURN_WINDOW_SEC + 0.05);
        });
        it(`${name} L${L}: bills only what he earned ${JSON.stringify(want)} — no praise, no Интервал row, no quiz from the turn`, () => {
          const c = run(name, shadowScript(kmh, stop), L);
          expect(c.violations).toEqual(want);
          expect(c.commendations).not.toContain("YIELDED_TO_PRIORITY");
          if (c.row !== null) expect(c.row).toMatch(COLLISION_ROW);
          expect(c.row ?? "").not.toMatch(/не беше започнат/);
          expect(c.quizzes.filter((q) => /turnStarted|prioritySituation/.test(q))).toEqual([]);
          // The ✓ «…след като пропуснеш насрещните» is refused exactly where
          // a car with priority had to brake for him (FAILED_TO_YIELD).
          if (want.includes(F)) expect(c.turnTicked).toBe(false);
        });
        if (want.includes(F)) {
          it(`${name} L${L}: the bill is true — a tight gap while he moved, or (R13''') the vehicle it names had to be given way to and braked while his body lay on its driven path ahead of it (raw rows)`, () => {
            const c = run(name, shadowScript(kmh, stop), L);
            if (c.forcedBy.length === 0) expect(c.minMovingGapSec).toBeLessThanOrEqual(LEFT_TURN_CONVICT_GAP_SEC);
            else expect(c.truth).toMatchObject({ true: true });
          });
        } else {
          it(`${name} L${L}: no forced-braking evidence — the product names no vehicle`, () => {
            const c = run(name, shadowScript(kmh, stop), L);
            expect(c.forcedBy).toEqual([]);
          });
        }
      } else {
        it(`${name} L${L}: the session ends on the collision before the true 55° point — no turn to report, ${JSON.stringify(want.ended)}`, () => {
          const c = run(name, shadowScript(kmh, stop), L);
          expect(c.turns).toEqual([]);
          expect((c.endK as number) * FIXED_DT).toBeLessThan(c.true55Sec as number);
          expect(c.violations).toEqual(want.ended);
        });
      }
    }
  }
  it("shadow-5 (below the stop rule) L1/L3: reported too — one added left turn, exactly one window after the true 55° point", () => {
    for (const L of [1, 3] as ScenarioLevel[]) {
      const c = run("shadow-5", shadowScript(5, null), L);
      expect(c.turns).toEqual([{ k: 3081, dir: "left", added: true }]);
      expect(3081 * FIXED_DT - (c.true55Sec as number)).toBeCloseTo(TURN_WINDOW_SEC, 1);
      expect(c.commendations).toEqual([]);
      expect(c.row).toBeNull();
    }
  });
});

describe("T2 — the slow cut is convicted at EVERY level: FAILED_TO_YIELD and the ✓ refused (D2, R13')", () => {
  const CELLS: Array<[number, number]> = [
    [10, 1531],
    [11, 1465],
    [12, 1396],
    [14, 1301],
  ];
  for (const [kmh, k] of CELLS) {
    for (const L of ALL) {
      it(`cut-${kmh} L${L}: the added commit at k${k} bills FAILED_TO_YIELD and refuses «…след като пропуснеш насрещните»`, () => {
        const c = run(`cut-${kmh}`, cutScript(kmh), L);
        expect(c.turns).toEqual([{ k, dir: "left", added: true }]);
        expect(c.violations).toEqual(L === 5 ? [C, F] : [F]);
        expect(c.turnTicked).toBe(false);
        expect(c.passed).toBe(false);
        expect(c.row).toBeNull();
        expect(c.quizzes.filter((q) => /turnStarted|prioritySituation/.test(q))).toEqual([]);
        expect(c.commendations).toEqual([]);
      });
    }
  }
  // The round-2 verifier's F-B: the gap never read ≤ 2.0 s while he moved,
  // because the tight car's guard braked it for him — the conviction is the
  // braking (LEFT_TURN_FORCED_SHED_MPS), the examiner grades the cut.
  const BRAKED_NOT_TIGHT: Array<[number, ScenarioLevel]> = [
    [10, 2],
    [11, 2],
    [11, 4],
  ];
  for (const [kmh, L] of BRAKED_NOT_TIGHT) {
    it(`cut-${kmh} L${L}: no tight gap (> ${LEFT_TURN_CONVICT_GAP_SEC} s) — convicted (R13''') on the tight car (1000), oncoming straight on, which braked ≥ ${LEFT_TURN_FORCED_SHED_MPS} m/s while his body lay on its driven path ahead of it (raw rows)`, () => {
      const c = run(`cut-${kmh}`, cutScript(kmh), L);
      expect(c.minMovingGapSec).toBeGreaterThan(LEFT_TURN_CONVICT_GAP_SEC);
      expect(c.forcedBy.map((f) => f.id)).toEqual([1000]);
      expect(c.truth).toMatchObject({ id: 1000, true: true });
      expect(c.violations).toEqual([F]);
    });
  }
});

describe("T3 — the slow turn without a signal is billed (D3)", () => {
  const CELLS: Array<[number, number]> = [
    [10, 2107],
    [12, 1987],
    [14, 1897],
  ];
  for (const [kmh, k] of CELLS) {
    for (const L of [1, 3] as ScenarioLevel[]) {
      it(`noind-${kmh} L${L}: «Завиване без мигач» at the added commit k${k}, nothing credited`, () => {
        const c = run(`noind-${kmh}`, noIndicatorScript(kmh), L);
        expect(c.turns).toEqual([{ k, dir: "left", added: true }]);
        expect(c.coached).toEqual(["TURN_WITHOUT_INDICATOR"]);
        expect(c.passed).toBe(false);
        expect(c.commendations).toEqual([]);
        expect(c.row).toBeNull();
      });
    }
  }
});

describe("R13'' — a DEPARTING oncoming car is never R13' evidence, whatever its crossing-frame closing (the round-4 verifier's R13P-DEPARTING)", () => {
  // The round-4 verifier's careful cells: wait W s at the stop line, enter on
  // green, stop at arc vertex 3 (≈ 28° of swing, clear of the eastbound lane)
  // for S s, then turn at 8 km/h. At the ADDED commit (k4066) the only car
  // with a grown account is ambient id0, an oncoming LEFT-turner leaving into
  // the north arm (radial closing −0.65 m/s, crossing-frame +3.6 m/s): its
  // path never crossed his. The BASE sheet, measured on mbase (verifier
  // probe-base4ow): no bill and the ✓ at L1–L4; at L5 the base COLLISION.
  const OW: Array<[string, number, number]> = [
    ["ow-w10-8-st23", 10, 23],
    ["ow-w9-8-st24", 9, 24],
  ];
  for (const [name, wait, stop] of OW) {
    for (const L of ALL) {
      it(`${name} L${L}: the base sheet — ${L === 5 ? "COLLISION only" : "no bill"}, «…след като пропуснеш насрещните» ✓, and the product names no car`, () => {
        const c = run(name, shadowScript(8, stop, wait), L);
        expect(c.turns).toEqual([{ k: 4066, dir: "left", added: true }]);
        expect(c.forcedBy).toEqual([]);
        expect(c.violations).toEqual(L === 5 ? [C] : []);
        expect(c.turnTicked).toBe(true);
        expect(c.passed).toBe(L !== 5);
      });
    }
  }
  // The verifier's non-careful cell: wait 18 s, 12 km/h, stop 20 s. Base bills
  // RED_LIGHT_CROSSED and the COLLISION with the oncoming car; the departing
  // left-turner id0 (radial −2.1 m/s) named on tree4 is not evidence. Its other
  // bills are base's and stay (verifier probe-base4sw).
  const SW18: Array<[ScenarioLevel, string[]]> = [
    [1, ["RED_LIGHT_CROSSED", C]],
    [2, ["RED_LIGHT_CROSSED", C]],
    [3, ["RED_LIGHT_CROSSED", C]],
    [5, [C, "RED_LIGHT_CROSSED", C]],
  ];
  for (const [L, base] of SW18) {
    it(`sw-w18-12-st20 L${L}: no R13' conviction on the departing id0 — the bills are base's ${JSON.stringify(base)}`, () => {
      const c = run("sw-w18-12-st20", shadowScript(12, 20, 18), L);
      expect(c.forcedBy.filter((f) => f.id === 0)).toEqual([]);
      expect(c.forcedBy).toEqual([]);
      expect(c.violations).toEqual(base);
    });
  }
});

describe("R13''' — the round-5 verifier's careful cells print the BASE sheet: no vehicle he had to give way to braked while he was on its route", () => {
  // shadowScript(v, stop 3 at arc vertex 3, wait w) — wait w s at the stop line,
  // enter on green, stop S s clear of the eastbound lane, then turn at v km/h.
  // The BASE sheets are the round-5 verifier's probe-base5owX (mbase product);
  // round 5 (R13'') billed FAILED_TO_YIELD on ambient id3 in every L3–L5 cell of
  // the first six (an oncoming LEFT-turner still in its approach lane, its route
  // turning into the north arm), at L3–L5 of ow-w14-6-st29 (its shed accrued
  // 46–75 m back while he stood clear; it then stopped at its own line) and at
  // L1/L2 of the last two (an oncoming RIGHT-turner whose shed accrued while his
  // body was 7.5–8.6 m off its planned route).
  const STANDSTILL = "STANDSTILL_GAP_TOO_CLOSE";
  const OW: Array<[string, number, number, number, number, string[]]> = [
    // [name, wait s, km/h, stop s, the added commit, L4's base bills]
    ["ow-w14-12-st37", 14, 12, 37, 4870, []],
    ["ow-w10-8-st37", 10, 8, 37, 4906, []],
    ["ow-w10-10-st40", 10, 10, 40, 4915, []],
    ["ow-w10-6-st29", 10, 6, 29, 4833, [STANDSTILL]],
    ["ow-w10-6-st31", 10, 6, 31, 4953, [STANDSTILL]],
    ["ow-w10-6-st33", 10, 6, 33, 5073, [STANDSTILL]],
    ["ow-w14-6-st29", 14, 6, 29, 5073, [STANDSTILL]],
    ["ow-w10-12-st29", 10, 12, 29, 4150, []],
    ["ow-w14-12-st25", 14, 12, 25, 4150, []],
  ];
  for (const [name, wait, kmh, stop, k, l4] of OW) {
    for (const L of ALL) {
      const base = L === 5 ? [C] : L === 4 ? l4 : [];
      it(`${name} L${L}: the base sheet ${JSON.stringify(base)}, «…след като пропуснеш насрещните» ✓, and the product names no vehicle`, () => {
        const c = run(name, shadowScript(kmh, stop, wait), L);
        expect(c.turns).toEqual([{ k, dir: "left", added: true }]);
        expect(c.forcedBy).toEqual([]);
        expect(c.violations).toEqual(base);
        expect(c.turnTicked).toBe(true);
        expect(c.passed).toBe(L !== 5);
      });
    }
  }
});

describe("R13''' wiring — the recorder grades the same world (traces/recorder.ts setPlannedRouteQuery, as scene/lessonWorldRecipe.ts wires the live lesson)", () => {
  // The recorder's own rule-engine log (the shadow-demo zero-violation gate reads it). On these slow turns its
  // FAILED_TO_YIELD rests on the forced-braking evidence alone (measured: with the recorder's planned-route query
  // unwired the log loses it, round 6) — so the recorder must hand the runtime the same route reader.
  for (const [name, kmh, stop] of [["shadow-5", 5, null], ["shadow-6", 6, null], ["shadow-6-stop5", 6, 5]] as Array<[string, number, number | null]>) {
    it(`${name}: the recorder's rule-engine log bills FAILED_TO_YIELD`, () => {
      const rec = recordScriptedDrive(RAW, shadowScript(kmh, stop), {
        scenarioId: SC_TURN_LEFT_ONCOMING.id,
        kind: "shadow",
        seed: 7,
        stagedEvents: [...(SC_TURN_LEFT_ONCOMING.staged ?? [])],
        collisionMinKmh: 0,
        signalOffsets: SX_PIN_EW_GREEN_WINDOW,
      });
      const codes = rec.ruleEvents.flatMap((e) => (e.kind === "violation" ? [(e as { code: string }).code] : []));
      expect(codes).toContain(F);
    });
  }
});
