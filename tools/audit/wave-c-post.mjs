#!/usr/bin/env node
/**
 * WAVE C PHASE 3 — join the judges' verdicts to the findings corpus, retire what
 * was PROVED retired, and emit the next round's work list from what was not.
 *
 * THE THREE RULES THIS ENFORCES, each one bought.
 *
 *  1. THE JOIN IS BY ID, NEVER BY PROSE. The corpus has no id field, so the only
 *     other key is `what` (median 297 chars, max 737). A judge who paraphrases
 *     breaks the join silently, and a silent break reads as "not judged" — the
 *     reassuring direction, which is the direction every instrument bug in this
 *     audit has failed in. The id is derived from existing content.
 *
 *  2. EVIDENCE BINDS, IT DOES NOT WARN. A CLOSED or REFUTED without BOTH an
 *     evidenceFrame and an evidenceQuote is downgraded to UNJUDGED and does not
 *     reduce the open list. An earlier draft of this file printed "not
 *     creditable" next to such a row and then retired it anyway; a warning that
 *     does not bind is not a check.
 *
 *  3. THE CORPUS IS NEVER REWRITTEN. Retirements are recorded in a separate
 *     append-only file and subtracted at read time. The findings corpus is the
 *     audit's primary record and a buggy rewrite of it is unrecoverable; a
 *     separate ledger is reversible by deleting one file.
 *
 *  4. IT ADJUDICATES THE **OPEN** LIST, WHICH MAKES IT IDEMPOTENT — 2026-08-21.
 *     This iterated `loadStandingBroken()`, every finding ever filed, and
 *     computed the result as `filed - retired-this-run`. Both halves were
 *     wrong once 375 rows were already retired, and they were wrong in the two
 *     ways that do damage:
 *
 *       . RUNNING IT TWICE DUPLICATED THE LEDGER. Re-running `--apply` today
 *         re-derived the same 375 retirements from the same verdict lines and
 *         APPENDED them to closures.jsonl a second time. `loadClosures()` keys
 *         by findingId so the open count would not have moved, but the file
 *         that is the audit's only record of what was retired, and by what
 *         evidence, would have carried each row twice with a fresh timestamp.
 *       . IT PRINTED "open list : 1043 -> 668 (375 retired)" ON A RUN THAT
 *         RETIRED NOTHING. Every number in that sentence was a re-statement of
 *         work already banked, presented as this run's result.
 *
 *     Iterating the open list makes a second run report 0 CLOSED / 0 REFUTED
 *     and refuse to apply, which is the truth: there was nothing left to do.
 *
 *   node tools/audit/wave-c-post.mjs              report only (default)
 *   node tools/audit/wave-c-post.mjs --apply      write closures + ledger section
 *   node tools/audit/wave-c-post.mjs --next out.json   emit the next round's lanes
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { splitParents, corpusCounts, openListLine, workedLine } from "./finding-reader.mjs";

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
const has = (f) => argv.includes(f);
const flag = (f, d = null) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const VERDICTS = flag("--verdicts", path.join(REPO, ".audit-frames", "wave-c", "verdicts.jsonl"));
const CLOSURES = path.join(REPO, ".audit-frames", "wave-c", "closures.jsonl");
const LEDGER = flag("--ledger", path.join(REPO, "docs", "simulation", "88_LESSON_AUDIT.md"));

// --- the corpus ---------------------------------------------------------------
const counts = corpusCounts();
// What is left to adjudicate. Rule 4 in the header: everything already retired
// with evidence is banked, and re-deriving it is how the ledger gets written
// twice.
const broken = counts.open;
// The id map stays the FILED corpus. A verdict line citing a finding a previous
// wave retired is history, not an invented id, and the `--apply` refusal below
// treats an unknown id as evidence that a judge mangled one — a false alarm
// there blocks a legitimate posting run.
const byId = new Map(counts.filed.map((j) => [j.findingId, j]));
// ...and the same is true of a finding a SPLIT replaced. On 2026-08-26, 230
// compound rows were split into 647 atomic children and left the filed corpus
// with bucket "SPLIT". Their 2,722 verdict lines still name them, so without
// this every posting run refused with "230 verdict line(s) cite a findingId
// that is not in the corpus" — accusing the judges of mangling ids they had
// written correctly, and blocking every legitimate retirement behind it.
for (const j of splitParents()) if (!byId.has(j.findingId)) byId.set(j.findingId, j);

// --- the verdicts --------------------------------------------------------------
const rows = [];
if (fs.existsSync(VERDICTS)) {
  for (const l of fs.readFileSync(VERDICTS, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try {
      rows.push(JSON.parse(l));
    } catch {
      /* torn tail line */
    }
  }
}

// WHICH LINE IS THE FINAL WORD ON A FINDING — and this was WRONG until 2026-08-25.
//
// It used to be two passes: uncorrected first, corrected second, last-write-wins.
// That reads as "a verifier overrules the judge", which is the intent — but every
// round tags BOTH its judges and its verifiers through  ("round10" and
// "verify"), so they landed in the SAME pass and plain file order decided.
//
// MEASURED THE DAY IT BIT: a workflow was resumed after one lane died, some judges
// re-ran, and their fresh lines were appended AFTER that round's verifier
// corrections. 27 corrections were overwritten and several went the wrong way —
//     sc-crossing-dart:0c2c6736   verify=PARTIAL  -> round10=CLOSED
//     sc-park-night:74b62574      verify=UNJUDGED -> round10=CLOSED
// i.e. closures a verifier had already killed came back to life and would have been
// retired. That is the reassuring direction, which is where every instrument bug in
// this audit has failed.
//
// THE ORDER THAT IS ACTUALLY MEANT, and it needs both halves:
//   1. a LATER ROUND outranks an earlier one — round 10 looked at fresh frames, so
//      it must be able to overturn a verifier from round 9;
//   2. WITHIN one round, a verify line outranks the judge — the verifier is the
//      appeal court, and it does not matter which line was appended last.
//
// The verify tag carries no round of its own (one tag, 331 lines, every round
// since the first), so a line's round is the round whose block it falls in:
// rounds are recognised by where each non-verify tag FIRST appears, in file order.
const roundStart = [];
rows.forEach((r, i) => {
  const tag = r.correctedBy || "";
  if (!tag || tag === "verify") return;
  if (!roundStart.some((x) => x.tag === tag)) roundStart.push({ tag, at: i });
});
const roundOf = (i) => {
  let n = 0;
  for (let k = 0; k < roundStart.length; k += 1) if (i >= roundStart[k].at) n = k + 1;
  return n;
};
const rank = (r, i) => roundOf(i) * 2 + (r.correctedBy === "verify" ? 1 : 0);
const final = new Map();
const finalRank = new Map();
rows.forEach((r, i) => {
  if (!r.findingId) return;
  const s = rank(r, i);
  // >= keeps last-wins for genuine ties (a second verifier line on one finding).
  if (!final.has(r.findingId) || s >= finalRank.get(r.findingId)) {
    final.set(r.findingId, r);
    finalRank.set(r.findingId, s);
  }
});

const noId = rows.filter((r) => !r.findingId).length;
const unknown = [...final.keys()].filter((k) => !byId.has(k));

/**
 * A cited frame must RESOLVE, not merely be present as a field.
 *
 * Two CLOSED lines arrived with their Windows paths destroyed by JSON escaping:
 * "E:\AI driver\...\04-t046s.png" became
 * "E:AI driver.audit-frameswave-c\framessc-zebra-approach__mobile-right\u0004-t046s.png",
 * because \A and \. collapsed and \04 became a control character. Both passed a
 * presence check and neither points at a file. A closure whose evidence cannot
 * be opened is not evidenced — it is a claim.
 *
 * AND `existsSync` IS STILL A PRESENCE CHECK — 2026-08-21 (verifier).
 *
 * The version above resolved anything the filesystem admits to having, which is
 * not the same question as "can a judge open this and see the quote". MEASURED
 * against it: `E:/AI driver` — the repo root — resolved, so did
 * `.audit-frames`, and so did a ZERO-BYTE .png. That last one is not
 * hypothetical: 333 of the 27,832 PNGs under `.audit-frames/sweep161` and
 * `.audit-frames/wave-c/frames` are 0 bytes right now, and one of the findings
 * in this very corpus (sc-signal-controller:ba4a6215) is ABOUT that corruption —
 * "12 of 29 PNGs are 0 bytes … including 06-waited, 07-end and 08-debrief, the
 * only honest verdict surface". A closure citing one of those 333 was counted.
 *
 * So the test is now: a REGULAR FILE with bytes in it. Not `.png`, deliberately —
 * sc-signal-controller:ba4a6215 is legitimately closed on `_audit-status.json`,
 * and the question a gate should ask is whether the evidence can be opened, not
 * what extension it wears.
 */
const resolveFrame = (p) => {
  if (!p) return null;
  const tries = [p, String(p).split("\\").join("/"), String(p).split("/").join(path.sep)];
  for (const t of tries) {
    try {
      const st = fs.statSync(t);
      // A directory "exists" and holds nothing a judge can read; an empty file
      // opens to nothing. Both are the reassuring direction for this gate.
      if (st.isFile() && st.size > 0) return t;
    } catch {
      /* an unopenable path is simply not a frame */
    }
  }
  return null;
};
const evidenced = (r) => Boolean(resolveFrame(r.evidenceFrame) && r.evidenceQuote);
const verdictOf = (r) => {
  let v = String(r.verdict || "").toUpperCase();
  if ((v === "CLOSED" || v === "REFUTED") && !evidenced(r)) v = "UNJUDGED";
  // PARTIAL — some clauses of a multi-clause finding are demonstrably gone and
  // some are not. It is RECOGNISED so it is not silently rebadged UNJUDGED (the
  // bug this line had on 2026-08-24, when the verdict reached the judges brief a
  // round before it reached the tools), and it RETIRES NOTHING: only CLOSED and
  // REFUTED are collected below, and both still need a frame and a quote.
  if (!["CLOSED", "STILL", "PARTIAL", "REFUTED", "UNJUDGED"].includes(v)) v = "UNJUDGED";
  return v;
};

const tally = { CLOSED: 0, STILL: 0, PARTIAL: 0, REFUTED: 0, UNJUDGED: 0 };
const retire = [];
const stillOpen = [];
for (const j of broken) {
  const r = final.get(j.findingId);
  if (!r) {
    tally.UNJUDGED++;
    stillOpen.push({ ...j, why: "no verdict line was written for this finding" });
    continue;
  }
  const v = verdictOf(r);
  tally[v]++;
  if (v === "CLOSED" || v === "REFUTED") retire.push({ finding: j, row: r, verdict: v });
  else stillOpen.push({ ...j, why: v === "STILL" ? String(r.why || "still reproduces") : String(r.why || "not exercised by the re-drive") });
}

const openIds = new Set(broken.map((j) => j.findingId));
const downgraded = [...final.entries()].filter(
  ([k, r]) => openIds.has(k) && ["CLOSED", "REFUTED"].includes(String(r.verdict || "").toUpperCase()) && !evidenced(r),
);

// --- report ---------------------------------------------------------------------
/** HEAD right now — when the retirement was POSTED, not when it was measured. */
const postedAt = (() => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "(unknown)";
  }
})();

/**
 * The commit the DRIVES attested — read off the drive ledger, never off git.
 *
 * This used to stamp `git rev-parse HEAD` and print it as the commit the
 * lessons were "re-driven on". By the time phase 3 runs, HEAD has moved on
 * (tool fixes land between the drives and the posting), so the ledger stated a
 * provenance that was simply false: it named 14f529a for drives measured at
 * 70d8651. A record that misstates which build it measured is the one thing
 * this whole wave exists to prevent, and it had it backwards in its own summary.
 */
const drivenAt = (() => {
  const p = path.join(REPO, ".audit-frames", "wave-c", "wave-c-results.jsonl");
  if (!fs.existsSync(p)) return "(drive ledger not found)";
  const heads = new Set();
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try {
      const j = JSON.parse(l);
      if (j.head) heads.add(String(j.head));
    } catch {
      /* a torn tail line does not change which build was measured */
    }
  }
  if (heads.size === 1) return [...heads][0];
  if (heads.size === 0) return "(no drives read)";
  // More than one build in one corpus is not something to summarise away.
  return "MIXED:" + [...heads].map((h) => h.slice(0, 12)).join("+");
})();
const head = drivenAt;

// Lines that ARE joinable but are about findings a previous wave already
// retired. Counting them anywhere in this run's tally would re-report banked
// work as this run's result — which is exactly what the sentence "open list :
// 1043 -> 668 (375 retired)" was doing on a run that retired nothing.
const onAlreadyRetired = [...final.keys()].filter((k) => byId.has(k) && !openIds.has(k)).length;

console.log(openListLine(counts));
console.log(workedLine("open", broken));
console.log("corpus filed BROKEN    : " + counts.n.filed + "   (" + counts.n.retired + " already retired by an earlier run)");
console.log("OPEN, i.e. adjudicated : " + broken.length);
console.log("verdict lines read     : " + rows.length + (noId ? "   (" + noId + " with NO findingId — unjoinable)" : ""));
console.log(
  "distinct findings kept : " + final.size +
    (onAlreadyRetired ? "   (" + onAlreadyRetired + " about findings ALREADY retired — history, not this run)" : "") +
    (unknown.length ? "   (" + unknown.length + " cite an id not in the corpus)" : ""),
);
console.log("");
console.log("  CLOSED   : " + tally.CLOSED);
console.log("  REFUTED  : " + tally.REFUTED);
console.log("  PARTIAL  : " + tally.PARTIAL + "   (some clauses gone, some not — retires nothing)");
console.log("  STILL    : " + tally.STILL);
console.log("  UNJUDGED : " + tally.UNJUDGED);
if (downgraded.length) {
  console.log("");
  console.log("  " + downgraded.length + " CLOSED/REFUTED line(s) carried no frame+quote and were DOWNGRADED to UNJUDGED.");
  console.log("  They do not reduce the open list. This is the rule binding, not a bug.");
}
console.log("");
console.log("open list : " + broken.length + " -> " + (broken.length - retire.length) + "   (" + retire.length + " retired by THIS run)");
if (!retire.length) {
  console.log("            Nothing new was retired. Every verdict line that could retire a finding");
  console.log("            has already been posted — this run is a no-op, and that is the honest");
  console.log("            answer rather than a re-statement of the last run's result.");
}
if (unknown.length) {
  console.log("\nids cited by a judge that are not in the corpus (first 10):");
  for (const u of unknown.slice(0, 10)) console.log("   " + u);
}

// --- the next round's work list ---------------------------------------------------
const nextPath = flag("--next");
if (nextPath) {
  const byFile = new Map();
  for (const j of stillOpen) {
    const f = j.suspectFile || "unknown";
    const e = byFile.get(f) || { file: f, total: 0, critical: 0, lessons: new Set(), findings: [] };
    e.total++;
    if (String(j.severity).toLowerCase() === "critical") e.critical++;
    e.lessons.add(j.scenario);
    e.findings.push({ findingId: j.findingId, severity: j.severity, lesson: j.scenario, what: j.what, why: j.why });
    byFile.set(f, e);
  }
  const lanes = [...byFile.values()]
    .map((e) => ({ ...e, lessons: [...e.lessons] }))
    .sort((a, b) => b.critical - a.critical || b.total - a.total);
  fs.writeFileSync(nextPath, JSON.stringify(lanes, null, 1));
  console.log("\nnext round: " + lanes.length + " suspect file(s) still carrying findings -> " + nextPath);
  for (const l of lanes.slice(0, 12)) console.log("   " + l.critical + "c/" + l.total + "  " + l.file);
  if (lanes.length > 12) console.log("   ...and " + (lanes.length - 12) + " more");
}

// --- apply ------------------------------------------------------------------------
if (!has("--apply")) {
  console.log("\n(report only — pass --apply to write closures and the ledger section)");
  process.exit(0);
}

if (!retire.length) {
  console.error(
    "\nnothing to apply: no OPEN finding was both retired AND evidenced.\n" +
      "If this run followed a successful one, that is the correct answer and not an error to\n" +
      "work around — the verdicts have already been posted and closures.jsonl already holds them.",
  );
  process.exit(1);
}

// A second belt on rule 4. If the open list is what we adjudicate, no retirement
// can already be in closures.jsonl — but this is the file that cannot be
// un-written, so the impossible case is checked rather than assumed.
const dupes = retire.filter((r) => counts.retiredIds.has(r.finding.findingId));
if (dupes.length) {
  console.error(
    "\nrefusing to apply: " + dupes.length + " retirement(s) are ALREADY in closures.jsonl.\n" +
      "Appending them again would record the same closure twice with a fresh timestamp, in the\n" +
      "one file that says what was retired and on what evidence. First: " + dupes[0].finding.findingId,
  );
  process.exit(1);
}
if (unknown.length) {
  console.error(
    "\nrefusing to apply: " + unknown.length + " verdict line(s) cite a findingId that is not in\n" +
      "the corpus. That means a judge invented or mangled an id, and if one id is wrong the\n" +
      "others from the same judge cannot be trusted either. Fix the rows, then re-run.",
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(CLOSURES), { recursive: true });
const stamp = new Date().toISOString();
const lines = retire.map((r) =>
  JSON.stringify({
    findingId: r.finding.findingId,
    lesson: r.finding.scenario,
    severity: r.finding.severity,
    verdict: r.verdict,
    closedBy: "wave-c",
    // Two different commits, and conflating them is how a record ends up
    // claiming it measured a build it never saw.
    drivenAt: drivenAt,
    postedAt: postedAt,
    evidenceFrame: r.row.evidenceFrame,
    evidenceQuote: r.row.evidenceQuote,
    why: r.row.why,
    correctedBy: r.row.correctedBy || undefined,
    stamped: stamp,
  }),
);
fs.appendFileSync(CLOSURES, lines.join("\n") + "\n");
console.log("\nwrote " + lines.length + " retirement(s) to " + CLOSURES);

if (fs.existsSync(LEDGER)) {
  const sec = [
    "",
    "## Wave C verdicts — " + stamp.slice(0, 10),
    "",
    "Every lesson carrying a standing BROKEN finding was re-driven on a still tree at",
    "`" + drivenAt.slice(0, 12) + "` — the commit the harness itself attested on every drive, not the" +
      " commit HEAD happened to be on when these verdicts were posted (`" + postedAt.slice(0, 12) + "`)." +
      " Each finding",
    "was adjudicated against its own re-drive by a judge and then attacked by an adversarial",
    "verifier. Retirement required a NEW frame and a quote from it; the tests passing was not",
    "accepted as evidence for any row.",
    "",
    "| verdict | count |",
    "|---|---|",
    "| CLOSED (symptom gone, frame cited) | " + tally.CLOSED + " |",
    "| REFUTED (finding was never true) | " + tally.REFUTED + " |",
    "| PARTIAL (some clauses gone, some not) | " + tally.PARTIAL + " |",
    "| STILL (symptom reproduces) | " + tally.STILL + " |",
    "| UNJUDGED (re-drive did not exercise it) | " + tally.UNJUDGED + " |",
    "",
    "**Open list: " + broken.length + " → " + (broken.length - retire.length) + "**, out of " +
      counts.n.filed + " filed across the whole programme (" + counts.n.retired +
      " were already retired before this run)." +
      (downgraded.length
        ? "  " + downgraded.length + " CLOSED/REFUTED line(s) arrived without a frame and quote and were downgraded to UNJUDGED — they did not reduce the count."
        : ""),
    "",
    "Retirements are recorded in `.audit-frames/wave-c/closures.jsonl`, one line per finding with",
    "its evidence. The findings corpus itself is untouched: it is this audit's primary record, and",
    "a retirement is subtracted at read time so it can be reversed by deleting one file.",
    "",
  ].join("\n");
  fs.appendFileSync(LEDGER, sec);
  console.log("appended the verdict section to " + LEDGER);
} else {
  console.log("ledger not found at " + LEDGER + " — closures were still written.");
}
