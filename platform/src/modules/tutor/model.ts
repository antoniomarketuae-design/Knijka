/**
 * LLM boundary for the tutor module.
 *
 * The rest of the module talks to the minimal TutorModel interface; two
 * implementations sit behind it, chosen by CONFIGURATION:
 *
 *   1. Anthropic Messages API directly (@anthropic-ai/sdk), when
 *      ANTHROPIC_API_KEY is set. This is the original path and is unchanged.
 *   2. An OpenAI-compatible chat-completions gateway (plain `fetch`), when a
 *      base URL + key are configured. Added because the founder's key is an
 *      Atlas Cloud gateway key, and the tutor had therefore NEVER RUN.
 *
 * WIDEN, DO NOT REPLACE: setting ANTHROPIC_API_KEY later still selects the
 * Anthropic path, and still wins, so nothing about the original route decays.
 *
 * What this boundary deliberately does NOT do: it takes a system prompt and a
 * message list and returns text + token counts. Retrieval, the ADR-002
 * grounding contract, the citation whitelist, the four spending ceilings and
 * the kill-switch all live ABOVE it in service.ts, so a provider swap cannot
 * route around any of them. The one safety property that IS this file's job is
 * token accounting: `usage` is mandatory on both paths (see below).
 *
 * Unit tests inject a fake via setTutorModel() and NEVER hit a real API.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PRICING } from "./cost";

export interface TutorModelMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TutorModelResult {
  text: string;
  /** From the API usage block — feeds cost accounting, never estimated. */
  inputTokens: number;
  outputTokens: number;
  /**
   * The model the provider says it billed, when it reports one. Drives
   * cost.ts rateForModel(), so a gateway model is booked at ITS price rather
   * than at claude-sonnet-5's. Absent on the Anthropic path (one model, one
   * rate) and in the test fakes, where PRICING applies.
   */
  model?: string;
}

export interface TutorModel {
  complete(input: {
    system: string;
    messages: TutorModelMessage[];
    maxTokens: number;
  }): Promise<TutorModelResult>;
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

/**
 * Default gateway model: Sonnet 5 through the OpenAI-compatible gateway.
 *
 * Same model the direct path uses, so the tutor's voice, its ability to follow
 * the grounding contract, and its price per token are the ones doc 81 was
 * sized against. Override with TUTOR_OPENAI_MODEL — but check cost.ts has a
 * rate for whatever you pick, or the ledger books it at the punitive unknown
 * rate on purpose.
 */
export const TUTOR_DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5-ccmax";

/** How long one tutor completion may take before we give up on it. */
export const TUTOR_REQUEST_TIMEOUT_MS = 60_000;

export type TutorProviderKind = "anthropic" | "openai-compatible";

export interface TutorProviderConfig {
  kind: TutorProviderKind;
  /** Only set for "openai-compatible". */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Which provider (if any) this deployment is configured for.
 *
 * Precedence, and why:
 *  - TUTOR_PROVIDER pins it explicitly, for a box that has both sets of
 *    credentials and needs to say which one is live.
 *  - Otherwise ANTHROPIC_API_KEY wins. It is the narrower, first-party route;
 *    if someone bothers to set it, they mean it.
 *  - Otherwise the OpenAI-compatible pair, which needs BOTH a key and a base
 *    URL. A key with no base URL is NOT quietly pointed at api.openai.com:
 *    that would ship a 17-year-old's question to a third party nobody in this
 *    repo chose. No base URL means not configured.
 *  - Otherwise null — the tutor is off, and the page shows „активира скоро".
 *
 * ATLAS_CLOUD_* are accepted as aliases because that is what is already
 * provisioned locally and on the box; TUTOR_OPENAI_* are the generic names a
 * different gateway would use, and they win when both are present.
 */
export function resolveTutorProvider(): TutorProviderConfig | null {
  const anthropicKey = env("ANTHROPIC_API_KEY");
  const gatewayKey = env("TUTOR_OPENAI_API_KEY") || env("ATLAS_CLOUD_API_KEY");
  const gatewayBaseUrl =
    env("TUTOR_OPENAI_BASE_URL") || env("ATLAS_CLOUD_BASE_URL");
  const gatewayModel =
    env("TUTOR_OPENAI_MODEL") || TUTOR_DEFAULT_GATEWAY_MODEL;

  const gateway: TutorProviderConfig | null =
    gatewayKey.length > 0 && gatewayBaseUrl.length > 0
      ? {
          kind: "openai-compatible",
          apiKey: gatewayKey,
          baseUrl: gatewayBaseUrl.replace(/\/+$/, ""),
          model: gatewayModel,
        }
      : null;

  const anthropic: TutorProviderConfig | null =
    anthropicKey.length > 0 ? { kind: "anthropic" } : null;

  const pinned = env("TUTOR_PROVIDER").toLowerCase();
  if (pinned === "anthropic") return anthropic;
  if (pinned === "openai-compatible") return gateway;

  return anthropic ?? gateway;
}

/**
 * Product gate: without a configured provider the tutor UI shows a friendly
 * "activating soon" state instead of ever surfacing a raw error.
 */
export function isTutorEnabled(): boolean {
  return resolveTutorProvider() !== null;
}

// ---------------------------------------------------------------------------
// Anthropic provider (unchanged behaviour)
// ---------------------------------------------------------------------------

function createAnthropicModel(): TutorModel {
  // One client per server process; reads ANTHROPIC_API_KEY from env.
  const client = new Anthropic();

  return {
    async complete({ system, messages, maxTokens }) {
      const response = await client.messages.create({
        model: PRICING.model,
        max_tokens: maxTokens,
        // Sonnet 5 runs adaptive thinking when `thinking` is omitted;
        // grounded Q&A doesn't need it — disable to keep cost/latency low.
        thinking: { type: "disabled" },
        system,
        messages,
      });

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// OpenAI-compatible provider
// ---------------------------------------------------------------------------

/** Raised for any provider-side failure. Never carries the API key. */
export class TutorProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TutorProviderError";
  }
}

/**
 * Strip the key from anything we are about to put in a log or an Error.
 * The gateway has no reason to echo it back — this is belt and braces, because
 * a leaked key in a server log is a bill someone else gets to run up.
 */
function redact(text: string, secret?: string): string {
  if (!secret || secret.length < 8) return text;
  return text.split(secret).join("[redacted]");
}

interface ChatCompletionResponse {
  model?: unknown;
  choices?: {
    message?: { content?: unknown };
  }[];
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  };
}

/**
 * Chat-completions content is usually a string, but several gateways return
 * the multi-part array shape. Accept both; anything else yields "".
 */
function readContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "object" &&
      part !== null &&
      typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");
}

function readTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function createOpenAICompatibleModel(
  config: TutorProviderConfig,
): TutorModel {
  const baseUrl = (config.baseUrl ?? "").replace(/\/+$/, "");
  const apiKey = config.apiKey ?? "";
  const model = config.model ?? TUTOR_DEFAULT_GATEWAY_MODEL;

  return {
    async complete({ system, messages, maxTokens }) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            // The system prompt is a first-class message here, exactly as
            // Anthropic's `system` field is on the other path. No sampling
            // parameters: Sonnet 5 rejects non-default ones, and the grounding
            // contract wants the model's default behaviour, not a tuned one.
            messages: [{ role: "system", content: system }, ...messages],
          }),
          signal: AbortSignal.timeout(TUTOR_REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new TutorProviderError(
          `tutor provider request failed: ${redact(
            err instanceof Error ? err.message : String(err),
            apiKey,
          )}`,
        );
      }

      const raw = await response.text();

      if (!response.ok) {
        // Surface the provider's own explanation (a 402 „insufficient
        // balance" is a very different operational problem from a 401), but
        // never the request we sent or anything derived from the key.
        let detail = "";
        try {
          const parsed = JSON.parse(raw) as {
            error?: { message?: unknown };
            msg?: unknown;
          };
          const message = parsed.error?.message ?? parsed.msg;
          if (typeof message === "string") detail = ` — ${message}`;
        } catch {
          /* non-JSON body: status alone is the signal */
        }
        throw new TutorProviderError(
          `tutor provider returned ${response.status}${redact(detail, apiKey)}`,
          response.status,
        );
      }

      let body: ChatCompletionResponse;
      try {
        body = JSON.parse(raw) as ChatCompletionResponse;
      } catch {
        throw new TutorProviderError(
          "tutor provider returned a non-JSON body",
          response.status,
        );
      }

      const inputTokens = readTokenCount(body.usage?.prompt_tokens);
      const outputTokens = readTokenCount(body.usage?.completion_tokens);
      if (inputTokens === null || outputTokens === null) {
        // FAIL CLOSED. cost.ts is emphatic that accounting is never skipped,
        // and budget.ts's kill-switch is only a ceiling if every call it is
        // supposed to count actually gets counted. A reply we cannot book is
        // an unmetered reply, and an unmetered tutor talking to teenagers on a
        // ONE-TIME purchase is an open-ended bill. Losing this one answer is
        // the cheaper failure.
        throw new TutorProviderError(
          "tutor provider omitted the usage block — refusing an unbilled reply",
          response.status,
        );
      }

      return {
        text: readContent(body.choices?.[0]?.message?.content),
        inputTokens,
        outputTokens,
        model: typeof body.model === "string" ? body.model : model,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

let model: TutorModel | null = null;
/** The config `model` was built from, so an env change rebuilds the client. */
let modelSignature: string | null = null;

/** Test suites inject a fake here (see fixtures.ts). */
export function setTutorModel(m: TutorModel | null): void {
  model = m;
  modelSignature = null;
}

function signatureOf(config: TutorProviderConfig): string {
  return [config.kind, config.baseUrl ?? "", config.model ?? ""].join("|");
}

export function getTutorModel(): TutorModel {
  const config = resolveTutorProvider();
  if (!config) {
    // service.ts gates on isTutorEnabled() before ever reaching here.
    throw new Error("getTutorModel: no tutor provider is configured");
  }

  // An injected fake (modelSignature === null) always wins and is never
  // rebuilt; a real client is rebuilt when the configuration changes.
  const signature = signatureOf(config);
  if (model && (modelSignature === null || modelSignature === signature)) {
    return model;
  }

  model =
    config.kind === "anthropic"
      ? createAnthropicModel()
      : createOpenAICompatibleModel(config);
  modelSignature = signature;
  return model;
}
