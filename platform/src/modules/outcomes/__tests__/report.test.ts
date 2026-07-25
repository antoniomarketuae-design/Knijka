import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getOutcomesStore,
  InMemoryOutcomesStore,
  listMyOutcomes,
  recordExamOutcome,
  reportLagDays,
  setOutcomesStore,
  setReadinessSnapshotProvider,
  withdrawExamOutcome,
  type OutcomeRow,
  type ReadinessSnapshot,
} from "../index";

const NOW = new Date("2026-07-25T09:30:00.000Z");

/** The readiness the fake product "was showing" — swapped per test. */
let snapshot: ReadinessSnapshot;
let rows: OutcomeRow[];

beforeEach(() => {
  snapshot = { readinessScore: 78, mockAttempts: 4, bestMockScore: 91 };
  rows = [];
  setOutcomesStore(new InMemoryOutcomesStore(rows));
  setReadinessSnapshotProvider(async () => snapshot);
});

afterEach(() => {
  setOutcomesStore(null);
  setReadinessSnapshotProvider(null);
});

describe("recordExamOutcome", () => {
  it("stores the outcome together with the readiness the product predicted", async () => {
    const result = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replaced).toBe(false);
    expect(result.outcome).toMatchObject({
      kind: "theory",
      passed: true,
      readinessScore: 78,
      mockAttempts: 4,
      bestMockScore: 91,
    });
    // Day precision: the column is a DATE, so it is UTC midnight, never the
    // 09:30 the report happened to be submitted at.
    expect(result.outcome.examOn.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    expect(result.outcome.reportedAt).toEqual(NOW);
  });

  it("stores nothing beyond outcome + day + prediction (ADR-004 minimality)", async () => {
    await recordExamOutcome(
      "u1",
      { kind: "practical", passed: false, examOn: "2026-07-24" },
      NOW,
    );

    // The row is the whole record we keep about a minor's real exam. If a
    // field is ever added, this test forces the addition to be deliberate.
    expect(Object.keys(rows[0]).sort()).toEqual([
      "bestMockScore",
      "examOn",
      "id",
      "kind",
      "mockAttempts",
      "passed",
      "readinessScore",
      "reportedAt",
      "userId",
    ]);
  });

  it("corrects an earlier report of the SAME sitting instead of double-counting it", async () => {
    await recordExamOutcome(
      "u1",
      { kind: "theory", passed: false, examOn: "2026-07-20" },
      NOW,
    );
    // Mis-clicked, comes back to fix it. Readiness has moved on since.
    snapshot = { readinessScore: 84, mockAttempts: 6, bestMockScore: 94 };
    const fix = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      new Date("2026-07-26T09:00:00.000Z"),
    );

    expect(fix.ok).toBe(true);
    if (!fix.ok) return;
    expect(fix.replaced).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].passed).toBe(true);
    // The snapshot always describes the moment of the STANDING report.
    expect(rows[0].readinessScore).toBe(84);
  });

  it("keeps theory and practical for the same day as separate reports", async () => {
    await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );
    await recordExamOutcome(
      "u1",
      { kind: "practical", passed: false, examOn: "2026-07-20" },
      NOW,
    );
    expect(rows).toHaveLength(2);
  });

  it("rejects an exam date in the future", async () => {
    const result = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-26" },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
    expect(rows).toHaveLength(0);
  });

  it("accepts the exam happening TODAY (reported the same evening)", async () => {
    const result = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-25" },
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a year-typo date older than the 2-year window", async () => {
    const result = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2016-07-20" },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
  });

  it("rejects a calendar-impossible day rather than silently rolling it over", async () => {
    // new Date("2026-02-31") rolls to 3 March — storing that would misdate the
    // report, so parseExamDay round-trips and the schema refuses it.
    const result = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-02-31" },
      NOW,
    );
    expect(result).toMatchObject({ ok: false, error: "invalid_input" });
    expect(rows).toHaveLength(0);
  });

  it("still stores the outcome when readiness cannot be computed", async () => {
    // The student's report is irreplaceable; a broken content repo must not
    // cost us the only half of the pair we cannot regenerate.
    setReadinessSnapshotProvider(async () => {
      throw new Error("content repo not loaded");
    });
    const result = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.readinessScore).toBe(0);
    expect(result.outcome.mockAttempts).toBe(0);
    expect(result.outcome.bestMockScore).toBeNull();
  });

  it("clamps an out-of-range readiness score into the 0..100 the bands assume", async () => {
    snapshot = { readinessScore: 128.6, mockAttempts: -2, bestMockScore: null };
    const result = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.readinessScore).toBe(100);
    expect(result.outcome.mockAttempts).toBe(0);
  });
});

describe("listMyOutcomes", () => {
  it("returns only the caller's reports, most recent exam first", async () => {
    await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-06-01" },
      NOW,
    );
    await recordExamOutcome(
      "u1",
      { kind: "practical", passed: false, examOn: "2026-07-20" },
      NOW,
    );
    await recordExamOutcome(
      "u2",
      { kind: "theory", passed: true, examOn: "2026-07-21" },
      NOW,
    );

    const mine = await listMyOutcomes("u1");
    expect(mine.map((o) => o.kind)).toEqual(["practical", "theory"]);
    // Ownership never leaks into the returned shape.
    expect(mine[0]).not.toHaveProperty("userId");
  });
});

describe("the calibration read", () => {
  it("hands out rows that cannot identify anyone", async () => {
    // The internal calibration view is incapable of rendering an individual
    // student because the projection it consumes has no id and no userId.
    // That is a privacy guarantee by construction, so it gets an assertion.
    await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );

    const rows = await getOutcomesStore().listForCalibration("theory");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "bestMockScore",
      "examOn",
      "mockAttempts",
      "passed",
      "readinessScore",
      "reportedAt",
    ]);
  });

  it("does not mix the two exam kinds", async () => {
    await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );
    await recordExamOutcome(
      "u2",
      { kind: "practical", passed: false, examOn: "2026-07-20" },
      NOW,
    );

    expect(await getOutcomesStore().listForCalibration("theory")).toHaveLength(1);
    expect(await getOutcomesStore().listForCalibration("practical")).toHaveLength(1);
  });
});

describe("withdrawExamOutcome (GDPR Art. 7(3))", () => {
  it("deletes the caller's own report", async () => {
    const created = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await withdrawExamOutcome("u1", created.outcome.id)).toBe(true);
    expect(await listMyOutcomes("u1")).toEqual([]);
  });

  it("refuses to delete somebody else's report", async () => {
    const created = await recordExamOutcome(
      "u1",
      { kind: "theory", passed: true, examOn: "2026-07-20" },
      NOW,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await withdrawExamOutcome("u2", created.outcome.id)).toBe(false);
    expect(await listMyOutcomes("u1")).toHaveLength(1);
  });
});

describe("reportLagDays", () => {
  it("counts whole days between the exam and the report", () => {
    expect(
      reportLagDays({
        examOn: new Date("2026-07-20T00:00:00.000Z"),
        reportedAt: new Date("2026-07-21T23:00:00.000Z"),
      }),
    ).toBe(1);
  });

  it("never goes negative for a same-day evening report", () => {
    expect(
      reportLagDays({
        examOn: new Date("2026-07-20T00:00:00.000Z"),
        reportedAt: new Date("2026-07-20T08:00:00.000Z"),
      }),
    ).toBe(0);
  });
});
