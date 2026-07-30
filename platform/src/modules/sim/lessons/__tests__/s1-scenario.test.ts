/**
 * S1 unit gates — the scenario plumbing around the P0 prototype:
 *  - resolve.ts: <templateId>@L<n> parsing + wire resolution by recompilation;
 *  - progress.ts: the soft level ladder (L1 open; ≥2★ opens the next rung);
 *  - observation.ts: attempt-trace glances → rubric moments (parking model);
 *  - engine.ts pauseOnError: every scored violation ALSO pauses on L1 —
 *    and stays INERT without the aid (curriculum regression);
 *  - wire.ts: scenario ids resolve, objective details + observedMomentIds
 *    validate defensively.
 */

import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import type { ScenarioTrace } from "../../traces";
import { applyTick, createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { parkingObservationFromTrace } from "../scenario/observation";
import {
  isScenarioLevelUnlocked,
  scenarioLevelProgress,
  SCENARIO_UNLOCK_MIN_STARS,
} from "../scenario/progress";
import {
  isScenarioLessonId,
  parseScenarioLessonId,
  scenarioLessonById,
} from "../scenario/resolve";
import { SC_PARK_PERP_REV } from "../scenario/templates";
import { gradeFinishWire, parseFinishLessonWire } from "../wire";
import type { LessonSessionState, TeachMoment } from "../types";
import { tickWithEvents } from "./fixtures";

// ---------------------------------------------------------------------------
// resolve.ts
// ---------------------------------------------------------------------------

describe("scenario id resolution (resolve.ts)", () => {
  it("recognizes exactly the compiled-rung namespace", () => {
    expect(isScenarioLessonId("sc-park-perp-rev@L1")).toBe(true);
    expect(isScenarioLessonId("sc-park-perp-rev@L5")).toBe(true);
    expect(isScenarioLessonId("sc-park-perp-rev")).toBe(false); // template, not a rung
    expect(isScenarioLessonId("sc-park-perp-rev@L6")).toBe(false);
    expect(isScenarioLessonId("l7-parking")).toBe(false);
    expect(isScenarioLessonId("EX-A-DRY-0001")).toBe(false);
    expect(parseScenarioLessonId("sc-park-perp-rev@L3")).toEqual({
      templateId: "sc-park-perp-rev",
      level: 3,
    });
  });

  it("resolves by RECOMPILATION — identical to the client's compile", () => {
    for (const rung of SC_PARK_PERP_REV.levels) {
      expect(scenarioLessonById(`sc-park-perp-rev@L${rung.level}`)).toEqual(
        compileScenario(SC_PARK_PERP_REV, rung.level),
      );
    }
    expect(scenarioLessonById("sc-park-perp-rev@L5")).toBeUndefined(); // unauthored rung
    expect(scenarioLessonById("sc-unknown-template@L1")).toBeUndefined();
    expect(scenarioLessonById("l7-parking")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// progress.ts — the soft ladder
// ---------------------------------------------------------------------------

describe("scenario level progression (progress.ts)", () => {
  const row = (level: number, stars: number | null) => ({
    lessonId: `sc-park-perp-rev@L${level}`,
    rubricStars: stars,
  });

  it("fresh student: L1 open, everything above locked", () => {
    const p = scenarioLevelProgress(SC_PARK_PERP_REV, []);
    expect(p.map((l) => [l.level, l.unlocked])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
    ]);
  });

  it(`≥ ${SCENARIO_UNLOCK_MIN_STARS}★ marks a level PASSED and opens the next`, () => {
    const twoStars = scenarioLevelProgress(SC_PARK_PERP_REV, [row(1, 2)]);
    expect(twoStars.find((l) => l.level === 1)!.passed).toBe(true);
    expect(twoStars.find((l) => l.level === 2)!.unlocked).toBe(true);
    expect(twoStars.find((l) => l.level === 2)!.unlockedBy).toBe("stars");
    // Two rungs ahead is still shut — the ladder opens one step at a time.
    expect(twoStars.find((l) => l.level === 3)!.unlocked).toBe(false);

    const ladder = scenarioLevelProgress(SC_PARK_PERP_REV, [row(1, 3), row(2, 2), row(3, 3)]);
    expect(ladder.map((l) => l.unlocked)).toEqual([true, true, true, true]);
  });

  /**
   * B9 (doc 86 §3) — RE-BASELINED 2026-07-30. This assertion used to read
   * „1★ does not open the next level", and that was the defect, not the rule.
   *
   * `scoreRubric` pins a run at 1★ whenever `completedAll` is false, and 128
   * of 154 templates carry a `parTimeSec`-only rubric with no measured
   * component — so a single unfinished objective locked the whole rest of the
   * template, including the eighteen ways doc 86 §2 shows the SIMULATOR
   * produced that unfinished objective (a fault fired where the world had no
   * referent, a marker stood past the line it graded, a car had already gone).
   * Founder ruling, verbatim: «Users should always have the option to continue
   * to the next lesson immediately and return later.»
   *
   * So an ATTEMPT opens the next rung and the star bar keeps its real job:
   * saying whether this one was passed. Both facts ship, so nothing is hidden.
   */
  it("B9: one ATTEMPT opens the next rung — 1★ advances but stays unpassed", () => {
    const oneStar = scenarioLevelProgress(SC_PARK_PERP_REV, [row(1, 1)]);
    const l1 = oneStar.find((l) => l.level === 1)!;
    const l2 = oneStar.find((l) => l.level === 2)!;

    expect(l2.unlocked).toBe(true);
    expect(l2.unlockedBy).toBe("attempt");
    // …and the rung he moved past is still visibly owed.
    expect(l1.passed).toBe(false);
    expect(l1.bestStars).toBe(1);
    // The wall never extends past the rung actually attempted.
    expect(oneStar.find((l) => l.level === 3)!.unlocked).toBe(false);
  });

  it("B9: an attempt with NO stars recorded at all still opens the next rung", () => {
    // A session that never produced a rubric row (aborted, or an older row)
    // is still evidence the student was here — the wall was the bug.
    const p = scenarioLevelProgress(SC_PARK_PERP_REV, [row(1, null)]);
    expect(p.find((l) => l.level === 2)!.unlocked).toBe(true);
    expect(p.find((l) => l.level === 1)!.passed).toBe(false);
  });

  it("tracks attempts + best stars per level; foreign rows are ignored", () => {
    const p = scenarioLevelProgress(SC_PARK_PERP_REV, [
      row(1, 1),
      row(1, 3),
      row(1, null),
      { lessonId: "l7-parking", rubricStars: 3 },
      { lessonId: "sc-other-template@L1", rubricStars: 3 },
    ]);
    const l1 = p.find((l) => l.level === 1)!;
    expect(l1.attempts).toBe(3);
    expect(l1.bestStars).toBe(3);
    expect(p.find((l) => l.level === 2)!.attempts).toBe(0);
  });

  it("isScenarioLevelUnlocked mirrors the fold (the save action's guard)", () => {
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 1, [])).toBe(true);
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 2, [])).toBe(false);
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 2, [row(1, 2)])).toBe(true);
    // B9: and on an attempt alone, exactly like the fold above.
    expect(isScenarioLevelUnlocked(SC_PARK_PERP_REV, 2, [row(1, 1)])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// observation.ts — the parking window model
// ---------------------------------------------------------------------------

describe("parkingObservationFromTrace (observation.ts)", () => {
  const MOMENTS = SC_PARK_PERP_REV.rubric!.observation!.moments;

  /** Synthetic attempt: forward 0..20 s, reverse 20..30 s, rest after. */
  function trace(glancesAt: number[]): Pick<ScenarioTrace, "samples" | "events"> {
    const samples = [];
    for (let t = 0; t <= 32; t += 0.5) {
      samples.push({
        tSec: t,
        x: 0,
        y: 0,
        headingDeg: 0,
        steerRad: 0,
        speedKmh: t < 20 ? 8 : t <= 30 ? -4 : 0,
        gear: t >= 20 && t <= 30 ? -1 : 1,
        indicator: "off" as const,
        brakeOn: false,
        throttleOn: false,
      });
    }
    return {
      samples,
      events: glancesAt.map((tSec) => ({ tSec, kind: "glance-rear" as const })),
    };
  }

  it("maps before/during/final windows onto the moments in order", () => {
    // 14 s: within 10 s before reverse (20 s) ✓; 24 s: during ✓; 29 s: final ✓.
    const all = parkingObservationFromTrace(trace([14, 24, 29]), MOMENTS);
    expect(all!.observedMomentIds).toEqual(MOMENTS.map((m) => m.id));

    // Only an early glance far before the reverse (5 s < 20 − 10) → nothing.
    expect(parkingObservationFromTrace(trace([5]), MOMENTS)!.observedMomentIds).toEqual([]);

    // A glance only during the reverse covers ONLY the middle moment.
    expect(parkingObservationFromTrace(trace([22]), MOMENTS)!.observedMomentIds).toEqual([
      MOMENTS[1].id,
    ]);
  });

  it("no reverse phase → null (channel honestly unmeasured)", () => {
    const noReverse = {
      samples: [
        { tSec: 0, x: 0, y: 0, headingDeg: 0, steerRad: 0, speedKmh: 5, gear: 1, indicator: "off" as const, brakeOn: false, throttleOn: false },
        { tSec: 1, x: 1, y: 0, headingDeg: 0, steerRad: 0, speedKmh: 5, gear: 1, indicator: "off" as const, brakeOn: false, throttleOn: false },
      ],
      events: [],
    };
    expect(parkingObservationFromTrace(noReverse, MOMENTS)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// engine.ts — pauseOnError (the L1 aid) + curriculum inertness
// ---------------------------------------------------------------------------

describe("pauseOnError aid (engine.ts)", () => {
  const base: LessonSpec = {
    id: "t-pause",
    order: 99,
    titleBg: "Тест",
    descriptionBg: "тест",
    conceptIds: [],
    spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
    preDrive: false,
    objectives: [],
  };

  function collide(state: LessonSessionState) {
    return applyTick(
      state,
      tickWithEvents(1, [{ kind: "collision", withWhat: "vehicle" }], { speedKmh: 2 }),
    );
  }

  it("WITH the aid: a scored collision ALSO pauses with the teach card (still scored)", () => {
    const lesson: LessonSpec = { ...base, aids: { pauseOnError: true } };
    const r = collide(createLessonSession(lesson));
    const taught: TeachMoment[] = r.teachMoments ?? [];
    expect(taught).toHaveLength(1);
    expect(taught[0].code).toBe("COLLISION");
    // Scoring UNCHANGED — the violation still graded + toasted.
    expect(r.state.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
    const hud: HudEvent[] = r.hudEvents;
    expect(hud.some((e) => e.kind === "violation")).toBe(true);
  });

  it("WITHOUT the aid (every curriculum lesson): behavior unchanged — no pause", () => {
    const r = collide(createLessonSession(base));
    expect(r.teachMoments ?? []).toHaveLength(0);
    expect(r.state.events.some((e) => e.kind === "violation" && e.code === "COLLISION")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// wire.ts — scenario resolution + the S1 metadata channels
// ---------------------------------------------------------------------------

describe("wire — scenario ids + S1 metadata validation", () => {
  const baseWire = {
    lessonId: "sc-park-perp-rev@L1",
    startedAtMs: 1000,
    finishedAtMs: 61_000,
    aborted: false,
    ruleEvents: [],
    objectives: [
      { id: "sc-ppr-position", done: true, completedAtSec: 20 },
      {
        id: "sc-ppr-park",
        done: true,
        completedAtSec: 55,
        detail: {
          kind: "parkInBay",
          attempts: 1,
          inBay: true,
          centerOffsetM: 0.12,
          headingOffsetDeg: 1.5,
          alignment: "centered",
        },
      },
    ],
  };

  it("grades a scenario session by recompiling the rung from the id", () => {
    const graded = gradeFinishWire(baseWire);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.lesson.id).toBe("sc-park-perp-rev@L1");
    expect(graded.result.passed).toBe(true);
    const park = graded.result.objectives.find((o) => o.id === "sc-ppr-park")!;
    expect(park.detail).toMatchObject({ kind: "parkInBay", attempts: 1, alignment: "centered" });
  });

  it("an unauthored rung is an unknown lesson", () => {
    expect(gradeFinishWire({ ...baseWire, lessonId: "sc-park-perp-rev@L5" }).status).toBe(
      "unknown-lesson",
    );
  });

  it("malformed objective details DROP silently (metadata, not a reject)", () => {
    const parsed = parseFinishLessonWire({
      ...baseWire,
      objectives: [
        {
          id: "sc-ppr-park",
          done: true,
          completedAtSec: 55,
          detail: { kind: "parkInBay", attempts: -3, inBay: "yes" },
        },
      ],
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.objectives[0].detail).toBeUndefined();
  });

  it("observedMomentIds: validated, deduped, bounded", () => {
    const ok = parseFinishLessonWire({
      ...baseWire,
      observedMomentIds: ["obs-before-reverse", "obs-before-reverse", "obs-final-check"],
    });
    expect(ok!.observedMomentIds).toEqual(["obs-before-reverse", "obs-final-check"]);

    expect(
      parseFinishLessonWire({ ...baseWire, observedMomentIds: [123] }),
    ).toBeNull();
    expect(
      parseFinishLessonWire({
        ...baseWire,
        observedMomentIds: Array.from({ length: 40 }, (_, i) => `m${i}`),
      }),
    ).toBeNull();
  });
});
