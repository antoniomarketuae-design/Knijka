// -----------------------------------------------------------------------------
// reclosure.test.mjs — THE LEDGER MAY NOT WALK BACKWARDS OVER ITS OWN CORRECTION.
//
//   node --test tools/audit/reclosure.test.mjs
//
// WHAT THIS DEFENDS. A verify pass opens a row; a later judge closes it again on
// product code that did not change. It cost the w17 round five rows, and it is
// undetectable by reading either line on its own — both cite real frames and
// quote them honestly. Only the pair, plus the diff between their builds, says
// anything.
//
// §1 is the shape of the class and the two directions it must not err in.
// §2 is build derivation, including the sweep that mixed two commits.
// §3 is the regression exhibit: the exact bug that shipped in the first version.
// -----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import test from "node:test";

import { buildOfFrame, findReclosures, linesByFinding, sweepHeadMap } from "./reclosure.mjs";

const frame = (sweep) => "E:/AI driver/.audit-frames/" + sweep + "/frames/sc-x__pc-right/01-arrival.png";
const W15 = "32505eb55b4c53457fcb061a1c11a2b74877e63c";
const W17 = "bc7d43fcaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MAP = new Map([["w15", W15], ["w17", W17], ["mixed", null]]);
const buildOf = (f) => buildOfFrame(f, MAP);

const verify = (id, sweep) => ({ findingId: id, verdict: "STILL", correctedBy: "verify", evidenceFrame: frame(sweep) });
const closed = (id, sweep) => ({ findingId: id, verdict: "CLOSED", correctedBy: "w17", evidenceFrame: frame(sweep) });

/** platform/src identical between every pair unless the test says otherwise. */
const noProductChange = () => "";
const realProductChange = () => "3 files changed, 397 insertions(+), 26 deletions(-)";

test("§1 a verifier's correction re-closed on unchanged code is REFUSED", () => {
  const rows = [verify("sc-a:1", "w15"), closed("sc-a:1", "w17")];
  const { refused, unattributable } = findReclosures(rows, { buildOf, productDiff: noProductChange });

  assert.equal(refused.length, 1);
  assert.equal(refused[0].id, "sc-a:1");
  assert.equal(unattributable.length, 0);
});

test("§1 the same pair with a REAL product change is allowed through", () => {
  // The other direction, and it matters as much: a gate that refuses a genuine
  // repair teaches everyone to bypass it.
  const rows = [verify("sc-a:1", "w15"), closed("sc-a:1", "w17")];
  const { refused } = findReclosures(rows, { buildOf, productDiff: realProductChange });

  assert.equal(refused.length, 0);
});

test("§1 a closure with NO preceding verify line is none of this gate's business", () => {
  const judge = { findingId: "sc-b:2", verdict: "PARTIAL", correctedBy: "w16", evidenceFrame: frame("w15") };
  const rows = [judge, closed("sc-b:2", "w17")];

  const { refused, unattributable } = findReclosures(rows, { buildOf, productDiff: noProductChange });
  assert.equal(refused.length, 0, "a judge changing its own mind is ordinary adjudication");
  assert.equal(unattributable.length, 0);
});

test("§1 only a FINAL verdict of CLOSED is examined", () => {
  const rows = [verify("sc-c:3", "w15"), { findingId: "sc-c:3", verdict: "STILL", correctedBy: "w17", evidenceFrame: frame("w17") }];
  const { refused } = findReclosures(rows, { buildOf, productDiff: noProductChange });
  assert.equal(refused.length, 0);
});

test("§1 an unnameable build is REPORTED, never refused", () => {
  // A false refusal is as bad as a false certificate. Missing provenance is not
  // evidence that a judge was wrong.
  const rows = [
    { findingId: "sc-d:4", verdict: "STILL", correctedBy: "verify", evidenceFrame: "E:/AI driver/.audit-frames/ancient/frames/x/01.png" },
    closed("sc-d:4", "w17"),
  ];
  const { refused, unattributable } = findReclosures(rows, { buildOf, productDiff: noProductChange });

  assert.equal(refused.length, 0);
  assert.equal(unattributable.length, 1);
  assert.equal(unattributable[0].id, "sc-d:4");
});

test("§1 git being unable to answer is reported, not refused", () => {
  const rows = [verify("sc-e:5", "w15"), closed("sc-e:5", "w17")];
  const { refused, unattributable } = findReclosures(rows, { buildOf, productDiff: () => null });

  assert.equal(refused.length, 0, "null is 'I cannot say', which is not 'the code is identical'");
  assert.equal(unattributable.length, 1);
});

test("§2 a frame names its sweep; a sweep that mixed builds names nothing", () => {
  assert.equal(buildOfFrame(frame("w15"), MAP), W15);
  assert.equal(buildOfFrame(frame("mixed"), MAP), null, "guessing here certifies against a state that never existed");
  assert.equal(buildOfFrame(frame("never-heard-of-it"), MAP), null);
  assert.equal(buildOfFrame("not-a-frame-path.png", MAP), null);
  assert.equal(buildOfFrame(null, MAP), null);
});

test("§2 backslash paths resolve identically to forward-slash ones", () => {
  const BS = String.fromCharCode(92);
  const win = ["E:", "AI driver", ".audit-frames", "w17", "frames", "sc-x__pc-right", "01-arrival.png"].join(BS);
  assert.equal(buildOfFrame(win, MAP), W17, "both shapes exist in this corpus and must agree");
});

test("§3 REGRESSION: sweepHeadMap must split the results file on real newlines", () => {
  // The bug that shipped in the first version of this gate: `.split("\\n")` —
  // a split on a literal backslash-n — left the whole results file as one
  // unsplittable line, so no head was ever read, EVERY sweep resolved to null,
  // and the gate reported all 69 candidates as unattributable while refusing
  // none. It looked like a working gate.
  const rows = [
    JSON.stringify({ head: W17, lesson: "sc-x", leg: "pc-right" }),
    JSON.stringify({ head: W17, lesson: "sc-y", leg: "pc-wrong" }),
  ].join("\n");

  const map = sweepHeadMap("/audit", {
    readDir: () => ["w17"],
    exists: (p) => p === "/audit/w17/wave-c-results.jsonl",
    readFile: () => rows,
  });

  assert.equal(map.get("w17"), W17, "if this is null the split is wrong and the gate refuses nothing");
});

test("§3 a sweep whose rows disagree about the build resolves to null", () => {
  const rows = [
    JSON.stringify({ head: W15, lesson: "sc-x" }),
    JSON.stringify({ head: W17, lesson: "sc-y" }),
  ].join("\n");

  const map = sweepHeadMap("/audit", {
    readDir: () => ["mixed"],
    exists: () => true,
    readFile: () => rows,
  });

  assert.equal(map.get("mixed"), null);
});

test("§3 a torn tail line does not discard the sweep", () => {
  const rows = [JSON.stringify({ head: W17 }), '{"head":"bc7d4'].join("\n");
  const map = sweepHeadMap("/audit", { readDir: () => ["w17"], exists: () => true, readFile: () => rows });
  assert.equal(map.get("w17"), W17);
});

test("§3 grouping preserves file order, which is the entire question", () => {
  const a = verify("sc-f:6", "w15");
  const b = closed("sc-f:6", "w17");
  const groups = linesByFinding([a, b]);
  assert.deepEqual(groups.get("sc-f:6"), [a, b]);
  assert.equal(groups.get("sc-f:6")[1].verdict, "CLOSED", "the LAST line must be the closing one");
});
