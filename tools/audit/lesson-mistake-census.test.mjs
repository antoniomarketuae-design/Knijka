// Run: node --test tools/audit/lesson-mistake-census.test.mjs
//
// WHAT THIS DEFENDS: A CENSUS THAT CANNOT FAIL.
//
// The acceptance census is the instrument doc 92 §9 makes the whole of ADR-009
// turn on, and its failure mode is not a wrong number — it is agreement. Two
// shapes produce it, and this programme has shipped both:
//
//   · an expectation GENERATED from the code under test. It agrees with
//     whatever the tree does, bug included. §9's numbers were measured on a
//     patched prototype by another author and are typed into
//     `lesson-mistake-census.expected.json` by hand for exactly that reason;
//     the cases below check that file against the SPEC's own arithmetic, never
//     against a drive.
//   · a comparator with no red path. `compare()` is driven here with numbers
//     that must disagree, because a comparator nobody has watched fail is a
//     comparator nobody knows the shape of.
//
// None of these cases drives a lesson: the drives are the tool's other half and
// they take six minutes. Everything here is the counting and the comparing,
// which is where a census lies.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compare, key, loadBaseline, measure, project } from "./lesson-mistake-census.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED = JSON.parse(fs.readFileSync(path.join(HERE, "lesson-mistake-census.expected.json"), "utf8"));

/**
 * THE EXPECTATION'S CANONICAL SHAPE — every cell §9 states, by name.
 *
 * `compare()` walks the EXPECTATION's keys, not the measurement's, so a cell
 * deleted from `lesson-mistake-census.expected.json` is simply not compared and
 * the run reports agreement over the hole. MEASURED 2026-09-18: deleting
 * `"mistakeThreeStar": 2` from L1 left the whole shipped suite green (13/13)
 * and the census still read «agree». Deleting a whole rung or a criteria key
 * does go red — one cell did not. These lists are what makes a deletion a
 * failing test, and they are written out here rather than derived from the file
 * so that a shrunk fixture cannot shrink its own checker along with it.
 */
const RUNG_CELLS = [
  "shadowDrives",
  "shadowPassed",
  "mistakeDrives",
  "mistakePassed",
  "mistakeThreeStar",
  "notTaken",
  "notTakenFrom",
  "failedWithHit",
  "hitDrives",
  "reasonRowDrives",
  "unfinishedWithHit",
  "mistakeSheetPoints",
  "drivesLosingPoints",
];
/** L4 is the exam rung and carries one cell of its own (§9's «110 unchanged»). */
const L4_EXTRA_CELLS = ["unfinishedMistakeDrives"];
const NOT_TAKEN_FROM_CELLS = ["passed", "unfinished", "failed"];
const TOTAL_CELLS = [
  "drives",
  "errors",
  "hitDrives",
  "cards",
  "drivesWithTwoCards",
  "practiceHits",
  "chargedHitsWithNoEarlierCoached",
  "drivesLosingPoints",
  "pointsWithheld",
  "drivesGainingPoints",
  "shadowDrivesWithHits",
];
const CRITERIA_CELLS = [
  "stillPassingMistakeTapes",
  "mistakeNotPassed",
  "examRungDriftingDrives",
  "shadowDriftingDrives",
  "sheetVerdictFlips",
  "starFallsOnAlreadyFailing",
  "starsRising",
  "flipsNotAtOneStar",
];

/** A projected drive row, with only the fields the counters read. */
const row = (o) => ({
  lesson: "sc-x",
  tape: "mistake-a",
  rung: 3,
  tapeKind: "mistake",
  examMode: false,
  targets: ["A"],
  passed: false,
  sheetPassed: true,
  aborted: false,
  completedAll: true,
  totalPoints: 0,
  effectiveScore: 0,
  stars: 1,
  verdict: "lessonMistake",
  hits: [{ code: "A", t: 5, charged: false, detail: null, titleBg: "т", demoTitleBg: null }],
  reasonRows: 1,
  cards: 1,
  faults: [],
  faultTimes: [],
  coached: ["A"],
  coachedTimes: [{ code: "A", t: 5 }],
  endPhase: "completed",
  ...o,
});

/** A committed baseline row, as `census-baseline.json` holds one. */
const was = (o) => ({
  lesson: "sc-x",
  tape: "mistake-a",
  rung: 3,
  passed: true,
  sheetPassed: true,
  aborted: false,
  stars: 3,
  totalPoints: 0,
  effectiveScore: 0,
  faults: [],
  coached: ["A"],
  ...o,
});

const baselineOf = (rows) => ({ byKey: new Map(rows.map((r) => [`${r.lesson}/${r.tape}@L${r.rung}`, r])), missing: [] });

/** The product's own four-way read, as `measure` calls it for the BEFORE row. */
const chain = {
  screen: {
    sessionVerdict: (r) =>
      r.passed ? "passed" : !r.summary.passed ? "failed" : (r.lessonMistakes?.length ?? 0) > 0 ? "lessonMistake" : "unfinished",
  },
};

test("project: a CARD is a teach moment flagged as the lesson's own mistake, not any teach moment", () => {
  const out = project("sc-x", "mistake-a", 3, { examMode: false, lessonMistakeTargets: [{ code: "A" }] }, {
    drive: { endPhase: "completed" },
    sheet: { passed: true, totalPoints: 0 },
    verdict: {
      passed: false,
      aborted: false,
      completedAll: true,
      effectiveScore: 0,
      lessonMistakes: [{ code: "A", t: 5, charged: false, detail: null, titleBg: "т", demoTitleBg: null }],
      sessionVerdict: "lessonMistake",
      lessonMistakeReasonCodes: ["A"],
    },
    rubric: { stars: 1 },
    teachMoments: [
      { code: "A", t: 5, lessonMistake: true, charged: false },
      { code: "B", t: 9, lessonMistake: false, charged: false },
      { code: "A", t: 41, lessonMistake: true, charged: true },
    ],
    faults: [],
    coachedMistakes: [{ code: "A", t: 5, titleBg: "т", detail: null }],
  });
  assert.equal(out.cards, 2, "two lesson-mistake cards; the incidental teach moment is not one");
  assert.equal(out.reasonRows, 1);
  assert.equal(out.targets.length, 1);
  assert.equal(out.verdict, "lessonMistake");
  // MUTATION WATCHED: count `teachMoments.length` instead and §9's card figure
  // becomes the whole teach channel — a number that would agree with nothing
  // and could be argued in either direction forever.
});

test("measure: «from pass / unfinished / failed» is split by the BASELINE verdict, not today's", () => {
  const rows = [
    row({ tape: "m1" }),
    row({ tape: "m2" }),
    row({ tape: "m3" }),
  ];
  const b = baselineOf([
    was({ tape: "m1", passed: true }), // was «Издържан»
    was({ tape: "m2", passed: false, sheetPassed: true }), // was «Незавършен»
    was({ tape: "m3", passed: false, sheetPassed: false }), // was «Неиздържан»
  ]);
  const m = measure(rows, b, chain);
  assert.equal(m.byRung["3"]["notTakenFrom.passed"].n, 1);
  assert.equal(m.byRung["3"]["notTakenFrom.unfinished"].n, 1);
  assert.equal(m.byRung["3"]["notTakenFrom.failed"].n, 1);
  assert.equal(m.byRung["3"].notTaken.n, 3);
  // MUTATION WATCHED: split by the CURRENT verdict and all three land in
  // «lessonMistake», which is 0/0/0 here — the column §9 uses to prove that 105
  // of L1's 146 refusals were previously telling the student to go and finish a
  // drive he had finished.
});

test("measure: a drive with NO baseline row is named, never folded into a bucket", () => {
  const m = measure([row({ tape: "brand-new" })], baselineOf([]), chain);
  assert.deepEqual(m.noBaseline, ["sc-x/brand-new@L3"]);
  assert.equal(m.byRung["3"]["notTakenFrom.passed"].n, 0, "an unmeasurable before is not a pass");
  assert.equal(m.byRung["3"].drivesLosingPoints.n, 0, "and it is not a points loss either");
  // A tape added after the baseline was taken would otherwise quietly shrink
  // every before/after denominator — the shape that let a count-agreement gate
  // report AGREED while 638 findings were missing.
});

test("measure: points only count as lost when they FALL, and the rise is reported separately", () => {
  const rows = [row({ tape: "down", totalPoints: 3 }), row({ tape: "up", totalPoints: 9 })];
  const b = baselineOf([was({ tape: "down", totalPoints: 9 }), was({ tape: "up", totalPoints: 3 })]);
  const m = measure(rows, b, chain);
  assert.equal(m.totals.drivesLosingPoints.n, 1);
  assert.equal(m.totals.pointsWithheld.n, 6);
  assert.equal(m.totals.drivesGainingPoints.n, 1);
  assert.deepEqual(m.totals.drivesGainingPoints.of, ["sc-x/up@L3"]);
  // The per-rung cell reads the SAME predicate, and this half is what caught
  // the two copies drifting: mutating only the rung's own filter to `!==` left
  // the total correct and the suite green.
  assert.equal(m.byRung["3"].drivesLosingPoints.n, 1);
  assert.deepEqual(m.byRung["3"].drivesLosingPoints.of, ["sc-x/down@L3"]);
  // §9 criterion 4b is «points only fall». A census that summed the signed
  // delta would report 0 for one drive losing six and another gaining six.
});

test("measure: criterion 4c — a CHARGED lesson mistake with no earlier coached occurrence is named", () => {
  // Under founder Ruling A a target's first occurrence is always taught and
  // never billed, so every charged occurrence must be a REPEAT. A charge with
  // no earlier coached row of the same code means the first one WAS billed —
  // the ruling broken, on a drive whose sheet looks unremarkable.
  const honest = row({
    tape: "repeat",
    hits: [{ code: "A", t: 5, charged: true, detail: null, titleBg: "т", demoTitleBg: null }],
    coachedTimes: [{ code: "A", t: 5 }],
    faultTimes: [{ code: "A", t: 31 }],
  });
  const broken = row({
    tape: "billed-first",
    hits: [{ code: "A", t: 5, charged: true, detail: null, titleBg: "т", demoTitleBg: null }],
    coachedTimes: [],
    faultTimes: [{ code: "A", t: 5 }],
  });
  const m = measure([honest, broken], baselineOf([was({ tape: "repeat" }), was({ tape: "billed-first" })]), chain);
  assert.equal(m.totals.chargedHitsWithNoEarlierCoached.n, 1);
  assert.deepEqual(m.totals.chargedHitsWithNoEarlierCoached.of, ["sc-x/billed-first@L3 A"]);
  assert.equal(m.totals.practiceHits.n, 2);
});

test("measure: criterion 4c — coaching that arrives AFTER the charge is not an earlier occurrence", () => {
  // The case that pins the time comparison itself. `honest` above has its
  // coached row at t=5 and its charge at t=31, so dropping `c.t < firstCharged`
  // from the predicate leaves it correct and the shipped suite green — measured
  // 2026-09-18, 13/13. Here the same drive's only coached row is at t=44, AFTER
  // the charge at t=31: with the comparison the drive is named, without it the
  // mere existence of a coached row of that code excuses the bill, and «taught
  // first» degrades into «taught at some point», which is not Ruling A.
  const late = row({
    tape: "coached-after",
    hits: [{ code: "A", t: 31, charged: true, detail: null, titleBg: "т", demoTitleBg: null }],
    coachedTimes: [{ code: "A", t: 44 }],
    faultTimes: [{ code: "A", t: 31 }],
  });
  const m = measure([late], baselineOf([was({ tape: "coached-after" })]), chain);
  assert.equal(m.totals.chargedHitsWithNoEarlierCoached.n, 1);
  assert.deepEqual(m.totals.chargedHitsWithNoEarlierCoached.of, ["sc-x/coached-after@L3 A"]);
});

test("measure: criterion 4c — a charge with NO fault row of its code is named, not excused by Infinity", () => {
  // `Math.min()` of an empty list is `Infinity`. Before the guard, a charged
  // hit whose code appears in no fault row compared every coached time against
  // `Infinity` — always true — so the drive satisfied criterion 4c by
  // arithmetic accident, and did so loudest in the case where there is no
  // evidence of the charge at all to reason about. Measured on this exact row:
  // the unguarded form returns 0, the guarded one returns the line below.
  const orphan = row({
    tape: "no-fault-row",
    hits: [{ code: "A", t: 31, charged: true, detail: null, titleBg: "т", demoTitleBg: null }],
    coachedTimes: [{ code: "A", t: 44 }],
    faultTimes: [],
  });
  const m = measure([orphan], baselineOf([was({ tape: "no-fault-row" })]), chain);
  assert.equal(m.totals.chargedHitsWithNoEarlierCoached.n, 1);
  assert.deepEqual(m.totals.chargedHitsWithNoEarlierCoached.of, [
    "sc-x/no-fault-row@L3 A (charged with no fault row)",
  ]);
});

test("measure: reasonRowDrives is the PRODUCT's reason list, not a restatement of «this drive had a hit»", () => {
  // §9 reads `reasonRowDrives === hitDrives` at every rung as its THEO-4 cell:
  // every refused drive has something to show the student. The two are equal on
  // all 2,434 drives today, which is exactly what makes the cell easy to turn
  // into a tautology — counting `hits.length > 0` twice passes the shipped unit
  // tests AND the real census (measured green both ways), and then the day
  // `lessonMistakeReasonsBg` returns nothing the cell agrees with itself
  // instead of catching a student left with a refusal and no reason.
  const silent = row({ tape: "no-reasons", reasonRows: 0 });
  const m = measure([silent], baselineOf([was({ tape: "no-reasons" })]), chain);
  assert.equal(m.byRung["3"].hitDrives.n, 1, "the drive does carry a lesson mistake");
  assert.equal(m.byRung["3"].reasonRowDrives.n, 0, "…and the product offered no reason row for it");
  assert.deepEqual(m.byRung["3"].hitDrives.of, ["sc-x/no-reasons@L3"]);
});

test("measure: an exam drive that MOVED is named — L4 is the population that may not change", () => {
  const rows = [row({ rung: 4, examMode: true, tape: "m1", totalPoints: 6, stars: 2, passed: false, verdict: "failed", hits: [] })];
  const m = measure(rows, baselineOf([was({ rung: 4, tape: "m1", totalPoints: 3, stars: 2, passed: false })]), chain);
  assert.equal(m.criteria.examRungDriftingDrives.length, 1);
  assert.match(m.criteria.examRungDriftingDrives[0], /sc-x\/m1@L4 \[totalPoints\]/);
  // ADR-009 is a LESSON rule. A practical exam is scored on Наредба № 38 and
  // one point of drift here is the whole ADR failing its own precondition.
});

test("THE COMPARATOR CAN FAIL — fed a number that differs, it says so and hands over the drives", () => {
  // The case this file exists for. `compare()` is the only thing standing
  // between «the census ran» and «the census agreed», and a comparator that
  // has never been watched to go red is not known to have a red path at all.
  const fake = {
    byRung: Object.fromEntries(
      ["1", "2", "3", "4", "5"].map((r) => [
        r,
        Object.fromEntries(
          Object.keys(EXPECTED.rungs[r])
            .flatMap((k) => (k === "notTakenFrom" ? ["notTakenFrom.passed", "notTakenFrom.unfinished", "notTakenFrom.failed"] : [k]))
            .map((k) => [k, { n: -1, of: [`sc-x/m@L${r}`] }]),
        ),
      ]),
    ),
    totals: Object.fromEntries(Object.keys(EXPECTED.totals).map((k) => [k, { n: -1, of: ["sc-x/m@L3"] }])),
    criteria: {
      stillPassingMistakeTapes: ["sc-y/mistake-z"],
      mistakeNotPassed: { 1: -1, 2: -1, 3: -1, 5: -1 },
      examRungDriftingDrives: ["sc-x/m@L4 [passed]"],
      shadowDriftingDrives: ["sc-x/s@L3 [stars]"],
      sheetVerdictFlips: ["sc-x/m@L3 0→9 т."],
      starFallsOnAlreadyFailing: ["sc-x/m@L3 3→1★"],
      starsRising: ["sc-x/m@L3 1→3★"],
      flipsNotAtOneStar: ["sc-x/m@L3 3★"],
    },
    noBaseline: [],
  };
  const cells = compare(EXPECTED, fake);
  assert.ok(cells.length > 50, "every §9 cell is compared, not a sample");
  assert.equal(cells.filter((c) => c.ok).length, 0, "not one of these numbers matches §9, and none may read as agreement");
  for (const c of cells) assert.ok(c.examples.length > 0 || c.scope === "criteria", `${c.name} reports no drive behind it`);
});

test("THE COMPARATOR AGREES WHEN IT SHOULD — §9's own numbers, handed back, produce zero disagreements", () => {
  const exact = {
    byRung: Object.fromEntries(
      ["1", "2", "3", "4", "5"].map((r) => {
        const e = EXPECTED.rungs[r];
        const cells = {};
        for (const [k, v] of Object.entries(e)) {
          if (k === "notTakenFrom") {
            for (const [w, n] of Object.entries(v)) cells[`notTakenFrom.${w}`] = { n, of: [] };
          } else cells[k] = { n: v, of: [] };
        }
        return [r, cells];
      }),
    ),
    totals: Object.fromEntries(Object.entries(EXPECTED.totals).map(([k, v]) => [k, { n: v, of: [] }])),
    criteria: {
      stillPassingMistakeTapes: [...EXPECTED.criteria.stillPassingMistakeTapes],
      mistakeNotPassed: { ...EXPECTED.criteria.mistakeNotPassed },
      examRungDriftingDrives: [],
      shadowDriftingDrives: [],
      sheetVerdictFlips: [...EXPECTED.criteria.sheetVerdictFlips],
      starFallsOnAlreadyFailing: [...EXPECTED.criteria.starFallsOnAlreadyFailing],
      starsRising: [],
      flipsNotAtOneStar: [],
    },
    noBaseline: [],
  };
  const bad = compare(EXPECTED, exact).filter((c) => !c.ok);
  assert.deepEqual(bad.map((c) => `${c.scope}/${c.name}`), [], "the comparator must not invent a disagreement either");
});

test("the expectation is §9's, and §9's own arithmetic holds inside it", () => {
  // This is a check on the DOCUMENT, not on the tree: the rung tables and the
  // totals in §9 were written by hand and can disagree with each other. If they
  // do, the census would report a difference that is the spec's, not the
  // product's — and somebody would 'fix' the product to match a typo.
  assert.match(EXPECTED._source, /92_ADR009_LESSON_MISTAKE_SPEC\.md §9/);
  assert.match(EXPECTED._before, /census-baseline\.json/);
  // THE ONE THING NO ASSERTION CAN CATCH is a cell retyped to match the tree
  // instead of the document — that is a judgement, not an arithmetic error. So
  // the next best thing is pinned instead: any cell that HAS been retyped must
  // still carry its paper trail. `totals.cards` and `totals.drivesWithTwoCards`
  // were changed on 2026-09-18 (661/7 → 665/10) after §9 criterion 9 itself was
  // corrected; dropping the note while keeping the numbers fails here.
  assert.match(EXPECTED._corrections, /totals\.cards 661→665/);
  assert.match(EXPECTED._corrections, /totals\.drivesWithTwoCards 7→10/);
  assert.match(EXPECTED._corrections, /§9 criterion 9/);
  assert.equal(EXPECTED.totals.cards, 665, "…and the cells are what §9 criterion 9 now states");
  assert.equal(EXPECTED.totals.drivesWithTwoCards, 10);
  let drives = 0;
  let hits = 0;
  for (const r of ["1", "2", "3", "4", "5"]) {
    const e = EXPECTED.rungs[r];
    drives += e.shadowDrives + e.mistakeDrives;
    hits += e.hitDrives;
    assert.equal(
      e.notTaken + e.failedWithHit + e.unfinishedWithHit,
      e.hitDrives,
      `L${r}: every drive with a hit must land on exactly one verdict`,
    );
    assert.equal(e.reasonRowDrives, e.hitDrives, `L${r}: THEO-4 — every refused drive has a reason to show`);
    assert.equal(
      e.notTakenFrom.passed + e.notTakenFrom.unfinished + e.notTakenFrom.failed,
      e.notTaken,
      `L${r}: the three origins must account for every «Не е взет»`,
    );
    if (r !== "4") {
      assert.equal(
        EXPECTED.criteria.mistakeNotPassed[r],
        e.mistakeDrives - e.mistakePassed,
        `L${r}: criterion 3 must equal the rung table's own subtraction`,
      );
    }
  }
  assert.equal(drives, EXPECTED.totals.drives, "the rung tables must add up to 2,434 drives");
  assert.equal(hits, EXPECTED.totals.hitDrives, "…and to 654 drives carrying a hit");
  assert.equal(
    ["1", "2", "3", "5"].reduce((s, r) => s + EXPECTED.rungs[r].drivesLosingPoints, 0),
    EXPECTED.totals.drivesLosingPoints,
    "the per-rung points losses must add up to §9's 147",
  );
  assert.ok(EXPECTED.totals.cards >= EXPECTED.totals.hitDrives, "a hit drive shows at least one card");
  assert.equal(EXPECTED.totals.shadowDrivesWithHits, 0, "criterion 6: a correct drive never carries a lesson mistake");
});

test("the expectation's SHAPE is pinned — a cell deleted from the fixture cannot read as agreement", () => {
  // The arithmetic case above checks that §9's numbers add up. This one checks
  // that the numbers are all still THERE. They are separate failures: a fixture
  // with a cell missing still adds up, still compares, and still says «agree».
  for (const r of ["1", "2", "3", "4", "5"]) {
    const want = r === "4" ? [...RUNG_CELLS, ...L4_EXTRA_CELLS] : [...RUNG_CELLS];
    assert.deepEqual(
      Object.keys(EXPECTED.rungs[r]).sort(),
      want.sort(),
      `L${r}: the rung table no longer states exactly §9's cells — a cell was added or deleted`,
    );
    assert.deepEqual(
      Object.keys(EXPECTED.rungs[r].notTakenFrom).sort(),
      [...NOT_TAKEN_FROM_CELLS].sort(),
      `L${r}: «Не е взет» must still be split three ways`,
    );
  }
  assert.deepEqual(Object.keys(EXPECTED.totals).sort(), [...TOTAL_CELLS].sort(), "the totals block lost or gained a cell");
  assert.deepEqual(Object.keys(EXPECTED.criteria).sort(), [...CRITERIA_CELLS].sort(), "the criteria block lost or gained a cell");
  assert.deepEqual(
    Object.keys(EXPECTED.criteria.mistakeNotPassed).sort(),
    ["1", "2", "3", "5"],
    "criterion 3 is stated for the four PRACTICE rungs; L4 is not one of them",
  );
  // A cell ADDED to the fixture fails this too, on purpose: adding one without
  // adding it here means nobody wrote down what §9 says its value should be.
});

test("loadBaseline: a missing committed census is REPORTED, not treated as an empty before", () => {
  const b = loadBaseline(path.join(HERE, "no-such-repo"));
  assert.equal(b.byKey.size, 0);
  assert.deepEqual(b.missing, [
    "docs/simulation/adr-009/census-baseline.json",
    "docs/simulation/adr-009/census-L25.json",
  ]);
  // The report prints «Every before/after cell below is UNMEASURED, not zero»
  // on this path. Silence here would turn a missing file into «nothing changed».
});

test("key(): one drive, one name — lesson, tape and rung, in the shape the baseline is keyed by", () => {
  assert.equal(key({ lesson: "sc-x", tape: "mistake-a", rung: 3 }), "sc-x/mistake-a@L3");
});

test("measure: a field the baseline does not CARRY is unmeasured — not drift, and not agreement", () => {
  // MEASURED on this tree: `effectiveScore` is on all 1,494 L1/L3/L4 baseline
  // rows and on none of the 940 L2/L5 ones (§9's own footnote). Comparing a
  // number against `undefined` reported all 312 L2/L5 shadow drives as having
  // moved — 312 false positives burying the one real regression criterion 5
  // exists to catch. The missing half is named instead.
  const rows = [
    row({ tapeKind: "shadow", tape: "shadow-correct", rung: 2, passed: true, verdict: "passed", hits: [], stars: 3, effectiveScore: 7 }),
  ];
  const b = { byKey: new Map(), missing: [] };
  const noES = was({ tape: "shadow-correct", rung: 2, passed: true, stars: 3 });
  delete noES.effectiveScore;
  b.byKey.set("sc-x/shadow-correct@L2", noES);
  const m = measure(rows, b, chain);
  assert.deepEqual(m.criteria.shadowDriftingDrives, [], "an absent field is not a moved field");
  assert.deepEqual(m.unmeasured, ["sc-x/shadow-correct@L2 [effectiveScore]"], "…and it is reported by name");
  // …while a field that IS carried and DOES differ is still drift.
  const b2 = baselineOf([was({ tape: "shadow-correct", rung: 2, passed: true, stars: 3, effectiveScore: 2 })]);
  assert.deepEqual(measure(rows, b2, chain).criteria.shadowDriftingDrives, ["sc-x/shadow-correct@L2 [effectiveScore]"]);
});

test("measure: a drive that THREW is a counted cell, not a smaller denominator", () => {
  const m = measure([row({})], baselineOf([was({})]), chain, [
    { lesson: "sc-y", tape: "mistake-b", rung: 3, code: "RECORDER_THREW", message: "boom" },
  ]);
  assert.equal(m.totals.errors.n, 1);
  assert.deepEqual(m.totals.errors.of, ["sc-y/mistake-b@L3 RECORDER_THREW"]);
  // §9 says `errors: 0`. Before this cell existed the comparator read
  // `undefined` there and printed «§9 says 0, measured null» — a cell that
  // cannot agree is exactly as useless as one that cannot fail.
});
