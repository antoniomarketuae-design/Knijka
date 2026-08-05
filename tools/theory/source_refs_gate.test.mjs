/**
 * The `sourceRefs` gate, exercised through the real validator exactly as CI runs
 * it. Run: node --test tools/theory/source_refs_gate.test.mjs
 *
 * WHAT IS BEING GUARDED. `LawRefSchema` was the only citation shape a question
 * could carry and `lawRefs` was `min 1`, so every row was COMPELLED to name an
 * act — including the rows no act governs. Twenty-nine first-aid questions duly
 * cited ЗДвП чл. 123, the duty to stop and assist, under claims about
 * compression depth and tourniquets (docs/education/90 §12 item 8, §14 item N).
 *
 * The fix is not "make lawRefs optional". That would let a row ship with no
 * grounding at all, which is worse. The rule is: cite SOMETHING, and if it is
 * not a statute, cite a source that a machine can actually open. Each test below
 * is one way that could be faked or quietly weakened.
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

const SOURCE_ID = "src-fixture-guideline";

function question(id, over = {}) {
  return {
    id,
    conceptIds: ["c-fix"],
    type: "single",
    points: 2,
    textBg: `Фиктивен въпрос ${id} за проверка на извънправните източници?`,
    options: [
      { id: "a", textBg: `Първи възможен отговор с достатъчна дължина ${id}`, correct: true },
      { id: "b", textBg: `Втори възможен отговор с достатъчна дължина ${id}`, correct: false },
    ],
    explanationBg:
      "Обяснението е достатъчно дълго, за да мине проверката за тривиално обяснение в верификатора.",
    lawRefs: [{ act: "ЗДвП", ref: "чл. 1" }],
    media: null,
    status: "machine-checked",
    ...over,
  };
}

/** A minimal but valid tree, with a one-source non-statutory register. */
function writeBank(dir, questions, { withRegister = true } = {}) {
  for (const sub of ["questions", "signs", "review", "sources"]) {
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
  write("review/approvals.json", {
    version: 1,
    readmeBg: "Фикстура.",
    unsignedApprovedBaseline: 0,
    baselineFrozenAt: "2026-08-03",
    entries: [],
  });
  if (withRegister) {
    write("sources/sources.json", {
      version: 1,
      retrievedAt: "2026-08-04",
      sources: [
        {
          id: SOURCE_ID,
          kind: "clinical-guideline",
          authority: "current-consensus",
          titleBg: "Фиктивна насока",
          titleEn: null,
          publisherBg: "Фиктивен издател",
          editionBg: "издание 2026",
          url: "https://example.invalid/guideline.pdf",
          format: "pdf",
          httpStatus: 200,
          rawBytes: 1,
          rawSha256: "0".repeat(64),
          rawHashStable: true,
          textBytes: 1,
          textSha256: "0".repeat(64),
          extraction: "fixture",
          coversBg: "Само за тест.",
          supersedesId: null,
          noteBg: null,
        },
      ],
    });
  }
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

function withBank(questions, assertions, options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "source-refs-gate-"));
  try {
    writeBank(dir, questions, options);
    assertions(runValidator(dir), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a row grounded ONLY on a registered non-statutory source is valid", () => {
  const q = question("q-1", {
    lawRefs: [],
    sourceRefs: [{ sourceId: SOURCE_ID, ref: "Раздел „Компресии“", claimId: "fx-depth" }],
  });
  withBank([q], (r) => {
    assert.equal(r.code, 0, `no statute governs this row and that must be sayable:\n${r.output}`);
  });
});

test("a row with NO citation of any kind is still refused", () => {
  // The floor moved; it did not disappear. Dropping min-1 on lawRefs without
  // this rule would have traded a decorative citation for no citation at all.
  const q = question("q-1", { lawRefs: [], sourceRefs: [] });
  withBank([q], (r) => {
    assert.equal(r.code, 1, "a row citing nothing must fail the build");
    assert.match(r.output, /must cite at least one source/);
  });
});

test("a row with lawRefs and no sourceRefs is untouched — the old shape still validates", () => {
  withBank([question("q-1")], (r) => {
    assert.equal(r.code, 0, `every pre-existing row must keep validating:\n${r.output}`);
  });
});

test("a sourceId that resolves nowhere is an ERROR, not a shrug", () => {
  // This is the whole point. A citation nobody can open is the defect being
  // replaced, so `sourceRefs` must not become a second way to write one.
  const q = question("q-1", {
    sourceRefs: [{ sourceId: "src-not-registered", ref: "някъде" }],
  });
  withBank([q], (r) => {
    assert.equal(r.code, 1, "an unresolvable sourceId must fail the build");
    assert.match(r.output, /unknown sourceId "src-not-registered"/);
  });
});

test("a sourceRef is refused when no register exists at all", () => {
  const q = question("q-1", {
    sourceRefs: [{ sourceId: SOURCE_ID, ref: "Раздел „Компресии“" }],
  });
  withBank(
    [q],
    (r) => {
      assert.equal(r.code, 1, "without a register nothing can be resolved");
      assert.match(r.output, /unknown sourceId/);
    },
    { withRegister: false },
  );
});

test("sourceRefs shape is enforced: prefix, non-empty ref, kebab claimId, no stray keys", () => {
  const cases = [
    [{ sourceId: "erc-2025", ref: "x" }, /sourceId must be kebab-case with "src-" prefix/],
    [{ sourceId: SOURCE_ID, ref: "" }, /ref must be a non-empty string/],
    [{ sourceId: SOURCE_ID, ref: "x", claimId: "Not Kebab" }, /claimId must be kebab-case/],
    [{ sourceId: SOURCE_ID, ref: "x", quoteBg: "typed by hand" }, /unrecognized key "quoteBg"/],
  ];
  for (const [sourceRef, expected] of cases) {
    withBank([question("q-1", { sourceRefs: [sourceRef] })], (r) => {
      assert.equal(r.code, 1, `must reject ${JSON.stringify(sourceRef)}`);
      assert.match(r.output, expected);
    });
  }
});

test("the signed content hash covers sourceRefs — and ONLY for rows that have them", () => {
  // Two properties at once, and both matter. Swapping the grounding after a
  // signature must break it; and adding the field to the schema must NOT have
  // silently invalidated the 1,089 signatures-to-be over rows that never use it.
  const plain = question("q-1");
  assert.equal(
    hashQuestionContent(plain),
    hashQuestionContent({ ...plain, sourceRefs: [] }),
    "an empty sourceRefs must hash identically to no sourceRefs at all",
  );

  const grounded = { ...plain, sourceRefs: [{ sourceId: SOURCE_ID, ref: "Раздел А" }] };
  const regrounded = { ...plain, sourceRefs: [{ sourceId: SOURCE_ID, ref: "Раздел Б" }] };
  assert.notEqual(hashQuestionContent(plain), hashQuestionContent(grounded));
  assert.notEqual(hashQuestionContent(grounded), hashQuestionContent(regrounded));
});
