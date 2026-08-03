/**
 * The approval gate, exercised through the real validator exactly as CI runs it.
 * Run: node --test tools/theory/approval_gate.test.mjs
 *
 * WHAT IS BEING GUARDED. The law-vs-bank audit found 1,005 of 1,089 questions
 * marked `"status": "approved"` — 22 of the 24 with a wrong answer key, and all
 * nine that are literally unanswerable — with no human behind a single one
 * (docs/education/90 §1). "approved" recorded that a generator ran. It is the
 * word a customer would quote back at us.
 *
 * The fix is not a rename. It is that the claim is now FALSIFIABLE: authority
 * lives in content/review/approvals.json, an entry names a person and covers
 * the row's content hash, and every rule below is the gate refusing a way that
 * claim could be faked or quietly go stale. Each test is one such way.
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { hashQuestionContent } from "./question_hash.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const VALIDATOR = path.join(REPO_ROOT, "platform", "scripts", "validate-content.mjs");

function question(id, over = {}) {
  return {
    id,
    conceptIds: ["c-fix"],
    type: "single",
    points: 2,
    // Long enough, and varied enough by id, that the answer-leak sweep has
    // nothing to say — this file must fail for approval reasons only.
    textBg: `Фиктивен въпрос ${id} за проверка на подписите в тестова банка?`,
    options: [
      { id: "a", textBg: `Първи възможен отговор с достатъчна дължина ${id}`, correct: true },
      { id: "b", textBg: `Втори възможен отговор с достатъчна дължина ${id}`, correct: false },
    ],
    explanationBg:
      "Обяснението е достатъчно дълго, за да мине проверката за тривиално обяснение в верификатора.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 1" }],
    media: null,
    status: "approved",
    ...over,
  };
}

/** A valid content tree whose ONLY interesting property is the ledger. */
function writeBank(dir, questions, ledger) {
  for (const sub of ["questions", "signs", "review"]) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const write = (rel, data) =>
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(data, null, 2), "utf8");
  write("topics.json", [
    {
      id: "t-fixture",
      order: 1,
      slug: "fixture",
      titleBg: "Фиктивна тема",
      titleEn: "Fixture topic",
      descriptionBg: "Само за тест на гарда.",
    },
  ]);
  write("concepts.json", [
    {
      id: "c-fix",
      topicId: "t-fixture",
      titleBg: "Фиктивно понятие",
      titleEn: "Fixture concept",
      summaryBg: "Само за тест.",
      dependsOn: [],
      lawRefs: [{ act: "ЗДвП", ref: "чл. 1" }],
      difficulty: 1,
    },
  ]);
  write(path.join("signs", "signs.json"), []);
  write(path.join("questions", "fixture.json"), questions);
  if (ledger !== null) write(path.join("review", "approvals.json"), ledger);
}

function ledgerOf(baseline, entries = []) {
  return {
    version: 1,
    readmeBg: "Фикстура.",
    unsignedApprovedBaseline: baseline,
    baselineFrozenAt: "2026-08-03",
    entries,
  };
}

function signature(q, over = {}) {
  return {
    questionId: q.id,
    verdict: "approved",
    by: "Антонио",
    at: "2026-08-03T09:00:00.000Z",
    contentHash: hashQuestionContent(q),
    noteBg: null,
    ...over,
  };
}

function runValidator(contentDir) {
  try {
    const stdout = execFileSync(process.execPath, [VALIDATOR], {
      env: { ...process.env, CONTENT_DIR: contentDir },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** Build a bank, run the gate, clean up. */
function withBank(questions, ledger, assertions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "approval-gate-"));
  try {
    writeBank(dir, questions, ledger);
    assertions(runValidator(dir), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("an unsigned `approved` row is allowed only up to the frozen ceiling", () => {
  const questions = [question("q-1"), question("q-2"), question("q-3")];
  withBank(questions, ledgerOf(3), (r) => {
    assert.equal(r.code, 0, `at the ceiling the bank must still build:\n${r.output}`);
  });
  withBank(questions, ledgerOf(2), (r) => {
    assert.equal(r.code, 1, "one more unsigned approval than the ceiling must fail the build");
    assert.match(r.output, /3 rows say "approved" with no human signature/);
    assert.match(r.output, /machine-checked/);
  });
});

test("the honest number is printed on every run, passing or failing", () => {
  withBank([question("q-1")], ledgerOf(1), (r) => {
    assert.match(r.output, /human-approved \(signed, hash matches\): 0 of 1/);
    assert.match(r.output, /"approved" with NO human signature: 1/);
  });
});

test("a signature moves a row from unsigned claim to human-approved", () => {
  const q = question("q-1");
  withBank([q], ledgerOf(1, [signature(q)]), (r) => {
    assert.equal(r.code, 0, r.output);
    assert.match(r.output, /human-approved \(signed, hash matches\): 1 of 1/);
    assert.match(r.output, /"approved" with NO human signature: 0/);
  });
});

test("editing a row after approval kills the signature — loudly", () => {
  // The exact defect class the audit found: 24 rows with a wrong answer key
  // sitting at `approved`. If someone corrects the key, the old review no
  // longer covers what a student will see, and the gate has to say so.
  const original = question("q-1");
  const edited = question("q-1", {
    options: [
      { id: "a", textBg: "Първи възможен отговор с достатъчна дължина q-1", correct: false },
      { id: "b", textBg: "Втори възможен отговор с достатъчна дължина q-1", correct: true },
    ],
  });
  withBank([edited], ledgerOf(1, [signature(original)]), (r) => {
    assert.equal(r.code, 1, "a stale signature must fail the build");
    assert.match(r.output, /no longer matches the question/);
    assert.match(r.output, /Антонио/);
  });
});

test("an explanation-only edit kills the signature too (THEO-4)", () => {
  // A right key with a wrong explanation still teaches the wrong thing, and
  // several of the audit's defects were explanation-only. So the explanation is
  // inside the hash, and rewriting it sends the row back through review.
  const original = question("q-1");
  const edited = question("q-1", {
    explanationBg: "Съвсем ново обяснение, което никой рецензент не е виждал в този вид.",
  });
  withBank([edited], ledgerOf(1, [signature(original)]), (r) => {
    assert.equal(r.code, 1);
    assert.match(r.output, /no longer matches the question/);
  });
});

test("a signature for a question that does not exist is refused", () => {
  const q = question("q-1");
  withBank([q], ledgerOf(1, [signature(q, { questionId: "q-ghost" })]), (r) => {
    assert.equal(r.code, 1);
    assert.match(r.output, /not a question in this bank/);
  });
});

test("an anonymous or undated signature is not a signature", () => {
  const q = question("q-1");
  withBank([q], ledgerOf(1, [signature(q, { by: "" })]), (r) => {
    assert.equal(r.code, 1);
    assert.match(r.output, /must name the human who signed it/);
  });
  withBank([q], ledgerOf(1, [signature(q, { at: "някога" })]), (r) => {
    assert.equal(r.code, 1);
    assert.match(r.output, /ISO-8601/);
  });
  withBank([q], ledgerOf(1, [signature(q, { contentHash: "trust-me" })]), (r) => {
    assert.equal(r.code, 1);
    assert.match(r.output, /sha256/);
  });
});

test("a row a human REJECTED may not sit at the authoritative status", () => {
  const q = question("q-1");
  withBank([q], ledgerOf(1, [signature(q, { verdict: "rejected" })]), (r) => {
    assert.equal(r.code, 1);
    assert.match(r.output, /rejected it on/);
  });
});

test("two signatures for one question are refused — the ledger holds one decision", () => {
  const q = question("q-1");
  withBank([q], ledgerOf(1, [signature(q), signature(q, { by: "Някой друг" })]), (r) => {
    assert.equal(r.code, 1);
    assert.match(r.output, /duplicate signature/);
  });
});

test("a bank cannot claim approvals with no ledger at all", () => {
  withBank([question("q-1")], null, (r) => {
    assert.equal(r.code, 1, "deleting the ledger must not delete the rule");
    assert.match(r.output, /missing/);
  });
});

test("`machine-checked` is a valid status and is never counted as approved", () => {
  const rows = [
    question("q-1", { status: "machine-checked" }),
    question("q-2", { status: "machine-checked" }),
  ];
  withBank(rows, ledgerOf(0), (r) => {
    assert.equal(r.code, 0, `machine-checked must be a legal status:\n${r.output}`);
    assert.match(r.output, /human-approved \(signed, hash matches\): 0 of 2/);
    assert.match(r.output, /"approved" with NO human signature: 0/);
  });
});
