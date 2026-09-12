/**
 * =============================================================================
 * THE ROOMY ✕ WAS STILL A ONE-WAY DOOR — sc-signal-hesitation:f5ffccf3,
 * sc-rb-busy-gap:7bbdd45e.
 * =============================================================================
 *
 * Both rows say the same thing: „the same briefing is a blocking modal on
 * mobile and a persistent side panel on PC" — one lesson, two behaviours.
 * Three quarters of that closed before this suite existed and each quarter
 * closed by giving the PHONE what the desktop already had: the numbering
 * (`briefingLineOrdinal`, c61868b), a route back to the steps
 * (`recallBriefing`, 0258c01), and a lifetime that folds the card once the car
 * is genuinely moving (`compactBriefingFold`, b8b1ce4).
 *
 * WHAT WAS LEFT RAN THE OTHER WAY, and that is why four waves walked past it.
 * `recallBriefing` is reached from the МЕНЮ rail, that row is gated `compact`,
 * and `PlayMenu` itself renders only when `compact` — so on the roomy stage
 * `briefingOpen` had exactly two writers, `useState(true)` at mount and
 * `closeBriefing`, and the second one is terminal. A desktop student who
 * pressed the ✕ on the ИНСТРУКЦИИ panel lost the authored steps for the rest
 * of the lesson; a phone student who pressed «Разбрах» (or the ✕, which
 * `recallBriefing` also undoes by clearing `dismissedOverlayIds`) got them back
 * from the rail. Same gesture, same lesson, two permanences.
 *
 * WHY THESE ARE SOURCE ASSERTIONS. The sibling suite's reason, unchanged: this
 * runs in `node`, the shell cannot be rendered there, and jsdom has no layout
 * in any case. What nothing held is the WIRING — that the recall is a control
 * at all, that it is bound to the same callback the phone uses, that it is NOT
 * inside a `compact` gate, and that it renders exactly when the panel is gone.
 * Every one of those is a place a repair can ship a value nothing reads, which
 * is this programme's commonest failure.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");

/** Code only — a source assertion that cannot tell code from the paragraph
 *  describing it is not a guard, it is a ban on writing the reason down. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CODE = stripComments(SHELL);

describe("the briefing's way back · one rule, two legs", () => {
  it("the roomy stage carries a recall control bound to the phone's own callback", () => {
    // The pill exists AND it is wired. Either half alone is a dead predicate:
    // a named element nothing calls, or a callback no surface reaches.
    expect(CODE).toContain('data-hud="briefing-recall"');
    expect(CODE).toContain("onClick={recallBriefing}");
  });

  it("`recallBriefing` now has TWO callers — the rail and the roomy pill", () => {
    // The compact МЕНЮ row (`onSelect: recallBriefing`) was the only caller for
    // four waves, and that is exactly what made the row survive them. If a
    // future edit deletes one of the two, this is the line that says so.
    const callers = CODE.match(/recallBriefing[,}\s)]/g) ?? [];
    expect(CODE).toContain("onSelect: recallBriefing");
    expect(callers.length).toBeGreaterThanOrEqual(3); // declaration + 2 callers
  });

  it("the recall pill is NOT inside a compact gate — that was the whole defect", () => {
    const at = CODE.indexOf('data-hud="briefing-recall"');
    expect(at).toBeGreaterThan(-1);
    // The 700 characters above the anchor are its own mount expression and the
    // element opening. `compact` appearing there would put the repair back on
    // the leg that never needed it.
    const gate = CODE.slice(Math.max(0, at - 700), at);
    expect(gate).not.toMatch(/\bcompact\b/);
  });

  it("it renders exactly when the panel is gone, and stands down with it", () => {
    const at = CODE.indexOf('data-hud="briefing-recall"');
    const gate = CODE.slice(Math.max(0, at - 700), at);
    // `!briefingOpen`: the pill is the closed panel's stand-in, never a second
    // copy of an open one.
    expect(gate).toContain("!briefingOpen");
    // …and it obeys the same stand-downs the panel does: no briefing in the
    // THEO-3 sandbox, none after the end, and none while a teach moment or a
    // micro-quiz owns the glass.
    expect(gate).toContain("!mistakeMode");
    expect(gate).toContain("!ended");
    expect(gate).toContain("activeQuiz === null");
    expect(gate).toContain("teachQueue.length === 0");
  });

  it("a retry re-opens the panel — the arrival contract `retry` already claimed", () => {
    // `briefingOpen` had no reset in `retry`, so attempt 2 and every attempt
    // after it started with no briefing on the glass — on BOTH legs, which is
    // why no parity sweep could see it. The three siblings around it were
    // already reset; this one was the omission.
    const at = CODE.indexOf("setBriefingRecalled(false)");
    expect(at).toBeGreaterThan(-1);
    expect(CODE.slice(at, at + 400)).toContain("setBriefingOpen(true)");
  });

  it("the ✕ keeps its meaning — this adds a way back, it does not retire a control", () => {
    // `onClose={closeBriefing}` on the panel is untouched: pressing ✕ still
    // means „be rid of it". What changed is that being rid of it is no longer
    // permanent on one platform and reversible on the other.
    expect(CODE).toContain("onClose={closeBriefing}");
  });
});
