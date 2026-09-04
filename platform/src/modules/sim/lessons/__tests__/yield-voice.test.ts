/**
 * B15-VOICE — „THE VIRTUAL INSTRUCTOR SAYS NOTHING FOR A MINUTE AND THEN SAYS
 * −10."
 *
 * MEASURED at the give-way line of the founder's own drill: for the entire
 * minute a student waits CORRECTLY, nothing was said on the rule surface, on
 * the card or on the teach channel, and the first thing the product ever said
 * to him about the priority car was the penalty. That is a bare verdict
 * delivered by silence — doc 64 THEO-4, requirement zero, ratified by the
 * founder: every feature must act as a virtual driving instructor that
 * EXPLAINS EVERY DECISION, no bare correct/wrong verdicts anywhere, ever.
 *
 * B15 itself (finish.ts, 2026-08-04) made the wait survivable and stopped the
 * rubric billing it as slow. Neither of those is audible. This file pins the
 * part that is: what is said, WHEN, how few times, and the two things it must
 * never do — nag, and coach a candidate mid-exam.
 *
 * The geometry below is the SHIPPED drill's own, not invented here — the same
 * numbers b15-lawful-wait.test.ts measures.
 */

import { describe, expect, it } from "vitest";
import {
  YIELD_VOICE_DEPART_GRACE_S,
  YIELD_VOICE_EPISODE_GAP_S,
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_SETTLE_S,
  YIELD_VOICE_VERDICT_S,
  advisorPromptForSession,
  createYieldVoice,
  stepYieldVoice,
  yieldWaitAdvisorPrompt,
} from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import { createYieldWait } from "../finish";
import { compileScenario } from "../scenario/compile";
import { SC_ROUNDABOUT_ENTRY } from "../scenario/templates-flow";
import type { HudEvent } from "../../contracts";
import { VIOLATIONS } from "../../rules";
import type { LessonSessionState, YieldReason, YieldWaitState } from "../types";
import { makeTick } from "./fixtures";

// --- The founder's drill, exactly as it compiles for a student -------------
const LESSON_L3 = compileScenario(SC_ROUNDABOUT_ENTRY, 3);
/** The approach lane on rb-mini-v1 and the painted М8 give-way bars. */
const LANE_X = 4.06;
const PAINT_Y = -35.725;

type LessonNotice = Extract<HudEvent, { kind: "lesson" }>;

const lessonNotices = (events: readonly HudEvent[]): LessonNotice[] =>
  events.filter((e): e is LessonNotice => e.kind === "lesson");

/** Drive one stationary frame at a pose, collecting every teach-channel line. */
function hold(
  s: LessonSessionState,
  fromT: number,
  seconds: number,
  said: LessonNotice[],
  speedKmh = 0,
  x = LANE_X,
  y = PAINT_Y,
): { state: LessonSessionState; t: number } {
  let state = s;
  let t = fromT;
  for (let i = 0; i < seconds * 10; i++) {
    t = +(t + 0.1).toFixed(1);
    const step = applyTick(state, makeTick({ t, position: { x, y }, speedKmh }));
    state = step.state;
    said.push(...lessonNotices(step.hudEvents));
  }
  return { state, t };
}

/** Roll away from the ring's approach at a plausible pull-away speed. */
function pullAway(
  s: LessonSessionState,
  fromT: number,
  seconds: number,
  said: LessonNotice[],
): { state: LessonSessionState; t: number } {
  let state = s;
  let t = fromT;
  let y = PAINT_Y;
  for (let i = 0; i < seconds * 10; i++) {
    t = +(t + 0.1).toFixed(1);
    y += 0.22; // ~8 km/h toward the ring, still short of the entry latch
    const step = applyTick(state, makeTick({ t, position: { x: LANE_X, y }, speedKmh: 8 }));
    state = step.state;
    said.push(...lessonNotices(step.hudEvents));
  }
  return { state, t };
}

/** The founder's approach: spawn frame, then settle on the paint. */
function atTheLine(lesson = LESSON_L3): { state: LessonSessionState; t: number } {
  let s = createLessonSession(lesson);
  // Frame 1 describes the vehicle at its spawn (pose guard).
  s = applyTick(s, makeTick({ t: 0, position: { x: LANE_X, y: -93 }, speedKmh: 0 })).state;
  s = applyTick(s, makeTick({ t: 0.1, position: { x: LANE_X, y: -50 }, speedKmh: 18 })).state;
  return { state: s, t: 0.1 };
}

// ---------------------------------------------------------------------------
// THE DEFECT ITSELF
// ---------------------------------------------------------------------------

describe("B15-VOICE — the minute of silence at the give-way line", () => {
  it("names what has priority, why, and the article — within two seconds of settling", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine();
    hold(start.state, start.t, 2, said);

    expect(said.length).toBeGreaterThan(0);
    const first = said[0];
    // WHAT has priority.
    expect(first.titleBg).toContain("предимство");
    expect(first.explanationBg).toContain("движещите се в кръга");
    // WHY — the sign at the mouth, which is where the priority actually comes
    // from (the 2026-08-03 content audit: there is no „article for
    // roundabouts" in ЗДвП).
    expect(first.explanationBg).toContain("Б1 или Б2");
    // The gap he is looking for, and which way to look for it.
    expect(first.explanationBg).toContain("НАЛЯВО");
    // Cited the way the rest of the product cites.
    expect(first.lawRef).toContain("ЗДвП чл. 50, ал. 1");
    expect(first.lawRef).toContain("Наредба № РД-02-21-1");
  });

  it("says the waiting IS the manoeuvre once it has lasted long enough to worry him", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine();
    hold(start.state, start.t, YIELD_VOICE_SETTLE_S + 2, said);

    expect(said.length).toBe(2);
    const settled = said[1];
    expect(settled.titleBg).toContain("Чакането Е маневрата");
    // Measured, not a platitude: it tells him how long he has stood…
    expect(settled.explanationBg).toMatch(/Стоиш вече \d+ секунди/);
    // …and that the seconds cost him nothing, which is the fact B15 made true
    // in the rubric and nothing ever told him.
    expect(settled.explanationBg).toContain("ориентировъчното време");
  });

  it("the whole founder wait — 60 s standing still — is no longer silent", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine();
    const waited = hold(start.state, start.t, 60, said);

    expect(waited.state.phase).toBe("driving");
    expect(waited.state.yieldWait?.holding).toBe(true);
    expect(waited.state.yieldWait?.reason).toBe("roundaboutEntry");
    expect(said.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// THE FIRST CONSTRAINT: DO NOT TURN IT INTO A NAG
// ---------------------------------------------------------------------------

describe("B15-VOICE — a line every two seconds would be worse than silence", () => {
  it("two minutes of continuous waiting produce exactly two lines", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine();
    hold(start.state, start.t, 120, said);
    expect(said.length).toBe(2);
  });

  it("two minutes of continuous waiting produce exactly two CARDS", () => {
    // The card's text is the key the shell announces and dismisses on
    // (LessonPlayShell `advisorDismissed` / `useFreshKey`), so a card that
    // counted seconds would re-announce itself on every frame — the nag
    // wearing a different hat.
    //
    // THIS ROW USED TO SAY „constant for the whole wait", AND ONE WAS TOO FEW
    // (sc-rb-ped-exit:c1e5b6df, 2026-08-25). A card that never changes is a
    // card that goes on saying «Чакаш правилно» after the ring it names has
    // emptied — measured at 45 s and again at 70 s on the drill's own frames,
    // and it cost that leg 90 s of a 210 s budget. So the invariant is not
    // „one text" but „one TRANSITION": the anti-nag property is that a
    // two-minute hold produces a countable handful of announcements, and two
    // is the number, exactly as the line count directly above it is two.
    const start = atTheLine();
    const seen: string[] = [];
    let cur = start;
    for (let i = 0; i < 120; i++) {
      cur = hold(cur.state, cur.t, 1, []);
      const p = advisorPromptForSession(cur.state);
      expect(p).not.toBeNull();
      expect(p?.keys).toEqual([]); // there is no key for „carry on doing nothing"
      if (seen[seen.length - 1] !== p?.textBg) seen.push(p!.textBg);
    }
    expect(seen.length).toBe(2);
    // …and the transition is one-way, so the two are not the same text
    // alternating: `seen` collapses runs, so a flicker would count far past 2.
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[0]).toContain("Чакаш правилно");
    expect(seen[1]).toContain("Чакането стана дълго");
  });

  it("creeping one car length up a queue does not re-open the lecture", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine();
    const first = hold(start.state, start.t, 3, said);
    expect(said.length).toBe(1);
    // A 1 s creep, then stopped at the line again — the same junction.
    const crept = hold(first.state, first.t, 1, said, 5, LANE_X, PAINT_Y + 1.4);
    const again = hold(crept.state, crept.t, 3, said, 0, LANE_X, PAINT_Y + 1.4);
    expect(said.length).toBe(1);
    expect(again.state.yieldWait?.holding).toBe(true);
  });

  it("a rolling give-way — legal at Б1 — is never lectured at all", () => {
    // `yieldReasonAt` fires on geometry, so a car that merely slows through
    // the approach has a reason but no wait. Below YIELD_VOICE_NAME_S of
    // standstill nothing is said, and nothing is judged afterwards either.
    const said: LessonNotice[] = [];
    const start = atTheLine();
    const dipped = hold(start.state, start.t, YIELD_VOICE_NAME_S - 0.3, said);
    const rolled = pullAway(dipped.state, dipped.t, YIELD_VOICE_VERDICT_S + 2, said);
    expect(said).toEqual([]);
    expect(rolled.state.phase).toBe("driving");
  });
});

// ---------------------------------------------------------------------------
// THE SECOND CONSTRAINT: NEVER ON THE EXAM
// ---------------------------------------------------------------------------

describe("B15-VOICE — the graded exam is assessed, not taught", () => {
  const EXAM = { ...LESSON_L3, id: "ex-rb", examMode: true as const };

  it("says nothing on the teach channel for a full minute at the same line", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine(EXAM);
    const waited = hold(start.state, start.t, 60, said);
    expect(said).toEqual([]);
    // The hold itself still runs — the candidate must not be closed down for
    // waiting; only the COACHING is withheld.
    expect(waited.state.yieldWait?.holding).toBe(true);
    expect(waited.state.yieldVoice).toBeUndefined();
  });

  it("shows no card either — the same single gate the advisor already used", () => {
    const start = atTheLine(EXAM);
    const waited = hold(start.state, start.t, 30, []);
    expect(advisorPromptForSession(waited.state)).toBeNull();
  });

  it("and the verdict never lands after the candidate goes", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine(EXAM);
    const waited = hold(start.state, start.t, 20, said);
    pullAway(waited.state, waited.t, YIELD_VOICE_VERDICT_S + 3, said);
    expect(said).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// „THEN WHEN HE GOES, SAY WHETHER THE GAP WAS RIGHT"
// ---------------------------------------------------------------------------

describe("B15-VOICE — the gap verdict", () => {
  it("lands once, after the window the rule engine needs to convict a barge", () => {
    const said: LessonNotice[] = [];
    const start = atTheLine();
    const waited = hold(start.state, start.t, 20, said);
    said.length = 0;

    // Not immediately: the honest evidence is what the adjudication does next.
    const early = pullAway(waited.state, waited.t, YIELD_VOICE_VERDICT_S - 1, said);
    expect(said).toEqual([]);

    pullAway(early.state, early.t, 2, said);
    expect(said.length).toBe(1);
    expect(said[0].titleBg).toBe("Интервалът беше добър");
    // It reports the measured wait and the standard, never a bare „правилно".
    expect(said[0].explanationBg).toMatch(/Изчака \d+ с и влезе/);
    expect(said[0].explanationBg).toContain("не беше отчетено нарушение на предимството");
    expect(said[0].explanationBg).toContain("без движещият се в кръга да намалява заради теб");
  });

  it("stays SILENT when the same departure is graded a failure to give way", () => {
    // The one branch that must never speak: a screen that says „good gap"
    // beside a 10-point опасна is worse than the silence this replaces.
    let v = createYieldVoice();
    const held: YieldWaitState = {
      holding: true,
      sinceSec: 0,
      reason: "roundaboutEntry",
      pedestrianCrossingIds: [],
    };
    v = stepYieldVoice(v, { t: 2, speedKmh: 0, wait: held, violations: [] }).state;
    const free = createYieldWait();
    // He goes — and barges.
    v = stepYieldVoice(v, { t: 12, speedKmh: 9, wait: free, violations: [] }).state;
    const convicted = stepYieldVoice(v, {
      t: 13,
      speedKmh: 14,
      wait: free,
      violations: ["FAILED_TO_YIELD"],
    });
    expect(convicted.notices).toEqual([]);
    v = convicted.state;
    // …and it does not arrive late either.
    for (let t = 14; t < 30; t++) {
      const step = stepYieldVoice(v, { t, speedKmh: 14, wait: free, violations: [] });
      expect(step.notices).toEqual([]);
      v = step.state;
    }
  });

  it("waits for the wheels to turn, then gives up on a departure that never comes", () => {
    // A red goes green while the car still stands: the wait ended, the
    // DEPARTURE did not, and the verdict is about the departure.
    let v = createYieldVoice();
    const red: YieldWaitState = {
      holding: true,
      sinceSec: 0,
      reason: "redLight",
      pedestrianCrossingIds: [],
    };
    v = stepYieldVoice(v, { t: 2, speedKmh: 0, wait: red, violations: [] }).state;
    const green = createYieldWait();
    v = stepYieldVoice(v, { t: 10, speedKmh: 0, wait: green, violations: [] }).state;
    expect(v.pending?.wentAtSec).toBeNull();

    // Still standing well past the grace — dropped, unjudged.
    for (let t = 11; t <= 10 + YIELD_VOICE_DEPART_GRACE_S + 2; t++) {
      const step = stepYieldVoice(v, { t, speedKmh: 0, wait: green, violations: [] });
      expect(step.notices).toEqual([]);
      v = step.state;
    }
    expect(v.pending).toBeNull();
  });

  it("a creep that stops again at the same line is not a departure", () => {
    let v = createYieldVoice();
    const held: YieldWaitState = {
      holding: true,
      sinceSec: 0,
      reason: "giveWayLine",
      pedestrianCrossingIds: [],
    };
    v = stepYieldVoice(v, { t: 2, speedKmh: 0, wait: held, violations: [] }).state;
    v = stepYieldVoice(v, { t: 3, speedKmh: 4, wait: createYieldWait(), violations: [] }).state;
    expect(v.pending).not.toBeNull();
    // Back at a standstill at the same line before the window closes.
    const back = stepYieldVoice(v, {
      t: 4,
      speedKmh: 0,
      wait: { ...held, sinceSec: 4 },
      violations: [],
    });
    expect(back.notices).toEqual([]);
    expect(back.state.pending).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// THE CARD, AND HANDING THE WHEEL BACK
// ---------------------------------------------------------------------------

describe("B15-VOICE — the advisor card during and after the wait", () => {
  it("a live yield outranks the objective on the card, and hands it back on release", () => {
    const start = atTheLine();
    const waited = hold(start.state, start.t, 5, []);
    const during = advisorPromptForSession(waited.state);
    expect(during?.textBg).toBe(yieldWaitAdvisorPrompt("roundaboutEntry").textBg);
    expect(during?.textBg).toContain("в кръга имат предимство");

    const gone = pullAway(waited.state, waited.t, 1, []);
    const after = advisorPromptForSession(gone.state);
    expect(after).not.toBeNull();
    expect(after?.textBg).not.toBe(during?.textBg);
  });
});

// ---------------------------------------------------------------------------
// THE COPY ITSELF — every duty speaks, and none of it invents law
// ---------------------------------------------------------------------------

describe("B15-VOICE — the copy", () => {
  const REASONS: YieldReason[] = [
    "giveWayLine",
    "stopSign",
    "redLight",
    "pedestrian",
    "roundaboutEntry",
    // RX-05 (sc-rx-tram-left:07c63b97) — the sixth duty: an oncoming RAIL
    // vehicle closing on the junction. Listed here so its copy is measured by
    // the same properties as the five, not merely added beside them.
    "railVehicle",
  ];

  /** Run one full episode for a reason and collect everything it says. */
  function episode(reason: YieldReason): LessonNotice[] {
    const wait: YieldWaitState = {
      holding: true,
      sinceSec: 0,
      reason,
      pedestrianCrossingIds: [],
    };
    const out: LessonNotice[] = [];
    let v = createYieldVoice();
    for (let i = 1; i <= (YIELD_VOICE_SETTLE_S + 2) * 10; i++) {
      const t = i / 10;
      const step = stepYieldVoice(v, { t, speedKmh: 0, wait, violations: [] });
      v = step.state;
      out.push(...lessonNotices(step.notices));
    }
    const free = createYieldWait();
    for (let i = 0; i <= (YIELD_VOICE_VERDICT_S + 2) * 10; i++) {
      const t = YIELD_VOICE_SETTLE_S + 2 + i / 10;
      const step = stepYieldVoice(v, { t, speedKmh: 9, wait: free, violations: [] });
      v = step.state;
      out.push(...lessonNotices(step.notices));
    }
    return out;
  }

  it("every reason gets all three stages, and every one of them cites an article", () => {
    for (const reason of REASONS) {
      const said = episode(reason);
      expect(said.length, reason).toBe(3);
      for (const line of said) {
        expect(line.titleBg.length, reason).toBeGreaterThan(8);
        // THEO-4: never a bare verdict — every line carries a real explanation.
        expect(line.explanationBg.length, reason).toBeGreaterThan(120);
        expect(line.lawRef, reason).toBeTruthy();
        expect(line.lawRef, reason).toMatch(/чл\./);
      }
      // The middle line is the one that says waiting is not a stall.
      expect(said[1].titleBg, reason).toContain("Чакането Е маневрата");
    }
  });

  it("the citations are RETRIEVED, not recalled — byte-identical to the graded card", () => {
    // ADR-002. Where a code grades the same duty, the line spoken while he
    // waits cites exactly what the toast would cite if he failed it.
    expect(episode("stopSign")[0].lawRef).toBe(VIOLATIONS.STOP_SIGN_NO_FULL_STOP.lawRef);
    expect(episode("pedestrian")[0].lawRef).toBe(VIOLATIONS.PEDESTRIAN_NOT_YIELDED.lawRef);
    expect(episode("redLight")[0].lawRef).toContain(VIOLATIONS.RED_LIGHT_CROSSED.lawRef);
  });

  it("the roundabout does NOT cite чл. 50а — the citation the content audit retracted", () => {
    // 2026-08-03: чл. 50а is the BLOCKED-junction rule and says nothing about
    // roundabouts; the whole bank was corrected off it. The roundabout lines
    // must not reintroduce it, and must carry the RESOLVABLE half of the
    // drill's own authored `teach.lawRef` — ЗДвП чл. 50, ал. 1, whose text is
    // in content/law/acts/zdvp.json and can be quoted at the student.
    for (const line of episode("roundaboutEntry")) {
      expect(line.lawRef).not.toContain("чл. 50а");
      expect(line.lawRef).toContain("ЗДвП чл. 50, ал. 1");
      expect(line.lawRef).toContain("Наредба № РД-02-21-1");
    }
    expect(SC_ROUNDABOUT_ENTRY.teach.lawRef).toContain("ЗДвП чл. 50, ал. 1");
    // The red-light line DOES cite чл. 50а — for what it actually says, the
    // duty not to enter a junction you cannot clear.
    expect(episode("redLight")[0].lawRef).toContain("ЗДвП чл. 50а");
    expect(episode("redLight")[0].explanationBg).toContain("напречното движение");
  });

  it("nothing this module AUTHORS pins an article number on an act the repo lacks", () => {
    // `modules/lesson/clearanceCitations.ts`: a pinned citation may only be
    // RESOLVABLE (the act is in content/law/acts and the unit resolves) or
    // NUMBERLESS. „Наредба № РД-02-21-1/23.11.2023 чл. 61, ал. 5" — for this
    // exact Б3 claim — is named there as one of the two worst citations in the
    // classroom, because that act is not in the repo at all. It must not come
    // back through this surface.
    //
    // SCOPE, deliberately: the three reasons whose citation THIS file authors.
    // `stopSign` and `pedestrian` retrieve theirs from the rule catalog and are
    // asserted byte-identical below instead — the wait and the fault saying the
    // same thing is the stronger property, and the catalog's own
    // STOP_SIGN_NO_FULL_STOP row still carries a numbered Наредба article
    // („чл. 60, ал. 1") that the same clearance rule forbids. That is a shipped
    // GRADED citation and belongs to the law lane, not to a fix for silence.
    for (const reason of [
      "giveWayLine",
      "redLight",
      "roundaboutEntry",
      // RX-05: `LAW_RAIL_PRIORITY` is authored in advisor.ts too (ЗДвП чл. 8,
      // ал. 2; чл. 37, ал. 1 — both retrieved from content/law/acts/zdvp.json).
      "railVehicle",
    ] as YieldReason[]) {
      for (const line of episode(reason)) {
        for (const ref of line.lawRef?.match(/Наредба[^;]*/g) ?? []) {
          expect(ref, `${reason}: ${line.lawRef}`).not.toMatch(/чл\.\s*\d/);
        }
      }
    }
  });

  it("a card line exists for every reason and fits the 240 px column", () => {
    for (const reason of REASONS) {
      const p = yieldWaitAdvisorPrompt(reason);
      expect(p.keys, reason).toEqual([]);
      expect(p.textBg.length, reason).toBeGreaterThan(40);
      expect(p.textBg.length, reason).toBeLessThan(150);
    }
  });

  it("the next junction IS explained again — an episode gap apart", () => {
    let v = createYieldVoice();
    const wait: YieldWaitState = {
      holding: true,
      sinceSec: 0,
      reason: "giveWayLine",
      pedestrianCrossingIds: [],
    };
    v = stepYieldVoice(v, { t: 2, speedKmh: 0, wait, violations: [] }).state;
    const free = createYieldWait();
    for (let t = 3; t <= 3 + YIELD_VOICE_EPISODE_GAP_S + 2; t++) {
      v = stepYieldVoice(v, { t, speedKmh: 30, wait: free, violations: [] }).state;
    }
    const t2 = 3 + YIELD_VOICE_EPISODE_GAP_S + 3;
    const next = stepYieldVoice(v, {
      // One frame past the naming mark (0.1 s is the shell's tick pitch) —
      // sitting exactly ON it is a float coin-toss, not a behaviour.
      t: t2 + YIELD_VOICE_NAME_S + 0.1,
      speedKmh: 0,
      wait: { ...wait, sinceSec: t2 },
      violations: [],
    });
    expect(next.notices.length).toBe(1);
    expect(lessonNotices(next.notices)[0].titleBg).toContain("Б1");
  });
});
