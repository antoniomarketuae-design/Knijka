/**
 * THE COACHED CHANNEL HAS A PRODUCER — findings ef1eb9cf · a448e5f0 ·
 * 0fde4ec0 · faae7057 (suspect file lessons/debrief.ts).
 *
 * `DebriefContext.coachedMistakes` was documented, self-filtered against the
 * ledger and unit-tested — and NO live call site fed it: neither the server
 * action (`actions.ts:315`, the debrief the student actually reads) nor the
 * client fallback (`LessonPlayShell.tsx:3483`) passed the field. The whole
 * repair was dead code, so on the frames the sweep filed the product raised
 * «Превишена скорост» twice at 59 км/ч under a 50 badge
 * (sweep161/sc-signal-flashing/mobile-wrong/04-t012s.png) and then wrote,
 * verbatim, «чисто каране без нито едно нарушение — задръж това ниво».
 *
 * This file drives the channel end to end the way the product now feeds it:
 *   engine state → LessonResult.coachedMistakes → wire (codes only) →
 *   gradeFinishWire (titles re-derived from OUR catalog) → buildDebrief.
 *
 * EVERY CASE IS A PAIR (the debrief-truthfulness discipline): each assertion
 * that a coached drive stops being praised is matched by one that a truly
 * clean drive still IS — a channel that silences the praise for everybody
 * would be the false-refusal direction of the same defect.
 */

import { describe, expect, it } from "vitest";
import { buildSessionSummary } from "../../rules";
import { buildDebrief } from "../debrief";
import {
  applyTick,
  buildLessonResult,
  createLessonSession,
  MAX_COACHED_MISTAKES,
  TEACH_PAUSE_MIN_GAP_S,
} from "../engine";
import { unfinishedVerdictNoteBg } from "../../hud/SessionEndScreen";
import { lessonById } from "../specs";
import type { LessonResult, LessonSessionState } from "../types";
import type { LessonSpec } from "../../contracts";
import { gradeFinishWire, parseFinishLessonWire, serializeCoachedMistakes } from "../wire";
import { makeTick } from "./fixtures";

const lesson: LessonSpec = {
  id: "t-coached",
  order: 99,
  titleBg: "Тест урок",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [],
};

function run(state: LessonSessionState, ticks: Parameters<typeof applyTick>[1][]) {
  let s = state;
  for (const tick of ticks) s = applyTick(s, tick).state;
  return s;
}

/** One minor-speeding episode: 56 km/h in a 50 zone (fires at t0+2), then reset. */
function speedingEpisode(t0: number) {
  return [
    makeTick({ t: t0, speedKmh: 56 }),
    makeTick({ t: t0 + 1, speedKmh: 56 }),
    makeTick({ t: t0 + 2, speedKmh: 56 }),
    makeTick({ t: t0 + 3, speedKmh: 40 }),
  ];
}

describe("engine records shown-but-not-charged violations (the channel's producer)", () => {
  it("a taught first encounter reaches LessonResult.coachedMistakes with catalog copy", () => {
    const s = run(createLessonSession(lesson), speedingEpisode(0));
    const result = buildLessonResult(s);
    expect(result.coachedMistakes).toEqual([
      { code: "SPEEDING_OVER_LIMIT", titleBg: "Превишена скорост", t: 2 },
    ]);
  });

  it("a SCORED repeat stays in the mistakes and out of the coached record — both directions", () => {
    const s1 = run(createLessonSession(lesson), speedingEpisode(0));
    const s2 = run(s1, speedingEpisode(TEACH_PAUSE_MIN_GAP_S + 5));
    const result = buildLessonResult(s2);
    // The repeat was graded (teach-escalation.test.ts proves the grading);
    // the coached record must NOT swallow it into the free pile.
    expect(result.summary.mistakes.map((m) => m.code)).toEqual(["SPEEDING_OVER_LIMIT"]);
    expect(result.coachedMistakes).toHaveLength(1);
    expect(result.coachedMistakes?.[0].t).toBe(2);
  });

  it("the rate-limited toast DOWNGRADE records too — the UI teachQueue never sees that arm", () => {
    // t=1: teach pause for the turn scenario; t=5 (inside the window): a
    // different scenario's first encounter downgrades to the lesson toast.
    const s1 = run(createLessonSession(lesson), [
      makeTick({ t: 0, speedKmh: 30, laneId: 0 }),
      makeTick({
        t: 1,
        speedKmh: 30,
        laneId: 0,
        events: [{ kind: "turnStarted", direction: "left" }],
      }),
      makeTick({ t: 4, speedKmh: 30, laneId: 0 }),
      makeTick({ t: 5, speedKmh: 30, laneId: 1 }),
    ]);
    const result = buildLessonResult(s1);
    const codes = (result.coachedMistakes ?? []).map((c) => c.code);
    expect(codes).toContain("TURN_WITHOUT_INDICATOR");
    // The downgraded-to-toast lane change is on the record although no
    // TeachMoment was ever emitted for it.
    expect(codes).toContain("LANE_CHANGE_WITHOUT_INDICATOR");
  });

  it("a clean drive records nothing — the field stays absent", () => {
    const s = run(createLessonSession(lesson), [
      makeTick({ t: 0, speedKmh: 40 }),
      makeTick({ t: 5, speedKmh: 40 }),
    ]);
    expect(buildLessonResult(s).coachedMistakes).toBeUndefined();
  });

  it("the record caps — a learn-only session re-raising one code cannot grow the state without bound", () => {
    // THEO-3 sandbox (learnOnly): EVERY violation takes the ambient unscored
    // arm, so every episode records — the one shape that could grow unbounded.
    const sandbox: LessonSpec = {
      ...lesson,
      id: "t-coached-sandbox",
      mistakeExperience: { mistakeIndex: 0, codes: [] },
    };
    let s = createLessonSession(sandbox);
    // 130 distinct speeding episodes, far past the cap.
    for (let i = 0; i < 130; i++) s = run(s, speedingEpisode(i * (TEACH_PAUSE_MIN_GAP_S + 5)));
    expect(s.events).toHaveLength(0); // learnOnly: nothing scored…
    const recorded = (s.coachedMistakes ?? []).length;
    expect(recorded).toBe(MAX_COACHED_MISTAKES); // …everything shown, up to the cap
  });
});

describe("the wire carries it and the server re-titles it (ADR-002: no client copy)", () => {
  const l0 = lessonById("l0-free-drive")!;
  const basePayload = {
    lessonId: l0.id,
    startedAtMs: 1_000,
    finishedAtMs: 61_000,
    aborted: false,
    ruleEvents: [],
    objectives: [],
  };

  it("codes+times round-trip; the title is OURS, not the client's", () => {
    const coached = serializeCoachedMistakes([
      { code: "SPEEDING_OVER_LIMIT", t: 2 },
    ]);
    // The wire shape carries no title at all — a client cannot author copy.
    expect(coached).toEqual([{ code: "SPEEDING_OVER_LIMIT", t: 2 }]);
    const graded = gradeFinishWire({ ...basePayload, coachedMistakes: coached });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.coachedMistakes).toEqual([
      { code: "SPEEDING_OVER_LIMIT", titleBg: "Превишена скорост", t: 2 },
    ]);
  });

  it("an uncatalogued code drops silently; a malformed list rejects the payload", () => {
    const graded = gradeFinishWire({
      ...basePayload,
      coachedMistakes: [{ code: "NOT_A_REAL_CODE", t: 3 }],
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.result.coachedMistakes).toBeUndefined();

    // Shape errors are not our payload: negative time, oversize list.
    expect(
      parseFinishLessonWire({ ...basePayload, coachedMistakes: [{ code: "X", t: -1 }] }),
    ).toBeNull();
    expect(
      parseFinishLessonWire({
        ...basePayload,
        coachedMistakes: Array.from({ length: 101 }, (_, i) => ({ code: "X", t: i })),
      }),
    ).toBeNull();
  });

  it("the SERVER debrief names the teach moment and drops the praise — the exact composition actions.ts runs", () => {
    const graded = gradeFinishWire({
      ...basePayload,
      coachedMistakes: [{ code: "SPEEDING_OVER_LIMIT", t: 12 }],
    });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    const text = buildDebrief(graded.lesson, graded.result, {
      coachedMistakes: graded.result.coachedMistakes,
    }).text;
    expect(text).toContain("Учебни моменти (не влизат в точките)");
    expect(text).toContain("Превишена скорост");
    // The invitation to HOLD the standard of a drive that speeded is gone…
    expect(text).not.toContain("задръж това ниво");
  });

  it("…and a truly clean drive still gets its praise whole (the pair)", () => {
    const graded = gradeFinishWire(basePayload);
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    const text = buildDebrief(graded.lesson, graded.result, {
      coachedMistakes: graded.result.coachedMistakes,
    }).text;
    expect(text).toContain("задръж това ниво");
    expect(text).not.toContain("Учебни моменти");
  });
});

describe("the НЕЗАВЪРШЕН note stops denying what the drive showed (finding a448e5f0)", () => {
  /** Unfinished shape: sheet clean+passed, a route task open, not aborted. */
  const unfinished: LessonResult = {
    lessonId: "t-coached",
    summary: buildSessionSummary([]),
    objectives: [{ id: "o1", titleBg: "Задача", done: false, completedAtSec: null }],
    completedAll: false,
    aborted: false,
    passed: false,
    score: 0,
    effectiveScore: 0,
    escalations: [],
    durationSec: 74,
  };

  it("with a teach moment on record the note scopes to the sheet and names the moments", () => {
    const note = unfinishedVerdictNoteBg({
      ...unfinished,
      coachedMistakes: [{ code: "SPEEDING_OVER_LIMIT", titleBg: "Превишена скорост", t: 12 }],
    });
    expect(note).not.toBeNull();
    // The a448e5f0 sentence: an unqualified „no violation" about a drive whose
    // HUD raised «Превишена скорост» twice. Must not come back.
    expect(note).not.toContain("няма нарушение, което");
    expect(note).toContain("учебни моменти");
    expect(note).toContain("остана чист");
  });

  it("with nothing shown the note still clears the drive — scoped to the sheet (the pair)", () => {
    const note = unfinishedVerdictNoteBg(unfinished);
    expect(note).not.toBeNull();
    expect(note).toContain("няма нарушение в изпитния лист");
    expect(note).not.toContain("учебни моменти");
  });
});
