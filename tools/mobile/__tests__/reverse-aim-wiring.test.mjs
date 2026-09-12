/**
 * reverse-aim-wiring.test.mjs — THE REVERSE WHEEL IS ACTUALLY CONNECTED.
 *
 * Run: node --test tools/mobile/__tests__/reverse-aim-wiring.test.mjs
 * (collected automatically by platform/scripts/tools-tests.mjs.)
 *
 * ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════
 *
 * Written alongside the capability, because the neighbouring round shipped one
 * without it and a verifier had to come back and say so — see the header of
 * `guidance-wiring.test.mjs`, which is this file's model.
 *
 * `__tests__/reverse-plan.test.mjs` is 36 assertions on `lib/reverse-plan.mjs`.
 * EVERY ONE OF THEM PASSES WITH THE CONTROLLER DELETED FROM THE DRIVE PATH,
 * because none of them knows the drive path exists. Delete one line —
 * `await timed("aim", () => steer(cmd.steer, p.kmh, "reverse"))` — and the
 * harness silently reverts to reversing in a straight line while publishing a
 * `reverseAim` block that says a path was planned. That is the precise costume
 * this programme keeps paying for: a straight-line drive wearing a steered
 * one's clothes.
 *
 * The other half of this file is about BLAME. The reverse aim's whole reason
 * for existing is that eleven critical rows read «the product cannot be
 * parked» off drives that could not steer. The sentences that stop that
 * happening again are load-bearing, so they are pinned here verbatim enough
 * that softening one fails a gate.
 *
 * These assertions are about WIRING and about DISCLOSURE. Whether the car
 * parks well is a question for a drive; whether the instrument that answers it
 * is connected, and whether it names the right culprit when it is not, are
 * questions for a gate — and a gate is the only one of the two that runs on
 * every commit.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, "..", "lesson-audit.mjs"), "utf8");
const LIB = readFileSync(resolve(HERE, "..", "lib", "reverse-plan.mjs"), "utf8");

describe("§A the reverse controller is connected to the drive path", () => {
  it("imports the pure law from the lib rather than re-implementing it here", () => {
    // Same architecture as guidance.mjs and hazard.mjs: pure law in the lib,
    // page side in the drive. MUTATION WATCHED: drop the import -> red.
    assert.match(SRC, /from "\.\/lib\/reverse-plan\.mjs"/);
    assert.match(SRC, /\breverseCommand\b/);
  });

  it("CALLS reverseCommand from the reverse phase, not merely defines it", () => {
    // A definition on its own is what a deleted call site leaves behind.
    // MUTATION WATCHED: delete the `const cmd = reverseCommand({...})` call ->
    // red.
    assert.match(SRC, /const cmd = reverseCommand\(\{/);
    // …and it is fed the live pose and the live bearing, not a constant.
    assert.match(SRC, /pose,\s*\n\s*bearingRad: aimBearingRad,/);
  });

  it("actually turns the wheel with the command it computed", () => {
    // THE ONE-LINE DELETION THIS FILE EXISTS FOR.
    // MUTATION WATCHED: remove this call -> every reverse leg is a straight
    // line again and nothing else in the repository notices. Red.
    assert.match(SRC, /steer\(cmd\.steer, p\.kmh, "reverse"\)/);
  });

  it("reads the pose every tick instead of remembering one", () => {
    // MUTATION WATCHED: hoist `aimPose()` out of the loop -> red. „I read it
    // once" is the belief the whole reverse block was written to kill.
    assert.match(SRC, /const pose = await timed\("aim", aimPose\);/);
    assert.match(SRC, /aimObserve\(pose\);/);
  });

  it("opens a leg at BOTH reverse-phase entries and closes it at BOTH exits", () => {
    // There are two ways into the phase (the arm that worked, and the late R
    // the shutter caught) and two ways out (losing R, and the budget). A leg
    // opened on one path and not the other would aim along the previous
    // manoeuvre's path.
    // MUTATION WATCHED: delete either call -> red.
    assert.equal((SRC.match(/aimEnterLeg\(\);/g) ?? []).length, 2, "aimEnterLeg must be called at both entries");
    assert.equal((SRC.match(/await aimLeaveLeg\(\);/g) ?? []).length, 2, "aimLeaveLeg must be called at both exits");
  });

  it("lets go of the wheel when the leg ends", () => {
    // A steer key still down after the reverse phase steers the FORWARD drive
    // that follows it, with the ribbon loop unaware.
    // MUTATION WATCHED: drop the release from aimLeaveLeg -> red.
    assert.match(SRC, /await steer\(null, null, "reverse"\)\.catch/);
  });
});

describe("§B the reverse wheel keeps its own books", () => {
  it("has a third counter set, separate from the trace's and the liveness check's", () => {
    // `steering.commands` / `everSteered` are read downstream as „the RIBBON
    // loop steered this drive". Banking reverse-park wheel work there would
    // let a lane whose forward guidance saw nothing report itself as steered.
    // MUTATION WATCHED: route "reverse" into the trace books -> red.
    assert.match(SRC, /reverse: \{\s*\n\s*commands: 0,\s*\n\s*heldMs: \{ left: 0, right: 0 \},/);
    assert.match(SRC, /\} else if \(by === "reverse"\) \{\s*\n\s*steering\.reverse\.commands \+= 1;/);
    assert.match(SRC, /steerHeldBy === "reverse" \? steering\.reverse\.heldMs/);
  });

  it("introduces NO new keyboard key — the wheel in R is the wheel in D", () => {
    // THE CENSUS QUESTION, ASKED BEFORE IT IS ASKED OF US.
    // `platform/src/modules/sim/engine/__tests__/reverseAssist-audit-harness.test.ts`
    // pins the harness's key census and exists to stop keys being added
    // casually. This capability adds none: reverse steering actuates through
    // `STEER_KEYS`, already in that census, and the route into R is still the
    // deliberate assist gesture and nothing else.
    // MUTATION WATCHED: actuate the reverse wheel through a fresh key -> red.
    const reversePhase = SRC.slice(SRC.indexOf('} else if (phase === "reverse") {'));
    assert.ok(reversePhase.length > 500, "the reverse phase was not found");
    const body = reversePhase.slice(0, reversePhase.indexOf("\n    }"));
    assert.doesNotMatch(body, /keyboard\.(?:down|up|press)\(/, "the reverse phase must actuate through steer()/sChannel()/throttle(), not raw keys");
    // …and the pure law names no key whatsoever. It returns "left"/"right";
    // which key that is stays the drive path's business, in `STEER_KEYS`.
    // NOTE, so nobody re-derives it from this test: `lesson-audit.mjs` DOES
    // already contain BracketLeft/BracketRight/KeyZ — that is the manual
    // clutch-and-gear sequence added on 2026-08-29 (`engageManualGear`), a
    // different capability with its own N-only gate. This one adds nothing.
    // Comments stripped first: the lib's header CITES `KeyA` when it records
    // the measurement, and a test that cannot tell prose from code would
    // either fail on documentation or be deleted for being noisy.
    const libCode = LIB.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(libCode, /Key[A-Z]|Bracket|keyboard/, "the pure law must not know about keys");
    // Positive control: the stripper left the code behind.
    assert.match(libCode, /export function steerForBearingError/);
  });
});

describe("§C the plan is gated the way the pace tape is gated", () => {
  it("refuses to aim a `wrong` leg with the correct drive's path", () => {
    // `loadPaceTape`'s own rule, and for its stated reason: a wrong leg's
    // convictions are earned flat out, and a wrong leg that reversed neatly
    // into the bay would void every verdict ever taken from one.
    // MUTATION WATCHED: drop the MODE gate -> red.
    assert.match(SRC, /if \(MODE !== "right"\) \{\s*\n\s*reverseAim\.why =/);
  });

  it("reads the lesson's own authored shadow, by the path the pace tape already uses", () => {
    // MUTATION WATCHED: point it at a different file -> red. A second tape
    // reader with its own path is how two halves of one drive end up
    // following two different demonstrations.
    assert.match(SRC, /const reversePlan = \(\(\) => \{[\s\S]*?PACE_TAPE_PATH/);
    assert.match(SRC, /buildReversePlan\(doc\)/);
  });
});

describe("§D the disclosure — the half that decides who gets blamed", () => {
  it("prints the aim line whenever reverse was demanded, aimed or not", () => {
    // PRINTED EITHER WAY. „This lesson never needed to reverse" and „it needed
    // to and the instrument could not" must not be the same silence — that
    // conflation is the entire history of these eleven rows.
    // MUTATION WATCHED: guard the line on `reverseAim.planned` -> red.
    assert.match(SRC, /if \(reverse\.demanded\) \{[\s\S]{0,400}?reverseSteerLine\(\{/);
  });

  it("publishes the aim book in the status file", () => {
    // The artefact a re-drive and a judge actually read.
    // MUTATION WATCHED: drop `reverseAim,` from the payload -> red.
    assert.match(SRC, /\n  reverseAim,\n/);
  });

  it("keeps ONE home for the wheel-command count, so the file cannot contradict itself", () => {
    // MEASURED on the first real drive: `reverseAim` carried an
    // never-incremented `commands: 0` while `steering.reverse.commands` read
    // 2 — a status file disagreeing with itself, in the reassuring direction,
    // about whether the wheel moved at all.
    // MUTATION WATCHED: re-add `commands: 0,` to the reverseAim book -> red.
    const book = SRC.match(/const reverseAim = \{[\s\S]*?\n\};/);
    assert.ok(book, "the reverseAim book is gone");
    const bookCode = book[0].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(bookCode, /blindTicks: 0,/, "positive control: the stripper left the code");
    assert.doesNotMatch(bookCode, /\bcommands\b/, "the wheel-command count lives in steering.reverse and nowhere else");
    // …and the line a judge reads is fed from that one home.
    assert.match(SRC, /commands: steering\.reverse\.commands,/);
  });

  it("carries all four facts on one line: demanded, armed, ticks in R, credited", () => {
    // Separately they are four places to stop reading.
    // MUTATION WATCHED: remove any of the four -> red.
    const m = SRC.match(/`REVERSE OUTCOME: demanded [\s\S]*?credited`}`;/);
    assert.ok(m, "the REVERSE OUTCOME line is gone");
    const line = m[0];
    for (const fact of ["demanded ", "armed ", "tick(s) in R", "aimed ", "credited"]) {
      assert.ok(line.includes(fact), `the outcome line no longer states «${fact}»`);
    }
  });

  it("takes 'how far there was left to run' from the TICK, not from the exit", () => {
    // MEASURED THE HARD WAY on the first real drive (sc-park-wall, mobile,
    // 2026-09-12): the leg exited by a route where the last pose was no
    // longer to hand, and the outcome line printed «stopped ? m short of the
    // end» — blanking the one number that says whose failure it was, on the
    // one line written to prevent exactly that confusion.
    // MUTATION WATCHED: move the assignment back into aimLeaveLeg -> red.
    assert.match(SRC, /if \(Number\.isFinite\(cmd\.toEndM\)\) \{\s*\n\s*reverseAim\.finalToEndM = cmd\.toEndM;\s*\n\s*reverseAim\.reachedEnd = cmd\.done === true;/);
    const leave = SRC.match(/const aimLeaveLeg = async \(\) => \{[\s\S]*?\n\};/);
    assert.ok(leave, "aimLeaveLeg is gone");
    // Comments stripped: aimLeaveLeg's own comment NAMES both fields to say
    // it does not write them, and a test that cannot tell prose from code
    // would fail on the documentation that explains it.
    const leaveCode = leave[0].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(leaveCode, /aimWaypoints = null;/, "positive control: the stripper left the code");
    assert.doesNotMatch(leaveCode, /finalToEndM|reachedEnd/, "the exit must not recompute what the tick measured");
  });

  it("BLAMES THE HARNESS, loudly, for every way it could fail to aim", () => {
    // ANTI-NEUTRALISATION, and the reason this capability was built. Each of
    // these is a distinct way the instrument can fail, and each one must read
    // as an instrument failure rather than as a lesson that cannot be parked.
    // MUTATION WATCHED: downgrade any `loud(` to `note(` -> red.
    for (const cause of [
      /THE REVERSE OBJECTIVE ON THIS LANE IS UNJUDGED, AND THE REASON IS THIS HARNESS: the cluster never read/,
      /THE REVERSE OBJECTIVE ON THIS LANE IS UNJUDGED, AND THE REASON IS THIS HARNESS: the car reached «R» but had no/,
      /THE REVERSE OBJECTIVE ON THIS LANE IS UNJUDGED, AND THE REASON IS THIS HARNESS: the steering-sign check/,
      /THE REVERSE OBJECTIVE ON THIS LANE IS UNJUDGED, AND THE REASON IS THIS HARNESS: it armed R and followed the/,
    ]) {
      assert.match(SRC, cause);
      // …and each of them is LOUD. A quiet instrument failure is one a judge
      // reads past on the way to the objectives list. The `loud(` must be the
      // LAST call opened before the sentence — a `note(` in between would mean
      // the sentence belongs to the quiet call.
      const at = SRC.search(cause);
      const before = SRC.slice(Math.max(0, at - 160), at);
      const lastLoud = before.lastIndexOf("loud(");
      const lastNote = before.lastIndexOf("note(");
      assert.ok(lastLoud > -1 && lastLoud > lastNote, `this attribution must be loud(), got …${before.slice(-60)}`);
    }
  });

  it("says a straight-line reverse parks nothing on ANY product", () => {
    // The sentence that stops the next reader re-deriving the wrong cause.
    // MUTATION WATCHED: delete it -> red.
    assert.match(SRC, /cannot be completed in a straight line on ANY product/);
  });

  it("only calls an uncredited reverse the PRODUCT's fault after the harness did its job", () => {
    // The positive case, and it is the narrow one on purpose: armed, aimed,
    // sign agreed, path driven to its end. Anything less is the instrument.
    // MUTATION WATCHED: move this branch above the harness-fault branches ->
    // red, because the ordering below is what makes it narrow.
    const outcome = SRC.slice(SRC.indexOf("REVERSE OUTCOME: demanded"));
    const productBlame = outcome.indexOf("This one IS about the product");
    const notReachedEnd = outcome.indexOf("stopped ${reverseAim.finalToEndM ?? \"?\"} m short");
    const signBlame = outcome.indexOf("the steering-sign check");
    const noPath = outcome.indexOf("had no ` +");
    assert.ok(productBlame > 0, "the product-fault branch is gone");
    for (const [name, at] of [["not-reached-end", notReachedEnd], ["sign", signBlame], ["no-path", noPath]]) {
      assert.ok(at > 0 && at < productBlame, `the ${name} harness-fault branch must be checked BEFORE blaming the product`);
    }
  });

  it("qualifies a credited reverse as GRADING evidence and not legibility evidence", () => {
    // The instrument's remit, on the artefact. A leg aimed from the lesson's
    // own demonstration cannot testify that a student could find the
    // manoeuvre from the glass.
    // MUTATION WATCHED: drop the caveat -> red.
    assert.match(SRC, /admissible evidence about GRADING/);
    assert.match(LIB, /NOT evidence that a student/);
  });
});

describe("§E the speed the controller asked for is the speed the car is given", () => {
  it("uses the command's targetKmh rather than the old flat constant", () => {
    // At the old flat 6 км/ч the car covered ~3 m between two steering
    // decisions on this box, which is most of a 9 m manoeuvre graded to
    // ±0.5 m. MUTATION WATCHED: pin `cap` back to REVERSE_CRUISE_KMH -> red.
    assert.match(SRC, /const cap = aimWaypoints === null \? REVERSE_CRUISE_KMH : cmd\.targetKmh;/);
    assert.match(SRC, /p\.kmh > cap \+ BRAKE_CAP_OVER_KMH/);
  });

  it("still refuses the standstill press that would select D", () => {
    // The brake refusal this phase was built around is not relaxed by the
    // arrival branch: the functional brake is pressed only while there is
    // motion left to take out.
    // MUTATION WATCHED: `await throttle(true)` unconditionally on arrival ->
    // red, and on a real drive it ends the manoeuvre one tick before it is
    // credited.
    assert.match(SRC, /await throttle\(p\.kmh > 1\);/);
  });
});
