import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { HazardHistory } from "@/components/hazard/HazardHistory";
import { HazardSession } from "@/components/hazard/HazardSession";
import type { HazardRunSummary } from "@/components/hazard/types";
import { requireUser } from "@/modules/auth";
import { hasHazardEngine, listHazardRuns } from "@/modules/hazard-play";
import { canOpenHazardDoor } from "./access";
import { HazardPaywall } from "./paywall";

export const metadata: Metadata = {
  title: "Опасности · Книжка.AI",
  description:
    "Тренировка за възприемане на опасности: реагирай в момента, в който опасността започва да се задава — не когато вече е станала.",
};

/** Position in the shared entrance choreography (globals.css §1). */
const step = (i: number) => ({ ["--enter-i" as string]: i }) as CSSProperties;

/** Recent runs shown in the history strip. */
const HISTORY_LIMIT = 6;

/**
 * /hazard — the standalone section. DOOR #2 of the founder's three.
 *
 * WHY THIS PAGE LOOKS DIFFERENT FROM EVERY OTHER DASHBOARD PAGE. Hazard
 * perception is the safety differentiator: it is the only part of the product
 * that is deliberately NOT about passing the ДАИ exam, and the pitch attached
 * to it — „не само вадим книжка, правим те да не се блъснеш" — is the most
 * serious thing the company says. A page that looked like the practice hub with
 * a video on it would read as a mini-game bolted onto exam prep, which is
 * exactly the impression the founder ruled out. So the whole page is one
 * `data-surface="cluster-band"` slab: cockpit ground, telemetry captions,
 * instrument panels — the third pillar, presented like one.
 *
 * "cluster-band" and not "cluster" because this page lives inside the dashboard
 * chrome and a bounded band must not claim the root's colour-scheme; a light
 * dashboard with a dark scrollbar gutter is the tell that a band escaped its box
 * (globals.css §CLUSTER, and /pricing does the same thing for the same reason).
 *
 * WHAT THE SERVER DOES HERE AND WHAT IT REFUSES TO DO. It resolves the user,
 * asks the ONE access question, and — only if the answer is yes — reads the
 * student's own finished runs. It deals nothing: a run starts from a user
 * gesture, through the server action, which re-checks the same gate. Nothing
 * about an item, a clip or a window is on this page.
 */
export default async function HazardPage() {
  const user = await requireUser();

  if (!(await canOpenHazardDoor(user, "section"))) {
    return <HazardPaywall />;
  }

  // The item engine is registered at wiring time (@/modules/hazard-play
  // index.ts). Until the bank exists this is false, and the section says so
  // rather than offering a button that throws — there is deliberately no
  // placeholder engine, because a placeholder would have to invent the scoring
  // window the whole safety claim rests on.
  const ready = hasHazardEngine();

  let history: HazardRunSummary[] = [];
  if (ready) {
    try {
      history = await listHazardRuns(user.id, HISTORY_LIMIT);
    } catch (err) {
      // No store yet / a fresh checkout: the section is still fully usable, it
      // just cannot show a past it does not have.
      console.warn("hazard: listHazardRuns failed, rendering without history", err);
    }
  }

  return (
    <div
      data-surface="cluster-band"
      className="grain relative overflow-hidden rounded-2xl border border-border bg-background px-5 py-7 text-foreground sm:px-8 sm:py-9"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 hud-grid-fade" />
      <div aria-hidden className="pointer-events-none absolute inset-0 haze" />

      <div className="relative flex flex-col gap-8">
        <header style={step(0)} className="enter max-w-2xl">
          <p className="hud-label text-accent-2">Възприемане на опасности</p>
          <h1 className="mt-1.5 font-display text-2xl font-black tracking-tight sm:text-3xl">
            Виж опасността, докато още се задава
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Не е част от изпита на ДАИ и няма да ти донесе точка на теорията. Но
            е единственото нещо в обучението на нови шофьори, за което има
            сериозни доказателства, че намалява катастрофите през първата година
            зад волана. Затова го има.
          </p>
        </header>

        <div style={step(1)} className="enter">
          {ready ? (
            <HazardSession door="section" startLabelBg="Започни тренировка">
              <HowItWorks />
            </HazardSession>
          ) : (
            <NotReadyYet />
          )}
        </div>

        {ready ? (
          <section
            style={step(2)}
            aria-labelledby="hz-history-title"
            className="enter border-t border-border pt-6"
          >
            <h2 id="hz-history-title" className="hud-label">
              Твоите последни тренировки
            </h2>
            <div className="mt-3">
              <HazardHistory runs={history} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The instructions. A server-rendered child of the client runner, so the idle
 * state costs no extra JavaScript — the runner shows it until a run starts and
 * then replaces it with the stage.
 */
function HowItWorks() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="grid gap-3 sm:grid-cols-3">
        <Beat
          n="01"
          titleBg="Гледаш"
          bodyBg="Кратък запис от реално каране. Без превъртане — както на пътя."
        />
        <Beat
          n="02"
          titleBg="Натискаш"
          bodyBg="В момента, в който видиш, че се задава опасност. Навсякъде по видеото или с интервал."
        />
        <Beat
          n="03"
          titleBg="Научаваш"
          bodyBg="Къде беше признакът, колко преднина си си дал и какво казва законът."
        />
      </ol>
      <p className="text-xs text-muted">
        Няма „скъсан“ резултат. Числото, което гледаме, е с колко секунди
        изпреварваш опасността — и то расте с тренировка.
      </p>
    </div>
  );
}

function Beat({ n, titleBg, bodyBg }: { n: string; titleBg: string; bodyBg: string }) {
  return (
    <li className="panel rounded-xl p-4">
      <p className="hud-label text-accent-2">{n}</p>
      <h3 className="mt-1 text-sm font-extrabold">{titleBg}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">{bodyBg}</p>
    </li>
  );
}

/**
 * The honest empty state.
 *
 * It says what is missing and offers somewhere to go. It does NOT offer a demo
 * clip or a sample score: a fabricated reaction window is a fabricated safety
 * measurement, and a fabricated corrective would be law text nobody authored
 * (ADR-002).
 */
function NotReadyYet() {
  return (
    <div className="panel rounded-2xl p-5 sm:p-6">
      <p className="hud-label text-accent-2">Подготвя се</p>
      <h2 className="mt-1.5 text-base font-extrabold">
        Клиповете още се произвеждат
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Всеки клип идва от реално записано каране и се проверява от човек преди
        да влезе тук. Не пускаме измислени ситуации — предпочитаме да изчакаш.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/simulator" className="btn-accent">
          Карай в симулатора
        </Link>
        <Link href="/theory" className="btn-ghost">
          Към теорията
        </Link>
      </div>
    </div>
  );
}
