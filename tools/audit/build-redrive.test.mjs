// -----------------------------------------------------------------------------
// build-redrive.test.mjs — A SWEEP MUST DRIVE THE LEGS ITS FINDINGS NAME.
//
//   node --test tools/audit/build-redrive.test.mjs
//
// WHAT THIS DEFENDS. The drive set decides what a whole sweep photographs. Get it
// wrong in one direction and the sweep drives nothing while exiting 0 — which
// reads as a fast round, not an empty one. Get it wrong in the other and it
// drives all four legs of every lesson, most of them photographing legs no
// finding ever cited.
//
// BOTH HAPPENED ON 2026-08-30, in one afternoon:
//   · the old builder read a two-day-old batch file, so a 29-lesson sweep
//     dispatched FIVE drives and both shards exited clean;
//   · the first version of `legOfFrame` read only the modern path shape, so 44
//     of 58 rows named no leg and the set inflated to 90 drives.
//
// A THIRD WAY TO GET IT WRONG, measured 2026-09-11: read the prose for leg
// literals the prose does not contain. §3 assumed a cross-leg row writes
// "mobile-right". Across the 111 open rows it mostly writes English — "On PC the
// wrong drive", "In both drives", "any of the four legs" — so §4 exists.
//
// §1 is leg extraction, both corpus shapes.
// §2 is the set itself: what it counts, what it sorts by, and what it does when
//    a lesson names no leg at all.
// §3 is the leg a finding SPELLS OUT in prose.
// §4 is the leg a finding NAMES IN ENGLISH, and the mentions that must pull none.
// §5 is the rule §4 got INVERTED (`leg` is the platform word here, not the mode
//    word) and the quantifiers it could not read at all ("no leg has completed
//    it"), which left two CRITICAL rows driven on one leg each.
// -----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import test from "node:test";

import { legOfFrame, redriveSet, legsInProse , NO_SIMULATOR_ROUTE } from "./build-redrive.mjs";

const BS = String.fromCharCode(92);
const row = (o) => ({ scenario: "sc-x", severity: "major", frame: "", ...o });

test("§1 the modern shape: <sweep>/frames/<lesson>__<leg>/", () => {
  assert.equal(legOfFrame("E:/AI driver/.audit-frames/w17/frames/sc-x__pc-right/01-arrival.png"), "pc-right");
  assert.equal(legOfFrame("E:/AI driver/.audit-frames/w17/frames/sc-x__mobile-wrong/08-debrief.png"), "mobile-wrong");
});

test("§1 the sweep161 shape: sweep161/<lesson>/<leg>/ — 44 of 58 rows use it", () => {
  assert.equal(legOfFrame("E:/AI driver/.audit-frames/sweep161/sc-vp-stall/mobile-right/04-t029s.png"), "mobile-right");
  assert.equal(legOfFrame("E:/AI driver/.audit-frames/sweep161/sc-vu-emergency/pc-wrong/07-end.png"), "pc-wrong");
});

test("§1 backslash paths read the same as forward-slash ones", () => {
  const win = ["E:", "AI driver", ".audit-frames", "sweep161", "sc-x", "pc-right", "01.png"].join(BS);
  assert.equal(legOfFrame(win), "pc-right");
});

test("§1 an unrecognised shape returns null rather than guessing a leg", () => {
  // The caller reads null as "drive all four". Guessing one leg here is how a
  // row stays unprovable for another whole round.
  assert.equal(legOfFrame("E:/AI driver/.audit-frames/proof/summary.json"), null);
  assert.equal(legOfFrame("sc-x/desktop-right/01.png"), null, "not one of the four valid legs");
  assert.equal(legOfFrame(""), null);
  assert.equal(legOfFrame(null), null);
  assert.equal(legOfFrame(undefined), null);
});

test("§1 the LAST matching segment wins, so a lesson named like a leg cannot fool it", () => {
  assert.equal(
    legOfFrame("E:/AI driver/.audit-frames/pc-right/frames/sc-x__mobile-right/01.png"),
    "mobile-right",
  );
});

test("§2 a lesson drives exactly the legs its findings name, deduplicated", () => {
  const set = redriveSet([
    row({ frame: "/a/.audit-frames/w17/frames/sc-x__pc-right/1.png" }),
    row({ frame: "/a/.audit-frames/w17/frames/sc-x__pc-right/2.png" }),
    row({ frame: "/a/.audit-frames/sweep161/sc-x/mobile-wrong/3.png" }),
  ]);

  assert.equal(set.length, 1);
  assert.deepEqual(set[0].legs, ["mobile-wrong", "pc-right"]);
  assert.equal(set[0].total, 3);
});

test("§2 a lesson whose findings name NO leg gets an empty list, which means all four", () => {
  const set = redriveSet([row({ scenario: "sc-y", frame: "/a/.audit-frames/proof/summary.json" })]);
  assert.deepEqual(set[0].legs, [], "wave-c reads an empty list as 'drive all four'");
});

test("§2 criticals are counted, and the set is ordered heaviest-in-critical first", () => {
  const set = redriveSet([
    row({ scenario: "light", severity: "major", frame: "/a/.audit-frames/w17/frames/light__pc-right/1.png" }),
    row({ scenario: "heavy", severity: "critical", frame: "/a/.audit-frames/w17/frames/heavy__pc-right/1.png" }),
    row({ scenario: "heavy", severity: "critical", frame: "/a/.audit-frames/w17/frames/heavy__pc-wrong/1.png" }),
  ]);

  assert.equal(set[0].lesson, "heavy", "the dispatcher interleaves shards; heaviest first spreads the cost");
  assert.equal(set[0].critical, 2);
  assert.equal(set[1].critical, 0);
});

test("§2 --lessons restricts the set and never invents a lesson that has nothing open", () => {
  const rows = [
    row({ scenario: "sc-a", frame: "/a/.audit-frames/w17/frames/sc-a__pc-right/1.png" }),
    row({ scenario: "sc-b", frame: "/a/.audit-frames/w17/frames/sc-b__pc-right/1.png" }),
  ];
  const set = redriveSet(rows, { only: new Set(["sc-a", "sc-nothing-open"]) });

  assert.equal(set.length, 1);
  assert.equal(set[0].lesson, "sc-a");
});

test("§2 rows with no lesson at all are skipped, not crashed on", () => {
  const set = redriveSet([{ severity: "major", frame: "/a/.audit-frames/w17/frames/x__pc-right/1.png" }]);
  assert.equal(set.length, 0);
});

// -----------------------------------------------------------------------------
// § 3 — THE PROSE LEG. A cross-leg claim carries ONE frame, and a frame is one
// leg, so the other half of the sentence lives only in `what`. Nine of the ten
// verdict lines on sc-turn-left-oncoming:d079e687 say "only the two PC legs of
// this lesson were re-driven" — the judge was right every time, and the
// work-list never sent the mobile half.
// -----------------------------------------------------------------------------

test("§3(a) a row whose prose names a second leg gains it", () => {
  // The real text and the real frame path from the corpus.
  const rows = [{
    scenario: "sc-turn-left-oncoming",
    severity: "major",
    frame: ".audit-frames/sweep161/sc-turn-left-oncoming/pc-right/08-debrief.png",
    what: "Same lesson, same scripted correct drive, different convictions by platform: "
      + "pc-right records 1 опасна грешка and 10 points, mobile-right records 0 mistakes and 0 points.",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, ["mobile-right", "pc-right"]);
});

test("§3(b) THE EMPTY GUARD — prose alone may never populate an empty leg list", () => {
  // [] means "drive all four" downstream. One prose leg would drop three.
  const rows = [{
    scenario: "sc-x",
    severity: "major",
    frame: "no/leg/in/this/path.png",
    what: "mobile-right shows it too",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, [], "an all-frameless lesson must keep the all-four fallback");
});

test("§3(c) prose repeating the frame's own leg is idempotent", () => {
  const rows = [{
    scenario: "sc-y", severity: "minor",
    frame: ".audit-frames/w18/frames/sc-y__pc-wrong/04.png",
    what: "on pc-wrong the card never appears",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, ["pc-wrong"]);
});

test("§3(d) a non-leg token adds nothing", () => {
  const rows = [{
    scenario: "sc-z", severity: "minor",
    frame: ".audit-frames/w18/frames/sc-z__pc-right/04.png",
    what: "desktop-right and bare mobile are not legs",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, ["pc-right"]);
});

test("§3(e) legsInProse tolerates null, undefined and empty", () => {
  assert.deepEqual(legsInProse(null), []);
  assert.deepEqual(legsInProse(undefined), []);
  assert.deepEqual(legsInProse(""), []);
});

test("§3(f) the union is a SUPERSET — never smaller than the frame legs alone", () => {
  const rows = [
    { scenario: "sc-w", severity: "critical",
      frame: ".audit-frames/w18/frames/sc-w__pc-right/04.png",
      what: "pc-right differs from mobile-wrong here" },
    { scenario: "sc-w", severity: "major",
      frame: ".audit-frames/sweep161/sc-w/pc-wrong/08.png",
      what: "no other leg named" },
  ];
  const legs = redriveSet(rows)[0].legs;
  for (const must of ["pc-right", "pc-wrong"]) assert.ok(legs.includes(must), must + " was dropped");
  assert.ok(legs.includes("mobile-wrong"), "the prose leg was not added");
});

/* ── §7 lessons with no /simulator route ─────────────────────────────────── */

test("§7 app-login is not dispatched, and its row is NOT removed from the open list", () => {
  const open = [
    { scenario: "app-login", severity: "major", what: "the login form at 852x393", frame: "" },
    { scenario: "sc-park-wall", severity: "critical", what: "pc-right shows x", frame: "" },
  ];
  const set = redriveSet(open);
  assert.deepEqual(set.map((r) => r.lesson), ["sc-park-wall"]);
  // The point of the exclusion is that the CAMERA cannot reach it — not that the
  // defect stopped existing. `open` is untouched, which is what keeps the count
  // honest.
  assert.equal(open.length, 2);
  // MUTATION WATCHED: drop the NO_SIMULATOR_ROUTE guard and the set carries
  // app-login again — four drives a round, exit=7 four times, as in w30.
});

test("§7 --include-undrivable puts it back, so the exclusion is testable rather than permanent", () => {
  const open = [{ scenario: "app-login", severity: "major", what: "", frame: "" }];
  assert.equal(redriveSet(open).length, 0);
  assert.equal(redriveSet(open, { includeUndrivable: true }).length, 1);
  // MUTATION WATCHED: ignore the flag and "no drive can ever photograph this"
  // becomes unfalsifiable — the exact shape of claim this corpus has been wrong
  // about before (93 rows once called structurally out of reach, refuted by probe).
});

test("§7 every excluded lesson carries a reason, not just a name", () => {
  for (const [lesson, why] of NO_SIMULATOR_ROUTE) {
    assert.ok(why && why.length > 20, `${lesson} needs a reason`);
  }
  // MUTATION WATCHED: a bare Set instead of a Map. A skip list without reasons is
  // one that grows by accretion.
});

// -----------------------------------------------------------------------------
// § 4 — FINDINGS DO NOT WRITE `pc-wrong`. THEY WRITE ENGLISH.
//
// §3 assumed a cross-leg row would spell the leg out. Measured 2026-09-11 across
// the 111 open rows, it mostly does not: of the five rows an adversarial verifier
// called "settleable by leg selection alone", FOUR named their second leg only in
// prose and all four returned `legsInProse -> []`. sc-signal-hesitation:440b1f7c
// says "On PC the wrong drive books no mistake either" and its pc-wrong leg went
// unphotographed for two consecutive waves.
//
// THE ASYMMETRY THESE TESTS ENCODE. Under-matching leaves a row open forever and
// indistinguishable from a real defect. Over-matching costs a minute per spurious
// leg of a 90-drive sweep and DILUTES — four legs handed to a judge for a row that
// names one is more to read and more chances to settle on the wrong frame. So
// every §4(a-i) case is a leg the sentence genuinely names, and every §4(j-m) case
// is a mention that must pull nothing.
//
// The fixtures are the corpus's own text, copied from `.audit-frames/findings` at
// e1860cf. They are fixtures, not corpus writes: `findingId` hashes `what`, so
// nothing here may ever be written back into a chunk file.
// -----------------------------------------------------------------------------

const FIVE = {
  // sc-signal-hesitation:440b1f7c — the row this whole section exists for.
  signalHesitation: {
    scenario: "sc-signal-hesitation",
    severity: "major",
    frame: "E:/AI driver/.audit-frames/sweep161/sc-signal-hesitation/mobile-wrong/08-debrief.png",
    what: "On PC the wrong drive books no mistake either — the row says the bare verdict happens on both platforms.",
  },
  // sc-jx-giveway-b1:d7531206 — platform cross, mode stated one clause earlier.
  giveway: {
    scenario: "sc-jx-giveway-b1",
    severity: "critical",
    frame: ["E:", "AI driver", ".audit-frames", "sweep161", "sc-jx-giveway-b1", "pc-right", "08-debrief.png"].join(BS),
    what: "Same lesson, same scripted correct drive: PC ticks 0 of 3 objectives and scores 0, "
      + "mobile ticks 2 of 3 (at 1:55 and 2:47) and scores 3. Whether a student progresses in "
      + "this lesson depends on the device they use.",
  },
  // sc-hz-emergency-stop:9d07cc7c — BOTH axes named: two modes, two platforms.
  emergencyStop: {
    scenario: "sc-hz-emergency-stop",
    severity: "critical",
    frame: ["E:", "AI driver", ".audit-frames", "sweep161", "sc-hz-emergency-stop", "pc-right", "08-debrief.png"].join(BS),
    what: "The careful drive and the reckless drive receive the IDENTICAL verdict and the "
      + "IDENTICAL score: НЕИЗДЪРЖАН, 10 наказателни точки, 1 of 3 stars, on both platforms. "
      + "The grading carries no signal at all — driving well and driving badly are "
      + "indistinguishable in the protocol the student is shown.",
  },
  // sc-vu-cyclist-hook:d867ca4c — "both drives" with no mode word attached.
  cyclistHook: {
    scenario: "sc-vu-cyclist-hook",
    severity: "critical",
    frame: ["E:", "AI driver", ".audit-frames", "sweep161", "sc-vu-cyclist-hook", "mobile-right", "04-t184s.png"].join(BS),
    what: "In both drives the car finishes INSIDE a building: the windscreen is filled edge to "
      + "edge with a flat orange facade, tan window frames and a grey structural column at arm's "
      + "length, with the car stationary at 0 km/h. The collision the debrief books is with "
      + "architecture, not with the cyclist the lesson teaches.",
  },
  // sc-turn-left-oncoming:7974670c — names NO leg. The honest answer is none.
  turnLeft: {
    scenario: "sc-turn-left-oncoming",
    severity: "major",
    frame: ["E:", "AI driver", ".audit-frames", "sweep161", "sc-turn-left-oncoming", "pc-right", "04-t043s.png"].join(BS),
    what: "The skill the briefing names — judging an oncoming gap in seconds — is never exercised.",
  },
};

test("§4(a) 440b1f7c: «On PC the wrong drive» is pc-wrong, and the sweep finally drives it", () => {
  // Two waves of verdict lines on this row said the same thing: the pc half was
  // never photographed. The frame is mobile-wrong; the sentence names PC.
  assert.deepEqual(redriveSet([FIVE.signalHesitation])[0].legs, ["mobile-wrong", "pc-wrong"]);
  // MUTATION WATCHED: drop `wrong` from WRONG_ADJ and this returns ["mobile-wrong"]
  // — the pre-fix behaviour, a row that cannot close no matter how many waves run.
});

test("§4(b) d7531206: two platforms in one sentence, the mode one clause earlier", () => {
  // "Same lesson, same scripted correct drive:" fixes the mode; "PC ticks ...,
  // mobile ticks ..." fixes the platforms. Neither clause carries both, which is
  // why the binding is per SENTENCE and not per clause.
  assert.deepEqual(redriveSet([FIVE.giveway])[0].legs, ["mobile-right", "pc-right"]);
  // MUTATION WATCHED: require a marker phrase — drop the `named.size >= 2` clause,
  // so only «on both platforms» and friends count — and this returns ["pc-right"].
  // The sentence names PC and mobile and carries no marker at all; two platforms
  // compared in one breath IS the cross-platform claim.
});

test("§4(c) 9d07cc7c: two modes AND two platforms named is all four, not two", () => {
  // "The careful drive and the reckless drive ... on both platforms" is a claim
  // about every leg there is. A judge handed one leg cannot settle it.
  assert.deepEqual(
    redriveSet([FIVE.emergencyStop])[0].legs,
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  // MUTATION WATCHED: delete `careful` from the right-mode adjectives and the
  // result collapses to the two wrong legs — the reckless half of the comparison.
  // MUTATION WATCHED: split sentences on /[.;:]/ instead of a terminator followed
  // by a capital, and the colon severs the two modes from the two platforms —
  // ["mobile-right","pc-right","pc-wrong"], the reckless mobile leg lost. THAT is
  // what the sentence-level binding buys, and it is why «steps 1.–6.» in §4(g)
  // must not be read as three sentences.
});

test("§4(d) d867ca4c: «In both drives» is the MODE axis, resolved on the frame's platform", () => {
  // The corpus disambiguates itself. Elsewhere on this same lesson: "neither drive
  // ever performs the right turn across him — the right drive crawls off the road
  // into a building at t184 and the wrong drive does the same at t023". So "both
  // drives" means correct + deliberately wrong, on the platform photographed.
  // Exactly two: nothing in the sentence names a platform, so it must not reach
  // for the pc legs either.
  assert.deepEqual(redriveSet([FIVE.cyclistHook])[0].legs, ["mobile-right", "mobile-wrong"]);
  // MUTATION WATCHED: make MODE_CROSS_RE emit all four and this becomes a 4-drive
  // lesson on a sentence that names one platform-worth of legs.
});

test("§4(e) 7974670c: a row that names NO leg gains none — the matcher does not invent", () => {
  // A verifier filed this as "settleable by leg selection". It is not: the prose
  // names neither a platform nor a mode. Guessing one here is how a row gets
  // photographed on the wrong leg and closed for the wrong reason.
  assert.deepEqual(legsInProse(FIVE.turnLeft.what, { frameLeg: "pc-right", lesson: "sc-turn-left-oncoming" }), []);
  assert.deepEqual(redriveSet([FIVE.turnLeft])[0].legs, ["pc-right"], "the frame's leg, and only it");
  // MUTATION WATCHED: seed `out` with the frameLeg and the first assertion goes red.
});

/* ── §4 the shapes, each one lifted from a real open row ──────────────────── */

test("§4(f) platform + mode bind in either order", () => {
  const at = (what, frameLeg) => legsInProse(what, { frameLeg });
  // sc-ac-truck-spray:7e53374c, real text.
  assert.deepEqual(
    at("At t102 the mobile wrong drive is doing 145 км/ч across open green field.", "mobile-wrong"),
    ["mobile-wrong"],
  );
  // The same claim with the platform trailing.
  assert.deepEqual(at("The wrong drive on mobile books no fault at all.", "pc-right"), ["mobile-wrong"]);
  // sc-ov-keep-right:64391c6a — a mode with no platform takes the FRAME's platform,
  // which is how one leg gets added instead of a guessed two.
  assert.deepEqual(
    at("The wrong drive is convicted only for crashing and never for the keep-right failure "
      + "the lesson exists to teach.", "pc-right"),
    ["pc-wrong"],
  );
  // MUTATION WATCHED: mirror onto BOTH platforms instead of the frame's and the
  // last case returns ["mobile-wrong","pc-wrong"] — one spurious drive per row.
  // MUTATION WATCHED: classify "wrong" as a right-mode adjective and the first case
  // returns ["mobile-right"].
  // MUTATION WATCHED: seed the prose legs with the frame's own leg and the second
  // case returns ["mobile-wrong","pc-right"] — the frame leaking into the reading.
});

test("§4(g) a platform cross with no mode borrows the mode from the frame — one leg, not two", () => {
  // sc-signal-hesitation:f5ffccf3, real text. Two platforms, no marker phrase, and
  // no word at all about which drive.
  assert.deepEqual(
    legsInProse("The same briefing is a blocking modal on mobile and a persistent side panel on PC.",
      { frameLeg: "pc-right" }),
    ["mobile-right", "pc-right"],
  );
  // MUTATION WATCHED: borrow BOTH modes instead of the frame's and this returns all
  // four — two spurious drives on a claim about a briefing screen.
});

test("§4(g2) a marker phrase does the same job, and «steps 1.–6.» is not three sentences", () => {
  // sc-junction-rhr:9b6c83fa, real text. Here the marker is explicit ("on the two
  // platforms") and the sentence is full of full stops that are not terminators.
  assert.deepEqual(
    legsInProse("The briefing renders differently on the two platforms: PC numbers all six steps 1.–6.; "
      + "mobile drops the «1.» and promotes step one to a headline in a different weight and size, "
      + "so the list reads as a heading plus five items.", { frameLeg: "mobile-right" }),
    ["mobile-right", "pc-right"],
  );
  // MUTATION WATCHED: borrow BOTH modes for a platform cross and this returns all
  // four, while §4(g)'s marker-less case stays green — so the two are watched apart.
});

test("§4(h) a PLURAL mode group is that mode on both platforms; a singular one stays home", () => {
  // sc-park-wall:2bf89308 and sc-park-zebra:ca9f7144, real text. "Both right legs"
  // and "The right legs" are two legs by grammar, and the frame is only one of them.
  assert.deepEqual(
    legsInProse("Both right legs collide twice, for 20 наказателни точки.", { frameLeg: "mobile-right" }),
    ["mobile-right", "pc-right"],
  );
  assert.deepEqual(
    legsInProse("The right legs also collide.", { frameLeg: "mobile-right" }),
    ["mobile-right", "pc-right"],
  );
  // Singular stays on the frame's platform. sc-ac-truck-spray:3f5a3ef3, real text.
  assert.deepEqual(
    legsInProse("The wrong leg never passes the truck and never enters the water curtain "
      + "the lesson is named after.", { frameLeg: "pc-wrong" }),
    ["pc-wrong"],
  );
  // MUTATION WATCHED: ignore the plural and the first case collapses to the frame's
  // own leg — "Both right legs collide" photographed on one of them.
  // MUTATION WATCHED: make the signal the word "both" rather than the plural noun,
  // and the SECOND case goes red on its own — "The right legs also collide" has no
  // "both" in it, and two legs is what the grammar says either way.
  // MUTATION WATCHED: mirror a bare mode onto both platforms and the third goes red.
});

test("§4(i) «any of the four legs» is all four, and the count must sit next to a LEG noun", () => {
  // sc-junction-left:2e42b935 and sc-vp-readiness:b3c922d5, real text.
  assert.deepEqual(
    legsInProse("Objective 3 'Завий наляво и излез от кръстовището на запад' never ticks in any of "
      + "the four runs — dash on every debrief. The lesson has no reachable end state.",
      { frameLeg: "pc-right" }),
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  assert.deepEqual(
    legsInProse("Every error class reads 0 in all four lanes.", { frameLeg: "pc-wrong" }),
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  // NEGATIVE CONTROL, and not a hypothetical one: sc-ed-d2-city-run:04f6f4d8 opens
  // "Three of four route tasks never fire". Tasks are not legs. A bare "the four"
  // would turn that sentence into four drives.
  assert.deepEqual(
    legsInProse("Three of the four route tasks never fire.", { frameLeg: "mobile-right" }),
    [],
  );
  // MUTATION WATCHED: relax ALL_FOUR_RE to /of the four/ and the negative control
  // goes red while both positives stay green — which is how it was caught.
  // MUTATION WATCHED: shrink the noun list to "legs" and the first case goes red;
  // drop only "lanes" and the second does. The list is the whole rule.
});

/* ── §4 NEGATIVE CONTROLS — mentions that must pull no drive ──────────────── */

test("§4(j) a leg belonging to ANOTHER lesson is not this lesson's leg", () => {
  // sc-hz-brake-dont-swerve:f0023997 cites a look-alike elsewhere. Real text.
  const elsewhere = "The same failure mode appears in sc-fo-brakelight-chain pc-wrong t047 "
    + "as a flat blue slab.";
  assert.deepEqual(legsInProse(elsewhere, { lesson: "sc-hz-brake-dont-swerve" }), []);
  // Same syntax, opposite answer: sc-ln-obstacle-meeting:114706e0 cites its OWN.
  const itsOwn = "sc-ln-obstacle-meeting/pc-right was driven eight consecutive times against "
    + "commit 641a4475c0ac with an unchanged worktree, no repair between runs, same harness, "
    + "same server: SIX returned НЕИЗДЪРЖАН with exactly 10 наказателни точки and one star.";
  assert.deepEqual(legsInProse(itsOwn, { lesson: "sc-ln-obstacle-meeting" }), ["pc-right"]);
  // With no lesson to compare against, keep it — dropping it would be the
  // under-matching direction, and `redriveSet` always has the lesson.
  assert.deepEqual(legsInProse(elsewhere), ["pc-wrong"]);
  // MUTATION WATCHED: three ways, one per assertion. Drop every qualified leg and
  // the sc-ln-obstacle-meeting case goes red — a row losing the only leg it names.
  // KEEP every qualified leg and the first goes red — a drive spent on a lesson the
  // row is not about. Drop it whenever no lesson was supplied and the third goes red.
});

test("§4(k) a lone platform word with no mode adds nothing", () => {
  // sc-merge-from-property:6715b581, real text. It restates the platform its own
  // frame already proves, so matching it buys no coverage — and a rule that fires
  // on a bare platform word fires on every passing mention of one.
  assert.deepEqual(
    legsInProse("On mobile the teach card is a two-line headline that fades out mid-phrase behind "
      + "a «↓ ОЩЕ N РЕДА» counter, so the body is never shown.", { frameLeg: "mobile-right" }),
    [],
  );
  // MUTATION WATCHED: let a single named platform mirror the frame's mode and this
  // returns a leg — which also turns §3(d)'s "bare mobile" into a second drive.
});

test("§4(l) `right` is a direction far more often than it is a leg", () => {
  // All four are real open-row text. None of them names a drive.
  const noLeg = [
    "grass to the right and the road behind it; the blue guidance line runs off to the left.",
    "the coach calmly says to leave the roundabout with the right indicator.",
    "the cockpit renders no right door mirror in the forward view.",
    "„Дръж дясната лента по булеварда“ shows „–“.",
  ];
  for (const s of noLeg) assert.deepEqual(legsInProse(s, { frameLeg: "pc-right" }), [], s.slice(0, 40));
  // MUTATION WATCHED, one per element, because a loop stops at its first failure.
  // Let the bare adjective count without its noun and element 1 goes red — "grass
  // to the right" would dispatch a drive. Add "indicator" to the mode nouns and
  // element 2 goes red; add "door" and element 3 does. Element 4 needs the whole
  // vocabulary extended to Bulgarian with unicode-aware boundaries: "дясната лента"
  // is the right LANE, which is why `lane` is not a mode noun in any language.
});

test("§4(m) `pc` must be a word, and a leg-shaped token must be one of the four", () => {
  // The trap the task named: `pc` inside a word is not a platform. The frame is
  // mobile-wrong, so a stray `pc` would show up as a whole extra drive.
  assert.deepEqual(
    legsInProse("The upcoming wrong drive is a spec change, not a platform claim.",
      { frameLeg: "mobile-wrong" }),
    ["mobile-wrong"],
    "`pc` inside `upcoming` is not a platform",
  );
  // `desktop-right` is shaped like a leg and is not one. §1 already refuses it as a
  // frame path; it must not sneak in through prose either.
  assert.deepEqual(legsInProse("desktop-right and bare mobile are not legs", { frameLeg: "pc-right" }), []);
  // MUTATION WATCHED: drop the \b from PLATFORM_RE and "upcoming" reads as a pc
  // mention, which with "wrong drive" in the same sentence dispatches pc-wrong.
  // MUTATION WATCHED: stop masking malformed leg tokens and the second goes red —
  // "desktop-right" then counts as a pc mention alongside "mobile", which is a
  // platform cross, which is two drives. §3(d) goes red with it.
});

test("§4(n) `desktop` and `phone` are the same two platforms under other names", () => {
  // Neither appears in the 111 open rows; both are how a human writes it, so they
  // are mapped now rather than after another row has sat open for two waves.
  assert.deepEqual(legsInProse("On desktop the wrong drive books nothing.", {}), ["pc-wrong"]);
  assert.deepEqual(legsInProse("On the phone the wrong drive books nothing.", {}), ["mobile-wrong"]);
  // MUTATION WATCHED: remove every synonym from PLATFORM_WORD and the first goes
  // red; remove only the mobile ones, leaving "desktop", and the second does.
});

test("§4(o) THE EMPTY GUARD survives the richer matcher", () => {
  // §3(b) proved prose could not populate an empty list back when prose meant a
  // literal. Now prose reads English, so the guard is re-tested against the
  // strongest signal there is: a sentence naming two platforms and both modes.
  const rows = [{
    scenario: "sc-frameless",
    severity: "critical",
    frame: "no/leg/in/this/path.png",
    what: "The careful drive and the reckless drive receive the IDENTICAL verdict on both platforms.",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, [], "[] still means drive all four — never a subset of it");
  // MUTATION WATCHED: drop the `frameLegs.size ?` guard and this returns all four.
  // Harmless here by coincidence; on a one-platform row it turns 4 drives into 1,
  // which is why §3(b) keeps the one-leg version of the same assertion.
});

test("§4(p) the union still only grows: every frame leg survives the new prose reading", () => {
  // The cross-lesson filter in §4(j) is the one rule that can REMOVE a leg the old
  // substring matcher would have added. It must never remove one the FRAME proves.
  const rows = [{
    scenario: "sc-hz-brake-dont-swerve",
    severity: "major",
    frame: ".audit-frames/sweep161/sc-hz-brake-dont-swerve/pc-wrong/04-t028s.png",
    what: "The same failure mode appears in sc-fo-brakelight-chain pc-wrong t047 as a flat blue slab.",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, ["pc-wrong"], "the prose cites another lesson; the frame is still proof");
  // MUTATION WATCHED: read the prose legs INSTEAD of unioning them with the frame's
  // — now that prose reads English the union looks redundant — and this row returns
  // [], which downstream means "drive all four" for a lesson that named one leg.
});

// -----------------------------------------------------------------------------
// § 5 — THE TWO-WAY NOUNS PULL OPPOSITE WAYS, AND A NEGATIVE UNIVERSAL IS AN
//       ALL-FOUR CLAIM.
//
// §4 landed the English reading and got one rule INVERTED. It put `legs?` beside
// `drives?` in MODE_CROSS_RE, on the reasonable-sounding assumption that a leg is
// a drive and a drive is a mode. Measured 2026-09-11 by reading every sentence in
// all 1,511 filed rows that uses a two-way quantifier with a leg noun: in THIS
// corpus `drive`/`run`/`lane` are the MODE words and `leg` is the PLATFORM word.
// Four rows disambiguate themselves and all four say platform — sc-speed-dangerous
// ("pc-right and mobile-right both return НЕИЗДЪРЖАН ... The two legs agree"),
// sc-hz-emergency-stop, sc-ac-night-lights, sc-follow-tailgater. None says mode.
//
// AND FOUR OPEN ROWS WERE UNPROVABLE FOR A DIFFERENT REASON — nothing read a
// universal. "no leg has completed it", "never ticks in any leg", "no drive has
// completed the roundabout" are claims about every leg there is, and a judge
// handed one leg cannot settle any of them. Two are CRITICAL and each is its
// lesson's ONLY open row, so the sweep drove one leg of a lesson whose single
// complaint is that no leg works.
//
// MEASURED OVER THE LIVE OPEN LIST (111 rows, 64 lessons): 134 drives -> 143,
// four lessons changed, ZERO lessons lost a leg. The three that gain three legs
// each were being driven on the one leg their screenshot came from.
// -----------------------------------------------------------------------------

/* ── §5 the universal: "no leg", "any leg", "every run" ───────────────────── */

test("§5(a) 49af2940: «no leg has completed it» is all four — CRITICAL, its lesson's only row", () => {
  // Real text and real frame. Before this rule the sweep drove pc-wrong alone:
  // one leg of a lesson whose entire complaint is that no leg works.
  const rows = [{
    scenario: "sc-park-bay-exit-rev",
    severity: "critical",
    frame: ["E:", "AI driver", ".audit-frames", "sweep161", "sc-park-bay-exit-rev", "pc-wrong", "08-debrief.png"].join(BS),
    what: "This lesson has never once been observed WORKING — no leg has completed it successfully.",
  }];
  assert.deepEqual(
    redriveSet(rows)[0].legs,
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  // MUTATION WATCHED: drop `legs?` from UNIVERSAL_LEG_RE and this returns
  // ["pc-wrong"] — the pre-fix behaviour, and a row that cannot close however
  // many waves run, because the one leg photographed can never prove "no leg".
});

test("§5(b) 5ee56710: «in any leg» and «no drive» each carry it alone", () => {
  // sc-rb-busy-gap, real text — the row states the universal twice, over two
  // different nouns, which is why both nouns are in the rule.
  const all = ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"];
  assert.deepEqual(
    legsInProse("Leaving at the second exit never ticks in any leg — no drive has completed "
      + "the roundabout the lesson is named after.", { frameLeg: "mobile-right" }),
    all,
  );
  // `drives?` alone, on real text from sc-ln-decisive-change. Without the
  // universal this sentence is a platform cross and stops at two legs.
  assert.deepEqual(
    legsInProse("THE HARNESS HAS NEVER STEERED, ON EITHER PLATFORM, IN ANY DRIVE THIS AUDIT "
      + "HAS EVER TAKEN.", { frameLeg: "pc-right" }),
    all,
  );
  // `runs?` alone, on real text from sc-ed-poligon-chain. Without it: no leg at all.
  assert.deepEqual(
    legsInProse("The first objective is therefore unreachable, which is why every run scores 0/5.",
      { frameLeg: "pc-right" }),
    all,
  );
  // `each`, on real text from sc-crossing-bus-shadow.
  assert.deepEqual(
    legsInProse("Each leg writes exactly one 08-debrief frame, a viewport shot, and the card is "
      + "longer than the viewport.", { frameLeg: "pc-wrong" }),
    all,
  );
  // MUTATION WATCHED, one per assertion, because a failing assert stops the test.
  // Drop `drives?` from UNIVERSAL_LEG_RE and assertion 2 returns
  // ["mobile-right","pc-right"] — the platform cross only. Drop `runs?` and
  // assertion 3 returns []. Drop `each` from the quantifiers and 4 returns [].
});

test("§5(c) d9fd3821: a universal in the LAST paragraph of a long row still counts", () => {
  // sc-sp-wet-limit-plate, real text, final paragraph of a 1,700-character row —
  // and the row's only sentence about legs. CRITICAL, its lesson's only open row,
  // driven on pc-wrong alone for every sweep so far.
  assert.deepEqual(
    legsInProse("SEPARATELY AND STILL OPEN: no leg of levels 3-5 has ever been driven, so whether "
      + "the WET rungs grade correctly is unmeasured. One L3-L5 drive settles it.",
      { frameLeg: "pc-wrong" }),
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  // MUTATION WATCHED: refuse a universal whose noun is followed by a preposition
  // — `(?:legs?|drives?|runs?)\b(?!\s+of\b)` — and this goes red ALONE, while
  // §5(a)'s "no leg has completed" and §5(b)'s four stay green. "no leg OF LEVELS
  // 3-5" puts a qualifier between the noun and its verb, which is exactly how it
  // was missed by eye.
});

/* ── §5 «both legs» is the PLATFORM axis, not the mode axis ───────────────── */

test("§5(d) «the two legs» / «Both legs» cross PLATFORMS on the frame's mode", () => {
  // sc-speed-dangerous, real text. The sentence before it names both legs
  // outright — "pc-right and mobile-right both return НЕИЗДЪРЖАН" — so this one
  // is not ambiguous in the corpus, only in isolation.
  assert.deepEqual(
    legsInProse("The two legs agree to the point, the score and the fault class, so this is "
      + "deterministic and not a timing accident.", { frameLeg: "pc-right" }),
    ["mobile-right", "pc-right"],
  );
  // sc-hz-emergency-stop, real text. Its own previous sentence: "Both re-driven
  // legs peaked at 16 км/ч (pc-right) and 19 км/ч (mobile-right)".
  assert.deepEqual(
    legsInProse("Yet «✓ Спри преди детето — с пълна спирачка, в лентата» ticked and BOTH legs "
      + "read ИЗДЪРЖАН · 3 т. · ★★☆.", { frameLeg: "pc-right" }),
    ["mobile-right", "pc-right"],
  );
  // sc-ac-night-lights, real text. Same: "the STEERED pc-right leg ... and the
  // unsteered mobile-right leg ... the same place to within half a metre".
  assert.deepEqual(
    legsInProse("Both legs finish НЕЗАВЪРШЕН with «Мини контролната зона осветен» and «Стигни "
      + "края на отсечката» still open.", { frameLeg: "mobile-right" }),
    ["mobile-right", "pc-right"],
  );
  // MUTATION WATCHED: put `legs?` back into MODE_CROSS_RE, as it was before this
  // section, and all three return the frame's platform crossed by mode —
  // ["pc-right","pc-wrong"] for the first two. The lesson gets driven on the one
  // platform the claim is explicitly comparing ACROSS.
});

test("§5(e) `lanes?` stays the MODE axis — the inversion is `legs?` alone", () => {
  // sc-vp-handbrake, real text, and the sentence that settles `lane` for the whole
  // corpus: it contrasts a lane WITH a platform in one breath, so a lane is not one.
  // sc-signal-response's open row uses the same vocabulary — "the mistake lane".
  assert.deepEqual(
    legsInProse("No handbrake lamp is rendered on the cluster in any frame, on either platform, "
      + "in either lane.", { frameLeg: "mobile-right" }),
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  // MUTATION WATCHED: drop `lanes?` from MODE_CROSS_RE — it LOOKS like road paint,
  // and thirteen times in fourteen elsewhere it is — and this returns
  // ["mobile-right","pc-right"]: the platform half counted twice and the wrong
  // lane, the one the finding is about, never driven.
  //
  // AND A MUTATION THAT DOES **NOT** GO RED HERE, recorded because it was tried:
  // MOVING `lanes?` onto the leg rule instead of deleting it leaves this green —
  // the sentence opens with "No", so `negatedLegPair` promotes it to all four and
  // the wrong axis is masked by the right answer. A negated fixture cannot watch a
  // two-way mutation, and every «both/the two + lane» sentence in the corpus is
  // negated, so there is nowhere to put the un-negated one. That is a known hole,
  // not a covered case.
  //
  // `drives?` needs no fixture here — §4(d) is it. Drop `drives?` from
  // MODE_CROSS_RE and «In both drives» collapses to the frame's own leg.
  // `runs?` HAS NO CLEAN CORPUS WITNESS and is deliberately left unpinned: of the
  // two «both/the two + run» sentences in 1,511 rows, one is ambiguous
  // (sc-park-van, "All three rubric rows read 'не се измерва' on BOTH runs") and
  // one is not a run at all (sc-ac-wind-truck-pass, "both run.logs"). Writing an
  // assertion for it would pin a guess, and the first draft of this test did
  // exactly that — it asserted a sentence that names both modes outright, so the
  // mutation it claimed to watch SURVIVED.

  // That sentence is kept, because it is what it really tests: a row naming both
  // modes in words needs no two-way rule. sc-ed-poligon-chain:dceba965, real text.
  assert.deepEqual(
    legsInProse("The wrong run is convicted of three speeding faults at 49-50 км/ч while the "
      + "identical 0/5 objective record earns the careful run nothing — the two drives differ "
      + "only in penalties, never in credit.", { frameLeg: "mobile-wrong" }),
    ["mobile-right", "mobile-wrong"],
  );
  // MUTATION WATCHED: classify `careful` as a wrong-mode adjective and this returns
  // ["mobile-wrong"] — the careful run and the wrong run are the two being compared.
});

test("§5(f) a negation makes a two-way leg universal ONLY when it scopes it", () => {
  // sc-park-45-rev:24ccb58b, real text, CRITICAL and its lesson's only open row.
  // "never ... either leg" is "on no leg". The same lesson's closed row says it
  // the unambiguous way: "Neither of the two route tasks ticks in any leg".
  assert.deepEqual(
    legsInProse("Задача 2, the reverse into the bay itself, never ticks on either leg, so the "
      + "45-degree reverse-park lesson cannot be completed.", { frameLeg: "mobile-right" }),
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  // And the control that makes the position rule falsifiable rather than decorative:
  // sc-speed-dangerous's "The two legs agree ... and NOT a timing accident" carries a
  // negation too. It sits AFTER the quantifier and negates the accident, not the legs.
  assert.deepEqual(
    legsInProse("The two legs agree to the point, the score and the fault class, so this is "
      + "deterministic and not a timing accident.", { frameLeg: "pc-right" }),
    ["mobile-right", "pc-right"],
  );
  // MUTATION WATCHED: test the WHOLE sentence for a negation instead of the text
  // before the quantifier, and the second assertion returns all four — two
  // spurious drives bought by a clause about timing.
  // MUTATION WATCHED: drop the `neither` self-negation branch and «Neither leg
  // completed the manoeuvre» stops being universal; asserted below.
  assert.deepEqual(
    legsInProse("Neither leg completed the manoeuvre.", { frameLeg: "pc-right" }),
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
});

/* ── §5 negative controls — the over-matches this rule must NOT make ──────── */

test("§5(g) «no lane markings» is road paint, not a universal over legs", () => {
  // Thirteen of the fourteen corpus sentences matching «no|any|every|each + lane»
  // are markings, signs or arrows. All three below are real open-row text.
  const at = (what) => legsInProse(what, { frameLeg: "pc-right" });
  assert.deepEqual(at("The junction has no lane markings at all."), []);
  assert.deepEqual(
    at("Across the whole pc-right sequence (t001s→t161s) the carriageway keeps its width — no "
      + "taper, no chevrons, no lane-ends sign, no merge arrow on the tarmac."),
    ["pc-right"],
    "the literal in the prose, and nothing the road paint added",
  );
  assert.deepEqual(at("There are no lane arrows on the approach."), []);
  // MUTATION WATCHED, one per assertion: add `lanes?` to UNIVERSAL_LEG_RE — the
  // obvious tidy-up, since `lanes?` IS in MODE_CROSS_RE and in ALL_FOUR_RE — and
  // every one of these dispatches four drives for a sentence about paint.
});

test("§5(h) a mode adjective is still required before `driver`", () => {
  // sc-sp-wet-limit-plate, real text: the audit's own prose about a road surface.
  assert.deepEqual(
    legsInProse("convicting a dry-road driver under a wet-road rule is the exact fault this "
      + "audit exists to catch.", { frameLeg: "pc-wrong" }),
    [],
  );
  // And the row `drivers?` was added for. sc-fo-motorway-gap:d18105c7, real text,
  // CRITICAL and its lesson's ONLY open row: both modes named, prose returned []
  // for two waves because the sentence says WHO drove, not WHAT was driven.
  const rows = [{
    scenario: "sc-fo-motorway-gap",
    severity: "critical",
    frame: ["E:", "AI driver", ".audit-frames", "sweep161", "sc-fo-motorway-gap", "mobile-right", "08-debrief.png"].join(BS),
    what: "«the reckless driver gets the route credit the careful driver is denied» — the "
      + "objective tracks something other than driving well.",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, ["mobile-right", "mobile-wrong"]);
  // MUTATION WATCHED: remove `drivers?` from MODE_NOUN and the second returns
  // ["mobile-right"] — the frame's own leg, the reckless half never photographed.
  // MUTATION WATCHED: let a bare `driver` count without its mode adjective and the
  // first returns two legs on a sentence about a dry road.
});

test("§5(i) THE EMPTY GUARD survives a universal, which is the strongest signal there is", () => {
  // §3(b) tested it against a literal and §4(o) against two platforms and two
  // modes. A universal beats both: it asserts all four outright. An all-frameless
  // lesson must STILL emit [], because [] means "drive all four" downstream and a
  // populated list of four is indistinguishable — until someone narrows the rule.
  const rows = [{
    scenario: "sc-frameless",
    severity: "critical",
    frame: "no/leg/in/this/path.png",
    what: "This lesson has never once been observed WORKING — no leg has completed it successfully.",
  }];
  assert.deepEqual(redriveSet(rows)[0].legs, []);
  // MUTATION WATCHED: drop the `frameLegs.size ?` guard and this returns all four.
  // Harmless on this row by coincidence; §3(b) keeps the one-leg version, where
  // the same mutation turns 4 drives into 1.
});

test("§5(j) «both debriefs» is genuinely mixed, so it crosses BOTH axes", () => {
  // ONE row each way in 1,511, which is why this is a union and not a reading:
  //   sc-vp-telltale     "The same wrong drive ... 10 on mobile and 20 on PC ...
  //                       both debriefs quote the identical rule"   -> PLATFORM
  //   sc-vu-cyclist-hook "neither drive ever performs the right turn ... Nothing
  //                       in either debrief cites a cyclist code"   -> MODE
  // When the sentence states the mode, the stated mode wins and nothing inflates.
  assert.deepEqual(
    legsInProse("The same wrong drive is scored 10 penalty points on mobile and 20 on PC, even "
      + "though both debriefs quote the identical collision rule and the identical 10-point "
      + "tariff.", { frameLeg: "mobile-wrong" }),
    ["mobile-wrong", "pc-wrong"],
  );
  // When it does not, four drives beat guessing the wrong two. Zero open rows are
  // affected today; the direction is what is being fixed.
  assert.deepEqual(
    legsInProse("Nothing in either debrief cites a cyclist code; the two dangerous errors are "
      + "the collision and its follow-on.", { frameLeg: "mobile-right" }),
    ["mobile-right", "mobile-wrong", "pc-right", "pc-wrong"],
  );
  // MUTATION WATCHED: drop AMBIGUOUS_CROSS_RE and the second returns [] — the row
  // driven on whichever leg its screenshot came from. Leave `debriefs?` in
  // MODE_CROSS_RE instead and it returns the two mobile legs, which is the reading
  // sc-vp-telltale refutes.
});
