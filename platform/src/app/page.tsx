import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import {
  IconArrowRight,
  IconBook,
  IconBot,
  IconClipboardCheck,
  IconShield,
  IconWheel,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Книжка.AI — вземи книжка с AI учител до теб",
  description:
    "AI академия за шофьорски изпит в България: адаптивна теория, пробни изпити 1:1 с официалния формат и AI учител, който отговаря с цитат от закона.",
};

function buildFeatures(questionsLabel: string) {
  return [
    {
      icon: IconBot,
      titleBg: "AI учител",
      textBg:
        "Питай „защо това е грешно?“ по всяко време. Учителят отговаря на български и цитира конкретния член от закона — никога не си измисля.",
    },
    {
      icon: IconClipboardCheck,
      titleBg: "Пробни изпити 1:1 с официалния формат",
      textBg: `45 въпроса, 97 точки, 40 минути, праг 87 — същият формат като на официалния изпит, черпени от ${questionsLabel} оригинални въпроса.`,
    },
    {
      icon: IconWheel,
      titleBg: "Симулатор",
      textBg:
        "Кокпит шофиране в браузъра по улици с българска пътна обстановка — в разработка, идва след теорията.",
      soon: true,
    },
  ] as const;
}

const LEGAL_LINKS = [
  { href: "/terms", labelBg: "Условия за ползване" },
  { href: "/privacy", labelBg: "Поверителност" },
  { href: "/cookies", labelBg: "Бисквитки" },
  { href: "/contact", labelBg: "Контакт" },
];

/** Public landing page. Counts are read from the content library at build so
 *  the marketing numbers are always true and grow with the bank. */
export default function LandingPage() {
  const repo = getContentRepo();
  const topicCount = repo.topics().length;
  const questionCount = repo.questions().length;
  // Round down to the nearest 100 for an honest, punchy "1000+" claim.
  const questionsRounded = Math.floor(questionCount / 100) * 100;
  const questionsLabel =
    questionsRounded >= 100 ? `над ${questionsRounded}` : `${questionCount}`;
  const features = buildFeatures(questionsLabel);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <p className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
            >
              К
            </span>
            Книжка<span className="text-accent">.AI</span>
          </p>
          <nav aria-label="Вход и регистрация" className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
            >
              Вход
            </Link>
            <Link href="/register" className="btn-accent px-4 py-2">
              Регистрация
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[44rem] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-70"
            style={{
              background:
                "radial-gradient(closest-side, var(--glow) 0%, transparent 100%)",
            }}
          />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
            <p className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-accent">
              За кандидат-шофьори в България
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Вземи книжка.
              <br />
              С <span className="text-accent">AI учител</span> до теб.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              Учи теорията като игра: адаптивни упражнения, серии и нива,
              пробни изпити в официалния формат и учител, който обяснява всяка
              грешка с цитат от закона.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/register" className="btn-accent px-7 py-3.5 text-base">
                Започни безплатно
                <IconArrowRight className="h-4 w-4" />
              </Link>
              <a href="#features" className="btn-ghost px-7 py-3.5 text-base">
                Виж как работи
              </a>
            </div>
            <p className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-muted">
              <span className="flex items-center gap-1.5">
                <IconClipboardCheck className="h-4 w-4 text-accent" />
                Формат 45 въпроса · 97 точки · 40 мин
              </span>
              <span className="flex items-center gap-1.5">
                <IconBook className="h-4 w-4 text-accent" />
                {questionsLabel} въпроса · {topicCount} теми
              </span>
              <span className="flex items-center gap-1.5">
                <IconShield className="h-4 w-4 text-accent" />
                Отговори с цитат от закона
              </span>
            </p>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          aria-labelledby="features-title"
          className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 pb-20 sm:px-6"
        >
          <h2 id="features-title" className="text-center text-2xl font-black sm:text-3xl">
            Как ще стигнеш до изпита готов
          </h2>
          <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, titleBg, textBg, ...f }) => (
              <li
                key={titleBg}
                className="card flex flex-col gap-3 p-6 transition hover:border-border-strong hover:shadow-glow-sm motion-reduce:transition-none"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <Icon className="h-6 w-6" />
                  </span>
                  {"soon" in f && f.soon ? (
                    <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                      Скоро
                    </span>
                  ) : null}
                </div>
                <h3 className="text-lg font-extrabold">{titleBg}</h3>
                <p className="text-sm leading-relaxed text-muted">{textBg}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section aria-labelledby="cta-title" className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <div className="card relative overflow-hidden p-8 text-center sm:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-60"
              style={{
                background:
                  "radial-gradient(closest-side, var(--glow) 0%, transparent 100%)",
              }}
            />
            <h2 id="cta-title" className="relative text-2xl font-black sm:text-3xl">
              Готов ли си за първия урок?
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Създай акаунт за минута и виж къде си — първите уроци и пробен
              тест са безплатни.
            </p>
            <div className="relative mt-6">
              <Link href="/register" className="btn-accent px-7 py-3.5 text-base">
                Създай акаунт
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted">
            © 2026 Книжка.AI · Подготовка за теоретичния изпит, категория B ·
            България
          </p>
          <nav aria-label="Правна информация">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {LEGAL_LINKS.map(({ href, labelBg }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-xs font-semibold text-muted transition hover:text-foreground motion-reduce:transition-none"
                  >
                    {labelBg}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
