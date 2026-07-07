/**
 * LLM boundary for the tutor module. The rest of the module talks to the
 * minimal TutorModel interface; the default implementation calls the
 * Anthropic Messages API (claude-sonnet-5, non-streaming — replies are
 * short, and the UI shows a typing indicator instead). Unit tests inject a
 * fake via setTutorModel() and NEVER hit the real API.
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
}

export interface TutorModel {
  complete(input: {
    system: string;
    messages: TutorModelMessage[];
    maxTokens: number;
  }): Promise<TutorModelResult>;
}

/**
 * Product gate: without an API key the tutor UI shows a friendly
 * "activating soon" state instead of ever surfacing a raw error.
 */
export function isTutorEnabled(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0;
}

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

let model: TutorModel | null = null;

/** Test suites inject a fake here (see fixtures.ts). */
export function setTutorModel(m: TutorModel | null): void {
  model = m;
}

export function getTutorModel(): TutorModel {
  if (!model) {
    model = createAnthropicModel();
  }
  return model;
}
