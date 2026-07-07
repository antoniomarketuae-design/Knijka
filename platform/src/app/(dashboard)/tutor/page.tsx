import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "AI Учител · Книжка.AI" };

export default function TutorComingSoonPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="card p-10">
        <p className="text-4xl" aria-hidden>
          🤖
        </p>
        <h1 className="mt-4 text-2xl font-bold">AI Учител — скоро</h1>
        <p className="mt-3 text-sm opacity-80">
          Личният ти AI инструктор идва съвсем скоро: ще можеш да го питаш
          „Защо това е грешно?“ и „Покажи ми закона“ — и той ще отговаря с
          цитат от правилника.
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
