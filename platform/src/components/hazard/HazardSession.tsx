"use client";

/**
 * The run orchestrator — one clip at a time, forever the same three beats:
 * watch → react → be told why.
 *
 * ONE COMPONENT FOR ALL THREE DOORS. The founder's placement decision (free
 * inside the simulator · its own paid section · a theory lesson step) is
 * satisfied by mounting THIS component with a different `door` prop and
 * different surrounding chrome. Nothing below branches on the door except the
 * label on the way out. If a future surface needs different behaviour here, the
 * requirement is wrong: two behaviours mean two measurements, and two
 * measurements cannot be pooled into the safety claim this feature exists for.
 *
 * WHY THE ACTIONS ARE IMPORTED RATHER THAN PASSED IN. Both server actions gate
 * and validate per door on the server (actions.ts), so every door calling the
 * SAME two endpoints is the property we want — a door that supplied its own
 * action pair would be a door that could supply its own gate. This is the same
 * shape ExamRunner uses with submitExamAction.
 *
 * THE CLIENT NEVER COMPUTES A SCORE. It reports media timestamps; every number
 * rendered on this page came back from the server. There is no place in this
 * file where a points value is derived, adjusted or defaulted.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  startHazardRunAction,
  submitHazardReactionAction,
} from "@/app/(dashboard)/hazard/actions";
import { HAZARD_ERROR_COPY_BG, formatPointsBg, formatRunPositionBg } from "./copy";
import { HazardClipStage } from "./HazardClipStage";
import { HazardReveal } from "./HazardReveal";
import { HazardSummary } from "./HazardSummary";
import type {
  HazardActionErrorCode,
  HazardDoor,
  HazardItemCard,
  HazardItemFeedback,
  HazardRunProgress,
  HazardRunSummary,
} from "./types";

interface HazardSessionProps {
  door: HazardDoor;
  /** Shown until the first run starts — the door's own framing. */
  children?: ReactNode;
  /** CTA label in the idle state. */
  startLabelBg: string;
}

export function HazardSession({ door, children, startLabelBg }: HazardSessionProps) {
  const [runId, setRunId] = useState<string | null>(null);
  const [card, setCard] = useState<HazardItemCard | null>(null);
  const [feedback, setFeedback] = useState<HazardItemFeedback | null>(null);
  const [queuedCard, setQueuedCard] = useState<HazardItemCard | null>(null);
  const [summary, setSummary] = useState<HazardRunSummary | null>(null);
  const [progress, setProgress] = useState<HazardRunProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<HazardActionErrorCode | null>(null);

  /**
   * The card the reveal belongs to. Kept separately from `card` because the
   * timeline needs the clip's LENGTH, and by the time the reveal renders the
   * next clip may already be queued — reading duration off the wrong card
   * would silently misplace every marker on the timeline.
   */
  const [judgedCard, setJudgedCard] = useState<HazardItemCard | null>(null);

  // Focus lands on the verdict when it appears: a keyboard or screen-reader
  // user must not have to hunt for the thing they just waited for.
  const revealAnchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (feedback !== null) revealAnchorRef.current?.focus();
  }, [feedback]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    setJudgedCard(null);
    setQueuedCard(null);
    setSummary(null);
    try {
      const result = await startHazardRunAction(door);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      setRunId(result.runId);
      setCard(result.item);
      setProgress(result.progress);
    } catch {
      // A network failure, a redeploy mid-click, a rate limit. The student can
      // do nothing with the detail, so they get a retryable sentence.
      setError("FAILED");
    } finally {
      setBusy(false);
    }
  }, [door]);

  /**
   * The last reaction we tried to submit.
   *
   * Kept because the stage hands its presses over exactly once and then stops
   * being a source of truth. Without this, a dropped connection at the moment
   * of submission strands the student in front of a finished clip with no way
   * forward and a reaction that really happened — and the only recovery would
   * be to lose the run. Retrying is also SAFE by construction: the server
   * measures plausibility from when the clip was served, and a retry can only
   * make media time lag further behind the wall clock, which is the direction
   * that is always allowed.
   */
  const [lastAttempt, setLastAttempt] = useState<{
    presses: number[];
    watchedToSec: number;
  } | null>(null);

  const submit = useCallback(
    async (pressesMediaSec: number[], watchedToSec: number) => {
      if (runId === null || card === null) return;
      setLastAttempt({ presses: pressesMediaSec, watchedToSec });
      setBusy(true);
      setError(null);
      try {
        const result = await submitHazardReactionAction({
          runId,
          itemId: card.itemId,
          pressesMediaSec,
          watchedToSec,
        });
        if (!result.ok) {
          setError(result.code);
          return;
        }
        setJudgedCard(card);
        setFeedback(result.feedback);
        setQueuedCard(result.next);
        setSummary(result.summary);
        setProgress(result.progress);
      } catch {
        setError("FAILED");
      } finally {
        setBusy(false);
      }
    },
    [runId, card],
  );

  const retrySubmit = useCallback(() => {
    if (lastAttempt === null) return;
    void submit(lastAttempt.presses, lastAttempt.watchedToSec);
  }, [submit, lastAttempt]);

  /** Dismiss the reveal: either the next clip, or the run summary. */
  const advance = useCallback(() => {
    setFeedback(null);
    setJudgedCard(null);
    if (queuedCard !== null) {
      setCard(queuedCard);
      setQueuedCard(null);
    } else {
      setCard(null);
    }
  }, [queuedCard]);

  // ── idle: the door's own framing + the CTA ───────────────────────────────
  if (runId === null) {
    return (
      <div className="flex flex-col gap-6">
        {children}
        {error !== null ? <ErrorNote code={error} /> : null}
        <div>
          <button type="button" className="btn-accent" onClick={start} disabled={busy}>
            {busy ? "Подготвя се…" : startLabelBg}
          </button>
        </div>
      </div>
    );
  }

  // ── finished: the summary owns the screen ────────────────────────────────
  if (card === null && feedback === null && summary !== null) {
    return <HazardSummary summary={summary} onRestart={busy ? null : start} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {progress !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="hud-label">
            Клип{" "}
            {formatRunPositionBg(
              card?.index ?? judgedCard?.index ?? progress.answered,
              progress.total,
            )}
          </p>
          <p className="hud-label tabular-nums">
            {formatPointsBg(progress.points, progress.maxPoints)}
          </p>
        </div>
      ) : null}

      {/* A failure mid-run always leaves a way out, and WHICH way depends on
          whether the run itself survived: a lost connection is retryable with
          the reaction the student already gave, a lost run is not. */}
      {error !== null ? (
        <ErrorNote code={error}>
          {RETRYABLE.has(error) && lastAttempt !== null ? (
            <button type="button" className="btn-ghost" onClick={retrySubmit} disabled={busy}>
              Изпрати реакцията пак
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={start} disabled={busy}>
              Започни нова тренировка
            </button>
          )}
        </ErrorNote>
      ) : null}

      {/* The stage stays mounted while the reveal is up only when there is
          nothing to reveal — otherwise the verdict replaces the clip, so the
          student reads the teaching instead of re-watching the road. */}
      {feedback === null && card !== null ? (
        <HazardClipStage card={card} onFinished={submit} busy={busy} />
      ) : null}

      {feedback !== null && judgedCard !== null ? (
        <div ref={revealAnchorRef} tabIndex={-1} className="outline-none">
          <HazardReveal
            feedback={feedback}
            durationSec={judgedCard.durationSec}
            onContinue={busy ? null : advance}
            continueLabelBg={queuedCard !== null ? "Следващ клип" : "Виж резултата"}
          />
        </div>
      ) : null}

      {busy && feedback === null ? (
        <p aria-live="polite" className="hud-label text-accent-2">
          Оценява се…
        </p>
      ) : null}
    </div>
  );
}

/**
 * Failures where the reaction the student gave is still good and only the
 * request failed. Everything else means the run is gone.
 */
const RETRYABLE = new Set<HazardActionErrorCode>(["FAILED", "IMPLAUSIBLE"]);

/**
 * A failure the student can read. `assertive` because, unlike a reaction
 * confirmation, this one stops them getting what they came for — and it always
 * carries a control, so the panel is never a dead end.
 */
function ErrorNote({
  code,
  children,
}: {
  code: HazardActionErrorCode;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-xl border border-danger/45 bg-surface-2 p-3 text-sm text-foreground"
    >
      <p>{HAZARD_ERROR_COPY_BG[code]}</p>
      {children !== undefined ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
