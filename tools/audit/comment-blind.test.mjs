// -----------------------------------------------------------------------------
// comment-blind.test.mjs — AN ESSAY IN A SOURCE FILE IS NOT A REPAIR.
//
//   node --test tools/audit/comment-blind.test.mjs
//
// WHAT THIS DEFENDS. `reclosure.mjs` refuses to re-close a row a verifier opened
// when the row's own file did not change between the two builds. It asks git,
// and git counts a comment as a change — so a lane that writes prose into
// `cabin.ts` buys a false certificate for every row addressed there. Repair wave
// 14 produced exactly that: eight files, 495 added lines, zero code.
//
// THE TWO DIRECTIONS ARE NOT SYMMETRIC, and the tests below pin both:
//   - a false "comment-only" HIDES a real repair and keeps a fixed row open;
//   - a false "real code" merely restores the old, looser behaviour.
// So the strip is deliberately dumb: anything it cannot classify stays code.
//
// §2 is the trap that actually bit. A line regex was written first and it ate
// half of `templates-*.ts` — the student-facing Bulgarian copy is full of `//`
// in URLs and `км/ч` in speeds.
// -----------------------------------------------------------------------------
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripComments, commentOnlyChange } from "./comment-blind.mjs";

// § 1 — comments come out
test("removes line and block comments", () => {
  assert.equal(
    stripComments("const a = 1; // trailing\n/* block\n   more */\nconst b = 2;"),
    "const a = 1;\nconst b = 2;",
  );
});

test("drops blank lines and indentation — formatting is not a repair either", () => {
  assert.equal(stripComments("  const a = 1;\n\n\n\tconst b = 2;\n"), "const a = 1;\nconst b = 2;");
});

// § 2 — strings are the trap
test("KEEPS a // inside a string (the case that broke the line-regex version)", () => {
  assert.equal(stripComments('const u = "https://example.com/x"; // real'), 'const u = "https://example.com/x";');
});

test("keeps slashes in single quotes, templates and Bulgarian copy", () => {
  const src = [
    "const a = 'a//b';",
    "const t = `line // not a comment ${x} /* nor this */`;",
    'const bg = "ограничението е 140 км/ч — виж чл. 21 ал. 1/2";',
  ].join("\n");
  assert.equal(stripComments(src), src);
});

test("keeps an escaped quote inside a string", () => {
  const src = 'const s = "he said \\"//\\" loudly";';
  assert.equal(stripComments(src), src);
});

// § 3 — division vs regex
test("does not mistake division for a regex", () => {
  assert.equal(stripComments("const r = (a + b) / c; // note\nconst q = x/y;"), "const r = (a + b) / c;\nconst q = x/y;");
});

test("keeps a regex literal containing a slash or a star", () => {
  const src = "const re = /https:\/\/[a-z]+/; const re2 = /a*b/;";
  assert.equal(stripComments(src), src);
});

// § 4 — the verdict the gate consumes
test("comment-only: prose added, code untouched — wave 14's eight files", () => {
  assert.equal(commentOnlyChange("export const X = 1;\n", "// essay\n// more\nexport const X = 1;\n"), true);
});

test("NOT comment-only when one executable character moved", () => {
  assert.equal(commentOnlyChange("export const X = 1;\n", "// essay\nexport const X = 2;\n"), false);
});

test("NOT comment-only when copy a student reads changes, even by punctuation", () => {
  assert.equal(
    commentOnlyChange(
      'const t = "ограничението е 140 км/ч, а двете посоки";',
      'const t = "ограничението е 140 км/ч. Двете посоки";',
    ),
    false,
  );
});

test("a pure reformat is comment-only", () => {
  assert.equal(commentOnlyChange("const a = 1;\nconst b = 2;", "  const a = 1;\n\n  const b = 2;\n"), true);
});
