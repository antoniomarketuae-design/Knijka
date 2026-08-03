"use client";

/**
 * The transcript line.
 *
 * Two reasons this is not an afterthought:
 *
 * 1. **Teenagers watch on mute.** A lesson whose content lives only in an
 *    audio track is a lesson most of the audience will skip, in a class, on a
 *    bus, next to a sleeping sibling.
 * 2. **It makes the whole room work before any voice exists.** No Bulgarian
 *    TTS voice has ever been auditioned for this product (doc 84 §4.3 is a
 *    blocking gate that is still open). With a transcript, the classroom is a
 *    complete, shippable product on the day it is built; the voice upgrades it
 *    rather than unlocking it.
 *
 * So the text is the primary channel, sized to be read on a phone, and it
 * prints the beat's stored Bulgarian verbatim — plus the law reference, when
 * the content bank carries one, because a teacher who says „чл. 119 ЗДвП" is
 * more credible than one who does not.
 */

import { TEACHER_STATE_BG, TONE_BG, beatProgressBg } from "./player";
import type { AskAnswer, ClassroomBeat, TeacherState } from "./types";

const TONE_TINT: Record<ClassroomBeat["tone"], string> = {
  explain: "var(--accent)",
  warn: "var(--warning)",
  reassure: "var(--accent-2)",
};

/**
 * What the board would have said about the take on screen, when the board is
 * too short to say it itself (`LessonBoard`'s dense mode — a phone held
 * sideways). The sentence does not get dropped; it moves.
 */
export interface BoardNote {
  titleBg: string;
  captionBg: string;
  tint: string;
  mark: string;
}

export function Transcript({
  beat,
  index,
  total,
  state,
  answer,
  answerPending,
  boardNote,
  fade,
  className,
}: {
  beat: ClassroomBeat;
  index: number;
  total: number;
  state: TeacherState;
  /** The reply to the student's interruption, when one has arrived. */
  answer: AskAnswer | null;
  answerPending: boolean;
  boardNote?: BoardNote | null;
  /**
   * Fade the bottom edge. Only set where the column is a FIXED-height flex
   * child and therefore genuinely clipping (the compact layout) — a fade over
   * text that already fits is a promise of more text that is not there.
   */
  fade?: boolean;
  className?: string;
}) {
  const tint = TONE_TINT[beat.tone];
  const showingAnswer = answerPending || answer !== null;

  return (
    <section
      aria-live="polite"
      aria-label="Какво казва учителят"
      className={`flex min-h-0 flex-col gap-1.5 rounded-2xl border border-border bg-surface/80 p-3 ${className ?? ""}`}
    >
      <header className="flex shrink-0 items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wide">
        <span
          className="rounded px-1.5 py-px"
          style={{ background: `color-mix(in srgb, ${tint} 18%, transparent)`, color: tint }}
        >
          {showingAnswer ? "Твоят въпрос" : TONE_BG[beat.tone]}
        </span>
        <span className="text-muted">{beatProgressBg(index, total)}</span>
        {beat.lawRefBg && !showingAnswer && (
          <span className="ml-auto truncate text-accent-soft">{beat.lawRefBg}</span>
        )}
      </header>

      {showingAnswer ? (
        <AnswerBody answer={answer} pending={answerPending} />
      ) : (
        <div
          className={`flex min-h-0 flex-col gap-2 overflow-y-auto ${fade ? "cl-fade-b" : ""}`}
        >
          <p className="text-[15px] leading-relaxed text-foreground">{beat.sayBg}</p>
          {boardNote && (
            <div className="border-t border-border pt-1.5">
              <p
                className="font-mono text-[10px] font-bold uppercase tracking-wide"
                style={{ color: boardNote.tint }}
              >
                <span aria-hidden className="mr-1">
                  {boardNote.mark}
                </span>
                {boardNote.titleBg}
              </p>
              <p className="text-[13px] leading-snug text-foreground/90">{boardNote.captionBg}</p>
            </div>
          )}
        </div>
      )}

      {/* The state is repeated here in words, because the ring around the
          teacher is a colour and colour alone is not an accessible signal.
          In BULGARIAN words: this printed the raw enum member, so a student
          using a screen reader heard „Състояние на учителя: speaking" — the
          one place in the room where the product spoke English at a
          17-year-old, and the only place where nobody could see it. */}
      <p className="sr-only">{`Състояние на учителя: ${TEACHER_STATE_BG[state]}`}</p>
    </section>
  );
}

function AnswerBody({ answer, pending }: { answer: AskAnswer | null; pending: boolean }) {
  if (pending) {
    return (
      <p className="text-[15px] leading-relaxed text-muted">
        <span className="cl-dots" aria-hidden>
          ···
        </span>{" "}
        Учителят мисли…
      </p>
    );
  }
  if (!answer) return null;
  return (
    <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
      <p className="text-[15px] leading-relaxed text-foreground">{answer.bodyBg}</p>
      {answer.turnBackBg ? (
        // The teacher handing the question back. Coloured, not quoted: it is
        // the only sentence in the room addressed AT the student rather than
        // about the road, and it has to read like someone waiting for a reply.
        <p className="text-[15px] font-semibold leading-relaxed text-accent">
          {answer.turnBackBg}
        </p>
      ) : null}
      {answer.offer ? (
        <a
          href={answer.offer.href}
          className="btn-ghost self-start px-2.5 py-1.5 text-[12px] font-bold"
        >
          {answer.offer.labelBg}
        </a>
      ) : null}
      {answer.citationsBg && answer.citationsBg.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {answer.citationsBg.map((c) => (
            <li
              key={c}
              className="rounded-full border border-border px-2 py-px font-mono text-[10px] font-bold text-accent-soft"
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Transcript;
