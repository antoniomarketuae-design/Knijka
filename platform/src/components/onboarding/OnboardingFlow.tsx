"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconArrowRight,
  IconBook,
  IconBot,
  IconClipboardCheck,
  IconWheel,
} from "@/components/icons";
import {
  NO_EXAM_DATE,
  isOnboardingDone,
  markOnboardingDone,
  writeDailyGoalMin,
  writeExamDate,
  type DailyGoalMinutes,
} from "./storage";

const TOTAL_STEPS = 3;

const GOALS: { minutes: DailyGoalMinutes; labelBg: string; hintBg: string }[] = [
  { minutes: 10, labelBg: "10 минути", hintBg: "Леко темпо — колкото една почивка" },
  { minutes: 20, labelBg: "20 минути", hintBg: "Стабилно темпо — препоръчваме го" },
  { minutes: 30, labelBg: "30 минути", hintBg: "Пълна газ — най-бърз напредък" },
];

const TOUR_ITEMS = [
  {
    icon: IconBook,
    titleBg: "Теория",
    textBg: "16 теми, адаптивни упражнения — учиш точно това, което ти куца.",
  },
  {
    icon: IconClipboardCheck,
    titleBg: "Изпити",
    textBg: "Пробни изпити 1:1 с официалния формат: 45 въпроса, 40 минути.",
  },
  {
    icon: IconWheel,
    titleBg: "Симулатор",
    textBg: "Кокпит шофиране в браузъра — уроци по реални улици с инструктор.",
  },
  {
    icon: IconBot,
    titleBg: "AI Учител",
    textBg: "Питай „защо това е грешно?“ — отговаря с цитат от закона.",
  },
] as const;

function localTodayISO(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <span className="visually-hidden">
        Стъпка {step + 1} от {TOTAL_STEPS}
      </span>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2.5 rounded-full transition-all motion-reduce:transition-none ${
            i === step
              ? "w-7 bg-accent shadow-glow-sm"
              : i < step
                ? "w-2.5 bg-accent/60"
                : "w-2.5 bg-border-strong"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Post-registration onboarding: 3 quick questions, shown once (localStorage
 * flag), always skippable. Choices land in versioned localStorage keys — see
 * ./storage.ts for the v1-vs-server-side story.
 */
export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [examDate, setExamDate] = useState("");
  const [goal, setGoal] = useState<DailyGoalMinutes | null>(null);

  // Shown once: returning visitors go straight to the dashboard.
  useEffect(() => {
    if (isOnboardingDone()) router.replace("/dashboard");
  }, [router]);

  function finish() {
    markOnboardingDone();
    router.push("/dashboard");
  }

  function submitExamDate(value: string) {
    writeExamDate(value);
    setStep(1);
  }

  function submitGoal(minutes: DailyGoalMinutes) {
    setGoal(minutes);
    writeDailyGoalMin(minutes);
    setStep(2);
  }

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Landing-hero glow, same token */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[26rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(closest-side, var(--glow) 0%, transparent 100%)",
        }}
      />

      <div className="relative w-full max-w-lg">
        {/* Brand + skip */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg text-lg font-extrabold tracking-tight"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
            >
              К
            </span>
            <span>
              Книжка<span className="text-accent">.AI</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={finish}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
          >
            Пропусни
          </button>
        </div>

        <div className="card p-6 shadow-glow-sm sm:p-8">
          {step === 0 && (
            <section aria-labelledby="ob-step-1">
              <h1 id="ob-step-1" className="text-2xl font-black">
                Кога ти е изпитът?
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Ще подредим подготовката ти според датата — и ще ти показваме
                колко дни остават.
              </p>
              <label
                htmlFor="exam-date"
                className="mt-6 block text-sm font-semibold"
              >
                Дата на изпита
              </label>
              <input
                id="exam-date"
                type="date"
                min={localTodayISO()}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-base text-foreground outline-none transition focus:border-accent motion-reduce:transition-none"
              />
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!examDate}
                  onClick={() => submitExamDate(examDate)}
                  className="btn-accent w-full text-base disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Продължи
                  <IconArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => submitExamDate(NO_EXAM_DATE)}
                  className="btn-ghost w-full text-base"
                >
                  Още нямам дата
                </button>
              </div>
            </section>
          )}

          {step === 1 && (
            <section aria-labelledby="ob-step-2">
              <h1 id="ob-step-2" className="text-2xl font-black">
                Колко време на ден?
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Малко всеки ден бие много наведнъж. Избери дневната си цел —
                можеш да я смениш по всяко време.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                {GOALS.map(({ minutes, labelBg, hintBg }) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => submitGoal(minutes)}
                    aria-pressed={goal === minutes}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-5 py-4 text-left transition hover:border-accent hover:shadow-glow-sm motion-reduce:transition-none ${
                      goal === minutes
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface-2"
                    }`}
                  >
                    <span>
                      <span className="block text-base font-extrabold">
                        {labelBg}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {hintBg}
                      </span>
                    </span>
                    <IconArrowRight className="h-4 w-4 shrink-0 text-accent" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 2 && (
            <section aria-labelledby="ob-step-3">
              <h1 id="ob-step-3" className="text-2xl font-black">
                Всичко на едно място
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Четири неща ще те заведат до книжката:
              </p>
              <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {TOUR_ITEMS.map(({ icon: Icon, titleBg, textBg }) => (
                  <li
                    key={titleBg}
                    className="rounded-xl border border-border bg-surface-2 p-4"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h2 className="mt-2 text-sm font-extrabold">{titleBg}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {textBg}
                    </p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={finish}
                className="btn-accent mt-6 w-full text-base"
              >
                Започни първия урок
                <IconArrowRight className="h-4 w-4" />
              </button>
            </section>
          )}
        </div>

        {/* Dots + back */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <ProgressDots step={step} />
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="text-xs font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
            >
              ← Назад
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
