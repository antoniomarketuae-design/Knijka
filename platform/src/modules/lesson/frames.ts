/**
 * The classroom's own connective copy — the ONLY Bulgarian this module
 * authors, and the only prose in the lesson path that did not come out of the
 * content pipeline.
 *
 * THE RULE THAT MAKES THAT SAFE: not one line here states a rule, a number, a
 * distance, an article or a consequence. They are stage directions — „today we
 * are talking about X", „look at the board", „let's check that it landed".
 * The moment a frame line needs to say what the law requires, it stops being a
 * frame line and becomes content, and content goes through
 * tools/theory/verify_drafts.mjs → review_batch.mjs like everything else.
 *
 * `{{slot}}` is filled from a STORED title (a section's titleBg, a concept's
 * titleBg, a scenario's titleBg) — never from anything a model wrote.
 *
 * This is the same discipline the rest of the codebase already applies to
 * student-facing Bulgarian held in TypeScript: tutor/prompt.ts's refusal,
 * tutor/allowance.ts's notice, clips/view's why-panel headers.
 */

import type { FrameLineId } from "./types";

const FRAME_LINES: Record<FrameLineId, string> = {
  // --- lesson structure ---------------------------------------------------
  "lesson-open":
    "Сядай. Днес взимаме „{{slot}}“. Ще ти покажа и как се прави правилно, и как се обърква — гледай и двете.",
  // No „вляво/вдясно": on a 390 px screen the board shows ONE half at a time
  // and the two are a toggle, not columns. Copy that describes a layout the
  // student is not looking at is worse than no copy.
  "board-lead-in":
    "Сега гледай дъската. Първо как се обърква — после натисни „Покажи правилното“ и виж същата ситуация, карана както трябва.",
  "board-correct-lead-in":
    "Виж правилното каране още веднъж — разликата не е в скоростта, а в момента на решението.",
  // Count-neutral on purpose: a beat deals one question or two depending on
  // how many concepts the section has, and a line that promises „две неща"
  // and then asks one is the kind of small lie a 17-year-old notices.
  "quiz-lead-in":
    "Сега да проверим дали остана. Няма оценка — гледам къде да се върнем.",
  recap: "Дотук за „{{slot}}“. Ако нещо остана мътно, вдигни ръка и питай — за това съм тук.",
  "next-up": "Следващия път продължаваме нататък.",

  // --- resume after an interruption ---------------------------------------
  // Four lines, picked deterministically by beat, and said ONCE per beat.
  // Doc 84 item 17 rejects a synthetic „както казвах" said every single time —
  // and it is right: the same voice saying the same line on every resume is
  // what makes warm software feel canned. But the founder asked for a resume
  // that acknowledges the interruption rather than snapping back, and that is
  // also correct. A small rotating set, used once per beat, satisfies both.
  "resume-1": "Добре. Продължаваме оттам.",
  "resume-2": "Хубав въпрос. Връщаме се на дъската.",
  "resume-3": "Ясно. Да довършим мисълта.",
  "resume-4": "Записа ли си го? Продължаваме.",

  // --- opinion (the founder's explicit ask) --------------------------------
  // The teacher may hold a view about DRIVING. It may not hold one about the
  // law — see interrupt.ts. This frame is what makes that line audible to the
  // student: „ако питаш мен" is a stance, and what follows it is always an
  // authored corrective from the rule catalogue, never a paraphrase of a
  // legal text.
  "opinion-frame": "Ако питаш мен — ето какво бих направил на твое място.",
  "opinion-turnback": "А ти как би постъпил? Кажи ми и ще ти кажа къде съм съгласен.",

  // --- the constructive refusal (doc 84 §2.3) ------------------------------
  // A bare „нямам материал" is a bare verdict wearing different clothes, and
  // THEO-4 forbids those. Three parts: name the boundary, say what IS covered
  // here, offer a real destination. Parts 1 and 3 are assembled from ids by
  // our own code — no model touches them.
  "refuse-boundary": "Това не е в материала за този урок.",
  "refuse-nearby": "Тук говорим за „{{slot}}“.",
  "refuse-offer": "Да го изкараме на тренировка — там въпросите са точно по темата.",
};

/** The `{{slot}}` marker, exported so tests can assert a line has one. */
export const FRAME_SLOT = "{{slot}}";

/**
 * Render a frame line. `slotText` must be a STORED title; when a line has a
 * slot and none is supplied the marker is dropped along with its quotes, so a
 * missing title degrades to a shorter sentence rather than to „„““".
 */
export function frameLine(id: FrameLineId, slotText?: string): string {
  const template = FRAME_LINES[id];
  if (!template.includes(FRAME_SLOT)) return template;
  if (slotText !== undefined && slotText.length > 0) {
    return template.replaceAll(FRAME_SLOT, slotText);
  }
  return template
    .replaceAll(`„${FRAME_SLOT}“`, "това")
    .replaceAll(FRAME_SLOT, "това");
}

/** The four resume lines, in pick order. */
export const RESUME_LINE_IDS = [
  "resume-1",
  "resume-2",
  "resume-3",
  "resume-4",
] as const satisfies readonly FrameLineId[];

/**
 * Which resume line this beat uses. Deterministic in the beat id — the same
 * beat always acknowledges the same way (so a retake is reproducible) while
 * different beats in one lesson do not repeat themselves.
 */
export function resumeLineFor(beatId: string): string {
  let hash = 0;
  for (let i = 0; i < beatId.length; i++) {
    hash = (hash * 31 + beatId.charCodeAt(i)) >>> 0;
  }
  return frameLine(RESUME_LINE_IDS[hash % RESUME_LINE_IDS.length]);
}

// ---------------------------------------------------------------------------
// Ask-chip labels
// ---------------------------------------------------------------------------

/**
 * The chip labels a student presses instead of typing. A 17-year-old facing an
 * empty box asks nothing; a 17-year-old facing „Защо е грешка?" presses it
 * (doc 84 §5.1). These are questions the STUDENT asks — they assert nothing,
 * so they carry no content risk at all.
 */
export const CHIP_LABEL_BG = {
  why: "Защо е така?",
  how: "Какво трябваше да направя?",
  exam: "Какво ми струва това на изпита?",
  law: "Кой член го казва?",
  opinion: "А ти какво мислиш?",
  replay: "Покажи го пак",
  slower: "По-бавно",
  showCorrect: "Покажи правилното",
  showMistake: "Покажи грешката",
  free: "Питай нещо друго…",
} as const;
