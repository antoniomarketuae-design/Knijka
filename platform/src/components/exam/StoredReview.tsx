"use client";

/**
 * Full review for a COMPLETED attempt, hydrated from the localStorage cache
 * the runner writes right after a successful submit.
 *
 * Why localStorage: the exam module's public API (getExamHistory) exposes
 * only the score summary for past attempts, not the graded per-question
 * payload — so cross-device review history needs a future engine API. On the
 * device where the exam was taken, this restores the complete review.
 */

import { useEffect, useState } from "react";
import { ReviewList } from "./ExamResultView";
import {
  reviewStorageKey,
  type StoredReviewPayload,
} from "./types";

export function StoredReview({ attemptId }: { attemptId: string }) {
  const [payload, setPayload] = useState<StoredReviewPayload | null>(null);
  const [checked, setChecked] = useState(false);

  // Deferred to a task so state updates land outside the effect commit.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(reviewStorageKey(attemptId));
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            Array.isArray((parsed as StoredReviewPayload).review)
          ) {
            setPayload(parsed as StoredReviewPayload);
          }
        }
      } catch {
        // unreadable cache — fall through to the notice
      }
      setChecked(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [attemptId]);

  if (!checked) return null;

  if (!payload) {
    return (
      <p className="card p-5 text-sm leading-relaxed text-muted">
        Пълният преглед на въпросите е достъпен веднага след предаването на
        изпита — на устройството, от което е предаден. За този опит е запазен
        само крайният резултат.
      </p>
    );
  }

  return (
    <section aria-labelledby="stored-review-title" className="flex flex-col gap-3">
      <h2 id="stored-review-title" className="text-base font-extrabold">
        Преглед на въпросите
      </h2>
      <ReviewList review={payload.review} />
    </section>
  );
}
