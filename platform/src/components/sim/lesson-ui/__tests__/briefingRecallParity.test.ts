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

import {
  briefingRecallPillShown,
  type BriefingRecallPillStage,
} from "@/modules/sim/hud";

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

  it("the recall pill is the ROOMY leg's — never withheld from it, never held on a phone", () => {
    // ── WHY THIS ONE CASE IS EXECUTED AND NOT MATCHED ───────────────────────
    //
    // It read `expect(gate).not.toMatch(/\bcompact\b/)` for four waves — the
    // intent written as a ban on a TOKEN, which also forbids saying out loud
    // which stage the control belongs to. The pill's parent is the shell's own
    // notify column and that column carries `hidden` on compact, so on a phone
    // the pill was held in the tree and painted nowhere (every mobile leg of
    // the w61 sweep prints «✗ NOT ON THE GLASS — briefing-recall: ⓘ Инструкции
    // · 7 стъпки ▸», 11× on sc-signal-hesitation alone, and the audit probe
    // tried to click it). Saying `!compact` out loud is what the ban forbade.
    //
    // The first rewrite swapped the ban for `toContain("!compact &&")` plus a
    // bare-`compact` refusal, and a round-2 verifier walked through it: insert
    // `compact === true &&` beside the `!compact &&` and the pill paints on NO
    // stage at all — the original defect of sc-signal-hesitation:f5ffccf3, i.e.
    // the roomy student loses the authored steps for the rest of the lesson —
    // while every assertion above still passed. A gate and its opposite have
    // the same tokens; only running it tells them apart.
    //
    // So the gate IS a function now (`briefingRecallPillShown`), and this case
    // asserts the two directions by EXECUTING it, then holds the shell to
    // calling it with nothing contradictory in front.
    const roomy: BriefingRecallPillStage = {
      compact: false,
      recallOffered: true,
      briefingSteps: 7,
      mistakeMode: false,
      ended: false,
      quizUp: false,
      teachQueued: 0,
    };

    // 1. THE ROOMY STAGE STILL PAINTS IT. Drop the `!`, or add any second
    //    `compact` test, and this is the assertion that goes red.
    expect(
      briefingRecallPillShown(roomy),
      "the roomy stage is the one that paints the pill — a gate that withholds " +
        "it there is sc-signal-hesitation:f5ffccf3 restored.",
    ).toBe(true);

    // 2. THE PHONE CANNOT. Its route is the МЕНЮ row, pinned below and in
    //    `hud/__tests__/briefing-auto-open.test.ts`; the numbers for why the
    //    compact column cannot afford a 44 px tenant are beside the mount.
    expect(briefingRecallPillShown({ ...roomy, compact: true })).toBe(false);

    // 3. …AND THE SHELL REALLY CALLS IT, with `compact` passed straight in and
    //    no gate of its own in front — a predicate the component stopped
    //    calling is this programme's commonest failure wearing a repair's
    //    clothes.
    const at = CODE.indexOf('data-hud="briefing-recall"');
    expect(at).toBeGreaterThan(-1);
    const gate = CODE.slice(Math.max(0, at - 700), at);
    expect(gate).toContain("briefingRecallPillShown({");
    expect(gate).toMatch(/briefingRecallPillShown\(\{\s*compact,/);
    // One mention of the token in the whole gate: the one it hands over. A
    // second is either a re-added stage gate or the verifier's `compact ===
    // true &&`, and both are refusals to let the predicate decide.
    expect(
      gate.match(/\bcompact\b/g) ?? [],
      "the pill's mount tests `compact` itself instead of handing it to " +
        "`briefingRecallPillShown` — the gate and its opposite look alike in " +
        "source, which is why this one is executed.",
    ).toHaveLength(1);
  });

  it("every stand-down the panel obeys, the pill obeys — executed, one at a time", () => {
    const roomy: BriefingRecallPillStage = {
      compact: false,
      recallOffered: true,
      briefingSteps: 7,
      mistakeMode: false,
      ended: false,
      quizUp: false,
      teachQueued: 0,
    };
    // `recallOffered` is `briefingRecallOffered(briefingStart)`: the pill is the
    // closed panel's stand-in, never a second copy of an open one, and never a
    // stand-in for a card that has not been DECIDED yet (it painted for two
    // committed frames before the roomy card arrived — lane E round 2).
    expect(briefingRecallPillShown({ ...roomy, recallOffered: false })).toBe(false);
    // Nothing authored is nothing to recall.
    expect(briefingRecallPillShown({ ...roomy, briefingSteps: 0 })).toBe(false);
    // THEO-3 sandbox: the assignment there IS the mistake.
    expect(briefingRecallPillShown({ ...roomy, mistakeMode: true })).toBe(false);
    // The end screen owns the glass.
    expect(briefingRecallPillShown({ ...roomy, ended: true })).toBe(false);
    // …as does a micro-quiz, and a teach moment.
    expect(briefingRecallPillShown({ ...roomy, quizUp: true })).toBe(false);
    expect(briefingRecallPillShown({ ...roomy, teachQueued: 1 })).toBe(false);
  });

  it("it renders exactly when the panel is gone, and stands down with it", () => {
    const at = CODE.indexOf('data-hud="briefing-recall"');
    const gate = CODE.slice(Math.max(0, at - 700), at);
    // The stand-downs are EXECUTED one case up; what is held here is that the
    // shell feeds the predicate the live values rather than constants — a gate
    // that always reads `mistakeMode: false` passes every executed case and
    // still paints a recall pill over the THEO-3 sandbox.
    expect(gate).toContain("recallOffered: briefingRecallShown");
    expect(gate).toContain("briefingSteps: briefing.length");
    expect(gate).toContain("mistakeMode,");
    expect(gate).toContain("ended,");
    expect(gate).toContain("quizUp: activeQuiz !== null");
    expect(gate).toContain("teachQueued: teachQueue.length");
    expect(gate).not.toContain("{!briefingOpen &&");
    expect(CODE).toContain("const briefingRecallShown = briefingRecallOffered(briefingStart);");
  });

  it("a retry is an arrival again — the arrival contract `retry` already claimed", () => {
    // `briefingOpen` had no reset in `retry`, so attempt 2 and every attempt
    // after it started with no briefing on the glass — on BOTH legs, which is
    // why no parity sweep could see it. The three siblings around it were
    // already reset; this one was the omission.
    //
    // Since the founder's 2026-09-20 ruling an ARRIVAL is per-surface (open on
    // the roomy stage, open on a phone only if the student opted in), so the
    // retry dispatches the start machine's `arrive` with the resolved surface
    // and the stored choice; `briefing-start.test.ts` executes what it yields.
    const at = CODE.indexOf("setBriefingRecalled(false)");
    expect(at).toBeGreaterThan(-1);
    expect(CODE.slice(at, at + 400)).toContain(
      'dispatchBriefingStart({ type: "arrive", compact, stored: briefingAutoStored })',
    );
  });

  it("the ✕ keeps its meaning — this adds a way back, it does not retire a control", () => {
    // `onClose={closeBriefing}` on the panel is untouched: pressing ✕ still
    // means „be rid of it". What changed is that being rid of it is no longer
    // permanent on one platform and reversible on the other.
    expect(CODE).toContain("onClose={closeBriefing}");
  });
});
