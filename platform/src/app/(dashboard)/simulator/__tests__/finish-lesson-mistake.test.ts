/**
 * ADR-009 — WHAT THE SERVER STORES, AND WHAT IT COSTS (doc 92 §5.8, §5.9, §6;
 * lane F, test T14).
 *
 * THE DRIVE. `sc-vu-pass-clearance@L3`: the student reaches the end of the
 * route, the изпитен лист takes nothing at all, and on the way he squeezes past
 * the cyclist — `VULNERABLE_PASS_TOO_CLOSE`, the one act this lesson exists to
 * teach (its derived target: `lesson-mistake-targets.fixture.json`). Under
 * founder Ruling A the first occurrence is taught for free and the lesson is
 * NOT taken.
 *
 * That makes one row carry four facts that used to be the same fact:
 *   `passed: false`            — the lesson was not taken;
 *   `sheetRoutePassed: true`   — the EXAM verdict, which self-calibration
 *                                measures and which the ruling does not touch;
 *   `score: 0`                 — nothing reached the изпитен лист;
 *   `lessonMistakes: [...]`     — WHY, so the history row can say it instead of
 *                                printing a bare fail beside a clean sheet.
 *
 * WHAT THIS FILE ALSO HOLDS, because §6 is a claim about consequences and a
 * claim about consequences needs the consequence measured, not the flag: the XP
 * fold is run over the arguments the action really passed (`xpForEvent`), the
 * level gate is driven with a real not-taken history row, and the three folds
 * that decide what is NOT lost — the next-step row, the exam-card gate and the
 * personal best — are asked directly.
 *
 * The harness is `finish-pool-timeout.test.ts`'s, with one addition: the
 * content repo is faked rather than mocked away, because the theory link the
 * student is offered after a not-taken lesson is part of what is being tested.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimitState } from "@/modules/security";
import {
  XP_SIM_COMPLETED,
  XP_SIM_FIRST_PASS_BONUS,
  XP_SIM_PASSED_BONUS,
  xpForEvent,
} from "@/modules/gamification/xp";
import {
  computeProgression,
  EXAM_LESSON,
  gradeFinishWire,
  isExamUnlocked,
  LESSONS,
  resolveScenarioNextSteps,
  scenarioById,
  scenarioLessonById,
  scenarioLevelProgress,
  scoreRubric,
  type LessonAttemptRow,
} from "@/modules/sim/lessons";
import { retryCtaClass, scenarioCtaRow } from "@/modules/sim/hud";
import { VIOLATIONS } from "@/modules/sim/rules";
import {
  setSimSessionStore,
  type SaveSimSessionInput,
  type SimSessionListRow,
  type SimSessionStore,
} from "@/modules/sim/lessons/store";

const getSessionUser = vi.fn();
vi.mock("@/modules/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth")>()),
  getSessionUser: () => getSessionUser(),
}));

const canDriveSimulator = vi.fn();
vi.mock("../access", () => ({ canDriveSimulator: () => canDriveSimulator() }));

vi.mock("@/lib/content/loader", () => ({}));

/**
 * A content repo with exactly one concept: the one the squeeze is linked to.
 * Faked rather than mocked away — `enrichConcepts` is what turns a hit into a
 * theory link, and «повтори урока без „…“» with no link is the pointer a
 * seventeen-year-old can act on least.
 */
const SQUEEZE_CONCEPT = VIOLATIONS.VULNERABLE_PASS_TOO_CLOSE.conceptId as string;
vi.mock("@/lib/content/repo", () => ({
  getContentRepo: () => ({
    conceptById: (id: string) =>
      id === SQUEEZE_CONCEPT
        ? { id, titleBg: "Изпреварване на велосипедист", topicId: "t-vru" }
        : null,
    topics: () => [{ id: "t-vru", slug: "uyazvimi-uchastnici" }],
  }),
}));

/**
 * The debrief is REAL and is recorded on the way through.
 *
 * Doc 92 §5.6.9 gives lane F the `conceptTitles` half of the union and lane D
 * the branch that prints it, and they land in separate PRs — so the only place
 * this half can be pinned today is the seam itself: what the action hands
 * `buildDebrief`. Without a check here it is a predicate nothing reads until
 * another lane arrives, which is the shape this programme measured 51 times in
 * 82 repairs.
 */
const buildDebriefSpy = vi.fn();
vi.mock("@/modules/sim/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/sim/lessons")>();
  return {
    ...actual,
    buildDebrief: (...args: Parameters<typeof actual.buildDebrief>) => {
      buildDebriefSpy(...args);
      return actual.buildDebrief(...args);
    },
  };
});

const recordActivity = vi.fn();
vi.mock("@/modules/gamification", () => ({
  recordActivity: (...a: unknown[]) => recordActivity(...a),
}));
vi.mock("@/modules/learning", () => ({ recordSimObservations: async () => undefined }));

const { finishLessonAction } = await import("../actions");

const USER = { id: "u-driver", email: "ivan@mail.bg", name: "Иван", isAdmin: false };
const TEMPLATE = "sc-vu-pass-clearance";
const LESSON_ID = `${TEMPLATE}@L3`;
const SQUEEZE = "VULNERABLE_PASS_TOO_CLOSE";

/**
 * The wire the browser sends. Objectives are taken from the compiled rung, so
 * the payload stays valid if the template is re-authored (a hand-written id
 * list would make `reconcileObjectiveOutcomes` refuse the whole drive and this
 * test would then prove nothing).
 */
function drive(opts: { coached?: Array<{ code: string; t: number; detail?: string }> } = {}): unknown {
  const lesson = scenarioLessonById(LESSON_ID);
  if (lesson === undefined) throw new Error(`${LESSON_ID} does not compile`);
  const startedAtMs = Date.UTC(2026, 8, 17, 21, 26, 0);
  return {
    lessonId: LESSON_ID,
    startedAtMs,
    finishedAtMs: startedAtMs + 121_000,
    aborted: false,
    ruleEvents: [],
    objectives: lesson.objectives.map((o) => ({ id: o.id, done: true, completedAtSec: 40 })),
    ...(opts.coached !== undefined ? { coachedMistakes: opts.coached } : {}),
  };
}

/** One previous attempt at L2 — not passed, one star. B9: a rung opens on an
 *  ATTEMPT, whatever it scored, which is what §6 promises is not lost. */
function historyRow(extra: Partial<SimSessionListRow> = {}): SimSessionListRow {
  return {
    id: "sess-l2",
    lessonId: `${TEMPLATE}@L2`,
    finishedAt: new Date(Date.UTC(2026, 8, 16, 20, 0, 0)),
    score: 0,
    passed: false,
    rubricStars: 1,
    ...extra,
  };
}

interface Recording {
  saved: SaveSimSessionInput[];
}

function installStore(history: SimSessionListRow[]): Recording {
  const rec: Recording = { saved: [] };
  const store: SimSessionStore = {
    async saveSession(_userId, input) {
      rec.saved.push(input);
      return { id: "sess-new" };
    },
    async listSessions() {
      return history;
    },
    async listRecentSessions() {
      return [];
    },
  };
  setSimSessionStore(store);
  return rec;
}

beforeEach(() => {
  resetRateLimitState();
  getSessionUser.mockResolvedValue(USER);
  canDriveSimulator.mockResolvedValue(true);
  recordActivity.mockResolvedValue({
    xpAwarded: 40,
    totalXp: 40,
    level: 1,
    leveledUp: false,
    streak: 1,
    newAchievements: [],
    missionCompleted: false,
  });
});

afterEach(() => {
  resetRateLimitState();
  setSimSessionStore(null);
  vi.resetAllMocks();
});

describe("the stored row", () => {
  it("records the lesson refused, the exam passed, and why", async () => {
    const rec = installStore([historyRow()]);

    const result = await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));

    expect(result).toMatchObject({ ok: true, sessionId: "sess-new" });
    const events = rec.saved[0]?.events;
    expect(events?.passed).toBe(false);
    // The exam reading, stored explicitly — the field self-calibration reads.
    expect(events?.sheetRoutePassed).toBe(true);
    expect(rec.saved[0]?.score).toBe(0);
    expect(events?.lessonMistakes).toEqual([{ code: SQUEEZE, t: 20.9, charged: false }]);
  });

  it("stores the act as a SELECTOR, never a title", async () => {
    // ADR-002: the column carries `(code, t, charged, detail)` and the history
    // screen retitles from the catalogue at render time. A title written here
    // would freeze the catalogue's wording on the day of the drive.
    const rec = installStore([historyRow()]);

    await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9, detail: "cyclist" }] }));

    // The act rides through — the history row needs it to pick the act's own
    // catalogue title — and nothing else does.
    expect(rec.saved[0]?.events.lessonMistakes).toEqual([
      { code: SQUEEZE, t: 20.9, charged: false, detail: "cyclist" },
    ]);
    expect(Object.keys(rec.saved[0]?.events.lessonMistakes?.[0] ?? {}).sort()).toEqual([
      "charged",
      "code",
      "detail",
      "t",
    ]);
  });

  it("writes `sheetRoutePassed` on EVERY row, so a missing field dates the row", async () => {
    // Not only on the rows with a hit: `readSessionPassed` uses «absent» to
    // mean «written before 2026-09-18», and that has to stay the only meaning.
    const clean = installStore([historyRow()]);
    await finishLessonAction(drive());
    expect(clean.saved[0]?.events.sheetRoutePassed).toBe(true);
    expect(clean.saved[0]?.events.passed).toBe(true);
    expect(clean.saved[0]?.events.lessonMistakes).toBeUndefined();

    setSimSessionStore(null);
    resetRateLimitState();

    // …and on a drive that failed the sheet itself: the two fields agree there,
    // and both are false.
    const failed = installStore([historyRow()]);
    await finishLessonAction({
      ...(drive() as Record<string, unknown>),
      ruleEvents: [{ kind: "violation", code: "COLLISION", t: 30 }],
    });
    expect(failed.saved[0]?.events.sheetRoutePassed).toBe(false);
    expect(failed.saved[0]?.events.passed).toBe(false);
  });

  it("writes `sheetPassed` — the лист ALONE — on every row too", async () => {
    // What the history row's word is decided by (doc 92 §5.8): the изпитен лист
    // with neither the route nor the lesson rule folded in. On a not-taken
    // drive all three fields disagree, which is exactly why there are three.
    const refused = installStore([historyRow()]);
    await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));
    expect(refused.saved[0]?.events.sheetPassed).toBe(true);
    expect(refused.saved[0]?.events.passed).toBe(false);

    setSimSessionStore(null);
    resetRateLimitState();

    // …and false on the drive that really did fail the лист — the row that used
    // to read «Не е взет» in warning tone over a collision.
    const crashed = installStore([historyRow()]);
    await finishLessonAction({
      ...(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }) as Record<string, unknown>),
      ruleEvents: [{ kind: "violation", code: "COLLISION", t: 30 }],
    });
    expect(crashed.saved[0]?.events.sheetPassed).toBe(false);
    expect(crashed.saved[0]?.events.lessonMistakes).toEqual([
      { code: SQUEEZE, t: 20.9, charged: false },
    ]);
  });

  it("stores the stars exactly as the rubric scored them", async () => {
    // «Не е взет» costs a star through the RUBRIC (doc 92 §5.7, lane E), not
    // through this action: it writes what `scoreRubric` returned. Asserted
    // against the same fold over the same server-graded result, so this stays
    // true when the 1★ cap lands and fails the moment the write goes missing.
    const rec = installStore([historyRow()]);
    await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));

    const graded = gradeFinishWire(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));
    if (graded.status !== "ok") throw new Error(`expected a gradable wire, got ${graded.status}`);
    const spec = scenarioById(TEMPLATE);
    if (spec?.rubric === undefined) throw new Error(`${TEMPLATE} authors no rubric`);

    expect(rec.saved[0]?.events.rubricStars).toBe(scoreRubric(graded.result, spec.rubric).stars);
    expect(typeof rec.saved[0]?.events.rubricStars).toBe("number");
  });
});

describe("the theory link the student is handed", () => {
  it("names the concept of the mistake that cost the lesson", async () => {
    installStore([historyRow()]);

    const result = await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));

    if (result.ok !== true) throw new Error(`expected ok, got ${result.code}`);
    expect(result.concepts.map((c) => c.id)).toContain(SQUEEZE_CONCEPT);
    expect(result.concepts[0]).toMatchObject({
      id: SQUEEZE_CONCEPT,
      titleBg: "Изпреварване на велосипедист",
      href: "/theory/practice?topic=uyazvimi-uchastnici",
    });
  });

  it("hands the DEBRIEF the same concept, titled (§5.6.9, lane F's half)", async () => {
    // `summary.conceptIds` is folded from the CHARGED ledger and a lesson
    // mistake's first occurrence is never charged — so without the union the
    // one concept the student needs revising is the one concept with no title,
    // and lane D's branch degrades to «повтори урока…» with no theory link.
    installStore([historyRow()]);

    await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));

    const context = buildDebriefSpy.mock.calls[0]?.[2] as { conceptTitles: Record<string, string> };
    expect(Object.keys(context.conceptTitles)).toContain(SQUEEZE_CONCEPT);
    expect(context.conceptTitles[SQUEEZE_CONCEPT]).toBe("Изпреварване на велосипедист");
  });

  it("offers no such link on a clean drive", async () => {
    // Vacuity guard: the union must come from the hit, not from a list that
    // always contains this concept.
    installStore([historyRow()]);
    const result = await finishLessonAction(drive());
    if (result.ok !== true) throw new Error(`expected ok, got ${result.code}`);
    expect(result.concepts.map((c) => c.id)).not.toContain(SQUEEZE_CONCEPT);
  });
});

describe("what «Не е взет» costs", () => {
  it("pays the 40 for the drive and neither bonus", async () => {
    // §6, measured through the real fold rather than the flag: the pass bonus
    // (60) and the one-time first-pass bonus (50) both hang off `passed`.
    installStore([historyRow()]);

    await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));

    const event = recordActivity.mock.calls[0]?.[1];
    expect(event).toMatchObject({ type: "sim_lesson", passed: false, firstPass: false });
    expect(xpForEvent(event)).toBe(XP_SIM_COMPLETED);
  });

  it("pays both bonuses for the same drive without the squeeze", async () => {
    // The other direction, and the one that makes the assertion above mean
    // something: nothing here is pinned off.
    installStore([historyRow()]);

    await finishLessonAction(drive());

    const event = recordActivity.mock.calls[0]?.[1];
    expect(event).toMatchObject({ passed: true, firstPass: true });
    expect(xpForEvent(event)).toBe(
      XP_SIM_COMPLETED + XP_SIM_PASSED_BONUS + XP_SIM_FIRST_PASS_BONUS,
    );
  });

  it("withholds «Следващо ниво» and keeps «Продължи напред»", async () => {
    // The end screen's own folds (`LessonPlayShell.tsx:5633` →
    // `resolveScenarioNextSteps`, `SessionEndScreen.tsx:1041` →
    // `scenarioCtaRow`), driven with the verdict this action now stores.
    const steps = resolveScenarioNextSteps({
      templateId: TEMPLATE,
      level: 3,
      passed: false,
      allObjectivesPassed: true,
    });
    expect(steps.level).toBeNull();
    expect(steps.template).not.toBeNull();

    // The shell turns each step into a labelled launcher (`scenarioTarget`,
    // LessonPlayShell.tsx ~:5651); the row below is that shape.
    const launcher = (step: typeof steps.template) =>
      step === null ? null : { labelBg: `${step.titleBg} · Ниво ${step.level}`, onStart: () => {} };
    const row = scenarioCtaRow(
      { level: launcher(steps.level), template: launcher(steps.template) },
      { passed: false },
    );
    expect(row).toHaveLength(1);
    expect(row[0]).toMatchObject({
      id: "template",
      leadBg: "Продължи напред",
      noteBg: "Този урок не е взет, но остава отворен — върни се към него, когато поискаш.",
      // No accent: going on is offered, re-driving is still the recommendation.
      className: "btn-ghost",
    });
    // …and «Повтори» is the accent, i.e. retry stays and stays the ACTION.
    expect(retryCtaClass(row)).toBe("btn-accent");

    // The same rung after a clean pass still offers the ladder.
    expect(
      resolveScenarioNextSteps({
        templateId: TEMPLATE,
        level: 3,
        passed: true,
        allObjectivesPassed: true,
        stars: 3,
      }).level,
    ).not.toBeNull();
  });
});

describe("what it does not block", () => {
  it("persists the next rung after a not-taken attempt — rungs open on ATTEMPT", async () => {
    // The soft level gate reads THIS user's history (`actions.ts:272-291`). A
    // row with `passed: false` and one star is still an attempt, so L3 saves.
    const rec = installStore([historyRow()]);

    const result = await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));

    expect(result).toMatchObject({ ok: true });
    expect(rec.saved).toHaveLength(1);
  });

  it("still refuses a rung nobody has reached — the gate is live", async () => {
    // Vacuity guard for the test above.
    const rec = installStore([]);
    const result = await finishLessonAction(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }));
    expect(result).toMatchObject({ ok: false, code: "LEVEL_LOCKED" });
    expect(rec.saved).toHaveLength(0);
  });

  it("stores nothing at all for the THEO-3 sandbox (ADR-009 exempts it)", async () => {
    // «Направи грешката» is the one place the mistake IS the assignment, and
    // the exemption is structural rather than a flag this action reads: the
    // `~m<i>` id is outside the rung namespace `parseScenarioLessonId` accepts
    // (`resolve.ts:28`), so the wire never resolves to a lesson and no row is
    // written — no verdict, no stars, no XP.
    const rec = installStore([historyRow()]);

    const result = await finishLessonAction({
      ...(drive({ coached: [{ code: SQUEEZE, t: 20.9 }] }) as Record<string, unknown>),
      lessonId: `${LESSON_ID}~m0`,
    });

    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_LESSON" });
    expect(rec.saved).toHaveLength(0);
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("does not lower the personal best — stars are a maximum across attempts", () => {
    // `scenarioLevelProgress` (progress.ts:280-283) is what the catalogue
    // prints. A one-star not-taken attempt after a three-star pass leaves
    // «взето с 3★» standing.
    const spec = scenarioById(TEMPLATE);
    if (spec === undefined) throw new Error(`${TEMPLATE} is not in the catalogue`);
    const rung = scenarioLevelProgress(spec, [
      { lessonId: LESSON_ID, rubricStars: 3 },
      { lessonId: LESSON_ID, rubricStars: 1 },
    ]).find((l) => l.level === 3);
    expect(rung).toMatchObject({ bestStars: 3, passed: true, attempts: 2 });
  });

  it("leaves the exam card and the curriculum exactly where they were (F2)", () => {
    // Founder answer F2: scenario lessons only. The exam gate keys on a PASS of
    // its named curriculum prerequisite (`progression.ts:162-171`), and
    // `computeProgression` only ever looks at curriculum ids — so a scenario
    // row that stores `passed: false` cannot reach either.
    const curriculum: LessonAttemptRow[] = LESSONS.map((l) => ({
      lessonId: l.id,
      passed: true,
      score: 0,
    }));
    const withScenario: LessonAttemptRow[] = [
      ...curriculum,
      { lessonId: LESSON_ID, passed: false, score: 0 },
    ];

    expect(isExamUnlocked(EXAM_LESSON, withScenario)).toBe(isExamUnlocked(EXAM_LESSON, curriculum));
    expect(isExamUnlocked(EXAM_LESSON, withScenario)).toBe(true);
    expect(computeProgression(LESSONS, withScenario)).toEqual(
      computeProgression(LESSONS, curriculum),
    );
  });
});
