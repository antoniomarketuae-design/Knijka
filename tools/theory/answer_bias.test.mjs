/**
 * Tests for the answer-leak guard (audit H-1 length tell / H-2 position bias).
 * Run: node --test tools/theory/answer_bias.test.mjs
 *
 * Everything here runs on SYNTHETIC banks, never on /content — the point of
 * the guard is to survive the content changing under it, so a test that reads
 * the live bank would only tell us what today's bank looks like. The fixtures
 * reproduce the two defects at the exact magnitudes the audit measured, so a
 * regression of either one fails these tests.
 *
 * The last test spawns the real CI validator against a fixture bank: without
 * the gate wired into platform/scripts/validate-content.mjs it exits 0 on a
 * bank that answers (a) every single time, which is what shipped twice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALPHA_BLOCK,
  ALPHA_WARN,
  MIN_N_FOR_GATE,
  POOLED_SCOPE,
  analyzeAnswerBias,
  chiSquare,
  chiSquareCritical,
  lengthTell,
  positionBias,
  tallyPositions,
} from "./answer_bias.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Fixture bank builder
// ---------------------------------------------------------------------------

/** Distinct option text of an EXACT character length — length control is the
 *  whole point, and identical texts would trip unrelated checks. */
const textOfLength = (slot, n) => {
  const head = `Отговор ${String.fromCharCode(97 + slot)}: `;
  return head + "о".repeat(Math.max(1, n - head.length));
};

const PARITY_LEN = 40; // every ordinary option
const LONG_LEN = 90; // the designated "gives itself away" option

/**
 * One synthetic question with full control over the two things under test:
 * which slot is correct, and which slot is the longest.
 *
 * `longestIndex: null` gives every option the same length — no unique longest
 * anywhere, which is the length-parity target the audit's fix (c) asks for.
 */
function makeQ(id, {
  correctIndex = 0,
  longestIndex = null,
  nOptions = 4,
  type = "single",
  incorrectIndexes = null,
} = {}) {
  const correctSet = new Set(
    type === "single" ? [correctIndex] : allBut(nOptions, incorrectIndexes ?? [nOptions - 1]),
  );
  return {
    id,
    conceptIds: ["c-fix"],
    type,
    points: 2,
    textBg: `Фиктивен въпрос ${id} за проверка на изтичане на отговора?`,
    options: Array.from({ length: nOptions }, (_, i) => ({
      id: String.fromCharCode(97 + i),
      textBg: textOfLength(i, longestIndex === i ? LONG_LEN : PARITY_LEN),
      correct: correctSet.has(i),
    })),
    explanationBg:
      "Обяснението е достатъчно дълго, за да мине проверката за тривиално обяснение в верификатора.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 1" }],
    media: null,
    status: "approved",
  };
}

const allBut = (n, excluded) =>
  Array.from({ length: n }, (_, i) => i).filter((i) => !excluded.includes(i));

/** n questions whose correct slot cycles 0,1,2,3 — a healthy shuffle. */
function cleanFile(n, opts = {}) {
  return Array.from({ length: n }, (_, i) =>
    makeQ(`q-clean-${i}`, { correctIndex: i % 4, ...opts }),
  );
}

const findingFor = (result, scope, kind) =>
  result.findings.find((f) => f.scope === scope && (f.kind === kind || f.code === kind));

// ---------------------------------------------------------------------------
// Statistics primitives
// ---------------------------------------------------------------------------

test("chiSquare: perfect fit is 0, empty expected cells are skipped", () => {
  assert.equal(chiSquare([10, 10, 10, 10], [10, 10, 10, 10]), 0);
  assert.equal(chiSquare([4, 0], [2, 0]), 2); // (4-2)^2/2, second cell ignored
});

test("chiSquareCritical: tabulated values, and a sane fallback past the table", () => {
  assert.equal(chiSquareCritical(3, 0.001), 16.266);
  assert.equal(chiSquareCritical(3, 0.01), 11.345);
  // Wilson-Hilferty past df 9: within a few percent of the true 32.909.
  const df12 = chiSquareCritical(12, 0.001);
  assert.ok(Math.abs(df12 - 32.909) / 32.909 < 0.05, `df=12 critical ${df12} off by >5%`);
  assert.ok(chiSquareCritical(12, 0.001) > chiSquareCritical(12, 0.01), "0.001 is the stricter bar");
});

// ---------------------------------------------------------------------------
// Position bias — H-2
// ---------------------------------------------------------------------------

const SINGLE_POP = {
  kind: "single-correct",
  labelBg: "x",
  index: (q) => (q.type === "single" ? q.options.findIndex((o) => o.correct === true) : -1),
};

test("tallyPositions builds the expectation per question, not as n/4", () => {
  // A 3-option question can never answer (d); a flat n/4 would invent a
  // deficit there and fail honest content.
  const { observed, expected, n } = tallyPositions(
    [makeQ("q1", { nOptions: 3, correctIndex: 0 }), makeQ("q2", { nOptions: 4, correctIndex: 3 })],
    SINGLE_POP,
  );
  assert.equal(n, 2);
  assert.deepEqual(observed, [1, 0, 0, 1]);
  assert.deepEqual(
    expected.map((e) => Number(e.toFixed(4))),
    [0.5833, 0.5833, 0.5833, 0.25],
  );
});

test("a clean shuffle of mixed 3- and 4-option questions does not flag", () => {
  const questions = Array.from({ length: 48 }, (_, i) =>
    i % 3 === 0
      ? makeQ(`q-${i}`, { nOptions: 3, correctIndex: Math.floor(i / 3) % 3 })
      : makeQ(`q-${i}`, { nOptions: 4, correctIndex: i % 4 }),
  );
  assert.equal(positionBias(questions, SINGLE_POP).severity, "ok");
});

test("BLOCKS the exact defect that shipped twice: 37/37 correct at (a)", () => {
  // content/audits/predimstvo.audit.json, then again in
  // eko-i-zashtitno-shofirane.audit.json — hand-fixed, regenerated, hand-fixed.
  const questions = Array.from({ length: 37 }, (_, i) => makeQ(`q-${i}`, { correctIndex: 0 }));
  const finding = positionBias(questions, SINGLE_POP);
  assert.equal(finding.severity, "block");
  assert.equal(finding.topSlot, "a");
  assert.equal(finding.topSharePct, 100);
  assert.ok(finding.chiSquare > finding.blockAt);
});

test("BLOCKS the mildest historical regression too: 72% at (a) over 39 questions", () => {
  // alkohol-i-godnost.json as the audit measured it — the weakest real case,
  // so this pins that the alpha=0.001 bar is not set above the actual defect.
  const questions = Array.from({ length: 39 }, (_, i) =>
    makeQ(`q-${i}`, { correctIndex: i < 28 ? 0 : 1 + (i % 3) }),
  );
  assert.equal(positionBias(questions, SINGLE_POP).severity, "block");
});

test("warn tier fires before the block tier, on the same slice of drift", () => {
  // 40 questions, 20 at (a) (50%) — visible drift, not yet damning.
  const questions = Array.from({ length: 40 }, (_, i) =>
    makeQ(`q-${i}`, { correctIndex: i < 20 ? 0 : 1 + (i % 3) }),
  );
  const finding = positionBias(questions, SINGLE_POP);
  assert.equal(finding.severity, "warn");
  assert.ok(finding.chiSquare >= finding.warnAt && finding.chiSquare < finding.blockAt);
});

test("a file below the gate size warns but never blocks", () => {
  // 8 questions, all at (a). Chi-square is untrustworthy at that size (the
  // expected count per slot is 2, not the 5 the statistic needs), so it must
  // not redden CI — but staying silent about 8/8 would be worse.
  const questions = Array.from({ length: 8 }, (_, i) => makeQ(`q-${i}`, { correctIndex: 0 }));
  const finding = positionBias(questions, SINGLE_POP);
  assert.ok(questions.length < MIN_N_FOR_GATE);
  assert.equal(finding.gated, false);
  assert.equal(finding.severity, "warn");
});

test("multi questions: the lone WRONG option is tested, several wrong ones are not", () => {
  // 4-option/3-correct multis had their single distractor at (d) 53.8% of the
  // time — "tick everything but the last" was a complete answering strategy.
  const leaky = Array.from({ length: 30 }, (_, i) =>
    makeQ(`q-${i}`, { type: "multi", incorrectIndexes: [3] }),
  );
  const result = analyzeAnswerBias([["leaky", leaky]]);
  const finding = findingFor(result, "leaky", "multi-lone-distractor");
  assert.equal(finding.severity, "block");
  assert.equal(finding.topSlot, "d");

  // Two distractors: no single slot is "the odd one out", so the population is
  // empty and the check has nothing to say.
  const twoWrong = Array.from({ length: 30 }, (_, i) =>
    makeQ(`q-${i}`, { type: "multi", incorrectIndexes: [2, 3] }),
  );
  const other = findingFor(analyzeAnswerBias([["m", twoWrong]]), "m", "multi-lone-distractor");
  assert.equal(other.n, 0);
  assert.equal(other.severity, "ok");
});

test("pooled bank catches a drift that is invisible in every single file", () => {
  // 16 files x 24 questions, each 42% at (a): far below any per-file bar, and
  // exactly the shape the bank had bank-wide (45.6% at (a) against 25%).
  const mild = () =>
    Array.from({ length: 24 }, (_, i) => makeQ(`q-${i}`, { correctIndex: i < 10 ? 0 : 1 + (i % 3) }));
  const files = Array.from({ length: 16 }, (_, f) => [`topic-${f}`, mild()]);
  const result = analyzeAnswerBias(files);

  for (const f of result.blocking) {
    assert.equal(f.scope, POOLED_SCOPE, `per-file ${f.scope} must not block on drift this mild`);
  }
  assert.ok(
    result.blocking.some((f) => f.scope === POOLED_SCOPE && f.code === "position-bias"),
    "the pooled bank must block",
  );
});

// ---------------------------------------------------------------------------
// Length tell — H-1
// ---------------------------------------------------------------------------

test("length parity across every option produces no signal at all", () => {
  const finding = lengthTell(cleanFile(40)); // longestIndex null → all equal
  assert.equal(finding.n, 40);
  assert.equal(finding.observed, 0);
  assert.equal(finding.expected, 0, "no question has a unique longest option");
  assert.equal(finding.severity, "ok");
});

test("a longest option that lands independently of the key does not flag", () => {
  // correct cycles 0-3; longest cycles 0-3 on a slower clock, so they coincide
  // at chance (12 of 40) instead of by construction.
  const questions = Array.from({ length: 40 }, (_, i) =>
    makeQ(`q-${i}`, { correctIndex: i % 4, longestIndex: (i + Math.floor(i / 4)) % 4 }),
  );
  const finding = lengthTell(questions);
  assert.equal(finding.severity, "ok");
  assert.ok(Math.abs(finding.z) < 2, `z=${finding.z} should sit inside chance`);
});

test("BLOCKS the audited magnitude: correct is the longest 76% of the time", () => {
  const questions = Array.from({ length: 50 }, (_, i) => {
    const correctIndex = i % 4;
    // 38 of 50 = 76%, the audit's unique-longest figure for the 698 singles.
    return makeQ(`q-${i}`, { correctIndex, longestIndex: i < 38 ? correctIndex : (correctIndex + 1) % 4 });
  });
  const finding = lengthTell(questions);
  assert.equal(finding.severity, "block");
  assert.ok(finding.sharePct > 75 && finding.sharePct < 77);
  assert.ok(finding.expectedSharePct > 24 && finding.expectedSharePct < 26);
});

test("a TIE for longest is not a leak — the student still has to guess", () => {
  // Correct option shares the maximum length with a distractor in every
  // question. Counting these as hits (the audit's 81.4% figure) would
  // overstate the leak; only the deterministic edge is measured.
  const questions = Array.from({ length: 40 }, (_, i) => {
    const q = makeQ(`q-${i}`, { correctIndex: 0, longestIndex: 0 });
    q.options[1].textBg = q.options[0].textBg; // exact tie at the maximum
    return q;
  });
  const finding = lengthTell(questions);
  assert.equal(finding.observed, 0);
  assert.equal(finding.ties, 40);
  assert.equal(finding.severity, "ok");
});

test("multi questions are out of scope for the length tell", () => {
  const questions = Array.from({ length: 40 }, (_, i) =>
    makeQ(`q-${i}`, { type: "multi", incorrectIndexes: [3], longestIndex: 0 }),
  );
  assert.equal(lengthTell(questions).n, 0);
});

// ---------------------------------------------------------------------------
// The sweep as both validators consume it
// ---------------------------------------------------------------------------

test("analyzeAnswerBias reports every scope, healthy ones included", () => {
  const result = analyzeAnswerBias([["a", cleanFile(40)], ["b", cleanFile(40)]]);
  const scopes = new Set(result.findings.map((f) => f.scope));
  assert.deepEqual([...scopes].sort(), ["__bank__", "a", "b"]);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.warnings.length, 0);
  // 3 statistics per scope: two positions + one length.
  assert.equal(result.findings.length, 9);
});

test("thresholds are the documented ones (changing them is a deliberate act)", () => {
  assert.equal(ALPHA_BLOCK, 0.001);
  assert.equal(ALPHA_WARN, 0.01);
  assert.equal(MIN_N_FOR_GATE, 20);
});

// ---------------------------------------------------------------------------
// The gate as CI actually runs it
// ---------------------------------------------------------------------------

/**
 * Minimal but fully valid content tree, so only the bias gate can fail it.
 *
 * That now includes a `review/approvals.json`: since docs/education/90 §1 a row
 * may not sit at `"status": "approved"` unless a ledger accounts for it, and
 * these fixtures are built out of approved rows. The baseline is set to the
 * fixture's own size so the approval ratchet is satisfied and cannot mask (or
 * be masked by) the answer-leak finding under test.
 */
function writeFixtureBank(dir, questions) {
  fs.mkdirSync(path.join(dir, "questions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "signs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "review"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "review", "approvals.json"),
    JSON.stringify(
      {
        version: 1,
        readmeBg: "Фикстура за тестовете на гарда.",
        unsignedApprovedBaseline: questions.length,
        baselineFrozenAt: "2026-08-03",
        entries: [],
      },
      null,
      2,
    ),
    "utf8",
  );
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
}

function runValidator(contentDir) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, "platform", "scripts", "validate-content.mjs")],
      { env: { ...process.env, CONTENT_DIR: contentDir }, encoding: "utf8", stdio: "pipe" },
    );
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("validate-content.mjs exits 1 on a position-biased bank and 0 on a clean one", () => {
  // os.tmpdir, not the repo: this test writes a whole content tree and the
  // point is that the validator reads it from disk exactly as CI does.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "answer-bias-"));
  try {
    writeFixtureBank(dir, cleanFile(40));
    const clean = runValidator(dir);
    assert.equal(clean.code, 0, `clean bank should pass:\n${clean.output}`);
    assert.match(clean.output, /answer-leak sweep/, "the sweep must announce that it ran");

    writeFixtureBank(dir, Array.from({ length: 40 }, (_, i) => makeQ(`q-${i}`, { correctIndex: 0 })));
    const biased = runValidator(dir);
    assert.equal(biased.code, 1, "a bank that answers (a) 40/40 must fail the build");
    assert.match(biased.output, /questions\/fixture\.json/);
    assert.match(biased.output, /позиционен превес/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validate-content.mjs exits 1 on a length-tell bank", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "answer-bias-"));
  try {
    writeFixtureBank(
      dir,
      Array.from({ length: 40 }, (_, i) => makeQ(`q-${i}`, { correctIndex: i % 4, longestIndex: i % 4 })),
    );
    const result = runValidator(dir);
    assert.equal(result.code, 1, "correct option always the longest must fail the build");
    assert.match(result.output, /дължината издава отговора/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
