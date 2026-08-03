/**
 * Onboarding preferences — the LOCAL MIRROR of User.examDate /
 * User.dailyGoalMin / User.onboardedAt.
 *
 * THESE KEYS ARE NO LONGER THE SOURCE OF TRUTH. They were, and it cost the
 * product its best retention signal: the answers lived in one browser, so a
 * student who registered on a phone and opened the site on a laptop lost their
 * exam date — and the server never had it at all, which meant „изпитът ти е
 * след 6 дни" could not be sent to anyone. The row is now authoritative
 * (./store.ts, ./service.ts); this file is what makes the countdown paint
 * instantly and keep working offline.
 *
 * What the mirror is still for:
 *  - a synchronous read during render, so the dashboard chips need no query
 *    and no round trip (useSyncExternalStore in ExamCountdown);
 *  - the anonymous case: /onboarding sits outside the auth matcher on purpose,
 *    so someone who wanders in before signing in still gets a coherent flow.
 * When the two disagree, the SERVER wins — see fillMirrorFromServer().
 *
 * All reads/writes are guarded: localStorage can throw (Safari private mode,
 * storage quota) and is absent during SSR.
 */

export const EXAM_DATE_KEY = "knizhka.v1.examDate"; // "YYYY-MM-DD" | "none"
export const DAILY_GOAL_KEY = "knizhka.v1.dailyGoalMin"; // "10" | "20" | "30"
export const ONBOARDING_DONE_KEY = "knizhka.v1.onboardingCompletedAt"; // ISO timestamp

export type DailyGoalMinutes = 10 | 20 | 30;

/** "Още нямам дата" sentinel — distinguishes "answered: no date" from "never asked". */
export const NO_EXAM_DATE = "none";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Non-fatal: the flow still completes, we just can't persist.
  }
}

/** ISO exam date ("YYYY-MM-DD"), NO_EXAM_DATE, or null if never answered. */
export function readExamDate(): string | null {
  const raw = safeGet(EXAM_DATE_KEY);
  if (!raw) return null;
  if (raw === NO_EXAM_DATE || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

export function writeExamDate(value: string): void {
  safeSet(EXAM_DATE_KEY, value);
}

export function readDailyGoalMin(): DailyGoalMinutes | null {
  const raw = safeGet(DAILY_GOAL_KEY);
  if (raw === "10" || raw === "20" || raw === "30") {
    return Number(raw) as DailyGoalMinutes;
  }
  return null;
}

export function writeDailyGoalMin(minutes: DailyGoalMinutes): void {
  safeSet(DAILY_GOAL_KEY, String(minutes));
}

export function isOnboardingDone(): boolean {
  return safeGet(ONBOARDING_DONE_KEY) !== null;
}

export function markOnboardingDone(): void {
  safeSet(ONBOARDING_DONE_KEY, new Date().toISOString());
}

/** Is this device's mirror cold — i.e. has it never seen the answers? */
export function isMirrorCold(): boolean {
  return readExamDate() === null && readDailyGoalMin() === null;
}

/**
 * Copy the server's answers down onto this device.
 *
 * This is the whole cross-device fix, made visible: the laptop that never ran
 * the flow gets the phone's exam date the first time it opens the dashboard,
 * and from then on the countdown paints synchronously with no query. Only ever
 * called with values the server just returned, so it cannot be used to
 * resurrect a stale local answer over a newer one.
 */
export function fillMirrorFromServer(snapshot: {
  examDate: string | null;
  dailyGoalMin: number | null;
  onboarded: boolean;
}): void {
  if (snapshot.examDate !== null) writeExamDate(snapshot.examDate);
  if (
    snapshot.dailyGoalMin === 10 ||
    snapshot.dailyGoalMin === 20 ||
    snapshot.dailyGoalMin === 30
  ) {
    writeDailyGoalMin(snapshot.dailyGoalMin);
  }
  if (snapshot.onboarded && !isOnboardingDone()) markOnboardingDone();
}
