/**
 * sc-follow-tailgater:63c0c28c clause C2a — THE rig-w3b DRIVES, REPLAYED IN PROCESS (lane tailbrake3, round 2,
 * integrator decision 2026-10-11).
 *
 * WHAT THE RIG PHOTOGRAPHED (59be0de, D:/knijka-lanes/scratch/rig-w3b/sc-follow-tailgater/attempts/
 * pc-L3-TTF25-2026-10-10T0159): a full-pedal brake check from 24.48 км/ч at L3 with task 1 ticked and the лепка glued
 * 4.79 m behind (bumper to bumper). The лепка braked at a 9.22 m/s² peak and then pulled out. No `followerBraked`
 * report, no HARSH_BRAKING_NO_CAUSE, «ИЗДЪРЖАН» ★★★ and «Чисто и спокойно каране».
 *
 * THE CAUSE (measured in round 1 by replaying the rig's own per-grid poses, the fixture beside this file). Not the
 * follower's account — that reads the лепка on every glued grid point. Its PASS was a pure timer
 * (`RearTailgaterRunner`: `tSec − latchedAt >= pressureSec`): latched at 17.0833 s, a seeded 12.0263 s of pressure,
 * so due on the grid point 29.1167 s — 0.267 s after his pedal at 28.85 s, with the лепка braking at 9.2 m/s² for
 * him. The timer handed it to the cruise law: it accelerated at 3.5 m/s² toward a car stopping 4.8 m ahead, and its
 * hard brake stood at 0.25 s at the harsh line — under the product's 0.4 s sustain — so nothing was reported and the
 * 35 км/ч floor acquitted the brake check.
 *
 * THE DECISION, AND WHAT THIS FILE PINS. A due pass now waits while the лепка is still in a hard brake it has not
 * been reported for: from its first reading at the harsh line until the product's own harsh step reports that brake
 * or the brake is over, its reading under the braking line for the product's own sustain (`ownHardBrakeHoldsThePass`;
 * round 5 — round 2 held it only on grid points whose reading was AT the line, round 3 only while that step's window
 * was open and round 4 only until its first reading under the braking line, which are the same thing on the rig's
 * steady full pedal and are not on an uneven one: follow-tailgater-uneven-brake-check.test.ts). On the three rig drives:
 *   · TTF25 (24.48 км/ч, glued) — its pass begins 0.45 s after his pedal instead of 0.28 s; the лепка holds the harsh
 *     line for the sustain and reports at 29.2833 s; the brake check is the lesson's own mistake through the EXISTING
 *     rule, in the very words the 31.7 км/ч brake check gets (TTF323's debrief, byte for byte). No longer the rig's
 *     sheet — that is the repair;
 *   · TASF348 (34.19 км/ч, tasks first, L1) — its pass had begun 0.067 s BEFORE his pedal: the лепка was already
 *     pulling out and never brakes. Unbilled, as the rig showed it. This is integrator decision F2's own case
 *     («already pulling out, not braking») and it is pinned here as intended;
 *   · TTF323 (31.68 км/ч, glued, the timer a second away) — reported at 28.35 s and billed, as the rig showed it.
 * And the F2 cell L5 25 км/ч y120, which round 1 measured as TTF25's twin (two grid steps apart, both acquitted),
 * now gets TTF25's answer.
 *
 * The oracle for «what the лепка did» is computed HERE from its pose and speed as the traffic system publishes them
 * (the product's `stepHarshBrakeTrack` on the engine's defaults, its reading window warm from 1 s before the pedal),
 * never from anything the runner publishes.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";
import { tailgaterTape } from "./tailgaterTape";
import { BRAKING_LINE_MPS2, newHarshBrakeTrack, stepHarshBrakeTrack } from "../../../rules/harshBrakeEpisode";
import { DEFAULT_RULE_CONFIG } from "../../../rules";
import { obbSeparationM, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "../../../collision";
import { vehicleHalfLengthM, vehicleHalfWidthM } from "../../../traffic/types";
import type { RearTailgaterSpec, StagedEventSpec } from "../../../contracts";
import type { ScenarioTrace, TraceEvent, TraceSample } from "../../../traces/types";

const REPO_ROOT = path.join(process.cwd(), "..");
const LN = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
const RIG = JSON.parse(readFileSync(path.join(__dirname, "follow-tailgater-rig-w3b.fixture.json"), "utf-8")) as {
  drives: Record<
    string,
    {
      level: number;
      pedalT: number;
      onsetKmh: number;
      /** [t, x, y, headingDeg, speedKmh, gear, brake, throttle] per 1/60 s grid point. */
      rows: number[][];
      looks: Array<{ t: number; kind: TraceEvent["kind"] }>;
      tailgater: { followerReports: Array<{ t: number }> };
      rigHarsh: Array<{ t: number }>;
      rigVerdict: string;
    }
  >;
};
const TAIL_ID = "sc-ftg-tail";
const GRID_STEP = 1 / 60;
const SUSTAIN = DEFAULT_RULE_CONFIG.harshBrakeSustainSec;
const HARSH = DEFAULT_RULE_CONFIG.harshBrakeDecelMps2;
const CLEAN = "Чисто и спокойно каране";
const TIMEOUT = 600_000;

/** The rig drive as a pose tape: at rest on the spawn from t 0, then the rig's own grid points. */
function rigTape(cell: string): ScenarioTrace {
  const d = RIG.drives[cell];
  const at = (r: number[], t: number, v: number): TraceSample => ({
    tSec: t,
    x: r[1],
    y: r[2],
    headingDeg: r[3],
    steerRad: 0,
    speedKmh: v,
    gear: r[5],
    indicator: "off",
    brakeOn: r[6] > 0,
    throttleOn: r[7] > 0,
  });
  const samples: TraceSample[] = [at(d.rows[0], 0, 0)];
  for (const r of d.rows) if (r[0] > samples[samples.length - 1].tSec + 1e-9) samples.push(at(r, r[0], r[4]));
  return {
    meta: { scenarioId: SC_FOLLOW_TAILGATER.id, kind: "attempt", version: 1, durationSec: samples[samples.length - 1].tSec },
    samples,
    events: d.looks.map((l) => ({ tSec: l.t, kind: l.kind })),
  };
}

interface Drive {
  out: LiveReplayOutcome;
  /** When the product's own account reported the лепка's hard brake, s. */
  reportsAt: number[];
  harsh: Array<{ t: number; charged: boolean }>;
  /** ORACLE — the лепка around his pedal, from its published pose and speed. */
  follower: {
    /** On its lane line behind him on the grid point of the pedal. */
    onItsLineAtPedal: boolean;
    /** Its pass began (the first grid point it is off its lane line) this long after the pedal, s — NEGATIVE when
     *  it had begun before it; null when it never began. */
    passStartAfterPedalSec: number | null;
    /** The product's harsh step over its speed while still on its line, from 1 s before the pedal: the accrued
     *  qualifying time, the speed it shed after the pedal, and whether the step ever called the brake harsh. */
    behindQualifiedSec: number;
    behindShedMps: number;
    behindHarsh: boolean;
    /** Its deceleration over its last grid step on its line after the pedal, m/s² (0: it left before the pedal). */
    lastBehindDecelMps2: number;
    /** Its strongest deceleration over one grid step in the 8 s from the pedal, m/s². */
    peakDecelMps2: number;
    /** The closest its body came to his in the 8 s from the pedal, m (box to box). */
    minBodySepM: number;
    /** Its speed on the grid point of the pedal and on the grid point its pass began, m/s. */
    speedAtPedalMps: number | null;
    speedAtPassMps: number | null;
  };
}

function drive(level: ScenarioLevel, trace: ScenarioTrace, pedalT: number): Drive {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, level);
  const tg = ((lesson.stagedEvents ?? []) as StagedEventSpec[]).find((s): s is RearTailgaterSpec => s.kind === "rearTailgater")!;
  const track = newHarshBrakeTrack();
  let ref: number | null = null;
  let prev: { t: number; v: number } | null = null;
  let onItsLineAtPedal = false;
  let seenPedal = false;
  let passStart: number | null = null;
  let qualified = 0;
  let shed = 0;
  let fired = false;
  let lastDecel = 0;
  let peak = 0;
  let minSep = Infinity;
  let speedAtPedal: number | null = null;
  let speedAtPass: number | null = null;
  const reportsAt: number[] = [];
  const out = liveChainReplay({
    lesson,
    districtRaw: LN,
    trace,
    afterApply: ({ t, tick, traffic }) => {
      for (const e of tick.events) if (e.kind === "followerBraked") reportsAt.push(t);
      const a = traffic.staged(TAIL_ID);
      if (!a) return;
      const decel = prev === null ? 0 : (prev.v - a.speedMps) / (t - prev.t);
      prev = { t, v: a.speedMps };
      if (passStart === null && Math.abs(a.lateralOffsetM ?? 0) > 1e-6) {
        passStart = t;
        speedAtPass = a.speedMps;
      }
      const afterPedal = t >= pedalT - 1e-9;
      if (afterPedal && !seenPedal) {
        seenPedal = true;
        onItsLineAtPedal = passStart === null && tick.position.y > a.y;
        speedAtPedal = a.speedMps;
      }
      if (afterPedal && t <= pedalT + 8) {
        peak = Math.max(peak, decel);
        minSep = Math.min(
          minSep,
          obbSeparationM(
            { x: tick.position.x, y: tick.position.y, headingDeg: tick.headingDeg, halfLengthM: PLAYER_HALF_LENGTH_M, halfWidthM: PLAYER_HALF_WIDTH_M },
            {
              x: a.x,
              y: a.y,
              headingDeg: (Math.atan2(a.dirX, a.dirY) * 180) / Math.PI,
              halfLengthM: vehicleHalfLengthM(tg.actor.profile),
              halfWidthM: vehicleHalfWidthM(tg.actor.profile),
            },
          ),
        );
      }
      // The harsh step, while the car is still on its line: warm from 1 s before the pedal.
      if (passStart !== null || t < pedalT - 1 || t > pedalT + 3) return;
      if (ref === null) ref = a.speedMps;
      if (stepHarshBrakeTrack(track, t, ref - a.speedMps, DEFAULT_RULE_CONFIG) !== null && afterPedal) fired = true;
      if (!afterPedal) return;
      lastDecel = decel;
      qualified = track.qualifiedSec;
      shed = speedAtPedal! - a.speedMps;
    },
  });
  const harsh = [
    ...(out.result.coachedMistakes ?? [])
      .filter((c) => c.code === "HARSH_BRAKING_NO_CAUSE")
      .map((c) => ({ t: c.t, charged: false })),
    ...out.session.events
      .filter((e) => e.kind === "violation" && e.code === "HARSH_BRAKING_NO_CAUSE")
      .map((e) => ({ t: (e as { t: number }).t, charged: true })),
  ];
  return {
    out,
    reportsAt,
    harsh,
    follower: {
      onItsLineAtPedal,
      passStartAfterPedalSec: passStart === null ? null : passStart - pedalT,
      behindQualifiedSec: qualified,
      behindShedMps: shed,
      behindHarsh: fired,
      lastBehindDecelMps2: lastDecel,
      peakDecelMps2: peak,
      minBodySepM: minSep,
      speedAtPedalMps: speedAtPedal,
      speedAtPassMps: speedAtPass,
    },
  };
}

describe("sc-follow-tailgater · the rig-w3b drives replayed in process: the лепка's pass waits for its own hard brake (63c0c28c C2a)", () => {
  const rig = Object.fromEntries(
    Object.keys(RIG.drives).map((cell) => [cell, drive(RIG.drives[cell].level as ScenarioLevel, rigTape(cell), RIG.drives[cell].pedalT)]),
  ) as Record<string, Drive>;
  const TTF25 = rig["pc-L3-TTF25"];
  const TASF348 = rig["pc-L1-TASF348"];
  const TTF323 = rig["pc-L3-TTF323"];

  it(
    "the two drives the repair does not touch are still the rig's own sheets, to the report time — the tasks-first drive acquitted, TTF323 billed",
    () => {
      for (const cell of ["pc-L1-TASF348", "pc-L3-TTF323"]) {
        const d = rig[cell];
        const r = RIG.drives[cell];
        expect(d.reportsAt.length, cell).toBe(r.tailgater.followerReports.length);
        d.reportsAt.forEach((t, i) => expect(t, cell).toBeCloseTo(r.tailgater.followerReports[i].t, 6));
        expect(d.harsh.length, cell).toBe(r.rigHarsh.length);
        // ONE GRID POINT EARLIER on TTF323 (brakeledger, 2026-10-18, `sc-follow-tailgater:a31d9216`): the rig drove it
        // at 59be0de, where the student's ledger asked «held for the sustain?» with a bare `>=`, and its accrual of
        // exactly 24 grid points summed under 0.4 there; with the step's tie rule (`heldFor`) the same brake is held
        // on that 24th point and the bill lands 1/60 s sooner. Same bill, same verdict.
        const tieShift = cell === "pc-L3-TTF323" ? 1 / 60 : 0;
        d.harsh.forEach((h, i) => expect(Math.abs(h.t - (r.rigHarsh[i].t - tieShift)), cell).toBeLessThan(0.001 + 1e-9));
        expect(d.out.result.passed, cell).toBe(r.rigVerdict === "ИЗДЪРЖАН");
      }
      expect(TTF323.harsh.map((h) => h.charged)).toEqual([false]);
      expect((TTF323.out.result.lessonMistakes ?? []).map((m) => m.code)).toEqual(["HARSH_BRAKING_NO_CAUSE"]);
      // TTF323's лепка was glued with its pass a second away: nothing of the timer's was in its brake.
      expect(TTF323.follower.onItsLineAtPedal).toBe(true);
      expect(TTF323.follower.passStartAfterPedalSec!).toBeGreaterThan(0.9);
    },
    TIMEOUT,
  );

  it(
    "TTF25 — the antecedent is the rig's: under the floor at the pedal, the лепка glued on its line 4.8 m behind his bumper, and the rig showed «ИЗДЪРЖАН» with no report",
    () => {
      const r = RIG.drives["pc-L3-TTF25"];
      expect(r.onsetKmh).toBeLessThan(DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh);
      expect(r.onsetKmh).toBeCloseTo(24.48, 1);
      expect(r.rigVerdict).toBe("ИЗДЪРЖАН");
      expect(r.tailgater.followerReports).toEqual([]);
      expect(r.rigHarsh).toEqual([]);
      expect(TTF25.follower.onItsLineAtPedal).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "TTF25 — the pass no longer begins 0.28 s after his pedal, mid-brake: it waits, the лепка holds the harsh line for the 0.4 s sustain behind him and reports, and only then pulls out — slower, and never closer than 4.3 m",
    () => {
      const f = TTF25.follower;
      // Base 2e9268f: +0.2833 s, 0.25 s at the line, 2.30 m/s shed, no report. Now:
      expect(f.passStartAfterPedalSec!).toBeGreaterThanOrEqual(SUSTAIN);
      expect(f.passStartAfterPedalSec!).toBeCloseTo(0.45, 2);
      expect(f.behindHarsh).toBe(true);
      expect(f.behindQualifiedSec).toBeGreaterThanOrEqual(SUSTAIN - 1e-9);
      expect(f.behindShedMps).toBeGreaterThanOrEqual(HARSH * SUSTAIN);
      expect(f.peakDecelMps2).toBeGreaterThan(9);
      // The product's own account: one report, 0.433 s after the pedal, before the car has left its line.
      expect(TTF25.reportsAt).toHaveLength(1);
      expect(TTF25.reportsAt[0]!).toBeCloseTo(29.2833, 3);
      expect(TTF25.reportsAt[0]!).toBeLessThan(RIG.drives["pc-L3-TTF25"].pedalT + f.passStartAfterPedalSec!);
      // It pulls out having shed the harsh amount (base: at 4.55 m/s, from 6.86), and it stays clear of him:
      // base came within 3.94 m of his body while accelerating at him; now 4.37 m.
      expect(f.speedAtPedalMps! - f.speedAtPassMps!).toBeGreaterThanOrEqual(HARSH * SUSTAIN);
      expect(f.speedAtPassMps!).toBeLessThan(3.5);
      expect(f.minBodySepM).toBeGreaterThan(4.3);
    },
    TIMEOUT,
  );

  it(
    "TTF25 — so the brake check is the lesson's own mistake through the existing rule: coached once at the stop, «НЕ Е ВЗЕТ», no «Чисто и спокойно каране», and the very debrief the 31.7 км/ч brake check reads",
    () => {
      expect(TTF25.harsh).toHaveLength(1);
      expect(TTF25.harsh[0].charged).toBe(false); // ruling 16 / Ruling A: the lesson's own mistake, first time
      const pedalT = RIG.drives["pc-L3-TTF25"].pedalT;
      expect(TTF25.harsh[0].t).toBeGreaterThanOrEqual(TTF25.reportsAt[0]!);
      expect(TTF25.harsh[0].t).toBeLessThan(pedalT + 0.5);
      expect((TTF25.out.result.lessonMistakes ?? []).map((m) => ({ code: m.code, charged: m.charged }))).toEqual([
        { code: "HARSH_BRAKING_NO_CAUSE", charged: false },
      ]);
      expect(TTF25.out.violationCodes).toEqual([]);
      expect(TTF25.out.result.passed).toBe(false);
      expect(TTF25.out.commendationCodes).not.toContain("CLEAN_DRIVING");
      expect(TTF25.out.debrief).not.toContain(CLEAN);
      // THEO-4: named and explained by the catalogue's own copy — no new sentence: it is TTF323's debrief.
      expect(TTF25.out.debrief).toContain("Рязко спиране без причина");
      expect(TTF25.out.debrief).toMatch(/Грешк(ата|ите) на този урок/);
      expect(TTF25.out.debrief).toBe(TTF323.out.debrief);
    },
    TIMEOUT,
  );

  it(
    "the tasks-first L1 drive is integrator decision F2's own case and stays UNBILLED: the лепка's pass began before his pedal — it is pulling out and never brakes",
    () => {
      const f = TASF348.follower;
      expect(RIG.drives["pc-L1-TASF348"].onsetKmh).toBeLessThan(DEFAULT_RULE_CONFIG.harshBrakeMinSpeedKmh);
      // Already off its line when he braked: 0.067 s (four grid points) into its pass.
      expect(f.passStartAfterPedalSec!).toBeLessThan(0);
      expect(f.passStartAfterPedalSec!).toBeCloseTo(-0.0667, 3);
      expect(f.onItsLineAtPedal).toBe(false);
      // Not braking — for him or at all — in the 8 s from his pedal.
      expect(f.peakDecelMps2).toBeLessThan(BRAKING_LINE_MPS2);
      expect(f.behindHarsh).toBe(false);
      expect(TASF348.reportsAt).toEqual([]);
      expect(TASF348.harsh).toEqual([]);
      expect(TASF348.out.result.lessonMistakes ?? []).toEqual([]);
      expect(TASF348.out.violationCodes).toEqual([]);
      expect(TASF348.out.result.passed).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "TTF25's twin, the F2 cell L5 25 км/ч y120 (two grid steps from it on base, both acquitted), now gets TTF25's answer",
    () => {
      const tr = tailgaterTape({ cruiseKmh: 25, holdKmh: 25, easeFromY: 2000, brakeAtY: 120, act: "slam" });
      const twin = drive(5, tr, tr.brakeOnsetSec!);
      const a = TTF25.follower;
      const b = twin.follower;
      expect(b.onItsLineAtPedal).toBe(true);
      expect(b.passStartAfterPedalSec!).toBeGreaterThanOrEqual(SUSTAIN);
      // Still twins: the pass within two grid steps of each other, the brake behind him the same hard brake.
      expect(Math.abs(b.passStartAfterPedalSec! - a.passStartAfterPedalSec!)).toBeLessThanOrEqual(2 * GRID_STEP + 1e-9);
      expect(b.behindHarsh).toBe(true);
      expect(twin.reportsAt).toHaveLength(1);
      expect(twin.harsh.map((h) => h.charged)).toEqual(TTF25.harsh.map((h) => h.charged));
      expect((twin.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`)).toEqual(
        (TTF25.out.result.lessonMistakes ?? []).map((m) => `${m.code}:${m.charged}`),
      );
      expect(twin.out.result.passed).toBe(false);
    },
    TIMEOUT,
  );
});
