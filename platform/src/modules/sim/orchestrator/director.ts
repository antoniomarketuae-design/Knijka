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
import type { StagedSubstepListener, StagedSubstepPlayer } from "../traffic";
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

  /**
   * sc-roundabout-entry:7b747c15 [major] — THE DIRECTOR DECIDES ON THE CLOCK
   * THE STAGED ACTORS MOVE ON.
   *
   * MEASURED at 2127d8f through liveChainReplay (sc-roundabout-entry, rungs
   * L1–L5): the same lineStop(45 s, 12 км/ч) tape passed at 0 points «yielded»
   * at 60 Hz, 30 Hz and a steady 0.5 s, and was convicted of a COLLISION
   * (10 т.) on two phone cadences, rear-ending the ring circulator at ~69 s.
   * Every trigger a runner tests (a distance, a dwell, a zone, a speed) was
   * tested once per FRAME, so on a 0.5 s frame the circulator was released,
   * re-timed and locked up to half a second late, and ran its whole lap that
   * far behind the 60 Hz car at the same session time.
   *
   * The traffic system now integrates staged actors in physics-sized steps and
   * calls `substep` between two of them inside a long frame, with the player's
   * pose interpolated to that instant (traffic/system.ts `update`). Here every
   * runner that is not `frameClocked` is stepped right there, so a trigger met
   * mid-frame commands its actor from the next physics step, not the next
   * frame — the release time agrees across cadences to within one step, for
   * EVERY trigger kind, without a single runner knowing it happened.
   *
   * CONTACT IS WATCHED AT THE SAME SUB-STEP. The sentinel's swept probe used
   * to sweep the whole frame along the CHORD between the two frame poses; a
   * staged car does not drive a chord, it follows its path — on a junction
   * turn of ~10 m radius a 0.5 s frame at 8 m/s cuts the corner by ~0.2 m,
   * enough to invent a contact the car never made or to miss one it did. So
   * the sentinel runs at every sub-step too, against the staged pose the
   * actor actually has there (the probe then sweeps one physics step at a
   * time), and a runner whose body is in contact at a sub-step is told so at
   * that sub-step. A collision found at a sub-step is delivered with the
   * frame, ONCE per body per frame (exactly what a 60 Hz frame emits), and,
   * as before, after the law it broke.
   *
   * What a sub-step is NOT handed: the frame's `tickEvents` (the runtime
   * samples once per frame, after the traffic; a runner hears them at the
   * frame's own step, as before). Anything a runner emits or resolves in a
   * sub-step is queued and delivered with the frame's own step, FIRST, because
   * it happened first.
   *
   * At 60 Hz there is one staged step per frame and `substep` is never
   * called: the frame is the exact call sequence it always was.
   */
  private readonly substepListener: StagedSubstepListener;
  /** The last frame's input — the interpolation's start. Valid while open. */
  private subOpen = false;
  private subT = 0;
  private subKmh = 0;
  private subBrake = 0;
  /** Reused sub-step input (the frame-loop zero-allocation law). */
  private readonly subInput: DirectorInput = {
    tSec: 0,
    dtSec: 0,
    x: 0,
    y: 0,
    speedKmh: 0,
    headingDeg: 0,
    brakePedal: 0,
    tickEvents: NO_TICK_EVENTS,
  };
  /** What sub-steps emitted / resolved since the last frame step. */
  private readonly pendingEvents: SimTickEvent[] = [];
  private readonly pendingOutcomes: StagedEventOutcome[] = [];
  /** True once a sub-step ran in the frame being integrated; its time. */
  private subRanThisFrame = false;
  private subLastT = 0;
  /** Reused frame-step input when sub-steps ran (only `dtSec` differs). */
  private readonly frameInput: DirectorInput = {
    tSec: 0,
    dtSec: 0,
    x: 0,
    y: 0,
    speedKmh: 0,
    headingDeg: 0,
    brakePedal: 0,
    tickEvents: NO_TICK_EVENTS,
  };
  /** Collisions the sentinel found at this frame's sub-steps (one per body). */
  private readonly pendingCollisions: SimTickEvent[] = [];
  /** Bodies already in `pendingCollisions` / this frame's delivery. */
  private readonly collidedThisFrame = new Set<string>();
  /** Reused sentinel output for one sub-step. */
  private readonly subCollisions: SimTickEvent[] = [];

  /**
   * ROUND 3 — THE DIRECTOR DECIDES ONLY AT GRID POINTS (traffic/system.ts
   * `stepGrid`). With the session clock the traffic system advances the world
   * in whole FIXED_DT steps at k·FIXED_DT and calls `substep` after every step
   * whose grid point lies inside the frame, then `frameEnd(decideAtEnd)`:
   * true when the frame END is itself a grid point (every 60 Hz replay frame:
   * then this frame step is the decision, the exact call it always was), false
   * when it is not — and then the frame step decides NOTHING: no runner that
   * moves a body is stepped and the sentinel does not look, because no body
   * moved since the last grid point. Round 2 decided at every frame end; at
   * 120/144 Hz and under a real desktop jitter that put the director every
   * 7–17 ms and a student-distance latch 25–33 ms late (its verifier, F1).
   *
   * `undefined` = no grid this frame (no session clock, or no traffic update
   * at all): decide at the frame end, as before.
   */
  private frameDecideAtEnd: boolean | undefined = undefined;
  /** False until the first decision after construction or a retry — that one
   *  is always taken at a frame end (there is no earlier input to read). */
  private everDecided = false;
  /** Session time of the last decision, and whether it was a frame step's. */
  private lastDecisionT = 0;
  private lastDecisionAtFrameEnd = false;
  /**
   * The INTEGER grid index of the last decision when it was taken on a grid
   * point (NaN otherwise), and the grid's step. A runner's `dtSec` between two
   * grid decisions is then (k − kLast)·step — the very number a 60 Hz frame
   * hands it (1/60), not a difference of two products that rounds either way.
   * MEASURED before this: twoStop(2, 4.9) locked the ring circulator one step
   * early on every long-frame cadence — its 2.0 s stopped dwell is summed from
   * those dt's and reached the bar 1e-16 s sooner than 120 × (1/60) does.
   */
  private lastDecisionK = Number.NaN;
  private gridStepSec = 0;
  /** The runtime's tick events of frames that ended between two grid points:
   *  heard at the next grid decision, in order, exactly once. */
  private readonly heldTickEvents: SimTickEvent[] = [];
  /** Reused: held events followed by the frame's own, for a frame decision. */
  private readonly decisionTickEvents: SimTickEvent[] = [];
  /** Bodies in contact at any of this frame's grid decisions — what a
   *  frame-clocked runner (stepped at the frame end only) is told. */
  private readonly hitThisFrame = new Set<string>();

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
    this.substepListener = {
      substep: (elapsedSec, stepSec, frameSec, player, gridTimeSec) =>
        this.substep(elapsedSec, stepSec, frameSec, player, gridTimeSec),
      frameEnd: (decideAtEnd, gridStepSec) => {
        this.subOpen = false;
        this.frameDecideAtEnd = decideAtEnd;
        if (gridStepSec !== undefined && gridStepSec > 0) this.gridStepSec = gridStepSec;
      },
    };
    this.traffic.setStagedSubstepListener?.(this.substepListener);
  }

  /**
   * One sub-step of the frame being integrated (see `substepListener`).
   * `player` is the traffic system's interpolation; the speed SIGN is taken
   * from this director's own last input when the context carried a magnitude
   * (liveChainReplay passes |v|, LessonScene the signed sample), and the brake
   * pedal is held — a pedal edge is a frame event and is read at the frame.
   */
  private substep(
    elapsedSec: number,
    stepSec: number,
    frameSec: number,
    player: Readonly<StagedSubstepPlayer>,
    gridTimeSec?: number,
  ): void {
    if (!this.subOpen || !(elapsedSec < frameSec)) return;
    const inp = this.subInput;
    if (gridTimeSec !== undefined) {
      // Round 3: a grid decision — at the grid point's own time, over the time
      // since the last decision, hearing the tick events no decision has yet.
      inp.tSec = gridTimeSec;
      this.gridStepSec = stepSec;
      const k = Math.round(gridTimeSec / stepSec);
      inp.dtSec = Number.isFinite(this.lastDecisionK)
        ? (k - this.lastDecisionK) * stepSec
        : Math.max(0, gridTimeSec - this.lastDecisionT);
      this.lastDecisionK = k;
      inp.tickEvents = this.heldTickEvents.length > 0 ? this.heldTickEvents : NO_TICK_EVENTS;
    } else {
      inp.tSec = this.subT + elapsedSec;
      inp.dtSec = stepSec;
      inp.tickEvents = NO_TICK_EVENTS;
    }
    // The traffic system interpolates from the pose ITS last update() was
    // given — in every live loop the very sample this director was handed.
    inp.x = player.x;
    inp.y = player.y;
    inp.headingDeg = player.headingDeg;
    let kmh = player.speedKmh;
    if (this.subKmh < 0 && kmh > 0) kmh = -kmh;
    inp.speedKmh = kmh;
    inp.brakePedal = this.subBrake;
    this.subRanThisFrame = true;
    this.subLastT = inp.tSec;
    // Contact first, blind to adjudication — the frame step's own order.
    this.subCollisions.length = 0;
    const hit = this.sentinel.watch(this.cast, this.traffic, inp, this.subCollisions);
    for (const e of this.subCollisions) {
      const id = e.kind === "collision" ? e.actorId : undefined;
      if (id !== undefined) {
        if (this.collidedThisFrame.has(id)) continue;
        this.collidedThisFrame.add(id);
      }
      this.pendingCollisions.push(e);
    }
    for (const id of hit) this.hitThisFrame.add(id);
    for (const runner of this.runners) {
      if (runner.frameClocked === true) continue;
      runner.contacted = hit.has(runner.spec.id);
      const outcome = runner.step(this.traffic, inp, this.pendingEvents);
      if (outcome) {
        this.pendingOutcomes.push(outcome);
        this.allOutcomes.push(outcome);
      }
    }
    if (inp.tickEvents === this.heldTickEvents) this.heldTickEvents.length = 0;
    inp.tickEvents = NO_TICK_EVENTS;
    this.lastDecisionT = inp.tSec;
    this.lastDecisionAtFrameEnd = false;
    if (gridTimeSec === undefined) this.lastDecisionK = Number.NaN;
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

  get telltaleCautionLit(): boolean {
    for (const runner of this.runners) if (runner.telltaleCautionLit === true) return true;
    return false;
  }

  get outcomes(): readonly StagedEventOutcome[] {
    return this.allOutcomes;
  }

  step(frameInput: DirectorInput): DirectorStepResult {
    // THE FRAME STEP COVERS ONLY WHAT THE SUB-STEPS DID NOT. A runner's
    // `dtSec` is the interval since its previous step (dwell timers, reaction
    // clocks, yield waits all integrate it); after this frame's sub-steps that
    // is the last sub-interval, not the whole frame — handing it the frame's dt
    // again would count those seconds twice (measured: a 2 s stopped-witness
    // dwell completed in 1.33 s at 30 Hz before this line existed).
    //
    // ROUND 3 (see `frameDecideAtEnd`): on the grid, the frame step decides
    // only when the frame END is a grid point (or nothing has been decided yet
    // since the start or a retry); over the time since the last decision, and
    // hearing the tick events of every frame since — exactly the frame's own dt
    // and events when the last decision was the previous frame step's, which
    // is every 60 Hz replay frame.
    const decideAtEnd = this.frameDecideAtEnd;
    this.frameDecideAtEnd = undefined;
    const grid = decideAtEnd !== undefined;
    const decide = !grid || decideAtEnd === true || !this.everDecided;
    let input = frameInput;
    if (grid) {
      this.subRanThisFrame = false;
      if (decide) {
        const exact = !this.everDecided || this.lastDecisionAtFrameEnd;
        let ticks = frameInput.tickEvents;
        if (this.heldTickEvents.length > 0) {
          const all = this.decisionTickEvents;
          all.length = 0;
          for (const e of this.heldTickEvents) all.push(e);
          for (const e of frameInput.tickEvents) all.push(e);
          this.heldTickEvents.length = 0;
          ticks = all;
        }
        // A frame end that IS a grid point is decided at that point's own time,
        // k·step — the number every sub-step decision of every other cadence
        // uses — not at the frame clock's running sum, which drifts from it in
        // the 13th digit. MEASURED before this line: sc-crossing-child-ball
        // (ball cue, `releaseAtSec = tSec + ballLeadSec`, then `tSec >=
        // releaseAtSec`) released its walker at 6.0333 s at 60 Hz and at
        // 6.0167 s on all ten other cadences of the census pin — 60 Hz was the
        // odd one out, on Σ(1/60) < 6 + 1/60.
        const H = this.gridStepSec;
        const kEnd = H > 0 ? Math.round(frameInput.tSec / H) : Number.NaN;
        const endOnGrid = decideAtEnd === true && H > 0 && Math.abs(frameInput.tSec / H - kEnd) < 1e-6;
        const tDecide = endOnGrid ? kEnd * H : frameInput.tSec;
        if (!exact || ticks !== frameInput.tickEvents || tDecide !== frameInput.tSec) {
          const d = this.frameInput;
          d.tSec = tDecide;
          d.dtSec = exact
            ? frameInput.dtSec
            : endOnGrid && Number.isFinite(this.lastDecisionK)
              ? (kEnd - this.lastDecisionK) * H
              : Math.max(0, tDecide - this.lastDecisionT);
          d.x = frameInput.x;
          d.y = frameInput.y;
          d.speedKmh = frameInput.speedKmh;
          d.headingDeg = frameInput.headingDeg;
          d.brakePedal = frameInput.brakePedal;
          d.tickEvents = ticks;
          input = d;
        }
      } else {
        for (const e of frameInput.tickEvents) this.heldTickEvents.push(e);
        // This frame's dt no longer spans the interval since the last decision.
        this.lastDecisionAtFrameEnd = false;
      }
    } else if (this.subRanThisFrame) {
      this.subRanThisFrame = false;
      const lastSub = this.frameInput;
      lastSub.tSec = frameInput.tSec;
      lastSub.dtSec = Math.max(0, frameInput.tSec - this.subLastT);
      lastSub.x = frameInput.x;
      lastSub.y = frameInput.y;
      lastSub.speedKmh = frameInput.speedKmh;
      lastSub.headingDeg = frameInput.headingDeg;
      lastSub.brakePedal = frameInput.brakePedal;
      lastSub.tickEvents = frameInput.tickEvents;
      input = lastSub;
    }
    const events: SimTickEvent[] = [];
    const outcomes: StagedEventOutcome[] = [];
    // What this frame's sub-steps already decided happened first (see
    // `substepListener`); with no sub-steps both queues are empty.
    if (this.pendingEvents.length > 0) {
      for (const e of this.pendingEvents) events.push(e);
      this.pendingEvents.length = 0;
    }
    if (this.pendingOutcomes.length > 0) {
      for (const o of this.pendingOutcomes) outcomes.push(o);
      this.pendingOutcomes.length = 0;
    }

    // 1. THE CONTACT WATCH, BEFORE ANY ADJUDICATION AND BLIND TO ALL OF IT.
    //    The cast was fixed before the first frame and the sentinel reads the
    //    live poses straight off the traffic port, so a runner that retired ten
    //    seconds ago (B81), or never armed at all (B84), changes nothing here.
    //    Off the grid (`decide` false) nothing has moved since the last grid
    //    point, which already looked.
    this.collisions.length = 0;
    const hit = decide
      ? this.sentinel.watch(this.cast, this.traffic, input, this.collisions)
      : NO_HITS;

    // 2. Adjudicate. A runner that owns a body in contact resolves the
    //    encounter as a crash; it never emits the collision itself.
    for (const runner of this.runners) {
      const frameClocked = runner.frameClocked === true;
      // Off the grid only the frame-clocked runners (the signal clock's) step.
      if (!decide && !frameClocked) continue;
      runner.contacted =
        hit.has(runner.spec.id) || (frameClocked && this.hitThisFrame.has(runner.spec.id));
      // A frame-clocked runner never saw this frame's sub-steps: it is owed
      // the whole frame (identical to `input` whenever no sub-step ran).
      const outcome = runner.step(this.traffic, frameClocked ? frameInput : input, events);
      if (outcome) {
        outcomes.push(outcome);
        this.allOutcomes.push(outcome);
      }
    }
    this.hitThisFrame.clear();
    if (decide) {
      this.everDecided = true;
      this.lastDecisionT = input.tSec;
      this.lastDecisionAtFrameEnd = true;
      // On the grid only when the frame end IS a grid point.
      const H = this.gridStepSec;
      this.lastDecisionK =
        grid && decideAtEnd === true && H > 0 && Math.abs(input.tSec / H - Math.round(input.tSec / H)) < 1e-6
          ? Math.round(input.tSec / H)
          : Number.NaN;
    }

    // 3. The consequence lands AFTER the law it broke. A barge that ends in a
    //    head-on must read «не отстъпи предимство» first and «сблъсък» second:
    //    the crash is what happened, the rule is what teaches (THEO-4).
    //    A body already billed at one of this frame's sub-steps is billed
    //    once — the 60 Hz frame's count.
    for (const e of this.pendingCollisions) events.push(e);
    this.pendingCollisions.length = 0;
    for (const e of this.collisions) {
      const id = e.kind === "collision" ? e.actorId : undefined;
      if (id !== undefined && this.collidedThisFrame.has(id)) continue;
      events.push(e);
    }
    this.collidedThisFrame.clear();

    // The next frame's sub-steps interpolate from here.
    this.subOpen = true;
    this.subT = input.tSec;
    this.subKmh = input.speedKmh;
    this.subBrake = input.brakePedal;
    return { events, outcomes };
  }

  reset(): void {
    this.attempt += 1;
    this.allOutcomes.length = 0;
    // A retry teleports everything: nothing decided before it carries over,
    // and the next frame must not interpolate from a pose before it.
    this.subOpen = false;
    this.pendingEvents.length = 0;
    this.pendingOutcomes.length = 0;
    this.pendingCollisions.length = 0;
    this.collidedThisFrame.clear();
    this.subRanThisFrame = false;
    this.everDecided = false;
    this.lastDecisionAtFrameEnd = false;
    this.lastDecisionK = Number.NaN;
    this.heldTickEvents.length = 0;
    this.hitThisFrame.clear();
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

  /** The cast the sentinel sweeps, readable — `directorContactCast`'s source.
   *  Handed over as the SAME array rather than re-derived: a second walk over
   *  the runners could drift, and two names for one body double-bill a single
   *  crash. */
  get contactCast(): readonly ContactCastMember[] {
    return this.cast;
  }
}

/**
 * THE SESSION'S CONTACT CAST, readable from outside — ONE VOCABULARY FOR TWO
 * LIVE REPORTERS.
 *
 * A browser drive has two reporters pointed at the same bodies: this
 * director's sentinel, which names every staged body it is inside of
 * (`ContactCastMember.actorId`), and the rapier contact handler, which reaches
 * the runtime through `LessonScene`. If those two invent DIFFERENT names for
 * one body the rule engine sees two episodes and bills one crash twice —
 * exactly the catastrophe the per-body key was introduced to end. So the
 * physics side does not invent a name at all: it reads the cast the sentinel
 * itself watches and reuses that id verbatim.
 *
 * A WeakMap rather than a member on `ScenarioDirector`: the interface is the
 * orchestrator's published seam (orchestrator/types.ts) and a naming detail of
 * the live physics wiring has no business widening it. Keyed on the returned
 * director, so it cannot outlive the session it describes.
 *
 * Empty array for a director this module did not build (fakes in tests) —
 * an unknown director names nothing, which is the innocent direction: the
 * physics reporter falls back to its per-category behaviour (A12).
 */
const NO_TICK_EVENTS: readonly SimTickEvent[] = Object.freeze([]) as readonly SimTickEvent[];
const NO_HITS: ReadonlySet<string> = new Set<string>();

const castByDirector = new WeakMap<ScenarioDirector, readonly ContactCastMember[]>();
const NO_CAST: readonly ContactCastMember[] = [];

/** The cast `director`'s sentinel sweeps every frame — see `castByDirector`. */
export function directorContactCast(
  director: ScenarioDirector | null,
): readonly ContactCastMember[] {
  return (director !== null && castByDirector.get(director)) || NO_CAST;
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
  const director = new ScenarioDirectorImpl(events, traffic, opts);
  castByDirector.set(director, director.contactCast);
  return director;
}
