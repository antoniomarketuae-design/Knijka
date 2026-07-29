/**
 * The provider boundary (model.ts).
 *
 * Two things are being protected here. First, that the tutor is OFF when
 * nothing is configured — that behaviour is correct, it is what the
 * „активира скоро" state is for, and it must not become collateral damage of
 * adding a second provider. Second, that the OpenAI-compatible path books
 * every reply: a provider that answers without a usage block gets refused
 * rather than billed as free, because budget.ts's kill-switch is a ceiling on
 * money and an uncounted call walks straight under it.
 *
 * No network: `fetch` is stubbed. The Anthropic path is exercised only for
 * provider SELECTION (constructing its client would need a real key).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeCostMicroUsd,
  PRICING,
  rateForModel,
  TUTOR_UNKNOWN_MODEL_RATE,
} from "./cost";
import {
  createOpenAICompatibleModel,
  isTutorEnabled,
  resolveTutorProvider,
  setTutorModel,
  TUTOR_DEFAULT_GATEWAY_MODEL,
  TutorProviderError,
} from "./model";

/** Every variable that can select a provider — cleared before each test. */
const PROVIDER_ENV = [
  "TUTOR_PROVIDER",
  "ANTHROPIC_API_KEY",
  "TUTOR_OPENAI_API_KEY",
  "TUTOR_OPENAI_BASE_URL",
  "TUTOR_OPENAI_MODEL",
  "ATLAS_CLOUD_API_KEY",
  "ATLAS_CLOUD_BASE_URL",
] as const;

beforeEach(() => {
  for (const name of PROVIDER_ENV) vi.stubEnv(name, "");
  setTutorModel(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setTutorModel(null);
});

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

describe("resolveTutorProvider", () => {
  it("is DISABLED when no provider is configured at all", () => {
    expect(resolveTutorProvider()).toBeNull();
    expect(isTutorEnabled()).toBe(false);
  });

  it("selects Anthropic when only ANTHROPIC_API_KEY is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-not-real");
    expect(resolveTutorProvider()).toEqual({ kind: "anthropic" });
    expect(isTutorEnabled()).toBe(true);
  });

  it("selects the gateway from the ATLAS_CLOUD_* pair", () => {
    vi.stubEnv("ATLAS_CLOUD_API_KEY", "gw-not-real");
    vi.stubEnv("ATLAS_CLOUD_BASE_URL", "https://gateway.example/v1");

    expect(resolveTutorProvider()).toEqual({
      kind: "openai-compatible",
      apiKey: "gw-not-real",
      baseUrl: "https://gateway.example/v1",
      model: TUTOR_DEFAULT_GATEWAY_MODEL,
    });
    expect(isTutorEnabled()).toBe(true);
  });

  it("prefers the generic TUTOR_OPENAI_* names over the ATLAS_CLOUD_* aliases", () => {
    vi.stubEnv("ATLAS_CLOUD_API_KEY", "atlas-key");
    vi.stubEnv("ATLAS_CLOUD_BASE_URL", "https://atlas.example/v1");
    vi.stubEnv("TUTOR_OPENAI_API_KEY", "generic-key");
    vi.stubEnv("TUTOR_OPENAI_BASE_URL", "https://generic.example/v1/");
    vi.stubEnv("TUTOR_OPENAI_MODEL", "openai/gpt-5.6-luna");

    expect(resolveTutorProvider()).toEqual({
      kind: "openai-compatible",
      apiKey: "generic-key",
      // trailing slash normalised away so the URL join stays clean
      baseUrl: "https://generic.example/v1",
      model: "openai/gpt-5.6-luna",
    });
  });

  it("stays DISABLED when a gateway key has no base URL", () => {
    // A key alone must never be pointed at a default third-party host: that
    // would ship a minor's question to a provider nobody in this repo chose.
    vi.stubEnv("ATLAS_CLOUD_API_KEY", "gw-not-real");
    expect(resolveTutorProvider()).toBeNull();
    expect(isTutorEnabled()).toBe(false);
  });

  it("keeps ANTHROPIC_API_KEY winning when both providers are configured", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-not-real");
    vi.stubEnv("ATLAS_CLOUD_API_KEY", "gw-not-real");
    vi.stubEnv("ATLAS_CLOUD_BASE_URL", "https://gateway.example/v1");

    expect(resolveTutorProvider()?.kind).toBe("anthropic");
  });

  it("lets TUTOR_PROVIDER pin the gateway even with an Anthropic key present", () => {
    vi.stubEnv("TUTOR_PROVIDER", "openai-compatible");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-not-real");
    vi.stubEnv("ATLAS_CLOUD_API_KEY", "gw-not-real");
    vi.stubEnv("ATLAS_CLOUD_BASE_URL", "https://gateway.example/v1");

    expect(resolveTutorProvider()?.kind).toBe("openai-compatible");
  });

  it("is DISABLED when TUTOR_PROVIDER pins a provider that is not configured", () => {
    vi.stubEnv("TUTOR_PROVIDER", "anthropic");
    vi.stubEnv("ATLAS_CLOUD_API_KEY", "gw-not-real");
    vi.stubEnv("ATLAS_CLOUD_BASE_URL", "https://gateway.example/v1");

    expect(resolveTutorProvider()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The OpenAI-compatible transport
// ---------------------------------------------------------------------------

const CONFIG = {
  kind: "openai-compatible",
  apiKey: "gw-secret-key-value",
  baseUrl: "https://gateway.example/v1",
  model: TUTOR_DEFAULT_GATEWAY_MODEL,
} as const;

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createOpenAICompatibleModel", () => {
  it("posts the grounded prompt as a system message and reads back usage", async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        model: "anthropic/claude-sonnet-5-ccmax",
        choices: [{ message: { content: "Отговор [ЗДвП чл. 47]" } }],
        usage: { prompt_tokens: 2812, completion_tokens: 184 },
      }),
    );

    const result = await createOpenAICompatibleModel(CONFIG).complete({
      system: "SYSTEM PROMPT",
      messages: [{ role: "user", content: "Кой има предимство?" }],
      maxTokens: 1024,
    });

    expect(result).toEqual({
      text: "Отговор [ЗДвП чл. 47]",
      inputTokens: 2812,
      outputTokens: 184,
      model: "anthropic/claude-sonnet-5-ccmax",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://gateway.example/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(
      (init.headers as Record<string, string>).authorization,
    ).toBe("Bearer gw-secret-key-value");

    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe(TUTOR_DEFAULT_GATEWAY_MODEL);
    expect(sent.max_tokens).toBe(1024);
    expect(sent.messages).toEqual([
      { role: "system", content: "SYSTEM PROMPT" },
      { role: "user", content: "Кой има предимство?" },
    ]);
    // No sampling parameters: the grounding contract wants the model's own
    // default behaviour, and Sonnet 5 rejects non-default ones outright.
    expect(sent.temperature).toBeUndefined();
    expect(sent.top_p).toBeUndefined();
  });

  it("accepts the multi-part content shape some gateways return", async () => {
    stubFetch(
      jsonResponse({
        choices: [
          { message: { content: [{ type: "text", text: "част " }, { type: "text", text: "две" }] } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      }),
    );

    const result = await createOpenAICompatibleModel(CONFIG).complete({
      system: "S",
      messages: [{ role: "user", content: "q" }],
      maxTokens: 64,
    });
    expect(result.text).toBe("част две");
  });

  it("REFUSES a reply that carries no usage block rather than billing it as free", async () => {
    stubFetch(
      jsonResponse({
        choices: [{ message: { content: "безплатен отговор" } }],
      }),
    );

    await expect(
      createOpenAICompatibleModel(CONFIG).complete({
        system: "S",
        messages: [{ role: "user", content: "q" }],
        maxTokens: 64,
      }),
    ).rejects.toThrow(/usage block/);
  });

  it("surfaces the provider's own explanation on an error status", async () => {
    stubFetch(jsonResponse({ code: 402, msg: "insufficient balance" }, 402));

    await expect(
      createOpenAICompatibleModel(CONFIG).complete({
        system: "S",
        messages: [{ role: "user", content: "q" }],
        maxTokens: 64,
      }),
    ).rejects.toMatchObject({
      name: "TutorProviderError",
      status: 402,
      message: expect.stringContaining("insufficient balance"),
    });
  });

  it("never lets the API key reach the error message", async () => {
    // A gateway that echoes the Authorization header into its error body must
    // not turn a server log into a credential leak.
    stubFetch(
      jsonResponse(
        { error: { message: `bad token gw-secret-key-value supplied` } },
        401,
      ),
    );

    const error = await createOpenAICompatibleModel(CONFIG)
      .complete({
        system: "S",
        messages: [{ role: "user", content: "q" }],
        maxTokens: 64,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TutorProviderError);
    expect((error as Error).message).not.toContain("gw-secret-key-value");
    expect((error as Error).message).toContain("[redacted]");
  });

  it("reports a non-JSON body as a provider error, not a crash", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>gateway down</html>", { status: 200 })),
    );

    await expect(
      createOpenAICompatibleModel(CONFIG).complete({
        system: "S",
        messages: [{ role: "user", content: "q" }],
        maxTokens: 64,
      }),
    ).rejects.toThrow(/non-JSON/);
  });
});

// ---------------------------------------------------------------------------
// Cost: the gateway's model decides the rate
// ---------------------------------------------------------------------------

describe("rateForModel", () => {
  it("falls back to the Anthropic rate when no model is reported", () => {
    expect(rateForModel()).toBe(PRICING);
  });

  it("prices the default gateway model exactly like the direct Sonnet 5 path", () => {
    const rate = rateForModel(TUTOR_DEFAULT_GATEWAY_MODEL);
    expect(rate.inputMicroUsdPerToken).toBe(PRICING.inputMicroUsdPerToken);
    expect(rate.outputMicroUsdPerToken).toBe(PRICING.outputMicroUsdPerToken);
  });

  it("prices a cheaper gateway model at ITS rate, not at Sonnet's", () => {
    const rate = rateForModel("anthropic/claude-haiku-4.5-20251001");
    expect(computeCostMicroUsd(1_000_000, 0, rate)).toBe(1_000_000); // $1/1M
    expect(computeCostMicroUsd(0, 1_000_000, rate)).toBe(5_000_000); // $5/1M
  });

  it("books an unrecognised model at the punitive rate so the ceiling trips early", () => {
    expect(rateForModel("someone/experimental-model")).toBe(
      TUTOR_UNKNOWN_MODEL_RATE,
    );
    expect(TUTOR_UNKNOWN_MODEL_RATE.outputMicroUsdPerToken).toBeGreaterThan(
      PRICING.outputMicroUsdPerToken,
    );
  });
});
