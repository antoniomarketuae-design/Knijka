/**
 * Lesson session engine — the pure lifecycle reducer of a driving lesson:
 *
 *   create → [preDrive machine, if the spec enables it] → driving
 *          → objectives complete in order → completed
 *          → OR the end of the route is reached → completed (finish.ts)
 *   (finishSession = manual end for free drive / early exit;
 *    abortSession   = student quit, graded as not passed)
 *
 * FINISHING ≠ PASSING. Every path above only sets `phase`. The verdict is
 * folded separately by buildLessonResult: `passed` still demands the official
 * score AND every objective done AND not aborted, so a drive that ended at
 * the finish with tasks skipped ends REPORTED AS FAILED — it just ends.
 *
 * It owns NOTHING the lower layers already own: law adjudication lives in
 * rules/ (reduceTick), the pre-drive choreography in procedures/ — this file
 * only orchestrates them, advances objectives (objectives.ts) and accumulates
 * every scorable event for the final buildSessionSummary fold.
 *
 * Everything is pure & immutable: same state + same input => same output.
 * The React shell keeps the state in a ref and re-renders from snapshots.
 */

import type {
  HudEvent,
  LessonObjective,
  LessonSpec,
  NearMissEvent,
  StagedEventOutcome,
} from "../contracts";
import {
  actCopy,
  actIsOpen,
  applyActAmendments,
  buildSessionSummary,
  conditionsSpeedEnvelope,
  createRuleEngine,
  isScorableEvent,
  parseSpeedMeasurement,
  reduceTick,
  settlePendingTaskArrival,
  settleUnpaidAdaptationTeach,
  settleUnpaidSpeedingTeach,
  settleUnpaidTaskTeach,
  taskCapBillLineKmh,
  violationPeekBg,
  type ConditionsCause,
  type RuleEngineConfig,
  type RuleEngineState,
  type RuleEvent,
  type ScorableEvent,
  type SignBoundArrival,
  type SimTick,
  type TaskCapArrival,
  type TaskSpeedCap,
  type ActAmendment,
  type ViolationCode,
  type ViolationEvent,
} from "../rules";
import { coachStep } from "../scenarios";
import {
  applyPreDriveAction,
  createPreDriveMachine,
  type PreDriveStepId,
} from "../procedures";
import {
  REACH_ZONE_CAP_SLACK_KMH,
  REACH_ZONE_GRACE_M,
  REACH_ZONE_HALT_CAP_KMH,
  brakingFaultVoidsObjective,
  contactVoidsObjective,
  createEvalState,
  greenStartFaultVoidsObjective,
  oncomingGapDetail,
  parseObjectiveParams,
  personContactVoidsObjective,
  personHaltVoidsObjective,
  railBarredVoidsObjective,
  reachZoneApproachAxis,
  reachZoneJourneyRefusal,
  reachZoneMarkCrossing,
  reachZoneStateRefusal,
  restFaultVoidsObjective,
  solidLineFaultVoidsObjective,
  speedFaultVoidsObjective,
  stepLineStandstill,
  stepObjective,
  stopSignRollVoidsObjective,
  yieldFailedVoidsObjective,
  type ObjectiveContext,
  type ReachZoneJourneyRefusal,
  type YieldFaultCode,
  type YieldFaultRecord,
} from "./objectives";
import { lessonYieldsToRailVehicle, shownObjectiveCapKmh, stepYieldVoice, yieldVoiceSiteAt } from "./advisor";
import { foldTrainingScore, type PenaltyEscalation } from "./escalation";
import { foldLessonMistakes, lessonMistakeTargetCodes } from "./lessonMistake";
import { examTerminationFor } from "./exam";
import {
  CRASH_PIN_RADIUS_M,
  CRASH_PIN_STUCK_S,
  FINISH_STANDSTILL_KMH,
  ROUTE_RUNOUT_MAX_S,
  createFinishGate,
  routeDepartedEndingCopy,
  routeEndMark,
  routeFinishZone,
  offNetworkEndingCopy,
  routeRunOutArrived,
  stepOffNetwork,
  stepFinishGate,
  stepYieldWait,
  TASK_CAP_STRETCH_START,
  stepTaskCapStretch,
  taskCapStretch,
  terminalDepartureZone,
  terminalRescueZone,
} from "./finish";
import { taskCapFeatureFor } from "./taskCapFeatures";
import type {
  CoachedMistake,
  EventPosition,
  LessonPhase,
  LessonResult,
  LessonSessionState,
  ObjectiveDetail,
  ObjectiveEvalState,
  ObjectiveParams,
  ObjectiveProgress,
  ObjectiveOutcome,
  SessionNearMiss,
  SpeedingSettleTick,
  StopLineWatch,
  TaskCapBreach,
  TaskCapLatch,
  TaskCapMarkWatch,
  TeachMoment,
} from "./types";

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface LessonEngineOptions {
  /** Night flag for the pre-drive machine + rule engine (headlights). */
  isNight?: boolean;
  ruleConfig?: Partial<RuleEngineConfig>;
}

export function createLessonSession(
  lesson: LessonSpec,
  opts: LessonEngineOptions = {},
): LessonSessionState {
  const isNight = opts.isNight ?? lesson.environment?.timeOfDay === "night";

  const objectives: ObjectiveProgress[] = lesson.objectives.map((spec, i) => ({
    spec,
    params: parseObjectiveParams(spec),
    status: i === 0 ? "active" : "pending",
    progress: 0,
    completedAtSec: null,
  }));

  return {
    lesson,
    phase: lesson.preDrive ? "preDrive" : "driving",
    isNight,
    // A2: the lesson default is "instruction" (guided first contact); specs
    // opt into "practice"/"assess" via the additive preDriveMode field.
    preDrive: lesson.preDrive
      ? createPreDriveMachine({ isNight, mode: lesson.preDriveMode ?? "instruction" })
      : null,
    // The compiled lesson's ruleConfig (scenario drills for config-gated
    // detectors) is the base; explicit opts win over it.
    rules: createRuleEngine({ ...lesson.ruleConfig, ...opts.ruleConfig }),
    objectives,
    evalStates: objectives.map((o) => createEvalState(o.params)),
    currentObjectiveIndex: 0,
    events: [],
    scenarioEncounters: {},
    penaltyEscalations: [],
    lastTeachMomentAtSec: null,
    coachedMistakes: [],
    lastT: 0,
    endedAtSec: null,
  };
}

// ---------------------------------------------------------------------------
// Step results — every transition returns the new state + HUD events to show
// ---------------------------------------------------------------------------

export interface LessonStepResult {
  state: LessonSessionState;
  hudEvents: HudEvent[];
  /**
   * A9: first-encounter teach moments the shell must PAUSE for (freeze
   * physics, show the mini-lesson card, resume on acknowledgment). Additive:
   * only applyTick produces them; several in one result merge into a single
   * pause (the shell queues the cards).
   */
  teachMoments?: TeachMoment[];
  /**
   * THEO-3 (lesson.mistakeExperience sessions only): the targeted wrong
   * action just fired — the ONE-SHOT consequence moment. The shell pauses on
   * it and shows the consequence overlay (red-ghost replay + the stored
   * whatWentWrongBg + the lawRef citation) instead of the teach card. At
   * most one per session (state.mistakeExperienceHitAtSec latches); the same
   * TeachMoment shape rides catalog copy only (ADR-002).
   */
  mistakeMoment?: TeachMoment;
}

/**
 * A9 rate limit: minimum sim-seconds between two teach-moment PAUSES. Teach
 * moments landing on the SAME tick still all emit (they merge into one pause);
 * a later one inside this window downgrades to the classic non-blocking
 * lesson toast, so a mistake cluster never chains modal interruptions. Sim
 * time freezes during the pause itself, so the window is measured in actual
 * driving time.
 */
export const TEACH_PAUSE_MIN_GAP_S = 15;

/**
 * A LOWER-CLASS TEACH CARD NEVER HOLDS THE PAUSE AGAINST A DANGEROUS OR CHARGED
 * FAULT (round 6 of the 2026-09-25 task-cap ruling; round-5 verifier F5).
 *
 * On L1 (`pauseOnError`) a charged fault ALSO pauses with its card, rate-limited
 * like every pause. Measured on round 5: the new TASK card — a второстепенна,
 * uncharged first encounter — took the 15 s slot on five L1 mistake legs, and the
 * pause the base product gave a charged опасна fault a few seconds later went
 * down to a toast: `sc-sig-flash-amber-ped` and `sc-pe-parked-row-scan`
 * (PEDESTRIAN_CROSSING_TOO_FAST), `sc-merge-bus-pullout`, `sc-ac-ice`,
 * `sc-ac-bridge-ice` (COLLISION). A free 1-point-class lesson must not decide
 * whether the student stops for an exam-ending fault.
 *
 * So the slot a CHARGED card sees is closed only by a HEAVY pause — one that
 * held any card other than such a lower card: a charged card of any class, an
 * основна or опасна teach card — for the same 15 s (`applyTick`,
 * `lastHeavyTeachMomentAtSec`). A pause made only of lower cards (uncharged
 * teach cards of the второстепенна class — the task cap is one) never refuses
 * it, and on a frame where both land the lower card YIELDS its place in the
 * queue (`orderTeachMoments`). Everything else is unchanged: every pause still
 * closes the slot to every later TEACH card for 15 s, and a lower card that
 * pauses after a charged one (the ADR-009 first card of the lesson's own
 * mistake does) does not re-open it: measured on `sc-pe-parked-row-scan` L1,
 * where that card lands 0.04 s after the pedestrian card and the collision
 * 0.6 s later keeps its toast, as on base.
 */
export function isLowerClassTeach(m: Pick<TeachMoment, "severity" | "charged">): boolean {
  return m.charged !== true && m.severity === "vtorostepenna";
}

/**
 * The cards of ONE frame's pause, queued in the order the shell shows them: a
 * lower-class teach card yields to a charged card landing on the same frame
 * (see `isLowerClassTeach`). Identity whenever the frame has no charged card or
 * no lower one, so every other pause is queued exactly as before.
 */
export function orderTeachMoments(moments: TeachMoment[]): TeachMoment[] {
  if (!moments.some((m) => m.charged === true) || !moments.some(isLowerClassTeach)) return moments;
  return [...moments.filter((m) => !isLowerClassTeach(m)), ...moments.filter(isLowerClassTeach)];
}

/**
 * Cap on the shown-but-not-charged record (CoachedMistake) — the same
 * discipline as every additive channel (wire.ts MAX_NEAR_MISSES): a continuing
 * offence re-raised every few seconds for an hour must not grow the state or
 * the finish payload without bound. 100 distinct display moments is far past
 * anything a real drive produces (the deepest queue measured was eight).
 */
export const MAX_COACHED_MISTAKES = 100;

/**
 * Frame-zero pose guard (doc 87 B3/B10/B11 — see
 * LessonSessionState.posedAtSec). A tick "describes the vehicle" unless it is
 * the scene's placeholder: `scene/vehicleSample.ts createVehicleSample()`
 * publishes EXACTLY the district origin at EXACTLY zero speed, and the scene
 * ticks this engine with it for the frames before the chassis writes its first
 * pose. Not one of the 90 committed districts places a spawn point at (0, 0)
 * — measured over content/world/*.json — so the origin at a standstill is the
 * placeholder and nothing else. A drill that ever did spawn there would simply
 * start grading on its first metre of movement.
 */
export const POSE_MOTION_KMH = 0.5;

/**
 * SPD (founder review R3 #39/#48 — „distance warnings while visibly far"):
 * the FOLLOWING_TOO_CLOSE family is TIME-GAP math (the 2-second rule), and at
 * street speed its fire threshold is 14–17 METERS — a gap that genuinely
 * reads "far" through a windshield. The math was verified correct (fires
 * only under ~0.7 × the taught gap, sustained, while not recovering), so the
 * detector stays untouched; what was missing is the WHY. This appends the
 * MEASURED gap at warning time — „Дистанция в момента: 1,4 с (16 м) — дръж
 * поне 2 с." — to the DISPLAY text (HUD toast + teach card) only. The scored
 * ScorableEvent, the wire serialization and the server grade keep the
 * catalog's fixed copy byte-identically (ADR-002: authored text + measured
 * numbers, never free text). Targets derive from the session's own rule
 * config (ceil(1.8) = 2 dry; ceil(1.8 × 1.6) = 3 rain — exactly the numbers
 * the catalog copy teaches), so per-lesson overrides stay honest.
 */
function withFollowingGapDetail(
  e: ViolationEvent,
  tick: SimTick,
  cfg: RuleEngineConfig,
): string {
  if (
    e.code !== "FOLLOWING_TOO_CLOSE" &&
    e.code !== "FOLLOWING_TOO_CLOSE_FOR_RAIN" &&
    // FO-08: the closing code is the same duty measured while it collapses —
    // it needs the number MORE than the other two, because „намали с нея" is
    // meaningless without knowing how much room is left.
    e.code !== "CLOSING_ON_LEAD_TOO_FAST"
  ) {
    return e.explanationBg;
  }
  const gapM = tick.leadGapM;
  const mps = tick.speedKmh / 3.6;
  if (gapM === undefined || !Number.isFinite(gapM) || mps <= 0.5) return e.explanationBg;
  const gapSec = gapM / mps;
  const targetSec = Math.ceil(
    cfg.followSafeSeconds *
      (e.code === "FOLLOWING_TOO_CLOSE_FOR_RAIN" ? cfg.followRainSecondsFactor : 1),
  );
  const gapTxt = gapSec.toFixed(1).replace(".", ",");
  return `${e.explanationBg} Дистанция в момента: ${gapTxt} с (${Math.round(gapM)} м) — дръж поне ${targetSec} с.`;
}

/** „78,4" — one decimal, Bulgarian comma, the way the cluster prints a speed. */
function kmhTxt(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace(".", ",");
}

/**
 * A THRESHOLD, PRINTED AS IT IS — round 14 (R1-THEO4-ROUNDED-ENVELOPE). Every line a speed card states the measured
 * speed is over — the sign, the bend's advisory, the task's ceiling, what the weather leaves of the sign — is printed
 * with every decimal it has (to the hundredth: the envelope is the sign × a factor in hundredths — «42,5», «38,25»,
 * «119»), a decimal comma, never rounded to a whole number. Round 13 printed `Math.round` beside a strict «над», so a
 * committed lesson read «… с 42,8 км/ч … — и над 43 км/ч, които дъждът оставя от знака 50»: a false sentence. A whole
 * number prints exactly as `Math.round` printed it, so every card whose numbers were whole is byte-identical.
 */
function kmhExact(v: number): string {
  return (Math.round(v * 100) / 100).toString().replace(".", ",");
}
/** The number a printed figure reads as — the card's own comparison is made on what it prints. */
const printedValue = (txt: string): number => Number(txt.replace(",", "."));

/**
 * A MEASURED SPEED PRINTED BESIDE THE LINE IT IS COMPARED WITH — round 14, R1 answered as a class (THEO-4: every
 * comparison a sentence states holds between the numbers it PRINTS). The objective's own two speed toasts fire on a
 * strict comparison — «Стигна точката, но твърде бързо» on `speed > cap`, «Мина точката твърде бавно» on `speed <
 * floor` — and printed `Math.round(speed)`, so a car at 10,3 on a «не повече от 10 км/ч» mark read «… не повече от 10
 * км/ч, а стигна дотук с 10 км/ч». Measured before the fix on 9 committed recorder legs (sc-park-45 L3/L5,
 * sc-park-perp-forward L1/L2/L3/L5 — base behaviour). The whole number stays wherever it bears the comparison out
 * (every other such toast is byte-identical); otherwise the cluster's one decimal; otherwise «малко над/под N», which
 * the toast's own trigger makes true. Nothing here decides anything: the objective's outcome is read where it was.
 */
function speedBeyondTxt(v: number, line: number, side: "over" | "under"): string {
  const printedLine = printedValue(kmhExact(line));
  const holds = (x: number) => (side === "over" ? x > printedLine : x < printedLine);
  const whole = Math.round(v);
  if (holds(whole)) return `${whole} км/ч`;
  const tenth = kmhTxt(v);
  if (holds(printedValue(tenth))) return `${tenth} км/ч`;
  return `малко ${side === "over" ? "над" : "под"} ${kmhExact(line)} км/ч`;
}

/** The task cap's code — the one code of the cap ledger (`rules/engine.ts` „THE CAP LEDGER'S ACT"). */
const TASK_CAP_CODE = "TASK_SPEED_CAP_EXCEEDED";

/**
 * THE SPEED THE CARD CONVICTED ON, SAID FIRST — w10-4, 2026-08-24.
 *
 * THE FRAME. `.audit-frames/w10-4/frames/sc-sp-curve__mobile-wrong/
 * 04-t193s.png`, 2556 × 1179, opened: the notification column carries
 * «⚠ −1 ИЗПИТНА Т. · Превишена скорост · Движеше се над разрешената», the
 * posted-limit badge on the instrument strip reads 90, and the cluster in the
 * same photograph reads **11 км/ч**. Five seconds earlier (04-t188s) the same
 * cluster read 97. The card is telling the truth about a moment that has
 * passed, and there is nothing on the glass that says so — no measurement, no
 * limit, no tense marker of any kind. What a seventeen-year-old sees is an
 * accusation of speeding laid over a speedometer showing eleven.
 *
 * `sc-speed-transition/mobile-wrong/04-t018s.png` is the same card one band up:
 * «⚠ −10 ИЗПИТНИ Т. +2 · Превишаване с повече от 10 км/ч», cluster 59, disc 30,
 * and not one word of the catalogue's explanation on screen — «↓ ОЩЕ 5 РЕДА»
 * takes all of it.
 *
 * WHY THE NUMBERS EXIST ALREADY AND NOBODY SHOWED THEM. `rules/engine.ts` holds
 * the speed AND `tick.maxSpeedKmh` at the instant it convicts and encodes the
 * pair onto `ViolationEvent.detail` (`consequences.ts encodeSpeedMeasurement`,
 * „v97/l90"). The DEBRIEF decodes it — `debrief.ts worstSpeedDetail` prices the
 * ЗДвП чл. 182 ladder off exactly this — and the live card never did. So the
 * one surface the student reads WHILE he can still correct the fault was the
 * one surface without the measurement.
 *
 * IT LEADS, IT DOES NOT TRAIL, and that is the half the frames decide. The
 * FOLLOWING family's readout above is APPENDED, which is right for a card that
 * gets to finish printing; these two do not. On both frames above the peek is
 * the post-mirror-lane 95.8 px column (`notifyColumn.ts`
 * NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN) and the fold swallowed the entire body
 * — an appended sentence would land at line 6 of 5 hidden ones, i.e. nowhere.
 * The first line is the only line the compact card guarantees, so the
 * measurement takes it and the catalogue's teaching follows behind, whole.
 *
 * THE CURVE CODE HAS THE SAME TWO NUMBERS AND CARRIES NEITHER. `reduceTick`
 * raises SPEED_TOO_FAST_FOR_CURVE with no `detail` at all, from a branch where
 * `speed` and `tick.curveAdvisoryKmh` are both in scope. It is read off the
 * TICK here rather than stamped onto the event on purpose: `detail` is a wire,
 * database and trace field, `debrief.ts` prices `encodeSpeedMeasurement`
 * details through the чл. 182 fine ladder, and an А1 табела is NOT a posted
 * limit — exceeding it is чл. 20, ал. 2, not чл. 182. Stamping the same codec
 * on it would have printed a speeding fine for a curve-advisory fault. Same
 * reason the sentence says «препоръчителни … от табелата» and never
 * «разрешени»: the two scales are different laws and this product may not
 * blur them.
 *
 * DISPLAY ONLY, exactly like the gap readout it sits beside: the scored
 * `ScorableEvent`, the wire serialization and the server-rebuilt grade keep the
 * catalogue's fixed copy byte-identically (ADR-002 — authored text plus
 * measured numbers, never free text).
 *
 * ⚠ TWO OF THREE. The finding this answers (`sc-sp-curve:02e43576`) names three
 * absences — no measurement, no tense marker, NO TIMESTAMP — and an adversarial
 * verifier was right that this closes only the first two. The row stays OPEN on
 * the third and it is not this function's to close, for a reason worth stating
 * so nobody solves it here: `explanationBg` is computed ONCE, at the tick that
 * raises the card, so an age written into this string would freeze at «преди
 * 0 с» and stay there while the card aged on the glass — the very defect the
 * frame documents, wearing the costume of the fix.
 *
 * The moment is a RENDER-time property and it is already built, whole, one
 * module out: `hud/HudToasts.tsx toastAgeBg` («сега» / «преди 8 с»),
 * `toastCarriesAge` (which already returns true for `violation`), and
 * `hud/overlayQueue.ts overlayMomentBg` + `SimOverlayItem.raisedAtMs`. On the
 * roomy leg it prints. On a PHONE — which is where both frames were shot — the
 * shell re-maps toasts into `SimOverlayItem` and drops the stamp at that
 * boundary. The two edits that spend it are named in `overlayQueue.ts`'s own
 * block (the shell re-map in `LessonPlayShell.tsx`, the last row in
 * `SimOverlay.tsx`) and `hud-toast-moment.test.tsx` holds an interlock that
 * goes red the moment the first of them lands. That is the owner; the third
 * clause is filed against it, not against this line.
 */
function withSpeedMeasurement(
  e: ViolationEvent,
  tick: SimTick,
  explanationBg: string,
  cfg: RuleEngineConfig,
  signArrival?: SignBoundArrival,
): string {
  if (e.code === "SPEEDING_OVER_LIMIT" || e.code === "SPEEDING_DANGEROUS") {
    const m = parseSpeedMeasurement(e.detail);
    if (m === null) return explanationBg;
    return `Отчетена скорост ${kmhTxt(m.measuredKmh)} км/ч при разрешени ${kmhExact(m.limitKmh)} км/ч. ${explanationBg}`;
  }
  if (e.code === "SPEED_TOO_FAST_FOR_CURVE") {
    const advisory = tick.curveAdvisoryKmh;
    const measured = tick.speedKmh;
    if (advisory === undefined || !Number.isFinite(advisory) || advisory <= 0) return explanationBg;
    if (!Number.isFinite(measured) || measured <= 0) return explanationBg;
    return `Отчетена скорост ${kmhTxt(measured)} км/ч при препоръчителни ${kmhExact(advisory)} км/ч от табелата. ${explanationBg}`;
  }
  // The task ceiling (founder ruling 2026-09-25): the figure the student READ
  // (`shownKmh`), off the stamped tick the reducer graded — never a `detail`,
  // because a `v…/l…` measurement on the event is priced as a SPEEDING rung by
  // `FaultCard` and the debrief, and a task number is not a posted limit.
  //
  // …AND WHAT THE WEATHER LEAVES OF THE SIGN, WHERE THE CAR IS OVER THAT TOO (round 2, verifier C4): a card that
  // quoted only the task's 80 at a measured 127 in the rain would hide that the drive was also over the 119 the rain
  // leaves of a 140 — read off the SAME derivation the weather detector uses (`conditionsSpeedEnvelope`), never
  // re-typed, and said only where it is TRUE AS PRINTED (`overEnvelopeClause`).
  //
  // ROUND 14 (founder ruling 2026-10-03, «Cap adds, never removes»): this is the CAP's card; the weather card below
  // is what it is on the same drive with no cap (round 2–13 gave it a second number, «и над тавана на задачата N
  // км/ч», so the weather bill's text depended on the cap — the cap's own card speaks for the cap).
  const measured = tick.speedKmh;
  if (e.code === "TASK_SPEED_CAP_EXCEEDED") {
    // ROUND 7 — A SIGN-BOUND ARRIVAL (a cap the glass showed at or above the
    // sign; `rules/engine.ts` „THE SIGN-BOUND ARRIVAL"). Its bill can land frames
    // after the blow, so it carries the blow itself (`signBoundArrival`), and the
    // card says all three numbers: the speed the mark was passed at, the cap the
    // student read, and the sign — which a car over such a cap is over too, and
    // which is the stricter ceiling there (the catalogue's «важи по-строгото»).
    if (signArrival !== undefined && e.regrade !== true) {
      const v = signArrival.arrivalKmh;
      if (Number.isFinite(v) && v > 0) {
        return `Мина точката на задачата с ${kmhTxt(v)} км/ч при таван на задачата ${kmhExact(signArrival.shownKmh)} км/ч — и над ограничението от знака ${kmhExact(signArrival.postedKmh)} км/ч. ${explanationBg}`;
      }
    }
    // ROUND 5 — THE ARRIVAL (founder ruling 2026-09-26 «Bill the arrival»): the
    // bill raised AT the blow says what the student did there — the speed the
    // mark was passed at and the cap he read — off the arrival the reducer
    // graded (`SimTick.taskCapArrival`, on this frame only). It is never a
    // re-grade, so a settled or re-graded bill keeps the sustained copy below.
    const arrival = tick.taskCapArrival;
    if (arrival !== undefined && e.regrade !== true) {
      const v = Math.abs(arrival.arrivalKmh);
      if (Number.isFinite(v) && v > 0) {
        return `Мина точката на задачата с ${kmhTxt(v)} км/ч при таван на задачата ${kmhExact(arrival.shownKmh)} км/ч${overEnvelopeClause(v, tick, cfg)}. ${explanationBg}`;
      }
    }
    const cap = tick.taskSpeedCap;
    if (cap === undefined || !Number.isFinite(measured) || measured <= 0) return explanationBg;
    return `Отчетена скорост ${kmhTxt(measured)} км/ч при таван на задачата ${kmhExact(cap.shownKmh)} км/ч${overEnvelopeClause(measured, tick, cfg)}. ${explanationBg}`;
  }
  return explanationBg;
}

/**
 * «— и над N км/ч, които дъждът оставя от знака S» — said ONLY WHERE IT IS TRUE AS PRINTED (round 14,
 * R1-THEO4-ROUNDED-ENVELOPE): the measured speed is over the envelope (the weather detector's own comparison,
 * unchanged — WHO IS BILLED does not move, this is a sentence) AND the speed as this card prints it (`kmhTxt`, one
 * decimal) is over the envelope as it prints it (`kmhExact`, every decimal it has). Round 13 printed the envelope
 * rounded to a whole number beside the strict «над»: 42,8 «над 43». Where the two printed numbers do not bear the
 * comparison out (42,53 prints «42,5» against a 42,5 envelope) the clause is not said at all — the card names only what
 * its own numbers show, and the weather's own card, if it billed, says the rest.
 */
function overEnvelopeClause(v: number, tick: SimTick, cfg: RuleEngineConfig): string {
  const env = conditionsSpeedEnvelope(tick, cfg);
  if (env === null || !(v > env.limitKmh)) return "";
  if (!(printedValue(kmhTxt(v)) > printedValue(kmhExact(env.limitKmh)))) return "";
  return ` — и над ${kmhExact(env.limitKmh)} км/ч, които ${CONDITIONS_CAUSE_BG[env.cause]} оставя от знака ${kmhExact(tick.maxSpeedKmh)}`;
}

/** The governing condition, as the subject of «… оставя от знака N». */
const CONDITIONS_CAUSE_BG: Record<ConditionsCause, string> = {
  rain: "дъждът",
  fog: "мъглата",
  snow: "снегът",
  night: "тъмното",
};

/** A bill without the cap ledger's bookkeeping marks — see `capLedgerAdmits`. */
function withoutKinMarks(e: ViolationEvent): ViolationEvent {
  if (e.absorbedBy === undefined && e.signBoundArrival === undefined) return e;
  // Round 7: the sign-bound arrival's blow is display data for the card, read
  // off the RAW bill before this strip — never scored, serialised or stored.
  const { absorbedBy: _absorbedBy, signBoundArrival: _signBoundArrival, ...plain } = e;
  return plain;
}

/**
 * THE ACTIVE TASK'S OWN CEILING, stamped onto the tick the rule engine grades —
 * founder ruling 2026-09-25 (register item 17, „Bill it"; rows
 * `sc-ac-truck-spray:990e5f64` / `:8ed4d8b3`).
 *
 * THIS IS THE ONLY PRODUCER of `SimTick.taskSpeedCap`, and it lives here
 * because this is the only module that knows which objective is active and
 * what the student did at its mark; the rules module keeps knowing nothing
 * about lessons (doc 05). The scene, every recorder and every replay hand the
 * reducer ticks without it, so every committed trace's rule stream is
 * byte-identical by construction.
 *
 * FROM WHERE THE CEILING BINDS — MEASURED, NOT ASSUMED. The first cut stamped
 * the cap for the whole life of the objective, as the strip prints it from the
 * spawn. Driven through the bot-completion suites that put every committed
 * CORRECT demonstration through this engine, it billed ten of them, every one
 * on the approach and every one arriving legally (`sc-ac-ice`, `sc-merge-bus-
 * pullout`, `sc-ac-bridge-ice`, `sc-ed-d2-stop-address`, `sc-follow-tailgater`,
 * `sc-ov-crest-curve`, `sc-mv-uturn-ban`, `sc-pe-zone-living`, `sc-park-45`,
 * `sc-speed-creep`). The catalogue authors these caps as ARRIVAL demands, and
 * every gate in `objectives.ts` grades them that way. So the ceiling binds from
 * the mark the task names: it is LATCHED once the student has gone THROUGH that
 * mark over it. A student who brakes in time is never latched at all.
 *
 * ROUND 15 — THROUGH THE MARK MEANS AT THE MARK (founder ruling 2026-10-03
 * «LIKE A SPEED SIGN»; `sc-follow-tailgater:4b342eee`). Rounds 3–14 latched
 * off `approachCap === "blown"`, the evaluator's verdict — and an approach
 * HONOURED anywhere on the capsule kept that verdict through the mark, so a car
 * eased to the gate 20 m short and then accelerated through the mark at 53,6
 * under a «≤36» was never latched. The latch is now created on the frame the
 * car CROSSES the mark (`markCrossingOf`), at the speed interpolated to the
 * crossing point, when that speed is over the bill line — the glass figure plus
 * the tolerance a posted limit gets (`taskCapBillLineKmh`), flow caps only. A
 * mark credited a few metres short of itself is still read when the car crosses
 * it (`LessonSessionState.taskCapMarkWatch`).
 *
 * ROUND 3 — ONE LATCH PER BLOW (verifier R2). Round 2 re-derived the stamp every
 * frame from `approachCap`, and `stepReachZone` CLEARS that verdict on a fresh
 * approach (the ring-entry edge); round a ring the stamp therefore dropped out
 * once a lap at the mark (and once more at the half-line's far edge), each drop
 * ended the act, and each re-appearance charged a new one — a constant 30 round
 * the ≤20 ring paid 3 points in 2.5 laps and 5 in 3.5. The latch is created on
 * the blow's frame and then holds on its own: it stamps whenever the car
 * is inside the stretch it fixed at the blow, whatever `approachCap` does in
 * between, and it is released only when the objective changes. Once the car
 * leaves the stretch's goal behind it is SPENT and stamps nothing; the mark
 * crossed over the line AGAIN once the objective's verdict no longer reads
 * „blown" (`rearmed`) is a new latch — a new `blownAtSec` — and the reducer
 * treats it as a new act.
 *
 * …OVER THE STRETCH THE CAP GOVERNS (rounds 2–3, verifier C2 then R1): a bounded
 * region, the carriageway from the mark to the next goal (`finish.ts
 * taskCapStretch` / `stepTaskCapStretch`), fixed at the blow on the student's
 * own approach axis. Past it, the sign and the weather are still graded by their
 * own codes; the task's number no longer is.
 *
 * IT STAMPS ONLY WHAT THE GLASS SHOWS AS A CEILING:
 *  · the ACTIVE objective of a DRIVING session — the strip's «задачата иска
 *    ≤N» and the banner's task line both drop the figure the moment the
 *    objective changes (`LessonPlayShell heldTaskCapKmh`);
 *  · never the halt band: a blow is a flow cap's by construction
 *    (`isFlowTaskCap`, the evaluator's `isFlowCap` line);
 *  · strictly UNDER the posted limit on this frame — at or above it the strip
 *    stays silent and the sign is the stricter ceiling, which SPEEDING_*
 *    already grades (`readSpeedContract`'s `binding`); a silent frame does not
 *    break the latch, it only places no stamp;
 *  · never on an EXAM rung: the advisor says nothing there, and an exam grades
 *    exactly the official sheet (A13).
 *
 * THE NUMBERS. `shownKmh` is `shownObjectiveCapKmh` (the figure the strip
 * reads its number out of), `capKmh` the objective's compiled gate, `graceKmh`
 * REACH_ZONE_CAP_SLACK_KMH (the objective's slack), `blownAtSec` the latch's
 * name (round 3). ROUND 15: the reducer bills above `shownKmh` plus the sign's
 * tolerance (`taskCapBillLineKmh`, founder ruling 2026-10-03 «LIKE A SPEED
 * SIGN») — the gate and its slack are the objective's crediting numbers and
 * bill nothing.
 *
 * ROUND 4 — ONLY THE NAMED STRETCH (founder ruling 2026-09-25). The stretch
 * fixed at the blow now also ends where the feature the task NAMES ends
 * (`taskCapFeatures.ts`: the bend's exit, the end of the ice, of a posted-limit
 * zone, the ring's edge — or, for a task that names nothing beyond its mark,
 * the capped zone's own edge). Past it the latch is SPENT, the stamp stops, and
 * `advisor.ts taskCapReleased` takes the figure off the strip and the banner in
 * the same frame, so the glass never shows a cap the sheet no longer grades.
 *
 * THE BREACH ROW. The first frame a latch actually stamps writes one
 * `TaskCapBreach` — the debrief's evidence that the drive broke a cap even when
 * the breach was too short to bill (round 3, R4). Round 4: so does the latch's
 * own first frame whenever the cap is graded there (under the sign), even if the
 * car is already past the end of its (now often short) stretch — a mark blown at
 * a graded cap is a broken cap, whether or not a stamped frame follows it.
 */
/** Where the car crossed a capped mark on this frame, and at what speed (round 15). */
interface MarkCrossing {
  /** The speed at the crossing point, interpolated between the last frame and this one (absolute, km/h). */
  kmh: number;
}

/** What the crossing reads off the frame before this one (`LessonSessionState.lastTick`). */
type CrossingFrame = { t: number; speedKmh: number; position: { x: number; y: number } };

/**
 * ROUND 15 — THE ARRIVAL IS DECIDED AT THE MARK (`sc-follow-tailgater:4b342eee`). Did the car cross this reachZone's
 * mark between the last frame and this one, and at what speed? The axis is the evaluator's own after this frame
 * (`objectives.ts reachZoneApproachAxis` — this runs before the evaluator steps), the crossing is
 * `reachZoneMarkCrossing`'s (short of the mark → at or past it, inside the disc), and the speed is interpolated
 * between the two frames' speeds at the fraction of the segment where the crossing happened: the speed the car had AT
 * the mark, which no single frame samples.
 */
function markCrossingOf(
  params: Extract<ObjectiveParams, { kind: "reachZone" }>,
  prevPos: { x: number; y: number } | null,
  approachFrom: { x: number; y: number } | null,
  last: CrossingFrame | undefined,
  tick: SimTick,
): { crossing: MarkCrossing | null; approachFrom: { x: number; y: number } | null } {
  const axis = reachZoneApproachAxis(params, prevPos, approachFrom, tick.position);
  if (last === undefined || !(last.t < tick.t)) return { crossing: null, approachFrom: axis.approachFrom };
  const f = reachZoneMarkCrossing(params, axis.approachFrom, last.position, tick.position);
  if (f === null) return { crossing: null, approachFrom: axis.approachFrom };
  const v0 = Math.abs(last.speedKmh);
  const v1 = Math.abs(tick.speedKmh);
  return { crossing: { kmh: v0 + f * (v1 - v0) }, approachFrom: axis.approachFrom };
}

/** How far past the mark `pos` is on the approach axis from `from` (+ = beyond it), or null with no axis. */
function alongMarkOf(mark: { x: number; y: number }, from: { x: number; y: number } | null, pos: { x: number; y: number }): number | null {
  if (from === null) return null;
  const ax = mark.x - from.x;
  const ay = mark.y - from.y;
  const m = Math.hypot(ax, ay);
  if (m < 1e-6) return null;
  return ((pos.x - mark.x) * ax + (pos.y - mark.y) * ay) / m;
}

/** A flow cap — above the halt band (`objectives.ts isFlowCap`): the only caps a mark can be blown at. */
function isFlowTaskCap(capKmh: number): boolean {
  return capKmh > REACH_ZONE_HALT_CAP_KMH;
}

/**
 * ROUND 15 — A CAPPED MARK CREDITED SHORT OF ITSELF IS STILL DECIDED WHERE THE CAR CROSSES IT
 * (`LessonSessionState.taskCapMarkWatch`). The evaluator completes a flow-capped objective up to `REACH_ZONE_GRACE_M`
 * short of the mark (`objectives.ts` „THE MARK IS WHERE THE BANNER POINTS"), or at rest anywhere on its approach side,
 * with the rung's ladder grace; the car then crosses the mark itself on a later frame, while the NEXT objective is
 * active. «Slow early, then speed up through the mark» is exactly that frame, so it is read: the crossing speed against
 * the glass figure plus the sign's tolerance, exactly as for the active objective's own mark. Nothing is stamped — the
 * objective is done and no stretch is graded after a mark the task has credited — only the arrival (and, where the glass
 * figure was under the sign, the breach row) is handed over.
 *
 * WHY NOT THE CREDITING FRAME (measured, then withdrawn in this round): billing the speed the objective was credited at
 * billed a CORRECT demonstration — `sc-sig-controller-live` shadow-correct, L1 and L2: credited 4,98 m short of the
 * «≤20» mark at 23,4 km/h while braking (L2: 22,3), and across the mark at about 12. The crossing is what the student did
 * AT the mark; the crediting frame is a point of the deceleration before it.
 */
function stepTaskCapMarkWatch(
  prev: LessonSessionState,
  tick: SimTick,
  last: CrossingFrame | undefined,
): { watch: TaskCapMarkWatch | undefined; arrival: TaskCapArrival | undefined; breach: TaskCapBreach | undefined } {
  const watch = prev.taskCapMarkWatch;
  const cleared = { watch: undefined, arrival: undefined, breach: undefined };
  if (watch === undefined) return cleared;
  const o = prev.objectives[watch.objectiveIndex];
  if (o === undefined || o.params.kind !== "reachZone" || watch.objectiveIndex === prev.currentObjectiveIndex) return cleared;
  const params = o.params;
  const capKmh = params.maxSpeedKmh;
  if (capKmh === undefined || !Number.isFinite(capKmh)) return cleared;
  // The axis is frozen at the completion: the evaluator no longer steps this objective.
  const { crossing } = markCrossingOf(params, null, watch.approachFrom, last, tick);
  if (crossing === null) {
    // Left the mark's neighbourhood without crossing it (backed away, turned off): nothing more to decide.
    const d = Math.hypot(tick.position.x - params.x, tick.position.y - params.y);
    return d > params.radiusM + REACH_ZONE_GRACE_M ? cleared : { watch, arrival: undefined, breach: undefined };
  }
  const shownKmh = shownObjectiveCapKmh(o.spec, capKmh, prev.lesson.postedLimitKmh);
  if (!(crossing.kmh > taskCapBillLineKmh(shownKmh, prev.rules.config))) return cleared;
  const arrival: TaskCapArrival = { capKmh, shownKmh, graceKmh: REACH_ZONE_CAP_SLACK_KMH, blownAtSec: tick.t, arrivalKmh: crossing.kmh };
  return { watch: undefined, arrival, breach: shownKmh < tick.maxSpeedKmh ? { objectiveId: o.spec.id, t: tick.t } : undefined };
}

/**
 * ROUND 15 — the watch a capped objective leaves behind when it completes SHORT of its mark: a flow cap, on a practice
 * rung, graded on a known approach axis, with the car still short of the mark (`along < 0`) on the completing frame. One
 * completed at or past its mark had its crossing read already — on this frame or an earlier one — by
 * `stepActiveTaskCapLatch`.
 */
function taskCapMarkWatchOnCompletion(
  prev: LessonSessionState,
  params: ObjectiveParams,
  evalState: ObjectiveEvalState,
  objectiveIndex: number,
  tick: SimTick,
): TaskCapMarkWatch | undefined {
  if (prev.lesson.examMode === true) return undefined;
  if (params.kind !== "reachZone" || params.maxSpeedKmh === undefined || !isFlowTaskCap(params.maxSpeedKmh)) return undefined;
  if (evalState.type !== "reachZone" || evalState.approachFrom === null) return undefined;
  const along = alongMarkOf(params, evalState.approachFrom, tick.position);
  if (along === null || !(along < 0)) return undefined;
  return { objectiveIndex, approachFrom: { x: evalState.approachFrom.x, y: evalState.approachFrom.y } };
}

/**
 * WHERE THE FULL STOP AT A `requireStopAtLine` LINE WAS MADE, ONE FRAME — in every chain state
 * (`LessonSessionState.stopLineWatch`, sc-merge-from-property:a401e4a7 round 3).
 *
 * For each gate that authors the key, whatever its status (pending, active, done): the approach axis is latched on the
 * ring-entry edge by the evaluator's own `reachZoneApproachAxis`, and the standstill is timed by the evaluator's own
 * `stepLineStandstill` — the gate's window (the disc, not past the paint, within `FULL_STOP_AT_LINE_M` of the mark),
 * the rule engine's speed and dwell. No second window and no second number: this is the function the gate's ✓ runs.
 *
 * `stoodAtLine` is the answer: a full stop was MADE in the window on this visit to the mark. It is set on the frame
 * the dwell is reached and it holds while the car stays in the mark's neighbourhood — the disc plus
 * `REACH_ZONE_GRACE_M`, the ring the axis is latched on — so that it is still there when the car crosses the paint
 * (a stop at the line followed by a creep over it is a stop at the line), and it is cleared when the car leaves that
 * ring, so that a second approach is judged on its own standstill and not on one made minutes earlier.
 *
 * The caller steps it only once the car is posed (`posedAtSec`): the scene's placeholder frames at the district
 * origin are not a stop anyone made.
 */
function stepStopLineWatch(prev: LessonSessionState, tick: SimTick): Record<number, StopLineWatch> | undefined {
  let next: Record<number, StopLineWatch> | undefined;
  for (let i = 0; i < prev.objectives.length; i++) {
    const p = prev.objectives[i].params;
    if (p.kind !== "reachZone" || p.requireStopAtLine !== true) continue;
    const w = prev.stopLineWatch?.[i];
    const here = { x: tick.position.x, y: tick.position.y };
    const approachFrom = reachZoneApproachAxis(p, w?.prevPos ?? null, w?.approachFrom ?? null, here).approachFrom;
    const rest = stepLineStandstill(p, approachFrom, tick, w?.lineRestSinceSec);
    const atTheMark = Math.hypot(here.x - p.x, here.y - p.y) <= p.radiusM + REACH_ZONE_GRACE_M;
    (next ??= {})[i] = {
      prevPos: here,
      approachFrom,
      ...(rest.restSinceSec !== undefined ? { lineRestSinceSec: rest.restSinceSec } : {}),
      stoodAtLine: atTheMark && (w?.stoodAtLine === true || rest.made),
    };
  }
  return next;
}

function stepTaskCapLatch(
  prev: LessonSessionState,
  tick: SimTick,
): {
  cap: TaskSpeedCap | undefined;
  latch: TaskCapLatch | undefined;
  breach: TaskCapBreach | undefined;
  arrival: TaskCapArrival | undefined;
  watch: TaskCapMarkWatch | undefined;
} {
  if (prev.lesson.examMode === true || prev.phase !== "driving") {
    return { cap: undefined, latch: undefined, breach: undefined, arrival: undefined, watch: undefined };
  }
  const last = prev.lastTick !== undefined && prev.lastTick.t < tick.t ? prev.lastTick : undefined;
  const watched = stepTaskCapMarkWatch(prev, tick, last);
  const active = stepActiveTaskCapLatch(prev, tick, last);
  // The frame's one arrival slot is the active mark's when both marks are crossed on the same frame (two capped marks
  // inside one frame's travel); otherwise the watched mark's arrival and breach row ride it.
  if (active.arrival !== undefined || watched.arrival === undefined) return { ...active, watch: watched.watch };
  return { ...active, arrival: watched.arrival, breach: active.breach ?? watched.breach, watch: watched.watch };
}

function stepActiveTaskCapLatch(
  prev: LessonSessionState,
  tick: SimTick,
  last: CrossingFrame | undefined,
): {
  cap: TaskSpeedCap | undefined;
  latch: TaskCapLatch | undefined;
  breach: TaskCapBreach | undefined;
  arrival: TaskCapArrival | undefined;
} {
  const none = { cap: undefined, latch: undefined, breach: undefined, arrival: undefined };
  const idx = prev.currentObjectiveIndex;
  const active = prev.objectives[idx];
  if (active === undefined || active.params.kind !== "reachZone") return none;
  const capKmh = active.params.maxSpeedKmh;
  if (capKmh === undefined || !Number.isFinite(capKmh)) return none;
  const st = prev.evalStates[idx];
  if (st === undefined || st.type !== "reachZone") return none;
  const shownKmh = shownObjectiveCapKmh(active.spec, capKmh, prev.lesson.postedLimitKmh);
  // ROUND 15 — THE BLOW IS THE CROSSING, OVER THE LINE (founder ruling 2026-10-03 «LIKE A SPEED SIGN»; see
  // `markCrossingOf`). Rounds 3–14 latched off the evaluator's `approachCap === "blown"`, and that verdict keeps an
  // «honoured» it earned anywhere on the approach — up to `REACH_ZONE_GRACE_M` behind the disc, i.e. 20 m short of the
  // mark on L1's radius 15 — so «slow early, then speed up through the mark» was never blown: eased to 39,6 at y = 180
  // on `sc-follow-tailgater` L1, +2,5 m/s², the mark passed at 53,6 over a line of 46, and no latch, no row, no bill.
  // The cap now asks only what the car did AT the mark: the crossing speed against the glass figure plus the sign's
  // tolerance. The approach verdict still credits the objective (its ladder grace untouched) and still re-arms a spent
  // latch (`rearmed` below); it no longer decides a bill.
  const flow = isFlowTaskCap(capKmh);
  const { crossing, approachFrom } = flow
    ? markCrossingOf(active.params, st.prevPos, st.approachFrom, last, tick)
    : { crossing: null, approachFrom: st.approachFrom };
  const blownNow = crossing !== null && crossing.kmh > taskCapBillLineKmh(shownKmh, prev.rules.config);
  const verdictBlown = st.approachCap === "blown";
  // ROUND 15 — RE-ARMED MEANS BACK ON THE APPROACH. A spent latch re-arms (and `advisor.ts taskCapReleased` puts the
  // figure back on the strip) only once the evaluator's verdict no longer reads „blown" AND the car is short of the mark
  // again on its axis — the only place from which it can cross the mark again. Through round 14 every latch came from
  // a „blown" verdict, which clears only on a fresh approach, so the verdict alone said it; a latch now also comes from a
  // crossing over the line on an approach the evaluator HONOURED (its verdict never „blown"), and the verdict alone would
  // re-arm it the frame its stretch is spent — the strip showing a cap the sheet no longer grades.
  const behindMark = (alongMarkOf(active.params, approachFrom, tick.position) ?? 0) < 0;
  let latch = prev.taskCapLatch !== undefined && prev.taskCapLatch.objectiveIndex === idx ? prev.taskCapLatch : undefined;
  if (latch !== undefined && latch.progress.spent) {
    if (!verdictBlown && behindMark && !latch.rearmed) latch = { ...latch, rearmed: true };
    // A spent cap crossed over the line AGAIN from a fresh approach: a new latch below.
    if (latch.rearmed && blownNow) latch = undefined;
  }
  // Round 4: where the feature the task names ends — absent is its own zone.
  // (Round 6: whatever it names, the blow at its mark is billed as the arrival.)
  const feature = taskCapFeatureFor(active.spec.id);
  let created = false;
  if (latch === undefined) {
    if (!blownNow) return none;
    const stretch = taskCapStretch(
      prev.objectives.map((o) => o.params),
      idx,
      approachFrom,
      feature?.end,
    );
    if (stretch === null) return none;
    latch = {
      objectiveIndex: idx,
      blownAtSec: tick.t,
      stretch,
      progress: TASK_CAP_STRETCH_START,
      stamped: false,
      rearmed: false,
    };
    created = true;
  }
  const graded = shownKmh < tick.maxSpeedKmh;
  /*
   * ROUND 5 — THE ARRIVAL (founder ruling 2026-09-26 «Bill the arrival»). On the
   * one frame a latch is created, graded under the sign here, the reducer is
   * handed the blow itself, so it can bill passing the mark over the cap as ONE
   * event whatever the stretch does next — including a zone swept faster than
   * itself, whose latch is spent on this very frame. ROUND 15: the speed is the
   * one AT THE MARK — interpolated between the two frames that straddle it
   * (`markCrossingOf`) — and the latch is created on the crossing frame itself.
   *
   * ROUND 6 — ON EVERY CAPPED OBJECTIVE (the integrator's reading of ruling 4,
   * binding: «every capped objective has a mark, so the arrival event applies
   * to every blown cap, not only the zone-default ones»). Round 5 handed the
   * reducer the arrival only where the task names nothing beyond its mark, and
   * the round-5 verifier measured what that left unbilled: `sc-acbi-deck`
   * («Стигни края на хлъзгавото…», an arrival by its own title),
   * `sc-ovb-patience`, `sc-lnom-round`, `sc-rbg-past-east` — named stretches
   * of 5–20 m, under the sustained code's 3 s at any realistic speed — and
   * `sc-prs-row` at the demo mistake's 50 km/h (43 m in 2.95 s). A named
   * feature (`taskCapFeatures.ts`) now bounds the stretch the latch stamps and
   * nothing else: the blow at its mark is the same arrival, and a sustained
   * over-cap stretch along the feature after it is the SAME act (the reducer's
   * `taskArrival` keeps the act with this latch), so it adds at most the act's
   * one charge and never a second first bill.
   */
  /*
   * ROUND 7 — AND AT A CAP THE GLASS SHOWS AT OR ABOVE THE SIGN TOO (round-6
   * verifier R2; the integrator's reading of ruling 4, binding for round 7:
   * «the arrival is billed at EVERY blown cap mark, INCLUDING caps at or above
   * the sign»). Round 6 handed over only a GRADED blow (the glass cap under the
   * sign), and the verifier measured what that left: 192 blown caps per profile
   * of its arrival census, 18 of which billed nothing of any speed code while
   * CLEAN_DRIVING was minted at the blow — the motorway «≤140» passed at 145.2,
   * the works zone's glass «≤33» on a posted 30 passed at 38.2. Every blow is
   * handed over now; the reducer tells the two apart on the same frame
   * (`shownKmh` against the sign) and bills a sign-bound one as ONE act with the
   * speeding the car is in (`rules/engine.ts` „THE SIGN-BOUND ARRIVAL"). The
   * stamp and the breach row still bind only under the sign, as since round 2.
   */
  const arrival: TaskCapArrival | undefined =
    created && crossing !== null
      ? {
          capKmh,
          shownKmh,
          graceKmh: REACH_ZONE_CAP_SLACK_KMH,
          blownAtSec: latch.blownAtSec,
          arrivalKmh: crossing.kmh,
        }
      : undefined;
  if (latch.progress.spent) return { cap: undefined, latch, breach: undefined, arrival: undefined };
  const step = stepTaskCapStretch(latch.stretch, latch.progress, tick.position);
  if (step.progress !== latch.progress) latch = { ...latch, progress: step.progress };
  if (!step.inside || !graded) {
    // Round 4: the latch's first frame, graded here, but already past the end
    // of its stretch (a short zone swept in one frame) — the breach is still a
    // breach and is recorded; nothing is stamped.
    if (!latch.stamped && graded && latch.blownAtSec === tick.t) {
      return {
        cap: undefined,
        latch: { ...latch, stamped: true },
        breach: { objectiveId: active.spec.id, t: tick.t },
        arrival,
      };
    }
    return { cap: undefined, latch, breach: undefined, arrival };
  }
  const cap: TaskSpeedCap = { capKmh, shownKmh, graceKmh: REACH_ZONE_CAP_SLACK_KMH, blownAtSec: latch.blownAtSec };
  if (latch.stamped) return { cap, latch, breach: undefined, arrival };
  return { cap, latch: { ...latch, stamped: true }, breach: { objectiveId: active.spec.id, t: tick.t }, arrival };
}

/**
 * THE TWO SILENCES (doc 86 B4/B5/B6 — founder, 2026-07-30).
 *
 * Two objective states used to produce NOTHING on screen, and both read to the
 * student as a broken simulator rather than as feedback:
 *
 *  1. «Another Major error I am stopping on top of the green cyrcle and
 *     nothing happens.» He was on the mark. The objective carried an
 *     unpublished arrival speed cap and he was over it, so the gate stayed
 *     shut and said nothing. 178 waypoints across 137 templates carry one.
 *  2. An unsignalled roundabout exit voided the traversal invisibly: the ring
 *     drill simply stopped responding, with no way to know a rule had been
 *     applied, let alone which.
 *
 * Both now speak, once each, at the moment they happen. THEO-4: never a bare
 * verdict — each card says what the simulator observed, what the task wants
 * instead, and what to do about it; the roundabout one cites the article the
 * catalog cites for the same duty (ADR-002: retrieved, never free-recalled).
 * Neither touches scoring: these are `lesson` toasts, the coach's channel for
 * things that are taught and not billed.
 */
/**
 * WHAT HAPPENED, for each journey demand that can withhold a tick whatever the speed (round 15 —
 * `objectives.ts reachZoneJourneyRefusal`). Each clause completes «по-рано в този урок …» and is TRUE BY THE FACT THE
 * ARM READS — the context flag is set only by the code named here (`applyTick` builds them from the scored events and
 * the coached rows), so the sentence states exactly what the rule engine reported and nothing it did not:
 *   noContact / haltForVru / vruUntouched — `COLLISION` (any body; a pedestrian or cyclist for the two person arms);
 *   railClear — `RAIL_CROSSING_VIOLATION` «entered-barred»; restClean — `ILLEGAL_STOP_IN_BAN_ZONE` or the
 *   «stopped-on-track» rail act; yieldClean — `FAILED_TO_YIELD` / `EMERGENCY_NOT_YIELDED` / `PEDESTRIAN_NOT_YIELDED`;
 *   solidLineClean — `CROSSED_SOLID_LINE`; stopSignRoll — `STOP_SIGN_NO_FULL_STOP`; speedClean — the two SPEEDING_*
 *   codes or `SPEED_TOO_FAST_FOR_CONDITIONS`; brakingClean — `STOPPED_WITHOUT_CAUSE` or `HARSH_BRAKING_NO_CAUSE`;
 *   greenStartClean — `HESITATION_AT_GREEN`.
 */
const JOURNEY_REFUSAL_BG: Record<
  ReachZoneJourneyRefusal,
  (ctx: ObjectiveContext, params: Extract<ObjectiveParams, { kind: "reachZone" }>) => string
> = {
  vruUntouched: () => "колата удари човек на пътя",
  noContact: () => "колата участва в удар",
  railClear: () => "колата влезе в прелеза, докато той беше затворен",
  yieldClean: () => "не пропусна участник в движението, на когото дължеше предимство",
  haltForVru: () => "колата удари човек на пътя",
  restClean: (_ctx, params) =>
    params.requireRestClean === "banZone" ? "колата спря в зона, в която спирането е забранено" : "колата спря върху прелеза",
  solidLineClean: () => "колата пресече непрекъсната линия",
  stopSignRoll: () => "колата не спря напълно на знак Б2 „Спри!“",
  speedClean: () => "скоростта беше над позволената от знака или от условията",
  brakingClean: (ctx) =>
    ctx.stoppedWithoutCauseInRun === true ? "колата спря без причина на открит път" : "колата спря рязко без причина",
  greenStartClean: () => "колата се забави да потегли на зелено",
};

function objectiveNotice(
  spec: LessonObjective,
  params: ObjectiveParams,
  before: ObjectiveEvalState,
  after: ObjectiveEvalState,
  tick: SimTick,
  postedLimitKmh: number | undefined,
  ctx: ObjectiveContext,
): HudEvent | null {
  if (
    params.kind === "reachZone" &&
    after.type === "reachZone" &&
    (before.type !== "reachZone" || !before.overCapNoted) &&
    after.overCapNoted &&
    params.maxSpeedKmh !== undefined
  ) {
    // THE NUMBER THE STUDENT WAS SHOWN, not the one the ladder compiled. This
    // card used to print `params.maxSpeedKmh` raw, and on a rung with grace
    // that is a SECOND figure for one task: sc-ac-crosswind pc-right/04-t084s
    // carries the toast «дръж под 40 км/ч» and this card's «не повече от 45
    // км/ч» in the same 200 px band. `shownObjectiveCapKmh` is the advisor's
    // own `spokenCapKmh`, so the two surfaces cannot diverge again, and its
    // closing `Math.min` keeps the spoken figure at or under the gate — the
    // card can only ever be stricter than the grader, never looser.
    const shownCapKmh = shownObjectiveCapKmh(spec, params.maxSpeedKmh, postedLimitKmh);
    // Round 14: printed so that «не повече от N …, а стигна дотук с M» holds between the printed N and M (`speedBeyondTxt`).
    const measuredTxt = speedBeyondTxt(Math.abs(tick.speedKmh), shownCapKmh, "over");
    // ── WHICH FRAME IS THIS? — the half the tense fix cannot skip ───────────
    //
    // `overCapNoted` latches on the first frame that is `!done && inAcceptance
    // && speedKmh > cap` (objectives.ts), and THAT IS NOT ALWAYS THE ARRIVAL.
    // On a zone whose contract also demands a cockpit STATE at the mark, a
    // student can enter UNDER the cap with the state unmet — no latch, because
    // `done` is false on the unmet demand and the speed is legal — and then go
    // over the cap while still inside the disc. The latch fires there, and an
    // unconditional «стигна дотук с M км/ч» would then be a claim about an
    // arrival that happened at a different speed. The aorist would have stopped
    // rotting and started lying, which is the worse of the two.
    //
    // NOT A HYPOTHETICAL, AND NOT LATENT — MEASURED ON THIS TREE, 2026-08-25.
    // A sweep of all 167 templates × rungs finds 953 capped `reachZone` gates,
    // and 29 of them ALREADY carry an at-mark demand alongside the cap:
    //   sc-ac-night-lights/sc-acn-lit   ×5  lamps=lit   (cap 50)
    //   sc-ac-rain-lights/sc-acr-lit    ×4  lamps=lit   (cap 47→42)
    //   sc-ac-highbeam-lead/sc-ahl-follow ×5 lamps=low  (cap 50→45)
    //   sc-ac-fog/sc-acf-adapted        ×5  lamps=fog   (cap 35→30)
    //   sc-ac-snow/sc-acs-approach      ×5  lamps=low   (cap 30→25)
    //   sc-park-bay-exit-rev/sc-pbe-out ×5  gear=reverse (cap 8)
    // A grep for an AUTHORED `requireLamps:` finds none and reads clean — the
    // demand is DERIVED FROM THE BANNER (`objectives.ts deriveLampDemand` /
    // `deriveGearDemand`, „the gate measures what the banner promises"), so it
    // arrives without anybody authoring a key. And the branch is not a corner
    // of those 29: it is their MISTAKE LANE. «Мини контролната зона осветен»
    // fires this card exactly when the student drives it unlit, which is the
    // drive the lesson exists to teach.
    //
    // THE DISCRIMINATOR IS FREE. `inAcceptance ⟹ sweptAcceptance ⟹ reached`
    // on one frame, so on the latch frame `after.reached` is always true and
    // `before.reached` is false EXACTLY on the frame the car first arrived.
    // No new state, no new field in `ObjectiveEvalState` (which this lane may
    // not extend anyway — see `ReachZoneWitnessDemands`).
    const arrivedOnThisFrame = before.type !== "reachZone" || !before.reached;
    // Both forms are aorist, both print the MEASURED number (THEO-4: what was
    // observed, what is wanted, what to do — never a bare verdict), and both
    // leave «тази скорост» two clauses down resolving to it.
    const measuredBg = arrivedOnThisFrame
      ? `а стигна дотук с ${measuredTxt}`
      : `а върху точката вдигна скоростта до ${measuredTxt}`;
    // ── AND THE ADVICE HAS TO MATCH THE GRADER (round 11, 2026-08-26) ────────
    //
    // «Намали СЕГА, докато си върху точката» is true only while the approach
    // can still be saved. Since `objectives.ts approachBlown` it cannot always
    // be: a car more than REACH_ZONE_CAP_SLACK_KMH over its own cap AT the
    // authored disc has thrown the approach away, and braking beside the mark
    // afterwards no longer re-issues the certificate — that re-earn was exactly
    // the hole that handed «Приближи камиона и пътеката с готовност за спиране»
    // to a drive convicted of «Твърде бързо приближаване към пешеходна пътека»
    // in the same protocol.
    //
    // So the card reads the same bit the grader reads and says the true thing
    // in each case (THEO-4: what was observed, what is wanted, what to do —
    // never a bare verdict, and never an instruction that will not work). What
    // it deliberately does NOT say is „turn round and come again": on the
    // motorway rungs that would be advice to commit an offence. The corrective
    // it gives is the one the lesson actually teaches — brake EARLIER, before
    // the mark.
    //
    // ── …AND „ДОКАТО СИ ВЪРХУ ТОЧКАТА" HAS TO BE TRUE OF THIS FRAME ─────────
    // (round 12, 2026-08-27.)
    //
    // `approachCap` is not the only way the mark ends up behind the car.
    // `objectives.ts overCapNoted` now latches on the SWEPT face as well — the
    // block of that name carries the census: at 0.5 s per tick, 71 of 1,720
    // catalogue gates are narrower than one 50 км/ч tick, and the motorway
    // rungs (`sc-mwms-join`/`-hold`, radius 6 against 18–19 m of travel per
    // tick) are usually crossed with NO sample inside the disc at all. Until
    // that widening the fast drive was refused in silence; with it, the card
    // can now be composed on a frame whose own position is already past the
    // paint, and «Намали СЕГА, докато си върху точката» would then be an
    // instruction that cannot work — the second half of THEO-4, and the one
    // this card's own comment already holds itself to.
    //
    // So the corrective is chosen from WHERE THE CAR IS on the frame the card
    // is written, measured against the same acceptance the evaluator uses (the
    // authored disc plus REACH_ZONE_GRACE_M of approach-side capsule — the
    // region in which `atMark` is still true and switching or braking still
    // re-earns the contract). Outside it there is nothing left to save, which
    // is the same sentence `blownApproach` says for the other reason.
    const distToMarkM = Math.hypot(
      tick.position.x - params.x,
      tick.position.y - params.y,
    );
    const stillAtTheMark = distToMarkM <= params.radiusM + REACH_ZONE_GRACE_M;
    const blownApproach = after.approachCap === "blown";
    // ── …AND «ЗАТОВА» HAS TO BE THE REASON (round 15 of the task cap, `sc-follow-tailgater:5a56612e`) ──────────
    //
    // The save-tail says the SPEED is why the tick is withheld («затова още не се отчита») and that slowing down
    // on the mark earns it («Намали СЕГА»). On a gate whose arrival also carries a JOURNEY demand that has already
    // refused (`objectives.ts reachZoneJourneyRefusal` — the eleven arms of `arrivalHonoured` outside the `capMet`
    // latch, every one session-monotone), both halves are false: the photographed pc wrong leg of
    // `sc-follow-tailgater` (`w72-cap-pc/…/04-t042s.png`) read «…вдигна скоростта до 41 км/ч — затова още не се
    // отчита. Намали СЕГА…» on a drive whose dead stop on the open road (`requireBrakingClean`) had already made the
    // task unreachable at ANY speed. So on that frame the card names the reason that holds, says that slowing down
    // cannot change it, and gives no remedy — the true thing, never an instruction that will not work (THEO-4).
    // Only the save-tail is replaced: the other tail already promises nothing.
    const journeyRefusal = reachZoneJourneyRefusal(params, ctx);
    const tailBg =
      blownApproach || !stillAtTheMark
        ? "— това е над допустимото и задачата остава неизпълнена. Намаляване след маркера вече не се отчита: измерва се самото приближаване, а то вече се случи с тази скорост. Намалявай по-рано — още преди маркера. Урокът продължава и разборът показва задачата накрая."
        : journeyRefusal !== null
          ? `— но задачата няма да се отчете и при по-ниска скорост: по-рано в този урок ${JOURNEY_REFUSAL_BG[journeyRefusal](ctx, params)}, а тя се отчита само ако това не се е случило. Затова намаляването сега не може да я отчете. Урокът продължава и разборът показва задачата накрая.`
          : "— затова още не се отчита. Намали СЕГА, докато си върху точката. Ако я подминеш с тази скорост, задачата остава неизпълнена, но урокът продължава и разборът я показва накрая.";
    // ── AND IF THE SPEED IS NOT THE ONLY THING MISSING, SAY SO HERE ─────────
    // (sc-vp-police-stop:ab262758, with the `requireKerbwardM` demand.)
    //
    // «Намали СЕГА, докато си върху точката» promises the tick on the next
    // frame, and on a gate that also demands a lateral pose that promise is
    // false: the student obeys the card, comes to rest mid-lane, and NOTHING
    // HAPPENS — which is the founder's own B4 sentence at the head of this
    // function, re-created by the very demand meant to teach him. The card
    // below the cap branch cannot cover it either: it fires on the ARRIVAL
    // frame under the cap, and this student arrived over it, so by the time he
    // is stopped `before.reached` is long true. One clause here closes the gap
    // with no new eval state.
    const alsoKerbward =
      reachZoneStateRefusal(params, tick)?.kind === "kerbward" && stillAtTheMark && !blownApproach
        ? " И още нещо: колата стои към средата на лентата, а задачата иска да си притиснат до десния ѝ край — отдръпни се надясно, докато намаляваш."
        : "";
    return {
      kind: "lesson",
      titleBg: "Стигна точката, но твърде бързо",
      // Accurate about the mechanism, deliberately: slowing down WHILE still
      // on the mark completes it, slowing down after passing it does not (see
      // REACH_ZONE_GRACE_M — the grace reaches back toward the driver, never
      // forward past the mark, because on a stop drill the overshoot is the
      // graded failure). Telling him otherwise would be its own falsehood.
      //
      // ── AND THE SPEED IS REPORTED IN THE TENSE IT WAS MEASURED IN ────────
      //
      // This sentence used to read «а в момента караш M км/ч» — the present
      // tense, about a number sampled ONCE, on the rising edge of
      // `overCapNoted`, and then frozen for as long as the card lives (a
      // `lesson` toast, up to the 8 s teaching TTL).
      //
      // The card's own next clause is «Намали СЕГА». So the instruction and
      // the claim were pointed at each other: a student who obeyed the card
      // made the card false, and the faster he obeyed the more false it got.
      // TWO FRAMES, ONE MECHANISM, and the second is the re-drive of the
      // first, so this is not a one-off sample:
      //   · `.audit-frames/w10-1/frames/sc-merge-from-property/mobile-right/
      //     05-stopped.png` — card «…а в момента караш 16 км/ч», cluster
      //     directly below it «0 км/ч D»;
      //   · `.audit-frames/w10-3/frames/sc-merge-from-property/pc-right/
      //     05-stopped.png` — the same lesson re-driven, «…караш 8 км/ч» over
      //     the same «0 км/ч D» (cropped 4× from x660-920 / y545-655).
      // The number moved between the two drives; the contradiction did not.
      //
      // NOT FIXED BY RE-SAMPLING. A live figure would need this composed
      // string to be recomputed per tick, and it is not — `objectiveNotice`
      // returns one HudEvent at one instant and the toast column owns it from
      // there. `hud/HudToasts.tsx` already took the half that IS the column's
      // (it prints the card's age, so the claim is dated on the glass) and
      // named this file as the owner of the other half. This is that half:
      // the aorist cannot rot, because the arrival already happened. It also
      // agrees with the card's own title, which was ALREADY past tense —
      // «Стигна точката, но твърде бързо» — so the two halves of one card
      // stop disagreeing about when they are.
      //
      // WHICH aorist is decided one screen up: an unconditional „стигна дотук"
      // is false on the 29 gates whose latch frame is not the arrival frame,
      // and trading a stale claim for a wrong one is not a repair.
      //
      // «тази скорост» two clauses down still resolves in both forms: it is
      // the speed the card just printed, which is the speed that would carry
      // him past the mark if he keeps it.
      explanationBg: `Задачата иска да си тук с не повече от ${shownCapKmh} км/ч, ${measuredBg} ${tailBg}${alsoKerbward}`,
      // ── THE ONE LINE THE PHONE CARD CAN FINISH (sc-merge-from-property:
      //    6715b581 — `HudEvent`'s `lesson` member carries the frame) ─────────
      //
      // The paragraph above is 200–400 characters and its title wraps to two
      // lines at the compact card's width, so the peek's floor window has room
      // for exactly ONE body line under it. Row 2b used to print the head of
      // the paragraph there — «Задачата иска да си тук с не повече от» — and
      // stop, with the reason and the instruction both behind «ЗАЩО».
      //
      // ONE STRING FOR SIX PARAGRAPHS, so it had to be true of all of them:
      // arrived fast / sped up on the mark (`measuredBg`) × still on the mark /
      // mark behind or approach blown (`tailBg`), and on the first tail with or
      // without the kerbward clause (it only rides that one). What
      // they share is the MECHANISM the founder's «стоя върху точката и нищо
      // не става» was about: reaching the mark is not the whole task, the speed
      // at it is read too. What they do NOT share is the corrective — «Намали
      // СЕГА» is right on one tail and useless on the other — so the line
      // carries no instruction; the tail that is true of this frame is one tap
      // away. No figure (the cap is in the paragraph and on the strip), no
      // article, no verdict word.
      peekBg: "Отчита се и скоростта.",
    };
  }
  // ── AND WHEN THE STANDSTILL IS THE CRASH'S, SAY SO (w29, 2026-09-08 —
  //    `objectives.ts haltVoided` carries the mechanism) ─────────────────────
  //
  // `haltVoided` is the first refusal in this evaluator that can withdraw a
  // tick a student USED TO GET, so it is the one that owes him a sentence. Doc
  // 64 THEO-4, ratified: never a bare withheld tick — what was observed, what
  // the task wants, what to do instead. Without this card the student sees a
  // car standing exactly on the green circle and a task that simply never
  // ticks, which is the founder's own «стоя върху точката и нищо не става» in
  // its worst form: the one where he is right that he is stopped.
  //
  // ONE CARD, ON THE LATCHING FRAME, AND THE LATCH IS THE STATE — no new
  // bookkeeping: `haltVoided` is undefined before and set after, exactly once
  // per approach, and a genuine fresh approach clears it, so a student who
  // drives off the wreck and crashes into it again is told again. That is the
  // shape the cap card has had since round 12 and it is deliberate.
  //
  // AFTER THE CAP CARD, so that on a frame where both could fire the student is
  // told the fault that also has a grader before the consequence of it. In
  // practice they cannot share a frame: `overCapNoted` needs `speedKmh > cap`
  // and this needs the car motionless.
  if (
    params.kind === "reachZone" &&
    after.type === "reachZone" &&
    after.haltVoided !== undefined &&
    (before.type !== "reachZone" || before.haltVoided === undefined)
  ) {
    // NO «върни се и опитай пак», for the cap card's own reason: this composer
    // cannot know whether the road behind the student allows it, and an
    // instruction that cannot be followed is the second half of THEO-4. The
    // corrective is the one the lesson actually teaches — brake earlier and
    // harder, in your own lane, instead of steering round.
    return {
      kind: "lesson",
      titleBg: "Колата спря от удара, а не от спирачката",
      explanationBg:
        "Колата стои неподвижно на маркера, защото удари това пред себе си — а задачата иска ТИ да я спреш там. Ударът не се брои за спиране: точката се дава за спиране със спирачката, преди препятствието и в своята лента. Затова задачата остава неизпълнена, въпреки че колата стои на място. Спирай по-рано и по-твърдо — спирането право в своята лента е по-безопасно от завиването встрани.",
      // The phone card's one line (see the cap card above for the window). The
      // title already says the crash was not a stop, so the line is the ACT
      // the paragraph closes on, not a second telling of the verdict.
      peekBg: "Спирай по-рано и твърдо.",
    };
  }
  // ── A FULL STOP SHORT OF THE LINE DID NOT COUNT, AND THE STUDENT IS TOLD SO
  //    (sc-merge-from-property:64fd365e — `objectives.ts FULL_STOP_AT_LINE_M`
  //    carries the founder ruling and the frame) ─────────────────────────────
  //
  // `requireStopAtLine` withdraws a tick the capsule used to hand out — a full
  // stop up to ~6.5 m short of the line — so it owes the sentence THEO-4
  // demands: what was observed (a full stop, and how far back), what the task
  // wants (the stop AT the line) and what to do (make it again there). Without
  // it the student sits motionless on the green and nothing ticks, the
  // founder's «стоя върху точката и нищо не става» in exactly the form he
  // meant it.
  //
  // ONE CARD, ON THE LATCHING FRAME, AND THE LATCH IS THE STATE: `shortStopM`
  // is written once, on the frame that short standstill becomes a full stop
  // the rule engine agrees is one. The figure is the car centre's distance
  // behind the mark, the frame the ruling is measured in.
  //
  // EVERY SENTENCE STAYS TRUE FOR THE CARD'S WHOLE LIFE. «това спиране не
  // отчита задачата» is about the stop already made, so a student who obeys
  // the card and earns the tick at the line does not make it false; nothing
  // here says the task is STILL open. And it is skipped when a journey demand
  // has already refused the task (`reachZoneJourneyRefusal`), because then a
  // stop at the line cannot earn it either and the advice would not work.
  if (
    params.kind === "reachZone" &&
    after.type === "reachZone" &&
    after.shortStopM !== undefined &&
    (before.type !== "reachZone" || before.shortStopM === undefined) &&
    reachZoneJourneyRefusal(params, ctx) === null
  ) {
    return {
      kind: "lesson",
      titleBg: "Спря, но преди линията",
      explanationBg: `Задачата иска пълното спиране да е ДО самата линия, а колата спря напълно на ${after.shortStopM.toFixed(1)} м преди мястото на спирането — затова това спиране не отчита задачата. Спреш ли по-рано — за пешеходец или зад друга кола — спирането по знака се прави още веднъж: стигни бавно до линията и спри там докрай, с неподвижни колела.`,
      // The phone card's one line: the act the paragraph closes on.
      peekBg: "Спри пак — до линията.",
    };
  }
  // ── THE OTHER HALF OF THE ARRIVAL CONTRACT FINALLY SPEAKS (round 12,
  //    2026-08-27 — `objectives.ts reachZoneStateRefusal` carries the census,
  //    the frame and the year the silence lasted) ─────────────────────────────
  //
  // The cap branch above is the only card this composer had, and it is gated on
  // `speedKmh > cap`. The lamp and gear demands are refused independently of
  // speed, so the drive those 29 gates exist to teach — arriving LAWFULLY with
  // the switch unmoved — reached the mark, was refused, and was told nothing by
  // this file or by the rule engine (the demand's own docblock records
  // `HEADLIGHTS_OFF_AT_NIGHT` firing zero times on the same drive). A task that
  // silently never ticks is the bare verdict doc 64 THEO-4 forbids.
  //
  // ONE CARD, ON THE ARRIVAL FRAME, AND NO NEW STATE. `before.reached` is false
  // exactly once per run — the same discriminator the aorist above uses, and
  // `ObjectiveEvalState.reachZone` belongs to lessons/types.ts, so a fresh latch
  // field is not this lane's to add. `!after.capMet` keeps the card off a gate
  // that is being granted: on the arrival frame with the state unmet the latch
  // is spent (`lampSpent`/`gearSpent` in `stepReachZone`), so the certificate is
  // genuinely withheld whenever this fires.
  //
  // MUTUALLY EXCLUSIVE WITH THE CAP CARD BY CONSTRUCTION, so the student never
  // gets two explanations of one refusal and never the wrong one of the two:
  // the branch above needs `speedKmh > cap`, this one needs the speed to be
  // within the cap (or the gate to carry none). A drive that is BOTH too fast
  // and unlit is told about the speed first, which is the fault that also has a
  // grader; the lamps are still there to be reported on the next approach.
  if (
    params.kind === "reachZone" &&
    after.type === "reachZone" &&
    (before.type !== "reachZone" || !before.reached) &&
    after.reached &&
    !after.capMet &&
    (params.maxSpeedKmh === undefined || Math.abs(tick.speedKmh) <= params.maxSpeedKmh)
  ) {
    const refusal = reachZoneStateRefusal(params, tick);
    if (refusal !== null) {
      // The same „is there anything left to save" test the cap tail uses, and
      // for the same reason: `contractEarned` needs `atMark`, so flicking the
      // switch earns the tick on the next frame WHILE the car is on the mark or
      // in the approach capsule, and does nothing at all once it is past.
      const dM = Math.hypot(tick.position.x - params.x, tick.position.y - params.y);
      const stillAtTheMark = dM <= params.radiusM + REACH_ZONE_GRACE_M;
      if (refusal.kind === "lamps") {
        // What the banner promised, in the words the cockpit uses for the
        // switch the student has to find (СВЕТЛ / МЪГЛА on the touch flank,
        // KeyL on the desktop). «fog» is the чл. 74 pairing — an ADDITION to
        // the dipped beams, never a substitute — so it asks for both by name.
        const wantedBg =
          refusal.demand === "fog"
            ? "с фарове за мъгла ЗАЕДНО с късите светлини"
            : refusal.demand === "high"
              ? "с ДЪЛГИ светлини"
              : refusal.demand === "low"
                ? "с КЪСИ светлини"
                : "ОСВЕТЕН — с включени светлини";
        // WHAT IS ACTUALLY ON, read off the same field the grader reads —
        // never a blanket «телтейлът е тъмен». `lampDemandMet` refuses the
        // WRONG beam as well as no beam (demand "low" against `headlights:
        // "high"` is a refusal on a car whose lamps are plainly lit), so a
        // fixed „your lights are off" clause would be a false statement about
        // the cockpit on exactly the drive sc-ac-highbeam-lead is about. THEO-4
        // asks for the observation before the instruction; a wrong observation
        // is worse than none.
        const nowBg =
          tick.headlights === "high"
            ? "сега светят ДЪЛГИТЕ"
            : tick.headlights === "low"
              ? "сега светят само късите"
              : "фаровете са изгасени";
        const observedBg =
          refusal.demand === "fog" && tick.headlights !== "off"
            ? "а фаровете за мъгла са изключени"
            : `а ${nowBg}`;
        return {
          kind: "lesson",
          titleBg: "Стигна точката, но без светлините, които задачата иска",
          explanationBg:
            `Задачата иска да минеш тук ${wantedBg}, ${observedBg}. ` +
            (stillAtTheMark
              ? "Нагласи ги СЕГА, докато си върху точката — задачата се отчита на следващия кадър. Ако я подминеш така, остава неизпълнена, но урокът продължава и разборът я показва накрая."
              : "Подмина точката така, затова задачата остава неизпълнена: светлините се нагласят ПРЕДИ участъка, не в него. Урокът продължава и разборът показва задачата накрая."),
          // The cap card's line, for the lamps: true of all four demands and
          // both tails («Нагласи ги СЕГА» / «ПРЕДИ участъка»), which is why it
          // names the mechanism and not either corrective. ⚠ This title is
          // THREE lines at the compact width, so even one body line is below
          // the peek's 44 px floor here — the line still shortens what «ЗАЩО ↓N»
          // hides, but it is not whole on the glass until the title is shorter.
          peekBg: "Отчитат се и светлините.",
          lawRef: refusal.demand === "fog" ? "ЗДвП чл. 74" : "ЗДвП чл. 70",
        };
      }
      if (refusal.kind === "kerbward") {
        // «ПЛЪТНО ВДЯСНО» — the arm that had to land with the demand, not after
        // it (sc-vp-police-stop:ab262758). Without it the new lateral gate is a
        // SILENT refusal, and the founder's own B4/B5 complaint at the head of
        // this function is exactly that shape: «I am stopping on top of the
        // green cyrcle and nothing happens». The marker is still drawn as the
        // full disc (scene/guidanceRoute.ts knows nothing about this term), so
        // a student who halts on its left half is standing on green paint with
        // no tick — this card is what makes that legible.
        //
        // WHAT IS OBSERVED, in the tick's own signed convention: + is LEFT of
        // travel, so a car short of the demand is somewhere between the lane
        // centre and the kerb-side band the task wants. The number is not
        // printed: `laneOffsetM` is measured on a carriageway whose lanes are
        // PERCEPTUAL_ROAD_SCALE times wider than a real one, so a figure in
        // metres would teach a distance the road does not have.
        return {
          kind: "lesson",
          titleBg: "Спря, но не плътно вдясно",
          explanationBg:
            "Задачата иска колата да е ПРИТИСНАТА към десния край на лентата, а сега стои към средата ѝ. " +
            (stillAtTheMark
              ? "Отдръпни се още надясно, докато си на точката — задачата се отчита на следващия кадър. Спряла кола насред платното изненадва движещия се зад теб и е предпоставка за удар отзад."
              : "Мястото е вече зад теб, затова задачата остава неизпълнена: към десния край се отдръпва ПРЕДИ спирането, не след него. Урокът продължава и разборът показва задачата накрая."),
          // The REASON both tails rest on, as a general truth rather than a
          // claim about this frame: on the second tail the car may already be
          // rolling on, so «you are blocking» would be a present tense that
          // stopped being true. Seconds and metres stay out (see `laneOffsetM`
          // above for why a figure here would teach a road that is not there).
          peekBg: "Средата е за движението.",
        };
      }
      return {
        kind: "lesson",
        titleBg: "Стигна точката на преден ход",
        explanationBg:
          "Задачата иска това място да се мине НА ЗАДЕН ХОД, а лостът е на преден. " +
          (stillAtTheMark
            ? "Включи R и мини мястото назад — задачата се отчита, когато колата наистина се движи на заден ход. Урокът продължава и разборът я показва накрая."
            : "Мястото е вече зад теб, затова задачата остава неизпълнена. Заден ход се включва ПРЕДИ маневрата, не след нея. Урокът продължава и разборът показва задачата накрая."),
        lawRef: "ЗДвП чл. 40",
        // What the task IS, which both tails agree on; when to engage R is the
        // part they disagree about, so it stays in the paragraph.
        peekBg: "Мястото се минава назад.",
      };
    }
  }
  // ── AND THE SPEED CONTRACT'S OTHER EDGE FINALLY SPEAKS TOO ────────────────
  //    (sc-ac-night-overdrive:b9d61410, critical — the floor's own design note
  //    is on `objectives.ts ReachZoneWitnessDemands.minSpeedKmh`.)
  //
  // THE FRAME. «✓ Мини неосветения участък със съобразена за видимостта
  // скорост 2:45» on a drive that never exceeded 15 км/ч. The gate now carries
  // a floor, so that drive is refused — and THIS CARD IS WHY THE REFUSAL IS
  // ALLOWED TO EXIST. The floor's docblock names it as edit 1 of 2 and forbids
  // authoring the number before it: without a card, a floor refusal is SILENT
  // (the cap card above is gated on `speedKmh > cap`, and the state card
  // branches on `reachZoneStateRefusal(...).kind === "lamps"` and would tell a
  // crawling student his lever was in D). A task that silently never ticks is
  // the bare verdict doc 64 THEO-4 forbids — it would swap a false ✓ for a
  // false nothing, which is not a repair.
  //
  // MUTUALLY EXCLUSIVE WITH BOTH CARDS ABOVE BY CONSTRUCTION. The cap card
  // needs `speedKmh > cap` and `parseSpeedFloor` refuses a band under
  // REACH_ZONE_CAP_SLACK_KMH, so a frame cannot be under the floor and over the
  // ceiling at once; the state card returns before this one whenever it has a
  // refusal to report, which is the same ordering the cap card's own comment
  // argues for — the fault that ALSO has a grader is reported first, and a
  // crawl has no grader at all (`DRIVING_TOO_SLOW_FOR_MOTORWAY` cannot fire on
  // an extra-urban 1+1).
  //
  // ON THE ARRIVAL FRAME AND NO NEW STATE: `before.reached` is false exactly
  // once per run, the same discriminator the two cards above use, and
  // `ObjectiveEvalState.reachZone` is not extended.
  if (
    params.kind === "reachZone" &&
    after.type === "reachZone" &&
    (before.type !== "reachZone" || !before.reached) &&
    after.reached &&
    !after.capMet &&
    params.minSpeedKmh !== undefined &&
    Math.abs(tick.speedKmh) < params.minSpeedKmh
  ) {
    // The AUTHORED number, printed raw and without a `shownObjectiveCapKmh`
    // twin: the ladder does not touch the floor (`scenario/params.ts`), so
    // there is only ever one figure for it and the two-numbers-for-one-task
    // split that card had to fix cannot arise here.
    // Round 14 (R1 as a class): the floor printed as authored (`kmhExact`, never rounded), and the measured speed
    // printed so that «с поне N …, а мина с M» holds between the printed N and M (`speedBeyondTxt`).
    const wantedTxt = kmhExact(params.minSpeedKmh);
    const measuredTxt = speedBeyondTxt(Math.abs(tick.speedKmh), params.minSpeedKmh, "under");
    const dM = Math.hypot(tick.position.x - params.x, tick.position.y - params.y);
    const stillAtTheMark = dM <= params.radiusM + REACH_ZONE_GRACE_M;
    return {
      kind: "lesson",
      titleBg: "Мина точката твърде бавно",
      // THEO-4 — what was observed, what the task wants, WHY that is the
      // dangerous half, and what to do about it. The „why" is the whole point
      // of the drill: пълзенето не е решение на задачата «съобразена скорост»,
      // а нейното избягване — беглецът от преценката не се учи да я прави.
      explanationBg:
        `Задачата иска да минеш тук с поне ${wantedTxt} км/ч, а мина с ${measuredTxt}. ` +
        "„Съобразена скорост“ не значи „възможно най-бавно“: тя е най-високата скорост, от която " +
        "спираш в осветеното пред теб. Пълзенето не решава тази преценка, а я заобикаля — а " +
        "в същото време бавната кола в тъмното сама става пречка за движението: задните я виждат " +
        "късно и я задминават там, където не бива. " +
        (stillAtTheMark
          ? "Ускори СЕГА, докато си върху точката — задачата се отчита на следващия кадър, ако си в границите. Ако я подминеш така, остава неизпълнена, но урокът продължава и разборът я показва накрая."
          : "Точката е вече зад теб, затова задачата остава неизпълнена: скоростта се избира ПРЕДИ участъка. Урокът продължава и разборът я показва накрая."),
      lawRef: "ЗДвП чл. 5",
      // The drill's safety half, compressed out of the paragraph's own «бавната
      // кола … сама става пречка»: the misconception is that slower is always
      // safer, and the line answers exactly that. Seconds-, figure- and
      // tail-free, so it is true on both tails.
      peekBg: "Бавната кола е пречка.",
    };
  }
  if (
    params.kind === "completeManeuver" &&
    params.maneuver === "roundabout" &&
    after.type === "roundabout" &&
    before.type === "roundabout" &&
    after.voidedExits > before.voidedExits
  ) {
    return {
      kind: "lesson",
      titleBg: "Излезе от кръговото без десен мигач",
      explanationBg:
        "Излизането от кръгово е маневра надясно и се сигнализира — мигачът казва на колите зад теб и на чакащите на изхода, че напускаш кръга. Задачата остава отворена: върни се в кръговото и излез с пуснат десен мигач. Ако продължиш напред, урокът приключва и разборът показва точно това място.",
      lawRef: "ЗДвП чл. 25",
      // WHY the lamp, in the paragraph's own words: the title names the missing
      // signal, the line says what it would have told the others.
      peekBg: "Мигачът казва: излизам.",
    };
  }
  return null;
}

/**
 * Run-wide met-reds tally (A10): completed passSignal objectives keep their
 * final eval state, so a red met at an earlier junction satisfies a later
 * requireRedMet gate (L2 — the run must include at least one handled red,
 * not every junction).
 */
function countRedsMet(evalStates: ReadonlyArray<ObjectiveEvalState>): number {
  let n = 0;
  for (const s of evalStates) {
    if (s.type === "passSignal" && s.redMet) n += 1;
  }
  return n;
}

/**
 * Did this scored event record contact with a HUMAN BODY? (round 10,
 * 2026-08-24 — `objectives.ts vruWaitHonoured` holds the frame.)
 *
 * `detail` is the struck body kind the contact episode already stamps on every
 * bill (`rules/engine.ts`, `COLLISION_CONTACT_COPY`'s four keys), so this reads
 * the discriminator rather than inventing one. A cyclist counts: чл. 42's
 * clearance duty and чл. 119's yield duty protect the same unarmoured body, and
 * a banner that says «изчакай» about either is falsified by hitting them.
 * Vehicles and static objects do NOT count — those are the rule engine's to
 * grade and say nothing about whether a person was let through.
 */
function isPersonContact(e: ScorableEvent): boolean {
  return (
    e.kind === "violation" &&
    e.code === "COLLISION" &&
    (e.detail === "pedestrian" || e.detail === "cyclist")
  );
}

/**
 * ANY struck body — the wider read `ReachZoneParams.requireNoContact` consults
 * (lessons/types.ts carries the finding). Same ledger, same event code, no
 * `detail` filter: a vehicle, a person, a cyclist and an authored static
 * obstacle are all bodies a drill may forbid touching.
 *
 * THE BILLED EVENT, NOT THE RAW CONTACT STREAM, and that is what makes the
 * demand safe to author. `orchestrator/contact.ts` only opens an encounter once
 * the closing speed clears the drill's own floor — „a 2 km/h bumper kiss is not
 * a crash" — and `rules/engine.ts` collapses the per-frame stream into one bill
 * per body. So what reaches this predicate is an accident the protocol already
 * prints, never a graze the student cannot see.
 */
function isBodyContact(e: ScorableEvent): boolean {
  return e.kind === "violation" && e.code === "COLLISION";
}

/**
 * Went onto the rails with the arm down — the ONE line of the ledger
 * `ReachZoneParams.requireRailClear` consults (objectives.ts
 * `railClearHonoured` carries the finding and the argument for reading a
 * verdict here rather than raw frames).
 *
 * The `detail` narrowing is the whole point: `RAIL_CROSSING_VIOLATION` also
 * carries "no-stop" (an UNGUARDED crossing entered without the mandatory full
 * stop) and "stopped-on-track" (came to rest between the rails). Both are real
 * faults with their own graders and their own copy, and neither is a claim
 * about the barrier — folding them in would refuse the guarded drill's
 * certificate for an offence its banner never spoke about.
 */
function isBarredRailEntry(e: ScorableEvent): boolean {
  return (
    e.kind === "violation" &&
    e.code === "RAIL_CROSSING_VIOLATION" &&
    e.detail === "entered-barred"
  );
}

/**
 * Rested inside a no-stopping span — the ledger row
 * `ReachZoneParams.requireRestClean: "banZone"` consults (objectives.ts carries
 * the frame, the census and the two false-refusal checks).
 *
 * IT READS THE BILL, NOT THE TRACKER, exactly like the three predicates above:
 * `rules/engine.ts` only reaches `ILLEGAL_STOP_IN_BAN_ZONE` for a rest that has
 * already survived its innocence set — a lead within `banZoneStopQueueGapM`, a
 * stop line, a signal — so what arrives here is never a student obeying
 * traffic, and it is a fault the protocol prints with its ЗДвП чл. 6, т. 1
 * citation, its explanation and its «✔ Правилното действие» corrective.
 */
function isBanZoneRest(e: ScorableEvent): boolean {
  return e.kind === "violation" && e.code === "ILLEGAL_STOP_IN_BAN_ZONE";
}

/**
 * …AND THE SAME FAULT AS THE COACH RECORDED IT — the half no sibling demand
 * needs, and the reason this one does.
 *
 * `isBanZoneRest`'s three neighbours all read опасна codes, which the
 * teach-first coach never hands over as a free mini-lesson. This one is
 * основна, so the FIRST offence in a training drive is SHOWN and deliberately
 * NOT CHARGED: it lands on `LessonSessionState.coachedMistakes` instead of
 * `events`, and both channels reach the debrief the student reads (that field
 * exists precisely so the sheet stops describing only the ledger). Measured on
 * this drill's own ❌ demo — `mistake-stop-before-crossing` at L1 books zero
 * scored events and one coached `ILLEGAL_STOP_IN_BAN_ZONE` at 0:26 — so a
 * ledger-only read would have left the demo certifying itself.
 *
 * `CoachedMistake.code` is a plain string (future codes pass through), so this
 * is a string compare rather than a narrowed union; the SCORED half above is
 * typed against the real `ViolationCode`, which is what makes a rename fail the
 * build instead of quietly emptying the gate.
 */
function isCoachedBanZoneRest(m: CoachedMistake): boolean {
  return m.code === "ILLEGAL_STOP_IN_BAN_ZONE";
}

/**
 * Crossed a непрекъсната осева — the ledger row
 * `ReachZoneParams.requireSolidLineClean` consults (objectives.ts carries the
 * drive, the census and the two false-refusal checks).
 *
 * IT READS THE BILL, NOT THE TRACKER, exactly like its four neighbours:
 * `worldRuntime` arms this detector only on an authored М1 span and only past
 * `solidLineCrossSustainSec` (the paint-flicker guard), so what arrives here is
 * a conviction the protocol already prints — with the catalogue's explanation,
 * its «✔ Правилното действие» corrective and its ППЗДвП/ЗДвП refs — and never a
 * raw bank flip.
 */
function isSolidLineCross(e: ScorableEvent): boolean {
  return e.kind === "violation" && e.code === "CROSSED_SOLID_LINE";
}

/**
 * …AND THE SAME FAULT AS THE COACH RECORDED IT — the half that carries this
 * demand in every TRAINING drive, and the reason it is not optional.
 *
 * `CROSSED_SOLID_LINE` is основна since the 2026-08-09 Наредба № 38 grounding
 * pass, so the teach-first coach hands the FIRST offence over as a free
 * mini-lesson on `LessonSessionState.coachedMistakes` and the sheet stays
 * empty. Measured on the drive this demand was written for — decline the
 * overtake in the М2 window, then take it inside the М1 span — scored is `[]`
 * and coached is `[CROSSED_SOLID_LINE]` at BOTH L1 and L3, so a ledger-only
 * read would have refused nothing outside exam mode. The same asymmetry
 * `isCoachedBanZoneRest` documents one screen up.
 *
 * `CoachedMistake.code` is a plain string (future codes pass through), so this
 * is a string compare; the SCORED half above is typed against the real
 * `ViolationCode`, which is what makes a rename fail the build instead of
 * quietly emptying the gate.
 */
function isCoachedSolidLineCross(m: CoachedMistake): boolean {
  return m.code === "CROSSED_SOLID_LINE";
}

/**
 * Braked hard with nothing in front — the ledger row
 * `ReachZoneParams.requireBrakingClean` consults (lessons/types.ts carries the
 * frame, the drive and the census).
 *
 * IT READS THE BILL, NOT THE ACCELEROMETER, exactly like its neighbours: the
 * detector convicts only after excluding every visible forward cause (and a car
 * BEHIND is structurally not one — `leadGap` looks forward), so what arrives
 * here is a conviction the protocol already prints, with the catalogue's
 * explanation, its «✔ Правилното действие» corrective and its ЗДвП чл. 20,
 * ал. 1.
 */
function isHarshBrakeNoCause(e: ScorableEvent): boolean {
  return e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE";
}

/**
 * …AND THE SAME FAULT AS THE COACH RECORDED IT — the half that carries this
 * demand in every TRAINING drive, and the reason it is not optional.
 *
 * `HARSH_BRAKING_NO_CAUSE` is основна (catalog.ts), so the teach-first coach
 * hands the FIRST offence over as a free mini-lesson on
 * `LessonSessionState.coachedMistakes` and the sheet stays empty. Measured on
 * the drive this demand was written for — `sc-follow-tailgater`'s own
 * `mistake-brake-check` at L1 — scored is `[]` and coached is
 * `[HARSH_BRAKING_NO_CAUSE]`, so a ledger-only read would have refused nothing
 * outside exam mode and the demo would have gone on certifying itself.
 *
 * `CoachedMistake.code` is a plain string (future codes pass through), so this
 * is a string compare; the SCORED half above is typed against the real
 * `ViolationCode`, which is what makes a rename fail the build instead of
 * quietly emptying the gate.
 */
function isCoachedHarshBrakeNoCause(m: CoachedMistake): boolean {
  return m.code === "HARSH_BRAKING_NO_CAUSE";
}

/**
 * Held at a dead stop with nothing to stop for — the SECOND ledger row
 * `ReachZoneParams.requireBrakingClean` consults (lessons/types.ts carries the
 * frame and the census).
 *
 * WHY THE DEMAND READS TWO CODES AND NOT ONE. The slam and the standstill are
 * the same act at two intensities, and the cap the demand backs (`maxSpeedKmh`)
 * reads BEST at 0 км/ч — so on the one drill that authors this term, the
 * heavier fault was the one that kept the certificate. Measured at `e08d917`
 * through `compileScenario → applyTick → buildLessonResult`, on the audit's own
 * wrong leg (`sc-follow-tailgater:63c0c28c`, 45 m sprints with 8 s rests):
 * scored `[STOPPED_WITHOUT_CAUSE ×5]`, 5 наказателни точки — and «✓ Успокой
 * темпото», «✓ Стигни края на отсечката», «Урокът е издържан».
 *
 * IT READS THE BILL, NOT THE SPEEDOMETER, exactly like its neighbours: the
 * detector ships disarmed and, armed, convicts only a car held in a live lane
 * of an open through road with no signal, crossing, person, weather, hazard or
 * queue to answer for it, so what arrives here is a conviction the protocol
 * already prints with the catalogue's explanation and its ЗДвП чл. 24, ал. 2.
 */
function isNeedlessStop(e: ScorableEvent): boolean {
  return e.kind === "violation" && e.code === "STOPPED_WITHOUT_CAUSE";
}

/**
 * …AND THE SAME FAULT AS THE COACH RECORDED IT. `STOPPED_WITHOUT_CAUSE` is
 * второстепенна rather than основна, so unlike its neighbours the sheet is NOT
 * empty in a training drive — the second rest onward is charged. The coached
 * half still has to be read, because the FIRST rest is the free mini-lesson and
 * a student who stopped dead once in front of a лепка has not calmed the pace
 * either; without it a single-stop drive would keep the tick.
 *
 * `CoachedMistake.code` is a plain string (future codes pass through), so this
 * is a string compare; the SCORED half above is typed against the real
 * `ViolationCode`, which is what makes a rename fail the build instead of
 * quietly emptying the gate.
 */
function isCoachedNeedlessStop(m: CoachedMistake): boolean {
  return m.code === "STOPPED_WITHOUT_CAUSE";
}

/**
 * Sat still on a green with a clear box in front — the ledger row
 * `ReachZoneParams.requireGreenStartClean` consults (lessons/types.ts carries
 * the frame, the measured drive and the census).
 *
 * IT READS THE BILL, NOT THE SPEEDOMETER, exactly like its neighbours:
 * `HESITATION_AT_GREEN` fires only on a LIVE green whose box the detector has
 * already found clear (`leadGapM === null || leadGapM > cfg.hesitationClearGapM`
 * — rules/engine.ts), so a car held by a lead, a red or a person on the zebra
 * never reaches here. What arrives is a conviction the protocol already prints
 * with the catalogue's explanation and its Наредба № 38 citation.
 */
function isHesitationAtGreen(e: ScorableEvent): boolean {
  return e.kind === "violation" && e.code === "HESITATION_AT_GREEN";
}

/**
 * …AND THE SAME FAULT AS THE COACH RECORDED IT. Второстепенна like the needless
 * stop above, so the sheet is not empty in a training drive from the SECOND
 * freeze on — but the first is the teach-first free mini-lesson, and on the one
 * drill that authors this demand the whole ❌ demonstration is a single freeze.
 * Measured at L1 on `mistake-freeze`: scored `[]`, coached
 * `[HESITATION_AT_GREEN]`. A scored-only read would refuse nothing there.
 *
 * `CoachedMistake.code` is a plain string (future codes pass through), so this
 * is a string compare; the SCORED half above is typed against the real
 * `ViolationCode`, which is what makes a rename fail the build instead of
 * quietly emptying the gate.
 */
function isCoachedHesitationAtGreen(m: CoachedMistake): boolean {
  return m.code === "HESITATION_AT_GREEN";
}

/**
 * Came to rest between the rails — the ledger row
 * `ReachZoneParams.requireRestClean: "railBand"` consults.
 *
 * The `detail` narrowing is the whole point, exactly as for `isBarredRailEntry`
 * one screen up and for the same reason: `RAIL_CROSSING_VIOLATION` also carries
 * "no-stop" and "entered-barred", each a real fault with its own copy and its
 * own article (ЗДвП чл. 51, ал. 3 and чл. 52 against this arm's чл. 53, ал. 2),
 * and neither is a claim about standing still on the band. No coached half here
 * and none is possible: an опасна is always graded, and `CoachedMistake` carries
 * no `detail` to narrow by.
 */
function isRailBandRest(e: ScorableEvent): boolean {
  return (
    e.kind === "violation" &&
    e.code === "RAIL_CROSSING_VIOLATION" &&
    e.detail === "stopped-on-track"
  );
}

/**
 * The three billed rows that falsify a «пропусни …» banner — the ledger
 * `ReachZoneParams.requireYieldClean` consults (`objectives.ts` carries the
 * drive, the census and the window; `yieldCleanHonoured` carries the read).
 *
 * TYPED AGAINST THE REAL UNION ON PURPOSE. `YieldFaultCode` is declared in
 * `objectives.ts` so that evaluator keeps its single dependency on `rules/`,
 * and this `Set<ViolationCode>` is where the two vocabularies are made to
 * agree: a rename or a retirement in `rules/types.ts` fails the build here
 * instead of quietly emptying the gate — the instrument bug this programme has
 * shipped four times.
 *
 * IT READS THE BILL, NOT THE TRACKER, exactly like `isBarredRailEntry` above
 * and for the argument `objectives.ts railClearHonoured` sets out: what reaches
 * this predicate is a fault the protocol already prints, with its copy, its
 * corrective and its law refs, so the withheld certificate is never the
 * student's first news of the failure.
 *
 * AND IT CANNOT COST ANYONE A PASS. All three are `severityClass: "opasna"`
 * (catalog.ts), and one опасна is «допусната е опасна грешка — директно
 * неиздържан» on its own. So every drive this demand can refuse was already
 * failed by the sheet before the objective was consulted: what the refusal
 * removes is the CONTRADICTION between the two halves of that sheet, never a
 * verdict. `reach-zone-yield-clean.test.ts` asserts the severity so that a
 * later reclassification cannot quietly turn this into a demand that decides
 * pass/fail by itself.
 */
const YIELD_FAULT_CODES: ReadonlySet<ViolationEvent["code"]> = new Set<ViolationEvent["code"]>([
  "FAILED_TO_YIELD",
  "EMERGENCY_NOT_YIELDED",
  "PEDESTRIAN_NOT_YIELDED",
]);

function isYieldFault(e: ScorableEvent): e is ViolationEvent {
  return e.kind === "violation" && YIELD_FAULT_CODES.has(e.code);
}

/** Shared empty ledger — see the read below for why the clean frame gets one. */
const NO_YIELD_FAULTS: readonly YieldFaultRecord[] = [];

/**
 * The one conviction that falsifies a «спри напълно на Б2» banner — the second
 * fact `ReachZoneParams.requireFullStop` consults (objectives.ts
 * `stopSignRollFaultsSec` carries the drive, the mechanism and the window).
 *
 * ONE CODE, and deliberately not a set: `STOP_SIGN_NO_FULL_STOP` is the only
 * conviction in the catalogue whose subject IS «пълно спиране», so it is the
 * only one that can contradict the tick. Pooling it with the neighbouring red
 * lamp or give-way codes would refuse gates whose banners are about something
 * else, which is exactly what the window below already exists to prevent.
 */
function isStopSignRollFault(e: ScorableEvent): e is ViolationEvent {
  return e.kind === "violation" && e.code === "STOP_SIGN_NO_FULL_STOP";
}

/** Shared empty ledger, for the reason `NO_YIELD_FAULTS` has one. */
const NO_STOP_SIGN_ROLLS: readonly number[] = [];

/**
 * The three convictions that falsify a «задържах тавана» banner — the fact
 * `ReachZoneParams.requireSpeedClean` consults (objectives.ts carries the two
 * demonstration drives and why the set is exactly these three).
 *
 * THE SET IS THE CLAIM. „The ceiling" a Bulgarian road hands a driver is two
 * numbers, not one: the sign's (`SPEEDING_OVER_LIMIT` and its опасна upper band
 * `SPEEDING_DANGEROUS`) and the one the surface leaves of it
 * (`SPEED_TOO_FAST_FOR_CONDITIONS`). A banner naming the ceiling THE SURFACE
 * gave is answered by both, which is why neither alone would do: on a dry rung
 * the second never fires and the first is the whole ceiling; in the rain the
 * first stays silent at 49 км/ч while the second convicts, and 49 in the rain
 * is the mistake the plate exists to teach. `SPEED_TOO_FAST_FOR_CURVE`,
 * `PEDESTRIAN_CROSSING_TOO_FAST` and `CLOSING_ON_LEAD_TOO_FAST` are ceilings a
 * particular OBJECT imposes — a bend, a zebra, the car ahead — not the one the
 * carriageway itself carries, so they are out.
 *
 * TYPED AGAINST THE REAL UNION, for `YIELD_FAULT_CODES`'s reason one screen up:
 * this `Set<ViolationCode>` is where the demand's vocabulary and the rule
 * engine's are made to agree — a rename in `rules/types.ts` fails the build
 * here instead of quietly emptying the gate.
 *
 * IT READS THE BILL, NOT THE SPEEDOMETER, like every ledger predicate in this
 * block: what reaches it is a conviction the protocol already prints with its
 * copy, its «✔ Правилното действие» corrective and its ЗДвП refs (чл. 21, ал. 1
 * for the sign; чл. 20, ал. 2 for the surface), so the withheld certificate is
 * never the student's first news of the failure.
 *
 * AND IT CAN COST A PASS, unlike the yield set and exactly like the ban-zone
 * rest and the solid line: these three are второстепенна/опасна rather than
 * uniformly опасна, so a drive this refuses may have been passing. That is the
 * demand's point rather than a side effect — the one gate that authors it is
 * the finish of the drill whose entire subject is the ceiling, and a lesson
 * that hands out «задържал тавана от настилката» to a student it has just
 * convicted of exceeding it has taught him the opposite of its own topic.
 */
const SPEED_FAULT_CODES: ReadonlySet<ViolationEvent["code"]> = new Set<ViolationEvent["code"]>([
  "SPEEDING_OVER_LIMIT",
  "SPEEDING_DANGEROUS",
  "SPEED_TOO_FAST_FOR_CONDITIONS",
]);

function isSpeedFault(e: ScorableEvent): e is ViolationEvent {
  return e.kind === "violation" && SPEED_FAULT_CODES.has(e.code);
}

/**
 * …AND THE SHOWN-BUT-NOT-CHARGED HALF, which this fact needs for the reason
 * `isCoachedBanZoneRest` needs it and one degree more urgently: two of the
 * three codes are второстепенна, so on a training rung the FIRST occurrence is
 * given away as a free mini-lesson and lands on `coachedMistakes` rather than
 * `events`. A ledger-only read would let the very drive the plate exists to
 * teach against certify itself.
 *
 * `CoachedMistake.code` is a plain string, so this is a string compare; the
 * SCORED half above is typed against the real `ViolationCode`, which is what
 * makes a rename fail the build.
 */
function isCoachedSpeedFault(m: CoachedMistake): boolean {
  return SPEED_FAULT_CODES.has(m.code as ViolationEvent["code"]);
}

/**
 * Does the rule engine, RIGHT NOW, hold a full stop it would accept at a Б2 —
 * the fact `ReachZoneParams.requireFullStop` consults (objectives.ts carries
 * the sheet and the argument).
 *
 * THIS IS THE ENGINE'S OWN PREDICATE, character for character: `engine.ts`'s
 * `stopLineCrossed` branch decides FULL_STOP_AT_STOP_SIGN vs
 * STOP_SIGN_NO_FULL_STOP with `last !== null && t - last <= cfg.stopRecencySec`
 * over the same `stop.lastQualifyingStopAt`, which itself is „≤
 * `fullStopMaxSpeedKmh` for ≥ `fullStopMinDurationSec`". Reading it here rather
 * than re-deriving a standstill from `tick.speedKmh` is the whole repair: two
 * implementations of «пълно спиране» is how one sheet came to print a tick and
 * a −10 for the same act.
 *
 * Read off the POST-tick state, so the frame a stop becomes qualifying is the
 * frame the certificate may be issued on.
 */
function qualifyingStopCurrent(rules: RuleEngineState, _t: number): boolean {
  const last = rules.stop.lastQualifyingStopAt;
  // DRIVING seconds since the stop, not wall-clock ones — the same read the Б2
  // branch itself makes (`rules/engine.ts`, `stop.movingSinceStopSec`). Kept
  // literally identical to it for this predicate's own founding reason: two
  // implementations of «пълно спиране» is how one protocol came to print a ✓
  // and a −10 for the same act, and a repair applied to one of them only would
  // be that defect a second time.
  return last !== null && rules.stop.movingSinceStopSec <= rules.config.stopRecencySec;
}

/**
 * Map rule-engine output onto the HUD event contract (toasts).
 *
 * `peekBg` rides the ACT, not the code (`violationPeekBg` — `e.detail` selects
 * the struck body), and is omitted rather than nulled when the catalogue has
 * none: `HudEvent`'s own contract reads absence as „print `explanationBg`", and
 * a present-but-empty string would blank the card's only sentence.
 */
function toHudEvents(events: ReadonlyArray<RuleEvent>): HudEvent[] {
  return events.map((e) => {
    if (e.kind !== "violation") return { kind: "commendation" as const, titleBg: e.titleBg };
    const peekBg = violationPeekBg(e.code, e.detail);
    return {
      kind: "violation" as const,
      titleBg: e.titleBg,
      explanationBg: e.explanationBg,
      points: e.points,
      severity: e.severityClass,
      lawRef: e.lawRef,
      ...(peekBg === null ? {} : { peekBg }),
    };
  });
}

// ---------------------------------------------------------------------------
// Pre-drive phase
// ---------------------------------------------------------------------------

/**
 * Apply one PERFORMED (or info-confirmed) pre-drive step. No-op outside the
 * preDrive phase. Since A2 the caller is the 3D scene's transition observer
 * (procedures/performedSteps.ts) for performed steps and the read-only
 * checklist's confirm button for info steps — never a click-to-complete
 * path. Completing "move-off" finishes the procedure and unlocks driving.
 */
export function applyPreDriveStep(
  prev: LessonSessionState,
  stepId: PreDriveStepId,
  tSec: number,
): LessonStepResult {
  if (prev.phase !== "preDrive" || prev.preDrive === null) {
    return { state: prev, hudEvents: [] };
  }

  const { machine, events } = applyPreDriveAction(prev.preDrive, stepId, tSec);
  const scorable = events.filter(isScorableEvent);
  const hudEvents = toHudEvents(scorable);

  // A2 teach-first: an out-of-order step in instruction/practice mode is
  // coached (lesson toast with the authored law-cited WHY), never scored.
  for (const e of events) {
    if (e.kind === "stepOutOfOrder") {
      // The phone card's one line, RETRIEVED: `StepOutOfOrderEvent` is
      // documented as carrying „the same authored texts as the
      // PREDRIVE_WRONG_ORDER violation" (procedures/types.ts), and assess mode
      // bills that very code through `toHudEvents` with this very summary — so
      // the coached card and the billed card cannot say two different things.
      // `stepId` is the act key `makeViolation` was given as `detail`.
      const peekBg = violationPeekBg("PREDRIVE_WRONG_ORDER", e.stepId);
      hudEvents.push({
        kind: "lesson",
        titleBg: e.titleBg,
        explanationBg: e.explanationBg,
        lawRef: e.lawRef,
        ...(peekBg === null ? {} : { peekBg }),
      });
    }
  }

  const finished = events.some((e) => e.kind === "procedureCompleted");
  if (finished) {
    hudEvents.push({ kind: "objectiveComplete", titleBg: "Подготовка за потегляне" });
  }

  const allEvents = scorable.length > 0 ? [...prev.events, ...scorable] : prev.events;

  // A13: the exam is graded from the first second — the pre-drive procedure
  // included (assess mode scores wrong order live, skips at move-off). A
  // candidate who blows past the official limits before even driving is
  // terminated on the spot, exactly like on the road.
  let examTermination = prev.examTermination;
  let phase: LessonPhase = finished ? "driving" : prev.phase;
  let endedAtSec = prev.endedAtSec;
  if (
    prev.lesson.examMode === true &&
    examTermination === undefined &&
    scorable.some((e) => e.kind === "violation")
  ) {
    const trip = examTerminationFor(allEvents);
    if (trip !== null) {
      examTermination = trip;
      phase = "completed";
      endedAtSec = tSec;
    }
  }

  return {
    state: {
      ...prev,
      preDrive: machine,
      phase,
      endedAtSec,
      events: allEvents,
      lastT: Math.max(prev.lastT, tSec),
      ...(examTermination !== undefined ? { examTermination } : {}),
    },
    hudEvents,
  };
}

/**
 * QW10 drive gate: while the pre-drive procedure is still running the 3D
 * scene zeroes the drive inputs into the physics and explains why on the
 * first premature throttle attempt. Since A1+A2 the gate is mostly a
 * backstop — ignition/selector/parking brake are REAL now, so completing the
 * procedure genuinely readies the car, and the throttle press that performs
 * "move-off" is the same press that rolls it once this unlocks.
 */
export function isDriveLocked(state: LessonSessionState): boolean {
  return state.phase === "preDrive";
}

// ---------------------------------------------------------------------------
// End-of-drive settlement (one rule, every ending)
// ---------------------------------------------------------------------------

/** The coach flags `applyTick` derives per tick; rebuilt identically at a
 *  manual ending so the settlement is coached the same way on both paths. */
type CoachModeOpts = { examMode: true } | { learnOnly: true } | undefined;

function coachModeFor(lesson: LessonSpec): CoachModeOpts {
  const examMode = lesson.examMode === true;
  const mistakeXp = examMode ? undefined : lesson.mistakeExperience;
  return examMode ? { examMode: true } : mistakeXp !== undefined ? { learnOnly: true } : undefined;
}

/**
 * THE WITHHELD SPEEDING CHARGE, SETTLED — one implementation, asked by every
 * way a drive can end (`sc-signal-flashing:0d68b149`, critical).
 *
 * ── WHY IT IS A FUNCTION AND NOT A BLOCK INSIDE `applyTick` ─────────────────
 * It was a block, and the block could only be reached by a route that
 * completed BY ITSELF: `applyTick` opens with
 *     if (prev.phase === "completed" || prev.phase === "aborted") return …
 * so a session already ended cannot re-enter it, and `finishSession` /
 * `abortSession` set the phase from OUTSIDE it. A student who parked and
 * pressed «Край», and every student who quit, therefore had the charge the A12
 * free mini-lesson consumed silently forgiven — the audited leg is
 * `.audit-frames/w61/.../sc-signal-flashing__mobile-wrong`: 51, 56, peak
 * 58 км/ч under a posted 50, the teach card «Стигна точката, но твърде бързо»
 * on the glass, and a sheet reading «0 наказателни точки · MISTAKES (0)» over
 * a debrief saying «Изпитният лист остана чист».
 *
 * `settleUnpaidSpeedingTeach`'s own argument already covers that student —
 * «granting the six seconds to a drive that has ENDED is not mercy, it is an
 * acquittal» — and a drive ended early has ended just as hard as a drive that
 * ran out of route. So NO policy moves here and no threshold is touched
 * (`speedingGraceRatio` 0.1, `speedingGraceMaxKmh` 5, `dangerousSpeedOverKmh`
 * 10 — «do not change without an ADR»). What moves is reach.
 *
 * ── ONE ADDRESS, BECAUSE THIS FILE HAS ALREADY PAID FOR TWO ────────────────
 * The site this replaces carries a warning in its own comment: the ADR-009
 * target drop «had to be written twice or this path would keep charging», and
 * it was nearly missed the first time. A settlement copied into three endings
 * would be that failure three times over, so the coaching, the two guards and
 * the escalation live HERE and the callers supply only what differs.
 *
 * ── THE GUARDS, AND WHAT EACH ONE IS FOR ───────────────────────────────────
 *  · `alreadyCharged` — the anti-double-bill. The settlement is `regrade`-
 *    marked by construction and does NOT travel through the `regrade` guard at
 *    the top of `applyTick`, so this is the only thing standing between a
 *    student and paying twice for one continuing breach. It matters most in
 *    EXAM mode, where teach-first is bypassed and the first bill was already
 *    charged in the moment.
 *  · `settledIsTarget` — ADR-009 / founder Ruling A: no exam points are taken
 *    for the first occurrence of the lesson's OWN mistake, and this bill exists
 *    only to reach the charge the free teach consumed, which for a target code
 *    is exactly what the ruling forbids.
 *
 * The coach is ASKED rather than bypassed (`coachStep`) so the escalation
 * ladder and the encounter counters keep describing what actually happened,
 * and so a future teach-first policy moves this bill with every other one.
 */
function settleSpeedingTeach(args: {
  rules: RuleEngineState;
  /**
   * Only what the settlement reads — `settleUnpaidSpeedingTeach` re-checks the
   * band off `t`/`speedKmh`/`maxSpeedKmh`, and `position` pins the bill on the
   * A15 mistake map. A full `SimTick` satisfies it structurally, so
   * `applyTick`'s caller is unchanged; the hand-ended caller can hand over the
   * four scalars a session is allowed to keep (`types.ts SpeedingSettleTick`).
   */
  tick: SpeedingSettleTick;
  encounters: Record<string, number>;
  coachOpts: CoachModeOpts;
  lessonTargets: ReadonlyMap<string, unknown> | null;
  alreadyCharged: (code: string) => boolean;
}): {
  encounters: Record<string, number>;
  scored: ViolationEvent[];
  escalations: PenaltyEscalation[];
  /** Round 7: a sign-bound arrival settled at the end and TAUGHT — the coached row it leaves. */
  coached: ViolationEvent[];
} {
  /*
   * EVERY LEDGER SETTLES ITS OWN (round 2 of the 2026-09-25 task-cap ruling,
   * verifier F2; round 14, founder ruling 2026-10-03 «Cap adds, never
   * removes»). The sign's withheld charge (`settleUnpaidSpeedingTeach`,
   * чл. 21), the cap's (`settleUnpaidTaskTeach` — the cap ledger's own act) and
   * the weather's and the bend's (`settleUnpaidAdaptationTeach` — exactly as
   * with no cap) are asked in turn, through the SAME guards and the same coach,
   * so no ending path can reach one and walk past another, and none reads what
   * another settled.
   */
  let encounters = args.encounters;
  const scored: ViolationEvent[] = [];
  const escalations: PenaltyEscalation[] = [];
  const charged = (code: string): boolean =>
    args.alreadyCharged(code) || scored.some((x) => x.code === code);
  const candidates = [
    settleUnpaidSpeedingTeach(args.rules, args.tick),
    settleUnpaidTaskTeach(args.rules, args.tick),
    // FOUNDER RULING 2026-09-25 «Yes, same as speeding»: a TAUGHT weather or bend
    // overspeed still running at the end is settled through these same guards —
    // on every drive, capped or not (round 14).
    ...settleUnpaidAdaptationTeach(args.rules, args.tick),
  ];
  for (const raw of candidates) {
    if (raw === null) continue;
    const settledIsTarget = args.lessonTargets?.has(raw.code) === true;
    if (charged(raw.code) || settledIsTarget) continue;
    const settled = withoutKinMarks(raw);
    const step = coachStep(
      encounters,
      {
        code: settled.code,
        severityClass: settled.severityClass,
        terminateSession: settled.terminateSession,
        detail: settled.detail,
      },
      args.coachOpts,
    );
    encounters = step.encounters;
    if (!step.decision.scored) continue;
    scored.push(settled);
    if (step.decision.penaltyMultiplier > 1) {
      escalations.push({ code: settled.code, t: settled.t, multiplier: step.decision.penaltyMultiplier });
    }
  }
  /*
   * ROUND 7 — THE SIGN-BOUND ARRIVAL'S ONE BILL, when the drive ends inside its
   * act (`rules/engine.ts settlePendingTaskArrival`: a mark whose cap the glass
   * showed at or above the sign, blown while the car was over the sign, with no
   * speeding bill in that act and the car never back at the sign). Unlike the
   * three settlements above it is a FIRST bill, not a withheld re-grade — so it
   * passes neither `alreadyCharged` nor the target drop, and the coach decides it
   * exactly as it decides an arrival during the drive: TAUGHT the first time the
   * topic is met (a coached row, so the debrief lists it and scopes its praise),
   * charged on a repeat.
   */
  const coached: ViolationEvent[] = [];
  const waiting = settlePendingTaskArrival(args.rules, args.tick);
  if (waiting !== null) {
    const settled = withoutKinMarks(waiting);
    const step = coachStep(
      encounters,
      {
        code: settled.code,
        severityClass: settled.severityClass,
        terminateSession: settled.terminateSession,
        detail: settled.detail,
        lessonMistakeTarget: args.lessonTargets?.has(settled.code) === true,
      },
      args.coachOpts,
    );
    encounters = step.encounters;
    if (step.decision.scored) {
      scored.push(settled);
      if (step.decision.penaltyMultiplier > 1) {
        escalations.push({ code: settled.code, t: settled.t, multiplier: step.decision.penaltyMultiplier });
      }
    } else {
      coached.push(settled);
    }
  }
  return { encounters, scored, escalations, coached };
}

/**
 * The same settlement, run on a session that has JUST been ended by hand —
 * the half `applyTick` structurally cannot reach.
 *
 * It folds the bill into exactly the channels `applyTick` folds it into, and
 * for the same reasons: `events` is the изпитен лист and the debrief's «Грешки»
 * row, `penaltyEscalations` the A9 training ladder, `eventPositions` the A15
 * mistake map (positioned from the last tick, which is where the car was when
 * the drive ended). Nothing else on the state moves — the phase, `endedAtSec`
 * and `lastT` are the caller's, and this never changes them.
 *
 * NO TICK, NO SETTLEMENT: a session ended before the car ever ticked has no
 * measurement to re-check the band against, and a charge without one would be
 * a conviction on a number nobody read.
 */
function settleEndedSession(ended: LessonSessionState): LessonSessionState {
  const tick = ended.lastTick;
  if (tick === undefined) return ended;
  // Built the same way and read the same way as `applyTick`'s closure, minus
  // the in-flight `scoredEvents` half: at a manual ending there is no tick in
  // progress, so `events` IS the whole ledger.
  let chargedCodes: Set<string> | undefined;
  const alreadyCharged = (code: string): boolean =>
    (chargedCodes ??= new Set(
      ended.events.filter((x) => x.kind === "violation").map((x) => x.code as string),
    )).has(code);
  const out = settleSpeedingTeach({
    rules: ended.rules,
    tick,
    encounters: ended.scenarioEncounters,
    coachOpts: coachModeFor(ended.lesson),
    lessonTargets: lessonMistakeTargetCodes(ended.lesson),
    alreadyCharged,
  });
  // Round 7: a sign-bound arrival taught at the ending leaves its coached row
  // (under the same cap every coached row keeps).
  const coachedMistakes =
    out.coached.length > 0 && ended.coachedMistakes.length < MAX_COACHED_MISTAKES
      ? [
          ...ended.coachedMistakes,
          ...out.coached.map((e) => ({
            code: e.code,
            titleBg: e.titleBg,
            t: e.t,
            ...(e.detail !== undefined ? { detail: e.detail } : {}),
          })),
        ]
      : ended.coachedMistakes;
  if (out.scored.length === 0) {
    // Identity on the overwhelmingly common answer (nothing was withheld), so
    // an ordinary ending allocates nothing at all.
    if (coachedMistakes !== ended.coachedMistakes) {
      return { ...ended, scenarioEncounters: out.encounters, coachedMistakes };
    }
    return out.encounters === ended.scenarioEncounters
      ? ended
      : { ...ended, scenarioEncounters: out.encounters };
  }
  const positions: EventPosition[] = out.scored.map((e) => ({
    kind: e.kind,
    code: e.code,
    t: e.t,
    x: tick.position.x,
    y: tick.position.y,
  }));
  return {
    ...ended,
    events: [...ended.events, ...out.scored],
    coachedMistakes,
    scenarioEncounters: out.encounters,
    penaltyEscalations:
      out.escalations.length > 0
        ? [...ended.penaltyEscalations, ...out.escalations]
        : ended.penaltyEscalations,
    eventPositions: [...(ended.eventPositions ?? []), ...positions],
  };
}

// ---------------------------------------------------------------------------
// Driving phase
// ---------------------------------------------------------------------------

/**
 * Advance the session by one SimTick frame. Runs the rule engine in every
 * live phase (the law applies from second zero); objectives advance only
 * while driving. When the last objective completes the session completes.
 */
export function applyTick(prev: LessonSessionState, tick: SimTick): LessonStepResult {
  if (prev.phase === "completed" || prev.phase === "aborted") {
    return { state: prev, hudEvents: [] };
  }

  // The active task's ceiling rides the tick the reducer grades — and ONLY that
  // tick: the objective evaluator below and every other reader keep the frame
  // exactly as the scene produced it. See `stepTaskCapLatch` (round 3: one
  // latch per blow, walked through a bounded stretch).
  const capStep = stepTaskCapLatch(prev, tick);
  const taskSpeedCap = capStep.cap;
  // ROUND 5: …and, on the one frame a latch is created (round 6: for every
  // capped objective), the arrival the reducer bills (founder ruling
  // 2026-09-26 «Bill the arrival»).
  const taskCapArrival = capStep.arrival;
  const ruleTick: SimTick =
    taskSpeedCap === undefined && taskCapArrival === undefined
      ? tick
      : {
          ...tick,
          ...(taskSpeedCap !== undefined ? { taskSpeedCap } : {}),
          ...(taskCapArrival !== undefined ? { taskCapArrival } : {}),
        };
  const { state: rules, events: ruleEvents, amendments: actAmendments } = reduceTick(prev.rules, ruleTick);

  // A13: exam sessions bypass the whole teach-first layer — see coach.ts.
  // THEO-3: mistake-experience sessions ride the coach's learn-only
  // suppression channel instead — the sandbox where the wrong action is the
  // assignment, so nothing scores and nothing terminates (coach.ts learnOnly).
  const examMode = prev.lesson.examMode === true;
  const mistakeXp = examMode ? undefined : prev.lesson.mistakeExperience;
  // ONE ADDRESS for the coach-mode rule: `coachModeFor` (above) is the same
  // expression, and a manual ending re-derives it there so the settlement is
  // coached exactly as a tick-time bill would be. Two copies of this ternary
  // would be two teach-first policies waiting to drift apart.
  const coachOpts = coachModeFor(prev.lesson);
  // S1 pauseOnError (doc 76 §7 L1 „Пълна помощ"): in a guided scenario drill
  // EVERY graded violation ALSO freezes into a teach card — including codes
  // the coach normally only toasts (опасна/terminating like COLLISION: at
  // walking speed in a parking lot the freeze IS the lesson, unlike street
  // incidents where a modal would interrupt evasive handling). Scoring is
  // UNCHANGED — the aid adds the pause, never touches points. Inert when the
  // flag is absent (every curriculum lesson).
  const pauseOnError = prev.lesson.aids?.pauseOnError === true;
  /**
   * ADR-009 (founder Ruling A) — THE LESSON'S OWN MISTAKES, on a practice rung.
   *
   * `null` on an exam rung, in the THEO-3 sandbox and on every lesson that
   * carries no targets, and `null` means «this rung behaves exactly as it did
   * before ADR-009» rather than «no targets»: every one of the four readers
   * below (`?.has(...) === true`) is inert under it by construction, so an exam
   * drive takes the same branches it always took.
   *
   * Computed ONCE per tick, not per event: `lessonMistakeTargetCodes` builds a
   * Map, and building it inside the event loop would allocate one per violation
   * in the render path. It is the SINGLE place the applicability rule is read
   * here — see `lessonMistake.ts` for why that rule lives in one file.
   */
  const lessonTargets = lessonMistakeTargetCodes(prev.lesson);

  // Coach the violations: teach-first-then-grade. A first, teachable mistake
  // PAUSES the sim with a mini-lesson card (A9, doc 65 §5) and does NOT count
  // toward the score; repeats — and any dangerous/terminating error — are
  // graded, repeats harder (escalation ×1.5/×2.0 on the training score).
  let encounters = prev.scenarioEncounters;
  let escalations = prev.penaltyEscalations;
  let lastTeachAt = prev.lastTeachMomentAtSec;
  // Round 6 (verifier F5): the last pause that held a card other than a
  // lower-class teach card — the only kind that refuses a charged card
  // (`isLowerClassTeach`). `?? null`: absent until the drive's first one.
  let lastHeavyTeachAt = prev.lastHeavyTeachMomentAtSec ?? null;
  /*
   * ROUND 14 — THE CAP'S OWN PAUSE CLOCKS (founder ruling 2026-10-03, «Cap adds, never removes … the bend/weather bills
   * are charged exactly as they would be in a lesson with no cap»). The pause rate limit is a clock every card used
   * to share, so a cap card moved the weather's and the bend's: a blown mark taught at 5,0 s turned the bend's own teach
   * card at 7,5 s from a pause into a toast — a card the same drive with no cap pauses on. The cap's cards keep their
   * own pair of clocks (`TASK_CAP_CODE` only), so every other card pauses, or is downgraded, exactly as with no cap,
   * and the cap's card is scheduled by nothing of another code. The cost is bounded and stated: within one window a
   * drive can pause once for the cap and once for everything else.
   */
  let lastCapTeachAt = prev.lastCapTeachMomentAtSec ?? null;
  let lastCapHeavyTeachAt = prev.lastCapHeavyTeachMomentAtSec ?? null;
  const capCard = (code: string): boolean => code === TASK_CAP_CODE;
  let mistakeHitAt = prev.mistakeExperienceHitAtSec;
  let mistakeMoment: TeachMoment | undefined;
  const hudEvents: HudEvent[] = [];
  const scoredEvents: ScorableEvent[] = [];
  const teachMoments: TeachMoment[] = [];
  /** Queue a card for this frame's pause and move the pause slot to this frame. */
  const notePause = (m: TeachMoment): void => {
    teachMoments.push(m);
    if (capCard(m.code)) {
      if (!isLowerClassTeach(m)) lastCapHeavyTeachAt = tick.t;
      lastCapTeachAt = tick.t;
      return;
    }
    if (!isLowerClassTeach(m)) lastHeavyTeachAt = tick.t;
    lastTeachAt = tick.t;
  };
  /**
   * SHOWN-BUT-NOT-CHARGED, RECORDED WHERE THE DECISION IS MADE. Every unscored
   * arm below still DISPLAYS the violation — the teach pause, its rate-limited
   * toast downgrade, the THEO-3 consequence moment and the learn-only ambient
   * toast — and until this record existed, nothing downstream could tell such
   * a drive from a clean one: `DebriefContext.coachedMistakes` had NO live
   * producer, so the debrief wrote «чисто каране без нито едно нарушение»
   * over drives whose own HUD had said «Превишена скорост» twice (sweep161
   * `sc-signal-flashing`/mobile-wrong 04-t012s: 59 км/ч, 50 badge, «(+1)»;
   * findings ef1eb9cf · a448e5f0 · 0fde4ec0 · faae7057). The UI teachQueue
   * cannot substitute: it sees only the pause arm. Capped like every additive
   * channel — a stuck-throttle drive re-raising one code every few seconds
   * must not grow the state without bound; the debrief dedups by title anyway.
   */
  const coachedNew: CoachedMistake[] = [];
  // `?? []`: the field is required on the type, but vitest transpiles without
  // typechecking and older hand-built state fixtures predate it.
  const coachedPrev = prev.coachedMistakes ?? [];
  let coachedCount = coachedPrev.length;
  /**
   * ADR-009 — ROOM KEPT INSIDE THE EXISTING CAP FOR THE LESSON'S OWN MISTAKES.
   *
   * A target's first occurrence is the ONLY record that it happened at all (it
   * is never charged, §3.4b b/c), so a drive that spent all 100 rows on a
   * stuck-throttle code would have passed a lesson it did not take. Ordinary
   * rows therefore stop `reserve` short of the cap and a target's FIRST row may
   * use the last places. The cap itself does not move: `MAX_COACHED_MISTAKES`
   * and `wire.ts MAX_COACHED_MISTAKES_WIRE` are both still 100, so no older
   * server rejects a payload this build can produce (doc 92 §1 fix 3).
   *
   * `reserve` is 0 on every session ADR-009 does not apply to, which is what
   * keeps exam rungs and sandboxes byte-identical.
   */
  const coachedReserve = lessonTargets?.size ?? 0;
  const recordCoached = (e: { code: string; titleBg: string; t: number; detail?: string }): void => {
    const firstOfTarget =
      lessonTargets?.has(e.code) === true &&
      !coachedPrev.some((c) => c.code === e.code) &&
      !coachedNew.some((c) => c.code === e.code);
    if (coachedCount >= (firstOfTarget ? MAX_COACHED_MISTAKES : MAX_COACHED_MISTAKES - coachedReserve)) {
      return;
    }
    // ADR-009 / doc 92 ADDENDUM 1 item 1 — THE ACT TRAVELS WITH THE ROW. A
    // coached row used to be `{ code, titleBg, t }`, so the act the student's
    // card named («Непълно оглеждане при знак Б1») was discarded at the moment
    // of the mistake and both the fold and the server re-titled to the pooled
    // «…на кръстовището». Measured over the 1,006 L1/L3 drives: the code is
    // RAISED on 8 of them, coached on all 8 and charged on 0. Across every
    // authored rung it is raised on 16 and charged on 4 — and all four charges
    // are at L4, where ADR-009 does not apply. So on every PRACTICE drive that
    // raises it the code is coached and never charged, and the charged path's
    // act copy reached no student at all. (This first read «coached on every
    // one of 1,006 drives», which counted the drives in the run rather than the
    // occurrences of the code; corrected 2026-09-18 by lane I's measurement.) The three
    // edits downstream of this one are `serializeCoachedMistakes`,
    // `parseCoachedMistakes` and `gradeFinishWire` in `wire.ts`.
    coachedNew.push({
      code: e.code,
      titleBg: e.titleBg,
      t: e.t,
      ...(e.detail !== undefined ? { detail: e.detail } : {}),
    });
    coachedCount += 1;
  };
  /**
   * ONE CONTINUOUS BREACH, ONE CHARGE — the standing-duty re-grade guard.
   *
   * `rules/engine.ts` bills a one-switch duty (belt, handbrake, the four lamp
   * arms) TWICE per episode, ten driving seconds apart, because the first bill
   * is spent by the teach-first free mini-lesson: without a second one, a whole
   * lesson driven unbelted or unlit reaches its debrief on «Опасни 0 · Основни
   * 0 · Второстепенни 0» under «чисто каране по изпитния лист». The second bill
   * therefore exists ONLY to reach the charge the teach consumed, and it says
   * so — `regrade: true` means „this is the same breach, not a new act".
   *
   * So when the code has ALREADY been charged, the re-grade has nothing left to
   * add and is dropped here, before the coach ever sees it. Three ways it can
   * already have been charged, and all three are live:
   *  · EXAM MODE — `coach.ts` scores unconditionally under examMode, so the
   *    first bill IS the charge. Without this drop a candidate on a night exam
   *    variant (`examBank.ts` ships them) who runs twelve seconds unbelted and
   *    unlit books 12 наказателни точки where Наредба № 38 prices the pair at
   *    6, against gates of `osnovniPoints > 6` and `totalPoints > 9`
   *    (`rules/summary.ts`, `exam.ts`) — a false FAIL on the изпит.
   *  · A REPEAT OFFENCE — the driver buckled up, unbuckled again, and the new
   *    episode's first bill grades on its own (prior encounter). The second
   *    offence costs its 3 points once, not twice.
   *  · A GRADE-ON-SIGHT policy for that topic (`scenarios/policy.ts`).
   * The TEACH is never suppressed: an unscored first bill leaves the ledger
   * empty, so the re-grade passes and lands as the single charge it exists to
   * be. Requirement-zero holds — the student is taught, then charged once.
   */
  let chargedCodes: Set<string> | undefined;
  const alreadyCharged = (code: string): boolean =>
    // Built LAZILY: this runs in the render loop, and a re-grade arrives at
    // most twice per episode, so a clean drive never pays for the set at all.
    (chargedCodes ??= new Set(
      prev.events.filter((x) => x.kind === "violation").map((x) => x.code as string),
    )).has(code) || scoredEvents.some((x) => x.kind === "violation" && x.code === code);
  /**
   * THE CAP LEDGER'S ONE MARK, READ WHERE CHARGES ARE KNOWN (`rules/engine.ts` „THE CAP LEDGER'S ACT").
   *
   * `absorbedBy` — a later FIRST bill of the cap inside a cap act whose first bill was already put before the
   * student (the stretch after a billed arrival: one act, one bill, founder ruling 4). It names nothing and is dropped
   * here, before the coach — so it is neither a card nor a charge nor a coached row. ONE exception, and it is
   * ADR-009's: the lesson's own target, on its first occurrence of the session, is let through, because that
   * occurrence is the only record the lesson has that its mistake happened. A target's first occurrence is never
   * charged (Ruling A) and its re-grades are dropped below, so letting it through cannot make a second bill.
   *
   * ROUND 14 (founder ruling 2026-10-03, «Cap adds, never removes»): the cap's own bills only. Rounds 2–13 also
   * dropped weather bills absorbed into a cap act (and, inside a sign-bound act, bend bills), let a re-grade handed to
   * another ceiling through only to an uncharged OWNER (`kinOwner`), and turned a new breach after the owner's lapse
   * into a free card that never reached the coach (`kinSurface`). The reducer produces none of those any more: every
   * weather, bend and speeding bill reaches the coach exactly as it does with no cap.
   *
   * The mark is STRIPPED before anything else sees the event, so the scored ledger, the wire and every surface carry
   * exactly the shape a plain bill or re-grade has always had.
   */
  const capLedgerAdmits = (e: ViolationEvent): boolean =>
    e.absorbedBy === undefined ||
    (lessonTargets?.has(e.code) === true &&
      e.regrade !== true &&
      !alreadyCharged(e.code) &&
      !coachedPrev.some((c) => c.code === e.code) &&
      !coachedNew.some((c) => c.code === e.code));
  for (const raw of ruleEvents) {
    if (raw.kind === "violation" && !capLedgerAdmits(raw)) continue;
    const e = raw.kind === "violation" ? withoutKinMarks(raw) : raw;
    if (e.kind === "commendation") {
      hudEvents.push({ kind: "commendation", titleBg: e.titleBg });
      scoredEvents.push(e);
      continue;
    }
    // ADR-009 — AND THE RE-BILL OF THE LESSON'S OWN MISTAKE IS DROPPED TOO.
    // The re-bill above exists ONLY to reach the charge the free teach consumed
    // (`rules/engine.ts` standingDutyBill and the finish-time speeding
    // settlement). For a TARGET code that charge is exactly what Ruling A
    // forbids — «NO exam points are taken for that first occurrence» — so the
    // second bill of one continuing breach has nothing left it may collect.
    // What the re-bill protected, a drive reaching its debrief looking clean,
    // is now carried by «Не е взет» and the reason block instead.
    // A repeat EPISODE is untouched (founder answer F1): it is not a `regrade`,
    // it is a new act, and it grades on the ×1.5/×2 ladder exactly as today.
    if (e.regrade === true && (alreadyCharged(e.code) || lessonTargets?.has(e.code) === true)) {
      continue;
    }
    // (ROUND 1's RUN-WIDE KIN GUARD — „a task re-grade is dropped once the
    // conditions or curve code has been charged" — IS GONE, and so, in round 14,
    // is every later cross-code guard: the cap's re-grade is dropped once the CAP
    // was charged, exactly as any code's is — «Cap adds, never removes».)
    // SPD #39/#48: DISPLAY text only — the FOLLOWING family carries the
    // measured time-gap readout; every other code passes through unchanged.
    // The scored event (scoredEvents/state.events/wire) keeps catalog copy.
    const explanationBg = withSpeedMeasurement(
      e,
      ruleTick,
      withFollowingGapDetail(e, tick, prev.rules.config),
      prev.rules.config,
      raw.kind === "violation" ? raw.signBoundArrival : undefined,
    );
    // …AND THE ONE-LINE VERSION OF IT, for the phone card's body row
    // (`sc-pk-driveway:fa602d10`). Keyed on the ACT (`e.detail`), so the four
    // COLLISION bodies each get their own; `null` for every code with no
    // summary authored, which leaves that card exactly as it was. The measured
    // suffixes above are deliberately NOT folded in: a summary is the WHY, and
    // the readout belongs with the paragraph the sheet prints whole.
    const peekBg = violationPeekBg(e.code, e.detail);
    const step = coachStep(
      encounters,
      {
        code: e.code,
        severityClass: e.severityClass,
        terminateSession: e.terminateSession,
        // THE FIELD `coach.ts` WAS GIVEN AND NEVER FED. `encounterKey` reads
        // `detail` so that two DIFFERENT victims of one crash stop counting as
        // a repeat of each other — but this literal is the production caller,
        // and without this line the whole mechanism is a comment. Measured
        // before adding it: the canonical wrong drive still printed «повторна
        // грешка ×1.5» for a mistake made once.
        detail: e.detail,
        // ADR-009 — «this is one of the mistakes THIS lesson exists to teach».
        // The coach keys its free teach on the TOPIC, so a target whose topic
        // another code had already spent was graded on sight, with points and
        // no card: 64 of the 105 target lessons share a topic between a target
        // and a non-target code (doc 92 §3.4b c). `false` everywhere ADR-009
        // does not apply, which is what keeps exam rungs byte-identical.
        lessonMistakeTarget: lessonTargets?.has(e.code) === true,
      },
      coachOpts,
    );
    encounters = step.encounters;
    if (step.decision.scored) {
      // Graded — QW7 explaining toast, deliberately NON-blocking. This covers
      // every repeat AND every опасна/terminating mistake: a safety event
      // (red light run, collision course, missed yield) must never pop a
      // modal mid-drive — the student may be mid-braking/evasive maneuver,
      // and interrupting the handling would teach the wrong reflex. The
      // pause-card treatment is reserved for first-encounter teach moments.
      hudEvents.push({
        kind: "violation",
        titleBg: e.titleBg,
        explanationBg,
        points: e.points,
        severity: e.severityClass,
        lawRef: e.lawRef,
        ...(peekBg === null ? {} : { peekBg }),
      });
      scoredEvents.push(e);
      // S1 pauseOnError: the scored violation ADDITIONALLY pauses with the
      // teach card (rate-limited like every pause; same-tick moments merge).
      if (pauseOnError) {
        // Round 6 (verifier F5): only a HEAVY pause refuses a charged card —
        // a slot held by lower-class teach cards alone does not (`isLowerClassTeach`).
        const lt = capCard(e.code) ? lastCapTeachAt : lastTeachAt;
        const lh = capCard(e.code) ? lastCapHeavyTeachAt : lastHeavyTeachAt;
        const canPause =
          lt === null ||
          lt === tick.t ||
          tick.t - lt >= TEACH_PAUSE_MIN_GAP_S ||
          lh === null ||
          lh === tick.t ||
          tick.t - lh >= TEACH_PAUSE_MIN_GAP_S;
        if (canPause) {
          notePause({
            code: e.code,
            scenarioId: null,
            titleBg: e.titleBg,
            explanationBg,
            lawRef: e.lawRef,
            severity: e.severityClass,
            points: e.points,
            t: e.t,
            // THIS ARM HAS ALWAYS PAUSED OVER POINTS IT HAD JUST TAKEN, and the
            // card said «Първа среща — не се брои в резултата» anyway. The flag
            // is what lets `lessonMistake.ts teachStakeSegments` say where they
            // went instead; it changes no number here.
            charged: true as const,
            // ADR-009: a CHARGED target is always a genuine repeat (the first
            // occurrence is always taught, §3.4b c), so the card says «Отново».
            // There is deliberately no rate-limit bypass on this arm — a
            // pauseOnError session already pauses on everything it grades.
            ...(lessonTargets?.has(e.code) === true ? { lessonMistake: true as const } : {}),
          });
        }
      }
      if (step.decision.penaltyMultiplier > 1) {
        // Repeat mistake — record the escalation; buildLessonResult folds it
        // into the effective (training) score. Official points stay as-is.
        const rec: PenaltyEscalation = {
          code: e.code,
          t: e.t,
          multiplier: step.decision.penaltyMultiplier,
        };
        escalations = [...escalations, rec];
      }
    } else if (step.decision.mode === "teach") {
      const isTarget = lessonTargets?.has(e.code) === true;
      /**
       * ADR-009 — THE CARD THAT SAYS «урокът няма да се зачете» IS NEVER
       * DOWNGRADED TO A TOAST THE FIRST TIME.
       *
       * A target first-occurrence arriving inside the rate-limit window would
       * otherwise become the silent `kind: "lesson"` toast below, and the
       * student would first learn his lesson did not count on the end screen —
       * a bare verdict arriving minutes after the act, which THEO-4 forbids.
       *
       * ONLY THE SESSION'S FIRST ONE (narrowed in revision 2, doc 92 §1 fix 6).
       * A later target's first occurrence follows today's rate limit, because
       * the student has already been told the lesson will not count and the
       * reason block lists every hit after the drive.
       *
       * READ BEFORE `recordCoached`, DELIBERATELY. The obvious form reads the
       * record afterwards and skips the last row as „this event's own" — which
       * is wrong on the one drive where the cap refuses that row, because then
       * the skipped row is somebody ELSE's target and the bypass fires a second
       * time. Asking the question before the write needs no such correction.
       */
      const firstLessonCard =
        isTarget &&
        !coachedPrev.some((c) => lessonTargets?.has(c.code) === true) &&
        !coachedNew.some((c) => lessonTargets?.has(c.code) === true);
      // Both arms display and neither charges → both are coached (the record
      // the debrief's honesty rests on — see recordCoached above).
      recordCoached(e);
      // First teachable encounter → pause + card, rate-limited: same-tick
      // moments all emit (the shell merges them into ONE pause with queued
      // cards); a moment inside the min-gap window after the previous pause
      // downgrades to the classic lesson toast instead of chaining pauses.
      const lt = capCard(e.code) ? lastCapTeachAt : lastTeachAt;
      const canPause = firstLessonCard || lt === null || lt === tick.t || tick.t - lt >= TEACH_PAUSE_MIN_GAP_S;
      if (canPause) {
        notePause({
          code: e.code,
          scenarioId: step.decision.scenarioId,
          titleBg: e.titleBg,
          explanationBg,
          lawRef: e.lawRef,
          severity: e.severityClass,
          points: e.points,
          t: e.t,
          // ADR-009: read by `lessonMistake.ts teachChipBg / teachSublineBg /
          // teachStakeSegments`, so the card names the stake instead of
          // promising a free first encounter it is not going to be.
          ...(isTarget ? { lessonMistake: true as const } : {}),
        });
      } else {
        // The SAME catalogue row as the violation card, so the same summary
        // (`peekBg` above, keyed on the act). Before `HudEvent`'s `lesson`
        // member could carry one, this downgraded card was the one place the
        // phone printed a coached fault as a clamped paragraph while the billed
        // copy of the same fault printed its line (sc-merge-from-property:
        // 6715b581).
        hudEvents.push({
          kind: "lesson",
          titleBg: e.titleBg,
          explanationBg,
          lawRef: e.lawRef,
          ...(peekBg === null ? {} : { peekBg }),
        });
      }
    } else {
      // Unscored and shown (consequence overlay or ambient toast) → coached.
      recordCoached(e);
      // THEO-3: the targeted wrong action just happened — latch the one-shot
      // consequence moment (the shell pauses on it) and swallow the ambient
      // toast: the consequence overlay presents the same catalog copy.
      if (
        mistakeXp !== undefined &&
        mistakeHitAt === undefined &&
        mistakeXp.codes.includes(e.code)
      ) {
        mistakeHitAt = tick.t;
        mistakeMoment = {
          code: e.code,
          scenarioId: step.decision.scenarioId,
          titleBg: e.titleBg,
          explanationBg,
          lawRef: e.lawRef,
          severity: e.severityClass,
          points: e.points,
          t: e.t,
        };
        continue;
      }
      // learn-only scenarios stay ambient: surfaced as a toast, never scored,
      // never interrupting. Its summary rides with it for the reason given at
      // the teach-downgrade branch above.
      hudEvents.push({
        kind: "lesson",
        titleBg: e.titleBg,
        explanationBg,
        lawRef: e.lawRef,
        ...(peekBg === null ? {} : { peekBg }),
      });
    }
  }

  // A STRUCK PERSON, READ OFF THE LEDGER THIS FRAME ALREADY WROTE
  // (round 10, 2026-08-24 — `objectives.ts vruWaitHonoured` carries the frame
  // and the derivation). `prev.events` is the run's scored ledger and
  // `scoredEvents` is what THIS tick just added — both are needed: a car that
  // reaches the child on the frame it also completes the waypoint must not be
  // certified by a ledger one frame stale. Session-monotone, so it is computed
  // once, here, rather than per objective.
  //
  // FOLDED ABOVE BOTH READERS, and the second one is why (2026-08-25). It feeds
  // the objective context below AND the finish gate further down, because a
  // demand that can no longer be met changes two questions at once: whether the
  // certificate is issued, and whether the drive can still end by itself.
  const struckAPersonInRun =
    prev.events.some(isPersonContact) || scoredEvents.some(isPersonContact);
  // …AND THE SAME LEDGER READ ONE CATEGORY WIDER, for the contact term
  // (`ReachZoneParams.requireNoContact`). Both halves for the same reason as
  // above: a car that strikes the obstacle on the frame it also crosses the
  // waypoint must not be certified by a ledger one frame stale.
  const struckABodyInRun =
    struckAPersonInRun ||
    prev.events.some(isBodyContact) ||
    scoredEvents.some(isBodyContact);
  // …AND THE BARRED RAIL ENTRY, on the same two halves of the same ledger, for
  // `ReachZoneParams.requireRailClear`. The entry and the finish disc are 130 m
  // apart, so the one-frame-stale case cannot arise here — both halves are read
  // anyway, because a channel that is correct only because of a distance is a
  // channel that breaks when a template moves a mark.
  const enteredRailBarredInRun =
    prev.events.some(isBarredRailEntry) || scoredEvents.some(isBarredRailEntry);
  // …AND THE BILLED FAILURES TO GIVE WAY, on the same two halves of the same
  // ledger, for `ReachZoneParams.requireYieldClean`. Both halves for the reason
  // the block above gives: on `sc-signal-flashing` the −10 and the disc are
  // five seconds apart, so a car that is billed on the frame it also crosses
  // the waypoint must not be certified by a ledger one frame stale.
  //
  // NOT A BOOLEAN, unlike its three neighbours: this demand refuses inside a
  // WINDOW, so the evaluator needs the time each fault was billed on and which
  // road user it was about. Folded once here rather than per objective — the
  // ledger is the same for all of them.
  //
  // THE CLEAN FRAME ALLOCATES NOTHING, and on a 60 Hz reducer that is worth the
  // extra line: the overwhelming majority of frames in the corpus carry no
  // yield fault at all, and those pay two `some` scans over a handful of events
  // and return the shared empty array. The build runs only once a fault exists.
  const yieldFaults: readonly YieldFaultRecord[] =
    prev.events.some(isYieldFault) || scoredEvents.some(isYieldFault)
      ? [...prev.events, ...scoredEvents]
          .filter(isYieldFault)
          .map((e) => ({ code: e.code as YieldFaultCode, tSec: e.t }))
      : NO_YIELD_FAULTS;
  // …AND THE Б2 ROLL, on the same terms and for the same reason: a windowed
  // demand needs the SECOND each conviction was billed on, not a boolean. Built
  // exactly like the ledger above — the clean frame pays two `some` scans and
  // returns the shared empty array, and the overwhelming majority of frames in
  // the corpus carry no such fault at all.
  const stopSignRollFaultsSec: readonly number[] =
    prev.events.some(isStopSignRollFault) || scoredEvents.some(isStopSignRollFault)
      ? [...prev.events, ...scoredEvents].filter(isStopSignRollFault).map((e) => e.t)
      : NO_STOP_SIGN_ROLLS;
  // …AND THE CEILING THE ROAD GAVE, EXCEEDED ANYWHERE, for
  // `ReachZoneParams.requireSpeedClean` (objectives.ts carries the two demos:
  // one sheet printing «✓ Стигни края на отсечката, задържал тавана от
  // настилката» over «✗ Превишена скорост», another over «✗ Несъобразена с
  // условията скорост» at 49,9 км/ч in the rain — the exact mistake the plate
  // exists to teach). Both halves of the scored ledger for the reason the four
  // blocks above give, PLUS the shown-but-not-charged half on the ban-zone
  // rest's argument (see `isCoachedSpeedFault`): two of the three codes are
  // второстепенна, so on a training rung the first one is coached rather than
  // billed and a ledger-only read would let this drill's own ❌ demonstrations
  // certify themselves. RUN-WIDE rather than windowed, like the ban-zone rest
  // and the solid line: the banner claims «отсечката» and the copy says «по
  // цялата отсечка», a stretch that straddles the previous objective's
  // completion because the plate gate sits mid-street.
  //
  // …EXCEPT IN A THEO-3 SANDBOX, the same exemption and the same reason as the
  // two coached reads below: in `mistakeExperience` the wrong act IS the
  // assignment, and refusing the student for performing it would be the drill
  // punishing its own instruction. The SCORED halves stay live there because
  // they are empty in that mode.
  const overTheCeilingCoached =
    mistakeXp === undefined &&
    (coachedPrev.some(isCoachedSpeedFault) || coachedNew.some(isCoachedSpeedFault));
  const overTheCeilingInRun =
    prev.events.some(isSpeedFault) || scoredEvents.some(isSpeedFault) || overTheCeilingCoached;
  // …AND THE FULL STOP THE ENGINE WOULD ACCEPT AT A Б2 RIGHT NOW, for
  // `ReachZoneParams.requireFullStop` (objectives.ts carries the sheet: one
  // protocol printing «✓ Спри напълно на Б2 на изхода 1:16» over «✗ Неспиране
  // на знак Б2 „Спри!" −10 изпитни т. ОПАСНА ГРЕШКА»).
  //
  // A POSITIVE FACT AND NOT A LEDGER, unlike its four neighbours above, and the
  // difference is forced by the ORDER the contradiction is printed in: the
  // certificate is issued the moment the car is slow inside the disc, which is
  // metres BEFORE it reaches the paint, so the bill always lands after the tick
  // and no after-the-fact read could ever withdraw it. The tick has to be
  // refused at the moment it would be granted, against the same predicate the
  // line itself will be judged by.
  const fullStopHeld = qualifyingStopCurrent(rules, tick.t);
  // …AND WHETHER THAT STANDSTILL IS THE CAR'S OWN CRASH, for
  // `ObjectiveContext.restIsCrashPinned` (objectives.ts carries the sheet: one
  // protocol printing «✓ Спри преди препятствието — с пълна спирачка» over
  // «Удар в неподвижно превозно средство −10», because the gate's disc reaches
  // past the debris and the wreck came to rest inside it).
  //
  // THE DRIVE'S OWN MACHINERY, ASKED RATHER THAN RE-DERIVED — the same pin
  // `finish.ts CRASH_PIN_STUCK_S` closes a stuck session down with. `crashPin`
  // is armed only by a TERMINATING violation, dropped the moment the car
  // clears `CRASH_PIN_RADIUS_M`, and its `stillSinceSec` is null unless the car
  // is motionless (magnitude-signed since P2, so reversing out of the wreck is
  // not „standing still") and is not lawfully waiting (B15's freeze). So this
  // is true exactly while the car sits in its own crash, and false again the
  // instant he drives out of it.
  //
  // THE PIN FROM `prev`, THE STANDSTILL FROM THIS TICK — and that split is a
  // measurement, not a preference. `crashPin.stillSinceSec` is written BELOW
  // the objective loop, so reading it whole would be one frame stale, and one
  // frame is the entire exposure: a bare halt cap needs no dwell at all, so
  // `capMet` latches on the FIRST motionless frame after the impact, which is
  // exactly the frame `stillSinceSec` is still null on. Measured through
  // `applyTick` on the sc-hz-brake-dont-swerve stream in
  // `halt-credit-names-an-act.test.ts`: pin armed at t = 10.0, `stillSinceSec`
  // = 10.1, and the shipped evaluator banked `capMet: true` + `approachCap:
  // "honoured"` at t = 10.1. The pin's ARMING is not stale (it happens on the
  // collision frame, which is always before the car has stopped), so the pin is
  // read from `prev` and the standstill it is holding is read here, from the
  // tick in hand — the same two questions `engine.ts` asks below, in the same
  // order, with the same magnitude-signed speed test (P2: reverse reads
  // negative, and backing out of a wreck is not standing still).
  const crashPinPrev = prev.crashPin;
  const restIsCrashPinned =
    crashPinPrev !== undefined &&
    Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH &&
    Math.hypot(tick.position.x - crashPinPrev.x, tick.position.y - crashPinPrev.y) <=
      CRASH_PIN_RADIUS_M;
  // …AND THE REST INSIDE THE FORBIDDEN STRETCH, for
  // `ReachZoneParams.requireRestClean` (objectives.ts carries the frame: one
  // debrief printing «✗ Спиране в забранена зона −3 в 1:11» over «✓ Подмини
  // цялата забранена зона, БЕЗ ПРЕСТОЙ В НЕЯ 1:19»). Both halves of the scored
  // ledger for the reason the three blocks above give — a car billed on the
  // frame it also crosses the waypoint must not be certified by a ledger one
  // frame stale.
  //
  // PLUS THE SHOWN-BUT-NOT-CHARGED HALF, which is this fact's own and not a
  // widening of its neighbours': `ILLEGAL_STOP_IN_BAN_ZONE` is основна, so the
  // teach-first coach gives the FIRST one away as a free mini-lesson and records
  // it on `coachedMistakes` rather than `events` (see `isCoachedBanZoneRest`).
  // The student is shown the card and the debrief prints the row, so the
  // contradiction is on his screen either way.
  //
  // …EXCEPT IN A THEO-3 SANDBOX, and that exemption is the point of the mode.
  // `mistakeExperience` sessions run learn-only: the wrong action IS the
  // assignment, nothing scores, nothing terminates, and every raised code lands
  // on the coached channel by design. Reading it there would let a drill whose
  // instruction is „сега спри на забраненото място" refuse the student for
  // doing what he was told. The SCORED halves stay live in that mode because
  // they are empty in it.
  const banZoneRestCoached =
    mistakeXp === undefined &&
    (coachedPrev.some(isCoachedBanZoneRest) || coachedNew.some(isCoachedBanZoneRest));
  const restedInBanZoneInRun =
    prev.events.some(isBanZoneRest) || scoredEvents.some(isBanZoneRest) || banZoneRestCoached;
  const restedOnRailBandInRun =
    prev.events.some(isRailBandRest) || scoredEvents.some(isRailBandRest);
  // …AND THE CROSSING OF A НЕПРЕКЪСНАТА ОСЕВА, for
  // `ReachZoneParams.requireSolidLineClean` (objectives.ts carries the frame:
  // one sheet printing «✓ Премини участъка с непрекъсната линия В СВОЯТА ЛЕНТА
  // 0:45» over a coached «Пресичане на непрекъсната осева линия», with
  // `passed: true`). Both halves of the scored ledger for the reason the four
  // blocks above give, PLUS the shown-but-not-charged half on the same argument
  // as the ban-zone rest one line up — the code is основна, so in every
  // training drive the first crossing lands on the coached channel and the
  // sheet stays empty. The `mistakeExperience` exemption is the same one and
  // for the same reason: in a THEO-3 sandbox the wrong act IS the assignment.
  const solidLineCrossCoached =
    mistakeXp === undefined &&
    (coachedPrev.some(isCoachedSolidLineCross) || coachedNew.some(isCoachedSolidLineCross));
  const crossedSolidLineInRun =
    prev.events.some(isSolidLineCross) ||
    scoredEvents.some(isSolidLineCross) ||
    solidLineCrossCoached;
  // …AND THE PUNISHING BRAKE, for `ReachZoneParams.requireBrakingClean`
  // (lessons/types.ts carries the frame: one sheet printing «✓ Успокой темпото»
  // and «Урокът е издържан» over a coached «Рязко спиране без причина», on the
  // drill's OWN ❌ demonstration of the mistake it exists to prevent). Both
  // halves of the scored ledger for the reason the blocks above give, PLUS the
  // shown-but-not-charged half on the same argument as the solid line one
  // screen up — the code is основна, so in every training drive the first slam
  // lands on the coached channel and the sheet stays empty. The
  // `mistakeExperience` exemption is the same one and for the same reason: in a
  // THEO-3 sandbox the wrong act IS the assignment.
  const harshBrakeCoached =
    mistakeXp === undefined &&
    (coachedPrev.some(isCoachedHarshBrakeNoCause) ||
      coachedNew.some(isCoachedHarshBrakeNoCause));
  const harshBrakeNoCauseInRun =
    prev.events.some(isHarshBrakeNoCause) ||
    scoredEvents.some(isHarshBrakeNoCause) ||
    harshBrakeCoached;
  // …AND THE DEAD STOP, the second half of the same demand
  // (`sc-follow-tailgater:63c0c28c`). Both channels for the reason the block
  // above gives, and the `mistakeExperience` exemption is the same one: in a
  // THEO-3 sandbox the wrong act IS the assignment.
  const needlessStopCoached =
    mistakeXp === undefined &&
    (coachedPrev.some(isCoachedNeedlessStop) || coachedNew.some(isCoachedNeedlessStop));
  const stoppedWithoutCauseInRun =
    prev.events.some(isNeedlessStop) ||
    scoredEvents.some(isNeedlessStop) ||
    needlessStopCoached;
  // …AND THE FREEZE ON GREEN, for `ReachZoneParams.requireGreenStartClean`
  // (lessons/types.ts carries the frame: one sheet printing «✓ Премини правó
  // напред на зелено, БЕЗ ДА ЗАМРЪЗВАШ» and «Урокът е издържан» over the
  // drill's OWN ❌ demonstration of the freeze). Both halves of the scored
  // ledger for the reason the blocks above give, PLUS the shown-but-not-charged
  // half, which is the only half there IS at the aided rungs: the code is
  // второстепенна and the demonstration freezes exactly once, so at L1 the
  // sheet reads «Общо 0» while the coach holds the card. The
  // `mistakeExperience` exemption is the same one and for the same reason: in a
  // THEO-3 sandbox the wrong act IS the assignment.
  const hesitationCoached =
    mistakeXp === undefined &&
    (coachedPrev.some(isCoachedHesitationAtGreen) ||
      coachedNew.some(isCoachedHesitationAtGreen));
  const hesitatedAtGreenInRun =
    prev.events.some(isHesitationAtGreen) ||
    scoredEvents.some(isHesitationAtGreen) ||
    hesitationCoached;

  let objectives = prev.objectives;
  let evalStates = prev.evalStates;
  let currentIndex = prev.currentObjectiveIndex;
  let phase: LessonPhase = prev.phase;
  let endedAtSec = prev.endedAtSec;
  // Round 15 — a capped objective that completed short of its mark on THIS frame (`taskCapMarkWatchOnCompletion`).
  let completedMarkWatch: TaskCapMarkWatch | undefined;
  // THE RUN-OUT (finish.ts). `undefined` = the chain has not finished yet;
  // an object = running out to the mark; `null` = the chain finished on a
  // route that ends nowhere, which terminates on the spot exactly as it always
  // did. Folded after the lawful-wait below, because two of its three exits
  // must not be allowed to spend a second the student is right to be standing
  // still for.
  let runOut: LessonSessionState["routeRunOut"] | null | undefined = prev.routeRunOut;

  // FRAME-ZERO POSE GUARD (doc 87 B3/B10/B11). The chain does not advance
  // until a tick has described the vehicle: motion, or a position other than
  // the one the session opened on. The scene ticks this engine with a
  // placeholder pose at the district ORIGIN for the frames before the chassis
  // publishes (scene/vehicleSample.ts), and four drills author their first
  // waypoint within a car length of that origin — so their first task was
  // credited to a car that was not there. An objective is earned by driving;
  // nothing has been driven yet. See LessonSessionState.posedAtSec.
  let posedAtSec = prev.posedAtSec;
  if (posedAtSec === undefined) {
    const atOrigin = tick.position.x === 0 && tick.position.y === 0;
    if (!atOrigin || Math.abs(tick.speedKmh) > POSE_MOTION_KMH) posedAtSec = tick.t;
  }

  if (prev.phase === "driving" && posedAtSec !== undefined && currentIndex < objectives.length) {
    objectives = [...objectives];
    evalStates = [...evalStates];

    // Advance sequentially: a completing objective activates the next, which
    // may complete on the very same frame (e.g. adjacent zones).
    let guard = objectives.length;
    while (currentIndex < objectives.length && guard-- > 0) {
      const current = objectives[currentIndex];
      // A10 objective context: staged-encounter outcomes recorded so far
      // (applyStagedOutcome) + the run-wide met-reds tally. Rebuilt per
      // iteration — a red met by the objective that just completed must be
      // visible to the next one on the same frame.
      //
      // THE WINDOW `requireYieldClean` REFUSES INSIDE. The chain is strictly
      // sequential, so the moment this objective became the active one is the
      // moment its predecessor completed; the first one has been active since
      // the session began. Recomputed per iteration for the same reason the
      // met-reds tally is — an objective that completed on THIS frame moves the
      // next one's window to THIS frame, and a stale bound would hand the new
      // gate its predecessor's faults.
      //
      // `null` COMPLETION IS „UNKNOWN", NOT „ZERO". A rebuilt or replayed state
      // whose done objective carries no timestamp leaves the field off the
      // context entirely, which leaves the demand MET — widening the window to
      // the whole run instead would turn a missing number into a refusal, and
      // unknown may never become a refusal.
      const activeSince =
        currentIndex === 0 ? 0 : objectives[currentIndex - 1].completedAtSec;
      const ctx: ObjectiveContext = {
        stagedOutcomes: prev.stagedOutcomes ?? [],
        redsMetInRun: countRedsMet(evalStates),
        ...(struckAPersonInRun ? { struckAPersonInRun: true } : {}),
        ...(struckABodyInRun ? { struckABodyInRun: true } : {}),
        ...(enteredRailBarredInRun ? { enteredRailBarredInRun: true } : {}),
        ...(restedInBanZoneInRun ? { restedInBanZoneInRun: true } : {}),
        ...(restedOnRailBandInRun ? { restedOnRailBandInRun: true } : {}),
        ...(crossedSolidLineInRun ? { crossedSolidLineInRun: true } : {}),
        ...(harshBrakeNoCauseInRun ? { harshBrakeNoCauseInRun: true } : {}),
        ...(stoppedWithoutCauseInRun ? { stoppedWithoutCauseInRun: true } : {}),
        ...(hesitatedAtGreenInRun ? { hesitatedAtGreenInRun: true } : {}),
        ...(yieldFaults.length > 0 ? { yieldFaults } : {}),
        ...(overTheCeilingInRun ? { overTheCeilingInRun: true } : {}),
        qualifyingStopCurrent: fullStopHeld,
        ...(stopSignRollFaultsSec.length > 0 ? { stopSignRollFaultsSec } : {}),
        ...(restIsCrashPinned ? { restIsCrashPinned: true } : {}),
        ...(activeSince !== null ? { objectiveActiveSinceSec: activeSince } : {}),
      };
      const before = evalStates[currentIndex];
      const step = stepObjective(current.params, before, tick, ctx);
      evalStates[currentIndex] = step.evalState;
      const notice = objectiveNotice(
        current.spec,
        current.params,
        before,
        step.evalState,
        tick,
        prev.lesson.postedLimitKmh,
        ctx,
      );
      if (notice !== null) hudEvents.push(notice);

      if (!step.done) {
        objectives[currentIndex] = {
          ...current,
          status: "active",
          progress: step.progress,
          ...(step.detail !== undefined ? { detail: step.detail } : {}),
        };
        break;
      }

      objectives[currentIndex] = {
        ...current,
        status: "done",
        progress: 1,
        completedAtSec: tick.t,
        ...(step.detail !== undefined ? { detail: step.detail } : {}),
      };
      hudEvents.push({ kind: "objectiveComplete", titleBg: current.spec.titleBg });
      // Round 15: a capped mark credited SHORT of itself is still decided where the car crosses it.
      const watchHere = taskCapMarkWatchOnCompletion(prev, current.params, step.evalState, currentIndex, tick);
      if (watchHere !== undefined) completedMarkWatch = watchHere;
      currentIndex += 1;
      if (currentIndex < objectives.length) {
        objectives[currentIndex] = { ...objectives[currentIndex], status: "active" };
      }
    }

    // All objectives done => the lesson's TASKS are complete. Where the DRIVE
    // stops is a second question, and it used to be answered by accident: this
    // branch fired on the frame the terminal `reachZone` was entered, i.e. one
    // whole tolerance radius short of the mark the author placed (mean 10.03 m
    // over 674 authored rungs; 17 m on `sc-zebra-approach` L1, whose three
    // committed recordings all stop at y = 113 against a mark at y = 130). See
    // finish.ts „THE RUN-OUT" for the census and for why the low rungs — the
    // forgiving ones — were the ones cut shortest.
    //
    // So: arm the run-out and let him drive to the end. If the route ends
    // nowhere, or he is already at the mark, this is bit-identical to the line
    // it replaces — it terminates below, on this same frame.
    if (currentIndex >= objectives.length && objectives.length > 0) {
      if (runOut === undefined) {
        const mark = routeEndMark(objectives.map((o) => o.params));
        runOut =
          mark === null
            ? null
            : {
                markX: mark.x,
                markY: mark.y,
                fromX: tick.position.x,
                fromY: tick.position.y,
                elapsedSec: 0,
              };
      }
    }
  }

  /*
   * THE BLOW'S OWN FRAME (round 3, verifier R4). The reducer voids the clean-
   * driving window in progress on a latch's first stamped frame — the one AFTER
   * the objective recorded the blow, because the stamp is read off the previous
   * frame's verdict. A window that happened to fall due ON the blow's frame was
   * minted before anyone knew, and it covers the mark crossed over the cap. So
   * on the frame a graded cap is first blown (no stamp yet on this frame, the
   * verdict flipped to „blown" by the evaluation above) a CLEAN_DRIVING minted
   * this frame is withdrawn — from the scored ledger and from the glass — and
   * the next frame's stamp resets the streak. Nothing else on the frame moves.
   */
  if (taskSpeedCap === undefined && scoredEvents.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")) {
    const i0 = prev.currentObjectiveIndex;
    const o0 = prev.objectives[i0];
    const before = prev.evalStates[i0];
    const after = evalStates[i0];
    const cap0 = o0 !== undefined && o0.params.kind === "reachZone" ? o0.params.maxSpeedKmh : undefined;
    const blownThisFrame =
      before !== undefined &&
      after !== undefined &&
      before.type === "reachZone" &&
      after.type === "reachZone" &&
      before.approachCap !== "blown" &&
      after.approachCap === "blown";
    if (
      blownThisFrame &&
      prev.lesson.examMode !== true &&
      prev.phase === "driving" &&
      cap0 !== undefined &&
      shownObjectiveCapKmh(o0.spec, cap0, prev.lesson.postedLimitKmh) < tick.maxSpeedKmh
    ) {
      for (let i = scoredEvents.length - 1; i >= 0; i--) {
        const e = scoredEvents[i];
        if (e.kind !== "commendation" || e.code !== "CLEAN_DRIVING") continue;
        scoredEvents.splice(i, 1);
        const h = hudEvents.findIndex((x) => x.kind === "commendation" && x.titleBg === e.titleBg);
        if (h >= 0) hudEvents.splice(h, 1);
      }
    }
  }

  /*
   * THE Б2 STAR FOLLOWS WHERE THE FULL STOP WAS MADE (sc-merge-from-property:a401e4a7, founder ruling 2026-10-04
   * «Within ~1 m»).
   *
   * `rules/engine.ts` commends FULL_STOP_AT_STOP_SIGN on RECENCY alone — a qualifying full stop within
   * `stopRecencySec` MOVING seconds of the paint, wherever it was made — and that is its documented design: Б2 is stop
   * AND give way, and the wait for a gap must not bill. A gate that authors `requireStopAtLine` asks a narrower
   * question, in the only frame that can answer it: the car centre against the authored mark, inside the line window
   * (`objectives.ts reachZoneInLineWindow`, `FULL_STOP_AT_LINE_M`). On that lesson the two disagreed on one sheet: a
   * full stop ~4 m short, then a roll over the line, printed «★ Правилно спиране на знак Б2 — Спря напълно на
   * стоп-линията…» beside an undone «Спри напълно на Б2 на изхода».
   *
   * WHY HERE AND NOT IN THE RULE ENGINE. It has no mark and no approach axis; a position window there would be a second
   * implementation of «at the line» in a second frame (the tick's `nextStopLineM` is measured to the paint, the gate to
   * its mark 1.3 m behind it), and two implementations of «пълно спиране» is the defect this file keeps removing
   * (`qualifyingStopCurrent`). So the gate's own window and clock are run instead — `stepStopLineWatch`, ONE function
   * with the gate's ✓.
   *
   * THE RULE IS POSITION, NOT CHAIN STATUS (round 3, the w77 judge). Round 2 read the gate's verdict and withdrew the
   * star only where the gate had been the ACTIVE objective and refused the stop — so on a chain stalled before it (the
   * walker task missed, «Спри напълно на Б2 на изхода» pending for the rest of the drive) the identical short stop
   * kept the star, on the sheet that lists the task undone, with nothing to explain either. The gate's status says
   * whether the TASK was being measured; it says nothing about where the car stood. The watch measures that on every
   * frame, whatever the gate is doing, so:
   *   · a full stop made INSIDE the window keeps the star whether the gate is pending, active or done (a lawful stop
   *     at the line on a stalled chain keeps it — verifier Act B);
   *   · a stop SHORT of the window loses it whether the gate is pending, active or done.
   *
   * WHAT IT WITHDRAWS, AND ONLY THAT. A FULL_STOP_AT_STOP_SIGN minted on this frame is dropped — from the scored ledger
   * and from the glass, the CLEAN_DRIVING withdrawal's own mechanics above — when a `requireStopAtLine` gate covers
   * this line (the crossing within its radius plus REACH_ZONE_GRACE_M of its mark, the reach of the capsule the gate
   * measures stops in) and no full stop was made in its window on this visit to the mark. Nothing is BILLED: the rule
   * engine accepted the stop and STOP_SIGN_NO_FULL_STOP is untouched — only the praise goes. A lesson with no such gate
   * has no watch and never enters the loop, so every other stop-sign lesson is byte-identical. A gate whose watch has
   * no entry yet (no posed frame) is not read: unknown is never a refusal.
   *
   * WHAT IT DOES NOT DO: mint. The star is the rule engine's or nobody's. A student who rolls the paint after a short
   * stop, reverses back to the mark, stands there and goes gets the gate's ✓ and no star — the engine's one-act-one-bill
   * latch (`ACT_REVERSE_REOPEN_M`) treats the second crossing as the same act and mints nothing for it, and the one it
   * minted on the first crossing was for the short stop. Where the engine does mint one for the stop at the line (the
   * act re-opened by 20 m of reverse), it is kept.
   */
  const stopLineWatch = posedAtSec !== undefined ? stepStopLineWatch(prev, tick) : prev.stopLineWatch;
  if (
    stopLineWatch !== undefined &&
    scoredEvents.some((e) => e.kind === "commendation" && e.code === "FULL_STOP_AT_STOP_SIGN")
  ) {
    const madeShortOfLine = objectives.some((o, i) => {
      const p = o.params;
      if (p.kind !== "reachZone" || p.requireStopAtLine !== true) return false;
      if (Math.hypot(tick.position.x - p.x, tick.position.y - p.y) > p.radiusM + REACH_ZONE_GRACE_M) return false;
      return stopLineWatch[i]?.stoodAtLine === false;
    });
    if (madeShortOfLine) {
      for (let i = scoredEvents.length - 1; i >= 0; i--) {
        const e = scoredEvents[i];
        if (e.kind !== "commendation" || e.code !== "FULL_STOP_AT_STOP_SIGN") continue;
        scoredEvents.splice(i, 1);
        const h = hudEvents.findIndex((x) => x.kind === "commendation" && x.titleBg === e.titleBg);
        if (h >= 0) hudEvents.splice(h, 1);
      }
    }
  }

  // ROUTE FINISH (founder 2026-07-28 — „стигнах до края, а изпитът не спира"):
  // reaching the end of the route ENDS the drive, driven well or driven badly.
  // Until this gate existed the ONLY route termination was "every objective
  // satisfied", so an objective the student drove past stalled the sequential
  // chain forever: the ribbon pointed back, the drive never ended, and the
  // debrief — the entire teaching payload — was reachable only by re-driving
  // the route CORRECTLY first. A student who must perform perfectly to learn
  // what he did imperfectly quits.
  //
  // B2 (doc 86 §3, 2026-07-30): the gate used to be consulted ONLY while the
  // chain had not yet reached the final objective — i.e. everywhere except the
  // one place with nothing after it to walk to. It is armed on the terminal
  // objective now, but through a DIFFERENT derivation, because the two
  // situations are proven by different evidence:
  //
  //   stalled chain  → routeFinishZone: the car is where the route ends. The
  //                    tasks it skipped are behind it and cannot be redone by
  //                    standing here, so arriving is enough.
  //   stuck terminal → terminalRescueZone: the car is where the route ends AND
  //                    standing completely still for twelve seconds with the
  //                    task still open. Nothing a student legitimately does at
  //                    the end of a route looks like that — an approach moves,
  //                    a creep moves, a park shuffle moves, and a red-light
  //                    wait ends. Using the stalled-chain zone here instead
  //                    would close the exam on a candidate lining up for the
  //                    bay, which is a worse bug than the one being fixed.
  //
  // A healthy run still terminates through the objective branch above,
  // bit-identically — L7 still has to park, L3 still has to come out of the
  // roundabout, a clean exam still ends on its own last objective. Nothing
  // here is graded: `objectives` keep their honest status, so buildLessonResult
  // reports this as finished-and-failed, never as passed.
  //
  // ---------------------------------------------------------------------
  // B-NEW-1 (doc 87:229, 2026-07-30) — „the session ends itself ~40 s after
  // load while the car is parked at spawn, untouched." REPRODUCED, cause
  // found, and it is one missing word in the condition below: `posedAtSec`.
  //
  // The frame-zero pose guard above already knows that the scene ticks this
  // engine with a PLACEHOLDER pose — the district origin at zero speed
  // (scene/vehicleSample.ts `createVehicleSample`) — for the frames before
  // the chassis publishes. That guard was wired to the objective chain only.
  // The finish gates were left reading the placeholder, and one frame of it
  // is all an "outside" gate needs: `rb-mini-v1` puts its ring centre at
  // EXACTLY (0, 0), the placeholder therefore lands inside `armWithinM` = 24
  // and ARMS the leave-the-work-site gate. From the next frame on the car —
  // sitting untouched at its spawn 93 m south — is "away from the ring", the
  // FINISH_LEAVE_S dwell runs uninterrupted, and 20 s later the engine
  // declares the route finished. Add the scene's own load time and that is
  // the founder's ~40 s. Measured in __tests__/route-finish.test.ts: one
  // placeholder frame ⇒ `completed` at t = 20.07 s on sc-roundabout-entry
  // L1 and L3; with the guard, 120 s parked and still driving.
  //
  // The rule is the same one the objective chain already obeys, and it is a
  // rule about driving, not about a glitch: A DRIVE THAT HAS NOT BEGUN
  // CANNOT END. Nothing about a route can be behind you before the first
  // frame that describes where you are. It costs a real drive exactly one
  // frame — every gate below arms and trips from the first honest pose.

  // ---------------------------------------------------------------------
  // B15 — THE LAWFUL WAIT (founder: „I waited about 40 seconds" at the
  // give-way line, and the session ended itself at 20). Folded BEFORE the
  // gates and on every driving frame, because two of its inputs are stateful:
  // the pedestrian latch rides discrete events, and the hold's own clock has
  // to survive frames on which no gate is consulted at all. See finish.ts
  // `stepYieldWait` for what counts as a yield and why each case is there.
  //
  // The pose guard applies here for the same reason it applies to the gates: a
  // drive that has not begun is not waiting for anything.
  let yieldWait = prev.yieldWait;
  let yieldWaitSec = prev.yieldWaitSec;
  if (prev.phase === "driving" && posedAtSec !== undefined) {
    yieldWait = stepYieldWait(prev.yieldWait, tick, {
      params: objectives.map((o) => o.params),
      currentIndex,
    });
    if (yieldWait.holding) {
      // Sim-seconds since the previous frame, clamped: a backgrounded tab can
      // hand this engine a multi-second jump, and inflating the measured wait
      // with time nobody spent waiting would corrupt the par-time line below.
      const dt = Math.min(Math.max(tick.t - prev.lastT, 0), 1);
      yieldWaitSec = (yieldWaitSec ?? 0) + dt;
    }
  }

  // THE RUN-OUT'S THREE EXITS (finish.ts). The tasks are done; this decides
  // where the DRIVE stops. `null` is a route that ends nowhere — it stops here,
  // which is the behaviour this branch always had.
  if (phase === "driving" && runOut !== undefined) {
    if (runOut === null) {
      phase = "completed";
      endedAtSec = tick.t;
    } else {
      const here = { x: tick.position.x, y: tick.position.y };
      const mark = { x: runOut.markX, y: runOut.markY };
      const from = { x: runOut.fromX, y: runOut.fromY };
      // ARRIVED — at the mark, or past it. Checked before the freeze, because
      // getting there is a fact about the road and not about the clock.
      if (routeRunOutArrived(mark, from, here)) {
        phase = "completed";
        endedAtSec = tick.t;
      } else if (yieldWait?.holding === true) {
        // B15's freeze, for the third time in this file and for the third time
        // for the same reason: a student stopped at the very end of the route
        // because a pedestrian is still on the paint is doing the lesson, not
        // finishing it. Neither exit below may spend this second.
      } else if (Math.abs(tick.speedKmh) <= FINISH_STANDSTILL_KMH) {
        // AT REST — every task is done and the car has stopped. Wherever he
        // chose to stop IS the end of his drive; nothing is served by making
        // him roll the last few metres.
        phase = "completed";
        endedAtSec = tick.t;
      } else {
        const dt = Math.min(Math.max(tick.t - prev.lastT, 0), 1);
        const elapsedSec = runOut.elapsedSec + dt;
        runOut = { ...runOut, elapsedSec };
        // SPENT — the backstop. A run-out cannot be long (the car started
        // inside the terminal ring), so this only ever catches a car going
        // nowhere in particular, and it ends the drive rather than holding it.
        if (elapsedSec >= ROUTE_RUNOUT_MAX_S) {
          phase = "completed";
          endedAtSec = tick.t;
        }
      }
    }
  }

  // B15-VOICE (2026-08-05) — REQUIREMENT ZERO AT THE GIVE-WAY LINE.
  //
  // The fold above made the lawful wait SURVIVABLE. It is still SILENT: for
  // the whole minute the student waits correctly, nothing is said on the rule
  // surface, on the card or here on the teach channel, and the first thing the
  // product ever says to him about the priority car is „−10". Doc 64 THEO-4,
  // ratified by the founder, forbids exactly that — every feature must act as
  // a virtual instructor that EXPLAINS EVERY DECISION, and a bare verdict
  // delivered by silence is still a bare verdict. It is also backwards as
  // teaching: the minute he is doing the right thing is the minute an
  // instructor talks.
  //
  // The voice rides the SAME channel the B4/B5/B6 objective notices ride —
  // `lesson` HUD events, the coach's line for what is taught and never billed.
  // Nothing here emits, suppresses or reweights a ScorableEvent; the graded
  // codes are read (to mute a congratulation the same screen is penalising)
  // and never written. And it is folded from the ALREADY-GRADED `ruleEvents`
  // of this very tick, so the mute can never lag the fault it answers to.
  //
  // EXAM SESSIONS ARE EXCLUDED, on the advisor's own distinction rather than a
  // new one: `advisorPromptForSession` opens with the same unconditional
  // `examMode` gate, and for the same reason — telling a candidate who has
  // priority mid-assessment is telling him the answer.
  let yieldVoice = prev.yieldVoice;
  if (!examMode && prev.phase === "driving" && posedAtSec !== undefined && yieldWait !== undefined) {
    const voice = stepYieldVoice(prev.yieldVoice, {
      t: tick.t,
      speedKmh: tick.speedKmh,
      wait: yieldWait,
      violations: scoredEvents.filter((e) => e.kind === "violation").map((e) => e.code),
      // RX-05 (sc-rx-tram-left:07c63b97) — the same lesson-level fact the
      // advisor card reads, so the card and this teach channel cannot say two
      // different things about one wait. Pure copy selection; nothing graded.
      railPriority: lessonYieldsToRailVehicle(prev.lesson),
      // sc-roundabout-entry:8be266cf — WHERE the car is, so the gap verdict can
      // wait for the ring entry it describes («…и влезе») and a conviction can be
      // tied to the site it was billed at (advisor.ts `YieldVoiceSite`). Pure
      // geometry off the route's own objectives; nothing graded reads it.
      site: yieldVoiceSiteAt(objectives, tick.position),
      // Founder ruling 2026-10-05, round 4 — whether the roundabout tracker can
      // still bill the entry he has made, so «Интервалът беше добър» is not
      // said over an entry whose car has yet to reach his mouth. Absent on
      // every frame nothing is waiting on; nothing graded reads it.
      ringEntryOpen: tick.roundaboutEntryOpen,
      // …and whether somebody on the ring has paid for that entry (R4-3: an
      // easing too small to bill is not praised either). Same seam, same rule:
      // absent on almost every frame, and nothing graded reads it.
      ringEntryPaidFor: tick.roundaboutEntryPaidFor,
    });
    yieldVoice = voice.state;
    for (const n of voice.notices) hudEvents.push(n);
  }

  let finishGate = prev.finishGate;
  let finishRescueGate = prev.finishRescueGate;
  let finishDepartureGate = prev.finishDepartureGate;
  let stoppedStuck = false;
  if (
    prev.phase === "driving" &&
    phase === "driving" &&
    posedAtSec !== undefined &&
    objectives.length > 0 &&
    currentIndex < objectives.length
  ) {
    const params = objectives.map((o) => o.params);
    const onTerminal = currentIndex === objectives.length - 1;

    if (yieldWait?.holding === true) {
      // B15 — THE FREEZE. This frame is a student standing still because the
      // road told him to, so it is evidence of nothing and neither gate may
      // spend it. Arming is left alone (it is pure geometry and cannot end a
      // session on its own); the partial dwell is DROPPED, so the seconds he
      // spends waiting can never be credited to a gate the moment the wait
      // ends — the dwell restarts from the first frame he is free to move
      // again. Without that drop, freezing would merely defer the same 20 s
      // verdict to the instant the gap appeared.
      // BOTH ACCUMULATORS TOO, not just the running visit. Each finish face
      // banks the seconds spent on it (types.ts FinishGateState), and a lawful
      // wait must be spendable on neither — clearing only `insideSinceSec`
      // would leave the banked seconds behind and let the freeze be defeated by
      // waiting in two instalments. This is the one line the lane that built
      // the accumulators could not reach: it owned finish.ts and types.ts, and
      // the freeze lives here, so it shipped a single clock with a hole rather
      // than a second field that would escape this drop.
      if (
        finishGate?.insideSinceSec != null ||
        finishGate?.regionDwellSec ||
        finishGate?.strandedDwellSec
      ) {
        finishGate = {
          ...finishGate,
          insideSinceSec: null,
          regionDwellSec: 0,
          strandedDwellSec: 0,
        };
      }
      if (
        finishRescueGate?.insideSinceSec != null ||
        finishRescueGate?.regionDwellSec ||
        finishRescueGate?.strandedDwellSec
      ) {
        finishRescueGate = {
          ...finishRescueGate,
          insideSinceSec: null,
          regionDwellSec: 0,
          strandedDwellSec: 0,
        };
      }
      // O30's gate is in this branch for the same reason the other two are:
      // a student stopped at a red just past the end of the route is doing the
      // lesson, and neither the departure dwell nor its stranded face may
      // spend one second of that wait.
      if (
        finishDepartureGate?.insideSinceSec != null ||
        finishDepartureGate?.regionDwellSec ||
        finishDepartureGate?.strandedDwellSec
      ) {
        finishDepartureGate = {
          ...finishDepartureGate,
          insideSinceSec: null,
          regionDwellSec: 0,
          strandedDwellSec: 0,
        };
      }
    } else {
      // Gate 1 — the stalled chain. Presence-based and generous, and it stays
      // off the terminal objective, where every correct final approach would
      // satisfy it.
      //
      // ── …UNLESS THERE IS NO CORRECT FINAL APPROACH LEFT (2026-08-25) ───────
      //
      // The person-contact refusal above (`objectives.ts vruWaitHonoured`) is
      // session-monotone: once a pedestrian or a cyclist has been struck, a
      // `requireVruUntouched` gate can never complete again. When that gate is
      // the LAST objective, the chain stops advancing, `currentIndex` never
      // reaches `objectives.length`, the run-out is never armed — and the drive
      // no longer ends by itself. Measured through `applyTick` on the same tick
      // stream with one `{kind:"collision", withWhat:"pedestrian"}` as the only
      // difference: CLEAN → `phase: completed`; STRUCK → still `driving` sixty
      // ticks later. The other exits do not cover it — `stepOffNetwork` needs
      // the car off the carriageway, the crash pin needs CRASH_PIN_STUCK_S of
      // standstill against what he hit, gate 2 needs a full standstill AT the
      // mark, and the exam termination needs `examMode`. So a student who ran
      // the child over could reach the protocol that convicts him — the −10
      // «Удар в пешеходец» card and its чл. 48, ал. 3 corrective, which is the
      // entire teaching payload of that lesson — only by quitting, and quitting
      // costs the attempt its XP and its calibration (`aborted`).
      //
      // A REFUSAL MUST NOT DOUBLE AS A TRAP. The reason gate 1 is withheld here
      // is that a correct approach would satisfy it; when the demand is already
      // unsatisfiable that reason has evaporated, and this is the exact case
      // gate 1 was built for — a chain that has stalled with the car at the end
      // of the route. Nothing is graded by it: the objective keeps its honest
      // `active` status and `buildLessonResult` reports finished-and-failed, so
      // the certificate is still refused. Only the strand goes.
      //
      // The same window rule the objective loop applies, re-derived for the
      // index the chain is standing on NOW (the loop may have advanced it).
      // `null` stays „unknown" and leaves the strand exactly where it was.
      const terminalActiveSince =
        currentIndex === 0 ? 0 : objectives[currentIndex - 1].completedAtSec;
      const terminalUnearnable =
        onTerminal &&
        (personContactVoidsObjective(params[currentIndex], struckAPersonInRun) ||
          // The contact term is monotone for exactly the same reason and
          // strands the chain in exactly the same way (`objectives.ts
          // contactVoidsObjective`). Nothing is graded by this: the objective
          // keeps its honest `active` status and the certificate is still
          // refused — only the trap goes.
          contactVoidsObjective(params[currentIndex], struckABodyInRun) ||
          // The barred rail entry is the case where this is not optional: BOTH
          // guarded drills put the gated disc last, so without it the student
          // who drove under the boom could reach the чл. 52 protocol only by
          // quitting (`railBarredVoidsObjective`).
          railBarredVoidsObjective(params[currentIndex], enteredRailBarredInRun) ||
          // The yield term is monotone within its window and BOTH gates that
          // carry it are the last objective of their drill (sc-sflash-cross,
          // sc-sdead-cross — 2 of 2 each), so without this arm the repair that
          // removes the false give-way certificate would replace it with a
          // drive that cannot end. `yieldFailedVoidsObjective` carries the
          // reasoning; the window is recomputed here off the same rule the
          // objective loop uses, because `currentIndex` has moved since.
          yieldFailedVoidsObjective(params[currentIndex], {
            yieldFaults,
            ...(terminalActiveSince !== null
              ? { objectiveActiveSinceSec: terminalActiveSince }
              : {}),
          }) ||
          // The Б2-roll term is monotone within its own window for the same
          // reason, and `deriveFullStopDemand` arms SEVEN gates — several of
          // them the last objective of their drill — so this arm is what stops
          // the repair that removes «✓ Спри напълно на Б2» from a sheet that
          // also prints «✗ Неспиране на знак Б2» from handing back a drive that
          // cannot end. Same window, recomputed here for the same reason.
          stopSignRollVoidsObjective(params[currentIndex], {
            stopSignRollFaultsSec,
            ...(terminalActiveSince !== null
              ? { objectiveActiveSinceSec: terminalActiveSince }
              : {}),
          }) ||
          // The ceiling term (`requireSpeedClean`) is session-monotone like the
          // contact one, and its ONE gate at HEAD — `sc-swp-finish`, the finish
          // of `sc-sp-wet-limit-plate` — is 2 of 2. So this arm is load-bearing
          // rather than defensive: without it the repair that stops the drill
          // certifying a ceiling the student blew through would have replaced a
          // false certificate with a drive that cannot end, and the чл. 21 /
          // чл. 20, ал. 2 cards it exists to teach would be reachable only by
          // quitting.
          speedFaultVoidsObjective(params[currentIndex], overTheCeilingInRun) ||
          // «Спри пред човека» (`requireHaltForVru`) is monotone in exactly the
          // same way. No census member is terminal at HEAD (sc-hzes-stop 2/3,
          // sc-pnu-halt 2/3, sc-mfp-walk-yield first of its chain), so the arm
          // is inert today and `!onTerminal` above already covers every refusal
          // it can make. It is wired anyway, because the yield term one line up
          // is the record of what happens when that assumption is left implicit
          // and a template later moves the claim onto the last rung.
          personHaltVoidsObjective(params[currentIndex], struckAPersonInRun) ||
          // The rest term (`requireRestClean`) is monotone in exactly the same
          // way, and like the arm above it no census member is terminal at HEAD
          // (every one of the eight is 1-of-2, 1-of-3 or 2-of-3 — its docblock
          // lists them), so `!onTerminal` already covers every refusal it can
          // make. Wired anyway for the reason the yield term two lines up is the
          // record of: six of those eight drills end on a «спри на разрешеното
          // място» gate that a later wave could fold into the pass-the-zone one,
          // and that must not reopen the trap silently.
          restFaultVoidsObjective(params[currentIndex], {
            ...(restedInBanZoneInRun ? { restedInBanZoneInRun: true } : {}),
            ...(restedOnRailBandInRun ? { restedOnRailBandInRun: true } : {}),
          }) ||
          // The М1 term (`requireSolidLineClean`) is monotone in the same way —
          // and it is the second arm here where wiring is NOT optional: its one
          // census member, `sc-ovsr-finish`, IS the last objective of its drill
          // (3 of 3). Without this the refusal would strand the chain, the
          // run-out would never arm, and the student who crossed the solid line
          // could reach the card that teaches him М1 only by quitting.
          solidLineFaultVoidsObjective(params[currentIndex], crossedSolidLineInRun) ||
          // The punishing-brake term (`requireBrakingClean`) is monotone in the
          // same way. Its one census member, `sc-ftg-ease`, is 1 of 2, so the
          // arm is inert today and `!onTerminal` already covers every refusal it
          // can make — wired anyway for the reason the yield term above is the
          // standing record of: a later wave that moves the calm-pace claim onto
          // the finish gate must not reopen the trap silently.
          brakingFaultVoidsObjective(params[currentIndex], {
            ...(harshBrakeNoCauseInRun ? { harshBrakeNoCauseInRun: true } : {}),
            ...(stoppedWithoutCauseInRun ? { stoppedWithoutCauseInRun: true } : {}),
          }) ||
          // The freeze-on-green term (`requireGreenStartClean`) is monotone in
          // the same way — and this is the second arm here where wiring is NOT
          // optional: its one census member, `sc-shes-cross`, IS the last
          // objective of its drill (2 of 2). Without this the refusal would
          // strand the chain, the run-out would never arm, and the student who
          // slept through the green could reach the card that teaches him the
          // fault only by quitting.
          greenStartFaultVoidsObjective(params[currentIndex], hesitatedAtGreenInRun));
      if (!onTerminal || terminalUnearnable) {
        const zone = routeFinishZone(params);
        if (zone !== null) {
          finishGate = stepFinishGate(finishGate ?? createFinishGate(), zone, tick);
        }
      }
      // Gate 2 — simply stuck. Runs on EVERY frame regardless of which objective
      // is active, because the state it detects does not care: a car standing
      // completely motionless at the end of the route, for twelve seconds at a
      // waypoint or twenty-five beside a bay, with the route unfinished, is not
      // going anywhere on its own. Gate 1 cannot cover it — on a compact route
      // (a lot where the pull-up pose is 10 m from the bay) its half-distance
      // clamp shrinks the zone below one lane, so a car parked three metres off
      // the end satisfied neither gate and had no way out at all.
      const rescue = terminalRescueZone(params);
      if (rescue !== null) {
        finishRescueGate = stepFinishGate(finishRescueGate ?? createFinishGate(), rescue, tick);
      }
      // Gate 3 — O30, the departure (2026-08-24; finish.ts owns the zone, the
      // dwell derivation and the copy). A car that drove THROUGH the end of
      // the route and kept going satisfies neither gate above: gate 1 is
      // withheld on the terminal objective and gate 2 needs a standstill AT
      // the mark. This one is armed by having BEEN at the end of the route
      // (the acceptance ring floored to one lane) and latches after
      // FINISH_DEPARTED_S beyond it — sized so the recorded
      // overshoot-and-return drive completes 13.7 s before it could fire.
      // Stepped on every frame like gate 2: the stalled-chain case (a car past
      // the end with EARLIER tasks open) is usually gate 1's in 0.5 s, but a
      // route whose gate-1 zone is clamped away has only this ending.
      // ── ARM DISARMED 2026-08-24, BEFORE IT EVER SHIPPED ────────────────────
      //
      // Its own verifier proved a FALSE REFUSAL with a probe drive. The bar is
      // FINISH_DEPARTED_S of dwell inside the departure region, and that dwell
      // accumulates WHILE THE CAR IS DRIVING BACK. A student who pauses and then
      // takes a long return — pause + travel > 75 s — completed before this arm
      // and is refused after it. A false refusal is the crime this programme
      // exists to end, and it does not ship to buy a session-end.
      //
      // Gating the dwell on speed does NOT fix it: a car driving steadily AWAY
      // must still accumulate, or the never-ends defect this arm was built for
      // returns. The honest fix is to accumulate only while the car is NOT
      // CLOSING ON THE MARK — and the finish state carries no previous distance
      // to compare against (types.ts has dwellFace / regionDwellSec /
      // strandedDwellSec and no range). That is a new field on a per-frame path
      // and it must be proved by driving the overshoot-and-return case, which
      // this box could not do at the moment the patch landed.
      //
      // So the arm is DISARMED rather than half-fixed, and every other repair
      // the round earned is kept. Re-enable only together with a test that
      // drives the return and proves the dwell does not accrue while closing.
      //
      // ── AND THE ROW IT WAS CREDITED WITH IS REOPENED — 2026-08-26 ─────────
      //
      // Disarming was the right call and it is not revisited here. What was
      // NOT right is that a repair round counted `sc-park-night:e4e1436a` as
      // closed on this work. With `departure` pinned to null the branch below
      // is unreachable on every frame of every lesson, so `finishDepartureGate`
      // is never written, `routeDepartedEndingCopy` is never pushed, and no
      // student has ever seen the sentence the closure rested on. The
      // dead-predicate census wrote the row back into
      // `.audit-frames/patches/REOPEN.jsonl`.
      //
      // The code stays. It is not dead-by-accident, it is parked with a stated
      // re-enable condition one line above, and deleting it would only make the
      // next lane re-derive the zone and re-discover the false refusal. What
      // changes is the bookkeeping: this closes nothing until the null goes.
      const departure: ReturnType<typeof terminalDepartureZone> = null;
      if (departure !== null) {
        finishDepartureGate = stepFinishGate(
          finishDepartureGate ?? createFinishGate(),
          departure,
          tick,
        );
      }
    }

    stoppedStuck =
      finishGate?.reachedAtSec == null && finishRescueGate?.reachedAtSec != null;
    if (finishGate?.reachedAtSec != null || stoppedStuck) {
      phase = "completed";
      endedAtSec = tick.t;
      // THEO-4: never a bare verdict. Say WHAT stopped the drive and WHY
      // stopping is the right thing here — the debrief then walks every
      // skipped task and every mistake, which is what the student came for.
      // Kept inside the violation catalog's own length band (median 186
      // chars, max 319): this is a HUD toast on a 390 px phone, and the
      // detail belongs in the debrief that opens a second later.
      hudEvents.push({
        kind: "lesson",
        titleBg: examMode ? "Край на изпитния маршрут" : "Край на маршрута",
        explanationBg: examMode
          ? "Стигна края на маршрута, затова изпитът приключва тук. Част от задачите останаха неизпълнени и изпитът не е издържан — разборът показва всяка от тях и всяка допусната грешка."
          : stoppedStuck
            // B2/B3: the car has been standing still at the end of the route
            // with the task open. Say that plainly — the student has been
            // sitting there wondering what the simulator wants, and the honest
            // answer is that it did not register and he is not trapped here.
            ? "Спря в края на маршрута, но задачата тук не се отчете — затова урокът приключва, вместо да те държи на място. Разборът показва какво точно остана неизпълнено и как да го направиш следващия път."
            : "Стигна края на маршрута, затова урокът приключва тук. Част от задачите останаха неизпълнени — разборът показва всяка от тях и всяка грешка, вместо да те връща да караш маршрута отново.",
      });
    }
    // O30's own termination, with its own sentence — never either of the two
    // above, both of which claim an arrival that did not happen (THEO-4 counts
    // a wrong reason as a bare verdict in a costume). The `phase !==
    // "completed"` guard is not decoration: the block above already sets
    // `phase` from `finishGate`/`stoppedStuck`, and a frame on which both
    // latch must not push two ending toasts that contradict each other.
    if (phase !== "completed" && finishDepartureGate?.reachedAtSec != null) {
      phase = "completed";
      endedAtSec = tick.t;
      hudEvents.push(routeDepartedEndingCopy(examMode));
    }
  }

  // ---------------------------------------------------------------------
  // FR-B5-JAM — THE CRASH PIN (finish.ts, see its block for the measurement)
  //
  // A car pressed against what it just hit is stuck in a way NEITHER gate
  // above can see: both are anchored at the END of the route, and the founder's
  // drive was pinned 32 m short of it — throttle held, nothing moving, forty
  // seconds, lesson unfinishable. This is the third gate, anchored on the
  // impact instead of on the route: collision → did not leave the spot → stood
  // completely still for CRASH_PIN_STUCK_S. It grades nothing; the collision
  // keeps its ten points and every unreached objective stays unreached.
  // ---------------------------------------------------------------------
  let crashPin = prev.crashPin;
  {
    const crashed = scoredEvents.some(
      (e) => e.kind === "violation" && e.terminateSession === true,
    );
    // ── P2: THE STANDSTILL TEST WAS UNSIGNED, ALONE IN THIS GATE ─────────────
    // Filed against `finish.ts` CRASH_PIN_STUCK_S on 2026-08-17 and left open
    // as „another lane's file"; this is that lane. The test read
    // `tick.speedKmh > FINISH_STANDSTILL_KMH`, and REVERSE READS NEGATIVE — so
    // a student backing out of what he hit at −20 км/ч scored −20 > 1 = false
    // and was counted as STANDING STILL, banking dwell toward having his lesson
    // closed under him. He was saved only once he cleared CRASH_PIN_RADIUS_M,
    // so the exposure was the first 6 m of the one manoeuvre this gate's own
    // comment promises never to punish („drove away — not stuck, and never
    // closed down"). Every other speed test on the finish side of the wall
    // already compares the MAGNITUDE (`stepYieldWait` finish.ts:1787,
    // `stepFinishGate` finish.ts:1998, both carrying the reason in as many
    // words). This one now does too.
    //
    // ── P3 WAS WRITTEN HERE, MEASURED, AND IS NOT LANDED ─────────────────────
    // `finish.ts:532-545` has asked since 2026-08-16 for the lawful-wait freeze
    // below to be exempted for a pinned car („The fix is one condition in
    // `engine.ts`"), and the obvious spelling of that condition is „the car is
    // off the carriageway", keyed on
    //     Math.abs(tick.laneOffsetM) > prev.rules.config.laneKeepMaxOffsetM
    // It was written, gated and watched RED. IT IS REFUTED IN BOTH DIRECTIONS,
    // and the measurements are here so the next lane does not re-derive them:
    //
    //  1. THE PREDICATE IS NOT CARRIAGEWAY MEMBERSHIP — it is the straddle
    //     test, and its truthy region includes THE MIDDLE OF THE ROAD.
    //     `runtime/locator.ts` CLAMPS the lateral distance before computing the
    //     offset (`d = Math.max(0, Math.min(lanesPerDir * W, d))`, both branches
    //     at locator.ts:278 and :297), so with LANE_WIDTH_M = 3.25 ×
    //     PERCEPTUAL_ROAD_SCALE = 8.125 the largest magnitude the locator can
    //     EMIT is W/2 = 4.0625. Against a bar of 1.3 × 2.5 = 3.25 the whole
    //     truthy band is 0.8125 m wide, and on a two-way street with one lane
    //     per direction it is true BOTH past the outer edge (d > 7.3125) AND for
    //     d < 0.8125 — a car sitting on the осева reads laneOffsetM 4.0625, the
    //     same number as a car pressed into a building. `rules/engine.ts:1748`
    //     names the identical expression `offCentre` and grades
    //     POOR_LANE_KEEPING off it: lane-keeping, not membership.
    //     `scenario/templates-parking.ts:626-632` already wrote this down —
    //     `lot-spawn-approach` reads laneOffsetM 4.06 and „Thirty-one shipped
    //     scenarios do that". Landing the exemption would have closed the drive,
    //     at ten seconds, of every one of those students who took a shunt and
    //     then waited out a give-way line within 26 m. It costs the case it
    //     claims to keep.
    //
    //  2. IT CANNOT FIRE ON THE DRIVES IT WAS DERIVED FROM. The frames are real
    //     — `.audit-frames/w10-4/frames/sc-signal-dead__mobile-right/` books the
    //     collision at 04-t106s.png and photographs «0 км/ч · D» against a wall
    //     at 04-t144s.png and at the last frame (4ef8baf7, ~70 s), and
    //     `w10-2/…/sc-park-gap-short__mobile-right/` is the same shape
    //     (3b981a51) — but their own run.logs show the car MOVING AWAY after the
    //     impact (7 км/ч at 04-t117s, 10 км/ч at t109s) between two zero beats.
    //     CRASH_PIN_RADIUS_M is 6 m; 3 m/s clears it several times over, so
    //     `awayM > CRASH_PIN_RADIUS_M` had already dropped the pin and there was
    //     no pin for a freeze to postpone. Off the network both of the freeze's
    //     inputs go to zero at once anyway: `locator.applyFix(null)` sets
    //     laneOffsetM = 0 (locator.ts:214) and `worldRuntime.ts:1442` gates the
    //     stop-line scan on `fix.edgeIdx >= 0`, so `yieldReasonAt` returns null.
    //     Meanwhile `w10-3/…/sc-park-gap-long__pc-right/` books the same impact,
    //     does NOT move (0 км/ч at 04-t065s and 04-t071s) and ends ~10 s later:
    //     THE PIN FIRES TODAY, UNFROZEN. Nothing in this sweep photographs the
    //     freeze suppressing it. The 52 s of standstill on the cited frames is
    //     the „simply stuck, not at the end of the route" case — which is
    //     `stepOffNetwork`'s 75 s bar below plus the missing IN-FLIGHT „you have
    //     left the road" state (`offNetworkEndingCopy` exists only as an ENDING,
    //     so for 75 s the student is told nothing). That is where 4ef8baf7 lives,
    //     and it stays OPEN.
    //
    //  3. BOTH CITED DRIVES CARRY THE HARNESS'S OWN «NO LANE-POSITION FINDING
    //     MAY BE DRAWN FROM THIS DRIVE» stamp (57 % and 53 % closed-loop,
    //     TRACKING: INTERMITTENT), and laneOffsetM is a lane-position quantity.
    //
    // So the freeze stays UNCONDITIONAL. If the exemption is ever wanted, key it
    // on the impact (`withWhat === "staticObject"` — a car pinned against a
    // building hit a static body, a car rear-ending a queue hit a vehicle) or on
    // `tick.edgeId === null`, and MEASURE it on a drive that shows it first.
    // The two tests below pin both halves of that: the freeze must survive, and
    // it must survive for a car on the centreline.
    const dwellUnspendable =
      yieldWait?.holding === true || Math.abs(tick.speedKmh) > FINISH_STANDSTILL_KMH;
    if (crashed) {
      // Re-arm on every impact: the pose that matters is the LAST one.
      //
      // ── P1: THE RE-ARM USED TO WIPE THE CLOCK WITH THE POSE ────────────────
      // They measure different things. The pose is what „did not leave the
      // spot" is measured FROM; `stillSinceSec` is what „has not moved" is
      // measured WITH, and a fresh REPORT of a car that has not moved is not
      // evidence of movement — movement has its own test, one branch down, and
      // `awayM > CRASH_PIN_RADIUS_M` still drops the pin outright for anyone
      // who genuinely drove off. The exhibit is a stationary pinned car struck
      // by a SECOND body: `rules/engine.ts` keys its contact episodes per body,
      // so that bill is a new violation on frame N, the re-arm reset the ten
      // seconds, and the rescue slid another ten seconds down the road for a
      // car that had already been motionless for nine. (The original filing —
      // 65 re-reports in one 177 s drive — is narrower now than when it was
      // written: the dedupe wave made a reopen need daylight plus 2 m of
      // travel, so a grind no longer re-bills. The wipe was wrong either way.)
      //
      // The same `dwellUnspendable` predicate governs both branches, so a car
      // that IS moving on the frame it re-hits drops the dwell here exactly as
      // it would one branch down. One rule, one spelling.
      //
      // AND THE SAME RADIUS. Inheriting a dwell is only honest while the car is
      // still where it banked it, and speed alone cannot say so across a long
      // frame: the harness measured a worst tick of 3562 ms on the very drive
      // this pin is filed from, and a car can cross metres inside one while both
      // sampled endpoints read 0 км/ч. The non-crash branch below drops the pin
      // outright past CRASH_PIN_RADIUS_M; the re-arm cannot do that (it has a
      // fresh graded impact in hand) so it drops the CLOCK instead — the same
      // evidence, spent the only way this branch can spend it. Conservative by
      // construction: dropping a dwell can only keep a drive running.
      const rearmMovedM =
        crashPin === undefined
          ? 0
          : Math.hypot(tick.position.x - crashPin.x, tick.position.y - crashPin.y);
      crashPin = {
        atSec: tick.t,
        x: tick.position.x,
        y: tick.position.y,
        stillSinceSec:
          dwellUnspendable || rearmMovedM > CRASH_PIN_RADIUS_M
            ? null
            : (crashPin?.stillSinceSec ?? null),
      };
    } else if (crashPin !== undefined) {
      const awayM = Math.hypot(tick.position.x - crashPin.x, tick.position.y - crashPin.y);
      if (awayM > CRASH_PIN_RADIUS_M) {
        crashPin = undefined; // drove away — not stuck, and never closed down
      } else if (dwellUnspendable) {
        // Moving, or lawfully waiting (B15's freeze applies here for the same
        // reason it applies to the other two gates: that second is evidence of
        // nothing). Drop the partial dwell rather than bank it.
        if (crashPin.stillSinceSec !== null) crashPin = { ...crashPin, stillSinceSec: null };
      } else if (crashPin.stillSinceSec === null) {
        crashPin = { ...crashPin, stillSinceSec: tick.t };
      }
    }
  }
  /**
   * O22/O29 — THE CAR IS NO LONGER IN THE AUTHORED WORLD.
   *
   * Folded before the finish gates on purpose: this ending is not anchored on
   * route geometry, so no gate's arming state is involved, and a car off the
   * network cannot be reasoned about by anything that measures distance to a
   * zone. Written back unconditionally, like `crashPin`, because it must be
   * able to return to absent — every frame back on a road resets it, and two
   * separate excursions are two recoveries the student DROVE back from rather
   * than one long strand.
   *
   * `stepOffNetwork` shipped built and tested and folded by NOTHING, because
   * the lane that wrote it owned `finish.ts` and this file was not its to
   * touch. That is the same routing debt that produced the straddle regression
   * one round earlier; this is the edit that spends it.
   */
  const offNet = stepOffNetwork(prev.offNetworkSinceSec, tick, posedAtSec !== undefined);
  if (phase === "driving" && prev.phase === "driving" && offNet.ended) {
    phase = "completed";
    endedAtSec = tick.t;
    // THEO-4: never a bare verdict, and never borrowed copy. Both endings this
    // file could already speak say «край на маршрута», which is exactly what
    // has NOT happened here — telling a student he reached the end of a route
    // he drove off is the false sentence this ending exists to avoid.
    hudEvents.push(offNetworkEndingCopy(examMode));
  }
  if (
    phase === "driving" &&
    prev.phase === "driving" &&
    posedAtSec !== undefined &&
    crashPin?.stillSinceSec != null &&
    tick.t - crashPin.stillSinceSec >= CRASH_PIN_STUCK_S
  ) {
    phase = "completed";
    endedAtSec = tick.t;
    // THEO-4: never a bare verdict. Name what happened, say why the drive is
    // being closed rather than left running, and hand him to the debrief —
    // where the collision's own explanation and corrective already live.
    hudEvents.push({
      kind: "lesson",
      titleBg: examMode ? "Край на изпита след удара" : "Край на упражнението след удара",
      explanationBg: examMode
        ? "След удара колата остана притисната на място и маршрутът не може да продължи, затова изпитът приключва тук. Разборът показва удара, всяка останала задача и какво трябваше да се направи преди него."
        : "След удара колата остана притисната на място и не може да продължи по маршрута — затова урокът приключва тук, вместо да те държи блокиран. Разборът показва как се стига до такъв удар и какво го предотвратява: по-ранно намаляване и достатъчна дистанция до всичко неподвижно напред.",
    });
  }

  // A13: exam sessions TERMINATE the moment the official limits are crossed
  // (any опасна / collision / > 9 total / > 6 from основни) — the fold runs
  // only on frames that scored a violation, and it wins over a same-frame
  // route completion (a route finished ON the tripping mistake is still a
  // terminated exam). Training lessons keep driving (rules/scoring.ts).
  let examTermination = prev.examTermination;
  if (
    examMode &&
    examTermination === undefined &&
    scoredEvents.some((e) => e.kind === "violation")
  ) {
    const trip = examTerminationFor([...prev.events, ...scoredEvents]);
    if (trip !== null) {
      examTermination = trip;
      phase = "completed";
      endedAtSec = tick.t;
    }
  }

  /**
   * THE LAST TICK IS THE LAST MOMENT ANYTHING CAN ASK — the withheld speeding
   * charge, settled on the frame the drive ends (finding
   * `sc-signal-flashing:0d68b149`). The measurement and the A12 argument are
   * `rules/engine.ts settleUnpaidSpeedingTeach`'s; the coaching, the two
   * guards and the reason this is a shared function rather than a block are
   * `settleSpeedingTeach`'s, above. No HUD event: the drive is over on this
   * frame and the column is gone — the debrief's «Грешки» row carries the
   * catalogue's explanation and its «✔ Правилното действие» (THEO-4), and the
   * card was already shown in the moment it happened.
   */
  // `prev.phase !== "completed"` was here to mean "the drive ends on THIS
  // frame, not a later one" — but applyTick opens with
  //     if (prev.phase === "completed" || prev.phase === "aborted") return …
  // so prev.phase is already narrowed to "preDrive" | "driving" everywhere
  // below it. The conjunct could never be false, and TS2367 said so. Dropping
  // it changes no behaviour; the early return is what enforces the intent, and
  // `phase === "completed"` alone is the edge this block wants.
  if (phase === "completed") {
    /**
     * THE BODY OF THIS BLOCK NOW LIVES IN `settleSpeedingTeach` (above), and
     * the move IS the repair rather than a tidy-up: the rule used to exist only
     * here, where `applyTick`'s own early return made it unreachable for any
     * drive the student ended himself. `finishSession` and `abortSession` ask
     * the same function, so the two guards — `alreadyCharged` (the
     * anti-double-bill) and ADR-009's target drop (founder Ruling A; doc 92
     * §3.4b) — are one clause each instead of one clause per ending. The
     * comment this replaces recorded that the target drop "had to be written
     * twice or this path would keep charging the first occurrence of
     * SPEEDING_OVER_LIMIT, which 11 lessons carry as their own mistake"; it is
     * now written once, and a third ending cannot miss it.
     *
     * The call sits HERE, after every arm above that can set `phase` and before
     * the A15 position pass, so a settled bill is placed on the map like any
     * other and the coach's counters stay coherent. `alreadyCharged` is the
     * in-flight closure, so a bill scored earlier on THIS same frame still
     * blocks the settlement.
     */
    const out = settleSpeedingTeach({
      rules,
      // The STAMPED tick: the task ceiling the reducer graded this frame
      // against is what the kin settlement re-checks (round 2, F2).
      tick: ruleTick,
      encounters,
      coachOpts,
      lessonTargets,
      alreadyCharged,
    });
    encounters = out.encounters;
    if (out.scored.length > 0) scoredEvents.push(...out.scored);
    if (out.escalations.length > 0) escalations = [...escalations, ...out.escalations];
    // Round 7: a sign-bound arrival taught on the frame the drive completes.
    for (const c of out.coached) recordCoached(c);
  }

  // A15: record WHERE each scored event happened — the tick in hand at
  // emission time is the only moment the position is knowable, and the rule
  // engine deliberately stays position-free (law, not geometry). Paired back
  // to events by (kind, code, t), same scheme as PenaltyEscalation.
  let eventPositions = prev.eventPositions;
  if (scoredEvents.length > 0) {
    const recs: EventPosition[] = scoredEvents.map((e) => ({
      kind: e.kind,
      code: e.code,
      t: e.t,
      x: tick.position.x,
      y: tick.position.y,
    }));
    eventPositions = [...(eventPositions ?? []), ...recs];
  }

  // What the hand-ended settlement must be able to re-check on `lastTick`: the
  // condition flags while a TAUGHT weather episode is open (round 4, ruling «Yes,
  // same as speeding»). Round 14: the cap's settlement reads only the stamp, so
  // the flags are kept exactly as on the same drive with no cap.
  const weatherRecord = rules.conditionsSpeed.emitted;
  // Round 15: a watch set on this frame replaces the carried one (which was for an earlier objective's mark).
  const nextMarkWatch = completedMarkWatch ?? capStep.watch;

  return {
    state: {
      ...prev,
      rules,
      objectives,
      evalStates,
      currentObjectiveIndex: currentIndex,
      phase,
      endedAtSec,
      // AN ACT NAMED AFTER ITS BILL (`rules/types.ts ActAmendment` — today only
      // the U-turn across a solid axis, which is known when the car has turned
      // round, seconds after the crossing was billed). The row it names is in
      // ONE of the two ledgers — charged here, or coached below — and is
      // re-labelled in place: same code, time, class and points, so nothing is
      // re-priced and nothing is billed twice. `actAmendments` is absent on
      // every frame of every lesson that does not arm the reversal, and both
      // helpers return their input untouched then.
      events: applyActAmendments(
        scoredEvents.length > 0 ? [...prev.events, ...scoredEvents] : prev.events,
        actAmendments,
      ) as ScorableEvent[],
      scenarioEncounters: encounters,
      penaltyEscalations: escalations,
      lastTeachMomentAtSec: lastTeachAt,
      // Round 6 (verifier F5): written on the frame of a HEAVY pause only; a
      // drive that never paused on a charged card or an основна/опасна teach
      // card never carries it.
      ...(lastHeavyTeachAt !== null && lastHeavyTeachAt === tick.t ? { lastHeavyTeachMomentAtSec: lastHeavyTeachAt } : {}),
      // Round 14: the cap's own pause clocks, written on the frame of a cap pause only.
      ...(lastCapTeachAt !== null && lastCapTeachAt === tick.t ? { lastCapTeachMomentAtSec: lastCapTeachAt } : {}),
      ...(lastCapHeavyTeachAt !== null && lastCapHeavyTeachAt === tick.t ? { lastCapHeavyTeachMomentAtSec: lastCapHeavyTeachAt } : {}),
      coachedMistakes: amendCoachedMistakes(
        coachedNew.length > 0 ? [...coachedPrev, ...coachedNew] : coachedPrev,
        actAmendments,
      ),
      lastT: Math.max(prev.lastT, tick.t),
      // THE DRIVE'S LAST TESTIMONY, kept so the endings that carry no tick can
      // still ask it one question (types.ts `lastTick`, and
      // `settleEndedSession` above is its only reader). Written
      // unconditionally — `...prev` cannot express "always the newest" — and
      // never read by anything that grades geometry.
      //
      // THREE FIELDS, NOT THE TICK. Storing it whole put `edgeAlignment`, `sM`
      // and `distM` into session state, and the two `*-not-graded` suites —
      // which prove those fields are not graded by stripping them and asserting
      // the state does not move — went red, correctly. The settlement reads
      // only these three.
      lastTick: {
        t: tick.t,
        speedKmh: tick.speedKmh,
        maxSpeedKmh: tick.maxSpeedKmh,
        position: tick.position,
        // ROUND 2 (F2): what the settlements re-check at a hand ending — the task
        // stamp the reducer graded this frame against (the cap's), and, while a
        // TAUGHT weather episode is open (its first bill emitted), the four
        // condition flags the envelope is derived from, and the bend's advisory
        // while a taught bend episode is open (round 4, founder ruling «Yes, same
        // as speeding»). Round 14: the weather's flags follow the weather alone.
        // A lawful drive, and every drive with no taught weather or bend
        // overspeed running, keeps exactly the four fields base kept.
        ...(weatherRecord && ruleTick.rain === true ? { rain: true } : {}),
        ...(weatherRecord && ruleTick.fog === true ? { fog: true } : {}),
        ...(weatherRecord && ruleTick.snow === true ? { snow: true } : {}),
        ...(weatherRecord && ruleTick.isNight === true ? { isNight: true } : {}),
        ...(rules.curveSpeed.emitted && ruleTick.curveAdvisoryKmh !== undefined
          ? { curveAdvisoryKmh: ruleTick.curveAdvisoryKmh }
          : {}),
        ...(ruleTick.taskSpeedCap !== undefined ? { taskSpeedCap: ruleTick.taskSpeedCap } : {}),
      },
      // ROUND 3 (verifier R1/R2/R4): the task ceiling's latch, and a row per
      // latch that stamped. The latch is written while it lives and once more
      // to CLEAR it (`...prev` cannot express a field going back to absent);
      // a drive that never blows a graded cap writes neither.
      ...(capStep.latch !== undefined || prev.taskCapLatch !== undefined ? { taskCapLatch: capStep.latch } : {}),
      // Round 15: the capped mark a completed objective has yet to cross — set on the completing frame, carried by
      // `stepTaskCapMarkWatch` until it is crossed or left; written only when present or being cleared.
      ...(nextMarkWatch !== undefined || prev.taskCapMarkWatch !== undefined ? { taskCapMarkWatch: nextMarkWatch } : {}),
      // a401e4a7 round 3: where the full stop was made at each `requireStopAtLine` line — only lessons that author one.
      ...(stopLineWatch !== undefined ? { stopLineWatch } : {}),
      ...(capStep.breach !== undefined
        ? { taskCapBreaches: [...(prev.taskCapBreaches ?? []), capStep.breach] }
        : {}),
      ...(posedAtSec !== undefined ? { posedAtSec } : {}),
      ...(eventPositions !== undefined ? { eventPositions } : {}),
      ...(examTermination !== undefined ? { examTermination } : {}),
      ...(finishGate !== undefined ? { finishGate } : {}),
      ...(finishRescueGate !== undefined ? { finishRescueGate } : {}),
      ...(finishDepartureGate !== undefined ? { finishDepartureGate } : {}),
      ...(yieldWait !== undefined ? { yieldWait } : {}),
      ...(yieldWaitSec !== undefined ? { yieldWaitSec } : {}),
      ...(yieldVoice !== undefined ? { yieldVoice } : {}),
      // The run-out's `null` (a route that ends nowhere) is a decision, not a
      // state to carry: it terminated the session on the frame it was taken, so
      // only the live object is ever written back.
      ...(runOut !== undefined && runOut !== null ? { routeRunOut: runOut } : {}),
      // FR-B5-JAM: the one field that must be able to go BACK to absent (the
      // student reversed out and drove away), which the additive spread above
      // cannot express over `...prev` — so it is written unconditionally.
      crashPin,
      // Same reason, same shape: every frame back on a road must clear it, and
      // `...prev` cannot express a field returning to null.
      offNetworkSinceSec: offNet.sinceSec,
      ...(mistakeHitAt !== undefined ? { mistakeExperienceHitAtSec: mistakeHitAt } : {}),
    },
    hudEvents,
    teachMoments: orderTeachMoments(teachMoments),
    ...(mistakeMoment !== undefined ? { mistakeMoment } : {}),
  };
}

// ---------------------------------------------------------------------------
// Staged-encounter outcomes (A8 — additive)
// ---------------------------------------------------------------------------

/**
 * Record one resolved staged encounter on the session (A8). Pure/additive:
 * the GRADED consequences of the encounter arrived through applyTick already
 * (the orchestrator emits only existing SimTick vocabulary) — this
 * accumulates the measurement record (reaction time, stop gap, …) that A10
 * locks objectives to (via ObjectiveContext on the next applyTick — e.g.
 * L5's emergencyStop completes from the l5-braking-lead-car outcome) and
 * the debrief will cite.
 */
export function applyStagedOutcome(
  prev: LessonSessionState,
  outcome: StagedEventOutcome,
): LessonSessionState {
  const stagedOutcomes = [...(prev.stagedOutcomes ?? []), outcome];
  // ── AND THE ROW THE NEW EVIDENCE BELONGS TO (sc-turn-left-oncoming:7974670c)
  // A gate's `detail` is written by the tick that steps it, and `applyTick`
  // steps only the CURRENT objective — so a measurement that arrives after the
  // gate ticks used to be unreachable. On the ONE gate in the catalogue that
  // authors `reportOncomingGapSec` that is not an edge case but the drill's own
  // correct drive: the tight car resolves empty at the commit (it is already
  // past the node) and the follow car — the one holding the ~6 s the student
  // actually judged — resolves about ten seconds later, while he needs about
  // nine to reach the terminal disc. The row therefore froze on «лентата беше
  // чиста», which is what w27's two legs printed at head 85495fd.
  //
  // Report-only, and narrow by construction: `oncomingGapDetail` returns
  // `undefined` for every params shape that authors no norm, so every other
  // objective in the product keeps the object it already had (identity
  // included — the map returns the same row unless a detail actually changes).
  // No status, no `done`, no latch and no score is touched here.
  let objectives = prev.objectives;
  let changed = false;
  const refreshed = objectives.map((o) => {
    const detail = oncomingGapDetail(o.params, stagedOutcomes);
    if (detail === undefined || sameOncomingGapDetail(o.detail, detail)) return o;
    changed = true;
    return { ...o, detail };
  });
  if (changed) objectives = refreshed;
  return { ...prev, stagedOutcomes, objectives };
}

/** Would re-deriving the gap row rewrite it? Keeps `applyStagedOutcome` from
 *  handing back a new objective array on every unrelated encounter. */
function sameOncomingGapDetail(
  prev: ObjectiveDetail | undefined,
  next: ObjectiveDetail,
): boolean {
  if (prev === undefined || prev.kind !== "oncomingGap" || next.kind !== "oncomingGap") {
    return false;
  }
  return (
    prev.acceptedGapSec === next.acceptedGapSec &&
    prev.normSec === next.normSec &&
    prev.ending === next.ending
  );
}

// ---------------------------------------------------------------------------
// Near-miss encounters (A11 stat → A15 mistake map; additive)
// ---------------------------------------------------------------------------

/**
 * Record one resolved near-miss encounter (A15). Pure/additive, mirror of
 * applyStagedOutcome: NOTHING here is graded (a near-miss is deliberately not
 * a ViolationCode — the contact case already grades as COLLISION); this is
 * the measurement channel the end-screen mistake map plots as hollow "мина на
 * косъм" rings. `playerPos` is the shell's last-tick position at resolution —
 * clearance is sub-meter, so it stands in for the encounter location; null
 * (no tick yet) keeps the stat but drops the marker.
 */
export function applyNearMiss(
  prev: LessonSessionState,
  event: NearMissEvent,
  playerPos: { x: number; y: number } | null,
): LessonSessionState {
  const rec: SessionNearMiss = {
    tSec: event.tSec,
    kind: event.kind,
    clearanceM: event.clearanceM,
    relSpeedMps: event.relSpeedMps,
    x: playerPos?.x ?? null,
    y: playerPos?.y ?? null,
  };
  return { ...prev, nearMisses: [...(prev.nearMisses ?? []), rec] };
}

// ---------------------------------------------------------------------------
// Manual endings
// ---------------------------------------------------------------------------

/**
 * End the session deliberately (free drive has no objectives; a student may
 * also park and finish early). Objectives left open simply stay incomplete.
 */
export function finishSession(prev: LessonSessionState, tSec: number): LessonSessionState {
  if (prev.phase === "completed" || prev.phase === "aborted") return prev;
  // …AND THE DRIVE IS OVER, SO THE WITHHELD CHARGE IS ASKED FOR (see
  // `settleEndedSession`). A student who parks and ends early has ended his
  // drive exactly as hard as one whose route ran out, and until this call
  // existed only the second of them was ever settled.
  return settleEndedSession({
    ...prev,
    phase: "completed",
    endedAtSec: tSec,
    lastT: Math.max(prev.lastT, tSec),
  });
}

/** Quit without finishing — the attempt is recorded but can never pass. */
export function abortSession(prev: LessonSessionState, tSec: number): LessonSessionState {
  if (prev.phase === "completed" || prev.phase === "aborted") return prev;
  // Same settlement, same reason, and quitting is not an acquittal either: the
  // attempt is recorded and can never pass, but what it recorded must be true.
  // A drive that quit mid-overspeed used to reach its debrief on «Изпитният
  // лист остана чист».
  return settleEndedSession({
    ...prev,
    phase: "aborted",
    endedAtSec: tSec,
    lastT: Math.max(prev.lastT, tSec),
  });
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------

/**
 * Fold the whole session into the official-style result: score breakdown per
 * severity class, pass/fail per the exam rule, objective outcomes and the
 * lesson verdict (official pass AND route completed AND not aborted).
 */
export function buildLessonResult(state: LessonSessionState): LessonResult {
  const summary = buildSessionSummary(state.events);

  /**
   * …AND THE SAME REFUSAL FROM THE OTHER SIDE OF THE STRIKE — the half the
   * per-frame demand cannot reach (`sc-hz-emergency-stop:42c93d49`, re-judged
   * on the attested w17 re-drive).
   *
   * WHAT IS BROKEN, driven through `applyTick` at HEAD rather than read off a
   * summary. `sc-hz-emergency-stop` L3, the authored halt disc `{x:4.06,
   * y:146, radiusM:4, maxSpeedKmh:6}`: brake to rest on the mark, hold it,
   * then move off into the child eight seconds later. One `LessonResult`:
   *
   *   ✓ Спри преди детето — с пълна спирачка, в лентата        0:11
   *   Грешки  ✗ Удар в пешеходец  (COLLISION · pedestrian)     0:21
   *
   * — the sheet the founder photographed, with the tick at 1:28 and the strike
   * at 1:36. `requireHaltForVru` and `requireVruUntouched` both declare
   * themselves SESSION-MONOTONE («a struck person is session-monotone by
   * construction, so the gate is closed for good» — objectives.ts), but they
   * are read inside `stepReachZone`, and the engine never re-steps a completed
   * objective. So the demand covers only the ordering where the strike is
   * already on the ledger when the disc is crossed, and the w13 frames it was
   * cut from happen to be that ordering. Its own docblock says so in as many
   * words: „a strike that comes afterwards cannot touch it".
   *
   * TWO ORDERINGS OF ONE DRIVE MAY NOT GRADE DIFFERENTLY. That docblock also
   * answers the objection that used to keep this title out of the census — „the
   * certificate was true when issued … the strike came on the move-off" — with
   * the right answer: the ordering is A FACT ABOUT ONE RECORDED DRIVE AND NOT A
   * PROPERTY OF THE DRILL. Today a student who hits the child one frame BEFORE
   * the disc loses the tick and finishes on 1★, and one who hits her eight
   * seconds AFTER keeps it and finishes on ★★ (`scenario/rubric.ts` — stars
   * fall out of `completedAll`). Same drill, same child, same −10; the star
   * decided by which side of the mark the collision landed on. That is the
   * inconsistency this closes, and it closes it in the ONE place that sees the
   * whole run at once.
   *
   * IN THE FOLD, NOT IN THE LOOP — deliberately, and it is the whole safety of
   * the change. Demoting the objective mid-drive would move `currentIndex`
   * backwards and strand the chain: the run-out would never arm and the student
   * who ran the child down could reach the −10 «Удар в пешеходец» card that
   * teaches him чл. 48, ал. 3 only by quitting. That trap is exactly what
   * `personContactVoidsObjective` and the `terminalUnearnable` arm above were
   * written to avoid, and this must not re-introduce it one lane over. The
   * chain still advanced when it advanced; only the CERTIFICATE is withdrawn,
   * at the moment the sheet is written.
   *
   * IT CANNOT COST ANYONE A PASS, the same guarantee the per-frame demand
   * carries: `COLLISION` with a person is опасна and terminating (Наредба № 38,
   * ЗДвП чл. 48, ал. 3), so `summary.passed` is already false on every drive
   * this can touch — measured on the repro above, `{passed:false,
   * summary.passed:false}` before and after. What it removes is the
   * CONTRADICTION between two halves of one sheet, never a verdict.
   *
   * AND IT IS NOT A BARE VERDICT (THEO-4) for the reason objectives.ts states
   * for the prospective half: the same sheet is holding the −10 «Удар в
   * пешеходец» card with its catalogue explanation, its «✔ Правилното
   * действие» corrective and its law refs, and «Разбор» repeats all three. The
   * one sentence still missing is the row's OWN — «спря, и след това потегли
   * срещу нея» — and it cannot be written from here: `ObjectiveDetail` is a
   * closed union in lessons/types.ts and `objectiveDetailText` lives in
   * hud/SessionEndScreen.tsx. Reported to the integrator rather than reached
   * for. The A10 measurement that IS already there rides through untouched:
   * «Реакция: 0.68 с — отличен» beside a withdrawn tick is the true and useful
   * split — the reflex was good, the drive still ended on the child.
   *
   * ONLY THE TWO PERSON DEMANDS. `requireNoContact` is wider (a vehicle or a
   * static obstacle is a body, and a drill may forbid touching one without
   * making any claim about a human being let through) and `requireYieldClean`
   * is WINDOWED — a student who barged the first junction and gave way properly
   * at the second told the truth about the second, and a run-wide read here
   * would call him a liar. Both keep their per-frame semantics exactly as
   * shipped.
   *
   * A DRIVE THAT HITS NOBODY IS BIT-IDENTICAL TO SHIPPED: `struckAPerson` is
   * false, both predicates short-circuit on their own first conjunct, and every
   * field below is the expression it was.
   */
  const struckAPerson = state.events.some(isPersonContact);

  const objectives: ObjectiveOutcome[] = state.objectives.map((o) => {
    const revoked =
      personHaltVoidsObjective(o.params, struckAPerson) ||
      personContactVoidsObjective(o.params, struckAPerson);
    return {
      id: o.spec.id,
      titleBg: o.spec.titleBg,
      done: o.status === "done" && !revoked,
      // The clock is the certificate's other half — «✓ … 1:28» is one claim,
      // not two — so a withdrawn tick may not leave its timestamp standing.
      // `SessionEndScreen` only prints it under `o.done` today, and `wire.ts
      // reconcileObjectiveOutcomes` already nulls it on `!done`; this keeps the
      // three surfaces saying one thing instead of relying on two of them to
      // hide the third's leftover.
      completedAtSec: revoked ? null : o.completedAtSec,
      ...(o.detail !== undefined ? { detail: o.detail } : {}),
    };
  });

  const completedAll = objectives.every((o) => o.done);
  const aborted = state.phase === "aborted";

  /**
   * A9: fold the coach's repeat escalations into the training-layer score. The
   * official verdict below stays on official base points (see escalation.ts's
   * header for the rationale).
   *
   * OVER THE ROWS THE LEDGER CHARGED, AND NO OTHERS — and that filter is NOT
   * applied here. `foldTrainingScore` applies it, `wire.ts gradeFinishWire`
   * calls the same function, and that is the entire fix: this file and that one
   * each owned a copy, they were repaired in separate lanes, and in between
   * them the server's sheet — the one the student reads — printed a
   * «Тренировъчен резултат» the client never computed. escalation.ts's header
   * carries the drive and the numbers.
   */
  const { effectiveTotalPoints, escalated } = foldTrainingScore(
    summary.mistakes,
    state.penaltyEscalations,
  );

  /**
   * ADR-009 (founder Ruling A) — IN THE FOLD, NOT IN THE LOOP.
   *
   * It READS both records and writes neither: no event is added, no point is
   * moved, no escalation is pushed. Everything ADR-009 withholds was withheld
   * upstream by the two coach inputs (`applyTick`'s regrade guard and the
   * own-code teach key); this is only where the two records are read back and
   * turned into the verdict.
   *
   * THE SAME CALL RUNS ON THE SERVER, in `wire.ts gradeFinishWire`, and that is
   * the whole reason `lessonMistake.ts` exists as a module: `LessonPlayShell`
   * renders the SERVER's debrief whenever the save succeeds, so a second
   * implementation here would not be a second opinion — it would be a stored
   * verdict that disagrees with the screen that produced it. `escalation.ts`'s
   * header carries the drive where exactly that shipped.
   */
  const lessonMistakes = foldLessonMistakes(
    state.lesson,
    state.events,
    state.coachedMistakes ?? [],
  );

  return {
    lessonId: state.lesson.id,
    summary,
    objectives,
    completedAll,
    aborted,
    // ADR-009: a practice lesson whose own mistake was committed is NOT taken,
    // even on the first occurrence and even though the изпитен лист took no
    // points for it. `lessonMistakes` is empty on every exam rung, every
    // sandbox and every lesson with no targets, so this conjunct is inert
    // wherever the ruling does not reach.
    passed: summary.passed && completedAll && !aborted && lessonMistakes.length === 0,
    score: summary.score.totalPoints,
    effectiveScore: effectiveTotalPoints,
    escalations: escalated,
    durationSec: state.endedAtSec ?? state.lastT,
    // B15: of that duration, the seconds spent lawfully stationary at a yield.
    // Carried so the rubric's par-time line can stop calling a correct wait
    // slowness; it never reaches a point, a star or the verdict.
    ...(state.yieldWaitSec !== undefined ? { yieldWaitSec: state.yieldWaitSec } : {}),
    // A15: the mistake-map channels ride into the result untouched.
    ...(state.eventPositions !== undefined ? { eventPositions: state.eventPositions } : {}),
    ...(state.nearMisses !== undefined ? { nearMisses: state.nearMisses } : {}),
    // A13: the exam-termination record (examMode sessions only).
    ...(state.examTermination !== undefined ? { examTermination: state.examTermination } : {}),
    // The shown-but-not-charged record — the debrief's coached channel finally
    // has a producer (see LessonSessionState.coachedMistakes). `?? []` for the
    // same fixture reason recordCoached states.
    ...((state.coachedMistakes ?? []).length > 0
      ? { coachedMistakes: state.coachedMistakes }
      : {}),
    // ADR-009: absent, not empty, on a drive with no hit — so a stored row from
    // before this ADR and a clean drive after it are the same shape, and no
    // surface has to tell «[]» from «never measured».
    ...(lessonMistakes.length > 0 ? { lessonMistakes } : {}),
    // Round 3 of the task-cap ruling (verifier R4): the caps this drive blew
    // and was graded for — the debrief's evidence against unscoped praise.
    // Absent when none, the same shape rule.
    ...((state.taskCapBreaches ?? []).length > 0 ? { taskCapBreaches: state.taskCapBreaches } : {}),
  };
}

/**
 * THE COACHED HALF OF `rules/catalog.ts applyActAmendments`.
 *
 * Under ADR-009 a lesson's own mistake is never charged the first time, so the
 * only record of it is a `CoachedMistake` row — and that is the row an act
 * known after the bill has to name (the U-turn across a solid axis at L1–L3 and
 * L5: taught at the crossing with the crossing's card, named when the car has
 * turned round). Same rule as the charged ledger: the row with the amendment's
 * code and time whose act is still open (none yet, or a provisional one —
 * `rules/catalog.ts actIsOpen`) gets the act and the act's title; a row that
 * is not there is left alone; the same array comes back when nothing matched.
 */
function amendCoachedMistakes(
  rows: CoachedMistake[],
  amendments: readonly ActAmendment[] | undefined,
): CoachedMistake[] {
  if (amendments === undefined || amendments.length === 0) return rows;
  let out: CoachedMistake[] | null = null;
  for (const a of amendments) {
    const src = out ?? rows;
    const i = src.findIndex(
      (c) => c.code === a.code && c.t === a.billT && actIsOpen(c.code as ViolationCode, c.detail),
    );
    if (i < 0) continue;
    const act = actCopy(a.code as ViolationCode, a.detail);
    out ??= [...rows];
    out[i] = { ...src[i], detail: a.detail, ...(act !== null ? { titleBg: act.titleBg } : {}) };
  }
  return out ?? rows;
}
