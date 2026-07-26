import { notFound } from "next/navigation";
import { LiveHero } from "@/components/marketing";

/**
 * Marketing hero rig — DEV BUILDS ONLY (404s in production, the dev-surface
 * convention this folder follows).
 *
 * Exists for the doc-66 R0 rule: look before you ship. The hero has two
 * visual states no test can judge — the drawn plate every phone gets, and the
 * live scene a desktop gets — and the only honest way to sign either off is to
 * open it. There is deliberately NO "force the plate" prop here: the fallback
 * is chosen by real device signals (heroCapability.ts), so it is exercised the
 * way a visitor triggers it — narrow the window, or turn on reduced motion.
 * A prop would be a second, untested door into the same decision.
 */
export default function HeroPreviewDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-dvh bg-background">
      <LiveHero>
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="max-w-xl">
            <p className="hud-label !text-accent-2">За кандидат-шофьори в България</p>
            <h1 className="mt-4 text-balance font-display text-5xl font-black leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
              Вземи книжка. С <span className="text-accent">AI учител</span> до теб.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Учи теорията като игра и карай в симулатора още преди първия си час
              зад волана.
            </p>
          </div>
        </div>
      </LiveHero>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <p className="hud-label">
          Долу вляво в DOM: data-hero-mode / data-hero-decline на слоя със сцената.
        </p>
      </section>
    </main>
  );
}
