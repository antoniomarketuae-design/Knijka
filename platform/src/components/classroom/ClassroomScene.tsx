"use client";

/**
 * The classroom.
 *
 * „A student standing in front of a Teacher, where the teacher explains the
 * theory […] show on a board behind like the student is staying in a class
 * room" — the founder. This component is that frame: a room with a teacher in
 * it and a board behind them, composed so it reads on a phone held upright and
 * on the same phone turned sideways.
 *
 * IT IS A 2D/CSS ROOM, ON PURPOSE. The simulator already owns the GPU budget
 * and this screen has to open fast on Bulgarian mobile data; a WebGL classroom
 * would spend a frame budget on wallpaper. What makes it a room instead of a
 * video player is three static gradients (wall, chalk rail, floor) and one
 * piece of composition: the board's plane runs full width BEHIND the teacher,
 * and the teacher stands on the floor in front of its left edge. Depth from
 * overlap, which costs nothing.
 *
 * THE ORCHESTRATION IT OWNS is deliberately small: which beat is playing, what
 * state the teacher is in, which side of the board is up. Everything with a
 * cost — the answer to an interruption, the mini-quiz, the mastery write —
 * arrives through `ClassroomHandlers` from the lesson lane. The room is fully
 * operable with none of them wired, which is the property that let the two
 * lanes build in parallel.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { usePrefersReducedMotion } from "@/lib/hooks/clientEnv";
import "./classroom.css";
import AskBar from "./AskBar";
import LessonBoard from "./LessonBoard";
import TeacherStage from "./TeacherStage";
import Transcript from "./Transcript";
import {
  beatDurationSec,
  isBeatAdvancing,
  isBoardDimmed,
  lessonDurationSec,
  pauseAtBoundary,
  teacherTransition,
  type TeacherAction,
} from "./player";
import type {
  AskAnswer,
  AskChip,
  BoardSide,
  ClassroomHandlers,
  ClassroomLesson,
  TeacherState,
} from "./types";

/** How long the „picking the thread back up" beat lasts, ms. */
const RESUME_MS = 700;

/** The compact arrangement: a phone turned sideways has no vertical room. */
const COMPACT_QUERY = "(max-height: 560px) and (orientation: landscape)";

function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return compact;
}

/** Bottom breathing room under the room, px. */
const PAGE_TAIL_PX = 16;
/**
 * Below this the room stops shrinking and the page is allowed to scroll: an
 * 80 px room is worse than a scrollbar. The landscape floor is far lower on
 * purpose — a 390 px-tall window minus the dashboard header has ~290 px to
 * give, and refusing to fit into it would push the board off-screen, which is
 * the exact failure the fixed height exists to prevent.
 */
const MIN_SCENE_PX = 460;
const MIN_SCENE_COMPACT_PX = 210;

/**
 * Pin the scene to the viewport it was actually given.
 *
 * A classroom that scrolls is not a classroom — the board goes above the fold
 * and the teacher goes below it. But this page sits inside the dashboard shell
 * (a header, a `<main>` with its own padding), so „the height available" is
 * not `100dvh` and no CSS constant can know what it is. So: measure this
 * element's own top edge against the visual viewport and set the height from
 * it, live. On a very short window it stops shrinking and lets the page
 * scroll, because an 80 px room is worse than a scrollbar.
 */
function useViewportHeight(ref: React.RefObject<HTMLDivElement | null>, minPx: number): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      // Height 0 first: measuring our own top while we are still the tall
      // element that pushed the page into a scroll would read a scrolled top.
      el.style.height = "0px";
      const top = el.getBoundingClientRect().top + window.scrollY;
      const available = window.innerHeight - top - PAGE_TAIL_PX;
      el.style.height = `${Math.max(available, minPx)}px`;
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [ref, minPx]);
}

export function ClassroomScene({
  lesson,
  handlers,
}: {
  lesson: ClassroomLesson;
  handlers?: ClassroomHandlers;
}) {
  const compact = useCompactLayout();
  const reducedMotion = usePrefersReducedMotion();

  const [beatIndex, setBeatIndex] = useState(0);
  const [teacher, dispatchTeacher] = useReducer(teacherTransition, "idle" as TeacherState);
  // Which half of the pair is up. Stored as an OVERRIDE keyed by beat, not as
  // plain state reset on beat change: a beat opens on the side its author
  // chose (a teacher shows the right way first), and deriving that rather than
  // assigning it in an effect means the first render of a new beat is already
  // showing the right side — no correcting second commit, no flash of the
  // previous beat's mistake.
  const [sideOverride, setSideOverride] = useState<{ beatId: string; side: BoardSide } | null>(
    null,
  );
  const [replayNonce, setReplayNonce] = useState(0);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [answerPending, setAnswerPending] = useState(false);

  /** 0..1 through the current beat. A ref, because it ticks every frame. */
  const progressRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useViewportHeight(rootRef, compact ? MIN_SCENE_COMPACT_PX : MIN_SCENE_PX);

  const beats = lesson.beats;
  const beat = beats[Math.min(beatIndex, beats.length - 1)];
  const total = beats.length;
  const durationSec = useMemo(() => beatDurationSec(beat), [beat]);
  const lessonMin = Math.max(1, Math.round(lessonDurationSec(beats) / 60));

  const act = useCallback((action: TeacherAction) => dispatchTeacher(action), []);

  const side: BoardSide =
    sideOverride?.beatId === beat.id ? sideOverride.side : (beat.board?.opensOn ?? "correct");
  const setSide = useCallback(
    (next: BoardSide) => setSideOverride({ beatId: beat.id, side: next }),
    [beat.id],
  );

  // A new beat restarts the clock. Refs and one DOM write only — see `side`
  // above for why nothing here calls setState.
  useEffect(() => {
    progressRef.current = 0;
    if (barRef.current) barRef.current.style.width = "0%";
  }, [beat]);

  // The lesson clock. It runs ONLY while the teacher actually lectures, so a
  // raised hand freezes the beat instead of racing it (doc 84 §5.1).
  useEffect(() => {
    if (!isBeatAdvancing(teacher)) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      progressRef.current = Math.min(1, progressRef.current + (now - last) / (durationSec * 1000));
      last = now;
      if (barRef.current) barRef.current.style.width = `${progressRef.current * 100}%`;
      if (progressRef.current >= 1) {
        handlers?.onBeatComplete?.(beat.id, beatIndex);
        if (beatIndex + 1 < total) {
          setBeatIndex((i) => i + 1);
        } else {
          handlers?.onLessonComplete?.(lesson.id);
          act({ type: "finish" });
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [teacher, durationSec, beat.id, beatIndex, total, lesson.id, handlers, act]);

  const raiseHand = useCallback(() => {
    // Doc 84 §5.1 rule 1: stop at the end of the sentence, not mid-word. The
    // playhead jumps forward to the boundary rather than being abandoned, so
    // the resume picks up a whole sentence later — which is what the student
    // just heard.
    progressRef.current = pauseAtBoundary(beat.sayBg, progressRef.current, durationSec);
    if (barRef.current) barRef.current.style.width = `${progressRef.current * 100}%`;
    setAnswer(null);
    act({ type: "raise-hand" });
  }, [act, beat.sayBg, durationSec]);

  const resume = useCallback(() => {
    setAnswer(null);
    setAnswerPending(false);
    act({ type: "resume" });
    window.setTimeout(() => act({ type: "resumed" }), reducedMotion ? 0 : RESUME_MS);
  }, [act, reducedMotion]);

  const ask = useCallback(
    async (question: string) => {
      act({ type: "submit-question" });
      setAnswerPending(true);
      try {
        const reply = handlers?.onAsk
          ? await handlers.onAsk(question, beat)
          : {
              // The tutor lane is not wired in this build. Saying so plainly is
              // the only honest thing to render here — an invented answer in a
              // law-teaching product is the exact failure ADR-002 exists to
              // prevent, and a spinner that never resolves is a bug report.
              bodyBg:
                "Отговорите на въпроси още не са свързани в тази версия на класната стая. Въпросът ти е записан и ще получи отговор от AI-учителя, когато урочният слой бъде включен.",
            };
        setAnswer(reply);
      } catch {
        setAnswer({
          bodyBg: "Нещо се обърка при търсенето на отговор. Опитай пак след малко.",
        });
      } finally {
        setAnswerPending(false);
        act({ type: "answer-ready" });
      }
    },
    [act, beat, handlers],
  );

  const onChip = useCallback(
    (chip: AskChip) => {
      switch (chip.kind) {
        case "board-replay":
          setReplayNonce((n) => n + 1);
          return;
        case "board-correct":
          setSide("correct");
          return;
        case "board-mistake":
          setSide("mistake");
          return;
        default:
          void ask(chip.labelBg);
      }
    },
    [ask, setSide],
  );

  const started = teacher !== "idle";
  const dimBoard = isBoardDimmed(teacher);
  const chips = beat.ask ?? [];

  /**
   * Teacher width. Not a constant: at 390 px the figure has to be small enough
   * to leave the board a diagram, and at 1280 px a 96 px person in the corner
   * of a wall reads as a sticker rather than as someone teaching. The room and
   * the figure read it from the SAME custom property, so the board's left
   * inset can never drift out of step with the person standing in it.
   */
  const teacherW = compact ? "100px" : "clamp(88px, 11vw, 148px)";

  // On the dense (short) board the take's caption has nowhere to live, so it
  // moves into the transcript column rather than being clipped off the bottom
  // of the diagram. Same sentence, same source, one column to the right.
  const take = beat.board ? (side === "correct" ? beat.board.correct : beat.board.mistake) : null;
  const boardNote =
    compact && take
      ? {
          titleBg: take.titleBg,
          captionBg: take.captionBg,
          tint: side === "correct" ? "var(--success)" : "var(--danger)",
          mark: side === "correct" ? "✓" : "✕",
        }
      : null;

  return (
    <div ref={rootRef} className="flex w-full flex-col gap-2">
      <LessonHeader
        lesson={lesson}
        beatIndex={beatIndex}
        total={total}
        lessonMin={lessonMin}
        barRef={barRef}
        compact={compact}
      />

      <div className={`flex min-h-0 flex-1 gap-2 ${compact ? "flex-row" : "flex-col"}`}>
        {/* ---------------------------------------------------------------
            THE ROOM. One relatively-positioned box. Back to front: the lit
            wall · the mounted board plane, which runs the FULL width so its
            left edge passes behind the teacher · the wall/floor hairline ·
            the floor · the board's own content, inset to the right of the
            teacher · and the teacher, standing on the floor, overlapping the
            plane's bottom-left corner. Depth from overlap. No WebGL.
        --------------------------------------------------------------- */}
        <div
          className="cl-room relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-border"
          style={{ "--cl-teacher-w": teacherW } as CSSProperties}
        >
          <div aria-hidden className="cl-room-wall absolute inset-0" />
          <div aria-hidden className="cl-board-plane absolute" />
          <div aria-hidden className="cl-room-rail absolute inset-x-0" />
          <div aria-hidden className="cl-room-floor absolute inset-x-0 bottom-0" />

          <div
            className="relative flex h-full min-h-0 flex-col"
            style={{
              // Longhands only: React warns (correctly) that mixing `padding`
              // with `paddingLeft` in one style object makes the result depend
              // on key order during a re-render.
              paddingTop: compact ? 8 : 10,
              paddingRight: compact ? 8 : 10,
              // The board starts where the teacher ends — one custom property,
              // read by both, so they cannot drift apart.
              paddingLeft: "calc(var(--cl-teacher-w) + 14px)",
              // …and stops above the floor the teacher is standing on.
              paddingBottom: compact ? 30 : 44,
            }}
          >
            {beat.board ? (
              <LessonBoard
                board={beat.board}
                side={side}
                onSideChange={setSide}
                dimmed={dimBoard}
                replayNonce={replayNonce}
                dense={compact}
                className="flex-1"
              />
            ) : (
              <BoardIdle kind={beat.kind} dimmed={dimBoard} />
            )}
          </div>

          {/* The figure: absolute, so it can overlap the board plane without
              taking width from it, and bottom-anchored so it stands on the
              floor rather than floating in the middle of the wall. */}
          <div className="absolute bottom-1 left-2 z-10" style={{ width: "var(--cl-teacher-w)" }}>
            <TeacherStage source={lesson.teacher} state={teacher} compact={compact} />
          </div>
        </div>

        {/* --------------------------------------------------------------- */}
        <div className={`flex min-h-0 flex-col gap-2 ${compact ? "w-[286px] shrink-0" : ""}`}>
          <Transcript
            beat={beat}
            index={beatIndex}
            total={total}
            state={teacher}
            answer={answer}
            answerPending={answerPending}
            boardNote={boardNote}
            fade={compact}
            className={compact ? "min-h-0 flex-1" : "max-h-[34vh] shrink-0"}
          />

          {started ? (
            <AskBar
              chips={chips}
              state={teacher}
              onRaiseHand={raiseHand}
              onChip={onChip}
              onFreeText={(q) => void ask(q)}
              onResume={resume}
            />
          ) : (
            <button
              type="button"
              onClick={() => act({ type: "start" })}
              className="btn-primary shrink-0 px-4 py-2.5 text-sm font-bold"
            >
              {beatIndex === 0 ? "Започни урока" : "Продължи урока"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Header: where you are in the course, and how long this takes. */
function LessonHeader({
  lesson,
  beatIndex,
  total,
  lessonMin,
  barRef,
  compact,
}: {
  lesson: ClassroomLesson;
  beatIndex: number;
  total: number;
  lessonMin: number;
  barRef: React.RefObject<HTMLDivElement | null>;
  compact: boolean;
}) {
  return (
    <header className="flex shrink-0 flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        {lesson.kickerBg && (
          <span className="truncate font-mono text-[10px] font-bold uppercase tracking-wide text-muted">
            {lesson.kickerBg}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[10px] font-bold text-muted">
          ≈ {lessonMin} мин
        </span>
      </div>
      {!compact && (
        <h1 className="truncate text-lg font-bold leading-tight text-foreground">
          {lesson.titleBg}
        </h1>
      )}

      {/* Beat pips + the running bar for the beat in progress: „урок 3 от 54"
          is the thing the theory hub does not have today — a path. */}
      <div className="flex items-center gap-1.5">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className="h-1 flex-1 overflow-hidden rounded-full"
              style={{ background: i < beatIndex ? "var(--accent)" : "var(--surface-2)" }}
            >
              {i === beatIndex && (
                <div ref={barRef} className="h-full rounded-full bg-accent" style={{ width: 0 }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {lesson.isPlaceholder && !compact && (
        <p className="truncate rounded-lg border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] leading-snug text-warning">
          Демо: текстовете и записите са одобрени, преподавателят е{" "}
          <strong>запазено място</strong>.
        </p>
      )}
    </header>
  );
}

/** What the board shows on a beat that has no pair to show. */
function BoardIdle({ kind, dimmed }: { kind: string; dimmed: boolean }) {
  const quiz = kind === "quiz";
  return (
    <div
      className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border-strong p-4 text-center"
      style={{ opacity: dimmed ? 0.42 : 1, transition: "opacity 240ms ease" }}
    >
      <p className="max-w-[28ch] text-[12px] leading-snug text-muted">
        {quiz ? (
          <>
            <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-wide text-accent-2">
              място за мини-тест
            </span>
            Тук учителят спира и пита дали си разбрал — въпросите идват от същия банков въпросник и
            се оценяват на сървъра.
          </>
        ) : (
          "Учителят говори — на дъската няма запис за тази част."
        )}
      </p>
    </div>
  );
}

export default ClassroomScene;
