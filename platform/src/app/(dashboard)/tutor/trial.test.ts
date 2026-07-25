/**
 * The AI tutor's free-trial guard (audit C-3). Before the fix every account
 * got the module's 30-per-DAY cost budget forever, so „AI Учител — пълен
 * достъп" was sold in both packs while already being free — these assertions
 * fail on that code.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { SessionUser } from "@/modules/auth";
import {
  FREE_TUTOR_LIFETIME_MESSAGES,
  InMemoryPaymentsStore,
  setPaymentsStore,
} from "@/modules/payments";
import type { TutorMessage } from "@/modules/tutor";
import { countLifetimeQuestions, getTutorAccess } from "./trial";

let store: InMemoryPaymentsStore;

function freshStore(): InMemoryPaymentsStore {
  store = new InMemoryPaymentsStore();
  setPaymentsStore(store);
  return store;
}

function user(patch: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-1",
    email: "student@example.com",
    name: "Стоян",
    isAdmin: false,
    ...patch,
  };
}

/** `n` full exchanges as the tutor store persists them (question + answer). */
function thread(questions: number): TutorMessage[] {
  const messages: TutorMessage[] = [];
  for (let i = 0; i < questions; i++) {
    messages.push({ role: "user", content: `въпрос ${i}`, ts: 1_000 + i });
    messages.push({ role: "assistant", content: `отговор ${i}`, ts: 1_001 + i });
  }
  return messages;
}

async function grantCore(userId: string): Promise<void> {
  await store.createEntitlement({
    userId,
    pack: "core",
    purchasedAt: new Date("2026-06-01T00:00:00.000Z"),
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    provider: "stripe",
    providerRef: `cs_test_${userId}`,
  });
}

afterEach(() => setPaymentsStore(null));

describe("countLifetimeQuestions", () => {
  it("counts the student's turns only — assistant replies are not questions", () => {
    expect(countLifetimeQuestions(thread(3))).toBe(3);
    expect(countLifetimeQuestions([])).toBe(0);
  });
});

describe("getTutorAccess", () => {
  it("serves a free account that has not used the trial", async () => {
    freshStore();
    const access = await getTutorAccess(user(), []);
    expect(access.allowed).toBe(true);
    expect(access.remaining).toBe(FREE_TUTOR_LIFETIME_MESSAGES);
  });

  it("refuses a free account whose lifetime trial is spent", async () => {
    freshStore();
    const access = await getTutorAccess(
      user(),
      thread(FREE_TUTOR_LIFETIME_MESSAGES),
    );
    expect(access.allowed).toBe(false);
    expect(access.remaining).toBe(0);
  });

  it("serves an entitled account no matter how long the thread is", async () => {
    freshStore();
    await grantCore("user-1");
    const access = await getTutorAccess(
      user(),
      thread(FREE_TUTOR_LIFETIME_MESSAGES * 10),
    );
    expect(access.allowed).toBe(true);
    expect(access.unlimited).toBe(true);
  });

  it("serves an admin without a purchase (server-resolved role)", async () => {
    freshStore();
    const access = await getTutorAccess(
      user({ isAdmin: true }),
      thread(FREE_TUTOR_LIFETIME_MESSAGES * 10),
    );
    expect(access.allowed).toBe(true);
    expect(access.unlimited).toBe(true);
  });

  it("another user's pack does not lift this user's trial", async () => {
    freshStore();
    await grantCore("someone-else");
    const access = await getTutorAccess(
      user(),
      thread(FREE_TUTOR_LIFETIME_MESSAGES),
    );
    expect(access.allowed).toBe(false);
  });
});
