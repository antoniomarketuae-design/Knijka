/**
 * DOOR 6 — the post-exam review, against the REAL bank and the REAL gate.
 *
 * WHAT THIS CLOSES (docs/education/92 §10.3). `submitExam` freezes the NUMBER
 * — `correct`, `points`, `maxPoints`, deliberately, so a later content edit
 * cannot change what a candidate could have scored (audit M-1) — and left the
 * TEXT live. `rehydrateReview` and `exams/actions.ts buildReview` then re-read
 * `repo.questionById(id)` with no check of any kind and returned `textBg`,
 * `options[].correct`, `explanationBg` and `lawRefs` AS THEY ARE TODAY. It was
 * found by running it, not by reading it:
 *
 *     rehydrateReview([{ questionId: "q-ptp-009", … }])
 *       → 542 characters of explanation, correct flags [f,t,f,f], 4 citations
 *       → and q-ptp-009 is `needs-review`.
 *
 * `/review` can `reject` a sat row to `draft` or `edit` its answer key and
 * re-approve it, so the page could print the NEW key beside the OLD verdict.
 *
 * WHAT IS ASSERTED, and the discipline it follows. The forbidden set is built
 * FROM `content/` — every question whose `status` is not `approved` — and NEVER
 * from the gate under test: a gate checked against a set it produced itself
 * proves only that it agrees with itself. The five states are then each driven
 * end to end, and the negative controls come first, because a probe that cannot
 * fail has not passed.
 *
 * SERVER-SIDE ONLY, real content, real `questionClearance`. Nothing is mocked.
 */

import { beforeAll, describe, expect, it } from "vitest";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import type { Question } from "@/lib/content/types";
import { buildReviewRow, rehydrateReview, reviewIntegrity, teachingPin } from "..";

let approved: Question[] = [];
let notApproved: Question[] = [];

beforeAll(() => {
  const all = getContentRepo().questions();
  approved = all.filter((q) => q.status === "approved");
  notApproved = all.filter((q) => q.status !== "approved");
});

/** One graded row, as `submitExam` writes it today. */
function graded(q: Question, contentPin: string | undefined) {
  return {
    questionId: q.id,
    optionIds: q.options.filter((o) => o.correct).map((o) => o.id),
    correct: true,
    points: q.points,
    maxPoints: q.points,
    contentPin,
  };
}

/** Everything on a card that came out of the bank rather than out of the grade. */
function bankStrings(row: ReturnType<typeof buildReviewRow>): string[] {
  return [
    row.textBg,
    row.explanationBg,
    ...row.options.map((o) => o.textBg),
    ...row.lawRefs.map((l) => `${l.act} ${l.ref}`),
  ].filter((s) => s.length > 0);
}

describe("door 6 — the review is checked where it is READ", () => {
  it("the bank this test runs against is the real one", () => {
    // A probe pointed at an empty bank passes every assertion below.
    expect(approved.length).toBeGreaterThan(700);
    expect(notApproved.length).toBeGreaterThan(0);
    expect(approved.length + notApproved.length).toBeGreaterThan(1000);
  });

  it("an approved, unmoved row is verified and teaches in full", () => {
    const q = approved[0];
    const row = buildReviewRow(graded(q, teachingPin(q)));
    expect(row.integrity).toBe("verified");
    expect(row.noticeBg).toBe("");
    expect(row.textBg).toBe(q.textBg);
    expect(row.explanationBg).toBe(q.explanationBg);
    expect(row.options.some((o) => o.correct)).toBe(true);
    expect(row.lawRefs.length).toBe(q.lawRefs.length);
  });

  it("A ROW THE BANK NO LONGER BACKS IS WITHHELD — every non-approved question, one by one", () => {
    // The forbidden set, straight out of content/. 290 rows the day this was
    // written, among them the 29 quarantined first-aid ones.
    const leaks: string[] = [];
    for (const q of notApproved) {
      const row = buildReviewRow(graded(q, teachingPin(q)));
      if (row.integrity !== "withdrawn") {
        leaks.push(`${q.id}: integrity=${row.integrity}, expected withdrawn`);
        continue;
      }
      const spoken = bankStrings(row);
      const banned = [
        q.textBg,
        q.explanationBg,
        ...q.options.map((o) => o.textBg),
      ].filter((s) => s.length > 0);
      for (const s of spoken) {
        if (banned.includes(s)) leaks.push(`${q.id}: review still speaks „${s.slice(0, 60)}…"`);
      }
      if (row.options.length > 0) leaks.push(`${q.id}: answer key still on the card`);
      if (row.lawRefs.length > 0) leaks.push(`${q.id}: citations still on the card`);
      if (row.noticeBg.length === 0) leaks.push(`${q.id}: withheld with no explanation to the student`);
    }
    expect(leaks, leaks.slice(0, 20).join("\n")).toEqual([]);
  });

  it("withholding never touches the verdict or the points", () => {
    const q = notApproved[0];
    const row = buildReviewRow({ ...graded(q, teachingPin(q)), correct: false, points: 0 });
    expect(row.integrity).toBe("withdrawn");
    expect(row.correct).toBe(false);
    expect(row.pointsAwarded).toBe(0);
    expect(row.maxPoints).toBe(q.points);
    expect(row.answered).toBe(true);
  });

  it("a row edited after the exam is `moved` — the new key never meets the old verdict", () => {
    const q = approved[0];
    // The pin as it would have been written for a DIFFERENT answer key.
    const before = teachingPin({
      ...q,
      options: q.options.map((o) => ({ ...o, correct: !o.correct })),
    });
    expect(before).not.toBe(teachingPin(q));

    const row = buildReviewRow(graded(q, before));
    expect(row.integrity).toBe("moved");
    expect(row.options).toEqual([]);
    expect(row.explanationBg).toBe("");
    expect(row.lawRefs).toEqual([]);
    expect(row.noticeBg).toMatch(/редактиран/);
    expect(row.pointsAwarded).toBe(q.points);
  });

  it("an edit to the EXPLANATION alone still counts as moved", () => {
    // The `edit` action patches explanationBg and re-approves, so status says
    // nothing. The fingerprint is the only thing that can see it.
    const q = approved[0];
    const before = teachingPin({ ...q, explanationBg: `${q.explanationBg} (стар текст)` });
    expect(reviewIntegrity(q, before)).toBe("moved");
  });

  it("a citation edited after the exam is caught too", () => {
    const q = approved.find((x) => x.lawRefs.length > 0);
    expect(q).toBeDefined();
    const before = teachingPin({
      ...q!,
      lawRefs: [{ act: "ЗДвП", ref: "чл. 9999" }, ...q!.lawRefs],
    });
    expect(reviewIntegrity(q!, before)).toBe("moved");
  });

  it("a row graded before fingerprints existed says so instead of pretending", () => {
    const q = approved[0];
    const row = buildReviewRow(graded(q, undefined));
    expect(row.integrity).toBe("unpinned");
    // It still teaches — blanking every historical review would cost more than
    // it buys — but it does not claim the text is the text that was graded.
    expect(row.explanationBg).toBe(q.explanationBg);
    expect(row.noticeBg.length).toBeGreaterThan(0);
    expect(row.noticeBg).toMatch(/ДНЕШНАТА/);
  });

  it("a question that has left the bank degrades to the verdict, as before", () => {
    const row = buildReviewRow({
      questionId: "q-does-not-exist",
      optionIds: [],
      correct: false,
      points: 0,
      maxPoints: 2,
      contentPin: "deadbeefdeadbeef",
    });
    expect(row.integrity).toBe("gone");
    expect(row.options).toEqual([]);
    expect(row.noticeBg).toMatch(/вече не е наличен/);
  });

  it("rehydrateReview carries the state through, and the topic breakdown is unchanged by it", () => {
    const good = approved[0];
    const bad = notApproved[0];
    const { questions, byTopic } = rehydrateReview([
      graded(good, teachingPin(good)),
      graded(bad, teachingPin(bad)),
    ]);
    expect(questions.map((q) => q.integrity)).toEqual(["verified", "withdrawn"]);

    // Both rows still count towards their topic: „practise Приоритет next" is a
    // fact about the answers, not about whether a row is readable today.
    const counted = byTopic.reduce((n, t) => n + t.questions, 0);
    const resolvable = questions.filter((q) => q.topicSlug !== null).length;
    expect(counted).toBe(resolvable);
    expect(counted).toBeGreaterThan(0);
  });

  it("the pin moves for every field a review teaches from, and for nothing else", () => {
    const q = approved.find((x) => x.lawRefs.length > 0 && x.options.length > 1)!;
    const base = teachingPin(q);

    expect(teachingPin({ ...q, textBg: `${q.textBg} ` })).not.toBe(base);
    expect(teachingPin({ ...q, explanationBg: `${q.explanationBg} ` })).not.toBe(base);
    expect(
      teachingPin({
        ...q,
        options: q.options.map((o, i) => (i === 0 ? { ...o, correct: !o.correct } : o)),
      }),
    ).not.toBe(base);
    expect(
      teachingPin({ ...q, options: q.options.map((o, i) => (i === 0 ? { ...o, textBg: "x" } : o)) }),
    ).not.toBe(base);
    expect(teachingPin({ ...q, lawRefs: [] })).not.toBe(base);

    // And NOT for a retag: hashing these would make editorial housekeeping look
    // like a changed answer, which is how a notice gets trained into noise.
    expect(teachingPin({ ...q, conceptIds: [...q.conceptIds, "c-made-up"] })).toBe(base);
    expect(teachingPin({ ...q, status: "draft" })).toBe(base);
  });
});
