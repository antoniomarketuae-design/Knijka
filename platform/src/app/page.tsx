import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { Gauge } from "@/components/hud/Gauge";
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

/** Four L-shaped HUD framing corners for an instrument panel. Decorative. */
function HudCorners() {
  const base = "pointer-events-none absolute h-3.5 w-3.5 border-accent-2/60";
  return (
    <>
      <span aria-hidden className={`${base} left-2.5 top-2.5 border-l border-t`} />
      <span aria-hidden className={`${base} right-2.5 top-2.5 border-r border-t`} />
      <span aria-hidden className={`${base} bottom-2.5 left-2.5 border-b border-l`} />
      <span aria-hidden className={`${base} bottom-2.5 right-2.5 border-b border-r`} />
    </>
  );
}

/** Pulsing telemetry status dot — pure opacity animation, reduced-motion safe. */
function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`relative flex h-2 w-2 ${className}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-2 opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-2" />
    </span>
  );
}

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

  const telemetry = [
    {
      icon: IconClipboardCheck,
      label: "Формат",
      value: "45 · 97 · 40",
      sub: "въпроса · точки · мин",
    },
    {
      icon: IconBook,
      label: "Банка",
      value: questionsLabel,
      sub: `въпроса · ${topicCount} теми`,
    },
    {
      icon: IconShield,
      label: "Източник",
      value: "Закон",
      sub: "отговори с цитат",
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header — glass HUD topbar */}
      <header className="sticky top-0 z-50 border-b border-hair bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <p className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-black text-accent-foreground shadow-glow-sm"
            >
              К
            </span>
            Книжка<span className="text-accent">.AI</span>
          </p>

          <span className="hidden items-center gap-2 md:flex">
            <LiveDot />
            <span className="hud-label">Система · Онлайн</span>
          </span>

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
        {/* Hero — the cockpit boot-up: grid + mesh glow + grain + one scanline */}
        <section className="grain relative overflow-hidden border-b border-hair">
          {/* Instrument-cluster grid, faded toward the edges */}
          <div
            aria-hidden
            className="hud-grid pointer-events-none absolute inset-0 opacity-70"
            style={{
              maskImage:
                "radial-gradient(78% 68% at 50% 38%, #000 0%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(78% 68% at 50% 38%, #000 0%, transparent 100%)",
            }}
          />
          {/* Soft radial HUD projection glow (blue + cyan mesh) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(42rem 30rem at 18% 12%, var(--glow) 0%, transparent 62%), radial-gradient(34rem 30rem at 88% 26%, var(--glow-2) 0%, transparent 60%), radial-gradient(52rem 42rem at 50% 108%, var(--glow-soft) 0%, transparent 72%)",
            }}
          />
          {/* One-shot boot-up scanline */}
          <div
            className="hud-sweep pointer-events-none absolute inset-x-0 top-0 h-px bg-accent-2"
            aria-hidden
          />

          <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
            {/* Left: the thesis */}
            <div className="text-center lg:text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-hair bg-surface/50 px-3.5 py-1.5 backdrop-blur-sm">
                <LiveDot />
                <span className="hud-label !text-accent">
                  За кандидат-шофьори в България
                </span>
              </p>

              <h1 className="mt-6 text-balance font-display text-5xl font-black leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
                Вземи книжка.{" "}
                <br className="hidden lg:inline" />
                С{" "}
                <span
                  className="text-accent"
                  style={{ textShadow: "0 0 32px var(--glow)" }}
                >
                  AI учител
                </span>{" "}
                до теб.
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg lg:mx-0">
                Учи теорията като игра: адаптивни упражнения, серии и нива,
                пробни изпити в официалния формат и учител, който обяснява всяка
                грешка с цитат от закона.
              </p>

              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link href="/register" className="btn-accent px-7 py-3.5 text-base">
                  Започни безплатно
                  <IconArrowRight className="h-4 w-4" />
                </Link>
                <a href="#features" className="btn-ghost px-7 py-3.5 text-base">
                  Виж как работи
                </a>
              </div>

              {/* Trust row — telemetry readouts */}
              <dl className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {telemetry.map(({ icon: Icon, label, value, sub }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-hair bg-surface/40 px-3.5 py-3 text-left backdrop-blur-sm"
                  >
                    <dt className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-accent-2" />
                      <span className="hud-label">{label}</span>
                    </dt>
                    <dd className="mt-1.5">
                      <span className="font-mono text-base font-bold tabular-nums text-foreground">
                        {value}
                      </span>
                      <span className="mt-0.5 block font-mono text-[0.68rem] text-muted">
                        {sub}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Right: the exam-target instrument cluster */}
            <div className="flex justify-center lg:justify-end">
              <div className="hud-panel relative w-full max-w-sm overflow-hidden p-6 sm:p-7">
                <HudCorners />
                {/* faint grid inside the instrument */}
                <div
                  aria-hidden
                  className="hud-grid pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    maskImage:
                      "radial-gradient(65% 60% at 50% 45%, #000 0%, transparent 100%)",
                    WebkitMaskImage:
                      "radial-gradient(65% 60% at 50% 45%, #000 0%, transparent 100%)",
                  }}
                />

                <div className="relative flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <LiveDot />
                    <span className="hud-label">Теоретичен изпит · кат. B</span>
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums text-accent-2">
                    40:00
                  </span>
                </div>

                <div className="relative mt-5 flex flex-col items-center">
                  <Gauge
                    value={87}
                    max={97}
                    unit="точки"
                    label="Праг за успех"
                    size={210}
                    tone="cyan"
                    ariaLabel="Праг за успех на теоретичния изпит: 87 от 97 точки"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features — three instrument cards */}
        <section
          id="features"
          aria-labelledby="features-title"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6"
        >
          <p className="hud-label text-center !text-accent-2">Системен обзор</p>
          <h2
            id="features-title"
            className="mt-2 text-center font-display text-3xl font-black tracking-tight sm:text-4xl"
          >
            Как ще стигнеш до изпита готов
          </h2>

          <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, titleBg, textBg, ...f }, i) => (
              <li
                key={titleBg}
                className="hud-panel group relative flex flex-col gap-4 p-6 transition hover:-translate-y-1 hover:shadow-glow motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-hair bg-accent/15 text-accent shadow-glow-sm">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="flex items-center gap-2">
                    {"soon" in f && f.soon ? (
                      <span className="rounded-full border border-accent-2/40 bg-accent-2/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-2">
                        Скоро
                      </span>
                    ) : null}
                    <span className="hud-label tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                </div>
                <h3 className="font-display text-lg font-extrabold">{titleBg}</h3>
                <p className="text-sm leading-relaxed text-muted">{textBg}</p>
                <span
                  aria-hidden
                  className="mt-auto block h-px w-full bg-gradient-to-r from-accent-2/50 via-hair to-transparent"
                />
              </li>
            ))}
          </ul>
        </section>

        {/* CTA — glowing HUD panel */}
        <section
          aria-labelledby="cta-title"
          className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6"
        >
          <div className="hud-panel grain relative overflow-hidden p-8 text-center sm:p-14">
            <HudCorners />
            <div
              aria-hidden
              className="hud-grid pointer-events-none absolute inset-0 opacity-40"
              style={{
                maskImage:
                  "radial-gradient(70% 80% at 50% 50%, #000 0%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(70% 80% at 50% 50%, #000 0%, transparent 100%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(30rem 20rem at 50% -10%, var(--glow) 0%, transparent 65%), radial-gradient(24rem 16rem at 100% 110%, var(--glow-2) 0%, transparent 70%)",
              }}
            />

            <p className="relative hud-label !text-accent-2">Старт</p>
            <h2
              id="cta-title"
              className="relative mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl"
            >
              Готов ли си за първия урок?
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Създай акаунт за минута и виж къде си — първите уроци и пробен
              тест са безплатни.
            </p>
            <div className="relative mt-7">
              <Link href="/register" className="btn-accent px-7 py-3.5 text-base">
                Започни безплатно
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-hair">
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
