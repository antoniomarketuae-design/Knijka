/**
 * canary-pills.test.mjs — ONE LIST OF VERDICT PILLS, KEYED TO THE PRODUCT.
 *
 * Run: node --test tools/mobile/__tests__/canary-pills.test.mjs
 * (collected automatically by platform/scripts/tools-tests.mjs — it walks
 * tools/ and claims this file by its `node:test` import. `VITEST_INCLUDE` does
 * not glob tools/mobile/__tests__, so this file is owned by exactly one
 * runner.)
 *
 * ═══ WHY IT EXISTS ═════════════════════════════════════════════════════════
 *
 * ADR-009 (founder Ruling A) gave the product a FOURTH end-of-session pill,
 * «Не е взет»: committing the mistake a practice lesson exists to teach refuses
 * the lesson while the изпитен лист stays clean, so the card needed a word that
 * is neither «Издържан» nor «Неиздържан».
 *
 * FIVE harness files hold a copy of that list, and the count in this header has
 * been wrong twice: it said three, then four, and both times the number
 * disagreed with the enumeration printed directly beneath it. So the
 * enumeration is the count, and here it is in full — every entry a line I
 * opened on 2026-09-20:
 *
 *   1 `tools/mobile/lib/driveline.mjs:1593`  `classifyVerdict` — whole-string
 *     comparisons, one `return` per pill. §B pins it.
 *   2 `tools/mobile/lesson-audit.mjs:9604`   hand-types
 *         /^(издържан|неиздържан|незавършен|не е взет)$/i
 *     and assigns the verdict ONLY on a match. §E pins it. (`:567` names the
 *     four pills in a comment, which is prose about the same drift, not a
 *     sixth copy.)
 *   3 `.audit-frames/wave-scripts/canary-verdict.mjs`  held three and rejected
 *     anything outside them. §C is what keeps it holding none.
 *   4 `tools/audit/verdict-surface.mjs:137`   `export const PILL_WORDS = […]`,
 *     read at `:692` as `PILL_WORDS.includes(rowVerdict) ? rowVerdict : null`.
 *     A word missing here cannot raise a row/ledger DISAGREEMENT at all.
 *   5 `tools/audit/stale-claims.mjs:36`       `const NOT_TAKEN = "НЕ Е ВЗЕТ"`,
 *     with «ИЗДЪРЖАН» hand-typed into the matchers at `:108` and `:127`.
 *
 * Nothing compared them, so nothing said so.
 *
 * WHAT THE DRIFT COST, MEASURED 2026-09-19 (commands in the lane report):
 *   · `.audit-frames/w51/wave-c-results.jsonl` — 11 rows, «НЕ Е ВЗЕТ» x5,
 *     «ИЗДЪРЖАН» x3, «НЕИЗДЪРЖАН» x3. Five of eleven legs read the pill the
 *     canary called impossible.
 *   · Replaying sweep-preflight.sh's own canary picker over waveC-redrive.json
 *     + the .audit-frames w-dirs resolved TODAY to sc-follow-tailgater /
 *     mobile-wrong,
 *     recorded in w51 as verdict «НЕ Е ВЗЕТ», exit 0 — a leg the old list
 *     rejected. The preflight would have refused a healthy server, a healthy
 *     database and a correctly graded drive, and no sweep could be dispatched.
 *
 * ═══ WHAT IS ASSERTED, AND AGAINST WHAT ════════════════════════════════════
 *
 * Not "the three copies agree with each other" — three copies agreeing on a
 * stale list is exactly the state above. Everything here is keyed to the
 * PRODUCT'S OWN SOURCE OF TRUTH:
 *
 *   platform/src/modules/sim/hud/SessionEndScreen.tsx
 *     · `export type SessionVerdict = …`        the states
 *     · `SESSION_VERDICT_LABEL_BG: Record<…>`   the word printed on the pill
 *     · `sessionVerdict(result)`                the function that mints one
 *
 * §A reads that file and refuses to guess. §B pins the harness's classifier to
 * it KEY FOR KEY, so a fifth state, a renamed state or a reworded pill is red
 * here on the commit that introduces it. §C pins the canary to the same set —
 * by an oracle DERIVED from the pills, not a list of words somebody typed.
 * §E reads copies 1, 2, 4 and 5 above, the harvest regex included, by sweeping
 * the four directories that hold them — it names the directories it sweeps and
 * the files it deliberately does not read, rather than claiming "the harness",
 * which is how this section came to be green over a copy it never opened.
 * §F asks copies 4 and 5 the CONVERSE question — not "do you name a word the
 * product does not print" but "have you stopped naming one that it does" —
 * because the sentence three lines up, about a word missing from `PILL_WORDS`,
 * was the only thing standing where an assertion should have been. Copies 1 and
 * 2 already had their converse; copy 3 is supposed to hold no list at all.
 * §D mutation-tests every parser
 * against synthetic sources, because a source-scanning test that silently
 * matches nothing is green and blind — this repo has shipped that three times,
 * and §E's own anchors exist because a blind sweep reports zero stale words.
 *
 * AND NOTHING HERE IS ALLOWED TO PASS WITHOUT MEASURING. Six assertions used to
 * be guarded by a bare `if (!existsSync(…)) return;` over a gitignored path, so
 * on a fresh clone this file printed 28 pass / 0 skipped while measuring
 * twenty-two things. They now skip with a reason or fail; `canaryOrSkip` holds
 * the measurement.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyVerdict } from "../lib/driveline.mjs";

/** The product file that mints the pills. Resolved from this module's own URL,
 *  so it does not depend on the cwd — tools tests run from `platform/`. */
const SESSION_END_SCREEN = fileURLToPath(
  new URL("../../../platform/src/modules/sim/hud/SessionEndScreen.tsx", import.meta.url),
);
/** The harness's one classifier for the same field. */
const DRIVELINE = fileURLToPath(new URL("../lib/driveline.mjs", import.meta.url));
/** The sweep canary. GITIGNORED — see §C for what happens when it is absent. */
const CANARY = fileURLToPath(
  new URL("../../../.audit-frames/wave-scripts/canary-verdict.mjs", import.meta.url),
);
const CANARY_DIR_PATH = fileURLToPath(new URL("../../../.audit-frames/wave-scripts/", import.meta.url));
/** Copy 2 of the enumeration above — the one that harvests the pill off the
 *  page. `lesson-audit.mjs` runs this inside `page.evaluate`, so it cannot be
 *  imported and has to be read as source, exactly as `drivelinePills` reads
 *  the classifier. §E is what reads it. */
const LESSON_AUDIT = fileURLToPath(new URL("../lesson-audit.mjs", import.meta.url));
/** Copies 4 and 5 of the enumeration above, read DIRECTLY and not only swept.
 *  §E asks them one question — "do you name a word the product does not print"
 *  — and §F asks the converse, which is the question the header's own sentence
 *  about `PILL_WORDS` is about. Both files are git-tracked (`git ls-files`
 *  lists them), so unlike the canary they exist on every checkout and are read
 *  unconditionally: a `readFileSync` throw here is the correct loud failure. */
const VERDICT_SURFACE = fileURLToPath(new URL("../../audit/verdict-surface.mjs", import.meta.url));
const STALE_CLAIMS = fileURLToPath(new URL("../../audit/stale-claims.mjs", import.meta.url));
/** This file, and the sibling test whose counter-examples justify §E's
 *  `__tests__` exclusion. Named, never line-numbered: the citation that stood
 *  in §E's header pointed at a comment and a line of prose, because a
 *  self-referential line number is wrong the moment the file is edited — which
 *  for this file is every time the drift it watches moves. §E measures them. */
const SELF = fileURLToPath(import.meta.url);
const DRIVELINE_TEST = fileURLToPath(new URL("./driveline.test.mjs", import.meta.url));
/** Every directory §E sweeps for a copy of a pill word.
 *
 *  `../../audit/` is the one added on 2026-09-20, and it IS the "§E reads every
 *  other copy" repair: copies 4 and 5 of this file's own enumeration live there
 *  — `verdict-surface.mjs`'s `PILL_WORDS`, which decides whether a row may
 *  contradict the ledger, and `stale-claims.mjs`'s `NOT_TAKEN` — and neither
 *  was opened by any assertion in this file until that date. They are
 *  functional oracles, so they are read, not excused.
 *
 *  Non-recursive by design; the two `__tests__` directories it therefore skips
 *  are named in §E's own header, with the measurement that justifies them.
 *
 *  `optional` IS NOT COSMETIC. Exactly one of these is gitignored, and the
 *  sweep used to `continue` past ANY missing directory in silence — the same
 *  shape as the six absent-harness returns §C describes. A tracked directory
 *  that is not there is a broken checkout or a moved tree, and it is now a
 *  named failure; the gitignored one is reported as skipped and the run goes
 *  on. MEASURED 2026-09-20: `.audit-frames/wave-scripts/` contributes ZERO live
 *  stem-bearing code lines (all 19 of its stem lines are in the three frozen
 *  finding files, which are excluded by name), so the sweep measures the same
 *  96 lines with or without it — its absence weakens nothing below. */
const HARNESS_DIRS = [
  { rel: "../", optional: false },
  { rel: "../lib/", optional: false },
  { rel: "../../../.audit-frames/wave-scripts/", optional: true },
  { rel: "../../audit/", optional: false },
].map((d) => ({ ...d, path: fileURLToPath(new URL(d.rel, import.meta.url)) }));

/* ─────────────────────────────────────────────────────────────────────────────
 * §A · READ THE PRODUCT, AND FAIL ON WHAT CANNOT BE READ
 *
 * Every parser here throws rather than returning an empty result. The failure
 * this repo keeps repeating is a matcher that finds nothing and reports green:
 * a regex that stops matching after a harmless reformat certifies "the two
 * lists agree" over two lists it never saw. So the contract is: a shape this
 * cannot parse is an UNRESOLVED read and an unresolved read is a failure, with
 * the offending text in the message so the next reader repairs the parser
 * instead of deleting the test.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Drop whole-line `//` comments only. The label block's own comment contains a
 *  double quote (`„взето")`), which would otherwise be parsed as an entry. */
function stripLineComments(block) {
  return block
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
}

/** The body between `start` and the first line that is exactly `};`. */
function braceBlock(src, startNeedle, where) {
  const i = src.indexOf(startNeedle);
  if (i < 0) throw new Error(`UNRESOLVED: «${startNeedle}» is not in ${where} — the product moved or renamed it; repair this parser, do not delete the assertion`);
  const open = src.indexOf("{", i);
  if (open < 0) throw new Error(`UNRESOLVED: no «{» after «${startNeedle}» in ${where}`);
  const close = src.indexOf("\n};", open);
  if (close < 0) throw new Error(`UNRESOLVED: no closing «};» after «${startNeedle}» in ${where}`);
  return src.slice(open + 1, close);
}

/** `SESSION_VERDICT_LABEL_BG` as { verdictKey -> Bulgarian pill }. */
export function productPills(src, where = SESSION_END_SCREEN) {
  const body = stripLineComments(braceBlock(src, "SESSION_VERDICT_LABEL_BG", where));
  const out = {};
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const m = /^([A-Za-z_$][\w$]*)\s*:\s*"([^"]*)"\s*,?$/.exec(line);
    if (!m) throw new Error(`UNRESOLVED: a line inside SESSION_VERDICT_LABEL_BG is not «key: "label",» — «${line}» (${where})`);
    if (m[1] in out) throw new Error(`UNRESOLVED: duplicate key «${m[1]}» in SESSION_VERDICT_LABEL_BG (${where})`);
    out[m[1]] = m[2];
  }
  if (Object.keys(out).length === 0) throw new Error(`UNRESOLVED: SESSION_VERDICT_LABEL_BG parsed to zero entries (${where}) — that is a blind matcher, not an empty product`);
  return out;
}

/** The `SessionVerdict` union, as the list of state names. */
export function productVerdictStates(src, where = SESSION_END_SCREEN) {
  const m = /export type SessionVerdict\s*=\s*([^;]+);/.exec(src);
  if (!m) throw new Error(`UNRESOLVED: «export type SessionVerdict = …;» is not in ${where}`);
  const states = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (states.length === 0) throw new Error(`UNRESOLVED: the SessionVerdict union parsed to zero members — «${m[1]}» (${where})`);
  return states;
}

/** `classifyVerdict`'s whole-string comparisons, as { PILL -> bucket }. */
export function drivelinePills(src, where = DRIVELINE) {
  const body = (() => {
    const i = src.indexOf("export function classifyVerdict");
    if (i < 0) throw new Error(`UNRESOLVED: «export function classifyVerdict» is not in ${where}`);
    const close = src.indexOf("\n}", i);
    if (close < 0) throw new Error(`UNRESOLVED: no closing «}» for classifyVerdict in ${where}`);
    return src.slice(i, close);
  })();
  const out = {};
  for (const m of body.matchAll(/v\s*===\s*"([^"]+)"\s*\)\s*return\s*"([^"]+)"/g)) out[m[1]] = m[2];
  if (Object.keys(out).length === 0) throw new Error(`UNRESOLVED: classifyVerdict parsed to zero «v === "X" return "y"» pairs (${where}) — the function was rewritten; repair this parser`);
  return out;
}

/** The harness reads the pill with whitespace already collapsed
 *  (`lesson-audit.mjs` `t()`), and compares uppercased. */
const asHarnessReadsIt = (s) => String(s).trim().replace(/\s+/g, " ").toUpperCase();

/** A JavaScript double-quoted string literal, escapes included. */
const STRING_LITERAL = /"(?:[^"\\]|\\.)*"/g;

/** Non-comment lines of `src`, as [1-based line number, trimmed text]. Block
 *  comments are tracked too, because a file header that NAMES the pills — every
 *  one of these files has one — is exactly what §C and §E must let through. */
export function codeLines(src) {
  const out = [];
  let inBlock = false;
  src.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (inBlock) { if (line.includes("*/")) inBlock = false; return; }
    if (line.startsWith("/*")) { if (!line.includes("*/")) inBlock = true; return; }
    if (line === "" || line.startsWith("//") || line.startsWith("*")) return;
    out.push([i + 1, line]);
  });
  return out;
}

/**
 * Every string literal in the CODE of `src` that decodes to one of `pills`,
 * as { written, decoded, line }. Used by §C on the canary and mutation-tested
 * in §D, so the decode below is a measured behaviour and not a claim.
 */
export function codePillLiterals(src, pills) {
  const found = [];
  for (const [n, line] of codeLines(src)) {
    for (const m of line.matchAll(STRING_LITERAL)) {
      let decoded;
      try { decoded = JSON.parse(m[0]); } catch { continue; }
      if (pills.includes(asHarnessReadsIt(decoded))) found.push({ written: m[0], decoded, line: n });
    }
  }
  return found;
}

/**
 * The pill list `lesson-audit.mjs` HARVESTS with — the fourth copy, and the
 * one that decides whether a verdict is recorded at all. It is the alternation
 * of the `/^(…)$/i` regex tested against the pill text.
 *
 * This copy is not cosmetic: a pill the regex does not list is never assigned,
 * the row records `verdict: null`, and `classifyVerdict` then calls it
 * "unknown" — so a drift HERE reads downstream as a drive that never reached a
 * verdict card, which is the most reassuring possible way to be wrong.
 */
export function harvestPills(src, where = LESSON_AUDIT) {
  const hits = [...src.matchAll(/\/\^\(([^)/]+)\)\$\/i/g)]
    .map((m) => m[1].split("|").map((s) => s.trim()))
    .filter((alts) => alts.every((a) => /^[Ѐ-ӿ ]+$/.test(a)));
  if (hits.length === 0) throw new Error(`UNRESOLVED: no «/^(…)$/i» alternation of Cyrillic words in ${where} — the harvest regex was rewritten or reshaped; repair this parser, do not delete the assertion`);
  if (hits.length > 1) throw new Error(`UNRESOLVED: ${hits.length} Cyrillic «/^(…)$/i» alternations in ${where} (${JSON.stringify(hits)}) — this parser can no longer tell which one harvests the pill`);
  return hits[0];
}

/** The stems of the four pill words. A token carrying one of these is talking
 *  about a verdict pill, whatever else is around it; «Завърши сесията» (the
 *  end-session BUTTON) carries none of them, which is why the stems are
 *  «завършен» and not «завърш». */
const PILL_STEM = /издържан|завършен|взет/i;

/** Maximal Cyrillic runs of `line` that carry a pill stem. `${…}` holes are
 *  code, not words, so they are separators. */
export function pillStemTokens(line) {
  const text = line.replace(/\$\{[^}]*\}/g, " ");
  return (text.match(/[Ѐ-ӿ][Ѐ-ӿ ]*/g) || [])
    .map((r) => r.trim())
    .filter((r) => PILL_STEM.test(r));
}

const screenSrc = readFileSync(SESSION_END_SCREEN, "utf8");
const drivelineSrc = readFileSync(DRIVELINE, "utf8");

describe("§A the product's own pill list is readable", () => {
  it("SESSION_VERDICT_LABEL_BG parses, and covers the SessionVerdict union exactly", () => {
    const pills = productPills(screenSrc);
    const states = productVerdictStates(screenSrc);
    assert.deepEqual(
      Object.keys(pills).sort(),
      [...states].sort(),
      "SESSION_VERDICT_LABEL_BG and the SessionVerdict union disagree — a state with no word, or a word with no state",
    );
    // ADR-009 is the reason this file exists; naming the state it added means a
    // rollback that removes it is red here rather than silently narrowing the
    // canary back to three.
    assert.ok(
      states.includes("lessonMistake"),
      "the SessionVerdict union no longer carries «lessonMistake» — ADR-009 Ruling A was reverted? Then say so in an ADR and update this test deliberately",
    );
  });

  it("no two states share a pill word", () => {
    const pills = productPills(screenSrc);
    const words = Object.values(pills).map(asHarnessReadsIt);
    assert.equal(new Set(words).size, words.length, `two verdict states print the same pill: ${JSON.stringify(pills)} — the harness could not tell them apart`);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * §B · THE HARNESS CLASSIFIER, PINNED TO THE PRODUCT KEY FOR KEY
 *
 * Set equality would be too weak. `classifyVerdict` does not merely accept the
 * four words, it BUCKETS them, and a mapping that accepted «Не е взет» into
 * `fail` would satisfy a set test while attributing a spotless изпитен лист to
 * a broken grader — the exact misreading driveline.mjs's own header refuses.
 * ─────────────────────────────────────────────────────────────────────────── */
/**
 * THE TWO VOCABULARIES, AND THE ONE PLACE THEY ARE RELATED.
 *
 * The product's states and the harness's buckets are NOT the same words: two
 * of the four coincide by accident. `lesson-audit.mjs:571` counts into
 * `rate.counts.pass / .fail / .lessonMistake / .unfinished`, which predate
 * `SessionVerdict` — `passed`/`failed` were shortened there long before this
 * type existed, and renaming a ledger key renames it in every stored sweep
 * summary on disk.
 *
 * So the correspondence is written ONCE, here, and it is not the pill list:
 * the words on the pills still come from the product and nothing copies them.
 * A product state absent from this map is a hard failure that names the state
 * — the deliberate stop that ADR-009 should have produced and did not.
 */
const PRODUCT_STATE_TO_HARNESS_BUCKET = {
  passed: "pass",
  failed: "fail",
  lessonMistake: "lessonMistake",
  unfinished: "unfinished",
};

describe("§B driveline.classifyVerdict agrees with the product", () => {
  it("every product state has a declared harness bucket", () => {
    for (const state of Object.keys(productPills(screenSrc))) {
      assert.ok(
        state in PRODUCT_STATE_TO_HARNESS_BUCKET,
        `the product has a verdict state «${state}» this harness has never been told about. Teach driveline.classifyVerdict its pill word and lesson-audit.mjs its counter, then declare the bucket here — do not delete this assertion`,
      );
    }
    const buckets = Object.values(PRODUCT_STATE_TO_HARNESS_BUCKET);
    assert.equal(new Set(buckets).size, buckets.length, "two product states share one harness bucket — driveline.mjs's own header explains why «НЕ Е ВЗЕТ» may not be folded into either existing one");
  });

  it("every product pill classifies to its own state's bucket", () => {
    const pills = productPills(screenSrc);
    for (const [state, word] of Object.entries(pills)) {
      const want = PRODUCT_STATE_TO_HARNESS_BUCKET[state];
      assert.equal(
        classifyVerdict(word),
        want,
        `the product prints «${word}» for «${state}» and classifyVerdict calls it «${classifyVerdict(word)}»`,
      );
      // The recorded field is uppercase (see the .audit-frames w51 rows).
      assert.equal(classifyVerdict(asHarnessReadsIt(word)), want, `«${asHarnessReadsIt(word)}» (as the sweep records it) did not classify as «${want}»`);
    }
  });

  it("classifyVerdict knows NO pill the product does not print", () => {
    const pills = productPills(screenSrc);
    const fromSource = drivelinePills(drivelineSrc);
    assert.deepEqual(
      Object.keys(fromSource).sort(),
      Object.values(pills).map(asHarnessReadsIt).sort(),
      "the words classifyVerdict compares against are not the words the product prints — one of the two moved",
    );
    for (const [word, bucket] of Object.entries(fromSource)) {
      const state = Object.entries(pills).find(([, w]) => asHarnessReadsIt(w) === word)?.[0];
      assert.equal(bucket, PRODUCT_STATE_TO_HARNESS_BUCKET[state], `classifyVerdict buckets «${word}» as «${bucket}» but the product prints it for «${state}»`);
    }
  });

  it("and rejects everything else — the substring traps included", () => {
    const pills = Object.values(productPills(screenSrc));
    // «НЕИЗДЪРЖАН» contains «ИЗДЪРЖАН»; «НЕ Е ВЗЕТ» shares a stem with the
    // catalogue's «взето». Both traps fail in the reassuring direction.
    const notPills = [
      "", " ", null, undefined, "(none)", "unknown", "ВЗЕТ", "ВЗЕТО", "взето",
      "ИЗДЪРЖАНИЕ", "НЕ Е ВЗЕТ УРОКЪТ", "НЕ ВЗЕТ", "ПРЕКРАТЕН", "21,99 EUR",
      "Абонамент", "НЕИЗДЪРЖАН/ИЗДЪРЖАН",
    ];
    for (const v of notPills) {
      assert.equal(classifyVerdict(v), "unknown", `classifyVerdict admitted «${v}», which the product never prints`);
    }
    // Guard the guard: if a future edit made everything "unknown", the loop
    // above would still pass.
    for (const p of pills) assert.notEqual(classifyVerdict(p), "unknown", `the list above would pass vacuously — «${p}» must still be admitted`);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * §C · THE SWEEP CANARY
 *
 * `.audit-frames/` is gitignored ON PURPOSE (drives certify against the
 * worktree hash, doc 93), so on a CI checkout this file does not exist and
 * cannot be read. That absence is NOT allowed to be a quiet pass: the only way
 * past this section is for the whole `wave-scripts` directory to be missing
 * too, which is a checkout with no audit harness at all. A machine that HAS the
 * harness but has lost or renamed the canary is a failure, loudly.
 *
 * ── THE CANARY IS SPAWNED, NEVER IMPORTED, AND THAT IS A MEASUREMENT ───────
 *
 * The first draft of this section did `await import(canary)` and asserted on an
 * exported predicate. MEASURED 2026-09-19 by putting the pre-repair canary back
 * in place and running this file: it printed
 *     ℹ pass 1   ℹ fail 0
 * and exited GREEN. That file's body runs at import time and reaches
 * `process.exit(0)` when CANARY_DIR is unset — which tears the test RUNNER down
 * mid-collection, at status 0, with the drift it was written to catch sitting
 * on disk. A guard that the subject can switch off is not a guard.
 *
 * So the canary is executed exactly as `sweep-preflight.sh:289` executes it —
 * a child `node`, CANARY_DIR in the environment, the verdict read off stdout —
 * and the child's own exit status is asserted too. Nothing of the canary runs
 * inside this process.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Drive the canary over a one-row fixture, the way the preflight does.
 *
 * `frames` IS A STRING, because that is what the corpus holds. Measured
 * 2026-09-20 over `.audit-frames/w51/wave-c-results.jsonl` — all 11 rows carry
 * `frames` as a JSON string ("27", "29", "24", …, typeof "string"), and the row
 * sweep-preflight.sh's own picker resolves to, sc-follow-tailgater/mobile-wrong,
 * is `"frames":"27"`. This fixture used a NUMBER, so it was not the shape the
 * canary meets on a real dispatch: `canary-verdict.mjs` decides on
 * `!(r.frames > 0)`, which only works on "27" through JS coercion, and a fixture
 * that never exercises that coercion cannot notice it going away.
 */
const CANARY_PICK_FRAMES = "27";
function runCanary(verdict, frames = CANARY_PICK_FRAMES) {
  const dir = mkdtempSync(join(tmpdir(), "canary-pills-"));
  mkdirSync(join(dir, "frames", "L__G"), { recursive: true });
  writeFileSync(
    join(dir, "wave-c-results.jsonl"),
    JSON.stringify({ lesson: "L", leg: "G", exit: 0, frames, verdict, treeMoved: false }) + "\n",
    "utf8",
  );
  writeFileSync(join(dir, "frames", "L__G", "_audit-status.json"), '{"reachedVerdictCard":true}', "utf8");
  const r = spawnSync(process.execPath, [CANARY], { env: { ...process.env, CANARY_DIR: dir }, encoding: "utf8" });
  assert.equal(r.status, 0, `the canary exited ${r.status} on verdict «${verdict}» — sweep-preflight.sh reads its STDOUT and would see nothing. stderr: ${r.stderr}`);
  const out = (r.stdout || "").trim();
  assert.notEqual(out, "", `the canary printed nothing on verdict «${verdict}» — sweep-preflight.sh's «case "$V" in OK*)» would refuse every sweep`);
  return out;
}

/**
 * THE ABSENT-CANARY BRANCH, WHICH USED TO BE A SILENT `return`.
 *
 * `.audit-frames/` is gitignored (`.gitignore:73`) and `git ls-files
 * .audit-frames` prints nothing, so on CI or any fresh clone none of it exists.
 * Five assertions in this section and one in §E were guarded by a bare
 * `if (!existsSync(…)) return;`.
 *
 * MEASURED 2026-09-20 by rebuilding the swept tree from tracked files only —
 * `platform/src/.../SessionEndScreen.tsx`, `tools/mobile/`, `tools/mobile/lib/`,
 * `tools/mobile/__tests__/` and `tools/audit/`, with NO `.audit-frames/` — and
 * running this file inside it:
 *     ℹ tests 28   ℹ pass 28   ℹ fail 0   ℹ skipped 0   exit 0
 * Six assertions measured nothing and the runner said so nowhere. That is the
 * gate-4 shape (a step that cannot fail, reported as a pass) inside the file
 * written to refuse it.
 *
 * So the branch REPORTS. Three outcomes, and they are different facts:
 *   · canary present                 → run the assertion.
 *   · no `wave-scripts/` at all      → `t.skip(reason)`, and the runner prints
 *     `﹣ … # <reason>` and counts it under `ℹ skipped`. A reader of the log can
 *     now tell "not measured here" from "measured and fine".
 *   · `wave-scripts/` but no canary  → FAIL. That machine HAS the harness and
 *     `sweep-preflight.sh:289` invokes the canary by that exact path, so the
 *     absence is a broken dispatch, not an absent checkout.
 *
 * `t.skip()` DOES NOT STOP THE BODY, and the `return` beside it is not
 * redundant. MEASURED 2026-09-20 on node v24.18.0 with a two-test probe whose
 * skipped test threw after `t.skip()`:
 *     ℹ tests 2  ℹ pass 1  ℹ fail 0  ℹ skipped 1   … and exit status 1
 * — the throw still failed the run while `ℹ fail` stayed 0. A gate that greps
 * `fail 0` would call that green, which is the very defect this comment is
 * about. Skip AND return.
 */
function canaryOrSkip(t) {
  if (existsSync(CANARY)) return true;
  if (!existsSync(CANARY_DIR_PATH)) {
    t.skip(`no audit harness on this checkout — ${CANARY_DIR_PATH} does not exist (.audit-frames/ is gitignored, .gitignore:73). NOT MEASURED, not passed`);
    return false;
  }
  assert.fail(`${CANARY_DIR_PATH} exists but canary-verdict.mjs does not — sweep-preflight.sh:289 invokes it by that exact path and would read an empty stdout, so «case "$V" in OK*)» would refuse every sweep`);
}

describe("§C the sweep canary accepts exactly the product's pills", () => {
  it("is present wherever the harness is", (t) => {
    if (!existsSync(CANARY_DIR_PATH)) {
      t.skip(`no audit harness on this checkout — ${CANARY_DIR_PATH} does not exist (.audit-frames/ is gitignored, .gitignore:73). NOT MEASURED, not passed`);
      return;
    }
    assert.ok(existsSync(CANARY), `${CANARY_DIR_PATH} exists but canary-verdict.mjs does not — sweep-preflight.sh invokes it by that exact path and would print nothing`);
  });

  it("holds no pill list of its own", (t) => {
    if (!canaryOrSkip(t)) return;
    const src = readFileSync(CANARY, "utf8");
    // Comments may NAME the pills — the file's header explains the drift. Code
    // may not compare against them. So: no pill word inside a string literal in
    // a non-comment line.
    //
    // THE LITERAL IS DECODED FIRST, AND THAT IS NOT PEDANTRY. A copy of the
    // pill list can be written plainly, as
    //   "ИЗДЪРЖАН"
    // or escaped, as
    //   "ИЗДЪРЖАН"
    // — eight escapes, one per letter — and an UNDECODED text comparison sees
    // the second as backslashes and hex digits, not as a pill word.
    //
    // MEASURED 2026-09-20, this scan driven over a synthetic three-pill array
    // in both encodings (§D drives the same two sources on every run, so these
    // rows stay measured instead of remembered):
    //   decodes first (as shipped) · plain UTF-8  -> 3 literals flagged, RED
    //   decodes first (as shipped) · \u escaped   -> 3 literals flagged, RED
    //   no decode                  · plain UTF-8  -> 3 literals flagged, RED
    //   no decode                  · \u escaped   -> 0 flagged, GREEN and blind
    //
    // ── THE COMMENT THAT STOOD HERE DESCRIBED THE ROW THIS CODE IS NOT ──
    // It read "MEASURED 2026-09-19 by restoring that exact file: this assertion
    // passed", i.e. it reported the fourth row — the undecoded scan — as the
    // behaviour of a scan that decodes, and told the next reader that the check
    // naming the defect was the one that would miss it. A verifier restored the
    // escaped blob and measured this assertion FAILING. Its own illustration was
    // plain Cyrillic (`cat -v` on the committed file: M-PM-^X…, not И…),
    // so it did not even show the escapes it was arguing about. The four rows
    // above are what this code does, and §D holds them to it.
    const pills = Object.values(productPills(screenSrc)).map(asHarnessReadsIt);
    const copies = codePillLiterals(src, pills);
    assert.deepEqual(
      copies,
      [],
      `canary-verdict.mjs compares against pill literals again — ${copies
        .map((c) => `«${c.decoded}» written as ${c.written} on line ${c.line}`)
        .join("; ")}. That copy is what drifted from ADR-009. Ask driveline.classifyVerdict.`,
    );
    assert.ok(/classifyVerdict/.test(src), "canary-verdict.mjs no longer mentions classifyVerdict — it has stopped asking the harness's classifier");
  });

  it("admits every pill the product prints", (t) => {
    if (!canaryOrSkip(t)) return;
    for (const word of Object.values(productPills(screenSrc))) {
      for (const form of [word, asHarnessReadsIt(word)]) {
        const out = runCanary(form);
        assert.match(
          out,
          /^OK /,
          `the canary refuses «${form}», which the product prints — sweep-preflight.sh would refuse a healthy server, a healthy database and a correctly graded drive. It said: ${out}`,
        );
      }
    }
  });

  /**
   * THE ORACLE IS DERIVED FROM THE PRODUCT, NOT TYPED OUT.
   *
   * This was eight hand-typed words. The hole that leaves is exact: a canary
   * that still calls `classifyVerdict` — so §C's source check stays green — and
   * adds ONE acceptance of its own, `|| v === "ВЗЕТО"` or a `startsWith`, is
   * caught only if the widening happens to name one of those eight. Everything
   * else passes 17/17.
   *
   * So the candidates are generated from the product's own pills, in the shapes
   * a widening actually takes: every proper prefix and suffix (what a substring
   * or `startsWith` test admits), the pill with a letter added at either end,
   * the pill with its spaces removed, and every pair of pills joined. A fifth
   * pill widens the family on the commit that adds it, with nothing to retype.
   *
   * AND IT IS AN EQUALITY, NOT A REFUSAL. «ИЗДЪРЖАН» is a proper suffix of
   * «НЕИЗДЪРЖАН», so "every generated string must be refused" would be false of
   * a CORRECT canary: 3 of the generated candidates ARE pills. Membership in
   * the product's pill set decides each case, which is the only rule that stays
   * right when the pills change.
   *
   * THE SIZE IS NOT TYPED HERE ANY MORE, AND THAT IS THE POINT. This comment
   * said "91 candidates" in two places while the generator produced 90 — run
   * against the product's four pills on 2026-09-20 it returns 90, and the
   * assertion below reports whatever it really is instead of agreeing with a
   * number somebody remembered. A file whose whole subject is a claim outrunning
   * its check may not carry a hand-typed count of its own.
   */
  function verdictUniverse(pillWords) {
    const cand = new Set();
    for (const p of pillWords) {
      const u = asHarnessReadsIt(p);
      for (let i = 1; i < u.length; i++) { cand.add(u.slice(0, i)); cand.add(u.slice(i)); }
      cand.add(u + "О");
      cand.add("О" + u);
      cand.add(u.replace(/ /g, ""));
      for (const q of pillWords) cand.add(`${u} ${asHarnessReadsIt(q)}`);
    }
    // Not derived, and deliberately so: these are what a BROKEN drive records
    // in this field rather than what a widened classifier admits. «взето» is
    // the lesson catalogue's word for a completed rung and has burned this
    // repo before; the price is the paywall the 2026-08-24 drives photographed.
    for (const s of ["", " ", "(none)", "unknown", "null", "undefined", "21,99 EUR", "Абонамент", "ВЗЕТО", "взето"]) cand.add(s);
    return [...cand];
  }

  it("reads the frames count in BOTH shapes the corpus has written", (t) => {
    if (!canaryOrSkip(t)) return;
    const pill = Object.values(productPills(screenSrc))[0];
    // "27" is what w51 records; 27 is what the field's name implies. The canary
    // must admit a drive either way, and must still refuse a frameless one —
    // «frames=0» is how a lesson that never rendered reaches the ledger.
    for (const frames of ["27", 27]) {
      assert.match(runCanary(pill, frames), /^OK /, `the canary refused a graded drive because frames was ${JSON.stringify(frames)} (${typeof frames})`);
    }
    for (const frames of ["0", 0]) {
      assert.match(runCanary(pill, frames), /^FAIL /, `the canary admitted a drive with frames ${JSON.stringify(frames)} — no frames is no evidence`);
    }
  });

  it("its answer equals product-pill membership over a derived universe", (t) => {
    if (!canaryOrSkip(t)) return;
    const pillWords = Object.values(productPills(screenSrc));
    const member = new Set(pillWords.map(asHarnessReadsIt));
    const universe = verdictUniverse(pillWords);
    // A universe that collapsed would make every assertion below vacuous — the
    // blind-matcher failure this file exists to refuse.
    //
    // THE FLOOR IS KEPT AND A STRUCTURAL CHECK IS ADDED ON TOP OF IT. A count
    // can be met by a generator producing the wrong things, so each pill's own
    // widening shapes are asserted present BY NAME, derived from the pill: a
    // fifth pill widens this with nothing to retype, and no number here has to
    // be remembered.
    const generated = new Set(universe);
    for (const p of pillWords) {
      const u = asHarnessReadsIt(p);
      for (const [shape, s] of [
        ["proper prefix", u.slice(0, u.length - 1)],
        ["proper suffix", u.slice(1)],
        ["a letter appended", u + "О"],
        ["a letter prepended", "О" + u],
        ["spaces removed", u.replace(/ /g, "")],
      ]) {
        assert.ok(generated.has(s), `the universe no longer contains «${s}» — the ${shape} of «${u}», which is one of the shapes a widened canary admits. Repair the generator, do not delete the case`);
      }
    }
    assert.ok(universe.length >= 40, `the derived universe collapsed to ${universe.length} candidates — repair the generator, do not lower this floor`);
    let admitted = 0;
    for (const v of universe) {
      const want = member.has(asHarnessReadsIt(v));
      const out = runCanary(v);
      if (want) {
        admitted++;
        assert.match(out, /^OK /, `the canary refuses «${v}», which IS one of the product's pills — sweep-preflight.sh would refuse a healthy server over a correctly graded drive. It said: ${out}`);
      } else {
        assert.match(out, /^FAIL /, `the canary admitted «${v}», which the product does not print — a drive that reads that is not a graded drive. It said: ${out}`);
      }
    }
    // Guard the guard, the other way round: if the generator ever stopped
    // producing pill-valued candidates the loop would only ever test refusals.
    assert.ok(admitted > 0, "no generated candidate was a pill, so the OK branch above never ran — the universe no longer covers the accepting case");
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * §E · EVERY OTHER COPY OF THE PILL LIST IN THE HARNESS
 *
 * §C says the canary "holds no pill list of its own". That is true of the
 * canary and it was being read as a claim about the harness, which it is not:
 * `lesson-audit.mjs:9604` hand-types
 *     /^(издържан|неиздържан|незавършен|не е взет)$/i
 * and until now nothing in this file read it. That is the copy that HARVESTS
 * the pill off the page, so its drift is the quietest of all — an unlisted pill
 * is never assigned, the row stores `verdict: null`, and every consumer
 * downstream reads that as a drive that never reached a verdict card.
 *
 * ── WHAT IS SWEPT, AND WHY THE SIZE IS NOT TYPED HERE ─────────────────────
 * Four directories, and the .mjs files inside them are READ, not listed:
 * `tools/mobile/`, `tools/mobile/lib/`, `.audit-frames/wave-scripts/` and
 * `tools/audit/`. Of their code lines (comments excluded), 115 carry a pill
 * stem: 96 in the live harness — 8 + 4 + 84, the 84 being the `tools/audit/`
 * files this section did not open until 2026-09-20 — and 19 in the three frozen
 * finding files named below. Those five numbers are re-derived by the run.
 *
 * THE CORPUS SIZE IS PRINTED, NOT REMEMBERED, AND THAT IS A REPAIR. This
 * paragraph said "162 files, 3,859,174 bytes". Re-measured 2026-09-20 over the
 * same four directories: 162 .mjs files and 3,859,177 bytes — three bytes out,
 * in a file whose whole subject is a claim outrunning its check; and the 162
 * silently counted .mjs only, while 178 files of all types sat in those
 * directories.
 *
 * A CORPUS SIZE IS ALSO THE WRONG KIND OF NUMBER TO TYPE, and this session
 * measured that rather than arguing it: between the re-measurement above and
 * the next run of this file, a different lane added
 * `tools/mobile/lib/road-criteria.mjs` (41,216 bytes) and the count moved to
 * 163 .mjs files. Nothing about the pills changed; the number in the comment
 * was simply out of date within the hour. So the sweep reports what it actually
 * read through `t.diagnostic()` — files, bytes, directories present, stem lines
 * — and every run prints today's figure instead of asking a reader to trust
 * this line. The stem-line counts above survive because they are a property of
 * the pill words, not of how many files happen to sit in a directory: that same
 * new file added 0 of them.
 *
 * ── `tools/audit/` IS READ, NOT EXCUSED, AND THAT IS A DECISION ───────────
 * Ten of its files name a pill word in code. Two are FUNCTIONAL ORACLES and
 * that settles it: `verdict-surface.mjs:137` `PILL_WORDS`, read at `:692` to
 * decide whether a row may contradict the ledger, and `stale-claims.mjs:36`
 * `NOT_TAKEN` with «ИЗДЪРЖАН» hand-typed into the matchers at `:108`/`:127`. A
 * word that drifts out of either is not a cosmetic drift: the first silences a
 * DISAGREEMENT, the second decides whether a filed row is stale. The remaining
 * eight are judge briefs, assertions and synthetic fixtures — they are read
 * too, because a reworded pill genuinely does make a brief sentence wrong, and
 * unlike the three files below they quote nothing that has to stay quoted.
 * Swept on 2026-09-20 they contributed 84 stem-bearing code lines and ZERO
 * stale words, so this widening is not a red being tolerated; the mutation in
 * `verdict-surface.mjs` is what proves it is not a blind one either.
 *
 * ── WHAT IS NOT SWEPT, AND WHY ────────────────────────────────────────────
 * `file-new.mjs`, `file-w13.mjs` and `file-wlp.mjs` are filed w11/w13 findings.
 * Their pill words are QUOTATIONS of what the product printed on those sweeps
 * («w11 wave-c-results records verdict НЕИЗДЪРЖАН score 13»). If a pill is ever
 * reworded, those sentences must keep the old word or the corpus stops being a
 * record — so a red there would be a demand to falsify evidence. They are
 * excluded by name, they are asserted to still exist, and this paragraph is the
 * reason.
 *
 * The two `__tests__` directories are the other exclusion, and the reason given
 * here used to be "it holds THIS file", which is not the real one. It is that
 * both files deliberately name words the product does NOT print:
 * `driveline.test.mjs` asserts «ВЗЕТО» and «НЕ Е ВЗЕТА» classify as `unknown`
 * — the negative half of the classifier's own test — and this file does the
 * same in §B's `notPills` array, in `verdictUniverse`'s non-derived tail and in
 * §D's reworded-pill fixtures. Sweeping a directory of deliberate
 * counter-examples would red on every one of them and the only way green would
 * be to delete the counter-examples.
 *
 * THOSE FIXTURES ARE NAMED, NOT LINE-NUMBERED, AND THE TEST BELOW COUNTS THEM.
 * The citation that stood here — "this file's own §B/§C fixtures do the same at
 * `:342` and `:510`" — pointed at a comment and at a line of prose inside a
 * block comment; the fixtures were elsewhere, and had moved again by the time
 * anyone checked. A line number into the file you are editing is wrong as soon
 * as you edit it, so the exclusion is now justified by a measurement that
 * re-derives the lines on every run and prints them.
 *
 * (The sweep is non-recursive, so `tools/mobile/lib/__tests__` is out too.)
 *
 * ── A CROSS-LANE COUPLING, DECIDED 2026-09-20 ─────────────────────────────
 * Adding `tools/audit/` put this test's fate partly in other people's hands:
 * `tools/audit/build-redrive.test.mjs` is edited by a different lane and, as of
 * 2026-09-20, contributes 4 of the 84 `tools/audit/` stem lines (its `:287`,
 * `:477`, `:688` and `:694` — judge-brief prose quoting «НЕИЗДЪРЖАН»,
 * «ИЗДЪРЖАН» and «НЕЗАВЪРШЕН», all of them words the product prints).
 *
 * THAT IS INTENDED, and the coupling is narrower than it looks:
 *   · Comments are invisible to the sweep. `codeLines()` drops `//` lines and
 *     `/* … *\/` blocks, so an unrelated lane rewording a comment — including
 *     one that names a pill — cannot red this file. §D drives that on a
 *     synthetic source on every run, so it stays a measurement.
 *   · The only edit that CAN red it is a code line naming a pill-stem word the
 *     product does not print, which is exactly the drift this file exists to
 *     catch. A test that reds on that is doing its job, wherever the line came
 *     from; the fix is the stale word, not the sweep.
 *   · The floor cannot be tripped by ordinary editing: 96 live stem lines
 *     against a floor of 40, 84 of them in `tools/audit/`.
 * If a lane ever needs to quote a pill the product has stopped printing — the
 * way w11/w13 findings do — the answer is the `FROZEN_FINDING_FILES` treatment
 * above: name the file, say why its words must stay stale, and assert it still
 * exists. Not an exclusion by wildcard, and not deleting the sweep.
 * ─────────────────────────────────────────────────────────────────────────── */
const lessonAuditSrc = readFileSync(LESSON_AUDIT, "utf8");

/** Filed findings, not harness logic — see the section header. */
const FROZEN_FINDING_FILES = ["file-new.mjs", "file-w13.mjs", "file-wlp.mjs"];

describe("§E the harness's other copies are pinned to the product too", () => {
  it("lesson-audit.mjs harvests exactly the product's pills", () => {
    const harvested = harvestPills(lessonAuditSrc).map(asHarnessReadsIt).sort();
    const printed = Object.values(productPills(screenSrc)).map(asHarnessReadsIt).sort();
    assert.deepEqual(
      harvested,
      printed,
      "the /^(…)$/i alternation in lesson-audit.mjs and the words the product prints disagree. A pill it does not list is never harvested: the row records verdict null, classifyVerdict calls that «unknown», and the sweep reads a graded drive as one that never reached a verdict card",
    );
  });

  it("no harness file names a pill word the product does not print", (t) => {
    const printed = new Set(Object.values(productPills(screenSrc)).map(asHarnessReadsIt));
    const stale = [];
    let stemLines = 0;
    let filesRead = 0;
    let bytesRead = 0;
    const skippedDirs = [];
    // One anchor per FUNCTIONAL copy the enumeration in this file's header
    // names. An anchor is not decoration: §E was green for as long as it has
    // existed while `verdict-surface.mjs` sat unopened, and a directory added
    // to HARNESS_DIRS that is then mis-globbed, renamed or emptied fails
    // silently in exactly that direction. Each of these says "the sweep
    // actually reached copy N".
    const seen = { classifier: false, harvest: false, pillWords: false, notTaken: false };
    for (const { rel, path: dir, optional } of HARNESS_DIRS) {
      if (!existsSync(dir)) {
        // A missing TRACKED directory is a broken checkout, not a fresh one,
        // and used to be a silent `continue`. Only the gitignored one is
        // allowed to be absent, and even that is reported.
        assert.ok(optional, `${rel} (${dir}) is in HARNESS_DIRS and is not there. It is git-tracked, so this is a moved tree or a broken checkout — the sweep below would have gone quietly blind over every copy it holds`);
        skippedDirs.push(rel);
        continue;
      }
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".mjs") || FROZEN_FINDING_FILES.includes(f)) continue;
        const src = readFileSync(join(dir, f), "utf8");
        filesRead++;
        bytesRead += Buffer.byteLength(src, "utf8");
        for (const [n, line] of codeLines(src)) {
          const tokens = pillStemTokens(line);
          if (!tokens.length) continue;
          stemLines++;
          if (f === "driveline.mjs" && /classifyVerdict|return "/.test(line)) seen.classifier = true;
          if (f === "lesson-audit.mjs" && /\/\^\(/.test(line)) seen.harvest = true;
          if (f === "verdict-surface.mjs" && /PILL_WORDS\s*=/.test(line)) seen.pillWords = true;
          if (f === "stale-claims.mjs" && /NOT_TAKEN\s*=/.test(line)) seen.notTaken = true;
          for (const t of tokens) {
            if (!printed.has(asHarnessReadsIt(t))) stale.push(`${f}:${n} «${t}»  ${line.slice(0, 110)}`);
          }
        }
      }
    }
    assert.deepEqual(stale, [], `harness code names verdict words the product does not print:\n  ${stale.join("\n  ")}\nEither the product was reworded and these copies were left behind, or a copy was invented. Fix the copy — do not add it to the product.`);
    // NOT BLIND: all four live copies this section exists for must have been
    // among the lines read.
    assert.ok(seen.classifier, "the sweep did not reach driveline.mjs's classifier lines — it is reading the wrong files or codeLines() stopped seeing code");
    assert.ok(seen.harvest, "the sweep did not reach lesson-audit.mjs's harvest regex — it is reading the wrong files or codeLines() stopped seeing code");
    assert.ok(seen.pillWords, "the sweep did not reach verdict-surface.mjs's PILL_WORDS — tools/audit/ dropped out of HARNESS_DIRS, or the declaration moved. That is the exact state in which this section was green over a broken oracle before 2026-09-20");
    assert.ok(seen.notTaken, "the sweep did not reach stale-claims.mjs's NOT_TAKEN — tools/audit/ dropped out of HARNESS_DIRS, or the declaration moved");
    // 96 stem-bearing live code lines measured 2026-09-20 (8 tools/mobile + 4
    // lib + 84 tools/audit). The floor is well below that so an ordinary edit
    // does not re-red it — the anchors above are what prove the sweep saw the
    // copies — but it is far enough above the pre-2026-09-20 total of 12 that
    // losing `tools/audit/` again cannot pass it.
    assert.ok(stemLines >= 40, `only ${stemLines} harness code lines carry a pill stem — 96 were measured on 2026-09-20 and 12 of those predate tools/audit/ being swept, so a count this low means the sweep went blind or lost a directory, not that the copies were removed`);
    // WHAT IT ACTUALLY READ, PRINTED. The header used to type a file count and
    // a byte total, and the byte total was three bytes wrong. This line is the
    // replacement: it is re-derived every run, it names the frozen files it did
    // not open, and it says which directories were absent instead of leaving
    // that to be inferred from a number nobody checks.
    t.diagnostic(
      `swept ${filesRead} .mjs files, ${bytesRead} bytes, across ${HARNESS_DIRS.length - skippedDirs.length} of ${HARNESS_DIRS.length} directories` +
        `${skippedDirs.length ? ` (absent, gitignored: ${skippedDirs.join(", ")})` : ""}` +
        ` · ${stemLines} stem-bearing code lines · ${FROZEN_FINDING_FILES.length} frozen finding files not opened`,
    );
  });

  it("the files it does NOT read are named, and still exist", (t) => {
    const dir = CANARY_DIR_PATH;
    if (!existsSync(dir)) {
      t.skip(`no audit harness on this checkout — ${dir} does not exist (.audit-frames/ is gitignored, .gitignore:73). The frozen finding files live there, so this is NOT MEASURED, not passed`);
      return;
    }
    for (const f of FROZEN_FINDING_FILES) {
      assert.ok(
        existsSync(join(dir, f)),
        `${f} is excluded from the sweep above as a filed finding, and it is not there any more. Either it was renamed — in which case the exclusion now hides a live file — or it was deleted and the exclusion should go with it.`,
      );
    }
  });

  /**
   * THE `__tests__` EXCLUSION, JUSTIFIED BY MEASUREMENT RATHER THAN BY A LINE
   * NUMBER.
   *
   * The header's claim is that these two files deliberately name words the
   * product does not print, so sweeping their directory would red on every one
   * of them. That claim was supported by "`:342` and `:510`", which were a
   * comment and a line of prose — the fixtures had moved, and a self-referential
   * line number moves again with the next edit.
   *
   * So the claim is executed instead: both files are read with the sweep's own
   * `codeLines` + `pillStemTokens`, and the counter-examples are counted and
   * PRINTED. If someone ever removes them, this goes red and the exclusion has
   * to be re-argued — which is the correct outcome, because at that point
   * sweeping `__tests__` would cost nothing and the exclusion would be a hole.
   */
  it("the __tests__ directories it skips really do hold counter-examples", (t) => {
    const printed = new Set(Object.values(productPills(screenSrc)).map(asHarnessReadsIt));
    const report = [];
    for (const file of [SELF, DRIVELINE_TEST]) {
      // Both are git-tracked and sit in this very directory, so an absence is a
      // broken checkout — never a quiet skip.
      assert.ok(existsSync(file), `${file} is not there — it is git-tracked and sits beside this file, so this is a moved tree, not a checkout without the audit harness`);
      const rows = [];
      for (const [n, line] of codeLines(readFileSync(file, "utf8"))) {
        const stale = pillStemTokens(line).filter((w) => !printed.has(asHarnessReadsIt(w)));
        if (stale.length) rows.push(`${n} ${JSON.stringify(stale)}`);
      }
      assert.ok(
        rows.length > 0,
        `${file} no longer names a single word the product does not print, so §E's reason for skipping tools/mobile/__tests__ — "a directory of deliberate counter-examples" — is no longer true of it. Re-argue the exclusion or drop it; do not delete this assertion`,
      );
      report.push(`${file.replace(/^.*[\\/]/, "")}: ${rows.length} counter-example code lines at ${rows.join(", ")}`);
    }
    t.diagnostic(report.join(" · "));
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * §F · THE CONVERSE — A WORD THE HARNESS HAS STOPPED NAMING
 *
 * §E asks one question of the swept files: does any of them name a word the
 * PRODUCT does not print. That is half a comparison. This file's own header
 * states the cost of the other half in terms — of `PILL_WORDS`, «A word missing
 * here cannot raise a row/ledger DISAGREEMENT at all» — and then asserted
 * nothing about it.
 *
 * MEASURED 2026-09-20, each row `node --test <file>` from `platform/`, each
 * mutation applied to a pristine copy and reverted `cmp`-identical after.
 * "BEFORE" is this file as it stood before §F existed (28 tests); "NOW" is this
 * file (39).
 *
 * SIBLING is `verdict-surface.test.mjs` (18 tests) for the first row and
 * `stale-claims.test.mjs` (7 tests) for the other three — the committed test of
 * whichever oracle the row mutates.
 *
 *  MUTATION                                     BEFORE     NOW       SIBLING
 *  ─────────────────────────────────────────    ────────   ───────   ─────────
 *  PILL_WORDS' 4th word DELETED (not reworded)  28p/0f     38p/1f    17p/1f
 *  NOT_TAKEN folded into «НЕИЗДЪРЖАН»           28p/0f     37p/2f     4p/3f
 *  NOT_TAKEN reworded to «НЕ ВЗЕТ»              27p/1f     36p/3f     5p/2f
 *  stale-claims stops naming «ИЗДЪРЖАН» (x9)    28p/0f     38p/1f     3p/4f
 *
 * The first column is the defect: three of the four mutations left this file at
 * 28 pass / 0 fail. The one it did catch is the shallowest — a word the product
 * never prints, which §E sees as stale — while a word simply GONE, or folded
 * into another pill, was invisible.
 *
 * THE SIBLING COLUMN IS NOT "COVERED ELSEWHERE, MOVE ON". Both siblings do red,
 * and the brief that sent me here said one of them could not: `grep -n
 * 'NOT_TAKEN\|PILL_WORDS' tools/audit/stale-claims.test.mjs` prints nothing and
 * exits 1, which is true and proves less than it looks. That file hand-types
 * «НЕ Е ВЗЕТ» six times in its own fixtures and expectations (`:44`, `:47`,
 * `:48`, …), so it reds on all three stale-claims mutations — a grep for the
 * CONSTANT'S NAME cannot see a copy of the WORD. Checked before trusting it.
 *
 * What neither sibling does is read the product. `grep -c
 * 'SessionEndScreen\|SESSION_VERDICT_LABEL_BG' tools/audit/verdict-surface.test.mjs
 * tools/audit/stale-claims.test.mjs` → 0 and 1, and that 1 is a comment
 * (`stale-claims.test.mjs:83`). `verdict-surface.test.mjs:264` asserts
 * `PILL_WORDS.includes("НЕ Е ВЗЕТ")` against a word typed into the test. So the
 * two oracles and their two tests are four copies pinned to each other: reword
 * the pill in `SessionEndScreen.tsx` and update the oracle and its test
 * together, and all four stay green while every one of them has drifted from
 * the product. That is precisely the state this file's «WHAT IS ASSERTED»
 * paragraph refuses — "three copies agreeing on a stale list" — and §F is the
 * assertion that is keyed to `SESSION_VERDICT_LABEL_BG` instead.
 *
 * WHY ONLY THESE TWO FILES. Copies 1 and 2 already have their converse: §B's
 * "classifyVerdict knows NO pill the product does not print" and §E's harvest
 * assertion are both `deepEqual` over sorted lists, which fails in either
 * direction. Copy 3 holds no list at all, by §C. Copies 4 and 5 are the two
 * that only ever had the one-way test.
 * ─────────────────────────────────────────────────────────────────────────── */
/**
 * READ INSIDE THE TESTS, NOT AT MODULE LOAD, AND THAT IS A MEASUREMENT.
 *
 * The first draft read both files beside `lessonAuditSrc` at the top of the
 * module. MEASURED 2026-09-20 on a clone with `tools/audit/` removed: the
 * `readFileSync` threw during collection and the runner printed
 *     ℹ tests 1   ℹ pass 0   ℹ fail 1
 * — one "test", the file itself. It is loud, but §A through §E never ran, so
 * the only thing the log says about a tree that lost a swept directory is that
 * this file did not load. Read here and the same tree reports §E's named
 * directory failure and §F's named file failure, with §A–§D still measuring.
 */
function mustRead(file, why) {
  assert.ok(existsSync(file), `${file} is not there — ${why}. It is git-tracked, so this is a moved or broken tree, not a checkout without the audit harness`);
  return readFileSync(file, "utf8");
}

/** `PILL_WORDS` as the list of words it holds, escapes decoded — §D shows an
 *  undecoded scan cannot see a `\u`-escaped copy, and this parser must.
 *
 *  An EMPTY array is returned as empty and is NOT an unresolved read: `[]` is a
 *  perfectly parseable declaration and an emptied oracle is precisely the
 *  failure this section exists for, so it must arrive at the assertion and be
 *  reported as itself, not as "repair the parser". */
export function pillWordsList(src, where = VERDICT_SURFACE) {
  const m = /export const PILL_WORDS\s*=\s*\[([^\]]*)\]/.exec(src);
  if (!m) throw new Error(`UNRESOLVED: «export const PILL_WORDS = [ … ]» is not in ${where} — it was renamed, reshaped or moved; repair this parser, do not delete the assertion`);
  const words = [];
  for (const lit of m[1].match(STRING_LITERAL) || []) {
    try { words.push(JSON.parse(lit)); }
    catch { throw new Error(`UNRESOLVED: «${lit}» inside PILL_WORDS is not a readable string literal (${where})`); }
  }
  return words;
}

/** `stale-claims.mjs`'s `NOT_TAKEN`, decoded. */
export function notTakenWord(src, where = STALE_CLAIMS) {
  const m = /const NOT_TAKEN\s*=\s*("(?:[^"\\]|\\.)*")/.exec(src);
  if (!m) throw new Error(`UNRESOLVED: «const NOT_TAKEN = "…"» is not in ${where} — the declaration was renamed or reshaped; repair this parser, do not delete the assertion`);
  try { return JSON.parse(m[1]); }
  catch { throw new Error(`UNRESOLVED: NOT_TAKEN's literal «${m[1]}» is not readable (${where})`); }
}

/**
 * Every pill-ish word a file names in CODE, normalised as the harness reads a
 * pill. Two readings, because this file's copies are written two ways:
 *   · stem tokens, which is how `ИЗДЪРЖАН` inside the regex at
 *     `stale-claims.mjs:108` and inside the template at `:129` is reachable at
 *     all — neither is a string literal;
 *   · decoded double-quoted literals, which is how an escaped copy is reachable
 *     and how a pill written with a NO-BREAK SPACE stays one word.
 *
 * THE SECOND READING IS NOT REDUNDANT, MEASURED 2026-09-20:
 * `tools/mobile/__tests__/driveline.test.mjs:2979` writes «Не е взет» with
 * U+00A0 between the words (`codepoints: Н:U+041D е:U+0435  :U+00A0 …`).
 * `pillStemTokens` splits on it — its class is `[Ѐ-ӿ ]`, an ASCII space — and
 * returns «взет», which is not a pill. `asHarnessReadsIt` collapses `\s+`, and
 * JavaScript's `\s` includes U+00A0, so the literal reading returns the pill.
 * `classifyVerdict` accepts that file's spelling, which is why the file passes
 * 164/164; a "must still name" test reading stem tokens alone would not.
 */
export function namedPillWords(src) {
  const out = new Set();
  for (const [, line] of codeLines(src)) {
    for (const w of pillStemTokens(line)) out.add(asHarnessReadsIt(w));
    for (const m of line.matchAll(STRING_LITERAL)) {
      let decoded;
      try { decoded = JSON.parse(m[0]); } catch { continue; }
      if (PILL_STEM.test(decoded)) out.add(asHarnessReadsIt(decoded));
    }
  }
  return out;
}

/** The product's pill for a state, or a failure that names the state. Nothing
 *  below may fall back to `undefined` and compare it to a word. */
function pillFor(state) {
  const pills = productPills(screenSrc);
  assert.ok(state in pills, `the product no longer has a verdict state «${state}», which §F is keyed to. §A and §B fail first and say more; if the state was genuinely renamed, retarget these entries deliberately`);
  return pills[state];
}

/**
 * WHICH PILLS `stale-claims.mjs` MUST STILL NAME, AND WHY — keyed by STATE.
 *
 * Same doctrine as §B's `PRODUCT_STATE_TO_HARNESS_BUCKET`: the correspondence
 * is written here, the WORDS are not. A rename in the product changes what this
 * demands without anything being retyped, and an entry whose reason has stopped
 * being true is deleted deliberately, with the reason in the diff.
 *
 * `stale-claims.mjs` legitimately names only some of the four — it is a matcher
 * over filed sentences, not a copy of the list — so a set equality would be
 * false of a correct file. These two are the ones its logic cannot work without.
 */
const STALE_CLAIMS_MUST_NAME = {
  passed: "the claim matcher at :108 tests the filed sentence «credited ИЗДЪРЖАН», and :127 asks whether any right leg still reads it. Lose the word and the matcher stops recognising the claim it exists to check — silently, because an unmatched claim is simply never reported stale",
  lessonMistake: "ADR-009's word, held at :36 as NOT_TAKEN and reported BY NAME so a judge is not told «the product now penalises this» about a лист that is within tolerance. Fold it into «НЕИЗДЪРЖАН» and that distinction is gone with nothing red",
};

describe("§F the two oracles still name every pill the product prints", () => {
  it("verdict-surface.mjs's PILL_WORDS holds the product's list, no word missing", () => {
    const held = pillWordsList(mustRead(VERDICT_SURFACE, "it holds PILL_WORDS, the list that decides whether a row may contradict the ledger")).map(asHarnessReadsIt).sort();
    const printed = Object.values(productPills(screenSrc)).map(asHarnessReadsIt).sort();
    assert.deepEqual(
      held,
      printed,
      `PILL_WORDS and the words the product prints are not the same set. A word MISSING from PILL_WORDS is the quiet half: verdict-surface.mjs:692 reads «PILL_WORDS.includes(rowVerdict) ? rowVerdict : null», so a row that scraped that pill is treated as having said nothing and classifyLeg can never raise a row/ledger DISAGREEMENT on it. A word EXTRA in it is a copy that has outlived the product. Held: ${JSON.stringify(held)}; printed: ${JSON.stringify(printed)}`,
    );
  });

  it("stale-claims.mjs's NOT_TAKEN is still ADR-009's word, not a shade of another pill", () => {
    const want = pillFor("lessonMistake");
    assert.equal(
      asHarnessReadsIt(notTakenWord(mustRead(STALE_CLAIMS, "it holds NOT_TAKEN, ADR-009's word as the stale-claims matchers use it"))),
      asHarnessReadsIt(want),
      `NOT_TAKEN is not the word the product prints for «lessonMistake» (${want}). If it has been folded into another pill, read verdict-surface.mjs's own comment first: «ADDED AS ITS OWN WORD, NOT AS A SHADE OF «НЕИЗДЪРЖАН»» — they are different facts about the drive, and folding them lets a judge close «the wrong leg is never penalised» on a drive that took no points at all`,
    );
  });

  it("stale-claims.mjs still names every pill its matchers depend on", () => {
    const named = namedPillWords(mustRead(STALE_CLAIMS, "its matchers hand-type the pill words this asserts are still there"));
    for (const [state, why] of Object.entries(STALE_CLAIMS_MUST_NAME)) {
      const word = pillFor(state);
      assert.ok(
        named.has(asHarnessReadsIt(word)),
        `stale-claims.mjs no longer names «${word}», the product's pill for «${state}». ${why}. It names: ${JSON.stringify([...named])}`,
      );
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * §D · MUTATION TESTS — the parsers must SEE, not merely not-throw
 *
 * Every assertion above is only as good as §A's regexes. A matcher that stops
 * matching is green and blind, so each parser is driven over synthetic sources
 * that differ from the real one in exactly the way that would matter.
 * ─────────────────────────────────────────────────────────────────────────── */
describe("§D the parsers see what changed", () => {
  const synthetic = (entries, union) => `
export type SessionVerdict = ${union};

export const SESSION_VERDICT_LABEL_BG: Record<SessionVerdict, string> = {
${entries}
};
`;

  it("a FIFTH pill is seen, not rounded off to four", () => {
    const src = synthetic(
      `  passed: "Издържан",\n  failed: "Неиздържан",\n  lessonMistake: "Не е взет",\n  unfinished: "Незавършен",\n  abandoned: "Прекратен",`,
      `"passed" | "failed" | "lessonMistake" | "unfinished" | "abandoned"`,
    );
    const pills = productPills(src, "(synthetic)");
    assert.equal(Object.keys(pills).length, 5);
    assert.equal(pills.abandoned, "Прекратен");
    // …and the real classifier does NOT know it, which is the red a fifth state
    // must produce on the commit that adds it.
    assert.equal(classifyVerdict("Прекратен"), "unknown");
  });

  it("a REWORDED pill is seen", () => {
    const src = synthetic(`  passed: "Взет",\n  failed: "Неиздържан",`, `"passed" | "failed"`);
    assert.equal(productPills(src, "(synthetic)").passed, "Взет");
  });

  it("a comment containing a quoted pill is not mistaken for an entry", () => {
    const src = synthetic(
      `  // the product's own words (\`sessionEndCtas.ts\` "не е взет", "взето")\n  passed: "Издържан",`,
      `"passed"`,
    );
    assert.deepEqual(productPills(src, "(synthetic)"), { passed: "Издържан" });
  });

  it("an unparseable entry is UNRESOLVED and throws — never an empty pass", () => {
    const src = synthetic(`  passed: SOME_CONST,`, `"passed"`);
    assert.throws(() => productPills(src, "(synthetic)"), /UNRESOLVED/);
  });

  it("a missing declaration is UNRESOLVED and throws", () => {
    assert.throws(() => productPills("export const OTHER = {};\n", "(synthetic)"), /UNRESOLVED/);
    assert.throws(() => productVerdictStates("// nothing here\n", "(synthetic)"), /UNRESOLVED/);
    assert.throws(() => drivelinePills("// nothing here\n", "(synthetic)"), /UNRESOLVED/);
  });

  it("a rewritten classifyVerdict is UNRESOLVED, not silently empty", () => {
    const src = `export function classifyVerdict(v) {\n  return TABLE[v] ?? "unknown";\n}\n`;
    assert.throws(() => drivelinePills(src, "(synthetic)"), /UNRESOLVED/);
  });

  it("an EXTRA classifier literal is seen", () => {
    const src = `export function classifyVerdict(v) {\n  if (v === "ИЗДЪРЖАН") return "pass";\n  if (v === "ОТКАЗАН") return "fail";\n  return "unknown";\n}\n`;
    assert.deepEqual(drivelinePills(src, "(synthetic)"), { "ИЗДЪРЖАН": "pass", "ОТКАЗАН": "fail" });
  });

  /* ── the two sources §C's comment reports on, driven on every run ────────
   * §C states four rows of measurement about `codePillLiterals`. These are
   * those rows, executed. A comment cannot rot into describing code that was
   * never shipped — which is the defect this pair replaces — while the sources
   * it quotes are built here and the answers are asserted. */
  const PRE_REPAIR_PILLS = ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН"];
  const asEscapes = (s) => [...s].map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join("");
  const preRepairCanary = (write) =>
    `const PILLS = [${PRE_REPAIR_PILLS.map((p) => `"${write(p)}"`).join(", ")}];\n`
    + `export const isPill = (v) => PILLS.includes(v);\n`;

  it("a pre-repair pill array written PLAINLY is caught", () => {
    const pills = Object.values(productPills(screenSrc)).map(asHarnessReadsIt);
    const hits = codePillLiterals(preRepairCanary((p) => p), pills);
    assert.equal(hits.length, 3, `expected all three plain literals, got ${JSON.stringify(hits)}`);
    assert.deepEqual(hits.map((h) => h.decoded), PRE_REPAIR_PILLS);
  });

  it("a pre-repair pill array written as \\u ESCAPES is caught too", () => {
    const pills = Object.values(productPills(screenSrc)).map(asHarnessReadsIt);
    const src = preRepairCanary(asEscapes);
    // The escapes are real, and their count is arithmetic, not a measurement:
    // one per letter, so eight for «ИЗДЪРЖАН».
    assert.ok(src.includes("\\u0418\\u0417"), `the fixture is not actually escaped: ${src.split("\n")[0]}`);
    assert.equal(asEscapes("ИЗДЪРЖАН").match(/\\u/g).length, 8);
    const hits = codePillLiterals(src, pills);
    assert.equal(hits.length, 3, `the decode stopped happening — an escaped copy is invisible again. Got ${JSON.stringify(hits)}`);
    assert.deepEqual(hits.map((h) => h.decoded), PRE_REPAIR_PILLS);
  });

  it("…and it is the DECODE that catches it: undecoded, the escaped form is invisible", () => {
    // The fourth row of §C's table, run rather than asserted in prose. This is
    // the scan with `JSON.parse` removed and nothing else changed.
    const pills = Object.values(productPills(screenSrc)).map(asHarnessReadsIt);
    const undecoded = (src) => {
      const found = [];
      for (const [, line] of codeLines(src)) {
        for (const m of line.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
          if (pills.includes(asHarnessReadsIt(m[0].slice(1, -1)))) found.push(m[0]);
        }
      }
      return found;
    };
    assert.equal(undecoded(preRepairCanary((p) => p)).length, 3, "the undecoded scan should still see PLAIN literals");
    assert.equal(undecoded(preRepairCanary(asEscapes)).length, 0, "if this is no longer 0, the contrast §C describes has gone and the comment must be re-measured");
  });

  it("a pill word inside a COMMENT is not a copy", () => {
    const pills = Object.values(productPills(screenSrc)).map(asHarnessReadsIt);
    const src = `// the old file compared against "ИЗДЪРЖАН"\n/*\n * and "НЕИЗДЪРЖАН" in a block comment\n */\nexport const ok = (v) => classifyVerdict(v) !== "unknown";\n`;
    assert.deepEqual(codePillLiterals(src, pills), []);
    assert.deepEqual(codeLines(src).map(([, l]) => l), ['export const ok = (v) => classifyVerdict(v) !== "unknown";']);
  });

  it("the harvest regex is parsed, and a MISSING pill in it is seen", () => {
    const three = harvestPills(`if (/^(издържан|неиздържан|незавършен)$/i.test(s)) {}`, "(synthetic)");
    assert.deepEqual(three, ["издържан", "неиздържан", "незавършен"]);
    const four = harvestPills(`if (/^(издържан|неиздържан|незавършен|не е взет)$/i.test(s)) {}`, "(synthetic)");
    assert.deepEqual(four, ["издържан", "неиздържан", "незавършен", "не е взет"]);
  });

  it("a harvest regex that was rewritten or duplicated is UNRESOLVED, never empty", () => {
    assert.throws(() => harvestPills("const V = PILLS.has(s);\n", "(synthetic)"), /UNRESOLVED/);
    assert.throws(
      () => harvestPills(`/^(издържан|неиздържан)$/i\n/^(незавършен|не е взет)$/i\n`, "(synthetic)"),
      /UNRESOLVED/,
    );
  });

  it("pillStemTokens sees the word and not the button beside it", () => {
    // «Завърши сесията» is the end-session control, not a pill: the stem is
    // «завършен», so it must not be tokenised. This is why §E does not red on
    // lesson-audit.mjs:9491.
    assert.deepEqual(pillStemTokens('for (const l of ["Завърши сесията", "Прекрати урока"]) {'), []);
    assert.deepEqual(
      pillStemTokens('ended: /Разбор|Резултат|Издържан|Неиздържан|Край на маршрута/.test(body),'),
      ["Издържан", "Неиздържан"],
    );
    // A `${…}` hole is code, so the words on either side stay separate.
    assert.deepEqual(
      pillStemTokens("say(`· ИЗДЪРЖАН ${rate.counts.pass} · НЕ Е ВЗЕТ ${rate.counts.lessonMistake}`);"),
      ["ИЗДЪРЖАН", "НЕ Е ВЗЕТ"],
    );
    // And a word the product stopped printing is still a token, which is the
    // only reason §E can fail at all.
    assert.deepEqual(pillStemTokens('if (v === "ВЗЕТ") return "pass";'), ["ВЗЕТ"]);
  });

  /* ── §F's parsers, driven over synthetic sources ────────────────────────
   * §F is only as good as these three, and a "does this file still name the
   * word" test is the easiest kind to make blind: a parser that returns the
   * empty set says "named nowhere" and reds honestly, but a parser that returns
   * everything says "named" forever and never reds again. Both directions are
   * driven here. */

  it("pillWordsList reads PILL_WORDS, and a DELETED word is seen", () => {
    const four = `export const PILL_WORDS = ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН", "НЕ Е ВЗЕТ"];\n`;
    assert.deepEqual(pillWordsList(four, "(synthetic)"), ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН", "НЕ Е ВЗЕТ"]);
    // The mutation this section exists for: the fourth entry removed, not
    // reworded. §E sees nothing to complain about — there is no stale word —
    // and this is what has to notice.
    const three = `export const PILL_WORDS = ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН"];\n`;
    assert.deepEqual(pillWordsList(three, "(synthetic)"), ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН"]);
    // An emptied oracle arrives as an empty list, not as an UNRESOLVED read:
    // `[]` parses, and §F must report it as the emptied list it is.
    assert.deepEqual(pillWordsList(`export const PILL_WORDS = [];\n`, "(synthetic)"), []);
  });

  it("pillWordsList decodes escapes, and is UNRESOLVED when the declaration is gone", () => {
    const esc = [...("ИЗДЪРЖАН")].map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join("");
    assert.deepEqual(pillWordsList(`export const PILL_WORDS = ["${esc}"];\n`, "(synthetic)"), ["ИЗДЪРЖАН"]);
    assert.throws(() => pillWordsList(`export const OTHER = ["ИЗДЪРЖАН"];\n`, "(synthetic)"), /UNRESOLVED/);
    assert.throws(() => pillWordsList(`export const PILL_WORDS = WORDS;\n`, "(synthetic)"), /UNRESOLVED/);
  });

  it("notTakenWord reads the declaration, and is UNRESOLVED when it is not there", () => {
    assert.equal(notTakenWord(`const NOT_TAKEN = "НЕ Е ВЗЕТ";\n`, "(synthetic)"), "НЕ Е ВЗЕТ");
    // A fold into another pill is a value change, not a parse failure — it has
    // to reach §F's equality to be reported as the fold it is.
    assert.equal(notTakenWord(`const NOT_TAKEN = "НЕИЗДЪРЖАН";\n`, "(synthetic)"), "НЕИЗДЪРЖАН");
    assert.throws(() => notTakenWord(`const TAKEN = "НЕ Е ВЗЕТ";\n`, "(synthetic)"), /UNRESOLVED/);
    assert.throws(() => notTakenWord(`const NOT_TAKEN = PILL_WORDS[3];\n`, "(synthetic)"), /UNRESOLVED/);
  });

  it("namedPillWords reads regexes and templates, not just string literals", () => {
    // The three shapes stale-claims.mjs actually uses, and only one of them is
    // a string literal.
    const inRegex = namedPillWords(`claims: (w) => /(?<!НЕ)ИЗДЪРЖАН with/u.test(w),\n`);
    assert.ok(inRegex.has("ИЗДЪРЖАН"), `a word inside a regex literal was not seen: ${JSON.stringify([...inRegex])}`);
    const inTemplate = namedPillWords("const base = `no right leg is credited ИЗДЪРЖАН any more`;\n");
    assert.ok(inTemplate.has("ИЗДЪРЖАН"), `a word inside a template literal was not seen: ${JSON.stringify([...inTemplate])}`);
    const inString = namedPillWords(`if (said(l) !== "НЕ Е ВЗЕТ") return null;\n`);
    assert.ok(inString.has("НЕ Е ВЗЕТ"), `a word inside a string literal was not seen: ${JSON.stringify([...inString])}`);
  });

  it("namedPillWords is not a blind yes — a file that stopped naming the word says so", () => {
    // The mutation §F's third assertion is written against: the hand-typed
    // word replaced by a constant, everything else the same.
    const gone = namedPillWords('claims: (w) => /(?<!НЕ)PASS with/u.test(w),\nif (said(l) !== PASS) return null;\n');
    assert.equal(gone.has("ИЗДЪРЖАН"), false, `the parser reported «ИЗДЪРЖАН» in a source that does not contain it — it answers yes to everything and §F can no longer fail. It said: ${JSON.stringify([...gone])}`);
    assert.deepEqual([...namedPillWords("export const x = 1;\n")], []);
  });

  it("namedPillWords normalises the whitespace pillStemTokens splits on", () => {
    // driveline.test.mjs:2979 writes the pill with U+00A0. The stem tokeniser
    // splits there and yields «взет», which is not a pill; the literal reading
    // collapses it. Both halves are asserted so neither can quietly go away.
    const nbsp = "НЕ Е ВЗЕТ";
    assert.deepEqual(pillStemTokens(`if (v === "${nbsp}") return "lessonMistake";`), ["ВЗЕТ"]);
    assert.ok(namedPillWords(`if (v === "${nbsp}") return "lessonMistake";\n`).has("НЕ Е ВЗЕТ"));
  });

  it("a pill word in a COMMENT is not a name either — the cross-lane coupling claim, executed", () => {
    // §E's header says an unrelated lane rewording a COMMENT cannot red this
    // file. This is that claim: the same stale word, once in a `//` line and
    // once in a block comment, is invisible to both readings the sweep uses.
    const commented = `// a judge brief once said "ВЗЕТО"\n/*\n * and "НЕ Е ВЗЕТА" in a block comment\n */\nexport const x = 1;\n`;
    assert.deepEqual(codeLines(commented).map(([, l]) => l), ["export const x = 1;"]);
    assert.deepEqual([...namedPillWords(commented)], []);
    // …while the same words in CODE are named, so the contrast is measured and
    // not merely asserted of the comment half.
    const inCode = `export const bad = ["ВЗЕТО", "НЕ Е ВЗЕТА"];\n`;
    assert.deepEqual([...namedPillWords(inCode)].sort(), ["ВЗЕТО", "НЕ Е ВЗЕТА"]);
  });
});
