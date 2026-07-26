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
