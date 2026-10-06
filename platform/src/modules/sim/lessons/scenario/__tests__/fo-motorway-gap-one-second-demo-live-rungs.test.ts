/**
 * sc-fo-motorway-gap:11e56254 [major] — «the lesson's own mistake demo does not
 * commit the mistake it is named for».
 *
 * THE ROW. The committed «mistake-one-second» demo («Една секунда зад водещия
 * при 130»), driven through the LIVE rung chain at the live L1/L3/L4 seeds,
 * kept a minimum gap of 43.6-44.0 m at 122.6 км/ч against the engine's 42.9 m
 * FOLLOWING_TOO_CLOSE fire line there (≈ 1.18 s, not one second), and its
 * under-the-line stretch lasted 1.58-1.72 s against the 2 s sustain — so it
 * billed NOTHING. It billed only under the recorder's seed 7 and the L2 seed.
 * A student shown it as «the mistake» saw a drive the product does not grade.
 *
 * THE FIRE LINE IS THE ENGINE'S, read here from the rung's own rule config
 * (DEFAULT_RULE_CONFIG + lesson.ruleConfig, the merge `lessons/engine.ts`
 * hands `createRuleEngine`) and the formula in rules/engine.ts:
 *   tailgating ⇔ speed ≥ followMinSpeedKmh ∧ gap < max(followMinGapM,
 *     v·followSafeSeconds)·followFireRatio ∧ gap not opening ≥
 *     followRecoveryRateMps, held followSustainSec.
 * At 122.6 км/ч that is 42.9 m (1.26 s). Nothing below hard-codes 42.9.
 *
 * WHAT IS ASSERTED, at EVERY rung L1-L5 under its live seed, through BOTH live
 * chains (driveLiveRung — the authored script under the compiled rung; and
 * liveChainReplay — the COMMITTED trace a student is shown, pose by pose,
 * through LessonScene's stack):
 *   · the gap the demo SETTLES at (the 122 км/ч hold) is below the fire line
 *     by ≥ MARGIN_M and reads as about one second (0.9-1.1 s);
 *   · the under-the-line stretch outlasts the sustain by ≥ 2 s;
 *   · FOLLOWING_TOO_CLOSE is billed exactly ONCE for the one act — taught on
 *     first encounter (ruling 16) and folded as the lesson's own mistake with
 *     the lesson NOT taken (Ruling A) on the practice rungs; on the изпитен
 *     лист as основна (3 т.) at the ADR-009-exempt exam rung L4;
 *   · no COLLISION, no staged resolution, and the lead never brakes: the demo
 *     still ends BEFORE the slam — its fault is the gap, nothing else;
 *   · on the dry rungs that is the ONLY code (no speed code carries it);
 *   · the correct shadow stays clean on the dry rungs and is never billed a gap.
 *
 * KILL-CHECKS: see the lane report (each sabotage reddens an assertion here).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG, type SimTick } from "../../../rules";
import { parseScenarioTrace } from "../../../traces/parse";
import {
  recordScFoMotorwayGapDrive,
  scFoMotorwayGapMistakeOneSecondScript,
  scFoMotorwayGapShadowScript,
} from "../../../traces/scFoMotorwayGap";
import type { ScenarioTrace } from "../../../traces/types";
import { compileScenario } from "../compile";
import { SC_FO_MOTORWAY_GAP } from "../templates-following2";
import { liveChainReplay } from "./liveChainReplay";
import { driveLiveRung, loadDistrict } from "./witnessLiveRung";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RUNGS = [1, 2, 3, 4, 5] as const;
type Rung = (typeof RUNGS)[number];

/** Metres the settled gap must sit under the engine's fire line. */
const MARGIN_M = 6;
/** Seconds the under-the-line stretch must outlast the engine's sustain. */
const SUSTAIN_MARGIN_SEC = 2;
const FTC = "FOLLOWING_TOO_CLOSE";

function loadCommittedTrace(name: string): ScenarioTrace {
  const raw = JSON.parse(
    readFileSync(
      path.join(REPO_ROOT, "content", "traces", SC_FO_MOTORWAY_GAP.id, `${name}.trace.json`),
      "utf-8",
    ),
  ) as unknown;
  const t = parseScenarioTrace(raw);
  if (!t) throw new Error(`${name}: committed trace does not parse`);
  return t;
}

function ruleCfg(level: Rung) {
  const lesson = compileScenario(SC_FO_MOTORWAY_GAP, level);
  return { ...DEFAULT_RULE_CONFIG, ...(lesson.ruleConfig ?? {}) };
}

interface GapRead {
  /** Gap and speed at the closest point of the 120-125 км/ч hold (the settled «one second»). */
  settledGapM: number;
  settledKmh: number;
  /** The engine's fire line at that speed, m. */
  fireLineM: number;
  settledSec: number;
  /** Longest unbroken run under the fire line, s (the engine's own condition). */
  longestUnderSec: number;
  /** Slowest the lead is seen to travel once both cars are at motorway pace (car ≥ 115 км/ч), m/s. */
  minLeadMps: number;
}

function readGap(ticks: readonly SimTick[], cfg: typeof DEFAULT_RULE_CONFIG): GapRead {
  const line = (kmh: number) =>
    Math.max(cfg.followMinGapM, (kmh / 3.6) * cfg.followSafeSeconds) * cfg.followFireRatio;
  let settledGapM = Infinity;
  let settledKmh = 0;
  let longest = 0;
  let since: number | null = null;
  let prev: SimTick | null = null;
  for (const tk of ticks) {
    const kmh = Math.abs(tk.speedKmh);
    const g = tk.leadGapM;
    const has = g !== undefined && g !== null && Number.isFinite(g);
    const opening =
      has && prev && prev.leadGapM != null && tk.t > prev.t ? (g - prev.leadGapM) / (tk.t - prev.t) : 0;
    const under = has && kmh >= cfg.followMinSpeedKmh && g < line(kmh) && opening < cfg.followRecoveryRateMps;
    if (under) {
      if (since === null) since = tk.t;
      longest = Math.max(longest, tk.t - since);
    } else since = null;
    if (has && kmh >= 120 && kmh <= 125 && g < settledGapM) {
      settledGapM = g;
      settledKmh = kmh;
    }
    prev = tk;
  }
  // The lead's own speed, from the gap's rate over 0.5 s windows (it is not on the tick).
  // Only once the car is at motorway pace: below that the lead is still matching
  // the car's own acceleration (cruise cap 34 m/s), which is not a brake.
  let minLeadMps = Infinity;
  for (let i = 30; i < ticks.length; i++) {
    const a = ticks[i - 30];
    const b = ticks[i];
    if (a.leadGapM == null || b.leadGapM == null) continue;
    if (Math.abs(a.speedKmh) < 115 || Math.abs(b.speedKmh) < 115 || b.t <= a.t) continue;
    const vPlayer = (Math.abs(a.speedKmh) + Math.abs(b.speedKmh)) / 2 / 3.6;
    minLeadMps = Math.min(minLeadMps, vPlayer + (b.leadGapM - a.leadGapM) / (b.t - a.t));
  }
  return {
    settledGapM,
    settledKmh,
    fireLineM: line(settledKmh),
    settledSec: settledGapM / (settledKmh / 3.6),
    longestUnderSec: longest,
    minLeadMps,
  };
}

function expectGapIsTheMistake(r: GapRead, cfg: typeof DEFAULT_RULE_CONFIG, where: string) {
  expect(Number.isFinite(r.settledGapM), `${where}: never settled at the 122 км/ч hold behind the lead`).toBe(
    true,
  );
  expect(
    r.settledGapM,
    `${where}: settled gap vs the engine's fire line ${r.fireLineM.toFixed(2)} m`,
  ).toBeLessThanOrEqual(r.fireLineM - MARGIN_M);
  // «Една секунда» — the title's own number, not a bumper ride (that is the other demo).
  expect(r.settledSec, `${where}: settled time gap`).toBeGreaterThanOrEqual(0.9);
  expect(r.settledSec, `${where}: settled time gap`).toBeLessThanOrEqual(1.1);
  expect(
    r.longestUnderSec,
    `${where}: under-the-line stretch vs the ${cfg.followSustainSec} s sustain`,
  ).toBeGreaterThanOrEqual(cfg.followSustainSec + SUSTAIN_MARGIN_SEC);
  // The lead never brakes in this demo (its staged brake is the OTHER demo's).
  expect(r.minLeadMps, `${where}: the lead braked inside the one-second demo`).toBeGreaterThan(30);
}

const district = loadDistrict("mw-v1");
const committed = loadCommittedTrace("mistake-one-second");

describe("sc-fo-motorway-gap:11e56254 — «Една секунда» commits its mistake at every live rung (driveLiveRung)", () => {
  for (const level of RUNGS) {
    it(`L${level}: settles about one second back, under the fire line with margin, and is billed FOLLOWING_TOO_CLOSE exactly once`, () => {
      const cfg = ruleCfg(level);
      const o = driveLiveRung(SC_FO_MOTORWAY_GAP, level, scFoMotorwayGapMistakeOneSecondScript());
      expectGapIsTheMistake(readGap(o.ticks, cfg), cfg, `L${level} script`);

      const occurrences =
        o.scored.filter((c) => c === FTC).length + o.coached.filter((c) => c === FTC).length;
      expect(occurrences, `L${level}: one act, one bill (scored ${o.scored} / coached ${o.coached})`).toBe(1);
      expect(o.scored).not.toContain("COLLISION");
      expect(o.coached).not.toContain("COLLISION");
      expect(o.drive.outcomes, `L${level}: the demo must end before the staged brake`).toEqual([]);
      if (level !== 5) {
        // Dry rungs: the gap is the ONLY fault — no speed code can stand in for it.
        expect([...new Set([...o.scored, ...o.coached])]).toEqual([FTC]);
      }

      if (level === 4) {
        // The exam rung (ADR-009-exempt by ruling): основна on the изпитен лист.
        expect(o.lesson.examMode).toBe(true);
        expect(o.taught).toEqual([]);
        const billed = o.result.summary.mistakes.filter((m) => m.code === FTC);
        expect(billed.length).toBe(1);
        expect(billed[0].points).toBe(3);
      } else {
        // Ruling 16: taught on first encounter, never charged. Ruling A: the
        // lesson's own mistake, named, and the lesson is not taken.
        expect(o.coached).toContain(FTC);
        expect(o.scored).not.toContain(FTC);
        if (level !== 5) expect(o.taught).toContain(FTC);
        expect((o.result.lessonMistakes ?? []).map((h) => h.code)).toContain(FTC);
        expect(o.result.passed).toBe(false);
      }
    });
  }
});

/** The staged lead, read from the template (single truth). */
const LEAD = SC_FO_MOTORWAY_GAP.staged!.find((s) => s.id === "sc-fmg-lead") as {
  id: string;
  cutAt: { x: number; y: number };
  cutRadiusM: number;
  minCutSpeedKmh: number;
  maxMatchSpeedMps: number;
};

describe("sc-fo-motorway-gap:11e56254 — the demo pose by pose through LessonScene's stack (liveChainReplay)", () => {
  // The COMMITTED trace is what a student is shown; the fresh recording of the
  // script is what the next re-record would commit. Both must hold.
  const sources: Array<[string, ScenarioTrace]> = [
    ["committed", committed],
    ["script", recordScFoMotorwayGapDrive(district, "mistake-one-second").trace],
  ];
  for (const level of RUNGS) {
    for (const [label, trace] of sources) {
      it(`L${level} (${label}): billed FOLLOWING_TOO_CLOSE once, under the line with margin, no contact, the lead never brakes`, () => {
        const cfg = ruleCfg(level);
        const lesson = compileScenario(SC_FO_MOTORWAY_GAP, level);
        const ticks: SimTick[] = [];
        // The lead's own state, read off the live traffic system every frame.
        let leadYWhileArmable = -Infinity;
        let leadAtCap = false;
        let leadMinMpsAfterCap = Infinity;
        const r = liveChainReplay({
          lesson,
          districtRaw: district,
          trace,
          beforeApply: (c) => {
            ticks.push(c.tick);
            const lead = c.traffic.staged(LEAD.id);
            if (!lead) return;
            // Only while the car DRIVES fast enough to arm the staged brake: in
            // the closing pause the car is at rest and the lead, still pacing
            // it, eases off (to ~29 m/s) — that is the pacer, not the brake.
            if (Math.abs(c.tick.speedKmh) < LEAD.minCutSpeedKmh) return;
            leadYWhileArmable = Math.max(leadYWhileArmable, lead.y);
            if (lead.speedMps >= LEAD.maxMatchSpeedMps - 0.1) leadAtCap = true;
            if (leadAtCap) leadMinMpsAfterCap = Math.min(leadMinMpsAfterCap, lead.speedMps);
          },
        });
        expectGapIsTheMistake(readGap(ticks, cfg), cfg, `L${level} ${label}`);
        // The demo ends BEFORE the slam: while the car is fast enough to arm the
        // staged brake, the lead never reaches its brake point and never slows.
        expect(leadYWhileArmable, `L${level} ${label}: lead reached its staged brake`).toBeLessThan(
          LEAD.cutAt.y - LEAD.cutRadiusM,
        );
        expect(leadAtCap).toBe(true);
        expect(leadMinMpsAfterCap, `L${level} ${label}: the lead slowed`).toBeGreaterThan(
          LEAD.maxMatchSpeedMps - 0.5,
        );
        const coached = (r.result.coachedMistakes ?? []).map((c) => c.code);
        const occurrences =
          r.violationCodes.filter((c) => c === FTC).length + coached.filter((c) => c === FTC).length;
        expect(occurrences, `L${level}: viol ${r.violationCodes} / coached ${coached}`).toBe(1);
        expect(r.violationCodes).not.toContain("COLLISION");
        expect(r.outcomes).toEqual([]);
        expect(r.ambientContacts).toEqual([]);
        if (level === 4) expect(r.violationCodes).toContain(FTC);
        else {
          expect(coached).toContain(FTC);
          expect((r.result.lessonMistakes ?? []).map((h) => h.code)).toContain(FTC);
        }
      });
    }
  }
});

describe("sc-fo-motorway-gap:11e56254 — the correct shadow stays clean (no gap is ever billed)", () => {
  for (const level of RUNGS) {
    it(`L${level}: shadow-correct holds above the fire line and is billed no following code`, () => {
      const cfg = ruleCfg(level);
      const o = driveLiveRung(SC_FO_MOTORWAY_GAP, level, scFoMotorwayGapShadowScript());
      const all = [...o.scored, ...o.coached];
      expect(all).not.toContain(FTC);
      expect(all).not.toContain("FOLLOWING_TOO_CLOSE_FOR_RAIN");
      expect(all).not.toContain("COLLISION");
      if (level !== 5) {
        expect(o.scored).toEqual([]);
        expect(o.coached).toEqual([]);
        expect(o.result.passed).toBe(true);
      }
      expect(readGap(o.ticks, cfg).longestUnderSec).toBe(0);
    });
  }
});
