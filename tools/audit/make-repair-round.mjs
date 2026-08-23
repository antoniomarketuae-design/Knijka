#!/usr/bin/env node
/**
 * Emit a repair-round workflow for the next N files on the open list.
 *
 * WHY THIS IS A GENERATOR AND NOT A HAND-WRITTEN SCRIPT PER ROUND. Rounds 1 and
 * 2 were written by hand and the briefs drifted between them — round 2 gained
 * three hard-won warnings round 1 lacked, and any round written from scratch
 * will forget one. The brief is the part that carries the lessons this audit has
 * paid for; it belongs in one place.
 *
 *   node tools/audit/make-repair-round.mjs <n> <out.js> [lanes]
 *
 * `n` is the round number (used in the workflow name only). Lanes are chosen
 * from the CURRENT open list by critical count, skipping files already repaired
 * and everything under tools/ — the instrument is not the product, and a lane
 * told to fix a finding will otherwise "fix" the harness so the finding goes
 * away.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOpenFindings, corpusCounts, openListLine, workedLine } from "./finding-reader.mjs";

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

const [nRaw, outPath, lanesRaw] = process.argv.slice(2);
if (!nRaw || !outPath) {
  console.error("usage: make-repair-round.mjs <roundNumber> <out.js> [lanesPerRound=6]");
  process.exit(2);
}
const ROUND = Number(nRaw);
const LANE_COUNT = Number(lanesRaw || 6);

/** Files a previous round already owned. Kept here so the generator is the record. */
const REPAIRED = new Set([
  "platform/src/modules/sim/rules/engine.ts",
  "platform/src/modules/sim/lessons/objectives.ts",
  "platform/src/components/sim/TouchControls.tsx",
  "platform/src/modules/sim/lessons/finish.ts",
  "platform/src/modules/sim/lessons/scenario/templates-parking3.ts",
  "platform/src/modules/sim/devrig/driveScript.ts",
  "platform/src/modules/sim/lessons/debrief.ts",
  "platform/src/modules/sim/lessons/scenario/templates-vru.ts",
  "platform/src/modules/sim/lessons/scenario/rubric.ts",
  "platform/src/modules/sim/lessons/scenario/templates-lanes.ts",
  "platform/src/modules/sim/lessons/scenario/templates-following.ts",
  // round 3
  "platform/src/modules/sim/world/builders/buildWorldGeometry.ts",
  "platform/src/modules/sim/lessons/scenario/templates-lanes2.ts",
  "platform/src/modules/sim/environment/weather.ts",
  "platform/src/modules/sim/collision/index.ts",
  "platform/src/modules/sim/lessons/scenario/templates-conditions.ts",
  "platform/src/modules/sim/scenarios/coach.ts",
]);

const open = loadOpenFindings();
const byFile = new Map();
for (const f of open) {
  const k = f.suspectFile || "unknown";
  const e = byFile.get(k) || { file: k, total: 0, critical: 0, lessons: new Set() };
  e.total++;
  if (String(f.severity).toLowerCase() === "critical") e.critical++;
  e.lessons.add(f.scenario);
  byFile.set(k, e);
}
const lanes = [...byFile.values()]
  .filter((e) => !REPAIRED.has(e.file) && !e.file.startsWith("tools/") && e.file !== "unknown")
  .sort((a, b) => b.critical - a.critical || b.total - a.total)
  .slice(0, LANE_COUNT)
  .map((e) => ({ file: e.file, critical: e.critical, total: e.total, lessons: [...e.lessons] }));

if (!lanes.length) {
  console.error("no product files left with open findings — the list is closed or only tools/ remains");
  process.exit(1);
}

/**
 * THE BRIEF. Every paragraph here was bought by a round that went wrong without
 * it. Add to it; do not trim it.
 */
const PREAMBLE = [
  "Repo E:/AI driver. Knijka.AI — a Bulgarian driving academy whose browser simulator teaches",
  "17-18 year olds to drive. You are repairing real defects in it.",
  "",
  "WHY YOU SHOULD BELIEVE THESE FINDINGS. 161 lessons were driven right and wrong, on a phone and a",
  "PC, and judged FROM THEIR OWN FRAMES — photographs of the product, not test output. Over a",
  "thousand defects were filed that way, and more than four hundred have been retired, each with a",
  "frame and a quote proving the symptom is gone.",
  "",
  "AND THEY SURVIVED THE HARDEST OBJECTION AVAILABLE. Every drive behind them was made by a harness",
  "that could only accelerate and brake — it could not steer — so the fair objection was that the CAR",
  "was failing, not the product. The harness was taught to steer and the 92 worst lessons were",
  "re-driven: 13 turned out to be instrument artifacts, 79 still fail with the car driving properly.",
  "",
  "THE NORTH-STAR TEST FOR EVERY CHANGE: does this produce safer, more competent real drivers? And",
  "doc 64 THEO-4, requirement zero: the product must act as a virtual instructor that EXPLAINS every",
  "decision. A bare verdict with no reason is itself a defect, never a fix.",
].join("\n");

const HOW = [
  "",
  "== HOW TO READ YOUR FINDINGS ==",
  "",
  "    node tools/audit/finding-reader.mjs --file <your file>",
  "",
  "prints every OPEN finding whose suspectFile is yours: a stable findingId, severity, what was seen,",
  "the frame it was seen on, the exact quote, the drive signals. Retired findings are excluded by",
  "default. If a count of yours disagrees with the reader, THE READER IS RIGHT — five tools once gave",
  "four different answers and a repair lane spent itself re-fixing 370 rows already closed.",
  "",
  "OPEN THE FRAMES. They are photographs of the defect. A fix aimed at the words of a finding rather",
  "than at what the frame shows is how this programme has wasted whole rounds.",
  "",
  "== WHAT COUNTS AS A FIX ==",
  " . THE ROOT CAUSE, not the symptom. Several findings on one file are usually one bug.",
  " . A TEST YOU WATCHED GO RED. Write it, break the fix, confirm red, restore, confirm green. An",
  "   assertion never seen red is decoration — this repo shipped a test file whose central claim was",
  "   false while all 8 of its tests passed.",
  " . GUARD YOUR CONSTANTS. Round 1 shipped a 20 m threshold carrying four hundred words of",
  "   justification; setting it to zero, or deleting its clause outright, left all 798 rules tests",
  "   GREEN. If a number matters, a mutation of it must go red.",
  " . A SOURCE-TEXT GREP IS NOT A TEST. A substring catches deletion, never neutralisation.",
  "",
  "== WHAT WILL NOT BE ACCEPTED ==",
  " . Weakening or deleting an existing assertion to make something pass.",
  " . Touching any content `status` field. 0 of 1,089 questions are human-signed and ONLY the founder",
  "   signs content. The two red vitest tests (ptp-i-parva-pomosht 31/64, l-accidents-first-aid) are",
  "   red ON PURPOSE for that reason — leave them.",
  " . Editing a file another lane owns. Report what you need instead.",
  " . FIXING THE HARNESS TO MAKE A FINDING GO AWAY. Everything under tools/ is the INSTRUMENT.",
  " . A FIX THAT TAKES SOMETHING AWAY. Round 1 closed a rule act 'forever' and thereby deleted the",
  "   commendation a student earns by reversing and re-approaching correctly. Ask what your change",
  "   removes, not only what it adds.",
  "",
  "== FOUR FACTS ABOUT THE EVIDENCE THAT WILL MISLEAD YOU IF YOU DO NOT KNOW THEM ==",
  " . THE DEBRIEF TALLY UNDER-REPORTS FAULTS. On sc-mw-min-speed four bookings were verified frame by",
  "   frame against a tally reading «Опасни 1/10, Основни 0/0, Второстепенни 0/0». «0 наказателни",
  "   точки» proves nothing was TALLIED. Never use a zero tally as evidence a rule works.",
  " . THE CORRECT DRIVE CRAWLS BECAUSE THE HARNESS MAKES IT CRAWL. lesson-audit.mjs runs CRUISE_KMH",
  "   12 / ROLL_MS 4000 / STOP_MS 3000 in RIGHT mode only, producing a saw-tooth peaking at ~14 km/h",
  "   on every lesson. The same lesson's WRONG leg ramps to 135. If a finding's evidence is 'the",
  "   correct drive never exceeds 14 km/h', that is the instrument — but anything the product DID",
  "   with that drive (credited it, starred it, said nothing) is still the product.",
  " . THE GUIDANCE RIBBON IS A ROAD CENTRELINE, NOT A LANE (guidanceRoute.ts). No lane-position claim",
  "   can be settled from a steered drive in either direction.",
  " . THE UNSUFFIXED 08-debrief.png IS A VIEWPORT SHOT. Route ticks, «Похвали» and «Разбор» live in",
  "   08-debrief-p2..pN.png; each drive dir carries _audit-debrief.json with the fold map. Five",
  "   retirements had to be re-cited for quoting text that was not on the frame they named.",
  "",
  "Frames: .audit-frames/wave-c/frames/<lesson>__<platform>-<mode>/ (unsteered),",
  ".audit-frames/rebase/frames/<lesson>__<platform>-right/ and .audit-frames/proof-*/frames/",
  "(steered). Each holds _audit-status.json, _audit-debrief.json, run.log and the debrief pages.",
  "",
  "Gates before you report: npx tsc --noEmit, npx vitest run --maxWorkers=2,",
  "node platform/scripts/validate-content.mjs, node platform/scripts/tools-tests.mjs. Never pipe them",
  "and never read a wrapper exit code — read each command own status. If you change a template, check",
  "whether clipPlan.generated.ts went stale (tools/clips/gen_clip_plan.mjs regenerates it) — round 2",
  "moved a cyclist and silently staled a generated artifact and a frozen hazard clip downstream.",
  "",
  "DO NOT COMMIT. Report what you fixed, what you could not, and what you left alone deliberately.",
].join("\n");

const VERIFY = [
  "You are an ADVERSARIAL VERIFIER for the repairs just made to this file.",
  "",
  "Every round of this programme has come back PARTIAL and every one of those PARTIALs was correct.",
  "In one, a fixer reported 'harness restored byte-for-byte' and 'census green on the exact shipping",
  "bytes' while two tests were RED and every drive from that tree was blind. READ THE TREE, not the",
  "report. In another, the fix clamped a car from 49 km/h to 9.8 and deleted 230 m of road —",
  "manufacturing the very defect it was sent to cure.",
  "",
  " 1. Does each claimed fix change what a STUDENT sees? Open the frame the finding was filed from",
  "    and reason about what the new code renders there.",
  " 2. Take each new test and BREAK the code it guards. Does it go red? Try the CONSTANTS too.",
  " 3. Was any existing assertion weakened or deleted to make something pass?",
  " 4. Did the fix take anything AWAY — a commendation, an explanation, a fault that should still",
  "    book? A repair that trades a false negative for a false positive has moved the defect.",
  " 5. Did it reach for a file it does not own, or 'fix' the harness so a finding disappears?",
  " 6. Run the gates yourself and read each command own exit status, never a pipe. The two",
  "    content-signature failures are red on purpose.",
  "",
  "Say plainly in one line at the top: FIXED, PARTIAL or NOT FIXED — then the evidence. Repair small",
  "things clearly within this file and say so. DO NOT COMMIT.",
].join("\n");

const counts = corpusCounts();
const STAMP = openListLine(counts);
const WORKED = workedLine("open", lanes.flatMap((l) => open.filter((f) => (f.suspectFile || "unknown") === l.file)));

const J = (v) => JSON.stringify(v);
const script = [
  "export const meta = {",
  "  name: " + J("knijka-repair-" + ROUND) + ",",
  "  description: " + J("Repair round " + ROUND + " — " + lanes.length + " files carrying " + lanes.reduce((a, l) => a + l.critical, 0) + " open criticals") + ",",
  "  phases: [{ title: 'Fix' }, { title: 'Verify' }],",
  "}",
  "",
  "// Generated by tools/audit/make-repair-round.mjs — edit the generator, not this file.",
  "//",
  "// PROVENANCE. A generated round that does not say which corpus produced it can be",
  "// run weeks later against a list that has moved, and nothing will look wrong. The",
  "// first line is what the corpus WAS; the second is what THIS round operates on.",
  "// tools/audit/count-agreement.mjs refuses any corpus-reading tool that omits them.",
  "// " + STAMP,
  "// " + WORKED,
  "",
  "const LANES = " + JSON.stringify(lanes, null, 2),
  "const PREAMBLE = " + J(PREAMBLE),
  "const HOW = " + J(HOW),
  "const VERIFY = " + J(VERIFY),
  "",
  "log('Repair round " + ROUND + " — ' + LANES.length + ' lanes / ' +",
  "  LANES.reduce((a, l) => a + l.critical, 0) + ' criticals / ' +",
  "  LANES.reduce((a, l) => a + l.total, 0) + ' findings')",
  "",
  "phase('Fix')",
  "",
  "const out = await pipeline(",
  "  LANES,",
  "  (l) => agent([PREAMBLE, '', '== YOUR FILE ==', '    ' + l.file, '',",
  "    'It carries ' + l.critical + ' open critical finding(s) of ' + l.total + ' total, across ' +",
  "    l.lessons.length + ' lesson(s). You own that file and its tests. Nothing else.', HOW].join('\\n'),",
  "    { label: 'fix:' + l.file.split('/').pop(), phase: 'Fix' })",
  "    .catch((e) => '(FIXER DIED: ' + String(e && e.message ? e.message : e).slice(0, 200) + ')'),",
  "  (report, l) => agent([PREAMBLE, '', VERIFY, '', '== THE FILE ==', '    ' + l.file, '',",
  "    '--- WHAT THE FIXER REPORTED ---',",
  "    typeof report === 'string' ? report.slice(0, 6000) : '(returned nothing)'].join('\\n'),",
  "    { label: 'verify:' + l.file.split('/').pop(), phase: 'Verify' })",
  "    .catch((e) => '(VERIFIER DIED: ' + String(e && e.message ? e.message : e).slice(0, 200) + ')'),",
  ")",
  "",
  "return { round: " + ROUND + ", lanes: LANES.length, out }",
  "",
].join("\n");

fs.writeFileSync(outPath, script);
console.log("wrote " + outPath);
console.log("round " + ROUND + ": " + lanes.length + " lanes, " +
  lanes.reduce((a, l) => a + l.critical, 0) + " criticals, " +
  lanes.reduce((a, l) => a + l.total, 0) + " findings");
for (const l of lanes) console.log("   " + String(l.critical).padStart(2) + "c/" + String(l.total).padStart(2) + "  " + l.file);
