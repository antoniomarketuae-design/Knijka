/**
 * THE CARD THAT NEVER ENDED — sc-rb-ped-exit:c1e5b6df.
 *
 * The advisor's wait card was constant for the whole hold, and the hold's own
 * ceiling is three minutes. So a student stopped at a roundabout mouth that had
 * since emptied read «Чакаш правилно — в кръга имат предимство» with «Стоиш
 * вече N секунди и това е правилно» under it, for as long as they sat there.
 *
 * Measured, not argued — `.audit-frames/w10-1/frames/sc-rb-ped-exit__pc-right/`:
 * run.log declares a LAWFUL WAIT at t = 24 s and again at t = 75 s, the card
 * reads the same words on 04-t054s.png as it does forty-five seconds later, and
 * the leg spent 90 s of a 210 s budget standing still because the product kept
 * telling it that standing still was the manoeuvre. The template file
 * (templates-roundabout2.ts) had already measured the other half and routed it
 * here: the ring DOES clear — «pc-right/04-t049s has the circulator mid-ring
 * and 04-t054s, five seconds later, has an EMPTY ring». What survived was the
 * card.
 *
 * THE FIX IS ONE TRANSITION, NOT A COUNTER (advisor.ts rule 1: the shell keys
 * announce/dismiss on the card's text, so a card that counted seconds would
 * re-announce every frame). Three halves to hold:
 *
 *   1. THE TRANSITION — at YIELD_CARD_LONG_WAIT_S and not before.
 *   2. THE SPLIT — the two duties whose end is declared by something outside
 *      the car keep their card FOREVER. This is the half that matters most: a
 *      product that hinted „look again and go" at a red lamp or at a live
 *      crossing would be committing the worst mistake in its catalogue.
 *   3. THE ADDRESS — the session path the shell actually calls reaches it.
 *      Without this the whole thing is a function nothing renders.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  YIELD_CARD_LONG_WAIT_S,
  YIELD_VOICE_SETTLE_S,
  advisorPromptForSession,
  yieldCardCopyCoversLongWait,
  yieldWaitAdvisorPrompt,
} from "../advisor";
import { createLessonSession } from "../engine";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { LessonSessionState, YieldReason, YieldWaitState } from "../types";

/**
 * The duties a driver discharges BY LOOKING, each with the act its second card
 * has to name. Two verbs and not one: you ENTER a roundabout and you MOVE OFF
 * from a line, and the copy says whichever the manoeuvre is — asserting a
 * single shared phrase would have forced the wrong word onto one of them.
 */
const LOOK_AND_GO: Readonly<Record<string, string>> = {
  roundaboutEntry: "влизай сега",
  giveWayLine: "тръгвай сега",
  stopSign: "тръгвай сега",
};
const LOOK_AND_GO_REASONS = Object.keys(LOOK_AND_GO) as YieldReason[];
/** Every „go now" the copy above may use — the corpus the two below may not. */
const GO_NOW_PHRASES = [...new Set(Object.values(LOOK_AND_GO))];
/**
 * The duties something OUTSIDE the car ends — these must never get one.
 *
 * `railVehicle` joined them with the RX-05 repair (sc-rx-tram-left:07c63b97),
 * and it is the row this list exists for: what ends that wait is fourteen
 * metres of tram clearing the rails, so a second card reading „огледай и
 * тръгвай" would be this product hinting a seventeen-year-old across a live
 * tram track. `yieldCardCopyCoversLongWait` must keep saying no for it.
 */
const DECLARED_ELSEWHERE: readonly YieldReason[] = ["redLight", "pedestrian", "railVehicle"];
/** Every reason the card can carry — the corpus §4 measures the column over. */
const ALL_REASONS: readonly YieldReason[] = [...LOOK_AND_GO_REASONS, ...DECLARED_ELSEWHERE];

const heldWait = (reason: YieldReason, sinceSec: number): YieldWaitState => ({
  holding: true,
  sinceSec,
  reason,
  pedestrianCrossingIds: [],
});

// ---------------------------------------------------------------------------
// 1. The transition
// ---------------------------------------------------------------------------

describe("the wait card changes exactly once, and only after it has outlasted its reason", () => {
  it("is the opening card for the whole of a normal wait", () => {
    for (const reason of [...LOOK_AND_GO_REASONS, ...DECLARED_ELSEWHERE]) {
      const opening = yieldWaitAdvisorPrompt(reason).textBg;
      // The two marks the voice already speaks at, and the last tick before the
      // transition. All three must still read the sentence the wait opened on.
      for (const held of [0, YIELD_VOICE_SETTLE_S, YIELD_CARD_LONG_WAIT_S - 0.1]) {
        expect(yieldWaitAdvisorPrompt(reason, held).textBg, `${reason} @ ${held}s`).toBe(opening);
      }
    }
  });

  it("says how the wait ENDS once the look-and-go duties pass the mark", () => {
    for (const reason of LOOK_AND_GO_REASONS) {
      const opening = yieldWaitAdvisorPrompt(reason).textBg;
      const late = yieldWaitAdvisorPrompt(reason, YIELD_CARD_LONG_WAIT_S).textBg;
      expect(late, reason).not.toBe(opening);
      // It must not merely be different — it must name the act that ends the
      // wait. A second card that repeated the reassurance would answer the
      // finding's letter and none of it.
      expect(late, reason).toContain(LOOK_AND_GO[reason]);
      expect(late, reason).not.toContain("Чакаш правилно");
      // …and it must not go back. The 75 s hold in the run.log is the case.
      expect(yieldWaitAdvisorPrompt(reason, 75).textBg, reason).toBe(late);
      expect(yieldWaitAdvisorPrompt(reason, 179).textBg, reason).toBe(late);
    }
  });

  it("an unreadable clock is not a long wait", () => {
    // Same direction as every other stand-down rule in this codebase: a number
    // nobody can read must never be able to change what the student is told.
    for (const reason of LOOK_AND_GO_REASONS) {
      const opening = yieldWaitAdvisorPrompt(reason).textBg;
      expect(yieldWaitAdvisorPrompt(reason, Number.NaN).textBg).toBe(opening);
      expect(yieldWaitAdvisorPrompt(reason, Number.POSITIVE_INFINITY).textBg).toBe(opening);
    }
  });

  it("carries no key chips on either card", () => {
    // The file's own honesty rule: a chip names a control that PERFORMS the
    // step, and „look left again" is not a key.
    for (const reason of LOOK_AND_GO_REASONS) {
      expect(yieldWaitAdvisorPrompt(reason, YIELD_CARD_LONG_WAIT_S).keys).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The split — the half that is a safety rule and not a preference
// ---------------------------------------------------------------------------

describe("a wait ended by something outside the car never gets a second card", () => {
  it("the red lamp and the pedestrian keep their card for the whole hold", () => {
    for (const reason of DECLARED_ELSEWHERE) {
      const opening = yieldWaitAdvisorPrompt(reason).textBg;
      // 179 s is one second under the hold ceiling — the longest a card can
      // possibly be on the glass.
      for (const held of [YIELD_CARD_LONG_WAIT_S, 60, 179]) {
        expect(yieldWaitAdvisorPrompt(reason, held).textBg, `${reason} @ ${held}s`).toBe(opening);
      }
    }
  });

  it("and no card anywhere tells a waiting student to go on a lamp or a crossing", () => {
    // The blunt version of the same claim, stated over the text rather than
    // over the identity — so authoring a „тръгвай" sentence into either of
    // those two rows fails here even if the split above were rearranged.
    for (const reason of DECLARED_ELSEWHERE) {
      for (const held of [0, YIELD_CARD_LONG_WAIT_S, 179]) {
        const text = yieldWaitAdvisorPrompt(reason, held).textBg;
        for (const go of GO_NOW_PHRASES) expect(text, `${reason} @ ${held}s`).not.toContain(go);
      }
    }
  });

  it("the split is exhaustive — a new YieldReason cannot join silently", () => {
    const covered = [...LOOK_AND_GO_REASONS, ...DECLARED_ELSEWHERE].filter((r) =>
      yieldCardCopyCoversLongWait(r),
    );
    expect(covered.sort()).toEqual([...LOOK_AND_GO_REASONS].sort());
    for (const reason of DECLARED_ELSEWHERE) expect(yieldCardCopyCoversLongWait(reason)).toBe(false);
  });

  /* ═════════════════════════════════════════════════════════════════════════
     …AND THE GATE ASKS THIS PREDICATE RATHER THAN ITS OWN COPY OF IT.

     Written 2026-08-26, and it is the row the two above could not supply. Both
     of them call `yieldCardCopyCoversLongWait` and `yieldWaitAdvisorPrompt`
     SEPARATELY and assert each is right on its own; neither would notice the two
     drifting apart, because until this commit the gate did not read the
     predicate — it re-derived the same test inline. The predicate answered a
     question nothing in the product asked.

     This row asserts the IDENTITY: for every reason, at a wait past the
     threshold, the card changes if and only if the predicate says that reason
     has a second card. It fails the moment somebody gives `redLight` or
     `pedestrian` a `longCardBg` without deciding that the predicate agrees — the
     „tidiness" edit the predicate's own docstring names as the thing it exists
     to stop.

     WHAT IT DOES NOT CATCH, and the row below exists because of it: the
     predicate IS `YIELD_VOICE_COPY[reason].longCardBg !== undefined`, so a
     gate that went back to asking `copy.longCardBg` directly would behave
     IDENTICALLY and every assertion here would stay green. Measured, not
     argued — the wire was reverted and 15/15 passed.
     ═══════════════════════════════════════════════════════════════════════ */
  it("the card moves at the threshold EXACTLY where the predicate says it may", () => {
    for (const reason of [...LOOK_AND_GO_REASONS, ...DECLARED_ELSEWHERE]) {
      const opening = yieldWaitAdvisorPrompt(reason).textBg;
      const atThreshold = yieldWaitAdvisorPrompt(reason, YIELD_CARD_LONG_WAIT_S).textBg;
      const moved = atThreshold !== opening;
      expect(moved, `${reason}: the gate and the predicate must not disagree`).toBe(
        yieldCardCopyCoversLongWait(reason),
      );
      // …and one second under the threshold nobody moves, whatever the split
      // says — the transition is the predicate's to allow and the clock's to
      // trigger, and neither may do the other's job.
      expect(
        yieldWaitAdvisorPrompt(reason, YIELD_CARD_LONG_WAIT_S - 1).textBg,
        `${reason}: below the bar`,
      ).toBe(opening);
    }
  });

  /* ═══════════════════════════════════════════════════════════════════════
     THE SOURCE PIN — because the identity above is a tautology.

     Written 2026-08-26, after a verifier caught this file claiming a guard it
     did not provide. A behavioural test cannot tell the two spellings apart,
     because they compute the same boolean. Only reading the gate can.
     ═══════════════════════════════════════════════════════════════════════ */
  it("the gate in advisor.ts CALLS the predicate, not its own copy of it", () => {
    const src = readFileSync(new URL("../advisor.ts", import.meta.url), "utf8");
    const at = src.indexOf("const textBg =");
    expect(at, "the long-wait gate moved — re-point this pin").toBeGreaterThan(-1);
    const gate = src.slice(at, at + 240);
    expect(gate).toContain("yieldCardCopyCoversLongWait(reason)");
  });
});

// ---------------------------------------------------------------------------
// 3. The address — the session path the shell renders
// ---------------------------------------------------------------------------

/** A driving session parked on a live lawful wait, in advisor-sweep161's grammar. */
function waitingSession(scenarioId: string, reason: YieldReason, sinceSec: number, now: number): LessonSessionState {
  const spec = SCENARIO_TEMPLATES.find((s) => s.id === scenarioId);
  if (!spec) throw new Error(`no such template: ${scenarioId}`);
  const lesson = compileScenario(spec, 1);
  return {
    ...createLessonSession(lesson),
    phase: "driving",
    currentObjectiveIndex: 0,
    lastT: now,
    yieldWait: heldWait(reason, sinceSec),
  };
}

describe("the session the shell renders is the one that gets the second card", () => {
  // The lesson the finding was filed off. Its own file already proved the ring
  // clears; this proves the card stops claiming otherwise.
  const SCENARIO = "sc-rb-ped-exit";

  it("`advisorPromptForSession` still opens the wait with the opening card", () => {
    const s = waitingSession(SCENARIO, "roundaboutEntry", 20, 24); // the run.log's first hold
    expect(advisorPromptForSession(s)?.textBg).toBe(
      yieldWaitAdvisorPrompt("roundaboutEntry").textBg,
    );
  });

  it("…and hands over at the mark, on the session's own clock", () => {
    // 20 → 75 is the second LAWFUL WAIT in the run.log, 55 s of standstill.
    const s = waitingSession(SCENARIO, "roundaboutEntry", 20, 75);
    expect(advisorPromptForSession(s)?.textBg).toBe(
      yieldWaitAdvisorPrompt("roundaboutEntry", YIELD_CARD_LONG_WAIT_S).textBg,
    );
    expect(advisorPromptForSession(s)?.textBg).toContain(LOOK_AND_GO.roundaboutEntry);
  });

  it("a hold with no start keeps the opening card rather than guessing", () => {
    const s = waitingSession(SCENARIO, "roundaboutEntry", 20, 75);
    const noStart: LessonSessionState = {
      ...s,
      // waitingSession() always sets yieldWait, but the field is OPTIONAL on
      // LessonSessionState, so spreading it widens holding to boolean|undefined
      // and TS2322 follows. Vitest does not typecheck, so this file was green
      // while tsc was red. Assert what the helper guarantees.
      yieldWait: { ...s.yieldWait!, sinceSec: null },
    };
    expect(advisorPromptForSession(noStart)?.textBg).toBe(
      yieldWaitAdvisorPrompt("roundaboutEntry").textBg,
    );
  });

  it("an exam session gets no card at all, long wait or not", () => {
    // Rule 2 of the block this belongs to: telling a candidate mid-assessment
    // who has priority is telling them the answer. The long card must not be a
    // way around the gate.
    const s = waitingSession(SCENARIO, "roundaboutEntry", 20, 75);
    const exam: LessonSessionState = { ...s, lesson: { ...s.lesson, examMode: true } };
    expect(advisorPromptForSession(exam)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. THE COST — what the second card spends in the column that folds
// ---------------------------------------------------------------------------

/**
 * The first draft of this repair passed everything above and still shipped a
 * defect, and it is the one this programme keeps paying for: a fix that mends
 * one thing by breaking another. The three long cards were 165 / 189 / 170
 * characters against an opening-card corpus whose worst case had ever been 132
 * — +2, +4 and +4 whole lines in the 117 px phone content box.
 *
 * Those lines are not free space. `AdvisorCard`'s own header records it: „the
 * column is height-capped and folds what does not fit (`notifyColumn.ts`), so
 * those lines are … the difference between the sentence being on screen and
 * being behind a «↓ ОЩЕ N РЕДА» badge the driver cannot open at 50 км/ч" — and
 * the sweep filed that badge twice in one run on the card BELOW this one
 * (sc-pe-night-unlit/mobile-right/04-t038s, 04-t060s). Handing the student the
 * sentence that finally tells him how the wait ends, at the price of pushing
 * the card under it off the glass, is not a repair.
 *
 * THE RULE, and it is the strictest one that is also true: the second card may
 * not be TALLER than the card it REPLACES, on either column. Same box, same
 * face, same moment — so a transition that satisfies this costs the column
 * exactly nothing and the corpus worst case cannot move.
 *
 * The instrument is `advisorFace.test.tsx`'s, deliberately: the same greedy
 * wrapper and the same „35 characters per 216 px in the body face" the
 * stylesheet states, so the two files cannot drift into two different opinions
 * about how wide a card is.
 */

/** Greedy word wrap — what a line box does — in whole characters per line. */
function wrapLines(text: string, charsPerLine: number): number {
  const per = Math.max(1, Math.floor(charsPerLine));
  let lines = 1;
  let col = 0;
  for (const word of text.split(" ")) {
    const need = col === 0 ? word.length : col + 1 + word.length;
    if (need > per && col > 0) {
      lines += 1;
      col = word.length;
    } else col = need;
  }
  return lines;
}

/** The reading face's own ratio, quoted from the stylesheet via advisorFace. */
const SANS_CHARS_PER_PX = 35 / 216;
/** `min(15rem, 36vw)` (notifyColumn.ts) less the card's `px-3`: desktop, then
 *  the founder's 393 px phone. */
const ROOMY_CONTENT_PX = 240 - 24;
const PHONE_CONTENT_PX = 141 - 24;

describe("the wrapper is checked before it is believed", () => {
  it("counts a line the way a line box does, on a string counted by hand", () => {
    // "аб вг де" is 8 characters. At 5 per line: "аб вг" then "де" → 2.
    expect(wrapLines("аб вг де", 5)).toBe(2);
    expect(wrapLines("аб вг де", 8)).toBe(1);
    expect(wrapLines("аб вг де", 7)).toBe(2);
    // A single word longer than the line stays one line here — `break-words`
    // splits it in the browser, and counting it as one is the direction that
    // UNDER-reports, i.e. the direction that cannot manufacture a pass.
    expect(wrapLines("аааааааааа", 4)).toBe(1);
  });
});

describe("the second card costs the folding column nothing", () => {
  it("is no taller than the card it replaces, on the phone and on the desktop", () => {
    let measured = 0;
    for (const reason of LOOK_AND_GO_REASONS) {
      const opening = yieldWaitAdvisorPrompt(reason).textBg;
      const late = yieldWaitAdvisorPrompt(reason, YIELD_CARD_LONG_WAIT_S).textBg;
      expect(late, reason).not.toBe(opening);
      measured += 1;
      for (const [box, name] of [
        [PHONE_CONTENT_PX, "phone"],
        [ROOMY_CONTENT_PX, "roomy"],
      ] as const) {
        const before = wrapLines(opening, box * SANS_CHARS_PER_PX);
        const after = wrapLines(late, box * SANS_CHARS_PER_PX);
        expect(after, `${reason} on the ${name} column: ${before} → ${after} lines`).toBeLessThanOrEqual(
          before,
        );
      }
    }
    // ANTI-VACUITY: the walk found the three cards it is about to judge. A
    // future edit that removed `longCardBg` from all three would otherwise
    // leave this row green over an empty loop — the exact way the sibling
    // bus-stop gate in this wave was first written and had to be thrown out.
    expect(measured).toBe(3);
  });

  it("…and the corpus worst case does not move: 9 phone lines, before and after", () => {
    // The number `advisorFace.test.tsx` reasons about when it says „the longest
    // advisor text does not fit the phone column in either face". If a long
    // card were ever the new worst case, that file's conclusions would be about
    // a corpus that no longer exists and nothing would say so.
    const per = PHONE_CONTENT_PX * SANS_CHARS_PER_PX;
    const openings = ALL_REASONS.map((r) => wrapLines(yieldWaitAdvisorPrompt(r).textBg, per));
    const lates = ALL_REASONS.map((r) =>
      wrapLines(yieldWaitAdvisorPrompt(r, YIELD_CARD_LONG_WAIT_S).textBg, per),
    );
    expect(Math.max(...openings)).toBe(9);
    expect(Math.max(...lates)).toBeLessThanOrEqual(Math.max(...openings));
  });
});
