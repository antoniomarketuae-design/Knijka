/**
 * ONE FAULT, ONE ONE-LINER — sc-roundabout-entry:fe081cf1, the clauses rig-w3d
 * left open (2026-10-12), item 3.
 *
 * THE TWO FRAMES. One drive, one fault — COLLISION, `detail: "staticObject"`,
 * the roundabout's island struck at 3.6 км/ч — driven on two lenses at 8cb0707
 * (`.audit-frames/rig-w3d/sc-roundabout-entry/fe081cf1/`):
 *
 *   pc-L3-F-ON-20      «Удар в неподвижно препятствие / Не се появи внезапно.»
 *   phone-L1-SC2-02    «Удар в неподвижно препятствие / Спирачният път не стигна.»
 *
 * Same title, two different reasons. The PC line is the catalogue's summary of
 * THAT crash (`COLLISION_CONTACT_COPY.staticObject.peekBg`). The phone line is
 * the POOLED row's (`VIOLATIONS.COLLISION.peekBg`), whose own comment says it is
 * «used only when the contact channel could not say WHAT was struck» — and the
 * channel had said. It printed because the phone's fault surface at L1 is the
 * paused teach card, the shell built that card's one-liner from the moment's
 * CODE (`teachMomentPeekBg(code)`), and a `TeachMoment` carried neither the act
 * nor the line. «Спирачният път не стигна» is also not true of this drive: the
 * car left the carriageway, which is the explanation's own point.
 *
 * WHAT IS ASSERTED. The engine is the one place that holds both the code and
 * the act, and it already retrieves the line for the toast it raises on the
 * same tick. So the moment must carry that same line, and these rows compare
 * the two channels' strings to each other and to the catalogue — never to a
 * literal typed here (ADR-002: retrieved, not written).
 */
import { describe, expect, it } from "vitest";
import type { HudEvent, LessonSpec } from "../../contracts";
import { COLLISION_CONTACT_COPY, VIOLATIONS, violationPeekBg } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import type { TeachMoment } from "../types";
import { tickWithEvents } from "./fixtures";

const BASE: LessonSpec = {
  id: "t-one-liner",
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [],
};

/** L1 «Пълна помощ»: every graded fault ALSO pauses with the teach card. */
const PAUSING: LessonSpec = { ...BASE, aids: { pauseOnError: true } };

type Body = "vehicle" | "pedestrian" | "cyclist" | "staticObject";

function strike(lesson: LessonSpec, withWhat: Body) {
  const r = applyTick(
    createLessonSession(lesson),
    tickWithEvents(1, [{ kind: "collision", withWhat }], { speedKmh: 3.6 }),
  );
  const toast = r.hudEvents.find(
    (e): e is Extract<HudEvent, { kind: "violation" }> => e.kind === "violation",
  );
  const moments: TeachMoment[] = r.teachMoments ?? [];
  return { toast, moment: moments[0] };
}

/** The moment's own one-liner, read structurally so the row is RED on an assertion
 *  (and not on a compile) on a tree whose `TeachMoment` has no such field. */
function oneLinerOf(moment: TeachMoment | undefined): unknown {
  return (moment as { peekBg?: unknown } | undefined)?.peekBg;
}

describe("COLLISION / staticObject — the row's own fault, on both channels of one tick", () => {
  it("the catalogue really authors two different lines for this code (the split the phone lost)", () => {
    const act = violationPeekBg("COLLISION", "staticObject");
    const pooled = violationPeekBg("COLLISION", undefined);
    expect(act).toBe(COLLISION_CONTACT_COPY.staticObject.peekBg);
    expect(pooled).toBe(VIOLATIONS.COLLISION.peekBg);
    expect(act).not.toBe(pooled);
  });

  it("the toast (PC column, phone L3 peek) prints the ACT's line", () => {
    const { toast } = strike(PAUSING, "staticObject");
    expect(toast, "a struck island is graded on sight").toBeDefined();
    expect(toast!.titleBg).toBe(COLLISION_CONTACT_COPY.staticObject.titleBg);
    expect(toast!.peekBg).toBe(COLLISION_CONTACT_COPY.staticObject.peekBg);
  });

  it("…and the teach moment raised on the same tick (phone L1 paused card) carries the SAME line", () => {
    const { toast, moment } = strike(PAUSING, "staticObject");
    expect(moment, "the L1 aid pauses on the graded fault").toBeDefined();
    expect(moment!.titleBg).toBe(toast!.titleBg);
    expect(oneLinerOf(moment), "the moment carries no one-liner — the shell can only reach the pooled row").toBe(
      toast!.peekBg,
    );
    expect(oneLinerOf(moment)).not.toBe(VIOLATIONS.COLLISION.peekBg);
  });
});

describe("every struck body: the moment's line is the toast's line", () => {
  for (const body of ["vehicle", "pedestrian", "cyclist", "staticObject"] as const) {
    it(`COLLISION / ${body}`, () => {
      const { toast, moment } = strike(PAUSING, body);
      expect(toast).toBeDefined();
      expect(moment).toBeDefined();
      expect(oneLinerOf(moment)).toBe(toast!.peekBg);
      expect(oneLinerOf(moment)).toBe(violationPeekBg("COLLISION", body));
    });
  }
});

describe("the first-encounter teach arm (no toast on that tick) carries the act's line too", () => {
  it("a first minor fault is taught, not billed — and its card still has the catalogue's line", () => {
    // 56 in a 50 zone: taught on the first episode (engine.test.ts, „teach-
    // first-then-grade"). No violation toast exists on this tick to compare
    // with, so the comparison is with the catalogue's own selector.
    let s = createLessonSession(BASE);
    const taught: TeachMoment[] = [];
    for (const t of [0, 1, 2, 3]) {
      const r = applyTick(s, tickWithEvents(t, [], { speedKmh: 56 }));
      s = r.state;
      taught.push(...(r.teachMoments ?? []));
    }
    expect(taught).toHaveLength(1);
    expect(taught[0]!.code).toBe("SPEEDING_OVER_LIMIT");
    expect(oneLinerOf(taught[0])).toBe(violationPeekBg("SPEEDING_OVER_LIMIT", undefined));
  });
});
