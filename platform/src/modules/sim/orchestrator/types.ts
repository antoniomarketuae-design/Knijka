/**
 * sim/orchestrator — types of the scenario director (doc 68 A8).
 *
 * The director is a deterministic, seeded "stage manager": it watches the
 * player each frame, arms/triggers the lesson's staged events, commands
 * scripted actors through the traffic module's NARROW staging port, and
 * reports outcomes. Grading stays where it always was — the director emits
 * only EXISTING SimTick vocabulary (prioritySituation / collision) and lets
 * the runtime's own detectors fire on the staged actors for everything else
 * (crossing occupancy, give-way, circulating conflict). No new
 * ViolationCodes, no second grader.
 */

import type { StagedEventKind, StagedEventOutcome } from "../contracts";
import type { SimTickEvent } from "../rules";
import type { StagedActorSpec, StagedActorView, StagedCommand } from "../traffic";

/**
 * The narrow imperative seam the director drives — structurally satisfied by
 * TrafficSystem (traffic/types.ts). Kept as its own interface so the director
 * core is unit-testable against a fake port.
 */
export interface StagedTrafficPort {
  stage(spec: StagedActorSpec): StagedActorView | null;
  stagedCommand(id: string, command: StagedCommand): void;
  staged(id: string): StagedActorView | null;
}

/** Player state + frame context the director consumes each frame. */
export interface DirectorInput {
  /** Session time, s (monotonic — the same t the SimTick carries). */
  tSec: number;
  dtSec: number;
  /** Player pose, district space. */
  x: number;
  y: number;
  speedKmh: number;
  /** 0 = north, clockwise. */
  headingDeg: number;
  /** Raw (pre-gate) brake pedal 0..1 — reaction-time measurement input. */
  brakePedal: number;
  /** The SimTick events the runtime emitted THIS frame (adjudication input).
   *  The director never mutates this array. */
  tickEvents: readonly SimTickEvent[];
}

export interface DirectorStepResult {
  /** Additional SimTick events (existing vocabulary only) — the integrator
   *  appends them to the current tick before it reaches the rule engine. */
  events: SimTickEvent[];
  /** Encounters that resolved on this frame (0 or 1 in practice). */
  outcomes: StagedEventOutcome[];
}

export type StagedEventPhase = "idle" | "armed" | "triggered" | "resolved";

/** Introspection snapshot (tests, future HUD/debrief). */
export interface StagedEventStatus {
  id: string;
  kind: StagedEventKind;
  phase: StagedEventPhase;
  outcome: StagedEventOutcome | null;
}

export interface ScenarioDirectorOptions {
  /** Master seed — same seed + same attempt + same driving = same staging. */
  seed: number;
}

export interface ScenarioDirector {
  /**
   * Advance the director one frame. Call AFTER traffic.update and AFTER
   * runtime.sample (so tickEvents are this frame's), once per frame.
   */
  step(input: DirectorInput): DirectorStepResult;
  /**
   * Re-stage every event for a fresh attempt (R-key retry): actors teleport
   * back to their hold poses and per-event jitters re-derive from
   * (seed, attempt) — deterministic per attempt, varied across attempts.
   */
  reset(): void;
  /** True while the lesson's HazardStimulusSpec visual should animate (L5). */
  readonly hazardActive: boolean;
  /** 0-based attempt counter (increments on reset()). */
  readonly attempt: number;
  /** All outcomes resolved so far this attempt, in order. */
  readonly outcomes: readonly StagedEventOutcome[];
  snapshot(): StagedEventStatus[];
}
