#!/usr/bin/env node
/**
 * lesson-mistake-census.mjs — THE ACCEPTANCE CENSUS FOR ADR-009 (doc 92 §9).
 *
 *   node tools/audit/lesson-mistake-census.mjs
 *   node tools/audit/lesson-mistake-census.mjs --out census.json --runs 2
 *   node tools/audit/lesson-mistake-census.mjs --only sc-vu-pass-clearance   (a smoke run)
 *
 * ============================================================================
 * WHAT IT IS
 * ============================================================================
 *
 * One sequential process drives EVERY committed tape × EVERY authored rung
 * through the production grading chain — 2,434 drives — and compares what comes
 * out against `lesson-mistake-census.expected.json`, whose numbers are typed
 * from §9 of the spec.
 *
 * THE EXPECTATION IS TYPED FROM THE DOCUMENT, NOT GENERATED FROM THE TREE.
 * A fixture produced by the code under test measures nothing: it agrees with
 * whatever the tree does today, including the bug. §9's table was measured on
 * a patched prototype by a different author; that is precisely why it is worth
 * comparing against. Where this tree disagrees, the census prints BOTH numbers
 * and the drives behind the measured one — it never edits the expectation, and
 * a disagreement is a finding to explain, not a fixture to refresh.
 *
 * THE «BEFORE» HALF IS THE COMMITTED PRE-ADR-009 CENSUS, not a rollback of the
 * live code: `docs/simulation/adr-009/census-baseline.json` (L1/L3/L4) and
 * `census-L25.json` (L2/L5), 2,434 rows measured on the clean tree at HEAD
 * 98bf8ae. Deleting `lessonMistakeTargets` from a compiled lesson reproduces
 * those rows (doc 92 §3.6's own kill switch, validated by lane C's verifier on
 * 2,434 keys) — but a baseline measured by the thing under test is one more
 * thing to trust, and the committed file is not.
 *
 * ============================================================================
 * WHAT IT MAY AND MAY NOT BE CITED FOR
 * ============================================================================
 *
 * It drives `inprocess-drive.mjs`'s chain, so it inherits that instrument's
 * contract WHOLE: nothing here is painted, nothing is photographed, and no
 * cell below says a student saw anything. «Reason rows» counts what the
 * product's own `lessonMistakeReasonsBg(result)` returns — a LIST, not a
 * rendered block, and not a phone that fits it. The pill counts are
 * `sessionVerdict(result)`, the product's own function, called rather than
 * re-derived. Phone fit, legibility and whether any of it reached the glass
 * are lane P's photographs and no number here speaks to them.
 *
 * ============================================================================
 * ANTI-NEUTRALISATION
 * ============================================================================
 *
 * A census that cannot fail is the green-and-blind shape this programme has
 * caught four times, the last inside this ADR's own spec. So:
 *   · a drive that throws is COUNTED and NAMED, and any error at all fails the
 *     run — an exception swallowed into a smaller denominator reads exactly
 *     like a clean census;
 *   · a drive with no baseline row is NAMED, never skipped silently;
 *   · every differing cell prints the drives behind the measured number, so a
 *     disagreement can be explained rather than argued about;
 *   · the exit code is 1 on ANY disagreement, 4 on any drive error, and the
 *     summary line says which — the gate reads the code, the operator reads
 *     the table.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  InProcessDriveError,
  RECORDER_SHAPES,
  authoredRungs,
  findRepoRoot,
  loadChain,
  loadDistrict,
  recorderFor,
  recorderIndex,
  runOnce,
  sha256,
  stableStringify,
  tapesFor,
} from "./inprocess-drive.mjs";

/**
 * `fileURLToPath`, NOT `new URL(...).pathname`: on Windows the pathname keeps
 * the percent-encoding of «E:/AI driver» and every read next to this file opens
 * `E:\AI%20driver\…` — which is an ENOENT nobody reads as a space in a path.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// § THE DRIVES
// ---------------------------------------------------------------------------

const key = (r) => `${r.lesson}/${r.tape}@L${r.rung}`;

/**
 * Every committed tape × every authored rung, driven once, projected to the
 * cells §9 counts. Caches the district JSON, the recorder index and each
 * traces module — `planDrive` rebuilds all three per call, which is right for
 * one drive and is 2,434 re-scans of 148 files here.
 */
async function census(root, { only = null, onProgress = null } = {}) {
  const chain = await loadChain(root);
  if (chain.screen === null) {
    throw new InProcessDriveError(
      "USAGE",
      `the product's verdict module would not load, so no pill can be counted: ${chain.screenUnavailable}`,
      { screenUnavailable: chain.screenUnavailable },
    );
  }
  const index = recorderIndex(root);
  const districts = new Map();
  const modules = new Map();
  const rows = [];
  const errors = [];

  const specs = chain.templates.SCENARIO_TEMPLATES.filter((s) => only === null || s.id === only);
  let done = 0;
  for (const spec of specs) {
    let tapes;
    try {
      tapes = tapesFor(root, spec.id);
    } catch (err) {
      errors.push({ lesson: spec.id, tape: null, rung: null, code: err.code ?? "UNKNOWN", message: err.message });
      continue;
    }
    const rungs = authoredRungs(chain, spec);
    const rec = recorderFor(root, spec.id, index);
    if (!modules.has(rec.file)) {
      modules.set(rec.file, await chain.jiti.import(path.join(chain.sim, "traces", rec.file)));
    }
    const fn = modules.get(rec.file)[rec.fn];
    const call = RECORDER_SHAPES[rec.shape];

    for (const rung of rungs) {
      const lesson = chain.compile.compileScenario(spec, rung);
      const districtId = chain.contracts.lessonDistrictId(lesson);
      if (!districts.has(districtId)) districts.set(districtId, loadDistrict(root, districtId));
      const district = districts.get(districtId);

      for (const tape of tapes) {
        const plan = {
          root,
          chain,
          spec,
          lesson,
          lessonId: spec.id,
          rung,
          source: { kind: tape.startsWith("shadow") ? "authored-shadow-tape" : "authored-mistake-tape", name: tape },
          record: (onTick) => call(fn, { district, lesson: spec.id, tape, extra: { onTick } }),
        };
        try {
          rows.push(project(spec.id, tape, rung, lesson, runOnce(chain, plan)));
        } catch (err) {
          errors.push({
            lesson: spec.id,
            tape,
            rung,
            code: err instanceof InProcessDriveError ? err.code : "THREW",
            message: String(err?.message ?? err),
          });
        }
        done++;
        if (onProgress && done % 200 === 0) onProgress(done);
      }
    }
  }
  return { rows, errors, chain };
}

/** One drive, reduced to the facts §9 counts. Nothing wall-clock, nothing invented. */
function project(lesson, tape, rung, compiled, out) {
  const cards = out.teachMoments.filter((m) => m.lessonMistake);
  return {
    lesson,
    tape,
    rung,
    tapeKind: tape.startsWith("shadow") ? "shadow" : "mistake",
    examMode: compiled.examMode === true,
    targets: (compiled.lessonMistakeTargets ?? []).map((t) => t.code),
    passed: out.verdict.passed,
    sheetPassed: out.sheet.passed,
    aborted: out.verdict.aborted,
    completedAll: out.verdict.completedAll,
    totalPoints: out.sheet.totalPoints,
    effectiveScore: out.verdict.effectiveScore,
    stars: out.rubric === null ? null : out.rubric.stars,
    verdict: out.verdict.sessionVerdict,
    hits: out.verdict.lessonMistakes,
    reasonRows: out.verdict.lessonMistakeReasonCodes.length,
    cards: cards.length,
    faults: out.faults.map((f) => f.code),
    faultTimes: out.faults.map((f) => ({ code: f.code, t: f.t })),
    coached: out.coachedMistakes.map((c) => c.code),
    coachedTimes: out.coachedMistakes.map((c) => ({ code: c.code, t: c.t })),
    endPhase: out.drive.endPhase,
  };
}

// ---------------------------------------------------------------------------
// § THE COMMITTED «BEFORE»
// ---------------------------------------------------------------------------

/**
 * The pre-ADR-009 census, as committed. Missing files are NOT an empty
 * baseline: without it every before/after cell is unmeasurable, and a census
 * that quietly reported the «after» half only would look like agreement.
 */
function loadBaseline(root) {
  const dir = path.join(root, "docs", "simulation", "adr-009");
  const files = ["census-baseline.json", "census-L25.json"];
  const byKey = new Map();
  const missing = [];
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      missing.push(path.relative(root, p).split("\\").join("/"));
      continue;
    }
    for (const r of JSON.parse(fs.readFileSync(p, "utf8"))) {
      byKey.set(`${r.lesson}/${r.tape}@L${r.rung}`, r);
    }
  }
  return { byKey, missing };
}

// ---------------------------------------------------------------------------
// § THE CELLS
// ---------------------------------------------------------------------------

const RUNGS = ["1", "2", "3", "4", "5"];

/** The verdict the SAME drive had before ADR-009, from the committed row. */
function baselineVerdict(chain, b) {
  return chain.screen.sessionVerdict({
    passed: b.passed,
    summary: { passed: b.sheetPassed },
    aborted: b.aborted,
    lessonMistakes: [],
  });
}

/**
 * Every measured cell, with the drives behind it. A cell is a COUNT plus the
 * list that produced it: when the count disagrees with §9, the list is what
 * turns "the spec says 661" into "these ten drives explain it".
 */
function measure(rows, baseline, chain, errors = []) {
  const cell = (list) => ({ n: list.length, of: list.map(key) });
  /**
   * «Lost points» is ONE predicate, used by the per-rung cell and by the total.
   * Written twice it drifted immediately: a mutation that turned the per-rung
   * copy into `!==` (so a drive that GAINED points counted as a loss — the
   * inverse of §9 criterion 4b) left the total's copy correct and the suite
   * green. Same rule, one place.
   */
  const fell = (x) => {
    const b = baseline.byKey.get(key(x));
    return b !== undefined && x.totalPoints < b.totalPoints;
  };
  const byRung = {};
  for (const r of RUNGS) {
    const at = rows.filter((x) => String(x.rung) === r);
    const shadow = at.filter((x) => x.tapeKind === "shadow");
    const mistake = at.filter((x) => x.tapeKind === "mistake");
    const hit = at.filter((x) => x.hits.length > 0);
    const notTaken = at.filter((x) => x.verdict === "lessonMistake");
    const from = (word) =>
      notTaken.filter((x) => {
        const b = baseline.byKey.get(key(x));
        return b !== undefined && baselineVerdict(chain, b) === word;
      });
    const lost = mistake.filter(fell);
    byRung[r] = {
      shadowDrives: cell(shadow),
      shadowPassed: cell(shadow.filter((x) => x.passed)),
      mistakeDrives: cell(mistake),
      mistakePassed: cell(mistake.filter((x) => x.passed)),
      mistakeThreeStar: cell(mistake.filter((x) => x.stars === 3)),
      notTaken: cell(notTaken),
      "notTakenFrom.passed": cell(from("passed")),
      "notTakenFrom.unfinished": cell(from("unfinished")),
      "notTakenFrom.failed": cell(from("failed")),
      failedWithHit: cell(hit.filter((x) => x.verdict === "failed")),
      hitDrives: cell(hit),
      reasonRowDrives: cell(at.filter((x) => x.reasonRows > 0)),
      unfinishedWithHit: cell(hit.filter((x) => x.verdict === "unfinished")),
      mistakeSheetPoints: {
        n: mistake.reduce((s, x) => s + x.totalPoints, 0),
        of: lost.map((x) => `${key(x)} ${baseline.byKey.get(key(x))?.totalPoints ?? "?"}→${x.totalPoints} т.`),
      },
      drivesLosingPoints: cell(lost),
      ...(r === "4" ? { unfinishedMistakeDrives: cell(mistake.filter((x) => x.verdict === "unfinished")) } : {}),
    };
  }

  const practice = rows.filter((x) => !x.examMode);
  const hitRows = rows.filter((x) => x.hits.length > 0);
  const twoCards = rows.filter((x) => x.cards >= 2);
  const gained = [];
  const lostAll = [];
  let pointsWithheld = 0;
  const noBaseline = [];
  for (const x of rows) {
    const b = baseline.byKey.get(key(x));
    if (b === undefined) {
      noBaseline.push(key(x));
      continue;
    }
    if (x.totalPoints > b.totalPoints) gained.push(x);
    if (fell(x)) {
      lostAll.push(x);
      pointsWithheld += b.totalPoints - x.totalPoints;
    }
  }

  // Criterion 4c — THE CELL THAT CERTIFIES FOUNDER RULING A. A charged
  // occurrence of a target code must always be a REPEAT: some earlier coached
  // occurrence of the same code on the same drive. A charge with no earlier
  // coaching means the FIRST occurrence was billed, which is precisely what the
  // ruling forbids, on a drive whose sheet looks unremarkable.
  //
  // THE EMPTY-SET TRAP, found by this lane's verifier. This was written
  // `Math.min(...x.faultTimes.filter(…))` with no guard, and `Math.min()` of
  // nothing is `Infinity`. So a charged hit carrying NO fault row of its own
  // code compared every coached time against `Infinity`, `c.t < Infinity` is
  // true of any number, and the drive read as satisfied — excused by a coached
  // row that may have arrived long AFTER the charge, on a drive with no fault
  // row to charge from at all. The reassuring direction, in the one cell the
  // whole ADR turns on. Measured on a synthetic drive: the unguarded form
  // reports 0, the guarded one names it. A charge with no fault row of that
  // code is not «fine», it is unaccountable — so it is named, and named as its
  // own shape, because «0 of 693» is the figure §9 quotes and an operator who
  // reads a 1 there must know which of the two it is.
  const chargedWithNoEarlierCoached = [];
  for (const x of practice) {
    for (const h of x.hits.filter((y) => y.charged)) {
      const times = x.faultTimes.filter((f) => f.code === h.code).map((f) => f.t);
      if (times.length === 0) {
        chargedWithNoEarlierCoached.push(`${key(x)} ${h.code} (charged with no fault row)`);
        continue;
      }
      const firstCharged = Math.min(...times);
      const earlier = x.coachedTimes.some((c) => c.code === h.code && c.t < firstCharged);
      if (!earlier) chargedWithNoEarlierCoached.push(`${key(x)} ${h.code}`);
    }
  }

  // Criteria 5 and 4a — the two populations that must not have moved at all.
  //
  // A FIELD THE COMMITTED BASELINE DOES NOT CARRY IS UNMEASURED, NOT DRIFT.
  // MEASURED on this tree: `effectiveScore` is present on all 1,494 L1/L3/L4
  // rows and ABSENT on all 940 L2/L5 rows — which is §9's own footnote («The
  // L2/L5 baseline did not record it»), and comparing a number against
  // `undefined` duly reported all 312 L2/L5 shadow drives as having moved.
  // That is the reassuring direction's opposite and just as bad: 312 false
  // positives bury the one real regression this criterion exists to catch. So
  // the missing half is counted and REPORTED by name, never silently skipped
  // and never counted as a difference.
  const unmeasured = [];
  const drift = (subset, fields) => {
    const out = [];
    for (const x of subset) {
      const b = baseline.byKey.get(key(x));
      if (b === undefined) continue;
      const readable = fields.filter((f) => f.was(b) !== undefined);
      for (const f of fields.filter((f) => f.was(b) === undefined)) unmeasured.push(`${key(x)} [${f.name}]`);
      const diffs = readable.filter((f) => stableStringify(f.get(x)) !== stableStringify(f.was(b)));
      if (diffs.length > 0) out.push(`${key(x)} [${diffs.map((d) => d.name).join(", ")}]`);
    }
    return out;
  };
  const sameFields = [
    { name: "passed", get: (x) => x.passed, was: (b) => b.passed },
    { name: "stars", get: (x) => x.stars, was: (b) => b.stars },
    { name: "totalPoints", get: (x) => x.totalPoints, was: (b) => b.totalPoints },
    { name: "effectiveScore", get: (x) => x.effectiveScore, was: (b) => b.effectiveScore },
    { name: "faults", get: (x) => [...x.faults].sort(), was: (b) => [...(b.faults ?? [])].sort() },
    { name: "coached", get: (x) => [...x.coached].sort(), was: (b) => [...(b.coached ?? [])].sort() },
  ];

  const sheetFlips = [];
  const starsRising = [];
  const flipsNotAtOneStar = [];
  const starFallsOnAlreadyFailing = [];
  for (const x of rows) {
    const b = baseline.byKey.get(key(x));
    if (b === undefined) continue;
    if (x.sheetPassed !== b.sheetPassed) sheetFlips.push(`${key(x)} ${b.totalPoints}→${x.totalPoints} т.`);
    if (x.stars !== null && b.stars !== null && x.stars > b.stars) starsRising.push(`${key(x)} ${b.stars}→${x.stars}★`);
    if (b.passed === true && x.verdict === "lessonMistake" && x.stars !== null && x.stars !== 1) {
      flipsNotAtOneStar.push(`${key(x)} ${x.stars}★`);
    }
    if (b.passed === false && x.stars !== null && b.stars !== null && x.stars < b.stars) {
      starFallsOnAlreadyFailing.push(`${key(x)} ${b.stars}→${x.stars}★`);
    }
  }

  return {
    byRung,
    totals: {
      drives: { n: rows.length, of: [] },
      // COUNTED HERE, not merely printed above: a cell that is not compared
      // is a cell §9's `errors: 0` cannot fail on, and a census that lost a
      // hundred drives to exceptions would otherwise read as a smaller,
      // perfectly clean census.
      errors: { n: errors.length, of: errors.map((e) => `${e.lesson}/${e.tape ?? "-"}@L${e.rung ?? "-"} ${e.code}`) },
      hitDrives: { n: hitRows.length, of: [] },
      cards: { n: rows.reduce((s, x) => s + x.cards, 0), of: twoCards.map((x) => `${key(x)} ${x.cards} cards`) },
      drivesWithTwoCards: { n: twoCards.length, of: twoCards.map((x) => `${key(x)} ${x.cards} cards`) },
      practiceHits: { n: practice.reduce((s, x) => s + x.hits.length, 0), of: [] },
      chargedHitsWithNoEarlierCoached: { n: chargedWithNoEarlierCoached.length, of: chargedWithNoEarlierCoached },
      drivesLosingPoints: { n: lostAll.length, of: lostAll.map(key) },
      pointsWithheld: { n: pointsWithheld, of: [] },
      drivesGainingPoints: { n: gained.length, of: gained.map(key) },
      shadowDrivesWithHits: {
        n: rows.filter((x) => x.tapeKind === "shadow" && x.hits.length > 0).length,
        of: rows.filter((x) => x.tapeKind === "shadow" && x.hits.length > 0).map(key),
      },
    },
    criteria: {
      stillPassingMistakeTapes: [
        ...new Set(rows.filter((x) => x.tapeKind === "mistake" && !x.examMode && x.passed).map((x) => `${x.lesson}/${x.tape}`)),
      ].sort(),
      mistakeNotPassed: Object.fromEntries(
        ["1", "2", "3", "5"].map((r) => [
          r,
          rows.filter((x) => String(x.rung) === r && x.tapeKind === "mistake" && !x.passed).length,
        ]),
      ),
      examRungDriftingDrives: drift(rows.filter((x) => x.examMode), sameFields),
      shadowDriftingDrives: drift(rows.filter((x) => x.tapeKind === "shadow"), sameFields),
      sheetVerdictFlips: sheetFlips,
      starFallsOnAlreadyFailing,
      starsRising,
      flipsNotAtOneStar,
    },
    noBaseline,
    unmeasured,
  };
}

// ---------------------------------------------------------------------------
// § THE COMPARISON
// ---------------------------------------------------------------------------

/** One line per cell: expected (§9), measured, and whether they agree. */
function compare(expected, m) {
  const out = [];
  const add = (scope, name, want, got, examples = []) =>
    out.push({ scope, name, want, got, ok: want === got, examples });

  for (const [k, want] of Object.entries(expected.totals)) {
    const got = m.totals[k];
    add("totals", k, want, got?.n ?? null, got?.of ?? []);
  }
  for (const r of RUNGS) {
    const exp = expected.rungs[r];
    for (const [k, want] of Object.entries(exp)) {
      if (k === "notTakenFrom") {
        for (const [w, n] of Object.entries(want)) {
          const c = m.byRung[r][`notTakenFrom.${w}`];
          add(`L${r}`, `notTakenFrom.${w}`, n, c.n, c.of);
        }
        continue;
      }
      const c = m.byRung[r][k];
      add(`L${r}`, k, want, c?.n ?? null, c?.of ?? []);
    }
  }
  const c = expected.criteria;
  const mc = m.criteria;
  const listCell = (name, want, got) =>
    out.push({
      scope: "criteria",
      name,
      want: want.join(", "),
      got: got.join(", "),
      ok: stableStringify([...want].sort()) === stableStringify([...got].sort()),
      examples: got,
    });
  listCell("stillPassingMistakeTapes", c.stillPassingMistakeTapes, mc.stillPassingMistakeTapes);
  for (const [r, want] of Object.entries(c.mistakeNotPassed)) {
    add("criteria", `mistakeNotPassed.L${r}`, want, mc.mistakeNotPassed[r], []);
  }
  add("criteria", "examRungDriftingDrives", c.examRungDriftingDrives, mc.examRungDriftingDrives.length, mc.examRungDriftingDrives);
  add("criteria", "shadowDriftingDrives", c.shadowDriftingDrives, mc.shadowDriftingDrives.length, mc.shadowDriftingDrives);
  // The measured lists carry the drive AND its numbers («…@L3 9→6 т.»); §9
  // names only the drives, so the comparison is on the key and the numbers
  // survive into `examples` for the operator to read.
  listCell("sheetVerdictFlips", c.sheetVerdictFlips, mc.sheetVerdictFlips.map((s) => s.split(" ")[0]));
  listCell(
    "starFallsOnAlreadyFailing",
    c.starFallsOnAlreadyFailing,
    mc.starFallsOnAlreadyFailing.map((s) => s.split(" ")[0]),
  );
  add("criteria", "starsRising", c.starsRising, mc.starsRising.length, mc.starsRising);
  add("criteria", "flipsNotAtOneStar", c.flipsNotAtOneStar, mc.flipsNotAtOneStar.length, mc.flipsNotAtOneStar);
  return out;
}

// ---------------------------------------------------------------------------
// § CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = { runs: 1, only: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = Number(argv[++i]);
    else if (a === "--only") out.only = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new InProcessDriveError("USAGE", `unknown flag "${a}"`);
  }
  if (!Number.isInteger(out.runs) || out.runs < 1 || out.runs > 3) {
    throw new InProcessDriveError("USAGE", "--runs must be 1, 2 or 3");
  }
  return out;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  if (opts.help) {
    console.log("lesson-mistake-census — ADR-009 acceptance census (doc 92 §9). Flags: --runs N --only <lesson> --out <file>");
    return 0;
  }
  const root = findRepoRoot();
  const expected = JSON.parse(fs.readFileSync(path.join(HERE, "lesson-mistake-census.expected.json"), "utf8"));
  const baseline = loadBaseline(root);

  const started = Date.now();
  const digests = [];
  let last = null;
  for (let run = 1; run <= opts.runs; run++) {
    process.stderr.write(`[census] run ${run}/${opts.runs} …\n`);
    const { rows, errors, chain } = await census(root, {
      only: opts.only,
      onProgress: (n) => process.stderr.write(`[census]   ${n} drives\n`),
    });
    digests.push(sha256(stableStringify(rows)));
    last = { rows, errors, chain };
  }
  const { rows, errors, chain } = last;
  const m = measure(rows, baseline, chain, errors);
  const cells = opts.only === null ? compare(expected, m) : [];
  const bad = cells.filter((x) => !x.ok);

  // ── the report ───────────────────────────────────────────────────────────
  const L = [];
  L.push("");
  L.push("=".repeat(96));
  L.push(`ADR-009 ACCEPTANCE CENSUS — ${rows.length} drives, ${errors.length} error(s), ${((Date.now() - started) / 1000).toFixed(0)} s`);
  L.push("NOTHING WAS PAINTED. Every cell is the production grading chain in-process; none of it is a photograph.");
  L.push(`expected: tools/audit/lesson-mistake-census.expected.json (typed from doc 92 §9)`);
  L.push(
    baseline.missing.length === 0
      ? `before:   docs/simulation/adr-009/census-baseline.json + census-L25.json (${baseline.byKey.size} rows)`
      : `before:   MISSING — ${baseline.missing.join(", ")}. Every before/after cell below is UNMEASURED, not zero.`,
  );
  L.push(
    opts.runs > 1
      ? `determinism: ${opts.runs} full runs, digests ${new Set(digests).size === 1 ? "IDENTICAL" : "DIFFERENT"} (${digests.join(" | ")})`
      : `determinism: NOT VERIFIED — one run (${digests[0]}). Pass --runs 2 for §9 criterion 10.`,
  );
  L.push("=".repeat(96));

  if (errors.length > 0) {
    L.push("");
    L.push(`DRIVE ERRORS (${errors.length}) — a census with an error in it is not a census:`);
    for (const e of errors.slice(0, 25)) L.push(`  ${e.lesson}/${e.tape ?? "-"}@L${e.rung ?? "-"} ${e.code}: ${e.message}`);
  }
  if (m.unmeasured.length > 0) {
    const byField = new Map();
    for (const u of m.unmeasured) {
      const f = u.slice(u.indexOf("[") + 1, -1);
      byField.set(f, (byField.get(f) ?? 0) + 1);
    }
    L.push("");
    L.push(
      "UNMEASURABLE COMPARISONS — the committed baseline does not carry these fields on these drives, " +
        "so they are NOT counted as drift and NOT counted as agreement:",
    );
    for (const [f, n] of byField) L.push(`  ${f}: ${n} drive(s) (§9's own note: the L2/L5 baseline did not record effectiveScore)`);
  }
  if (m.noBaseline.length > 0) {
    L.push("");
    L.push(`NO BASELINE ROW for ${m.noBaseline.length} drive(s) — their before/after cells are unmeasured:`);
    for (const k of m.noBaseline.slice(0, 15)) L.push(`  ${k}`);
  }

  if (opts.only !== null) {
    L.push("");
    L.push(`--only ${opts.only}: ${rows.length} drive(s). NO ACCEPTANCE CLAIM IS MADE — §9's numbers are over the whole bank.`);
    for (const r of rows) {
      L.push(
        `  ${key(r).padEnd(56)} ${String(r.verdict ?? "?").padEnd(13)} ${r.totalPoints} т. ${r.stars ?? "-"}★  ` +
          `hits=[${r.hits.map((h) => h.code + (h.charged ? "*" : "")).join(", ")}] cards=${r.cards} reasons=${r.reasonRows}`,
      );
    }
  } else {
    L.push("");
    L.push(`CELLS: ${cells.length - bad.length} agree with §9, ${bad.length} DIFFER`);
    L.push("");
    L.push("  scope    cell                             §9        measured");
    for (const c of cells) {
      L.push(
        `  ${c.ok ? " " : "!"} ${c.scope.padEnd(8)} ${c.name.padEnd(32)} ${String(c.want).slice(0, 60).padEnd(9)} ${String(c.got).slice(0, 60)}`,
      );
    }
    if (bad.length > 0) {
      L.push("");
      L.push("THE DRIVES BEHIND EVERY DIFFERING CELL — read these before touching either number:");
      for (const c of bad) {
        L.push("");
        L.push(`  ${c.scope} · ${c.name}: §9 says ${c.want}, this tree measures ${c.got}`);
        for (const e of c.examples.slice(0, 12)) L.push(`      ${e}`);
        if (c.examples.length > 12) L.push(`      … and ${c.examples.length - 12} more`);
      }
    }
  }
  L.push("");
  L.push("=".repeat(96));
  process.stderr.write(L.join("\n") + "\n");

  if (opts.out) {
    fs.writeFileSync(
      opts.out,
      JSON.stringify(
        {
          instrument: "tools/audit/lesson-mistake-census.mjs",
          painted: false,
          photographed: false,
          drives: rows.length,
          errors,
          digests,
          determinismVerified: opts.runs > 1 && new Set(digests).size === 1,
          expectedFrom: "docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md §9",
          cells,
          measured: m,
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  }

  if (errors.length > 0) return 4;
  if (opts.only === null && bad.length > 0) return 1;
  return 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}

export { census, compare, key, loadBaseline, measure, project };
