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
 *                 pressure is an L5 condition, not a rubric penalty).
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
      detailBg: over
        ? `${Math.round(drivingSec)} с при ориентир ${Math.round(rubric.parTimeSec)} с${waitNote} — спокойно, точността е преди скоростта.`
        : `${Math.round(drivingSec)} с — в ориентира от ${Math.round(rubric.parTimeSec)} с${waitNote}.`,
      points: null,
      measured: true,
    });
  }

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
    // THE OTHER HALF NEEDS ONE THING THIS FILE DOES NOT OWN. 128 of 154
    // catalog rubrics (doc 86 D7) author NO quality component at all — six of
    // my eight lessons are literally `rubric: { parTimeSec: 55 }` — so
    // `breakdownBg` holds ONE row, „Ориентировъчно време", and there is nowhere
    // to put the sentence. It cannot go on the par-time row:
    // `lessons/__tests__/b15-lawful-wait.test.ts:331` pins that string with an
    // exact `toBe` on exactly this rubric shape. It needs its own row, which
    // needs one more member in `RubricBreakdownLine["id"]` (types.ts, a file no
    // lane owns and this one may not edit) — after which
    // `s-w5-bot-completion.test.ts:781`, an exact `toEqual(["observation",
    // "parTime"])`, has to stay green: emit the row ONLY when no quality
    // component is authored at all, which is precisely the case s-w5 is not.
    // `sc-pk-move-off/pc-wrong` — ★★★ over a 59 км/ч speeding card — is that
    // half, and it stays open.
    stars = result.completedAll && result.score === 0 ? 3 : result.completedAll ? 2 : 1;
  }
  // Caps: quality never outranks legality.
  if (result.score > 0 && stars > 2) stars = 2;
  if (result.summary.terminated || result.summary.score.hasDangerous || result.aborted || !result.completedAll) {
    stars = 1;
  }

  return { stars, breakdownBg };
}
