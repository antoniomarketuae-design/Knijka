/**
 * Cost accounting for tutor API calls — instrumented from day one
 * (docs/business/60). Every call MUST go through computeCostMicroUsd and be
 * accumulated on the TutorThread row; cost tracking is never skipped.
 *
 * The tutor can now reach a model through TWO providers (model.ts): the
 * Anthropic Messages API directly, or an OpenAI-compatible gateway. The
 * budget kill-switch (budget.ts) is a ceiling on MONEY, so it is only as
 * honest as the per-token rate it multiplies by — a gateway model priced
 * differently from claude-sonnet-5 and booked at claude-sonnet-5's rate makes
 * the ledger a work of fiction and the kill-switch a decoration. Hence the
 * rate TABLE below and rateForModel(): the model the provider says it billed
 * decides the rate, and a model nobody wrote down books at the most expensive
 * rate on the gateway's own price sheet rather than at a guess.
 */

/** Per-token rate for one model. $X per 1M tokens == X micro-USD per token. */
export interface TutorTokenRate {
  /** The provider's own model id, for the ledger and for tests to pin. */
  model: string;
  inputMicroUsdPerToken: number;
  outputMicroUsdPerToken: number;
}

/**
 * claude-sonnet-5 pricing — the DIRECT Anthropic path, and the default rate
 * when a provider does not report which model it billed.
 *
 * VERIFY against https://platform.claude.com/docs/en/pricing before launch.
 * Standard list price is $3.00 / 1M input tokens and $15.00 / 1M output
 * tokens (an introductory $2/$10 rate runs through 2026-08-31 — we book at
 * the standard rate so the ledger is conservative). Conveniently,
 * $X per 1M tokens == X micro-USD per token.
 */
export const PRICING: TutorTokenRate = {
  model: "claude-sonnet-5",
  inputMicroUsdPerToken: 3, // $3.00 / 1M input tokens
  outputMicroUsdPerToken: 15, // $15.00 / 1M output tokens
} as const;

/**
 * Rates for models reachable through the OpenAI-compatible gateway.
 *
 * Read from the gateway's OWN catalogue (`GET /v1/models` → `pricing.prompt` /
 * `pricing.completion`, USD per token) on 2026-07-29, converted to µUSD per
 * token. Re-check when adding a model or when the gateway republishes prices;
 * a stale entry here under-books silently, which is the one failure mode this
 * file exists to prevent.
 *
 * The two Anthropic models are deliberately booked at Anthropic's STANDARD
 * list price rather than the gateway's current sheet where the two differ:
 * the gateway quotes claude-sonnet-5-ccmax at $2/$10 (the same introductory
 * rate PRICING already declines to use), so booking $3/$15 keeps one number
 * for one model across both providers and over-books rather than under-books
 * if the gateway moves to list.
 */
const GATEWAY_RATES: readonly TutorTokenRate[] = [
  // Anthropic via the gateway — booked at Anthropic list price (see above).
  {
    model: "anthropic/claude-sonnet-5-ccmax",
    inputMicroUsdPerToken: 3,
    outputMicroUsdPerToken: 15,
  },
  {
    model: "anthropic/claude-opus-5-ccmax",
    inputMicroUsdPerToken: 5,
    outputMicroUsdPerToken: 25,
  },
  {
    model: "anthropic/claude-haiku-4.5-20251001",
    inputMicroUsdPerToken: 1,
    outputMicroUsdPerToken: 5,
  },
  { model: "xai/grok-4.5", inputMicroUsdPerToken: 2, outputMicroUsdPerToken: 6 },
  {
    model: "openai/gpt-5.6-luna",
    inputMicroUsdPerToken: 1,
    outputMicroUsdPerToken: 6,
  },
  {
    model: "openai/gpt-5.6-terra",
    inputMicroUsdPerToken: 2.5,
    outputMicroUsdPerToken: 15,
  },
  {
    model: "openai/gpt-5.6-sol",
    inputMicroUsdPerToken: 5,
    outputMicroUsdPerToken: 30,
  },
  {
    model: "Qwen/Qwen3-235B-A22B-Instruct-2507",
    inputMicroUsdPerToken: 0.2,
    outputMicroUsdPerToken: 0.88,
  },
] as const;

/**
 * What an UNKNOWN model books at: the most expensive prompt and completion
 * rates on the gateway's whole catalogue as of 2026-07-29 ($20 / $120 per 1M).
 *
 * Deliberately punitive. If someone points TUTOR_OPENAI_MODEL at something
 * this file has never heard of, the tutor still answers — but the day's
 * ceiling arrives sooner than the real bill would, and the founder finds out
 * from a brownout rather than from a statement. The alternative (assume it is
 * cheap) fails in the direction that costs money.
 */
export const TUTOR_UNKNOWN_MODEL_RATE: TutorTokenRate = {
  model: "(unknown)",
  inputMicroUsdPerToken: 20,
  outputMicroUsdPerToken: 120,
} as const;

const RATES_BY_MODEL = new Map<string, TutorTokenRate>(
  [PRICING, ...GATEWAY_RATES].map((r) => [r.model, r]),
);

/**
 * The rate to book a call at.
 *
 * `model` is what the PROVIDER reported it billed (TutorModelResult.model),
 * not what we asked for — a gateway that silently reroutes must be billed as
 * what it actually ran. Undefined (the Anthropic path, and the test fakes)
 * falls back to PRICING; anything unrecognised books at the punitive rate.
 */
export function rateForModel(model?: string): TutorTokenRate {
  if (!model) return PRICING;
  return RATES_BY_MODEL.get(model) ?? TUTOR_UNKNOWN_MODEL_RATE;
}

/** Whole micro-USD (1e-6 USD), rounded up so we never under-book. */
export function computeCostMicroUsd(
  tokensIn: number,
  tokensOut: number,
  rate: TutorTokenRate = PRICING,
): number {
  return Math.ceil(
    tokensIn * rate.inputMicroUsdPerToken +
      tokensOut * rate.outputMicroUsdPerToken,
  );
}
