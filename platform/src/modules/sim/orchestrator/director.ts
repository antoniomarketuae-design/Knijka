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
import { ContactSentinel, type ContactCastMember } from "./contact";
import { createRunner, type EventRunner } from "./runners";
import type {
  DirectorInput,
  DirectorStepResult,
  ScenarioDirector,
  ScenarioDirectorOptions,
  SignalDirectorPort,
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
  /**
   * B81 — the ONE contact watch, owned here rather than inside the runners.
   * A runner retires; the sentinel does not. See contact.ts for the measured
   * defect this exists to make structurally impossible.
   */
  private readonly sentinel = new ContactSentinel();
  /**
   * B84 — THE SESSION'S CONTACT CAST, collected ONCE at construction.
   *
   * This is the whole structural point and it is worth stating plainly: after
   * this line runs, no runner is ever consulted about contact again. B81 asked
   * each runner every frame and a runner answered "nothing" for the whole of
   * `sc-follow-standstill`, because its `watching` latch lived in a branch the
   * drill deliberately disables — 93 frames of a student sitting 1.7675 m
   * inside a car, graded «passed». A per-frame question has a per-frame wrong
   * answer available to it; a snapshot taken before the first frame does not.
   */
  private readonly cast: readonly ContactCastMember[];
  /** Reused per frame (the frame-loop zero-allocation law). */
  private readonly collisions: SimTickEvent[] = [];
  private readonly allOutcomes: StagedEventOutcome[] = [];
  private readonly seed: number;
  private readonly signals: SignalDirectorPort | null;
  private readonly signalOffsets: ReadonlyArray<readonly [string, number]>;

  constructor(
    events: readonly StagedEventSpec[],
    private readonly traffic: StagedTrafficPort,
    opts: ScenarioDirectorOptions,
  ) {
    this.seed = opts.seed >>> 0;
    this.signals = opts.signals ?? null;
    // Sorted for deterministic application order regardless of object shape.
    this.signalOffsets = Object.entries(opts.signalOffsets ?? {}).sort((a, b) =>
      a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
    );
    this.applySignalOffsets();
    this.runners = events.map((spec) => createRunner(spec, this.signals));
    this.cast = this.runners.flatMap((r) => r.contactCast);
    for (const runner of this.runners) {
      runner.stage(this.traffic, this.eventRng(runner.spec.id), true);
    }
  }

  /** Session-start phase pinning (B1a N2) — re-applied on every reset(). */
  private applySignalOffsets(): void {
    if (this.signals === null) return;
    for (const [nodeId, offsetSec] of this.signalOffsets) {
      this.signals.setSignalClusterOffset(nodeId, offsetSec);
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

  get telltaleLit(): boolean {
    for (const runner of this.runners) if (runner.telltaleLit === true) return true;
    return false;
  }

  get outcomes(): readonly StagedEventOutcome[] {
    return this.allOutcomes;
  }

  step(input: DirectorInput): DirectorStepResult {
    const events: SimTickEvent[] = [];
    const outcomes: StagedEventOutcome[] = [];

    // 1. THE CONTACT WATCH, BEFORE ANY ADJUDICATION AND BLIND TO ALL OF IT.
    //    The cast was fixed before the first frame and the sentinel reads the
    //    live poses straight off the traffic port, so a runner that retired ten
    //    seconds ago (B81), or never armed at all (B84), changes nothing here.
    this.collisions.length = 0;
    const hit = this.sentinel.watch(this.cast, this.traffic, input, this.collisions);

    // 2. Adjudicate. A runner that owns a body in contact resolves the
    //    encounter as a crash; it never emits the collision itself.
    for (const runner of this.runners) {
      runner.contacted = hit.has(runner.spec.id);
      const outcome = runner.step(this.traffic, input, events);
      if (outcome) {
        outcomes.push(outcome);
        this.allOutcomes.push(outcome);
      }
    }

    // 3. The consequence lands AFTER the law it broke. A barge that ends in a
    //    head-on must read «не отстъпи предимство» first and «сблъсък» second:
    //    the crash is what happened, the rule is what teaches (THEO-4).
    for (const e of this.collisions) events.push(e);
    return { events, outcomes };
  }

  reset(): void {
    this.attempt += 1;
    this.allOutcomes.length = 0;
    this.applySignalOffsets();
    // Actors TELEPORT back to their hold poses — the swept probe must forget
    // every remembered pose or it sweeps across the player on the retry frame.
    this.sentinel.reset();
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
