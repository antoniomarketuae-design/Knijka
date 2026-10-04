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
 *   per frame, in LessonScene's order: runtime.update → traffic.update →
 *     leadGap → runtime.sample → director.step (events appended) →
 *     createLessonSession/applyTick
 *   buildLessonResult → buildDebrief
 *
 * and the frame clock is LessonScene's: every frame's delta goes through
 * `sessionClockAdvance` (rapier's 0.5 s ceiling), so a phone cadence can be
 * replayed exactly as the product would integrate it.
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
import { applySignalModes, wireTrafficQueries } from "../../../scene/lessonWorldRecipe";
import { obbSeparationM, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision";
import { DEFAULT_LESSON_TRAFFIC } from "../../../contracts";
import type { LessonSpec, StagedEventOutcome, StagedEventSpec } from "../../../contracts";
import type { SimTick } from "../../../rules/types";
import { sampleAt } from "../../../traces/sample";
import type { ScenarioTrace, TracePoint } from "../../../traces/types";
import { sessionClockAdvance } from "../../../../../components/sim/lesson-ui/sessionClock";
import { buildDebrief } from "../../debrief";
import { applyTick, buildLessonResult, createLessonSession, type LessonStepResult } from "../../engine";
import type { LessonResult, LessonSessionState } from "../../types";

export interface LiveReplayFrameContext {
  /** Session time of this frame, s (the tick's own `t`). */
  t: number;
  tick: SimTick;
  /** The session BEFORE this tick is applied. */
  session: LessonSessionState;
  /** The live traffic system (read-only use: staged / ambient positions). */
  traffic: ReturnType<typeof createTrafficSystem>;
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
   * Render-frame deltas, s, cycled for the whole drive. Each one goes through
   * LessonScene's own `sessionClockAdvance` — a 7 s phone stall advances the
   * lesson clock 0.5 s, exactly as rapier does. Default: a steady 60 Hz.
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
  /** Hook after applyTick, with the step the engine returned. */
  afterApply?: (ctx: LiveReplayFrameContext & { step: LessonStepResult }) => void;
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

export function liveChainReplay(opts: LiveReplayOptions): LiveReplayOutcome {
  const { lesson, districtRaw: raw, trace } = opts;
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

  let session = createLessonSession(lesson);
  const outcomes: StagedEventOutcome[] = [];
  const ambientContacts: AmbientContact[] = [];
  const teachMomentCodes: string[] = [];
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
  let t = 0;
  let wallSec = 0;
  let frames = 0;
  while (t <= endT + 1e-9 && session.phase !== "completed" && session.phase !== "aborted") {
    const raw = deltas[frames % deltas.length];
    const dt = sessionClockAdvance(raw);
    if (frames > 0) {
      t += dt;
      wallSec += raw;
    }
    frames++;
    sampleAt(trace, Math.min(t, trace.meta.durationSec), p);
    // The recorder's own glance law: one channel per frame, the LAST look made
    // since the previous frame wins.
    type Glance = "left" | "right" | "rear" | "shoulder";
    let glance: Glance | null = null;
    while (glanceIdx < glances.length && glances[glanceIdx].tSec <= t + 1e-9) {
      glance = glances[glanceIdx].kind.slice("glance-".length) as Glance;
      glanceIdx++;
    }
    const absKmh = Math.abs(p.speedKmh);
    runtime.update(dt);
    traffic.update(dt, {
      signalPhase: (id) => runtime.signalPhase(id),
      playerPos: { x: p.x, y: p.y },
      playerSpeedKmh: absKmh,
      playerHeadingDeg: p.headingDeg,
    });
    // NpcColliders' stand-in for the AMBIENT fleet — see the header.
    const player = {
      x: p.x,
      y: p.y,
      headingDeg: p.headingDeg,
      halfLengthM: PLAYER_HALF_LENGTH_M,
      halfWidthM: PLAYER_HALF_WIDTH_M,
    };
    const contactsThisFrame: AmbientContact[] = [];
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
        contactsThisFrame.push({ t, ambientId: v.id, separationM: sep, speedKmh: absKmh });
      }
      touching.set(v.id, hit);
    }
    for (const c of contactsThisFrame) {
      ambientContacts.push(c);
      runtime.pushCollision("vehicle");
    }
    const leadGap = traffic.leadGapMeters(p.x, p.y, p.headingDeg);
    const tick = runtime.sample(
      {
        position: { x: p.x, y: p.y },
        headingDeg: p.headingDeg,
        speedKmh: p.speedKmh,
        indicator: p.indicator,
        headlights: "off",
        seatbeltOn: true,
        handbrakeOn: false,
        gear: p.gear,
        mirrorGlance: glance,
        stalled: false,
        fogLightsOn: false,
      },
      t,
      false,
      false,
      leadGap,
      false,
      false,
    );
    if (director) {
      const res = director.step({
        tSec: t,
        dtSec: dt,
        x: p.x,
        y: p.y,
        speedKmh: p.speedKmh,
        headingDeg: p.headingDeg,
        brakePedal: p.brakeOn ? 1 : 0,
        tickEvents: tick.events,
      });
      for (const e of res.events) tick.events.push(e);
      outcomes.push(...res.outcomes);
    }
    opts.beforeApply?.({ t, tick, session, traffic, wallSec });
    const before = session;
    const step = applyTick(session, tick);
    session = step.state;
    for (const m of step.teachMoments ?? []) teachMomentCodes.push(m.code);
    opts.afterApply?.({ t, tick, session: before, traffic, wallSec, step });
    if ((step.teachMoments?.length ?? 0) > 0 || step.mistakeMoment !== undefined) {
      wallSec += opts.teachPauseWallSec ?? 0;
    }
  }
  const result = buildLessonResult(session);
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
  };
}

