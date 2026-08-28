/**
 * scoreRubric — the scenario quality layer (doc 76 §6): official points stay
 * the VERDICT (rules/summary.ts, untouched); the rubric adds 1–3 STARS of
 * maneuver quality on top, from measurement channels that already exist:
 *
 *  - placement  ← the parkInBay ObjectiveDetail (A10): alignment
 *                 centered/acceptable/sloppy + centre/heading offsets;
 *  - economy    ← the same detail's bay-entry `attempts` counter, OR the
 *                 threePointTurn detail's direction-change `movements`. On
 *                 BOTH channels a count that is still running can convict but
 *                 not praise — see the settled tests there;
 *  - observation← authored glance moments vs the observed set (the S1 trace
 *                 recorder feeds it, via `parkingObservationFromTrace`; when no
 *                 glance record reaches this call the component reports
 *                 measured: false, stays OUT of the star math, and SAYS SO on
 *                 the card — see the row's own note);
 *  - par time   ← LessonResult.durationSec vs rubric.parTimeSec —
 *                 INFORMATIONAL ONLY, never affects stars (doc 76 §6: time
 *                 pressure is an L5 condition, not a rubric penalty). And the
 *                 row now SAYS so on the side that used to read as praise:
 *                 being under the ориентир is not an achievement on a driving
 *                 lesson (PAR_TIME_NOT_A_TARGET_BG — 42 of the 51 „в ориентира"
 *                 congratulations in the w11 corpus went to the bot driving
 *                 badly on purpose), and an ABORTED drive is no longer billed
 *                 against a route it never finished (PAR_TIME_ABORTED_BG).
 *
 * Star fold (documented, deliberately simple v1):
 *  - each MEASURED component scores 0..2 points; ratio = earned / (2 × n);
 *    ratio >= 0.90 → 3★, >= 0.50 → 2★, else 1★;
 *  - no measured components → stars from official cleanliness alone
 *    (completed + 0 penalty points = 3★, completed = 2★) — see the OPEN
 *    ITEM recorded at that branch: sweep161 caught it printing ★★★ over a
 *    drive nothing had measured;
 *  - caps (quality never outranks legality): any penalty point → max 2★;
 *    a dangerous/terminated summary, an aborted session or unfinished
 *    objectives → 1★.
 *
 * Pure: same inputs → same output. NO UI wiring here (S1 owns the end screen).
 */

import type { LessonResult, ObjectiveDetail } from "../types";
import type {
  RubricBreakdownLine,
  RubricObservationInput,
  RubricScore,
  RubricSpec,
} from "./types";

const STARS_3_MIN_RATIO = 0.9;
const STARS_2_MIN_RATIO = 0.5;

/**
 * The parkInBay measurement channel, WITH the objective's own `done` flag —
 * the economy component needs to know whether the count it is reading has
 * stopped running (see the settled/provisional test there).
 */
interface ParkChannel {
  detail: Extract<ObjectiveDetail, { kind: "parkInBay" }>;
  done: boolean;
}

function parkChannelOf(result: LessonResult, objectiveId: string): ParkChannel | null {
  for (const o of result.objectives) {
    if (o.id === objectiveId && o.detail?.kind === "parkInBay") return { detail: o.detail, done: o.done };
  }
  return null;
}

/**
 * The threePointTurn measurement channel, WITH the objective's own `done` flag
 * — the SAME pairing `ParkChannel` needs, kept for the same reason: the
 * economy component prices praise off a count, and a count is only evidence
 * once it has stopped growing (the settled fold below).
 */
interface TurnChannel {
  detail: Extract<ObjectiveDetail, { kind: "threePointTurn" }>;
  done: boolean;
}

function turnChannelOf(result: LessonResult, objectiveId: string): TurnChannel | null {
  for (const o of result.objectives) {
    if (o.id === objectiveId && o.detail?.kind === "threePointTurn") return { detail: o.detail, done: o.done };
  }
  return null;
}

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString().replace(".", ",");

/**
 * „едно движение" / „N движения" — бройна форма. The turn rows counted in
 * digits throughout, so the single-arc U-turn — the BEST outcome the
 * sc-maneuver-uturn rubric can award (attemptsFor3Stars: 1) — printed
 * „Обратен завой в 1 движения" on the debrief card
 * (.audit-frames/sweep161/sc-maneuver-uturn/mobile-right/08-debrief.png).
 */
const movementsBg = (n: number) => (n === 1 ? "едно движение" : `${n} движения`);

/**
 * WHAT AN UNMEASURED ROW OWES THE STAR ROW ABOVE IT.
 *
 * MEASURED · sweep161 · `sc-park-van/mobile-right/08-debrief.png`: „Точност на
 * позицията не се измерва · Икономичност на маневрата не се измерва ·
 * Наблюдение не се измерва" — and, in the same card, a filled star row the
 * harness read as „1 от 3 звезди". Three rows saying nothing was looked at,
 * under a grade, with no sentence anywhere connecting the two. A reader takes
 * the stars for a verdict on the manoeuvre; on that drive they are a verdict on
 * the изпитен лист wearing the manoeuvre's label.
 *
 * The star NUMBER is not touched here (see the fold at the bottom of this file
 * and the ADR it is waiting on). What changes is that a row which measured
 * nothing now says so all the way through — reason, then consequence — instead
 * of stopping at „няма измерване" and leaving the grade to be read as evidence.
 * THEO-4: never a bare verdict; and never a bare NON-verdict either.
 */
const NOT_IN_STARS_BG = "Този показател не влиза в звездите горе.";

/**
 * The stronger sentence, for the case the criticals actually caught: NOTHING
 * was measured, so the stars are the exam sheet said a second time under a
 * heading that promises an independent opinion on execution. Say whose opinion
 * it is, so a student stops reading „★★★" as „ти изкара маневрата отлично".
 */
const NO_QUALITY_MEASURED_BG =
  "Нито един показател за качеството на маневрата не бе измерен на това каране: " +
  "звездите горе идват само от изпитния лист — наказателни точки и изпълнени задачи — " +
  "а не от оценка на самото изпълнение.";

/**
 * THE ONLY LINE ON THE CARD THAT TOLD THE FLAT-OUT DRIVE IT WAS THE RIGHT ONE.
 *
 * MEASURED · w11 · `sc-vu-pass-clearance` — the lesson whose entire subject is
 * slowing down and leaving a metre and a half beside a vulnerable road user.
 * Its two drives, read off `_audit-debrief.json`:
 *
 *   pc-wrong  51 s, flat out, never met a road user
 *             → «Ориентировъчно време — 51 с — в ориентира от 60 с.»
 *   pc-right  206 s, careful, slowed for the road users the lesson exists for
 *             → «Ориентировъчно време — 206 с при ориентир 60 с — спокойно,
 *                точността е преди скоростта.»
 *
 * Everything else on those two cards is IDENTICAL — same ИЗДЪРЖАН, same 3
 * наказателни точки (the seatbelt), same ★★☆, same XP. So the par-time row is
 * the ONLY row that distinguishes them, and it said the seventeen-second-per-
 * hundred-metres drive was the one on target. `sc-pk-move-off/pc-wrong` — the
 * lane the harness drives WRONG on purpose, top 59 км/ч with the 50 disc live —
 * gets the same congratulation: «48 с — в ориентира от 55 с». On a product
 * whose north-star test is „does this produce safer drivers", the one sentence
 * that separates a careful drive from a fast one was rewarding the fast one.
 *
 * AND IT IS NOT TWO LANES. Every `_audit-debrief.json` in `.audit-frames/w11/
 * frames` that carries this row was read and sorted by which branch it printed
 * and by which way the harness was told to drive that lane:
 *
 *              «в ориентира» (under)   «при ориентир» (over)
 *      -wrong           42                      35
 *      -right            9                     145
 *
 * Of the 51 congratulations the product issued across that corpus, 42 went to
 * the bot that was driving BADLY on purpose — sc-ac-aquaplane, sc-follow-
 * tailgater, sc-ov-solid-line, sc-signal-response, sc-sp-wet-limit-plate,
 * sc-speed-transition, the lot. The careful bot collected the „спокойно,
 * точността е преди скоростта" line 145 times. The row was not occasionally
 * pointing the wrong way; on this corpus it pointed the wrong way 82 % of the
 * times it spoke approvingly.
 *
 * WHY THE COPY AND NOT THE FOLD. Doc 76 §6 is explicit that time is
 * INFORMATIONAL — it may never move a star — and it does not: `points: null`,
 * `measuredCount` untouched, and the star fold below never reads
 * `parTimeSec`. The defect was never in the arithmetic. It was that the row
 * was written as a two-sided VERDICT — target met / target missed — so the
 * „met" side read as praise for speed with nothing to say it was not. THEO-4
 * (doc 64, founder-ratified) forbids a bare verdict; „в ориентира от 60 с." is
 * a bare verdict, and on this lesson it is a bare verdict pointing the wrong
 * way.
 *
 * The over-par branch already carries the north-star sentence («спокойно,
 * точността е преди скоростта») and is left byte-identical — deliberately, and
 * not only because `b15-lawful-wait.test.ts` pins it with an exact `toBe`: it
 * is the half that was already right, and the two halves now say the same
 * thing about what the ориентир is.
 *
 * WHAT THIS DOES NOT CLOSE, so nobody reads more into it than it does: the two
 * drives still land on the same star row, the same verdict and the same XP,
 * because nothing on this lesson MEASURES the manoeuvre (`rubric: {
 * parTimeSec: 60 }`, like 128 of 162 shipped rubrics — doc 86 D7). Removing
 * the reward for speed is not the same as rewarding care. That half needs an
 * authored quality component, which lives in `templates-*.ts`.
 */
const PAR_TIME_NOT_A_TARGET_BG =
  "Ориентирът е груба мярка колко трае маршрутът в спокойно темпо, а не цел за " +
  "надбягване: по-бързото каране не добавя звезда и не променя изпитния лист. " +
  "Безопасната скорост я определя пътят — знакът, видимостта и хората по него.";

/**
 * THE COMPARISON THE ROW MADE AGAINST A ROUTE THAT WAS NEVER DRIVEN.
 *
 * `parTimeSec` is authored as the guideline for the WHOLE lesson. `durationSec`
 * on an ABORTED session is the time the student spent not finishing it. The row
 * put the two either side of „при ориентир" anyway, so a student who pressed
 * «Прекрати урока» was told he was three to five times over a guideline for a
 * route he stopped part-way through — one card below the debrief's own «Урокът
 * беше прекъснат преди края». Two surfaces of the same result screen, saying
 * different things about the same drive.
 *
 * MEASURED · w11 · 59 of the corpus's lanes end that way and every one of them
 * printed a comparison. My own lane's exhibits are four of them, including the
 * frame `sc-vp-readiness:f1469fc5` is filed on — «259 с при ориентир 55 с» on a
 * drive that never reached either of its two checkpoints. (The 253–291 s
 * cluster is the audit harness's own budget wall, not a student's pace; that is
 * why it is so uniform. The defect is not the harness's — a real student who
 * quits at 30 s of a 55 s lesson gets the OTHER branch and is congratulated for
 * being „в ориентира" on a lesson he abandoned.)
 *
 * WHAT IT DOES NOT DO — and this matters, because withholding a comparison is
 * one keystroke away from hiding a mismatch somebody filed a row about. BOTH
 * NUMBERS STAY ON THE CARD, his and the ориентир's; only the claim that one is
 * a verdict on the other is dropped, and the row says why and what would make
 * the comparison mean something. `sc-ln-decisive-change:5c5e69a6` — 175 s
 * against a 60 s ориентир — is deliberately NOT covered: that drive ended
 * naturally, so its comparison is real and its row keeps printing exactly what
 * the finding says it prints.
 */
const PAR_TIME_ABORTED_BG = (parSec: number) =>
  `Ориентирът от ${parSec} с е за целия урок, а този не стигна до края — затова ` +
  `двете числа не се сравняват тук. Карай маршрута докрай и тогава времето ти ` +
  `има срещу какво да се мери.`;

/**
 * THE SAME COMPARISON, ON THE ARM `aborted` DOES NOT REACH — wave 7, lane
 * rubric, and the row's own comment above predicted it in so many words: „a
 * real student who quits at 30 s of a 55 s lesson gets the OTHER branch and is
 * congratulated for being „в ориентира" on a lesson he abandoned."
 *
 * MEASURED · sweep161 · `sc-vp-readiness/pc-wrong/audit.log`, the whole card in
 * four lines:
 *
 *     ended: true · endedNaturally: true · drive: top 59 км/ч
 *     VERDICT: НЕИЗДЪРЖАН · SCORE: 0 наказателни точки · 1 от 3 звезди
 *     OBJECTIVES (2):  – Мини контролната зона с готов кокпит
 *                      – Стигни края на отсечката
 *     „Ориентировъчно време — 47 с — в ориентира от 55 с."
 *
 * Both dashes: NEITHER checkpoint was reached. The drive ran off the end of the
 * road at 59 км/ч with the 50 disc live, met nothing the lesson asks for, and
 * the one row on the card that carries a number about it CONGRATULATED it for
 * coming in under a guideline. `aborted` is FALSE there — nobody pressed
 * «Прекрати урока»; the road simply ran out — so `PAR_TIME_ABORTED_BG` never
 * fires, and the branch that does is the one that reads as praise.
 *
 * The time was short BECAUSE the route was short. A guideline for the whole
 * lesson beaten by a drive that did none of it is not an achievement, and on a
 * product whose north-star test is „does this produce safer drivers" it is the
 * second sentence in this corpus found rewarding the flat-out bot (the first is
 * `PAR_TIME_NOT_A_TARGET_BG`, one comment up, whose census counted 42 of 51).
 *
 * SCOPED TO THE UNDER-PAR SIDE, DELIBERATELY, and this is not timidity about a
 * pinned test — the two sides differ in kind. The over-par branch says
 * «спокойно, точността е преди скоростта»: advice that slow is fine, which
 * cannot mislead whatever the route did. The under-par branch makes a CLAIM —
 * that a target was met — and that claim is what an unfinished route falsifies.
 * `__tests__/rubric.test.ts` („a drive that ENDED — however badly — keeps its
 * comparison exactly as filed", sc-ln-decisive-change:5c5e69a6, 175 s over a
 * 60 s ориентир with a task unmet) argued that side on purpose and stays
 * byte-identical; so does `b15-lawful-wait.test.ts`, whose fixture completes.
 *
 * BOTH NUMBERS STAY ON THE CARD — the same discipline `PAR_TIME_ABORTED_BG`
 * states and for the same reason: refusing a comparison is one keystroke away
 * from hiding the mismatch somebody filed a row about.
 */
const PAR_TIME_UNFINISHED_BG = (parSec: number) =>
  `Ориентирът от ${parSec} с е за целия маршрут, а тук останаха неизпълнени ` +
  `задачи от него — по-малкото време идва от по-малко изминат маршрут, не от ` +
  `добро каране. Изпълни всички задачи и тогава времето ти има срещу какво да ` +
  `се мери.`;

export function scoreRubric(
  result: LessonResult,
  rubric: RubricSpec,
  observation?: RubricObservationInput,
): RubricScore {
  const breakdownBg: RubricBreakdownLine[] = [];
  let earned = 0;
  let measuredCount = 0;

  // -- Placement accuracy (bay centering + heading, A10 detail channel).
  if (rubric.placement) {
    const d = parkChannelOf(result, rubric.placement.objectiveId)?.detail ?? null;
    if (d && d.alignment !== null) {
      const points = d.alignment === "centered" ? 2 : d.alignment === "acceptable" ? 1 : 0;
      earned += points;
      measuredCount += 1;
      const offsets =
        d.centerOffsetM !== null && d.headingOffsetDeg !== null
          ? ` (отместване ${fmt1(d.centerOffsetM)} м, ъгъл ${fmt1(d.headingOffsetDeg)}°)`
          : "";
      breakdownBg.push({
        id: "placement",
        labelBg: "Точност на позицията",
        detailBg:
          d.alignment === "centered"
            ? `Центрирано в очертанията${offsets}.`
            : d.alignment === "acceptable"
              ? `В очертанията, с малко отместване${offsets}.`
              : `В очертанията, но неподравнено${offsets} — коригирай преди да спреш.`,
        points: points as 0 | 1 | 2,
        measured: true,
      });
    } else {
      breakdownBg.push({
        id: "placement",
        labelBg: "Точност на позицията",
        detailBg: "Няма измерване — маневрата не е завършена в очертанията.",
        points: null,
        measured: false,
      });
    }
  }

  // -- Maneuver economy: bay-entry `attempts` on the parkInBay channel, or
  //    direction-change `movements` on the threePointTurn one.
  if (rubric.economy) {
    const park = parkChannelOf(result, rubric.economy.objectiveId);
    const d = park?.detail ?? null;
    // The economy channel rides EITHER the parkInBay bay-entry attempts OR the
    // threePointTurn direction-change movements (a clean turn = 3 movements).
    const turnCh = d ? null : turnChannelOf(result, rubric.economy.objectiveId);
    const turn = turnCh?.detail ?? null;
    // THE GOAL IS THE AUTHORED ONE. „целта е в три" and „целта е от първия"
    // were written in, and the catalog does not agree with either everywhere:
    // of the 54 authored economy rubrics 51 carry `attemptsFor3Stars: 1` and 3
    // carry 3 (the two three-point-turn templates, templates-maneuver.ts). So
    // sc-maneuver-uturn — „Обръщане в ЕДНО движение", 1/2 at L1–L3 — told a
    // two-movement turn „приемливо, целта е в три": the student is OVER the
    // authored goal and the sentence congratulates him for being under it.
    // A rung may also tighten it (that template's L4/L5 go to 1/1), so the
    // number has to be read, not remembered.
    const goal = rubric.economy.attemptsFor3Stars;
    // A bay-entry count is FINAL only once the maneuver came to rest in the
    // outline (`alignment` is set at exactly `inBay && stopped` —
    // objectives.ts stepParkInBay) or the objective completed. Before that it
    // can still grow, so it supports the grade it can no longer escape and no
    // better one. „Твърде много корекции" stays a conviction — more attempts
    // cannot make it untrue — but „Паркира от първи опит — чиста маневра" over
    // a car that crossed the outline once and then hit the van is praise for a
    // park that never happened. Same fold as the star branch at the bottom of
    // this file: a credit is owed evidence, and a count still running is not
    // evidence yet.
    const settled = park !== null && (park.done || park.detail.alignment !== null);
    if (d !== null && d.attempts > 0) {
      const points = d.attempts <= goal ? 2 : d.attempts <= rubric.economy.attemptsFor2Stars ? 1 : 0;
      if (points > 0 && !settled) {
        breakdownBg.push({
          id: "economy",
          labelBg: "Икономичност на маневрата",
          detailBg: `${d.attempts === 1 ? "Един опит" : `${d.attempts} опита`} досега — маневрата не спря в очертанията, затова икономичността не се оценява.`,
          points: null,
          measured: false,
        });
      } else {
        earned += points;
        measuredCount += 1;
        breakdownBg.push({
          id: "economy",
          labelBg: "Икономичност на маневрата",
          detailBg:
            points === 2
              ? `Паркира от ${d.attempts === 1 ? "първи опит" : `${d.attempts} опита`} — чиста маневра.`
              : points === 1
                ? `${d.attempts} опита — приемливо, целта е ${goal === 1 ? "от първия" : `до ${goal} опита`}.`
                : `${d.attempts} опита — твърде много корекции; подмини по-широко и започни отново.`,
          points: points as 0 | 1 | 2,
          measured: true,
        });
      }
    } else if (turn && turn.movements > 0) {
      const points = turn.movements <= goal ? 2 : turn.movements <= rubric.economy.attemptsFor2Stars ? 1 : 0;
      // THE SAME FOLD AS THE BAY COUNT ABOVE, ON THE ARM IT WAS NEVER APPLIED
      // TO. `movements` is `reversals + 1` and `reversals` keeps counting for
      // as long as the objective stays open (objectives.ts stepThreePointTurn),
      // so until the turn has come to rest facing back inside the corridor —
      // which is exactly what `done` means for this maneuver — the count can
      // still grow. It therefore supports the grade it can no longer escape
      // and no better one: „твърде много превключвания" stays a conviction,
      // „чиста маневра" over a turn that never finished does not.
      //
      // MEASURED · sweep161 · sc-maneuver-uturn/mobile-right: the debrief
      // printed „Задачи от маршрута – Задача 2: обърни посоката на 180° в едно
      // движение" — a DASH, the task unmet, „Не всички задачи от маршрута бяха
      // изпълнени" above it — and one card higher „Икономичност на маневрата
      // 2 / 2 т. за изпълнение · Обратен завой в 1 движения — чиста маневра."
      // (RUN.log, 08-debrief.png). objectives.ts has since stopped counting a
      // movement before the facing comes back, which takes that particular
      // drive to 0; it does not reach the turn that DID swing round and then
      // rolled out of the corridor, nor the residual its own comment names
      // (entering the box already facing back). Both land here.
      const turnSettled = turnCh !== null && turnCh.done;
      if (points > 0 && !turnSettled) {
        breakdownBg.push({
          id: "economy",
          labelBg: "Икономичност на маневрата",
          detailBg: `${turn.movements === 1 ? "Едно движение" : `${turn.movements} движения`} досега — завоят не спря в коридора, затова икономичността не се оценява.`,
          points: null,
          measured: false,
        });
      } else {
        earned += points;
        measuredCount += 1;
        breakdownBg.push({
          id: "economy",
          labelBg: "Икономичност на маневрата",
          detailBg:
            points === 2
              ? `Обратен завой в ${movementsBg(turn.movements)} — чиста маневра.`
              : points === 1
                ? `${turn.movements} движения — приемливо, целта е в ${movementsBg(goal)}.`
                : `${turn.movements} движения — твърде много превключвания; при по-широко начало завоят става в ${movementsBg(goal)}.`,
          points: points as 0 | 1 | 2,
          measured: true,
        });
      }
    } else {
      breakdownBg.push({
        id: "economy",
        labelBg: "Икономичност на маневрата",
        // THE SENTENCE NAMES THE SHAPE THIS LESSON HAS. „очертания" are a bay;
        // a U-turn drill has a corridor and no bay anywhere in it, and an
        // objective the route never reached has neither. MEASURED · sweep161 ·
        // sc-maneuver-uturn/mobile-wrong: task 1 was never met, so task 2 never
        // became current and never produced a detail (engine.ts steps only the
        // current objective) — and the boulevard U-turn card read „Няма
        // измерване — колата не е влизала в очертанията" (RUN.log).
        detailBg:
          turn !== null
            ? "Няма измерване — завоят не е направен в коридора."
            : d !== null
              ? "Няма измерване — колата не е влизала в очертанията."
              : "Няма измерване — до тази маневра не се стигна.",
        points: null,
        measured: false,
      });
    }
  }

  // -- Observation completeness (glances vs authored required moments).
  if (rubric.observation) {
    const required = rubric.observation.moments;
    // Zero authored moments used to read `ratio = 1` → a full 2/2 handed to
    // every driver alive for a check nobody wrote, AND a measured component,
    // which by itself carries the fold to 3★. `validate.ts:261` rejects an
    // empty `moments` at authoring time, so no shipped template reaches here —
    // but `scoreRubric` is also called on a runtime-merged rubric in
    // `simulator/actions.ts`, where that gate has already run and passed on a
    // different object. A component with nothing to look for measures nothing.
    if (observation && required.length > 0) {
      const observed = new Set(observation.observedMomentIds);
      const covered = required.filter((m) => observed.has(m.id)).length;
      const points = covered >= required.length ? 2 : covered / required.length >= 0.5 ? 1 : 0;
      earned += points;
      measuredCount += 1;
      breakdownBg.push({
        id: "observation",
        labelBg: "Наблюдение",
        detailBg:
          points === 2
            ? `Огледа се във всички ${required.length} ключови момента.`
            : `Огледа се в ${covered} от ${required.length} ключови момента — огледалата и рамото са част от маневрата.`,
        points: points as 0 | 1 | 2,
        measured: true,
      });
    } else {
      // THE ONE ROW IN THE PRODUCT THAT GRADES MIRRORS AND THE SHOULDER CHECK,
      // AND THE SENTENCE IT USED TO PRINT WHEN IT COULD NOT.
      //
      // „Все още не се измерва в този режим." was two things at once, and both
      // were wrong by the time sweep161 photographed it. It was STALE — the
      // glance channel is wired (LessonPlayShell.tsx `finalize` maps the
      // recorded attempt through `parkingObservationFromTrace`, and the server
      // path re-reads `wire.observedMomentIds` in simulator/actions.ts), so
      // „още не" describes a gap that closed, and „в този режим" invites the
      // student to believe some other mode does look. And it TAUGHT NOTHING:
      // on the only card in the product that grades оглеждане, a student who
      // moved off without a mirror or a shoulder check was handed a shrug.
      //
      // MEASURED · sweep161 · `sc-park-van/mobile-right/08-debrief.png` —
      // „Наблюдение · Все още не се измерва в този режим" on a lesson whose own
      // examiner note is „Изпитващият гледа наблюдението (двете огледала, рамо,
      // и допълнителния поглед към закритата страна)"; and
      // `sc-pk-move-off/pc-wrong/04-t012s.png`, where „Потегли и се нареди в
      // дясната лента" is ticked green for a drive with no mirror check and no
      // shoulder check in it.
      //
      // The row still reports measured:false and points:null — the „не се
      // измерва" in the points column stays, because it is TRUE and hiding it
      // would be the real damage. What it now adds is the reason, the drill
      // itself (the authored moments, named — this is what a virtual instructor
      // owes a student who cannot be graded on them yet), and the consequence
      // for the grade, appended by the pass below.
      //
      // VERIFIER, ROUND 2 — THE OPENING CLAUSE WAS A REMARK ABOUT THE STUDENT.
      //
      // The note above promises this row now "gives the reason". The shipped
      // string did not contain one. It opened «Оглеждането ти не стигна до
      // оценката на това каране» — a sentence whose subject is ОГЛЕЖДАНЕТО ТИ,
      // i.e. the student's looking, on a card where the only true statement is
      // about the INSTRUMENT: no glance record reached this call.
      //
      // That is not a nicety. `parkingObservationFromTrace` (scenario/
      // observation.ts) returns null unless the drive contains a reverse phase
      // (`gear < 0`), and 12 of the 27 templates that author observation
      // moments are not parking drills — so on those lessons this row is the
      // permanent state, and a student who DID check both mirrors and his
      // shoulder is told his looking „did not reach" the grade, with no reason
      // offered and nothing to appeal to. A soft negative with no cause is
      // still a verdict with no evidence, which is the defect this whole round
      // exists to retire, and doc 64 THEO-4 forbids it by name.
      //
      // So the row now opens the way its two siblings do — «Няма измерване —»,
      // the same construction placement and economy print — states WHY (the
      // simulator did not register the glances), says outright that this is the
      // record's limit and not a mark against him, and only then hands over the
      // drill. Nothing the previous pass added is removed: the authored moment
      // titles are still named, `measured:false` / `points:null` still stand,
      // and the consequence clause is still appended by the pass below.
      const namesBg = required.map((m) => m.titleBg).join(" · ");
      breakdownBg.push({
        id: "observation",
        labelBg: "Наблюдение",
        detailBg:
          required.length === 0
            ? "Този урок не е задал контролни погледи, затова няма какво да се измери тук."
            : `Няма измерване — симулаторът не отчете погледите ти на това каране, ` +
              `затова наблюдението не е оценено; това е ограничение на записа, а не ` +
              `бележка към теб. Провери се сам по това, което изпитващият гледа тук: ` +
              `${namesBg}.`,
        points: null,
        measured: false,
      });
    }
  }

  // -- Every row that measured nothing now says what that costs the grade.
  //
  // This runs HERE and not at each push because the answer depends on the whole
  // card: a placement row that abstained while economy scored is one indicator
  // missing from a real measurement, and says so; the same row on a drive where
  // NOTHING scored is the card admitting the star row is not its own opinion.
  // `measuredCount` is final at this point — only the three quality components
  // increment it, and all three are behind us; par time never did and never
  // will (doc 76 §6: time is informational, and the fold below ignores it).
  //
  // The par-time row is untouched by construction: it reports measured:true.
  const nothingMeasured = measuredCount === 0;
  for (const line of breakdownBg) {
    if (line.measured) continue;
    line.detailBg = `${line.detailBg} ${nothingMeasured ? NO_QUALITY_MEASURED_BG : NOT_IN_STARS_BG}`;
  }

  // -- Par time: informational line only (doc 76 §6).
  //
  // B15 (2026-08-04): the comparison runs on DRIVING time, not clock time.
  // `parTimeSec` never touched a star and still does not — but the line it
  // prints is read, and telling a student who waited forty seconds for a real
  // gap at a give-way line that he was over the guideline is telling him the
  // correct thing was the slow thing. Waiting is not the drill's clock running;
  // it IS the drill. `yieldWaitSec` is the engine's measure of the seconds he
  // spent lawfully stationary at a yield (finish.ts `stepYieldWait`) and it
  // comes out of the comparison. Absent (server-rebuilt results, curriculum
  // lessons, any drive with no wait) ⇒ 0 ⇒ byte-identical to what shipped.
  if (rubric.parTimeSec !== undefined) {
    const waitSec = Math.max(0, Math.min(result.yieldWaitSec ?? 0, result.durationSec));
    const drivingSec = result.durationSec - waitSec;
    const waitRounded = Math.round(waitSec);
    const over = drivingSec > rubric.parTimeSec;
    // Only spoken when it actually moved the reading — a 1 s twitch at a red
    // does not need a sentence, and THEO-4 asks for explanation, not noise.
    const waitNote =
      waitRounded > 0
        ? ` (${waitRounded} с чакане на предимство не се броят — изчакването е част от задачата)`
        : "";
    breakdownBg.push({
      id: "parTime",
      labelBg: "Ориентировъчно време",
      detailBg: result.aborted
        ? // The student ended the lesson himself, so `durationSec` does not
          // cover the route `parTimeSec` describes and neither branch below is
          // true of him. Both numbers still print — see PAR_TIME_ABORTED_BG.
          `${Math.round(drivingSec)} с до прекъсването${waitNote}. ${PAR_TIME_ABORTED_BG(Math.round(rubric.parTimeSec))}`
        : over
          ? // OVER the ориентир — byte-identical to what shipped, on purpose,
            // and tested that way from two suites. This branch offers ADVICE
            // („спокойно, точността е преди скоростта"), not a finding that a
            // target was met, so an unfinished route cannot falsify it.
            `${Math.round(drivingSec)} с при ориентир ${Math.round(rubric.parTimeSec)} с${waitNote} — спокойно, точността е преди скоростта.`
          : !result.completedAll
            ? // UNDER the ориентир on a route whose tasks were NOT all met. The
              // claim „в ориентира" is exactly the one an unfinished route
              // falsifies — the time is short because the driving was short.
              // MEASURED · sweep161 · sc-vp-readiness/pc-wrong: «47 с — в
              // ориентира от 55 с» with both checkpoints unmet at 59 км/ч.
              // See PAR_TIME_UNFINISHED_BG.
              // The ориентир's own number is not dropped — it prints inside
              // PAR_TIME_UNFINISHED_BG. What is dropped is only the „в
              // ориентира" verdict laid over it.
              `${Math.round(drivingSec)} с${waitNote}. ${PAR_TIME_UNFINISHED_BG(Math.round(rubric.parTimeSec))}`
            : // UNDER the ориентир on a route driven to the end. The number and
              // the clause that carries it are byte-identical to what shipped;
              // what follows is the reason the row owed a student who has just
              // been told he beat a guideline on a driving lesson. See
              // PAR_TIME_NOT_A_TARGET_BG for the corpus census — 42 of the 51
              // congratulations went to the bot driving badly on purpose.
              `${Math.round(drivingSec)} с — в ориентира от ${Math.round(rubric.parTimeSec)} с${waitNote}. ${PAR_TIME_NOT_A_TARGET_BG}`,
      points: null,
      measured: true,
    });
  }

  // -- REVERTED IN WAVE 7 · THE „showedUncharged" STAR CAP · DO NOT REBUILD IT
  // WITHOUT READING THIS FIRST.
  //
  // WHAT WAS BUILT AND TAKEN OUT AGAIN. A predicate here read
  // `LessonResult.coachedMistakes` — the shown-but-deliberately-uncharged
  // violations, the teach-first arm's record — and used it twice: the
  // unmeasured branch below required `!showedUncharged` for its third star, and
  // the legality cap became `(result.score > 0 || showedUncharged)`. The
  // ARGUMENT for it still looks right and is left standing where it belongs
  // (`lessons/types.ts` on the channel, `hud/SessionEndScreen.tsx:465` on the
  // sentence it already fixed): a drive the simulator had to interrupt to say
  // «Превишена скорост» is not a drive that earns the product's top mark for
  // quality, and „чисто" meaning „nothing was BILLED" is exactly the confusion
  // this corpus keeps filing rows about. What follows is why the code was
  // nevertheless wrong, measured rather than argued.
  //
  // 1. THE EXHIBIT DID NOT REPRODUCE. It was argued from
  //    `sweep161/sc-pk-move-off/pc-wrong` — «+1 Превишена скорост» beside
  //    «0 наказателни точки · 3 от 3 звезди». Re-driven at HEAD,
  //    `.audit-frames/w14/frames/sc-pk-move-off__pc-wrong/_audit-debrief.json`
  //    reads `verdict ИЗДЪРЖАН · score 1 · „2 от 3 звезди"`, with «Превишена
  //    скорост −1 изпитна т. · ВТОРОСТЕПЕННА» in the Грешки table. THE SPEEDING
  //    IS CHARGED NOW. `result.score > 0` alone already caps that drive at 2★,
  //    so on the one scenario the predicate was built for it changed nothing.
  //    The corpus it was reasoned from was four waves stale.
  //
  //    1a. AND THAT PARAGRAPH IS ITSELF HALF FALSE — corrected 2026-08-28,
  //    round 14, because it is the sentence that will stop the next wave from
  //    landing the repair. It reads the PC lane only. The row it was answering
  //    (`sc-pk-move-off:948b1cab`) says «BOTH WRONG LANES» and its headline is
  //    the MOBILE one, and three consecutive splits recorded that lane as
  //    „NOT EXERCISED — the phone half has never once been driven". IT HAS
  //    BEEN, TWICE, and both legs are on disk:
  //
  //      .audit-frames/canary-fill/frames/sc-pk-move-off__mobile-wrong  25 Aug
  //      .audit-frames/fill-1/frames/sc-pk-move-off__mobile-wrong       26 Aug
  //
  //    `fill-1/.../run.log`, verbatim: «DRIVE: wrong · top 59 км/ч», an in-drive
  //    card «Превишена скорост · Отчетена скорост 58,8 км/ч при разрешени 50
  //    км/ч», and then «VERDICT: ИЗДЪРЖАН · SCORE: 0 наказателни точки · 3 от 3
  //    звезди · +100 XP». On the phone the 58,8 lands on the TEACH-FIRST channel
  //    and is never billed — «Учебни моменти (не влизат в точките): •
  //    Потегляне без оглеждане • Движение без предпазен колан • …и още 1» — so
  //    `result.score` is 0, no cap applies, and the fold below hands out three
  //    stars. The PC lane charges it and the phone lane does not; the predicate
  //    was built for exactly the lane nobody looked at.
  //
  //    THE REVERT IS STILL RIGHT. Reasons 2 and 3 below are untouched by this
  //    correction — fifteen model drives would still be demoted, and the
  //    demotion would still be bare — so the exhibit's return does not make the
  //    star cap safe to rebuild here. What it changes is that «the exhibit did
  //    not reproduce» may no longer be quoted as a reason to close the row. It
  //    reproduces, on a phone, on the lesson about looking before you pull out,
  //    and the card tells that student «не наруши нищо» three lines under three
  //    things he broke. See „WHAT IT WOULD TAKE TO LAND IT" below: the sentence
  //    is `hud/SessionEndScreen.tsx`'s and the star is an ADR's, and neither is
  //    this file's to write alone.
  //
  // 2. ITS ACTUAL LIVE POPULATION WAS THE REFERENCE DRIVES. Scanning every
  //    `_audit-debrief.json` in `.audit-frames/w14` for a rendered «Учебни
  //    моменти (не влизат в точките):» list finds 92 legs; FIFTEEN of them are
  //    `score 0 · every objective ✓ · currently „3 от 3 звезди"` —
  //    sc-ac-crosswind__mobile-right, sc-ac-ice__pc-right,
  //    sc-ed-reverse-line__pc-right and __mobile-right,
  //    sc-jx-priority-confidence__pc-right, sc-merge-bus-pullout__pc-right,
  //    sc-ov-lane-keeping__pc-right, sc-pe-zone-living__pc-right,
  //    sc-pk-ban-stop__pc-right, sc-pk-busstop-ban__pc-right,
  //    sc-pk-double-park__pc-right, sc-pk-rail-ban__pc-right,
  //    sc-pk-smooth-stop__pc-right, sc-sp-eco-coast__pc-right,
  //    sc-zebra-approach__mobile-right. Every one dropped to ★★☆. And that
  //    count is a FLOOR, not the population: `debrief.ts:243` filters the list
  //    against `scoredCodes` before rendering it, while this file read
  //    `result.coachedMistakes` raw, so legs whose coached row was suppressed
  //    for being charged too would also have been capped without showing why.
  //    The drives demoted were the model runs — the ones the product exists to
  //    reward — for items the product itself labels „не влизат в точките".
  //
  // 3. THE DEMOTION WAS BARE AND THE CARD THEN CONTRADICTED ITSELF — a direct
  //    requirement-zero / doc 64 THEO-4 breach, which is the reason this is a
  //    revert and not a tweak. On those fifteen, `score === 0` and no floor
  //    applies, so `manoeuvreGradeReasonBg` (`hud/SessionEndScreen.tsx:242`)
  //    returns null and NO SENTENCE explains the missing star. Worse, all
  //    fifteen author a parTime-only rubric, so `unmeasuredStarsNoteBg`
  //    (:332) still passes all three of its guards and keeps printing, beside
  //    ★★☆: «Звездите идват изцяло от изпитния лист — маршрут, изминат докрай,
  //    без нито една наказателна точка». Both halves false at once: a bare
  //    verdict plus two explanations that contradict it.
  //
  // WHAT IT WOULD TAKE TO LAND IT, and it is not this file alone. The star
  // number cannot move until the card can say why it moved, and the sentence
  // belongs to `hud/SessionEndScreen.tsx` — `manoeuvreGradeReasonBg` needs a
  // `coachedMistakes`-fed arm returning the cap's reason on `score === 0`, and
  // `unmeasuredStarsNoteBg` must then fall silent (its first guard already
  // does that for free once the reason is non-null). The lane that wrote the
  // cap diagnosed this itself and called that edit mandatory — „not safe to
  // ship alone" — and the edit was never made; the cap shipped alone anyway.
  // Beyond the wiring it is also an ADR (CLAUDE.md: strategy changes get one
  // first): „full stars from cleanliness" is a stated contract behind ~141
  // assertions, and this would redefine what the third star means.
  //
  // ONE MORE REASON THE REVERT IS RIGHT RATHER THAN MERELY SAFE: inside this
  // same uncommitted tree `lessons/finish.ts` cites «sc-ac-ice (ИЗДЪРЖАН ·
  // 0 наказателни т. · ★★★)» as its evidence that the lesson ends cleanly, and
  // sc-ac-ice__pc-right carries a coached moment («Рязко спиране без причина»).
  // The cap would have falsified another lane's evidence in the same commit.
  //
  // The row stays OPEN. Nothing below reads `coachedMistakes` any more.

  // -- Star fold.
  let stars: 1 | 2 | 3;
  if (measuredCount > 0) {
    const ratio = earned / (2 * measuredCount);
    stars = ratio >= STARS_3_MIN_RATIO ? 3 : ratio >= STARS_2_MIN_RATIO ? 2 : 1;
  } else {
    // OPEN ITEM — NOT FIXED HERE, AND DELIBERATELY SO. Nothing about the
    // maneuver was measured, so this line restates the exam sheet and the end
    // screen prints the restatement under „Оценка на маневрата" — quality of
    // execution — where a reader takes it for a second, independent opinion.
    // It is not one. It is the first one said twice, and it says „excellent"
    // on the strength of nobody having looked.
    //
    // MEASURED · sweep161. Six of the seven cockpit scenarios author a
    // `parTimeSec`-only rubric (doc 86 D7 counts 128 of 154 catalog-wide), so
    // `measuredCount` is 0 on every run of them. EVERY ИЗДЪРЖАН lane printed
    // „3 от 3 звезди" — including `sc-pk-move-off/pc-wrong`, the lane the
    // harness drives WRONG on purpose: `04-t012s.png` has the tutor's
    // „Превишена скорост · ЗДвП чл. 21, ал. 1" card up at 59 км/ч in a 50
    // zone, and `08-debrief.png` carries three filled gold stars beside it.
    // `sc-park-van/mobile-right/08-debrief.png` is the same fold from the
    // other side: all three components print „не се измерва" and the card
    // still shows a star row.
    //
    // WHY THE LINE STILL READS THIS WAY. „Full stars from cleanliness" is a
    // stated contract, not an oversight: ~141 assertions across the
    // bot-completion suites encode it, 72 of them in tests NAMED „earns full
    // stars from cleanliness", and `s-w5-bot-completion.test.ts:771` argues
    // it on purpose for corridor drills. Changing what the star scale means
    // is an ADR (CLAUDE.md: strategy changes get one first), not a one-file
    // edit — and a lane that owns this file alone cannot land it without
    // leaving those suites red. The evidence is parked here so the decision
    // is made with it rather than without it.
    //
    // WHAT DID CHANGE, AND THE HALF THAT COULD NOT. The number is untouched;
    // the SILENCE around it is not. Every row that measured nothing now carries
    // `NO_QUALITY_MEASURED_BG` — the card says the stars restate the изпитен
    // лист rather than judging the manoeuvre — so `sc-park-van` (placement +
    // economy + observation, all abstaining) and `sc-vp-handbrake`
    // (observation) stop printing a grade with no sentence attached to it.
    //
    // THE OTHER HALF NEEDED ONE THING THIS FILE DOES NOT OWN — AND IT LANDED
    // SOMEWHERE ELSE, WHICH THIS COMMENT WENT ON DENYING FOR FOUR DAYS.
    //
    // The paragraph that stood here read: 128 of 154 catalog rubrics author NO
    // quality component at all, so `breakdownBg` holds ONE row („Ориентировъчно
    // време") and there is nowhere to hang `NO_QUALITY_MEASURED_BG`; it cannot
    // go on the par-time row, because `lessons/__tests__/b15-lawful-wait
    // .test.ts:331` pins that string with an exact `toBe`; therefore it needs a
    // new member in `RubricBreakdownLine["id"]` (scenario/types.ts) — „and it
    // stays open".
    //
    // Every clause of that is still true EXCEPT the conclusion. The sentence is
    // not a row: it is the CARD's account of its own star row, and the card
    // belongs to `hud/SessionEndScreen.tsx`, which now derives it there —
    // `unmeasuredStarsNoteBg`, rendered above the breakdown list, guarded so it
    // speaks only into silence (no cap sentence from `manoeuvreGradeReasonBg`,
    // no row carrying `points`, and no row other than par time, which is the
    // 12 observation-only templates it would otherwise lie to). No new id, no
    // types.ts edit, and `s-w5-bot-completion.test.ts`'s exact
    // `toEqual(["observation", "parTime"])` never came near it.
    //
    // The routing note is corrected rather than deleted because a stale one is
    // worse than none — it sends the next reader to build a thing that is
    // already running (`lessons/finish.ts` learned the same lesson on
    // `stepOffNetwork`'s arm and says so at length). What is still open here is
    // only the NUMBER, for the reason the paragraph above gives: „full stars
    // from cleanliness" is a stated contract behind ~141 assertions, and moving
    // it is an ADR.
    //
    // `sc-pk-move-off/pc-wrong` is the exhibit and it has moved on too: at w11
    // it prints ★★☆, not ★★★, because the seatbelt fault costs it the third
    // star — the 59 км/ч in the 50 zone still books nothing, and that half is
    // `rules/engine.ts`'s speeding detector, not this file's star fold.
    //
    // THAT LAST CLAUSE IS NOW HALF STALE, and it is corrected here rather than
    // rewritten, because it is the sentence that made a whole wave misfile a
    // repair. MEASURED at HEAD (`.audit-frames/w14/frames/
    // sc-pk-move-off__pc-wrong/_audit-debrief.json`): the speeding IS booked —
    // «Превишена скорост −1 изпитна т.», `score 1`, „2 от 3 звезди". So the
    // detector charges it, `result.score > 0` caps the card, and the exhibit
    // needs nothing from this fold. The ROUTING half of the clause still
    // stands: what is BILLED is the detector's decision, not this file's.
    // Whether a shown-but-forgiven offence should also cost the third star is
    // a real and open question — see the REVERTED note above the fold for why
    // the wave-7 attempt at it had to come back out.
    stars = result.completedAll && result.score === 0 ? 3 : result.completedAll ? 2 : 1;
  }
  // Caps: quality never outranks legality.
  if (result.score > 0 && stars > 2) stars = 2;
  if (result.summary.terminated || result.summary.score.hasDangerous || result.aborted || !result.completedAll) {
    stars = 1;
  }

  return { stars, breakdownBg };
}
