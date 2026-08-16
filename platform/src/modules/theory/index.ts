/**
 * Public API of the theory-content integrity module (docs/architecture/05 —
 * modules talk only through index.ts).
 *
 * Scope today is narrow on purpose: the join between the question bank and the
 * non-statutory source registers, which is the ADR-002 property no single
 * existing gate could see because it needs both sides at once.
 */
export {
  findDanglingClaimRefs,
  findGroundingGaps,
  isCitableClaim,
  type DanglingRef,
  type GroundingGap,
} from "./grounding";
