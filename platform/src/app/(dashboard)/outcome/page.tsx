import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth";
import {
  EXAM_KIND_LABELS_BG,
  formatExamDay,
  listMyOutcomes,
} from "@/modules/outcomes";
import { OutcomeClient, type OutcomeView } from "./outcome-client";

export const metadata: Metadata = {
  title: "Как мина изпитът? · Книжка.AI",
  description:
    "Кажи ни как мина истинският изпит в ДАИ — за да проверим дали прогнозата ни за готовност е вярна.",
  // The page reflects a personal report; it has no business in a search index.
  robots: { index: false, follow: false },
};

// The list is per-user and changes on every submit — never prerender.
export const dynamic = "force-dynamic";

/** Exam day → "20 юли 2026". UTC, because examOn is a DATE at UTC midnight. */
const DAY_FORMAT = new Intl.DateTimeFormat("bg-BG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * /outcome — the capture side of the transfer loop (audit M-4 / I-5).
 *
 * The north star is "safer, more competent real drivers", and nothing in the
 * product could measure it: the app has never known whether a single student
 * passed the real ДАИ exam. This page is where that changes — one voluntary
 * report, paired with the readiness score we had been showing them.
 *
 * It is written to be worth filling in for the STUDENT, not just for us: the
 * copy says plainly what we do with it, that a failed exam is the more useful
 * answer, and that they can delete it. Nothing here is required, nothing is
 * gated behind it, and no reward is attached — a paid-for outcome report is a
 * biased outcome report.
 */
export default async function OutcomePage() {
  const user = await requireUser();
  const outcomes = await listMyOutcomes(user.id);

  const views: OutcomeView[] = outcomes.map((o) => ({
    id: o.id,
    kindLabelBg: EXAM_KIND_LABELS_BG[o.kind],
    passed: o.passed,
    examOnLabelBg: DAY_FORMAT.format(o.examOn),
    readinessScore: o.readinessScore,
    mockAttempts: o.mockAttempts,
    bestMockScore: o.bestMockScore,
  }));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header>
        <span className="hud-label">Истинският изпит · ДАИ</span>
        <h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">
          Как мина изпитът?
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Приложението ти дава оценка за готовност. Единственият начин да
          разберем дали тази оценка струва нещо е да ни кажеш какво се случи на
          истинския изпит. Отнема 15 секунди, доброволно е и можеш да го
          изтриеш по всяко време.
        </p>
      </header>

      <OutcomeClient outcomes={views} todayIso={formatExamDay(new Date())} />

      <p className="text-xs leading-relaxed text-muted">
        Какво правим с това: сравняваме реалните резултати с прогнозите си и
        калибрираме модела за готовност (docs/education/28). Никога не
        публикуваме и не продаваме отделни резултати. Повече в{" "}
        <Link
          href="/privacy"
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          политиката за поверителност
        </Link>
        .
      </p>
    </div>
  );
}
