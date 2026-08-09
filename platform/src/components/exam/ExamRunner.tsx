"use client";

/**
 * Mock-exam runner — the serious mode. No feedback of any kind until submit:
 * the component only ever receives safe ExamQuestion views (no correct
 * flags), and correct answers appear exclusively in the submit action's
 * response, after the attempt is closed server-side.
 *
 * Refresh safety: answers + flags are mirrored to localStorage per attempt;
 * the server page rebuilds the same question set from the seed cookie and
 * passes the authoritative elapsed time, so a reload resumes exactly where
 * the candidate left off.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  POINT_SCALES,
  pointsBg,
  pointsWordsBg,
} from "@/lib/content/pointScales";
import type { ExamQuestion } from "@/modules/exam";
import { submitExamAction } from "@/app/(dashboard)/exams/actions";
import {
  ARTWORK_MIN_PX,
  QuestionArtwork,
  SignFace,
  useArtworkBudget,
} from "@/components/theory/QuestionMedia";
import { useIsShort, useQuestionBudget } from "@/components/theory/questionBudget";
import { CheckControl } from "@/components/ui/CheckControl";
import { ExamResultView } from "./ExamResultView";
import {
  answersStorageKey,
  formatClock,
  reviewStorageKey,
  type ResultSummary,
  type ReviewQuestion,
  type SubmitExamInput,
} from "./types";

interface ExamRunnerProps {
  attemptId: string;
  questions: ExamQuestion[];
  durationSec: number;
  /** Seconds already elapsed (server clock) — nonzero after a reload. */
  initialElapsedSec: number;
}

/**
 * THE ANSWER BOX comes from components/ui/CheckControl — the same element the
 * practice runner mounts, and now the other six tick boxes in the app. It used
 * to be copied into this file to keep the exam route free of PracticeSession's
 * why-panel and clip replay; the shared module has no dependencies at all, so
 * the import costs this route nothing it did not already pay.
 *
 * Why it is not the browser's box (measurements and the two Tailwind scanner
 * traps live in that file): `accent-color` tints only the CHECKED fill, so an
 * empty control was painted entirely from `color-scheme` — pinned dark here —
 * at 1.72 : 1 against this runner's card, against WCAG 1.4.11's 3 : 1.
 */

/** Remaining-time checkpoints (sec) announced via aria-live. */
const ANNOUNCE_AT = [1200, 600, 300, 120, 60, 30];
/** Visual warning threshold: under 5 minutes. */
const WARN_UNDER_SEC = 300;

interface StoredProgress {
  answers: Record<string, string[]>;
  flags: Record<string, boolean>;
}

function parseStoredProgress(raw: string): StoredProgress {
  const parsed: unknown = JSON.parse(raw);
  const answers: Record<string, string[]> = {};
  const flags: Record<string, boolean> = {};
  if (typeof parsed === "object" && parsed !== null) {
    const p = parsed as Record<string, unknown>;
    if (typeof p.answers === "object" && p.answers !== null) {
      for (const [k, v] of Object.entries(p.answers)) {
        if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
          answers[k] = v as string[];
        }
      }
    }
    if (typeof p.flags === "object" && p.flags !== null) {
      for (const [k, v] of Object.entries(p.flags)) {
        if (v === true) flags[k] = true;
      }
    }
  }
  return { answers, flags };
}

export function ExamRunner({
  attemptId,
  questions,
  durationSec,
  initialElapsedSec,
}: ExamRunnerProps) {
  const router = useRouter();

  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [restored, setRestored] = useState(false);
  const [remainingSec, setRemainingSec] = useState(() =>
    Math.max(0, durationSec - initialElapsedSec),
  );
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  /** Phone-only: the paper navigator as a sheet (see the <nav> below). */
  const [navOpen, setNavOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{
    summary: ResultSummary;
    review: ReviewQuestion[];
  } | null>(null);

  /** Set once by the countdown effect on mount (Date.now() is impure in render). */
  const mountedAtRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const submitOnceRef = useRef(false);
  // Start at the initial remaining time so a resumed exam only announces
  // checkpoints it actually crosses (never earlier, larger ones).
  const lastAnnouncedRef = useRef(Math.max(0, durationSec - initialElapsedSec));
  const dialogRef = useRef<HTMLDivElement>(null);
  /** The question CARD — what the two height budgets keep on screen. */
  const cardRef = useRef<HTMLElement>(null);
  /** The question TEXT's own box — the last thing that gives (row C5). */
  const questionBoxRef = useRef<HTMLSpanElement>(null);
  const firstRenderRef = useRef(true);

  // -- restore in-progress answers after a reload (same device) -------------
  // Deferred to a task so state updates land outside the effect commit.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(answersStorageKey(attemptId));
        if (raw) {
          const stored = parseStoredProgress(raw);
          setAnswers(stored.answers);
          setFlags(stored.flags);
        }
      } catch {
        // corrupted payload — start clean rather than crash the exam
      }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [attemptId]);

  // -- persist on every change ----------------------------------------------
  useEffect(() => {
    if (!restored || outcome) return;
    try {
      window.localStorage.setItem(
        answersStorageKey(attemptId),
        JSON.stringify({ answers, flags }),
      );
    } catch {
      // storage full/blocked — the exam still works, just without refresh safety
    }
  }, [answers, flags, restored, outcome, attemptId]);

  // -- countdown --------------------------------------------------------------
  useEffect(() => {
    if (outcome) return;
    // One-time clock anchor: survives re-runs of this effect via the refs.
    if (mountedAtRef.current === null || deadlineRef.current === null) {
      mountedAtRef.current = Date.now();
      deadlineRef.current =
        mountedAtRef.current +
        Math.max(0, durationSec - initialElapsedSec) * 1000;
    }
    const id = window.setInterval(() => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const rem = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSec(rem);
      if (rem <= 0) window.clearInterval(id);
    }, 500);
    return () => window.clearInterval(id);
  }, [outcome, durationSec, initialElapsedSec]);

  // -- polite screen-reader announcements at checkpoints only ----------------
  useEffect(() => {
    for (const t of ANNOUNCE_AT) {
      if (remainingSec <= t && lastAnnouncedRef.current > t) {
        lastAnnouncedRef.current = remainingSec;
        setAnnouncement(
          t >= 60
            ? `Оставащо време: ${Math.round(t / 60)} минути`
            : `Оставащо време: ${t} секунди`,
        );
        break;
      }
    }
  }, [remainingSec]);

  // -- submission --------------------------------------------------------------
  const doSubmit = useCallback(async () => {
    if (submitOnceRef.current) return;
    submitOnceRef.current = true;
    setConfirmOpen(false);
    setSubmitting(true);
    setSubmitError(null);

    const payload: SubmitExamInput = {
      attemptId,
      answers: questions.map((q) => ({
        questionId: q.id,
        optionIds: answers[q.id] ?? [],
      })),
      clientElapsedSec: Math.round(
        initialElapsedSec +
          (Date.now() - (mountedAtRef.current ?? Date.now())) / 1000,
      ),
    };

    try {
      const res = await submitExamAction(payload);
      if (!res.ok) {
        if (res.code === "ALREADY_SUBMITTED") {
          router.replace("/exams?msg=already-submitted");
        } else if (res.code === "INVALID_INPUT") {
          submitOnceRef.current = false;
          setSubmitError(
            "Изпращането не успя поради невалидни данни. Опитай отново.",
          );
        } else if (res.code === "RATE_LIMITED") {
          // The paper stays on screen and the retry stays armed: nothing was
          // submitted, so nothing was lost — this is a "wait a moment", never
          // a lost exam.
          submitOnceRef.current = false;
          setSubmitError(
            "Твърде много опити подред. Изчакай малко и предай отново.",
          );
        } else {
          router.replace("/exams?msg=not-found");
        }
        return;
      }
      try {
        window.localStorage.removeItem(answersStorageKey(attemptId));
        window.localStorage.setItem(
          reviewStorageKey(attemptId),
          JSON.stringify({ summary: res.summary, review: res.review }),
        );
      } catch {
        // cache is best-effort; the result below still renders
      }
      setOutcome({ summary: res.summary, review: res.review });
    } catch {
      // network hiccup: keep every answer, let the candidate retry
      submitOnceRef.current = false;
      setSubmitError(
        "Изпращането не успя. Провери интернет връзката и опитай отново.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [answers, attemptId, initialElapsedSec, questions, router]);

  // -- auto-submit at 0:00 (after restore, so stored answers are included) ---
  useEffect(() => {
    if (!restored || outcome || remainingSec > 0) return;
    const timer = window.setTimeout(() => {
      void doSubmit();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [restored, outcome, remainingSec, doSubmit]);

  // -- confirm dialog focus + Escape -----------------------------------------
  useEffect(() => {
    if (!confirmOpen) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  // -- move focus to the question when navigating (not on first paint) -------
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    cardRef.current?.focus();
  }, [idx]);

  // -- derived -----------------------------------------------------------------
  const q = questions[idx];
  const answeredCount = questions.reduce(
    (n, question) => n + ((answers[question.id] ?? []).length > 0 ? 1 : 0),
    0,
  );
  const unansweredCount = questions.length - answeredCount;
  const timeLow = remainingSec < WARN_UNDER_SEC;
  // TWO columns on a phone held sideways — `short:sm:` is „short AND wide" and
  // nothing else, so a portrait phone and a desktop both keep the single
  // column. The „three once there are more than four options" rule that used to
  // be here was falsified on the 780x360 Android floor: a third column costs
  // each answer 123px of text width, and the wrapping that buys back is worth
  // more than the row it saves. PracticeSession.tsx carries the measurements —
  // they are the same list, the same widths and the same items, and the two
  // runners must not disagree about a question's shape.
  //
  // Hoisted out of the JSX for the reason PracticeSession records: inline, the
  // ternary defeats the source scanners that guard these files, and a class
  // string a scanner cannot read is a class string Tailwind might not emit.
  const shortOptionColumns = "short:sm:grid-cols-2";

  // Phase 5: the artwork gives back whatever the question card is over the
  // phone fold by — same hook, same floor, same reasoning as practice.
  const artworkPx = useArtworkBudget(cardRef, q.id, q.media != null);
  // ROW C5, IN THE SURFACE IT WAS NEVER MEASURED IN. The founder's sentence was
  // „The Exams section is absolutely the same thing", and it was worse: every
  // `max-sm:` in this file is a WIDTH test, so an iPhone held sideways (852 x
  // 393) was served the DESKTOP exam into 393px of height — the meta row, the
  // 2xl clock and the 45-button navigator all in flow, the action bar not
  // pinned at all.
  //
  // THE CONTROL, RE-DERIVED ON THIS TREE (2026-08-04) with only this file
  // reverted to its pre-change state, everything else identical — fold rig,
  // WebKit, 852x393, the 20 heaviest questions in the bank. 0 of 20 had every
  // option on the screen. The action bar was not pinned on ANY of them, the
  // 45-button navigator was in flow on all 20, 53 of those 20 questions' 92
  // answer options were not fully visible, the worst option sat 228px past the
  // bottom edge and the document scrolled by up to 490px.
  //
  // (An earlier note here said 276px / 538px. That figure was taken before
  // dashboard/autoHideTopbar.ts landed, which reclaims 48px on exactly this
  // viewport, so it was not a control for this change — 228 / 490 is, and the
  // 48px difference is the whole of the discrepancy.)
  //
  // AFTER: 17 of 20 at 852x393, and the three that were left — q-vehicle-058 by
  // 25px, q-ptp-062 by 5px and q-vehicle-063 with the banner up by 15px — were
  // all inside the height of this file's own header card. That card is gone on
  // phones now; the row below is what closed them.
  //
  // ---------------------------------------------------------------------------
  // THE HEADER CARD, AND THE PARITY IT WAS COSTING — 2026-08-05, WebKit, fold
  // rig, the 18 heaviest questions in the bank plus the two six-option items
  // again with the under-five-minutes banner up (20 cases per surface per
  // profile), fold = the top of the pinned action bar.
  //
  //   THE CONTROL is this tree with ONLY this file reverted — not a memory and
  //   not yesterday's column. It had to be re-taken: another lane landed the
  //   `narrow-tall:` question clamp in PracticeSession, questionBudget and this
  //   file WHILE the first baseline was being measured, and it moved the
  //   practice column by up to 43px. A before/after taken across that boundary
  //   would have credited their pixels to this change.
  //
  //     profile              practice   exam CONTROL   exam NOW
  //     iPhone   393x852      20/20        20/20        20/20
  //     iPhone   852x393      20/20        18/20        20/20
  //     Android  360x780      20/20        19/20        20/20
  //     Android  780x360      20/20        11/20        20/20
  //
  //   Parity, which is the acceptance: the exam no longer fits worse than
  //   practice on any device in the ladder. Worst remaining margin on the exam
  //   is -8px (360x780) and -42px (852x393) — negative is slack.
  //
  //   WHAT THE CARD COST, measured rather than argued: at 852x393 it put the
  //   question text 46px lower (legend top 59 -> 13) on every one of the 20
  //   cases; at 393x852 it cost 54px, and 83px on the multi-answer items, where
  //   the „Всички верни" pill wrapped it to a second row.
  //
  //   AND THE DUPLICATION IT WAS THERE FOR. The sweep counts every element in
  //   the content region whose own text reads like a counter or a clock. On a
  //   phone this runner drew THREE counters — „Въпрос 1" and „отг. 0" in the
  //   card, „0/45" in the bar, two of them the same number — and ONE clock. It
  //   now draws exactly one of each, on all four profiles: the position in the
  //   bar's paper button and the countdown beside it, 18px, inside the pinned
  //   strip. The clock never disappeared and never got smaller; the header's
  //   copy was `sm:block` and had never once been on a phone screen.
  //
  // THE HOOK IS THE PRACTICE RUNNER'S, UNCHANGED. It was written standalone for
  // exactly this — a second implementation would be two layout systems one edit
  // apart from disagreeing. The order it enforces is load-bearing: the picture
  // shrinks to ARTWORK_MIN_PX FIRST and only a bottomed-out artwork budget
  // unlocks the words, because clipping a question while a 150px diagram still
  // has room to give is the wrong trade.
  //
  // AND IT IS NOT DEAD CODE HERE, but it is carrying much less: across the 80
  // exam cases of the 2026-08-05 ladder the clamp binds on exactly ONE
  // (q-vehicle-063 at 360x780, 36px of question parked inside the box). It used
  // to bind on seven. Two things took the weight off it — the other lane's
  // `narrow-tall:` twins, and this row giving the card back the header's height
  // and 32px of width — and that is the right direction: the clamp is the LAST
  // thing that should give, so a ladder where it almost never fires is a ladder
  // where almost nothing had to be traded.
  const questionMaxPx = useQuestionBudget(
    cardRef,
    questionBoxRef,
    q.id,
    q.media == null || artworkPx <= ARTWORK_MIN_PX,
  );
  const isShort = useIsShort();
  // THEO-1 data-driven artwork, narrowed once: the legacy `{type:"image"}`
  // placeholder shape is not something <QuestionArtwork> can draw.
  const artworkMedia = q.media !== null && "kind" in q.media ? q.media : null;
  // Once the budget has bottomed out the block is a 44px „Виж схемата ⤢" strip
  // — a control, not a picture — and on a landscape phone it moves into the bar
  // the thumb is already on. Same component, same full-screen viewer, same 54px
  // it was worth in practice; only the mount point moves.
  const artworkInBar =
    isShort && artworkMedia !== null && artworkPx <= ARTWORK_MIN_PX;

  const selectOption = (questionId: string, optionId: string, multi: boolean) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (!multi) return { ...prev, [questionId]: [optionId] };
      return {
        ...prev,
        [questionId]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      };
    });
  };

  const toggleFlag = (questionId: string) => {
    setFlags((prev) => {
      const next = { ...prev };
      if (next[questionId]) delete next[questionId];
      else next[questionId] = true;
      return next;
    });
  };

  // -- submitted: swap to the result view -------------------------------------
  if (outcome) {
    return (
      <div className="flex flex-col gap-6">
        <ExamResultView summary={outcome.summary} review={outcome.review} />
        <Link href="/exams" className="btn-ghost self-start">
          ← Обратно към изпитите
        </Link>
      </div>
    );
  }

  return (
    // `max-sm:-mb-6` cancels <main>'s bottom padding on phones — see the same
    // note in PracticeSession: with a pinned action bar, that padding only
    // ever bought the document enough extra height to scroll.
    <div className="flex flex-col gap-2 max-sm:-mb-6 max-sm:flex-1 short:-mb-1 short:flex-1 short:gap-1 sm:gap-4">
      {/* THE COUNTDOWN'S SCREEN-READER CHANNEL, AT THE ROOT.
          It used to live inside the header card below. The moment that card
          became desktop-only, a phone would have lost „Оставащо време: 5
          минути" with it — `display:none` takes an aria-live region out of the
          accessibility tree, silently, and nothing in a layout measurement
          would ever have said so. It belongs to the exam, not to one of the
          two surfaces that happen to draw the digits. */}
      <p aria-live="polite" role="status" className="visually-hidden">
        {announcement}
      </p>

      {/* THE HEADER CARD IS DESKTOP-ONLY, AND THAT IS THIS ROW.
          -------------------------------------------------------------------
          It was drawn at every viewport, and on a phone everything in it had a
          second home already:

            „Въпрос 1 от 45"   the paper position — now the label ON the
                               navigator button in the pinned bar below, which
                               used to read „0/45" (the ANSWERED count) and was
                               a fraction a candidate could only read as a
                               position anyway;
            „Отговорени: 0/45" the answered count — it was the SAME number the
                               navigator button was drawing, twice on one
                               screen, 14px in the card and 12px in the bar;
            the countdown      already pinned in the bar, where it cannot
                               scroll away — this copy was `sm:block` and never
                               appeared on a phone at all;
            „Предай"           now the accent action inside the paper sheet the
                               navigator button opens, i.e. behind the review
                               of what is still unanswered rather than a
                               permanent 44px target next to „Следващ";
            „3 т." / „Всички верни"
                               now two chips at the head of the question text,
                               where they cost no row of their own.

          What it cost: the card is 32px tall on a landscape phone plus the 4px
          column gap, and at 360px wide it WRAPPED to two rows. The exam's own
          fold measurements are in the block above `useQuestionBudget` below.

          `hidden wide-tall:flex` is ONE media query — (min-width: 640px) and
          (min-height: 521px) — deliberately, not `hidden short:hidden sm:flex`.
          globals.css says why in its own words: a display TOGGLE spelled as
          two competing variants is decided by emission order, and if that
          order ever flips, this card comes back on a landscape phone and takes
          the row with it. One query cannot flip. */}
      <header className="card hidden flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3 wide-tall:flex">
        <p data-exam-counter className="text-sm font-bold tabular-nums">
          Въпрос {idx + 1}
          <span className="text-muted"> от {questions.length}</span>
        </p>
        <p data-exam-counter className="text-sm tabular-nums text-muted">
          Отговорени: {answeredCount}/{questions.length}
        </p>

        <div className="ml-auto flex items-center gap-4">
          <p
            aria-hidden="true"
            data-exam-clock
            className={`font-mono text-2xl font-black tabular-nums ${
              timeLow ? "text-danger" : "text-foreground"
            }`}
          >
            {formatClock(remainingSec)}
          </p>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="btn-accent px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Предаване…" : "Предай изпита"}
          </button>
        </div>
      </header>

      {/* Under five minutes. The wording is short on a phone because this is
          the state the fold has LEAST room in and the sentence is the one
          thing on screen that is also being shouted by a red countdown pinned
          in the action bar. The full sentence stays for `sm` up and for the
          screen reader, which reads the live region either way. */}
      {timeLow ? (
        <p
          role="status"
          className="card border-danger/50 px-3 py-1.5 text-xs font-bold text-danger short:px-3 short:py-1 short:text-xs sm:px-4 sm:py-2.5 sm:text-sm"
        >
          <span className="short:inline sm:hidden">
            Под 5 минути — при изтичане изпитът се предава автоматично.
          </span>
          <span className="hidden short:hidden sm:inline">
            Остават по-малко от 5 минути. При изтичане на времето изпитът се
            предава автоматично.
          </span>
        </p>
      ) : null}

      {submitError ? (
        <div
          role="alert"
          className="card flex flex-wrap items-center gap-3 border-danger/50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-danger">{submitError}</p>
          <button
            type="button"
            onClick={() => void doSubmit()}
            className="btn-ghost px-4 py-2 text-sm"
          >
            Опитай отново
          </button>
        </div>
      ) : null}

      {/* `max-sm:flex-1 short:flex-1` — THE CARD IS THE SCREEN ON A PHONE, the
          same move the practice runner made and for the same three reasons: the
          action bar reaches the bottom edge instead of floating wherever the
          content happens to end, the artwork budget has room to draw something
          a student can read, and „Следващ" lands in the thumb zone. Measured
          before this: on the six heaviest artwork items the bar sat 8px above
          the last option in portrait — i.e. mid-card — and on every other
          question it was not pinned at all. */}
      <div className="grid gap-4 max-sm:flex-1 short:flex-1 short:gap-2 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Question card */}
        <section
          ref={cardRef}
          tabIndex={-1}
          aria-label={`Въпрос ${idx + 1} от ${questions.length}`}
          // `short:pt-2 narrow-tall:pt-2` — top only; the bottom's 12px is what
          // the action bar's `-mb-3` cancels. Same trade, same reason, same
          // numbers as PracticeSession.
          //
          // AND IT GOES FULL BLEED ON A PHONE, which PracticeSession did and
          // this file never did. Measured on the 780x360 Android, same question
          // (q-vehicle-058, five options): the practice card is 764px wide and
          // the exam's was 732 — 32px less text column for the same words, so
          // the same five answers wrapped one line further and the last of them
          // landed 23px lower. That was the whole of the residual left after
          // the header card went: 9px of document scroll on q-vehicle-058 and
          // 2px of overhang on the six-option item with the banner up.
          //
          // The 32px is <main>'s own `px-4`, given back by `-mx-4` and re-paid
          // as the card's padding, so nothing about the reading measure changes
          // — only the frame around it, which on a phone is a border a student
          // cannot use. Same three utilities as practice, same reason: the side
          // borders and the corner radius go with it, because a card that
          // reaches both edges and is still rounded has a seam.
          className="card flex flex-col gap-2 p-3 outline-none max-sm:-mx-4 max-sm:w-auto max-sm:rounded-none max-sm:border-x-0 max-sm:px-4 narrow-tall:pt-2 short:-mx-4 short:w-auto short:gap-2 short:rounded-none short:border-x-0 short:p-3 short:px-4 short:pt-2 sm:gap-4 sm:p-6"
        >
          {/* Meta row — DESKTOP ONLY, the same one media query as the header
              card above, and for the same reason. On a phone the weight and
              the multi-answer instruction are chips at the head of the question
              text (below) and the flag is the 44px control in the action bar.
              This used to be `short:hidden sm:flex`, which is the same set
              expressed as two variants racing on emission order. */}
          <div className="hidden flex-wrap items-center gap-2 wide-tall:flex">
            {/* WAS „3 точки" — the desktop twin of the phone pill below, and
                the same defect spelled out: bare „точки" reads as КОНТРОЛНИ
                точки. There is room here for the word form. */}
            <span
              title={POINT_SCALES.theory.noteBg}
              className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-black tabular-nums text-muted"
            >
              {pointsWordsBg("theory", q.points)}
            </span>
            {q.type === "multi" ? (
              <span className="rounded-full border border-warning/50 px-2.5 py-0.5 text-xs font-bold text-warning">
                Избери всички верни
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => toggleFlag(q.id)}
              aria-pressed={!!flags[q.id]}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition motion-reduce:transition-none ${
                flags[q.id]
                  ? "border-warning/60 bg-warning/10 text-warning"
                  : "border-border text-muted hover:border-border-strong hover:bg-surface-2"
              }`}
            >
              <FlagIcon />
              {flags[q.id] ? "Отбелязан за преглед" : "Отбележи за преглед"}
            </button>
          </div>

          <fieldset className="flex flex-col gap-2 short:gap-2 sm:gap-4">
            {/* mb-1: a <legend> is laid out outside the fieldset's flex
                formatting context, so the fieldset's `gap` never separated the
                question from the first option — they touched.

                THE QUESTION IS THE ONLY THING ALLOWED TO GIVE. It keeps
                whatever height is left after the artwork, the answers and the
                pinned bar have taken theirs, and scrolls inside its own box for
                the remainder — landscape phone only, and only when the clamp
                actually binds (the fade is the affordance, and a question cut
                off with nothing to say so reads as a rendering fault).
                `short:relative` gives that fade something to be absolute
                against; the box is a <span> INSIDE the <legend> because a
                legend nested in a div stops being the fieldset's rendered
                legend and the answer group loses its accessible name. */}
            <legend className="mb-1 text-lg font-bold leading-snug narrow-tall:relative short:relative">
              <span
                ref={questionBoxRef}
                data-question-box
                className={`block narrow-tall:overflow-y-auto narrow-tall:overscroll-contain short:overflow-y-auto short:overscroll-contain ${
                  questionMaxPx === null ? "" : "narrow-tall:pb-3 short:pb-3"
                }`}
                style={
                  questionMaxPx === null ? undefined : { maxHeight: questionMaxPx }
                }
              >
                {/* THE WEIGHT AND THE „ALL CORRECT" INSTRUCTION, ON A PHONE.
                    They were two pills in the header card; the header is gone
                    on phones and a row of its own would have given back most of
                    what removing it won (a 20px pill plus the column gap is
                    ~26 of the ~36px). Inline at the head of the question they
                    cost NOTHING in the common case — they sit on the first line
                    and the question flows around them — and at worst one line
                    when that line was already nearly full.

                    They are also in the right place semantically: „select all
                    correct" is an instruction about THIS question, not chrome,
                    and it is now part of the <legend> that names the answer
                    group, so a screen reader reads it with the question instead
                    of at the top of the page. Inside the scroll box on purpose:
                    the box starts at the top, so they are what a student sees
                    first, and the alternative (outside the box, still in the
                    legend) is a block-level row again. */}
                {/*
                  WAS „3 т." — the last bare „т." on the theory side, and the
                  one a candidate looks at for forty timed minutes.

                  The ABBREVIATED form here, not the word form the desktop meta
                  row uses: this pill sits inline at the head of the question
                  text on a phone and the block above measures what a line
                  costs. „3 т. по теорията" is the same phrase the student
                  already met on the simulator's micro-quiz chip — one counter,
                  one wording, both halves of the product — and the scale's
                  full sentence rides on `title`, as it does there.
                */}
                <span
                  title={POINT_SCALES.theory.noteBg}
                  className="mr-1.5 inline-block rounded-full bg-surface-2 px-2 py-0.5 align-[0.15em] text-[11px] font-black leading-normal tabular-nums text-muted wide-tall:hidden"
                >
                  {pointsBg("theory", q.points)}
                </span>
                {q.type === "multi" ? (
                  <span className="mr-1.5 inline-block rounded-full border border-warning/50 px-2 py-0.5 align-[0.15em] text-[11px] font-bold leading-normal text-warning wide-tall:hidden">
                    Всички верни
                  </span>
                ) : null}
                {q.textBg}
              </span>
              {questionMaxPx === null ? null : (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-3 bg-gradient-to-t from-surface to-transparent narrow-tall:block short:block"
                />
              )}
            </legend>

            {artworkMedia !== null && !artworkInBar ? (
              // THEO-1 data-driven media — the exact component the practice
              // runner mounts, so exam and practice can never diverge. On a
              // phone it is drawn to a height budget and opens full screen on
              // tap (QuestionMedia.tsx explains the reversal); from `sm` up it
              // is unchanged. 96px here for the same reason as practice.
              <QuestionArtwork media={artworkMedia} heightPx={artworkPx} />
            ) : q.media !== null && !("kind" in q.media) ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                Към този въпрос има{" "}
                {q.media.type === "image" ? "изображение" : "видеоклип"}, който
                скоро ще бъде наличен в платформата.
              </p>
            ) : null}

            {/* TWO COLUMNS (three past four options) WHEN THE SCREEN IS WIDE
                AND SHORT, i.e. a phone held sideways. Six options stop being
                six 44px rows and become two rows of three. */}
            <div
              className={`flex flex-col gap-1.5 short:gap-1.5 short:sm:grid sm:gap-2 ${shortOptionColumns}`}
            >
              {q.options.map((option) => {
                const checked = (answers[q.id] ?? []).includes(option.id);
                return (
                  // Same phone geometry as the practice row and for the same
                  // reason (PracticeSession.tsx has the arithmetic): the answer
                  // text column is what buys lines back, and `min-h-11` is the
                  // 44px thumb guarantee stated directly instead of inferred
                  // from padding.
                  <label
                    key={option.id}
                    className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition motion-reduce:transition-none short:gap-2.5 short:px-3 short:py-1.5 narrow-tall:py-2 sm:gap-3 sm:p-3.5 ${
                      checked
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-border-strong hover:bg-surface-2"
                    }`}
                  >
                    <CheckControl
                      type={q.type === "single" ? "radio" : "checkbox"}
                      name={`question-${q.id}`}
                      value={option.id}
                      checked={checked}
                      onChange={() =>
                        selectOption(q.id, option.id, q.type === "multi")
                      }
                      className="mt-0.5"
                    />
                    {option.media != null ? (
                      // THEO-1 sign-face option (same <SignFace> as practice);
                      // the adjacent text is the accessible name.
                      <SignFace
                        signRef={option.media.signRef}
                        altBg=""
                        className="h-16 w-16 shrink-0"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 text-sm leading-[1.45] sm:leading-relaxed short:leading-[1.45]">
                      {option.textBg}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Paper navigation.
              On phones this is a STICKY footer inside the card and it carries
              the countdown. Two things the founder hit on a real phone are
              fixed by that: „Следващ" sat below the fold on most questions (a
              scroll per question, 45 times, on a clock they are scored
              against), and the timer — the one number a candidate checks
              constantly — scrolled off the top the moment they reached the
              answers. Desktop keeps the plain in-flow row. */}
          {/* The negative margins TRACK THE CARD'S PADDING, and the card's
              padding just changed: full bleed made it `px-4` on a phone, so the
              bar is `-mx-4` there or it stops reaching the card's edges and
              grows a 4px seam down both sides. `rounded-b-none` for the same
              reason the card lost its radius. */}
          {/* `pb-1.5`, NOT `calc(0.375rem + env(safe-area-inset-bottom))`. THE
              HOME INDICATOR IS PAID FOR ONCE, BY <body>. That calc is right for
              a `fixed` surface — the navigator sheet below is one and keeps it
              — but this bar is `sticky` inside the card, inside <main>, inside
              <body>, and globals.css already pads <body> by exactly the inset.
              Paid twice it was 34px of dead glass in portrait and 21px in
              landscape, taken straight off the answers above it, on the surface
              that runs under a 40-minute clock. Measured before/after on the
              same page (WebKit, iPhone 16, real insets emulated): the lowest
              control moved from 41px above the indicator band to 7px above it —
              the 6px this padding has always claimed — and `q-vehicle-058` in
              the landscape exam went from 18px of document scroll to 0. */}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-4 max-sm:-mb-3 max-sm:rounded-b-none max-sm:border-border max-sm:bg-surface/95 max-sm:px-4 max-sm:pb-1.5 max-sm:pt-1.5 max-sm:backdrop-blur short:sticky short:bottom-0 short:z-20 short:-mx-4 short:-mb-3 short:rounded-b-none short:border-border short:bg-surface/95 short:px-4 short:pb-1.5 short:pt-1.5 short:backdrop-blur sm:pt-4">
            {/* The diagram/sign opener once it has stopped being a picture —
                see `artworkInBar`. `w-auto shrink-0` REPLACES the block's
                `block w-full` rather than being appended to it: two `w-*`
                utilities would fight over stylesheet order. */}
            {artworkInBar ? (
              <QuestionArtwork
                media={artworkMedia}
                heightPx={artworkPx}
                buttonClassName="inline-block w-auto shrink-0"
              />
            ) : null}
            <button
              type="button"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="btn-ghost px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
            >
              <span aria-hidden className="sm:hidden">
                ←
              </span>
              <span className="hidden sm:inline">← Предишен</span>
              <span className="visually-hidden sm:hidden">Предишен въпрос</span>
            </button>

            {/* Phone-only controls, in the one strip that never scrolls away:
                the flag, the paper, and the countdown. `wide-tall:hidden` is
                the complement of the header card's `wide-tall:flex` — one media
                query, so the two can never both be on or both be off. */}
            <button
              type="button"
              onClick={() => toggleFlag(q.id)}
              aria-pressed={!!flags[q.id]}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition motion-reduce:transition-none wide-tall:hidden ${
                flags[q.id]
                  ? "border-warning/60 bg-warning/10 text-warning"
                  : "border-border text-muted"
              }`}
            >
              <FlagIcon />
              <span className="visually-hidden">
                {flags[q.id] ? "Отбелязан за преглед" : "Отбележи за преглед"}
              </span>
            </button>
            {/* THE PAPER, AND THE POSITION COUNTER IS ITS LABEL.
                This button used to read „{answeredCount}/{questions.length}" —
                the ANSWERED count — while the header card two rows up drew
                „Въпрос 1 от 45" and „Отговорени: 0/45". Three counters, two of
                them the same number, on a 393px-tall screen. It now carries the
                position, which is what „N/45" next to a jump-table icon reads
                as anyway, and the answered count moved inside the sheet, where
                the 45 cells already colour it in. The label spells out both. */}
            <button
              type="button"
              data-exam-counter
              onClick={() => setNavOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Въпрос ${idx + 1} от ${questions.length}, отговорени ${answeredCount}. Отвори прегледа на изпита`}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border px-2.5 font-mono text-xs font-bold tabular-nums text-muted wide-tall:hidden"
            >
              <GridIcon />
              {idx + 1}/{questions.length}
            </button>
            {/* THE CLOCK, AND IT IS NOT ALLOWED TO GET SMALLER OR GO AWAY.
                This is a 40-minute scored paper; a candidate who cannot see the
                time left is being harmed by the interface. `text-lg` is 18px —
                bigger than every other readout in this bar — black weight,
                tabular mono so the digits do not jitter, and it turns red under
                five minutes. It is the ONLY clock on a phone: the 2xl copy in
                the header card is inside `wide-tall:flex` and cannot appear
                here. Measured at 360px wide: one visible clock, 18px. */}
            <p
              aria-hidden="true"
              data-exam-clock
              className={`font-mono text-lg font-black tabular-nums wide-tall:hidden ${
                timeLow ? "text-danger" : "text-foreground"
              }`}
            >
              {formatClock(remainingSec)}
            </p>
            <button
              type="button"
              onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
              disabled={idx === questions.length - 1}
              className="btn-ghost px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4"
            >
              <span aria-hidden className="sm:hidden">
                →
              </span>
              <span className="hidden sm:inline">Следващ →</span>
              <span className="visually-hidden sm:hidden">Следващ въпрос</span>
            </button>
          </div>
        </section>

        {/* Navigator.
            PHONE (phase 5): 45 buttons in a 9-column grid plus its legend is
            ~300px of DOCUMENT hanging below the question card — on a 852px
            screen that alone guarantees the page scrolls, and it is exactly the
            „information panel" the founder says is eating his screen. It is a
            jump table, not part of answering, so on a phone it becomes a sheet
            opened from the action bar and the page stops scrolling at all.
            From `sm` up it is the same panel in the same place as before. */}
        <nav
          aria-label="Навигация по въпросите"
          className="card hidden h-fit p-4 wide-tall:block"
        >
          <NavigatorGrid
            questions={questions}
            answers={answers}
            flags={flags}
            idx={idx}
            onPick={setIdx}
          />
          <NavigatorLegend />
        </nav>
      </div>

      {/* THE PAPER SHEET — and on a phone it is also where the exam is handed
          in. „Предай" was a permanent 44px accent button in the header card,
          two thumb-widths from „Следващ" on a 360px-wide bar; the action it
          fires is irreversible and it was the most dangerous neighbour on the
          screen. Here it sits behind a deliberate tap, under the 45 cells that
          show what is still unanswered — which is the review the confirmation
          dialog already assumes has happened (it counts the blanks back at
          you). Desktop keeps its always-visible „Предай изпита" in the header,
          where there is no bar and nothing to fat-finger. Nothing about the
          clock changes: it auto-submits at 0:00 either way, so a candidate who
          never opens this sheet still loses nothing. */}
      {navOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end wide-tall:hidden">
          <button
            type="button"
            aria-label="Затвори прегледа"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Преглед и предаване на изпита"
            className="card relative z-10 max-h-[80dvh] overflow-y-auto rounded-b-none p-4 [padding-bottom:calc(1rem+env(safe-area-inset-bottom))]"
          >
            <p className="mb-3 text-sm font-bold tabular-nums">
              Въпрос {idx + 1} от {questions.length}
              <span className="ml-2 font-semibold text-muted">
                Отговорени: {answeredCount}
              </span>
            </p>
            <NavigatorGrid
              questions={questions}
              answers={answers}
              flags={flags}
              idx={idx}
              onPick={(i) => {
                setIdx(i);
                setNavOpen(false);
              }}
            />
            <NavigatorLegend />
            {/* PINNED TO THE BOTTOM OF THE SHEET, and that is not decoration.
                The sheet is capped at 80dvh and 45 cells plus their legend are
                taller than that on a landscape phone — LOOKED AT, not assumed:
                the first version of this put „Предай изпита" after the legend
                and it was below the sheet's own scroll. A submit control a
                candidate has to go looking for inside a scroller is the same
                defect as one that is off the fold. */}
            <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-border bg-surface/95 px-4 pb-1 pt-3 backdrop-blur">
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="btn-ghost flex-1"
              >
                Затвори
              </button>
              <button
                type="button"
                onClick={() => {
                  // One overlay at a time: the sheet closes, the confirmation
                  // takes the screen. Two stacked dialogs is two `aria-modal`
                  // regions and no way back from the one underneath.
                  setNavOpen(false);
                  setConfirmOpen(true);
                }}
                disabled={submitting}
                className="btn-accent flex-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Предаване…" : "Предай изпита"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Submit confirmation dialog */}
      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Затвори прозореца"
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-dialog-title"
            aria-describedby="submit-dialog-desc"
            tabIndex={-1}
            className="card relative z-10 flex w-full max-w-md flex-col gap-4 p-6 shadow-glow outline-none"
          >
            <h2 id="submit-dialog-title" className="text-lg font-extrabold">
              Предаване на изпита
            </h2>
            <div id="submit-dialog-desc" className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">
                {unansweredCount === 0
                  ? `Отговорил си на всички ${questions.length} въпроса.`
                  : unansweredCount === 1
                    ? "Имаш 1 неотговорен въпрос."
                    : `Имаш ${unansweredCount} неотговорени въпроса.`}
              </p>
              <p className="text-muted">
                Неотговорените въпроси се броят за грешни. След предаването
                отговорите не могат да се променят.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="btn-ghost"
              >
                Продължи изпита
              </button>
              <button
                type="button"
                onClick={() => void doSubmit()}
                disabled={submitting}
                className="btn-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Предаване…" : "Предай изпита"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The 45-cell jump table. Extracted so the desktop panel and the phone sheet
 * are literally the same control — a second copy is how the two drift.
 */
function NavigatorGrid({
  questions,
  answers,
  flags,
  idx,
  onPick,
}: {
  questions: ExamQuestion[];
  answers: Record<string, string[]>;
  flags: Record<string, boolean>;
  idx: number;
  onPick: (i: number) => void;
}) {
  return (
    <ol className="grid grid-cols-9 gap-1.5 lg:grid-cols-5">
      {questions.map((question, i) => {
        const isAnswered = (answers[question.id] ?? []).length > 0;
        const isFlagged = !!flags[question.id];
        const isCurrent = i === idx;
        return (
          <li key={question.id} className="relative">
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={isCurrent ? "true" : undefined}
              aria-label={`Въпрос ${i + 1}${
                isAnswered ? ", отговорен" : ", без отговор"
              }${isFlagged ? ", отбелязан за преглед" : ""}`}
              className={`flex h-9 w-full items-center justify-center rounded-lg border text-xs font-bold tabular-nums transition motion-reduce:transition-none ${
                isCurrent
                  ? "border-accent bg-accent text-accent-foreground shadow-glow-sm"
                  : isAnswered
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border text-muted hover:border-border-strong hover:bg-surface-2"
              }`}
            >
              {i + 1}
            </button>
            {isFlagged ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-background bg-warning"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function NavigatorLegend() {
  return (
    <ul className="mt-4 flex flex-col gap-1.5 text-xs text-muted">
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-3 w-3 rounded bg-accent/15 outline outline-1 outline-accent/40"
        />
        отговорен
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3 w-3 rounded bg-accent" />
        текущ въпрос
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3 w-3 rounded-full bg-warning" />
        за преглед
      </li>
    </ul>
  );
}

function GridIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M2 2h4v4H2V2Zm5 0h4v4H7V2Zm5 0h2v4h-2V2ZM2 7h4v4H2V7Zm5 0h4v4H7V7Zm5 0h2v4h-2V7ZM2 12h4v2H2v-2Zm5 0h4v2H7v-2Zm5 0h2v2h-2v-2Z" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M3 1.5a.75.75 0 0 1 .75.75v.44l1.9-.47a4.5 4.5 0 0 1 3.06.37 3.5 3.5 0 0 0 2.37.29l1.5-.37A.75.75 0 0 1 13.5 3.2v5.6a.75.75 0 0 1-.57.73l-1.5.37a5 5 0 0 1-3.39-.42 3 3 0 0 0-2.04-.24l-2.25.56v4.45a.75.75 0 0 1-1.5 0v-12A.75.75 0 0 1 3 1.5Z" />
    </svg>
  );
}
