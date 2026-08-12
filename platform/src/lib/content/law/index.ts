/**
 * Public API of the law source layer (docs/architecture/05 — modules talk only
 * through index.ts). Consumers retrieve law; they never restate it.
 */
export type {
  ControlPointsPenalty,
  DisqualificationPenalty,
  ExamPointsPenalty,
  FigureStatus,
  FineInstrument,
  FinePenalty,
  LawAct,
  LawLookup,
  LawLookupFailure,
  LawSource,
  LawSourceRegister,
  LawUnit,
  PenaltyBank,
  PenaltyCitation,
  PenaltyConduct,
  PenaltyEntry,
  SourceCoverage,
} from "./types";

export {
  ACT_IDS,
  actIdForActName,
  ANNEX_RE,
  describeControlPoints,
  describeDisqualification,
  describeExamPoints,
  describeFine,
  formatCitation,
  getAct,
  getArticle,
  getLawCorpus,
  getPenalty,
  getSource,
  isSupersededSnapshot,
  labelWords,
  listPenalties,
  normaliseForMatch,
  normaliseUnitRef,
  offencePhraseMatchesConduct,
  ungroundedLabelWords,
  penaltiesForArticle,
  resetLawCorpus,
  resolveCitation,
  resolveLawRef,
  SNAPSHOT_ACT_IDS,
  verifyCitations,
  type ActId,
  type FigureDisplay,
  type LawCorpus,
} from "./corpus";

/**
 * The prose gate. The citation freeze pins a row's `lawRefs` and a figure's
 * `quoteBg`; this checks the NUMBERS inside the sentences next to them, which
 * nothing could see before — see `../proseFigures.ts` for the four ways a
 * number is allowed to be accounted for.
 */
export {
  BGN_PER_EUR_BG,
  GROUNDING_LEDGER,
  evidenceForCitation,
  evidenceForLawRefs,
  evidenceFromSentence,
  penaltyProseRows,
  runProseGate,
  type NoteDeclarations,
  type ProseGateResult,
  type ProseGateRow,
} from "./proseGate";
