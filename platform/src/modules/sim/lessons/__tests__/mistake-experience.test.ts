/**
 * THEO-3 — the mistake-experience SESSION behavior (doc 64).
 *
 * The sandbox rides the coach's existing learn-only suppression channel
 * (scenarios/coach.ts `learnOnly` → resolveEncounter "learn-only") — never a
 * fork of the engine:
 *  - NOTHING scores: no scored events, no violation toasts, no teach-pause
 *    cards, no escalations — every violation surfaces as an ambient lesson
 *    toast only;
 *  - even опасна/terminating codes stay unscored (the dangerous act IS the
 *    assignment) and never terminate anything;
 *  - the TARGETED code (lesson.mistakeExperience.codes) emits the ONE-SHOT
 *    consequence moment — catalog copy, exactly once per session — and
 *    swallows its own ambient toast (the overlay presents it);
 *  - a lesson WITHOUT the flag behaves exactly as before (teach-first).
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import {
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
} from "../engine";
import type { LessonSessionState, TeachMoment } from "../types";
import { makeTick, tickWithEvents } from "./fixtures";

/** A minimal sandbox lesson targeting the minor-speeding code. */
const speedingSandbox: LessonSpec = {
  id: "sc-test@L1~m0",
  order: 99,
  titleBg: "Тест · Преживей грешката",
  descriptionBg: "Направи грешката нарочно — тук нищо не се оценява. Задачата: тест.",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [],
  mistakeExperience: { mistakeIndex: 0, codes: ["SPEEDING_OVER_LIMIT"] },
};

/** Same sandbox, targeting the опасна red-light code. */
const redLightSandbox: LessonSpec = {
  ...speedingSandbox,
  id: "sc-test@L1~m1",
  mistakeExperience: { mistakeIndex: 1, codes: ["RED_LIGHT_CROSSED"] },
};

function run(
  state: LessonSessionState,
  ticks: Parameters<typeof applyTick>[1][],
): {
  state: LessonSessionState;
  hud: HudEvent[];
  taught: TeachMoment[];
  moments: TeachMoment[];
} {
  let s = state;
  const hud: HudEvent[] = [];
  const taught: TeachMoment[] = [];
  const moments: TeachMoment[] = [];
  for (const tick of ticks) {
    const r = applyTick(s, tick);
    s = r.state;
    hud.push(...r.hudEvents);
    taught.push(...(r.teachMoments ?? []));
    if (r.mistakeMoment !== undefined) moments.push(r.mistakeMoment);
  }
  return { state: s, hud, taught, moments };
}

/** One minor-speeding episode (fires at t0+2), then back under the limit. */
function speedingEpisode(t0: number) {
  return [
    makeTick({ t: t0, speedKmh: 56 }),
    makeTick({ t: t0 + 1, speedKmh: 56 }),
    makeTick({ t: t0 + 2, speedKmh: 56 }),
    makeTick({ t: t0 + 3, speedKmh: 40 }),
  ];
}

describe("scoring suppression (the learn-only channel, session-wide)", () => {
  it("the targeted code emits ONE consequence moment, no toast, nothing scored", () => {
    const r = run(createLessonSession(speedingSandbox), speedingEpisode(0));
    expect(r.moments).toHaveLength(1);
    expect(r.moments[0]).toMatchObject({
      code: "SPEEDING_OVER_LIMIT",
      severity: "vtorostepenna",
      t: 2,
    });
    // Suppressed everywhere else: no scores, no teach pauses, no toasts for
    // the targeted code (the consequence overlay presents it instead).
    expect(r.state.events).toHaveLength(0);
    expect(r.taught).toHaveLength(0);
    expect(r.hud.filter((e) => e.kind === "violation")).toHaveLength(0);
    expect(r.hud.filter((e) => e.kind === "lesson")).toHaveLength(0);
    expect(r.state.penaltyEscalations).toHaveLength(0);
    expect(r.state.mistakeExperienceHitAtSec).toBe(2);
  });

  it("the moment is one-shot: a repeat of the same mistake stays an ambient toast", () => {
    const first = run(createLessonSession(speedingSandbox), speedingEpisode(0));
    const second = run(first.state, speedingEpisode(30));
    expect(second.moments).toHaveLength(0);
    // Still suppressed (learn channel) — surfaced as the ambient lesson toast.
    expect(second.state.events).toHaveLength(0);
    expect(second.hud.filter((e) => e.kind === "violation")).toHaveLength(0);
    expect(second.hud.filter((e) => e.kind === "lesson")).toHaveLength(1);
    // The latch keeps the FIRST hit time.
    expect(second.state.mistakeExperienceHitAtSec).toBe(2);
  });

  it("NON-targeted codes surface as lesson toasts only — never scored, never teach-paused", () => {
    // A red-light run inside the speeding sandbox: not the target, опасна —
    // and STILL unscored (the sandbox suppresses the safety floor by design).
    const r = run(createLessonSession(speedingSandbox), [
      tickWithEvents(1, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
      }),
    ]);
    expect(r.moments).toHaveLength(0);
    expect(r.state.events).toHaveLength(0);
    expect(r.taught).toHaveLength(0);
    expect(r.hud.filter((e) => e.kind === "violation")).toHaveLength(0);
    expect(r.hud.filter((e) => e.kind === "lesson").length).toBeGreaterThanOrEqual(1);
  });

  it("a targeted опасна code produces the moment and никога a termination or score", () => {
    const r = run(createLessonSession(redLightSandbox), [
      tickWithEvents(1, [{ kind: "stopLineCrossed", control: "trafficLight", lightState: "red" }], {
        speedKmh: 30,
      }),
    ]);
    expect(r.moments).toHaveLength(1);
    expect(r.moments[0].code).toBe("RED_LIGHT_CROSSED");
    expect(r.moments[0].severity).toBe("opasna");
    expect(r.state.events).toHaveLength(0);
    expect(r.state.examTermination).toBeUndefined();
    expect(r.state.phase).toBe("driving");
  });

  it("the final result is clean: zero points, no mistakes — the sandbox never grades", () => {
    const r = run(createLessonSession(speedingSandbox), speedingEpisode(0));
    const result = buildLessonResult(finishSession(r.state, 10));
    expect(result.score).toBe(0);
    expect(result.summary.mistakes).toHaveLength(0);
    expect(result.escalations).toHaveLength(0);
  });
});

describe("bit-identical without the flag", () => {
  it("the same lesson minus mistakeExperience keeps teach-first behavior", () => {
    const { mistakeExperience, ...rest } = speedingSandbox;
    void mistakeExperience;
    const normal: LessonSpec = { ...rest, id: "t-normal" };
    const r = run(createLessonSession(normal), speedingEpisode(0));
    // Teach-first: the first minor speeding becomes a teach PAUSE, and no
    // consequence moment exists outside the mode.
    expect(r.taught).toHaveLength(1);
    expect(r.moments).toHaveLength(0);
    expect(r.state.mistakeExperienceHitAtSec).toBeUndefined();
  });
});
