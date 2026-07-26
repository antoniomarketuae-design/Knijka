import type { Metadata } from "next";
import Link from "next/link";
import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import { Panel } from "@/components/ui/Panel";
import { Readout } from "@/components/ui/Readout";
import { Reveal } from "@/components/ui/Reveal";
import {
  EXAM_MAX_POINTS,
  EXAM_PASS_POINTS,
  EXAM_QUESTION_COUNT,
} from "@/modules/exam/types";
import { IconArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "За автошколи — Книжка.AI",
  description:
    "Какво вижда автошколата: следа от всяко упражнение и пробен изпит, готовност на ученика преди явяване, оценяване по официалната скала. Търсим партньорски школи за пилот.",
};

/**
 * The driving-school door.
 *
 * WHY IT IS A SEPARATE PAGE AND NOT A LANDING SECTION. Doc 02 is explicit
 * that B2B is opportunistic and not a dependency — "schools come to us once
 * students ask for it". A full B2B pitch on the landing page would spend the
 * seventeen-year-old's attention on an audience that is not buying yet; a
 * band plus this page costs the landing four lines and gives the school
 * everything.
 *
 * WHY IT PROMISES SO LITTLE. There is no instructor portal, no cohort
 * dashboard and no per-student licensing flow in the product today. So this
 * page separates, in as many words, what a school gets NOW (what the student
 * already generates) from what a pilot partner would be helping us build. A
 * B2B page that describes an unbuilt portal is how a pilot conversation dies
 * in the first demo.
 */

const NOW = [
  {
    titleBg: "Ученик, който вече е сгрешил на сухо",
    textBg:
      "Преди първия час зад волана ученикът е минал през пешеходни пътеки, кръстовища с предимство, кръгови и изпреварване — в симулатор, където грешката е безплатна. Часът с инструктор започва от по-нагоре.",
  },
  {
    titleBg: "Общ език за грешките",
    textBg:
      "Оценяваме по същата скала като изпита: опасна 10, основна 3, второстепенна 1. Когато ученикът каже „взех опасна на зебрата“, инструкторът знае точно какво е станало.",
  },
  {
    titleBg: "Теория, която сочи към закона",
    textBg:
      "Всеки въпрос носи препратка към конкретния член. Спорът „кой е прав“ приключва с отваряне на текста, а не с авторитет.",
  },
];

const PILOT = [
  {
    titleBg: "Изглед към випуска",
    textBg:
      "Кои ученици са готови за явяване и кои не, по теми и по повтарящи се грешки, вместо по усещане.",
  },
  {
    titleBg: "Достъп за инструктора",
    textBg:
      "Профил, от който се виждат резултатите на собствените ученици — с тяхното съгласие и в рамките на GDPR (учениците ни са непълнолетни).",
  },
  {
    titleBg: "Цена на ученик",
    textBg:
      "Пакет за школа вместо индивидуални покупки. Условията за първите партньори договаряме поименно.",
  },
];

export default function SchoolsPage() {
  const repo = getContentRepo();
  const questionCount = repo.questions().length;

  return (
    <>
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <p className="enter hud-label !text-accent-2" style={{ ["--enter-i" as string]: 0 }}>
            За автошколи
          </p>
          <h1
            className="enter mt-4 max-w-3xl text-balance font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            style={{ ["--enter-i" as string]: 1 }}
          >
            Часовете зад волана са скъпи. Грешките — не, ако станат преди тях.
          </h1>
          <p
            className="enter mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
            style={{ ["--enter-i" as string]: 2 }}
          >
            Книжка.AI подготвя ученика за теорията и го пуска да кара в
            браузъра, преди да седне до инструктора. Не заместваме нито един
            учебен час — сваляме от него зубренето и първите десет наивни грешки.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="now-title"
        className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6"
      >
        <Reveal>
          <h2
            id="now-title"
            className="font-display text-2xl font-black tracking-tight sm:text-3xl"
          >
            Какво получавате още днес
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Това работи в момента, без да подписваме нищо — стига учениците ви
            да си направят профил.
          </p>
        </Reveal>

        <Reveal delay={70}>
          <ol className="mt-8 flex flex-col">
            {NOW.map(({ titleBg, textBg }, index) => (
              <li
                key={titleBg}
                className="flex gap-5 border-b border-border py-6 first:pt-0 last:border-b-0"
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
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                    {textBg}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={140}>
          <Panel tone="inset" className="mt-10 grid grid-cols-2 gap-y-7 px-6 py-7 sm:grid-cols-4">
            <Readout
              label="Формат"
              value={`${EXAM_QUESTION_COUNT} · ${EXAM_MAX_POINTS}`}
              sub="въпроса · точки"
              size="sm"
            />
            <Readout label="Праг" value={EXAM_PASS_POINTS} sub="точки" size="sm" />
            <Readout
              label="Банка"
              value={questionCount.toLocaleString("bg-BG")}
              sub="авторски въпроса"
              size="sm"
            />
            <Readout
              label="Скала"
              value="10 · 3 · 1"
              sub="опасна · основна · второстепенна"
              size="sm"
              tone="cyan"
            />
          </Panel>
        </Reveal>
      </section>

      <section
        aria-labelledby="pilot-title"
        className="border-y border-border bg-surface/40"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <Reveal>
            <p className="hud-label">Пилот</p>
            <h2
              id="pilot-title"
              className="mt-3 font-display text-2xl font-black tracking-tight sm:text-3xl"
            >
              Какво строим заедно с първите школи
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Долното още го няма. Пишем го тук, защото търсим няколко школи,
              които да го оформят с нас — не защото се продава днес.
            </p>
          </Reveal>

          <Reveal delay={70}>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {PILOT.map(({ titleBg, textBg }) => (
                <Panel as="li" key={titleBg} tone="solid" className="flex flex-col gap-2 p-6">
                  <h3 className="font-display text-base font-extrabold tracking-tight">
                    {titleBg}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted">{textBg}</p>
                </Panel>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section
        aria-labelledby="talk-title"
        className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6"
      >
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2
            id="talk-title"
            className="text-balance font-display text-2xl font-black tracking-tight sm:text-3xl"
          >
            Ако това ви звучи полезно, пишете ни.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted">
            Отговаряме лично — проектът е малък и това е предимство, докато е
            вярно.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/contact" className="btn-accent px-7 py-3.5 text-base">
              Свържете се с нас
              <IconArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/" className="btn-ghost px-7 py-3.5 text-base">
              Виж продукта
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
