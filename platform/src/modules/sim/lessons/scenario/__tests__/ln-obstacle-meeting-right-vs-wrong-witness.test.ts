/**
 * WITNESS — sc-ln-obstacle-meeting:56ff9740 (critical): «The correct drive is
 * punished harder than the deliberately wrong one. mobile-right (the RIGHT
 * drive) debriefs at 20 наказателни точки with two ПТП entries and
 * НЕИЗДЪРЖАН; mobile-wrong debriefs at only 10.»
 *
 * A WITNESS FOR A JUDGE, NOT A CLOSURE. Every live right-leg failure the triage
 * opened was a harness driving act — the right leg's roll/stop law is wall-clock
 * and distance based (tools/mobile/lesson-audit.mjs ROLL_MS / STOP_MS), not
 * referenced to the wait ring, so it rolled into the staged van or pulled out
 * while the oncoming queue was still coming (w52 «Дистанция · 0 м» at 0 км/ч;
 * w61 11 км/ч through a ≤ 6 км/ч ring). The 20 т / two-ПТП arithmetic was a
 * ledger defect, re-scored to 10 by ec1f56f (scoring-ledger-close.test.ts).
 *
 * This file drives BOTH acts the row compares through each rung the student
 * gets (witnessLiveRung.ts: the compiled rung's own staged pair — narrowMeeting
 * sc-lnom-meeting with its parked row + oncomingStream sc-lnom-stream — under
 * the live seed lessonSeed(`sc-ln-obstacle-meeting@L<n>`), the ambient
 * baseline (0), createLessonSession → applyTick → buildLessonResult →
 * buildDebrief → gradeFinishWire), and — because the triage named the
 * admission gap — it ADMITS the right drive LONGITUDINALLY before trusting it:
 *   · RIGHT («изчакай целия насрещен поток»): the wait ring sc-lnom-wait is
 *     ticked AT ≤ 6 км/ч, before sc-lnom-round; the car does not enter the
 *     opposing half until the stream has cleared (the director's own outcome
 *     «clear») and the meeting resolved «yielded»; no contact, no
 *     FAILED_TO_YIELD — and the sheet reads 0 т., ИЗДЪРЖАН, 3★;
 *   · WRONG (the pull-out into the queue): COLLISION, 10 т., опасна, НЕ
 *     ИЗДЪРЖАН, 1★, no gate;
 *   · the ORDERING the row denies: right score < wrong score, right passed,
 *     wrong not — at every rung (L1 and L3 named by the row; L2, L4, L5 cheap);
 *   · the squeeze (the lesson's own target, CENTER_LINE_TOUCHED): not taken
 *     either (Ruling A), so no wrong act on this lesson out-scores the right one.
 *
 * KILL-CHECKS (each reddens this file; restored, sha-verified):
 *   · rules/engine.ts — COLLISION never billed (the contact arm muted);
 *   · lessons/objectives.ts stepReachZone's speed cap ignored (maxSpeedKmh
 *     not enforced) — the admission assertion on the right drive must see it.
 */

import { describe, expect, it } from "vitest";
import {
  scLnObstacleMeetingMistakePullOutScript,
  scLnObstacleMeetingMistakeSqueezeScript,
  scLnObstacleMeetingShadowScript,
} from "../../../traces/scLnObstacleMeeting";
import { gradeFinishWire, serializeRuleEvents } from "../../wire";
import { scoreRubric } from "../rubric";
import { SC_LN_OBSTACLE_MEETING } from "../templates-lanes2";
import { driveLiveRung, type LiveRungOutcome } from "./witnessLiveRung";

/** traces/scLnObstacleMeeting.ts records with collisionMinKmh 0 — the same here. */
const OPTS = { collisionMinKmh: 0 } as const;
const RUNGS = [1, 2, 3, 4, 5] as const;

const right = new Map<number, LiveRungOutcome>(
  RUNGS.map((l) => [l, driveLiveRung(SC_LN_OBSTACLE_MEETING, l, scLnObstacleMeetingShadowScript(), OPTS)]),
);
const wrong = new Map<number, LiveRungOutcome>(
  RUNGS.map((l) => [l, driveLiveRung(SC_LN_OBSTACLE_MEETING, l, scLnObstacleMeetingMistakePullOutScript(), OPTS)]),
);

function serverPassed(o: LiveRungOutcome): { passed: boolean; score: number } {
  const g = gradeFinishWire({
    lessonId: o.lesson.id,
    startedAtMs: 1_000,
    finishedAtMs: 1_000 + Math.round(o.result.durationSec * 1000),
    aborted: false,
    ruleEvents: serializeRuleEvents(o.session.events),
    objectives: o.result.objectives.map((ob) => ({
      id: ob.id,
      done: ob.done,
      completedAtSec: ob.completedAtSec,
      ...(ob.detail !== undefined ? { detail: ob.detail } : {}),
    })),
    coachedMistakes: (o.result.coachedMistakes ?? []).map((c) => ({
      code: c.code,
      t: c.t,
      ...(c.detail !== undefined ? { detail: c.detail } : {}),
    })),
  });
  if (g.status !== "ok") throw new Error(`wire refused ${o.lesson.id}`);
  return { passed: g.result.passed, score: g.result.score };
}

describe("WITNESS sc-ln-obstacle-meeting:56ff9740 — the right drive, admitted longitudinally", () => {
  for (const level of RUNGS) {
    it(`L${level}: waits IN the ring at ≤ 6 км/ч, enters the opposing half only after the whole queue cleared — 0 т., ИЗДЪРЖАН, 3★`, () => {
      const o = right.get(level)!;
      // The longitudinal admission the triage asked for (driveline admitDraw
      // admits on tracking + lateral fidelity only).
      const wait = o.result.objectives.find((x) => x.id === "sc-lnom-wait")!;
      const round = o.result.objectives.find((x) => x.id === "sc-lnom-round")!;
      expect(wait.done).toBe(true);
      expect(round.done).toBe(true);
      expect(wait.completedAtSec!).toBeLessThan(round.completedAtSec!);
      const atWait = o.ticks.reduce((b, k) => (Math.abs(k.t - wait.completedAtSec!) < Math.abs(b.t - wait.completedAtSec!) ? k : b));
      expect(Math.abs(atWait.speedKmh)).toBeLessThanOrEqual(6);
      // The queue: the director says the stream cleared and the meeting was
      // yielded, and the car's centre crossed into the opposing half after both.
      const clear = o.drive.outcomes.find((x) => x.eventId === "sc-lnom-stream");
      const meet = o.drive.outcomes.find((x) => x.eventId === "sc-lnom-meeting");
      expect(clear?.detail).toBe("clear");
      expect(meet?.detail).toBe("yielded");
      const firstOpposing = o.ticks.find((k) => k.position.x < 0);
      expect(firstOpposing, "the right drive does go round the obstacle").toBeDefined();
      expect(firstOpposing!.t).toBeGreaterThan(clear!.tSec);
      // No contact, no yield fault, before or after.
      expect(o.scored).not.toContain("COLLISION");
      expect(o.scored).not.toContain("FAILED_TO_YIELD");
      expect(o.coached).toEqual([]);
      // The sheet.
      expect(o.session.phase).toBe("completed");
      expect(o.result.score).toBe(0);
      expect(o.result.passed).toBe(true);
      expect(scoreRubric(o.result, SC_LN_OBSTACLE_MEETING.rubric!).stars).toBe(3);
      expect(o.result.summary.mistakes).toEqual([]);
      expect(serverPassed(o)).toEqual({ passed: true, score: 0 });
    });
  }
});

describe("WITNESS sc-ln-obstacle-meeting:56ff9740 — the wrong drive, and the ordering the row denies", () => {
  for (const level of RUNGS) {
    it(`L${level}: the pull-out into the queue is ONE COLLISION, 10 т. опасна, НЕИЗДЪРЖАН, 1★ — and scores strictly worse than the right drive`, () => {
      const w = wrong.get(level)!;
      const r = right.get(level)!;
      const billed = w.result.summary.mistakes;
      expect(billed.map((m) => m.code)).toEqual(["COLLISION"]);
      expect(billed[0].severityClass).toBe("opasna");
      expect(billed[0].points).toBe(10);
      expect(w.result.score).toBe(10);
      expect(w.result.passed).toBe(false);
      expect(scoreRubric(w.result, SC_LN_OBSTACLE_MEETING.rubric!).stars).toBe(1);
      expect(w.done["sc-lnom-wait"]).toBe(false);
      // THE ROW: «the correct drive is punished harder than the wrong one».
      expect(r.result.score).toBeLessThan(w.result.score);
      expect(r.result.passed).toBe(true);
      expect(w.result.passed).toBe(false);
      // …and the same on the server's own regrade.
      const rs = serverPassed(r);
      const ws = serverPassed(w);
      expect(rs.score).toBeLessThan(ws.score);
      expect(rs.passed && !ws.passed).toBe(true);
    });
  }

  for (const level of [1, 2, 3, 5] as const) {
    it(`L${level}: the squeeze — the lesson's own target CENTER_LINE_TOUCHED — is not taken either (Ruling A)`, () => {
      const o = driveLiveRung(SC_LN_OBSTACLE_MEETING, level, scLnObstacleMeetingMistakeSqueezeScript(), OPTS);
      expect(o.taught).toContain("CENTER_LINE_TOUCHED");
      expect((o.result.lessonMistakes ?? []).map((h) => h.code)).toContain("CENTER_LINE_TOUCHED");
      expect(o.result.passed).toBe(false);
      expect(o.result.passed).not.toBe(right.get(level)!.result.passed);
    });
  }
});
