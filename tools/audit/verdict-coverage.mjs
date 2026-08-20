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
 *   node tools/audit/verdict-coverage.mjs            all lessons
 *   node tools/audit/verdict-coverage.mjs --gaps     only what is missing
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStandingBroken } from "./finding-reader.mjs";

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
const VERDICTS =
  (argv.indexOf("--verdicts") >= 0 && argv[argv.indexOf("--verdicts") + 1]) ||
  path.join(REPO, ".audit-frames", "wave-c", "verdicts.jsonl");

const broken = loadStandingBroken();
const byId = new Map(broken.map((j) => [j.findingId, j]));

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

const VALID = ["CLOSED", "STILL", "REFUTED", "UNJUDGED"];
const seen = new Map();
const problems = [];
for (const r of rows) {
  if (!r.findingId) {
    problems.push("no findingId: " + JSON.stringify(r).slice(0, 110));
    continue;
  }
  if (!byId.has(r.findingId)) {
    problems.push("unknown findingId " + r.findingId);
    continue;
  }
  const v = String(r.verdict || "").toUpperCase();
  if (!VALID.includes(v)) problems.push(r.findingId + ": verdict " + JSON.stringify(r.verdict) + " is not one of " + VALID.join("/"));
  if (["CLOSED", "REFUTED"].includes(v) && !(r.evidenceFrame && r.evidenceQuote)) {
    problems.push(r.findingId + ": " + v + " with no " + (!r.evidenceFrame ? "evidenceFrame" : "evidenceQuote") + " — will be downgraded to UNJUDGED");
  }
  const e = seen.get(r.findingId) || [];
  e.push(r);
  seen.set(r.findingId, e);
}

// --- per lesson ---------------------------------------------------------------
const lessons = new Map();
for (const j of broken) {
  const e = lessons.get(j.scenario) || { lesson: j.scenario, expected: 0, got: 0, missing: [] };
  e.expected++;
  if (seen.has(j.findingId)) e.got++;
  else e.missing.push(j.findingId + " (" + j.severity + ")");
  lessons.set(j.scenario, e);
}
const all = [...lessons.values()].sort((a, b) => b.missing.length - a.missing.length || a.lesson.localeCompare(b.lesson));
const incomplete = all.filter((e) => e.missing.length);
const touched = all.filter((e) => e.got > 0);

console.log("verdict lines read : " + rows.length + (malformed.length ? "   (" + malformed.length + " MALFORMED)" : ""));
console.log("findings covered   : " + seen.size + " of " + broken.length + "   (" + Math.round((seen.size / broken.length) * 100) + "%)");
console.log("lessons touched    : " + touched.length + " of " + lessons.size);
console.log("lessons incomplete : " + incomplete.length);
const dupes = [...seen.entries()].filter(([, v]) => v.length > 1);
console.log("findings with >1 line: " + dupes.length + "   (a verifier correction is expected to be one of these)");

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
