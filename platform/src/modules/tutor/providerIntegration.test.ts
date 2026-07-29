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
import { askTutor, TUTOR_UNAVAILABLE_REPLY_BG } from "./service";
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

/**
 * Flips the stand-in gateway between answering and refusing. "unfunded"
 * reproduces the body Atlas Cloud actually returns when the account is out of
 * credit, observed on the wire 2026-07-29:
 *
 *   HTTP 402  {"code":402,"msg":"insufficient balance"}
 *
 * Note the field is `msg`, not `error.message` — the shape a naive client would
 * miss. This is the real reason the tutor could not answer on the founder's own
 * account, so it is worth a committed test rather than a memory of a curl.
 */
let responseMode: "ok" | "unfunded" = "ok";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requestBodySeen = JSON.parse(body) as Record<string, unknown>;
      const messages = requestBodySeen.messages as { content: string }[];
      systemPromptSeen = messages[0].content;

      if (responseMode === "unfunded") {
        res.writeHead(402, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: 402, msg: "insufficient balance" }));
        return;
      }

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

  it("turns a real 402 „insufficient balance“ into an honest sentence, not a crash", async () => {
    const errors: unknown[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => void errors.push(args));

    responseMode = "unfunded";
    const store = new FakeTutorStore();
    setTutorStore(store);

    try {
      const result = await askTutor("student-unfunded", QUESTION);

      // The student gets a sentence, through the SHIPPED transport, on a real
      // socket, from the real 402 body — not a thrown exception.
      expect(result.limited).toBe(true);
      expect(result.reply).toBe(TUTOR_UNAVAILABLE_REPLY_BG);
      expect(result.citations).toEqual([]);

      // And it does not leak the operational detail to a 17-year-old.
      expect(result.reply).not.toMatch(/402|balance|insufficient/i);

      // Nothing booked on either ledger, nothing persisted: an answer that
      // never arrived must not spend the pack allowance or the day budget.
      // The thread record itself DOES exist — askTutor opens it before it
      // reaches the provider — so the assertion that matters is that the
      // failed turn left no trace INSIDE it.
      const thread = store.threadFor("student-unfunded");
      expect(thread).toBeDefined();
      expect(thread?.messages).toEqual([]);
      expect(thread?.tokensIn).toBe(0);
      expect(thread?.tokensOut).toBe(0);
      expect(thread?.costMicroUsd).toBe(0);
      expect(store.saveExchangeCalls).toHaveLength(0);
      expect(await store.spentOnDay(sofiaDayKey())).toBe(0);

      // The operator, unlike the student, DOES get the cause and the status.
      const logged = errors.flat().join(" ");
      expect(logged).toContain("402");
      expect(logged).toContain("insufficient balance");
    } finally {
      responseMode = "ok";
      spy.mockRestore();
    }
  });
});
