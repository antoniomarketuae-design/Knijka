#!/usr/bin/env node
/**
 * WAVE C PHASE 2 — emit the adjudication workflows.
 *
 * WHAT CHANGED FROM v1 AND WHY EACH CHANGE WAS FORCED
 *
 *  1. JUDGES GET ~35 FINDINGS, NOT ~105. v1 chunked by LESSON (15 each), which
 *     put ~105 findings in front of one agent. Every one needs two frames opened
 *     and compared. An agent given 105 will skim, and a skimmed CLOSED retires a
 *     real defect — the worst outcome this programme can produce. Packing is by
 *     FINDING count, greedy, because lessons carry between 1 and 20 each.
 *
 *  2. THE FINDINGS ARE READ BY A REAL SCRIPT. v1 embedded a twelve-line Node
 *     one-liner inside a workflow template literal, four levels of backslash
 *     escaping deep — and a mis-escaped snippet prints NOTHING rather than
 *     erroring, which reads to a judge exactly like "this lesson is clean".
 *
 *  3. EVERY VERDICT CARRIES A findingId. v1 asked for {lesson, what, ...}; the
 *     only join key back to the corpus was 737-character prose. The id is
 *     derived from content that already exists and is collision-free across all
 *     1,012 standing findings.
 *
 *  4. IT EMITS BATCHES. 29 judges + 29 verifiers in one workflow is 58 agents;
 *     batches of 6 keep each run readable and let one batch inform the next.
 *
 *  5. IT REFUSES TO HAND A JUDGE AN UNCERTIFIABLE DRIVE. A leg with a non-zero
 *     exit, or with treeMoved set, closes nothing — the harness says so itself.
 *     Those lessons are reported as unjudgeable instead of being quietly listed.
 *
 *   node tools/audit/make-verdicts2.mjs <outDir> [findingsPerJudge] [judgesPerBatch]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStandingBroken } from "./finding-reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [outDir, perRaw, batchRaw] = process.argv.slice(2);
if (!outDir) {
  console.error("usage: make-verdicts2.mjs <outDir> [findingsPerJudge=35] [judgesPerBatch=6]");
  process.exit(2);
}
const TARGET = Number(perRaw || 35);
const BATCH = Number(batchRaw || 6);

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

// --- where the re-drive landed ----------------------------------------------
// WAVEC_RESULTS exists so this generator can be dry-run against a partial merge
// WITHOUT writing a partial file to the path phase 2 will really read. A dry run
// that leaves half the corpus at the real path is how a judge ends up judging
// 40 lessons and reporting it as all of them.
const resultsPath = process.env.WAVEC_RESULTS || path.join(REPO, ".audit-frames", "wave-c", "wave-c-results.jsonl");
if (!fs.existsSync(resultsPath)) {
  console.error("[verdicts] " + resultsPath + " not found — phase 1 has not been merged yet.");
  process.exit(2);
}
const driven = new Map();
for (const line of fs.readFileSync(resultsPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const j = JSON.parse(line);
    const e = driven.get(j.lesson) || { legs: [], heads: new Set() };
    e.legs.push(j);
    e.heads.add(j.head);
    driven.set(j.lesson, e);
  } catch {
    /* a torn tail line is not a reason to drop the file */
  }
}

// --- what must be judged ------------------------------------------------------
const broken = loadStandingBroken();
const perLesson = new Map();
for (const j of broken) {
  const e = perLesson.get(j.scenario) || { lesson: j.scenario, total: 0, critical: 0 };
  e.total++;
  if (String(j.severity).toLowerCase() === "critical") e.critical++;
  perLesson.set(j.scenario, e);
}

const judgeable = [];
const skipped = [];
for (const e of perLesson.values()) {
  const d = driven.get(e.lesson);
  if (!d) {
    skipped.push({ ...e, why: "never driven" });
    continue;
  }
  const usable = d.legs.filter((l) => l.exit === 0 && !l.treeMoved);
  if (!usable.length) {
    skipped.push({ ...e, why: "driven, but no leg is certifiable" });
    continue;
  }
  // WHETHER A DEBRIEF WAS REACHED IS A QUESTION ABOUT THE FRAMES, NOT ABOUT THE
  // VERDICT STRING. The harness's own extractor knows only ИЗДЪРЖАН and
  // НЕИЗДЪРЖАН, so a lesson that ends «НЕЗАВЪРШЕН» — unfinished, no penalty
  // points, one star, with a FULL instructor debrief attached — is recorded as
  // `VERDICT: (none)`. Reading that as "no debrief" told judges to close nothing
  // on roughly a fifth of all drives, every one of which had captured
  // 08-debrief.png exactly like the drives that did report a verdict.
  judgeable.push({
    ...e,
    legs: usable.map((l) => {
      const reached = l.out && fs.existsSync(path.join(l.out, "08-debrief.png"));
      if (!reached) return l.leg + " [NO DEBRIEF FRAME — closes nothing]";
      if (l.verdict && l.verdict !== "(none)") return l.leg + " (" + l.verdict + ")";
      return l.leg + " (НЕЗАВЪРШЕН — unfinished; the debrief frame IS there, read it)";
    }),
  });
}

// --- pack judges by FINDING count, not by lesson count ------------------------
judgeable.sort((a, b) => b.total - a.total);
const judges = [];
for (const e of judgeable) {
  let home = judges.find((g) => g.total + e.total <= TARGET);
  if (!home) {
    home = { lessons: [], total: 0, critical: 0 };
    judges.push(home);
  }
  home.lessons.push(e);
  home.total += e.total;
  home.critical += e.critical;
}
judges.sort((a, b) => b.critical - a.critical || b.total - a.total);
judges.forEach((g, i) => {
  g.key = "judge-" + (i + 1);
});

const batches = [];
for (let i = 0; i < judges.length; i += BATCH) batches.push(judges.slice(i, i + BATCH));

// --- the prompt text ----------------------------------------------------------
// Built as arrays of plain strings and embedded with JSON.stringify, so there is
// no nested template literal anywhere. A stray backtick inside one terminated the
// v1 generator's output, and it was caught only by dry-running the generator.
const PREAMBLE = [
  "You are one judge in Wave C of the Knijka.AI simulator audit (repo E:\\AI driver).",
  "",
  "THE SITUATION. 161 driving lessons were driven right and wrong, on an iPhone and a",
  "PC, and judged FROM THEIR OWN FRAMES. 1,012 BROKEN findings were filed. Fifteen",
  "rounds of repair have since opened 126 of 138 suspect files and taken the",
  "never-opened criticals from 25 to 2 — and the standing count has never moved off",
  "1,012, because closing a finding needs proof that THAT FINDING is gone, and",
  "file-level repair does not produce it.",
  "",
  "Every lesson below has now been RE-DRIVEN on the repaired build, on a still tree,",
  "with the harness attesting the exact commit it measured. Your job is the",
  "adjudication: for each finding, did the repair actually reach the student?",
].join("\n");

const HOW = [
  "-- HOW TO READ YOUR FINDINGS --",
  "Nobody hands them to you. For each lesson below, run this and read every row:",
  "",
  "    node tools/audit/finding-reader.mjs <lesson-id>",
  "",
  "It prints, per finding: findingId, severity, what, the OLD frame, the OLD quote,",
  "the suspect file, and the original signals. CITE THE findingId VERBATIM in every",
  "verdict line you write — it is the only thing that joins your verdict back to the",
  "finding, and 300-character prose does not survive being retyped.",
  "",
  "THE OLD frames are the paths the reader prints (under .audit-frames/sweep161/).",
  "THE NEW frames from the re-drive are under",
  "    E:\\AI driver\\.audit-frames\\wave-c\\frames\\<lesson>__<platform>-<mode>\\*.png",
  "and the machine summary of each new drive is a JSON line in",
  "    E:\\AI driver\\.audit-frames\\wave-c\\wave-c-results.jsonl",
  "",
  "OPEN BOTH. A verdict written without looking at the new frame is a guess, and this",
  "programme has had three findings survive only until somebody replayed the trace",
  "instead of reading its title.",
].join("\n");

const RULES = [
  "",
  "-- HOW TO JUDGE --",
  "",
  "Exactly one verdict per finding, and neither of the last two is a failure:",
  "",
  "  CLOSED   - the symptom the finding describes is GONE on the new drive. Cite the",
  "             new frame and quote what it shows. The tests passing is not evidence:",
  "             the finding was filed off a photograph and it is closed off one.",
  "  STILL    - the symptom is still there. Say which frame and what it says.",
  "  REFUTED  - the finding was never true, or its stated mechanism is false. This",
  "             audit has closed several rows this way and they are worth as much as",
  "             fixes: a badge hidden by the deck that no stylesheet rule could",
  "             touch; a drive silent for its whole length that never reverses once;",
  "             a gate whose predicate no input could satisfy. If it is false, PROVE",
  "             it — do not just assert it.",
  "  UNJUDGED - the re-drive did not exercise this finding (wrong leg, drive cut",
  "             short, the manoeuvre never happened, no debrief was reached). Say",
  "             why. An honest UNJUDGED is worth far more than a hopeful CLOSED.",
  "",
  "THE RULES THAT DECIDE WHAT COUNTS AS EVIDENCE:",
  " . CREDIT IS READ OFF THE DEBRIEF. Never the task chip — it goes 2/2 then null on",
  "   session end whether or not anything ticked — and never a toast.",
  " . THE FRAME WINS. Every zero-defects report in this project was an instrument",
  "   bug, and every one of them lied in the REASSURING direction.",
  " . A FALSE REFUSAL IS AS BAD AS A FALSE CERTIFICATE. If the new drive now FAILS a",
  "   student who drove correctly, that is a finding, not a closure — file it.",
  " . CLOSED and REFUTED ARE NOT COUNTED unless the line carries BOTH evidenceFrame",
  "   and evidenceQuote. The poster downgrades an unevidenced one to UNJUDGED, so an",
  "   uncited closure is wasted work rather than a shortcut.",
  "",
  "-- WRITE YOUR VERDICTS --",
  "Append one JSON object per finding to",
  "    E:\\AI driver\\.audit-frames\\wave-c\\verdicts.jsonl",
  "with these fields:",
  "    { findingId, lesson, severity, verdict, evidenceFrame, evidenceQuote, why }",
  "One line per finding, append-only, NEVER rewrite the file — other judges are",
  "appending to it at the same moment. Every finding the reader printed gets exactly",
  "one line: a finding you leave out is indistinguishable from one you never saw.",
  "",
  "Report a count per verdict and the two or three that mattered most. DO NOT COMMIT.",
].join("\n");

const VERIFY = [
  "Adversarially check the verdicts just written for these lessons.",
  "",
  "Read the rows out of E:\\AI driver\\.audit-frames\\wave-c\\verdicts.jsonl (filter to",
  "your lessons) and ATTACK THE CLOSED ONES HARDEST. A wrong CLOSED is the worst",
  "outcome this programme can produce: it retires a real defect and puts a",
  "seventeen-year-old on a road believing something wrong was right. Default to NOT",
  "CLOSED whenever the evidence is thin.",
  "",
  " 1. DOES THE CITED FRAME SHOW WHAT THE VERDICT SAYS? Open it. A quote with no",
  "    frame, or a frame that does not contain the quote, is not evidence.",
  " 2. DID THE DRIVE EXERCISE THE FINDING AT ALL? Three rows in this audit survived",
  "    only until somebody replayed the trace: a drive silent for its whole length",
  "    that never reverses once, a badge hidden by the deck no rule could touch, a",
  "    gate no input could satisfy. A drive that ended early, or ran the wrong leg,",
  "    or never reached a debrief, closes NOTHING.",
  " 3. WAS CREDIT READ OFF THE DEBRIEF? Not the task chip, not a toast.",
  " 4. IS A CLOSURE ACTUALLY A NEW FALSE REFUSAL? A lesson that now fails a correct",
  "    drive is not fixed — it is broken the other way, and that is the founder's",
  "    own standing complaint about this simulator.",
  " 5. IS EVERY FINDING ACCOUNTED FOR? Run the reader for each lesson and check that",
  "    every findingId it prints has a verdict line. A missing line reads as not",
  "    judged, silently keeping a row open — or worse, hides that nobody looked.",
  "",
  "Overturn a row by APPENDING a corrected line with the same findingId plus",
  "correctedBy set to verify — the poster takes the corrected line over the",
  "original. Say plainly which verdicts you overturned and why.",
].join("\n");

// --- emit ---------------------------------------------------------------------
fs.mkdirSync(outDir, { recursive: true });
const J = (v) => JSON.stringify(v);
const written = [];

batches.forEach((group, bi) => {
  const n = bi + 1;
  const lanes = group.map((g) => ({
    key: g.key,
    lessons: g.lessons.map((e) => e.lesson),
    rows: g.lessons.map(
      (e) =>
        "  " + e.lesson + "  ->  " + e.critical + " critical / " + e.total +
        " findings   legs re-driven: " + e.legs.join(", "),
    ),
    total: g.total,
    critical: g.critical,
  }));

  const lines = [
    "export const meta = {",
    "  name: " + J("knijka-wave-c-verdicts-" + n) + ",",
    "  description: " +
      J(
        "Wave C phase 2 batch " + n +
          " - judge standing BROKEN findings against their re-drive: closed, still, refuted or unjudged",
      ) + ",",
    "  phases: [{ title: 'Judge' }, { title: 'Verify' }],",
    "}",
    "",
    "// Generated by tools/audit/make-verdicts2.mjs - edit the generator, not this file.",
    "",
    "const LANES = " + JSON.stringify(lanes, null, 2),
    "const PREAMBLE = " + J(PREAMBLE),
    "const HOW = " + J(HOW),
    "const RULES = " + J(RULES),
    "const VERIFY = " + J(VERIFY),
    "",
    "log('Wave C verdicts batch " + n + " - ' + LANES.length + ' judges / ' +",
    "  LANES.reduce((a, l) => a + l.total, 0) + ' findings / ' +",
    "  LANES.reduce((a, l) => a + l.critical, 0) + ' critical')",
    "",
    "phase('Judge')",
    "",
    "const out = await pipeline(",
    "  LANES,",
    "  (l) => agent(",
    "    [PREAMBLE, '', 'YOUR LESSONS (' + l.total + ' findings, ' + l.critical + ' critical):', ...l.rows, '', HOW, RULES].join('\\n'),",
    "    { label: l.key, phase: 'Judge' },",
    "  ).catch((e) => '(JUDGE DIED: ' + String(e && e.message ? e.message : e).slice(0, 200) + ')'),",
    "  (report, l) => agent(",
    "    [VERIFY, '', 'YOUR LESSONS:', ...l.rows, '', '-- THE JUDGE REPORT --', typeof report === 'string' ? report.slice(0, 6000) : '(returned nothing)'].join('\\n'),",
    "    { label: 'verify:' + l.key, phase: 'Verify' },",
    "  ).catch((e) => '(VERIFIER DIED: ' + String(e && e.message ? e.message : e).slice(0, 200) + ')'),",
    ")",
    "",
    "return { batch: " + n + ", judges: LANES.length, out }",
    "",
  ];

  const file = path.join(outDir, "verdicts-batch-" + n + ".js");
  fs.writeFileSync(file, lines.join("\n"));
  written.push({
    file,
    judges: lanes.length,
    findings: lanes.reduce((a, l) => a + l.total, 0),
    critical: lanes.reduce((a, l) => a + l.critical, 0),
  });
});

console.log("judges          : " + judges.length + "   (target " + TARGET + " findings each)");
console.log("batches         : " + batches.length + "   (" + BATCH + " judges each = " + BATCH * 2 + " agents per workflow)");
console.log("findings judged : " + judgeable.reduce((a, e) => a + e.total, 0) + " of " + broken.length);
const sizes = judges.map((g) => g.total).sort((a, b) => a - b);
if (sizes.length) {
  console.log("per-judge min/median/max findings: " + sizes[0] + " / " + sizes[sizes.length >> 1] + " / " + sizes[sizes.length - 1]);
}
for (const w of written) {
  console.log("  " + w.file + "   " + w.judges + " judges, " + w.findings + " findings, " + w.critical + " critical");
}
if (skipped.length) {
  const st = skipped.reduce((a, e) => a + e.total, 0);
  console.log("\n" + skipped.length + " lesson(s) carrying " + st + " finding(s) CANNOT be judged:");
  for (const e of skipped.slice(0, 25)) {
    console.log("   " + e.critical + "c/" + e.total + "  " + e.lesson + "   — " + e.why);
  }
  if (skipped.length > 25) console.log("   ...and " + (skipped.length - 25) + " more");
  console.log("\nThese stay OPEN. They are not closures and must never be counted as any.");
}
