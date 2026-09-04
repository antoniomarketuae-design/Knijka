/**
 * sc-rx-tram-left:07c63b97 (critical) — „THE TRAM IS NEVER YIELDED TO".
 *
 * `advisor-rail-priority-wait.test.ts` beside this file closes the row's second
 * clause: the wait card at the RED lamp now says the green will release the
 * tram too. This file closes the first clause, which is the one the row leads
 * with and the one that outlived that repair.
 *
 * WHAT WAS STILL BROKEN. `finish.ts yieldReasonAt` decides whether a standstill
 * is a lawful WAIT, and until now it could see exactly four things: a стоп-line
 * ahead, a lamp on it, a pedestrian on a crossing, and a roundabout the route
 * has not done. So on the drill whose whole subject is «Изчакай пред устието …
 * трамваят трябва да премине ИЗЦЯЛО», the decisive stretch — the lamp is green,
 * the tram is coming, the student is correctly standing still — produced NO
 * hold at all:
 *
 *   · `yieldWait.holding` false ⇒ the seconds he stood were not credited
 *     against the lesson's par time, and the idle finish kept counting;
 *   · `yieldWait.reason` null   ⇒ `stepYieldVoice` had no episode to narrate,
 *     so not one of the three НАУЧИ stages could mention the tram;
 *   · `advisorPromptForSession` fell through the live-yield branch back to
 *     `advisorPromptForObjective` — i.e. the coach answered „what now?" by
 *     pointing at the waypoint 50 m past the rails, at the exact moment the
 *     answer was „stand still".
 *
 * The measurement it needed was already being computed and thrown away one
 * module over (`worldRuntime`'s N1 probe measures the oncoming's arrival gap
 * every frame and keeps it only if the player commits a turn). It now travels
 * on the tick as `oncomingRailGapSec` when — and only when — the most urgent
 * oncoming is a РЕЛСОВО ППС, and `yieldReasonAt` turns it into the sixth
 * `YieldReason`.
 *
 * ЗДвП чл. 8, ал. 2 and чл. 37, ал. 1 are RETRIEVED (content/law/acts/zdvp.json)
 * — the same pair the template's own `teach.lawRef` carries.
 *
 * Every block pins the opposite direction too: a channel that armed on cars, on
 * halted trams or on absence would pass a one-sided test and would put a
 * „чакай" card in front of students with an empty road ahead.
 */

import { describe, expect, it } from "vitest";
import {
  YIELD_CARD_LONG_WAIT_S,
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_SETTLE_S,
  YIELD_VOICE_VERDICT_S,
  advisorPromptForSession,
  createYieldVoice,
  stepYieldVoice,
  yieldCardCopyCoversLongWait,
  yieldWaitAdvisorPrompt,
} from "../advisor";
import { applyTick, createLessonSession } from "../engine";
import {
  YIELD_RAIL_GAP_SEC,
  createYieldWait,
  stepYieldWait,
  yieldReasonAt,
  type YieldWaitContext,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { OncomingLeftTurnSpec } from "../../contracts";
import type { HudEvent } from "../../contracts";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

const TRAM = "sc-rx-tram-left";

const template = (id: string) => {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`no such template: ${id}`);
  return spec;
};

const LESSON = compileScenario(template(TRAM), 1);
const CTX: YieldWaitContext = {
  params: LESSON.objectives.map(parseObjectiveParams),
  currentIndex: 0,
};

/** sx-v1: the east arm's westbound lane centre (the sc-turn-left-oncoming pins;
 *  the signalized X node itself is the origin). */
const LANE_Y = 4.06;
/** The mouth — where briefing step 4 tells him to stand. */
const MOUTH = { x: 12, y: LANE_Y };

type LessonNotice = Extract<HudEvent, { kind: "lesson" }>;
const lessonNotices = (events: readonly HudEvent[]): LessonNotice[] =>
  events.filter((e): e is LessonNotice => e.kind === "lesson");

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE CLAUSE — a closing tram is a lawful wait, and nothing else is
   ══════════════════════════════════════════════════════════════════════════ */

describe("yieldReasonAt sees the rails", () => {
  const at = (overrides: Parameters<typeof makeTick>[0]) =>
    yieldReasonAt(makeTick({ position: MOUTH, ...overrides }), CTX, []);

  it("names the tram while it is inside the taught gap", () => {
    expect(at({ oncomingRailGapSec: 1.9 })).toBe("railVehicle");
    expect(at({ oncomingRailGapSec: YIELD_RAIL_GAP_SEC })).toBe("railVehicle");
    expect(at({ oncomingRailGapSec: 0 })).toBe("railVehicle");
  });

  it("…and lets go the moment the rails are clear", () => {
    // The wait must END, or the hold would outlive its own reason and the
    // student would be told to keep standing at an empty junction.
    expect(at({ oncomingRailGapSec: YIELD_RAIL_GAP_SEC + 0.01 })).toBeNull();
    expect(at({ oncomingRailGapSec: 40 })).toBeNull();
  });

  it("ABSENT is unknown, not «the track is clear» — and it holds nobody", () => {
    // Every recorded trace, every fixture and every legacy wiring omits the
    // field. This is the assertion that keeps the whole catalogue's drives
    // byte-identical to before the channel existed.
    expect(at({})).toBeNull();
    expect(makeTick({}).oncomingRailGapSec).toBeUndefined();
  });

  it("refuses a nonsense gap rather than converting it into a hold", () => {
    expect(at({ oncomingRailGapSec: -1 })).toBeNull();
    expect(at({ oncomingRailGapSec: Number.NaN })).toBeNull();
  });

  it("the LAMP still wins at the stop line — no shipped drive changes shape", () => {
    // The clause is deliberately last of the „something is ahead of you" ones.
    // A student stopped at the line on red is waiting for the red: that is what
    // `advisor-rail-priority-wait.test.ts` corrected the copy of, and this row
    // is what keeps this repair from re-opening it.
    const reason = at({
      oncomingRailGapSec: 1.5,
      nextStopLineM: 4,
      nextStopLineControl: "trafficLight",
      nextStopLineState: "red",
    });
    expect(reason).toBe("redLight");
  });

  it("a person on the crossing still outranks the tram", () => {
    const tick = makeTick({ position: MOUTH, oncomingRailGapSec: 1.5 });
    expect(yieldReasonAt(tick, CTX, ["sx-x-1"])).toBe("pedestrian");
  });
});

describe("the hold itself", () => {
  it("standing still for a closing tram IS holding, with the reason named", () => {
    const tick = makeTick({ t: 1, position: MOUTH, speedKmh: 0, oncomingRailGapSec: 2.2 });
    const wait = stepYieldWait(createYieldWait(), tick, CTX);
    expect(wait.holding).toBe(true);
    expect(wait.reason).toBe("railVehicle");
    expect(wait.sinceSec).toBe(1);
  });

  it("but ROLLING toward it is not a wait — the caller owns the standstill bar", () => {
    const rolling = makeTick({ t: 1, position: MOUTH, speedKmh: 9, oncomingRailGapSec: 2.2 });
    expect(stepYieldWait(createYieldWait(), rolling, CTX).holding).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2 · WHAT THE STUDENT IS TOLD — the surface the finding photographed
   ══════════════════════════════════════════════════════════════════════════ */

describe("the live card names the tram, not the lamp", () => {
  const card = yieldWaitAdvisorPrompt("railVehicle").textBg;

  it("says the rail vehicle goes first and that it must pass ENTIRELY", () => {
    expect(card).toContain("трамва");
    expect(card).toContain("ИЗЦЯЛО");
    expect(card).toContain("Чакаш правилно");
  });

  it("never repeats the sentence the drill exists to break", () => {
    // «Тръгваш на зелено» is the fatal misreading here: the same green releases
    // the tram (ЗДвП чл. 8, ал. 2). The generic lamp card said it, and this
    // card must not — nor may it drift back to talking about a signal.
    expect(card).not.toContain("зелено");
    expect(card).not.toContain("червено");
    expect(card).not.toContain("светофар");
  });

  it("has NO second card, at any length of wait", () => {
    // What ends this wait is fourteen metres of tram clearing the rails, so
    // there is no number of seconds at which „огледай и тръгвай" becomes true.
    expect(yieldCardCopyCoversLongWait("railVehicle")).toBe(false);
    for (const held of [0, YIELD_CARD_LONG_WAIT_S, 179]) {
      expect(yieldWaitAdvisorPrompt("railVehicle", held).textBg, `${held}s`).toBe(card);
    }
  });

  it("promises no key, because none of them performs the wait", () => {
    expect(yieldWaitAdvisorPrompt("railVehicle").keys).toEqual([]);
  });
});

describe("the three НАУЧИ stages put the tram in all of them", () => {
  /** One uninterrupted wait, then the departure. */
  function episode(): LessonNotice[] {
    let v = createYieldVoice();
    const out: LessonNotice[] = [];
    const wait = { holding: true, sinceSec: 0.1, reason: "railVehicle" as const, pedestrianCrossingIds: [] };
    let t = 0;
    for (let i = 1; i <= (YIELD_VOICE_SETTLE_S + 1) * 10; i++) {
      t = +(i / 10).toFixed(1);
      const step = stepYieldVoice(v, { t, speedKmh: 0, wait, violations: [] });
      v = step.state;
      out.push(...lessonNotices(step.notices));
    }
    const free = createYieldWait();
    for (let i = 1; i <= (YIELD_VOICE_VERDICT_S + 2) * 10; i++) {
      t = +(t + 0.1).toFixed(1);
      const step = stepYieldVoice(v, { t, speedKmh: 20, wait: free, violations: [] });
      v = step.state;
      out.push(...lessonNotices(step.notices));
    }
    return out;
  }

  it("names the duty, settles the wait and judges it — all three about rails", () => {
    const said = episode();
    expect(said).toHaveLength(3);
    for (const line of said) {
      expect(line.explanationBg.length).toBeGreaterThan(120); // THEO-4: never bare
      expect(`${line.titleBg} ${line.explanationBg}`).toMatch(/трамва|релсов|релси/);
    }
    expect(said[1].titleBg).toContain("Чакането Е маневрата");
  });

  it("every stage cites the two RETRIEVED articles, and only those", () => {
    // ADR-002 — the line spoken during the wait cites what the drill's own
    // teach card cites («ЗДвП чл. 8, ал. 2 и чл. 37»), read out of
    // content/law/acts/zdvp.json. Nothing here is recalled.
    for (const line of episode()) {
      expect(line.lawRef).toBe("ЗДвП чл. 8, ал. 2; чл. 37, ал. 1");
    }
    expect(template(TRAM).teach.lawRef).toContain("чл. 8, ал. 2");
    expect(template(TRAM).teach.lawRef).toContain("чл. 37");
  });

  it("the verdict may say he let it through — because the hold proves he did", () => {
    // The corrected RED copy deliberately refuses this claim: a lamp releasing
    // him says nothing about the tram. THIS reason is different in exactly the
    // way that matters — it can only exist while a rail vehicle is inside four
    // seconds of the junction, so standing through it IS the yield.
    const verdict = episode()[2];
    expect(verdict.titleBg).toContain("Пропусна");
    expect(verdict.titleBg).toMatch(/релсов|трамва/);
  });

  it("…and says nothing at all when the graded channel convicted him", () => {
    // He stood, then cut across anyway. The debrief owns that moment; this
    // channel must not congratulate a student the same screen is penalising.
    let v = createYieldVoice();
    const wait = { holding: true, sinceSec: 0.1, reason: "railVehicle" as const, pedestrianCrossingIds: [] };
    let t = 0;
    for (let i = 1; i <= (YIELD_VOICE_NAME_S + 1) * 10; i++) {
      t = +(i / 10).toFixed(1);
      v = stepYieldVoice(v, { t, speedKmh: 0, wait, violations: [] }).state;
    }
    const out: LessonNotice[] = [];
    const free = createYieldWait();
    for (let i = 1; i <= (YIELD_VOICE_VERDICT_S + 2) * 10; i++) {
      t = +(t + 0.1).toFixed(1);
      const step = stepYieldVoice(v, {
        t,
        speedKmh: 20,
        wait: free,
        // The runtime convicts a barged commit within ~1–3 s of the wheels
        // turning, which is why the verdict is withheld that long in the first
        // place — the fault lands on frame 3, inside the window.
        violations: i === 3 ? ["FAILED_TO_YIELD"] : [],
      });
      v = step.state;
      out.push(...lessonNotices(step.notices));
    }
    expect(out).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE LIVE CONSUMER — a real session, driven through `applyTick`
   ══════════════════════════════════════════════════════════════════════════ */

describe("on a real sc-rx-tram-left session", () => {
  /** Approach the junction, then stand at the mouth with the tram closing. */
  function waitAtTheMouth(railGapSec: number | undefined): {
    state: LessonSessionState;
    t: number;
  } {
    let s = createLessonSession(LESSON);
    s = applyTick(s, makeTick({ t: 0, position: { x: 60, y: LANE_Y }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: 30, y: LANE_Y }, speedKmh: 25 })).state;
    let t = 0.1;
    for (let i = 0; i < 60; i++) {
      t = +(t + 0.1).toFixed(1);
      s = applyTick(
        s,
        makeTick({
          t,
          position: MOUTH,
          speedKmh: 0,
          ...(railGapSec === undefined ? {} : { oncomingRailGapSec: railGapSec }),
        }),
      ).state;
    }
    return { state: s, t };
  }

  it("the wait is a WAIT: held, named, and credited against the par time", () => {
    const { state } = waitAtTheMouth(2.2);
    expect(state.phase).toBe("driving");
    expect(state.yieldWait?.holding).toBe(true);
    expect(state.yieldWait?.reason).toBe("railVehicle");
    // The seconds he stood are subtracted from ориентировъчното време — the
    // measure the settled card promises him («не ти струват нищо»).
    expect(state.yieldWaitSec ?? 0).toBeGreaterThan(5);
  });

  it("and the coach's answer to «what now» is the tram, not the waypoint", () => {
    // THE ROW'S OWN FRAME. Before this, `advisorPromptForSession` fell through
    // to `advisorPromptForObjective` here and pointed at the reach zone 50 m
    // past the rails while the tram was still coming.
    const { state } = waitAtTheMouth(2.2);
    const prompt = advisorPromptForSession(state);
    expect(prompt).not.toBeNull();
    expect(prompt!.textBg).toBe(yieldWaitAdvisorPrompt("railVehicle").textBg);
    expect(prompt!.textBg).toContain("трамва");
  });

  it("…and the НАУЧИ line about the rails actually reaches the HUD", () => {
    // The engine, not the pure fold: `applyTick` is what pushes the voice's
    // notices onto `hudEvents`, and a repair that never reached that push
    // would satisfy every row above and still say nothing to a student.
    let s = createLessonSession(LESSON);
    s = applyTick(s, makeTick({ t: 0, position: { x: 60, y: LANE_Y }, speedKmh: 0 })).state;
    s = applyTick(s, makeTick({ t: 0.1, position: { x: 30, y: LANE_Y }, speedKmh: 25 })).state;
    const said: LessonNotice[] = [];
    let t = 0.1;
    for (let i = 0; i < (YIELD_VOICE_NAME_S + 2) * 10; i++) {
      t = +(t + 0.1).toFixed(1);
      const out = applyTick(
        s,
        makeTick({ t, position: MOUTH, speedKmh: 0, oncomingRailGapSec: 2.2 }),
      );
      s = out.state;
      said.push(...lessonNotices(out.hudEvents));
    }
    expect(said.length).toBeGreaterThan(0);
    expect(said[0].titleBg).toContain("релсово");
    expect(said[0].lawRef).toBe("ЗДвП чл. 8, ал. 2; чл. 37, ал. 1");
  });

  it("the SAME drive without the channel is exactly what it was before", () => {
    // The regression direction. Absent field ⇒ no hold, no card change, no
    // credited seconds: every lesson in the catalogue that stages no tram is
    // untouched by this repair.
    const { state } = waitAtTheMouth(undefined);
    expect(state.yieldWait?.holding).toBe(false);
    expect(state.yieldWait?.reason).toBeNull();
    expect(state.yieldWaitSec ?? 0).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4 · THE BLAST RADIUS, MEASURED
   ══════════════════════════════════════════════════════════════════════════ */

describe("how many lessons can produce this wait at all", () => {
  it("exactly one shipped template stages an oncoming RAIL vehicle", () => {
    // The probe only ever answers about a body that is MOVING, HEAD-ON and
    // within 36 m of a junction node, so an `oncomingLeftTurn` actor is the
    // only staging that can arm it. (The two tram-STOP drills hold their trams
    // at cruise 0 as props, and a жп-прелез train crosses perpendicular —
    // `traffic/oncoming.test.ts` pins both exclusions at the query itself.)
    const staged = SCENARIO_TEMPLATES.flatMap((s) =>
      (s.staged ?? [])
        .filter((e): e is OncomingLeftTurnSpec => e.kind === "oncomingLeftTurn")
        .filter((e) => e.actor.profile === "tram" || e.actor.profile === "train")
        .map(() => s.id),
    );
    expect(staged).toEqual([TRAM]);
  });

  it("and that one really does bring the tram inside the taught gap", () => {
    // Both directions: a channel armed by an actor authored 8 seconds out
    // would never fire on the drill it was built for.
    const ev = (template(TRAM).staged ?? []).find(
      (e): e is OncomingLeftTurnSpec => e.kind === "oncomingLeftTurn",
    );
    expect(ev).toBeDefined();
    expect(ev!.actor.profile).toBe("tram");
    expect(ev!.gapSec).toBeLessThan(YIELD_RAIL_GAP_SEC);
  });
});
