/**
 * guidance-wiring.test.mjs — THE LOOP IS ACTUALLY CALLED, AND SAYS SO.
 *
 * Run: node --test tools/mobile/__tests__/guidance-wiring.test.mjs
 * (collected automatically by platform/scripts/tools-tests.mjs — it walks
 * tools/ and classifies by the `node:test` import.)
 *
 * ═══ WHY THIS FILE EXISTS ══════════════════════════════════════════════════
 *
 * WRITTEN BY A VERIFIER, 2026-08-22, BECAUSE THE ROUND SHIPPED ITS CAPABILITY
 * WITHOUT THE GUARD THAT WOULD NOTICE ITS REMOVAL.
 *
 * `__tests__/guidance.test.mjs` is 37 assertions on `lib/guidance.mjs` — the
 * PURE half: the pixel test, the aim point, the control law, the verdict
 * ladder. Every one of them passes with the loop deleted from the drive path,
 * because none of them knows the drive path exists. A census of the whole
 * repository for a test that mentions `guideTick`, or asserts `guidance` is
 * written into `_audit-status.json`, returned NOTHING outside this file.
 *
 * Compare the neighbouring capability. §6 of
 * `platform/src/modules/sim/engine/__tests__/reverseAssist-audit-harness.test.ts`
 * pins the steering CHANNEL by grepping `lesson-audit.mjs` itself: the key
 * constants, the release-before-press order, the `steering,` key in the status
 * object, the exact sentence in the loud line. The tracking record — the
 * artefact this whole round says it exists to produce — had none of that.
 *
 * So: delete one line, `await timed("guide", () => guideTick(…))`, and every
 * gate in this repository stays green while every drive silently reverts to
 * straight-line driving, publishing a `guidance` block that says the loop was
 * `wired: true`. That is the exact shape the round names as its worst possible
 * outcome — „a straight-line drive wearing the costume of a steered one" — and
 * it was reachable by a one-line edit that nothing would have caught.
 *
 * These assertions are deliberately about WIRING and never about a driving
 * line. Whether the car tracks well is a question for a drive; whether the
 * instrument that answers it is still connected is a question for a gate, and
 * a gate is the only one of the two that runs on every commit.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, "..", "lesson-audit.mjs"), "utf8");

describe("§A the steering loop is connected to the drive path", () => {
  it("calls guideTick from the driving tick, not merely defines it", () => {
    // The definition on its own is what a deleted call site leaves behind, and
    // it reads exactly like a working feature.
    assert.match(SRC, /async function guideTick\(/, "guideTick is gone");
    assert.match(
      SRC,
      /timed\("guide",\s*\(\)\s*=>\s*guideTick\(/,
      "nothing on the drive path calls guideTick — every drive is a straight line again",
    );
  });

  it("runs the loop inside the roll phase, where the pedals are", () => {
    const roll = SRC.match(/if \(phase === "roll"\) \{[\s\S]*?\n {4}\} else if \(phase === "stop"\)/);
    assert.ok(roll, "the roll branch is gone or has been reshaped");
    assert.ok(
      roll[0].includes("guideTick("),
      "guideTick is no longer called from the roll phase",
    );
  });

  it("imports the control law and the decoder from lib, not from the app under test", () => {
    // `sharp` lives in platform/node_modules. A harness that reaches into the
    // product's dependency tree is one `npm prune` from a sweep that stops
    // steering, and the symptom would be „the ribbon was never seen".
    assert.match(SRC, /from "\.\/lib\/png\.mjs"/);
    assert.match(SRC, /from "\.\/lib\/guidance\.mjs"/);
    assert.doesNotMatch(SRC, /from "sharp"/);
  });
});

describe("§B the record reaches the status file, and carries its own objection", () => {
  it("publishes `guidance` in _audit-status.json", () => {
    // Same guard shape §6 uses for `steering,` — a bare key on its own line in
    // the final saveStatus object literal.
    assert.match(
      SRC,
      /^\s*guidance,$/m,
      "the tracking record is computed and never written — a reader gets the frames and no way to qualify them",
    );
  });

  it("computes the tracking summary from the samples the loop actually took", () => {
    assert.match(SRC, /guidance\.tracking = summariseTracking\(guidance\.samples\)/);
  });

  it("states the centreline objection on every drive", () => {
    // If this sentence ever stops being published, lane-position findings
    // become drawable from a signal that cannot support them.
    assert.match(SRC, /guidance\.caveat =/);
    assert.match(SRC, /ROAD CENTRELINE, NOT A LANE/);
    assert.match(SRC, /NO LANE-POSITION FINDING/);
  });

  it("shouts on every verdict that means the car was not steered", () => {
    // The three quiet ones are the dangerous ones: `not-invoked` (the loop was
    // never called — every MODE=«wrong» lane), `speed-unreadable` (the probe
    // died), and `blind` (it ran and saw nothing). All three mean „straight
    // line"; none of them may be reachable without a loud line.
    for (const verdict of ["not-invoked", "speed-unreadable", "blind"]) {
      assert.ok(
        new RegExp(`tr\\.verdict === "${verdict}"`).test(SRC),
        `the ${verdict} verdict no longer reaches loud() — an unsteered drive can now pass quietly`,
      );
    }
    assert.match(SRC, /THIS DRIVE WAS NOT STEERED/);
    assert.match(SRC, /THIS DRIVE STEERED BADLY/);
  });
});

describe("§C the wheel is never left down where nothing is watching", () => {
  it("releases a sustained hold when the drive leaves the roll phase", () => {
    // `guideTick` is the only caller of steer() on the drive path and runs
    // ONLY under `phase === "roll"`. The sustain branch leaves a key DOWN
    // across a scan on purpose; if the same tick then transitions the phase,
    // no later tick scans and no later tick releases. A confirmed turn landing
    // on the last roll tick would hold full lock through the whole stop (or,
    // worse, into R).
    assert.match(SRC, /async function guideLeaveRoll\(\)/, "the phase-exit release is gone");
    const rollBranch = SRC.match(/if \(phase === "roll"\) \{[\s\S]*?\n {4}\} else if \(phase === "stop"\)/);
    assert.ok(rollBranch, "the roll branch is gone or has been reshaped");
    assert.ok(
      /await guideLeaveRoll\(\);\s*\n\s*phase = "stop";/.test(rollBranch[0]),
      "the roll→stop transition no longer centres the wheel first",
    );
    // …and both routes into R.
    assert.equal(
      (SRC.match(/await guideLeaveRoll\(\);\s*\n\s*phase = "reverse";/g) ?? []).length,
      2,
      "a route into reverse can now start with the wheel wound over from a confirmed turn",
    );
  });

  it("counts the phase-exit releases instead of inferring them", () => {
    assert.match(SRC, /phaseExitReleases: 0,/);
    assert.match(SRC, /guidance\.phaseExitReleases \+= 1;/);
  });
});

describe("§D the witness keeps enough to check the loop's own story", () => {
  it("publishes the poses, not only the three folded numbers", () => {
    // path/net/straightness answer „did it turn at all". The question the
    // record exists for — was the car ON THE LINE — needs the poses, and they
    // cannot be recovered once a lane is finished.
    assert.match(SRC, /poses: \(\(\) => \{/, "the per-sample poses are folded away again");
    assert.match(SRC, /posesEveryNth:/, "a decimated series with no stride is a row count nobody can read");
    assert.match(SRC, /shadow trace uses y = −z/, "the frame the poses join against is unstated");
  });
});
