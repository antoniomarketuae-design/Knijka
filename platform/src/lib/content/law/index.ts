/**
 * Public API of the law source layer (docs/architecture/05 — modules talk only
 * through index.ts). Consumers retrieve law; they never restate it.
 */
export type {
  ControlPointsPenalty,
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
  PenaltyEntry,
  SourceCoverage,
} from "./types";

export {
  ACT_IDS,
  actIdForActName,
  describeControlPoints,
  describeExamPoints,
  describeFine,
  formatCitation,
  getAct,
  getArticle,
  getLawCorpus,
  getPenalty,
  getSource,
  listPenalties,
  normaliseForMatch,
  normaliseUnitRef,
  penaltiesForArticle,
  resetLawCorpus,
  resolveCitation,
  resolveLawRef,
  verifyCitations,
  type ActId,
  type FigureDisplay,
  type LawCorpus,
} from "./corpus";
