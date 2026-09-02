// -----------------------------------------------------------------------------
// hazard.test.mjs — A HARNESS THAT BRAKES BETTER MUST NOT GRADE EASIER.
//
//   node --test tools/mobile/lib/__tests__/hazard.test.mjs
//   (discovered automatically by platform/scripts/tools-tests.mjs, which walks
//   the repo and claims every file importing from "node:test")
//
// WHAT WAS BUILT. The drive loop could brake and could not brake FOR anything:
// six `brake()` call sites, one speed cap, one blind 15-metre rest cadence, one
// careless-leg cadence, three releases. Its only world input was `lawfulWait`,
// which `finish.ts` publishes exclusively to a car that has ALREADY stopped —
// so it could extend a stop and never start one. `hazard.mjs` gives it two real
// inputs: the scan-graded approach chip and the lead-vehicle gap badge, both
// production DOM the student is looking at.
//
// WHY THIS TEST IS MOSTLY ABOUT THE THING NOT HAPPENING. The dangerous version
// of this change is not one that brakes badly — it is one that brakes KINDLY,
// and quietly turns a failing product into a passing report. Every zero-defects
// result in this project's history was an instrument bug, and every one of them
// lied in the reassuring direction. So the property under test is not "it stops
// for hazards"; it is:
//
//   ┌──────────────────────────────────────────────────────────────────────┐
//   │ THE NEUTRAL COMMAND IS THE OLD DRIVE, AND EVERY DEGRADED PATH        │
//   │ RETURNS IT. No instrument, malformed payload, thrown evaluate,       │
//   │ missing field, cooling overrun — all of them fold to the identity on  │
//   │ both fold points, so a build that publishes nothing gets the          │
//   │ pre-change metronome tick for tick, and books the faults it always    │
//   │ booked. The ONLY thing that can change a drive is the product         │
//   │ publishing an instrument.                                            │
//   └──────────────────────────────────────────────────────────────────────┘
//
// THE FOUR DIRECTIONS THIS COULD FAIL IN, one block each below:
//
//   BLIND MUST NOT READ AS CLEAR. The reassuring direction here is "nothing was
//   armed", and it is one `?.` away at all times. A null payload, a non-object,
//   a missing `ok`, a non-array `glance`, a badge with no aria-label — each is
//   pinned as blind-or-hazard, never as quiet.
//
//   A KIND HARNESS IS A BROKEN HARNESS. Blind must not brake either: braking on
//   blind frames is the choice that FEELS safe and breaks the guarantee, because
//   it makes a chipless build drive more gently than the baseline.
//
//   IT MUST NOT WIN BY STANDING STILL. A car that never moves books no
//   collision. The hold ceiling and its cooldown are pinned, including that a
//   suppressed hazard is still COUNTED — a deliberately ignored hazard is data,
//   not silence.
//
//   THE AUDIT SURFACE IS THE SENTENCE. `hazardLine` and the four `state` words
//   are the only way anyone can check this loop, so their words are pinned —
//   especially "idle", which must never be readable as "the road was clear".
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  BLIND_SUSPECT_FRAC,
  countHazardEpisode,
  createHazardBooks,
  finishHazardBooks,
  FOLLOW_HARD_METRES,
  GLANCE_NO_LABEL,
  HAZARD_APPROACH_KMH,
  HAZARD_HOLD_MAX_MS,
  HAZARD_NOTE,
  hazardCommand,
  hazardLine,
  hazardPaceProvenance,
  hazardPaceRow,
  NEUTRAL,
  observeHazardTick,
  parseHazard,
} from "../hazard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HAZARD_MJS = join(HERE, "..", "hazard.mjs");
const LESSON_AUDIT_MJS = join(HERE, "..", "..", "lesson-audit.mjs");
/** LF, always. The worktree is CRLF-free today and a source-pinned test that
 *  quietly depends on that is a test that fails for the wrong reason later. */
const sourceOf = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** The product's real copy, byte for byte off `GlanceEdgePings.tsx:258-261`. */
const PING_LEFT = "Погледни наляво преди кръстовището";
const PING_RIGHT = "Погледни надясно преди кръстовището";
const PING_DONE_LEFT = "Погледна наляво";
/** …and off `followGap.ts:239-245`. U+00B7 separators, decimal COMMA. */
const FOLLOW_INFO = "Дистанция · 24 м · 4,1 с";
const FOLLOW_SHORT = "Дистанция · 9 м · 1,4 с · нужни 2,0 с";
const FOLLOW_METRES_ONLY = "Дистанция · 3 м";

const clear = () => parseHazard({ ok: true, glance: [], follow: null });

/**
 * THE FOLD, exactly as `lesson-audit.mjs`'s roll phase writes it. Duplicated
 * here on purpose: the safety argument is a claim about these two expressions,
 * so the test has to evaluate them rather than trust a sentence about them.
 */
const foldTarget = (paced, cmd) => Math.min(paced, cmd.capKmh ?? Number.POSITIVE_INFINITY);
const foldBrake = (cmd, oldTest) => cmd.brake || oldTest;
/** The THIRD fold point, and the one easiest to forget: the roll phase releases
 *  the throttle whenever the hazard brake is down, because holding both pedals
 *  is not braking. `!false && X === X`, so it is an identity at neutral too. */
const foldThrottle = (cmd, oldTest) => !cmd.brake && oldTest;

// =============================================================================
// THE LOAD-BEARING PROPERTY: DEGRADATION RUNS TOWARD THE OLD DRIVE
// =============================================================================

test("every degraded reading returns the neutral command — the pre-change drive", () => {
  // Each of these is a way the world, the page, or the product can fail. NONE
  // of them may produce braking, and none may produce a speed cap: that is what
  // makes a chipless build drive exactly as it drove before this module.
  const degraded = [
    ["a null payload", null],
    ["a non-object payload", "nope"],
    ["an array payload", []],
    ["a payload with no ok field", { glance: [], follow: null }],
    ["ok:false with a reason", { ok: false, why: "the hazard chips threw: x is not a function" }],
    ["ok:false with no reason", { ok: false }],
    ["a non-array glance list", { ok: true, glance: "Погледни наляво", follow: null }],
    ["a non-string follow label", { ok: true, glance: [], follow: 17 }],
    ["a clean read with nothing armed", { ok: true, glance: [], follow: null }],
    ["a clean read with only a SATISFIED ping", { ok: true, glance: [PING_DONE_LEFT], follow: null }],
    ["a clean read with a comfortable lead gap", { ok: true, glance: [], follow: FOLLOW_INFO }],
  ];

  for (const [what, raw] of degraded) {
    const cmd = hazardCommand(parseHazard(raw), { kmh: 12 });
    assert.equal(cmd.brake, false, `${what} must not brake`);
    assert.equal(cmd.capKmh, null, `${what} must not cap the approach`);
    // …and therefore both folds are the identity, which is the actual claim.
    assert.equal(foldTarget(12, cmd), 12, `${what} must leave the pace target alone`);
    assert.equal(foldBrake(cmd, false), false, `${what} must leave the old brake test alone`);
    assert.equal(foldBrake(cmd, true), true, `${what} must not suppress the old speed cap either`);
    assert.equal(foldThrottle(cmd, true), true, `${what} must leave the old throttle test alone`);
    assert.equal(foldThrottle(cmd, false), false, `${what} must not invent throttle either`);
  }
});

test("the throttle is released whenever the hazard brake is down", () => {
  // Both pedals at once is not braking. This is the one fold that is NOT an
  // identity when a hazard IS seen, and it must bite in exactly that case.
  const braking = hazardCommand(parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT }), { kmh: 12 });
  assert.equal(foldThrottle(braking, true), false, "a hazard brake must cut the throttle");
  // …while the approach CAP leaves the throttle to the pace law, since a cap is
  // a target and the car still has to reach it.
  const capping = hazardCommand(parseHazard({ ok: true, glance: [PING_LEFT], follow: null }), { kmh: 2 });
  assert.equal(foldThrottle(capping, true), true);
});

test("a cooling overrun is neutral too — the give-up path cannot brake", () => {
  const reading = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT });
  const cmd = hazardCommand(reading, { kmh: 12, cooling: true });
  assert.equal(cmd.brake, false);
  assert.equal(cmd.capKmh, null);
  // …but it is NOT silent. The hazard was seen and deliberately ignored, and
  // the books must be able to say so.
  assert.equal(cmd.suppressed, true);
  assert.equal(cmd.cls, "follow-gap");
  assert.match(cmd.reason, /SUPPRESSED/);
});

test("the neutral command is frozen — a caller cannot re-arm braking for everyone", () => {
  // `hazardCommand` returns the shared NEUTRAL identity on the clear path. If a
  // consumer could mutate it, one careless assignment would turn every future
  // "nothing armed" tick into a brake, silently, for the rest of the drive.
  assert.equal(Object.isFrozen(NEUTRAL), true);
  const cmd = hazardCommand(clear(), { kmh: 12 });
  assert.throws(() => {
    "use strict";
    cmd.brake = true;
  });
  assert.equal(hazardCommand(clear(), { kmh: 12 }).brake, false);
});

// =============================================================================
// BLIND IS NOT CLEAR
// =============================================================================

test("an unusable payload is BLIND and says which kind, never quietly clear", () => {
  assert.equal(parseHazard(null).ok, false);
  assert.match(parseHazard(null).why, /no object at all/);
  assert.match(parseHazard({ ok: true, glance: "x", follow: null }).why, /non-array/);
  assert.match(parseHazard({ ok: true, glance: [], follow: 5 }).why, /non-string/);
  assert.match(parseHazard({ ok: false, why: "evaluate rejected" }).why, /evaluate rejected/);
  // An ok:false with no reason still gets a reason rather than an empty string,
  // because `blindWhy` is keyed on it and an empty key hides the whole class.
  assert.notEqual(parseHazard({ ok: false }).why.trim(), "");

  for (const raw of [null, "nope", { ok: false }, { ok: true, glance: 1, follow: null }]) {
    const cmd = hazardCommand(parseHazard(raw), { kmh: 12 });
    assert.equal(cmd.blind, true, "an unusable reading must be recorded as blind");
    assert.notEqual(cmd.reason, null, "…and blindness must always carry its reason");
  }
});

test("a clean read that sees nothing is NOT blind — the two must stay distinguishable", () => {
  const cmd = hazardCommand(clear(), { kmh: 12 });
  assert.equal(cmd.blind, false);
  assert.equal(cmd.reason, null);
});

test("a follow-gap badge with no readable label is a hazard, not an absent badge", () => {
  // This is the exact reassuring-direction trap: the driver returns a marker
  // string rather than "" so the badge cannot be parsed away into "no lead car".
  const reading = parseHazard({ ok: true, glance: [], follow: "(badge on the glass, no aria-label)" });
  assert.equal(reading.follow.present, true);
  assert.equal(reading.follow.parsed, false);
  const cmd = hazardCommand(reading, { kmh: 12 });
  assert.equal(cmd.brake, true, "an unreadable badge means a car ahead of unknown distance — brake");
  assert.match(cmd.reason, /no longer parses/);
});

test("copy drift shows up as a parse failure, not as a return to the metronome", () => {
  // If the product renames its badge copy, this module must get LOUDER, not
  // quieter. A silent fallback here would re-open the whole defect invisibly.
  const reading = parseHazard({ ok: true, glance: [], follow: "Distance 9 m" });
  assert.equal(reading.follow.parsed, false);
  assert.equal(hazardCommand(reading, { kmh: 12 }).brake, true);
});

test("an unrecognised glance chip counts as armed rather than as absent", () => {
  const reading = parseHazard({ ok: true, glance: ["Нещо ново"], follow: null });
  assert.equal(reading.glance.unparsed, 1);
  assert.equal(reading.glance.armed, true);
  // …but an unknown chip is not a PENDING one, so it must not invent a cap.
  assert.equal(reading.glance.pending, false);
  assert.equal(hazardCommand(reading, { kmh: 12 }).capKmh, null);
});

// =============================================================================
// READING THE PRODUCT'S ACTUAL COPY
// =============================================================================

test("«Погледни» pends and «Погледна» is done — one letter apart, opposite meanings", () => {
  const pending = parseHazard({ ok: true, glance: [PING_LEFT], follow: null });
  assert.equal(pending.glance.pending, true);
  assert.equal(pending.glance.pendingLeft, true);
  assert.equal(pending.glance.pendingRight, false);

  const done = parseHazard({ ok: true, glance: [PING_DONE_LEFT], follow: null });
  assert.equal(done.glance.pending, false, "a SATISFIED glance must not hold the approach cap on");
  assert.equal(done.glance.done, 1);
  assert.equal(done.glance.armed, true, "…but the line is still ahead, so the approach is still armed");

  const both = parseHazard({ ok: true, glance: [PING_LEFT, PING_RIGHT], follow: null });
  assert.equal(both.glance.pendingLeft && both.glance.pendingRight, true);
  assert.match(hazardCommand(both, { kmh: 12 }).reason, /left and right/);
});

test("the follow badge parses its middle dots and its decimal comma", () => {
  const info = parseHazard({ ok: true, glance: [], follow: FOLLOW_INFO }).follow;
  assert.deepEqual(
    { meters: info.meters, heldSec: info.heldSec, needSec: info.needSec, short: info.short },
    { meters: 24, heldSec: 4.1, needSec: null, short: false },
  );

  const short = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT }).follow;
  assert.deepEqual(
    { meters: short.meters, heldSec: short.heldSec, needSec: short.needSec, short: short.short },
    { meters: 9, heldSec: 1.4, needSec: 2, short: true },
  );

  // No «нужни» clause = the product's own level is `info` = the gap clears the
  // grader's bar. The module must not overrule the product's judgement.
  assert.equal(hazardCommand(parseHazard({ ok: true, glance: [], follow: FOLLOW_INFO }), { kmh: 12 }).brake, false);
});

test("«нужни» is the product's own verdict and is braked for", () => {
  const cmd = hazardCommand(parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT }), { kmh: 12 });
  assert.equal(cmd.brake, true);
  assert.equal(cmd.cls, "follow-gap");
  assert.match(cmd.reason, /lead gap 9 m/);
});

test("a short gap with NO graded level still brakes below the metre floor", () => {
  // `followGap.ts` mutes its own level under `followMinSpeedKmh`, so a crawling
  // car closing on a stopped one gets metres and no colour. Three metres is
  // inside this car's stopping distance once the ~2 s actuation latency is paid.
  const near = parseHazard({ ok: true, glance: [], follow: FOLLOW_METRES_ONLY });
  assert.equal(near.follow.short, false, "the PRODUCT did not call it short…");
  assert.equal(hazardCommand(near, { kmh: 6 }).brake, true, "…but 3 m is inside the floor");

  const far = parseHazard({ ok: true, glance: [], follow: `Дистанция · ${FOLLOW_HARD_METRES + 5} м` });
  assert.equal(hazardCommand(far, { kmh: 6 }).brake, false);
});

test("the approach chip caps speed and does not stop the car", () => {
  const cmd = hazardCommand(parseHazard({ ok: true, glance: [PING_LEFT], follow: null }), { kmh: 12 });
  assert.equal(cmd.brake, false, "a cap is not a stop — the module cannot see where the line is");
  assert.equal(cmd.capKmh, HAZARD_APPROACH_KMH);
  assert.equal(cmd.cls, "glance-approach");
  // The fold must actually bite on a 12 км/ч cruise and must never RAISE it.
  assert.equal(foldTarget(12, cmd), HAZARD_APPROACH_KMH);
  assert.equal(foldTarget(3, cmd), 3, "a cap must never speed the car up");
});

test("a lead vehicle outranks the approach cap — metres from contact beats a speed limit", () => {
  const both = parseHazard({ ok: true, glance: [PING_LEFT], follow: FOLLOW_SHORT });
  const cmd = hazardCommand(both, { kmh: 12 });
  assert.equal(cmd.brake, true);
  assert.equal(cmd.cls, "follow-gap");
});

// =============================================================================
// IT CANNOT WIN BY STANDING STILL
// =============================================================================

test("a hazard hold gives up at its ceiling and says so", () => {
  const reading = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT });
  assert.equal(hazardCommand(reading, { kmh: 0, holdMs: HAZARD_HOLD_MAX_MS - 1 }).brake, true);

  const over = hazardCommand(reading, { kmh: 0, holdMs: HAZARD_HOLD_MAX_MS });
  assert.equal(over.overrun, true);
  assert.equal(over.brake, false, "at the ceiling the car MUST roll on — a clean sheet bought by inaction is not one");
  assert.match(over.reason, /rolling on/);
});

test("the ceiling is not reachable by accident from a missing holdMs", () => {
  const reading = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT });
  for (const ctx of [{ kmh: 0 }, { kmh: 0, holdMs: undefined }, { kmh: 0, holdMs: -5 }, { kmh: 0, holdMs: NaN }]) {
    const cmd = hazardCommand(reading, ctx);
    assert.equal(cmd.overrun, false);
    assert.equal(cmd.brake, true);
  }
});

// =============================================================================
// THE BOOKS, AND THE SENTENCE THAT IS THE AUDIT SURFACE
// =============================================================================

test("episodes count on the rising edge — a held brake is one act, not twenty", () => {
  const books = createHazardBooks(true, "right");
  const reading = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT });
  let prev = null;
  for (let i = 0; i < 20; i++) {
    const cmd = hazardCommand(reading, { kmh: 5, holdMs: i * 100 });
    observeHazardTick(books, reading, cmd, 100);
    const acting = cmd.brake || cmd.capKmh !== null;
    if (acting && prev !== cmd.cls) countHazardEpisode(books, cmd.cls, "brake");
    prev = acting ? cmd.cls : null;
  }
  assert.equal(books.brakeEpisodes, 1, "twenty ticks of one hold is one brake");
  assert.equal(books.brakeMs, 2000);
  assert.equal(books.seen.followShort, 20, "…but every tick is still SEEN");
});

test("a suppressed hazard is still counted — ignored is not the same as absent", () => {
  const books = createHazardBooks(true, "right");
  const reading = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT });
  const cmd = hazardCommand(reading, { kmh: 5, cooling: true });
  observeHazardTick(books, reading, cmd, 100);
  assert.equal(books.suppressed, 1);
  assert.equal(books.seen.followShort, 1);
  assert.equal(books.brakeMs, 0);
});

test("blind ticks are tallied by reason and never counted as sightings", () => {
  const books = createHazardBooks(true, "right");
  const raw = { ok: false, why: "the hazard chips threw: null is not an object" };
  for (let i = 0; i < 3; i++) {
    const reading = parseHazard(raw);
    observeHazardTick(books, reading, hazardCommand(reading, { kmh: 5 }), 100);
  }
  assert.equal(books.blind, 3);
  assert.equal(books.reads, 3);
  assert.equal(books.seen.glanceArmed, 0);
  assert.equal(books.seen.followPresent, 0);
  assert.equal(Object.values(books.blindWhy)[0], 3);
});

test("the four states, and «idle» must never read as «the road was clear»", () => {
  // OFF — the wrong leg, deliberately not run.
  const off = finishHazardBooks(createHazardBooks(false, "wrong"));
  assert.equal(off.state, "off");
  assert.match(off.why, /grader fires/);

  // BLIND — over the bar, and unquotable by its own words.
  const blind = createHazardBooks(true, "right");
  const bad = parseHazard(null);
  for (let i = 0; i < 10; i++) {
    observeHazardTick(blind, bad, hazardCommand(bad, { kmh: 5 }), 100);
  }
  finishHazardBooks(blind);
  assert.equal(blind.state, "blind");
  assert.match(blind.why, /NOTHING ON THIS LANE'S HAZARD LINE MAY BE QUOTED/);

  // …and the bar is a real bar: just under it is not blind.
  const nearly = createHazardBooks(true, "right");
  const good = clear();
  const total = 100;
  const blindTicks = Math.floor(BLIND_SUSPECT_FRAC * total) - 1;
  for (let i = 0; i < total; i++) {
    const r = i < blindTicks ? bad : good;
    observeHazardTick(nearly, r, hazardCommand(r, { kmh: 5 }), 100);
  }
  finishHazardBooks(nearly);
  assert.notEqual(nearly.state, "blind");

  // LIVE — it acted.
  const live = createHazardBooks(true, "right");
  const short = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT });
  observeHazardTick(live, short, hazardCommand(short, { kmh: 5 }), 100);
  countHazardEpisode(live, "follow-gap", "brake");
  finishHazardBooks(live);
  assert.equal(live.state, "live");

  // IDLE — read fine, nothing ever armed. THE DANGEROUS ONE.
  const idle = createHazardBooks(true, "right");
  for (let i = 0; i < 10; i++) observeHazardTick(idle, good, hazardCommand(good, { kmh: 5 }), 100);
  finishHazardBooks(idle);
  assert.equal(idle.state, "idle");
  assert.match(idle.why, /NEITHER CHIP WAS EVER ARMED/);
  assert.match(idle.why, /signal, a pedestrian or a static obstacle/);
});

test("a drive that never took a reading is blind, not idle", () => {
  const none = finishHazardBooks(createHazardBooks(true, "right"));
  assert.equal(none.state, "blind");
  assert.match(none.why, /never took a hazard reading at all/);
});

test("the run.log line carries what it braked for, how long, and how blind it was", () => {
  const books = createHazardBooks(true, "right");
  const short = parseHazard({ ok: true, glance: [], follow: FOLLOW_SHORT });
  const ping = parseHazard({ ok: true, glance: [PING_LEFT], follow: null });
  const bad = parseHazard(null);
  for (let i = 0; i < 10; i++) observeHazardTick(books, short, hazardCommand(short, { kmh: 5 }), 1000);
  countHazardEpisode(books, "follow-gap", "brake");
  for (let i = 0; i < 4; i++) observeHazardTick(books, ping, hazardCommand(ping, { kmh: 12 }), 1000);
  countHazardEpisode(books, "glance-approach", "cap");
  observeHazardTick(books, bad, hazardCommand(bad, { kmh: 12 }), 1000);
  finishHazardBooks(books);

  const line = hazardLine(books);
  assert.match(line, /HAZARD: LIVE/);
  assert.match(line, /1 brake\(s\) for a reason \(10s\)/, "how many times it braked, and for how long");
  assert.match(line, /1 approach cap\(s\) \(4s\)/);
  assert.match(line, /blind on 1\/15 ticks/, "how long it was blind");
  assert.match(line, /follow-gap ×1\/10s/, "…and for WHAT");
  assert.match(line, /glance-approach ×1\/4s/);
});

test("the permanent blindness is stated on every lane, whatever happened", () => {
  // The `steering.note` precedent. A green HAZARD line on a red-light lesson
  // means this loop cannot see a red light — not that the car handled one.
  for (const books of [
    finishHazardBooks(createHazardBooks(false, "wrong")),
    finishHazardBooks(createHazardBooks(true, "right")),
  ]) {
    assert.equal(books.note, HAZARD_NOTE);
  }
  assert.match(HAZARD_NOTE, /PERMANENTLY BLIND TO TRAFFIC SIGNALS, TO PEDESTRIANS AND TO STATIC OBSTACLES/);
  assert.match(HAZARD_NOTE, /runtime\.signalPhase reaches no HUD component/);
  assert.match(HAZARD_NOTE, /NO FINDING ABOUT STOPPING FOR A RED, A PEDESTRIAN OR AN OBSTACLE MAY BE DRAWN/);
});

test("the wrong leg's books stay empty and say why", () => {
  const books = finishHazardBooks(createHazardBooks(false, "wrong"));
  assert.equal(books.active, false);
  assert.equal(books.brakeEpisodes, 0);
  assert.equal(books.state, "off");
  assert.match(books.why, /"right" leg only/);
});

// =============================================================================
// THE THREE HOLES AN ADVERSARIAL PASS FOUND, AND THE MUTATION THAT PROVES EACH
//
// All three failed in the same direction — the reassuring one — and two of them
// were SILENT, which is the property that makes a defect survive a review. Each
// block below therefore does two things: it pins the fixed behaviour, and it
// RUNS THE REVERTED CODE and watches it produce the wrong answer. A test that
// only asserts the fix cannot tell you whether the fix is what makes it pass.
// =============================================================================

/* ── FAILURE 1: A CHIP ON THE GLASS WAS SILENTLY DELETED ───────────────────
 *
 * The collector in `lesson-audit.mjs` pushed only non-empty labels, so a
 * `[data-hud="glance-ping"]` element whose `aria-label` was missing or empty
 * left NOTHING behind: no marker, no `unparsed`, no `ok:false`. `parseHazard`
 * computed `armed:false, pending:false` from the empty array and the command
 * fell to NEUTRAL — the chip was on the glass and the books recorded a clean
 * sighting of an empty road.
 *
 * The collector lives inside a `page.evaluate` closure and cannot be imported,
 * so it is LIFTED OUT OF THE SOURCE FILE and run against a fake document. That
 * is what makes the mutation real: revert `lesson-audit.mjs` and this test is
 * running the reverted collector, not a copy of the old one.
 */
function glanceCollector(source) {
  const from = source.indexOf("const glance = [];");
  const to = source.indexOf("let follow = null;", from);
  assert.ok(from > 0 && to > from, "the glance collector block was not found in lesson-audit.mjs");
  const block = source.slice(from, to);
  return { block, run: new Function("document", "hazGlanceSel", "hazGlanceMark", `${block}\nreturn glance;`) };
}
/** A document holding one `[data-hud="glance-ping"]` per label given. `null` is
 *  what `getAttribute` returns for an attribute that is not there. */
const fakeGlassWith = (labels) => ({
  querySelectorAll: () => labels.map((v) => ({ getAttribute: () => v })),
});
const GLANCE_SEL = '[data-hud="glance-ping"]';

test("FAILURE 1 — a glance chip with no aria-label survives as a marker, not as silence", () => {
  const { run } = glanceCollector(sourceOf(LESSON_AUDIT_MJS));
  // Three unreadable chips and one real one. Every one of the four was on the
  // glass and every one of the four must come back.
  const glance = run(fakeGlassWith([null, "", "   ", PING_DONE_LEFT]), GLANCE_SEL, GLANCE_NO_LABEL);
  assert.equal(glance.length, 4, "four chips were on the glass, so four entries must come back");
  assert.equal(glance.filter((v) => v === GLANCE_NO_LABEL).length, 3);

  const reading = parseHazard({ ok: true, glance, follow: null });
  assert.equal(reading.ok, true, "the probe worked — this is not blindness, it is an unreadable chip");
  assert.equal(reading.glance.unparsed, 3, "each unreadable chip is COUNTED");
  assert.equal(reading.glance.armed, true, "…and a chip on the glass means an approach is inside 45 m");
  assert.equal(reading.glance.firstUnparsed, GLANCE_NO_LABEL, "…and the log can name what it could not read");
});

test("FAILURE 1 — an unreadable chip arms the books but never brakes and never caps", () => {
  // The whole tension of this module in one test. It must not read as clear
  // (the books say a chip was up) and it must not act (an unreadable chip is
  // not a PENDING one, and a harness that got more cautious when it went blind
  // would be a harness that passes a product for breaking its instruments).
  const reading = parseHazard({ ok: true, glance: [GLANCE_NO_LABEL], follow: null });
  const cmd = hazardCommand(reading, { kmh: 12 });
  assert.deepEqual(
    { brake: cmd.brake, capKmh: cmd.capKmh, blind: cmd.blind },
    { brake: false, capKmh: null, blind: false },
    "an unreadable chip changes NOTHING about the drive",
  );
  assert.equal(foldTarget(12, cmd), 12, "…so the pace target is untouched");
  assert.equal(foldBrake(cmd, false), false);

  const books = createHazardBooks(true, "right");
  observeHazardTick(books, reading, cmd, 100);
  assert.equal(books.seen.glanceUnparsed, 1, "…but the tick is on the books under its own column");
  assert.equal(books.seen.glanceArmed, 1);
  assert.match(hazardLine(books), /1 UNREADABLE — a chip was on the glass/, "…and on the run.log line");
});

test("FAILURE 1 — «idle» stops claiming NEITHER CHIP WAS EVER ARMED once one was", () => {
  // The state word is the audit surface, so it may not carry a sentence that is
  // false. A drive that saw an unreadable chip and never acted is idle — and
  // „nothing was there" is exactly what it must NOT say.
  const books = createHazardBooks(true, "right");
  const reading = parseHazard({ ok: true, glance: [GLANCE_NO_LABEL], follow: null });
  for (let i = 0; i < 5; i++) observeHazardTick(books, reading, hazardCommand(reading, { kmh: 12 }), 100);
  finishHazardBooks(books);
  assert.equal(books.state, "idle");
  assert.doesNotMatch(books.why, /NEITHER CHIP WAS EVER ARMED/);
  assert.match(books.why, /5 UNREADABLE/);
  assert.match(books.why, /not „the road was clear/);
});

test("MUTATION 1 — the reverted collector deletes the chip and books an empty road", () => {
  const { block, run } = glanceCollector(sourceOf(LESSON_AUDIT_MJS));
  // Comments are stripped first, so the paragraph explaining the defect cannot
  // satisfy a rule about the defect — the trap `scripts/tools-tests.mjs`
  // documents and `exit-integrity.test.mjs` already keeps.
  const stripped = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(stripped, /glance\.push\(\s*typeof l === "string"/, "the push must be UNCONDITIONAL");
  assert.doesNotMatch(stripped, /if\s*\([^)]*\)\s*glance\.push/, "a conditional push is what deleted the chip");
  assert.match(stripped, /hazGlanceMark/, "…and the marker must be the else-branch");

  // …and now the reverted code itself, so none of the above is a claim about a
  // regular expression.
  const reverted = new Function(
    "document",
    "hazGlanceSel",
    "hazGlanceMark",
    `const glance = [];
     for (const el of document.querySelectorAll(hazGlanceSel)) {
       const l = el.getAttribute("aria-label");
       if (typeof l === "string" && l.trim() !== "") glance.push(l.trim());
     }
     return glance;`,
  );
  const glass = fakeGlassWith([null]);
  assert.deepEqual(reverted(glass, GLANCE_SEL, GLANCE_NO_LABEL), [], "the reverted collector drops the chip…");

  const before = parseHazard({ ok: true, glance: reverted(glass, GLANCE_SEL, GLANCE_NO_LABEL), follow: null });
  assert.equal(before.glance.armed, false, "…and the reading then says nothing was armed…");
  assert.equal(before.glance.unparsed, 0, "…with no counter to give it away…");
  assert.equal(hazardCommand(before, { kmh: 12 }).blind, false, "…and it is not even blind. THAT is the defect.");

  // The shipped collector, on the same glass, does not do that. If
  // `lesson-audit.mjs` is reverted, THIS is the line that goes red.
  const after = parseHazard({ ok: true, glance: run(glass, GLANCE_SEL, GLANCE_NO_LABEL), follow: null });
  assert.equal(after.glance.armed, true, "the shipped collector keeps the chip");
  assert.equal(after.glance.unparsed, 1);
});

/* ── FAILURE 2: AN EMPTY FOLLOW LABEL READ AS „NO LEAD CAR" ────────────────
 *
 * An empty-or-whitespace `raw.follow` matched neither the „is a non-empty
 * string" branch nor the „is not a string" guard, so it fell through with
 * `follow = null` — and `null` is this module's word for „there is no lead
 * car". The docstring above it advertised strictness and listed `null`, a
 * non-object and a missing `ok`; the empty string was the hole in that list.
 */
test("FAILURE 2 — an empty follow label is BLIND, never «no lead car»", () => {
  for (const empty of ["", "   ", "\t\n "]) {
    const reading = parseHazard({ ok: true, glance: [], follow: empty });
    assert.equal(reading.ok, false, `${JSON.stringify(empty)} must not be accepted as a clean read`);
    assert.equal(reading.follow, null, "…and it must not leave a half-built follow object behind");
    assert.match(reading.why, /empty string/);
    assert.match(reading.why, /a badge with no copy is not an absent badge/);

    // BLIND IS RECORDED AND BLIND DOES NOT BRAKE — both halves, because either
    // one alone is a different bug.
    const cmd = hazardCommand(reading, { kmh: 12 });
    assert.equal(cmd.blind, true);
    assert.equal(cmd.brake, false, "blind must never brake");
    assert.equal(cmd.capKmh, null);
    assert.equal(foldTarget(12, cmd), 12, "…so the drive is the pre-change one, tick for tick");

    const books = createHazardBooks(true, "right");
    observeHazardTick(books, reading, cmd, 100);
    assert.equal(books.blind, 1, "…and the tick is counted under its own reason");
    assert.equal(books.seen.followPresent, 0);
    assert.equal(Object.keys(books.blindWhy)[0], cmd.reason);
  }
});

test("FAILURE 2 — an ABSENT badge is still the one shape that means no lead car", () => {
  // The fix must not swing the other way: `null`/`undefined` is the product's
  // own „no vehicle reported ⇒ no badge", and turning that into blindness would
  // declare every empty road unreadable and blind out every lane.
  for (const absent of [null, undefined]) {
    const reading = parseHazard({ ok: true, glance: [], follow: absent });
    assert.equal(reading.ok, true);
    assert.equal(reading.follow, null);
    assert.equal(hazardCommand(reading, { kmh: 12 }).blind, false);
  }
});

test("MUTATION 2 — reverting the guard reads a badge with no copy as an empty road", async () => {
  const src = sourceOf(HAZARD_MJS);
  // TWO EDITS, because the hole was a shape and not a missing line: the empty
  // string matched NEITHER the „non-empty string" branch NOR the „not a
  // string" guard, and fell out of the bottom. So the revert puts the
  // `trim() !== ""` back on the parse branch and takes the explicit guard out.
  const guard = 'if (typeof rawFollow === "string" && rawFollow.trim() === "") {';
  const parseBranch = 'if (typeof rawFollow === "string") {';
  assert.ok(src.includes(guard), "the empty-string guard must exist to be reverted");
  assert.ok(src.includes(parseBranch), "the parse branch must be the unqualified string test");
  const reverted = src
    .replace(guard, "if (false) {")
    .replace(parseBranch, 'if (typeof rawFollow === "string" && rawFollow.trim() !== "") {');
  const dir = mkdtempSync(join(tmpdir(), "hazard-mutation-"));
  try {
    const file = join(dir, "hazard-reverted.mjs");
    writeFileSync(file, reverted, "utf8");
    const old = await import(pathToFileURL(file).href);

    const before = old.parseHazard({ ok: true, glance: [], follow: "" });
    assert.equal(before.ok, true, "the reverted parser calls it a clean read…");
    assert.equal(before.follow, null, "…with follow:null, which MEANS «no lead car»…");
    const cmd = old.hazardCommand(before, { kmh: 12 });
    assert.equal(cmd.blind, false, "…and records nothing at all. THAT is the defect.");
    assert.equal(cmd.brake, false);

    // The shipped parser, same input. If the guard is removed from
    // `hazard.mjs`, THIS is the line that goes red.
    assert.equal(parseHazard({ ok: true, glance: [], follow: "" }).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── FAILURE 3: THE HAZARD CAP CORRUPTED `pace.targets` ────────────────────
 *
 * `pace` is published as „the authored shadow's speed-by-distance profile" and
 * the drive report instructs verifiers IN WRITING to read «Непропускане на
 * пешеходец» against `pace.targets` in `_audit-status.json` before filing it
 * against the product. The roll phase then pushed `min(paced, hz.capKmh)` into
 * that array under the same field name, so a 6 км/ч row invented by
 * HAZARD_APPROACH_KMH became indistinguishable from a 6 км/ч row the authored
 * tape asked for. The surface a verifier is SENT TO had two authors and one
 * name.
 */
test("FAILURE 3 — a hazard-capped row and an authored row are distinguishable", () => {
  const capped = hazardPaceRow(null, { tSec: 30, odoM: 210, pacedKmh: 34, capKmh: HAZARD_APPROACH_KMH });
  const authored = hazardPaceRow(null, { tSec: 30, odoM: 210, pacedKmh: HAZARD_APPROACH_KMH, capKmh: null });
  // Both were 6 км/ч on the wire. That was the whole problem.
  assert.equal(capped.kmh, HAZARD_APPROACH_KMH);
  assert.equal(authored.kmh, HAZARD_APPROACH_KMH);
  assert.notDeepEqual(capped, authored, "…and they must no longer be the same row");

  assert.deepEqual(
    { kmh: capped.kmh, pacedKmh: capped.pacedKmh, hazardCapKmh: capped.hazardCapKmh, src: capped.src },
    { kmh: 6, pacedKmh: 34, hazardCapKmh: 6, src: "hazard-cap" },
    "the harness's caution says whose it is, and what the tape had asked for",
  );
  assert.deepEqual(
    { kmh: authored.kmh, pacedKmh: authored.pacedKmh, hazardCapKmh: authored.hazardCapKmh, src: authored.src },
    { kmh: 6, pacedKmh: 6, hazardCapKmh: null, src: "pace" },
    "…and the authored row is not tarred with it either",
  );
});

test("FAILURE 3 — with no cap in force the row is the pre-change value exactly", () => {
  // The identity again, on the third fold point. A neutral command must leave
  // `pace.targets` reading precisely what `Math.round(Math.min(paced, Infinity))`
  // always wrote there.
  for (const paced of [0, 6, 11.6, 12, 47.4, 118]) {
    const cmd = hazardCommand(clear(), { kmh: paced });
    const row = hazardPaceRow(null, { tSec: 1, odoM: 2, pacedKmh: paced, capKmh: cmd.capKmh });
    assert.equal(row.kmh, Math.round(Math.min(paced, Number.POSITIVE_INFINITY)), `paced ${paced}`);
    assert.equal(row.hazardCapKmh, null);
    assert.equal(row.src, "pace");
  }
});

test("FAILURE 3 — a cap that did not bite is not credited with the row", () => {
  // A 6 км/ч cap over a 4 км/ч pace target changed nothing, and marking that
  // row "hazard-cap" would be the same false attribution pointing the other
  // way: a reader would discount a slow stretch the tape actually authored.
  const row = hazardPaceRow(null, { tSec: 4, odoM: 9, pacedKmh: 4, capKmh: HAZARD_APPROACH_KMH });
  assert.equal(row.kmh, 4);
  assert.equal(row.hazardCapKmh, null);
  assert.equal(row.src, "pace");
});

test("FAILURE 3 — the dedupe key includes the provenance, not just the number", () => {
  const first = hazardPaceRow(null, { tSec: 0, odoM: 0, pacedKmh: 6, capKmh: null });
  assert.notEqual(first, null);
  // Same target, same everything: no new row, exactly as before.
  assert.equal(hazardPaceRow(first, { tSec: 1, odoM: 12, pacedKmh: 6, capKmh: null }), null);
  // Same COMMANDED target (6), different author. This must produce a row or the
  // ambiguity is back, just one tick later.
  const capped = hazardPaceRow(first, { tSec: 2, odoM: 24, pacedKmh: 34, capKmh: 6 });
  assert.notEqual(capped, null, "a change of author is a change worth a row");
  assert.equal(capped.kmh, 6);
  assert.equal(capped.src, "hazard-cap");
  assert.equal(hazardPaceRow(capped, { tSec: 3, odoM: 36, pacedKmh: 34, capKmh: 6 }), null, "…but only once");
});

test("FAILURE 3 — the report says which rows the hazard loop lowered, in words", () => {
  // The array is in a JSON file; the sentence is in the report. A provenance a
  // reader has to go and find is a provenance most readers will not find.
  const rows = [
    hazardPaceRow(null, { tSec: 0, odoM: 0, pacedKmh: 34, capKmh: null }),
    hazardPaceRow(null, { tSec: 9, odoM: 60, pacedKmh: 34, capKmh: HAZARD_APPROACH_KMH }),
  ];
  const said = hazardPaceProvenance(rows);
  assert.match(said, /1 of 2 target row\(s\) were LOWERED BY THE HAZARD LOOP to 6 км\/ч/);
  assert.match(said, /src:"hazard-cap"/);
  assert.match(said, /must be read against pacedKmh/, "…and it names the field a verifier is to read");

  const untouched = hazardPaceProvenance([rows[0]]);
  assert.match(untouched, /the hazard loop lowered none of them/);
  assert.match(untouched, /kmh IS the pace law's target/);
  // …and a lane whose roll phase never ran must not read as „nothing was
  // capped": it read as nothing at all.
  assert.match(hazardPaceProvenance([]), /no target row was recorded at all/);
  assert.match(hazardPaceProvenance(null), /no target row was recorded at all/);
});

test("FAILURE 3 — a malformed pace target is dropped, never written as 0 км/ч", () => {
  // `Math.round(NaN)` is NaN and JSON.stringify writes it as `null`; a row of
  // `{kmh:null}` in the array a verifier is sent to is worse than no row.
  for (const bad of [undefined, null, NaN, "fast", {}]) {
    assert.equal(hazardPaceRow(null, { tSec: 1, odoM: 1, pacedKmh: bad, capKmh: null }), null, String(bad));
  }
  assert.equal(hazardPaceRow(null, null), null);
});

/* ── THE FOURTH HOLE, FOUND WHILE CLOSING THE FIRST THREE ──────────────────
 *
 * The probe's `page.evaluate` takes ONE argument object and destructures it in
 * the closure's parameter list. The first cut of the hazard channel added
 * `hazGlanceSel` and `hazFollowSel` to the object and did NOT add them to the
 * pattern, so in the browser the collector ran against an undeclared name:
 *
 *     ReferenceError: hazGlanceSel is not defined
 *
 * The field's own try/catch turned that into `{ok:false, why:"the hazard chips
 * threw: …"}` on EVERY tick of EVERY lane. The instrument was 100% blind and
 * printed a tidy line saying so, the drive degraded to the pre-change
 * metronome exactly as the module promises — and nothing anywhere went red.
 * A capability that is switched off by a typo and announces it only in prose
 * is a capability nobody will notice is off.
 *
 * So the wiring itself is pinned: every key handed in is a name in scope.
 */
test("WIRING — every argument handed to the probe's evaluate is destructured in it", () => {
  const src = sourceOf(LESSON_AUDIT_MJS);
  const sig = src.match(/\n\s*\(\{([^}]*)\}\) => \{\n\s*const sp = document\.querySelector/);
  assert.ok(sig, "the probe's evaluate closure was not found — its shape has changed");
  const declared = new Set(sig[1].split(",").map((s) => s.trim()).filter(Boolean));

  // The argument object is the one that closes THIS `.evaluate(` call, found by
  // walking on from the signature rather than by a second free-floating match —
  // `lesson-audit.mjs` holds a dozen other evaluates and the first version of
  // this test happily parsed one of them.
  const rest = src.slice(src.indexOf(sig[0]));
  const open = rest.indexOf("\n      },\n      {\n");
  const close = rest.indexOf("\n      },\n    )", open);
  assert.ok(open > 0 && close > open, "the probe's evaluate argument object was not found");
  const passed = new Set(
    rest
      .slice(open + "\n      },\n      {\n".length, close)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//"))
      .map((l) => l.split(":")[0].trim()),
  );

  assert.ok(passed.size >= 8, `only ${passed.size} argument(s) parsed — the parse, not the code, is wrong`);
  for (const key of passed) {
    assert.ok(declared.has(key), `«${key}» is handed to the page and never destructured — it throws in the browser`);
  }
  for (const name of declared) {
    assert.ok(passed.has(name), `«${name}» is destructured and never handed in — it is undefined in the browser`);
  }
  // …and the three the hazard channel needs, by name, so a rename cannot pass
  // this test by deleting both halves.
  for (const key of ["hazGlanceSel", "hazFollowSel", "hazGlanceMark"]) {
    assert.ok(declared.has(key) && passed.has(key), `${key} must be both handed in and destructured`);
  }
});

test("WIRING — the collector runs without throwing once its arguments are in scope", () => {
  // The proof that the pattern above is the thing that matters: the very same
  // block, given its names, returns a marker instead of a ReferenceError.
  const { run } = glanceCollector(sourceOf(LESSON_AUDIT_MJS));
  assert.deepEqual(run(fakeGlassWith([null]), GLANCE_SEL, GLANCE_NO_LABEL), [GLANCE_NO_LABEL]);
  // …and with the marker argument MISSING — the shape a future arg-object drift
  // would produce — the chip is STILL not deleted. It arrives as `undefined`,
  // CDP serialises that to `null`, and `parseHazard`'s non-string branch counts
  // it. Degradation toward loud, never toward silence.
  const noMarker = run(fakeGlassWith([null]), GLANCE_SEL, undefined);
  assert.equal(noMarker.length, 1);
  const reading = parseHazard({ ok: true, glance: JSON.parse(JSON.stringify(noMarker)), follow: null });
  assert.equal(reading.glance.unparsed, 1);
  assert.equal(reading.glance.armed, true);
});
