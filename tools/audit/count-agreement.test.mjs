// Run: node --test tools/audit/count-agreement.test.mjs
// (collected automatically by `node platform/scripts/tools-tests.mjs`.)
//
// THESE RUN AGAINST THE REAL TOOLS AND THE REAL CORPUS. The property being
// guarded is a property of this directory as it actually is: that every tool in
// it which reads the findings corpus reports the same open list. A fixture
// would test a copy of the tools, and the copy is not what a wave runs.
//
// SO THEY ASSERT AGREEMENT, NOT TODAY'S TOTALS. The open list is 668 as this is
// written and will move with the next wave. A test pinned to 668 would be
// edited to whatever the code printed, which is how a test stops being
// evidence.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  check,
  corpusFingerprint,
  findCounters,
  recompute,
  report,
  stampFrom,
  stampsOf,
  workedFrom,
  workedOf,
  stripComments,
  verdictOf,
  RECIPES,
  AUDIT_DIR,
} from "./count-agreement.mjs";
import { openListLine, workedLine, loadOpenFindings } from "./finding-reader.mjs";

test("every corpus-reading tool in tools/audit reports the same open list", () => {
  // THE INCIDENT. Five tools here answered "how big is this audit" with four
  // different numbers: 1,043 filed / 668 open / 1,038 from two private loaders
  // that predated the ADDITIVE clause and subtracted no closures / 1,012 typed
  // into the prose of every generated fix workflow. A lane obeying that brief
  // worked through 370 rows, 87 of them critical, that were already closed.
  //
  // WATCHED RED, 2026-08-21, ten mutations, each restored and sha256-verified:
  //   1  never-edited.mjs      counts.open -> counts.filed        red (WORKED)
  //   2  verdict-coverage.mjs  stamp not printed                  red (silence)
  //   3  make-wave.mjs         stamp baked stale in the workflow  red (OPEN-LIST)
  //   4  wave-c-post.mjs       counts.open -> counts.filed        red (WORKED)
  //   5  make-verdicts2.mjs    counts.open -> counts.filed        red (WORKED)
  //   6  finding-reader.mjs    closures no longer subtracted      red (OPEN-LIST)
  //   7  make-wave.mjs         WORKED baked stale                 red (WORKED)
  //   8  verdict-surface.mjs   made a counter, given no recipe    red (no recipe)
  //   9  count-agreement.mjs   detector narrowed to match nothing red (examines nothing)
  //  10  finding-reader.mjs    ADDITIVE emptied                   GREEN here, red in
  //                            finding-reader.test.mjs — the documented boundary,
  //                            because this file imports that declaration rather
  //                            than holding a second opinion about it.
  //
  // 1, 4, 5 and 7 were GREEN before workedLine() existed.
  //
  //  11  the corpus MOVES mid-run, 2026-09-19. Planting one new source in
  //      .audit-frames/findings 15 s into a 49.5 s run produced 14 real
  //      apparent disagreements — and this test passed, because the branch it
  //      took handed back `problems: []` with `ok: true`. The assertion below
  //      now reads the VERDICT before it reads `problems`, so an inconclusive
  //      run fails here, saying re-run, instead of certifying the count.
  const r = check();
  assert.ok(r.results.length >= 5, "the counter detector found almost nothing — it is broken, not the directory");
  assert.notEqual(
    r.verdict,
    "inconclusive",
    "THE CORPUS MOVED while this ran, so agreement was not measured on a still tree. " +
      "Re-run on a still corpus — an INCONCLUSIVE run is not a pass:\n" + r.note,
  );
  assert.deepEqual(r.problems, [], "counters disagree about the open list");
  assert.equal(r.ok, true);
  assert.equal(r.verdict, "agreed");
  assert.equal(stampsOf(r.expected).length, 1, "the recomputed stamp is not well formed");
  assert.equal(workedOf(r.expectedWorked).length, 1, "the recomputed WORKED line is not well formed");
});

// THE PRINTER, DRIVEN DIRECTLY — one synthetic result per verdict.
//
// Every test above this line calls check() and reads its fields, and check()
// was never wrong: on a moved corpus it built a note naming the apparent
// disagreements. (How MANY is a property of the race, not of the code — the
// counters are spawned one at a time, so it is however many of the 17 had yet
// to run when the corpus moved; observed 14, 16 and 17 at different offsets.
// An earlier draft of this comment quoted one of them as if it were fixed.)
// The defect was that the CLI destructured five of its fields
// and not that one, so the reason was computed and thrown away, and the run
// printed "AGREED — every counter reports the same open list." and exited 0.
// Nothing here could see that, because nothing here ran the printer.
//
// So these hand report() a result and read back BOTH the exit code and every
// line it printed. No corpus, no race, no 50 s — a test that needs a repair
// agent to be filing findings at the right second is a test nobody re-runs.
const CLI_RESULT = {
  expected: "OPEN-LIST filed=9 retired=4 open=5 critical=2 major=3 minor=0 files=2 lessons=2",
  expectedWorked: "WORKED scope=open n=5 critical=2",
  results: [{ file: "never-edited.mjs", stamp: "OPEN-LIST filed=9", worked: ["WORKED scope=open n=9 critical=2"] }],
};
const runCli = (r) => {
  const lines = [];
  const code = report({ ...CLI_RESULT, ...r }, { log: (s) => lines.push(String(s)) });
  return { code, out: lines.join("\n") };
};

test("the CLI exits 0 only on agreement, and never prints AGREED over a reason it holds", () => {
  const agreed = runCli({ problems: [], moved: false, note: null, verdict: "agreed", ok: true });
  assert.equal(agreed.code, 0);
  assert.match(agreed.out, /AGREED/);

  const disagreed = runCli({
    problems: ["never-edited.mjs disagrees with the corpus"],
    moved: false,
    note: null,
    verdict: "disagreed",
    ok: false,
  });
  assert.equal(disagreed.code, 1);
  assert.doesNotMatch(disagreed.out, /AGREED/);
  assert.match(disagreed.out, /1 DISAGREEMENT/);
  assert.match(disagreed.out, /never-edited\.mjs disagrees/);

  // THE FAIL-OPEN, 2026-09-19: this exact case printed the agreed output and
  // exited 0 while holding two reasons not to.
  const moved = runCli({
    problems: ["never-edited.mjs disagrees with the corpus", "wave-c-post.mjs disagrees with the corpus"],
    moved: true,
    note: "THE CORPUS MOVED WHILE THIS CHECK RAN — 2 apparent disagreement(s)",
    verdict: "inconclusive",
    ok: false,
  });
  assert.notEqual(moved.code, 0, "a moved corpus holding disagreements must NOT exit 0 — that is the fail-open");
  assert.equal(moved.code, 2, "inconclusive is its own exit code, so a caller can tell it from a real red");
  assert.doesNotMatch(moved.out, /AGREED/, "INCONCLUSIVE must never print the word wave-cycle.sh greps for");
  assert.match(moved.out, /THE CORPUS MOVED/, "the reason was computed; it must be PRINTED, not discarded");
  assert.match(moved.out, /never-edited\.mjs disagrees/, "what it would have said must reach the operator in full");
  assert.match(moved.out, /INCONCLUSIVE/);
});

test("a moved corpus that changed no count still AGREES — and still says it moved", () => {
  // The other half of the boundary. Bumping an mtime, or filing a row that no
  // counter's arithmetic can see, moves the fingerprint without moving a single
  // number: all seventeen matched the census recomputed before it moved, so
  // that is agreement and refusing it would make this check cry wolf — which is
  // how the suppression got written in the first place. It may not be SILENT,
  // though: "it moved and nothing came of it" and "it moved and nobody looked"
  // print the same green otherwise.
  const quiet = runCli({ problems: [], moved: true, note: null, verdict: "agreed", ok: true });
  assert.equal(quiet.code, 0);
  assert.match(quiet.out, /AGREED/);
  assert.match(quiet.out, /moved/, "a corpus that moved is never passed over in silence");
});

// -----------------------------------------------------------------------------
// THE INCONCLUSIVE BRANCH, DRIVEN WITHOUT A RACE — 2026-09-19.
//
// Everything above reads check()'s FIELDS or hands report() a hand-built
// result. Neither touches the one thing that decides which verdict check()
// computes: `corpusFingerprint()`, which was module-private and read the real
// filesystem. The only way to make check() itself return "inconclusive" was to
// plant a file in .audit-frames/findings during the 19-90 s window while it
// shelled out to seventeen tools — which is how the fail-open was found, and is
// not a test anybody can re-run on demand.
//
// So the fingerprint and the counter list are injectable now, both defaulted to
// the real thing. These four tests need no corpus to be tampered with, spawn no
// child process, and finish in the time recompute() takes.
// -----------------------------------------------------------------------------

/** A fingerprint function that returns each value in turn, then repeats the last. */
const fingerprints = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

/** A counter this file has no recipe for: a real problem, pushed by the real loop. */
const NO_RECIPE = ["zz-not-a-real-counter.mjs"];

test("check() returns INCONCLUSIVE when the corpus moved under a disagreement", () => {
  const r = check({ io: { fingerprint: fingerprints("before", "after"), counters: NO_RECIPE } });

  assert.equal(r.moved, true, "two different fingerprints is a moved corpus");
  assert.ok(r.problems.length > 0, "the no-recipe counter must produce a real problem, not a synthetic one");
  assert.equal(r.verdict, "inconclusive");
  assert.equal(r.ok, false, "this is the field every existing caller reads, and it is the fail-closed one");
  assert.ok(r.note && /THE CORPUS MOVED/.test(r.note), "the reason must be ON the returned object, not only in a log line");
  assert.match(r.problems[0], /zz-not-a-real-counter\.mjs/, "the apparent disagreement must still be reported in full");

  // …and end to end through the printer, which is where the 27-day fail-open
  // actually lived: computed correctly, destructured away.
  const lines = [];
  const code = report(r, { log: (s) => lines.push(String(s)) });
  assert.equal(code, 2);
  assert.doesNotMatch(lines.join("\n"), /AGREED/);
});

test("the SAME disagreement on a STILL corpus is a plain red, so the fingerprint is what divides them", () => {
  // The control. If this also came back "inconclusive" the branch would be
  // keyed on something other than movement, and the distinction the whole
  // mechanism exists to draw would be decorative.
  const r = check({ io: { fingerprint: fingerprints("same"), counters: NO_RECIPE } });

  assert.equal(r.moved, false);
  assert.equal(r.verdict, "disagreed");
  assert.equal(r.ok, false);
  assert.equal(r.note, null);
  assert.equal(report(r, { log: () => {} }), 1, "a real disagreement is exit 1, never the inconclusive 2");
});

test("the DEFAULT fingerprint is the real one — injection may not have emptied it", () => {
  // THE RISK THIS INJECTION CREATES, and the first version of this test did not
  // close it. A default of `() => ""` makes `moved` false for ever and restores
  // the 27-day fail-open, and MEASURED 2026-09-19 that mutation left all four
  // of these tests green: the three above pass their own fingerprint in, and
  // this one was calling corpusFingerprint() directly — asserting that the real
  // function is real, which nobody doubted, while saying nothing about whether
  // check() still calls it. A guard that cannot fail is the defect this whole
  // round is about, so the assertion is now on the key CHECK ITSELF measured.
  const real = corpusFingerprint();
  assert.ok(real.length > 0, "the real fingerprint is empty — check() can no longer see the corpus move");
  assert.match(real, /\.jsonl:\d+:\d+/, "it must key on the corpus files' size and mtime, not on their names alone");
  assert.equal(corpusFingerprint(), real, "a still corpus must fingerprint the same twice, or every run cries wolf");

  // No `fingerprint` in the io: this is check()'s own default, doing its own
  // measuring. Compared by FILE NAME rather than byte-for-byte, because a size
  // or an mtime may legitimately move between the two calls — this box runs
  // several agents against one corpus, which is the entire reason the
  // INCONCLUSIVE branch exists — while a corpus FILE appearing mid-test would
  // invalidate every other test in this file too.
  const names = (fp) => fp.split("|").map((p) => p.split(":")[0]);
  const own = check({ io: { counters: NO_RECIPE } }).fingerprint;
  assert.ok(own.length > 0, "check()'s default fingerprint returned nothing — `moved` is now false for ever");
  assert.match(own, /\.jsonl:\d+:\d+/);
  assert.deepEqual(
    names(own),
    names(real),
    "check() measured movement against something other than the corpus it is certifying",
  );
});

test("corpusFingerprint keys on size and mtime, and a vanished file is itself movement", () => {
  // Driven with injected io in the shape reclosure.mjs uses, so what the key is
  // MADE of is asserted rather than described.
  const io = (size, mtimeMs) => ({
    readDir: () => ["a.jsonl", "b.txt"],
    stat: () => ({ size, mtimeMs }),
  });
  const base = corpusFingerprint("/fake", io(10, 1000));
  assert.equal(base, "a.jsonl:10:1000|a.jsonl:10:1000", "both corpus directories are walked; .txt is not a corpus file");
  assert.notEqual(corpusFingerprint("/fake", io(11, 1000)), base, "a file that grew is a corpus that moved");
  assert.notEqual(corpusFingerprint("/fake", io(10, 1001)), base, "a file that was rewritten is a corpus that moved");

  const gone = corpusFingerprint("/fake", {
    readDir: () => ["a.jsonl"],
    stat: () => {
      throw new Error("ENOENT");
    },
  });
  assert.match(gone, /a\.jsonl:gone/, "a file that disappeared mid-check must read as movement, not as an empty key");

  assert.equal(
    corpusFingerprint("/fake", {
      readDir: () => {
        throw new Error("ENOENT");
      },
      stat: () => ({ size: 1, mtimeMs: 1 }),
    }),
    "",
    "an unreadable directory is skipped rather than thrown — this runs twice around a 19-90 s check",
  );
});

test("ok is the fail-closed field, so a caller that never learns `verdict` still refuses", () => {
  // THE WHOLE TRUTH TABLE, in four lines, needing no corpus and no race.
  //
  // The safety may not live in the new field alone: every existing caller reads
  // `ok` — this file, and the CLI — and one that never hears the word "verdict"
  // must still fail closed when the corpus moves under a disagreement.
  // Row 4 is the defect: it returned ok:true.
  assert.deepEqual(verdictOf({ problems: [], moved: false }), { verdict: "agreed", ok: true });
  assert.deepEqual(verdictOf({ problems: [], moved: true }), { verdict: "agreed", ok: true });
  assert.deepEqual(verdictOf({ problems: ["x"], moved: false }), { verdict: "disagreed", ok: false });
  assert.deepEqual(verdictOf({ problems: ["x"], moved: true }), { verdict: "inconclusive", ok: false });
});

test("WORKED is counted from the array, so it cannot be faked by importing", () => {
  // This is the whole point of the second line. openListLine() renders from a
  // shared helper and stays correct no matter what the caller then iterates;
  // workedLine() can only say what it was handed.
  assert.equal(workedLine("open", loadOpenFindings()).replace(/\s+/g, " "), workedFrom(recompute()));
  assert.equal(workedLine("open", []).replace(/\s+/g, " "), "WORKED scope=open n=0 critical=0");
  assert.notEqual(workedLine("filed", loadOpenFindings()).replace(/\s+/g, " "), workedFrom(recompute()));
});

test("the independent recomputation matches finding-reader, without being it", () => {
  // count-agreement.mjs recomputes the arithmetic from scratch rather than
  // calling corpusCounts(). If it called it, the only defect the comparison
  // could ever catch is a tool that stopped calling it — a bug INSIDE it would
  // make all six agree on the same wrong number and print a confident green.
  assert.equal(stampFrom(recompute()), openListLine().replace(/\s+/g, " "));
});

test("a corpus-reading tool with no recipe fails, and is not skipped", () => {
  // The population is derived by shape so that the NEXT tool added here is
  // checked without anybody remembering to add it. That only helps if an
  // unknown counter is a failure: a skip would reproduce the original defect,
  // where never-edited.mjs was compared with nothing for months.
  for (const f of findCounters()) {
    assert.ok(
      typeof RECIPES[f] === "function",
      f + " reads the corpus and has no recipe — add one to RECIPES, do not remove it from the scan",
    );
  }
});

test("classification reads code, not prose about code", () => {
  const counters = new Set(findCounters());
  // These three name the corpus in their headers and none of them reads it.
  // Before comments were stripped, all three classified as counters and the
  // check demanded a stamp from tools that have no number to report.
  for (const f of ["check-workflow.mjs", "verdict-surface.mjs", "wave-c-merge.mjs"]) {
    if (fs.existsSync(path.join(AUDIT_DIR, f))) {
      assert.ok(!counters.has(f), f + " does not read the findings corpus and must not be asked for a stamp");
    }
  }
  for (const f of ["finding-reader.mjs", "never-edited.mjs", "wave-c-post.mjs", "verdict-coverage.mjs"]) {
    assert.ok(counters.has(f), f + " reads the findings corpus and must be checked");
  }
});

test("stripComments keeps strings and drops both comment forms", () => {
  const src = [
    'const a = "keep//this";',
    "// drop this finding-reader mention",
    "/* and finding-reader in here too */",
    "const b = 'http://example.test/x';",
  ].join("\n");
  const out = stripComments(src);
  assert.ok(out.includes('"keep//this"'), "a // inside a string literal is not a comment");
  assert.ok(out.includes("http://example.test/x"), "a URL inside a string literal is not a comment");
  assert.ok(!out.includes("drop this"), "line comments must go");
  assert.ok(!out.includes("in here too"), "block comments must go");
});

test("the stamp is found inside a comment or a string, and a truncated one still parses", () => {
  // The first version anchored on ^OPEN-LIST and therefore found none of the
  // three stamps in a generated workflow — where they sit behind `// ` and
  // inside string literals — and reported the generator silent while it was
  // correct. A false red is not a safe failure: it teaches a reader to skip
  // this output.
  const real = openListLine().replace(/\s+/g, " ");
  assert.deepEqual(stampsOf("// " + real), [real]);
  assert.deepEqual(stampsOf("  '    ' + \"" + real + "\","), [real]);
  // Two different totals in one artifact is its own failure — whichever a
  // reader looks at, the other says otherwise.
  assert.equal(stampsOf(real + "\n" + real.replace(/open=\d+/, "open=1")).length, 2);
  // A truncated stamp must still MATCH, so that it fails the equality rather
  // than reading as silence and being reported as a missing stamp.
  assert.deepEqual(stampsOf("OPEN-LIST filed=1"), ["OPEN-LIST filed=1"]);
});
