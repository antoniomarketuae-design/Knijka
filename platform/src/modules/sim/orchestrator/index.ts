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

export { createScenarioDirector, directorContactCast, hashSeed, lessonSeed } from "./director";
// The publisher for `SimTick.vruAheadM` — see contact.ts. It ships through the
// barrel because its ONE consumer is `components/sim/LessonScene`, and doc 05
// says a component reaches a module only through its public API.
export { vruAheadMeters } from "./contact";
// …and the cast shape it is handed. Exported 2026-08-25 because a lane added a
// test importing it from this barrel while the barrel did not publish it: the
// suite went green (vitest does not typecheck) and tsc was red with TS2305.
// Doc 05 says a consumer reaches a module only through its public API — so the
// answer is to publish the type, not to reach past the door.
export type { ContactCastMember } from "./contact";
export { BRAKE_ONSET_THRESHOLD } from "./runners";
export type {
  DirectorInput,
  DirectorStepResult,
  ScenarioDirector,
  ScenarioDirectorOptions,
  SignalDirectorPort,
  StagedEventPhase,
  StagedEventStatus,
  StagedTrafficPort,
} from "./types";

// Contract types consumers need alongside the director (owned by ../contracts).
export type {
  AmberDilemmaSpec,
  StagedEventKind,
  StagedEventOutcome,
  StagedEventSpec,
} from "../contracts";
