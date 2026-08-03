import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLearningStore,
  setLearningStore,
  SIM_EVIDENCE_ROW_LIMIT,
} from "./store";

/**
 * WHAT THE DASHBOARD ASKS POSTGRES FOR — the query, not the fake.
 *
 * Every other test in this module drives FakeLearningStore, so nothing had
 * ever looked at the statement the Prisma-backed store builds. It selected
 * `events: true` for every SimSession finished in the last fourteen days,
 * with no take: the entire session payload, when the readiness blend and the
 * weak-spots card want three strings per rule event. Each ViolationEvent in
 * that payload carries titleBg + explanationBg + lawRef — ~430 bytes of
 * Bulgarian prose that already lives in sim/rules — and the payload also holds
 * objectives, eventPositions and nearMisses, which this read never touches.
 * The bill therefore grew with how much the student drove.
 *
 * The same defect, in the same words, was fixed one file over in
 * sim/lessons/store.ts (see its __tests__/prismaStoreQueries.test.ts). This is
 * the other half of it.
 */

const h = vi.hoisted(() => ({
  calls: [] as { sql: string; values: unknown[] }[],
  rows: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.calls.push({ sql: strings.raw.join(" ? "), values });
      return h.rows;
    },
    simSession: {
      findMany: async () => {
        throw new Error(
          "findMany on SimSession: this read must not select the events blob",
        );
      },
    },
  },
}));

const SINCE = new Date("2026-07-20T09:30:00.000Z");

/** One projected row, as Postgres hands it back. */
function projected(
  conceptId: unknown,
  kind: unknown,
  severity: unknown,
  finishedAt: unknown = new Date("2026-08-01T10:05:00.000Z"),
): Record<string, unknown> {
  return { conceptId, kind, severity, finishedAt };
}

beforeEach(() => {
  h.calls.length = 0;
  h.rows.length = 0;
  setLearningStore(null); // use the real Prisma-backed store
});

afterEach(() => setLearningStore(null));

function lastSql(): string {
  const call = h.calls.at(-1);
  expect(call, "no query was issued").toBeDefined();
  return call!.sql;
}

describe("getSimEvidenceSince: the statement, not the fake", () => {
  it("is bounded — the fourteen-day window is a bound on time, not on volume", async () => {
    await getLearningStore().getSimEvidenceSince("u-1", SINCE);
    const call = h.calls.at(-1)!;

    expect(lastSql(), "an unbounded read of a student's driving history").toMatch(
      /LIMIT/i,
    );
    // The limit is a bound parameter, not text spliced into the SQL.
    expect(call.values).toContain(SIM_EVIDENCE_ROW_LIMIT);
    expect(SIM_EVIDENCE_ROW_LIMIT).toBe(500);
  });

  it("projects the three strings the consumers read, never the payload", async () => {
    await getLearningStore().getSimEvidenceSince("u-1", SINCE);
    const sql = lastSql();

    for (const field of ["conceptId", "kind", "severityClass"]) {
      expect(sql).toContain(`'${field}'`);
    }
    // The prose that made this read expensive must not be on the wire. If the
    // whole column is ever selected again, every ViolationEvent's titleBg and
    // explanationBg come with it.
    expect(
      sql,
      "selecting the whole events column is the defect this file exists for",
    ).not.toMatch(/SELECT[^;]*\bs\."events"\s+AS/i);
    expect(sql).not.toMatch(/\bs\."events"\s*,/);
  });

  it("bounds by user and window, newest drive first, on an index that exists", async () => {
    await getLearningStore().getSimEvidenceSince("u-1", SINCE);
    const call = h.calls.at(-1)!;

    expect(call.values).toContain("u-1");
    expect(call.values).toContain(SINCE);
    expect(call.sql).toMatch(/"userId"\s*=/);
    expect(call.sql).toMatch(/"finishedAt"\s*>=/);
    // startedAt, not finishedAt: (userId, startedAt) is the index SimSession
    // actually has, so the cap is a bounded READ rather than a bounded scan.
    expect(call.sql).toMatch(/ORDER BY\s+s\."startedAt"\s+DESC/i);
  });

  it("cannot be made to throw by one session with a corrupt payload", async () => {
    await getLearningStore().getSimEvidenceSince("u-1", SINCE);
    const sql = lastSql();
    // jsonb_array_elements() raises "cannot extract elements from a scalar"
    // on anything that is not an array, and readiness swallows the rejection
    // (readiness.ts getSimWeakSpots .catch), so one bad row would silently
    // delete every student's sim evidence with nothing in the logs.
    expect(sql).toMatch(/jsonb_typeof\([^)]*'ruleEvents'\)\s*=\s*'array'/i);
    // Same envelope check the in-Node parse used to do.
    expect(sql).toMatch(/'version'\s*=\s*'1'/);
  });

  it("skips junk inside the array instead of trusting it", async () => {
    h.rows.push(
      projected("c-traffic-light-signals", "violation", "opasna"),
      projected("c-lane-change", "commendation", null),
      // `->>` on a non-object element yields SQL NULL for all three.
      projected(null, null, null),
      // A severity outside the official three would be used to index
      // SIM_SEVERITY_UNITS and weigh the violation `undefined`.
      projected("c-road", "violation", "made-up"),
      projected("c-road", "violation", null),
      projected("", "violation", "osnovna"),
    );

    const rows = await getLearningStore().getSimEvidenceSince("u-1", SINCE);
    expect(rows.map((r) => r.conceptId)).toEqual([
      "c-traffic-light-signals",
      "c-lane-change",
    ]);
    expect(rows[0]!.severity).toBe("opasna");
    expect(rows[1]!.severity).toBeNull();
  });

  it("keeps a row whose timestamp the driver adapter hands over as a string", async () => {
    h.rows.push(projected("c-road", "violation", "osnovna", "2026-08-01T10:05:00.000Z"));
    const rows = await getLearningStore().getSimEvidenceSince("u-1", SINCE);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.finishedAt.toISOString()).toBe("2026-08-01T10:05:00.000Z");
  });

  it("falls back to the window floor rather than dropping evidence", async () => {
    // The WHERE cannot match a NULL finishedAt, so this only happens if the
    // adapter's shape changes. Losing the row would silently shrink the
    // evidence a student's readiness is computed from; the floor is honest.
    h.rows.push(projected("c-road", "violation", "osnovna", { nope: true }));
    const rows = await getLearningStore().getSimEvidenceSince("u-1", SINCE);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.finishedAt).toEqual(SINCE);
  });
});
