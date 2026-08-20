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
  // A lesson re-driven in chunk-redrive.jsonl supersedes its OWN older records.
  const rd = new Set(all.filter((j) => j.__src === "chunk-redrive.jsonl").map(key).filter(Boolean));
  const standing = all.filter((j) => j.__src === "chunk-redrive.jsonl" || !(key(j) && rd.has(key(j))));
  return standing.filter((j) => j.bucket === "BROKEN").map((j) => ({ ...j, findingId: findingId(j) }));
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
    const lessons = new Set(broken.map((j) => j.scenario));
    const ids = new Set(broken.map((j) => j.findingId));
    console.log("standing BROKEN : " + broken.length);
    console.log("lessons         : " + lessons.size);
    console.log(
      "distinct ids    : " + ids.size + (ids.size === broken.length ? "  (collision-free)" : "  <-- COLLISIONS"),
    );
    const sev = {};
    for (const j of broken) sev[j.severity] = (sev[j.severity] || 0) + 1;
    for (const [k, v] of Object.entries(sev).sort((a, b) => b[1] - a[1])) {
      console.log("  " + String(v).padStart(5) + "  " + k);
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
