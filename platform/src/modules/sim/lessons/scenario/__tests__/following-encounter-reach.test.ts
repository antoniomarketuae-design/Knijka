/**
 * SWEEP 161, the FOLLOWING family — THE STAGED EVENT, DRIVEN.
 *
 * `following-claim-gates.test.ts` next door proves the two arming floors this
 * family repaired (`minSlamSpeedKmh` 25 → 8, `minCutSpeedKmh` 25 → 15) satisfy
 * the arithmetic they were chosen by. That is an assertion about a NUMBER, and
 * the finding it answers was not about a number: the auditor photographed a
 * lesson in which nothing happened for 205 seconds. So this battery drives the
 * two encounters through the PRODUCTION stack — `recordScriptedDrive` on the
 * committed districts, the real `ScenarioDirector`, the real runners, the real
 * rule engine — at the pace the cautious learner actually holds, and asserts
 * what the student would have SEEN.
 *
 * Every arm carries its own refutation: the same drive re-run against the
 * SHIPPED-BEFORE floor, which must go silent. A test that only shows the fixed
 * value working cannot tell a reader whether it was ever broken.
 *
 * MEASURED HERE (fo-brake-v1 / ln-v1, seed 7, ambient zero — the numbers below
 * are this file's own output, not the frames'):
 *
 *   sc-follow-brake, straight through at 11 км/ч, no reaction
 *     minSlamSpeedKmh  8 → hitLeadCar @ t≈70 s, rule log ["COLLISION"]
 *     minSlamSpeedKmh 25 → NO outcome, NO rule event, 129 s of empty street
 *   sc-follow-brake, 11 км/ч, stops at y = 205
 *     minSlamSpeedKmh  8 → stoppedInTime @ t≈64 s, 18.4 m of gap left, 0 faults
 *   sc-follow-brake, 40 км/ч (the demos' own pace)
 *     8 and 25 alike → resolves @ t≈22 s — the repair is trace-neutral
 *
 *   sc-follow-cutin, 16 / 20 км/ч
 *     minCutSpeedKmh 15 → the cut lands, resolves „yielded" @ t≈34 / 30 s
 *     minCutSpeedKmh 25 → notEncountered @ t≈48 / 38 s — the photographed drill
 *   sc-follow-cutin, 10 км/ч (under the honest-theft line of 14.2 км/ч)
 *     15 and 25 alike → notEncountered: the runner refuses to stage a theft the
 *     geometry cannot commit, and SAYS SO. What nothing consumes that report is
 *     the half of the finding this lane could not close — see the block on
 *     `sc-fc-cutter` in the template.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  BrakingLeadCarSpec,
  CutInLeadCarSpec,
  StagedEventOutcome,
  StagedEventSpec,
} from "../../../contracts";
import { recordScriptedDrive, type RecordedDrive } from "../../../traces/recorder";
import { SC_FOLLOW_BRAKE, SC_FOLLOW_CUTIN } from "../templates-following";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");

function district(id: string): unknown {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "content", "world", `${id}.json`), "utf-8"),
  ) as unknown;
}

/** The floors as they were SHIPPED WHEN THE SWEEP RAN — the refutation arm. */
const SHIPPED_BEFORE_SLAM_KMH = 25;
const SHIPPED_BEFORE_CUT_KMH = 25;

/** fo-brake-v1 / ln-v1 right-lane centres (pinned by value — the L7 pattern;
 *  the same constants the template authors its zones on). */
const BRAKE_LANE_X = 4.06;
const CUT_LANE_X = 12.19;

const FB_LEAD = SC_FOLLOW_BRAKE.staged!.find(
  (s) => s.id === "sc-fb-lead",
) as unknown as BrakingLeadCarSpec;
const FC_CUTTER = SC_FOLLOW_CUTIN.staged!.find(
  (s) => s.id === "sc-fc-cutter",
) as unknown as CutInLeadCarSpec;

function violationCodes(drive: RecordedDrive): string[] {
  return drive.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code);
}

/**
 * Drive fo-brake-v1 in the player's own lane at a constant pace.
 * `stopAtY` = the learner REACTS (comes to rest there, waits, drives on);
 * `null` = the passive drive that never lifts.
 */
function driveBrake(opts: {
  kmh: number;
  minSlamSpeedKmh?: number;
  stopAtY?: number;
}): RecordedDrive {
  const lead: BrakingLeadCarSpec = {
    ...FB_LEAD,
    ...(opts.minSlamSpeedKmh !== undefined ? { minSlamSpeedKmh: opts.minSlamSpeedKmh } : {}),
  };
  const steps =
    opts.stopAtY === undefined
      ? [
          {
            kind: "drive" as const,
            points: [
              [BRAKE_LANE_X, 15],
              [BRAKE_LANE_X, 400],
            ] as ReadonlyArray<readonly [number, number]>,
            targetKmh: opts.kmh,
          },
        ]
      : [
          {
            kind: "drive" as const,
            points: [
              [BRAKE_LANE_X, 15],
              [BRAKE_LANE_X, opts.stopAtY],
            ] as ReadonlyArray<readonly [number, number]>,
            targetKmh: opts.kmh,
            stopAtEnd: true,
          },
          { kind: "pause" as const, sec: 6, brake: true },
          {
            kind: "drive" as const,
            points: [
              [BRAKE_LANE_X, opts.stopAtY],
              [BRAKE_LANE_X, 400],
            ] as ReadonlyArray<readonly [number, number]>,
            targetKmh: opts.kmh,
          },
        ];
  return recordScriptedDrive(
    district(SC_FOLLOW_BRAKE.map.districtId),
    { steps },
    {
      scenarioId: SC_FOLLOW_BRAKE.id,
      kind: "shadow",
      stagedEvents: [lead as StagedEventSpec],
      maxDurationSec: 400,
    },
  );
}

/**
 * THE SHAPE THE AUDIT ACTUALLY PHOTOGRAPHED — not a steady crawl, a STOP-START
 * one (round 2).
 *
 * `driveBrake` above holds one pace all the way down the street, and that is
 * not what the frames show. `sc-follow-brake/pc-right`'s own machine summary
 * reads „top 28 км/ч · 26 full stops · 0 lawful waits", with the speedometer
 * sampled at 3, 10, 0, 11, 0, 0, 10, 3, 0, 11, 3 км/ч across 206 s — a car
 * that creeps a few metres, stops, creeps again. It matters because the arming
 * condition reads the PLAYER'S SPEED at the moment the lead reaches its slam
 * point (`speedKmh >= minSlamSpeedKmh || playerGap <= proximityFallbackM`), and
 * a car that spends half its frames at 0 км/ч can be under any floor at exactly
 * the wrong instant — the steady-11 arm cannot see that at all.
 *
 * `legM` metres of creep, then `pauseSec` on the brake, repeated to the end of
 * the street.
 */
function driveBrakeStopStart(opts: {
  kmh: number;
  legM: number;
  pauseSec: number;
  minSlamSpeedKmh?: number;
}): RecordedDrive {
  const lead: BrakingLeadCarSpec = {
    ...FB_LEAD,
    ...(opts.minSlamSpeedKmh !== undefined ? { minSlamSpeedKmh: opts.minSlamSpeedKmh } : {}),
  };
  const steps: object[] = [];
  let y = 15;
  while (y < 400) {
    const next = Math.min(400, y + opts.legM);
    steps.push({
      kind: "drive",
      points: [
        [BRAKE_LANE_X, y],
        [BRAKE_LANE_X, next],
      ],
      targetKmh: opts.kmh,
      stopAtEnd: true,
    });
    steps.push({ kind: "pause", sec: opts.pauseSec, brake: true });
    y = next;
  }
  return recordScriptedDrive(
    district(SC_FOLLOW_BRAKE.map.districtId),
    { steps } as never,
    {
      scenarioId: SC_FOLLOW_BRAKE.id,
      kind: "shadow",
      stagedEvents: [lead as StagedEventSpec],
      maxDurationSec: 600,
    },
  );
}

/** Drive ln-v1's right lane at a constant pace past the staged cut point. */
function driveCutIn(opts: { kmh: number; minCutSpeedKmh?: number }): RecordedDrive {
  const cutter: CutInLeadCarSpec = {
    ...FC_CUTTER,
    ...(opts.minCutSpeedKmh !== undefined ? { minCutSpeedKmh: opts.minCutSpeedKmh } : {}),
  };
  return recordScriptedDrive(
    district(SC_FOLLOW_CUTIN.map.districtId),
    {
      steps: [
        {
          kind: "drive",
          points: [
            [CUT_LANE_X, 15],
            [CUT_LANE_X, 380],
          ],
          targetKmh: opts.kmh,
        },
      ],
    },
    {
      scenarioId: SC_FOLLOW_CUTIN.id,
      kind: "shadow",
      stagedEvents: [cutter as StagedEventSpec],
      maxDurationSec: 400,
    },
  );
}

function only(outcomes: readonly StagedEventOutcome[]): StagedEventOutcome | null {
  return outcomes.length === 1 ? outcomes[0] : null;
}

// ---------------------------------------------------------------------------
// sc-follow-brake — „Внезапно спиране на предния" must contain a sudden stop
// ---------------------------------------------------------------------------

describe("sc-follow-brake: the lesson's own event reaches the learner it is written for", () => {
  it("stages the slam for a crawling learner — and the shipped-before floor did not", () => {
    // The photographed drive: 11 км/ч from t = 1 s to the harness cap, the lead
    // ~40 m ahead still rolling, and no sudden stop in a lesson called «Внезапно
    // спиране». Reproduced here on the district itself.
    const now = driveBrake({ kmh: 11 });
    const outcome = only(now.outcomes);
    expect(outcome, "the crawl must resolve the encounter").not.toBeNull();
    expect(outcome!.eventId).toBe("sc-fb-lead");

    // …and the same drive against the floor that shipped when the sweep ran:
    // 129 s of street, nothing staged, nothing graded. That is the finding.
    const before = driveBrake({ kmh: 11, minSlamSpeedKmh: SHIPPED_BEFORE_SLAM_KMH });
    expect(before.outcomes, "minSlamSpeedKmh 25 leaves the crawl unstaged").toEqual([]);
    expect(violationCodes(before)).toEqual([]);
    expect(before.trace.meta.durationSec).toBeGreaterThan(120); // the clock ran out
  });

  it("…and convicts the crawler who never lifts, instead of saying nothing", () => {
    // The other half of «no nudge until the clock ran out»: once the stimulus
    // exists, ignoring it costs. A drive straight through at 11 км/ч rear-ends
    // the stopped lead and the rule engine bills COLLISION — measured t ≈ 70 s.
    for (const kmh of [11, 20]) {
      const drive = driveBrake({ kmh });
      expect(only(drive.outcomes)?.detail, `passive at ${kmh} км/ч`).toBe("hitLeadCar");
      expect(violationCodes(drive), `passive at ${kmh} км/ч`).toContain("COLLISION");
    }
  });

  it("…while the crawler who DOES react is credited, not trapped", () => {
    // The direction that makes the floor a lesson rather than an ambush. If 8
    // armed a slam the taught gap could not absorb, this lane would have traded
    // a silent drill for an unavoidable collision — a false failure, which this
    // family has already been burned by once. Measured: rest with 18.4 m of
    // bumper gap in hand and an empty rule log.
    //
    // EXPECTATION CORRECTED 2026-09-01 (audit sc-vu-emergency-junction:853790f7).
    // „An empty rule log" is no longer the right statement of this case, and the
    // reason is a real product change, not a widened band: the reacting crawler
    // spends the first stretch of this drive holding 11 км/ч down a street
    // posted 50 with NOTHING ahead of him — the lead is staged later — and
    // `DRIVING_TOO_SLOW_IN_TOWN` now grades that (ЗДвП чл. 22, ал. 1). What this
    // case is FOR is untouched and is asserted below directly instead of through
    // an empty array: the reaction succeeds, the gap is kept, and no collision
    // or following fault is billed. If the floor ever did trap him, COLLISION
    // appears in that list and this goes red exactly as it always would have.
    const drive = driveBrake({ kmh: 11, stopAtY: 205 });
    const outcome = only(drive.outcomes);
    expect(outcome?.detail).toBe("stoppedInTime");
    expect(outcome?.success).toBe(true);
    expect(outcome!.stopGapM!).toBeGreaterThan(10);
    expect([...new Set(violationCodes(drive))]).toEqual(["DRIVING_TOO_SLOW_IN_TOWN"]);
  });

  it("…and reaches the STOP-START crawl the audit photographed, not only a steady one", () => {
    /**
     * ROUND 2 — the finding was re-judged STILL on a re-drive of the REPAIRED
     * build, and the reason given was that no outcome or teach card appeared
     * „at any point in the slam window (t033–t049)". That window is the
     * DEMONSTRATION's own loop (the ghost slams ~23 s into its 47 s tape and
     * the caption replays every 48 s), not the student's drive: a car doing
     * 11 км/ч needs 215 m ÷ 3.05 m/s ≈ 70 s just to reach y = 230, so nothing
     * could have been there to see. The steady-11 arm above already says the
     * event lands — but the photographed drive was not steady, so this arm
     * drives the shape the frames actually show and puts the answer past
     * argument.
     *
     * MEASURED HERE (12 m of creep at 11 км/ч, 2 s on the brake, repeated —
     * 26 stops, the machine summary's own count):
     *
     *   minSlamSpeedKmh  8 → the encounter resolves at t ≈ 109 s, well inside
     *                        the 206 s the auditor's clock ran, with 16.2 m of
     *                        bumper gap still in hand
     *   minSlamSpeedKmh 25 → NO outcome for the whole 206 s. That is the frame.
     *
     * The assertion is the CONTRAST, not the second: a floor of 8 gives this
     * learner an event to see and a floor of 25 gives him an empty street.
     */
    const now = driveBrakeStopStart({ kmh: 11, legM: 12, pauseSec: 2 });
    const outcome = only(now.outcomes);
    expect(outcome, "the stop-start crawl must resolve the encounter").not.toBeNull();
    expect(outcome!.eventId).toBe("sc-fb-lead");
    // Inside the window the auditor's own camera was open — an event that
    // resolves after the clock stops is an event the student never saw.
    expect(outcome!.tSec, "resolves while the drive is still being watched").toBeLessThan(200);
    expect(outcome!.tSec, "…and not instantly: the lead has a street to cover").toBeGreaterThan(30);

    const before = driveBrakeStopStart({
      kmh: 11,
      legM: 12,
      pauseSec: 2,
      minSlamSpeedKmh: SHIPPED_BEFORE_SLAM_KMH,
    });
    expect(before.outcomes, "minSlamSpeedKmh 25 leaves the stop-start crawl unstaged").toEqual([]);
    expect(before.trace.meta.durationSec, "…for the whole photographed drive").toBeGreaterThan(180);
  });

  it("…and the demos' own 40 км/ч approach is untouched by the change", () => {
    // Trace neutrality, driven rather than argued: at the pace all three
    // committed recordings hold past the slam point, the binding condition is
    // `reachedSlamPoint`, so both floors resolve the encounter in the same
    // second. Nothing under content/traces/ can move because of this lane.
    const now = driveBrake({ kmh: 40 });
    const before = driveBrake({ kmh: 40, minSlamSpeedKmh: SHIPPED_BEFORE_SLAM_KMH });
    expect(only(now.outcomes)?.detail).toBe(only(before.outcomes)?.detail);
    expect(only(now.outcomes)!.tSec).toBeCloseTo(only(before.outcomes)!.tSec, 1);
  });
});

// ---------------------------------------------------------------------------
// sc-follow-cutin — the cut must actually cut, and only when it is a theft
// ---------------------------------------------------------------------------

describe("sc-follow-cutin: the cut lands on the learner, and only where it is honest", () => {
  it("cuts in front of the 16–20 км/ч learner the shipped-before floor locked out", () => {
    for (const kmh of [16, 20]) {
      const now = driveCutIn({ kmh });
      expect(only(now.outcomes)?.detail, `${kmh} км/ч, shipped floor`).not.toBe("notEncountered");
      expect(only(now.outcomes)?.eventId).toBe("sc-fc-cutter");

      // The refutation: the same drive at 25 watches the car hold station in
      // the left lane for the whole street — the 189 s frame, reproduced.
      const before = driveCutIn({ kmh, minCutSpeedKmh: SHIPPED_BEFORE_CUT_KMH });
      expect(only(before.outcomes)?.detail, `${kmh} км/ч, minCutSpeedKmh 25`).toBe(
        "notEncountered",
      );
    }
  });

  it("…and under the honest-theft line it reports a lesson that did not happen", () => {
    // 14.2 км/ч is where `paceAheadM` 12 m of centres stops leaving the student
    // the taught two seconds (the arithmetic is pinned next door). Below it the
    // cut steals nothing, so staging one would teach a fiction — the runner
    // says `notEncountered` instead, at BOTH floors. This is not a pass: the
    // contract on StagedEventOutcome calls it „not measured", never a clean run.
    for (const minCutSpeedKmh of [undefined, SHIPPED_BEFORE_CUT_KMH]) {
      const drive = driveCutIn({
        kmh: 10,
        ...(minCutSpeedKmh !== undefined ? { minCutSpeedKmh } : {}),
      });
      const outcome = only(drive.outcomes);
      expect(outcome?.detail).toBe("notEncountered");
      expect(outcome?.success).toBe(false);
    }
  });

  it("…and the recorded demos' own 30 км/ч pace resolves identically at either floor", () => {
    const now = driveCutIn({ kmh: 30 });
    const before = driveCutIn({ kmh: 30, minCutSpeedKmh: SHIPPED_BEFORE_CUT_KMH });
    expect(only(now.outcomes)?.detail).toBe(only(before.outcomes)?.detail);
    expect(only(now.outcomes)!.tSec).toBeCloseTo(only(before.outcomes)!.tSec, 1);
  });
});
