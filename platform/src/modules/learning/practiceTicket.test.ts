/**
 * Practice-session tickets (audit M-10).
 *
 * The attack these tests describe is concrete: a candidate sits a mock exam,
 * reads the 45 question ids out of the DOM in one tab, and asks the practice
 * action for their answer keys in another. The practice action's only input was
 * a question id, so it answered. Every "rejected" case below is that door.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { FakeLearningStore, makeFixtureRepo } from "./fixtures";
import {
  issuePracticeTicket,
  PRACTICE_TICKET_TTL_MS,
  PracticeTicketError,
  resetPracticeTicketWarning,
  verifyPracticeTicket,
} from "./practiceTicket";
import { setLearningStore } from "./store";
import { submitAnswer } from "./submit";

const NOW = new Date("2026-07-25T10:00:00.000Z");
const USER = "u1";
/** The questions a practice session actually dealt. */
const DEALT = ["q-road-1", "q-warn-1"];

let store: FakeLearningStore;

beforeEach(() => {
  setContentRepo(makeFixtureRepo());
  store = new FakeLearningStore();
  setLearningStore(store);
  resetPracticeTicketWarning();
  // A stable key so a signature produced here is verifiable here.
  vi.stubEnv("AUTH_SECRET", "test-secret-for-practice-tickets");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyPracticeTicket", () => {
  it("accepts every question the session dealt, to the user it was dealt to", () => {
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    for (const questionId of DEALT) {
      expect(verifyPracticeTicket(ticket, { userId: USER, questionId, now: NOW })).toEqual({
        ok: true,
      });
    }
  });

  it("rejects a question the session never dealt — the M-10 exam-DOM attack", () => {
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    expect(
      verifyPracticeTicket(ticket, {
        userId: USER,
        questionId: "q-prio-1", // a live exam's question id, scraped from the DOM
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "QUESTION_NOT_IN_SESSION" });
  });

  it("rejects another user's ticket", () => {
    const ticket = issuePracticeTicket("someone-else", DEALT, NOW);
    expect(
      verifyPracticeTicket(ticket, { userId: USER, questionId: DEALT[0], now: NOW }),
    ).toEqual({ ok: false, reason: "WRONG_USER" });
  });

  it("expires — a ticket is one sitting, not a standing permission", () => {
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    const justBefore = new Date(NOW.getTime() + PRACTICE_TICKET_TTL_MS - 1);
    const atExpiry = new Date(NOW.getTime() + PRACTICE_TICKET_TTL_MS);

    expect(
      verifyPracticeTicket(ticket, { userId: USER, questionId: DEALT[0], now: justBefore }),
    ).toEqual({ ok: true });
    expect(
      verifyPracticeTicket(ticket, { userId: USER, questionId: DEALT[0], now: atExpiry }),
    ).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("rejects a payload edited to add a question", () => {
    // The whole point of signing: rewriting the question list must invalidate.
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    const [version, body, signature] = ticket.split(".");
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    payload.q.push("q-prio-1");
    const forgedBody = Buffer.from(JSON.stringify(payload), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(
      verifyPracticeTicket(`${version}.${forgedBody}.${signature}`, {
        userId: USER,
        questionId: "q-prio-1",
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
  });

  it("rejects a tampered signature, a wrong version and outright garbage", () => {
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    const [version, body, signature] = ticket.split(".");
    const check = (t: string) =>
      verifyPracticeTicket(t, { userId: USER, questionId: DEALT[0], now: NOW });

    expect(check(`${version}.${body}.${signature.slice(0, -1)}x`)).toEqual({
      ok: false,
      reason: "INVALID",
    });
    expect(check(`p0.${body}.${signature}`)).toEqual({ ok: false, reason: "INVALID" });
    expect(check("")).toEqual({ ok: false, reason: "INVALID" });
    expect(check("not.a.ticket")).toEqual({ ok: false, reason: "INVALID" });
  });

  it("does not verify against a different deployment's secret", () => {
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    vi.stubEnv("AUTH_SECRET", "a-completely-different-secret");
    expect(
      verifyPracticeTicket(ticket, { userId: USER, questionId: DEALT[0], now: NOW }),
    ).toEqual({ ok: false, reason: "INVALID" });
  });
});

describe("submitAnswer — practice session binding", () => {
  it("grades an answer covered by the session's ticket", async () => {
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    const result = await submitAnswer(USER, "q-road-1", ["q-road-1-a"], "practice", NOW, {
      ticket,
    });
    expect(result.correct).toBe(true);
    expect(result.correctOptionIds).toEqual(["q-road-1-a"]);
  });

  it("refuses to answer a question outside the session — and records nothing", async () => {
    // The key must not leak, AND the rejected attempt must not touch mastery:
    // a refusal that still wrote progress would be an oracle with a side effect.
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    await expect(
      submitAnswer(USER, "q-prio-1", ["q-prio-1-a"], "practice", NOW, { ticket }),
    ).rejects.toMatchObject({ reason: "QUESTION_NOT_IN_SESSION" });
    expect(store.recordAnswerCalls).toHaveLength(0);
  });

  it("refuses a ticket issued to another user", async () => {
    const ticket = issuePracticeTicket("someone-else", DEALT, NOW);
    await expect(
      submitAnswer(USER, "q-road-1", ["q-road-1-a"], "practice", NOW, { ticket }),
    ).rejects.toBeInstanceOf(PracticeTicketError);
    expect(store.recordAnswerCalls).toHaveLength(0);
  });

  it("refuses an expired ticket", async () => {
    const ticket = issuePracticeTicket(USER, DEALT, NOW);
    const later = new Date(NOW.getTime() + PRACTICE_TICKET_TTL_MS + 1000);
    await expect(
      submitAnswer(USER, "q-road-1", ["q-road-1-a"], "practice", later, { ticket }),
    ).rejects.toMatchObject({ reason: "EXPIRED" });
  });

  it("requires a ticket at all once PRACTICE_TICKET_REQUIRED is on", async () => {
    vi.stubEnv("PRACTICE_TICKET_REQUIRED", "1");
    await expect(
      submitAnswer(USER, "q-road-1", ["q-road-1-a"], "practice", NOW),
    ).rejects.toMatchObject({ reason: "MISSING" });
    expect(store.recordAnswerCalls).toHaveLength(0);
  });

  it("still grades unbound submissions while the UI wiring is pending", async () => {
    // Transitional, and deliberately asserted: this is the behaviour that the
    // PRACTICE_TICKET_REQUIRED flip removes, so it must be visible in the suite
    // rather than discovered in production.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await submitAnswer(USER, "q-road-1", ["q-road-1-a"], "practice", NOW);
    expect(result.correct).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("does not gate micro-quiz answers — the sim picks those, not the client", async () => {
    const result = await submitAnswer(USER, "q-road-1", ["q-road-1-a"], "micro", NOW);
    expect(result.correct).toBe(true);
    expect(store.recordAnswerCalls).toHaveLength(1);
  });
});
