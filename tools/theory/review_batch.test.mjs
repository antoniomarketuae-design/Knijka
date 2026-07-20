/**
 * Tests for the review_batch text surgery + parse-back verification.
 * Run: node --test tools/theory/review_batch.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { flipStatusInText, questionSpan, verifyFlip } from "./review_batch.mjs";

/** Synthetic questions file in the on-disk house style. */
const FILE = `[
  {
    "id": "q-demo-001",
    "conceptIds": ["c-one"],
    "type": "single",
    "points": 1,
    "textBg": "Първи въпрос с \\"кавички\\" и status: draft в текста?",
    "options": [
      { "id": "a", "textBg": "Отговор draft", "correct": false },
      { "id": "b", "textBg": "Верен отговор", "correct": true }
    ],
    "explanationBg": "Обяснение едно.",
    "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 5" }],
    "media": null,
    "status": "draft"
  },
  {
    "id": "q-demo-002",
    "conceptIds": ["c-two"],
    "type": "single",
    "points": 2,
    "textBg": "Втори въпрос?",
    "options": [
      { "id": "a", "textBg": "Не", "correct": false },
      { "id": "b", "textBg": "Да", "correct": true }
    ],
    "explanationBg": "Обяснение две.",
    "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 6" }],
    "media": null,
    "status": "draft"
  },
  {
    "id": "q-demo-003",
    "conceptIds": ["c-two"],
    "type": "single",
    "points": 3,
    "textBg": "Трети въпрос?",
    "options": [
      { "id": "a", "textBg": "Не", "correct": true },
      { "id": "b", "textBg": "Да", "correct": false }
    ],
    "explanationBg": "Обяснение три.",
    "lawRefs": [{ "act": "ЗДвП", "ref": "чл. 7" }],
    "media": null,
    "status": "needs-review"
  }
]
`;

test("questionSpan finds each block; option ids never match", () => {
  const s1 = questionSpan(FILE, "q-demo-001");
  const s2 = questionSpan(FILE, "q-demo-002");
  assert.ok(s1 && s2 && s1.end <= s2.start + 1);
  assert.equal(questionSpan(FILE, "q-missing"), null);
});

test("flipStatusInText flips only the target question", () => {
  const after = flipStatusInText(FILE, "q-demo-001");
  const parsed = JSON.parse(after);
  assert.equal(parsed[0].status, "approved");
  assert.equal(parsed[1].status, "draft");
  assert.equal(parsed[2].status, "needs-review");
  // formatting preserved: only the flipped token differs
  assert.equal(
    after.replace('"status": "approved"', '"status": "draft"'),
    FILE,
  );
  // the "draft" WORD inside textBg/options is untouched
  assert.ok(after.includes("status: draft в текста"));
  assert.ok(after.includes('"textBg": "Отговор draft"'));
});

test("flipStatusInText refuses missing id and non-draft status", () => {
  assert.throws(() => flipStatusInText(FILE, "q-missing"), /not found/);
  assert.throws(() => flipStatusInText(FILE, "q-demo-003"), /no "status": "draft"/);
});

test("sequential flips of two ids verify cleanly", () => {
  let after = flipStatusInText(FILE, "q-demo-001");
  after = flipStatusInText(after, "q-demo-002");
  assert.equal(verifyFlip(FILE, after, ["q-demo-001", "q-demo-002"]), null);
});

test("verifyFlip catches unintended edits", () => {
  const after = flipStatusInText(FILE, "q-demo-001");
  // claim we flipped 002 as well — must fail
  assert.match(String(verifyFlip(FILE, after, ["q-demo-001", "q-demo-002"])), /changed beyond/);
  // sneaky extra edit beyond the status flip — must fail
  const tampered = after.replace("Обяснение две.", "Друго обяснение.");
  assert.match(String(verifyFlip(FILE, tampered, ["q-demo-001"])), /changed beyond/);
  // invalid JSON — must fail
  assert.match(String(verifyFlip(FILE, `${after}]`, ["q-demo-001"])), /not valid JSON/);
});
