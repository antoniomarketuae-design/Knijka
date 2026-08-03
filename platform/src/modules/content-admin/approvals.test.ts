/**
 * The honest-approval rules (docs/education/90 §1).
 *
 * The defect these tests exist for is not a crash — it is a sentence that was
 * false: 1,005 questions said `"status": "approved"` and no human had read one
 * of them. So what is asserted here is meaning, not mechanics:
 *
 *   - a status string alone NEVER counts as a human approval;
 *   - a signature stops counting the moment the row it covers changes;
 *   - the canonical hash covers everything a student is taught or graded on,
 *     and the two implementations of it (the app's TS, the validator's .mjs)
 *     agree on every question in the real bank.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalQuestionContent as canonicalMjs,
  hashQuestionContent as hashMjs,
} from "../../../../tools/theory/question_hash.mjs";
import type { Question } from "@/lib/content/types";
import { getContentRepo } from "@/lib/content/repo";
import "@/lib/content/loader"; // side effect: registers the real ContentRepo
import {
  approvalStateOf,
  emptyLedger,
  indexLedger,
  isHumanApproved,
  makeSignature,
  withSignature,
} from "./approvals";
import { CONTENT_HASH_RE, canonicalQuestionContent, hashQuestionContent } from "./hash";
import type { ApprovalEntry } from "./types";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-test-001",
    conceptIds: ["c-uncontrolled-junction"],
    type: "single",
    points: 2,
    textBg: "Кой има предимство?",
    options: [
      { id: "a", textBg: "Ти", correct: true },
      { id: "b", textBg: "Другият", correct: false },
    ],
    explanationBg: "Защото знакът го казва.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
    media: null,
    status: "approved",
    ...overrides,
  } as Question;
}

describe("the canonical content hash", () => {
  it("looks like sha256:<64 hex>", () => {
    expect(hashQuestionContent(question())).toMatch(CONTENT_HASH_RE);
  });

  it("changes when ANY graded field changes", () => {
    const base = hashQuestionContent(question());
    const mutations: Partial<Question>[] = [
      { textBg: "Друг въпрос?" },
      { explanationBg: "Друго обяснение." },
      { points: 3 },
      { type: "multi" },
      { lawRefs: [{ act: "ЗДвП", ref: "чл. 48" }] },
      {
        options: [
          { id: "a", textBg: "Ти", correct: false },
          { id: "b", textBg: "Другият", correct: true },
        ],
      },
      { media: { kind: "sign", signRef: "Б2" } },
    ];
    for (const mutation of mutations) {
      expect(hashQuestionContent(question(mutation)), JSON.stringify(mutation)).not.toBe(base);
    }
  });

  it("flipping ONLY the answer key changes it — the defect class the audit found", () => {
    // 24 questions had the wrong option marked. If `correct` were outside the
    // hash, a signature would survive someone inverting the answer key.
    const before = hashQuestionContent(question());
    const after = hashQuestionContent(
      question({
        options: [
          { id: "a", textBg: "Ти", correct: false },
          { id: "b", textBg: "Другият", correct: true },
        ],
      }),
    );
    expect(after).not.toBe(before);
  });

  it("does NOT change when status changes — approving must not void its own signature", () => {
    expect(hashQuestionContent(question({ status: "approved" }))).toBe(
      hashQuestionContent(question({ status: "needs-review" })),
    );
  });

  it("is stable across key reordering in the source object", () => {
    const a = question();
    const reordered = JSON.parse(
      JSON.stringify({
        status: a.status,
        media: a.media,
        lawRefs: a.lawRefs,
        explanationBg: a.explanationBg,
        options: a.options,
        textBg: a.textBg,
        points: a.points,
        type: a.type,
        conceptIds: a.conceptIds,
        id: a.id,
      }),
    ) as Question;
    expect(hashQuestionContent(reordered)).toBe(hashQuestionContent(a));
  });
});

describe("the TS mirror and the validator's .mjs never disagree", () => {
  // Two implementations exist because the CI validator is a dependency-free
  // script and the app runs inside Next. If they ever drifted, a signature
  // written by the app would read as stale to the gate and every approval the
  // founder made would silently evaporate.
  it("agree on every question in the real bank", () => {
    const questions = getContentRepo().questions();
    expect(questions.length).toBeGreaterThan(0);
    const mismatches = questions.filter((q) => hashQuestionContent(q) !== hashMjs(q));
    expect(mismatches.map((q) => q.id)).toEqual([]);
  });

  it("agree on the canonical projection itself", () => {
    const q = question({ options: [{ id: "a", textBg: "Ти", correct: true, media: { kind: "sign", signRef: "Б2" } }, { id: "b", textBg: "Не", correct: false }] });
    expect(canonicalQuestionContent(q)).toEqual(canonicalMjs(q));
  });
});

describe("approvalStateOf — the only place that answers 'did a human approve this?'", () => {
  const signature = (q: Question, over: Partial<ApprovalEntry> = {}): ApprovalEntry => ({
    ...makeSignature(q, "approved", "Антонио"),
    ...over,
  });

  it("treats an UNSIGNED `approved` row as a claim, not an approval", () => {
    const q = question({ status: "approved" });
    expect(approvalStateOf(q, undefined)).toEqual({ kind: "unsigned-claim" });
    expect(isHumanApproved(q, undefined)).toBe(false);
  });

  it("treats a signed row whose text still matches as human-approved", () => {
    const q = question();
    expect(isHumanApproved(q, signature(q))).toBe(true);
  });

  it("drops the approval the moment the row is edited — explanation-only counts", () => {
    // THEO-4: a right key with a wrong explanation still teaches the wrong
    // thing, so an explanation edit has to invalidate the review too.
    const q = question();
    const sig = signature(q);
    const edited = question({ explanationBg: "Ново обяснение, никой не го е чел." });
    expect(approvalStateOf(edited, sig).kind).toBe("signature-stale");
    expect(isHumanApproved(edited, sig)).toBe(false);
  });

  it("never turns a rejection into an approval", () => {
    const q = question();
    const sig = signature(q, { verdict: "rejected" });
    expect(approvalStateOf(q, sig).kind).toBe("human-rejected");
    expect(isHumanApproved(q, sig)).toBe(false);
  });

  it("reports a non-approved row with no signature as plain unsigned", () => {
    expect(approvalStateOf(question({ status: "machine-checked" }), undefined)).toEqual({
      kind: "unsigned",
    });
  });
});

describe("the ledger", () => {
  it("keeps ONE current decision per question — a re-approval replaces, never piles up", () => {
    const q = question();
    let ledger = emptyLedger(846);
    ledger = withSignature(ledger, makeSignature(q, "approved", "Антонио"));
    ledger = withSignature(ledger, makeSignature(q, "rejected", "Антонио"));
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0].verdict).toBe("rejected");
  });

  it("stays sorted by questionId so the file diffs cleanly", () => {
    let ledger = emptyLedger();
    for (const id of ["q-c", "q-a", "q-b"]) {
      ledger = withSignature(ledger, makeSignature(question({ id }), "approved", "Антонио"));
    }
    expect(ledger.entries.map((e) => e.questionId)).toEqual(["q-a", "q-b", "q-c"]);
  });

  it("records WHO and WHEN, not just that something happened", () => {
    const entry = makeSignature(question(), "approved", "Антонио", "спот-проверка");
    expect(entry.by).toBe("Антонио");
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
    expect(entry.noteBg).toBe("спот-проверка");
    expect(entry.contentHash).toMatch(CONTENT_HASH_RE);
  });

  it("indexes by question id", () => {
    const ledger = withSignature(emptyLedger(), makeSignature(question(), "approved", "А"));
    expect(indexLedger(ledger).get("q-test-001")?.by).toBe("А");
  });
});

describe("the bank, as it actually stands", () => {
  // Not a threshold to tune — a statement of the launch decision. If this ever
  // reads "0 human-approved" alongside a non-zero exam bank, that IS the finding.
  it("reports how many questions carry a real human signature", () => {
    const repo = getContentRepo();
    const ledger = emptyLedger(); // the on-disk ledger is read by validate:content
    const signatures = indexLedger(ledger);
    const signed = repo.questions().filter((q) => isHumanApproved(q, signatures.get(q.id)));
    // The ledger this test builds is empty by construction, so this asserts the
    // shape of the answer, not the number: an empty ledger approves nothing,
    // no matter what the rows say about themselves.
    expect(signed).toHaveLength(0);
    expect(repo.questions().some((q) => q.status === "approved")).toBe(true);
  });
});
