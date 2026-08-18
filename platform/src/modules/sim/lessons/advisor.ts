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

import type { HudEvent, LessonSpec } from "../contracts";
import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEP_ORDER,
  type PreDriveStepId,
} from "../procedures";
import { VIOLATIONS, type SimTick, type ViolationCode } from "../rules";
import { parseScenarioLessonId } from "./scenario";
import type {
  LessonSessionState,
  ObjectiveEvalState,
  ObjectiveParams,
  YieldReason,
  YieldVoiceState,
  YieldWaitState,
} from "./types";

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
 * REACH-ZONE HALT BAND, km/h — a cap at or below this is „come to rest here",
 * never a speed limit. Mirrors REACH_ZONE_HALT_CAP_KMH in objectives.ts; kept
 * as a local literal so this pure module stays free of the evaluator.
 */
const ADVISOR_HALT_CAP_KMH = 8;

/**
 * The number this card may print, given the street's own limit (doc 87 B58).
 *
 * The gate keeps grading exactly what the template authored — re-authoring the
 * 32 catalog gates that sit above their own street's limit would move graded
 * gates and their committed traces, which is a decision, not a bug fix. What is
 * not defensible is SAYING those numbers to a student in the instructor's
 * voice. On «Превишаване над +10» the card read, in one sentence: «Задръж под
 * 50, докато потокът те подминава — дръж под 52 км/ч» — a title and a suffix
 * that contradict each other, in the drill whose whole subject is that going
 * over 50 is the fault. So the printed number is clamped to the sign: the card
 * may be stricter than the gate, never more permissive than the law.
 *
 * A HALT demand is never clamped — «спри — под 5 км/ч» is already far below any
 * posted limit, and a min() there would silently turn a stop into a limit.
 */
function shownCapKmh(capKmh: number, postedLimitKmh?: number): number {
  if (capKmh <= ADVISOR_HALT_CAP_KMH) return capKmh;
  if (postedLimitKmh === undefined || !Number.isFinite(postedLimitKmh) || postedLimitKmh <= 0) {
    return capKmh;
  }
  return Math.min(capKmh, postedLimitKmh);
}

/**
 * THE NUMBER THE AUTHOR ALREADY PUT IN THE TITLE — sweep161, and the same crime
 * as B58 one level in.
 *
 * B58 stopped the card printing a number above the SIGN. It could not see the
 * case where the sign is not declared, and there the ladder's grace went
 * straight onto the glass beside the author's own number, in ONE sentence:
 *
 *   sc-sp-limit-end  «Стигни кръстовището, още в зоната и под 40 км/ч
 *                     — дръж под 48 км/ч»        (01-arrival.png, pc/right)
 *   sc-speed-creep   «Мини зоната 30 под 30 км/ч — дръж под 38 км/ч»
 *   sc-ov-night-gap  «Дръж своята лента под 45 км/ч — дръж под 50 км/ч»
 *
 * The census: **47 compiled objectives across 10 distinct titles** print an
 * authored „под N км/ч" and then a different generated number after the dash.
 * sc-sp-limit-end is the sharpest — its whole subject is a В26 „40" zone, and
 * the sentence licenses 48 in it.
 *
 * The two numbers are not two opinions. The title is AUTHORED copy; the suffix
 * is `params.maxSpeedKmh`, which is the GRADER'S TOLERANCE after
 * `scenario/params.ts` widenSpeedCap added the rung's grace. Grace is
 * forgiveness at the gate; it was never a sentence to say to a student. And
 * this file's own opening rule settles which one wins — the advisor falls back
 * to authored copy and NEVER invents instructions (ADR-002). Where the author
 * did put the number in the title that is a deliberate choice, documented from
 * the other side in `templates-following2.ts`: „The NUMBER is deliberately not
 * in the title: `advisorPromptForObjective` already appends «— дръж под 140
 * км/ч» … so spelling it here would print it twice in one sentence."
 *
 * So: the title's own ceiling wins where it is STRICTER. It may never license
 * more than the gate would accept (that would be a card inviting the student to
 * fail the task), which is why the caller takes a `Math.min` rather than a
 * substitution. All ten titles in the census read „под N км/ч" — a ceiling —
 * and the strictest match is taken, so a range like „26–28 км/ч" reads as 28.
 */
function titleCapKmh(titleBg: string): number | undefined {
  let strictest: number | undefined;
  for (const m of titleBg.matchAll(/(\d+(?:[.,]\d+)?)\s*км\/ч/g)) {
    const n = Number(m[1].replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) continue;
    if (strictest === undefined || n < strictest) strictest = n;
  }
  return strictest;
}

/**
 * Does this objective's authored title put the РЕГУЛИРОВЧИК at the junction?
 *
 * MEASURED, sc-sig-controller-live/mobile/right (run.log + 04-t053s.png of
 * sc-signal-controller). The drill's own objective is titled «Премини
 * стоп-линията по разрешение на регулировчика — въпреки червената лампа», and
 * `advisorPromptForObjective` answered it with its generic `requireRedMet`
 * sentence — «Спри на стоп-линията на светофара и изчакай зелено». The harness
 * obeyed the card, waited the lamp out twice (20 s of declared LAWFUL WAIT) and
 * finished НЕИЗДЪРЖАН with −10 «Неизпълнение на сигнала на регулировчика».
 * The coach and the grader were wired to opposite rules and the coach was the
 * one that was wrong: ЗДвП чл. 6, т. 2 makes the officer's orders binding
 * „НЕЗАВИСИМО от светлинните сигнали", and objectives.ts counts the red as met
 * only on a crossing the officer permitted.
 *
 * `requireRedMet` does not mean „wait for green" — it means „the crossing must
 * have answered a forbidding signal". The generic gloss is a wrong reading of
 * the parameter, and it is wrong ONLY where an officer is present. There is no
 * controller flag on `SimTick` or on `PassSignalParams` to read (see the report
 * for the field that would carry it), but the template that stages one says so
 * in the sentence it authored, and authored copy is what this file defers to.
 *
 * Four objectives in the whole catalog carry `requireRedMet`; exactly one of
 * them names the officer, so the generic sentence keeps serving the other
 * three.
 */
function titleNamesController(titleBg: string): boolean {
  return /регулировчик/i.test(titleBg);
}

/**
 * Prompt for the ACTIVE driving objective. `evalState` (when the caller has
 * it) sharpens phase-dependent maneuvers — currently the roundabout, whose
 * exit-indicator hint only makes sense once the ring has been entered.
 * `postedLimitKmh` is the street's own limit — see shownCapKmh (B58).
 */
export function advisorPromptForObjective(
  titleBg: string,
  params: ObjectiveParams,
  evalState?: ObjectiveEvalState,
  postedLimitKmh?: number,
): AdvisorPrompt {
  switch (params.kind) {
    case "reachZone": {
      // Speed-capped zones: the cap is the coachable part (approach discipline).
      if (params.maxSpeedKmh === undefined) return { textBg: titleBg, keys: [] };
      // The sign clamps it (B58); the author's own number in the title clamps
      // it again where that is stricter (titleCapKmh) — one sentence, one
      // number, and never one the gate would refuse.
      const shown = Math.min(
        shownCapKmh(params.maxSpeedKmh, postedLimitKmh),
        titleCapKmh(titleBg) ?? Number.POSITIVE_INFINITY,
      );
      return { textBg: `${titleBg} — дръж под ${shown} км/ч`, keys: [] };
    }

    case "passSignal":
      if (params.control === "stopSign") {
        return { textBg: "Спри напълно на стоп-линията при знака „Стоп“", keys: ["S"] };
      }
      if (params.requireRedMet === true) {
        // A REGULATED junction is the one place the lamp is not the authority
        // (titleNamesController — measured on sc-sig-controller-live). The
        // authored title is the instruction there; the chip still names the
        // brake, because reading the officer is done stopped.
        if (titleNamesController(titleBg)) return { textBg: titleBg, keys: ["S"] };
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

  // B15-VOICE: a live yield OUTRANKS the objective. While the student is
  // lawfully standing still, „what am I supposed to be doing" has a different
  // and more urgent answer than the waypoint at the far end of the route — he
  // is already doing it, and the card's job is to say so and name what he is
  // waiting for. The objective prompt returns the frame he moves off.
  const waiting = s.yieldWait;
  if (waiting !== undefined && waiting.holding && waiting.reason !== null) {
    return yieldWaitAdvisorPrompt(waiting.reason);
  }

  if (s.currentObjectiveIndex >= s.objectives.length) return null;
  const active = s.objectives[s.currentObjectiveIndex];
  return advisorPromptForObjective(
    active.spec.titleBg,
    active.params,
    s.evalStates[s.currentObjectiveIndex],
    s.lesson.postedLimitKmh,
  );
}

// ---------------------------------------------------------------------------
// THE VOICE FOR THE WAITING — B15-VOICE (2026-08-05), requirement zero.
//
// THE DEFECT, measured at the give-way line of „Кръгово движение". For the
// entire minute a student waits CORRECTLY nothing was said on the rule
// surface, on the card or on the teach channel; the first thing the product
// ever said to him about the priority car was „−10". That is a bare verdict
// delivered by silence, and doc 64 THEO-4 — the founder's own ratified
// requirement zero — forbids exactly that: every theory feature must act as a
// virtual driving instructor that EXPLAINS EVERY DECISION, no bare
// correct/wrong verdicts anywhere, ever.
//
// It is also backwards as teaching. The minute he is doing the right thing is
// the minute a real instructor is talking: naming what has priority, saying
// what gap to look for, and — the part beginners never hear — confirming that
// WAITING IS THE MANOEUVRE, not a stall. B15 already made the wait survivable
// (finish.ts froze the idle gates on it) and the rubric already stopped
// billing it as slow. Neither of those is audible. This is.
//
// FOUR RULES THIS OBEYS.
//
//  1. IT MUST NOT NAG. A line that repeats every two seconds is worse than
//     silence. So the voice is STAGED and each stage speaks at most ONCE per
//     wait: the naming at YIELD_VOICE_NAME_S, the reassurance at
//     YIELD_VOICE_SETTLE_S, the gap verdict after he goes. A two-minute wait
//     produces three sentences, not sixty. The advisor CARD is deliberately
//     constant for the whole wait — its text is the key the shell's
//     announce/dismiss logic is built on (LessonPlayShell `advisorDismissed`,
//     `useFreshKey`), so a card that counted seconds would re-announce itself
//     on every frame, which is the nag wearing a different hat.
//
//  2. IT MUST NOT LEAK THE ANSWER ON THE EXAM. The existing advisor's own
//     distinction is a single unconditional gate — `advisorPromptForSession`
//     opens with `if (s.lesson.examMode === true) return null`, and
//     `defaultAdvisorEnabled`/`glancePingsEligible` repeat it — because a
//     training aid is not part of the car. Telling a candidate mid-assessment
//     who has priority is telling him the answer. Same gate, same place: the
//     engine never folds this on an exam session (engine.ts), and the card
//     never renders one.
//
//  3. IT MUST NOT INVENT LAW. ADR-002: retrieval and citation only, never
//     free recall. Three of the five citations below are read straight off the
//     rule catalog at module load, so the sentence spoken while he waits cites
//     byte-identically what the graded card would cite for failing the same
//     duty. The two that no code grades (Б1, and a roundabout entry) are
//     authored against the retrieved text of ЗДвП чл. 47 / чл. 50, ал. 1 and
//     carry the same citation the scenario's own authored `teach.lawRef`
//     carries. In particular the roundabout does NOT cite „чл. 50а": a content
//     audit retracted that citation across the bank on 2026-08-03 (чл. 50а is
//     the BLOCKED-junction rule and says nothing about roundabouts) — the
//     priority comes from the sign at the mouth, and Б3 „Път с предимство"
//     cannot be placed at a roundabout entry, which is why the entering driver
//     is always on the road without priority.
//
//  4. IT MUST NOT GRADE, AND MUST NOT CONTRADICT WHAT DOES. Everything here
//     emits `lesson` HUD events — the coach's channel for what is taught and
//     not billed, the same one the B4/B5/B6 objective notices ride. It reads
//     the graded stream but never writes to it. And the gap verdict MUTES
//     itself the moment a yield-family fault is graded inside its window: a
//     screen that says „good gap" beside a 10-point опасна is a worse failure
//     than the silence this replaces.
// ---------------------------------------------------------------------------

/**
 * Continuous seconds of lawful standstill before the instructor names the
 * duty. Not zero on purpose: at a Б1 „Пропусни движението" a clear mouth is
 * legal AT A ROLL (no full stop is demanded — see rules/types.ts on the
 * give-way control), so a driver who dips to walking pace and carries on has
 * not waited for anything and must not be lectured about it. Just over a
 * second is the point at which the car has genuinely settled.
 */
export const YIELD_VOICE_NAME_S = 1.2;

/**
 * Continuous seconds before the SECOND line — the one that says the waiting is
 * itself correct. This is the „am I broken?" mark: the founder's own wait was
 * ~40 s, the roundabout drill's circulator laps in ~39 s, and the longest
 * signalized red on the shipped maps is 26 s of a 50 s cycle. Ten seconds is
 * inside all three, so the reassurance lands while the doubt is fresh and
 * still leaves the rest of a long wait completely quiet.
 */
export const YIELD_VOICE_SETTLE_S = 10;

/**
 * Seconds after the wheels turn before the gap verdict speaks.
 *
 * It is a WINDOW rather than an instant because the honest evidence is what
 * the rule engine does next, not what can be seen at the moment of departure.
 * A barged entry convicts once the barge condition has held
 * YIELD_CONVICT_SUSTAIN_SEC (0.9 s) and is immune only inside
 * YIELD_BRAKE_RESPONSE_MAX_SEC (3.0 s) — both in worldRuntime.ts. Four seconds
 * clears both, so „nothing was graded" means the adjudication has actually
 * run and come back clean, not that it has not run yet.
 */
export const YIELD_VOICE_VERDICT_S = 4;

/**
 * How long a finished wait keeps waiting for the wheels to turn, seconds. A
 * red goes green while the car is still standing — the wait has ended but the
 * departure has not happened, and the verdict is about the departure. Past
 * this the wait is disconnected from whatever he does next and is dropped
 * unjudged.
 */
export const YIELD_VOICE_DEPART_GRACE_S = 10;

/**
 * A wait that ended less than this long ago is the SAME episode when it
 * resumes, seconds. Two things produce a resume: creeping one car length up a
 * queue at the line, and speed noise around the standstill bar. Neither is a
 * new junction and neither may re-open the lecture. Twelve seconds is ~40 m at
 * drill speeds — anything further apart than that is genuinely the next
 * junction, and being told again there is right.
 */
export const YIELD_VOICE_EPISODE_GAP_S = 12;

/**
 * Graded codes that MUTE the gap verdict for the wait they land on. Every one
 * of them means the departure was judged and judged badly, by the channel that
 * is allowed to judge — the verdict would either contradict it or, worse,
 * congratulate the student on the same frame the toast bills him ten points.
 */
export const YIELD_VOICE_MUTE_CODES: readonly ViolationCode[] = [
  "FAILED_TO_YIELD",
  "EMERGENCY_NOT_YIELDED",
  "PEDESTRIAN_NOT_YIELDED",
  "PEDESTRIAN_CROSSING_TOO_FAST",
  "RED_LIGHT_CROSSED",
  "STOP_SIGN_NO_FULL_STOP",
  "CONTROLLER_SIGNAL_VIOLATED",
  "COLLISION",
];

/**
 * The Б1 / roundabout citation, authored against the RETRIEVED text of the
 * two articles that actually carry the duty (content/law/acts/zdvp.json):
 *
 *   чл. 47 — „Водач на пътно превозно средство, приближаващо се към
 *   кръстовище, трябва да се движи с такава скорост, че при необходимост да
 *   може да спре и да пропусне участниците в движението, които имат
 *   предимство."
 *   чл. 50, ал. 1 — „На кръстовище, на което единият от пътищата е
 *   сигнализиран като път с предимство, водачите на пътни превозни средства от
 *   другите пътища са длъжни да пропуснат пътните превозни средства, които се
 *   движат по пътя с предимство."
 */
const LAW_GIVE_WAY = "ЗДвП чл. 47; чл. 50, ал. 1";

/**
 * The roundabout citation — the yield half of `SC_ROUNDABOUT_ENTRY.teach
 * .lawRef` (templates-flow.ts), in the form that file now uses. There is no
 * „article for roundabouts" in ЗДвП; the priority comes from the sign at the
 * mouth, and Б3 „Път с предимство" cannot stand there.
 *
 * NUMBERLESS ON THE НАРЕДБА, and that is a rule rather than a style choice.
 * `modules/lesson/clearanceCitations.ts` names „Наредба № РД-02-21-1/23.11.2023
 * чл. 61, ал. 5" — for this exact Б3 claim — as one of the two worst citations
 * in the classroom, because that act is not in `content/law/acts` at all and
 * the number therefore cannot be checked by anyone, least of all the student.
 * A pinned citation may only be RESOLVABLE or NUMBERLESS. ЗДвП чл. 50, ал. 1 is
 * resolvable and its text is quoted above; the Наредба is named for what it
 * holds and carries no number.
 */
const LAW_ROUNDABOUT = "ЗДвП чл. 50, ал. 1; Наредба № РД-02-21-1/23.11.2023 правила за поставяне на знак Б3";

/**
 * The green-light citation. ППЗДвП чл. 31 is the catalog's own for the red
 * (RED_LIGHT_CROSSED, retrieved below); ЗДвП чл. 50а is retrieved verbatim and
 * is what makes „look before you go on green" a duty rather than advice:
 * „Забранено е навлизането в кръстовище дори и при разрешаващ сигнал на
 * светофара, ако обстановката в кръстовището ще принуди водача да спре в
 * кръстовището или да възпрепятства напречното движение."
 *
 * THE THIRD REF IS SWEEP161'S (04-t053s.png, sc-signal-controller/mobile/right).
 * In one frame the in-world board over the junction read «Предимството е ТВОЕ —
 * дори на червено» and this card read «На червено се спира напълно ПРЕД
 * линията — БЕЗ ИЗКЛЮЧЕНИЯ — и се потегля чак на зелено». The board was right
 * and the coach was wrong: there is exactly one exception and ЗДвП names it.
 * The pair is RETRIEVED from the catalog row that grades the same duty
 * (CONTROLLER_SIGNAL_VIOLATED — чл. 6, т. 2 the duty, чл. 7, ал. 1 the
 * hierarchy), so the sentence spoken while he waits cites byte-identically what
 * the toast would cite if he obeyed the lamp and got billed for it.
 */
const LAW_RED_LIGHT = `${VIOLATIONS.RED_LIGHT_CROSSED.lawRef}; ЗДвП чл. 50а; ${VIOLATIONS.CONTROLLER_SIGNAL_VIOLATED.lawRef}`;

interface YieldVoiceCopy {
  /** The advisor card, CONSTANT for the whole wait (see rule 1 above). */
  cardBg: string;
  namedTitleBg: string;
  namedBg: string;
  settledTitleBg: string;
  /** `sec` = whole seconds waited so far, so the reassurance is measured. */
  settledBg: (sec: number) => string;
  verdictTitleBg: string;
  verdictBg: (sec: number) => string;
  lawRef: string;
}

/**
 * WHAT THE INSTRUCTOR SAYS, per reason. Authored copy — the advisor never
 * free-forms guidance (ADR-002, the rule this file opens with) — with every
 * legal claim traceable to the retrieved article in `lawRef` or to the rule
 * catalog's own authored `correctiveBg` for the matching fault.
 */
const YIELD_VOICE_COPY: Record<YieldReason, YieldVoiceCopy> = {
  roundaboutEntry: {
    cardBg:
      "Чакаш правилно — в кръга имат предимство. Гледай НАЛЯВО и тръгвай, когато можеш да влезеш, без някой в кръга да намалява заради теб.",
    namedTitleBg: "Защо чакаш: в кръга имат предимство",
    namedBg:
      "Спрял си правилно. На входа на кръгово кръстовище не може да стои знак „Път с предимство“ — там винаги е Б1 или Б2, тоест ти си на пътя без предимство и пропускаш движещите се в кръга. Гледай НАЛЯВО. Интервалът, който чакаш, е такъв, че да влезеш и да набереш скоростта на кръга, без движещият се в него да намалява заради теб.",
    // THE HEADING NAMES ITS OWN DUTY (sweep161, sc-turn-left-oncoming
    // 04-t043s.png). All five reasons used to head their middle line with the
    // bare «Чакането Е маневрата», so one НАУЧИ title carried a different body
    // in every lesson that raised it — the audit found it on three — and the
    // reader has no way to tell a roundabout card from a stop-sign one by its
    // heading. Each now says which wait it is about. The phrase itself stays in
    // front, because it is the sentence the whole stage exists to say and two
    // tests key on it.
    settledTitleBg: "Чакането Е маневрата — кръгът командва",
    settledBg: (sec) =>
      `Стоиш вече ${sec} секунди и това е правилно — на кръгово се чака точно толкова, колкото поиска кръгът. Тези секунди не ти струват нито точка и се изваждат от ориентировъчното време на урока, така че не бързай. И не гледай надясно за „ред“: редът на пристигане не е правило за предимство — гледай наляво и тръгвай на първия истински интервал.`,
    verdictTitleBg: "Интервалът беше добър",
    verdictBg: (sec) =>
      `Изчака ${sec} с и влезе — и при влизането не беше отчетено нарушение на предимството. Точно това е проверката, която ще правиш цял живот на всяко кръгово: тръгваш само когато можеш да влезеш и да набереш скорост, без движещият се в кръга да намалява заради теб. Оттук нататък излизането е отклонение надясно и се обявява с десен мигач.`,
    lawRef: LAW_ROUNDABOUT,
  },
  giveWayLine: {
    cardBg:
      "Чакаш правилно — знак Б1: пропускаш движещите се по пътя с предимство. Огледай ляво–дясно–ляво и тръгвай в реален интервал.",
    namedTitleBg: "Защо чакаш: знак Б1 „Пропусни движението“",
    namedBg:
      "Спрял си правилно. Знакът Б1 те поставя на пътя БЕЗ предимство: на кръстовище, на което единият път е сигнализиран като път с предимство, водачите от другите пътища са длъжни да пропуснат движещите се по него. Пълно спиране Б1 не изисква — задължението е да пропуснеш. Огледай ляво–дясно–ляво и чакай интервал, в който пресичаш, без някой по главния път да намалява заради теб.",
    settledTitleBg: "Чакането Е маневрата — знак Б1",
    settledBg: (sec) =>
      `${sec} секунди на линията са правилни, не бавни. Времето, което стоиш заради предимство, се изважда от ориентировъчното време на урока и не ти струва точки — законът иска да приближаваш кръстовището с такава скорост, че при необходимост да спреш и да пропуснеш, тоест да можеш да чакаш толкова, колкото поиска главният път. Ако видимостта е лоша, изнеси се напред бавно, докато видиш, и пак спри.`,
    verdictTitleBg: "Пропусна и тръгна в истински интервал",
    verdictBg: (sec) =>
      `Изчака ${sec} с и премина — без отчетено нарушение на предимството. Запомни мярката вместо секундите: интервалът е достатъчен, когато пресичаш и се подреждаш в потока, без някой по главния път да вдига крак от газта заради теб.`,
    lawRef: LAW_GIVE_WAY,
  },
  stopSign: {
    cardBg:
      "Знак Б2: пълното спиране е задължително — и е направено. Сега пропусни движещите се по пътя с предимство.",
    namedTitleBg: "Защо чакаш: знак Б2 „Спри! Пропусни движението!“",
    namedBg:
      "Спрял си правилно, и точно тук пълното спиране е задължително — на Б2 се спира докрай ВИНАГИ, дори пътят да изглежда празен. Колелата неподвижни, брой наум до три, огледай ляво–дясно–ляво. Спирането обаче е само първата половина: знакът иска и да ПРОПУСНЕШ движещите се по пътя с предимство, така че тръгваш чак когато никой не приближава.",
    settledTitleBg: "Чакането Е маневрата — знак Б2",
    settledBg: (sec) =>
      `${sec} секунди на стоп-линията са правилни. Пълното спиране е изпълнено — това, което тече сега, е втората половина на задължението: пропускането. Тези секунди не се броят в ориентировъчното време на урока, така че изчакай спокойно да мине всичко, което има предимство.`,
    verdictTitleBg: "Спря докрай и пропусна",
    verdictBg: (sec) =>
      `Спря напълно, изчака ${sec} с и потегли — без отчетено нарушение на предимството. На истинския изпит двете половини се проверяват поотделно: първо колелата неподвижни на линията, после пропускането. Ти направи и двете.`,
    lawRef: VIOLATIONS.STOP_SIGN_NO_FULL_STOP.lawRef,
  },
  redLight: {
    cardBg:
      "Чакаш правилно на червено. Тръгваш на зелено — освен ако регулировчик не пуска твоята посока: тогава важи само неговият сигнал.",
    namedTitleBg: "Защо чакаш: червен сигнал",
    // SWEEP161: this line used to say „без изключения" and there IS one. The
    // exception is retrieved, not recalled — the second sentence is the rule
    // catalog's own `correctiveBg` for CONTROLLER_SIGNAL_VIOLATED, so the coach
    // and the fault that grades the same duty now say the same words.
    namedBg:
      "Спрял си пред стоп-линията и на червено това е правилното: спира се напълно ПРЕД линията и се потегля на зелено. Изключението е човек, не лампа — сигналите на регулировчика са НАД светофара и знаците: има ли регулировчик на кръстовището, гледай неговите ръце, не светофара, и изпълнявай само неговия сигнал, дори когато твоята лампа свети червено. Няма ли регулировчик, дръж крак на спирачката и гледай светофара за ТВОЯТА посока; когато светне зелено, преди да тръгнеш погледни самото кръстовище — навлизане е забранено дори при разрешаващ сигнал, ако обстановката вътре ще те принуди да спреш в кръстовището и да пречиш на напречното движение.",
    // The one settled title that stays bare: `signal-stop-line-window.test.ts`
    // pins this exact string in the emitted titles of a red-light wait.
    settledTitleBg: "Чакането Е маневрата",
    settledBg: (sec) =>
      `${sec} секунди на червено са просто цикълът на светофара, не грешка — тези секунди се изваждат от ориентировъчното време на урока. Използвай ги: виж кой стои насреща, кой ще завива и къде са пешеходците, за да тръгнеш на зелено с готова картина вместо да я събираш в движение.`,
    verdictTitleBg: "Изчака сигнала и тръгна чисто",
    verdictBg: (sec) =>
      `Изчака ${sec} с и премина — без отчетено нарушение на сигнала. Разрешаващият сигнал е разрешение да минеш, не задължение да тръгнеш веднага: проверката, която току-що направи — свободно ли е кръстовището отсреща — е тази, която пази от засядане в средата му. И помни кой го дава: има ли регулировчик, разрешението е неговото, а не на лампата.`,
    lawRef: LAW_RED_LIGHT,
  },
  pedestrian: {
    cardBg:
      "Чакаш правилно — пешеходецът на пътеката минава пръв. Изчакай да освободи платното; не минавай зад гърба му.",
    namedTitleBg: "Защо чакаш: пешеходец на пътеката",
    // SWEEP161, sc-crossing-dart/mobile/right 06-waited.png: the car is halted
    // with its nose already over the first zebra bars — the painted stripes run
    // out from under the bonnet — and this line read «Спрял си правилно».
    // Briefing point 4 of that very lesson is «Спри напълно преди зебрата», so
    // stopping ON the crossing was taught as correct.
    //
    // The module cannot see WHERE he stopped: `advisorPromptForSession` and
    // `stepYieldVoice` are handed a reason and a speed, never a pose (finish.ts
    // makes the same point about the red-light copy — every line keyed to
    // `redLight` opens with «Спрял си ПРЕД стоп-линията», „which is the one
    // thing that is not true of him"). So the praise is withdrawn and the rule
    // is stated instead: praising a position it cannot measure is the half that
    // was wrong, and naming where the stop belongs teaches the sloppy stop
    // without convicting anybody for it.
    namedBg:
      "Правилно е да чакаш тук. При приближаване към пешеходна пътека си длъжен да пропуснеш стъпилите на нея или преминаващите по нея пешеходци, като намалиш скоростта или спреш. Мястото на спирането е ПРЕД зебрата, не върху нея: колата не влиза в самата пътека, докато по нея има човек. Изчакай го да освободи платното — не го заобикаляй и не минавай зад гърба му, дори да изглежда, че има място. Погледни и встрани от пътеката: който сигнализира, че ще пресича, също се пропуска.",
    settledTitleBg: "Чакането Е маневрата — пешеходецът минава пръв",
    settledBg: (sec) =>
      `${sec} секунди пред пътеката са правилни и не ти струват нищо — това време се изважда от ориентировъчното време на урока. Пешеходецът може да е бавен, да се върне или да поведе дете: не тръгвай на предположение, тръгни, когато го видиш от другата страна.`,
    verdictTitleBg: "Пропусна пешеходеца",
    verdictBg: (sec) =>
      `Изчака ${sec} с и потегли — без отчетено нарушение спрямо пешеходец. Това е грешката с най-тежка цена в целия списък, и ти я избегна по правилния начин: спиране, изчакване докрай, чак после газ.`,
    lawRef: VIOLATIONS.PEDESTRIAN_NOT_YIELDED.lawRef,
  },
};

/** The card line for a live wait — constant per reason, by design (rule 1). */
export function yieldWaitAdvisorPrompt(reason: YieldReason): AdvisorPrompt {
  // No key chips: the correct action is to keep the car still, and the honesty
  // rule of this file is that a chip must name a control that PERFORMS the
  // step. There is no key for „carry on doing nothing".
  return { textBg: YIELD_VOICE_COPY[reason].cardBg, keys: [] };
}

/** Fresh voice: nothing said, nothing pending. */
export function createYieldVoice(): YieldVoiceState {
  return { reason: null, sinceSec: 0, endedAtSec: null, spoken: 0, pending: null };
}

/** One frame of evidence for `stepYieldVoice` — no clock, no world access. */
export interface YieldVoiceInput {
  /** Session time, seconds. */
  t: number;
  /** Speed this frame, km/h (sign ignored — a reverse creep is still moving). */
  speedKmh: number;
  /** The lawful-wait hold for this frame (finish.ts `stepYieldWait`). */
  wait: YieldWaitState;
  /** Codes GRADED on this frame — the engine's own rule output, read only. */
  violations: readonly ViolationCode[];
}

/** What the voice produced this frame. `notices` is empty on almost all of them. */
export interface YieldVoiceStep {
  state: YieldVoiceState;
  notices: readonly HudEvent[];
}

/** The standstill bar, mirroring finish.ts FINISH_STANDSTILL_KMH — kept as a
 *  local literal so this pure copy module stays free of the gate machinery. */
const YIELD_VOICE_STANDSTILL_KMH = 1;

function say(copy: YieldVoiceCopy, titleBg: string, explanationBg: string): HudEvent {
  return { kind: "lesson", titleBg, explanationBg, lawRef: copy.lawRef };
}

/**
 * Advance the instructor's voice by one frame. Pure: same state + same input
 * ⇒ same output, like every other fold in this subsystem.
 *
 * THE SHAPE, in one sentence per stage:
 *  · the wait begins → after YIELD_VOICE_NAME_S, name what has priority, why,
 *    and what gap he is looking for, with the article;
 *  · the wait lasts  → after YIELD_VOICE_SETTLE_S, say once that the waiting
 *    itself is the manoeuvre and is costing him nothing;
 *  · the wait ends and the wheels turn → after YIELD_VOICE_VERDICT_S, say
 *    whether the gap was right — unless the graded channel already said it was
 *    not, in which case say nothing at all.
 *
 * Everything else is bookkeeping that keeps each of those to exactly once.
 */
export function stepYieldVoice(
  prev: YieldVoiceState | undefined,
  input: YieldVoiceInput,
): YieldVoiceStep {
  const { t, wait, violations } = input;
  const base = prev ?? createYieldVoice();
  const notices: HudEvent[] = [];
  const moving = Math.abs(input.speedKmh) > YIELD_VOICE_STANDSTILL_KMH;


  let reason = base.reason;
  let sinceSec = base.sinceSec;
  let endedAtSec = base.endedAtSec;
  let spoken = base.spoken;
  let pending = base.pending;

  // --- 1. The verdict window, first: it can be muted by this very frame. ----
  if (pending !== null) {
    if (violations.some((c) => YIELD_VOICE_MUTE_CODES.includes(c))) {
      // The graded channel owns this departure. Drop it silently — this is the
      // one branch that must never speak, and it is why the verdict waits.
      pending = null;
    } else if (wait.holding) {
      // He did not actually go: a creep of one car length in a queue, and he is
      // standing at the same line again. Nothing has been judged, so nothing
      // is said; the episode below simply resumes.
      pending = null;
    } else if (pending.wentAtSec === null) {
      if (moving) pending = { ...pending, wentAtSec: t };
      else if (t - (endedAtSec ?? t) > YIELD_VOICE_DEPART_GRACE_S) pending = null;
    } else if (t - pending.wentAtSec >= YIELD_VOICE_VERDICT_S) {
      const copy = YIELD_VOICE_COPY[pending.reason];
      notices.push(
        say(copy, copy.verdictTitleBg, copy.verdictBg(Math.max(1, Math.round(pending.waitedSec)))),
      );
      pending = null;
    }
  }

  // --- 2. The live wait. ---------------------------------------------------
  if (wait.holding && wait.reason !== null) {
    // The episode CONTINUES while the duty is the same and the hold either
    // never broke (`endedAtSec === null`) or broke only briefly — a creep of
    // one car length up a queue, or speed noise around the standstill bar.
    const continuing =
      reason === wait.reason &&
      (endedAtSec === null || t - endedAtSec <= YIELD_VOICE_EPISODE_GAP_S);
    if (!continuing) {
      // Nothing to resume — a first wait, a different duty, or the same one far
      // enough later to be the NEXT junction. All three are a new episode, and
      // a new episode is allowed to be explained from the top.
      sinceSec = wait.sinceSec ?? t;
      spoken = 0;
    } else if (endedAtSec !== null) {
      // RESUMING AFTER MOTION — the lecture must not re-open (that is what
      // `spoken` carries across), but the CLOCK must not count the metres he
      // drove in between as seconds he stood.
      //
      // MEASURED, sc-crossing-dart/mobile/right: two holds at the same zebra
      // with a roll between them, and this line said «10 секунди пред пътеката
      // са правилни» while the debrief on the same drive credited «8 с чакане
      // на предимство». The engine's own `yieldWaitSec` accumulates only
      // `holding` frames, so the instructor was quoting a bigger number than
      // the product itself would subtract from his ориентировъчно време —
      // measured against the wrong clock, in the voice that must not be
      // guessing. `sinceSec` is re-anchored so that `t - sinceSec` is the
      // seconds STOOD, gap excluded: the reassurance still survives a creep up
      // a queue, and the number it speaks is the one the debrief credits.
      sinceSec = t - Math.max(0, endedAtSec - sinceSec);
    }
    reason = wait.reason; // identical when continuing; the live duty otherwise
    endedAtSec = null;

    const heldSec = t - sinceSec;
    const copy = YIELD_VOICE_COPY[wait.reason];
    if (spoken < 1 && heldSec >= YIELD_VOICE_NAME_S) {
      notices.push(say(copy, copy.namedTitleBg, copy.namedBg));
      spoken = 1;
    }
    if (spoken < 2 && heldSec >= YIELD_VOICE_SETTLE_S) {
      notices.push(say(copy, copy.settledTitleBg, copy.settledBg(Math.round(heldSec))));
      spoken = 2;
    }
    return { state: { reason, sinceSec, endedAtSec, spoken, pending }, notices };
  }

  // --- 3. The wait just ended. --------------------------------------------
  if (reason !== null && endedAtSec === null) {
    endedAtSec = t;
    // Only a wait the student was actually TOLD about gets a verdict. A
    // sub-YIELD_VOICE_NAME_S dip was never narrated and judging it would be a
    // bare verdict of exactly the kind this file exists to abolish.
    if (spoken >= 1 && pending === null) {
      pending = { reason, waitedSec: Math.max(0, t - sinceSec), wentAtSec: moving ? t : null };
    }
  }

  // The episode is forgotten only once it can no longer resume, so that a
  // creep-and-restop within the gap does not re-open the lecture.
  if (reason !== null && endedAtSec !== null && t - endedAtSec > YIELD_VOICE_EPISODE_GAP_S) {
    reason = null;
    spoken = 0;
  }

  return { state: { reason, sinceSec, endedAtSec, spoken, pending }, notices };
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
