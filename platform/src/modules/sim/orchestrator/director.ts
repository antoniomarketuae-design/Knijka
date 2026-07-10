/**
 * Scenario director — the deterministic, seeded core of A8.
 *
 * One director per lesson session. At creation it stages every event's actor
 * dormant into the traffic system (MUST happen before the presentation layer
 * mounts — instanced buffers size at mount). Each frame it advances every
 * runner (arm → trigger → adjudicate), collects the SimTick events the
 * runners emit (existing vocabulary only — the integrator appends them to
 * the current tick), and records resolved outcomes.
 *
 * Determinism: (seed, attempt, spec list, player input stream, dt sequence)
 * fully determine every command and outcome. All randomness is drawn ONCE per
 * (event, attempt) at stage time via mulberry32 sub-streams — the step path
 * draws nothing.
 */

import type { StagedEventOutcome, StagedEventSpec } from "../contracts";
import type { SimTickEvent } from "../rules";
import { mulberry32 } from "../traffic/rng";
import { createRunner, type EventRunner } from "./runners";
import type {
  DirectorInput,
  DirectorStepResult,
  ScenarioDirector,
  ScenarioDirectorOptions,
  StagedEventStatus,
  StagedTrafficPort,
} from "./types";

/** FNV-1a 32-bit — stable string hash for lesson/event seeds. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic per-lesson seed for the director (LessonScene wiring). */
export function lessonSeed(lessonId: string): number {
  return hashSeed(`scenario:${lessonId}`);
}

class ScenarioDirectorImpl implements ScenarioDirector {
  attempt = 0;
  private readonly runners: EventRunner[];
  private readonly allOutcomes: StagedEventOutcome[] = [];
  private readonly seed: number;

  constructor(
    events: readonly StagedEventSpec[],
    private readonly traffic: StagedTrafficPort,
    opts: ScenarioDirectorOptions,
  ) {
    this.seed = opts.seed >>> 0;
    this.runners = events.map((spec) => createRunner(spec));
    for (const runner of this.runners) {
      runner.stage(this.traffic, this.eventRng(runner.spec.id), true);
    }
  }

  private eventRng(eventId: string) {
    return mulberry32(
      (this.seed ^ hashSeed(eventId) ^ Math.imul(this.attempt + 1, 0x9e3779b9)) >>> 0,
    );
  }

  get hazardActive(): boolean {
    for (const runner of this.runners) if (runner.hazardActive) return true;
    return false;
  }

  get outcomes(): readonly StagedEventOutcome[] {
    return this.allOutcomes;
  }

  step(input: DirectorInput): DirectorStepResult {
    const events: SimTickEvent[] = [];
    const outcomes: StagedEventOutcome[] = [];
    for (const runner of this.runners) {
      const outcome = runner.step(this.traffic, input, events);
      if (outcome) {
        outcomes.push(outcome);
        this.allOutcomes.push(outcome);
      }
    }
    return { events, outcomes };
  }

  reset(): void {
    this.attempt += 1;
    this.allOutcomes.length = 0;
    for (const runner of this.runners) {
      runner.stage(this.traffic, this.eventRng(runner.spec.id), false);
    }
  }

  snapshot(): StagedEventStatus[] {
    return this.runners.map((r) => ({
      id: r.spec.id,
      kind: r.spec.kind,
      phase: r.phase,
      outcome: r.outcome,
    }));
  }
}

/**
 * Build the director and stage all actors (dormant). Throws on unresolvable
 * spec data — staged events are pinned to district-v1.json and covered by
 * tests, so a failure here is a data bug that must surface loudly (same
 * philosophy as the lessons objective parser).
 */
export function createScenarioDirector(
  events: readonly StagedEventSpec[],
  traffic: StagedTrafficPort,
  opts: ScenarioDirectorOptions,
): ScenarioDirector {
  return new ScenarioDirectorImpl(events, traffic, opts);
}
