/**
 * A SPEED FAULT SAYS THE TWO NUMBERS IT CONVICTED ON, AND SAYS THEM FIRST.
 * w10-4, 2026-08-24 — findings sc-sp-curve:02e43576, sc-sp-curve:2f4e0a54,
 * sc-speed-transition:d11bc3a4.
 *
 * THE FRAMES, opened at device resolution (iPhone 16 landscape, 2556 × 1179):
 *
 *   sc-sp-curve/mobile-wrong/04-t193s.png
 *     card    «⚠ −1 ИЗПИТНА Т. · Превишена скорост · Движеше се над разрешената»
 *     cluster **11 км/ч** · posted badge 90 · «↓ ОЩЕ 4 РЕДА»
 *     (the same cluster read 97 at 04-t188s, five seconds earlier)
 *
 *   sc-speed-transition/mobile-wrong/04-t018s.png
 *     card    «⚠ −10 ИЗПИТНИ Т.  +2 · Превишаване с повече от 10 км/ч»
 *     cluster 59 км/ч · disc 30 · «↓ ОЩЕ 5 РЕДА» and NOT ONE body line
 *
 * Both cards are true and neither is legible as true: they price a moment that
 * has passed and print no measurement, so on the first frame the accusation
 * stands over a speedometer reading eleven, and on the second the student is
 * handed a penalty with the whole explanation behind a fold.
 *
 * WHAT THIS FILE ASSERTS is the repair in `engine.ts withSpeedMeasurement`: the
 * display text of a speed fault OPENS with the speed the reducer convicted on
 * and the number it was measured against, and the catalogue's teaching follows
 * behind it whole. Leading is the load-bearing half — the compact peek's whole
 * budget after the mirror lane is 95.8 px (`notifyColumn.ts`), which is where
 * «ОЩЕ 4 РЕДА» comes from, so an appended sentence is a sentence nobody reads.
 *
 * AND THE SCORE IS UNTOUCHED, asserted in the same breath: this is the
 * `withFollowingGapDetail` contract one code family over — the scored event and
 * the wire keep the catalogue's fixed copy, so a display readout can never
 * become a grading input.
 */

import { describe, expect, it } from "vitest";

import { applyTick, buildLessonResult, createLessonSession } from "../engine";
import { serializeRuleEvents } from "../wire";
import type { LessonSpec } from "../../contracts";
import type { LessonSessionState } from "../types";
import { makeTick } from "./fixtures";

const lesson: LessonSpec = {
  id: "t-speed-readout",
  order: 99,
  titleBg: "Тест урок",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [],
};

interface Run {
  state: LessonSessionState;
  /** Every violation the HUD was handed, in order, with its DISPLAY text. */
  cards: { titleBg: string; explanationBg: string }[];
}

function run(ticks: Parameters<typeof applyTick>[1][]): Run {
  let state = createLessonSession(lesson);
  const cards: Run["cards"] = [];
  for (const tick of ticks) {
    const step = applyTick(state, tick);
    state = step.state;
    for (const ev of step.hudEvents) {
      if (ev.kind === "violation") {
        cards.push({ titleBg: ev.titleBg, explanationBg: ev.explanationBg ?? "" });
      }
    }
    for (const m of step.teachMoments ?? []) {
      cards.push({ titleBg: m.titleBg, explanationBg: m.explanationBg ?? "" });
    }
  }
  return { state, cards };
}

/** Sustained overspeed at `speedKmh` under `maxSpeedKmh`, then a clean tick. */
function overspeed(speedKmh: number, maxSpeedKmh: number, t0 = 0) {
  return [
    makeTick({ t: t0, speedKmh, maxSpeedKmh }),
    makeTick({ t: t0 + 1, speedKmh, maxSpeedKmh }),
    makeTick({ t: t0 + 2, speedKmh, maxSpeedKmh }),
    makeTick({ t: t0 + 3, speedKmh, maxSpeedKmh }),
    makeTick({ t: t0 + 4, speedKmh: 20, maxSpeedKmh }),
  ];
}

describe("the live speed card leads with the measurement", () => {
  it("the harness sees a card at all (the instrument, before what it measures)", () => {
    // A sweep that convicts nothing proves nothing. If the episode thresholds
    // ever move, this fails first and names itself rather than letting the
    // assertions below pass by inspecting an empty list.
    const { cards } = run(overspeed(59, 50));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.titleBg === "Превишена скорост")).toBe(true);
  });

  it("«Превишена скорост» opens with the speed and the limit — sc-sp-curve/04-t193s", () => {
    // The frame's own numbers: 97 км/ч measured, 90 posted, and a cluster
    // reading 11 by the time the student reads the card.
    const { cards } = run(overspeed(97, 90));
    const card = cards.find((c) => c.titleBg === "Превишена скорост");
    expect(card, "no Превишена скорост card was raised").toBeDefined();
    expect(card!.explanationBg.startsWith("Отчетена скорост 97 км/ч при разрешени 90 км/ч.")).toBe(
      true,
    );
    // …and the catalogue's teaching is still behind it, entire.
    expect(card!.explanationBg).toContain("Ограничението е таван, не цел");
  });

  it("«Превишаване с повече от 10 км/ч» does too — sc-speed-transition/04-t018s", () => {
    const { cards } = run(overspeed(59, 30));
    const card = cards.find((c) => c.titleBg === "Превишаване с повече от 10 км/ч");
    expect(card, "no опасна speeding card was raised").toBeDefined();
    expect(card!.explanationBg.startsWith("Отчетена скорост 59 км/ч при разрешени 30 км/ч.")).toBe(
      true,
    );
    expect(card!.explanationBg).toContain("На практическия изпит това е опасна грешка");
  });

  it("the curve fault names the ТАБЕЛА and never calls it „разрешена“", () => {
    // THE SCALES MAY NOT BE BLURRED. An А1 advisory plate is чл. 20, ал. 2 —
    // exceeding it is „несъобразена скорост", not the чл. 182 speeding ladder —
    // so the sentence says «препоръчителни … от табелата». Priced any other way
    // this card would read as a fine the student does not owe.
    const ticks = [
      makeTick({ t: 0, speedKmh: 70, maxSpeedKmh: 90, curveAdvisoryKmh: 50 }),
      makeTick({ t: 1, speedKmh: 70, maxSpeedKmh: 90, curveAdvisoryKmh: 50 }),
      makeTick({ t: 2, speedKmh: 70, maxSpeedKmh: 90, curveAdvisoryKmh: 50 }),
      makeTick({ t: 3, speedKmh: 70, maxSpeedKmh: 90, curveAdvisoryKmh: 50 }),
      makeTick({ t: 4, speedKmh: 70, maxSpeedKmh: 90, curveAdvisoryKmh: 50 }),
    ];
    const card = run(ticks).cards.find((c) => c.titleBg === "Несъобразена скорост в завой");
    expect(card, "no curve card was raised").toBeDefined();
    expect(
      card!.explanationBg.startsWith("Отчетена скорост 70 км/ч при препоръчителни 50 км/ч от табелата."),
    ).toBe(true);
    expect(card!.explanationBg).not.toContain("при разрешени");
  });

  it("a fault with no measurement to report is byte-identical to the catalogue", () => {
    // The false-refusal direction of a readout: a rule that must always print a
    // number starts inventing one. Every code outside the speed family — and a
    // speed code whose detail never arrived — passes through untouched.
    const { cards } = run([
      makeTick({ t: 0, speedKmh: 30, laneId: 0 }),
      makeTick({
        t: 1,
        speedKmh: 30,
        laneId: 0,
        events: [{ kind: "turnStarted", direction: "left" }],
      }),
    ]);
    const card = cards.find((c) => c.titleBg.includes("мигач"));
    expect(card, "no indicator card was raised").toBeDefined();
    expect(card!.explanationBg.startsWith("Отчетена")).toBe(false);
  });

  it("the SCORED event and the wire keep the catalogue's copy — display only", () => {
    // The whole reason this may be done at all (ADR-002, and the contract
    // `withFollowingGapDetail` states one function up): the graded truth is the
    // server-rebuilt catalogue text, so nothing a card says can reach a score.
    const { state } = run([...overspeed(97, 90, 0), ...overspeed(97, 90, 30)]);
    const result = buildLessonResult(state);
    const scored = result.summary.mistakes.find((m) => m.code === "SPEEDING_OVER_LIMIT");
    expect(scored, "the repeat was never graded — the fixture stopped convicting").toBeDefined();
    expect(scored!.explanationBg.startsWith("Движеше се над разрешената скорост.")).toBe(true);
    expect(scored!.explanationBg).not.toContain("Отчетена скорост");
    // …and the wire carries codes and details, never the card's sentence.
    const wire = serializeRuleEvents(state.events, state.penaltyEscalations, []);
    expect(JSON.stringify(wire)).not.toContain("Отчетена");
  });
});
