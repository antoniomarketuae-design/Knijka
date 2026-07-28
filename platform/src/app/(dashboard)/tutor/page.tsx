import type { Metadata } from "next";
import Link from "next/link";
import { TutorChat } from "@/components/tutor/TutorChat";
import { requireUser } from "@/modules/auth";
import { getThread, isTutorEnabled } from "@/modules/tutor";
import { TutorPaywall, TutorTrialNotice } from "./paywall";
import { getTutorAccess } from "./trial";

export const metadata: Metadata = {
  title: "AI Учител · Книжка.AI",
  description:
    "Личният ти AI инструктор: питай за правило, знак или ситуация — отговаря с цитат от закона.",
};

/**
 * AI tutor page. Server component: without an API key it renders a clean
 * "activating soon" state (never a crash); otherwise it loads the user's
 * thread and hands off to the chat client component.
 *
 * C-3: full tutor access is what both packs sell, so a free account gets a
 * lifetime trial — the countdown above the chat while it lasts, the paywall
 * screen once it is spent. The trial is counted from the persisted thread
 * (trial.ts) and re-checked inside askTutorAction, so the chat that is already
 * open on screen cannot outlive the allowance.
 */
export default async function TutorPage() {
  const user = await requireUser();

  if (!isTutorEnabled()) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        {/* A dormant channel on the panel, rather than an empty content box:
            framing corners, the status named in the mono caption voice, and a
            graticule under the title so the card has a face. */}
        <div className="card framed p-8 sm:p-10">
          <p className="hud-label">Канал · AI Учител</p>
          <p className="mt-4 text-4xl" aria-hidden>
            🤖
          </p>
          <h1 className="mt-4 font-display text-2xl font-black">
            AI Учителят се активира скоро
          </h1>
          <div aria-hidden className="graticule mx-auto mt-4 w-40" />
          <p className="mt-4 text-sm text-muted">
            Съвсем скоро ще можеш да го питаш „Защо това е грешно?“ и „Покажи
            ми закона“ — и той ще отговаря с цитат от правилника.
          </p>
          <p className="mt-2 text-sm text-muted">
            Дотогава: всяко упражнение вече ти обяснява грешките с точния член
            от закона.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/theory" className="btn-accent">
              Към упражненията
            </Link>
            <Link href="/dashboard" className="btn-ghost">
              Начало
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const thread = await getThread(user.id);
  const trial = await getTutorAccess(user, thread.messages);
  if (!trial.allowed) return <TutorPaywall />;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-black sm:text-3xl">AI Учител</h1>
        <p className="mt-1 text-sm text-muted">
          Питай за правило, знак или ситуация — Учителят отговаря само по
          учебната програма и винаги цитира закона.
        </p>
      </header>

      {trial.unlimited ? null : <TutorTrialNotice remaining={trial.remaining} />}

      {/* `citations` comes along deliberately: it is the server-validated
          allow-list the chat renders law chips from (ADR-002), so dropping it
          here would silently demote every verified citation in the student's
          history to plain text on reload. */}
      <TutorChat
        initialMessages={thread.messages.map(
          ({ role, content, ts, citations }) => ({
            role,
            content,
            ts,
            citations,
          }),
        )}
      />
    </div>
  );
}
