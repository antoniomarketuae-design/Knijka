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
  lessonQueueBinding,
  snapshotOf,
  taskAnnounceKey,
  type AdvisorTaskFreshness,
  type AdvisorTaskGate,
  type LessonQueueState,
} from "../LessonPlayShell";
// §2 additions — the queue rows are rendered here, not described.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { selectOverlay, SimOverlay, type SimOverlayItem } from "@/modules/sim/hud";
import {
  SCENARIO_TEMPLATES,
  compileScenario,
  createLessonSession,
  createYieldWait,
  yieldWaitAdvisorPrompt,
  type AdvisorPrompt,
  type ScenarioLevel,
} from "@/modules/sim/lessons";
// §3 additions — the last hop is parsed, not grepped. See `callSiteShape.ts`
// for what that reader can and cannot see.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { callSitesOf, pinProperty, replaceArgument } from "./callSiteShape";

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
 * ═══════════════════════════════════════════════════════════════════════════
 * §3 — THE BOUNDARY THE LAST ROUND MOVED INSTEAD OF CLOSING
 * (2026-08-20, round 13, opened by an adversarial refuter against §2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * §2 above extracted the decisions and drove them, and that part worked: twelve
 * mutations INSIDE `advisorTaskFold` / `advisorTaskRows` / `taskAnnounceKey`
 * go red, including partial deletions of the coaching gate one condition at a
 * time. IT LEFT THE ARGUMENT LIST. A refuter measured eight surviving mutations
 * one line up, at the call site, where the only guard was three `toContain`
 * substrings — and every one of the eight was RE-MEASURED on this tree before
 * anything below was written, because a lane that inherits a wrong premise
 * fixes nothing while reporting that it did. All eight reproduced exactly:
 * `tsc --noEmit` clean, and `queueTaskEcho` + `taskCapThread` +
 * `overlay-queue-moment` + `notify-column` green at 4 files / 88 tests.
 *
 *   advisorOn,   →  advisorOn: true,          the coaching gate, for the one
 *                                             condition a student can operate
 *   examMode,    →  examMode: false,
 *   mistakeMode, →  mistakeMode: false,
 *   ended,       →  ended: false,
 *   objectiveTitleBg: snap.objectiveTitle,  →  objectiveTitleBg: null,
 *   taskDetailBg,→  taskDetailBg: null,
 *   fold: advisorFold,   →  fold: { advisorSpeaks: true, … }   O54 verbatim
 *   setSnap((prev) => …) →  setSnap(() => … null)   the held cap (sibling file)
 *
 * WHY THE GUARD WAS BLIND: you do not DROP the field, you PIN it. A required
 * field supplied with a constant satisfies `tsc` and satisfies the substring.
 * §2's own text claimed the opposite („dropping a field is a compile error"),
 * which was true and was the wrong sentence.
 *
 * WHAT CHANGED IN THE PRODUCT, so this is a fix and not a better description:
 * the call-site BINDING is a function now. `lessonQueueBinding` takes the
 * shell's state as ONE object and derives `taskLineBg`, the fold, the detail,
 * the announce key, the advisor key and the whole `advisorTaskRows` input from
 * it — so `objectiveTitleBg`, `taskDetailBg`, `fold`, `taskLineBg` and
 * `taskKey` have no call site left to be pinned at, and the four gate
 * conditions are read in exactly one place.
 *
 * EVERY BLOCK BELOW DRIVES `lessonQueueBinding` ITSELF, on snapshots taken off
 * a REAL compiled session, so the pair asserted is the pair the render builds
 * rather than a mirror of it. §2.3 used to re-implement the shell's two calls
 * „argument for argument", which meant it verified the mirror; that helper is
 * gone and the real function stands in its place.
 */

/**
 * The rung O54 and O51 were both filed on, compiled from the shipped
 * catalogue. Nothing about the sentences below is typed by hand: the title and
 * the coaching come out of the real advisor, so a catalogue that moves under
 * this file turns it red rather than leaving it asserting about strings that
 * stopped existing.
 */
function zebraSession() {
  const spec = SCENARIO_TEMPLATES.find((t) => t.id === "sc-zebra-approach");
  expect(spec).toBeDefined();
  const session = createLessonSession(compileScenario(spec!, 1 as ScenarioLevel));
  // Scenario rungs author no pre-drive, so the session opens in `driving`.
  // Asserted rather than assumed: a session parked in `preDrive` publishes the
  // checklist's prompt and every block below would measure the wrong sentence.
  expect(session.phase).toBe("driving");
  return session;
}

/** The state a full standstill at a give-way produces (finish.ts stepYieldWait). */
const holdingAt = (reason: "pedestrian" | "giveWayLine") => ({
  ...createYieldWait(),
  holding: true,
  sinceSec: 1,
  reason,
});

/** The THEO-3 sandbox's own line — `lesson.descriptionBg`, not the title. */
const MISTAKE_DESCRIPTION = "Виж какво става, ако не отстъпиш на пешеходец";

/** THE SHELL'S OWN STATE, as one object — `lessonQueueBinding`'s only input. */
function state(over: Partial<LessonQueueState> = {}): LessonQueueState {
  return {
    snap: snapshotOf(zebraSession(), null),
    advisorOn: true,
    examMode: false,
    mistakeMode: false,
    ended: false,
    compact: true,
    taskPing: 0,
    lessonDescriptionBg: MISTAKE_DESCRIPTION,
    ...over,
  };
}

/** The four React facts the render still hands over — TTLs, never permissions. */
const FRESH: AdvisorTaskFreshness = {
  advisorFresh: true,
  praiseFresh: false,
  taskFresh: true,
  flash: null,
};

/** The render's own two lines: bind, then build the rows from the binding. */
function shell(over: Partial<LessonQueueState> = {}, fresh: Partial<AdvisorTaskFreshness> = {}) {
  const binding = lessonQueueBinding(state(over));
  return { binding, rows: advisorTaskRows(binding.rows, { ...FRESH, ...fresh }) };
}

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

/**
 * ── §3.1 · THE REAL BINDING, ON THE REAL RUNG ──────────────────────────────
 */
describe("the phone reads the task row, with the counter and the coaching on it", () => {
  it("the premise, measured: the catalogue really does hand these two one sentence", () => {
    // Asserted rather than assumed. If the advisor stopped appending the cap to
    // the objective's own title there would be no echo to resolve and every
    // block below would be passing on a case the product no longer produces.
    const { snap } = state();
    expect(snap.objectiveTitle).not.toBeNull();
    expect(snap.advisorPrompt?.textBg).toBe(`${snap.objectiveTitle} — дръж под 40 км/ч`);
  });

  it("the advisor row is not built, and the counter survives", () => {
    const { binding, rows } = shell();
    const title = state().snap.objectiveTitle!;
    // The row itself: not hidden, not out-ranked — absent.
    expect(rows[0]).toBeNull();
    expect(binding.fold.taskDetailBg).toBe("дръж под 40 км/ч");
    const seen = glass(rows);
    expect(seen.kind).toBe("task");
    // The three things the student loses when the advisor row comes back.
    expect(seen.html).toContain("Задача 1/2");
    expect(seen.html).toContain(title);
    expect(seen.html).toContain("дръж под 40 км/ч");
  });

  it("…and the NEGATIVE CONTROL: the pair O54 was filed on drops the counter silently", () => {
    // Hand-built, exactly what pinning `fold` to `{ advisorSpeaks: true }`
    // produces: BOTH rows. This is the frame the finding describes, and it is
    // here so the assertions above are known to be capable of failing.
    const title = state().snap.objectiveTitle!;
    const defect = glass([
      { id: "advisor:x", kind: "advisor", tone: "neutral", lineBg: `${title} — дръж под 40 км/ч` },
      {
        id: "task:1/2:x",
        kind: "task",
        tone: "neutral",
        chipBg: "Задача 1/2",
        lineBg: title,
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
    // A REAL lawful wait, through the real advisor: `advisorPromptForSession`
    // lets a live yield outrank the objective (B15-VOICE), so this is the
    // false-refusal direction — closing the gate must not be achieved by
    // silencing the advisor everywhere.
    const waiting = snapshotOf({ ...zebraSession(), yieldWait: holdingAt("pedestrian") }, null);
    expect(waiting.advisorPrompt?.textBg).not.toContain("км/ч");
    const { binding, rows } = shell({ snap: waiting });
    expect(rows[0]).not.toBeNull();
    expect(binding.fold.taskDetailBg).toBeNull();
    const seen = glass(rows);
    expect(seen.kind).toBe("advisor");
    expect(seen.html).toContain(waiting.advisorPrompt!.textBg);
  });

  it("no advisor row survives the gate — even when the prompt is a different sentence", () => {
    // The §2.1 gate, carried through the REAL binding to the item list: this is
    // the assertion that fails if `advisorOn` stops reaching the fold — which
    // is the first of the eight, and the one with a live effect today.
    const waiting = snapshotOf({ ...zebraSession(), yieldWait: holdingAt("pedestrian") }, null);
    const { rows } = shell({ snap: waiting, advisorOn: false });
    expect(rows[0]).toBeNull();
    expect(rows[1]?.detailBg ?? null).toBeNull();
  });

  it("`advisorFresh` still silences the row on its own — the TTL is not bypassed", () => {
    const waiting = snapshotOf({ ...zebraSession(), yieldWait: holdingAt("pedestrian") }, null);
    const { rows } = shell({ snap: waiting }, { advisorFresh: false });
    expect(rows[0]).toBeNull();
  });

  it("praise takes the slot from the task, and takes the counter with it", () => {
    // Unchanged behaviour, pinned because the extraction moved it: a completed
    // objective's „Браво" owns row 7 while it is fresh.
    const { rows } = shell(
      {},
      { praiseFresh: true, flash: { titleBg: "Готово — пътеката е подмината", key: 3 } },
    );
    expect(rows[1]?.kind).toBe("praise");
    expect(rows[1]?.chipBg ?? null).toBeNull();
  });
});

/**
 * ── §3.2 · EACH OF THE FOUR GATE CONDITIONS, THROUGH THE BINDING ───────────
 *
 * §2.1 drives `advisorTaskFold` directly, which proves the FUNCTION reads all
 * four. This block proves the BINDING hands it all four — the difference the
 * eight mutations lived in. The positive control is first, so „closing X yields
 * null" cannot pass on a binding that always yields null.
 */
describe("the shell's own state reaches the gate, one condition at a time", () => {
  const CLOSES: [string, Partial<LessonQueueState>][] = [
    ["«Съветник» is switched off", { advisorOn: false }],
    ["it is an exam", { examMode: true }],
    ["it is the mistake sandbox", { mistakeMode: true }],
    ["the session is over", { ended: true }],
  ];

  it("open: the coaching rides on the task row", () => {
    const { binding } = shell();
    expect(binding.fold.taskDetailBg).toBe("дръж под 40 км/ч");
    expect(binding.fold.advisorSpeaks).toBe(false);
  });

  for (const [name, over] of CLOSES) {
    it(`…and nothing arrives by the side door once ${name}`, () => {
      const { binding } = shell(over);
      expect(binding.fold.taskDetailBg).toBeNull();
      expect(binding.fold.advisorSpeaks).toBe(false);
    });
  }
});

/**
 * ── §3.3 · THE INVARIANT `itemEchoesLine` CANNOT SEE ───────────────────────
 *
 * `itemEchoesLine` catches „the detail IS the line". It cannot catch „the detail
 * is the remainder of a DIFFERENT line", because both halves are then honest
 * strings that simply do not belong together — and the shell has exactly one
 * place where the two disagree: in the THEO-3 sandbox `taskLineBg` is
 * `lesson.descriptionBg` while the fold trims against `snap.objectiveTitle`.
 *
 * THIS BLOCK USED TO MIRROR THE SHELL'S TWO CALLS „argument for argument",
 * including the `mistakeMode ? lesson.descriptionBg : objectiveTitleBg` line
 * selection — so it verified THE MIRROR, NOT THE SHELL, and changing the
 * shell's real argument left it green. That is how the eight survived. The
 * mirror is deleted; the line selection is inside `lessonQueueBinding` now and
 * this drives it.
 */
describe("the detail is a remainder of the line it is printed under", () => {
  it("holds on the ordinary rung", () => {
    const title = state().snap.objectiveTitle!;
    const { binding, rows } = shell();
    const row = rows[1];
    expect(binding.taskLineBg).toBe(title);
    expect(row?.lineBg).toBe(title);
    expect(`${row?.lineBg} — ${row?.detailBg}`).toBe(`${title} — дръж под 40 км/ч`);
    expect(itemEchoesLine(row!)).toBe(false);
  });

  it("…and in the mistake sandbox, where the two producers name different things", () => {
    const { binding, rows } = shell({ mistakeMode: true });
    const row = rows[1];
    // The line is the lesson's description; the coaching was trimmed against a
    // DIFFERENT sentence, so it must not be printed under this one.
    expect(binding.taskLineBg).toBe(MISTAKE_DESCRIPTION);
    expect(row?.lineBg).toBe(MISTAKE_DESCRIPTION);
    expect(row?.detailBg ?? null).toBeNull();
    expect(itemEchoesLine(row!)).toBe(false);
    // …and the chip changes with it, so the sandbox is never mistaken for a
    // graded rung. Pinned here because `mistakeMode` reaches the ROW builder by
    // a second route and pinning either one alone must not go unnoticed.
    expect(row?.chipBg).toBe("Преживей грешката");
  });
});

/**
 * ── §3.4 · THE ANNOUNCE KEY, DERIVED WHERE THE RENDER DERIVES IT ───────────
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

  it("THE BINDING carries the detail INTO the key — the sixth mutation", () => {
    // `taskDetailBg,` → `taskDetailBg: null,` at the old call site was
    // TypeScript-clean and left four suites green. The field is derived inside
    // `lessonQueueBinding` now, and this is the assertion that fails if the
    // derivation stops feeding it: two states that differ ONLY in the coaching
    // must produce two different keys.
    const coached = lessonQueueBinding(state()).taskKey;
    const silent = lessonQueueBinding(state({ advisorOn: false })).taskKey;
    expect(coached).not.toBeNull();
    expect(silent).not.toBeNull();
    expect(coached).not.toBe(silent);
    expect(coached).toContain("дръж под 40 км/ч");
    expect(silent).not.toContain("дръж под 40 км/ч");
  });

  it("…and the recall counter and the roomy stage still reach it", () => {
    expect(lessonQueueBinding(state()).taskKey).not.toBe(
      lessonQueueBinding(state({ taskPing: 1 })).taskKey,
    );
    expect(lessonQueueBinding(state({ compact: false })).taskKey).toBeNull();
    expect(lessonQueueBinding(state({ ended: true })).taskKey).toBeNull();
  });

  it("the advisor key is the same gate, so the two cannot disagree", () => {
    // `advisorKey` used to be derived in the render, from the same four
    // conditions the fold reads — two readings of one gate, which is the defect
    // `advisorTaskFold`'s header spends a screen refusing. It is one reading now.
    expect(lessonQueueBinding(state()).advisorKey).not.toBeNull();
    const closed: Partial<LessonQueueState>[] = [
      { advisorOn: false },
      { examMode: true },
      { mistakeMode: true },
      { ended: true },
      { compact: false },
    ];
    for (const over of closed) {
      expect(lessonQueueBinding(state(over)).advisorKey, JSON.stringify(over)).toBeNull();
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * §3.5 — THE LAST HOP, PARSED RATHER THAN GREPPED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything above executes. What no `node`-environment test can execute is the
 * component itself: there is no DOM in this suite, and `useFreshKey` and
 * `useCompactHud` both resolve in effects, so even a `react-dom/server` pass
 * over `LessonPlayShell` yields a ROOMY stage with `taskFresh === false` and
 * never builds a queue row at all. That is the same residual
 * `hud/__tests__/dashboard-publication.test.ts` records for the scene's
 * publication, and it is why the argument list has to be held statically.
 *
 * IT IS NOT HELD WITH A SUBSTRING. `callSiteShape.ts` parses the file and
 * reports, per call, the exact source text of every argument and of every
 * property initializer, reporting a shorthand property as its own name. The
 * expectations below are `toEqual` over that map, so a field ADDED, a field
 * REMOVED and a field PINNED all fail — and `advisorOn: advisorOn || true`
 * fails too, which is the shape that defeated round 11.
 *
 * AND THE READER SELF-CHECKS. §3.6 re-applies the mutations to this file's own
 * text and requires each to be rejected. A probe that cannot fail on the case it
 * was written for is a decoration, and four of them have shipped in this
 * project — every one lying in the reassuring direction.
 */
const SHELL_SRC = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");

/** The shell's state object, field for field. Shorthand ⇒ the name itself. */
const BINDING_ARG: Record<string, string> = {
  snap: "snap",
  advisorOn: "advisorOn",
  examMode: "examMode",
  mistakeMode: "mistakeMode",
  ended: "ended",
  compact: "compact",
  taskPing: "taskPing",
  lessonDescriptionBg: "lesson.descriptionBg",
};

/** The four React facts, and nothing else may join them. */
const FRESHNESS_ARG: Record<string, string> = {
  advisorFresh: "advisorFresh",
  praiseFresh: "praiseFresh",
  taskFresh: "taskFresh",
  flash: "flash",
};

/** A realistic neutralisation for each field — the constant a refuter would use. */
const PIN: Record<string, string> = {
  snap: "{ ...snap, advisorPrompt: null }",
  advisorOn: "true",
  examMode: "false",
  mistakeMode: "false",
  ended: "false",
  compact: "true",
  taskPing: "0",
  lessonDescriptionBg: '""',
  advisorFresh: "true",
  praiseFresh: "false",
  taskFresh: "true",
  flash: "null",
};

const bindingArg = (src: string) =>
  callSitesOf(src, ["lessonQueueBinding"])[0]?.objectArgs[0] ?? null;
const rowsCall = (src: string) => callSitesOf(src, ["advisorTaskRows"])[0] ?? null;

describe("the component hands the binding its own live state, and nothing else", () => {
  it("one call, inside the shell, with exactly the shell's eight state values", () => {
    const calls = callSitesOf(SHELL_SRC, ["lessonQueueBinding"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].enclosing).toBe("LessonPlayShell");
    expect(calls[0].args).toHaveLength(1);
    expect(calls[0].objectArgs[0]).toEqual(BINDING_ARG);
  });

  it("the rows are built from the binding's own object, plus four React facts", () => {
    const calls = callSitesOf(SHELL_SRC, ["advisorTaskRows"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].enclosing).toBe("LessonPlayShell");
    // `fold: advisorFold` has no property to be pinned at any more: the whole
    // first argument is the binding's own value.
    expect(calls[0].args[0]).toBe("queue.rows");
    expect(calls[0].objectArgs[0]).toBeNull();
    expect(calls[0].objectArgs[1]).toEqual(FRESHNESS_ARG);
  });

  it("the gate and the key are read in ONE place, and it is not the component", () => {
    // `objectiveTitleBg: null` and `taskDetailBg: null` are only writable inside
    // `lessonQueueBinding` now, which §3.1–§3.4 drive. The component may not call
    // either function itself, or there would be two readings of one gate again.
    for (const fn of ["advisorTaskFold", "taskAnnounceKey"]) {
      const calls = callSitesOf(SHELL_SRC, [fn]);
      expect(
        calls.map((c) => c.enclosing),
        fn,
      ).toEqual(["lessonQueueBinding"]);
    }
  });

  it("the freshness keys are the binding's keys — the TTL cannot be re-derived", () => {
    const keys = callSitesOf(SHELL_SRC, ["useFreshKey"]).map((c) => c.args.join(", "));
    expect(keys).toContain("queue.taskKey, TASK_ANNOUNCE_MS");
    expect(keys).toContain("queue.advisorKey, ADVISOR_ANNOUNCE_MS");
  });

  it("every `setSnap` either threads the previous snapshot or documents its refusal", () => {
    // `setSnap((prev) => …)` → `setSnap(() => … null)` disabled the held cap and
    // the blinking-number defect returned. There is no closure at either poll
    // site now — `hudPollUpdate` is a value — and the only other call is the
    // restart, which forgets ON PURPOSE (a run that just ended must not print
    // its ceiling over the first frames of the next one).
    const allowed = [
      "hudPollUpdate(sessionRef.current, lastTickRef.current, drivelineRef.current)",
      "snapshotOf(sessionRef.current, null, null)",
    ];
    const args = callSitesOf(SHELL_SRC, ["setSnap"]).map((c) => c.args.join(", "));
    expect(args.length).toBeGreaterThan(0);
    for (const a of args) expect(allowed, a).toContain(a);
    // Both polls, not one: a fix applied to the interval and not to the tick
    // handler leaves the number blinking on exactly the frames a student drives.
    expect(args.filter((a) => a.startsWith("hudPollUpdate("))).toHaveLength(2);
  });
});

/**
 * ── §3.6 · THE READER, RUN AGAINST THE MUTATIONS IT EXISTS FOR ─────────────
 *
 * Every one of these is applied to the REAL file's text through the same tree,
 * and each helper throws when the thing it was asked to mutate is not there —
 * so a mutation that silently no-ops cannot be reported as „rejected". That is
 * the failure mode of every „0 defects" instrument this project has built.
 */
describe("MUTATION — the reader rejects each pin the substring accepted", () => {
  for (const field of Object.keys(BINDING_ARG)) {
    it(`pinning \`${field}\` in the binding's argument list is rejected`, () => {
      const mutated = pinProperty(SHELL_SRC, "lessonQueueBinding", 0, field, PIN[field]);
      expect(mutated).not.toBe(SHELL_SRC);
      expect(bindingArg(mutated)).not.toEqual(BINDING_ARG);
      // …and it is THIS field that moved, not some neighbour: a reader that
      // returned `null` for everything would pass the line above.
      expect(bindingArg(mutated)?.[field]).toBe(PIN[field]);
    });
  }

  for (const field of Object.keys(FRESHNESS_ARG)) {
    it(`pinning \`${field}\` in the freshness argument is rejected`, () => {
      const mutated = pinProperty(SHELL_SRC, "advisorTaskRows", 1, field, PIN[field]);
      expect(mutated).not.toBe(SHELL_SRC);
      expect(rowsCall(mutated)?.objectArgs[1]).not.toEqual(FRESHNESS_ARG);
    });
  }

  it("`advisorOn: advisorOn || true` — the shape that defeated a `toContain`", () => {
    // The round-11 neutralisation, re-aimed at the round-12 boundary. The
    // substring `advisorOn,` is gone, but `advisorOn` is still there, so any
    // guard written as „the file mentions advisorOn" accepts this.
    const mutated = pinProperty(
      SHELL_SRC,
      "lessonQueueBinding",
      0,
      "advisorOn",
      "advisorOn || true",
    );
    expect(mutated).toContain("advisorOn");
    expect(bindingArg(mutated)).not.toEqual(BINDING_ARG);
  });

  it("`fold: { advisorSpeaks: true, … }` — O54 restored through a spread", () => {
    // The first argument is the binding's own value, so the only way back in is
    // to spread it and override. The reader reports the spread under a key no
    // field can have, and the `toBe("queue.rows")` above fails outright.
    const mutated = replaceArgument(
      SHELL_SRC,
      "advisorTaskRows",
      0,
      "{ ...queue.rows, fold: { advisorSpeaks: true, taskDetailBg: null } }",
    );
    expect(rowsCall(mutated)?.args[0]).not.toBe("queue.rows");
    expect(rowsCall(mutated)?.objectArgs[0]).not.toBeNull();
  });

  it("`setSnap(() => … null)` — the held ceiling, disabled at the call site", () => {
    const mutated = replaceArgument(
      SHELL_SRC,
      "setSnap",
      0,
      "() => snapshotOf(sessionRef.current, lastTickRef.current, drivelineRef.current, null)",
    );
    const args = callSitesOf(mutated, ["setSnap"]).map((c) => c.args.join(", "));
    expect(args.filter((a) => a.startsWith("hudPollUpdate("))).toHaveLength(1);
  });

  it("…and deleting the binding call outright is caught too", () => {
    // The one thing a `count` assertion can still see. Stated so the residual
    // above is not mistaken for „this guard sees nothing".
    const deleted = SHELL_SRC.replace("lessonQueueBinding({", "NOT_THE_BINDING({");
    expect(deleted).not.toBe(SHELL_SRC);
    expect(callSitesOf(deleted, ["lessonQueueBinding"])).toHaveLength(0);
  });

  it("SELF-CHECK — the helpers refuse to no-op", () => {
    // The instrument bug this whole file exists to avoid: a mutation that never
    // landed, reported as a mutation that was rejected.
    expect(() => pinProperty(SHELL_SRC, "lessonQueueBinding", 0, "notAField", "true")).toThrow();
    expect(() => pinProperty(SHELL_SRC, "noSuchCallee", 0, "snap", "true")).toThrow();
    expect(() => replaceArgument(SHELL_SRC, "advisorTaskRows", 9, "x")).toThrow();
    // …and the reader really does read THIS file, not an empty string.
    expect(SHELL_SRC.length).toBeGreaterThan(100_000);
    expect(bindingArg(SHELL_SRC)).toEqual(BINDING_ARG);
  });
});
