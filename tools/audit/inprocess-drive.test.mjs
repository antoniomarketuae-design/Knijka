// -----------------------------------------------------------------------------
// inprocess-drive.test.mjs — AN INSTRUMENT THAT CANNOT SEE MUST SAY SO IN THE
// ARTEFACT, AND MUST REFUSE THE CLAIMS IT CANNOT SEE.
//
//   node --test tools/audit/inprocess-drive.test.mjs
//
// WHAT THIS DEFENDS. `inprocess-drive.mjs` runs the real grading chain and
// paints nothing. That is its whole value and its whole danger. A verdict from
// it that strays into a picture class retires a row nobody photographed, and
// this corpus has already been burned by that exact shape: closures resting on
// absence, on a frame nobody opened, on a leg that never drove the manoeuvre.
//
// So three properties are pinned here, and each of them has been watched to
// fail:
//
//   1. THE CONTRACT IS A FIELD. Every artefact carries what it may and may not
//      be cited for, in the JSON, not in a comment. §1.
//   2. THE REFUSAL IS A CODE PATH. A claim naming a class the instrument is
//      blind to produces an object carrying NONE of the verdict-shaped keys.
//      §2, §3.
//   3. THE FAILURES ARE LOUD. Every way it can fail to do its job has a code,
//      a message and a non-zero exit — never an empty result that reads like a
//      clean one. §7.
//
// AND ONE PROPERTY THAT IS NOT ABOUT BLINDNESS AT ALL: §4 is the negative
// controls. An over-refusing classifier is safe and useless, and the first
// draft of the blocker list was exactly that — it blocked
// sc-follow-tailgater:63c0c28c («0 наказателни точки, 0 опасни, 0 основни, 0
// второстепенни … drew a teach card») on the word `card`, and
// sc-sp-wet-limit-plate:d9fd3821 («the template header states the contrast IS
// the lesson», about dry versus wet) on the word `contrast`. Both are CRITICAL
// rows squarely inside this instrument's competence. §4 is what keeps them out
// of the refusal bucket, and §5 is the narrower rule that replaced the blunt one.
//
// THE FIXTURES ARE THE CORPUS'S OWN TEXT, copied from `.audit-frames/findings`
// at ebc56e1. They are fixtures, not corpus writes: `findingId` hashes `what`,
// so nothing here may ever be written back into a chunk file.
// -----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  admissibilityFor,
  APPEARANCE_PREDICATES,
  authoredRungs,
  balancedAfter,
  BLOCKERS,
  CAVEATS,
  CONTRACT,
  FAILURE_CODES,
  findRepoRoot,
  firstDifference,
  InProcessDriveError,
  optionKeysOf,
  parseArgs,
  recorderFor,
  recorderIndex,
  RECORDER_SHAPES,
  refusalFor,
  resolveTape,
  runOnce,
  sha256,
  splitParams,
  splitSentences,
  stableStringify,
  stripComments,
  SCRIPT_REPRODUCIBLE_OPTIONS,
  SURFACE_NOUNS,
  tapesFor,
  verifyDeterminism,
  VERDICT_SHAPED_KEYS,
} from "./inprocess-drive.mjs";

const ROOT = findRepoRoot();

/**
 * `assert.throws` returns undefined, so it cannot hand back the error the
 * assertion is really about — and every §7 test here is about the CODE, not
 * about the fact that something threw. This returns it.
 */
function thrown(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail("expected a throw, got a return — a silent success is the failure this file is about");
}

/** Real text from the live open list. Section §4's whole argument rests on these. */
const CORPUS = {
  // ---- picture-class criticals: all four of them, and every one blocks -----
  cyclistHook:
    "In both drives the car finishes INSIDE a building: the windscreen is filled edge to " +
    "edge with a flat orange facade, tan window frames and a grey structural column at arm's " +
    "length, with the car stationary at 0 km/h. The collision the debrief books is with " +
    "architecture, not with the cyclist the lesson teaches.",
  roundaboutIsland:
    "The car ends up driving on the central island. The whole windscreen is grass and a hedge " +
    "at point-blank range while the coach calmly says to leave the roundabout with the right " +
    "indicator. This is what earns the careful drive its −10 collision.",
  truckSpray:
    "At t102 the mobile wrong drive is doing 145 км/ч across open green field with no road " +
    "anywhere in frame — the car left the carriageway entirely and the sim keeps driving, keeps " +
    "the 140 limit chip on screen and raises no off-road state. A large untextured translucent " +
    "grey plane hangs in the sky above.",
  cityPlaza:
    "The route puts the car onto a pedestrian plaza. At pc t087 and mobile t101 the vehicle is " +
    "stopped on a wide grey paved area with a planter and a kiosk directly in its path, grass to " +
    "the right and the road behind it; the blue guidance line runs off to the left.",

  // ---- grading criticals: the population this instrument exists for --------
  wrongLegZero:
    "The wrong leg finishes 0 опасни / 0 основни / 0 второстепенни, Общо 0 and +40 XP after " +
    "running at 127-131 км/ч in a task that asks for ≤80.",
  rightLegsWorse: "The right legs score the same as or worse than the wrong drives.",
  neverWorked:
    "This lesson has never once been observed WORKING — no leg has completed it successfully.",
  taskTwoNeverTicks:
    "«Задача 2: паркирай на заден ход в разрешеното място» never ticks.",
  emergencyNoPenalty:
    "Failing to give way to an emergency vehicle carries no penalty — the wrong leg books " +
    "Опасни 0, Основни 0, Второстепенни 0, total 0.",

  // ---- the two rows the FIRST draft of the blocker list wrongly refused ----
  tailgaterCard:
    "The wrong drive escapes entirely: 0 наказателни точки, 0 опасни, 0 основни, 0 " +
    "второстепенни. The lesson's two authored mistakes — the punishing brake check at the " +
    "tailgater and the guilty acceleration — produced no fault at all; the only reason the " +
    "screen says НЕИЗДЪРЖАН is that not all route tasks were done. Driving at 59 km/h in a " +
    "posted 50 zone drew a teach card and no penalty.",
  motorwayCounter:
    "The right drive is never credited — the task counter never leaves 1/3, the exit the lesson " +
    "is named after is never reached and nothing about it is assessed.",
  wetContrast:
    "templates-speed2.ts:634 sets conditions: { weather: \"dry\" } on levels 1-2 and adds " +
    "weather: \"rain\" + wetGrip only at :630-632 on levels 3-5; the template header states the " +
    "contrast IS the lesson. SEPARATELY AND STILL OPEN: no leg of levels 3-5 has ever been " +
    "driven, so whether the WET rungs grade correctly is unmeasured.",

  // ---- a surface noun WITH an appearance predicate, one sentence ----------
  snowPanel: "The conditions panel is hidden behind the objective list for the whole drive.",

  // ---- caveat classes -----------------------------------------------------
  platformCross:
    "Same lesson, same scripted correct drive: PC ticks 0 of 3 objectives and scores 0, mobile " +
    "ticks 2 of 3 (at 1:55 and 2:47) and scores 3. Whether a student progresses in this lesson " +
    "depends on the device they use.",
  flakeRate:
    "THE REFERENCE CORRECT DRIVE PASSES ONE TIME IN EIGHT, ON IDENTICAL CODE. " +
    "sc-ln-obstacle-meeting/pc-right was driven eight consecutive times against commit " +
    "641a4475c0ac with an unchanged worktree.",
};

// -----------------------------------------------------------------------------
// § 1 — THE CONTRACT IS A FIELD, NOT A COMMENT
//
// The brief that produced this file says it in one line: "carry the ADMISSIBILITY
// CONTRACT as a first-class field in its own output, not as a comment. A judge
// reading only the JSON must be unable to mistake it for a photographed drive."
// A comment is invisible to the only reader who matters — the next judge, who
// has the artefact and not the source.
// -----------------------------------------------------------------------------

test("§1(a) the contract states, in data, that nothing was painted", () => {
  assert.equal(CONTRACT.painted, false);
  assert.equal(CONTRACT.photographed, false);
  assert.equal(CONTRACT.browser, false);
  assert.equal(CONTRACT.device, null);
  assert.match(CONTRACT.headline, /NOT A PHOTOGRAPHED DRIVE/);
  // MUTATION WATCHED: delete `painted` from CONTRACT and the first assertion
  // goes red — an artefact whose only claim to not being a photograph is the
  // filename it came from.
});

test("§1(b) the contract is frozen, so no caller can widen it for one artefact", () => {
  assert.ok(Object.isFrozen(CONTRACT));
  assert.ok(Object.isFrozen(CONTRACT.mayNotBeCitedFor));
  const before = CONTRACT.mayNotBeCitedFor.length;
  try {
    CONTRACT.mayNotBeCitedFor.push("anything I feel like citing it for");
  } catch {
    /* strict mode throws; sloppy mode silently ignores. Both must not mutate. */
  }
  assert.equal(CONTRACT.mayNotBeCitedFor.length, before);
  // MUTATION WATCHED: drop the Object.freeze on the arrays and the length
  // assertion goes red. A contract a caller can append to is a suggestion.
});

test("§1(c) the blindness list is longer than the competence list, and names the real classes", () => {
  assert.ok(
    CONTRACT.mayNotBeCitedFor.length > CONTRACT.mayBeCitedFor.length,
    "an instrument with no renderer cannot be citable for more than it is not",
  );
  const cannot = CONTRACT.mayNotBeCitedFor.join(" ").toLowerCase();
  for (const must of ["card", "truncated", "contrast", "camera", "guidance ribbon", "browser leg"]) {
    assert.ok(cannot.includes(must), `mayNotBeCitedFor never mentions "${must}"`);
  }
  // MUTATION WATCHED, one per element: drop the browser-leg line and the last
  // check goes red — that is the line that stops «pc-right books 0» from being
  // read off an artefact that drove no browser.
});

test("§1(d) every artefact-shaped thing this module emits carries the contract", () => {
  const refusal = refusalFor({ text: CORPUS.cyclistHook }, admissibilityFor(CORPUS.cyclistHook));
  assert.equal(refusal.admissibility, CONTRACT);
  // MUTATION WATCHED: drop `admissibility` from refusalFor and this goes red.
  // A refusal without the contract is a bare "no" a judge cannot audit.
});

// -----------------------------------------------------------------------------
// § 2 — THE REFUSAL IS A CODE PATH WITH A SHAPE, NOT A PARAGRAPH
//
// The danger is not that a refusal is worded badly. It is that a refusal looks
// enough like a result to be read as one. So the refusal object is tested
// against the VERDICT-SHAPED KEYS: if any of them appears, the object can be
// skimmed as a grading and the whole guard is decorative.
// -----------------------------------------------------------------------------

test("§2(a) a picture-class claim is refused, and the refusal names the class", () => {
  const adm = admissibilityFor(CORPUS.cyclistHook);
  assert.equal(adm.admissible, false);
  assert.deepEqual(
    adm.blockers.map((b) => b.class),
    ["paint", "paint"],
    "«windscreen» and «edge to edge» are two independent paint signals",
  );
  assert.ok(adm.blockers.every((b) => b.why.length > 20), "every blocker states WHY, not just WHAT");
});

test("§2(b) THE SHAPE GUARD — a refusal carries none of the verdict-shaped keys", () => {
  const refusal = refusalFor({ text: CORPUS.cyclistHook, findingId: "sc-vu-cyclist-hook:d867ca4c" },
    admissibilityFor(CORPUS.cyclistHook));
  assert.equal(refusal.kind, "refusal");
  assert.equal(refusal.noVerdict, true);
  for (const key of VERDICT_SHAPED_KEYS) {
    assert.ok(!Object.hasOwn(refusal, key), `a refusal must not carry "${key}" — it reads as a grading`);
  }
  // MUTATION WATCHED: add `sheet: null` to refusalFor's return — the tidy-looking
  // "keep the shape consistent" change — and this goes red on the first key. A
  // null sheet beside a refusal is still a sheet to a skimming reader.
  // MUTATION WATCHED: drop `noVerdict` and the second assertion goes red.
});

test("§2(c) a refusal says what WOULD settle it, and does not pretend to a direction", () => {
  const refusal = refusalFor({ text: CORPUS.roundaboutIsland }, admissibilityFor(CORPUS.roundaboutIsland));
  assert.match(refusal.whatWouldSettleIt, /photograph/i);
  assert.match(refusal.headline, /states nothing about the lesson in either direction/);
  // MUTATION WATCHED: reword the headline to "this row is probably fine" and the
  // second assertion goes red. A refusal that leans is a verdict wearing a
  // refusal's clothes, and leaning towards CLOSED is the cheapest lean there is.
});

test("§2(d) no claim at all is not a refusal — it is a measurement", () => {
  // A caller that supplies no claim is asking what the chain does, not whether
  // a row is closed. The artefact says so in `admissibility.claim.note`; there
  // is nothing to refuse.
  const adm = admissibilityFor(null);
  assert.equal(adm.admissible, true);
  assert.deepEqual(adm.blockers, []);
  assert.deepEqual(adm.caveats, []);
});

// -----------------------------------------------------------------------------
// § 3 — THE FOUR PICTURE-CLASS CRITICALS, EACH ONE REAL
//
// MEASURED over the live open list at ebc56e1: of 43 CRITICAL rows exactly four
// are picture claims, and all four block on `paint`. That is the list working —
// not the list being cautious.
// -----------------------------------------------------------------------------

test("§3(a) d867ca4c: «the windscreen is filled edge to edge»", () => {
  assert.equal(admissibilityFor(CORPUS.cyclistHook).admissible, false);
  // MUTATION WATCHED, and the first attempt at it was NOT ENOUGH, which is the
  // interesting part: dropping `windscreen` and `edge to edge` leaves this GREEN,
  // because `facade` catches it on its own. It takes all THREE — windscreen,
  // edge to edge, facade — to turn this admissible, and then the artefact is
  // free to say «the collision is booked, the row is settled» about a car that
  // finished inside a building. One sentence, three independent paint signals:
  // that redundancy is the property, and a single-token mutation cannot see it.
});

test("§3(b) 4ab693eb: «the whole windscreen is grass and a hedge at point-blank range»", () => {
  const adm = admissibilityFor(CORPUS.roundaboutIsland);
  assert.equal(adm.admissible, false);
  assert.ok(adm.blockers.some((b) => /point-blank/i.test(b.matched)));
});

test("§3(c) 7e53374c: an untextured plane, nothing in frame, a chip on screen", () => {
  const adm = admissibilityFor(CORPUS.truckSpray);
  assert.equal(adm.admissible, false);
  const matched = adm.blockers.map((b) => b.matched.toLowerCase());
  assert.ok(matched.includes("untextured"), "the texture claim");
  assert.ok(matched.includes("in frame"), "the framing claim");
  assert.ok(matched.includes("on screen"), "the HUD claim");
  // Three independent signals on one row, which is what a picture claim looks
  // like. MUTATION WATCHED, one per assertion: remove each token in turn.
});

test("§3(d) a0bdad4b: the plaza and the blue guidance line", () => {
  const adm = admissibilityFor(CORPUS.cityPlaza);
  assert.equal(adm.admissible, false);
  assert.deepEqual(new Set(adm.blockers.map((b) => b.class)), new Set(["paint", "guidance-ribbon"]));
  // MUTATION WATCHED: drop the guidance-ribbon entry and the class set loses a
  // member — the ribbon is a separate sense from the scene, and a row about the
  // ribbon must not be released just because the scene words were removed.
});

test("§3(e) the Bulgarian half of the same vocabulary blocks too", () => {
  // The corpus is bilingual and `\b` is ASCII-only, which is why the matcher
  // uses \p{L} lookarounds. A Cyrillic-blind blocker list is a blocker list
  // that passes exactly the rows written in the product's own language.
  for (const s of [
    "Надписът в долния ляв ъгъл е отрязан.",
    "Цветът на индикатора не се различава от фона.",
    "На екрана не се вижда нищо от таблото.",
  ]) {
    assert.equal(admissibilityFor(s).admissible, false, s);
  }
  // MUTATION WATCHED, one per element, because a loop stops at its first
  // failure. Element 2 goes red on dropping «цвят…» alone and element 3 on
  // dropping «екран…» + «вижда». Element 1 needs BOTH «надпис…» and «отрязан…»
  // gone — dropping either one alone leaves it green, because the other still
  // catches the sentence. Recorded as measured, not as assumed: the first
  // attempt at this mutation dropped only «отрязан…», survived, and would have
  // been written up as a covered case.
});

test("§3(f) ASCII \\b would not have caught the Cyrillic — the lookaround is load-bearing", () => {
  // Guard on the mechanism, not just the outcome: a maintainer who "simplifies"
  // W() back to \b breaks §3(e) for a reason that is invisible in its output.
  assert.equal(new RegExp("\\bекран\\b").test("На екрана"), false, "ASCII \\b cannot bound Cyrillic here");
  assert.equal(admissibilityFor("На екрана").admissible, false);
});

// -----------------------------------------------------------------------------
// § 4 — THE NEGATIVE CONTROLS. AN OVER-REFUSING INSTRUMENT IS USELESS.
//
// These are the rows the endgame is made of. Every one must come back
// admissible, because every one is a proposition about what the grading chain
// does once the car reaches a state — which is the one thing this instrument
// can answer, in 0.3 s, without a browser.
// -----------------------------------------------------------------------------

test("§4(a) «the wrong leg finishes 0 опасни / 0 основни / 0 второстепенни, Общо 0» is admissible", () => {
  const adm = admissibilityFor(CORPUS.wrongLegZero);
  assert.equal(adm.admissible, true);
  assert.ok(adm.caveats.some((c) => c.class === "sweep-leg"), "the leg half is caveated, not ignored");
  // MUTATION WATCHED: move the sweep-leg entry from CAVEATS into BLOCKERS —
  // the cautious-looking change — and this goes red. It would also refuse
  // §4(b) and §4(c), which is 3 of the 30 unjudged criticals surrendered to a
  // word that appears in almost all of them.
});

test("§4(b) «the right legs score the same as or worse than the wrong drives» is admissible", () => {
  assert.equal(admissibilityFor(CORPUS.rightLegsWorse).admissible, true);
});

test("§4(c) «never once been observed WORKING — no leg has completed it» is admissible", () => {
  assert.equal(admissibilityFor(CORPUS.neverWorked).admissible, true);
});

test("§4(d) «Задача 2 … never ticks» and «carries no penalty … total 0» are admissible", () => {
  assert.equal(admissibilityFor(CORPUS.taskTwoNeverTicks).admissible, true);
  assert.equal(admissibilityFor(CORPUS.emergencyNoPenalty).admissible, true);
  assert.deepEqual(admissibilityFor(CORPUS.taskTwoNeverTicks).caveats, [], "nothing to caveat here at all");
});

test("§4(e) 63c0c28c: a grading row that MENTIONS a card is not a card row", () => {
  // The row the first draft got wrong. Its claim is «0 наказателни точки, 0
  // опасни, 0 основни, 0 второстепенни … produced no fault at all» — measurable
  // in-process to the point. It says «drew a teach card» in passing, and the
  // teach channel is something this instrument reads directly.
  const adm = admissibilityFor(CORPUS.tailgaterCard);
  assert.equal(adm.admissible, true);
  assert.ok(
    adm.caveats.some((c) => c.class === "surface-mention"),
    "the card is still flagged — as a caveat, which is the honest weight",
  );
  // MUTATION WATCHED: put `card|cards` back into the always-block ui-chrome
  // entry, as the first draft had it, and this goes red — one CRITICAL row
  // surrendered for a noun.
  // MUTATION WATCHED: drop `screen|screens` from SURFACE_NOUNS and the caveat
  // assertion still passes on `card`; drop BOTH and it goes red. The caveat is
  // what stops a reader forgetting «the screen says НЕИЗДЪРЖАН» was never seen.
});

test("§4(f) 2b903830: «the task counter never leaves 1/3» is admissible, with the counter caveated", () => {
  const adm = admissibilityFor(CORPUS.motorwayCounter);
  assert.equal(adm.admissible, true);
  assert.ok(adm.caveats.some((c) => c.matched.toLowerCase() === "counter"));
  // The honest split, stated: this artefact can say «objectives 2 and 3 never
  // ticked»; it cannot say the counter on the glass agreed with that. The
  // caveat is the second half.
  // MUTATION WATCHED: block on a bare `counter` and this goes red.
});

test("§4(g) d9fd3821: «the contrast IS the lesson» is about dry versus wet, not about pixels", () => {
  const adm = admissibilityFor(CORPUS.wetContrast);
  assert.equal(adm.admissible, true);
  // MUTATION WATCHED: put a bare `contrast` token back into the typography
  // blocker and this goes red — and the row it refuses is the one that ends
  // «no leg of levels 3-5 has ever been driven … One L3-L5 drive settles it»,
  // which is this instrument's single cheapest win in the whole corpus.
});

test("§4(h) real visual contrast still blocks — the narrowing is not a hole", () => {
  for (const s of [
    "The label fails the contrast ratio against the panel behind it.",
    "Low contrast between the two chips.",
    "The colour contrast on the star row is insufficient.",
  ]) {
    assert.equal(admissibilityFor(s).admissible, false, s);
  }
  // MUTATION WATCHED: delete the whole contrast alternation from the typography
  // blocker and this goes red on ELEMENT 2 — «Low contrast between the two
  // chips», whose only other signal is `chips`, a surface noun with no predicate,
  // which is a caveat and not a block. Elements 1 and 3 survive that mutation on
  // `panel … behind` and on `colour` respectively, so element 2 is the one
  // carrying the rule, and it is the one that would silently start passing if
  // somebody "simplified" the alternation away.
});

// -----------------------------------------------------------------------------
// § 5 — A SURFACE NOUN IS A PICTURE CLAIM ONLY WITH A PREDICATE BESIDE IT
// -----------------------------------------------------------------------------

test("§5(a) «the panel is hidden behind …» blocks: a surface and how it looks, one sentence", () => {
  const adm = admissibilityFor(CORPUS.snowPanel);
  assert.equal(adm.admissible, false);
  assert.equal(adm.blockers[0].class, "ui-chrome");
  assert.match(adm.blockers[0].matched, /panel .* (hidden|behind)/);
  // MUTATION WATCHED: drop the conditional pass in admissibilityFor entirely —
  // keep only the always-block tables — and this goes red while every §4 test
  // stays green. The two halves of the rule are watched apart.
});

test("§5(b) THE SENTENCE BINDING — a predicate two sentences away does not block", () => {
  // This is a KNOWN HOLE, recorded rather than papered over. Widening the window
  // to the whole row would re-block §4(e) and §4(f), whose rows carry both a
  // surface noun and, elsewhere, words like «behind» and «empty». The always-
  // block lists cover the genuinely visual rows: measured, all four picture-class
  // criticals block on `paint` and none of them needs this rule at all.
  const twoSentences = "The result panel lists three tasks. The road behind the car is empty.";
  assert.equal(admissibilityFor(twoSentences).admissible, true);
  const oneSentence = "The result panel is empty.";
  assert.equal(admissibilityFor(oneSentence).admissible, false);
  // MUTATION WATCHED: test the WHOLE row for a predicate instead of the sentence
  // and the first assertion goes red — and with it §4(e), whose row says «the
  // road tasks were done» in one sentence and «teach card» in another.
});

test("§5(c) splitSentences keeps «templates-speed2.ts:583-594» in one piece", () => {
  // The corpus quotes file paths, line ranges and decimal speeds. A splitter
  // that treats every full stop as a terminator shatters them, and a shattered
  // sentence cannot bind a noun to its predicate.
  const s = splitSentences(
    "sc-swp-finish is a bare position gate — { kind: \"reachZone\", radiusM: 12 } in " +
      "templates-speed2.ts:583-594. It ticked at 58,9 км/ч under a posted 50.",
  );
  assert.equal(s.length, 2);
  assert.ok(s[0].includes("templates-speed2.ts:583-594"));
});

test("§5(d) the surface-noun list and the predicate list are both non-empty and disjoint in role", () => {
  assert.ok(SURFACE_NOUNS.test("the card"), "a noun");
  assert.equal(SURFACE_NOUNS.test("the cardiologist"), false, "the boundary is real");
  assert.ok(APPEARANCE_PREDICATES.test("is hidden"), "a predicate");
  assert.equal(APPEARANCE_PREDICATES.test("behinds"), false);
  // MUTATION WATCHED: drop the lookarounds from W() and «cardiologist» matches,
  // which turns any prose about a doctor into a UI claim — the same trap
  // build-redrive.test.mjs §4(m) records for `pc` inside `upcoming`.
});

// -----------------------------------------------------------------------------
// § 6 — CAVEATS STAMP, THEY DO NOT REFUSE
// -----------------------------------------------------------------------------

test("§6(a) a platform cross is caveated, because this instrument drove no platform", () => {
  const adm = admissibilityFor(CORPUS.platformCross);
  assert.equal(adm.admissible, true);
  const classes = adm.caveats.map((c) => c.class);
  assert.ok(classes.includes("platform-cross"));
  // MUTATION WATCHED: move platform-cross into BLOCKERS and this goes red. It
  // would also refuse 13 of the 43 criticals, most of which say «on both
  // platforms» as a rider on a grading claim, not as the claim.
});

test("§6(b) a RATE claim is caveated — one deterministic pair of runs is not a rate", () => {
  const adm = admissibilityFor(CORPUS.flakeRate);
  assert.equal(adm.admissible, true);
  assert.ok(adm.caveats.some((c) => c.class === "rate"));
  // MUTATION WATCHED: drop the rate entry and this goes red — an artefact whose
  // determinism block says «2 runs, identical» would otherwise read as a
  // refutation of «passes one time in eight», which it is not: eight browser
  // drives and two in-process ones are not the same experiment.
});

test("§6(c) every caveat and every blocker carries a class and a reason", () => {
  for (const table of [BLOCKERS, CAVEATS]) {
    for (const entry of table) {
      assert.ok(entry.class && entry.class.length > 2, "a class");
      assert.ok(entry.why && entry.why.length > 30, `${entry.class} needs a reason a judge can read`);
      assert.ok(entry.re instanceof RegExp);
    }
  }
  // MUTATION WATCHED: replace a `why` with "" and this goes red. A skip list
  // without reasons is one that grows by accretion — the same rule
  // build-redrive.test.mjs §7 puts on NO_SIMULATOR_ROUTE.
});

// -----------------------------------------------------------------------------
// § 7 — LOUD FAILURE. SILENCE WHERE EVIDENCE SHOULD BE LOUDEST IS THE BUG.
//
// Every one of these paths used to be, in the ad-hoc snippets this file
// replaces, a `try { … } catch {}` or an undefined that flowed onward into a
// zero. A drive that graded nothing and a drive that graded a clean run print
// the same 0 unless the difference is thrown.
// -----------------------------------------------------------------------------

/** The smallest chain that satisfies runOnce. Everything here is a stand-in. */
function fakeChain({ phase = "completed", teach = [] } = {}) {
  const result = {
    summary: {
      score: {
        totalPoints: 0, opasniPoints: 0, osnovniPoints: 0, vtorostepenniPoints: 0,
        opasniCount: 0, osnovniCount: 0, vtorostepenniCount: 0,
        hasDangerous: false, ledgerClosedAtSec: null, unscoredAfterClose: 0,
      },
      passed: true, failReasons: [], terminated: false,
      mistakes: [], commendations: [], conceptIds: [],
    },
    objectives: [], completedAll: true, aborted: false, passed: true,
    score: 0, effectiveScore: 0, escalations: [], durationSec: 12.5, coachedMistakes: [],
  };
  return {
    engine: {
      createLessonSession: () => ({ phase: "driving" }),
      applyTick: (s) => ({ state: { ...s, phase }, teachMoments: teach }),
      buildLessonResult: () => result,
    },
    debrief: { buildDebrief: () => ({ text: "разбор", conceptIds: [] }) },
    rubric: { scoreRubric: () => ({ stars: 3, breakdownBg: [] }) },
    observation: { parkingObservationFromTrace: () => null },
  };
}

const fakePlan = (record) => ({
  lessonId: "sc-fixture",
  spec: {},
  lesson: { id: "sc-fixture@L3" },
  source: { kind: "authored-shadow-tape", name: "shadow-correct" },
  record,
});

const drove = (n) => (onTick) => {
  for (let i = 0; i < n; i++) onTick({ t: i / 60 });
  return { trace: { samples: new Array(n) }, ruleEvents: [], outcomes: [] };
};

test("§7(a) NO_TICKS — a tape that grades nothing must not print a clean sheet", () => {
  const err = thrown(() =>
    runOnce(fakeChain(), fakePlan(() => ({ trace: { samples: [] }, ruleEvents: [], outcomes: [] }))),
  );
  assert.ok(err instanceof InProcessDriveError);
  assert.equal(err.code, "NO_TICKS");
  assert.match(err.message, /an empty result reads exactly like a clean one/);
  // MUTATION WATCHED: delete the ticks === 0 guard and the same call returns a
  // fully-formed artefact reading «Общо 0 · 3★ · ИЗДЪРЖАН» for a drive that
  // never happened. That artefact is indistinguishable from a perfect run.
});

test("§7(b) STUCK_IN_PREDRIVE — a lesson whose pre-drive never released graded nothing either", () => {
  const chain = fakeChain({ phase: "preDrive" });
  chain.engine.createLessonSession = () => ({ phase: "preDrive" });
  const err = thrown(() => runOnce(chain, fakePlan(drove(100))));
  assert.ok(err instanceof InProcessDriveError);
  assert.equal(err.code, "STUCK_IN_PREDRIVE");
  // MUTATION WATCHED: drop the preDrive branch and the phase falls through to
  // the interpretable set... which it is NOT a member of, so UNINTERPRETABLE_PHASE
  // fires instead and this assertion goes red on the code. Two guards, two
  // diagnoses: one says "the tape cannot do pre-drive", the other says "I do not
  // know what happened", and telling a judge the wrong one wastes a wave.
});

test("§7(c) UNINTERPRETABLE_PHASE — a phase this file does not know is not a result", () => {
  const err = thrown(() => runOnce(fakeChain({ phase: "teleported" }), fakePlan(drove(10))));
  assert.ok(err instanceof InProcessDriveError);
  assert.equal(err.code, "UNINTERPRETABLE_PHASE");
  assert.match(err.message, /teleported/);
  // MUTATION WATCHED: widen the allow-list to `phase !== "preDrive"` and this
  // goes red — a future fifth phase would be graded as if it were `driving`.
});

test("§7(d) RECORDER_THREW — the recorder's own error is surfaced, not swallowed", () => {
  const err = thrown(() =>
    runOnce(fakeChain(), fakePlan(() => { throw new Error("unknown drive sc-x/nope"); })),
  );
  assert.ok(err instanceof InProcessDriveError);
  assert.equal(err.code, "RECORDER_THREW");
  assert.match(err.message, /unknown drive sc-x\/nope/);
  assert.ok(String(err.detail.error).includes("unknown drive"), "the stack is carried, not paraphrased");
});

test("§7(e) `driving` at the end is a REAL answer and must not throw", () => {
  // A tape that runs out with the drive still open is the single most common
  // shape behind «this lesson has never once been observed WORKING». Throwing
  // on it would hide the very evidence the row needs, so it is reported —
  // `reachedItsOwnEnd: false` — and never inferred from the score.
  const out = runOnce(fakeChain({ phase: "driving" }), fakePlan(drove(50)));
  assert.equal(out.drive.endPhase, "driving");
  assert.equal(out.drive.reachedItsOwnEnd, false);
  assert.equal(out.drive.ticks, 50);
  // MUTATION WATCHED: derive reachedItsOwnEnd from `passed` instead of the
  // phase and this goes red on the fake, whose result passes while its phase
  // says the drive never ended.
});

test("§7(f) the teach channel is carried separately from the fault ledger", () => {
  // The distinction the corpus keeps losing: a first-encounter основна is TAUGHT
  // and not charged, so it is absent from `faults` and present in `teachMoments`.
  // Measured on the real tree: sc-rb-ped-exit/mistake-panic-brake books
  // HARSH_BRAKING_NO_CAUSE as a teach moment at t 5.3 and ZERO faults, and a
  // reader with only the sheet would call that drive clean.
  const out = runOnce(
    fakeChain({ teach: [{ code: "HARSH_BRAKING_NO_CAUSE", t: 5.3, severity: "основна", points: 3, titleBg: "x" }] }),
    fakePlan(drove(10)),
  );
  assert.deepEqual(out.faults, []);
  assert.equal(out.teachMoments.length, 10, "one per tick from the fake — the channel is not deduplicated here");
  assert.equal(out.teachMoments[0].code, "HARSH_BRAKING_NO_CAUSE");
  // MUTATION WATCHED: fold teachMoments into faults and the first assertion goes
  // red — which is the shape that lets a debrief say «карането беше чисто» over
  // a 59-in-a-50.
});

test("§7(g) an unlisted failure code is itself a defect, and says so", () => {
  const err = new InProcessDriveError("SOMETHING_NEW", "boom");
  assert.equal(err.code, "USAGE");
  assert.match(err.message, /unlisted failure code "SOMETHING_NEW"/);
  assert.equal(err.detail.unlistedCode, "SOMETHING_NEW");
  // MUTATION WATCHED: accept any code and this goes red. A code nobody can grep
  // for is a failure nobody can count, and this audit counts failures.
});

test("§7(h) FAILURE_CODES is closed and has no duplicates", () => {
  assert.equal(new Set(FAILURE_CODES).size, FAILURE_CODES.length);
  for (const c of ["NO_TICKS", "TAPE_NOT_FOUND", "RUNG_NOT_AUTHORED", "NONDETERMINISTIC", "AMBIGUOUS_RECORDER"]) {
    assert.ok(FAILURE_CODES.includes(c), c);
  }
});

test("§7(i) tape resolution refuses rather than picking", () => {
  const tapes = ["mistake-exit-through-ped", "mistake-panic-brake", "shadow-correct"];
  assert.equal(resolveTape(tapes, "shadow", "sc-x"), "shadow-correct");
  assert.equal(resolveTape(tapes, "mistake-panic-brake", "sc-x"), "mistake-panic-brake");
  const amb = thrown(() => resolveTape(tapes, "mistake", "sc-x"));
  assert.equal(amb.code, "TAPE_AMBIGUOUS");
  assert.deepEqual(amb.detail.matches, ["mistake-exit-through-ped", "mistake-panic-brake"]);
  const miss = thrown(() => resolveTape(tapes, "swerve", "sc-x"));
  assert.equal(miss.code, "TAPE_NOT_FOUND");
  assert.deepEqual(miss.detail.available, tapes, "the alternatives are printed, so an empty answer is not the answer");
  // MUTATION WATCHED: return matches[0] on an ambiguity and the third assertion
  // goes red — a mistake tape chosen by alphabetical order, graded, and cited.
});

test("§7(j) a missing tape folder is loud, and names where it looked", () => {
  const err = thrown(() => tapesFor(ROOT, "sc-does-not-exist"));
  assert.equal(err.code, "TAPE_NOT_FOUND");
  assert.ok(err.detail.looked.includes("sc-does-not-exist"));
});

test("§7(k) parseArgs refuses an unknown flag and a two-source drive", () => {
  assert.equal(thrown(() => parseArgs(["--lessn", "x"])).code, "USAGE");
  assert.equal(thrown(() => parseArgs(["--lesson"])).code, "USAGE");
  assert.equal(thrown(() => parseArgs(["--rung", "three"])).code, "USAGE");
  assert.equal(thrown(() => parseArgs(["--tape", "a", "--script", "b"])).code, "USAGE");
  assert.deepEqual(parseArgs(["--lesson", "sc-x", "--rung", "5", "--single-run"]),
    { singleRun: true, lesson: "sc-x", rung: 5 });
  // MUTATION WATCHED: let an unknown flag fall through and `--lesson sc-x --taps
  // mistake` silently drives the SHADOW tape and reports it as a mistake drive.
  // A typo that changes which drive was graded, exiting 0.
});

// -----------------------------------------------------------------------------
// § 8 — DETERMINISM IS MEASURED, NOT ASSERTED
// -----------------------------------------------------------------------------

test("§8(a) two identical runs stamp reran:true and a digest", () => {
  const { determinism } = verifyDeterminism(() => ({ a: 1, b: [2, 3] }));
  assert.equal(determinism.runs, 2);
  assert.equal(determinism.reran, true);
  assert.equal(determinism.identical, true);
  assert.match(determinism.digest, /^sha256:[0-9a-f]{64}$/);
});

test("§8(b) two runs that differ THROW, and name where", () => {
  let n = 0;
  const err = thrown(() =>
    verifyDeterminism(() => ({ objectives: [{ id: "o1", done: n++ === 0 }] }), { label: "sc-x" }),
  );
  assert.ok(err instanceof InProcessDriveError);
  assert.equal(err.code, "NONDETERMINISTIC");
  assert.equal(err.detail.firstDifference.path, "/objectives/0/done");
  assert.equal(err.detail.firstDifference.a, true);
  assert.equal(err.detail.firstDifference.b, false);
  // MUTATION WATCHED: compare with `===` on the objects instead of the serialized
  // strings and EVERY run throws (two fresh objects are never ===), which is the
  // loud-but-useless direction. MUTATION WATCHED: compare with JSON.stringify
  // instead of stableStringify and §8(d) goes red instead of this one.
});

test("§8(c) --single-run cannot hide: identical is null and the note says NOT VERIFIED", () => {
  const { determinism } = verifyDeterminism(() => ({ a: 1 }), { singleRun: true });
  assert.equal(determinism.runs, 1);
  assert.equal(determinism.reran, false);
  assert.equal(determinism.identical, null);
  assert.match(determinism.note, /NOT VERIFIED/);
  // MUTATION WATCHED: set `identical: true` on the single-run branch — it "looks
  // consistent" — and this goes red. A truthy identical over one run is a claim
  // the run cannot support, and it is the reassuring direction.
});

test("§8(d) stableStringify is key-order independent; JSON.stringify is not", () => {
  const a = { z: 1, a: { y: 2, b: 3 } };
  const b = { a: { b: 3, y: 2 }, z: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(b), "which is why the digest cannot use it");
  assert.equal(sha256(stableStringify(a)), sha256(stableStringify(b)));
});

test("§8(e) stableStringify does not lose undefined into a shifting shape", () => {
  // `JSON.stringify({a: undefined})` is "{}" and `JSON.stringify([undefined])`
  // is "[null]" — two different erasures of the same value. A projection that
  // sometimes carries a key and sometimes does not would read as a determinism
  // failure that is really a serializer artefact.
  assert.equal(stableStringify({ a: undefined, b: 1 }), '{"a":null,"b":1}');
  assert.equal(stableStringify([undefined, 1]), "[null,1]");
});

test("§8(f) firstDifference walks arrays, objects and types, and reports null on agreement", () => {
  assert.equal(firstDifference({ a: 1 }, { a: 1 }), null);
  assert.equal(firstDifference([1, 2], [1, 2, 3]).why, "length 2 vs 3");
  assert.equal(firstDifference({ a: { b: [0, { c: 1 }] } }, { a: { b: [0, { c: 2 }] } }).path, "/a/b/1/c");
  assert.equal(firstDifference(1, "1").why, "type number vs string");
  assert.equal(firstDifference({ a: 1 }, {}).path, "/a");
});

// -----------------------------------------------------------------------------
// § 9 — THE SOURCE READERS. THEY DECIDE WHICH LESSON GETS DRIVEN.
//
// A shape reader that misreads a signature calls the wrong overload and grades
// a DIFFERENT lesson while exiting 0. The first version of `splitParams` split
// on every comma, so `extra?: Pick<RecordScriptedDriveOptions, "onTick">` read
// as two parameters and all 148 recorders came back UNKNOWN_RECORDER_SHAPE.
// Loud, and useless.
// -----------------------------------------------------------------------------

test("§9(a) splitParams ignores commas inside a generic", () => {
  assert.deepEqual(
    splitParams('districtRaw: unknown, name: ScRbPedExitTraceName, extra?: Pick<RecordScriptedDriveOptions, "onTick">'),
    ["districtRaw", "name", "extra"],
  );
  assert.deepEqual(
    splitParams("districtRaw: unknown, templateId: ScJunctionTemplateId, name: ScJunctionTraceName"),
    ["districtRaw", "templateId", "name"],
  );
  assert.deepEqual(splitParams("scenarioId: string, name: string, districtRaw: unknown"),
    ["scenarioId", "name", "districtRaw"]);
  // MUTATION WATCHED: `sig.split(",")` and the first case returns
  // ["districtRaw","name","extra","\"onTick\">"] — the pre-fix behaviour.
});

test("§9(b) balancedAfter finds the closing bracket, not the first one", () => {
  assert.equal(balancedAfter("f(a, g(b), c) tail", 0).body, "a, g(b), c");
  assert.equal(balancedAfter("{ a: { b: 1 } } tail", 0, "{", "}").body, " a: { b: 1 } ");
  assert.equal(balancedAfter("f(unclosed", 0), null, "an unclosed call is null, never a truncated guess");
});

test("§9(c) optionKeysOf reads SHORTHAND keys too", () => {
  // scRbPedExit.ts passes `kind,` with no colon. The first version matched only
  // `name:` and reported the option set incomplete — which for --script means
  // failing to refuse a lesson whose world it cannot rebuild.
  const src = `
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_X_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    stagedEvents: [...(SC_X.staged ?? [])],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });`;
  const keys = optionKeysOf(src);
  for (const k of ["scenarioId", "kind", "seed", "obstacles", "stagedEvents"]) {
    assert.ok(keys.includes(k), `missed ${k}`);
  }
  // MUTATION WATCHED: match only `([A-Za-z]+):` and `kind` disappears. Harmless
  // for `kind` (it is reproducible); the same miss on a shorthand `obstacles`
  // would let --script grade a parking lesson with no parked cars in it.
});

test("§9(d) nested object keys do not leak into the option set", () => {
  const src = `recordScriptedDrive(d, s(), {
    scenarioId: "sc-x",
    signalOffsets: { "jx-1": 3, "jx-2": 9 },
    seed: 7,
  });`;
  assert.deepEqual(optionKeysOf(src).sort(), ["scenarioId", "seed", "signalOffsets"]);
});

test("§9(e) a lesson id inside a COMMENT claims nothing", () => {
  // scRbPedExit.ts's header names sc-rb-circulate-priority twice. Reading
  // comments would make two modules claim it and every drive of that lesson an
  // AMBIGUOUS_RECORDER refusal.
  const src = '/* see "sc-other" */ const id = "sc-mine"; // and "sc-third"';
  const code = stripComments(src);
  assert.ok(code.includes('"sc-mine"'));
  assert.ok(!code.includes('"sc-other"'));
  assert.ok(!code.includes('"sc-third"'));
  // MUTATION WATCHED: drop the line-comment strip and "sc-third" survives —
  // and the `(^|[^:])` guard is what stops the strip from eating the `//` in a
  // "https://…" URL, which would swallow the rest of that line's code.
  assert.ok(stripComments('const u = "https://x/y"; const k = "sc-keep";').includes('"sc-keep"'));
});

test("§9(f) SCRIPT_REPRODUCIBLE_OPTIONS excludes exactly the world-shaping keys", () => {
  for (const k of ["obstacles", "ruleConfig", "signalOffsets", "signalModes"]) {
    assert.ok(!SCRIPT_REPRODUCIBLE_OPTIONS.includes(k), `${k} cannot be rebuilt from a compiled lesson`);
  }
  for (const k of ["stagedEvents", "collisionMinKmh", "seed"]) {
    assert.ok(SCRIPT_REPRODUCIBLE_OPTIONS.includes(k), `${k} IS on the compiled lesson`);
  }
  // MUTATION WATCHED: add `obstacles` to the list and --script silently drives
  // sc-park-wall in a car park with no wall and no van in it — every collision
  // the lesson exists to book simply does not happen, and the artefact says
  // «Общо 0» with a straight face.
});

// -----------------------------------------------------------------------------
// § 10 — THE REAL TREE. The algorithm being right is not the tree being right.
//
// §9 proves the readers work on fixtures. This section runs them over
// platform/src/modules/sim/traces as it actually is, because the failure that
// matters is a NEW recorder with a fifth signature shape landing quietly, and
// no fixture can see that.
// -----------------------------------------------------------------------------

test("§10(a) every recorder in the tree has a shape this file can call", () => {
  const index = recorderIndex(ROOT);
  const ambiguous = [...index.entries()].filter(([, v]) => v.ambiguous);
  const unknown = [...index.entries()].filter(
    ([, v]) => !v.ambiguous && !Object.hasOwn(RECORDER_SHAPES, v.shape),
  );
  assert.deepEqual(ambiguous.map(([id]) => id), [], "two modules claiming one lesson must refuse, not pick");
  assert.deepEqual(
    unknown.map(([id, v]) => `${id}: ${v.shape}`),
    [],
    "a fifth signature shape landed — add it to RECORDER_SHAPES rather than guessing",
  );
  assert.ok(index.size >= 167, `only ${index.size} lessons resolvable`);
});

test("§10(b) every committed tape folder resolves to a recorder, and has a shadow tape", () => {
  const index = recorderIndex(ROOT);
  const folders = fs.readdirSync(path.join(ROOT, "content", "traces")).sort();
  assert.ok(folders.length >= 167, `only ${folders.length} tape folders`);
  const unresolved = folders.filter((f) => !index.has(f));
  assert.deepEqual(unresolved, [], "a committed tape nothing can replay is a tape nobody can cite");
  const noShadow = folders.filter((f) => !tapesFor(ROOT, f).some((t) => t.startsWith("shadow")));
  assert.deepEqual(noShadow, [], "every lesson needs its correct demonstration — that is the right-leg proxy");
  // MUTATION WATCHED: require the id to be the module's OWN exported `*_ID` —
  // which is the tidier-looking rule — and this goes red with the reel drills
  // and the four multi-template modules' lessons in the unresolved list
  // (sc-accident-own-conduct, sc-animal-hazard, … : dispatched by id, never
  // declared as a const).
  //
  // AND A MUTATION THAT DOES **NOT** GO RED, recorded because it was tried:
  // making recorderIndex read COMMENTS (dropping stripComments) leaves both
  // §10(a) and this test green. MEASURED on today's tree: 176 claims either
  // way, 0 ambiguous either way — no comment in traces/ quotes another
  // lesson's id as a string literal. The guard is therefore currently
  // unexercised by the real tree; §9(e) is the fixture that proves the
  // mechanism, and the guard stays because a comment is not a claim and the
  // next header that quotes `"sc-x"` would silently make that lesson
  // undrivable.
});

test("§10(c) recorderFor refuses an unknown lesson with the alternatives in hand", () => {
  const err = thrown(() => recorderFor(ROOT, "sc-not-a-lesson"));
  assert.equal(err.code, "NO_RECORDER");
  assert.ok(err.detail.drivableCount > 100, "the refusal states how many it COULD drive");
});

test("§10(d) a synthetic tree with two claimants refuses, and one with a fifth shape refuses", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ipd-"));
  const dir = path.join(tmp, "platform", "src", "modules", "sim", "traces");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "scA.ts"),
    'export function recordScADrive(districtRaw: unknown, name: string) { return "sc-shared"; }\n');
  fs.writeFileSync(path.join(dir, "scB.ts"),
    'export function recordScBDrive(districtRaw: unknown, name: string) { return "sc-shared"; }\n');
  fs.writeFileSync(path.join(dir, "scC.ts"),
    'export function recordScCDrive(weather: string, mood: string) { return "sc-odd"; }\n');
  const index = recorderIndex(tmp);
  assert.deepEqual(index.get("sc-shared").ambiguous, ["scA.ts", "scB.ts"]);
  assert.equal(thrown(() => recorderFor(tmp, "sc-shared", index)).code, "AMBIGUOUS_RECORDER");
  assert.equal(thrown(() => recorderFor(tmp, "sc-odd", index)).code, "UNKNOWN_RECORDER_SHAPE");
  fs.rmSync(tmp, { recursive: true, force: true });
  // MUTATION WATCHED: sort the claimants and take the first — the "obvious"
  // determinism fix — and the AMBIGUOUS_RECORDER assertion goes red. Determinism
  // is not the property that matters here; being right about which lesson was
  // graded is.
});

test("§10(e) authoredRungs probes rather than assuming five, and does it without the product", () => {
  // The probe is a pure function of the compiler, so it can be tested with a
  // stand-in: rungs 4 and 5 throw, exactly as compileScenario does for a
  // template that does not author them (sc-ac-aquaplane: 1,2,3,4 on the real
  // tree; sc-animal-hazard: 1,2,3).
  const chain = {
    compile: {
      compileScenario: (_spec, level) => {
        if (level > 3) throw new Error("unauthored rung");
        return { id: `x@L${level}` };
      },
    },
  };
  assert.deepEqual(authoredRungs(chain, {}), [1, 2, 3]);
  // MUTATION WATCHED: hard-code [1,2,3,4,5] and a --rung 5 on sc-animal-hazard
  // stops refusing and starts throwing a raw ScenarioCompileError out of the
  // drive — a stack trace instead of "this rung is not authored, these are".
});
