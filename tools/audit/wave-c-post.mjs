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
 *   node tools/audit/wave-c-post.mjs              report only (default)
 *   node tools/audit/wave-c-post.mjs --apply      write closures + ledger section
 *   node tools/audit/wave-c-post.mjs --next out.json   emit the next round's lanes
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
const has = (f) => argv.includes(f);
const flag = (f, d = null) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const VERDICTS = flag("--verdicts", path.join(REPO, ".audit-frames", "wave-c", "verdicts.jsonl"));
const CLOSURES = path.join(REPO, ".audit-frames", "wave-c", "closures.jsonl");
const LEDGER = flag("--ledger", path.join(REPO, "docs", "simulation", "88_LESSON_AUDIT.md"));

// --- the corpus ---------------------------------------------------------------
const broken = loadStandingBroken();
const byId = new Map(broken.map((j) => [j.findingId, j]));

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

// A verifier's correction supersedes the judge's original for the same id. Order
// matters: originals first, corrections second, so a correction always wins even
// if it was appended before another judge's original for a different finding.
const final = new Map();
for (const r of rows) if (r.findingId && !r.correctedBy) final.set(r.findingId, r);
for (const r of rows) if (r.findingId && r.correctedBy) final.set(r.findingId, r);

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
 */
const resolveFrame = (p) => {
  if (!p) return null;
  const tries = [p, String(p).split("\\").join("/"), String(p).split("/").join(path.sep)];
  for (const t of tries) {
    try {
      if (fs.existsSync(t)) return t;
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
  if (!["CLOSED", "STILL", "REFUTED", "UNJUDGED"].includes(v)) v = "UNJUDGED";
  return v;
};

const tally = { CLOSED: 0, STILL: 0, REFUTED: 0, UNJUDGED: 0 };
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

const downgraded = [...final.entries()].filter(
  ([k, r]) => byId.has(k) && ["CLOSED", "REFUTED"].includes(String(r.verdict || "").toUpperCase()) && !evidenced(r),
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

console.log("corpus standing BROKEN : " + broken.length);
console.log("verdict lines read     : " + rows.length + (noId ? "   (" + noId + " with NO findingId — unjoinable)" : ""));
console.log("distinct findings kept : " + final.size + (unknown.length ? "   (" + unknown.length + " cite an id not in the corpus)" : ""));
console.log("");
console.log("  CLOSED   : " + tally.CLOSED);
console.log("  REFUTED  : " + tally.REFUTED);
console.log("  STILL    : " + tally.STILL);
console.log("  UNJUDGED : " + tally.UNJUDGED);
if (downgraded.length) {
  console.log("");
  console.log("  " + downgraded.length + " CLOSED/REFUTED line(s) carried no frame+quote and were DOWNGRADED to UNJUDGED.");
  console.log("  They do not reduce the open list. This is the rule binding, not a bug.");
}
console.log("");
console.log("open list : " + broken.length + " -> " + (broken.length - retire.length) + "   (" + retire.length + " retired)");
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
  console.error("\nnothing to apply: no finding was both retired AND evidenced.");
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
    "| STILL (symptom reproduces) | " + tally.STILL + " |",
    "| UNJUDGED (re-drive did not exercise it) | " + tally.UNJUDGED + " |",
    "",
    "**Open list: " + broken.length + " → " + (broken.length - retire.length) + ".**" +
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
