"use client";

/**
 * The ask bar — how a student stops the teacher.
 *
 * The founder's own design says *„with buttons stop ask"*, and that is the
 * whole input model: a hand-raise button, authored chips, and a short text
 * box. **No microphone is added and none should be.**
 *
 * The chips are not decoration. Two of the four kinds never reach a model at
 * all — „Покажи го пак" and „Покажи правилното" are board controls, they cost
 * nothing and they answer instantly, which is exactly the pair of properties
 * that makes a warm feature feel like a person rather than a form. The other
 * kind goes to the tutor lane's grounded path, where a known string can have
 * its retrieval pinned by a test before a student ever presses it.
 *
 * A 17-year-old facing an empty box asks nothing. A 17-year-old facing
 * „Защо не стигна навреме?" presses it.
 */

import { useState } from "react";
import { canAsk } from "./player";
import type { AskChip, TeacherState } from "./types";

/** `TUTOR_MAX_INPUT_LENGTH` in the tutor module; restated so the box agrees. */
const MAX_QUESTION_CHARS = 500;

export function AskBar({
  chips,
  state,
  onRaiseHand,
  onChip,
  onFreeText,
  onResume,
  onNext,
  className,
}: {
  chips: readonly AskChip[];
  state: TeacherState;
  onRaiseHand: () => void;
  onChip: (chip: AskChip) => void;
  onFreeText: (question: string) => void;
  onResume: () => void;
  /**
   * „Напред" — end this sentence now.
   *
   * THIS TEACHER IS TEXT, AND THAT CHANGES WHO OWNS THE CLOCK. With a voice,
   * the end of a sentence is an event the audio raises. With text, the whole
   * sentence is on screen the instant it renders, so the only honest source of
   * „I am done with this one" is the student — and until this button existed
   * the room guessed it from a characters-per-minute estimate, which is too
   * slow for a fast reader and too fast for a careful one at the same time.
   * The estimate stays as the floor (it keeps a lecture moving on its own);
   * this is the override.
   */
  onNext?: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const listening = state === "listening";
  const busy = state === "thinking";

  // While the teacher lectures, the bar is ONE button: stop. Everything else
  // appears once the student has actually raised their hand, because a wall of
  // options under a talking teacher is a wall of options nobody reads.
  if (!listening && state !== "answering") {
    return (
      <div className={`flex shrink-0 items-center gap-2 ${className ?? ""}`}>
        <button
          type="button"
          onClick={onRaiseHand}
          disabled={!canAsk(state)}
          className="btn-accent min-w-0 flex-1 px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden className="mr-1.5">
            ✋
          </span>
          Вдигни ръка · спри и питай
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            aria-label="Напред към следващото изречение"
            className="btn-ghost shrink-0 whitespace-nowrap px-3 py-2 text-sm font-bold"
          >
            Напред ›
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex shrink-0 flex-col gap-2 ${className ?? ""}`}>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            disabled={busy}
            onClick={() => onChip(chip)}
            className="btn-ghost shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
            style={
              chip.kind === "ask"
                ? undefined
                : // Board controls read differently on purpose: they are free,
                  // instant, and they are not questions.
                  { color: "var(--accent-2)", borderColor: "var(--accent-2)" }
            }
          >
            {chip.labelBg}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => setTyping((t) => !t)}
          className="btn-ghost shrink-0 whitespace-nowrap px-2.5 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Питай нещо друго…
        </button>
      </div>

      {typing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = text.trim();
            if (q.length === 0 || busy) return;
            onFreeText(q);
            setText("");
            setTyping(false);
          }}
          className="flex gap-1.5"
        >
          <input
            autoFocus
            value={text}
            maxLength={MAX_QUESTION_CHARS}
            onChange={(e) => setText(e.target.value)}
            placeholder="Напиши въпроса си…"
            aria-label="Твоят въпрос към учителя"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <button type="submit" disabled={busy} className="btn-accent px-3 py-2 text-sm">
            Питай
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onResume}
        className="btn-ghost w-full px-3 py-2 text-sm font-bold"
      >
        Продължи урока
      </button>
    </div>
  );
}

export default AskBar;
