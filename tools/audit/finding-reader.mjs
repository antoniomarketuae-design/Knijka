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
 * WHAT «OPEN» MEANS, AND WHY EVERY MODE DEFAULTS TO IT — 2026-08-21.
 *
 * A finding retired with evidence is NOT open. That sentence was true in
 * `--count` and false everywhere else: `--all` and the per-lesson listing both
 * printed the FILED corpus, so a judge handed a lesson was handed findings that
 * a previous wave had already closed with a frame and a quote. Re-judging a
 * retired row is not neutral — it is the reassuring direction twice over, since
 * the cheapest verdict to write for something already fixed is CLOSED, and the
 * open list never moves because the work was spent on rows that had left it.
 *
 * So OPEN is the default in every mode, `--filed` opts back into the full
 * corpus, and the numbers are printed as one machine-readable stamp that every
 * other counting tool in tools/audit must reproduce exactly — see
 * `openListLine()` and tools/audit/count-agreement.mjs.
 *
 *   node tools/audit/finding-reader.mjs <lesson-id>     one lesson, full detail
 *   node tools/audit/finding-reader.mjs --file <path>   one suspect file (what a fix lane owns)
 *   node tools/audit/finding-reader.mjs --unrouted      the `suspectFile: "unknown"` bucket
 *   node tools/audit/finding-reader.mjs --all           every OPEN id, one per line
 *   node tools/audit/finding-reader.mjs --count         the corpus arithmetic
 *
 * Add `--filed` to any of those to include findings a wave already retired.
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
export const SUPERSEDER = "chunk-redrive.jsonl";

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
export const ADDITIVE = new Set(["chunk-wavec-new.jsonl", "chunk-split.jsonl"]);

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
/**
 * A RETIREMENT WITHOUT EVIDENCE DOES NOT RETIRE ANYTHING — checked on the READ
 * path, not only on the write path.
 *
 * wave-c-post.mjs already refuses to WRITE an unevidenced closure: CLOSED and
 * REFUTED are downgraded to UNJUDGED unless they carry both an evidenceFrame
 * that resolves and an evidenceQuote. But this reader honoured any line with a
 * findingId, so a row arriving by ANY other route — a hand edit, a future tool,
 * a merge, a bug — would silently shrink the open list with nothing behind it.
 * The rule the ledger states is "retirement required a NEW frame and a quote
 * from it"; a rule enforced at one end of a pipe is enforced nowhere.
 *
 * Presence is not resolution either: two closures were once credited on Windows
 * paths destroyed by JSON escaping, which parsed fine and pointed at nothing.
 *
 * Rejections are RETURNED, never silently dropped — the whole failure mode this
 * guards against is a number that moves with no visible reason.
 */
export function loadClosures() {
  const DIR = findCorpus();
  const p = path.join(path.dirname(DIR), "wave-c", "closures.jsonl");
  const out = new Map();
  const rejected = [];
  if (!fs.existsSync(p)) {
    out.rejected = rejected;
    return out;
  }
  // The repo root, so a REPO-RELATIVE evidenceFrame resolves from any cwd.
  //
  // MEASURED 2026-08-26: closures.jsonl held 534 rows — 528 absolute and 6
  // repo-relative. `fs.existsSync` resolves a relative path against the
  // PROCESS cwd, so those 6 resolved from the repo root and vanished from
  // `platform/`. The open count was 511 or 517 depending on which directory
  // you happened to be standing in, and `count-agreement.test.mjs` went red
  // only under `cd platform && node scripts/tools-tests.mjs`. The docstring
  // above this function says the failure mode it guards against is „a number
  // that moves with no visible reason". It was moving with the shell's cwd.
  const REPO = path.dirname(path.dirname(DIR));
  const resolves = (f) => {
    if (!f) return false;
    const slashed = String(f).split("\\").join("/");
    for (const t of [f, slashed, path.resolve(REPO, String(f)), path.resolve(REPO, slashed)]) {
      try {
        if (fs.existsSync(t)) return true;
      } catch {
        /* an unopenable path is not a frame */
      }
    }
    return false;
  };
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    if (!l.trim()) continue;
    let j;
    try {
      j = JSON.parse(l);
    } catch {
      rejected.push({ why: "unparseable line", text: l.slice(0, 80) });
      continue;
    }
    if (!j.findingId) {
      rejected.push({ why: "no findingId", text: JSON.stringify(j).slice(0, 80) });
      continue;
    }
    if (!j.evidenceQuote) {
      rejected.push({ findingId: j.findingId, why: "no evidenceQuote" });
      continue;
    }
    if (!resolves(j.evidenceFrame)) {
      rejected.push({ findingId: j.findingId, why: "evidenceFrame does not resolve" });
      continue;
    }
    out.set(j.findingId, j);
  }
  out.rejected = rejected;
  return out;
}

/** Standing BROKEN minus everything a wave retired with evidence. */
export function loadOpenFindings() {
  const retired = loadClosures();
  return loadStandingBroken().filter((j) => !retired.has(j.findingId));
}

/** Suspect files are compared with forward slashes; `unknown` is a bucket, not a file. */
export const normFile = (s) => String(s || "").split("\\").join("/");
const realFiles = (rows) =>
  new Set(rows.map((j) => normFile(j.suspectFile)).filter((f) => f && f !== "unknown"));

/**
 * THE ONE PLACE THE CORPUS ARITHMETIC IS DONE.
 *
 * Every number any tool in tools/audit prints about the size of this audit comes
 * from here. That is not tidiness — it is the fix for a measured defect. On
 * 2026-08-21 four different readers in this directory answered "how big is the
 * corpus" with four different numbers, and none of them was wrong by accident:
 *
 *   1,043 / 339 critical   finding-reader --count   (filed; additive-aware)
 *     668 / 248 critical   the actual OPEN list     (closures subtracted)
 *   1,038 / 335 critical   never-edited.mjs and the reader make-wave.mjs
 *                          EMBEDS into every generated fix workflow — its own
 *                          copy of the supersession rule, without the ADDITIVE
 *                          clause, so it ate the same 5 rows (4 critical) the
 *                          last incident was about, and it subtracted no
 *                          closures at all
 *   1,012 / 318 critical   the prose in that same generated workflow, which
 *                          told every lane "if your count disagrees, your
 *                          reader is wrong, not the corpus"
 *
 * A lane reading the embedded snippet was therefore handed 370 rows — 87 of
 * them critical — that a wave had already retired with a frame and a quote, and
 * was told the number it computed was authoritative.
 */
/**
 * Findings REPLACED BY A FINER SPLIT — bucket "SPLIT".
 *
 * A compound row that named three complaints could never retire until all
 * three were fixed, so 230 of them were split into 647 atomic children on
 * 2026-08-26. The parent is not closed (it was not fixed) and not refuted (it
 * was not wrong) — it is superseded, so it leaves the open list without a
 * closure, which would have needed a frame it does not have.
 *
 * They are exposed because their 2,722 verdict lines still name them, and a
 * reader that calls those lines "unknown findingId" reports 828 false alarms
 * — which is how a real gap hides in noise.
 */
export function splitParents() {
  return loadAllRows()
    .filter((j) => j.bucket === "SPLIT")
    .map((j) => ({ ...j, findingId: findingId(j) }));
}

export function corpusCounts() {
  const filed = loadStandingBroken();
  const retired = loadClosures();
  const open = filed.filter((j) => !retired.has(j.findingId));
  const sev = (rows, k) => rows.filter((j) => String(j.severity).toLowerCase() === k).length;
  return {
    filed,
    open,
    retiredIds: retired,
    n: {
      filed: filed.length,
      retired: retired.size,
      open: open.length,
      critical: sev(open, "critical"),
      major: sev(open, "major"),
      minor: sev(open, "minor"),
      files: realFiles(open).size,
      lessons: new Set(open.map((j) => j.scenario)).size,
    },
  };
}

/**
 * THE STAMP. One line, one format, emitted by every tool in tools/audit that
 * reports a finding count — and checked for equality across all of them by
 * tools/audit/count-agreement.mjs, which goes RED when any two disagree.
 *
 * WHY A LINE OF TEXT AND NOT JUST A SHARED IMPORT. A shared import makes the
 * tools agree only for as long as they keep using it, and the way this
 * directory drifted last time was precisely that two tools stopped: they grew
 * private copies of the loader. A private copy still compiles, still runs, and
 * still prints a plausible number. So agreement is verified from the OUTSIDE,
 * on what each tool actually printed, by a checker that recomputes the
 * arithmetic itself. A tool that prints no stamp at all fails the same check —
 * silence is the shape every instrument bug in this programme has worn.
 */
export function openListLine(counts = corpusCounts()) {
  const n = counts.n;
  return (
    "OPEN-LIST  filed=" + n.filed + " retired=" + n.retired + " open=" + n.open +
    " critical=" + n.critical + " major=" + n.major + " minor=" + n.minor +
    " files=" + n.files + " lessons=" + n.lessons
  );
}

/**
 * WHAT THIS TOOL ACTUALLY OPERATED ON — measured from the array it is holding.
 *
 * THE STAMP ALONE WAS NOT ENOUGH, AND THE MUTATION BATTERY IS WHAT SAID SO.
 * With only `openListLine()` required, three of the seven damage cases stayed
 * GREEN: change `const broken = counts.open` to `counts.filed` in never-
 * edited.mjs, in wave-c-post.mjs or in make-verdicts2.mjs and the tool goes on
 * printing a perfectly correct OPEN-LIST line — because that line is rendered
 * from a shared helper — while doing all of its work on 1,043 rows instead of
 * 668. The instrument reports the right number and behaves on the wrong one,
 * which is this programme's signature failure wearing a badge that says it has
 * been fixed.
 *
 * So the contract is two lines, and they answer different questions. OPEN-LIST
 * says what the corpus IS. WORKED says what THIS RUN TOUCHED, and it is
 * computed by counting the actual array, so it cannot be satisfied by importing
 * anything. count-agreement.mjs requires both, and requires them to agree.
 */
export function workedLine(scope, rows) {
  const crit = rows.filter((j) => String(j.severity).toLowerCase() === "critical").length;
  return "WORKED  scope=" + scope + " n=" + rows.length + " critical=" + crit;
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
  const argv = process.argv.slice(2);
  const FILED = argv.includes("--filed");
  const positional = argv.filter((a) => !a.startsWith("--"));
  const arg = argv.find((a) => a.startsWith("--") && a !== "--filed") || positional[0];
  if (!arg) {
    console.error(
      "usage: finding-reader.mjs <lesson-id> | --file <suspectFile> | --unrouted | --all | --count\n" +
        "       add --filed to include findings a wave has already retired",
    );
    process.exit(2);
  }

  // An unrecognised flag used to fall through to the lesson branch and print
  // «no standing BROKEN finding for lesson "--fied"» — which is the reassuring
  // direction for a typo: it reads as a clean lesson.
  const KNOWN = new Set(["--count", "--all", "--file", "--unrouted", "--filed"]);
  const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN.has(a));
  if (unknown.length) {
    console.error(
      "unrecognised flag " + unknown.join(", ") + "\n" +
        "known: " + [...KNOWN].join(" ") + "\n" +
        "Refusing rather than ignoring — an ignored typo prints an empty list, and an empty\n" +
        "list reads exactly like a clean one.",
    );
    process.exit(2);
  }

  const counts = corpusCounts();
  const retired = counts.retiredIds;
  const broken = counts.filed;
  // OPEN is the default everywhere. A retired finding handed to a judge is work
  // spent off the open list, and the cheapest verdict to write about something
  // already fixed is CLOSED.
  const rows = FILED ? counts.filed : counts.open;
  const scopeNote = FILED
    ? "# scope: FILED — includes " + retired.size + " finding(s) a wave already retired with evidence."
    : "# scope: OPEN — " + retired.size + " retired finding(s) excluded. Pass --filed to see them.";

  if (arg === "--count") {
    const ids = new Set(broken.map((j) => j.findingId));
    console.log(openListLine(counts));
    console.log(workedLine(FILED ? "filed" : "open", rows));
    console.log("");
    console.log("filed BROKEN    : " + counts.n.filed + "   (the corpus, never rewritten)");
    console.log("retired         : " + counts.n.retired + "   (closures.jsonl, each with a frame and a quote)");
    console.log("OPEN            : " + counts.n.open);
    console.log("lessons open    : " + counts.n.lessons + " of " + new Set(broken.map((j) => j.scenario)).size);
    console.log("suspect files   : " + counts.n.files + " still carrying an OPEN finding");
    console.log(
      "distinct ids    : " + ids.size + (ids.size === broken.length ? "  (collision-free)" : "  <-- COLLISIONS"),
    );
    console.log("");
    console.log("severity        filed  retired    open");
    const sev = {};
    for (const j of broken) (sev[j.severity] = sev[j.severity] || { f: 0, o: 0 }).f++;
    for (const j of counts.open) sev[j.severity].o++;
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
    console.log("# " + openListLine(counts));
    console.log(scopeNote);
    for (const j of rows) {
      console.log(j.findingId + "\t" + j.severity + "\t" + String(j.what).slice(0, 100).replace(/\s+/g, " "));
    }
  } else {
    /**
     * THREE WAYS TO SELECT, ONE READER.
     *
     * `--file` and `--unrouted` exist because make-wave.mjs used to EMBED a
     * twelve-line copy of the corpus loader in every generated fix workflow —
     * its own supersession rule, no ADDITIVE clause, no closures subtraction —
     * and told the lane that ran it "if your count disagrees, your reader is
     * wrong, not the corpus". It disagreed by 370 rows, 87 of them critical.
     * A second implementation of a rule is a second place for the rule to be
     * wrong, and this one could not be tested because it only existed as text
     * inside a generated file.
     */
    let mine, what;
    if (arg === "--file") {
      const want = normFile(argv[argv.indexOf("--file") + 1] || positional[0]);
      if (!want) {
        console.error("--file needs a suspectFile path, e.g. --file platform/src/modules/sim/hud/PlayArea.tsx");
        process.exit(2);
      }
      what = "suspect file " + want;
      mine = rows.filter((j) => normFile(j.suspectFile) === want);
    } else if (arg === "--unrouted") {
      what = 'the "unknown" suspectFile bucket';
      mine = rows.filter((j) => normFile(j.suspectFile) === "unknown");
    } else {
      what = "lesson " + JSON.stringify(arg);
      mine = rows.filter((j) => j.scenario === arg);
    }

    if (!mine.length) {
      // AN EMPTY LIST HAS THREE CAUSES AND THEY ARE NOT THE SAME ANSWER.
      // Cleared-by-a-wave, never-had-any and you-typed-it-wrong all print
      // nothing, and this audit has already concluded "clean" from the third
      // one. So say which it is, from the corpus, rather than making the reader
      // guess from silence.
      const filedHere = FILED
        ? []
        : counts.filed.filter((j) =>
            arg === "--file"
              ? normFile(j.suspectFile) === normFile(argv[argv.indexOf("--file") + 1] || positional[0])
              : arg === "--unrouted"
                ? normFile(j.suspectFile) === "unknown"
                : j.scenario === arg,
          );
      if (filedHere.length) {
        console.error(
          "no OPEN finding for " + what + " — but " + filedHere.length +
            (filedHere.length === 1 ? " was" : " were") + " filed and ALL of them\n" +
            "have been retired with evidence by a wave. That is cleared, not clean-by-absence.\n" +
            "Re-run with --filed to read them and their closures.",
        );
      } else {
        console.error(
          "no standing BROKEN finding for " + what + ".\n" +
            "That is a real answer, not an error — but check the spelling against --all before you\n" +
            "conclude it is clean, because an empty list reads exactly like a clean one.",
        );
      }
      process.exit(1);
    }
    console.log("# " + mine.length + " BROKEN finding(s) for " + what);
    console.log("# " + openListLine(counts));
    console.log(scopeNote);
    console.log("# cite the findingId verbatim in every verdict line you write.\n");
    for (const j of mine) {
      if (FILED && retired.has(j.findingId)) {
        const c = retired.get(j.findingId);
        console.log("RETIRED     : " + c.verdict + " by " + c.closedBy + " — this row is NOT on the open list");
      }
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
