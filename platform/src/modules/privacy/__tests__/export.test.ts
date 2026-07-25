import { afterEach, describe, expect, it } from "vitest";
import { exportFileName, exportUserData } from "../export";
import {
  InMemoryPrivacyStore,
  setPrivacyStore,
  type PrivacyUserRecord,
} from "../store";
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from "../types";

const NOW = new Date("2026-07-25T10:00:00.000Z");

function user(patch: Partial<PrivacyUserRecord> & { id: string }): PrivacyUserRecord {
  return {
    email: `${patch.id}@mail.bg`,
    name: "Иван",
    birthYear: 2009,
    locale: "bg",
    consentAt: new Date("2026-06-01T08:00:00.000Z"),
    createdAt: new Date("2026-06-01T08:00:00.000Z"),
    hasPassword: true,
    ...patch,
  };
}

/**
 * Two accounts with data of every kind, so "only my rows" is testable on each
 * collection rather than only on the ones that happened to be populated.
 */
function twoUserStore(): InMemoryPrivacyStore {
  const store = new InMemoryPrivacyStore([user({ id: "mine" }), user({ id: "other" })]);

  for (const userId of ["mine", "other"]) {
    store.progress.push({
      userId,
      conceptId: `concept-${userId}`,
      mastery: 0.7,
      reps: 3,
      lapses: 1,
      dueAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-20T00:00:00.000Z"),
    });
    store.questionAttempts.push({
      userId,
      questionId: `q-${userId}`,
      context: "practice",
      correct: true,
      points: 2,
      answeredAt: new Date("2026-07-20T09:00:00.000Z"),
    });
    store.examAttempts.push({
      userId,
      startedAt: new Date("2026-07-21T09:00:00.000Z"),
      finishedAt: new Date("2026-07-21T09:35:00.000Z"),
      score: 91,
      maxScore: 97,
      passed: true,
      answers: [{ questionId: `q-${userId}`, optionIds: ["a"], correct: true, points: 2 }],
    });
    store.simSessions.push({
      userId,
      lessonId: `lesson-${userId}`,
      startedAt: new Date("2026-07-22T09:00:00.000Z"),
      finishedAt: null,
      score: null,
      events: [{ type: "SPEEDING", at: 12 }],
      debrief: `дебриф за ${userId}`,
    });
    store.entitlements.push({
      userId,
      pack: "core",
      purchasedAt: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-11-01T00:00:00.000Z"),
      provider: "stripe",
      providerRef: `cs_test_${userId}`,
    });
    store.gamification.push({
      userId,
      xp: 500,
      level: 3,
      streak: 4,
      lastActiveDay: new Date("2026-07-24T00:00:00.000Z"),
      achievements: [`badge-${userId}`],
    });
    store.tutorThreads.push({
      userId,
      createdAt: new Date("2026-07-23T09:00:00.000Z"),
      updatedAt: new Date("2026-07-23T09:10:00.000Z"),
      messages: [{ role: "user", content: `въпрос от ${userId}`, ts: 1 }],
    });
  }

  setPrivacyStore(store);
  return store;
}

afterEach(() => setPrivacyStore(null));

describe("exportUserData (GDPR Art. 15/20)", () => {
  it("includes every category of personal data we hold", async () => {
    twoUserStore();

    const data = await exportUserData("mine", NOW);

    expect(data).not.toBeNull();
    expect(data!.format).toBe(EXPORT_FORMAT);
    expect(data!.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(data!.exportedAt).toBe(NOW.toISOString());

    expect(data!.account).toEqual({
      id: "mine",
      email: "mine@mail.bg",
      name: "Иван",
      birthYear: 2009,
      locale: "bg",
      consentAt: "2026-06-01T08:00:00.000Z",
      createdAt: "2026-06-01T08:00:00.000Z",
    });

    // Every child collection populated — a silently-dropped table would mean
    // an incomplete Art. 15 response.
    expect(data!.progress).toHaveLength(1);
    expect(data!.questionAttempts).toHaveLength(1);
    expect(data!.examAttempts).toHaveLength(1);
    expect(data!.simSessions).toHaveLength(1);
    expect(data!.entitlements).toHaveLength(1);
    expect(data!.gamification).not.toBeNull();
    expect(data!.tutorThreads).toHaveLength(1);

    // Tutor conversations are personal data too — they must travel verbatim.
    expect(data!.tutorThreads[0].messages).toEqual([
      { role: "user", content: "въпрос от mine", ts: 1 },
    ]);
  });

  it("contains the user's own rows and NOTHING belonging to anyone else", async () => {
    twoUserStore();

    const data = await exportUserData("mine", NOW);

    // The cheapest complete assertion: serialize the whole document and look
    // for the other account's marker anywhere in it. A widened `where` clause
    // in any single query fails here, including in tables added later.
    const serialized = JSON.stringify(data);
    expect(serialized).toContain("mine");
    expect(serialized).not.toContain("other");
  });

  it("never exposes the password hash or the internal role flag", async () => {
    twoUserStore();

    const data = await exportUserData("mine", NOW);

    // A credential is not portable personal data — shipping it (or even the
    // "does this account have one" flag) would only widen the blast radius of
    // a leaked download.
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("hasPassword");

    // `role` is an internal access flag, not PII (auth/types.ts). Asserted on
    // the account object alone — tutor messages legitimately carry a `role`
    // key of their own ("user"/"assistant").
    expect(Object.keys(data!.account)).not.toContain("role");
  });

  it("exports an account with no activity as empty collections, not nulls", async () => {
    setPrivacyStore(new InMemoryPrivacyStore([user({ id: "fresh" })]));

    const data = await exportUserData("fresh", NOW);

    expect(data!.progress).toEqual([]);
    expect(data!.questionAttempts).toEqual([]);
    expect(data!.examAttempts).toEqual([]);
    expect(data!.simSessions).toEqual([]);
    expect(data!.entitlements).toEqual([]);
    expect(data!.tutorThreads).toEqual([]);
    // Gamification is a single optional row, so null is the honest value.
    expect(data!.gamification).toBeNull();
  });

  it("returns null when the session points at a row that no longer exists", async () => {
    setPrivacyStore(new InMemoryPrivacyStore([]));

    expect(await exportUserData("ghost", NOW)).toBeNull();
  });

  it("serializes to valid JSON with ISO dates (the file must be portable)", async () => {
    twoUserStore();

    const data = await exportUserData("mine", NOW);
    const roundTripped = JSON.parse(JSON.stringify(data));

    expect(roundTripped.account.createdAt).toBe("2026-06-01T08:00:00.000Z");
    expect(roundTripped.progress[0].dueAt).toBe("2026-08-01T00:00:00.000Z");
    expect(roundTripped.simSessions[0].finishedAt).toBeNull();
  });
});

describe("exportFileName", () => {
  it("is dated and carries no personal data in the name", () => {
    const name = exportFileName(NOW);
    expect(name).toBe("knijka-ai-moite-danni-2026-07-25.json");
    expect(name).not.toContain("@");
  });
});
