/**
 * FR-B5-RECHOREOGRAPH (sc-jx-equal-left:4274eddb) — A LADDER RUNG MAY NOT COME
 * BACK ROUND AT A STUDENT WHO IS STILL AT THE JUNCTION.
 *
 * The finding, verbatim: „The correct drive is convicted of «Непропускане на
 * пътно превозно средство с предимство» plus «Пътнотранспортно произшествие»
 * … The give-way event the lesson exists to teach ends in a crash even when
 * driven to the briefing." Frame:
 * `.audit-frames/sweep161/sc-jx-equal-left/mobile-right/08-debrief.png`.
 *
 * THE MECHANISM, in one sentence: both of that template's staged actors run out
 * of path INSIDE the lesson (260 m of polyline on 130 m arms), retire, and
 * re-enter at the start of their own path (traffic/staged.ts FR-B5-RETURN /
 * FR-B5-CROSS) — by which time their runners have RESOLVED, so the second pass
 * used to arrive with no witness gate, no approach sync and no teach card, and
 * the runtime's right-hand-rule tracker adjudicated it exactly as if the
 * template had staged it.
 *
 * WHAT THIS FILE DRIVES. The briefing verbatim, through the production stack
 * (`recordScriptedDrive` = createWorldRuntime + createTrafficSystem +
 * createScenarioDirector + the rule engine), varying only the two things a live
 * student varies and the instructions leave open: WHERE he starts slowing
 * («намали отрано» — instruction 2 gives no metre) and HOW LONG he stands at
 * the yield pose before instruction 5's «пътят е чист» is true for him.
 *
 * MEASURED as shipped 2026-08-30, 3 slow-from points x 7 wait lengths:
 * 6 of 21 pacings were billed опасна FAILED_TO_YIELD, in two bands ~28 s apart
 * — `sc-jxeq-right`'s round trip on these arms. Every row below is one of
 * those six or one of the clean controls between them, so this file goes red
 * for the phase lottery and stays green for a repair that merely re-phases it.
 *
 * §2 is the other direction: the repair must not have bought this by disarming
 * the adjudicator. The two authored mistake drives still grade exactly their
 * template `codeRefs`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { StagedEventSpec } from "../../contracts";
import {
  SC_JX_EQUAL_LEFT,
  SC_JX_EQUAL_RIGHT_CONFLICT,
} from "../../lessons/scenario/templates-junctions3";
import { recordScriptedDrive, type DriveScript } from "../../traces/recorder";
import { recordScJxEqualLeftDrive } from "../../traces/scJxEqualLeft";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../..");

/** Drawn lane-center offset on jx-equal-v1 (jx-equal-districts.test.ts pins it). */
const LANE = 4.0625;
/** The shadow's yield pose, m — JUNCTION3_YIELD_Y. */
const POSE_Y = -19.5;

function loadDistrict(id: string): unknown {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"));
}

/** Arc polyline: center (cx, cy), radius r, param a0→a1 deg (8 segments). */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const a = ((a0 + ((a1 - a0) * k) / 8) * Math.PI) / 180;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** The left turn south arm → west arm, R = 18 (the shadow's own geometry). */
const LEFT_TURN: Array<[number, number]> = [
  [LANE, -13.94],
  ...arcPts(-13.94, -13.94, 18.0025, 0, 90),
];

/**
 * The briefing, driven. Identical in shape to the committed shadow script
 * (traces/scJxEqualLeft.ts) — same lane, same pose, same 20 km/h through the
 * arc, which the TurnDetector needs to see a turn at all — with the two free
 * parameters exposed.
 */
function briefingDrive(slowFromY: number, wait1Sec: number, wait2Sec: number): DriveScript {
  return {
    steps: [
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [
          [LANE, -115],
          [LANE, slowFromY],
        ],
        targetKmh: 20,
      },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      {
        kind: "drive",
        points: [
          [LANE, slowFromY],
          [LANE, POSE_Y],
        ],
        targetKmh: 7,
      },
      { kind: "pause", sec: wait1Sec, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: wait2Sec, brake: true },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [[LANE, POSE_Y], ...LEFT_TURN, [-30, LANE], [-58, LANE]],
        targetKmh: 20,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

const DISTRICT = loadDistrict("jx-equal-v1");
const STAGED: StagedEventSpec[] = [...(SC_JX_EQUAL_LEFT.staged ?? [])];

interface Graded {
  violations: string[];
  yieldProofs: number;
}

function driveBriefing(slowFromY: number, wait1Sec: number, wait2Sec: number): Graded {
  const drive = recordScriptedDrive(DISTRICT, briefingDrive(slowFromY, wait1Sec, wait2Sec), {
    scenarioId: "sc-jx-equal-left",
    kind: "shadow",
    seed: 7,
    stagedEvents: STAGED,
    collisionMinKmh: 0,
  });
  return {
    violations: drive.ruleEvents
      .filter((e) => e.kind === "violation")
      .map((e) => `${e.code}@${e.t.toFixed(1)}s`),
    yieldProofs: drive.ruleEvents.filter(
      (e) => e.kind === "commendation" && e.code === "YIELDED_TO_PRIORITY",
    ).length,
  };
}

// ---------------------------------------------------------------------------
// §1 — the briefing, at every pace the briefing allows
// ---------------------------------------------------------------------------

/**
 * `[slowFromY, wait1, wait2, whatItWasBeforeTheRepair]`. The four convicted
 * rows are the finding; the four clean rows sit between them and hold the
 * "and nothing that worked stopped working" half — a repair that merely slid
 * the band would swap which of the eight are red rather than clearing them.
 */
const PACINGS: ReadonlyArray<readonly [number, number, number, string]> = [
  [-34, 8, 11, "clean — the shadow's own pacing"],
  [-34, 10, 13, "FAILED_TO_YIELD at (1.7, −5.2)"],
  [-34, 15, 20, "clean"],
  [-34, 22, 28, "FAILED_TO_YIELD at (−1.2, −1.2)"],
  [-45, 10, 13, "FAILED_TO_YIELD at (4.1, −13.9) — the finding's own row"],
  [-45, 25, 30, "clean"],
  [-60, 10, 13, "FAILED_TO_YIELD at (2.6, −6.9) — the «намали отрано» leg"],
  [-60, 22, 28, "FAILED_TO_YIELD at (0.1, −2.8)"],
];

describe("FR-B5-RECHOREOGRAPH — sc-jx-equal-left is not a phase lottery", () => {
  for (const [slowFromY, w1, w2, before] of PACINGS) {
    it(`slow from y=${slowFromY}, wait ${w1}+${w2} s: clean, both duties discharged (was: ${before})`, () => {
      const g = driveBriefing(slowFromY, w1, w2);
      expect(
        g.violations,
        `a drive that obeyed instructions 2-5 was billed ${g.violations.join(", ")}`,
      ).toEqual([]);
      // The template's reason to exist: an equal X puts the right-hand-rule
      // tracker AND the N1 left-turn tracker on one node. Two proofs, or an
      // adjudicator never armed and the lesson is teaching half a rule while
      // looking green.
      expect(g.yieldProofs, "both чл. 37 duties must be proven, not just one").toBe(2);
    });
  }

  it("the ladder is AUTHORED on the actor, not inferred at runtime", () => {
    // The runner's opt-in (contracts.ts `oneCrossingPerApproach`). Applied
    // unconditionally it degrades FR-B5-CROSS's two boulevard drills, which
    // `traffic/staged-cross-return.test.ts` §1 gates; dropped from here, every
    // row above goes back to the lottery. Both halves have to be true, so both
    // are asserted where they can be seen.
    expect(SC_JX_EQUAL_RIGHT_CONFLICT.oneCrossingPerApproach).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §2 — and the adjudicator still has its teeth
// ---------------------------------------------------------------------------

describe("FR-B5-RECHOREOGRAPH — nothing was bought by disarming the tracker", () => {
  it("barging past the car from the right is still FAILED_TO_YIELD", () => {
    const drive = recordScJxEqualLeftDrive(DISTRICT, "mistake-cut-right");
    expect(
      drive.ruleEvents.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD"),
    ).toBe(true);
  });

  it("turning across the oncoming is still FAILED_TO_YIELD + COLLISION", () => {
    const drive = recordScJxEqualLeftDrive(DISTRICT, "mistake-cut-oncoming");
    const codes = drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("FAILED_TO_YIELD");
    expect(codes).toContain("COLLISION");
  });
});
