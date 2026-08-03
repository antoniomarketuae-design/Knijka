"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  NO_EXAM_DATE,
  fillMirrorFromServer,
  isMirrorCold,
  readDailyGoalMin,
  readExamDate,
} from "@/lib/onboarding/storage";
import { readOnboardingAction } from "@/app/onboarding/actions";

/**
 * Makes the onboarding promise true: „ще ти показваме колко дни остават".
 *
 * Reads the local mirror (exam date + daily goal) and renders small HUD chips
 * in the dashboard header. useSyncExternalStore serves `null` during
 * SSR/hydration and the real value after, with no mismatch.
 *
 * AND FILLS THE MIRROR WHEN IT IS COLD. The answers are the student's, not the
 * browser's (User.examDate / dailyGoalMin), so a laptop that never ran the
 * flow asks the server once and then paints the phone's countdown. That read
 * is deliberately here and not in the page's data layer: the dashboard render
 * is held to three queries (lib/dashboard/queryBudget.test.ts) and this would
 * be a fourth on every paint, to fill something that only needs filling once
 * per device. A student who genuinely answered nothing sees no chips, exactly
 * as before.
 */

// The values change only via onboarding (another page) and the mirror fill
// below, which re-renders through its own state. Stable no-op subscribe keeps
// the store contract.
const subscribeNever = () => () => {};

function useExamDate(): string | null {
  return useSyncExternalStore(subscribeNever, readExamDate, () => null);
}

function useDailyGoalMin(): number | null {
  return useSyncExternalStore(subscribeNever, readDailyGoalMin, () => null);
}

/**
 * ONE server read per browser session, and only when this device knows
 * nothing. A student who has genuinely never onboarded has a mirror that stays
 * cold forever, so without this flag they would pay a query on every dashboard
 * mount to be told "nothing" again. The flag lives outside the component
 * because that is the scope it has to survive: this component remounts on
 * every navigation back to the dashboard.
 */
let askedThisSession = false;

/**
 * The state bump is what makes the chips appear: React re-reads every
 * useSyncExternalStore snapshot on re-render, so filling the mirror and then
 * setting state is enough — no subscription needed for a value that changes
 * once.
 */
function useMirrorFill(): void {
  const [, setFilled] = useState(0);

  useEffect(() => {
    if (askedThisSession || !isMirrorCold()) return;
    askedThisSession = true;
    let alive = true;
    readOnboardingAction()
      .then((snapshot) => {
        if (!alive) return;
        fillMirrorFromServer(snapshot);
        setFilled((n) => n + 1);
      })
      // Silent: a missing countdown chip is not worth an error to a student.
      .catch(() => {
        // Nothing was written, so let a later navigation try again.
        askedThisSession = false;
      });
    return () => {
      alive = false;
    };
  }, []);
}

/** Whole days from today (local midnight) to the exam date; null = no date. */
function daysUntil(raw: string | null): number | null {
  if (!raw || raw === NO_EXAM_DATE) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const exam = new Date(y, m - 1, d).getTime(); // local midnight of exam day
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((exam - today.getTime()) / 86_400_000);
  return days >= 0 ? days : null; // a past date renders nothing
}

export function ExamCountdown() {
  useMirrorFill();
  const daysLeft = daysUntil(useExamDate());
  const goalMin = useDailyGoalMin();

  if (daysLeft === null && goalMin === null) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {daysLeft !== null ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent">
          <span aria-hidden>🗓</span>
          {daysLeft === 0
            ? "Изпитът е днес — успех!"
            : daysLeft === 1
              ? "1 ден до изпита"
              : `${daysLeft} дни до изпита`}
        </span>
      ) : null}
      {goalMin !== null ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
          Дневна цел:{" "}
          <span className="font-mono font-bold tabular-nums text-foreground">
            {goalMin} мин
          </span>
        </span>
      ) : null}
    </div>
  );
}
