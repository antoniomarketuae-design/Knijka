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
 * wait is authored for two cars and comes onto the ring as the third goes by
 * his mouth — its tail 0.8 m past it — and into the back of it (a collision,
 * honestly billed), so at L5 the PATIENT act is to wait the third car
 * out too: 25 s, the middle of the measured clean window (18–32.5 s).
 *
 * ── PRODUCT DEFECT FOUND by witness-a, REPAIRED (rbgap lane; see the last blocks) ──
 * THE REPAIR THAT HELD is the founder ruling of 2026-10-05, «BILL FORCED
 * BRAKING»: a roundabout entry is FAILED_TO_YIELD when a circulating car has to
 * BRAKE because of it, or is touched — and for no other reason
 * (runtime/worldRuntime.ts §4c; acceptance:
 * ./roundabout-entry-forced-braking.property.test.ts). It took three rounds:
 *   round 1  `circulatingConflictFor` clause (R) DEPARTING AND CLEAR — fixed the
 *            11–15 s band below, left a driver who waits 33–38 s billed with
 *            every car 12–25 m away and nobody slowing;
 *   round 2  «no entry, no offence» + an arrival gap — refuted both ways
 *            (a creep in BEHIND the last car billed; a slow entry AHEAD of the
 *            returning lead praised while it braked to 1.28 m/s);
 *   round 3  the ruling: prediction is gone from the conviction.
 * What follows is the defect as witness-a measured it before any of that.
 * Patience WAS punished, in one band: a driver who waits 1–5 s LONGER than the
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

describe("sc-rb-busy-gap — waiting LONGER is not priced (8f50287b's causal clause)", () => {
  // Measured clean windows (the 0.5 s sweep, forced-braking grader): L1 10–38.5 s,
  // L5 13–38.5 s. From 39 s the looping platoon has come round and the LEAD has to
  // brake for him — that is a real failure to yield (pinned in the next block),
  // not a price on patience. 33–38 s — the band rounds 0 and 1 billed with every
  // car 12–25 m away — is inside the clean window now.
  const LONG: Array<[ScenarioLevel, number]> = [
    [1, 16],
    [1, 20],
    [1, 25],
    [1, 30],
    [1, 33],
    [1, 36],
    [1, 38],
    [5, 18],
    [5, 30],
    [5, 35],
    [5, 38],
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

describe("sc-rb-busy-gap — where the long wait DOES become an offence, it is one: the returning lead has to brake (founder ruling 2026-10-05)", () => {
  // One car's story per drive, from PUBLISHED speeds: the lead's slowest speed
  // after his wait, and how near it came.
  const watch = (level: ScenarioLevel, w: number) => {
    let slowest = Infinity;
    let nearest = Infinity;
    let waited = false;
    const out = drive(level, shadowWaiting(w), ({ tick, traffic }) => {
      if (tick.speedKmh < 0.5 && Math.abs(tick.position.y + 27.5) < 0.2) waited = true;
      if (!waited || tick.speedKmh < 0.5) return;
      const lead = traffic.staged("sc-rbg-lead");
      if (!lead) return;
      slowest = Math.min(slowest, lead.speedMps);
      nearest = Math.min(nearest, Math.hypot(lead.x - tick.position.x, lead.y - tick.position.y));
    });
    return { out, slowest, nearest };
  };

  it("waits 33–38 s (the band billed until now with nobody affected): the lead never drops below its 2.90 m/s, never comes within 11 m — and the drive is 0 т., ИЗДЪРЖАН, commended", () => {
    for (const level of [1, 3, 5] as const) {
      for (const w of [33, 35, 37, 38]) {
        const { out, slowest, nearest } = watch(level, w);
        const label = `L${level} wait ${w}s`;
        expect(slowest, label).toBe(2.9);
        expect(nearest, label).toBeGreaterThan(11);
        expect(out.violationCodes, label).toEqual([]);
        expect(out.result.score, label).toBe(0);
        expect(out.result.passed, label).toBe(true);
        expect(out.commendationCodes, label).toContain("YIELDED_TO_PRIORITY");
      }
    }
  });

  it("waits 39–41 s: he pulls out ahead of the returning lead, which HAS TO BRAKE — billed FAILED_TO_YIELD, not passed, not commended", () => {
    for (const level of [1, 3, 5] as const) {
      for (const w of [39, 40, 41]) {
        const { out, slowest } = watch(level, w);
        const label = `L${level} wait ${w}s`;
        expect(slowest, label).toBeLessThan(2.9 - 0.3);
        expect(out.violationCodes, label).toContain("FAILED_TO_YIELD");
        expect(out.result.passed, label).toBe(false);
        expect(out.commendationCodes, label).not.toContain("YIELDED_TO_PRIORITY");
      }
    }
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
// REPAIRED (rbgap lane) — was the witness-a RED SPECIFICATION. Round 1
// (2026-10-04) cleared it with `circulatingConflictFor` clause (R) DEPARTING AND
// CLEAR; since the founder ruling of 2026-10-05 the conviction does not read
// that predicate at all (a merge behind every car makes nobody brake), and the
// measurement below — what the PRESENCE test still sees — is kept as the record
// of why presence could not be the conviction.
// ─────────────────────────────────────────────────────────────────────────────
/** Waits at L1 that merge BEHIND the platoon (measured: billed before the repair). */
const MERGE_BEHIND_WAITS = [11, 12, 14, 15] as const;
/** rb-mini-v1's ring: centre (0, 0), R = 18; the runtime's band (R + 9) and commit reach (R + 12). */
const RING_BAND_M = 18 + 9;
const COMMIT_REACH_M = 18 + 12;

/** Circulation angle φ (deg from the SOUTH node, CCW through EAST) — scRbBusyGap.ts's own convention. */
const phiDeg = (x: number, y: number): number => ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;

describe("sc-rb-busy-gap — a driver who waits a little longer and merges BEHIND the platoon is not convicted (8f50287b · a6f83f6b)", () => {
  const runs = MERGE_BEHIND_WAITS.map((w) => {
    // Every platoon car the OLD presence-only test (in the band, within 26 m of
    // him, ≥ 1.5 m on his left) saw while he was moving inside the commit reach
    // AFTER the wait at the line (his first standstill of ≥ 5 s; the approach
    // before it is a different act, and he stops for it) — the frames on which
    // that test convicted him — with its ring angle ahead of him in the
    // direction of circulation.
    const seen: Array<{ t: number; id: string; aheadDeg: number }> = [];
    const clock = { stoppedSince: null as number | null, waited: false };
    const out = drive(1, shadowWaiting(w), ({ t, tick, traffic }) => {
      const { x: px, y: py } = tick.position;
      if (tick.speedKmh < 0.5) {
        clock.stoppedSince ??= t;
        if (t - clock.stoppedSince >= 5) clock.waited = true;
      } else clock.stoppedSince = null;
      if (!clock.waited) return;
      if (tick.speedKmh <= 3 || Math.hypot(px, py) > COMMIT_REACH_M) return;
      const rad = (tick.headingDeg * Math.PI) / 180;
      const lx = -Math.cos(rad);
      const ly = Math.sin(rad);
      const p = phiDeg(px, py);
      for (const id of ["sc-rbg-lead", "sc-rbg-follower"]) {
        const a = traffic.staged(id) as unknown as { x: number; y: number };
        if (Math.hypot(a.x, a.y) > RING_BAND_M) continue;
        if (Math.hypot(a.x - px, a.y - py) > 26) continue;
        if ((a.x - px) * lx + (a.y - py) * ly < 1.5) continue;
        seen.push({ t, id, aheadDeg: (phiDeg(a.x, a.y) - p + 360) % 360 });
      }
    });
    return { w, out, seen };
  });

  // Measured on the repaired tree: first sighting 74–85° ahead; over the whole
  // merge and the ring run behind the platoon 25.4°–93.1°, never upstream.
  it("MEASURED: the presence-only test DOES see platoon cars on his left after the wait — the first one 40°–120° of ring DOWNSTREAM of him, and not one, on any frame, upstream (cars he is FOLLOWING)", () => {
    for (const { w, seen } of runs) {
      const label = `L1 wait ${w}s`;
      expect(seen.length, label).toBeGreaterThan(0);
      expect(seen[0].aheadDeg, `${label} first sighting ${seen[0].id}`).toBeGreaterThan(40);
      expect(seen[0].aheadDeg, `${label} first sighting ${seen[0].id}`).toBeLessThan(120);
      for (const s of seen) {
        expect(s.aheadDeg, `${label} ${s.id} t=${s.t.toFixed(2)}`).toBeGreaterThan(20);
        expect(s.aheadDeg, `${label} ${s.id} t=${s.t.toFixed(2)}`).toBeLessThan(120);
      }
    }
  });

  it("merging behind every circulating car forces nobody to slow (ЗДвП чл. 50, ал. 1 — the lesson's own text), so it is NOT a failure to yield: 0 т., ИЗДЪРЖАН, YIELDED_TO_PRIORITY, 3★", () => {
    for (const { w, out } of runs) {
      const label = `L1 wait ${w}s`;
      expect(out.violationCodes, label).not.toContain("FAILED_TO_YIELD");
      expect(out.violationCodes, label).toEqual([]);
      expect(out.result.score, label).toBe(0);
      expect(out.result.passed, label).toBe(true);
      expect(out.commendationCodes, label).toContain("YIELDED_TO_PRIORITY");
      expect(scoreRubric(out.result, SC_RB_BUSY_GAP.rubric!).stars, label).toBe(3);
    }
  });
});
