/**
 * Tests for the THEO-5 mechanical draft verifier.
 * Run: node --test tools/theory/verify_drafts.test.mjs
 *
 * Pure-function units on synthetic fixtures + live invariants over the real
 * /content bank (invariants only — counts change as the founder approves).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLawBank,
  checkQuestion,
  findDuplicatePairs,
  isRefAnchored,
  isUncertainRef,
  jaccard,
  normText,
  runVerification,
  tokenSet,
} from "./verify_drafts.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONCEPTS = [
  { id: "c-one", lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }] },
  { id: "c-two", lawRefs: [{ act: "ЗДвП", ref: "чл. 50, ал. 2" }] },
];
const SIGNS = [{ id: "sign-b2", lawRefs: [{ act: "Наредба", ref: "чл. 5" }] }];
const CTX = { lawBank: buildLawBank(CONCEPTS, SIGNS), conceptIds: new Set(["c-one", "c-two"]) };

const GOOD_EXPLANATION =
  "Пропускаш пешеходеца, защото чл. 119 изисква водачът да пропусне пешеходците на пътеката.";

function makeQuestion(overrides = {}) {
  return {
    id: "q-test-001",
    conceptIds: ["c-one"],
    type: "single",
    points: 2,
    textBg: "Кога си длъжен да пропуснеш пешеходец на пътека тип зебра?",
    options: [
      { id: "a", textBg: "Само през деня при добра видимост", correct: false },
      { id: "b", textBg: "Винаги, когато е стъпил на пътеката", correct: true },
      { id: "c", textBg: "Само ако има пътен знак за пътека", correct: false },
    ],
    explanationBg: GOOD_EXPLANATION,
    lawRefs: [{ act: "ЗДвП", ref: "чл. 47" }],
    media: null,
    status: "draft",
    ...overrides,
  };
}

const codes = (result) => result.issues.map((i) => i.code);

// ---------------------------------------------------------------------------
// normalization + similarity
// ---------------------------------------------------------------------------

test("normText strips case, punctuation and whitespace runs", () => {
  assert.equal(normText('Кога   „спираш“, водачът?!'), "кога спираш водачът");
});

test("jaccard: identical sets 1, disjoint 0", () => {
  const a = tokenSet("кога спираш пред пътека");
  assert.equal(jaccard(a, tokenSet("кога спираш пред пътека")), 1);
  assert.equal(jaccard(a, tokenSet("червен сигнал светофар")), 0);
});

// ---------------------------------------------------------------------------
// law-ref anchoring
// ---------------------------------------------------------------------------

test("isRefAnchored: exact, boundary prefix both ways, '?' stripped, dead", () => {
  assert.equal(isRefAnchored(CTX.lawBank, "ЗДвП", "чл. 47"), true);
  // question shorter than bank ref
  assert.equal(isRefAnchored(CTX.lawBank, "ЗДвП", "чл. 50"), true);
  // question longer than bank ref
  assert.equal(isRefAnchored(CTX.lawBank, "ЗДвП", "чл. 47, ал. 3"), true);
  // '?' suffix stripped before lookup
  assert.equal(isRefAnchored(CTX.lawBank, "ЗДвП", "чл. 47?"), true);
  // no digit-boundary false positive: чл. 4 must not anchor to чл. 47
  assert.equal(isRefAnchored(CTX.lawBank, "ЗДвП", "чл. 4"), false);
  // wrong act
  assert.equal(isRefAnchored(CTX.lawBank, "НК", "чл. 47"), false);
  assert.equal(isRefAnchored(CTX.lawBank, "ЗДвП", "чл. 999"), false);
});

test("isUncertainRef detects the '?' suffix", () => {
  assert.equal(isUncertainRef("чл. 68?"), true);
  assert.equal(isUncertainRef("чл. 68"), false);
});

// ---------------------------------------------------------------------------
// per-question checks
// ---------------------------------------------------------------------------

test("clean question produces no issues", () => {
  const r = checkQuestion(makeQuestion(), CTX);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.info, []);
});

test("dead law ref flagged", () => {
  const q = makeQuestion({ lawRefs: [{ act: "ЗДвП", ref: "чл. 999" }] });
  assert.ok(codes(checkQuestion(q, CTX)).includes("dead-law-ref"));
});

test("'?' ref on a draft flagged as uncertain-law-ref", () => {
  const q = makeQuestion({ lawRefs: [{ act: "ЗДвП", ref: "чл. 47?" }] });
  const found = codes(checkQuestion(q, CTX));
  assert.ok(found.includes("uncertain-law-ref"));
  assert.ok(!found.includes("dead-law-ref"), "anchored '?' ref is not dead");
});

test("unresolved concept flagged", () => {
  const q = makeQuestion({ conceptIds: ["c-ghost"] });
  assert.ok(codes(checkQuestion(q, CTX)).includes("concept-unresolved"));
});

test("structural: single with 2 correct options flagged", () => {
  const q = makeQuestion({
    options: [
      { id: "a", textBg: "Първи верен отговор тук", correct: true },
      { id: "b", textBg: "Втори верен отговор тук", correct: true },
      { id: "c", textBg: "Грешен отговор за баланс", correct: false },
    ],
  });
  assert.ok(codes(checkQuestion(q, CTX)).includes("structural"));
});

test("duplicate option text flagged", () => {
  const q = makeQuestion({
    options: [
      { id: "a", textBg: "Винаги спираш напълно.", correct: true },
      { id: "b", textBg: "винаги  спираш напълно", correct: false },
      { id: "c", textBg: "Продължаваш без спиране", correct: false },
    ],
  });
  assert.ok(codes(checkQuestion(q, CTX)).includes("option-dup-text"));
});

test("strong correct-length tell flagged; mild goes to info", () => {
  const strong = makeQuestion({
    options: [
      { id: "a", textBg: "Не.", correct: false },
      { id: "b", textBg: "Да, винаги — водачът е длъжен да спре и да пропусне пешеходците, които са на пътеката или стъпват на нея.", correct: true },
      { id: "c", textBg: "Само нощем.", correct: false },
    ],
  });
  assert.ok(codes(checkQuestion(strong, CTX)).includes("correct-length-tell"));

  // 41/80/41 chars → ratio 1.95, delta 39: inside the mild band, below strong.
  const mild = makeQuestion({
    options: [
      { id: "a", textBg: "Само при изричен пътен знак и маркировка.", correct: false },
      { id: "b", textBg: "Винаги, когато пешеходец е стъпил на пътеката и водачът е длъжен да го пропусне.", correct: true },
      { id: "c", textBg: "Само в населено място през светлата част.", correct: false },
    ],
  });
  const r = checkQuestion(mild, CTX);
  assert.ok(!r.issues.some((i) => i.code === "correct-length-tell"));
  assert.ok(r.info.some((i) => i.code === "mild-length-tell"));
});

test("trivial explanation flagged: too short / repeats question / repeats key", () => {
  const short = makeQuestion({ explanationBg: "Защото е така." });
  assert.ok(codes(checkQuestion(short, CTX)).includes("trivial-explanation"));

  const parrot = makeQuestion({
    explanationBg: "Кога си длъжен да пропуснеш пешеходец на пътека тип зебра?",
  });
  assert.ok(codes(checkQuestion(parrot, CTX)).includes("trivial-explanation"));

  // correct option long enough to clear the min-length branch; the
  // explanation is the same text modulo case/punctuation → key echo.
  const keyEcho = makeQuestion({
    options: [
      { id: "a", textBg: "Само през деня при добра видимост", correct: false },
      {
        id: "b",
        textBg: "Винаги, когато пешеходецът е стъпил на пътеката или показва намерение да пресече.",
        correct: true,
      },
      { id: "c", textBg: "Само ако има пътен знак за пътека", correct: false },
    ],
    explanationBg: "ВИНАГИ когато пешеходецът е стъпил на пътеката, или показва намерение да пресече!",
  });
  assert.ok(codes(checkQuestion(keyEcho, CTX)).includes("trivial-explanation"));
});

test("[REVIEW: …] prefix is stripped before explanation checks", () => {
  const q = makeQuestion({ explanationBg: `[REVIEW: check чл.] ${GOOD_EXPLANATION}` });
  assert.ok(!codes(checkQuestion(q, CTX)).includes("trivial-explanation"));
});

// ---------------------------------------------------------------------------
// duplicate pairs
// ---------------------------------------------------------------------------

test("findDuplicatePairs: exact, near and distinct", () => {
  const qs = [
    { id: "q-a", status: "draft", textBg: "Кога отстъпваш предимство на пешеходец на пътека зебра в града?" },
    { id: "q-b", status: "draft", textBg: "Кога отстъпваш предимство, на пешеходец на пътека — зебра в града!" },
    { id: "q-c", status: "approved", textBg: "Кога отстъпваш предимство на пешеходец на пътека зебра извън града?" },
    { id: "q-d", status: "draft", textBg: "Каква е максималната разрешена скорост на магистрала?" },
  ];
  const pairs = findDuplicatePairs(qs);
  const key = (p) => `${p.aId}|${p.bId}`;
  const exact = pairs.find((p) => p.exact);
  assert.ok(exact && key(exact) === "q-a|q-b", "punctuation-only variant is an exact duplicate");
  assert.ok(pairs.some((p) => !p.exact && (key(p) === "q-a|q-c" || key(p) === "q-b|q-c")), "near pair found");
  assert.ok(!pairs.some((p) => p.aId === "q-d" || p.bId === "q-d"), "distinct question not paired");
});

// ---------------------------------------------------------------------------
// live-bank invariants (do not pin counts — they change as the founder works)
// ---------------------------------------------------------------------------

test("live run: totals are consistent and flags target drafts only", () => {
  const result = runVerification();
  const t = result.totals;
  assert.equal(t.clean + t.flagged, t.draft, "every draft is exactly clean or flagged");
  // Not `t.draft > 0`: the queue legitimately empties as the founder approves,
  // and it now has. What must always hold is that the bank is non-empty.
  assert.ok(t.draft + t["needs-review"] + t.approved > 0, "the bank has questions");

  const statusById = new Map();
  for (const topic of result.topics) {
    for (const q of [...topic.clean, ...topic.flagged]) statusById.set(q.id, "draft");
  }
  for (const id of result.flaggedIds) {
    assert.equal(statusById.get(id), "draft", `flagged id ${id} must be a draft`);
  }
  for (const p of result.duplicates) {
    assert.ok(p.similarity >= 0.72 || p.exact);
    assert.notEqual(p.aId, p.bId);
  }
});
