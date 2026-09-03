#!/usr/bin/env node
/**
 * DO ALL THE COUNTERS AGREE ABOUT WHAT IS OPEN?
 *
 * THE INVARIANT: a finding retired with evidence is NOT open, and every tool in
 * tools/audit that reports a count must agree on what the open list is.
 *
 * It was written down before it was true. On 2026-08-21 five tools in this one
 * directory answered "how big is this audit" with four different numbers, and
 * the disagreement was invisible because each tool printed only its own:
 *
 *   1,043 filed / 339 critical   finding-reader --count, additive-aware
 *     668 open  / 248 critical   the actual open list, closures subtracted
 *   1,038      / 335 critical   never-edited.mjs, and the reader make-wave.mjs
 *                               embedded verbatim into every generated fix
 *                               workflow — each with a private copy of the
 *                               supersession rule that predated the ADDITIVE
 *                               clause, so both ate the same 5 rows (4
 *                               critical) the last incident was about, and
 *                               neither subtracted a single closure
 *   1,012      / 318 critical   the prose in that same generated workflow,
 *                               which told every lane "if your count disagrees,
 *                               your reader is wrong, not the corpus"
 *
 * A fix lane doing exactly as instructed was therefore handed 370 rows — 87 of
 * them critical — that a wave had already closed with a new frame and a quote,
 * and was told its own correct measurement was the wrong one.
 *
 * WHY THE CHECK IS FROM THE OUTSIDE. Making the tools share an import fixes
 * today and nothing else: the way this directory drifted was precisely that two
 * tools stopped sharing and grew private loaders, and a private loader still
 * compiles, still runs and still prints a plausible number. So agreement is
 * verified on what each tool ACTUALLY PRINTED, by running it, and the expected
 * value is recomputed here from the corpus rather than imported from the thing
 * under test.
 *
 * WHY SILENCE FAILS. A counter that prints no stamp passes every equality test
 * ever written, because it never says anything to disagree with. That is the
 * shape every instrument bug in this programme has worn — 376 drives that could
 * not steer looked exactly like 376 drives with no reason to — so a corpus
 * reader with no stamp, and a corpus reader with no recipe telling this file
 * how to run it, are both hard failures.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT CHECK, said out loud so the boundary is
 * a decision rather than an omission:
 *
 *  . docs/simulation/88_LESSON_AUDIT.md. It is a dated ledger and its old
 *    sections are SUPPOSED to be stale — a gate that went red every time the
 *    corpus moved is a gate somebody deletes, and then nothing is checked. The
 *    ledger instead carries a dated section naming these commands, so a reader
 *    can recompute rather than trust it.
 *  . the ADDITIVE / SUPERSEDER classification, which is imported above rather
 *    than reimplemented. Holding a second opinion here about which sources are
 *    stale would make this file an author of the answer it is checking.
 *    MEASURED: emptying ADDITIVE leaves this check GREEN and turns
 *    finding-reader.test.mjs RED ("no UNCLASSIFIED corpus source is being eaten
 *    by supersession"), which is the correct division of labour and is case 10
 *    of the mutation battery recorded in count-agreement.test.mjs.
 *
 * WHAT IT COSTS, because a gate nobody can afford gets deleted. MEASURED on
 * this box, warm: 1.67 s end to end — six child processes, each of which parses
 * the 1.4 MB corpus and one of which generates a whole workflow. It runs inside
 * `node platform/scripts/tools-tests.mjs`, which takes 131 s, so it is ~1% of
 * the gate it lives in.
 *
 *   node tools/audit/count-agreement.mjs           check, exit 1 on disagreement
 *   node tools/audit/count-agreement.mjs --verbose show each tool's stamp
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SUPERSEDER, ADDITIVE, findingId, normFile } from "./finding-reader.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const AUDIT_DIR = HERE;

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

/**
 * THE INDEPENDENT RECOMPUTATION.
 *
 * This deliberately does NOT call corpusCounts(). If it did, every tool would
 * be compared against the same function they all already call, and the only
 * defect the comparison could catch is a tool that stopped calling it — while a
 * bug inside it would make all six agree on the same wrong number and print a
 * confident green.
 *
 * What IS imported is the classification: which file supersedes, and which
 * files are additive. Those are declarations about the corpus, not arithmetic,
 * and duplicating them here would mean this check quietly asserting its own
 * opinion about which sources are stale. They have their own test — see
 * "no UNCLASSIFIED corpus source is being eaten by supersession" in
 * finding-reader.test.mjs, which goes red the next time a source file is added
 * without a decision. The arithmetic below — parse, supersede, filter to
 * BROKEN, derive ids, subtract closures, tally — is written out again from
 * scratch, because that is the half that drifted.
 */
export function recompute() {
  const DIR = path.join(REPO, ".audit-frames", "findings");
  const rows = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".jsonl")) continue;
    for (const line of fs.readFileSync(path.join(DIR, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        j.__src = f;
        rows.push(j);
      } catch {
        /* a torn tail line is not a reason to drop the file */
      }
    }
  }
  const key = (j) => j.lesson || j.lessonId || j.scenario || j.id || null;
  const replaced = new Set(rows.filter((j) => j.__src === SUPERSEDER).map(key).filter(Boolean));
  const filed = rows
    .filter((j) => j.__src === SUPERSEDER || ADDITIVE.has(j.__src) || !(key(j) && replaced.has(key(j))))
    .filter((j) => j.bucket === "BROKEN")
    .map((j) => ({ ...j, findingId: findingId(j) }));

  const retired = new Set();
  const cp = path.join(REPO, ".audit-frames", "wave-c", "closures.jsonl");
  if (fs.existsSync(cp)) {
    for (const line of fs.readFileSync(cp, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.findingId) retired.add(j.findingId);
      } catch {
        /* a torn tail line does not un-retire a finding */
      }
    }
  }

  const open = filed.filter((j) => !retired.has(j.findingId));
  const sev = (k) => open.filter((j) => String(j.severity).toLowerCase() === k).length;
  return {
    filed: filed.length,
    retired: retired.size,
    open: open.length,
    critical: sev("critical"),
    major: sev("major"),
    minor: sev("minor"),
    files: new Set(open.map((j) => normFile(j.suspectFile)).filter((f) => f && f !== "unknown")).size,
    lessons: new Set(open.map((j) => j.scenario)).size,
  };
}

/**
 * The stamp is matched by CONTENT, not by position on a line.
 *
 * A generated workflow carries it as a `//` comment and again inside two string
 * literals, so an `^OPEN-LIST` anchor found none of them and reported the
 * generator silent while it was in fact correct — a false red, which trains a
 * reader to ignore this check as surely as a false green does.
 *
 * The pattern is the key=value run rather than the exact field list, so adding
 * a field to openListLine() does not turn every counter red at once. A stamp
 * that is TRUNCATED still matches and then fails the equality, which is the
 * right way round.
 */
export const STAMP_RE = /OPEN-LIST(?:\s+[a-z]+=\d+)+/g;

/**
 * THE SECOND LINE, AND WHY THERE HAD TO BE ONE.
 *
 * With only OPEN-LIST required, this check passed three of its own seven damage
 * cases. Change `const broken = counts.open` to `counts.filed` in
 * never-edited.mjs, wave-c-post.mjs or make-verdicts2.mjs and each one keeps
 * printing a perfectly correct stamp — it is rendered from a shared helper —
 * while doing every scrap of its work on 1,043 rows instead of 668. MEASURED:
 * gate before=0, gate after=0, all three times.
 *
 * That is this programme's signature failure wearing a badge that says it has
 * been fixed, so the contract is two lines answering two questions. OPEN-LIST
 * is what the corpus IS. WORKED is what the run TOUCHED, and `workedLine()`
 * builds it by counting the array the tool is holding, which no amount of
 * importing can fake.
 */
// scope allows hyphens: a tool whose scope is not the whole open list needs a
// name that says so ("split-parents", "split-open-children"). With [a-z]+ the
// regex matched "scope=split" and then failed on "-parents", so a tool that DID
// print a correct WORKED line was reported as printing none — the check accused
// it of the one thing it had not done, which is worse than not checking.
export const WORKED_RE = /WORKED\s+scope=[a-z][a-z-]*(?:\s+[a-z]+=\d+)+/g;

const distinct = (text, re) =>
  [...new Set((String(text || "").match(re) || []).map((s) => s.trim().replace(/\s+/g, " ")))];

/** Every distinct stamp in a piece of text, normalised. */
export const stampsOf = (text) => distinct(text, STAMP_RE);
export const workedOf = (text) => distinct(text, WORKED_RE);

export const stampOf = (text) => stampsOf(text)[0] ?? null;
export const stampFrom = (n) =>
  ("OPEN-LIST filed=" + n.filed + " retired=" + n.retired + " open=" + n.open +
    " critical=" + n.critical + " major=" + n.major + " minor=" + n.minor +
    " files=" + n.files + " lessons=" + n.lessons);

export const workedFrom = (n) => "WORKED scope=open n=" + n.open + " critical=" + n.critical;

/**
 * WHICH FILES MUST CARRY A STAMP — decided by SHAPE, never by a list of names.
 *
 * A hand-written list of counters is the same defect one level up: the next
 * tool added to this directory would be absent from it and would be checked by
 * nobody, exactly as never-edited.mjs was. So the population is derived — any
 * .mjs here whose CODE reaches the findings corpus is a counter — and a counter
 * this file does not know how to run is a hard failure rather than a skip.
 *
 * Comments are stripped first. Half the files in this directory explain a
 * defect by quoting the code that caused it, and a scan that cannot tell code
 * from prose about code classifies on prose. check-workflow.mjs, verdict-
 * surface.mjs and wave-c-merge.mjs all name the corpus in their headers and
 * none of them reads it; all three drop out once the comments are gone.
 */
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote = null;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (quote) {
      if (c === "\\") {
        out += c + (d ?? "");
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      out += c;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Code that reaches `.audit-frames/findings`, closures.jsonl, or the reader. */
const CORPUS_RE = /finding-reader|closures\.jsonl|["']findings["']|audit-frames[\\/]+findings/;

export function findCounters(dir = AUDIT_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && f !== "count-agreement.mjs")
    .filter((f) => CORPUS_RE.test(stripComments(fs.readFileSync(path.join(dir, f), "utf8"))))
    .sort();
}

/**
 * HOW TO RUN EACH COUNTER SO THAT IT PRINTS ITS NUMBER.
 *
 * `emits: "file"` means the stamp is not (only) on stdout but baked into
 * something the tool WRITES — make-wave.mjs generates a workflow that a fix lane
 * will read days later, and the number a lane is handed is the number that
 * matters. Checking the generator's stdout alone would have cleared the exact
 * defect this file exists for: the stale figures were in the generated prose,
 * not in the console output.
 */
export const RECIPES = {
  "finding-reader.mjs": (t) => ({ args: ["--count"] }),
  "verdict-coverage.mjs": (t) => ({ args: [] }),
  "never-edited.mjs": (t) => ({ args: ["--all"] }),
  "wave-c-post.mjs": (t) => ({ args: [] }),
  // Both split tools are REPORT-ONLY without --apply, so the agreement check
  // runs them exactly as a reader would and they touch nothing.
  "apply-splits.mjs": (t) => ({ args: [] }),
  "emit-split-verdicts.mjs": (t) => ({ args: [] }),
  "make-verdicts2.mjs": (t) => ({ args: [path.join(t, "verdicts-out")] }),
  // Emits a repair-round workflow, so it is handed to a temp path and never to
  // the real batches directory. Registered the day it was written, because this
  // check refused the round it appeared in — which is the whole point of it.
  // Emits the repair wave a lane will read days later, so it is handed a temp
  // path and never .audit-frames/. Registered 2026-08-30, after the check
  // caught it unregistered — which is exactly what it is for.
  // Writes the sweep work-list, so it is handed a temp --out and never the real
  // .audit-frames/waveC-redrive.json that a running sweep reads.
  "build-redrive.mjs": (t) => ({ args: ["--out", path.join(t, "redrive-probe.json")] }),
  // Report-only without --apply, so the check runs it exactly as a reader would
  // and it touches nothing.
  "apply-reroute.mjs": (t) => ({ args: [] }),
  // The lesson-grouped wave generator (2026-09-03) — the shape that took wave
  // output from 71 lines to 3,090. Registered the day it moved into the repo,
  // because this check refused the round it appeared in, which is exactly what
  // it is for. One argument, the output path; it honours an absolute one so
  // this probe never touches the .audit-frames work-list a sweep may be reading.
  "make-lesson-wave.mjs": (t) => {
    const out = path.join(t, "lesson-wave-probe.js");
    return { args: [out], emits: "file", file: out };
  },
  "make-repair-wave.mjs": (t) => {
    const out = path.join(t, "repair-wave-probe.js");
    return { args: [out, "1", "1"], emits: "file", file: out };
  },
  "make-repair-round.mjs": (t) => {
    const out = path.join(t, "repair-probe.js");
    return { args: ["0", out], emits: "file", file: out };
  },
  "make-wave.mjs": (t) => {
    const lanes = path.join(t, "lanes.json");
    fs.writeFileSync(
      lanes,
      JSON.stringify([
        {
          key: "count-agreement",
          label: "count-agreement",
          owns: "tools/audit/count-agreement.mjs",
          brief: "generated only so the agreement check can read the corpus figures a lane is handed.",
          total: 1,
          critical: 0,
        },
      ]),
    );
    const out = path.join(t, "wave.js");
    return { args: [lanes, out, "count-agreement", "agreement probe"], emits: "file", file: out };
  },
};

/**
 * A fingerprint of the corpus and the closures, so a DISAGREEMENT can be told
 * apart from a MOVING TARGET.
 *
 * This check is not atomic: it recomputes the census, then shells out to seven
 * tools in turn. If a finding is filed or retired in between, every tool run
 * after that moment reports a different — and correct — number, and the check
 * calls it a disagreement. That happened twice in one session while repair
 * agents were appending new findings, and each time a verifier spent real effort
 * chasing a red that reproduced green the moment the corpus stopped moving.
 *
 * A check that cries wolf gets switched off, so it must say which of the two it
 * is looking at.
 */
function corpusFingerprint() {
  const parts = [];
  const base = path.join(REPO, ".audit-frames");
  for (const dir of [path.join(base, "findings"), path.join(base, "wave-c")]) {
    let names = [];
    try {
      names = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
    } catch {
      continue;
    }
    for (const f of names) {
      try {
        const st = fs.statSync(path.join(dir, f));
        parts.push(f + ":" + st.size + ":" + Math.round(st.mtimeMs));
      } catch {
        /* a file that vanished mid-check is itself movement */
        parts.push(f + ":gone");
      }
    }
  }
  return parts.join("|");
}

export function check({ verbose = false } = {}) {
  const fingerprintBefore = corpusFingerprint();
  const n = recompute();
  const expected = stampFrom(n);
  const expectedWorked = workedFrom(n);
  const counters = findCounters();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "knijka-count-"));
  const results = [];
  const problems = [];

  try {
    for (const file of counters) {
      const make = RECIPES[file];
      if (!make) {
        problems.push(
          file + " reads the findings corpus and this check does not know how to run it.\n" +
            "      Add a recipe to RECIPES in count-agreement.mjs. A new counter that nobody\n" +
            "      compares is how four tools ended up printing four different totals.",
        );
        results.push({ file, stamp: null, why: "no recipe" });
        continue;
      }
      const spec = make(tmp);
      const r = spawnSync(process.execPath, [path.join(AUDIT_DIR, file), ...spec.args], {
        cwd: REPO,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const where = spec.emits === "file" ? "the file it generated" : "stdout";
      let text = (r.stdout || "") + "\n" + (r.stderr || "");
      if (spec.emits === "file") {
        text = fs.existsSync(spec.file) ? fs.readFileSync(spec.file, "utf8") : "";
      }
      const stamps = stampsOf(text);
      const worked = workedOf(text);
      results.push({ file, stamp: stamps[0] ?? null, stamps, worked, where });

      // Line 1 — what the corpus IS.
      if (!stamps.length) {
        // Say WHY it was silent. A tool that refused to run (no drive ledger, a
        // bad argument) and a tool that ran and forgot the stamp produce the
        // same empty match, and sending a reader to add a `console.log` to a
        // tool that never reached it is a wasted round.
        const tail = String(r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" / ").slice(0, 160);
        problems.push(
          file + " reads the findings corpus and printed NO OPEN-LIST stamp to " + where +
            "   [exit " + (r.status ?? "?") + "]" + (tail ? "\n        it said: " + tail : "") + "\n" +
            "      Silence agrees with everything. If it ran, emit openListLine() from\n" +
            "      finding-reader.mjs; if it refused to run, fix that first.",
        );
      } else if (stamps.length > 1) {
        // One artifact carrying two different totals is worse than a stale one:
        // whichever a reader happens to look at, the other says otherwise.
        problems.push(
          file + " emits " + stamps.length + " DIFFERENT stamps in " + where + ":\n" +
            stamps.map((s) => "        " + s).join("\n"),
        );
      } else if (stamps[0] !== expected) {
        problems.push(
          file + " disagrees with the corpus:\n" +
            "        it says    " + stamps[0] + "\n" +
            "        recomputed " + expected,
        );
      }

      // Line 2 — what the run TOUCHED. Three of this check's own damage cases
      // passed until this existed, because the stamp is rendered from a shared
      // helper and stays right while the tool works on the wrong set.
      if (!worked.length) {
        problems.push(
          file + " printed no WORKED line to " + where + ".\n" +
            "      The stamp says what the corpus is; it does not say what this tool operated on,\n" +
            "      and a tool can print a correct stamp while iterating the filed corpus. Emit\n" +
            "      workedLine(scope, <the array you actually use>) from finding-reader.mjs.",
        );
      } else if (worked.length > 1) {
        problems.push(
          file + " emits " + worked.length + " DIFFERENT WORKED lines in " + where + ":\n" +
            worked.map((s) => "        " + s).join("\n"),
        );
      } else if (worked[0] !== expectedWorked) {
        /**
         * A SUBSET IS NOT A DISAGREEMENT — but it must be a subset of the OPEN
         * list, and it must be declared.
         *
         * Some tools legitimately operate on part of the corpus: a repair round
         * takes the six files carrying the most criticals, not all 118. Demanding
         * they match the whole open list would make the check unusable for them,
         * and the fix people reach for in that situation is to stop running the
         * check — which is worse than a loose check.
         *
         * The failure this still catches is the one that actually happened: a
         * tool iterating the FILED corpus (1,045) or a stale snapshot (1,012)
         * while printing a correct stamp. Those are not subsets of the open list
         * — they are larger, or they carry counts the open list cannot produce.
         * So: same scope, and strictly not larger than open. Anything else is a
         * disagreement.
         */
        const parse = (s) => {
          const m = /scope=(\S+)\s+n=(\d+)\s+critical=(\d+)/.exec(s);
          return m ? { scope: m[1], n: Number(m[2]), critical: Number(m[3]) } : null;
        };
        const got = parse(worked[0]);
        const want = parse(expectedWorked);
        const isDeclaredSubset =
          got && want && got.scope === want.scope && got.n <= want.n && got.critical <= want.critical;
        if (!isDeclaredSubset) {
          problems.push(
            file + " reports the right corpus and OPERATES ON A SET THAT IS NOT A SUBSET OF IT:\n" +
              "        it worked on " + worked[0] + "\n" +
              "        the open list is " + expectedWorked + "\n" +
              "      A tool may work on PART of the open list — a repair round takes the few files\n" +
              "      carrying the most criticals. It may not work on MORE than the open list, or on\n" +
              "      a different scope: that is the shape of a tool reading the filed corpus or a\n" +
              "      stale snapshot while printing a correct stamp.",
          );
        }
        // No second results row: the loop already recorded this file at line 353,
        // and pushing again listed it twice in the tools census — a check that
        // miscounts its own subjects is not one to trust about counts.
      }
    }
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* a temp directory that outlives the run is not a wrong number */
    }
  }

  if (!counters.length) {
    problems.push(
      "no corpus-reading tool was found in " + AUDIT_DIR + " at all — the detector is broken,\n" +
        "      and a check that examines nothing passes for the same reason it is useless.",
    );
  }

  // A disagreement found while the corpus was being written is a MOVING TARGET,
  // not a wrong number. Say so instead of accusing a tool: this check is not
  // atomic, and twice in one session a verifier chased a red that reproduced
  // green the moment the repair agents stopped filing findings.
  const moved = corpusFingerprint() !== fingerprintBefore;
  if (moved && problems.length) {
    const note = [
      "THE CORPUS MOVED WHILE THIS CHECK RAN — " + problems.length + " apparent disagreement(s)",
      "      are reported as INCONCLUSIVE, not as failures. This check recomputes the census",
      "      and then runs seven tools in turn, so a finding filed or retired in between makes",
      "      every later tool correctly report a different number. Re-run on a still corpus.",
      ...problems.map((p) => "      would have said: " + String(p).split("\n")[0]),
    ].join("\n");
    return { expected, expectedWorked, results, problems: [], moved, note, ok: true };
  }
  return { expected, expectedWorked, results, problems, moved, ok: problems.length === 0 };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const verbose = process.argv.includes("--verbose");
  const { expected, expectedWorked, results, problems, ok } = check({ verbose });
  console.log("recomputed independently : " + expected);
  console.log("                           " + expectedWorked);
  console.log("corpus-reading tools     : " + results.length + "   (" + results.map((r) => r.file).join(", ") + ")");
  if (verbose) {
    console.log("");
    for (const r of results) {
      console.log("  " + r.file.padEnd(24) + (r.stamp || "(NO STAMP)"));
      console.log("  " + "".padEnd(24) + ((r.worked || [])[0] || "(NO WORKED LINE)"));
    }
  }
  if (ok) {
    console.log("");
    console.log("AGREED — every counter reports the same open list.");
    process.exit(0);
  }
  console.log("");
  console.log(problems.length + " DISAGREEMENT(S):");
  for (const p of problems) console.log("   " + p);
  console.log("");
  console.log("A number in a report is not a small thing here: the last two drifts sent a repair");
  console.log("round at findings that were already closed and told it its own reader was wrong.");
  process.exit(1);
}
