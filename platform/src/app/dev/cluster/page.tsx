import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Panel } from "@/components/ui/Panel";
import { Readout } from "@/components/ui/Readout";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "Cluster · вътрешно",
  robots: { index: false, follow: false },
};

/**
 * Cluster foundation showcase — DEV route (404s in production).
 *
 * Doc 66 R0: look before you ship. This is the only surface where the dark
 * token ramp and every depth/motion primitive appear together, so a change
 * to globals.css can be EYEBALLED — contrast, elevation ladder, glass over
 * haze, stagger timing — instead of being reasoned about. It is not a page
 * design and nothing here is marketing copy; the landing rebuild happens
 * separately and consumes these primitives.
 *
 * It also proves the scope claim: the wrapper below is the ONLY thing that
 * makes this page dark, and it stays dark with the OS set to light mode.
 */
export default function ClusterFoundationPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div data-surface="cluster" className="relative min-h-dvh bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 haze" />
      <div aria-hidden className="pointer-events-none fixed inset-0 hud-grid-fade opacity-60" />

      <div className="relative mx-auto w-full max-w-5xl px-6 py-16">
        <header className="enter" style={{ ["--enter-i" as string]: 0 }}>
          <p className="hud-label">Cluster foundation</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight">
            Тъмната идентичност
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Токените и примитивите, върху които стъпва целият публичен сайт.
            Тази страница съществува само за да се ГЛЕДА.
          </p>
        </header>

        <div className="rule my-10" />

        {/* Elevation ladder — the three tones side by side. */}
        <section className="grid gap-4 sm:grid-cols-3">
          {(["solid", "glass", "inset"] as const).map((tone, i) => (
            <Panel
              key={tone}
              tone={tone}
              corners={tone === "glass"}
              lift
              className="enter p-5"
              // One shared step makes three panels read as a single move.
              style={{ ["--enter-i" as string]: i + 1 }}
            >
              <Readout label={`tone · ${tone}`} value={`0${i + 1}`} sub="depth ladder" />
            </Panel>
          ))}
        </section>

        {/* Telemetry voice at all three sizes and tones. */}
        <Panel tone="solid" className="mt-6 grid gap-6 p-6 sm:grid-cols-3">
          <Readout label="Формат" value="45 · 97 · 40" sub="въпроса · точки · мин" size="sm" />
          <Readout label="Банка" value="1 200" sub="въпроса" tone="accent" size="md" />
          <Readout label="Симулатор" value="18 396" sub="варианта" tone="cyan" size="lg" />
        </Panel>

        {/* Legacy classes must still render correctly inside the scope. */}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button className="btn-accent">Основно действие</button>
          <button className="btn-ghost">Второстепенно</button>
          <button className="btn-ghost" disabled>
            Изключено
          </button>
          <span className="pulse-soft rounded-full bg-accent-2/15 px-3 py-1 text-xs text-accent-2">
            на живо
          </span>
        </div>
        <div className="card mt-4 p-4 text-sm text-muted">
          Наследен <code className="font-mono text-accent">.card</code> — 538 употреби в
          приложението трябва да изглеждат така вътре в обхвата.
        </div>

        {/* ------------------------------------------------------------------
            THE INTERIOR LAYER (globals.css §THE INTERIOR).

            Doc 83 §10's rule, applied to the second half of the system: the
            elevation ladder and the stagger were judgements a screenshot
            settles and a diff does not, and so are a bezel, a head rule and a
            tick strip. Everything the authenticated app now leans on appears
            here once, at the size it is actually used, so a change to the
            class layer can be LOOKED at instead of reasoned about.
            ------------------------------------------------------------------ */}
        <div className="rule my-10" />

        <header className="mb-5">
          <p className="hud-label">Интериор · класове</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold">
            Слоят, който носи приложението
          </h2>
          <div aria-hidden className="graticule mt-3 max-w-64" />
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* The head + bezel + framing corners, at panel scale. */}
          <section className="card framed p-5 [--panel-pad:1.25rem]">
            <div className="panel-head panel-head-bleed">
              <h3 className="font-display text-base font-extrabold">.panel-head</h3>
              <span className="hud-label">Канал</span>
            </div>
            <p className="text-sm text-muted">
              Заглавие вляво, телеметричен надпис вдясно, косъм през цялата
              ширина на панела и къс светнат щрих там, където започва скалата.
            </p>
          </section>

          {/* The recessed well + the numeral voice. */}
          <section className="card p-5">
            <div className="panel-head">
              <h3 className="font-display text-base font-extrabold">.panel-inset · .metric</h3>
              <span className="hud-label">Скала</span>
            </div>
            <dl className="grid grid-cols-3 gap-3">
              {[
                ["45", "въпроса"],
                ["97", "точки"],
                ["40:00", "време"],
              ].map(([v, l]) => (
                <div key={l} className="panel-inset flex flex-col-reverse gap-1 px-2 py-3 text-center">
                  <dt className="hud-label">{l}</dt>
                  <dd className="metric text-xl text-accent">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* Tracks: a channel cut INTO the panel, never a lighter rectangle. */}
        <section className="card mt-4 p-5">
          <div className="panel-head">
            <h3 className="font-display text-base font-extrabold">.track</h3>
            <span className="hud-label">Напредък</span>
          </div>
          <div className="flex flex-col gap-3">
            {[18, 54, 92].map((pct) => (
              <div key={pct} className="flex items-center gap-3">
                <span className="metric w-10 shrink-0 text-xs text-muted">{pct}%</span>
                <div className="track h-2.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 shadow-glow-sm"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Buttons, in every state that has its own physics. */}
        <section className="card mt-4 p-5">
          <div className="panel-head">
            <h3 className="font-display text-base font-extrabold">Клавиши</h3>
            <span className="hud-label">Състояния</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-accent">Основен</button>
            <button className="btn-accent" disabled>
              Изключен
            </button>
            <button className="btn-ghost">Вторичен</button>
            <button className="btn-ghost" disabled>
              Изключен
            </button>
            <span className="nav-live inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-accent">
              .nav-live
            </span>
          </div>
          <p className="mt-3 text-xs text-muted">
            Основният клавиш лови светлината по короната си; натискането я
            ГАСИ, преди каквото и да е движение. Вторичният е хлътнал — той е
            този, който трябва да потърсиш.
          </p>
        </section>

        {/* The console slab the shell is built from. */}
        <section className="console console-bottom mt-4 rounded-xl p-5">
          <div className="panel-head">
            <h3 className="font-display text-base font-extrabold">.console</h3>
            <span className="hud-label">Шаси</span>
          </div>
          <p className="text-sm text-muted">
            Плочата, от която е направен страничният панел: светлина по ръба,
            обърнат към купето, и къса сянка върху палубата до него.
          </p>
        </section>

        {/* Scroll-linked reveal — deliberately far down the page. */}
        <div style={{ height: "70vh" }} />
        <Reveal className="mt-6">
          <Panel tone="glass" className="p-8">
            <Readout label="Reveal" value="scroll-linked" sub="IntersectionObserver, unobserved after firing" />
          </Panel>
        </Reveal>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Reveal key={i} delay={i * 70}>
              <Panel className="p-5">
                <Readout label={`stagger +${i * 70}ms`} value={`0${i + 1}`} />
              </Panel>
            </Reveal>
          ))}
        </div>
        <div style={{ height: "30vh" }} />
      </div>
    </div>
  );
}
