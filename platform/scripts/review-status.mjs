#!/usr/bin/env node
/**
 * Read-only status report for the founder review workflow: how many theory
 * questions still carry status "needs-review", broken down by topic file.
 * Handy for confirming that /review writes landed without opening the app.
 *
 * Usage: node scripts/review-status.mjs   (from platform/ or repo root)
 * Never writes anything.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

const rows = [];
let totalNeedsReview = 0;
let totalApproved = 0;
let totalQuestions = 0;

for (const file of fs.readdirSync(questionsDir).sort()) {
  if (!file.endsWith(".json")) continue;
  const questions = JSON.parse(fs.readFileSync(path.join(questionsDir, file), "utf8"));
  if (!Array.isArray(questions)) continue;
  const needsReview = questions.filter((q) => q?.status === "needs-review").length;
  const approved = questions.filter((q) => q?.status === "approved").length;
  totalNeedsReview += needsReview;
  totalApproved += approved;
  totalQuestions += questions.length;
  if (needsReview > 0) rows.push([file.replace(/\.json$/, ""), needsReview, approved, questions.length]);
}

console.log(`Review status — ${contentDir}\n`);
if (rows.length === 0) {
  console.log("  All theory questions reviewed — 0 remaining. 🎉");
} else {
  console.log("  " + "topic".padEnd(28) + "needs-review".padStart(13) + "approved".padStart(10) + "total".padStart(8));
  console.log("  " + "-".repeat(59));
  for (const [name, needs, approved, total] of rows) {
    console.log("  " + name.padEnd(28) + String(needs).padStart(13) + String(approved).padStart(10) + String(total).padStart(8));
  }
}
console.log(
  `\n  remaining needs-review: ${totalNeedsReview} · approved: ${totalApproved} · total questions: ${totalQuestions}`,
);
