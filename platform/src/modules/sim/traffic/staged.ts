/**
 * Staged (scripted) actors — the traffic side of the A8 scenario orchestrator.
 *
 * A staged actor is NOT an ambient agent: no IDM, no routes, no reservations.
 * It follows one pre-resolved path and executes one imperative command at a
 * time (hold / cruise / matchPlayer / brake / reset), so the orchestrator can
 * time a deterministic encounter to the player's approach. State publishes
 * into the same TrafficVehicleState / TrafficPedestrianState objects the
 * presentation layer and the rule-engine queries already read.
 *
 * Determinism: pure functions of (spec, command stream, player pose stream,
 * dt sequence) — staged actors draw no randomness at all. Zero allocations in
 * the per-frame update path; all buffers are built at stage() time.
 *
 * Honest v1 limitations (doc 68 A8 / audit C1+C3): ambient agents do not see
 * staged actors; "cyclists" are narrow scripted vehicle-agents rendered with
 * the car fleet; scripted actors obey their script, not signals/reservations
 * (the orchestrator's timing is responsible for plausibility).
 */

import { offsetPolyline, projectOntoPolyline, sampleLane, type LaneGraph } from "./graph";
import { vehicleHalfLengthM } from "./types";
import type {
  StagedCommand,
  StagedPedestrianSpec,
  StagedVehicleSpec,
  TrafficPedestrianState,
  TrafficVehicleState,
  VehicleIndicator,
} from "./types";

const DEFAULT_ACCEL_MPS2 = 2.6;
const DEFAULT_DECEL_MPS2 = 4.5;
const DEFAULT_SLAM_DECEL_MPS2 = 7.5;
const HOLD_DECEL_MPS2 = 8;
/** A commanded target at/below this is „stand still", not „crawl" (B40 — the
 *  standing-hold brake lamps at the bottom of `stepStagedVehicle`). */
const HOLD_LIT_TARGET_MPS = 0.05;
/** …and the actor counts as stopped at/below this. Matches the ambient
 *  fleet's own `speed < 0.5` stopped bar in vehicles.ts, so the scripted and
 *  the background car light up at the same moment. */
const HOLD_LIT_SPEED_MPS = 0.5;
/** Default laneShift glide duration, s (the FO-03 cut-in reads as one calm
 *  lane change at urban speed — ~8 m of lateral travel over 1.5 s). */
const DEFAULT_LANE_SHIFT_RAMP_SEC = 1.5;
/** Player-guard corridor: brake for a player within this far ahead, m. */
const GUARD_AHEAD_M = 16;
/** Player-guard lateral half-width, m (~car width + margin). */
const GUARD_LATERAL_M = 3.0;
/**
 * FR-B5-CROSS: how far off its own path a RETURNING actor watches for a student
 * who is coming onto it (step 2a). Step 2's `GUARD_LATERAL_M` is a LANE width,
 * right for a car being followed and useless for one being crossed.
 *
 * IT IS AN ENGAGEMENT DISTANCE, AND THE BRAKE HAS TO BE ABLE TO FINISH. The
 * along-path half of the window is `GUARD_AHEAD_M` 16 m, which at the give-way
 * boulevard's 11.5 m/s is 1.4 s of warning, and stopping from that speed under
 * `HOLD_DECEL_MPS2` takes 8.3 m — so an actor that first sees the student at
 * ahead = 9 m cannot stop short of him and only succeeds in coming to rest ON
 * his lane. Measured on a 16 км/ч crossing swept one metre at a time from 40 m
 * out, worst case reported:
 *
 *   lateral window  3 m (step 2's)   → contact, y = 150.30 on jxg-giveway-v1
 *   lateral window 16 m              → 1.18 m — the actor braked too late and
 *                                      stopped 5.2 m from the lane centre,
 *                                      which is the student driving into a
 *                                      standing car, doc 87 item 4 again
 *   lateral window 25 m              → 6.13 m at 16 км/ч …and 0.22 m at 5
 *
 * THAT LAST COLUMN IS WHY THIS NUMBER IS 60 AND NOT 25 (verifier, 2026-08-23).
 * A window sized in metres OFF THE PATH is a window sized in SECONDS only for
 * one crossing speed, and 25 m was fitted to the one speed the first sweep
 * drove. A learner creeping out of a give-way line at 5–8 км/ч is still 25 m
 * off the boulevard at the moment the actor's own 16 m arc window opens, so
 * engagement is deferred until `ahead` has already fallen to ~7 m — and the
 * actor then brakes to a dead stop at `ahead` = 0.22 m, which IS the crossing
 * point, and holds there while the student crawls into it. Traced on the
 * synthetic boulevard: actor at rest at x = 4.28 against a student lane centre
 * of x = 4.0625, from t = 6.5 s, with the student still 23 m away. It is doc 87
 * item 4 exactly — a body standing in the student's own lane in the junction
 * mouth — produced by the guard written to prevent it.
 *
 * Reproduced on the real map, `jxg-giveway-v1` L1 through the production stack,
 * driving the drill's own instructions and varying only the crossing pace:
 *
 *   25 m window, 8 км/ч, 25 s wait   → CONTACT with staged id 1000 at
 *                                      y = 150.07, t = 77.6 s, 0.85 m
 *   25 m window, stall in the box    → CONTACT with staged id 1000, 0.85 m
 *   60 m window, both of the above   → 6.00 m and 6.06 m, clear
 *
 * Neither contact exists with FR-B5-RETURN alone (the actor never came back),
 * so both were manufactured by this repair and are closed by this number.
 *
 * WHY 60. The window must not be the thing that delays engagement — the arc
 * window already is, and 16 m is enough for the brake (8.3 + `GUARD_STOP_SHORT_M`
 * = 14.3 m). So it has to exceed the longest APPROACH a student can be making
 * when that arc window opens, which is his whole give-way leg: 36.06 m on
 * `sc-jxgb-conflict` (the Б1 line to the boulevard) and 39.90 m on
 * `sc-edpr-right`. 60 clears the longer of those with room for a longer leg,
 * and it costs the cure nothing — measured on the drill's own drive, crossings
 * and late metres are IDENTICAL at 25 and at 60 (6 crossings, 634.2 m), because
 * a student who waits at the line is not `closing` and never engages the guard
 * at any width.
 *
 * Wider cannot dawdle, for that same reason: `closing` is false for a
 * STATIONARY student, so a car waiting at a give-way line never slows it at
 * all, however close he is.
 */
const CROSS_WATCH_M = 60;
/** Guard aims to stop this far short of the player, m. */
const GUARD_STOP_SHORT_M = 6;
/**
 * The guard's approach law: target speed = this × (metres past the standoff).
 * Named because the widened window below is its inverse — the distance at
 * which an actor doing `v` first meets its own braking profile is `v / gain`.
 */
const GUARD_APPROACH_GAIN = 0.8;
/** matchPlayer proportional gain: m/s of speed delta per meter of gap error. */
const MATCH_GAIN = 0.55;
/**
 * FR-B5-EXIT (sweep161, 2026-08-18) — HOW FAR A RETIRING ACTOR DRIVES AWAY.
 *
 * A non-looping actor that ran out of path used to stop on the last metre of
 * it and stand there for the rest of the lesson. Doc 87 FR-B5-VAN named that
 * exact sentence as the defect ("a staged vehicle that runs out of path stops
 * on the last metre of it and never moves again (staged.ts `finished`)") and
 * then repaired it by lengthening ONE template's path. Every path is finite,
 * so the mechanism simply moved: measured on the sweep's own runs, at level 1,
 * with each scenario's compiled ambient count and a 210 s lesson —
 *
 *   sc-ln-decisive-change  `sc-lndc-target` at rest (4.06, 400.00) from
 *                          t ≈ 25 s → 185 s of a 210 s lesson with the LEFT
 *                          lane the briefing is about empty to the horizon;
 *   sc-merge-accel-lane    `sc-mrg-mainline` at rest (−8.13, 960.00) from
 *                          t ≈ 40 s → 170 s of empty motorway;
 *   sc-jx-giveway-b1       `sc-jxgb-conflict` at rest (−120.00, 154.06) — the
 *                          last metre of its path, in a live boulevard lane —
 *                          with ambient #2 dammed 6.2 m behind it and #0
 *                          12.5 m behind that.
 *
 * That last one is the whole finding. Driving the drill correctly and holding
 * at the Б1 line, EVERY body in the world covered **0.0 m** over t = 150…210 s.
 * The control settles it: with the staged actors not staged, the same two
 * ambient cars covered 562.7 m and 560.1 m over the same 60 s. The priority
 * stream the lesson asks the student to wait for never clears because the
 * lesson's own actor is parked across it.
 *
 * So a car that reaches the end of its path LEAVES, the way real traffic does,
 * instead of becoming scenery in a live lane. 70 m because the ambient fleet's
 * own corridor is `cfg.lookaheadM` 60 m (types.ts) plus a body length and a
 * margin — past this an ambient agent no longer sees the actor at all, which
 * is the property that has to hold, not the number.
 */
const EXIT_CLEAR_M = 70;
/**
 * …and the retirement run is driven at the speed the actor arrived with, so it
 * simply keeps going. The floor only covers an actor that crawls over its own
 * finish line: without it a car arriving at 0.2 m/s would take 350 s to clear
 * and would still be an obstacle for the whole lesson — the defect again,
 * slower. 4 m/s is a walking-pace pull-away, not a lurch.
 */
const EXIT_MIN_SPEED_MPS = 4;
/**
 * FR-B5-RETURN (sweep161, 2026-08-18) — …AND THEN IT HAS TO COME BACK.
 *
 * FR-B5-EXIT above ends „the actor parks on the last metre of its path" by
 * driving it 70 m further on, and its own justification names the property that
 * number stands for: „past this an ambient agent no longer sees the actor at
 * all, WHICH IS THE PROPERTY THAT HAS TO HOLD, not the number". It then checks
 * that property against one observer. There are two. The second is the student,
 * and on the maps these lessons are set on the property is simply false for
 * him: `LessonScene` draws traffic to **420 m** (`maxDrawDistanceM={420}`) and
 * ln-v1 is **400 m** long end to end. There is no „past this" to drive to.
 *
 * MEASURED at level 1 by replaying the audit bot's OWN logged speed profile
 * (`.audit-frames/sweep161/sc-ln-decisive-change/pc-right/run.log` — a stop-go
 * crawl of 0…14 км/ч for the whole 210 s, which is the drive the frames were
 * taken of, not the 42 s shadow trace):
 *
 *   t= 10 s  player y= 37   `sc-lndc-target` y= 32, 7.1 m/s  ← the encounter
 *   t= 30 s  player y= 69                    y=322, 15.0 m/s ← passed, leaving
 *   t= 40 s  player y= 85                    y=470,  0.0 m/s ← retired
 *   t=123 s  player y=203                    y=470,  0.0 m/s ← 267 m dead ahead
 *   t=208 s  player y=330                    y=470,  0.0 m/s ← 151 m dead ahead
 *
 * The last two rows are the finding's two cited frames, and cropping them shows
 * exactly that: a stationary blue body standing in the LEFT lane at the end of
 * the road — the very lane «Изчакай колата в съседната лента» is about — from
 * t = 37 s to the 210 s cap. 25 seconds of lesson and 173 seconds of horizon.
 * Same shape on `sc-merge-accel-lane`: `sc-mrg-mainline` at rest at y = 1030,
 * 70 m past the 960 m end of the motorway, from t ≈ 68 s.
 *
 * So an actor that has run its script and cleared the scene RE-ENTERS AT THE
 * START OF ITS OWN PATH and drives it again, the way a boulevard keeps
 * producing cars — the far end of its road, which is where traffic comes from
 * and the one place on any of these maps that is off-scene by construction.
 *
 * THREE THINGS IT MAY NOT BECOME, each one a guard below:
 *
 *  1. …a car that pops into the student's windscreen. Re-entry is allowed only
 *     once he is RETURN_CLEAR_M past the RE-ENTRY POSE measured along the
 *     actor's own path — the same projection `matchPlayer` already takes, so
 *     on a road he is driving the re-entry always happens behind him, never in
 *     front of him — AND only while that pose is RETURN_CLEAR_M away from him
 *     in a straight line, which is the same promise stated in metres for the
 *     case where „along the path" is not a direction he is travelling in.
 *  2. …a second, unscripted run of a ONE-SHOT HAZARD. The discriminator is
 *     `railPath`: an actor riding an authored line OUTSIDE the road graph is
 *     the RX „жп прелез" train (the only `railPath` spec in the catalogue,
 *     templates-rail.ts), and a second train crossing a level crossing the
 *     lesson has just declared clear would convict a student who did exactly
 *     as told. It gets the one run it is written for.
 *
 *     NOT `playerGuard`, which was the first thing tried here and is WRONG:
 *     the two `playerGuard: false` actors in the catalogue are that train and
 *     the лепка (runners.ts `RearTailgaterRunner`), and the лепка's flag is a
 *     POSE flag, stated as such at its own site — „playerGuard OFF by design:
 *     the guard's stop-6-m-short corridor forbids the sub-6 m лепка pose",
 *     with structural safety instead (an authored 12 m/s² decel cap that
 *     out-brakes the hero). Excluding on it would have retired precisely the
 *     two actors these findings are about (`sc-lndc-target`, `sc-mrg-mainline`
 *     are both rearTailgaters) and closed nothing.
 *  3. …a body materialising inside another one. The re-entry pose has to be
 *     clear of the ambient fleet by the same standoff `closesOnAmbient`
 *     enforces.
 *
 * And a RETURNING actor is guarded against the student even when its spec is
 * not (`playerGuarded` below). The лепка's flag buys one authored thing — a
 * sub-6 m pose during a scripted encounter that is over by the time anything
 * returns. Carrying the flag into a second, unscripted run would mean a car
 * re-entering at its pass speed with no clamp against the one body it must
 * never touch, and „the actor stopped parking at the horizon" is not worth
 * buying with a rear-end.
 *
 * What a RUNNER sees is unchanged in the direction that matters: `finished`
 * still latches on exactly the frame the path ends, and every runner that reads
 * it resolves on that frame (all seven sites in runners.ts are
 * `… || actor.finished` → resolve, and each `step` returns early once
 * `phase === "resolved"`). The un-latch cannot come earlier than the full
 * retirement run — EXIT_CLEAR_M / exitSpeed, ≥ 4.7 s — so no runner is still
 * looking.
 */
/**
 * FR-B5-CROSS (2026-08-23) — …AND FOR A CAR THAT CROSSES THE STUDENT'S ROAD
 * RATHER THAN SHARING IT, „COME BACK" WAS NEVER REACHABLE.
 *
 * FR-B5-RETURN above measured two things from the AUTHORED HOLD: it re-entered
 * there, and it asked whether the student was `RETURN_CLEAR_M` past it ALONG
 * THE ACTOR'S OWN PATH. Both are right for an actor driving the student's road
 * — every example in its own justification is one (`sc-lndc-target`,
 * `sc-mrg-mainline`, the лепка). Both are wrong for an actor whose path CROSSES
 * that road, and the two failures compound:
 *
 *  - „how far past me is he" becomes „how far ACROSS my carriageway is he",
 *    which is bounded by the width of a street and cannot grow;
 *  - the hold of a crossing actor is authored to be SEEN, not hidden — this
 *    catalogue's own `sc-jxgb-conflict` carries forty lines explaining that its
 *    −45 m hold „puts the car where the glance is aimed" — so re-entering there
 *    is the windscreen pop guard 1 exists to forbid.
 *
 * MEASURED, level 1, production stack (`compileScenario` + `createTrafficSystem`
 * + `createScenarioDirector`), driving each drill the way its own instructions
 * read; `proj` is the student projected onto the actor's path:
 *
 *   sc-jx-giveway-b1 `sc-jxgb-conflict`   proj.s − holdS = 40.94 m  (bar: 70)
 *   sc-ed-d2-priority-run `sc-edpr-right` proj.s − holdS = 69.71 m  (bar: 70)
 *
 * 40.94 is not a pose, it is a CEILING: the student's projection onto an
 * east–west boulevard depends only on his x, so the figure is 40.94 at the Б1
 * line (y = 118) and 40.94 at the exit gate (y = 178) and 40.94 everywhere else
 * he can legally be. The second row is the same defect twenty-nine centimetres
 * from the other side of the bar. Both cars therefore made ONE crossing and
 * then stood still for the rest of the lesson:
 *
 *   sc-jxgb-conflict  at rest (−190.0, 154.1) from t = 60 s → 150 s of a 210 s
 *                     lesson with the priority boulevard the drill is about
 *                     empty, and the audited drive still on ЗАДАЧА 1/3 at
 *                     t = 108 s (finding c335a08f, its own cited frame);
 *   sc-edpr-right     at rest (−658, 41) from t ≈ 170 s (finding 76d2e929,
 *                     „a priority lesson with ZERO moving traffic").
 *
 * THE REPAIR IS TO MEASURE FROM THE POSE THE ACTOR ACTUALLY RE-ENTERS AT, AND
 * TO RE-ENTER AT THE START OF ITS PATH. `holdS` is 75 m into the give-way
 * actor's 240 m path and 110 m into the d2 actor's 365 m one; subtracting it
 * spent the whole clearance budget on road the student was never going to
 * drive. From arc 0 the same two drives read `proj.s` = 115.9 m and 179.9 m,
 * both clear of the bar, and the re-entry pose — the far end of the boulevard,
 * (120.0, 154.1) — is 121.4 m from the student instead of 54.6 m.
 *
 * THE STRAIGHT-LINE FLOOR IS THE OTHER HALF, AND IT IS AN ADDITION. Guard 1
 * used to be an along-the-path test ONLY, which says nothing about metres when
 * the path bends back on itself or when the student is not travelling along it
 * at all. It now must ALSO hold in plain distance, so „never within
 * RETURN_CLEAR_M of the student" is true of every re-entry rather than only of
 * the ones where the two happen to coincide. Nothing that used to be refused is
 * now allowed on that axis; the pre-existing test case at 30 m stays refused,
 * and it is refused by BOTH clauses now instead of one.
 *
 * WHAT THIS BUYS THE STUDENT, and it is the point of the lesson rather than a
 * metric: a boulevard with priority traffic on it keeps having priority traffic
 * on it. „Б1 не значи спри винаги" cannot be taught by a street where the one
 * car went by at t = 50 s and nothing ever came again — a student who waits, as
 * that drill's own instruction 4 tells him to, then learns that waiting is free
 * and that the road is always clear. It is not, and the returning car is
 * graded by the runtime's own give-way adjudication exactly as the first one
 * was, so pulling out in front of it is convicted and yielding to it is
 * commended — with the actor `playerGuarded` (below) on every run after the
 * first, so the car that comes back can never be the one that hits him.
 */
const RETURN_CLEAR_M = EXIT_CLEAR_M;
/** Numeric ids for published staged states (ambient ids are 0..count-1). */
export const STAGED_STATE_ID_BASE = 1000;

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

export interface StagedPath {
  px: Float64Array;
  py: Float64Array;
  cum: Float64Array;
  length: number;
  /** Arc position of each spec path node (vehicles; ends inclusive). */
  nodeS: number[];
}

/**
 * Resolve a node sequence into one concatenated lane-center polyline.
 * Consecutive pairs must be connected by a directed lane; a lateral jog
 * between lanes of different offsets becomes a real connector segment (the
 * actor drives smoothly through it instead of teleporting like ambient
 * agents do at lane boundaries). Returns null on any unresolvable hop.
 */
export function resolveStagedVehiclePath(
  graph: LaneGraph,
  pathNodes: readonly string[],
  extraRightOffsetM: number,
): StagedPath | null {
  if (pathNodes.length < 2) return null;
  const points: number[][] = [];
  const nodePointIdx: number[] = [0];

  for (let i = 0; i < pathNodes.length - 1; i++) {
    const from = pathNodes[i];
    const to = pathNodes[i + 1];
    const out = graph.nodeOut.get(from);
    let laneIdx = -1;
    if (out) {
      for (const li of out) {
        if (graph.lanes[li].toNode === to) {
          laneIdx = li;
          break;
        }
      }
    }
    if (laneIdx === -1) return null;
    const lane = graph.lanes[laneIdx];
    // Lane polylines are already lane-center; apply the extra curb offset by
    // re-offsetting the lane points (stage-time allocation only).
    let lx = lane.px;
    let ly = lane.py;
    if (extraRightOffsetM !== 0) {
      const pts: number[][] = [];
      for (let p = 0; p < lane.px.length; p++) pts.push([lane.px[p], lane.py[p]]);
      const off = offsetPolyline(pts, extraRightOffsetM);
      lx = off.px;
      ly = off.py;
    }
    for (let p = 0; p < lx.length; p++) {
      const x = lx[p];
      const y = ly[p];
      const last = points[points.length - 1];
      // Dedupe near-coincident joints (equal-offset lanes share endpoints).
      if (last && Math.hypot(last[0] - x, last[1] - y) < 0.02) continue;
      points.push([x, y]);
    }
    nodePointIdx.push(points.length - 1);
  }
  if (points.length < 2) return null;

  const n = points.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const cum = new Float64Array(n);
  px[0] = points[0][0];
  py[0] = points[0][1];
  for (let i = 1; i < n; i++) {
    px[i] = points[i][0];
    py[i] = points[i][1];
    cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  }
  const nodeS = nodePointIdx.map((idx) => cum[idx]);
  return { px, py, cum, length: cum[n - 1], nodeS };
}

/** Explicit polyline (pedestrian paths are authored point lists). */
export function buildStagedPedPath(path: ReadonlyArray<{ x: number; y: number }>): StagedPath | null {
  if (path.length < 2) return null;
  const n = path.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const cum = new Float64Array(n);
  px[0] = path[0].x;
  py[0] = path[0].y;
  for (let i = 1; i < n; i++) {
    px[i] = path[i].x;
    py[i] = path[i].y;
    cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  }
  if (!(cum[n - 1] > 0.2)) return null;
  return { px, py, cum, length: cum[n - 1], nodeS: [] };
}

/**
 * Explicit polyline path for a staged VEHICLE that rides an authored line
 * OUTSIDE the road graph (the RX „жп прелез" train on its perpendicular rail).
 * Identical geometry to buildStagedPedPath, but every vertex's arc is exposed
 * as a `nodeS` entry so `hold.nodeIndex`/`offsetM` index the polyline exactly
 * like a lane-graph path (createStagedVehicle reads path.nodeS[nodeIndex]).
 */
export function buildStagedVehiclePolylinePath(
  path: ReadonlyArray<{ x: number; y: number }>,
): StagedPath | null {
  const base = buildStagedPedPath(path);
  if (!base) return null;
  return { ...base, nodeS: Array.from(base.cum) };
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/** Internal command state (discriminant mirrors StagedCommand.type). */
interface CommandState {
  type: StagedCommand["type"];
  speedMps: number;
  gapM: number;
  maxSpeedMps: number;
  decelMps2: number;
}

/** Mutable view backing object — same identity for the actor's lifetime. */
interface MutableView {
  id: string;
  kind: "vehicle" | "pedestrian";
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
  s: number;
  pathLengthM: number;
  nodeS: readonly number[];
  finished: boolean;
  indicator: VehicleIndicator;
  lateralOffsetM: number;
  /** FR-B5-RETURN re-entry count — see StagedActorView.returns. */
  returns: number;
}

export interface StagedVehicleAgent {
  spec: StagedVehicleSpec;
  path: StagedPath;
  state: TrafficVehicleState;
  view: MutableView;
  command: CommandState;
  holdS: number;
  s: number;
  speed: number;
  segHint: number;
  playerSegHint: number;
  finished: boolean;
  /** Lateral channel (laneShift): current published offset right of the
   *  resolved path, m. 0 for every actor never commanded — byte-identical
   *  pre-laneShift publishing. */
  lat: number;
  /** laneShift target offset, m (== lat when no glide is running). */
  latTarget: number;
  /** Signed glide rate toward latTarget, m/s (0 = idle channel). */
  latRate: number;
  /** Commanded turn indicator (ledger L6) — published, never inferred. */
  indicator: VehicleIndicator;
  /** FR-B5-EXIT: metres driven PAST the end of the path while retiring. 0 for
   *  every actor that never reaches its end — byte-identical publishing. */
  exitM: number;
  /** Speed of the retirement run, m/s (0 = not retiring; set once, at the
   *  frame the actor runs out of path, so the run is a constant coast). */
  exitSpeed: number;
  /** How many times this actor has come back round (0 for every actor that
   *  never retires — the counter a test can read without a stopwatch). */
  returns: number;
  /** FR-B5-CROSS: the player's distance to this actor's PATH on the previous
   *  frame, so „he is moving onto my road" can be told from „he is driving
   *  along beside it". Infinity until the first frame that measures it, and
   *  measured only for an actor that has come back round — every actor with
   *  `returns === 0` keeps it at Infinity and does no work at all. */
  playerPathDist: number;
  /**
   * FR-B5-FACING: the student's last unit travel direction observed while he
   * was ABOVE the stopped bar, and the pose the next delta is measured from.
   * (0, 0) = never seen moving, which is the „say nothing" value every guard
   * below treats as „unknown".
   *
   * Carried per-agent rather than read from `StagedEnv`, for the same reason
   * `playerPathDist` is: `StagedEnv` publishes a position and a speed and no
   * heading (system.ts owns that struct, and a field there is a different
   * lane's edit), so the only heading available here is the one this file
   * differentiates for itself. Four numbers and six flops a frame, no
   * allocation, and no projection — the trend that costs a `projectOntoPolyline`
   * is `playerPathDist`, above, and this deliberately is not one.
   */
  playerDirX: number;
  playerDirY: number;
  playerLastX: number;
  playerLastY: number;
}

export interface StagedPedestrianAgent {
  spec: StagedPedestrianSpec;
  path: StagedPath;
  state: TrafficPedestrianState;
  view: MutableView;
  walking: boolean;
  s: number;
  segHint: number;
  finished: boolean;
  /** Currently counted in the crossing occupancy map. */
  onRoad: boolean;
}

/** What staged updates read each frame — refreshed by system.ts. */
export interface StagedEnv {
  hasPlayer: boolean;
  playerX: number;
  playerY: number;
  playerSpeedMps: number;
  crossingCounts: Map<string, number>;
  /**
   * The AMBIENT agents' published states — the other half of FR-27's honesty
   * fix. The header's v1 limitation ("ambient agents do not see staged
   * actors") cut both ways: a scripted actor also drove straight through an
   * ambient car. Measured on 2026-08-02 with 4 ambient agents on the
   * junction/signals/following districts: five templates put an ambient car
   * and a staged actor within **0.02–0.05 m of centres** — two bodies in the
   * same place. Not a theory; a photograph waiting to happen.
   *
   * Empty array = the pre-change behaviour, bit-identical.
   */
  ambient: readonly TrafficVehicleState[];
  /**
   * The OTHER STAGED actors' published states, read only by the return-lap
   * clamp (step 3c). Absent = the pre-change behaviour, bit-identical, which is
   * what every caller that never sets it gets.
   *
   * WHY IT IS NOT SIMPLY APPENDED TO `ambient`. That array is read by step 2b's
   * corridor guard on EVERY run, and staged actors are authored against each
   * other on purpose — a stream's column, the лепка overtaking the лидер, the
   * staged collisions. Making them brake for one another during a scripted
   * encounter is a re-choreographed lesson. This list is consulted only where
   * `returns > 0` already gates.
   */
  staged?: readonly TrafficVehicleState[];
}

const samp = { x: 0, y: 0, dirX: 0, dirY: 0, segHint: 0 };

/** Shared empty list for `env.staged` when a caller never sets it — the clamp
 *  in step 3c allocates nothing on the per-frame path. */
const EMPTY_BODIES: readonly TrafficVehicleState[] = [];

/**
 * Hold arcs onto the path. BOTH bounds are load-bearing and NEITHER is
 * exercised by the shipped catalogue — measured 2026-08-19, 113 hold-carrying
 * actors reachable from SCENARIO_TEMPLATES + EXAM_SHELLS, staged against their
 * own districts: 0 high-clamped, 0 low-clamped. An adversarial re-read found
 * the ceiling inert (remove it → 57 files / 549 tests of traffic + orchestrator
 * still green) and the floor caught only by one test six hundred files away
 * (signals-sweep161.test.ts:234). That is a difference in luck, not in kind.
 *
 * Kept, because `sampleLane` (graph.ts) clamps the segment INDEX and not the
 * interpolant: off either end it evaluates t outside [0,1] and returns a point
 * marching away down the final segment forever. An actor whose authored hold
 * misses its path therefore gets a plausible pose in the terrain — no NaN, no
 * error — the encounter the lesson is built around never happens, and the
 * student is handed a green tick for a skill nothing measured. Clamped, he
 * stands at the end of his own road where the reachability battery can still
 * see him; refusing him outright would delete the encounter instead.
 *
 * Pinned by __tests__/staged-hold-clamp.test.ts, which fails on the removal of
 * either bound AND on a clamp that moves an interior hold — and whose §2 sweeps
 * the catalogue so the day an authored hold does fall outside its path it is
 * named rather than quietly parked at the end of the road.
 */
function clampArc(path: StagedPath, s: number): number {
  return s < 0 ? 0 : s > path.length ? path.length : s;
}

/**
 * Would advancing `step` m along the published heading put this actor inside
 * an ambient body it is not already inside? The FR-B5-FREEZE rule, factored so
 * the on-path advance and the FR-B5-EXIT retirement run answer to one clamp:
 * refuse only a CLOSING step, because a step that grows the separation cannot
 * create an overlap the previous pose did not already have.
 */
function closesOnAmbient(agent: StagedVehicleAgent, env: StagedEnv, step: number): boolean {
  return closesOnBodies(agent, env.ambient, step);
}

/** The body of `closesOnAmbient`, over any list of published vehicle states —
 *  `env.staged` reuses it verbatim (step 3c) rather than owning a second copy
 *  of the same separation arithmetic. */
function closesOnBodies(
  agent: StagedVehicleAgent,
  bodies: readonly TrafficVehicleState[],
  step: number,
): boolean {
  const nx = agent.state.x + agent.state.dirX * step;
  const ny = agent.state.y + agent.state.dirY * step;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a === agent.state) continue;
    const sep = vehicleHalfLengthM(agent.spec.profile) + vehicleHalfLengthM(a.profile) + 0.5;
    const dAfter = Math.hypot(a.x - nx, a.y - ny);
    if (dAfter >= sep) continue;
    const dBefore = Math.hypot(a.x - agent.state.x, a.y - agent.state.y);
    if (dAfter >= dBefore) continue; // moving away — never a reason to freeze
    return true;
  }
  return false;
}

/**
 * …AND THE SAME QUESTION ABOUT THE PLAYER — 2026-08-18, the gate pass.
 *
 * `closesOnAmbient` was factored out so „the on-path advance and the
 * FR-B5-EXIT retirement run answer to one clamp". Only HALF of the on-path
 * promise was carried over: step 2 above is the PLAYER guard, and it works by
 * lowering `target`, which the retirement branch does not read — it drives on
 * `exitSpeed`, fixed at the frame the path ran out. So a retiring actor was
 * held off every ambient body in the world and off nothing else.
 *
 * MEASURED with the player standing 20 m past the end of the path,
 * `playerGuard` defaulted: closest approach to the PLAYER 0.000 m at 10.0 m/s,
 * against 4.667 m for an ambient body in the identical geometry — and on the
 * pre-FR-B5-EXIT build the actor came to rest 20 m short of him. That is a
 * correct student, stopped where the drill asked him to stop, driven into from
 * behind and billed COLLISION −10 опасна by a car whose only remaining job is
 * to leave the scene. „A staged actor that runs out of path parks in a live
 * lane" is the defect FR-B5-EXIT exists to end; ending it by driving THROUGH
 * the student is not an improvement, it is the same lane's worse twin.
 *
 * Same shape as the ambient clamp — refuse only a CLOSING step, so an actor
 * that is already inside the standoff can still drive out of it — and the same
 * standoff the on-path guard aims for (`GUARD_STOP_SHORT_M`, from the player's
 * centre). Gated on `spec.playerGuard` exactly as step 2 is, so the handful of
 * actors authored to ignore the player (the staged collisions) keep ignoring
 * him here too.
 */
/**
 * Does the player guard apply to this actor right now? The spec's answer,
 * except that FR-B5-RETURN's second and later runs are ordinary flow rather
 * than an authored pose (see the RETURN_CLEAR_M block) and are always guarded.
 */
function playerGuarded(agent: StagedVehicleAgent): boolean {
  return agent.returns > 0 || (agent.spec.playerGuard ?? true);
}

/**
 * FR-B5-REACH (2026-08-31, sc-follow-tailgater:41a625d1) — A 16 m WINDOW IS
 * NOT A GUARD FOR A CAR DOING 61 КМ/Ч.
 *
 * Steps 2 and 2a both open at a FIXED `GUARD_AHEAD_M` and then aim at the
 * linear profile `GUARD_APPROACH_GAIN × (along − GUARD_STOP_SHORT_M)`, braking
 * at `HOLD_DECEL_MPS2`. A stopping distance is quadratic in speed and that
 * window is a constant, so the guard has a top speed above which it cannot
 * work at all — and every actor over it drives through the student instead of
 * stopping short of him. From `along` = 16 m at `HOLD_DECEL_MPS2` = 8 m/s²
 * the actor comes to rest at `16 − v²/16`:
 *
 *   v = 8 m/s   rest at  12.0 m   ← clear
 *   v = 11 m/s  rest at   8.4 m   ← clear (the `sc-ftg-lead` case: it does
 *                                   stop, and the probe measures 6.00 m)
 *   v = 14 m/s  rest at   3.8 m   ← INSIDE him (nose-to-tail touch is 4.07 m)
 *   v = 17 m/s  rest at  −2.1 m   ← never stops; it passes through his centre
 *
 * MEASURED on `sc-follow-tailgater` at L1 through the production stack
 * (`compileScenario` + `createTrafficSystem` + `createScenarioDirector`),
 * driving the lesson's own taught response — 30 км/ч up the right lane to the
 * `sc-ftg-finish` zone, then standing there as the card asks:
 *
 *   `sc-ftg-tail` closes to 0.01 m OF HIS CENTRE at t = 58.3 s, and again on
 *   every one of its ~35 s laps for the rest of the lesson.
 *
 * The лепка leaves its scripted pass under `cruise` at `passSpeedMps` 17 m/s,
 * runs out of road, retires and RE-ENTERS (FR-B5-RETURN) still carrying that
 * command — and 17 m/s is the fourth row of the table. That is a car driven
 * through a stationary, correct student by an unscripted return run, which is
 * the exact thing step 2a's own gate says may never happen: „an unscripted car
 * may never be the one that hits him".
 *
 * SO THE WINDOW BECOMES THE ACTOR'S OWN REACH: it opens where the braking
 * profile first falls below the speed the actor is actually doing, which is
 * that profile read backwards (`v / gain + stopShort`). The profile, the gain,
 * the standoff and the brake cap are all untouched; only the moment the guard
 * starts looking moves, and it moves ONLY when 16 m is too short.
 *
 * GATED ON `returns > 0`, the same line `playerGuarded` and step 2a already
 * draw. Below 8 m/s the widened window is smaller than `GUARD_AHEAD_M` and the
 * `max` returns the old constant, so most actors would be unaffected anyway —
 * but a first run is an encounter the orchestrator TIMED and the rule engine is
 * grading, and an authored car that starts easing 11 m earlier than it used to
 * is a re-choreographed lesson. Every scripted encounter keeps the exact
 * geometry it was authored against; the unscripted laps nobody timed get a
 * guard that can actually finish.
 */
function guardWindowM(agent: StagedVehicleAgent): number {
  if (agent.returns === 0) return GUARD_AHEAD_M;
  return Math.max(GUARD_AHEAD_M, agent.speed / GUARD_APPROACH_GAIN + GUARD_STOP_SHORT_M);
}

function closesOnPlayer(agent: StagedVehicleAgent, env: StagedEnv, step: number): boolean {
  if (!env.hasPlayer || !playerGuarded(agent)) return false;
  const nx = agent.state.x + agent.state.dirX * step;
  const ny = agent.state.y + agent.state.dirY * step;
  const dAfter = Math.hypot(env.playerX - nx, env.playerY - ny);
  if (dAfter >= GUARD_STOP_SHORT_M) return false;
  const dBefore = Math.hypot(env.playerX - agent.state.x, env.playerY - agent.state.y);
  return dAfter < dBefore;
}

/**
 * Is `arc` a pose this actor may materialise at right now? Guards (1) and (3)
 * of the RETURN_CLEAR_M block, asked about one arc.
 */
function reentryClearAt(
  agent: StagedVehicleAgent,
  env: StagedEnv,
  arc: number,
  projS: number,
  projDist: number,
): boolean {
  // The pose at `arc`. `lat` and `exitM` are both zeroed by the rewind, so the
  // sampled point IS that pose — one sample, no allocation.
  sampleLane(agent.path, arc, 0, samp);
  const ex = samp.x;
  const ey = samp.y;
  // (3) Never materialise inside a body: the re-entry pose has to be clear of
  //     the ambient fleet by the standoff `closesOnAmbient` enforces.
  for (let i = 0; i < env.ambient.length; i++) {
    const a = env.ambient[i];
    if (a === agent.state) continue;
    const sep = vehicleHalfLengthM(agent.spec.profile) + vehicleHalfLengthM(a.profile) + 0.5;
    if (Math.hypot(a.x - ex, a.y - ey) < sep) return false;
  }
  if (!env.hasPlayer) return true;
  // (1) …and never in his windscreen. Measured ALONG THE ACTOR'S OWN PATH (the
  //     projection `matchPlayer` already takes), so „behind him" means behind on
  //     the road, not merely far away in a straight line…
  if (projS - arc < RETURN_CLEAR_M) return false;
  // …AND the same clearance in plain metres. That second half is new
  // (FR-B5-CROSS) and it is an ADDITION: the along-path test says nothing about
  // how many metres away the pose actually is when the path bends back on
  // itself, or when the student is not travelling along it at all.
  if (Math.hypot(ex - env.playerX, ey - env.playerY) < RETURN_CLEAR_M) return false;
  // (1b) FR-B5-FACING (2026-08-30, sc-jx-equal-left:4274eddb) — …AND NEITHER
  //      HALF OF (1) IS A CLEARANCE WHEN THE ACTOR IS COMING THE OTHER WAY.
  //
  //      Guard (1) states its property in words: „on a road he is driving the
  //      re-entry always happens behind him, never in front of him". That
  //      derivation is sound for the actors its own justification names — the
  //      лепка, `sc-lndc-target`, `sc-mrg-mainline` — because each of them
  //      travels the student's road IN HIS DIRECTION, so his arc and the
  //      actor's grow together and „he is RETURN_CLEAR_M further along my path"
  //      really does mean „he has driven past this pose already".
  //
  //      For an actor travelling the SAME ROAD AGAINST HIM the identical
  //      inequality guarantees the opposite, and does so the harder it is
  //      satisfied: the car materialises RETURN_CLEAR_M of carriageway IN FRONT
  //      of him and then drives every one of those metres AT him. The
  //      straight-line floor added by FR-B5-CROSS says the same thing twice —
  //      144.7 m is a long way away and it is a long way away DEAD AHEAD.
  //
  //      MEASURED, sc-jx-equal-left at L1 through the production stack
  //      (`compileScenario` + `createTrafficSystem` + `createScenarioDirector`),
  //      driving the briefing verbatim and then holding the shadow's own yield
  //      pose (4.0625, −19.5) — 19.92 m from the node, the pose
  //      `JUNCTION3_YIELD_Y` is authored to make structurally innocent:
  //
  //        `sc-jxeq-oncoming` retires and RE-ENTERS SEVEN TIMES in 210 s, every
  //        ~28 s, each time at its authored hold (−4.1, 125.0) — the opposing
  //        lane of the student's OWN arm, 144.7 m directly up the road he is
  //        facing — and drives south through the junction he is stopped in.
  //        Both runners resolved long before, so every one of those passes is
  //        an unscripted car the template never staged him against.
  //
  //      templates-junctions3.ts measured what that does to the drive and named
  //      this branch as its owner: at 15 + 20 s of patience the correct drive
  //      takes FAILED_TO_YIELD ×2 and a COLLISION at (−2.0, −0.6) — x ≈ −2 is
  //      the ONCOMING lane at the node, i.e. this actor, met head-on by a
  //      student executing the left turn the lesson exists to teach. It is a
  //      WINDOW, not a slope (clean at 19 s and at 55 s of waiting, convicted at
  //      35), because ~35 s is this actor's round trip on these 130 m arms.
  //
  //      THE THREE CONJUNCTS, and none of them is a new number:
  //
  //       · `projDist < ON_ACTORS_ROAD_M` — he is ON my road rather than
  //         crossing it. That is the classification this file already measured
  //         and already draws (see the constant), and it is what keeps the
  //         clause off every give-way and priority drill FR-B5-CROSS exists
  //         for: `sc-jxgb-conflict` 36.06 m, `sc-edpr-right` 39.90 m and this
  //         template's own `sc-jxeq-right` 23.6 m are all CROSSING actors, all
  //         still return, and their boulevards keep producing cars. A car from
  //         the right is priority traffic and yielding to it is the lesson; a
  //         car coming down your own lane at you while you sit at the junction
  //         is not traffic, it is the windscreen pop guard (1) forbids.
  //       · the dot product — his last travel direction against the actor's
  //         direction WHERE THE TWO WOULD MEET (sampled at his projection, not
  //         at the re-entry pose, because on a bending path those differ and it
  //         is the meeting that matters). (0, 0) = never observed moving = say
  //         nothing and allow, so a suite that never moves its player is
  //         byte-identical.
  //       · `HOLD_LIT_SPEED_MPS` — he is STOPPED. This is what keeps the clause
  //         off the oncoming stream of an overtaking drill, where a car coming
  //         the other way is the entire exercise: a MOVING student meets it in
  //         the far lane and passes it, which is traffic. A student at rest on
  //         a carriageway is at rest for one reason — he is at a junction — and
  //         he will still be exactly there when the car arrives, so the
  //         clearance guard (1) computed is spent on road the actor drives and
  //         he does not. The bar is the file's own stopped bar, the one the
  //         ambient fleet lights its brake lamps at.
  //
  //      WHAT IT COSTS: this actor stands off-scene at EXIT_CLEAR_M past the end
  //      of its path — never in a live lane, which is what FR-B5-EXIT bought —
  //      until he moves off, and it comes back the moment he does. The junction
  //      is NOT left dead while he waits: `sc-jxeq-right` is unaffected and
  //      keeps crossing it every ~28 s.
  if (
    env.playerSpeedMps <= HOLD_LIT_SPEED_MPS &&
    projDist < ON_ACTORS_ROAD_M &&
    projS > arc &&
    (agent.playerDirX !== 0 || agent.playerDirY !== 0)
  ) {
    // `ex`/`ey` are read out above, so the shared scratch is free to re-use.
    sampleLane(agent.path, projS, 0, samp);
    if (samp.dirX * agent.playerDirX + samp.dirY * agent.playerDirY < 0) return false;
  }
  return true;
}

/**
 * How far off this actor's path the student can be and still count as DRIVING
 * IT rather than crossing it (FR-B5-CROSS). Both bounds are measured, not
 * chosen:
 *
 *  - every same-road actor in the catalogue rides exactly ONE LANE PITCH off
 *    the student's line by authored construction — `extraRightOffsetM` is
 *    ±8.125 / ±8.13 on `sc-lndc-target`, `sc-mrg-mainline`, `sc-mle-through-car`
 *    — so 8.13 m is the widest „he is on my road" this catalogue produces;
 *  - the narrowest „he is crossing my road" measured on the two drills this
 *    exists for is 36.06 m (`sc-jxgb-conflict`, the student at the Б1 line) and
 *    39.90 m (`sc-edpr-right`).
 *
 * Two lane pitches is double the first and less than half the second, which is
 * as much daylight as a single number can have. It decides ONE thing — whether
 * an actor may fall back to the far end of its road when its authored hold is
 * unusable — and getting it wrong in the loose direction would let an oncoming
 * STREAM take that fallback, where every car of it re-enters at the same arc
 * and the authored column (`OncomingStreamRunner.stage` spaces them by
 * `gapsM`) collapses into one clump of overlapping bodies.
 */
const ON_ACTORS_ROAD_M = 16.25;

/**
 * FR-B5-RETURN / FR-B5-CROSS — may this retired actor come back round, and at
 * which arc? Returns the arc to re-enter at, or −1 for „not yet".
 *
 * TWO CANDIDATES, IN THE AUTHOR'S ORDER OF PREFERENCE.
 *
 *  1. THE AUTHORED HOLD, always tried first, because whatever the template
 *     encoded in it survives the return — a stream's stagger, the лепка's tuck
 *     behind the spawn. Every actor that returned before FR-B5-CROSS still
 *     returns here, at the same arc, and this is the only candidate an actor on
 *     the student's own road is ever offered.
 *  2. THE FAR END OF ITS OWN ROAD (arc 0), offered ONLY to an actor whose road
 *     the student is CROSSING rather than driving. For those the hold is no
 *     use: `sc-jxgb-conflict`'s is authored to sit where the student's right
 *     glance is aimed, 54.6 m from him, and the clearance from it tops out at
 *     40.94 m against a 70 m bar — see the FR-B5-CROSS block. Arc 0 is where
 *     that boulevard enters the scene, 121.4 m away, and it is the one pose
 *     every path has.
 *
 * `holdS > 0` on the second candidate only skips asking the identical question
 * twice: an actor authored to hold AT its path origin has already been offered
 * that arc as candidate 1.
 */
function reentryArc(agent: StagedVehicleAgent, env: StagedEnv): number {
  // (2) A one-shot hazard on its own rail crosses the road once, as written.
  if (agent.spec.railPath !== undefined) return -1;
  const proj = env.hasPlayer
    ? projectOntoPolyline(
        agent.path.px,
        agent.path.py,
        agent.path.cum,
        env.playerX,
        env.playerY,
      )
    : { s: Infinity, dist: Infinity };
  if (reentryClearAt(agent, env, agent.holdS, proj.s, proj.dist)) return agent.holdS;
  if (
    proj.dist > ON_ACTORS_ROAD_M &&
    agent.holdS > 0 &&
    reentryClearAt(agent, env, 0, proj.s, proj.dist)
  ) {
    return 0;
  }
  return -1;
}

/**
 * The BODY half of `reset` and of FR-B5-RETURN's re-entry — pose, lateral
 * channel and retirement state back to one arc on the path. Factored so the
 * orchestrator's re-arm and the re-entry cannot drift apart in anything but
 * the arc itself; `reset` additionally forces the command to „hold", which is
 * the one thing a return must NOT do (it is re-entering the flow under the
 * command it left with).
 *
 * The two arcs differ ON PURPOSE (FR-B5-CROSS). `reset` is the ORCHESTRATOR
 * re-arming an actor for a scripted encounter it is about to time, so it goes
 * to the pose the template authored for that. A RETURN is unscripted flow, so
 * it goes to the far end of the actor's own road, which is where traffic comes
 * from and the only pose that is off-scene for every actor rather than only
 * for the ones whose author happened to hide it.
 */
function rewindTo(agent: StagedVehicleAgent, arc: number): void {
  agent.s = arc;
  agent.speed = 0;
  agent.segHint = 0;
  agent.finished = false;
  agent.lat = 0;
  agent.latTarget = 0;
  agent.latRate = 0;
  agent.exitM = 0;
  agent.exitSpeed = 0;
}

export function createStagedVehicle(
  spec: StagedVehicleSpec,
  path: StagedPath,
  stateId: number,
): StagedVehicleAgent {
  const nodeIdx = Math.min(Math.max(spec.hold.nodeIndex, 0), path.nodeS.length - 1);
  const holdS = clampArc(path, path.nodeS[nodeIdx] + spec.hold.offsetM);
  const agent: StagedVehicleAgent = {
    spec,
    path,
    state: {
      id: stateId,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      braking: false,
      colorIndex: spec.colorIndex ?? 0,
      // FO-06 size/type profile — only present when the spec authors one, so
      // profile-less staged actors publish the exact pre-profile state shape.
      ...(spec.profile !== undefined ? { profile: spec.profile } : {}),
      // L6: every staged VEHICLE carries the indicator channel from birth, so
      // the renderer never has to guess. Ambient agents still publish no key.
      indicator: "off",
    },
    view: {
      id: spec.id,
      kind: "vehicle",
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      s: holdS,
      pathLengthM: path.length,
      nodeS: path.nodeS,
      finished: false,
      indicator: "off",
      lateralOffsetM: 0,
      returns: 0,
    },
    command: { type: "hold", speedMps: 0, gapM: 0, maxSpeedMps: 0, decelMps2: 0 },
    holdS,
    s: holdS,
    speed: 0,
    segHint: 0,
    playerSegHint: 0,
    finished: false,
    lat: 0,
    latTarget: 0,
    latRate: 0,
    indicator: "off",
    exitM: 0,
    exitSpeed: 0,
    returns: 0,
    playerPathDist: Infinity,
    playerDirX: 0,
    playerDirY: 0,
    playerLastX: NaN,
    playerLastY: NaN,
  };
  publishVehicle(agent);
  return agent;
}

export function createStagedPedestrian(
  spec: StagedPedestrianSpec,
  path: StagedPath,
  stateId: number,
): StagedPedestrianAgent {
  const agent: StagedPedestrianAgent = {
    spec,
    path,
    state: {
      id: stateId,
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      walkPhase: 0,
      onCrossing: false,
      colorIndex: spec.colorIndex ?? 0,
      // VP-11 standing pose — only present when the spec authors one, so
      // pose-less staged pedestrians publish the exact pre-pose state shape.
      ...(spec.pose !== undefined ? { pose: spec.pose } : {}),
      // R3 #25–28 body variant (child / elder+cane) — the same discipline:
      // only present when authored; variant-less actors publish the exact
      // pre-variant state shape. Visual only (TrafficLayer's rig mapping).
      ...(spec.variant !== undefined ? { variant: spec.variant } : {}),
    },
    view: {
      id: spec.id,
      kind: "pedestrian",
      x: 0,
      y: 0,
      dirX: 1,
      dirY: 0,
      speedMps: 0,
      s: 0,
      pathLengthM: path.length,
      nodeS: path.nodeS,
      finished: false,
      // Pedestrians have no indicator / lateral channel and never re-enter —
      // the view fields exist only so one MutableView shape backs both actor
      // kinds.
      indicator: "off",
      lateralOffsetM: 0,
      returns: 0,
    },
    walking: false,
    s: 0,
    segHint: 0,
    finished: false,
    onRoad: false,
  };
  publishPedestrian(agent, 0);
  return agent;
}

export function applyStagedCommand(
  agent: StagedVehicleAgent | StagedPedestrianAgent,
  command: StagedCommand,
  env: StagedEnv,
): void {
  if (agent.view.kind === "vehicle") {
    const v = agent as StagedVehicleAgent;
    switch (command.type) {
      case "hold":
        v.command.type = "hold";
        break;
      case "cruise":
        v.command.type = "cruise";
        v.command.speedMps = command.speedMps ?? v.spec.cruiseSpeedMps;
        break;
      case "matchPlayer":
        v.command.type = "matchPlayer";
        v.command.gapM = command.gapM;
        v.command.maxSpeedMps = command.maxSpeedMps;
        // FR-56 rolling start: the actor enters the mirror ALREADY TRAVELLING
        // rather than launching from the kerb. Never slows an actor that is
        // already faster, and never exceeds the command's own cap.
        if (command.seedSpeedMps !== undefined) {
          const seed = Math.min(command.seedSpeedMps, command.maxSpeedMps);
          if (v.speed < seed) v.speed = seed;
        }
        break;
      case "brake":
        v.command.type = "brake";
        v.command.decelMps2 = command.decelMps2 ?? DEFAULT_SLAM_DECEL_MPS2;
        break;
      case "laneShift": {
        // Lateral channel only — the longitudinal command keeps driving speed.
        const ramp = command.rampSec ?? DEFAULT_LANE_SHIFT_RAMP_SEC;
        v.latTarget = command.toOffsetM;
        v.latRate = ramp > 0 ? (v.latTarget - v.lat) / ramp : 0;
        if (ramp <= 0) v.lat = v.latTarget; // degenerate ramp = instant
        break;
      }
      case "setIndicator":
        // L6: an explicit, commanded lamp. Published immediately (not on the
        // next integration step) so «мигачът светна» is true from this frame —
        // the ≥ 3 s lead the runners assert is measured from here.
        v.indicator = command.indicator;
        v.state.indicator = command.indicator;
        v.view.indicator = command.indicator;
        break;
      case "reset":
        v.command.type = "hold";
        rewindTo(v, v.holdS);
        v.indicator = "off";
        publishVehicle(v);
        break;
    }
    return;
  }
  const p = agent as StagedPedestrianAgent;
  switch (command.type) {
    case "cruise":
      p.walking = true;
      break;
    case "hold":
      p.walking = false;
      break;
    case "reset":
      p.walking = false;
      p.s = 0;
      p.segHint = 0;
      p.finished = false;
      setPedOnRoad(p, false, env.crossingCounts);
      publishPedestrian(p, 0);
      break;
    default:
      break; // matchPlayer / brake / laneShift / setIndicator are vehicle-only
  }
}

// ---------------------------------------------------------------------------
// Per-frame updates
// ---------------------------------------------------------------------------

export function updateStagedVehicle(agent: StagedVehicleAgent, dt: number, env: StagedEnv): void {
  const spec = agent.spec;
  const cmd = agent.command;
  const accel = spec.accelMps2 ?? DEFAULT_ACCEL_MPS2;
  const decel = spec.decelMps2 ?? DEFAULT_DECEL_MPS2;

  // 0) FR-B5-FACING — which way is the student pointing? Differentiated here
  //    because `StagedEnv` carries no heading (see the agent's own field), and
  //    LATCHED: the answer is needed at the moment the re-entry branch asks,
  //    and that moment is precisely one at which he is standing still. Only a
  //    delta taken while he was ABOVE the stopped bar is trusted, so creep and
  //    float never rewrite the direction he actually arrived on.
  //
  //    Reads nothing and decides nothing on its own — `reentryClearAt` (1b) is
  //    the only consumer, and for every actor it never refuses this is dead
  //    weight of four numbers and six flops.
  if (env.hasPlayer) {
    if (
      env.playerSpeedMps > HOLD_LIT_SPEED_MPS &&
      !Number.isNaN(agent.playerLastX)
    ) {
      const dx = env.playerX - agent.playerLastX;
      const dy = env.playerY - agent.playerLastY;
      const m = Math.hypot(dx, dy);
      if (m > 1e-4) {
        agent.playerDirX = dx / m;
        agent.playerDirY = dy / m;
      }
    }
    agent.playerLastX = env.playerX;
    agent.playerLastY = env.playerY;
  } else {
    // …and a player who LEAVES invalidates the anchor, not the answer. Without
    // this the first frame he comes back differences his new pose against a
    // pose from before he went away — a teleport — and a teleport normalises to
    // a unit vector as happily as a metre of driving does. The latched
    // direction survives; only the baseline is dropped.
    agent.playerLastX = NaN;
  }

  // 1) Target speed from the active command.
  let target = 0;
  let brakeCap = decel;
  switch (cmd.type) {
    case "hold":
      target = 0;
      brakeCap = HOLD_DECEL_MPS2;
      break;
    case "cruise":
      target = agent.finished ? 0 : cmd.speedMps;
      break;
    case "matchPlayer": {
      if (env.hasPlayer && !agent.finished) {
        const proj = projectOntoPolyline(
          agent.path.px,
          agent.path.py,
          agent.path.cum,
          env.playerX,
          env.playerY,
        );
        // Too little gap → pull away faster than the player; too much → ease
        // off and let them close in.
        const gap = agent.s - proj.s;
        target = env.playerSpeedMps + MATCH_GAIN * (cmd.gapM - gap);
        if (target > cmd.maxSpeedMps) target = cmd.maxSpeedMps;
        if (target < 0) target = 0;
      } else {
        target = 0;
      }
      break;
    }
    case "brake":
      target = 0;
      brakeCap = cmd.decelMps2;
      break;
    default:
      target = 0;
  }

  // 2) Player guard — never ram the player from behind (skip while slamming:
  //    a brake command is already the strongest stop available).
  if (cmd.type !== "brake" && playerGuarded(agent) && env.hasPlayer) {
    const relX = env.playerX - agent.state.x;
    const relY = env.playerY - agent.state.y;
    const along = relX * agent.state.dirX + relY * agent.state.dirY;
    const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
    if (along > 0 && along < guardWindowM(agent) && lateral < GUARD_LATERAL_M) {
      const guardTarget = Math.max(0, (along - GUARD_STOP_SHORT_M) * GUARD_APPROACH_GAIN);
      if (guardTarget < target) {
        target = guardTarget;
        brakeCap = HOLD_DECEL_MPS2;
      }
    }
  }

  // 2a) …AND THE STUDENT STANDING ACROSS THE ACTOR'S ROAD (FR-B5-CROSS).
  //
  //     Step 2 is a FOLLOWING guard: it measures the player in the actor's own
  //     heading frame, so it sees him only inside a 3 m-wide corridor straight
  //     ahead. A student CROSSING the actor's carriageway — which is the entire
  //     event of every give-way and priority drill — is at ~90° to that frame
  //     and is invisible to it until the two bodies are already touching.
  //     Measured on jxg-giveway-v1 the moment FR-B5-CROSS put a second car on
  //     the boulevard: the drill's own correct drive (stop at the Б1 line, wait
  //     25 s, cross) took a 10-point contact at player y = 150.30, t = 70.4 s.
  //     The player is not ahead of the actor; he is ACROSS it, so he has to be
  //     measured the way the actor's road measures things — by arc.
  //
  //     GATED ON `returns > 0`, the same line `playerGuarded` already draws and
  //     for the same reason. The FIRST run is the encounter the orchestrator
  //     timed and the rule engine is grading: a priority car that brakes for a
  //     student who barged out has taken the drill's teeth out. The second and
  //     later runs are unscripted flow that nobody timed, and an unscripted car
  //     may never be the one that hits him.
  //
  //     …AND GATED ON HIM MOVING ONTO THE ROAD, which is the difference between
  //     a car crossing and a car driving along beside you, and is the whole
  //     reason this is not simply step 2 with a wider window. Measured with the
  //     wide window alone, on the three suites that carry same-road actors:
  //
  //       staged-return-run  `sc-lndc-target` covered 231 m of a 150 s window
  //                          instead of 2,093 — the actor caught the crawling
  //                          student, braked to 6 m behind him and FOLLOWED him
  //                          for the rest of the lesson;
  //       s7-ov-corridor     the oncoming choreography never completed;
  //       vru-encounter      the rider could no longer get past.
  //
  //     Every same-road actor in the catalogue rides ONE LANE PITCH off the
  //     student's line by authored construction (`extraRightOffsetM` ±8.125 /
  //     ±8.13 on `sc-lndc-target`, `sc-mrg-mainline`, `sc-mle-through-car`), so
  //     its distance to his path is a CONSTANT and „he is coming onto my road"
  //     is false for it on every frame. For a student crossing a boulevard the
  //     same quantity sweeps 36 m → 0, which is what braking is for. No heading
  //     is available here (`StagedEnv` publishes a position and a speed), so the
  //     trend is carried on the agent — one number, no allocation.
  //
  //     It BRAKES rather than freezing, and it aims to stop `GUARD_STOP_SHORT_M`
  //     short of where he stands on the arc — never on top of it. A hard freeze
  //     was tried first and is the doc 87 item-4 defect wearing a new hat: the
  //     actor stops dead wherever it happens to be, which on this map is inside
  //     the junction mouth, and the student then drives into a stationary body
  //     exactly as the founder photographed.
  if (agent.returns > 0 && env.hasPlayer) {
    const proj = projectOntoPolyline(
      agent.path.px,
      agent.path.py,
      agent.path.cum,
      env.playerX,
      env.playerY,
    );
    const closing = proj.dist < agent.playerPathDist;
    agent.playerPathDist = proj.dist;
    const ahead = proj.s - agent.s;
    if (
      cmd.type !== "brake" &&
      closing &&
      proj.dist < CROSS_WATCH_M &&
      ahead > 0 &&
      ahead < guardWindowM(agent)
    ) {
      const guardTarget = Math.max(0, (ahead - GUARD_STOP_SHORT_M) * GUARD_APPROACH_GAIN);
      if (guardTarget < target) {
        target = guardTarget;
        brakeCap = HOLD_DECEL_MPS2;
      }
    }
  }

  // 2b) AMBIENT guard — never drive through an ambient car either (FR-27).
  //      Deliberately NOT gated on `spec.playerGuard`: that flag exists so the
  //      лепка can hold a sub-6 m pose behind the STUDENT, and nothing is ever
  //      authored to tailgate a boulevard car. Same corridor as the player
  //      guard, but a same-direction ambient car is a LEADER, not a wall — the
  //      gap term is added to its speed, so a staged actor keeps its pace
  //      behind traffic moving at its own speed and only ever loses time to a
  //      car genuinely slower than the script.
  if (cmd.type !== "brake" && env.ambient.length > 0) {
    for (let i = 0; i < env.ambient.length; i++) {
      const a = env.ambient[i];
      if (a === agent.state) continue;
      const relX = a.x - agent.state.x;
      const relY = a.y - agent.state.y;
      const along = relX * agent.state.dirX + relY * agent.state.dirY;
      if (along <= 0 || along >= GUARD_AHEAD_M) continue;
      const lateral = Math.abs(relX * agent.state.dirY - relY * agent.state.dirX);
      if (lateral >= GUARD_LATERAL_M) continue;
      const aligned = a.dirX * agent.state.dirX + a.dirY * agent.state.dirY > 0.7;
      const lead = aligned ? a.speedMps : 0;
      const guardTarget = lead + Math.max(0, (along - GUARD_STOP_SHORT_M) * 0.8);
      if (guardTarget < target) {
        target = guardTarget;
        brakeCap = HOLD_DECEL_MPS2;
      }
    }
  }

  // 3) Integrate speed toward the target (asymmetric accel/brake ramps).
  if (agent.speed < target) {
    agent.speed = Math.min(target, agent.speed + accel * dt);
  } else if (agent.speed > target) {
    agent.speed = Math.max(target, agent.speed - brakeCap * dt);
  }
  const sBefore = agent.s;
  agent.s += agent.speed * dt;

  // 3b) Hard anti-overlap vs ambient cars, from ANY angle. The corridor guard
  //     in 2b handles same-lane following; it cannot see a car crossing the
  //     junction box at 90°, which is exactly where the measurement found the
  //     remaining clips. The arc advance is simply refused when it would put
  //     two bodies inside each other: the previous pose was clear by
  //     induction, so rolling back to it is always safe.
  //
  //     FR-B5-FREEZE (doc 87, 2026-08-05): …but ONLY when the step CLOSES on
  //     that body. Measured from any angle this also caught a car BEHIND the
  //     actor, and the ambient side of the same clamp (vehicles.ts) caught the
  //     actor behind IT — so two bodies 3 m apart froze each other for good.
  //     On `jxg-giveway-v1` that pair came to rest ON the second junction's
  //     node, in the student's own lane, and the correctly-driven drill ended
  //     in a 10-point collision with it. Refusing only a CLOSING step keeps the
  //     „never clip" guarantee exactly (a step that grows the separation cannot
  //     create an overlap) and lets a boxed-in actor drive out.
  if (env.ambient.length > 0 && agent.s > sBefore) {
    if (closesOnAmbient(agent, env, agent.s - sBefore)) {
      agent.s = sBefore;
      agent.speed = 0;
    }
  }

  // 3c) …AND THE SAME HARD REFUSAL AGAINST THE STUDENT, on the RETURN LAPS.
  //
  //     The retirement branch below already answers to `closesOnPlayer`; the
  //     on-path advance answered to nothing but the SOFT guard in step 2, and a
  //     soft guard is a target speed — it can be overshot, and FR-B5-REACH
  //     above is the measurement of it being overshot by 6 m. The widened
  //     window closes that for every speed the profile can still stop from
  //     (≤ 20 m/s at `HOLD_DECEL_MPS2`); this closes it for the rest, and for
  //     the case no window sized off the ACTOR's speed can see — a student
  //     moving toward the actor, whose closing speed is not the actor's own.
  //
  //     Same clamp, same standoff and the same FR-B5-FREEZE discipline as the
  //     ambient half three lines up: refuse only a CLOSING step, so an actor
  //     already inside the standoff can still drive out of it and nothing can
  //     be frozen for good.
  //
  //     `returns > 0` for the reason `guardWindowM` states: a first run is an
  //     encounter the orchestrator timed, and the staged collisions are
  //     authored to reach the player. An unscripted lap is not, and may not.
  //
  //     …AND AGAINST THE OTHER STAGED BODIES, for the residue the player half
  //     creates rather than removes. Two actors that both queue behind one
  //     stopped student aim at the SAME standoff, so the second one comes to
  //     rest inside the first — measured on `sc-follow-tailgater`: `sc-ftg-lead`
  //     and `sc-ftg-tail` both at rest at y = 338.2, one car in the other, in
  //     the student's mirror for 140 s. Before this repair the лепка drove
  //     through the лидер as well as through him, so the overlap is older than
  //     the clamp; standing still is simply the version that photographs.
  if (agent.returns > 0 && agent.s > sBefore) {
    const step = agent.s - sBefore;
    const others = env.staged ?? EMPTY_BODIES;
    if (closesOnPlayer(agent, env, step) || closesOnBodies(agent, others, step)) {
      agent.s = sBefore;
      agent.speed = 0;
    }
  }

  // 4) Path end / loop wrap / retirement run.
  if (spec.loop) {
    if (agent.s >= agent.path.length) {
      agent.s -= agent.path.length;
      agent.segHint = 0;
    }
  } else if (agent.s >= agent.path.length) {
    // FR-B5-EXIT (see EXIT_CLEAR_M): the actor has run out of road, so it
    // DRIVES AWAY instead of parking on the last metre of a live lane.
    //
    // `finished` still latches on exactly the frame it used to, and `agent.s`
    // stays pinned to `path.length` — every runner that reads `actor.finished`
    // or `actor.s` sees the identical number on the identical frame. What
    // changes is only where the BODY is: it keeps going in its final direction
    // until it is EXIT_CLEAR_M past the end, then comes to rest off-scene.
    agent.s = agent.path.length;
    if (!agent.finished) {
      agent.finished = true;
      agent.exitSpeed = Math.max(agent.speed, EXIT_MIN_SPEED_MPS);
    }
    if (agent.exitM < EXIT_CLEAR_M) {
      // The retirement run is held to the SAME promise as the on-path advance
      // above — it is still a body moving through a world with other bodies in
      // it, and „never clip" does not lapse because the path did. BOTH halves
      // of that promise: the ambient fleet (step 2b) and the player (step 2).
      // See `closesOnPlayer` for what the missing half measured.
      const step = Math.min(agent.exitSpeed * dt, EXIT_CLEAR_M - agent.exitM);
      if (
        (env.ambient.length > 0 && closesOnAmbient(agent, env, step)) ||
        closesOnPlayer(agent, env, step)
      ) {
        agent.speed = 0;
      } else {
        agent.exitM += step;
        agent.speed = agent.exitM >= EXIT_CLEAR_M ? 0 : agent.exitSpeed;
      }
    } else {
      // FR-B5-RETURN (see RETURN_CLEAR_M): the run is over, the actor is out of
      // every observer's way, and there is nowhere further to drive on a 400 m
      // map the camera draws 420 m of. So it comes back round rather than
      // standing at the horizon in the lane the briefing is about — under the
      // command it left with, because staged actors never invent their own.
      const arc = reentryArc(agent, env);
      if (arc >= 0) {
        rewindTo(agent, arc);
        agent.returns++;
      } else {
        agent.speed = 0;
      }
    }
  }

  // 4b) Lateral glide (laneShift): pure dt integration toward the target,
  // clamped so the channel parks exactly on it (idle channel = zero work).
  if (agent.lat !== agent.latTarget && agent.latRate !== 0) {
    const next = agent.lat + agent.latRate * dt;
    agent.lat =
      (agent.latRate > 0 && next >= agent.latTarget) ||
      (agent.latRate < 0 && next <= agent.latTarget)
        ? agent.latTarget
        : next;
    if (agent.lat === agent.latTarget) agent.latRate = 0;
  }

  // Brake lights: an active slam, actively slowing toward a lower target —
  // or STANDING STILL ON A COMMANDED HOLD.
  //
  // That last clause is doc 87 B40, and it is a legibility defect, not a
  // cosmetic one. A staged actor asked to wait — the car pinned short of a
  // junction box, the колона standing at the end of the street, the
  // регулировчик drill's queue, and above all `sc-shes-sleeper`, the car
  // asleep on green that the whole lesson «Спане на зелено» is about — sat
  // there with UNLIT tail lamps, because `speed > target + 0.3` is false when
  // both are zero. Measured from the seat at the pose the lesson's own card
  // points at (y = −33.1, 57 m out), the sleeper was „a ~30 px dark shape
  // among other stationary vehicles" and the student could not tell it was
  // facing him, let alone that it was standing on a line.
  //
  // Two lit lamps is what a driver actually reads a stopped car by, and it is
  // the truth: a car held at a stop line has its foot on the brake. The
  // AMBIENT fleet already does exactly this (`vehicles.ts` — `term > 0.8 &&
  // speed < 0.5`), so this also ends a split where the scripted car and the
  // background car behaved differently while doing the same thing.
  //
  // `finished` is excluded on purpose: an actor that has run out of path is
  // parked, not waiting, and a parked car with its brake lights on is a lie
  // in the other direction.
  //
  // FR-B5-EXIT adds one more exclusion, for the same reason in the same
  // direction: an actor on its retirement run is DRIVING AWAY at a constant
  // coast while `target` is 0 (a finished cruise targets 0), so the middle
  // clause would light both lamps on a car that is accelerating out of the
  // scene. Lit brake lights on a departing car is the same lie as unlit ones
  // on a waiting one.
  const retiring = agent.finished && agent.exitM < EXIT_CLEAR_M && agent.speed > 0;
  const holding = target <= HOLD_LIT_TARGET_MPS && agent.speed <= HOLD_LIT_SPEED_MPS;
  agent.state.braking =
    !retiring &&
    (cmd.type === "brake" || agent.speed > target + 0.3 || (holding && !agent.finished));

  publishVehicle(agent);
}

function publishVehicle(agent: StagedVehicleAgent): void {
  sampleLane(agent.path, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  // Lateral channel: offset the published pose to the RIGHT of travel
  // (right normal of (dx, dy) is (dy, -dx) — the offsetPolyline convention).
  // lat = 0 for every actor never laneShift-ed → byte-identical publishing.
  //
  // FR-B5-EXIT: …and the retirement run rides straight on past the end of the
  // polyline along its final direction. exitM = 0 for every actor that never
  // reaches its end, so this term likewise changes nothing for them.
  agent.state.x = samp.x + samp.dirY * agent.lat + samp.dirX * agent.exitM;
  agent.state.y = samp.y - samp.dirX * agent.lat + samp.dirY * agent.exitM;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    if (agent.latRate !== 0 && agent.lat !== agent.latTarget && agent.speed > 0.1) {
      // Mid-glide: publish the true velocity direction (path motion + the
      // sideways glide) so the rig visually noses into the lane change.
      const vx = samp.dirX * agent.speed + samp.dirY * agent.latRate;
      const vy = samp.dirY * agent.speed - samp.dirX * agent.latRate;
      const inv = 1 / Math.hypot(vx, vy);
      agent.state.dirX = vx * inv;
      agent.state.dirY = vy * inv;
    } else {
      agent.state.dirX = samp.dirX;
      agent.state.dirY = samp.dirY;
    }
  }
  agent.state.speedMps = agent.speed;
  agent.state.indicator = agent.indicator;
  const view = agent.view;
  view.x = agent.state.x;
  view.y = agent.state.y;
  view.dirX = agent.state.dirX;
  view.dirY = agent.state.dirY;
  view.speedMps = agent.speed;
  view.s = agent.s;
  view.finished = agent.finished;
  view.indicator = agent.indicator;
  view.lateralOffsetM = agent.lat;
  view.returns = agent.returns;
}

function setPedOnRoad(
  agent: StagedPedestrianAgent,
  on: boolean,
  crossingCounts: Map<string, number>,
): void {
  const crossingId = agent.spec.crossingId;
  if (agent.onRoad === on || !crossingId) {
    agent.onRoad = on;
    agent.state.onCrossing = on && !!crossingId;
    return;
  }
  agent.onRoad = on;
  agent.state.onCrossing = on;
  const count = crossingCounts.get(crossingId) ?? 0;
  crossingCounts.set(crossingId, Math.max(0, count + (on ? 1 : -1)));
}

export function updateStagedPedestrian(
  agent: StagedPedestrianAgent,
  dt: number,
  env: StagedEnv,
): void {
  if (!agent.walking || agent.finished) {
    agent.state.speedMps = 0;
    agent.view.speedMps = 0;
    return;
  }
  const speed = agent.spec.speedMps;
  agent.s += speed * dt;
  agent.state.walkPhase += speed * dt * 2.4;
  if (agent.s >= agent.path.length) {
    agent.s = agent.path.length;
    agent.finished = true;
    agent.walking = false;
  }

  const roadFrom = agent.spec.roadFromM ?? Infinity;
  const roadTo = agent.spec.roadToM ?? -Infinity;
  setPedOnRoad(agent, agent.s >= roadFrom && agent.s <= roadTo, env.crossingCounts);

  publishPedestrian(agent, agent.finished ? 0 : speed);
}

function publishPedestrian(agent: StagedPedestrianAgent, speed: number): void {
  sampleLane(agent.path, agent.s, agent.segHint, samp);
  agent.segHint = samp.segHint;
  agent.state.x = samp.x;
  agent.state.y = samp.y;
  if (samp.dirX !== 0 || samp.dirY !== 0) {
    agent.state.dirX = samp.dirX;
    agent.state.dirY = samp.dirY;
  }
  agent.state.speedMps = speed;
  const view = agent.view;
  view.x = agent.state.x;
  view.y = agent.state.y;
  view.dirX = agent.state.dirX;
  view.dirY = agent.state.dirY;
  view.speedMps = speed;
  view.s = agent.s;
  view.finished = agent.finished;
}
