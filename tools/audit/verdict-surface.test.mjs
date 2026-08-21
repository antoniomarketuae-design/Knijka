// Run: node --test tools/audit/verdict-surface.test.mjs
// (collected automatically by `npm run test:tools` — the gate claims every
// *.test.mjs under tools/ that imports node:test.)
//
// WHAT THESE GUARD. Two consumers used to read "no verdict string" as "the
// lesson is merely unfinished, the debrief card IS there, read it". That was a
// compensator for a harness matcher that could not read «НЕЗАВЪРШЕН». The
// matcher is fixed; the compensator survived it, and now fires only on causes
// that are REAL PRODUCT DEFECTS — telling a judge the verdict is on a card that
// has no verdict on it. Every test below is one arm of that ladder.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyLeg, readLaneLedger, normaliseVerdict, LEG_STATES } from "./verdict-surface.mjs";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "verdict-surface-"));

/**
 * A lane on disk. `status: undefined` writes no ledger at all; a status object
 * is written verbatim, so a test can put the `verdictSurface` KEY in or leave
 * it out — which is the distinction the whole module turns on.
 *
 * 08-debrief.png is written on EVERY lane on purpose: the real harness writes
 * it unconditionally, so any rule that consults it is consulting a constant.
 */
function lane(name, { status, verdict = "(none)", debriefFrame = true } = {}) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  if (debriefFrame) fs.writeFileSync(path.join(dir, "08-debrief.png"), "x");
  if (status !== undefined) {
    fs.writeFileSync(path.join(dir, "_audit-status.json"), JSON.stringify({ phase: "complete", exit: 0, ...status }));
  }
  return { lesson: "sc-t", leg: name, verdict, out: dir };
}

test("all three pills — including «НЕЗАВЪРШЕН» — are verdicts, not silences", () => {
  for (const word of ["ИЗДЪРЖАН", "НЕИЗДЪРЖАН", "НЕЗАВЪРШЕН"]) {
    const c = classifyLeg(lane("pill-" + word, {
      verdict: word,
      status: { reachedVerdictCard: true, verdict: word, verdictSurface: "pill" },
    }));
    assert.equal(c.state, "verdict", word + " must classify as a verdict");
    assert.equal(c.verdict, word);
    assert.equal(c.judgeable, true);
    assert.match(c.label, new RegExp("\\(" + word + "\\)"));
  }
});

test("ABSENT verdictSurface is NOT the same as a null one — the load-bearing discriminator", () => {
  // A drive from before the field existed. All 376 drives of the standing Wave
  // C corpus are this shape.
  const old = classifyLeg(lane("pre-matcher", { status: { reachedVerdictCard: true, verdict: null } }));
  // A drive whose debrief reader threw: lesson-audit.mjs writes
  // `facts.verdictSurface ?? null`, so the KEY IS PRESENT and the value is null.
  const threw = classifyLeg(lane("threw", {
    status: { reachedVerdictCard: true, verdict: null, verdictSurface: null, error: "context destroyed" },
  }));

  assert.equal(old.state, "pre-matcher");
  assert.equal(threw.state, "reader-threw");
  assert.notEqual(old.state, threw.state, "`?? null` and `== null` collapse these two; they are opposite diagnoses");
  assert.equal(old.about, "unknown", "a pre-field drive is UNKNOWN — not a defect and not an unfinished lesson");
  assert.equal(threw.about, "instrument", "a reader that threw is a fact about this harness, not about the lesson");
  assert.equal(old.judgeable, false);
  assert.equal(threw.judgeable, false);
  assert.match(threw.why, /context destroyed/, "the reader's own error must reach the reader of the report");
});

test("a result screen with no pill is a PRODUCT DEFECT, never «unfinished, go read the card»", () => {
  const noPill = classifyLeg(lane("no-pill", {
    status: { reachedVerdictCard: true, verdict: null, verdictSurface: "no-pill" },
  }));
  const noSurface = classifyLeg(lane("no-surface", {
    status: { reachedVerdictCard: true, verdict: null, verdictSurface: "absent" },
  }));

  for (const c of [noPill, noSurface]) {
    assert.equal(c.about, "product");
    assert.equal(c.judgeable, false, "a defect closes nothing");
    // THE REGRESSION ITSELF. The old text was «НЕЗАВЪРШЕН — unfinished; the
    // debrief card IS there, read it». If that word or that instruction ever
    // reappears on a pill-less card, the compensator is back.
    assert.doesNotMatch(c.why + c.label, /НЕЗАВЪРШЕН/, "a pill-less card must not be called unfinished");
    assert.doesNotMatch(c.why + c.label, /IS there, read it/i, "do not send a judge to read a verdict that is not there");
    assert.match(c.why, /PRODUCT DEFECT/);
  }
  assert.equal(noPill.state, "no-pill");
  assert.equal(noSurface.state, "no-surface");
});

test("reachedVerdictCard:false outranks every surface value", () => {
  // Two drives in the standing corpus photographed a live cockpit with an
  // unclicked РЕЗУЛТАТ button. Whatever the surface field says, that frame is
  // not a debrief.
  const c = classifyLeg(lane("not-reached", {
    status: { reachedVerdictCard: false, verdict: null, verdictSurface: "pill" },
  }));
  assert.equal(c.state, "not-reached");
  assert.equal(c.judgeable, false);
});

test("no ledger does NOT fall back to 08-debrief.png — the frame is written unconditionally", () => {
  const c = classifyLeg(lane("no-ledger", { status: undefined, debriefFrame: true }));
  assert.equal(c.state, "no-ledger");
  assert.equal(c.judgeable, false, "the frame exists on every drive; it cannot certify one");
  assert.equal(c.about, "instrument");

  const torn = { lesson: "sc-t", leg: "torn", verdict: "(none)", out: path.join(ROOT, "torn") };
  fs.mkdirSync(torn.out, { recursive: true });
  fs.writeFileSync(path.join(torn.out, "_audit-status.json"), '{"phase":"complete","verdictSur');
  assert.equal(classifyLeg(torn).state, "no-ledger", "a torn ledger is unknown, not fine");
});

test("the lane ledger outranks the stdout-scraped row, and a mismatch certifies nothing", () => {
  const c = classifyLeg(lane("disagree", {
    verdict: "ИЗДЪРЖАН",
    status: { reachedVerdictCard: true, verdict: "НЕИЗДЪРЖАН", verdictSurface: "pill" },
  }));
  assert.equal(c.state, "disagreement");
  assert.equal(c.judgeable, false);
  assert.match(c.why, /ИЗДЪРЖАН/);
});

test("the ledger's OWN phase and exit outrank the row's process code", () => {
  // The direction that matters. `tools/mobile/wave-c.mjs` writes `exit:
  // res.status` — the node process's code — and BOTH consumers filter on it.
  // lesson-audit.mjs:4104 says not to: "READ `exit` OUT OF
  // `_audit-status.json`, and treat a process code that disagrees with it as
  // evidence about node, not about the lesson." So a lane whose process exited
  // 0 while its own ledger recorded EXIT_EVIDENCE_INCOMPLETE — a pill on the
  // glass and part of the evidence missing — must not come back judgeable.
  const lost = classifyLeg(lane("evidence-incomplete", {
    verdict: "ИЗДЪРЖАН",
    status: { exit: 3, reachedVerdictCard: true, verdict: "ИЗДЪРЖАН", verdictSurface: "pill" },
  }));
  assert.equal(lost.state, "evidence-incomplete");
  assert.equal(lost.judgeable, false, "a lane that says its own evidence is incomplete certifies nothing");
  assert.equal(lost.about, "instrument");
  assert.match(lost.why, /3/);

  // `phase: complete` with no exit written at all is the same answer: unknown.
  const noExit = classifyLeg(lane("no-exit", {
    verdict: "ИЗДЪРЖАН",
    status: { exit: null, reachedVerdictCard: true, verdict: "ИЗДЪРЖАН", verdictSurface: "pill" },
  }));
  assert.equal(noExit.state, "evidence-incomplete");
  assert.equal(noExit.judgeable, false);

  // Died mid-lane: `complete` is the only phase that ever writes verdictSurface,
  // so without this arm a fragment would be read as a drive that "predates the
  // matcher" and quietly told to re-drive for the wrong reason.
  const died = classifyLeg(lane("died", {
    status: { phase: "driving", exit: 0, reachedVerdictCard: true, verdict: "ИЗДЪРЖАН", verdictSurface: "pill" },
  }));
  assert.equal(died.state, "died");
  assert.equal(died.judgeable, false);
  assert.match(died.why, /driving/);

  // And a crashed lane whose ledger never wrote a phase at all is not "complete".
  const noPhase = classifyLeg(lane("no-phase", {
    status: { phase: null, exit: 0, reachedVerdictCard: true, verdict: "ИЗДЪРЖАН", verdictSurface: "pill" },
  }));
  assert.equal(noPhase.state, "died");
});

test("an unrecognised surface value is reported, not silently treated as fine", () => {
  const c = classifyLeg(lane("weird", {
    status: { reachedVerdictCard: true, verdict: null, verdictSurface: "probably-fine" },
  }));
  assert.equal(c.state, "unknown-surface");
  assert.equal(c.judgeable, false);
  assert.match(c.why, /probably-fine/);
});

test("«(none)», «-» and empty all mean no verdict string; a real word survives", () => {
  for (const v of [null, undefined, "", "  ", "(none)", "-"]) assert.equal(normaliseVerdict(v), null, JSON.stringify(v));
  assert.equal(normaliseVerdict(" издържан "), "ИЗДЪРЖАН");
});

test("the «(none — reason)» form Round 1 introduced is still a silence, not a verdict", () => {
  // These are the EXACT strings tools/mobile/wave-c.mjs's
  // `/VERDICT:\s*(.+?)\s*·/` scrape now yields, measured against the real
  // format string in lesson-audit.mjs. A `=== "(none)"` test misses every one
  // of them, and misses in the direction that reads as "this row has a verdict".
  for (const v of [
    "(none — no verdict surface in the DOM)",
    "(none — the surface mounted and carries NO pill)",
    "(none — the debrief reader never answered — Execution context was destroyed)",
  ]) {
    assert.equal(normaliseVerdict(v), null, v);
  }
  // …and a row carrying that prose must NOT be reported as contradicting a
  // ledger that says the same thing in a field.
  const c = classifyLeg(lane("none-prose", {
    verdict: "(none — the surface mounted and carries NO pill)",
    status: { reachedVerdictCard: true, verdict: null, verdictSurface: "no-pill" },
  }));
  assert.equal(c.state, "no-pill", "prose in the row must not mask the ledger's diagnosis");
});

test("readLaneLedger never throws and never invents an answer", () => {
  const r = readLaneLedger(path.join(ROOT, "does-not-exist-at-all"));
  assert.equal(r.ok, false);
  assert.equal(r.surfaceRecorded, false);
  assert.equal(r.reached, null, "unknown must not read as false, and must never read as true");
  assert.equal(readLaneLedger(null).ok, false);
});

test("exactly one state is judgeable, and it is the one with a pill", () => {
  const judgeable = Object.entries(LEG_STATES).filter(([, v]) => v.judgeable).map(([k]) => k);
  assert.deepEqual(judgeable, ["verdict"], "if a second state becomes judgeable, say why here first");
  // Every non-judgeable state must carry a tag, because the tag is what a judge
  // reads beside the leg and an empty bracket explains nothing.
  for (const [k, v] of Object.entries(LEG_STATES)) {
    if (k === "verdict") continue;
    assert.ok(v.tag && v.tag.length > 3, k + " needs a tag");
  }
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));
