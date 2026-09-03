/**
 * „Позна ли се?" — self-assessment calibration (doc 82 §5.3 I1).
 *
 * Before the debrief unlocks, the student predicts their OWN official result:
 * how many penalty points did I just make, and did I pass? The engine's answer
 * is revealed afterwards, and the gap between the two — the calibration error —
 * is tracked as its own trend.
 *
 * WHY this exists at all (doc 82 §5.1): realism has a null crash-reduction
 * evidence base; self-assessment calibration has a positive one. Gregersen
 * 1996 on novice overestimation, Mynttinen 2009 — only ~50% (FI) and 25–35%
 * (SE) of licence candidates self-assess realistically. Overconfidence is a
 * documented crash mechanism, and it is the one thing this product can measure
 * that a video course cannot: we have an OBJECTIVE official-format score for
 * the student to be wrong about.
 *
 * The gate is only honest if the engine is (doc 82 §7.4 item 28): audit H-5
 * (OVERTAKING_AT_CROSSING direction gate) and H-6 (host-edge gate on
 * crossingPassed) had to be closed first, or the "error" measured here would
 * be the engine's unfairness wearing the student's name. Both landed in
 * 165a58b — see rules/engine.ts:743 and :1706 and their regression suites.
 *
 * PURE by construction: no React, no Prisma, no content repo, no imports at
 * all. That is what lets the client gate widget deep-import this file for its
 * copy and its verdict without dragging the learning module's server half into
 * a browser bundle (the same reasoning that keeps clips/replay/* off the
 * clips/view barrel).
 */

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/**
 * One self-prediction paired with the engine's verdict for the same drive.
 *
 * Both halves of the pair are stored, not just the error: the actuals are
 * DENORMALISED off SimSession on write so the trend is a single-table read and
 * so a later re-grade (a detector fix, a catalog re-point) can never silently
 * rewrite history the student already saw. A calibration record is evidence of
 * what the student believed at a moment, and evidence does not get patched.
 */
export interface CalibrationRecord {
  simSessionId: string;
  lessonId: string;
  /** What the student predicted, in official penalty points. */
  predictedPoints: number;
  predictedPass: boolean;
  /** What the rule engine actually scored (server-derived, never client). */
  actualPoints: number;
  actualPass: boolean;
  recordedAt: Date;
}

/** The two numbers the client is allowed to send. Everything else is derived
 *  server-side from the already-persisted session. */
export interface PredictionInput {
  predictedPoints: number;
  predictedPass: boolean;
}

/**
 * Refusal ceiling on the predicted points. The official practical exam fails
 * at 10 (docs/education/32), so anything past ~30 is not a belief about this
 * drive — it is a fat finger or a hand-crafted request. Clamping instead of
 * rejecting would quietly fabricate a belief the student never held, so the
 * parse REFUSES.
 */
export const MAX_PREDICTED_POINTS = 30;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN THE ANSWER DOES NOT FIT IN THE QUESTION (sc-junction-rhr:c6d88f3f).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE FRAME. `sweep161/sc-junction-rhr/pc-right/07-end.png` — the gate asks
 * «Цяло число от 0 до 30», and the sibling drive photographed in the same
 * chunk (`sweep161/sc-junction-stop/pc-wrong/drive.log:1200`) ends
 * «VERDICT: НЕИЗДЪРЖАН · SCORE: 394 наказателни точки». Both numbers are the
 * SAME unit — the ceiling above is a cap on the FIELD, not on the protocol,
 * and `store.record` copies `SimSession.score` in whole.
 *
 * STILL LIVE AT HEAD, MEASURED RATHER THAN ASSUMED: of the 151 drives in
 * `.audit-frames/w25` that reached a score, 7 scored above 30 (max 53) —
 * sc-turn-left-oncoming 43, sc-ed-poligon-chain 53, sc-junction-gap 40 …
 * The runaway totals are smaller than they were; the ceiling is unchanged.
 *
 * WHAT IT DID TO THE STUDENT, WHICH IS WORSE THAN THE MISMATCH. `predicted −
 * actual` is only a reading of self-knowledge when the truth was SAYABLE. Past
 * the cap it is not: the largest number the form accepts is still below the
 * protocol, so EVERY such student — including one who knew perfectly well he
 * had wrecked the drive and typed the maximum he was allowed — scored a large
 * negative error, was classified `overconfident`, and was told «Оцени се
 * по-високо, отколкото беше». The product bounded the answer and then convicted
 * him of the bound. That is a bare verdict, and a false one (doc 64 THEO-4).
 *
 * WHY NOT SIMPLY RAISE THE CEILING. The paragraph above it is right: past ~30
 * a typed number stops being a belief about the drive. A field that accepts 400
 * measures typing, not judgement. So the cap stays and the MECHANIC learns to
 * say when it could not contain the answer — which is also the only branch that
 * can be honest about a scale the student never saw.
 *
 * Total-order note: this is a PREDICATE and a copy pair, deliberately not a
 * fourth `CalibrationVerdict`. The verdict type keys two exhaustive `Record`s
 * (title + body) and three counters in `summarizeCalibration`; a fourth member
 * would silently mis-bucket in the `else` branch there and force every consumer
 * to grow a case for a state that is not a judgement at all.
 */
export function isBeyondPredictableScale(actualPoints: number): boolean {
  return Number.isFinite(actualPoints) && actualPoints > MAX_PREDICTED_POINTS;
}

/**
 * The headline for that case. NOT a verdict — it names the question's limit,
 * because the student's judgement was never measured here.
 */
export const CALIBRATION_BEYOND_SCALE_TITLE_BG =
  "Въпросът не можеше да побере това каране";

/**
 * …and the WHY, which requirement-zero makes non-optional: a screen that
 * withholds a verdict must say what it is withholding and what the number in
 * front of the student means instead.
 *
 * BOTH NUMBERS ARE NAMED and neither is typed twice — the cap comes from the
 * constant the field is built from, the total from the protocol. No class
 * tariff appears here on purpose: this file imports nothing (see the header),
 * so a „10 изпитни т." written in it would be a hand-copied scale, which is
 * exactly how the over-claim in `scales.ts` reached four surfaces. The gate
 * renders `EXAM_POINTS_SHORT_NOTE_BG` beside this text and that constant is
 * sourced.
 */
export function calibrationBeyondScaleBodyBg(actualPoints: number): string {
  return (
    `Полето приема най-много ${MAX_PREDICTED_POINTS} наказателни точки, а протоколът за това ` +
    `каране е ${actualPoints}. Дори най-високото число, което изобщо можеше да напишеш, е под ` +
    "истината — затова разликата по-долу измерва тавана на въпроса, а не твоята преценка, и " +
    "това каране не влиза в тенденцията ти. Самото число обаче казва нещо: толкова точки не се " +
    "събират от разсеяност, а от повтаряне на една и съща тежка грешка. Отвори разбора и виж " +
    "ПЪРВАТА от тях — изпитът свършва там, а всичко след нея е същата грешка още веднъж."
  );
}

/**
 * The one place that decides what the reveal says.
 *
 * Both the server action and the trend page used to read
 * `CALIBRATION_VERDICT_TITLE_BG[classifyCalibration(record)]` directly, i.e.
 * two copies of a rule with no branch in it. One function, so the ceiling case
 * cannot be honest on one surface and a conviction on the other.
 */
export interface CalibrationRevealCopy {
  /** The protocol went past what the form would let the student say. */
  beyondScale: boolean;
  titleBg: string;
  bodyBg: string;
}

export function calibrationRevealCopy(record: CalibrationRecord): CalibrationRevealCopy {
  if (isBeyondPredictableScale(record.actualPoints)) {
    return {
      beyondScale: true,
      titleBg: CALIBRATION_BEYOND_SCALE_TITLE_BG,
      bodyBg: calibrationBeyondScaleBodyBg(record.actualPoints),
    };
  }
  const verdict = classifyCalibration(record);
  return {
    beyondScale: false,
    titleBg: CALIBRATION_VERDICT_TITLE_BG[verdict],
    bodyBg: CALIBRATION_VERDICT_BODY_BG[verdict],
  };
}

/**
 * Validate a client-sent prediction. Returns null for anything that is not a
 * whole, in-range point count — the caller answers INVALID_INPUT rather than
 * storing a number it had to guess at.
 */
export function parsePredictionInput(value: unknown): PredictionInput | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  const points = o.predictedPoints;
  if (typeof points !== "number" || !Number.isInteger(points)) return null;
  if (points < 0 || points > MAX_PREDICTED_POINTS) return null;
  if (typeof o.predictedPass !== "boolean") return null;
  return { predictedPoints: points, predictedPass: o.predictedPass };
}

// ---------------------------------------------------------------------------
// One record's verdict
// ---------------------------------------------------------------------------

/**
 * How the student's self-image sat against the engine's.
 *
 * SIGN CONVENTION, stated once because everything below depends on it:
 * `error = predicted − actual`. A student who predicted 2 points and earned 7
 * scores −5 — they thought they drove BETTER than they did. Negative is the
 * dangerous direction, and it is the one the literature calls overconfidence.
 */
export type CalibrationVerdict = "overconfident" | "accurate" | "underconfident";

/**
 * Half-width of the „позна" band, in penalty points. Two points is one основна
 * mistake (3 т.) minus a второстепенна (1 т.) — i.e. the student had the shape
 * of the drive right and missed one small thing. Tighter than that would grade
 * memory rather than judgement: nobody counts their own points to the unit,
 * and a product that says „не позна" for being off by one teaches nothing.
 */
export const ACCURATE_BAND_POINTS = 2;

/** predicted − actual. Negative = the student flattered themselves. */
export function calibrationError(record: CalibrationRecord): number {
  return record.predictedPoints - record.actualPoints;
}

export function classifyCalibration(record: CalibrationRecord): CalibrationVerdict {
  const error = calibrationError(record);
  if (error < -ACCURATE_BAND_POINTS) return "overconfident";
  if (error > ACCURATE_BAND_POINTS) return "underconfident";
  return "accurate";
}

/** Did the student call the pass/fail verdict itself right? Tracked apart from
 *  the point error because it is the claim that maps onto the real exam: being
 *  6 points optimistic matters far more when it crosses the ≤9 line. */
export function verdictAgrees(record: CalibrationRecord): boolean {
  return record.predictedPass === record.actualPass;
}

// ---------------------------------------------------------------------------
// The trend
// ---------------------------------------------------------------------------

/**
 * Below this many records the summary reports no trend at all. Three is not a
 * statistically satisfying number — it is the smallest one at which „ставаш
 * по-точен" is not literally a comparison of one drive against one drive, and
 * the screen says how many are still missing rather than drawing a line
 * through noise (the same honesty rule /review/calibration applies to the ДАИ
 * outcome pairing).
 */
export const CALIBRATION_MIN_SAMPLES = 3;

export interface CalibrationPoint {
  simSessionId: string;
  lessonId: string;
  recordedAt: Date;
  predictedPoints: number;
  actualPoints: number;
  /** predicted − actual (see the sign convention above). */
  error: number;
  verdict: CalibrationVerdict;
  verdictAgreed: boolean;
  /**
   * The protocol scored past `MAX_PREDICTED_POINTS`, so `error` is the form's
   * ceiling and not this student's judgement — see `isBeyondPredictableScale`.
   * The row is still LISTED (it is evidence of a drive that happened) and is
   * kept out of every aggregate below.
   */
  beyondScale: boolean;
}

export interface CalibrationSummary {
  /** Oldest → newest, i.e. left-to-right chart order. */
  points: CalibrationPoint[];
  sampleCount: number;
  /** Records still needed before a trend is claimed; 0 once there are enough. */
  samplesUntilTrend: number;
  /** Mean of predicted − actual. Negative = habitually overconfident. */
  meanError: number | null;
  /** Mean |predicted − actual| — the accuracy number, where flattering and
   *  harsh predictions do NOT cancel each other out. */
  meanAbsError: number | null;
  overconfidentCount: number;
  accurateCount: number;
  underconfidentCount: number;
  /**
   * Drives whose protocol went past the form's ceiling. They are excluded from
   * `meanError`, `meanAbsError`, the three verdict counts and the trend — one
   * −364 in the mean is not a habit, it is an artefact of the question — and
   * counted here so the screen can say so instead of losing them silently.
   */
  beyondScaleCount: number;
  /** Share of drives whose pass/fail call was right (0..1); null when empty.
   *  Beyond-scale drives DO count here: «издържан / неиздържан» is a claim the
   *  student could always make truthfully, whatever the total turned out to be. */
  verdictAgreementRate: number | null;
  /**
   * Is the student getting better at reading their own driving? Compares the
   * mean |error| of the newer half against the older half. null until there
   * are enough records for both halves to mean something.
   */
  trend: "improving" | "steady" | "worsening" | null;
}

/** Half-a-point of movement in mean |error| is noise, not learning. */
const TREND_DEADBAND_POINTS = 0.5;

/**
 * Fold records into the chart + copy model. Input order is not trusted —
 * records are sorted oldest-first here, because both the chart and the
 * older-half/newer-half trend depend on chronology and the store hands them
 * back newest-first.
 */
export function summarizeCalibration(
  records: ReadonlyArray<CalibrationRecord>,
): CalibrationSummary {
  const ordered = [...records].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );

  const points: CalibrationPoint[] = ordered.map((r) => ({
    simSessionId: r.simSessionId,
    lessonId: r.lessonId,
    recordedAt: r.recordedAt,
    predictedPoints: r.predictedPoints,
    actualPoints: r.actualPoints,
    error: calibrationError(r),
    verdict: classifyCalibration(r),
    verdictAgreed: verdictAgrees(r),
    beyondScale: isBeyondPredictableScale(r.actualPoints),
  }));

  const n = points.length;
  const empty = n === 0;

  let errorSum = 0;
  let absSum = 0;
  let agreed = 0;
  let overconfidentCount = 0;
  let accurateCount = 0;
  let underconfidentCount = 0;
  /** The drives whose point error is a reading of judgement at all. */
  const graded: CalibrationPoint[] = [];
  for (const p of points) {
    // The pass/fail call is answerable on every drive, so it is counted on
    // every drive; the point error is not (see `beyondScaleCount`).
    if (p.verdictAgreed) agreed++;
    if (p.beyondScale) continue;
    graded.push(p);
    errorSum += p.error;
    absSum += Math.abs(p.error);
    if (p.verdict === "overconfident") overconfidentCount++;
    else if (p.verdict === "accurate") accurateCount++;
    else underconfidentCount++;
  }
  const g = graded.length;

  return {
    points,
    sampleCount: n,
    // Counted in GRADED records, because that is what the trend is drawn
    // through: promising a trend at three records and then withholding one
    // because two of them were off the scale is the screen contradicting
    // itself, which is the shape this whole repair is about.
    samplesUntilTrend: Math.max(0, CALIBRATION_MIN_SAMPLES - g),
    meanError: g === 0 ? null : errorSum / g,
    meanAbsError: g === 0 ? null : absSum / g,
    overconfidentCount,
    accurateCount,
    underconfidentCount,
    beyondScaleCount: n - g,
    verdictAgreementRate: empty ? null : agreed / n,
    trend: computeTrend(graded),
  };
}

function computeTrend(points: ReadonlyArray<CalibrationPoint>): CalibrationSummary["trend"] {
  if (points.length < CALIBRATION_MIN_SAMPLES) return null;
  // Odd counts give the newer half the extra record on purpose: the question
  // is "where am I now", so recency deserves the tie.
  const split = Math.floor(points.length / 2);
  const meanAbs = (from: number, to: number): number => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += Math.abs(points[i].error);
    return sum / (to - from);
  };
  const delta = meanAbs(split, points.length) - meanAbs(0, split);
  if (delta < -TREND_DEADBAND_POINTS) return "improving";
  if (delta > TREND_DEADBAND_POINTS) return "worsening";
  return "steady";
}

// ---------------------------------------------------------------------------
// Gate sequencing
// ---------------------------------------------------------------------------

/**
 * State of one finished attempt, as far as the gate is concerned.
 *
 * The gate can only ask its question once the SERVER owns an official score to
 * reveal — the client's own fold is never the thing being predicted (see
 * calibrationStore's trust model). That save is a network round-trip, and the
 * result screen is mounted the instant the drive ends, so the sequencing below
 * is not cosmetic: without it the student reads „7 точки" for the length of a
 * 4G POST and then „predicts" the number they just read, which measures
 * nothing at all.
 */
export interface GateSequenceState {
  /** The drive is over and a result has been folded. */
  ended: boolean;
  /** The student quit. Guessing the points of a drive you abandoned measures
   *  nothing, so an aborted attempt is never gated. */
  aborted: boolean;
  /** This kind of session persists at all — sandbox mistake-experience runs
   *  (THEO-3) never write a row, so they would wait forever. */
  persists: boolean;
  /** null while the save is still in flight; true/false once it answered. */
  saved: boolean | null;
  /** The student has predicted, or skipped. */
  resolved: boolean;
}

/**
 * Must the result screen stay hidden right now?
 *
 * True covers BOTH halves of the wait: the save that has not landed yet, and
 * the gate that has landed and not been answered. Everything else — aborted,
 * sandbox, save failed, already answered — falls through to the normal debrief,
 * because a mechanic on top of the lesson must never cost the student the
 * lesson.
 */
export function isResultScreenHeld(s: GateSequenceState): boolean {
  if (!s.ended || s.resolved) return false;
  if (s.aborted || !s.persists) return false;
  // saved === null → still in flight; saved === true → the gate is up.
  // saved === false → nothing to be measured against, so nothing to hold.
  return s.saved !== false;
}

// ---------------------------------------------------------------------------
// Bulgarian copy (authored here so the widget and the trend page cannot drift)
// ---------------------------------------------------------------------------

/**
 * The headline the student reads the instant the engine's answer appears.
 *
 * Requirement-zero (doc 64 THEO-4): no bare correct/wrong verdicts anywhere.
 * A calibration result is a judgement about the student's judgement, which is
 * the easiest place in the product to sound like a scold — so every line names
 * what the gap MEANS for driving, not how right or wrong the guess was.
 */
export const CALIBRATION_VERDICT_TITLE_BG: Record<CalibrationVerdict, string> = {
  overconfident: "Оцени се по-високо, отколкото беше",
  accurate: "Позна се",
  underconfident: "Беше по-строг към себе си от изпита",
};

export const CALIBRATION_VERDICT_BODY_BG: Record<CalibrationVerdict, string> = {
  overconfident:
    "Това е разликата, която на истинския изпит боли: тръгваш спокоен, а протоколът казва друго. Виж кои грешки не си усетил — те са и тези, които няма да усетиш и на пътя.",
  accurate:
    "Усещаш какво се случва в колата, докато шофираш — това е самата преценка, която изпитният лист измерва. Задръж навика да се оценяваш преди да видиш резултата.",
  underconfident:
    "Караш по-добре, отколкото си мислиш. Прекалената строгост също струва: води до колебание на кръстовището, а колебанието се наказва.",
};

export const CALIBRATION_TREND_BG: Record<
  NonNullable<CalibrationSummary["trend"]>,
  string
> = {
  improving: "Преценката ти за собственото каране се изостря.",
  steady: "Преценката ти за собственото каране е стабилна.",
  worsening: "Напоследък се разминаваш повече със себе си.",
};

/**
 * What the student reads while the save is in flight.
 *
 * Deliberately NOT „Зареждане…": the wait is the mechanic starting, not a
 * spinner, and naming it that way stops the pause from reading as a bug.
 */
export const CALIBRATION_PENDING_TITLE_BG = "Изчисляваме протокола…";
export const CALIBRATION_PENDING_BODY_BG =
  "Само секунда — преди да ти покажем резултата, искаме първо ти да кажеш какъв мислиш, че е.";

/**
 * „−3 изпитни т." / „+2 изпитни т." — signed, because the sign is the message,
 * and NAMED, because „т." on its own means контролни точки to a Bulgarian.
 *
 * Found by photographing the surface rather than by the source scanner: the
 * scanner in `modules/sim/rules/__tests__/point-scales.test.ts` reads the sim
 * HUD and the lesson shell, and this string is composed HERE and only rendered
 * there — so the gate over those two directories was clean while the screen
 * still showed „−14 т." under two tiles that had just been repaired. A scanner
 * can only see the file it is pointed at; the frame sees everything.
 *
 * The qualifier is hard-coded rather than imported from `modules/sim/rules`
 * (`pointsBg("exam", n)`) because this is the learning module and the sim's
 * public API is not on its import path — the difference between a licence
 * point and an exam point matters more than the duplication, and
 * `calibration.test.ts` pins the wording on both sides.
 */
export function formatCalibrationError(error: number): string {
  const rounded = Math.round(error * 10) / 10;
  const abs = Math.abs(rounded);
  const unit = abs === 1 ? "изпитна т." : "изпитни т.";
  return `${rounded > 0 ? "+" : ""}${rounded} ${unit}`;
}
