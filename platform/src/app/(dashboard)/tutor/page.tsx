import type { Metadata } from "next";
import Link from "next/link";
import { TutorChat } from "@/components/tutor/TutorChat";
import { requireUser } from "@/modules/auth";
import { getThread, isTutorEnabled } from "@/modules/tutor";

export const metadata: Metadata = {
  title: "AI Учител · Книжка.AI",
  description:
    "Личният ти AI инструктор: питай за правило, знак или ситуация — отговаря с цитат от закона.",
};

/**
 * AI tutor page. Server component: without an API key it renders a clean
 * "activating soon" state (never a crash); otherwise it loads the user's
 * thread and hands off to the chat client component.
 */
export default async function TutorPage() {
  const user = await requireUser();

  if (!isTutorEnabled()) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="card p-10">
          <p className="text-4xl" aria-hidden>
            🤖
          </p>
          <h1 className="mt-4 text-2xl font-bold">
            AI Учителят се активира скоро
          </h1>
          <p className="mt-3 text-sm opacity-80">
            Съвсем скоро ще можеш да го питаш „Защо това е грешно?“ и „Покажи
            ми закона“ — и той ще отговаря с цитат от правилника.
          </p>
          <p className="mt-2 text-sm opacity-80">
            Дотогава: всяко упражнение вече ти обяснява грешките с точния член
            от закона.
          </p>
          <div className="mt-6 flex justify-center gap-3">
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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-black sm:text-3xl">AI Учител</h1>
        <p className="mt-1 text-sm text-muted">
          Питай за правило, знак или ситуация — Учителят отговаря само по
          учебната програма и винаги цитира закона.
        </p>
      </header>

      <TutorChat
        initialMessages={thread.messages.map(({ role, content, ts }) => ({
          role,
          content,
          ts,
        }))}
      />
    </div>
  );
}
