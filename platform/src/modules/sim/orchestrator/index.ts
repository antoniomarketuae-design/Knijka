/**
 * sim/orchestrator — public API (module-boundary barrel, docs/architecture/05).
 *
 * The A8 scenario orchestrator: a deterministic, seeded director that stages
 * the lesson's scripted encounters (LessonSpec.stagedEvents) through the
 * traffic module's narrow staging port and reports outcomes as SimTick
 * events the existing rule engine already grades.
 *
 * Integration (LessonScene, once per frame, in this order):
 *   1. runtime.update(dt)
 *   2. traffic.update(dt, ctx)
 *   3. tick = runtime.sample(...)
 *   4. res = director.step({ ...player state, tickEvents: tick.events })
 *      tick.events.push(...res.events)   — same tick pipeline
 *      hazardActiveRef.current = director.hazardActive
 *   5. onTick(tick)
 *
 * Pure TypeScript — no React/three/Rapier (vitest-safe).
 */

export { createScenarioDirector, hashSeed, lessonSeed } from "./director";
export { BRAKE_ONSET_THRESHOLD } from "./runners";
export type {
  DirectorInput,
  DirectorStepResult,
  ScenarioDirector,
  ScenarioDirectorOptions,
  StagedEventPhase,
  StagedEventStatus,
  StagedTrafficPort,
} from "./types";

// Contract types consumers need alongside the director (owned by ../contracts).
export type {
  StagedEventKind,
  StagedEventOutcome,
  StagedEventSpec,
} from "../contracts";
