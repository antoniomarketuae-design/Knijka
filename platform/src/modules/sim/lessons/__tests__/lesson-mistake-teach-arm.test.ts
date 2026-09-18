/**
 * ADR-009 T6-ENGINE — THE CARD AT THE MOMENT OF THE MISTAKE (founder Ruling A,
 * 2026-09-17; spec `docs/simulation/92_ADR009_LESSON_MISTAKE_SPEC.md` §3.4b d–f
 * and §8.1 T6-engine).
 *
 * THE RULING HAS TWO HALVES AND ONLY ONE OF THEM IS A NUMBER. «Не е взет» on
 * the end screen, minutes after the act, is a bare verdict — and a bare verdict
 * is the one thing doc 64 THEO-4 forbids anywhere in this product. So the
 * engine must also mark the moment: the card that says «урокът няма да се
 * зачете» has to reach the glass WHEN the mistake happens, under the act's own
 * name, with what to do instead.
 *
 * WHAT THIS FILE PINS, and why each is a separate risk:
 *   §1  THE BYPASS. A teach moment arriving inside `TEACH_PAUSE_MIN_GAP_S` of
 *       the previous pause is downgraded to a silent toast. For the session's
 *       FIRST lesson-mistake card that downgrade would swallow the sentence the
 *       whole ADR exists to deliver, so it is bypassed — once.
 *   §2  ONCE, AND THE CONTROL. A LATER target first-occurrence inside the gap
 *       follows today's rate limit: the student has already been told, and the
 *       reason block lists every hit after the drive. Without this narrowing a
 *       four-target lesson could chain four pauses in fifteen seconds (doc 92 §1
 *       fix 6). The census measured the effect: 665 cards over 654 hit drives,
 *       and every card past the first was one the rate limit would have allowed
 *       anyway.
 *   §3  THE FLAG ON THE MOMENT. `TeachMoment.lessonMistake` is what
 *       `lessonMistake.ts teachChipBg / teachSublineBg / teachStakeSegments`
 *       read; without it the card prints «Първа среща — не се брои в резултата»
 *       over a lesson that is about to be refused, which is the opposite of the
 *       truth (M8).
 *   §4  THE PAUSE-ON-ERROR ARM carries `charged: true`, so the L1 aid stops
 *       claiming «не се брои в резултата» over points it has just taken.
 *   §5  THE CAP RESERVE. A target's FIRST coached row may use the last places
 *       inside `MAX_COACHED_MISTAKES`, because that row is the only record the
 *       mistake happened at all — it is never charged. The cap itself does not
 *       move, so no older server rejects a payload this build can produce.
 */

import { describe, expect, it } from "vitest";

import type { LessonSpec } from "../../contracts";
import {
  applyTick,
  buildLessonResult,
  createLessonSession,
  MAX_COACHED_MISTAKES,
  TEACH_PAUSE_MIN_GAP_S,
} from "../engine";
import type { HudEvent } from "../../contracts";
import type { CoachedMistake, LessonSessionState, TeachMoment } from "../types";
import { makeTick } from "./fixtures";

const TURN = "TURN_WITHOUT_INDICATOR";
const LANE = "LANE_CHANGE_WITHOUT_INDICATOR";
const SPEED = "SPEEDING_OVER_LIMIT";

/** A bare practice lesson — no objectives, so nothing but the coach is in play. */
function lessonWith(targets: string[], aids?: LessonSpec["aids"]): LessonSpec {
  return {
    id: "t-adr009-teach",
    order: 99,
    titleBg: "Тест урок",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    objectives: [],
    ...(targets.length > 0
      ? { lessonMistakeTargets: targets.map((code) => ({ code, source: "demo" as const })) }
      : {}),
    ...(aids !== undefined ? { aids } : {}),
  };
}

interface Played {
  state: LessonSessionState;
  teachMoments: TeachMoment[];
  hudEvents: HudEvent[];
}

function play(lesson: LessonSpec, ticks: Parameters<typeof applyTick>[1][], from?: LessonSessionState): Played {
  let state = from ?? createLessonSession(lesson);
  const teachMoments: TeachMoment[] = [];
  const hudEvents: HudEvent[] = [];
  for (const tick of ticks) {
    const step = applyTick(state, tick);
    state = step.state;
    for (const m of step.teachMoments ?? []) teachMoments.push(m);
    for (const h of step.hudEvents) hudEvents.push(h);
  }
  return { state, teachMoments, hudEvents };
}

/**
 * The sequence the whole file turns on: a turn fault at t=1 takes the pause, and
 * a lane-change fault at t=5 arrives well INSIDE `TEACH_PAUSE_MIN_GAP_S` (15 s).
 * Today's rate limit downgrades the second one to a toast — which is exactly
 * what `coached-mistakes-channel.test.ts` pins as correct behaviour for an
 * ordinary fault, and exactly what may not happen to the lesson's own.
 */
const INSIDE_THE_GAP = [
  makeTick({ t: 0, speedKmh: 30, laneId: 0 }),
  makeTick({ t: 1, speedKmh: 30, laneId: 0, events: [{ kind: "turnStarted", direction: "left" }] }),
  makeTick({ t: 4, speedKmh: 30, laneId: 0 }),
  makeTick({ t: 5, speedKmh: 30, laneId: 1 }),
];

// ---------------------------------------------------------------------------
// §1 / §2 / §3 — the bypass, its narrowing, and the flag
// ---------------------------------------------------------------------------

describe("§1 the first lesson-mistake card is never downgraded to a toast", () => {
  it("inside the gap, a TARGET still PAUSES — and the moment carries the flag", () => {
    const out = play(lessonWith([LANE]), INSIDE_THE_GAP);
    expect(out.teachMoments.map((m) => m.code)).toEqual([TURN, LANE]);
    const card = out.teachMoments.find((m) => m.code === LANE)!;
    expect(card.lessonMistake).toBe(true);
    expect(card.charged).toBeUndefined(); // taught, so nothing was billed
    // …and it did NOT also arrive as the silent toast: one presentation, not two.
    expect(out.hudEvents.filter((h) => h.kind === "lesson")).toHaveLength(0);
  });

  it("CONTROL — the same ticks with no targets downgrade it, exactly as today", () => {
    // `coached-mistakes-channel.test.ts` pins this arm as correct for an
    // ordinary fault. If this ever paused too, §1 would be measuring nothing.
    const out = play(lessonWith([]), INSIDE_THE_GAP);
    expect(out.teachMoments.map((m) => m.code)).toEqual([TURN]);
    expect(out.hudEvents.filter((h) => h.kind === "lesson")).toHaveLength(1);
    // …and the downgraded fault is still on the coached record, so the verdict
    // and the debrief see it either way. The bypass buys a CARD, not a record.
    expect((out.state.coachedMistakes ?? []).map((c) => c.code)).toEqual([TURN, LANE]);
  });

  it("the flag is on the target's moment and on no other", () => {
    // M8's address. `teachChipBg` and `teachSublineBg` switch on this field, so
    // a moment that lost it prints «Учебен момент» and «Пауза — първа среща с
    // тази ситуация» over the act that is about to refuse the lesson.
    const out = play(lessonWith([LANE]), INSIDE_THE_GAP);
    expect(out.teachMoments.find((m) => m.code === TURN)!.lessonMistake).toBeUndefined();
    expect(out.teachMoments.find((m) => m.code === LANE)!.lessonMistake).toBe(true);
  });
});

describe("§2 …and only the FIRST one — a later target follows today's rate limit", () => {
  it("a second target first-occurrence inside the gap downgrades to the toast", () => {
    // Both codes are this lesson's own. The first takes the bypass; the second
    // arrives 4 s later and is NOT a new pause, because the student has already
    // been told the lesson will not count.
    const ticks = [
      makeTick({ t: 0, speedKmh: 30, laneId: 0 }),
      makeTick({
        t: 1,
        speedKmh: 30,
        laneId: 0,
        events: [{ kind: "turnStarted", direction: "left" }],
      }),
      makeTick({ t: 4, speedKmh: 30, laneId: 0 }),
      makeTick({ t: 5, speedKmh: 30, laneId: 1 }),
      makeTick({ t: 6, speedKmh: 56 }),
      makeTick({ t: 7, speedKmh: 56 }),
      makeTick({ t: 8, speedKmh: 56 }),
    ];
    const out = play(lessonWith([LANE, SPEED]), ticks);
    // The lane-change target paused (the session's first lesson card)…
    expect(out.teachMoments.map((m) => m.code)).toEqual([TURN, LANE]);
    // …and the speeding target, inside the same window, went to the toast.
    expect(out.hudEvents.filter((h) => h.kind === "lesson")).toHaveLength(1);
    // BOTH still reach the verdict, which is what makes the narrowing safe:
    // the reason block after the drive lists every hit, card or no card.
    const r = buildLessonResult(out.state);
    expect((r.lessonMistakes ?? []).map((h) => h.code).sort()).toEqual([LANE, SPEED].sort());
    expect(r.passed).toBe(false);
  });

  it("outside the gap a later target pauses again — the limit, not the flag, decides", () => {
    const ticks = [
      makeTick({ t: 0, speedKmh: 30, laneId: 0 }),
      makeTick({
        t: 1,
        speedKmh: 30,
        laneId: 0,
        events: [{ kind: "turnStarted", direction: "left" }],
      }),
      makeTick({ t: 5, speedKmh: 30, laneId: 1 }),
      makeTick({ t: 5 + TEACH_PAUSE_MIN_GAP_S + 1, speedKmh: 56 }),
      makeTick({ t: 5 + TEACH_PAUSE_MIN_GAP_S + 2, speedKmh: 56 }),
      makeTick({ t: 5 + TEACH_PAUSE_MIN_GAP_S + 3, speedKmh: 56 }),
    ];
    const out = play(lessonWith([LANE, SPEED]), ticks);
    expect(out.teachMoments.map((m) => m.code)).toEqual([TURN, LANE, SPEED]);
  });
});

// ---------------------------------------------------------------------------
// §4 — the pause-on-error arm
// ---------------------------------------------------------------------------

describe("§4 the L1 pauseOnError arm stops claiming a charge is free", () => {
  it("a GRADED target pauses with `charged: true` and the lesson flag", () => {
    // Two speeding episodes: the first is taught (free), the second is a genuine
    // repeat and grades — founder answer F1. `pauseOnError` freezes on it, and
    // the card must now say where the points went rather than «не се брои в
    // резултата», which is what it said over a charge for its whole life.
    const lesson = lessonWith([SPEED], { pauseOnError: true });
    const episode = (t0: number) => [
      makeTick({ t: t0, speedKmh: 56 }),
      makeTick({ t: t0 + 1, speedKmh: 56 }),
      makeTick({ t: t0 + 2, speedKmh: 56 }),
      makeTick({ t: t0 + 3, speedKmh: 40 }),
    ];
    const first = play(lesson, episode(0));
    const out = play(lesson, episode(TEACH_PAUSE_MIN_GAP_S + 5), first.state);
    const charged = out.teachMoments.find((m) => m.code === SPEED);
    expect(charged, "the pauseOnError arm must still freeze on a graded fault").toBeDefined();
    expect(charged!.charged).toBe(true);
    expect(charged!.lessonMistake).toBe(true);
    // …and the repeat really did reach the изпитен лист.
    const r = buildLessonResult(out.state);
    expect(r.score).toBeGreaterThan(0);
    expect((r.lessonMistakes ?? []).map((h) => [h.code, h.charged])).toEqual([[SPEED, true]]);
  });

  it("…and a non-target charge carries `charged` alone, so the card still changes", () => {
    // The arm's own pre-existing lie is fixed for EVERY code, not only for
    // targets: `teachStakeKind` reads `charged` on its own and returns
    // "charged", whose sentence names the sheet instead of denying it.
    const lesson = lessonWith([], { pauseOnError: true });
    const episode = (t0: number) => [
      makeTick({ t: t0, speedKmh: 56 }),
      makeTick({ t: t0 + 1, speedKmh: 56 }),
      makeTick({ t: t0 + 2, speedKmh: 56 }),
      makeTick({ t: t0 + 3, speedKmh: 40 }),
    ];
    const first = play(lesson, episode(0));
    const out = play(lesson, episode(TEACH_PAUSE_MIN_GAP_S + 5), first.state);
    const charged = out.teachMoments.find((m) => m.code === SPEED)!;
    expect(charged.charged).toBe(true);
    expect(charged.lessonMistake).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §5 — the cap reserve
// ---------------------------------------------------------------------------

describe("§5 a target's first row fits inside the cap, and the cap does not move", () => {
  const filler = (n: number): CoachedMistake[] =>
    Array.from({ length: n }, (_, i) => ({ code: "CENTER_LINE_TOUCHED", titleBg: "x", t: i }));

  it("99 incidental rows then a target: the target is recorded, and the list is still ≤ 100", () => {
    // The row a target's first occurrence writes is the ONLY record that it
    // happened — it is never charged — so a drive that spent all 100 places on
    // one stuck-throttle code would otherwise pass a lesson it did not take.
    const lesson = lessonWith([TURN]);
    const seeded: LessonSessionState = {
      ...createLessonSession(lesson),
      coachedMistakes: filler(MAX_COACHED_MISTAKES - 1),
    };
    const out = play(
      lesson,
      [
        makeTick({ t: 0, speedKmh: 30, laneId: 0 }),
        makeTick({
          t: 1,
          speedKmh: 30,
          laneId: 0,
          events: [{ kind: "turnStarted", direction: "left" }],
        }),
      ],
      seeded,
    );
    const rows = out.state.coachedMistakes ?? [];
    expect(rows.map((c) => c.code)).toContain(TURN);
    expect(rows.length).toBeLessThanOrEqual(MAX_COACHED_MISTAKES);
    expect(buildLessonResult(out.state).passed).toBe(false);
  });

  it("an INCIDENTAL row stops short of the cap by the reserve, so the room is really kept", () => {
    // The other side of the same arithmetic: with one target declared, ordinary
    // rows stop one place early. That is what makes the case above reachable
    // rather than lucky.
    const lesson = lessonWith([TURN]);
    const seeded: LessonSessionState = {
      ...createLessonSession(lesson),
      coachedMistakes: filler(MAX_COACHED_MISTAKES - 1),
    };
    const out = play(
      lesson,
      [
        makeTick({ t: 0, speedKmh: 56 }),
        makeTick({ t: 1, speedKmh: 56 }),
        makeTick({ t: 2, speedKmh: 56 }),
      ],
      seeded,
    );
    expect((out.state.coachedMistakes ?? []).map((c) => c.code)).not.toContain(SPEED);
    expect((out.state.coachedMistakes ?? []).length).toBe(MAX_COACHED_MISTAKES - 1);
  });

  it("with NO targets the reserve is zero — every session ADR-009 skips is unchanged", () => {
    // `coached-mistakes-channel.test.ts` drives the cap on a THEO-3 sandbox and
    // expects exactly `MAX_COACHED_MISTAKES`; that suite must not have to know
    // this one exists.
    const lesson = lessonWith([]);
    const seeded: LessonSessionState = {
      ...createLessonSession(lesson),
      coachedMistakes: filler(MAX_COACHED_MISTAKES - 1),
    };
    const out = play(
      lesson,
      [
        makeTick({ t: 0, speedKmh: 56 }),
        makeTick({ t: 1, speedKmh: 56 }),
        makeTick({ t: 2, speedKmh: 56 }),
      ],
      seeded,
    );
    expect((out.state.coachedMistakes ?? []).length).toBe(MAX_COACHED_MISTAKES);
    expect((out.state.coachedMistakes ?? []).map((c) => c.code)).toContain(SPEED);
  });
});
