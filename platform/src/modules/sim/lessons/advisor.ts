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

import type { HudEvent, LessonObjective, LessonSpec } from "../contracts";
import {
  PRE_DRIVE_STEP_CONTROLS,
  PRE_DRIVE_STEP_ORDER,
  type PreDriveStepId,
} from "../procedures";
import { VIOLATIONS, type SimTick, type ViolationCode } from "../rules";
import { parseScenarioLessonId } from "./scenario";
// Deep, not through the `./scenario` barrel: the barrel line belongs in
// scenario/index.ts, a file this lane does not own. The value import above
// already pulls that graph in, so this adds no edge — and importing the key
// rather than mirroring it as a literal means the writer and the reader cannot
// drift into 499 silently silent cards.
import { AUTHORED_MAX_SPEED_PARAM_KEY } from "./scenario/compile";
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
 *
 * ── THE SPELLING IT COULD NOT READ (sweep161 part A, sc-speed-transition) ──
 *
 * A Bulgarian speed limit is not always written „N км/ч". The В26 zone plate
 * is read and spoken as «зона 30», and one authored title says exactly that:
 *
 *   sc-speed-transition / sc-trn-in-zone
 *   «Влез в зона 30 вече под ограничението»  →  card «… — дръж под 33 км/ч»
 *
 * The author HAD put the number in the title. The scanner above wanted the
 * „км/ч" that the idiom omits, missed it, fell through to source 4, and the
 * card licensed 33 inside a thirty zone — beside a briefing that says «влез в
 * зоната вече под 30 км/ч» и «Задръж под 30 км/ч до края на зоната», and
 * beside the В26 disc in the world. That is the filed defect
 * («37 in a 30 is the goal») with a smaller number, not a different one.
 *
 * MEASURED over every compiled rung of every template: 953 capped cards, of
 * which **5 (one objective × its five rungs) carry «зона N» in the title, and
 * all 5 licensed more than the zone**. No other title in the catalogue matches,
 * so this reads one idiom and touches nothing else.
 *
 * THE BAND IS THE GUARD. «зона» prefixes things that are not speeds (a „зона
 * 2" parking sector, a lesson's own numbering), so only a value that could be a
 * posted Bulgarian limit is taken. The floor is the halt band + 2: below it a
 * „zone" figure is not a speed limit anybody signs, and a mis-read there would
 * be the dangerous direction — a card demanding a crawl the gate never asked
 * for.
 */
const ZONE_CAP_MIN_KMH = ADVISOR_HALT_CAP_KMH + 2;
const ZONE_CAP_MAX_KMH = 130;

/**
 * ── AND A NUMBER IN A TITLE IS NOT AUTOMATICALLY A CEILING (w10-4, 2026-08-24,
 *    finding sc-mw-min-speed:2545554a) ──
 *
 * This scanner took EVERY „N км/ч" in a title as a ceiling and `Math.min`ned it
 * against the gate. Censused over the whole catalogue that was harmless and
 * accidentally so: all eleven objective titles that carry a figure write it as
 * „…под N км/ч", the one construction where the reading is right. Nothing had
 * ever been authored any other way, and this is why.
 *
 * A TARGET IS NOT A CEILING AND A FLOOR IS ITS OPPOSITE. `sc-mw-min-speed` is
 * the drill whose whole subject is NOT crawling — «общ задължителен минимум
 * няма, но кола, която пълзи с 40 в поток от 130, е подвижно препятствие» — and
 * on `.audit-frames/w10-1/frames/sc-mw-min-speed__pc-right/01-arrival.png` the
 * only number on the glass is «дръж под 140 км/ч» while briefing step 2 asks
 * for «около 110 км/ч». The obvious repair — put the rhythm in the task title —
 * was UNAVAILABLE while this function existed: „около 110 км/ч" would have been
 * read as a ceiling and the card would have printed «дръж под 110 км/ч» on a
 * motorway, i.e. the sentence that tells a student to slow down, printed by the
 * lesson that exists to tell him not to. A floor («поне 90») would have been
 * worse still: the strictest figure wins, so the drill would have coached a
 * 90 km/h CAP off its own minimum.
 *
 * So the scanner now reads the construction and not just the digits. Taken:
 * „под N" · „до N" · „не повече от N" · „максимум N" — and „препоръчителните N"
 * (an А1 табела IS the ceiling for the arc; `SPEED_TOO_FAST_FOR_CURVE` grades
 * exactly that duty). Left alone: „около N" (a target) and „поне / не под /
 * минимум N" (a floor), which now mean on the chip what they mean in Bulgarian.
 *
 * MEASURED before the change and after it, over every compiled rung of every
 * template: NOT ONE of the 953 capped cards changes the number it speaks. The
 * eleven „под" titles all carry the marker, and the twelfth — sc-spcv-curve's
 * «с препоръчителните 50 км/ч» — is the advisory form named above. This widens
 * what an author may write; it moves nothing that was already written.
 */
const TITLE_CEILING_RX =
  /(?:под|до|не повече от|максимум|препоръчителните|препоръчителна|препоръчителни)\s+(\d+(?:[.,]\d+)?)\s*км\/ч/giu;

function titleCapKmh(titleBg: string): number | undefined {
  let strictest: number | undefined;
  const take = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    if (strictest === undefined || n < strictest) strictest = n;
  };
  for (const m of titleBg.matchAll(TITLE_CEILING_RX)) take(m[1]!);
  for (const m of titleBg.matchAll(/зона\s*(\d+)/gi)) {
    const n = Number(m[1]);
    if (n >= ZONE_CAP_MIN_KMH && n <= ZONE_CAP_MAX_KMH) take(m[1]);
  }
  return strictest;
}

/**
 * WHETHER THIS CARD MAY SPEAK A NUMBER AT ALL — sweep161 part A/D, and the end
 * of the line B58 and titleCapKmh each walked one step of.
 *
 * Both earlier fixes CLAMPED the printed figure — to the sign, then to the
 * author's own ceiling — and both are silent where neither clamp bites. There
 * the raw `params.maxSpeedKmh` went on the glass as an instruction, and the
 * audit photographed what that reads like beside the briefing on the same
 * screen (`.audit-frames/sweep161/<lesson>/pc-right/`):
 *
 *   sc-speed-transition  «…до знака за зоната — дръж под 57 км/ч»  (limit 50)
 *   sc-speed-transition  «Влез в зона 30 … — дръж под 38 км/ч»     (zone 30)
 *   sc-sp-curve          «…с препоръчителната скорост — под 60»    (plate 50)
 *   sc-sp-eco-coast      «…вече намалил — дръж под 41 км/ч»        (no number
 *                                                       anywhere in the drill)
 *   sc-vu-cyclist-hook   «Приближи завоя с готовност да пропуснеш — под 40»
 *   sc-mw-min-speed      «Влез в ритъма на потока — дръж под 140 км/ч», on the
 *                        drill whose whole subject is a MINIMUM speed
 *
 * MEASURED HERE, over every compiled rung of every template: **953 reachZone
 * cards carry a cap, and 433 of them (77 distinct titles) had no number the
 * student could see or had been told** — the figure was `maxSpeedKmh` alone,
 * i.e. the author's gate plus the rung's grace (`scenario/params.ts`
 * widenSpeedCap). 95 printed a FRACTION of a km/h — «дръж под 54.5 км/ч» — a
 * speedometer cannot show it and no instructor says it, which is the tolerance
 * signing its own name. Every one of the 95 fractions is gone.
 *
 * THE CENSUS LINE THAT USED TO STAND HERE WAS WRONG, and nothing checked it.
 * It read „After this gate 494 cards say the sentence without a number and 459
 * still carry one". Re-measured at the head of this wave: **499 silent, 454
 * numbered**. The 953 reconciles either way, which is exactly why the split
 * could rot unnoticed — `advisor-sweep161.test.ts` asserted only `> 900` and
 * `> 400`, so five cards could move between the halves and the suite would not
 * blink. A stated measurement that nothing asserts is how three of these went
 * stale in this file alone; every number below is pinned, card for card, in
 * `__tests__/advisor-authored-cap.test.ts`.
 *
 * So the test stops being „how big may the number be" and becomes „whose number
 * is it". Four sources qualify:
 *
 *  1. THE HALT BAND. At or below ADVISOR_HALT_CAP_KMH `widenSpeedCap` returns
 *     early and adds nothing, so a „под 6 км/ч" IS the author's own figure and
 *     it means come to rest — 309 of the 953 cards, 158 of them inside the 433
 *     (every parking „Задача 1: спри в изходната позиция").
 *  2. THE AUTHOR'S TITLE (titleCapKmh) — authored copy, which is what this file
 *     defers to (ADR-002, the rule it opens with).
 *  3. THE SIGN (doc 87 B58), but only WHERE IT BINDS. B58 is the same crime one
 *     level out: on «Превишаване над +10» the card read, in one sentence,
 *     «Задръж под 50, докато потокът те подминава — дръж под 52 км/ч», in the
 *     drill whose whole subject is that going over 50 is the fault. The gate
 *     keeps grading what the template authored — re-authoring the 32 catalog
 *     gates that sit above their street's limit would move graded gates and
 *     their committed traces, which is a decision, not a bug fix — but the card
 *     says the sign. A posted limit BELOW the gate is the number the world shows
 *     him and the one he is held to. A posted limit ABOVE the gate says nothing
 *     about this zone: sc-sp-curve's street is 90 and the A1 plate recommends
 *     50, so „under 90" would have licensed the card's 60 through a curve the
 *     lesson exists to slow him down for.
 *  4. THE AUTHOR'S OWN CAP, before the ladder touched it — the source the three
 *     above could not see, and the one that ends the silence. See below.
 *
 * ── 4. AND THE SILENCE THAT WAS LEFT, WHICH IS THE SAME CRIME ──
 *
 * Returning `undefined` was never neutral. THE GATE KEPT GRADING. Of the 953
 * capped cards, 644 sit above the halt band and **499 of those said no number
 * at all while being graded on one**. Measured across every surface the student
 * can see — the objective's own title, every step of the compiled briefing, and
 * the street's posted limit:
 *
 *   169  cards had NO speed number on any of the three, and a gate anyway
 *   116  more showed only numbers ABOVE their gate, so the student who obeyed
 *        the strictest figure he was given still failed
 *
 * The exhibit is the reference lesson: `sc-zebra-approach@L1 / sc-za-approach`
 * reads «Приближи пътеката с готовност за спиране», names no speed, and grades
 * at 45. The sharp end of the 116 is `sc-crossing-child-ball@L1`, whose briefing
 * says «под 40 км/ч» over a gate of 37. That is the founder's own complaint
 * standing one street over — he signalled a roundabout exit correctly and the
 * engine failed him — and THEO-4 requirement zero names it: a grade against an
 * unstated threshold is a bare verdict, which this product may never hand a
 * seventeen-year-old.
 *
 * WHAT WAS NOT AVAILABLE was closing it by dropping the cap. Speed is the single
 * most-graded thing in the Bulgarian practical exam; a cap that stops grading is
 * a lesson that stops teaching. Nor could the gate simply be tightened onto the
 * author's figure — that moves 192 graded gates and their committed traces,
 * which is a decision and not a bug fix (the same line B58 drew at its own 32).
 *
 * So the card says the AUTHOR'S cap: `scenario/compile.ts` now carries the
 * template's own `maxSpeedKmh` — the value BEFORE `widenSpeedCap` folded the
 * rung's grace in — on the compiled objective, and this function takes it as a
 * fourth source. It is the halt band's argument generalised: source 1 is
 * trusted precisely because widenSpeedCap adds nothing at or below 8, so the
 * figure is the author's. Above 8 the author's figure still exists; until now
 * it was simply thrown away at compile time, and „the grader's tolerance" was
 * blamed for a number that had an innocent twin.
 *
 * MEASURED, over every compiled rung of every template, after the change:
 *
 *   953 of 953  capped cards speak a number (was 454; +499, all of them the
 *               cards that had been silent)
 *     0         cards change a number they were already speaking — in every
 *               one of the 145 above-halt cards that already spoke, the title
 *               or the sign was already at or under the author's cap, so this
 *               source only ever fills a hole
 *     0         fractions, 0 spoken figures above their own gate
 *
 * That last pair is the invariant this whole block exists for and it is now
 * total rather than partial: EVERY capped objective states the number it is
 * graded on, and the number it states can never fail the student who obeys it.
 *
 * The `Math.min` at the end is the half that must not be dropped. Where the
 * visible number is LOOSER than the gate (an authored „под 90 км/ч" over a gate
 * that refuses above 50) the card must still say 50, or it coaches the student
 * straight into failing the task he is being coached through.
 */
function spokenCapKmh(
  capKmh: number,
  titleBg: string,
  postedLimitKmh?: number,
  authoredCapKmh?: number,
): number | undefined {
  if (capKmh <= ADVISOR_HALT_CAP_KMH) return capKmh;
  const authored = titleCapKmh(titleBg);
  const posted =
    postedLimitKmh !== undefined &&
    Number.isFinite(postedLimitKmh) &&
    postedLimitKmh > 0 &&
    postedLimitKmh < capKmh
      ? postedLimitKmh
      : undefined;
  // Source 4. Guarded like the sign: a non-finite or non-positive value is not
  // a speed, and the `Math.min` below would take a bad one as the strictest.
  const own =
    authoredCapKmh !== undefined && Number.isFinite(authoredCapKmh) && authoredCapKmh > 0
      ? authoredCapKmh
      : undefined;
  // Still possible, and deliberately: a lesson compiled outside the scenario
  // pipeline (curriculum specs, the exam bank, a test double) carries no
  // authored cap, and there this function behaves exactly as it did — the
  // graceful-degradation half of the `postedLimitKmh` precedent.
  if (authored === undefined && posted === undefined && own === undefined) return undefined;
  const visible = Math.min(
    authored ?? Number.POSITIVE_INFINITY,
    posted ?? Number.POSITIVE_INFINITY,
    own ?? Number.POSITIVE_INFINITY,
  );
  return Math.min(visible, capKmh);
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
  return CONTROLLER_RX.test(titleBg);
}

/** One spelling of the officer, in one place, so the three readers below and
 *  the objective branch above can never drift into disagreeing about him. */
const CONTROLLER_RX = /регулировчик/i;

/**
 * DOES THIS LESSON STAGE AN OFFICER AT ALL? — and it is a property of the
 * LESSON, not of whichever objective happens to be active.
 *
 * `titleNamesController` was the first cut and it is under-scoped, which the
 * test that pinned it said out loud: *„`titleNamesController` is a substring
 * test, so the displacement is only ever as strong as the banner."* Measured
 * over the compiled catalogue, three templates put a регулировчик at their
 * junction — sc-signal-controller, sc-sig-controller-live,
 * sc-sig-controller-postures — and TWO of them carry an objective whose title
 * does not name him:
 *
 *   sc-sig-controller-live   sc-sctl-exit  «Излез от кръстовището на север»
 *   sc-sig-controller-postures sc-sctp-cross «Премини кръстовището, когато
 *                                            позата разреши посоката ти»
 *
 * The second is the CROSSING objective of the officer's own drill. On both, a
 * red-light hold put the generic lamp card back on the glass at the junction
 * where the lamp decides nothing — the exact sentence that convicted the
 * correct drive on sc-sig-controller-live/mobile-right (run.log 167/196/358),
 * one objective further along the same route.
 *
 * Three authored surfaces are read, and all three are copy the student has
 * already been shown, so this stays inside the rule this file opens with
 * (ADR-002: authored copy, never free recall): the lesson's own title, every
 * step of the compiled briefing (`briefingBg` — the „Инструкции" card), and
 * every objective title on the route. sc-sig-controller-live's briefing step 2
 * is the plainest of them: «Има ли регулировчик, важи само неговият сигнал.»
 *
 * A lesson with no officer anywhere reads false on all three and keeps every
 * card it had.
 */
function lessonStagesController(lesson: LessonSpec, objectives: readonly LessonObjective[]): boolean {
  if (CONTROLLER_RX.test(lesson.titleBg)) return true;
  if (lesson.briefingBg?.some((step) => CONTROLLER_RX.test(step.textBg)) === true) return true;
  return objectives.some((o) => CONTROLLER_RX.test(o.titleBg));
}

/**
 * WHAT THE INSTRUCTOR SAYS WHILE THE STUDENT IS STOPPED AT THE OFFICER'S
 * JUNCTION — the card that replaces the lamp's.
 *
 * IT MUST NOT SAY «Чакаш правилно». The generic red-light card opens with
 * exactly that, and on sc-sig-controller-live it was false: the officer was
 * standing SIDE-ON, which releases this direction, so the wait itself was the
 * fault the drive was billed for. Nothing in `SimTick`, `YieldWaitState` or
 * `PassSignalParams` carries the officer's posture (see the report), so this
 * module cannot know whether this particular wait is right — and a module that
 * cannot measure a thing may not praise it. That is the same withdrawal the
 * pedestrian copy already made about a stop it could not see the position of.
 *
 * IT MUST NOT SAY «Тръгвай» EITHER, for the mirror reason: chest-on stops this
 * direction and telling him to go would be the same defect pointing the other
 * way.
 *
 * So it says the one thing that is true on every frame of every officer's
 * junction and is what the student is there to learn — WHERE TO LOOK, and what
 * each posture means. Both halves are retrieved: the postures are the
 * lesson's own authored briefing (sc-sig-controller-live steps 3 and 4), and
 * the hierarchy claim is the rule catalog's citation for the fault that grades
 * this very duty, so the sentence spoken while he waits cites byte-identically
 * what the toast would cite if he obeyed the lamp and got billed for it.
 *
 * NOTHING IS TAKEN AWAY BY IT. The first cut of this fix fell through to
 * `advisorPromptForObjective`, which on `sc-sctl-exit` would have answered a
 * live wait with «Излез от кръстовището на север» — a waypoint, not an answer
 * to „am I right to be standing here". The wait keeps a voice; only the lamp
 * loses its authority.
 *
 * 148 CHARACTERS, AND THE BUDGET IS NOT DECORATION. Every other card on this
 * surface is held under 150 by `yield-voice.test.ts` („fits the 240 px
 * column"), and a card that clips is a card whose second posture — the one that
 * says GO — never reaches the student. The first draft ran to 249 and would
 * have shipped the officer's rule with its ending cut off. All three postures
 * ППЗДвП чл. 65 names are here: chest or back (stop), side-on (go), arm up
 * (the phase is changing — wait for it), and the arm is kept precisely because
 * dropping it would leave a student who is side-on going through a raised arm.
 */
const CONTROLLER_WAIT_CARD_BG =
  "Тук решава регулировчикът, не лампата. Гледай позата му: гърди/гръб към теб — стоиш; " +
  "страничен профил — минаваш, дори на червено; ръка горе — чакаш.";

/** The live-wait card at a junction an officer is directing. */
export function controllerWaitAdvisorPrompt(): AdvisorPrompt {
  // No key chips, exactly as `yieldWaitAdvisorPrompt`: the next action depends
  // on a posture this module cannot read, and the honesty rule of this file is
  // that a chip may only name a control that PERFORMS the step.
  return { textBg: CONTROLLER_WAIT_CARD_BG, keys: [] };
}

/**
 * Prompt for the ACTIVE driving objective. `evalState` (when the caller has
 * it) sharpens phase-dependent maneuvers — currently the roundabout, whose
 * exit-indicator hint only makes sense once the ring has been entered.
 * `postedLimitKmh` is the street's own limit — see shownCapKmh (B58).
 * `authoredCapKmh` is the template's own `maxSpeedKmh` before the rung's grace
 * was folded in — source 4 on spokenCapKmh, and the reason no capped card is
 * silent any more. It cannot ride on `params`: those arrive through
 * `parseObjectiveParams`, whose whitelist drops it (which is exactly what keeps
 * it out of grading), so it comes down its own argument like the sign does.
 */
export function advisorPromptForObjective(
  titleBg: string,
  params: ObjectiveParams,
  evalState?: ObjectiveEvalState,
  postedLimitKmh?: number,
  authoredCapKmh?: number,
): AdvisorPrompt {
  switch (params.kind) {
    case "reachZone": {
      // Speed-capped zones: the cap is the coachable part (approach discipline).
      if (params.maxSpeedKmh === undefined) return { textBg: titleBg, keys: [] };
      // One sentence, one number, and it belongs to the sign, the author's
      // title, the halt band or the author's own cap — never to the grader's
      // tolerance alone (spokenCapKmh).
      const shown = spokenCapKmh(params.maxSpeedKmh, titleBg, postedLimitKmh, authoredCapKmh);
      if (shown === undefined) return { textBg: titleBg, keys: [] };
      // ── AND THE BAND'S LOWER EDGE, WHERE A GATE AUTHORS ONE ────────────────
      //
      // A gate may not refuse a number the student was never told, and since
      // `minSpeedKmh` landed (sc-ac-night-overdrive:b9d61410) one gate can. The
      // floor is authored, not laddered and not derived, so unlike the ceiling
      // it has exactly one figure and needs no `spokenCapKmh` twin.
      //
      // THE CAP TAIL KEEPS THE END OF THE SENTENCE, and that placement is load-
      // bearing rather than stylistic: `LessonPlayShell taskCapKmhFromPrompt`
      // recovers the cockpit strip's «задачата иска ≤N» with a regex ANCHORED
      // at the end of this string, and `taskCapThread.test.ts` additionally
      // requires the LAST «N км/ч» run in the whole card to be that same
      // figure. Appending the floor would have silenced the strip on the one
      // gate that carries one.
      //
      // MEASURED, not estimated, because the sibling assertion in
      // `advisor-authored-cap.test.ts` says the next clause added here has to
      // re-measure: the catalogue's longest card is 94 ch against a 95 ch phone
      // band, and the only card this clause touches goes 80 → 92.
      const floor = params.minSpeedKmh;
      if (floor !== undefined && floor < shown) {
        return { textBg: `${titleBg} — не под ${floor} и дръж под ${shown} км/ч`, keys: [] };
      }
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
          //
          // ── TWO CARDS, ONE MANOEUVRE, TWO NOUNS FOR THE SAME PLACE ────────
          // sc-park-gap-short:d1383890, re-seen 2026-08-28 on
          // `.audit-frames/sweep161/sc-park-gap-short/pc-right/04-t178s.png`
          // at 300 %. The two cards are stacked with ~10 px between them:
          //
          //   ObjectiveBanner  «Задача 2: влез на заден ход в късото място и
          //                     спри напълно»
          //   AdvisorCard      «Премести лоста на R и паркирай на заден ход в
          //                     клетката»
          //
          // `advisorEchoTrim` (LessonPlayShell) cannot help: it only removes a
          // prompt that STARTS with the banner's own sentence, and this one is
          // a DIFFERENT sentence saying the same thing — the worse case, since
          // the second half re-issues the manoeuvre («паркирай на заден ход»)
          // and renames its target («клетката» against the banner's «късото
          // място»). A seventeen-year-old reading two instructions has to
          // decide which one is the task; there is only one manoeuvre and
          // there is no cell.
          //
          // SO THE CARD KEEPS ONLY WHAT THE BANNER DOES NOT SAY: which way the
          // lever goes, and what happens if it does not. That is the whole of
          // the advisor's contract one screen up („say what to do now") and it
          // is the half the banner structurally cannot carry — the banner is
          // the objective, the selector is the act. The manoeuvre and its
          // target are the banner's, said once.
          //
          // THEO-4: neither line is a bare imperative. Each states the rule of
          // the selector («само R върви назад») and the consequence of getting
          // it wrong («на D газта пак ще те подкара напред»), which is the
          // mistake this pair of drills actually books — templates-parking3
          // `sc-park-gap-long` grades «Излишен заден ход, при това без
          // наблюдение» on the forward twin. No article number: this is
          // instructor reasoning about a lever, not law recall (ADR-002).
          //
          // THE STEM «Премести лоста на R» IS LOAD-BEARING AND IS KEPT
          // VERBATIM. `tools/mobile/lesson-audit.mjs`'s REVERSE_DEMAND_RE
          // (`…на заден ход…|Премести лоста на R`) is one of the two things
          // that arm the harness's deliberate reverse gesture, and
          // `engine/__tests__/reverseAssist-audit-harness.test.ts:349` pins
          // that literal. Nothing in the PRODUCT parses this string —
          // `deriveGearDemand` (objectives.ts:1358) reads the objective's
          // TITLE, not the advisor's sentence — so dropping «на заден ход»
          // from the card moves no gate and no demand.
          return params.entry === "forward"
            ? { textBg: "Остави лоста на D — D е за напред; заден ход тук не ти трябва", keys: ["]"] }
            : {
                textBg:
                  "Премести лоста на R — заден ход има само на R; на D газта пак ще те подкара напред",
                keys: ["["],
              };
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
 * Seconds this hold has been standing, off the session's own clock.
 *
 * `lastT` is the tick the session was last folded on and `sinceSec` is the tick
 * the hold began — the same pair `stepYieldVoice` measures its stages against,
 * so the card and the voice can never disagree about how long the wait has
 * been. Nothing here is graded; the worst a wrong number can do is change a
 * coaching card one tick early or late. Undefined when the hold carries no
 * start (a hand-built session in a test, an older client), which
 * `yieldWaitAdvisorPrompt` reads as „keep the opening card".
 */
function heldWaitSec(s: LessonSessionState, wait: YieldWaitState): number | undefined {
  if (wait.sinceSec === null) return undefined;
  const held = s.lastT - wait.sinceSec;
  return Number.isFinite(held) && held >= 0 ? held : undefined;
}

// ---------------------------------------------------------------------------
// THE ROUTE HOLD — the coach may not order a manoeuvre the car cannot make
// ---------------------------------------------------------------------------

/** Why the route is unreachable from where the car actually is. */
export type RouteHold = "crashPinned" | "offRoad";

/**
 * How long a condition must have stood before the coach stops issuing the
 * objective. MOVED HERE from `LessonPlayShell` (it was the component's private
 * number and is now the module's, because the banner and the advisor card have
 * to change on the same frame or they read as two different screens).
 *
 * DERIVED, NOT CHOSEN. `CRASH_PIN_RADIUS_M` is 6 m and the floor at which this
 * product says a car is DRIVING is 5 км/ч. A car that has been driving at all,
 * even at that floor, covers the pin's radius in 6 ÷ (5 ÷ 3.6) = 4.32 s — so
 * five seconds after an impact, a car still inside the radius has not been
 * driving away from what it hit. It lands five seconds BEFORE the crash pin's
 * own 10 s ending in the pure-standstill case, so the qualification is read
 * rather than skipped, and the off-road clause takes the same number rather
 * than inventing a second one.
 */
export const ROUTE_HOLD_S = 5;

/**
 * Is the route unreachable from where the car actually is?
 *
 * Both clauses are fields the engine already folds and already ends drives on
 * (`finish.ts` — the crash pin and `stepOffNetwork`); nothing here re-derives
 * „stuck" from speed or position, so the coach and the ending cannot disagree.
 * `crashPin` is read off `atSec` and `offNetworkSinceSec` is reset on every
 * frame back on tarmac, so neither clause can flicker between an order and its
 * qualification — and an absent field is „no hold", never a hold on the
 * strength of a measurement that was not taken.
 */
export function routeHoldForSession(s: LessonSessionState): RouteHold | null {
  const t = s.lastT;
  if (!Number.isFinite(t)) return null;
  const pinnedForS = s.crashPin === undefined ? null : t - s.crashPin.atSec;
  if (pinnedForS !== null && pinnedForS >= ROUTE_HOLD_S) return "crashPinned";
  const offRoadForS = s.offNetworkSinceSec == null ? null : t - s.offNetworkSinceSec;
  if (offRoadForS !== null && offRoadForS >= ROUTE_HOLD_S) return "offRoad";
  return null;
}

/**
 * WHAT THE COACH SAYS WHILE THE ROUTE IS OUT OF REACH — sc-roundabout-entry:
 * 4ab693eb (critical), `.audit-frames/sweep161/sc-roundabout-entry/pc-right/
 * 04-t141s.png`: the whole windscreen is the roundabout's grass island and a
 * hedge at point-blank range, the cluster reads 0 км/ч, and this card reads
 * «Излез от кръговото с десен мигач». There is no ring under the car to leave.
 *
 * THE BANNER WAS ALREADY FIXED AND THE CARD WAS NOT (sc-junction-blind:
 * c5ba8f17 qualified `objectiveTitleUnderHold`, which the two surfaces that
 * PRINT the objective apply). The advisor is the third surface and the one
 * whose entire contract is „what do I do NOW", so it was left issuing the one
 * instruction the student physically cannot carry out — the bare-verdict crime
 * pointing the other way (doc 64 THEO-4): an order given to someone who cannot
 * obey it teaches him that the instruction is noise.
 *
 * IT MAY NOT RESTATE THE BANNER. That line is «Колата е извън пътя — върни се
 * на платното, за да продължиш: <задачата>» — the condition and the demand.
 * What no surface says is HOW to get back and WHY the verge is different, and
 * that is exactly the half `advisorEchoTrim` would have kept if the shell could
 * have derived it (it cannot; only this module knows the act).
 *
 * BOTH CLAUSES ARE RETRIEVED, NOT RECALLED (ADR-002). The off-road act is the
 * opening of `VIOLATIONS.OFF_CARRIAGEWAY.correctiveBg` verbatim and its reason
 * is that row's own explanationBg („Там сцеплението е друго, спирачният път е
 * по-дълъг"); `advisor-route-hold.test.ts` asserts both against the catalogue
 * so the coach and the toast that bills him cannot drift. No article number is
 * printed: neither card makes a claim about Bulgarian law, they state where
 * this car physically is and how it gets out — and the лв./чл. half is already
 * on the glass in the OFF_CARRIAGEWAY fault card.
 *
 * CHIPS. The off-road card carries none: which way the road lies depends on
 * where the car is and this module cannot read it — the same withdrawal
 * `yieldWaitAdvisorPrompt` and `controllerWaitAdvisorPrompt` already make, and
 * the honesty rule at the top of this file („a prompt may only promise a key
 * that really performs the step"). The pinned card carries „[", the key that
 * really walks the selector toward R — the chip `advisorPromptForObjective`
 * already gives the reverse park.
 */
const ROUTE_HOLD_CARD_BG: Record<RouteHold, string> = {
  crashPinned:
    "Съвсем леко назад с прави колела, после огледай и чак тогава напред — газта напред само притиска колата още по-навътре в удареното.",
  offRoad:
    "Не дърпай волана — отпусни газта, изправи колелата и се върни под малък ъгъл: извън платното сцеплението е друго и спирачният път е по-дълъг.",
};

/** The card the coach shows instead of an unobeyable objective. */
export function routeHoldAdvisorPrompt(hold: RouteHold): AdvisorPrompt {
  return { textBg: ROUTE_HOLD_CARD_BG[hold], keys: hold === "crashPinned" ? ["["] : [] };
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

  // THE ROUTE HOLD OUTRANKS EVERY CARD BELOW, including the live-yield rank
  // that outranks the objective. B15-VOICE's card is a REASSURANCE („Чакаш
  // правилно"), and `yieldReasonAt`'s roundabout clause is reachable from an
  // island 14 m off the ring centreline — so without this line the coach could
  // praise a car parked on the grass for standing still. A car that is off the
  // carriageway or pinned in what it just hit is not waiting for anything; the
  // answer to „what am I supposed to be doing" is the recovery.
  const hold = routeHoldForSession(s);
  if (hold !== null) return routeHoldAdvisorPrompt(hold);

  if (s.currentObjectiveIndex >= s.objectives.length) {
    // Nothing left to advise — but a live yield is still worth a card, because
    // standing still lawfully is an answer to „what now" even on the run-out.
    const trailing = s.yieldWait;
    if (trailing === undefined || !trailing.holding || trailing.reason === null) return null;
    // The officer outranks the lamp on the run-out too — the route ends north
    // of sc-sig-controller-live's junction, so a hold there is the same
    // junction with the objectives spent.
    if (trailing.reason === "redLight") {
      if (lessonStagesController(s.lesson, s.objectives.map((o) => o.spec))) {
        return controllerWaitAdvisorPrompt();
      }
      // …and the rails outrank the lamp's second clause on the run-out too:
      // sc-rx-tram-left's route ends 50 m south of the junction the tram
      // crosses, so a hold there is the same junction with the chain spent.
      if (lessonYieldsToRailVehicle(s.lesson)) return railPriorityWaitAdvisorPrompt();
    }
    return yieldWaitAdvisorPrompt(trailing.reason, heldWaitSec(s, trailing));
  }
  const active = s.objectives[s.currentObjectiveIndex];

  // B15-VOICE: a live yield OUTRANKS the objective. While the student is
  // lawfully standing still, „what am I supposed to be doing" has a different
  // and more urgent answer than the waypoint at the far end of the route — he
  // is already doing it, and the card's job is to say so and name what he is
  // waiting for. The objective prompt returns the frame he moves off.
  //
  // ONE JUNCTION TAKES THE RANK BACK, and it is the one that convicted a
  // correct drive. MEASURED, sc-sig-controller-live/mobile-right/run.log: the
  // harness read this card at t=52 s («Чакаш правилно»), held for the 20 s it
  // asked for, went when the lamp turned green, and finished НЕИЗДЪРЖАН with
  // −10 «Неизпълнение на сигнала на регулировчика — премина стоп-линията,
  // докато регулировчикът спираше твоето направление». The grader was right;
  // the CARD was wrong. `yieldWaitAdvisorPrompt("redLight")` is generic copy
  // that ends „Тръгваш на зелено", and at a regulated junction the lamp
  // decides nothing (ЗДвП чл. 6, т. 2 — the officer's orders bind „НЕЗАВИСИМО
  // от светлинните сигнали" — and чл. 7, ал. 1 the hierarchy).
  //
  // Same doctrine as the objective branch above, one scope wider: the officer
  // belongs to the LESSON, not to whichever objective is active
  // (`lessonStagesController` — the first cut read only the active banner and
  // handed the lamp back its authority on two of the three officer drills,
  // including the crossing objective of one of them). Only `redLight` is
  // displaced — a pedestrian, a Б2 or a roundabout at a regulated junction is
  // still exactly what its own card says it is — and what replaces it is a
  // WAIT card, not the waypoint: the student standing still is owed an answer
  // to „am I right to be here", and `controllerWaitAdvisorPrompt` gives him the
  // one this module can honestly give.
  const waiting = s.yieldWait;
  if (waiting !== undefined && waiting.holding && waiting.reason !== null) {
    if (waiting.reason === "redLight" && lessonStagesController(s.lesson, s.objectives.map((o) => o.spec))) {
      return controllerWaitAdvisorPrompt();
    }
    // RX-05 (sc-rx-tram-left:07c63b97): the lamp keeps its authority here — the
    // red is real — but not its unconditional «Тръгваш на зелено», because the
    // same green releases the tram this turn crosses (ЗДвП чл. 8, ал. 2). The
    // officer is asked first: a junction with both would be the officer's, and
    // his card already refuses to say «Тръгваш на зелено» at all.
    if (waiting.reason === "redLight" && lessonYieldsToRailVehicle(s.lesson)) {
      return railPriorityWaitAdvisorPrompt();
    }
    return yieldWaitAdvisorPrompt(waiting.reason, heldWaitSec(s, waiting));
  }

  // The author's own cap comes off the RAW compiled objective, not off
  // `active.params` — `parseObjectiveParams` built those from a whitelist and
  // dropped the key on the way, which is the property that keeps a coaching
  // number out of the grader. `active.spec` is the objective as compiled, so
  // the sentence and the gate read the same single authored source.
  return advisorPromptForObjective(
    active.spec.titleBg,
    active.params,
    s.evalStates[s.currentObjectiveIndex],
    s.lesson.postedLimitKmh,
    authoredCapOf(active.spec),
  );
}

/**
 * The template's own `maxSpeedKmh` off a compiled objective, or undefined for a
 * lesson that was never compiled by `scenario/compile.ts` (curriculum specs,
 * the exam bank, a hand-built test double) — see AUTHORED_MAX_SPEED_PARAM_KEY.
 */
function authoredCapOf(spec: LessonObjective): number | undefined {
  const v = spec.params[AUTHORED_MAX_SPEED_PARAM_KEY];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * THE NUMBER THIS OBJECTIVE ALREADY PUT ON THE GLASS — for the OTHER surfaces
 * that have to name the same cap, so they cannot name a different one.
 *
 * MEASURED, sc-ac-crosswind pc-right/04-t084s.png (w10-1): instruction 3 says
 * «тук около 34 км/ч, таванът е 40», the objective toast under it says «дръж
 * под 40 км/ч», the cockpit strip says «задачата иска ≤40» — and the НАУЧИ card
 * in the same 200 px band says «не повече от 45 км/ч». Same task, same instant,
 * two numbers, and the one the student was told to obey is the one that is not
 * the grader's. The 45 is `params.maxSpeedKmh`: the author's 40 with the L1
 * rung's 5 km/h of grace folded in (`scenario/params.ts widenSpeedCap`). Three
 * of the four surfaces were already reconciled — they all read the advisor's
 * sentence, directly or by parsing it back out (LessonPlayShell
 * `taskCapKmhFromPrompt`) — and `lessons/engine.ts objectiveNotice` was the one
 * left holding the raw compiled figure. The sibling row is sc-ac-snow, authored
 * 25 / compiled 30, on the same arithmetic.
 *
 * So the coach card asks the same question the card above it asked, through the
 * same `spokenCapKmh`: whose number is it. THE FALLBACK IS NOT A GUESS — a
 * lesson compiled outside `scenario/compile.ts` never had a rung applied, so
 * `maxSpeedKmh` there IS the author's own figure and returning it changes
 * nothing (route-finish.test.ts's hand-built `t-route-capped` is that case).
 *
 * WHAT THIS MAY NOT DO IS MOVE A GATE, and it cannot: `spokenCapKmh` ends on a
 * `Math.min` with the compiled cap, so the spoken figure is always AT OR BELOW
 * the number that grades. A student who obeys what the card says passes the
 * gate — the direction this product is allowed to be wrong in. The grace stays
 * exactly what its own comment calls it, «forgiveness for a beginner's
 * speedometer», and stops being a second instruction.
 */
export function shownObjectiveCapKmh(
  spec: LessonObjective,
  compiledCapKmh: number,
  postedLimitKmh?: number,
): number {
  return (
    spokenCapKmh(compiledCapKmh, spec.titleBg, postedLimitKmh, authoredCapOf(spec)) ??
    compiledCapKmh
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
 * Continuous seconds of lawful standstill after which the CARD stops saying
 * «Чакаш правилно» and starts saying how the wait ends.
 *
 * WHY THERE IS A SECOND CARD AT ALL — sc-rb-ped-exit:c1e5b6df, and rule 1 above
 * is why there is exactly one more and not a counter. The card was constant for
 * the whole hold, and the hold's own ceiling is YIELD_WAIT_MAX_S = 180 s. So a
 * student who has stopped at a mouth that has since emptied reads
 * «Чакаш правилно — в кръга имат предимство» for three minutes, and the
 * settled line under it says «Стоиш вече N секунди и това е правилно». Measured
 * on the steered re-drive of the roundabout drill
 * (.audit-frames/w10-1/frames/sc-rb-ped-exit__pc-right/run.log): LAWFUL WAIT
 * declared at t = 24 s and again at t = 75 s, «Чакаш правилно» unchanged both
 * times and for 45 s after the ring had cleared — 90 s of a 210 s lesson spent
 * being told that standing still was the manoeuvre. Doc 64 THEO-4 asks this
 * product to explain every decision it announces; a decision that has stopped
 * being true is the one case where repeating the explanation is the defect.
 *
 * THIRTY SECONDS, AND EVERY SHIPPED CYCLE IS UNDER IT. The longest signalized
 * red on the shipped maps is 26 s of a 50 s cycle (see YIELD_VOICE_SETTLE_S,
 * which reads the same three numbers for the opposite end of the wait), and the
 * roundabout drill's circulator laps in ~39 s — so by 30 s the student has seen
 * the ring's whole near side go by at least once and the reassurance at 10 s
 * has had twenty seconds to be believed. It is also far inside the 180 s
 * ceiling, so the card changes while the hold is still live rather than after
 * the gates have already resumed underneath it.
 *
 * IT CHANGES ONCE, WHICH IS WHY IT MAY CHANGE AT ALL. The shell keys its
 * announce/dismiss on the card's TEXT (LessonPlayShell `advisorDismissed` /
 * `useFreshKey`), so a card that counted seconds would re-announce every frame
 * — rule 1's nag in a different hat. One transition per hold is one
 * re-announcement, at the moment there is something new to say.
 */
export const YIELD_CARD_LONG_WAIT_S = 30;

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
  /**
   * THE SECOND — AND LAST — CARD OF A WAIT THAT HAS OUTLASTED ITS OWN REASON
   * (sc-rb-ped-exit:c1e5b6df, 2026-08-25). Present only on the three duties a
   * driver DISCHARGES BY LOOKING; see `YIELD_CARD_LONG_WAIT_S` for the number
   * and `longCardBg`'s absence on `redLight`/`pedestrian` for the safety line.
   *
   * AND IT MAY NOT BE TALLER THAN THE CARD IT REPLACES. The first draft of
   * these three was 165/189/170 characters against an opening-card corpus whose
   * worst case had ever been 132 — +2, +4 and +4 whole lines in the 117 px
   * phone content box, into a column that is height-capped and folds what it
   * cannot fit (`notifyColumn.ts`, and the sweep filed «↓ ОЩЕ 6 РЕДА» on the
   * card BELOW this one in the same run). That is a layout defect traded for a
   * copy defect: the student is handed the sentence that finally tells him how
   * the wait ends, and it pushes the card under it off the glass. The copy was
   * cut to 130/122/113 and the transition now costs the column nothing —
   * measured, per reason, in `advisor-yield-long-wait.test.ts` §4 with the same
   * greedy wrapper and the same 35-chars-per-216 px ratio `advisorFace.test.tsx`
   * measures the face with.
   */
  longCardBg?: string;
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
    // The ring is the one duty whose end the driver reads for himself: there is
    // no lamp and nobody waves him in. So the „go" is never unconditional — it
    // is the back half of a sentence whose front half is the look, which is the
    // sentence an instructor in the right-hand seat says at half a minute. The
    // closing clause survives the length cut because „чакам си реда" is the
    // misconception this drill was written against; `settledBg` teaches it at
    // length and this is its five-word form.
    longCardBg:
      "Чакането стана дълго. Погледни пак НАЛЯВО: празен ли е кръгът, интервалът е твой — влизай сега. Ред по пристигане на кръгово няма.",
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
    // Б1 does not demand a full stop at all, so half a minute at the line is
    // already far past what the sign asks. The poor-visibility answer — edge
    // out slowly until you see, then stop again — is NOT repeated here: this
    // reason's `settledBg` closes on exactly that sentence and the voice speaks
    // it at YIELD_VOICE_SETTLE_S = 10 s, twenty seconds before this card can
    // appear. Restating it cost the phone column four lines it does not have
    // (see `longCardBg`'s own note above).
    longCardBg:
      "Чакането стана дълго. Б1 иска да пропуснеш, не да стоиш: огледай пак ляво–дясно–ляво и щом главният е чист — тръгвай сега.",
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
    // The first half of the Б2 duty is DONE by the time this card can appear —
    // the wheels have been still for half a minute. What is left is the second
    // half, and it ends when the road is clear, not when a clock says so.
    longCardBg:
      "Чакането стана дълго. Спирането по Б2 е направено — остава да пропуснеш: огледай пак и ако е чисто, тръгвай сега.",
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
    // THE ONE STAGE THAT STILL TAUGHT THE LAMP, and it is the stage that was
    // photographed on the drive this whole thread comes from
    // (sc-sig-controller-live/mobile-right/run.log line 196, t = 70 s: «Чакането
    // Е маневрата · 13 секунди на червено са просто цикълът на светофара»).
    // `cardBg`, `namedBg` and `verdictBg` were all amended in the sweep161 wave
    // to carry ЗДвП чл. 6, т. 2's single exception; this one was not, so the
    // middle line of the lecture went on telling a student at an OFFICER'S
    // junction that his seconds were the light's cycle — 34 s before he was
    // billed −10 for exactly that reading.
    //
    // The card above is displaced wholesale at an officer's junction
    // (`controllerWaitAdvisorPrompt`). This channel cannot be: `stepYieldVoice`
    // is handed a reason and a speed and never the lesson, so it cannot tell
    // the two junctions apart. Until it can (see the report — the officer has
    // no flag on `SimTick`, `YieldWaitState` or the `YieldReason` union), the
    // generic lecture must carry the exception in every stage rather than in
    // three of four.
    //
    // THE EXCEPTION GOES SECOND, NOT LAST, and the frame is why: on
    // sc-turn-left-oncoming/pc-right/04-t043s.png this card is already painted
    // with its final line running under the pedal bar. A clause appended to the
    // end of a card that clips is a clause nobody reads — and this one is the
    // difference between waiting and −10.
    settledBg: (sec) =>
      `${sec} секунди на червено са просто цикълът на светофара, не грешка — тези секунди се изваждат от ориентировъчното време на урока. Но първо провери едно: ако на кръстовището има регулировчик, чакаш него, а не лампата — неговият сигнал важи независимо от светофара и може да пуска твоята посока точно сега. Няма ли регулировчик, използвай секундите: виж кой стои насреща, кой ще завива и къде са пешеходците, за да тръгнеш с готова картина вместо да я събираш в движение.`,
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

// ---------------------------------------------------------------------------
// RX-05 — WHERE THE RAILS RUN IN THE CARRIAGEWAY, GREEN IS NOT THE LAST WORD
//
// MEASURED, sc-rx-tram-left:07c63b97 (critical), `.audit-frames/w10-4/frames/
// sc-rx-tram-left__mobile-right/06-waited.png` + run.log 168–260. The drill's
// whole subject is the tram — briefing 3 «Насреща се задава трамвай. Той има
// предимство независимо от посоката си», briefing 4 «трамваят трябва да
// премине ИЗЦЯЛО». What the student was actually told for the entire wait was:
//
//   t=37 s  card    «Чакаш правилно на червено. Тръгваш на зелено …»
//   t=44 s  НАУЧИ   «Защо чакаш: червен сигнал»
//   t=56 s  НАУЧИ   «Изчака сигнала и тръгна чисто … без отчетено нарушение
//                    на сигнала»
//
// Three surfaces, one lamp, and no tram anywhere. That is requirement zero
// (doc 64 THEO-4) failing on the one lesson it matters most on, and the
// generic clause is worse than silent here: «Тръгваш на зелено» IS the fatal
// misreading this drill exists to break. ЗДвП чл. 8, ал. 2 (retrieved,
// content/law/acts/zdvp.json units[7]) says the opposite in as many words —
// „Когато на дадено място от пътя ЕДНОВРЕМЕННО е разрешено преминаването на
// нерелсови и релсови пътни превозни средства, водачът на нерелсовото … е
// длъжен да пропусне релсовото … независимо от неговото местоположение и
// посока на движение." Simultaneously permitted IS green for both.
//
// SAME DOCTRINE AS THE OFFICER, ONE DIFFERENCE. `lessonStagesController`
// displaces the lamp card because the lamp decides nothing there. Here it
// decides plenty — the red is real and stopping for it is right — so the card
// is not replaced by a different duty, it is CORRECTED: the wait keeps its
// approval and the green loses its unconditional half.
// ---------------------------------------------------------------------------

/**
 * Does this lesson turn LEFT across a rail vehicle that outranks the lamp?
 *
 * Read off `conceptIds`, not off authored prose. The officer had no structured
 * marker and had to be read out of the copy; this duty has one, and it is the
 * same id the content bank cites чл. 8, ал. 2 against
 * (`lesson/clearanceCitations.ts` `c-tram-priority` → „ЗДвП чл. 8, ал. 2 ·
 * ЗДвП чл. 48"). A substring test on «трамвай»/«релси» would additionally
 * catch every ЖП-прелез drill — sc-rxd-train, sc-rx-crossing — whose duty is
 * чл. 51–53 and for whom „the tram goes first" is not the sentence owed.
 *
 * BOTH ids are required because both clauses of the copy have to be true. The
 * card names an ONCOMING tram and a LEFT TURN, which is `c-left-turn-oncoming`
 * (чл. 37, ал. 1); the priority claim is `c-tram-priority` (чл. 8, ал. 2).
 * Measured over the compiled catalogue exactly one template carries the pair —
 * sc-rx-tram-left — and the two tram-STOP drills (sc-rx-tram-island,
 * sc-rx-tram-stop-doors) carry only the first and keep every card they had.
 * They could not reach this branch in any case: both are authored
 * `signalized: "no"`, so no `redLight` reason can arise on them at all.
 * `advisor-rail-priority-wait.test.ts` pins that census.
 *
 * AN OFFICER'S JUNCTION IS NOT ONE OF THESE, and the exclusion is not tidiness.
 * The CARD asks `lessonStagesController` first, so a junction with both would
 * take the officer's card either way — but `stepYieldVoice` has no officer
 * branch at all (see `redLight`'s `settledBg` note), which is precisely why the
 * generic lamp copy carries чл. 6, т. 2's exception in every one of its stages.
 * Swapping that copy out on a lesson that stages an officer would DELETE the
 * exception from the teach channel, so a lesson whose own authored copy names
 * him keeps the copy that names him back. No shipped template does both.
 */
export function lessonYieldsToRailVehicle(lesson: LessonSpec): boolean {
  const ids = lesson.conceptIds;
  if (!ids.includes("c-tram-priority") || !ids.includes("c-left-turn-oncoming")) return false;
  if (CONTROLLER_RX.test(lesson.titleBg)) return false;
  return lesson.briefingBg?.some((step) => CONTROLLER_RX.test(step.textBg)) !== true;
}

/**
 * RETRIEVED, never recalled (ADR-002). Both articles are read out of
 * content/law/acts/zdvp.json and both are already the template's own authored
 * `teach.lawRef` («ЗДвП чл. 8, ал. 2 и чл. 37»), so the line spoken during the
 * wait cites what the drill's own teach card cites.
 *
 *   чл. 8, ал. 2 — the rail vehicle goes first wherever passage is permitted
 *                  to both, „независимо от неговото местоположение и посока".
 *   чл. 37, ал. 1 — the left turn yields to the oncoming stream.
 */
const LAW_RAIL_PRIORITY = "ЗДвП чл. 8, ал. 2; чл. 37, ал. 1";

/**
 * WHAT THE INSTRUCTOR SAYS WHILE THE STUDENT IS STOPPED AT A RED WITH RAILS
 * AHEAD — the same three stages, with the tram put back into all of them.
 *
 * WHAT IT MAY NOT SAY, and this is the half that took the most cutting: it may
 * not congratulate him for having yielded to the tram. Nothing this module is
 * handed can see the tram — `stepYieldVoice` gets a reason, a speed and the
 * graded codes, and `SimTick` carries no channel for another actor's position
 * (the same withdrawal `controllerWaitAdvisorPrompt` makes about the officer's
 * posture and the pedestrian copy makes about where the car stopped). On the
 * measured drive the red released him at t≈48 s and the tram had not passed
 * yet: a verdict reading «Пропусна трамвая» would have been false on the very
 * frame it was printed. So the verdict stage says what IS true — the signal
 * released him, and the tram duty is still in front of him.
 */
const RAIL_PRIORITY_RED_COPY: YieldVoiceCopy = {
  cardBg:
    "Чакаш правилно на червено. Зеленото пуска и трамвая насреща, а той минава пръв: изчакай го да отмине изцяло и чак тогава завивай.",
  // No long-wait card, exactly as `redLight`: this wait ends when a lamp turns
  // and a tram clears, neither of which a second card may hint him past.
  namedTitleBg: "Защо чакаш: червен сигнал и релси в платното",
  namedBg:
    "Спрял си пред стоп-линията и на червено това е правилното: спира се напълно ПРЕД линията. Но зеленото тук не е разрешение да завиеш — когато на дадено място едновременно е разрешено преминаването на нерелсови и релсови пътни превозни средства, водачът на нерелсовото е длъжен да пропусне релсовото независимо от местоположението и посоката му. Насрещният трамвай минава пръв, а левият завой пресича трасето му: изчакай го да премине изцяло и чак тогава завивай.",
  settledTitleBg: "Чакането Е маневрата — трамваят минава пръв",
  settledBg: (sec) =>
    `${sec} секунди на червено са просто цикълът на светофара, не грешка — тези секунди се изваждат от ориентировъчното време на урока. Използвай ги, за да решиш едно предварително: зеленото ще пусне и трамвая срещу теб. Той спира в пъти по-дълго от кола и не може да те заобиколи — релсите не завиват — затова първо минава той, а ти завиваш след него.`,
  verdictTitleBg: "Сигналът те пусна — трамваят не",
  verdictBg: (sec) =>
    `Изчака ${sec} с и премина на разрешаващ сигнал — без отчетено нарушение на сигнала. Дотук стига зеленото: то не решава кой минава пръв през релсите. Насрещният трамвай се пропуска независимо от посоката му, така че преди да завиеш наляво изчакай трасето да е чисто по цялата му дължина.`,
  lawRef: LAW_RAIL_PRIORITY,
};

/** The live-wait card at a red the rails do not release. */
export function railPriorityWaitAdvisorPrompt(): AdvisorPrompt {
  // No key chips, for the reason `yieldWaitAdvisorPrompt` gives: neither
  // „carry on waiting" nor „watch the tram" is a control this car has.
  return { textBg: RAIL_PRIORITY_RED_COPY.cardBg, keys: [] };
}

/**
 * The copy one wait speaks with. `railPriority` is a property of the LESSON
 * and therefore constant for a session, so the verdict stage may read it at
 * verdict time instead of banking it in `YieldVoiceState`.
 *
 * Only `redLight` is corrected. A pedestrian, a Б1 or a roundabout on the same
 * drill is exactly what its own card says it is — the same scoping the officer
 * displacement uses, and for the same reason.
 */
function yieldVoiceCopyFor(reason: YieldReason, railPriority: boolean): YieldVoiceCopy {
  return railPriority && reason === "redLight"
    ? RAIL_PRIORITY_RED_COPY
    : YIELD_VOICE_COPY[reason];
}

/**
 * The card line for a live wait — constant per reason, by design (rule 1), with
 * the ONE documented transition at YIELD_CARD_LONG_WAIT_S.
 *
 * `heldSec` is the seconds the car has been standing THIS hold; omitting it
 * (every existing caller, and every test double that has no clock) keeps the
 * opening card, which is the behaviour this function has always had.
 *
 * TWO REASONS DELIBERATELY HAVE NO SECOND CARD, and the omission is the whole
 * safety argument rather than an oversight. `redLight` and `pedestrian` are the
 * duties whose end is declared by something OUTSIDE the car — a lamp turning
 * green, a person reaching the kerb. There is no length of wait at which
 * „огледай пак и тръгвай" becomes true of either, and a card that hinted at it
 * would be this product telling a seventeen-year-old to move off against a red
 * or across a live crossing. They keep their constant card for as long as the
 * hold lasts. `yieldCardCopyCoversLongWait` (below) is what stops a future
 * author closing that gap for tidiness.
 */
export function yieldWaitAdvisorPrompt(reason: YieldReason, heldSec?: number): AdvisorPrompt {
  const copy = YIELD_VOICE_COPY[reason];
  // An unreadable clock is NOT a long wait — the same direction the demo deck
  // and the touch hint take with an unreadable speed: a number nobody can read
  // must never be able to change what the student is being told.
  const held = heldSec !== undefined && Number.isFinite(heldSec) ? heldSec : -1;
  // No key chips on EITHER card: the honesty rule of this file is that a chip
  // must name a control that PERFORMS the step, and neither „carry on doing
  // nothing" nor „look left again" is a key.
  //
  // THE SPLIT IS ASKED FOR, NOT RE-DERIVED (2026-08-26). This line read
  // `longCard !== undefined`, which is the same question `yieldCardCopyCoversLongWait`
  // answers — so the predicate that was written to hold the redLight/pedestrian
  // refusal had no reader on the /simulator path, and the gate it was supposed
  // to guard asked its own private version instead. Two spellings of one rule is
  // how a later author closes that gap „for tidiness" in one of them and nothing
  // fails: the predicate keeps saying no while the card starts saying go.
  const textBg =
    yieldCardCopyCoversLongWait(reason) && held >= YIELD_CARD_LONG_WAIT_S
      ? (copy.longCardBg ?? copy.cardBg)
      : copy.cardBg;
  return { textBg, keys: [] };
}

/**
 * Which duties carry a second card — read by the gate, not by the shell.
 *
 * „Read by the gate" became true on 2026-08-26 and was not before:
 * `yieldWaitAdvisorPrompt` above now asks THIS function whether a reason has a
 * long-wait card, instead of asking `copy.longCardBg !== undefined` itself. The
 * two are the same question, and the whole value of the predicate is that the
 * redLight/pedestrian refusal is stated in ONE place — a second spelling inside
 * the gate is how somebody later gives those two a long card „for tidiness"
 * while this function, and the test that reads it, keep saying they have none.
 *
 * Also exported so `advisor-yield-long-wait.test.ts` can assert the SPLIT rather
 * than the five strings: the property that matters is that exactly the
 * look-and-go duties have one, and adding a sixth `YieldReason` must make
 * somebody decide which side it falls on.
 */
export function yieldCardCopyCoversLongWait(reason: YieldReason): boolean {
  return YIELD_VOICE_COPY[reason].longCardBg !== undefined;
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
  /**
   * Does this LESSON turn left across a rail vehicle (`lessonYieldsToRailVehicle`)?
   *
   * The card and this channel had to learn it together or they read as two
   * different screens: sc-rx-tram-left:07c63b97 photographed the card saying
   * one thing while «Защо чакаш: червен сигнал» said another five seconds
   * later. Optional so every existing caller and test double is unchanged, and
   * absent means „no" — the generic copy, byte-identical.
   */
  railPriority?: boolean;
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
  const railPriority = input.railPriority === true;
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
      const copy = yieldVoiceCopyFor(pending.reason, railPriority);
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
    const copy = yieldVoiceCopyFor(wait.reason, railPriority);
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
