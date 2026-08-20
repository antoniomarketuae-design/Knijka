/**
 * =============================================================================
 * O54 — TWO PRODUCERS, ONE INSTRUCTION.  Sweep 161, round 11, the phone half.
 * =============================================================================
 *
 * `hud/overlayQueue.ts` closed the one-item half with `itemEchoesLine` and
 * routed the cross-producer half at `LessonPlayShell.tsx`: *„the two producers
 * must be handed one string … This predicate is what that change would then be
 * checkable against."* This file is that check.
 *
 * WHAT THE FRAMES ACTUALLY SHOW, opened before anything was changed:
 *
 *   sc-vp-readiness/pc-right/01-arrival.png   «ЗАДАЧА 1/2 · Мини контролната
 *     (1440 × 900)                            зона с готов кокпит» and, 30 px
 *                                             under it, «Мини контролната зона
 *                                             с готов кокпит — дръж под 50 км/ч»
 *   sc-follow-tailgater/pc-right/04-t098s.png the same pair for «Успокой
 *                                             темпото и увеличи дистанцията
 *                                             напред»
 *
 * Both are ROOMY frames, and on a roomy stage the pair is `ObjectiveBanner` +
 * `AdvisorCard` — which `advisorEchoTrim` took ownership of on 2026-08-17, so
 * the shipped tree no longer prints them. The frames predate that fix. The
 * routing note attributed the chip to „the queue's `task` item"; the queue is
 * not in those frames at all (`overlayCandidates` is `[]` whenever `!compact`).
 *
 * THE PHONE HALF WAS STILL OPEN AND IT COST MORE THAN A REPEAT. On compact there
 * is no banner, so the queue is the only voice, and it built the same sentence
 * from two rows: `advisor` (title + cap) and `task` (title, with the «Задача
 * N/M» chip). `PRIORITY` ranks advisor 30 over task 20 and both are `AMBIENT`,
 * so the queue printed the advisor's copy, dropped the task's, and counted
 * nothing in the „+N" badge — the phone lost the counter for the whole of every
 * capped rung, to a row saying the same words.
 *
 * The shell now hands them one string: the `task` item owns the sentence and
 * carries the advisor's remainder as its `detailBg`; the `advisor` row is not
 * BUILT for a prompt that is the task's own sentence.
 */

import { describe, expect, it } from "vitest";
// Deep path on purpose, and only from a test: `itemEchoesLine` is the predicate
// `overlayQueue.ts` wrote FOR this change and it is not on `hud/index.ts`'s
// public surface. Adding it there is a one-line edit in another lane's file, so
// it is routed rather than taken — the product code below imports nothing from
// this module, and the same precedent (`components/sim/routeGuidanceCapLabel.test.ts`
// reaching into `@/modules/sim/scene/guidanceRoute`) is already in this tree.
import { itemEchoesLine } from "@/modules/sim/hud/overlayQueue";
import { foldAdvisorIntoTask } from "../LessonPlayShell";

/**
 * The two rows, built by the SHELL'S OWN decision function.
 *
 * `foldAdvisorIntoTask` is the thing the render calls; nothing is re-derived
 * here. That is deliberate and it is this repo's own rule: §2.1 C5 found eight
 * tests asserting over comment-stripped source text, and killing the code they
 * guarded left 867 tests green. This wrapper only spells out what the render
 * then does with the two answers, and the source block at the foot of the file
 * pins that it still does it.
 */
function rows(titleBg: string | null, promptTextBg: string | null) {
  const fold = foldAdvisorIntoTask(promptTextBg, titleBg);
  return {
    /** null ⇒ the row is not built at all. */
    advisorRow:
      promptTextBg !== null && fold.advisorSpeaks ? { lineBg: promptTextBg } : null,
    taskRow:
      titleBg === null || titleBg === ""
        ? null
        : { lineBg: titleBg, detailBg: fold.taskDetailBg },
  };
}

const ZEBRA_TITLE = "Приближи пътеката с готовност за спиране";
const ZEBRA_PROMPT = `${ZEBRA_TITLE} — дръж под 40 км/ч`;

describe("one instruction has one producer on the phone", () => {
  it("the task row carries the sentence and the coaching, and the advisor row is not built", () => {
    const { advisorRow, taskRow } = rows(ZEBRA_TITLE, ZEBRA_PROMPT);
    expect(advisorRow).toBeNull();
    expect(taskRow).toEqual({ lineBg: ZEBRA_TITLE, detailBg: "дръж под 40 км/ч" });
  });

  it("…and `itemEchoesLine` — the predicate the route named — is false for it", () => {
    const { taskRow } = rows(ZEBRA_TITLE, ZEBRA_PROMPT);
    expect(taskRow).not.toBeNull();
    expect(itemEchoesLine(taskRow!)).toBe(false);
  });

  it("MUTATION — re-attaching the prefix is what the predicate catches", () => {
    // The cheapest wrong fix is „put the advisor's WHOLE sentence on the task
    // row", which reads fine on one card and is the same defect: the reader sees
    // the line, then sees the line again as the body. `itemEchoesLine` fires.
    expect(itemEchoesLine({ lineBg: ZEBRA_TITLE, detailBg: ZEBRA_PROMPT })).toBe(true);
    // …and the negative control for that assertion: the shipped pair does not.
    expect(itemEchoesLine({ lineBg: ZEBRA_TITLE, detailBg: "дръж под 40 км/ч" })).toBe(false);
  });

  it("a capless objective leaves the task row alone and still builds no advisor row", () => {
    // `advisorPromptForObjective` returns `{ textBg: titleBg }` verbatim for an
    // objective with nothing to add. That row was a pure duplicate; it is gone,
    // and it took nothing with it — the trim leaves no detail to carry.
    const { advisorRow, taskRow } = rows(ZEBRA_TITLE, ZEBRA_TITLE);
    expect(advisorRow).toBeNull();
    expect(taskRow).toEqual({ lineBg: ZEBRA_TITLE, detailBg: null });
  });
});

describe("the advisor keeps every sentence that is not the task's", () => {
  it("a lawful-wait prompt is still its own row, and still outranks the task", () => {
    // B15-VOICE: while the student waits correctly the queue must speak, and it
    // must speak the WAIT and not the waypoint at the far end of the route. This
    // is the direction a „just delete the advisor row" fix would break — and it
    // would break it silently, because the objective row would still be there.
    const wait = "Изчакай колата отдясно — тя има предимство (чл. 50)";
    const { advisorRow, taskRow } = rows(ZEBRA_TITLE, wait);
    expect(advisorRow).toEqual({ lineBg: wait });
    expect(taskRow).toEqual({ lineBg: ZEBRA_TITLE, detailBg: null });
  });

  it("a sentence that merely BEGINS like the title is not an echo", () => {
    // `advisorEchoTrim`'s own word-boundary rule, re-asserted from this side
    // because it is the false-refusal direction for this row: («Спри»,
    // «Спринтирай до края») must keep the advisor's own card, not be folded into
    // the task as the fragment «нтирай до края».
    const { advisorRow, taskRow } = rows("Спри", "Спринтирай до края");
    expect(advisorRow).toEqual({ lineBg: "Спринтирай до края" });
    expect(taskRow).toEqual({ lineBg: "Спри", detailBg: null });
  });

  it("no objective on the banner ⇒ nothing is being echoed", () => {
    const { advisorRow } = rows(null, ZEBRA_PROMPT);
    expect(advisorRow).toEqual({ lineBg: ZEBRA_PROMPT });
  });
});

describe("the shell builds these two rows from that one decision", () => {
  it("the render is wired to `foldAdvisorIntoTask` and to nothing else", async () => {
    // The ONE thing a pure test of the function cannot see: whether the render
    // still asks it. Comments are stripped first — this repo has been burned by
    // eight tests asserting against prose (§2.1 C5) — and each assertion below
    // names a wire that, cut, would restore the defect in a different way:
    // the gate that decides the advisor row, and the field the task row carries.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs
      .readFileSync(
        path.join(process.cwd(), "src", "components", "sim", "lesson-ui", "LessonPlayShell.tsx"),
        "utf8",
      )
      .replace(/\r\n/g, "\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("const advisorFold = foldAdvisorIntoTask(");
    expect(src).toContain("const taskDetailBg = advisorFold.taskDetailBg;");
    expect(src).toContain(
      "advisorFresh && snap.advisorPrompt !== null && advisorFold.advisorSpeaks",
    );
    expect(src).toContain("detailBg: taskDetailBg,");
    // …and the detail is part of the announcement's identity, or a coaching
    // change under an unchanged objective would go unsaid — which is the second
    // producer growing back to say it.
    expect(src).toContain("${taskDetailBg ?? \"\"}");
  });
});
