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
import { corpusCounts, openListLine, workedLine } from "./finding-reader.mjs";
import { classifyLeg, tallyStates } from "./verdict-surface.mjs";

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
/**
 * THE DEFAULT WAS THE OLDEST ARCHIVE IN THE BUILDING, and it cost a round.
 *
 * This defaulted to `.audit-frames/wave-c/wave-c-results.jsonl` — the ORIGINAL
 * wave-c archive, photographed 2026-08-20 at commit 70d8651b. On 2026-08-30 it
 * was invoked without WAVEC_RESULTS and eight judges adjudicated 259 findings
 * against frames NINE DAYS and four sweeps old, while `w17` and `w18` frames
 * from that same morning sat unread.
 *
 * Since 70d8651b, platform/src had moved by 368 files and 69,153 insertions
 * over 31 commits. A batch-2 verifier caught it and put the cost plainly: nine
 * rows were declared UNJUDGEABLE for want of run.log and scrolled debrief pages
 * that had been written that morning. Both statements were true of the archive
 * and false of the harness.
 *
 * So the default is now the FRESHEST merged sweep, and the choice is printed.
 * A tool whose default is the stalest possible input will keep producing
 * confident answers about a product that no longer exists.
 */
function freshestResults() {
  const dir = path.join(REPO, ".audit-frames");
  let best = null;
  let bestAt = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return null; }
  for (const d of entries) {
    const f = path.join(dir, d, "wave-c-results.jsonl");
    if (!fs.existsSync(f)) continue;
    // A canary or probe directory holds one drive and is not a sweep.
    let rows = 0;
    try { rows = fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).length; } catch { continue; }
    if (rows < 5) continue;
    let at = 0;
    try { at = fs.statSync(f).mtimeMs; } catch { continue; }
    if (at > bestAt) { bestAt = at; best = f; }
  }
  return best;
}

const resultsPath = process.env.WAVEC_RESULTS || freshestResults();
if (!resultsPath) {
  console.error("[verdicts] no merged sweep found under .audit-frames — run phase 1 first.");
  process.exit(2);
}
if (!process.env.WAVEC_RESULTS) {
  const when = (() => {
    try { return fs.statSync(resultsPath).mtime.toISOString().slice(0, 16).replace("T", " "); } catch { return "?"; }
  })();
  console.log("[verdicts] judging against the FRESHEST sweep: " + resultsPath + "   (written " + when + ")");
  console.log("[verdicts] set WAVEC_RESULTS to override. The old default was the 2026-08-20 archive.");
}
if (!fs.existsSync(resultsPath)) {
  console.error("[verdicts] " + resultsPath + " not found — phase 1 has not been merged yet.");
  process.exit(2);
}

/**
 * THE DRIVE ROOT IS WHEREVER THE RESULTS FILE LIVES — never assume `wave-c`.
 *
 * The judge brief used to name `…\.audit-frames\wave-c\frames\…` in fixed text
 * while the results it reads came from `WAVEC_RESULTS`. The moment a sweep
 * merges anywhere else, every judge is sent to pictures from a superseded build
 * while reading a results file from the right one — and a judge who opens a
 * stale frame and writes STILL has made an error no later tool can detect.
 *
 * A sweep DOES have to merge elsewhere: on 2026-08-26, 219 of the 788 banked
 * retirements cited `(lesson, leg)` directories under `wave-c/frames/` that the
 * new sweep re-drives, so `wave-c-merge` correctly refuses that destination and
 * the drives land in their own directory.
 */
const DRIVE_ROOT = path.dirname(resultsPath);
const win = (p) => String(p).split("/").join(String.fromCharCode(92));

/**
 * THE ROUND TAG — without it, this round is silently outranked by the last one.
 *
 * wave-c-post ranks a line as roundOf(i)*2 + (correctedBy === "verify" ? 1 : 0),
 * and roundOf only advances at a line whose correctedBy is set to something
 * OTHER than "verify". So untagged judge lines join whatever round block
 * precedes them — and every  line already in that block outranks them,
 * however much older it is.
 *
 * MEASURED 2026-08-27: the last boundary was line 2723, so 1,628 lines shared
 * one block and w11-era verifiers were beating fresh w12 judgements. Two
 * verifiers found it independently. Tagging the round moved that adjudication
 * from 56 to 73 retirements.
 *
 * The tag is the drive directory the judges are reading, so it is unique per
 * sweep and needs no bookkeeping.
 */
const ROUND_TAG = path.basename(DRIVE_ROOT);
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
//
// THE **OPEN** LIST, NOT THE FILED CORPUS — 2026-08-21.
//
// This packed judges out of `loadStandingBroken()`, which is every finding ever
// filed. Run again today that is 1,043 findings, 375 of which a wave has
// already retired with a frame and a quote. Thirty judges would have been sent
// to re-adjudicate work that was finished, and the cheapest verdict to write
// about a symptom that is genuinely gone is CLOSED — so the round would have
// produced a large, confident, entirely redundant pile of closures while the
// 668 findings that are actually open got a proportionally smaller share of the
// attention. Judging capacity is the scarce thing in this programme; spending
// 36% of it on rows that had left the list is the reassuring direction.
const counts = corpusCounts();
const broken = counts.open;
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
  // WHY THIS IS NOT A TEST ON THE VERDICT STRING ANY MORE — 2026-08-21.
  //
  // It used to read: a verdict string means judge it; no verdict string means
  // «НЕЗАВЪРШЕН — unfinished; the debrief card IS there, read it». That was a
  // COMPENSATOR for a bug in the harness's matcher, which knew ИЗДЪРЖАН and
  // НЕИЗДЪРЖАН and could not read the third word the product prints. With the
  // matcher fixed at source, the branch survives with its cause removed: it now
  // fires only when a drive has no readable pill for one of the reasons that
  // are REAL PRODUCT DEFECTS — and tells a judge that defect is merely an
  // unfinished lesson whose card they should go and read.
  //
  // The ladder is in ./verdict-surface.mjs so this file and wave-c-merge.mjs
  // cannot drift apart, and it keys off `verdictSurface` in the lane's own
  // ledger, with the ABSENT case (a drive made before that field existed —
  // MEASURED: all 376 of the standing corpus) kept separate from every other
  // silence, because on that harness «НЕЗАВЪРШЕН» and a missing pill were
  // literally the same observation.
  const classified = usable.map((l) => classifyLeg(l));
  judgeable.push({
    ...e,
    judgeableLegs: classified.filter((c) => c.judgeable).length,
    states: classified.map((c) => c.state),
    legs: classified.map((c) => c.label),
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
// EVERY NUMBER IN THIS PREAMBLE IS COMPUTED, NOT TYPED. The version before this
// one told judges the corpus was "1,012 BROKEN" and "has never moved off 1,012",
// which had been false since Wave C retired 375 rows and since 31 new findings
// were filed. A fact pinned into an instruction goes stale while the
// instruction stays right, and a judge has no way to tell which half aged.
const PREAMBLE = [
  "You are one judge in Wave C of the Knijka.AI simulator audit (repo E:\\AI driver).",
  "",
  "THE SITUATION. 161 driving lessons were driven right and wrong, on an iPhone and a",
  "PC, and judged FROM THEIR OWN FRAMES. " + counts.n.filed + " BROKEN findings have been filed",
  "across the whole programme. " + counts.n.retired + " of them have since been RETIRED with a new",
  "frame and a quote, which leaves " + counts.n.open + " OPEN (" + counts.n.critical + " critical) across " +
    counts.n.lessons + " lessons and",
  counts.n.files + " suspect files. Those " + counts.n.open + " are what you are judging; the retired ones are",
  "finished and `finding-reader.mjs` will not print them unless you ask for --filed.",
  "",
  "Closing a finding needs proof that THAT FINDING is gone. File-level repair does not",
  "produce it, which is why fifteen rounds of it never moved the count.",
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
  "    " + win(DRIVE_ROOT) + "\\frames\\<lesson>__<platform>-<mode>\\*.png",
  "and the machine summary of each new drive is a JSON line in",
  "    " + win(resultsPath),
  "",
  "OPEN BOTH. A verdict written without looking at the new frame is a guess, and this",
  "programme has had three findings survive only until somebody replayed the trace",
  "instead of reading its title.",
  "",
  "-- THE CAR MAY NOT HAVE BEEN STEERED, AND THAT DECIDES YOUR VERDICT --",
  "MEASURED on the 2026-08-26 sweep: 77 of 82 `-right` legs STEERED (22-110 wheel",
  "commands each). 0 of 43 `-wrong` legs did. The drive path runs the steering loop",
  "only in its `roll` phase, and every MODE=wrong lane holds the throttle flat and",
  "never reaches it. Each leg's run.log says which it was, in capitals:",
  "    STEERING: 22 command(s) ...                    <- steered, judge normally",
  "    !! THIS DRIVE WAS NOT STEERED AND NOT MEASURED  <- read the next paragraph",
  "",
  "ON AN UNSTEERED LEG, any finding that turns on steering, lane position, parking,",
  "reversing, route progress or OBJECTIVE CREDITING is UNJUDGED — never STILL.",
  "«The objective did not tick» on a car that never turned the wheel is not a product",
  "defect; it is a description of the harness. Recording it as STILL retires nothing",
  "and puts a false row in the ledger. The run.log names the affected objectives.",
  "",
  "Copy, layout and paint defects ARE judgeable on an unsteered leg — the text on the",
  "glass does not depend on the wheel. Judge those normally.",
  "",
  "«guidance loop BLIND» is NOT «NOT-RUN». BLIND means the loop ran and could not see",
  "the guidance — that may itself be a defect worth filing. NOT-RUN on a",
  "vehicle-preparation lesson (sc-vp-*) is expected: the car is not meant to move.",
  "",
  "-- WHAT THE BRACKET AFTER A LEG MEANS --",
  "`mobile-right (ИЗДЪРЖАН)` reached a verdict card and a pill was read off it.",
  "A leg in [SQUARE BRACKETS] did not, and the bracket says why. NONE of them means",
  "'the lesson is unfinished' — «НЕЗАВЪРШЕН» is itself a pill and prints like one:",
  "",
  "  [VERDICT UNREADABLE BY THIS DRIVE'S HARNESS]  the drive predates the",
  "      three-verdict matcher, so «НЕЗАВЪРШЕН» and a result screen carrying NO",
  "      pill were literally the same observation. UNKNOWN — not unfinished, not a",
  "      defect. Judge what the frames and run.log DO show, and mark anything that",
  "      turns on the verdict itself UNJUDGED; only a re-drive settles it.",
  "  [PRODUCT DEFECT: no verdict pill]  the result screen mounted with no verdict",
  "      on it. FILE that as a finding. It closes nothing.",
  "  [PRODUCT DEFECT: no result surface]  the card was reached and there is no",
  "      result section in the DOM at all. Also a finding, also closes nothing.",
  "  [NO VERDICT CARD REACHED]  08-debrief.png is whatever was on the glass — on",
  "      two drives in this corpus a live cockpit with an unclicked РЕЗУЛТАТ",
  "      button. Do not read it as a debrief.",
  // THE TWO TAGS ADDED 2026-08-28, AND THE LEGEND THAT WAS MISSING THEM.
  // `classifyLeg` began emitting these the same day; this legend did not, so a
  // judge was told «the bracket says why» and handed a bracket with no entry —
  // losing, in particular, the DO-NOT-RE-DRIVE instruction on the second one.
  // A missing legend entry fails in the reassuring direction: an unexplained
  // tag reads as a minor caveat rather than as «there is no lesson in here».
  "  [THE DRIVE NEVER STARTED]  no cockpit ever answered. The folder photographs",
  "      something that is not a driving lesson — on the two known cases, the",
  "      PAYWALL, with top speed 0 км/ч and the guidance loop reporting NOT-RUN.",
  "      Judge NOTHING from it. It is not evidence about the product in either",
  "      direction, and the lane must be RE-DRIVEN. Beware the one ambiguity the",
  "      instrument cannot resolve: a lesson that crashes into its error boundary",
  "      leaves the SAME silence as a paywall, so if the frames show a broken",
  "      PRODUCT page rather than a sign-in wall, say so — that is a finding.",
  "  [THIS HARNESS CANNOT DRIVE THIS LESSON]  the cockpit was live and the car was",
  "      never in a driving gear. The known case is sc-vp-stall: the lesson",
  "      correctly starts in N with a manual box (templates-cockpit.ts sets",
  "      `start.openingTier: \"advanced\"` ON PURPOSE, so a clutch lesson is not",
  "      taught on an automatic).",
  "      THIS BRACKET CHANGED MEANING ON 2026-08-29 AND OLD LANES STILL CARRY IT.",
  "      The harness now HAS the three keys (KeyZ clutch, BracketRight/Left gears)",
  "      and drives this lesson: the spot check engaged N → M1 on its first attempt",
  "      and reached 30 км/ч, where three previous sweeps photographed 0. So:",
  "      · a lane driven BEFORE that date carries this bracket because the harness",
  "        could not work a clutch. Those rows are UNJUDGED and a RE-DRIVE settles",
  "        them — the opposite of what this brief said until today.",
  "      · a lane driven AFTER it that STILL carries the bracket means the gear",
  "        engagement failed and said so in run.log («this car is manual and sat in",
  "        N through 3 clutch+gear attempts»). That is a finding about the harness.",
  "      Check the drive's own date before choosing. If the run.log contains",
  "      «gearbox MANUAL, engaged N → …» the car was genuinely in gear.",
  "  [INSTRUMENT: the debrief reader threw] · [NO LEDGER] · [LEDGER DISAGREES WITH",
  "      THE ROW] · [UNRECOGNISED verdictSurface] · [THE HARNESS DIED MID-LANE] ·",
  "      [THE LANE ITSELF SAYS ITS EVIDENCE IS INCOMPLETE]  faults in THIS HARNESS.",
  "      They say nothing about the lesson in either direction and certify nothing.",
  "",
  "Until 2026-08-21 every one of these printed as «НЕЗАВЪРШЕН — unfinished; the",
  "debrief card IS there, read it», which sent judges to read a card that in some",
  "cases has no verdict on it. If you hold an older batch file, regenerate it.",
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
  " . ONE SAMPLE PER LEG MAY CONFIRM A DIVERGENCE, NEVER RETIRE ONE. A cross-leg",
  "   claim (\"pc-right books the fault, mobile-right books nothing\") now gets BOTH",
  "   legs driven at one commit — that is new as of 2026-08-31, and before it the",
  "   judge could only ever see half the sentence. But two debriefs agreeing is",
  "   n=1 per leg. The one time both halves previously existed in this corpus they",
  "   came out the INVERSE of the filed pattern, so a process that produces a",
  "   pattern and its inverse also produces agreement by chance. You may write",
  "   STILL or leave it open on one sample each; you may NOT write CLOSED. Retiring",
  "   a cross-leg row needs a repeat-rate the harness cannot yet take.",
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
  "    { findingId, lesson, severity, verdict, evidenceFrame, evidenceQuote, why,",
"      correctedBy: \"" + ROUND_TAG + "\" }",
"",
"correctedBy MUST be exactly \"" + ROUND_TAG + "\" on every line you write. It is not",
"decoration: the poster ranks a round by it, and an UNTAGGED line joins the",
"PREVIOUS round, where every older verify line outranks it. Leave it off and",
"your judgement is silently discarded in favour of a week-old one.",
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

console.log(openListLine(counts));
console.log(workedLine("open", broken));
console.log("judges          : " + judges.length + "   (target " + TARGET + " findings each)");
console.log("batches         : " + batches.length + "   (" + BATCH + " judges each = " + BATCH * 2 + " agents per workflow)");
console.log("findings judged : " + judgeable.reduce((a, e) => a + e.total, 0) + " of " + broken.length);
const sizes = judges.map((g) => g.total).sort((a, b) => a - b);
if (sizes.length) {
  console.log("per-judge min/median/max findings: " + sizes[0] + " / " + sizes[sizes.length >> 1] + " / " + sizes[sizes.length - 1]);
}

// WHAT THE JUDGES ARE ACTUALLY HOLDING. Printed unconditionally, because the
// number that matters is not "how many lessons went out" — it is how many of
// them carry a leg with a verdict on it. A run that hands out 145 lessons of
// which 55 have no readable verdict anywhere must not be summarised as 145
// judged; that is the reassuring direction and it is how «(none)» got
// compensated for in the first place.
const tally = tallyStates(judgeable.flatMap((e) => e.states.map((s) => ({ state: s }))));
const noVerdictLesson = judgeable.filter((e) => e.judgeableLegs === 0);
console.log("");
console.log("legs by state (certifiable legs only):");
for (const [state, n] of tally) if (n) console.log("  " + state.padEnd(16) + String(n).padStart(5));
console.log(
  "lessons with NO leg carrying a verdict: " + noVerdictLesson.length + " of " + judgeable.length +
    "   (" + noVerdictLesson.reduce((a, e) => a + e.total, 0) + " findings, " +
    noVerdictLesson.reduce((a, e) => a + e.critical, 0) + " critical)",
);
if (noVerdictLesson.length) {
  console.log("  Those findings are still worth judging off frames and run.log, but anything that");
  console.log("  turns on the verdict itself is UNJUDGED until the lesson is re-driven.");
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
