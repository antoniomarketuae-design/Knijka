/**
 * speakGate — WHEN the Учител is allowed to speak while the student is driving
 * (doc 81 §4.3). The other half of the voice groundwork: `synthesize_bg.mjs`
 * decides WHAT the bytes are, this decides whether they are ever played.
 *
 * TWO FAILURES THIS EXISTS TO PREVENT, and they are not the same failure.
 *
 *  1. An instructor who talks constantly is intolerable. The student switches
 *     the coaching layer off in the first session and never switches it back
 *     on, and every hour spent on the voice is then worth nothing. So the gate
 *     ships CONSERVATIVE — 40 s cooldown, five lines a session, one line per
 *     code per 30 s — and it is meant to feel slightly too quiet.
 *  2. Speaking during a manoeuvre is actively HARMFUL. A line that lands while
 *     the student is mid-steering-input, or three metres from a crossing, is
 *     not late feedback — it is a second task loaded onto someone who has not
 *     got capacity for the first one. `isSafeToInterrupt` is the answer, and
 *     the queue DROPS rather than fires late, because a correct line at the
 *     wrong moment is a wrong line.
 *
 * WHY IT LIVES IN modules/tutor RATHER THAN modules/sim. It is the tutor's
 * speaking policy, and it is the one rule that must be identical no matter
 * which surface asks — so it belongs with the tutor's other budget and
 * refusal rules, exported from the module's public index.ts (docs/architecture
 * /05). To keep that from becoming a cross-module dependency, this file
 * imports NOTHING: `SpeakGateTick` is its own minimal shape and the sim shell
 * adapts its `SimTick` into it. Pure, deterministic, zero DOM/3D/randomness —
 * same state + same tick ⇒ same decision, exactly like the rule engine
 * (ADR-002) and like its twin, sim/lessons/quiz-trigger.ts, whose shape this
 * deliberately copies rather than reinventing.
 *
 * IT IS NOT WIRED YET. Nothing calls it: the lines it would speak are the
 * ≤6-word `hudBg` strings from doc 81 §4.4, which do not exist on
 * `ViolationSpec` yet (item 1.3). Wiring it changes no verdict — this file
 * cannot see, reach or influence grading, and every grade the rule engine
 * produces is byte-identical whether the tutor speaks or stays silent.
 */

// ---------------------------------------------------------------------------
// Tuning — the whole „is it tolerable" decision, in one place
// ---------------------------------------------------------------------------

/** Minimum drive-seconds between two spoken lines. */
export const SPEAK_COOLDOWN_SEC = 40;

/** Hard cap per session. Keeps a drive a drive, not a lecture. */
export const SPEAK_MAX_PER_SESSION = 5;

/**
 * How long a line may wait for a safe window before it is dropped.
 *
 * The alternative — flushing the queue at the next safe moment — is what makes
 * coaching tools feel haunted: the student fixes the mistake, drives on, and
 * forty seconds later hears about something they have already corrected. Past
 * ~20 s the line no longer refers to anything the student can still feel.
 */
export const SPEAK_QUEUE_MAX_WAIT_SEC = 20;

/**
 * Quiet period after any HUD toast. The toast already said it in writing; a
 * voice on top of it is the same message twice, competing with itself for the
 * same attention at the same moment.
 */
export const SPEAK_TOAST_QUIET_SEC = 8;

/** At or below this the car is effectively stopped — a longer line is safe. */
export const SPEAK_SAFE_SPEED_KMH = 5;

/** Seconds of quiet demanded after any manoeuvre commitment. */
export const SPEAK_MANOEUVRE_QUIET_SEC = 3;

/**
 * Metres of clear road ahead demanded before speaking to a moving car. Below
 * this the student's task is the car in front, and it should stay that way.
 */
export const SPEAK_SAFE_LEAD_GAP_M = 15;

/** No second line about the same code inside this window (doc 81 §4.4). */
export const SPEAK_CODE_LOCKOUT_SEC = 30;

// ---------------------------------------------------------------------------
// What may be spoken, and in what order
// ---------------------------------------------------------------------------

/**
 * The four things worth interrupting for, highest first (doc 81 §4.3).
 *
 * `fixedMistake` sits second on purpose. It is the „you fixed it" moment — a
 * commendation for a code the student previously failed — and nothing in the
 * product currently celebrates it, even though it is the single most motivating
 * line a real instructor says. It outranks an objective completion because the
 * objective is already visible on the HUD and this is not.
 */
export type SpeakTrigger =
  /** A repeat graded mistake (escalation multiplier > 1) — „това е третият път". */
  | "repeatMistake"
  /** A commendation for a code the student previously failed. */
  | "fixedMistake"
  /** An objective was completed. */
  | "objectiveComplete"
  /** Stopped at a red / pre-drive — the only place a longer line is safe. */
  | "stationary";

/** Lower number = spoken first when two land on the same tick. */
export const SPEAK_TRIGGER_PRIORITY: Readonly<Record<SpeakTrigger, number>> = {
  repeatMistake: 0,
  fixedMistake: 1,
  objectiveComplete: 2,
  stationary: 3,
};

/**
 * One line the sim would like spoken.
 *
 * `utteranceId` is the key into the pre-rendered manifest
 * (tools/theory/synthesize_bg.mjs) — never text. That is the ADR-002 guarantee
 * made structural: this gate cannot carry a sentence, so no sentence can reach
 * a student's ears that was not authored, reviewed and rendered at build time.
 *
 * `code` is the violation/commendation code the line is about; it drives the
 * per-code lockout, so „Много близо си." cannot be said three times in ten
 * seconds while the student is still closing the gap.
 */
export interface SpeakRequest {
  utteranceId: string;
  trigger: SpeakTrigger;
  code: string;
}

/**
 * The slice of the world the gate needs. Deliberately NOT `SimTick` — see the
 * header. Everything here is a fact the shell already has.
 */
export interface SpeakGateTick {
  /** Drive-time seconds (SimTick.t). Monotonic within a session. */
  t: number;
  speedKmh: number;
  /** Metres to the vehicle ahead; null when the road ahead is clear. */
  leadGapM: number | null;
  /** True only while the student is actually driving (phase === "driving"). */
  driving: boolean;
  /** Any overlay is up: micro-quiz, teach moment, pause menu, debrief. */
  overlayOpen: boolean;
  /** Drive-time of the most recent HUD toast, or null if none yet. */
  lastToastAtSec: number | null;
  /**
   * An опасна / session-terminating event is still live. TeachMomentOverlay
   * already encodes the founder-ratified rule that these get a non-blocking
   * toast and never a modal, precisely so nothing lands during evasive action;
   * the voice inherits that rule rather than re-deriving it.
   */
  dangerLive: boolean;
  /**
   * The student committed to a manoeuvre since the last tick — the shell sets
   * this for `turnStarted`, `stopLineCrossed` and `crossingZoneEntered`.
   * quiz-trigger currently maps those straight to a pause; this gate is the
   * reason the voice will not.
   */
  manoeuvreCommitted: boolean;
  /** Lines the sim wants spoken, in author order. Usually empty. */
  requests: readonly SpeakRequest[];
}

// ---------------------------------------------------------------------------
// State (pure, ref-resident in the shell, exactly like QuizTriggerState)
// ---------------------------------------------------------------------------

export interface SpeakGateState {
  /**
   * The coaching toggle (sim/lessons/advisor.ts ADVISOR_STORAGE_KEY). One
   * switch silences the whole coaching layer — a student who wants quiet must
   * not have to find two.
   */
  enabled: boolean;
  /**
   * Exam sessions are silent, unconditionally and for the whole session.
   * Наредба № 38 чл. 47, ал. 4 forbids the commission from intervening during
   * the exam except to prevent an accident, and a mock exam that coaches
   * teaches the student to expect a voice that will not be there on the day.
   */
  examMode: boolean;
  spokenCount: number;
  lastSpokeAtSec: number | null;
  lastManoeuvreAtSec: number | null;
  /** The ONE line waiting for a safe window. Never a list — see below. */
  pending: { request: SpeakRequest; queuedAtSec: number } | null;
  /** code → drive-time it was last spoken. Drives the 30 s per-code lockout. */
  spokenCodeAtSec: Readonly<Record<string, number>>;
}

export function createSpeakGateState(options: {
  enabled: boolean;
  examMode: boolean;
}): SpeakGateState {
  return {
    enabled: options.enabled,
    examMode: options.examMode,
    spokenCount: 0,
    lastSpokeAtSec: null,
    lastManoeuvreAtSec: null,
    pending: null,
    spokenCodeAtSec: {},
  };
}

export interface SpeakGateResult {
  state: SpeakGateState;
  /** Play this now, or null. At most one per tick, ever. */
  speak: SpeakRequest | null;
  /**
   * Lines that will never be spoken: displaced by something more urgent, past
   * their lockout, or expired waiting for a safe window. Surfaced rather than
   * swallowed so a test can prove the queue drops instead of accumulating, and
   * so the debrief can still mention what the drive was too busy to say.
   */
  dropped: readonly SpeakRequest[];
}

// ---------------------------------------------------------------------------
// The safety question
// ---------------------------------------------------------------------------

/**
 * Is this a moment where a sentence costs the student nothing?
 *
 * Two ways to qualify (doc 81 §4.3): the car is essentially stopped, OR it is
 * rolling with nothing to react to — at least 3 s since any manoeuvre
 * commitment AND more than 15 m of clear road ahead.
 *
 * A null `leadGapM` means the shell found no vehicle ahead, which is the
 * safest case, not an unknown one; a shell that cannot tell must report a
 * small number, the same conservative convention the rule engine uses for
 * absent adjudications.
 */
export function isSafeToInterrupt(
  tick: Pick<SpeakGateTick, "t" | "speedKmh" | "leadGapM">,
  lastManoeuvreAtSec: number | null,
): boolean {
  if (tick.speedKmh <= SPEAK_SAFE_SPEED_KMH) return true;

  const sinceManoeuvre =
    lastManoeuvreAtSec === null ? Infinity : tick.t - lastManoeuvreAtSec;
  if (sinceManoeuvre < SPEAK_MANOEUVRE_QUIET_SEC) return false;

  const gap = tick.leadGapM ?? Infinity;
  return gap > SPEAK_SAFE_LEAD_GAP_M;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

function higherPriority(a: SpeakRequest, b: SpeakRequest): boolean {
  return SPEAK_TRIGGER_PRIORITY[a.trigger] < SPEAK_TRIGGER_PRIORITY[b.trigger];
}

/**
 * Observe one tick and decide whether the tutor speaks.
 *
 * Order of the gates — every one of them deterministic:
 *  1. exam session                      → inert, forever, nothing accumulates.
 *  2. coaching toggled off              → requests dropped, clock still tracked
 *                                         (so re-enabling mid-drive cannot
 *                                         speak into a turn that started while
 *                                         the layer was off).
 *  3. session cap reached               → drop everything, clear the queue.
 *  4. per-code lockout                  → drop the repeat.
 *  5. queue: keep at most ONE line —    a more urgent arrival displaces the
 *     waiting one, a less urgent arrival is dropped on the spot. A queue that
 *     grows is a queue that will one day be flushed.
 *  6. waited too long                   → drop rather than speak late.
 *  7. cooldown / not driving / overlay / danger / toast-quiet / unsafe moment
 *                                       → hold and try again next tick.
 *  8. otherwise                         → speak, and start every clock.
 */
export function observeSpeakTick(
  state: SpeakGateState,
  tick: SpeakGateTick,
): SpeakGateResult {
  if (state.examMode) {
    return { state, speak: null, dropped: tick.requests };
  }

  const next: SpeakGateState = {
    ...state,
    lastManoeuvreAtSec: tick.manoeuvreCommitted ? tick.t : state.lastManoeuvreAtSec,
  };
  const dropped: SpeakRequest[] = [];

  if (!next.enabled) {
    return { state: next, speak: null, dropped: tick.requests };
  }

  if (next.spokenCount >= SPEAK_MAX_PER_SESSION) {
    if (next.pending) dropped.push(next.pending.request);
    return {
      state: { ...next, pending: null },
      speak: null,
      dropped: [...dropped, ...tick.requests],
    };
  }

  let pending = next.pending;
  for (const request of tick.requests) {
    const spokenAt = next.spokenCodeAtSec[request.code];
    if (spokenAt !== undefined && tick.t - spokenAt < SPEAK_CODE_LOCKOUT_SEC) {
      dropped.push(request);
      continue;
    }
    if (pending === null) {
      pending = { request, queuedAtSec: tick.t };
    } else if (higherPriority(request, pending.request)) {
      dropped.push(pending.request);
      pending = { request, queuedAtSec: tick.t };
    } else {
      dropped.push(request);
    }
  }

  if (pending === null) {
    return { state: { ...next, pending: null }, speak: null, dropped };
  }

  if (tick.t - pending.queuedAtSec > SPEAK_QUEUE_MAX_WAIT_SEC) {
    return {
      state: { ...next, pending: null },
      speak: null,
      dropped: [...dropped, pending.request],
    };
  }

  const cooling =
    next.lastSpokeAtSec !== null && tick.t - next.lastSpokeAtSec < SPEAK_COOLDOWN_SEC;
  const toastNoise =
    tick.lastToastAtSec !== null && tick.t - tick.lastToastAtSec < SPEAK_TOAST_QUIET_SEC;

  if (
    cooling ||
    toastNoise ||
    !tick.driving ||
    tick.overlayOpen ||
    tick.dangerLive ||
    !isSafeToInterrupt(tick, next.lastManoeuvreAtSec)
  ) {
    return { state: { ...next, pending }, speak: null, dropped };
  }

  return {
    state: {
      ...next,
      spokenCount: next.spokenCount + 1,
      lastSpokeAtSec: tick.t,
      pending: null,
      spokenCodeAtSec: { ...next.spokenCodeAtSec, [pending.request.code]: tick.t },
    },
    speak: pending.request,
    dropped,
  };
}
