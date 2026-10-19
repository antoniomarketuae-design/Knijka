/**
 * THE HARSH-BRAKE LEDGER THROUGH THE LIVE RUNG CHAIN — the two rows of the
 * brakeledger lane (2026-10-18), on the drives the 2026-10-17 triage measured.
 * The reducer halves are `rules/__tests__/harsh-brake-sustain-tie.test.ts` and
 * `rules/__tests__/floored-brake-withholds-praise.test.ts`.
 *
 * ROW A — `sc-follow-tailgater:a31d9216` (the tie rule). Four of the tailbrake3
 * round-3 verifier's «rw» drives at the лепка, 24.5 км/ч, L3: the follower
 * reported that it had to brake HARD (`followerBraked`, judged by
 * `isHarshBrakeWindow`, which holds an exact 0.4 s), while the student's own
 * ledger summed the same 24 grid points to 0.39999999999999858 and called it
 * short — two of them on the bill (no floored record, so the floor-lift had
 * nothing to bill) and two on the re-anchor (re-opened at 25 points, accrual
 * ending at 0.3833). At e58f388 every one was «ИЗДЪРЖАН» with «Чисто и
 * спокойно каране». Both ledgers now share `heldFor`: each is the lesson's own
 * mistake, coached on the report's frame (Ruling A), and the lesson is not
 * passed.
 *
 * ROW B — `sc-follow-tailgater:e47a45c1` (the floored praise). A causeless,
 * emergency-grade brake from under 35 км/ч is FLOORED: billed nothing,
 * rightly. At e58f388 it was then praised — «Чисто и спокойно каране» minted
 * from the 250 m holding it, the «Браво» toast and the debrief line. Measured
 * at e58f388 and pinned below as the base column: case A (no follower, L4)
 * CLEAN_DRIVING at 30.53 / 30.60 s; the 14 «before the line» drives with the
 * лепка at L3/L4 at 31.35–31.55 s; and a REAL follower-less lesson, the
 * harsh-brake lesson itself (sc-sp-harsh-brake, L1–L5), its own phantom slam
 * driven from 25 / 30 / 33 км/ч: CLEAN_DRIVING at 36.67 / 33.13 / 31.52 s.
 * Now none of them is minted. Nothing is billed, scored or failed by it.
 *
 * NOT CHANGED HERE (founder question 10, open): the headline over a floored
 * stop. The controls keep base's praise to the frame.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_FOLLOW_TAILGATER } from "../templates-following";
import { SC_SP_HARSH_BRAKE } from "../templates-sp";
import type { ScenarioLevel } from "../types";
import { liveChainReplay } from "./liveChainReplay";
import { pedalTape, stabTape } from "./brakeLedgerTapes";
import type { LessonSpec, StagedEventSpec } from "../../../contracts";
import type { ScenarioTrace } from "../../../traces/types";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";

const REPO_ROOT = path.join(process.cwd(), "..");
const LN = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "ln-v1.json"), "utf-8"));
const SP = JSON.parse(readFileSync(path.join(REPO_ROOT, "content", "world", "sp-creep-v1.json"), "utf-8"));
const G = 1 / 60;
const CLEAN_LINE = "Чисто и спокойно каране";

interface Drive {
  harsh: number[];
  violations: string[];
  coached: string[];
  passed: boolean;
  clean: number[];
  toasts: number[];
  floored: number[];
  reports: number[];
  passCmdT: number | null;
  debrief: string;
}

function replay(lesson: LessonSpec, raw: unknown, trace: ScenarioTrace): Drive {
  const floored: number[] = [];
  const toasts: number[] = [];
  const reports: number[] = [];
  let passCmdT: number | null = null;
  const out = liveChainReplay({
    lesson,
    districtRaw: raw,
    trace,
    afterApply: ({ t, tick, step, traffic }) => {
      for (const e of tick.events) if (e.kind === "followerBraked") reports.push(t);
      if (step.state.rules.harshBrake.flooredAt === t) floored.push(t);
      for (const ev of step.hudEvents as Array<Record<string, unknown>>) {
        const e = (ev as { event?: Record<string, unknown> }).event ?? ev;
        if (e.kind === "commendation" && e.code === "CLEAN_DRIVING") toasts.push(t);
      }
      const a = traffic.staged("sc-ftg-tail");
      if (a && passCmdT === null && Math.abs(a.lateralOffsetM ?? 0) > 1e-6) passCmdT = t;
    },
  });
  const harsh = [
    ...out.session.events
      .filter((e) => e.kind === "violation" && (e as { code: string }).code === "HARSH_BRAKING_NO_CAUSE")
      .map((e) => (e as { t: number }).t),
    ...(out.result.coachedMistakes ?? []).filter((c) => c.code === "HARSH_BRAKING_NO_CAUSE").map((c) => c.t),
  ];
  return {
    harsh,
    violations: out.violationCodes,
    coached: (out.result.coachedMistakes ?? []).map((c) => c.code),
    passed: out.result.passed,
    clean: out.session.events
      .filter((e) => e.kind === "commendation" && (e as { code: string }).code === "CLEAN_DRIVING")
      .map((e) => (e as { t: number }).t),
    toasts,
    floored,
    reports,
    passCmdT,
    debrief: out.debrief,
  };
}

function tailgater(L: ScenarioLevel, noFollower = false): LessonSpec {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, L);
  if (!noFollower) return lesson;
  return {
    ...lesson,
    stagedEvents: ((lesson.stagedEvents ?? []) as StagedEventSpec[]).filter((s) => s.kind !== "rearTailgater"),
  } as LessonSpec;
}

// ─── ROW A ─────────────────────────────────────────────────────────────────
const wob = (ramp: number, p: number) => {
  const ph = (p / 6) * 2 * Math.PI;
  return (dt: number) => Math.min(1, dt / ramp) * (8 + 1.5 * Math.sin(2 * Math.PI * 5 * dt + ph));
};
const RW: Array<{ id: string; pedalK: number; law: (dt: number) => number; base: string }> = [
  { id: "ramp0.3>wob8±1.5@5Hz/ph0 k-36", pedalK: 1130, law: wob(0.3, 0), base: "re-anchored at 25 points, accrual 0.3833" },
  { id: "ramp0.3>wob8±1.5@5Hz/ph0 k-33", pedalK: 1133, law: wob(0.3, 0), base: "re-anchored at 25 points, accrual 0.3833" },
  { id: "ramp0.3>wob8±1.5@5Hz/ph2 k-36", pedalK: 1130, law: wob(0.3, 2), base: "qualifiedSec 0.39999999999999858 at the bill" },
  { id: "ramp0.4>wob8±1.5@5Hz/ph0 k-35", pedalK: 1131, law: wob(0.4, 0), base: "qualifiedSec 0.39999999999999858 at the bill" },
];

describe("ROW A — the лепка's report and the student's own ledger agree on an exact 0.4 s hold (L3, 24.5 км/ч)", () => {
  for (const c of RW) {
    it(`${c.id}: HARSH_BRAKING_NO_CAUSE on the report's frame, not passed, no «${CLEAN_LINE}» (base: unbilled, passed — ${c.base})`, () => {
      const d = replay(tailgater(3), LN, pedalTape({ holdKmh: 24.5, pedalT: c.pedalK / 60, peak: 9.3, rampSec: 0.1, law: c.law }));
      expect(d.reports.length).toBe(1);
      expect(d.floored.length).toBeGreaterThan(0);
      expect(d.harsh).toEqual([d.reports[0]]);
      expect(d.coached).toContain("HARSH_BRAKING_NO_CAUSE");
      expect(d.passed).toBe(false);
      expect(d.clean).toEqual([]);
      expect(d.debrief).not.toContain(CLEAN_LINE);
    });
  }
});

// ─── ROW B ─────────────────────────────────────────────────────────────────
const STEADY = () => 9.3;
const RAMP75 = (s: number) => 9.3 * Math.min(1, s / 0.75);

function assertNoFlooredPraise(d: Drive): void {
  expect(d.violations).toEqual([]);
  expect(d.harsh).toEqual([]);
  expect(d.floored.length).toBeGreaterThan(0);
  expect(d.clean).toEqual([]);
  expect(d.toasts).toEqual([]);
  expect(d.debrief).not.toContain(CLEAN_LINE);
}

describe("ROW B — case A: no follower, a 30 км/ч full-pedal stab to rest at y 160 is floored and praised nowhere", () => {
  for (const L of [1, 3, 4] as ScenarioLevel[]) {
    it(`L${L}: steady 9.3 m/s² and a 0.75 s ramp — floored, nothing billed, no CLEAN_DRIVING (base L4: 30.53 / 30.60 s)`, () => {
      for (const law of [STEADY, RAMP75]) assertNoFlooredPraise(replay(tailgater(L, true), LN, stabTape(30, null, law, 160)));
    });
    it(`L${L}: CONTROL — the same drive with no brake keeps base's CLEAN_DRIVING to the frame (28.583 s)`, () => {
      const d = replay(tailgater(L, true), LN, stabTape(30, null, STEADY, null));
      expect(d.floored).toEqual([]);
      expect(d.clean.map((t) => t.toFixed(3))).toEqual(["28.583"]);
    });
  }
});

describe("ROW B — case B: with the лепка, a 0.75 s pedal ramp from 24.5 км/ч before its pass line (F2), 14 drives at L3/L4", () => {
  for (const L of [3, 4] as ScenarioLevel[]) {
    const ref = replay(tailgater(L), LN, stabTape(24.5, null, STEADY, null));
    it(`L${L}: CONTROL — never braking keeps base's CLEAN_DRIVING to the frame (30.950 s)`, () => {
      expect(ref.floored).toEqual([]);
      expect(ref.clean.map((t) => t.toFixed(3))).toEqual(["30.950"]);
    });
    for (const k of [-34, -30, -26, -22, -18, -12, -6]) {
      it(`L${L} k${k}: floored, nothing billed, no CLEAN_DRIVING (base: 31.35–31.55 s)`, () => {
        const pedalT = Math.round((ref.passCmdT! + k * G) * 60) / 60;
        assertNoFlooredPraise(replay(tailgater(L), LN, stabTape(24.5, pedalT, RAMP75)));
      });
    }
  }
});

describe("ROW B — a REAL follower-less lesson: sc-sp-harsh-brake, its own phantom slam driven from under the floor", () => {
  const X = 4.06;
  const phantom = (kmh: number, decel: number): DriveScript => ({
    steps: [
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X, 15], [X, 181]], targetKmh: kmh, maxDecelMps2: decel },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "drive", points: [[X, 181], [X, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  });
  const record = (kmh: number, decel: number) =>
    recordScriptedDrive(SP, phantom(kmh, decel), {
      scenarioId: SC_SP_HARSH_BRAKE.id,
      kind: "attempt" as never,
      seed: 7,
      stagedEvents: [...(SC_SP_HARSH_BRAKE.staged ?? [])] as StagedEventSpec[],
    }).trace;
  const BASE: Record<number, string> = { 25: "36.667", 30: "33.133", 33: "31.517" };
  for (const kmh of [25, 30, 33]) {
    const tr = record(kmh, 12);
    for (const L of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      it(`${kmh} км/ч, the 12 m/s² envelope, L${L}: floored, nothing billed, no CLEAN_DRIVING (base: ${BASE[kmh]} s)`, () => {
        assertNoFlooredPraise(replay(compileScenario(SC_SP_HARSH_BRAKE, L), SP, tr));
      });
    }
  }
  it("CONTROL — the same stop from 30 км/ч at the recorder's default 4.6 m/s² envelope keeps base's CLEAN_DRIVING to the frame (33.867 s) at L1–L5", () => {
    const tr = record(30, 4.6);
    for (const L of [1, 2, 3, 4, 5] as ScenarioLevel[]) {
      const d = replay(compileScenario(SC_SP_HARSH_BRAKE, L), SP, tr);
      expect(d.floored).toEqual([]);
      expect(d.clean.map((t) => t.toFixed(3))).toEqual(["33.867"]);
      expect(d.debrief).toContain(CLEAN_LINE);
    }
  });
  it("CONTROL — from 47 км/ч (over the floor) the slam is still the lesson's own mistake, coached at 15.350 s, exactly as at base", () => {
    const tr = record(47, 12);
    const d = replay(compileScenario(SC_SP_HARSH_BRAKE, 3), SP, tr);
    expect(d.harsh.map((t) => t.toFixed(3))).toEqual(["15.350"]);
    expect(d.floored).toEqual([]);
    expect(d.passed).toBe(false);
  });
});
