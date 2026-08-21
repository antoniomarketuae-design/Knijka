#!/usr/bin/env node
/**
 * Print the standing BROKEN findings for one lesson, each with a STABLE ID.
 *
 * WHY THIS IS A FILE AND NOT A SNIPPET IN A PROMPT. The judges used to be handed
 * a twelve-line Node one-liner inside a workflow template literal, four levels of
 * backslash-escaping deep. A snippet that mis-escapes does not error — it prints
 * nothing, and a judge who sees nothing concludes there is nothing to judge. That
 * is the reassuring direction, and this audit has lost 985 findings once already
 * by passing them through a channel nobody verified.
 *
 * WHY THE ID IS DERIVED AND NOT STORED. The corpus has no id field. The only
 * other join key is the prose `what` (median 297 chars, max 737), and a judge who
 * paraphrases it breaks the join silently. This id is computed from content that
 * already exists, so no corpus file is ever rewritten, and it is collision-free
 * across all 1,012 standing findings (verified: 1012 distinct, 0 collisions).
 *
 *   node tools/audit/finding-reader.mjs <lesson-id>     one lesson, full detail
 *   node tools/audit/finding-reader.mjs --all           every id, one per line
 *   node tools/audit/finding-reader.mjs --count         the corpus arithmetic
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Find the corpus by walking up, not by counting directory levels. Counting
 * levels means the file works from tools/audit/ and nowhere else, and "nowhere
 * else" includes every place a future reader will try it first.
 */
function findCorpus() {
  const seen = [];
  for (const start of [path.dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    let d = start;
    for (;;) {
      const c = path.join(d, ".audit-frames", "findings");
      seen.push(c);
      if (fs.existsSync(c)) return c;
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  console.error(
    "could not find .audit-frames/findings by walking up from this file or the cwd.\n" +
      "Looked in:\n  " + seen.slice(0, 12).join("\n  "),
  );
  process.exit(2);
}

export const findingId = (j) =>
  j.scenario +
  ":" +
  crypto.createHash("sha1").update(String(j.what) + "\u0000" + String(j.frame)).digest("hex").slice(0, 8);

/** Every row in the corpus, tagged with the file it came from. */
function loadAllRows() {
  const DIR = findCorpus();
  const all = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".jsonl")) continue;
    for (const l of fs.readFileSync(path.join(DIR, f), "utf8").split("\n")) {
      if (!l.trim()) continue;
      try {
        const j = JSON.parse(l);
        j.__src = f;
        all.push(j);
      } catch {
        /* a torn tail line is not a reason to drop the file */
      }
    }
  }
  return all;
}

const corpusKey = (j) => j.lesson || j.lessonId || j.scenario || j.id || null;

/** The file whose rows replace older observations of the same lesson. */
const SUPERSEDER = "chunk-redrive.jsonl";

/**
 * The original sweep161 chunks — the rows chunk-redrive.jsonl is entitled to
 * replace. Matched by SHAPE, not by a list of 23 names, because the shape is
 * what closes: nothing new will ever be called `chunk-<digits>.jsonl`, so every
 * future source file falls outside it and gets classified as UNCLASSIFIED and
 * announced. A hand-written list would have to be maintained to keep that
 * property, which is the same failure mode one level up.
 */
const BASE_SOURCE = /^chunk-\d+\.jsonl$/;

/**
 * ADDITIVE sources are findings DISCOVERED about a lesson, not a re-observation
 * that replaces it, so nothing supersedes them. This list is HAND-MAINTAINED
 * and that is the residual risk — see `supersessionReport()`, which exists so
 * that forgetting to add a name here costs a printed warning instead of four
 * critical findings.
 */
const ADDITIVE = new Set(["chunk-wavec-new.jsonl"]);

/**
 * WHAT SUPERSESSION IS THROWING AWAY, PER FILE — 2026-08-21.
 *
 * The eating is invisible by construction: a superseded row simply is not in
 * the result, and the only symptom the last time was a total that rose by 25
 * instead of 30. Nobody was looking for a number that did not appear. So the
 * loss is now COMPUTED and printed beside the totals, and any source NEWER than
 * the superseder that is not declared additive is called out by name.
 *
 * MEASURED today: un-declaring chunk-wavec-new.jsonl eats exactly 5 rows — 5
 * BROKEN, 4 of them critical. That is the incident, to the row.
 *
 * THE TRIGGER IS STRUCTURAL, NOT CHRONOLOGICAL. The first version of this asked
 * "is the file newer than the superseder?", which is mtime — and a fresh clone
 * stamps every file with its checkout time in no useful order, so the guard
 * would fire on all of them or none of them depending on the machine. A guard
 * whose answer depends on how the repo arrived is not a guard. So a source is
 * flagged when it is UNCLASSIFIED: not the superseder, not a `chunk-<digits>`
 * sweep161 chunk, not declared ADDITIVE. Every future corpus file is
 * unclassified by construction, which is exactly the population that needs a
 * decision made about it.
 *
 * THIS DOES NOT CHANGE WHAT IS LOADED. An unclassified file is still superseded
 * exactly as before — silently reclassifying one as additive could resurrect
 * genuinely stale rows, and that is a decision for a person. What changes is
 * that the loss is now printed with the file's name on it.
 */
export function supersessionReport() {
  const DIR = findCorpus();
  const all = loadAllRows();
  const superseding = new Set(
    all.filter((j) => j.__src === SUPERSEDER).map(corpusKey).filter(Boolean),
  );
  const mtime = (f) => {
    try {
      return fs.statSync(path.join(DIR, f)).mtimeMs;
    } catch {
      return 0;
    }
  };
  const base = mtime(SUPERSEDER);
  const sources = [...new Set(all.map((j) => j.__src))].sort();
  const rows = [];
  for (const src of sources) {
    if (src === SUPERSEDER) continue;
    const mine = all.filter((j) => j.__src === src);
    const eaten = mine.filter((j) => corpusKey(j) && superseding.has(corpusKey(j)));
    const broken = eaten.filter((j) => j.bucket === "BROKEN");
    const additive = ADDITIVE.has(src);
    rows.push({
      src,
      additive,
      classified: additive || BASE_SOURCE.test(src),
      // Supplementary only — never the trigger. See the header.
      newerThanSuperseder: mtime(src) > base,
      wouldEat: eaten.length,
      wouldEatBroken: broken.length,
      wouldEatCritical: broken.filter((j) => String(j.severity).toLowerCase() === "critical").length,
      actuallyEaten: additive ? 0 : eaten.length,
    });
  }
  // The dangerous shape: a source nobody has classified, losing rows to a rule
  // that assumes it is stale. That is exactly what chunk-wavec-new.jsonl was.
  const atRisk = rows.filter((r) => !r.classified && r.wouldEat > 0);
  const unclassified = rows.filter((r) => !r.classified);
  return { superseder: SUPERSEDER, lessonsSuperseded: superseding.size, rows, atRisk, unclassified };
}

export function loadStandingBroken() {
  const all = loadAllRows();
  const key = corpusKey;

  /**
   * SUPERSESSION, AND THE ONE THING IT MUST NOT DO.
   *
   * A lesson re-driven in chunk-redrive.jsonl supersedes its OWN older records:
   * the newer observation of that lesson replaces the stale one. Correct, and it
   * is why the corpus is 1,012 and not 1,712.
   *
   * But the rule is written as "chunk-redrive.jsonl wins over every other file",
   * which quietly assumes chunk-redrive is always the NEWEST source. It stopped
   * being true the moment Wave C filed findings of its own: dropping
   * chunk-wavec-new.jsonl into the corpus lost 5 rows, 4 of them critical —
   * including "the harness cannot select R" — because their lessons happen to
   * appear in chunk-redrive.jsonl. They were discarded as stale while being the
   * newest thing in the building, and the only visible symptom was the total
   * rising by 25 instead of 30.
   *
   * ADDITIVE sources are findings DISCOVERED about a lesson, not a re-observation
   * that replaces it, so nothing supersedes them. The set is declared at module
   * scope beside `supersessionReport()`, which prints what this rule is throwing
   * away so the next omission costs a warning instead of four criticals.
   */
  const rd = new Set(all.filter((j) => j.__src === SUPERSEDER).map(key).filter(Boolean));
  const standing = all.filter(
    (j) => j.__src === SUPERSEDER || ADDITIVE.has(j.__src) || !(key(j) && rd.has(key(j))),
  );
  return standing.filter((j) => j.bucket === "BROKEN").map((j) => ({ ...j, findingId: findingId(j) }));
}

/**
 * The findings a WAVE RETIRED, read back so the open list is a computed number
 * rather than a claim.
 *
 * The corpus is never rewritten — it is this audit's primary record and a buggy
 * rewrite of it is unrecoverable. Retirements live in their own append-only
 * file and are subtracted HERE. That was the design from the start and it was
 * documented in the ledger before it was implemented: for one commit the ledger
 * said retirements were "subtracted at read time" while nothing on the read path
 * read the file, so `--count` still printed 1,012 after 375 rows were retired.
 * A stated invariant nobody executes is just a comment.
 */
export function loadClosures() {
  const DIR = findCorpus();
  const p = path.join(path.dirname(DIR), "wave-c", "closures.jsonl");
  const out = new Map();
  if (!fs.existsSync(p)) return out;
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try {
      const j = JSON.parse(l);
      if (j.findingId) out.set(j.findingId, j);
    } catch {
      /* a torn tail line does not un-retire a finding */
    }
  }
  return out;
}

/** Standing BROKEN minus everything a wave retired with evidence. */
export function loadOpenFindings() {
  const retired = loadClosures();
  return loadStandingBroken().filter((j) => !retired.has(j.findingId));
}

/**
 * Only run the CLI when this file IS the program. Without this guard, importing
 * loadStandingBroken() also ran the argv parsing, so the *generator's* output
 * directory was read as a lesson id and the whole run died with "no standing
 * BROKEN finding for lesson C:/…/verdict-batches-dryrun". Caught by dry-running
 * the generator; it would otherwise have surfaced with 29 judges already live.
 */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: finding-reader.mjs <lesson-id> | --all | --count");
    process.exit(2);
  }

  const broken = loadStandingBroken();

  if (arg === "--count") {
    const retired = loadClosures();
    const open = broken.filter((j) => !retired.has(j.findingId));
    const ids = new Set(broken.map((j) => j.findingId));
    console.log("filed BROKEN    : " + broken.length + "   (the corpus, never rewritten)");
    console.log("retired         : " + retired.size + "   (closures.jsonl, each with a frame and a quote)");
    console.log("OPEN            : " + open.length);
    console.log("lessons open    : " + new Set(open.map((j) => j.scenario)).size + " of " + new Set(broken.map((j) => j.scenario)).size);
    console.log(
      "distinct ids    : " + ids.size + (ids.size === broken.length ? "  (collision-free)" : "  <-- COLLISIONS"),
    );
    console.log("");
    console.log("severity        filed  retired    open");
    const sev = {};
    for (const j of broken) (sev[j.severity] = sev[j.severity] || { f: 0, o: 0 }).f++;
    for (const j of open) sev[j.severity].o++;
    for (const k of ["critical", "major", "minor"]) {
      const s = sev[k];
      if (!s) continue;
      console.log("  " + k.padEnd(12) + String(s.f).padStart(5) + String(s.f - s.o).padStart(9) + String(s.o).padStart(8));
    }

    // WHAT SUPERSESSION IS EATING, OUT LOUD. A row dropped by the rule leaves no
    // trace in any total — the last omission showed up only as a number rising
    // by 25 instead of 30, and nobody was looking for a number that never
    // appeared. Printing the loss per file makes the next one arithmetic rather
    // than archaeology.
    const sup = supersessionReport();
    console.log("");
    console.log("supersession    : " + sup.superseder + " replaces older observations of " + sup.lessonsSuperseded + " lesson(s)");
    for (const r of sup.rows) {
      if (!r.wouldEat) continue;
      console.log(
        "  " + r.src.padEnd(24) +
          (r.additive
            ? "ADDITIVE — keeps " + r.wouldEat + " row(s) (" + r.wouldEatBroken + " BROKEN, " + r.wouldEatCritical + " critical) that the rule would otherwise eat"
            : "superseded away " + r.wouldEat + " row(s) (" + r.wouldEatBroken + " BROKEN, " + r.wouldEatCritical + " critical)"),
      );
    }
    if (sup.atRisk.length) {
      console.log("");
      console.log("!! " + sup.atRisk.length + " UNCLASSIFIED SOURCE(S) ARE LOSING ROWS TO " + sup.superseder + ":");
      for (const r of sup.atRisk) {
        console.log(
          "   " + r.src + " — losing " + r.wouldEat + " row(s), " + r.wouldEatBroken + " BROKEN, " +
            r.wouldEatCritical + " critical" + (r.newerThanSuperseder ? "   (and its mtime is NEWER)" : ""),
        );
      }
      console.log("   The rule assumes anything the superseder also covers is a STALE observation.");
      console.log("   For a file of NEW findings that is false — it is how 5 rows, 4 of them critical,");
      console.log("   were discarded while being the newest thing in the building. Decide which it is:");
      console.log("   add the filename to ADDITIVE in this file and re-run, or leave it and record why.");
    } else if (sup.unclassified.length) {
      console.log("");
      console.log(
        "unclassified    : " + sup.unclassified.map((r) => r.src).join(", ") +
          "   (loses nothing to supersession today — no action needed)",
      );
    }
  } else if (arg === "--all") {
    for (const j of broken) {
      console.log(j.findingId + "\t" + j.severity + "\t" + String(j.what).slice(0, 100).replace(/\s+/g, " "));
    }
  } else {
    const mine = broken.filter((j) => j.scenario === arg);
    if (!mine.length) {
      console.error(
        "no standing BROKEN finding for lesson " + JSON.stringify(arg) + ".\n" +
          "That is a real answer, not an error — but check the spelling against --all before you\n" +
          "conclude the lesson is clean, because an empty list reads exactly like a clean lesson.",
      );
      process.exit(1);
    }
    console.log("# " + mine.length + " standing BROKEN finding(s) for " + arg);
    console.log("# cite the findingId verbatim in every verdict line you write.\n");
    for (const j of mine) {
      console.log("findingId   : " + j.findingId);
      console.log("severity    : " + j.severity + "   part " + j.part);
      console.log("what        : " + j.what);
      console.log("old frame   : " + j.frame);
      console.log("old quote   : " + j.quote);
      console.log("suspectFile : " + j.suspectFile);
      console.log(
        "signals     : works=" + j.works + " rightCredited=" + j.rightCredited + " wrongConvicted=" + j.wrongConvicted,
      );
      console.log("endedBecause: " + j.endedBecause);
      console.log("");
    }
  }
}
