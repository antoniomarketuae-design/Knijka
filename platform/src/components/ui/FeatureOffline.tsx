import Link from "next/link";
import { FEATURE_OFFLINE_COPY_BG, type KillableFeature } from "@/lib/features";

/**
 * The screen behind the DISABLED_FEATURES kill switch (src/lib/features.ts).
 *
 * ONE component for all three features because the sentence is the same
 * sentence: we turned it off, it is not you, your access is intact, come back.
 * A per-feature screen would drift, and the one that drifted would be the one
 * shown on the day it mattered.
 *
 * It is NOT the paywall. A student who paid €21.99 for the simulator and is
 * shown "buy a pack" because we switched the simulator off is a refund and a
 * one-star review, and the two screens are one `if` apart in every guard — so
 * the copy here never mentions a price, a pack or /pricing.
 */
export function FeatureOffline({ feature }: { feature: KillableFeature }) {
  const copy = FEATURE_OFFLINE_COPY_BG[feature];

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
      <div className="card framed p-8 text-center sm:p-10">
        <p className="hud-label">Състояние · временно изключено</p>
        <p className="mt-4 text-4xl" aria-hidden>
          🔧
        </p>
        <h1 className="mt-4 font-display text-2xl font-black">{copy.title}</h1>
        <div aria-hidden className="graticule mx-auto mt-4 w-40" />
        <p className="mt-4 text-sm leading-relaxed text-muted">{copy.body}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
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
