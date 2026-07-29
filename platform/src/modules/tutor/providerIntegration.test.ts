/**
 * End-to-end integration for the OpenAI-compatible provider path.
 *
 * Everything else in this module is unit-tested against a fake TutorModel, and
 * that is exactly how the tutor came to ship never having run: the fake proved
 * the pipeline, and nobody proved the wire. This test closes that gap without
 * needing a paid gateway — it stands a real chat-completions server on a real
 * socket, points the SHIPPED transport (model.ts createOpenAICompatibleModel,
 * selected through the ordinary env config) at it, and drives askTutor over
 * the REAL content bank.
 *
 * What it asserts is the whole safety chain, not just the transport:
 *   - the tutor turns ON from gateway credentials alone;
 *   - retrieval injects real authored materials with their real lawRefs;
 *   - a marker the model took FROM those materials becomes a citation chip;
 *   - a marker the model INVENTED does not (ADR-002);
 *   - the reply is booked, at the gateway model's own rate, on both the
 *     thread counters and the global day ledger the kill-switch reads.
 *
 * No external network. The database is the in-memory store, as everywhere
 * else in this suite.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import "@/lib/content/loader";
import { sofiaDayKey } from "./budget";
import { FakeTutorStore } from "./fixtures";
import { isTutorEnabled, setTutorModel } from "./model";
import { askTutor } from "./service";
import { setTutorStore } from "./store";

/** A real question a Bulgarian learner would ask, in Bulgarian. */
const QUESTION = "Каква е максималната скорост в населено място?";
/** A law reference that exists nowhere in the content bank. */
const INVENTED_REF = "чл. 999";

const USAGE = { prompt_tokens: 2731, completion_tokens: 96 } as const;
const GATEWAY_MODEL = "anthropic/claude-sonnet-5-ccmax";

let server: http.Server;
let systemPromptSeen = "";
let requestBodySeen: Record<string, unknown> = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requestBodySeen = JSON.parse(body) as Record<string, unknown>;
      const messages = requestBodySeen.messages as { content: string }[];
      systemPromptSeen = messages[0].content;

      // Stand in for the model's judgement, not for its plumbing: answer from
      // the injected MATERIALS and cite the first lawRef that actually appears
      // in them — plus one reference nobody authored, so the whitelist has
      // something real to reject.
      const materials = systemPromptSeen.split("МАТЕРИАЛИ:")[1] ?? "";
      const grounded =
        /Правни основания: \[([^\][]+)\]/.exec(materials)?.[1] ?? "";

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-integration",
          model: GATEWAY_MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content:
                  `В населено място скоростта е ограничена до 50 км/ч [${grounded}]. ` +
                  `Извън населено място ограничението е друго [ЗДвП ${INVENTED_REF}].`,
              },
            },
          ],
          usage: USAGE,
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address() as AddressInfo;
  // Configure the tutor the way a deployment would: gateway credentials only,
  // no Anthropic key anywhere.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("TUTOR_PROVIDER", "");
  vi.stubEnv("ATLAS_CLOUD_API_KEY", "");
  vi.stubEnv("ATLAS_CLOUD_BASE_URL", "");
  vi.stubEnv("TUTOR_OPENAI_API_KEY", "integration-key");
  vi.stubEnv("TUTOR_OPENAI_BASE_URL", `http://127.0.0.1:${port}/v1`);
  vi.stubEnv("TUTOR_OPENAI_MODEL", GATEWAY_MODEL);
  setTutorModel(null); // force the real transport to be built from that config
});

afterAll(async () => {
  vi.unstubAllEnvs();
  setTutorModel(null);
  setTutorStore(null);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("tutor over an OpenAI-compatible gateway", () => {
  it("answers a real content-bank question, cites it, and books the call", async () => {
    expect(isTutorEnabled()).toBe(true);

    const store = new FakeTutorStore();
    setTutorStore(store);

    const result = await askTutor("student-integration", QUESTION);

    // --- the wire ---------------------------------------------------------
    expect(requestBodySeen.model).toBe(GATEWAY_MODEL);
    expect(systemPromptSeen).toContain("МАТЕРИАЛИ:");
    expect(systemPromptSeen).toContain("Правни основания:");

    // --- the answer -------------------------------------------------------
    expect(result.limited).toBe(false);
    expect(result.reply).toContain("50 км/ч");

    // --- ADR-002: citations come from THIS turn's materials, or not at all -
    expect(result.citations.length).toBeGreaterThan(0);
    for (const citation of result.citations) {
      expect(systemPromptSeen).toContain(`${citation.act} ${citation.ref}`);
    }
    expect(result.citations.some((c) => c.ref === INVENTED_REF)).toBe(false);

    // --- the money --------------------------------------------------------
    // Booked at the gateway model's rate ($3/$15 per 1M — cost.ts), from the
    // provider's own usage block, on both ledgers.
    const expectedMicroUsd =
      USAGE.prompt_tokens * 3 + USAGE.completion_tokens * 15;
    const thread = store.threadFor("student-integration");
    expect(thread?.tokensIn).toBe(USAGE.prompt_tokens);
    expect(thread?.tokensOut).toBe(USAGE.completion_tokens);
    expect(thread?.costMicroUsd).toBe(expectedMicroUsd);
    expect(await store.spentOnDay(sofiaDayKey())).toBe(expectedMicroUsd);
  });
});
