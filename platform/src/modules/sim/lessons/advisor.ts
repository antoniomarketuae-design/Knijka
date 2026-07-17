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
 */
const PRE_DRIVE_ACTION_TEXT_BG: Record<PreDriveStepId, string> = {
  "adjust-seat": "Нагласи седалката и потвърди в списъка вляво",
  "adjust-mirrors": "Огледай трите огледала — задръж Q, E и F",
  "check-surroundings": "Огледай се около колата и потвърди в списъка вляво",
  "fasten-seatbelt": "Постави предпазния колан",
  "check-dashboard": "Провери таблото и потвърди в списъка вляво",
  "headlights-on": "Включи късите светлини",
  "start-engine": "Запали двигателя",
  "press-brake": "Натисни спирачката и задръж",
  "select-gear": "Премести скоростния лост в D",
  "release-handbrake": "Освободи ръчната спирачка",
  "final-mirror-check": "Провери огледалата непосредствено преди потегляне",
  signal: "Подай ляв мигач",
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
          return params.entry === "forward"
            ? { textBg: "Влез в клетката на предна предавка и спри напълно", keys: ["]"] }
            : { textBg: "Включи задна предавка (R) и паркирай в клетката", keys: ["["] };
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
