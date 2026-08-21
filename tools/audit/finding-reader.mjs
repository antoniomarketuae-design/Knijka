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

export function loadStandingBroken() {
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
  const key = (j) => j.lesson || j.lessonId || j.scenario || j.id || null;

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
   * that replaces it, so nothing supersedes them.
   */
  const ADDITIVE = new Set(["chunk-wavec-new.jsonl"]);
  const rd = new Set(all.filter((j) => j.__src === "chunk-redrive.jsonl").map(key).filter(Boolean));
  const standing = all.filter(
    (j) => j.__src === "chunk-redrive.jsonl" || ADDITIVE.has(j.__src) || !(key(j) && rd.has(key(j))),
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
