"use client";

import { useSyncExternalStore } from "react";
import {
  NO_EXAM_DATE,
  readDailyGoalMin,
  readExamDate,
} from "@/components/onboarding/storage";

/**
 * Makes the onboarding promise true: „ще ти показваме колко дни остават".
 * Reads the v1 localStorage answers (exam date + daily goal) and renders small
 * HUD chips in the dashboard header. Client-only by nature (localStorage) —
 * useSyncExternalStore serves `null` during SSR/hydration and the real value
 * after, with no mismatch. Users who skipped onboarding simply see no chips.
 * Server-side columns are the documented post-launch path (storage.ts /
 * doc 54 §10).
 */

// The values change only via onboarding (another page), so no subscription —
// a mount-time read is enough. Stable no-op keeps the store contract.
const subscribeNever = () => () => {};

function useExamDate(): string | null {
  return useSyncExternalStore(subscribeNever, readExamDate, () => null);
}

function useDailyGoalMin(): number | null {
  return useSyncExternalStore(subscribeNever, readDailyGoalMin, () => null);
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
