/**
 * FR-B5-QUEUE (doc 87, the 2026-08-05 gate's open list, item 7 — his item 40) —
 * „The queue drill is unsurvivable at its own nominal speed."
 *
 * His result screen: «20 наказателни точки · НЕИЗДЪРЖАН · Опасни 2 · Основни 0
 * · Второстепенни 0». Two collisions, and not one graded fault to tell him what
 * he had done. Reproduced headlessly by driving the lane at the staged lead's
 * OWN cruise (20 km/h) without lifting:
 *
 *   lead gap  27.5 m @t13 · 15.4 @t35 · 10.9 @t39 · 8.6 @t41 · 2.9 @t43 · 0.0 @t44
 *   rule log  `+CLEAN_DRIVING@46.5`, `STANDSTILL_GAP_TOO_CLOSE@54.2`
 *
 * A commendation on the way into the queue and no distance fault anywhere. The
 * mechanism is one number: `followMinSpeedKmh` is 20 and the drill is driven at
 * 19.9, so its only distance detector is muted for the whole exercise.
 *
 * THE CHOICE (the register offered „a gentler final leg or a closing-rate
 * detector"): the DETECTOR, and the reasoning is written out in full on
 * `SC_FOLLOW_STANDSTILL.ruleConfig` in templates-following.ts. In one line: a
 * gentler leg makes the drill easier without making it teach, the 20 km/h floor
 * is right and stays, and the lead's final metre is the constant three
 * committed traces under `content/` depict — which this lane does not own.
 *
 * What is asserted here is the outcome, not the mechanism:
 *   1. the correct drive still passes CLEAN (it must stay passable);
 *   2. the nominal non-lifting drive is now TOLD, before it hits anything;
 *   3. a queue rolling in formation is still innocent (no closing = no fault);
 *   4. above the floor the base основна still owns the act — no double bill.
 */

import { describe, expect, it } from "vitest";

import type { StagedEventSpec } from "../../contracts";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_FOLLOW_STANDSTILL } from "../../lessons/scenario/templates-following";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import { loadDistrict } from "../../world/referents";
import { recordScriptedDrive, type DriveScript } from "../recorder";
import { recordScFollowStandstillDrive } from "../scFollowStandstill";

const X = 4.06;
const LESSON = compileScenario(SC_FOLLOW_STANDSTILL, 1);
const STAGED = (LESSON.stagedEvents ?? []) as StagedEventSpec[];

interface Run {
  codes: { code: string; t: number }[];
  /** Session time the lead gap first reached zero (contact), if it did. */
  contactAtSec: number | null;
}

/** Drive the lane at a constant `kmh` with no lift — the non-reacting student. */
function driveAt(kmh: number): Run {
  const script: DriveScript = {
    steps: [
      {
        kind: "drive",
        points: [
          [X, 15],
          [X, 100],
          [X, 200],
          [X, 300],
        ],
        targetKmh: kmh,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 3, brake: true },
    ],
  };
  let contactAtSec: number | null = null;
  const rec = recordScriptedDrive(loadDistrict("fo-follow-v1"), script, {
    scenarioId: SC_FOLLOW_STANDSTILL.id,
    kind: "mistake",
    seed: 7,
    stagedEvents: STAGED,
    ruleConfig: LESSON.ruleConfig,
    maxDurationSec: 200,
    onTick: (tick) => {
      const g = tick.leadGapM;
      if (contactAtSec === null && g !== undefined && g !== null && g <= 0.05 && tick.t > 5) {
        contactAtSec = tick.t;
      }
    },
  });
  return {
    codes: rec.ruleEvents
      .filter((e) => e.kind === "violation")
      .map((e) => ({ code: e.code, t: e.t })),
    contactAtSec,
  };
}

describe("FR-B5-QUEUE — the queue drill teaches before it crashes", () => {
  it("the drill opts into the closing-rate detector, and it is OFF everywhere else", () => {
    expect(SC_FOLLOW_STANDSTILL.ruleConfig?.leadClosingEnabled).toBe(true);
    expect(DEFAULT_RULE_CONFIG.leadClosingEnabled).toBe(false);
  });

  it("the CORRECT drive still passes clean — the drill stays passable", () => {
    // The whole point of choosing the detector over a tuning change: the
    // shadow slows with the lead (instruction 2) and must never be billed for
    // doing so. This is the same tape the trace gate replays.
    const rec = recordScFollowStandstillDrive(loadDistrict("fo-follow-v1"), "shadow-correct");
    const violations = rec.ruleEvents.filter((e) => e.kind === "violation");
    expect(violations.map((e) => e.code)).toEqual([]);
    expect(rec.ruleEvents.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")).toBe(
      true,
    );
  }, 60000);

  it(
    "at the drill's OWN nominal pace the student is told — before the contact, not after",
    () => {
      const r = driveAt(20);
      const first = r.codes.find((c) => c.code === "CLOSING_ON_LEAD_TOO_FAST");
      expect(first, `codes: ${JSON.stringify(r.codes)}`).toBeDefined();
      expect(r.contactAtSec, "the non-lifting drive still reaches the queue").not.toBeNull();
      // The fault must arrive with room left to act on it. Measured: warned at
      // t = 41.0 with 8.6 m of gap in hand, contact at t = 44.1 — at 5.5 m/s
      // that gap is a 1.8 m/s² stop, i.e. a lift and a gentle brake.
      expect(first!.t).toBeLessThan(r.contactAtSec!);
      expect(r.contactAtSec! - first!.t).toBeGreaterThanOrEqual(2);
    },
    60000,
  );

  it(
    "the same drive used to end in +CLEAN_DRIVING and nothing else — it no longer can",
    () => {
      // The founder's «Основни 0 · Второстепенни 0» in one assertion: at the
      // nominal pace, SOMETHING основна or второстепенна must be on the sheet
      // before the drive reaches the queue.
      const r = driveAt(20);
      const before = r.codes.filter((c) => c.t < (r.contactAtSec ?? Infinity));
      expect(before.length, `codes: ${JSON.stringify(r.codes)}`).toBeGreaterThan(0);
    },
    60000,
  );

  it(
    "above the stop-and-go floor the base основна still owns the act — no double bill",
    () => {
      // A 25 km/h approach is ordinary tailgating and FOLLOWING_TOO_CLOSE has
      // graded it since v1. The new code must stay out of that band entirely,
      // or one act costs six points instead of three.
      const r = driveAt(25);
      const codes = r.codes.map((c) => c.code);
      expect(codes).toContain("FOLLOWING_TOO_CLOSE");
      expect(codes).not.toContain("CLOSING_ON_LEAD_TOO_FAST");
    },
    60000,
  );

  it(
    "a queue rolling in formation is innocent by construction",
    () => {
      // The reason the 20 km/h floor exists, and the reason this detector may
      // live under it: pacing the lead at ITS OWN speed keeps the gap steady,
      // the closing rate is ~0, and no closing fault can fire however small the
      // gap is. The drill's own lead cruises 5.6 m/s; follow at exactly that.
      const rec = recordScriptedDrive(loadDistrict("fo-follow-v1"), {
        steps: [
          // Sit 12 m behind the tail's HOLD pose (y = 48) and creep with it at
          // queue pace — a formation roll, never a closing approach.
          { kind: "drive", points: [[X, 15], [X, 36]], targetKmh: 8, stopAtEnd: false },
          { kind: "pause", sec: 20, brake: true },
        ],
      }, {
        scenarioId: SC_FOLLOW_STANDSTILL.id,
        kind: "mistake",
        seed: 7,
        stagedEvents: STAGED,
        ruleConfig: LESSON.ruleConfig,
        maxDurationSec: 60,
      });
      expect(
        rec.ruleEvents
          .filter((e) => e.kind === "violation")
          .map((e) => e.code),
      ).not.toContain("CLOSING_ON_LEAD_TOO_FAST");
    },
    60000,
  );
});
