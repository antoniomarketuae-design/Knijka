#!/usr/bin/env node
/**
 * Did every finding actually get judged, and is every verdict line well formed?
 *
 * WHY THIS IS SEPARATE FROM THE POSTER. wave-c-post.mjs answers "what do the
 * verdicts say"; this answers "did anyone look". They are different questions
 * and the second one is the one this programme has historically got wrong: 985
 * findings were lost once by passing them through a channel nobody checked, and
 * a judge that skips a finding produces exactly the same output as a judge that
 * had nothing to report — silence.
 *
 * A missing verdict is not a neutral absence. It leaves the finding OPEN while
 * looking, in every summary, like diligent restraint.
 *
 * COVERAGE IS MEASURED OVER THE **OPEN** LIST — 2026-08-21.
 *
 * It used to be measured over the FILED corpus, which meant the denominator
 * included every finding a previous wave had already retired with a frame and a
 * quote: "findings covered : 1012 of 1043". Those 375 rows do not need a new
 * verdict — they have one, and it is in closures.jsonl — so counting them made
 * the percentage a statement about work that no longer exists. Worse in the
 * direction that matters: the next wave, run against a fresh verdicts file,
 * would have reported 375 findings as UNJUDGED and sent judges back to look at
 * them, spending the round off the open list while the open list stood still.
 *
 * A verdict line citing an already-retired finding is still recognised and is
 * still quality-checked — it is history, not an error — it just is not part of
 * what this wave has left to do. `--filed` restores the old denominator.
 *
 *   node tools/audit/verdict-coverage.mjs            all lessons
 *   node tools/audit/verdict-coverage.mjs --gaps     only what is missing
 *   node tools/audit/verdict-coverage.mjs --filed    count retired findings too
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
const argv = process.argv.slice(2);
const GAPS_ONLY = argv.includes("--gaps");
const FILED = argv.includes("--filed");
const VERDICTS =
  (argv.indexOf("--verdicts") >= 0 && argv[argv.indexOf("--verdicts") + 1]) ||
  path.join(REPO, ".audit-frames", "wave-c", "verdicts.jsonl");

const counts = corpusCounts();
// The id map stays the FILED corpus on purpose: a verdict line citing a finding
// a wave has since retired is history, not an invented id, and reporting it as
// "unknown findingId" would be a false alarm that trains a reader to skip this
// report's output. Only what is OWED changes with the scope.
const byId = new Map(counts.filed.map((j) => [j.findingId, j]));
const owed = FILED ? counts.filed : counts.open;

const rows = [];
const malformed = [];
if (fs.existsSync(VERDICTS)) {
  const lines = fs.readFileSync(VERDICTS, "utf8").split("\n");
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    try {
      rows.push(JSON.parse(l));
    } catch (e) {
      malformed.push({ line: i + 1, text: l.slice(0, 120), err: e.message });
    }
  });
}

/**
 * PARTIAL joined the vocabulary on 2026-08-24, and it was added to the JUDGES
 * BRIEF a round before it was added HERE — so 171 well-formed verdicts were
 * rejected as malformed and the findings they described counted as UNJUDGED,
 * i.e. as though nobody had looked. A verdict the judges are asked for and the
 * tools do not know is worse than no verdict: it fails in the reassuring
 * direction, which is the direction every instrument bug in this audit has
 * failed in.
 *
 * It exists because forcing a multi-clause finding into CLOSED-or-STILL
 * produced seven wrong "fixed" stamps in a sister round — in six of them the
 * disqualifying caveat was written in the judge own notes field while the
 * verdict field said closed. PARTIAL retires NOTHING, exactly like STILL. It
 * is here so real movement can be seen without being counted as a closure.
 */
const VALID = ["CLOSED", "STILL", "PARTIAL", "REFUTED", "UNJUDGED"];
const seen = new Map();
const problems = [];

/**
 * Judge problems on the line that WINS, not on every line ever written.
 *
 * A corrected row supersedes the original — that is the whole point of
 * `correctedBy` — so a damaged line that has since been re-cited is history,
 * not an open defect. Checking every line meant two superseded rows stayed
 * flagged after the re-cite had already fixed them, which trains a reader to
 * ignore this report's output. Same resolution order as the poster: originals
 * first, corrections last, last write wins.
 */
const effective = new Map();
for (const r of rows) if (r.findingId && !r.correctedBy) effective.set(r.findingId, r);
for (const r of rows) if (r.findingId && r.correctedBy) effective.set(r.findingId, r);
const superseded = rows.filter((r) => r.findingId && effective.get(r.findingId) !== r).length;

for (const r of rows) {
  if (!r.findingId) {
    problems.push("no findingId: " + JSON.stringify(r).slice(0, 110));
    continue;
  }
  if (!byId.has(r.findingId)) {
    problems.push("unknown findingId " + r.findingId);
    continue;
  }
  // Record it for the coverage count, then skip the quality checks if a later
  // line has replaced it.
  if (effective.get(r.findingId) !== r) {
    const e0 = seen.get(r.findingId) || [];
    e0.push(r);
    seen.set(r.findingId, e0);
    continue;
  }
  const v = String(r.verdict || "").toUpperCase();
  if (!VALID.includes(v)) problems.push(r.findingId + ": verdict " + JSON.stringify(r.verdict) + " is not one of " + VALID.join("/"));
  if (["CLOSED", "REFUTED"].includes(v)) {
    // Presence is not resolution. Two CLOSED lines arrived with Windows paths
    // mangled by JSON escaping — field present, file absent, check passed.
    const tries = [r.evidenceFrame, String(r.evidenceFrame || "").split("\\").join("/")];
    const found = tries.some((t) => { try { return t && fs.existsSync(t); } catch { return false; } });
    if (!r.evidenceFrame) problems.push(r.findingId + ": " + v + " with no evidenceFrame — will be downgraded to UNJUDGED");
    else if (!found) problems.push(r.findingId + ": " + v + " cites a frame that DOES NOT RESOLVE — " + JSON.stringify(String(r.evidenceFrame).slice(0, 80)));
    if (!r.evidenceQuote) problems.push(r.findingId + ": " + v + " with no evidenceQuote — will be downgraded to UNJUDGED");
  }
  const e = seen.get(r.findingId) || [];
  e.push(r);
  seen.set(r.findingId, e);
}

// --- per lesson ---------------------------------------------------------------
const lessons = new Map();
for (const j of owed) {
  const e = lessons.get(j.scenario) || { lesson: j.scenario, expected: 0, got: 0, missing: [] };
  e.expected++;
  if (seen.has(j.findingId)) e.got++;
  else e.missing.push(j.findingId + " (" + j.severity + ")");
  lessons.set(j.scenario, e);
}
const all = [...lessons.values()].sort((a, b) => b.missing.length - a.missing.length || a.lesson.localeCompare(b.lesson));
const incomplete = all.filter((e) => e.missing.length);
const touched = all.filter((e) => e.got > 0);

// How many of the lines that DID land were about findings already retired —
// real work, already banked, and not part of what this wave still owes.
const onRetired = [...seen.keys()].filter((k) => counts.retiredIds.has(k)).length;
const coveredOwed = owed.filter((j) => seen.has(j.findingId)).length;

console.log(openListLine(counts));
console.log(workedLine(FILED ? "filed" : "open", owed));
console.log("scope              : " + (FILED ? "FILED — retired findings counted as owing a verdict" : "OPEN — " + counts.n.retired + " retired finding(s) excluded (pass --filed to include them)"));
console.log("verdict lines read : " + rows.length + (malformed.length ? "   (" + malformed.length + " MALFORMED)" : ""));
console.log(
  "findings covered   : " + coveredOwed + " of " + owed.length + "   (" +
    (owed.length ? Math.round((coveredOwed / owed.length) * 100) : 100) + "%)" +
    (!FILED && onRetired ? "   [+" + onRetired + " line(s) about findings already retired]" : ""),
);
console.log("lessons touched    : " + touched.length + " of " + lessons.size);
console.log("lessons incomplete : " + incomplete.length);
const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);
console.log("findings with >1 line: " + dupes.length + "   (a verifier correction is expected to be one of these)");
console.log("superseded lines     : " + superseded + "   (checked for coverage, not for quality — a later line replaced them)");

if (malformed.length) {
  console.log("\nMALFORMED LINES — these were silently skipped by every reader:");
  for (const m of malformed.slice(0, 10)) console.log("  line " + m.line + ": " + m.err + "\n    " + m.text);
}
if (problems.length) {
  console.log("\n" + problems.length + " problem(s) in the lines that DID parse:");
  for (const p of problems.slice(0, 20)) console.log("  " + p);
  if (problems.length > 20) console.log("  ...and " + (problems.length - 20) + " more");
}

if (incomplete.length) {
  console.log("\nLESSONS WITH FINDINGS NOBODY JUDGED:");
  const show = GAPS_ONLY ? incomplete : incomplete.slice(0, 25);
  for (const e of show) {
    console.log("  " + e.lesson + "   " + e.got + "/" + e.expected + " judged, " + e.missing.length + " missing");
    if (GAPS_ONLY) for (const m of e.missing) console.log("      " + m);
  }
  if (!GAPS_ONLY && incomplete.length > 25) console.log("  ...and " + (incomplete.length - 25) + " more (use --gaps for the full list)");
}

const clean = !malformed.length && !problems.length && !incomplete.length;
console.log("\n" + (clean ? "COMPLETE — every finding has a well-formed verdict." : "INCOMPLETE — the gaps above keep those findings OPEN."));
process.exit(clean ? 0 : 1);
