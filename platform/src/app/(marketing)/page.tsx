import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { EXAM_BANK_SIZE } from "@/modules/sim/lessons";
import {
  EXAM_DURATION_SEC,
  EXAM_MAX_POINTS,
  EXAM_PASS_POINTS,
  EXAM_QUESTION_COUNT,
} from "@/modules/exam/types";
import { LiveHero } from "@/components/marketing";
import { Panel } from "@/components/ui/Panel";
import { Readout } from "@/components/ui/Readout";
import { Reveal } from "@/components/ui/Reveal";
import { IconArrowRight } from "@/components/icons";
import {
  CAPTURED_MISTAKE_COUNT,
  FEATURED_DEBRIEF,
  heroMistake,
  stripMistakes,
} from "@/components/marketing/landing/featuredMistakes";
import { MistakeReel } from "@/components/marketing/landing/MistakeReel";

export const metadata: Metadata = {
  title: "Книжка.AI — караш, грешиш, разбираш защо",
  description:
    "AI академия за шофьорския изпит в България: адаптивна теория, пробни изпити 1:1 с официалния формат, шофьорски симулатор в браузъра и разбор на всяка грешка с цитат от закона.",
};

/**
 * The public landing page.
 *
 * IT IS A JOURNEY THROUGH THREE AUDIENCES, IN ORDER, and the section rhythm
 * is what carries that: the hero belongs to the seventeen-year-old (a live
 * scene and one promise), the proof section shows them the product's actual
 * output, the credibility section switches register entirely for the parent
 * who pays (sober, factual, no motion), and the schools band is a door rather
 * than a pitch. Each block is deliberately a different SHAPE — full-bleed
 * hero, asymmetric split, dense instrument table, quiet band, single line —
 * so the page never reads as a stack of identical cards.
 *
 * Every number on this page is read from the source that owns it (the content
 * repo, the exam constants, the sim bank, the clip manifest) rather than
 * typed, so the marketing copy cannot quietly become false as the product
 * grows. The counts are rounded DOWN for the same reason.
 *
 * WHAT IS DELIBERATELY NOT HERE: pass rates, testimonials, student counts and
 * "trusted by" logos. The product is pre-launch (docs/80) — nobody has sat an
 * exam with it. The credibility section says so in as many words, because a
 * parent who checks and finds the claim honest is worth more than one who
 * finds an invented statistic.
 */

/** Round down to the nearest 100 so a growing bank never overstates itself. */
function roundedDown(value: number, step = 100): number {
  return Math.floor(value / step) * step;
}

export default function LandingPage() {
  const repo = getContentRepo();
  const questionCount = repo.questions().length;
  const topicCount = repo.topics().length;

  const questionsRounded = roundedDown(questionCount);
  const questionsLabel =
    questionsRounded >= 100
      ? `над ${questionsRounded.toLocaleString("bg-BG")}`
      : `${questionCount}`;
  const examVariantsLabel = `над ${roundedDown(EXAM_BANK_SIZE).toLocaleString("bg-BG")}`;
  const examMinutes = Math.round(EXAM_DURATION_SEC / 60);

  const reel = heroMistake();
  const strip = stripMistakes();

  return (
    <>
      {/* ── 1 · HERO ─────────────────────────────────────────────────
          The live 3D lives here and nowhere else. `.enter` (pure CSS, no JS)
          rather than <Reveal> because this content is present at first paint;
          Reveal exists for what arrives on scroll. */}
      <LiveHero>
        {/* The vertical padding is what keeps the telemetry rail below from
            landing on the buttons. LiveHero centres its children inside a
            min-height, so on a 390px phone the stacked headline + subhead +
            two CTAs are taller than that min-height and the copy runs to the
            section's edge — where the rail's -mt-8 then sits on top of it. */}
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <p className="enter hud-label !text-accent-2" style={{ ["--enter-i" as string]: 0 }}>
              За кандидат-шофьори в България
            </p>

            <h1
              className="enter mt-4 text-balance font-display text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
              style={{ ["--enter-i" as string]: 1 }}
            >
              Караш. Грешиш.{" "}
              <span className="text-accent" style={{ textShadow: "0 0 36px var(--glow)" }}>
                Разбираш защо.
              </span>
            </h1>

            <p
              className="enter mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
              style={{ ["--enter-i" as string]: 2 }}
            >
              Теория, пробни изпити в официалния формат и шофьорски симулатор
              направо в браузъра. За всяка грешка получаваш разбор и члена от
              закона — не само червено „грешен отговор“.
            </p>

            <div
              className="enter mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
              style={{ ["--enter-i" as string]: 3 }}
            >
              {/* Full width while stacked, intrinsic once side by side: two
                  buttons of different widths in a vertical stack read as a
                  primary and an afterthought, which is not the relationship. */}
              <Link
                href="/register"
                className="btn-accent w-full px-7 py-3.5 text-base sm:w-auto"
              >
                Започни безплатно
                <IconArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#razbor"
                className="btn-ghost w-full px-7 py-3.5 text-base sm:w-auto"
              >
                Виж един разбор
              </a>
            </div>
          </div>
        </div>
      </LiveHero>

      {/* ── The telemetry rail ───────────────────────────────────────
          Four facts on ONE hairline strip rather than four cards. The strip
          is the join between the hero and the page: it belongs to neither,
          which is exactly why the hero stops feeling like a pasted banner. */}
      {/* `relative z-10` is load-bearing, not decoration. LiveHero's root sets
          `isolate`, which makes the whole hero a stacking context; a statically
          positioned block cannot paint above one, so without this the hero's
          bottom edge sliced the top off every label in the rail. */}
      <section
        aria-label="Накратко"
        className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6"
      >
        <Panel tone="solid" className="-mt-8 grid grid-cols-2 gap-y-7 px-5 py-6 sm:px-7 lg:grid-cols-4">
          <Readout
            label="Формат"
            value={`${EXAM_QUESTION_COUNT} · ${EXAM_MAX_POINTS} · ${examMinutes}`}
            sub="въпроса · точки · минути"
            size="sm"
          />
          <Readout
            label="Банка"
            value={questionsLabel}
            sub={`въпроса · ${topicCount} теми`}
            size="sm"
          />
          <Readout
            label="Симулатор"
            value={examVariantsLabel}
            sub="изпитни варианта"
            size="sm"
          />
          <Readout
            label="Източник"
            value="Законът"
            sub="всеки отговор с член"
            size="sm"
            tone="cyan"
          />
        </Panel>
      </section>

      {/* ── 2 · PROOF ────────────────────────────────────────────────
          Asymmetric on purpose: the picture is the argument, so it takes the
          larger column and the words sit beside it as a caption would. */}
      <section
        id="razbor"
        aria-labelledby="razbor-title"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6 sm:py-28"
      >
        <Reveal>
          <p className="hud-label !text-accent-2">Разбор</p>
          <h2
            id="razbor-title"
            className="mt-3 max-w-3xl text-balance font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl"
          >
            Показваме ти грешката. Не просто ти казваме, че си сгрешил.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            Ето един истински запис от нашия двигател и разборът, който върви с
            него — дума по дума така, както го получаваш и ти.
          </p>
        </Reveal>

        {reel === null ? null : (
          <Reveal delay={70} className="mt-12 grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-10">
            <MistakeReel mistake={reel} />

            <div className="flex flex-col justify-center">
              {/* The severity chip is the product's own grading vocabulary, not
                  a marketing badge: опасна = 10 points = instant fail, which is
                  the official rubric (modules/sim/rules/scoring.ts). */}
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] text-danger">
                  Опасна · 10 точки
                </span>
                <span className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted">
                  прекратява изпита
                </span>
              </p>

              <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
                {FEATURED_DEBRIEF.titleBg}
              </h3>

              <p className="mt-4 text-base leading-relaxed text-muted">
                {FEATURED_DEBRIEF.whatWentWrongBg}
              </p>

              <p className="mt-6 flex items-center gap-2.5 border-t border-border pt-5">
                <span className="hud-label">Основание</span>
                <span className="font-mono text-sm font-bold text-accent-2">
                  {FEATURED_DEBRIEF.lawRef}
                </span>
              </p>
            </div>
          </Reveal>
        )}

        {/* The filmstrip — evidence of breadth, at 17 KB a frame. It is a list
            of real captures, so it is marked up as one. */}
        {strip.length === 0 ? null : (
          <Reveal delay={140} className="mt-14">
            <p className="text-sm text-muted">
              Записите не са само за пешеходната пътека — засега са{" "}
              <span className="font-mono font-bold text-foreground">
                {CAPTURED_MISTAKE_COUNT}
              </span>{" "}
              разбора на конкретни грешки, от спирането на „STOP“ до скоростта в
              дъжда.
            </p>
            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {strip.map((mistake) => (
                <li key={mistake.id}>
                  <figure className="flex h-full flex-col gap-2">
                    {/* <img loading="lazy"> and NOT a background-image here,
                        which is the opposite of the reel's choice — measured,
                        not assumed. Chrome does not defer background-images
                        for off-screen elements, so as backgrounds these six
                        stills (~102 KB) were fetched on load by every phone
                        that never scrolled this far. Native lazy loading is
                        the only thing that actually stops that, and down here
                        the trade is worth it: a missing file degrades to alt
                        text, which is what alt is for.

                        Plain <img> and not next/image, matching how the clip
                        gallery and QuestionMedia already read these: the rig
                        writes them pre-sized at 854×480 WebP (~17 KB), which
                        is already the slot's size, so the optimizer would
                        re-encode finished assets — and it would 500 on the
                        gitignored files this page is built to survive. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mistake.faultFrame}
                      alt={`Кадър от симулатора: ${mistake.titleBg}`}
                      loading="lazy"
                      decoding="async"
                      width={854}
                      height={480}
                      className="panel-inset block aspect-video w-full bg-surface-2 object-cover"
                    />
                    <figcaption className="text-[0.7rem] leading-snug text-muted">
                      {mistake.titleBg}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </section>

      {/* ── 2b · WHAT YOU GET ────────────────────────────────────────
          A spec sheet, not a card grid: a heading column on the left and four
          hairline-separated rows on the right. Numbered, because it is also
          the order a student meets them in. */}
      <section
        aria-labelledby="what-title"
        className="border-y border-border bg-surface/40"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="hud-label !text-accent-2">Какво получаваш</p>
            <h2
              id="what-title"
              className="mt-3 text-balance font-display text-3xl font-black tracking-tight sm:text-4xl"
            >
              Четири инструмента, един изпит.
            </h2>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              Никой от тях не е демо. Теорията и изпитът работят от първия ден;
              симулаторът иска малко по-сериозен компютър или телефон.
            </p>
          </Reveal>

          <Reveal delay={70}>
            <ol className="flex flex-col">
              {[
                {
                  titleBg: "Умна тренировка",
                  textBg:
                    "Алгоритъмът следи кои понятия ти куцат и вади следващия въпрос точно оттам — не по азбучен ред и не на случаен принцип.",
                },
                {
                  titleBg: "Пробен изпит 1:1",
                  textBg: `${EXAM_QUESTION_COUNT} въпроса, ${EXAM_MAX_POINTS} точки, ${examMinutes} минути, праг ${EXAM_PASS_POINTS}. Същите тежести 1-2-3 като на истинския.`,
                },
                {
                  titleBg: "Симулатор в браузъра",
                  textBg: `Сядаш в кокпита и караш по реална улична мрежа. ${examVariantsLabel} изпитни варианта, оценени по официалната система.`,
                },
                {
                  titleBg: "AI учител",
                  textBg:
                    "Питай „защо?“ по всяко време. Отговаря на български и вади конкретния член — не си измисля закони.",
                },
              ].map(({ titleBg, textBg }, index) => (
                <li
                  key={titleBg}
                  className="flex gap-5 border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span
                    aria-hidden
                    className="mt-1 font-mono text-sm font-bold tabular-nums text-accent-2"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-extrabold tracking-tight">
                      {titleBg}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{textBg}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ── 3 · CREDIBILITY ──────────────────────────────────────────
          The register changes here: this section is addressed to whoever is
          paying, so it is quiet, dense and checkable. No motion, no accent
          fireworks — the argument is that the numbers are the official ones. */}
      <section
        id="za-roditeli"
        aria-labelledby="format-title"
        className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-24 sm:px-6 sm:py-28"
      >
        <Reveal>
          <p className="hud-label">За родителя, който плаща</p>
          <h2
            id="format-title"
            className="mt-3 max-w-3xl text-balance font-display text-3xl font-black tracking-tight sm:text-4xl"
          >
            Форматът е официалният. Проверете го.
          </h2>
        </Reveal>

        <Reveal delay={70} className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div className="flex flex-col gap-8">
            <Panel tone="inset" className="grid grid-cols-2 gap-y-7 px-6 py-7">
              <Readout
                label="Въпроси"
                value={EXAM_QUESTION_COUNT}
                sub="в един изпитен лист"
              />
              <Readout label="Точки" value={EXAM_MAX_POINTS} sub="максимум" />
              <Readout
                label="Праг"
                value={EXAM_PASS_POINTS}
                sub="точки за успех"
                tone="accent"
              />
              <Readout label="Време" value={`${examMinutes}:00`} sub="минути" />
            </Panel>

            <div>
              <h3 className="font-display text-lg font-extrabold tracking-tight">
                Оценяването на кормуването — също
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Симулаторът брои грешките по официалната скала: опасна е 10
                точки, основна 3, второстепенна 1. Изпитът е издържан при най-много
                9 точки общо, от които най-много 6 от основни, и нито една опасна.
              </p>
              <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
                {[
                  { label: "Опасна", value: "10", toneClass: "text-danger" },
                  { label: "Основна", value: "3", toneClass: "text-warning" },
                  { label: "Второстепенна", value: "1", toneClass: "text-muted" },
                ].map(({ label, value, toneClass }) => (
                  <div key={label} className="flex items-baseline gap-2">
                    <dt className="hud-label">{label}</dt>
                    <dd className={`font-mono text-xl font-bold tabular-nums ${toneClass}`}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <div>
              <h3 className="font-display text-lg font-extrabold tracking-tight">
                Всеки отговор сочи към закона
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Всичките{" "}
                <span className="font-mono font-bold text-foreground">
                  {questionCount.toLocaleString("bg-BG")}
                </span>{" "}
                въпроса в банката носят препратка към конкретния член, на който
                стъпва отговорът. Въпросите са авторски — не са преснимани
                листовки. AI учителят няма право да съчинява правни твърдения:
                той намира текста и го цитира.
              </p>
            </div>

            {/* Real product content, quoted. The examiner rubric is the most
                reassuring thing the bank holds for a parent, and it is much
                more persuasive than any sentence written for this page. */}
            <figure className="border-l-2 border-accent/50 pl-5">
              <blockquote className="text-sm leading-relaxed text-muted">
                {FEATURED_DEBRIEF.examinerBg}
              </blockquote>
              {/* The law reference is deliberately OUTSIDE `.hud-label`: that
                  class uppercases, and „ЗДвП“ is a fixed abbreviation whose
                  lowercase „в“ is part of its spelling — uppercasing it prints
                  „ЗДВП“, which is simply the wrong citation. */}
              <figcaption className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="hud-label">Из урока „Пешеходна пътека“</span>
                <span aria-hidden className="text-border-strong">
                  ·
                </span>
                <span className="font-mono text-xs font-bold text-accent-2">
                  {FEATURED_DEBRIEF.lawRef}
                </span>
              </figcaption>
            </figure>

            {/* The honesty paragraph. It is not a disclaimer bolted on — it is
                the reason to believe the numbers above, and it is the one
                thing on this page a competitor cannot copy without lying. */}
            <Panel tone="solid" className="p-6">
              <p className="hud-label !text-accent-2">Честно за етапа</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Продуктът е нов и още няма випуск, който да е държал изпит с
                него. Затова тук няма проценти на успеваемост, няма отзиви и
                няма лога на „партньори“. Има формат, източник и цена — и
                безплатен достъп, с който да проверите останалото сами.
              </p>
            </Panel>
          </div>
        </Reveal>
      </section>

      {/* ── 4 · SCHOOLS ──────────────────────────────────────────────
          A door, not a pitch. Strategy doc 02 is explicit that B2B is
          opportunistic and not a dependency, and there is no instructor
          portal to advertise yet — so this band says what genuinely exists
          today and sends the conversation to its own page. */}
      <section
        aria-labelledby="schools-title"
        className="border-t border-border bg-surface/40"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <Reveal className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="hud-label !text-accent-2">За автошколи</p>
              <h2
                id="schools-title"
                className="mt-3 text-balance font-display text-2xl font-black tracking-tight sm:text-3xl"
              >
                Ученикът идва на кормуване с изкарани грешки.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Всяко упражнение и всеки пробен изпит оставят следа: кои
                понятия куцат, кои грешки се повтарят, готов ли е за явяване.
                Търсим няколко школи, с които да направим това видимо и за
                инструктора.
              </p>
            </div>

            <Link
              href="/za-avtoshkoli"
              className="btn-ghost shrink-0 px-6 py-3 text-base"
            >
              Какво предлагаме на школите
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── 5 · CLOSE ────────────────────────────────────────────────
          One call to action, and the honest version of what "free" means
          (the simulator is in the larger pack — /pricing says so, and this
          page must not contradict it). */}
      <section aria-labelledby="close-title" className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2
            id="close-title"
            className="text-balance font-display text-3xl font-black tracking-tight sm:text-4xl"
          >
            Виж къде си, преди изпитът да ти го каже.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-muted sm:text-base">
            Регистрацията отнема минута. Безплатно и завинаги: дневна порция
            въпроси с разбор, един пробен изпит и няколко въпроса към AI
            учителя.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/register" className="btn-accent px-8 py-4 text-base">
              Започни безплатно
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
