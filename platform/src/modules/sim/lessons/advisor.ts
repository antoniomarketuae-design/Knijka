/**
 * „Съветник" (advisor) — pure next-action prompts for the drill HUD (founder
 * ask 2026-07-17: „show the user what he has to do — press button for lights,
 * left/right мигач — with a button that can activate this advisor and stop
 * it"). State → { textBg, keys[] } | null; the AdvisorCard component only
 * renders the result.
 *
 * HONESTY RULES (the performedSteps.ts discipline):
 *  - pre-drive prompts reuse PRE_DRIVE_STEP_CONTROLS — a prompt may only
 *    promise a key that really performs the step;
 *  - driving prompts derive from the ACTIVE objective's typed params (and,
 *    where it sharpens the hint, the objective's live eval state — e.g. the
 *    roundabout's entered → „exit with right indicator" phase). Where no
 *    clean control mapping exists the prompt falls back to the objective's
 *    own authored titleBg — the advisor NEVER invents instructions (ADR-002:
 *    authored copy only, no free-form guidance).
 *
 * Exam sessions get null unconditionally: the advisor is a training aid, not
 * part of the car (unlike the status dashboard, which stays up on exams).
 */

import type { LessonSpec } from "../contracts";
import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEP_ORDER,
  type PreDriveStepId,
} from "../procedures";
import type { SimTick } from "../rules";
import { parseScenarioLessonId } from "./scenario";
import type { LessonSessionState, ObjectiveEvalState, ObjectiveParams } from "./types";

// ---------------------------------------------------------------------------
// Setting (persisted client-side; parsing kept pure and testable here)
// ---------------------------------------------------------------------------

/** localStorage key of the persisted advisor toggle. */
export const ADVISOR_STORAGE_KEY = "aidrive.sim.advisor.v1";

/** Highest difficulty rung the advisor defaults ON for (beginner levels). */
export const ADVISOR_DEFAULT_ON_MAX_LEVEL = 2;

/**
 * Default advisor state for a lesson when the student never chose: ON for
 * the beginner rungs (scenario levels 1–2, curriculum orders ≤ 2 — L0/L1/L2
 * and the полигон slots between them), OFF from level 3 up (the training
 * wheels come off), and always OFF/inert on exam sessions.
 */
export function defaultAdvisorEnabled(lesson: LessonSpec): boolean {
  if (lesson.examMode === true) return false;
  const scenario = parseScenarioLessonId(lesson.id);
  const level = scenario !== null ? scenario.level : lesson.order;
  return level <= ADVISOR_DEFAULT_ON_MAX_LEVEL;
}

/** Parse the persisted setting; null = nothing stored / foreign value. */
export function parseStoredAdvisorSetting(v: unknown): boolean | null {
  if (v === "on") return true;
  if (v === "off") return false;
  return null;
}

/** Wire format of the persisted setting (round-trips parseStoredAdvisorSetting). */
export function serializeAdvisorSetting(on: boolean): "on" | "off" {
  return on ? "on" : "off";
}

// ---------------------------------------------------------------------------
// Prompt derivation
// ---------------------------------------------------------------------------

export interface AdvisorPrompt {
  textBg: string;
  /** Key caps to render as <kbd> chips; [] = no keyboard action (info steps). */
  keys: string[];
}

/**
 * Short imperative action per pre-drive step (the checklist's titleBg is a
 * noun phrase; the advisor speaks in commands). Info steps (no real control
 * yet — performedSteps.ts) point at the read-only checklist's confirm button.
 *
 * MOUSE-FIRST (founder 2026-07-30, ledger 86 D9): the sentence now names the
 * gesture on the CONTROL — „щракни стартера", not „press I". The key caps
 * still ride along in `keys` (AdvisorCard renders them as small chips), so
 * nothing is taken away; the keyboard simply stopped being the instruction.
 * „Огледай трите огледала — задръж Q, E и F" was the worst offender: it spelt
 * three key names inside the sentence itself.
 */
const PRE_DRIVE_ACTION_TEXT_BG: Record<PreDriveStepId, string> = {
  "adjust-seat": "Нагласи седалката и потвърди в списъка вляво",
  "adjust-mirrors": "Задръж с мишката трите огледала в кабината",
  "check-surroundings": "Огледай се около колата и потвърди в списъка вляво",
  "fasten-seatbelt": "Щракни предпазния колан до седалката",
  "check-dashboard": "Провери таблото и потвърди в списъка вляво",
  "headlights-on": "Щракни ключа за светлините на таблото",
  "start-engine": "Щракни стартера на конзолата",
  "press-brake": "Натисни спирачния педал и задръж",
  "select-gear": "Щракни скоростния лост към D",
  "release-handbrake": "Щракни ключа на ръчната спирачка",
  "final-mirror-check": "Задръж лявото и вътрешното огледало преди потегляне",
  signal: "Щракни лоста за мигачи наляво",
  "move-off": "Потегли плавно с газта",
};

/** Prompt for one pending pre-drive step (keys from the honest control map). */
export function advisorPromptForPreDriveStep(stepId: PreDriveStepId): AdvisorPrompt {
  const keys = PRE_DRIVE_STEP_CONTROLS[stepId]?.keys.split(" ") ?? [];
  return { textBg: PRE_DRIVE_ACTION_TEXT_BG[stepId], keys };
}

/**
 * Prompt for the ACTIVE driving objective. `evalState` (when the caller has
 * it) sharpens phase-dependent maneuvers — currently the roundabout, whose
 * exit-indicator hint only makes sense once the ring has been entered.
 */
export function advisorPromptForObjective(
  titleBg: string,
  params: ObjectiveParams,
  evalState?: ObjectiveEvalState,
): AdvisorPrompt {
  switch (params.kind) {
    case "reachZone":
      // Speed-capped zones: the cap is the coachable part (approach discipline).
      return params.maxSpeedKmh !== undefined
        ? { textBg: `${titleBg} — дръж под ${params.maxSpeedKmh} км/ч`, keys: [] }
        : { textBg: titleBg, keys: [] };

    case "passSignal":
      if (params.control === "stopSign") {
        return { textBg: "Спри напълно на стоп-линията при знака „Стоп“", keys: ["S"] };
      }
      if (params.requireRedMet === true) {
        // The drilled sequence the gate certifies (objectives.ts): stop at
        // the line, wait the red out, cross on green.
        return { textBg: "Спри на стоп-линията на светофара и изчакай зелено", keys: ["S"] };
      }
      return { textBg: titleBg, keys: [] };

    case "driveDistance":
      return { textBg: titleBg, keys: ["W"] };

    case "completeManeuver":
      switch (params.maneuver) {
        case "smoothStop":
          return {
            textBg: "Спри плавно — отпусни газта рано и натискай спирачката леко",
            keys: ["S"],
          };
        case "emergencyStop":
          // Stimulus-locked (A10) — the objective's own title carries the
          // instruction; the key chip names the brake.
          return { textBg: titleBg, keys: ["S"] };
        case "parkInBay":
          // A1 (founder, doc 87): „push the R reverse gear … although we are
          // on automatic mode". The PROMPT is right — the sim's automatic is a
          // real P-R-N-D selector and a reverse park needs R — but „включи
          // задна предавка" is gearbox-and-clutch language a learner reads as
          // „shift down into reverse". An instructor sitting beside an
          // automatic says what the hand does: move the lever to R. The chip
          // still names the key that really moves it (advisor honesty rule).
          return params.entry === "forward"
            ? { textBg: "Остави лоста на D — влез напред в клетката и спри напълно", keys: ["]"] }
            : { textBg: "Премести лоста на R и паркирай на заден ход в клетката", keys: ["["] };
        case "roundabout": {
          const entered = evalState?.type === "roundabout" && evalState.entered;
          return entered
            ? { textBg: "Излез от кръговото с десен мигач", keys: ["."] }
            : { textBg: titleBg, keys: [] };
        }
        case "threePointTurn":
          return { textBg: titleBg, keys: ["["] };
      }
  }
}

/**
 * The advisor's single entry point: the NEXT expected action for a live
 * session, or null when there is nothing to advise (exam mode, ended
 * session, free drive / all objectives done).
 */
export function advisorPromptForSession(s: LessonSessionState): AdvisorPrompt | null {
  if (s.lesson.examMode === true) return null;

  if (s.phase === "preDrive") {
    const machine = s.preDrive;
    if (machine === null) return null;
    // Canonical next pending step — the same derivation the checklist and
    // the practice-idle hints use (PreDriveChecklist / LessonPlayShell).
    const next = PRE_DRIVE_STEP_ORDER.find((id) => !machine.completedStepIds.includes(id));
    return next === undefined ? null : advisorPromptForPreDriveStep(next);
  }

  if (s.phase !== "driving") return null;
  if (s.currentObjectiveIndex >= s.objectives.length) return null;
  const active = s.objectives[s.currentObjectiveIndex];
  return advisorPromptForObjective(
    active.spec.titleBg,
    active.params,
    s.evalStates[s.currentObjectiveIndex],
  );
}

// ---------------------------------------------------------------------------
// Glance edge pings (founder 2026-07-20: „low visibility pinging things on
// the screen pointing to look left and right") — pure derivation for the
// GlanceEdgePings overlay. NOTHING here touches grading: pings only CONSUME
// the tick stream the HUD already receives (junction proximity + the graded
// mirrorGlance events), and satisfying a ping is the very glance the JU-23
// junction-scan detector reads — the information payoff of the graded act.
// ---------------------------------------------------------------------------

/** Arm distance (m) before a scan-graded stop line — ~5 s at drill speeds,
 *  the same order as the detector's junctionScanLookbackSec window. */
export const GLANCE_PING_APPROACH_M = 45;

/** Min speed to ARM (km/h): a car spawned near a line must not ping through
 *  the pre-drive checklist. Once armed, stopping AT the line keeps the
 *  pending pings — waiting there is exactly when the scan matters. */
export const GLANCE_PING_MIN_ARM_KMH = 3;

/** The watched distance jumping UP by ≥ this (m) while armed = the old line
 *  was crossed and a NEW mouth is already inside the window → fresh pings. */
const GLANCE_PING_NEW_LINE_JUMP_M = 8;

/** "ping" = pulsing „огледай" cue; "done" = glance registered, the cue is a
 *  fading confirmation; "off" = nothing rendered for that side. */
export type GlancePingPhase = "off" | "ping" | "done";

/** Mutable tick-rate state (zero allocations after creation) — advance it
 *  ONLY via observeGlancePingsTick / resetGlancePings. */
export interface GlancePingsState {
  /** True while inside the approach window of a scan-graded line. */
  armed: boolean;
  /** Watched line distance on the previous armed tick (new-line detection). */
  lastLineM: number;
  left: GlancePingPhase;
  right: GlancePingPhase;
}

export function createGlancePingsState(): GlancePingsState {
  return { armed: false, lastLineM: Number.POSITIVE_INFINITY, left: "off", right: "off" };
}

/** Back to idle (advisor toggled off mid-approach, scene retry). */
export function resetGlancePings(s: GlancePingsState): void {
  s.armed = false;
  s.lastLineM = Number.POSITIVE_INFINITY;
  s.left = "off";
  s.right = "off";
}

/** Highest rung the glance pings render on (L1–L3). L4 is the exam rung and
 *  L5 is „Усложнени" — by then the scan is the student's own habit. */
export const GLANCE_PING_MAX_LEVEL = 3;

/**
 * WIDENED 2026-07-30 (founder review, ledger 86 D9 / §6 „ALREADY BUILT").
 *
 * The gate used to be `ruleConfig.junctionScanObservationEnabled === true &&
 * defaultAdvisorEnabled(lesson)` — the JU-23 per-lesson opt-in AND rungs
 * L1–L2. Exactly **three** of the 154 templates ever set that flag
 * (`templates-junctions.ts:746`, `:936`, `templates-exam.ts:505`, and the exam
 * one is disqualified by `examMode`), so the cue the founder asked for three
 * times was live on two scenarios and no curriculum lesson. He played Урок 2
 * „Кръстовища и предимство" — which grades the junction but never sets the
 * flag — and wrote: „here we can Ping somewhere on the screen with low
 * brightness/contrast Press Q for Left View". He was looking straight at the
 * lesson the gate excluded.
 *
 * The new gate is rung + exam only. That is honest rather than lax, because
 * the pings are **armed by the world, not by the lesson**:
 * `observeGlancePingsTick` raises them ONLY inside 45 m of a stop line whose
 * control is a Б2 „Спри! Пропусни движението" or a Б1 „Пропусни движението"
 * (`tick.nextStopLineControl`) — never at a traffic light, never on open road.
 * At such a mouth ЗДвП requires the driver to give way, which cannot be done
 * without looking both ways, so „огледай" is correct instruction on ANY
 * lesson that drives one. Nothing here grades: satisfying a ping consumes the
 * already-graded `mirrorGlance` event and the ✓ states a fact („погледна"),
 * never a verdict.
 *
 * Two stacked gates remain: `examMode` (a training aid is not part of the
 * exam) and the live „Съветник" toggle, applied by the overlay at the caller.
 */
export function glancePingsEligible(lesson: LessonSpec): boolean {
  if (lesson.examMode === true) return false;
  const scenario = parseScenarioLessonId(lesson.id);
  // A curriculum lesson has no difficulty rung — `order` is a syllabus
  // position, not a level, and Урок 5 is not „harder mode", it is a later
  // subject. Reading it as a rung (the advisor's own shortcut) would strip the
  // cue from Уроци 4–7 exactly as the streets get harder. Scenario rungs DO
  // carry a level, and there L4 is the exam rung and L5 is „Усложнени".
  return scenario === null || scenario.level <= GLANCE_PING_MAX_LEVEL;
}

/**
 * Advance ping state from one HUD tick (mutates in place — frame rate, so
 * allocations are banned). Returns true when a VISIBLE phase changed; the
 * overlay snapshots React state only then.
 *
 * Model: a scan-graded line (Б1 give-way / Б2 stop — exactly the controls
 * the JU-23 detector grades; traffic lights never arm) entering the approach
 * window pings BOTH sides; the graded mirrorGlance event of a side flips its
 * ping to the "done" confirmation; leaving the window (line crossed / no
 * line watched) clears everything for the next junction.
 */
export function observeGlancePingsTick(s: GlancePingsState, tick: SimTick): boolean {
  const scanControlled =
    tick.nextStopLineControl === "stopSign" || tick.nextStopLineControl === "giveWay";
  const lineM = scanControlled ? tick.nextStopLineM : undefined;

  if (lineM === undefined || lineM > GLANCE_PING_APPROACH_M) {
    const hadVisible = s.left !== "off" || s.right !== "off";
    if (s.armed || hadVisible) resetGlancePings(s);
    return hadVisible;
  }

  let changed = false;
  const newLine = s.armed && lineM > s.lastLineM + GLANCE_PING_NEW_LINE_JUMP_M;
  if ((!s.armed && tick.speedKmh >= GLANCE_PING_MIN_ARM_KMH) || newLine) {
    s.armed = true;
    s.left = "ping";
    s.right = "ping";
    changed = true;
  }
  if (!s.armed) return false;

  s.lastLineM = lineM;
  for (const e of tick.events) {
    if (e.kind !== "mirrorGlance") continue;
    if (e.mirror === "left" && s.left === "ping") {
      s.left = "done";
      changed = true;
    } else if (e.mirror === "right" && s.right === "ping") {
      s.right = "done";
      changed = true;
    }
  }
  return changed;
}
