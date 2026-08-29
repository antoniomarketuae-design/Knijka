#!/usr/bin/env node
/**
 * WAVE C PHASE 3 — emit a REPAIR wave from the rows a judge has confirmed.
 *
 * WHY THIS EXISTS AT ALL. On 2026-08-29 the programme measured itself and found
 * that THE LAST NINE COMMITS CONTAINED NO PRODUCT CODE — every one was harness,
 * audit tooling or docs. The standing order is "repair wave after repair wave";
 * what had actually been running was measurement wave after measurement wave.
 * `make-verdicts2.mjs` turns drives into verdicts. Nothing turned verdicts back
 * into REPAIRS, so the step was done by hand each time and therefore skipped.
 *
 * WHAT IT SELECTS, AND WHAT IT REFUSES TO SELECT.
 *
 *   STILL   -> a repair lane. A judge opened a frame and said the defect is there.
 *   PARTIAL -> NEVER. It means the row is compound: some clauses gone, some not.
 *              Handing it to a lane produces a repair against an unknown target.
 *              Split the row first (see the SPLIT tooling), then it becomes STILL.
 *   UNJUDGED-> NEVER. Nobody could tell. A lane sent at one of these spends a day
 *              proving what a drive would have shown in four minutes.
 *   CLOSED / REFUTED -> already retired.
 *
 * The verdict that counts is the EFFECTIVE one — originals first, corrections
 * last, last write wins — the same resolution order `wave-c-post.mjs` and
 * `verdict-coverage.mjs` use. Anything else and a closure a verifier already
 * overturned still reads as closed. That mattered on the day this was written:
 * of 56 raw closures in w17, 12 survived verification. Selecting on raw verdicts
 * would have sent lanes at 44 rows that were never repaired in the first place.
 *
 * ONE FILE PER LANE, AND THE FILE SETS ARE DISJOINT BY CONSTRUCTION. Two lanes
 * editing one file is how a whole round was lost once. A lane that needs another
 * lane's file reports the file, the line and the exact edit instead of making it.
 *
 * THE THREE CHECKS EVERY LANE CARRIES, each of which has cost a wave:
 *   1. VERIFY THE CAUSE. Every brief handed down in this programme has been wrong
 *      at least twice — one named a collider our own commit had repaired hours
 *      earlier; another batched 21 rows under a cause true of 5. A finding is a
 *      REPORT and a report is as stale as the day it was written.
 *   2. THE ADDRESS RULE. 66% of findings named a file that CANNOT contain the
 *      defect. Prove a non-test import chain to what /simulator renders BEFORE
 *      editing, or report the row as misrouted and repair nothing.
 *   3. THE DEAD-PREDICATE TEST. 51 of 82 audited repairs shipped a predicate
 *      NOTHING LIVE READS. Name the live consumer or you have not finished.
 *
 *   node tools/audit/make-repair-wave.mjs <outFile> [lanes=6] [rowsPerLane=8]
 *
 * Prints the lane table it chose so the selection can be argued with before it
 * is run. Writes a Workflow script; launch it with
 *   Workflow({ scriptPath: "<outFile>" })
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { corpusCounts, openListLine, workedLine } from "./finding-reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRepo() {
  let d = HERE;
  for (;;) {
    if (fs.existsSync(path.join(d, ".audit-frames", "findings"))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return process.cwd();
}
const REPO = findRepo();
const [outRaw, lanesRaw, perRaw] = process.argv.slice(2);
const OUT = outRaw || path.join(REPO, ".audit-frames", "repair-wave.js");
const MAX_LANES = Number(lanesRaw || 6);
const MAX_ROWS = Number(perRaw || 8);

const VERDICTS = path.join(REPO, ".audit-frames", "wave-c", "verdicts.jsonl");
if (!fs.existsSync(VERDICTS)) {
  console.error("[repair] no verdicts at " + VERDICTS + " — nothing has been judged yet.");
  process.exit(2);
}

const counts = corpusCounts();
const lines = fs.readFileSync(VERDICTS, "utf8").split("\n").filter((l) => l.trim());
const rows = [];
for (const l of lines) {
  try { rows.push(JSON.parse(l)); } catch { /* malformed lines are reported by verdict-coverage */ }
}
// Effective verdict — see the header. Originals first, corrections last.
const eff = new Map();
for (const r of rows) if (r.findingId && r.correctedBy !== "verify") eff.set(r.findingId, r);
for (const r of rows) if (r.findingId && r.correctedBy === "verify") eff.set(r.findingId, r);

const open = new Map(counts.open.map((j) => [j.findingId, j]));
const still = [];
for (const [id, v] of eff) {
  const j = open.get(id);
  if (!j) continue; // retired, or not on the open list
  if (String(v.verdict || "").toUpperCase() !== "STILL") continue;
  still.push({ ...j, judgeWhy: String(v.why || ""), judgeFrame: v.evidenceFrame || "" });
}

const byFile = new Map();
for (const j of still) {
  const e = byFile.get(j.suspectFile) || { file: j.suspectFile, rows: [], crit: 0 };
  e.rows.push(j);
  if (j.severity === "critical") e.crit += 1;
  byFile.set(j.suspectFile, e);
}
// Critical density first: a lane that fixes four criticals is worth more than one
// that fixes six minors, and the founder's list is read by severity.
const ranked = [...byFile.values()].sort((a, b) => b.crit - a.crit || b.rows.length - a.rows.length);
const lanes = ranked.slice(0, MAX_LANES).map((e, i) => ({
  key: "lane-" + (i + 1),
  file: e.file,
  rows: e.rows.slice(0, MAX_ROWS).map((r) => ({
    findingId: r.findingId,
    lesson: r.scenario,
    severity: r.severity,
    what: String(r.what || "").slice(0, 1800),
    frame: r.judgeFrame,
    why: r.judgeWhy.slice(0, 1200),
  })),
}));

console.log(openListLine(counts));
console.log(workedLine("open", still));
console.log("confirmed-STILL rows : " + still.length + "   over " + byFile.size + " file(s)");
if (!lanes.length) {
  console.error("[repair] nothing confirmed STILL — run an adjudication first.");
  process.exit(1);
}
const nRows = lanes.reduce((a, l) => a + l.rows.length, 0);
const nCrit = lanes.reduce((a, l) => a + l.rows.filter((r) => r.severity === "critical").length, 0);
console.log("lanes                : " + lanes.length + "   (" + nRows + " rows, " + nCrit + " critical)");
for (const l of lanes) {
  console.log(
    "  " + String(l.rows.length).padStart(2) + " rows (" +
      l.rows.filter((r) => r.severity === "critical").length + " crit)  " + l.file,
  );
}

const BRIEF = [
  "You are ONE REPAIR LANE in a Книжка.AI simulator repair wave. You own EXACTLY ONE FILE and",
  "you may edit NO OTHER SOURCE FILE. If your repair needs a change in someone else's file, DO",
  "NOT MAKE IT — report the file, the line and the exact edit in your answer instead. Two lanes",
  "editing one file is how this programme lost a whole round once.",
  "",
  "BEFORE YOU EDIT ANYTHING, THREE CHECKS. Each exists because skipping it has cost a wave.",
  "",
  " 1. VERIFY THE CAUSE. Every brief handed to a lane in this programme has been wrong at least",
  "    twice — one named a collider our own commit had already repaired hours earlier; another",
  "    batched 21 rows under a cause true of 5. The finding text below is a REPORT, and a report",
  "    is as stale as the day it was written. Reproduce the defect in the CURRENT source before",
  "    changing anything. If it is already gone, say so and write NO code — that is a successful",
  "    lane, not a failed one.",
  "",
  " 2. THE ADDRESS RULE. Prove a non-test import chain from your file to what /simulator actually",
  "    renders BEFORE editing. Measured on this corpus: 66% of findings named a file that CANNOT",
  "    contain the defect. If your file is not on a live path the row is MISROUTED — report the",
  "    correct address and repair nothing. A repair at the wrong address closes nothing and looks",
  "    exactly like progress.",
  "",
  " 3. THE DEAD-PREDICATE TEST — the most important one. Measured: 51 of 82 audited repairs in",
  "    this programme shipped a predicate that NOTHING LIVE READS. A function computing the right",
  "    answer that no runtime path calls is not a repair; it is a comment that type-checks. For",
  "    every change, name the live consumer — the component, the tick, the reducer that reads it —",
  "    and say how you verified it is reached. If you cannot name one, you have not finished.",
  "",
  "WHAT THE PRODUCT IS. A driving-education simulator for 17-18-year-olds in Bulgaria. North star:",
  "does this produce a SAFER, MORE COMPETENT REAL DRIVER? Requirement-zero (doc 64 THEO-4,",
  "founder-ratified): every judgement must EXPLAIN ITSELF — a bare correct/wrong verdict is itself",
  "a defect. Bulgarian legal text is RETRIEVED and cited, never free-recalled (ADR-002); if a",
  "repair needs a lawRef you cannot find in the content bank, leave it and say so.",
  "",
  "HOUSE RULES. TypeScript, strict. Modules talk only through their public index.ts. Business",
  "logic out of components. Match the surrounding comment density and idiom — this codebase",
  "explains WHY at length, and a silent repair in a file full of reasoning is itself a regression.",
  "",
  "NEVER RUN GIT. Do not commit, do not push, do not stash, do not run wave-cycle.sh, do not",
  "touch platform/.env. Leave your edit in the working tree and describe it — the integrator",
  "gates the whole wave and commits it through tools/audit/wave-cycle.sh, which is the only",
  "thing that restamps NEXT_PUBLIC_COMMIT_SHA and restarts the server. On 2026-08-29 a",
  "hand-rolled git commit skipped that restamp and six drives died at EXIT_TARGET_UNVERIFIED",
  "against a server still attesting the previous commit. A lane that commits also makes the",
  "adversarial verifier unable to tell your change from everything else in the tree.",
  "",
  "GATES. Your edit must survive, from platform/: npx tsc --noEmit · npx vitest run --maxWorkers=2",
  "· node platform/scripts/validate-content.mjs · node platform/scripts/tools-tests.mjs. THREE",
  "STANDING REDS are expected (2 vitest: t-accidents content-bank and l-accidents-first-aid",
  "compose, both founder-blocked on 29 first-aid signatures; 1 tools-test: the deck-captions",
  "freeze). Anything else red is yours. Run tsc and the vitest files touching your area.",
  "",
  "TRAPS IN THIS REPO, all measured, all of which have produced phantom diffs or false errors:",
  " · Both CRLF and LF conventions exist; core.autocrlf is false. After editing, check that",
  "   'git diff --shortstat <file>' equals 'git diff --shortstat --ignore-cr-at-eol <file>'. A",
  "   mismatch means you rewrote every line and your real change is invisible in review.",
  " · 'grep -oP' silently returns EMPTY on this box (unibyte/UTF-8 locale error). Use sed.",
  " · In a template literal, a backslash-b is a BACKSPACE, not a word boundary.",
  "",
  "YOUR ANSWER IS A REPORT, not a message. Per row: REPAIRED / ALREADY-FIXED / MISROUTED (with the",
  "correct address) / REFUTED (not a defect, with proof) / BLOCKED (needs another lane's file —",
  "give file, line, exact edit). For every REPAIRED row name the live consumer you verified. State",
  "plainly if you changed nothing.",
].join("\n");

const laneBrief = (l) =>
  BRIEF + "\n\nYOUR FILE: " + l.file + "\nYOUR ROWS (" + l.rows.length + "):\n" +
  l.rows.map((r, i) =>
    "\n--- ROW " + (i + 1) + ": " + r.findingId + "  [" + r.severity + "]  lesson " + r.lesson + "\n" +
    "THE FINDING:\n" + r.what + "\n" +
    "A JUDGE CONFIRMED IT IS STILL PRESENT, citing " + (r.frame || "(no frame)") + ":\n" + r.why + "\n",
  ).join("");

const VERIFY = [
  "ADVERSARIAL VERIFIER. A repair lane has just worked on __FILE__. Your job is to REFUTE its",
  "claims, not confirm them. Default to 'not repaired' when the evidence is thin — a wrong",
  "'repaired' retires a real defect and puts a seventeen-year-old on a road believing something",
  "wrong was right.",
  "",
  "CHECK, IN THIS ORDER:",
  " 1. THE DEAD-PREDICATE TEST. For each claimed repair, trace the live import chain YOURSELF from",
  "    the edited symbol to something /simulator renders or ticks. 51 of 82 audited repairs in this",
  "    programme shipped a predicate nothing reads. If nothing live reads it, the row is NOT repaired.",
  " 2. Does the diff do what the report says? Read the diff for the file yourself.",
  " 3. Did it break a correct drive? A lesson that now fails a GOOD driver is not fixed, it is broken",
  "    the other way — the founder's own standing complaint about this simulator.",
  " 4. Gates: 'npx tsc --noEmit' from platform/, plus the vitest files covering this area. Three",
  "    standing reds are expected; anything else belongs to this lane.",
  " 5. Requirement-zero: if the repair adds or changes a judgement the student sees, does it EXPLAIN",
  "    itself? A bare verdict is itself a defect here.",
  " 6. CRLF: confirm 'git diff --shortstat' equals 'git diff --shortstat --ignore-cr-at-eol'.",
  "",
  "Report per row: CONFIRMED-REPAIRED / NOT-REPAIRED (why) / DEAD-CODE / REGRESSION-RISK. Be",
  "specific and quote what you read. If the lane changed nothing and was right to, say so.",
].join("\n");

const script =
  "export const meta = {\n" +
  "  name: \"knijka-repair-wave\",\n" +
  "  description: \"Repair wave — " + nRows + " confirmed-STILL rows across " + lanes.length + " files, one lane per file\",\n" +
  "  phases: [{ title: \"Repair\" }, { title: \"Verify\" }],\n" +
  "}\n\n" +
  "// Generated by tools/audit/make-repair-wave.mjs — edit the generator, not this file.\n" +
  "// THE CENSUS THIS WAVE WAS BUILT FROM. A lane reads this file days after it\n" +
  "// was generated, and the number it is handed is the number that matters. A\n" +
  "// stamp printed once on stdout and thrown away is not a record, so\n" +
  "// count-agreement.mjs requires it HERE, in the artefact itself.\n" +
  "// " + openListLine(counts) + "\n" +
  "// " + workedLine("open", still) + "\n" +
  "// Rows are INLINED because workflow scripts have no filesystem access.\n" +
  "const LANES = " + JSON.stringify(lanes.map((l) => ({ key: l.key, file: l.file, brief: laneBrief(l) })), null, 1) + ";\n" +
  "const VERIFY = " + JSON.stringify(VERIFY) + ";\n\n" +
  "phase(\"Repair\");\n" +
  "// pipeline, not parallel: each lane's verifier starts the moment THAT lane lands,\n" +
  "// instead of every verifier waiting on the slowest repair.\n" +
  "const done = await pipeline(\n" +
  "  LANES,\n" +
  "  (l) => agent(l.brief, { label: \"repair:\" + l.file.split(\"/\").pop(), phase: \"Repair\" }),\n" +
  "  (report, l) =>\n" +
  "    agent(\n" +
  "      VERIFY.split(\"__FILE__\").join(l.file) +\n" +
  "        \"\\n\\nTHE LANE'S REPORT:\\n\" + (report || \"(the lane returned nothing)\"),\n" +
  "      { label: \"verify:\" + l.file.split(\"/\").pop(), phase: \"Verify\" },\n" +
  "    ).then((v) => ({ file: l.file, report, verdict: v })),\n" +
  ");\n\n" +
  "return { lanes: done.filter(Boolean).length, results: done.filter(Boolean) };\n";

fs.writeFileSync(OUT, script);
console.log("wrote " + OUT + "   (" + Math.round(script.length / 1024) + " KB)");
console.log("launch with:  Workflow({ scriptPath: " + JSON.stringify(OUT.split("\\").join("/")) + " })");
