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
import {
  advisorTaskFold,
  advisorTaskRows,
  foldAdvisorIntoTask,
  taskAnnounceKey,
  type AdvisorTaskGate,
} from "../LessonPlayShell";
// §2 additions — the queue rows are rendered here, not described.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectOverlay, SimOverlay, type SimOverlayItem } from "@/modules/sim/hud";
import { yieldWaitAdvisorPrompt, type AdvisorPrompt } from "@/modules/sim/lessons";

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * §2 — WHAT WAS HERE BEFORE, WHY IT GUARDED NOTHING, AND WHAT REPLACED IT
 * (2026-08-20, opened by an adversarial refuter against the round above)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A block titled „the render is wired to `foldAdvisorIntoTask` and to nothing
 * else" stood here and asserted with `toContain` over comment-stripped source.
 * MEASURED, before a line of this section was written: append `|| true` to the
 * render's own condition —
 *
 *     advisorFresh && snap.advisorPrompt !== null && advisorFold.advisorSpeaks
 *  → (advisorFresh && snap.advisorPrompt !== null && advisorFold.advisorSpeaks) || true
 *
 * — and `queueTaskEcho` + `taskCapThread` + `overlay-queue-moment` +
 * `notify-column` were **61 tests, 4 files, all green**, because the required
 * substring is still there with `|| true` after it. THE GREP CAUGHT DELETION
 * AND NOT NEUTRALISATION, and the neutralisation restores O54 exactly: the
 * advisor row is rebuilt for the task's own sentence, out-ranks it 30 > 20 at
 * equal AMBIENT rank, and the «Задача N/M» counter is dropped uncounted — the
 * student loses the count of what he is being asked to do.
 *
 * Two more of the same shape were measured at the same time; the sibling file
 * answers one (`snapshotOf`'s `taskCapKmh` join — 1,036 green with the field
 * forced to `undefined`) and §2.1 answers the other.
 *
 * SO THE DECISIONS MOVED OUT OF JSX — `advisorTaskFold`, `advisorTaskRows` and
 * `taskAnnounceKey` — and every assertion below drives one of them, or renders
 * the card `SimOverlay` actually paints. What is left at the call site is a
 * spread with no boolean in it, which is the point: there is nothing there left
 * to append `|| true` to. §2.4 keeps ONE grep and says what it is worth.
 */

const prompt = (textBg: string): AdvisorPrompt => ({ textBg, keys: [] });

/** Every condition open: the advisor may coach, and the sentence is the task's. */
const GATE_OPEN: AdvisorTaskGate = {
  advisorPrompt: prompt(ZEBRA_PROMPT),
  objectiveTitleBg: ZEBRA_TITLE,
  advisorOn: true,
  examMode: false,
  mistakeMode: false,
  ended: false,
};

/**
 * ── §2.1 · THE GATE, ONE CONDITION AT A TIME ───────────────────────────────
 *
 * MUTATION THIS BLOCK EXISTS FOR, measured: delete
 * `advisorOn && !examMode && !mistakeMode && !ended` from the fold and 1,037
 * tests stayed green — the gate whose own comment says a student who turned
 * «Съветник» off, and an exam candidate, „must not have coaching arrive on the
 * task row by the side door". Each `it` below closes ONE of the four, so a
 * partial deletion is caught as precisely as a whole one.
 */
describe("who is allowed to put coaching on the task row", () => {
  it("with every condition open, the coaching rides on the task row", () => {
    // The positive control the four below are measured against. Without it,
    // „closing X yields null" would pass on a function that always returns null.
    expect(advisorTaskFold(GATE_OPEN)).toEqual({
      advisorSpeaks: false,
      taskDetailBg: "дръж под 40 км/ч",
    });
  });

  const closed: [string, Partial<AdvisorTaskGate>][] = [
    // The one a student can operate, and the only one with an effect TODAY.
    ["«Съветник» is switched off", { advisorOn: false }],
    // Redundant today — `advisorPromptForSession` opens with an exam check — and
    // kept anyway, which is why it is driven with a NON-NULL prompt here: this
    // asserts the shell's own refusal, not another module's first line.
    ["it is an exam", { examMode: true }],
    // THEO-3: prompting the correct next action fights „направи грешката", and
    // the line above the detail is `lesson.descriptionBg`, not this title.
    ["it is the mistake sandbox", { mistakeMode: true }],
    ["the session is over", { ended: true }],
  ];
  for (const [name, override] of closed) {
    it(`…and nothing arrives by the side door once ${name}`, () => {
      expect(advisorTaskFold({ ...GATE_OPEN, ...override })).toEqual({
        advisorSpeaks: false,
        taskDetailBg: null,
      });
    });
  }

  it("a sentence of the advisor's own still gets its own row when the gate is open", () => {
    // The false-refusal direction: closing the gate must not be achieved by
    // silencing the advisor everywhere. A lawful wait is a different sentence,
    // so it keeps its row (priority 30) and carries nothing to the task.
    const wait = yieldWaitAdvisorPrompt("pedestrian");
    expect(advisorTaskFold({ ...GATE_OPEN, advisorPrompt: wait })).toEqual({
      advisorSpeaks: true,
      taskDetailBg: null,
    });
    // …and it is still silenced when the student turned the advisor off.
    expect(
      advisorTaskFold({ ...GATE_OPEN, advisorPrompt: wait, advisorOn: false }),
    ).toEqual({ advisorSpeaks: false, taskDetailBg: null });
  });
});

/**
 * ── §2.2 · THE PAIR, AND THEN THE GLASS ────────────────────────────────────
 *
 * `advisorTaskRows` is what the render spreads into its candidate array, so
 * these are the items `selectOverlay` ranks and `SimOverlay` paints. Both are
 * driven here — the decision AND the card — because the whole finding is about
 * which of two rows the student ends up reading.
 */
const ROWS_BASE = {
  advisorFresh: true,
  advisorPrompt: prompt(ZEBRA_PROMPT),
  praiseFresh: false,
  flash: null,
  taskFresh: true,
  taskKey: "task:1/2:x",
  taskLineBg: ZEBRA_TITLE,
  objectiveIndex: 1,
  objectiveTotal: 2,
  mistakeMode: false,
};

/** What the phone actually shows for a candidate pair: the winner and the count. */
function glass(rows: (SimOverlayItem | null)[]) {
  const sel = selectOverlay(rows);
  return {
    kind: sel.active?.kind ?? null,
    queued: sel.queued,
    html: renderToStaticMarkup(
      createElement(SimOverlay, { item: sel.active, queued: sel.queued }),
    ),
  };
}

describe("the phone reads the task row, with the counter and the coaching on it", () => {
  it("MUTATION `|| true` — the advisor row is not built, and the counter survives", () => {
    const rows = advisorTaskRows({ fold: advisorTaskFold(GATE_OPEN), ...ROWS_BASE });
    // The row itself: not hidden, not out-ranked — absent.
    expect(rows[0]).toBeNull();
    const seen = glass(rows);
    expect(seen.kind).toBe("task");
    // The three things the student loses when the advisor row comes back.
    expect(seen.html).toContain("Задача 1/2");
    expect(seen.html).toContain(ZEBRA_TITLE);
    expect(seen.html).toContain("дръж под 40 км/ч");
  });

  it("…and the NEGATIVE CONTROL: the pair O54 was filed on drops the counter silently", () => {
    // Hand-built, exactly what `|| true` on that condition produces: BOTH rows.
    // This is the frame the finding describes, and it is here so the assertions
    // above are known to be capable of failing.
    const defect = glass([
      { id: "advisor:x", kind: "advisor", tone: "neutral", lineBg: ZEBRA_PROMPT },
      {
        id: "task:1/2:x",
        kind: "task",
        tone: "neutral",
        chipBg: "Задача 1/2",
        lineBg: ZEBRA_TITLE,
        detailBg: "дръж под 40 км/ч",
      },
    ]);
    expect(defect.kind).toBe("advisor");
    expect(defect.html).not.toContain("Задача 1/2");
    // …and it is not even counted: both rows are AMBIENT, so the „+N" badge
    // says nothing was dropped. That is the whole of „silently".
    expect(defect.queued).toBe(0);
  });

  it("the advisor's own sentence DOES get the row, and then it is the one on the glass", () => {
    const wait = yieldWaitAdvisorPrompt("pedestrian");
    const rows = advisorTaskRows({
      fold: advisorTaskFold({ ...GATE_OPEN, advisorPrompt: wait }),
      ...ROWS_BASE,
      advisorPrompt: wait,
    });
    expect(rows[0]).not.toBeNull();
    const seen = glass(rows);
    expect(seen.kind).toBe("advisor");
    expect(seen.html).toContain(wait.textBg);
  });

  it("no advisor row survives the gate — even when the prompt is a different sentence", () => {
    // The §2.1 gate, carried through to the item list: this is the assertion
    // that fails if somebody re-opens the side door at the ROW builder instead.
    const wait = yieldWaitAdvisorPrompt("pedestrian");
    const rows = advisorTaskRows({
      fold: advisorTaskFold({ ...GATE_OPEN, advisorPrompt: wait, advisorOn: false }),
      ...ROWS_BASE,
      advisorPrompt: wait,
    });
    expect(rows[0]).toBeNull();
    expect(rows[1]?.detailBg ?? null).toBeNull();
  });

  it("`advisorFresh` still silences the row on its own — the TTL is not bypassed", () => {
    const wait = yieldWaitAdvisorPrompt("pedestrian");
    const rows = advisorTaskRows({
      fold: advisorTaskFold({ ...GATE_OPEN, advisorPrompt: wait }),
      ...ROWS_BASE,
      advisorPrompt: wait,
      advisorFresh: false,
    });
    expect(rows[0]).toBeNull();
  });

  it("praise takes the slot from the task, and takes the counter with it", () => {
    // Unchanged behaviour, pinned because the extraction moved it: a completed
    // objective's „Браво" owns row 7 while it is fresh.
    const rows = advisorTaskRows({
      fold: advisorTaskFold(GATE_OPEN),
      ...ROWS_BASE,
      praiseFresh: true,
      flash: { titleBg: "Готово — пътеката е подмината", key: 3 },
    });
    expect(rows[1]?.kind).toBe("praise");
    expect(rows[1]?.chipBg ?? null).toBeNull();
  });
});

/**
 * ── §2.3 · THE INVARIANT `itemEchoesLine` CANNOT SEE ───────────────────────
 *
 * `itemEchoesLine` catches „the detail IS the line". It cannot catch „the detail
 * is the remainder of a DIFFERENT line", because both halves are then honest
 * strings that simply do not belong together — and the shell has exactly one
 * place where the two disagree: in the THEO-3 sandbox `taskLineBg` is
 * `lesson.descriptionBg` while the fold trims against `snap.objectiveTitle`.
 *
 * This block mirrors the shell's OWN two calls, argument for argument, so the
 * pair asserted here is the pair the render builds.
 */
function shellTaskRow(input: {
  advisorPrompt: AdvisorPrompt | null;
  objectiveTitleBg: string | null;
  lessonDescriptionBg: string;
  advisorOn?: boolean;
  mistakeMode?: boolean;
}) {
  const mistakeMode = input.mistakeMode === true;
  const fold = advisorTaskFold({
    advisorPrompt: input.advisorPrompt,
    objectiveTitleBg: input.objectiveTitleBg,
    advisorOn: input.advisorOn ?? true,
    examMode: false,
    mistakeMode,
    ended: false,
  });
  return advisorTaskRows({
    fold,
    ...ROWS_BASE,
    advisorPrompt: input.advisorPrompt,
    mistakeMode,
    // The shell's own line: `mistakeMode ? lesson.descriptionBg : snap.objectiveTitle`.
    taskLineBg: mistakeMode ? input.lessonDescriptionBg : input.objectiveTitleBg,
  })[1];
}

describe("the detail is a remainder of the line it is printed under", () => {
  const DESCRIPTION = "Виж какво става, ако не отстъпиш на пешеходец";

  it("holds on the ordinary rung", () => {
    const row = shellTaskRow({
      advisorPrompt: prompt(ZEBRA_PROMPT),
      objectiveTitleBg: ZEBRA_TITLE,
      lessonDescriptionBg: DESCRIPTION,
    });
    expect(row?.lineBg).toBe(ZEBRA_TITLE);
    expect(`${row?.lineBg} — ${row?.detailBg}`).toBe(ZEBRA_PROMPT);
    expect(itemEchoesLine(row!)).toBe(false);
  });

  it("…and in the mistake sandbox, where the two producers name different things", () => {
    const row = shellTaskRow({
      advisorPrompt: prompt(ZEBRA_PROMPT),
      objectiveTitleBg: ZEBRA_TITLE,
      lessonDescriptionBg: DESCRIPTION,
      mistakeMode: true,
    });
    // The line is the lesson's description; the coaching was trimmed against a
    // DIFFERENT sentence, so it must not be printed under this one.
    expect(row?.lineBg).toBe(DESCRIPTION);
    expect(row?.detailBg ?? null).toBeNull();
    expect(itemEchoesLine(row!)).toBe(false);
  });
});

/**
 * ── §2.4 · THE ANNOUNCE KEY, AND THE ONE GREP THIS FILE STILL KEEPS ────────
 */
describe("a coaching change re-announces the card that carries it", () => {
  const base = {
    compact: true,
    ended: false,
    taskLineBg: ZEBRA_TITLE,
    objectiveIndex: 1,
    objectiveTotal: 2,
    taskDetailBg: "дръж под 40 км/ч" as string | null,
    taskPing: 0,
  };

  it("the detail is part of the key — the same objective, new coaching, speaks", () => {
    // Without this, a wait that ends under an unchanged objective would print
    // the cap into a card already past its TTL, and the only producer left to
    // say it is the advisor row O54 deleted.
    expect(taskAnnounceKey(base)).not.toBe(
      taskAnnounceKey({ ...base, taskDetailBg: "дръж под 30 км/ч" }),
    );
    expect(taskAnnounceKey(base)).not.toBe(taskAnnounceKey({ ...base, taskDetailBg: null }));
    // …and the negative control: nothing else changed, so an identical pair of
    // inputs must NOT re-announce (a key that always differs re-announces on
    // every 150 ms poll, which is a card that never stops shouting).
    expect(taskAnnounceKey(base)).toBe(taskAnnounceKey({ ...base }));
  });

  it("no key on a roomy stage, after the session, or with no line to say", () => {
    expect(taskAnnounceKey({ ...base, compact: false })).toBeNull();
    expect(taskAnnounceKey({ ...base, ended: true })).toBeNull();
    expect(taskAnnounceKey({ ...base, taskLineBg: null })).toBeNull();
    expect(taskAnnounceKey({ ...base, taskLineBg: "" })).toBeNull();
  });
});

describe("the shell spends these three decisions and re-derives none of them", () => {
  it("the render spreads the builder — the one thing a run cannot see", async () => {
    // AN HONEST STATEMENT OF WHAT THIS ASSERTION IS WORTH: a grep catches
    // DELETION and not NEUTRALISATION, which is the defect that opened §2. It
    // is kept for the one thing no `node`-environment run can reach — whether
    // the component still CALLS the functions above — and it is now three
    // substrings instead of five, because everything else is driven.
    //
    // WHAT THIS DOES NOT COVER, AND THE PARAGRAPH THAT USED TO CLAIM IT DID.
    //
    // This block once read: "the call sites carry no boolean … there is no
    // expression left in the JSX to append `|| true` to, and dropping a field
    // from either object is a `tsc --noEmit` error rather than a silent
    // `undefined` — both inputs are required-field interfaces."
    //
    // Half true, and misleading exactly where it mattered. YOU DO NOT DROP THE
    // FIELD, YOU PIN IT. A refuter measured eight such mutations, all of them
    // TypeScript-clean, all matching the three substrings below, and all leaving
    // the FULL suite byte-identical to baseline — 14,911 tests, same 2 failures:
    //
    //   `advisorOn,` → `advisorOn: true,`   restores the coaching gate defect for
    //       the one condition with a live effect today: a student who turned
    //       «Съветник» OFF reads «дръж под 40 км/ч» under every task line.
    //   `fold: advisorFold,` → `fold: { advisorSpeaks: true, … }`   restores O54
    //       verbatim: the advisor row is rebuilt, out-ranks the task 30 > 20, and
    //       the «Задача N/M» counter is dropped uncounted.
    //   `setSnap((prev) => …)` → `setSnap(() => … null)`   disables the held cap
    //       entirely and the blinking-number defect returns.
    //
    // So the extraction below hardened the INTERIOR — every decision is a pure
    // function and twelve mutations inside them go red — and left the BOUNDARY
    // exactly as weak as it found it. The neutralisation simply moved one line
    // up, into the argument list, where the only guard is again a substring.
    //
    // A substring catches DELETION and not NEUTRALISATION. That sentence is the
    // whole finding, and it survived being answered once already. Closing it
    // needs the test to invoke the REAL call site rather than a helper that
    // re-implements it — `shellTaskRow` below mirrors the shell's two calls
    // argument for argument, which means it verifies the mirror, not the shell.
    // Routed rather than papered over.
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
    expect(src).toContain("const advisorFold = advisorTaskFold({");
    expect(src).toContain("...advisorTaskRows({");
    expect(src).toContain("const taskKey = taskAnnounceKey({");
    // …and the old ternary is gone rather than merely shadowed: a copy left in
    // the candidate array would out-rank the builder's `null` by being built.
    expect(src).not.toContain("advisorFold.advisorSpeaks\n");
  });
});
