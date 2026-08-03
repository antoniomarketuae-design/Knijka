#!/usr/bin/env node
/**
 * Read-only status report for the founder review workflow.
 *
 * It used to print two numbers — "needs-review" and "approved" — and the second
 * one was a lie. The law-vs-bank audit (docs/education/90 §1) found 1,005 rows
 * marked `approved` that no human had ever read; the flag recorded that a
 * generator ran. So this report now prints the split that actually matters:
 *
 *   SIGNED    a person cleared this exact text (content/review/approvals.json)
 *   UNSIGNED  the row says "approved" and nobody's name is on it
 *
 * It also ranks the needs-review backlog BY RISK, against a git baseline, for
 * the same reason /review does: a queue of ~290 rows is not 290 equal decisions.
 * A handful have a moved ANSWER KEY — approve one of those wrongly and students
 * lose points for a right answer — and in curriculum order they sat on pages 8
 * to 12 of 13. This prints how many there are before anyone opens a browser.
 *
 * Usage: node scripts/review-status.mjs   (from platform/ or repo root)
 *        --base <ref>   compare against something other than HEAD
 * Never writes anything.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hashQuestionContent } from "../../tools/theory/question_hash.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(scriptDir, "..", "..", "content"),
  path.join(process.cwd(), "content"),
  path.resolve(process.cwd(), "..", "content"),
];
const contentDir = candidates.find((dir) => fs.existsSync(path.join(dir, "topics.json")));
if (!contentDir) {
  console.error(`Content directory not found. Looked in:\n  ${candidates.join("\n  ")}`);
  process.exit(1);
}

const questionsDir = path.join(contentDir, "questions");
if (!fs.existsSync(questionsDir)) {
  console.error(`No questions directory at ${questionsDir}`);
  process.exit(1);
}

// The signature ledger. Absent = nothing is human-approved, which is the honest
// reading of an absent ledger, not a reason to fall back to trusting the flag.
const ledgerFile = path.join(contentDir, "review", "approvals.json");
let ledger = { unsignedApprovedBaseline: 0, entries: [] };
if (fs.existsSync(ledgerFile)) {
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
  } catch {
    console.error(`WARNING: ${ledgerFile} is not valid JSON — treating every row as unsigned.`);
  }
}
const signatures = new Map(
  (Array.isArray(ledger.entries) ? ledger.entries : []).map((e) => [e.questionId, e]),
);

// ---------------------------------------------------------------------------
// The git baseline, for ranking the backlog by risk
// ---------------------------------------------------------------------------

const baseArg = process.argv.indexOf("--base");
const baseRef = baseArg >= 0 ? (process.argv[baseArg + 1] ?? "HEAD") : "HEAD";
const repoRoot = path.resolve(contentDir, "..");

/** The row as it stood at `baseRef`, keyed by question id. Empty = no baseline. */
const baselineRows = new Map();
let baselineOk = false;
for (const file of fs.readdirSync(questionsDir).sort()) {
  if (!file.endsWith(".json")) continue;
  let text;
  try {
    text = execFileSync("git", ["show", `${baseRef}:content/questions/${file}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
  } catch {
    continue; // not a repo, or the file did not exist at that ref
  }
  baselineOk = true;
  try {
    for (const row of JSON.parse(text)) {
      if (typeof row?.id === "string") baselineRows.set(row.id, row);
    }
  } catch {
    /* a malformed baseline is simply no baseline */
  }
}

/** The marked-correct option ids — the answer key, and nothing else. */
const answerKey = (row) =>
  (Array.isArray(row?.options) ? row.options : [])
    .filter((o) => o?.correct === true)
    .map((o) => String(o.id))
    .sort()
    .join(",");

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Must stay in step with content-admin/evidence.ts `classifyRisk`. */
function riskOf(q) {
  const before = baselineRows.get(q.id);
  if (!baselineOk) return "answer-text"; // unrankable is not the same as safe
  if (before === undefined) return "key-flip"; // never read by anyone
  if (answerKey(before) !== answerKey(q)) return "key-flip";
  if (
    !same(before.options, q.options) ||
    String(before.type) !== String(q.type) ||
    String(before.points) !== String(q.points)
  ) {
    return "answer-text";
  }
  if (String(before.textBg) !== String(q.textBg)) return "stem";
  if (String(before.explanationBg) !== String(q.explanationBg)) return "explanation";
  if (!same(before.lawRefs, q.lawRefs)) return "citation";
  return "untouched";
}

const RISK_BANDS = [
  ["key-flip", "answer key MOVED — can mark a right answer wrong"],
  ["answer-text", "a graded option's wording / type / points changed"],
  ["stem", "the question itself was re-asked"],
  ["explanation", "only the teaching text moved"],
  ["citation", "only article numbers were tidied"],
  ["untouched", "already queued before this wave; nothing changed"],
];

const rows = [];
const riskTally = Object.fromEntries(RISK_BANDS.map(([band]) => [band, 0]));
const keyFlips = [];
let totalQuestions = 0;
let totalNeedsReview = 0;
let totalSigned = 0;
let totalUnsigned = 0;

for (const file of fs.readdirSync(questionsDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const questions = JSON.parse(fs.readFileSync(path.join(questionsDir, file), "utf8"));
  if (!Array.isArray(questions)) continue;

  let needsReview = 0;
  let signed = 0;
  let unsigned = 0;
  for (const q of questions) {
    if (q?.status === "needs-review") {
      needsReview += 1;
      const band = riskOf(q);
      riskTally[band] += 1;
      if (band === "key-flip") {
        const before = baselineRows.get(q.id);
        keyFlips.push([
          q.id,
          before === undefined ? "(нов ред)" : answerKey(before),
          answerKey(q),
        ]);
      }
    }
    if (q?.status !== "approved") continue;
    const entry = signatures.get(q.id);
    if (entry && entry.verdict === "approved" && entry.contentHash === hashQuestionContent(q)) {
      signed += 1;
    } else {
      unsigned += 1;
    }
  }

  totalQuestions += questions.length;
  totalNeedsReview += needsReview;
  totalSigned += signed;
  totalUnsigned += unsigned;
  if (needsReview > 0 || unsigned > 0) {
    rows.push([file.replace(/\.json$/, ""), needsReview, signed, unsigned, questions.length]);
  }
}

console.log(`Review status — ${contentDir}\n`);
if (rows.length === 0) {
  console.log("  Every question carries a human signature — 0 remaining. 🎉");
} else {
  console.log(
    "  " + "topic".padEnd(28) + "needs-review".padStart(13) +
    "signed".padStart(9) + "UNSIGNED".padStart(10) + "total".padStart(8),
  );
  console.log("  " + "-".repeat(68));
  for (const [name, needs, signed, unsigned, total] of rows) {
    console.log(
      "  " + name.padEnd(28) + String(needs).padStart(13) +
      String(signed).padStart(9) + String(unsigned).padStart(10) + String(total).padStart(8),
    );
  }
}

if (totalNeedsReview > 0) {
  console.log(`\n  The ${totalNeedsReview}-row backlog, by what a wrong decision costs a student`);
  console.log(`  (vs ${baseRef}${baselineOk ? "" : " — NO BASELINE, everything ranked as unknown"})\n`);
  for (const [band, why] of RISK_BANDS) {
    if (riskTally[band] === 0) continue;
    console.log("  " + String(riskTally[band]).padStart(5) + "  " + band.padEnd(13) + why);
  }
  if (keyFlips.length > 0) {
    console.log(`\n  The ${keyFlips.length} moved answer keys — review these first:`);
    for (const [id, before, after] of keyFlips) {
      console.log("    " + id.padEnd(32) + String(before).padStart(7) + "  ->  " + after);
    }
  }
}

console.log(
  `\n  human-signed: ${totalSigned} of ${totalQuestions} — the only rows a student may be dealt as authoritative`,
);
console.log(
  `  "approved" with nobody's name on it: ${totalUnsigned} (frozen ceiling ${ledger.unsignedApprovedBaseline ?? 0})`,
);
console.log(`  waiting in the needs-review queue: ${totalNeedsReview}`);
console.log(`\n  Clear them at /review — it is the only thing that writes a signature.`);
