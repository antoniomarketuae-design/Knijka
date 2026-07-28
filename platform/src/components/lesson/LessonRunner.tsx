"use client";

/**
 * The lesson runner — the ENGINE's own surface.
 *
 * SCOPE NOTE FOR THE OTHER LANE. This is deliberately a plain, phone-first
 * rendering of `@/modules/lesson/client`: a speech area, a board, a hand-raise
 * and a quiz. It exists so the sequencing, the interruption and the mini-quiz
 * can be sat through and judged end to end without waiting on the classroom
 * (the room, the teacher's body, the presentation). The classroom surface
 * consumes exactly the same three things this file consumes — `LessonOutline`,
 * `ResolvedBeat` and `TeacherState` — and replaces the presentation. Nothing
 * in the engine needs to change when it does; that is the point of the seam.
 *
 * WHAT IT DOES THAT A VIDEO CANNOT. The teacher delivers a beat one sentence
 * at a time. СТОП is live at every moment of every beat. Pressing it holds at
 * the END of the current sentence, dims the board WITHOUT clearing it (the
 * student interrupted about something — destroying the referent forces them to
 * describe what they were looking at), takes a chip or free text, answers with
 * citations, and then continues from the sentence after the one that was
 * playing. It acknowledges the first interruption of a beat and then stops
 * acknowledging, because the same line every time is what makes warm software
 * feel canned.
 *
 * BANDWIDTH. One beat is fetched at a time and nothing is prefetched. The
 * board is the 2D canvas trace replay by default (MistakeMedia upgrades to a
 * rendered reel only where the manifest already has one), and only ONE half of
 * a compare board is mounted at a time — the toggle is what fetches the other
 * trace. A 390 px screen cannot show two replays side by side anyway, so the
 * cheap design and the correct design are the same design here.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  askTeacher,
  answerLessonQuiz,
  loadBeat,
} from "@/app/(dashboard)/lesson/actions";
import { CheckControl } from "@/components/ui/CheckControl";
import {
  createLessonPlayer,
  canRaiseHand,
  modelAsksExhausted,
  resumeLineFor,
  stepLesson,
  teacherStateOf,
  MAX_INTERRUPTION_LENGTH,
  type AskChip,
  type InterruptionAnswer,
  type LessonOutline,
  type LessonPlayerState,
  type LessonQuizQuestion,
  type LessonQuizVerdict,
  type ResolvedBeat,
  type ResolvedBoard,
  type TeacherState,
} from "@/modules/lesson/client";

const MistakeMedia = dynamic(
  () => import("@/components/theory/MistakeMedia").then((m) => m.MistakeMedia),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="h-36 w-full animate-pulse rounded-xl border border-border bg-surface-2/50 motion-reduce:animate-none"
      />
    ),
  },
);

/**
 * A stand-in for one utterance in the player's skeleton lesson. The reducer
 * counts `say` entries and never reads them, so the content is irrelevant —
 * what matters is that the count is right (see `lessonForPlayer`).
 */
const PLACEHOLDER_SAY = { src: "frame", lineId: "recap" } as const;

/** How the teacher's state reads in the speech area's status line. */
const TEACHER_LABEL_BG: Record<TeacherState, string> = {
  speaking: "Учителят обяснява",
  listening: "Учителят слуша",
  thinking: "Учителят мисли",
  answering: "Учителят отговаря",
  quizzing: "Проверка",
  idle: "Пауза",
};

interface Props {
  outline: LessonOutline;
  /** The first beat, rendered with the page — every later one is fetched. */
  firstBeat: ResolvedBeat;
}

export function LessonRunner({ outline, firstBeat }: Props) {
  const [state, setState] = useState<LessonPlayerState>(() =>
    createLessonPlayer(outline.lessonId),
  );
  const [beat, setBeat] = useState<ResolvedBeat>(firstBeat);
  const [quiz, setQuiz] = useState<LessonQuizQuestion[]>([]);

  /**
   * The last answer, TAGGED WITH THE BEAT IT ANSWERED. Tagging rather than
   * clearing on beat change is what keeps this out of an effect: an answer
   * about beat 3 simply stops rendering once the cursor is on beat 4, with no
   * state update to schedule and no frame where the wrong answer is on screen.
   */
  const [answer, setAnswer] = useState<{
    beatId: string;
    value: InterruptionAnswer;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const askBoxRef = useRef<HTMLTextAreaElement>(null);
  // The hand went up: put the caret where the question goes. The chips are
  // still one tap away, so this costs a student who wanted a chip nothing.
  useEffect(() => {
    if (state.phase === "held") askBoxRef.current?.focus();
  }, [state.phase]);

  /**
   * The reducer wants a `Lesson`, but it only ever reads the SHAPE — each
   * beat's kind, how many sentences it has and how many questions it deals.
   * The outline carries exactly those, so the runner reconstitutes a skeleton
   * with the right dimensions and no content. That is what keeps the promise
   * that a beat's Bulgarian arrives only when the student reaches it, while
   * still letting the state machine know that the beat it is entering HAS
   * three sentences — the thing a client that guesses zero gets wrong by
   * silently skipping the beat.
   */
  const lessonForPlayer = useMemo(
    () => ({
      id: outline.lessonId,
      sectionId: outline.sectionId,
      topicId: "",
      order: outline.order,
      titleBg: outline.titleBg,
      topicTitleBg: outline.topicTitleBg,
      beats: outline.beats.map((b) => ({
        id: b.id,
        kind: b.kind,
        tone: b.tone,
        say: Array.from({ length: b.sayCount }, () => PLACEHOLDER_SAY),
        conceptIds: [],
        questionIds: [],
        ruleCodes: [],
        signIds: [],
        board: null,
        questionCount: b.questionCount,
      })),
    }),
    [outline],
  );

  const dispatch = useCallback(
    (event: Parameters<typeof stepLesson>[1]) => {
      setState((prev) => stepLesson(prev, event, lessonForPlayer));
    },
    [lessonForPlayer],
  );

  /**
   * „Напред". In a voiced classroom the end of a sentence is an event the
   * audio raises; with a text teacher the student raises it by reading on. The
   * last sentence of a beat ends the beat, so the press carries straight into
   * the next one rather than parking on a screen with nothing new on it — but
   * a QUIZ beat stops, because the beat's whole purpose is what happens next.
   */
  const advance = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== "speaking") {
        return stepLesson(prev, { type: "NEXT" }, lessonForPlayer);
      }
      const ended = stepLesson(prev, { type: "UTTERANCE_END" }, lessonForPlayer);
      return ended.phase === "beat-end"
        ? stepLesson(ended, { type: "NEXT" }, lessonForPlayer)
        : ended;
    });
  }, [lessonForPlayer]);

  // ---- Beat loading: one at a time, never ahead -----------------------------
  // „Loading" is DERIVED, not stored: the cursor has moved to a beat whose
  // payload has not arrived. One source of truth, and no setState in an effect.
  const wantedBeatId = outline.beats[state.beatIndex]?.id ?? null;
  const loadingBeat = wantedBeatId !== null && wantedBeatId !== beat.beatId;

  useEffect(() => {
    if (wantedBeatId === null) return;
    // The FIRST beat ships with the page, so mounting must not refetch it.
    // The one exception is a quiz beat, whose questions are dealt separately
    // and deliberately — they are never sent ahead of the beat that asks them.
    if (wantedBeatId === beat.beatId && !beat.quiz) return;
    let alive = true;
    loadBeat(outline.lessonId, wantedBeatId).then((payload) => {
      if (!alive) return;
      setBeat(payload.beat);
      setQuiz(payload.quiz);
    });
    return () => {
      alive = false;
    };
    // Intentionally keyed on the WANTED beat only: `beat` is the effect's own
    // output, and listing it would re-run the fetch on its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedBeatId, outline.lessonId]);

  // ---- Interruption --------------------------------------------------------
  const send = (questionBg: string, chip: AskChip | null) => {
    // Clear the previous answer as the new question goes out. Leaving it up
    // while the teacher thinks reads as if the old answer were the new one.
    setAnswer(null);
    dispatch({ type: "ASK_SENT" });
    startTransition(async () => {
      const result = await askTeacher(
        outline.lessonId,
        beat.beatId,
        questionBg,
        chip === null ? null : chip.id,
        state.modelAsksInBeat,
      );
      setAnswer({ beatId: beat.beatId, value: result });
      setDraft("");
      dispatch({ type: "ANSWER_READY", debited: result.debited });
      // A board command is not speech: execute it and go straight back to the
      // lesson rather than making the student dismiss an empty bubble.
      if (result.source === "board") dispatch({ type: "RESUME" });
    });
  };

  const teacher = teacherStateOf(state);
  const shown = Math.min(state.utteranceIndex + 1, beat.utterances.length);
  const visible = state.phase === "ready" ? 0 : shown;
  // An answer only belongs to the beat it answered (see `answer` above).
  const shownAnswer =
    answer !== null && answer.beatId === beat.beatId ? answer.value : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-32">
      <ProgressRail outline={outline} state={state} />

      {/* THE BOARD. Dimmed while the teacher listens — never cleared. */}
      <div
        className={
          state.phase === "held" || state.phase === "thinking" || state.phase === "answering"
            ? "opacity-40 transition-opacity"
            : "transition-opacity"
        }
      >
        <Board key={beat.beatId} board={beat.board} />
      </div>

      {/* THE SPEECH AREA. */}
      <section
        aria-live="polite"
        className="rounded-2xl border border-border bg-surface p-4"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {state.phase === "finished" ? "Край на урока" : TEACHER_LABEL_BG[teacher]}
          {loadingBeat ? " · зарежда" : ""}
        </p>

        {state.phase === "ready" ? (
          <div className="flex flex-col gap-3">
            <p className="text-base text-foreground">
              {outline.titleBg} · урок {outline.order} от {outline.totalLessons}
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: "START" })}
              className="self-start rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground"
            >
              Започни урока
            </button>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {beat.utterances.slice(0, visible).map((u) => (
              <li key={u.id} className="text-base leading-relaxed text-foreground">
                {u.textBg}
                {u.lawRefs.length > 0 ? (
                  <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                    {u.lawRefs.map((r) => (
                      <span
                        key={`${r.act}-${r.ref}`}
                        className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted"
                      >
                        {r.act} {r.ref}
                      </span>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {state.acknowledgeResume && state.phase === "speaking" ? (
          <p className="mt-3 text-sm italic text-muted">{resumeLineFor(beat.beatId)}</p>
        ) : null}

        {/* The answer to an interruption. */}
        {shownAnswer !== null && shownAnswer.source !== "board" ? (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-3">
            <p className="text-sm leading-relaxed text-foreground">{shownAnswer.bodyBg}</p>
            {shownAnswer.turnBackBg !== undefined ? (
              <p className="mt-2 text-sm font-semibold text-accent">{shownAnswer.turnBackBg}</p>
            ) : null}
            {shownAnswer.citations.length > 0 ? (
              <p className="mt-2 flex flex-wrap gap-1">
                {shownAnswer.citations.map((r) => (
                  <span
                    key={`${r.act}-${r.ref}`}
                    className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted"
                  >
                    {r.act} {r.ref}
                  </span>
                ))}
              </p>
            ) : null}
            {shownAnswer.offer !== undefined ? (
              <Link
                href={shownAnswer.offer.href}
                className="mt-3 inline-block rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-accent-foreground"
              >
                {shownAnswer.offer.labelBg}
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* THE QUIZ. */}
      {state.phase === "quiz" && quiz[state.quizIndex] !== undefined ? (
        <QuizCard
          key={quiz[state.quizIndex].questionId}
          lessonId={outline.lessonId}
          beatId={beat.beatId}
          question={quiz[state.quizIndex]}
          onAnswered={(correct) => dispatch({ type: "QUIZ_ANSWERED", correct })}
          onNext={() => dispatch({ type: "QUIZ_NEXT" })}
        />
      ) : null}

      {state.phase === "finished" ? (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-base font-bold text-foreground">Готово.</p>
          <p className="mt-1 text-sm text-muted">
            {state.quizAnswered > 0
              ? `Верни отговори: ${state.quizCorrect} от ${state.quizAnswered}.`
              : "Урокът е изгледан."}
            {state.asksTotal > 0 ? ` Зададе ${state.asksTotal} въпроса.` : ""}
          </p>
          <Link
            href={`/theory/practice?section=${encodeURIComponent(outline.sectionId)}`}
            className="mt-3 inline-block rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground"
          >
            Тренировка по темата
          </Link>
        </section>
      ) : null}

      {/* THE HELD STATE — the ask box. */}
      {state.phase === "held" ? (
        <section className="rounded-2xl border border-accent bg-surface p-4">
          <p className="mb-2 text-sm font-semibold text-foreground">Кажи. Какво не е ясно?</p>
          <div className="flex flex-wrap gap-2">
            {beat.chips.map((chip) =>
              chip.kind === "free" ? null : (
                <button
                  key={chip.id}
                  type="button"
                  disabled={pending}
                  onClick={() => send(chip.labelBg, chip)}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
                >
                  {chip.labelBg}
                </button>
              ),
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              ref={askBoxRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_INTERRUPTION_LENGTH))}
              rows={2}
              placeholder="Питай нещо друго…"
              className="w-full rounded-xl border border-border bg-surface-2 p-2 text-base text-foreground"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending || draft.trim().length === 0}
                onClick={() => send(draft, null)}
                className="rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground disabled:opacity-40"
              >
                Питай
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "CANCEL_HAND" })}
                className="rounded-xl border border-border px-4 py-2 font-semibold text-muted"
              >
                Няма нужда
              </button>
              {modelAsksExhausted(state) ? (
                <span className="text-xs text-muted">
                  Стигна лимита въпроси за тази част.
                </span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* THE CONTROL BAR — СТОП is live at every moment of every beat. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          {state.phase === "answering" ? (
            <button
              type="button"
              onClick={() => {
                setAnswer(null);
                dispatch({ type: "RESUME" });
              }}
              className="flex-1 rounded-xl bg-accent px-4 py-3 font-bold text-accent-foreground"
            >
              Продължи урока
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={!canRaiseHand(state)}
                // `atBoundary` — this teacher is TEXT. The sentence is fully on
                // screen the moment it renders, so there is nothing to finish
                // and the hand is taken immediately. A voiced teacher passes
                // false and holds when the audio raises UTTERANCE_END.
                onClick={() => dispatch({ type: "HAND_RAISE", atBoundary: true })}
                className="rounded-xl border-2 border-accent px-4 py-3 font-bold text-accent disabled:opacity-30"
              >
                {state.holdRequested ? "…спира" : "СТОП / питай"}
              </button>
              {state.phase === "speaking" || state.phase === "beat-end" ? (
                <button
                  type="button"
                  onClick={advance}
                  className="flex-1 rounded-xl bg-accent px-4 py-3 font-bold text-accent-foreground"
                >
                  {state.phase === "speaking" && visible < beat.utterances.length
                    ? "По-нататък"
                    : "Напред"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProgressRail({
  outline,
  state,
}: {
  outline: LessonOutline;
  state: LessonPlayerState;
}) {
  return (
    <header className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {outline.topicTitleBg} · урок {outline.order} от {outline.totalLessons}
      </p>
      <h1 className="text-lg font-bold text-foreground">{outline.titleBg}</h1>
      <div className="mt-1 flex gap-1" aria-hidden>
        {outline.beats.map((b, i) => (
          <span
            key={b.id}
            className={`h-1 flex-1 rounded-full ${
              i < state.beatIndex
                ? "bg-accent"
                : i === state.beatIndex
                  ? "bg-accent/60"
                  : "bg-surface-2"
            }`}
          />
        ))}
      </div>
    </header>
  );
}

/**
 * The board. A compare board mounts ONE half at a time — the toggle is what
 * fetches the other trace, so „и двете" costs two traces only for a student
 * who actually asks for both.
 */
function Board({ board }: { board: ResolvedBoard | null }) {
  // No reset effect: callers KEY this component on the beat (or the question)
  // it belongs to, so a new board is a new component and starts on the wrong
  // half with a fresh replay by construction.
  const [showRight, setShowRight] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  if (board === null) return null;
  if (board.mode === "sign" && board.sign !== undefined) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-bold text-foreground">
          {board.sign.code} · {board.sign.nameBg}
        </p>
        <p className="mt-1 text-sm text-muted">{board.sign.meaningBg}</p>
      </section>
    );
  }
  const half = showRight && board.right !== undefined ? board.right : board.wrong;
  if (half === undefined) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">
          {showRight ? "Както трябва" : "Както се обърква"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setReplayKey((k) => k + 1)}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted"
          >
            Пак
          </button>
          {board.right !== undefined ? (
            <button
              type="button"
              onClick={() => setShowRight((v) => !v)}
              className="rounded-full border border-accent px-3 py-1 text-xs font-semibold text-accent"
            >
              {showRight ? "Покажи грешката" : "Покажи правилното"}
            </button>
          ) : null}
        </div>
      </div>
      <MistakeMedia
        key={`${half.tracePath}-${replayKey}`}
        tracePath={half.tracePath}
        districtId={half.districtId}
      />
      {!showRight && board.wrong !== undefined ? (
        <p className="mt-2 text-sm text-muted">{board.wrong.whatWentWrongBg}</p>
      ) : null}
      {board.drill !== undefined ? (
        <Link
          href={`/simulator?scenario=${encodeURIComponent(board.drill.templateId)}&level=${board.drill.level}`}
          className="mt-2 inline-block text-sm font-semibold text-accent"
        >
          Виж го в симулатора →
        </Link>
      ) : null}
    </section>
  );
}

/**
 * One quiz question. THEO-4: there is no bare verdict here — a wrong answer
 * shows the question's stored explanation, the per-option rationale where the
 * bank has it, the citations, and the wired mistake board. The teacher does
 * not re-explain; it sends the student to the board.
 */
function QuizCard({
  lessonId,
  beatId,
  question,
  onAnswered,
  onNext,
}: {
  lessonId: string;
  beatId: string;
  question: LessonQuizQuestion;
  onAnswered: (correct: boolean) => void;
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

  const submit = () => {
    startTransition(async () => {
      const result = await answerLessonQuiz(lessonId, beatId, question.questionId, selected);
      setVerdict(result);
      onAnswered(result.correct);
    });
  };

  return (
    <section className="rounded-2xl border border-accent/60 bg-surface p-4">
      <p className="text-base font-semibold text-foreground">{question.textBg}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {question.options.map((o) => {
          const isCorrect = verdict?.correctOptionIds.includes(o.id) ?? false;
          const chosen = selected.includes(o.id);
          return (
            <li key={o.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                  verdict === null
                    ? chosen
                      ? "border-accent bg-accent/5"
                      : "border-border"
                    : isCorrect
                      ? "border-success bg-success/10"
                      : chosen
                        ? "border-danger bg-danger/10"
                        : "border-border opacity-70"
                }`}
              >
                <CheckControl
                  type={question.type === "single" ? "radio" : "checkbox"}
                  name={question.questionId}
                  checked={chosen}
                  disabled={verdict !== null}
                  onChange={() => toggle(o.id)}
                />
                <span className="text-sm text-foreground">{o.textBg}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {verdict === null ? (
        <button
          type="button"
          disabled={pending || selected.length === 0}
          onClick={submit}
          className="mt-3 rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground disabled:opacity-40"
        >
          Отговори
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-foreground">{verdict.explanationBg}</p>
          {verdict.optionWhyBg.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {verdict.optionWhyBg.map((row) => (
                <li key={row.optionId} className="text-xs text-muted">
                  {row.whyBg}
                </li>
              ))}
            </ul>
          ) : null}
          {verdict.lawRefs.length > 0 ? (
            <p className="flex flex-wrap gap-1">
              {verdict.lawRefs.map((r) => (
                <span
                  key={`${r.act}-${r.ref}`}
                  className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted"
                >
                  {r.act} {r.ref}
                </span>
              ))}
            </p>
          ) : null}
          {verdict.board !== null ? <Board key={verdict.questionId} board={verdict.board} /> : null}
          <button
            type="button"
            onClick={onNext}
            className="self-start rounded-xl bg-accent px-4 py-2 font-bold text-accent-foreground"
          >
            Продължи
          </button>
        </div>
      )}
    </section>
  );
}

export default LessonRunner;
