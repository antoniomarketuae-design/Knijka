/**
 * WITNESS (not a closure) — sc-rb-busy-gap:a6f83f6b [critical], :8f50287b [major],
 * :5ee56710 [critical].
 *
 *   a6f83f6b «The most careful drive of the four — 15 full stops and 43 s of
 *             lawful waiting — scores the WORST at 21 т.»
 *   8f50287b «The most careful of the four drives scores worst, so the scoring
 *             punishes patience.»
 *   5ee56710 «Leaving at the second exit never ticks in any leg — no drive has
 *             completed the roundabout the lesson is named after.»
 *
 * WHY THEY STAY OPEN. Every live leg is crash-pinned at the island or leaves the
 * ring before the north exit (the steering loop cannot hold rb-mini's R = 18
 * ring), the audit harness has NO indicator input (so `sc-rbg-exit`, which needs
 * a right signal, cannot tick for it even with perfect steering), and the wrong
 * legs are pedal-only. In process the full-stack replay existed at L3 only
 * (s-w3-bot-completion), through the recorder's harness stack.
 *
 * WHAT THIS DRIVES. The lesson's own authored drives — the patient shadow, the
 * barge and the short-gap entry, each recorded against the RUNG's whole cast —
 * replayed through the live stack at every rung (./liveChainReplay.ts:
 * compileScenario → staged + stagedAdd under the director at the live seed →
 * the rung's traffic with LessonScene's options → createLessonSession/applyTick
 * → buildLessonResult → buildDebrief). The right indicator is NOT injected: it
 * is the indicator the authored drive switches on, carried to the grader on the
 * production SimTick (`tick.indicator`) exactly as the cockpit stalk would.
 *
 * L5 adds a THIRD platoon car (`sc-rbg-third`, stagedAdd). The shadow's 10 s
 * wait is authored for two cars and enters in front of the third (honestly
 * billed — measured below), so at L5 the PATIENT act is to wait the third car
 * out too: 25 s, the middle of the measured clean window (18–32.5 s).
 *
 * ── PRODUCT DEFECT FOUND, written as a RED SPECIFICATION (see the last block) ──
 * Patience IS punished, in one band: a driver who waits 1–5 s LONGER than the
 * shadow (11, 12, 14, 15 s at L1) and then merges BEHIND the platoon is billed
 * FAILED_TO_YIELD (опасна, 10 т., НЕИЗДЪРЖАН) — against cars that are already
 * 46°–108° of ring DOWNSTREAM of him, with nothing upstream.
 * `traffic/system.ts circulatingConflictFor` (:1071-1099) counts any moving car
 * in the ring band, within 26 m, on the driver's LEFT — and as the entry chord
 * turns north-east the cars he is following swing into his left half-plane. Its
 * sibling `conflictFromRightFor` was given «DEPARTING AND CLEAR» and
 * «ARRIVAL, NOT PRESENCE» clauses; this one has neither. The conviction lands
 * at `runtime/worldRuntime.ts:2441-2452`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { StagedEventSpec } from "../../../contracts";
import { recordScriptedDrive, type DriveScript } from "../../../traces/recorder";
import {
  scRbBusyGapMistakeBargeScript,
  scRbBusyGapMistakeShortGapScript,
  scRbBusyGapShadowScript,
} from "../../../traces/scRbBusyGap";
import { compileScenario } from "../compile";
import { scoreRubric } from "../rubric";
import { SC_RB_BUSY_GAP } from "../templates-roundabout";
import type { ScenarioLevel } from "../types";
import { liveChainReplay, type LiveReplayOutcome } from "./liveChainReplay";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../../../..");
const RAW: unknown = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "content", "world", "rb-mini-v1.json"), "utf-8"),
);
const LEVELS: readonly ScenarioLevel[] = [1, 2, 3, 4, 5];
/** The shadow's authored wait at the line (traces/scRbBusyGap.ts SHADOW_WAIT_SEC). */
const SHADOW_WAIT_SEC = 10;
/** L5's patient wait: the middle of the measured clean window behind the third car. */
const L5_PATIENT_WAIT_SEC = 25;

/** The authored shadow with its wait at the line set to `sec` (nothing else moves). */
function shadowWaiting(sec: number): DriveScript {
  const base = scRbBusyGapShadowScript();
  let replaced = 0;
  const steps = base.steps.map((st) => {
    if (st.kind === "pause" && st.sec === SHADOW_WAIT_SEC) {
      replaced++;
      return { ...st, sec };
    }
    return st;
  });
  if (replaced !== 1) throw new Error(`shadowWaiting: expected one ${SHADOW_WAIT_SEC} s wait, found ${replaced}`);
  return { steps };
}

/** The authored shadow with every indicator step removed (the audit harness's drive). */
function shadowWithoutIndicator(): DriveScript {
  return { steps: scRbBusyGapShadowScript().steps.filter((st) => st.kind !== "indicator") };
}

function drive(level: ScenarioLevel, script: DriveScript, afterApply?: Parameters<typeof liveChainReplay>[0]["afterApply"]): LiveReplayOutcome {
  const lesson = compileScenario(SC_RB_BUSY_GAP, level);
  const rec = recordScriptedDrive(RAW, script, {
    scenarioId: SC_RB_BUSY_GAP.id,
    kind: "shadow",
    seed: 7,
    stagedEvents: (lesson.stagedEvents ?? []) as StagedEventSpec[],
    collisionMinKmh: 0,
  });
  return liveChainReplay({ lesson, districtRaw: RAW, trace: rec.trace, holdAfterSec: 3, ...(afterApply ? { afterApply } : {}) });
}

const patientWait = (level: ScenarioLevel) => (level === 5 ? L5_PATIENT_WAIT_SEC : SHADOW_WAIT_SEC);
const done = (out: LiveReplayOutcome, id: string) => out.result.objectives.find((o) => o.id === id)!;

describe("sc-rb-busy-gap — the patient correct drive at every rung (a6f83f6b · 8f50287b · 5ee56710)", () => {
  const runs = LEVELS.map((level) => {
    const signalled: string[] = [];
    const out = drive(level, shadowWaiting(patientWait(level)), ({ tick }) => {
      if (tick.indicator === "right" && signalled[signalled.length - 1] !== "right") signalled.push("right");
    });
    return { level, out, signalled };
  });

  it("the cast is the rung's own: the platoon pair on every rung, the third car on L5", () => {
    for (const { level, out } of runs) {
      expect((out.lesson.stagedEvents ?? []).map((s: StagedEventSpec) => s.id), `L${level}`).toEqual(
        level === 5 ? ["sc-rbg-lead", "sc-rbg-follower", "sc-rbg-third"] : ["sc-rbg-lead", "sc-rbg-follower"],
      );
      // Every platoon car was a real conflict the driver gave way to.
      for (const o of out.outcomes) expect(o.detail, `L${level} ${o.eventId}`).toBe("yielded");
      expect(out.outcomes.length, `L${level}`).toBe(level === 5 ? 3 : 2);
    }
  });

  it("0 т., ИЗДЪРЖАН, 3★, zero violations and YIELDED_TO_PRIORITY — patience is credited, on every rung", () => {
    for (const { level, out } of runs) {
      const label = `L${level}`;
      expect(out.result.passed, label).toBe(true);
      expect(out.result.score, label).toBe(0);
      expect(out.violationCodes, label).toEqual([]);
      expect(out.result.lessonMistakes ?? [], label).toEqual([]);
      expect(out.commendationCodes, label).toContain("YIELDED_TO_PRIORITY");
      expect(scoreRubric(out.result, SC_RB_BUSY_GAP.rubric!).stars, label).toBe(3);
      // The wait was real and is on the books as a lawful yield wait.
      expect(out.result.yieldWaitSec ?? 0, label).toBeGreaterThanOrEqual(patientWait(level));
      expect(out.debrief, label).toMatch(/е издържан: 0 наказателни точки/);
    }
  });

  it("5ee56710: the second exit TICKS — all four tasks in route order, the exit under the right indicator the drive switched on", () => {
    for (const { level, out, signalled } of runs) {
      const label = `L${level}`;
      expect(out.result.objectives.map((o) => [o.id, o.done]), label).toEqual([
        ["sc-rbg-yield-line", true],
        ["sc-rbg-past-east", true],
        ["sc-rbg-exit-approach", true],
        ["sc-rbg-exit", true],
      ]);
      const ts = ["sc-rbg-yield-line", "sc-rbg-past-east", "sc-rbg-exit-approach", "sc-rbg-exit"].map(
        (id) => done(out, id).completedAtSec!,
      );
      for (let i = 1; i < ts.length; i++) expect(ts[i], `${label} order ${i}`).toBeGreaterThan(ts[i - 1]);
      const exit = done(out, "sc-rbg-exit");
      expect(exit.detail?.kind === "roundabout" && exit.detail.entered, label).toBe(true);
      expect(exit.detail?.kind === "roundabout" && exit.detail.exitSignaled, label).toBe(true);
      expect(signalled, `${label}: the right indicator rode the production tick`).toEqual(["right"]);
    }
  });

  it("…and the indicator is what the audit harness lacks: the SAME drive with no stalk never ticks the exit (L1)", () => {
    const out = drive(1, shadowWithoutIndicator());
    expect(done(out, "sc-rbg-exit-approach").done).toBe(true);
    expect(done(out, "sc-rbg-exit").done).toBe(false);
    expect(out.result.passed).toBe(false);
  });
});

describe("sc-rb-busy-gap — waiting LONGER is not priced (8f50287b's causal clause), outside the red band below", () => {
  // Measured clean windows (this file's sweep, 0.5–1 s steps): L1 16–32 s, L5 18–32.5 s.
  // Past ~33 s the looping platoon comes round to the mouth again and entering
  // then IS a failure to yield — that is the ring, not a price on patience.
  const LONG: Array<[ScenarioLevel, number]> = [
    [1, 16],
    [1, 20],
    [1, 25],
    [1, 30],
    [5, 18],
    [5, 30],
  ];
  const runs = LONG.map(([level, w]) => ({ level, w, out: drive(level, shadowWaiting(w)) }));

  it("each longer wait still ends 0 т., 3★, every task ticked — even past the 60 s par, because the yield wait is not counted", () => {
    for (const { level, w, out } of runs) {
      const label = `L${level} wait ${w}s`;
      expect(out.result.passed, label).toBe(true);
      expect(out.result.score, label).toBe(0);
      expect(out.result.completedAll, label).toBe(true);
      expect(out.commendationCodes, label).toContain("YIELDED_TO_PRIORITY");
      expect(scoreRubric(out.result, SC_RB_BUSY_GAP.rubric!).stars, label).toBe(3);
    }
    // The 30 s wait at L1 runs past par time and is still 3★ (ruling 21: par gates stars only).
    const l1Long = runs.find((r) => r.level === 1 && r.w === 30)!;
    expect(l1Long.out.result.durationSec).toBeGreaterThan(SC_RB_BUSY_GAP.rubric!.parTimeSec!);
  });
});

describe("sc-rb-busy-gap — the lesson's own wrong acts are billed at every rung", () => {
  it("the barge: FAILED_TO_YIELD billed on the spot, the yield-line gate missed, not passed, 1★", () => {
    for (const level of LEVELS) {
      const out = drive(level, scRbBusyGapMistakeBargeScript());
      const label = `L${level}`;
      expect(out.violationCodes, label).toContain("FAILED_TO_YIELD");
      expect(out.result.score, label).toBeGreaterThanOrEqual(10);
      expect(done(out, "sc-rbg-yield-line").done, label).toBe(false);
      expect(out.result.passed, label).toBe(false);
      expect(scoreRubric(out.result, SC_RB_BUSY_GAP.rubric!).stars, label).toBe(1);
      // The debrief names the fault, as an опасна, with its points.
      expect(out.debrief, label).toMatch(/Влизане без пропускане — опасна, 10 наказателни т./);
    }
  });

  it("the short gap: the wait gate ticks, FAILED_TO_YIELD is still billed (and the crash, except where the exam stopped at the first опасна)", () => {
    for (const level of LEVELS) {
      const out = drive(level, scRbBusyGapMistakeShortGapScript());
      const label = `L${level}`;
      expect(done(out, "sc-rbg-yield-line").done, label).toBe(true);
      expect(out.violationCodes, label).toContain("FAILED_TO_YIELD");
      if (out.lesson.examMode === true) {
        // L4 is the exam rung: the first опасна ends the attempt, so nothing after it is graded.
        expect(out.result.summary.terminated || out.session.phase === "completed", label).toBe(true);
      } else {
        expect(out.violationCodes, label).toContain("COLLISION");
      }
      expect(done(out, "sc-rbg-past-east").done, label).toBe(false);
      expect(out.result.passed, label).toBe(false);
      expect(out.result.score, label).toBeGreaterThanOrEqual(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RED SPECIFICATION — PRODUCT_DEFECT (witness-a, 2026-10-04). Adopt by flipping
// `RED_SPEC` to `it` (or run with WITNESS_RED=1 to see it red today).
//
// `it.fails` keeps the shared gate green while the defect stands and turns RED
// the day a repair lands — so the repair lane cannot forget to adopt it.
// ─────────────────────────────────────────────────────────────────────────────
const RED_SPEC = process.env.WITNESS_RED === "1" ? it : it.fails;
/** Waits at L1 that merge BEHIND the platoon and are convicted today (measured). */
const MERGE_BEHIND_WAITS = [11, 12, 14, 15] as const;

interface Conviction {
  playerPhi: number;
  ahead: Array<{ id: string; aheadDeg: number }>;
}

/** Circulation angle φ (deg from the SOUTH node, CCW through EAST) — scRbBusyGap.ts's own convention. */
const phiDeg = (x: number, y: number): number => ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;

describe("sc-rb-busy-gap — PRODUCT DEFECT: a driver who waits a little longer and merges BEHIND the platoon is convicted (8f50287b · a6f83f6b)", () => {
  const runs = MERGE_BEHIND_WAITS.map((w) => {
    const box: { at: Conviction | null } = { at: null };
    const out = drive(1, shadowWaiting(w), ({ t, tick, traffic, step }) => {
      if (box.at !== null) return;
      const fty = step.state.events.some((e) => e.kind === "violation" && e.code === "FAILED_TO_YIELD" && Math.abs(e.t - t) < 1e-6);
      if (!fty) return;
      const p = phiDeg(tick.position.x, tick.position.y);
      const ahead = ["sc-rbg-lead", "sc-rbg-follower"].map((id) => {
        const a = traffic.staged(id) as unknown as { x: number; y: number };
        return { id, aheadDeg: (phiDeg(a.x, a.y) - p + 360) % 360 };
      });
      box.at = { playerPhi: p, ahead };
    });
    return { w, out, at: box.at };
  });

  it("MEASURED (green today): each of these drives is billed FAILED_TO_YIELD, and at the billed frame EVERY circulating car is 40°–120° of ring DOWNSTREAM of the driver", () => {
    for (const { w, out, at } of runs) {
      const label = `L1 wait ${w}s`;
      expect(out.violationCodes, label).toContain("FAILED_TO_YIELD");
      expect(out.result.passed, label).toBe(false);
      expect(at, label).not.toBeNull();
      for (const a of at!.ahead) {
        // Ahead of him in the direction of circulation, i.e. cars he is FOLLOWING.
        expect(a.aheadDeg, `${label} ${a.id}`).toBeGreaterThan(40);
        expect(a.aheadDeg, `${label} ${a.id}`).toBeLessThan(120);
      }
    }
  });

  RED_SPEC(
    "SPEC: merging behind every circulating car forces nobody to slow (ЗДвП чл. 50, ал. 1 — the lesson's own text), so it is NOT a failure to yield: 0 т., ИЗДЪРЖАН",
    () => {
      for (const { w, out } of runs) {
        const label = `L1 wait ${w}s`;
        expect(out.violationCodes, label).not.toContain("FAILED_TO_YIELD");
        expect(out.result.score, label).toBe(0);
        expect(out.result.passed, label).toBe(true);
      }
    },
  );
});
