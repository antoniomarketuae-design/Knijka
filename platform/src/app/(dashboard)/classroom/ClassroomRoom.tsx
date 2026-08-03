"use client";

/**
 * The room, with the engine plugged in.
 *
 * `ClassroomScene` is deliberately ignorant: it knows about a teacher, a board,
 * a transcript and an ask bar, and nothing about lessons, questions, mastery or
 * money. Everything with a COST is handed to it from here, which is the only
 * reason the room could be built in parallel with the engine and then joined in
 * one file.
 *
 * THREE THINGS THIS SUPPLIES, and each one turns a stub into a feature:
 *
 *  1. `onAsk` — the raised hand now reaches `answerInterruption` (via the
 *     `askTeacher` action). Most presses come back AUTHORED: a stored concept
 *     summary, a rule's corrective, its exam cost, its article — $0, instant,
 *     no model in the loop. Before this, every question in the room returned
 *     the honest „not connected yet" string.
 *  2. `renderQuiz` — the mini-quiz. Real bank questions, dealt per beat, graded
 *     on the server against the student's own mastery row, with the question's
 *     stored explanation and the wired mistake replay on a wrong answer. The
 *     room previously drew a dashed box that said „място за мини-тест".
 *  3. The engine beat id. The room's beats are SENTENCES (one utterance each —
 *     see `lessonToRoom.ts`); the actions want the beat those sentences came
 *     from. `beatSource` is that map, and it is passed as data rather than
 *     parsed out of an id format.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not prefetch. A beat's quiz is
 * dealt when the student reaches the beat, by the component that renders it,
 * and never earlier — the same promise `loadBeat` makes to the lesson runner.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  askTeacher,
  answerLessonQuiz,
  loadBeat,
  saveLessonPosition,
} from "@/app/(dashboard)/lesson/actions";
import ClassroomScene, { type QuizSlot } from "@/components/classroom/ClassroomScene";
import type { AskAnswer, ClassroomBeat, ClassroomLesson } from "@/components/classroom/types";
import {
  QuestionArtwork,
  SignFace,
  hasSignOptions,
} from "@/components/theory/QuestionMedia";
import { CheckControl } from "@/components/ui/CheckControl";
import { MAX_MODEL_ASKS_PER_BEAT } from "@/modules/lesson/client";
import type {
  LessonQuizQuestion,
  LessonQuizVerdict,
  ResolvedBoard,
} from "@/modules/lesson/client";
import { bookmarkAfterRoomBeat } from "./resume";

/** The mistake replay a wrong verdict points at. Never loaded until then. */
const MistakeReplay = dynamic(() => import("@/components/theory/MistakeReplay"), {
  ssr: false,
  loading: () => (
    <div
      aria-hidden
      className="h-32 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
    />
  ),
});

interface Props {
  lesson: ClassroomLesson;
  /** Room beat id → engine beat id. */
  beatSource: Record<string, string>;
  /** Engine beats in order — what `LessonProgress.beatIndex` indexes into. */
  engineBeatIds: readonly string[];
  lessonId: string;
  sectionId: string;
  /** Room beat to open on, resolved from LessonProgress on the server. */
  startBeatIndex?: number;
  /** The next lesson in course order, or null at the end of the course. */
  next: { id: string; titleBg: string } | null;
}

export function ClassroomRoom({
  lesson,
  beatSource,
  engineBeatIds,
  lessonId,
  sectionId,
  startBeatIndex = 0,
  next,
}: Props) {
  /**
   * The lesson ran out of beats.
   *
   * Held in the room's wrapper rather than in `ClassroomScene` because what
   * happens next is a COURSE question — which lesson is 22 of 54 — and the
   * scene knows about one lesson only. Without this the last beat simply ends
   * and the start button reads „Продължи урока", which replays the last beat:
   * a lesson with no exit is how a 17-year-old learns that this thing is a toy.
   */
  const [finished, setFinished] = useState(false);
  /**
   * Model asks used, per ENGINE beat. A ref rather than state: nothing renders
   * from it, and a re-render between „question sent" and „answer back" would be
   * a re-render of the whole room for a counter nobody can see.
   *
   * It is a hint the server treats as advisory (see `askTeacher`'s note): the
   * real spend ceilings are counted server-side inside `askTutor`. This only
   * decides how early the teacher says „ще се върнем на това".
   */
  const asksInBeat = useRef<Record<string, number>>({});

  const onAsk = useCallback(
    async (
      question: string,
      beat: ClassroomBeat,
      chipId: string | null,
    ): Promise<AskAnswer> => {
      const engineBeatId = beatSource[beat.id] ?? beat.id;
      const used = asksInBeat.current[engineBeatId] ?? 0;
      const reply = await askTeacher(lessonId, engineBeatId, question, chipId, used);
      // Only the budgeted path counts. An authored answer, a board command and
      // a refusal are all free, and charging the student's three questions for
      // one would make the cap feel arbitrary — which is exactly how a cap
      // stops reading as „let's slow down" and starts reading as a paywall.
      if (reply.debited) {
        asksInBeat.current[engineBeatId] = Math.min(used + 1, MAX_MODEL_ASKS_PER_BEAT);
      }
      return {
        bodyBg: reply.bodyBg,
        citationsBg: reply.citations.map((r) => `${r.act} ${r.ref}`),
        turnBackBg: reply.turnBackBg ?? null,
        offer: reply.offer ?? null,
      };
    },
    [beatSource, lessonId],
  );

  const roomBeatIds = useMemo(() => lesson.beats.map((b) => b.id), [lesson.beats]);

  /**
   * The bookmark, written as the student walks.
   *
   * IT POINTS AT WHAT COMES NEXT, not at what just ended, and the difference
   * is the whole quality of the feature. The room speaks one SENTENCE per
   * beat and the row stores the ENGINE's beat — so „save the sentence that
   * finished + 1" would skip the rest of the idea when a student stops halfway
   * through it, and „save the idea that finished" would replay a whole idea
   * they had already heard through to the end. Reading the engine beat of the
   * NEXT SENTENCE gets both cases right: stop mid-idea and you come back to
   * the top of that idea; finish it and you come back to the next one.
   *
   * ONCE PER ENGINE BEAT, not once per sentence — `savedRef` drops the repeats,
   * so a lesson costs ~7 writes rather than ~14. A ref, because nothing renders
   * from it and re-rendering the room to remember a write would be a re-render
   * nobody asked for.
   *
   * FIRE AND FORGET, with the failure swallowed on purpose: a bookmark that
   * could not be written must not put an error in front of a 17-year-old in
   * the middle of a lesson. The cost of losing it is re-watching one idea.
   */
  const savedRef = useRef(-1);
  const onBeatComplete = useCallback(
    (_beatId: string, index: number) => {
      // null ⇒ the lesson is ending (or the sentence has no beat behind it, in
      // which case saving 0 would silently rewind the student to the start).
      // Completion is `onLessonComplete`'s write, not a second POST here.
      const at = bookmarkAfterRoomBeat(roomBeatIds, beatSource, engineBeatIds, index);
      if (at === null || at === savedRef.current) return;
      savedRef.current = at;
      void saveLessonPosition(lessonId, at, false).catch(() => {});
    },
    [beatSource, engineBeatIds, lessonId, roomBeatIds],
  );

  const onLessonComplete = useCallback(() => {
    setFinished(true);
    const last = Math.max(0, engineBeatIds.length - 1);
    savedRef.current = last;
    void saveLessonPosition(lessonId, last, true).catch(() => {});
  }, [engineBeatIds.length, lessonId]);

  const handlers = useMemo(
    () => ({ onAsk, onBeatComplete, onLessonComplete }),
    [onAsk, onBeatComplete, onLessonComplete],
  );

  const renderQuiz: QuizSlot = useCallback(
    ({ beat, dense, onDone }) => (
      <BeatQuiz
        // Keyed on the beat so a re-entered quiz is a fresh component with no
        // carried-over selection — the same discipline the board's panes use.
        key={beat.id}
        lessonId={lessonId}
        beatId={beatSource[beat.id] ?? beat.id}
        dense={dense}
        onDone={onDone}
      />
    ),
    [beatSource, lessonId],
  );

  return (
    <>
      <ClassroomScene
        lesson={lesson}
        handlers={handlers}
        renderQuiz={renderQuiz}
        startBeatIndex={startBeatIndex}
      />
      {/* The one thing a lesson owes the rest of the product: a way onward.
          Kept outside the scene because the scene is pinned to the viewport
          (see `useViewportHeight`) and anything appended inside it would be
          taking height from the board. */}
      {finished && next !== null ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
            Следващ урок: <strong className="text-foreground">{next.titleBg}</strong>
          </span>
          <Link
            href={`/classroom/${next.id}`}
            className="btn-accent shrink-0 px-3 py-1.5 text-[12px] font-bold"
          >
            Продължи
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-center text-[11px] text-muted">
          <Link
            className="underline underline-offset-2"
            href={`/theory/practice?section=${encodeURIComponent(sectionId)}`}
          >
            Тренировка по темата
          </Link>
          {" · "}
          <Link className="underline underline-offset-2" href="/classroom">
            Всички уроци
          </Link>
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The mini-quiz
// ---------------------------------------------------------------------------

/**
 * „Спираме за момент. Да проверим дали се е получило."
 *
 * The questions are DEALT HERE, on mount, which is what makes the bandwidth
 * promise real: a quiz beat's questions are never part of the page, and a
 * student who leaves after beat 2 never downloads beat 9's. `dealBeatQuiz` is
 * seeded from (lesson, beat), so the same beat always asks the same questions
 * — a student who retakes a lesson to fix one thing meets that thing again.
 */
function BeatQuiz({
  lessonId,
  beatId,
  dense,
  onDone,
}: {
  lessonId: string;
  beatId: string;
  dense: boolean;
  onDone: () => void;
}) {
  const [questions, setQuestions] = useState<LessonQuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);

  // Dealt on mount, never earlier. The component is KEYED on the beat, so it
  // is never reused across beats; the alive flag is only there so a student who
  // leaves the lesson mid-deal does not get a setState on an unmounted tree.
  useEffect(() => {
    let alive = true;
    loadBeat(lessonId, beatId)
      .then((payload) => {
        if (alive) setQuestions(payload.quiz);
      })
      .catch(() => {
        if (alive) setLoadFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [lessonId, beatId]);

  if (loadFailed) {
    return (
      <QuizFrame>
        <p className="text-[13px] leading-snug text-muted">
          Въпросите за тази проверка не се заредиха. Урокът продължава.
        </p>
        <button type="button" onClick={onDone} className="btn-ghost mt-2 px-3 py-1.5 text-[12px]">
          Продължи
        </button>
      </QuizFrame>
    );
  }

  if (questions === null) {
    return (
      <QuizFrame>
        <div
          aria-hidden
          className="h-24 w-full animate-pulse rounded-xl bg-surface-2/60 motion-reduce:animate-none"
        />
        <p className="sr-only">Зарежда въпросите</p>
      </QuizFrame>
    );
  }

  // A beat whose concepts have no eligible bank question deals nothing. Saying
  // so and moving on beats a stalled classroom.
  const question = questions[index];
  if (question === undefined) {
    return (
      <QuizFrame>
        <p className="text-[13px] leading-snug text-muted">
          За тази част още няма въпрос от банката.
        </p>
        <button type="button" onClick={onDone} className="btn-ghost mt-2 px-3 py-1.5 text-[12px]">
          Продължи
        </button>
      </QuizFrame>
    );
  }

  return (
    <QuizFrame>
      <div className="mb-1 flex items-baseline gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-accent-2">
          Проверка · въпрос {index + 1} от {questions.length}
        </p>
        {/* THE WAY OUT. The beat clock is stopped while this is up, so without
            an escape a student who does not want to answer has no way to make
            the lesson continue — a silent room with a form in it. Doc 84 §5.3:
            „the quiz never blocks". Skipping records nothing, which is correct:
            an unanswered question is not a wrong answer. */}
        <button
          type="button"
          onClick={onDone}
          className="ml-auto shrink-0 text-[11px] font-semibold text-muted underline underline-offset-2"
        >
          Пропусни
        </button>
      </div>
      <QuizQuestion
        key={question.questionId}
        lessonId={lessonId}
        beatId={beatId}
        question={question}
        dense={dense}
        onNext={() => {
          if (index + 1 < questions.length) setIndex((i) => i + 1);
          else onDone();
        }}
      />
    </QuizFrame>
  );
}

function QuizFrame({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Мини-тест"
      className="flex flex-1 flex-col rounded-2xl border border-accent-2/40 bg-surface/85 p-3"
    >
      {children}
    </section>
  );
}

/**
 * One question, and the verdict.
 *
 * THEO-4 (doc 64, founder-ratified): there is no bare „грешно" anywhere here.
 * A wrong answer gets the question's own stored explanation, the per-option
 * rationale where the bank carries one, the citation, and — the part that only
 * this product can do — the recorded mistake on the board, which is the same
 * clip the why-panel would show for the same question.
 */
export function QuizQuestion({
  lessonId,
  beatId,
  question,
  dense,
  onNext,
}: {
  lessonId: string;
  beatId: string;
  question: LessonQuizQuestion;
  dense: boolean;
  onNext: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<LessonQuizVerdict | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) => {
    if (verdict !== null) return;
    setSelected((prev) =>
      question.type === "single"
        ? [id]
        : prev.includes(id)
          ? prev.filter((x) => x !== id)
          : [...prev, id],
    );
  };

  // Any sign-face option turns the option list into the picture grid. Same
  // helper as the practice runner, the exam runner and the sim's micro-quiz —
  // one rule, four surfaces, so „Кой от показаните знаци…" cannot render as
  // four interchangeable captions on any of them.
  const signGrid = hasSignOptions(question.options);
  /* THE FACE SIZE, MEASURED IN THIS COLUMN — not copied from the practice
     runner, because this is not that column. The room's board is inset past
     the teacher, so a 390px phone leaves it 260px, against the 337px a
     practice card owns; a 844x390 phone leaves it 410px and only 293px of
     HEIGHT. Captured in both: 64px faces put all four tiles AND „Отговори"
     inside the portrait board with zero column scroll (tiles 294–466px,
     button at 481 of 844), and 48px does the same for the one-row landscape
     board (tiles 179–227, button at 242 of 390). The practice runner's 80px
     face does not fit either. */
  const faceClass = dense ? "h-12 w-12" : "h-16 w-16";

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {/* THE ARTWORK THE QUESTION IS ABOUT — capped, and one tap from full
          screen.

          <QuestionArtwork>, not a bare <QuestionMediaView>, and the reason is
          measured. The room's board is a FIXED stage: 503px of column in
          portrait, 293px in landscape, with the teacher taking the left inset.
          Captured at 390x844, the four sign questions the lessons deal fitted
          that column with 0px to spare — an uncapped 106px artwork block put
          11–81px of them under the fold, which is the founder's oldest
          complaint about this product answered by re-committing it.

          So the picture is drawn to a budget and the whole block is a button
          that opens it FULL SCREEN. A capped sign is not a smaller question:
          it is one tap from being larger than any inline rendering could be.
          Below the 44px floor <QuestionArtwork> stops pretending and draws its
          strip — which is what the landscape board (293px for a question and
          four three-line options) actually has room for. */}
      <QuestionArtwork
        media={question.media}
        heightPx={dense ? 44 : 72}
        labelBg="Уголеми изображението към въпроса"
      />
      <p className="text-[14px] font-semibold leading-snug text-foreground">{question.textBg}</p>

      {/* THE PICTURE GRID'S SHAPE — and why the sideways phone gets its own.
          Captured at 844x390 (an iPhone 16 held landscape, which is how the
          room is watched): two columns put the four tiles on TWO rows and
          pushed „Отговори" 34px below the bottom of the board column. Four
          signs on screen and no way to answer them is the same defect wearing
          a different costume. One row of four fits the 410px column with room
          to spare — the same rule, for the same reason, as the sim's
          micro-quiz overlay. Portrait keeps two columns: 260px of column will
          not carry four. */}
      <ul
        className={
          signGrid
            ? `grid gap-1.5 ${dense ? "grid-cols-4" : "grid-cols-2"}`
            : "flex flex-col gap-1.5"
        }
      >
        {question.options.map((o, i) => {
          const isCorrect = verdict?.correctOptionIds.includes(o.id) ?? false;
          const chosen = selected.includes(o.id);
          const stateClasses =
            verdict === null
              ? chosen
                ? "border-accent bg-accent/5"
                : "border-border"
              : isCorrect
                ? "border-success bg-success/10"
                : chosen
                  ? "border-danger bg-danger/10"
                  : "border-border opacity-60";

          if (signGrid) {
            // SIGN IDENTIFICATION — the option IS the picture. `textBg` is only
            // the accessible name („Знак 3"); the four captions are
            // interchangeable, which is precisely why the text-only rendering
            // was not a hard question but an unanswerable one. The whole tile
            // is the label, so the control is sr-only — the one exception
            // checkControl.test.ts sanctions.
            return (
              <li key={o.id} className="min-w-0">
                <label
                  className={`flex h-full cursor-pointer flex-col items-center gap-1 rounded-xl border p-1.5 focus-within:ring-2 focus-within:ring-accent/50 ${stateClasses}`}
                >
                  <input
                    type={question.type === "single" ? "radio" : "checkbox"}
                    name={question.questionId}
                    value={o.id}
                    checked={chosen}
                    disabled={verdict !== null}
                    onChange={() => toggle(o.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className="flex h-5 w-5 self-start items-center justify-center rounded-md border border-border bg-surface font-mono text-[10px] font-bold text-muted"
                  >
                    {i + 1}
                  </span>
                  {o.media !== undefined ? (
                    <SignFace
                      signRef={o.media.signRef}
                      /* The option's own caption — never a label that names the
                         sign, which would say the answer out loud. */
                      altBg={o.textBg}
                      className={faceClass}
                    />
                  ) : (
                    <span className="flex min-h-12 items-center text-center text-[13px] leading-snug">
                      {o.textBg}
                    </span>
                  )}
                  {verdict !== null && isCorrect ? (
                    <span className="text-[10px] font-bold text-success">Верен отговор</span>
                  ) : verdict !== null && chosen ? (
                    <span className="text-[10px] font-bold text-danger">Твоят избор</span>
                  ) : null}
                </label>
              </li>
            );
          }

          return (
            <li key={o.id}>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2 text-[13px] leading-snug ${stateClasses}`}
              >
                <CheckControl
                  type={question.type === "single" ? "radio" : "checkbox"}
                  name={question.questionId}
                  checked={chosen}
                  disabled={verdict !== null}
                  onChange={() => toggle(o.id)}
                  className="mt-0.5"
                />
                <span className="text-foreground">{o.textBg}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {verdict === null ? (
        <button
          type="button"
          disabled={pending || selected.length === 0}
          onClick={() =>
            startTransition(async () => {
              setVerdict(
                await answerLessonQuiz(lessonId, beatId, question.questionId, selected),
              );
            })
          }
          className="btn-accent self-start px-3 py-1.5 text-[13px] font-bold disabled:opacity-40"
        >
          Отговори
        </button>
      ) : (
        <div className="flex min-h-0 flex-col gap-2">
          <p
            className="font-mono text-[10px] font-bold uppercase tracking-wide"
            style={{ color: verdict.correct ? "var(--success)" : "var(--danger)" }}
          >
            {verdict.correct ? "✓ Вярно" : "✕ Не съвсем — ето защо"}
          </p>
          <p className="text-[13px] leading-snug text-foreground">{verdict.explanationBg}</p>

          {verdict.optionWhyBg.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {verdict.optionWhyBg.map((row) => (
                <li key={row.optionId} className="text-[12px] leading-snug text-muted">
                  {row.whyBg}
                </li>
              ))}
            </ul>
          )}

          {/* The board, on a wrong answer. This is the founder's whole idea
              running in the place he asked for it: the teacher does not
              re-explain, it turns round and plays the mistake. Portrait only —
              a landscape phone has ~250 px of room and the explanation is what
              has to survive in it. */}
          {!verdict.correct && !dense && <VerdictBoard board={verdict.board} />}

          {verdict.lawRefs.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {verdict.lawRefs.map((r) => (
                <li
                  key={`${r.act}-${r.ref}`}
                  className="rounded-full border border-border px-2 py-px font-mono text-[10px] font-bold text-accent-soft"
                >
                  {r.act} {r.ref}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onNext}
            className="btn-accent self-start px-3 py-1.5 text-[13px] font-bold"
          >
            Продължи
          </button>
        </div>
      )}
    </div>
  );
}

/** The recorded mistake behind a wrong answer, when the bank wires one. */
function VerdictBoard({ board }: { board: ResolvedBoard | null }) {
  if (board === null || board.wrong === undefined) return null;
  return (
    <figure className="rounded-xl border border-danger/40 p-1">
      <MistakeReplay
        tracePath={board.wrong.tracePath}
        districtId={board.wrong.districtId}
      />
      <figcaption className="mt-1 px-1 text-[12px] leading-snug text-foreground/90">
        {board.wrong.whatWentWrongBg}
      </figcaption>
    </figure>
  );
}

export default ClassroomRoom;
