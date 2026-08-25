/**
 * sim/rules — public surface of the rules subpackage.
 *
 * NOTE: the sim module's public API is src/modules/sim/index.ts (module
 * boundary rule, docs/architecture/05). When the sim module barrel is
 * assembled it should re-export from here; other modules must never import
 * sim internals directly.
 */

export {
  DEFAULT_RULE_CONFIG,
  SEVERITY_POINTS,
  isScorableEvent,
  type CommendationCode,
  type CommendationEvent,
  type HeadlightState,
  type IndicatorState,
  type LaneArrow,
  type MirrorKind,
  type RuleEngineConfig,
  type RuleEvent,
  type ScorableEvent,
  type SeverityClass,
  type SimTick,
  type SimTickEvent,
  type TurnDirection,
  type Vec2,
  type ViolationCode,
  type ViolationEvent,
  type ViolationPoints,
} from "./types";

export {
  COLLISION_CONTACT_COPY,
  COMMENDATIONS,
  VIOLATIONS,
  /**
   * THE ACT, NOT THE CODE. Two contacts and three rail acts share one code each
   * and carry their own authored title/explanation; a surface that lists faults
   * must group on what this returns, or it prints one act's copy over the other
   * act's row. See catalog.ts's doc for the drive that proved it.
   */
  actCopy,
  /**
   * WRONG_WAY's two roads, and the `detail` key that selects the motorway one.
   * Exported so the surfaces that group faults can be gated against the same
   * table the engine and `rebuildRuleEvents` build from, instead of against a
   * copy of the sentence — see catalog.ts for the frame (six «еднопосочна
   * улица» cards on a motorway merge).
   */
  WRONG_WAY_ROAD_COPY,
  WRONG_WAY_ROAD_MOTORWAY,
  makeCommendation,
  makeViolation,
  type CommendationSpec,
  type ViolationSpec,
} from "./catalog";

/**
 * WHICH OF SEVERAL CITED FAULTS PRICES A CARD. A surface that shows more than
 * one code — the mistake-consequence card is the first, and it badged running
 * over a child as «второстепенна · −1» because SPEEDING_OVER_LIMIT happened to
 * be typed first — must rank them by Наредба № 38, приложение № 5, т. 10 and
 * not by authoring order. See gravest.ts for why a reorder is not the fix.
 */
export { gravestViolation, severityRank, type GravestViolation } from "./gravest";

/**
 * The one splitter for the `lawRef` strings this subpackage authors. Imported
 * by `modules/tutor` and `modules/hazard` rather than copied — a second
 * implementation of „what does this citation say" is how the two drift, and
 * both had already drifted into splitting inside the act's own designation
 * („Наредба № …"). See lawRef.ts for the measurement.
 */
export { parseRuleLawRef, type RuleLawRef } from "./lawRef";

/**
 * The Наредба № 38 grounding: which clause of приложение № 5, т. 10 each code
 * is charged under and — for the ten-point ones — what its detector actually
 * establishes before it convicts. Exported so a debrief or tutor surface can
 * cite the clause a student was charged under instead of only the number
 * (THEO-4: never a bare verdict).
 */
export {
  N38_ACT_ID,
  N38_BASIS,
  N38_CLAUSE_CLASS,
  N38_OPASNA_CASES,
  N38_OPASNA_HEADER,
  N38_OSNOVNA_DEF,
  N38_PASS_RULE,
  N38_REF,
  N38_TERMINATION_CITATION,
  N38_TERMINATION_RULE,
  N38_TERMINATION_UNIT_REF,
  N38_UNIT_REF,
  N38_VTOROSTEPENNA_DEF,
  type ConflictEvidence,
  type N38Basis,
  type N38OpasnaCase,
} from "./n38";

/**
 * THE THREE POINT-LIKE SYSTEMS, KEPT APART. The exam sheet (Наредба № 38), the
 * licence (контролни точки, Наредба № Iз-2539) and the money (глоба in EUR, on
 * a фиш / електронен фиш / АУАН) are different units issued by different people
 * on different days — the result screen used to render the first as a bare
 * „−10 т." and never mention the other two, which reads as a licence penalty to
 * any Bulgarian. Every figure behind this surface is re-cut from
 * content/law/acts by `__tests__/consequences.test.ts`; a code with no
 * retrieved road penalty gets the rule and the article with NO NUMBER.
 */
export {
  BGN_PER_EUR,
  bgnWithEurBg,
  withEurBg,
  CONTROL_POINTS_BUDGET,
  EXAM_VS_CONTROL_POINTS_BG,
  INSTRUMENT_RULE_EFISH,
  INSTRUMENT_RULE_FISH,
  N38_CLASS_LABEL_BG,
  ROAD_CONSEQUENCES,
  UNKNOWN_ROAD,
  eurCentsFromBgn,
  examMarkFor,
  formatEur,
  instrumentLabelBg,
  instrumentsForBan,
  roadConsequenceFor,
  type ConditionalPenalty,
  type ControlPointsFigure,
  type EnforcementInstrument,
  type ExamMark,
  type FigureStatus,
  type FineFigure,
  type LadderTier,
  type LawQuote,
  type RoadConsequence,
} from "./consequences";

/**
 * ONE ACT, ONE ROAD PRICE. The exam sheet counts FAULTS and the street counts
 * OFFENCES, and moving off unbelted is two of the first and one of the second —
 * so the result screen was quoting 200 лв. and 20 контролни точки for one belt.
 * `billRoadConsequences` decides which rows print the road half; nothing here
 * touches a score. The census that found the pair (and the ones deliberately
 * left alone) is `SEPARATE_ACTS` / `GATED_SHARED_PROVISIONS`, held to the real
 * data by `__tests__/offences.test.ts`.
 */
export {
  GATED_SHARED_PROVISIONS,
  OFFENCE_GROUPS,
  SEPARATE_ACTS,
  billRoadConsequences,
  offenceCoveredBodyBg,
  offenceCoveredExamNoteBg,
  offenceCoveredHeadlineBg,
  offenceCoveredLineBg,
  offenceCoversNoteBg,
  offenceGroupFor,
  sharedChargeFor,
  ungatedChargeFor,
  type GatedSharedProvision,
  type OffenceBilling,
  type OffenceCharge,
  type OffenceGroupSpec,
  type OffencePairing,
  type SeparateActsSpec,
} from "./offences";

/**
 * WHICH RUNG, NOT WHICH TABLE. `deriveSpeedingBand` takes the two numbers the
 * conviction already had (measured speed, limit) plus the alinea, subtracts the
 * device's maximum permissible error — ЗДвП чл. 165, ал. 3 → Наредба
 * № 8121з-532 чл. 16, ал. 5 → НСИПМК чл. 425, ал. 1, т. 2, which is ± 3 km/h up
 * to 100 km/h and ± 3 % above it, so 4,2 km/h at 140 — and returns the rung of
 * ЗДвП чл. 182 with its глоба in EUR, контролни точки, лишаване and instrument.
 * Before this the product could only hand a student the whole table.
 */
export {
  EXCESS_ROUNDING_NOTE_BG,
  SPEEDING_LADDERS,
  SPEEDING_SCOPE_BG,
  TOLERANCE,
  TOLERANCE_DELEGATION,
  TOLERANCE_SIZE,
  TOLERANCE_SUBTRACTION,
  deriveSpeedingBand,
  deviceToleranceKmh,
  encodeSpeedMeasurement,
  formatKmh,
  parseSpeedMeasurement,
  type DeviceTolerance,
  type FineEscalation,
  type SpeedingBand,
  type SpeedingBandInput,
  type SpeedingScope,
} from "./consequences";

/**
 * THE ONE WAY TO WRITE A SCORED NUMBER DOWN. Four different point-like scales
 * are rendered in this product — the practical exam sheet, the licence, the
 * manoeuvre rubric and the theoretical exam's точки от правилни отговори — and
 * a bare „т." names none of them, which is how the founder came to read a
 * lesson mark as his licence being docked. `__tests__/point-scales.test.ts`
 * fails the build if a bare „т." reappears in any guarded directory: the sim
 * HUD, the lesson shell, `/simulator`, `/exams` and `components/exam`.
 *
 * The vocabulary itself lives in `@/lib/content/pointScales` (the theory exam
 * is a client bundle that must not carry the rule engine); `./scales` re-exports
 * it and adds the Наредба № 38 приложение № 5 clause helpers.
 */
export {
  COLLISION_CONSEQUENCE_BG,
  COLLISION_TERMINATION_SHORT_BG,
  CONTROL_SCALE_SOURCE_BG,
  EXAM_PASS_RULE_BG,
  EXAM_POINTS_SHORT_NOTE_BG,
  EXAM_SCALE_SOURCE_BG,
  EXAM_TERMINATION_CITATION_BG,
  EXAM_TERMINATION_RULE_BG,
  MANOEUVRE_MAX_PER_LINE,
  POINT_SCALES,
  THEORY_EXAM_RULE_BG,
  THEORY_EXAM_SCORE_NOTE_BG,
  THEORY_EXAM_SHORT_NOTE_BG,
  THEORY_EXAM_TIME_RULE_BG,
  THEORY_EXAM_TIME_SOURCE_BG,
  THEORY_QUESTION_WEIGHT_NOTE_BG,
  THEORY_QUESTION_WEIGHT_SOURCE_BG,
  THEORY_SCALE_SOURCE_BG,
  controlPointsTightBg,
  examMarkCitationBg,
  examPointsForClassBg,
  examPointsWordBg,
  minusPointsBg,
  pointsBg,
  pointsEachBg,
  pointsLabelBg,
  pointsOutOfBg,
  pointsScaleLabelBg,
  pointsWordsBg,
  type PointScaleDef,
  type PointScaleId,
} from "./scales";

export { createRuleEngine, reduceTick, type ReduceResult, type RuleEngineState } from "./engine";

export {
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
  accumulateScore,
  applyViolation,
  emptyScore,
  isPassing,
  /**
   * PER ROW, WHAT `unscoredAfterClose` ONLY COUNTS. Any surface that prints a
   * per-fault or per-group point figure must fold this, or it publishes a total
   * the verdict beside it contradicts.
   */
  ledgerBilling,
  ledgerCloseTime,
  type ScoreBreakdown,
} from "./scoring";

export { buildSessionSummary, type FailReason, type SessionSummary } from "./summary";
