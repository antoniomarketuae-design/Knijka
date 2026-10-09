/**
 * LIVE-CHAIN REPLAY — the witness harness for rows the LIVE audit harness
 * cannot drive (witness-a, 2026-10-04). Test support only; nothing in the
 * product imports it.
 *
 * WHAT IT IS. A recorded drive (the authored kinematic script of the lesson's
 * own trace module — `recordScriptedDrive`, the pose source every committed
 * demo is cut from) is replayed, pose by pose, through the stack LessonScene
 * builds for a LIVE lesson, NOT the recorder's harness stack:
 *
 *   createWorldRuntime(district) + applySignalModes / armSignalPlan
 *   createTrafficSystem(district, the LIVE options: anchor at the lesson's own
 *     spawn point, anchorRadiusM / anchorPath / vehicleCount / pedestrianCount
 *     from the COMPILED rung, the live sidewalk budget, the default seed)
 *   wireTrafficQueries(runtime, traffic)
 *   createScenarioDirector(lesson.stagedEvents — `staged` AND the rung's
 *     `stagedAdd` — seed lessonSeed(lesson.id), signals: runtime)
 *   per SESSION GRID POINT k·FIXED_DT (round 4, scene/gradeGrid.ts — the very
 *     module LessonScene's RuntimeDriver runs), in LessonScene's order:
 *     runtime.update → traffic.update → leadGap + the person-in-path distance
 *     → runtime.sample → director.step (events appended) →
 *     createLessonSession/applyTick
 *   buildLessonResult → buildDebrief
 *
 * THE PERSON-IN-PATH DISTANCE (`tick.vruAheadM`) IS PUBLISHED HERE TOO, since
 * round 6. The product has published it since 2026-08-23 (LessonScene measured
 * it per frame); this harness never did, so no pin built on it could see the
 * channel — nor a scene that measured it from the wrong pose (round 5's
 * verifier, F1/F4). The grid now measures it itself, for both callers, so the
 * replay hears exactly what the live lesson hears. One committed demo's sheet
 * is different for it and is now what the product gives: sc-hz-accident-scene
 * mistake-gawk-stop L4 was billed ILLEGAL_STOP_IN_BAN_ZONE (3 т.) by the
 * hook-less harness and is acquitted — a bystander is standing in the path,
 * which is the acquittal the channel exists for.
 *
 * THE NEAR-MISS STAT IS PUBLISHED HERE TOO, since round 7. «Мина на косъм»
 * scores nothing, but the student is shown its count and its closest pass (the
 * result row, the debrief sentence), and in the product it was stepped by a
 * React component (NpcColliders) this harness has never run — so no `result`
 * or `debrief` it returned could contain one, and no census could see that the
 * count depended on the frame length. The grid measures the stat now, for both
 * callers; this replay folds each resolved encounter into the session exactly
 * as the shell does (`applyNearMiss`, at the last tick's position, dropped once
 * the session has ended), so `result.nearMisses` and the debrief's sentence are
 * the product's.
 *
 * A LOOK GOES IN THE WAY THE PRODUCT TAKES IT, since round 8. The tape's
 * `glance-…` events are presses. A press is latched in the cabin's own look
 * queue (scene/cabin.ts `GlanceSampleQueue` — the class CabinControls holds)
 * by the frame whose end has reached it; every frame takes ONE look out of it
 * (the VehicleSample builder's `consumeGlanceSample`) and hands it to the grid
 * as the frame's glance — `GradeGrid.stepFrame(t, frameGlance, …)`, the entry
 * LessonScene's `stepPhysics` shares — and the grid then takes whatever the
 * cabin still holds through the `moreLooks` hook, as it does from the scene.
 * There each look waits its turn, one look per grid point. Through round 7 this harness wrote the tape's looks straight
 * into each grid point's sample («the LAST look made since the previous one
 * wins») and passed no frame glance at all: no census cell ran the grid's
 * held-look path, where a second frame's look erased the first (the round-7
 * verifier's F1), and the first of two looks pressed at one instant — 128
 * pairs on 89 committed tapes — was dropped on every cadence, where the
 * product at 60 Hz hears both on consecutive ticks. `looks` in the outcome
 * says what became of every press.
 *
 * WHEN A LOOK IS HEARD THEREFORE DEPENDS ON THE FRAME THAT SAMPLED IT, as in
 * the product: at the first grid point graded at or after that frame (plus one
 * point per look ahead of it). On a display of 60 Hz or faster that is the
 * grid point at or after the press (the tapes' presses are ON the grid, so:
 * the press's own point); inside a phone's 0.5 s frame it is the frame's
 * FIRST point — up to 29 points before the tape's press. That is the device
 * sampling the driver once per frame, which no grid can undo. (AND NOTE WHAT
 * THIS REPLAY KEEPS IDEAL: the tape's gear and indicator are still read at
 * every grid point, where a live long frame gives every point the frame's
 * one reading. So on a long-frame cadence a look can be heard BEFORE a gear
 * change the tape made earlier in that frame — an order the product, which
 * samples both by the frame, cannot produce.)
 *
 * THE ATTEMPT TRACE AND THE RUBRIC'S OBSERVATION MOMENTS, since round 8. The
 * shell records the student's own drive and scores «наблюдение» from that
 * trace when the session is finalized. This replay runs the same feed
 * (scene/attemptFeed.ts `feedAttemptPoint`, the function LessonScene's
 * `onPoint` calls — once per graded grid point, after the tick was applied)
 * into the same recorder (`createTraceRecorder`), closes the trace where the
 * shell does (`finalizeLessonSession`: on the tick that ended the session,
 * before that point's own sample is pushed) and maps and scores it as the
 * shell does — `attemptTrace`, `observedMomentIds`, `rubric`.
 *
 * and the frame clock is LessonScene's: every frame's delta goes through
 * `sessionClockAdvance` (rapier's 0.5 s ceiling), so a phone cadence can be
 * replayed exactly as the product would integrate it — THE FIRST FRAME'S
 * INCLUDED (round 5). The session starts at its origin, t = 0, where nothing
 * is graded (no physics step has ended there); the first frame's delta moves
 * the clock like every other frame's, and the frame grades every grid point
 * k·FIXED_DT it has passed, k = 1 … — as many as rapier takes steps in a
 * first live frame of that length (accumulator from 0, `clamp(delta, 0, 0.5)`,
 * one step per whole FIXED_DT; 30 for 0.5 s). The SEQUENCE of graded points is
 * the sequence of rapier's steps; which FRAME a point falls in can differ from
 * rapier by one frame when a frame end lands within float noise of a grid
 * point (this loop asks floor(t / FIXED_DT), rapier asks its own accumulator)
 * — which is why the live lesson counts rapier's steps instead
 * (scene/__tests__/live-grid-wiring.test.ts). Until round 5 this loop skipped the first frame's
 * delta (`if (frames > 0)`), so every cadence began with one graded point at
 * t = 0 and no pin built on it could see what a long first frame did to the
 * product: the round-4 grid brought ONE grid point on that frame whatever its
 * length, and 21 of 1,531 sheets split after a 0.5 s first frame.
 *
 * THE ONE PART OF THE LIVE STACK THAT IS NOT IN PROCESS IS RAPIER. Staged
 * actors are still covered — the director's ContactSentinel reports overlap
 * with every cast member — but the AMBIENT fleet only reaches the grader in a
 * browser, through NpcColliders → handleCollision → runtime.pushCollision
 * ("vehicle", unnamed). This harness stands in for that reporter and no more:
 * a rising-edge OBB overlap between the player's chassis box and an ambient
 * car's body queues an unnamed `{ kind: "collision", withWhat: "vehicle" }`
 * into that frame's tick (the pushCollision contract: drained by sample()).
 * Every such contact is also RETURNED, so a witness can assert there were none
 * rather than leaving a ghost car to be driven through in silence. Static world
 * geometry (kerbs, islands, façades) is NOT modelled; the witnesses that care
 * inject their own static contact explicitly and say so.
 *
 * WHAT IT IS NOT. It is not reactive: the poses are the authored drive, open
 * loop, as every committed demo is. A witness built on it states which drive it
 * replays and asserts what the row is about on what the PRODUCT returned.
 */

import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import {
  DEFAULT_TRAFFIC_CONFIG,
  vehicleHalfLengthM,
  vehicleHalfWidthM,
  type TrafficDistrict,
} from "../../../traffic/types";
import { ambientSidewalkBudget } from "../../../traffic/pedestrians";
import { createScenarioDirector, lessonSeed } from "../../../orchestrator/director";
import type { ScenarioDirector } from "../../../orchestrator/types";
import { applySignalModes, wireTrafficQueries } from "../../../scene/lessonWorldRecipe";
import { GradeGrid, type GradeGridHooks, type GradeGridPoint } from "../../../scene/gradeGrid";
import { GlanceSampleQueue, type MirrorGlanceKind } from "../../../scene/cabin";
import { createAttemptFeedState, feedAttemptPoint } from "../../../scene/attemptFeed";
import { SESSION_GRID_EPS_SEC } from "../../../traffic/sessionGrid";
import { createTraceRecorder } from "../../../traces/recorder";
import { obbSeparationM, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision";
import { DEFAULT_LESSON_TRAFFIC } from "../../../contracts";
import type { LessonSpec, NearMissEvent, StagedEventOutcome, StagedEventSpec } from "../../../contracts";
import type { SimTick } from "../../../rules/types";
import { sampleAt } from "../../../traces/sample";
import type { ScenarioTrace, TracePoint } from "../../../traces/types";
import { sessionClockAdvance } from "../../../../../components/sim/lesson-ui/sessionClock";
import { buildDebrief } from "../../debrief";
import {
  applyNearMiss,
  applyStagedOutcome,
  applyTick,
  buildLessonResult,
  createLessonSession,
  type LessonStepResult,
} from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";
import { parkingObservationFromTrace } from "../observation";
import { parseScenarioLessonId } from "../resolve";
import { scoreRubric } from "../rubric";
import { scenarioById } from "../templates";
import type { RubricObservationInput, RubricScore } from "../types";

export interface LiveReplayFrameContext {
  /** Session time of this frame, s (the tick's own `t`). */
  t: number;
  tick: SimTick;
  /** The session BEFORE this tick is applied. */
  session: LessonSessionState;
  /** The live traffic system (read-only use: staged / ambient positions). */
  traffic: ReturnType<typeof createTrafficSystem>;
  /** The session's scenario director (null: nothing staged) — read-only use:
   *  its contact cast, for a witness measuring against the staged people. */
  director: ScenarioDirector | null;
  /**
   * Wall-clock seconds since the drive began: the RAW frame deltas plus every
   * teach-card pause (`teachPauseWallSec`). The session clock is `t`; this is
   * what a harness photographing the glass would measure.
   */
  wallSec: number;
}

export interface LiveReplayOptions {
  lesson: LessonSpec;
  districtRaw: unknown;
  /** The pose source: a recorded drive's trace (open loop). */
  trace: ScenarioTrace;
  /**
   * Render-frame deltas, s, cycled for the whole drive, the first frame's
   * included. Each one goes through LessonScene's own `sessionClockAdvance` —
   * a 7 s phone stall advances the lesson clock 0.5 s, exactly as rapier does.
   * Default: a steady 60 Hz.
   */
  frameDeltas?: readonly number[];
  /** Keep stepping this long after the trace ends, holding its last pose (s). */
  holdAfterSec?: number;
  /** Hook before applyTick — may push extra events into `ctx.tick.events`. */
  beforeApply?: (ctx: LiveReplayFrameContext) => void;
  /**
   * The live shell PAUSES the scene on a teach card or a consequence moment
   * (LessonScene's `if (paused) return` sits ABOVE `tRef.current += dt`), so
   * no tick is produced and the session clock stands still while the wall clock
   * runs. This many wall seconds are added, with no tick, after every step that
   * returned a teach moment or a mistake moment. Default 0.
   */
  teachPauseWallSec?: number;
  /** Hook after applyTick, with the step the engine returned. Like
   *  `beforeApply`, it runs once per GRADED GRID POINT (scene/gradeGrid.ts),
   *  with `t` = k·FIXED_DT — not once per render frame. */
  afterApply?: (ctx: LiveReplayFrameContext & { step: LessonStepResult }) => void;
  /**
   * Fold each staged-encounter report into the session after that GRID
   * POINT's tick — the live shell folds the same reports
   * (`LessonPlayShell handleStagedOutcome` → `applyStagedOutcome`), handed
   * over by `LessonScene`'s grid `onPoint` for the same point (there just
   * BEFORE `onTick`; this replay keeps the order its witnesses were measured
   * with, after the tick: the point is the same, the order within it is
   * not — aligning it is owed to the truck-pass lane). An
   * objective judged by a staged report (`emergencyStop`,
   * `reachZone.stagedPass`) can only complete with it. OPT-IN, default off:
   * every witness written before 2026-10-08 replayed without it, and none of
   * them may move because a harness grew a faithful half.
   */
  applyOutcomes?: boolean;
}

export interface AmbientContact {
  t: number;
  ambientId: number;
  separationM: number;
  speedKmh: number;
}

export interface LiveReplayOutcome {
  lesson: LessonSpec;
  session: LessonSessionState;
  result: LessonResult;
  debrief: string;
  outcomes: StagedEventOutcome[];
  /** Rising-edge overlaps with AMBIENT cars (each was fed to the grader). */
  ambientContacts: AmbientContact[];
  /** Closest the player's box came to any ambient car's box, m (Infinity: none). */
  minAmbientSeparationM: number;
  /** Teach-moment codes the engine raised (the cards a live shell pauses on). */
  teachMomentCodes: string[];
  frames: number;
  /** Violation codes in the session ledger, in order. */
  violationCodes: string[];
  /** Commendation codes in the session ledger, in order. */
  commendationCodes: string[];
  /** Every near miss the grid resolved, in order — the ones the session kept
   *  (`result.nearMisses`) and any that resolved after it had ended. */
  nearMisses: NearMissEvent[];
  /** What became of every look on the tape (round 8) — see `LiveReplayLooks`. */
  looks: LiveReplayLooks;
  /** The student's attempt trace as the shell would have closed it (null: the
   *  lesson is not a scenario lesson, or fewer than two samples). */
  attemptTrace: ScenarioTrace | null;
  /** The rubric's observation moments scored from `attemptTrace` — null when
   *  the channel is unmeasured (no rubric, no moments, no reverse phase). */
  observedMomentIds: string[] | null;
  /** The rubric as the shell scores it (null: the scenario authors none). */
  rubric: RubricScore | null;
}

/** One look a grid point heard. */
export interface HeardLook {
  kind: MirrorGlanceKind;
  /** The grid point whose tick carried it, and that point's session time. */
  k: number;
  tSec: number;
}

/**
 * The tape's looks, followed through the product's glance path: press → the
 * cabin's queue → the frame's glance, then the rest → the grid's queue → one
 * per grid point.
 * `pressed = heard.length + droppedByCabin + droppedByGrid + unheard`.
 */
export interface LiveReplayLooks {
  /** `glance-…` events on the tape that the replay reached before it ended. */
  pressed: number;
  /** In the order they were heard — which is the order they were pressed. */
  heard: HeardLook[];
  /** Presses that found the cabin's queue full (four waiting). */
  droppedByCabin: number;
  /** Looks that found the grid's queue full (`GradeGrid.droppedLooks`). */
  droppedByGrid: number;
  /** Looks still waiting — in the cabin or in the grid — when the replay
   *  ended (the session ended, or the tape did): not graded. */
  unheard: number;
  /** For each heard look, in order: the frame (1-based) that took it out of
   *  the cabin's queue, and the tape time of its press. */
  taken: Array<{ frame: number; pressSec: number }>;
}

interface SpawnPointLike {
  id: string;
  x: number;
  y: number;
  heading?: number;
}

function liveSpawn(lesson: LessonSpec, raw: unknown): { x: number; y: number } {
  const pts = ((raw as { spawnPoints?: SpawnPointLike[] }).spawnPoints ?? []) as SpawnPointLike[];
  const explicit = lesson.spawn.position;
  if (lesson.spawn.pointId) {
    const p = pts.find((s) => s.id === lesson.spawn.pointId);
    return { x: p?.x ?? explicit?.x ?? 0, y: p?.y ?? explicit?.y ?? 0 };
  }
  return { x: explicit?.x ?? 0, y: explicit?.y ?? 0 };
}

/**
 * The world LessonScene builds for a live lesson — runtime, traffic, director
 * — in its order. Exported so a witness that drives the grid itself (the
 * scene's own graded call, executed: live-grade-call.execution.test.ts) stands
 * on the very world this replay stands on.
 */
export function buildLiveWorld(lesson: LessonSpec, raw: unknown) {
  const runtime = createWorldRuntime(raw);
  const anchor = liveSpawn(lesson, raw);
  if (lesson.signalPlan) runtime.armSignalPlan(lesson.signalPlan, anchor);
  applySignalModes(runtime, lesson);
  const trafficSpec = lesson.traffic;
  const traffic = createTrafficSystem(raw as TrafficDistrict, {
    anchor,
    anchorRadiusM: trafficSpec?.anchorRadiusM ?? DEFAULT_LESSON_TRAFFIC.anchorRadiusM,
    anchorPath: trafficSpec?.anchorPath,
    vehicleCount: trafficSpec?.vehicleCount ?? DEFAULT_LESSON_TRAFFIC.vehicleCount,
    pedestrianCount: trafficSpec?.pedestrianCount ?? DEFAULT_LESSON_TRAFFIC.pedestrianCount,
    sidewalkPedestrianCount:
      trafficSpec?.sidewalkPedestrianCount ??
      ambientSidewalkBudget(
        raw as TrafficDistrict,
        DEFAULT_TRAFFIC_CONFIG.footwaylessRoadClasses,
        DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      ),
  });
  wireTrafficQueries(runtime, traffic);
  // The AMBIENT fleet is created with the system and never grows (system.ts
  // `ambientStates`, «frozen after construction»); staged actors are pushed
  // into `traffic.vehicles` later, by the director. Snapshot it NOW, before
  // the director exists, so identity decides which cars are ambient.
  const ambientFleet = [...traffic.vehicles];
  const staged = (lesson.stagedEvents ?? []) as StagedEventSpec[];
  const director =
    staged.length > 0
      ? createScenarioDirector(staged, traffic, { seed: lessonSeed(lesson.id), signals: runtime })
      : null;
  return { runtime, traffic, director, ambientFleet };
}

export function liveChainReplay(opts: LiveReplayOptions): LiveReplayOutcome {
  const { lesson, districtRaw: raw, trace } = opts;
  const { runtime, traffic, director, ambientFleet } = buildLiveWorld(lesson, raw);

  let session = createLessonSession(lesson);
  const outcomes: StagedEventOutcome[] = [];
  const ambientContacts: AmbientContact[] = [];
  const teachMomentCodes: string[] = [];
  const nearMisses: NearMissEvent[] = [];
  /** The shell's `lastTickRef.current?.position` — where it pins a near miss. */
  let lastTickPos: { x: number; y: number } | null = null;
  const touching = new Map<number, boolean>();
  let minAmbientSeparationM = Infinity;

  const deltas = opts.frameDeltas && opts.frameDeltas.length > 0 ? opts.frameDeltas : [1 / 60];
  const endT = trace.meta.durationSec + (opts.holdAfterSec ?? 0);
  const p: TracePoint = {
    x: 0,
    y: 0,
    headingDeg: 0,
    steerRad: 0,
    speedKmh: 0,
    gear: 0,
    indicator: "off",
    brakeOn: false,
    throttleOn: false,
  };
  const glances = trace.events.filter((e) => e.kind.startsWith("glance-"));
  let glanceIdx = 0;
  // THE PRODUCT'S GLANCE PATH (round 8): the cabin's own queue of latched
  // looks, one taken per frame — see the header.
  const cabinLooks = new GlanceSampleQueue();
  /** Press times of the looks waiting in the cabin's queue, oldest first. */
  const cabinPressSec: number[] = [];
  const looks: LiveReplayLooks = {
    pressed: 0,
    heard: [],
    droppedByCabin: 0,
    droppedByGrid: 0,
    unheard: 0,
    taken: [],
  };
  // THE ATTEMPT TRACE (round 8): the shell's recorder, fed by the scene's own
  // per-grid-point feed. The shell makes one for scenario lessons only.
  const scenarioRef = parseScenarioLessonId(lesson.id);
  const attemptRecorder =
    scenarioRef !== null ? createTraceRecorder({ scenarioId: lesson.id, kind: "attempt" }) : null;
  const attemptFeed = createAttemptFeedState();
  /** `finalizeLessonSession`'s `deps.finishTrace()`: taken once, on the tick
   *  that ended the session (undefined: not finalized yet). */
  let attemptTrace: ScenarioTrace | null | undefined;
  let t = 0;
  let wallSec = 0;
  let frames = 0;
  // Round 4 — THE GRADE RUNS ON THE SESSION GRID (scene/gradeGrid.ts, the
  // module LessonScene's RuntimeDriver runs the same chain through). Each
  // frame grades the grid points k·FIXED_DT it brings, the recorded drive
  // sampled AT each of them; the tail is the same grid point on every
  // cadence (below). There is no rapier here to count steps, so the grid
  // points are the ones the session time has passed (`stepFrame`) — the same
  // sequence of points rapier's steps give for those deltas (see the header
  // for the one-frame float-noise difference in which frame a point lands).
  const grid = new GradeGrid();
  // The frame loop has always graded ONE frame past `endT` (its condition
  // reads the previous frame's clock), so the tail is the first grid point
  // after the last one at or before `endT` — the very point 60 Hz grades.
  const kEnd = grid.clock.indexAt(endT + 1e-9) + 1;
  const live = () => session.phase !== "completed" && session.phase !== "aborted";
  const gradePoint = (pt: GradeGridPoint): boolean => {
    const tick = pt.tick;
    if (pt.staged) outcomes.push(...pt.staged.outcomes);
    const tp = pt.tSec;
    opts.beforeApply?.({ t: tp, tick, session, traffic, director, wallSec });
    const before = session;
    const step = applyTick(session, tick);
    session = step.state;
    lastTickPos = { x: tick.position.x, y: tick.position.y };
    if (opts.applyOutcomes === true && director && pt.staged) {
      // The reports THIS GRID POINT's director.step made (pushed just above)
      // — the point's own outcomes, never «every outcome stamped with the
      // frame's time»: a frame can bring several grid points.
      for (const o of pt.staged.outcomes) session = applyStagedOutcome(session, o);
    }
    for (const m of step.teachMoments ?? []) teachMomentCodes.push(m.code);
    opts.afterApply?.({ t: tp, tick, session: before, traffic, director, wallSec, step });
    if ((step.teachMoments?.length ?? 0) > 0 || step.mistakeMoment !== undefined) {
      wallSec += opts.teachPauseWallSec ?? 0;
    }
    if (pt.student.mirrorGlance !== null) {
      looks.heard.push({ kind: pt.student.mirrorGlance, k: pt.k, tSec: tp });
    }
    // LessonScene's `onPoint`: `onTick(pt.tick)` — inside which the shell
    // finalizes a session this tick ended and closes the trace — and THEN the
    // attempt feed of this point.
    if (!live() && attemptTrace === undefined) attemptTrace = attemptRecorder?.finish() ?? null;
    if (attemptRecorder) {
      feedAttemptPoint(attemptRecorder, attemptFeed, tp, pt.student, p.steerRad, p.brakeOn, p.throttleOn);
    }
    return !live();
  };
  const hooks: GradeGridHooks = {
    student: (_k, tk, s) => {
      sampleAt(trace, Math.min(tk, trace.meta.durationSec), p);
      // NO LOOK IS WRITTEN HERE (round 8). The grid writes `mirrorGlance`
      // itself, after this hook, from its queue; the tape's looks reach it
      // per FRAME, below, as the cabin hands them to a live frame.
      s.position.x = p.x;
      s.position.y = p.y;
      s.headingDeg = p.headingDeg;
      s.speedKmh = p.speedKmh;
      s.indicator = p.indicator;
      s.headlights = "off";
      s.seatbeltOn = true;
      s.handbrakeOn = false;
      s.gear = p.gear;
      s.stalled = false;
      s.fogLightsOn = false;
      return p.brakeOn ? 1 : 0;
    },
    // The replay has always handed the traffic agents |v| (the director the
    // signed number).
    trafficSpeedKmh: (s) => Math.abs(s.speedKmh),
    contacts: (tk, s) => {
      // NpcColliders' stand-in for the AMBIENT fleet — see the header.
      const player = {
        x: s.position.x,
        y: s.position.y,
        headingDeg: s.headingDeg,
        halfLengthM: PLAYER_HALF_LENGTH_M,
        halfWidthM: PLAYER_HALF_WIDTH_M,
      };
      const absKmh = Math.abs(s.speedKmh);
      const contactsNow: AmbientContact[] = [];
      for (const v of ambientFleet) {
        const sep = obbSeparationM(player, {
          x: v.x,
          y: v.y,
          headingDeg: (Math.atan2(v.dirX, v.dirY) * 180) / Math.PI,
          halfLengthM: vehicleHalfLengthM(v.profile),
          halfWidthM: vehicleHalfWidthM(v.profile),
        });
        if (sep < minAmbientSeparationM) minAmbientSeparationM = sep;
        const hit = sep <= 0;
        if (hit && !touching.get(v.id)) {
          contactsNow.push({ t: tk, ambientId: v.id, separationM: sep, speedKmh: absKmh });
        }
        touching.set(v.id, hit);
      }
      for (const c of contactsNow) {
        ambientContacts.push(c);
        runtime.pushCollision("vehicle");
      }
    },
    // The scene's `moreLooks: () => cabinRef.current?.consumeGlanceSample() ?? null`.
    moreLooks: () => {
      const more = cabinLooks.take();
      if (more !== null) looks.taken.push({ frame: frames, pressSec: cabinPressSec.shift() as number });
      return more;
    },
    onPoint: gradePoint,
    // LessonPlayShell.handleNearMiss: `if (finalizedRef.current) return;` then
    // `applyNearMiss(session, event, lastTick.position)`.
    nearMiss: (event) => {
      nearMisses.push(event);
      if (!live()) return;
      session = applyNearMiss(session, event, lastTickPos);
    },
  };
  const world = { runtime, traffic, director };
  const NO_WEATHER = { isNight: false, rain: false, fog: false, snow: false };
  while (live() && !(grid.clock.last >= kEnd)) {
    const raw = deltas[frames % deltas.length];
    // LessonScene's clock, frame 0 included: the delta is clamped and added,
    // then the frame is graded (RuntimeDriver: `sessionClock.frame(dt, …)`,
    // then `gradeGrid.stepPhysics`).
    t += sessionClockAdvance(raw);
    wallSec += raw;
    frames++;
    // THE LOOKS OF THIS FRAME, as a live frame gets them: every press the
    // frame's end has reached is latched in the cabin's queue (a press on the
    // grid is reached by the frame that brings its grid point — the clock's
    // own tolerance), and the frame takes ONE look out of it.
    while (glanceIdx < glances.length && glances[glanceIdx].tSec <= t + SESSION_GRID_EPS_SEC) {
      const before = cabinLooks.length;
      cabinLooks.push(glances[glanceIdx].kind.slice("glance-".length) as MirrorGlanceKind);
      if (cabinLooks.length > before) cabinPressSec.push(glances[glanceIdx].tSec);
      else looks.droppedByCabin++;
      looks.pressed++;
      glanceIdx++;
    }
    const frameGlance = cabinLooks.take();
    if (frameGlance !== null) looks.taken.push({ frame: frames, pressSec: cabinPressSec.shift() as number });
    grid.stepFrame(t, frameGlance, world, NO_WEATHER, hooks, grid.clock.timeOf(kEnd));
  }
  looks.droppedByGrid = grid.droppedLooks;
  looks.unheard = cabinLooks.length + grid.pendingLooks;
  // `taken` lists the looks the GRID was handed; keep the ones a point heard
  // (a look still waiting in the grid's queue at the end was taken, not heard).
  looks.taken.length = Math.min(looks.taken.length, looks.heard.length);
  const result = buildLessonResult(session);
  // The session never ended inside the tape: the shell would finalize on the
  // student's own «Край» — the whole trace.
  if (attemptTrace === undefined) attemptTrace = attemptRecorder?.finish() ?? null;
  // `finalizeLessonSession`: the observation moments from the recorded
  // attempt (unmeasured when the mapper returns null), the rubric from the
  // pure scorer.
  const rubricSpec = scenarioRef !== null ? scenarioById(scenarioRef.templateId)?.rubric : undefined;
  let observedMomentIds: string[] | null = null;
  let rubric: RubricScore | null = null;
  if (rubricSpec !== undefined) {
    let observation: RubricObservationInput | undefined;
    const moments = rubricSpec.observation?.moments;
    if (attemptTrace !== null && moments !== undefined && moments.length > 0) {
      const mapped = parkingObservationFromTrace(attemptTrace, moments);
      if (mapped !== null) {
        observation = mapped;
        observedMomentIds = [...mapped.observedMomentIds];
      }
    }
    rubric = scoreRubric(result, rubricSpec, observation);
  }
  return {
    lesson,
    session,
    result,
    debrief: buildDebrief(lesson, result, { coachedMistakes: result.coachedMistakes }).text,
    outcomes,
    ambientContacts,
    minAmbientSeparationM,
    teachMomentCodes,
    frames,
    violationCodes: session.events.filter((e) => e.kind === "violation").map((e) => e.code),
    commendationCodes: session.events.filter((e) => e.kind === "commendation").map((e) => e.code),
    nearMisses,
    looks,
    attemptTrace,
    observedMomentIds,
    rubric,
  };
}

