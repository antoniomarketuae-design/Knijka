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
// §4 is PER-FRAME attribution, and — the half that matters more — the four
//    shapes that must STILL be refused after it.
// -----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import test from "node:test";

import {
  auditKey,
  buildOfFrame,
  findReclosures,
  headMaps,
  inProcessHead,
  linesByFinding,
  sweepHeadMap,
} from "./reclosure.mjs";

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

// -----------------------------------------------------------------------------
// §4 PER-FRAME ATTRIBUTION — and the refusals that survive it.
//
// The per-sweep vote left 13 re-closures unattributable, 8 of them critical.
// Every result line in the corpus records the directory it wrote (`out`) next
// to the commit it drove (`head`), so the drive directory is the better key.
// The tests that matter here are not the ones where it answers — they are the
// four shapes where it must still say nothing.
// -----------------------------------------------------------------------------

const SEP = String.fromCharCode(92);
/**
 * A results line in the shape the drivers actually write — `out` ABSOLUTE and
 * BACKSLASHED, which is how all 10,994 of them are on disk, while the frames
 * cited below are written forward-slashed and repo-relative. If the two shapes
 * did not reduce to one key the directory map would miss on real data and this
 * whole change would be a no-op that looked like it worked.
 */
const res = (sweep, lesson, leg, head, extra = {}) =>
  JSON.stringify({
    head, lesson, leg, exit: 0, treeMoved: false,
    out: "E:" + SEP + "AI driver" + SEP + ".audit-frames" + SEP + sweep + SEP + "frames" + SEP + lesson + "__" + leg,
    ...extra,
  });
const PROOF = "dd4e5983f63fda884723cfd1892b2597b0c3cd3b";
const OTHER = "641a4475c0ac269943e8691f780b7bf2e11564ae";
const INPROC = "095054b41d0179e626cdec7adedb42bd7b5ab747";

const mapsFrom = (files) =>
  headMaps("/audit", {
    readDir: () => Object.keys(files),
    exists: (p) => Object.prototype.hasOwnProperty.call(files, p.split("/")[2]),
    readFile: (p) => files[p.split("/")[2]],
  });

test("§4 a sweep that spans two builds still names the build of EACH drive", () => {
  // The `proof` case, and the whole reason the sweep was the wrong unit: 191 of
  // its 195 drives agree, and the sweep-wide vote refused all 195.
  const files = {
    proof: [
      res("proof", "sc-sp-wet-limit-plate", "mobile-right", OTHER),
      res("proof", "sc-ac-ice", "pc-right", PROOF),
      res("proof", "sc-junction-left", "pc-right", PROOF),
    ].join("\n"),
  };
  const maps = mapsFrom(files);

  assert.equal(maps.sweep.get("proof"), null, "the sweep vote must still refuse — it is the fallback, not the answer");
  assert.equal(
    buildOfFrame("E:/AI driver/.audit-frames/proof/frames/sc-ac-ice__pc-right/08-debrief-p3.png", maps),
    PROOF,
  );
  assert.equal(
    buildOfFrame(".audit-frames/proof/frames/sc-junction-left__pc-right/08-debrief-p1.png", maps),
    PROOF,
    "a repo-relative frame is the same frame",
  );
  assert.equal(
    buildOfFrame("E:/AI driver/.audit-frames/proof/frames/sc-sp-wet-limit-plate__mobile-right/01-arrival.png", maps),
    OTHER,
    "the four that disagree must get their OWN build, not the majority's",
  );
});

test("§4 REFUSAL KEPT: a drive whose tree moved under it names nothing, and does not fall back", () => {
  // wave-c-merge prints "<-- certify nothing" next to these. If this fell
  // through to the sweep vote, a drive the rest of the audit refuses to certify
  // would be certified here by its neighbours.
  const files = {
    w17: [
      res("w17", "sc-ac-snow", "mobile-right", W17, { treeMoved: true }),
      res("w17", "sc-ac-fog", "pc-right", W17),
    ].join("\n"),
  };
  const maps = mapsFrom(files);

  assert.equal(maps.sweep.get("w17"), W17, "the sweep itself is unanimous — that is the looser answer this must refuse");
  assert.equal(buildOfFrame("E:/AI driver/.audit-frames/w17/frames/sc-ac-snow__mobile-right/07-end.png", maps), null);
  assert.equal(buildOfFrame("E:/AI driver/.audit-frames/w17/frames/sc-ac-fog__pc-right/07-end.png", maps), W17);
});

test("§4 REFUSAL KEPT: a head that is not a 40-hex commit names nothing", () => {
  // ADDED 2026-09-19 after a judge drove headMaps with injected io and watched
  // it ATTRIBUTE every one of these. The dangerous ones are the git revisions:
  // "HEAD", "main" and "HEAD~5" all RESOLVE, so a line carrying one would be
  // judged against whatever that ref points at today rather than the build the
  // drive actually ran — `git diff HEAD dd4e5983 -- objectives.ts` exits 0 with
  // 178 insertions and 3,788 deletions. The rest are here because a shape check
  // that only rejects the scary-looking values is a shape check nobody can
  // reason about.
  const rubbish = [
    "HEAD",
    "main",
    "HEAD~5",
    "../../etc",
    "dd4e598", // a 7-char prefix: resolves in git, is not what was written down
    "z".repeat(40), // right length, not hex
    12345,
    true,
    " " + W17, // a stray space is not the commit
  ];
  for (const bad of rubbish) {
    const files = { odd: res("odd", "sc-ac-ice", "pc-right", bad) };
    const maps = mapsFrom(files);
    assert.equal(
      buildOfFrame("E:/AI driver/.audit-frames/odd/frames/sc-ac-ice__pc-right/07-end.png", maps),
      null,
      `attributed a build from ${JSON.stringify(bad)} — that certifies a verdict against a tree nobody measured`,
    );
  }
  // …and the well-formed one still answers, so this is a shape check and not a
  // blanket refusal that would empty the gate by breaking it.
  const good = mapsFrom({ odd: res("odd", "sc-ac-ice", "pc-right", W17) });
  assert.equal(
    buildOfFrame("E:/AI driver/.audit-frames/odd/frames/sc-ac-ice__pc-right/07-end.png", good),
    W17,
  );
});

test("§4 REFUSAL KEPT: one directory written by two builds names nothing, and does not fall back", () => {
  const files = {
    redrive: [
      res("redrive", "sc-ac-ice", "pc-right", W15),
      res("redrive", "sc-ac-ice", "pc-right", W17),
    ].join("\n"),
  };
  const maps = mapsFrom(files);
  assert.equal(
    buildOfFrame("E:/AI driver/.audit-frames/redrive/frames/sc-ac-ice__pc-right/07-end.png", maps),
    null,
    "a re-drive into the same directory is two builds in one place; guessing certifies a state that never existed",
  );
});

test("§4 REFUSAL KEPT: a frame path whose separators were eaten names no directory", () => {
  // THE FIXTURE THE REFUSAL EXISTS FOR, copied byte-for-byte in shape from the
  // corpus: JSON escaping turned "…\.audit-frames\w12\frames\02-briefing.png"
  // into "…​.audit-framesw12" + FORMFEED + "rames…" + STX + "-briefing.png".
  // Six of the thirteen unattributable rows are this, and no amount of
  // per-frame attribution may recover them: the sweep name in that string
  // survived a lossy transform, it is not a directory anybody recorded.
  const mangled =
    "E:AI driver.audit-framesw12" + String.fromCharCode(12) + "ramessc-ac-fog__mobile-right" +
    String.fromCharCode(2) + "-briefing.png";
  const maps = mapsFrom({ w12: res("w12", "sc-ac-fog", "mobile-right", W17) });

  assert.equal(auditKey(mangled), null, "it contains '.audit-frames' but no '.audit-frames/'");
  assert.equal(buildOfFrame(mangled, maps), null);
  assert.equal(
    buildOfFrame("E:/AI driver/.audit-frames/w12/frames/sc-ac-fog__mobile-right/02-briefing.png", maps),
    W17,
    "the SAME frame written intact resolves — which is what makes the refusal above a refusal and not a bug",
  );
});

test("§4 REFUSAL KEPT: an unnameable build is still LISTED by the gate, not silently dropped", () => {
  // End to end, because this is the property the whole tool rests on: a row
  // whose build cannot be named must appear in `unattributable` and must never
  // appear in `refused`. Constructed from the mangled shape above.
  const mangled = "E:AI driver.audit-framesw12" + String.fromCharCode(12) + "ramessc-ac-fog__mobile-right.png";
  const maps = mapsFrom({ w12: res("w12", "sc-ac-fog", "mobile-right", W17) });
  const rows = [
    { findingId: "sc-ac-fog:9a5d0fe0", verdict: "STILL", correctedBy: "verify", evidenceFrame: mangled },
    { findingId: "sc-ac-fog:9a5d0fe0", verdict: "CLOSED", correctedBy: "w12", evidenceFrame: "E:/AI driver/.audit-frames/w12/frames/sc-ac-fog__mobile-right/02-briefing.png" },
  ];

  const { refused, unattributable } = findReclosures(rows, {
    buildOf: (f) => buildOfFrame(f, maps),
    productDiff: () => "",
  });
  assert.equal(refused.length, 0);
  assert.equal(unattributable.length, 1);
  assert.equal(unattributable[0].id, "sc-ac-fog:9a5d0fe0");
  assert.equal(unattributable[0].a, null, "the side that could not be named must be reported as null, so the printout can say which");
  assert.equal(unattributable[0].b, W17);
});

// --- the in-process record -----------------------------------------------------

const inprocFile = (worktree) => JSON.stringify({ kind: "in-process-drive", input: { worktree } });
const inprocIo = (body) => ({ readFile: () => body });

test("§4 an in-process run names the worktree it executed, when that worktree was clean", () => {
  const body = inprocFile({ head: INPROC, productDirty: false, productDirtyFiles: 0 });
  const p = "E:/AI driver/.audit-frames/inprocess-w38/d9fd3821-L3-mistake-over-limit-in-wet.json";

  assert.equal(inProcessHead(p, inprocIo(body)), INPROC);
  // …and it reaches buildOfFrame, which no directory map can answer for: an
  // in-process run photographed nothing and wrote no frame directory.
  assert.equal(buildOfFrame(p, mapsFrom({}), inprocIo(body)), INPROC);
});

test("§4 REFUSAL KEPT: a DIRTY worktree names no build", () => {
  // `productDirty` is the whole warrant — it is what says the code that ran is
  // the code at that commit. Anything but an explicit false is an unnamed build.
  const p = "E:/AI driver/.audit-frames/inprocess-w38/x.json";
  assert.equal(inProcessHead(p, inprocIo(inprocFile({ head: INPROC, productDirty: true, productDirtyFiles: 4 }))), null);
  assert.equal(inProcessHead(p, inprocIo(inprocFile({ head: INPROC }))), null, "absent is not false");
  assert.equal(inProcessHead(p, inprocIo(inprocFile({ head: "095054b4", productDirty: false }))), null, "an abbreviation is not a commit this gate can diff");
  assert.equal(inProcessHead(p, inprocIo(JSON.stringify({ kind: "in-process-drive" }))), null, "no worktree block at all");
  assert.equal(inProcessHead(p, inprocIo("{not json")), null);
  assert.equal(inProcessHead(p, inprocIo(null)), null, "resolveFrame hands back null for a zero-byte or missing file");
  assert.equal(inProcessHead("E:/AI driver/.audit-frames/w12/frames/x/07-end.png", inprocIo(inprocFile({ head: INPROC, productDirty: false }))), null, "a .png is not a record, whatever the io returns");
  assert.equal(inProcessHead(p, null), null, "no io means nothing was read, which names nothing");
});

test("§4 the old single-Map call still works, so nothing that had one map is quietly re-pointed", () => {
  assert.equal(buildOfFrame(frame("w15"), MAP), W15);
  assert.equal(buildOfFrame(frame("mixed"), MAP), null);
  assert.equal(sweepHeadMap("/audit", {
    readDir: () => ["w17"],
    exists: () => true,
    readFile: () => res("w17", "sc-x", "pc-right", W17),
  }).get("w17"), W17);
});
