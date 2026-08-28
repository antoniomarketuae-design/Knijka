// Run: node --test tools/audit/legend-coverage.test.mjs
//
// EVERY TAG THE CLASSIFIER CAN EMIT MUST HAVE A LEGEND ENTRY IN THE JUDGE PROMPT.
//
// WHY THIS TEST EXISTS. `make-verdicts2.mjs` tells every judge, in its own
// words: «A leg in [SQUARE BRACKETS] did not reach a verdict card, and the
// bracket says why.» That sentence is a promise, and on 2026-08-28 it was
// broken: `verdict-surface.mjs` gained two states — `never-started` and
// `not-performable` — `classifyLeg` began stamping their tags onto real judge
// prompts the same day, and the hand-written legend was not extended. A judge
// was handed `[THIS HARNESS CANNOT DRIVE THIS LESSON]` with no entry to look up.
//
// THE COST IS NOT COSMETIC, AND IT FAILS IN THE REASSURING DIRECTION. An
// unexplained bracket reads as a minor caveat rather than as «there is no
// lesson in this folder». The `not-performable` entry in particular carries a
// DO-NOT-RE-DRIVE instruction — sc-vp-stall starts in N with a manual box and
// the harness has no clutch key, so re-driving returns the same silence
// forever. Losing that sentence costs a whole sweep of drives that cannot work.
//
// The two maps live in different files and must agree; nothing compared them.
// That is the same shape as the bug this repo already paid for once, where
// `wave-c-merge.mjs` kept its own copy of the state descriptions and printed
// `undefined` for the two new ones.
//
// THE MATCH DE-WRAPS FIRST, deliberately. The legend is an array of ~78-column
// strings and a tag can be split across two entries — «[LEDGER DISAGREES WITH» /
// «THE ROW]». A naive `includes()` reported that one MISSING when it is present
// and correct, which is a false alarm in the other direction and would have got
// this test disabled within a week.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE = path.join(HERE, "make-verdicts2.mjs");

const vs = await import("./verdict-surface.mjs");

/** Every tag any classifier in verdict-surface can stamp onto a leg. */
function emittedTags() {
  const tags = new Set();
  for (const v of Object.values(vs.LEG_STATES ?? {})) if (v?.tag) tags.add(v.tag);
  for (const v of Object.values(vs.DRIVE_CLASSES ?? {})) if (v?.tag) tags.add(v.tag);
  return [...tags];
}

/** The prompt source with its string-array wrapping flattened, so a tag split
 *  across two lines still matches. Whitespace is collapsed on both sides. */
function flatPrompt() {
  return fs
    .readFileSync(PROMPT_FILE, "utf8")
    .replace(/",\s*\n\s*"/g, " ")
    .replace(/\s+/g, " ");
}

test("every tag the classifier emits has a legend entry in the judge prompt", () => {
  const flat = flatPrompt();
  const missing = emittedTags().filter((t) => !flat.includes(t.replace(/\s+/g, " ")));
  assert.deepEqual(
    missing,
    [],
    "These tags reach a judge with no legend entry, so the prompt's own promise " +
      "(«the bracket says why») is false for them:\n  " +
      missing.map((t) => "[" + t + "]").join("\n  ") +
      "\nAdd an entry to the '-- WHAT THE BRACKET AFTER A LEG MEANS --' block in " +
      "tools/audit/make-verdicts2.mjs. Say what the judge should DO, not just what " +
      "happened — the entries that earn their place are the ones that end in an " +
      "instruction («judge nothing from it», «do not ask for a re-drive»).",
  );
});

test("there is something to check — the tag set is not silently empty", () => {
  // A refactor that renames `tag` to something else would make the test above
  // pass over an empty list, which is the green-by-absence failure this repo
  // has already met once (three tools/mobile test files globbed by nobody).
  const tags = emittedTags();
  assert.ok(
    tags.length >= 10,
    "verdict-surface.mjs exposes only " + tags.length + " tags. It carried 12 when " +
      "this test was written; a sharp drop means the field was renamed and the " +
      "coverage check above is now passing over nothing.",
  );
});

test("the legend still makes the promise this test enforces", () => {
  // If that sentence is ever removed, the whole premise changes and this test
  // should be re-argued rather than silently kept.
  const flat = flatPrompt();
  assert.ok(
    flat.includes("the bracket says why"),
    "make-verdicts2.mjs no longer promises judges that the bracket explains itself. " +
      "Re-read this test's header before deleting it: the promise is what makes " +
      "an unexplained tag a defect rather than a style choice.",
  );
});
