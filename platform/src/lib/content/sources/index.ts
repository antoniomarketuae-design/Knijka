/**
 * Public API of the non-statutory source layer (docs/architecture/05 — modules
 * talk only through index.ts). Consumers RETRIEVE a source; they never restate
 * what it says. Same contract as lib/content/law, applied to the citations that
 * are not law.
 */
export type {
  RegisteredSource,
  SourceAuthority,
  SourceClaim,
  SourceConflict,
  SourceLookup,
  SourceLookupFailure,
  SourceQuote,
} from "./types";

export { describeConflict } from "./types";

export {
  REGISTERS,
  claimsForQuestion,
  formatSourceCitation,
  getRegisteredSource,
  getSourceClaim,
  getSourceRegistry,
  quoteForSourceRef,
  resetSourceRegistry,
  resolveSourceRef,
  type RegisterId,
  type SourceRegistry,
} from "./registry";
