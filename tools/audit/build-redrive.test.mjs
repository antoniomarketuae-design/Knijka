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
// §1 is leg extraction, both corpus shapes.
// §2 is the set itself: what it counts, what it sorts by, and what it does when
//    a lesson names no leg at all.
// -----------------------------------------------------------------------------

import { strict as assert } from "node:assert";
import test from "node:test";

import { legOfFrame, redriveSet } from "./build-redrive.mjs";

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
