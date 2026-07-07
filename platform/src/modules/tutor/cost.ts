/**
 * Cost accounting for tutor API calls — instrumented from day one
 * (docs/business/60). Every call MUST go through computeCostMicroUsd and be
 * accumulated on the TutorThread row; cost tracking is never skipped.
 */

/**
 * claude-sonnet-5 pricing.
 *
 * VERIFY against https://platform.claude.com/docs/en/pricing before launch.
 * Standard list price is $3.00 / 1M input tokens and $15.00 / 1M output
 * tokens (an introductory $2/$10 rate runs through 2026-08-31 — we book at
 * the standard rate so the ledger is conservative). Conveniently,
 * $X per 1M tokens == X micro-USD per token.
 */
export const PRICING = {
  model: "claude-sonnet-5",
  inputMicroUsdPerToken: 3, // $3.00 / 1M input tokens
  outputMicroUsdPerToken: 15, // $15.00 / 1M output tokens
} as const;

/** Whole micro-USD (1e-6 USD), rounded up so we never under-book. */
export function computeCostMicroUsd(
  tokensIn: number,
  tokensOut: number,
): number {
  return Math.ceil(
    tokensIn * PRICING.inputMicroUsdPerToken +
      tokensOut * PRICING.outputMicroUsdPerToken,
  );
}
